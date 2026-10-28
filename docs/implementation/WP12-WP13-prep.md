# WP12/WP13 prep: courier/freight resource contracts, then balanced money

Read-only preparation. Plan sections 12 and 13. Both build on WP05's measured
capacity model (`server/domain/eligibility.ts`) and WP03's money reconciliation
(`server/migrate.ts reconcile()`), which already prove driver open obligations
from orders + `cash_entries`.

## WP12 baseline (verified)

- Courier run sheet, capacity reservations (`capacity_reservations`,
  `capacity_stops` with pickup-before-dropoff positions), and the conservative
  fixed-axes packing certificate already exist via WP05. `Eligibility.guard`
  reserves the full planned load for accepted pickups
  (`reservationPolicy: 'all_accepted_pickups_until_finished'`).
- Freight keeps the negotiated-offer flow: 50%-200% band around the
  recommendation and 600s negotiated life (`negotiatedOfferSeconds`), distinct
  from WP10's 15s automatic offers. Do not merge the two offer objects.
- Missing per plan §12: parcel item count / declared dimensions / mass /
  volume / value / custody records as first-class order data (today only in
  measured `order_requirements`), freight equipment/crew/loading-window/access
  constraints, promised windows per stop, and the private-object pipeline.

## WP12 work items (ordered)

1. Parcel/freight declared-scope schema (migration after WP11): item count,
   declared dims/mass/volume/value, custody records; freight equipment, crew,
   loading windows, access constraints; stop promised windows + reserved
   capacity deltas. Merchant/source references stay idempotent.
2. Acceptance reserves the full planned load including accepted pickups;
   a pickup mismatch pauses for inspected capacity / customer-approved scope
   change / support exception. A driver can never add an unapproved fee.
3. Private objects: Blob upload authorization, content-type/size/checksum,
   quarantine/scan, private reads, purpose-based retention. An uploaded file
   alone never changes custody. Proof photos/signatures stay off until the
   privacy approval named in plan §12 exists. Do not start collecting driver
   ID scans because storage exists.
4. Tests: weight/volume overflow, dimension/equipment mismatch, multiple
   accepted pickups, same vehicle/session conflict, unknown legacy size,
   partial handoff, failed second pickup, customer cancel with cargo, return
   as manual stop, duplicate partner request, object guessing/expired
   access/wrong account/malicious upload. Legacy parcels remain finishable.

## WP13 baseline (verified)

- Money today: orders carry REAL `price`/`commission`/`discount` in SQLite and
  minor-unit columns in PostgreSQL; `cash_entries` is append-only (immutable
  trigger verified in `tests/pg-import.mjs`); whole-ILS payable rounding and
  tariff snapshots are frozen by WP01/WP08 contracts.
- `reconcile()` already computes per-driver open obligations
  (finished commission - discount + adjustments - confirmed remittances) and
  pg-import proves imported totals match. WP13 generalizes this into journals
  without rebooking transport revenue.

## WP13 work items (ordered)

1. Ledger schema (migration after WP12): accounts (platform revenue, driver
   payable/receivable, promo expense, provider clearing, customer receivable,
   merchant COD payable), immutable journal headers/entries, every journal
   balances debits=credits per currency, minor units/basis points validated,
   unique business references.
2. Migration: import confirmed/pending/disputed cash entries and commission
   snapshots without rebooking revenue or losing driver-confirmed remittance
   semantics; returned jobs keep current settlement; cancelled unperformed
   jobs invent no earnings; Plus/Pro snapshots preserved.
3. Cash behaviour: due/collected/collector/receipt are distinct facts;
   remittance confirmation/disputes auditable; corrections are
   reversals/adjustments with reason + staff authority, never balance edits.
4. Projected cash exposure (activates WP10's deferred cap): under the
   driver-account lock, exposure = unsettled collection liabilities + every
   reserved/accepted cash obligation + proposed job; reject new work above
   100000 minor (₪1,000, `projectedCashCapMinor`, `cashCapActivated: false`
   until finance calibration). Concurrency cannot reserve the same remaining
   exposure twice; active jobs/support stay alive.
5. Tests: duplicate completion/remittance, partial collection/change, wrong
   amount/currency, refund after commission, discount funding, shortfall/
   dispute, concurrent last-exposure job, return after collection,
   subscription-rate change after assignment, migration totals/overflow;
   every account reconciles to orders/cash with no unowned residual.
   Independent finance sign-off of example journals is an owner gate.

## Gates

WP14 (Bank of Palestine) stays coded-but-off without a merchant agreement;
WP13 must not fake provider clearing. Admin profit must not be relabelled as
contribution margin; cost attribution is additive reporting only.
