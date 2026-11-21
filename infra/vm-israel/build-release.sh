#!/bin/bash
# Build a Wind API release tree in the cloud sandbox from a synced workspace (docs/operations/deploy.md, 16 November host).
# It mirrors the Dockerfile: production web export, runtime dependency closure, then the deploy.md assembly.
# Usage: bash -s <workspace> <label> < release-remote.sh
# Output: /home/agent/releases/wind-<label>.tar.gz plus its .sha256 file. It never touches the workspace's node_modules.
set -euo pipefail
WS=${1:?workspace}; LABEL=${2:-candidate}
API_HOST=${WIND_API_HOST:-20.217.202.98.sslip.io}
export PATH=/home/agent/node24/bin:$PATH
OUT=/home/agent/releases; STAGE=$(mktemp -d /tmp/wind-release-XXXXXX)
mkdir -p "$OUT"
cd "$WS"
rm -rf dist api-runtime
EXPO_PUBLIC_API_URL=https://$API_HOST EXPO_PUBLIC_SUPPORT_WHATSAPP=972597127547 WIND_RELEASE=1 WIND_LOCAL_TEST=0 \
  NODE_ENV=production EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1 EXPO_UNSTABLE_TREE_SHAKING=1 \
  NODE_OPTIONS=--max-old-space-size=3072 npx expo export --platform web --clear --output-dir dist >/tmp/wind-release-export.log 2>&1 \
  || { tail -30 /tmp/wind-release-export.log; exit 1; }
node scripts/runtime-dependencies.mjs api-runtime
T="$STAGE/windapi"; mkdir -p "$T"
cp -a server "$T/server"
cp -a api-runtime/src "$T/src"
cp -a api-runtime/node_modules "$T/node_modules"
cp -a dist "$T/web"
cp assets/icon.png "$T/web/wind-icon.png"
install -m 755 infra/vm-student/backup.sh "$T/backup.sh" # run by the unprivileged service user
# A release never carries secrets or local databases.
# -print -quit, not `| grep -q`: under pipefail a SIGPIPE'd find made the pipeline fail and the guard pass (Haiku PR #98 M-1).
if [ -n "$(find "$T" \( -name '.env' -o -name '.env.*' -o -name '*.db' -o -name '*.sqlite*' -o -name '*.pem' -o -name '*.key' \) -print -quit)" ]; then
  echo "secret or database file in release tree" >&2; exit 1; fi
# The packaged API must start on its own: a throwaway database on a spare port, parcel only, as production runs.
DB=$(mktemp /tmp/wind-release-db-XXXXXX); rm -f "$DB"
( cd "$T" && NODE_ENV=production PORT=4010 HOST=127.0.0.1 DB_PATH="$DB" WEB_ROOT="$T/web" TZ=Asia/Hebron WIND_ENABLED_SERVICES=parcel \
  WIND_DRIVER_PRESENCE=off WIND_IDENTITY_MODE=self-service SUPPORT_CONTACT=+972597127547 WIND_TRUST_PROXY=1 WIND_PUSH_SUBJECT=https://$API_HOST \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning server/main.ts >/tmp/wind-release-dry.log 2>&1 & echo $! >/tmp/wind-release-dry.pid )
ok=0; for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:4010/api/ready >/tmp/wind-release-ready.json 2>/dev/null; then ok=1; break; fi; sleep 1; done
web=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4010/ || true)
kill "$(cat /tmp/wind-release-dry.pid)" 2>/dev/null || true; sleep 1; rm -f "$DB" "$DB"-wal "$DB"-shm
[ $ok -eq 1 ] || { echo "dry run did not become ready"; tail -30 /tmp/wind-release-dry.log; exit 1; }
echo "dry run ready: $(cat /tmp/wind-release-ready.json) web=$web"
[ "$web" = 200 ] || { echo "web root did not answer 200"; exit 1; }
tar -C "$STAGE" -czf "$OUT/wind-$LABEL.tar.gz" windapi
( cd "$OUT" && sha256sum "wind-$LABEL.tar.gz" > "wind-$LABEL.tar.gz.sha256" && cat "wind-$LABEL.tar.gz.sha256" )
rm -rf "$STAGE" dist api-runtime
echo "release $OUT/wind-$LABEL.tar.gz for https://$API_HOST"
