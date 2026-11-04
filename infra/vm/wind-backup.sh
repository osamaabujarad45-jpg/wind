#!/bin/sh
# Nightly on the VM (/etc/cron.d/wind): a consistent copy of the live SQLite database, 14 days kept on disk and one copy off
# the VM in private Azure Blob storage. /srv/wind-backup.env (root, 0600) holds BLOB_URL, the container URL with a write-only SAS.
set -eu
. /srv/wind-backup.env
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir=/srv/wind-data/backups
docker exec wind-api mkdir -p /data/backups
docker exec wind-api node --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.DB_PATH || '/data/wind.db');
  db.exec(\"VACUUM INTO '/data/backups/wind-$stamp.db'\");
  const check = new DatabaseSync('/data/backups/wind-$stamp.db', { readOnly: true }).prepare('PRAGMA integrity_check').get();
  if (check.integrity_check !== 'ok') { console.error(check); process.exit(1); }
"
gzip -9 "$dir/wind-$stamp.db"
printf 'url = "%s"\n' "$(echo "$BLOB_URL" | sed "s#?#/wind-$stamp.db.gz?#")" | curl -fsS --retry 3 -K - -X PUT -H 'x-ms-blob-type: BlockBlob' --data-binary "@$dir/wind-$stamp.db.gz" -o /dev/null # -K: the SAS stays off the process list
find "$dir" -name 'wind-*.db.gz' -mtime +14 -delete
echo "backup wind-$stamp.db.gz $(stat -c %s "$dir/wind-$stamp.db.gz") bytes"
