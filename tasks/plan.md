# Current review — 21 October 2026

Exercise the customer, driver, recipient and administrator stories on an isolated
local API; fix reproduced failures; validate maps on desktop and the connected
Android browser; run unit/API tests, lint, typecheck, Expo Doctor and native exports.
Results and remaining release checks: [QA report](../docs/QA-2026-10-21.md).

# Historical plan: courier-run-eta (SPEC-courier-run-eta.md, loop 19)

1. Server: orders carry sharedRun (driver has other active orders); /track eta returns no minutes/approach on a run.
2. Client: useRoad skips the driver leg on a run; order page and public page show the run line (en+ar).
3. Tests in tests/parcels.test.mjs, mutation-checked; tsc, lint, npm test, screens.
4. Phone check (web app in the A53's Chrome against the local demo server), ship.
