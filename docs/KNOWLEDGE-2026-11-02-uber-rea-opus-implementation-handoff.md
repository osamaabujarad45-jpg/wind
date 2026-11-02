# KNOWLEDGE — Uber REA → Opus 5.5 Implementation Handoff (2026-11-02)

> **For the implementing agent (Opus 5.5).** This is the single handoff file that
> consolidates an authorized competitive-architecture study of the Uber rider app
> against Fastship, verified by independent multi-agent checks and test runs.
> It tells you **what to change, where, why, and how to verify** — calibrated to
> Fastship's scale, not Uber's.

---

## 0. How to read this (framing, evidence, safety)

**Framing (applies to every claim here).** This is an *authorized
competitive-architecture study* of an app the owner is authorized to examine.
The goal is **design and engineering PATTERNS** that improve an independent
courier app — **not** cloning, infringing, or attacking anything. All analysis
was **static and read-only** on a local decompile; no Uber system was contacted.

**Port shapes, never substance.** Take *concepts, state names, field semantics,
layout slots, token structure*. **Never** port decompiled Java, artwork,
drawables, tiles, parameter values, or proprietary identifiers (e.g.
`mapdisplay_flipr_*`, `tc2.uber.com`).

**Claim markers.** **[C]** confirmed · **[P]** partial/conditional · **[I]**
inference · **[U]** unknown · **[needs device]** requires on-device confirmation.

**Verification status of this document.** Every load-bearing claim about
**Fastship's own code** was re-checked by an independent second-model pass
(medium/high effort): **8 confirmed, 4 corrected/qualified, 0 false.** The four
corrections are folded in below. Both regression gates pass locally:
`tests/google-routing.test.mjs` ✅ and `tests/map.test.mjs` ✅ (run
2026-11-02). `tests/google-map-lifecycle.test.mjs` ❌ still fails at `:183`
(`1 !== 0`) — that is **BUG-1**, expected, and first on the fix list.

---

## 1. TL;DR — the work, in priority order

Fastship's map architecture is **already strong** (provenance-locked geometry,
tile-level readiness, honest stale handling, a real `JourneyEta` contract,
generation-guarded provider fallback). **Do not rewrite it.** The work is
surgical:

1. **Correctness bugs first** — BUG-1 (failing test), BUG-3 (stale-fade loss),
   BUG-2 (iOS pin-confirm), plus three NEW findings (NEW-1/NEW-2 billing-state,
   NEW-3 heading truncation).
2. **Accessibility at the map** — interactive controls inside `role="img"`, iOS
   map unlabelled, no locate-me control, RTL not mirrored.
3. **Cross-stack patterns worth porting** (highest-leverage last): the
   server-pushed **TTL quote cache**, the **typed error envelope + client
   request UUID**, the **live-stream envelope** shape, and the **design-token /
   spacing discipline**.

**The canonical, already-verified implementation brief is
`docs/REVIEW-2026-11-02-uber-full-stack-gap-analysis.md`** — it holds BUG-1/2/3/4,
the accessibility cluster, and the map-functionality gaps with file:line fixes
and acceptance criteria. **Start there.** This handoff *adds* the two new
verified studies and the NEW bugs on top; it does not replace that brief.

---

## 2. The two gates that must never regress

Run `tests/google-routing.test.mjs` and `tests/map.test.mjs` after **every**
phase. Both pass today.

- **Licensing firewall** — `canShowOnRenderer` (`src/map-provider.ts:97-101`):
  Google geometry only on a Google renderer. **[C]**
- **Billing gate** — `shouldReroute` (`server/domain/google-routing.ts:117-130`,
  enforced `:323`). No change may fire a new `/route/google` call. **[C]**

Any change that touches `src/road.tsx`, `src/api.ts`, `src/route-map*.tsx`,
`src/google-map*.tsx`, or `server/domain/google-routing.ts` must re-run both.

---

## 3. Confirmed bugs — fix first

### From the canonical brief (verified; see that file for full fixes + acceptance)
- **BUG-1 [C]** — Android bridge drops a pre-style-load GPS center → **the
  failing test** `tests/google-map-lifecycle.test.mjs:183`. Fix in
  `src/route-map.android.tsx:44-56`: assign `expectedCenter.current` before the
  `state==='loading'` early-return.
- **BUG-3 [C]** — stale-fade lost when the driver marker rebuilds.
  `src/route-map.tsx:272-287`; deps omit `driverKey`.
- **BUG-2 [P→worse]** — iOS pin-confirm hang; the "drag escape" is incomplete
  (clears sheet state, not renderer `pendingCenter`).
  `src/route-map.native.tsx:188`, `src/google-map.native.tsx:121`,
  `src/pin-sheet.tsx:36-37,62-63,76`. **[needs device]** MapKit refit inferred.
- **BUG-4 [P]** — Android baseline map cold-start depends on server-served
  `map.html`. `src/route-map.android.tsx:17`. Prefer the version-path/cache fix.

### NEW bugs — found by Sol sweep, re-verified by a second Sol pass

**NEW-1 [MED, billing — request repeat confirmed; billing impact UNVERIFIED]**
`src/road.tsx:66-70` + `src/api.ts:73-90`.
- **Mechanism [C]:** `useApi`'s `refetchOnFocus:false` guard is path-based
  (`loaded.current`). Backgrounding sets `approachUrl=null` → `loaded.current`
  becomes null; on foreground the URL returns → `firstForPath=true` → the hook
  **refetches despite `refetchOnFocus:false`**.
- **Correction applied [P]:** these files prove *another client request fires*;
  they do **not** prove the backend bills it. Confirm server-side whether the
  repeated `/route/google` (or approach) call is actually charged before
  treating this as a billing leak.
- **Fix direction:** make the "already loaded for this path" guard survive a
  transient null URL — e.g. keep the last non-null path's loaded state, or gate
  the path-reset so a background-induced `null` does not clear `loaded.current`.

**NEW-2 [MED, state — baseline advance confirmed; consequence OVERSTATED]**
`src/road.tsx:61-64,68`.
- **Mechanism [C]:** `billed.fix` (the movement baseline) advances via
  `setBilled` during render **even while `foreground` suppresses the request**
  (`:68`). Only URL construction is foreground-gated.
- **Correction applied [P]:** these lines do **not** establish that the map
  routes from a stale origin or that extra billing results — only that the
  movement baseline can advance without a corresponding request. Treat as a
  state-consistency smell, verify the real user-visible effect before
  prioritizing.
- **Fix direction:** advance `billed.fix` only when a request is actually made
  (tie the baseline update to the same `foreground` condition as the URL), or
  recompute the baseline at request time.

**NEW-3 [LOW, marker correctness — real; citation + magnitude corrected]**
`src/google-map.web.tsx:173,181-182` (NOT `:196-200`).
- **Mechanism [C]:** heading animation truncates — rotation applies a fixed
  fraction of remaining angular error per frame (`:173`) and the animation ends
  when *position* interpolation completes (`:181-182`), so heading can stop
  short of its target.
- **Correction applied [P]:** the "~30% residual" figure is **not** a general
  guarantee — residual error depends on frame count and glide duration
  (`:161-165`); reduced-motion snaps heading immediately (`:173`).
- **Fix direction:** converge heading on the same completion condition as
  position (lerp to target within epsilon), or snap heading to target at the end
  of the glide.

---

## 4. Cross-stack patterns worth porting (verified against Fastship's code)

Each row names the pattern, the Fastship anchor (confirmed to exist), and the
recommendation. Full evidence in the two cited studies.

### 4a. From the API/backend study — `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md`

Fastship anchors confirmed: hand-rolled routes in `server/main.ts` **[C]**
(GET `:584`, POST `:607`); all six domain modules exist **[C]** (dispatch `:15`,
quotes `:40`, ride-lifecycle `:17`, routing-status `:33`, realtime `:24`,
google-routing `:34`); `api()` + `useApi` polling + `useLiveFix` long-poll with
`?since=` cursor and terminal-code stop **[C]** (`src/api.ts:22,38,88,112,127,137,145`).

| Pattern (from Uber) | Verdict | Fastship anchor / why |
|---|---|---|
| String error-code union with `synthetic.unknown` fallback | **ADOPT** | Fastship's client errors are **unrestricted strings today** (`src/api-client.ts:6-9`); `errorCode` is imported/re-exported in `src/api.ts:5,9` and terminal codes are string comparisons `:157`. There is **no** code union yet — this is **new work**: introduce a server-side `ApiError` base with a closed string-code set + an unknown fallback, and narrow the client to match. |
| Client-generated request UUID on every mutating call (`x-uber-call-uuid`) | **ADOPT (extend, don't duplicate)** | Fastship **already has idempotency on order creation** — `requestId` is generated/preserved and recorded results are replayed (`src/booking.ts:33`, `server/main.ts:1490,1992`). **Verify that first;** then extend the same client-generated-request-id pattern to the remaining mutating calls that lack it (e.g. `/api/jobs/:id/accept`, `/api/location`). One header + unique index. |
| Live-stream envelope: `oneof {msgs, control, heartbeat}` + `lastseen_seq_id` + per-message ack | **ADOPT (shape only, over long-poll)** | `useLiveFix` already does `?since=` (`:127`); extend the answer to `{msgs[], heartbeat, control}` instead of a bare fix; cursor lives in `server/domain/realtime.ts`. Skip gRPC; keep fetch. |
| PushModel = `(model class, "topic_string")` singleton | **ADOPT (as TS record)** | One `const topics = { driver_fix, dispatch_status }` map in `server/domain/realtime.ts`. No codegen. |
| Server-pushed TTL quote cache (`FareCacheSettings`: validUntil + cell-bucket keys) | **ADOPT (with identity guard)** | Applies to `/api/price` + `server/domain/quotes.ts`: return `validUntil` and cache quotes so the app stops re-quoting on remount. **Cache key must preserve customer + itinerary identity** (customer id, pickup+dropoff coordinates, parcel/ride options) — **not** pickup/dropoff cell alone — or a valid-looking cache hit can fail booking validation (`server/main.ts:1287`, `server/domain/quotes.ts:36`). Aligns with the "billable endpoints load once" intent in `src/api.ts`. **Highest-leverage single idea.** |
| Required-field Builder checks + tolerate unknown fields | **ADOPT** | Trust-boundary validation is partially implemented **[C]** (`google-routing.ts:249-253,262-266`); extend and ignore unknown JSON keys on ingest. |
| In-path versioning, old versions left live | **ADOPT when needed** | Keep `/api/price`, add `/api/v2/price` only at a breaking change. Don't pre-version. |
| `offer/accept\|ack\|expire\|reject` verb set for dispatch | **ADOPT (as endpoints)** | Map to `server/domain/dispatch.ts`: explicit offer lifecycle beats implicit state flips. |
| `resolve-location` single endpoint (location+context → canonical place) | **ADOPT (concept)** | One `/api/location/resolve` instead of geocode logic spread across screens. |
| Dual wire format (protobuf+JSON), RxJava codegen, everything-is-POST, fare-split family, UnknownItems blob | **SKIP** | JSON is fine at Fastship scale; GET-with-query reads are cacheable; TypeScript ignores extra keys. |

### 4b. From the UI-layer study — `docs/KNOWLEDGE-2026-11-02-uber-rider-ui-layer-architecture-study.md`

Fastship anchors confirmed: `src/ui.tsx` holds tokens + components **[C]**
(`palette:18`, `shadow:42`, `size:45`, `Field:338`, `TabBar:497`); navigation is
Expo Router under `src/app/` **[C]** (`src/app/_layout.tsx:3,65`,
`src/app/(customer)/_layout.tsx:1-10`). **Correction:** `palette`/`size` already
exist, but there is **no uniform 8-dp spacing scale yet** — current styles mix
values (e.g. 14, 12 at `:546`), so the spacing scale is a *proposed change*, not
existing behavior.

| Uber pattern | Verdict | How (RN/Expo), calibrated |
|---|---|---|
| 8 dp linear spacing scale | **ADOPT** | Add `spacing = (n)=>n*8` to `src/ui.tsx` alongside existing `size`; migrate ad-hoc dp gradually. Don't break current `size.gutter`/`size.radius`. |
| Semantic theme attrs (backgroundPrimary/contentPrimary/iconColor/divider) | **ADOPT (single theme)** | Extend existing `palette` with role-keyed tokens; stop hardcoding colours. **Do NOT add a dark variant** — the canonical brief explicitly scopes out day/night theming (`REVIEW-2026-11-02-uber-full-stack-gap-analysis.md:156`). One well-formed light theme. |
| Button matrix (3 variants × 3 sizes × 3 shapes) | **ADOPT (compressed)** | One `<Button variant size shape>`; do not replicate every Uber leaf style. |
| ~80 text styles | **COMPRESS to ~12** | Display/Title/Label/Body × 2 sizes × 2 weights. |
| `analyticsId` per interactive node | **ADOPT (the discipline)** | A small HOC/hook tagging interactive surfaces. |
| Bottom-sheet system (scrim + widget, peek 64–120 dp, top-only 16 dp radius, grabber) | **ADOPT** | `@gorhom/bottom-sheet`; `background={theme.backgroundPrimary}`, `cornerRadius=16`, grabber `handleStyle`. **Caution:** wire backdrop opacity to sheet open fraction — Uber's scrim is `alpha=0` and faded in by code; forget the fade and sheets appear with no backdrop. |
| Map + bottom-sheet + collapsing header | **ADOPT** | `react-native-maps` full-bleed + sheet overlay; animated header on scroll. |
| 4-slot marker; pins composed from pieces | **ADOPT the slot model; SKIP the piece assembly** | `<MapMarker leadingIcon title subtitle trailingIcon>`; one SVG `<Pin color label>`. |
| SDUI list-row (~20 slots) | **ADOPT the idea, drastically reduce** | `<Row leadingImage title subtitle trailing Action>` (~6 slots). |
| Receipt = WebView in collapsing header | **SKIP for Fastship** | Fastship's receipt (`receipt/[id].tsx`) is already a short **native** card — keep it. The WebView pattern suits Uber's long server-rendered receipts; Fastship's are short and native is cheaper. Revisit only if a long receipts *list* is ever added. |
| StateList animators; XML transitions; RIB framework; drawer shell; lite/full split | **SKIP** | RN/Reanimated equivalents exist; a courier app doesn't need the drawer or the RIB ceremony. |
| `fade+push_up` enter animation (slide-up + fade); Material-standard easing curves | **ADOPT (pattern only, own values)** | Adopt the *pattern* — a slide-up+fade enter for sheet content/toasts, and standard ease-out curves — but **choose Fastship's own duration/easing values**; do not copy Uber's exact 400 ms / specific beziers (those are parameter values). One Reanimated `enterFromBottom` preset with Fastship-tuned timing. |

---

## 5. Map capability reference

The **100-item map capability inventory** is
`docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md`; map/UX gap
detail is `docs/REVIEW-2026-11-02-map-ux-vs-uber.md`; map-specific UI chrome is
§6 of the UI study. Key adoptable items (from the canonical brief): camera-intent
model, padding-from-chrome, marker slots + z-order, alpha-divider (traveled vs
remaining), epoch-stamped vehicle glide, pickup access points, per-stage layer
recipes.

---

## 6. Evidence index

**Decompile (read-only, local):** `%LOCALAPPDATA%\Temp\opencode\uber\rea-full`
— 12,236 dirs, 239 `com.ubercab` + 721 `com.uber` pkgs, 2,822 layouts, 6,340
drawables, full `res/values`. Route census independently verified: **1,030
unique `/rt/` literals** (matches the ~1,032 census).

**Fastship UI screenshots (for visual reference during implementation):**
`.screens/states-out/en/` (44 PNGs) and `.screens/states-out/ar/` (45 PNGs) —
per-screen, both languages. Use these to match Fastship's current visual
language; do **not** copy Uber artwork.

**Source studies (all in `docs/`):**
- `REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` — canonical brief (BUG-1/2/3/4, a11y, map gaps) ← **start here**
- `REVIEW-2026-11-02-map-ux-vs-uber.md` — map/UX detail
- `KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md` — 100-item map inventory
- `KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` — API/backend contracts (this session, verified)
- `KNOWLEDGE-2026-11-02-uber-rider-ui-layer-architecture-study.md` — UI layer (this session, verified)
- `docs/rea-work/LEDGER.md` — work ledger, model routing, verification log
- Prior reference set: `KNOWLEDGE-2026-11-01-…` and `KNOWLEDGE-2026-10-31-…`

---

## 7. Legal guardrails (must hold throughout implementation)

1. **No proprietary substance.** Port concepts/state-names/field-semantics/
   layout-slots/token-structure only. Never decompiled Java, artwork, drawables,
   tiles, parameter values, or proprietary identifiers.
2. **No contact.** This was static analysis of a local decompile; do not add any
   runtime dependency on Uber systems, endpoints, or assets.
3. **Independent expression.** Implement every adopted pattern in Fastship's own
   code, style, and naming. The value is the *idea*, not the source.
4. **Attribution-free.** Do not reference "Uber" in shipped code, comments,
   assets, or user-facing strings.

---

## 8. Implementation order (suggested, smallest-risk-first)

1. **Re-confirm the gates green:** `node tests/google-routing.test.mjs` and
   `node tests/map.test.mjs` → both pass.
2. **BUG-1** (failing test) → `google-map-lifecycle.test.mjs:183` goes green.
3. **BUG-3** (stale-fade) — small, self-contained.
4. **NEW-1** (foreground-bounce refetch) — touches the billing gate; verify
   server-side billing impact first, then fix the path-reset.
5. **NEW-2 / NEW-3** — state-consistency + heading convergence.
6. **BUG-2** (iOS pin-confirm) — three-part fix; confirm on device.
7. **Accessibility cluster** (from the canonical brief).
8. **High-leverage patterns:** TTL quote cache → typed error envelope + request
   UUID → live-stream envelope → design-token/spacing scale.
9. **Re-run both gates + the full device acceptance on the physical phone.**

---

## 9. Honest "not checked / not verified" list

- **Billing impact of NEW-1/NEW-2** is *not* established from client code —
  requires server-side confirmation.
- **BUG-2** MapKit refit magnitude is inferred, not measured (test device is
  Android). **[needs device]**
- **Full test suite** was not run here (needs live PostgreSQL
  `WIND_TEST_DATABASE_URL`); only the two gate suites + `google-map-lifecycle`
  were run. Run the full suite on the designated host before shipping.
- **Uber `values-night` colour overrides, Uber Move font files, Lottie raw
  assets, menu/mipmap resources** were not opened.
- The exact RIB that inflates the home-map layout is **[U]** (children attached
  programmatically).
- **Runtime/device behaviour** of the map layer remains unverified beyond the
  unit-level gates; visual impact of NEW-3 is unquantified.

---

*Prepared via multi-agent REA (GLM 5.2 UI · Kimi K3 API/backend · GPT-6.1-Sol
bug sweep + independent verification at medium/high effort). Read-only
throughout; no app code was changed.*
