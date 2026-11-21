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
#   after the snapshot are not in it. Apply them again (docs/operations/deploy.md), then:
#   sudo rm /etc/wind-ingress-hold && sudo systemctl start caddy
set -euo pipefail
COPY=${1:?backup file}; OPEN=${2:-}
[ -z "$OPEN" ] || [ "$OPEN" = --open ] || { echo "usage: restore.sh <file> [--open]" >&2; exit 1; }
DATA=/data; DB=/data/wind.db; HOLD=/etc/wind-ingress-hold
[ -f "$COPY" ] || { echo "no such backup: $COPY" >&2; exit 1; }
exec 8<"$DATA"
flock -n 8 || { echo "another install, restore or backup is running" >&2; exit 1; }
KEPT="$DATA/wind.db.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
WORK=$(mktemp -d "$DATA/restore.XXXXXX")   # same filesystem as the live file, so the final move is a rename
PHASE=prepare # prepare -> frozen -> swapped -> live
HALT=""; NEWINO=""; TIMER_STOPPED=""
FAILED="$DATA/wind.db.restore-failed-$(date -u +%Y%m%dT%H%M%SZ)" # a replacement the API failed on, kept for diagnosis
PREHOLD=""; [ ! -e "$HOLD" ] || PREHOLD=1 # an earlier restore still awaiting reconciliation keeps its hold
say() { echo "restore: $*" >&2; }
ready() { local i; for i in $(seq 1 60); do curl -fsS -m 3 http://127.0.0.1:4000/api/ready >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
stopped() { systemctl stop "$1" || return 1; ! systemctl is-active --quiet "$1" && [ "$(systemctl show -p MainPID --value "$1")" = "0" ]; }
state() { echo "Caddy: $(systemctl is-active caddy 2>/dev/null || true); hold $HOLD: $([ -e "$HOLD" ] && echo present || echo absent)"; }
fatal() { HALT=1; say "MANUAL RECOVERY NEEDED: $*"; say "$(state). The database that was live is at $KEPT (if it was moved)."; }
drain_backup() { # the timer paused, then no backup running or queued: a pre-lock release's backup takes no lock (Sol recheck 3)
  # A running backup is stopped, not waited for: a lock-aware one would wait on this script's lock (Sonnet L5), and stopping
  # one is safe (its staging file is cleaned up, last-ok moves only after an upload).
  TIMER_STOPPED=1 # armed first: a signal during the stop still restarts the timer (Sol recheck 5)
  systemctl stop wind-backup.timer || return 1
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
  [ -s "$DB" ] || { fatal "there is no previous database to reopen; the restored copy is at $FAILED"; return; }
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
          [ ! -e "$DB$suffix" ] || mv -f "$DB$suffix" "$FAILED$suffix" || { fatal "could not move the restored file aside"; return; }
        done
      fi
      for suffix in '' -wal -shm; do # only what was moved comes back; a file still in place stays
        [ ! -e "$KEPT$suffix" ] || [ -e "$DB$suffix" ] || mv -f "$KEPT$suffix" "$DB$suffix" || { fatal "could not put the previous database back"; return; }
      done
      sync; reopen ;;
  esac
}
on_exit() {
  local code=$?
  trap - EXIT; trap '' INT TERM HUP # recovery itself is not interrupted halfway
  if [ "$PHASE" != live ] && [ "$code" -ne 0 ]; then recover; [ -z "$HALT" ] || code=2; fi
  [ -z "$TIMER_STOPPED" ] || systemctl start wind-backup.timer >/dev/null 2>&1 || say "could not restart wind-backup.timer"
  [ -n "$HALT" ] || rm -rf -- "$WORK" # kept for diagnosis when a person must look
  exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT TERM HUP

cp -- "$COPY" "$WORK/wind.db"
chown -R wind:wind "$WORK"
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
touch "$DATA/.wind-db-expected"; chown wind:wind "$DATA/.wind-db-expected"; sync
PHASE=swapped # from the first move on, recovery puts the previous files back
for suffix in '' -wal -shm; do # a stale journal must not replay over the restored file
  [ ! -e "$DB$suffix" ] || mv -f "$DB$suffix" "$KEPT$suffix"
done
NEWINO=$(stat -c %i "$WORK/wind.db") # the rename keeps the inode: recovery tells the replacement from the original by it
mv "$WORK/wind.db" "$DB"; chown wind:wind "$DB"; chmod 600 "$DB"; sync
systemctl start wind-api
ready || { journalctl -u wind-api -n 20 --no-pager >&2; say "the API did not become ready on the restored database"; exit 1; }
trap '' INT TERM HUP # the tail always completes (Sonnet L2, Sol recheck 5)
PHASE=live
if [ "$OPEN" = --open ]; then rm -f -- "$HOLD"; sync
  systemctl start caddy || { say "restored $COPY, but Caddy did not start ($(state)); what was there is at $KEPT"; exit 1; }
  say "restored $COPY and reopened; what was there is at $KEPT"
else printf 'restored %s at %s: re-apply later blocks, deletions, demotions and password resets, then remove this file and start Caddy\n' "$COPY" "$(date -u +%FT%TZ)" > "$HOLD"
  say "restored $COPY; what was there is at $KEPT. The ingress hold stays (also across reboots): reapply later blocks and deletions, then: sudo rm $HOLD && sudo systemctl start caddy"; fi
