# Plan: routing-eta (SPEC-routing-eta.md)

1. E1 (infra): `infra/osrm/Dockerfile` + railway.json; create service `osrm`, deploy, confirm build memory and route answer via `railway ssh` from wind.
2. E2 (server): `/api/route` proxy + LRU cache + rate limit; `/api/track/:token/eta`; tests with a fake OSRM HTTP server.
3. E3 (client): road line on the map; ETA range on order screen and public page; copy ar/en.
4. E4: set `OSRM_URL` on wind, deploy, live checks, perf check.
