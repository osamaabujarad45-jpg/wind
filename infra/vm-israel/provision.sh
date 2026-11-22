#!/bin/bash
# Provision the Wind production VM (Ubuntu 24.04) the way docs/operations/deploy.md describes the host: Node 24 in /opt/node,
# the API under systemd on 127.0.0.1:4000, Caddy for TLS, SQLite at /data/wind.db, hourly backups. Idempotent.
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
# Backups run hourly, so admins hear of a broken one after 3 hours instead of a day (added to an existing file too).
grep -q '^WIND_BACKUP_MAX_AGE_HOURS=' /etc/wind-api.env || echo 'WIND_BACKUP_MAX_AGE_HOURS=3' >> /etc/wind-api.env
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
echo "provisioned for $HOST"
