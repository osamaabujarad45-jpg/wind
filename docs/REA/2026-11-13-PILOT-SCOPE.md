# Pilot scope — accepted decision and current verification

## Decision

**Option C now:** the pilot is intentionally scoped to the current SQLite feature set. **Option A next:** PostgreSQL cutover only after a separately rehearsed migration, restore, rollback, and acceptance gate. **Option B is ruled out:** do not port the twelve gated modules into a second permanent SQLite implementation.

This decision is recorded in `2026-11-13-DIALECT-ADR.md`. It does not authorize a production dialect change or deploy.

## What the pilot includes

- Orders with idempotent booking and bounded driver recovery, not a universal offline outbox.
- Customer-held delivery/return proof with five-strike lockout and audited admin reset.
- Destination-change consent on either backend when `destination_changes` exists.
- Presence and stale/reconnecting location indicators.
- Append-only legacy cash handovers/adjustments and driver confirmation/dispute.
- Ordinary job acceptance and active-job guards. **No shift lifecycle.**

## What the pilot does not include

- Double-entry ledger or `cash_receipts`; on SQLite, door-collected amount and immutable variance reason are absent.
- Durable domain events/outbox or generic durable command protocol.
- Measured eligibility/capacity reservations, dispatch rounds, custody records, or ride-lifecycle history.
- Native push, support cases, private objects, payment intents, or table-backed quote protocol.
- Shift-first job board, per-parcel custody scanning, zone-priced capacity windows, or complete offline fallback bundle.

The twelve PostgreSQL gates remain fail-closed by design. Operators must not interpret `409 *_unavailable` as a production incident or activate a hidden code path to work around this scope. **UI visibility of every gated capability is not yet fully verified**; that remains a separate acceptance item, not an assertion of complete disabled-state coverage.

## Fresh verification evidence

- `npm test`: **106 integration suites passed**, including the real PostgreSQL booking retry race, on 13 Nov 2026.
- Booking Part A: committed concurrent retry returns 409 `quote_consumed` while its command receipt exists.
- Fresh isolated PostgreSQL 18.3 / PostGIS 3.6 on loopback port 55474: database logging, DB persistence, DB API, and subscription migration all exit 0.
- Typecheck, Expo lint, and dependency audit all exit 0. Audit reports zero high/critical rejected entries; 13 moderate and 1 low advisory remain visible.
- Restored production backup: integrity `ok`, no foreign-key violations, `user_version=3`, zero row-count differences against the prior backup. API boots from the restored copy and returns `{"ok":true,"schema":3}`.
- The backup has **36 application tables plus SQLite's internal `sqlite_sequence` = 37 total**. `firebase_resets` and `native_push_tokens` are zero-row legacy/unexplained SQLite artifacts; they are preserved, not silently deleted or presented as active features.
- Signed preview APK version 27, SHA-256 `3b948ef52f0547fd5a526a2353b4709029dbf5b17354ae5005696ceeeb375f52`, installed over version 24 and launched on `SM-A5360`. The JS bundle contains the CloudFront endpoint and no retired Azure endpoint.

## Remaining verification boundaries

- Exact live-host environment and row counts remain unobserved because SSM/EC2 access is denied to the available credential.
- Authenticated production journeys were not executed: the owner declined the production-credential request. No further login attempts will be made.
- All 106 integration suites pass on the preferred remote PC. The complete persistence gate passes on the separate local-temp fixture; its clean remote rerun uses the fresh 55494 cluster. Device cash/ambiguous-command flows have separate evidence records; source or isolated passes alone do not close them.
- No fresh backup-failure alert reaching a human was proven. The current inventory has zero Synthetics canaries and zero Wind-prefixed CloudWatch alarms.
- No production deployment, database migration, schema cleanup, or payment activation is approved by this note.
