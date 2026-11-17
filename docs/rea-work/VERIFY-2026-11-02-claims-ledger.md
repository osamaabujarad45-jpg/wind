# Claims verification ledger — 2026-11-02

## Current implementation status — 3 November 2026

**Subsequent quality review:** [The 43-requirement assessment](../../reports/app-quality-review-2026-11-03.md) reconciles the knowledge report with current product scope, capabilities, provider gates and operating unknowns. Offline recovery/cache/session fencing, admin busy serialization and native labels were repaired. Final product code passes 105 integration suites, both typechecks, warning-free lint, fresh Android/iOS JS exports and 26 rebuilt browser journeys on K5. Bounded load passes all 14 gates; 525 archived inputs outside docs/reports/tasks match on both machines. No claim of full Uber parity, physical acceptance or production-provider readiness follows from these checks. The original research tables below remain historical.

The tables below retain the original research verification results and historical line numbers. **VERIFIED means a claim was reproduced; it does not mean the defect was fixed.** This checkpoint reconciles the affected claims with the current source, the [first implementation pass](../../reports/handoff-implementation-2026-11-03.md) and the [remaining-work completion record](../../reports/handoff-completion-2026-11-03.md).

| Claims | Current result | Evidence |
| --- | --- | --- |
| A1 / BUG-1 | Fixed in source: Android stores `expectedCenter` before returning during loading. The old initial-city message is rejected while the latest GPS target crosses the bridge. | `src/route-map.android.tsx`; the original failing assertion and gesture/echo regressions now pass in `tests/google-map-lifecycle.test.mjs`. |
| A2 / BUG-2 | Pre-ready target tracking and gesture cancellation are repaired. Native adapters and the sheet now expire pending positioning without enabling confirmation, and retain manual recovery. Strict `> 0.000001` tolerance remains unchanged pending physical iOS calibration. | Native/sheet lifecycle checks cover timeout, completion, cancellation and manual recovery. Arabic/English positioning-failure copy is present. No physical iOS acceptance is claimed. |
| A3 / BUG-3 | Fixed in source: the stale-opacity effect includes `driverKey`. | `src/route-map.tsx`; regression rebuilds a stale dot as an arrow, checks its fade, then checks recovery. |
| A4 / BUG-4 | Versioned delivery implemented: Android requests `/map/v1/map.html` with a bounded 24-hour shell cache. `/map.html` remains supported. Content validators handle revalidation and compressed updates. Physical WebView acceptance remains open. | HTTP cache tests and K5 Chromium cold/warm/revalidation checks pass. Cached HTML availability does not prove offline map tiles. |
| A5 / NEW-1 | Fixed in source: background/foreground bounces preserve the requested Google approach URL and its pending response. The shared `useApi` contract is unchanged. Historical paid-provider billing impact remains unproven. | `tests/road-focus.test.mjs` executes the actual hooks: the original four requests across three bounces become one; an in-flight response remains usable. |
| A6 / NEW-2 | Fixed in source: background fixes do not advance the routing baseline; a changed order/driver/stop is fenced, and background mounts wait for visibility. | The routing regression checks full displacement from the last foreground request, latest-fix selection, changed-order deferral and unchanged baseline-provider refresh. |
| A7 / NEW-3 | Fixed in source: heading uses elapsed time and the shared shortest-turn helper. | `src/google-map.web.tsx`; two frame schedules finish at the same heading, including 350°→10°. |
| A8 / NEW-4 | Fixed in source: route/pin maps, the SDK loader and Android page consume the validated `mapReadyTimeoutMs` value. | Lifecycle/loader tests use a non-default 7-second deadline; map-fragment tests cover accepted bounds and invalid values. |
| B1–B5 | Billing, map, lifecycle and both TypeScript checks now pass. B3's recorded failure below remains the baseline reproduction, not the current result. | K5 results and source hashes are retained with the [completion evidence](../../reports/handoff-completion-2026-11-03.md). |
| B6 | Lint now passes with zero errors and zero warnings. | Same final run record; explicit coordinate fields resolve the native dependency warnings. |
| A9–A30 and C1–C14, except the A/B updates explicitly listed above | Original research evidence retained. No new complete audit of these claims or recount of the reference artifact was performed in this implementation pass. | Historical tables and independent review below. C11/C12 remain method-dependent; A14 remains approximately 200 rather than an exact cross-method count. |

Additional implementation evidence: the remaining-work pass has **104 integration suites**, all **52 persistence suites plus 22 PostgreSQL legacy suites**, corrected **26 browser journeys**, and Android/iOS JavaScript/assets exports passing on K5. The last one-line GPS cancellation correction passed focused map gates, both typechecks, warning-free lint, fresh exports and the rebuilt journeys with zero unhandled browser errors. All **519 tested-input hashes** match after verification; exact run chronology is in the completion report. These checks do not substitute for physical acceptance: the attached A53 is held by another device session and no physical iOS device is available.

The first reconciliation was documentation-only. The subsequent remaining-work pass implements A4/A5/A6 and the A2 deadline above; its exact final source hashes, test runs and remaining hardware limits are recorded in the completion report. The original tables below continue to describe the research baseline.

---

Every claim in the handoff set, reproduced against the working tree (Fastship side) and the
decompile (Uber side). Status: **PENDING** until a check is run and cited.

Method:
- Fastship claims → grep/read the exact file+line; run the named test; record result.
- Uber claims → grep/read the exact decompile path; record [O]/[I]/[U].
- Each row gets: CLAIM | SOURCE-OF-TRUTH | CHECK RUN | RESULT (VERIFIED / WRONG / PARTIAL) | EVIDENCE.

Legend: ✅ VERIFIED · ❌ WRONG · ⚠️ PARTIAL · ⏳ PENDING

---

## A. Fastship code anchors (grep-verifiable)

| # | Claim | Anchor | Status |
|---|---|---|---|
| A1 | BUG-1: early return before storing expectedCenter | `route-map.android.tsx:47-53` (loading return precedes `:50` store); test `:176-188` | ✅ VERIFIED (line range refined from :44-56) |
| A2 | BUG-2: strict compare in renderer + sheet | `route-map.native.tsx:188` `>0.000001`; pendingCenter cleared `:189` | ✅ VERIFIED (native side; sheet + google-map.native pending fresh-context check) |
| A3 | BUG-3: stale opacity lost | `route-map.tsx:272-287` — effect deps `[map,props.stale,lineKey,moved]` lack `driverKey`; marker rebuilt at `:268` on `driverKey` change but opacity not re-set | ✅ VERIFIED |
| A4 | BUG-4: map.html from API | `route-map.android.tsx:17` `PAGE = ${API_URL}/map.html` | ✅ VERIFIED |
| A5 | NEW-1: foreground bounce refetch | `road.tsx:66-70` — `foreground` false → `approachUrl=null`; return → URL restored → useApi refetches (path-based loaded nulled) | ✅ VERIFIED (request repeat). Billing impact UNVERIFIED by design |
| A6 | NEW-2: baseline advances while backgrounded | `road.tsx:61-64` — `setBilled` runs in render whenever driver moves ≥threshold, regardless of `foreground` (`:68` only suppresses the URL) | ✅ VERIFIED |
| A7 | NEW-3: heading truncates | `google-map.web.tsx:173` fixed `16/500` fraction per frame; `:181` ends on position `k<1` — different completion conditions | ✅ VERIFIED |
| A8 | NEW-4: 20s literal vs runtime-config | `route-map.native.tsx:68,175` (TWO literals) vs `runtime-config.ts:4` `mapReadyTimeoutMs` | ✅ VERIFIED — and there are TWO literals, not one |
| A9 | canShowOnRenderer firewall | `src/map-provider.ts:97` | ✅ VERIFIED |
| A10 | shouldReroute billing gate | `server/domain/google-routing.ts:117`, `GoogleRoutesErrorCode:135` | ✅ VERIFIED |
| A11 | realtime cursor server-built | `server/domain/realtime.ts:60` `issue(...)` cursor `:62`, REALTIME_TTL `:13` | ✅ VERIFIED |
| A12 | realtime client has ZERO consumers | `src/` grep for realtime/eventCursor/snapshotPath | ✅ VERIFIED — 0 hits |
| A13 | ~15 useApi fixed-interval polls | 28 useApi call sites; ~15 carry numeric pollMs (10s/15s/30s/60s); all hardcoded | ✅ VERIFIED — "~15 fixed, no server cadence" holds |
| A14 | error codes | `fail(\d+,'code')` grep: **196 distinct / 645 sites** (server/main.ts + domain); broader scope sites=944, distinct still 196; Kimi K3 fresh-context recount: **203 distinct / 663 sites** | ⚠️ RESOLVED — "~123" was wrong; real = **~200 distinct** (method-dependent floor, 196–203). Only 2 typed. Docs updated to "~200 distinct". |
| A15 | OfferFailure typed | `server/domain/journey.ts:70` `offerFailure(...)` | ✅ VERIFIED |
| A16 | GoogleRoutesErrorCode closed | `server/domain/google-routing.ts:135` | ✅ VERIFIED |
| A17 | HttpError/fail() base | `server/main.ts:187` class, `:191` fail() | ✅ VERIFIED |
| A18 | correlation IDs exist | `server/main.ts:3089,3161,3200` | ✅ VERIFIED (from prior pass) |
| A19 | driver fix has heading, no speed | `src/model.ts:146` heading present, speed absent | ✅ VERIFIED |
| A20 | idempotent create order_commands | `main.ts:17` SELECT order_commands, `:1292,1294` replay | ✅ VERIFIED |
| A21 | offerId + leaseNonce accept guard | `journey.ts:28-29,74` leaseNonceFor/Hash | ✅ VERIFIED |
| A22 | quote TTL exists | `quotes.ts:6` QUOTE_TTL_MS=120_000, `:191,258,259` | ✅ VERIFIED |
| A23 | PaymentsProvider interface | `payments.ts:12` create/capture/void/refund | ✅ VERIFIED |
| A24 | landmark fields exist | `book.tsx:116,460,654` landmark | ✅ VERIFIED |
| A25 | useCopy().rtl is the RTL source | `ui.tsx:51-56` rtl=language==='ar' | ✅ VERIFIED |
| A26 | journeyProtocol=1 added by client | `src/api.ts:25` appends `journeyProtocol=1` | ✅ VERIFIED |
| A27 | integer-minor money / legacy major REAL | `money.ts:1` "integer minor units"; minorUnits throws on 0 | ✅ VERIFIED |
| A28 | 36 domain modules | count `server/domain/*.ts` = 36 | ✅ VERIFIED |
| A29 | useLiveFix ?since= fix timestamp | `src/api.ts:112,127` `since=${since}` | ✅ VERIFIED |
| A30 | offline booking persists pre-send | `book.tsx:182-190` reconciliation via `/orders/commands/:requestId`; `order_commands` replay (A20) | ✅ VERIFIED (command-receipt persist/replay exists) |

## B. Tests (run-verifiable)

| # | Claim | Command | Status |
|---|---|---|---|
| B1 | billing gate passes | `node tests/google-routing.test.mjs` | ✅ PASS |
| B2 | map gate passes | `node tests/map.test.mjs` | ✅ PASS ("map: ok") |
| B3 | lifecycle FAILS at :183 (BUG-1) | `node tests/google-map-lifecycle.test.mjs` | ✅ CONFIRMED FAILING (`1 !== 0` at `:183`, exit 1) — reproduces BUG-1 as expected |
| B4 | client typecheck passes | `npx tsc --noEmit` | ✅ PASS (exit 0) |
| B5 | server typecheck passes | `npx tsc --noEmit -p tsconfig.server.json` | ✅ PASS (exit 0) |
| B6 | lint 0 errors | `npx expo lint` | ✅ 0 errors, 2 warnings (`center` deps at `google-map.native.tsx:101`, `route-map.native.tsx:167`) |

## C. Uber decompile numeric claims (grep-verifiable)

| # | Claim | Path | Status |
|---|---|---|---|
| C1 | 8dp spacing grid 0x..16x | `dimens.xml:3300-3331` (0x=0,0.5x=4,1x=8,2x=16,3x=24,4x=32,5x=40,8x=64,16x=128) | ✅ VERIFIED |
| C2 | elevation 4/8/16 + sheet 24/32 | `dimens.xml:3153/3155/3156` (low4,med8,high16); `:143/144` (sheet=4x/3x=32/24) | ✅ VERIFIED |
| C3 | sheet 16dp radius + 64dp peek | `dimens.xml:140` radius=2x(16), `:224` peek=64, `:3187` header=96 | ✅ VERIFIED |
| C4 | grabber 48×4 (track_status) + 52/48 generic | `dimens.xml:2139-2143` (52/48×4,r2), `:2984-2986` (track 48×4) | ✅ VERIFIED |
| C5 | button minHeight 64dp | `dimens.xml:3241` `ui__min_button_height_helix`=64dp | ✅ VERIFIED |
| C6 | confirm gutters 40/8dp | `layout/ub__arrive_by_confirm_trip_body.xml:12` begin=5x(40), `:18` end=1x(8) | ✅ VERIFIED |
| C7 | receipt header 96dp | `dimens.xml:3187` `ui__header_height`=96 | ✅ VERIFIED |
| C8 | camera verticalOffsetRatio | `camera/CameraPosition.java:9,20,37` field+copy | ✅ VERIFIED |
| C9 | polyline fill+stroke casing | `PolylineV2ColorPalette.java:11,15,17` fillColors+strokeColor+"at least one" | ✅ VERIFIED |
| C10 | alphaDividerPosition channel | `PolylineV2Options.java:7,15,18,19` alphaDividerPosition+pre/postDividerAlpha | ✅ VERIFIED |
| C11 | route census ~1,030-1,046 /rt/ literals | my grep = **1,030** unique (pass-1 method). Pass-2's 1,046 used a different grep (incl. gRPC variants). | ⚠️ PARTIAL — count is method-dependent; both are floors. Handoff must state method. |
| C12 | error union 743 classes | my grep (`extends w46`) = **839** files. Pass-2 said 743 (different base-class match). | ⚠️ PARTIAL — count is method-dependent; magnitude (~740-840) is real, exact number is not. |
| C13 | DayNight parents Light | `styles.xml:9373` `parent="@style/Theme.Base2Color.Light"` | ✅ VERIFIED |
| C14 | Book=Light~300 via fontPath | `strings.xml:11361` `ub__font_book`=`fonts/UberMoveText-Light.otf` | ✅ VERIFIED |

---

## Independent fresh-context review — Kimi K3 (AWS Bedrock), 2026-11-03

Ran the doubt-driven adversarial pass on the 8 load-bearing Fastship claims + 2 gates.
**Result: 7/8 VERIFIED, 1 count corrected.** Gates re-run by the verifier: google-routing
PASS, map PASS, lifecycle FAIL at :183 (as BUG-1 asserts). Verifier's independent verdicts:

| Claim | Verdict | Note |
|---|---|---|
| BUG-1 loading update not recorded | ✅ VERIFIED | code structure confirmed; test fails at :183 exactly. Honesty note: precise mechanism ("not recorded" vs "recorded-too-late") needs test instrumentation to fully pin; observable outcome matches. |
| Two hardcoded 20_000 timeouts (NEW-4) | ✅ VERIFIED | `route-map.native.tsx:68,175`; `mapReadyTimeoutMs` only in `runtime-config.ts:4`, never imported |
| BUG-3 opacity deps lack driverKey | ✅ VERIFIED | `route-map.tsx:287` deps `[map,props.stale,lineKey,moved]`; element rebuilt by `:268` driverKey effect |
| NEW-3 heading truncates | ✅ VERIFIED | `:173` fixed `16/500` fraction, exponential decay never converges; `:181` ends on position `k>=1` |
| realtime zero consumers | ✅ VERIFIED | grep src/ for realtime/eventCursor/snapshotPath/livePath → 0 |
| error codes 196/645 | ❌→ corrected | verifier got 203/663; my recount pinned 196 distinct stable, sites vary by scope. **Resolved to ~200 distinct (floor).** |
| model.ts:146 heading, no speed | ✅ VERIFIED | has heading + accuracy, no speed |
| useCopy rtl from language==='ar' | ✅ VERIFIED | `ui.tsx:53`; no I18nManager |

**Net after full verification cycle:** every load-bearing claim in the handoff is either
VERIFIED against source or corrected to a method-dependent floor. No claim is left asserted
on a single unverified number. Remaining honest limits: billing impact of NEW-1 unproven
(needs server path), BUG-1 precise mechanism needs instrumentation, decompile route/class
counts are floors.
