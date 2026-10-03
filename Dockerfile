# Wind API. No npm dependencies: Node 24 runs the TypeScript directly (node:http + node:sqlite).
FROM node:24-slim
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY server ./server
COPY src/model.ts ./src/model.ts
# TZ sets the calendar day for earnings and the admin dashboard.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DB_PATH=/data/wind.db TZ=Asia/Hebron
EXPOSE 4000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:4000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning", "server/main.ts"]
