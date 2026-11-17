# Helper chart repair proposal — awaiting lead ownership

No application edits authorized by the lead yet. Do not apply automatically.

## Current-source qualification

`src/app/admin/index.tsx` ProfitChart uses selected state initialized from length (line 90), dereferences daily[selected] (93/102), and first/last elements (121/123). Empty and shrinking lists can fail by source analysis. Current backend always returns 14 zero-filled buckets; tests/admin-stats-daily.test.mjs asserts that count. This is defensive client robustness, NOT an established normal-backend crash.

## Smallest candidate change

Keep hooks unconditional. Derive safeSelected each render: selected < 0 means current last index; otherwise clamp to [0, daily.length - 1]. Obtain pick from safeSelected. Before any summary/axis dereference, render a titled empty card with a localized no-chart-data message when pick is absent. Use safeSelected for selected-bar opacity. Avoid effect-only clamping, broad chart redesign, or server changes.

## Focused acceptance cases

Render actual Dashboard and recursively evaluate ProfitChart, preserving hook slots through updates using existing transpileModule/VM component-test pattern. Test [] / 1 / 14 / 14 zero-valued days; select index13 then 14→1; 14→[]→1; initial []→1; select earlier day. Rerender before effects. Assert correct date/totals, exactly one selected bar for populated data, finite heights, no interactive plot for empty data, other statistics and navigation intact. Cover Arabic/English and reduced motion true/false.

## Proposed ownership

Helper separate worktree: admin chart code and a dedicated admin-dashboard-ui regression test only. Shared copy key requires lead agreement; no shared UI, screens harness, booking, backend, or phone changes. Lead retains integration and screenshot harness. Required gates after implementation: focused component test, admin stats test, lint, both typechecks, bilingual rebuilt browser evidence. Physical and PostgreSQL limits must remain explicit.

## Verification performed

Read-only independent source review plus parent read of current chart lines 75–134. No tests/builds/device operations or source mutation; no runtime reproduction claimed.
