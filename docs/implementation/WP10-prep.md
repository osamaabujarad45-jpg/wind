# WP10 prep review: deterministic passenger dispatch + atomic acceptance

Read-only research (Muse Wonder 1.0, max). No files changed by the review.
Spec: `reports/Fastship Claude implementation plan.md` section 10. WP10 implementation
starts only after WP08 activation decisions and WP09 land.

Baseline at inspection: migrations run 3→11 (`server/db/postgres-schema.ts:52`).
WP08 quotes code has landed (migration 11); routing-policy activation has not.
WP09 has not landed. Dispatch does not exist.

## Key facts from the current tree

- Presence (`server/domain/presence.ts`, migration 9) always returns
  `eligibleForMatching:false` reason `dispatch_not_enabled`. The PostGIS shortlist
  source already exists: `driver_latest_locations.position` GiST
  (`server/db/postgres-presence.sql:40-42`).
- All dispatch constants already exist in `server/domain/eligibility.ts:13-24`:
  offer 15s, max 3 offers, search 90s, idle credit `min(60, floor(idle/10))`,
  plus `futureDispatchActivated:false` and `cashCapActivated:false` gates.
- Rank formula (plan line 26): `pickupETAsec - min(60, floor(idleAvailableSec/10))`,
  stable driver-ID tiebreak, feasibility first. Rating is never an input.
- Anti-pattern to remove for rides: `newJobPush` broadcast with `ORDER BY random()`
  (`server/main.ts:775-786`). Stays for parcel/freight.
- Exclusive/parcel separation already has DB backstops: `orders_exclusive_driver`
  partial index + `assignment_guard` (`server/db/postgres-guards.sql:17,57`) and the
  measured `wp05_assignment_guard`. Dispatch accept must still check cross-mode
  under the driver/vehicle locks, because an offer is not yet an assignment.
- There is no driver→pickup ETA function; WP10 adds one reusing `osrmRoutes`
  (`server/main.ts:1951`).
- `orders.version`/`assignment_epoch` (guards trigger) bind every offer; replay
  uses `versionedCommand`/`command_results` before any expiry/version check.

## Implementation map (summary)

- Migration: take `max(version)+1` after WP09 merges (expected 13; verify at
  start). New `server/db/postgres-dispatch.sql`; add table names to the auxiliary
  allowlist in `server/migrate.ts:168`. SQLite returns `409 dispatch_unavailable`.
- Schema: `dispatch_rounds` (one open round per order; `deadline_at = started_at +
  90_000`, never extended), `dispatch_offers` (15s lease,
  `expires_at = min(issued+15s, deadline)`, nonce hash only, one open offer per
  round and per driver via partial unique indexes), append-only
  `assignment_history`.
- Filter→shortlist→rank stays deterministic: presence online + fix ≤30s,
  `Eligibility.base()` + `coverage()`, seats/equipment, no active work of any
  service, PostGIS KNN shortlist (named bound), road ETA on the bounded set only,
  rank per formula with all inputs persisted on the offer for audit.
- Lifecycle: issue one offer at a time; decline/expiry issue the next; 3 offers or
  deadline → `exhausted` (`no_driver`/`deadline`); cancel revokes the open offer
  in the same transaction; retry is a new round on the same order at the same
  price.
- Acceptance transaction locks in one order (advisory → orders → driver →
  presence → vehicles/runs → offer), replays stored command results first, then
  re-runs all hard checks before the atomic assignment + event/outbox writes.
  This changes direct accept's current `users → orders` order to order-first —
  flagged behavior change, aligned with the dispatcher pre-lock.
- Expiry in the DurableWorker with the identical `order_revision = orders.version`
  predicate, so accept-vs-expiry has exactly one winner and an old timeout can
  never free a committed driver.
- API (additive): `POST /api/jobs/:id/accept` with optional
  `{offerId, leaseNonce, commandId, expectedVersion}`, new
  `POST /api/offers/:id/decline` and `POST /api/orders/:id/dispatch/retry`,
  additive `dispatch` object in order serialization. All join the eligibility
  pre-gate and `versionedCommand` paths.

## Tests to add

`tests/dispatch-migration.mjs`, `tests/dispatch-ranking.test.mjs` (pure),
`tests/dispatch.mjs`, `tests/pg-dispatch-claims.mjs` (100-driver races),
`tests/dispatch-races.mjs` (expiry/cancel/edit vs accept, replay, worker restart),
`tests/dispatch-sqlite.mjs`. Register PG suites in `scripts/check-persistence.mjs`,
pure suite in `scripts/run-tests.mjs`. Keep frozen contract counts green.

## Blockers and ambiguities (must not be invented)

- WP08 activation: `evaluateQuoteFeasibility` hardcodes restriction evidence to
  `missing` (`server/domain/quotes.ts:180`), so quotes are `uncertain` today;
  the 100-case corpus + operator sign-off are open. No real ride may be
  auto-dispatched on quote feasibility until closed.
- WP09: exact fields needed are `order.dispatch`, the driver offer object,
  `sequence`/`assignmentEpoch` carriage, `serverTime`, durable attempts with
  expired-offer suppression. Until then the 8s jobs poll makes a 15s lease
  barely reachable; dispatch stays test-only. Accept always revalidates
  server-side, so late delivery degrades to missed offers, never wrong ones.
- Cash cap stays unenforced until WP13 defines projected exposure.
- Open spec ambiguities A1–A11 (shortlist bound, `idleAvailableSec` origin,
  decline cooldown, safety pair-block table, round semantics, ETA fallback,
  clock authority, unmeasured ride seats, retry identity, lock-order
  unification, legacy no-quote orders) are recorded in the review; defaults
  chosen are fail-closed. A8 consequence: dispatch requires a measured
  requirements row until decided.
