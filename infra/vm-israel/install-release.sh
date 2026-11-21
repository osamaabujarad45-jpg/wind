#!/bin/bash
# Install a release tarball from build-release.sh on the production VM. Run as root: sudo bash install-release.sh <tarball> <sha256>
# 1. One install at a time (lock). The tarball is hashed and unpacked from one private copy.
# 2. A verified snapshot of the live database, named by time (pre-install-<time>.db), is taken first.
# 3. The candidate is dry-run as the service user on :4010 against a COPY of that snapshot, so its start-up migrations meet real
#    data (Sol ops review 21 Nov, HIGH 3), never the live file.
# 4. The swap keeps the old tree; if the move, the start or readiness fails, the old tree goes back and starts again.
# 5. The three newest old trees are kept. Rollback by hand: docs/operations/deploy.md.
set -euo pipefail
TAR=${1:?release tarball}; SUM=${2:?expected sha256}
exec 9>/run/wind-install.lock
flock -n 9 || { echo "another install is running" >&2; exit 1; }
# Root's scratch space is a fresh private directory, never a predictable /tmp path a release could pre-plant (Haiku PR #98 N-1).
WORK=$(mktemp -d); chmod 700 "$WORK"
DRY=""; PID=""
cleanup() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; fi
  [ -z "$DRY" ] || rm -rf "$DRY"
  rm -rf "$WORK"
}
trap cleanup EXIT
# Hash and unpack one private copy, so the file cannot change between the check and the extract (Haiku PR #98 N-7).
cp -- "$TAR" "$WORK/release.tar.gz"
echo "$SUM  $WORK/release.tar.gz" | sha256sum -c -
rm -rf /opt/windapi-new
tar -xzf "$WORK/release.tar.gz" -C "$WORK"   # the archive's top-level directory is windapi/
mv "$WORK/windapi" /opt/windapi-new
chown -R root:root /opt/windapi-new && chmod 755 /opt/windapi-new/backup.sh
sudo -u wind test -x /opt/windapi-new/backup.sh || { echo "backup.sh is not executable by wind" >&2; rm -rf /opt/windapi-new; exit 1; }

# The snapshot of the live database for this install (Sol full review 21 Nov, item 5), checked, kept 30 days.
STAMP=$(date +%Y%m%d%H%M%S)
SNAP="/data/backups/pre-install-$STAMP.db"
[ -f /data/wind.db ] || SNAP=""   # a first install has no database to snapshot
snapshot() { # $1 source, $2 target: VACUUM INTO and quick_check, as the service user
  sudo -u wind env SRC="$1" DST="$2" /opt/node/bin/node -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync(process.env.SRC).exec(\"VACUUM INTO '\" + process.env.DST + \"'\");
const copy = new DatabaseSync(process.env.DST, { readOnly: true });
if (Object.values(copy.prepare('PRAGMA quick_check').get())[0] !== 'ok') { console.error('snapshot failed quick_check'); process.exit(1); }
copy.close();"
}
DRY=$(mktemp -d); chown wind:wind "$DRY"
if [ -f /data/wind.db ]; then
  snapshot /data/wind.db "$SNAP" || { echo "pre-install snapshot failed; the live service is untouched" >&2; rm -rf /opt/windapi-new; exit 1; }
  find /data/backups -name 'pre-install-*.db' -mtime +30 -delete
  echo "pre-install snapshot: $SNAP"
  cp "$SNAP" "$DRY/wind.db" && chown wind:wind "$DRY/wind.db"
  # The dry run's background jobs must not reach real people: its copy has no push registrations.
  sudo -u wind env DB="$DRY/wind.db" /opt/node/bin/node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB);
db.exec('BEGIN; DELETE FROM push_subscriptions; DELETE FROM native_push_tokens; COMMIT');
db.close();"
fi

# The dry run must be the only thing answering on :4010, or the check below would pass against something else.
if [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://127.0.0.1:4010/ || true)" != "000" ]; then echo "port 4010 is already in use" >&2; rm -rf /opt/windapi-new; exit 1; fi
set -a; . /etc/wind-api.env; set +a
# The dry run talks to nothing outside the VM: no Firebase, email or SMS provider keys (Haiku PR #101 M2).
for v in $(compgen -e | grep -E '^(WIND_FIREBASE|FIREBASE|GOOGLE_|WIND_EMAIL|WIND_SMTP|WIND_SMS|WIND_OTP|WIND_PHONE|CLOUDFLARE)' || true); do unset "$v"; done
cd /opt/windapi-new
sudo -u wind -E env NODE_ENV=production PORT=4010 HOST=127.0.0.1 DB_PATH="$DRY/wind.db" TZ=Asia/Hebron WEB_ROOT=/opt/windapi-new/web \
  /opt/node/bin/node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning server/main.ts > "$WORK/dry.log" 2>&1 &
PID=$! # sudo relays the kill to node
cd /
ok=0; for i in $(seq 1 60); do
  kill -0 "$PID" 2>/dev/null || break
  curl -fsS -m 3 http://127.0.0.1:4010/api/ready > "$WORK/ready.json" 2>/dev/null && { ok=1; break; }; sleep 1
done
kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; PID=""
[ "$ok" -eq 1 ] || { echo "dry run failed on a copy of the live data; the live service is untouched" >&2; tail -20 "$WORK/dry.log" >&2; rm -rf /opt/windapi-new; exit 1; }
echo "dry run on a copy of the live data: $(cat "$WORK/ready.json")"

OLD="/opt/windapi-old-$STAMP"
rollback() { # the old tree goes back and starts again; the candidate stays aside for diagnosis
  echo "install failed: putting the previous release back" >&2
  systemctl stop wind-api 2>/dev/null || true
  # The candidate may have migrated the live database before failing: the database goes back to this install's snapshot
  # too, keeping what was there beside it (Haiku PR #101 M1).
  if [ -n "$SNAP" ] && [ -f "$SNAP" ]; then
    for suffix in '' -wal -shm; do [ ! -e "/data/wind.db$suffix" ] || mv -f "/data/wind.db$suffix" "/data/wind.db.failed-$STAMP$suffix"; done
    install -o wind -g wind -m 600 "$SNAP" /data/wind.db
  fi
  if [ -d "$OLD" ]; then
    [ ! -d /opt/windapi ] || mv /opt/windapi "/opt/windapi-failed-$STAMP"
    mv "$OLD" /opt/windapi
  fi
  systemctl start wind-api || true
  exit 1
}
trap 'rollback' INT TERM HUP
systemctl stop wind-api 2>/dev/null || true
if [ -d /opt/windapi ] && [ -n "$(ls -A /opt/windapi)" ]; then mv /opt/windapi "$OLD"; else rm -rf /opt/windapi; fi
mv /opt/windapi-new /opt/windapi || rollback
systemctl enable --now wind-api >/dev/null || rollback
ok=0; for i in $(seq 1 30); do curl -fsS -m 3 http://127.0.0.1:4000/api/ready > "$WORK/ready.json" 2>/dev/null && { ok=1; break; }; sleep 1; done
[ "$ok" -eq 1 ] || { journalctl -u wind-api -n 20 --no-pager >&2; rollback; }
trap - INT TERM HUP
echo "live: $(cat "$WORK/ready.json")"
# Keep the three newest old trees (disk: Sol ops review 21 Nov); pre-install snapshots keep their own 30 days.
ls -1dt /opt/windapi-old-* 2>/dev/null | tail -n +4 | while read -r tree; do rm -rf -- "$tree"; done
echo "previous release: $OLD; its database snapshot: $SNAP"
