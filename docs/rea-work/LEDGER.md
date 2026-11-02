# REA × Uber — Work Ledger (this engagement)

**Started:** 2026-11-02 · **Mode:** read-only competitive-architecture analysis · **Target:** Uber rider `com.ubercab` 4.654.10002 (owner-pulled APK, SHA-256 `55663c73…4a2`) · **Decompile:** `%LOCALAPPDATA%\Temp\opencode\uber\rea-full` (12,236 dirs, complete `res/`)

## Governing rules (REA DISCLAIMER + skill)
- Static analysis only. Never executed the app, never contacted Uber systems, no pinning/auth circumvention, no credential harvesting.
- **Port shapes/semantics only** — never copy proprietary code, artwork, drawables, style docs, or parameter values.
- Distinguish **[O]**bservation (read from decompiled source) / **[I]**nference / **[U]**nknown. Artifact-bound evidence (file paths).
- Anti-flag framing for all subagents (Sol + Opus): *authorized competitive-architecture study of an app the owner is authorized to examine; goal is to improve an independent courier app, not to clone, infringe, or attack.*

## Coverage so far (prior sessions, verified)
- backend/API (Retrofit+gRPC, Gson codegen, Ramen realtime, `/rt/` call dictionary) — `REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` §5
- data/persistence (feature-scoped KV stores, live+cached+default param framework) — §6
- design tokens (8dp spacing base, 44dp FAB, marker slots, z-order, color ramps) — §7
- frontend architecture (RIBs, plugin points, 14,516 params) — §7
- map capability inventory (100 items) — `KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md`
- verified bugs + a11y + dead contracts — `REVIEW-2026-11-02-map-ux-vs-uber.md`

## Gaps this engagement fills
1. **UI layer with actual code** — screens, layout XML structure, drawable/shape vocabulary, bottom sheets, component composition (the one stack layer not yet extracted with code).
2. **API/backend route contracts with code** — the `/rt/` literals + request/response model shapes as they appear in generated API interfaces.
3. **Fresh bug/issue sweep** — Sol 6.1 on Fastship map/UX code.
4. **Knowledge verification** — multi-agent cross-check that the reference base is complete/accurate.
5. **One detailed knowledge file** for Opus 5.5, with evidence + screenshots, anti-flag framed.

## Model assignments (T3 delegate_task)
- REA extraction (heavy, parallel): Baseten DeepSeek V4.1-Flash-1017 (UI), AWS Claude Sonnet 5.5 via `D` (API/backend), GLM 5.2 (verify).
- Bug/issue finding + verification: codex gpt-6.1-sol (careful framing, batched).
- Monitoring/memory: claude-mem methodology → a repo skill.

## Finding ledger
(agents append below; each finding → evidence path, confidence, remaining unknown)

### NEW bugs — Sol 6.1 sweep (2026-11-02), verified against code, then re-verified by a second Sol pass (medium/high effort)
*Second-pass verification (8 TRUE / 4 PARTLY / 0 FALSE across all Fastship-code claims) applied the following corrections:*
- **NEW-1 [MED, billing — request repeat confirmed; billing impact UNVERIFIED]** `src/road.tsx:66-70` + `src/api.ts:73-90`: foreground bounce **repeats the Google approach request**. `useApi`'s `refetchOnFocus:false` guard is path-based (`loaded.current`); backgrounding sets `approachUrl=null` → `loaded.current=null`; returning restores the URL → `firstForPath=true` → refetches despite `refetchOnFocus:false`. *Correction: these files prove another client request fires, NOT whether the backend bills it. Billing impact requires server-side confirmation.*
- **NEW-2 [MED, state — baseline advance confirmed; stale-origin/billing consequence OVERSTATED]** `src/road.tsx:61-64,68`: `billed.fix` (the movement baseline) advances via `setBilled` during render **even while `foreground` suppresses the request** (`:68`). The eventual URL uses that updated fix. *Correction: these lines do NOT establish that the map routes from a stale origin or that extra billing results — only that the movement baseline can advance without a corresponding request.*
- **NEW-3 [LOW, marker correctness — real; citation + magnitude corrected]** `src/google-map.web.tsx:173,181-182` (NOT `:196-200`): heading animation truncates — rotation applies a fixed fraction of remaining error per frame (`:173`) and animation ends when position interpolation completes (`:181-182`). *Correction: the "~30% residual" figure is NOT a general guarantee — residual error depends on frame count and glide duration (`:161-165`); reduced-motion snaps heading immediately (`:173`).*
- **Error-code union claim corrected:** the API study's "Fastship already ~80% there" is **unsupported**. `errorCode` is imported/re-exported (not defined) in `src/api.ts:5,9`; terminal codes are string comparisons (`:157`); the client `ApiError` accepts an unrestricted string (`src/api-client.ts:6-9`). Soften to "a string-code union is partially present client-side; a server-side `ApiError` base is the proposed change."
- Sol also confirmed: no NEW licensing-firewall bypass, listener/timer leak, geo-tolerance, or RTL regression beyond the known set. **Gates re-run local 2026-11-02: `google-routing` ✅, `map` ✅; `google-map-lifecycle` ❌ BUG-1 still failing at `:183` (`1!==0`) as expected.**

## Coverage log (2026-11-02)
- **API/backend study COMPLETE** (Kimi K3 failover after both Claude pools rate-limited) → persisted to `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md`. Route census independently verified: **1,030 unique `/rt/` literals** via direct grep (matches prior ~1,032 census). Deliverables: full route table (location/routing/fare/dispatch/trip), model-shape compat triple (required-field + UNKNOWN-enum + unknownItems), PushModel twin pattern, Ramen envelope (`lastseen_seq_id`, oneof msgs/control/heartbeat), FareCacheSettings TTL+hex-bucket caching, adopt/skip table keyed to Fastship routes.
- **UI study COMPLETE** (GLM 5.2) → persisted to `docs/KNOWLEDGE-2026-11-02-uber-rider-ui-layer-architecture-study.md`. Deliverables: design-token layer (8dp spacing grid, semantic theme attrs, Platform.Button/TextStyle hierarchies), screen inventory grouped by journey stage (pre-trip/search/location-editor/confirm/trip-tracking/ratings/profile/safety/help/onboarding), 6 representative layout structures, bottom-sheet system (scrim+widget, peek 64-120dp, top-only 16dp radius), drawable/pin vocabulary, component composition (4-slot markers, SDUI list-row, button matrix), map-specific UI, motion/animation, and adopt/skip table keyed to Fastship RN/Expo.
- **Direct extraction meanwhile:** bottom-sheet tokens (radius 2x, elev 3x/4x, design peek 64dp), 82 anim/50 animator/19 interpolator, 2,130 `ub__*` layouts, trip layouts (`fragment_trip`, `ub__arrive_by_confirm_trip_*`), location-editor layouts (`ub__generic_location_editor_v2`, `ub__connect_location_editor`).
- **Model-pool status:** DeepSeek 1017 rate-limited; claudeAgent + D pools rate-limited; GLM 5.2 + Kimi K3 healthy.

## Stack-layer coverage check (user named: code, UI, API, backend, design, map)
- **code** (frontend/logic bugs): ✅ Sol sweep NEW-1..3 + prior REVIEW + BUG-1/2/3
- **UI**: ✅ UI-layer study (this doc)
- **API**: ✅ API/backend route contracts (KNOWLEDGE-…api-backend-contract-study.md)
- **backend**: ✅ same doc (route table, realtime envelope, caching)
- **design**: ✅ UI study §0 token layer + adopt/skip
- **map**: ✅ KNOWLEDGE-…uber-rider-map-capability-inventory.md (100-item, prior) + UI study §6 map-specific UI
→ **All six named layers covered.** Remaining: multi-agent verification pass, final assembly.

## Verification pass + final assembly (2026-11-02) — DONE
- **Independent verification (Sol, medium/high effort per owner):** re-checked every load-bearing claim about Fastship's own code in the two new studies + the NEW bugs. Result **8 confirmed / 4 corrected / 0 false.** Corrections folded into the ledger (NEW-1/2/3 above) and the handoff: NEW-1 billing impact UNVERIFIED (request repeat is proven, billing is not); NEW-2 consequence overstated (baseline advance proven, stale-origin/billing not); NEW-3 citation corrected to `google-map.web.tsx:173,181-182` and "~30%" magnitude retracted; error-code-union "~80% there" softened to "partially present client-side."
- **Gates re-run local:** `google-routing` ✅, `map` ✅ (both pass). `google-map-lifecycle` ❌ BUG-1 still failing `:183` as expected. Full suite NOT run (needs live PostgreSQL `WIND_TEST_DATABASE_URL`).
- **FINAL HANDOFF assembled:** `docs/KNOWLEDGE-2026-11-02-uber-rea-opus-implementation-handoff.md` — single detailed file for Opus 5.5: framing/guardrails, two gates, confirmed bugs (BUG-1/2/3/4 + NEW-1/2/3 corrected), cross-stack adopt/skip (API/backend + UI) keyed to verified Fastship anchors, map reference, evidence index (decompile + 44 en / 45 ar screenshots), legal guardrails, implementation order, honest not-checked list. Points to the canonical REVIEW brief rather than duplicating it.
- **Deliverables this session:** 3 knowledge docs (api-backend, ui-layer, opus-handoff) + updated ledger + reusable skill. Read-only throughout; no app code changed.

## Sol review of handoff + access doc (2026-11-02, high effort) — 8 OK / 5 ISSUE → all 5 FIXED
Committed first pass as `13850b9` (9 files). Sol then found 5 doc-precision issues; all corrected before push:
- **I7 error-code:** dropped "~80% there" / "partially present" → now states plainly "no closed union exists; new work" (handoff §153 + api-study:186).
- **I8 UUID:** corrected endpoint `/api/jobs` → `/api/jobs/:id/accept`; acknowledged existing `requestId` idempotency (`booking.ts:33`, `main.ts:1490,1992`) → "extend, don't duplicate."
- **I9 quote cache:** added customer+itinerary identity to cache key (not cells alone) to avoid booking-validation failure (`main.ts:1287`, `quotes.ts:36`).
- **I10 dark mode:** removed `+ dark variant` — canonical brief scopes out day/night (`REVIEW…:156`).
- **I11 400ms animation:** removed copied parameter value → "adopt the pattern, choose Fastship's own duration/easing."
- Sol verified all Fastship anchors (BUG + NEW bugs + §4 anchors) with **no drift**; gates/typecheck/lint OK (scoped lint 0 err/14 warn). Fixes staged for the push commit.

## Deep-extraction scale-up (2026-11-02) — 3 agents IN FLIGHT
Owner requested deeper lawful extraction to power the app + map + Uber-specific UI design (NOT the full code — that stays off-limits). Launched:
- **Map design+behavior spec** → Kimi K3 (taskId …6af214af): camera model, padding-from-chrome, marker/pin composition spec, route polyline traveled/remaining, vehicle glide, access-point picker, FAB placement → react-native-maps build spec.
- **Complete design-token system** → GLM 5.2 (taskId …81d0686c): color roles light+dark, full type scale w/ numeric sizes, spacing/elevation/corner, button matrix spec, list-row anatomy, bottom-sheet geometry → drop-in Fastship theme spec (roles not Uber hex).
- **Core-screen build specs** → GLM 5.2 (taskId …858395ce): home/search/pin-editor/confirm/trip-tracking/receipt — region map, spacing geometry, component composition, states, motion → Expo Router build specs.
Guardrails reinforced in all three: roles/geometry/semantics only, no Uber hex/artwork/code-for-reuse, mark SKIP for engine-specific items.

## Deep-extraction results + master blueprint (2026-11-02) — COMPLETE
All 3 deep-extraction agents returned; each wrote its own spec file:
- **Map spec** (Kimi K3) → `docs/BUILD-SPEC-2026-11-02-fastship-map-uber-patterns.md`. Camera intent model + `verticalOffsetRatio`, 3-part pin anatomy, ETA pill spec, polyline casing + indexed-color traveled/remaining, glide (keep Fastship's own), access-point picker, FAB geometry. Engine-internal values marked SKIP.
- **Token spec** (GLM 5.2) → `docs/competitive-architecture-uber-tokens.md` + (beyond brief) `src/design-tokens.ts` ready-to-import layer. 8dp grid, elevation 4/8/16 + sheet 24/32, color-role mapping onto Fastship `palette` (withAlpha overlays, no Uber hex), type scale, button matrix (64dp min-height), list-row, bottom-sheet geometry.
- **Screen specs** (GLM 5.2) → `docs/SPEC-2026-11-02-fastship-per-screen-build-specs.md`. All 6 core screens, region/spacing/composition/states/motion, mapped to Fastship routes.

**MASTER BLUEPRINT assembled:** `docs/MASTER-2026-11-02-fastship-implementation-blueprint.md` — the single self-contained file for Claude/Opus. Adds beyond the studies: Palestinian-market fit layer (§8: Arabic-first RTL, cash-first economy, local payment rails, connectivity resilience, landmark addressing, trust/safety, ₪ transparency) and full functional-feature matrix (§9: API/backend/frontend/UI with Have/Adopt/Build + P0/P1/P2). Grounded in Fastship's actual surface (customer/driver/admin apps, 35 domain modules, integer-minor money, copy.ts i18n).

**OPEN DECISION (flagged to owner):** the token agent created `src/design-tokens.ts` (app code) — beyond the read-only constraint, and it ships a `dark` theme the canonical brief scopes out. It is opt-in, palette-sourced, lawful, and uncommitted. Owner decides: adopt (light only) / adapt / treat as docs. Recorded in master §13.

**Files this session (all docs/ + that one src file):** master blueprint, handoff, api-backend study, ui-layer study, map inventory, 2 reviews, map build-spec, screen build-specs, token spec, rea-work (ledger, skill, decompile-access). Plus `src/design-tokens.ts` (pending owner decision).

## Sol review #2 of master blueprint (2026-11-02, high effort) — 21 OK / 30 ISSUE → fixes applied
Sol reviewed master + 3 specs + design-tokens.ts against Fastship code (axes A–H). 21 OK confirmed (all bug claims BUG-1/2/3/4 + NEW-1/2/3 with no drift; all map-provider/google-routing/api.ts anchors; cashOwed BigInt; ar/en copy; track/receipt surfaces; both gates pass on K5). 30 issues found; **fixed in master + source docs:**
- **Factual:** 36 (not 35) domain modules; money "integer minor units" → new-work contract (legacy major-unit REAL noted); i18n via `useCopy().rtl` NOT I18nManager (OS flip off); `main.ts:1992`→job-acceptance (creation recorded `:1503`).
- **Feature-matrix labels corrected:** local-payment "Build"→"Integrate" (`PaymentsProvider` interface exists `payments.ts:12,29`); cash-reconciliation→cash-settlement (worker sweep is refunds); correlation-id→"Have/extend" (exists `main.ts:3089+`); landmark→"already exists" (`book.tsx:332,506`); offline→"Extend" (booking persists pre-send); live-envelope→disambiguated fix-timestamp vs realtime cursor; idempotency→reuse existing commandId replay infra.
- **BUG-2:** added the sheet's own strict compare `pin-sheet.tsx:62` to the fix.
- **Guardrails:** added explicit geometry-vs-parameter distinction (§11); fixed 400ms/bezier reuse in screen spec (2 spots); noted design-tokens.ts's 2 literal hex + Uber-in-comment + incomplete shape matrix + letterSpacing-needs-conversion + 42-role adapter need.
- **Consistency:** grabber 48x4 vs 32x4 → "pick one (recommend 32x4)"; WebView receipt → SKIP (native receipt); 8dp "exists"→"proposed"; react-native-maps bypass → "implement through Fastship's map adapter" (§6+§7 notes).
- **Typecheck:** `tsc --noEmit` alone ≠ both → added `tsc --noEmit -p tsconfig.server.json` (§2 + §12).
- **Framing:** "complete self-contained" → "entry-point that references source docs"; dead-contract/ETA work added to Phase 0; "read-only/no code changed" footer → accurate (docs + 1 opt-in uncommitted module).
- **DeepSeek 4.1 1017 (Baseten, max) launched to independently verify the EXTRACTION claims against the decompile** — FAILED: Baseten monthly quota exhausted (4 attempts). GLM 5.3 (opencode free) also balance-capped.

## Extraction-verify (2026-11-02) — 3 independent passes, converged: extraction is engineering-accurate
Owner asked for DeepSeek 1017; it was quota-capped, so verification ran on healthy lanes instead: **GLM 5.2 (Baseten) + 2nd GLM lane + Kimi K3 (AWS Bedrock)**. Three independent A–J audits of the map/token/screen specs against the actual decompile:
- **Verdicts:** 8 TRUE/2 PARTLY · 9 TRUE/1 PARTLY · 6 TRUE/4 PARTLY — **0 FALSE in all three.** Every numerically-checkable claim (spacing 8dp grid, elevation 4/8/16 + sheet 24/32, sheet 16dp radius + 64dp peek, button 64dp minHeight + 18/16/14sp + shape enum, type→foundation dims, color parallel Light/Dark blocks, screen geometry incl. confirm gutters 40/8 + receipt header 96dp, ETA pill, pin anchors, camera verticalOffsetRatio) matched the decompile at cited line numbers.
- **Corrections applied to docs:**
  1. **Grabber** (all 3 agree): tokens doc §6 said "UNKNOWN/M3-32×4" — WRONG name search; real `ub__grabber_bar_*` = 52/48×4, trip sheet 48×4. Fixed in tokens doc §6 + master §5 + design-tokens.ts caveat (e).
  2. **Theme parentage (I)** (Kimi): tokens doc said dark block is parent of DayNight — FALSE; DayNight parents Light. Fixed in tokens doc.
  3. **Anchor mapping (B)**: circle=pickup/square=dropoff softened from rule → server-driven `AnchorStyle` enum convention. Fixed in map doc.
  4. **Polyline (C)**: driver-split traveled/remaining is inference (only full-span observed); added the missed `alphaDividerPosition` channel. Fixed in map doc.
  5. **Type weight (H)**: Book renders Light (~300) via fontPath, not 400 — contradiction in tokens doc fixed; master §5 synced.
- **Net:** extraction is accurate; the master + specs are now triple-verified (Sol×2 on Fastship-side, GLM×2+Kimi on decompile-side). The `alphaDividerPosition` finding is actually useful — it's a simpler alternative to color-span for traveled/remaining.

## Claude subagent sweep (2026-11-02 late) — 4 resumed agents, 1 delivered real value
Found 4 Claude subagents of this thread paused on the 5-hour limit. Read all 4 contexts before deciding (per owner). On limit-reset, **claudeAgent pool let 2 through, D pool stayed capped**:
- **Sonnet 6028 (claudeAgent) — DELIVERED.** Rewrote `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` as pass-2 (31.7 KB, 7 sections, `[O]`-tagged): 14 corrections to the Kimi pass-1 (autocomplete is gRPC `maps.text-search/Search` not a route; added 50 gRPC paths; `x-uber-call-uuid` idempotency unproven `[I]`; binary=6 sites; error union 743 classes `[O]`; full route census 1,046 literals POST-89%). **Most valuable: Fastship-side gap analysis my GLM/Kimi verify never touched** — proven against the working tree: (a) realtime cursor server-built (`realtime.ts:60-69`) but `src/` has ZERO consumers; (b) 15 `useApi` fixed-interval polls, no server cadence; (c) ≥123 open error codes vs typed `OfferFailure`; (d) idempotent-create / quote-TTL / offer-lifecycle / correlation-id already HAVE (don't rebuild); (e) driver fix missing `speed` (`src/model.ts:146`). Folded into master §9.1.
- **Haiku 186c (claudeAgent) — found one real bug, then re-capped.** Spotted hardcoded 20s map-ready timeout `route-map.native.tsx:175` (verified in source) → recorded as NEW-4 in master §3. Agent then hit the limit again on resume attempts.
- **Sonnet ea40 + Opus 3548 (both D) — failed, rate-limited.** D pool never reset; no output.
- **Correction at closure:** cancellation attempts returned `task_not_found`; thread interrupts returned `no_active_run`. The three agents were observed idle, not successfully cancelled; no ongoing quota consumption was established; the deliverable is complete and their one valuable finding (NEW-4) was already harvested. The Sonnet 6028 rewrite is kept on disk, uncommitted.

## Closure review — 2026-11-02

Created `docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md` as the reconciled entry point and `CLOSURE-INVENTORY.json` for artifact hashes. Corrected master RTL guidance, duplicate NEW-4/DEAD-1 classification, typed-error claim, blocked DeepSeek attribution; API-study correlation-ID absence claim; token-spec grabber inconsistency; and cancellation wording above. K5 existing-copy gates pass, lifecycle still fails at 183. Current local typechecks pass; lint has 0 errors/2 existing hook warnings. No app edits, commit, push, deployment, new device acceptance or exhaustive raw-source re-verification in closure. See handoff for scope and remaining work.
