# Plan: delivery-exceptions

Spec: [SPEC-delivery-exceptions.md](../SPEC-delivery-exceptions.md). Approved 2026-10-04.

Dependency graph: T1 (model statuses) → T2 (report + resolve API) → T3 (return completion) → T4 (disputes) → T5 (client UI). T5 depends on T2–T4 contracts.

Vertical slices; each task ends green on `npm test && npm run typecheck`.

Checkpoint A after T3: full exception→return path proven by API tests.
Checkpoint B after T5: lint, typecheck, test, web export.

Risks: hard-coded active-status SQL lists drift (mitigate: derive from `activeStatuses`); rollback (no `user_version` bump, additive columns only); Souq bridge terminal states (handled in Souq module).
