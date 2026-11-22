#!/bin/bash
# Install a release tarball from build-release.sh on the production VM. Run as root: sudo bash install-release.sh <tarball> <sha256>
# 1. One database operation at a time: install, restore and the backup job all lock the /data directory itself.
# 2. The tarball is hashed and unpacked from one private copy into /opt/wind-releases/<time>.
# 3. Dry run: the candidate starts as the service user on :4010 against a COPY of the live data (no push registrations, no
#    provider keys), so its start-up migrations meet real data (Sol ops review 21 Nov, HIGH 3). The live service keeps serving.
# 4. Freeze: Caddy stops (no requests reach the API), then the API stops, and both stops are checked. Only then is the rollback
#    checkpoint /data/backups/pre-install-<time>.db taken, so it holds every acknowledged write and sign-out (Sol recheck of
#    PR #101, HIGH 2). An uncertain stop changes nothing: the old release is kept.
#    The freeze also writes the ingress hold /etc/wind-ingress-hold: Caddy refuses to start while it exists (provision.sh adds
#    that check to the Caddy unit), so a power loss or kill at any later point reboots closed, not into a half-done install.
#    An install refuses to start while a hold from elsewhere (a restore awaiting reconciliation) is in place.
# 5. Switch: /opt/windapi is a symlink to the active release, replaced in one rename. (A host from before this script still
#    has a real /opt/windapi directory: the first run moves it to the releases folder, under the hold.)
# 6. The candidate starts on the live database with Caddy still stopped. Once it answers /api/ready the install COMMITS: from
#    then on nothing is rolled back (requests may be acknowledged), the hold is removed and Caddy starts.
# 7. A failure or signal before the commit points /opt/windapi back. The database is replaced by the checkpoint only if the
#    candidate was started (it may have migrated or written); the failed file is kept beside it. The hold is lifted and Caddy
#    opens only once the previous release is ready again; otherwise everything stays closed and the script says so (exit 2).
# Rollback by hand and the drills: docs/operations/deploy.md.
set -euo pipefail
TAR=$(realpath -s -- "${1:?release tarball}"); SUM=${2:?expected sha256} # absolute before the cd below (Haiku C1)
cd / # the service user's commands never start in a directory it cannot read
RELEASES=/opt/wind-releases; LIVE=/opt/windapi; DATA=/data; DB=/data/wind.db; HOLD=/etc/wind-ingress-hold
command -v ss >/dev/null || { echo "install needs ss (iproute2) to verify the API listener" >&2; exit 1; }
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
api_uses_expected_db() {
  local pid=$1 process_env pg=0
  process_env="/proc/$pid/environ"
  grep -zEq '^(WIND_DATABASE_URL|WIND_POSTGRES_STAGING)=.' "$process_env" || pg=$?
  [ "$pg" = 1 ] && grep -zFxq -- "DB_PATH=$DB" "$process_env"
}
pid=$(systemctl show -p MainPID --value wind-api)
[[ "$pid" =~ ^[0-9]+$ ]] || { echo "cannot determine the live API process" >&2; exit 1; }
if [ "$pid" != 0 ] && ! api_uses_expected_db "$pid"; then
  echo "cannot prove the live API uses $DB on SQLite" >&2; exit 1
fi
# Both unit guards (provision.sh) must be in place first: the Caddy hold check and the API's missing-database check (Haiku M1).
# The loaded units, not just the files on disk (Haiku N4), matched without a pipe.
case "$(systemctl show -p ExecStartPre --value caddy 2>/dev/null)" in *wind-ingress-hold*) ;; *) echo "re-run provision.sh first: the Caddy hold check is not loaded" >&2; exit 1 ;; esac
case "$(systemctl show -p ExecStartPre --value wind-api 2>/dev/null)" in *wind-db-expected*) ;; *) echo "re-run provision.sh first: the API database check is not loaded" >&2; exit 1 ;; esac
[ ! -e "$HOLD" ] || { echo "an ingress hold is in place ($(cat "$HOLD")): finish that first, then remove $HOLD" >&2; exit 1; }
STAMP=$(date +%Y%m%d%H%M%S)
REL="$RELEASES/$STAMP"; SNAP="$DATA/backups/pre-install-$STAMP.db"
# Root's scratch space is a fresh private directory, never a predictable /tmp path a release could pre-plant (Haiku PR #98 N-1).
WORK=$(mktemp -d); chmod 700 "$WORK"
DRY=""; PID=""; PREV=""; CHECKPOINT=""; HALT=""; TIMER_STOPPED=""; RERUN=""
PHASE=prepare # prepare -> frozen -> switched -> started -> live (committed)

# Every file operation inside /data runs as the service user that owns it: /data is wind's, so a root write or rename there
# could be steered by a symlink or a swapped directory; as wind it can only reach what wind already can (Haiku H1, N1, N5).
as_wind() { sudo -u wind "$@" 8<&-; }
say() { echo "install-release: $*" >&2; }
sqlite_response() {
  /opt/node/bin/node -e 'try {const body = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.exit(body.ok === true && body.schema === 3 && body.backend !== "postgres" ? 0 : 1)} catch {process.exit(1)}'
}
ready() { # The service answers /api/ready on the live listener within $1 seconds.
  local i pid listeners
  for i in $(seq 1 "$1"); do
    pid=$(systemctl show -p MainPID --value wind-api) && [[ "$pid" =~ ^[1-9][0-9]*$ ]] &&
      api_uses_expected_db "$pid" &&
      listeners=$(ss -H -ltnp 'src 127.0.0.1 and sport = :4000') && [[ "$listeners" == *"pid=$pid,"* ]] &&
      curl -fsS -m 3 http://127.0.0.1:4000/api/ready > "$WORK/ready.json" 2>/dev/null &&
      sqlite_response < "$WORK/ready.json" && return 0; sleep 1
  done; return 1
}
port_free() { [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$1/" || true)" = "000" ]; }
stopped() { # $1 unit: stopped for certain, not just asked to stop
  systemctl stop "$1" || return 1
  ! systemctl is-active --quiet "$1" && [ "$(systemctl show -p MainPID --value "$1")" = "0" ]
}
point() { # $1 release directory: /opt/windapi -> $1 in one rename
  ln -sfn "$1" "$LIVE.next" && mv -T "$LIVE.next" "$LIVE"
}
snapshot() { # $1 source, $2 target: a read-only source (never creates a file), VACUUM INTO, checked, as the service user
  sudo -u wind env SRC="$1" DST="$2" /opt/node/bin/node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
const src = new DatabaseSync(process.env.SRC, { readOnly: true });
src.exec(\"VACUUM INTO '\" + process.env.DST + \"'\"); src.close();
const copy = new DatabaseSync(process.env.DST, { readOnly: true });
if (Object.values(copy.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw Error('snapshot failed quick_check');
for (const t of ['users', 'orders', 'cash_entries', 'security_events']) copy.prepare('SELECT COUNT(*) AS n FROM ' + t).get();
copy.close();" 8<&-
}
state() { echo "Caddy: $(systemctl is-active caddy 2>/dev/null || true); hold $HOLD: $([ -e "$HOLD" ] && echo present || echo absent)"; }
fatal() { # the host is in a state a person must look at; with the hold present nothing opens to users, even after a reboot
  HALT=1
  say "MANUAL RECOVERY NEEDED: $*"
  say "$(state). Active release: $(readlink "$LIVE" 2>/dev/null || echo none); previous: ${PREV:-none}; checkpoint: ${CHECKPOINT:-none}"
}
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

reopen_previous() { # the previous release, ready, then the hold is lifted and Caddy starts
  if [ -z "$PREV" ]; then fatal "first install failed; there is no previous release to start"; return; fi
  if [ -n "$CHECKPOINT" ] && [ ! -s "$DB" ]; then fatal "the database is missing; restore the checkpoint"; return; fi
  systemctl start wind-api || { fatal "the previous release did not start"; return; }
  ready 60 || { fatal "the previous release did not become ready"; return; }
  rm -f -- "$HOLD"
  systemctl start caddy || { fatal "the previous release is ready but Caddy did not start"; return; }
  say "the previous release is live again: $PREV"
}
recover() {
  set +e
  case "$PHASE" in
    prepare) [ ! -d "$REL" ] || rm -rf -- "$REL" ;; # nothing live was touched
    frozen) say "install stopped before the switch; the release and database are unchanged"; rm -rf -- "$REL"
      # A first install had no API behind Caddy before it started either: Caddy goes back to how it was (Haiku L4).
      if [ -z "$PREV" ]; then rm -f -- "$HOLD"; systemctl start caddy || say "Caddy did not start: sudo systemctl start caddy"; else reopen_previous; fi ;;
    switched|started)
      if [ "$PHASE" = started ]; then
        { stopped wind-api && port_free 4000; } || { fatal "the candidate did not stop; the database was not replaced"; return; }
        # Stage the checkpoint next to the live file first (a full disk fails here, before anything is moved), then two renames.
        if [ -n "$CHECKPOINT" ]; then
          # Copied by the service user, so a planted symlink can only reach what wind can already write (Haiku H1).
          as_wind sh -c 'umask 077; cp -- "$1" "$2"' sh "$CHECKPOINT" "$DB.rollback-$STAMP" \
            || { fatal "could not stage the checkpoint; the live database is unchanged"; return; }
        fi
        for suffix in '' -wal -shm; do
          [ ! -e "$DB$suffix" ] || as_wind mv -Tf -- "$DB$suffix" "$DB.failed-$STAMP$suffix" || { fatal "could not move the candidate's database aside"; return; }
        done
        if [ -n "$CHECKPOINT" ]; then as_wind mv -Tf -- "$DB.rollback-$STAMP" "$DB" || { fatal "could not put the checkpoint in place"; return; }; fi
        sync
        say "the database is back at the checkpoint; the candidate's file is $DB.failed-$STAMP"
      fi
      # A legacy directory not yet moved is still in place; otherwise the pointer goes back.
      if [ -n "$PREV" ] && [ -d "$PREV" ]; then point "$PREV" || { fatal "could not point $LIVE back to $PREV"; return; }; sync; fi
      [ ! -d "$REL" ] || mv -T "$REL" "$REL-failed" # kept for diagnosis
      reopen_previous ;;
  esac
}
on_exit() {
  local code=$?
  trap - EXIT; trap '' INT TERM HUP # recovery itself is not interrupted halfway
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; fi
  if [ "$PHASE" != live ] && [ "$code" -ne 0 ]; then recover; [ -z "$HALT" ] || code=2; fi
  # Not during manual recovery: the timer is persistent and would back up the half-recovered state at once (Haiku F2).
  if [ -n "$TIMER_STOPPED" ] && [ -n "$HALT" ]; then say "wind-backup.timer stays stopped until recovery: sudo systemctl start wind-backup.timer"
  elif [ -n "$TIMER_STOPPED" ]; then systemctl start wind-backup.timer >/dev/null 2>&1 || say "could not restart wind-backup.timer"; fi
  # A backup this script stopped runs again (the timer's stamp says it already ran today); it waits for the lock released below.
  [ -z "$RERUN" ] || [ -n "$HALT" ] || systemctl start --no-block wind-backup.service >/dev/null 2>&1 || say "could not rerun the stopped backup"
  [ -z "$DRY" ] || rm -rf -- "$DRY"
  rm -rf -- "$WORK"
  exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT TERM HUP

# Hash and unpack one private copy, so the file cannot change between the check and the extract (Haiku PR #98 N-7).
cp -- "$TAR" "$WORK/release.tar.gz"
echo "$SUM  $WORK/release.tar.gz" | sha256sum -c -
mkdir -p "$RELEASES"
tar -xzf "$WORK/release.tar.gz" -C "$WORK"   # the archive's top-level directory is windapi/
[ -d "$WORK/windapi" ] && [ ! -L "$WORK/windapi" ] || { say "the archive's windapi/ is not a plain directory"; exit 1; } # Haiku R1
mv -T "$WORK/windapi" "$REL"
[ -f "$REL/backup.sh" ] && [ ! -L "$REL/backup.sh" ] || { say "backup.sh in the release is not a regular file"; exit 1; }
chown -R root:root "$REL" && chmod 755 "$REL" "$REL/backup.sh"
sudo -u wind test -x "$REL/backup.sh" 8<&- || { say "backup.sh is not executable by wind"; exit 1; }

# Dry run on a copy of the live data, while the live release keeps serving.
DRY=$(mktemp -d); chown wind:wind "$DRY"
if [ -s "$DB" ]; then
  snapshot "$DB" "$DRY/wind.db" || { say "could not copy the live data for the dry run; the live service is untouched"; exit 1; }
  # The dry run's background jobs must not reach real people: its copy has no push registrations.
  sudo -u wind env DB="$DRY/wind.db" /opt/node/bin/node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB);
db.exec('BEGIN; DELETE FROM push_subscriptions; DELETE FROM native_push_tokens; COMMIT');
db.close();" 8<&-
fi
# The dry run must be the only thing answering on :4010, or the check below would pass against something else.
port_free 4010 || { say "port 4010 is already in use"; exit 1; }
set -a; . "$API_ENV"; set +a
unset WIND_DATABASE_URL WIND_POSTGRES_STAGING WIND_POSTGRES_TEST_ONLY WIND_POSTGRES_TEST_SCHEMA
# The dry run talks to nothing outside the VM: no Firebase, email or SMS provider keys (Haiku PR #101 M2).
for v in $(compgen -e | grep -E '^(WIND_FIREBASE|FIREBASE|GOOGLE_|WIND_EMAIL|WIND_SMTP|WIND_SMS|WIND_OTP|WIND_PHONE|CLOUDFLARE)' || true); do unset "$v"; done
cd "$REL"
# 8<&-: the dry run never holds the database lock (Sol recheck L2).
sudo -u wind -E env NODE_ENV=production PORT=4010 HOST=127.0.0.1 DB_PATH="$DRY/wind.db" TZ=Asia/Hebron WEB_ROOT="$REL/web" \
  /opt/node/bin/node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning server/main.ts > "$WORK/dry.log" 2>&1 8<&- &
PID=$! # sudo relays the kill to node
cd /
ok=0; for i in $(seq 1 60); do
  kill -0 "$PID" 2>/dev/null || break
  curl -fsS -m 3 http://127.0.0.1:4010/api/ready > "$WORK/ready.json" 2>/dev/null &&
    sqlite_response < "$WORK/ready.json" && { ok=1; break; }; sleep 1
done
kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; PID=""
[ "$ok" -eq 1 ] || { say "dry run failed on a copy of the live data; the live service is untouched"; tail -20 "$WORK/dry.log" >&2; exit 1; }
echo "dry run on a copy of the live data: $(cat "$WORK/ready.json")"

# The previous release, whatever form the host has it in.
if [ -L "$LIVE" ]; then PREV=$(readlink -f "$LIVE"); [ -d "$PREV" ] || PREV="" # a dangling pointer from a failed first install
elif [ -d "$LIVE" ] && [ -n "$(ls -A "$LIVE")" ]; then PREV="$RELEASES/legacy-$STAMP"
elif [ -e "$LIVE" ] && [ ! -d "$LIVE" ]; then say "$LIVE is neither a directory nor a symlink"; exit 1
fi

# Freeze: no requests, then no writer, both checked. From here a failure recovers through on_exit; an uncertain stop or a failed
# checkpoint changes nothing, and the previous release is reopened only once it answers /api/ready.
PHASE=frozen # from the Caddy stop on, any exit reopens what was there (Sonnet L1)
stopped caddy || { say "Caddy did not stop; nothing was changed"; exit 1; }
printf 'install %s in progress (%s)\n' "$STAMP" "$(date -u +%FT%TZ)" > "$HOLD"
sync # the hold is on disk before anything moves, so a power loss reboots closed
drain_backup || { say "a backup is still running or queued; nothing was changed"; exit 1; }
{ stopped wind-api && port_free 4000; } || { say "the API did not stop for certain; nothing was changed"; exit 1; }
if [ -s "$DB" ]; then
  snapshot "$DB" "$SNAP" || { as_wind rm -f -- "$SNAP"; say "the checkpoint failed; nothing was changed"; exit 1; }
  CHECKPOINT=$SNAP; echo "checkpoint of the stopped database: $SNAP"
  # From now on the API refuses to start without a database instead of creating an empty one (provision.sh unit check).
  as_wind touch -- "$DATA/.wind-db-expected"
fi

# Switch (a one-time move of a legacy directory first; its window is only while the API is stopped).
PHASE=switched
if [ "$PREV" = "$RELEASES/legacy-$STAMP" ]; then mv -T "$LIVE" "$PREV"; elif [ -d "$LIVE" ] && [ ! -L "$LIVE" ]; then rmdir "$LIVE"; fi
point "$REL"
sync
PHASE=started # from the start command on, the candidate may write to the live database
systemctl start wind-api
ready 60 || { journalctl -u wind-api -n 20 --no-pager >&2; say "the candidate did not become ready"; exit 1; }
# Commit: from here the candidate is the release and its database is the database. A signal or a Caddy failure after this line
# never rolls anything back, because Caddy may already have let requests through (Sol second recheck of PR #101).
trap '' INT TERM HUP # the commit tail (lift the hold, start Caddy) always completes (Sonnet L2, Sol recheck 5)
PHASE=live
# A first-ever install that created the database marks it too: from now on the API never starts on a fresh empty file.
[ ! -s "$DB" ] || as_wind touch -- "$DATA/.wind-db-expected" || say "could not write the database marker; committing anyway" # Haiku N2
systemctl enable wind-api >/dev/null 2>&1 || true
rm -f -- "$HOLD"; sync
systemctl start caddy || { say "the new release is live and ready, but Caddy did not start ($(state)): sudo systemctl start caddy"; exit 1; }
echo "live: $(cat "$WORK/ready.json")"

# Keep the active release, the previous one and the three newest others; checkpoints keep their own 30 days. Listings are empty-safe (Sol recheck L1).
ACTIVE=$(readlink -f "$LIVE")
prune() { # $1 directory, $2 name pattern, $3 how many to keep besides the active release
  find "$1" -mindepth 1 -maxdepth 1 -type d -name "$2" -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2- | { grep -vxF -e "$ACTIVE" -e "${PREV:-$ACTIVE}" || true; } \
    | tail -n +"$(( $3 + 1 ))" | while read -r tree; do case "$tree" in "$1"/?*) rm -rf -- "$tree" ;; esac; done
}
prune "$RELEASES" '*' 3 || say "could not prune old releases"
prune /opt 'windapi-old-*' 1 || say "could not prune pre-symlink release trees"
as_wind find "$DATA/backups" -maxdepth 1 -name 'pre-install-*.db' -mtime +30 -delete || say "could not prune old checkpoints" # Haiku F5
echo "previous release: ${PREV:-none}; checkpoint: ${CHECKPOINT:-none}"
