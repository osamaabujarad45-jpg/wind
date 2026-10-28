# Build Wind into dependable transport infrastructure

Prepared **26 October 2026** for Fastship, whose application is branded Wind. Scope: passenger rides, parcel/last-mile delivery, freight, operations, and Azure hosting for Palestine. This is an audit and implementation specification; no infrastructure was provisioned or application code changed.

**Wind already contains a real transport application and backend. Preserve its working capabilities and strengthen assignment, money, notifications, geography, and recovery.** Its present operating model lets drivers browse jobs and negotiate offers; instant dispatch needs verified online supply, fresh positions, road-time ranking, expiring offers and database-enforced ownership. Retain negotiated freight and the existing parcel workflow. The prescribed hosting foundation is a Node API and worker on Azure Container Apps, PostgreSQL/PostGIS, private Blob objects, Key Vault/managed identity, a transactional outbox, native push, and paid Web PubSub for production realtime. Student Azure funds educational development; use a commercially appropriate PAYG subscription for paid operations. Palestine requires field evidence for roads, telecom and merchant settlement. REA is a general analysis toolkit, not a recovered Uber implementation, so the algorithms here are independent specified designs rather than claims about Uber's private systems.

**Read order:** this report → [Claude implementation plan](<Fastship Claude implementation plan.md>) → [34 algorithm specifications](<Fastship algorithm specifications.md>). Supporting evidence: [local app audit](<../research_notes/Fastship Uber behavior and Azure/app_audit.md>), [Azure research and cost detail](<../research_notes/Fastship Uber behavior and Azure/azure_research.md>), [REA/public behavior research](<../research_notes/Fastship Uber behavior and Azure/reference_algorithms.md>), and [existing screenshot inventory](<../docs/screens/README.md>). The handoff archive preserves these workspace-relative paths and contains reports, research and captures; **it requires the existing Fastship source checkout for implementation and source links and is not an application source backup**. The report prescribes one implementation path; factual comparisons explain exclusions/deferrals. Final report/plan policy overrides illustrative alternatives in supporting research notes.

## 1. Preserve the substantial application and close its actual gaps

### What the source proves

The working tree uses Expo SDK 57, React Native 0.86.3, Expo Router, TypeScript, and a Node 24 server with SQLite WAL. It implements customer/driver/admin roles, Arabic/English, and parcel/ride/freight models. **The server enables only parcel unless configuration explicitly enables the other services.** Local implementation does not establish deployment configuration or operating permission. Railway deployment definitions currently expect one replica and an on-disk SQLite database. ([Runtime](<../package.json:8>), [models](<../src/model.ts:17>), [enabled services](<../server/main.ts:34>), [database](<../server/main.ts:122>), [deployment](<../railway.json>))

| Area | Existing behavior to preserve | Required extension | Stage |
|---|---|---|---|
| Identity | Password hashing, hashed sessions, native SecureStore, contact-verification options and deletion | Tested Palestinian phone verification/recovery, session rotation and privileged staff MFA/scopes | Foundation |
| Supply | Pending/active/blocked drivers and vehicle-class matching | Verified driver/vehicle records, seats/load/dimensions/expiry, route permission and server availability lease | Foundation |
| Quotes | Server fare verification and persisted booking command replay | Immutable quote with tariff/route/restriction/itinerary revisions and minor-unit breakdown | Foundation |
| Assignment | Transaction prevents two claims on the same order; counteroffers | Ranked automatic dispatch, offer leases and cross-service driver ownership constraints | Foundation |
| Tracking | Foreground/background uploads, plausible-jump filters, fix freshness and authenticated long-poll | Consented pre-assignment presence, durable reconnect and bounded mobile action queue | Foundation |
| Routes | Private OSRM, alternatives, checkpoint closure checks and detours | Operational polygons/corridors, restriction provenance/expiry and field evaluation | Foundation |
| Pricing | Parcel size fare; road-based ride/freight fare; night/discount/counteroffer policies | Integer minor units, explicit wait/cancel/no-show/change rules and tariff audit | Foundation |
| Notifications | Browser Web Push and driver alerts | Native push, durable outbox, token lifecycle, receipt/retry/expiry handling | Foundation |
| Fulfillment | Searching/assigned/pickup/transit/completed plus hold/return states and codes | Ride start identity proof, assignment epochs and complete guard/recovery tables | Foundation |
| Cash | Commission snapshots, remittance confirmation, disputes and adjustments | Balanced fare/COD/driver/merchant/commission subledgers, exposure and reconciliation | Foundation |
| Digital payments | No verified live merchant/payout integration established | Approved local provider, hosted checkout, signed webhooks/refunds and settlement recovery | Provider gate |
| Courier runs | Existing multi-parcel jobs and city-grouped run sheet | Measured load and feasible stop constraints; preserve current batches | Foundation then optimization |
| Safety/support | SOS hold, private tracking links, trip chat, disputes and resolution | Staff coverage, scoped safety/finance access, escalation, appeals and evidence policy | Foundation |
| Schedules | Up to seven days; release before pickup; parcel rescheduling | Actual commitment/reserved supply, readiness checks and durable activation | After core |
| Growth | Referrals, promotions, subscriptions and partner order bridge | Atomic budgets/entitlements and settled financial qualification | After core |
| Operations | Real single-process service and tests | Shared persistence, restore-tested hosting, metrics, cost ceilings and controlled pilot | Foundation |

These findings are tied to [authentication](<../server/main.ts:2305>), [vehicle policy](<../src/model.ts:59>), [job discovery](<../server/main.ts:1528>), [atomic claim](<../server/main.ts:1544>), [fare verification](<../server/main.ts:1067>), [GPS gate](<../server/main.ts:1754>), [browser-only push](<../src/push.ts:1>), [memory notification queue](<../server/main.ts:929>), [cash operations](<../server/main.ts:1993>), and [schedule release](<../server/main.ts:969>).

Two policies are immediate production correctness work: parcel vehicles share a ceiling of **200 assignments regardless of usable load**, and serviceability uses **15 km city circles**. Replace the ceiling with measured capacity and stop feasibility without deleting existing courier batching. Replace circles with versioned operational polygons and corridor permissions; proximity does not prove connectivity or lawful access. ([Capacity](<../src/model.ts:169>), [coverage](<../src/model.ts:144>), [server pin check](<../server/main.ts:1012>))

### Verification supports the baseline, not a production guarantee

On 26 October, **lint, typecheck, all 42 npm test script entries, and the isolated local load harness passed** with Node 24.12.0/npm 11.11.0. The load harness used a temporary database, verified 430 idempotent bookings and concurrent authorization/privacy/long-poll behavior, and recorded 213.83 requests/second with p95 342.45 ms in one synthetic mixed run, expected throttling and no counted errors/timeouts. These are local observations, not Azure capacity, native-device readiness or provider-contract evidence. **No application code fix was required or made.** ([Test evidence](<../research_notes/Fastship Uber behavior and Azure/app_audit.md>))

### REA provides tooling, not Uber's server algorithms

REA is the MIT-licensed rea-agents toolkit, verified at version 6.8.0 and commit 9341b116efddefc2bcdd8208d27d6e4ea78cc507. No Uber server implementation, real Uber session or genuine Uber screenshot set was supplied or recovered. No REA code was executed. ([Pinned repository](https://github.com/morluto/rea/tree/9341b116efddefc2bcdd8208d27d6e4ea78cc507), [pinned license](https://github.com/morluto/rea/blob/9341b116efddefc2bcdd8208d27d6e4ea78cc507/LICENSE))

Use four labels in every ticket: **observed Wind code**, **public Uber behavior**, **prescribed Wind design**, and **unverified dependency**. Public matching, cancellation and delivery-proof documentation informs behavior without revealing private weights/thresholds. The appendix specifies implementable original algorithms and their tests; no public study can truthfully certify every hidden Uber algorithm. ([Uber matching](https://www.uber.com/ug/en/marketplace/matching/), [dispatch/cancellation](https://developer.uber.com/docs/guest-rides/guest-ride-api-build-guide/dispatch-and-cancellation), [proof of delivery](https://developer.uber.com/docs/deliveries/guides/proof-of-delivery))

## 2. Establish one authoritative core for dispatch, custody and money

### The prescribed architecture

Keep one modular Node codebase with an API process and durable worker process. PostgreSQL/PostGIS owns domain state, event history, idempotency and accounting. Private Blob storage holds proof/documents. Provider adapters isolate OSRM/maps, telecom, push, realtime and payments. Preserve existing /api/orders, /api/health and /api/ready contracts and installed native clients; new conceptual /bookings or health names in the appendix are versioned aliases/adapters, not replacements.

~~~mermaid
flowchart LR
  M[Expo customer and driver apps] --> A[Authenticated Node API]
  O[Operations and merchant clients] --> A
  A --> P[(PostgreSQL and PostGIS)]
  A --> B[Private Blob storage]
  P --> W[Durable outbox and worker]
  W --> R[Web PubSub and native push]
  W --> X[OSRM telecom and payment adapters]
  R --> M
  M -->|Snapshot and event cursor on reconnect| A
~~~

Every mutation carries an idempotency key and payload hash: same command replays its committed result; changed payload under the same key fails. State/version update, domain event, relevant journal and outbox commit together. Publish after commit; deduplicate consumers by event ID. Missing event versions cause a snapshot/replay fetch. Push and realtime are delivery mechanisms, never assignment ownership.

**One active assignment per booking and one active exclusive assignment per driver** must be enforced across service types in the database. Preserve feasible parcel batches as a separate capacity-controlled mode. Two concurrent accepts on different bookings by the same driver must not both succeed. Accept, cancel, expiry and reassignment contend on the same versioned rows and authoritative server time. Test through two server processes/database connections, not only an in-memory lock.

### Dispatch policy and defaults

Implement instant dispatch for standard passenger rides, negotiated offers for freight/configured products, and capacity-controlled courier runs for parcels. For instant dispatch, filter account/verification, vehicle/permit, zone/corridor, current lease, fresh valid position, compatible capacity, safety blocks and legal/operational route feasibility before scoring. PostGIS finds nearby candidates; road-time queries evaluate a bounded subset. Rank by pickup ETA with a bounded idle-time fairness term and deterministic tie-break. Log policy/features and score version.

Initial engineering defaults are a 15-second presence heartbeat, 60-second presence lease, 15-second offer lease, and 90-second terminal search deadline. These are **prescribed pilot starting values**, not Uber facts or achieved service guarantees. The appendix supplies failure cases and calibration. Persist timed offers; revalidate eligibility at accept; atomically assign, revoke competing offers, append event/outbox and return current state to losers. Declines/timeouts advance bounded rounds. Late notifications cannot accept cancelled/expired offers.

Reassignment increments an epoch, revokes former-driver access and records a reason. Before pickup, lease disappearance can trigger policy-based replacement. After boarding or custody, use a distinct support/safety or documented transfer workflow. Do not place onboard passengers or parcels back into ordinary job search.

### Binding v1 policy register

These are prescribed initial settings for implementation/tests, not recovered Uber constants, measured local guarantees or legal rules. Store them as versioned server configuration. Tuning requires field evidence/tests and a new version; disabled features remain disabled rather than leaving coefficients for Claude to invent.

| Policy | Binding v1 setting |
|---|---|
| Presence | Heartbeat 15 seconds; lease expires 60 seconds after server receipt; explicit online-session consent and no collection after going offline. |
| Location | Moving target 5 seconds, stationary 15 seconds; preserve 2-second upload floor and age-based skew-safe ingest; matching fix age at most 30 seconds. OS restrictions produce stale state, never fabricated freshness. |
| Raw history | Off in production; separate consented QA traces expire after 24 hours. Preserve latest-fix privacy. |
| OTP | Expiry 300 seconds; 5 attempts; resend 45 seconds; phone caps 3 challenges/15 minutes and 10/day; IP 30/hour triggers abuse review rather than a sole shared-carrier-NAT hard block. Enforce phone/device and global provider budgets. |
| Dispatch | Sequential 15-second offers, maximum 3 offers and absolute 90-second search deadline. State change/cancel invalidates offers. |
| Ranking | Pickup ETA seconds minus min(60, floor(available-idle seconds/10)); stable driver-ID tie-break. Eligibility/route feasibility precede scoring. |
| Quote | TTL 120 seconds. Confirmed closure/eligibility failure invalidates safely; changed scope requires accepted change quote. |
| Prices | Preserve current tariffs and whole-ILS payable rounding; store minor units; basis-point commission/discount with deterministic remainder allocation. |
| New penalties | New wait/no-show/cancel fees zero; 300-second arrival grace sends notifications/support state only. Preserve existing accepted fare/return behavior. |
| Cash exposure | New cash work cannot project above 100,000 ILS minor units (ILS 1,000) held by a driver; daily settlement review. Never strand existing custody or erase obligations. |
| Schedules | Preserve seven-day window and release 30 minutes before pickup; no guaranteed reservation product until later gate. |
| Courier runs | Preserve existing multi-order/manual run sheet with verified capacity/stop constraints. Automatic insertion optimizer is off in v1; any later 10-minute insertion limit in appendix is future-only. |
| Advanced work | H3, global solver, microbatch matching, ML dispatch/ETA, surge, automatic repositioning and shared-ride pooling disabled in v1. PostGIS/deterministic road ETA remain authoritative. |
| Compatibility | Existing accounts/session contracts and /api routes retained. Completed-only ratings unchanged. Provider OTP does not force re-registration. |
| Notifications | Durable Expo native push plus existing Web Push; action fetches current resource. Push never overrides lease/state. |

Existing stronger customer promises and verified load restrictions remain binding. Tests must prove expiry/caps, shared-NAT handling and network-loss recovery before activation.

### Immutable quotes and independent lifecycle records

Persist customer/product, itinerary, route/restriction/tariff versions, integer minor-unit lines, currency, ETA interval, expiration and disclosures. Booking references quote ID; no client total is authoritative. Apply a published honor/requote rule, never silently recompute an unrelated completion price. Destination, stop, size or loading changes produce a change quote and explicit acceptance. Waiting/cancel/no-show rules include actor, grace period, evidence, fee allocation and appeal. Keep demand pricing disabled for the initial launch; later activate the capped/smoothed, versioned algorithm only after shadow evaluation.

Trip, assignment, custody, payment, settlement and support are separate records. Existing same-order on_hold/returning/returned states, sender return PIN, history, locks and financial obligations remain valid through migration. A completed trip can have payment pending; a returned parcel can have an open dispute. Preserve the current **completed-only rating endpoint and UI**. Returned orders count as finished for history, disputes and settlement; that does not make them rating-eligible. Returned-rating support remains disabled in v1 and requires an explicit later policy/API change. Richer target state names must not erase current historical behavior. ([Transitions/proof/returns](<../server/main.ts:1638>), [exceptions](<../server/main.ts:1666>), [server rating guards](<../server/main.ts:1280>), [rating UI](<../src/app/order/[id].tsx:431>))

Courier records distinguish sender, recipient, payer and merchant and track each custody handoff. Freight adds measured weight/volume/dimensions, equipment/crew, access, loading/waiting and change orders. Reservations distinguish requested window, tentative planning, confirmed driver commitment and dispatch activation; delayed visibility alone is not a guarantee.

### Financial correctness precedes digital expansion

Use immutable balanced journals per currency: customer receivable, driver cash held, driver payable, merchant COD payable, platform commission, PSP clearing, promo expense and refunds. Reversals are new linked entries. COD goods and remittances are not platform revenue. Define cash exposure/aging and shortage handling before expanding courier volume.

Digital payments use explicit intent/authorization/capture/unknown/refund/chargeback/settlement states. Timeout after capture means pending reconciliation, not permission to charge again. Verify signed webhook, event uniqueness, order, amount and currency. Payout has an independent idempotent recovery workflow. Implement only capabilities contractually supported by the local provider; do not emulate regulated escrow with an application balance.

### All 34 behavior groups have detailed specifications

The [algorithm appendix](<Fastship algorithm specifications.md>) includes identity/recovery; driver/vehicle eligibility; serviceability/addresses; presence/GPS/offline; route/ETA; quotes/pricing/surge; dispatch/fairness/atomicity; service lifecycle and custody; waiting/cancellation; cash/COD and provider money; safety/fraud; ratings/disputes; freight; reservations; multi-stop/batching; promotions/subscriptions/business; accessibility/guest use; administration; privacy/retention; observability/recovery; concrete API/event/error contracts; concurrency pseudocode; implementation gates; screenshots; Palestine route evaluation; and recoverable notifications. It supplies schemas, formulas, invariants and acceptance/failure tests, not only feature titles.

After the core passes, use historical replay, shadow decisions and bounded pilot rollout for ETA residual prediction, timed dispatch, feasible courier insertion, demand forecasts and repositioning. Measure pickup accuracy, completion, utilization, cancellations, support burden, safety false positives and contribution. An LLM never owns fare arithmetic, assignment authority, ledger posting or emergency decisions.

## 3. Make Palestine serviceability and provider evidence explicit

Configure West Bank and Gaza independently with approved zones, corridors, services, vehicles, hours and staffed fallback. The current West Bank city list does not establish Gaza, East Jerusalem or cross-border permission. Maintain restriction source, confidence, effective time, expiry and audited override. Existing OSRM/checkpoint behavior remains the baseline; no path guarantees safety or checkpoint-free passage. ([Cities](<../src/model.ts:3>), [closure routing](<../server/main.ts:1884>), [ETA assumptions](<../src/model.ts:190>))

Azure Maps coverage pages reviewed did not explicitly establish Palestine/West Bank/Gaza routing, geocoding or traffic support. That means unconfirmed published coverage, not proof every coordinate fails. **Retain self-hosted OSRM initially**, behind a routing interface, and benchmark Arabic addressing/geocoding providers and Azure Maps against local evidence before any replacement. Record graph/profile/provider/restriction versions. Use at least 100 representative origin/destination pairs per launch area as the initial engineering target, including villages, landmarks, entrances, one-way roads, closures, restricted/inaccessible corridors, stale/contradictory reports and freight constraints. Evaluate ETA interval coverage and corridor underprediction, separating travel from loading/checkpoint dwell. ([Routing coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage), [geocoding coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geocoding-coverage), [traffic coverage](https://learn.microsoft.com/en-us/azure/azure-maps/traffic-coverage))

Keep entered phone text, validated canonical form and routing metadata. Test +970 and applicable Palestinian-network +972 formats without rewriting every +972 number or inferring nationality. Twilio documents Palestine-specific two-way limitations and Palestinian prefixes +97256/+97259; these do not guarantee merchant approval or delivery. The prescribed OTP adapter must pass opted-in Jawwal/Ooredoo, delayed/out-of-order code, resend/abuse and recovery tests before phone verification becomes a launch dependency. ([SMS guidance](https://www.twilio.com/en-us/guidelines/ps/sms), [prefix update](https://www.twilio.com/en-us/changelog/programmable-sms-geo-permissions-israel-and-palestine-prefix-update))

**Do not build the Palestinian merchant flow on Stripe.** Its merchant-support list does not include Palestine. Integrate the Bank of Palestine gateway adapter only after its merchant onboarding/capability gate passes; otherwise the initial permitted pilot remains cash with a balanced ledger. The bank advertises a merchant gateway but does not publicly establish this business's eligibility, preauthorization, marketplace split payouts, native return flow or webhook/refund semantics. Request a dated written capability/fee/sandbox matrix; no external provider was contacted in this task. ([Stripe availability](https://stripe.com/global), [Bank of Palestine gateway](https://web.bankofpalestine.com/business/electronic-services/digital-payments/payment-gateway))

The commercial provider packet must identify legal entity, beneficial owners, bank, transport categories/areas/currencies, hosted checkout/3DS return, card-data flow, webhook signature, capture/void/refund, disputes, settlement files, payout method and fees. A card gateway is not automatically a marketplace payout provider. No unlicensed wallet/escrow is prescribed. Local wallet providers remain a later integration after documented licensed capability. ([PMA payment-services context](https://www.pma.ps/Portals/0/Users/002/02/2/Publications/English/Annual%20Reports/PMA%20Annual%20Reports/Annual%20Report%202023.pdf))

Store UTC instants and use Asia/Hebron for local schedules; test DST and device-clock changes. Preserve the existing age-based/skew-safe location ingestion. Additional trace/history collection requires explicit online-session consent, purpose, retention and access controls; do not quietly broaden the current last-fix/active-order privacy model. Presence expires by server time. Physical iOS/Android tests must cover background/foreground, OS termination, permission/battery restrictions, weak coverage, airplane mode and app upgrade.

| Launch gate | Accountable party | Pass evidence |
|---|---|---|
| Operating area/service permission | Business operator with competent local review | Written permitted services, driver/vehicle/insurance rules and approved zones/corridors; failing areas remain disabled. |
| Route quality | Engineering + local dispatcher/drivers | Versioned corpus, adjudicated restrictions, measured ETA/entrance errors and explicit unknown-route fallback. |
| Phone verification | Engineering + contracted telecom provider | Successful consented tests on relevant local carriers/formats, abuse/recovery evidence and approved sender. |
| Digital merchant operation | Business finance + bank/provider + engineering | Approved merchant agreement, documented capabilities, sandbox and controlled reconciliation evidence; otherwise digital remains off. |
| Safety/support response | Operations lead | Staffed rota, escalation/degraded-mode drill, scoped permissions and promises matching coverage. |
| Native reliability | Engineering | Physical-device evidence across network/background/permission failure matrix. |

These are concrete external pass/fail prerequisites, not open-ended engineering choices. Independent implementation proceeds while evidence is collected; unavailable provider capability is never replaced with invented certainty.

## 4. Use the prescribed Azure stack and fund production properly

### Student credits serve development, not the revenue plan

Azure for Students advertises **USD 100 for 12 months**, renewable while eligibility continues, with applicable free allowances. It is not USD 100 per month. The actual balance, anniversary, quotas and allowed regions were not inspected. Exhaustion/expiry can disable service; Marketplace purchases do not consume the grant. ([Students](https://azure.microsoft.com/en-us/free/students), [disablement](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/azurestudents-subscription-disabled))

The Education FAQ describes educational/teaching/noncommercial research and related app development/testing. The offer page places explicit noncommercial language under Software Download Benefits. **Use student Azure for educational development/testing and a commercially appropriate PAYG subscription for paid service.** Written Microsoft confirmation is the gate for any proposal to fund revenue operations with student credit; this report does not assert a definitive contract-wide legal ban from one paragraph or grant blanket permission. Existing student enrollment does not prove eligibility for startup benefits requiring a new customer. ([Education FAQ](https://learn.microsoft.com/en-us/azure/education-hub/faq), [offer 0170p](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p), [comparison](https://azure.microsoft.com/en-us/free/students))

### Relevant Azure uses have fixed stages

Deploy the initial engineering/staging configuration in **West Europe** as the report's measured-price baseline. Production uses that region only after local carrier latency, required SKU/quota, data-location and recovery gates pass; failure blocks production deployment and triggers a documented revised architecture record, rather than pretending region proximity proves suitability. Colocate API/database/realtime. Azure lists no Palestine region. ([Region list](https://learn.microsoft.com/en-us/azure/reliability/regions-list))

| Use case | Prescribed capability | Stage/responsibility |
|---|---|---|
| Quotes/orders/accounts API | Container Apps Consumption, custom Node container | Now; health/readiness, graceful drain, no local persistent database. |
| Fixed-price hosting comparison | App Service | Excluded from this implementation; avoid two parallel API hosts. |
| Async/scheduled work | Same Node worker on Container Apps | Now; durable deadlines, leases, retries and graceful shutdown. |
| Transactional domain state | PostgreSQL Flexible Server | Now; migration, constraints, pooling and production HA gates. |
| Spatial supply/zones/restrictions | PostGIS | Now; GiST indexes plus route/permission logic. |
| Ephemeral cache/presence acceleration | PostgreSQL first; Managed Redis deferred | Add only after measured DB bottleneck; never money authority. |
| Durable distributed messages | PostgreSQL outbox/inbox | Now; Service Bus Standard deferred until distributed consumer need. |
| Realtime tracking/offers/chat | Web PubSub Standard for paid production | Scoped tokens/groups and snapshot reconciliation; free tier only small development. |
| Native notifications | Expo push/APNs/FCM adapter | Now; outbox, tokens, receipts. Notification Hubs excluded initially. |
| Consumer identity | Harden current auth + tested external OTP adapter | Now; Entra External ID excluded from initial migration. |
| Privileged staff identity | Entra workforce SSO/MFA + application scopes | Before paid launch. |
| Private proof/docs/invoices | Blob containers per purpose | Now; signed bounded access, validation and retention. |
| Upload security | Validated scanner/quarantine workflow | Before arbitrary uploads; explicitly price Defender if used. |
| Secrets/workload access | Key Vault + managed identities | Now; no secrets in mobile/public environment. |
| Routes/geocode/matrix/traffic | Retained OSRM + provider adapter; Azure Maps benchmark | Now; no replacement before local evidence/terms pass. |
| Diagnostics | Monitor/Application Insights/OpenTelemetry | Now; privacy-safe sampled traces, durable business audit elsewhere. |
| Static web/admin export | Existing API image export initially | Static Web Apps deferred; backend permissions mandatory. |
| Images/build artifacts | Container Registry | Now; pinned digest, scan, build manifest/SBOM. |
| CI/CD | GitHub Actions with OIDC | Now; checks/what-if by default, protected external deployment. |
| DNS/TLS/edge | Azure DNS/native TLS | Before launch; Front Door/WAF deferred to justified threat/availability need. |
| Private data network | Necessary private DB paths/private DNS | Production design; price network/endpoints/NAT separately. |
| Operations reporting | PostgreSQL views/aggregates + Blob exports | Now; restricted analyst access and deidentified reporting. |
| High-volume telemetry/archive | Event Hubs/ADLS | Deferred until measured throughput need. |
| Enterprise analytics | ML/Fabric/Synapse/Databricks | Deferred; no launch dependency. |
| Arabic/English support assistance | Foundry via bounded server layer | Deferred; human approves privileged decisions. |
| Document entry assistance | Document Intelligence OCR | Deferred; never automatic driver identity certification. |
| Translation/speech | Translator/Speech | Deferred pending dialect/privacy evaluation. |
| Abuse/anomalies | Deterministic rules/aggregates | Now; ML deferred until labels/review/appeals exist. |
| Recovery | PostgreSQL PITR + Blob redundancy/lifecycle + IaC | Before paid launch; measured restores and RPO/RTO. |
| Governance/cost | RBAC/Policy/tags/budgets/Service Health | Now; SKU/replica/provider limits. |
| Kubernetes/service mesh | AKS | Excluded; unnecessary operational burden initially. |
| Duplicate primary stores | Cosmos DB/Azure SQL/additional identity stacks | Excluded without new requirements. |
| Standalone SMS/email/chat/router | Retiring ACS capabilities | Excluded from new dependency stack. |

Azure infrastructure does not supply transport dispatch, accounting or staffing. Container Apps grants/scaling, PostGIS support and Web PubSub connection/message limits must be respected. Web PubSub Free permits only 20 connections and 20,000 messages/day; consumer identity free MAUs do not guarantee Palestinian SMS. ([Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing), [PostGIS versions](https://learn.microsoft.com/en-ca/azure/postgresql/extensions/concepts-extensions-versions), [Web PubSub pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/), [External ID pricing](https://www.microsoft.com/en-us/security/pricing/microsoft-entra-external-id/))

For new caches, use Managed Redis when its deferred gate is reached; legacy Azure Cache for Redis has a retirement path. ACS's live guide puts standalone SMS/email/chat/rooms/direct-routing/number-management/Job Router on retirement paths, with restrictions beginning 23 October 2026 for retiring services and new-customer number acquisition. This does not mean every ACS function is already shut down; voice/video and Call Automation have separate Teams-related transition conditions. ([Redis retirement](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/retirement-faq), [current Redis timeline](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-whats-new), [ACS live guide](https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide))

### Costs are dated, regional and explicitly incomplete until sized

Public USD PAYG West Europe meters were retrieved 26 October. They are not an Azure invoice, student entitlement or contractual quote. [Curated evidence](<../research_notes/Fastship Uber behavior and Azure/azure_retail_prices_curated.json>) preserves exact query/meter records. ([Retail API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), [Container Apps](https://azure.microsoft.com/en-us/pricing/details/container-apps/), [PostgreSQL](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/))

| Item | Recorded rate/calculation | Illustration |
|---|---|---:|
| Container Apps active CPU/memory | USD 0.000034/vCPU-second; USD 0.000004/GiB-second | Meter rates |
| HTTP over allowance | USD 0.56/million | Meter rate |
| One 0.25-vCPU/0.5-GiB API active 730 hours | Shared 180,000 vCPU-second/360,000 GiB-second grants applied once | USD 20.03/month |
| Two such API replicas | Same shared grant | USD 47.63/month |
| B1MS + 32 GB storage | 730 × 0.0199 + 32 × 0.1369 | USD 18.91/month |
| B2S + 64 GB | 730 × 0.0796 + 64 × 0.1369 | USD 66.87/month |
| Standard Web PubSub unit | USD 1.61/day × 30 | USD 48.30/month |
| Service Bus Standard base, deferred | One applicable base billing basis | About USD 10/month |

**USD 38.94 is only the illustrated one-API-plus-B1MS subtotal. It excludes the worker, retained OSRM compute/storage, realtime, backups beyond allowance, maps/geocoding, telecom, storage, logs, networking, registry, support and taxes.** Adding Standard PubSub produces USD 87.24 before those remaining items; adding deferred Service Bus would produce USD 97.24, still not a full deployment bill. B1MS/B2S are Burstable illustrations, not HA production recommendations. Verify any first-year free DB benefit in the actual account.

| Profile | Planning allowance, not a quote | Conditions |
|---|---:|---|
| Educational sandbox | USD 0–25/month | Light use, scale-to-zero, local/short-lived DB or verified allowance, tiny data/tester count. USD 100 lasts four months at USD 25, about a year at USD 8.33. |
| Limited city pilot | USD 100–250/month provisional | Requires actual worker/OSRM/provider sizing. Single-node outage risk cannot be disguised as resilient service. |
| Resilient commercial city service | USD 300–1,000+/month provisional baseline | Multiple API replicas, durable worker, suitable HA database, paid realtime, recovery/monitoring. Replace range with full cost model; traffic/network choices can exceed it. |

These allowances exclude staff, vehicles, insurance, licensing, marketing and payment fees. Before deployment generate a complete calculator/price export with every enabled meter and external provider. No student quota/free benefit is assumed beyond confirmed account evidence.

~~~text
monthly cost = API + worker + retained OSRM compute/storage or replacement routes
             + DB compute/storage/backup/HA + realtime units/messages
             + queue base/operations + Blob/scan/operations/egress
             + geocode/matrix + OTP/voice/email/push
             + logs/retention/alerts + registry/DNS/edge/private network
             + AI/support/taxes
GPS updates/day = online drivers * online hours/day * 3600 / update seconds
matrix elements/day = jobs/day * quotes/job * road-time candidates/quote
proof storage bytes = jobs/day * proof bytes/job * retention days
~~~

At 100 drivers, eight hours/day and five-second GPS updates, ingress is 576,000 updates/day before fanout/chunking. Scope streams to authorized participants, coalesce stationary fixes, filter before paid matrices and never recalculate paid routes on every ping. Budget alerts **do not cap spending**. Use maximum replicas, provider/OTP budgets, sampled logs, retention and SKU policy. A spend alarm triggers triage/degraded operation, not termination of a live trip's database. ([Budgets](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets))

Revenue is customer service revenue minus driver/merchant obligations, PSP/payout fees, telecom/maps/realtime, subsidies, expected refunds/fraud/cash loss and variable support/insurance. Break-even jobs equal fixed costs divided by positive contribution/job. Goods COD and driver/merchant money are liabilities, not platform revenue. If contribution is negative, more volume increases losses. Measure conversion, no-supply, pickup ETA error, completion, cash aging, support and contribution per product/area before expansion. Existing commission/subscription defaults are policies, not proven margin. ([Settings](<../src/model.ts:71>), [subscriptions](<../server/main.ts:2072>))

## 5. Deliver Claude a fixed sequence, authentic evidence and release gates

### Migrate before scaling and preserve installed clients

Introduce a persistence/transaction boundary around SQLite, preserve API fixtures/IDs, and create PostgreSQL migrations for foreign keys, versions, idempotency/provider-event uniqueness, active assignment constraints and spatial indexes. Convert floating fares through reviewed deterministic minor-unit migration while preserving current integer cash entries. Reconcile counts, balances, open obligations, returns/history, active assignments, Arabic and timestamp round-trips. Use one writer. Rehearse freeze/export/import/reconciliation/cutover. After PostgreSQL accepts new writes, pointing to stale SQLite loses data; rollback must preserve the write boundary or reconcile. Scale only after multi-process races/outbox recovery pass. ([Persistence](<../server/main.ts:122>), [money schema](<../server/main.ts:137>))

The companion plan gives ordered packets, exact existing touchpoints, new schemas/APIs, failure cases and exit gates. CI produces tests, scans, immutable images, infrastructure what-if and cost evidence. Deployment, billing conversion, provider signup, commit and push remain outward actions requiring standing authorization. No approval is required for the research delivered here.

### Give Claude screenshots without prescribing the UI

There are **84 existing PNGs across Arabic/English folders and 38 manifest entries**, captured 21 October at a 390×844 browser viewport with device scale two. They are genuine seeded Wind browser captures, **not native-device tests or Uber screenshots**. Claude should use them to understand current behavior and preserve states while owning visual implementation. ([Inventory/provenance](<../docs/screens/README.md>))

| Scenario | Reference |
|---|---|
| Arabic home | [home.png](<../docs/screens/ar/home.png>) |
| Ride booking | [book-ride.png](<../docs/screens/ar/book-ride.png>) |
| Live order/tracking | [order-live.png](<../docs/screens/ar/order-live.png>) |
| Driver jobs | [driver-jobs.png](<../docs/screens/ar/driver-jobs.png>) |
| Courier run sheet | [driver-run-sheet.png](<../docs/screens/ar/driver-run-sheet.png>) |
| English operations | [admin-dashboard.png](<../docs/screens/en/admin-dashboard.png>) |

Future authorized reference capture records source app/build, OS/device, locale, market, date, scenario/action trace, resulting state and redacted screenshot IDs. Screenshots prove observed states, not server algorithms. Never generate an image and label it a real Uber capture. No UI layout, spacing, component styling or animation prescription is included here.

### Pass these gates before the promises go live

| Gate | Required evidence |
|---|---|
| Ownership | Multi-process same-order/cross-order accepts, cancel/expiry races, reassignment epochs and feasible capacity: no double assignment. |
| Money | Balanced per-currency journals; duplicates/unknown PSP outcomes; refunds/chargebacks; partial remittance/COD returns and reconciliation. |
| Native/network | Physical iOS/Android poor-network, background/kill/restart, token/permission/battery and conflict recovery. |
| Local operations | Route/address corpus, restriction freshness, eligible fleet, approved area/services and staffed escalation. |
| Providers | Merchant/telecom approvals and real carrier/settlement tests; mocks never count as live. |
| Privacy/security | Object/stream/download authorization, MFA/scoped staff, private proof, redacted logs, retention/holds and uploads. |
| Recovery | Restored records reconcile; API/worker interruption, duplicate delivery, provider outage and degraded-mode drills; measured RPO/RTO. |
| Capacity/cost | Actual-region staging load, connection/queue bounds, complete meter/provider model and funded production. |
| Economics | Representative pilot conversion/completion/ETA/cash/support outcomes and positive sustainable contribution. |

Start with a bounded approved area and controlled driver/merchant cohorts, then enable each service only after its custody/money/operations gates pass. Prescribed performance targets are acceptance hypotheses, not achieved SLAs. Claude can implement the software; credentials, operating permission, bank/telecom approval and staffed commitments require real external evidence.

### Review corrections and verification

| Issue | Correction made to this handoff | Verification/source |
|---|---|---|
| Generic exclusive-job rule would remove courier batching | Exclusivity applies to ride/freight/incompatible work; preserve parcel batches with measured capacity | [Current capacity/run-sheet policy](<../src/model.ts:169>), algorithm D23 |
| API+DB subtotal sounded like full API+worker pilot | Explicitly excluded worker and OSRM plus all remaining meters; USD 87.24/97.24 labels remain subtotals | Curated rates, cost formula above |
| Conceptual new route names risked breaking clients | Preserve /api/orders, /api/health, /api/ready; aliases/versioning only | Current server routes, plan compatibility gate |
| Target state model risked erasing shipped returns/history | Migrate same-order return states/PIN/events/cash; keep historical eligibility | [Transitions](<../server/main.ts:1638>), [exceptions](<../server/main.ts:1666>) |
| New traces could broaden location collection silently | Consent/purpose/retention and online sessions; preserve age-based skew-safe ingest | [Location gate](<../server/main.ts:1754>), algorithm D04 |
| Finished-order terminology was mistaken for rating eligibility | Preserve completed-only server/UI rating policy; returned stays eligible for history/disputes/settlement, not ratings | [Server guard](<../server/main.ts:1280>), [UI guard](<../src/app/order/[id].tsx:431>), algorithm D20 |

The quality bar is a system whose ownership, route uncertainty, price, custody, cash and recovery can be explained and tested. The fixed plan builds that foundation before advanced optimization or visual imitation.
