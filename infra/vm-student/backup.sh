#!/bin/bash
set -euo pipefail
mkdir -p /data/backups
STAMP=$(date +%F)
TMP=/data/backups/.wind-$STAMP.db.tmp
rm -f "$TMP"
# VACUUM INTO refuses an existing file: write a temp copy, then replace the day's backup, so a second run the same day works.
DB_PATH=/data/wind.db TARGET="$TMP" /opt/node/bin/node -e "const {DatabaseSync}=require('node:sqlite'); new DatabaseSync(process.env.DB_PATH).exec(\"VACUUM INTO '\" + process.env.TARGET + \"'\")"
mv -f "$TMP" "/data/backups/wind-$STAMP.db"
find /data/backups -name 'wind-*.db' -mtime +13 -delete
echo "backed up: wind-${STAMP}.db"
