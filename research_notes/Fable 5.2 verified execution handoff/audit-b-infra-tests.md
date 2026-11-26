# Audit B — infrastructure, recovery, release and test evidence

**Date:** 13 November 2026  
**Mode:** independent source audit with bounded local fallback checks; no deployment, AWS, migration or device commands executed  
**Verdict:** **Pilot topology and recovery automation are present in one worktree, but production identity, current AWS state, alert delivery and a fresh AWS restore are not independently verified. Root source also has an immediate-capture settlement gap that must be closed before enabling that payment path. PostgreSQL production cutover remains gated. Do not treat either handoff as proof of production readiness.**

## 1. Scope, source identity and evidence rules

The two handoffs reviewed were:

- `reports/Fable 5.2 production upgrade handoff.md`, especially its proposed AWS architecture and migration gates at lines 372–401 and its CI/EAS/DR requirements at lines 437–481.
- `.claude/worktrees/leftover-tasks-4716c1/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md`, especially its claimed current topology at lines 74–85, gate ladder at lines 153–169, operations work at lines 177–193 and owner decisions at lines 346–370.

For readability, **`WT/` below means exactly `.claude/worktrees/leftover-tasks-4716c1/`**. Thus every `WT/path:line` citation is an exact file-and-line citation in that worktree, not in the root checkout.

Observed Git identity:

- Root checkout: `HEAD=b60922952d607f698eee24b9c68ac3394daecd3c`; `origin/master=b89f2205965523b5ab8545dff3940d1eacb6062c`. The root has extensive pre-existing modified and untracked files.
- Worktree: `HEAD=af27c485ed09471c4cbe3b39dafda0b7ae6714df`; no tracked modifications were reported by `git status --short --untracked-files=no`.
- Consequently, the second handoff's “read in `origin/master` at `b89f220`” label (`WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:11`) is not, by itself, evidence that the current worktree or root checkout is that revision.

No AWS calls, network probes, device commands, migrations, builds, full test suite, PostgreSQL suite or browser suite were run. Four bounded local fallback checks were executed against the root checkout: lint passed, one focused activation-gates suite passed, the dependency audit policy passed, and typecheck aborted on Node heap exhaustion. These are **local evidence only**, not k5, CI, device or production evidence. Historical `[ran]` claims are reported as historical, not reproduced. Several unexecuted commands intentionally write `.expo/`, `.artifacts/`, `docs/screens/` or disposable databases. `check:audit` wrote `.artifacts/dependency-audit/raw.json` as its normal output; application source, tests, configuration and Git state were not intentionally changed.

## 2. Claim reconciliation

| Claim | Reconciled finding | Evidence state |
|---|---|---|
| Production is one AWS EC2 host with API, OSRM and Caddy, SQLite, CloudFront, ECR and S3 backups. | The template and operating document describe exactly that topology. **Neither `infra/aws/wind.yaml` nor the AWS deployment section exists in the root checkout.** The worktree is the only reviewed source for it. | Source-backed design/operator assertion, not live verification: `WT/infra/aws/wind.yaml:1-5`, `WT/docs/operations/deploy.md:17-32`. |
| AWS is live and `/api/ready` returned 200 with schema 3. | The 13 November handoff records a 0.65-second successful response, but this audit did not repeat it. Running image digest/revision and the restored backup identity are explicitly unrecorded. | Historical runtime claim and explicit gaps: `WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:78-81`. |
| Azure is the current deployment target. | Root deployment documentation is Azure-only and says workloads remain disabled. The worktree preserves that preparation material but adds an AWS production section and calls the Azure VM historical. Root guidance is therefore stale for the claimed 12 November migration. | `docs/operations/deploy.md:1-3`; `WT/docs/operations/deploy.md:17-24`, `WT/docs/operations/deploy.md:44-46`. |
| ECS/Fargate + RDS is the production architecture. | It is a **proposed target** in the first handoff, not the reviewed current topology. Current source evidence describes one EC2 host and SQLite. Do not report ECS/RDS as deployed. | Proposal: `reports/Fable 5.2 production upgrade handoff.md:372-383`; current template: `WT/infra/aws/wind.yaml:122-190`. |
| PostgreSQL is available for tests/staging, not production. | Verified in root source. Without a URL it selects SQLite. Non-loopback PostgreSQL requires staging mode, `sslmode=verify-full`, and the fixed `wp16_staging` schema. Otherwise only loopback, isolated-schema test mode is accepted. | `server/db/runtime.ts:4-27`. |
| The durable worker supports the current SQLite production topology. | False. `DurableWorker` throws unless the backend is PostgreSQL, and its standalone entrypoint requires an explicitly gated PostgreSQL URL. | `server/worker.ts:20-38`, `server/worker.ts:236-245`. |
| The repository has 131 integration suites. | True for the current worktree registry; **the root registry has 106**. Both runners stop on the first failed child, so a short run is not a full pass. Neither count is a fresh test result here. | Root list and fail-fast behavior: `scripts/run-tests.mjs:6-113`, `scripts/run-tests.mjs:129-138`; worktree list and fail-fast behavior: `WT/scripts/run-tests.mjs:6-138`, `WT/scripts/run-tests.mjs:154-164`. |
| CI provides the full release gate and AWS image deployment. | Root CI has `verify`, `persistence`, and a local image-build job; root also has Azure validation. It has no AWS release or uptime workflow. Those exist only in the worktree. The worktree release workflow pushes an image but deliberately leaves host deployment separate and does not itself require the candidate's CI to be green. | `.github/workflows/ci.yml:10-90`; `.github/workflows/azure-validate.yml:1-52`; `WT/.github/workflows/release-image.yml:1-5`, `WT/.github/workflows/release-image.yml:16-28`; `WT/docs/operations/deploy.md:34-42`. |
| Android has no OTA update path. | Verified for reviewed source: `expo-updates` is absent from dependencies, while EAS build/submit profiles exist. Native client fixes therefore need a newly built and distributed binary. `public/map.html` is separately served by the API and can change with the server image. | `package.json:5-47`; `eas.json:1-23`; root server-backed map WebView: `src/route-map.android.tsx:19-24`; worktree handoff: `WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:83-84`. |
| Payment capture always passes through the settlement gate. | **False for immediate capture in root source.** `createIntent` can store and return `captured` without calling `settlementGate`; only the later query and webhook paths call it. Payments remain PostgreSQL/schema-17 gated and the reviewed provider is a test fake, so this is a release-blocking code path for future activation, not a claim of live PSP exposure. | `server/domain/payments.ts:29-48`, `server/domain/payments.ts:53-63`, `server/domain/payments.ts:68-95`, `server/domain/payments.ts:192`; existing webhook-only cash-first coverage: `tests/payments.mjs:152-158`. |
| Nightly AWS backup and restore are proven. | Scripts implement nightly SQLite `VACUUM INTO`, integrity check, gzip, S3 upload, 14-day local retention and a success marker. Restore validates a copy, clears sessions/subscriptions, swaps files and attempts rollback on failure. This proves code presence, not a current scheduled run or fresh AWS restore. | `WT/infra/vm/wind-backup.sh:1-23`; `WT/infra/vm/wind.cron:1-4`; `WT/infra/vm/wind-restore.sh:1-58`. |
| A restore drill proves recovery at current production volume. | False. The documented 6 November drill used two users and no orders. The 12 November Azure→AWS move is recorded as end-to-end, but which source backup was restored and any lost data window remain unknown. No fresh AWS isolated restore at representative volume is evidenced. | `WT/docs/operations/restore.md:45-58`; `WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:80`, `WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:181-193`. |
| The external monitor provides timely outage notification. | The worktree has an hourly GitHub Actions readiness/tile check. Its notification depends on GitHub settings and delivery has not been proven; the ledger also records an Actions billing refusal on 10 November. Current delivery/schedule state is unknown. | `WT/.github/workflows/uptime.yml:1-32`; `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:73`. |
| Root `CURRENT-WORK.md` is a current deployment record. | It ends with 3 November checkpoints, explicitly says no deployment occurred, and cannot reconcile the claimed 12 November AWS move. | `docs/CURRENT-WORK.md:1-15`. |
| The 48-row ledger is available in the root checkout. | It is absent from root and present only in the worktree. Its entries mix source, carried and executed evidence; it is not a fresh all-green release record. | `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:1-16`, `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:64-76`. |

## 3. Deployment topology and CloudFormation review

### 3.1 Source-backed AWS design in the worktree

- **Compute:** one pinned-AMI `t3.small`, 30 GiB encrypted gp3, 2 GiB swap, Elastic IP, IMDSv2, retained host and non-deleting root volume. This is a single-host pilot with host/database recovery coupling, not high availability (`WT/infra/aws/wind.yaml:13-21`, `WT/infra/aws/wind.yaml:122-156`).
- **Network:** HTTPS ingress is restricted to the CloudFront origin-facing prefix list; port 80 is open for certificate/redirect handling. CloudFront uses HTTPS to an sslip.io origin, passes an edge secret, disables caching and sets error TTLs to zero (`WT/infra/aws/wind.yaml:113-120`, `WT/infra/aws/wind.yaml:158-202`). Correct deployed Caddy behavior and certificate state were not checked.
- **Data:** SQLite is on host storage, not RDS. The backup bucket is private, encrypted, versioned and retained, with TLS-only policy and no lifecycle expiry (`WT/infra/aws/wind.yaml:56-85`). Host-role S3 access is write-only (`WT/infra/aws/wind.yaml:87-107`).
- **Release identity:** ECR tags are immutable, scan-on-push is enabled, and the OIDC role is constrained to `master` and the named workflow. The deploy script pulls by digest and checks the OCI source-revision label before backup/switch (`WT/infra/aws/wind.yaml:46-54`, `WT/infra/aws/wind.yaml:204-240`; `WT/infra/vm/deploy.sh:12-35`).
- **Operational gaps visible in source:** detailed EC2 monitoring is off, and the template declares no CloudWatch alarm, AWS Backup plan, RDS instance, ECS service, second host, or owned domain (`WT/infra/aws/wind.yaml:122-137`). These are not accusations of runtime failure; they are missing source-backed capabilities that need explicit acceptance or remediation.

### 3.2 Release and rollback boundary

The digest/revision controls are useful, but rollback only renames/restarts containers and retains the host database (`WT/infra/vm/deploy.sh:36-61`). That is acceptable only while schema/backend compatibility holds. It is unsafe after PostgreSQL accepts authoritative writes: the old container may carry the old SQLite environment. The worktree deployment guide states the correct boundary—freeze and recover forward after the first authoritative PostgreSQL write (`WT/docs/operations/deploy.md:100-104`). Ledger rows 35–37 keep hosting, production import and cutover/rollback open (`WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:102-104`).

The release workflow also does not verify that CI passed for the submitted SHA; the operator must compare the workflow's exact `headSha`, digest and revision with the green candidate (`WT/docs/operations/deploy.md:36-42`). A merge, image push, host deployment and Android binary distribution are four separate events.

## 4. Database, workers, schedulers and process-local state

### SQLite/PostgreSQL gates

- Root production startup requires an absolute persistent `DB_PATH`, support contact and explicit identity mode; enabled services default to parcel only (`server/main.ts:58-80`). The Docker image defaults to SQLite at `/data/wind.db` and starts only `server/main.ts`, not the durable worker (`Dockerfile:22-36`).
- The PostgreSQL staging initializer is owner-run and requires `--confirm`, non-loopback TLS-verified URL and staging mode (`scripts/migrate-postgres.mjs:1-34`). It is not a production data importer.
- The SQLite→PostgreSQL importer CLI is restricted to loopback test rehearsals (`server/migrate.ts:231-241`). Its `--freeze-writes` lock covers snapshot creation and is rolled back before import, not held through cutover (`server/migrate.ts:35-45`). A production importer and continuous writer freeze remain open.

### Process-local behavior that blocks naive scaling

- Live tracking uses in-process waiters and explicitly requires shared pub/sub for multiple API instances (`server/main.ts:2469-2505`).
- Route geometry and routing health are process-local (`server/main.ts:2513-2528`). This affects cache coherence/efficiency and observed health, although PostgreSQL/SQLite remains the order authority.
- Each API process runs presence sweeping every 15 seconds, hourly pruning, scheduled-job release alerts every minute and stale-demand expiry every minute (`server/main.ts:3261-3275`, `server/main.ts:3333-3344`). Multiple replicas would duplicate these schedules unless leader election, leases or idempotent single-owner execution is proven.
- The durable worker has PostgreSQL `SKIP LOCKED` leases, bounded retries and idempotent inbox handling (`server/worker.ts:51-83`, `server/worker.ts:140-180`), but cannot run against SQLite. Real Expo delivery is separately gated and a successful ticket is not a receipt (`server/worker.ts:183-201`).

**Operational conclusion:** keep the SQLite API at one process/host and do not activate the durable worker there. Before multiple API/worker instances, complete PostgreSQL cutover, shared realtime wake-up/reconciliation, scheduler ownership and a two-instance concurrency test. This matches the first handoff's two-instance acceptance gate (`reports/Fable 5.2 production upgrade handoff.md:384-399`).

## 5. Backup, restore and disaster recovery

### What is implemented in source

- Worktree nightly backup creates a consistent SQLite copy, checks integrity, uploads to private versioned S3, updates `last-ok` only after upload and retains 14 days locally (`WT/infra/vm/wind-backup.sh:1-23`). Cron requests 03:10 UTC nightly and a minutely watchdog (`WT/infra/vm/wind.cron:1-4`).
- Worktree API code alerts when the marker is over 26 hours old; this code is absent from the root `server/main.ts`, another reason not to mix source states (`WT/server/main.ts:1208-1219`).
- Restore checks integrity and foreign keys, removes sessions and push subscriptions, preserves the previous DB and rolls back failed swap/start/readiness (`WT/infra/vm/wind-restore.sh:15-58`). Operators must reapply later blocks/deletions before reopening public ingress (`WT/docs/operations/restore.md:28-45`).
- Root backup material is Azure-oriented. Its PowerShell transport uses Windows DPAPI and a remote Azure VM; it is not an AWS backup solution (`scripts/backup-azure.ps1:1-16`, `scripts/backup-azure.ps1:86-111`). Root restore documentation explicitly says no real restore was run by that preparation task (`docs/operations/restore.md:1-10`).

### What remains unproven or undecided

1. The actual restored backup, data-loss window and running image/revision for the 12 November AWS move.
2. A fresh, timed AWS restore into isolation at representative volume, including order/cash/custody/outbox reconciliation and provider disablement.
3. Numeric RPO/RTO. Nightly copies imply roughly a day of potential data loss; local 14-day retention is not the S3 retention policy.
4. S3 retention/deletion. The template has no expiry and the restore guide warns that deleted-account data remains in backups (`WT/infra/aws/wind.yaml:56-71`; `WT/docs/operations/restore.md:54-58`).
5. Replacement-host recovery of environment/secrets, Caddy, cron and the OSRM graph. The guide says these must be recreated; the OSRM graph is rebuilt, not restored (`WT/docs/operations/restore.md:38-45`).
6. Independent second restore points such as EBS snapshots are proposed, not implemented or authorized (`WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:185-193`).

## 6. CI, OTA and test-command inventory

### 6.1 Executed local fallback checks

These commands ran from the root checkout. They did not use production secrets or a production database.

| Command | Observed result | Evidence limit |
|---|---|---|
| `npm run lint` | **Passed.** | Local lint only; no runtime or deployment proof. |
| `npm test -- --filter=activation-gates` | **Passed: 1 suite.** | One focused suite, not the 106-suite root registry or 131-suite worktree registry. |
| `npm run check:audit` | **Passed.** Raw audit counts: 1 low, 13 moderate, 0 high, 0 critical. | Point-in-time registry result under the repository exception policy; wrote `.artifacts/dependency-audit/raw.json`. |
| `npm run typecheck` | **No completed typecheck result.** After about 70 seconds Node aborted with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`. | Environment/resource failure, not evidence of a TypeScript error and not a passing gate. No increased-heap retry was run. |

No full `npm test`, `test:persistence`, browser suite, live deployment check, CloudFormation deployment validation, device test or fresh restore drill was performed. The source audit and four bounded checks above must not be presented as a full release gate.

### 6.2 Command inventory and prerequisites

Run from the intended canonical checkout after `npm ci`; use Node 24.12.0 to match CI (`.github/workflows/ci.yml:31-36`). `npm run lint`, `npm run typecheck`, `npm test` and focused test filters need no production secrets. Commands marked as writing artifacts are not read-only.

| Command | Static purpose and prerequisites | Side effects / evidence limits |
|---|---|---|
| `npm run typecheck` | Client and server TypeScript checks (`package.json:54`). | **Attempted locally; aborted on Node heap exhaustion.** No test execution; no completed typecheck verdict. |
| `npm run lint` | Expo ESLint (`package.json:62`). | **Passed locally.** Cannot prove runtime behavior. |
| `npm test` | Root: 106 registered suites, fail-fast. Worktree: 131. Registry rejects orphaned/duplicate `*.test.mjs` files (`scripts/run-tests.mjs:114-138`). | **Full run not performed.** Creates disposable DBs and may write test artifacts. A failure stops later suites. Historical counts are not current passes. |
| `npm test -- --filter=<text>` | Focused registry subset; useful for a small regression (`scripts/run-tests.mjs:129-136`). | **`activation-gates` passed locally (1 suite).** Other filters were not run; only selected suites execute. |
| `npm run test:contracts` | Runs the registry's `contracts` filter rather than a second inventory (`scripts/check-contracts.mjs:1-8`). | Subset only, not full API/device acceptance. |
| `npm run test:persistence` | 52 listed persistence files plus the legacy PostgreSQL runner (`scripts/check-persistence.mjs:5-29`). Requires local loopback PostgreSQL; default DSN is `127.0.0.1:55473`, isolated schemas are created, and non-loopback is refused (`tests/pg-support.mjs:4-23`). | Needs PostgreSQL 18/PostGIS 3.6 for CI parity and matching client tools. `pg-import.mjs` invokes `pg_dump`/`pg_restore` (`tests/pg-import.mjs:111-122`). Writes isolated DBs/reports; never point at staging/production. |
| `npm run test:dependency-security` | One registered dependency-security suite (`package.json:72`). | Not a substitute for the native audit gate. |
| `npm run check:audit` | Runs native `npm audit --json` and applies the reviewed exception policy (`scripts/check-audit.mjs:64-80`). | **Passed locally:** raw counts 1 low, 13 moderate, 0 high/critical. Registry/network dependent; wrote `.artifacts/dependency-audit/raw.json`. |
| `npm run test:scenarios` | Local browser journeys with disposable SQLite and controlled GPS/OSRM; real map assets/tiles may load (`scripts/check-scenarios.mjs:1-42`). | Builds/writes `.expo/scenarios` and `.expo/location-review-web`; needs Playwright Chromium and network for real map resources. |
| `npm run test:access` | Focused terminal-access browser regression (`scripts/check-terminal-access.mjs:1-22`). | Builds `.expo/access-regression-web`; disposable DB/browser. |
| `npm run test:jobs-ui` | Driver job-pagination browser regression (`scripts/check-jobs-pages.mjs:1-23`). | Builds `.expo/jobs-pages-web`; disposable DB/browser. |
| `npm run test:location` | Customer-location browser regression (`scripts/check-customer-location.mjs:1-24`). | Reuses `.expo/location-review-web`; run scenario export first or supply the documented equivalent. Writes screenshots/results. |
| `npm run test:readiness` | Wider local browser regression (`scripts/check-readiness.mjs:1-30`). | Reuses scenario export; writes `.expo/readiness`; not production readiness by itself. |
| `npm run test:load` | Bounded loopback-only load harness with synthetic SQLite data (`scripts/check-load.mjs:1-2`, `scripts/check-load.mjs:74-82`). | Writes `.expo/load` and a temporary DB. Local performance is not production SLO evidence. |
| `npm run test:android-browser` | Physical Android Chrome via existing ADB reverse/forward; no emulator (`scripts/check-android-browser.mjs:1-20`). | Requires attached SM-A5360, prepared forwards and prior scenario export; writes `.expo/scenarios`; not run because device tools were forbidden. |
| `npm run test:expanded-phone` | Physical-phone ride/freight browser flow against isolated PostgreSQL (`scripts/check-expanded-services.mjs:1-18`, `scripts/check-expanded-services.mjs:37-53`). | Requires physical CDP, API forwarding, PostgreSQL and expanded web export; writes `.artifacts/study-expanded-phone`. Synthetic GPS is not field evidence. |
| `npm run screens` | Rebuilds seeded Arabic/English captures (`scripts/screens.mjs:1-34`). | **Modifies `docs/screens/`** and `.screens/`; deliberately not run (`scripts/screens.mjs:655-692`). |
| `npm run check:deployment -- --origin https://<approved-origin>` | Read-only HTTP wiring checks for health/readiness/auth/tracking/pages/map/bundle (`scripts/check-deployment.mjs:1-21`, `scripts/check-deployment.mjs:30-69`). | Production/network dependent and excluded from this audit. It does not prove providers, journeys, backups or distribution. |
| `node scripts/check-azure.mjs` and `node tests/azure-infra.test.mjs` | Compile/lint/static Azure validation documented at `docs/operations/deploy.md:5-15`; needs pinned Bicep 0.48.1. | Azure-only; no AWS deployment evidence. Not run. |
| `npm run db:migrate:staging -- --confirm` | Owner-run staging schema migration with fixed TLS/schema gates (`scripts/migrate-postgres.mjs:1-34`). | **Writes a remote database; prohibited here and not a production importer.** |
| `npx expo-doctor` | Dependency/config diagnostic when Expo dependencies/config change. | Not run; no such changes were made. |
| `npx eas-cli@latest build --profile preview|production --platform android` | EAS binary build using existing profiles (`eas.json:5-13`). | External paid/credentialed build and artifact distribution; not run. |

The second handoff's G3 list includes `test:tulkarm` (`WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:157-168`). That script/command exists in the worktree (`WT/package.json:54`) but is absent from the root manifest. Do not copy the gate list blindly between source states.

### 6.3 CI and mobile release gaps

- Root `verify` runs typecheck, lint, tests, audit and exports; `persistence` uses PostGIS 18/3.6; `image` builds without pushing (`.github/workflows/ci.yml:44-54`, `.github/workflows/ci.yml:56-90`). It does not run the browser/physical-device G3–G6 journeys. Its web export also hardcodes an Azure API URL at `.github/workflows/ci.yml:51`, so that artifact is not evidence for the claimed CloudFront deployment.
- The release-image workflow is manual and master-only, but does not itself enforce a green CI check on the candidate (`WT/.github/workflows/release-image.yml:6-28`). Make the exact green SHA an operator/release gate or an explicit workflow dependency.
- EAS has preview and production build profiles plus production/pilot submit configuration (`eas.json:5-22`), but no `expo-updates` package or update configuration was found in the root manifest or lockfile. Do not claim `eas update` is available.
- The server-served map page can be updated independently of the native binary (`src/route-map.android.tsx:19-24`). That exception does not deliver changes to TypeScript/native application code.

### 6.4 Payment immediate-capture settlement gap

Root `createIntent` sends an immediate-capture request when `captureMethod` is not manual. If the provider returns `captured`, it updates the `payment_intents` row to `captured` and returns without invoking `settlementGate` (`server/domain/payments.ts:53-63`). The only invocations are in `getIntent` after a later provider query and in `webhook` after a captured event (`server/domain/payments.ts:78-95`). Therefore an immediate-capture result can bypass the settlement side effects on the creation path; relying on a later query/webhook is not an atomic settlement contract.

The existing cash-first payment regression exercises capture through `webhook`, not immediate capture from `createIntent` (`tests/payments.mjs:152-158`). Add a focused regression that makes the provider return `captured` immediately, calls `createIntent`, and asserts the settlement gate runs exactly once with the expected order/cash/custody effects; also exercise a subsequent duplicate query/webhook to prove idempotency. Do not enable immediate capture until that test passes on the canonical source.

Scope discipline: `providerGate` requires PostgreSQL and schema 17, production service activation is separately gated, and the only reviewed enabled provider is the test fake (`server/domain/payments.ts:29-48`, `server/domain/payments.ts:192`). This finding does **not** assert a currently reachable live payment-provider exploit. It is a correctness blocker for the activation proposed by the handoffs and is not closed by the ledger's owner-activation row.

## 7. Prioritized, evidence-backed work

### P0 — before another trusted release, scaling, or PostgreSQL cutover

1. **Establish one canonical source/deployed baseline.** Reconcile root, `origin/master`, the worktree and the actual host. Record source SHA, image digest/revision, public URL, database backend/schema, enabled services and the restored backup identity/data-loss window. Do not release from the root's stale Azure-only state or assume worktree files are merged. Evidence: §§1–3.
2. **Close and test immediate-capture settlement before payment activation.** Route the initial captured result through the same atomic settlement path and prove exactly-once effects across creation plus duplicate query/webhook delivery. Keep the payment path disabled until the canonical source passes the new regression. Evidence: §6.4.
3. **Prove recovery on AWS.** With owner authorization, restore a selected S3 copy into an isolated throwaway environment, disable providers, reconcile users/orders/cash/custody/outbox, test API compatibility and record RPO/RTO. Repeat replacement-host recovery including configuration, secrets, Caddy/cron and OSRM rebuild. Evidence: §5; ledger rows 7 and 9 at `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:74-76`.
4. **Prove a person receives an outage alert.** The hourly workflow is not minutes-level detection and notification is unproven. After the owner selects service/recipient/budget, test both API and map failure delivery. Evidence: `WT/.github/workflows/uptime.yml:1-32`; ledger row 6 at `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:73`.
5. **Close the PostgreSQL migration/rollback contract before activation.** Implement/review the production importer, continuous SQLite writer freeze, three representative rehearsals, selected major/PostGIS compatibility, worker startup, backend-aware rollback and a post-first-write failure drill. Never roll back to stale SQLite after authoritative PostgreSQL writes. Evidence: §§3.2, 4; ledger rows 35–37.
6. **Do not scale into process-local correctness gaps.** Keep one SQLite API process and no durable worker. Before two instances, implement shared live wakeup/reconciliation and scheduler ownership, then prove no duplicate jobs/assignments or lost events. Evidence: `server/main.ts:2469-2505`, `server/main.ts:3261-3275`, `server/main.ts:3333-3344`; `server/worker.ts:35-38`.
7. **Make the release SHA's gates explicit and reproducible.** Ensure the canonical branch contains the intended AWS template/scripts and test registry, then run applicable typecheck/lint/full tests/persistence/browser/device gates on that exact SHA. Record CI `verify`, `persistence`, `image`, release `headSha`, digest and deployed revision. The image workflow alone is insufficient; local lint, one focused suite and the audit-policy pass do not close this gate. Evidence: §6.

### P1 — operational hardening and missing acceptance evidence

1. Add AWS template validation/policy tests to canonical CI; current root infrastructure CI validates Azure only. Validate change sets and refuse replacement of retained `Host`/`Edge` as the operating guide requires (`WT/docs/operations/deploy.md:21-24`).
2. Turn backup/restore/alert results into dated operational records; define retention and monitor backup-marker age, restore failures and queue/provider failures. The ledger still calls logs plain container output without retention/search (`WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:112`).
3. Establish signed APK distribution and a tested HTTPS update/install-over-old path before minimum-build enforcement. Decide OTA separately; adding it changes signing, compatibility and rollback policy. Ledger row 38 remains open (`WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:105`).
4. Execute the physical release matrix on the attached A53, including fresh install, two-role parcel trip, reconnect/recovery, push and Arabic/English accessibility. Browser/synthetic GPS tests do not replace this evidence.
5. Keep the inherited engineering items visible rather than declaring the handoffs closed: rows 11–18 (slow-data/tiles/GPS/ETA/captures/TalkBack/field evidence), 23 (authorization matrix), 26 (custody), 29 (API contracts), 30 (responsive design), 33 (booking races) and 45 (request observability) remain listed at `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:78-85`, `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:90-100`, `WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:112`. Row 10 has 0 misses in 40 taps but awaits owner acceptance or another reproduction (`WT/docs/PLAN-2026-11-10-OPEN-ITEMS.md:77`).

### P2 — after measured pilot stability and owner approval

1. Reassess single-host EC2 versus the first handoff's ECS/Fargate target using actual availability, recovery and cost data. ECS/RDS is a migration proposal, not a prerequisite to claim about current production (`reports/Fable 5.2 production upgrade handoff.md:372-401`).
2. Consider an additional EBS snapshot layer, self-hosted map tiles and richer managed observability only after cost/operational review. Do not let these displace restore, alert and data-integrity gates.
3. Optimize release frequency and OTA only after signed binary distribution, server/mobile compatibility and rollback evidence are stable.

## 8. Decisions requiring the owner (no implementation implied)

| Decision | Recommendation / default until answered |
|---|---|
| AWS paid plan and spend limit | Owner checks **AWS Settings → Billing**. A spend-limit pause is an outage; source cannot establish plan/status (`WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:352-355`). |
| Minutes-level alert service, recipient and budget | Choose and approve before creation; prove delivery. Keep hourly check meanwhile, without calling it sufficient. Route 53 health-check alarm placement in `us-east-1` must follow the repository's global-resource exception if that option is chosen (`WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:185-190`). |
| Backup RPO/RTO, retention and deletion | Approve numeric objectives and privacy/legal retention before lifecycle deletion. Preserve existing backups until then. |
| EBS snapshots | Approve cost and restore ownership before enabling; nightly S3 remains the only source-backed off-host copy. |
| Owned domain | Recommended to remove dependence on the retained CloudFront hostname and enable controlled email/domain work; owner approves registration/cost. Do not delete the existing distribution while installed APKs use it (`WT/docs/operations/deploy.md:21-22`). |
| APK hosting and OTA | First approve stable signed APK hosting/distribution. Separately decide whether EAS Update or a signed self-hosted OTA design is worth its release/security complexity; default remains new APK (`WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:361-364`). |
| RDS PostgreSQL version/PostGIS, spend and cutover window | Approve only after cost, engine availability and rehearsals. Default: no production cutover. Regional resources stay in `eu-north-1`. |
| ECS/Fargate migration | Confirm whether the proposed target is still desired after pilot measurements; do not create it merely because the first handoff recommends it. |
| Production activation of dispatch/rides/freight/payments | Remains separately owner-gated and outside this infrastructure audit; default off (`WT/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md:364-370`). |

## 9. Audit close

- **Verified from source:** distinct root/worktree states; SQLite/PostgreSQL gates; PostgreSQL-only worker; process-local live waiters and API timers; root 106 versus worktree 131 suite registries; root Azure-only CI/deployment material; worktree AWS template, backup/restore/release/uptime automation; EAS build profiles without an OTA dependency; the root immediate-capture settlement-gap control flow.
- **Executed locally:** lint passed; `activation-gates` passed as one suite; dependency-audit policy passed with raw counts 1 low, 13 moderate and 0 high/critical; typecheck aborted on Node heap exhaustion and produced no pass/fail type verdict.
- **Not verified:** live AWS inventory/state, current production reachability, deployed image/revision, restored backup identity, backup schedule success, alert delivery, fresh AWS restore, current CI/device results, full root or worktree test suites, PostgreSQL suites, completed typecheck, production provider behavior and numeric RPO/RTO.
- **Audit mutations:** this existing report was updated, and `check:audit` wrote `.artifacts/dependency-audit/raw.json`. No application, test, infrastructure, configuration or Git state was intentionally changed; all pre-existing dirty/untracked work was left intact.
