# REA handoff reconciliation — 13 Nov 2026

**Status.** This file follows the leader's second pass. The corrected `2026-11-13-VERIFIED-ADDITIONS.md` §2 and `2026-11-13-IMPLEMENTATION-HANDOFF.md` §4 are now the adopt-item baseline; the interim broad absence warnings in the first version of this file are superseded. Keep the ADOPT behaviour requirements and evidence discipline. Documentation only: no product or protected-file changes are part of this reconciliation.

## Evidence classes

**Locally executed in this reconciliation** `[ran]`:

```text
node tests/booking-retry-race.test.mjs   exit 0; client retention checks pass, PostgreSQL Part A SKIP
node tests/booking-auth.test.mjs         exit 0
npx tsc --noEmit                         exit 0
npx tsc --noEmit -p tsconfig.server.json exit 0
npx expo lint                            exit 0
```

**Leader-reported, not rerun in this reconciliation:** `node tests/clean-typecheck.test.mjs` exit 0; `node tests/parcels.test.mjs` OK with no reset. The full-suite report is 99 passing test files and four files failing on `ECONNREFUSED 127.0.0.1:55473` before assertions: `database-logging`, `db-api`, `db-persistence`, and `subscription-migration`. The accurate wording is **zero product failures among executed tests**, not zero product failures overall. `[leader-reported; commands and results above]`

No full-suite run, live deployment check, physical-phone check, or new PostgreSQL integration test was performed here. `[ran: command set above]`

## Corrected current disposition

| Topic | Current status and evidence | Planning consequence |
|---|---|---|
| Booking command loss | **Fixed locally.** The eight post-lock codes are retained at `src/app/book.tsx:378-388`; both locally executed targeted tests exited 0. PostgreSQL Part A still skipped. `[ran]` | Do not repeat the old Phase 0 booking fix. The server lock/replay race remains unexecuted coverage. |
| Typecheck and lint | **Pass locally.** Both TypeScript commands and Expo lint exited 0. Root inclusion is `src/**` at `tsconfig.json:8-16`. `[ran][read]` | Do not repeat the typecheck remediation. This is not a full-suite claim. |
| A1 zone-first addressing | **Customer zone addressing is absent; a Postgres service-area model exists.** `service_areas` and `route_permissions` are real tables at `server/db/postgres-eligibility.sql:8-28`; the corrected row is `2026-11-13-IMPLEMENTATION-HANDOFF.md:161`. `[read]` | Dialect/customer-address parity work, not “no zones in the system.” |
| A2 cash ledger | **SQLite append-only behaviour is trigger-enforced; only the double-entry journal is Postgres-only.** DELETE and protected UPDATE triggers are at `server/db/sqlite-schema.ts:126-130`; the corrected row is `2026-11-13-IMPLEMENTATION-HANDOFF.md:162`. `[read]` | Do not describe the whole cash ledger as missing or merely conventional. |
| A5 shift-first driver + job board | **Still absent as specified; do not conflate this with vehicle-run capacity records.** Existing acceptance/active-job checks are `server/domain/dispatch.ts:276-291` and `server/domain/presence.ts:161-172`; the corrected absence row is `2026-11-13-IMPLEMENTATION-HANDOFF.md:165`. `[read]` | Keep A5 as a distinct gap. `vehicle_runs` does not itself implement shift lifecycle, ready queue, or vehicle-code scan. |
| A8 zone fees + capacity windows | **Partial/dialect work.** `order_requirements`, `vehicle_runs`, `capacity_reservations`, and `capacity_stops` exist at `server/db/postgres-eligibility.sql:61-85`; SQLite zone-priced windows with per-window caps remain missing per `2026-11-13-IMPLEMENTATION-HANDOFF.md:168`. `[read]` | Do not call capacity absent or greenfield. |
| A9 consent-before-change | **Confirmed implemented; drop from the plan.** SQLite carries the five-state proposal at `server/db/sqlite-schema.ts:118-124`; pending lookup and both-backend availability are at `server/domain/destination-change.ts:55-67`, and notification types are at `:25`. `[read]` | Supersedes this file's earlier “test before assigning” wording. No A9 build slice. |
| A10 degradation reporting | **Confirmed implemented; drop from the plan.** Client stale/reconnecting thresholds are `src/location-state.ts:3-9`; server `location_stale` and stale-fix rejection are `server/domain/presence.ts:116-119,161-172`. `[read]` | No A10 build slice. |
| A3 delivery proof | **Confirmed implemented; drop from the plan.** `orders.handover_code` is stored at `server/db/sqlite-schema.ts:24` and exposed only to the owner at `server/main.ts:305`; the sender-only returning code is at `:310`. Completion/return requires the corresponding code at `:2199-2207`, with `proof_attempts` and five-strike lockout. Four-digit return codes are generated at `:2265`, `:2948`, and `server/domain/eligibility.ts:581-584`. The reasoned, audited admin reset is `POST /api/admin/orders/:id/proof-reset` at `server/main.ts:2826-2839`, including `security_events('PROOF_RESET', {reason})` at `:2835`. `[read]` | Customer-held no-PII secret, enforced close, lockout, and audited reset are all present. Only a QR-token representation is separate; do not plan the base A3 mechanism again. |
| Payments | **No real provider is wired.** Only the explicit test fake is enabled at `server/domain/payments.ts:29-34`; Postgres plus schema version 17 is required at `:35-38`. `[read]` | Old BoP credential-enablement instructions are obsolete; there is no production provider to enable in current source. |
| Deployment and schema inventory | **Not live-reverified here.** The current migration sequence reaches version 29 at `server/db/postgres-schema.ts:112-122`; old exact line/gate inventories are not a fresh live measurement. `[read]` | Do not label historical AWS/backup claims as today's deployment state without owner-authorized checks. |

## Booking traps — preserve the verified design

1. **A green test is not a user-path proof.** Trace the actual retry/replay path after tests pass; this is a method rule, not a new defect claim. `[leader method rule]`
2. **Do not re-add a client commit window.** `pendingOutcome` has one receipt argument and explicitly rejects time-based absence upgrades at `src/booking.ts:93-108`. A source search for `COMMIT_WINDOW_MS`, `pendingOutcome(receipt, attemptedAt, now)`, and the `sentAt` fallback/proxy returned no matches. `[read][ran: grep over src/**/*.{ts,tsx}]`
3. **Unknown is not permanent lockout.** Retry resubmits through the pending card at `src/app/book.tsx:430-436`; Edit/Discard require a server-confirmed absence under `src/booking.ts:111-112`. Do not unlock them for an unknown outcome. `[read]`
4. **Do not weaken the assertions.** Post-lock command/pending retention is asserted at `tests/booking-retry-race.test.mjs:94-101`; unknown receipts and non-releasability are asserted at `tests/booking-auth.test.mjs:49-59`. `[read]`
5. **Do not restore the stale seven-classification framing.** The leader annotated that history in place; use corrected `2026-11-13-VERIFIED-ADDITIONS.md:66-99` and `2026-11-13-IMPLEMENTATION-HANDOFF.md:148-188`. `[read]`

## Source-path and handoff housekeeping

- A file search found **no `server/domain/tracking.ts`**. The real quote gate is `server/domain/quotes.ts:8-13`; the payment availability gate is `server/domain/payments.ts:35-38`. Use these paths, not chat-summary paths or remembered line numbers. `[read][ran: file search]`
- The earlier bad independent-audit/deployment references no longer appear in the implementation handoff; do not carry forward those resolved source-defect warnings. `[ran: targeted handoff grep]`
- `docs/REA/2026-11-13-GAP-BACKLOG.md` is a **planned output**, not an existing source: `2026-11-13-IMPLEMENTATION-HANDOFF.md:207-209`. Its absence is not itself a product defect. `[read][ran: file search]`
- Handoff §2.1 remains an annotated historical snapshot. Current §2 and §4 corrections replace its old framing; do not restore it. `[read: corrected documents named above]`

## Next evidence, not new scope

Re-baseline any future claim against the corrected documents and cite a command or file:line. The remaining verification needs are feature acceptance on the intended backend, an executed PostgreSQL booking race, and a complete suite with a reachable test database. This reconciliation alone does not justify a product code change. `[I from the checks above]`
