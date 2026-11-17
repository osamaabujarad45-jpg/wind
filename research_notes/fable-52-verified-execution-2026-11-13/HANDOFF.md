# Fastship / Wind — verified Fable 5.2 execution handoff

**Date:** 2026-11-13  
**Mode:** source/log inspection plus bounded local execution; no application/test fixes, Git mutations, deployment, production migration, credentialed benchmark, or owner-data access. Earlier research-tooling side effects are disclosed in §8.  
**Decision:** **NO-GO for a trusted release, payment activation, production PostgreSQL cutover, or multi-instance scaling.** The current tree has a reproduced booking-integrity defect; canonical full-release and operational evidence are incomplete. The canonical server typecheck and Expo lint pass; an earlier seven-error diagnostic was configuration-invalid and is retracted as a product defect.

This document supersedes readiness implications in older proposals. It does not erase their useful implementation guidance. Effort estimates are engineer-day ranges for the stated scope, excluding owner waits, provider onboarding, procurement, and external review.

## 1. Evidence legend and audited identity

- **[F] Fresh execution:** run against the current root working tree on 2026-11-13.
- **[H] Historical execution:** an older recorded result; not rerun and not current proof.
- **[S] Source inspection:** control flow/configuration read in a named checkout; not runtime proof.
- **[R] Public research:** public store/listing observation only.
- **[I] Inference:** recommended action or estimate, not an observed fact.
- **[B] Blocked:** attempted but a named prerequisite prevented completion.

Audited root: branch `master`, HEAD `b60922952d607f698eee24b9c68ac3394daecd3c`, with extensive pre-existing modified and untracked application, server, package, and test files. A SHA alone does not identify this dirty tree. In particular, the 106-entry registry and root CI changes are uncommitted, and `server/domain/opencode.ts` is untracked; committed HEAD has an 88-entry registry and does not contain that file. The separate worktree `.claude/worktrees/leftover-tasks-4716c1/` was at `af27c485ed09471c4cbe3b39dafda0b7ae6714df` in the infrastructure audit; its files and claims are not root/current proof.

AWS scope for any future owner-authorized verification is project `osama-abujarad-bdjkrc`, CLI profile `osama`, account `083712835043`, Region `eu-north-1`. The previously named `osama-abujarad` profile is absent from `~/.aws/config`. No credential value is recorded here. Production was not mutated.

## 2. Fresh results — what actually ran

All fresh commands were local fallback runs on Windows, not k5, CI, a physical device, or production. Test databases were disposable/synthetic; no live payment provider or customer data was used.

| Check | Result | Evidence and boundary |
|---|---|---|
| `npx expo lint` | **[F] PASS, exit 0** | [lint-recheck.log](./lint-recheck.log) records the fresh recheck and exit code. The original [lint-current.log](./lint-current.log) contains only two environment lines and is insufficient by itself. Lint only. |
| `npm run typecheck` | **[B] No canonical full-project pass.** Initial run aborted with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`. A later increased-heap attempt reached unrelated `research_notes/.../rea` TypeScript errors rather than establishing an application pass; that attempt has no preserved standalone log. | Root `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, so reverse-engineering artifacts contaminate the project-wide scan. Do not report either attempt as a pass. |
| `npx tsc --noEmit -p tsconfig.server.json --pretty false` | **[F] PASS, exit 0** | [typecheck-server-recheck.log](./typecheck-server-recheck.log). This is the canonical server half of `npm run typecheck`, with Node types; it does not establish a root/client pass. |
| `npx tsc -p research_notes/fable-52-verified-execution-2026-11-13/tsconfig.audit.json --noEmit --pretty false` | **[F] INVALID DIAGNOSTIC; seven product errors retracted** | [typecheck-current.log](./typecheck-current.log) reported seven errors in untracked `server/domain/opencode.ts`, but the audit config inherited `types: ["expo/types"]` instead of the canonical server config's `types: ["node"]`. The resulting `ProcessEnv`/spawn errors do not reproduce under the canonical server check. Do not change application source to satisfy this invalid audit configuration. |
| Direct `node --test` over all 99 root `tests/*.test.mjs` files | **[F] 103 results: 96 passed, 7 failed** | [integration-current.log](./integration-current.log), Node `v24.12.0`. This is a direct test-file run, **not** the canonical 106-entry fail-fast registry and not a complete release gate. It includes registry-exempt PostgreSQL files and excludes registry-only `.mjs` suites. The 103/99 difference is explained: `dependency-security.test.mjs` has five top-level tests while the other 98 files have one each. |
| `node --test tests/parcels.test.mjs` | **[F] PASS in isolation, 2.09 s** | [parcels-rerun.log](./parcels-rerun.log). This does not erase the initial parallel-run `ECONNRESET`; suite reproducibility remains open. |
| `node:sqlite` runtime | **[F] Executed successfully under Node 24.12.0** | Numerous disposable-SQLite suites ran. An older native `node:sqlite` failure is historical and must not be reused as the current result. |
| `scripts/readiness/full-suite.mjs` | **[B] Not runnable: absent** | No such file exists in this root checkout. Do not cite it as a current gate. |

### 2.1 Exact seven failure classifications

| Test file | Classification | Observed result / required interpretation |
|---|---|---|
| `booking-retry-race.test.mjs` | **Reproducible product defect** | The client contract clears persisted booking commands for post-lock 409 responses including `quote_consumed`. A lost-answer first POST may already have committed, so this can orphan a real order. Its PostgreSQL server-race Part A separately remained unexecuted because `WIND_TEST_DATABASE_URL` was unset. |
| `clean-typecheck.test.mjs` | **Harness/resource failure** | `spawnSync C:\Program Files\nodejs\node.exe ETIMEDOUT` after about 60 seconds. Not a typecheck pass and not proof that only the seven isolated errors exist. |
| `database-logging.test.mjs` | **Environment-blocked** | `ECONNREFUSED 127.0.0.1:55473`; local PostgreSQL fixture unavailable. |
| `db-api.test.mjs` | **Environment-blocked** | Same unavailable loopback PostgreSQL fixture. |
| `db-persistence.test.mjs` | **Environment-blocked** | Same unavailable loopback PostgreSQL fixture. |
| `subscription-migration.test.mjs` | **Environment-blocked** | Same unavailable loopback PostgreSQL fixture. |
| `parcels.test.mjs` | **Unresolved parallel-run flakiness** | Initial `/orders` request failed with `read ECONNRESET`; isolated rerun passed. Repeat the canonical suite to determine whether contention, startup/teardown, or another race remains. |

The earlier attempted `node --test tests/integration/*.test.mjs` path was invalid: `tests/integration/` does not exist. Its zero-test output and subsequent automatic-discovery behavior are not application evidence. Use root `tests/*.test.mjs` for direct-file diagnostics or `npm test` for the registry.

**These seven are a historical snapshot and two are now closed.** Re-verified in this tree on 13 Nov
after the leader pass: `booking-retry-race` **PASSES** (defect fixed by retaining the eight post-lock
codes — see §3.1), `clean-typecheck` **PASSES** (fixed by narrowing `tsconfig.json` `include` to
`src/**`), and `parcels` passed in the isolated rerun and in a full 99-file run with no reset. The four
PostgreSQL suites still fail on `ECONNREFUSED 127.0.0.1:55473` exactly as classified here. Current
measured state: **99 test files, 99 pass, 4 fail, all four environmental.** Details:
`docs/REA/2026-11-13-VERIFIED-ADDITIONS.md` sections 7 and 8.

## 3. Reconciled technical findings

### 3.1 Booking integrity — fresh defect plus source cause

**[F/S]** `src/app/book.tsx:371-385` clears the saved command for broad 4xx responses except 401/408/429/`idempotency_conflict`. The fresh regression proves this includes post-lock responses where the current attempt's refusal cannot prove that an earlier attempt did not commit. `tests/booking-retry-race.test.mjs:1-15` also documents the PostgreSQL lock/replay path, but that server race is not freshly executed without the fixture.

Required direction: preserve the stable command and reconcile through `/orders/commands/:requestId` before allowing a replacement booking. Do not "fix" this by blindly retrying every 409 or by weakening the regression.

**Update, leader pass 13 Nov - fixed by retention alone; a client-side window was tried and removed.** The catch block now excludes the eight post-lock codes, so a committed order keeps its on-device pointer; `booking-retry-race` and `booking-auth` both exit 0. My first write-up claimed this created a permanent lockout - that was wrong: the pending card has a Retry button (`book.tsx:439`) that resubmits the same requestId and the server replays it to the committed order, and Edit/Discard stay disabled for an unknown outcome by design (`booking.ts:106-107`). A second attempt added a client-side commit window (`COMMIT_WINDOW_MS`, a `sentAt` fallback and a re-ask timer); an independent Kimi review returned **UNSOUND** and was right - client wall-clock elapsed time is not proof of server non-commit, and `sentAt` is the first-save time, so either can release an in-flight command and re-create the orphan. That mechanism was removed in full. Any safer unlock must be server-side: a receipt state that says the command is dead. Full analysis: `docs/REA/2026-11-13-VERIFIED-ADDITIONS.md` section 7.

Root cause is an implemented half of a documented design: `src/booking.ts:19` says absence *"is only trusted once the server can no longer be committing it"*, but the window it describes is never applied to `pendingOutcome`. `tests/booking-retry-race.test.mjs:95-101` requires retention while `tests/booking-auth.test.mjs:54-56` requires that a null receipt stay unreleasable — both are correct, and together they leave nowhere to go until the window exists.

**So P0-2 needs one decision before any code: the commit-window value**, derived from the server request timeout and its 500 ms `lock_timeout` on this path, not guessed. Then (a) `pendingOutcome` returns `'absent'` for a null receipt once the window has elapsed, and (b) `book.tsx:379` retains the eight codes. Full analysis: `docs/REA/2026-11-13-VERIFIED-ADDITIONS.md` §9. The tree is left as found — `book.tsx` original, `booking-retry-race` failing, `booking-auth` passing — rather than trading an orphan bug for a lockout.

### 3.2 Payment settlement — activation blocker, not a live exploit claim

**[S]** `server/domain/payments.ts:53-63` always delegates the capture decision to `provider.create`; there is no `captureMethod` branch. A provider outcome of `captured` can be stored and returned from `createIntent` without calling `settlementGate`; the gate is invoked on later query/webhook paths at lines 78 and 91. The direct `query()` path at line 79 can also write `captured` after `getIntent` without its own gate. **[S]** `settlementGate` only takes the per-order lock and rejects conflicting cash/card settlement; it does not execute order, cash, or custody side effects. Because provider capture occurs before those checks, a 409 conflict can leave money captured at the provider while local state remains pending, with no automatic void/refund reconciliation. **[S]** Payments require PostgreSQL/schema 17 and the reviewed provider is a test fake (`payments.ts:29-48,192`). Therefore this is a future immediate-capture activation blocker, **not evidence of a reachable production PSP exploit or real-money movement**.

### 3.3 Deployment, recovery, scaling, and release identity

**[S]** The infrastructure audit found the AWS template and operating automation only in the separate worktree, while root deployment material remains Azure-oriented. The reviewed worktree design is one EC2 host with SQLite, not deployed ECS/RDS. Backup/restore scripts exist, but code presence is not a recent restore or alert-delivery result. See [audit-b-infra-tests.md](../Fable%205.2%20verified%20execution%20handoff/audit-b-infra-tests.md).

**[S]** Current root runtime has process-local live waiters, route health/caches, and repeated API schedulers; `DurableWorker` requires PostgreSQL. Keep one SQLite API process and no durable worker until shared realtime reconciliation, scheduler ownership, and multi-instance tests pass. Container rollback is valid only while backend/schema compatibility holds: the worktree deploy script restores code, not the pre-deploy SQLite backup, and the API refuses a newer `user_version`. Never roll back to stale SQLite after authoritative PostgreSQL writes. Deploy and watchdog health/restart operations also need mutual exclusion.

**[B]** Live AWS inventory, plan/spend state, encryption, metrics, backup schedule, deployed image/revision, production cost, and current readiness are unverified. Historical `GetCallerIdentity` returned `InvalidClientTokenId`; `aws` was not recognized on PATH. An isolated AWS CLI environment exists under the research workspace (§8), but no new identity/inventory call was made. These are access/tooling blockers, not evidence that resources are absent.

### 3.4 Device and historical evidence boundaries

- **[H]** The previously recorded 174-file integration pass, Android smoke, and AOSP booking matrix belong to older source/build states. They do not cover this extensively changed tree.
- **[B]** No new extended device matrix was obtained. The recorded launch blocker is `Unexpected launch result for ps.wind.app.testdriver`.
- **[B]** Expanded native trip completion, driver/admin settlement, phone identity, production load, real payment capture, and representative restore remain unverified.
- **[F]** The fresh SQLite tests do not prove native Android SQLite, push, background location, release signing, or physical-device behavior.

### 3.5 Competitor/store research boundaries

See [reference-rea-audit.md](../Fable%205.2%20verified%20execution%20handoff/reference-rea-audit.md) and the separate [13 November reference-app study](../REA-2026-11-13-reference-apps/PALESTINIAN-COMPETITORS-INDEX.md).

- **Uber 4.654.10002:** **[H]** historical records describe a real 10-APK rider split set and 23/23 DEX coverage. **[S]** the documented original/decompile roots are currently absent, so hashes/coverage were not freshly reproduced. This is one rider artifact, not backend, driver, recipient, native-internal, or production-behavior proof.
- **Uber 4.655.10001, Shiply, Souq Tulkarm, Athkar, Salati:** **[H/S]** a separate same-day study records static analysis of locally held APKs. This review inspected its reports, not its tool runs or binary hashes; it is not fresh leader-reproduced evidence. Shiply and Souq Tulkarm supply relevant static cues for address-light delivery, cash/custody, recipient proof, and settlement. Their server guarantees, runtime behavior, and Shiply driver surface remain unknown. The index simultaneously says artifacts were “pulled from the owner's phone” and “the phone was not touched”; acquisition provenance is therefore unresolved and must not be silently harmonized.
- **Careem:** **[R]** Google Play/Apple listing observations only. No local binary/decompilation or dynamic behavior evidence.
- **HAAT:** **[R]** Google Play/Apple listing observations only. Developer-provided data-safety copy is not an independent privacy/security audit.
- **[I]** Use these observations to frame acceptance questions—recipient/landmark addressing, cash reconciliation, safe retry, scoped tracking—not to claim competitor internals or clone proprietary implementation/assets.

### 3.6 Dialect parity - production runs SQLite, and twelve modules gate on PostgreSQL

**This reframes P0-4 and P0-5 and had no entry in the earlier passes.** Verified by the leader
on 13 Nov against this checkout; full evidence in
[`docs/REA/2026-11-13-VERIFIED-ADDITIONS.md`](../../docs/REA/2026-11-13-VERIFIED-ADDITIONS.md) §1.

**The deployed pilot writes SQLite** `[read]` `server/db/runtime.ts:1-27`, with one correction an
independent check caught: the file has **three** branches. No `WIND_DATABASE_URL` returns the
SQLite persistence (`:9`); `WIND_POSTGRES_STAGING=1` with a valid non-loopback URL returns a
Postgres persistence pinned to `search_path=wp16_staging` (`:11-18`), which is a staging path and
not the production cutover; any other URL throws at `:20-21` (*"PostgreSQL API cutover is gated on
WP03 schema/import parity…"*). The deployed dialect is therefore established from the
deployment, not the code: the nightly host backup is a SQLite file, and the deployment is one
EC2 host with SQLite. The in-file comment still reads *"PostgreSQL is an isolated test target
until WP03 schema/import acceptance."*

**Twelve domain modules return "unavailable" on that backend** `[read]`, one line each:

| Module | Gate | What production therefore cannot reach |
|---|---|---|
| `server/domain/commands.ts` | `:11` `fail(409,'durable_protocol_unavailable')` | durable command protocol |
| `server/domain/dispatch.ts` | `:41` `return false` | `dispatch_rounds`, `dispatch_offers` |
| `server/domain/eligibility.ts` | `:33` `return false` | `eligibility_policy`, `driver_eligibility` |
| `server/domain/events.ts` | `:35` `return false` | **`domain_events`, `outbox`** |
| `server/domain/ledger.ts` | `:15` `return false` | **double-entry journal** |
| `server/domain/native-push.ts` | `:26` `return false` | `native_push_tokens` path |
| `server/domain/ops.ts` | `:14` `return false` | `support_cases` |
| `server/domain/payments.ts` | `:36` `return false` | **`payment_intents`** |
| `server/domain/private-objects.ts` | `:48` `return false` | `private_objects` |
| `server/domain/quotes.ts` | `:9` `return false` | table-backed quotes |
| `server/domain/resource-scope.ts` | `:30,33` `return false` | **`custody_records`** |
| `server/domain/ride-lifecycle.ts` | `:24,53` `return false` | `ride_lifecycle`, `assignment_history` |

**Read it precisely.** This is not "the app is broken". `main.ts` keeps older inline SQLite
paths — `cash_entries`, `proof_attempts`, `quotes`, `orders`, `order_actions`, `order_commands`
are all in `server/db/sqlite-schema.ts` and are in use. The defect is a **parity gap**: the
newer, auditable, table-backed implementations are dead code in the pilot, and the shipped
behaviour is the older path. Any statement of the form "we have an outbox / a ledger / payment
intents / custody records" is describing the test dialect. Do not plan on top of those
mechanisms as though they were live.

**Consequence for P0-4.** The cutover is not only a scale/rollback question. Until it happens,
seven named capabilities the handoff treats as existing are unreachable. Add to P0-4's
acceptance: an inventory asserting, per table above, either "reachable on SQLite" or
"intentionally absent, and this user-facing feature is therefore not offered".

**Consequence for P0-5 — payment has two independent blockers, not one.** The question was
whether payments are inactive because of the dialect. The answer is both:

1. **Dialect.** `paymentsAvailable()` returns false on SQLite (`payments.ts:36`), so every
   payment route fails `409 payments_unavailable` via `gate()` (`:47`).
2. **No provider at all.** `paymentsConfig()` enables payment only for the test fake —
   `testFake: env.NODE_ENV === 'test' && env.WIND_PAYMENTS_TEST_ONLY === '1'` (`:32-34`), with the
   comment *"No payment provider is wired yet."* (`:29-31`).

So a PostgreSQL cutover alone would **not** activate payments: there is still no real provider
class. P0-5's dependency list must therefore carry both the cutover **and** a BoP provider
implementation, or payment activation will land on a second silent 409.

## 4. Execution backlog



### P0 — release, integrity, money, recovery, and activation gates

| ID | Work and owner | Effort [I] | Dependencies | Acceptance evidence | Rollback / safety gate |
|---|---|---:|---|---|---|
| **P0-1** | **Establish one canonical source and deployed baseline.** Owner: release lead + deployment owner. Reconcile root dirty tree, `origin/master`, the AWS worktree, built image, and host. Record source-tree manifest/SHA, image digest/revision, public URL, DB backend/schema, enabled services, route dataset, restored backup identity, and data-loss window. Restore AWS CLI access without exposing credentials. | 1–2 d | Owner confirms project/profile/Region and supplies valid access; deployment owner identifies host. | Read-only identity/inventory succeeds for account `083712835043` in `eu-north-1`; deployed revision matches the exact green candidate; a signed baseline manifest distinguishes committed and uncommitted files. | No deployment or resource creation during reconciliation. If access suddenly fails after previously working, owner checks **AWS Settings → Billing** for plan/spend-limit pause. |
| **P0-2** | **Fix booking retry/order integrity.** Owner: mobile + backend engineers; QA verifies. Preserve/reconcile persisted commands on ambiguous post-lock responses; close the PostgreSQL replay/lock race rather than special-casing only `quote_consumed`. | 2–4 d | P0-1; loopback PostgreSQL fixture; no concurrent writer in the touched booking files. | `npm test -- --filter=booking-retry-race` passes with PostgreSQL Part A explicitly executed, not `SKIP`; concurrent first-attempt commit + retry yields exactly one order and a recoverable command; restart/device tests cover timeout-after-commit, double tap, quote expiry, and changed-payload rejection. | Feature remains disabled if any ambiguous response can drop command identity. Revert code only through a compatible release; never delete existing command/order rows as remediation. |
| **P0-3** | **Restore a truthful full compile/test gate.** Owner: backend/runtime engineer + QA. Preserve the passing canonical server check, exclude non-application research artifacts through the project’s intended TypeScript layout, resolve the root typecheck OOM/scope failure, diagnose `clean-typecheck` timeout, and reproduce/fix parcel connection reset. Do not alter `opencode.ts` for the retracted audit-config errors. | 1–3 d | P0-1; preserve unrelated `research_notes` content; no test deletion or timeout masking. | `npm run typecheck` (root plus `tsconfig.server.json`), `npx expo lint`, and full `npm test` complete on the canonical tree; `clean-typecheck` exits normally; repeated full runs have no parcel reset. Record exact counts and environment. The 99-file diagnostic is not accepted as the registry gate. | No `@ts-ignore`, skipped/deleted tests, relaxed assertions, or longer timeout used to conceal failure. Roll back only the offending code change, not test coverage. |
| **P0-4** | **Conditional cutover gate: prove PostgreSQL parity and a safe migration/rollback contract before cutover.** This is not a prerequisite for a release that remains on the supported single-host SQLite topology. Owner: database/backend + deployment owner; owner approves window. Provide a production-capable importer, continuous writer freeze, representative-data rehearsals, engine/PostGIS compatibility, worker startup, and backend-aware recovery. | 5–10 d | P0-1 through P0-3; owner selects PostgreSQL cutover; approved staging, engine/version, spend, backup, and maintenance window; local PostgreSQL 18/PostGIS 3.6 or CI-parity fixture for tests. | With a loopback `WIND_TEST_DATABASE_URL`, `npm run test:persistence` passes, including `pg_dump`/`pg_restore`; booking Part A runs. Three representative rehearsals reconcile row counts, orders, cash/COD, custody, outbox, sequences, and schema. A post-first-write failure drill proves forward recovery; restore proof and owner sign-off precede production writes. | Freeze writes before snapshot through cutover validation. Keep the original SQLite copy untouched until reconciliation and owner acceptance. **After authoritative PostgreSQL writes, do not roll back to stale SQLite; recover forward or restore under the approved data-loss procedure.** |
| **P0-5** | **Close immediate-capture settlement and post-capture conflict recovery before payment activation.** Owner: payments/backend + finance operator. Cover creation, `getIntent`, direct `query`, and webhook paths; enforce payable order state; prevent conflicting cash/card settlement; define provider void/refund plus local reconciliation when capture succeeds but the settlement gate fails. | 3–5 d | P0-1, P0-3, P0-4 for PostgreSQL-backed activation; named provider/commercial/compliance decisions for any real PSP. | Regressions fail on old control flow and pass on the fix for immediate `captured` creation, direct query, duplicate query/webhook, cancelled/delivered order refusal, and cash-first/card-first conflicts. A post-capture 409 never leaves an unreconciled provider capture/local pending intent: compensation or an explicit durable exception workflow is proven. Controlled finance walkthrough reconciles intent, provider reference, order, receipt, and ledger. | Keep digital payments disabled until this and P0-4 pass. Test-fake results are not real-payment evidence. Real capture requires separate owner authorization, controlled transaction, refund/reconciliation proof, and rollback/disable switch. |
| **P0-6** | **Prove AWS recovery and human alert delivery.** Owner: deployment/operations + accountable on-call person. Restore a selected backup into an isolated throwaway environment with providers disabled; repeat replacement-host recovery including secrets/configuration, Caddy/cron, and OSRM rebuild. Configure owner-approved minutes-level monitoring and test API/map failure notifications. | 3–6 d | P0-1; owner approves numeric RPO/RTO, retention, alert recipient/service/budget, and any paid resources; a separate least-privilege restore principal has S3 read access because the host role is upload-only. | Dated timed restores at representative volume reconcile users/orders/cash/custody/outbox and application compatibility; measured RPO/RTO meet owner targets. A person acknowledges both induced API and map alerts; backup-marker/restore failures alert too. | No production restore drill or provider callbacks in the isolated environment. Preserve backups until retention/deletion approval. Existing single-host topology remains until recovery evidence supports change. |
| **P0-7** | **Conditional scaling gate: prevent unsafe scaling and prove coordination before a second instance.** This does not block a release that keeps one compatible SQLite API process and no durable worker. Owner: backend/runtime + deployment owner. Add shared realtime wake-up/reconciliation and scheduler ownership/leases; verify worker/provider behavior. | 4–8 d | Owner selects multi-instance scaling; P0-4; staging with two API/worker instances; no SQLite durable-worker assumption. | Two-instance concurrency/soak test shows no duplicate assignment, scheduled job, notification, or local-budget bypass and no lost live event; reconnect reconciles authoritative API state; readiness identifies unsafe configuration. | Default remains one SQLite API process and no durable worker. Roll back to one compatible instance without losing queued work; PostgreSQL rollback follows P0-4, never stale SQLite. |
| **P0-8** | **Prove launch-role journeys on a physical release build.** Owner: mobile QA + mobile/backend engineers + operations. Cover customer, driver, COD/remittance, admin/support, recipient tracking, reconnect/process death, push, Arabic/English, and accessibility on the attached SM-A5360; then representative pilot devices. | 4–8 d | P0-1 through P0-3; signed release build; attached physical phone and prepared test backend; resolved `ps.wind.app.testdriver` launch failure; k5 authorization if remote-only work is required. | Fresh matrix records device/OS, app build, backend revision, route data, provider modes, language/network, and artifacts. Two-role parcel trip and cash settlement reconcile; reconnect never duplicates order/COD; admin/support sees the same timeline. No emulator substitution. | Stop rollout on order, money, privacy, or safety failure. Keep prior signed compatible APK/server pair available; an OTA is not assumed to roll back native or database changes. |
| **P0-9** | **Close authorization/privacy, safety/incident, and Palestinian geo-field gates for the enabled launch scope.** Owner: security/backend + geo/operations + local reviewer + accountable safety owner. Exercise cross-role/object denial, revoked sessions, tracking expiry, private media/log/notification redaction; pin route/place data and validate pilot route legality, explicit recipient identity/address-light flow, tracking recovery, fraud exceptions, staffed incident escalation, and service-suspension authority. | 6–12 d | P0-1; named pilot geography/category; owner-approved privacy/retention/safety policies and local operations review; P0-8 for field validation. | Deny-by-default integration matrix passes; no public private objects or sensitive lock-screen/log leakage. Recipient name/contact, area, landmark/directions and optional pin are validated before dispatch. Versioned route/place dataset rebuild/rollback passes; local reviewer approves the pilot corpus and every exception has manual fallback; disconnect/reboot tests converge without stale overwrite. A live drill reaches the accountable incident owner. | Keep rides/freight/auto-dispatch and uncovered districts off. Revert to prior versioned route dataset or manual operations on bad geo release; never silently substitute straight-line/illegal routes. Suspend the affected workflow on unresolved safety/privacy exposure. |
| **P0-10** | **Prove cash/COD, recipient handover, and driver settlement before cash launch.** Owner: backend/finance + driver operations + mobile QA. Make expected/collected/remitted amounts, collector, actor, timestamps, discrepancy reasons, corrections/reversals, recipient confirmation, refused/unavailable/partial/returned outcomes, and per-driver/day reconciliation explicit and auditable. | 3–6 d | P0-1 through P0-3, P0-8 and P0-9; owner-approved COD schedule, proof, adjustment, debt/overdue, retention, and reconciliation policies. | API and physical two-role journeys reconcile order, cash, custody, recipient handover, driver expected-vs-collected-vs-settled totals, and admin correction history. Duplicate/replayed collection or settlement is idempotent; disconnected recovery does not duplicate COD; exportable finance summary matches authoritative rows. | Keep cash launch disabled on unreconciled discrepancies or missing handover identity. Never destructively edit financial history; use attributed correction entries and preserve audit/export records. |

### P1 — operational hardening and measured pilot quality

P1 does not permit deferring a safety-critical basic notification needed for the enabled launch journey: P0-8/P0-9 must prove those basic alerts. P1-1 covers the broader receipt/token lifecycle and richer channels; any accepted residual gap must be explicit in the owner's go/no-go record.

| ID | Work and owner | Effort [I] | Dependencies | Acceptance evidence | Rollback / safety gate |
|---|---|---:|---|---|---|
| **P1-1** | **Complete notification lifecycle.** Owner: backend/mobile + operations. Token rotation/logout/multi-device ownership, Expo receipt polling, invalid-token quarantine, deep links, localized fallback timeline, and failure alerts. | 3–5 d | P0-2, P0-8; approved Expo/provider configuration. | Tests and physical journeys cover ticket versus receipt, denied permission, rotated/invalid token, killed app, duplicate/late message, and authoritative in-app recovery. | Queued/ticketed never means delivered. Disable problematic channel without hiding order state; redact payloads and preserve fallback. |
| **P1-2** | **Make CI/CD and mobile distribution reproducible.** Owner: release lead + DevOps. Add canonical AWS template/policy validation, release-SHA check, staging smoke, signed APK hosting/install-over-old test, and compatibility/minimum-build policy. Serialize deploy and watchdog operations and prove SQLite schema/rollback compatibility. | 3–6 d | P0-1, P0-3; owner-approved CI/EAS credentials and distribution channel. | Exact green SHA flows through verify, persistence, image build/digest, deployed revision, and signed APK; the current uncommitted Dockerfile runtime-layout change has a fresh image/build/smoke result. Fresh install and upgrade preserve safe session/command recovery; AWS change-set review refuses retained-host/edge replacement. Failed readiness cannot trigger competing watchdog/deploy restarts. | Separate merge, image push, host deployment, and binary distribution. Previous signed artifact/server compatibility and database `user_version` compatibility are tested; code-only rollback is rejected when the old API cannot open the database. OTA remains undecided, not assumed. |
| **P1-3** | **Operational observability, support, and data governance.** Owner: operations + backend + finance/privacy owner. Add retained searchable logs, correlation IDs, queue/provider/backup metrics, actionable alerts/runbooks, support exception queues, and retention/deletion rules. | 4–7 d | P0-6; named on-call/support/finance owners; approved data-classification policy. | Induced booking, payment/COD, push, backup, and route failures reach an owner with a runbook; support finds command/order/ledger timeline without secrets; analytics reconcile to transactions. | Redact PII/tokens/precise location. Preserve financial/audit history and backups under approved holds; no lifecycle deletion before owner approval. |
| **P1-4** | **Arabic quality, accessibility, offline UX, and low-end performance.** Owner: mobile/UX + fluent Palestinian Arabic reviewer + QA. | 4–8 d | P0-8 baseline; representative content/devices and owner-approved performance budgets. | Fluent review plus screen-reader/focus/touch-target/dynamic-text checks; poor-network and app-upgrade recovery; measured cold/warm start, booking/offer response, map interaction, memory/battery against approved budgets. | Do not trade safe command recovery for speed. Roll back visual/performance changes independently where contracts are unchanged. |
| **P1-5** | **Calibrate ETA and dispatch from real pilot data.** Owner: geo/dispatch + operations/data reviewer. | 4–8 d after corpus exists | P0-9 route legality/tracking; sufficient consented representative trips; manual dispatch fallback. | Report median/tail error and coverage by district/category/time using actual route versions; concurrency tests show no double assignment; candidate decisions are explainable and manual takeover works. | Keep automatic dispatch gated until thresholds are owner-approved. Revert to manual assignment and prior route/ETA version without changing order authority. |
| **P1-6** | **Complete only owner-selected expanded workflows.** Owner: product + backend/mobile + operations. Rides/freight/multi-stop, merchant bulk/reconciliation, onboarding/subscription/referral, and scheduled work are separate activation slices, not one “all services” flag. | 3–8 d per slice | P0 gates for shared booking/money/tracking; named category tariff, vehicle/crew rules, support and finance procedures. | Each selected slice passes happy path plus refusal, cancellation, reconnect, duplicate submission, exception, receipt, and admin reconciliation on API and physical device. | Default each service off. Per-service kill switch; no shared-schema rollback that destroys another enabled service’s data. |
| **P1-7** | **Close test-environment and release-performance evidence gaps.** Owner: QA + DevOps. Provide isolated per-session PostgreSQL ports/folders, restore k5 access if authorized, and run browser/load/soak/provider-degradation suites against the canonical build. | 2–5 d | P0-1, P0-3; owner supplies authorized k5 account/key; local loopback PostgreSQL/PostGIS and browser dependencies. | `test:persistence`, scenario/access/location/readiness suites, and bounded `test:load` complete with explicit environment labels. No shared k5 folder/port overwrite; production SLOs are separately measured and approved. | Never point local load/import tools at staging/production. Local load numbers are not production evidence; stop on resource contention rather than claiming a pass. |

### P2 — only after measured pilot stability and owner approval

| ID | Work and owner | Effort [I] | Dependencies | Acceptance evidence | Rollback / safety gate |
|---|---|---:|---|---|---|
| **P2-1** | Reassess single-host EC2/SQLite versus ECS/Fargate/RDS using actual availability, recovery, operational burden, and cost. Owner: architecture/deployment + owner. | 2–4 d analysis; migration separately estimated | Stable P0/P1 evidence, AWS inventory/cost, owner architecture decision. | Written decision compares measured SLOs and total cost; any migration has its own staging, rehearsal, reconciliation, and rollback plan. | ECS/RDS is a proposal, not current topology or an automatic prerequisite. No resource creation solely to match a diagram. |
| **P2-2** | Consider extra EBS snapshots, self-hosted tiles, richer observability, owned domain, and OTA. Owner: operations/release + owner. | Per option | Approved budget/privacy/security and recovery ownership; signed distribution first for OTA. | Each option has a measured need, restore/update test, and total-cost/security review. | Preserve existing backups and CloudFront hostname used by installed APKs until migration is proven. No backup deletion or native rollback assumption. |
| **P2-3** | Expand districts/categories, scheduling, batching, promotions/loyalty, and optional digital payment breadth only from pilot demand/unit economics. Owner: product/operations + relevant engineers. | Per slice | P0/P1 launch gates, owner-approved market/provider/legal requirements. | Named cohort, success thresholds, support/finance readiness, and reversible staged rollout. | Per-feature flag and prior compatible version; financial/provider changes retain independent reconciliation and disable controls. |
| **P2-4** | Reproduce or deepen competitor evidence only for a remaining product question. Owner: research lead under written lawful scope. Start with the existing Uber 4.655/Shiply/Souq Tulkarm study rather than repeating completed static work; prioritize unresolved acquisition provenance, Shiply driver evidence, Careem/HAAT artifacts, and authorized runtime questions. | 2–6 d per artifact/question | Lawful acquisition/scope; access to exact recorded artifacts; no protection bypass or proprietary copying. | Re-hash every artifact, resolve “pulled from phone” versus “phone not touched” provenance, preserve failures, regenerate coverage, and label static versus authorized dynamic observations. | Missing artifacts remain an evidence gap, never filled by inference. Static API shapes/UI copy never become server-guarantee or security claims. |

## 5. Required execution order and go/no-go record

1. **Baseline and access:** P0-1. No credible release gate can be assigned until the exact source/build/deployment is known.
2. **Current integrity gates:** P0-2 and P0-3 in parallel only with separate file owners; restore the local PostgreSQL fixture concurrently for P0-4.
3. **Money/data/recovery:** P0-6 recovery evidence remains required. Apply P0-4, P0-5, and P0-7 only when their cutover, payment-activation, or scaling scope is selected. Payment activation and production migration each require separate owner approval; successful tests do not authorize either.
4. **Launch evidence:** P0-8 through P0-10 on the exact candidate. Historical smoke/screenshots cannot substitute; cash launch requires the P0-10 reconciliation evidence.
5. **Pilot hardening:** P1 items according to enabled scope and measured need.
6. **Expansion:** P2 only after the accountable owner signs a go/no-go record listing every P0 result, accepted P1 residual risk, provider modes, support/on-call readiness, RPO/RTO, rollback, and restore evidence.

A production PostgreSQL migration is not complete until **representative rehearsal + isolated restore proof + financial reconciliation + post-first-write rollback/forward-recovery verification + explicit owner approval** all exist. Resource creation, schema migration, a green fixture, or a copied handoff is not completion.

## 6. Blockers and exact owner actions

| Blocker | Owner action needed | Verification after restoration |
|---|---|---|
| Local PostgreSQL refused `127.0.0.1:55473`; booking Part A lacked `WIND_TEST_DATABASE_URL` | Provide an isolated loopback PostgreSQL/PostGIS fixture and matching client tools. Do not reuse another session’s k5 folder/port. | Set the loopback `WIND_TEST_DATABASE_URL`, then run `npm run test:persistence` and `npm test -- --filter=booking-retry-race`; confirm Part A does not log `SKIP`. |
| Canonical root typecheck OOM / polluted by `research_notes`; canonical server check passes | Engineering fixes root config/layout under P0-3; do not change `opencode.ts` for the invalid seven-error audit scan. Owner need not supply production secrets. | `npm run typecheck` completes with exit 0 on canonical tree; `clean-typecheck` also passes. Preserve the server-check pass. |
| AWS credential/CLI failure | Restore AWS CLI on PATH or deliberately use the disclosed isolated CLI; provide valid owner-authorized access for profile `osama`; confirm project and Region in AWS Settings. If previously working operations suddenly deny access, check Billing/spend limit and paid-plan status. | Read-only caller identity and inventory return the expected account/Region; then capture deployed revision/configuration without printing secrets. |
| Launch operating decisions are not all recorded | Owner records pilot geography/category/hours/cohort, COD-only versus PSP, manual versus automatic dispatch, service/SLO/SLA thresholds, staffed safety escalation, provider/budget choices, retention/deletion, Arabic/accessibility reviewer, signing/OTA/rollback authority, and accountable operations/support/finance/privacy/local-road owners. | The signed go/no-go record maps every enabled scope to an accountable owner, numeric acceptance threshold, approved provider/policy, fallback, and rollback authority. |
| Device launch `Unexpected launch result for ps.wind.app.testdriver` | Attach/prepare SM-A5360, install the matching signed test/release build, and preserve the phone’s Chrome profile and required test-backend forwarding. If unavailable, stop rather than start an emulator. | Fresh P0-8 matrix records actual launch and journeys against identified app/backend builds. |
| k5 remote testing unavailable | Owner supplies the authorized account/key; current root instructions say configured keys were refused. | Run a bounded remote identity/environment check and label subsequent results with host/folder/port. Local runs remain labelled local. |
| Real provider/production behavior absent | Owner names provider, commercial/compliance owner, test credentials, controlled transaction, and activation/rollback authorization. | Controlled capture/refund/reconciliation evidence is labelled real-provider; fake/fixture outcomes remain excluded. |

## 7. Audit close

**Newly established by this audit:** fresh Expo lint and canonical server typecheck pass with exit 0; the earlier seven-error application diagnostic is configuration-invalid and retracted; the direct 99-file run has 103 results (96 passes and seven classified failures); booking command loss is reproducible; parcel passes only on isolated rerun; Node 24.12.0 SQLite execution works locally. Three independent reviews were reconciled in [INDEPENDENT-REVIEW.md](./INDEPENDENT-REVIEW.md), including the requested NVIDIA-provider model.

**Still not established:** canonical full-suite pass, canonical full `npm run typecheck` pass, live AWS identity/state/cost, deployed revision, current CI, physical release matrix, live provider capture, representative production restore, production load/SLOs, numeric RPO/RTO, or production readiness. The booking server-race Part A, four PostgreSQL-backed suites, and extended physical-device journeys remain blocked as detailed above.

## 8. Research tooling and mutation disclosure

The earlier audit workspace also contains `research_notes/Fable 5.2 verified execution handoff/.venv-aws/` (isolated AWS Python/CLI tooling) and `research_notes/Fable 5.2 verified execution handoff/rea/` (a clone of `https://github.com/morluto/rea.git` at `937d10df1c709c8b2f5af8d9406ef735d0b3a2dc`). These predate this reconciliation and were omitted from the original mutation statement; they are disclosed here and were not deleted. The NVIDIA worker also created `final-classification-report.md` despite its read-only brief; that deviation was confined to `research_notes` and is recorded in the independent-review ledger.

This reconciliation created/edited only research documentation and evidence logs. Earlier bounded checks may have produced their normal test/tool artifacts. No application source, test, infrastructure, production data, or Git state was changed; all pre-existing owner modifications remain untouched. No new AWS call, production operation, real-payment transaction, or credentialed benchmark was performed.
