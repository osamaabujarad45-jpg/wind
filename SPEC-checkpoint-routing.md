# SPEC: checkpoint-routing (Wind)

Follows SPEC-routing-eta.md and SPEC-road-aware-eta.md. Owner asked for "the best route" (2026-10-05).
Lifecycle: spec → plan → build → test → review → ship.

## Problem
OSRM gives the fastest road route, but it knows nothing about checkpoints. When drivers report a checkpoint
**closed**, the app warns and widens the ETA, yet the drawn route still goes straight through it — the one route a
driver cannot take. Checkpoints have no position (name + cities only), so routing cannot see them.

## Design
- **Position:** checkpoints get optional `lat`/`lng` (additive columns). Admins set it when adding a checkpoint or later
  ("Set on map" on Roads, same pin sheet as booking). Must lie within 25 km of one of its cities.
  `GET /api/roads` adds `point: {latitude, longitude} | null`. `POST /api/admin/roads/:id/place {point}` (admin).
- **Routing:** closed = a positioned, active checkpoint whose fresh (2 h) status is `closed`. `roadRoute` asks OSRM for up to 3
  alternatives (`alternatives=3`) and keeps the fastest whose line stays more than 200 m from every closed checkpoint and never drives back over itself (`backtracks`)
  (`nearLine` in `src/map-math.ts`, shared with the server). Measured 2026-10-05: OSRM returned **one** route for
  Ramallah→Nablus on both the public and our server, so alternatives alone rarely help. When none clears, it forces
  detours: routes via points 1, 2, 3, 5 and 8 km either side of the first crossed checkpoint, perpendicular to the route
  there (10 OSRM calls, in parallel, only while a closed checkpoint is on the route; cached). Fastest clear one wins; if none
  clears, keep the fastest.
  Response adds `avoids: string[]` (closed checkpoints the fastest route crossed and the chosen one avoids) and
  `through: string[]` (closed checkpoints the chosen route still crosses). Cache key includes the closed set, so a new
  report re-routes at once.
- **Where it shows:** the road line itself (order screen, booking preview, Android page, public page — all already draw
  `/api/route` geometry). Order screen and booking preview add one line: "Route avoids Huwwara (closed)" or
  "Route passes Huwwara (closed) — no way around found". Public page: line only, no names (unchanged rule).
- Slow checkpoints do not re-route (slow ≠ impassable); they keep the "N+ min" wording.

## Acceptance
- AC1 `nearLine` and `backtracks` unit-tested (on segment, beyond segment end, far; out-and-back vs U-turn).
- Measured on the phone check: via points that snap onto dead ends produce out-and-back detours (up to 23 km);
  150 m vs 250 m radius trade-off (see `CHECKPOINT_RADIUS` comment) — 200 m chosen.
- AC2 Route test (fake OSRM: alternatives and via-point detours): closed checkpoint on the fastest → second route + `avoids`;
  reported open → fastest; both alternatives blocked → fastest + `through`; unpositioned checkpoint ignored;
  cache re-routes when the closed set changes; URL carries `alternatives=3`; with no clear alternative a via-point detour is chosen.
- AC3 Roads test: point validated (bad coords 400, > 25 km 400), place endpoint admin-only, `point` in list.
- AC4 Phone (A53, debug build, local server, **real** OSRM from router.project-osrm.org, never a stub): admin sets a
  checkpoint position on the map; reporting it closed visibly re-routes the booking preview around it with the
  "avoids" line; reporting it open restores the fastest route. Arabic and English.
- AC5 `npm test`, tsc, lint, `npm run screens`; production OSRM answers `alternatives=3` after deploy.
