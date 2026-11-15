# Owner product decisions — 14 November 2026

These are explicit owner decisions collected during the resumed implementation session. They authorize source implementation and isolated verification only; they do not authorize deployment, production migration, payment activation, paid AWS resources, Git mutations or production GO.

## A11 — narrow SQLite amendment approved

Implement door-collected cash/variance in the narrow SQLite pilot, with a corresponding reviewed PostgreSQL migration/import destination.

- One immutable fact per order: expected minor units, collected minor units, typed variance reason, actor and replay identity.
- Expected amount is the delivery fare minus the recorded discount. Merchandise COD and automatic balance forgiveness are not included.
- Exact collection requires no variance reason; under- and over-collection require a compatible reason.
- Approved variance vocabulary:
  - `PARTIAL_PAYMENT`
  - `CUSTOMER_DID_NOT_PAY`
  - `APPROVED_DISCOUNT`
  - `RETURNED_ITEMS`
  - `INCORRECT_CASH`
  - `OTHER_ADMIN_REVIEW`
- Independent negative-adjustment approval, append-only corrections, old-snapshot compatibility and reconciliation remain mandatory.

## A12 — priority policy approved

Implement `standard` and `same_day` as parcel attributes, not a second order type or lifecycle fork.

- Existing orders default to `standard`.
- `same_day` uses an **Asia/Jerusalem 12:00 booking cutoff**.
- Priority surcharge is **zero** in this initial policy.
- Priority consumes the existing booking capacity; there is **no reserved capacity** in this pass.
- Quote identity, booking/pending-command validation, customer and partner replay identity, persistence and displayed order details must include the attribute.
- Boundary-time, capacity, non-parcel, unknown-value and quote/replay compatibility tests are required.

## A5 — minimal PostgreSQL shift/custody model approved

After the isolated Option A rehearsal:

- Each parcel **order** is one custody unit; individual items within an order are not separate custody units in this pass.
- One active shift per approved driver, with explicit driver start/end and the existing vehicle assignment.
- No vehicle-QR dependency and no automatic production dispatch.
- Queue listing and claiming require an active shift; claims have one atomic winner.
- Custody events are per-order, append-only, replay-safe and role/assignment fenced.

Physical acceptance, provider delivery, live operations and production activation remain separate evidence gates.
