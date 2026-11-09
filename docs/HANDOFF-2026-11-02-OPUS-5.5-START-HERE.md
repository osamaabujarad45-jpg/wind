# Fastship implementation handoff — Opus 5.5

## Start here

This is the only project document needed to begin the next implementation pass. It is written from Fastship source and tests. Work in small, verified batches; inspect the current source before changing a claim below.

**Snapshot notice (9 Nov 2026):** this pack records the source tree as studied on 2 Nov 2026. `origin/master` has moved since (for example the map-ready deadline at `src/route-map.native.tsx:175` now reads `mapReadyMs()`), so every file:line anchor and count below and in the linked documents is a 2 Nov record; re-check it on current `origin/master` before acting. Branches cut from the old local `master` lineage lack `src/runtime-config.ts` and `tests/google-map-lifecycle.test.mjs`.

The main checkout was dirty when this was written. Inspect `git status` and preserve changes you did not make. Do not reset, clean, bulk-stage, or overwrite files outside the selected batch. The research pack and this handoff are preserved by local commit `0ead4d1` and tag `fastship-study-2026-11-02` (the later tag `fastship-claude-handoff-2026-11-02` marks `992e70f`); as of 2 Nov 2026 no push or deployment had occurred.

## Session study

The completed study covered map behavior, visual consistency, screen flow, service contracts, state recovery, Arabic and English layout, and local-market needs. It produced the current bug list, map and screen guidance, token draft, tests, and the evidence inventory.

Cross-checks corrected several earlier statements before this handoff was written:

- The active RTL source is `useCopy().rtl`.
- `journeyProtocol=1` is added by `src/api.ts` for relevant requests, and route responses already provide `eta` where supported.
- Server correlation IDs already exist in `server/main.ts`; only client request-ID propagation remains optional work.
- The map-ready timeout is one configuration task, not two separate defects.
- The draft token module is unapproved, imported by nothing, and must be adopted selectively through `src/ui.tsx`.
- Map pin, line, sheet, and typography measurements are guidance for new Fastship UI, not a reason to replace existing calibrated controls.

Detailed study material is retained in the committed `docs/` records and the local tag. It is background for a narrow question after the source and this brief have been checked; it is not an implementation checklist.

**When you need the depth**, open [`KNOWLEDGE-MAP-2026-11-02-deep-study-and-agent-review.md`](KNOWLEDGE-MAP-2026-11-02-deep-study-and-agent-review.md). It maps every deep finding (confirmed-defect table with source anchors, map/token/screen/API numbers, Palestinian-market fit) and reviews what each research worker delivered and how much to trust it. Read it after this brief and before touching a new area.

## Non-negotiable behavior

Keep these behaviors intact in every batch:

- Geometry returned by Google services is rendered only by the permitted renderer through `canShowOnRenderer` in `src/map-provider.ts`.
- A changed map or route flow must not add paid Google route calls. Preserve `shouldReroute` in `server/domain/google-routing.ts`.
- Preserve the map provider boundary, failure handling, stale-location treatment, live-order authorization, recovery state, and Arabic/English layout.
- Build original Fastship UI, wording, motion, colors, and assets. Use the archived study only for high-level product patterns.

Run these after every map or routing batch:

```bash
node tests/google-routing.test.mjs
node tests/map.test.mjs
node tests/google-map-lifecycle.test.mjs
npm run typecheck
npm run lint
```

Use the physical Android phone for acceptance. iOS-only behavior needs an iOS device before it is accepted.

## Current source status

| Area | Current fact | Action |
| --- | --- | --- |
| Android map center | `MapPage` returns while loading before storing the latest expected center in `src/route-map.android.tsx`. | First fix. Make `tests/google-map-lifecycle.test.mjs` pass without weakening gesture guards. |
| Stale driver marker | A rebuilt web marker can lose its stale opacity in `src/route-map.tsx`. | Apply stale opacity at creation or include the rebuild key in the existing effect dependencies; add a focused regression check. |
| Native pin completion | Native renderers and `src/pin-sheet.tsx` use strict center agreement. | Treat as device-calibrated work. Keep renderer and sheet state in sync, preserve cancel/gesture paths, and verify on iOS. |
| Baseline Android map page | `src/route-map.android.tsx` loads the page from the API. | Define cold-start and cache acceptance first; versioned server delivery is the smallest current direction. |
| Ready deadline setting | `src/runtime-config.ts` defines `mapReadyTimeoutMs`, while map implementations contain literals. | Use the existing setting consistently, including WebView configuration and test stubs. |
| Route ETA | `src/api.ts` enables the current protocol and server route code emits ETA data. | Do not add duplicate protocol plumbing. Check expiry and display behavior only where a user-visible gap remains. |
| Polling and live updates | Server credentials and cursor metadata exist; consumers must be checked before wiring. | Make this a separate contract batch with authorization, expiry, resume, and fallback tests. |
| UI tokens | `src/ui.tsx` is live. The draft `src/design-tokens.ts` was removed on 9 Nov 2026 as unused; recover it from commit `b609229`. `docs/rea-work/fastship-screens-2026-11-02.zip` stays: it is the only committed copy of the 92 state captures of 26 Oct from the git-ignored `.screens/states-out/`. | Reuse existing tokens. Current screenshots live in `docs/screens/` (`npm run screens`). |

## Work order

1. Capture the selected-test baseline and inspect the callers, bridge messages, and test fixture for the Android map-center failure.
2. Fix that failure with the smallest ordering change. Confirm lifecycle, billing, and map tests pass.
3. Address stale marker opacity and heading completion with one focused test per behavior.
4. Make map controls reachable and named, mirror directional placement through `useCopy().rtl`, and respect reduced motion. Check English and Arabic on the physical phone with large text and screen reader navigation.
5. Calibrate native pin completion on an iOS device. Do not infer iOS acceptance from Android behavior.
6. Resolve the unused timeout setting and other dead map state only after all consumers and test stubs are read.
7. Add camera intent, screen polish, or local-market improvements only when the preceding correctness and accessibility work is green. Keep each feature isolated.
8. Treat polling, cursor resume, and additional client identifiers as separate API changes with server and client tests.

## Validation and release evidence

The local study run reported passing client and server type checks, and lint with two dependency warnings (2 Nov count) in `src/google-map.native.tsx` and `src/route-map.native.tsx`. The map and billing gates passed. The lifecycle test reproduces the first task above.

Tests run on the remote test PC named in `AGENTS.md` and the owner's global rules, never on the owner's own PC. K5 was reachable, but its test copy was not verified against this workspace. Before relying on remote results, create a source manifest for the selected revision. A full database-backed suite and current device acceptance remain required before release.

## Preservation record

The session documentation, studies, reviews, map and screen specifications, token draft, ledger, and evidence inventory were committed locally in `0ead4d1`. The tag `fastship-study-2026-11-02` protects that snapshot.

The current app changes belong to the user and are deliberately outside that snapshot. Do not mix them into a documentation commit. Fastship screenshots are stored in the session archive listed in the inventory.

## Completion record for each batch

Record every batch as: issue, exact source change, focused test result, both map gates, typecheck, lint, and device result where relevant. State any remaining device or database limitation plainly.
