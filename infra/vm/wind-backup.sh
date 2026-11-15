#!/bin/sh
# Nightly on the VM (/etc/cron.d/wind): a consistent copy of the live SQLite database, 14 days kept on disk and one copy off
# the VM in the private, versioned Blob container windpsbackup/wind-backups. The VM's managed identity holds the custom role
# "Wind backup writer" on that one container: it may create blobs, not read, list or delete them (versioning and 30-day soft
# delete keep any overwritten copy).
set -eu
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir=/srv/wind-data/backups
trap 'rm -f "$dir/wind-$stamp.db"' EXIT # a failed run must not leave an uncompressed copy that nothing ever deletes
docker exec wind-api mkdir -p /data/backups
docker exec wind-api node --disable-warning=ExperimentalWarning -e "
  process.umask(0o077); // private from the first byte: this copy holds the same accounts as the live database
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.DB_PATH || '/data/wind.db');
  db.exec(\"VACUUM INTO '/data/backups/wind-$stamp.db'\");
  const check = new DatabaseSync('/data/backups/wind-$stamp.db', { readOnly: true }).prepare('PRAGMA integrity_check').get();
  if (check.integrity_check !== 'ok') { console.error(check); process.exit(1); }
"
gzip -9 "$dir/wind-$stamp.db"
chmod 600 "$dir"/wind-*.db.gz # as private as the live database; these hold the same accounts
token=$(/srv/azure-token.sh https://storage.azure.com/)
# -K -: the token stays off the process list.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl -fsS --retry 3 -m 120 -K - -X PUT -H 'x-ms-version: 2023-11-03' \
  -H 'x-ms-blob-type: BlockBlob' --data-binary "@$dir/wind-$stamp.db.gz" -o /dev/null \
  "https://windpsbackup.blob.core.windows.net/wind-backups/wind-$stamp.db.gz"
# The API alerts admins when this marker goes stale, so it moves only after the off-VM copy succeeded.
touch "$dir/last-ok"
find "$dir" -name 'wind-*.db.gz' -mtime +14 -delete
echo "backup wind-$stamp.db.gz $(stat -c %s "$dir/wind-$stamp.db.gz") bytes"
