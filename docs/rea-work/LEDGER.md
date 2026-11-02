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
