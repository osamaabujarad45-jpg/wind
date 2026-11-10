# Maps handoff for Astra 6 — 10 November 2026

You are taking over the maps work on Wind (repo name Fastship): a parcel, ride and freight app for the West Bank, live for a 50-user pilot since 7 November. Your job is to make the maps better for real drivers and customers on real phones and slow mobile data, without breaking a live service.

This file is self-contained. Everything marked **[source]** was read by the author in `origin/master` at commit `1cd0de8` (9 Nov 2026, PR #18). Everything marked **[carried]** comes from earlier handoffs or session notes and was not re-checked; verify it before you rely on it. File and line anchors are for `1cd0de8`; re-check them if master has moved.

## 1. Read this before touching anything

1. **Branch from `origin/master`, never from local `master`.** Local `master` (`b609229`) is an old docs-only lineage, 221 commits behind. It has no `src/runtime-config.ts`, no `src/scene-map.tsx`, no map tests. A new worktree or a delegated worker with worktree isolation starts from that old lineage by default. Check with `git merge-base --is-ancestor origin/master HEAD` before you write a line.
2. **The 2 Nov Uber study pack is not on `origin/master` on purpose.** It lives on local `master`, on `claude/ponytail-review-8c424d` and on `origin/backup/handoff-docs-full-20261103`, all on that old lineage. Read it there if you need it (§7); do not build on those branches.
3. **A merge is not a deploy.** Production runs a tagged image on an Azure VM. Android has no over-the-air updates: any change to client code, including `src/` map hosts, reaches Android users only with a new APK. A change to `public/map.html` alone reaches Android with a server deploy, because the WebView loads the page from the API (see §2). **[source]** `src/map-page.native.tsx:10`.
4. **Do not deploy, migrate or change production settings without the owner's go-ahead.** Commit, push and PR are covered for work the owner asked for; deploys are not.
5. **Tests and heavy builds run on the test PC, not on the owner's PC.** Host `DESKTOP-S2JKMK5` over SSH (user `pc gaming`; the `k5` alias in `AGENTS.md` is the same class of machine and the project's own runner notes are in `docs/HANDOFF-2026-10-30-phone-acceptance.md`). One folder and one PostgreSQL port per session; never write into, start or stop another session's folder or port. If the host does not answer, wait and re-probe. Never fall back to the owner's PC. **[carried]**
6. **Never use an emulator.** UI acceptance is on the physical Android phone `SM-A5360` (adb serial `R5CTB0FJP9Z`). If it is not attached, stop and ask. **[source]** `AGENTS.md:45`.
7. **Repository:** `origin` is `osamaabujarad45-jpg/wind`. `legacy-origin` is frozen; never push to it. For `gh`, use `GH_TOKEN=$(gh auth token --user osamaabujarad45-jpg)`. **[carried]**
8. **Docs to read next, on `origin/master`:** `docs/CURRENT-WORK.md` (top), `docs/HANDOFF-2026-11-05-NEXT-LEAD.md` (top section), `docs/PILOT.md`, `docs/HANDOFF-2026-10-31-maps-real-data.md`, `SPEC-android-map.md`, `SPEC-live-map.md`, `SPEC-checkpoint-routing.md`, `SPEC-routing-eta.md`. Your own earlier plan is `tasks/MAPS-GPS-HANDOFF-PLAN-2026-11-01.md`; its implementation record is `reports/maps-gps-handoff-implementation-2026-11-01.md`.

## 2. How the maps work today

### One map page, three hosts

| Platform | Renderer | Host file | Notes |
|---|---|---|---|
| Android | MapLibre in a WebView | `src/map-page.native.tsx` | Loads `${API_URL}/map/v1/map.html`. No Google key in the baseline APK. |
| Web (and iPhone home-screen app) | MapLibre in a same-origin iframe | `src/map-page.tsx` | Loads `/map.html`. Browser gates reach it with `page.frameLocator('iframe[title="map"]')`; `window.windMap` is the live camera. |
| iOS native | Apple Maps via `react-native-maps` | `src/route-map.native.tsx` | A separate renderer, not `map.html`. Not part of the pilot. Leave it alone unless asked. |

A Google renderer exists behind a build-time key and a user opt-in (`src/google-map.*.tsx`, `src/map-provider.ts`, `src/map-mode.ts`). Baseline is the default and the fallback. Google route geometry may only be drawn on a Google renderer (`canShowOnRenderer`, `src/map-provider.ts`); unknown provenance draws no line. **[source]**

### The page: `public/map.html` (486 lines) **[source]**

- MapLibre 6.12.0 from `/vendor/maplibre-6.12.0/`, style `https://tiles.openfreemap.org/styles/liberty` (line 152), restyled at load by `restyle()` (line 260): pale ground, white streets, yellow main roads, 3D buildings and shields hidden.
- **Input:** JSON in the URL fragment (never sent to the server), then `window.wind({...})` updates. **Output:** messages `ready | failed | drawing | gesture | moving`, and in pin mode `center` with coordinates.
- **Three modes in one page, switchable without reload:** `browse` (plain map), `pin` (fixed centre pin, map moves under it), `route` (stops, road line, driver, closed checkpoints).
- **Ready means a real basemap tile drew**, not just `load` (lines 164–177). The deadline is the app's `mapReadyTimeoutMs`, passed as `readyMs`, 5–30 s, default 20 s (line 124; `src/runtime-config.ts:4`). The host adds 5 s on top (`src/map-bridge.ts`).
- **Labels:** `name:ar`, then `name:en`, `name:latin`, then the local name unless it is Hebrew script (lines 112–119). The Hebrew check is a twelve-letter probe, not a script test; the comment says so.
- **Driver marker:** glides to each fix over the gap between fixes (`glideMs`, line 98), snaps on a jump over about 2 km (`farJump`, line 99), turns smoothly, halo follows the drawn marker. The approach line is redrawn from the marker about ten times a second (line 471).
- **Camera:** without a driver, frame both stops and the whole road line (`refit`, line 376, max zoom 16). With a driver, either frame driver plus next stop (customer) or follow the car at zoom 16 with an offset for the sheet (`follow`, driver). A user pan or pinch stops the camera and shows Recenter.
- **Lines follow roads only.** There is never a straight pickup-to-dropoff line (line 327). Keep it that way.
- **Performance choices already made:** `pixelRatio` capped at 2 (line 156), modulepreload for all three MapLibre modules, preconnect to the tile host, favicon suppressed.
- **Helpers are duplicated on purpose.** Lines 70–120 mirror `src/map-math.ts`; `tests/map.test.mjs` checks the copy. Change both together.

### The host side **[source]**

- `src/scene-map.tsx` — `SceneMap` is what screens use. It owns the loading cover, the failed state with Retry, and the fallback (`RoutePreview`, a diagram, for routes). Retry remounts the page with a new attempt key.
- `src/map-bridge.ts` — `useMapBridge` sends updates and reads messages. It never echoes a user's own map movement back as a camera command, and ignores the page's old viewport while a new centre is crossing. This guard logic is subtle; read the comments before changing it.
- `src/map-sheet.tsx` — the bottom sheet over a full-screen map. Its closed height is reported through `onPeek` so the map keeps pin and camera clear of it. In landscape on a short screen it becomes a 340 pt side sheet.
- `src/pin-sheet.tsx` — pin picking in a sheet. Confirm is disabled while not ready, locating, positioning, or nothing selected (line 89). The booking screen's own full-screen pin step is in `src/app/book.tsx` (around line 561).
- `src/driver-map.tsx` — the map behind the driver's jobs. Offline means no GPS at all; online it re-reads the position every 45 s.
- Screens that draw a map: `src/app/(customer)/index.tsx`, `src/app/book.tsx`, `src/app/order/[id].tsx`, `src/app/track/[token].tsx`, `src/app/driver/index.tsx`.

### Routing and ETA on the server **[source]** `server/main.ts`

- OSRM, car profile, from `OSRM_URL` (line 2738). Timeout `OSRM_TIMEOUT_MS`, 1–10 s, default 3 s. Requests use `overview=full&geometries=geojson&steps=true`.
- `roadRoute` (line 2797): rounds both ends to about 10 m, asks for three alternatives, passes the driver's heading as a bearing hint, and avoids checkpoints reported closed. A route within 200 m of a closed checkpoint counts as passing through it (`CHECKPOINT_RADIUS`). If every alternative is blocked it tries forced detours through via points 1, 2, 3, 5 and 8 km either side. Slow checkpoints add the same delay the fare model charges (`server/domain/route-quality.ts`).
- Cache: keyed by ends, heading, and checkpoint state; entries expire 30 s after calculation; budget of 200,000 geometry points.
- `GET /api/route` (line 2866): 120 requests per 10 minutes per user; `steps=1` adds turn-by-turn with street names in the requested language.
- Dispatch ETA uses OSRM when configured and a marked straight-line estimate otherwise (line 540).
- **No map matching.** Nothing calls OSRM `/match`, `/nearest` or `/table`. The driver's raw GPS fix is what gets drawn.
- Place search: `server/domain/place-index.ts` (24k places from a Geofabrik extract, per-keystroke `/api/places/suggest`, `/api/places/reverse`), with Nominatim (`/api/places/search`) as the wider fallback.

### The live route on the client **[source]**

| What | Value | Where |
|---|---|---|
| Driver GPS while on a job | every 3 s, high accuracy, automotive | `src/background-location.ts:109` |
| Approach route refetch | every 25 s, and when the driver crosses a ~110 m grid cell | `src/road.tsx:88–89`, `roadPath` in `src/map-math.ts` |
| Navigating driver's own route | exact position (5 decimals) with heading, steps on | `src/road.tsx:87` |
| Leave-the-line reroute | 50 m moved, 30 s since anchor, more than 40 m off the kept line | `src/road.tsx:80` |
| Fix counts as fresh | under 30 s | `src/road.tsx:102` |
| ETA shown as a range | `[m, round(m × 1.3) + 2]` | `etaRange`, `src/map-math.ts` |
| Next maneuver | passed within 15 m, uses the line and heading | `src/nav-steps.ts:11,18` |

`src/api.ts` appends `journeyProtocol=1` to `/orders`, `/jobs`, `/offers`, `/route`, `/price` and `/admin/orders`. Test matchers must compare `pathname`, not the full URL. **[carried]**

### Production facts **[carried — check before relying]**

- Image `wind-api:20261109-design`, Android 1.1.0 (24). Parcels only; ride and freight are off.
- OSRM runs as container `wind-osrm` on the VM with a West Bank graph. The first thing to check when "maps show no real data" is `OSRM_URL` and that container; an admin can read `GET /api/admin/routing`.
- Production database is SQLite. Driver presence and dispatch are PostgreSQL-only, so the jobs board is the driver flow.
- On 31 Oct the provider comparison kept OpenStreetMap data: Nominatim found 18 of 19 West Bank places within 1.5 km, Azure Maps 8, Amazon Location 4. Do not switch provider to "fix" maps.
- A53 baseline, 31 Oct: panning in the WebView at 117 fps on a 120 Hz screen; order screen with map costs about +133 MB app memory plus an 81 MB renderer; cold open about 2.5 s to tiles on a local backend.

## 3. What is proven and what is not

**Proven on the phone [carried]:** Arabic default, live Arabic turn guidance, far-pickup warning, job accept through the location prompt, a full two-role parcel trip on the sandbox.

**Not proven:**

- Maps on real 3G. Every phone run used a local backend. **Booking has never been measured on a 3G connection.**
- GPS accuracy on real roads; the 1 km far-pickup threshold is a guess.
- A delivery completed on production.
- TalkBack on any map screen.
- Anything on iOS native.

**What automated gates cover:** CI runs typecheck, lint, `npm test` and `test:persistence` only. The browser suites are not in CI: `test:tulkarm` (needs an OSRM tunnel), `test:scenarios`, `test:location`, `test:jobs-ui`, `test:access`, `test:readiness`, `test:android-browser`. Three of them went stale unnoticed during the map rewrite, and one was hiding a real bug. Run them yourself after any map change. **[carried]**

**What only the phone catches [carried]:** the keyboard covering a sheet, a turn banner computed from straight-line distance, a route starting from a grid cell instead of the car, a Cancel button under the navigation bar, slow indoor GPS. None of these showed in a browser.

## 4. Work queue, in the order I would do it

Each item says what is known, what is a guess, and what "done" means. Measure before you change anything in items 1 to 3.

### 1. The missed Confirm press on the pin (bug, unexplained)

- **Known [carried]:** on the phone, tapping Confirm right after picking a place sometimes did nothing. Never explained. The next-lead handoff cites `public/map.html:329` and `:197`; those line numbers are stale.
- **Known [source]:** `map.on('movestart')` sends `moving` for every move in pin mode, including the page's own 350 ms `easeTo` in `centerPin` (`public/map.html:340`, `:206`). On the booking screen `moving` sets `pinMoving`, which disables Confirm until the next `center` message clears it (`src/app/book.tsx:561–562`, `:597`). The bridge also drops a `center` that does not match the centre it is waiting for (`src/map-bridge.ts`, `receive`). `src/pin-sheet.tsx` does not listen to `moving`; it has its own `positioning` guard.
- **Guess:** a tap during that 350 ms ease lands on a disabled button. A second thing to rule out: a dropped `center` leaving `pinMoving` set longer than the ease. The other candidate, the keyboard window still closing, was removed by a later change.
- **Do:** reproduce first. Pick a place, tap Confirm at once, 20 times, count misses, on the phone. If the guess holds, the smallest fix is to send `moving` only for user-originated moves (`e.originalEvent`, as `zoomstart` already does on line 342) or to jump instead of ease when the move came from a search pick.
- **Done:** 0 misses in 20 on the phone, `tests/booking-map-sheet.test.mjs` and `tests/map.test.mjs` green, and a test that fails without the fix.

### 2. Measure the map on slow mobile data, then set a budget

- **Known [source]:** a cold map needs `maplibre-gl.mjs` (597 kB), `maplibre-gl-shared.mjs` (517 kB), the worker (19 kB), the RTL text plugin (133 kB, lazy), `map.html` (33 kB), then the style, glyphs, sprite and tiles from OpenFreeMap. Sizes are uncompressed; the server sends brotli. Vendor files are `immutable` for a week; `/map/v1/map.html` is cached for a day; `/map.html` is `no-cache`.
- **Not known:** time to first tile and to `ready` on 3G, how often the 20 s deadline fires, what the user sees meanwhile.
- **Do:** measure on the A53 with Chrome DevTools throttling over `adb forward` (Slow 3G and a 400 kbit/s profile), cold and warm, in Nablus, Ramallah and Jenin. Record time to `drawing`, to `ready`, and bytes. Only then decide. Candidates, cheapest first: confirm brotli and caching actually hit in the WebView; trim the style to the layers `restyle()` keeps; preload the style JSON; a lower `maxZoom` on first frame.
- **Done:** a table of numbers in the PR, a stated budget, and a browser gate that fails when the cold page weight grows past it.

### 3. The tile host is a single point of failure (needs an owner decision)

- **Known [source]:** style, tiles, glyphs and sprites all come from the public `tiles.openfreemap.org`. There is no second source and no local cache beyond the browser's. `docs/operations/provider-failures.md` covers OSRM and Google but not tiles. When tiles fail, the page reports `failed` and the app shows Retry over a diagram (routes) or a plain panel (pin, browse).
- **Risk:** a free public service with no agreement carries the pilot's main screen. In pin mode a customer cannot place an order from the map at all.
- **Do:** write the options for the owner with cost: (a) keep it and add an uptime check plus a row in `provider-failures.md`; (b) self-host tiles for Palestine and Israel on the VM (an extract this small is a few hundred MB; check VM disk and memory first, the OSRM build peaked at 337 MB); (c) a second style URL the page falls back to once. Do not pick (b) or (c) without the owner.
- **Done:** the decision recorded, and at least the monitoring and the runbook row shipped.

### 4. Keep the car on the road

- **Known [source]:** the marker is drawn at the raw fix. `nearLine` and `fromDriver` already exist in `src/map-math.ts` and in the page.
- **Do:** when the fix is within about 40 m of the approach line, draw the marker at its projection on the line; further off, draw the raw fix (that is when the driver really left the route). Client-side only, no new OSRM calls. Keep the accuracy halo at the true accuracy.
- **Done:** a unit test on the projection, and on the phone the car no longer drifts through buildings on a straight street. Check it does not hide a real wrong turn.

### 5. Make the ETA honest with pilot data

- **Known [source]:** the range is a fixed formula, `×1.3 + 2`. Earlier work marks uncalibrated estimates as accuracy `unknown`. **[carried]** With gates that often close, a static ETA can be badly wrong.
- **Do:** from finished pilot orders, compare promised minutes with actual. This needs enough real trips; if there are too few, say so and stop. Do not invent a calibration.
- **Done:** a short report with the sample size, and a formula change only if the data supports one.

### 6. Label clutter around pins (small, from the 9 Nov design audit)

- **Known [carried]:** the pin chip repeats the base map's own city label, and the marker covers part of it. Fixing it needs a style change, so it pairs with any style trimming in item 2.
- **Done:** before and after screenshots on the phone in Arabic and English.

### 7. Map screenshots tell the wrong story

- **Known [carried]:** `npm run screens` captures map screens at full scroll height (3,000+ px), so framing looks wrong, and the seeded run has no OSRM, so no route lines appear.
- **Do:** capture map screens at one viewport, and give the screenshot run a stub route so lines draw.
- **Done:** `docs/screens/` shows maps as the phone does.

### Later, or the owner's call

- **Israel rollout:** the OSRM graph is West Bank only and the place index is built for Palestine. Both need rebuilding for the next phase. Plan it; do not start it.
- **Spoken alternative for map-only pin adjustment:** a blind user relies on search results today. Needs a design decision from the owner.
- **Far-pickup 1 km threshold:** calibrate against real fixes when there are some.
- **The Hebrew-letter probe:** a known ceiling, documented in the code.

## 5. Rules that have already cost time

- Change map behaviour in `public/map.html`. Mirror helper changes in `src/map-math.ts`.
- No new dependency for something a few lines can do. No provider switch.
- Never draw a straight line between stops. Never show an ETA or a line that outlived its calculation.
- Any new time-based test fixture needs a margin of at least 1 s; shorter ones flip under load on the test PC.
- After changing a baked `EXPO_PUBLIC_*` value, export with `--clear`. Metro does not key its cache on those, and a stale bundle once shipped weeks-old screen code to the phone while unit gates passed.
- Google paths are billed. Rerenders, refocuses and polls must never build a Google URL (`googlePreviewPath`, `googleApproachPath` in `src/map-provider.ts`).
- After any change to a sheet, a field or navigation, drive one full trip on the phone with both test apps (`ps.wind.app.testcustomer`, `ps.wind.app.testdriver`), with the keyboard open at the handover code. Both apps share one phone, so the backgrounded driver app stops sending location for a few seconds after a switch. That is not a bug.
- Before running any test, typecheck and lint: `npx tsc --noEmit` (and the server project via `npm run typecheck`), `npx expo lint`.
- Expo ships breaking changes each SDK. Read the versioned docs for the `expo` major in `package.json` before touching an Expo or React Native API (`AGENTS.md`).

## 6. How to report

For each change: **issue → what you changed → how you verified it**, with the command and its exit code, and what you did not verify. Say "local" or "test PC" or "phone" for every result. If a gate was not run, say so. When work goes up as a PR, the owner's rule is: push, open the PR, get it reviewed, fix every valid finding, then merge once required checks pass.

## 7. Where this handoff came from

Written on 10 November 2026 after a review session on the 2 Nov Uber study pack. That pack (`docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md` and the files it links, on `origin/backup/handoff-docs-full-20261103`) is a record of the 2 Nov tree. Several of its map findings are already fixed on master, for example the hardcoded 20 s ready deadline now reads `mapReadyMs()`. Use it for ideas and patterns, not for line numbers or bug lists.
