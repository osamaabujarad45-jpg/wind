# SPEC: live-map (Wind)

Status: approved by lead (Claude, 2026-10-05). Lifecycle: spec → plan → build → test → review → ship.

## Problem (measured, not assumed)

Uber/Careem's core experience is a real map: you drop a pin, you watch the car move.
Wind today:

| Surface | What users see now |
|---|---|
| Web + iPhone home-screen app (main iPhone path) | A hand-drawn **diagram** with fake roads (`src/route-preview.tsx`). Driver GPS is never drawn. |
| Android APK | Same diagram — no Google Maps key is baked into the build. |
| iOS native | Apple Map, static (no pan/zoom), 3 pins, no motion. |
| Dropoff | Never captured; every map uses the **city centre**. A Ramallah→Nablus parcel pins central Nablus. |
| Pickup | Optional GPS fix only; no way to correct a wrong fix or place a pin. |
| Driver marker | Jumps every 10 s poll; no heading, no accuracy. |
| Public track link | Same diagram; "Navigate" opens Google Maps at the driver's position. |

So maps are not accurate and tracking is not visible on the platforms people actually use.

## Scope (this module)

1. **Real web map** (web + home-screen app): MapLibre GL JS + OpenFreeMap vector tiles
   (free, no API key, commercial use allowed, OSM data). Arabic/English labels per app
   language (RTL text plugin). Lazy-loaded so the first paint does not pay for it.
2. **Pin picking at booking**: "Set on map" for pickup and dropoff — map centred on the
   chosen city or the GPS fix, a fixed centre pin, drag the map, confirm. The confirmed
   point's nearest city must equal the chosen city (else the city switches, with a note).
3. **Dropoff point stored**: `orders.dropoff_lat/dropoff_lng` (nullable, additive).
   Same visibility as `pickupPoint` (customer, assigned driver, admin). Partner (Souq)
   orders unchanged.
4. **Live driver on the map**: smooth marker interpolation between fixes, heading arrow
   when the device reports one, accuracy halo, "live / last seen" freshness kept from
   `location-state.ts`, auto-fit to driver + next stop, recenter button.
5. **Driver payload**: `/api/location` accepts optional `heading` (0–360) and `accuracy`
   (metres, 0–5000); stored on `driver_locations` (additive columns).
6. **Public track page**: same live map, but pickup/dropoff remain city-level (no private
   points leak through the public link — existing contract test stays green).
7. **Navigate buttons** for the driver open turn-by-turn to the exact pickup/dropoff point
   (Google Maps `dir` URL with `destination=lat,lng`), falling back to city + landmark text.
8. **Native**: iOS native map gets the same points + driver heading. Android without a key
   keeps the diagram (documented limit; follow-up: WebView map).

## Out of scope (later modules)

- Road-snapped polyline and road ETA → `routing-eta` (needs self-hosted OSRM; see capability map).
- Background GPS (Play policy), driver heat-maps, multi-stop.

## Acceptance criteria

- AC1 Web order screen shows a pannable/zoomable vector map with pickup, dropoff and live driver markers; markers use exact points when known, city centres otherwise.
- AC2 Booking can set pickup and dropoff by map; the order stores both; reopened order shows them.
- AC3 Driver marker animates between fixes (no jump), shows heading when supplied, hides when stale ≥120 s exactly as today.
- AC4 Public `/track/:token` never returns `pickupPoint`/`dropoffPoint` or notes (contract test).
- AC5 Invalid `dropoffPoint`, `heading`, `accuracy` → 400 `invalid_location`; omitted → accepted.
- AC6 Map JS is not in the initial web bundle (dynamic import); initial bundle growth ≤ 5 kB gzip.
- AC7 Map tiles fail (offline/blocked) → the diagram fallback renders, never a blank box.
- AC8 Arabic UI shows Arabic place labels; English shows Latin/English labels.
- AC9 Existing suites, tsc and lint stay green; schema upgrade from the current DB is additive.

## Constraints

No new paid provider. No API keys in the client. Respect OpenFreeMap fair use (tiles cached by the browser; no prefetch storms). Accessibility: the map is decorative-plus; all information (status, freshness, cities, landmarks) stays in text next to it.

## Result (2026-10-05)

| Measure | Before | After |
|---|---|---|
| Web first-paint JS (gzip) | 670,327 B | 674,029 B (+3.7 kB, AC6 ✓) |
| Render-blocking CSS | 0 | 0 (MapLibre CSS injected with the library) |
| Map code, first map view only | — | 305 kB gzip (`maplibre-gl.mjs` 152 + shared 147 + worker 6), immutable-cached, shared module downloaded once for page + worker |
| Order page → markers drawn (local, warm cache) | — | 3.8 s from navigation incl. app boot and order fetch |

Implementation notes for later passes:
- MapLibre is vendored under `public/vendor/maplibre-<version>/` and loaded with native `import()` (Metro cannot resolve the worker's `import.meta.url`). After `npm i maplibre-gl@x`, copy the four dist files to a new versioned folder and update `MAPLIBRE` in `src/route-map.tsx`; `tests/map.test.mjs` fails until you do.
- `.maplibregl-map { position: relative }` collapses a React Native Web view, so the map gets its own inline-styled child div.
- Readiness is `style.load` (the `load` event waits for every tile; it took >20 s once).
- `scripts/map-demo.mjs`: local demo with a moving driver (export the web app with `EXPO_PUBLIC_API_URL=http://localhost:<PORT>` first).
