# Gap backlog — source audit

**Date:** 2026-11-13  
**Audited input:** `docs/REA/2026-11-13-GAP-BACKLOG.md`  
**Evidence:** **[read]** source inspection only. No production host, backup restore, migration, API session, or acceptance suite was run. Those facts remain **[U]** (unknown), not failed checks.

> This report audits the checked-out rows directly. Status agreement means source support only; it is not runtime acceptance.

## Verdicts

| Row | Verdict | Evidence and consequence |
|---|---|---|
| **B1** | **KEEP OPEN** | **[read]** `server/domain/commands.ts:10-14`, `server/domain/quotes.ts:8-13`, `server/domain/native-push.ts:25-29`, and `server/domain/ledger.ts:14-25` explicitly gate capabilities on PostgreSQL. `server/domain/destination-change.ts:62-67` instead supports either backend when its table exists. Dialect behavior is deliberately non-uniform; the owner decision remains open. |
| **B2** | **KEEP OPEN [U]** | **[read]** `docs/REA/2026-11-13-GAP-BACKLOG.md:46` specifies host `printenv` and `PRAGMA user_version` checks. They were not executed here, so the deployed dialect is unknown. |
| **B3** | **KEEP OPEN [U]** | **[read]** `docs/REA/2026-11-13-GAP-BACKLOG.md:47` requires a restore, integrity check, and row-count comparison. None was executed here. |
| **B4** | **KEEP OPEN [U]** | **[read]** `docs/REA/2026-11-13-GAP-BACKLOG.md:48` identifies `firebase_resets` and `native_push_tokens` as production-schema questions. **[read]** `server/db/sqlite-schema.ts:82-86` creates web-push subscriptions, while `server/db/postgres-native-push.sql:4-17` creates native tokens. This source split does not establish either production table's existence. |
| **A1** | **KEEP PARTIAL** | **[read]** `server/db/sqlite-schema.ts:105-107` stores only `label`, `city`, `note`, and creation time for a saved place. **[read]** `server/main.ts:934-955` lists, creates/updates, and deletes those records. No structured zone, address line, landmark field, or default flag is present in that contract. |
| **A2** | **KEEP PARTIAL** | **[read]** `server/db/sqlite-schema.ts:126-130` protects cash entries from deletion and post-decision/amount mutation. **[read]** `server/domain/ledger.ts:14-25` gates the double-entry ledger to PostgreSQL. The SQLite gap is the journal, not basic append-only protection. |
| **A3** | **KEEP DONE (source)** | **[read]** `server/main.ts:2190-2207` requires the customer-held handover/return code, counts failures, and locks at five. **[read]** `server/main.ts:2826-2836` implements the audited admin `proof-reset`. Runtime acceptance remains **[U]**. |
| **A5** | **KEEP ABSENT (shift lifecycle)** | **[read]** `server/domain/dispatch.ts:261-284` validates dispatch acceptance, and `server/domain/presence.ts:146-172` handles presence and stale fixes. No shift start/end state or shift-scoped queue was found in the inspected paths; offer/presence mechanisms must not be relabelled as a shift lifecycle. |
| **A6** | **KEEP PG-ONLY** | **[read]** `server/domain/resource-scope.ts:29-35` gates scope/custody availability to PostgreSQL; `:263-279` returns and appends custody records, and `:350` registers the custody route. Custody exists, but not on SQLite. |
| **A7** | **CORRECT DONE → PARTIAL** | **[read]** `server/domain/commands.ts:10` passes requests without `commandId` straight through; `:11` rejects the durable protocol off PostgreSQL; `:14` allowlists only `/api/orders`, `/api/jobs/`, `/api/admin/orders/`, `/api/admin/cash`, and `/api/driver/cash`. **[read]** `server/db/sqlite-schema.ts:43-49` separately defines legacy `order_commands`/`order_actions`; `src/driver-command.ts:4-10,50-83` scopes its persisted recovery to driver advance/exception. These are limited replay mechanisms, not a general outbox for every mutation. |
| **A8** | **KEEP PARTIAL** | **[read]** `server/domain/quotes.ts:36-55` binds `scheduledFor` into quote identity. **[read]** `server/db/postgres-eligibility.sql:8-21,75-83` defines service areas, routes, and vehicle-capacity reservations. The inspected SQLite quote/booking path has no corresponding per-zone fee or per-window daily-cap contract. |
| **A9** | **KEEP DONE (source)** | **[read]** `server/db/sqlite-schema.ts:118-125` defines `quote`, `pending`, `accepted`, `declined`, and `withdrawn` states. **[read]** `server/domain/destination-change.ts:116-166` requires a proposal before the driver's decision, mutates the destination only on acceptance, and notifies the customer; `:170-181` implements withdrawal. Runtime acceptance remains **[U]**. |
| **A10** | **KEEP DONE (source)** | **[read]** `src/location-state.ts:3-9` computes `stale` at 60 seconds and `reconnecting` from 30–60 seconds. **[read]** `server/domain/presence.ts:106-119,172` returns offline/location-stale states and rejects stale fixes. Device/counterparty acceptance remains **[U]**. |
| **A11** | **KEEP PARTIAL; CORRECT EVIDENCE** | **[read]** `server/db/sqlite-schema.ts:60-64` shows `cash_entries` has `kind`, `amount_cents`, `note`, `status`, recorder, and timestamps—**no expected or collected amount**. **[read]** `server/db/postgres-ledger.sql:68-86` puts `due_minor` and `collected_minor` in `cash_receipts`, created only by that PostgreSQL DDL; `server/domain/ledger.ts:14-25` gates the owning ledger to PostgreSQL. On SQLite, the collected-at-door amount is not recorded. The remaining requirement is collected amount plus immutable variance reason per order. |
| **A12** | **KEEP ABSENT** | **[read]** `server/db/sqlite-schema.ts:36-37` defines `partner_orders` only as `external_ref`, `payload_hash`, and `order_id`. No same-day/priority service-level attribute is present there. |
| **A13** | **KEEP ABSENT (versioned Android channels)** | **[read]** `src/native-push.ts:32-46` requests permission and registers an Expo token; it does not call an Android channel-creation API. **[read]** `server/domain/native-push.ts:12-20,31-63` implements event-kind and quiet-hour preferences, but no channel identifier or version suffix. Preferences exist; versioned per-event Android channels do not in the inspected paths. |
| **A14** | **KEEP PARTIAL** | **[read]** `src/background-location.ts:164-175` defines and runs the background task. The inspected file contains no boot, user-unlock, time-set, timezone-change, or package-replaced re-arm handler. |
| **A15** | **KEEP PARTIAL** | **[read]** `src/offline-summary.ts:2-20` stores at most three orders with id, service, status, and cities, explicitly excluding prices and other details. It does not bundle zones, fees, windows, or saved addresses and is not an offline mutation queue. |
| **D1** | **KEEP DONE (Part A unexecuted)** | **[read]** `src/app/book.tsx:371-399` retains post-lock booking commands for same-request retry. **[read]** `src/booking.ts:93-112` treats unknown receipts as retryable and releases only on confirmed absence. The PostgreSQL race test was not executed here and remains **[U]**. |
| **D2** | **SOURCE STATUS NOT RECHECKED** | **[read]** `package.json:54` defines `npm run typecheck` as both client and server `tsc --noEmit`. **[U]** Neither that command nor the backlog's recorded clean-typecheck run was executed in this audit. |
| **D3** | **KEEP OPEN [U]** | **[read]** `docs/REA/2026-11-13-GAP-BACKLOG.md:75` requires a reachable PostgreSQL fixture or `WIND_TEST_DATABASE_URL`. No fixture connection was attempted here. |

## Consequential corrections

1. **A7 is the main planning correction.** **[read]** `server/domain/commands.ts:10-14` makes the generic durable protocol opt-in, PostgreSQL-only, and route-scoped. Do not infer universal offline writes from the separate legacy booking/driver replay paths.
2. **A11 evidence is corrected.** **[read]** `server/db/sqlite-schema.ts:60-64` has no expected/collected fields; those belong to PostgreSQL-only `cash_receipts` at `server/db/postgres-ledger.sql:68-86`. On SQLite there is no collected-at-door amount to reconcile.
3. **A6 is implemented custody, not absent custody.** **[read]** `server/domain/resource-scope.ts:29-35,263-279` makes the limitation dialect availability.
4. **A2's remaining SQLite work is the double-entry journal.** **[read]** `server/db/sqlite-schema.ts:126-130` already supplies append-only protection.
5. **Host and fixture rows remain open.** **[U]** This documentation pass supplies no production, restore, or runtime acceptance evidence.

## Acceptance evidence still required

- **[U]** Run the root typecheck gate from a clean checkout.
- **[U]** Observe production dialect and `PRAGMA user_version` on the actual host.
- **[U]** Restore the newest backup and verify `PRAGMA integrity_check` plus row counts.
- **[U]** Connect the PostgreSQL fixture before closing D3.
- **[U]** Execute delivery-proof, destination-consent, stale-location, durable-command, and offline acceptance tests on the production backend.
