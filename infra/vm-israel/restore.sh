#!/bin/bash
# Restore a raw SQLite backup on the Israel Central host: sudo bash restore.sh <file> [--open]
# <file> is /data/backups/wind-<date>.db, a pre-install-*.db, or a copy fetched from off-host storage.
# The systemd port of infra/vm/wind-restore.sh (Sol ops review 21 Nov, HIGH 1; recheck of PR #101):
# - One database operation at a time: install-release.sh, this script and the backup job lock the /data directory itself.
# - Nothing live is touched until a staged copy has proved itself (integrity, foreign keys, the Wind tables). Every session and
#   both kinds of push registration are removed from it, so access revoked after the snapshot cannot come back through them.
# - Caddy stops before the API, so no request reaches either database during the swap, and both stops are checked. The
#   ingress hold /etc/wind-ingress-hold is written at the freeze: Caddy refuses to start while it exists, even after a reboot.
# - The database being replaced, with its sidecars, is kept beside it; a failed swap, start, readiness check or signal puts it
#   back (the replacement is recognised by its inode, not by how far the script got) and the hold is lifted only once that
#   database answers /api/ready and no earlier hold was in place. A failed recovery stays closed and says so (exit 2).
# - After a successful restore the HOLD STAYS unless --open is given: blocks, deletions, demotions and password changes made
#   after the snapshot are not in it. --open asserts nothing needs re-applying and lifts any hold, an earlier restore's too;
#   a failed restore never lifts an earlier hold. Apply them again (docs/operations/deploy.md), then:
#   sudo rm /etc/wind-ingress-hold && sudo systemctl start caddy
set -euo pipefail
COPY=$(realpath -s -- "${1:?backup file}"); OPEN=${2:-} # absolute before the cd below (Haiku C1)
cd / # the service user's commands never start in a directory it cannot read
[ -z "$OPEN" ] || [ "$OPEN" = --open ] || { echo "usage: restore.sh <file> [--open]" >&2; exit 1; }
DATA=/data; DB=/data/wind.db; HOLD=/etc/wind-ingress-hold
[ -f "$COPY" ] || { echo "no such backup: $COPY" >&2; exit 1; }
command -v ss >/dev/null || { echo "restore needs ss (iproute2) to verify the API listener" >&2; exit 1; }
# Both unit guards (provision.sh) must be in place first: the Caddy hold check and the API's missing-database check (Haiku M1).
# The loaded units, not just the files on disk (Haiku N4), matched without a pipe.
case "$(systemctl show -p ExecStartPre --value caddy 2>/dev/null)" in *wind-ingress-hold*) ;; *) echo "re-run provision.sh first: the Caddy hold check is not loaded" >&2; exit 1 ;; esac
case "$(systemctl show -p ExecStartPre --value wind-api 2>/dev/null)" in *wind-db-expected*) ;; *) echo "re-run provision.sh first: the API database check is not loaded" >&2; exit 1 ;; esac
exec 8<"$DATA"
flock -n 8 || { echo "another install, restore or backup is running" >&2; exit 1; }
API_ENV=/etc/wind-api.env
[ -r "$API_ENV" ] || { echo "cannot read the API environment" >&2; exit 1; }
if grep -Eq '^[[:blank:]]*(export[[:blank:]]+)?(WIND_DATABASE_URL|WIND_POSTGRES_STAGING)[[:blank:]]*=' "$API_ENV"; then
  echo "the SQLite procedure refuses PostgreSQL configuration" >&2; exit 1
fi
pid=$(systemctl show -p MainPID --value wind-api)
[[ "$pid" =~ ^[0-9]+$ ]] || { echo "cannot determine the live API process" >&2; exit 1; }
if [ "$pid" != 0 ]; then
  pg=0
  grep -zEq '^(WIND_DATABASE_URL|WIND_POSTGRES_STAGING)=.' "/proc/$pid/environ" || pg=$?
  [ "$pg" = 1 ] || { echo "cannot prove the live API uses SQLite" >&2; exit 1; }
fi
KEPT="$DATA/wind.db.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
WORK=$(sudo -u wind mktemp -d "$DATA/restore.XXXXXX" 8<&-)   # wind's own, on the live file's filesystem: the final move is a rename
PHASE=prepare # prepare -> frozen -> swapped -> live
HALT=""; NEWINO=""; TIMER_STOPPED=""; RERUN=""
FAILED="$DATA/wind.db.restore-failed-$(date -u +%Y%m%dT%H%M%SZ)" # a replacement the API failed on, kept for diagnosis
PREHOLD=""; [ ! -e "$HOLD" ] || PREHOLD=1 # an earlier restore still awaiting reconciliation keeps its hold
# Every file operation inside /data runs as the service user that owns it: /data is wind's, so a root write or rename there
# could be steered by a symlink or a swapped directory; as wind it can only reach what wind already can (Haiku H1, N1, N5).
as_wind() { sudo -u wind "$@" 8<&-; }
say() { echo "restore: $*" >&2; }
# The HTTP answer must come from the listener owned by the API unit, including when reopening after rollback.
api_listener() { ss -H -ltnp 'src 127.0.0.1 and sport = :4000'; }
sqlite_response() {
  /opt/node/bin/node -e 'try {const body = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.exit(body.ok === true && body.schema === 3 && body.backend !== "postgres" ? 0 : 1)} catch {process.exit(1)}'
}
ready() {
  local i pid listeners
  for i in $(seq 1 60); do
    pid=$(systemctl show -p MainPID --value wind-api) && [[ "$pid" =~ ^[1-9][0-9]*$ ]] &&
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
  TIMER_STOPPED=1 # armed first: a signal during the stop still restarts the timer (Sol recheck 5)
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

reopen() { # the database that was live, ready, then Caddy unless an earlier hold is still owed its reconciliation
  # A host with no database before the restore (a new disk) has nothing to reopen: the API would create an empty one (Sonnet M2).
  [ -s "$DB" ] || { fatal "there is no previous database to reopen; the copy being restored is kept in $WORK or as $FAILED"; return; }
  systemctl start wind-api || { fatal "the API did not start on the previous database"; return; }
  ready || { fatal "the API did not become ready on the previous database"; return; }
  if [ -n "$PREHOLD" ]; then say "restore failed; the previous database is live again, and the earlier ingress hold stays"; return; fi
  rm -f -- "$HOLD"
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
  # Not during manual recovery: the timer is persistent and would back up the half-recovered state at once (Haiku F2).
  if [ -n "$TIMER_STOPPED" ] && [ -n "$HALT" ]; then say "wind-backup.timer stays stopped until recovery: sudo systemctl start wind-backup.timer"
  elif [ -n "$TIMER_STOPPED" ]; then systemctl start wind-backup.timer >/dev/null 2>&1 || say "could not restart wind-backup.timer"; fi
  # Not during manual recovery: a fresh backup would clear the stale-backup warning (Haiku N3).
  [ -z "$RERUN" ] || [ -n "$HALT" ] || systemctl start --no-block wind-backup.service >/dev/null 2>&1 || say "could not rerun the stopped backup"
  [ -n "$HALT" ] || as_wind rm -rf -- "$WORK" # kept for diagnosis when a person must look
  exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT TERM HUP

# The service user reads the backup by its path and writes the staged copy: root never opens a path wind could have planted as
# a symlink (a backup in wind's /data/backups; Haiku N1, F1). A file wind cannot read is refused, and the script prints no
# command for root to read it: any path it printed could lead through a link wind planted (Haiku W1, W2, confirmation 5 F1, F2).
# docs/operations/deploy.md says how an operator stages a file it has checked.
as_wind sh -c 'umask 077; cat -- "$1" > "$2"' sh "$COPY" "$WORK/wind.db" \
  || { say "could not stage $COPY: the service user cannot read it, or there is no space. See the repository runbook, docs/operations/deploy.md (restore)."; exit 1; }
sudo -u wind env DB="$WORK/wind.db" /opt/node/bin/node --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.DB);
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('copy failed its integrity check');
  const count = table => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  const before = { users: count('users'), orders: count('orders'), cash: count('cash_entries') }; // a file that is not a Wind database throws here
  db.exec('BEGIN; DELETE FROM sessions; DELETE FROM push_subscriptions; DELETE FROM native_push_tokens; COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  console.log('copy ok', JSON.stringify(before));
" 8<&-

# Freeze: no requests, then no writer, both checked. From the Caddy stop on, any exit reopens what was there (Sonnet L1).
PHASE=frozen
stopped caddy || { say "Caddy did not stop; nothing was changed"; exit 1; }
[ -n "$PREHOLD" ] || printf 'restore of %s in progress (%s)\n' "$COPY" "$(date -u +%FT%TZ)" > "$HOLD"
sync # the hold is on disk before anything moves, so a power loss reboots closed
drain_backup || { say "a backup is still running or queued; nothing was changed"; exit 1; }
stopped wind-api || { say "the API did not stop for certain; nothing was changed"; exit 1; }
# Before anything moves: from now on the API never starts on a fresh empty file (Sonnet M2).
as_wind touch -- "$DATA/.wind-db-expected"; sync
PHASE=swapped # from the first move on, recovery puts the previous files back
for suffix in '' -wal -shm; do # a stale journal must not replay over the restored file
  [ ! -e "$DB$suffix" ] || as_wind mv -Tf -- "$DB$suffix" "$KEPT$suffix"
done
NEWINO=$(stat -c %i "$WORK/wind.db") # the rename keeps the inode: recovery tells the replacement from the original by it
as_wind mv -T -- "$WORK/wind.db" "$DB"; sync
systemctl start wind-api
ready || { journalctl -u wind-api -n 20 --no-pager >&2; say "the API did not become ready on the restored database"; exit 1; }
trap '' INT TERM HUP # the tail always completes (Sonnet L2, Sol recheck 5)
PHASE=live
if [ "$OPEN" = --open ]; then
  [ -z "$PREHOLD" ] || say "--open lifts the earlier hold, which said: $(cat "$HOLD" 2>/dev/null)" # Haiku N6
  rm -f -- "$HOLD"; sync
  systemctl start caddy || { say "restored $COPY, but Caddy did not start ($(state)); what was there is at $KEPT"; exit 1; }
  say "restored $COPY and reopened; what was there is at $KEPT"
else [ -z "$PREHOLD" ] || say "the earlier hold is kept below this restore's note: $(cat "$HOLD" 2>/dev/null)" # Haiku F3
  { printf 'restored %s at %s: re-apply later blocks, deletions, demotions and password resets, then remove this file and start Caddy\n' "$COPY" "$(date -u +%FT%TZ)"
    [ -z "$PREHOLD" ] || cat "$HOLD" 2>/dev/null; } > "$HOLD.new" && mv -f "$HOLD.new" "$HOLD"
  say "restored $COPY; what was there is at $KEPT. The ingress hold stays (also across reboots): reapply later blocks and deletions, then: sudo rm $HOLD && sudo systemctl start caddy"; fi
