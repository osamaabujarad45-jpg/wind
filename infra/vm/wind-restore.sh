#!/bin/sh
# Run on the VM: wind-restore.sh /path/to/wind-<stamp>.db.gz. Nothing live is touched until the copy has proved itself, so a bad
# or missing file leaves the service running, and if the swap or the start fails what was there goes back. Every session and
# browser alert is removed from the copy: a session signed out or revoked after the copy was taken must not come back, so everyone
# signs in again. Blocks and deletions made since are not recovered: docs/operations/restore.md says how to keep users out until
# they are applied again.
set -eu
copy=$1
data=${WIND_DATA:-/srv/wind-data}
name=${WIND_CONTAINER:-wind-api}
image=$(docker inspect -f '{{.Config.Image}}' "$name")
kept=$data/wind.db.before-restore-$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d "$data/restore.XXXXXX")
trap 'rm -rf "$work"' EXIT
gunzip -c "$copy" > "$work/wind.db"
chown -R --reference="$data" "$work"
docker run --rm --network none --entrypoint node -v "$work:/r" "$image" --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/r/wind.db');
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('copy failed its integrity check');
  const count = table => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  const before = { users: count('users'), orders: count('orders'), cash: count('cash_entries') }; // throws on a file that is not a Wind database, which startup would otherwise fill in empty
  db.exec('BEGIN; DELETE FROM sessions; DELETE FROM push_subscriptions; COMMIT; PRAGMA wal_checkpoint(TRUNCATE)'); // native push tokens go with their sessions
  db.close();
  console.log('copy ok', before);
"
put_back() { # the service is down and the restore failed: what was there goes back and starts again
  echo "restore failed, putting back what was there" >&2
  for suffix in '' -wal -shm; do
    rm -f "$data/wind.db$suffix"
    [ ! -e "$kept$suffix" ] || mv -f "$kept$suffix" "$data/wind.db$suffix"
  done
  docker start "$name" >/dev/null
  exit 1
}
swap() {
  for suffix in '' -wal -shm; do # a stale journal must not replay over the restored file
    [ ! -e "$data/wind.db$suffix" ] || mv -f "$data/wind.db$suffix" "$kept$suffix" || return 1
  done
  mv "$work/wind.db" "$data/wind.db" && chmod 600 "$data/wind.db" && docker start "$name" >/dev/null
}
rm -f "/run/wind-watchdog/$name" # strikes from before this downtime must not restart the container in the middle of the swap
docker stop "$name" >/dev/null
swap || put_back
for _ in $(seq 1 30); do
  if docker exec "$name" node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    echo "restored $copy; what was there is at $kept"
    exit 0
  fi
  sleep 2
done
docker stop "$name" >/dev/null || true
put_back
