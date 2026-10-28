# WP05 review repairs — 27 October 2026

Scope: only WP05 eligibility, physical assignment invariants, owned synthetic tests and documentation. Inputs: AGENTS.md, plan section05, D03/D05/D07/D23/D29 and WP05.md. No subagents, UI, provider calls, commits, pushes or deployments. Shared uncommitted work is preserved. Root owns the coordinated main wiring, migration loader and import classification; phone owns migration6. Migration5 SQL was deliberately left unchanged.

## Issue → change → evidence

| Issue | Change | Verification |
|---|---|---|
| An unfinished prior reservation whose planned finish passed counted as zero remaining work | Reject new measured offers/accepts with409 `prior_run_overdue` if any active same-vehicle reservation has `planned_end <= server now`. Preserve all orders, custody and reservations; do not renew estimates | Red repro accepted a second order; green regression rejects it and compares the original complete order snapshot and retained reservation count |
| Pickup/finish feasibility omitted driver/last-stop-to-pickup travel | Append-only, operator-attested approach evidence bound to order requirements, physical vehicle revision and current run revision; include approach plus remaining prior work, both services and route duration; documents/approval/coverage must span resulting finish | Missing leg,120s approach against60s pickup window, source not last dropoff, wrong vehicle, stale run, expired evidence, future/stale observation and invalid coordinates reject. Positive active-run control plans exactly prior finish +10s approach +60s route +20s services; short-lived license rejects |
| Another subject's permit approval masked a latest negative review | Latest applicable negative on either driver or current-revision vehicle vetoes; otherwise require at least one approval valid through finish. Superseded vehicle revisions cannot approve | Both masking directions failed red, pass green. Expired approval and previous-revision vehicle approval fail; new current approval succeeds |
| A driver could accept changed measured scope without consenting to the revision | Positive integer `expectedRequirementsRevision`; mismatch409 `requirements_changed`; `capacityProtocol:1` driver accept/offer requires echo, omission409 `requirements_revision_required`. Re-read scope after acquiring policy lock | Real opt-in job/detail reads match; stale echo with and without protocol rejects with no reservation/assignment. Missing/malformed echo rejects. Stale offer submission cannot refresh its snapshot; stale customer acceptance rejects |
| A direct SQL writer could fabricate a zero-load reservation and assign | Forward migration7 replaces assignment guard; validate reservation against canonical requirements/revisions and independently bounded item totals; aggregate weight/volume/pieces/seats/equipment/fixed-axis slices across the shared physical vehicle under vehicle/run locks | Zero-load repro failed red, passes green with otherwise current reservation. SQL weight/volume/width/slices/seats/equipment/pieces/malformed totals/overflow/shared-mode violations reject23514. Valid direct writer succeeds; two concurrent final-capacity SQL claims have one winner |

## Exact API and root hooks

Existing route `POST /api/admin/eligibility/orders/:id` gains a separate approach-only form. It does not change measured requirements or their revision:

```json
{
  "expectedRevision": 1,
  "approach": {
    "vehicleId": 1,
    "expectedVehicleRevision": 1,
    "expectedRunRevision": 0,
    "from": {"longitude": 35.18, "latitude": 31.89},
    "to": {"longitude": 35.19, "latitude": 31.9},
    "seconds": 30,
    "observedAt": 1793068800000,
    "validUntil": 1793072400000,
    "method": "operator_attested"
  },
  "reason": "Operator attested approach for this candidate",
  "evidenceRef": "operator:case:synthetic"
}
```

Coordinates above are synthetic examples. `observedAt` cannot exceed server now or be older than five minutes. `validUntil` must be future, no more than24h after observation, and cover departure after remaining prior work plus approach duration. `seconds` is an integer1..86400. Coordinates must be finite longitude±180/latitude±90. `to` must equal confirmed pickup. With active reservations, `from` must equal the last planned dropoff (planned finish descending, order ID descending as deterministic tie-break); without active work it is the operator-attested current vehicle point. This is manual operator evidence, not GPS or a road-provider prediction.

Returns `{approachId,orderId,requirementsRevision,vehicleId,vehicleRevision,runRevision,method,seconds,observedAt,validUntil}`. Every refresh inserts a new increasing `approachId`; UPDATE/DELETE is forbidden. Evidence is selected by order+selected physical vehicle, latest ID. Changes to requirements, selected vehicle revision or run revision require fresh evidence. Assessment-only requests retain their existing full shape. Do not combine assessment fields and approach-only fields.

Additional409 errors: `prior_run_overdue`, `approach_evidence_missing`, `approach_evidence_changed`, `approach_evidence_expired`, `approach_endpoint_mismatch`, `requirements_changed`, `requirements_revision_required`. Malformed/old/future observation during recording:400 `invalid_approach_validity`; malformed coordinates400 `invalid_coordinates`. Other existing eligibility/price/window errors retain precedence where applicable.

Domain signature: `guard(driverId,orderId,kind,capacityProtocol,offeredPrice?,expectedRequirementsRevision?)`. Root passes the echo on direct driver accept/offer and customer offer acceptance. An optional echo on customer acceptance is validated; the saved negotiated-offer requirements/run/evidence revision snapshot remains mandatory. The existing ten-minute offer lifetime remains;15-second automatic offers are deferred.

`measuredScopes(db, orderIds)` returns an ID-keyed object in batches of50. Each measured scope has exactly:

`{requirementsRevision,grams,cm3,pieces,seats,items,equipment,rotationPolicy,routeSeconds,serviceSeconds,pickupAfter,pickupBefore,dropoffBefore}`.

Each item remains `{count,gramsEach,lengthMm,widthMm,heightMm}`. These are revisioned scope/time inputs, not an ETA promise. Root's optional `GET /api/jobs?capacityProtocol=1` and `GET /api/orders/:id?capacityProtocol=1` attach `measuredScope` or null after existing authorization. Installed reads have no new field. No reviewer, issuer, evidence reference, reason, vehicle approach point or route geometry is exposed. Stranger detail preserves404, anonymous401. Legacy omitted-protocol flows remain unchanged; enrolled/measured work still cannot downgrade resource enforcement by omitting the protocol.

## Migration and executed checks

`server/db/postgres-eligibility-repairs.sql` is forward migration7, explicitly loaded after phone6 by root. Adds only `order_approaches`, its index/append-only trigger, the bounded physical-resource helper, and replacement assignment guard. Root classifies the approach table as auxiliary for legacy import. Capability now requires installed migration7. Fresh test schemas receive7 through the normal loader; file5 was not edited or represented as an upgrade for an already-applied migration.

Executed using Node24 prefix `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning`, only loopback `postgresql://fastship_test@127.0.0.1:55473/fastship_test`, isolated `wp03_` schemas and coordinated sequential migration windows:

- `tests/eligibility-review.mjs`:22 scenarios green, including positive direct-SQL control and two simultaneous direct claims; initial repro run recorded API200 instead of409 in overdue/missing-approach/both permit cases, and missing SQL rejection.
- `tests/coverage.mjs`, `tests/capacity.mjs`, `tests/eligibility.mjs`, `tests/eligibility-legacy.mjs`: all green on7. Owned fixtures now explicitly supply synthetic approach evidence; protocol1 attempts echo revision1. Offer regression explicitly refreshes approach after vehicle revision.
- `tests/pg-contracts.mjs`:90 installed +20 additive endpoint boundaries,174 exchanges,21 transitions green with phone6+repair7.
- `tests/pg-claims.mjs`:100 contenders/one winner, mixed/exclusive modes, parcel batching and last-of200 race green.
- `tests/pg-cash.mjs`:green.
- `tests/pg-import.mjs`:29 legacy tables/135 synthetic rows, original/imported/restored HTTP parity, actual pg_dump/custom + pg_restore and exact reconciliation green. Directory `C:/Users/osama/AppData/Local/Temp/wind-wp03-import-iZ6IaN`; restored database `wp03_restore_deedae8fe16443758293afbc48966be0`.
- `npm run lint`, `npm run typecheck`, scoped `git diff --check`:green.

Root runs the combined persistence/default integration gate after the phone packet. No independent broad rerun is claimed here. SQL intentionally duplicates the bounded physical certificate, not document/permit/coverage policy. Existing custody transitions remain exempt so expired evidence and inspected overload cannot strand existing proof/return work. No capacity is released merely because a planned time passed. No road/GPS/provider evidence or precise arrival guarantee is invented. Operational activation still needs approved legal coverage, actual operator measurements and field-validation of these manual timing practices.
