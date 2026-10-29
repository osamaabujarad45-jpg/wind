# SPEC: change destination on an assigned order

## Product decision

The customer may propose a new destination and confirm the quoted cash fare, but
the assigned driver must accept it before the destination, fare, discount or
commission changes. Declining, expiry, cancellation, release or a changed order
leaves the original agreement in force. A notification is an invitation to review,
not proof that a driver has seen or accepted it.

## Scope and pricing

- SQLite cash orders in `assigned`, `at_pickup` or `in_transit` may be changed;
  held, returning, finished, cancelled and unassigned orders may not. PostgreSQL
  payments, cash receipts and ledger integrations are not included in this cash
  change and must reject it until separately designed and verified.
- The customer chooses a city and delivery landmark. The server uses the existing
  `recommend` calculation, original pickup and service options, and current tariff
  and customer plan. It returns an expiring quote and road warnings; it never trusts
  a client-supplied fare. A customer confirms the old and new cash totals before
  the driver is notified. Discounts are recalculated with the existing redemption
  rules; commission remains based on the gross fare.
- Reachability (Uber reference, decided 29 Oct 2026): the driver's order screen
  polls the authoritative pending view every four seconds, so the in-app card is
  the delivery channel exactly as Uber's in-trip prompt is; push only nudges and
  never gates a proposal. SQLite sends best-effort Web Push; PostgreSQL enqueues
  Web Push and native Expo tokens through the outbox worker
  (`server/domain/events.ts`, `server/worker.ts`), so native-only drivers are
  covered where native registration exists. A subscription is not proof of
  delivery and expiry leaves the original terms in place; there is no
  unreachable error left to raise.
- The original assignment's commission *rate* is retained at acceptance and used
  on the new gross fare. Old assignments contain only a rounded commission amount:
  their original rate cannot be recovered reliably, so this feature is unavailable
  for them instead of substituting today's rate. A reassignment takes a new snapshot.
- A quote expires after two minutes; a customer-confirmed proposal expires after
  ten minutes. Only the assigned driver may accept or decline it. The server checks
  the unchanged assignment, status, original order values and safety state again
  under a write transaction. Stale proposals cannot be applied or replayed to a
  different driver. A retried decision returns the same result.
- Applying a change updates the destination, fare, discount, recommendation, route
  distance and commission in one transaction, and records an audit event. The
  customer's and driver's screens refresh from the authoritative order; the existing
  road/ETA hooks fetch the new route and road alerts. Until acceptance the old route
  and amount remain authoritative.
- Cash due is `price - discount`, and the finished-order cash balance uses the new
  commission and discount. The app must show the old and new due amount and tell
  both parties to settle any cash already handed over directly; the cash-only path
  cannot infer or record that transfer. Decided 29 Oct 2026 (Uber reference): no
  ledger entry is added for the delta — `cash_entries` is the driver-to-HQ
  remittance ledger that feeds the driver cash balance, and a fare delta would
  corrupt it; Uber likewise records only the updated fare on the receipt.
  Reconciliation uses the accepted order row plus the `DESTINATION_ACCEPTED`
  security event, which carries the old and new price and discount.

## Verification and rollout

Test roles, fare and discount changes, preserved assignment rate after settings or
plan changes, proposal/decision retries, rejection, expiry, assignment/status races,
road/ETA invalidation, cash totals after completion and notification payloads. Run
lint and typecheck. The existing schema adds nullable `users.plate`,
`orders.picked_up_at` and `orders.commission_rate` on first SQLite boot; take a
consistent backup of the live database (including WAL state) before rollout. Do
not deploy as part of this work.
