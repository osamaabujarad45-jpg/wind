# Wind's test device image: the owner's sandbox-node:local with the runtime CI and production use (Node 24.12.0, verified
# against the release's SHASUMS256.txt) and the PostgreSQL 16 and 18 client tools pg-import needs. Built by
# scripts/test-device.sh, tagged with this file's hash.
# (WIND_NODE, not NODE_VERSION: the base image sets ENV NODE_VERSION=22.x, and an ENV overrides an ARG of the same name.)
FROM sandbox-node:local
ARG WIND_NODE=24.12.0
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates curl xz-utils postgresql-common >/dev/null \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null \
 && apt-get install -y -qq --no-install-recommends postgresql-client-16 postgresql-client-18 >/dev/null \
 && cd /tmp \
 && curl -fsSLO "https://nodejs.org/dist/v${WIND_NODE}/node-v${WIND_NODE}-linux-x64.tar.xz" \
 && curl -fsSL "https://nodejs.org/dist/v${WIND_NODE}/SHASUMS256.txt" | grep " node-v${WIND_NODE}-linux-x64.tar.xz\$" | sha256sum -c - \
 && tar -xJf "node-v${WIND_NODE}-linux-x64.tar.xz" -C /usr/local --strip-components=1 \
 && rm "node-v${WIND_NODE}-linux-x64.tar.xz" \
 && test "$(node -v)" = "v${WIND_NODE}" && npm -v && rm -rf /var/lib/apt/lists/*
