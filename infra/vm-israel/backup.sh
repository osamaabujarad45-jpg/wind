#!/bin/bash
# Hourly SQLite backup for the Israel Central host (wind-backup.timer, as the service user).
# 1. It waits for the database lock that install-release.sh and restore.sh hold while they move /data/wind.db (the /data
#    directory itself), so it never reads a file in the middle of a swap (Sol recheck of PR #101, HIGH 3).
# 2. A missing or empty database is an error that changes nothing: the source is opened read-only, so the backup can never
#    create an empty file in its place, and the day's good copy and last-ok stay as they were.
# 3. A local snapshot, checked with PRAGMA quick_check and for the Wind tables, is published under its day's name only after the
#    checks (14 days kept on the VM: each run replaces its day's file, so the newest copy of each day stays).
# 4. The same file is uploaded off the VM to private Azure Blob storage with the VM's managed identity (no key on the VM; the
#    container keeps 30 days by lifecycle policy, one blob per run). Configured by WIND_BACKUP_ACCOUNT / WIND_BACKUP_CONTAINER (/etc/wind-backup.env).
# 5. Only after the off-host copy succeeds is /data/backups/last-ok touched: the API warns admins when it is older than
#    WIND_BACKUP_MAX_AGE_HOURS (3 on this host),
#    so a lost disk can never hide behind a good local copy (Sol ops review 21 Nov, HIGH 2; full review item 6).
set -euo pipefail
DIR=/data/backups; DB=/data/wind.db
ACCOUNT=${WIND_BACKUP_ACCOUNT:-}; CONTAINER=${WIND_BACKUP_CONTAINER:-wind-backups}
# Azure's own naming rules, checked before either name is put in a URL (Sol recheck L5).
[ -z "$ACCOUNT" ] || [[ "$ACCOUNT" =~ ^[a-z0-9]{3,24}$ ]] || { echo "invalid WIND_BACKUP_ACCOUNT" >&2; exit 1; }
[ "${#CONTAINER}" -ge 3 ] && [ "${#CONTAINER}" -le 63 ] && [[ "$CONTAINER" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "invalid WIND_BACKUP_CONTAINER" >&2; exit 1; }
exec 8</data
flock -w 900 8 || { echo "the database lock was held for 15 minutes (install or restore); no backup taken" >&2; exit 1; }
[ -s "$DB" ] || { echo "no database at $DB (missing or empty); the existing backups and last-ok are unchanged" >&2; exit 1; }
mkdir -p "$DIR"
find "$DIR" -maxdepth 1 -name '.wind-*.db.tmp' -mmin +60 -delete # left by a run that was killed (Sol recheck L4)
STAMP=$(date +%F)
TMP=$(mktemp --suffix=.db.tmp "$DIR/.wind-XXXXXX") # empty: VACUUM INTO accepts an empty target
HDR=""
trap 'rm -f -- "$TMP" ${HDR:+"$HDR"}' EXIT
DB_PATH="$DB" TARGET="$TMP" /opt/node/bin/node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
const src = new DatabaseSync(process.env.DB_PATH, { readOnly: true }); // never creates a file
src.exec(\"VACUUM INTO '\" + process.env.TARGET + \"'\"); src.close();
const copy = new DatabaseSync(process.env.TARGET, { readOnly: true });
if (Object.values(copy.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw Error('snapshot failed quick_check');
const n = t => copy.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n; // a file without the Wind tables throws here
console.log(JSON.stringify({ users: n('users'), orders: n('orders'), cash: n('cash_entries'), events: n('security_events') }));
copy.close();"
mv -f "$TMP" "$DIR/wind-$STAMP.db"
find "$DIR" -maxdepth 1 -name 'wind-*.db' -mtime +13 -delete
# The database is no longer read, so the lock goes before the upload (up to 5 minutes): an install or restore is not refused for
# it. Nothing else writes this day's file: only this oneshot does, and an install stops it first (Haiku PR #103 L8).
exec 8<&-

if [ -z "$ACCOUNT" ]; then echo "local snapshot only: no off-host target configured; last-ok not updated" >&2; exit 1; fi
TOKEN=$(curl -fsS -m 10 -H 'Metadata: true' \
  'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://storage.azure.com/' \
  | /opt/node/bin/node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).access_token))")
NAME="wind-$(date -u +%Y%m%dT%H%M%SZ).db"
# The bearer token goes to curl in a private header file, never on its command line (Haiku PR #101 M3).
HDR=$(mktemp); chmod 600 "$HDR"
printf 'Authorization: Bearer %s\nx-ms-version: 2023-11-03\nx-ms-blob-type: BlockBlob\nIf-None-Match: *\n' "$TOKEN" > "$HDR"; unset TOKEN
curl -fsS -m 300 -X PUT -T "$DIR/wind-$STAMP.db" -H @"$HDR" \
  "https://$ACCOUNT.blob.core.windows.net/$CONTAINER/$NAME" -o /dev/null
touch "$DIR/last-ok"
echo "backed up, verified and copied off the VM: wind-$STAMP.db -> $ACCOUNT/$CONTAINER/$NAME"
