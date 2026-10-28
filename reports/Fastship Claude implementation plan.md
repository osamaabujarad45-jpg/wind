# Fastship Claude implementation plan

Prepared 26 October 2026 for Wind/Fastship in Palestine. This is the prescribed engineering work order for passenger rides, parcel delivery, freight, money and operations. It gives Claude the backend contracts, dependency order and proof required to mark work complete. It does not prescribe UI design. No application code, account, deployment or live booking was changed by this research.

Read in this order: [main findings and Azure decisions](<Fastship Uber behavior and Azure.md>), this work plan, [algorithm contracts D01–D34](<Fastship algorithm specifications.md>), then [source-level audit](<../research_notes/Fastship Uber behavior and Azure/app_audit.md>). Read [repository instructions](<../AGENTS.md>) before implementation. Current source and existing passing tests establish the baseline; target specifications describe additions. An implementation is not complete because a screen displays success.

## Binding decisions

Use the existing Node 24 TypeScript backend as a modular monolith. Run API and durable worker as separate Azure Container Apps from one codebase. PostgreSQL Flexible Server with PostGIS is authoritative for identity, quotes, orders, assignment, events and money. Use private Blob containers for approved evidence/exports, Key Vault and managed identity for secrets, a database transactional outbox, Expo native push alongside existing Web Push, and Web PubSub Standard for paid-production realtime. Retain self-hosted OSRM and its versioned regional road dataset. Use GitHub Actions with Azure OIDC. Stage in West Europe; production deployment there requires the latency, SKU, data-location and recovery evidence below. Use the student subscription for educational development and a commercially appropriate funded PAYG subscription for paying customers. These are decisions, not a menu of cloud products.

Keep current consumer authentication, scrypt passwords, hashed bearer tokens and SecureStore behavior. Add verified-phone challenges through the prescribed telecom adapter without forcing existing users to register again. Do not introduce a second consumer identity platform, replace auth with mock SMS, or force a token-format migration as part of database work. Preserve configured tariffs, current cash collection, negotiated freight, parcel batching, support, returns and current API contracts.

Launch modes are fixed: `ride=instant_dispatch`, `freight=negotiated_offer`, `parcel=courier_batch`. Automatic passenger dispatch uses PostGIS coarse selection, road ETA and sequential timed offers. H3, learned dispatch/ETA models, surge, shared passenger rides, global microbatch matching and automatic courier insertion optimization are disabled in v1. Existing run-sheet grouping and manual courier stop execution remain while measured capacity is added. D23's insertion algorithm is a later gated optimization, not a reason to remove working multi-parcel runs.

### Initial versioned server configuration

These are independently prescribed pilot defaults, not recovered Uber values or measured guarantees. Store them in a versioned server policy and expose only safe read-only descriptions to clients. Change them through reviewed configuration and their acceptance tests.

| Policy | Required v1 value |
|---|---|
| Presence | Heartbeat every 15 seconds; lease expires after 60 seconds without heartbeat |
| Matching location | Effective fix age at most 30 seconds; driver must be explicitly online and eligible |
| Location delivery | Moving target 5 seconds; stationary target 15 seconds; existing 2-second minimum transport gap remains; OS delivery is not guaranteed |
| Location persistence | Latest accepted fix only in production; raw trace history off; separately consented QA traces delete after 24 hours |
| Dispatch | Offer lease 15 seconds; maximum 3 offers; absolute search deadline 90 seconds; never extend deadline by retry |
| Rank | `pickupETAsec - min(60, floor(idleAvailableSec / 10))`; stable driver ID tie-break; hard feasibility checked first |
| Quote | Immutable quote expires 120 seconds after server creation; a successful booking replay returns its existing order even after quote expiry |
| OTP | Valid 300 seconds; 5 attempts; resend cooldown 45 seconds; per-phone/device 3 challenges/15 minutes and 10/day; IP 30/hour triggers abuse review rather than denying an entire shared carrier NAT; global provider spend ceiling enforced server-side |
| Tariffs | Preserve validated configured amounts and current whole-ILS payable rounding; represent ledger values in ILS minor units and percentage settings in basis points |
| Waiting/cancellation | Five-minute arrival grace for operational alerts; new waiting/no-show/cancellation fees are zero |
| Cash exposure | Reject new work when projected unsettled exposure, including reserved/accepted cash obligations, would exceed 100,000 ILS minor units (₪1,000); compute/claim under the same driver-account lock; preserve active custody; finance calibrates the cap before activation and reviews settlement daily |
| Scheduling | Preserve current maximum seven days and release 30 minutes before pickup; no guaranteed reservation claim |
| Rating | Preserve completed-only eligibility for both parties; returned remains finished for settlement/disputes/history, not ratings |
| Ride start | New protocol uses hashed four-digit boarding challenge, five attempts and audited support recovery; parcel and sender-return proof stay separate |

OTP delivery and the cash cap are pilot policy inputs requiring the stated carrier/finance validation. A failed external validation keeps that capability disabled; it does not allow Claude to invent a provider success. Where an old app lacks a newly required safety protocol, activate it only for a supported client cohort and stop issuing affected new jobs to unsupported clients; do not silently weaken the server guard.

### Compatibility rules that every packet must preserve

1. Keep numeric order/user IDs and existing reference values. Add opaque public IDs only as extra fields; do not replace IDs used by installed apps or partner orders.
2. Keep `/api/orders`, `/api/location`, `/api/jobs`, `/api/price`, `/api/health` and `/api/ready`, their authorization, stable error behavior and supported request shapes. Add fields and versioned adapters over shared handlers. New `/bookings` names in conceptual specs are internal aliases, not permission to break `/api/orders`.
3. Preserve `searching → assigned → at_pickup → in_transit → completed`, with `on_hold`, `returning`, `returned`, cancellation and current safety holds. Richer internal sub-states map to this public lifecycle.
4. A return keeps the same order, driver custody, sender-only return code, proof attempts, audit history, commission/cash obligations and completed timestamp. Child legs/stops are additive. Do not turn an accepted return into another searching order or collect twice.
5. Ride/freight exclusivity and parcel capacity are different invariants. The current parcel batch allowance is real behavior. Never impose one-order exclusivity on all parcel drivers while migrating.
6. Preserve age-based GPS acceptance: the existing `age` field remains supported; add `ageMs`, session sequence and assignment epoch. Device `recordedAt` is metadata, never the authoritative clock. Do not convert offline stale GPS into fresh availability.
7. Current rating guards require `completed` at [server lines 1280/1286](<../server/main.ts:1274>), matching [UI lines 431–432](<../src/app/order/[id].tsx:431>). `finishedStatuses` also includes `returned` for other workflows; do not infer rating eligibility from that set. An earlier research-review message got this distinction wrong; the packaged audit has been corrected.
8. Going offline ends new-job availability and pre-assignment location collection. Existing active-assignment tracking has its own authorized purpose and ends under assignment/session/permission rules. Logout, account switch or revoked access cannot keep a previous account's location channel alive.

## Work order and completion contract

Execute the packets in numbered order. Claude owns implementation and local automated verification; an independent reviewer checks the packet's final diff and its evidence. The operator owns permitted service areas, driver checks and real operations; finance owns provider onboarding, collections and reconciliation; the infrastructure owner owns subscription funding, production region/access and recovery commitments. These are responsibilities with evidence, not unresolved technology choices.

Each packet produces migrations, code, meaningful tests, a short operational note and a result record under `docs/implementation/WPxx.md`. The record contains inputs/current-source revision, changed files, commands/outcomes, measured limits, failure cases, feature flags, rollout and rollback. Do not record credentials, customer personal data, raw phone numbers, OTPs or exact production locations. Keep new source modules outside `src/app/` unless they are actual routes.

All packets must run `npm run lint` and `npm run typecheck` before completion. Run relevant integration tests for the changed behavior; run the full existing suite at integration and release gates. Use npm because this repository has `package-lock.json`, not a Bun lockfile. For Expo native dependencies, read the exact SDK version first, use its versioned official docs and `npx expo install`; preserve Continuous Native Generation and configure native behavior through app configuration/plugins.

## 01. Freeze contracts and establish the source baseline

**Depends on:** none. **Contract:** retain existing behavior before changing storage or dispatch. Read `server/main.ts`, `src/model.ts`, `src/api.ts`, `src/api-client.ts`, `src/booking.ts`, `src/driver-work.tsx`, `src/background-location.ts`, `src/location-delivery.ts`, `server/push.ts` and the source audit.

**Deliver:** endpoint/role matrix, public-status mapping, money-rounding fixtures, data classification, current schema inventory, configured tariff snapshot without secrets, current test inventory and feature registry. Capture representative redacted API fixtures for customer/driver/admin/partner/public-tracking roles. Mark `ride` and `freight` as implemented but disabled by default unless `WIND_ENABLED_SERVICES` enables them; configuration is not proof of operating permission.

**Tests:** current booking, repeated command, role/ownership denial, driver block, completed/returned custody, cash balances, quote-change error, current ratings, partner external-reference replay and revoked share link. Keep server/code assertions separate from screenshot evidence.

**Done when:** every public endpoint and transition has a compatibility fixture, all current checks pass, and all later packets name the relevant fixtures. No production data is required. This packet records the baseline rather than rebuilding existing features.

## 02. Introduce persistence and asynchronous transaction boundaries

**Depends on:** 01. **Touchpoints:** current synchronous SQLite helpers/schema at [server/main.ts:122](<../server/main.ts:122>) and request dispatcher at [2316](<../server/main.ts:2316>). Create `server/db/`, `server/domain/` and `server/http/` incrementally; keep the current HTTP boundary and shared policy functions.

**Schema/implementation:** choose the PostgreSQL `pg` driver, pin its reviewed version in the lockfile, implement pooled async transaction contexts, explicit statement/lock timeouts and bounded transient retries. Every request owns its transaction; no global mutable transaction or pending side-effect array may leak between awaited handlers. Keep SQLite behind the same interface until import parity is proven. Record coordinate SRID 4326 and use longitude/latitude order explicitly at each PostGIS conversion.

**Tests:** current fixtures against both backends; overlapping async handlers with separate transactions; rollback after partial mutation; connection loss; bounded pool exhaustion; deadlock retry with stable command ID; migration lock preventing two replicas from running migrations concurrently.

**Done when:** existing externally visible results agree across both backends, transactions do not depend on one Node event loop, and database failure cannot flush another request's notifications. Do not enable horizontal API scaling yet.

## 03. Create PostgreSQL/PostGIS schema and prove import parity

**Depends on:** 02. **Schema:** preserve `users`, sessions, orders, partner references, command deduplication, proof attempts/security events, cash entries, subscriptions, promotions/referrals, chat, checkpoints/reports and saved places. Add `orders.version`, assignment epoch and explicit `currency`, `price_minor`, `commission_minor`; preserve old API monetary output through serializers. Keep current integer cash cents exact; deterministically round legacy REAL amounts once and record exceptions for review.

**Constraints:** unique `(actor_id, command_id)` with payload hash; foreign keys; order status/policy checks; one active assignment per order; one active exclusive ride/freight commitment per driver; locked vehicle/run resource vector for parcel reservations; unique partner external reference. Existing retained data must not be coerced into a false valid state to make an index pass. Add GiST indexes for driver location/zone geometry.

**Migration contract:** export a consistent SQLite snapshot, transform/import into an isolated PostgreSQL instance, reconcile IDs/counts/key coverage, every open cash obligation, fare/commission totals, return proofs, active assignments, chat/history and Arabic/timezone round trips. Report every mismatch; correct migration code and repeat. Rehearse a short write freeze and final import. One writable source of truth at any moment. After new PostgreSQL writes, rollback to stale SQLite would lose data; keep writes closed until cutover acceptance or perform a tested reverse reconciliation.

**Tests/Done:** all imported financial totals and representative role responses match; all existing server suites pass on PostgreSQL; parallel exclusive/parcel claims enforce the distinct invariants; restore the imported database into a fresh isolated server and rerun parity. Autoscaling remains off until packet 04 also passes.

## 04. Add versioned commands, domain events and the durable outbox

**Depends on:** 03. **Schema:** `domain_events(id, order_id, sequence, type, actor_id, occurred_at, schema_version, payload)`, `command_results(actor_id, command_id, payload_hash, http_status, response, created_at)`, `outbox(event_id, destination, attempts, next_attempt_at, lease_owner, lease_until, status, last_error)` and consumer inbox dedupe keys. Unique order sequence and event/destination pair.

**API contract:** accept additive command ID and expected version. Preserve existing `requestId`/`expectedStatus` adapters. Booking/assignment/proof/return/cash changes commit state + event + outbox together. Replay a completed command before checking today's quote, price or lease; altered payload under the same command ID returns conflict. Worker claims rows under database leases, retries transient failures with bounded backoff/jitter, and records exhausted work in a review queue. External delivery is at least once; consumers deduplicate.

**Tests:** kill worker after DB commit before publish; publish then kill before acknowledgment; duplicate/out-of-order delivery; lease expiry; cancelled/finished order receiving late dispatch event; aborted request; multi-process command conflict; queue backlog and poison item. Test domain correctness without requiring push delivery.

**Done when:** every committed critical mutation has a durable recoverable event, duplicate side effects cannot assign or collect twice, and worker restart resumes backlog. API/worker scaling can now be exercised against shared persistence; a broker is not required in v1.

## 05. Version coverage, vehicle approval and physical capacity

**Depends on:** 04. **Schema:** `service_areas`/directed `route_permissions` with versioned polygons/corridors, service/vehicle/permit eligibility and validity; `vehicles` with plate/class/seats/usable kg/m³/dimensions/equipment; driver-vehicle relationship; `verification_checks` with reviewer, outcome, expiry and provenance. Manual in-person verification remains supported; identity scans are not collected by default.

**API/behavior:** extend admin approval and vehicle APIs over existing role guards. Server computes eligibility from approval, expiry, actual vehicle, legal area, service and compatible active work. Replace city circles as legal authority. No route response grants access to Gaza, East Jerusalem or a cross-border corridor. Expired approval blocks new assignments; current custody goes to an audited support workflow, not silent deletion.

**Capacity:** reserve weight, volume, dimensions and pieces for accepted pickup/dropoff stops under a locked vehicle/run revision. Preserve active legacy parcels; flag unknown capacity for inspection and stop adding new work until checked. Retain the current 200-count bound as a secondary guard, never as evidence a bicycle or car can physically carry that load. Do not cancel legacy custody to satisfy a new constraint.

**Tests/Done:** boundary polygons, direction restrictions, unavailable permits, invalid/expired documents, wrong seats/equipment, two concurrent final-capacity claims, same vehicle used by two driver sessions, unknown legacy load, vehicle edit during offer and driver suspended with cargo. New work is feasible under measured resources; existing return/proof/cash records still reconcile. Operations signs an approved service/vehicle/corridor matrix before launch activation.

## 06. Preserve identity and add provider-backed phone verification

**Depends on:** 05. **Schema:** phone display/canonical/routing metadata, verification state, `phone_challenges` with challenge ID, HMAC digest/purpose, expiry/attempt/cooldown, delivery reference and audit state. Preserve existing phone keys during migration; add unique canonical mapping only after collision review. Existing sessions/passwords remain valid under current revocation rules.

**API:** add authenticated phone-change/verification and recovery commands; generic public challenge responses avoid account discovery. Enforce the fixed OTP/cost limits before provider calls. Current email adapter, verified-email reset and operator-verified enrollment continue. Phone proof establishes control of the number, not driver identity. Existing token storage must keep native headless access/logout authority behavior.

**Provider gate:** implement one Palestinian telecom adapter with request/delivery/query callbacks and deterministic fake provider only in isolated tests. Keep production provider activation off until documented sender permission and opted-in real Jawwal/Ooredoo delivery succeed for supported +970 and relevant Palestinian-network +972 prefixes. Do not rewrite arbitrary +972 numbers or infer nationality. A screenshot of a code is not identity proof.

**Tests/Done:** reuse/expiry, wrong purpose, rate/spend caps, delivery failure/delay/out of order, same phone changing account, carrier format collision, reset without account discovery, logout/role change while request awaits provider, secrets absent from bundles/logs, unchanged installed-user login. Infra owner supplies secrets through Key Vault; no credentials belong in the plan or client.

## 07. Add online presence and extend current GPS safely

**Depends on:** 06. **Schema:** `driver_sessions` with driver/device/vehicle, online/paused/busy state, heartbeat/lease, eligibility version and consent record; `driver_latest_locations` with session, sequence, accepted age-derived timestamp, accuracy/heading and assignment epoch. Raw production trace store remains disabled.

**API:** additive online/offline/heartbeat commands and current `/api/location` adapter; existing active-job uploads retain the current authorization/freshness/outlier checks. New online uploads require explicit availability consent. A job's latest location is visible only through its authorized current assignment; a public tracking token receives its existing minimized allowlisted view, never phone/recipient/proof codes. Revocation is checked on every resumed live read.

**Device behavior:** stable pending command IDs survive restart. Do not queue stale GPS as if it were new. Online availability expires after 60 seconds without a heartbeat; active orders remain recoverable. Maintain current age/skew filter and 2-second upload floor; add sequence/session/epoch to reject duplicates and previous-account callbacks. Going offline disables new matching and stops pre-assignment collection; active-assignment purpose is separately managed. QA trace capture requires separate consent and deletes after 24 hours.

**Tests/Done:** two simultaneous devices, clock ±minutes, noisy high-accuracy outlier recovery, late callback after logout, old assignment after reassignment, old/new sequence, background/screen lock/low-power mode, denied/limited GPS, force-stop/relaunch and poor network on physical Android/iOS. A fresh-looking last pin cannot make an expired/offline session eligible. Record battery/data/freshness measurements; do not claim the OS guarantees callbacks.

## 08. Harden routing, restriction evidence and immutable quotes

**Depends on:** 07. **Touchpoints:** [current route/fallback](<../server/main.ts:1020>), [OSRM and detours](<../server/main.ts:1868>), [current tariffs](<../src/model.ts:71>). Retain the OSRM adapter and graph; add versioned `road_restrictions` with directed geometry, affected service/vehicle, source, validity/last confirmation, confidence and operator decision. Route results carry graph/profile/restriction version, feasibility and uncertainty. A route that still crosses a known prohibited closure cannot become an ordinary bookable route because detour search failed.

**Schema/API:** `quotes` contain customer/product, immutable itinerary/scope, currency, minor-unit lines, tariff/routing/restriction versions, ETA band, disclosures and 120-second expiry. Extend `/api/price` with quote ID/expiry and `/api/orders` with quote reference. Supported legacy requests retain the current server recomputation/`price_changed` behavior. Replaying a successful booking returns its committed order; it never recalculates today's fare. New quote-bound clients cannot supply an authoritative total. Quote consumption/order creation/promo reservation happen atomically.

**Pricing:** retain the configured flat parcel tariff and current ride/freight/night/Plus/commission calculations as compatibility fixtures. Store percentages as basis points, preserve current whole-ILS customer payable rounding, and record exact minor-unit lines. Any route/load/destination change creates a change quote and customer consent before a new charge. No new surge, wait, no-show or cancellation fee. Record uncertainty rather than offering a precise guaranteed fare/ETA from haversine fallback; known-infeasible serviceability blocks a new quote. Existing accepted jobs move through support/requote policy instead of being abandoned.

**Tests:** quote expires during commit, tariff/plan changed, night/DST boundary, duplicate request after expiry, promo last-budget race, route returns after itinerary changed, provider unavailable, all alternatives prohibited, stale/conflicting road reports, same-city/rural pin, old-client `quotedPrice`, no double-counted checkpoint delay.

**Done when:** all compatibility prices/discounts/commissions match, line sums and currency are exact, prohibited route cannot pass, and a versioned corpus of at least 100 local origin/destination cases per launch area has an adjudicated feasibility result. Collect actual travel/loading/checkpoint time separately; publish confidence coverage and systematic corridor error. Map rendering alone is not route validation.

## 09. Add recoverable native notifications and authenticated realtime

**Depends on:** 08. **Schema:** authenticated device-token registration/session binding, provider delivery receipts and durable notification attempts linked to event/outbox IDs. Keep current browser Web Push endpoints and service worker. Register Expo push for native development/store builds using current SDK57 documentation and real EAS/FCM/APNs credentials. Native push delivery is a hint, never the dispatch lock.

**API/event:** short-lived server-authorized Web PubSub connection/group credentials; only current participants and authorized staff join an order stream. Events include order sequence, assignment epoch, itinerary/route/quote/restriction versions and safe public profile fields. Clients deduplicate, discard older versions and fetch `/api/orders/:id` snapshot after a gap/reconnect; snapshots remain authoritative. Keep current polling/long-poll as fallback during rollout. A revoked session/link loses access even if an already held read is waiting.

**Worker behavior:** retry transient provider failures with capped backoff/jitter; disable invalid tokens; do not resend an expired offer as actionable. Refresh device token association on account changes and revoke it on logout. Quiet/nonessential notifications obey preferences; safety/transactional escalation follows published staffed policy. Expired unacknowledged work appears in an operator queue; provider failure never silently marks delivered.

**Tests/Done:** worker crash at every delivery boundary, duplicate/late push, invalid token, wrong-account device registration, disabled permission, app reinstall, deep link to cancelled order, foreground/background/native Android/iOS, Web PubSub loss/reconnect, unauthorized guessed order/group, reassignment/logout/revoked share token during live read. Every significant event remains recoverable without push. PubSub Standard and its full connection/message cost are included before paid launch.

## 10. Implement deterministic passenger dispatch and atomic acceptance

**Depends on:** 09. **Schema:** `dispatch_rounds`, `dispatch_offers`, assignment history and durable deadlines. Offer binds order revision, driver/device session, vehicle/eligibility version, lease nonce and expiry. Model exclusive driver commitment separately from parcel resource reservations.

**Algorithm:** filter approved online presence, fresh location, verified seats/vehicle/permits, service/zone/corridor, active work, safety pair block and cash policy. Use PostGIS to shortlist inside permitted coverage; road ETA evaluates the bounded eligible set. Rank using the fixed fairness formula above, tie by stable ID. Issue one offer at a time, lease 15 seconds, at most three offers and never past the 90-second order search deadline. Recheck route and current eligibility before each issue and accept. No rating-only exclusion or inaccessible-corridor expansion. Driver decline does not weaken eligibility.

**Acceptance transaction:** lock order, driver/session/vehicle resource and offer in deterministic order; replay command if already complete; check role/ownership, revisions, server-time expiry and capacity; atomically insert assignment, revoke competing offers, update order/session, append event/outbox and command result. The same driver/vehicle lock checks all active modes: a driver with active parcel custody cannot accept a ride/freight job, and an exclusively committed driver cannot accept a parcel. A partial unique index for exclusive work alone is insufficient. A conditional conflict returns current state. Cancellation, release, acceptance and worker expiry use the same version boundary. Release only the matching assignment/lease; an old timeout cannot free a driver committed elsewhere.

**API:** preserve `/api/jobs/:id/accept` and current negotiated offer handlers. Route supported automatic ride offers through the new durable offer validation. Freight retains customer selection of immutable accepted negotiated scope. Parcel acceptance runs measured capacity checks, not the exclusive ride matcher. Record the reason/ETA/idle credit/policy used for each decision.

**Tests/Done:** two actual server processes/connections; 100 drivers accepting one order yields one winner; one driver accepting two rides yields one winner; parcel-final-capacity race yields feasible reservations; simultaneous ride-versus-parcel acceptance by one driver cannot create mixed active work; two drivers sharing one vehicle cannot bypass its mode/capacity lock; expiry versus accept, cancel versus accept, block/vehicle edit during lease, app retries, worker restart, no supply and all declines. No client notification creates authority by itself. Search always reaches an explicit result by the absolute deadline; matched participants see the same assignment epoch.

## 11. Extend ride lifecycle without breaking custody, proof or returns

**Depends on:** 10. **Schema/API:** add internal assignment/stop stages and arrival evidence while serializing current order statuses. Add expected-version commands over current advance/release/cancel handlers. Keep safety holds and `on_hold`/`returning`/`returned`. Standard ride boarding challenge is distinct from parcel handoff and sender return code; migrate proof codes without making them visible to pre-assignment drivers.

**Behavior:** server-confirmed arrival requires recent plausible proximity or named audited poor-GPS override. Start the operational five-minute grace clock after valid arrival; fees remain zero. Starting ride requires current matched driver + valid boarding challenge for supported protocol cohort; completing checks allowed state and current assignment. A post-start early end is explicit and preserves actual completed movement/payment outcome, never resetting to searching. Before pickup, driver release can redispatch with new epoch and previous driver excluded. Active passenger transfer is a support/consent case.

**Parcel/return behavior:** custody cannot disappear on cancellation. Preserve sender return PIN, attempts/lockout, original order ID, customer/driver access boundaries, proof/security events, original commission and cash obligations. Child stops/legs link to that order; duplicate return confirmation cannot add revenue twice. Handoff PIN plus declared item-count acknowledgment is v1 proof. Photo/signature capture stays disabled until packet12's approved private-object release; no visual-only delivered action is allowed.

**Tests/Done:** wrong driver/PIN, five failed attempts/recovery, proof replay, duplicate advance/completion/return, concurrent safety hold, no GPS/manual arrival, driver no-show, cancellation with custody, absent/refused/unreachable/wrong address, reattempt/return resolution, blocked driver with cargo and returned cash/commission reconciliation. Rating remains completed-only and redaction/access tests still pass.

## 12. Complete courier and freight resource contracts

**Depends on:** 11. **Schema:** parcel item count, declared dimensions/mass/volume/value and custody records; freight equipment/crew/loading windows/access constraints; stops with pickup-before-delivery precedence, service duration, promised window and reserved capacity deltas. Merchant/source references remain idempotent.

**Behavior:** current courier run sheet remains grouped by stage/city and manually executable. Capacity-aware acceptance reserves the full planned load, including accepted pickups; do not reserve only items already onboard. A pickup mismatch pauses for inspected capacity/customer-approved scope change or support exception; driver cannot add an unapproved fee. Freight keeps negotiated scope, accepted price/version/expiry, vehicle/equipment/crew reservation and loading responsibility. Existing 50%–200% offer band and ten-minute negotiated offer life remain unless a separately versioned approved policy replaces them; the 15-second automatic dispatch offer is a different object.

**Private objects:** implement Blob upload authorization, content type/size/checksum enforcement, quarantine/scan, private reads and purpose-based retention for approved evidence/exports. Do not start collecting driver ID scans because storage exists. Completion only references evidence approved for that policy; an uploaded file alone cannot change custody. Proof photos/signatures stay off until privacy/operations explicitly approves their collection.

**Tests/Done:** weight and volume overflow, dimension/equipment mismatch, multiple accepted pickups, same vehicle/session conflict, unknown legacy size, partial item handoff, failed second pickup, customer cancel with cargo, return insertion as a manual stop, duplicate partner request, object path guessing/expired access/wrong account/malicious upload. Existing accepted parcels remain visible and finishable. Automatic insertion/vehicle-routing optimization remains disabled; packet17 defines its future evidence gate.

## 13. Introduce balanced money records and preserve cash operations

**Depends on:** 12. **Schema:** ledger accounts, immutable journal headers/entries, cash receipts/remittances, adjustment/reversal links and settlement reconciliation. Accounts separate platform revenue, driver payable/receivable, promo expense, provider clearing, customer receivable and merchant COD payable. Every posted journal balances by currency; valid numeric minor units/basis points and unique business references are enforced.

**Migration:** import existing confirmed/pending/disputed cash entries and commission snapshots without rebooking transport revenue or losing driver-confirmed remittance semantics. Returned jobs retain current settlement treatment; cancelled unperformed jobs are not invented earnings. Preserve Plus/Pro entitlements/current configured commission snapshot. Current admin profit is not full contribution margin; add cost attribution without relabeling merchant/driver money as revenue.

**Cash behavior:** amount due/collected/collector/receipt are distinct; remittance confirmation and disputes are auditable. Under the driver-account lock, compute projected exposure from current unsettled collection liabilities plus every reserved/accepted cash obligation and the proposed job. Reject new work if that projection exceeds ₪1,000; never wait until already collected cash reaches the cap. Concurrency cannot reserve the same remaining exposure twice. Keep active jobs/support alive. Finance calibrates this initial cap against actual collection/remittance procedures before activation and reviews cash/reconciliation daily. Corrections post reversals/adjustments with reason and staff authority; no direct editing of balances.

**Tests/Done:** duplicate completion/remittance, partial collection/change, wrong amount/currency, refund after commission, discount funding, cash shortfall/dispute, concurrent last-exposure job, return after collection, subscription-rate change after assignment, migration totals and overflow. Reconcile every account to orders/cash entries, with debits equal credits per journal and no unowned residual. Independent finance review signs example journals and import results.

## 14. Integrate Bank of Palestine payments and merchant COD

**Depends on:** 13. **Provider contract:** implement the Bank of Palestine gateway adapter behind `create/query/capture/void/refund/reconcile` capabilities. Do not claim unsupported preauthorization, marketplace split payout or native SDK support. A documented merchant agreement/capability matrix/sandbox is the activation gate. Use hosted/tokenized checkout and approved deep-link return; the app never stores raw card data. If a capability is absent, keep that operation disabled under a documented finance workflow rather than faking success.

**Schema/API:** payment intents/attempts, provider request/event IDs, raw-body signature verification, receipt inbox dedupe, refunds/payouts/merchant settlement with exact money/currency and immutable quote reference. Operational completed and payment captured are independent facts. Unknown timeout status stays pending until authoritative query/reconciliation; never charge again blindly. Provider event order cannot move a payment into an invalid state. Refund cannot exceed captured less prior refunds; payout cannot exceed cleared available entitlement.

**COD:** goods value is merchant liability, separate from fare and commission. Record beneficiary, amount collected, custody, return/refund responsibility, collection limit, remittance deadline and merchant payout evidence. Do not launch an unlicensed wallet/escrow by adding balances. Merchant COD activation requires approved holding/settlement arrangements, signed examples and finance ownership; code/test implementation can finish while live capability remains off.

**Tests/Done:** sandbox and explicitly approved controlled real settlement: duplicate/reordered webhook, forged signature, timeout after capture, repeated refund/payout, chargeback, partial collection, transport prepaid plus goods COD, return with funds, bank mismatch and payout failure/reversal. Books reconcile to dated provider/bank statements. External transactions require the owner's authorized test budget; research permission is not payment permission.

## 15. Harden operations, support, safety and account recovery

**Depends on:** 14. **Schema:** scoped staff roles/permissions, cases/severity/owner/escalation, policy versions, staff actions/access audit and financial approval records. Split dispatcher, driver reviewer, support, safety, finance and platform admin. Keep current SOS hold, disputes, support credits/chat and account deletion; add ownership and escalation rather than replacing them.

**Behavior:** staff identity uses the prescribed workforce MFA/SSO boundary while consumer auth remains intact. Every sensitive server action checks resource scope and named purpose. Dispatch override records reason and assignment history; finance actions cannot bypass journal invariants; evidence access is audited. Preserve current participant chat/privacy and direct phone contact only for authorized parties. Masked calling is off until a tested local relay exists; no claim of protection beyond the implemented disclosure boundary.

**Safety:** a deviation, long stop or stale fix is an operational signal, not automatic proof of crime/fraud. Context includes checkpoint conditions; operators investigate and document. An SOS entry does not promise police dispatch or 24/7 staff unless the signed service rota actually provides that coverage. Local emergency/support numbers are operator-validated configuration. A model cannot decide fare, ledger, eligibility or emergency response. AI assistance remains disabled for launch.

**Tests/Done:** permission/object matrix, staff MFA/revocation, former driver access after reassignment, support caller verification, malicious complaint, retained dispute after deletion, wrong-role refund/approval, safety hold during completion, false route alarm, staff unavailable and degraded mode. Operations signs staffed response/escalation coverage and runs a timed drill. Payment/support/safety decisions and rating moderation remain separate.

## 16. Prepare Azure deployment and the controlled commercial pilot

**Depends on:** 15. **Files:** `infra/main.bicep`, parameter sets for dev/staging/prod, modules for API/worker/OSRM, database/PostGIS, private storage, identity/Key Vault, PubSub, monitoring, network, budgets and registry; `docs/operations/deploy.md`, `restore.md`, `incident-and-degraded-mode.md`, `provider-failures.md`, `cost-model.md`. CI builds pinned images with digest/SBOM, runs checks, validates Bicep and emits a reviewable what-if/cost diff. GitHub OIDC uses narrowly scoped roles; secrets are references, never repository values.

**Hosting contract:** separate API and durable worker Container Apps; PostgreSQL/PostGIS with tested restore; retained OSRM compute/graph storage; private Blob; Key Vault; Web PubSub Standard; existing Web Push plus configured native Expo push. Replace the hard-coded Railway web-export API origin through environment configuration without changing supported API paths. Keep `/api/health` process liveness and `/api/ready` essential DB/migration readiness; an unrelated SMS outage must not cause a database restart loop. Graceful drain stops new claims, finishes bounded transactions, preserves leases/outbox and reconnects clients to snapshots.

**Cost completeness:** price API, worker, OSRM CPU/memory/dataset storage, database/HA/storage/backup, PubSub units/messages, Blob/scan/operations/egress, logs/alerts, registry, DNS/TLS/network and real provider fees. The researched USD38.94 example is API plus B1MS only; it excludes worker and OSRM and is not a production budget. Student credit is not recurring monthly revenue funding. Budgets alert, not hard-stop spend. A spend incident must not switch off the database under an active passenger.

**Deployment evidence:** protected approval for paid resources and outward production change, a fresh restore-tested backup, compatible additive migration, approved region/SKU/quota/data location, complete calculator export and funded production subscription. Stage West Europe with synthetic users; measure real carrier access/latency before production. Use a bounded approved service area/driver cohort, operator-reviewed feature flags and staged client compatibility. API/worker replicas scale only after packets03/04/10 concurrency and recovery evidence. Deploy migrations once under a database lock; images from one reviewed source revision.

**Tests/Done:** full legacy+new suites, physical-device journeys, local route corpus, carrier tests, real provider reconciliation where activated, peak/growth load, API/worker restart, provider outage, DB restore into fresh infrastructure, interrupted rollout and rollback/reconciliation. Operators demonstrate manual dispatch, unfinished custody recovery and financial reconciliation. All launch gates below must be passed; a green build alone does not authorize deployment.

## 17. Implement later use cases behind measured activation gates

**Depends on:** completed controlled pilot from16, not simply source merged. This packet covers requested breadth without quietly activating speculative optimization in v1. Keep each capability disabled until its named evidence is produced; this is a sequence, not a technology-choice menu.

| Later work | Prescribed implementation and activation evidence |
|---|---|
| Capacity-aware courier insertion | Minimum added road duration among feasible insertion pairs, pickup-before-dropoff, vehicle resources and existing promised windows. An additional delay cap never relaxes an already tighter promise. Lock itinerary version. Replay historical consenting cases and shadow existing manual runs; activate only after lateness/custody/capacity improve without dropped legacy parcels. |
| Guaranteed reservations | Separate requested window, planned supply and confirmed driver commitment. Durable pre-dispatch uses predicted travel/readiness rather than only current 30-minute release. Reassignment and no-fee fallback tested. Keep current schedules truthful until commitment evidence exists. |
| Destination changes/customer multi-stop | New itinerary revision + immutable change quote + payer consent, preserving active custody, eligibility and current assignment epoch. Test provider timeout, customer rejects change, route closure and simultaneous edits. |
| Learned ETA residuals | Temporal holdout, provider-baseline comparison and shadow residual model with no future-data leakage. Activate only if ETA error and interval coverage improve by corridor/product, including sparse/checkpoint conditions. |
| Batched passenger dispatch | Two-second request microbatch, feasible exclusive pairs, bounded min-cost bipartite matching and deterministic timeout fallback. Shadow against v1 wait/cancel/coverage/driver-earnings metrics before limited cohort rollout. |
| Repositioning/demand forecasts | Aggregate consenting coarse supply/demand and operator constraints; recommendations only, never fabricated earnings promises. Measure driver deadhead, earnings and underserved-area outcomes. |
| Surge experiment | Remains off until a published local pricing decision, sufficient unbiased demand/supply evidence, capped/smoothed policy, emergency freeze and shadow/rollback evidence. No inferred willingness-to-pay or protected-trait pricing. This is a future product change, not an initial parity requirement. |
| Guest/business/merchant accounts | Separate requester/payer/passenger/recipient, organization membership/spend approval, employee privacy, cost centers/invoicing and merchant bulk import/reference idempotency. No ownership transfer from a client flag. |
| Promotions/subscriptions refinement | Preserve current programs first. Add versioned entitlements, funded discount allocations, budget race control, refund/reversal and abuse review; activate only with contribution-margin and reconciliation evidence. |
| Accessibility/specialized services | Explicit capability/seat/equipment match and consented support needs; no medical inference. Operator verifies vehicle/operator permission, support handling and unfair-delay prevention before enabling the service. |
| Tipping, proof photos, masked calling | Use supported payment allocation, approved private-object/consent flow and verified local relay respectively. Keep each feature off until its dependency passes; do not fake protection, payout or proof. |
| AI support assistance | Restricted support summaries/category suggestions after dialect accuracy/privacy/spend evaluation and human escalation. No authority over assignment, prices, account sanctions, ledger, refunds or emergency response. |

Done for each capability means a complete command/event/schema contract, failure table, independent tests, telemetry, measured shadow result, controlled feature-flag rollout and reversible application change. Do not substitute a copied Uber example for the local evidence.

## Launch gate register

Engineering can complete independent packets locally while provider/operator evidence is being obtained. A failed gate leaves the affected capability off and the deployment unapproved; it does not stop unrelated implementation or justify a guessed success.

| Gate | Accountable role | Required evidence and pass condition |
|---|---|---|
| Compatible source | Claude + independent reviewer | Current/API-role fixtures and all legacy/new tests pass; installed-client status, money, auth, IDs, partner bridge, return/PIN and completed-only ratings preserved. |
| Shared database correctness | Backend engineer + reviewer | Import counts and every balance/open custody match; multi-process concurrent accept/cancel/expiry/cross-mode/capacity/cash exposure tests; no duplicated assignment or journal. |
| Recovery | Infrastructure owner + operator | Fresh backup restored into new isolated infrastructure, business reconciliation, measured recovery time/point and worker/outbox/client reconnect drill. Backup existence alone fails this gate. |
| Territory and supply | Operator + competent local review | Written city/service/corridor permissions, driver/vehicle/insurance checks, capacity inspection and current road-closure handling. Unsupported areas stay disabled. |
| Local routing | Operator + routing engineer | At least100 adjudicated cases per service area, impossible-route handling, Arabic landmark/address fidelity and measured ETA range coverage, with graph/restriction versions. |
| Native devices | Mobile engineer + tester | Physical Android and iOS: login, quote/dispatch, arrival/proof, parcel batch/return, freight, tracking, background/screen lock/OS stop, weak data, revoked permissions, reinstall and logout/account switch. |
| Telecom | Operator + provider + backend engineer | Sender approval and real opted-in supported-number delivery, delay/replay/recovery/abuse/spend evidence; no placeholder OTP in production. Shared carrier NAT is not blindly blocked by IP count. |
| Payment/COD activation | Finance + licensed provider + engineer | Approved agreement/capabilities, sandbox and authorized controlled settlement/refund/payout, statement reconciliation and cash/COD custody rules. No unlicensed wallet or unsupported merchant claim. |
| Staff/safety | Operations lead | Staffed rota, escalation responsibilities, MFA/least privilege, incident/degraded-mode drill and promises matching coverage. |
| Privacy | Operator/privacy owner + reviewer | Field-purpose/access/retention map, consent, private object/trace access tests, no raw history by default, deletion/holds and no secrets/PII in logs/client. |
| Commercial Azure | Infrastructure/business owner | Appropriate funded production subscription, permitted data geography, actual SKU/quota, complete meter/cost export including worker+OSRM, support/failure budget and production change authorization. |
| Pilot outcomes | Operator + finance + engineering | Representative local cohort shows no lost custody, double assignment or money posting; response/ETA/support and contribution margin measured by service/corridor; unresolved safety/accounting defect blocks expansion. |

Initial engineering performance gates are non-provider API p95 under 500 ms, critical command acknowledgment p95 under 1 s, connected tracking freshness p95 under 10 s, and search terminal result within 90 s. Measure external routing/telecom/payment latency separately. These are targets to prove on chosen infrastructure and networks, not achieved Azure/application SLAs. Keep maximum wait, legal access, custody and financial invariants stronger than speed targets. The operator signs actual recovery/service commitments only after the drills support them.

## Verification already completed for this audit

On 26 October 2026, Windows PowerShell with Node v24.12.0 and npm 11.11.0 ran `npm run lint`, `npm run typecheck`, all 42 existing `npm test` script entries and `npm run test:load`; all exited successfully. No app code fix was needed or made. Intentional negative-test SQLite lock/provider error logs were asserted test cases, not unhandled suite failures. [Baseline scripts](<../package.json:46>), [audit verification](<../research_notes/Fastship Uber behavior and Azure/app_audit.md>).

The load harness used an isolated temporary database with 121 synthetic accounts and 10,000 history orders. It verified 60 concurrent privacy/auth requests, 60 held live requests receiving accepted newer fixes, 430 idempotent bookings stored once, integrity/foreign keys and bounded writer-lock behavior. Its 60-way mixed phase recorded 213.83 requests/sec, p95 342.45 ms and expected throttle responses. This development-machine synthetic result is not production sizing, real-road accuracy or a reliability guarantee. [Harness](<../scripts/check-load.mjs>), [local results](<../.expo/load/results.json>).

New packet implementations still need their specified tests. This research did not repeat native-device testing or establish live OTP/payment/native-push/production availability. Older QA documents contain historical Samsung A53 results; they must not be relabeled as fresh iPhone/production evidence. Each packet must fix any reproduced failing check in its scope and verify the correction before completion.

## Screenshot handoff for Claude

Use [the 38-entry manifest](<../docs/screens/manifest.json>) and [route-to-source inventory](<../docs/screens/README.md>). There are 84 Arabic/English PNGs captured 21 October 2026 from a seeded browser session at a 390×844 mobile viewport, 2× pixel ratio; long screens are full-scroll captures. They are genuine existing-app captures, not physical native-device screenshots and not Uber captures. Preserve that label in every copied evidence bundle.

| Baseline scenario | File |
|---|---|
| Arabic customer home | [home](<../docs/screens/ar/home.png>) |
| Arabic ride booking | [book ride](<../docs/screens/ar/book-ride.png>) |
| Arabic active order | [live order](<../docs/screens/ar/order-live.png>) |
| Arabic driver jobs | [jobs](<../docs/screens/ar/driver-jobs.png>) |
| Arabic parcel run | [run sheet](<../docs/screens/ar/driver-run-sheet.png>) |
| English administration | [dashboard](<../docs/screens/en/admin-dashboard.png>) |

Claude owns its visual analysis/design. This plan supplies behavior and source mapping, not layout/color/component instructions. No genuine Uber mobile screenshots, authorized Uber binary/session or runtime traces were available. The inspected REA toolkit at revision `9341b116efddefc2bcdd8208d27d6e4ea78cc507` supports later evidence collection on authorized targets; it does not supply Uber algorithms. No toolkit install, interception or live trip was performed. [Pinned REA](https://github.com/morluto/rea/tree/9341b116efddefc2bcdd8208d27d6e4ea78cc507).

## Copyable Claude kickoff

```text
Implement the prescribed Wind/Fastship backend and behavior plan in the existing Fastship checkout. Start by reading AGENTS.md, reports/Fastship Uber behavior and Azure.md, reports/Fastship Claude implementation plan.md, reports/Fastship algorithm specifications.md and research_notes/Fastship Uber behavior and Azure/app_audit.md. Inspect git status and preserve all user changes. This evidence bundle requires the existing checkout; it is not an application-source backup.

Execute work packets01–16 in dependency order, starting with packet01 only. Complete each packet's concrete schema/API/code/test/evidence deliverables and independent review before moving on. Continue autonomous local, reversible engineering without asking the owner to choose technology. Keep a result record under docs/implementation/WPxx.md and fix any reproduced broken check in the same task. Actual credentials, provider/account access, legal operating evidence and irreversible/outward actions remain owner-controlled gates; finish all independent engineering before requesting them. Do not commit, push, provision paid resources, deploy, contact providers or perform real transactions without the required standing or explicit authorization.

Prescribed stack: existing Node24 TypeScript modular monolith; API+durable worker Azure Container Apps; PostgreSQL/PostGIS; transactional database outbox; private Blob; Key Vault/managed identity; Expo native push plus existing Web Push; Web PubSub Standard for commercial realtime; retained self-hosted OSRM; GitHub Actions OIDC. Student Azure is the educational sandbox. Funded commercially appropriate PAYG is the production subscription. Stage West Europe; production region requires the stated carrier/data/SKU/recovery evidence. Do not propose alternative stacks or add microservices/Redis/H3/ML/surge/global matching/insertion optimization in v1.

Preserve current consumer auth/passwords/sessions, installed-client /api paths, numeric IDs, configured tariffs/whole-ILS payable rounding, partner references, completed-only ratings, current statuses and parcel batching. Returned orders remain finished for settlement/disputes/history, not rate eligibility. Preserve same-order return custody, sender PIN, proof attempts, commission/cash history and safety holds. Do not replace real behavior with mocks. Preserve age-based GPS and latest-fix privacy; online preassignment tracking requires consent and heartbeat authority. Lock driver/vehicle/account across modes and projected cash exposure, not just an exclusive-assignment index.

Use the binding v1 defaults in the main report/work plan: heartbeat15s/lease60s/freshGPS30s, moving5s/stationary15s/transport minimum2s; offer15s/max3offers/search90s; quoteTTL120s; OTP300s/5tries/resend45s with phone/device budgets and shared-NAT-sensitive IP risk review; no new wait/no-show/cancel fees; current seven-day/30-minute schedule semantics; projected cash cap100000minorILS including reservations; raw production traces off. Values are proposed versioned policy to validate, not recovered Uber constants.

Run lint and typecheck for each completed packet and meaningful changed-behavior tests. Prove import parity, multi-process races, outbox crash recovery, balanced financial journals, role/privacy isolation, physical-device network behavior, local route feasibility and restore/reconciliation before launch. Existing local lint/typecheck/42suite scripts/load checks passed26Oct2026; do not claim these prove production readiness. Read exact Expo57 official docs before any Expo/RN API code and install native modules with npx expo install. Do not manually create generated ios/android projects.

No UI specifics are prescribed here. Read docs/screens/manifest.json and docs/screens/README.md for84 seeded browser mobile-viewport captures; they are existing-app evidence, not native or Uber screenshots. Keep backend contracts stable while any separate visual work proceeds. Finish packet01 with a concrete baseline record and proceed through unblocked engineering; never invent successful provider, license, payment, safety or field-test evidence.
```

## Artifact and change record

The final bundle contains the main audit, this ordered work plan, algorithm specifications, research evidence and existing screenshots. It requires the existing Fastship source checkout; it does not contain a full app source backup or cloud credentials. Document corrections completed during QA: preserve courier batching; preserve installed endpoints; preserve same-order return/PIN/cash semantics; preserve skew-safe latest-fix location/privacy; preserve completed-only ratings; distinguish seeded browser screenshots from native/Uber captures; include worker/OSRM in hosting costs; align fixed defaults and shared-NAT/cash-exposure concurrency rules. Each correction was checked against the source or the synchronized final report registers. Application code remained unchanged.
