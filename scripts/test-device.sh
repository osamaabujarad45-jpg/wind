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
# The checkout is copied read-only (local .env files excluded); nothing in it is written except the log folder.
# Logs: <checkout>/.expo/test-device/<UTC time>/ (summary.txt first). Exit 0 only when every requested suite ran and passed.
#
# Speed: node_modules is installed once per (package-lock.json, image) into the volume wind-test-cache and hard-linked into
# each run (no npm ci when neither changed); typecheck+lint+export, then unit+persistence+parity, run side by side
# (--serial runs one suite at a time). Runs on one device are serialized by a lock; a second run waits for the first.
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=0
if [ "${1:-}" = "--serial" ]; then SERIAL=1; shift; fi
SUITES=${*:-typecheck lint unit persistence export}
for s in $SUITES; do case $s in typecheck|lint|unit|persistence|export|parity) ;; *) echo "unknown suite: $s (typecheck lint unit persistence export parity)" >&2; exit 2 ;; esac; done
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOGS="$REPO/.expo/test-device/$STAMP"
mkdir -p "$LOGS" || exit 2
SUMMARY="$LOGS/summary.txt"
fail_setup() { echo "setup failed: $1" | tee -a "$SUMMARY" >&2; exit 2; }

# One run at a time on this device: the PostgreSQL 18 sidecar and the dependency cache are shared resources.
exec 9>/tmp/wind-test-device.lock
flock 9 || fail_setup "lock"

# The image: the owner's sandbox-node:local plus Node 24.12 (CI/production runtime) and PostgreSQL 16/18 clients.
# Tagged by the Dockerfile's hash, so an edit to it builds a new image instead of reusing a stale one.
IMAGE_TAG=$(sha256sum "$REPO/infra/test-device/Dockerfile" | cut -c1-12)
IMAGE="sandbox-node24:$IMAGE_TAG"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build -q -t "$IMAGE" -t sandbox-node24:local "$REPO/infra/test-device" >/dev/null || fail_setup "image build"
fi

# PostgreSQL. PG16 is the owner's long-lived device (parity). PostgreSQL 18 sidecars are owned by this run (label
# wind.test-device): one for persistence (55475) and one for unit (55476), because the suites both need the database
# fastship_test and lock each other out when they share one server. Fresh tmpfs, 1 GB shared memory (the 64 MB default
# makes pg_dump fail), removed when the run ends. 55474 stays free for agents' ad-hoc checks.
owned() { docker ps -aq --filter "name=^$1$" --filter label=wind.test-device=1; }
cleanup() { for n in wind-test-pg18 wind-test-pg18u; do owned $n; done | xargs -r docker rm -f >/dev/null 2>&1; }
ready() { # container port: TCP readiness, as the tests connect (the image's init server listens on the socket only)
  i=0; until docker exec "$1" pg_isready -h 127.0.0.1 -p "$2" -q 2>/dev/null; do i=$((i+1)); [ $i -gt 300 ] && return 1; sleep 1; done; }
pg18() { # name port
  if docker ps -aq --filter "name=^$1$" | grep -q .; then
    owned "$1" | grep -q . || fail_setup "a container named $1 exists that this runner does not own; remove or rename it"
    owned "$1" | xargs -r docker rm -f >/dev/null
  fi
  docker run -d --name "$1" --label wind.test-device=1 --network host --shm-size=1g --tmpfs /var/lib/postgresql:rw,size=4g     -e POSTGRES_USER=fastship_test -e POSTGRES_PASSWORD=fastship_test -e POSTGRES_DB=fastship_test -e PGPORT="$2"     postgis/postgis:18-3.6 -c max_connections=300 -c fsync=off >/dev/null || fail_setup "start $1"; }
trap cleanup EXIT
case " $SUITES " in *" parity "*)
  docker ps --format '{{.Names}}' | grep -qx sandbox-pg-host || docker start sandbox-pg-host >/dev/null || fail_setup "start sandbox-pg-host"
  ready sandbox-pg-host 55473 || fail_setup "sandbox-pg-host not ready over TCP after 300 s" ;;
esac
case " $SUITES " in *" persistence "*) pg18 wind-test-pg18 55475 ;; esac
case " $SUITES " in *" unit "*) pg18 wind-test-pg18u 55476 ;; esac
case " $SUITES " in *" persistence "*) ready wind-test-pg18 55475 || fail_setup "wind-test-pg18 not ready over TCP after 300 s" ;; esac
case " $SUITES " in *" unit "*) ready wind-test-pg18u 55476 || fail_setup "wind-test-pg18u not ready over TCP after 300 s" ;; esac

# WSL's git cannot read a worktree whose .git points at a Windows path; Windows git (interop) can.
g() { git -C "$REPO" "$@" 2>/dev/null || git.exe -C "$(wslpath -w "$REPO" 2>/dev/null)" "$@" 2>/dev/null; }
REV=$(g rev-parse --short HEAD) || REV=unknown
DIRTY=$(g status --porcelain | wc -l | tr -d ' ')
echo "checkout $REV (+$DIRTY uncommitted) | image $IMAGE | suites: $SUITES" > "$LOGS/env.txt"

docker run --rm --network host --entrypoint sh \
  -v "$REPO":/src:ro -v "$LOGS":/logs -v wind-test-cache:/cache \
  -e SUITES="$SUITES" -e SERIAL="$SERIAL" -e IMAGE_TAG="$IMAGE_TAG" \
  -e PG16_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55473/fastship_test \
  -e PG18_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55475/fastship_test \
  -e PG18U_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55476/fastship_test \
  "$IMAGE" -c '
  set -u
  die() { echo "setup failed: $1" >> /logs/summary.txt; exit 2; }
  mkdir -p /cache/runs /cache/nm || die "cache volume"
  RUN=$(mktemp -d /cache/runs/run.XXXXXX) || die "run dir"
  case "$RUN" in /cache/runs/run.??????) ;; *) die "unexpected run dir" ;; esac
  trap "rm -rf \"$RUN\"" EXIT
  APP="$RUN/app"; mkdir -p "$APP" || die "app dir"
  tar -C /src -cf - --exclude=./node_modules --exclude=./.git --exclude=./.expo --exclude=./dist --exclude="*.db" \
    --exclude="*.db-wal" --exclude="*.db-shm" --exclude=./.env --exclude="./.env.*" . | tar -C "$APP" -xf - || die "copy checkout"
  [ -f "$APP/package-lock.json" ] || die "copy checkout (no package-lock.json)"
  KEY=$(sha256sum < "$APP/package-lock.json" | cut -c1-16)-$IMAGE_TAG
  if [ ! -d "/cache/nm/$KEY/node_modules" ]; then
    # First run for this lockfile and image: install in the full copy (install scripts may read repo files), then publish.
    (cd "$APP" && npm ci --no-audit --no-fund > /logs/npm-ci.log 2>&1) || die "npm ci (see npm-ci.log)"
    STAGE=$(mktemp -d /cache/nm/stage.XXXXXX) || die "stage dir"
    mv "$APP/node_modules" "$STAGE/node_modules" && mv "$STAGE" "/cache/nm/$KEY" || die "publish node_modules"
  fi
  # ponytail: hard links, so a tool that rewrites a package file in place would reach the cache; none of the suites do.
  # Their caches live in node_modules/.cache, which each run gets fresh. Switch to cp -a if that ever changes.
  cp -al "/cache/nm/$KEY/node_modules" "$APP/node_modules" || die "link node_modules"
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
  exit $status'
STATUS=$?
# Every requested suite must have reported a pass, whatever the exit code says.
for s in $SUITES; do
  grep -q "^$s exit 0 " "$SUMMARY" 2>/dev/null && continue
  [ $STATUS -eq 0 ] && STATUS=1
  grep -q "^$s exit" "$SUMMARY" 2>/dev/null || echo "$s did not run" >> "$SUMMARY"
done
cat "$LOGS/env.txt" "$SUMMARY" 2>/dev/null
echo "logs: $LOGS"
exit $STATUS
