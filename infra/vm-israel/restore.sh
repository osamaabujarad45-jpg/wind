#!/bin/bash
# Restore a raw SQLite backup on the Israel Central host: sudo bash restore.sh /data/backups/wind-<date>.db (or a pre-install-*.db,
# or a copy fetched from off-host storage). The systemd port of infra/vm/wind-restore.sh (Sol ops review 21 Nov, HIGH 1):
# nothing live is touched until a staged copy has proved itself (integrity, foreign keys, the Wind tables); every session and both
# kinds of push registration are removed from it, so access revoked after the snapshot cannot come back; the database being
# replaced, with its sidecars, is kept beside it; a failed swap or start puts it back. Blocks and deletions made after the
# snapshot are not recovered: keep users out (stop Caddy) until they are applied again.
set -euo pipefail
COPY=${1:?backup file}
DATA=/data
[ -f "$COPY" ] || { echo "no such backup: $COPY" >&2; exit 1; }
KEPT="$DATA/wind.db.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
WORK=$(mktemp -d "$DATA/restore.XXXXXX")   # same filesystem as the live file, so the final move is a rename
trap 'rm -rf "$WORK"' EXIT
cp -- "$COPY" "$WORK/wind.db"
chown -R wind:wind "$WORK"
sudo -u wind /opt/node/bin/node --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('$WORK/wind.db');
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('copy failed its integrity check');
  const count = table => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  const before = { users: count('users'), orders: count('orders'), cash: count('cash_entries') }; // a file that is not a Wind database throws here
  db.exec('BEGIN; DELETE FROM sessions; DELETE FROM push_subscriptions; DELETE FROM native_push_tokens; COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  console.log('copy ok', JSON.stringify(before));
"
installed=no
put_back() {
  echo "restore failed, putting back what was there" >&2
  [ "$installed" = no ] || rm -f "$DATA/wind.db" "$DATA/wind.db-wal" "$DATA/wind.db-shm"
  for suffix in '' -wal -shm; do [ ! -e "$KEPT$suffix" ] || mv -f "$KEPT$suffix" "$DATA/wind.db$suffix"; done
  systemctl start wind-api || true
  exit 1
}
swap() {
  for suffix in '' -wal -shm; do # a stale journal must not replay over the restored file
    [ ! -e "$DATA/wind.db$suffix" ] || mv -f "$DATA/wind.db$suffix" "$KEPT$suffix" || return 1
  done
  installed=yes
  mv "$WORK/wind.db" "$DATA/wind.db" && chown wind:wind "$DATA/wind.db" && chmod 600 "$DATA/wind.db" && systemctl start wind-api
}
trap 'systemctl stop wind-api || true; put_back' INT TERM HUP
systemctl stop wind-api
swap || put_back
trap - INT TERM HUP
for _ in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:4000/api/ready >/dev/null 2>&1; then echo "restored $COPY; what was there is at $KEPT"; exit 0; fi
  sleep 2
done
systemctl stop wind-api || true
put_back
