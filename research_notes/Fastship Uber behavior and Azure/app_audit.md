# Fastship current app audit

Audit date: 26 October 2026. This report covers local source and locally executed checks, not the current deployed build. The repository calls the product **Wind**. Launch geography confirmed by the owner: Palestine; include passenger rides, parcel delivery, and freight. No app implementation, deployment, commit, payment, or outward message was requested or performed in this audit.

## What does the current app actually implement?

### Takeaway

This is a substantial working vertical slice with a real server, not a mock screen collection. Preserve and extend the existing behavior instead of rebuilding it. Its biggest difference from Uber is the operating model: public driver job selection and rider-selected negotiated offers, rather than a nearby online driver dispatch engine.

### Cited Findings

| Area | Observed implementation | Evidence |
|---|---|---|
| Runtime | Expo SDK 57 (`~57.0.31`), React Native 0.86.3, React 19.2.3, Expo Router, TypeScript; npm lockfile, no Bun lockfile | [package.json](../../package.json:8) |
| Services | Parcel, ride, freight modeled. Server enables only `parcel` unless `WIND_ENABLED_SERVICES` explicitly enables the other services | [model](../../src/model.ts:17), [server](../../server/main.ts:34) |
| Geographic scope | Ten hard-coded West Bank cities; nearest-city calculation; coverage uses a 15 km circle around each city rather than legal/operational polygons | [cities](../../src/model.ts:3), [coverage](../../src/model.ts:144), [server pin check](../../server/main.ts:1012) |
| Roles | Customer, driver, administrator in one app; driver can be pending/active/blocked | [model](../../src/model.ts:18), [routes](../../src/app/_layout.tsx) |
| Real backend | Zero-dependency Node 24 HTTP server; synchronous `node:sqlite`; WAL, foreign keys, `synchronous=FULL`, 250 ms busy timeout; durable sessions/throttles/order commands | [server](../../server/main.ts:2), [database](../../server/main.ts:122), [schema](../../server/main.ts:161) |
| Identity | Phone/email plus password; scrypt password hashes; hashed bearer session tokens; 90-day sessions; native SecureStore and browser localStorage. Production permits operator-verified or self-service modes; optional contact-verification gate | [identity mode](../../server/main.ts:22), [password hashing](../../server/main.ts:349), [storage](../../src/api.ts:20), [authentication](../../server/main.ts:2305) |
| Email | Provider adapter sends verification/reset/support identity codes via Cloudflare Email Service; actual provider domain configuration is external | [code purpose](../../server/main.ts:598), [email adapter](../../server/main.ts:608), [prior QA email configuration status](../../docs/QA-2026-10-21.md) |
| Quotes | Server-calculated prices; quote recommendation is recalculated before booking; stale displayed price becomes `price_changed`; persisted request IDs replay an already committed order | [recommend](../../server/main.ts:1020), [price check](../../server/main.ts:1067), [booking idempotency](../../server/main.ts:1093) |
| Parcel fare | Default flat ₪20, +₪10 for large, Plus 15% discount; not distance priced | [settings](../../src/model.ts:71), [parcel fare](../../src/model.ts:165) |
| Ride/freight price | Base + road km, freight size/loading extras, minutes beyond 50 km/h baseline plus checkpoint delays, 20% night uplift 22:00–05:59 Palestine time, Plus discount; round to whole shekel; fallback road distance = haversine × 1.3 | [price algorithms](../../src/model.ts:159), [smart price](../../src/model.ts:188), [server routing/fallback](../../server/main.ts:1025) |
| Marketplace offers | Drivers may accept recommended price or counteroffer 50%–200%; offer expires after 10 minutes; customer sees up to 20 cheapest eligible offers | [offer band](../../src/model.ts:206), [offer eligibility](../../server/main.ts:456), [offer listing](../../server/main.ts:476), [offer commands](../../server/main.ts:1571) |
| Job discovery | Active drivers query first 50 searching jobs, chronological/scheduled pickup ordering, service/vehicle match and optional destination-city filter; there is no nearest-driver ranking here | [jobs endpoint](../../server/main.ts:1528) |
| Assignment | SQLite transaction plus conditional `status='searching'` write prevents two drivers claiming same order; no mixing a passenger/freight assignment with other active work | [atomic acceptance](../../server/main.ts:1544), [capacity rule](../../src/model.ts:169) |
| Alerts | Web Push only; notifications fan out to at most 100 compatible drivers in random order; pending push array is process memory; delivery is best effort | [native exclusion](../../src/push.ts:1), [outbox](../../server/main.ts:929), [delivery](../../server/main.ts:944), [random driver alerts](../../server/main.ts:954) |
| Driver presence | Driver jobs page checks account active state and polls every 8 seconds; its “online” indicator does not correspond to a server presence/online-session entity. Location API explicitly requires an active assignment | [driver page](../../src/app/driver/index.tsx:18), [online strip](../../src/app/driver/index.tsx:97), [location gate](../../server/main.ts:1754) |
| Vehicle matching | Vehicle enum limits services: motorcycle/car rides, bicycles parcel only, vans parcel/freight, trucks freight; it lacks a separately verified vehicle, actual seat/weight/volume dimensions, license and insurance expiry model | [vehicle model](../../src/model.ts:19), [vehicle services](../../src/model.ts:59), [user data](../../src/model.ts:84), [servesFor](../../server/main.ts:402) |
| Courier batching | Up to 200 parcel assignments for every parcel vehicle; rides/freight exclusive; run sheet groups pickup/delivery/return by city then count rather than optimizing stop order | [capacity](../../src/model.ts:169), [run sheet](../../src/model.ts:251) |
| State transitions | `searching → assigned → at_pickup → in_transit → completed`; cancellation, on_hold, returning, returned; expected-status checks and reusable command IDs for transitions; a safety hold blocks normal progression | [statuses](../../src/model.ts:21), [advance](../../server/main.ts:1638), [driver command](../../server/main.ts:1728) |
| Proof | Four-digit parcel/freight handover code; five failed attempts lock further attempts; return code for sender; ride has no parcel PIN | [creation](../../server/main.ts:1083), [completion proof](../../server/main.ts:1646) |
| Exceptions | Absent/refused/unreachable/wrong address, support reattempt or return decision, dispute once per finished order, support credit codes | [exceptions](../../server/main.ts:1666), [admin decision](../../server/main.ts:1695), [dispute](../../server/main.ts:1337) |
| GPS | Native background location task, foreground-service options, authority checks, age-based ordering, 2 s minimum uploads, old fixes dropped, accuracy/heading, plausible-jump filter; only last location stored per driver | [background tracker](../../src/background-location.ts), [delivery policy](../../src/location-delivery.ts:22), [server acceptance](../../server/main.ts:1754), [location row](../../server/main.ts:147) |
| Live location delivery | Ordinary screen polling plus authenticated long-poll for driver fixes; 12-second hold, 20 watchers/order and 200 global; no durable event replay across reconnect | [client](../../src/api.ts:38), [live channel](../../server/main.ts:1814) |
| Routes/checkpoints | Private OSRM driving profile; up to three alternatives; checks within 200 m of reported closure; tries ten detours 1–8 km either side; chooses fastest usable option; if none clears closure, returns fastest with `through` disclosure. Uses in-memory geometry-budgeted LRU cache | [OSRM](../../server/main.ts:1868), [closure routing](../../server/main.ts:1884), [fallback selection](../../server/main.ts:1922) |
| Local ETA policy | Slow and closed checkpoints add fixed 15 and 30 minutes; checkpoint reports fresh two hours; shared courier run suppresses misleading direct-to-recipient ETA | [constants](../../src/model.ts:190), [report freshness](../../server/main.ts:1470), [shared run](../../server/main.ts:446) |
| Schedules | Up to 7 days ahead; becomes visible to drivers 30 minutes before pickup; minute interval releases alerts; rescheduling only supported for parcels; ride/freight cancel and rebook | [release window](../../server/main.ts:21), [booking bounds](../../server/main.ts:1072), [release worker](../../server/main.ts:969), [reschedule](../../server/main.ts:1260) |
| Safety/privacy | SOS incident holds, admin resolution, revocable scoped tracking links, hidden pre-assignment address/phone/recipient details; account deletion and session revocation; precise stale fix omitted after 120 seconds | [redaction](../../server/main.ts:414), [tracking link](../../server/main.ts:1296), [SOS](../../server/main.ts:1384), [deletion](../../server/main.ts:752) |
| Communication | Authenticated trip chat, quick replies, 24-hour post-trip access policy; real phone contact/WhatsApp rather than masked calling | [chat](../../server/main.ts:1433), [support contact](../../src/api.ts:14) |
| Cash | Cash fare + commission snapshot; driver remittance entry must be confirmed by driver; disputes and reasoned adjustments; cents for cash ledger, but order fare/commission are SQL REAL and floating-point JS calculations | [money schema](../../server/main.ts:137), [commission calculation](../../src/model.ts:210), [cash ledger](../../server/main.ts:1993) |
| Revenue | Default 15% commission, Pro 5%; customer Plus ₪29, driver Pro ₪99; subscriptions requested in app and admin activated after cash/bank transfer; promotional credits/referrals exist | [settings](../../src/model.ts:71), [subscriptions](../../server/main.ts:2072), [referrals](../../server/main.ts:871) |
| History/quality | Order history with pagination, receipts, driver/customer ratings and driver price rating, saved/recent places, rebooking, send another parcel. Rating commands are **completed-only** for both parties; returned orders remain finished for settlement, disputes and history, not rating eligibility | [history](../../src/model.ts:46), [driver-to-customer rating guard](../../server/main.ts:1280), [customer rating guard](../../server/main.ts:1286), [saved places](../../server/main.ts:783), [screens inventory](../../docs/screens/README.md) |
| Partner integration | Souq partner quote/order/reference/cancel/tracking bridge with idempotent external reference | [partner schema](../../server/main.ts:154), [partner API](../../server/main.ts:1136) |
| Deployment shape | Railway single replica; Docker image builds web bundle with Railway API URL compiled into it; API and static web share runtime; SQLite path `/data/wind.db`; separate OSRM Docker infrastructure | [Dockerfile](../../Dockerfile), [railway.json](../../railway.json), [OSRM](../../infra/osrm/Dockerfile) |

### Inferences

- App capability and launch readiness must be separate columns: implemented local behavior can still lack configured providers, latest deployment, device evidence, operational staffing, or legal approval.
- Every future architecture should preserve completed paths and migrate behind existing endpoint contracts. A modular monolith is sufficient initially; an immediate many-service rewrite would waste existing working behavior.
- Configurable assignment modes are needed: `instant_dispatch` for passenger rides; `negotiated_offer` for freight and optionally negotiated rides; `courier_batch` for parcels. Keep current negotiation as a deliberate product mode instead of treating it as a failed Uber implementation.
- Current percentage fare rounding is workable for cash but should migrate to integer minor units before adding provider settlements. Some existing cash entries already use cents and should be preserved exactly.
- Capacity is an important correctness boundary: a bicycle and a van currently share the same 200-parcel count ceiling; implementing measured load/seat eligibility is a new production feature, not changing a constant to another guess.

### Gaps

- The live deployed API, Azure account, real phone numbers, current SMS/payment contracts, driver licenses, and insurance were not inspected.
- Existing QA documents report source-versus-deployed drift and deployment/backup transport blockers as of 22 October. They are historical evidence; this task has not established whether Railway remains impaired on 26 October. [Prior handoff](../../docs/HANDOFF-2026-10-21-deploy.md:3)
- Repository product/system documents mix future requirements with shipped features. The capability map itself calls its original build sequence historical. Use source evidence above rather than copying that sequence as “missing.” [Capability map](../../CAPABILITY-MAP.md:1), [target architecture disclaimer](../../docs/SYSTEM.md:5)

## What backend algorithms and behaviors should Claude implement next?

### Takeaway

The next work is backend authority, verified eligible supply, dependable dispatch and notifications, financial correctness, local routing evidence, and deployment reliability. The following is a proposed implementation contract; it describes new behavior, not a claim about Uber's proprietary internals.

### Cited Findings

The observed gaps arise from the corresponding implementation facts above: [marketplace jobs](../../server/main.ts:1528), [last-fix-only GPS](../../server/main.ts:147), [in-memory notification array](../../server/main.ts:929), [15 km service circles](../../src/model.ts:144), [flat count capacity](../../src/model.ts:169), [price recomputation](../../server/main.ts:1020), [no-native-push implementation](../../src/push.ts:1).

### Inferences

#### Production foundation and migration

1. Freeze existing API response fixtures and route/role behavior as compatibility tests. Add a persistence interface around current SQLite calls, then PostgreSQL/PostGIS migrations with parity counts/checksums and existing IDs. Migrate money to `amount_minor BIGINT`, currency `ILS`, explicit rounding and `tariff_version`; convert existing cents directly and old fare REAL values through a reviewed deterministic migration. Keep dual-read diagnostics during rehearsal; one authoritative writer during cutover. Never run two independent live writable databases.
2. Add a versioned `order_events` stream and `orders.version`. Every booking/assignment/transition creates an event and durable outbox item in the same transaction. Unique `(actor_id, command_id)` + payload hash remains the request replay rule. Use atomic compare-and-swap against expected order version; same command replays its result. Preserve old client `expectedStatus` compatibility during rollout.
3. Break `server/main.ts` into auth, users/vehicles, coverage, quotes, dispatch, trips, courier, money, notifications, routing, support, and admin modules only as each is changed. Extract current policy functions from `src/model.ts` without duplicating policies across client/server. Keep existing Expo Router paths; no UI redesign specified here.
4. Add traced request/order/assignment IDs, structured privacy-safe logs, counters for stuck order/failed push/failed payment, p95 latency, route-provider latency, queue age, and accepted location age. Automated backup, encrypted storage, restore rehearsal, migration compatibility and rollback checks are release gates.

#### Data model additions

| Entity | Fields and invariant |
|---|---|
| `vehicles` | Owner, driver relationship, class, plate, seats, usable mass kg and volume m³, cargo dimension constraints, inspection, license/insurance expiration. Vehicle class alone is not sufficient capacity evidence. |
| `driver_verifications` | Check type, status, expiry, reviewer, provenance/reference; manual in-person checks can remain the policy without storing identity scans. Expired mandatory check blocks new work. |
| `service_zones`/`route_permissions` | Versioned polygons, origin/destination permissions, service, vehicle/permit profile, restricted segments, time restrictions, manual operational override + reason. |
| `driver_presence` | Driver + device session + vehicle, online/busy/paused state, last heartbeat, eligible service zones, location sequence, expiry. Availability expires by server clock; no offline location collection. |
| `quotes` | ID, immutable itinerary, tariff/routing/coverage version, full minor-unit breakdown, ETA band, confidence, expiration, actor, availability disclaimer. |
| `dispatch_rounds`/`dispatch_offers` | Trip, round, ranked candidates, expiring lease, status, decline/timeout reason, decision features and score version. Unique live accepted assignment per trip; one live exclusive assignment per driver. |
| `assignments` | Order, vehicle, driver, assigned/arrived/boarded/released/ended timestamps, previous assignment chain, reason. Preserve reassignment history. |
| `order_events`/`outbox` | Monotonic order sequence, event ID/type, actor, redacted payload; transactional outbox with attempts, next attempt, sent receipt and dead-letter status. |
| `location_points` | Active assignment/device session, increasing sequence, server receipt time, measured age, accuracy/speed/bearing, consent/purpose and short retention policy; latest-fix table retained as materialized view. |
| `stops`/`courier_runs` | Stop type, address, item custody, weight/volume, capacity load delta, window, proof, planned/actual order and service duration. Pickup must precede corresponding delivery. |
| `payment_intents`/`provider_events` | Order/quote reference, amount/currency, provider, token/reference, auth/capture/refund status; signed event dedupe key. Never store raw card details. |
| `ledger_accounts`/`ledger_transactions`/`ledger_entries` | Separate platform revenue, customer receivable, driver payable, sender COD payable, provider clearing, promo expense; every posted transaction balances. Immutable reversals. |
| `support_cases`/`safety_actions` | Severity, incident, ownership, escalation timestamps, evidence access, policy version, decision/appeal and resolution. |
| `device_tokens`/`notification_receipts` | User, platform, token lifecycle, locale, authorization/session binding, notification/event ID, provider receipt, dedupe/TTL. |

#### Dispatch algorithm contract

- Online driver explicitly consents to availability tracking; heartbeat refreshes an expiring server-side presence lease. Starting values for pilot configuration: 10–15 s heartbeat, 45–60 s lease, 10–20 s offer. They are hypotheses to measure, not Uber constants.
- On request, load service+zone+legal route permissions, verified vehicle and seat/load capacity, active driver check, current presence, and compatible work state. Filter these hard constraints before ranking. Avoid using rating alone as a hard exclusion and never use protected attributes.
- Use PostGIS radius query to build a small candidate set; compute road-time matrix for top nearby candidates; choose by pickup ETA with an explicit bounded idle-time fairness term. Record ETA source and freshness; exclude stale location, impossible road crossing and expired paperwork. Start deterministic and explainable; fit acceptance/no-show predictions only once outcome data supports it.
- Create timed dispatch offer/lease atomically; deliver push plus stream event. Acceptance must verify offer is current, driver lease valid, order version unchanged, vehicle still eligible, and capacity still available, then commit assignment + event + outbox together. A push arriving late cannot create an assignment. First valid commit wins; losers receive current state.
- On timeout/decline, next candidate or small next batch, bounded radius expansion, max wait deadline; notify request owner truthfully when supply absent. Release after driver cancellation and re-dispatch with previous driver excluded; record cancellation reason. A dispatch worker restart resumes from database deadlines.
- Marketplace negotiation stays an independent strategy. Freight may negotiate inspection/crew/time windows rather than pretend an exact instant ETA. Parcel jobs can batch only when capacity/time-window checks permit.
- Required tests: concurrent accepts across processes; driver accepts two rides concurrently; acceptance at expiry; block/vehicle change during offer; delayed push; duplicate taps; worker restarts; candidate outside legal zone; missing map route; no drivers; decline/release exclusion; stale GPS; fairness monitoring by neighborhood.

#### Quote, fare and trip lifecycle contract

- Separate quote from booking: persist quote with immutable inputs and expiry; booking supplies quote ID and consent. Distinguish preliminary estimate from a guaranteed fare policy. Configurable city/service tariff with transparent night and checkpoint handling; no unexplained dynamic surge (existing product constraint).
- Rider/freight route edits require quote revision and payer consent; handle destination change while moving, extra authorized stops and loading/wait time with explicit policy and event, separate provider payment state from operational trip state.
- Add arrival evidence as GPS proximity + driver confirmation with audited manual fallback for bad GPS; arrival alone never starts billing. Add configurable grace/wait/no-show timer. Passenger boarding confirmation is a separate semantic action from parcel custody; optional rider safety PIN if approved policy, never reuse the recipient parcel PIN flow blindly.
- Payment authorization/capture/refund are separate state machines. Complete a trip even when payment remains due only under explicit collection policy; never label paid from a client callback. Add receipt correction through refund/reversal, not mutation of historical financial entries.
- Required tests: expiration between quote and book; tariff change; night boundary/timezone/DST; repeated completion; no-show after arrival; destination change failure; safety hold; GPS denied/manual arrival; payment failure after completed trip; late cancelled payment callback; promotion rounding; discounts above minimum; different commission plan after assignment.

#### Location, route and ETA contract

- Preserve existing freshness/order/outlier filters and privacy redaction. Add event/device sequence and assignment epoch, outage recovery, snapshot + event replay, and authenticated subscriber reauthorization. Phone force-stop must be represented as unavailable location; never claim background execution is guaranteed.
- Add route progress projection and bounded visual smoothing; use measured GPS as truth, prevent interpolation beyond a short horizon. Request reroute after sustained off-route evidence rather than one noisy fix; emit route revision to both parties. Foreground/backend ETA calculation must not depend on a screen remaining open.
- For Palestine build route profiles around actual legal access: West Bank/Gaza/East Jerusalem/cross-border treated as separately validated coverage, permits, jurisdiction and current access, never inferred from being inside a city circle. A shortest map route is not a permission check. Preserve checkpoint closure freshness/provenance and manual dispatch override. A road graph with closed segments excluded is more reliable than ten geometric detour guesses; fail closed for a known prohibited route instead of silently restoring it as ordinary usable route.
- Calibrate ETA ranges by city pair, hour, checkpoint conditions, vehicle, pickup dwell and remaining run stops. Start median + uncertainty quantiles from pilot data, with explicit insufficient-data fallback. Measure MAE and percentage of arrivals inside quoted range. Do not promise a direct ETA for a courier with unknown stop sequence.
- Required tests: duplicated/out-of-order location, clock skew, high accuracy outlier recovery, stale/force-stopped phone, revoked share token/logout during stream, route provider timeout, unreachable destination, stale reports, multiple closures, legal road restriction, map pin off road, low-end Android battery/data, iPhone background/screen-lock and store permissions.

#### Courier, freight, money and operations contract

- Parcel capacity must sum current onboard volume/mass and stop inventory per actual vehicle; 200 is not a safe universal capacity. Route planner objective: minimize distance + lateness + custody risk under capacity, pickup-before-dropoff and delivery windows. Start insertion heuristic and bounded local search; plan re-optimization only for uncommitted remaining stops. Any solver may return infeasible; dispatch/manual fallback is required.
- Freight needs declared dimensions/mass, vehicle body/equipment, loader count/time, stairs/access restrictions, inspection/requote policy, customer-approved extras, pickup/delivery windows and damage/custody evidence. Keep fixed/manual quoting fallback when dimensions cannot be trusted.
- COD (goods value collected for merchant) is a new ledger account separate from delivery fare and platform commission; custody cash limit, merchant payout, partial return/refund, reconciliation and shortfall procedures must precede launch. Existing cash settlement deliberately does not allow negative debt/payout creation.
- Reconciliation imports provider/bank/driver statements, identifies unmatched/duplicate/amount-mismatch entries, posts explicit adjustments with actor/reason, and escalates failures. Compute contribution margin per order from collected revenue less provider fees, messaging, maps, support, promotions, insurance, expected loss and hosting; current admin “profit” is not full business profit.
- Add staff roles split by dispatch/support/finance/safety and least privilege; MFA for admin, device/session revocation and sensitive-action audit. Add structured driver document expiry even when verification is in person. SMS/phone proof, payment contract and local permits need real provider/partner access; code alone cannot create those.
- Support and safety need staffed response windows, incident severity and escalation, evidence retention with restricted access, and honest emergency behavior. An in-app SOS hold is not an emergency-response service by itself. Fraud rules start with explainable rate/velocity/device/provider signals and manual review; anti-GPS spoofing is probabilistic, not solved by one jump threshold.

### Gaps

- Launch tariffs, seat/license classes, acceptable dispatch wait, legal permits, payment provider, insurance, COD custody and merchant payout policies require operator/local partner decisions. They should be explicit policy inputs, not guessed code defaults.
- This audit proposes implementation algorithms; it cannot infer Uber's exact feature weights, ML models, source code or confidential economics.

## What was verified and what screenshots can Claude inherit?

### Takeaway

The existing local checks pass. There are already 84 app screenshot files with route-to-source mapping; use them as the existing app baseline. They are seeded browser captures, not real Uber screenshots or proof of native-device behavior.

### Cited Findings

- `npm run lint`: passed on 26 October 2026. `npm run typecheck`: passed. `npm test`: passed all 42 script entries from package.json. The intentional test-generated SQLite failure/lock and provider-not-configured log lines were followed by successful assertions and exit status 0, not unhandled failures. [test scripts](../../package.json:46)
- Test coverage includes model/presentation, session races, API auth/idempotency/deployment, registration/migrations, exceptions/proof/cash, share/live map/routing/privacy, safety, places/scheduling/roads/chat, promo/referral/credit, web push crypto/server, offers/parcels, customer/driver scope and rating, email flows, native background authority/registration and phone-test isolation. [tests](../../tests/model.test.mjs), [suite list](../../package.json:50)
- `docs/screens` contains 84 PNGs and a 38-entry manifest. README states generated 21 October 2026, 390×844 phone viewport at 2×, long screens captured at full scroll height, seeded test actors. It maps routes to files for Claude. [screenshot README](../../docs/screens/README.md:1), [manifest](../../docs/screens/manifest.json)
- Visually inspected Arabic live order capture: actual Arabic RTL app with map, live age, progress state, safety entry, driver contact, chat, route/fare and share link. [Arabic live order](../../docs/screens/ar/order-live.png)
- Representative full-resolution paths for the coordinator/user:
  - `C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/screens/ar/home.png`
  - `C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/screens/ar/book-ride.png`
  - `C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/screens/ar/order-live.png`
  - `C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/screens/ar/driver-jobs.png`
  - `C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/screens/ar/driver-run-sheet.png`
  - `C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/screens/en/admin-dashboard.png`
- Official version-specific documentation was fetched before making Expo/RN recommendations: [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/), [Expo current documentation index](https://docs.expo.dev/llms.txt). No Expo/RN source was modified.

### Inferences

- Claude should inspect PNGs and the manifest before altering screens, keep route/source mapping, and derive its own UI implementation from lawful reference material and behavioral contracts. This plan intentionally specifies no pixel layout, colors, components or visual design.
- A passing deterministic suite is useful evidence of current behavior, not evidence of real-road ETA accuracy, production availability, provider authorization, high-scale reliability or passenger licensing.
- Required real-device matrix before launch: actual Android and iOS with screen lock, poor data, denial/limited GPS, app restart/OS stop, token revoked during location stream, multiple simultaneous courier items, Arabic/English, cash/provider failures and support incidents.

### Gaps

- Native iPhone verification, provider-backed payments/OTP/native push, and current production environment were not executed this task. Prior QA documents provide historical Samsung A53 observations; do not label those as new verification. [prior QA](../../docs/QA-2026-10-21.md)
- Document QA correction: an interim reviewer message incorrectly inferred returned-rating eligibility from `finishedStatuses`. Exact rate guards require `completed` at server lines 1280 and 1286, matching UI lines 431–432. This final audit preserves completed-only ratings; any returned-rating extension is a later explicit product-policy change. [server](../../server/main.ts:1274), [UI](../../src/app/order/[id].tsx:431)
- `npm run test:load`: passed against an isolated local fixture with 121 synthetic accounts and 10,000 historical orders. Results: 60 concurrent foreign reads returned 404, 60 anonymous reads 401; 60 held live requests woke with accepted newer GPS; 150 ms writer lock recovered with HTTP 200 in 195 ms; long lock returned retryable 503 in 355 ms (unrelated health request 254 ms); database integrity and foreign-key checks passed; 430 idempotent bookings stored exactly once and cancelled. At 60-way mixed concurrency this local fixture processed 213.83 requests/sec, p95 342.45 ms, 1,629 HTTP 200 and 144 expected throttle HTTP 429 responses in 8.29 s, zero counted errors/timeouts. This is a development-machine benchmark, not an Azure sizing estimate or real-road/production capacity guarantee. [local load results](../../.expo/load/results.json), [load harness](../../scripts/check-load.mjs)
- Verification environment recorded at 10:31 local Palestine time, 26 October 2026: Windows PowerShell, Node v24.12.0, npm 11.11.0. Exact commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:load`. All exited successfully. No Bun lockfile was present and npm was used. Git status after checks shows only the new research-notes directory; application source remained untouched.
- No code fix was necessary from lint/typecheck/test failures because all passed. No existing user source file was modified.
