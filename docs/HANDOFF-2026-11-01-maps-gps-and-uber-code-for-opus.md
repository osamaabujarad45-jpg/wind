# HANDOFF — Fastship maps / GPS / tracking: verified findings + Uber reference code

**Prepared:** 1 November 2026 · **Audience:** Claude Opus (implementation agent) · **Nature:** internal implementation handoff.
**Subject A:** the maps, GPS and live-tracking stack of this repository (Expo/React Native app + Node API).
**Subject B:** real declarations recovered from the production Uber rider APK (`com.ubercab` 4.654.10002), quoted as a contract reference for the same features.

**Status of this document: complete.** Every claim carries a file:line anchor or names the executed check that produced it. There are no unverified items left in the Fastship sections; the only items not executed are marked **HARDWARE** (an iOS device and a Google Maps key do not exist on this host) and are facts about the environment, not open questions.

**Verification legend**
- **[V]** read from the cited file:line, or produced by a check recorded in §A10.
- **[D]** observed on the physical device (SM-A5360) in this session.
- **[T]** produced by a test suite executed in this session.
- **[HARDWARE]** cannot be executed here; the reason is stated and the code path is read.

**Use rule for Subject B — read before copying:** Uber's code is proprietary. It is included as a behavioural/contract reference only. Write Fastship's own TypeScript against `server/domain/*.ts` conventions; never paste Java into the repo. The *shape* (state names, field semantics, error taxonomy, ordering guarantees) is what transfers.

---

# Part A — Fastship maps, GPS and tracking (verified)

## A0. Executive summary

1. **One map contract, four renderers.** Web and Android draw MapLibre GL + OpenFreeMap; iOS draws Apple MapKit; Google is an opt-in renderer compiled into the binary only when a restricted key was baked at build time. On Android the "MapLibre" renderer is a **WebView loading `/map.html` from the API origin**. **[V]** `src/map-provider.ts:13-17`, `src/route-map.tsx:19-53`, `src/route-map.android.tsx:18`, `src/route-map.native.tsx:21-26`.
2. **Provenance is enforced.** Google-sourced geometry can never be drawn by a non-Google renderer; unknown provenance draws pins but no line. **[V]** `src/map-provider.ts:97-100`, `src/road.tsx:38`.
3. **Driver GPS:** a 3-second background task, four client-side filters, a 5 s/15 s movement cadence, a device/session/sequence fence on every upload, a 70 m/s plausibility gate and a long-poll push to the customer. **[V]** §A3; **working on the device** **[D]** (GPS request + foreground service + live marker, §A8).
4. **Customer tracking** is a 12 s held long-poll plus a 10 s status poll, with a 30 s / 60 s / 120 s freshness vocabulary. **[V]** §A5.
5. **Routing** is self-hosted OSRM with checkpoint-aware route choice; the **live phone sandbox ran against the public OSRM** and produced a real road line and an 80–106 min ETA on the device. **[D]** §A8.
6. **The Uber reference** gives the contract Fastship lacks in five places: offer deadlines and per-verb error unions, a PIN policy enum with `shouldShow`, an ETA range/accuracy/validity triple, a waiting-window instant, and a normalised realtime snapshot. **[V]** Part B.

## A1. Where the map appears

| Screen | File | Map | Notes |
| --- | --- | --- | --- |
| Book | `src/app/book.tsx:20` | `RouteMap` + `canPin` | pins, road preview |
| Pin sheet | `src/pin-sheet.tsx:6,26` | `PinMap` | centred pin, reports on `moveend` |
| Order / trip | `src/app/order/[id].tsx:20,256` | `RouteMap` | **same screen for customer, driver, admin** (`:2`) |
| Public link | `src/app/track/[token].tsx:11,71` | `RouteMap forceBaseline` | anonymous, free renderer only |
| Driver jobs | `src/app/driver/index.tsx` | **none** | cards until a job is accepted |
| Roads | `src/app/roads.tsx:9,66` | `PinMap` only | checkpoint placement |
| Admin orders | `src/app/admin/orders.tsx:66` | none | external Google Maps link |

## A2. Renderers, provider selection and failure ladder

```ts
// src/map-provider.ts:13-17
export const platformRenderers: Record<string, MapRenderer[]> = {
  web: ['maplibre'], android: ['maplibre'], ios: ['apple'],
};
```

- Selection resolves configuration against **shipped capability**, never the other way round: a kill switch cannot enable a renderer the binary lacks. **[V]** `src/map-provider.ts:29-57,66-78`.
- Google content is renderer-locked: `canShowOnRenderer()` returns true for Google only on a Google renderer, and only `osrm` otherwise. **[V]** `src/map-provider.ts:85-100`.
- Public surfaces force the baseline before any choice: `forceBaseline` (`src/app/track/[token].tsx:71`; `src/route-map.android.tsx:75` comment: *"a Google-keyed build still makes zero paid calls here (T15)"*).
- **Failed renderers are remembered but never recorded** — see finding F11.

Failure ladder **[V]** `public/map.html:88,104,113-118`; `src/route-map.tsx:71-73,115-120`; `src/route-map.android.tsx:34-38,48-54`; `src/route-map.native.tsx:58-76`:
- style parsed ≠ ready: readiness requires an actually loaded **vector tile** (web/Android) or `tilesloaded` (Google) — a revoked key/quota never reaches "ready";
- deadlines: page 20 s, host 25 s (native Google 25 s);
- `webglcontextlost`, WebView renderer death, HTTP/offline failures → **diagram + Retry**;
- the diagram is the `RoutePreview` component (`src/route-preview.tsx:27`), wordless behind maps.

## A3. Driver GPS — sensor to server, with every limit

```
expo-location background task (3 s, High accuracy, AutomotiveNavigation)
  → JS filters: mocked / age > 30 s / future > 5 s / range / heading gate
  → cadence floor 2 s, 5 s moving, 15 s stationary
  → receipt + monotonic dedup, stop on 401/403/409
  → POST /api/location { lat, lng, age, heading, accuracy, activeGps }
  → server: rate 60/min → fence → age → 70 m/s plausibility → upsert
  → fix waiters wake the long-poll → customer marker glides
```

| Stage | Evidence |
| --- | --- |
| Sampling 3 s, High, AutomotiveNavigation, deferred, FG service AR/EN text | `src/background-location.ts:106-115` |
| Headless task, newest fix wins, restore-authority check | `src/background-location.ts:165-174` |
| Mock/age/future/range filters | `src/location-delivery.ts:43-44` |
| Heading only at `speed > 2.5 m/s` and `accuracy ≤ 50 m` | `src/location-delivery.ts:11-12` |
| Cadence `MIN_GAP = 2_000`, 5 s / 15 s | `src/location-delivery.ts:24-26` |
| Replay guard (never re-upload an older fix) | `src/location-delivery.ts:46-48` |
| Upload body uses **age**, not a device timestamp | `src/location-delivery.ts:64-68` |
| Fence: device hash, session id, sequence, assignment epochs | `src/active-gps-session.ts:11-35`; `server/main.ts:2319-2336` |
| Server: 60/min, age ≤ 60 s, not before assignment−15 s | `server/main.ts:2309,2353` |
| 70 m/s outlier: subtracts both accuracies, two references (last plausible, last displayed), more precise fix wins | `server/main.ts:2354-2378` |
| Upsert keeps the `good_*` reference | `server/main.ts:2397-2400` |

## A4. Presence (before a job) — a second, stricter transport

| Element | Value | Evidence |
| --- | --- | --- |
| Lease | 60 s, renewed by heartbeat | `server/domain/presence.ts:135,158` |
| Heartbeat | monotonic `seq`, duplicates deduplicated | `:153-160` |
| Consent | `consentVersion === 1` required | `:123` |
| Device binding | `hash('wp07-device:'+deviceId)`; second device → `409 presence_device_in_use` | `:126-129` |
| Status states | `offline / not_eligible / busy / online / location_stale` | `:103-120` |
| Online requires | fresh fix ≤ 30 s **and** dispatch enabled | `:116-119` |
| Offline | deletes latest location, writes audit row | `:145-149` |
| Sweep | expired leases, revoked sessions, eligibility/vehicle changes, stale pins > 30 s | `:30-69` |
| Presence ingest | age ≤ 30 s, ≥ 2 s since last, sequence advance, 70 m/s, **rejects while a job is active** | `:161-182` |

Client rule: active-job tracking and presence are mutually exclusive — presence stops the moment an order exists (`src/driver-work.tsx:196-197`).

## A5. What the customer sees — long-poll, freshness, public page

```ts
// server/main.ts:2416-2422
// "a watcher's request waits here and returns as soon as the driver's next fix is stored…"
const LIVE_HOLD = 12_000, LIVE_WATCHERS = 20, LIVE_TOTAL = 200;
const fixWaiters = new Map<number, Set<() => void>>(); // keyed by order id: a reassignment wakes the same watchers
```

- Re-auth and re-authorisation happen **before** coordinates go out (a held request must not outlive a revoked session): `server/main.ts:1648-1652,2453-2457`.
- A client that names a driver that is no longer assigned gets `driverChanged` with no fix: `:2430,2456`.
- Client cursor loop, background pause, backoff, terminal codes: `src/api.ts:110-155`.
- Freshness: `stale ≥ 60 s`, `reconnecting 30–60 s` (`src/location-state.ts:8-9`); public retention ≤ 120 s (`:28-30`); server refuses a public ETA when the fix is older than 30 s (`src/app/track/[token].tsx:45-51`; `server/main.ts:2599`).
- Public page is deliberately poorer: city centres only, no exact pins, no paid route, `forceBaseline` (`src/app/track/[token].tsx:71-73`; `server/main.ts:2612-2624`).
- Courier run: **no straight-to-you ETA or approach line** while other stops come first (`server/main.ts:2604-2610`; `src/road.tsx:42-43`). Observed live on the device, §A8.

## A6. Route and ETA

- OSRM only, `OSRM_URL`, timeout 1–10 s (default 3 s): `server/main.ts:2460-2464,2477-2485`.
- Checkpoint policy: 200 m radius, `alternatives=3`, bearing hint, perpendicular detours at 1/2/3/5/8 km, out-and-back rejection: `server/main.ts:2472-2548`; `src/map-math.ts:113-138`.
- Chosen route minimises **expected** time, using the same `SLOW_MINUTES` the fare charges: `server/domain/route-quality.ts:7-23`.
- Cache: key = rounded endpoints + heading bucket + checkpoint set; LRU budget **200,000 points** (`server/main.ts:2469-2571`).
- Display: `etaRange(m) = [m, round(1.3m)+2]` (`src/map-math.ts:98`), `kmLabel` (`:101`).
- Google paid path: `preview` / `destination` / `movement` (≥ 250 m, foreground) / authorized retry only; budgets 60/user/10 min, 2,000/day, 4 in flight; `TRAFFIC_UNAWARE`; `languageCode: 'ar'`; minimal field mask; **no caching** — `server/domain/google-routing.ts:26-40,101-132,317-393`. Fares/feasibility never read it (`server/main.ts:2584-2585`).
- Feasibility verdicts are evidence-gated: `feasible` only with complete evidence; every gap degrades to `uncertain` (`server/domain/routing-policy.ts:24-53`).

## A7. Camera and motion (identical intent, three implementations)

| Behaviour | Web | Android page | iOS |
| --- | --- | --- | --- |
| Follow zoom | 15 + offset `[0,-60]` | 15 + `[0,-60]` | `FOLLOW_DELTA = 0.012` (~1.3 km) |
| Gesture stops follow | drag/zoom → recenter | same | **pan only** (pinch does not) |
| Marker glide | `glideMs`/`turn`, shown pose | same | JS `glider` (iOS drops overlapped marker animations) |
| Stale | opacity 0.45, halo dimmed, approach removed | same | same |
| Pin centre report | on `moveend` | on `moveend` | **on every region change** |

Evidence: `src/route-map.tsx:150,212-287`; `public/map.html:38,125-134,245-286`; `src/route-map.native.tsx:19,49-56,98-135,171`.

The shared maths (`src/map-math.ts`) is duplicated in `public/map.html:40-85` and the copies are checked for equality by `tests/map.test.mjs:359-363` (including the A53 pixel fixture `metersPerPixelAtCoordinate(0,15,2.8125) ≈ 0.85`).

## A8. Device verification (SM-A5360, Android 16) — **[D]**

Setup: USB forwarding of the host port 4191 → `scripts/phone-test-server.mjs` (throwaway DB, `OSRM_URL=https://router.project-osrm.org`), test apps `ps.wind.app.testcustomer` / `.testdriver` (versionName 1.0.13, versionCode 1; the store package `ps.wind.app` is 1.0.13 / versionCode 17). Location permissions granted to the test packages for this session.

| Check | Observation |
| --- | --- |
| WebView map page in the app | customer order **W-00004** rendered OpenFreeMap tiles, Arabic labels (البيرة، عين مصباح), pickup dot + dropoff square, and a real OSRM road line (dark green) |
| Live fix delivery | posted a driver fix at 31.9042,35.2051 → within ~7 s the customer screen showed the blue heading arrow, accuracy halo, and *"موقع السائق · قبل ٨ ث"* (driver location · 8 s ago) |
| Driver side | same order on the driver test app: follow camera on the car, *"موقعك · قبل ٨ ث"*, status *"في الطريق للاستلام"* |
| Courier-run rule | with two active orders the public page showed **no** ETA and `sharedRun: true` from the API; after cancelling the second order the public page showed the **approach line** and *"يصل السائق خلال ٨٠–١٠٦ د"* (matches `etaRange(80) = [80,106]`) |
| GPS actually running | `dumpsys location`: `ProviderRequest[HIGH_ACCURACY, WorkSource{… ps.wind.app.testdriver}]`; last fused fix `32.312489,35.047967 hAcc=4.087` — **the same coordinates the server stored** |
| Foreground service | `dumpsys activity services`: `ps.wind.app.testdriver/expo.modules.location.services.LocationTaskService isForeground=true`, notification channel `wind-active-delivery-location`, colour `0xff12342a` |
| Freshness fallback | before a fresh fix arrived the map showed *"بانتظار تحديث موقع السائق"* (waiting for a driver location update) instead of a stale car |

Screenshots archived in `%TEMP%\opencode\` and copied to `.expo\phone-qa\device\maps-study-2026-11-01\`: `browser-engine-map.png`, `app-home.png`, `customer-order-map.png`, `customer-order-live-driver.png`, `driver-order-map.png`, `public-track-no-eta-run.png`, `public-track-eta.png`.

## A9. Findings register (all verified)

1. **No in-app turn-by-turn.** The driver map shows position and road; navigation is handed to Google/Apple Maps (`src/app/order/[id].tsx:35-38,499`). Deliberate product choice, not missing code.
2. **No map on the driver jobs list** (`src/app/driver/index.tsx` imports no map).
3. **Android maps require the API origin to serve a web export.** Dev serves `public/` (`server/main.ts:83-85`); production serves `WEB_ROOT` (`Dockerfile:29,32`; `WEB_ROOT=/app/web`). Missing export → every Android map 404s to the diagram. The checked-in `dist/map.html` is **stale** (15,670 B, 22 Oct) vs source (18,110 B, 1 Nov) — harmless for a Docker build, a trap for a hand deploy from `dist/`.
4. **No offline tiles.** `public/sw.js` is push-only (no `fetch` handler, `:24-46`); MapLibre relies on the browser HTTP cache.
5. **Long-poll is single-process.** In-process waiters; the upgrade is named in the code (`server/main.ts:2419`).
6. **Two GPS transports with different limits** (presence ≤ 30 s/≥ 2 s/no active job; active-job ≤ 60 s/2 s floor/5–15 s cadence).
7. **ETA uncertainty is a display formula** `[m, 1.3m+2]`, not a measured interval (`src/map-math.ts:98`).
8. **Accuracy-first outlier override.** A fix more precise than the reference is accepted even if the movement is impossible (`server/main.ts:2372`); intentional recovery path, but a spoofed high-accuracy jump wins one round.
9. **iOS parity risks (read, not device-run):** pinch does not stop follow; pin centre fires on every region change; marker animation is JS-driven (`src/route-map.native.tsx:49-56,98-101,171`). **HARDWARE:** no iOS device on this host.
10. **Public tracking is deliberately poorer** (see A5).
11. **Renderer-failure memory is never written.** `recordMapFailure()` (`src/map-failures.ts:6`) has no caller outside `tests/map-policy.test.mjs`; renderers show their own Retry/diagram but never record the failure, so `failedRenderers(key)` is always empty at runtime and the configured fallback can never react to an observed failure.
12. **Camera-intent abstraction is dead code.** `src/map-viewport.ts` (`MAP_FOLLOW_ZOOM`, `visibleMapInsets`, `mapCameraIntent`) is imported only by `tests/map-policy.test.mjs:5`; the three renderers hardcode their own follow rule — the drift visible in finding 9.
13. **Android draws no driver until the first injected update.** `public/map.html` uses `config.driver` only for bounds (`:95`); the marker comes from `window.wind(...)` (`:120-122`). Normally invisible (the host injects on `style.load`), but a host-less page shows pins and no car.
14. **Full-suite gate: two stale WIP tests** (both are test-side, verified):

    - `tests/google-map-lifecycle.test.mjs` — its module sandbox does not stub the two modules `map-mode.ts` now imports (`src/runtime-config.ts`, `src/map-failures.ts`, both untracked). With those stubbed the same test passes: *"Google web lifecycle: tile deadline/retry, detached DOM cleanup, latest center/geometry and denied map-mode storage passed"*.
    - `tests/deployment.test.mjs:52` — asserts explicit `COPY src/<file>` lines in the Dockerfile, but the WIP moved to a build-time closure. Verified: `node scripts/runtime-dependencies.mjs .expo/api-runtime-check` copies **6 shared sources**: `src/model.ts`, `src/map-math.ts`, `src/runtime-config.ts`, `src/client-diagnostics.ts`, `src/api-clock.ts`, `src/command-id.ts` — the image would contain them.
15. **Scenario suite stops at handover** (reproduced twice, full build and `--no-build`): `Order 1 did not reach completed` after the correct handover code. The map/tracking stages before it pass (see §A10). Attribution: the 130-file uncommitted handover WIP (`server/domain/ride-lifecycle.ts`, `src/app/order/[id].tsx`, `src/model.ts`, `src/parts.tsx`, new `src/ride-flow.ts`); the three lifecycle suites pass. Not a maps-stack failure.
16. **Lint is red in the working tree:** `src/session.tsx:49` — a React purity rule (*"Cannot call impure function during render"*), plus two warnings (`src/api.ts:2` unused `Platform`; `src/use-driver-recovery.ts:36` unnecessary deps). Not map code; recorded so the gate is honest.

## A10. Verification record (executed this session)

### A10.1 Targeted suites — 27 run, 26 pass

Map/GPS/tracking suites: `map`, `map-security`, `map-policy`, `route`, `route-quality`, `routing-policy`, `google-routing`, `google-maps-loader`, `background-location`, `active-gps-client`, `active-gps-native`, `customer-location`, `driver-presence`, `driver-presence-api`, `driver-presence-runtime`, `driver-presence-card`, `presence`, `presence-migration`, `location-permission-timeout`, `location-web-clock`, `runtime-config`, `share`, `api-focus`, `ride-lifecycle`, `ride-lifecycle-races`, `ride-lifecycle-sqlite` — **all PASS**. `google-map-lifecycle` — **FAIL** for the harness reason in finding A9.14.

### A10.2 Full suite sweep — 101 suites, 99 pass, 2 fail (both diagnosed)

`scripts/run-tests.mjs` stops at the first failure (`deployment.test.mjs`), so the same 101 suites were re-run individually with continue-on-failure (`%TEMP%\opencode\run-all-suites.mjs`): **99 pass**, and the only two failures are the stale-test cases in finding A9.14 (`deployment.test.mjs`, `google-map-lifecycle.test.mjs`). Every other suite in the repository is green on this tree.

### A10.3 Typecheck

`npx tsc --noEmit` → exit 0; `npx tsc --noEmit -p tsconfig.server.json` → exit 0. **[V]**

### A10.4 End-to-end UI journey (`scripts/check-scenarios.mjs`, real Chromium, real tiles, fixture GPS/OSRM)

Passed: *"driver accepts, real MapLibre renders pickup/dropoff/driver, GPS reaches customer"*; *"two-way chat and anonymous recipient tracking without private contacts or landmarks"*; *"public ETA is cleared and refetched when the same driver changes trip stage"*. Then the handover failure in A9.15.

### A10.5 Endpoint and header gates (throwaway server)

| Request | Result |
| --- | --- |
| `GET /api/route` (no token) | 401 |
| `GET /api/route/google?…` (no token) | 401 |
| `POST /api/location` (no token) | 401 |
| `GET /api/track/<64 hex>/eta` (unknown link) | 404 |
| `GET /map.html` | 200, 18,110 B, **no CSP** (documented exception, `server/main.ts:127-128`) |
| `GET /index.html` | 200, 1,863 B, CSP present |

### A10.6 Full suite detail

| Suite group | Result |
| --- | --- |
| 99 suites (all others, including every map/GPS/tracking/domain/integration suite) | **PASS** |
| `deployment.test.mjs` | **FAIL** — stale Dockerfile-pattern assertion; build closure verified to copy 6 shared sources incl. `src/map-math.ts` (A9.14) |
| `google-map-lifecycle.test.mjs` | **FAIL** — stale sandbox stubs; passes with `./runtime-config` and `./map-failures` stubbed (A9.14) |

Raw results: `%TEMP%\opencode\all-suites.json` (per-suite exit, duration, last output line) and `all-suites.log`.

---

# Part B — Uber reference code (real declarations)

**Provenance.** Recovered from the production rider build `com.ubercab` 4.654.10002 (versionCode 322019), base package 207,761,677 B, SHA-256 `55663c73…c3e4a2`. The declarations below are quoted from a local source conversion of that build (128,117 source files). The internal reference `reports/uber-real-code-reference-2026-11-01.md` records the exact method, the archive and the re-derivation steps; **do not copy the code itself** (see the use rule above).

## B1. Ride lifecycle

```java
// com/uber/model/core/generated/rtapi/models/rider/RideStatus.java
public enum RideStatus implements WireEnum {
    LOOKING(0), DISPATCHING(1), WAITING_FOR_PICKUP(2), ON_TRIP(3);
```

```java
// …/rtapi/services/marketplacerider/ClientStatus.java
public class ClientStatus extends f {
    private final Boolean isArriving;
    private final Boolean isConcurrencyEnabled;
    private final JobUuid lastRequestJobUUID;
    private final String lastRequestMsg;
    private final String lastRequestNote;
    private final TripCancellationType lastRequestType;
    private final Meta meta;
    private final RideStatus status;
    private final String statusDescription;
    private final TripPendingRouteToDestination tripPendingRouteToDestination;
```

```java
// …/TripEventsPickupStatus.java            // …/TripEventsPickupState.java
UNKNOWN, EN_ROUTE, ARRIVING_SOON,          EN_ROUTE,
ARRIVED_WAITING, ARRIVED_WAITING_LATE,     ARRIVED_WAITING,
ARRIVED_CHARGING, ARRIVED;                 ARRIVED_LEAVING_SOON,
                                           ARRIVED_WAITING_PAUSED,
                                           ARRIVED_CHARGING, ARRIVED_CHARGING_PAUSED;
```

```java
// …/TripCancellationType.java
CLIENT_CANCELED(0), DRIVER_CANCELED(1), AUTO_CANCELED(2),
REQUEST_EXPIRED(3), FORCE_ENDED(4), UNKNOWN(5);
```

**Transfer:** completion/cancellation live outside the live-status enum; "arriving" is a boolean, not a status; waiting has paused/leaving-soon variants.

## B2. Offers

```java
// …/GenericRiderOffer.java
private final Integer acceptWindowInSec;
private final h<String, RiderOfferViewModel> linkedRiderOfferViewModels;
private final TimestampInMs offerExpiryAt;
private final ImmutableList<OfferTripState> offerTripStates;
private final OfferUUID offerUUID;
private final RiderOfferAdditionalStepsType riderOfferAdditionalStepsType;
private final RiderOfferMetadata riderOfferMetadata;
private final RiderOfferType riderOfferType;
private final RiderOfferViewModel riderOfferViewModel;
private final TripUuid tripUUID;
```

Per-verb error unions: `AcceptOfferErrors` = badRequest, notFound, rateLimited, unauthenticated, unauthorized; `RejectOfferErrors`/`ExpireOfferErrors` = badRequest, rateLimited, unauthenticated; `AckOfferErrors` = noActiveSessions, serverError, unauthenticated.

**Transfer:** relative **and** absolute deadline; accept is the only verb that can return not-found/unauthorized; ack is fire-and-forget.

## B3. Boarding PIN

```java
// com/uber/model/PinVerificationSchedule.java
ALL_TRIPS, NIGHT_TRIPS, NOT_REQUIRED, UNKNOWN;

// …/PinVerificationType.java
UNKNOWN, SAFETY_PREFERENCE, PICKUP_RISK_CONFIRMATION, PARTICIPANT_VERIFICATION,
SAFETY_MODE, THIRD_PARTY_PARTICIPANT_VERIFICATION, PROVIDER_SETTING;

// …/PinVerificationInfo.java
private final Boolean isVerified;
private final String pin;
private final PinVerificationType pinVerificationType;
private final QRCodeInfo qrCodeInfo;
private final Boolean shouldShow;
private final VerificationMethod verificationMethod;
private final Boolean wirelessVerificationEnabled;

// …/PinSpec.java
private final Boolean usePin;

// …/QRCodeInfo.java
private final String title;
private final String url;
```

**Transfer:** policy reason + `shouldShow` separate from the PIN; `isVerified` on the same object for idempotent reconnects; QR fallback is data (`title`, `url`).

## B4. ETA and waiting

```java
// EtaRange.java (Eats gateway model)          // EtaAccuracy.java (rider matching signal)
private final Integer max;                     UNKNOWN, LOW, MEDIUM, HIGH;
private final Integer min;
private final Integer raw;

// ETAValidity.java                            // ETAType.java
private final d expiresAt;                     UNKNOWN, MIN_ETA, MAX_ETA;
private final Duration expiresIn;
private final d issuedAt;

// DriverWaitingInfo.java
private final String calloutText;
private final TimestampInSec waitingEndTimestampSec;
```

**Transfer:** range + raw point + accuracy grade + validity stamps; an absolute waiting-end instant instead of a client constant.

## B5. Money shapes

```java
// TripBalance.java                     // FareChange.java
private final String amount;            private final String changeType;
private final int count;                private final String changeTypeText;
private final String currency;          private final String detailedMessage;
private final String detail;            private final String oldFare;
private final String endsAt;            private final String title;
private final String label;             private final String updatedFare;
private final String startsAt;
```

**Transfer:** Fastship keeps integer minor units internally; steal only the **event shape** — before/after fares with a typed reason and pre-rendered copy.

## B6. Realtime feed

```java
// TripEventsInfo.java
private final TripEventsInfoEventUuid currentEventRef;
private final ImmutableList<RiderUuid> currentMatchedEntityRefs;
private final DriverWaitingInfo driverWaitingInfo;
private final h<RiderUuid, TripEntity> entities;
private final ImmutableList<TripEventsInfoEvent> events;
private final h<String, Location> locations;
private final TripEventsMatchLookingState matchLookingState;
private final TripEventsMatchStatus matchStatus;
private final String matchStatusDescription;
private final String matchStatusDescriptionShort;
private final String statusDescription;
private final TripEventsInfoTimeline timeline;
private final TripUuid tripUUID;
private final TripEventsWalkingInfo walkingInfo;

// TripEventsInfoTimeline.java
private final Double progress;
private final String tripStateDescription;
```

**Transfer:** a normalised snapshot (maps + append-only events + current pointer), not a delta stream; `timeline.progress` for the progress indicator.

## B7. Mapping table

| Uber declaration | Fastship today | Action |
| --- | --- | --- |
| `RideStatus` 4 states | `OrderStatus` (`src/model.ts:21`) | Keep Fastship's parcel states; move completion/cancel out of the live set only if UI keys off it |
| `ClientStatus.lastRequest*` | order serialization (`server/http`) | Add last offer outcome to the order response |
| `TripEventsPickupStatus/State` | single `at_pickup` | Add waiting/paused sub-state (needed by safety hold) |
| `TripCancellationType` | `cancelled` | Add reason if cancellation accounting needs it |
| `GenericRiderOffer.acceptWindowInSec` | `dispatch_offers.expires_at` | Add `acceptWindowSeconds` |
| Per-verb offer errors | shared 409 family (`server/domain/dispatch.ts`) | Split accept/reject/expire/ack |
| `PinVerificationSchedule`/`Type` | `boardingEnabled()` boolean (`server/domain/ride-lifecycle.ts:19`) | Add policy + reason |
| `PinVerificationInfo.shouldShow` | code + attempts | Add `shouldShow`, `pin_issued_at` (rotation) |
| `QRCodeInfo` | none | Optional URL fallback |
| `EtaRange`/`EtaAccuracy`/`ETAValidity` | `EtaResult { seconds, estimated }` (`server/domain/dispatch.ts:9`) | Add min/max/accuracy/expiry |
| `DriverWaitingInfo.waitingEndTimestampSec` | `RIDE_GRACE_MS` constant | Expose the end instant |
| `FareChange` | change-destination re-quote | Emit a before/after event |
| `TripEventsInfo` | `server/domain/realtime.ts` | Already equivalent; add `timeline.progress` |
| `TripBalance` string amounts | `money.ts` minor units | Do **not** change representation |

---

# Part C — Residual limits (environment facts, not open questions)

1. **HARDWARE: no iOS device.** Apple MapKit and the Google native renderer are compared by reading; the three iOS-specific behaviours in A9.9 are code facts.
2. **HARDWARE: no Google Maps key on this host.** No paid upstream call was possible; the budget/validation/error mapping is covered by `tests/google-routing.test.mjs` (PASS) and by reading `server/domain/google-routing.ts:317-393`.
3. **No physical drive.** GPS was exercised on the device while stationary; speed-dependent cadence (5 s) and heading gating are covered by unit tests and code, not by a driving trace.
4. **Handover E2E failure is WIP**, attributed in A9.15; it blocks the receipt/rebook/scheduled stages of the scenario suite.

---

# Part D — Suggested next steps for Opus

1. **Close the WIP gaps that this study found** (small, isolated):
   - call `recordMapFailure(key, renderer)` from each renderer's `onFail`/deadline path so the configured fallback can actually react (A9.11);
   - either wire `mapCameraIntent`/`MAP_FOLLOW_ZOOM` into the three renderers or delete `src/map-viewport.ts` and keep the tests on the real constants (A9.12);
   - fix the two stale tests (`google-map-lifecycle` sandbox stubs; `deployment.test` Dockerfile pattern) so the gate is green (A9.14);
   - fix `src/session.tsx:49` purity error and the two lint warnings (A9.16).
2. **Adopt the five Uber contract shapes** in the order that unblocks WP10/WP11: offer deadlines + per-verb errors → PIN policy/reason/rotation → ETA range/accuracy/validity → waiting-end instant → fare-change event (B7).
3. **Do not** copy Uber code; keep the representation decisions Fastship already made (minor units, four+ parcel statuses, offline outbox).

---

**Evidence index**
- Study: `docs/STUDY-2026-11-01-app-maps-gps-tracking.md`
- Uber code reference: `reports/uber-real-code-reference-2026-11-01.md`
- Uber evidence archive: 198 files under `research_notes/` (internal); the consolidated fact documents are `docs/KNOWLEDGE-2026-11-01-uber-app-*.md`
- Device captures: `.expo/phone-qa/device/maps-study-2026-11-01/`; full-suite raw results `%TEMP%\opencode\all-suites.json`
- Tracker: `docs/CURRENT-WORK.md`
