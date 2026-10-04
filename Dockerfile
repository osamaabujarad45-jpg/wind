# Build the installable iPhone web app once. It uses the same public API origin as the native app.
FROM node:24-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app.json app.config.js tsconfig.json expo-env.d.ts ./
COPY assets ./assets
COPY plugins ./plugins
COPY src ./src
COPY public ./public
ENV EXPO_PUBLIC_API_URL=https://wind-production-72aa.up.railway.app WIND_RELEASE=1 WIND_LOCAL_TEST=0 NODE_ENV=production
RUN npx expo export --platform web

# Wind API. Node 24 runs the TypeScript directly (node:http + node:sqlite).
FROM node:24-slim
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY server ./server
COPY src/model.ts ./src/model.ts
COPY --from=web-build /app/dist ./web
COPY assets/icon.png ./web/wind-icon.png
# TZ sets the calendar day for earnings and the admin dashboard.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DB_PATH=/data/wind.db WEB_ROOT=/app/web TZ=Asia/Hebron
EXPOSE 4000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:4000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning", "server/main.ts"]
