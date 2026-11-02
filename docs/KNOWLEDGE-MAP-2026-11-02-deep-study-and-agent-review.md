# Fastship — deep study companion + agent-work review (2026-11-02)

> Read [`HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md`](HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md)
> first — it is the authority and the work order. **This file is the depth behind it.** It
> does two things: (1) maps every piece of deep knowledge the study produced, with a reading
> path and the load-bearing facts in each; (2) records what each automated worker in the
> research session actually delivered and how reliable it is, so you can trust the right
> documents and double-check the right ones.
>
> **Safety frame (keep this true):** the study was an *authorized competitive-architecture
> review* of an app the owner may examine, using static, read-only analysis of a local
> decompile. Its purpose is to improve an **independent** courier app (Fastship). No
> proprietary code, artwork, drawable bytes, or parameter values were reproduced; everything
> is cited as a path or restated as a Fastship-native concept. Build Fastship's own UI,
> wording, motion, colors, and assets. When you borrow a pattern, say what it *does*, never
> whose it is.

---

## 1. Reading path (what to open, in what order, for what)

| If you are about to… | Read | The one thing it gives you |
|---|---|---|
| Fix the first bug (Android map center) | `HANDOFF-…START-HERE` §Current-source-status + `REVIEW-…map-ux-vs-uber.md` | Exact failing assertion + the gesture/stale guards to keep |
| Touch the map camera / pins / polyline | `BUILD-SPEC-…map-uber-patterns.md` | Camera-intent model + pin anatomy + traveled/remaining line spec |
| Restyle any screen | `SPEC-…per-screen-build-specs.md` + `competitive-architecture-uber-tokens.md` | Region geometry + spacing/elevation/type/button/sheet numbers |
| Touch API, realtime, errors, caching | `KNOWLEDGE-…api-backend-contract-study.md` (pass 2) | Route/shape contracts + the verified Fastship-side gaps |
| Understand overall architecture | `KNOWLEDGE-…uber-rider-ui-layer-architecture-study.md` | Screen inventory by journey stage + component composition |
| See the whole backlog at once | `MASTER-…implementation-blueprint.md` | Phased plan + Palestinian-market fit + feature matrix |
| Re-check a claim | `rea-work/LEDGER.md` + `rea-work/CLOSURE-INVENTORY.json` | Correction history + artifact hashes |
| Look up a raw decompile fact | `rea-work/DECOMPILE-ACCESS.md` | Where the tree lives + grep recipes (cite-by-path only) |

> **Do not** read the raw decompile first. The distilled docs are already verified; go to the
> tree only to settle a specific question the docs leave open, and cite what you find by path.

---

## 2. Confirmed Fastship defects (verified against source, not inferred)

These are the load-bearing facts. Fix in this order; each is independent and testable.

| ID | Fact | Source anchor | Fix shape |
|---|---|---|---|
| **BUG-1** | `MapPage` early-returns while loading before storing the latest expected center | `src/route-map.android.tsx:44-56` | Assign `expectedCenter.current` **before** the `state==='loading'` return. Makes `tests/google-map-lifecycle.test.mjs:183` pass. Keep gesture + stale-message guards. |
| **BUG-3** | A rebuilt web driver marker can lose its stale-fade opacity | `src/route-map.tsx:272-287` | Apply stale opacity at marker creation, **or** add the rebuild key to the `:287` effect deps. One focused regression test. |
| **BUG-2** | Native pin confirm can hang: renderer + sheet both compare the center too strictly | `src/route-map.native.tsx:188`, `src/google-map.native.tsx:121`, **and** `src/pin-sheet.tsx:62` | Loosen tolerance in **both** renderer and sheet, always clear `pendingCenter`, add a positioning deadline. **iOS-device calibrated — do not infer from Android.** |
| **BUG-4** | Android cold-start map page is fetched from the API | `src/route-map.android.tsx:17` | Serve `/map/v1/map.html` with long-lived cache headers. Define the cold-start acceptance scenario first. |
| **NEW-1** | Foreground bounce repeats the Google approach request | `src/road.tsx:66-70` + `src/api.ts:73-90` | Make the "already loaded for this path" guard survive a transient `null` URL. **Billing impact is UNVERIFIED — check server reroute budget first.** |
| **NEW-2** | Movement baseline can advance while backgrounded | `src/road.tsx:61-64,68` | Advance `billed.fix` only when a request is actually made (tie to the `foreground` gate). User-visible effect unproven. |
| **NEW-3** | Web heading animation can truncate (residual depends on frame count) | `src/google-map.web.tsx:173,181-182` | Converge heading on the same completion condition as position, or snap at glide end. Reduced-motion already snaps. |
| **NEW-4 / DEAD-1** | The map-ready deadline exists as a setting but implementations use literals | `src/runtime-config.ts` (`mapReadyTimeoutMs`) vs `src/route-map.native.tsx:175` (literal `20_000`) | Wire the **one** existing setting through loader, WebView config, and test stubs. Not two defects. |

> **Two gates must never regress** — run after every map/routing batch:
> `node tests/google-routing.test.mjs` (billing) and `node tests/map.test.mjs` (licensing
> firewall `canShowOnRenderer`, `src/map-provider.ts:97-101`). Both pass today.

---

## 3. Map knowledge (build spec — patterns, not code)

Source: `BUILD-SPEC-…map-uber-patterns.md`. Adopt through Fastship's **existing map adapter**;
never a bare MapView, and always keep the provider boundary intact.

- **Camera intent model.** Treat the camera as an immutable value (`center, zoom, tilt,
  heading, verticalOffsetRatio`). To keep content visible above a sheet, change only the
  **vertical offset ratio** — do not change zoom. Drive fit-bounds padding from live chrome
  (sheet) height at runtime.
- **Pin anatomy.** A pin is three composed parts: a callout pill, a content row (lazy slots:
  leading icon / title / subtitle / trailing), and an anchor. Circle anchor ≈ pickup, square ≈
  dropoff — but treat this as a **convention, not a rule** (the source maps anchor style per
  case). ETA pill: large value + small caps unit.
- **Traveled vs. remaining route.** Two viable mechanisms: (a) recolor the line at the
  driver's position via an indexed color span, or (b) an **alpha-divider** that fades the
  traveled portion. The alpha-divider is simpler; the driver-split usage is inference, so own
  the choice.
- **Vehicle glide.** Keep Fastship's own easing; do not copy a duration/bezier. Snap instantly
  under reduced-motion.

## 4. Design-token knowledge (numbers — Fastship palette, not brand hex)

Source: `competitive-architecture-uber-tokens.md` + the unapproved draft `src/design-tokens.ts`.

- **Spacing** — 8 dp base grid, `0x…16x` (0, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64, 96, 128).
  Two legacy off-grid values exist; ignore them.
- **Elevation** — component ladder 4 / 8 / 16; the **bottom sheet sits off that ladder** at 24
  (normal) / 32 (high).
- **Bottom sheet** — 16 dp top corner radius, 64 dp min peek, grabber **48 × 4 dp** (the
  corrected value; not the 32 dp Material default), wire scrim opacity to open fraction.
- **Buttons** — min-height 64 dp across all sizes; label sizes 18 / 16 / 14 sp; vertical
  padding 16 / 16 / 8 dp; shapes pill / circle / square (rect exists, unused).
- **Type** — compress to the roles you actually use (Display / H1–H6 / Label L·D·S / Body
  L·M·S / Paragraph). Weight lives in the font, not a weight attribute: a **light display cut
  (~300)** for large display, 400 body, 500 medium, 700 bold. Arabic needs a larger
  line-height per role.
- **Color** — two-tier: primitive roles (light/dark) + a semantic layer mapping
  negative/positive/warning/brand onto them. The day/night entry parents the **light** block.
  Express everything as Fastship `palette` + `withAlpha` overlays — no third-party hex.
- **`src/design-tokens.ts`** — opt-in draft. Before importing: light theme only; replace its 2
  literal hex values with `withAlpha(palette…)`; its grabber is 32×4 (change to 48×4);
  letterSpacing values need RN conversion. Adopt selectively via `src/ui.tsx`, never wholesale.

## 5. Screen knowledge (six core screens)

Source: `SPEC-…per-screen-build-specs.md`. Apply selectively to real gaps; these are targets,
not a mandate to rewrite working screens.

- Confirm-screen gutters: **40 dp** leading, **8 dp** trailing.
- Receipt header: **96 dp**.
- Track sheet: non-hideable, 64 dp peek, 48 × 4 dp grabber.
- Every screen spec carries region map + spacing + composition + states + motion, mapped to
  Fastship routes (`src/app/…`). Root-mount the bottom sheet and wire backdrop opacity.

## 6. API / backend / realtime knowledge (pass-2 verified)

Source: `KNOWLEDGE-…api-backend-contract-study.md`. This is the highest-signal doc — read its
§0 correction table and §6 Fastship comparison before any API work.

**Contract style worth adopting (as concepts):**
- Per-endpoint **closed error codes** with a category + recovery, and an unknown-fallback.
- **Server-driven poll cadence** (server sends `nextPollMs`), not fixed client intervals.
- **Realtime resume** via a cursor + last-known snapshot.
- Required-field validation at the trust boundary; tolerate unknown keys.

**Verified Fastship-side truth (do not rebuild; extend):**
- Realtime cursor, snapshot path, and signed group credential **already exist server-side**
  (`server/domain/realtime.ts:60-69`) — but `src/` has **zero consumers**. This is a wiring
  gap, not a redesign. Fix timestamps and event-sequence cursors are different contracts.
- Idempotent order-create (`order_commands` + `offerId`/`leaseNonce`), quote TTL
  (`server/domain/quotes.ts`), offer lifecycle, and server correlation IDs
  (`server/main.ts:3089,3161,3200`) **already exist**. Extend, never rebuild.
- Error codes: ~123 open codes; only `OfferFailure` and `GoogleRoutesErrorCode` are typed. Add
  a shared closed `ApiErrorCode` tuple — do not replace the `HttpError`/`fail()` base
  (`server/main.ts:191`).
- Driver fix carries `heading` but no `speed` (`src/model.ts:146`) — add `speed` for motion
  hints.

## 7. Palestinian-market fit (where Fastship beats the reference)

Source: `MASTER-…implementation-blueprint.md` §8. These are differentiators, prioritized P1+.

Arabic-first RTL (mirror all directional UI via `useCopy().rtl`, audit every screen),
cash-first economy + local payment rails behind the existing `PaymentsProvider` interface,
connectivity resilience for variable networks, landmark-based addressing (fields already
exist), trust/safety, and ₪ price transparency with integer-minor-unit money.

---

## 8. Agent-work review — what each research worker delivered, and how much to trust it

So you know which documents are solid and which to spot-check. Verdicts are the workers' own
cross-checks, confirmed in `rea-work/LEDGER.md`.

| Worker | Task | Delivered | Reliability |
|---|---|---|---|
| **GLM 5.2 (Baseten)** | Token system + per-screen specs + one verify pass | `competitive-architecture-uber-tokens.md`, `SPEC-…per-screen-build-specs.md`, `src/design-tokens.ts` | **High.** Its extraction claims were independently re-verified (0 false). The token module is an unapproved draft — review before use. |
| **Kimi K3 (AWS Bedrock)** | Map-pattern spec + one verify pass | `BUILD-SPEC-…map-uber-patterns.md`, pass-1 API study | **High on map** (0 false). Its pass-1 API study was **superseded** by the Sonnet pass-2 — prefer pass-2. |
| **Sol (Codex) ×2** | Fastship-side review of handoff + master | 35 issues, all fixed in the docs | **High.** Verified every Fastship anchor with no drift; gates/typecheck pass. |
| **Claude Sonnet 5.5 (claudeAgent, "6028")** | Pass-2 API/backend re-verification | Rewrote the API study: 14 corrections + the Fastship-side gap table | **Highest-value single pass.** Corrected pass-1 (e.g. text search is a gRPC call, not a REST route) and proved the realtime-client gap. Spot-check its census counts before citing a number. |
| **Claude Haiku 5.5 (claudeAgent, "186c")** | Read-only Fastship map-code study | One real finding: the hardcoded 20 s map-ready deadline | **Found one true fact**, then stopped (rate-limited). Merged into NEW-4 / DEAD-1. |
| **Claude Sonnet 5.5 + Opus 5.5 (pool "D")** | Broader architecture study | **Nothing usable** — rate-limited before producing output | No output; do not cite. |
| **DeepSeek 4.1 1017 (Baseten), GLM 5.3** | Independent extraction verify | **Nothing** — quota/balance blocked | **Not** a verification pass; do not cite as one. |

**Net trust model:** decompile-side numeric claims were triple-checked (0 false across three
independent passes). Fastship-side claims were double-checked by Sol. The single most
corrected document is the API study — always read its **pass-2** version. Where any document
disagrees with current source, **current source wins.**

---

## 9. Preservation & provenance

- Research pack committed locally (`0ead4d1` + follow-ups), protected by tags
  `fastship-study-2026-11-02` and `fastship-claude-handoff-2026-11-02`. Nothing pushed.
- Artifact hashes: `rea-work/CLOSURE-INVENTORY.json` (verify a committed blob by
  `git cat-file blob <rev>:<path>`, normalize line endings, compare to `sha256_lf`).
- Screen captures (92 PNG, 44 en + 45 ar) are committed as
  `rea-work/fastship-screens-2026-11-02.zip`.
- The raw decompile tree (`%LOCALAPPDATA%\Temp\opencode\uber\rea-full`) and APK are
  **proprietary and disk-only** — never commit them; they can vanish with the OS temp
  cleanup. See `rea-work/DECOMPILE-ACCESS.md` to re-derive or look up a fact.
- The working tree's other modified files belong to the user and are deliberately outside
  this snapshot. Do not mix them into a documentation commit, reset, or clean them.

## 10. Honest limits

- Decompiled output can be incomplete or mis-reconstructed; route/field **counts are floors**,
  and runtime-assembled routes are invisible to static analysis.
- Not verified: the full database-backed suite (needs live PostgreSQL), fresh physical-device
  acceptance, and an exhaustive row-by-row re-read of every pass-2 census line.
- iOS-only behavior (BUG-2) requires an iOS device before acceptance; Android evidence does
  not establish iOS correctness.
