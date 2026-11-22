#!/bin/bash
# Provision the Wind production VM (Ubuntu 24.04) the way docs/operations/deploy.md describes the host: Node 24 in /opt/node,
# the API under systemd on 127.0.0.1:4000, Caddy for TLS, SQLite at /data/wind.db, hourly backups, and West Bank road routing
# (OSRM in Docker on 127.0.0.1:5000) once a graph has been built into /srv/osrm. Idempotent.
# Hardening over the student host: the API runs as the unprivileged user `wind`, not root.
set -euo pipefail
HOST=${1:?public host name, e.g. 20.217.202.98.sslip.io}
BACKUP_ACCOUNT=${2:-}   # private Azure Blob account for the off-host backup copy (deploy.md)
# Azure's storage account naming rule, checked before the name is written anywhere (Sol recheck L5).
[ -z "$BACKUP_ACCOUNT" ] || [[ "$BACKUP_ACCOUNT" =~ ^[a-z0-9]{3,24}$ ]] || { echo "invalid storage account name: $BACKUP_ACCOUNT" >&2; exit 1; }
NODE_VERSION=24.12.0
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q curl ca-certificates debian-keyring debian-archive-keyring apt-transport-https gnupg unattended-upgrades xz-utils

# Node 24 (same major as the gate), checked against the published checksum.
if [ ! -x /opt/node/bin/node ] || [ "$(/opt/node/bin/node -v)" != "v$NODE_VERSION" ]; then
  # A private root-owned directory, never predictable /tmp names (Haiku PR #98 N-4).
  DL=$(mktemp -d); trap 'rm -rf "$DL"' EXIT
  cd "$DL"
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  grep " node-v$NODE_VERSION-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  rm -rf /opt/node-new && mkdir -p /opt/node-new
  tar -xJf "node-v$NODE_VERSION-linux-x64.tar.xz" -C /opt/node-new --strip-components=1
  rm -rf /opt/node && mv /opt/node-new /opt/node
  cd /
fi
/opt/node/bin/node -v

# Caddy from its official repository.
if ! command -v caddy >/dev/null; then
  # Staged, then installed in one rename, so an interrupted run can simply be repeated (Sol ops review 21 Nov).
  KEY=$(mktemp); curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o "$KEY"
  install -m 644 "$KEY" /usr/share/keyrings/caddy-stable-archive-keyring.gpg; rm -f "$KEY"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

id wind >/dev/null 2>&1 || useradd --system --home /data --shell /usr/sbin/nologin wind
# /opt/windapi is install-release.sh's symlink to the active release under /opt/wind-releases; provisioning never creates it.
mkdir -p /data /data/backups
chown -R wind:wind /data && chmod 750 /data
[ ! -s /data/wind.db ] || sudo -u wind touch -- /data/.wind-db-expected # as wind: never through a path wind controls

# Service environment (root-only file; the unit loads it).
if [ ! -f /etc/wind-api.env ]; then
  ( umask 077   # only this file is root-only; the Caddyfile below must stay readable by caddy
  cat > /etc/wind-api.env <<EOF
SUPPORT_CONTACT=+972597127547
WIND_PUSH_SUBJECT=https://$HOST
WIND_TRUST_PROXY=1
WIND_IDENTITY_MODE=self-service
WIND_ENABLED_SERVICES=parcel
WIND_DRIVER_PRESENCE=off
WEB_ROOT=/opt/windapi/web
EOF
  )
fi
# The off-host backup target (no secret: the VM's managed identity authenticates).
if [ -n "$BACKUP_ACCOUNT" ]; then printf 'WIND_BACKUP_ACCOUNT=%s\nWIND_BACKUP_CONTAINER=wind-backups\n' "$BACKUP_ACCOUNT" > /etc/wind-backup.env; chmod 644 /etc/wind-backup.env; fi

cat > /etc/systemd/system/wind-api.service <<'EOF'
[Unit]
Description=Wind API
After=network-online.target
Wants=network-online.target

[Service]
User=wind
Group=wind
WorkingDirectory=/opt/windapi
Environment=NODE_ENV=production PORT=4000 HOST=127.0.0.1 DB_PATH=/data/wind.db TZ=Asia/Hebron
EnvironmentFile=/etc/wind-api.env
# A host that has had a database never starts on a fresh empty one: after a crash between renames the API stays down until the
# database is put back (install-release.sh and restore.sh write the marker; Sol recheck 3 of PR #101).
ExecStartPre=/bin/sh -c 'if [ -e /data/.wind-db-expected ] && [ ! -s /data/wind.db ]; then echo "Wind: /data/wind.db is missing; restore it (docs/operations/deploy.md)" >&2; exit 1; fi'
ExecStart=/opt/node/bin/node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning server/main.ts
Restart=always
RestartSec=3
# A graph build beside it (osmium, up to 2 GiB) is killed before the API under memory pressure (Haiku PR #104 L3).
OOMScoreAdjust=-500
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/data
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/wind-backup.service <<'EOF'
[Unit]
Description=Wind hourly database backup
# The upload needs the network (Sol recheck L6).
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=wind
Group=wind
EnvironmentFile=-/etc/wind-backup.env
ExecStart=/opt/windapi/backup.sh
# The API's confinement: the job's only persistent writes are under /data (Sol ops review 21 Nov).
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/data
ProtectHome=true
PrivateTmp=true
EOF

cat > /etc/systemd/system/wind-backup.timer <<'EOF'
[Unit]
Description=Wind database backup every hour, on the hour (UTC)

[Timer]
OnCalendar=*-*-* *:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF
# Loaded at once, so a later failure (the Caddy check below) cannot leave the hourly unit on disk with systemd still on the old
# schedule. Then admins are told about a broken backup after 3 hours, not a day. The key is added to an existing file too, on a
# line of its own. A value that is not a whole number of hours from 1 to 336 (empty included), which the API would refuse at
# start, is replaced; a valid one the operator chose is kept (Haiku PR #103 L3, L4, L6; recheck 4).
systemctl daemon-reload
if ! grep '^WIND_BACKUP_MAX_AGE_HOURS=' /etc/wind-api.env | tail -n1 | grep -qE '^WIND_BACKUP_MAX_AGE_HOURS=([1-9]|[1-9][0-9]|[12][0-9][0-9]|3[0-2][0-9]|33[0-6])$'; then
  sed -i '/^WIND_BACKUP_MAX_AGE_HOURS=/d' /etc/wind-api.env
  [ ! -s /etc/wind-api.env ] || [ -z "$(tail -c1 /etc/wind-api.env)" ] || echo >> /etc/wind-api.env
  echo 'WIND_BACKUP_MAX_AGE_HOURS=3' >> /etc/wind-api.env
fi

# Validated before it replaces the working configuration; a bad one leaves Caddy as it was (Sol ops review 21 Nov).
CADDY_NEW=$(mktemp /etc/caddy/Caddyfile.new.XXXXXX)
cat > "$CADDY_NEW" <<EOF
$HOST {
  encode zstd gzip
  reverse_proxy 127.0.0.1:4000
}
EOF
chmod 644 "$CADDY_NEW"
caddy validate --adapter caddyfile --config "$CADDY_NEW" >/dev/null || { echo "invalid Caddyfile; the current one is kept" >&2; rm -f "$CADDY_NEW"; exit 1; }
mv -f "$CADDY_NEW" /etc/caddy/Caddyfile

# The ingress hold (install-release.sh, restore.sh): while /etc/wind-ingress-hold exists Caddy does not start, at boot too.
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/wind-hold.conf <<'EOF'
[Service]
ExecStartPre=/bin/sh -c 'if [ -e /etc/wind-ingress-hold ]; then echo "Wind ingress hold: $(cat /etc/wind-ingress-hold)" >&2; exit 1; fi'
EOF

systemctl daemon-reload
systemctl enable --now caddy >/dev/null
systemctl reload caddy
systemctl enable --now wind-backup.timer >/dev/null
# Enabled so a reboot brings the API back; started by install-release.sh once a release is in /opt/windapi (Haiku PR #98 H-1).
systemctl enable wind-api >/dev/null

# Road routing (SPEC-routing-eta.md). Last, so a Docker failure can never stop the Caddy, backup and API steps above (Haiku PR #104
# M1). The graph is built beside the live one with infra/osrm/build-west-bank.sh and promoted by pointing the /srv/osrm link at it
# (docs/operations/deploy.md). The container listens on loopback only, read-only, unprivileged, with the image pinned to the digest
# the build used, and memory capped so the API keeps its RAM on this 4 GiB VM. Without a graph the unit does not start and the API
# is not pointed at it, so it keeps its marked straight-line estimates; with one, an OSRM outage still falls back to them within
# OSRM_TIMEOUT_MS (3 s). A re-run restarts it only when the unit or the promoted graph changed, or it is down, so quotes do not
# fall back to estimates for no reason (L4).
# Docker runs only the road-routing container and the graph build (infra/osrm/build-west-bank.sh); Ubuntu's own package, here so
# a failed install leaves routing off and nothing else (Haiku PR #104 recheck M-1).
command -v docker >/dev/null || apt-get install -y -q docker.io || echo "docker.io did not install: routing stays off" >&2
OSRM_NEW=$(mktemp)
cat > "$OSRM_NEW" <<'EOF'
[Unit]
Description=Wind road routing (OSRM, West Bank graph in /srv/osrm)
After=docker.service
Requires=docker.service
ConditionPathExists=/srv/osrm/BUILD-MANIFEST
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
ExecStartPre=-/usr/bin/docker rm -f wind-osrm
ExecStart=/usr/bin/docker run --rm --name wind-osrm --read-only --user 65534:65534 --cap-drop=ALL --security-opt no-new-privileges --pids-limit 256 --memory=1g --memory-swap=1g -p 127.0.0.1:5000:5000 -v /srv/osrm/:/data:ro ghcr.io/project-osrm/osrm-backend@sha256:ef49d1a83c0aa0707aad2338127f96f39af78374bb6c1b3ffa07cf13b92ac572 osrm-routed --algorithm mld --max-table-size 100 /data/region.osrm
ExecStop=/usr/bin/docker stop wind-osrm
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
OSRM_CHANGED=0
cmp -s "$OSRM_NEW" /etc/systemd/system/wind-osrm.service || { install -m 644 "$OSRM_NEW" /etc/systemd/system/wind-osrm.service; OSRM_CHANGED=1; }
rm -f "$OSRM_NEW"
systemctl daemon-reload
# A graph counts once its build finished: BUILD-MANIFEST is written only after the route corpus passed (recheck L-7). Its checksum
# names the build, so a rebuild into the same directory is still picked up (L-6).
if [ -e /srv/osrm/BUILD-MANIFEST ] && command -v docker >/dev/null; then
  systemctl enable wind-osrm >/dev/null
  GRAPH=$(sha256sum /srv/osrm/BUILD-MANIFEST | cut -d' ' -f1)
  if [ "$OSRM_CHANGED" = 1 ] || [ "$GRAPH" != "$(cat /etc/wind-osrm.graph 2>/dev/null)" ] || ! systemctl is-active --quiet wind-osrm; then
    systemctl reset-failed wind-osrm 2>/dev/null || true # a crash loop that hit the start limit gets a fresh start (L-4)
    # The unit is up as soon as docker run forks, so the state is recorded only once OSRM answers a route request (L-5).
    if systemctl restart wind-osrm && for i in $(seq 1 30); do curl -fsS -m 2 -o /dev/null 'http://127.0.0.1:5000/nearest/v1/driving/35.2034,31.9038' && break; sleep 1; [ "$i" -lt 30 ] || false; done; then
      echo "$GRAPH" > /etc/wind-osrm.graph
    else echo "wind-osrm is not answering: the API keeps its straight-line estimates (journalctl -u wind-osrm)" >&2; fi
  fi
  if ! grep -q '^OSRM_URL=' /etc/wind-api.env; then
    [ -z "$(tail -c1 /etc/wind-api.env)" ] || echo >> /etc/wind-api.env
    echo 'OSRM_URL=http://127.0.0.1:5000' >> /etc/wind-api.env
    echo "OSRM_URL added: the API uses it from its next start (sudo systemctl restart wind-api)" >&2 # recheck L-8
  fi
else
  echo "no road graph in /srv/osrm yet: routing stays off (see docs/operations/deploy.md, Road routing)" >&2
fi
echo "provisioned for $HOST"
