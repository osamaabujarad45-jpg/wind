# FASTSHIP — Master Implementation Blueprint
**Date:** 2026-11-02 · **Audience:** the implementing agent (Claude / Opus 5.5) · **Scope:** every gap to close, every feature to build, across UI / frontend / backend / API / architecture — to reach **Uber's quality bar and then exceed it for the Palestinian market.**

> **Closure review:** Start with [the reconciled Opus handoff](HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md). It resolves conflicts and qualifies historical verification claims below.

> **Read this first.** This is the **entry-point and phase plan** for the implementing
> agent. It is **not** a verbatim restatement of every detail — for each phase it points
> to the authoritative source doc (the canonical brief, the map/screen/token specs) that
> holds the full build detail and acceptance criteria. **Read the referenced doc for a
> phase before implementing that phase.** Work phase by phase; after each, run the two
> gates (§2) and that phase's acceptance checks before moving on.

> **Framing (applies to everything below).** This is an authorized
> competitive-architecture study. Patterns are ported as **concepts, structure,
> geometry, and semantics only — never Uber's code, artwork, brand colors, or
> proprietary identifiers.** Every Fastship implementation must be original code.
> Claim markers: **[C]** confirmed in Fastship code · **[P]** partial · **[I]**
> inference · **[needs device]** requires on-device confirmation.

---

## 0. What Fastship is (ground truth — do not lose this)

Fastship is a **bilingual (Arabic/English) courier + ride + freight app** for the
Palestinian market. Three client surfaces share one backend:

- **Customer app** — `src/app/(customer)/` (index, orders, account) + `book.tsx`
  (ride/parcel/freight booking with `CityPicker` + `PinSheet` modals).
- **Driver app** — `src/app/driver/` (index, trips, earnings, account).
- **Admin app** — `src/app/admin/` (dashboard, orders, users, cash, subscriptions, settings).
- **Public/anonymous tracking** — `src/app/track/[token].tsx`.
- **Order + receipt** — `src/app/order/[id].tsx`, `src/app/receipt/[id].tsx`.

**Backend** — `server/main.ts` (hand-rolled `route('GET'|'POST','/api/...')`) +
36 domain modules in `server/domain/` (dispatch, quotes, ride-lifecycle, realtime,
google-routing, money, cash-ops, payments, phone-identity, entra, journey, ledger,
presence, route-quality, …). **New money work uses integer minor units** (`money.ts`,
`cashOwed` uses `BigInt` to avoid safe-integer overflow) — **but legacy orders still
store major-unit `REAL` prices** (`server/db/sqlite-schema.ts:23`, `src/model.ts:252`),
so treat "minor units" as the new-work contract, not a universal invariant. **i18n/RTL**
via `src/copy.ts` (ar + en string tables) + the `useCopy().rtl` flag — Fastship flips
layout through the **selected language, not OS `I18nManager`** (OS auto-flip is
explicitly off; see `src/ui.tsx:53,496`, `src/session.tsx:170`). **Client data** via
`src/api.ts` (`api()` + `useApi` polling + `useLiveFix` long-poll with `?since=`
cursor and terminal-code stop).

**Already strong — do not rewrite:** the map architecture (provenance-locked
geometry, tile-level readiness, honest stale handling, real `JourneyEta` contract,
generation-guarded provider fallback), the cash/money domain, the ride-lifecycle
and dispatch state machines, the i18n plumbing.

---

## 1. The goal, stated plainly

Reach **Uber's perceived quality** (polish, reliability, clarity) while being
**more usable, more effective, and better suited to Palestine** than Uber would
ever bother to be. That means:

1. **Fix the confirmed bugs first** (§3) — correctness before polish.
2. **Adopt Uber-grade patterns** where they genuinely help (§4–§7) — calibrated to
   Fastship's scale, not Uber's.
3. **Beat Uber on Palestinian-market fit** (§8) — this is where Fastship wins.
4. **Fill the full functional-feature matrix** (§9) — across every surface and layer.

---

## 2. The two gates that must NEVER regress

Run these after **every** phase. Both pass today.

```bash
node tests/google-routing.test.mjs   # billing gate
node tests/map.test.mjs              # licensing firewall + map policy
```

- **Licensing firewall** — `canShowOnRenderer` (`src/map-provider.ts:97-101`):
  Google geometry only on a Google renderer. **[C]**
- **Billing gate** — `shouldReroute` (`server/domain/google-routing.ts:117-130`,
  enforced `:323`). No change may fire a new paid `/route/google` call. **[C]**

Before shipping, also run the **full suite** on the designated test host (K5 over
SSH — needs live PostgreSQL `WIND_TEST_DATABASE_URL`), **both** typechecks —
`npx tsc --noEmit` (client) **and** `npx tsc --noEmit -p tsconfig.server.json` (server;
the default config excludes the server) — `npx expo lint`, and **on-device acceptance
on the physical phone** (SM-A5360, adb serial `R5CTB0FJP9Z` — never an emulator).

---

## 3. PHASE 0 — Confirmed bugs (fix first, verified)

These are confirmed against Fastship code. Full fixes + acceptance criteria are in
`docs/REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` (BUG-1/2/3/4) and
`docs/KNOWLEDGE-2026-11-02-uber-rea-opus-implementation-handoff.md` (NEW-1/2/3).

| Bug | Severity | Where | One-line fix |
|---|---|---|---|
| **BUG-1** [C] | failing test | `src/route-map.android.tsx:44-56` | Assign `expectedCenter.current` **before** the `state==='loading'` early-return. Test: `google-map-lifecycle.test.mjs:183` goes green. |
| **BUG-3** [C] | stale-fade lost | `src/route-map.tsx:272-287` | Set opacity at marker creation **or** add `driverKey` to the `:287` deps. |
| **NEW-1** [MED] | foreground-bounce refetch | `src/road.tsx:66-70` + `src/api.ts:73-90` | Make the "already loaded for this path" guard survive a transient `null` URL. **Verify server-side billing impact first** (request repeat proven; billing impact unverified). |
| **NEW-2** [MED] | movement baseline advances while backgrounded | `src/road.tsx:61-64,68` | Advance `billed.fix` only when a request is actually made (tie to the `foreground` gate). **Verify real user-visible effect first.** |
| **NEW-3** [LOW] | heading animation truncates | `src/google-map.web.tsx:173,181-182` | Converge heading on the same completion condition as position, or snap at glide end. |
| **BUG-2** [P] | iOS pin-confirm hang | `src/route-map.native.tsx:188`, `src/google-map.native.tsx:121`, **and the sheet's own strict compare** `src/pin-sheet.tsx:62` | Loosen tolerance `0.000001`→`~1e-4` in **both** the renderer **and** the sheet (the sheet also rejects a non-identical completion); always clear `pendingCenter`; add a positioning deadline. **[needs device]** |
| **BUG-4** [P] | Android map cold-start needs server `map.html` | `src/route-map.android.tsx:17` | Serve `/map/v1/map.html` with long-lived cache headers. |
| **NEW-4 / DEAD-1** [enhancement, duplicate] | hardcoded 20 s map-ready timeout (already covered by DEAD-1) | `src/route-map.native.tsx:175` | Extract the `20_000` ms ready-deadline to a named constant/config; consider a shorter value or a retry-with-backoff before failing to the retry button. Found by the resumed Haiku pass — verified in source. |

---

## 4. PHASE 1 — Accessibility at the map (highest-leverage polish)

From the canonical brief (`REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` §2):
- Move interactive map controls **out of** `role="img"` containers so screen readers
  reach them.
- Label the iOS map (currently unlabelled).
- **Separate the two locate-me capabilities** (they are different features): (a) a
  **GPS locate-me** that recentres on the device's own position, and (b) the
  **recenter-on-route** control that already exists across renderers
  (`src/route-map.tsx:301`, `route-map.native.tsx:93`, `google-map.web.tsx:210`).
  Add (a); keep (b). Give both proper a11y labels.
- **Mirror arrow/FAB for RTL** (Arabic) — flip directional icons based on the app's
  **selected-language RTL flag `useCopy().rtl`**, NOT `useCopy().rtl` (OS auto-flip
  is off in Fastship; see §0).

---

## 5. PHASE 2 — Design-token system (the "Uber feel" foundation)

**Goal:** one token source so every screen is consistent. Fastship already has
`palette` (`src/ui.tsx:18`), `shadow` (`:42`), `size` (`:45`). **Extend, don't break.**

**Apply `docs/competitive-architecture-uber-tokens.md`** — the complete, cited
numeric token spec (color roles, type scale, spacing, elevation, corner, button
matrix, list-row, bottom-sheet). Key verified values:

1. **Spacing** — an **8 dp base grid** (`0x..16x` = 0,8,16…128 dp, with half/quarter
   steps). Fastship's `size.gutter` (16) already equals `2x`. Add `space = { '0x':0, '1x':8, '2x':16, … }`; migrate ad-hoc dp gradually. Don't change existing `size.*` semantics.
2. **Elevation** — a `low/medium/high = 4/8/16 dp` ladder; the **bottom sheet sits off
   that ladder at 24/32 dp**. Corner radii: small 2, default 4, medium 8, large 12,
   xlarge 16; **pill = height/2**.
3. **Color roles** — map Fastship's `palette` onto semantic roles (`surface.primary/
   secondary/tertiary/inverse`, `content.primary/secondary/tertiary/disabled`,
   `divider`, `icon`, `brand.*`, `intent.{error,success,warning}`, `state.{hover,pressed}`).
   **All colors come from Fastship's `palette`** (alpha overlays for shades) — never
   Uber brand hex. **Single light theme** — do NOT add a dark variant (the canonical
   brief scopes day/night out). *(Note: the reference token file `src/design-tokens.ts`
   includes a dark block — see the decision note in §13; use only its light theme.)*
4. **Type scale** — compress to ~12 roles you actually use: Display / H1–H6 / Label
   (L/D/S) / Body (L/M/S) / Paragraph (L/D/S). Weight lives in the font (≈300 light
   display / 400 regular / 500 medium / 700 bold — see the tokens doc's corrected note:
   "Book" is a light display cut, body is 400). Give Arabic a larger line-height per
   role (§8.1).
5. **Button** — one `<Button variant size shape>`: all sizes share **min-height 64 dp**;
   size changes text (18/16/14 sp) + vertical padding (16/16/8 dp); shape = pill (radius
   height/2) / circle / square. Colors resolve through the theme roles.
6. **List-row** — 64 dp min height, 12 dp vertical text padding, 48 dp image tile /
   36 dp circular, 8 dp insets, **divider drawn by the parent group** (matches
   Fastship's `ListGroup`).
7. **Bottom-sheet** — 16 dp top corner radius, **24/32 dp elevation** (the sheet sits
   off the 4/8/16 elevation ladder), 64 dp min peek. **Grabber: 48 × 4 dp** (verified in
   the decompile — `ub__track_status_grabber_bar_*` 48×4, generic `ub__grabber_bar_*`
   52/48×4; NOT the M3-default 32×4 the token module guessed). Standardize on 48×4.
   **Wire backdrop opacity to sheet open fraction.**
8. **Motion** — one Reanimated `enterFromBottom` preset (slide-up + fade) with
   **Fastship's own duration/easing** (do NOT copy Uber's exact 400 ms / beziers).

**Type-scale adapter needed:** the token module exports ~42 roles with names that do
**not** match Fastship's existing `body/title/label/caption` set (`ui.tsx:167`). If you
adopt it, write a thin adapter mapping the roles you actually use (Display/H1–H6/
Label L·D·S/Body L·M·S/Paragraph L·D·S) onto Fastship's text components — don't do a
wholesale 42-role migration. Also note its `letterSpacing` values are raw Android-style
fractions and need conversion before use in RN (they are **not** drop-in).

**Reference implementation available:** the extraction also produced a ready-to-import
`src/design-tokens.ts` (opt-in `theme`/`space`/`radius`/`elevation`/`type`/`button`/
`listRow`/`bottomSheet` namespaces that **extend, not modify**, `src/ui.tsx`; verified
not to mutate `palette`/`size`). **Caveats if you adopt it:** (a) only the `light`
theme (see §13 — dark is scoped out); (b) its button shape matrix is incomplete (only
pill radius is wired; circle/square resolvers are private); (c) two literal hex values
(`#0D2A20`, `#0A1F17`) bypass the palette — replace with `withAlpha(palette.forest,…)`
to keep the "all colors from palette" rule true; (d) strip the "Uber" mention from its
header comment (attribution-free rule); (e) its `bottomSheet.grabber` is pinned to the
M3-default 32×4 — change to **48×4** per the verified value; (f) its `letterSpacing`
values are raw Android fractions needing RN conversion (not drop-in). Whether to adopt,
adapt, or treat as documentation is **your call — see §13.**

---

## 6. PHASE 3 — Map experience spec (the "Uber-quality map")

**Apply `docs/BUILD-SPEC-2026-11-02-fastship-map-uber-patterns.md`** — the complete,
verified map build spec. Its headline patterns (all calibrated to Fastship,
engine-specific values marked SKIP there):

1. **Camera is intent-based, not absolute** — an immutable camera position
   (coord/zoom/tilt/heading + a `verticalOffsetRatio`) drives the map. The
   `verticalOffsetRatio` is the key trick: it keeps the pickup/driver off-centre
   *above* a bottom sheet **without** changing zoom. Fit-bounds padding is computed
   at runtime from the live sheet height, never a constant.
2. **Pin anatomy (3 parts)** — a callout pill (rounded corners + pointer tail) over a
   5-slot lazily-inflated content row (icon/title/subtitle) over an anchor shape
   (circle = pickup, square = dropoff, small dot = minor). Build one Fastship SVG
   `<Pin>` that composes these; don't layer drawables.
3. **ETA pill** — a large value + small caps "MIN/ETA" label in a compact pill near
   the driver/pickup marker.
4. **Route polyline = fill + stroke casing, recolored along its length** — an outer
   casing (outline) + inner fill, with the traveled-vs-remaining split recolored at
   the driver-vertex via indexed color spans. Use Fastship colors.
5. **Vehicle glide** — keep Fastship's own interpolator; spec it to ride the
   location-fix period and snap on teleport (engine-internal timing is SKIP).
6. **Access-point picker** — full-bleed map + a "set custom pickup" pill + a bottom
   sheet of entrance/gate rows (each tagged with walking ETA). Major dense-city win.
7. **Recenter FAB** — ~44 dp, ~16 dp margins, bottom-anchored (bottom-end in LTR,
   bottom-start in RTL), high-contrast themed fill; compass appears only when
   bearing ≠ 0. Accessible (§4).

**Skip:** the proprietary GL map engine, GLTF 3-D car models, engine-internal
camera/glide timing, and any server-driven polyline width values.

> **Important — implement through Fastship's map adapter, not raw `react-native-maps`.**
> Fastship deliberately routes all rendering through its own web/Android/iOS adapter
> (`src/route-map.tsx`, `route-map.android.tsx`, `route-map.native.tsx`,
> `google-map.web.tsx`, `google-map.native.tsx`) with a licensing firewall and a
> `RoutePreview` fallback. **Do not** drop in a bare `<MapView>` and bypass that — it
> would break the licensing gate, the fallback, and the "do not rewrite the map
> architecture" rule. Apply these patterns **inside** the existing renderers.

Prior verified references: `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md`
(100-item inventory), `docs/REVIEW-2026-11-02-map-ux-vs-uber.md` (map/UX detail).

---

## 7. PHASE 4 — Per-screen build specs (UI/frontend)

**Apply `docs/SPEC-2026-11-02-fastship-per-screen-build-specs.md`.** It is complete
and build-ready — region maps, spacing geometry, component composition, states, and
motion for all six core screens, each mapped to Fastship's actual routes:

- **(a) Home** `(customer)/index.tsx` — keep list-first home; expose header/body/footer
  semantic regions; keep the 56 dp "Where to?" row.
- **(b) Search** `book.tsx` `CityPicker` — keep in-place modal; peek ≈120 dp; gate
  scroll on sheet position.
- **(c) Location-pin editor** `book.tsx` `PinSheet` — explicit 3-layer (map / pin /
  chrome-card + confirm row).
- **(d) Booking confirm** `book.tsx` — single form IS the confirm; keep sticky footer.
- **(e) Trip tracking** `order/[id].tsx` — **adopt Coordinator geometry**: full-bleed
  map + non-dismissable bottom sheet (peek 64 dp). Keep `track/[token].tsx` minimal.
- **(f) Receipt** `receipt/[id].tsx` — keep native card; skip WebView.

**Cross-screen:** mount `@gorhom/bottom-sheet` once at root `_layout.tsx`; adopt the
analytics-id discipline via a `useAnalyticsId` hook (not view wrappers). Two cautions
on the screen spec: (a) where it suggests raw `react-native-maps`/`MapView`, implement
through Fastship's existing map adapter instead (see §6 note); (b) the screen spec's
"8 dp scale already exists" is imprecise — Fastship's `size` tokens exist but there is
**no uniform 8 dp scale yet** (styles mix values), so §5's spacing scale is a proposed
change, not current behavior.

---

## 8. PHASE 5 — Palestinian-market fit (where Fastship BEATS Uber)

This is the differentiator. Uber will not do these; Fastship must. Each is a real
feature, not a tagline.

### 8.1 Arabic-first, not Arabic-also
- **RTL is a first-class layout mode**, not a translation. Verify every directional
  icon, arrow, chevron, progress indicator, and map control mirrors under
  `useCopy().rtl`. Audit the 45 Arabic screens in `.screens/states-out/ar/`.
- **Arabic numerals choice** — offer Western (0-9) vs Eastern Arabic (٠-٩) numerals
  in settings; money/phone/ETAs respect the choice.
- **Arabic type scale** — Arabic script needs larger line-height than Latin; tune the
  §5 type scale per-locale so Arabic never clips.

### 8.2 Cash-first economy (already partially built — make it excellent)
- **Cash is the default**, cards/wallets are opt-in. Fastship already has `cash-ops.ts`,
  `ledger.ts`, `money.ts` (integer minor units). Surface cash status clearly to driver
  and customer.
- **Local payment rails** — design the `payments.ts` boundary so a local provider
  (e.g. PalPay, Jawwal Pay, bank transfer) can be added behind one interface. Do NOT
  hard-depend on Stripe/PayPal (limited in Palestine).
- **ILS (₪) as primary currency** with correct minor-unit handling (already BigInt-safe);
  support JOD/USD display where cross-border.

### 8.3 Connectivity-resilient (2G/3G, intermittent)
- **Offline-tolerant booking** — queue a booking request when the network drops;
  submit on reconnect with the client-generated request UUID (§9 API) so retries
  never double-book.
- **Low-bandwidth map** — the baseline (non-Google) renderer must degrade gracefully;
  keep the `RoutePreview` diagram as a true offline fallback. Cache quotes (§9) so
  remounts don't re-fetch on flaky networks.
- **Small payloads** — prefer the long-poll `?since=` delta pattern (already present)
  over full re-fetches; keep JSON (not protobuf) but trim fields.

### 8.4 Addressing for places without formal addresses
- **Landmark-based pickup** — many Palestinian locations have no street address. Fastship
  **already has a required landmark field with example + a saved-place flow**
  (`book.tsx:332,506`, `copy.ts:1309`). **Build on it:** surface the landmark hint more
  prominently in the pin editor (§7c) and search results — don't add a duplicate field.
- **What3words-style precision** (optional) — evaluate a short-code location system
  for unaddressed areas.

### 8.5 Trust & safety for the local context
- **Anonymous public tracking** (already present at `track/[token].tsx`) — let a
  recipient/family member watch a delivery without an account. Market this.
- **Handover verification codes** — Fastship has three *separate* controls — don't
  conflate them: **boarding verification** (`ride-lifecycle.ts:250`), **delivery
  handover codes** (order advancement, `main.ts:2150`), and **cash settlement /
  remittance** (`main.ts:2689`). Make each prominent and hard to skip; they are the
  anti-fraud backbone for cash.
- **Driver verification + rating** — surface driver identity clearly (photo, plate,
  rating) before pickup; cash rides need more trust signals than card rides.

### 8.6 Pricing & transparency
- **Upfront price in ₪ before confirm** (quotes domain already supports this) —
  no surprises, critical where cash and trust matter.
- **Transparent fare breakdown** on the receipt (`receipt/[id].tsx` already native) —
  keep itemized lines; show commission/earnings honestly per role.

---

## 9. PHASE 6 — Full functional-feature matrix (UI / frontend / backend / API / architecture)

This is the "fill every gap" matrix. Mark each **Have** (already in Fastship),
**Adopt** (port the pattern), or **Build** (new). Priorities: P0 = must for launch
quality, P1 = differentiator, P2 = later.

### 9.1 API & contracts

> **Verified against the working tree** (pass-2 API study, 2026-11-02 — read the code, don't rebuild):
> - **Realtime cursor: server BUILT, client UNWIRED (top gap).** `server/domain/realtime.ts:60-69` already issues event-sequence cursors + snapshot path, but `src/` has **zero consumers** (no hits for `/realtime`, `eventCursor`, `snapshotPath`). **Wire `useApi`/`useLiveFix` → `/api/orders/:id/realtime` — do NOT redesign the server.**
> - **Server-driven poll cadence: missing.** 15 `useApi` calls run on fixed 10–60 s intervals; the server sends none. Adopt `nextPollMs` from the order serializer (`server/domain/journey.ts`) consumed in `src/api.ts:86-88`. **Top adopt.**
> - **Error codes: ~200 distinct open string codes** (`fail(\d+,'code')` grep → 196 distinct; independent recount → 203; method-dependent floor); `GoogleRoutesErrorCode` is closed and `OfferFailure` carries typed recovery (`server/domain/journey.ts:70`). Add a shared closed `ApiErrorCode` tuple (narrow), not a from-scratch error base.
> - **Already HAVE (do not rebuild):** idempotent create (`order_commands` + `offerId`/`leaseNonce`), quote TTL (`quotes.ts:6,191,259`), offer lifecycle (`offered/accepted/declined/expired/released`), `x-request-id` partial, correlation IDs (`main.ts:3089,3161,3200`).
> - **Driver fix missing `speed`** (`src/model.ts:146` has `heading`, no `speed`) — add for motion hints.

| Feature | Status | Priority | Where / note |
|---|---|---|---|
| **Wire realtime cursor client-side (server built)** | **Build (wire only)** | **P0** | `realtime.ts:60-69` is built; `src/` has zero consumers. Connect `useApi`/`useLiveFix` → `/api/orders/:id/realtime`. |
| **Server-driven poll cadence (`nextPollMs`)** | **Adopt** | **P0** | Replace 15 fixed-interval `useApi` polls; emit from `journey.ts` serializer, consume in `api.ts:86-88`. |
| Typed error-code union + unknown fallback | **Adopt (narrow)** | P0 | ~200 distinct open codes (196-203 by grep method); `GoogleRoutesErrorCode` and `OfferFailure` already typed (`journey.ts:70`). Add a shared closed `ApiErrorCode` tuple + category/recovery behind `journeyProtocol=1`; don't rebuild the `HttpError`/`fail()` base (`main.ts:191`). |
| Client-generated request UUID (idempotency) | **Adopt/extend** | P0 | Order creation already generates `requestId` and records the command (`booking.ts:33`, `main.ts:1490`, recorded at `:1503`). **Reuse the existing optional PostgreSQL `commandId` replay infra** (`commands.ts:14,83`, `main.ts:3162`) rather than building a new mechanism; note `/location` is outside that allowlist — extend it deliberately. |
| Live-stream envelope `{msgs,heartbeat,control}` + `since=` cursor | **Adopt** | P0 | `useLiveFix` already does `?since=` — a **fix timestamp** handled in `main.ts:2430` (`api.ts:137`). `realtime.ts:65` separately issues credentials + event-sequence cursors. Extend the envelope in the right place (the fix long-poll in `main.ts`, or the realtime cursor in `realtime.ts`) — don't conflate the two. |
| Server-pushed TTL quote cache (identity-keyed) | **Adopt** | P0 | `/api/price` + `quotes.ts`; key by customer+itinerary identity (not cells alone — `main.ts:1287`, `quotes.ts:36`). |
| Required-field validation at trust boundary | **Adopt** | P0 | Partially present (`google-routing.ts:249-253,262-266`); extend + tolerate unknown keys. |
| In-path versioning (`/api/v2/...`) | **Adopt when needed** | P2 | Only at a breaking change; don't pre-version. |
| Offer lifecycle verbs `accept/ack/expire/reject` | **Adopt** | P1 | Map to `dispatch.ts`; explicit beats implicit. |
| Single `resolve-location` endpoint | **Adopt (concept)** | P1 | One `/api/location/resolve` (lat/lng+context → canonical point + landmark). |

### 9.2 Backend & architecture
| Feature | Status | Priority | Where / note |
|---|---|---|---|
| Topic-based realtime (model→topic map) | **Adopt** | P0 | One `const topics={driver_fix,dispatch_status}` in `realtime.ts`. |
| Offline command queue (client) + replay | **Extend** | P1 | Booking commands are already persisted before sending and retained for retry (`book.tsx:360,377`); driver actions have durable recovery (`driver-recovery.ts:36`). **New part:** automatic reconnect + a general queue for the remaining mutating calls. |
| Durable driver-command recovery | **Have/partial** | P0 | Already recommended in `CURRENT-WORK.md`; finish per that plan. |
| Cash settlement / remittance | **Have (not a "reconciliation sweep")** | P0 | `cash-ops.ts` (settlement, balances) + `ledger.ts` + manual legacy import. Note: the worker's existing reconciliation sweep (`worker.ts:138`) is for **refunds**, not cash — don't conflate. Keep BigInt-safe. |
| Local payment provider integration | **Integrate** | P1 | The `PaymentsProvider` interface already exists (`payments.ts:12,29` — create/query/capture/void/refund). **New part:** implement a real local provider adapter (PalPay/Jawwal/bank transfer) behind it; don't hard-depend on Stripe/PayPal. |
| Observability (correlation id per request) | **Have/extend** | P1 | Per-request correlation IDs already exist incl. DB context + error logging (`main.ts:3089,3161,3200`). **New part:** propagate the client request UUID into that existing context. |

### 9.3 Frontend & state
| Feature | Status | Priority | Where / note |
|---|---|---|---|
| Design-token source (`src/ui.tsx`) | **Adopt** | P0 | §5 — spacing/roles/type/button/sheet/motion. |
| Root-mounted bottom sheet | **Build** | P0 | `@gorhom/bottom-sheet` at root `_layout.tsx`; wire backdrop opacity. |
| Screen-interactor hook pattern | **Adopt** | P1 | Separate state/effect logic from views (RIB's View/Interactor split, without the framework). |
| Analytics-id discipline | **Adopt** | P1 | `useAnalyticsId` hook on interactive surfaces. |
| RTL-complete audit | **Build** | P0 | §8.1 — mirror all directional UI; audit 45 ar screens. |

### 9.4 UI & screens
| Feature | Status | Priority | Where / note |
|---|---|---|---|
| Per-screen build specs (6 core) | **Apply** | P0 | §7 + `SPEC-2026-11-02-fastship-per-screen-build-specs.md`. |
| Map-experience spec | **Apply** | P0 | §6 + `BUILD-SPEC-2026-11-02-fastship-map-uber-patterns.md`. |
| Locate-me / recenter FAB | **Build** | P0 | §1 + §6; RTL-mirrored, accessible. |
| Camera-intent model | **Adopt** | P1 | §6. |
| Pickup access points | **Build** | P1 | §6; dense-city differentiator. |
| Landmark-based pickup hint | **Build** | P1 | §8.4. |

---

## 10. Evidence index (read these; they are the reference set)

**This session (verified, in `docs/`):**
- `MASTER-2026-11-02-fastship-implementation-blueprint.md` — **this file (start here)**
- `KNOWLEDGE-2026-11-02-uber-rea-opus-implementation-handoff.md` — verified handoff + bugs
- `KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` — API/backend contracts; **pass-2 revision**, supersedes pass-1 route/census claims; closure handoff corrects its correlation-ID row
- `KNOWLEDGE-2026-11-02-uber-rider-ui-layer-architecture-study.md` — UI layer
- `KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md` — 100-item map inventory
- `REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` — canonical brief (BUG-1/2/3/4, a11y)
- `REVIEW-2026-11-02-map-ux-vs-uber.md` — map/UX detail
- `SPEC-2026-11-02-fastship-per-screen-build-specs.md` — per-screen build specs
- `BUILD-SPEC-2026-11-02-fastship-map-uber-patterns.md` — full map build spec
- `competitive-architecture-uber-tokens.md` — full design-token numeric spec (color roles / type / spacing / elevation / button / list-row / bottom-sheet)
- `../src/design-tokens.ts` — ready-to-import token layer (opt-in; **see §13 decision note**)
- `docs/rea-work/DECOMPILE-ACCESS.md` — how to look up raw decompile specifics
- `docs/rea-work/LEDGER.md` — verification log

**Prior knowledge base (extensive, in `docs/`):**
- `KNOWLEDGE-2026-11-01-*.md` (6 deep docs: architecture, backend, data, screens,
  maps deep dive, features & requirements — 28 FR + 15 NFR)
- `KNOWLEDGE-2026-10-31-uber-app-full-reference.md` + maps/rider facts
- `HANDOFF-2026-11-01-UBER-APP-KNOWLEDGE-FOR-OPUS-5.5.md` — coverage dossier
- `reports/uber-real-code-reference-2026-11-01.md` — real-code contract reference
- **Master edition (out of repo):** `C:\UberAppKnowledge\UBER-APP-MASTER-KNOWLEDGE-2026-11-01.md`

**Fastship UI screenshots:** `.screens/states-out/en/` (44) + `.screens/states-out/ar/` (45).

---

## 11. Legal guardrails (must hold throughout)

1. **No proprietary substance.** Port concepts/structure/semantics only. Never Uber's
   code, artwork, brand colors/hex, drawables, tiles, or identifiers
   (`mapdisplay_flipr_*`, `tc2.uber.com`).
2. **Geometry vs. parameters — the explicit distinction.** **Allowed to reference:**
   *structural facts* that are not creative expression — the 8 dp spacing grid, the
   4/8/16 elevation ladder, 16 dp sheet corner radius, 64 dp control heights, the
   type-size ladder, button min-height. These are industry-standard measurement
   conventions, not copyrightable. **NOT allowed to copy:** *tuned parameter values
   that are creative choices* — exact animation durations/easings (e.g. the 400 ms /
   specific beziers), specific color hex values, GLTF model names, server-driven
   polyline widths, engine-internal timing constants. For those, **choose Fastship's
   own values.** When in doubt, treat a number as a creative parameter and pick your own.
3. **No contact.** No runtime dependency on Uber systems, endpoints, or assets.
4. **Independent expression.** Everything implemented in Fastship's own code/style.
5. **Attribution-free.** Do not reference "Uber" in shipped code, comments, assets,
   or user-facing strings. *(Note: `src/design-tokens.ts` currently names Uber in its
   header comment — strip that if the file is adopted; see §13.)*

---

## 12. Implementation order (smallest-risk-first)

> **This master is the entry point, not the only source.** It deliberately references
> the canonical brief and specs for full detail — it is not a verbatim restatement of
> them. For acceptance criteria, each phase points to its source doc; the canonical
> brief (`REVIEW-2026-11-02-uber-full-stack-gap-analysis.md`) holds the complete
> dead-contract and ETA-contract work that this master summarizes but does not repeat.
> Read the referenced doc for each phase before implementing it.

1. **Confirm the gates green** (§2).
2. **Phase 0** — fix the confirmed bugs (§3); BUG-1 makes the failing test pass.
   *Also from the canonical brief:* the dead-contract wiring and the ETA/`JourneyEta`
   contract work (`REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` §4–§5) — do these
   with Phase 0 since they touch the same map/billing code.
3. **Phase 1** — accessibility at the map (§4).
4. **Phase 2** — design-token system (§5 + tokens spec).
5. **Phase 3** — map experience (§6 + map spec).
6. **Phase 4** — per-screen specs (§7).
7. **Phase 5** — Palestinian-market fit (§8) — weave through every phase.
8. **Phase 6** — full feature matrix (§9) — P0 first, then P1, then P2.
9. **Final** — full test suite on K5, **both** typechecks (`tsc --noEmit` **and**
   `tsc --noEmit -p tsconfig.server.json`), `expo lint`, on-device acceptance.

---

## 13. Honest "not checked / not verified" list

- **NEW-1/NEW-2 billing impact** is unverified from client code — confirm server-side.
- **BUG-2** MapKit refit magnitude is inferred (test device is Android). **[needs device]**
- **Full test suite** not run here (needs live PostgreSQL `WIND_TEST_DATABASE_URL`) —
  only the two gate suites + lifecycle were run.
- **Map + token specs are complete** — apply `BUILD-SPEC-2026-11-02-fastship-map-uber-patterns.md`
  and `competitive-architecture-uber-tokens.md`.

### Decision you must make (one item)
- **`src/design-tokens.ts` was generated by the extraction as a ready-to-import token
  layer.** It is opt-in (it imports `palette`/`size` and adds a `theme` namespace; it
  does **not** modify `src/ui.tsx` or any call site) and sources colors from Fastship's
  `palette` via alpha overlays — **except two literal hex values** (`#0D2A20`, `#0A1F17`)
  that bypass the palette and should be replaced with `withAlpha(palette.forest,…)` if
  adopted. It is lawful (no Uber hex/code), **but:** (a) it is app code the read-only
  analysis was not supposed to produce; (b) it ships a `dark` theme the canonical brief
  scopes out; (c) its header comment names Uber (strip it). **Decide:** adopt it
  (light theme only, with the fixes in §5), adapt it, or treat it as documentation and
  hand-write tokens per §5. It is currently **uncommitted** in the working tree;
  nothing else depends on it yet.
- **Local payment provider availability** (PalPay/Jawwal) is a business/integration
  question, not verified here.
- **Runtime/device behavior** of the map layer beyond unit gates is unverified.

---

*Built via multi-agent REA (GLM 5.2, Kimi K3, attempted Baseten DeepSeek 4.1 verification (quota-blocked; no completed verification),
GPT-6.1-Sol verification ×2) over a lawful static study + Fastship's own source. The
analysis modified no existing app code; it produced documentation plus one opt-in
generated module (`src/design-tokens.ts`, see §13) that is uncommitted and that the
owner must decide whether to adopt. All shipped implementation is original to Fastship.*
