# Darbna — system requirements and implementation plan

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
- **Payments:** one PMA-licensed provider first; tokenized card/wallet flow, no card storage in Darbna.

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
2. Confirm whether Darbna itself needs an express-courier license or can operate through a licensed carrier; the [ministry publishes a 2025 licensed-company list](https://mtde.gov.ps/uploads/files/20250925085342_%D8%B4%D8%B1%D9%83%D8%A9_%D8%A7%D9%84%D8%A8%D8%B1%D9%8A%D8%AF_%D8%A7%D9%84%D9%85%D8%B1%D8%AE%D8%B5%D8%A9_2025.pdf).
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

The current Expo app implements the visual customer journey with local demo state and a device-location permission request. Its city coordinates are map previews, and its sample quote is deliberately **not** a production tariff. Production work starts by replacing the demo quote and local state with the API, coverage matrix, payment, dispatch, and genuine driver GPS described above.
