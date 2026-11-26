# Fastship — production upgrade handoff for Claude Fable 5.2

**Audience:** Claude Fable 5.2, acting as implementation lead  
**Repository:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`  
**Source baseline:** repository state audited 10 November 2026  
**Purpose:** turn the substantial existing Fastship codebase into a trustworthy, Palestinian-market production service without a rewrite  
**Status of this document:** implementation handoff, not a claim that the acceptance evidence already exists

---

## 1. Mission and reality check

Fable: make Fastship a production-quality delivery and transport platform for Palestinian customers, drivers, merchants, recipients, dispatchers, and support staff. Preserve what works, finish the workflows end to end, and prove them in the real deployment and on physical devices. Optimize first for correct orders, recoverable live operations, lawful road routes, Palestinian place discovery, Arabic usability, cash reconciliation, and supportability. Do not optimize first for visual resemblance to Uber, a large cloud bill, or a long feature list.

The honest starting point is mixed:

- This is **not a throwaway demo or empty scaffold**. The fresh source inventory found 178 HTTP routes, 96 application screens, 37 registered background tasks, and 46 PostgreSQL migration blocks. Customer booking, driver work, administration, cash/payment ledgers, subscriptions, referrals, scheduled work, chat, notifications, ratings, and public tracking all have substantial source implementations.
- The owner's description of the experience as a “demo” is nevertheless valid in the places that determine trust. The booking composer can clear a just-created draft, payment capture can bypass its settlement gate before a live PSP is configured, push has important delivery and token-rotation gaps, and some coordination is process-local. PostgreSQL, SMS, push, Web PubSub, private-object storage, payments, and automatic dispatch each have distinct activation gates.
- Palestinian addressing and road quality are not solved by adding a map SDK. Search still relies on a small local gazetteer, OSRM consumes a moving `latest` geographic extract, route legality is not proven, raw durable GPS history and calibrated ETA are absent, and reconnect/offline recovery needs an end-to-end contract.
- There is no fresh evidence in this audit that the complete service is running correctly in production, that live providers work, or that the physical-device journeys pass. Treat old green tests, screenshots, benchmark numbers, and device reports as dated background only.

**Definition of success:** a customer in the agreed pilot area can find a real destination, receive an explainable legal route and price, book once, recover after interruption, reach an eligible driver, follow a resilient trip, complete the selected payment/COD flow, and obtain a receipt and support. A driver can complete the same journey in Arabic or English on an ordinary Android phone under poor connectivity. Operations can see exceptions, intervene safely, reconcile money, and restore service after failure. Every claim is backed by reproducible evidence.

---

## 2. How to operate

### 2.1 Model and execution settings

Explicitly select **high effort** in the harness for planning, cross-cutting implementation, and review. Do not assume that writing “use high effort” in a prompt changes the setting. Keep ordinary focused edits at the normal setting where that is sufficient.

Do not switch to `xhigh` by default. Evaluate it on Fastship tasks first and adopt it only where measured gains justify its latency and cost. Do not infer that maximum effort compensates for unclear ownership, missing provider decisions, or absent runtime access.

The identity and effort guidance here comes from the official Anthropic material collected in `research_notes/Fable 5.2 production upgrade handoff/fable_claude_prompting.md`. Consult these official pages when applying the operating protocol:

- [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Effort parameter](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Explore, plan, and build](https://code.claude.com/docs/en/common-workflows)
- [Subagents](https://code.claude.com/docs/en/sub-agents)
- [Optimize costs](https://code.claude.com/docs/en/costs)

### 2.2 Explore before editing

1. Read root `AGENTS.md`, `MEMORY.md`, the package manifests, route layouts, server entry points, migrations, CI, infrastructure, and tests relevant to the current slice. Follow nested instructions.
2. Build a current dependency map for the slice: client command → API route → transaction → ledger/event → worker/provider → recipient client → recovery path → admin/support view.
3. Read callers before changing a shared function. Preserve existing state machines, API compatibility, and transactional invariants unless a reviewed migration explicitly changes them.
4. Check the Expo SDK version in `package.json` and use version-matched official Expo documentation. Do not rely on remembered native APIs.
5. Treat source comments, old reports, screenshots, and historical test logs as claims to verify, not current truth.
6. Do not modify unrelated files or “clean up” the extensive existing working tree. Keep one writer per file and preserve owner work.

### 2.3 Plan and manage context

For each vertical slice, write a short plan containing:

- user and operational outcome;
- exact files and contracts expected to change;
- state and failure transitions;
- migration/backfill/rollback implications;
- test and physical-device evidence;
- what is explicitly out of scope.

Keep the plan current rather than creating a parallel documentation estate. Compact or summarize long exploration when context grows; retain the requirement checklist, decisions, file references, and unresolved failures. Re-read critical code after compaction instead of relying on memory.

Use subagents sparingly for bounded, independent research or review with explicit file ownership and a time limit. Do not fan out implementation across shared state machines or the same files. The lead remains responsible for integration and verification. Follow the repository's bounded retry/provider-failover rules if delegation is used; never relax a gate because a model or provider failed.

### 2.4 Implement vertical slices, not horizontal placeholders

A slice is not done when a screen, route, table, or cloud resource exists. It is done when the user journey, server transaction, provider failure behavior, recovery, operator visibility, tests, and deployment configuration agree.

Prefer the smallest complete change that uses the existing architecture. Add a dependency only for a demonstrated need, using the Expo-compatible installation workflow where applicable. Do not introduce a second state machine, cache, router, payment ledger, or notification abstraction to hide a defect in the existing one.

### 2.5 Verify and report evidence

For every requirement, record one of: **implemented**, **partial/mock/disabled/gated**, **missing**, or **not verified**. Distinguish static source inspection from executed tests and field evidence.

At each slice boundary:

- run focused regression tests, then the relevant full suite;
- run lint, TypeScript, Expo Doctor where dependency/config changes warrant it, infrastructure validation, and deployment/readiness checks;
- test failure and retry behavior, not only the happy path;
- run the required journeys on the connected physical Android phone, never an emulator;
- use `k5` over SSH for heavy or remote-only testing when authorized and reachable; otherwise label local evidence accurately and report the exact blocker;
- capture the command, date, build/commit, environment, route/measurement version, and result in the existing evidence ledger.

Do not claim production readiness from a source audit, unit test, web screenshot, or a single device. Do not fabricate provider responses, Arabic reviews, road access, customer research, legal conclusions, prices, or market coverage.

---

## 3. Repository truth to preserve

### 3.1 Existing capabilities and their evidence state

| Area | What source shows | Production meaning |
|---|---|---|
| Mobile application | Broad Expo/React Native app with customer, driver, admin, partner, and public-tracking surfaces | Preserve and harden; do not rewrite |
| API/domain | 178 routes inventoried across auth, orders, dispatch, payments, cash, support, subscriptions, referrals, tracking, and administration | Broad coverage does not prove deployed reachability |
| Data | PostgreSQL schema and migration path, with SQLite development/review paths | Production must prove PostgreSQL-only invariants and migration safety |
| Customer | Booking, categories, quotes, scheduling, destination changes, live order, receipt, repeat booking, support | Booking race and recovery are release blockers |
| Driver | Eligibility/onboarding, presence, offers, active work, run sheet, earnings, receipts, location reporting | Field reliability and recovery are unproven |
| Operations | Admin orders/users/settings/cash/subscriptions and monitoring surfaces | Needs actionable exception queues, auditability, and safe interventions |
| Money | COD/payment domain, cash ledger, remittance, receipts, test PSP wiring | No live PSP is proven; immediate-capture gate must be fixed before activation |
| Maps/routing | Existing map provider boundaries, local gazetteer, Google/OSRM-related routing code, road controls | Coverage, route legality, reproducibility, and ETA calibration remain open |
| Realtime | Web PubSub and client live-order handling exist | Process-local coordination and reconnect behavior need correction |
| Notifications | Push domain and background tasks exist | Receipt polling and token rotation are incomplete; SMS is separately gated |
| Cloud | Existing deployment/infrastructure code and probes | Keep minimal; do not replace a transactional core with microservices |

The primary source inventory is `research_notes/Fable 5.2 production upgrade handoff/repository_functionality_audit.md`. Use its route and activation tables to resolve disputes with older documentation.

### 3.2 Architecture decision

Retain the modular Node/PostgreSQL transactional system and existing worker. Use containers on ECS/Fargate, RDS PostgreSQL with PostGIS where geographic queries need it, S3 for private objects, and a small number of managed integrations. Scale by measured bottleneck.

Do not create microservices, Kubernetes, a service mesh, a second event store, or a multi-region active-active system. Do not move the system of record into a realtime service. Keep explicit state transitions, idempotent commands, transactional outbox/background processing, and auditable ledgers at the center.

The fresh architecture rationale is in `research_notes/Fable 5.2 production upgrade handoff/backend_aws_architecture.md`. Earlier Azure/Uber documents are background for behavioral comparison, not authorization to import Azure-specific services or proprietary implementation assumptions.

### 3.3 Product boundary

Support the existing service categories only after their operational contracts are valid: parcel, ride, freight, scheduled orders, multi-stop/run-sheet work, and merchant/partner flows. Do not imply that one driver network, vehicle rule, insurance rule, price, or ETA fits every category. Category, vehicle, capacity, crew, and service-area eligibility must be explicit.

---

## 4. Release priorities

### P0 — trust, money, safety, recoverability, and launch blockers

1. Eliminate duplicate/lost booking commands and the composer-clearing race.
2. Make payment settlement gating correct before any live PSP activation.
3. Complete notification receipt handling, token lifecycle, and recovery.
4. Replace process-local locks/budgets/realtime assumptions with shared, persistent coordination.
5. Establish durable command/outbox/location recovery and reconnect convergence.
6. Establish legal, reproducible Palestinian road routing and adequate address/POI discovery for the pilot.
7. Close privacy, authorization, public-tracking, storage, and secret-handling blockers.
8. Prove the core Arabic/English customer, driver, COD, and admin journeys on physical devices.
9. Establish production observability, support, backup/restore, CI/CD, and controlled release gates.

### P1 — operational quality and market fit

1. Measured ETA calibration and dispatch quality.
2. Merchant/partner bulk operations, reconciliation, exports, and exception handling.
3. Full offline UX, Arabic content quality, accessibility, low-end performance, and driver ergonomics.
4. Safety center, incident workflows, support SLAs, driver/customer communications, and fraud controls.
5. Complete onboarding/document/review/subscription/referral operations.
6. Product analytics, funnel/SLI dashboards, alert tuning, and launch reporting.

### P2 — measured expansion after pilot stability

1. Additional districts/categories only after coverage and unit-economics evidence.
2. More sophisticated batching/optimization and scheduled-capacity planning.
3. Optional digital-payment providers or wallets after commercial and technical validation.
4. Further personalization, promotions, loyalty, and visual refinements that do not weaken reliability.
5. Cost and performance optimization driven by production measurements.

P2 does not mean unimportant forever; it means do not let expansion displace the P0/P1 trust work.

---

## 5. Dependency-aware implementation contract

Execute the following vertical slices in order. A later slice may prepare code behind a disabled flag, but must not claim completion before its dependencies and evidence pass.

### Vertical slice 0 — reproducible baseline and decision register (P0)

**Deliverables**

- Reconcile the current working tree with the fresh audit and identify any code added after 10 November.
- Produce a route/config/provider activation matrix from source and deployed configuration without exposing secrets.
- Reproduce the booking race and immediate-payment settlement defect in focused tests before fixing them.
- Establish one requirement/evidence ledger covering every section of this handoff.
- Record owner decisions from section 12 that block architecture, providers, legal copy, or launch.
- Capture baseline bundle size, startup, route performance, test results, deployed versions, and device/build identity where tooling is available.

**Gate:** the team can reproduce the highest-risk defects, identify the exact build and configuration under test, and distinguish implemented code from activated production behavior.

### Vertical slice 1 — one durable booking and order command contract (P0)

**Scope:** customer composer, quote, scheduling, destination changes, API idempotency, order transaction, outbox, reconnect, and operator view.

**Deliverables**

- Give every booking attempt a stable client command ID that survives retries and process death. Bind the server result to the authenticated customer, command, quote/version, and immutable request fingerprint.
- Fix the race in which the booking composer clears a newly created draft. A late quote, callback, hydration, or retry must not erase or replace a newer user command.
- Make command processing idempotent under double tap, timeout, retry, app restart, and concurrent requests. Return the original order/result for a genuine retry; reject the same key with a different payload.
- Keep quote expiry, price version, category/vehicle eligibility, service area, scheduled window, stops, goods/crew requirements, and payment method server-validated.
- Commit order, initial status history, financial intent where applicable, and outbox work atomically. A provider/socket failure after commit must not cause another order.
- Define explicit UX states: idle, locating, editing, searching place, quote loading, quote unavailable, quote expired, submitting, submitted-but-unconfirmed, confirmed, offline queued where safe, and unrecoverable error. Never leave an indefinite spinner.
- On reconnect, query by command ID and reconcile to the server order. Preserve user input until an order is confirmed or the user deliberately discards it.
- Make destination/scheduled changes versioned and authorized, with driver/customer/admin seeing the same final state.

**Acceptance evidence**

- Automated concurrency and restart tests prove exactly one order and one financial intent per command.
- Physical-device tests cover double tap, background/foreground, process death, airplane mode, timeout after server commit, quote expiry, and retry with a changed payload.
- Admin/support can find the command, attempts, current order, and failure reason without seeing secrets.

### Vertical slice 2 — payments, COD, subscriptions, and financial reconciliation (P0)

**Scope:** `server/domain/payments.ts`, payment routes/jobs, cash/remittance, receipts, subscriptions, referrals, and admin cash screens.

**Deliverables**

- Fix immediate capture so it cannot bypass the settlement gate before PSP activation. Model provider state and internal settlement as separate facts.
- Use explicit states for payment intent, authorization, capture, failure, cancellation, refund, COD due/collected/remitted, dispute, and reconciliation exception as applicable. Do not infer money movement from an order status alone.
- Make webhooks/provider callbacks authenticated, idempotent, ordered/versioned where possible, replay-safe, and auditable. Reconcile provider records with internal ledgers.
- Keep test PSP behavior visibly isolated from production. Live activation requires owner-approved provider, credentials, contract, callback configuration, currency/fee rules, refund/dispute procedures, and a successful controlled transaction.
- For COD, show who owes what to whom, when collection is confirmed, driver remittance due/overdue, adjustments, and evidence. Prevent double collection after reconnect.
- Ensure customer, driver, merchant, and admin receipts agree. Every adjustment requires actor, reason, timestamp, and immutable history.
- Enforce server-side entitlement and expiry for subscriptions/referrals; never trust a client flag or local clock.

**Acceptance evidence**

- Tests cover retries, duplicate callbacks, out-of-order events, partial failure, cancellation, refund, expired authorization, COD double-submit, remittance, and negative/concurrent balance cases.
- The settlement-gate regression test fails on the old behavior and passes on the fix.
- A finance/operator walkthrough reconciles a controlled trip from booking through receipt and remittance. If no live PSP exists, label digital payment **gated**, not production-ready.

### Vertical slice 3 — identity, authorization, privacy, safety, and support foundation (P0/P1)

**Deliverables**

- Test every route/object/action against customer, driver, merchant/partner, dispatcher/admin, recipient/public-tracker, and unauthenticated access. Scope list, export, tracking, chat, receipt, and support queries by tenant/ownership/role.
- Protect phone numbers, precise location, documents, payment data, and private media. Use short-lived authorized access to private S3 objects; never public buckets or permanent public URLs.
- Complete phone/session lifecycle: verification, recovery, phone change, logout, token rotation/revocation, device change, and deactivated/suspended accounts. Prevent stale sessions from retaining driver or admin privileges.
- Minimize public tracking data, use unguessable scoped tokens, expire/revoke appropriately, and avoid exposing driver identity or precise history beyond the operational need.
- Complete push token registration, rotation, invalidation, logout removal, multi-device ownership, and provider receipt handling. Quarantine invalid tokens and alert on systemic failures.
- Store notification delivery state and expose useful fallback. SMS and push are independently gated; do not equate queued with delivered.
- Provide in-app support entry points for active and completed orders, category/severity, safe attachments, status, and operator notes. Include safety-critical escalation and evidence preservation.
- Add accessible safety actions appropriate to the approved operating policy: share trip, call support/emergency guidance, report driver/customer incident, and blocked-user handling. Do not promise emergency response that Fastship cannot provide.
- Publish owner-approved privacy, retention/deletion, terms, driver/customer responsibilities, COD/payment terms, and support channels in Arabic and English. Obtain qualified local review where required; the implementation agent does not declare legal compliance.

**Acceptance evidence**

- Deny-by-default integration tests cover cross-user and cross-role object access, revoked sessions, token reuse, expired public tracking, and private media.
- Notification tests include token rotation and provider receipts, not just successful enqueue.
- Support can handle an active-trip incident and a completed-order dispute with an auditable timeline.

### Vertical slice 4 — Palestinian places, legal roads, tracking recovery, and ETA (P0/P1)

Implement this as one geo slice because address quality, routing, dispatch, ETA, and tracking all depend on the same versioned geographic contract.

#### 4A. Addresses and discovery (P0)

- Replace dependence on the small local gazetteer with a versioned Palestinian place/POI pipeline appropriate to the pilot. Preserve the local dataset as a fallback only where its coverage and freshness are measured.
- Support Arabic and English names, aliases, transliteration, spelling variation, neighborhoods, landmarks, villages/camps where relevant, and “near this landmark” workflows. Preserve the user's selected place and formatted instructions; do not reduce an address to coordinates alone.
- Add entrance/access notes, building/floor/apartment, recipient phone, landmark, and driver/customer pin correction. Distinguish search result, selected pin, road-snapped point, and actual pickup/drop-off.
- Geocode biased to the approved service area, but never silently choose a same-name place outside it. Show city/area disambiguation and an explicit no-coverage state.
- Establish an operations correction loop for missing places, bad aliases, incorrect entrances, and unreachable addresses.

#### 4B. Road graph and route legality (P0)

- Pin OSM extract and routing-engine versions; stop using an uncontrolled moving `latest` extract for production builds.
- Record source date, geographic clipping, processing steps, OSRM/profile version, and checksum. Make builds reproducible and rollbackable.
- Treat road access, closures, checkpoints, permits, vehicle restrictions, turn restrictions, one-way rules, and local operating boundaries as product data and operational inputs. Do not infer universal legality from OSM geometry.
- Model reviewed closures/restrictions with effective time, geography, vehicle/category scope, source, author, and expiry. Provide a safe manual operations override with audit history.
- Return route geometry, distance, duration, version, warnings, and fallback status. Never silently present a straight line, road-snapped guess, or different route as the priced road route.
- Test origin/destination pairs across the actual pilot, including villages, border/edge cases, restricted areas, divided roads, U-turns, one-way streets, unpaved roads, and inaccessible entrances. Local experts must review the route corpus.

#### 4C. Tracking and offline recovery (P0)

- Persist driver commands and raw location batches durably on device with monotonic sequence, captured-at timestamp, received-at timestamp, accuracy, speed/bearing where available, battery/permission context, and schema version.
- Use bounded encrypted/private storage, batch retry with backoff/jitter, idempotent server ingestion, retention limits, and explicit overflow behavior. Never silently drop a live order because the socket is disconnected.
- Separate socket health, GPS permission/health, queued samples, server freshness, and order synchronization in the UI. “Connected” must not imply fresh GPS.
- On reconnect, send pending commands/locations in order, fetch authoritative order state, and converge customer/driver/admin/public tracking. Prevent stale samples from moving a vehicle backwards or changing a completed order.
- Retain authorized raw history for support and ETA analysis; retain derived/display points separately. Apply privacy retention rules after the operational window.
- Handle permission denied/restricted, mock/inaccurate GPS, background restrictions, low battery, reboot, app upgrade, and no network with clear recovery actions.

#### 4D. Dispatch and ETA (P0/P1)

- Keep automatic dispatch gated until eligibility, route legality, location freshness, driver supply, and manual fallback are proven. Automatic assignment is not a prerequisite for a safe pilot.
- Rank candidates using fresh location, legal road travel time/distance, category/vehicle/capability, shift/status, current jobs, scheduled commitments, acceptance/cancellation pressure, and fairness. Explain the decision to operations.
- Prevent double assignment with transactional state transitions and shared leases/locks. Make offers expiring, idempotent, and recoverable.
- Implement manual assignment/reassignment/cancellation with permission, reason, customer/driver communication, payment/price implications, and audit.
- Build ETA from route/version, observed travel, pickup approach, stop dwell, category, time/context, and uncertainty. Start with a measured baseline before complex ML.
- Show ETA range/confidence and stale state where useful. Recalculate on meaningful route/progress changes without flicker. Record predicted and actual approach/arrival/completion for calibration.
- Set launch targets only after a representative pilot corpus exists; report median and tail error by district/category/time, coverage, and route fallback. Do not import Uber ETAs or simulated accuracy as evidence.

**Geo acceptance evidence**

- A versioned route/place dataset can be rebuilt and rolled back.
- The owner/local operations approves a pilot route-legality corpus; every exception has an operational fallback.
- Device pilots prove durable recovery across disconnect, reboot, process death, and delayed GPS.
- Dispatch tests prove no double assignment under concurrency and safe manual takeover.
- ETA evaluation uses actual Palestinian pilot trips with timestamps and route versions, not only synthetic traces.

Detailed source findings and proposed field gates are in `research_notes/Fable 5.2 production upgrade handoff/maps_tracking_dispatch.md`.

### Vertical slice 5 — complete role workflows and humane mobile UX (P0/P1)

Use the shared server contract; do not create role-specific local versions of the truth.

#### Customer (P0)

- Onboarding/sign-in/recovery, service/category selection, address and instructions, recipient details, quote/schedule, booking, driver matching, live trip, destination change, chat/call masking policy, COD/payment, rating, receipt, repeat booking, support.
- Show explicit states for no drivers, searching, offer delayed, driver assigned, driver approaching, arrived, in progress, waiting, completed, cancelled, failed, refunded/payment pending, and support review.
- Explain price, cancellation, waiting, destination-change, and payment outcomes before confirmation where applicable.

#### Driver (P0)

- Eligibility/onboarding/document status, approval, availability, permissions, offer accept/decline/expire, navigation handoff, arrival/waiting, pickup/drop-off verification, multi-stop order, COD collection, completion, earnings, remittance, scheduled/run-sheet work, incident/support.
- Show the next safe action and blocker. Do not allow arrival/completion without the required server-validated state and evidence.
- Provide low-distraction controls, large touch targets, readable Arabic, persistent active-order recovery, and clear background-location/notification status.
- Handle rejected offers, reassignment, customer cancellation, no-show, recipient unavailable, unsafe/inaccessible stop, goods mismatch, and vehicle/crew mismatch.

#### Recipient/public tracker (P0/P1)

- Verify the intended tracking/delivery experience without requiring unnecessary account creation or exposing unrelated data.
- Support delivery instructions, status, ETA freshness, proof/receipt where authorized, failed delivery, and support escalation.
- Expire/revoke access and test token guessing, sharing, replay, and cross-order access.

#### Merchant/partner (P1)

- Complete authenticated onboarding, address/contact management, single and bulk order creation, quote/schedule, templates/import validation, live status, exception resolution, recipient communication, COD/payment reconciliation, invoice/export, support, and API/webhook behavior only where actually offered.
- Provide row-level import errors, idempotent bulk submission, partial-failure recovery, and permission-scoped exports.
- Do not label partner workflows production-ready merely because screens/routes exist.

#### Dispatcher/admin/support (P0/P1)

- Provide live operational queues for unassigned, stale GPS, delayed, unreachable, payment/COD exception, cancelled/disputed, safety, and provider-degraded orders.
- Enable searched/filtered order timelines with commands, status, route/dispatch decisions, location freshness, notifications, payment/ledger events, and support notes.
- Make manual assignment, reassignment, cancellation, refund/adjustment, driver suspension, closure/restriction, and customer communication permissioned, confirmed, reason-coded, and auditable.
- Separate admin roles where risk warrants it; a generic admin screen is not sufficient authorization design.
- Ensure settings changes have validation, effective time, audit, and safe rollback. Avoid edits that retroactively rewrite financial history.

#### Cross-cutting UX (P0/P1)

- Define loading, empty, error, offline, stale, retrying, permission-denied, disabled/gated, success, and partial-success components for every workflow.
- Remove indefinite spinners and silent no-ops. Preserve entered data across errors and navigation.
- Make retry safe using the same command identity; never instruct users to tap repeatedly.
- Handle slow/failed map tiles, unavailable place search, expired quote, stale location, notification denial, backgrounded app, low storage, and server maintenance.

Source-specific screen findings are in `research_notes/Fable 5.2 production upgrade handoff/mobile_experience_audit.md`.

### Vertical slice 6 — Arabic RTL, accessibility, offline behavior, and performance (P0/P1)

**Arabic and localization**

- Treat Arabic as a primary workflow, not a translated afterthought. Complete customer, driver, recipient, merchant, admin, errors, notifications, support, legal, and empty states.
- Verify true bidirectional layout: navigation, back affordances, icons where direction matters, maps/pins, timelines, forms, phone numbers, currency, dates, mixed Arabic/English, and long strings.
- Use locale-appropriate formatting without changing identifiers or phone number semantics. Keep Arabic place aliases searchable in either language.
- Have a fluent Palestinian Arabic reviewer validate clarity, tone, terminology, and operational instructions. Machine translation alone is not acceptance evidence.

**Accessibility and driver ergonomics**

- Test screen reader labels/order, focus, touch targets, contrast, dynamic text, reduced motion, error announcements, and keyboard behavior where supported.
- Ensure critical states are not conveyed only by color, map movement, toast, sound, or vibration.
- Use one-handed, glare, motion, and mounted-phone checks for drivers. Avoid interaction that encourages unsafe phone use while driving.

**Offline and poor connectivity**

- Define which reads are cached, which commands may queue, and which actions must be online. Never queue a financial action without a stable idempotency contract.
- Show last-updated time and stale/offline status. Cache safe order/receipt/run-sheet data with user scoping and logout/retention controls.
- Test high latency, packet loss, intermittent connectivity, captive portal/server failure, and network switching. Recover without duplicate orders, duplicated COD, or lost active-trip state.

**Performance**

- Measure cold/warm start, time to usable home/active order, map interaction, place search, booking response, driver offer response, list scrolling, memory, battery, and network payload on the actual device.
- Profile before optimizing. Avoid unnecessary map rerenders, location watchers, polling, large media, and JS-thread work. Keep background work bounded.

### Vertical slice 7 — notifications, communications, and lifecycle reliability (P0/P1)

Although push fixes begin in slice 3, validate the full communication lifecycle here after order and tracking contracts are stable.

- Map every important transition to customer, driver, recipient, merchant, and operator messages with locale, channel, deduplication key, deep link, priority, expiry, and fallback.
- Cover offer, assignment, approach, arrival, waiting, destination change, delay, cancellation, payment/COD, receipt, scheduled reminder, incident, and support response.
- Handle denied permission, token rotation, logged-out device, provider throttle/outage, invalid token, duplicate notification, app killed, and deep link after reinstall/login.
- Consume Expo push receipts asynchronously and record provider/message errors. Do not mark delivered from a successful ticket alone.
- Use SMS only for approved high-value fallback/verification with anti-abuse controls and measured delivery; avoid leaking trip details to an unverified number.
- Provide an in-app notification/order timeline so a missed push does not hide operational truth.

Reference: [Expo push notifications overview](https://docs.expo.dev/push-notifications/overview/) and the SDK-matched sending/receipt documentation.

### Vertical slice 8 — AWS production architecture and migration (P0)

**Target architecture**

- ECS/Fargate for the stateless Node API and existing worker, behind an Application Load Balancer, with at least two tasks for production when availability requires it.
- RDS PostgreSQL in private subnets, automated backups, encryption, monitoring, and PostGIS enabled only where used. Keep migrations explicit and backward-compatible during rollout.
- S3 private buckets for documents, evidence, exports, and media; signed access, lifecycle rules, malware/content validation where needed, and no public default.
- ElastiCache/Valkey or an equivalent small shared coordination layer only if needed for sockets, rate limits, leases, ephemeral presence, and shared budget counters. PostgreSQL remains the system of record for orders and money.
- A managed realtime channel where justified; all clients must still reconcile through authoritative API state. Do not let Web PubSub/socket delivery become the only copy of an event.
- Secrets in AWS Secrets Manager or the approved equivalent, task roles with least privilege, CloudWatch logs/metrics/alarms, and OpenTelemetry-compatible tracing where useful.
- WAF/CloudFront only where the threat and delivery model justify them; observe any repository/global-resource Region constraints and the owner's AWS instructions.

**Migration sequence**

1. Inventory current deployment, environment variables, database objects, public endpoints, scheduled jobs, providers, and data volumes.
2. Add/verify PostgreSQL parity tests and production-like staging. Run schema migrations against a copy, not only an empty database.
3. Move shared locks, idempotency, budget/rate-limit state, socket fan-out assumptions, and background scheduling off single-process memory before scaling beyond one task.
4. Make the worker idempotent and singleton/per-leader where required. Ensure deploys cannot run duplicate schedulers or lose queued work.
5. Migrate private objects and verify access/retention. Configure providers in staging with explicit non-production flags.
6. Deploy additive schema first, then compatible code, then backfill with checkpoints, then enforce constraints, then remove old behavior after observation.
7. Run smoke/readiness checks against actual deployed dependencies. Use health checks that distinguish liveness from critical dependency readiness without causing cascade failures.
8. Document rollback for code, configuration, providers, and data. A database rollback is not `migrate down` by default; use forward fixes or tested restore procedures as appropriate.

**Acceptance evidence**

- Two API/worker instances can run without duplicate assignment, duplicate scheduled jobs, lost events, or local-budget bypass.
- Readiness fails closed for unsafe production configurations such as development auth, test payment mode, public private media, or missing required secrets.
- Infrastructure validation and a real staging deployment pass. Resource creation without a journey test is not completion.

Use `research_notes/Fable 5.2 production upgrade handoff/backend_aws_architecture.md` and current official AWS documentation. The selected Region and account constraints in the repository instructions take precedence.

### Vertical slice 9 — security, abuse resistance, and data governance (P0/P1)

- Centralize security headers, CORS allowlists, request/body limits, content validation, rate limits, and structured error handling. Never return secrets, stack traces, SQL, tokens, or private provider responses to clients.
- Apply parameterization/ORM safety, authorization on every object, mass-assignment allowlists, safe URL handling, upload validation, and webhook signature verification.
- Rate-limit and monitor OTP/phone recovery, login, place search, booking, dispatch offers, tracking, chat, support attachments, exports, and payment/webhook endpoints. Use shared limits across replicas.
- Protect against user enumeration and OTP brute force without creating a denial-of-wallet or denial-of-service vector. Define lockout/escalation policy and test it.
- Validate deep links, public tracking tokens, callback URLs, map/provider keys, and client-visible diagnostics. Scope provider keys and rotate them.
- Keep immutable audit records for privileged and financial actions. Redact tokens and precise personal data from logs/analytics.
- Define data classification, retention, deletion/export, legal holds, backup retention, and driver/customer document lifecycle. Apply deletion without destroying required financial/audit evidence; record policy and obtain local review.
- Run dependency and secret scanning, review Expo/native configuration, and test release builds rather than development clients only.

**Gate:** security integration tests and a release-configuration review pass; unresolved cross-tenant access, exposed private objects, auth bypass, unbounded financial retry, or secret leakage blocks launch.

### Vertical slice 10 — observability, analytics, and operations (P0/P1)

**Technical observability**

- Propagate correlation/command/order/driver/dispatch/payment identifiers through API, worker, provider, notification, and client diagnostics without logging sensitive payloads.
- Emit structured events for state transition, retry, provider request/receipt, route version, queue age, socket/GPS freshness, and reconciliation exception.
- Define SLIs and alerts for booking success/duplicate rate, order assignment latency, active-order freshness, location queue age, socket reconnect convergence, payment/COD exceptions, push receipt failure, API/worker errors, saturation, database health, route failure, and support backlog.
- Alerts need owner, severity, runbook, deduplication, and actionable threshold. Avoid alert-only dashboards with no response process.
- Keep client diagnostics privacy-safe and useful after reconnect; support should be able to retrieve a consented diagnostic reference.

**Product analytics**

- Define an event dictionary with server-authoritative order/financial outcomes and client UX funnel events. Do not count a button tap as a completed order.
- Measure activation, place-search success, quote success/expiry, booking conversion, cancellation, matching, completion, ETA error, payment/COD exceptions, driver utilization/acceptance, support contact, retention, and category/district performance.
- Include app version, locale, category, district, route version, connectivity context, and experiment/flag where privacy policy permits. Do not use precise location as a general analytics dimension.
- Reconcile analytics totals to transactional data and disclose known delays/loss.

**Operational runbooks**

Cover provider outage, SMS/push outage, OSRM/route-data rollback, bad map/POI release, database failover/restore, stuck orders, stale drivers, payment mismatch, COD dispute, safety incident, privacy request, secret rotation, app rollback, and forced upgrade decision.

### Vertical slice 11 — testing, CI/CD/EAS, DR, and launch operations (P0/P1)

#### Test strategy

- Unit/property tests for state machines, quotes, money, dispatch ranking, retry/idempotency, localization formatting, and route/geo utilities.
- PostgreSQL integration tests for transactions, concurrency, authorization, migrations, outbox, ledgers, and multi-instance coordination.
- Contract tests for mobile/API/worker/provider payloads, including old-client compatibility and unknown enum/state handling.
- End-to-end tests for every role and failure/recovery path. Test Arabic and English with long content and mixed-direction data.
- Route corpus tests, replayed GPS traces, and actual pilot journeys. Simulated traces validate logic but cannot establish road legality or field ETA.
- Load/soak tests for booking bursts, driver location ingestion, socket reconnect storms, scheduled jobs, notifications, exports, and database pools. Include degraded providers.
- Security tests for cross-role access, token/session abuse, upload/tracking/payment abuse, rate limiting, and release configuration.
- Physical-device release-build tests, not emulator-only or Expo-Go-only evidence.

#### Physical-device matrix

Follow the repository rule: use the connected physical Android phone; if unavailable, stop and request it rather than starting an emulator. Use `k5` only when authorized/reachable and report exact remote evidence. Minimum journey set:

1. Arabic and English customer sign-up/recovery → place search → quote → booking → matching → live trip → COD/payment → receipt/support.
2. Driver onboarding/status → offer → background/foreground → navigation → pickup/drop-off → COD/remittance → earnings.
3. Admin assigns/reassigns/cancels, handles stale GPS, resolves payment/COD and support exceptions.
4. Merchant bulk/single order and reconciliation where included in launch.
5. Public recipient tracking, expiry, failed delivery, and privacy boundaries.
6. Airplane mode, network switch, high latency, process death, reboot, denied permissions, push token rotation, quote expiry, double tap, low storage/battery where practical.
7. Offline recovery after server commit, app upgrade with queued commands/locations, and duplicate callback/retry.

Record device model/OS, app build, backend version, route dataset, provider modes, language, network condition, actual result, and artifacts. Do not claim full market device coverage from one phone; it is the required first physical gate, followed by representative pilot devices.

#### CI/CD and EAS

- CI must run install/lockfile checks, lint, TypeScript, focused/full tests, PostgreSQL integration, security/dependency checks, infrastructure validation, and release-config guards.
- Add migration checks against representative data and a preview/staging deployment gate. Fail on missing required provider mode, public media, development auth, or absent evidence.
- Use EAS Build/Submit/Update according to the installed Expo SDK and official documentation. Separate development, preview, and production profiles; keep secrets out of the bundle.
- Server/mobile compatibility must be explicit. Use minimum-supported-app-version and feature flags for breaking contracts; staged rollout with kill switch for risky geo/dispatch/payment changes.
- OTA updates are not a universal rollback for native changes or server migrations. Document when a new binary, server compatibility window, or forced upgrade is required.
- Protect signing credentials and provider secrets; verify the signed release artifact actually installed on the phone.

Official starting points: [EAS Build](https://docs.expo.dev/build/introduction/), [EAS Update](https://docs.expo.dev/eas-update/introduction/), and [EAS environment variables](https://docs.expo.dev/eas/environment-variables/). Fetch SDK-matched pages before implementation.

#### Backup and disaster recovery

- Define RPO/RTO with the owner for orders, financial ledgers, location history, documents, and configuration. Do not equate enabled backups with proven recovery.
- Test RDS point-in-time restore and S3 recovery into an isolated environment; verify application compatibility, secrets/provider disablement, row/ledger reconciliation, and DNS/cutover steps.
- Back up route/POI datasets, infrastructure definitions, migration history, operational restrictions, and release manifests as well as the database.
- Document regional/service outage behavior within the owner's single-Region constraints. Do not deploy prohibited cross-Region replication; state residual risk honestly.
- Run a restore exercise before launch and at an owner-approved cadence.

#### Launch operations

- Start with a small named geography/category/driver cohort and controlled operating hours. Manual dispatch and provider fallbacks may remain enabled if tested.
- Staff onboarding, driver support, customer/recipient support, incident escalation, finance reconciliation, and route correction before inviting volume.
- Use a go/no-go checklist with explicit owners for every P0 gate, open P1 risk, provider activation, legal/content approval, support readiness, dashboard/alert health, rollback, and restore evidence.
- Roll out gradually, monitor cohorts, pause on safety/money/order-integrity regressions, and publish internal incident/launch reviews.
- Expand only when route coverage, completion, support burden, driver economics, cash reconciliation, and tail reliability meet owner-approved thresholds.

---

## 6. Cross-role workflow acceptance matrix

Every row needs the stated states and evidence; “screen exists” is insufficient.

| Workflow | Required happy path | Required failure/recovery path |
|---|---|---|
| Customer booking | Place → quote → confirm → assigned → active → completed → receipt | Offline/timeout after commit, quote expiry, no driver, cancellation, duplicate retry, support |
| Scheduled booking | Valid window/capacity → reminder → activation → completion | Missed capacity, reschedule/cancel, stale quote, driver unavailable |
| Multi-stop/freight | Eligibility/goods/crew → ordered stops → proof per stop → settlement | Inaccessible stop, goods mismatch, recipient absent, reorder/change, partial completion |
| Driver active work | Presence → offer → accept → approach → pickup → drop-off → earnings | Offer expiry, reassignment, stale GPS, reboot, denied permission, incident |
| Driver COD | Amount due → verified collection → receipt → remittance → reconciled | Double tap/reconnect, under/overpayment exception, dispute, overdue remittance |
| Digital payment | Intent/authorization → valid capture/settlement → receipt | Decline, timeout, duplicate/out-of-order webhook, refund, provider outage |
| Recipient/public | Scoped tracking → status/ETA → delivery/proof | Expired/revoked token, failed delivery, stale data, support without data leak |
| Merchant/partner | Create/import → validate → submit → monitor → reconcile/export | Row errors, partial failure, duplicate batch, permission scope, export failure |
| Admin/dispatch | Search → diagnose → manual intervention → communicate → audit | Concurrent operator action, invalid transition, provider degradation, rollback |
| Support/safety | Identify order/user → triage → preserve evidence → resolve/escalate | Active emergency, abusive user, privacy request, unavailable provider, reopened case |
| Notifications | Correct localized message/deep link → authoritative state | Denied permission, rotated token, killed app, duplicate/late message, provider outage |

---

## 7. Quantitative release gates and evidence requirements

The owner must approve numeric business targets. Until then, the following are **gate definitions**, not claims or universal benchmarks.

| Dimension | Minimum gate before broad launch |
|---|---|
| Command integrity | Exactly one order/financial intent for all tested retries and concurrent duplicates; zero known composer-clearing reproductions |
| Authorization | All automated cross-user/cross-role denial cases pass; no open critical/high data exposure |
| Money | Controlled transactions reconcile across order, provider where applicable, receipt, cash/remittance, and admin ledger; no unexplained balance difference |
| Places/roads | Pilot route corpus reviewed locally; no unhandled illegal/unreachable route in the approved corpus; versioned rollback proven |
| Tracking | Disconnect/reboot/process-death tests converge without lost commands, duplicated completion, or stale-state overwrite; queue limits are explicit |
| Dispatch | No double assignment under concurrency; manual fallback tested; candidate decisions explainable |
| ETA | Representative actual-trip baseline published by segment with tail error and coverage; owner approves pilot threshold |
| Notifications | Ticket and receipt outcomes measured; rotation/invalid-token tests pass; missed-push in-app recovery works |
| Arabic/accessibility | Fluent review plus physical-device RTL and accessibility checklist passes for all launch journeys |
| Reliability | Load/soak and provider-degradation tests meet owner-approved SLOs; no process-local correctness dependency at production replica count |
| Recovery | Isolated backup restore meets approved RPO/RTO and ledger/order reconciliation |
| Delivery | CI, release-config checks, staging smoke, EAS signed artifact, physical-device release journeys, and rollback procedure pass |
| Operations | Alerts/runbooks/support/finance/route-correction owners named; go/no-go record signed by accountable owner |

Evidence must identify build, environment, date, command/test, dataset/version, and raw result. “Works on my machine,” an old screenshot, or a green unit suite cannot close a field gate.

---

## 8. Explicit non-goals for this program

Do not expand scope into the following unless the owner separately prioritizes them:

- Rewriting the Expo app, Node domain, or PostgreSQL system of record.
- Cloning Uber's proprietary code, assets, private behavior, brand, or deployment topology.
- Microservices, Kubernetes, multi-region active-active, or a new data platform without measured necessity.
- Replacing the current map UI before place/road/route correctness is established.
- ML dispatch or ETA before a reliable measured baseline and usable pilot dataset exist.
- Nationwide Palestinian coverage, all cities/villages, or every service category at first launch.
- Live digital payments before provider/commercial/settlement approval and reconciliation tests.
- Assuming that OSM data proves access legality, checkpoint behavior, safety, or road suitability.
- Collecting precise location, contacts, or analytics beyond operational need.
- Declaring legal compliance, provider quality, market prices, or consumer demand without appropriate evidence and accountable review.
- Treating the physical phone as an emulator substitute for broad device-market certification; it is the minimum required real-device gate.

---

## 9. Anti-regression rules

1. **Never weaken an existing test or acceptance gate to make a change pass.** Fix the cause or explicitly escalate a changed requirement.
2. **Do not change application behavior merely to match stale documentation.** Reconcile the current source and contract first.
3. **Do not bypass the settlement gate, authorization check, quote validation, or idempotency to preserve a demo happy path.**
4. **Do not trade a transactional invariant for lower latency.** Move work to an outbox/worker rather than dropping correctness.
5. **Do not add process-local locks, in-memory queues, local-only tokens, or per-replica financial/rate-limit budgets to production paths.**
6. **Do not silently substitute straight-line distance, a snapped route, a stale quote, or a synthetic ETA for a legal road result.** Label and gate fallback.
7. **Do not expose raw provider errors, secrets, precise private coordinates, documents, or payment payloads in logs, analytics, public tracking, or support exports.**
8. **Do not duplicate state machines across customer, driver, admin, and partner clients.** Use shared contracts and authoritative server transitions.
9. **Do not erase drafts, queued commands, raw locations, or financial records on reconnect/logout without the specified retention and recovery behavior.**
10. **Do not allow late async responses to overwrite newer user intent.** Version commands, quotes, routes, and screen state.
11. **Do not run destructive migrations, paid infrastructure activation, production data deletion, forced provider activation, or broad rollout without explicit owner approval.**
12. **Do not mutate unrelated owner files, commit/push/reset/rebase, or create native `ios/`/`android/` projects manually.** Follow repository instructions and existing CNG configuration.
13. **Do not add an emulator-based acceptance path.** Use the required physical device and label all other evidence accurately.
14. **Do not report skipped tests as passed.** Prove a blocker with the exact command/error and continue independent work.
15. **Do not let subagent disagreement or provider failover lower quality.** Preserve the same acceptance gates and file ownership.
16. **Keep old clients safe during rollout.** Unknown states must not crash, duplicate, or falsely complete a journey.
17. **Make privileged intervention auditable and reversible where possible.** No silent admin edits to order, money, driver eligibility, or road restrictions.
18. **Preserve Arabic and offline behavior in every subsequent feature.** Add regression coverage when a workflow changes.
19. **Do not convert historical performance/provider claims into current facts.** Re-run or relabel them.
20. **A disabled/mock/test path must remain visibly labeled and impossible to confuse with production activation.**

---

## 10. Deliverables expected from Fable

For each approved slice, deliver:

1. The minimal implementation across mobile, API, worker, schema, infrastructure, and admin/support surfaces needed by that slice.
2. Migration/backfill/rollback notes and compatibility behavior.
3. Focused regression tests plus integration and failure-path coverage.
4. Updated existing operational/evidence documentation, not a parallel set of claims.
5. Exact executed commands and results, with environment/build/dataset identity.
6. Physical-device evidence for user-facing slices and deployed-environment evidence for infrastructure/provider slices.
7. A concise residual-risk list separating implemented, partial/mock/disabled/gated, missing, and not verified behavior.
8. Explicit owner actions for anything requiring credentials, commercial decisions, local road knowledge, Arabic review, legal review, console operations, or production approval.

Do not declare the whole program complete until all P0 gates are closed and the owner accepts any remaining P1 risk.

---

## 11. Required evidence map

Use these fresh notes as the initial source map, then inspect the repository again before editing:

| Concern | Fresh audit source |
|---|---|
| Routes, screens, activation gates, stale-document corrections | `research_notes/Fable 5.2 production upgrade handoff/repository_functionality_audit.md` |
| Booking/payment defects, push, privacy, reliability, quality | `research_notes/Fable 5.2 production upgrade handoff/security_reliability_quality.md` |
| Maps, Palestinian search, routing, GPS recovery, dispatch, ETA | `research_notes/Fable 5.2 production upgrade handoff/maps_tracking_dispatch.md` |
| Customer/driver/admin/partner UX, Arabic, accessibility, devices | `research_notes/Fable 5.2 production upgrade handoff/mobile_experience_audit.md` |
| Minimal AWS target and migration | `research_notes/Fable 5.2 production upgrade handoff/backend_aws_architecture.md` |
| Addressing, connectivity, COD/payments, onboarding, support, launch | `research_notes/Fable 5.2 production upgrade handoff/palestinian_market_requirements.md` |
| Fable identity, effort, planning, delegation, verification | `research_notes/Fable 5.2 production upgrade handoff/fable_claude_prompting.md` |

Older sources such as `reports/Fastship Uber behavior and Azure.md`, `reports/Fastship Claude implementation plan.md`, `reports/app-audit-2026-11-01.md`, and the Azure pricing extracts are dated background. Do not allow their claims, costs, screenshots, provider results, or historical performance to override the fresh audit or new measurements.

---

## 12. Owner decisions required

Fable: ask these as decision points when they block a slice, rather than silently guessing. Continue independent implementation that does not depend on the answer.

### Launch and market

1. Which municipalities/districts/villages, categories, operating hours, customer segment, driver cohort, and service-area boundaries define the first pilot?
2. Which workflows must be live at first launch: scheduled, multi-stop, freight, merchant bulk, recipient accounts, subscriptions, referrals, digital payment, automatic dispatch?
3. What completion, assignment, ETA, support, safety, and reliability thresholds constitute go/no-go? What RPO/RTO is acceptable?
4. Who are the accountable operations, driver-onboarding, support, safety, finance/COD, local-road, Arabic-content, privacy/legal, and launch owners?

### Geography and operations

5. Who validates road/checkpoint/access/restriction rules and maintains closures? What is the source, update cadence, review, and emergency correction process?
6. What addressing conventions do target users actually use, and which local places/aliases/landmarks are mandatory in the pilot corpus?
7. Is manual dispatch the approved launch mode? When, if ever, may automatic dispatch be enabled, and what fairness/driver-utilization policy applies?
8. What navigation handoff, driver wait/no-show, recipient-unavailable, unsafe-stop, cancellation, and reassignment policies apply?

### Money and providers

9. Is launch COD-only? Which live PSP/wallet, if any, has approved commercial terms, currency/settlement behavior, refunds/disputes, and production credentials?
10. What COD collection/remittance schedule, adjustment authority, proof, debt/overdue handling, and reconciliation process applies?
11. Which SMS, push, email, maps/geocoding, routing, storage, analytics, and customer-support providers are approved? What budgets, quotas, data-sharing limits, and fallbacks apply?
12. What commission, subscription, referral, fare/quote, waiting, cancellation, and destination-change rules must the server enforce?

### Identity, privacy, and support

13. What driver/customer/merchant documents and verification are required, who reviews them, and what retention/deletion policy applies?
14. What public-tracking fields, expiry, recipient verification, call masking, chat retention, location history, and proof-of-delivery policy are approved?
15. What safety escalation is actually staffed, which emergency guidance is appropriate, and what incidents require service suspension or authority escalation?
16. Which Arabic dialect/tone and support channels/hours/SLAs are approved? Who performs fluent Arabic and accessibility acceptance?

### Cloud and release

17. Confirm the AWS project plan, selected Region, spend-limit status, approved resource budget, custom domain/certificate, and production/staging separation.
18. Which existing deployment/database/data must be preserved during migration, and what maintenance window is allowed?
19. Which EAS project/profiles, signing owners, minimum app version, staged-rollout pace, OTA policy, and rollback/forced-upgrade authority apply?
20. Which pre-existing working-tree changes are authoritative, and are there code changes after the 10 November audit that alter the stated defects?

A console click, credential, signed contract, or local/legal judgment that only the owner can provide is a real dependency, not permission to fabricate completion. State the exact action and the verification that will follow it.

---

## 13. Final completion contract

Fable is finished only when the agreed launch scope has:

- no open P0 order-integrity, authorization, privacy, safety, money, recovery, or release blocker;
- reproducible Palestinian place/road data and locally approved pilot routes;
- proven customer/driver/admin/COD recovery on physical release builds;
- activated providers demonstrated independently, with disabled providers honestly labeled;
- multi-instance-safe API/worker behavior and production PostgreSQL evidence;
- useful telemetry, staffed alerts/runbooks, reconciliation, and support operations;
- tested migration, rollback, backup restore, CI/CD, EAS, and staged launch controls;
- a requirement-by-requirement evidence ledger with remaining P1/P2 risks explicitly accepted by the owner.

If any item is not tested, say **not verified** and give the exact blocker. If it works only with SQLite, one process, a test PSP, a local gazetteer, a simulator, a development build, or a simulated GPS trace, label that limitation. A smaller truthful launch is better than a broad fictional one.

---

## 14. Official reference links

Use current version-matched documentation during implementation; these are starting points, not substitutes for reading the repository.

- Anthropic models: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic effort: https://platform.claude.com/docs/en/build-with-claude/effort
- Claude Code best practices: https://code.claude.com/docs/en/best-practices
- Claude Code workflows: https://code.claude.com/docs/en/common-workflows
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Expo documentation index: https://docs.expo.dev/
- Expo Router: https://docs.expo.dev/router/introduction/
- Expo push notifications: https://docs.expo.dev/push-notifications/overview/
- Expo location: https://docs.expo.dev/versions/latest/sdk/location/
- EAS Build: https://docs.expo.dev/build/introduction/
- EAS Update: https://docs.expo.dev/eas-update/introduction/
- AWS Fargate: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html
- Amazon RDS PostgreSQL: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
- PostGIS: https://postgis.net/documentation/
- Amazon S3 security: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security.html
- AWS Backup/restore guidance: https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html
- OpenStreetMap copyright/data use: https://www.openstreetmap.org/copyright
- OSRM documentation: https://project-osrm.org/docs/v5.24.0/api/

**End of handoff.**
