#!/bin/sh
# Wind's test gates on the owner's Docker test device (owner rule, 19 Nov 2026: every test runs here).
#
# From Git Bash on Windows (Docker runs inside WSL):
#   MSYS_NO_PATHCONV=1 wsl.exe -e sh /mnt/c/<repo>/scripts/test-device.sh [--serial] [suite ...]
# From WSL or Linux:
#   sh scripts/test-device.sh [--serial] [suite ...]
#
# Suites: typecheck lint unit persistence export parity (default: typecheck lint unit persistence export)
#   persistence  the full PostgreSQL suite (the repo requires PostgreSQL 18) on sandbox-pg18-host, restarted fresh per run
#   parity       eleven PostgreSQL suites on sandbox-pg-host (PostGIS 16, the production infrastructure's major)
#   export       the production web export with the deploy build arguments
# The checkout under test is the repository this script lives in, copied read-only; nothing in it is written.
# Logs: <repo>/.expo/test-device/<UTC time>/ (summary.txt first). The exit code is non-zero when any suite fails.
#
# Speed: node_modules is installed once per package-lock.json hash into the volume wind-test-cache and hard-linked into each
# run (no npm ci when the lockfile is unchanged); typecheck+lint+export, then unit+persistence+parity, run side by side (--serial runs one
# suite at a time on a busy machine).
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
SERIAL=0
if [ "${1:-}" = "--serial" ]; then SERIAL=1; shift; fi
SUITES=${*:-typecheck lint unit persistence export}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOGS="$REPO/.expo/test-device/$STAMP"
mkdir -p "$LOGS"
IMAGE=sandbox-node24:local

# The image: the owner's sandbox-node:local plus Node 24.12 (CI/production runtime) and PostgreSQL 16/18 clients.
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build -q -t "$IMAGE" "$REPO/infra/test-device" >/dev/null || { echo "image build failed" | tee "$LOGS/summary.txt"; exit 2; }
fi

# PostgreSQL. PG16 is the owner's device; PG18 is a sidecar the persistence suite needs, recreated per run on a fresh tmpfs
# with 1 GB of shared memory (the 64 MB default makes pg_dump fail).
case " $SUITES " in *" parity "*)
  docker ps --format '{{.Names}}' | grep -qx sandbox-pg-host || docker start sandbox-pg-host >/dev/null
  i=0; until docker exec sandbox-pg-host pg_isready -p 55473 -q 2>/dev/null; do i=$((i+1)); [ $i -gt 300 ] && { echo "sandbox-pg-host not ready after 300 s" >> "$LOGS/summary.txt"; break; }; sleep 1; done ;;
esac
case " $SUITES " in *" persistence "*|*" unit "*)
  docker rm -f sandbox-pg18-host >/dev/null 2>&1
  docker run -d --name sandbox-pg18-host --network host --shm-size=1g --tmpfs /var/lib/postgresql:rw,size=4g \
    -e POSTGRES_USER=fastship_test -e POSTGRES_PASSWORD=fastship_test -e POSTGRES_DB=fastship_test -e PGPORT=55474 \
    postgis/postgis:18-3.6 -c max_connections=300 -c fsync=off >/dev/null
  i=0; until docker exec sandbox-pg18-host pg_isready -p 55474 -q 2>/dev/null; do i=$((i+1)); [ $i -gt 300 ] && { echo "sandbox-pg18-host not ready after 300 s" >> "$LOGS/summary.txt"; break; }; sleep 1; done ;;
esac

docker run --rm --network host --entrypoint sh \
  -v "$REPO":/src:ro -v "$LOGS":/logs -v wind-test-cache:/cache \
  -e SUITES="$SUITES" -e SERIAL="$SERIAL" \
  -e PG16_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55473/fastship_test \
  -e PG18_URL=postgresql://fastship_test:fastship_test@127.0.0.1:55474/fastship_test \
  "$IMAGE" -c '
  set -u
  # Workspace on the cache volume so node_modules can be hard-linked in.
  mkdir -p /cache/runs /cache/nm
  RUN=$(mktemp -d /cache/runs/run.XXXXXX)
  case "$RUN" in /cache/runs/run.??????) ;; *) echo "bad run dir" > /logs/summary.txt; exit 2 ;; esac
  APP="$RUN/app"; mkdir -p "$APP"
  tar -C /src -cf - --exclude=./node_modules --exclude=./.git --exclude=./.expo --exclude=./dist --exclude="*.db" \
    --exclude="*.db-wal" --exclude="*.db-shm" . | tar -C "$APP" -xf -
  HASH=$(sha256sum "$APP/package-lock.json" | cut -c1-16)
  if [ ! -d "/cache/nm/$HASH/node_modules" ]; then
    # First run for this lockfile: install in the full copy (install scripts may read repo files), then keep it.
    (cd "$APP" && npm ci --no-audit --no-fund > /logs/npm-ci.log 2>&1) || { echo "npm ci failed (see npm-ci.log)" > /logs/summary.txt; exit 2; }
    mkdir -p "/cache/nm/$HASH.tmp" && mv "$APP/node_modules" "/cache/nm/$HASH.tmp/node_modules" && mv "/cache/nm/$HASH.tmp" "/cache/nm/$HASH"
  fi
  cp -al "/cache/nm/$HASH/node_modules" "$APP/node_modules"
  cd "$APP"
  echo "node $(node -v) | lockfile $HASH | suites: $SUITES" > /logs/env.txt
  suite() {
    case $1 in
      typecheck) npx tsc --noEmit ;;
      lint) npx expo lint ;;
      unit) WIND_TEST_DATABASE_URL=$PG18_URL WIND_TEST_PG_BIN=/usr/lib/postgresql/18/bin npm test ;;
      persistence) WIND_TEST_DATABASE_URL=$PG18_URL WIND_TEST_PG_BIN=/usr/lib/postgresql/18/bin npm run test:persistence ;;
      export) EXPO_PUBLIC_API_URL=https://4.223.118.16.sslip.io EXPO_PUBLIC_SUPPORT_WHATSAPP=972597127547 WIND_RELEASE=1 WIND_LOCAL_TEST=0 \
        NODE_ENV=production EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1 EXPO_UNSTABLE_TREE_SHAKING=1 npx expo export --platform web --clear --output-dir "$RUN/dist" ;;
      parity) rc=0; for f in pg-dialect pg-contracts pg-cash pg-claims pg-shop pg-import ride-lifecycle dispatch eligibility ledger payments; do
          if WIND_TEST_DATABASE_URL=$PG16_URL WIND_TEST_PG_BIN=/usr/lib/postgresql/16/bin node tests/$f.mjs; then echo "PASS $f"; else echo "FAIL $f"; rc=1; fi
        done; return $rc ;;
      *) echo "unknown suite $1"; return 2 ;;
    esac
  }
  run() { start=$(date +%s); suite "$1" > "/logs/$1.log" 2>&1; rc=$?; echo "$1 exit $rc ($(( $(date +%s) - start ))s)" >> /logs/summary.txt
    if [ $rc -ne 0 ]; then grep -vE "^\{\"category\"" "/logs/$1.log" | grep -m3 -E "AssertionError|Error:|^FAIL|✖" | sed "s/^/  /" >> /logs/summary.txt
      grep -m2 -E "at (async )?file:" "/logs/$1.log" | sed "s/^/  /" >> /logs/summary.txt; fi; return $rc; }
  status=0
  # Two waves of independent suites side by side; anything else in order.
  for wave in "typecheck lint export" "unit persistence parity"; do
    pids=""
    for s in $wave; do case " $SUITES " in *" $s "*)
      if [ "$SERIAL" = 1 ]; then run "$s" || status=1; else run "$s" & pids="$pids $!"; fi ;; esac; done
    for p in $pids; do wait "$p" || status=1; done
  done
  rm -rf "$RUN"
  exit $status'
STATUS=$?
cat "$LOGS/summary.txt" 2>/dev/null
echo "logs: $LOGS"
exit $STATUS
