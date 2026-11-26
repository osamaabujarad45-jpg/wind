# Fastship / Wind repository functionality audit

**Audit date:** 2026-11-13  
**Method:** read-only inspection of current source, migrations, tests, scripts, CI and infrastructure. Historical reports are secondary evidence. No live service, provider, deployment or device was tested.

## 1. Executive assessment

Wind is a substantial Expo/React Native delivery application with customer, driver and administrator experiences, public help/tracking, a Node HTTP API, local email/password and optional Entra authentication, SQLite/PostgreSQL persistence, integration adapters and integration tests.

Implementation is not the same as activation:

- PostgreSQL is deliberately gated; `WIND_DATABASE_URL` alone does not authorize a loopback development API to use it (`server/db/runtime.ts:4-26`). API startup does not automatically apply PostgreSQL migrations.
- Payments/COD have real server logic, but only the test payment provider is wired; non-test provider operations return `409 payments_unavailable` (`server/domain/payments.ts:28-48,192-203`).
- SMS, native Expo push, Web PubSub and private-object storage have independent configuration gates. Azure Blob configuration alone does not wire a production object store/scanner (`server/domain/private-objects.ts:41-50,152-156`).
- The mobile API client implements journey polling/long-poll recovery, not a Web PubSub connection using the issued realtime credentials.
- Bicep workloads default off; deployment definitions do not prove deployed resources or runtime readiness (`infra/main.bicep:10-15,319-327,343-415,468-469`).

The upgrade should preserve the working role/order/journey behavior, migrate persistence separately, and activate each provider only with fresh staging evidence.

## 2. Expo application inventory

The actual route tree contains the following screens. `(customer)` is an Expo route group and does not add a URL segment.

| Route/file | Access and functionality |
|---|---|
| `src/app/_layout.tsx` | Root navigator, session/copy/providers and route composition. |
| `src/app/(customer)/_layout.tsx` | Three customer tabs: home, orders, account (lines 4-10). |
| `src/app/(customer)/index.tsx` | Customer home/booking entry. |
| `src/app/(customer)/orders.tsx` | Customer order history. |
| `src/app/(customer)/account.tsx` | Customer account/preferences. |
| `src/app/welcome.tsx` | Public welcome/onboarding. |
| `src/app/auth.tsx` | Registration/login/recovery UI. |
| `src/app/book.tsx` | Quote, route and booking workflow. |
| `src/app/order/[id].tsx` | Order detail/live journey/actions. |
| `src/app/receipt/[id].tsx` | Receipt view. |
| `src/app/profile.tsx` | Shared profile/account editing. |
| `src/app/roads.tsx` | Road status/reporting. |
| `src/app/help.tsx` | Public/help information. |
| `src/app/track/[token]` | Public token-based tracking. |
| `src/app/driver/_layout.tsx` | Four tabs: jobs, trips, earnings, account (lines 4-11). |
| `src/app/driver/index.tsx` | Jobs/available work. |
| `src/app/driver/trips.tsx` | Assigned/active trips. |
| `src/app/driver/earnings.tsx` | Earnings/cash presentation. |
| `src/app/driver/account.tsx` | Driver account/duty/preferences. |
| `src/app/admin/_layout.tsx` | Six registered screens, five visible tabs; `cash` is hidden from the bar and sits under Settings (lines 7-16). |
| `src/app/admin/index.tsx` | Dashboard/stats. |
| `src/app/admin/orders.tsx` | Order administration. |
| `src/app/admin/users.tsx` | User/driver approval and management. |
| `src/app/admin/cash.tsx` | Cash/remittance operations. |
| `src/app/admin/subscriptions.tsx` | Subscription administration. |
| `src/app/admin/settings.tsx` | Settings and operational controls. |
| `src/app/admin/account.tsx` | Admin account screen, outside the primary tab list. |

Authentication is not merely a seeded admin token: current source has register/login, email verification/reset, bearer sessions, account deletion, and `/api/auth/entra`. Entra/provider activation and production email delivery are deployment questions, not established by the route alone.

## 3. Complete HTTP route registration matrix

This section enumerates all **178** `route(...)` registrations: **90 in `server/main.ts` and 88 in `server/domain/`**. Regex paths are retained exactly. Unless marked public/partner, routes pass the application authentication/authorization path; role checks inside handlers still apply. “PG” denotes an additional gated persistence requirement, not proof of deployment.

### 3.1 Core API — `server/main.ts` (90)

| Registration(s) | Access / capability |
|---|---|
| `GET /api/health`; `GET /api/ready` | Public health and readiness/protocol inspection (599-621). |
| `GET /api/auth/options`; `POST /api/auth/register`; `POST /api/auth/login` | Public local authentication and registration options (600,622-758). |
| `POST /api/me/email/code`; `POST /api/me/email`; `POST /api/me/email/verify` | Authenticated email change/verification (759-789). |
| `POST /api/auth/reset/code`; `POST /api/auth/reset` | Public password recovery (790-812). |
| `POST /api/auth/logout`; `GET /api/me`; `POST /api/me`; `POST /api/me/password`; `POST /api/me/delete` | Session, profile, password and deletion (813-933). |
| `POST /api/driver/heading` | Driver heading update (822-828). |
| `GET /api/me/places`; `POST /api/me/places`; `DELETE /api/me/places/:id` | Customer saved places (934-985). |
| `POST /api/promos/check`; `GET /api/me/referral` | Customer promotion/referral (986-1040). |
| `GET /api/admin/promos`; `POST /api/admin/promos`; `POST /api/admin/promos/:id/deactivate` | Admin promotions (1041-1052). |
| `GET /api/push/key`; `POST /api/push/subscribe`; `POST /api/push/unsubscribe` | Web-push key/subscriptions; key route public (1167-1181). |
| `POST /api/price` | Authenticated fare quote (1226 onward). |
| `POST /api/orders` | Customer booking, idempotency/replay and dispatch (1511 onward). |
| `GET /api/partner/config`; `POST /api/partner/quotes`; `POST /api/partner/orders`; `GET /api/partner/orders/by-reference`; `GET /api/partner/orders/:id`; `POST /api/partner/orders/:id/cancel` | Partner API with its own request credentials/rules (1586-1660). |
| `GET /api/orders`; `GET /api/orders/:id`; `GET /api/orders/:id/live` | Role-scoped order history/detail/live journey (1661-1708). |
| `POST /api/orders/:id/cancel`; `POST /api/orders/:id/schedule`; `POST /api/orders/:id/rate` | Customer/order lifecycle actions (1709-1777). |
| `POST /api/orders/:id/share`; `POST /api/partner/orders/:id/share`; `POST /api/orders/:id/share/revoke` | Tracking-share creation/revocation (1778-1786). |
| `GET /api/track/([a-f0-9]{64})`; `GET /api/track/([a-f0-9]{64})/live` | Public tracking-token projections (1787-1815). |
| `POST /api/orders/:id/dispute`; `GET /api/admin/disputes`; `POST /api/admin/disputes/:id/resolve` | Customer dispute and admin resolution (1816-1862). |
| `POST /api/orders/:id/sos`; `GET /api/admin/incidents`; `POST /api/admin/incidents/:id/resolve` | Safety incident creation/resolution (1863-1921). |
| `GET /api/orders/:id/messages`; `POST /api/orders/:id/messages` | Participant order messages (1922-1964). |
| `GET /api/roads`; `POST /api/roads/:id/report` | Road list and user reports (1965-1977). |
| `POST /api/admin/roads`; `POST /api/admin/roads/:id/place`; `POST /api/admin/roads/:id/remove` | Admin road closure/placement/removal (1978-2006). |
| `GET /api/jobs`; `POST /api/jobs/:id/accept`; `POST /api/jobs/:id/offer` | Driver jobs, acceptance and offers (2007-2118). |
| `POST /api/orders/:id/offers/:driver/accept`; `POST /api/orders/:id/release`; `POST /api/orders/:id/exception` | Offer selection, release and exception handling (2119-2276). |
| `POST /api/admin/orders/:id/resolve` | Admin order exception resolution (2250-2276). |
| `POST /api/orders/:id/advance`; `POST /api/location` | Driver status/proof advancement and GPS update (2277-2632). |
| `GET /api/route`; `GET /api/track/([a-f0-9]{64})/eta` | Authenticated routing and public tracking ETA (2633-2689). |
| `GET /api/driver/earnings`; `GET /api/driver/cash`; `POST /api/driver/cash/:id/confirm` | Driver earnings/cash confirmation (2690-2749). |
| `GET /api/admin/cash`; `POST /api/admin/cash/remittance`; `POST /api/admin/cash/adjustment` | Admin cash ledger/actions (2750-2808). |
| `POST /api/subscriptions` | User subscription request (2809-2825). |
| `POST /api/admin/orders/:id/proof-reset` | Admin proof reset (2826-2840). |
| `GET /api/admin/stats`; `GET /api/admin/users` | Admin dashboard/user list (2841-2962). |
| `POST /api/admin/users/:id`; `PATCH /api/admin/users/:id`; `POST /api/admin/users/:id/approve`; `DELETE /api/admin/users/:id`; `POST /api/admin/users/:id/password`; `POST /api/admin/users/:id/identity-code`; `POST /api/admin/users/:id/identity-check` | Admin user management, approval and identity checks (2963-3024). |
| `GET /api/admin/subscriptions`; `POST /api/admin/subscriptions/:id` | Admin subscription review (3025-3053). |
| `POST /api/admin/settings` | Admin settings update (3054 onward). |

### 3.2 Domain modules (88)

| Module | Every registration | Role/capability and gate |
|---|---|---|
| `active-gps-routes.ts:2` | `POST /api/location/session` | Driver active-GPS session. |
| `booking-receipts.ts:14` | `GET /api/orders/commands/([^/]+)` | Booking command receipt/idempotent result lookup. |
| `cash-ops.ts:30-37` | `GET /api/admin/cash/pending`; `POST /api/admin/cash/:id/resolve` | Finance/admin cash exceptions. |
| `destination-change.ts:80-170` | `POST /api/orders/:id/destination/quote`; `POST /api/orders/:id/destination/propose`; `POST /api/orders/:id/destination/decision`; `POST /api/orders/:id/destination/withdraw` | Participant destination-change quote/proposal/decision/withdrawal. |
| `dispatch.ts:370-371` | `POST /api/offers/([0-9a-f-]{36})/decline`; `POST /api/orders/:id/dispatch/retry` | Driver offer decline and authorized dispatch retry; PG migration 13. |
| `driver-receipts.ts:9` | `GET /api/orders/:id/actions/([^/]+)` | Driver action receipt lookup. |
| `eligibility.ts:381-572` | `GET /api/driver/eligibility`; `POST /api/driver/eligibility/activate`; `GET /api/admin/eligibility`; `POST /api/admin/eligibility`; `POST /api/admin/eligibility/areas`; `POST /api/admin/eligibility/routes`; `POST /api/admin/eligibility/vehicles`; `PATCH /api/admin/eligibility/vehicles/:id`; `POST /api/admin/eligibility/drivers/:id`; `POST /api/admin/eligibility/checks`; `POST /api/admin/eligibility/orders/:id`; `POST /api/admin/eligibility/orders/:id/recovery` | Driver activation and admin area/route/vehicle/driver/check/order eligibility/recovery. |
| `entra.ts:157-158` | `POST /api/auth/entra` (public); `POST /api/me/delete/challenge` | Entra exchange and reauthenticated deletion challenge; provider configuration separate. |
| `google-routing.ts:262` | `GET /api/route/google` | Guarded/budgeted Google routing proxy; provider activation separate. |
| `ledger.ts:176-181` | `POST /api/orders/:id/cash-receipt`; `GET /api/orders/:id/cash-receipt`; `POST /api/orders/:id/cash-receipt/collect`; `POST /api/admin/ledger/import`; `GET /api/admin/ledger`; `GET /api/driver/ledger` | Cash receipt/collection, legacy import and balances; PG migration 16. |
| `native-push.ts:158-160` | `POST /api/push/native/register`; `POST /api/push/native/unregister`; `POST /api/push/native/preferences` | Native device tokens/preferences; delivery separately flag-gated. |
| `opencode.ts:98-100` | `POST /api/opencode/run`; `GET /api/opencode/([^/]+)`; `GET /api/opencode` | Authenticated AI job run/status/list; provider/runtime activation and authorization need deployment review. |
| `ops.ts:86-94` | `POST /api/support/cases`; `GET /api/support/cases`; `POST /api/support/cases/:id/assign`; `POST /api/support/cases/:id/escalate`; `POST /api/support/cases/:id/resolve`; `POST /api/admin/staff/:id/role`; `POST /api/admin/approvals`; `POST /api/admin/approvals/:id/decide`; `GET /api/admin/staff-actions` | Support case workflow, staff roles, approvals and audit. |
| `payments.ts:194-202` | `POST /api/orders/:id/payments`; `GET /api/orders/:id/payments`; `POST /api/orders/:id/payments/refund`; `POST /api/payments/webhook` (public signature-verified); `POST /api/orders/:id/cod`; `GET /api/orders/:id/cod`; `POST /api/orders/:id/cod/collect`; `POST /api/orders/:id/cod/remit`; `POST /api/orders/:id/cod/resolve` | Intents/refunds/webhook and goods-price COD; PG17, provider/finance gates. |
| `phone-identity.ts:417-424` | `GET /api/phone/capabilities` (public); `GET /api/me/phone`; `POST /api/me/phone/challenges`; `POST /api/me/phone/verify`; `POST /api/auth/phone/recovery/challenges` (public); `POST /api/auth/phone/recovery/verify` (public); `GET /api/admin/phone/review`; `POST /api/admin/phone/mappings` | Phone verification/recovery/review; PG8 plus provider/evidence/budget gates. |
| `presence.ts:186-190` | `GET /api/driver/presence`; `POST /api/driver/presence/online`; `POST /api/driver/presence/offline`; `POST /api/driver/presence/heartbeat`; `POST /api/driver/presence/location` | Driver presence/location; PG9. |
| `private-objects.ts:160-163` | `POST /api/orders/:id/objects`; `GET /api/orders/:id/objects`; `POST /api/orders/:id/objects/([0-9a-f-]{36})/read`; `GET /api/orders/:id/objects/([0-9a-f-]{36})/content` | Order-private upload/list/read grant/content; PG15 and store/scanner wiring. |
| `realtime.ts:137-138` | `GET /api/orders/:id/realtime`; `GET /api/track/([a-f0-9]{64})/realtime` (public token) | Participant/tracking realtime negotiation; PG4 plus Web PubSub gate. |
| `resource-scope.ts:348-352` | `POST /api/orders/:id/scope`; `GET /api/orders/:id/scope`; `POST /api/orders/:id/custody`; `POST /api/orders/:id/pickup-check`; `POST /api/orders/:id/scope/resolve` | Order scope, custody, pickup check and discrepancy resolution; PG15. |
| `ride-lifecycle.ts:272-274` | `POST /api/orders/:id/arrive`; `POST /api/admin/orders/:id/arrival/override`; `POST /api/admin/orders/:id/boarding-reset` | Arrival lifecycle and controlled admin overrides; PG14. |
| `routing-status.ts:7` | `GET /api/admin/routing` | Admin routing-provider status. |
| `runtime-readiness.ts:46-63` | `GET /api/runtime/configuration`; `GET /api/runtime/capabilities`; `POST /api/runtime/diagnostics`; `GET /api/admin/runtime` | Client-safe configuration/capabilities, diagnostics and admin readiness. Metadata does not replace gate inspection. |

## 4. Major workflows and invariants

### Customer, partner and public tracking

- Local/Entra session establishment, saved places, profile/preferences, promotions/referrals, price quote, booking, order history/live journey, cancellation/scheduling/rating, sharing, messages, disputes, SOS and subscriptions are implemented.
- Partner configuration, quote, create, lookup, cancel and share APIs use partner-specific request rules and must not be conflated with customer bearer auth.
- Public tracking/live/ETA/realtime routes are token capabilities and must expose only tracking-safe data.
- Booking replay and command/action receipts protect retries. Preserve idempotency, quote binding, ownership, cancellation rules, event cursors and acknowledgement semantics.

### Driver and dispatch

- Jobs/offers/accept/release, active GPS, eligibility, presence, destination changes, arrival/advance/proof, earnings/cash/ledger and native/web push are implemented across core and domain modules.
- Authentication, eligibility, duty/presence and dispatchability are different states. An eligible or online driver must not bypass order ownership/state checks.
- Preserve driver action receipts, atomic offer acceptance, evidence association, cash idempotency and location accuracy rules.

### Admin and finance

- Admin covers stats, users/approval/identity, orders/incidents/disputes, roads, cash/remittance, subscriptions, promotions/settings, support/staff approvals, eligibility, routing/runtime diagnostics and payment/COD/ledger operations.
- Preserve admin/finance scope checks, approval audit, reconciliation, safe exports where implemented, controlled proof/arrival/boarding resets and private evidence access.

### Payments and COD

`server/domain/payments.ts:157-203` implements goods-price COD create/query/collect/remit/resolve, including idempotency, authorization and reconciliation/settlement behavior. A real PSP is never constructed: the fake requires `NODE_ENV=test` and `WIND_PAYMENTS_TEST_ONLY=1`; otherwise provider operations return unavailable (28-48,192-203). Treat payments as **backend implemented, live provider not activated**, not “COD absent” or “payments shipped.”

## 5. Data model and persistence

### SQLite and domain records

`server/db/sqlite-schema.ts` installs/upgrades the local schema. Current modules persist or project: users/sessions/email/Entra challenges; saved places and referral/promo/subscription records; driver eligibility/identity/presence/location; quotes/bookings/orders/routes/shares; order events/messages/disputes/incidents/destination proposals; jobs/offers/dispatch/receipts; road reports/closures; evidence/private objects/scope/custody; earnings/cash/ledger/COD/payment/refund state; support/staff approvals/audit; notification devices/outbox; settings and runtime diagnostics.

SQLite development support does not imply parity for every additive module. Several domain services explicitly require PostgreSQL.

### PostgreSQL migrations and selection

`server/db/postgres-schema.ts:10-123` explicitly runs versions **3–23 and 25–29**. Version 24 is absent from the current sequence; do not silently renumber migrations. Notable dependencies: 4 durable realtime/outbox, 8 phone, 9 presence, 13 dispatch, 14 ride lifecycle, 15 scope/private objects, 16 ledger, 17 payments/COD, 18+ operations/repairs/additive capabilities.

The migration runner is separate from normal API startup. The standalone worker requires `WIND_DATABASE_URL` and migration 4 (`server/worker.ts:236-245`). Runtime selection is fail-closed for local PostgreSQL except isolated tests or explicit non-loopback staging with `sslmode=verify-full` (`server/db/runtime.ts:4-26`).

No schema-parity, live cutover, rollback, backup or restore test was performed.

## 6. Integrations and activation

| Integration | Source state | Activation/evidence gap |
|---|---|---|
| Routing/maps/Google | Core route/ETA/roads plus guarded Google proxy and routing status | External provider/key/quota/health not tested. |
| PostgreSQL/PostGIS | Explicit schema runner, repositories, worker and persistence tests | Runtime gate, TLS, migration and deployment must be proven independently. |
| Payments | Intent/refund/webhook abstractions, deterministic test fake, COD | No live PSP wired; COD still requires PG and an end-to-end operational flow. |
| Ooredoo / Azure Communication Services SMS | Real REST adapters | PG8, `WIND_PHONE_ENABLED=1`, HMAC/provider settings, approved prefixes/evidence/budget (`phone-provider.ts:8-37`; `phone-identity.ts:32-64`). No live send tested. |
| Expo native push | Token/preferences and worker delivery | Disabled unless `WIND_EXPO_PUSH_ENABLED=1`; disabled attempts retry into operator review (`server/worker.ts:183-201`). |
| Web push | Public VAPID key and subscriptions | Key/service configuration and delivery not tested. |
| Azure Web PubSub | User/share credential negotiation | Endpoint + enable flag + shared secret required, otherwise long-poll (`realtime.ts:51-69`). Client uses long-poll recovery. |
| Azure Blob/private objects | Upload/list/read/content abstractions | Production composition supplies no store/scanner despite configuration detection (`private-objects.ts:41-50,152-156`). |
| Entra/email | Entra exchange, local email verification/reset | Tenant/email delivery configuration and live flows unverified. |
| OpenCode jobs | Run/status/list endpoints | Provider authorization, cost controls and deployment runtime need explicit review. |
| Worker/outbox | Durable retry, dispatch expiry, refund reconciliation, push | API deployment is not evidence a worker runs; requires DB and migration 4. |

## 7. Infrastructure, CI and tests

- `server/main.ts` composes the API; `server/domain/` contains the modules above; `server/worker.ts` is a separate durable worker.
- Docker/Railway files provide packaging/deploy configuration, not release evidence.
- `infra/main.bicep` defines Azure resources with workloads off by default. Enabling workloads still uses the staging DB gate and is not a readiness assertion.
- `.github/workflows/ci.yml:10-90` defines verify, persistence and image jobs: lint/typecheck/tests/audit/exports, PostGIS 18-3.6 persistence and Docker build.
- `scripts/run-tests.mjs:6-119` selects **106 suites**; only `db-persistence.test.mjs` and `db-api.test.mjs` are exempted from the ordinary selection for the live-PostgreSQL persistence gate.

**No fresh tests, lint, typecheck, exports, builds, migrations, browser journeys, load tests or device runs were performed.** Historical claims of 105 passing suites, exports, 26 browser journeys, load compliance, deployment health and device validation remain dated evidence only.

Historical 2026-11-08 measurements (`journeyProtocol=1` mixed-workload p95 4,183.89 ms versus 428.82 ms; 65 versus 3 statements for 20-order history) are not current results; they identify benchmark targets.

## 8. Source-rechecked risks and documentation reconciliation

These are source observations, not fresh runtime reproductions:

| Risk/document issue | Current evidence and required treatment |
|---|---|
| Booking replay/caps | Caps/quote/replay occur before routing (`server/main.ts:1321-1345,1539-1560`). Retain concurrent replay/cap tests. |
| Journey query amplification | Orders are decorated separately (`server/main.ts:3218-3233`). Benchmark and optimize without changing protocol semantics. |
| Closure/alternate routes | Closure check uses `routes[0]` before possible alternate selection (`server/main.ts:2582-2609`). Test closed-primary/open-alternate. |
| Improved-accuracy GPS | Active-GPS bypass remains (`server/main.ts:2407-2431`). Validate on physical hardware. |
| Post-wait authorization | Routing is awaited without an equivalent later reauthorization in the reviewed path (`server/main.ts:1400-1455,1524-1553`). Test cancellation/state changes during waits. |
| COD documentation | `README.md:241-246` and `CAPABILITY-MAP.md:49` saying goods-price COD is not built are stale relative to `payments.ts:157-203`; activation is still unproven. |
| Capability metadata | Payments metadata names migration 25 while `paymentsAvailable()` checks 17; operations metadata also reflects later repairs (`runtime-readiness.ts:9-28`). Inspect actual gates, not metadata alone. |
| Production claims | “Shipped,” “realtime enabled” and “production ready” in older notes do not establish current deployment/provider/device state. |

## 9. Upgrade checklist and evidence gaps

1. Back up and restore-test source data; record schema versions, row counts and cutover/rollback steps.
2. Apply PostgreSQL migrations explicitly in staging; account for every version without renumbering.
3. Prove runtime selection and verified TLS; run both live-persistence suites against intended PostGIS.
4. Exercise customer, driver, admin, partner and public-track authorization, including denials and data minimization.
5. Run all 106 selected suites plus persistence, lint, typecheck, exports, audit and image jobs on the candidate commit.
6. Re-test booking concurrency/replay, route closures/alternates, post-wait authorization and journey performance.
7. Deploy/verify API and worker separately, including restart recovery and outbox retry.
8. Decide each provider explicitly. For enabled payments/COD/SMS/push/PubSub/Blob/Entra/email/routing/OpenCode, capture staging success and failure evidence; for disabled features, verify honest degraded behavior.
9. Validate customer/driver/admin journeys, GPS/evidence/background recovery on the physical Android device.
10. Capture released commit/image, deployment health, monitoring, quotas and rollback evidence.

Not available from repository inspection: live URLs and flags, actual schema/data state, provider resources/logs, production monitoring/DR, fresh performance results, physical-device evidence and business sign-off for disabled capabilities.

## 10. Bottom line

The repository is a broad delivery platform, not a stub. Its main release risk is confusing implemented routes and migrations with configured, deployed and device-validated behavior. Preserve the current order/auth/journey invariants, prove the PostgreSQL cutover independently, and activate integrations one by one with fresh evidence.
