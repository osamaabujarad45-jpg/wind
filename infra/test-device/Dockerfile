# The owner's Wind test device (sandbox-node:local: /src -> /app copy, npm ci, exec) with the runtime CI and production use:
# Node 24.12.0, plus the PostgreSQL 16 client tools that pg-import needs against sandbox-pg-host.
FROM sandbox-node:local
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates curl xz-utils postgresql-common >/dev/null \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null \
 && apt-get install -y -qq --no-install-recommends postgresql-client-16 postgresql-client-18 >/dev/null \
 && curl -fsSL https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1 \
 && node -v && npm -v && rm -rf /var/lib/apt/lists/*
