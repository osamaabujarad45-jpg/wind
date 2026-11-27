#!/bin/bash
# Restore a raw SQLite backup on the Israel Central host: sudo bash restore.sh <file> [--open]
# <file> is /data/backups/wind-<date>.db, a pre-install-*.db, or a copy fetched from off-host storage.
# The systemd port of infra/vm/wind-restore.sh (Sol ops review 21 Nov, HIGH 1; recheck of PR #101):
# - One database operation at a time: install-release.sh, this script and the backup job lock the /data directory itself.
# - Nothing live is touched until a staged copy has proved itself (integrity, foreign keys, the Wind tables). Every session and
#   both kinds of push registration are removed from it, so access revoked after the snapshot cannot come back through them.
# - Caddy stops before the API, so no request reaches either database during the swap, and both stops are checked. The
#   ingress hold /etc/wind-ingress-hold is written at the freeze: Caddy refuses to start while it exists, even after a reboot.
#   /etc/wind-db-swap blocks the API and backup while the database and its sidecars are between renames.
# - The database being replaced, with its sidecars, is kept beside it; a failed swap, start, readiness check or signal puts it
#   back (the replacement is recognised by its inode, not by how far the script got) and the hold is lifted only once that
#   database answers /api/ready, backups are scheduled and no earlier hold was in place. A failed recovery stays closed (exit 2).
# - After restore, --open asserts that reconciliation is complete. An earlier hold, recovery-email data in either
#   database or a missing database on an initialized host keeps ingress held. Finish reconciliation, then:
#   sudo rm /etc/wind-ingress-hold && sudo systemctl start caddy
set -euo pipefail
COPY=$(realpath -s -- "${1:?backup file}"); OPEN=${2:-} # absolute before the cd below (Haiku C1)
cd / # the service user's commands never start in a directory it cannot read
[ -z "$OPEN" ] || [ "$OPEN" = --open ] || { echo "usage: restore.sh <file> [--open]" >&2; exit 1; }
DATA=/data; DB=/data/wind.db; HOLD=/etc/wind-ingress-hold; SWAP=/etc/wind-db-swap
[ -f "$COPY" ] || { echo "no such backup: $COPY" >&2; exit 1; }
command -v ss >/dev/null || { echo "restore needs ss (iproute2) to verify the API listener" >&2; exit 1; }
# Require the guards in the loaded units so they also apply on a reboot during restore.
case "$(systemctl show -p ExecStartPre --value caddy 2>/dev/null)" in *wind-ingress-hold*) ;; *) echo "re-run provision.sh first: the Caddy hold check is not loaded" >&2; exit 1 ;; esac
api_prestart=$(systemctl show -p ExecStartPre --value wind-api)
case "$api_prestart" in *wind-db-expected*) ;; *) echo "re-run provision.sh first: the API database check is not loaded" >&2; exit 1 ;; esac
case "$api_prestart" in *'Wind restore: Firebase email links must be off'*) ;; *) echo "re-run provision.sh first: the API restore email check is not loaded" >&2; exit 1 ;; esac
case "$api_prestart" in *wind-db-swap*) ;; *) echo "re-run provision.sh first: the API swap check is not loaded" >&2; exit 1 ;; esac
case "$(systemctl show -p ExecStartPre --value wind-backup.service)" in *wind-db-swap*) ;; *) echo "re-run provision.sh first: the backup swap check is not loaded" >&2; exit 1 ;; esac
exec 8<"$DATA"
flock -n 8 || { echo "another install, restore or backup is running" >&2; exit 1; }
API_ENV=/etc/wind-api.env
config_check=0
grep -Eq '^[[:blank:]]*(export[[:blank:]]+)?(DB_PATH|WIND_DATABASE_URL|WIND_POSTGRES_STAGING)[[:blank:]]*=' "$API_ENV" || config_check=$?
case "$config_check" in
  0) echo "the SQLite procedure refuses database overrides in $API_ENV" >&2; exit 1 ;;
  1) ;;
  *) echo "cannot read the API environment" >&2; exit 1 ;;
esac
config_check=0
link_assignment='^[[:blank:]]*(export[[:blank:]]+)?(WIND_FIREBASE_EMAIL_LINKS|WIND_FIREBASE_RESET_LINKS)[[:blank:]]*='
grep -Eq "$link_assignment" "$API_ENV" || config_check=$?
case "$config_check" in
  0) echo "unset both Firebase email link switches before restoring" >&2; exit 1 ;;
  1) ;;
  *) echo "cannot read the API environment" >&2; exit 1 ;;
esac
# Check the unit's configured sources with the service stopped too. ExecStartPre checks the final environment at launch.
api_unit_env=$(systemctl show -p Environment --value wind-api) || { echo "cannot read the loaded API environment" >&2; exit 1; }
manager_env=$(systemctl show-environment) || { echo "cannot read the systemd manager environment" >&2; exit 1; }
if [[ "$api_unit_env"$'\n'"$manager_env" =~ (^|[[:space:]\"])(WIND_FIREBASE_EMAIL_LINKS|WIND_FIREBASE_RESET_LINKS)=1([[:space:]\"]|$) ]]; then
  echo "unset both Firebase email link switches in the loaded API unit before restoring" >&2; exit 1
fi
api_env_files=$(systemctl show -p EnvironmentFiles --value wind-api) || { echo "cannot read the loaded API environment files" >&2; exit 1; }
env_file_entry='^(/.+) \(ignore_errors=(yes|no)\)$'
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  [[ "$entry" =~ $env_file_entry ]] || { echo "cannot verify the loaded API environment files" >&2; exit 1; }
  optional=${BASH_REMATCH[2]}
  mapfile -t env_paths < <(compgen -G "${BASH_REMATCH[1]}")
  [ "${#env_paths[@]}" -gt 0 ] || [ "$optional" = yes ] || { echo "a loaded API environment file is missing" >&2; exit 1; }
  for env_path in "${env_paths[@]}"; do
    [ "$env_path" != "$API_ENV" ] || continue
    config_check=0
    grep -Eq "$link_assignment" "$env_path" || config_check=$?
    [ "$config_check" = 1 ] || { echo "unset both Firebase email link switches in the loaded API environment files and verify they are readable" >&2; exit 1; }
  done
done <<< "$api_env_files"
api_uses_expected_db() {
  local pid=$1 process_env pg=0
  process_env="/proc/$pid/environ"
  grep -zEq '^(WIND_DATABASE_URL|WIND_POSTGRES_STAGING)=.' "$process_env" || pg=$?
  [ "$pg" = 1 ] && grep -zFxq -- "DB_PATH=$DB" "$process_env"
}
api_email_links_off() {
  local pid=$1 status=0
  grep -zEq '^(WIND_FIREBASE_EMAIL_LINKS|WIND_FIREBASE_RESET_LINKS)=1$' "/proc/$pid/environ" || status=$?
  [ "$status" = 1 ]
}
pid=$(systemctl show -p MainPID --value wind-api)
[[ "$pid" =~ ^[0-9]+$ ]] || { echo "cannot determine the live API process" >&2; exit 1; }
if [ "$pid" != 0 ] && ! api_uses_expected_db "$pid"; then
  echo "cannot prove the live API uses $DB on SQLite" >&2; exit 1
fi
if [ "$pid" != 0 ] && ! api_email_links_off "$pid"; then
  echo "cannot prove Firebase email links are off in the running API" >&2; exit 1
fi
PREHOLD=""; PREHOLD_TEXT=""
if [ -e "$HOLD" ]; then
  PREHOLD=1
  PREHOLD_TEXT=$(cat -- "$HOLD" && printf .) # retain trailing newlines in the earlier hold
fi
PREVIOUS_SWAP_PENDING=""; [ ! -e "$SWAP" ] || PREVIOUS_SWAP_PENDING=1
stamp=$(date -u +%Y%m%dT%H%M%SZ)
WORK=$(sudo -u wind mktemp -d "$DATA/restore.XXXXXX" 8<&-)   # wind's own, on the live file's filesystem: the final move is a rename
attempt="$stamp-${WORK##*.}"
KEPT="$DATA/wind.db.before-restore-$attempt"
FAILED="$DATA/wind.db.restore-failed-$attempt"
PHASE=prepare # prepare -> frozen -> swapped -> live
HALT=""; NEWINO=""; RERUN=""
# Every file operation inside /data runs as the service user that owns it: /data is wind's, so a root write or rename there
# could be steered by a symlink or a swapped directory; as wind it can only reach what wind already can (Haiku H1, N1, N5).
as_wind() { sudo -u wind "$@" 8<&-; }
say() { echo "restore: $*" >&2; }
write_hold() {
  {
    printf '%s\ndisplaced database: %s\nfailed replacement: %s\n' "$1" "$KEPT" "$FAILED"
    printf '%s' "${PREHOLD_TEXT%.}"
  } > "$HOLD.new" && mv -f -- "$HOLD.new" "$HOLD" && sync
}
begin_swap() { touch -- "$SWAP" && sync; }
finish_swap() { sync && rm -f -- "$SWAP" && sync; }
# The HTTP answer must come from the listener owned by the API unit, including when reopening after rollback.
api_listener() { ss -H -ltnp 'src 127.0.0.1 and sport = :4000'; }
sqlite_response() {
  /opt/node/bin/node -e 'try {const body = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.exit(body.ok === true && body.schema === 3 && body.backend !== "postgres" ? 0 : 1)} catch {process.exit(1)}'
}
ready() {
  local i pid listeners
  for i in $(seq 1 60); do
    pid=$(systemctl show -p MainPID --value wind-api) && [[ "$pid" =~ ^[1-9][0-9]*$ ]] &&
      api_uses_expected_db "$pid" && api_email_links_off "$pid" &&
      listeners=$(api_listener) && [[ "$listeners" == *"pid=$pid,"* ]] &&
      curl -fsS -m 3 http://127.0.0.1:4000/api/ready 2>/dev/null | sqlite_response && return 0
    sleep 1
  done
  return 1
}
stopped() { systemctl stop "$1" || return 1; ! systemctl is-active --quiet "$1" && [ "$(systemctl show -p MainPID --value "$1")" = "0" ]; }
state() { echo "Caddy: $(systemctl is-active caddy 2>/dev/null || true); hold $HOLD: $([ -e "$HOLD" ] && echo present || echo absent)"; }
fatal() { HALT=1; say "MANUAL RECOVERY NEEDED: $*"; say "$(state). The database that was live is at $KEPT (if it was moved)."; }
drain_backup() { # the timer paused, then no backup running or queued: a pre-lock release's backup takes no lock (Sol recheck 3)
  # A running backup is stopped, not waited for: a lock-aware one would wait on this script's lock (Sonnet L5), and stopping
  # one is safe (its staging file is cleaned up, last-ok moves only after an upload).
  systemctl stop wind-backup.timer || return 1
  case "$(systemctl show -p ActiveState --value wind-backup.service 2>/dev/null)" in activating|active|reloading) RERUN=1 ;; esac # a backup that was running is run again at the end
  systemctl stop wind-backup.service || return 1
  local i s jobs; for i in $(seq 1 30); do # a oneshot is "activating" while its script runs, so is-active is not enough
    s=$(systemctl show -p ActiveState --value wind-backup.service 2>/dev/null || echo unknown)
    jobs=$(systemctl list-jobs --no-legend wind-backup.service 2>/dev/null) || { sleep 1; continue; } # unknown is not empty
    case "$s" in inactive|failed) [ -z "$jobs" ] && return 0 ;; esac
    sleep 1
  done; return 1
}
resume_backup_timer() {
  local next
  systemctl start wind-backup.timer || return 1
  systemctl is-active --quiet wind-backup.timer || return 1
  # Check running first so a catch-up job finishing during the check can only move to a scheduled state.
  if [ "$(systemctl show -p SubState --value wind-backup.timer)" = running ]; then
    say "the backup timer has dispatched its next run"
    return 0
  fi
  next=$(systemctl show -p NextElapseUSecRealtime --value wind-backup.timer) || return 1
  if [[ "$next" =~ [0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2} ]]; then
    say "next backup: $next"
    return 0
  fi
  return 1
}

reopen() { # the database that was live, ready, then Caddy unless an earlier hold is still owed its reconciliation
  [ -z "$PREVIOUS_SWAP_PENDING" ] || { fatal "the earlier database swap still needs recovery"; return; }
  if [ -e "$SWAP" ]; then finish_swap || { fatal "could not clear the swap marker"; return; }; fi
  # A host with no database before the restore (a new disk) has nothing to reopen: the API would create an empty one (Sonnet M2).
  [ -s "$DB" ] || { fatal "there is no previous database to reopen; the copy being restored is kept in $WORK or as $FAILED"; return; }
  systemctl start wind-api || { fatal "the API did not start on the previous database"; return; }
  ready || { fatal "the API did not become ready on the previous database"; return; }
  resume_backup_timer || { fatal "the previous database is ready but the backup timer has no confirmed run"; return; }
  if [ -n "$PREHOLD" ]; then
    { printf '%s' "${PREHOLD_TEXT%.}" > "$HOLD.new" && mv -f -- "$HOLD.new" "$HOLD" && sync; } || { fatal "could not reinstate the earlier hold"; return; }
    say "restore failed; the previous database is live again, and the earlier ingress hold stays"
    return
  fi
  { rm -f -- "$HOLD" && sync; } || { fatal "could not clear the ingress hold"; return; }
  systemctl start caddy || { fatal "the previous database is live but Caddy did not start"; return; }
  say "restore failed; the previous database is live again"
}
is_replacement() { [ -n "$NEWINO" ] && [ -e "$DB" ] && [ "$(stat -c %i "$DB")" = "$NEWINO" ]; }
recover() {
  set +e
  case "$PHASE" in
    prepare) ;;
    frozen) reopen ;;
    swapped)
      begin_swap || { fatal "could not guard the database swap before rollback"; return; }
      stopped wind-api || { fatal "the API did not stop; nothing was put back"; return; }
      if is_replacement; then # whatever point the swap reached, the file at the live path is the replacement
        for suffix in '' -wal -shm; do # the restored file and its journal go aside, never deleted (Sonnet L3)
          [ ! -e "$DB$suffix" ] || as_wind mv -Tf -- "$DB$suffix" "$FAILED$suffix" || { fatal "could not move the restored file aside"; return; }
        done
      fi
      for suffix in '' -wal -shm; do # only what was moved comes back; a file still in place stays
        [ ! -e "$KEPT$suffix" ] || [ -e "$DB$suffix" ] || as_wind mv -Tf -- "$KEPT$suffix" "$DB$suffix" || { fatal "could not put the previous database back"; return; }
      done
      sync; reopen ;;
  esac
}
on_exit() {
  local code=$?
  trap - EXIT; trap '' INT TERM HUP # recovery itself is not interrupted halfway
  if [ "$PHASE" != live ] && [ "$code" -ne 0 ]; then recover; [ -z "$HALT" ] || code=2; fi
  # Not during manual recovery: a fresh backup would clear the stale-backup warning (Haiku N3).
  [ -z "$RERUN" ] || [ -n "$HALT" ] || systemctl start --no-block wind-backup.service >/dev/null 2>&1 || say "could not rerun the stopped backup"
  [ -n "$HALT" ] || as_wind rm -rf -- "$WORK" # kept for diagnosis when a person must look
  exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT TERM HUP

# A work directory suffix can be reused after cleanup. Check retained names while holding the database lock.
for retained in "$KEPT" "$FAILED"; do
  for suffix in '' -wal -shm; do
    if [[ -e "$retained$suffix" || -L "$retained$suffix" ]]; then
      say "a recovery file already exists at $retained$suffix; retry with a new attempt"
      exit 1
    fi
  done
done

# The service user reads the backup by its path and writes the staged copy: root never opens a path wind could have planted as
# a symlink (a backup in wind's /data/backups; Haiku N1, F1). A file wind cannot read is refused, and the script prints no
# command for root to read it: any path it printed could lead through a link wind planted (Haiku W1, W2, confirmation 5 F1, F2).
# docs/operations/deploy.md says how an operator stages a file it has checked.
input_path=$(realpath -e -- "$COPY")
case "$input_path" in
  "$DB"|"$DB".before-restore-*|"$DB".restore-failed-*)
    say "make a self-contained SQLite snapshot of the database and its matching WAL before restoring it"
    exit 1 ;;
esac
if [[ -s "$input_path-wal" || -s "$input_path-journal" || -s "$COPY-wal" || -s "$COPY-journal" ]]; then
  say "the restore input has a SQLite journal; make a self-contained snapshot first"
  exit 1
fi
as_wind sh -c 'umask 077; cat -- "$1" > "$2"' sh "$COPY" "$WORK/wind.db" \
  || { say "could not stage $COPY: the service user cannot read it, or there is no space. See the repository runbook, docs/operations/deploy.md (restore)."; exit 1; }
EMAIL_RECORDS_JS='
  const hasTable = name => db.prepare("SELECT 1 FROM sqlite_schema WHERE type = ? AND name = ?").get("table", name);
  const needsReview = ["firebase_email_attempts", "recovery_email_proofs", "firebase_resets"].some(
    table => hasTable(table) && db.prepare("SELECT 1 FROM " + table + " LIMIT 1").get());
'
STAGED=$(sudo -u wind env DB="$WORK/wind.db" /opt/node/bin/node --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.DB);
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('copy failed its integrity check');
  const count = table => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  const before = { users: count('users'), orders: count('orders'), cash: count('cash_entries') }; // a file that is not a Wind database throws here
  $EMAIL_RECORDS_JS
  db.exec('BEGIN; DELETE FROM sessions; DELETE FROM push_subscriptions; DELETE FROM native_push_tokens');
  if (hasTable('email_codes')) db.exec('DELETE FROM email_codes');
  if (hasTable('firebase_resets')) db.exec('DELETE FROM firebase_resets');
  if (hasTable('firebase_email_attempts')) db.prepare(
    'UPDATE firebase_email_attempts SET state = ?, cleanup_at = CASE WHEN state IN (?, ?) THEN 0 ELSE cleanup_at END, ' +
    'retry_until = CASE WHEN state = ? THEN 0 ELSE retry_until END WHERE state IN (?, ?, ?)'
  ).run('retired', 'ready', 'queued', 'queued', 'ready', 'queued', 'sending');
  db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
  if (hasTable('email_codes') && count('email_codes') > 0) throw Error('copy retained email codes');
  db.close();
  console.log('copy ok', JSON.stringify(before));
  if (needsReview) console.log('email reconciliation required');
" 8<&-)
printf '%s\n' "$STAGED"

# Freeze: no requests, then no writer, both checked. From the Caddy stop on, any exit reopens what was there (Sonnet L1).
PHASE=frozen
stopped caddy || { say "Caddy did not stop; nothing was changed"; exit 1; }
write_hold "restore of $COPY in progress ($(date -u +%FT%TZ))" # register this restore even if an earlier hold exists
drain_backup || { say "a backup is still running or queued; nothing was changed"; exit 1; }
stopped wind-api || { say "the API did not stop for certain; nothing was changed"; exit 1; }
RECONCILE=""
if [[ -n "$PREHOLD" || -n "$PREVIOUS_SWAP_PENDING" || "$STAGED" = *'email reconciliation required'* ]]; then RECONCILE=1; fi
if [[ "$OPEN" = --open && -z "$RECONCILE" && ! -s "$DB" && -e "$DATA/.wind-db-expected" ]]; then
  say "the previously initialized database is missing or empty; email reconciliation is required"
  RECONCILE=1
fi
if [[ "$OPEN" = --open && -z "$RECONCILE" && -e "$DB" ]]; then
  if ! as_wind env DB="$DB" /opt/node/bin/node --disable-warning=ExperimentalWarning -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.env.DB, { readOnly: true });
    $EMAIL_RECORDS_JS
    db.close();
    if (needsReview) process.exitCode = 1;
  "; then
    say "the displaced database needs email reconciliation or its journal could not be checked"
    RECONCILE=1
  fi
fi
# Before anything moves: from now on the API never starts on a fresh empty file (Sonnet M2).
as_wind touch -- "$DATA/.wind-db-expected"; sync
PHASE=swapped # from the first move on, recovery puts the previous files back
begin_swap
for suffix in '' -wal -shm; do # a stale journal must not replay over the restored file
  [ ! -e "$DB$suffix" ] || as_wind mv -Tf -- "$DB$suffix" "$KEPT$suffix"
done
NEWINO=$(stat -c %i "$WORK/wind.db") # the rename keeps the inode: recovery tells the replacement from the original by it
as_wind mv -T -- "$WORK/wind.db" "$DB"
finish_swap
systemctl start wind-api
ready || { journalctl -u wind-api -n 20 --no-pager >&2; say "the API did not become ready on the restored database"; exit 1; }
trap '' INT TERM HUP # the tail always completes (Sonnet L2, Sol recheck 5)
PHASE=live
resume_backup_timer || { fatal "the restored database is ready but the backup timer has no confirmed run"; exit 2; }
if [[ "$OPEN" = --open && -z "$RECONCILE" ]]; then
  rm -f -- "$HOLD"; sync
  systemctl start caddy || { say "restored $COPY, but Caddy did not start ($(state)); what was there is at $KEPT"; exit 1; }
  say "restored $COPY and reopened; what was there is at $KEPT"
else
  write_hold "restored $COPY at $(date -u +%FT%TZ): re-apply later blocks, deletions, demotions, password resets and verified email changes, reconcile provider cleanup, then remove this file and start Caddy"
  say "restored $COPY; what was there is at $KEPT. The ingress hold stays (also across reboots): reapply later account changes listed in $HOLD, then: sudo rm $HOLD && sudo systemctl start caddy"; fi
