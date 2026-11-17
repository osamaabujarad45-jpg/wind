# Helper ownership — ProfitChart defensive robustness

Owner-authorized non-cancelling split, agreed 2026-11-07.

## Helper session

`session-7e825396-abb1-48e2-a893-71c8482c6c27`

Work only in a separate helper worktree based on commit `c9b4507` (`fix: harden launch and customer recovery flows`). Do not edit or reset either leader worktree, and do not include generated screenshots, artifacts, dependencies, or `vendor/` in the helper source patch.

## Helper-owned files

- `src/app/admin/index.tsx` — only `ProfitChart` defensive empty/shrinking-data handling and directly related chart markup.
- `tests/admin-dashboard-ui.test.mjs` — new focused real-component regression suite.
- `src/copy.ts` — only new bilingual `chartNoData` entries. Suggested Arabic: `لا توجد بيانات يومية للرسم`; English: `No daily data to chart`. No other copy edits.

Do not edit `scripts/run-tests.mjs`, `scripts/screens.mjs`, shared UI, booking files, backend, configuration, or device setup. The leader will register the new suite and perform integration/browser capture.

## Required behavior

Follow `session-bridge/chart-repair-proposal.md`: hooks stay unconditional; derive a clamped selection during render; no effect-only correctness clamp; no `daily[selected]`, first/last, or summary/axis dereference when empty; populated charts retain exactly one selected bar and finite heights; shrinking 14→1 and 14→[]→1 stays correct; empty data renders a titled localized empty card with no interactive plot while other dashboard statistics/navigation remain intact. No chart redesign and no server change. This is defensive robustness: the current backend returns 14 zero-filled buckets, so do not claim a normal-production crash.

Cover [] / 1 / 14 / 14 zeroes, index 13 then 14→1, 14→[]→1, initial []→1, and an earlier-day selection, including rerender before effects, Arabic/English, and reduced-motion true/false. Use the existing actual-Dashboard recursive component-test pattern and preserve hook slots.

## Verification and return

Run the focused component suite directly, `tests/admin-stats-daily.test.mjs`, lint, and both typechecks in the helper worktree. Return an isolated commit/hash plus exact gates and limits. Do not claim bilingual rebuilt browser evidence, physical-device acceptance, PostgreSQL acceptance, or whole-app completion; the leader owns those integration steps.

NVIDIA-requested routes are rejected by helper policy and are not authorized or claimed. No provider substitution should be misreported.

## Leader retains

All booking, maps, order/tracking, shared UI and remaining copy work, screenshot/test-runner integration, final commits, physical phone, and whole-app acceptance. Current leader booking edits are uncommitted in the leader worktree and are not a helper baseline.
