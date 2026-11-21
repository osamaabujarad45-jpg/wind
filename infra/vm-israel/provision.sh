#!/bin/bash
# Provision the Wind production VM (Ubuntu 24.04) the way docs/operations/deploy.md describes the host: Node 24 in /opt/node,
# the API under systemd on 127.0.0.1:4000, Caddy for TLS, SQLite at /data/wind.db, daily backups. Idempotent.
# Hardening over the student host: the API runs as the unprivileged user `wind`, not root.
set -euo pipefail
HOST=${1:?public host name, e.g. 20.217.202.98.sslip.io}
NODE_VERSION=24.12.0
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q curl ca-certificates debian-keyring debian-archive-keyring apt-transport-https gnupg unattended-upgrades xz-utils

# Node 24 (same major as the gate), checked against the published checksum.
if [ ! -x /opt/node/bin/node ] || [ "$(/opt/node/bin/node -v)" != "v$NODE_VERSION" ]; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  grep " node-v$NODE_VERSION-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  rm -rf /opt/node-new && mkdir -p /opt/node-new
  tar -xJf "node-v$NODE_VERSION-linux-x64.tar.xz" -C /opt/node-new --strip-components=1
  rm -rf /opt/node && mv /opt/node-new /opt/node
fi
/opt/node/bin/node -v

# Caddy from its official repository.
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

id wind >/dev/null 2>&1 || useradd --system --home /data --shell /usr/sbin/nologin wind
mkdir -p /data /data/backups /opt/windapi
chown -R wind:wind /data && chmod 750 /data

# Service environment (root-only file; the unit loads it).
if [ ! -f /etc/wind-api.env ]; then
  umask 077
  cat > /etc/wind-api.env <<EOF
SUPPORT_CONTACT=+972597127547
WIND_PUSH_SUBJECT=https://$HOST
WIND_TRUST_PROXY=1
WIND_IDENTITY_MODE=self-service
WIND_ENABLED_SERVICES=parcel
WIND_DRIVER_PRESENCE=off
WEB_ROOT=/opt/windapi/web
EOF
fi

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
Description=Wind daily database backup

[Service]
Type=oneshot
User=wind
Group=wind
ExecStart=/opt/windapi/backup.sh
EOF

cat > /etc/systemd/system/wind-backup.timer <<'EOF'
[Unit]
Description=Wind daily database backup at 00:00 UTC

[Timer]
OnCalendar=*-*-* 00:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  encode zstd gzip
  reverse_proxy 127.0.0.1:4000
}
EOF

systemctl daemon-reload
systemctl enable --now caddy >/dev/null
systemctl reload caddy || systemctl restart caddy
systemctl enable --now wind-backup.timer >/dev/null
echo "provisioned for $HOST"
