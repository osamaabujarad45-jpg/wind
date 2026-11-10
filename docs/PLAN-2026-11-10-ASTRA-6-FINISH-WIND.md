# Master plan for Astra 6: finish Wind — 10 November 2026

You are the lead. Your job is to take Wind from a 50-user parcel pilot to a finished product that strangers can rely on: maps and tracking, design and front end, backend, API, database and architecture, deployed on Azure with AWS as a safety net. You lead a pool of sub-agents. This file tells you how to run the work so that mistakes are caught before they reach a user, what to build in what order, and what only the owner can decide.

Read `docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md` next. It holds the map internals and the maps work queue; this file does not repeat them. The owner's later decision (§2.3) replaces that handoff's no-deploy instruction for routine, fully gated releases only.

**Lead change, 10 November:** at the owner's instruction Claude Fable 5.2 (Claude Code) took over from Astra 6. "You" below is whoever leads now; Astra 6 is available as a pool worker (`gpt-pool/gpt-6-astra`).

Labels used here: **[source]** means read in `origin/master` at `5da18ec` on 10 Nov 2026 unless another SHA is named. **[ran]** means executed, with command, exit code and where. **[carried]** means taken from earlier handoffs or session notes and not re-checked; verify before relying on it. **[decided]** means the owner chose it on 10 Nov 2026. Later Phase 0 evidence and recommendations are in the [baseline](PLAN-2026-11-10-BASELINE.md), [execution ledger](PLAN-2026-11-10-OPEN-ITEMS.md) and [cost model](operations/cost-model.md).

## 1. Where things stand

- **Live since 15:29 UTC, 10 Nov [ran]:** `wind-api:20261110-help-ref`, digest `sha256:56d4df474a2e74a2f87f654caa98385eb273d99ce7335d5ca6c67be3ff7b6cdd`, revision `bd51d592eb55cc6b7bad26b55d20be444db1fc47` (details in `docs/CURRENT-WORK.md`). The rest of this bullet is the Phase 0 reading taken before that release.
- **Live at Phase 0 [ran, read-only]:** healthy SQLite, image `wind-api:20261109-design` on Azure VM `wind-vm` (`windapi236.swedencentral.cloudapp.azure.com`), revision `ac531d810af9825f03ece4f1cdfbfa68bd55df03`, digest `sha256:de7a7ff4b7d3f53343ff0c3f7ba4dfd75960fa9a55eee9c44a217ac8f01b455e`. OSRM, backup and all four installed script hashes verified; see baseline. Android 1.1.0 (24) distribution remains **[carried]**, distinct from installed QA packages. Parcels only. Run-book: `docs/PILOT.md`.
- **Code [source]:** Expo/React Native client (`src/`, 107 files, 26 routes under `src/app/`), Node server (`server/main.ts`, 3,678 physical lines, plus 39 modules in `server/domain/`), SQLite live and a PostgreSQL schema gated from production. At `5da18ec`, `npm test` registers 129 suites (120 `*.test.mjs` entries); `tests/` contains 189 `.mjs` files, including 122 `*.test.mjs`. Counts move: report the runner's actual count with commit and date, not a fixed target.
- **Tests need PostgreSQL [source]:** full `npm test` connects to loopback PostgreSQL through suites including `subscription-migration.test.mjs` and `database-logging.test.mjs`. `phone-provider.mjs` validates a PostgreSQL URL but uses a SQLite API fixture. Follow `docs/implementation/test-harness.md` and `docs/implementation/local-database.md`.
- **Database gate [source]:** `server/db/runtime.ts` allows PostgreSQL only in tests (lines 20–23) or on the staging path (`WIND_POSTGRES_STAGING=1`, non-loopback host, `sslmode=verify-full`, lines 11–18). Dispatch, presence and the money ledger are PostgreSQL-only; production uses the jobs board **[carried]**. Dispatch and boarding also have test-only activation gates **[source]**: a database cutover alone activates neither.
- **Infra as code [source]:** `infra/main.bicep` (Container Apps, PostgreSQL version `'16'` at line 170, `enableWorkloads = false` at line 11) is preparation and is not live. `infra/vm/` holds the real deploy, backup, restore and watchdog scripts. Installed VM copies must be compared before claiming that the repo's checks protect production.
- **Known pilot limits [source]** `docs/PILOT.md`: email and phone are unverified at signup; nothing alerts the owner when the server is down beyond an hourly GitHub check (`.github/workflows/uptime.yml`, cron `17 * * * *`); TalkBack never tried by a person; no legal review; routes know nothing of permits or gates.
- **Progress [ran, test PC, 10 Nov]:** `npm run typecheck`, `npm run lint` and `npm test` exited 0 on source `5da18ec`; **129 suites passed** with isolated PostgreSQL 18.3 / PostGIS 3.6. Six browser suites including corrected Arabic/English Tulkarm passed; 96 screenshots inspected. Application inputs match candidate `f6fd6f…`; CI passed on that merge SHA. Final physical-Chrome runner passed all five checks with fresh lint/typechecks after keyboard/viewport diagnosis; failures remain archived. Verified-source customer/driver APKs built and installed; native keyboard-visible acceptance remains open. Logs: `D:\wind-plan-20261110-astra\logs` on `DESKTOP-S2JKMK5`. This is not release readiness.

## 2. What the owner decided [decided]

1. **Scope:** parcels to public-launch quality first, then rides. Freight and digital payments stay planned and off.
2. **AWS:** backup and safety net only. Azure stays the runtime.
3. **Deploys:** you deploy by yourself once the applicable gates in §6 are green, and report afterwards. This supersedes the older maps no-deploy rule for routine releases only. You still ask before a production database migration, any paid resource, switching a service on, or deleting data.
4. **Database:** PostgreSQL cutover happens before the public launch.
5. **Team:** Claude Opus 5.5 Native Pool at `max` as plan author, and Claude Haiku 5.5 Pool at `xhigh` as reviewer, are approved alongside the original roster. The owner resumed the failed Haiku review using Kimi; credit the completed review to Kimi.
6. **Ordinary choices:** the owner delegated recommendations to the lead. Selected planning path: managed General Purpose PostgreSQL `Standard_D2ds_v5`, PostgreSQL 18 rehearsal, existing signed APK distribution, owner as alert recipient and existing tile-provider monitoring first. Verified costs and remaining prerequisites are in the cost model. This does not supply credentials, contracts, legal/field evidence or the specific authorizations in §6.

## 3. Rules you do not break

These exist because each one already cost time or nearly lost data in this repo.

1. **Start from `origin/master`.** Local `master` is an old lineage. Check `git merge-base --is-ancestor origin/master HEAD` before the first edit of every batch.
2. **Never delegate with worktree isolation.** It starts the worker on the old lineage whatever the brief says. Delegate into the shared checkout and give each worker its own files. **[carried]**
3. **One batch at a time.** A batch is small enough to review in one sitting and has its acceptance checks written before any code.
4. **Label every claim** in your reports: read in source, or ran (command, exit code, and where: test PC, phone, CI, production), or carried. Never present a carried claim as a fact. Never write "should work".
5. **A test that cannot fail is not a test.** After a fix, revert the fix and watch the new test fail, then restore it. Do this for every sub-agent's tests.
6. **Verify every sub-agent finding in the code before acting, and read every sub-agent diff line by line before it merges.** Workers have been wrong with confidence here.
7. **Author and reviewer are different models.** For money, auth and sessions, migrations, dispatch, deploy scripts and data deletion, use two reviewers from different vendors, then your own read.
8. **A merge is not a deploy.** Android has no over-the-air updates (no `expo-updates` in `package.json`), so client changes reach Android only in a new APK. `public/map.html` ships with the server image. After a deploy, check what is actually running. Docs-only changes produce no release or APK (§6).
9. **Tests and builds run on the test PC**, never on the owner's PC: `DESKTOP-S2JKMK5` over SSH, host-key checking on (`-o HostKeyAlias=desktop-s2jkmk5.local`), your own folder on `D:` and your own PostgreSQL port. Never write into, start or stop another session's folder or port. If the host does not answer, wait and re-probe. `AGENTS.md:46` still names the older `k5` host; the owner's later rule (4 Nov 2026) names this one and wins. **[carried]**
10. **UI acceptance is on the physical phone** `SM-A5360` (adb serial `R5CTB0FJP9Z`), never an emulator. If it is not attached, stop and ask. Keep its test backend on `adb reverse`. `AGENTS.md:45–47` **[source]**
11. **Before deleting or replacing anything, find out what it really is.** A file that looks like a duplicate may be the only committed copy.
12. **Repository:** `origin` is `osamaabujarad45-jpg/wind`. Never push to `legacy-origin`. Secrets never enter the repo, a prompt to a sub-agent, or a log.
13. **Expo changes every SDK.** Read the versioned docs for the `expo` major in `package.json` before touching an Expo or React Native API (`AGENTS.md`).
14. **Monitor, retry and fail over under `AGENTS.md`'s agent-recovery rule.** The owner authorizes history-backed provider/model replacements; report every switch, preserve checkpoints and keep the original acceptance bar.

## 4. Your team and how to split the work

### First hour: build the roster

Discover the model IDs and supported effort settings, then probe each with a bounded task. Discovery is not a successful run. On 10 Nov the tool catalog exposed **[ran, leader discovery]**: `gpt-pool/gpt-6.1-terra` (`xhigh`), `gpt-pool/gpt-6.1-sol` (`xhigh`), `kimi-pool/kimi-k3.1-pro` (`high`), `nvidia/z-ai/glm-5.3-flash` (`high`), `nvidia/stepfun-ai/step-5-preview` (`max`), `nvidia/mistralai/mistral-large-4-1t-a52b` (`high`), `gpt-pool/claude-opus-5-5` (`max`) and `gpt-pool/claude-haiku-5-5` (`xhigh`). These are the highest discovered settings; rediscover if the catalog changes. Record actual model, pool, effort and verified outcome for each worker.

### Who gets what

| Tier | Model | Give it | Do not give it | Track record here [carried] |
|---|---|---|---|---|
| Lead | You, Astra 6 | Architecture, batch specs, integration, every line of money, auth and migration code, final verdicts, deploys | — | — |
| Plan author | Claude Opus 5.5 Native Pool, `max` | Plan and batch-spec revisions | Merging its own work | Completed revision; leader corrects and integrates |
| A, builds | GPT 6.1 Terra | Bounded implementation slices with their tests, audits, operations scripts, large reads | A merge nobody else reviewed | Best worker of the set. Once wrote a test that could not fail |
| A, verifies | GPT 6.1 Sol | Tests, race conditions, independent diagnosis of a hard bug, a second design opinion | — | Strong. Small setup mistakes in its own tests |
| B, narrow review | Kimi K3.1 Pro | One precise question about a diff under 100 lines, text only | Large diffs (hits the token rate limit), images (fails on PNG) | Best reviewer when the diff is small |
| B, review | Claude Haiku 5.5 Pool, `xhigh` | Bounded or whole-diff review against a checklist | Sole verdict on money, auth, migration, dispatch, deploy or deletion | Seven real whole-diff findings, including restore data loss (`docs/HANDOFF-2026-11-05-NEXT-LEAD.md:83`). Nov 10 Pool attempts failed on quota; Kimi completed that review |
| C, verdicts | Step 5 Preview, Mistral Large 4 | A second-vendor verdict on a narrow server diff; a checklist audit | Anything urgent (both are slow); wide diffs | Mistral plan corrections integrated. Step correctly identified importer settings/freeze but proposed unsafe re-import recovery and an insufficient tag check; verify every verdict |
| C, bulk reading | GLM 5.3 Flash | Inventories, flow traces, Arabic and English copy consistency, cross-checking docs against code. Read-only | Code that will merge | Calibration completed: misclassified nine executable suites; requested high effort was not established. Full factual verification required |

Opus and Haiku count as one vendor for the two-vendor review rule.

### Routing rules

- **Risk picks the tier, size picks the split.** Money, auth, migrations, dispatch and deploy scripts: you write or you integrate by hand, Terra or Sol assists, two vendors review. UI copy, screenshots, inventories: tier C can do the first pass.
- **Split by file ownership.** Two workers never edit the same file in one batch. Server and client slices of one feature go to different workers with the contract written first.
- **Calibrate an unproven model** on a task whose answer you already know before giving it real work.
- **When a pool is rate-limited or a worker stalls**, apply the bounded retries and automatic provider/model failover in `AGENTS.md` (§3 rule 14). Continue independent work.
- **Reviews of screenshots** go to a model that reads images. Kimi does not.

### The brief every worker gets

1. Goal, in one sentence, and why.
2. Base commit and branch. Files in scope. Files it must not touch.
3. Acceptance checks, as commands or observable results.
4. What to return: the diff, the commands it ran with exit codes, and a list of what it did not verify.
5. Rules: no new dependency, no deploy, no push, no secrets, stop and report if the task needs a file outside scope.

## 5. How one batch runs

1. **Select** the next item from the roadmap or the open-items ledger, in §7 order.
2. **Read** the code it touches and every caller. Trace the real flow end to end.
3. **Write acceptance** first: the test that will fail without the change, and the phone check if a sheet, field, map or navigation is involved.
4. **Delegate or implement.** Use the brief in §4.
5. **Integrate yourself.** Read the diff, run the mutation check, fix what is wrong.
6. **Pre-merge gates** (§6): G0–G1 and applicable G3–G6. Record acceptance on the exact source candidate.
7. **Independent review** by a different model; two vendors for high-risk areas. Fix every valid finding, answer every invalid one with the reason.
8. **PR, CI, merge.** Push, open the PR and require `verify`, `persistence` (G2) and `image` on its current head. Merge only after the review and checks pass. Then require those checks on the actual merge SHA (G8). Reconcile any source difference from the tested candidate before release.
9. **Release and deploy** (§6), then **post-deploy checks**. A docs-only PR stops at merge.
10. **Record** in `docs/CURRENT-WORK.md`: issue, change, verification, what was not verified.

## 6. Gates and deploy

### Scope of gates

- **Docs-only:** only Markdown files changed, with no code, config, scripts, workflow, infrastructure or asset changes. Requires lint/typecheck, factual source review and the CI the PR runs; no APK, image release or deploy. Application acceptance is not a prerequisite for merging the plan itself.
- **Application:** G0–G3 and G7–G8 are mandatory. G4–G6 apply to the changes named in their rows; record the applicability rather than pretending an unrun gate passed. Baseline Phase 0 explicitly includes G0–G5. A failing applicable gate blocks release.

### Gate ladder — all applicable rungs green before a deploy

| Rung | What | Where | Note |
|---|---|---|---|
| G0 | `npm run typecheck`, `npm run lint` | test PC | Before any test |
| G1 | `npm test` | test PC | Report actual runner count, commit and date (129 at `5da18ec`). Needs loopback PostgreSQL 18 with PostGIS on your own port, including for subscription-migration and database-logging suites; see `docs/implementation/local-database.md`, `docs/implementation/test-harness.md` |
| G2 | `npm run test:persistence` | CI | GitHub's job is the reliable signal; the test PC flakes during long checkpoints **[carried]** |
| G3 | Browser suites: `test:scenarios`, `test:location`, `test:jobs-ui`, `test:access`, `test:readiness`, `test:tulkarm`, `test:android-browser` | test PC + phone | Not in CI. Export the web bundle with `--clear` first |
| G4 | `npm run screens` | test PC | After any UI change; commit the refreshed `docs/screens/` |
| G5 | Two-role parcel trip on the phone, keyboard open at the handover code | phone | After any change to a sheet, a field, a map or navigation |
| G6 | Fresh-install pass (uninstall, install, sign up) | phone | After auth, permission or onboarding changes |
| G7 | Independent review, findings closed | — | §3 rule 7 |
| G8 | CI green on the merge commit | GitHub | `verify`, `persistence`, `image`. Record the full SHA as the green candidate |

`npm run test:contracts`, `npm run check:deployment`, `npm run check:audit` and `npm run test:load` exist **[source]** `package.json`; run the ones your batch touches.

### Deploy — automatic when applicable G0–G8 are green [decided]

Only routine releases qualify: no production migration, new paid resource, service activation or data deletion. Those still require the owner.

**Before each application release:** compare the SHA256 of `/srv/deploy.sh` on the VM with `infra/vm/deploy.sh` (installed and equal on 10 Nov; `docs/operations/deploy.md`). The script takes the tag, the expected digest and the source revision, runs the image by immutable `@sha256:...` reference and refuses a revision mismatch before the backup or switch (`tests/deploy-script.test.mjs` covers a moved tag). Use its CLI in step 2 below.

1. **Verify provenance.** `.github/workflows/release-image.yml:16` runs only on `refs/heads/master`; a tag or candidate branch is skipped. Confirm remote `master` equals the green candidate, then run `gh workflow run release-image.yml --ref master -f tag=<new tag>`. Check the selected run's `headSha` equals that candidate; record the successful run URL and pushed digest. Verify the built image's `org.opencontainers.image.revision` label equals the same SHA. If master raced forward or any SHA differs, do not deploy; gate the actual new candidate or use a separately reviewed SHA-pinning workflow change. The workflow refuses an existing tag. Never build images on the owner's PC.
2. **Before switching:** verify boot-setting names, including `DB_PATH`, `WIND_TRUST_PROXY` and `WIND_PUSH_SUBJECT`, without printing values. Current boot checks still require `DB_PATH`; do not remove it merely because a PostgreSQL URL is configured. Log the VM in to the registry with a short-lived token, then run the digest-pinned command in `docs/operations/deploy.md` (Releasing an image, step 3) with the recorded digest and revision.
3. **Post-deploy checks:** `/api/ready` answers; the running container resolves to the recorded image digest and revision (not just its tag); an admin reads `GET /api/admin/routing` healthy; the public web bundle contains a release-specific string; place and cancel one real order on the phone using the owner-approved production test account. Reuse that labelled account; deleting it or its orders requires explicit approval.
4. If a check fails, stop rollout and use the reviewed, backend-compatible rollback. The previous image stays as the rollback container. After the first production PostgreSQL write, do not revert to SQLite; freeze writes and recover forward (Phase 3).
5. A client change also needs an Android build from the verified source (`npx eas-cli@latest build -p android --profile preview`), installed over the old one on the phone before users receive it. Check the build's source revision. Bump `CLIENT_BUILD` in `src/api-client.ts` with every `app.json` version **[carried]**. Docs-only PRs never trigger APK builds.

### You still stop and ask for

Production database migrations, cutover and backend reversals; any resource that costs money; activating rides, freight, dispatch or boarding; deleting or rewriting user data (including production test data); provider contracts and credentials; legal questions. Bring decisions in a batch with recommendations and costs.

## 7. Roadmap

Phases run in sequence; Phase 2 may run alongside Phase 1 after Phase 0. Follow the maps handoff's queue, parcels before rides. An owner-blocked item stays blocked: continue independent items in open phases and non-live preparation (runbooks, isolated rehearsals, pricing), without marking the phase complete. Rides wait for the public parcel launch; freight and payments stay off.

### Phase 0 — Ground truth (no changes)

- Verify production read-only: image tag, digest and revision; `/srv/wind-api.env` keys present (names only, including `WIND_TRUST_PROXY` and `WIND_PUSH_SUBJECT`); `wind-osrm` health; last nightly Blob backup and age; uptime workflow.
- Compare installed VM backup/restore scripts with `infra/vm/` by hash or diff. Record drift before relying on the repo's integrity checks as production protection.
- Run the whole ladder G0–G5 on current `master` and record the baseline, including flakes. Current results and application-input equivalence are in the baseline; physical Chrome passes and native G5 remains unresolved.
- Preserve completed roster probes/reviews (§4 and ledger). Recover unavailable independent-review tools before the next review; do not repeat completed calibration as unfinished work.
- Audit both clouds: Azure remaining credit, quotas and resources in the production resource group (`wind-prod` **[carried]**); AWS project plan (`aws freetier get-account-plan-state --profile osama`), selected Region `eu-north-1`, existing resources. Load current AWS guidance first; confirm Region in AWS Settings > View all projects > Overview > Additional Info > Region, or check `~/.aws/config`. Write a cost sheet.
- Build **one open-items ledger** from: `docs/CURRENT-WORK.md`, `docs/HANDOFF-2026-11-05-NEXT-LEAD.md`, `docs/PILOT.md` "Known limits", `docs/DESIGN-AUDIT-2026-11-09.md` "Open", the maps handoff queue, and `docs/operations/*.md`. Each row: item, evidence, severity, phase, owner decision needed or not.
- Include VM script drift and stale test-harness guidance in the ledger. **Exit:** complete baseline report and ledger committed in a docs-only PR, with factual documentation corrected. No application release from Phase 0.

### Phase 1 — Harden the pilot on the current stack

Parcels, SQLite, one VM. Goal: the pilot users stop finding bugs.

- **Maps and tracking:** all seven handoff items in order: missed Confirm; slow-data measurement and budget; tile-host risk; car projection; empirical ETA calibration; label clutter; honest screenshots. Calibrate ETA only from recorded real trips and state the sample size. If insufficient, keep the existing estimate and the data-collection item open; never invent a formula.
- **Knowing when it is down:** today the owner hears nothing. Add an outside check every few minutes that notifies a person, and a row for it in `docs/operations/incident-and-degraded-mode.md`.
- **AWS safety net (§9):** encrypted off-site nightly backup, outside check and static APK hosting. Paid resources need approval first.
- **Deploy/backup/restore scripts:** the deploy script is digest-pinned since #22 and installed on the VM since 10 Nov; recompare its hash before each release. The other three installed scripts were hash-equal to `infra/vm/` at Phase 0. Two vendors review any change to these scripts.
- **Accessibility:** a real TalkBack pass on the phone for sign-up, booking, tracking and the driver job. Record what a person hears.
- **Error visibility:** request IDs and structured server logs so a user report can be traced to a request.
- **Exit:** ladder green, two clean two-role phone trips in a row, backups restorable from both clouds (drill, not assumption).

### Phase 2 — Architecture to Uber grade, without a rewrite (parallel with Phase 1 once Phase 0 is done)

The reference is the pattern, not the code: server-owned state machines, immutable quotes in minor units, expiring offers with database-enforced ownership, durable outbox and resync, balanced money journals, restore-tested hosting. Much of this exists behind gates already. Read `docs/implementation/WP01.md`–`WP17.md` before designing anything new; do not build what a work package already built.

- **Server:** `server/main.ts` is 3,678 lines. Move one route family at a time into `server/domain/`, behaviour-preserving, proven by the contract tests (`docs/implementation/contracts/*.json`, `scripts/check-contracts.mjs`). Only extract what a batch already has to touch. No big-bang refactor.
- **API:** stable validation/conflict codes mapped to both languages and idempotency on retryable commands. Genuine internal errors remain 500s with a request ID; never reclassify them as user mistakes.
- **Security:** an authorization matrix test (every route × every role) built on `server/domain/resource-scope.ts`; rate limits reviewed; `npm run check:audit` clean.
- **Front end:** tokens live in `src/ui.tsx`. Audit and repair design-token drift in colours, sizes and spacing; numerical literals such as `0`, `1` and flex ratios are not automatically drift. RTL and 130% text checked on the phone; reduced motion honoured.
- **Exit:** contracts cover every client-called route; the authorization matrix passes; no open design-token drift findings.

### Phase 3 — PostgreSQL cutover (before public launch) [decided]

This is the highest-risk phase. You write the runbook; two vendors review it; the owner approves spend, production migration and the cutover window.

1. **Price it first.** The cost model compares managed PostgreSQL with separate/shared VM hosting. Azure PAYG and zero inspected credit are **[ran]**; selected GP compute/storage is USD 140.89/month at the documented quantities, not a complete budget. Complete workload, backup, restore and external-provider costs; obtain spend approval.
2. **Staging.** PostgreSQL 18 is the selected rehearsal target; the template still says 16. Verify Azure PostGIS/version compatibility, quota and deployability before editing/provisioning `infra/main.bicep`. Regional capability listings and local tests alone do not prove those gates.
3. **Lift the runtime gate** in `server/db/runtime.ts` only with a reviewed production path that keeps `sslmode=verify-full`.
4. **Prepare the production importer, then rehearse it three times.** `server/migrate.ts:255–263` independently restricts its CLI to `NODE_ENV=test`, loopback and an isolated schema; lifting the runtime gate does not lift this restriction. Implement and two-vendor-review the exact production import path, including verified TLS, explicit destination/schema and write-freeze checks; never bypass it using test flags. Rehearse that path from production copies with row counts, money totals, open orders and sessions in each parity report. Document intentional `NON_LEGACY_TABLES` exclusions.
5. **Restore drill** on PostgreSQL, timed.
6. **Deploy the worker** (`server/worker.ts`) alongside the API.
7. **Test every capability after full staging migration.** `destinationAvailable` in `server/domain/destination-change.ts:62–67` checks table existence, but `server/main.ts:306` still sends `canChangeDestination` only on SQLite, so the client shows the change as unavailable on PostgreSQL: lift that with a PostgreSQL test (ledger row 46). Exercise each client feature end to end and record any 409 or other failure with its actual cause.
8. **Cutover runbook:** first implement and two-vendor-review backend-aware deploy/rollback. Today's `infra/vm/deploy.sh` restarts the old container with its original environment; it must not restart stale SQLite after PostgreSQL becomes authoritative. Prove this with a staging drill that writes to PostgreSQL then fails readiness. Continuously stop every SQLite writer, take final backups to both clouds, import, reconcile, switch, smoke and reopen. `--freeze-writes` releases its SQLite lock after snapshot creation, before import; it is not this continuous freeze. Distinguish controlled schema/import setup from the first **new authoritative** PostgreSQL write:
   - **Before any new authoritative PostgreSQL write:** a return to the prior image/SQLite is allowed only while SQLite remains the authoritative, unchanged/frozen copy and image/schema/data compatibility is proved. The controlled import itself writes PostgreSQL and does not mean live traffic was accepted.
   - **At or after a new authoritative PostgreSQL write:** freeze writes and recover forward on PostgreSQL. Sign-in/session writes, smoke tests and worker activity count; classify uncertain writes conservatively. Never re-import stale SQLite over PostgreSQL history. A backend reversal requires complete, two-vendor-reviewed reconciliation and owner approval (`docs/operations/deploy.md`). Image rollback retains PostgreSQL and a compatible schema.
- Dispatch and boarding remain off after cutover; activation belongs to Phase 5.
- **Exit:** production on PostgreSQL, a full two-role trip on the phone, money totals equal to the pre-cutover figures, restore proven.

### Phase 4 — Public parcel launch

- **Identity:** verified email (needs a sending domain from the owner) and verified phone (needs an SMS provider contract; the server already knows `ooredoo_communication` and `acs`, `server/domain/phone-provider.ts` **[source]**).
- **Updates:** the forced-upgrade gate works only if the app was built with `EXPO_PUBLIC_UPDATE_URL`; set `WIND_MIN_CLIENT_BUILD` only after that (`docs/operations/deploy.md`).
- **Distribution:** use the existing signed APK path initially; prove HTTPS update URL and install-over-old before enforcing a minimum build.
- **Legal, pricing, support:** owner decisions in §10.
- **Staged opening:** 50 → 200 → open. Each step has a go/no-go list: ladder green, no open severity-1 item, backups restored this week, alert tested this week, support reachable.
- **Exit:** strangers can sign up, order, track and receive, and the owner is told within minutes when something breaks.

### Phase 5 — Rides

Needs Phase 4 passed, including Phase 3. Dispatch and presence, boarding PIN, routing for permitted roads, real-trip ETA calibration, a native two-role ride and a staffed safety path. Dispatch and boarding currently remain test-only regardless of database: production needs an explicit two-vendor-reviewed activation change and owner approval. The owner authorizes rides (`WIND_ENABLED_SERVICES`).

### Later

Freight; digital payments through a PMA-licensed provider; Israel (new OSRM graph and place index); native iOS.

## 8. Quality bars

| Area | Bar |
|---|---|
| Maps and tracking | Measured slow-data map budget; 0 missed Confirm presses in 20; no straight line between stops or expired ETA/line; ETA error measured against recorded trips with sample size stated |
| Design and front end | 48 dp touch targets; text contrast at or above 4.5:1; Arabic and English, RTL, 130% text, landscape; one icon scale; every state has a screenshot in `docs/screens/` |
| Backend and API | Every client-called route under a contract test; stable error codes; idempotent commands; `test:load` p95 recorded per release and not worse than the last |
| Database | Restore rehearsed and timed; migration parity report; backups in two clouds, restored monthly; no backend reversal without reviewed reconciliation |
| Security | Authorization matrix green; rate limits on every public route; no secret in repo, logs or prompts; dependency audit clean |
| Operations | Alert reaches a person within minutes; running digest and revision match the green candidate; backend-compatible rollback proven; runbooks and installed VM scripts match reviewed source |

## 9. Cloud use

- **Azure runs the app:** VM today, registry `windprodacr`, Blob for nightly backups, PostgreSQL after Phase 3. `infra/vm/wind-backup.sh` checks integrity before upload; all four installed script hashes match the candidate **[ran, Phase 0]**. A successful backup upload is not a new restore drill.
- **AWS is the safety net [decided]:** an off-site encrypted copy of each backup in S3 (versioning on, a lifecycle rule, a credential on the VM that can only write new objects); an outside uptime check that notifies a person; static hosting for the APK through S3 and CloudFront.
- **AWS constraints:** selected Region `eu-north-1`, profile `osama`; no cross-Region replication, Lambda@Edge or StackSets. CloudFront is global; its required global WAF/CloudWatch Logs dependencies may use `us-east-1`. Inventory those exceptions in both Regions. Check the project plan and service availability in current AWS guidance. Ask before paid resources, and whether to keep or remove created resources.
- Budget alerts only notify; they do not stop spend. Set hard ceilings where the service has them.

## 10. External prerequisites and retained authorizations

Ordinary choices follow §2.6; do not repeat a preference interview. Keep this list current,
with costs and evidence for the credentials, physical/legal readiness and specific authorizations still needed.

| Decision | Blocks | Your default until answered |
|---|---|---|
| Sending domain for email | Verified email, Phase 4 | Keep pilot among known people |
| SMS provider and contract | Verified phone, Phase 4 | Same |
| PostgreSQL spend | Phase 3 | GP D2ds_v5 selected for planning; complete budget/quota, then obtain provisioning authorization |
| Production migration and cutover window | Phase 3 | Do not cut over |
| Backend reversal after PostgreSQL writes | Phase 3 rollback | Freeze and recover forward |
| Paid AWS resources | Phase 1 safety net | Do not create |
| Production smoke-test account; deletion of it or its orders | Post-deploy checks | Reuse an owner-approved labelled account; delete nothing |
| Tile-provider terms/capacity evidence | Maps item 3 | Existing host monitoring first; no paid fallback selected |
| Which roads drivers may use (historical sandbox crossing; production unproved) | Rides, routing profile | Obtain actual driver/permit/operating-area evidence |
| Production activation of dispatch and boarding | Phase 5 | Keep off |
| Flat ₪20 parcel price on long trips | Courier supply | Do not change |
| Signed APK URL and install-over-old evidence | Phase 4 | Existing APK distribution selected |
| Legal review | Public launch | Do not open to strangers |
| Backup retention and recovery objectives | Phase 1 | Preserve backups pending timed drill/policy; owner selected as alert recipient, delivery still needs proof |
| Spoken alternative to map-only pin adjustment | Accessibility | Search results only |

## 11. How you report

For each batch: **issue → change → verification**, with command, exit code, location and source SHA. State pending or blocked gates and exact evidence. Give actual runner counts, worker model/pool/effort, and candidate SHA plus digest for releases. Never call a pending baseline a completed phase. State bad news first.

## 12. When to stop

Stop the affected work and tell the owner when: a gate fails twice for an unexplained reason; production differs from the test PC; a deploy rolls back; built SHA or running digest differs from the green candidate; money totals disagree; phone or test PC is unavailable; no approved model substitute exists; an action needs §10 approval. Continue only independent work allowed by §7.
