#!/bin/sh
# Run on the VM: wind-restore.sh /path/to/wind-<stamp>.db.gz. Nothing live is touched until the copy has proved itself, so a bad
# or missing file leaves the service running. Every session and browser alert is removed from the copy: a session signed out or
# revoked after the copy was taken must not come back, so everyone signs in again. Blocks and deletions made since are not
# recovered; apply them again from the incident timeline before reopening.
set -eu
copy=$1
data=${WIND_DATA:-/srv/wind-data}
name=${WIND_CONTAINER:-wind-api}
image=$(docker inspect -f '{{.Config.Image}}' "$name")
work=$(mktemp -d "$data/restore.XXXXXX")
trap 'rm -rf "$work"' EXIT
gunzip -c "$copy" > "$work/wind.db"
chown -R --reference="$data" "$work"
docker run --rm --network none --entrypoint node -v "$work:/r" "$image" --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/r/wind.db');
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('copy failed its integrity check');
  const count = table => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  const before = { users: count('users'), orders: count('orders') }; // throws on a file that is not a Wind database
  db.exec('BEGIN; DELETE FROM sessions; DELETE FROM push_subscriptions; COMMIT; PRAGMA wal_checkpoint(TRUNCATE)'); // native push tokens go with their sessions
  db.close();
  console.log('copy ok', before);
"
docker stop "$name" >/dev/null
for suffix in '' -wal -shm; do # keep what was there; a stale journal must not replay over the restored file
  [ ! -e "$data/wind.db$suffix" ] || mv -f "$data/wind.db$suffix" "$data/wind.db.before-restore$suffix"
done
mv "$work/wind.db" "$data/wind.db"
chmod 600 "$data/wind.db"
docker start "$name" >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$name" node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    echo "restored $copy; what was there is at $data/wind.db.before-restore"
    exit 0
  fi
  sleep 2
done
echo "restored $copy but the API is not ready: docker logs $name" >&2
exit 1
