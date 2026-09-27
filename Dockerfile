# Wind API. No npm dependencies: Node 24 runs the TypeScript directly (node:http + node:sqlite).
FROM node:24-slim
WORKDIR /app
COPY server ./server
COPY src/model.ts ./src/model.ts
# TZ sets the calendar day for earnings and the admin dashboard.
ENV NODE_ENV=production PORT=4000 DB_PATH=/data/wind.db TZ=Asia/Hebron
# ponytail: runs as root because hosted volumes (Fly, Railway) mount root-owned; add a chown entrypoint to drop privileges.
VOLUME /data
EXPOSE 4000
CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning", "server/main.ts"]
