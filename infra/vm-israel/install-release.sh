#!/bin/bash
# Install a release tarball from build-release.sh on the production VM. Run as root: sudo bash install-release.sh <tarball> <sha256>
# Checks the hash, unpacks to /opt/windapi-new, dry-runs it as the service user on :4010 with a throwaway database, then
# moves the current tree to /opt/windapi-old-<time> and starts the new one. Rollback: see docs/operations/deploy.md.
set -euo pipefail
TAR=${1:?release tarball}; SUM=${2:?expected sha256}
echo "$SUM  $TAR" | sha256sum -c -
# Root's scratch space is a fresh private directory, never a predictable /tmp path a release could pre-plant (Haiku PR #98 N-1).
WORK=$(mktemp -d); chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT
rm -rf /opt/windapi-new
tar -xzf "$TAR" -C "$WORK"   # the archive's top-level directory is windapi/
mv "$WORK/windapi" /opt/windapi-new
chown -R root:root /opt/windapi-new && chmod 755 /opt/windapi-new/backup.sh
sudo -u wind test -x /opt/windapi-new/backup.sh || { echo "backup.sh is not executable by wind" >&2; exit 1; }

# The dry run must be the only thing answering on :4010, or the check below would pass against something else.
if curl -fsS -m 2 http://127.0.0.1:4010/api/ready >/dev/null 2>&1; then echo "port 4010 is already in use" >&2; exit 1; fi
DRY=$(mktemp -d); chown wind:wind "$DRY"
set -a; . /etc/wind-api.env; set +a
cd /opt/windapi-new
sudo -u wind -E env NODE_ENV=production PORT=4010 HOST=127.0.0.1 DB_PATH="$DRY/wind.db" TZ=Asia/Hebron WEB_ROOT=/opt/windapi-new/web \
  /opt/node/bin/node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning server/main.ts > "$WORK/dry.log" 2>&1 &
PID=$! # sudo relays the kill to node
cd /
ok=0; for i in $(seq 1 40); do curl -fsS http://127.0.0.1:4010/api/ready > "$WORK/ready.json" 2>/dev/null && { ok=1; break; }; sleep 1; done
kill "$PID" 2>/dev/null || true; sleep 1; rm -rf "$DRY"
[ "$ok" -eq 1 ] || { echo "dry run failed; the live service is untouched" >&2; tail -20 "$WORK/dry.log" >&2; rm -rf /opt/windapi-new; exit 1; }
echo "dry run: $(cat "$WORK/ready.json")"

systemctl stop wind-api 2>/dev/null || true
if [ -d /opt/windapi ] && [ -n "$(ls -A /opt/windapi)" ]; then mv /opt/windapi "/opt/windapi-old-$(date +%Y%m%d%H%M%S)"; else rm -rf /opt/windapi; fi
mv /opt/windapi-new /opt/windapi
systemctl enable --now wind-api >/dev/null
ok=0; for i in $(seq 1 30); do curl -fsS http://127.0.0.1:4000/api/ready > "$WORK/ready.json" 2>/dev/null && { ok=1; break; }; sleep 1; done
[ "$ok" -eq 1 ] || { echo "the new release did not become ready: roll back (deploy.md)" >&2; journalctl -u wind-api -n 20 --no-pager >&2; exit 1; }
echo "live: $(cat "$WORK/ready.json")"
