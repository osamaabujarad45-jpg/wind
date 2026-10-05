# SPEC: routing-eta (Wind)

Status: approved by owner ("go", 2026-10-05) including the extra Railway service. Lifecycle: spec → plan → build → test → review → ship.

## Problem
The live map draws a dashed straight line, and the app has no "driver arrives in N min". Uber/Careem show the road
route and an ETA that updates as the car moves. Straight-line distance is badly wrong here: Ramallah→Nablus is
46 km as the crow flies and ~60 km by road, and roads bend around settlements and checkpoints.

## Design
- **OSRM, self-hosted** as Railway service `osrm` (image `ghcr.io/project-osrm/osrm-backend:v26.6.1-amd64-alpine`,
  Geofabrik `israel-and-palestine` extract, car profile, MLD), reachable only on Railway's private network
  (`http://osrm.railway.internal:5000`). Customer and driver coordinates never leave our infrastructure. Source:
  `infra/osrm/`. The road graph is rebuilt by redeploying the service (fresh extract each build).
- **Wind server** `GET /api/route?from=lat,lng&to=lat,lng` (signed-in users, rate-limited): proxies OSRM
  `route/v1/driving`, 3 s timeout, in-memory LRU cache keyed by coordinates rounded to ~10 m.
  Returns `{ km, minutes, line: [[lng, lat], ...] }`. With `OSRM_URL` unset or OSRM down → `503 route_unavailable`;
  clients keep today's straight line and straight-line ETA.
- **Public track page** `GET /api/track/:token/eta`: driver → next stop (city centre — the public page never sees
  exact pins), `{ minutes }` only, no geometry.
- **Client**: the map draws the road line pickup→dropoff (solid) instead of the dashed straight one; the order
  screen shows "Driver ~7–10 min away" (to pickup before collection, to dropoff after). ETA refreshes when the
  driver moved ~110 m (coordinates rounded to 3 decimals; a fresh fix within that cell reuses the answer). Range = OSRM minutes … ×1.3 + 2 (checkpoints make single numbers lie).

## Acceptance
- AC1 `/api/route` validates coordinates (400), needs a session (401), returns 503 without OSRM, caches repeats.
- AC2 Order screen and public page show an ETA range while a driver is live; nothing when stale or no OSRM.
- AC3 Map draws the OSRM line when available, the straight dashed line otherwise.
- AC4 OSRM is not publicly reachable; Wind reaches it privately. Live check: Ramallah→Nablus returns 45–70 km (measured 53.6 km, 62 min; straight line 46 km).
- AC5 Existing suites green; web first-paint bundle growth ≤ 2 kB gzip. **Missed: +3.1 kB gzip (479.5 → 482.6 kB), accepted by lead** (road hook, ETA copy, road layer).

## Revision 2026-10-05 (owner: "line must go through the road, not a direct line")
- No straight lines anywhere: the dashed pickup→dropoff fallback is gone (web, Android `map.html`, iOS). Without a route the map shows pins only.
- OSRM `overview=full` (simplified geometry cut corners through buildings at street zoom; Ramallah→Al-Bireh 50 points vs 19).
- Driver leg drawn on roads in the driver colour (`approach`), refetched every ~110 m; the driver's heading is sent as an
  OSRM `bearings` hint (±60°, rounded to 15°) so the fastest route starts the way the car faces instead of a U-turn.
- Booking preview draws the road route and shows road km ("≈ 53.5 km" Ramallah→Nablus; straight line 46.3). Price still uses the straight-line tariff.
- Public tracking page: `/track/:token/eta` adds `approach` (driver → next city centre) and `road` (city centre → city centre).
- Maps frame the whole road route when no driver is live; the Android page re-frames after the WebView gets its real size.
- Local phone checks use the free public OSRM server (`OSRM_URL=https://router.project-osrm.org`), never a straight-line stub.
