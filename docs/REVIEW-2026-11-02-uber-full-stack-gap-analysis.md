# Fastship vs Uber — Full-Stack Gap Analysis & Implementation Brief
**Date:** 2026-11-02 · **Mode:** read-only (no code changed) · **Audience:** the implementing agent (Opus 5.5)
**Companion docs:** `REVIEW-2026-11-02-map-ux-vs-uber.md` (map/UX detail) · `KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md` (100-item map inventory)

> **How this was built.** Five independent read-only studies of the fully-decompiled Uber rider APK (207 MB → 9,085 source dirs, complete `res/` design resources at `%LOCALAPPDATA%\Temp\opencode\uber\rea-full`), one per stack layer, then an independent GPT-6.1-Sol verification pass on every load-bearing claim. **Where Sol corrected a claim, the corrected version appears below and the correction is flagged.** Verdicts: **[C]** confirmed · **[P]** partial/conditional · **[needs device]** requires on-device confirmation.
>
> **Legal / safety.** Authorized competitive-architecture study. No Uber system was contacted; nothing was exfiltrated; the analysis ports *concepts, state names, field semantics, and layout slots only* — never decompiled Java, artwork, tiles, parameter values, or proprietary identifiers (`mapdisplay_flipr_*`, `tc2.uber.com`). See §9.

---

## 0. TL;DR for the implementing agent

Fastship's map architecture is **already strong** (provenance-locked geometry, tile-level readiness, honest stale handling, a real `JourneyEta` contract, generation-guarded provider fallback). **Do not rewrite it.** The work is surgical, in priority order:

1. **Correctness bugs** — one failing test (BUG-1), a stale-fade loss (BUG-3), an iOS pin-confirm hang whose "escape" is weaker than we thought (BUG-2).
2. **Accessibility at the map** — the only interactive controls sit inside `role="img"`; iOS map is unlabelled; no locate-me control; RTL arrow/FAB not mirrored.
3. **Map-functionality gaps vs Uber** — camera-intent model, padding-from-chrome, marker slots + z-order, alpha-divider (traveled vs remaining), epoch-stamped vehicle glide, pickup access points, per-stage layer recipes.
4. **Dead contracts** to wire up or delete.
5. **Cross-stack patterns worth porting** — the live+cached+default config wrapper (highest-leverage single idea), typed error envelope + correlation id, per-stage layer diffing.

**Two gates that must never regress** (run `tests/google-routing.test.mjs` + `tests/map.test.mjs` after every phase):
- **Licensing firewall** — `canShowOnRenderer` (`src/map-provider.ts:97-101`): Google geometry only on a Google renderer. [C]
- **Billing gate** — `shouldReroute` (`server/domain/google-routing.ts:117-130`, enforced `:323`). No change may fire a new `/route/google` call. [C]

---

## 1. Confirmed bugs (fix first)

### BUG-1 [C] — Android bridge drops a pre-style-load GPS center *(the failing test)*
- **Test:** `tests/google-map-lifecycle.test.mjs:183` — *currently failing* (`1 !== 0`). Reproduced by Sol.
- **Where:** `src/route-map.android.tsx:44-56`.
- **Mechanism (Sol-confirmed):** at `:47` the update effect early-returns while `state==='loading'`, **before** `expectedCenter.current` is assigned at `:50`. The center-report guard at `:78-80` therefore compares against a stale `expectedCenter` and lets a superseded viewport report as a fresh fix.
- **Fix:** assign `expectedCenter.current = center` **before** the `state==='loading'` early-return (track latest intent even while loading). Keep the existing re-apply behavior.
- **Acceptance:** `google-map-lifecycle.test.mjs:175-189` passes; no regression to the gesture-echo guard (`:190-203`).

### BUG-3 [C] — Stale-fade lost when the driver marker rebuilds
- **Where:** `src/route-map.tsx:230-235` (rebuild) + `:272-287` (stale effect).
- **Mechanism (Sol-confirmed):** the driver marker element is replaced when arrow state flips; opacity is applied at `:277` but the effect's deps `[map, props.stale, lineKey, moved]` (`:287`) **omit `driverKey`** — so a rebuild loses the `0.45` fade while the caption still says "last known".
- **Fix:** set opacity at marker creation (read `props.stale`) **or** add `driverKey` to the `:287` deps.
- **Scope:** web only. Native binds opacity at render (`route-map.native.tsx:132`); Android draws-then-fades (`public/map.html:142`).
- **Acceptance:** flipping `heading` on a stale driver keeps marker opacity `0.45`.

### BUG-2 [P → worse than reported] — iOS pin-confirm can hang; the "drag escape" does NOT clear the renderer
- **Where:** `src/route-map.native.tsx:188`, `src/google-map.native.tsx:121` (tolerance `0.000001`), consumed by `src/pin-sheet.tsx:36-37,62-63,76`.
- **Mechanism (Sol-corrected):** `onRegionChangeComplete` rejects a center differing from `pendingCenter` by `>0.000001`; MapKit refits the region to aspect ratio, so the completed center isn't bit-identical → `pendingCenter` never clears → Confirm stays disabled. **Sol correction:** a manual drag clears only the *sheet's* `cameraTarget` (`pin-sheet.tsx:65`), **not** the renderer's `pendingCenter` — both renderers merely forward `onPanDrag={onGesture}` (`route-map.native.tsx:185`, `google-map.native.tsx:118`). The drag "escape" is **incomplete**; a user who taps "use my location" then "Confirm" without dragging is stuck.
- **Fix (all three parts):**
  1. Loosen the tolerance from `0.000001` to ~`1e-4` (≈11 m) in both files.
  2. Always clear `pendingCenter` on `onRegionChangeComplete` regardless of match.
  3. Add a positioning deadline in `pin-sheet.tsx`: if `positioning` stays true > ~8 s, clear it and re-enable Confirm. Also null `pendingCenter` on `onPanDrag` so a user pan after a camera command isn't swallowed.
- **Acceptance:** test asserting Confirm enables after a non-identical region completion; manual gesture path still works. **[needs device]** MapKit refit magnitude is inferred, not measured (test device is Android).

### BUG-4 [P] — Android baseline map cold-start depends on server-served `map.html`
- **Where:** `src/route-map.android.tsx:17` (`PAGE = ${API_URL}/map.html`).
- **Mechanism:** the entire baseline page loads from the API; if it's down (or an old APK meets a server without the page), every Android baseline map falls to the diagram. Warm/cached loads are unaffected — this is **cold-start** fragility.
- **Sol nuance:** bundling `map.html` as `file://` is risky — MapLibre derives its worker URL from `import.meta.url` (empty for non-HTTP(S), see `public/vendor/maplibre-6.12.0/maplibre-gl.mjs:5`), which breaks the worker. **Prefer the version-path fix first.**
- **Fix:** serve `/map/v1/map.html` with `Cache-Control: public, max-age=604800, immutable` so the WebView cache survives an API outage. Update the `map.test.mjs:397-401` path/header assertion.

---

## 2. Accessibility (a11y) — highest-leverage cluster

Fastship's design system is disciplined (44 pt targets, documented 4.5:1 floor, RTL via `useCopy`). **The map is the exception.** These make the map "Uber-quality and accessible."

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| A11Y-1 | [C] | Recenter + Retry inside `role="img"` → hidden from screen readers (RN-Web maps image→presentational) | `route-map.tsx:308` (controls `:319`,`:321`); same at `google-map.web.tsx:197` | Move controls outside the `accessible` wrapper (siblings), or change wrapper to a labelled `group`/`application` role keeping controls focusable |
| A11Y-2 | [C] | iOS map region has no accessible name (web/Android publish one) | `route-map.native.tsx:79-80`; `google-map.native.tsx:69` | Add `accessibilityRole="image"` + the same `"<routeDiagram>: <pickup> → <dropoff>"` label to the iOS container |
| A11Y-3 | [C] | Android recenter lives inside the WebView DOM (TalkBack-unreachable) | `public/map.html` `#recenter` | Render an RN-level recenter `Pressable` on Android. **[needs device]** confirm TalkBack traversal |
| A11Y-4 | [C] | Hardcoded `→` in labels + recenter FAB `right:10` on every renderer, never RTL-mirrored | `route-map.tsx:309,373`, `route-map.native.tsx:139`, `google-map.native.tsx:131`, `public/map.html:17` | `rtl ? '←' : '→'`; mirror FAB `left`/`right` by `useCopy().rtl`. Arabic is first-class — screenshots confirm production RTL |
| A11Y-5 | [C] | Failure overlay double-announces route names (no `plain`) | `route-map.tsx:317-320`, `google-map.web.tsx:204-209`, `route-map.android.tsx:113-116` | Pass `plain` (or hide from AT) exactly like the loading placeholder |

**Cross-app a11y (from the 27-screen audit, `REVIEW-...-map-ux-vs-uber.md` §5b):** sub-44 pt targets on `HelpLinks`/driver-tracking/`RouteLine` drop-off; `★` as literal Unicode; missing `radiogroup` roles; a few two-primary-CTA screens; off-palette hardcoded colors. All mechanical, none architectural.

---

## 3. Dead contracts — wire up or delete (decide, don't leave lying)

| # | Item | Evidence | Decision |
|---|---|---|---|
| DEAD-1 [C] | `mapReadyTimeoutMs` declared, never read | `runtime-config.ts:4` only consumer-less; **10 hardcoded sites** (Sol-verified): `google-maps-loader.ts:22`, `google-map.web.tsx:113,240`, `google-map.native.tsx:57,107`, `route-map.tsx:71`, `route-map.native.tsx:68,175`, `route-map.android.tsx:41`, `public/map.html:89` | Wire all to `effectiveRuntime().values.mapReadyTimeoutMs`; thread into `map.html` via config. **Update test stubs** (`tests/google-map-lifecycle.test.mjs:76,98,254,265`) — the `runtime-config` stub lacks `values` |
| DEAD-2 [C] | `storeMapMode` unreachable | `map-mode.ts:27,51`; consumers take `[mode]` only; Google path reachable only via server config | Recommend **delete** the setter + storage key (a user toggle would enable the *paid* Google renderer with no budget story and let a stale `google` pref outlive a server downgrade — strengthens the billing gate). Update `google-map-lifecycle.test.mjs:284` + `map.test.mjs:326-327` |
| DEAD-3 [C] | `manual` ref write-only | `route-map.android.tsx:28,51,76` written, never read (real guard is `expectedCenter`/`reported`) | Delete |
| DEAD-4 [C] | `config.still` never sent; WebView can't see Android reduced-motion | `map.html:176` reads it; `route-map.android.tsx:109-110` never sends it | Send `useReducedMotion()` from RN into page config, or accept with a `shortcut:` comment |

---

## 4. Map functionality — the gap vs Uber (priority area)

Source: the 100-item map capability inventory (`KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md`) + design-token extraction. **Port shapes only.** Fastship map state today: `route-map.android.tsx` (MapLibre WebView), `route-map.native.tsx` (Apple/Google), `route-map.tsx` (web MapLibre), `google-map.web.tsx`; camera = a single `focus` boolean + follow/refit effects; ETA below map; driver-nearby ≤500 m; `sharedRun` suppresses approach/ETA.

### 4a. What Uber has that Fastship lacks (adopt — high value, courier-scale)

| Pri | Capability | Uber shape (source) | Fastship status | Adopt |
|---|---|---|---|---|
| **P1** | **Camera as data / intents** | `CameraUpdate` union (11 types, 300 ms default), `CameraUpdateFactory` validates | 4 divergent follow/refit implementations | One `cameraIntent()` returning `{bounds|center, zoom, offset, duration}` consumed by all 4 renderers; hoist `FOLLOW_OFFSET`/`FOLLOW_ZOOM` into one object |
| **P1** | **Padding from chrome** | `MapPaddingSource` + `MapPaddingManager`; chrome declares insets that flow into camera math | `route-map.tsx:172` constant `min(56, height/5)` | Derive padding from `onLayout` of content below the map so overlays never cover markers |
| **P1** | **Marker slots + z-order** | `base_map_marker_content_{leading_custom_view, leading_icon, title, subtitle, trailing_icon}` slots; explicit z-index scale (arc_shadow 0, alt_route 1, my_location 4, forward_dispatch 7, vehicle 9, arc 10, walking 11, high_priority 1000) | z-order is insertion order; markers drawn ad hoc | One `<StopMarker kind title subtitle>` component; declared z-order `driver > stop > checkpoint` |
| **P1** | **Alpha-divider (traveled vs remaining)** | `PolylineV2Update{alphaDividerPosition, pre/postDividerAlpha}` — first-class, animates | single solid route polyline | Render traveled portion dimmed vs remaining, advancing with the driver fix |
| **P1** | **Epoch-stamped vehicle glide** | `VehiclePathPoint{lat,lng,course,epoch,speed}`; wall-clock slerp + heading snap + injectable clock | `glider()` (`map-math.ts:53-66`) — position pings | Time-stamped path + slerp; heading leads, position glides; injectable clock for tests |
| **P1** | **Per-stage layer recipes** | `MapConfiguration = {List<MapLayerBuilder>, CameraManagerWorker}`; layers die with their screen | map mounts/unmounts components per state | Declarative `<MapLayer id when>` registry diffed by key (mirror `MapHubRouter` diff, not its classes) |
| **P2** | **Pickup access points + wayfinding** | `access_point_selection_view`, `wayfinding_walking_eta`, `NearestRoadOptions` (pin-to-road snap w/ road-class/closure exclusions) | none | Pin-to-road snapping; access-point picker when a venue has multiple entrances |
| **P2** | **Locate-me control + user puck** | `CenterMePlugin` + `Puck` (circle+arrow, bearing, animated) | no locate button on route maps (only pin sheet `showsUserLocation`) | Persistent recenter/locate FAB (44 dp, `accessibilityLabel`, RTL-mirrored) + user puck |
| **P2** | **Bucketed ETA display** | one-minute/threshold strings in one place | `etaRange()` inline | Centralize ETA range formatting; show "estimate unavailable" when `expiresAt` passes instead of dropping the row |
| **P2** | **Semantic zoom ladder** | WORLD→ANTS, `ZoomClamp`, framing presets MAXIMIZED/COMFORTABLE/WIDE | ad-hoc `maxZoom:16`, `FOLLOW_ZOOM` | Named zoom levels + a clamp |
| **P3** | **Gesture set in one place** | `MapInteractionSettings{pan,zoom,rotate,tilt}` + dead zones + all-off mode | gestures inline per renderer; rotation/pitch disabled deliberately | Extract `mapGestureOptions({picker})`; keep rotation/pitch off (record as decision) |
| **P3** | **Zoom-range visibility on annotations** | `MarkerOptions.minZoom/maxZoom` | none | Optional; defer |
| **P3** | **Don't rebuild map when pins become exact** | — (map keyed on raw coords) | `route-map.tsx:157`, `route-map.android.tsx:94`, `route-map.native.tsx:25` | Animate camera instead of tearing down + restarting the 20-25 s readiness timer |

### 4b. Skip (Uber-scale payoff only)
Own GL tile engine (MapLibre already is one); runtime two-engine fallback w/ `didFallback` telemetry (build-time table suffices); full quadtree collision solver (fixed zIndex + display priority + simple overlap check covers ≤3 pins/order); 3-D GLTF car models; street view/satellite; whole server map-layer documents (take only the settings/gesture slice); AV substates / ePUDO; marker clustering; keyframe camera timelines (duration+easing covers 95%); waypoint ads/venues.

---

## 5. Backend & API architecture — adopt vs skip

Source: backend study (Retrofit+gRPC dual transport, Gson codegen, Ramen realtime). Fastship today: one Node 24 HTTP server, regex `/api/...` route table, `fail(status, code)` + `HttpError`, opaque 32-byte session token, authenticated long-poll + snapshot realtime, VAPID Web Push.

| Concept | Verdict |
|---|---|
| Named-call dictionary `/api/<domain>/<verb>` (verbs-not-resources, flat, greppable) | **Adopt the discipline** — Fastship's table is already close |
| Per-endpoint typed error unions + generic envelope (`code`, `status`, typed `subError`) | **Adopt (cheap)** — a shared envelope for the handful of endpoints needing machine-readable branches (dispatcher rejections, destination change, offer expiry). No codegen at this scale |
| Errors-as-values + a correlation id on every request (`x-uber-call-uuid` style) | **Adopt** — ~10 lines in `server/main.ts` |
| Unified client over both transports / grpcfit | **Skip** — one transport, no protobuf; `domain/realtime.ts` already sits behind an interface |
| "Every payload that can change is also emitted on the realtime channel" (PushModel-twin *shape*) | **Adopt the shape** — commands push the same serialized shape the GET returns; skip gRPC streaming |
| Server-driven UI / parameter registry | **Skip for now** — Uber-scale machinery; Fastship settings live in DB rows |
| Client KV store per feature + last-known-good snapshot + TTL | **Adopt on mobile** (see §6); server unchanged |
| Per-error retry-policy tables | **Partial-skip** — `fail()` codes already imply retryability; document idempotent verbs instead |

---

## 6. Data & persistence — adopt vs skip

Source: DB study (feature-scoped typed KV stores, **live+cached+default dual parameter framework**). Fastship today: Postgres server + `expo-secure-store` + `localStorage` client.

**ADOPT:**
1. **Live + cached + default config wrapper (the single most valuable port).** For every server-driven knob (pricing tiers, ETA weights, feature flags, map style URL, fare-estimate TTL): a live server value + a long-TTL cached last-known-good in `localStorage` (overwritten on each successful fetch) + a hardcoded default for first launch. App always renders last-known-good offline; server changes behavior without an app-store release. **A ~30-line helper, not a config-service SDK.**
2. **Feature-scoped typed stores** (not a god-blob): `savedPlacesStore`, `sessionStore`, `tripStore`, `homeLayoutStore`, each its own namespace + lifetime. `expo-secure-store` for sensitive (token/session), `localStorage` for the rest — **don't put volume data in secure-store** (iOS keychain cap).
3. **SDUI home-layout cache** — cache the home layout as typed JSON (zod + a typed `localStorage` slot); render from cache on cold-launch, hydrate async.
4. **Multi-account scoping** — key persisted entries by `userUuid` so a switched account never sees another's data. Cheap now, painful later.
5. **One offline analytics queue** (AsyncStorage / append-only JSONL, drained on reconnect). Product data stays in Postgres.

**SKIP:** client SQLite/Room/SQLDelight for product data (Uber doesn't; Postgres is the relational store); reimplementing the map disk cache (use the renderer's built-in tile cache); the deprecated KV layer; the FileProvider/`allowBackup` machinery (handled by the RN stack); the full typed parameter taxonomy (adopt the *shape*, not 200+ parameter types).

---

## 7. Design system & frontend architecture — adopt vs skip

Source: design study (token extraction) + frontend study (RIBs, plugin points, 14,516 parameters).

**Design tokens (concrete, extracted from Uber `res/`):** base spacing unit **8 dp** (`ui__spacing_unit_1x`), full `Nx` scale 0.125x–16x; `ub__ui_core_v3_*` 10-step color ramps; brand semantic theme attrs w/ day/night; `ui__elevation_{low,medium,high}` (4/8/16); `foundation_ui__text_size_*` 12-step scale w/ paired line-heights; `ub__map_fab_size` **44 dp**.

**ADOPT into `src/ui.tsx`:**
- **Derived spacing scale (8 dp base)** — `const space = {0:0, .5:4, 1:8, 1.5:12, 2:16, 3:24, 4:32, 6:48, 8:64}`; replace literal dp. Highest-leverage, cheap.
- **3-tier elevation** `{low, medium, high}` (replace the single `shadow`).
- **`Sheet` primitive** (handle + peek + dismiss); migrate `pin-sheet.tsx`.
- **Semantic `theme` object** (`{primary, primaryText, surface, surfaceMuted, border, borderSubtle, danger, dangerText}`) so `Button`/`Card` read from it; **skip day/night** (daylight-only app).
- **`mapInk` token block** `{stop, dropoff, driver, route, approach, halo, haloStale, closed, staleOpacity, fallbackBg}` consumed by all renderers — kills the 3-way duplicated marker colors + off-palette `#E6ECE3`/`#C62828`/native hex literals.
- **Map-marker slot contract** `<MapMarker leadingIcon? title? subtitle? trailingIcon?>`; marker sizes derive from `space`.

**Frontend architecture:**
- **ADOPT:** parameter/flag registry as control plane (`useFlag('checkout_v2')`); plugin-point *thinking* for map layers (declarative diff-by-key); lifecycle-scoped subscriptions (already idiomatic); flow state machines (`useFlow(step)`) instead of ad-hoc `router.push` chains.
- **SKIP:** RIBs (2,947 Router classes — Java solving a problem React composition doesn't have); Dagger scope graphs; RxJava; the ScreenStack view layer (React Navigation owns it); generated-model machinery (zod covers it).

---

## 8. Cross-cutting: the ETA correction (read this — it changes phase 8)

**Sol verdict: the "missing ETA opt-in" claim is WRONG.** The shared API client auto-appends `journeyProtocol=1` for `/route` paths at `src/api.ts:24-25` (`/^\/(?:orders|jobs|offers|route|price|admin\/orders)/`). Although `roadPath()` (`map-math.ts:108-110`) omits the parameter, the client adds it — **the order screen IS requesting the `JourneyEta` contract.** The contract exists (`journey-contracts.ts:2`) and `road.tsx:82,88` prefers it, falling back to `etaRange()` (`map-math.ts:98`) only when the server doesn't populate `eta`.

**⇒ The real ETA work is server-side population**, not a client opt-in: extend the OSRM route handling to compute the band `{min=raw, max=raw+max(spread,10%·raw), accuracy from spread/raw}`, add `'road_leg'` to `basis`, and surface `accuracy` + `expiresAt` in the UI ("estimate unavailable" when expired instead of silently dropping the row). **Do not** "add the opt-in" — it's already there.

---

## 9. Legal / licensing guardrails (do not violate)

1. **Port shapes only.** Enum names, field semantics, state machines, layout slots — fine. Decompiled Java, Uber artwork, wordmark, proprietary pin shapes, drawables, Lottie, style documents, parameter values — **never**.
2. **Google geometry stays renderer-locked** (`canShowOnRenderer`, `map-provider.ts:97-101`, enforced at the data layer `road.tsx:43,72,80`). License-required and tested. [C]
3. **Google billing gate stays** (`shouldReroute`, `google-routing.ts:117-130`). [C]
4. **Provenance hygiene.** Don't name Uber's internal identifiers (`mapdisplay_flipr_*`, `mmdf_*`, `tc2.uber.com`) in Fastship code or commits.
5. **Safe to adopt (open source):** H3 (Apache-2.0), Mapbox geometry (`geojsonvt`/`Earcut`).

---

## 10. Implementation order (mechanical, lowest-risk-first)

1. **BUG-1** — move `expectedCenter.current = center` before the loading early-return; re-run `npm test`. *(fixes the failing test)*
2. **BUG-3** — add `driverKey` to the stale-effect deps (or set opacity at creation); 1 test.
3. **A11Y-1 + A11Y-2** — recenter/Retry out of `role=img`; iOS map label.
4. **BUG-2** — tolerance `1e-4` + always-clear `pendingCenter` + 8 s positioning deadline + null `pendingCenter` on `onPanDrag`; update pin tests.
5. **DEAD-1** — wire `mapReadyTimeoutMs` through all 10 sites + `map.html`; **update the test stubs** (they lack `values`).
6. **DS tokens** — `mapInk` + `space` + elevation + palette tokens (`#E6ECE3`→`mapGround`, native hex→palette, unify no-entry red). No behavior change.
7. **A11Y-4** — RTL arrow + FAB mirror.
8. **P1 camera-intent model + padding-from-chrome** — the one medium refactor; do after the above are green.
9. **P1 alpha-divider + vehicle-glide timestamps** — map polish.
10. **P1 marker slots + z-order**, **P1 per-stage layer registry**.
11. **§8 server ETA population** + **P2 pickup sub-states / access points / locate-me**.
12. **DEAD-2** (`storeMapMode` decision — recommend delete) + **BUG-4** (`/map/v1/map.html` version path).

**Verification after each step:** `npm test`, `npm run typecheck`, `expo lint`, and re-run on the SM-A5360 (`adb reverse`, **never an emulator**). Phases 4 (pin) and 5 (iOS label/readiness) are **HARDWARE (iOS)** — no iOS device here.

### Test evidence — reproduced on K5 (remote) and locally
Per the project rule, tests ran on the **K5 PC over SSH** (host `DESKTOP-NE681OS`, Windows 10, Node **v24.12.0**, deps via `npm ci` from `package-lock.json`). The three map/gate suites match local results exactly:

| Suite | K5 | Local | Note |
|---|---|---|---|
| `tests/google-routing.test.mjs` | ✅ PASS | ✅ PASS | **billing gate intact** |
| `tests/map.test.mjs` | ✅ PASS | ✅ PASS | map logic + licensing firewall |
| `tests/google-map-lifecycle.test.mjs` | ❌ FAIL `:183` | ❌ FAIL `:183` | **BUG-1** — *"initial city camera cannot overwrite GPS arriving before style load"* (`1 !== 0`), identical on both |

Full-suite note: `scripts/run-tests.mjs` runs 95 files and stops at the first failure; some later suites (e.g. `subscription-migration`, `db-persistence`) require a **live PostgreSQL** (`WIND_TEST_DATABASE_URL`), which K5 does not have — so the three gate suites were run directly. They are the ones this report's phases touch.

---

## 11. What I did NOT check (honesty)
- No TalkBack/VoiceOver traversal of the Android WebView (A11Y-3) — **[needs device]**.
- iOS behavior (BUG-2, A11Y-2, readiness) is code-read; the test device is Android. The `0.000001`-vs-MapKit-refit magnitude is inferred, not measured.
- react-native-maps 1.27.2 Apple tiles-drawn: a config plugin is an *implementation choice*, not a proven necessity (Sol) — rendering completion is swallowed by `AIRMapManager.m`, so a native change is needed for that signal *if* we want it.
- Obfuscated Uber internals (route-line presenters, `com.uber.map_hub.*` camera workers, `AccessPointGroup` proto body) didn't survive decompilation; flagged as such, not inferred.
- REA decompile (`jadx -d rea-full --deobf`) hit its 30-min shell timeout but had already emitted the complete 9,085-dir tree + full `res/` resources used by all studies.
