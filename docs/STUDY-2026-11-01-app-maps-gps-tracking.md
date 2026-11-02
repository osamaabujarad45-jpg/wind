# STUDY — maps, GPS and live tracking in the Fastship app (driver + customer)

**Status: study (read-only).** Not a spec, not a plan, no product code changed.
**Prepared:** 1 November 2026 · **Tree:** working copy, `HEAD 83533e3` (2026-10-31) plus uncommitted work · **Method:** every claim below was read from the file:line cited, and §14 records the checks that were actually executed (test suites, typecheck, a served map page in Chromium, the same page on the SM-A5360, and endpoint behaviour on a throwaway database).

Evidence marker used throughout: `path:line`. Quotes are verbatim from the current file.

**Companions:** `reports/uber-real-code-reference-2026-11-01.md` (what Uber's contract looks like for the same areas) and the SPECs this code implements — `SPEC-live-map.md`, `SPEC-android-map.md`, `SPEC-routing-eta.md`, `SPEC-road-aware-eta.md`, `SPEC-courier-run-eta.md`, `SPEC-trip-share-link.md`.

---

## 1. What this study answers

1. Which screens draw a map, and what each one is allowed to draw.
2. How the map is rendered on web, Android and iOS, and what happens when it fails.
3. How the driver's GPS fix travels from the sensor to the customer's screen — every filter, every limit.
4. How the customer's own position is obtained for the booking pin.
5. How "where is the driver" is delivered (long-poll), how stale data is shown, and how a reassignment is handled.
6. How the road line and the ETA are produced, cached and guarded.
7. What is **not** there, stated plainly.

---

## 2. Surface map — one screen list

| Screen | File | Map? | What it shows |
| --- | --- | --- | --- |
| Book | `src/app/book.tsx:20` | yes (`RouteMap`, `canPin`) | pickup/dropoff pins, road preview, draggable pin sheet |
| Pin sheet | `src/pin-sheet.tsx:6,26` | yes (`PinMap`) | centred pin, reports centre on `moveend` |
| Order / trip (customer **and** driver) | `src/app/order/[id].tsx:20,256` | yes (`RouteMap`) | road line, approach line, live driver, closed checkpoints |
| Public tracking link | `src/app/track/[token].tsx:11,71` | yes (`RouteMap forceBaseline`) | anonymous: status + car + road, free renderer only |
| Driver jobs | `src/app/driver/index.tsx` | **no** | job cards only — no map until a job is accepted |
| Driver trips | `src/app/driver/trips.tsx` | **no** | list |
| Roads (admin/driver reporting) | `src/app/roads.tsx:9,66` | pin only (`PinMap`) | place/move a checkpoint marker |
| Admin orders | `src/app/admin/orders.tsx:66` | no | external Google Maps link per driver |

The order screen is the only place a driver and a customer see the same live map — the file says so in its first line: *"Same screen for all roles"* (`src/app/order/[id].tsx:2`).

---

## 3. Rendering architecture

### 3.1 Three families, chosen from what the binary actually contains

```
platformRenderers = { web: ['maplibre'], android: ['maplibre'], ios: ['apple'] }   src/map-provider.ts:13-17
```

- **Web** → MapLibre GL + OpenFreeMap vector tiles, no key (`src/route-map.tsx:1-3,19`).
- **Android** → the same MapLibre map, but drawn by a **WebView loading `public/map.html` from the API** (`src/route-map.android.tsx:1-4,18`), because the baseline APK has no Google Maps key.
- **iOS** → Apple MapKit wrapper (`src/route-map.native.tsx:26`), with the same optional Google native renderer.

Google is only selectable when the build baked it in (`extra.googleMaps`) and the user chose that mode; a kill switch can never enable a renderer the binary lacks:

```ts
// src/map-provider.ts:44-53
const googleAvailable = platform === 'android' ? baked?.android === true
  : platform === 'ios' ? baked?.ios === true : platform === 'web' && baked?.web === true;
```

### 3.2 Provenance is enforced, not assumed

Google Routes content is licensed for Google renderers only, so geometry carries a provider and anything unknown fails closed:

```ts
// src/map-provider.ts:97-100
export function canShowOnRenderer(provider: string, renderer: MapRenderer): boolean {
  if (provider === 'google') return renderer === 'google';
  return provider === 'osrm';
}
```

`routeProvider()` normalises `osrm`, `google-routes` → `google`, and leaves anything else unrecognised (`src/map-provider.ts:85-91`). The rule in the header is explicit: *"pins stay, no line, never an unlabelled guess"* (`src/map-provider.ts:1-5`).

Public/anonymous surfaces force the free path before any choice is made — `forceBaseline` on the tracking page (`src/app/track/[token].tsx:71`, `src/route-map.android.tsx:75`: *"a Google-keyed build still makes zero paid calls here (T15)"*).

### 3.3 Failure ladder

| Failure | Behaviour | Evidence |
| --- | --- | --- |
| style parsed but no tile | not "ready"; 20 s (page) / 25 s (host) deadline | `public/map.html:88,113-118`; `src/route-map.tsx:71-73`; `src/route-map.android.tsx:34-38` |
| WebGL context lost | report `failed`, host retries | `public/map.html:104` |
| Android WebView renderer killed | `onRenderProcessGone` → failed | `src/route-map.android.tsx:53-54` |
| anything failed | **route diagram** (`RoutePreview`) + Retry | `src/route-preview.tsx:24-27`; `src/route-map.android.tsx:94-99` |
| offline | retry once the browser fires `online` | `src/route-map.tsx:115-120` |

The fallback diagram is deliberately wordless behind maps so city names are not printed twice (`src/route-preview.tsx:25-26`).

---

## 4. The map contract and the camera

### 4.1 Props

```ts
// src/route-preview.tsx:6-22 (excerpt)
pickup: Point; dropoff: Point; pickupTitle: string; dropoffTitle: string;
driver?: (Point & { heading?: number | null; accuracy?: number | null }) | null;
stale?: boolean; focus?: 'pickup' | 'dropoff'; height?: number;
road?: [number, number][] | null;      // [lng, lat] from /api/route — never a straight line
approach?: [number, number][] | null;  // driver → next stop
closed?: Point[] | null;               // no-entry markers
forceBaseline?: boolean;
```

### 4.2 Camera rules (identical on web and WebView)

```js
// public/map.html:38 — "the car is centred at street level (Uber keeps it in the middle…)"
const FOLLOW_ZOOM = 15, FOLLOW_OFFSET = [0, -60];
```

- While a driver fix exists the camera **follows the car**; the moment the user drags or zooms, following stops and a recenter button appears (`public/map.html:189-197`). `refit()` refuses to frame stops while the car is on screen (`public/map.html:208-212`).
- Refit runs again on `resize`, because the WebView can lay out after map creation — *"a 150 px booking preview framed nothing"* (`public/map.html:198-200`).
- Pin mode does the opposite: fixed centre pin over a draggable map, reporting `{type:'center'}` on `moveend` (`public/map.html:173-176`).

### 4.3 Marker motion

Each new fix starts a glide **from where the marker is currently drawn**, over the gap since the previous fix, so motion is continuous across fixes:

```ts
// src/map-math.ts:32-36
export const glideMs = (gap: number) => gap > 0 && gap <= 6_000 ? Math.max(600, gap) : 1_200;
```

and the camera rides the same span, so the map never zooms or jumps between fixes (`public/map.html:266-267`). A jump too far to be one drive snaps instead of gliding:

```ts
// src/map-math.ts:45
export const farJump = (a: Point, b: Point) => Math.abs(a.latitude - b.latitude) + Math.abs(a.longitude - b.longitude) > 0.018;
```

Heading: the device's heading when present, otherwise the bearing between the last two fixes; the icon swaps between arrow and dot accordingly (`public/map.html:250-255`).

### 4.4 Staleness is drawn, not just labelled

- Marker opacity drops to `0.45`, the accuracy halo to near-invisible, and **the approach line is removed** — *"there is no road left to follow, and a bright line would read as live"* (`public/map.html:123-134`).
- The order screen hides the ETA and the checkpoint alert when the fix is stale (`src/app/order/[id].tsx:266-280`).

---

## 5. Geometry library (`src/map-math.ts`) — the shared maths

| Function | What it does | Line |
| --- | --- | --- |
| `metersPerPixelAtCoordinate` | 512 px Web-Mercator: `cos(lat)·2π·6378137 / (2^zoom·512·density)` | 10-16 |
| `bearing` | compass bearing a→b, used when no device heading | 19-24 |
| `ease` | linear step, clamped so a late frame never overshoots | 27-30 |
| `glideMs` / `turn` | glide duration; shortest-way rotation | 36, 39-42 |
| `glider` | stateful pose machine: start from drawn pose, never mid-glide restart | 53-66 |
| `fitBounds` | bounds with 0.005° pad (~1 km) so one point frames a street | 69-76 |
| `routeFramePoints` | driver + focused stop + the **whole visible line** (bends included) | 79-89 |
| `labelField` | Arabic falls back to Latin before local name | 93-95 |
| `etaRange` | display range: `[m, round(1.3m)+2]` | 98 |
| `kmLabel` | one decimal under 10 km, whole km beyond | 101 |
| `shownApproach` | keeps the previous approach only for the same stop; failed fetch shows none | 104-105 |
| `roadPath` | `/route?from=…&to=…&heading=`; from-point rounded to ~110 m, heading in 15° buckets | 108-110 |
| `nearLine` | distance point→polyline (local flat-earth) — used for checkpoint proximity | 113-122 |
| `backtracks` | detects out-and-back geometry to a dead-end via point | 128-138 |
| `fromDriver` | trims the line behind the car so it starts under the marker | 141-153 |

**The WebView copy is tested against this one**: the test loads `public/map.html`, re-evaluates its helper block, and asserts equality plus the device fixture `metersPerPixelAtCoordinate(0, 15, 2.8125) ≈ 0.85` (`tests/map.test.mjs:359-363`).

---

## 6. Driver GPS — sensor to server, stage by stage

```
expo-location (bg task, 3 s)
  → JS filters (mocked/age/validity/heading)
  → cadence (5 s moving / 15 s stationary)
  → receipt + monotonic dedup
  → POST /api/location  {lat,lng,age,heading,accuracy,activeGps}
  → server: rate limit → fence → age → 70 m/s outlier → upsert driver_locations
  → long-poll wakes watchers → customer marker glides
```

### 6.1 Permission (foreground first, background separate)

```ts
// src/driver-work.tsx:109-129
// "Called only from an explicit driver action… Background permission is a separate, optional action and does not guarantee delivery."
const value = permission?.granted ? permission : Platform.OS === 'web'
  ? await boundedPermission(requestPermission) : await requestPermission();
… if (!enabled && Platform.OS === 'android') { await Location.enableNetworkProviderAsync(); }
```

The prompt is bounded so a hidden permission dialog cannot hang the flow (`src/customer-location.ts:67-101` is the same idea for the customer).

### 6.2 Sampling

```ts
// src/background-location.ts:106-115
await Location.startLocationUpdatesAsync(TASK, {
  accuracy: Location.Accuracy.High, timeInterval: 3_000, distanceInterval: 0, activityType: Location.ActivityType.AutomotiveNavigation,
  deferredUpdatesInterval: 3_000, deferredUpdatesDistance: 0,
  pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
  foregroundService: { notificationTitle: 'Wind', notificationBody: 'مشاركة الموقع أثناء التوصيل · Sharing location during delivery', … killServiceOnDestroy: false },
});
```

A fix every ~3 s is deliberate: *"the customer's marker can move continuously, not hop every 20 s"* (`src/background-location.ts:107`).

### 6.3 Client-side filters (before anything leaves the phone)

| Filter | Rule | Evidence |
| --- | --- | --- |
| mock location | dropped | `src/location-delivery.ts:43` |
| fix age | > 30 s dropped | `src/location-delivery.ts:43` |
| future clock | > 5 s ahead dropped | `src/location-delivery.ts:43` |
| coordinates | must be finite and in range | `src/location-delivery.ts:44` |
| heading | only if `speed > 2.5 m/s` **and** `accuracy ≤ 50 m` | `src/location-delivery.ts:11-12` |
| cadence | floor 2 s; 5 s moving, 15 s stationary | `src/location-delivery.ts:24-26` |
| replay/older fix | never re-uploads a fix the server already has | `src/location-delivery.ts:46-48` |
| token change | upload abandoned, tracking stopped | `src/location-delivery.ts:41,73-74` |

The heading rule exists because *"Android reports bearing 0 and speed 0 when it has neither, and indoor GPS jitter reads as 1-2 m/s with a random course… so a parked car would point anywhere"* (`src/location-delivery.ts:6-9`).

### 6.4 What is sent

```ts
// src/location-delivery.ts:64-68
// "Age, not the phone's clock time: the API orders fixes by it and drops late or replayed ones."
{ latitude, longitude, age: Math.max(0, now - fix.timestamp), heading?, accuracy?, activeGps? }
```

Responses `401/403/409` stop tracking outright; `200 {accepted:false}` never refreshes the "sharing" indicator (`src/location-delivery.ts:74-83`).

### 6.5 Ownership fence (`activeGps`)

Before accepting a job the app acquires a device/session/sequence fence from the server, and each upload carries it:

```ts
// src/active-gps-session.ts:11-35 — acquireActiveGps(...) → { deviceId, sessionId, seq, assignments[{orderId, assignmentEpoch}] }
```

Server side, a fix is rejected when the session id, device hash, auth session, sequence or assignment set no longer match:

```ts
// server/main.ts:2319-2336
if (session.id !== fence.sessionId || session.device_hash !== sha(deviceId) || …) return {ok:true,accepted:false,reason:'session_stale'};
if (fence.seq <= Number(session.seq)) return {ok:true,accepted:false,reason:'sequence_old'};
… 'assignment_stale'
```

A stale fence is answered `200 {accepted:false}`, not an error, because *"a background task stops on 409"* (`server/main.ts:2352`).

### 6.6 Server-side validation and outlier control

```ts
// server/main.ts:2353-2355
if (age > 60_000 || fixAt < Number(since) - 15_000) return { ok: true, accepted: false };
// A jump no vehicle can make (over 70 m/s, ~250 km/h, beyond both fixes' error) is a GPS outlier …
```

The implausibility test subtracts both fixes' accuracies, then divides by elapsed time, and is applied against **two** references — the last plausible fix (which the tail of the route follows) and the last displayed fix:

```ts
// server/main.ts:2359-2373 (abridged)
const metres = crowKm(ref, fix) * 1000 - (accuracy ?? 50) - (ref.accuracy ?? 50);
return metres / Math.max(1, (fixAt - ref.at) / 1000) <= 70;
…
: plausible(displayed) ? 'bypass'
: (accuracy ?? 50) < (reference?.accuracy ?? 50) ? 'bypass'   // a more precise fix always wins
: 'reject';
```

The comment records why the second reference exists: *"it catches the next real fix after a wild one won on accuracy (that froze the marker kilometres away for minutes)"* (`server/main.ts:2356-2357`).

Rate limit: 60 posts per minute per driver (`server/main.ts:2309`) — twice the 2 s floor.

### 6.7 Before any job — presence has its own, stricter ingest

`POST /api/driver/presence/location` (`server/domain/presence.ts:161-182`):

- `age ≤ 30 s` (`:172`), at least **2 s** since the last stored fix (`:173`), sequence must advance (`:169`),
- same 70 m/s plausibility check against `good_*` (`:176`),
- **rejected while the driver has an active job** — `409 presence_active_job` (`:168`), because active-job tracking owns the fix then.

### 6.8 Presence session model

| Element | Value | Evidence |
| --- | --- | --- |
| lease | 60 s, renewed by heartbeat | `server/domain/presence.ts:135,158` |
| heartbeat | monotonic `seq`, duplicates deduplicated | `:153-160` |
| consent | explicit `consentVersion === 1` | `:123` |
| device binding | `hash('wp07-device:'+deviceId)`; a second device gets `409 presence_device_in_use` | `:126-129` |
| status states | `offline / not_eligible / busy / online / location_stale` | `:103-120` |
| online requires | fresh fix ≤ 30 s **and** dispatch enabled | `:116-119` |
| offline | deletes the latest location and writes an audit row | `:145-149` |
| sweep | expires leases, revoked sessions, eligibility/vehicle/verification changes, stale pins > 30 s | `:30-69` |

Client side, active-job tracking and presence are mutually exclusive: *"Active-job tracking has its own purpose and transport; stop preassignment collection immediately"* (`src/driver-work.tsx:196-197`).

---

## 7. Customer's own position (booking pin)

Three rules from `src/customer-location.ts`:

1. **A cached pin hint must never hold the picker open** — it resolves or times out in 250 ms (`:15-34`).
2. **High accuracy, zero staleness, 20 s ceiling**:
   ```ts
   // src/customer-location.ts:46-53
   geolocation.watchPosition(receive, …, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
   ```
3. **A usable fix must be current, accurate and inside a served city**:
   ```ts
   // src/customer-location.ts:58-63
   if (now - fix.timestamp > 30_000 || … || accuracy > 100) return { error: 'inaccurate' };
   return servedCity(point) ? { city, point, accuracy } : { error: 'outside' };
   ```

`findPickup()` stops the watch on the first usable fix, on timeout, on provider failure or on navigation away, and treats a late permission grant as no watch at all (`:67-101`).

---

## 8. Delivering "where is the driver" to the customer

### 8.1 Server: a long-poll, not a socket

```ts
// server/main.ts:2416-2422
// "a watcher's request waits here and returns as soon as the driver's next fix is stored…"
const LIVE_HOLD = 12_000, LIVE_WATCHERS = 20, LIVE_TOTAL = 200;
const fixWaiters = new Map<number, Set<() => void>>(); // keyed by order id: a reassignment wakes the same watchers
```

- Re-authentication and re-authorisation happen **before** the coordinates go out, because a held request must not outlive a revoked session (`server/main.ts:1648-1652`, `2453-2457`).
- A watcher that disconnects frees its slot immediately (`:2450-2451`); a link cannot pin sockets (`:2420`).
- If the client names a driver that is no longer assigned, the answer is `driverChanged` with no fix — the screen hides the old car first (`:2430,2456`).

### 8.2 Client: cursor + backoff + background pause

```ts
// src/api.ts:110-152 (structure)
while (!stopped) {
  if (!foreground) { await sleep(2_000); continue; }        // no radio use in the background
  pause = 2_000;
  answer = await api(`${path}?since=${since}`)              // driver in the path → reassignment starts clean
  if (answer.driverChanged) { since = 0; setFix(null, changed) }
  else if (fix.updatedAt > since) { since = fix.updatedAt; pause = 0 }
  catch → pause = min(5_000 * failures, 30_000); terminal codes end the loop
}
```

`terminal()` ends the stream on `unauthorized / forbidden / not_found / session_changed / aborted` (`src/api.ts:154-155`).

### 8.3 Polling still exists — as the status source

- Order screen polls the order; the live fix rides on top (`src/app/order/[id].tsx:49`).
- Public tracking polls every **10 s** *"the 10 s poll carries status and revocation"*, and ETA every 15 s (`src/app/track/[token].tsx:22,43`).
- Driver job list polls every 8 s (`src/app/driver/index.tsx:29`).

### 8.4 Freshness vocabulary (one place)

```ts
// src/location-state.ts:8-9
return { ageSeconds, stale: ageSeconds >= 60, reconnecting: ageSeconds >= 30 && ageSeconds < 60 };
// src/location-state.ts:28-30 — a public link keeps the last marker only within 120 s
```

Fix times are server-clock times; the client adds `serverOffset()` instead of trusting the phone clock (`src/location-state.ts:6,21`).

### 8.5 The public link

`src/app/track/[token].tsx`:
- token must be 64 hex chars (`:21`),
- the car shown is the newer of poll and live (`:25`), retained up to 120 s and faded after 60 s (`:34-39`),
- ETA is discarded when the fix it started from is older than 30 s (`:48-51`) — *"the estimate starts from the driver's position: past 30 s it describes a place the driver has left"* (`:45`),
- a courier run gives **no** straight-to-you minutes (`sharedRun`, `:83`; server `:2605-2610`),
- navigation is an external Google Maps link (`:86-87`).

---

## 9. Route line and ETA

### 9.1 OSRM only, self-hosted

```ts
// server/main.ts:2460-2464
const osrmUrl = process.env.OSRM_URL?.trim().replace(/\/$/, '');
const routingTimeout = Math.min(10_000, Math.max(1000, Number(process.env.OSRM_TIMEOUT_MS) || 3000));
```

`/route/v1/driving/…?overview=full&geometries=geojson`, `NoRoute` is a normal answer, anything else is `503 route_unavailable` (`server/main.ts:2477-2485`).

### 9.2 Checkpoint-aware route choice

```ts
// server/main.ts:2472-2475
const CHECKPOINT_RADIUS = 200;   // a route this close to a closed checkpoint is taken to pass through it
const DETOUR_KM = [1, 2, 3, 5, 8]; // via points either side of a blocking checkpoint
```

The sequence: ask for `alternatives=3` with the heading as a bearing hint (`:2526`), reject candidates that cross a closed checkpoint or backtrack (`:2528-2537`), and if all are blocked build perpendicular via points 1–8 km either side and re-route (`:2539-2548`). The chosen route minimises **expected** time, not free-flow:

```ts
// server/domain/route-quality.ts:7-23
checkpointDelaySeconds = slow => slow * SLOW_MINUTES * 60;
expectedMinutes = (s, slow) => max(1, round(s/60) + slow*SLOW_MINUTES);
bestRoute(routes, delay)    // lowest duration + delay
```

The same number is charged by the fare model — *"so the price and the promise agree"* (`route-quality.ts:3-6`).

### 9.3 Cache

Key = rounded endpoints (1e-4 ≈ 10 m) + heading bucket + the closed/slow checkpoint set with their positions; an LRU budget of **200,000 points**, not entries (`server/main.ts:2469-2471,2521-2568`). A reroute happens immediately when a closure appears or a checkpoint moves (`:2518-2521`).

### 9.4 Display

- `etaRange(minutes)` → `[m, 1.3m+2]` (`src/map-math.ts:98`), rendered by `EtaLine` (`src/app/order/[id].tsx:268`).
- Road distance as `kmLabel` (`src/map-math.ts:101`).
- Checkpoint outcomes are shown as two lines — avoided vs still crossed (`src/road.tsx:80-94`).

### 9.5 The paid path (Google) is fenced

- Trigger verbs are explicit and validated server-side: `preview&shown=1`, `destination&changed=1`, `movement&foreground=1&metres=…` (`src/map-provider.ts:114-136`).
- Re-billing needs **250 m** of movement while foregrounded (`src/map-provider.ts:122`; `server/domain/google-routing.ts:31`).
- Budgets: 60 routes/user/10 min, 2,000/day, 4 in flight (`google-routing.ts:34-38`).
- Minimal field mask, no caching: *"Google route content may not outlive the request"* (`google-routing.ts:22-29`).
- Fares and feasibility still read the **OSRM** route (`server/main.ts:2584-2585`).

`useRoad()` is the single orchestrator for the order screen: it picks the renderer, drops geometry the renderer may not show, computes the significance-gated URL, keeps the previous ETA only for the same stop, and unions the checkpoint outcomes (`src/road.tsx:28-77`).

---

## 10. Feasibility — measured, never assumed

`server/domain/routing-policy.ts:24-53` reduces routing evidence to one of three verdicts:

```ts
feasibility: 'feasible' | 'infeasible' | 'uncertain'
```

- `infeasible` only when a crossing is `crossed + applies + confirmedProhibition + closed|restricted` (`:29-31`).
- Every other gap (missing revisions, incomplete provider/graph/restriction evidence, unknown crossing, open-but-prohibited, closed-but-unconfirmed) degrades to `uncertain` with a reason list (`:33-51`).

This is why the parity document can say Fastship's quotes are `uncertain` and never `feasible` — it is enforced, not incidental.

---

## 11. End-to-end (driver → customer), as the code actually runs

```
DRIVER PHONE
  expo-location bg task (3 s, High, AutomotiveNavigation)          background-location.ts:106
    └ JS filter: mocked / age / future / range / heading gate       location-delivery.ts:11,43-44
    └ cadence 5 s moving, 15 s stationary (floor 2 s)               location-delivery.ts:24-26
    └ receipt + monotonic dedup, stop on 401/403/409                location-delivery.ts:46-83
  POST /api/location {lat,lng,age,heading,accuracy,activeGps}       location-delivery.ts:65-68
        │
SERVER  rate 60/min · fence(device,session,seq,assignments)         main.ts:2309,2319-2336
        age ≤ 60 s · not before assignment−15 s                     main.ts:2353
        70 m/s plausibility vs good_* and displayed fix             main.ts:2354-2374
        upsert driver_locations (keeps good_* reference)            main.ts:2397-2400
        wake fixWaiters[orderId]                                    main.ts:2421,2434-2452
        │
CUSTOMER
  GET /api/orders/:id/live?since=&driver=  (long-poll, 12 s hold)   main.ts:1645-1655,2426-2458
  useLiveFix: background pause, backoff, driverChanged reset        api.ts:110-152
  freshness 30/60 s, public retention 120 s                         location-state.ts:3-30
  marker glide + camera follow (MapLibre / WebView page)            map.html:245-286
  road + approach + ETA via /api/route (OSRM, checkpoints)          main.ts:2511-2571
```

---

## 12. File map (what to read for each concern)

| Concern | Files |
| --- | --- |
| Map components | `src/route-map.tsx` (web), `src/route-map.android.tsx` (WebView), `src/route-map.native.tsx` (iOS), `public/map.html` (Android page), `src/google-map.web.tsx` / `src/google-map.native.tsx` (optional Google) |
| Renderer policy | `src/map-provider.ts`, `src/map-mode.ts`, `src/map-failures.ts`, `src/map-viewport.ts`, `src/runtime-config.ts`, `src/google-maps-loader.ts` |
| Maths | `src/map-math.ts`, `src/map-viewport.ts` |
| Fallback | `src/route-preview.tsx` |
| Driver GPS | `src/background-location.ts`, `src/location-delivery.ts`, `src/active-gps-session.ts`, `src/background-permission.ts` |
| Customer GPS | `src/customer-location.ts`, `src/location-state.ts`, `src/location-web-clock.ts`, `src/location-permission-timeout.ts` |
| Driver presence | `src/driver-presence.ts`, `src/driver-presence-runtime.ts`, `src/driver-presence-card.tsx`, `server/domain/presence.ts` |
| Live delivery | `src/api.ts` (`useLiveFix`), `server/main.ts` (`liveFix`, `/orders/:id/live`, `/track/:token/live`) |
| Routing/ETA | `server/main.ts` (`roadRoute`), `server/domain/route-quality.ts`, `server/domain/routing-policy.ts`, `server/domain/google-routing.ts`, `src/road.tsx` |
| Screens | `src/app/book.tsx`, `src/pin-sheet.tsx`, `src/app/order/[id].tsx`, `src/app/track/[token].tsx` |
| Tests | `tests/map.test.mjs` (39.5 KB), `map-security`, `map-policy`, `background-location`, `active-gps-*`, `driver-presence*`, `route.test.mjs`, `route-quality`, `google-map-lifecycle`, `customer-location` |

---

## 13. Findings and gaps (evidence-based)

1. **No in-app turn-by-turn.** The driver map shows position and the road; actual navigation is handed to Google/Apple Maps (`src/app/order/[id].tsx:35-38,499`). For a driver product this is the largest functional difference from Uber — and it is deliberate, not missing code.
2. **The driver's job list has no map at all.** Drivers see offers as cards; the first map appears only after accepting (`src/app/driver/index.tsx` imports no map).
3. **Android maps depend on the API origin serving a web export.** `PAGE = ${API_URL}/map.html` (`src/route-map.android.tsx:18`). In development the API serves `public/` itself (`server/main.ts:83-85`); in production it serves `WEB_ROOT`, and the Dockerfile sets `WEB_ROOT=/app/web` from `expo export --platform web` (`Dockerfile:17,29,32`), which copies `public/` including `map.html` and `vendor/`. If that export is missing or `WEB_ROOT` is wrong, every Android map 404s to the diagram. (The checked-in `dist/map.html` is stale: 15,670 bytes dated 22 Oct vs the source's 18,110 bytes dated 1 Nov — harmless for a Docker build, a trap for a hand deployment from `dist/`.) The page also carries its own 20 s deadline before the native 25 s one.
4. **No offline tiles.** MapLibre caches opportunistically in the browser; the app has no tile store, and `public/sw.js` is push-only (no `fetch` handler, `:24-46`). Offline → diagram.
5. **Long-poll is single-process by construction.** In-process waiters with a comment naming the upgrade: *"several instances need shared pub/sub (e.g. Redis)"* (`server/main.ts:2419`).
6. **Two GPS transports with different limits** — presence (≤30 s age, ≥2 s gap, no active job) and active-job (`/api/location`, ≤60 s age, 2 s floor, 5/15 s cadence). Mixing them up would silently break matching freshness.
7. **ETA uncertainty is a display formula, not measurement.** `etaRange = [m, 1.3m+2]` (`src/map-math.ts:98`) — the same gap the Uber reference closes with `min/max/raw + accuracy grade + validity stamps`.
8. **Accuracy-first outlier rule has a known bypass path.** A fix more precise than the reference is accepted even if the movement is impossible (`server/main.ts:2372`); the comment shows this is intentional to let a good fix recover, but it means a spoofed high-accuracy jump wins one round before the next fix corrects the reference.
9. **iOS Apple path read completely, still not device-verified.** `src/route-map.native.tsx` was read end to end: same five behaviours as the other renderers, but implemented differently — `FOLLOW_DELTA = 0.012` instead of zoom 15 (`:19`), a JS-driven marker glide instead of `animateMarkerToCoordinate` (the comment says iOS drops overlapping requests and truncates duration to whole seconds, `:98-101`), and a documented gesture asymmetry — *"a pan stops the follow camera; a pinch does not"* (`:49-50`). It also reports the pin centre on **every** region change (`:171`) where web/Android report on `moveend`, so the pin sheet receives many more callbacks on iOS. No iOS device exists here, so this remains a code-level comparison.
10. **Public tracking is deliberately poorer.** No paid route, no exact pins, city-centre road only, 30 s ETA age limit (`src/app/track/[token].tsx:45,71-73`; `server/main.ts:2612-2624`).
11. **Observed renderer-failure memory is never written.** `recordMapFailure()` (`src/map-failures.ts:6`) has no caller outside `tests/map-policy.test.mjs`; the three renderers call `onFail` → their own Retry/diagram but never record the failure. So `failedRenderers(key)` is always empty at runtime and the configuration fallback (`resolveMapProvider`) can only follow the configured list, never an observed failure — while the test asserts the opposite behaviour.
12. **The camera-intent abstraction is tested but not wired.** `src/map-viewport.ts` (`MAP_FOLLOW_ZOOM`, `visibleMapInsets`, `mapCameraIntent`) is imported only by `tests/map-policy.test.mjs:5`; web, Android and iOS each hardcode their own follow rule (zoom 15 twice, a region delta on iOS). That is exactly where the three renderers can drift.
13. **Android draws no driver until the first injected update.** `public/map.html` uses `config.driver` only to frame the bounds (`:95`); the live marker comes from `window.wind(...)` (`:120-122`). The host injects as soon as the style is parsed, so this is normally invisible — but a page that loads without the host shows pins and no car (observed).

### What the verification does **not** cover (residual limits)

- **No iOS device.** Apple MapKit and the Google native renderer were compared by reading only; the iOS-specific pinch asymmetry and the per-region `onChange` frequency are code claims, not device observations.
- **No Google paid call was ever made.** No restricted key is baked into this build, so the `routesDisabled`/`no apiKey` paths and the budget arithmetic are covered by `tests/google-routing.test.mjs` (passing), not by an upstream request.
- **No physical drive.** GPS ran on the device while stationary: the app's HIGH_ACCURACY request, the fused fix and the foreground `LocationTaskService` were observed (§14.8), but the 5 s moving cadence and the heading gate are covered by tests/code, not by a driving trace.
- **No real OSRM in the throwaway server** (§14.6); the **phone sandbox did use the public OSRM** and produced a real road line plus an 80–106 min ETA on the device (§14.8).
- **The scenario suite stops at handover** (see §14.7), so receipt, rebook, cancellation and scheduled-booking stages after it were not reached in this session.
- **iOS device absent**; Arabic map labels, however, were read visually on the phone (§14.8).
- **The full 101-suite run is in §14.8**; `npx tsc` for both configs passes; `expo lint` is **red** on `src/session.tsx:49` (`react-hooks/purity`) plus two warnings in `src/api.ts` and `src/use-driver-recovery.ts` — none of them map code.

---

## 14. Verification performed (1 November 2026)

All checks below ran on this PC (Node 24.12, Windows) against the working tree, plus the SM-A5360. Nothing touched a production system.

### 14.1 Test suites — 27 suites, 26 passing, 1 harness-stale

| Suite | Result |
| --- | --- |
| `map.test.mjs` | **PASS** (`map: ok`) — includes the map.html ↔ map-math parity check and the A53 pixel fixture |
| `map-security.test.mjs` | **PASS** — fragment colour injection rejected, parser/SVG/CSS |
| `map-policy.test.mjs` | **PASS** — provider fallback/exhaustion, public scope, provenance, camera policy |
| `route.test.mjs` | **PASS** |
| `route-quality.test.mjs` | **PASS** — slow checkpoint changes route choice and ETA |
| `background-location.test.mjs` | **PASS** — authority, freshness, stationary updates, expiry, retry, late callbacks |
| `active-gps-client.test.mjs` / `active-gps-native.test.mjs` | **PASS** |
| `customer-location.test.mjs` | **PASS** — freshness, accuracy, bounds, timeout, cancellation |
| `driver-presence{,-api,-runtime,-card}.test.mjs`, `presence.mjs`, `presence-migration.mjs` | **PASS** |
| `google-maps-loader.test.mjs` | **PASS** |
| `location-permission-timeout.test.mjs`, `location-web-clock.test.mjs` | **PASS** |
| `runtime-config.test.mjs`, `share.test.mjs`, `api-focus.test.mjs` | **PASS** |
| `google-routing.test.mjs` | **PASS** — validation, fixed origin, typed redacted errors, budgets, no-retry degradation |
| `routing-policy.test.mjs` | **PASS** — feasible/uncertain/infeasible verdicts, revisions, invalid evidence fails closed |
| `ride-lifecycle.mjs`, `ride-lifecycle-races.mjs`, `ride-lifecycle-sqlite.mjs` | **PASS** (run to place the later scenario failure) |
| `google-map-lifecycle.test.mjs` | **FAIL — test harness, not product.** `Cannot find module './runtime-config'` from `map-mode.ts`. Cause: the test's module sandbox stubs `./map-math`, `./ui`, `./google-maps-loader`, `./web-storage` but not the two modules `map-mode.ts` gained — both are **untracked WIP** (`src/runtime-config.ts`, `src/map-failures.ts`), and the test file itself is untracked. A copy with those two stubbed runs green: *"Google web lifecycle: tile deadline/retry, detached DOM cleanup, latest center/geometry and denied map-mode storage passed"*. |

### 14.2 Typecheck

`npx tsc --noEmit` → **exit 0**; `npx tsc --noEmit -p tsconfig.server.json` → **exit 0**.

### 14.3 The map page in a real browser

Served `public/map.html` from the API on a throwaway database (`DB_PATH` in temp, port 4100, `NODE_ENV=development`), opened in the in-app Chromium:

| Probe | Observed |
| --- | --- |
| route mode, Ramallah → Nablus | 1 map canvas **1296×886**, **2 markers**, style + planet + sprites + glyphs all fetched from `tiles.openfreemap.org`, attribution *"OpenFreeMap © OpenMapTiles Data from OpenStreetMap"*, compact attribution **closed** (the `ready` path ran), **0 console errors** |
| injected `window.wind({driver, road, approach, closed})` | driver marker appears (1), no-entry marker appears, approach line drawn, camera follows |
| `window.wind({stale:true})` | driver element opacity **0.45**, as designed |
| pin mode | centre pin visible (`#pin hidden=false`), **0 markers**, canvas present, no recenter button |
| fragment `{}` | **no canvas created** — the page refuses a bad config instead of drawing a blank map |
| language `ar` | page loaded and drew; label expression is the one `map.test.mjs` pins (visual Arabic shaping not asserted) |

### 14.4 The same page on the phone

`adb reverse tcp:4100` → opened the URL on the SM-A5360 in Chrome (the same Chromium engine the WebView uses) → **tiles rendered for the Ramallah–Nablus corridor, pickup marker at Ramallah, dropoff pin at Nablus, attribution control present**; screenshot 963,409 bytes archived at `C:\Users\osama\AppData\Local\Temp\opencode\phone-map.png`. The reverse was removed and the page backed out of afterwards.

App state on that phone: `ps.wind.app` **1.0.13 (versionCode 17)**, updated **31 Oct 2026**; the manifest declares `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`; **all three location permissions are currently denied**, as is notifications — so no live driver GPS run was possible without the owner granting them.

### 14.5 Served-header truth

| Path | Status | CSP |
| --- | --- | --- |
| `/map.html` | 200, 18,110 bytes | **none** — the documented exception (`server/main.ts:127-128`) |
| `/index.html` | 200, 1,863 bytes | present |

(`HEAD` is not routed; GET is.)

### 14.6 Endpoint gates (live, throwaway DB)

| Request | Result |
| --- | --- |
| `GET /api/route?from=…&to=…` without a token | **401** |
| `GET /api/route?from=bad` without a token | **401** (auth before input parsing) |
| `GET /api/route/google?…&trigger=preview&shown=1` without a token | **401** |
| `POST /api/location` without a token | **401** |
| `GET /api/track/<64 hex>/eta` for an unknown link | **404** |

### 14.7 End-to-end UI journey (`scripts/check-scenarios.mjs`, real MapLibre + real tiles + fixture GPS/OSRM)

Passed stages (real headless Chromium, 390×844, geolocation granted):

- **"driver accepts, real MapLibre renders pickup/dropoff/driver, GPS reaches customer"**
- **"two-way chat and anonymous recipient tracking without private contacts or landmarks"** (the recipient page waits on `.maplibregl-marker`)
- **"public ETA is cleared and refetched when the same driver changes trip stage"** (pickup ETA replaced by dropoff ETA, never relabelled)

Then the suite failed at **"handover and receipt"**: `Order 1 did not reach completed` after the correct handover code was entered — **reproduced twice** (a full build run and a `--no-build` rerun). That stage is outside the map/tracking code, and the tree carries 130 uncommitted changes including `server/domain/ride-lifecycle.ts`, `src/app/order/[id].tsx`, `src/model.ts`, `src/parts.tsx` and a new `src/ride-flow.ts`; the three lifecycle suites themselves pass. **Attribution: uncommitted handover work or scenario timing — not the maps stack. Not investigated further here** because it is outside this study's subject and would mean debugging another workstream's WIP.

---

## 14.8 Full suite, lint and the native app on the phone

**Full suite.** `scripts/run-tests.mjs` stops at the first failure, so all 101 listed suites were re-run individually with continue-on-failure: **99 pass, 2 fail**, both stale tests against WIP code — `deployment.test.mjs` (asserts explicit Dockerfile `COPY src/<file>` lines while the WIP moved to a build-time closure; the closure was executed and copies `src/model.ts`, `src/map-math.ts`, `src/runtime-config.ts`, `src/client-diagnostics.ts`, `src/api-clock.ts`, `src/command-id.ts`) and `google-map-lifecycle.test.mjs` (sandbox missing stubs for the two new modules; passes with them). Raw: `%TEMP%\opencode\all-suites.json`.

**Lint.** `npx expo lint` → **1 error, 2 warnings**: `src/session.tsx:49` `react-hooks/purity` (*"Cannot call impure function during render"*), `src/api.ts:2` unused `Platform`, `src/use-driver-recovery.ts:36` unnecessary deps. None is map code.

**Native app on the SM-A5360** (the real WebView map, not Chrome): `adb reverse tcp:4191` → `scripts/phone-test-server.mjs` (throwaway DB, `OSRM_URL=https://router.project-osrm.org`) → test apps 1.0.13. Location permissions were granted to the test packages for this session.

| Observation | Evidence |
| --- | --- |
| Customer order W-00004: tiles with Arabic labels, pickup dot + dropoff square, real OSRM road line | `customer-order-map.png` |
| Posted a fix (31.9042, 35.2051) → within ~7 s the blue heading arrow, accuracy halo and *"موقع السائق · قبل ٨ ث"* | `customer-order-live-driver.png` |
| Driver order screen: follow camera on the car, *"موقعك · قبل ٨ ث"* | `driver-order-map.png` |
| Courier-run rule live: two active orders → no ETA (`sharedRun: true`); after cancelling the second → approach line + *"يصل السائق خلال ٨٠–١٠٦ د"* (`etaRange(80)`) | `public-track-no-eta-run.png`, `public-track-eta.png` |
| The app's own GPS: `ProviderRequest[HIGH_ACCURACY, WorkSource{ps.wind.app.testdriver}]`; last fused fix `32.312489,35.047967 hAcc=4.087` — identical to what the server stored | `dumpsys location` |
| Foreground service: `expo.modules.location.services.LocationTaskService isForeground=true`, channel `wind-active-delivery-location`, colour `0xff12342a` | `dumpsys activity services` |
| Stale-fix fallback: *"بانتظار تحديث موقع السائق"* instead of an old car | `customer-order-map.png` |

Screenshots: `.expo\phone-qa\device\maps-study-2026-11-01\` (plus `%TEMP%\opencode\`).

---

## 15. One-line summary

Fastship's tracking is a 3 s background GPS task filtered four ways on the phone, fenced and outlier-checked on the server, delivered by a 12 s long-poll with a 10 s poll behind it, drawn by MapLibre (WebView on Android, Apple MapKit on iOS) with a 15-zoom follow camera and glide interpolation, and backed by an OSRM route that avoids closed checkpoints at its own cost — with no turn-by-turn and no offline tiles, both by design.
