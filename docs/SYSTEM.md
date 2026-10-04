# Wind — system requirements and implementation plan

## 1. Architecture

```text
Customer app (Expo) ─┐
Driver app (Expo) ────┼── HTTPS API + authenticated real-time events
Operations web ──────┘                 │
                              PostgreSQL + PostGIS
                              queue/jobs + object storage
                              licensed payment provider
                              maps/routing + SMS/push
```

Use a modular monolith for the API at first. One database transaction owns assignment and order-state changes; a queue handles notifications, retries, and settlement. Separate services only when measured scale or team ownership requires it. The customer prototype in this repository is the UI starting point, not the production backend.

### Suggested implementation

- **Mobile:** Expo/React Native, one shared codebase with separate customer and driver entry points; Arabic RTL and English.
- **API:** Node.js/TypeScript with a small HTTP framework; PostgreSQL/PostGIS for orders, geographic queries, and audit events.
- **Real time:** authenticated WebSocket/SSE order events; APNs/FCM push for background updates, SMS fallback for critical handoffs.
- **Maps:** provider with validated West Bank routing and a manual override; pin, landmark, and phone contact always available. Never treat map route length as a guaranteed travel time.
- **Storage:** private object storage for proof photos and driver documents, short signed access URLs.
- **Payments:** one PMA-licensed provider first; tokenized card/wallet flow, no card storage in Wind.

Validate API/framework/provider choice against current pricing, availability, and contractual terms before implementation.

## 2. Core data and constraints

| Entity | Essential fields |
|---|---|
| User | id, verified phone, language, roles, deletion state |
| Driver | user id, verification state, service permissions, operating zones |
| Vehicle | driver/fleet owner, class, seats, dimensions, weight, plate, license/insurance expiry |
| Service zone | city polygons, permitted origin/destination pairs, time windows |
| Quote | service, route/vehicle/extra breakdown, currency ILS, expires_at, tariff version, status |
| Order | requester, service, addresses/landmarks, recipient, quote, status, payment choice, created_at |
| Assignment | order, driver, vehicle, offer expiry, accepted_at, ended_at, reason |
| Location point | assignment, coordinate, accuracy, received_at, device timestamp |
| Handoff proof | order, pickup/dropoff type, PIN hash or signed proof, photo pointer, actor, timestamp |
| Payment ledger | order, payer, provider reference, debit/credit entries, refund/settlement state |
| Order event | monotonic sequence, state, actor, timestamp, reason, metadata |

Database constraints: one active assignment per order; unique provider payment reference; unique idempotency key per booking/payment command; nonnegative prices; allowed state transitions; document expiry blocks driver activation. Keep money in integer minor units and timezone-aware timestamps.

## 3. State machine

```text
draft → quoted → requested → searching → assigned → at_pickup
      → picked_up / boarded → in_transit → at_dropoff
      → proof_pending → completed → settled
                    ↘ canceled / failed / return_required / disputed
```

Parcel and freight require pickup and dropoff proof. Ride requires boarding confirmation and trip completion, with no parcel PIN. Cancellation, failure, return, and dispute are explicit states with reason, fee, and actor. A state update requires the expected prior version; stale or duplicated commands are rejected or safely replayed.

### Hard cases

- **No suitable vehicle:** keep request in searching for a bounded window, then offer schedule or cancel; never assign a small car to a declared large load.
- **No GPS or network:** show stale timestamp and last known point; driver actions queue locally with event IDs, then reconcile in order. Dispatch can call and manually update with an audit reason.
- **Road blocked:** driver flags delay; ETA becomes uncertain, customer is notified, and support can reassign or cancel.
- **Recipient absent:** timed contact attempt, then return or reattempt quote approved by payer.
- **Load mismatch:** pause pickup, capture evidence, request new quote or cancel. Driver cannot add an unapproved fee.
- **Payment fails:** order is not falsely marked paid; support sees a separate payment state and reconciliation queue.
- **Safety issue:** in-app emergency/support action freezes normal completion and preserves the event trail.

## 4. Pricing and dispatch

**Pricing:** start with published, configurable route/vehicle tariffs. Quote = base + route band + vehicle/load/seat extras + loading help + explicit taxes/fees − promotion. Use an ETA range, not a single promised minute on constrained routes. Quote stores tariff version and expires after a short period. No automatic surge pricing at launch. Manual quotes for loads outside defined capacity bands.

**Dispatch:** filter drivers by active verification, vehicle capacity, service permission, city-pair/zone, online state, and absence of another active assignment. Rank the eligible group by practical pickup ETA and acceptance reliability. Offer to one or a small batch with a timeout; assignment is committed atomically. Start with dispatcher override before sophisticated optimization.

**Privacy:** the customer sees driver name, vehicle, plate, and live location only for an assigned active job. A recipient gets a scoped, expiring tracking link. Driver location collection starts on accepted assignment, is sampled while the job is active, and stops at terminal state. Retain precise traces for a limited incident window, then aggregate or delete according to an approved policy.

## 5. API contract, first slice

- `POST /auth/otp/request`, `POST /auth/otp/verify`
- `GET /coverage?service=&origin=&destination=`
- `POST /quotes` → tariff version, breakdown, expiry, availability
- `POST /orders` with quote ID and idempotency key
- `GET /orders/:id`, `GET /orders/:id/events`
- `POST /orders/:id/cancel`, `POST /orders/:id/approve-requote`
- `GET /driver/offers`, `POST /driver/offers/:id/accept`
- `POST /driver/orders/:id/status`, `POST /driver/orders/:id/location`
- `POST /orders/:id/proof`
- `POST /payments/provider-webhook` (signature verified, idempotent)
- `POST /support/cases`

Every write checks actor role and order ownership. Event payloads include an order sequence and server time so an older location/status cannot overwrite a newer one.

## 6. Nonfunctional requirements and release gates

| Area | Requirement / gate |
|---|---|
| Accessibility | Arabic/English, RTL, screen reader labels, dynamic text, visible focus, 44-point touch targets, error text near fields. |
| Reliability | Booking/payment commands idempotent; recovery from repeated taps, weak networks, and app restart; no lost accepted order. |
| Security | HTTPS, least-privilege roles, encrypted sensitive data, verified webhook signatures, OTP rate limits, audit logs, no raw card data. |
| Location | Accuracy and last-updated time shown; no fake movement; precise location only for active job and permitted users. |
| Performance | Booking flow works on budget Android devices and poor mobile data; cached city list and queued driver events. |
| Observability | Trace each order ID across API, dispatch, location, proof, payment, and support; alerts on stuck state/failed settlement. |
| QA | Real-device iOS/Android tests for RTL, denied location, no network, city coverage, quote changes, handoff, and payment failure. |

## 7. Local operations and legal validation

Before any real booking:

1. Confirm passenger-transport permissions, driver/vehicle licensing, insurance, and operating regions with the relevant authorities and transport partners.
2. Confirm whether Wind itself needs an express-courier license or can operate through a licensed carrier; the [ministry publishes a 2025 licensed-company list](https://mtde.gov.ps/uploads/files/20250925085342_%D8%B4%D8%B1%D9%83%D8%A9_%D8%A7%D9%84%D8%A8%D8%B1%D9%8A%D8%AF_%D8%A7%D9%84%D9%85%D8%B1%D8%AE%D8%B5%D8%A9_2025.pdf).
3. Confirm courier e-payment obligations and the over-₪500 rule from the [ministry's 2025 announcement](https://www.mtde.gov.ps/home/news/23075?culture=ar-SA); contract with a provider from the [PMA directory](https://www.pma.ps/supervision-institutions-companies/electronic-payment-service-companies).
4. Set prohibited goods, damage/insurance, customer refund, cancellation, privacy/retention, emergency, and support policies with local counsel and pilot partners.
5. Drive test each enabled city pair at representative times; validate maps, road restrictions, expected fare, safe pickup points, and fallback route.

## 8. Build plan

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 — discovery | Interview senders, riders, movers, drivers, taxi offices, couriers; map city pairs and tariff/permit rules. | Signed-off service policy, route matrix, fare model, and verified partner supply for each enabled city. |
| 1 — booking core | Production customer booking, driver offer/acceptance, dispatcher console, OTP auth, quote and state machine. | End-to-end real order can be completed and canceled without state conflict. |
| 2 — trust and tracking | Active-job GPS, ETA confidence, recipient link, pickup/dropoff proof, incident tools, offline retry. | No invented location; proof and recovery cases pass on real devices. |
| 3 — money and pilot | Licensed digital payment, cash/COD ledger, payouts, refunds, support workflows, receipts. | Daily reconciliation balances; pilot across several approved West Bank cities. |
| 4 — scale | Add routes and supply only after service-level, safety, and unit-economics review. | Each new city/service pair passes the same coverage and operations gates. |

The first pilot should include multiple city pairs, but the app must expose only those with verified supply and permitted routes. The order of cities comes from partner availability and field tests, not a hard-coded assumption.

## 9. Current repository versus production

The repository runs one Expo app with customer, driver, and admin roles, plus a zero-dependency Node 24 API (`server/main.ts`, SQLite). Parcel delivery is enabled by default. Operators opt into passenger rides or freight with the comma-separated `WIND_ENABLED_SERVICES` setting after verifying supply, permissions and service policy. Dispatch allows one active job per driver; new shared bookings and pooling are disabled.

Built: phone + password accounts, driver approval, motorcycle/bicycle/car/van/truck matching, server-side quotes from admin-editable tariffs (stale quotes rejected), durable booking retry identities, handover codes for parcels and loads, active-job foreground GPS with a high-accuracy first fix and customer-visible stale handling, a latest-completed-trip card plus receipts and history, a rotating no-account trip-share link (status, cities, driver first name and vehicle, fresh position only), saved Home/Work/other places plus recent landmarks from past orders in the booking city sheet, an in-trip safety toolkit (Police 100, Ambulance 101, Civil Defence 102 call buttons plus a report to Wind safety that pauses the driver's steps until an administrator resolves it; the other party sees only a neutral pause), cancel/release, ratings, calculated earnings, commission snapshots at acceptance, subscription accounting, admin dashboard, support password reset, account deletion and a privacy page. Motorcycles can match parcels and licensed rides; bicycles match parcels only. Five incorrect delivery-code attempts lock completion. An administrator can reopen attempts from the order details after contacting and verifying the recipient and recording a reason; completion still requires the recipient's code.

Still simplified versus the plan above, in order of likely need:

- **Self-service signup has no SMS provider.** The current production mode accepts
  name, email, Palestinian mobile and password; customers enter immediately and
  driver applicants wait for administrator approval. Neither contact value is
  verified. Administrators cannot self-register, and the future contact gate must
  remain off until a proof or approval path is ready.
- **No push notifications:** screens poll while open. Drivers must keep the app open to see new jobs.
- **Driver location is foreground-only**, latest point only.
- **Cash only**; plans are paid offline and activated by an admin.
- **Single instance:** SQLite on one local persistent volume with WAL, foreign keys, full synchronous commits and bounded busy waits. Authentication/password attempt budgets survive restart in SQLite. Move to a shared transactional store before running several API instances.
- **Distance is straight-line × 1.3**, not a routing engine. Listed cities are accepted inputs; the code does not yet verify route coverage or geofence operating regions.
- **Recovery hardening:** advance commands bind a UUID, resource and expected prior status; lost acknowledgements replay without a second transition or duplicate proof failure. POST authorization is checked again after reading the body. Readiness checks storage; shutdown drains accepted requests. Restore drills and off-host backup policy still belong to the deployment operator.
- **Delivery exceptions are basic:** an in-transit parcel/load can go `on_hold` (absent, refused, unreachable, wrong address); an administrator reattempts or returns it with a recorded reason; `returned` needs the sender's return code; one customer dispute per finished order within seven days gets a recorded resolution. There is still no pickup evidence, return fee, refund movement or insured-loss workflow. Restrict real service to an approved operating policy with staffed support until those workflows are implemented and field tested.

## 10. Parcel launch workflow checklist

This is an operator acceptance checklist, not a list of implemented features. Current source supports one assigned parcel per driver, foreground location, pre-pickup cancel/release, recipient-code completion and calculated commission. It supports on-hold failed delivery, admin reattempt/return decisions, sender-code return closure and recorded disputes, and a driver cash ledger (commission owed, numbered handovers confirmed by the driver, reasoned adjustments), but not pickup/return photo evidence, return fees, refunds or per-order fare collection records. Those remaining gaps still block unsupervised public parcel service.

| Gate / owner | Before accepting real parcels | Evidence needed to pass |
| --- | --- | --- |
| Scope — operator | Keep `WIND_ENABLED_SERVICES=parcel`, one active job and no pooling. Approve actual city pairs, hours, drivers and package size/weight/value limits; reject unsuitable packaging or prohibited goods. No rides, freight, regulated goods or collection of item-sale proceeds in the initial scope. | Approved service matrix, driver/vehicle checks and an exercised rejection procedure. Current city/size choices do not enforce operating zones or measured package limits. |
| Pickup — driver + dispatcher | Match parcel/order ID, sender and destination; confirm sealed packaging/condition and record transfer of custody before transport. Resolve a missing sender or mismatched parcel before collection. | Private pickup record tied to the order, with actor/time and minimal condition evidence. Current `at_pickup → in_transit` has no pickup proof. |
| Recipient absent/refusal — driver + support | Follow an agreed contact/wait window, record attempt time/reason and contact support. Keep the parcel secure; never invent a recipient code, unattended delivery or successful delivery. Agree redelivery/return, responsible party and any fee before acting. | Field drill. Source records the reason in an `on_hold` state and an audited admin decision; contact/wait windows are still a staff procedure. |
| Return — dispatcher + sender | Authorize and track return custody, route, fee and handback to the sender. Link it to the original delivery; confirm sender receipt separately from recipient delivery. | `returning` → `returned` requires the sender's return code and is audited separately from delivery. Return fee, route and photo evidence are not implemented. |
| Lost/damaged/disputed — support | Secure the parcel/evidence, open a case with the order ID, get each party's account and preserve relevant packaging/condition/value evidence. Assign one decision owner; record outcome, refund/compensation approval and notification under the operator's agreed policy. | Case access/retention policy, acknowledgement target and exercised resolution. Do not promise insurance, compensation or a foreign carrier's claim deadline. Source records one dispute per finished order and an audited resolution; evidence capture and compensation are not implemented. |
| Cash remittance — driver + cashier | Specify who pays the transport fare. Issue a numbered receipt; reconcile expected fare against collected/refunded cash, agreed driver share, commission due and actual remittance. Two people confirm settlement and investigate every difference. Keep item-sale money separate and out of this pilot. | Per-order cash record and signed shift reconciliation. Source records commission owed per driver, numbered handovers (`R-000123`) that count only after the driver confirms, and reasoned adjustments. Per-order fare collection, refunds and shift reconciliation are not implemented. |
| Safety/outage — dispatcher | Establish reachable on-call support, safe stop/custody and blocked-driver procedures. Reconcile the existing request/reference after a timeout or restore; do not rebook an uncertain parcel under a new identity. | Drills for lost network, wrong proof, blocked driver holding a parcel, restore and missing cash; pause dispatch if custody or balance cannot be explained. |

These recommendations draw on separate pickup/dropoff/return verification in [Uber Direct proof documentation](https://developer.uber.com/docs/deliveries/guides/proof-of-delivery), failed-dropoff contact/return handling in [Uber's merchant guidance](https://help.uber.com/merchants-and-restaurants/article/package-delivery-issues?nodeId=fe3073df-6fb3-43fa-a254-b05169b7763a), traceable collection/remittance in [DHL eCommerce's service description](https://www.dhl.com/th-en/home/ecommerce.html), and packaging/value evidence in [FedEx claims guidance](https://www.fedex.com/en-us/customer-support/claims.html). These are workflow examples from other markets, not Wind provider contracts, local legal requirements, time limits or feature availability. Operator choices above must be approved and field tested locally.
