# Fastship production-readiness gap inventory

**Assessment date:** 12 November 2026  
**Decision:** **Not production-ready yet.** The codebase contains substantial defensive work, but one confirmed booking-recovery defect, two payment/push activation defects, and missing end-to-end release evidence prevent a production sign-off.

## Scope and evidence rules

- This review covers the **current working tree**, including uncommitted implementation and tests, at HEAD `b60922952d607f698eee24b9c68ac3394daecd3c`. It is a static inventory, not a penetration test, provider certification, store review, or production incident exercise.
- **Confirmed defect** means the relevant control flow is visible in source. **Evidence gap** means the implementation may work, but the required runtime, device, provider, or release proof was not present in the reviewed material. No runtime tests or provider calls were executed for this inventory.
- The assessed mobile stack is Expo `~57.0.31`, React Native `0.86.3`, and `expo-notifications` `~57.0.24`; the server uses `pg` `8.23.1`, while CI uses Node `24.12.0` (`package.json:9,19,27,30`, `.github/workflows/ci.yml:31-34,76-79`). Recommendations below use the matching Expo SDK 57 and installed-library documentation, not unversioned memory.
- Production payments and Expo push are **explicitly disabled unless configured**. The only wired card implementation is a test fake, so provider-specific production validation is an activation requirement, not a claim that a nonexistent live integration is already broken (`server/main.ts:572-573`, `server/domain/payments.ts:19-48,192-197`, `server/worker.ts:56-63,183-201`).

## Release decision at a glance

| Priority | Gate | Current decision |
|---|---|---|
| P0 | A lost booking response must never cause a second booking or discard the only recovery key | **Blocked by a confirmed client defect; the fixed-contract regression test is intentionally red** |
| P0 | One order must have one authoritative payment/settlement result under retries, capture, refund, and timeout | **Blocked for payment activation; immediate capture bypasses the settlement gate** |
| P0 | PostgreSQL production paths and physical-device recovery must pass acceptance | **Evidence gap; existing test definitions are not execution evidence** |
| P1 | Push registration, delivery receipts, revocation, and process-local coordination must be production-operable | **Blocked by confirmed push gaps and deployment constraints** |
| P1 | Privacy, retention, CI provenance, rollback, monitoring, and incident controls must be demonstrable | **Partial implementation; release and operating evidence missing** |
| P2 | Longer-horizon assurance and efficiency work | **Schedule after P0/P1 closure; do not use it to waive release gates** |

## Existing safeguards worth preserving

- Native session tokens use Expo SecureStore; web tokens use `localStorage`. Passwords use scrypt with per-user salts and timing-safe comparison, sessions have absolute/idle expiry, reset tokens are single-use, and role/tenant checks are server-side (`src/storage.ts:1-12`, `server/domain/passwords.ts:1-124`, `server/main.ts:622-681,852-893,1133-1308`, `server/main.ts:3098-3260`). This maps to the MASVS-AUTH and MASVS-STORAGE control objectives; it is not by itself proof of device compromise resistance.
- Release builds require an explicit HTTPS API origin, reject local/private origins and credential-like URL material, and do not silently fall back to a test backend (`app.config.js:32-53`, `src/api.ts:11-13`). React Native likewise recommends TLS and platform-secure storage rather than embedding secrets ([React Native 0.86 security](https://reactnative.dev/docs/0.86/security)).
- Requests have bounded bodies, timeouts, and durable throttling; commands use durable idempotency records, actor/role binding, expected version checks, and bounded retention (`server/main.ts:3098-3260`, `server/domain/commands.ts:7-87`).
- Quotes are locked and expire; booking, assignment, custody, and settlement use transaction-scoped state checks and journals; post-commit outbox effects reduce the dual-write window (`server/main.ts:1321-1453,1511-1564,2042-2247`, `server/domain/ledger.ts:119-170`, `server/domain/events.ts:6-25`).
- Offline recovery ciphertext is token-derived and additionally protected by native SecureStore; replay restores only exact commands, requires fresh authorization and exact receipts, and deletes both pending records and snapshots on sign-out (`src/recovery-storage.ts:6-23`, `src/protected-recovery.ts:12-82`, `src/driver-command.ts:50-80`, `src/session.tsx:62-75,187-205`).
- CI already defines typecheck, lint, unit/integration tests, PostgreSQL service tests, release exports, and an image build; the package also defines a route-contract smoke command, and EAS separates preview and production build profiles (`.github/workflows/ci.yml:1-90`, `eas.json:1-23`, `package.json:49-76`). The gap is verified execution and release policy, not absence of scripts.

## Confirmed defects and design gaps

### P0 — Booking recovery can discard the idempotency key after a post-lock failure

**Evidence.** The booking client clears its persisted command for every 4xx in the post-lock set, including `quote_consumed` (`src/app/book.tsx:371-385`). It also contains the correct exact-receipt reconciliation path (`src/app/book.tsx:181-205`), but that path cannot help after the pending command is deleted. One assertion intentionally specifies the fixed contract and currently fails, while a separate reproduction documents the current unsafe clearing behavior (`tests/booking-retry-race.test.mjs:91-101,206-210`). The reproduction is evidence of the defect, not a second desired acceptance contract.

**Impact.** After a committed booking whose response is lost or transformed into a conflicting 4xx, a retry can use a new command key and create a duplicate order; exact reconciliation can also become impossible. This is a correctness defect even without malicious input.

**Required correction.** Preserve the durable command through ambiguous/post-lock failures, reconcile by its exact receipt before any new booking attempt, and permit explicit abandonment only after an authoritative terminal result. After fixing the client, update the current-behavior reproduction so it verifies the safe behavior; do not “fix” the red test by asserting the unsafe behavior.

### P0 before payment activation — Immediate capture bypasses the settlement gate

**Evidence.** `createIntent` records a provider intent whose create result is already `captured` without invoking `settlementGate`; polling and webhook capture paths do invoke it (`server/domain/payments.ts:53-63,68-95`). The payment tests cover capture, refunds, and COD, but not an immediately captured create response (`tests/payments.mjs:1-206`).

**Impact.** A future real provider can produce money movement and a captured payment record while skipping eligibility checks enforced on other capture paths. The current fake does not immediately capture, and live payment activation is disabled, so this is **not evidence of an existing live charge incident** (`server/domain/payments.ts:29-63`).

**Required correction.** Route every transition to captured—create response, polling, and webhook—through the same settlement eligibility and idempotent transition. Add tests for immediate capture, delayed capture, duplicate/out-of-order webhooks, timeout followed by late capture, refund-before-capture, and partial/full refund reconciliation.

### P1 — Expo `ok` tickets are treated as delivery without receipt processing

**Evidence.** The worker accepts an Expo ticket with `status === "ok"` and can then mark the outbox item delivered; it does not call Expo's receipt endpoint (`server/worker.ts:165-201`). Expo explicitly states that an `ok` ticket means Expo accepted the push, **not** that FCM/APNs or the device received it; it recommends fetching receipts after 15 minutes and notes receipt availability is limited to 24 hours ([Expo push sending and receipts](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/#push-sending-and-receipts)).

**Impact.** Operational state can say “delivered” while device tokens are invalid or provider delivery failed. Alerting based on that state would suppress the exact signal needed during a notification outage.

**Required correction.** Model accepted, delivered-to-provider/receipt-checked, retryable failure, and permanently invalid token separately. Schedule receipt lookup, handle `DeviceNotRegistered` by revoking the token, bound retries, and alert on receipt error rates and backlog age. Retain idempotent outbox leasing and post-commit enqueueing.

### P1 — Native push-token rotation has no immediate subscription

**Evidence.** Native registration stores and uploads the current token during session/language effects, but `src/native-push.ts` does not register `Notifications.addPushTokenListener` (`src/native-push.ts:32-46`, `src/session.tsx:156-181`). Expo documents token rotation and the `addPushTokenListener` subscription for receiving a new token ([Expo Notifications SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/#addpushtokenlistenerlistener)).

**Impact.** A rotated token can remain stale until another app/session effect happens, delaying critical order updates without necessarily producing a client-visible failure.

**Required correction.** Subscribe while push is enabled, upload rotations with authenticated idempotent replacement, revoke obsolete tokens server-side, and test logout/login plus account switching so one device cannot retain another user's registrations.

### P1 — Realtime waiters and routing budgets are process-local

**Evidence.** Live-location waiters are held in a process-local map, and Google routing daily counters/concurrency are process-local (`server/main.ts:2469-2501`, `server/domain/google-routing.ts:18-21,295-298`). PostgreSQL persistence does not make these in-memory controls shared.

**Impact.** Multiple replicas can miss wakeups and independently spend the same external provider budget; restarts discard waiter state. This is an architecture constraint, not proof that a single correctly configured instance will fail.

**Required correction.** Either enforce and document a single-writer/single-realtime-instance topology with sticky routing and tested failover, or move wakeup and budget coordination to shared PostgreSQL/Redis-like infrastructure. Acceptance must use the actual production replica count and prove budget ceilings under concurrent workers.

### P1 — Retention is deliberately open-ended for several personal-data classes

**Evidence.** The privacy notice says retained operational/security records and staff notes have no automatic expiry and backups are not scrubbed (`server/privacy.html:40-42`). Account deletion scrubs identity-linked fields and revokes sessions, but retained shipment/event data and operational notes remain (`server/main.ts:852-893`, `server/domain/events.ts:6-25`).

**Impact.** This is disclosed behavior, not a hidden deletion bug. It remains a data-minimization, legal-basis, access-review, and restore-procedure obligation; location and delivery history can stay sensitive after account deletion. MASVS-PRIVACY explicitly requires broader privacy/legal assessment beyond app testing ([OWASP MASVS privacy](https://github.com/OWASP/masvs/blob/master/Document/12-MASVS-PRIVACY.md)).

**Required correction.** Assign an owner, purpose, legal basis, retention period, and deletion/anonymization method to each residual field; document backup retention and re-deletion after restore. Product/legal approval is required before treating indefinite retention as acceptable.

### P1 — Browser token storage needs an explicit web threat model

**Evidence.** Native uses SecureStore, but web stores bearer tokens in `localStorage` (`src/storage.ts:5-12`). MASVS-STORAGE covers both deliberate sensitive-data storage and unintended exposure, and React Native recommends platform-secure storage for sensitive information ([MASVS storage](https://github.com/OWASP/masvs/blob/master/Document/05-MASVS-STORAGE.md), [React Native security](https://reactnative.dev/docs/0.86/security)).

**Impact.** Any same-origin script execution can read the web token. This is a platform/design risk, not proof of an XSS vulnerability in this review.

**Required correction.** Either accept and document the browser risk with strong CSP/XSS regression tests, short operational response/revocation procedures, and no sensitive third-party scripts, or move web authentication to secure HttpOnly, Secure, appropriately SameSite cookies with CSRF protection. Do not imply SecureStore protects browser storage.

## Missing acceptance evidence by risk area

### Security, privacy, and abuse controls

- **Authentication lifecycle:** execute registration, login, reset, logout, idle/absolute expiry, password change, account deletion, cross-role access, and replayed reset/session tests against the production-like API. Security admission/lease test definitions exist, but no current passing full-lifecycle run or deployed configuration evidence was reviewed (`server/main.ts:622-681,852-893,1133-1308`, `tests/review-security-admission.mjs:1-21`, `tests/review-security-lease.mjs:1-28`).
- **Authorization matrix:** for every public route and role, prove tenant isolation for customer, driver, support, and admin, including command replay with another actor's idempotency key and direct object-ID substitution. Server command replay binds actor/role, but route-by-route negative evidence remains necessary (`server/domain/commands.ts:7-87`, `server/main.ts:2770-2899`).
- **Abuse resistance:** measure distributed rate limits, expensive quote/routing calls, reset spam, and body/timeout behavior at the production proxy. Durable limiters exist, but proxy IP normalization and multi-instance behavior need deployment evidence (`server/main.ts:3098-3260`).
- **Secrets and transport:** prove production secrets come from EAS/server secret stores, not `app.config.js` public `extra` or exported bundles; verify TLS redirects, HSTS, certificate errors, proxy headers, log redaction, and release-origin rejection in the built apps (`app.config.js:32-53,56-68`, `src/api.ts:11-13`). EAS distinguishes server-only environment variables from `EXPO_PUBLIC_` variables, which are embedded in client bundles ([EAS environment variables](https://docs.expo.dev/eas/environment-variables/)).
- **Data exposure:** inspect API responses, logs, analytics/crash payloads, notification bodies, Android backups, screenshots/app-switcher content, and exported web bundles for tokens, precise location, staff notes, and payment metadata. The static review did not establish that every sink is safe (`src/protected-recovery.ts:12-82`, `src/native-push.ts:32-46`, `app.json:17-20`).

### Transactional correctness and money

- **Booking/quote:** run lost-response, timeout-before-commit, timeout-after-commit, duplicate tap, app restart, quote expiry, quote consumption, stale version, and reconciliation tests on both supported persistence backends. Preserve the existing command/journal invariants (`server/domain/commands.ts:7-87`, `server/main.ts:1321-1453,1511-1564`).
- **Assignment/custody:** prove single-driver acceptance, lease expiry/reassignment, stale offer rejection, duplicate custody transition rejection, exception handling, cancellation, and event ordering under concurrent requests (`server/main.ts:2042-2247`).
- **Settlement:** prove merchant COD and platform settlement eligibility, negative/invalid amounts, repeated settlement, driver debt, reconciliation, and refund behavior with database row locks and concurrent workers (`server/domain/ledger.ts:119-170`, `server/domain/payments.ts:68-77,97-190`, `scripts/check-persistence.mjs:5-14`).
- **PSP activation:** before enabling a real adapter, obtain its exact API documentation and certify signature verification, amount/currency mapping, idempotency keys, webhook replay/out-of-order delivery, capture/void/refund status mapping, timeout reconciliation, and credential rotation. No real PSP adapter is currently wired, so naming provider-specific compliance would be speculation (`server/domain/payments.ts:19-48,192-197`).
- **Backend parity:** run the same acceptance contract on SQLite and PostgreSQL or declare one unsupported. PostgreSQL transactions must execute every statement on the same transaction-owned client; this implementation retains a `PoolClient`, which matches node-postgres guidance, but SQL dialect/date/JSON/locking behavior still needs execution evidence (`server/db/persistence.ts:137-142,168-275`, [node-postgres transactions](https://node-postgres.com/features/transactions)).

### Offline, lifecycle, and device recovery

- Test airplane mode before quote, after command send, after server commit, during assignment, during custody, and during payment polling; each case must end in exactly one authoritative order/payment state. The offline design supports this, but physical execution evidence is absent (`src/driver-command.ts:50-80`, `src/app/book.tsx:181-205`).
- Kill the process, reboot the phone, revoke/expire the session, rotate the token, change language, upgrade the app, and sign into another account between queued command and replay. Require fresh authorization, no cross-account leakage, exact receipt matching, and explicit handling of non-replayable commands (`src/session.tsx:62-75,156-205`, `src/protected-recovery.ts:12-82`).
- Exercise low storage, corrupted recovery records, SecureStore unavailable/lock-screen states, clock changes, background/foreground transitions, denied then granted permissions, GPS disabled, mock/inaccurate locations, and prolonged backgrounding. Expo documents SecureStore key accessibility and platform limitations; availability and OS policy must be tested rather than inferred ([Expo SecureStore SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/)).
- Use the repository-mandated physical `SM-A5360` device, not an emulator. A successful desktop unit test is not evidence for Android process death, SecureStore, background GPS, or push delivery.

### Operations and degraded mode

- Prove readiness actually checks the dependencies needed to serve traffic, and that load balancers remove unhealthy instances without dropping committed commands. Existing health/readiness routes and lifecycle handlers are present, but deployment probes and rollout evidence were not reviewed (`server/main.ts:599-617`, `docs/operations/incident-and-degraded-mode.md:1-16`).
- Demonstrate outbox lease expiry, worker crash after provider send but before acknowledgment, duplicate delivery, poison messages, receipt backlog, refund reconciliation lag, and restart recovery. Ticket-only push success must no longer count as final delivery (`server/worker.ts:104-201`).
- Define alert thresholds and owners for command failures, reconciliation ambiguity, payment/provider mismatch, queue age, push receipt errors, routing-budget exhaustion, database saturation, and elevated 4xx/5xx rates. Existing logs/throttles are useful signals, not substitutes for tested alert routing (`server/domain/google-routing.ts:18-21,295-298`, `server/main.ts:3098-3260`).
- Run backup restoration and account re-deletion drills, a provider outage, database failover, poisoned deployment rollback, revoked Expo/FCM/APNs credentials, and an API-origin incident. Record RPO/RTO and customer/driver support scripts; the current degraded-mode document is a starting point, not a completed drill (`docs/operations/incident-and-degraded-mode.md:1-16`, `server/privacy.html:40-42`).

## Minimum test additions and acceptance matrix

| Acceptance case | Required proof | Pass condition |
|---|---|---|
| Booking response lost after commit | Fault-injection integration test plus physical-device retry | Same command key reconciles original receipt; one order; no automatic new key |
| Post-lock 4xx such as `quote_consumed` | Corrected `tests/booking-retry-race.test.mjs` run | Pending command survives; exact receipt resolves or explicit recoverable state remains |
| Immediate PSP capture | New create-intent capture tests and PSP sandbox certification | Settlement gate executes exactly once; ledger and provider agree |
| Late/duplicate/out-of-order payment events | Provider webhook and timeout suite | Idempotent final state; no double capture/refund; discrepancies alert |
| Concurrent assignment/custody/settlement | PostgreSQL concurrency run with multiple workers | Row locks/version checks prevent invalid double transitions; journals balance |
| Offline process death/reboot/auth revocation | Physical Android recovery run | Durable queue restores safely; fresh auth required; no duplicate or cross-account action |
| Push token rotation and invalidation | Real development build with Expo/FCM evidence | New token uploaded promptly; `DeviceNotRegistered` revokes; no `ok`-only delivery claim |
| Replica/restart behavior | Production-topology failure test | Wakeups and provider budgets remain correct at actual replica count and after restart |
| SQLite/PostgreSQL contract | `npm test`, `npm run test:persistence`, route/import smoke | All selected suites pass with zero orphaned tests and no contradictory assertions |
| Privacy/deletion/backup restore | Data inventory plus deletion and restore drill | Disclosed retention matches actual records; restored deleted accounts are re-scrubbed |
| Release build provenance | CI artifact plus EAS build/update rehearsal | Same immutable server artifact and client runtime version are traceable and rollback-tested |

CI discovery rejects orphaned `.test.mjs` files, and the PostgreSQL launcher has a separate suite set; both must run rather than assuming `npm test` covers everything (`scripts/run-tests.mjs:1-138`, `scripts/check-persistence.mjs:1-29`, `package.json:49-76`). Capture exact commands, commit/worktree identity, Node version, database version, device build, environment name, and logs as release evidence.

## CI, release, and operational controls

1. **Make the working tree reproducible.** Commit the reviewed implementation/tests through the normal owner-approved workflow, require a clean checkout, and block release on lint, typecheck, both persistence suites, route smoke, and the corrected race tests. Current CI definitions alone do not prove the uncommitted tree passed (`.github/workflows/ci.yml:1-90`).
2. **Use immutable promotion.** Tie the deployed API image to a digest, run migrations as a controlled compatibility step, and rehearse rollback/roll-forward with real PostgreSQL. Avoid rebuilding different artifacts for staging and production (`.github/workflows/ci.yml:84-90`, `Dockerfile:1-36`).
3. **Control Expo runtime compatibility.** Set and document the production runtime-version/update policy, sign or otherwise protect update integrity according to the chosen EAS model, and verify that an update never targets an incompatible native build ([EAS runtime versions](https://docs.expo.dev/eas-update/runtime-versions/), `eas.json:1-23`).
4. **Separate client configuration from secrets.** Only non-secret `EXPO_PUBLIC_` values may enter bundles; PSP secret keys, Expo access tokens, database URLs, and reset/push credentials stay server-side. Production activation should fail closed, as the current payment/push flags already do (`server/domain/payments.ts:29-48,192-197`, `server/worker.ts:56-63`).
5. **Deploy observability before traffic.** Dashboards and alerts must cover the acceptance failure modes above, with an on-call owner and a tested degraded-mode/runbook path. Record audit events without bearer tokens, plaintext passwords, full payment credentials, or unnecessary precise location (`docs/operations/incident-and-degraded-mode.md:1-16`).
6. **Enforce data lifecycle operations.** Scheduled retention jobs, legal holds, backup expiry, restore re-scrubbing, and periodic access reviews must match the published privacy notice (`server/privacy.html:40-42`).

## P0 / P1 / P2 release gates

### P0 — must pass before any real customer/driver production traffic

- Fix and test the booking command-clearing race; preserve the fixed-contract regression and update the current-behavior reproduction after the correction (`src/app/book.tsx:371-385`, `tests/booking-retry-race.test.mjs:91-101,206-210`).
- Pass booking, assignment, custody, settlement, command replay, and database concurrency acceptance on the declared production backend, including lost responses and worker restarts (`server/main.ts:1321-1453,1511-1564,2042-2247`, `server/domain/ledger.ts:119-170`).
- Complete the physical Android offline/process-death/auth-revocation/GPS recovery matrix with exactly-once business outcomes (`src/driver-command.ts:50-80`, `src/session.tsx:62-75,187-205`).
- Keep real card payments disabled until immediate capture uses the settlement gate and the selected PSP sandbox/webhook/refund/reconciliation suite passes (`server/domain/payments.ts:53-95`).
- Prove production secrets, HTTPS origin, role/tenant authorization, account lifecycle, backup/restore, readiness, rollback, and critical alerting in a production-like environment (`app.config.js:32-53`, `server/main.ts:599-617`, `.github/workflows/ci.yml:1-90`).

### P1 — must pass before general availability or enabling the affected capability

- Implement Expo receipt processing, token rotation, invalid-token revocation, queue-age monitoring, and real provider delivery evidence (`server/worker.ts:165-201`, `src/native-push.ts:32-46`).
- Resolve process-local realtime/budget coordination for the actual replica topology and prove failover (`server/main.ts:2469-2501`, `server/domain/google-routing.ts:18-21,295-298`).
- Approve and implement the residual-data retention schedule, backup deletion semantics, and web-token threat model (`server/privacy.html:40-42`, `src/storage.ts:5-12`).
- Produce clean CI/EAS provenance, runtime-version compatibility, signed/protected update policy where selected, incident drills, dashboards, on-call ownership, and rollback evidence (`eas.json:1-23`, `.github/workflows/ci.yml:1-90`).
- Complete security review of the real PSP adapter and production notification credentials before enabling either flag; configuration-disabled fakes are not production certification (`server/domain/payments.ts:19-48`, `server/worker.ts:56-63`).

### P2 — improve after release blockers, without weakening P0/P1

- Add repeatable chaos/fault-injection schedules, longer soak tests, synthetic customer/driver journeys, trend dashboards, and periodic restore/rollback drills; retain the existing CI and runbook foundations (`.github/workflows/ci.yml:1-90`, `docs/operations/incident-and-degraded-mode.md:1-16`).
- Maintain a cryptographic/data-flow inventory, dependency review cadence, key rotation plan, and periodic MASVS/ASVS reassessment. Password KDF parameters, AES-GCM recovery records, random reset/session tokens, and token lifecycle should be reviewed against OWASP ASVS 5.0 V11 rather than treated as one-time decisions ([OWASP ASVS 5.0 cryptography](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x20-V11-Cryptography.md), `server/domain/passwords.ts:1-124`, `src/recovery-storage.ts:6-23`, `src/protected-recovery.ts:12-82`).
- Optimize test/runtime cost only after parity and failure coverage are stable; do not delete slow race/device/provider tests to make CI greener (`scripts/run-tests.mjs:1-138`, `scripts/check-persistence.mjs:1-29`).

## External verification sources

- [Expo SDK 57 Notifications: push tickets, receipts, and token listeners](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [Expo SDK 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [EAS environment variables and bundle visibility](https://docs.expo.dev/eas/environment-variables/)
- [EAS Update runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)
- [React Native 0.86 security guidance](https://reactnative.dev/docs/0.86/security)
- [node-postgres transaction guidance](https://node-postgres.com/features/transactions)
- [OWASP MASVS storage](https://github.com/OWASP/masvs/blob/master/Document/05-MASVS-STORAGE.md), [authentication/authorization](https://github.com/OWASP/masvs/blob/master/Document/07-MASVS-AUTH.md), [network](https://github.com/OWASP/masvs/blob/master/Document/08-MASVS-NETWORK.md), and [privacy](https://github.com/OWASP/masvs/blob/master/Document/12-MASVS-PRIVACY.md) control objectives
- [OWASP ASVS 5.0.0 V11 cryptography](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x20-V11-Cryptography.md)

**Bottom line:** preserve the existing idempotency, transaction, SecureStore, offline, and fail-closed provider work. Release remains blocked on booking recovery, payment capture consistency, real backend/device/provider evidence, push receipt/rotation handling, and demonstrable production operations—not on adding more architecture.
