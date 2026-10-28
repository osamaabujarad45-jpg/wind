# Azure and Palestine production feasibility

Research date: 26 October 2026, Asia/Hebron. Scope: Wind/Fastship passenger rides, parcel delivery and freight in Palestine. This is research and an implementation plan, not a deployment. No Azure subscription was connected, no account eligibility or remaining balance was inspected, and no paid resource was created. Recommendations below preserve the existing Node 24 backend and migrate its SQLite WAL persistence deliberately; they do not assume a greenfield application.

## 1. What can the Azure for Students subscription legitimately and practically fund?

### Takeaway

Azure can host the backend and operational platform. Use the student subscription for educational development, testing, simulations and demonstrations; plan a commercially appropriate pay-as-you-go subscription or separately approved startup benefit before launching paid transport services. Do not promise that student credit is permission for revenue production.

### Cited Findings

- Azure for Students supplies USD 100 credit for use within 12 months, with annual renewal while student eligibility continues. There are monthly free allowances, some limited to first-time customers/12 months and some ongoing; this is not USD 100 per month. No credit card is required at initial signup. [Azure for Students](https://azure.microsoft.com/en-us/free/students).
- The Education FAQ describes the intended Azure-product uses as education, teaching, noncommercial research, and development/testing/demonstration for those purposes. Its wording does not support an unconditional claim that the credit funds any commercial transport service. [Education FAQ](https://learn.microsoft.com/en-us/azure/education-hub/faq).
- The contractual offer page places its explicit education/noncommercial restriction in a section called Software Download Benefits, rather than clearly applying that exact paragraph to all consumed cloud services. Therefore distinguish the FAQ's broad published guidance from a definitive legal interpretation of the cloud contract. Its credit and eligibility rules remain important: one eligible subscription/person, nontransferable credit, and upgrade after exhaustion. [Offer 0170p](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p).
- Short primary excerpt for the final writer, 14 words: “expressly for the support of education or teaching, noncommercial research” from the Education FAQ. Avoid exceeding 25 directly quoted words from this source across the final report.
- On credit exhaustion or expiry the subscription/services may be disabled; renewal is an eligibility process, not an uptime guarantee. Marketplace purchases cannot consume this credit. [Student subscription disablement](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/azurestudents-subscription-disabled); [student offer](https://azure.microsoft.com/en-us/free/students).
- The Students Starter offer is different: only selected free service tiers, initially a zero-dollar spending limit, no equivalent USD 100 grant. It must not be used interchangeably with the user's stated Azure for Students offer. [Students Starter](https://learn.microsoft.com/en-us/azure/education-hub/azure-dev-tools-teaching/azure-students-starter-program).
- Microsoft currently advertises an Azure for Startups path on its student comparison page, but the displayed instant-credit offer requires a new Azure customer. Existing student-account ownership does not prove eligibility; do not invent a new identity or promise the benefit. [Student/startup offer comparison](https://azure.microsoft.com/en-us/free/students).

### Inferences

- **Recommendation:** create the educational sandbox in the existing student subscription and keep production infrastructure parameterized for a different subscription. Obtain written Microsoft confirmation of commercial use if the owner wants to rely on student credits for paying customers; absent that confirmation, use PAYG or a business/startup agreement appropriate to production.
- Commercial launch is a business decision involving billing and service obligations. The plan prepares resource definitions and cost calculations; it does not authorize provisioning, removal of spending limits or conversion of the account.
- USD 100 spread over 12 months averages USD 8.33/month. A managed 24/7 production platform with telecom, maps and payments will generally exceed that planning envelope. A free allowance covers only its named meter and quantity; it does not make an entire architecture free.
- Document `subscriptionId`, offer ID, verified credit balance, anniversary, expiry, service/region quota and deployment permissions as a manual readiness record. Never put subscription credentials or private billing data into the report or client application.

### Gaps

- The actual subscription's offer ID, remaining balance, first-customer benefits, anniversary, allowed regions and quota were not inspected. Exact eligibility must be confirmed in the signed-in portal, without assuming every advertised service can deploy in every student region.
- The apparent difference in scope between FAQ wording and the offer's Software Download Benefits section requires written Microsoft clarification for anyone seeking a stronger legal conclusion. This report is deliberately conservative, not a claim of an unambiguous contract-wide prohibition derived from that paragraph.

## 2. Which Azure services serve the app, and what should the architecture be?

### Takeaway

Keep a modular monolith: one stateless Node API, one worker role from the same source, PostgreSQL/PostGIS, private Blob objects and measured realtime delivery. Azure services replace hosting/infrastructure work; they do not implement ride dispatch, cash accounting or the business's operating procedures.

### Cited Findings

- Container Apps consumption supports request/event scaling and scale-to-zero, with monthly shared grants of 180,000 vCPU-seconds, 360,000 GiB-seconds and two million HTTP requests. Always-running replicas still consume resources, and idle eligibility has CPU/network/request conditions. Additional networking and platform features can incur extra charges. [Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing).
- Azure Functions has several plans. Flex Consumption is the appropriate plan to investigate for new Linux event workloads; legacy Linux Consumption is on a retirement path. HTTP response constraints remain even if execution timeout is longer. [Functions hosting](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale).
- App Service updates supported major runtimes but does not promise an exact Node patch release; a custom container is the option when exact runtime control matters. [App Service runtime support](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy).
- Azure Database for PostgreSQL Flexible Server supports PostGIS, with extension versions tied to PostgreSQL versions. Validate the chosen major and allowlist/install the extension in deployment migrations. [Extension/version matrix](https://learn.microsoft.com/en-ca/azure/postgresql/extensions/concepts-extensions-versions).
- Flexible Server backups support a configurable 7–35-day restore window. Geo-redundant backup is a creation-time decision, and restore must be exercised rather than assumed instantaneous. [PostgreSQL backup/restore](https://learn.microsoft.com/en-au/azure/postgresql/backup-restore/concepts-backup-restore).
- Service Bus Standard/Premium provide topics, sessions, transactions and duplicate detection; Basic does not provide those features. Duplicate detection is based on MessageId within a configured window and does not replace application idempotency. [Tier comparison](https://azure.microsoft.com/en-us/pricing/details/service-bus/); [duplicate detection](https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection).
- Web PubSub is the generic WebSocket/pub-sub service; SignalR is the natural choice when the application already uses the SignalR programming model. Neither warrants rewriting a Node app into .NET. [Service choice FAQ](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/resource-faq).
- Web PubSub Free permits only 20 concurrent connections and 20,000 messages/day. Standard/Premium units support 1,000 concurrent connections per unit. The free tier is a development tool, not an unlimited live-driver service. [Web PubSub pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/).
- Web PubSub does not serve as persistent event history. Connection drops can lose in-flight messages; the reliable subprotocol assists reconnection but long outages still need application reconciliation. Premium enables zone redundancy and geo-replication. [Web PubSub reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-web-pubsub).
- Prefer Azure Managed Redis for any new managed Redis dependency. Legacy Azure Cache for Redis Basic/Standard/Premium retire 30 September 2028; the current What's New page supersedes older creation-block schedules for existing customers. [Retirement FAQ](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/retirement-faq); [current timeline](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-whats-new).
- Entra External ID basic includes the first 50,000 monthly active users at no cost, while SMS authentication is separately metered. Availability of a feature or free MAUs is not evidence of successful +970 OTP delivery. [External ID pricing](https://www.microsoft.com/en-us/security/pricing/microsoft-entra-external-id/); [billing model](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing).
- Azure recommends Entra-backed access and least privilege for Blob, limited user-delegation SAS tokens, and disabling anonymous read for private objects. [Blob security](https://learn.microsoft.com/en-us/azure/storage/blobs/security-recommendations).
- Key Vault stores secrets, certificates and keys. Managed identities let Azure workloads access resources without embedding cloud credentials; role assignments must remain narrowly scoped. [Key Vault security](https://learn.microsoft.com/en-us/azure/key-vault/general/security-features); [managed identity guidance](https://learn.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/managed-identity-best-practice-recommendations).
- Notification Hubs Free has 500 devices/one million pushes per subscription/month and no SLA; Basic/Standard are recommended for production use. It still needs APNs/FCM credentials and does not replace Apple/Google delivery infrastructure. [Notification Hubs FAQ](https://learn.microsoft.com/en-us/azure/notification-hubs/notification-hubs-push-notification-faq); [APNs/FCM setup](https://learn.microsoft.com/en-us/azure/notification-hubs/configure-notification-hub-portal-pns-settings).
- Static Web Apps Free is intended for hobby/personal use and has no SLA; Standard is the production tier. It is appropriate for a static admin/web export, not a drop-in host for an arbitrary long-running Node transport backend. [Static Web Apps pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/).
- OpenTelemetry/Application Insights sampling reduces diagnostic ingestion. A daily ingestion cap can create a monitoring gap and should be a backstop rather than the primary control. [Sampling guidance](https://learn.microsoft.com/en-us/azure/azure-monitor/app/sampling).
- Azure announced retirement of standalone Communication Services. Its retired list includes SMS, email, chat, rooms, direct routing, number management and Job Router. Beginning 23 October 2026 restrictions begin for retiring services; new customers without a preexisting ACS resource cannot acquire numbers for retiring PSTN/SMS workloads. Voice/video and Call Automation are in a separate breaking-change category, requiring supported Teams scenarios after September 2028. Do not describe all ACS functions as already shut down. [Live retirement guide](https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide).

### Inferences

**Recommended system shape**

```text
Expo rider / driver / merchant / operations clients
  -> authenticated HTTPS API (current Node backend evolved, stateless)
     -> PostgreSQL + PostGIS (source of truth)
     -> private Blob containers (proof, documents, exports)
     -> outbox worker (same codebase, separate process/container when needed)
        -> realtime adapter -> Web PubSub or initial self-hosted channel
        -> push adapter -> Expo/APNs/FCM or Notification Hubs
        -> telecom provider -> tested Palestinian OTP/voice
        -> local payment provider adapter -> settlement/reconciliation
        -> scheduled reconciliation, expiry, dispatch and support jobs
  <- snapshot + versioned events; reconnect always reconciles against API
```

**Keep:** existing business contracts, role logic, checkpoint-aware routing and tests that accurately express behavior. **Replace carefully:** deployment-specific persistence coupling, process-memory timers and in-memory ownership assumptions. Audit the actual app first; do not rebuild features already implemented.

| Capability/use case | Azure service / implementation | Stage and concrete responsibility |
|---|---|---|
| API for quotes, rides, parcels, freight, accounts | Container Apps Consumption, custom Node 24 image | Now for sandbox, paid production after approval. Health/readiness endpoints, graceful drain, resource ceilings, TLS, no persistent local state. |
| Alternate simplest fixed-price API host | App Service Linux/custom container | Valid alternative if its predictable bill and operations are preferable. Choose one API host, not both. Verify Node/sqlite compatibility; no dependence on its local filesystem for production DB. |
| Async work | Same Node worker on Container Apps; Jobs or Functions Flex for bounded independent jobs | Begin with one codebase. Worker persists leases/checkpoints. Do not split every domain into microservices. |
| Accounts, roles, orders, ride states, money, audit | PostgreSQL Flexible Server | Now migration work; dev Burstable for testing, production tier/HA selected by workload and recovery objectives. |
| Nearby drivers, service zones, checkpoint polygons | PostGIS GiST indexes; geospatial queries | Now. Use server-authorized coordinates, freshness and eligibility; roads/permits/restrictions remain application logic. |
| Current ephemeral presence / hot geo index / rate counters | PostgreSQL first; Azure Managed Redis on measured need | Later. Redis is disposable accelerator, not authoritative trip assignment or money. Cost of always-on cache can outweigh pilot benefit. |
| Durable event processing | PostgreSQL transactional outbox/inbox; Service Bus Standard when distributing workers | Outbox now, broker when needed. One domain transaction commits state+outbox; publish after commit, dedupe on event ID, DLQ and replay tooling. |
| Live location, offers, trip changes and support chat events | Web PubSub adapter; self-hosted authenticated WebSocket/SSE can be initial alternative | Pilot validate cost and device compatibility. Short-lived scoped tokens; server assigns groups. No client permission to broadcast authoritative state. Chat history stays in DB. |
| Native notifications | Expo push adapter initially if SDK supports required integration; APNs/FCM or Notification Hubs if justified | Now. Persist notifications/outbox, handle token rotation and receipts. Push is a wake-up hint, not assignment lock or delivery proof. |
| Customer sign-in and sessions | Evaluate Entra External ID or keep hardened existing auth with external OTP | Now design decision. Consumer tenant and app roles differ from Azure staff RBAC. Do not force phone-login parity if provider flow lacks required UX/coverage. |
| Staff/admin identity | Entra workforce SSO + MFA, application RBAC and audited privileged actions | Before production. Least privilege for support, finance, dispatcher, safety and superadmin. |
| Private ID/vehicle docs, delivery proof, invoices | Blob Storage containers by purpose | Now. Short upload SAS, server validates type/size/checksum, quarantine/scan, signed access, retention/deletion rules, no public KYC images. |
| Storage malware scanning | Defender for Storage or separate validated scanner | Before accepting arbitrary files. Budget per scanned GB; do not silently enable expensive subscription-wide plans. |
| Provider keys, signing secrets, DB credential fallback | Key Vault + per-role managed identity | Now. Secret rotation and cache, access audit; client `EXPO_PUBLIC_*` values must contain no secrets. |
| Route/geocode/map tiles/traffic | Azure Maps via replaceable geo adapter, only after Palestine benchmark | Evaluate now; never select only because credit is available. Routing restrictions and provider terms must be tested. |
| Logs, traces, metrics and alerting | Azure Monitor / Application Insights via OpenTelemetry | Now. No raw phone/token/KYC/precise location in logs. Correlation IDs, sampled traces, money/security audit separately durable. |
| Web/admin/merchant frontend export | Static Web Apps Standard or existing chosen hosting | Later if export/static route compatibility confirmed. Backend authorization remains mandatory; static hosting auth is insufficient by itself. |
| Build artifacts/images | Azure Container Registry or permitted external registry | Now. Pin digest, vulnerability scan and SBOM; registry storage and egress are separate costs. |
| CI delivery | GitHub Actions or Azure DevOps; OIDC federation into Azure | Now. Build/test/artifact only by default; protected environment approval for outward deployment. Avoid long-lived publish credentials. |
| DNS/TLS/public edge | Azure DNS; native host TLS; Front Door/WAF if threat/availability requirements warrant | DNS/TLS before launch. Add edge after cost/threat analysis; do not spend student credit on an enterprise edge by default. |
| Network isolation | VNet integration/private database paths/private DNS, smallest necessary egress | Production plan. Price NAT, private endpoints and environment fees explicitly; private endpoint everywhere is not a free security switch. |
| Operational reporting | PostgreSQL reporting views/materialized aggregates + Blob export | Now. Restricted analyst role, deidentified data; don't add a data lake for a small pilot. |
| High-volume event stream / archive | Event Hubs + Blob/ADLS with retention and partition strategy | Later when telemetry throughput or analytics demands it; do not send every GPS ping through a premium streaming stack initially. |
| Enterprise analytics / ML | Azure ML, Fabric/Synapse/Databricks, dedicated analytics store | Later only with a quantified use case and data volume. No requirement for launch quality. |
| Arabic support assistance / issue triage | Foundry model through bounded server tool layer | Later. Human escalation; read-only by default; cannot invent refunds, dispatch, fares or emergency instructions. |
| Document extraction / identity review assistance | Document Intelligence OCR + human checks | Later after vendor/format validation. OCR is not identity proof, driver licensing verification or biometric consent. |
| Translation / speech accessibility | Azure Translator/Speech where local dialect quality is validated | Later/optional. Cost, retention and network fallback; authored Arabic/English policy text remains canonical. |
| Abuse detection | Rules/aggregates first; ML later when labeled data and appeal process exist | Now deterministic checks; optional Azure ML later. No demographic penalty or opaque automatic safety rejection. |
| Disaster recovery | PostgreSQL PITR + tested restore, Blob redundancy/versioning/lifecycle, IaC, offsite backups when warranted | Before production. Backup is not live HA; define RPO/RTO and restore runbook with measured exercises. |
| Governance/cost control | Resource groups/tags/Policy/budgets/Service Health/RBAC | Now. Deny unapproved expensive SKUs in sandbox, replica caps, provider spend limits, forecast/actual alerts. |
| Kubernetes/service mesh | AKS | Avoid initially. Adds operational surface without evidence the modular monolith needs it. |
| Alternative primary DB / duplicate identity stack | Cosmos DB, Azure SQL, multiple auth systems | Avoid without specific reason. Do not replace relational money/geospatial work merely to collect free products. |
| Standalone telephony/email/chat/dispatch product | ACS SMS/Email/Chat/Job Router | Avoid new dependency due retirement/onboarding restrictions and Palestine coverage uncertainty. Build adapters and choose appropriate external providers. |

**SQLite → PostgreSQL migration, safe sequence**

1. Inventory schemas, migrations, PRAGMA-dependent behavior, integer-money fields, date units, generated identifiers, JSON, indexes and SQL dialect assumptions. Identify server calls that rely on SQLite's synchronous API or one-process serialization.
2. Introduce a repository boundary and async transaction context while preserving existing API shapes. Tests run against both backends until parity is proven; do not silently cast money to floating point.
3. PostgreSQL migrations define foreign keys, status/version constraints, unique idempotency/provider-event keys, partial uniqueness for active assignment, and immutable accounting records. PostGIS types use a documented coordinate order/SRID.
4. Replace serial-process assumptions with row locks or compare-and-swap, e.g. claim an offer only when status/version/lease expiry still match; driver busy reservation and trip assignment commit in the same transaction. Side effects use outbox after commit.
5. Add connection pooling and per-replica limits. Never multiply replicas beyond the DB's connection or transaction capacity. Handle retryable serialization/deadlock errors with bounded retries and stable idempotency keys.
6. Dry-run export a consistent SQLite snapshot, transform/import, validate row counts/key coverage, monetary totals, sums of open cash obligations, cancellation history, active task uniqueness and representative API outputs. Avoid attempting to replicate by copying a live WAL database file casually.
7. Rehearse a short write freeze, final export/import, post-import reconciliation and API cutover against staging. Define rollback's data boundary: simply repointing to the old SQLite file after new PostgreSQL writes would lose data. Use a tested reverse reconciliation or keep writes closed until acceptance.
8. Enable horizontal scaling only after shared persistence, distributed locks/leases and outbox processing are proven. Container local disk cannot be the authoritative SQLite location.

**Why not microservices now?** As a recommended design, money, trip and assignment invariants are easier to transact and audit in one relational service. Separate API/worker execution without splitting ownership across dozens of databases. Extract a service only when operational load, team ownership or fault isolation justifies its new consistency boundary.

### Gaps

- Exact Node backend file-level migration targets are supplied by the independent app audit, not invented in this Azure note.
- No tenant-specific SKU availability, private-network design, Azure price agreement or capacity limit was checked. The hosting choice remains an implementation recommendation that requires a bounded deployment trial.
- React Native SDK support for managed realtime/push/auth adapters must be tested on this app's exact Expo SDK and development builds. A JavaScript SDK's existence does not prove background mobile support.

## 3. What changes because the business launches in Palestine?

### Takeaway

Treat West Bank and Gaza as separately configured operations and validate each service city in the field. Hosting location does not solve address quality, checkpoint uncertainty, licensing, telecom reachability or local payment settlement.

### Cited Findings

- Azure's current official region list includes Israel Central, Qatar Central and UAE North, plus European alternatives; it does not list a Palestine region. Region presence and availability zones do not guarantee all services/SKUs are available in that region. [Region list](https://learn.microsoft.com/en-us/azure/reliability/regions-list).
- The opened Azure Maps routing, geocoding and traffic coverage pages did not contain an explicit Palestine/West Bank/Gaza entry. This is evidence of **unconfirmed published coverage**, not proof that every coordinate/API request fails. Test the exact APIs and providers instead of asserting support or non-support from a map screenshot. [Routing coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage); [geocoding coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geocoding-coverage); [traffic coverage](https://learn.microsoft.com/en-us/azure/azure-maps/traffic-coverage).
- Azure Communication SMS capabilities depend on the sender, destination and subscription billing country. Its own native sender table does not establish +970 availability; the new retirement restrictions make it an especially poor assumption for a new standalone app. [SMS concepts](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/concepts); [retirement guide](https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide).
- Twilio publishes Palestine-specific rules: two-way SMS is unsupported; alphanumeric sender handling differs from numerical sender handling. Its geo-permission update explicitly recognizes Palestinian networks using +97256 and +97259 as well as +970. These are provider-specific statements, not a guarantee of delivery for this merchant. [Palestine SMS guidance](https://www.twilio.com/en-us/guidelines/ps/sms); [prefix update](https://www.twilio.com/en-us/changelog/programmable-sms-geo-permissions-israel-and-palestine-prefix-update).
- Stripe's merchant-support country list does not include Palestine. Customer card acceptance from many countries is different from a Palestine-registered business being eligible for a Stripe merchant/Connect account. [Stripe global availability](https://stripe.com/global).
- Bank of Palestine advertises an online payment gateway for eligible merchants, including supported local/international cards, custom integrations and reporting. Its public page does not establish marketplace split payouts, preauthorization support, mobile SDK support, refund API semantics or approval for this specific business. [Bank of Palestine gateway](https://web.bankofpalestine.com/business/electronic-services/digital-payments/payment-gateway).
- A separate Bank of Palestine page lists 2.5% commission, settlement on the second working day and account/agreement requirements, but treat this as indicative published information to reconfirm against a dated merchant quote; do not turn it into a guaranteed signed price. [Bank of Palestine older gateway page](https://www.bop.ps/index.php/en/business/electronic-services/payment-gateway).
- The Palestine Monetary Authority documents licensed e-payment companies and local wallet activity. That establishes a local provider ecosystem, not that any named wallet has a public marketplace API or will onboard this app. [PMA annual report, payment-services section](https://www.pma.ps/Portals/0/Users/002/02/2/Publications/English/Annual%20Reports/PMA%20Annual%20Reports/Annual%20Report%202023.pdf).

### Inferences

**Region selection:** shortlist West Europe/North Europe and, if commercially/legal/operationally acceptable, UAE North/Qatar Central/Israel Central. Do not pick a region from geographical proximity alone. Measure TLS/API/WebSocket p50/p95 latency, packet loss and reconnect success from Jawwal/Ooredoo/Wi-Fi in intended cities at peak/off-peak times. Compare availability of PostgreSQL/PostGIS, Container Apps and realtime, prices, student permissions, backup geography and operational access. Keep DB/API/realtime colocated unless a measured reason overrides it. The owner's choice of jurisdiction/data location is required before sensitive production data moves across borders.

**Recommended Palestine launch behavior and configuration:**

- `marketId`, `serviceAreaId`, permitted vehicle/service types, currency, service hours, closure flags, emergency/support procedures and operational staff are versioned configuration. Separate West Bank and Gaza; an accepted order must never imply unrestricted transit between disconnected zones.
- Begin in one bounded city/zone with a published fallback dispatch process, then extend the same engine across approved areas. The report covers all requested domains, but simultaneous nationwide rollout is not an implementation acceptance criterion.
- Retain the existing checkpoint-aware approach. Add server-side road exclusions, closure provenance, expiry and confidence, with manual overrides and audit. Routing providers' paths do not prove that a driver may legally or practically use that road; never promise checkpoint-free/permit-free passage.
- Keep a tested corpus of at least 100 representative origin/destination pairs per initial service area: dense addresses, villages, landmarks, Arabic spelling variants, bilingual names, service boundaries, road closures, unreachable destinations and freight restrictions. Compare map rendering, autocomplete, geocode ranking, pickup accuracy, legal routes, ETA interval and cost. The count is an initial proposed test target, not a vendor requirement.
- Address record: map coordinates, user-confirmed entrance/pickup pin, confidence, district/city, locality, street if available, landmark, floor/unit, recipient instructions, contact method, original input language, provider and provider-place ID. Preserve original entered text; normalize Arabic for search without overwriting the user-visible address. Avoid equating provider country labels with the app's service eligibility.
- Provider interface: `autocomplete`, `geocode`, `reverseGeocode`, `route`, `matrix`, `validateServiceability`; include timeout, provider/request ID, units, attributed data, confidence and error taxonomy. Evaluate SDK/tiles licensing and permitted storage before caching or mixing providers. Azure compute can host an API using a non-Azure map provider when it wins the local benchmark.
- Estimate arrival as a range when closure/checkpoint uncertainty is high; persist quote-time assumptions. Stop routing new work into an operational closure, and reassess active trips through a dispatcher rather than silently forcing cancellation.
- Phone numbers: preserve original input plus validated canonical number, country/routing metadata and verification state. Recognize supported +970 and Palestinian-network +972 formats; do not blindly rewrite all +972 numbers or infer nationality from the prefix. Test opt-in OTP delivery on both major local carriers, resend ceilings, carrier filtering, roaming and delayed messages.
- OTP provider abstraction with delivery receipts, per-device/phone/IP throttles, abuse budget and fallback. Recovery/support must not bypass identity assurance; a screenshot of an SMS is not verification. In-app support/chat is useful where phone masking cannot be provisioned.
- Accept cash with a strong ledger if digital merchant access is pending. Collecting cash does not eliminate cash obligations: distinguish passenger fare, goods COD, courier receivable, merchant payable, platform commission, refund and settlement discrepancy. Define the party holding funds and each remittance deadline; alert on driver cash exposure.
- PSP onboarding packet: registered entity, beneficial owners, bank/IBAN, permitted transport/delivery categories, service areas, currencies, refund policy, KYC/AML duties, cardholder data flow, PCI scope, hosted checkout/3DS deep-link return, capture/refund/void, webhooks signature, settlement files, chargebacks, courier payout mechanics and fees. Ask for documented capabilities/sandbox; keep provider integration behind an adapter until approved.
- A card gateway is not necessarily a marketplace platform. If split payouts/preauthorization are unavailable, design a lawful merchant-of-record and periodic bank-settlement arrangement with the bank; do not implement an unlicensed customer wallet or escrow merely by adding a balance table.
- Persist time as UTC; use `Asia/Hebron` for local schedules and notifications; use decimal-free minor units with an explicit currency code. Do not assume every local transaction uses the same currency or fixed exchange rate. Cash change, rounding and foreign-currency acceptance need a published policy.
- Offline reliability: persisted mobile action queue, sequence numbers, idempotency keys, acknowledged server versions and conflict handling. Driver location timestamps and stale-presence rules remain explicit; no new automated assignment to an offline driver solely because the last pin looks close.
- Permissions and operations: local counsel/competent authorities must confirm passenger transport licensing, commercial vehicle/driver eligibility, insurance, parcel restrictions, worker/fleet terms, payment and privacy duties before paid service. This report does not invent a specific Palestinian legal regime from foreign Uber pages.

### Gaps

- No public source here proves Azure Maps live route/traffic quality for the intended Palestinian areas; a field benchmark and provider confirmation are required.
- No PSP contract, fees, refund/payout support or telecom sender approval was obtained. No external provider was contacted. Current merchant eligibility cannot be inferred from regional marketing alone.
- City, initial fleet size, merchant types and business legal entity remain unspecified. Cover all domains architecturally while keeping rollout gates per service and area.

## 4. What will hosting cost, and can the subscription support profitable operation?

### Takeaway

Use exact metered formulas and current regional quotes; do not advertise a permanently free Uber-scale platform. Student credit can materially help a small educational sandbox. Revenue quality depends on contribution margin, reliability, support and cash discipline, not the cloud vendor alone.

### Cited Findings

- Microsoft exposes retail prices through a public API; the saved evidence files contain the exact queried filter URLs and returned meter records. Rates below are public USD PAYG West Europe records retrieved on 26 October 2026, not an Azure invoice, student entitlement or contractual quote. [Azure Retail Prices API](https://prices.azure.com/api/retail/prices); [API documentation](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices).
- Observed Container Apps Standard meters: active vCPU USD 0.000034/vCPU-second; active memory USD 0.000004/GiB-second; idle vCPU USD 0.000004/vCPU-second; idle memory USD 0.000004/GiB-second; requests USD 0.56/million beyond allowances. The regional pricing page renders dynamic placeholders in this environment; use saved API evidence rather than memorized US prices. [Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/); raw records `azure_retail_prices_extra.json`, group `aca`.
- Observed PostgreSQL Flexible Server BS-series B1MS compute USD 0.0199/hour; B2S USD 0.0796/hour; standard provisioned storage USD 0.1369/GB-month. These are development-oriented Burstable examples, not a recommended HA production configuration. [PostgreSQL pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/); raw records in `azure_retail_prices.json` and `azure_retail_prices_extra.json`.
- Observed Web PubSub West Europe Standard unit USD 1.61/day, Premium USD 2.00/day; additional message meter USD 1/million where applicable. Observed Service Bus Standard base approximately USD 10/month, with tiered operation/connection charges. Account for free grants, operations, tier minimums and actual meter definitions rather than adding every tier rate simultaneously. [Web PubSub pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/); [Service Bus pricing](https://azure.microsoft.com/en-us/pricing/details/service-bus/); saved retail records.
- Cost Management budgets alert on thresholds; they do not stop resource consumption or make a hard spending cap. [Budget tutorial](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets).
- Free PostgreSQL benefits have historically been 750 hours of B1MS plus 32 GB data/backup storage for the first 12 months of eligible free accounts, but the formerly dedicated free-account how-to now redirects to a generic create-server quickstart. Treat applicability to this student subscription as unverified until its Free Services pane confirms it. [Microsoft PostgreSQL team free-trial description](https://techcommunity.microsoft.com/blog/adforpostgresql/what%E2%80%99s-new-with-postgres-at-microsoft-2024-edition/4140085); [current redirect destination](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-deploy-on-azure-free-account).

### Inferences

**Cost formula** (recommended budget model):

```text
C_month = C_API_compute + C_worker_compute + C_HTTP_requests
        + C_DB_compute + C_DB_storage + C_DB_backup + C_DB_HA
        + C_realtime_units + C_realtime_outbound_messages
        + C_blob_GB + C_blob_operations + C_blob_egress + C_file_scanning
        + C_queue_base + C_queue_operations
        + C_maps_by_meter + C_geocode + C_route_matrix
        + C_OTP + C_voice + C_email + C_push
        + C_logs_ingestion + C_logs_retention + C_alerts
        + C_registry + C_DNS + C_edge/WAF + C_private_networking + C_egress
        + C_AI + C_support_plan + taxes
```

**Concrete arithmetic examples using the observed West Europe rates.** Assume a 730-hour month; no student/free DB entitlement assumed; Container Apps free grant applied once per subscription, and active rates throughout for the stated scenario. These are compute illustrations, not total bills:

| Scenario | Calculation | Approximate USD/month |
|---|---|---:|
| One API replica, 0.25 vCPU / 0.5 GiB, active all month | `(657000-180000)*0.000034 + (1314000-360000)*0.000004` | 20.03 |
| Two API replicas each 0.25 vCPU / 0.5 GiB, active all month | `(1314000-180000)*0.000034 + (2628000-360000)*0.000004` | 47.63 |
| One B1MS dev database + 32 GB data | `730*0.0199 + 32*0.1369` | 18.91 |
| One B2S database + 64 GB data | `730*0.0796 + 64*0.1369` | 66.87 |
| One Standard Web PubSub unit, 30-day month | `30*1.61` | 48.30 |
| One Premium Web PubSub unit, 30-day month | `30*2.00` | 60.00 |
| Service Bus Standard base | API includes both hourly/monthly equivalent meters; use one billing basis | about 10.00 |

CPU/memory rounding, multiple revisions, free grant sharing, idle periods, other services and account agreements change the final bill. The raw rates include additional Container Apps environment/private endpoint/maintenance meters; do not assume these optional features are free or sum overlapping meters without checking the applicable design.

**Three realistic planning profiles, assumptions not quotes:**

1. **Educational sandbox:** scale API to zero, local database while implementing, short-lived managed DB rehearsals or verified DB free entitlement, free realtime for a few testers, tiny private Blob storage and sampled logs. A planning envelope of USD 0–25/month is plausible only under light use and correct allowances. USD 100 lasts 4 months at USD 25/month; at USD 8.33/month it lasts about a year. These are arithmetic scenarios, not a promise.
2. **Limited paid city pilot:** one warm API replica plus a worker, B1MS/B2S DB only if load testing and operational risk justify it, native push, TLS, backups and monitored support. The illustrated one-replica+B1MS floor is about USD 38.94/month before telecom/maps/realtime/blob/logs. Adding Standard Web PubSub and Service Bus makes that illustrated subtotal about USD 97.24/month. Plan an initial USD 100–250/month infrastructure/provider allowance, then revise from real traffic. This is a provisional budget envelope, not HA or an Azure quote. If cash transport operations cannot tolerate single-node maintenance/outage, skip this reduced-resilience profile.
3. **Resilient commercial city service:** at least two API replicas, a durable worker, appropriate General Purpose zone-redundant PostgreSQL, paid realtime tier matching recovery goals, private data access, tested backups, alerting and incident coverage. Carry a provisional USD 300–1,000+/month baseline until sizing/region/vendor quotes replace it. This range is explicitly a budgeting assumption; it excludes staff, vehicle operations, insurance, payment fees and marketing, and may be exceeded by large traffic, observability or network choices. Obtain a full Azure calculator export before deployment.

**Load-to-cost sizing variables (Claude must expose a spreadsheet/config calculation, not hardcode guesses):**

- `D` simultaneously online drivers; `a` online hours/day; `f` GPS seconds/update; `B` payload bytes; `r` recipient fanout; `T` completed jobs/day; `Q` quotes/completed job; `K` road-matrix candidates/quote; `O` OTP attempts/day; `L` retained logs bytes/request; `S` proof image bytes/job; `R` retention days.
- GPS messages/day approximately `D*a*3600/f`; delivered realtime messages also depend on fanout and provider billable message chunking. At 100 drivers, 8 hours/day and 5 seconds/update that is 576,000 driver updates/day before fanout. Do not broadcast to every customer; group by authorized active job and nearby discovery bounds.
- Batch/compact mobile uploads within freshness requirements; drop redundant stationary pings; persist last location and selectively sampled trace points. Do not recompute paid routes on every GPS ping.
- Quotes/day approximately `T*Q`; road-matrix elements/day approximately `T*Q*K`. Matrix products can dominate cost if all drivers are compared blindly. Filter with PostGIS first, then road-route a small eligible candidate set.
- Proof storage approximate `T*S*R` bytes before redundancy, versions and exports. Apply upload compression, explicit retention and deletion jobs according to business/legal policy.
- Logs/day approximate `requests/day*L*sample_rate`; store business audit/ledger separately from sampled diagnostics. Track map/OTP spend per completed job and per failed conversion.

**Revenue model, illustrative only:**

```text
contribution_per_completed_job = customer_paid_amount
  - driver_or_courier_earnings - merchant_goods_payable
  - PSP_and_payout_fees - OTP/maps/realtime_variable_cost
  - promo_subsidy - expected_refund/fraud/cash_loss
  - variable_support_and_insurance_cost

monthly_operating_contribution = completed_jobs*contribution_per_job
  - fixed_cloud - payroll - licensing - insurance - other_fixed_operations
```

- For marketplace accounting, goods COD and driver/merchant money are liabilities, not platform revenue. Record commission and recognized service fees separately. A high gross booking value does not prove profit.
- Break-even jobs/month = fixed monthly operating costs / positive contribution per job. If contribution is negative, increasing trip count increases loss. Use the actual PSP fee currency and local settlements; never insert an invented fixed platform commission as an Uber fact.
- Student-credit depletion or phone-OTP abuse can stop customer access. Production must have funded billing, provider spending limits, cash buffer and a written degraded-mode procedure.

**Cost controls:** maximum replicas, bounded concurrency, DB connection pool caps, storage lifecycle, maps per-user and global rate limits, OTP spend cap/fraud lockout, no GPU/provisioned AI, sampling/daily ingestion backstop, no accidental premium networking, environment tags, and forecast/actual alerts at 25/50/75/90 percent of the chosen budget. For production, a budget alarm must trigger triage and controlled degradation; never automatically shut down the database while a passenger is mid-trip merely to save credit.

### Gaps

- Exact total cannot be known without traffic, SLAs, chosen region, service SKUs, PSP/SMS quotes and subscription entitlements. No fixed monthly total is represented as a quote.
- The broad Maps API query returned only its first 1,000 meter records and a next-page link. Do not use that incomplete response to declare a complete Maps price inventory. A specific chosen API/region/meter must be queried and priced after local coverage validation.
- Retail API records are not proof of student quota or free allowance eligibility. The writer should cite the current official pricing page alongside saved observations and retain their date.

## 5. What exactly should Claude implement for Azure readiness and production quality?

### Takeaway

Implement the hosting boundary, persistence migration, reliability and provider contracts as separate reviewable milestones. Deploy only after passing correctness and recovery gates; Azure's service SLA cannot make an app's own transactions correct.

### Cited Findings

- Azure reliability is shared responsibility, and reconnect/failover still requires client and application behavior. [Web PubSub reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-web-pubsub).
- Front Door Premium includes additional WAF/private-link/bot security capabilities; these are paid architecture choices, not an automatic requirement to consume student credit. [Front Door pricing](https://azure.microsoft.com/en-us/pricing/details/frontdoor/).
- Foundry Models sold by Azure have data protections against training on customer data without permission, but deployment type changes processing geography, and features/abuse monitoring may retain or review data. A regional resource alone does not make every Global/DataZone inference stay in that region. [Foundry privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy).

### Inferences

**Infrastructure as code deliverables, recommended proposed paths** (new files; adapt to repo conventions):

```text
infra/main.bicep
infra/parameters/dev.bicepparam
infra/parameters/staging.bicepparam
infra/parameters/prod.bicepparam
infra/modules/identity.bicep
infra/modules/network.bicep
infra/modules/database.bicep
infra/modules/storage.bicep
infra/modules/key-vault.bicep
infra/modules/container-environment.bicep
infra/modules/api.bicep
infra/modules/worker.bicep
infra/modules/realtime.bicep
infra/modules/observability.bicep
infra/modules/budgets-policy.bicep
infra/modules/queue.bicep                 # optional deployment flag
docs/operations/deploy.md
docs/operations/restore.md
docs/operations/incident-and-degraded-mode.md
docs/operations/provider-failures.md
docs/operations/cost-model.md
```

Each parameter set specifies region, subscription/environment names, resource sizes, replicas, nonsecret origins/URLs, retention, allowed network paths and feature flags. Secrets are references/managed identity access, never literal values in repo. Separate dev/staging/prod access and data. Avoid putting personal information in tags or resource names.

**CI/CD sequence:**

1. Read repo instructions; build pinned runtime/package dependencies; lint, typecheck, unit/integration, security and API contract tests.
2. Run PostgreSQL/PostGIS integration tests on an isolated ephemeral test database; no production data. Verify money and assignment races under parallel requests.
3. Build one API/worker image, scan and pin digest. Store build manifest and migration version.
4. Validate Bicep and generate `what-if` output. Cost diff lists every new paid SKU and resource size. No automatic billing/permission broadening.
5. Deploy staging only through the user's authorized workflow. Run additive migrations, health checks, seed synthetic fixtures and smoke ride/parcel/freight flows.
6. Require production environment approval, a restore point and migration compatibility assessment. Use expand/contract schema changes. Run migrations once under a lock before traffic shift; multiple replicas must not each execute destructive migrations.
7. Shift traffic gradually where supported, monitor API error/latency, matching success, queue lag, duplicate payments, stale locations and reconciliation. Roll back application image if thresholds fail; schema rollback must be explicitly compatible.
8. Store deployment evidence, test results, subscription/region/SKU cost snapshot, runbook owner and rollback decision. Never treat a green pipeline as authority to publish externally without standing user approval.

**Server readiness contract:**

- `/health/live`: process can respond; no secrets; no expensive dependencies. `/health/ready`: essential DB/migrations usable; does not allow random external provider outage to thrash the container continuously.
- Graceful termination: stop new claims, finish bounded in-flight transactions, release/expire worker leases, preserve outbox/inbox state and reconnect clients to snapshots. Persist dispatch timers/deadlines in DB, not only in `setTimeout` memory.
- Correlation: request ID, trace ID, account/role pseudonymous IDs, trip/order ID, idempotency key hash, event ID, state version and provider request ID. Sensitive coordinates and phone data excluded from diagnostics by default.
- Authorization: server validates resource ownership/participant role on every API/WebSocket subscription/download. Support staff cannot query arbitrary journeys without purpose/audit. Managed identities scope infrastructure access separately.
- Retry policy: capped exponential backoff with jitter for retryable network/transient failures; stable idempotency keys; circuit breakers/timeouts; no blind retries of money movement without provider idempotency/query semantics.
- Provider availability fallback: maps timeout -> known quote eligibility/degraded estimate/manual dispatch; realtime outage -> polling snapshots; push outage -> foreground refresh; payment unknown -> pending+reconcile, never collect twice; SMS outage -> approved recovery; DB unavailable -> reject new mutations safely rather than invent local success.
- Retention jobs: location traces, documents, evidence, support chat and financial records have distinct retention/hold rules. Deletion request can anonymize profile while preserving legally required accounting/incident evidence under restricted access; do not promise immediate deletion of all records.

**Launch gates and acceptance tests (proposed, must be tailored):**

| Gate | Evidence required before marking complete |
|---|---|
| Persistence parity | All current server integration tests pass against Postgres; import reconciliation proves counts and money totals; Unicode Arabic, timezone and currency cases round-trip. |
| Atomic dispatch | Hundreds of concurrent accept/claim requests result in one winner, no driver double-booking and deterministic loser errors. Lease expiry/retry and duplicate delivery preserve invariants. |
| State correctness | Duplicate/stale/out-of-order client actions, cancellation during assignment, rider/driver reconnect and delayed completion are reconciled by authoritative state/version. |
| Money correctness | Duplicate PSP webhook, timeout-after-capture, refund retry, cash shortfall, partial remittance and chargeback cannot create/remove value accidentally. Ledger debits=credits per currency. |
| Realtime security | A nonparticipant cannot subscribe to another trip/driver's location; expired group tokens fail; revoked/suspended users lose access; reconnect pulls missed durable state. |
| Mobile network | Physical iOS/Android devices under weak coverage, airplane mode, background/foreground, OS termination and battery-saving behavior preserve pending actions and show location freshness accurately. |
| Local maps | Field-tested origin/destination corpus, manually adjudicated checkpoint/road restrictions, Arabic place search and inaccessible area handling; ETA confidence and service boundaries documented. |
| Telecom | Real Jawwal/Ooredoo +970 and applicable Palestinian-network +972 delivery tests; resend/abuse caps, delayed OTP and fallback/recovery audited. |
| Privacy/security | Threat model and permission tests; no secrets in bundle/logs; ID/proof objects private; staff scopes/MFA; upload validation; retention and incident access review. |
| Recovery | Restore backup into a new isolated server and reconcile business records; simulate API/worker restart, queue duplicate/DLQ replay, provider outage and region unavailability. Measure RPO/RTO. |
| Performance | Locally measured cold/warm API, DB query and matching latency under agreed pilot load and growth test; observe queue lag and connection limits. Never infer capacity from replica count alone. |
| Financial operations | Signed merchant/payout/provider arrangements, cash ledger and exception queue, settlement reconciliation, support/refund authority and business continuity funds. |
| Observability | Alerts for failed assignment, stale active-trip GPS, payment mismatch, cash exposure, queue backlog, error rate, DB saturation, restore failures and spend anomalies reach designated operations staff. |

Initial service goals to negotiate, not vendor guarantees: warm read/mutation API p95 below 500 ms excluding separately measured external work; foreground trip update p95 below 2 seconds on a healthy network; no duplicated assignment or money posting; active driver position marked stale according to context; DB recovery point and time chosen from actual customer/business loss tolerance. Recovery objectives must be achievable with the selected single-node/HA/backup design and tested, not merely typed in a document.

**AI use boundaries:** useful optional tasks are Arabic/English support summarization, support category suggestions, OCR data entry assistance, driver demand forecasts after enough data, and anomaly explanations. Deterministic code and audited rules own eligibility, dispatch state, fare calculation, ledger posting, refunds and safety escalation. A model cannot certify identity, decide road safety from hallucinated knowledge, or promise emergency response. Strip unnecessary PII, validate tool inputs/outputs, separate retrieval from privileged execution, cap tokens/spend and evaluate dialect accuracy before rollout.

### Gaps

- User authorization covers research and plan, not deployment, paid conversion, provider contact, bank signup or sending messages. The deliverable should make those future decisions concrete and reviewable.
- Legal, payment and emergency operating policies need the actual business entity and operating city; automation cannot replace them. Keep unresolved launch prerequisites explicit while making all independent engineering work executable.

## 6. Evidence ledger and remaining verification

### Takeaway

The implementation can proceed with local code and infrastructure definitions now. Production blockers are specific: commercial subscription terms/funding, local licensing/insurance, verified telecom/map/payment capability, migration/recovery correctness and measured mobile behavior.

### Cited Findings

- `azure_retail_prices.json` contains the first targeted PostgreSQL storage and Service Bus results, and empty first attempts for incorrect/missing service filters. `azure_retail_prices_extra.json` contains corrected PostgreSQL compute/Web PubSub and Container Apps records plus a deliberately incomplete broad Maps first page. Both record exact public API URLs and no account secrets. [Azure retail API](https://prices.azure.com/api/retail/prices).
- Live ACS guide wording is more nuanced than its cached search excerpt. Use the opened current wording: restrictions begin for retiring services and new-customer number acquisition; do not extrapolate it to all nonretiring Teams-related capabilities. [ACS guide](https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide).

### Inferences

- No code defect is claimed fixed by this research note. The main app audit owns any lint/typecheck remediation and verification. No commit, push, deployment, purchase or deletion was performed for this Azure research.
- Final handoff should have a service decision register: choice, reason, alternatives, region/SKU, data held, secret owner, cost meter, failure fallback, restore path, legal/provider prerequisite, test evidence and revisit trigger. That is more useful than turning on every Azure service.
- For scope clarity, “all covered” means the plan covers passenger rides, parcel/last-mile delivery and freight plus the supporting platform; it does not certify an exhaustive recreation of hidden Uber internals or authorize copying proprietary assets.

### Gaps

- Remaining owner-only inputs: subscription offer/balance/permissions; commercial entity and launch city; bank/PSP/telecom accounts and approvals; vehicle/driver operating authorization; business budget, staff coverage, chosen data geography and recovery objectives. These are launch readiness facts, not reasons to stop independent implementation planning.
