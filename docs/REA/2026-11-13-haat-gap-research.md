# HAAT / Palestinian delivery-gap research

**Date:** 2026-11-13  
**Scope:** Competitor landscape, delivery gaps, and small independent adoption opportunities.  
**Evidence:** **[read]** internal competitor index, target-app research notes, and current app inspection. No public web fetch, APK decompilation, device test, or production observation was performed.

> This is a planning brief, not a verified census of the market. App capabilities below are taken from the repository's existing research notes and remain subject to independent verification.
>
> **Leader correction applied (13 Nov):** **[read]** `server/db/sqlite-schema.ts:60-64` has no expected/collected fields in `cash_entries`; **[read]** `server/db/postgres-ledger.sql:68-86` defines them only in PostgreSQL `cash_receipts`. §2.C and the audit now state that SQLite records no collected-at-door amount. A11 in `2026-11-13-GAP-BACKLOG.md` carries the corrected evidence. This file is a supplementary brief; the driver-side plan is `2026-11-13-DRIVER-SIDE-RESEARCH-PLAN.md`.

## 1. Working hypotheses from the notes

- **[I]** Rides, food, groceries, parcels, and B2B fulfillment should be evaluated as distinct operating models, not one interchangeable market.
- **[read]** `research_notes/REA-2026-11-13-reference-apps/HAAT.md:10-18` motivates HAAT as the closest local delivery comparison and documents its landmark/cash/three-app relevance.
- **[read]** `docs/REA/2026-11-13-GAP-BACKLOG.md:54-67` organizes the current source gaps around addressing, custody, durable writes, cash reconciliation, and service-level choices.
- **[read]** `docs/REA/2026-11-13-GAP-BACKLOG.md:15-35` defines **DONE, PG-ONLY, PARTIAL, ABSENT, UNVERIFIED** and requires acceptance evidence rather than treating source reads as runtime proof.

## 2. Confirmed gap clusters

### A. Custody and proof

**[read]** `server/domain/resource-scope.ts:29-35,263-279` provides PostgreSQL-only custody reads/appends. Order lifecycle claims still need evidence of who held the parcel, when custody changed, and what proof was recorded; SQLite does not expose that custody module.

### B. Retry-safe writes

**[read]** `server/domain/commands.ts:10-14` makes the generic durable protocol opt-in, PostgreSQL-only, and limited to a route allowlist. **[read]** `src/driver-command.ts:4-10,50-83` persists only driver advance/exception recovery, while `server/db/sqlite-schema.ts:43-49` defines separate legacy booking/action replay records. These mechanisms do not establish universal offline writes.

### C. Cash reconciliation

**[read]** `server/db/sqlite-schema.ts:60-64` defines `cash_entries` with remittance/adjustment `amount_cents`, note, and status—not expected or collected amounts. **[read]** `server/db/postgres-ledger.sql:68-86` puts `due_minor` and `collected_minor` only in PostgreSQL `cash_receipts`, and `server/domain/ledger.ts:14-25` gates that ledger to PostgreSQL. Therefore SQLite records no collected-at-door amount; the missing pilot workflow starts with capturing that amount and its immutable variance reason.

### D. Shift operations

**[read]** `server/domain/dispatch.ts:261-284` validates offer acceptance, and `server/domain/presence.ts:146-172` manages presence/stale fixes. No shift lifecycle was found in those inspected paths; offer acceptance and an active-job guard are not shift management.

### E. Address and service-level structure

**[read]** `server/main.ts:934-955` supports saved-place city/note/label operations, not structured zone/fee selection. **[read]** `server/db/sqlite-schema.ts:36-37` stores only partner `external_ref`, `payload_hash`, and `order_id`, not same-day/priority semantics.

## 3. Acquisition opportunities

These are candidate experiments, not validated acquisition channels:

1. **Landmark-first address capture** — reduce failed delivery caused by ambiguous Palestinian addressing. Measure first-attempt success and address-edit rate.
2. **Cash receipt capture** — provide a driver-facing collection record that can later feed reconciliation. Measure dispute rate and receipt completion.
3. **Proof-of-delivery evidence** — capture timestamped custody events. Measure disputes and resolution time.
4. **Service-level attribute** — add same-day/priority without duplicating order types. Measure priority adoption and fulfillment accuracy.
5. **Shift onboarding** — only after a real shift workflow exists. Measure driver activation and shift completion, not just signups.
6. **Offline read-only continuity** — preserve useful app state during weak connectivity. Measure successful reads and perceived reliability, not offline mutation claims.

## 4. What not to claim yet

- Universal offline mutation support
- Production verification of package versions or deployed capabilities
- Complete cash accounting from append-only cash storage
- A shift lifecycle inferred from offer acceptance
- Production confirmation of host tables inferred from DDL alone

## 5. Suggested validation order

1. Verify the current deployed dialect and persistence capabilities.
2. Validate delivery custody evidence with real fixtures.
3. Validate booking retry behavior against the actual durable-command allowlist.
4. Validate the variance-and-reason workflow.
5. Validate the address structure against first-attempt delivery metrics.
6. Treat shift operations as a separate discovery item, not a hidden assumption inside the existing backlog.

## 6. Cross-link to audit

See `docs/REA/2026-11-13-gap-backlog-source-audit.md` for the row-by-row audit of the actual checked-out backlog.
