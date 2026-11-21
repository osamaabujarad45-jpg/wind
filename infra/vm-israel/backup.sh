#!/bin/bash
# Daily SQLite backup for the Israel Central host (wind-backup.timer, as the service user).
# 1. A local snapshot, checked with PRAGMA quick_check (14 days kept on the VM).
# 2. The same file uploaded off the VM to private Azure Blob storage with the VM's managed identity (no key on the VM; the
#    container keeps 30 days by lifecycle policy). Configured by WIND_BACKUP_ACCOUNT / WIND_BACKUP_CONTAINER (/etc/wind-backup.env).
# 3. Only after the off-host copy succeeds is /data/backups/last-ok touched: the API warns admins when it is older than 26 hours,
#    so a lost disk can never hide behind a good local copy (Sol ops review 21 Nov, HIGH 2; full review item 6).
set -euo pipefail
DIR=/data/backups
mkdir -p "$DIR"
STAMP=$(date +%F)
TMP="$DIR/.wind-$STAMP.db.tmp"
rm -f "$TMP"
DB_PATH=/data/wind.db TARGET="$TMP" /opt/node/bin/node -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync(process.env.DB_PATH).exec(\"VACUUM INTO '\" + process.env.TARGET + \"'\");
const copy = new DatabaseSync(process.env.TARGET, { readOnly: true });
if (Object.values(copy.prepare('PRAGMA quick_check').get())[0] !== 'ok') { console.error('snapshot failed quick_check'); process.exit(1); }
copy.close();"
mv -f "$TMP" "$DIR/wind-$STAMP.db"
find "$DIR" -name 'wind-*.db' -mtime +13 -delete

ACCOUNT=${WIND_BACKUP_ACCOUNT:-}; CONTAINER=${WIND_BACKUP_CONTAINER:-wind-backups}
if [ -z "$ACCOUNT" ]; then echo "local snapshot only: no off-host target configured; last-ok not updated" >&2; exit 1; fi
TOKEN=$(curl -fsS -m 10 -H 'Metadata: true' \
  'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://storage.azure.com/' \
  | /opt/node/bin/node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).access_token))")
NAME="wind-$(date -u +%Y%m%dT%H%M%SZ).db"
curl -fsS -m 300 -X PUT -T "$DIR/wind-$STAMP.db" \
  -H "Authorization: Bearer $TOKEN" -H 'x-ms-version: 2023-11-03' -H 'x-ms-blob-type: BlockBlob' \
  "https://$ACCOUNT.blob.core.windows.net/$CONTAINER/$NAME" -o /dev/null
touch "$DIR/last-ok"
echo "backed up, verified and copied off the VM: wind-$STAMP.db -> $ACCOUNT/$CONTAINER/$NAME"
