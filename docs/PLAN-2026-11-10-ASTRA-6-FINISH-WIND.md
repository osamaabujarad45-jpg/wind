# Master plan for Astra 6: finish Wind — 10 November 2026

You are the lead. Your job is to take Wind from a 50-user parcel pilot to a finished product that strangers can rely on: maps and tracking, design and front end, backend, API, database and architecture, deployed on Azure with AWS as a safety net. You lead a pool of sub-agents. This file tells you how to run the work so that mistakes are caught before they reach a user, what to build in what order, and what only the owner can decide.

Read `docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md` next. It holds the map internals and the maps work queue; this file does not repeat them.

Labels used here: **[source]** means read in `origin/master` at `5da18ec` on 10 Nov 2026. **[carried]** means taken from earlier handoffs or session notes and not re-checked; verify before relying on it. **[decided]** means the owner chose it on 10 Nov 2026.

## 1. Where things stand

- **Live [carried]:** image `wind-api:20261109-design` on one Azure VM (`windapi236.swedencentral.cloudapp.azure.com`) running `wind-api`, `wind-osrm` and Caddy in Docker, SQLite at `/srv/wind-data/wind.db`. Android 1.1.0 (24), sideloaded APK. Parcels only. Run-book: `docs/PILOT.md`.
- **Code [source]:** Expo/React Native client (`src/`, 107 files, 26 routes under `src/app/`), Node server (`server/main.ts`, 3,678 lines, plus 39 modules in `server/domain/`), SQLite live and a PostgreSQL schema that is test-only, 129 suites in `npm test`, 185 test files in `tests/`.
- **Database gate [source]:** `server/db/runtime.ts` allows PostgreSQL only in tests (lines 20–23) or on the staging path (`WIND_POSTGRES_STAGING=1`, non-loopback host, `sslmode=verify-full`, lines 11–18). Dispatch, presence and the money ledger are PostgreSQL-only, so production uses the jobs board. **[carried]**
- **Infra as code [source]:** `infra/main.bicep` (Container Apps, PostgreSQL version `'16'` at line 170, `enableWorkloads = false` at line 11) is preparation and is not live. `infra/vm/` holds the real deploy, backup, restore and watchdog scripts.
- **Known pilot limits [source]** `docs/PILOT.md`: email and phone are unverified at signup; nothing alerts the owner when the server is down beyond an hourly GitHub check (`.github/workflows/uptime.yml`, cron `17 * * * *`); TalkBack never tried by a person; no legal review; routes know nothing of permits or gates.

## 2. What the owner decided [decided]

1. **Scope:** parcels to public-launch quality first, then rides. Freight and digital payments stay planned and off.
2. **AWS:** backup and safety net only. Azure stays the runtime.
3. **Deploys:** you deploy by yourself once every gate in §6 is green, and report afterwards. You still ask before a production database migration, any paid resource, switching a service on, or deleting data.
4. **Database:** PostgreSQL cutover happens before the public launch.

## 3. Rules you do not break

These exist because each one already cost time or nearly lost data in this repo.

1. **Start from `origin/master`.** Local `master` is an old lineage. Check `git merge-base --is-ancestor origin/master HEAD` before the first edit of every batch.
2. **Never delegate with worktree isolation.** It starts the worker on the old lineage whatever the brief says. Delegate into the shared checkout and give each worker its own files. **[carried]**
3. **One batch at a time.** A batch is small enough to review in one sitting and has its acceptance checks written before any code.
4. **Label every claim** in your reports: read in source, or ran (command, exit code, and where: test PC, phone, CI, production), or carried. Never present a carried claim as a fact. Never write "should work".
5. **A test that cannot fail is not a test.** After a fix, revert the fix and watch the new test fail, then restore it. Do this for every sub-agent's tests.
6. **Verify every sub-agent finding in the code before acting, and read every sub-agent diff line by line before it merges.** Workers have been wrong with confidence here.
7. **Author and reviewer are different models.** For money, auth and sessions, migrations, dispatch, deploy scripts and data deletion, use two reviewers from different vendors, then your own read.
8. **A merge is not a deploy.** Android has no over-the-air updates (no `expo-updates` in `package.json`), so client changes reach Android only in a new APK. `public/map.html` ships with the server image. After a deploy, check what is actually running.
9. **Tests and builds run on the test PC**, never on the owner's PC: `DESKTOP-S2JKMK5` over SSH, host-key checking on (`-o HostKeyAlias=desktop-s2jkmk5.local`), your own folder on `D:` and your own PostgreSQL port. Never write into, start or stop another session's folder or port. If the host does not answer, wait and re-probe. `AGENTS.md:46` still names the older `k5` host; the owner's later rule (4 Nov 2026) names this one and wins. **[carried]**
10. **UI acceptance is on the physical phone** `SM-A5360` (adb serial `R5CTB0FJP9Z`), never an emulator. If it is not attached, stop and ask. Keep its test backend on `adb reverse`. `AGENTS.md:45–47` **[source]**
11. **Before deleting or replacing anything, find out what it really is.** A file that looks like a duplicate may be the only committed copy.
12. **Repository:** `origin` is `osamaabujarad45-jpg/wind`. Never push to `legacy-origin`. Secrets never enter the repo, a prompt to a sub-agent, or a log.
13. **Expo changes every SDK.** Read the versioned docs for the `expo` major in `package.json` before touching an Expo or React Native API (`AGENTS.md`).

## 4. Your team and how to split the work

### First hour: build the roster

List the model IDs your tools expose, send each a one-line probe, and write the working IDs into this table in your own notes. IDs seen in earlier sessions **[carried]** `docs/HANDOFF-2026-11-05-NEXT-LEAD.md`: `azure-gpt6/gpt-6.1-terra`, `azure-gpt6/gpt-6.1-sol`, `azure-terra/Kimi-K3.1-Pro` (also seen as `kimi-pool/kimi-k3.1-pro`), `nvidia/stepfun-ai/step-5-preview`, `nvidia/mistralai/mistral-large-4-1t-a52b`. GLM 5.3 Flash has no recorded ID here; find it. Run every model at its highest effort (Mistral's highest is `high`).

### Who gets what

| Tier | Model | Give it | Do not give it | Track record here [carried] |
|---|---|---|---|---|
| Lead | You, Astra 6 | Architecture, batch specs, integration, every line of money, auth and migration code, final verdicts, deploys | — | — |
| A, builds | GPT 6.1 Terra | Bounded implementation slices with their tests, audits, operations scripts, large reads | A merge nobody else reviewed | Best worker of the set. Once wrote a test that could not fail |
| A, verifies | GPT 6.1 Sol | Tests, race conditions, independent diagnosis of a hard bug, a second design opinion | — | Strong. Small setup mistakes in its own tests |
| B, narrow review | Kimi K3.1 Pro | One precise question about a diff under 100 lines, text only | Large diffs (hits the token rate limit), images (fails on PNG) | Best reviewer when the diff is small |
| C, verdicts | Step 5 Preview, Mistral Large 4 | A second-vendor verdict on a narrow server diff; a checklist audit | Anything urgent (both are slow); wide diffs | Sound at top effort. Step gave one wrong finding at medium |
| C, bulk reading | GLM 5.3 Flash | Inventories, flow traces, Arabic and English copy consistency, cross-checking docs against code. Read-only | Code that will merge | Unproven here. Calibrate first |

### Routing rules

- **Risk picks the tier, size picks the split.** Money, auth, migrations, dispatch and deploy scripts: you write or you integrate by hand, Terra or Sol assists, two vendors review. UI copy, screenshots, inventories: tier C can do the first pass.
- **Split by file ownership.** Two workers never edit the same file in one batch. Server and client slices of one feature go to different workers with the contract written first.
- **Calibrate an unproven model** on a task whose answer you already know before giving it real work.
- **When a pool is rate-limited**, narrow the diff first, then move down the table. Do not wait idle; pick another batch.
- **Reviews of screenshots** go to a model that reads images. Kimi does not.

### The brief every worker gets

1. Goal, in one sentence, and why.
2. Base commit and branch. Files in scope. Files it must not touch.
3. Acceptance checks, as commands or observable results.
4. What to return: the diff, the commands it ran with exit codes, and a list of what it did not verify.
5. Rules: no new dependency, no deploy, no push, no secrets, stop and report if the task needs a file outside scope.

## 5. How one batch runs

1. **Select** the next item from the roadmap or the open-items ledger.
2. **Read** the code it touches and every caller. Trace the real flow end to end.
3. **Write acceptance** first: the test that will fail without the change, and the phone check if a sheet, field, map or navigation is involved.
4. **Delegate or implement.** Use the brief in §4.
5. **Integrate yourself.** Read the diff, run the mutation check, fix what is wrong.
6. **Gate ladder** (§6).
7. **Independent review** by a different model; two vendors for high-risk areas. Fix every valid finding, answer every invalid one with the reason.
8. **PR, CI, merge.** Push the branch, open the PR, wait for `verify`, `persistence` and `image`.
9. **Release and deploy** (§6), then **post-deploy checks**.
10. **Record** in `docs/CURRENT-WORK.md`: issue, change, verification, what was not verified.

## 6. Gates and deploy

### Gate ladder — every rung green before a deploy

| Rung | What | Where | Note |
|---|---|---|---|
| G0 | `npm run typecheck`, `npx expo lint` | test PC | Before any test |
| G1 | `npm test` (129 suites) | test PC | Needs PostgreSQL 18 with PostGIS on your port; see `docs/implementation/local-database.md`, `docs/implementation/test-harness.md` |
| G2 | `npm run test:persistence` | CI | GitHub's job is the reliable signal; the test PC flakes during long checkpoints **[carried]** |
| G3 | Browser suites: `test:scenarios`, `test:location`, `test:jobs-ui`, `test:access`, `test:readiness`, `test:tulkarm`, `test:android-browser` | test PC + phone | Not in CI. Export the web bundle with `--clear` first |
| G4 | `npm run screens` | test PC | After any UI change; commit the refreshed `docs/screens/` |
| G5 | Two-role parcel trip on the phone, keyboard open at the handover code | phone | After any change to a sheet, a field, a map or navigation |
| G6 | Fresh-install pass (uninstall, install, sign up) | phone | After auth, permission or onboarding changes |
| G7 | Independent review, findings closed | — | §3 rule 7 |
| G8 | CI green on the merge commit | GitHub | `verify`, `persistence`, `image` |

`npm run test:contracts`, `npm run check:deployment`, `npm run check:audit` and `npm run test:load` exist **[source]** `package.json`; run the ones your batch touches.

### Deploy — automatic when G0–G8 are green [decided]

1. `gh workflow run release-image.yml -f tag=<new tag>` on `master`. It refuses a tag that exists. Never build images on the owner's PC.
2. Log the VM in to the registry with a short-lived token and run `sudo /srv/deploy.sh <tag>`; it rolls back by itself if the image is unhealthy. Steps: `docs/operations/deploy.md` **[source]**.
3. **Post-deploy checks:** `/api/ready` answers; `docker ps` shows the new tag; an admin reads `GET /api/admin/routing` healthy; the public web bundle contains a string from this release; one real order placed and cancelled on the phone against production with a throwaway account, then the account deleted.
4. If any check fails, roll back first, diagnose second. The previous image stays as the rollback container.
5. A client change also needs a new Android build (`eas build -p android --profile preview`), installed over the old one on the phone before it is offered to users. Bump `CLIENT_BUILD` in `src/api-client.ts` with every `app.json` version **[carried]**.

### You still stop and ask for

Production database migrations and the cutover itself; any resource that costs money; turning ride or freight on; deleting or rewriting user data; provider contracts and credentials; legal questions. Bring these in one message with your recommendation and the cost.

## 7. Roadmap

Each phase ends at a gate. Do not start a phase before the one above it has passed, except where marked parallel.

### Phase 0 — Ground truth (no changes)

- Verify production: image tag, `/srv/wind-api.env` keys present (names only), `wind-osrm` healthy, last nightly backup in Blob and its age, uptime workflow passing.
- Run the whole ladder G0–G5 on current `master` and record the baseline, including flakes.
- Probe the roster (§4).
- Audit both cloud accounts: Azure remaining credit, quotas, what exists in the production resource group (`wind-prod` **[carried]**); AWS plan type (`aws freetier get-account-plan-state --profile osama`), Region `eu-north-1`, what already exists. Write a one-page cost sheet.
- Build **one open-items ledger** from: `docs/CURRENT-WORK.md`, `docs/HANDOFF-2026-11-05-NEXT-LEAD.md`, `docs/PILOT.md` "Known limits", `docs/DESIGN-AUDIT-2026-11-09.md` "Open", the maps handoff queue, and `docs/operations/*.md`. Each row: item, evidence, severity, phase, owner decision needed or not.
- **Exit:** baseline report and ledger committed. Nothing else changed.

### Phase 1 — Harden the pilot on the current stack

Parcels, SQLite, one VM. Goal: the pilot users stop finding bugs.

- **Maps and tracking:** the queue in the maps handoff, in its order (missed Confirm press; slow-data measurement and a budget; tile-host risk; car kept on the road; label clutter; honest screenshots).
- **Knowing when it is down:** today the owner hears nothing. Add an outside check every few minutes that notifies a person, and a row for it in `docs/operations/incident-and-degraded-mode.md`.
- **AWS safety net (§9):** encrypted off-site copy of the nightly backup, the outside check, static hosting for the APK.
- **Accessibility:** a real TalkBack pass on the phone for sign-up, booking, tracking and the driver job. Record what a person hears.
- **Error visibility:** request IDs and structured server logs so a user report can be traced to a request.
- **Exit:** ladder green, two clean two-role phone trips in a row, backups restorable from both clouds (drill, not assumption).

### Phase 2 — Architecture to Uber grade, without a rewrite (parallel with Phase 1 once Phase 0 is done)

The reference is the pattern, not the code: server-owned state machines, immutable quotes in minor units, expiring offers with database-enforced ownership, durable outbox and resync, balanced money journals, restore-tested hosting. Much of this exists behind gates already. Read `docs/implementation/WP01.md`–`WP17.md` before designing anything new; do not build what a work package already built.

- **Server:** `server/main.ts` is 3,678 lines. Move one route family at a time into `server/domain/`, behaviour-preserving, proven by the contract tests (`docs/implementation/contracts/*.json`, `scripts/check-contracts.mjs`). Only extract what a batch already has to touch. No big-bang refactor.
- **API:** one error taxonomy (stable codes the client maps to copy in both languages), idempotency on every command that a retry could repeat, no 500 for a user's mistake.
- **Security:** an authorization matrix test (every route × every role) built on `server/domain/resource-scope.ts`; rate limits reviewed; `npm run check:audit` clean.
- **Front end:** tokens live in `src/ui.tsx` only; no literal colours or sizes in screens; RTL and 130% text checked on the phone; reduced motion honoured.
- **Exit:** contract tests cover every route the client calls; the matrix test passes; no screen has a literal the design audit would flag.

### Phase 3 — PostgreSQL cutover (before public launch) [decided]

This is the highest-risk phase. You write the runbook; two vendors review it; the owner approves the spend and the cutover window.

1. **Price it first.** Managed PostgreSQL Flexible Server against PostgreSQL in a container on the VM, with backups and restore time for each. The student credit is small **[carried]** `docs/operations/cost-model.md`. Owner approves.
2. **Staging.** Bring up staging from `infra/main.bicep`. Resolve the version mismatch: the template says PostgreSQL 16, every local test ran on 18. Confirm PostGIS.
3. **Lift the runtime gate** in `server/db/runtime.ts` only with a reviewed production path that keeps `sslmode=verify-full`.
4. **Rehearse the import three times** with `server/migrate.ts` from a copy of production, each with a parity report: row counts, money totals, open orders, sessions. Note the tables it skips on purpose (`NON_LEGACY_TABLES`).
5. **Restore drill** on PostgreSQL, timed.
6. **Deploy the worker** (`server/worker.ts`) alongside the API.
7. **Clear what breaks at cutover:** features that return 409 on PostgreSQL on purpose, for example change-destination (`server/domain/destination-change.ts`).
8. **Cutover runbook:** freeze writes, final backup to both clouds, import, verify, switch, smoke on the phone, unfreeze. Rollback: previous image and the untouched SQLite file. Decide in advance the minute at which you roll back.
- **Exit:** production on PostgreSQL, a full two-role trip on the phone, money totals equal to the pre-cutover figures, restore proven.

### Phase 4 — Public parcel launch

- **Identity:** verified email (needs a sending domain from the owner) and verified phone (needs an SMS provider contract; the server already knows `ooredoo_communication` and `acs`, `server/domain/phone-provider.ts` **[source]**).
- **Updates:** the forced-upgrade gate works only if the app was built with `EXPO_PUBLIC_UPDATE_URL`; set `WIND_MIN_CLIENT_BUILD` only after that (`docs/operations/deploy.md`).
- **Distribution:** Play Store or APK link is the owner's call.
- **Legal, pricing, support:** owner decisions in §10.
- **Staged opening:** 50 → 200 → open. Each step has a go/no-go list: ladder green, no open severity-1 item, backups restored this week, alert tested this week, support reachable.
- **Exit:** strangers can sign up, order, track and receive, and the owner is told within minutes when something breaks.

### Phase 5 — Rides

Needs Phase 3. Dispatch and presence, boarding PIN, a routing profile for the roads drivers may actually use, ETA calibrated from real trips, a native two-role ride on the phone, a staffed safety path. The owner switches rides on (`WIND_ENABLED_SERVICES`).

### Later

Freight; digital payments through a PMA-licensed provider; Israel (new OSRM graph and place index); native iOS.

## 8. Quality bars

| Area | Bar |
|---|---|
| Maps and tracking | Time to a usable map on slow mobile data measured and inside a stated budget; 0 missed Confirm presses in 20; never a straight line between stops; never an ETA or line older than its validity |
| Design and front end | 48 dp touch targets; text contrast at or above 4.5:1; Arabic and English, RTL, 130% text, landscape; one icon scale; every state has a screenshot in `docs/screens/` |
| Backend and API | Every client-called route under a contract test; stable error codes; idempotent commands; `test:load` p95 recorded per release and not worse than the last |
| Database | Restore rehearsed and timed; parity report for every migration; backups in two clouds, restored monthly |
| Security | Authorization matrix green; rate limits on every public route; no secret in repo, logs or prompts; dependency audit clean |
| Operations | Outage alert reaches a person within minutes; rollback proven on every release; runbooks in `docs/operations/` match what is deployed |

## 9. Cloud use

- **Azure runs the app:** VM today, registry `windprodacr`, Blob for nightly backups (`infra/vm/wind-backup.sh` checks integrity before upload **[source]**), PostgreSQL after Phase 3.
- **AWS is the safety net [decided]:** an off-site encrypted copy of each backup in S3 (versioning on, a lifecycle rule, a credential on the VM that can only write new objects); an outside uptime check that notifies a person; static hosting for the APK through S3 and CloudFront.
- **AWS constraints [carried]:** everything in `eu-north-1`, CLI profile `osama`; no cross-Region replication, no Lambda@Edge, no StackSets; CloudFront is allowed. Check the account's plan and that each service is available on it before designing around it. Ask before creating anything that costs money, and ask whether to keep or remove what you created.
- Budget alerts only notify; they do not stop spend. Set hard ceilings where the service has them.

## 10. Decisions only the owner can make

Keep this list current and bring it in batches, each with your recommendation and cost.

| Decision | Blocks | Your default until answered |
|---|---|---|
| Sending domain for email | Verified email, Phase 4 | Keep pilot among known people |
| SMS provider and contract | Verified phone, Phase 4 | Same |
| PostgreSQL spend and hosting option | Phase 3 | Do not provision |
| Cutover window | Phase 3 | Do not cut over |
| Tile hosting: keep public host, self-host, or add a fallback | Maps item 3 | Add monitoring only |
| Which roads drivers may use (routes can cross the Green Line today) | Rides, routing profile | Do not change routing |
| Flat ₪20 parcel price on long trips | Courier supply | Do not change |
| Play Store or APK link | Phase 4 | APK link |
| Legal review | Public launch | Do not open to strangers |
| Backup retention; who is alerted when the server is down | Phase 1 | Keep all backups; alert the owner |
| Spoken alternative to map-only pin adjustment | Accessibility | Search results only |

## 11. How you report

For each batch: **issue → what you changed → how you verified it**, with the command, its exit code and where it ran, and a plain list of what you did not verify. If a gate was skipped, say which and why. State bad news first.

## 12. When to stop

Stop and tell the owner when: a gate fails twice for a reason you cannot explain; production behaves differently from the test PC; a deploy rolled back; money totals disagree anywhere; the phone or the test PC is unavailable; a task needs something in §10. Do not work around any of these.
