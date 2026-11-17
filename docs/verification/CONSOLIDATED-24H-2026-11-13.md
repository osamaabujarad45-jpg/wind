# Wind / Fastship — consolidated 24-hour evidence report

> **Classification: CONFIDENTIAL.** This file contains infrastructure details and unremediated findings. It contains no passwords, bearer tokens, private keys, production user identifiers, delivery codes, or synthetic account passwords.
>
> **Window:** 13 November 2026, approximately 00:30–23:59 local time (EET). **Source root:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`. **Verdict:** **NO-GO for an unqualified production pilot.** This is a consolidated assessment, not a deployment approval or a claim that every unknown has been closed.

## 0. Bottom line

1. **The retired-client problem is fixed in artifact, not in every historical document.** Preview build **27**, Android `ps.wind.app` versionName `1.0.13` / versionCode `27`, is signed, installs over version 24, launches, and its decompressed bundle contains the current CloudFront host once and the retired Azure host zero times. Its SHA-256 is `3b948ef52f0547fd5a526a2353b4709029dbf5b17354ae5005696ceeeb375f52`. Authenticated production journeys remain unproven because the production credential was declined and was not requested again.
2. **Current database test evidence is real, but it is not production evidence.** The full persistence runner passed on a disposable PostgreSQL 18.3 / PostGIS 3.6 fixture on loopback port **55475**. An earlier full run on the OneDrive-hosted fixture failed in `PhoneIdentity.reconcileStale`; its log also shows 476–673 second checkpoints. The new fixture is outside OneDrive. No production dialect change was made.
3. **The final isolated verification gates pass.** [ran] Full remote PostgreSQL persistence on `127.0.0.1:55494` exited **0**: **52 selected suites plus the legacy runner**, completed `2026-11-14T01:50:21.7398573Z`. [ran] The final quiet combined runner exited **0** for typecheck, Expo lint, dependency audit, both native-script syntax checks, and **106 integration suites**, completed `2026-11-14T01:53:03.9944577Z`. [ran] The current local fallback then passed **109 integration suites** and full persistence on fresh `127.0.0.1:55475`, adding cap/partner replay, quoted/replay authority, terminal rejection and old-snapshot coverage. Earlier map-shutdown, connection, presence-expiry, partner and phone-identity failures remain preserved as history, not hidden by these results.
4. **Backups are useful, but monitoring and replacement recovery are not done.** Two S3 backups exist. The newest restores locally with integrity `ok`, no foreign-key violations, `user_version=3`, and a successful API readiness boot. Exact live-host environment/row counts and a timed fresh replacement-host recovery remain unknown. No Wind CloudWatch alarms, Wind log groups, or Synthetics canaries were returned. Hourly GitHub Uptime is green but does not prove that a missed backup alerts a person.
5. **The accepted architecture decision stands:** **Option C now** (narrow SQLite pilot), **Option A next** (rehearsed PostgreSQL cutover), **Option B ruled out** (no permanent second SQLite implementation). Do not activate payments, PostgreSQL-only modules, RDS, paid monitoring, a domain, or production migrations from this report alone.
6. **AWS was assessed at question level, not inflated to a full review.** The live official framework inventory is **57 questions / 307 best practices / 6 pillars**. This review answers all 57 at question level: **5 PASS, 44 PARTIAL, 5 FAIL, 3 [U]**. It does **not** claim individual proof of all 307 best practices.
7. **The strongest competitor template is Souq Tulkarm for cash/custody, not a generic Uber clone.** Its client exposes `amountCollectedCents`, typed `discrepancyReason`, shift/ready-queue/custody-scan shapes, and a scoped opt-in outbox. Shiply’s numbered strings are notification channels, not a three-attempt state machine, and “Error sending. Event queued.” belongs to Sentry. HAAT Driver/Courier artifacts prove shifts/offers/earnings surfaces, not Wind’s cash-variance or custody invariants.
8. **All five original demos now pass static gates.** At `2026-11-14T05:32:24Z`–`05:32:52Z`, **15/15** typecheck/lint/selfcheck commands passed. HAAT passed 12 checks, Shiply 17 and Souq 24; all five have README/selfcheck/Git. Parent validation confirmed exits/log paths and unchanged key hashes and Git HEAD/status. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\summary.json`. These remain in-memory/mock-map prototypes, not proprietary source, production backends, device/runtime proof, or production-readiness evidence.

### Immediate ordered actions

| Priority | Action | Why | Approval boundary |
|---|---|---|---|
| P0 | Prove one missed-backup notification reaches a named human, then deliberately fail a synthetic backup check | Backup success without a human alert is not an operational control | Requires owner-approved destination; paid SNS/monitoring is **not** authorized here |
| P0 | With refreshed read-only SSM/EC2 access, record live dialect/env/counts and run a timed replacement-host restore | Local restore does not prove live baseline or RTO/RPO | Owner session only; no production mutation in this pass |
| P0 | Run authenticated production customer→driver→cash acceptance on version 27 or its successor | Installation/launch is not journey evidence | Owner must supply a production test account through an approved secret channel; do not paste it into this report |
| P1 | Finish visibly disabled UI states for all deferred capabilities and implement A11 collected-amount/variance before relying on cash reconciliation at scale | Surprise `409 *_unavailable` and absent door-collected amounts are real product gaps | Product work; no payment-provider activation |
| P1 | Preserve CloudFront while planning an owned domain and client migration | Deleting the AWS-owned hostname breaks installed apps **and existing tracking links** | Domain/DNS cost and migration require approval; no cross-Region routing |
| P1 | Reconcile this dirty working tree with canonical `origin/master` before another release | The local branch is 6 ahead / 277 behind with extensive edits | Git mutation was not requested and was not performed |

---

## 1. Method and evidence rules

- **[read]** source or artifact inspected, with file and line where practical.
- **[ran]** command executed in this pass, with exit code and log path.
- **[aws]** live read-only AWS answer. No AWS create/update/delete was performed.
- **[phone]** physical `SM-A5360`, adb serial `R5CTB0FJP9Z`; no emulator.
- **Execution location:** preferred heavy builds/tests in this pass run over SSH on **`DESKTOP-S2JKMK5`** in `D:\wind-verify-20261113`, with its own Node/JDK/Gradle directories and PostgreSQL ports. Earlier attempts on the owner’s PC are **local worktree fallback**, not remote evidence. The separate `k5` alias remains refused. Physical UI acceptance remains on the attached `SM-A5360`.
- **[other-agent]** preserved result from another session, not silently promoted to a fresh result.
- **[U]** unknown, unmeasured, or blocked. It is not evidence of health or absence.
- **Source-tree rule:** canonical production/research statements use `origin/master` `b89f2205965523b5ab8545dff3940d1eacb6062c` where noted. Working-tree tests and edits use the dirty local checkout at `b60922952d607f698eee24b9c68ac3394daecd3c`. These are different trees; their counts and claims must not be mixed.
- **Research rule:** competitor mechanisms are observations of shipped client artifacts, not proof of competitor server behavior, queue algorithms, custody enforcement, payment settlement, uptime, or legal/business claims.
- **AWS tooling:** `aws___search_documentation` / `aws___retrieve_skill` were not exposed. Local AWS Well-Architected, observability, networking, containers, database, storage, compute, and IAM skills were loaded. Official AWS pages and CLI reads were used instead. The `rds-oss` service skill was unavailable, so RDS statements use its knowledge card and official documentation; no RDS provisioning guidance was executed.

### Changes made in this verification pass

1. [read] [`app.config.js`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/app.config.js) now validates `WIND_PHONE_TEST_PORT`; [`src/phone-test.ts:4-15`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/phone-test.ts:4) accepts only unprivileged loopback test URLs.
2. [read] [`scripts/phone-test-server.mjs`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/phone-test-server.mjs), [`scripts/start-phone-tests.ps1`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/start-phone-tests.ps1), [`scripts/export-phone-web.mjs`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/export-phone-web.mjs), [`scripts/check-phone-tests.mjs`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/check-phone-tests.mjs), and [`scripts/build-phone-tests.ps1`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/build-phone-tests.ps1) now isolate non-default sandboxes in `.expo/phone-qa-<port>`, keep provisioning’s actual API URL, find the installed adb, and preserve native exit codes without treating npm stderr warnings as success/failure substitutes.
3. [read] The test build now uses one Gradle worker, `--no-parallel`, a 1.5 GiB Gradle heap, and a 1 GiB Kotlin heap. This responds to a real JVM OOM, not a guess.
4. [read] [`.github/workflows/ci.yml:51`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.github/workflows/ci.yml:51) no longer contains the retired Azure literal; it follows canonical practice with `${{ vars.WIND_API_URL }}`. [`eas.json:6-19`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/eas.json:6) explicitly supplies the current CloudFront URL for preview and production.
5. [read] [`README.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/README.md), [`docs/implementation/test-harness.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/implementation/test-harness.md), [`docs/REA/2026-11-13-PILOT-READY.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/REA/2026-11-13-PILOT-READY.md), [`docs/REA/2026-11-13-GAP-BACKLOG.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/REA/2026-11-13-GAP-BACKLOG.md), and [`docs/REA/2026-11-13-PILOT-SCOPE.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/REA/2026-11-13-PILOT-SCOPE.md) are being reconciled with fresh evidence instead of retaining stale completion/blocked claims.
6. [read] [`scripts/check-native-cash.mjs`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/check-native-cash.mjs) and [`scripts/check-native-ambiguous.mjs`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/check-native-ambiguous.mjs) add physical-device acceptance checks. The latter explicitly labels its one injected 409 as **synthetic network fault injection after a real sandbox commit**, not as a server-generated race.

7. [read] The deleted `vendor/decode-uri-component` files were restored with the GHSA-qr28-fpjm-wq7f-fixed **0.5.1** implementation, CommonJS-compatible package metadata, and upstream license/readme. [`scripts/check-audit.mjs:12`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/scripts/check-audit.mjs:12) now pins the exact restored hash `e82696ecdf0ee2c25bd90169cc7915e552d2ccb82a5006c55bc17aecdb55b919`, matching canonical. The older deleted 0.5.0 copy and stale local expected hash were not used.

Harness failures preserved rather than rewritten as app failures: the first explicit `-Roles customer,driver,admin` invocation was rejected by PowerShell’s `ValidateSet` (the default all-role array was the correct call); npm’s deprecation warning became a `NativeCommandError` until native stderr/exit handling was fixed; reused provisioning held `apiUrl=4191` while the build required 4192; two launcher invocations were killed by my own 120-second timeout and rerun without that artificial limit; and the full Gradle attempt then hit the documented JVM OOM. A later memory-bounded run reached `mergeDebugNativeLibs` and stopped without a normal Gradle error; its direct retry returned exit 0. These are why the harness changed, not hidden “flaky app” claims.

No `git commit`, `git push`, `git reset`, `git rebase`, production deployment, production database migration, payment activation, AWS paid setup, or deletion was performed.

### 1.1 Chronology of the last 24 hours

| When (13 Nov unless noted) | Work and evidence state |
|---|---|
| 00:30–04:12 | Main verification, competitor-research, and separate original-demo threads began. The old local branch and canonical `origin/master` were established as different source trees. |
| Morning / midday | Old version-24 APK and Azure-host evidence was rechecked; public AWS readiness, ECR, S3 backups, and limited IAM access were established. The production credential remained unavailable. |
| 12 Nov context retained | AWS migrated from Azure; image workflow `43263201635` succeeded. EAS build 25 later failed on missing public API configuration. These pre-window facts are included because they explain today’s release work. |
| ~16:03–16:34 | Fresh 55474 fixture proved the booking race and four dark suites; later full integration/persistence attempts failed. These results superseded “no fixture” without making the full gates green. |
| ~17:49–18:02 | Latest recorded GitHub Uptime succeeded; the 11-study research session completed and wrote `reports/Wind verified research atlas.md`. |
| ~18:40 onward | The separate session delegated original Shiply/Souq demos and continued HAAT. Only Uber/Careem have completed independently verifiable demo repos at this cutoff. |
| ~20:52 | Truly isolated 4192 sandbox was created with separate DB/provisioning/output; earlier shared-directory behavior was corrected. |
| 20:54–21:02 | Full persistence on the new local-temp 55475 fixture completed with exit 0. The old OneDrive failure remains preserved. |
| ~21:06 | First full Gradle attempt died from native memory exhaustion with two 2 GiB JVM heaps and parallel R8 work. The next build was bounded to one worker and smaller heaps. |
| 21:50:56Z | All three role APK builds finished with exit 0 after the isolated C++ runtime build fix; independent ZIP/config/API/hash/signature checks followed. |
| 22:00–22:12Z | All-role smoke, admin→driver cash reconciliation, and the forced post-commit 409/same-request-retry journeys passed on the physical `SM-A5360`. |
| 22:15:02Z | A full remote 55494 persistence run failed the then-current presence-expiry assertion: heartbeat returned 200 (`deduplicated:false`) instead of the required 409. Isolated presence subsequently passed. The fixture was then made deterministic at `tests/presence.mjs:80-83`: it persists `Date.now()-120000`, reads back the exact `lease_until`, and still requires 409 `presence_expired`; no assertion was skipped or weakened. |
| 23:09:45Z | Full remote 55494 persistence completed with exit 0: 52 selected suites plus legacy. |
| 23:51:39Z | Final quiet combined gates completed with every component exit 0, including 106 integration suites. Documentation and independent evidence review were then completed in a separate worktree. |

---

## 2. Source-tree, technology, and code inventory

### 2.1 Git provenance

| Item | Verified value | Evidence |
|---|---|---|
| Working `HEAD` / `master` | `b60922952d607f698eee24b9c68ac3394daecd3c` | [ran] `git rev-parse HEAD`, exit 0 |
| Canonical `origin/master` | `b89f2205965523b5ab8545dff3940d1eacb6062c` | [ran] `git rev-parse origin/master` and `git ls-remote origin refs/heads/master`, exit 0 |
| Relationship | local is **6 ahead / 277 behind**, not a descendant | [other-agent] [baseline-and-deployment.md:7-53](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Wind%20verified%20research%20atlas/baseline-and-deployment.md:7) |
| Working state at this pass | 249 tracked modified paths, 370 porcelain entries, 121 untracked entries, zero staged | [ran] `git status --porcelain=v1`; preserve unrelated edits |
| Isolated source identity | **106 integration / 52 persistence / 99 `.test.mjs` files; `check:audit` present.** At `2026-11-14T05:32:29Z`, 493 compared code/config files have ten intentional verification changes and zero unexpected differences. Local/remote comparison has zero unexpected differences after classifying the parser fix, remote-only cash probe and 59 nested-vendor duplicates | [ran] [source-identity.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/source-identity.json), [remote-source-identity.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/remote-source-identity.json) |
| Production image candidate | ECR `wind-api:20261112-aws1`, `ACTIVE`, digest `sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc` | [aws] [ecr-images.txt](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/aws-final/ecr-images.txt) |
| Image source workflow | run `43263201635`, success, SHA `4f647e77ddc4b4f2ed0ecbd047dc1037953d888d` | [ran] [release-runs.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/github-final/release-runs.json) |
| Live running image | **[U]** ECR association does not prove the host’s running digest or revision label | EC2/SSM denied; do not infer it from `/api/ready` |

### 2.2 Application stack

| Layer | Current working-tree technology | Code evidence |
|---|---|---|
| Mobile/web | Expo `~57.0.31`, React Native `0.86.3`, React `19.2.3`, React DOM `19.2.3`, Expo Router `~57.0.29`, typed routes | [`package.json:4-47`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/package.json:4), [`app.json:1-77`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/app.json:1) |
| Language/runtime | TypeScript `~6.0.3`; Node `v24.12.0`; npm `11.11.0` | [ran] `node --version`, `npm --version` |
| Android artifact | versionName `1.0.13`, versionCode `27`, minSdk 24, target/compile SDK 36 | [ran] `aapt dump badging wind-preview-27.apk` |
| Server | `server/main.ts` with `node:http`, `node:sqlite`; polling worker in `server/worker.ts`; `pg` `8.23.1` for isolated/future PostgreSQL | [`server/main.ts`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts), [`server/worker.ts`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/worker.ts), [`package.json:27`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/package.json:27) |
| SQLite | WAL by default, `synchronous=FULL`, foreign keys on, 250 ms local busy bound, `user_version=3` | [`server/db/sqlite-schema.ts:4-10`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/sqlite-schema.ts:4) |
| PostgreSQL | `pg.Pool`, default max 8, 1 s acquire, 5 s statement, 500 ms lock, 10 s idle-in-transaction bounds; test/staging gates | [`server/db/persistence.ts:54-69`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/persistence.ts:54), [`server/db/runtime.ts:4-27`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/runtime.ts:4) |
| Maps | MapLibre `^6.12.0` web, `react-native-maps` `1.27.2`; Google native is opt-in with platform-restricted keys; OSRM separate container | [`app.config.js:1-48`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/app.config.js:1), [`src/map-provider.ts`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/map-provider.ts) |
| Push / auth | Expo notifications, Web Push, optional native PostgreSQL path; self-service/operator identity and role/session tests | [`server/domain/native-push.ts`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/domain/native-push.ts), [`server/domain/phone-identity.ts`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/domain/phone-identity.ts) |
| Build | EAS remote version source, preview/production CloudFront env, `.easignore` reduced upload from 631 MB to 2.5 MB | [`eas.json`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/eas.json), [`.easignore`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.easignore), [eas-build-preview-reduced.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/eas-build-preview-reduced.log) |
| Container | Node 24 slim, non-root `node`, `/data` persistent volume, readiness healthcheck | [`Dockerfile:22-36`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/Dockerfile:22) |
| AWS live design | EC2 + Docker (`wind-api`, `wind-osrm`, Caddy) + EBS SQLite + CloudFront + ECR + S3 + SSM | canonical [`infra/aws/wind.yaml`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/aws/wind.yaml), [`docs/operations/deploy.md`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/docs/operations/deploy.md) |
| Not the live design | Bicep/Azure Container Apps/PostgreSQL Flexible Server are gated preparation, not today’s AWS production | [`infra/main.bicep`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/infra/main.bicep), [`infra/modules/container-app.bicep`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/infra/modules/container-app.bicep) |

### 2.3 Dialect reality and the twelve gates

[read] [`server/db/runtime.ts:4-27`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/runtime.ts:4) selects SQLite when `WIND_DATABASE_URL` is absent. Non-loopback PostgreSQL is allowed only in a fixed `wp16_staging` path with `sslmode=verify-full`; other production use throws. It never silently fails over between databases.

[read] The accepted ADR names twelve backend-gated areas: durable commands, dispatch, eligibility, events/outbox, double-entry ledger, native push, ops/support, payments, private objects, table-backed quotes, resource scope/custody, and ride lifecycle. For example, [`server/domain/commands.ts:10-15`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/domain/commands.ts:10) is both **opt-in** (`commandId` absent passes through) and **route-allowlisted**. It is not universal offline writes.

[read] [`docs/REA/2026-11-13-DIALECT-ADR.md:85-122`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/REA/2026-11-13-DIALECT-ADR.md:85) accepts C now / A next / B ruled out. [`docs/REA/2026-11-13-PILOT-SCOPE.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/REA/2026-11-13-PILOT-SCOPE.md) is the operator boundary. UI coverage for all disabled states is still a failure.

### 2.4 Test-tree counts are tree-specific

| Tree | Integration selection | `.test.mjs` on disk | Persistence selection | Meaning |
|---|---:|---:|---:|---|
| Canonical `b89f220` | **131** = 122 `.test.mjs` + 9 other `.mjs` | **124** | **56** + separate legacy runner | [other-agent] independently parsed canonical arrays |
| Working `b609229` + current edits | **109** = 100 `.test.mjs` + 9 other `.mjs` | **102** (100 selected + 2 PostgreSQL-only exemptions) | **52** + separate legacy runner | [ran] parser over current `scripts/run-tests.mjs` / `check-persistence.mjs` |
| Exemptions | `db-api.test.mjs`, `db-persistence.test.mjs` | included in persistence | no missing selected files, no duplicate suite IDs | These are not silently orphaned tests |

Do not use “122” as the full integration count on canonical or “131” as the count on this working tree.

---

## 3. Verification results and artifact identities

### 3.1 Command results

| Check | Result | Raw evidence |
|---|---|---|
| `npm run typecheck` | **exit 0** | [typecheck-current-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/typecheck-current-final.log) |
| `npm run lint` | **exit 0** | [lint-current-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/lint-current-final.log) |
| `npm run check:audit` | **exit 0**, rejected high/critical `[]`; final raw **14 moderate + 1 low** | [audit-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/audit-after-cash-fix-final.log), [remote-static-gates.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/remote-static-gates.log). Decoder hash verified as `e82696ecdf0ee2c25bd90169cc7915e552d2ccb82a5006c55bc17aecdb55b919` |
| Earlier full `npm test` | **106 suites passed** | [npm-test-post-build.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/npm-test-post-build.log) |
| Later full `npm test` under concurrent load | **exit 1**, `map.test.mjs:437` shutdown timing | [npm-test-current-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/npm-test-current-final.log) |
| Final quiet combined gates | **exit 0** for typecheck, lint, audit, cash syntax, ambiguous syntax, and integration; **106 suites passed** | [final-gates-after-cash-fix-exit.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/final-gates-after-cash-fix-exit.json), [typecheck-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/typecheck-after-cash-fix-final.log), [lint-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/lint-after-cash-fix-final.log), [audit-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/audit-after-cash-fix-final.log), [integration-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/integration-after-cash-fix-final.log) |
| Final remote persistence on 55494 | **exit 0**; 52 selected suites plus legacy, finished `2026-11-14T01:50:21.7398573Z` | [persistence-55494-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/persistence-55494-after-cash-fix-final.log), [persistence-55494-after-cash-fix-final-exit.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/persistence-55494-after-cash-fix-final-exit.json) |
| Full `npm run test:persistence` on 55475 | **exit 0**; 52 selected suites plus legacy PostgreSQL suite | [persistence-55475-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/persistence-55475-final.log), created 20:54:48, finished 21:02:21 EET |
| Earlier persistence on OneDrive 55474 | **exit 1**, connection terminated during `phoneSchemaAvailable` / `reconcileStale` | [persistence-final-verification.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/persistence-final-verification.log) |
| OneDrive checkpoint evidence | 673.267 s and 638.761 s totals, later 475.872 s; tens of thousands of sync files | [postgresql-verify-20261113.log](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.expo/implementation/postgresql-verify-20261113.log) |
| Fresh fixture | PostgreSQL 18.3, `postgis_version()` = `3.6 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`, loopback only | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-pg-final-20261113\postgresql.log` |
| `node --check scripts/check-native-cash.mjs` during load | **Historical failure:** `VirtualAlloc failed`, exit `-1073740791`. The final quiet rerun passed both native syntax checks (`cashSyntax=0`, `ambiguousSyntax=0`) at `2026-11-14T01:53:03.9944577Z` | [final-gates-after-cash-fix-exit.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/final-gates-after-cash-fix-exit.json), [native-cash-syntax-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/native-cash-syntax-after-cash-fix-final.log), [native-ambiguous-syntax-after-cash-fix-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/native-ambiguous-syntax-after-cash-fix-final.log) |
| Gradle customer build, first attempt | JVM native OOM in R8; daemon died | [native-build-oom-evidence.txt](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/native-build-oom-evidence.txt) (captured before clean prebuild removed the scratch log) |
| Native role builds | **PASS — exit 0**, finished `2026-11-13T21:50:56.7658988Z` | [role-builds-final-success-exit.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/role-builds-final-success-exit.json) |
| Native role artifact verification | **PASS** — customer, driver and admin ZIP integrity and embedded role configuration passed for isolated loopback API 4192; identities are below | [4192 artifact-verification.json](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.expo/phone-qa-4192/apks/artifact-verification.json) |
| Native all-role smoke | **PASS** — customer, driver and admin each rendered home and the expected synthetic role identity on `SM-A5360` at `2026-11-13T21:58:16.917Z` | [smoke-results.json](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.expo/phone-qa-4192/device/smoke-results.json) |
| Native cash handover | **PASS in sandbox** — admin recorded 300 cents, driver saw 300 pending, confirmed entry 1, and the driver balance became zero; entry status `confirmed` at `2026-11-13T22:02:50.948Z` | [cash-results.json](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.expo/phone-qa-4192/device/cash-results.json) |
| Native ambiguous-command recovery | **PASS in sandbox** — two `/api/orders` POSTs reused requestId `65a84efd-84dc-4d72-ac18-8d1ffef2d1d1`; the first committed order 5 upstream (200) but returned an injected client 409, and Retry returned 200 for the same order 5 with `receiptOrderId=5` at `2026-11-13T22:10:22.813Z` | [ambiguous-results.json](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.expo/phone-qa-4193/device/ambiguous-results.json), [4193 artifact-verification.json](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.expo/phone-qa-4193/apks/artifact-verification.json) |

Role APK identities (all are **debug QA artifacts**, not production release candidates):

| Role | Package | Bytes | SHA-256 |
|---|---|---:|---|
| Customer | `ps.wind.app.testcustomer` | 91,974,848 | `8d504905cd04a44a5ceb51b81fd3c03e479b94aacbdb1c5d9bca376bbe39bac6` |
| Driver | `ps.wind.app.testdriver` | 91,974,844 | `75bb012eb238ead85a0b3ace4b03f224540fb63bcb79126c99f445a4e47c4653` |
| Admin | `ps.wind.app.testadmin` | 91,974,844 | `b931d7ee75b4f7994a5572768375ad13326e27c50c94a9952d72103377735838` |

The three 4192 embedded bundles are 4,246,596 bytes and use `http://127.0.0.1:4192`. The separate 4193 customer artifact is 91,974,836 bytes, SHA-256 `3e6fd1666ea0edd9936c4b10ba15ea9c06664909528ee36d1519671227565897`, with a 4,246,584-byte bundle and API `http://127.0.0.1:4193`; its ZIP/role checks also pass. All four apksigner records show Android debug signer certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.

These are loopback-sandbox results. Smoke proves installation/launch and basic role rendering, not a complete journey. The 300-cent remittance does not close A11 door-collected amount/variance. The ambiguous-command 409 was synthetic network-fault injection **after a real sandbox commit**, not a server-generated race or production authentication evidence.

The moderate/low dependency entries are not described as fixed. They remain visible and owned by the dependency backlog; the gate rejects only unmitigated high/critical entries and one narrowly reviewed decoder backport.

### 3.2 Production preview APK

| Field | Verified value |
|---|---|
| Artifact | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\wind-preview-27.apk` |
| Bytes | **107,387,898** |
| SHA-256 | `3b948ef52f0547fd5a526a2353b4709029dbf5b17354ae5005696ceeeb375f52` |
| Package/version | `ps.wind.app`, `1.0.13`, code **27** |
| Signer certificate SHA-256 | `5947bab05b2173ee99fc29a817e94070e71e15f93ae2c6681fcdce5e08403a2c` |
| ZIP integrity | `testzip=None` (no CRC failure) |
| Retired Azure host | **0 occurrences** |
| CloudFront host | **1 occurrence**, in `assets/index.android.bundle` |
| Device | installed over version 24 and launched on `SM-A5360` |
| Evidence | [wind-preview-27-bundle-scan.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/wind-preview-27-bundle-scan.json), [wind-preview-27-signing.txt](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/wind-preview-27-signing.txt), [eas-build-preview-reduced.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/eas-build-preview-reduced.log), EAS build `0eca7e5f-ca11-4d14-be8f-e4e5f04dcb54` |

Historical build 25 failed because the API variable was missing. The first build after adding it used a 631 MB upload and failed metadata upload; `.easignore` reduced the next upload to 2.5 MB. These are different failures, not evidence that the endpoint fix alone completed every release task.

### 3.3 HAAT Driver / Courier official artifacts

| Field | HAAT Driver | HAAT Courier |
|---|---|---|
| Package/version | `com.haat.haatdriver` **9.72 (132)** | `com.haat.courier` **1.1.1 (8)** |
| min/target SDK | 21 / 35 | 24 / 36 |
| Base bytes | 26,313,879 | 24,449,839 |
| Base SHA-256 | `594b0425cb9f8829a2349b1a19a1ca68d70cd36376bb06e4900a2e98b738319c` | `883d54b7426eb020343a341a871a1fe5d3cd1592f4aee9d5b3e8dc420e43f1e4` |
| arm64 split SHA-256 | `9d6926c476bdd03cc24c26c85bf7077206068fe31120a049f7f056cf1feb3fa3` | `a53a06055fa750586b20103563772e89a7b9f30620224f047638b4ddd671268a` |
| xxhdpi split SHA-256 | `a35ac032f8dec26e234cc1b05d6366e30dc7a0c67177c41cace09a5afee0a3a5` | `fb6542d6fa62cd2b648a87fe1a800501baa11b90135083ae32ec7d1a6564970b` |
| Signer SHA-256 | `2db77fa77dce0fa02891e2fe7e30affc649a9e2b104cd66e5fa651e1a2febf18` | `a08d6f34623bd1300248d55e51377c7a23073db8828197cf400daf1ee910b279` |
| Play source-stamp signer | both `3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d` | same |

Evidence roots: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-haat-artifacts-20261113\com.haat.haatdriver-play\` and `...\com.haat.courier-play\`, each with `artifact-hashes.json`, `aapt2-badging.txt`, `aapt2-resources.txt`, `aapt2-strings.txt`, `manifest-xmltree.txt`, `apksigner.txt`, and acquisition records. [ran] All six APK/split hashes were independently recomputed and matched in [independent-hash-verification.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-haat-artifacts-20261113/independent-hash-verification.json). Mirror XAPK attempts returned 403 and were not bypassed; official Play acquisition succeeded. Alternative IDs `com.haaddriver` and `com.haatcourier` returned 404.

### 3.4 Other reference artifacts

| App | Artifact/method identity | Evidence |
|---|---|---|
| Shiply | `com.shiplypalestinemobileapp` 1.8530 / code 310; base 87,463,616 B, SHA-256 `000335d479a369530706d1fd67e8805e0fcdf665a71012a0b22f4a1b7ff8e7fe`; HBC bundle SHA-256 `eefcb81f91237961a2f1e560e3c07320e882e4098564069e8905e9416d608e62` | [shiply-feature-implementation.md:1-25](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Wind%20verified%20research%20atlas/shiply-feature-implementation.md:1) |
| Souq Tulkarm | `ps.souqtulkarm.app` 1.0.2 / code 3; base 4,153,798 B; SHA-256 `27dd269784d7ff81a87146455d4fd8011d57b556f8a23f7a896a62fc0aa88478`; Vite/React SPA in Capacitor 7 | [souq-tulkarm.md:1-46](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Competitor%20feature%20implementation%20atlas/souq-tulkarm.md:1) |
| Careem Rider | `com.careem.acma` 26.43 / 264301; base 85,446,587 B; SHA-256 `B19112D53D3E9A800EF35908FA48AF57816D9F8F81B7A3897A7220F527127F58` | [careem-rider-captain.md:1-7](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Competitor%20feature%20implementation%20atlas/careem-rider-captain.md:1) |
| Careem Captain | `com.careem.adma` 89.70.2 / 89702; base 164,971,864 B; SHA-256 `F5618AFD9E173B8B9A7C4D1D42EE5A6C2E0DEDAF71BA95064DD3FBD9B181C538` | same file, artifact table |
| HAAT Client | `com.haat.client` 21.0.4 / 312; SHA-256 `52279A92F31FEBAFAC3EAAA7B64348A762E5BB41879E8B1EA318B7DEBD150366` | [haat-client.md:1-23](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Competitor%20feature%20implementation%20atlas/haat-client.md:1) |
| Uber Rider | `com.ubercab` 4.655.10001; base + splits; static class/resource/parameters analysis | [uber-benchmark.md:1-32](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Competitor%20feature%20implementation%20atlas/uber-benchmark.md:1), [UBER-4.655-rider.md](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/REA-2026-11-13-reference-apps/UBER-4.655-rider.md) |

[ran] Shiply, both Careem bases, HAAT Client, Uber, Souq, and Shiply’s HBC bundle were independently rehashed. Every non-null expected-value comparison matched. **Correction:** the earlier JSON has `expected: null` / `matchesRecorded: null` for Souq, so it proves Souq’s recomputed value `27dd269784d7ff81a87146455d4fd8011d57b556f8a23f7a896a62fc0aa88478`, not an automated expected-value match. The combined result is [reference-base-hash-verification.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/reference-base-hash-verification.json).

Class counts are **method-specific** (materialized JADX view, raw DEX definitions, or name-level archive) and are not interchangeable. No iOS IPA was obtained; no iOS implementation parity is claimed.

---

## 4. Backup, schema, restore, and production boundaries

### 4.1 Fresh AWS backup evidence

- [aws] `s3 ls` returns `wind-20261112T165723Z.db.gz` and `wind-20261113T031001Z.db.gz`, each 10,148 bytes: [backups.txt](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/aws-final/backups.txt).
- [aws] `HeadObject` on the newest returns `VersionId=awKIxkUsGZL1h5p9nXiEUOVMEPGzdK6z` and `ServerSideEncryption=AES256`: [backup-head.txt](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/aws-final/backup-head.txt).
- [read] Canonical backup code uses SQLite `VACUUM INTO`, verifies integrity before upload, gzips, sets private permissions, uploads via the host role, and only then touches `last-ok`: [`infra/vm/wind-backup.sh`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/wind-backup.sh).
- [read] The host role can only `PutObject`, not read/list/delete backups; bucket versioning, Block Public Access, ACL disablement, and TLS-only policy are declared in [`infra/aws/wind.yaml`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/aws/wind.yaml). Live `get-bucket-versioning` and `get-public-access-block` were denied, so those bucket-level settings are source evidence, not fresh live confirmation.

### 4.2 Local restore results

| Artifact/check | Result | Evidence |
|---|---|---|
| Newest gzip | 10,148 B, SHA-256 `45608b757e2d2e126b2060329791d26889ab0ddca0e3e141a542091ccf8a2a7a` | [restore-inspection.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/restore-inspection.json) |
| Prior gzip | 10,148 B, SHA-256 `19757e7df0461b1bf200dae6bcdee54d3bae7965e1f87e5e05221b1103a6a1ff` | same |
| Decompressed DB | both 364,544 B and byte-identical; SHA-256 `0ea4d4bdf08f4df9ea5c443a99933989163cdcddfe9eae822d9dcd59de2c1789` | same |
| Integrity / FK / schema | `integrity_check=ok`, no FK violations, `user_version=3` | [restore-integrity.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/restore-integrity.json) |
| Application tables | **36**; plus internal `sqlite_sequence` = **37 total** | same; this reconciles older “37 tables” wording |
| Row counts | 9 users, 2 orders, 0 sessions, 0 completed/cash entries/push subscriptions; zero differences between the two backups | [restore-inspection.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/restore-inspection.json) |
| API against restored copy | HTTP 200 `{"ok":true,"schema":3}` | [restore-api-result.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/restore-api-result.json) |
| Live-host current env/counts | **[U]** SSM/EC2 denied | [ssm.txt](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/aws-final/ssm.txt), [ec2.txt](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/aws-final/ec2.txt) |

The two zero-row tables `firebase_resets` and `native_push_tokens` are preserved. [read] `native_push_tokens` is PostgreSQL-only and inactive on SQLite; no `server/` reference to `firebase_resets` exists. Do not invent SQLite DDL or delete legacy history during a restore drill. `opencode_jobs` is optional, and `*_upgrade` names are migration temporary tables.

### 4.3 What restore history does and does not prove

- [other-agent] A 6 November synthetic drill restored in 12 seconds and exercised missing/bad files and rollback. It was not current AWS production scale.
- [other-agent] The 12 November AWS migration moved production and the current restore runbook says it ran end to end.
- [ran] Today’s newest S3 backup restores and boots locally.
- **[U]** A fresh, timed replacement-host recovery with live baseline, operator record, exact RTO/RPO, post-restore blocks/deletions reconciliation, and current production revision is still missing. These are different claims; one does not substitute for another.

---

## 5. AWS production architecture and live evidence

### 5.1 Actual architecture (canonical source)

```text
Android / web / tracking recipient
              │ HTTPS
              ▼
        CloudFront ( caching disabled for API )
              │ HTTPS + X-Wind-Edge
              ▼
          Caddy on EC2
              │ Docker network `windnet`
        ┌─────┴───────────┐
        ▼                 ▼
    wind-api          wind-osrm
        │
        ▼
 SQLite on 30 GiB encrypted EBS
        │ nightly VACUUM INTO + integrity + gzip
        ▼
 Private versioned S3 backup bucket

GitHub Actions ──OIDC master/workflow only──► ECR immutable image
SSM Session Manager ──operator──► EC2 (no SSH listener)
```

[read] [`infra/aws/wind.yaml`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/aws/wind.yaml) declares one `t3.small`, Ubuntu 24.04 amd64, 30 GiB gp3 encrypted EBS, IMDSv2, no SSH ingress, CloudFront origin-facing prefix list on 443, port 80 only for certificate/redirect, a custom origin header, immutable ECR tags/scan-on-push, and a GitHub OIDC role constrained by repository IDs, branch, and workflow ref.

[read] [`infra/vm/deploy.sh`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/deploy.sh) pulls by digest, checks `org.opencontainers.image.revision`, takes a backup, and rolls back on start/readiness failure. Its own comment says it has no deployment lock. Code rollback is not a database-backend rollback.

[read] [`infra/vm/wind-watchdog.sh`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/wind-watchdog.sh) restarts API/OSRM after three failed local checks. It does not notify a person. [`infra/vm/Caddyfile`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/Caddyfile) removes the edge secret before proxying and preserves CloudFront’s caller header for rate limits.

**IMDS nuance:** the template’s `HttpPutResponseHopLimit=1` is deliberate: containers cannot retrieve the EC2 role. The host uses IMDSv2. It is not automatically a defect requiring 2; increase it only if a container is explicitly intended to use IMDS.

### 5.2 Fresh command evidence

| Check | Exit | Finding |
|---|---:|---|
| STS caller identity | 0 | Account `083712835043`, limited IAM user `BedrockAPIKey-vaer`; no key printed |
| ECR `describe-images` | 0 | One active `wind-api` image and full digest |
| ECR scan findings | 255 | AccessDenied; vulnerability result is **[U]**, not “clean” |
| S3 list / HeadObject | 0 | Two backups; newest versioned/AES256 |
| CloudWatch `describe-alarms --alarm-name-prefix wind` | 0 | `MetricAlarms: []`, `CompositeAlarms: []`, `LogAlarms: []` |
| CloudWatch full-inventory continuation read | 0 | **6 metric alarms / 0 composite**; 4 `OK`, 2 `ALARM` (API/web CPU target-tracking `AlarmLow`). Both `AlarmHigh` and both `RollbackAlarm` are `OK`. Six log groups returned; no canaries. This does not contradict the narrower Wind-prefixed zero result |
| Synthetics `describe-canaries` | 0 | `Canaries: []` |
| Logs `describe-log-groups` | 0 | Baydar/ECS and a CloudTrail group; **no Wind log group** |
| EC2 / SSM / CloudFormation / CloudFront / RDS / SNS / plan | 255 each | AccessDenied; no healthy-state inference |
| Public `/api/health` | HTTP 200 | `{"ok":true}`, one sample 606 ms |
| Public `/api/ready` | HTTP 200 | `{"ok":true,"schema":3}`, one sample 276 ms |
| GitHub Uptime latest recorded run | success | Run `43528709624`, scheduled at `2026-11-13T23:39:19Z`, updated `23:39:26Z`, SHA `b89f2205965523b5ab8545dff3940d1eacb6062c`; all four steps succeeded |
| GitHub variable `WIND_API_URL` | exit 1 / HTTP 403 | Current variable value not independently read; do not claim it was inspected |

Every AWS command and output is retained under `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\commands.json` and named `.txt` logs. Fresh continuation metadata is under `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\`, including `aws-readonly-summary.json`, `public-endpoints.json`, and `github-run-43528709624.stdout.json`.

### 5.3 Required AWS decisions and trade-offs

**Keep EC2 + SQLite for the narrow pilot.** It matches one writer, current backups, low operational complexity, and the accepted scope. Do not move to ECS/Fargate or put the SQLite WAL directory on EFS/shared storage merely to appear “cloud native.” That would add cost and unsafe writer semantics without delivering the missing product controls. An ASG will not make a single-writer SQLite database highly available.

**Use managed community PostgreSQL only as the separately rehearsed Option A.** The first candidate is **RDS for PostgreSQL in `eu-north-1`** because the code already uses community PostgreSQL triggers, advisory locks, stored procedures, transactions, and PostGIS. Aurora PostgreSQL is the credible alternative if a measured availability/performance requirement justifies its different cost/operational model. Aurora DSQL is excluded for this design because PostGIS and stored procedures/triggers are required. DynamoDB is not a fit for the relational ledger, ad hoc queries, and existing invariants. Exact instance size, Multi-AZ choice, engine minor version, and price must be rechecked against live quota and current prices before approval.

Official RDS documentation currently lists PostgreSQL **18.3 → PostGIS 3.6.1**, and **18.6 → PostGIS 3.6.3**: <https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html>. That is documentation compatibility, not proof those engines are available to this project. `rds describe-db-instances` was denied, and no engine/version quota check was possible. No production PostgreSQL endpoint is asserted.

**Other integrations are options, not missing AWS migrations.** Keep the existing email/SMS providers until a measured owner-approved change. Amazon SES becomes practical after a verified sending domain; it is not required for the current cash-only parcel path. AWS End User Messaging’s country table lists Palestine (+970) for international one-way SMS with Sender ID support, not two-way SMS, and its notes warn that international origination can be best effort/downstream-replaced: <https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html>. This is not delivery proof or a reason to replace the existing `ooredoo_communication`/ACS provider. Amazon Location also should not replace the current place index from the old 19-place sample alone. S3/CloudFront APK hosting and EAS Update/self-hosted signed updates are release-model decisions, not implemented features.

**Monitoring must include a human and backup freshness.** Existing Uptime checks `/api/ready` and a real map tile hourly, while the on-host watchdog restarts processes. Canonical `server/main.ts:1208-1227` marks a backup stale after 26 hours and queues at most one admin attention push per day; the restored backup has zero `push_subscriptions`, so this is not evidence of an external person being reached. Missing are Wind resource logs/alarms and a proven missed-backup alert to a human. The smallest robust target is:

1. An owner-approved SNS email (or equivalent) with a **confirmed subscription**.
2. A backup-age/failure metric emitted on both success and failure, with an alarm treating missing data as failure, plus EC2 status-check and public-readiness alarms.
3. A synthetic missed-backup test proving notification delivery and a named operator acknowledging it.
4. CloudWatch logs with retention and encryption decisions, plus S3 data-event/access logging if audit requirements justify their cost.

A lower-cost alternative is to extend the existing external GitHub Uptime workflow with a narrowly scoped OIDC read role that fails when the newest S3 backup is older than 26 hours. That still needs a role, repository permission, and a proven notification destination; it was not implemented or presented as existing.

Official references: [S3 monitoring](https://docs.aws.amazon.com/AmazonS3/latest/userguide/monitoring-overview.html), [CloudWatch alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html), [S3 security](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html), and [EC2 security](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security.html).

**Domain portability is a release requirement, not cosmetic.** The CloudFront hostname is baked into installed apps and generated tracking URLs. An owned domain with simple DNS routing is the way to remove that dependency. Do not delete/change the distribution until all active app/tracking clients have a migration path. The project forbids cross-Region geolocation/latency/failover routing and cross-Region replication as a default answer.

**Backups need a retention/privacy decision.** Indefinite S3 retention preserves deleted-account data. Keep the two zero-row legacy tables and all backups for now; decide lifecycle/Object Lock/retention with the owner instead of deleting history opportunistically. S3 durability is not a replacement for restore drills.

**Cost evidence is dated, not a fresh quote.** The migration study estimated about USD 22.1/month for the EC2 design using then-current public prices. Actual plan, spend limit, CE data, burstable credits, transfer, and current prices are unavailable. Do not turn that historical estimate into a budget guarantee. Check AWS Settings → Billing and the paid/free plan before any paid resource. A sudden access loss after working operations should trigger a spend-limit check.

---

## 6. AWS Well-Architected question-level assessment

**Coverage audit:** 57/57 questions assessed; 307/307 best-practice IDs present in the frozen official inventory, but **not individually assessed**. Six pillars present: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability. Corpus: `C:\Users\osama\AppData\Local\Temp\opencode\wa-wind-20261113-0d9659c6f7a5\manifest.json`, `questions.jsonl`, `best-practices.jsonl`, `question-titles.json`, `toc-contents.json`, `corpus-hashes.json`. Assessment source: `question-assessment.json`; validation output and hashes: `assessment-hashes.json`.

**Status meaning:** PASS = enough question-level evidence for the accepted pilot, not every BP; PARTIAL = real controls plus material gaps; FAIL = required control absent or readiness gate red; U = not observable with available access.

| ID | Framework question | Status | Evidence and boundary |
|---|---|---|---|
| OPS01 | OPS 1. How do you determine what your priorities are? | **PASS** | Accepted SQLite-pilot scope, dialect ADR and ranked backlog establish current priorities; numeric availability/RPO/RTO objectives remain open. |
| OPS02 | OPS 2. How do you structure your organization to support your business outcomes? | **PARTIAL** | Owner-led operation and role-specific admin/customer/driver surfaces exist; no on-call RACI, escalation coverage or support staffing evidence. |
| OPS03 | OPS 3. How does your organizational culture support your business outcomes? | **PARTIAL** | Evidence-led ADR, backlog, CI and preserved failure history support learning; no recurring operational review or post-incident cadence was found. |
| OPS04 | OPS 4. How do you implement observability in your workload? | **PARTIAL** | Hourly external readiness/tile checks, health endpoints, Docker health checks and watchdog exist; no Wind log groups, Wind alarms or Synthetics canaries are visible. |
| OPS05 | OPS 5. How do you reduce defects, ease remediation, and improve flow into production? | **PARTIAL** | CI runs typecheck, lint, integration, audit and exports; release is digest-pinned. The final quiet remote gates pass, but the working tree diverges from origin and an earlier resource-sensitive map shutdown failure remains history; candidate release lineage is not reconciled. |
| OPS06 | OPS 6. How do you mitigate deployment risks? | **PARTIAL** | Deployment takes a backup, verifies image revision/digest and rolls back on readiness failure; no deployment lock and no fresh proof of the live running digest. |
| OPS07 | OPS 7. How do you know that you are ready to support a workload? | **FAIL** | PILOT-READY is explicitly NO-GO with unresolved recovery, human alert, money, device and disabled-state gates. |
| OPS08 | OPS 8. How do you utilize workload observability in your organization? | **PARTIAL** | Uptime failure can email the last schedule editor; no evidence of organization-wide telemetry use, dashboards or scheduled operational review. |
| OPS09 | OPS 9. How do you understand the health of your operations? | **PARTIAL** | Recent scheduled Uptime runs and fresh public health/readiness checks are green; operational KPI review and complete resource health remain unproven. |
| OPS10 | OPS 10. How do you manage workload and operations events? | **FAIL** | No Wind CloudWatch alarm, confirmed human backup-failure destination or incident-event drill. Local watchdog restart is not an operator notification. |
| OPS11 | OPS 11. How do you evolve operations? | **PARTIAL** | Dated handoffs, contradiction corrections and backlog support improvement; no documented postmortem or recurring operations-improvement process. |
| PERF01 | PERF 1. How do you select appropriate cloud resources and architecture for your workload? | **PARTIAL** | Migration study selects one EC2/Docker host for the pilot and defers managed containers/RDS; no fresh production load/capacity measurement. |
| PERF02 | PERF 2. How do you select and use compute resources in your workload? | **PARTIAL** | t3.small amd64 is justified by the existing workload and OSRM image; detailed monitoring is disabled and current CPU/memory/EBS utilization is unavailable. |
| PERF03 | PERF 3. How do you store, manage, and access data in your workload? | **PARTIAL** | Single-writer SQLite on encrypted EBS plus versioned S3 backups fits the accepted pilot; PostgreSQL is only a rehearsed future path and storage performance is unmeasured. |
| PERF04 | PERF 4. How do you select and configure networking resources in your workload? | **PARTIAL** | CloudFront HTTPS, origin prefix-list restriction and one fresh public latency sample exist; distribution inspection and user-location/network performance measurements are missing. |
| PERF05 | PERF 5. How do your organizational practices and culture contribute to performance efficiency in your workload? | **PARTIAL** | Load-test tooling and competitor/performance studies exist; no recurring performance review, budget or production trend analysis was found. |
| REL01 | REL 1. How do you manage Service Quotas and constraints? | **U** | EC2/SSM/RDS/CloudFormation reads are denied, so quotas, actual networking constraints and service capacity cannot be assessed live. |
| REL02 | REL 2. How do you plan your network topology? | **PARTIAL** | Template defines one public-subnet host, CloudFront-facing prefix list and no SSH; live VPC/subnet/SG inspection is denied and there is no redundant topology. |
| REL03 | REL 3. How do you design your workload service architecture? | **PARTIAL** | A deliberately small modular monolith with one writer and local OSRM is documented; host and data-plane single points of failure remain. |
| REL04 | REL 4. How do you design interactions in a distributed system to prevent failures? | **PARTIAL** | Idempotency, locks, bounded timeouts, backoff and failure injection have real tests; the full durable protocol is PostgreSQL-only and not production scope. |
| REL05 | REL 5. How do you design interactions in a distributed system to mitigate or withstand failures? | **PARTIAL** | Docker restart policy, three-strike watchdog, retry/backoff and readiness rollback exist; host/AZ/EBS failure is not automatically tolerated. |
| REL06 | REL 6. How do you monitor workload resources? | **FAIL** | Detailed EC2 monitoring is false in the template; live inventory returns no Wind alarms, no Wind log groups and no canaries. |
| REL07 | REL 7. How do you design your workload to adapt to changes in demand? | **PARTIAL** | Application pools/timeouts are bounded and one small host is intentional for the pilot; no ASG or measured demand-scaling mechanism exists. |
| REL08 | REL 8. How do you implement change? | **PARTIAL** | Manual OIDC release, immutable ECR tags, digest/revision checks and rollback are strong; deployment is explicitly unlocked and current host identity is unverified. |
| REL09 | REL 9. How do you back up data? | **PARTIAL** | Two versioned S3 backups exist and the newest passes local integrity/FK/API restore checks; live-host baseline, timed replacement recovery and missed-backup alert remain open. |
| REL10 | REL 10. How do you use fault isolation to protect your workload? | **FAIL** | API, worker, OSRM and SQLite share one EC2 host, EBS volume and AZ. Off-host backups protect data but do not isolate workload failures. |
| REL11 | REL 11. How do you design your workload to withstand component failures? | **PARTIAL** | Process/container failures have restart and rollback controls; host, disk and AZ failures require manual replacement and recovery. |
| REL12 | REL 12. How do you test reliability? | **PARTIAL** | Failure-injection suites, restore checks and full persistence now pass on the fresh fixture; no current host-loss/AZ-loss game day or production-scale restore. |
| REL13 | REL 13. How do you plan for disaster recovery (DR)? | **PARTIAL** | Restore scripts, off-host S3 copies and the AWS migration runbook exist; numeric RPO/RTO and a timed fresh replacement-host recovery are not established. |
| SEC01 | SEC 1. How do you securely operate your workload? | **PARTIAL** | Template uses SSM instead of SSH, IMDSv2 and in-place OS patching; live patch/session configuration and logging cannot be inspected. |
| SEC02 | SEC 2. How do you manage authentication for people and machines? | **PARTIAL** | GitHub OIDC and EC2 instance roles avoid server-held cloud keys; human MFA/session posture is unknown and verification relies on a long-lived limited IAM credential. |
| SEC03 | SEC 3. How do you manage permissions for people and machines? | **PARTIAL** | Source scopes host to ECR pull and backup PutObject, and release role to one workflow/repository; live IAM policy evaluation is denied. |
| SEC04 | SEC 4. How do you detect and investigate security events? | **PARTIAL** | A CloudTrail log group exists; event filtering, ECR scan findings and Wind security alarms are unavailable or unproven. |
| SEC05 | SEC 5. How do you protect your network resources? | **PARTIAL** | Template denies SSH, restricts 443 to CloudFront and requires an origin secret; live SG/CloudFront reads are denied and WAF is not evidenced. |
| SEC06 | SEC 6. How do you protect your compute resources? | **PARTIAL** | IMDSv2, non-root container, encrypted EBS and scan-on-push are in source; live patch, vulnerability findings and host hardening are unverified. |
| SEC07 | SEC 7. How do you classify your data? | **PARTIAL** | Backups are treated as sensitive account data and app roles constrain access; retention is undecided and no formal classification/data-discovery inventory was found. |
| SEC08 | SEC 8. How do you protect your data at rest? | **PASS** | Fresh S3 HeadObject proves AES256 and a VersionId; template blocks public access, encrypts EBS and keeps backup files private. This is not a claim of live CMK/host verification. |
| SEC09 | SEC 9. How do you protect your data in transit? | **PASS** | Public HTTPS succeeds, template uses HTTPS to origin and TLS-only S3 policy, and the version-27 APK embeds only the current CloudFront API host. Live distribution config remains unreadable. |
| SEC10 | SEC 10. How do you anticipate, respond to, and recover from incidents? | **FAIL** | No confirmed human alert destination or recent incident-response/backup-failure drill; local automatic restarts do not establish response readiness. |
| SEC11 | SEC 11. How do you incorporate and validate the security properties of applications throughout the design, development, and deployment lifecycle? | **PARTIAL** | CI, role/security suites, dependency audit and immutable ECR scanning exist; current local audit has 13 moderate plus one low advisories (the earlier remote 14-moderate result is historical), scan findings are denied and working/canonical trees differ. |
| COST01 | COST 1. How do you implement cloud financial management? | **PARTIAL** | Migration study and owner spend-limit discussion establish a starting cost process; current plan, invoice and budget execution are unavailable. |
| COST02 | COST 2. How do you govern usage? | **PARTIAL** | CloudFormation and OIDC constrain resource creation and retention is deliberate; live stack/tag/policy governance cannot be inspected. |
| COST03 | COST 3. How do you monitor your cost and usage? | **U** | Cost Explorer/account-plan access is denied and no fresh budget or cost-anomaly evidence is available. |
| COST04 | COST 4. How do you decommission resources? | **PARTIAL** | ECR has a 200-image lifecycle rule and Retain policies are explicit; S3 retention and old-Azure cleanup remain owner decisions. |
| COST05 | COST 5. How do you evaluate cost when you select services? | **PASS** | The migration study compares EC2, Lightsail, Azure and Fargate/RDS with dated price and effort estimates; current invoices require separate refresh. |
| COST06 | COST 6. How do you meet cost targets when you select resource type, size and number? | **PARTIAL** | t3.small/30 GiB is based on the previous smaller host, not a current utilization review; no live right-sizing metrics. |
| COST07 | COST 7. How do you use pricing models to reduce cost? | **PARTIAL** | On-demand fits an uncertain short pilot and avoids premature commitments; current pricing-model review and burstable-credit cost are unknown. |
| COST08 | COST 8. How do you plan for data transfer charges? | **PARTIAL** | CloudFront PriceClass_100 and tiny compressed backups are documented; transfer usage is unmeasured and dynamic API caching is correctly disabled. |
| COST09 | COST 9. How do you manage demand, and supply resources? | **PARTIAL** | Fixed small capacity matches the current pilot scope; no demand metrics or scaling policy supports a cost/performance conclusion beyond that scope. |
| COST10 | COST 10. How do you evaluate new services? | **PARTIAL** | Managed alternatives were considered and paid changes are gated; no current TCO evaluation for the later RDS/domain/monitoring milestones. |
| COST11 | COST 11. How do you evaluate the cost of effort? | **PASS** | The study explicitly compares migration days/operational effort and rejects a larger Fargate/RDS change for the small pilot; ongoing toil is not measured. |
| SUS01 | SUS 1 How do you select Regions for your workload? | **PARTIAL** | eu-north-1 is mandated by the AWS project and the study compares it with the prior Swedish region; user latency and sustainability impacts are not measured. |
| SUS02 | SUS 2 How do you align cloud resources to your demand? | **PARTIAL** | One small always-on host is proportionate to the pilot but has no measured utilization-driven rightsizing or schedule. |
| SUS03 | SUS 3 How do you take advantage of software and architecture patterns to support your sustainability goals? | **PARTIAL** | Simple Node monolith, bounded resources and web tree-shaking reduce unnecessary work; no energy/resource-efficiency measurement exists. |
| SUS04 | SUS 4 How do you take advantage of data management policies and patterns to support your sustainability goals? | **PARTIAL** | Backups are compressed and ECR images have lifecycle retention; indefinite S3/account-data retention remains an explicit unresolved decision. |
| SUS05 | SUS 5 How do you select and use cloud hardware and services in your architecture to support your sustainability goals? | **PARTIAL** | amd64 is required by the current OSRM artifact, so Graviton is not a drop-in choice; utilization and current-generation alternatives are unreviewed. |
| SUS06 | SUS 6 How do your organizational processes support your sustainability goals? | **U** | No organizational sustainability review, ownership or improvement process was found in the supplied code and evidence. |

### Prioritized infrastructure findings

| Risk | Finding | Remediation |
|---|---|---|
| **High — severe impact / medium likelihood** | No live baseline and timed replacement recovery; human backup alert missing | Owner-session baseline; timed restore; confirmed destination and synthetic missed-backup alert |
| **High — severe impact / medium likelihood** | Single EC2/EBS/AZ and no Wind telemetry | Accept explicitly for tiny pilot or fund rehearsed managed PostgreSQL/HA path; add logs/metrics/alarms first |
| **High — full client impact / medium likelihood** | AWS-owned hostname is embedded in apps and tracking links | Owned domain and staged client/link migration; retain CloudFront until proven |
| **Medium — broad defect risk / medium likelihood** | Deployment has no lock, live digest is unverified, dirty tree diverges | Serialize deploys with `flock`, inspect actual host image/revision, reconcile source before release |
| **Medium — account-data exposure / medium likelihood** | Retention indefinite and live IAM/bucket details unreadable | Owner lifecycle policy and least-privilege readback; do not delete backups during verification |
| **Medium — cost surprise / unknown likelihood** | No current invoice/plan/CE/right-sizing data | Confirm plan and spend limit; measure before commitments; no paid service activation by agents |

---

## 7. Product readiness and backlog reconciliation

**Production verdict: NO-GO.** The 22-criterion readiness subset now totals **15 PASS / 5 FAIL / 2 PARTIAL**. Gates **2.3 and 5.2 are PASS** for the recorded physical-device sandbox recovery and N+1 automatic receipt recovery; neither is production authentication evidence. This subset does not independently imply production GO.

| Gate | PASS | PARTIAL | FAIL |
|---|---|---|---|
| 1 — Data recovery | 1.1, **1.4** | 1.2 | 1.3 |
| 2 — Order recovery | 2.1, 2.2, **2.3** | — | — |
| 3 — Money accountability | 3.1 | — | 3.2, 3.3 |
| 4 — Access enforcement | 4.1, 4.2 | — | — |
| 5 — Install/update/verification | **5.2**, 5.3, 5.4 | — | 5.1 |
| 6 — Test environment | 6.1, 6.2 | — | — |
| 7 — Honest scope | 7.1, 7.2 | 7.4 | 7.3 |
| **Total** | **15** | **2** | **5** |

The five failures remain: **1.3** human missed-backup alert, **3.2** unambiguous payments-off state (no provider activation), **3.3** A11 immutable door-collected amount/variance, **5.1** authenticated production journey, and **7.3** visible disabled states. **1.2** remains PARTIAL pending the live baseline and timed replacement-host recovery; **7.4** remains PARTIAL pending full Arabic/RTL review. Gate 1.4 now records exactly two documented zero-row legacy exceptions, preserved by decision rather than deleted to make a schema diff empty. Gate 5.2's versionCode 27 → 28 install preserved the pending command and automatically recovered order 6 through its receipt with no duplicate POST; the manual-Retry-after-upgrade variant remains [U]. Green remote tests and sandbox journeys do not close the remaining production and product gates.

The backlog is not a promise to implement every competitor feature. Accepted current exclusions include card/wallet activation, marketplace/community, B2B catalogue, a Capacitor rewrite, credentials in app config, `allowBackup` for addresses, ad-storage analytics defaults, permission sprawl, always-on background location, and a universal offline-write claim.

| ID | Current evidence-based state | Missing acceptance / correction |
|---|---|---|
| B1 dialect | **DECIDED:** C now, A next, B ruled out | Do not schedule PG-only modules into the SQLite pilot |
| B2 live dialect | **OPEN** | SSM/EC2 denied; `schema=3` and SQLite backup are strong but not a live env dump |
| B3 restore | **PARTIAL** | Local newest/prior restore + API boot done; timed replacement/live baseline remains |
| B4 schema orphans | **DECIDED — preserve** | Optional owner cleanup later, not during verification |
| A1 zone addressing | **PARTIAL / cutover-dependent for zones** | Structured zone + line + landmark + label/default and server fee derivation |
| A3 delivery proof | Source DONE, acceptance needed | Wrong/right code, five misses, audited reset on actual backend |
| A5 shift + board | **ABSENT** | No shift lifecycle, ready queue, or per-parcel scan; HAAT is only a shift/offer benchmark, Souq supplies the stronger custody shape |
| A7 durable writes | **PARTIAL** | Opt-in/PostgreSQL/allowlisted durable protocol; legacy booking/advance recovery only on SQLite |
| A8 zone fees/windows | **PARTIAL / PG-only capacity** | Per-zone fee and capped delivery windows |
| A9 destination consent | Source DONE, acceptance needed | Counterparty accept + notifications |
| A10 stale tracking | Source DONE, acceptance needed | 61-second stale state visible to counterparty |
| A11 collected variance | **PARTIAL; collected amount absent on SQLite** | `cash_receipts.collected_minor` is PostgreSQL-only; immutable door amount + typed reason required |
| A12 parcel service level | **ABSENT** | Parcel priority attribute, not a second order type |
| A13 notification channels | **ABSENT** | Per-event versioned channel recreation test |
| A14 alarm re-arm | **PARTIAL** | Boot/unlock/time/timezone/package-replaced handlers |
| A15 offline bundle | **PARTIAL** | Zones/fees/windows/saved addresses, not only summary |
| A2 double-entry | **PARTIAL / PG-only** | Existing SQLite append-only trigger is not a double-entry journal |
| A6 custody | **PG-ONLY** | Append-only per-parcel custody evidence |
| D1 booking retention | **DONE with real PG Part A** | At the cap, concurrent committed retry returns HTTP 200 with the original order/receipt; revoked-session replay returns 401 |
| D2 typecheck | **DONE, exit 0** | Continue on every final change |
| D3 PG fixture | **DONE** | Four dark suites and full persistence pass on fresh local 55475; final full remote 55494 persistence also exits 0 with 52 selected suites plus legacy at `2026-11-14T01:50:21.7398573Z` |

### 7.1 Inherited Fable workstreams not replaced by A1–A15

The original [Fable handoff](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/leftover-tasks-4716c1/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md) is broader than the later competitor backlog. Preserve these as **[other-agent] open/evidence-needed**, not as new work completed here:

- **Slow map and place data:** measure cold/warm first tile and readiness on real 3G, enforce a page-weight budget, remove the single OpenFreeMap dependency after an owner-approved alternative, audit road/Arabic-name coverage, and test marker projection without hiding a genuine wrong turn.
- **Locations people already have:** accept coordinate pairs, allowlisted Google Maps URLs and Plus Codes with confirmation; let a recipient propose a corrected drop-off privately; learn a completed delivery’s verified fix for that same customer; localize recent city names in the current UI language.
- **Roads and ETA:** expire/confirm checkpoint reports, build a permitted-roads layer only from owner evidence, record promised versus actual minutes with sample sizes, and learn road speeds only with an approved driver-location retention policy. The handoff’s `ceil(minutes × 1.3) + 2` description is corrected in §8.5.
- **Driver field behavior:** measure 30-minute locked-screen/mobile-data survival, fix arrival-without-fix behavior, and close blocked-courier/cancel-after-handover custody cases. These are not proven by foreground sandbox trips.
- **Stranger-facing basics:** verified identity recovery, distance/fare explanation, staffed emergency path, update distribution, field crash reporting, and TalkBack review by a person. No payment provider is activated by these recommendations.
- **Map sources and licences:** do not scrape Google/Waze/Facebook data or assume commercial rights. Keep source, licence, date, and confirmation count per imported record. OCHA obstacles, HDX roads, GeoMOLG names, ECF roads, and Doroob require an owner licence/partnership decision. A Waze deep link is cheap; Waze for Cities and paid Google Places are separate approvals. The older 19-place provider comparison (Nominatim 18, Azure Maps 8, Amazon Location 4) is not a large enough current corpus for a provider switch.
- **Minutes-level operations:** the hourly Uptime check is not the requested minutes-level human alert. It needs a separate owner-approved design and delivery test.
- **Optional AI:** no in-product AI feature is assumed. Arabic road-report structuring or support triage requires an explicit owner privacy/spend decision.

These gaps are one reason a successful local test run still does not make the app “Uber grade.” They also prevent a narrow A5/A11-only roadmap from silently dropping the map/address/operations work already identified.

---

## 8. Competitor and public research — verified mechanisms and limits

### 8.1 Souq Tulkarm: strongest cash/custody reference

[read] [`souq-tulkarm-feature-implementation.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Wind%20verified%20research%20atlas/souq-tulkarm-feature-implementation.md) and the independent [`souq-tulkarm.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Competitor%20feature%20implementation%20atlas/souq-tulkarm.md) establish:

- **Address/pricing shapes:** `zoneId + addressLine + landmark + label + isDefault`; zone fee/min-order, window cutoff/capacity. Server enforcement is **[U]** from client evidence.
- **Door cash:** `{orderId, proofInput, amountCollectedCents, discrepancyReason}`; nonzero delta requires one of six cash-variance reasons. Six delivery-failure reasons are a separate enum; `CUSTOMER_DID_NOT_PAY` is not a generic failure label.
- **State axes:** exactly ten customer order statuses, eight custody actions, separate shift/cash/scan states. The “29+ statuses” was a token-census error.
- **Custody:** ready queue loads on active status and order/custody/fleet events, not directly every ten seconds; the shift itself is polled every ten seconds. Bag/package credential and customer delivery credential are distinct. Offered transfer does not move responsibility until recipient scans. Return needs shop confirmation.
- **Offline:** `souq.outbox` is **opt-in**, actor-scoped `[session.id, storeId, role]`, idempotency-keyed, sequential, and focused on driver custody/delivery/cash handover. Admin settlement/adjustment, address writes, cancellation, and many other mutations do not enqueue. There is no service-worker background replay proof.
- **Security caution:** outbox payloads are JSON in localStorage, with no encryption in that helper. Do not copy sensitive proof/cash payloads blindly into Wind storage.

**Use for A5/A11:** ready-queue/custody and collected-amount/variance are the useful patterns. Do not claim HAAT proves those invariants, and do not turn the outbox into “every write works offline.”

### 8.2 Shiply: HBC-aware corrections replace the older string-adjacency reading

[read] [`shiply-feature-implementation.md:17-25,79-121,271-290`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Wind%20verified%20research%20atlas/shiply-feature-implementation.md:17) establishes Hermes **HBC 98**, English **and Arabic** product copy, and function-aware relationships. It supersedes the older [`Competitor feature implementation atlas/shiply.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/Competitor%20feature%20implementation%20atlas/shiply.md) where that file says plain “Metro” source, no Arabic product copy, or a three-step attempt model.

- `AttemptToDeliver` and `AttemptToDeliver2` support at least a second-attempt presentation. No third-attempt status, maximum rule, or automatic three-step lifecycle was found.
- `delivered_1/2`, `returned_1/2/3`, `pending_1/2` are **notification channel IDs**, not attempt substates.
- “Error sending. Event queued.” is **Sentry transport**, not parcel outbox evidence. React Query retries and local drafts do not prove offline parcel writes.
- Parcel address payload uses `city_id`, `village_id`, `street_name`, `latitude`, `longitude`; a landmark is not established. Store billing `default_address` is a different model.
- Wallet/financial-difference vocabulary exists, but it does not establish Souq’s door-collected amount or immutable close invariants.

### 8.3 HAAT Client, Driver, Courier

- [read] Client has area/landmark/driver-instruction addressing and granular Arabic order-state surfaces. The address code proves an area gate for a search path and a note-error state, not a universal final-save/server rule.
- [read] Driver/Courier resource study proves shift registration/lock states, timed accept/reject vocabulary, collection/delivery screens, and balance/earnings history. It does **not** prove per-parcel scanning, collected-versus-expected variance, shift cash close, settlement timing, offline replay, or immutable server ledgers.
- [read] MQTT uses server-issued parameters, QoS 0, clean sessions, Paho automatic reconnect disabled, custom exponential retry capped at 120 seconds, and a polling fallback. QoS 0 is not guaranteed delivery.
- **Retracted causal claim:** `envs-list.haatcloud.com` being NXDOMAIN on the owner network does not prove the cause of the splash “no internet” message. The generic message belongs to a Remote Config timeout path. This is a local reachability observation, not a global outage finding.
- No IPA, runtime server contract, or production checkout behavior was verified.

### 8.4 Careem Rider / Captain

- Rider address resources support map pin, nickname, notes, building/street validations and photo components. Do not turn this into a blanket apartment/building-number requirement.
- Cash-booking warnings and arrears/balance blocks exist. Cash is not thereby a Careem Pay wallet instrument.
- Captain resource study supplies 14 `breakdown_*` keys including base trip earnings, tips, bonuses, guarantees, fines, behavior penalties, fine reversals, money in/out, and “Other.” Supplier-fee/“100%” copy does not prove a zero take rate or universal payout terms.
- Captain version is **89.70.2**, not an older build. Cash limits, eligibility formulas, and actual settlement remain **[U]** from static evidence.

### 8.5 Uber Rider

- Useful patterns: map-first home, saved places, payment-method-first checkout, offer expiry fields, provider configuration and camera/testable shapes.
- New POI study shows `GetMapPoisForAnchorRequest/Response`, anchor types, `PoiGroup`, `PoiGroupSuccess`, `SuggestedPlace` beside `SavedPlace`, and `POICache`. The `uber-map-and-poi.md` portion is DEX-string-table evidence only; it does not recover enum values/method bodies or the new RPC route.
- Do not copy the GL engine, two-renderer complexity, H3 stack, Ramen transport, 3D cars, or server map documents for a ~50-user pilot.
- ETA source correction: client `src/map-math.ts` uses `round(minutes * 1.3) + 2` **minutes**; server `journey.ts` uses `(round(1.3 * ceil(rawSeconds/60)) + 2) * 60` **seconds**. `ceil(minutes × 1.3) + 2` is not either exact implementation.

### 8.6 Athkar, Salati, WhatsApp, and public corporate claims

- Athkar and Salati are prayer utilities, not delivery competitors. Keep only regional Android craft/RTL/alarm/offline lessons.
- The local artifact studies found no WhatsApp ordering flow in Shiply or Souq. Treat Wind’s WhatsApp ordering as an unvalidated opportunity, not table stakes.
- [other-agent] [`Delivery comparison master evidence.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/reports/Delivery%20comparison%20master%20evidence.md) correctly bounds public claims: H3 is an index, not distortion-free dispatch or latency proof; Uber’s ~2M figure is traffic-segment predictions, not trips; Careem engineering articles are historical, not current SLOs; HungerStation outcomes are company-reported migration-wide results, not autoscaling causation; Shaded Route is campaign evidence, not controlled 10–15°C cooling; HAAT 3300→114 ms is arithmetically 28.95× / 96.55% but the raw benchmark is unverified; Careem ownership requires entity-specific treatment; Palestinian address-level availability remains unverified.
- These public-source corrections are preserved with their primary-source index, not relabeled as fresh tests in this pass.

---

## 9. Other sessions and independent-demo audit

### 9.1 Completed research session

The thread `Competitor App Research Verification` is **completed** (`run 53` finished 18:02:48Z). Its final [`reports/Wind verified research atlas.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/reports/Wind%20verified%20research%20atlas.md) is a synthesis, not a new runtime test. It explicitly reports uneven depth and failed long-running streams. The separate [`reports/Competitor feature implementation atlas.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/reports/Competitor%20feature%20implementation%20atlas.md) is useful but contains time-sensitive and mechanism-specific claims corrected in section 10 below.

### 9.2 Original-demo session: current file inventory

The separate session’s task was to write original Expo apps under `C:\Users\osama\OneDrive\Documents\wind-competitors`, not to recover proprietary source. A fresh read-only inventory found no later five-demo completion report; the states below come from actual files, package scripts and Git state, not delegation messages.

| Demo | Other-session state | Independent verification in this pass |
|---|---|---|
| `wind-comp-uber` | Ledger claims complete, commit `dac1ff5` | `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` exit 0 (`selfcheck OK: money, haversine, interpolation, quote total, surge, eta`); `git rev-parse --short HEAD` = `dac1ff5`, clean status output |
| `wind-comp-careem` | Ledger claims complete, commit `2bb00f8` | same three gates exit 0 (`selfcheck OK: money, arrears gate, settle, unpaid growth, quote total, statement nets, geo`); HEAD `2bb00f8`, clean status output |
| `wind-comp-haat` | Complete static-gate candidate | **26 non-dependency files**, 9 app routes, README/selfcheck/Git present. `0f7eb2a02c1152659de926c3bb8533198e70efa5`, clean; typecheck/lint exit 0 and **12/12 selfchecks pass**. Device/runtime behavior remains **[U]**. |
| `wind-comp-shiply` | **Static gates PASS; runtime [U]** | At `2026-11-14T02:29:49Z`: **29 non-dependency files and seven routes**; README, selfcheck and `.git` present. Typecheck/lint exit 0 and **17/17 selfchecks pass**. No tracked changes were observed during the final 15-second checkpoint; that quiet window does not prove work stopped, so re-inventory before use. |
| `wind-comp-souq` | Incomplete/unverified | At `2026-11-14T02:29:49Z`: **29 non-dependency files and eight routes**, including `src/app/shop/[id].tsx`; selfcheck present, README/Git absent, so declared gates were not run. No tracked changes were observed during the final 15-second checkpoint; that quiet window does not prove work stopped. |

Raw independent logs: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\`. The current Uber/Careem Git heads still match the independently tested commits; all five demos use junctions to a shared `node_modules` and have no repo lockfile, so they are not portable self-contained checkouts. Demo README limits are explicit: in-memory state, mock maps, mock payments, no backend, no AsyncStorage, compressed simulated movement. The shared ledger’s screenshots show official/reference apps’ pre-login states, not proof that all five original demos are complete. Its statement that HAAT Driver/Courier were not installed is outdated after the later official Play artifact acquisition.

---

## 10. Contradiction register — what changed and why

| Earlier claim | Current verified interpretation | Fresh evidence |
|---|---|---|
| Installed production client uses retired Azure and therefore cannot reach AWS | True for old version 24; **superseded by version 27** | Signed/hash-verified v27 has CloudFront once, Azure zero; installed/launched |
| CI contains retired Azure literal | True in the old local checkout; canonical now uses `vars.WIND_API_URL` | Local CI updated to the same variable; EAS env explicitly CloudFront |
| HAAT Driver/Courier artifacts are absent / package IDs uncertain | False now | Official Play splits/hashes/signers for `com.haat.haatdriver` and `com.haat.courier` |
| Dialect decision is open | False now | Accepted ADR C now / A next / B ruled out |
| Restore was never attempted | False now | Newest/prior S3 copies pass local integrity/FK and API boot; live replacement remains open |
| “37 tables” means 37 application tables | Incorrect | 36 application tables + internal `sqlite_sequence` |
| `native_push_tokens` is an active SQLite feature | Incorrect | PostgreSQL-only path; zero-row legacy SQLite table preserved |
| A7 is universal durable/offline writes | Incorrect | Opt-in, PostgreSQL-only, route-allowlisted durable protocol; narrow legacy SQLite recovery |
| A11 has expected and door-collected amounts on SQLite | Incorrect | SQLite `cash_entries` has remittance/adjustment only; `cash_receipts.collected_minor` is PG-only |
| Full persistence is green on the original OneDrive fixture | Incorrect | That run failed; new local-temp fixture’s complete run is green |
| Integration is always green | Incorrect | A later map shutdown assertion failed under load; the separate final quiet remote run passed all 106 suites and every combined gate component exited 0 at `2026-11-14T01:53:03.9944577Z`. The current local fallback passes 109 suites and full persistence; historical failures are retained |
| Canonical and working trees have the same suite counts | Incorrect | Canonical 131/124/56; working 109/102/52 |
| Souq queues every write | Incorrect | Only `queueAs` calls; actor-scoped driver custody/delivery/cash subset |
| Souq has 29 order statuses and one failure enum | Incorrect | Ten customer statuses; separate cash-variance and delivery-failure maps |
| Shiply has a three-attempt lifecycle | **Not proven** | `AttemptToDeliver2` only; numbered strings are notification channels |
| Shiply “event queued” proves parcel outbox | Incorrect | Sentry transport |
| Shiply has no Arabic product copy | Incorrect | HBC string table has Arabic product objects |
| HAAT NXDOMAIN proves its splash error cause | **Retracted** | Remote Config timeout is proven; DNS is only local context |
| Careem cash warnings prove Careem Pay semantics | Incorrect | Cash/arrears surfaces are distinct from wallet/payment instrument claims |
| “More static classes” means a single canonical count | Incorrect | Counting bases differ; name each method |
| Demo apps equal competitor source or production implementations | Incorrect | Original in-memory/mock demos; all five passed static gates at the `2026-11-14T05:32` checkpoint; none has device/runtime proof |
| All pilot gates can be called GO after the APK installs | Incorrect | Production auth, human alert, replacement recovery, A11/A13/UI states remain open |

Historical files are preserved; this register supersedes their claims without rewriting their timestamps or evidence.

---

## 11. Remaining blockers and exact owner actions

1. **Production credential / authenticated journey:** owner must create or identify a dedicated production test account and provide it through an approved secret mechanism. No further credential request was made in this pass. Verification: customer booking → driver pickup/delivery with customer code → admin cash record → driver confirm → both balances reconcile.
2. **Live host read access:** owner refreshes AWS session with read-only SSM/EC2/CloudFormation/CloudFront/RDS/SNS permissions. Capture only non-secret env keys, dialect, schema, image digest/revision, table counts, SG/distribution config, and log/alarm configuration. Do not print `/srv/wind-api.env`.
3. **Human alert:** owner chooses an email/notification destination and paid-plan/spend posture. Implement then deliberately fail a synthetic backup freshness check and prove receipt/acknowledgement.
4. **Replacement recovery:** run the newest backup onto a new isolated host, record source backup time, operator, elapsed RTO, observed RPO, image revision, row/money/custody reconciliation, and sign-in/session-reset behavior. Keep production writes frozen only under an approved incident procedure.
5. **Current release lineage:** reconcile the dirty local branch with canonical master and ensure the actual candidate’s CI is green before another image/APK release. The release-image workflow itself does not prove candidate CI.
6. **Product gaps:** implement and test A11, A13, A12, A14, A5, and visible disabled states in the accepted sequence; defer PG-only work to Option A. Cash stays the only production payment method.
7. **Domain:** approve and stage an owned domain without breaking old tracking links or installed apps. Do not use cross-Region routing to solve it.
8. **Other-session demos:** all five now pass typecheck, lint and selfcheck: 15/15 gates at `2026-11-14T05:32:24Z`–`05:32:52Z`. HAAT passed 12 checks, Shiply 17 and Souq 24. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\summary.json`. Do not infer production or device runtime behavior from static checks.
9. **iOS:** no IPA exists, so no iOS implementation/parity claim is possible. Obtain a lawful artifact/build before making one.
10. **Competitor runtime:** server algorithms, enforcement, queue ordering, custody transitions, settlement, and uptime remain **[U]** unless separately authorized dynamic tests prove them.

---

## 12. Evidence and report-history index

### 12.1 Current verification / readiness

- [`docs/HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md) — canonical next-agent implementation brief and connected remaining-work graph.
- [`docs/verification/REVIEW-FIXES-2026-11-14.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/verification/REVIEW-FIXES-2026-11-14.md) — latest review fixes, current 109-suite/persistence results and version-29 physical acceptance.
- [`docs/verification/CONSOLIDATED-24H-2026-11-13.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/verification/CONSOLIDATED-24H-2026-11-13.md) — current worktree copy of this consolidated file; the original-repository copy is historical.
- [`docs/verification/production-safety-audit-2026-11-15.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/verification/production-safety-audit-2026-11-15.md) — current worktree restore hashes/schema corrections (its body correctly says the work was 13 Nov despite the filename).
- [`docs/REA/2026-11-13-PILOT-READY.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/REA/2026-11-13-PILOT-READY.md) — current worktree readiness gates (15 PASS / 2 PARTIAL / 5 FAIL); the original-repository copy is historical.
- [`docs/REA/2026-11-13-PILOT-SCOPE.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/REA/2026-11-13-PILOT-SCOPE.md) — current worktree pilot inclusion/exclusion boundary.
- [`docs/REA/2026-11-13-DIALECT-ADR.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/REA/2026-11-13-DIALECT-ADR.md) — current worktree C/A/B decision.
- [`docs/REA/2026-11-13-GAP-BACKLOG.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/REA/2026-11-13-GAP-BACKLOG.md) — current worktree remaining work and acceptance criteria.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\` also contains `2026-11-13-IMPLEMENTATION-HANDOFF.md`, `2026-11-13-VERIFIED-ADDITIONS.md`, `2026-11-13-RECONCILIATION.md`, and `2026-11-13-gap-backlog-source-audit.md`, the source evidence behind those decisions.
- [`docs/REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md) — earlier production/phone analysis and stale-client evidence.
- [`docs/VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/VERIFICATION-ADDENDUM-2026-11-13-FINAL.md) — earlier AWS/phone/competitor addendum.
- [`docs/HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md) and [`docs/HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md) — original release/cutoff instructions and blockers.
- [`research_notes/verification-2026-11-13/CLAIMS-LEDGER.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/research_notes/verification-2026-11-13/CLAIMS-LEDGER.md) — earlier claim classes and evidence locations.
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\` — all fresh command logs, APK, restore evidence, EAS logs, AWS/public/GitHub reads, and final device evidence.

### 12.2 Main research atlases and evidence sets

- [`reports/Wind verified research atlas.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/reports/Wind%20verified%20research%20atlas.md) — completed 11-study synthesis; read with this report’s newer corrections.
- [`reports/Competitor feature implementation atlas.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/reports/Competitor%20feature%20implementation%20atlas.md) — separate mechanism atlas; several Shiply and time-sensitive claims superseded here.
- [`reports/Delivery comparison master evidence.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/reports/Delivery%20comparison%20master%20evidence.md) — corrected public/corporate evidence and primary-source index.
- [`reports/Fable 5.2 production upgrade handoff.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/reports/Fable%205.2%20production%20upgrade%20handoff.md) — earlier production handoff.
- [`.claude/worktrees/leftover-tasks-4716c1/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/leftover-tasks-4716c1/docs/HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md) — original separate-worktree handoff referenced at the start of the research. Its related ledgers are [`docs/CURRENT-WORK.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/docs/CURRENT-WORK.md), [`PLAN-2026-11-10-OPEN-ITEMS.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/leftover-tasks-4716c1/docs/PLAN-2026-11-10-OPEN-ITEMS.md), [`PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/leftover-tasks-4716c1/docs/PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md), and [`HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md`](C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/leftover-tasks-4716c1/docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md). Azure-as-current statements in older plans are historical.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\` — `security_reliability_quality.md`, `repository_functionality_audit.md`, `palestinian_market_requirements.md`, `mobile_experience_audit.md`, `maps_tracking_dispatch.md`, `fable_claude_prompting.md`, and `backend_aws_architecture.md`.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\` — `baseline-and-deployment.md`, `wind-money-and-state.md`, `wind-geo-and-dispatch.md`, `careem-captain-earnings-and-cash.md`, `careem-rider-payment-and-address.md`, `souq-tulkarm-feature-implementation.md`, `shiply-feature-implementation.md`, `haat-address-and-checkout.md`, `haat-tracking-and-bootstrap.md`, `uber-offer-eta-payment.md`, `uber-map-and-poi.md`.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\` — `production-deployment-evidence.md`, `uber-benchmark.md`, `careem-rider-captain.md`, `haat-client.md`, `shiply.md`, `souq-tulkarm.md`.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\` — `PALESTINIAN-COMPETITORS-INDEX.md`, `UBER-4.655-rider.md`, `CAREEM.md`, `HAAT.md`, `HAAT-DRIVER.md`, `SHIPLY.md`, `SOUQ-TULKARM.md`, `ATHKAR.md`, `SALATI.md` and their artifact-specific evidence. The index’s corrected companion studies must be read before reusing its status/offline cells.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 verified execution handoff\` — earlier execution material, including `reference-rea-audit.md`, `audit-b-infra-tests.md`, and the REA checkout used by that session.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\` — `HANDOFF.md`, `INDEPENDENT-REVIEW.md`, `final-classification-report.md`, and typecheck/lint/integration logs; retained as history, not assumed current.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison-evidence\` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison\` — corporate, architecture, operations, and independent red-team source files indexed by the master evidence report.
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-haat-artifacts-20261113\` — official Play Driver/Courier binaries, hashes, manifests, resources, and signing proof.

### 12.3 AWS / recovery / deployment sources

- Canonical [`infra/aws/wind.yaml`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/aws/wind.yaml) — current AWS template, not live readback.
- Canonical [`docs/operations/deploy.md`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/docs/operations/deploy.md) — actual AWS host design and release process.
- Canonical [`docs/operations/aws-migration-study.md`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/docs/operations/aws-migration-study.md) — options/cost/effort and migration history.
- Canonical [`docs/operations/restore.md`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/docs/operations/restore.md) — recovery semantics and previous drills.
- Canonical [`infra/vm/deploy.sh`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/deploy.sh), [`wind-backup.sh`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/wind-backup.sh), [`wind-restore.sh`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/wind-restore.sh), [`wind-watchdog.sh`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/wind-watchdog.sh), [`wind.cron`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/wind.cron), [`Caddyfile`](C:/Users/osama/AppData/Local/Temp/opencode/wind-baseline-b89f220/infra/vm/Caddyfile) — operational code.
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\` — fresh permitted and denied AWS calls.
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\public-final\` — fresh public health/readiness.
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\github-final\` — release/uptime runs and variable permission failure.
- `C:\Users\osama\AppData\Local\Temp\opencode\wa-wind-20261113-0d9659c6f7a5\` — validated live framework corpus and question-level assessment.

### 12.4 Other-session demos

- `C:\Users\osama\OneDrive\Documents\wind-competitors\LEDGER.md` — other session’s build ledger and limitations.
- `C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-uber\README.md` and `wind-comp-careem\README.md` — implemented patterns and mock/in-memory limits.
- `C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-haat\` — 26 files, 9 routes, README/selfcheck/Git present; static gates pass at `0f7eb2a`; logs are `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\haat-typecheck.log`, `haat-lint.log`, `haat-test.log`, and `haat-git.log`.
- `C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-shiply\` — at `2026-11-14T02:29:49Z`: 29 non-dependency files and seven routes; README/selfcheck/Git present. Typecheck, lint and 17/17 selfchecks exit 0 (`shiply-gates-current.json` and logs in the evidence directory below). `C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-souq\` — 29 non-dependency files and eight routes; selfcheck present, README/Git absent, so its declared gates remain unrun. Neither is device/runtime proof.
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\` — independent Uber/Careem typecheck/lint/test logs.

---

## 13. Final gate summary

| Gate | Final result | Evidence |
|---|---|---|
| Typecheck / Expo lint | **PASS**, both exit 0 | [final-gates-after-cash-fix-exit.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/final-gates-after-cash-fix-exit.json) |
| Current post-N+1 typecheck / Expo lint | **LOCAL FALLBACK PASS**, both exit 0; preferred remote SSH was refused and is not claimed | [result.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/continuation/current-source-static-gates/result.json), with raw `typecheck.log` and `lint.log` beside it |
| Dependency policy audit | **CURRENT LOCAL FALLBACK PASS**, rejected `[]`; **13 moderate + 1 low** remain reported | `npm run check:audit`; `.artifacts/dependency-audit/raw.json`. The earlier remote 14-moderate result is historical |
| Integration | **CURRENT LOCAL FALLBACK PASS**, 109 suites including cap/partner replay, quoted/replay authority and terminal rejection | [integration-partner-fixes-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/continuation/current-source-static-gates/integration-partner-fixes-final.log); earlier remote 106-suite pass retained as history |
| Full persistence | **CURRENT LOCAL FALLBACK PASS**, 52 selected suites plus legacy, exit 0 on fresh 55475 | [persistence-partner-fixes-final.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/continuation/current-source-static-gates/persistence-partner-fixes-final.log); earlier remote persistence remains historical evidence |
| Partner/readiness integrity | **PASS**, rejected scope/reference rollback, partner cap replay, schema-21 refusal and migration-30 readiness | `tests/partner-atomic.test.mjs`, `partner-retry-race.test.mjs`, and `db-api.test.mjs`, all included in the 109-suite log |
| PostgreSQL cash resolution | Original guard produced real HTTP 500; isolated fix allows only decision/resolution metadata while amounts and all other fields stay immutable. Targeted and full persistence now pass | [before-fix evidence](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/pg-admin-cash-resolution-before-fix.txt), [pg-cash-resolution-fix.log](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/pg-cash-resolution-fix.log) |
| Three-role native build and smoke | **CURRENT PASS**, version-29 customer/driver/admin APKs install over version 28; all roles launch with correct synthetic identities | [artifact-verification.json](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4192/apks-final-review-29/artifact-verification.json), [smoke-results.json](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4192/device/smoke-results.json) |
| Admin navigation | **CURRENT PASS**, five translated tabs plus Settings → Account → Back on the physical phone | [admin-tabs-results.json](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4192/device/admin-tabs-results.json) |
| Cash handover | **CURRENT PASS**, 300 cents recorded by admin and confirmed by driver; both role APIs report zero owed/pending | [cash-final-results.json](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4192/device/cash-final-results.json) |
| Ambiguous booking recovery | **CURRENT PASS**, version-29 proxy 4194: forced client 409 after real commit of order 4, same requestId/order returned on Retry and confirmed by receipt | [ambiguous-results.json](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4194/device/ambiguous-results.json) |
| N+1 pending-command upgrade | **PASS for automatic recovery**, real versionCode 27 → 28 preserved `firstInstallTime` and the command; receipt reconciliation recovered order 6 with no second POST. Manual Retry was not offered and remains [U] | [upgrade-final-summary.json](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4193/device/upgrade-final-summary.json) |
| Additional native acceptance | C-04 required flow and scoped D-05/A-06 **PASS**; C-01 cached summaries **FAIL**; D-04 and X-05 **PARTIAL** | [offline/GPS results](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4192/device/acceptance-c01-c04-x05/acceptance-results.json), [driver/admin results](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/.expo/phone-qa-4192/device/acceptance-d04-d05-a06/acceptance-results.json) |
| App-level isolated restore | **PASS**, API ready in 1.254967 seconds; integrity/FK/schema and all 36 application-table counts pass. Not full replacement-host RTO/RPO | [timed-restore-result.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/continuation/restore/timed-restore-result.json) |
| Original demos | All five static gate sets **PASS**, 15/15; HAAT 12, Shiply 17 and Souq 24 checks. No demo device/runtime proof | [summary.json](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/other-session/final-demos/summary.json) |

The final quiet gates supersede the earlier resource-sensitive map failure, connection failures, and the presence-expiry failure; all are retained in this report. The deterministic presence fixture persists a two-minute-old lease and still requires 409 `presence_expired`, so no assertion was removed.

**Verdict remains NO-GO for production.** Authenticated production journeys, exact live-host environment/digest/counts, human backup-failure notification, timed replacement-host RTO/RPO, the remaining field/Arabic/TalkBack matrices, visible disabled states, A11/A13 and other product work, iOS, and demo device journeys remain open. N+1 pending-command automatic recovery is now proven; its manual-Retry-after-upgrade variant remains [U]. No deployment, production migration, payment activation, paid AWS change, or git mutation was performed.

The single continuation handoff for Fable 5.2 is [`docs/HANDOFF-2026-11-14-FABLE-5.2-VERIFIED-CONTINUATION.md`](C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification/docs/HANDOFF-2026-11-14-FABLE-5.2-VERIFIED-CONTINUATION.md), maintained in this separate verification worktree.

This file is the single handoff point. It preserves the last 24 hours’ findings, real code/configuration changes, test and artifact identities, AWS question-level assessment, corrected contradictions, other-session status, and exact remaining evidence gaps. Any later agent should update the relevant row with a new command/artifact instead of deleting a failure or copying an older “DONE” label without its tree and run.
