# Wind / Fastship — Fable 5.2 verified continuation handoff

> **Next agent:** start with [`HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md`](HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md), the compact connected implementation brief and task graph. This document remains the full evidence/history index.

**Date:** 14 November 2026  
**Production verdict:** **NO-GO**  
**Purpose:** single continuation point for the app, native-build, physical-phone, persistence, recovery, AWS, competitor-research and original-demo work performed during 13–14 November 2026.

This handoff uses the validated current report at `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\verification\CONSOLIDATED-24H-2026-11-13.md`; the original-repository copy remains historical. It preserves earlier evidence and failures rather than rewriting them. It does not authorize a production deployment, production credential use, a database migration, payment activation, a Git mutation, or any paid AWS change.

**Latest review addendum:** [`docs/verification/REVIEW-FIXES-2026-11-14.md`](verification/REVIEW-FIXES-2026-11-14.md). Current local integration is **109 suites passed** with cap/partner replay, quoted/replay authority, terminal rejection, and old-snapshot coverage. Full persistence is also **exit 0** with 52 selected suites plus the legacy runner. Native QA rebuild/acceptance is complete: all-role smoke, five-tab admin navigation, cash reconciliation, and forced post-commit 409 same-request recovery pass on the physical phone. The earlier 106-suite result and 14/2/6 readiness tally are historical. The current readiness subset is **15 PASS / 2 PARTIAL / 5 FAIL**, with two documented zero-row schema exceptions preserved; it is not production approval.

## 0. Current state — read this first

### Newest verified delta

1. **[ran] Three native QA role APKs now build and pass independent artifact verification.** Customer, driver and admin APKs have valid ZIP CRCs, the expected role/package configuration, the isolated `http://127.0.0.1:4192` API URL, and no production CloudFront, retired Azure or accidental port-4191 endpoint. Their hashes and byte sizes are in §3.2.
2. **[ran] All-role physical-phone smoke passed.** Each role launched on the physical Samsung `SM-A5360` (adb `R5CTB0FJP9Z`), rendered its home surface and exposed the expected synthetic role identity. Evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\device\smoke-results.json`.
3. **[ran] The native cash handover path passed.** Admin recorded **300 cents**; the driver saw 300 cents pending, confirmed the entry, and the driver balance became **0 cents**. Entry 1 is `confirmed`. Evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\device\cash-results.json`.
4. **[ran] Ambiguous post-commit booking recovery passed on the phone.** A test proxy returned a synthetic client 409 **after the real sandbox commit**. Retry reused requestId `65a84efd-84dc-4d72-ac18-8d1ffef2d1d1`, returned the same order **5**, and the command receipt identified order 5. This is synthetic network-fault injection after a real commit, not a claimed server-generated race. Evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4193\device\ambiguous-results.json`.
5. **[ran] Final full remote persistence PASS, exit 0.** The run on `DESKTOP-S2JKMK5` / `D:\wind-verify-20261113\src2` / PostgreSQL `127.0.0.1:55494` finished at **2026-11-14T01:50:21.7398573Z** with **52 selected suites plus the legacy runner**. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-after-cash-fix-final-exit.json` and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-after-cash-fix-final.log`. The earlier full-run 200-versus-409 failure remains history. The deterministic fixture at `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\tests\presence.mjs:80-83` writes an already-expired lease (`Date.now()-120000`), proves the exact value persisted by readback, and still requires heartbeat **409 `presence_expired`**; it does not weaken or bypass that assertion.
6. **[ran] Final combined remote verification gates PASS, all exits 0.** At **2026-11-14T01:53:03.9944577Z**, typecheck, lint, audit, native-cash syntax, native-ambiguous syntax, integration and the overall launcher all recorded exit 0; integration passed **106 suites**. Final audit retained **14 moderate + 1 low**, with **0 high/critical** and `rejected:[]`. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\final-gates-after-cash-fix-exit.json` and the final logs in §5.1. Earlier resource-pressure/map and presence failures remain recorded history. These are remote source-verification results, **not production GO**: production, product, device-matrix, recovery, distribution and research gaps remain open.
7. **[ran] N+1 pending-command upgrade recovery PASS; manual-button variant remains [U].** A real versionCode 27 → 28 install preserved the pending command and `firstInstallTime`; reopening v28 used the read-only receipt to recover order **6** automatically with no second POST. The app did not offer manual Retry because automatic reconciliation completed first. See Appendix H1.
8. **[ran] Additional physical acceptance is mixed, not uniformly green.** C-04's denied-GPS/manual booking passed; D-05 passed its scoped legacy one-UI-plus-API competition case; A-06 passed stale cash/dispute conflict handling. C-01 still fails the cached stale/read-only summary requirement, D-04 is PARTIAL because presence and exact race windows remain unproven, and X-05 is PARTIAL. See Appendices H2–H3.
9. **[ran] App-level isolated restore reached readiness in 1.254967 seconds.** Integrity, foreign keys, schema and all 36 application-table counts passed; this is not full replacement-host RTO/RPO or a live-host baseline. See Appendix H4.
10. **[ran] All five original demos now pass static gates.** A fresh run passed 15/15 typecheck/lint/selfcheck commands; HAAT passed 12 checks, Shiply 17 and Souq 24. All five have README/selfcheck/Git. This is not device or production evidence. See Appendix H5.

### Release boundary

- Production remains **NO-GO**. There is still no authenticated production customer → driver → cash → admin → driver confirmation journey.
- The three role APKs are **debug QA artifacts against a loopback sandbox**, not production release candidates.
- The cash result closes the previously open admin-handover/driver-confirmation sandbox step. It does **not** close A11: SQLite still lacks an immutable per-order door-collected amount and typed variance reason.
- The booking recovery result closes the old pending-card device gate for this sandbox scenario. It does not prove production behavior or every interruption case.
- For the Wind production repository, no production credential use, production deployment, production migration, real payment activation, or paid AWS change occurred in the main verification evidence or by this continuation effort. The separate original-demo repositories have their own recorded local commits, identified in §11. This continuation effort included documented verification commands, isolated test/harness changes, source synchronization, and report updates; it did not modify production infrastructure or deploy the original app. Worktree creation was explicitly owner-authorized; no commit/push/reset/rebase was performed.

## 1. Evidence and source rules

### Labels

- **[read]** Source, artifact or prior evidence inspected in this continuation, with an absolute path where practical.
- **[ran]** A command/result recorded by the cited 13–14 November verification session, or a newer result supplied to this handoff and corroborated by a named result file. It was **not rerun by this writer**.
- **[U]** Unknown, unmeasured, unrun, stale for the present purpose, or blocked. It is not evidence of health or absence.

The consolidated report’s earlier placeholder preflight is retained at `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\report-preflight.json`. After the final evidence reconciliation, [ran] `node validate-consolidated.mjs` reports **zero placeholders, zero missing local links and zero secret-pattern matches** in `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\report-validation-final.json`. This handoff is the Fable 5.2 continuation point; it does not claim production readiness.

### Handoff precedence map

- **Current continuation:** this file.
- **Previous verified cutoff:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md`. Its version-24 retired-client state is superseded by preview 27; its unexecuted production, recovery and acceptance gates remain relevant.
- **Historical first cutoff:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md`. It explicitly mixes trees/times and must not override newer artifact or test evidence.
- **Original broad product brief:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md`.
- **Earlier production-upgrade contract:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Fable 5.2 production upgrade handoff.md`.
- **Execution reconciliation:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\HANDOFF.md`, `INDEPENDENT-REVIEW.md`, and `final-classification-report.md`; use their later corrections, not their superseded failures.
- **Claim-level history:** `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\verification-2026-11-13\CLAIMS-LEDGER.md`; **validated current report:** `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\verification\CONSOLIDATED-24H-2026-11-13.md`. The original-repository report remains historical.

### Source and execution identity

| Item | Verified value and boundary |
|---|---|
| Original repository | `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship` |
| This handoff | `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\HANDOFF-2026-11-14-FABLE-5.2-VERIFIED-CONTINUATION.md` |
| Canonical source reference | `origin/master` `b89f2205965523b5ab8545dff3940d1eacb6062c` |
| Dirty root line | `b60922952d607f698eee24b9c68ac3394daecd3c`; recorded as **6 ahead / 277 behind**, not a descendant of canonical master. The SHA alone does not identify the uncommitted tree. |
| Isolated verification source identity | **Current selected-file checkpoint, not full release provenance.** The current source has **109 integration / 52 persistence / 102 `.test.mjs` files** and `check:audit`; see `docs/verification/SOURCE-MANIFEST-2026-11-14.json` for 35 selected file hashes. The **historical** 05:32 manifest recorded 106/99, not the current run. Full relevant tracked/untracked inventory and hashes are required before candidate construction. Earlier evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\source-identity.json`, `remote-source-manifest.json`, and `remote-source-identity.json`. |
| Working-tree test selection | 109 integration entries = 100 selected `.test.mjs` + 9 other `.mjs`; **102 `.test.mjs` on disk** (100 selected + 2 PostgreSQL-only exemptions); 52 persistence entries plus legacy runner. |
| Canonical test selection | 131 integration entries = 122 `.test.mjs` + 9 other `.mjs`; 124 `.test.mjs` on disk; 56 persistence entries plus legacy runner. Do not mix these counts. |
| Preferred heavy-work host | `DESKTOP-S2JKMK5`, workspace `D:\wind-verify-20261113`, source copy `D:\wind-verify-20261113\src2`. Remote results are labelled remote; owner-PC runs are local fallback. |
| Physical device | Samsung `SM-A5360`, adb serial `R5CTB0FJP9Z`, Android 16. No emulator evidence is used. |
| Phone backend | Isolated loopback sandbox through `adb reverse`; main role sandbox port **4192**. Current forced-409 proxy is **4194** targeting 4192; the older 4193 evidence/proxy is retained separately and was not stopped. |
| PostgreSQL fixtures | Local-temp 55475 passed earlier; **final remote 55494 full persistence PASS (52 selected suites + legacy, exit 0)**. The earlier presence failure and older slow OneDrive 55474 failure remain historical evidence, not the latest result. |
| `k5` alias | Remains separately refused by the old configured key; do not relabel `DESKTOP-S2JKMK5` evidence as `k5` evidence. |

Post-manifest N+1 harness additions are the test-only `WIND_TEST_VERSION_CODE` handling in `app.config.js` and `scripts/check-native-upgrade.mjs`; their focused tests and real v27/v28 artifacts are in Appendix H1. After those additions, the preferred `DESKTOP-S2JKMK5` SSH attempt failed with `Permission denied (publickey,password,keyboard-interactive)`. A clearly labelled **local fallback** then ran frozen `npm ci` plus `npm run typecheck` and `npm run lint` on this worktree; all exited 0 at `2026-11-14T05:33:46Z`. Result and raw logs: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\current-source-static-gates\result.json`, `typecheck.log`, and `lint.log`. This supplements rather than replaces the earlier remote gate evidence.

[read] The current app stack is Expo `~57.0.31`, React Native `0.86.3`, React `19.2.3`, Expo Router `~57.0.29`, TypeScript `~6.0.3`, Node `v24.12.0`, MapLibre `^6.12.0` web and `react-native-maps` `1.27.2`. The server is a modular Node API with `node:sqlite` on the current pilot and `pg` for isolated/future PostgreSQL. There is **no Supabase** dependency or Supabase realtime path. Identity uses server-issued bearer sessions and a phone-provider abstraction; live updates use a signed-cursor event stream.

### Approval and safety boundary

- Keep all regional resources in `eu-north-1`; only the documented global CloudFront dependencies are exceptional. No Lambda@Edge, StackSets or cross-Region replication/routing workaround.
- Do not create paid monitoring, RDS, a domain, SMS capacity or any other paid resource without owner approval. The project plan and spend-limit state remain **[U]**; the owner checks **AWS Settings → Billing**.
- Preserve every existing backup, source modification, test database, phone profile and unrelated AWS workload. Do not “clean up” the two legacy SQLite tables or the dirty checkout.
- Money, auth, migrations, dispatch, deployment and data deletion require the established independent-review discipline. Provider/model failure never relaxes a gate.

## 2. Models and workstreams in the 24-hour window

| Workstream | Actors and material outcome |
|---|---|
| Original Fable 5.2 product brief | Claude Opus 5.5 wrote `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md`: a Palestine-first program covering AWS operations, slow maps, address capture, legal roads/ETA, driver tracking, stranger-facing basics, PostgreSQL and lawful map sources. Those goals remain inherited work, not proof of completion. |
| Verified execution / independent reviews | `kimi-pool/kimi-k3.1-pro` led the execution reconciliation in `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\HANDOFF.md` and `INDEPENDENT-REVIEW.md`. NVIDIA `nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b`, Claude Opus 5.5 and Claude Sonnet 5.5 supplied bounded reviews. They corrected test classifications, payment-settlement wording, AWS profile/tree identity and recovery/scaling boundaries. |
| Booking-design review | A separate Kimi review rejected a client wall-clock “commit window”: `sentAt` is first-save time and elapsed client time cannot prove server non-commit. The window was removed; stable requestId retry is the recovery mechanism. The new phone 409 test now exercises that design. |
| REA / dialect / backlog | Source and independent review established twelve PostgreSQL gates, the C-now/A-next/B-rejected dialect decision, pilot scope and A/B/D backlog. See `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\`. Source-read status is not runtime acceptance. |
| Consolidated app/AWS verification | Produced build/config fixes, signed preview 27, fresh PostgreSQL and restore evidence, AWS question-level assessment, role APKs and new phone cash/409 results. Evidence root: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\`. |
| Competitor research | An 11-study session finished at 18:02:48Z on 13 November and wrote `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Wind verified research atlas.md`. It preserves uneven depth and failed streams. The consolidated report then corrected additional Shiply/Souq/HAAT claims. |
| Original-demo session | Built original Expo demos under `C:\Users\osama\OneDrive\Documents\wind-competitors`. At `2026-11-14T05:32:24Z`–`05:32:52Z`, all five passed typecheck/lint/selfcheck: 15/15 local package gates. HAAT passed 12 earlier checks, Shiply 17 and Souq 24. That run predates the APKs and newer uncommitted Maps/API/persistence source; the five installed APKs are older demo artifacts, not proof of the newer implementation. These are original demos, not competitor source, production backends or production evidence. See `docs/verification/COMPETITOR-THREAD-INVENTORY-2026-11-14.md`. |
| Agent process boundary | As of the 13 November cutoff, no process named Fable 5.2 was found. The active Claude Code CLI was PID 18832, `claude-opus-5-5`, session `78352bbb-38c6-4674-a032-c9c325a5f39f`, and was left running. This is a historical process observation, not a current process inventory. |

[read] The detailed production-upgrade source set is preserved under `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\`: `repository_functionality_audit.md`, `security_reliability_quality.md`, `palestinian_market_requirements.md`, `mobile_experience_audit.md`, `maps_tracking_dispatch.md`, `backend_aws_architecture.md`, and `fable_claude_prompting.md`. The verified-execution set also preserves `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 verified execution handoff\reference-rea-audit.md` and `audit-b-infra-tests.md`. Their Supabase, package-ID, suite-count, artifact-availability and root/worktree claims are corrected by the newer evidence in this handoff; their vertical-slice acceptance requirements remain relevant.

## 3. App and native build evidence

### 3.1 Native C++ / Gradle failure and fix

[ran] The first full customer build hit native memory exhaustion in R8 with two 2 GiB JVM heaps and parallel work. The preserved evidence is `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\native-build-oom-evidence.txt`. A separate Node `VirtualAlloc failed` and a later map shutdown assertion showed that concurrent Gradle/test work was resource-sensitive; these must not be misreported as ordinary product failures.

[ran] Subsequent clean ARM64 builds reached C++ linkage failures: undefined C++ runtime symbols including `operator delete`, `operator new`, `std::__ndk1::basic_string` methods and `__cxa_*` routines. See:

- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\customer-build-clean-failure.log`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\customer-build-final-attempt1.log`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\customer-build-final-attempt2.log`

[read] The captured Worklets CMake cache has `ANDROID_STL=c++_shared` but `CMAKE_CXX_STANDARD_LIBRARIES=-latomic -lm`, leaving the C++ runtime absent from these scratch link targets: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\worklets-cmake-attempt1.txt`.

[read] The final QA builder in `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\scripts\build-phone-tests.ps1` now:

1. confines clean Expo prebuild to a marked, short scratch directory and short Gradle cache (`C:\wq-gradle`, `CMAKE_OBJECT_PATH_MAX=250`);
2. installs frozen dependencies in that scratch tree;
3. explicitly links `c++_shared` for Worklets, Reanimated and the React Native application/common targets **in scratch `node_modules`**;
4. appends a `WIND_QA_CPP_RUNTIME` rule to generated `settings.gradle`, applying `-DCMAKE_CXX_STANDARD_LIBRARIES=-lc++_shared -latomic -lm` to Android application and library modules;
5. builds one worker with `--no-parallel`, a 1536 MiB Gradle heap and 1024 MiB Kotlin heap;
6. regenerates each role bundle and verifies its embedded role configuration and loopback URL.

[ran] An intermediate attempt incorrectly produced `-lc++_shared;-latomic;-lm` as one library token and failed; it remains in `customer-build-final-attempt5.log` and is not the final result. The final role-build launcher exited **0** at `2026-11-13T21:50:56.7658988Z`: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\role-builds-final-success-exit.json`. Build tails record customer 7m54s, driver 5m7s and admin 5m4s in `check-before-persistence-final.json`.

**Boundary:** this is a local-QA harness fix, not an upstream React Native/Worklets patch, not a hand-edit of the repository's generated native projects, and not proof that a production EAS release has the same linkage behavior.

### 3.2 Three independently verified role APKs

[ran] `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\verify-role-apks.py` independently recomputed hashes, checked ZIP CRCs and bundle/config contents, and wrote `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\apks\artifact-verification.json`.

**14 November correction rerun, executed by this writer:** the verifier now also forbids the bare retired host `windapi236.swedencentral.cloudapp.azure.com`. It exited **0** for the original repository's `.expo\phone-qa-4192` customer/driver/admin artifacts and separately for `.expo\phone-qa-4193` customer. Both existing `apks\artifact-verification.json` outputs were preserved and refreshed with the same schema; APK hashes, byte sizes, roles, packages and loopback URLs were unchanged. The 4193 customer artifact remains 91,974,836 bytes, SHA-256 `3e6fd1666ea0edd9936c4b10ba15ea9c06664909528ee36d1519671227565897`, bundle 4,246,584 bytes, API `http://127.0.0.1:4193`.

These are **independent APK-artifact checks**, not a rerun of the build script in §3.1. The builder validates its generated role/configuration; this verifier separately checks the packaged role/configuration, expected loopback URL and absence of external endpoint strings (production CloudFront, `azurewebsites.net`, and the retired `windapi236.swedencentral.cloudapp.azure.com` host). It does not contact those external URLs or prove their reachability, health or production behavior.

| Role | Absolute APK path | Bytes | SHA-256 |
|---|---|---:|---|
| Customer | `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\apks\wind-customer.apk` | 91,974,848 | `8d504905cd04a44a5ceb51b81fd3c03e479b94aacbdb1c5d9bca376bbe39bac6` |
| Driver | `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\apks\wind-driver.apk` | 91,974,844 | `75bb012eb238ead85a0b3ace4b03f224540fb63bcb79126c99f445a4e47c4653` |
| Admin | `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\apks\wind-admin.apk` | 91,974,844 | `b931d7ee75b4f7994a5572768375ad13326e27c50c94a9952d72103377735838` |

Packages are respectively `ps.wind.app.testcustomer`, `ps.wind.app.testdriver`, and `ps.wind.app.testadmin`; each embedded bundle is 4,246,596 bytes. All three apksigner records show the Android debug signer certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`:

- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\wind-customer-apksigner.txt`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\wind-driver-apksigner.txt`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\wind-admin-apksigner.txt`

### 3.3 Production preview 27 repairs the retired endpoint in artifact

[ran] Preview build **27**, package `ps.wind.app`, versionName `1.0.13`, versionCode `27`, was signed, installed over version 24 and launched on the physical phone. Its decompressed Android bundle contains `https://dlvxzw3gj596d.cloudfront.net` once and retired `windapi236.swedencentral.cloudapp.azure.com` zero times.

| Field | Verified value |
|---|---|
| APK | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\wind-preview-27.apk` |
| Bytes | 107,387,898 |
| SHA-256 | `3b948ef52f0547fd5a526a2353b4709029dbf5b17354ae5005696ceeeb375f52` |
| Signer certificate SHA-256 | `5947bab05b2173ee99fc29a817e94070e71e15f93ae2c6681fcdce5e08403a2c` |
| EAS build | `0eca7e5f-ca11-4d14-be8f-e4e5f04dcb54` |
| ZIP integrity | `testzip=None` |
| Evidence | `wind-preview-27-bundle-scan.json`, `wind-preview-27-signing.txt`, and `eas-build-preview-reduced.log` in the same directory |

[read] `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\eas.json` now explicitly supplies the CloudFront URL for preview and production, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.github\workflows\ci.yml` uses `${{ vars.WIND_API_URL }}` rather than the retired Azure literal. `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.easignore` reduced EAS upload from 631 MB to 2.5 MB after the earlier metadata-upload failure. Historical build 25 failed from missing API configuration; those are distinct failures.

**Still [U]:** no authenticated production sign-in/phone-check or production journey was run. Installation and launch do not close that gate. A stable `EXPO_PUBLIC_UPDATE_URL`, compatible server `WIND_MIN_CLIENT_BUILD`, and a tested forced-update/old-build path also remain unproven.

### 3.4 Other harness/config changes to preserve

[read] The following changes are part of the verification tree and should not be accidentally discarded:

- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\app.config.js` validates `WIND_PHONE_TEST_PORT`; `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\phone-test.ts` accepts only unprivileged loopback test URLs.
- `scripts/phone-test-server.mjs`, `scripts/start-phone-tests.ps1`, `scripts/export-phone-web.mjs`, `scripts/check-phone-tests.mjs` and `scripts/build-phone-tests.ps1` isolate non-default sandboxes under `.expo/phone-qa-<port>`, preserve the provisioned API URL, locate adb, and propagate native exit codes instead of interpreting npm stderr as the result.
- `scripts/check-native-cash.mjs` and `scripts/check-native-ambiguous.mjs` implement the two new physical acceptance checks; the latter explicitly labels its injected 409 as synthetic.
- `vendor/decode-uri-component` was restored to the GHSA-fixed 0.5.1 CommonJS-compatible implementation. The remote static gate pins SHA-256 `e82696ecdf0ee2c25bd90169cc7915e552d2ccb82a5006c55bc17aecdb55b919` in `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\remote-static-gates.log`.

[read] `scripts/check-phone-tests.mjs` also has an optional **`WIND_AGENT_DEVICE` transport**: its value is the agent-device command/prefix used for open, snapshot, screenshot, press/fill and scroll operations instead of the corresponding direct adb UI calls. `WIND_PHONE_SERIAL` remains the physical adb serial, and smoke still establishes `adb reverse`; setting `WIND_AGENT_DEVICE` is not a device serial or emulator option. Its plain-text agent snapshot parser now preserves a trailing `[disabled]` flag as `enabled='false'` instead of marking every parsed node enabled. **Correction check executed by this writer:** `node --check scripts/check-phone-tests.mjs` exited **0**. This harness/parser correction is not a new physical-phone acceptance result.

Earlier harness mistakes are preserved: an invalid explicit `-Roles customer,driver,admin` PowerShell invocation, npm warning promotion to `NativeCommandError`, reused provisioning on 4191 while the build needed 4192, two artificial 120-second launcher timeouts, the JVM OOM, and a memory-bounded stop at `mergeDebugNativeLibs` followed by a successful direct retry. Do not turn these into generic “flaky app” claims.

## 4. Physical-phone evidence

### 4.1 All-role smoke — PASS

[ran] At `2026-11-13T21:58:16.917Z`, all three roles passed home/identity smoke on the physical phone. `smoke-results.json` has `passed:true` for customer, driver and admin. The records show the expected synthetic Arabic role surfaces and identities, not production users.

Evidence directory: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\device\`

- `customer-home.png/.txt`, `customer-identity.png/.txt`
- `driver-home.png/.txt`, `driver-identity.png/.txt`
- `admin-home.png/.txt`, `admin-identity.png/.txt`
- `smoke-results.json`

This proves build installation/launch and basic role rendering. It is not full journey, accessibility, background or production acceptance.

### 4.2 Admin-recorded 300 cents → driver-confirmed zero — PASS in sandbox

[ran] At `2026-11-13T22:02:50.948Z`, the cash check recorded:

```text
beforeCents=300
pendingAfterAdminCents=300
afterCents=0
entryId=1
entryStatus=confirmed
driverId=2
port=4192
```

Evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\device\cash-results.json` and the `cash-admin-before`, `cash-admin-form`, `cash-admin-recorded`, `cash-driver-before`, `cash-driver-confirmed` PNG/TXT pairs in that directory.

This closes the earlier cancelled-handover gap for the tested path. It does not prove expected-versus-door-collected reconciliation, variance handling, production settlement or admin correction flows.

### 4.3 Forced post-commit 409 → same requestId/order 5 retry with receipt — PASS in sandbox

[ran] At `2026-11-13T22:10:22.813Z`, proxy 4193 targeted real sandbox 4192 and recorded:

| Attempt | requestId | Upstream | Client | orderId | Injected 409 |
|---|---|---:|---:|---:|---|
| First POST `/api/orders` | `65a84efd-84dc-4d72-ac18-8d1ffef2d1d1` | 200 | 409 | 5 | yes |
| Retry with same requestId | same | 200 | 200 | 5 | no |

`receiptOrderId=5`. Evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4193\device\ambiguous-results.json` and `ambiguous-form`, `ambiguous-pending`, `ambiguous-recovered` PNG/TXT pairs.

The real server committed before the synthetic client refusal. Retry did not create a duplicate and recovered through the command receipt. It does not justify re-adding a time-based absence heuristic or enabling Edit/Discard for an unknown receipt.

### 4.4 Earlier physical measurements and journeys

- **[ran] W-00007:** pickup arrival → explicit far-pickup confirmation → in transit → delivered at 04:46 on customer and driver. The actual driver fix was about 48 km from Ramallah; the warning required explicit continuation. Customer code entry succeeded with the keyboard open.
- **[ran] W-00008:** the other agent's completed sandbox trip was independently observed delivered. These two sandbox trips are not production deliveries.
- **[ran] Earlier cash screen:** four sandbox orders totalled ₪80 with ₪12 commission/net; the handover was cancelled then. The new 300-cent result supersedes only that unfinished handover step.
- **[ran] Version-24 cold starts:** medians 771 ms Wi-Fi, 697 ms no network, 672 ms mobile-data link, five runs each. This is app startup, not mobile RTT or map readiness. Production PSS was 157,483 KB on that old artifact.
- **[ran] PC API samples:** all 100 requests returned 200. `/api/ready` p50 115.5 ms / p95 440.9 ms / p99 1122.1 ms; `/api/health` p95 144.1 ms. These are dated PC samples, not current phone/3G SLO evidence.
- **[U] Background/lock tracking:** permission was granted, but no valid unlocked follow-up measurement was obtained. A permission screenshot is not continuity evidence.
- **[U] Full phone matrix:** C-01…C-07, D-01…D-07, A-01…A-06 and X-01…X-05 are not complete. N+1 automatic pending-command recovery and C-04's required denied-GPS/manual booking are now proven; C-01 still fails cached summaries, D-04/X-05 are partial, and D-05/A-06 have scoped passes in Appendices H1–H3. Arabic/English maximum text, TalkBack, the remaining poor-network/process-death/reboot cases, and token rotation remain open.

Detailed earlier phone analysis: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`.

## 5. Test and persistence gate ledger

### 5.1 Static and integration results

| Gate | Latest defensible interpretation | Evidence |
|---|---|---|
| Remote `npm run typecheck` | **[ran] FINAL PASS, exit 0** | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\final-gates-after-cash-fix-exit.json` records `typecheck:0`; `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\typecheck-after-cash-fix-final.log` contains the client and server `tsc --noEmit` invocation with no errors. Earlier `remote-static-gates.log` remains historical corroboration. |
| Remote `npm run lint` | **[ran] FINAL PASS, exit 0** | `final-gates-after-cash-fix-exit.json` records `lint:0`; `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\lint-after-cash-fix-final.log` contains `expo lint` with no errors. Earlier three-module resolver failures belong to other historical runs. |
| Current-worktree `npm run typecheck` after N+1 | **[ran] LOCAL FALLBACK PASS, exit 0** at `2026-11-14T05:33:46Z`; preferred remote SSH was refused and is not claimed | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\current-source-static-gates\result.json` and `typecheck.log`; frozen `npm ci` also exited 0 |
| Current-worktree `npm run lint` after N+1 | **[ran] LOCAL FALLBACK PASS, exit 0** at the same checkpoint; preferred remote SSH was refused and is not claimed | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\current-source-static-gates\lint.log` and `result.json` |
| Remote `npm run check:audit` | **[ran] FINAL PASS, `audit:0`; raw 14 moderate + 1 low, 0 high/critical, `rejected:[]`** | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\audit-after-cash-fix-final.log` and `final-gates-after-cash-fix-exit.json`, same evidence directory. Raw total is 15; moderate/low advisories remain visible and are not claimed fixed. The earlier 13-moderate reading is historical, not the final count. |
| Earlier full `npm test` | **[ran] Historical PASS: 106 integration suites** | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\npm-test-post-build.log` ends `Integration gate: 106 suites passed`. |
| Later full `npm test` under concurrent load | **[ran] Historical FAIL**, only recorded assertion was `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\tests\map.test.mjs:437`: `shutdown answers held live requests instead of waiting out the hold` | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\npm-test-current-final.log`. JVM crash and Node allocation evidence established resource pressure. Retain this failure; the final remote result is the separate row below. |
| Final remote `npm test` | **[ran] FINAL PASS, `integration:0`; 106 suites passed** | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\integration-after-cash-fix-final.log` ends `Integration gate: 106 suites passed`; `final-gates-after-cash-fix-exit.json` records `integration:0`. |
| Final native-check syntax | **[ran] FINAL PASS, `cashSyntax:0` and `ambiguousSyntax:0`** | `final-gates-after-cash-fix-exit.json`; `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\native-cash-syntax-after-cash-fix-final.log` and `native-ambiguous-syntax-after-cash-fix-final.log` are both preserved zero-byte logs because successful syntax checks emitted no output. Their exit evidence is the JSON, not an inference from empty logs alone. |
| Final combined remote gates | **[ran] FINAL PASS, overall `exitCode:0` and every component 0** at **2026-11-14T01:53:03.9944577Z** | `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\final-gates-after-cash-fix-exit.json`: `typecheck=0`, `lint=0`, `audit=0`, `cashSyntax=0`, `ambiguousSyntax=0`, `integration=0`, `exitCode=0`. This closes the identified remote verification run only; it is not production authorization. |

### 5.2 PostgreSQL results

| Fixture/run | Result and evidence |
|---|---|
| OneDrive-hosted 55474 | **[ran] Full persistence failed** during `PhoneIdentity.reconcileStale` / `phoneSchemaAvailable`; checkpoints took 476–673 seconds. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-final-verification.log` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\implementation\postgresql-verify-20261113.log`. |
| Local-temp 55475 | **[ran] Full `npm run test:persistence` exited 0**: 52 selected suites plus legacy PostgreSQL suite, PostgreSQL 18.3 / PostGIS 3.6, loopback only. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55475-final.log`, started 20:54:48 and finished 21:02:21 EET. |
| Remote fresh 55494, isolated presence | **[ran] Historical targeted PASS:** `node tests/presence.mjs` passed before the final full run. Existing launcher: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\run-presence-55494.ps1`. Retain it as targeted evidence, not as a substitute for the complete run below. |
| Remote fresh 55494, earlier full persistence | **[ran] Historical FAIL, exit 1** at `2026-11-13T22:15:02.6340680Z`. The then-current `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\tests\presence.mjs:81` expected 409 for `/driver/presence/heartbeat` but got 200 with `deduplicated:false`. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-final-result.txt`. Do not cite old line 81 as the current source or erase this failure because the final run passed. |
| Current deterministic presence fixture | **[read] `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\tests\presence.mjs:80-83`** sets `expiredAt=Date.now()-120000`, so the lease is already expired rather than depending on a sleep or expiry occurring between setup and heartbeat; line 81 persists it, line 82 reads `lease_until` back and asserts the exact persisted value, and line 83 still requires heartbeat **409 `presence_expired`**. This makes the setup deterministic and verifies database persistence; it does **not** weaken, skip or filter the 409 assertion. |
| Remote fresh 55494, final full persistence | **[ran] FINAL PASS, exit 0** at **2026-11-14T01:50:21.7398573Z**: **52 selected suites plus the legacy runner**, on `DESKTOP-S2JKMK5` / `D:\wind-verify-20261113\src2` / PostgreSQL `127.0.0.1:55494`. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-after-cash-fix-final-exit.json` (`exitCode:0`, exact finish timestamp) and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-after-cash-fix-final.log` (selected PostgreSQL suites plus the legacy PostgreSQL checks through `change-destination`). |

After the guard fix, one full run failed during API startup with `Connection terminated due to connection timeout`; a later run failed pagination cap creation at 3 of 5. The isolated pagination suite then passed with refusal diagnostics preserved, and the quiet full sequence passed at the final timestamp above. These failures remain in `persistence-55494-after-cash-fix-failed.log` and `pg-jobs-pagination-diagnostic.log` under `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\`.

The old “no PostgreSQL fixture” claim is obsolete, and the identified final remote 55494 complete gate is now green. Earlier OneDrive/local/full-run results and the presence failure remain fixture- and time-specific history. This final pass does not change the accepted production SQLite pilot boundary, prove future repeatability without reruns, or close production recovery/deployment gates.

## 6. Backup, restore and production recovery

### 6.1 Existing S3 evidence

[ran] Two objects were listed in `s3://wind-backups-083712835043/`:

- `wind-20261112T165723Z.db.gz`, 10,148 bytes;
- `wind-20261113T031001Z.db.gz`, 10,148 bytes, modified `2026-11-13T03:10:04Z`.

[ran] A fresh 14 November S3 listing found the same two objects and no newer backup. Both were re-downloaded: hashes match the earlier evidence, integrity is `ok`, foreign keys are clean, `user_version=3`, and every application-table row count matches.

The newest HeadObject returned `VersionId=awKIxkUsGZL1h5p9nXiEUOVMEPGzdK6z` and `ServerSideEncryption=AES256`. Evidence:

- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\backups.txt`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\backup-head.txt`

[read] Canonical `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\vm\wind-backup.sh` uses SQLite `VACUUM INTO`, verifies integrity before upload, gzips, restricts local permissions, uploads through the host role, and only then updates `last-ok`. The host role can put backups but not read/list/delete them. Bucket versioning, public-access blocking, ACL disablement and TLS-only policy are source declarations; live bucket-setting reads were denied.

### 6.2 Local restore results

| Artifact/check | Verified value |
|---|---|
| Newest gzip | SHA-256 `45608b757e2d2e126b2060329791d26889ab0ddca0e3e141a542091ccf8a2a7a` |
| Prior gzip | SHA-256 `19757e7df0461b1bf200dae6bcdee54d3bae7965e1f87e5e05221b1103a6a1ff` |
| Decompressed DB, either copy | 364,544 bytes; byte-identical; SHA-256 `0ea4d4bdf08f4df9ea5c443a99933989163cdcddfe9eae822d9dcd59de2c1789` |
| Integrity / foreign keys / schema | `integrity_check=ok`; no FK violations; `user_version=3` |
| Tables | 36 application tables + internal `sqlite_sequence` = 37 total |
| Rows | 9 users, 2 cancelled orders, 0 sessions, 0 completed deliveries, 0 cash entries, 0 push subscriptions; zero count differences between backups |
| API boot against restored copy | Fresh 14 November boot on remote loopback 43178: HTTP 200 `{"ok":true,"schema":3}`. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\restore\restore-api-result.json` |

Evidence files:

- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\restore-inspection.json`
- Fresh re-download and independent checks: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\restore\restore-inspection.json` and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\restore\restore-api-result.json`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\restore-integrity.json`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\restore-api-result.json`
- Audit narrative: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\verification\production-safety-audit-2026-11-15.md` (its body correctly dates the work 13 November).

`firebase_resets` and `native_push_tokens` are zero-row legacy tables. `native_push_tokens` is PostgreSQL-only and inactive on SQLite; no `server/` reference to `firebase_resets` exists. **Decision: preserve both.** Do not invent SQLite DDL or delete history during verification. `opencode_jobs` is optional, and `*_upgrade` names are migration temporaries.

### 6.3 What is still not proven

- **[U] Exact live-host environment, running image/revision and table counts.** SSM/EC2 access was denied; a SQLite backup and public `schema=3` are strong evidence but not a live environment dump.
- **[U] A timed fresh replacement-host restore**, including Caddy, cron, OSRM graph rebuild, non-secret configuration, operator, source-backup timestamp, elapsed RTO, observed RPO, row/money/custody reconciliation, session-reset behavior and post-restore block/deletion reconciliation.
- **[U] A missed-backup alert reaching a named human.** The restored snapshot has zero push subscriptions; the in-app stale-backup push therefore has no demonstrated delivery path.
- **[U] Backup retention/privacy policy.** Indefinite S3 retention can preserve deleted-account data. Do not delete backups opportunistically.

A 6 November synthetic restore took 12 seconds and the 12 November migration runbook records an end-to-end move; those are historical and do not replace a current timed replacement recovery.

## 7. AWS assessment and deployment reality

### 7.1 Current source-backed architecture

```text
Android / web / tracking recipient
              │ HTTPS
              ▼
        CloudFront (API caching disabled)
              │ HTTPS + X-Wind-Edge
              ▼
          Caddy on EC2
              │ Docker network windnet
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

[read] Canonical `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\aws\wind.yaml` declares one `t3.small`, Ubuntu 24.04 amd64, 30 GiB gp3 encrypted EBS, IMDSv2, no SSH ingress, CloudFront origin-facing prefix list on 443, immutable ECR tags/scan-on-push and constrained GitHub OIDC. `HttpPutResponseHopLimit=1` deliberately prevents containers from retrieving the host role; it is not automatically a defect.

[read] Canonical `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\vm\deploy.sh` pulls by digest and checks OCI revision, takes a backup and rolls back on start/readiness failure, but explicitly has no deployment lock. The watchdog restarts failed containers after three checks; it does not notify a person. Code rollback is not a PostgreSQL/database rollback. Canonical backup code is `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\vm\wind-backup.sh` at Git object `b89f2205965523b5ab8545dff3940d1eacb6062c`; that file is absent from both working trees, so cite the canonical object rather than claiming a working-tree read.

### 7.2 Identity and live-read evidence

| Item | Result and boundary |
|---|---|
| AWS project/account | `083712835043`, Region `eu-north-1`. |
| Available credential | Limited long-lived IAM user `BedrockAPIKey-vaer`; owner `login_session` profiles were expired. No secret is recorded here. |
| ECR candidate | `wind-api:20261112-aws1`, ACTIVE, digest `sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc`. |
| Source workflow | Run `43263201635`, success, SHA `4f647e77ddc4b4f2ed0ecbd047dc1037953d888d`. |
| Running host image | **[U]** ECR association does not prove the running digest/revision. EC2/SSM/CloudTrail reads were denied. |
| Public health/readiness | [ran] Node fetch at `2026-11-14T01:01:53Z`: `/api/health` HTTP 200 `{"ok":true}` and `/api/ready` HTTP 200 `{"ok":true,"schema":3}`. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\public-endpoints.json`. This is a point-in-time check, not an SLO. |
| CloudWatch | Fresh full-inventory read: **6 metric alarms / 0 composite**; 4 `OK` and 2 `ALARM` (API/web CPU target-tracking `AlarmLow`). Both `AlarmHigh` and both `RollbackAlarm` are `OK`. Synthetics canaries remain `[]`; six log groups were returned. This supersedes the older narrower Wind-prefixed `[]` reading, not the fact that no Wind-prefixed alarm/log group was found. |
| GitHub Uptime | [ran] `gh run view 43528709624`: scheduled **success**, created `2026-11-13T23:39:19Z`, updated `23:39:26Z`, SHA `b89f2205965523b5ab8545dff3940d1eacb6062c`; all four steps succeeded. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\github-run-43528709624.stdout.json`. Hourly green does not prove human notification or missed-backup alerting. |
| Denied reads | ECR scan findings, EC2, SSM, CloudFormation, CloudFront, RDS, SNS, account plan/cost and bucket-setting reads. AccessDenied is **[U]**, not an empty/clean inventory. |

Raw commands/results: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\commands.json` and named logs in that directory. Public/GitHub evidence is under `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\public-final\` and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\github-final\`. Fresh 14 November AWS/public/GitHub evidence, exact exits and stderr are under `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\`, including `aws-readonly-summary.json`, `public-endpoints.json`, and `github-run-43528709624.stdout.json`.

### 7.3 Well-Architected scope and findings

[ran] The live official framework inventory contained **57 questions / 307 best practices / 6 pillars**. All 57 questions were assessed at **question level**: **5 PASS, 44 PARTIAL, 5 FAIL, 3 [U]**. This was not an individual assessment of all 307 best practices.

- PASS: OPS01 priorities, SEC08 data at rest, SEC09 data in transit, COST05 service-cost evaluation, COST11 effort-cost evaluation.
- FAIL: OPS07 support readiness, OPS10 operations-event management, REL06 resource monitoring, REL10 fault isolation, SEC10 incident anticipation/response/recovery.
- **[U]:** REL01 quotas/constraints, COST03 cost/usage monitoring, SUS06 organizational sustainability process.

Corpus and assessment: `C:\Users\osama\AppData\Local\Temp\opencode\wa-wind-20261113-0d9659c6f7a5\` (`manifest.json`, `questions.jsonl`, `best-practices.jsonl`, `question-assessment.json`, `question-assessment.md`, `assessment-hashes.json`). Full question table: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\verification\CONSOLIDATED-24H-2026-11-13.md` §6.

### 7.4 Accepted AWS direction and trade-offs

1. **Keep EC2 + SQLite for the deliberately narrow pilot.** Do not move to ECS/Fargate, put SQLite WAL on EFS/shared storage, or add an ASG merely to look cloud-native. Those do not fix the missing product/recovery controls or make one SQLite writer highly available.
2. **Option A is a separately rehearsed community PostgreSQL cutover, not a current deployment.** RDS for PostgreSQL in `eu-north-1` is the first candidate because the code uses community triggers, advisory locks, procedures, transactions and PostGIS. Aurora PostgreSQL is an alternative only with measured need; Aurora DSQL does not fit those requirements; DynamoDB does not fit the relational ledger/invariants.
3. Official RDS documentation lists PostgreSQL 18.3 → PostGIS 3.6.1 and 18.6 → PostGIS 3.6.3. Exact engine availability/quota in this project is **[U]** because RDS reads were denied.
4. Historical price evidence put `db.t3.small` + 20 GB GP3 at about **USD 29.4/month** before backups/egress. This is dated, not a fresh quote or budget approval. Actual plan, spend, CE and utilization are **[U]**.
5. **Human alerting is the smallest operational priority.** After owner approval, use a confirmed destination, backup-age/failure metrics with missing-data-as-failure, EC2/readiness alarms, and an induced missed-backup test acknowledged by a person. A lower-cost alternative is extending the existing external uptime workflow with narrowly scoped read-only backup-freshness checks; neither option was implemented.
6. **Keep the current CloudFront distribution.** Its AWS-owned hostname is baked into installed apps and previously shared tracking links. An owned domain and staged migration require approval; deleting/changing it early strands both.
7. **Do not replace current SMS/email/map providers from weak evidence.** AWS End User Messaging lists Palestine (+970) for international one-way SMS with Sender ID support, not two-way; international origination can be best effort/downstream-replaced. That is not delivery proof. The old 19-place provider sample is insufficient for an Amazon Location switch.
8. Retention, logging, S3 data-event/access auditing and EBS snapshots need explicit owner cost/privacy decisions. No paid change is authorized by this assessment.

## 8. Dialect, pilot scope and readiness gates

### 8.1 Accepted decision: C now, A next, B ruled out

[read] `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-DIALECT-ADR.md` is **Accepted**:

- **Option C now:** intentionally scope the pilot to the existing SQLite surface.
- **Option A next:** PostgreSQL only after separate migration, restore, rollback and acceptance rehearsals.
- **Option B ruled out:** do not implement a permanent second version of the twelve gated modules in SQLite.

`server/db/runtime.ts` selects SQLite with no URL, allows non-loopback PostgreSQL only in the fixed `wp16_staging` path with `sslmode=verify-full`, and rejects other production use. It never silently fails over between databases.

The twelve PostgreSQL-gated areas are durable commands, dispatch, eligibility, events/outbox, double-entry ledger, native push, ops/support, payments, private objects, table-backed quotes, resource scope/custody and ride lifecycle. Eighteen of twenty gate-probed tables are PostgreSQL-only; `quotes` and `road_restrictions` exist in both but quotes remain gated.

### 8.2 Pilot inclusion/exclusion

Included: idempotent booking plus bounded legacy recovery, customer proof/five-strike lockout/audited reset, destination-change consent, presence/stale indicators, append-only legacy cash handovers/adjustments and driver confirmation/dispute, and ordinary job acceptance/active-job guards.

Excluded for the current pilot: double-entry/cash receipts and immutable door variance, generic durable events/outbox/commands, measured eligibility/capacity/dispatch rounds/custody/ride history, native push/support/private objects/payment intents/table-backed quotes, shift-first board/scanning, zone-priced capacity windows and a complete offline bundle.

**The twelve gates must fail closed and be visibly disabled in the UI.** Surprise `409 *_unavailable` states are not an acceptable operator experience.

### 8.3 Readiness after the newest evidence

Do not reuse the old numeric readiness score: it predates the role/cash/409 results and the final remote persistence/combined-gate passes. The earlier map/presence failures remain history in §5; green remote verification does not produce a new production readiness score or GO.

| Area | Current defensible state |
|---|---|
| Nightly backup | PASS for the two observed objects and local integrity. Fresh 14 November S3 inventory found the same two objects and no newer backup. |
| Restore | PARTIAL: local restore + API boot passed; live baseline and timed replacement recovery remain. |
| Missed-backup human alert | FAIL / unproven. |
| Schema | Preserve two documented legacy zero-row tables; do not treat speculative deletion as a readiness fix. |
| Client booking command retention | PASS in targeted tests. |
| Real PostgreSQL booking race | PASS on the current local fixture: at the searching cap, committed concurrent retry returned HTTP 200 with the original order and receipt; a session revoked during the lock wait received 401. |
| Ambiguous command device recovery | **New PASS for the recorded sandbox 409 scenario** with same requestId/order 5/receipt. Other interruption cases remain. |
| Cash immutability | Source/integration evidence supports append-only legacy entries. |
| Payments visibly off | FAIL: no real provider and disabled-state UI is not fully proven. Do not activate payments. |
| A11 door collected/variance | FAIL: still absent on SQLite. The 300-cent remittance test is a different money transition. |
| Role/object access | **[ran] Final remote integration PASS (106 suites)** includes the driver-scope, booking-authority and SQLite scope/gate checks. Production authenticated role/object journeys remain unproven. |
| QA APK install/launch | PASS for all three role debug APKs and smoke. Production authenticated journey remains unproven. |
| Upgrade preserving pending command | **PASS for automatic recovery:** v27→v28 preserved `firstInstallTime`, requestId and order 6; read-only receipt recovered it with no second POST. Manual Retry-button variant remains **[U]**. See Appendix H1. |
| Typecheck/lint/audit | **[ran] FINAL remote PASS:** typecheck/lint/audit all exit 0 at the final combined run; audit retains 14 moderate + 1 low, zero high/critical. |
| Full integration/persistence | **[ran] CURRENT LOCAL FALLBACK PASS:** 109 integration suites plus full 55475 persistence (52 selected suites + legacy), all required exits 0. Earlier remote 106-suite results and map/presence/partner/phone-identity failures remain history; production NO-GO and non-verification gates are unchanged. |
| PostgreSQL fixture availability | PASS: fixtures exist and the identified final remote 55494 complete persistence run passed. Future source changes still require fresh full runs. |
| Dialect and operator scope | PASS as written decisions. |
| Deferred capability UI | FAIL / incomplete visible-disabled coverage. |
| Arabic/RTL review | PARTIAL: screenshots exist; no fresh human full-screen review. |

Authoritative definitions: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-PILOT-READY.md` and `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-PILOT-SCOPE.md`.

## 9. Product backlog that remains

Source baseline: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-GAP-BACKLOG.md` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-gap-backlog-source-audit.md`. `DONE` below means source mechanism only unless a runtime result is named.

| ID | Current state and required next acceptance |
|---|---|
| B1 dialect | DECIDED C/A/B as above. Do not schedule PG-only modules into the SQLite pilot. |
| B2 live dialect | OPEN: capture live non-secret env keys, schema, image/revision and counts with owner read access. |
| B3 restore | PARTIAL: local restore passed; timed replacement remains. |
| B4 schema history | DECIDED preserve legacy tables; optional owner cleanup later. |
| A1 zone addressing | PARTIAL: need structured zone + address line + landmark + label/default and server fee derivation. |
| A2 double-entry | PARTIAL / PG-only: SQLite trigger immutability is not a double-entry journal. |
| A3 delivery proof | Source DONE: wrong/right code, five misses and audited reset still need actual-backend acceptance. |
| A4 typed delivery failures | PARTIAL in the earlier source handoff: safety incident kinds exist, but `order_disputes.reason` is free text and no complete delivery-failure enum was established. |
| A5 shift + board | ABSENT: no shift lifecycle, shift-scoped ready queue or per-parcel scan. Souq is the stronger custody reference; HAAT only proves shift/offer/earnings surfaces. |
| A6 custody | PG-ONLY: append-only per-parcel custody is unavailable on SQLite. |
| A7 durable writes | PARTIAL: generic protocol is opt-in, PG-only and route-allowlisted. SQLite has narrow booking/driver recovery, not universal offline writes. The new order-5 result does not change that scope. |
| A8 zone fees/windows | PARTIAL / PG capacity only: need per-zone fees and capped delivery windows. |
| A9 destination consent | Source DONE: prove counterparty acceptance and notifications. |
| A10 stale tracking | Source DONE: prove a 61-second-old fix is visibly stale to the counterparty. |
| A11 collected variance | PARTIAL; door-collected amount is absent on SQLite. Need immutable amount + typed reason. New remittance result does not close this. |
| A12 parcel service level | ABSENT: priority is a parcel attribute, not a second order type. |
| A13 notification channels | ABSENT: prove per-event versioned channel recreation. |
| A14 alarm re-arm | PARTIAL: need boot, unlock, time, timezone and package-replaced handlers. |
| A15 offline bundle | PARTIAL: need zones/fees/windows/saved addresses, not only a three-order summary. |
| D1 booking retention | DONE in targeted source/PostgreSQL tests and the new sandbox device scenario; full matrix remains. |
| D2 typecheck | **[ran] FINAL PASS, exit 0** in `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\final-gates-after-cash-fix-exit.json`; client and server invocation preserved in `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\typecheck-after-cash-fix-final.log`. |
| D3 fixture | **[ran] FINAL PASS:** remote fresh 55494 complete persistence exited 0 at `2026-11-14T01:50:21.7398573Z`, 52 selected suites plus legacy; see `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-after-cash-fix-final-exit.json` and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-after-cash-fix-final.log`. |

Accepted exclusions remain card/wallet activation, marketplace/community, B2B catalogue, a Capacitor rewrite, credentials in app config, `allowBackup` for addresses, ad-storage analytics defaults, permission sprawl, always-on background location and universal offline-write claims.

### 9.1 Competitor-index exclusions and deferred evidence gates

Two exclusions must remain explicit rather than being lost in that summary: **S10** excludes chat-with-canned-replies and community chat as a launch feature (order-anchored support may be considered separately); **S13** excludes Web Push instead of FCM on native Android. S13 does not activate push in the current pilot: native push remains PostgreSQL-gated and must stay visibly disabled until its own gates pass.

The competitor index's **D1–D14 are deferred product items, not the D1–D3 verification rows above** and not additions to the A1–A15 implementation backlog. Every gate below must be satisfied and its result recorded before implementation:

| ID | Deferred item and preserved evidence gate |
|---|---|
| D1 | Driver-to-driver custody transfer: first-launch-city driver density must make a nearby peer usually available, and a written custody-dispute policy must exist. |
| D2 | Separate driver app/dispatcher console: name the exact driver decisions the customer app cannot make before splitting surfaces. |
| D3 | Voice messages: prove target-handset mic usability, fit storage/transfer within the 3G budget, and adopt a storage policy. |
| D4 | Home/lock-screen widget: prove notification delivery on target handsets first so a widget cannot merely show stale data. |
| D5 | Calendar integration for pickup windows: establish the user problem and acceptance of calendar access. |
| D6 | Per-OEM autostart/battery-optimization education: Wind's own telemetry must show a material share of deliveries missed because the OS killed the app. |
| D7 | Google Drive/consumer-cloud address-book sync: Google Play Services must be usable and Wind's account model must tolerate Drive-linked identity; otherwise use a first-party endpoint. |
| D8 | Weight-based final total/packing station: only relevant if Wind actually adds grocery/bulk goods; it is not a parcel-pilot feature. |
| D9 | Ratings/two-way reviews: require enough completed deliveries for meaningful ratings and a moderation path. |
| D10 | Customer-held delivery code as the **only** proof: measure code-exchange failures and fallback need. This does not remove the included code + lockout + audited-reset proof path. |
| D11 | WhatsApp ordering/notifications: confirm demand and make any entry point create a Wind order rather than a parallel order/cash state. The later correction limits the no-flow-found observation to the scanned Shiply/Souq artifacts; it is not proof about every competitor. |
| D12 | Shared third-party courier/JAYEEK-style abstraction: require at least two contracted carriers with modelled settlement, SLA and liability terms, plus compensation before any irreversible activation. |
| D13 | Support tickets with attachments/threaded comments: ticket volume must justify the system; lighter order-anchored support comes first, without reopening the S10 launch/community surface. |
| D14 | Remote feature flags for order types/promos: require a real release-train problem. The artifact evidence is an Athkar analogue; Shiply remote control remains unverified. |

Gate definitions: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\PALESTINIAN-COMPETITORS-INDEX.md` §§3–4. Their implementation boundary is repeated in `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-IMPLEMENTATION-HANDOFF.md` §2 and `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-GAP-BACKLOG.md` §5. Read those sources with the later corrections in §10 below and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md` §§21–24, especially the static-artifact/server-behaviour boundary, D11's narrowed absence claim and D14's Athkar-not-Shiply attribution.

## 10. Competitor research — corrected mechanisms and limits

All competitor observations are static client-artifact evidence unless explicitly described otherwise. They do not prove competitor server algorithms, enforcement, queue order, custody transitions, settlement, uptime, legal terms or production economics. No proprietary code or assets are to be copied.

### 10.1 Souq Tulkarm — strongest cash/custody reference

[read] `ps.souqtulkarm.app` 1.0.2/code 3 is a Vite/React SPA in Capacitor 7. Base APK: 4,153,798 bytes, SHA-256 `27dd269784d7ff81a87146455d4fd8011d57b556f8a23f7a896a62fc0aa88478`. Evidence:

- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\souq-tulkarm-feature-implementation.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\souq-tulkarm.md`

Useful patterns:

- Address: `zoneId + addressLine + landmark + label + isDefault`; zone fee/min-order and cutoff/capacity shapes. Server enforcement is **[U]**.
- Door cash: `{orderId, proofInput, amountCollectedCents, discrepancyReason}`; a nonzero delta needs one of six typed cash-variance reasons. Delivery-failure reasons are separate.
- Exactly ten customer order statuses, eight custody actions, and separate shift/cash/scan axes. “29+ statuses” was a token-census error.
- Ready queue reacts to active status and order/custody/fleet events; the shift itself polls every ten seconds. Offered transfer does not move responsibility until recipient scan; return needs shop confirmation.
- `souq.outbox` is opt-in, actor-scoped `[session.id, storeId, role]`, idempotency-keyed and sequential for a driver custody/delivery/cash subset. It does not queue admin settlement, addresses, cancellation or every mutation, and no service-worker background replay was proven.
- Outbox payloads are JSON in localStorage without encryption in that helper; do not copy sensitive proof/cash payloads blindly.

### 10.2 Shiply — HBC-aware corrections

Artifact: `com.shiplypalestinemobileapp` 1.8530/code 310; base 87,463,616 bytes, SHA-256 `000335d479a369530706d1fd67e8805e0fcdf665a71012a0b22f4a1b7ff8e7fe`; HBC bundle SHA-256 `eefcb81f91237961a2f1e560e3c07320e882e4098564069e8905e9416d608e62`.

Evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\shiply-feature-implementation.md`.

- Hermes **HBC 98**, with English **and Arabic** product copy, supersedes older plain-Metro/no-Arabic readings.
- `AttemptToDeliver` and `AttemptToDeliver2` support at least a second-attempt presentation, not a maximum or automatic three-attempt lifecycle.
- `delivered_1/2`, `returned_1/2/3`, `pending_1/2` are notification channel IDs, not attempt substates.
- “Error sending. Event queued.” belongs to **Sentry transport**, not a parcel outbox. React Query retries/local drafts do not prove offline parcel writes.
- Address payload uses `city_id`, `village_id`, `street_name`, `latitude`, `longitude`; landmark is not established. Store billing `default_address` is different.
- Wallet/difference vocabulary does not prove Souq-style door-collected amount or immutable close invariants.

### 10.3 HAAT Client, Driver and Courier

- Client supports area/landmark/driver-instruction addressing and granular Arabic states. Its code establishes an area gate for a search path and note error, not a universal final-save/server rule.
- Driver/Courier artifacts prove shift registration/lock states, timed accept/reject vocabulary, collection/delivery screens and balance/earnings history. They do **not** prove per-parcel scanning, expected/collected variance, shift cash close, settlement timing, offline replay or immutable server ledgers.
- MQTT uses server-issued parameters, QoS 0, clean sessions, Paho automatic reconnect disabled, custom exponential retry capped at 120 seconds and polling fallback. QoS 0 is not guaranteed delivery.
- The causal NXDOMAIN claim is retracted: local `envs-list.haatcloud.com` NXDOMAIN does not prove why splash showed “no internet”; the generic message belongs to a Remote Config timeout path.
- No IPA, runtime server contract or production checkout behavior was verified.

Official Play artifact identities, independently rehashed:

| Field | HAAT Driver | HAAT Courier |
|---|---|---|
| Package/version | `com.haat.haatdriver` 9.72 (132) | `com.haat.courier` 1.1.1 (8) |
| Base bytes | 26,313,879 | 24,449,839 |
| Base SHA-256 | `594b0425cb9f8829a2349b1a19a1ca68d70cd36376bb06e4900a2e98b738319c` | `883d54b7426eb020343a341a871a1fe5d3cd1592f4aee9d5b3e8dc420e43f1e4` |
| arm64 split SHA-256 | `9d6926c476bdd03cc24c26c85bf7077206068fe31120a049f7f056cf1feb3fa3` | `a53a06055fa750586b20103563772e89a7b9f30620224f047638b4ddd671268a` |
| xxhdpi split SHA-256 | `a35ac032f8dec26e234cc1b05d6366e30dc7a0c67177c41cace09a5afee0a3a5` | `fb6542d6fa62cd2b648a87fe1a800501baa11b90135083ae32ec7d1a6564970b` |
| Signer SHA-256 | `2db77fa77dce0fa02891e2fe7e30affc649a9e2b104cd66e5fa651e1a2febf18` | `a08d6f34623bd1300248d55e51377c7a23073db8828197cf400daf1ee910b279` |
| Play source-stamp signer | `3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d` | same |

Evidence roots: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-haat-artifacts-20261113\com.haat.haatdriver-play\` and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-haat-artifacts-20261113\com.haat.courier-play\`; independent recomputation: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-haat-artifacts-20261113\independent-hash-verification.json`.

HAAT Client separately: `com.haat.client` 21.0.4/code 312, SHA-256 `52279A92F31FEBAFAC3EAAA7B64348A762E5BB41879E8B1EA318B7DEBD150366`.

### 10.4 Careem Rider and Captain

- Rider `com.careem.acma` 26.43/264301: base 85,446,587 bytes, SHA-256 `B19112D53D3E9A800EF35908FA48AF57816D9F8F81B7A3897A7220F527127F58`.
- Captain `com.careem.adma` 89.70.2/89702: base 164,971,864 bytes, SHA-256 `F5618AFD9E173B8B9A7C4D1D42EE5A6C2E0DEDAF71BA95064DD3FBD9B181C538`.
- Evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\careem-rider-captain.md`.

Rider supports map pin, nickname, notes, building/street validation and photo components; this is not a reason to impose apartment/building numbers in the West Bank. Cash warnings and arrears/balance blocks are not Careem Pay wallet semantics. Captain has 14 `breakdown_*` earnings keys including base fares, tips, bonuses, guarantees, fines, behavior penalties, reversals and money in/out. Supplier-fee/“100%” copy does not prove a zero take rate or payout terms. Limits, formulas and settlement remain **[U]**.

### 10.5 Uber Rider

- Useful patterns: map-first home, saved places, payment-first checkout, offer expiry, provider configuration and testable camera shapes.
- POI evidence includes `GetMapPoisForAnchorRequest/Response`, `PoiGroup`, `PoiGroupSuccess`, `SuggestedPlace` beside `SavedPlace`, and `POICache`. The supplemental POI work is DEX-string-table evidence only; enum values, bodies and a new RPC route were not recovered.
- Do not copy the GL engine, dual renderers, H3, Ramen, 3D cars or server map documents for a roughly 50-user pilot.
- ETA correction: client `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\map-math.ts` uses `round(minutes * 1.3) + 2` **minutes**; server `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\server\domain\journey.ts` uses `(round(1.3 * ceil(rawSeconds/60)) + 2) * 60` **seconds**. `ceil(minutes × 1.3) + 2` is not either implementation.

Reference: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\UBER-4.655-rider.md` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\uber-map-and-poi.md`.

### 10.6 Other corrections

- Athkar and Salati artifacts are prayer utilities, not delivery competitors; retain only regional craft/RTL/alarm/offline lessons.
- No WhatsApp ordering flow was found in the Shiply or Souq artifacts. Wind WhatsApp ordering is an unvalidated opportunity, not table stakes.
- Public corporate claims remain bounded: H3 is an index; Uber's ~2M is traffic-segment predictions, not trips; historical engineering posts are not current SLOs; campaign outcomes are not controlled causal proof; company-reported latency/migration results need raw evidence; Careem ownership is entity-specific; Palestinian address-level availability is **[U]**.
- Class counts require the counting method: JADX materialization, raw DEX definitions and archive-name counts are not interchangeable.
- No iOS IPA was obtained; no iOS parity claim is possible.

The research synthesis is `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Wind verified research atlas.md`; the broader mechanism atlas is `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md`; public-claim boundaries are in `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Delivery comparison master evidence.md`.

## 11. Original-demo session status

The task was to write **original** Expo apps under `C:\Users\osama\OneDrive\Documents\wind-competitors`, not recover proprietary source. A fresh five-demo run at `2026-11-14T05:32:24Z`–`05:32:52Z` passed **15/15 declared gates**. Parent validation independently checked every exit and log path, unchanged key-file hashes, and unchanged Git HEAD/status. Evidence root: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\`; summary SHA-256 `e252de7d5a9391a89a874e5f090731a1cc1688b4ced2f9ad03f2ab745bb577cc`.

| Demo | Current static evidence; runtime/device remains [U] |
|---|---|
| `wind-comp-uber` | 806 files including caches/untracked, 10 routes; typecheck/lint/selfcheck exit 0. HEAD `e34622049351463a56cd4e26220e282dd35b8a2b`. |
| `wind-comp-careem` | 30 files, 10 routes; typecheck/lint/selfcheck exit 0. HEAD `48127949998468ac46d09299589a68b2bafcc634`. |
| `wind-comp-haat` | 28 files, 9 routes; typecheck/lint exit 0 and 12 selfchecks pass. HEAD `2a231a5c60ca3962f3e390c2eb64e3bf6b8360d0`. |
| `wind-comp-shiply` | 30 files, 7 routes; typecheck/lint exit 0 and 17 selfchecks pass. HEAD `6f9fc0a9ca78e32808eb5b063d61925c990ae0e5`. |
| `wind-comp-souq` | 31 files, 8 routes; typecheck/lint exit 0 and 24 selfchecks pass. HEAD `1613ce054e4ab8f9ffbdcf48966e538169ba0bbb`. |

All five have README, selfcheck and `.git`; Git status stayed `## main`. Only ESLint cache timestamps changed. Earlier incomplete inventories and heads remain historical evidence, not the current state.

Shared ledger: `C:\Users\osama\OneDrive\Documents\wind-competitors\LEDGER.md`. It records green results only for Uber/Careem. Its screenshots are official/reference pre-login screens, not proof that five original demos are complete. Its statement that HAAT Driver/Courier were not installed is outdated after later official Play acquisition.

Limits: all five demos use junctions to shared `node_modules` and lack repo lockfiles, so they are not portable self-contained checkouts. Uber/Careem use in-memory state, mock maps/payments, no backend/AsyncStorage and compressed simulated movement. They are not evidence for Wind production readiness.

## 12. Inherited product and verification gaps not to lose

The narrow A1–A15 backlog does not replace the broader Fable workstreams.

1. **Maps and place data:** measure cold/warm first tile and readiness on real 3G, set a page-weight budget, remove the single OpenFreeMap dependency only after an owner-approved alternative, audit road/Arabic-name coverage, and project markers without hiding genuine wrong turns. Current index evidence: 24,090 places, 2,637 streets and 34,119 street samples built 3 November. The observed `bireh` ranking issue still needs a relevance test.
2. **Addresses people already have:** accept coordinate pairs, allowlisted Google Maps URLs and Plus Codes with confirmation; resolve short links server-side with an allowlist/timeout; let recipients privately propose corrections; learn completed-delivery fixes only for the same customer unless the owner approves more; localize recent city names.
3. **Roads, checkpoints and ETA:** expire/confirm reports, build permitted-road rules only from owner evidence, record promised/actual minutes with sample sizes, and learn road speeds only after driver-location retention approval. No real production trip corpus exists, so fare/ETA/dispatch calibration remains **[U]**.
4. **Reproducible routing:** the documented West Bank build clips relation 1803010, but the other OSRM Dockerfile uses the full Israel/Palestine PBF and both fetch moving `latest` data. Pin source date/checksum, graph/profile versions and quarantine the unclipped path before relying on route reproducibility. OSM geometry alone does not prove road legality.
5. **Driver field behavior:** measure 30-minute locked-screen/mobile-data survival, fix arrival-without-fix behavior, and close blocked-courier/cancel-after-handover custody cases. Foreground sandbox trips do not prove these.
6. **Stranger-facing basics:** verified identity recovery, fare/distance explanation, staffed emergency path, update distribution, field crash reporting and human TalkBack review remain. Production currently has no completed-delivery corpus.
7. **Notifications:** successful Expo ticket is not a receipt. Receipt polling, invalid-token quarantine, token rotation/logout/multi-device handling, deep links and authoritative in-app fallback need acceptance. Production backup has zero subscriptions.
8. **Payment activation blocker:** `createIntent` and direct `query()` were found to write `captured` without the settlement gate used by later query/webhook paths. No real provider exists and payments are PG-gated. This is not a claimed live exploit, but immediate capture, duplicate/out-of-order events, cash/card conflict and provider-captured/local-pending compensation must be fixed before any activation.
9. **Scaling boundary:** realtime waiters, routing health/budgets and API schedules are process-local. Keep one compatible SQLite API process and no durable worker. Multi-instance scaling requires PostgreSQL plus shared wake-up/reconciliation, scheduler ownership and two-instance concurrency proof.
10. **Release/distribution:** stable signed APK hosting, forced-update URL plus server minimum-build enforcement and a deliberate OTA decision remain open. N+1 pending-command preservation and automatic recovery are proven in Appendix H1; the manual-Retry-after-upgrade variant is **[U]** because automatic receipt reconciliation completed first. A merge, image push, host deploy and Android install are separate events.
11. **Security/privacy:** the old shipped APK exposed 32 permissions, including background-location and 14 third-party badge permissions across roles. Review permission necessity, public tracking/privacy allowlists, data retention and field diagnostics before strangers.
12. **Map sources and licences:** do not scrape Google/Waze/Facebook data or assume commercial rights. Keep source, licence, date and confirmation count per imported record. OCHA, HDX, GeoMOLG, ECF and Doroob need owner licence/partnership decisions. A Waze deep link is cheap; Waze for Cities and paid Google Places are separate approvals.
13. **Minutes-level operations:** hourly Uptime is not the requested human alert. The alert needs an owner-approved destination, induced failure and acknowledgement.
14. **Optional AI:** no in-product AI is assumed. Arabic road-report structuring or support triage needs explicit privacy/spend approval.
15. **Inherited economics, courier-welfare, reliability, regulatory, privacy and market-availability research — [U], not decision-grade:** retain a common delivered-order ledger for net receipts/contribution, CAC/LTV and downside scenarios; measure reliability/exception/support outcomes and money-received timing; measure courier net engaged/online hourly earnings, costs, payout latency, deactivation/appeals and classification; separate Saudi, Palestinian and Israeli licensing/consumer/tax/labour/payments/privacy matrices; and test current city/build/storefront/account/address/manual-pin/quote/fee/final-pre-commit checkout availability, connectivity recovery, duplicate prevention and accessibility. These are required research protocols, not evidence that any competitor or Wind passed them. Start with the corrected `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Delivery comparison master evidence.md`, including its §7 qualifications, and read all four required evidence files:
    - `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison-evidence\corporate-market.md`;
    - `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison\architecture-performance.md`;
    - `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison-evidence\operations-gaps.md`;
    - `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison-evidence\independent-red-team.md`.

    Preserve the master's corrections to Galileo latency, Delivery Hero group figures, Careem ownership/entity scope, Shaded Route evidence, HAAT arithmetic and transaction status; do not reintroduce stale ledger wording as verified current fact.

## Appendix A — implementation, booking, payment, and cutover preservation

These are prior-model requirements and open acceptance items, not new completed features.

### A1. Booking and source changes that must not be lost

- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\app\book.tsx` retains commands after these nine post-lock refusals: `quote_consumed`, `quote_expired`, `route_prohibited`, `service_unavailable`, `pooling_unavailable`, `promo_changed`, `promo_used`, `invalid_schedule`, and `too_many_searching`. `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\booking.ts` keeps Edit/Discard disabled while receipt status is unknown. Never reintroduce elapsed-time absence, a `sentAt` commit proxy, or timed release of an unknown command. Preserve `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\tests\booking-retry-race.test.mjs` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\tests\booking-auth.test.mjs` as complementary constraints: post-lock commands persist, while unknown receipts remain unreleasable.
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\tsconfig.json` was deliberately narrowed to `src/**` plus Expo type roots and explicit exclusions. `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\tests\clean-typecheck.test.mjs` replaces the exclusion list, so an exclude-only change lets research clones back into the scan and can time out.
- An unpinned pickup is measured from its city centre and warns beyond the 20 km service zone; a pinned pickup retains the 1 km threshold. Arrival without a fix remains `unknown`, not silently accepted. W-00007 was physical confirmation, not the whole implementation history.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-VERIFIED-ADDITIONS.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-RECONCILIATION.md`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\PLAN-2026-11-10-OPEN-ITEMS.md` row 26.

### A2. Production credential boundary

The owner previously **declined** the production-credential request. No repeated request or further login attempt is routine or neutral. Only an affirmative later owner reversal, with a dedicated production test account supplied through an approved secret channel, permits the authenticated version-27/successor journey. Do not record that credential in evidence. Sources: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-PILOT-SCOPE.md` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\verification\CONSOLIDATED-24H-2026-11-13.md`.

### A3. PostgreSQL cash-resolution/trigger acceptance — reproduced and fixed in isolated source

- **Confirmed defect:** the original `immutable_cash` allowed only `status` and `decided_at` to change, while admin resolution writes `resolved_by` and `resolution_note` plus optional evidence. A real `POST /api/admin/cash/1/resolve` returned HTTP 500 with `cash ledger is append-only`. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\pg-admin-cash-resolution-before-fix.txt`.
- **Minimal fix:** `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\server\db\postgres-guards.sql:83` now excludes only `status`, `decided_at`, `resolved_by`, and `resolution_note` from the new/old comparison. Amount, driver, note, request identity, and every other field remain immutable; only pending entries can transition to confirmed/disputed with a decision time.
- **Regression:** `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\tests\pg-cash.mjs` now covers confirm, dispute, actor, reason/evidence, duplicate refusal, and amount-rewrite rejection. [ran] Targeted `node tests/pg-cash.mjs` on remote 55494 exited 0 with `cash: ok`: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\pg-cash-resolution-fix.log`. The subsequent full-suite rerun is recorded in §5.2 rather than inferred from this targeted pass.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\wind-money-and-state.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Wind verified research atlas.md` P1-4, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\server\domain\cash-ops.ts:37-50`.

### A4. Payment activation and Option A cutover requirements

- Payment coverage must include payable-state refusal for cancelled/delivered orders; immediate and delayed capture; duplicate and out-of-order query/webhook events; timeout followed by late capture; refund-before-capture; partial/full refund reconciliation; exactly-once settlement per order; and removal of redundant provider polling without breaking recovery.
- Preserve provider-captured/local-pending compensation through void/refund or durable exception handling, including cash-first/card-first conflicts. Capability metadata names migration 25 while `paymentsAvailable()` checks migration 17; validate the real gate. Reconcile older rejected refunds to provider and ledger statements before any activation.
- Option A migration sequence is **3–23 and 25–30**; version 24 is intentionally absent and must not be renumbered. Readiness requires migration 30. Production currently requires an absolute persistent `DB_PATH`; reconcile that with the PostgreSQL runtime rather than assuming a URL alone is enough.
- Snapshot-only `--freeze-writes` ends before import. A continuous writer freeze is required through cutover validation. After the first authoritative PostgreSQL write—including sign-in, smoke, or worker writes—recover forward; do not roll back to stale SQLite. Serialize deployment and watchdog activity with a real mutex such as `flock`.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\HANDOFF.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\security_reliability_quality.md`, `repository_functionality_audit.md`, `backend_aws_architecture.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 verified execution handoff\audit-b-infra-tests.md`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md`.

## Appendix B — operator, accessibility, privacy, performance, and owner decisions

### B1. Admin/operator acceptance gaps

- **P0:** remittance/adjustment currently submits directly. Add a final review naming driver, signed amount, and action; the 300-cent handover does not close this UX defect. **P1:** add concise review for global settings save, subscription activation, block/unblock, and profile/role/vehicle edits.
- Admin cash, users, subscriptions, incidents, and disputes render whole arrays without pagination/virtualization. Require production-scale memory/frame acceptance before replacing them. Add persistent data-age/failed-refresh indicators and conflict-safe reconnect behavior. Settings and subscription actions need ambiguous-timeout/idempotency acceptance too.
- Admin money parsing uses `Math.round(typedNumber(text) * 100)`. Replace door/admin money input with string-to-minor-unit parsing. A-01 needs two similarly named drivers and a timeout after commit, proving one ledger entry/reference. A-06 must make stale offline cash/dispute data obvious before reconnect resolution.
- Self-serve subscription cancellation is absent. Operational queue assignment/SLA/bulk controls are deferred, not complete.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\mobile_experience_audit.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\app\admin\cash.tsx`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md` §§6 and 21.

### B2. Offline, accessibility, location, and driver health

- When `/me` fails with no saved orders, the authenticated shell disappears. Add a labelled role-safe cached/read-only mode with disabled mutations and visible staleness; never bypass `/me` or authorization.
- Exact pin selection currently depends on dragging/current location. Provide coordinate readout/edit or an address-driven equivalent plus TalkBack/switch/keyboard-usable zoom controls. The current result is an accessibility failure until fixed.
- The shared 1.35 font cap stops below the 200% expectation; measured tagline growth was 82→116 px. Rework proof-code groups, price rows, fixed footers, driver actions, and admin rows before raising toward 2.0 rather than deleting the cap and clipping content.
- Expose last accepted fix, last server acknowledgement, foreground-service state, and next retry for driver support. `orders[0]` as primary does not define multi-recipient next-stop, proof, or cash actions; test several recipients and return/reattempt flows.
- Active-GPS session fencing is enabled only by explicit development/test flags. Enable deliberately for production and prove stale sessions cannot revive tracking. The 300 m/120 s arrival rule needs calibration with accuracy radius, consecutive fixes, speed/dwell, access-side geometry, and rider/driver confirmation.
- There is no durable offline fix queue/raw history. Record explicit gap evidence for filtered/discarded fixes. Test “more precise always wins” and wild-fix/reference behavior on real hardware rather than assuming correctness or a defect.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\mobile_experience_audit.md`, `maps_tracking_dispatch.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\app\_layout.tsx`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\pin-sheet.tsx`.

### B3. API performance, contracts, and observability

- Journey decoration performs per-order `getOrder` plus projection. Benchmark and optimize without changing `journeyProtocol`. Historical 8 November figures—65 versus 3 statements for 20-order history and mixed-workload p95 4,183.89 ms versus 428.82 ms—are targets only, not current results.
- Canonical route inventory is **182 registrations**: GET 60, POST 118, DELETE 2, PATCH 2. Older 169/178 counts are not interchangeable. Entra exists as POST, not a missing GET. Preserve route×role authorization, bilingual stable errors, idempotent retries, real 500/request-ID behavior, and release p95 measurement.
- Unexpected 5xx and driver presence expose a correlation reference. The remaining observability gap is retained searchable logs; plain container output without retention/search is insufficient.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\repository_functionality_audit.md`, `security_reliability_quality.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` §10.9, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\server\main.ts:3218-3233`.

### B4. Browser tokens, privacy, multi-instance, and recovery

- Native SecureStore does not protect browser tokens: web auth uses `localStorage`. Either explicitly accept that with strong CSP/XSS regressions, no sensitive third-party scripts, short revocation procedures and incident response, or move to HttpOnly/Secure/SameSite cookies with CSRF protection. Inspect responses, logs, analytics/crash payloads, notification bodies, Android backups, app-switcher screenshots, and exported bundles for tokens, precise location, staff notes, and payment metadata.
- Open-ended operational/security/staff-note retention needs an owner, purpose, legal basis, retention period, deletion/anonymization, and post-restore re-scrubbing policy.
- `codeKey` is random per process; multiple API instances can invalidate each other’s email codes. Use a stable shared rotated secret with safe overlap and a two-instance test. Normalize proxy/IP handling before distributed throttling. Region outage remains an owner-accepted risk or unresolved decision; same-Region backups/Multi-AZ are not Region-loss recovery and the cross-Region prohibition is not DR.
- Private-object activation still lacks real storage transport and malware scanning. Quarantine pending/unscanned objects and deny failed/pending reads. `enqueuePush` in `events.ts` contains PostgreSQL-only calls without a function-level backend guard; add one before any new caller. Future RDS restore may lazy-load: measure post-restore latency and size `API tasks × pool maximum + worker + migration/admin headroom`.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\security_reliability_quality.md`, `backend_aws_architecture.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-VERIFIED-ADDITIONS.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\src\storage.ts`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\server\domain\private-objects.ts`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\server\main.ts:727`.

### B5. Full owner-decision register

The next implementation owner must record decisions rather than infer them from code:

- Exact municipalities/districts/villages, categories, hours, customer segment, driver cohort, and service-area boundaries.
- Numeric completion/assignment/ETA/support/safety/reliability thresholds and RPO/RTO; accountable operations, onboarding, support, safety, finance/COD, road, Arabic-content, privacy/legal, and launch owners.
- Manual versus automatic dispatch and fairness/utilization; navigation handoff, wait/no-show, recipient-unavailable, unsafe-stop, cancellation, and reassignment policies.
- Commission, subscription, referral, fare/quote, waiting, cancellation, and destination-change rules; document requirements, reviewers, and retention for every actor/merchant/vehicle.
- Public-tracking fields/expiry, recipient verification, call masking, chat/location/proof retention; support languages/hours/SLAs and staffed safety/service-suspension authority.
- EAS project/profiles, signing owners, minimum app version, staged-rollout pace, OTA, rollback, forced-upgrade authority, and which pre-existing dirty-tree changes are authoritative.
- Staged opening policy 50 → 200 → open, with recent restore/alert/support evidence at each step.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Fable 5.2 production upgrade handoff.md` §12 and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md` §7.

## Appendix C — cash, custody, offline, maps, and regional market

### C1. Door variance, arrears, settlement, and earnings

- A11 typed reasons are exactly `PARTIAL_PAYMENT`, `CUSTOMER_DID_NOT_PAY`, `APPROVED_DISCOUNT`, `RETURNED_ITEMS`, `INCORRECT_CASH`, and `OTHER_ADMIN_REVIEW`. Over-collection needs a reason too; the server re-derives delta from the order. `APPROVED_DISCOUNT` needs a linked approval ID or is disallowed at the door; `OTHER_ADMIN_REVIEW` routes to an admin queue. Parse strings to minor units and preserve two-person remittance confirm/dispute.
- Server-set warning/block thresholds per driver: warning shows a persistent named-amount banner; blocking prevents new dispatch while allowing the in-flight job to finish. There is no card-job fallback in the cash-only scope. Partial settlement is first-class and shows what was restored. Future payout deduction is only a proposal; Vodafone Cash/bank transfer is not an approved provider choice.
- Cash starts **Unverified**, becomes confirmed after reconciliation, and displays total unverified beside confirmed earnings. ≤3 working days is a design target, not a measured SLA. Earnings need signed line items—trip earnings, tips, bonus, guarantee, fines, reversals, behavior penalties, money in/out, other—with daily/weekly/monthly aggregation and empty states.
- Preserve customer arrears/pre-trip gate, cash-only copy, no-change/remainder decision, and payment-method-first checkout. Do not invent PayPal/wallet rails or adopt acceptance-rate gating, tiered shifts, attendance pressure, Bluetooth go-online, or second push/screen-recording/motion-KYC stacks at pilot scale.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md` §§6–8 and 19, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\careem-rider-captain.md`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\careem-captain-earnings-and-cash.md`.

### C2. Shift, capacity, proof, custody, and offline behavior

- `PENDING_SETTLEMENT` replaces the board and blocks another active shift/new scan actions; a ready queue is served only during `ACTIVE`. v1 can be admin-gated and scan-free until vehicle inventory exists; do not require vehicle QR prematurely.
- Zone `selectable` is not a reservation. Enforce capacity atomically at booking with a specific “window filled while checking out” path. Cutoff is local wall-clock, not UTC. Order cap and vehicle-load cap differ; no capacity-surge v1. Same-day priority remains one parcel attribute with server capacity/fee checks and reversible cutoff cancellation rules.
- Optional QR proof must not weaken five-strike lock/reset. Reset reopens attempts, never marks delivery. Record `QR_SCAN`, `SHORT_CODE`, or `ADMIN_ACTION`, reasons for admin events, dead-phone fallback, and supervisor review for repeated resets.
- Custody needs append-only kind/method/actor/time records. GPS is only a hint; missing legs render an explicit unverified gap, never interpolated proof.
- Outbox replay reuses original request ID and actor scope. Retryable 0/401/429/5xx halts flush; other 4xx becomes a visible per-entry error. Storage failure blocks mutation, and retries are capped/parked. Unknown server status maps to explicit unknown/error UI, never false completion.
- A13 needs a real default fallback channel and consent-before-FCM-auto-init; ledger-affecting OTA requires staged QA. A14’s receiver graph includes `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `USER_UNLOCKED`, `USER_PRESENT`, `TIME_SET`, `TIMEZONE_CHANGED`, `PACKAGE_REPLACED`, `CONNECTIVITY_CHANGE`, `TIME_TICK`, and WorkManager fallback. A15 needs versioned zones/fees/windows/saved-address bootstrap with cloud-backup/privacy treatment; do not build a broad offline tile downloader before proving saved jobs, directions, pins, and last route insufficient.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md` §§3–5, 7, 9–17, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\souq-tulkarm-feature-implementation.md`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\ATHKAR.md` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\SALATI.md`.

### C3. Map/provider evaluation and tracking acceptance

- Candidate order: Pelias for the search pilot, Valhalla as first routing challenger, GraphHopper only for demonstrated matrix/customization/optimization needs. Compare against the same versioned OSM release and ground truth; no provider award or three-engine migration has been selected. Validate disconnected components, restrictions, Arabic/English names, route regressions, and rollback.
- Proposed—not measured—ground truth: 300 verified destinations, 200 route pairs, and 100 completed trip timelines, stratified by neighborhood, road class, language, urban/rural, distance, and time.
- Google labels Palestine “good quality” for tiles, geocoding, driving directions, and snap-to-roads, but **traffic layer and speed limits are unavailable**. That does not prove entrance accuracy, Places recall, or road legality. Google coordinate caching is 30 consecutive calendar days; place IDs are exempt. Do not mix Google geometry/content into OpenFreeMap/Apple/private datasets without contractual review.
- Public Nominatim is limited to one request/second, forbids autocomplete/systematic queries, and is not a production dependency. OpenFreeMap is “as-is” with no availability commitment; documented app-initiated offline use is capped at 3,000 tiles or 50 MB, four parallel requests, and a unique app-identifying User-Agent; larger use needs contact.
- Proposed tracking gates: 60-minute moving cadence, 30-minute offline replay/gap, four-hour battery/thermal comparison, mock/replay/teleport/session-epoch cases, and multi-replica recovery. Proposed dispatch gates: 500 shadow jobs and 500 real automatic jobs only if automatic dispatch is later selected. None is an achieved result.
- Optional research inputs: Palestine Open Data Portal CKAN API `https://www.opendata.ps/api/3`, postal-code/PCBS locality data as optional aids, and Israeli open data/GovMap as low-priority unclear-coverage/license inputs. Test Waze deep links installed/absent with restricted-road warnings. Rebuild a larger real pilot address corpus; the old 19-place list is missing and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\tasks\maps-corpus.json` is synthetic. Owner must choose public OSM corrections versus private Wind-only corrections.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\maps_tracking_dispatch.md` and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md` §5I and §7.

### C4. Palestinian market, payment-rail, and legal research

- West Bank, East Jerusalem, and Gaza require separate address, network, payment, support, safety, and legal acceptance; do not generalize a West Bank test to either other area.
- UPU documents an eight-character alphanumeric Palestinian postcode placed to the right of locality, but supplies no courier coverage or usage prevalence. Postal fields remain optional.
- Conduct qualitative field discovery of five successful and five problematic recent deliveries per participating merchant/courier, preserving original address text and how the courier found the destination. This does not estimate population prevalence.
- Local payment research names iBuraq, E-SADAD, and PalPay/Mahfazati, but merchant API eligibility and production suitability are unknown. AIB documents JOD, USD, ILS, and EUR; this prompts a currency question, not four launches. Any future digital method needs onboarding, district/account support, fees, settlement timing/currency, expiry, idempotency, server confirmation, full/partial refund, reversal, reconciliation export, disputes, and support evidence. At most one digital route is a later option; current scope is cash-only.
- Operational order/delivery receipt is not automatically a fiscal invoice. Stored balances, pooled funds, and delayed merchant payouts need local payments-regulatory review. The 2023 IFEX/7amleh guide is historical advocacy, not a complete 2026 legal position; later privacy-law claims require current official texts and professional review.
- Source: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\palestinian_market_requirements.md` §§1–5.

## Appendix D — competitor, corporate, protocol, and process preservation

### D1. Competitor mechanisms still available for design

- Handoff hints: `meet_at_door`, `meet_at_entrance`, `leave_at_door`, and `call_on_arrival`, chosen at booking, server-stored, and visible to both sides. Any hint artwork must be Wind-created.
- Typed product contract: typed `products[]` in `/api/price`, server-hinted `nextPollMs`, shared `ApiErrorCode`, and mutation-returns-current-state. Uber’s +100 model field set and POI wire path remain unknown.
- Evaluate narrow server-driven per-booking capability configuration using Careem `BookingConfig.overrideAllowedPaymentTypesForCcts` and SDUI as references; generic types/per-CCT subsets remain unknown.
- Careem’s payment mapper and HAAT bootstrap support stable bilingual stage/reason diagnostics. The mapper was traced only to top-up, not every payment surface. HAAT suggests a small actor-named state set, truthful “less than N minutes” ETA ladder, and a separate service-fee line; use Wind’s own fluent Palestinian Arabic.
- JAYEEK evidence includes a real revert request and data-driven eligibility, not third-party fulfillment or irreversibility. D12 is a future shared-carrier abstraction, not proof of a contracted carrier.
- Release hygiene: one canonical HTTPS deep-link domain with AASA/assetlinks rather than ten-domain autoVerify sprawl; one reverse-domain identity across package/bundle/Firebase/deep links/signing; no exported Compose/test activities; consent before FCM auto-init.
- Careem cash-block copy blocks cash bookings while card bookings can continue; it is not proof of an account-wide ban. Careem’s 60-minute versus one-working-day withdrawal and Careem Pay no-cash-out versus general bank-withdrawal copy remain unresolved. Souq’s physical-count `resolutionNotes` has required-looking copy without a button guard, and `PENDING_SETTLEMENT` has warning-versus-enabled-scan conflict; server enforcement remains unknown.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md` §§8, 13, 15–17, 20–21, and 23; `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Wind verified research atlas.md` §§5.1, 6.6–6.7, 7, 8.7, and 8.11; `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\careem-rider-payment-and-address.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\shiply-feature-implementation.md`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\souq-tulkarm-feature-implementation.md`.

### D2. Reference-artifact and provenance boundaries

- Shiply’s actual driver artifact remains unacquired; the customer bundle proves no jobs, earnings, settlement, ready queue, shift, or driver workflow. Careem Partner remains unacquired.
- HAAT Driver/Courier have official Play identities and manifest/resource evidence, but no JADX/REA code-level pass or competitor runtime. Queue algorithms, exact transitions, custody scans, cash close/variance, settlement timing, and offline replay remain unknown.
- Acquisition wording for Shiply, Souq, Athkar, and Salati conflicts—“pulled from the owner’s phone” versus “the phone was not touched.” Preserve that contradiction rather than harmonizing it.
- Uber 4.654’s original ten-split bytes/decompile roots are absent. Reacquire/re-hash every split, verify both signing-tool results, regenerate 23-DEX coverage, and reconcile 206,261 versus 206,254 Java files before calling that chain reproducible. The newer 4.655 study does not close it.
- No competitor full order/cash runtime or economics was obtained; Careem/HAAT first runs stopped at login/network walls. Shiply still needs Expo/RN version, signer, `allowBackup` PII scope, and overlay/storage/screen-capture permission review. Souq still needs native `SecretKey`, Web Push reliability, service-worker, Railway status, and signer review.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Wind verified research atlas.md` §7 P3 and §8.12, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md` §24, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 verified execution handoff\reference-rea-audit.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-DRIVER-SIDE-RESEARCH-PLAN.md`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\HANDOFF.md` §3.5.

### D3. Corporate/public-research corrected synthesis

- **Delivery Hero:** transaction remained pending, closing expected H2 2027, not a completed July takeover. First-acceptance attribution was 66.56%, subject to conditions. Corrected Q3 group figures are 1,001M orders, €13.9346B GMV, and €4.3479B revenue, with like-for-like growth of 11.5%, 13.6%, and 22.0%. These are group metrics, not HungerStation performance.
- **Careem ownership:** Uber’s 10-Q reports approximately 60% Uber / 40% e& for Careem Technologies and consolidation from 31 July 2026. The 62.47% figure is a derived complement of e&’s disclosed 37.53%, not a directly disclosed Uber figure. Careem ridesharing remained fully Uber-owned; do not apply either percentage to every Careem entity.
- **HAAT corporate:** stronger transaction reporting says approximately $20M raised at roughly $100M post-money, not $200M. The $300M valuation is PR-attributed and unverified. No source supports a 2022 founding. The 50-city/10,000-partner figures are company-supplied, not independently audited.
- **Galileo:** the synthetic table reports approximately 0.5–1087.7 ms by query type and collection size, not generic 15 ms P50/30 ms P99.
- **Shaded Route:** the campaign exists. VML reports >114K shaded km/day, 16K shaded rides/day, +20% retention, +15% satisfaction, and +20% peak-time deliveries. These are campaign-reported outcomes, not controlled causal evidence or controlled 10–15°C food cooling.
- **HungerStation:** the customer story is Google Cloud, not AWS. Its 2.5× delivery and downtime outcomes are migration-wide, not autoscaling-only causation.
- **HAAT arithmetic:** 3300→114 ms is 28.95× and 96.55% arithmetically, but workload, H3 attribution, environment, percentiles, and raw results remain unverified.
- **Uber One:** 50 million members drive “half” of Mobility/Delivery Gross Bookings, not “50M+ generating >50%.”
- **Source-access:** CNN returned HTTP 451; Calcalist could not be independently fetched; e& PDF text was not directly parseable; some historical Uber engineering URLs redirected or were unavailable. Keep HAAT funding/valuation and affected engineering details secondary/qualified.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Delivery comparison master evidence.md` §§1, 3, 5, and 7; `research\delivery-comparison-evidence\corporate-market.md`; `research\delivery-comparison\architecture-performance.md`; and `research\delivery-comparison-evidence\independent-red-team.md`, using the later master’s corrections.

### D4. Decision-grade research protocols, not completed findings

- **Economics:** reconcile completed-order contribution using `NR = c + f + a` and `CM = NR - K - P - S - D - V`. Keep merchant take rate, consumer-fee yield, net platform yield, IFRS revenue, and CAC distinct. If steady-state `CM/order <= 0`, positive LTV:CAC and CAC payback are meaningless. Require latest-90-day order-level reconciliation plus 12-month cohort exhibits, base/downside/severe-downside models, minimum viable density, and maximum affordable CAC per city.
- **Competition/substitution:** include merchant-owned fleets, phone/WhatsApp ordering, pickup, cooking at home, local platforms, exclusive supply, and courier/consumer multi-apping—not just four app brands.
- **Matched baskets:** three baskets including one substitution-prone basket; same formal/informal addresses; lunch, dinner, off-peak over four weeks; target 30 observations per platform-city-daypart; capture every fee, promotion, ETA, cancellation, substitution, refund, and support result.
- **Interviews:** 10–15 merchants and 10–15 couriers per launch city, with recruitment/selection limits, commissions, net payout, exclusivity, multi-apping, support, and substitution.
- **Availability:** for each named Palestinian address record build, OS, storefront, account requirements, manual pin, merchant/basket quote, complete fee display/currency, final pre-commit checkout, local terms, support, and contracting entity. Menu views and historical launches are not checkout evidence; lack of evidence is not proof of absence.
- **Claim register:** every material claim needs Claim ID, legal entity/territory/city, decision affected, observation period/expiry, numerator/denominator/exclusions, currency/VAT basis, source tier and collection method, sample/device/app/address/daypart, independent corroboration, contradiction check, confidence rationale, next action, owner, reviewer, and resolution date. No market-share claim without a denominator and no availability claim without location/date.
- Sources: `research\delivery-comparison-evidence\operations-gaps.md` §§1–9 and `research\delivery-comparison-evidence\independent-red-team.md` §§6–7.

### D5. Residual execution-ledger and model/process history

- Row 10 missed Confirm measured 0 misses in 40 taps at 100/180/300 ms. It was not reproduced and has no proven cause/regression test; keep only until recurrence or owner acceptance of that evidence, not as an active reproduced defect.
- Rows 15–16 need Arabic/English pin-label collision before/after evidence and deterministic one-viewport route captures. Row 22 needs support attestation, admin-known temporary password, forced-change behavior, subscription removal, and the actual recovery path.
- Row 24 requires inspecting active-backend scope of old unaudited actions, reset notes, optional identity rows, and `phone_audit` retention without exposing personal data. Row 34 needs expired-PostgreSQL-fare requote UX; stale display is not evidence an expired fare was charged.
- Rows 31–32: evaluate a search-service hint only if observed confusion justifies it, and test parcel-tile wrapping at actual width rather than assuming three tiles fit at 390 pt.
- Official research records Claude Fable 5.2 as model/API ID `claude-fable-5-2`, released 9 November 2026, with adaptive thinking and default effort `high`. This does not establish downstream provider routing/effort behavior and does not conflict with the observation that no process named Fable was running.
- Do not reuse the original brief’s “you are the owner and long-term maintainer” persona. Later guidance found ownership prompting increased unrequested changes; use “implement the owner’s approved requirements with minimal necessary changes.”
- Preserve disclosed research side effects: `.venv-aws` and the `rea` clone at `937d10df1c709c8b2f5af8d9406ef735d0b3a2dc` under the verified-execution research directory. The NVIDIA worker created `final-classification-report.md` despite a read-only brief; that deviation is confined to research notes and its retracted claims are not adopted.
- Sources: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\PLAN-2026-11-10-OPEN-ITEMS.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\fable_claude_prompting.md`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\HANDOFF.md` §8, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\INDEPENDENT-REVIEW.md`.

## Appendix E — complete research and evidence path hub

Use these paths rather than searching again. The current isolated copies are authoritative for final status; original-repository copies preserve earlier history.

### E1. Current verification documents

- `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\verification\CONSOLIDATED-24H-2026-11-13.md`
- `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-PILOT-READY.md`
- `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-PILOT-SCOPE.md`
- `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-GAP-BACKLOG.md`
- `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-DIALECT-ADR.md`
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\report-validation-final.json`

### E2. Direct run and artifact evidence

- Isolated source identity manifests: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\source-identity.json`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\remote-source-identity.json`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\remote-source-manifest.json`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\verify-source-identity.mjs`, and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\compare-remote-source.mjs`
- Booking race: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\booking-race-55474.log`
- Reference hashes/artifact root: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\reference-base-hash-verification.json` and `C:\Users\osama\AppData\Local\Temp\opencode\apks\`
- 4193 APK/config/signature: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4193\apks\wind-customer.apk`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4193\apks\artifact-verification.json`, and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\wind-customer-4193-apksigner.txt`
- Well-Architected human assessment: `C:\Users\osama\AppData\Local\Temp\opencode\wa-wind-20261113-0d9659c6f7a5\question-assessment.md`
- Local fixture log: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-pg-final-20261113\postgresql.log`
- Historical persistence/runners: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-failed.log`, `persistence-55494-exit.json`, `run-persistence-55494.ps1`, and `run-final-gates.ps1`
- Build-25 failure: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\eas-build-25.log`
- AWS/GitHub details: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\ecr-images.txt`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\wind-alarms.txt`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\canaries.txt`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\aws-final\log-groups.txt`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\public-final\public.json`, `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\github-final\release-runs.json`, and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\github-final\uptime-runs.json`
- Original-demo screenshots: `C:\Users\osama\OneDrive\Documents\wind-competitors\screenshots\`

### E3. REA corrections and source maps

Under `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\`:

- `2026-11-13-DRIVER-SIDE-RESEARCH-PLAN.md`
- `2026-11-13-haat-gap-research.md`
- `2026-11-13-INDEPENDENT-CHECK.md`
- `2026-11-13-RECONCILIATION.md`
- `2026-11-13-VERIFIED-ADDITIONS.md`
- `2026-11-13-IMPLEMENTATION-HANDOFF.md`

### E4. Competitor implementation atlas

Under `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\`:

- `haat-client.md`
- `production-deployment-evidence.md`
- `shiply.md`
- `uber-benchmark.md`
- `careem-rider-captain.md`
- `souq-tulkarm.md`

### E5. All 11 Wind verified atlas studies

Under `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Wind verified research atlas\`:

- `baseline-and-deployment.md`
- `careem-captain-earnings-and-cash.md`
- `careem-rider-payment-and-address.md`
- `haat-address-and-checkout.md`
- `haat-tracking-and-bootstrap.md`
- `shiply-feature-implementation.md`
- `souq-tulkarm-feature-implementation.md`
- `uber-offer-eta-payment.md`
- `uber-map-and-poi.md`
- `wind-geo-and-dispatch.md`
- `wind-money-and-state.md`

### E6. Reference-app studies

Under `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\`:

- `ATHKAR.md`
- `CAREEM.md`
- `HAAT-DRIVER.md`
- `HAAT.md`
- `SALATI.md`
- `SHIPLY.md`
- `SOUQ-TULKARM.md`
- `UBER-4.655-rider.md`
- `PALESTINIAN-COMPETITORS-INDEX.md`

### E7. Earlier execution evidence

- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\integration-current.log`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\lint-current.log`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\lint-recheck.log`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\parcels-rerun.log`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\typecheck-current.log`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\typecheck-server-recheck.log`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\tsconfig.audit.json`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\verify-2026-10-29\mutation-results.json`

For HAAT provenance, prefer each role directory’s `artifact-hashes.json`, `apksigner.txt`, `aapt2-badging.txt`, and `package-paths.txt`; `download-manifest.json` records failed mirror downloads and is not official-Play acquisition proof.

## Appendix F — complete SM-A5360 acceptance matrix

These are required acceptance cases, not completed results. Source: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\mobile_experience_audit.md`.

### Customer — C-01–C-07

- **C-01 (P0):** sign in with saved orders present and absent, force-stop, disable connectivity, cold-launch each state, then reconnect. Require a labelled recoverable mode, visibly read-only/stale saved orders, and no duplicate booking.
- **C-02 (P0):** in Arabic and English, try a known landmark, street address, unnamed road, and saved place. Verify local-only failures are explained; drag pins at service boundaries and prevent silent city/pin changes.
- **C-03 (P0):** interrupt booking pre-response, post-server-accept/pre-client-response, and during reconnect. Retry only through pending-command UI and confirm one order, correct price, and preserved draft.
- **C-04 (P0):** deny/permanently deny location, disable GPS, use stale/inaccurate fixes, and revoke permission while booking. Verify textual recovery and Settings actions, then complete a manual city/landmark booking without location.
- **C-05 (P0):** for searching → assigned → pickup → in-transit → completed, background/foreground and toggle connectivity. Verify map/diagram fallback, stale driver state, ETA suppression when stale, correct proof code, and exactly one final state.
- **C-06 (P1):** deny notifications, reinstall/revoke token, then tap cold and warm order/deep-link notifications. Measure killed-app arrival latency and compare polling fallback.
- **C-07 (P1):** with TalkBack and switch/keyboard access, choose an arbitrary non-current-location pin without dragging. Unless an equivalent control is found, this remains a documented accessibility failure.

### Driver — D-01–D-07

- **D-01 (P0):** with an active job, test foreground, screen locked, backgrounded, swiped away, force-stopped, and rebooted. Capture fix time/accuracy and customer-visible staleness at each transition, including recovery without duplicate trackers.
- **D-02 (P0):** cycle Wi-Fi/mobile data/airplane mode during assignment and transit, including a several-minute outage. Require fresh fixes after reconnect, no stale position presented as live, no old web-fix replay, and truthful ETA.
- **D-03 (P0):** deny/permanently deny/revoke foreground and background permissions and toggle GPS off during a job. Every blocked state needs an actionable explanation; tracking never starts after actor/session invalidation.
- **D-04 (P0):** sign out or switch accounts during permission prompt/upload, then background and relaunch. The old account must not continue presence/background tracking and sign-out must complete without connectivity.
- **D-05 (P0):** race two competing drivers accepting one offer, then cancel/reassign during poor connectivity. Require one winner, accurate job lists, and no completion/cancellation against a stale assignment.
- **D-06 (P1):** carry multiple parcels, complete each recipient handover and one return/reattempt. Verify next-stop clarity, proof-code association, cash totals, and earnings after reconnect.
- **D-07 (P1):** create pending, confirmed, and disputed cash entries with references/notes, then poll, reconnect, and expand history. Verify signed amount/status/timestamp and one final decision per entry.

### Admin — A-01–A-06

- **A-01 (P0):** record remittance, negative adjustment, and payout against two similarly named drivers. Final review must identify action/driver/signed amount; simulate timeout after server commit and confirm one ledger entry/reference.
- **A-02 (P1):** change pricing/discount settings with Arabic-Indic and decimal input, rotate app state, interrupt save, and prevent silent partial/old configuration being presented as saved.
- **A-03 (P1):** activate/reject the same subscription from two sessions and rapid taps. Require one outcome, accurate pending/active state, and explicit activation review.
- **A-04 (P1):** block a driver with parcels, cancel first warning, repeat and choose return recovery; unblock/edit role and verify all lists/order states after reconnect.
- **A-05 (P1):** load production-scale users/cash/disputes under low memory, scroll to the oldest entry during polling, and measure frame stalls/memory plus scroll/draft survival.
- **A-06 (P0):** open stale cash/dispute screens offline, then resolve after reconnect while server state changed elsewhere. Staleness must be obvious and conflict/error handling must not show false success.

### Cross-role — X-01–X-05

- **X-01 (P0):** set Android font/display size to maximum in Arabic and English; complete auth, booking, active-order proof, driver handover, dispute resolution, and cash remittance. Require no clipped primary action, overlapping price/code, or hidden validation; verify beyond 135% after the cap is fixed.
- **X-02 (P0):** run TalkBack through those flows including radio selection, errors, help expansion, proof digits, modal focus, and map alternatives. Record traversal order and require a meaningful Arabic label for every icon-only action.
- **X-03 (P1):** enable reduced motion, largest display, and high-contrast/readability settings where Samsung exposes them. Test pin sheet, route fallback, and footer actions on narrow portrait and tablet-width layouts.
- **X-04 (P1):** profile a release build from cold start through map load/live tracking and large admin lists under memory pressure. Capture UI/JS stalls, **WebView renderer recovery**, memory, battery, and network use.
- **X-05 (P0):** repeat cold launch with no connectivity, 5xx, timeout, and slow 2G-like connectivity, with/without cached orders and during restored native tasks. Offline mode must replace protected routes, saved summaries must be stale/read-only, recovery usable, and previous-account location sharing must stop.

Source line ranges: C cases `mobile_experience_audit.md:54-60`, D cases `:106-112`, A cases `:155-160`, X cases `:210-214`.

## Appendix G — provider, privacy, downside, and deferred-workflow evidence

### G1. Historical provider failure and recovery

Cross-provider `delegate_task` first failed with `provider_unavailable: Provider instance nvidia is not registered`. The native agent then ran the requested NVIDIA model successfully: background session `ses_e2d5e7759ffe2Wa4Cjx6xhYUx4`, model `nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b`, high reasoning, completed. Preserve both the failure and recovery rather than presenting provider delegation as inherently reliable. Source: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\INDEPENDENT-REVIEW.md:11`.

### G2. Privacy-request measurements and six research downside scenarios

A retention table must contain actual values, not “as long as necessary.” Test at least one deletion and one access request per platform/role and measure completion time and residual data. Source: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison-evidence\operations-gaps.md:266`.

Required downside models, all still **[U]**:

1. **Incumbent cuts merchant commission or consumer fee by 5 percentage points:** effect on merchant supply, order share, CM/order, CAC and payback; identify who funds the response and maximum sustainable duration.
2. **Rival subscription/free-delivery campaign:** incremental frequency versus cannibalization, subscription cost, post-campaign churn, courier utilization and support load.
3. **Top-merchant exclusivity or removal:** order/GMV concentration, substitute merchant conversion, consumer churn and reacquisition cost.
4. **Courier net cost rises 15% or active supply falls:** price/pay response, assignment and late-delivery deterioration, density, CM and service-level feedback loop.
5. **Refund/fraud/cash loss doubles:** direct CM effect, stricter-control false positives, conversion/accessibility impact, and collection/control response.
6. **Regulatory, connectivity, or market-access disruption:** city/service shutdown exposure, cash/refund obligations, courier/customer communication, data continuity and restart cost.

Source: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research\delivery-comparison-evidence\operations-gaps.md:300-307`.

### G3. Deferred workflow acceptance definitions

- **Scheduled booking:** happy path valid window/capacity → reminder → activation → completion. Failure/recovery: missed capacity, reschedule/cancel, stale quote, driver unavailable.
- **Merchant/partner import/export:** create/import → validate → submit → monitor → reconcile/export. Failure/recovery: row errors, partial failure, duplicate batch, permission scope, export failure.
- **Support/safety:** identify order/user → triage → preserve evidence → resolve/escalate. Failure/recovery: active emergency, abusive user, privacy request, unavailable provider, **reopened case**.

Source: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Fable 5.2 production upgrade handoff.md` scheduled booking at line 500, merchant import/export at line 506, and support/safety at line 508.

## Appendix H — continued real-device and recovery evidence

### H1. N+1 upgrade with pending command

[ran] A real versionCode **27 → 28** QA install preserved `firstInstallTime`, requestId `3e731dfd-c1a4-4439-9862-676bddaf389d`, and order **6**. The first POST committed upstream with 200 while the client received the synthetic 409. On reopening v28, the read-only receipt check recovered order 6 and cleared the pending card; no second POST occurred. **This proves command preservation and automatic recovery.** Manual Retry was not offered, so the requested manual-button variant remains **[U]**, not a failure of recovery.

- Summary: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\.expo\phone-qa-4193\device\upgrade-final-summary.json`
- Full result: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\.expo\phone-qa-4193\device\upgrade-results.json`
- Artifact verification: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\.expo\phone-qa-4193\device\upgrade-artifact-verification.json`
- v27 SHA-256: `b4258baaec7334d32963c6ed9ee4b58d8a056e46deee96a7b03957bfb32e189b`
- v28 SHA-256: `29daac05005e879b4b7763c1f86e6235a5415422b513e3b529e2280693d9b2db`

### H2. Offline cold start and denied-GPS booking

- **C-01 FAIL:** offline mode and reconnect recovery worked without duplicate bookings, but cached cold launches did **not** show the required stale/read-only saved-order summaries. Empty-order launches recovered correctly, and all six original IDs were restored.
- **C-04 required flow PASS:** denied permission and GPS-off recovery text, Settings action, and a manual Ramallah → Bireh booking were verified. One POST created order **7** with null pin fields and preserved landmarks. A later exploratory retry changed pickup to Tulkarm after permission was granted; that transition remains **[U]**, not a claimed denial-time defect.
- **X-05 PARTIAL:** cached/empty states were tested with unreachable, 503, and timeout. Waits were 20,318/20,290 ms; a synthetic-latency launch recovered in 10,562 ms without duplication. Previous-account background-location termination was not established within the customer-only scope and remains **[U]**.

Evidence root: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\.expo\phone-qa-4192\device\acceptance-c01-c04-x05\`, especially `acceptance-results.json`, `ACCEPTANCE.md`, `commands.jsonl`, `proxy-events.jsonl`, and `validation.json`.

### H3. Driver account-switch, competing drivers, and stale admin conflicts

- **D-04 PARTIAL:** offline sign-out and offline relaunch stopped the driver service and returned `driverLocation=null`; presence itself is blocked with 409 `presence_protocol_unavailable`. Exact permission-prompt/in-flight-upload races and PostgreSQL account-switch behavior remain **[U]**.
- **D-05 PASS, scoped legacy acceptance:** competing accept produced one winner; reassignment produced a new winner; stale advance was rejected and actions disappeared. Cancellation during backend outage returned 200 and the stale driver was told to refresh. Two simultaneous physical UI clients and presence-issued lease racing remain **[U]**; one competitor used phone UI, the others authenticated synthetic API calls.
- **A-06 PASS:** offline cash/dispute state remained visible, elsewhere resolution completed, and reconnected stale resolution showed the already-decided message with no false success. Final cash pending was empty and owed was zero; the elsewhere dispute resolution was visible.

Evidence root: `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\.expo\phone-qa-4192\device\acceptance-d04-d05-a06\`, especially `acceptance-results.json`, `validation.json`, and 87 command records in `commands.jsonl`.

### H4. App-level timed restore

[ran] A fresh isolated restore reached API readiness in **1.254967 seconds**, from `2026-11-14T02:29:49.9326199Z` to `2026-11-14T02:29:51.1880346Z`. It returned HTTP 200 `{"ok":true,"schema":3}`, with integrity `ok`, no FK violations, all 36 application-table row counts matching, and both zero-row legacy tables preserved. The temporary API was stopped and port 43179 was confirmed closed.

This is **app-level isolated recovery only**, not full replacement-host RTO/RPO, Caddy/cron/OSRM recovery, or a live-host baseline. Result: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\continuation\restore\timed-restore-result.json`, timing `timed-restore-timing.json`, inspection `timed-restore-inspection.json`, and post-stop check `timed-restore-post-stop-check.json` in that directory.

### H5. Current demo evidence

[ran] At `2026-11-14T05:32:24Z`–`05:32:52Z`, all five original demos passed typecheck, lint and selfcheck: **15/15 gates**. Counts/routes: Uber 806/10, Careem 30/10, HAAT 28/9, Shiply 30/7, Souq 31/8. HAAT passed 12 checks, Shiply 17 and Souq 24. README/selfcheck/Git exist in all five; HEAD/status and key-file hashes did not change. Parent validation confirmed every gate exit and log path. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\summary.json`, `validation.log`, and per-demo raw logs. Static gates do not prove device/runtime or production behavior.

## 13. Historical next-agent checklist — superseded by the final implementation brief

Work in this order. Preserve every failure and do not declare GO from a subset.

- [ ] **1. Re-establish the boundary without changing it.** Read this handoff, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\AGENTS.md`, and the latest source status read-only. Use the original dirty working tree only with explicit preservation; do not reset/rebase/commit/push. Confirm no production credential is present, no paid AWS change is authorized, and the physical `SM-A5360` is attached before any device work. Do not start an emulator.
- [ ] **2. Preserve the proven role artifacts before rebuilding anything.** Re-read `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\apks\artifact-verification.json`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\device\smoke-results.json`, `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4192\device\cash-results.json`, and `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.expo\phone-qa-4193\device\ambiguous-results.json`. Record their hashes in any new report; do not overwrite the APKs or screenshots with an unverified rebuild.
- [x] **3. Presence failure reviewed and final complete sequence passed.** The historical 200 (`deduplicated:false`) versus required 409 failure remains in `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-final-result.txt` and points to the then-current line 81. The current deterministic `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\tests\presence.mjs:80-83` fixture uses an already-expired lease, verifies exact persistence by readback, and retains the 409 `presence_expired` assertion. The final full 55494 sequence passed with that assertion; no filter or weakened assertion is claimed. This closes the remote verification review, not every production timing/interruption case.
- [x] **4. Final complete persistence result collected.** `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\persistence-55494-after-cash-fix-final-exit.json` records **exit 0 at 2026-11-14T01:50:21.7398573Z**. `persistence-55494-after-cash-fix-final.log` preserves **52 selected suites plus the legacy runner** on the identified remote source/fixture. Acceptance used the full `npm run test:persistence`, not isolated presence.
- [x] **5. Final combined remote gates completed on the identified source copy.** `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\final-gates-after-cash-fix-exit.json` records overall and every component exit 0 at **2026-11-14T01:53:03.9944577Z**. Final logs preserve typecheck, lint, audit (14 moderate + 1 low; zero high/critical), both native syntax checks and **106 integration suites**; see §5.1 for every path. The historical concurrent-load `map.test.mjs:437` failure remains recorded and is not replaced by the earlier 106-suite pass.
- [x] **6. Continuation documentation reconciled with the final remote evidence.** This handoff records final exits, suite counts, timestamps and artifact paths while retaining earlier failures and the production NO-GO boundary. The current validated copies are `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\verification\CONSOLIDATED-24H-2026-11-13.md`, `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-PILOT-READY.md` (15 PASS / 2 PARTIAL / 5 FAIL), `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-PILOT-SCOPE.md`, and `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification\docs\REA\2026-11-13-GAP-BACKLOG.md`; `report-validation-final.json` confirms zero placeholders, missing local links, or secret-pattern matches.
- [ ] **7. Finish the remaining native acceptance matrix.** Appendices H1–H3 record the completed N+1 automatic recovery, C-04 required flow, scoped D-05/A-06 passes and the C-01/D-04/X-05 failures or partials. Continue with booking interruption variants, lock/background/swipe/force-stop/reboot, network switching, push token lifecycle, Arabic/English maximum text and TalkBack; fix and rerun the failed cached-summary requirement rather than treating the scoped passes as a full matrix. Keep the backend on `adb reverse`, do not clear Chrome or app data, and record device/build/backend/network for every result.
- [ ] **8. Obtain production evidence only through the owner.** Appendix A2 records the owner’s earlier refusal. Do not make another routine credential request. Only an affirmative later owner reversal that supplies a dedicated production test account through an approved secret channel permits the journey: version 27 or its reviewed successor through customer booking → driver pickup/delivery with customer code → admin cash record → driver confirmation → both balances reconcile. Do not use sandbox credentials as production proof and do not record the credential in any report.
- [ ] **9. Close recovery and human-alert gates with owner access/approval.** With refreshed read-only SSM/EC2/CloudFormation/CloudFront/RDS/SNS access, capture non-secret env keys, live dialect/schema, running digest/revision, row counts and log/alarm config; never print `/srv/wind-api.env`. Run a timed replacement-host restore with operator, backup time, RTO/RPO, row/money/custody reconciliation and session behavior. After the owner chooses a destination/spend posture, deliberately fail a synthetic backup freshness check and prove a named human receives and acknowledges it. No agent-paid resources.
- [ ] **10. Keep source lineage and distribution honest.** Reconcile the dirty local line with canonical master only through the owner's Git/release process. Require candidate CI `verify`, `persistence`, and `image` green on the exact candidate, then verify running digest/revision and signed APK identity separately. Test stable APK hosting, `EXPO_PUBLIC_UPDATE_URL`, `WIND_MIN_CLIENT_BUILD`, and an old-build forced update. Preserve CloudFront until an owned-domain migration covers installed apps and old tracking links.
- [ ] **11. Implement only the accepted product sequence, with tests first.** A11 immutable door-collected amount/variance, A13 versioned notification channels, A12 parcel priority, A14 alarm re-arm, then A5 shift/ready queue/custody model; make every deferred capability visibly disabled. Keep A1/A8/A2/A6/A15 dialect-dependent work for Option A, and do not activate payments, rides, freight or automatic dispatch. Treat the native C++ edits as QA-harness work and separately verify any production-build linkage need.
- [x] **12. Recheck all five demos from files and fresh static runs.** At `2026-11-14T05:32:24Z`–`05:32:52Z`, all 15 declared typecheck/lint/selfcheck gates passed. HAAT passed 12 checks, Shiply 17 and Souq 24; all five have README/selfcheck/Git and unchanged key hashes and Git HEAD/status. Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\summary.json`. Device journeys remain open; do not infer runtime behavior from static checks or shared `node_modules` junctions.
- [ ] **13. Final report remains NO-GO unless every applicable gate is green.** State the exact full-persistence and final-gate results first, then production auth, recovery/human alert, update path and product acceptance. List unrun items as **[U]**, retain all historical failures, and make no production deployment, production migration, payment activation, paid AWS change or Git mutation without the required explicit owner approval and reviews.
