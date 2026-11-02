# Fastship — start here, Claude Opus 5.5

Research-session closure, 2 November 2026. This document resolves conflicts in the research pack; it is not a claim that implementation or acceptance is complete.

## Mandate and working-tree safety

The owner requested review and preparation for a later implementation session. This closure changes documentation only. Earlier extraction also created the untracked `src/design-tokens.ts` beyond that review scope. Preserve it as an unapproved draft; do not import it automatically. Default implementation direction is light-only tokens integrated into the existing design system, with no dark-mode expansion.

Closure research was first recorded in `13850b9`. **At preservation time the full research pack was then committed locally** (see `git log --oneline -- docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md`; look for the `docs(rea): session study + preservation` commit). Nothing was pushed and nothing was deployed.

The working tree still contains extensive unrelated tracked and untracked implementation work. That work was deliberately **not** staged. Do not reset, clean, bulk-stage, overwrite or attribute it to this research session. A fresh checkout will contain the research docs but **not** the current app state — start from this workspace, inspect `git status`, and preserve existing changes.

## Read order and authority

1. `AGENTS.md` and `docs/CURRENT-WORK.md` for owner constraints and parallel implementation history.
2. This file for reconciled scope and verification limits.
3. `docs/MASTER-2026-11-02-fastship-implementation-blueprint.md` for the full phased backlog.
4. `docs/REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` for bug reproduction, accessibility, dead contracts and ETA details.
5. `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` — pass 2, especially correction table §0 and Fastship comparison §6.
6. Map, screen and token specs named in the master's evidence index, when implementing that area.
7. `docs/rea-work/DECOMPILE-ACCESS.md`, `LEDGER.md`, and `CLOSURE-INVENTORY.json` for provenance and artifact identity.

Current code and reproducible evidence outrank historical line numbers or model verdict totals. This closure's corrections outrank conflicting older recommendations. Research observations are not automatic product requirements. Do not execute the entire feature matrix as an indiscriminate rewrite.

## Reconciled findings and decisions

- **BUG-1 is the first implementation task.** Android `MapPage` returns while loading before recording the new expected center. Its lifecycle test fails at line 183. Read all callers and bridge messages, fix the ordering, retain gesture and stale-message guards, then rerun the lifecycle suite and both map gates.
- **BUG-3 / NEW-3:** review stale opacity at marker creation and heading completion. Preserve reduced-motion and stale-fix behavior. These are historical source findings, not newly device-reproduced failures.
- **BUG-2:** native pin confirmation involves both renderer pending state and the sheet's strict comparison. Proposed tolerances/deadlines require real hardware calibration; Android evidence cannot establish iOS correctness.
- **NEW-1 / NEW-2:** repeated requests and background baseline movement were observed in source. Paid billing and user-visible consequences remain unproven. Inspect server budget/reroute logic before changing behavior.
- **NEW-4 is part of DEAD-1**, not a separate newly discovered malfunction. A literal 20-second timeout alone does not prove a bug. Wire the existing bounded runtime timeout consistently, including loader, WebView config and test stubs, if implementing DEAD-1. Do not add another competing setting.
- **BUG-4:** versioning/cache headers help repeat loads but do not make the first-ever cold start work offline. Define the acceptance scenario before selecting caching or bundling.
- **RTL:** use `useCopy().rtl`, the selected app language. Do not switch the app to OS `I18nManager` based on older §8 wording.
- **ETA:** the shared API client already adds `journeyProtocol=1`. Check server population and display expiry; do not add duplicate opt-in plumbing.
- **Realtime:** server credentials, event cursor, snapshot path and transport selection exist; no `/realtime`, `eventCursor` or `snapshotPath` consumers were found in `src/` at closure. This is an integration gap, not proof that a full push service is deployed. Respect durable-protocol availability, authenticated versus public-share scopes, expiry/revocation, assignment epoch, cursor gaps and long-poll fallback. Fix timestamps and domain-event sequence cursors are different contracts.
- **Polling cadence:** a proposal, not an established launch blocker. Validate/clamp any server hint and preserve visibility, terminal-state, cancellation and fallback behavior. Do not indiscriminately change every poll.
- **Already implemented:** quote TTL and itinerary binding, order-create idempotency, offer leases/lifecycle, server correlation IDs, typed Google routing errors, typed offer recovery and landmark fields. Extend these, never rebuild them from a stale matrix row. The API study's false absence claim for server correlation IDs was corrected at closure.
- **Token spec:** §7's 32-pixel grabber contradicted its corrected §6; now aligned to 48. This does not change the draft module or mandate that measurement in production. Keep existing A53-calibrated controls unless usability evidence supports a change.
- **Dependencies and architecture:** `@gorhom/bottom-sheet` is not currently declared in package.json. Root mounting, analytics hooks, new queues, topic registries and extra motion fields are proposals, not prerequisites for bug fixes. Reuse existing components and adapters first. Never replace the provider boundary with a bare MapView.

## Implementation batches and acceptance

1. Capture current baseline, fix BUG-1, then isolated stale/heading and pin-state issues with focused regression tests.
2. Accessible map controls, names, RTL placement and reduced motion. Check Arabic and English on the physical A53 with TalkBack, large text, loading, retry and failure states.
3. Resolve dead contracts and ETA population without increasing paid route requests or weakening geometry provenance checks.
4. Integrate camera intent/padding and light-theme UI refinements through existing renderers; apply six screen specs selectively to actual gaps.
5. Evaluate realtime resume and bounded polling improvements as separate contract changes, including auth/public tracking and reconnect tests.
6. Prioritize remaining Palestinian-market features from demonstrated needs; business/payment availability and external integrations require their own validation.

After each relevant batch: targeted tests, billing gate (`node tests/google-routing.test.mjs`), map gate (`node tests/map.test.mjs`), lifecycle suite, both typechecks (`npm run typecheck`) and lint (`npm run lint`). Full suite and PostgreSQL contract checks are required before release. Follow AGENTS.md: Expo 57 versioned docs before Expo/React Native API edits, Expo-compatible installation commands, no handwritten generated native directories, no emulator.

## Evidence at closure

- K5 SSH succeeded: `DESKTOP-NE681OS`; the old key-refused note is stale for this session.
- Re-ran K5's existing `C:\Users\pc gaming\fastship-tests` copy: google-routing PASS, map PASS, lifecycle FAIL at 183 (`1 !== 0`). This remote copy was not synchronized or hash-matched to the entire current workspace during closure; do not claim current-tree remote acceptance.
- Current workspace local validation fallback: both client/server typechecks PASS; lint exits 0, with two existing missing-`center` dependency warnings at `google-map.native.tsx:101` and `route-map.native.tsx:167`. Investigate these with pin-camera semantics during implementation, not by blindly adding dependencies.
- Screenshot files counted: 44 English and 45 Arabic PNGs. Their existence does not establish fresh UI or accessibility acceptance. No new physical-device or iOS testing occurred in closure.
- Earlier full-suite results in CURRENT-WORK belong to their recorded snapshots. This research session's full-suite/PG coverage is incomplete; obtain a current matched-source baseline.

## Research provenance and remaining uncertainty

The rider APK exposes client code and contracts, not Uber's complete backend implementation or databases. Decompiled output may be incomplete or incorrectly reconstructed. Do not promise 100% knowledge, completeness, legal certainty, or immunity from another agent's safety review. State provenance plainly; do not hide it behind keyword substitutions.

Pass-2 API census reports 1,046 unique Retrofit literals, of which 1,033 start `/rt/`. Earlier 1,030 counts used a different literal grep. Preserve the method/scope distinction; closure did not independently recount raw artifacts or verify every pass-2 row. Its correlation-ID error demonstrates why model verification counts cannot substitute for source checks.

DeepSeek extraction verification was quota-blocked, not completed. Prior GLM/Kimi/Sol reviews are historical evidence with different scopes. Three Claude cancellation attempts failed with `task_not_found`; subsequent interrupts reported `no_active_run`. This proves observed idleness then, not successful cancellation or current provider quotas. No new delegate was needed for closure.

Keep raw proprietary artifacts outside the repository; use independently written code and cite observations. The raw tree is under Temp and can disappear. Existing review material remains available; no artifacts were deleted or moved.

## Session study record (research pass, 2 November 2026)

### Why the session existed

The owner asked for a read-only reverse-engineering study of the Uber rider app so a later
implementation session could raise Fastship to comparable quality on UI, frontend, backend,
API and architecture — and exceed it for the Palestinian market. Nothing in the app was to
be changed. The output is documentation plus specifications, not code.

### Method actually used, and what failed

| Lane | Role | Outcome |
|---|---|---|
| GLM 5.2 (Baseten) | Token extraction, per-screen specs, one independent verify pass | Produced `competitive-architecture-uber-tokens.md`, `SPEC-…-per-screen-build-specs.md`, `src/design-tokens.ts`; verify 8 TRUE / 2 PARTLY / 0 FALSE |
| Kimi K3 (AWS Bedrock) | Map-pattern extraction, independent verify pass | Produced `BUILD-SPEC-…-map-uber-patterns.md`; verify 9 TRUE / 1 PARTLY / 0 FALSE |
| Sol (Codex) ×2 | Fastship-side review of the handoff and the master | 8 OK / 5 issue, then 21 OK / 30 issue — all fixed |
| Claude Haiku 5.5 | Read-only map code study | Found the 20 s map-ready timeout (`route-map.native.tsx:175`); rate-limited before finishing |
| Claude Sonnet 5.5 (claudeAgent) | Pass-2 API/backend verification | Delivered the pass-2 rewrite of the API study — the single highest-value correction pass |
| Claude Sonnet 5.5 (D), Claude Opus 5.5 (D) | Broader architecture study | Rate-limited; no usable output |

Quota-blocked and **not** completed: DeepSeek 4.1 1017 on Baseten (four attempts, monthly
quota), GLM 5.3 free tier (balance). Do not cite these as verification passes.

### Corrections this session made to earlier claims

Each was found by a second lane, applied to the docs, and is recorded in
`docs/rea-work/LEDGER.md`.

1. **Bottom-sheet grabber** — was "UNKNOWN / M3 default 32×4"; observed family is
   `ub__grabber_bar_*` (52 / 48 × 4) and `ub__track_status_grabber_bar_*` (48 × 4). Use 48×4.
2. **Theme parentage** — `Theme.Base2Color.DayNight` parents **Light**, not the dark block.
3. **Pin anchors** — circle=pickup / square=dropoff is a server-driven `AnchorStyle`
   convention, not a hard rule.
4. **Polyline split** — the driver-split travelled/remaining usage is inference; only a
   full-coverage span is observed. `alphaDividerPosition` + pre/post-divider alpha exists and
   is the simpler alternative.
5. **Type weight** — "Book" resolves to a **Light (~300)** font file through the `fontPath`
   channel that Uber's own text views consume; it is not the same weight as News (400).
6. **Autocomplete** — not a REST route. It is gRPC `maps.text-search/Search`; the
   `/rt/locations/v2/autocomplete` literal only appears in a connectivity-metrics list.
7. **Server correlation IDs** — the pass-2 study's "none exist" claim was **false**;
   `server/main.ts:3089,3161,3200` already correlate. Only client-side propagation is missing.
8. **NEW-4 / DEAD-1** — the 20 s timeout is the same finding as DEAD-1, not a new defect.
9. **RTL** — `useCopy().rtl`; never `I18nManager.isRTL`.
10. **Claude cancellation** — three `task_cancel` calls returned `task_not_found` and the
    follow-up interrupts returned `no_active_run`. Those agents were **observed idle**, not
    successfully cancelled. No claim about later quota state follows from this.
11. **Route census** — pass 2 counts 1,046 unique Retrofit literals (1,033 under `/rt/`);
    the earlier 1,030 came from a different grep. Keep the method attached to the number.

### Verification record (as it actually stands)

- **Decompile-side extraction:** three independent passes, 0 FALSE in all three. The numeric
  claims (8 dp grid, 4/8/16 elevation, sheet 24/32, 16 dp radius, 64 dp peek, 64 dp button
  minimum, 18/16/14 sp labels, screen geometry, ETA pill) matched at the cited lines.
- **Fastship-side:** two Sol review rounds, 35 issues raised, all resolved in the documents.
- **Gates:** billing gate `node tests/google-routing.test.mjs` **PASS**; map gate
  `node tests/map.test.mjs` **PASS**; lifecycle suite **FAILS** at
  `google-map-lifecycle.test.mjs:183` — this is BUG-1 reproducing as expected.
- **Workspace:** client and server typechecks pass; lint exits 0 with two pre-existing
  missing-`center` dependency warnings.
- **K5:** reachable as `DESKTOP-NE681OS`; gates re-run against its existing
  `fastship-tests` copy, which was **not** hash-matched to this workspace. Do not describe
  that run as current-tree acceptance.
- **Not verified:** exhaustive raw-source verification of every pass-2 row, the full suite
  against live PostgreSQL, and any device acceptance.

### Preservation status — what survives, what does not

| Artifact | Where | Durable? |
|---|---|---|
| Research pack (this file, master, 4 specs/studies, 2 reviews, rea-work/) | `docs/` | **Yes — committed locally** |
| `src/design-tokens.ts` | repo root | **Yes — committed as an unapproved draft**, imported by nothing |
| Screenshots (92 PNG, 44 en + 45 ar) | `.screens/states-out/` | **No** — `.gitignore:52` excludes `.screens/`; disk only |
| Session report trees | `reports/` (59 files), `research_notes/` (226 files) | Partly — untracked files there are disk only |
| Rider decompile, 183,507 files / ~746 MB | `%LOCALAPPDATA%\Temp\opencode\uber\rea-full` | **No** — temp; **can vanish at any time** |
| Rider APK, 10 files / ~233 MB | `%LOCALAPPDATA%\Temp\opencode\uber\apk` | **No** — temp |

The decompile is deliberately **not** committed: it is Uber's proprietary code, it is ~1 GB,
and reproducing it in the repository would be a licensing problem. Every claim in the pack is
therefore written to stand on its own — citation by path, shape and semantics, never copied
code. If the temp tree disappears, re-extract the same APK and expect path-level drift;
`docs/rea-work/DECOMPILE-ACCESS.md` records how the tree was produced.

`docs/HANDOFF-2026-11-01-*.md` and `docs/STUDY-2026-11-01-*.md` are earlier research from the
same lineage. They were untracked and were committed with this pack so they are not lost;
they are **not** part of this session's findings and carry their own, older verification state.



Read this handoff and its ordered references. Inspect the current dirty workspace and reconcile each selected finding with source before editing. Implement the smallest complete batches above, beginning with the reproducible Android camera lifecycle failure. Preserve unrelated work, map provenance, routing budgets, recovery and auth boundaries. Use K5 with a source manifest for tests and the physical phone for acceptance. Record issue → change → verification for each batch. Distinguish confirmed defects from proposals and hardware-dependent claims; do not rebuild existing features. Finish authorized work without routine confirmation, but obtain approval for outward actions without standing authorization.
