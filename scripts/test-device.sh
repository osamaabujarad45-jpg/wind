#!/bin/sh
# Wind's test gates on the owner's Docker test device (owner rule, 19 Nov 2026: every test runs here).
#
# From Git Bash on Windows (Docker runs inside WSL):
#   MSYS_NO_PATHCONV=1 wsl.exe -e sh /mnt/c/<checkout>/scripts/test-device.sh [--serial] [suite ...]
# From WSL or Linux:
#   sh scripts/test-device.sh [--serial] [suite ...]
#
# Suites: typecheck lint unit persistence export parity (default: typecheck lint unit persistence export)
#   persistence  the full PostgreSQL suite (the repo requires PostgreSQL 18) on a run-owned PostgreSQL 18 sidecar
#   parity       eleven PostgreSQL suites on the owner's PostGIS 16 device (sandbox-pg-host, the production major)
#   export       the production web export with the deploy build arguments
# The container gets one archive, never a mount of the checkout: a clean checkout is archived from git objects (HEAD);
# uncommitted work sends tracked and unignored regular files only, without .env, .npmrc or keys. Nothing in the
# checkout is written except logs. Run on the owner's cloud sandbox by default; this WSL runner is the fallback.
# Logs: <checkout>/.expo/test-device/<UTC time>-<pid>/ (env.txt with the revision, summary.txt). Exit 0 only when every
# requested suite ran and passed. Gate evidence comes from a clean worktree: env.txt shows "+0 uncommitted".
#
# Speed: node_modules is installed once per (package-lock.json, image) into the volume wind-test-cache and hard-linked into
# each run (3.7 s, against 26 s for a copy); a package file whose content or mode changed (change time) is detected after
# the run, which then fails and drops the entry. An entry left in use by a killed run stops setup until it is cleared by
# hand (the message says how). typecheck+lint+export, then unit+persistence+parity, run side by side (--serial: one at a
# time). Runs are serialized by a host lock, and cache access by a lock inside the shared cache volume. A runner in another
# WSL namespace on the same Docker daemon does not wait for the sidecars: it stops at setup while another run holds them.
# This runner is the emergency fallback; the cloud sandbox is the test device.
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=0
if [ "${1:-}" = "--serial" ]; then SERIAL=1; shift; fi
SUITES=${*:-typecheck lint unit persistence export}
for s in $SUITES; do case $s in typecheck|lint|unit|persistence|export|parity) ;; *) echo "unknown suite: $s (typecheck lint unit persistence export parity)" >&2; exit 2 ;; esac; done

# One run at a time on this device: the PostgreSQL 18 sidecars and the dependency cache are shared resources.
exec 9>/tmp/wind-test-device.lock
flock -w 3600 9 || { echo "setup failed: the device stayed busy for an hour" >&2; exit 2; }
LOGS="$REPO/.expo/test-device/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$REPO/.expo/test-device" && mkdir "$LOGS" || { echo "setup failed: cannot create the log folder $LOGS" >&2; exit 2; } # fresh per invocation
SUMMARY="$LOGS/summary.txt"
fail_setup() { echo "setup failed: $1" | tee -a "$SUMMARY" >&2; exit 2; }

# Everything this invocation creates, and only that, is removed on exit.
LAUNCHED=""
SRC=$(mktemp -d /tmp/wind-test-src.XXXXXX) || fail_setup "source staging"
case "$SRC" in /tmp/wind-test-src.??????) ;; *) fail_setup "unexpected staging dir" ;; esac
cleanup() { [ -n "$LAUNCHED" ] && docker rm -f $LAUNCHED >/dev/null 2>&1; rm -rf "$SRC"; }
trap cleanup EXIT
trap 'exit 130' INT TERM # an interrupted run still cleans up through the EXIT trap

# The image: the owner's sandbox-node:local plus Node 24.12 (CI/production runtime) and PostgreSQL 16/18 clients. Tagged by
# the Dockerfile and the base image's id, so editing either builds a new image. Built from the Dockerfile alone (no context).
BASE=$(docker image inspect sandbox-node:local --format '{{.Id}}') || fail_setup "the owner's sandbox-node:local image is missing"
IMAGE="sandbox-node24:$({ cat "$REPO/infra/test-device/Dockerfile"; echo "$BASE"; } | sha256sum | cut -c1-12)"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build -q -t "$IMAGE" -t sandbox-node24:local - < "$REPO/infra/test-device/Dockerfile" >/dev/null || fail_setup "image build"
fi
IMAGE_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}' | cut -c8-19) || fail_setup "image id"

# The source. WSL's git cannot read a worktree whose .git points at a Windows path; Windows git (interop) can: pick once.
if git -C "$REPO" rev-parse HEAD >/dev/null 2>&1; then g() { git -C "$REPO" "$@"; }; else g() { git.exe -C "$(wslpath -w "$REPO")" "$@"; }; fi
COMMIT=$(g rev-parse HEAD 2>/dev/null) || COMMIT=""
REV=${COMMIT:+$(echo "$COMMIT" | cut -c1-8)}; REV=${REV:-unknown}
g status --porcelain > "$SRC/status" 2>/dev/null || fail_setup "git status failed: cannot tell whether the checkout is clean"
DIRTY=$(wc -l < "$SRC/status" | tr -d ' ')
# A tracked file that an ignore rule names (a key or .env committed by mistake) never reaches the container (Haiku r7 L-2).
g ls-files -c -i --exclude-standard > "$SRC/ignored" 2>/dev/null || fail_setup "git ls-files failed"
[ -s "$SRC/ignored" ] && fail_setup "tracked files match ignore rules (untrack them first): $(head -3 "$SRC/ignored" | tr '\n' ' ')"
# Credential-looking names, on both routes (Sol R10-L2): a clean archive refuses a tracked one, a dirty run skips one.
# .env.example is the reviewed template and passes.
# Matched on the lowercased path (Windows names are case-insensitive): every .env* name except the template.
SECRET='*/.env*|*/.npmrc|*/.netrc|*/.git-credentials|*.pem|*.key|*.p8|*.p12|*.jks|*.keystore|*.mobileprovision|*/id_rsa*|*/id_ed25519*|*/credentials*|*/service-account*|*/secrets*'
if [ -n "$COMMIT" ] && [ "$DIRTY" = 0 ]; then
  # Gate evidence: exactly the committed tree, from git objects. No working-tree file can reach the container (Sol R9-M1).
  # The names come from the pinned commit's own tree, and HEAD must still be that commit (Sol R11-M2).
  g ls-tree -r -z --name-only "$COMMIT" > "$SRC/all" || fail_setup "list $COMMIT"
  [ "$(g rev-parse HEAD 2>/dev/null)" = "$COMMIT" ] || fail_setup "HEAD moved while the run was starting; run it again"
  (xargs -0 -r sh -c 'for f; do l=$(printf "%s" "/$f" | tr "[:upper:]" "[:lower:]"); case "$l" in */.env.example) ;; '"$SECRET"') echo "$f"; exit 1 ;; esac; done; :' sh < "$SRC/all") > "$SRC/secret" \
    || fail_setup "a tracked file looks like a credential: $(cat "$SRC/secret"); untrack it or rename it"
  g archive --format=tar "$COMMIT" > "$SRC/src.tar" || fail_setup "archive $COMMIT"
else
  # A developer run of uncommitted work: tracked and unignored regular files and symlinks only, never a directory's
  # contents (a tracked path replaced by a directory, a symlinked parent), and never credential-looking files.
  g ls-files -z --cached --others --exclude-standard > "$SRC/all" || fail_setup "list source files"
  REAL=$(cd "$REPO" && pwd -P)
  (cd "$REPO" && xargs -0 -r sh -c '
    for f; do
      l=$(printf "%s" "/$f" | tr "[:upper:]" "[:lower:]"); case "$l" in */.env.example) ;; '"$SECRET"') continue ;; esac
      [ -e "$f" ] || [ -L "$f" ] || continue
      if [ -d "$f" ] && [ ! -L "$f" ]; then echo "tracked path is now a directory: $f" >&2; exit 1; fi
      d=$(dirname "$f"); [ "$(cd "$d" && pwd -P)" = "$0/$d" ] || [ "$d" = . ] || { echo "parent is a symlink: $f" >&2; exit 1; }
      printf "%s\0" "$f"
    done' "$REAL" < "$SRC/all" > "$SRC/files") || fail_setup "list source files"
  tar -C "$REPO" --null --no-recursion -T "$SRC/files" -cf "$SRC/src.tar" || fail_setup "archive source"
fi
EVIDENCE=no; [ -n "$COMMIT" ] && [ "$DIRTY" = 0 ] && EVIDENCE=yes
echo "checkout $REV (+$DIRTY uncommitted) | gate evidence: $EVIDENCE (only a clean, known revision counts) | image $IMAGE | suites: $SUITES" > "$LOGS/env.txt"

# PostgreSQL. PG16 is the owner's long-lived device (parity). PostgreSQL 18 sidecars belong to this invocation: one for
# persistence (55475), one for unit (55476), as both suites need the database fastship_test and lock each other out on one
# server. Fresh tmpfs, 1 GB shared memory (the 64 MB default makes pg_dump fail). 55474 stays free for ad-hoc checks.
# A container already holding one of these names is never touched (Sol R9-M2): setup stops and says how to clear it.
ready() { # container port: TCP readiness, as the tests connect (the image's init server listens on the socket only)
  i=0; until docker exec "$1" pg_isready -h 127.0.0.1 -p "$2" -q 2>/dev/null; do i=$((i+1)); [ $i -gt 300 ] && return 1; sleep 1; done; }
pg18() { # name port
  docker ps -aq --filter "name=^$1$" | grep -q . && fail_setup "a container named $1 already exists: another run on this device is using it, or one was interrupted. Wait for an active run; remove it (docker rm -f $1) only when no run is active"
  id=$(docker run -d --name "$1" --label wind.test-device=1 --network host --shm-size=1g --tmpfs /var/lib/postgresql:rw,size=4g \
    -e POSTGRES_USER=fastship_test -e POSTGRES_PASSWORD=fastship_test -e POSTGRES_DB=fastship_test -e PGPORT="$2" \
    postgis/postgis:18-3.6 -c max_connections=300 -c fsync=off) || fail_setup "start $1"
  LAUNCHED="$LAUNCHED $id"; }
case " $SUITES " in *" parity "*)
  docker ps --format '{{.Names}}' | grep -qx sandbox-pg-host || docker start sandbox-pg-host >/dev/null || fail_setup "start sandbox-pg-host"
  ready sandbox-pg-host 55473 || fail_setup "sandbox-pg-host not ready over TCP after 300 s" ;;
esac
case " $SUITES " in *" persistence "*) pg18 wind-test-pg18 55475 ;; esac
case " $SUITES " in *" unit "*) pg18 wind-test-pg18u 55476 ;; esac
case " $SUITES " in *" persistence "*) ready wind-test-pg18 55475 || fail_setup "wind-test-pg18 not ready over TCP after 300 s" ;; esac
case " $SUITES " in *" unit "*) ready wind-test-pg18u 55476 || fail_setup "wind-test-pg18u not ready over TCP after 300 s" ;; esac

docker run --rm --network host --entrypoint sh \
  -v "$SRC/src.tar":/src.tar:ro -v "$LOGS":/logs -v wind-test-cache:/cache \
  -e SUITES="$SUITES" -e SERIAL="$SERIAL" -e IMAGE_ID="$IMAGE_ID" \
  -e PG16_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55473/fastship_test \
  -e PG18_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55475/fastship_test \
  -e PG18U_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55476/fastship_test \
  "$IMAGE" -c '
  set -u
  die() { echo "setup failed: $1" >> /logs/summary.txt; exit 2; }
  mkdir -p /cache/runs /cache/nm || die "cache volume"
  # One run at a time per cache volume, whichever WSL namespace started it (Sol R11-M1): held until the container exits.
  exec 8>/cache/.wind-run.lock && flock -w 3600 8 || die "the cache volume stayed busy for an hour"
  RUN=$(mktemp -d /cache/runs/run.XXXXXX) || die "run dir"
  case "$RUN" in /cache/runs/run.??????) ;; *) die "unexpected run dir" ;; esac
  STAGE=""
  trap "rm -rf \"$RUN\"; [ -n \"\$STAGE\" ] && rm -rf \"\$STAGE\"" EXIT
  trap "exit 130" INT TERM
  APP="$RUN/app"; mkdir -p "$APP" || die "app dir"
  tar -C "$APP" -xf /src.tar || die "unpack source"
  [ -f "$APP/package-lock.json" ] || die "unpack source (no package-lock.json)"
  KEY=$(sha256sum < "$APP/package-lock.json" | cut -c1-16)-$IMAGE_ID
  case "$KEY" in [0-9a-f]*-[0-9a-f]*) ;; *) die "unexpected cache key" ;; esac
  # An entry marked in use belongs to another run, or to one that died mid-run and may have changed it: never evicted
  # here (Sol R10-M2). Setup stops and says how to clear it once no run is using it.
  [ -e "/cache/nm/$KEY/.in-use" ] && die "dependency cache entry $KEY is in use (another run, or one interrupted). When no run is active: docker run --rm -v wind-test-cache:/cache alpine rm -rf /cache/nm/$KEY"
  if [ ! -d "/cache/nm/$KEY/node_modules" ]; then
    # First run for this lockfile and image: install in the full copy (install scripts may read repo files), then publish.
    # An entry without node_modules is an earlier failed publish under this key: replaced.
    (cd "$APP" && npm ci --no-audit --no-fund > /logs/npm-ci.log 2>&1) || die "npm ci (see npm-ci.log)"
    STAGE=$(mktemp -d /cache/nm/stage.XXXXXX) || die "stage dir"
    mv "$APP/node_modules" "$STAGE/node_modules" && rm -rf "/cache/nm/$KEY" && mv -T "$STAGE" "/cache/nm/$KEY" || die "publish node_modules"
    STAGE=""
  fi
  touch "/cache/nm/$KEY/.in-use" || die "cache marker"
  cp -al "/cache/nm/$KEY/node_modules" "$APP/node_modules" || die "link node_modules"
  # After linking (a new link changes the change time of each inode): any later write or mode change to a shared inode shows.
  sleep 1; touch "$RUN/start"; sleep 1 # a change in the same clock tick as the marker would not count as newer (Haiku r8 N4)
  # Tool caches go to a directory of this run (a new directory, not a link), so routine cache writes never reach the cache.
  rm -rf "$APP/node_modules/.cache" && mkdir "$APP/node_modules/.cache" || die "private cache dir"
  cd "$APP"
  echo "node $(node -v) | deps $KEY" >> /logs/env.txt
  suite() {
    case $1 in
      typecheck) npx tsc --noEmit ;;
      lint) npx expo lint ;;
      unit) WIND_TEST_DATABASE_URL=$PG18U_URL WIND_TEST_PG_BIN=/usr/lib/postgresql/18/bin npm test ;;
      persistence) WIND_TEST_DATABASE_URL=$PG18_URL WIND_TEST_PG_BIN=/usr/lib/postgresql/18/bin npm run test:persistence ;;
      export) EXPO_PUBLIC_API_URL=https://4.223.118.16.sslip.io EXPO_PUBLIC_SUPPORT_WHATSAPP=972597127547 WIND_RELEASE=1 WIND_LOCAL_TEST=0 \
        NODE_ENV=production EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1 EXPO_UNSTABLE_TREE_SHAKING=1 npx expo export --platform web --clear --output-dir "$RUN/dist" ;;
      parity) rc=0; for f in pg-dialect pg-contracts pg-cash pg-claims pg-shop pg-import ride-lifecycle dispatch eligibility ledger payments; do
          if WIND_TEST_DATABASE_URL=$PG16_URL WIND_TEST_PG_BIN=/usr/lib/postgresql/16/bin node tests/$f.mjs; then echo "PASS $f"; else echo "FAIL $f"; rc=1; fi
        done; return $rc ;;
    esac
  }
  run() { start=$(date +%s); suite "$1" > "/logs/$1.log" 2>&1; rc=$?; echo "$1 exit $rc ($(( $(date +%s) - start ))s)" >> /logs/summary.txt
    if [ $rc -ne 0 ]; then grep -vE "^\{\"category\"" "/logs/$1.log" | grep -m3 -E "AssertionError|Error:|^FAIL|✖" | sed "s/^/  /" >> /logs/summary.txt
      grep -m2 -E "at (async )?file:" "/logs/$1.log" | sed "s/^/  /" >> /logs/summary.txt; fi; return $rc; }
  status=0
  for wave in "typecheck lint export" "unit persistence parity"; do
    pids=""
    for s in $wave; do case " $SUITES " in *" $s "*)
      if [ "$SERIAL" = 1 ]; then run "$s" || status=1; else run "$s" & pids="$pids $!"; fi ;; esac; done
    for p in $pids; do wait "$p" || status=1; done
  done
  # A package file rewritten in place shares its inode with the cache: the run is not evidence, and the entry is dropped.
  # Change time, not modification time: a chmod through a link changes the inode without touching mtime (Sol R9-L1).
  # An invalid entry leaves the reusable path first (one rename, under the volume lock), then is deleted: a removal that
  # stops halfway can never look like a cache hit (Sol R13-L3).
  drop() {
    if mv -T "/cache/nm/$KEY" "/cache/nm/trash.$$"; then rm -rf "/cache/nm/trash.$$"; echo "entry $KEY dropped; the next run reinstalls" >> /logs/summary.txt
    else echo "could not drop dependency cache entry $KEY (its in-use marker remains): remove it by hand" >> /logs/summary.txt; fi
  }
  # The branch follows the exit status of the scan and of reading its result: an unreadable cache is not a clean one, and
  # only a clean, readable scan releases the entry (Sol R10-M2, R12-L4).
  if find "/cache/nm/$KEY/node_modules" -path "*/node_modules/.cache" -prune -o -cnewer "$RUN/start" -print > "$RUN/changed"     && changed=$(head -3 "$RUN/changed"); then
    if [ -n "$changed" ]; then
      { echo "dependency cache changed in place:"; echo "$changed" | sed "s/^/  /"; } >> /logs/summary.txt
      drop; status=1
    elif ! rm -f "/cache/nm/$KEY/.in-use"; then
      echo "could not release dependency cache entry $KEY (its in-use marker remains)" >> /logs/summary.txt; status=1
    fi
  else
    echo "dependency cache scan failed" >> /logs/summary.txt
    drop; status=1
  fi
  exit $status'
STATUS=$?
# Every requested suite must have reported a pass in this invocation's own summary, whatever the exit code says.
for s in $SUITES; do
  grep -q "^$s exit 0 " "$SUMMARY" 2>/dev/null && continue
  [ $STATUS -eq 0 ] && STATUS=1
  grep -q "^$s exit" "$SUMMARY" 2>/dev/null || echo "$s did not run" >> "$SUMMARY"
done
cat "$LOGS/env.txt" "$SUMMARY" 2>/dev/null
echo "logs: $LOGS"
exit $STATUS
