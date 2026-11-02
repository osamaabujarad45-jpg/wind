# Fastship Map & UX Review vs Uber — Implementation Brief
**Date:** 2026-11-02 · **Mode:** read-only · **Audience:** the implementing agent
**Evidence base:** full code read of the map layer + design system, `npm test` (1 failing test), 4 live screenshots on SM-A5360, Uber reference docs (`docs/KNOWLEDGE-2026-11-01-uber-*`), decompiled Uber source (`%LOCALAPPDATA%\Temp\opencode\uber\jadx-out2`), and 4 independent sub-agent reviews (MiniMax map audit, DeepSeek Uber-ref, explore Uber-source dive, GPT-6.1-Sol verifier).

> **Verification discipline.** Every load-bearing claim below was cross-checked by an independent verifier agent. Where the verifier corrected an earlier claim, the corrected version is what appears. Verdicts: **[C]** confirmed · **[P]** partial/conditional · **[needs device]** requires on-device confirmation.

---

## 0. TL;DR for the implementing agent

The map architecture is **already strong** — provenance-locked geometry, tile-level readiness, honest stale handling, a real `JourneyEta` contract, generation-guarded provider fallback. Do **not** rewrite it. The work is a set of **surgical fixes** in three clusters:

1. **A11y is broken exactly at the map's only interactive control** (recenter) and the iOS map has no label.
2. **A handful of correctness bugs** — one failing test, a conditional pin-confirm hang, a stale-fade loss, an `expectedCenter` ordering race.
3. **Dead contracts** to either wire up or delete (`mapReadyTimeoutMs`, `storeMapMode`, `manual` ref, `config.still`).

**Single most important map fix:** the unbounded pin-positioning wait — `pin-sheet.tsx:62–76` + the native completion guards (`route-map.native.tsx:188`, `google-map.native.tsx:121`).
**Single most important UX/a11y fix:** move interactive controls out of the `role="img"` wrapper — `route-map.tsx:308`, `google-map.web.tsx:197`.

---

## 1. Confirmed bugs (fix these first)

### BUG-1 [C] — Android bridge drops a pre-style-load GPS center *(the failing test)*
- **Test:** `tests/google-map-lifecycle.test.mjs:183` — *"initial city camera cannot overwrite GPS arriving before style load"* — **currently failing** (`1 !== 0`).
- **Where:** `src/route-map.android.tsx:44–56` (update effect) + `:77–81` (center-report guard).
- **Mechanism (verifier-corrected):** the update effect short-circuits while `state === 'loading'` (`:47`), and it depends on `[state, json]` (`:56`), so when the page reaches `'drawing'` the latest update **is** re-applied. The actual race is **ordering**: `expectedCenter.current` is assigned at `:50` *inside* the same effect that also injects the JS. A stale `{type:'center'}` report arriving **before** this effect re-runs passes the guard at `:80` because `expectedCenter` is still the old value, so a superseded viewport is reported as a fresh fix.
- **Minimal fix:** assign `expectedCenter.current = center` **before** the `state === 'loading'` early-return (i.e. track the latest intended center even while loading), so the guard at `:80` always compares against the newest intent. Keep the existing re-apply behavior.
- **Acceptance:** `tests/google-map-lifecycle.test.mjs:175–189` passes; no regression to `:190–203` (gesture echo guard).
- **Risk:** none to licensing/billing; this is bridge plumbing only.

### BUG-2 [P] — iOS pin-confirm can hang (conditional)
- **Where:** `src/route-map.native.tsx:188`, `src/google-map.native.tsx:121`, consumed by `src/pin-sheet.tsx:36–37,62–63,76`.
- **Mechanism:** `ApplePin.onRegionChangeComplete` rejects any reported center differing from `pendingCenter` by `> 0.000001` (`:188`). But `animateToRegion({...center, latitudeDelta:0.01}, 0)` (`:166`) lets MapKit refit the region to the view aspect ratio, so the completed center is **not bit-identical** to `center`. On mismatch `pendingCenter` is never cleared and `onChange` never fires → `pin-sheet.tsx:63` keeps `positioning=true` → Confirm stays disabled (`:76`).
- **Verifier nuance:** a manual drag clears `positioning` (`pin-sheet.tsx:65`), so it is not *literally* unrecoverable, but a user who only taps "use my location" then "Confirm" — never dragging — is stuck with no deadline and no hint.
- **Minimal fix (two parts, do both):**
  1. Loosen the tolerance in `route-map.native.tsx:188` and `google-map.native.tsx:121` from `0.000001` to ~`1e-4` (≈11 m), **and** always clear `pendingCenter` on `onRegionChangeComplete` regardless of match.
  2. Add a positioning deadline in `pin-sheet.tsx`: if `positioning` stays true for > ~8 s, clear it and re-enable Confirm (a map that confirmed its camera is "ready enough").
- **Acceptance:** new/updated test in `tests/google-map-lifecycle.test.mjs` (the `:205+` pin block) asserting confirm enables after a non-identical region completion; manual gesture path still works.

### BUG-3 [C] — Stale-fade lost when the driver marker rebuilds
- **Where:** `src/route-map.tsx:230–235` (marker rebuild) + `:272–287` (stale effect).
- **Mechanism:** the driver marker element is **replaced** when arrow presence flips (`:230`), and `driverIcon()` sets no opacity. The stale-opacity write is at `:277`, but the effect's deps `[map, props.stale, lineKey, moved]` (`:287`) **omit `driverKey`**. When a stale fix's device starts/stops reporting heading, the arrow flips, the marker rebuilds at full opacity, and nothing re-applies the fade — the app shows a **bright blue car at full opacity while its own caption says "last known"**.
- **Minimal fix:** set opacity at marker creation (`:232`, read `props.stale`) **or** add `driverKey` to the `:287` deps.
- **Acceptance:** a test flipping `heading` on a stale driver asserts the marker element opacity stays `0.45`.
- **Note:** native is safe (`route-map.native.tsx:132` opacity is a render prop); Android page is safe by ordering (`public/map.html` draws then fades). Only web is affected.

### BUG-4 [C] — Android baseline map depends on server-served `map.html`
- **Where:** `src/route-map.android.tsx:17` (`PAGE = ${API_URL}/map.html`), `:58` load, `:67` error→fail, `:113–118` fail→diagram.
- **Mechanism:** the Android baseline renderer loads its entire map page from the Wind API. If the API is down (or an old APK meets a server without the page), **every Android baseline map falls to the diagram** even though tiles come from OpenFreeMap and routing is separate.
- **Verifier nuance:** an *already-loaded* map or cached assets aren't broken by a later outage; this is a **cold-start** fragility.
- **Fix options (pick one, recommend A):**
  - **A. Bundle `map.html` as an asset** (`expo-asset` → `WebView source={{ uri: asset.localUri }}` or inline `source={{ html }}` with the vendored MapLibre inlined). Removes the API dependency entirely.
  - **B. Version the path** (`/map.v2.html`) so deploys don't break installed APKs, and keep a stale-while-revalidate cache.
- **Acceptance:** Android baseline map renders with the API unreachable (airplane-mode-after-launch test or a stubbed `API_URL`).

---

## 2. Accessibility (a11y) — the highest-leverage cluster

Fastship's design system is disciplined (documented 4.5:1 floor, 44 pt targets, RTL via `useCopy`). The **map is the exception**. These are the fixes that make the map "Uber-quality and accessible" as required.

### A11Y-1 [C] — The map's only interactive control is inside `role="img"`
- **Where:** `src/route-map.tsx:308` (wrapper `accessible accessibilityRole="image"`) wraps the **recenter** button (`:321`) **and** the **Retry** button (`:319`). Same pattern at `src/google-map.web.tsx:197` (wraps `:206`,`:210`).
- **Why it matters:** RN-Web maps `image` → `img` role (`react-native-web/.../propsToAriaRole.js:14`); `role="img"` makes the subtree presentational, so the **only** interactive control on the web map is hidden from screen readers.
- **Fix:** move the recenter and Retry controls **outside** the `accessible` wrapper (siblings, not children), or change the wrapper to a labelled `group`/`application` role and keep controls focusable. The loading placeholder already does this correctly (`route-map.tsx:312–315` marks it `plain` + `aria-hidden`).
- **Acceptance:** web map's recenter button is reachable by keyboard Tab and announced by a screen reader.

### A11Y-2 [C] — iOS map region has no accessible name
- **Where:** `src/route-map.native.tsx:79–80` (bare `<View>` + `<MapView>`, no `accessibilityLabel`); `src/google-map.native.tsx:69`.
- **Contrast:** web (`route-map.tsx:309`) and Android (`route-map.android.tsx:118`) both publish `"<routeDiagram>: <pickup> → <dropoff>"`. iOS VoiceOver users get an unlabelled map.
- **Fix:** add `accessibilityRole="image"` + the same `accessibilityLabel` (with the RTL arrow fix below) to the iOS route map's container View.

### A11Y-3 [C] — Android recenter lives inside the WebView DOM (TalkBack-unreachable)
- **Where:** `public/map.html` `<button id="recenter">`; no RN equivalent in `route-map.android.tsx`.
- **Fix:** render an RN-level recenter `Pressable` on Android mirroring the other platforms, and remove reliance on the in-page DOM button. **[needs device]** confirm TalkBack traversal of the WebView.

### A11Y-4 [C] — RTL: hardcoded `→` and a never-mirrored FAB
- **Where:** map a11y label uses `→` (`route-map.tsx:309`, `google-map.web.tsx:198`, `route-map.android.tsx:118`); recenter FAB is `right: 10` on every renderer (`route-map.tsx:373`, `route-map.native.tsx:139`, `google-map.native.tsx:131`, `public/map.html:17`).
- **Fix:** use `rtl ? '←' : '→'` in the label (the diagram already does this at `route-preview.tsx:37`) and mirror the FAB (`left`/`right` by `useCopy().rtl`). Arabic is a first-class language (`ui.tsx:53`). **The screenshots confirm the app runs RTL in production — this is visible.**

### A11Y-5 [C] — Failure overlay double-announces route names
- **Where:** failure overlay renders `<RoutePreview {...props}/>` **without** `plain` at `route-map.tsx:317–320`, `google-map.web.tsx:204–209`, `route-map.android.tsx:113–116`, inside a container that already has the same names in its label.
- **Fix:** pass `plain` (or hide from AT) on the failure overlay exactly like the loading placeholder.

---

## 3. Dead contracts — wire up or delete (decide, don't leave lying)

### DEAD-1 [P] — `mapReadyTimeoutMs` declared but never read
- `src/runtime-config.ts:4` declares it (`default 20000, min 5000, max 30000, owner 'maps'`). **No renderer reads it.** Verifier count: **eight** hardcoded timeout sites — `route-map.tsx:71` (25s), `route-map.android.tsx:41` (25s), `route-map.native.tsx:68` & `:175` (20s), `google-map.native.tsx:57` & `:107` (25s), `google-map.web.tsx:113` & `:240` (25s); plus `public/map.html:89` (20s) and `google-maps-loader.ts:22` (25s).
- **Fix:** replace all with `effectiveRuntime().values.mapReadyTimeoutMs` (thread it into `map.html` via config). One evening; makes the existing kill-knob real and unifies the 20s/25s split.

### DEAD-2 [C] — `storeMapMode` unreachable
- `src/map-mode.ts:27,51`. All consumers (`book.tsx:129`, `road.tsx:38`, `map-provider-boundary.tsx:16`) take only `[mode]`; no UI writes it. The whole Google renderer path (~450 lines) is reachable **only** via server config (`runtime-readiness.ts:36`).
- **Decision required:** either (a) build a settings toggle that calls `storeMapMode`, or (b) delete the setter + the `map-mode` storage key and simplify to server-config-only. The file header currently documents a user-preference model that is fiction. (It *is* exercised by `tests/google-map-lifecycle.test.mjs:284`, so update that test if you remove it.)

### DEAD-3 [C] — `manual` ref is write-only
- `src/route-map.android.tsx:28` declared, written at `:51`,`:76`, **never read**. The real echo guard is `expectedCenter`/`reported` (`:78–81`). Delete it.

### DEAD-4 [C] — `config.still` never sent / WebView can't see Android reduced-motion
- `public/map.html:176` reads `config.still`, but `route-map.android.tsx:109–110` never sends it, and a WebView cannot observe Android's "remove animations". So reduced-motion is unavailable on the Android baseline map (iOS honors it via `useReducedMotion`, web via inline `matchMedia`).
- **Fix:** either send a `still` flag from RN (`useReducedMotion()` in `route-map.android.tsx`) into the page config, or accept the limitation with a `shortcut:` comment.

---

## 4. Uber-parity enhancements (port shapes, never code)

Grounded in the DeepSeek Uber-ref and the explore source-dive. **Legal:** port state names/field semantics/layout slots only — never decompiled Java, never Uber artwork/tiles/parameter values (see §6).

| Pri | Enhancement | Where | What to do | Evidence |
|---|---|---|---|---|
| P1 | **Marker content slots + declared z-order** | `route-map.tsx:122–141`, native markers | One `<StopMarker kind title>` component with icon/title/subtitle slots; explicit z-order `driver > stop > checkpoint`. Today z-order is insertion order; pickup/dropoff/checkpoint/driver can overlap nondeterministically. | Uber MDD §6 two marker systems + `addViewWithPriority` |
| P1 | **Camera rule as data** | new `cameraRule()` consumed by all renderers | One function returning `{bounds, offset, zoom}` for `fit-route / follow-driver / inspect-pickup / user-controlled`; replaces 3 divergent follow/refit implementations (`route-map.tsx:244–306`, `google-map.web.tsx:118–127`, `route-map.native.tsx:53–58`). Hoist `FOLLOW_OFFSET=[0,-60]` (inline in 3 sites) into one camera object. | Uber MDD §5–6 Camera Director + offset-as-state |
| P1 | **Derive map padding from real chrome** | `route-map.tsx:172` | Replace `min(56, height/5)` constant with `onLayout` of the content below the map, so overlays never cover markers. | Uber MDD §6 Padding Provider |
| P1 | **Narrow the ETA fallback** | `road.tsx:88`, server | `JourneyEta` contract already exists (`journey-contracts.ts:2–4`) and `road.tsx:82,88` prefers it; the view-layer `etaRange()` (`map-math.ts:98`) is **only** a fallback when `eta` is absent. **Do not** "build a contract" (verifier corrected this). Instead: expand server-side population of `JourneyEta` so the formula path shrinks, and surface `accuracy` + `expiresAt` in the UI ("estimate unavailable" when expired, instead of silently dropping the row — see the driver screenshot's freshness line for the pattern to copy). | Verifier #7; `journey-contracts.ts`; Uber RCR §4 |
| P2 | **Pickup sub-states** | `order/[id].tsx`, model | Add `arrived_waiting / arrived_leaving_soon / arrived_paused` derived from `arrivedAt` + `waitingEndsAt` + existing `safetyHold`. Fastship already has the clock and the suspend flag but no state to express their combination. | Uber RCR §1.3 (`ARRIVED_*` enums) |
| P2 | **Current-location button + user puck on route maps** | all renderers | No locate-me control exists on any route map (only the pin sheet has `showsUserLocation`, `route-map.native.tsx:184`). Add a persistent locate button and the user puck. | Uber MDD §6; gap confirmed in code |
| P2 | **Unify native readiness to tiles-drawn** | `route-map.native.tsx:68,81` | Apple map uses `onMapReady` (map object constructed) with the failure timer cleared on ready — a blank-but-"ready" Apple map never falls back. Switch to a tiles-drawn signal (or keep the timer armed until first tile). Aligns with the other 3 renderers which all require a painted tile. | MiniMax A10 |
| P3 | **Gesture config in one place** | `route-map.tsx:82–84` | Extract `mapGestureOptions({picker})` so web/Google/Android stop drifting. Keep rotation/pitch disabled (deliberate — record as a decision). | Uber MDD §12 UiSettings |
| P3 | **Stop rebuilding the map when pins become exact** | `route-map.tsx:157`, `route-map.android.tsx:94`, `route-map.native.tsx:25` | The map is keyed on raw coords; when an order loads and pickup flips from city-centroid to exact address, the whole map tears down + the 20–25s readiness timer restarts mid-trip. Animate the camera instead. | MiniMax A9 |

### Explicitly skip (Uber scale you don't need)
Dual map-provider fallback chain + telemetry; `CameraTimeline` keyframes; `UnifiedMapLayerManager`/collision/`Avoidable` machinery; native H3 (Uber uses it only as a res-8 geohash key — adopt server-side only, later, when zone counts justify); marker clustering (≤3 pins/order); server-driven stage→map binding (`/rt/riders/map-change`) until stages exceed 3; Lottie.

---

## 5. Design-system findings

Fastship already has a real system — `palette` (~22 semantic tokens, `faint` documented as the 4.5:1 floor), one `shadow` token, `size = {control:46, small:36, row:52, radius:16, gutter:16}`, a `Txt` ramp, RTL via `useCopy().row/align`, `maxFontSizeMultiplier=1.35`. The screenshots (sign-in, booking, place-search sheet, driver active-order) confirm a clean, consistent, production RTL UI.

**The gap is that the map has no design-vocabulary layer of its own** (Uber has `mapsudl`, a separate map design language). Map ink is inline literals scattered across renderers: stale opacity `0.45`, dot `18px`, driver `38px`, plus off-palette hex.

| Fix | Where | Detail |
|---|---|---|
| **DS-1** Create `mapInk` token block | new, next to `palette` | `{ stop, dropoff, driver, route, approach, halo, haloStale, closed, staleOpacity, fallbackBg }`; consumed by all renderers. Kills the 3-way duplicated marker colors. |
| **DS-2** Off-palette fallback bg `#E6ECE3` ×6 | `route-map.tsx:376`, `route-map.android.tsx:138`, `route-map.native.tsx:178`, `google-map.native.tsx:110`, `map-provider-boundary.tsx:41`, `public/map.html:13` | Add a `palette` token; reference it. |
| **DS-3** Native marker hex literals | `route-map.native.tsx:84–85` `#34765A`/`#CB6845`, `google-map.native.tsx:74–75` | → `palette.olive`/`palette.clay` (already imported). |
| **DS-4** Closed-checkpoint red differs | `route-map.tsx:130`/`route-map.native.tsx:87` use `palette.error` `#A3392A`; `public/map.html:159` hardcodes `#C62828` | One error red. |
| **DS-5** Marker vocabulary inconsistent across providers | web = circle pickup + square dropoff; native = teardrop/teardrop | Unify (custom SVG markers on native) so pickup vs dropoff reads by shape+color everywhere. |

### §5b. Full-app design audit (GLM-5.2 agent — all 27 screens + shared files)

No CRITICAL. Calibrated against the app's own system (44pt target `ui.tsx:44-46`, `palette`, `Txt` variants, `Screen` safe-area, one-primary-CTA). **HIGH/MEDIUM findings:**

| Sev | Finding | Location |
|---|---|---|
| HIGH | `HelpLinks` caption links `paddingVertical:8` only, no `hitSlop` → ~33px target, under 44pt. On auth/help/account. | `parts.tsx:436, 357-370` |
| HIGH | Ratings as literal `★` Unicode (TalkBack reads "black star", inconsistent with `IconStar`) | `parts.tsx:403`, `order/[id].tsx:263, 356` |
| HIGH | book service switcher `Row` of radios with no `radiogroup` role (unlike `Choices`) | `book.tsx:439-448` |
| HIGH | Receipt line labels fixed `width:104` — Arabic labels clip/wrap, misaligning values | `receipt/[id].tsx:59` |
| MED | Two primary CTAs on help (`Support` + `Privacy`) — make Privacy `soft`/`ghost` | `help.tsx:34, 63` |
| MED | Two primary CTAs on profile (`Save` + `EmailCard` confirm) | `profile.tsx:69, 114` |
| MED | Driver active-location `Press` `paddingVertical:8`, ~33px target, no `hitSlop` — it's the tracking re-enable toggle | `driver/index.tsx:158-165` |
| MED | `RouteLine` drop-off stop `Press` ~36px (no `minHeight`) | `parts.tsx:65-90` |
| MED | Promo caption hardcoded `rgba(255,255,255,0.78)` not a token | `(customer)/index.tsx:104` |
| MED | admin/users card can show two primaries (approve + save) | `admin/users.tsx:107, 122` |
| MED | earnings `CashCard`: multiple pending entries each get a primary — only latest should | `driver/earnings.tsx:64` |
| MED | admin/settings success message grey not olive (inconsistent) | `admin/settings.tsx:62` |

**LOW (token/consistency):** modal scrim `#0E1F1966` → shared token (`pin-sheet.tsx:84`, `book.tsx:719`); `route-preview.tsx:56` `#E6ECE3` → palette (matches DS-2); `welcome.tsx:47,123` inline fontSize/boxShadow → `Txt` variant + `shadow` token; `driver/index.tsx:159` `rgba(211,242,122,0.14)` → token; auth language pill `minHeight:36`→44 (`auth.tsx:163`); `FilterChips` `Rail` add `radiogroup` role (`ui.tsx:324-335`); `Badge` combined `accessibilityLabel` (`ui.tsx:401-409`); book dead `searchBox`/`searchInput` styles + hardcoded `₪` (`book.tsx:244, 722-723`); TabBar badge `right:6` not RTL-mirrored (`ui.tsx:581`); `Choices` radiogroup container no `accessibilityLabel` (`ui.tsx:271-284`); `_layout.tsx:60-62` offline fallback bypasses `Screen` safe-area.

**Design verdict:** the shared system is genuinely disciplined (44pt targets, documented contrast floors, RTL row/align, `maxFontSizeMultiplier=1.35`, safe-area via `Screen`, live-regions on ETA, `accessibilityViewIsModal` on sheets). The screens are clean of structural problems. The recurring theme is a small set of **sub-44pt targets, `★`-as-text, a few two-primary-CTA screens, and off-palette hardcoded colors** — all mechanical, none architectural. This matches the screenshots: a consistent, production-quality RTL UI.

---

---

## 6. Legal / licensing guardrails (do not violate)

1. **Port shapes only.** Enum names, field semantics, state machines, layout slots — fine. Decompiled Java, Uber artwork, the wordmark, proprietary pin shapes, the 6,659 drawables, Lottie docs, style documents (`tc2.uber.com`, never obtained) — **never**. (Uber `RCR §0` use rule.)
2. **Google geometry stays renderer-locked.** `canShowOnRenderer` (`map-provider.ts:97–101`) already enforces Google geometry only on a Google renderer, enforced at the data layer (`road.tsx:43,72,80`). **Any change must keep this intact** — it is license-required and tested.
3. **Google billing gate stays.** `shouldReroute` / per-user+global+in-flight budgets (`google-routing.ts`) — do not bypass when editing the approach/ETA path.
4. **Provenance hygiene.** Don't name Uber's internal identifiers (`mapdisplay_flipr_*`, `mmdf_*`) in Fastship code or commits; keep our own names.
5. **Safe to adopt (open source):** H3 (Apache-2.0), Mapbox geometry `geojsonvt`/`Earcut`.

---

## 7. Suggested implementation order (mechanical, lowest-risk-first)

1. **BUG-1** (failing test) — 1-line-move fix in `route-map.android.tsx`; re-run `npm test`.
2. **BUG-3** (stale fade) — add `driverKey` to deps or set opacity at creation; 1 test.
3. **A11Y-1 + A11Y-2** (recenter out of `role=img`; iOS label) — structural, low risk.
4. **BUG-2** (pin-confirm) — tolerance + clear + deadline; update pin tests.
5. **DEAD-1** (wire `mapReadyTimeoutMs`) — mechanical across 8 sites + `map.html`.
6. **DS-1/2/3/4** (`mapInk` + palette tokens) — mechanical, no behavior change.
7. **A11Y-4** (RTL arrow + FAB mirror) — small.
8. **P1 camera rule + padding-from-chrome** — the one medium refactor; do after the above are green.
9. **P1 ETA fallback narrowing** (server) + **P2 pickup sub-states**.
10. **DEAD-2** (`storeMapMode` decision) + **BUG-4** (`map.html` asset) — needs a product decision and a build step respectively.

**Verification after each step:** `npm test`, `npm run typecheck`, `expo lint`, and re-run on the SM-A5360 (never an emulator).

---

## 7b. Implementation-planner addendum (MiniMax agent — verified against installed packages)

These corrections/refinements sharpen §1–§7 into a mechanical, gate-aware plan. **Trust these over the earlier numbers where they differ.**

**Corrections to earlier counts:**
- **10 timeout sites, not 7/9** — `route-map.native.tsx:175` (the Apple **pin** map) was missed. Sites: `route-map.tsx:71`, `route-map.android.tsx:41`, `route-map.native.tsx:68` **and** `:175`, `google-map.native.tsx:57` **and** `:107`, `google-map.web.tsx:113` **and** `:240`, `google-maps-loader.ts:22`, `public/map.html:89`.
- **4 camera implementations, not 3** — web MapLibre, Android `map.html`, native (Apple+Google), Google web.
- **react-native-maps 1.27.2 has NO tiles-drawn event for Apple/MapKit** (`AIRMapManager.m:115` exports only `onMapReady`; `onMapLoaded` is Google-iOS/Android only). `onMapReady` fires at *render start*, and `mapViewDidFinishRenderingMap:fullyRendered:` is swallowed and never reaches JS. ⇒ the "blank-but-ready Apple map" fix **requires a config plugin** (add `onMapLoaded` export + emit on `fullyRendered`), not just a prop swap.
- **MapLibre derives its worker URL from `import.meta.url`** → empty for a non-http(s) origin ⇒ a `file://`/blob-bundled `map.html` **breaks the worker** unless `setWorkerUrl()` is set and the shared-module specifier is rewritten. This is why **bundling `map.html` (BUG-4 option A) is riskier than it looks** — ship the **version path** (option B) first.
- **The real ETA gap is one line:** `roadPath()` (`map-math.ts:108`) never appends `journeyProtocol=1`, so `road.tsx:88` always falls back to `etaRange()`. Only the public page requests the contract (`track/[token].tsx:45`). The contract already exists on the wire; **the order screen just never asks for it.**

**The two gates that must not regress (run `tests/google-routing.test.mjs` + `tests/map.test.mjs` after every phase):**
1. Licensing firewall — `canShowOnRenderer`/`routeProvider` (`map-provider.ts:85-101`); Google geometry only on a Google renderer.
2. Billing gate — `shouldReroute` (`google-routing.ts:117-133`) + client trigger strings (`map-provider.ts:115-137`). No phase may add a camera/UI event that fires a new `/route/google` request.

**Ordered 10-phase plan (lowest-risk-first, mechanical):**
1. **Android centre guard** (`route-map.android.tsx:44-56`): record `expectedCenter.current = center` *when the update arrives*, before the `state==='loading'` early-return. Fixes the failing test.
2. **Delete `manual` ref** (`route-map.android.tsx:28,51,76`) — write-only dead code.
3. **Wire `mapReadyTimeoutMs`** — new `src/map-timeout.ts` helper (`mapReadyTimeoutMs()` + `MAP_READY_GRACE_MS=5000`); thread into all 10 sites; Android host = knob + grace so the page reports first; `map.html` reads `config.readyTimeoutMs`. **Update the harness stubs** (`tests/google-map-lifecycle.test.mjs:76,98,254,265`) — the `'./runtime-config'` stub lacks `values` and will throw. Behaviour change: web/Google maps fail 5s earlier by default (25s→20s knob).
4. **Apple tiles-drawn readiness** — new `plugins/with-apple-map-loaded.js` config plugin exporting a pure `patchAppleMapLoaded(source)`; register in `app.config.js`; switch `route-map.native.tsx:81,185` to `onMapLoaded`. **HARDWARE (iOS) — no iOS device here.** Fallback if rejected: make iOS baseline the MapLibre WebView (loses Apple Maps — product decision).
5. **iOS pin echo guard** (`route-map.native.tsx:185,167` + `google-map.native.tsx:118`): `onPanDrag` must null `pendingCenter` (a user pan after a camera command is currently swallowed forever); also clear on `attempt` change. **HARDWARE (iOS).**
6. **`storeMapMode` — spec removal** (chosen over building a UI): no surface/copy/test needs it; the mode is already server-driven; a user switch would enable the **paid** Google renderer with no entitlement/budget story and let a stale `google` preference outlive a server downgrade. Delete setter+storage, return `MapMode` not a tuple, make the server policy veto a local `google` preference unless the policy permits google. Update `tests/google-map-lifecycle.test.mjs:280-287` + `tests/map.test.mjs:326-327`. **Strengthens** the billing gate.
7. **Camera-intent model** — new `src/map-camera.ts` (`CameraIntent = fit-route|follow-driver|inspect|user`, shared `FOLLOW_ZOOM/OFFSET/DELTA`, `cameraIntent()`), consumed by all 4 renderers; replace `google-map.web.tsx:150-185` bespoke glide with shared `glider()`; delete duplicate `bearingOf`/`shortestTurn`. `map.html` keeps a copy asserted equal by test.
8. **ETA contract from OSRM legs** — server: extend `OsrmRoute` with `legs`, validate, compute band `{min=raw, max=raw+max(spread, 10% raw), accuracy from spread/raw}`; add `'road_leg'` to `basis`; client: append `journeyProtocol=1` in `roadPath()`. No new wire type. Update `tests/map.test.mjs:227` (exact URL), add a `road_leg` journey-contracts case.
9. **Android survives API outage — version path** (`route-map.android.tsx:17` → `/map/v1/map.html` + server `Cache-Control: public, max-age=604800, immutable`): WebView cache then serves page+library with the API down (warm cache). Update the `map.test.mjs:397-401` path/header assertion. True bundling (9-B) deferred — worker-URL risk above.
10. **Small fixes:** `showsUserLocation` on `google-map.native.tsx:116`; unify `map-failures` LRU to one cap; palette tokens — add `palette.mapGround:'#E6ECE3'`, native hex→palette, unify no-entry red (`map.html:159` `#C62828`→`palette.error`, keep the page's hex whitelist guard at `map.html:34-36`).

**Device acceptance:** phases 1,3,6,9 Android-verifiable locally (SM-A5360, `adb reverse`); phases 4,5 are **HARDWARE (iOS)**. **Known risk:** phase 3 makes web/Google maps fail 5s earlier by default (intended; reversible via the knob). Phase 9-A only survives a *warm* cache with the API down, not a cold one.

---

## 8. What I did NOT check (honesty)
- No device run of TalkBack/VoiceOver traversal of the Android WebView (A11Y-3) — flagged **[needs device]**.
- iOS-specific behavior (BUG-2, A11Y-2) is code-read; the test device is Android. The `0.000001`-vs-refit magnitude is inferred from MapKit behavior, not measured.
- The full-app design audit agent and the implementation-planner agent were still running at write time; §5b and the per-item mechanical step lists will be appended.
- `nearLine`/`backtracks` in `map-math.ts` appear used only server-side; I did not trace those call sites — treat "unused in src" as unverified, not dead.
