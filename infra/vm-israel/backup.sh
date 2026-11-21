#!/bin/bash
# Daily SQLite snapshot for the Israel Central host (wind-backup.timer, as the service user).
# The API watches /data/backups/last-ok and warns admins when it is older than 26 hours. On this host the marker means
# "a verified local snapshot exists": it is touched only after the snapshot passes PRAGMA quick_check (Sol full review 21 Nov,
# item 6). The snapshot is on the same disk as the database; an off-host copy is a separate, still open, decision.
set -euo pipefail
DIR=/data/backups
mkdir -p "$DIR"
STAMP=$(date +%F)
TMP="$DIR/.wind-$STAMP.db.tmp"
rm -f "$TMP"
# VACUUM INTO refuses an existing file: write a temp copy, check it, then replace the day's backup.
DB_PATH=/data/wind.db TARGET="$TMP" /opt/node/bin/node -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync(process.env.DB_PATH).exec(\"VACUUM INTO '\" + process.env.TARGET + \"'\");
const copy = new DatabaseSync(process.env.TARGET, { readOnly: true });
const result = copy.prepare('PRAGMA quick_check').get();
if (Object.values(result)[0] !== 'ok') { console.error('snapshot failed quick_check'); process.exit(1); }
copy.close();"
mv -f "$TMP" "$DIR/wind-$STAMP.db"
find "$DIR" -name 'wind-*.db' -mtime +13 -delete
touch "$DIR/last-ok"
echo "backed up and verified: wind-${STAMP}.db"
