# Fastship backend and AWS production architecture handoff

**Research date:** 13 November 2026  
**Target Region:** `eu-north-1` (Stockholm)  
**Scope:** research and implementation handoff only. No application code, AWS configuration, credentials, paid infrastructure, service activation, or deployment was changed. No AWS calls were made.

## 1. Executive recommendation

Fastship already has a substantial transactional backend. The production path should preserve its state machine, PostgreSQL transactions, row locks, optimistic versions, assignment epochs, command fingerprints, per-order event sequences, and outbox leases. Do **not** replace it with a new event-driven, serverless, or microservices stack.

Use this initial production shape:

- **Compute:** one container image on **Amazon ECS with AWS Fargate**, behind an **Application Load Balancer (ALB)**. Run the API and outbox worker as separate ECS services using the same image. Fargate is available in Stockholm; App Runner is not a suitable substitute because its documented endpoints do not include `eu-north-1`.
- **Database:** **Amazon RDS for PostgreSQL with PostGIS**, with a private subnet placement, encryption, automated backups/PITR, and a deliberately small connection budget. Use Multi-AZ for production availability if the approved SLO and budget require it; use a cheaper single-AZ topology in non-production.
- **Objects:** private **Amazon S3** storage for proofs and documents, with PostgreSQL retaining object metadata, authorization, lifecycle, and scan state. This requires a real storage transport: the current non-test implementation is explicitly unwired.
- **Notifications:** retain **Expo Push** initially. Add durable ticket/receipt processing and token cleanup; do not treat an Expo ticket as device delivery. Do not add SNS/APNs/FCM infrastructure without measurements showing a need.
- **Realtime:** retain the current cursor/epoch protocol and client transports. Before running multiple API tasks, replace process-local waiters with a shared mechanism. The smallest candidate is PostgreSQL `LISTEN`/`NOTIFY` used only as a wake-up hint while database cursors remain authoritative. A single API task is a temporary availability trade-off, not proof of multi-instance correctness.
- **Deployment:** GitHub Actions builds an immutable image, pushes it to **Amazon ECR**, runs migrations as a controlled one-off task, deploys staging, then promotes with a production approval. Use ECS deployment circuit breaker rollback and EAS Build/Update for the mobile app as a separate release lane.
- **Observability and security:** structured stdout logs to CloudWatch, ECS/ALB/RDS metrics plus domain-specific alarms, private networking, least-privilege task roles, secrets injected from Secrets Manager, TLS, and WAF/rate controls selected from measured abuse.
- **Defer:** Cognito migration, Redis/ElastiCache, SQS/SNS/EventBridge event architecture, Kinesis, managed WebSockets/API Gateway, OpenSearch, a dedicated analytics platform, RDS Proxy, and multi-region DR. None is required for the first safe cutover.

This is an **infrastructure migration plus production-hardening project**, not a backend rewrite. The largest blockers are correctness and operability, not AWS service selection.

## 2. What is fact, recommendation, or unknown

### 2.1 Repository facts

The current source, not old deployment documentation, is the authority for these findings:

- `server/main.ts` exposes JSON API routes, authentication, realtime endpoints, diagnostics, readiness, maintenance, and shutdown behavior.
- `server/db/runtime.ts` defaults to SQLite and explicitly gates PostgreSQL use in test/staging; production PostgreSQL is not simply enabled by supplying a production URL.
- `server/db/postgres-schema.ts` contains an explicit migration runner through schema version 29 and PostGIS initialization.
- `server/db/persistence.ts` supplies transaction boundaries, retry behavior, PostgreSQL row locking, pool limits, and commit semantics.
- `server/domain/commands.ts` implements command fingerprints, replay authorization checks, row locks, and optimistic versions.
- `server/domain/dispatch.ts` implements dispatch rounds/offers, PostGIS shortlists, transactional acceptance, assignment epochs, and expiry.
- `server/domain/realtime.ts` implements credentials, cursors, epochs, shared-secret requirements, and transport gates, but live waiters are process-local.
- `server/worker.ts` leases PostgreSQL outbox rows and performs Expo/web-push delivery. Provider push errors can be logged while the generic outbox item is still treated as published; there is no Expo receipt processor.
- `server/domain/private-objects.ts` provides metadata, access grants, read tokens, retention, and an in-memory test fake. Its production factory explicitly says real Azure Blob wiring is off and supplies no real scanner.
- `server/domain/diagnostics.ts` provides redacted structured errors and correlation IDs.
- `Dockerfile` builds a Node 24 production image and includes a readiness health check.
- `.github/workflows/ci.yml` runs tests, Expo export checks, PostgreSQL/PostGIS CI, and builds a container image, but does not publish a release image.
- `app.config.js` and `eas.json` contain Expo/EAS configuration and production URL guards.
- `scripts/phone-test-server.mjs` is an isolated SQLite physical-device QA sandbox, not the production backend. `scripts/check-phone-tests.mjs` records ADB-based checks.

Azure/Railway deployment artifacts and README statements may lag the source. Their existence does not prove a live Azure database, live object storage, or a production traffic profile.

### 2.2 Recommendations

Every AWS service, migration sequence, alarm, SLO, backup schedule, and release gate below is a recommendation. It is not a claim that the resource already exists or that the repository currently implements it.

### 2.3 Unresolved inputs that must not be invented

Resolve these during discovery before sizing or cutover:

1. Whether any production environment currently serves real users, and where its authoritative data resides.
2. Current request rate, concurrent realtime connections, order/event volume, location update rate, outbox throughput, proof sizes/counts, and database size/growth.
3. Production SLOs: API availability/latency, dispatch latency, realtime staleness, notification latency, and recovery objectives.
4. Legal/business retention and deletion requirements for sessions, locations, proofs, notifications, audits, payment metadata, and logs.
5. Domain/DNS ownership, email sender/provider, payment-provider selection, routing/geocoding provider and its permitted deployment/caching terms.
6. Expo/EAS project ownership, signing credentials, release channels, and app-store release process.
7. Current AWS plan, supported services, budgets/spend limit, and acceptable running cost. No account state was inspected.
8. Region-wide outage RTO/RPO. The current project constraint prohibits cross-Region replication and therefore cannot provide normal cross-Region DR without an explicit changed decision and any required AWS capability activation.
9. Exact RDS PostgreSQL/PostGIS versions. CI currently uses `postgis/postgis:18-3.6`; select versions from the then-current RDS support matrix and mirror them in CI rather than assuming this image matches RDS.

## 3. Current architecture and production gaps

| Area | What exists | Production consequence |
|---|---|---|
| API/domain | TypeScript Node service, transactional order/dispatch/payment command model | Retain it; do not split by endpoint. |
| Persistence | SQLite default plus extensive PostgreSQL schema and CI | Remove the production PostgreSQL gate deliberately and test the real RDS version before cutover. Production also has an unconditional `DB_PATH` requirement that must be reconciled with PostgreSQL configuration. |
| Consistency | Row locks, optimistic versions, assignment epochs, command fingerprints, order sequences | These are core invariants. Load tests must prove they survive retries and concurrent requests. |
| Outbox/worker | Leased PostgreSQL work, bounded generic retries, Expo/web-push delivery | Keep leasing. Separate durable provider ticket/receipt state from generic publication state. |
| Realtime | SSE/WebSocket-style transport gates, shared-secret requirements, cursors and epochs | Process-local waiters miss cross-task wake-ups. Cursor replay must remain the source of truth. |
| Email codes | Per-process HMAC key behavior | Multiple tasks can invalidate one another's codes. Use one stable, shared, rotated secret with safe overlap. |
| Proofs/documents | Authorized metadata/read grants and fake test transport | Implement S3 transport and actual malware scanning before calling uploads production-ready. |
| Maintenance | In-process periodic jobs and process-local timers | Multiple tasks duplicate jobs. Consolidate into the worker or a single scheduled task with idempotent execution. |
| Readiness | Storage/schema-oriented check | Add explicit checks for migration compatibility and required runtime configuration. Avoid making transient third-party push/routing outages stop all API tasks. |
| Notifications | Expo ticket creation | Tickets are not delivery receipts. Persist provider responses, poll receipts, retry transient errors, and disable invalid tokens. |
| Deployment | Docker and CI validation; non-AWS artifacts | Add ECR publishing, ordered migration, staged ECS deployment, smoke tests, and rollback. |
| Mobile QA | Physical-device scripts and an isolated SQLite sandbox | Sandbox success does not validate ECS/RDS/S3, push receipts, or multi-instance behavior. |

## 4. Target architecture

```text
Android/iOS app (EAS Build; Expo updates only within runtime compatibility)
        | HTTPS / SSE or WebSocket
        v
Route 53 (optional/simple DNS) -> ALB (public subnets, TLS, optional WAF)
                                      |
                                      v
                         ECS/Fargate API service
                         private subnets; no public IP
                           |             |
                           |             +--> S3 private proofs/documents
                           |             +--> Expo/routing/payment/email via egress
                           v
                 RDS PostgreSQL + PostGIS
                 private subnets, backups/PITR
                           ^
                           |
                  ECS/Fargate worker service
                  outbox, receipts, maintenance
                           |
                           +--> Expo push ticket/receipt APIs

ECR: immutable container images
Secrets Manager: runtime secrets injected by ECS
CloudWatch: logs, metrics, alarms, dashboards
AWS Backup (optional centralized policy): RDS/S3 backup governance
GitHub Actions: validation -> image -> migrate -> staging -> approved production
EAS: native builds and compatible OTA JavaScript releases, separately from backend
```

### 4.1 Network and identity

- Use the project Region `eu-north-1` for all Regional resources. Do not create Lambda, API Gateway, RDS, ECS, or other Regional resources elsewhere. Do not use Lambda@Edge or CloudFormation StackSets.
- Put ALB nodes in public subnets across at least two Availability Zones; run Fargate tasks and RDS in private subnets. Security groups should permit only ALB-to-API traffic, API/worker-to-database traffic on PostgreSQL, and required egress. The worker should not be internet-accessible.
- Use separate ECS task execution and task roles. Execution roles pull ECR images and inject secrets; task roles receive only the S3/KMS/CloudWatch permissions that component needs. API and worker roles should differ where practical.
- Private tasks need controlled egress for Expo, email, routing/geocoding, payments, and AWS APIs. NAT gateway hours/data and VPC endpoint charges must be included in the cost model. Do not expose the database to obtain simpler networking.
- Store the database password, session/email-code keys, realtime secret, Expo access token, web-push keys, payment secrets, and object-encryption key references in Secrets Manager or an approved equivalent. Inject them as ECS secrets rather than image layers, source, task-definition plaintext, or Expo client constants.
- Terminate public TLS at ALB and require TLS to RDS and third-party APIs. Keep S3 Block Public Access enabled and deny public ACLs/policies.

### 4.2 ECS/Fargate services

Use one repository image with two runtime commands:

1. **API service:** HTTP, auth, commands, queries, realtime, and object routes.
2. **Worker service:** outbox leases, Expo ticket/receipt processing, retries, expiry/reconciliation/cleanup after those timers are removed from API replicas.

Start with small tasks and a deliberately bounded database pool; the current persistence layer already has pool bounds. Scale from observed CPU, memory, request latency, connection saturation, and outbox age—not from an arbitrary desired count.

**Important launch gate:** until shared realtime wake-ups and shared email-code secrets are implemented and tested, run only one API task. A single task still gets rolling replacement and can be rescheduled, but it is not highly available. After the blockers are fixed, two tasks across AZs are a reasonable production baseline if the SLO requires them.

Use ALB health checks, graceful SIGTERM/draining, adequate stop timeout, and ECS deployment circuit breaker with automatic rollback. Readiness must fail for an incompatible schema or missing required secret/configuration. It should not couple core API availability to an occasional Expo or routing-provider failure.

Do not let every API replica race schema migrations on startup. Run the migration command once as a controlled deployment step, then start code compatible with that schema.

### 4.3 RDS PostgreSQL/PostGIS

- Keep all order, dispatch, session, command, event, outbox, notification, and object metadata in PostgreSQL. PostGIS remains the dispatch/geo query engine.
- Select a supported PostgreSQL major and PostGIS combination, install/verify the extension using RDS's PostGIS administration guidance, and run the same major/extension in CI and device QA.
- Use encryption at rest, automated backups, and point-in-time recovery. Set the backup window and retention from business requirements; do not assume the default retention is sufficient.
- Use Multi-AZ for production when availability requirements justify its cost. A standby is for failover, not a read-scaling pool, and Multi-AZ does not remove the need for backups.
- Restoration creates a **new** DB instance. Restored data can be lazy-loaded from storage, so post-restore latency must be measured during drills. A backup existing is not a recovery test.
- Keep pool sizes low and calculate `API tasks × pool maximum + worker + migration/admin headroom` before increasing task counts. Add RDS Proxy only if measured connection churn or scaling proves it necessary.
- Do not use cross-Region replicas, S3 replication, multi-Region KMS keys, or Route 53 cross-Region routing under the current project constraints.

### 4.4 S3 proofs and documents

Preserve the existing metadata and authorization model, but implement a real S3 transport:

1. Create a private, encrypted bucket with blocked public access and explicit retention/lifecycle rules only after legal retention is decided.
2. Store objects under unpredictable keys tied to the internal object ID, not user-controlled paths. Keep order ACL/read-grant checks in the backend; S3 bucket policy is not a substitute for order authorization.
3. Record upload size, checksum/content type, storage key, scan state, retention state, and deletion state in PostgreSQL. Treat declared MIME type as untrusted.
4. Quarantine new content until a real malware-scanning result allows release. Deny read tokens/content for failed or pending scans according to policy. A fake scanner is acceptable only in tests.
5. For the smallest compatible first implementation, stream through the existing backend routes to S3. Add presigned direct uploads/downloads later if payload size, task memory, or ALB/Fargate bandwidth proves proxying inadequate. Presigning does not bypass authorization, scan, or completion checks.
6. Test range/partial downloads if mobile proof viewing needs them, and test deletion/lifecycle behavior against audit/legal holds.

S3 is preferred here because the current private-object production route has no real Azure Blob transport. This is not a claim that S3 automatically supplies malware scanning or application authorization.

### 4.5 Realtime and location tracking

Retain cursors, per-order sequence numbers, assignment epochs, and replay authorization. They are more valuable than the choice of socket transport.

- Treat `LISTEN`/`NOTIFY`, if selected, only as a low-latency hint. A missed notification must be repaired by cursor catch-up/reconnect and periodic reconciliation. Never make a transient pub/sub message the only copy of a domain event.
- Configure ALB idle behavior and application heartbeat intervals for SSE/WebSockets; test through the ALB rather than only against localhost. Load-balancer stickiness is not a correctness fix.
- Preserve server-side location validation, freshness, sequencing, actor/order authorization, and throttling. Do not accept a client's distance, arrival, or completion assertion without server checks.
- Measure location write amplification and realtime fan-out before introducing Redis, Kinesis, or API Gateway WebSockets. Start with PostgreSQL and add infrastructure only for a measured bottleneck.

### 4.6 Dispatch and payments

- Keep dispatch shortlist, offer creation, acceptance, expiry, and assignment epoch checks in database transactions. Multiple workers/tasks must not produce two active assignments for one order.
- Test expired offers against concurrent acceptance, repeated client retries, worker retries, and deployment rollbacks.
- Keep payment reconciliation idempotent and separate from client success screens. A provider webhook or redirect is not proof of settlement until verified according to the selected provider's contract.
- Payment-provider credentials, webhook verification, reconciliation schedules, and manual exception handling remain gaps until the provider is chosen.
- Route/geocode calls should be behind the existing domain boundary with timeouts, bounded retries, and observable failure. Confirm provider terms before caching coordinates or routes in PostgreSQL/S3.

### 4.7 Notifications

Expo's current SDK 57 guidance distinguishes a **push ticket** from a **push receipt**. A ticket confirms Expo accepted a message; it does not prove APNs/FCM or the device delivered it. Expo also documents no SLA for its push service.

Implement this lifecycle before relying on notifications for production operations:

1. Register tokens only in a development/production build as supported by the selected SDK; do not depend on Expo Go for remote Android push.
2. Send with a short timeout and record each message's token, ticket ID, provider response, attempt, and next retry time in durable storage.
3. Do not mark a provider failure as permanently published merely because the generic outbox lease completed. Retry transient send errors with capped exponential backoff and jitter; preserve a terminal/dead-letter state for operator review.
4. Poll receipts after the documented delay, continue retrying receipt retrieval on `DeviceNotRegistered`-independent transient errors, and record receipt details.
5. On `DeviceNotRegistered`, stop sending to and deactivate/remove that token. Do not repeatedly retry delivery to it.
6. Keep order/dispatch state independent of push success. Notifications are hints; clients must recover authoritative state through API queries/cursor replay.
7. Measure ticket latency, receipt latency, invalid-token rate, provider error rate, and oldest undelivered notification before considering direct FCM/APNs or SNS.

The installed `expo-notifications` version is `~57.0.24` in `package.json`; a documentation example showing `~57.0.25` is not a completed upgrade. Use `npx expo install` when an actual later task changes SDK-compatible dependencies.

## 5. Authentication and authorization

**Do not couple Cognito adoption to the AWS cutover.** Existing session/auth behavior is deeply connected to API authorization and mobile flows. Moving it at the same time would add a second failure domain without solving the immediate hosting problems.

Before multi-instance launch:

- Make email-code HMAC state stable and shared across tasks. Rotation needs a controlled overlap or deliberate invalidation; never generate an independent random key per process.
- Keep session/token secrets shared and rotatable, and confirm logout/password/email change invalidation requirements with two real sessions.
- Preserve command replay authorization checks: an idempotency fingerprint must not let a different actor replay another actor's result.
- Recheck actor, role, order, and current version inside each transactional command. Do not rely only on route-level role checks.
- Review ALB/proxy IP handling before applying IP throttles; otherwise all clients may appear as the load balancer or spoof forwarded headers.
- Add edge/body/upload limits and rate controls based on measured endpoints. WAF managed rules can help common web attacks but do not replace object-level authorization or business-rate limits.

Evaluate Cognito later only if there is a concrete requirement for managed federation, MFA, or user administration. Such a project needs token/session mapping, migration, logout/revocation, mobile UX, rollback, and authorization tests of its own.

## 6. Analytics, observability, and audit

### 6.1 Start with existing logs and domain metrics

Send structured, redacted stdout/stderr to CloudWatch Logs. Preserve correlation IDs from diagnostics. Never log session tokens, authorization headers, email codes, Expo tokens, proof bytes, precise location payloads, or payment secrets.

Create alarms for actionable symptoms:

- ALB 5xx, target unhealthy count, request latency, and connection errors.
- ECS desired/running mismatch, CPU/memory, restart loop, deployment failure, and rollback.
- RDS free storage, CPU, memory, connections, replica/failover state where applicable, and backup failures.
- Database deadlock/serialization retries, pool saturation, migration version mismatch, and long transactions.
- Outbox depth and **oldest lease age**, repeated retry/dead-letter count, dispatch-offer expiry lag, payment reconciliation exceptions, and stale maintenance runs.
- Realtime connections, reconnect/cursor replay failures, epoch conflicts, and cross-instance delivery latency.
- Push ticket/receipt failures, `DeviceNotRegistered` rate, and notification age.
- Object upload failures, quarantine age, scanner failures, and unauthorized read denials.

Use traces (AWS X-Ray/OpenTelemetry) only when logs/metrics cannot localize a measured latency problem. Do not make a tracing rollout a launch dependency.

### 6.2 Product analytics

Initially derive privacy-reviewed operational reports from PostgreSQL read-only queries/replicas only if needed. Avoid running heavy exports against the primary. Define events such as order created, offer sent/accepted/expired, delivery completed, proof accepted, and notification invalidated with stable schema versions.

Defer a dedicated event pipeline, Redshift, Kinesis, or third-party product analytics until event volume and questions are known. Location and proof data need explicit minimization and retention; analytics is not a reason to copy everything indefinitely.

## 7. Backup, recovery, and DR

Define separate objectives for:

- accidental row/object deletion;
- bad migration or deployment;
- database instance/AZ failure;
- accidental secret or configuration loss;
- entire `eu-north-1` outage.

Recommended baseline:

- RDS automated backups/PITR with approved retention, plus AWS Backup policies/vault controls if centralized governance is required.
- S3 versioning or object-lock/lifecycle controls only after deletion/legal requirements are decided. Versioning is not a substitute for retention policy and can increase storage cost.
- Infrastructure/task definitions, migration versions, EAS runtime/channel mapping, and recovery runbooks stored in source/release records; secrets recoverable through the approved secret-management process.
- Quarterly restore exercises into a **new isolated RDS instance**, schema/invariant checks, representative S3 restoration, and a timed application smoke test. Record actual RTO and data-loss window/RPO.
- Deployment rollback is not a database rollback. Use backward-compatible expand/contract migrations and tested forward repair.

**Constraint:** same-Region backups and Multi-AZ address host/AZ failures, not loss of the entire Region. Because cross-Region replication and routing are prohibited for this project, region-outage recovery remains an accepted risk or an unresolved owner decision. Do not claim multi-region DR in the architecture.

## 8. CI/CD and mobile release strategy

### 8.1 Backend pipeline

Recommended GitHub Actions flow:

1. **Pull request:** lint, typecheck, unit/integration tests, PostgreSQL/PostGIS suite, Expo export checks, and Docker build as today.
2. **Main/release:** build once, tag with immutable commit SHA, scan according to repository policy, push to ECR.
3. **Staging:** deploy the exact image, run backward-compatible migration as a one-off task, run API/domain/realtime/S3 smoke tests.
4. **Production approval:** run/preflight migration, update API and worker services to the same approved image, wait for ECS stable/circuit-breaker result, then run smoke tests.
5. **Rollback:** roll back task definitions through ECS circuit breaker or the previous compatible task definition. Never erase new schema/data to make an old image start.

Keep release evidence: commit, image digest, migration version, task-definition revisions, test result, approval, and app runtime/channel compatibility.

### 8.2 Expo/EAS

- Keep EAS Build for native/signing changes and EAS Update for compatible JavaScript/assets. An update must target the same runtime version; native dependency/config changes require a new build.
- Use distinct development, preview/staging, and production environment/channel configuration. `app.config.js` production URL guards should fail a mismatched build rather than silently point production at QA.
- Public app configuration and Expo config are visible to clients; never place AWS secret keys, Expo push access tokens, database URLs, or signing material there.
- Do not use an OTA update as the backend database cutover mechanism. Coordinate mobile API compatibility across old and new app versions.
- Verify EAS pricing/limits separately; they are not included in AWS cost estimates.

## 9. Testing and physical-device acceptance

### 9.1 Automated gates

At minimum, retain and extend tests for:

- command fingerprint reuse, conflicting payload, different actor replay, optimistic version conflict, and transaction retry;
- two couriers accepting/expiring the same offer, assignment epoch fencing, and per-order event sequence uniqueness;
- outbox lease contention, worker crash after provider send, bounded retry, terminal/dead-letter behavior, and reconciliation;
- realtime cursor replay, epoch changes, missed wake-up recovery, and two API tasks receiving writes through the other task;
- email-code verification through two API tasks and controlled secret rotation;
- S3 upload/read authorization, scan pending/reject, object deletion/retention, and malformed/oversized content;
- Expo send error, ticket retry, delayed receipt, transient receipt error, and `DeviceNotRegistered` token cleanup;
- migration from a representative previous production snapshot, rollback-compatible application behavior, and RDS restore invariants.

Run concurrency tests against actual PostgreSQL/PostGIS, not only SQLite or in-memory fakes.

### 9.2 Required physical-device QA

Follow the repository rule: use the connected physical Android phone (`SM-A5360`, ADB serial `R5CTB0FJP9Z`); never substitute an emulator. If it is unavailable, stop and ask. Keep the phone backend on `adb reverse` for the isolated QA sandbox and do not clear the phone's Chrome profile. Run heavy tests/GPU work on `k5` only when its authorized SSH access is restored; otherwise label local evidence honestly.

Add a separate staging-backend device suite so the SQLite sandbox is not mistaken for AWS validation:

1. Install an EAS development/preview build on the physical phone; confirm it reaches staging through the intended HTTPS URL rather than `adb reverse`.
2. Register/login, verify an email code through different API tasks, expire/revoke a session, and test offline reconnect.
3. Create/accept/expire orders with two actors, reject stale commands, and verify map/tracking recovery after backgrounding, process death, network switching, and ALB/task replacement.
4. Exercise SSE/WebSocket and fallback behavior through ALB, including cursor catch-up after a missed event.
5. Upload real camera/gallery proofs, verify quarantine/read denial and authorized playback/download on a second device/role.
6. Receive push in foreground/background/killed states; verify ticket and receipt records and simulate invalid-token cleanup. Do not claim visual delivery from a ticket alone.
7. Test old app versus new backend and new app versus previous compatible backend during rolling deployment/rollback.
8. Capture ADB evidence, correlation IDs, build/runtime/channel, image digest, database migration version, and exact unresolved failures.

If the configured `k5` keys remain refused, the owner must supply an authorized account/key before claiming remote-only evidence.

## 10. Prioritized implementation path

### P0 — Discovery and correctness before production

- Inventory actual live environments/data and approve SLO, retention, provider, domain, budget, and DR inputs.
- Enable/configure PostgreSQL production runtime intentionally; remove contradictory `DB_PATH` behavior and externalize migration execution.
- Make email-code and realtime secrets shared/stable; fix cross-instance realtime and duplicate maintenance timers or cap API at one task until fixed.
- Implement durable Expo ticket/receipt states, transient retries, and invalid-token cleanup.
- Implement S3 transport, quarantine/scanner integration, and production object lifecycle policy.
- Add multi-instance, migration, concurrency, and failure-injection tests.
- Select RDS/PostGIS versions and reproduce them in CI.

**Exit gate:** no known process-local correctness blocker; representative backup restores and concurrency tests pass; all required secrets/providers have owners.

### P1 — Repeatable AWS staging and production

- Create the VPC/network, ECR, RDS, S3, ECS API/worker, ALB, secrets, logs, alarms, and backup policies in `eu-north-1` using the repository's chosen IaC approach after a separate design review.
- Build the ECR/ECS pipeline, one-off migration step, staging environment, manual production approval, circuit-breaker rollback, and smoke tests.
- Establish load/connection baselines and cost measurements. Scale API beyond one task only after P0 multi-instance acceptance.
- Perform data cutover with one authoritative writer. If a real legacy dataset exists, use a rehearsed maintenance-window export/transform/import that preserves IDs, timestamps, sequences, object keys, and command/outbox semantics; validate counts and invariants before DNS switch. Do not improvise dual writes.
- Keep rollback DNS/routing and legacy data preservation for an agreed observation window, subject to retention policy.

**Exit gate:** staging and physical-device suites pass; production smoke/alarms/restore/runbooks pass; measured cost is approved; owner explicitly accepts Region-outage risk.

### P2 — Optimize only from evidence

- Increase API/worker scaling, tune RDS/storage/pools, add presigned object transfer, or introduce RDS Proxy if measurements justify them.
- Add tracing, analytics exports, WAF tuning, direct push providers, Redis, queues/streams, or Cognito only as separately scoped projects with acceptance tests.
- Revisit cross-Region DR only if project constraints and required AWS capabilities change.

## 11. Cost model without invented numbers

No exact dollar estimate is defensible until workload and current Stockholm pricing are measured. Use the current AWS Pricing Calculator/pricing pages and record pricing date, Region, architecture (x86/Arm), utilization, data transfer, taxes/support, and free/paid plan eligibility.

| Cost driver | Inputs to measure |
|---|---|
| Fargate API/worker | Tasks, vCPU/GB, hours, OS/architecture, scaling schedule |
| ALB | Hours, new/active connections, processed bytes, rule evaluations/LCU |
| Networking/NAT/endpoints | NAT hours/GB, endpoint hours/GB, internet and inter-AZ transfer |
| RDS | Instance class/AZ count, storage type/GB, provisioned IOPS if any, backup storage, data transfer |
| ECR | Image storage and transfer; prune untagged images under a safe policy |
| S3/KMS | Object GB, requests, retrieval/lifecycle, versioning, key/request usage |
| CloudWatch | Log ingestion/GB, retention, custom metrics, alarms, dashboard/Container Insights choices |
| Secrets Manager/WAF/Route 53 | Secret count, web ACL/rule/request usage, hosted zones/queries/health checks |
| AWS Backup | Protected storage, vault/restore/test usage, retention |
| Expo/EAS and third parties | Separate build/update, email, routing, payment, and scanning charges |

Start with a small staging topology and avoid always-on duplicate production scale. Set budget alerts in AWS Billing and Cost Management and check project spend status in **AWS Settings > Billing**. If previously working operations suddenly return Access Denied, check whether a project spend limit paused resources. No resources were created here, so there is nothing from this research to clean up.

## 12. Launch decision checklist

Do not declare production readiness until every applicable answer is evidenced:

- [ ] PostgreSQL production runtime and one-off migrations are implemented and tested against the chosen RDS/PostGIS versions.
- [ ] Multi-instance email/realtime/maintenance behavior passes, or an explicit single-task limitation is accepted.
- [ ] Dispatch, idempotency, event sequence, outbox, and payment invariants pass concurrency/failure tests.
- [ ] S3 objects are private, authorized, scanned, retention-controlled, and recoverable.
- [ ] Expo tickets and receipts are distinguished; transient retries and invalid-token cleanup are proven.
- [ ] ALB/ECS rolling deploy, drain, circuit-breaker rollback, and old/new app compatibility pass.
- [ ] Logs contain no credentials/sensitive payloads; alarms have owners and runbooks.
- [ ] PITR/object restore drills meet approved RTO/RPO; Region-outage limitation is explicitly accepted.
- [ ] Physical Android staging evidence covers auth, tracking, dispatch, proofs, notifications, reconnect, and rollback.
- [ ] Current Stockholm cost model, budget alerts/spend status, retention, domain, providers, and operational ownership are approved.

## 13. Official documentation consulted

These public official pages were checked directly during this research. Repository facts above come from the listed source files, not these documents.

### Compute, deployment, and networking

- AWS Fargate Region availability: <https://docs.aws.amazon.com/general/latest/gr/fargate.html>
- App Runner endpoints/Regions: <https://docs.aws.amazon.com/general/latest/gr/apprunner.html>
- ECS deployment circuit breaker and rollback: <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html>
- ALB target health checks: <https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html>

### Database, backup, and DR

- RDS automated backups/PITR: <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html>
- Restoring an RDS snapshot to a new instance and lazy loading: <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html>
- RDS Multi-AZ guidance: <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html>
- RDS PostGIS administration: <https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html>
- AWS Backup: <https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html>
- AWS disaster-recovery strategies: <https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html>

### Security and storage

- S3 Block Public Access: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html>
- ECS task IAM roles: <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html>
- ECS secrets injection: <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-secrets.html>
- AWS WAF: <https://docs.aws.amazon.com/waf/latest/developerguide/what-is-aws-waf.html>

### Expo/EAS

- Expo SDK 57 notifications: <https://docs.expo.dev/versions/v57.0.0/sdk/notifications/>
- Expo push notification setup: <https://docs.expo.dev/push-notifications/overview/>
- Expo push tickets and receipts: <https://docs.expo.dev/push-notifications/sending-notifications/>
- Expo push service/SLA and receipt behavior: <https://docs.expo.dev/push-notifications/faq/>
- EAS Build: <https://docs.expo.dev/build/introduction/>
- EAS Update and runtime compatibility: <https://docs.expo.dev/eas-update/introduction/>
- EAS environment variables: <https://docs.expo.dev/eas/environment-variables/>
- EAS workflows/CI: <https://docs.expo.dev/eas/workflows/>

### Pricing dimensions

- Fargate pricing: <https://aws.amazon.com/fargate/pricing/>
- RDS for PostgreSQL pricing: <https://aws.amazon.com/rds/postgresql/pricing/>
- S3 pricing: <https://aws.amazon.com/s3/pricing/>
- CloudWatch pricing: <https://aws.amazon.com/cloudwatch/pricing/>
- AWS Pricing Calculator: <https://calculator.aws/>

---

**Bottom line:** Fargate + RDS/PostGIS + S3 + the existing transactional backend is the smallest credible production direction. The launch gate is not creating AWS resources; it is proving multi-instance correctness, durable notification handling, private object transport/scanning, repeatable migrations, restore drills, and physical-device behavior.
