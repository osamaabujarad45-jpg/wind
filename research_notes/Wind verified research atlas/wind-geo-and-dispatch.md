# Wind verified research atlas: geo, dispatch, routing and ETA

- **Canonical revision:** `b89f2205965523b5ab8545dff3940d1eacb6062c` (`git rev-parse origin/master`).
- **Source rule:** behavior below is from `git show origin/master:<path>`, not the working tree. The gzip artifact was read from that same Git object, decompressed in memory, and JSON-parsed; its decompressed JSON is one line, cited below as `server/data/places-ps.json.gz:1 (gunzipped)`.

## 1. Addresses and places

### Server place index

| Item | Verified behavior | Evidence |
|---|---|---|
| Root / build | Root keys are `built`, `places`, `streets`, `points`; `built` is `2026-11-03`. | `server/data/places-ps.json.gz:1 (gunzipped)` |
| Place records | **Exactly 24,090** entries in `places`. Every entry is a six-element positional tuple: **`[ar: string, en: string, latitude: number, longitude: number, kind: PlaceKind, rank: number]`**. Example first tuple: `["بيتونيا","Bitunia",31.88602,35.17044,"town",0]`. | `server/data/places-ps.json.gz:1 (gunzipped)`; the loader's tuple type and destructuring are `server/domain/place-index.ts:41-49`. |
| Place kinds | `PlaceKind` is `town`, `area`, `health`, `education`, `worship`, `food`, `bank`, `fuel`, `transit`, `shop`, `junction`, `poi`, or `street`; streets are loaded from the separate section rather than the `places` tuples. | `server/domain/place-index.ts:15-20`, `server/domain/place-index.ts:46-57`. |
| Street records | **2,637** `streets` entries, each **`[ar: string, en: string]`**. `points` contains **102,357 numbers**, consumed as **34,119 triples** `[streetRowIndex, latitude, longitude]`; all 2,637 street rows have samples. The loader therefore produces **26,727 searchable rows** (24,090 places + 2,637 sampled streets). | `server/data/places-ps.json.gz:1 (gunzipped)`; `server/domain/place-index.ts:42`, `server/domain/place-index.ts:51-58`. |
| Runtime representation | Each place becomes an object with `ar`, `en`, `latitude`, `longitude`, `kind`, `rank`, folded text and tokens; town/area and POI buckets use a `0.01`-degree key (comment: about one kilometre). | `server/domain/place-index.ts:19-20`, `server/domain/place-index.ts:34-49`. |
| Suggest / reverse | Suggest scores token-prefix matches, filters out points for which `servedCity` is null, deduplicates, and returns at most eight by default. Reverse label precedence is POI <40 m, street <120 m, POI <100 m, area <2.5 km, then served-city name. | `server/domain/place-index.ts:90-121`, `server/domain/place-index.ts:124-136`. |

### Client offline city corpus

- **`src/model.ts` contains 16 city records**: `ramallah`, `bireh`, `nablus`, `hebron`, `bethlehem`, `jenin`, `tulkarm`, `qalqilya`, `jericho`, `salfit`, `tubas`, `jerusalem`, `gaza`, `deir_albalah`, `khan_younis`, `rafah` (`src/model.ts:3-20`).
- **Marked `served`: 0.** No city record has a `served` property; a per-city served marker is **not found in the files read** (`src/model.ts:3-20`). Instead, all 16 participate in `nearestCity`, and `servedCity(point)` accepts the nearest city when its haversine distance is at most `SERVICE_KM = 20` km (`src/model.ts:190-210`). The no-query UI also maps the unfiltered `cities` array when there are no saved or recent places (`src/trip-search.tsx:103-108`).

### `src/place-search.ts`: folding, precedence and offline state

- **Arabic/English fold, exact operations:** trim, lowercase, remove `[\u064B-\u065F\u0670\u0640]` (Arabic diacritics/mark range, superscript alef and tatweel), fold `[أإآٱ] → ا`, `ى → ي`, and `ة → ه` (`src/place-search.ts:28-32`). English is consequently case-insensitive; this client fold does **not** list the server's extra `ؤ/ئ`, digit, punctuation or optional-`ال` rules (compare `server/domain/place-index.ts:22-32`).
- **Saved-place precedence:** saved places are appended first, in their input order, and match against `note + city Arabic name + city English name`; city records are appended second and match Arabic or English names (`src/place-search.ts:34-47`). In the pure helper a saved choice has `point: null` even though the `SavedPlace` type can carry a point (`src/place-search.ts:39-46`, `src/model.ts:36-37`). The actual `TripSearch` row restores `p.saved?.point ?? null` (`src/trip-search.tsx:109`).
- **Actual UI precedence:** saved matches are computed separately and rendered before server hits; recent places appear with saved places on an empty query; local towns are used as fallback only when `/places/suggest` failed (`src/trip-search.tsx:58-60`, `src/trip-search.tsx:103-115`).

| `searchPlaces(query, saved, online)` state | Returned `feedback` | Returned `offline` | Evidence |
|---|---|---|---|
| Folded query empty | `'empty'` | `!online` | `src/place-search.ts:35-38` |
| Nonempty query, at least one choice | `null` | `!online` | `src/place-search.ts:38-48` |
| Nonempty query, no choices, online | `'no_match'` | `false` | `src/place-search.ts:48` |
| Nonempty query, no choices, offline | `'offline'` | `true` | `src/place-search.ts:48` |

- The current `TripSearch` calls `searchPlaces` with its default `online = true`; it implements the visible network-offline case through `shown.failed`, local-town fallback and `c.searchOffline`, rather than passing `online = false` (`src/place-search.ts:35`, `src/trip-search.tsx:47-60`, `src/trip-search.tsx:111-114`).

### How a choice becomes a pin

- **Exported helper contract:** `mapChoices` keeps only hits for which `servedCity(exactPoint)` returns a city and carries that exact point into the choice (`src/place-search.ts:15-19`). `placeAt` applies the same bound to a map/GPS point and returns `{error:'outside'}` otherwise (`src/place-search.ts:51-55`). `proposePlace` uses a choice's own point immediately; without one, it retains an accepted pin only if the accepted and proposed cities match. `confirmPlace` then returns only `{city,note,point}` (`src/place-search.ts:57-68`).
- **Current search-to-booking path:** `pickHit` constructs the exact hit point, checks `servedCity`, and passes `{city, point, note: hit.name}` (`src/trip-search.tsx:63-66`). `applyPlace` stores a pointed choice directly as city + point + note. A choice without a point opens pin mode centred on its city, preserving its note (`src/app/book.tsx:225-239`).
- **Pin confirmation:** the client reverse-geocodes a stationary pin through `/places/reverse` (`src/app/book.tsx:171-178`, `src/app/book.tsx:248-257`). Confirmation is blocked unless the map is ready, the point exists and is served, and the pin is not moving; the accepted note is `pinNote || reverseLabel.name || cityName`, then `applyPlace` receives the exact pin (`src/app/book.tsx:258-264`). The server independently rejects a non-null booking pin more than 20 km from its booked city (`server/main.ts:1360-1368`).

### Landmark/note → order row

1. A map hit's `name` becomes `TripPlace.note` (`src/trip-search.tsx:63-66`); a confirmed pin uses the preserved note, reverse label, or city fallback (`src/app/book.tsx:258-264`). Both pickup and dropoff notes remain editable fields with `maxLength={200}` and are required at submit (`src/app/book.tsx:453-459`, `src/app/book.tsx:677-680`).
2. `newBooking` receives `pickupNote` and `dropoffNote` in its payload, and `orderRequest` forwards that payload to `POST /orders` (`src/app/book.tsx:477-490`, `src/booking.ts:12-20`, `src/booking.ts:38-52`).
3. Server `text` trims strings, rejects a required empty value and rejects over-limit input (`server/main.ts:407-410`). The non-quote insert writes `text(body.pickupNote,200)` and `text(body.dropoffNote,200)` into **`orders.pickup_note` / `orders.dropoff_note`** (`server/main.ts:1662-1672`). The locked-quote path derives `effPickupNote` / `effDropoffNote`, requires both, and inserts those values into the same columns (`server/main.ts:1551-1555`, `server/main.ts:1599-1609`).
4. Serialization returns the stored notes only to the owner/admin or assigned driver; other viewers receive empty strings (`server/main.ts:284-303`).

## 2. Dispatch and offers

### Gates that keep automatic dispatch off in production

| Gate | Exact behavior | Evidence |
|---|---|---|
| Activation flag | `eligibilityDefaults.futureDispatchActivated` is **`false`**. `dispatchEnabled` is otherwise true only when **`NODE_ENV === 'test' && WIND_DISPATCH_TEST_ONLY === '1'`**. Thus normal production cannot enable it through `WIND_DISPATCH_TEST_ONLY`. | `server/domain/eligibility.ts:14-30` |
| Enabled service | `WIND_ENABLED_SERVICES` defaults to **`'parcel'`** (`server/main.ts:84`). Automatic rounds are restricted to `order.service === 'ride'` and `status === 'searching'`; parcels never enter this dispatcher (`server/domain/dispatch.ts:90-95`, `server/domain/dispatch.ts:140-145`). |
| Storage capability | `dispatchAvailable` requires PostgreSQL, existing `dispatch_rounds`, `dispatch_offers`, and `schema_migrations` tables, and a row **`schema_migrations.version = 13`**; otherwise rounds do not start and dispatch routes report unavailable where guarded (`server/domain/dispatch.ts:40-46`, `server/domain/dispatch.ts:58-60`, `server/domain/dispatch.ts:90-92`). |
| Measured ride / approach | No `order_requirements` row exhausts the round. Before insertion, the candidate must also have a current `order_approaches` row matching vehicle, requirements and run revisions, exact pickup coordinates, and `valid_until > now`; coverage is then checked through the ETA plus route and service time (`server/domain/dispatch.ts:152-183`). |
| Production fallback | `dispatchOrBroadcast` uses a round only if `dispatch.startRound` returns one; otherwise it calls the legacy broadcast. The legacy query selects up to 100 drivers with `ORDER BY random()` (`server/main.ts:1271-1285`). |

### Candidate selection and ranking

- Constants: shortlist limit **10**, offer lease **15 s**, maximum **3 offers/round**, round deadline **90 s**, matching fix maximum age **30 s**, idle credit cap **60 s**, idle divisor **10** (`server/domain/dispatch.ts:12`, `server/domain/eligibility.ts:17-25`).
- SQL shortlist requires an active driver; enrolled/approved/unexpired driver eligibility; approved/unexpired, inspection-clear matching vehicle; activated policy with matching revisions; an online leased presence session; and a same-session location with `effective_at >= now - 30 s`. Latest approved/current driver-licence, vehicle-registration and vehicle-inspection checks are required (`server/domain/dispatch.ts:108-126`).
- The same query requires sufficient seats/equipment, no active order for driver or shared vehicle, no prior release of this order by that driver, no earlier offer in this round, and no other open offer. It orders by PostGIS distance to pickup then driver ID and limits to 10 (`server/domain/dispatch.ts:126-136`).
- ETA uses OSRM duration when `OSRM_URL` works (`estimated:false`); failure or no configuration uses straight-line haversine distance at **30,000 m/hour**, rounded up and marked `estimated:true` (`server/main.ts:541-549`, `server/domain/dispatch.ts:31-38`, `server/domain/dispatch.ts:159-166`).
- Exact rank: `idleCreditSeconds = min(60, floor(max(0,idleSeconds)/10))`; `rankScore = pickupEtaSeconds - idleCreditSeconds`; sort ascending by `rankScore`, then `driverId`. Idle seconds come from presence-session `started_at`; rating is not an input (`server/domain/dispatch.ts:17-24`, `server/domain/dispatch.ts:159-166`).

### Round, offer, acceptance and reassignment lifecycle

| Operation | Code behavior | Evidence |
|---|---|---|
| Start | An existing open round/open offer is reused. Otherwise a new round gets incrementing `round_number` and `deadline_at = now + 90 s`, then immediately calls `issueNext` (`server/domain/dispatch.ts:90-105`). |
| Create offer | Ranked candidates are rechecked for unchanged eligibility/vehicle/run revisions, online presence, no active order, valid approach and coverage. The first passing candidate gets an open offer with a hashed lease nonce and stored ETA/idle/rank fields; `offers_issued` increments and `onOffer` runs (`server/domain/dispatch.ts:167-198`). Expiry is **`min(now + 15 s, round.deadline_at)`** (`server/domain/dispatch.ts:182-195`). PostgreSQL permits only one open offer per round and one per driver (`server/db/postgres-dispatch.sql:47-50`). |
| Exhaust | A deadline, three issued offers, no requirements, or no eligible candidate closes the round `exhausted` with `deadline` or `no_driver`; a non-ride/non-searching order closes it `cancelled` (`server/domain/dispatch.ts:140-156`, `server/domain/dispatch.ts:169-200`). |
| Decline / next candidate | The owning driver's open offer becomes `declined`, then `issueNext` runs in the same flow. Repeating a decline is idempotent; closed offers reject (`server/domain/dispatch.ts:203-217`). |
| Expiry / next candidate | The durable worker calls `processExpiries` on every `runOnce` (`server/worker.ts:126-138`). It selects due open offers/rounds in bounded batches, locks the order and related records, marks an unchanged order's offer `expired`, and calls `issueNext`; a changed order instead revokes the offer. At round deadline, open offers expire and the round becomes exhausted (`deadline`) or cancelled (`server/domain/dispatch.ts:320-365`). |
| Accept | Acceptance requires valid UUID/nonempty nonce, matching order/driver, open state and round, unexpired lease, unchanged order version/assignment epoch, the same live presence session, unchanged driver/vehicle/policy/requirements/run revisions, no busy driver/shared vehicle, no prior release, and the eligibility guard. It rechecks time after locking, then invokes `assign` (`server/domain/dispatch.ts:261-307`). The API callback atomically changes a searching order to assigned, and dispatch then marks this offer accepted, revokes other open offers, marks the round matched, and appends history/event records (`server/main.ts:2288-2315`, `server/domain/dispatch.ts:307-317`). |
| Customer retry | Retry requires capability + `dispatchEnabled`, customer ownership, and a searching ride; it creates/reuses a round and immediately issues an offer (`server/domain/dispatch.ts:220-237`). |
| Driver release → reassignment | Before collection, release clears driver/commission, restores searching status, records `order_releases`, and clears ride assignment state (`server/main.ts:2406-2428`). For an enabled ride, `reofferReleased` records release history and starts a new round; otherwise it legacy-broadcasts, excluding the releasing driver (`server/main.ts:1287-1294`, `server/main.ts:2429-2432`). |
| Cancellation | A PostgreSQL trigger revokes open offers and cancels the open round whenever an order transitions to cancelled (`server/db/postgres-dispatch.sql:66-77`). |

## 3. Maps, routing and ETA

### MapLibre WebView page

- Android loads **`${API_URL}/map/v1/map.html`** in `react-native-webview`; web loads `/map.html` in an iframe (`src/map-page.native.tsx:1-23`, `src/map-page.tsx:1-26`). The page vendors **MapLibre 6.12.0** (`public/map.html:14-20`, `public/map.html:139-146`).
- **Style source:** `new ml.Map({ style: 'https://tiles.openfreemap.org/styles/liberty', ... })` (`public/map.html:168-176`). The header identifies **OpenFreeMap vector tiles / OpenStreetMap data / no key**; CSP and preconnect permit `https://tiles.openfreemap.org` (`public/map.html:2-4`, `public/map.html:12-21`). The concrete vector-tile URL template lives in that remote style and is **not found in the files read**; there is no inline `sources` tile template in `map.html`.
- **Failure detection:** import failure, ready timeout and WebGL context loss send `{type:'failed'}`. Readiness requires both map load and at least one actual loaded vector basemap tile, not merely a parsed style or GeoJSON overlay (`public/map.html:139-146`, `public/map.html:184-206`). An alternate style/tile host inside `map.html` is **not found in the files read**.
- **Host fallback:** `SceneMap` replaces a failed map with its supplied fallback plus Retry; `BaselineRoute` supplies the `RoutePreview` diagram (`src/scene-map.tsx:28-44`, `src/scene-map.tsx:62-75`). That diagram draws stylized roads, a direct connector and stop labels, not a live tile map (`src/route-preview.tsx:40-66`). Provider retry/failure state is owned by `MapProviderBoundary` (`src/map-provider-boundary.tsx:30-60`).

### Server OSRM call and graph builds

- Server configuration is `OSRM_URL`; `OSRM_TIMEOUT_MS` defaults to **3000 ms**, clamped to **1000–10000 ms**. The call is **`${osrmUrl}/route/v1/driving/{lng,lat;...}?overview=full&geometries=geojson&steps=true${extra}`** (`server/main.ts:2761-2782`). Responses must be `Ok` with finite nonnegative distance/duration and valid GeoJSON coordinates; `NoRoute` returns an empty list, while other failures update routing health and throw (`server/main.ts:2783-2809`). Without `OSRM_URL`, `roadRoute` fails `503 route_unavailable` (`server/main.ts:2821-2822`).

| Build path | Upstream extract | West Bank clip? | Build / pinning result |
|---|---|---|---|
| `infra/osrm/Dockerfile` | `ADD https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf` (`infra/osrm/Dockerfile:5`) | **No.** It runs `osrm-extract`, `osrm-partition`, and `osrm-customize` directly on the full Israel-and-Palestine PBF (`infra/osrm/Dockerfile:6-11`). | OSRM image is tagged `v26.6.1-amd64-alpine`, but the **OSM extract is not pinned**: `-latest` changes on rebuild (`infra/osrm/Dockerfile:2-5`). |
| `infra/osrm/build-west-bank.sh` | `curl ... israel-and-palestine-latest.osm.pbf` (`infra/osrm/build-west-bank.sh:12`) | **Yes.** `osmium extract -s simple -p /d/boundary.geojson` clips before the three OSRM build stages (`infra/osrm/build-west-bank.sh:13-17`). The supplied boundary is copied from the caller; comments identify its outer ring as OSM relation 1803010 (`infra/osrm/build-west-bank.sh:2-4`, `infra/osrm/build-west-bank.sh:10-13`). | Uses the same tagged OSRM image, but the **OSM extract is not pinned**; no dated extract URL or checksum appears (`infra/osrm/build-west-bank.sh:9-18`). |

### Checkpoint handling

- Active checkpoints are read on demand. Reports older than **2 hours** and reports from blocked users do not count; the newest report by `created_at,id` determines status/note/time, while `agreeing` separately counts distinct reporters sharing that status (`server/main.ts:2156-2173`). Active non-customer users can report `open|slow|closed`, with a 10-minute repeat guard per checkpoint and 30 reports/hour across checkpoints (`server/main.ts:2174-2184`). Admin-created checkpoint positions are optional, but a supplied point must be within the `distanceKm <= 25` test of a selected city (`server/main.ts:2186-2199`).
- Routing considers positioned closed/slow checkpoints within **200 m** of a polyline. It requests `alternatives=3`; if OSRM's first route crosses a closure, it tries clear, non-backtracking alternatives, then ten via routes at **1, 2, 3, 5, 8 km** to either side. If no usable alternative exists it retains the original fastest route and reports the closure as still crossed (`server/main.ts:2774-2777`, `server/main.ts:2812-2867`).
- Slow checkpoints add **15 minutes each** to route selection/ETA; closed checkpoints get no invented fixed penalty (`server/domain/route-quality.ts:1-23`, `server/main.ts:2841-2866`). Route cache identity includes closed/slow checkpoint IDs and positions; calculated entries expire after 30 seconds (`server/main.ts:2828-2836`).

### The eleven seeded checkpoints

`seedCheckpoints` inserts only missing names, owned by the first active admin (`server/main.ts:2217-2226`). The literal seed list is exactly (`server/main.ts:2204-2216`):

| Line | Name | City IDs | Latitude | Longitude |
|---|---|---|---:|---:|
| `server/main.ts:2205` | حاجز حوارة · Huwara | `nablus` | 32.1780 | 35.2735 |
| `server/main.ts:2206` | حاجز زعترة · Za'tara | `nablus`, `ramallah` | 32.1153 | 35.2573 |
| `server/main.ts:2207` | حاجز دير شرف · Deir Sharaf | `nablus`, `tulkarm` | 32.2551 | 35.1852 |
| `server/main.ts:2208` | حاجز شافي شمرون · Shavei Shomron | `nablus`, `jenin` | 32.2642 | 35.1879 |
| `server/main.ts:2209` | حاجز عطارة · Atara | `ramallah`, `bireh` | 31.9828 | 35.2006 |
| `server/main.ts:2210` | حاجز جبع · Jaba' | `ramallah`, `bireh`, `jericho` | 31.8539 | 35.2564 |
| `server/main.ts:2211` | حاجز قلنديا · Qalandia | `ramallah`, `bireh` | 31.8623 | 35.2275 |
| `server/main.ts:2212` | حاجز عنبتا - عيناف · Anabta-Einav | `tulkarm`, `nablus` | 32.2904 | 35.1357 |
| `server/main.ts:2213` | حاجز شوفة · Shufa | `tulkarm` | 32.2803 | 35.0668 |
| `server/main.ts:2214` | حاجز أفني حيفتس · Avnei Hefetz | `tulkarm` | 32.2812 | 35.0757 |
| `server/main.ts:2215` | حاجز الطيبة · Taybeh | `tulkarm` | 32.2890 | 35.0152 |

### Arrival fence and maximum fix age

Exact server constants (`server/domain/ride-lifecycle.ts:12-19`):

```ts
export const RIDE_ARRIVAL_RADIUS_METERS = 300;
export const RIDE_ARRIVAL_FIX_MAX_AGE_MS = 120_000;
```

- Arrival is a ride-only operation requiring an exact pickup pin and a latest fix. A future fix or **`now - fix.at > 120_000`** fails `arrival_fix_stale`; haversine distance **`> 300 m`** fails `arrival_too_far`. Exactly 120,000 ms old and exactly 300 m pass those comparisons (`server/domain/ride-lifecycle.ts:157-184`).
- The client mirrors **`300` m / `120_000` ms** and uses them for its warning/hint calculation; the comment explicitly says the client value is not the server block (`src/ride-flow.ts:25-45`). Live order serialization also withholds a driver fix older than 120,000 ms (`server/main.ts:284-288`).

### ETA range formulas — exact source

**Server, default upper band when no explicit `band` is supplied** (`server/domain/journey.ts:8-16`, formula at line 12):

```ts
const min = band?.[0] ?? raw, max = band?.[1] ?? (raw === null ? null : (Math.round(1.3 * Math.ceil(raw / 60)) + 2) * 60);
```

Here `raw` is seconds. `etaProjection` returns `rawSeconds`, `minSeconds`, `maxSeconds`, basis/accuracy and validity only after timestamp/range checks (`server/domain/journey.ts:8-16`).

**Client** (`src/map-math.ts:102-103`):

```ts
export const etaRange = (minutes: number): [number, number] => [minutes, Math.round(minutes * 1.3) + 2];
```

Thus the client range is `[minutes, round(minutes × 1.3) + 2]`; the server default derives the upper bound from `ceil(rawSeconds / 60)`, applies the same ×1.3/+2-minute shape, and converts back to seconds (`server/domain/journey.ts:12`, `src/map-math.ts:103`). For `/api/route?journeyProtocol=1`, the server projects `result.minutes * 60` with a 30-second validity window (`server/main.ts:2890-2897`).
