# WP02 independent integration review

Parent review on 26 October 2026, following the async persistence implementation recorded in [WP02.md](WP02.md). Full PostgreSQL order/API parity remains WP03 work; no production cutover or horizontal scaling is accepted here.

- `node scripts/check-contracts.mjs`: passed all literal money expectations and the 90 endpoint/21 transition/174 exchange SQLite compatibility corpus.
- `node scripts/check-persistence.mjs`: passed real SQLite/PostgreSQL overlapping ownership, rollback, commit/error effects, detached work, actual deadlock with stable-command retry, migration exclusion, connection termination/recovery, aborted COMMIT suppression, pool/statement/lock bounds, PostGIS4326 and the PostgreSQL HTTP authentication slice.
- The two-process HTTP check produced one winner from 100 contenders, one exclusive commitment when a driver raced two rides, one winner for a ride-versus-parcel race, and two successful parcel claims for a courier batch. This is SQLite evidence, not PostgreSQL acceptance.
- The packaged API booted from a fresh OS temporary directory using only the locked PostgreSQL dependency closure. The runtime no longer relies on the developer checkout's modules; Docker build inputs include the packaging script. No Docker daemon was available for a real container build.
- A mutation in a separate copied adapter removed committed-effect publication. The real boundary tests failed with `actual: []`, `expected: ['committed-sibling']`; the actual source was never mutated.
- `npm run lint`, `npm run typecheck`, and `git diff --check` passed. The implementation agent ran the full existing suite, then relevant rating/offer checks after extracting statistics.

## Measured performance follow-through

`npm run test:load` passed with 121 synthetic accounts and 10,000 historical orders: zero counted errors/timeouts, concurrent role/privacy checks, 60 held live reads recovering accepted newer fixes, bounded external SQLite locks, integrity/foreign keys, and 409 idempotent bookings stored once. In this run the mixed60 phase achieved 188.25 requests/sec and p95 389.32ms. The read60 phase p95 was 598.12ms, above the handoff's 500ms engineering target. WP03 was explicitly assigned to repair this regression with safe request-owned caching/indexing and repeat the measurement after the change. Removing the unsafe global cache was correct; this result does not permit silently lowering the target.

These are development-machine observations, not production capacity or carrier/native evidence. Detailed ephemeral results remain under ignored `.expo/load/results.json`.
