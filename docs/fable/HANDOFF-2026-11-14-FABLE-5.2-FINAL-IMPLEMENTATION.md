# Wind / Fastship — final Fable 5.2 implementation brief

**Date:** 14 November 2026  
**Status:** resumed implementation in progress; **production remains NO-GO**  
**Purpose:** the single connected continuation point for the next agent. Historical reports are evidence, not competing instructions.

**15 November continuation:** see [the active implementation checkpoint](verification/CONTINUATION-2026-11-15.md). The interrupted admin-review slice is now implemented and its focused tests, both typechecks and lint pass on DESKTOP-S2JKMK5. This does not close the remaining connected task graph below.

## 1. Execution root, precedence and prohibited actions

1. **Work only in the preserved verification worktree:**
   `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification`
2. Actual `HEAD` is **`b60922952d607f698eee24b9c68ac3394daecd3c`, detached**, with extensive pre-existing modified/untracked files. It is not a clean release candidate.
3. `origin/master` at `b89f2205965523b5ab8545dff3940d1eacb6062c` is a comparison reference only. The original root at `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship` is a different stale/dirty line and must not overwrite this source.
4. **No reset, rebase, clean, commit, push, deploy, production migration, payment activation, paid resource creation, or data deletion without explicit owner approval.** Those actions were not taken in this mission.
5. Before candidate construction, the owner/release lead must capture a complete relevant tracked/untracked inventory and hashes and create a reviewed release candidate from that exact file set. The selected manifest in this package is **not complete release provenance**.
6. Read worktree `AGENTS.md`. Physical UI acceptance uses only `SM-A5360` / `R5CTB0FJP9Z`; no emulator. Keep test traffic on `adb reverse`. Never clear phone app data or Chrome, and never touch production package `ps.wind.app` during QA.
7. **Dialect:** Option C now (narrow SQLite pilot), Option A next (separately rehearsed PostgreSQL cutover), Option B ruled out. Do not activate rides, freight, automatic dispatch, payments, RDS or multi-instance scaling as a side effect of another task.
8. **Production credential refusal:** the owner previously declined the production-credential request. Do not make another routine request or login attempt. Only an affirmative later owner reversal, with a dedicated production test account through an approved secret channel, permits that journey. Never record the credential in evidence.

### Execution environment

- Existing local-fallback results are accurately labelled history. They do not close fresh candidate verification or any **remote-only** gate.
- **All future tests and heavy builds** must use **`DESKTOP-S2JKMK5`**, one job at a time. The current clean synchronized workspace is **`D:\wind-verify-20261113\src3`**; `src2` is preserved historical state. If SSH fails, verification is blocked; do not run locally and do not claim a remote pass. Documentation-only inventory, link and hash checks are not product test/build evidence.
- Working SSH configuration: user `pc gaming`, host `DESKTOP-S2JKMK5`, identity file `~/.ssh/smartstore-runner` (private key never enters the repo). The `k5` alias currently points to an old refused IP, so use this explicit host/account/key with strict host-key checking:

```bash
ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
    -o HostKeyAlias=desktop-s2jkmk5 -i ~/.ssh/smartstore-runner \
    "pc gaming@DESKTOP-S2JKMK5" "cd /d D:\wind-verify-20261113\src3 && <one gated command>"
```

- SSH connectivity and the remote Node 24.12.0/npm 11.6.2 toolchain were verified on 14 November 2026. Earlier `osama`/`id_rsa` refusals are historical attempts, not the current access path. **Future tests and heavy builds must run on `DESKTOP-S2JKMK5`; unavailable SSH leaves verification blocked. Do not run new test/build jobs on this PC.** Historical local-fallback results remain accurately labelled evidence and never substitute for fresh remote verification.

## 2. Current verified baseline

| Area | Current result and boundary |
|---|---|
| Integration | **109 selected suites passed**: 100 selected `.test.mjs` + 9 other `.mjs`. **102 test files on disk** = those 100 plus two PostgreSQL-only exemptions. |
| Full persistence | **PASS**, 52 selected suites plus the legacy PostgreSQL runner, on fresh disposable PostgreSQL 18.3 / PostGIS 3.6 at `127.0.0.1:55475`. |
| Static gates | `npm run typecheck`, `npm run lint`, `npm run check:audit`, `git diff --check` pass. Current audit: **13 moderate + 1 low**, zero high/critical, `rejected: []`. |
| PostgreSQL contracts | 90 installed + 80 additive endpoint boundaries, 21 transitions, 174 exchanges, readiness schema 30. |
| Import/restore | Older v3 snapshots without `order_command_rejections` and current snapshots with terminal rejections import; `pg_dump`/`pg_restore`, reconciliation and HTTP parity pass. |
| Physical QA, v29 | All-role smoke; five translated admin tabs with Settings → Account → Back; 300-cent cash handover reconciled to zero; forced post-commit 409 recovers **order 4** with the same requestId and receipt. |
| Independent reviews | Codex `gpt-6.1-sol` at high effort and Kimi `kimi-k3.1-pro` closed all reported P1/P2 issues. Handoff-readiness findings are separate from code findings and are addressed in this brief and linked documents. |
| Execution location | **LOCAL FALLBACK** for the recorded runs. Preferred remote SSH is refused; no remote-only completion is claimed. |
| Production | **NO-GO.** No authenticated production journey, human missed-backup alert, replacement-host recovery, complete update distribution, or full product/field acceptance. |

Evidence root: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\`.

The readiness scorecard is a **22-criterion subset**, not a production-GO definition. Current subset score: **15 PASS / 2 PARTIAL / 5 FAIL**, including two documented zero-row schema exceptions preserved by decision. The remaining release blockers are in this brief.

## 3. Completed implementation — excluded from the work queue

- Booking replay locks before cap/quote validation and reauthorizes after lock waits. At the cap it returns the original order with HTTP 200; a revoked session gets 401, not private replayed data.
- Quoted and legacy creation revalidate authority before insertion.
- Only `quote_expired` and `promo_used` become durable terminal rejections. Success wins over rejection, changed-payload keys conflict, and missing receipts remain unknown. The foreground reconciles immediately.
- SQLite partner creation is atomic; rejected scope/reference writes leave no order. Partner replay occurs under the customer lock before cap validation.
- PostgreSQL migration 30 adds terminal rejections and repairs `immutable_cash`. Older v3 snapshots may omit the table; present rows import/reconcile normally.
- `/api/ready` requires migration 30 while preserving the 3–21 migration-count check. The additive contract includes booking receipts and delete challenge.
- Admin keeps five translated tabs; account/cash remain reachable through Settings/direct URLs.
- N+1 v27→v28 preserved a pending command and automatically recovered order 6. Manual Retry remains **[U]**.
- C-01 is still **FAIL as acceptance**, but `phoneTest` bypasses normal saved-summary recovery. Ordinary sign-in behavior remains **[U]**.
- D-04/X-05 are partial. D-05/A-06 are scoped sandbox passes only. The 300-cent handover is not A11 variance. The 1.254967-second app-level restore is not replacement-host RTO/RPO.

Full issue/change/proof ledger: [REVIEW-FIXES-2026-11-14.md](verification/REVIEW-FIXES-2026-11-14.md).

## 4. Connected task graph

Legacy IDs are shown in parentheses where needed. Do not infer dependencies that are not listed. Each output must include evidence and an explicit failure/unknown result when acceptance cannot run.

### Source and scope gates

| Node | Depends on | Output and acceptance contract |
|---|---|---|
| **SRC** | Current worktree | Complete relevant tracked/untracked inventory and hashes; selected manifest marked as a checkpoint only; current/historical separation; legacy-ID mapping. No candidate claim until this inventory exists. |
| **VERIFY** | `SRC`, authorized `DESKTOP-S2JKMK5` access | Exact source synchronized; `typecheck`, `lint`, `audit`, integration, persistence, contracts and `git diff --check` run remotely with evidence. PostgreSQL cases demonstrably execute—no hidden `SKIP`. Record host, key configuration, source identity and exits. SSH refusal leaves this node blocked. |
| **SCOPE** | `SRC`, unresolved scope decisions | Twelve deferred capabilities visibly disabled/absent rather than surprise 409s. Explicit dispositions for narrow-A11, shift/custody and deferred activation. No hidden activation. |

### UX corrections before broader acceptance

| Node | Depends on | Output and acceptance contract |
|---|---|---|
| **UX-01 — ordinary-sign-in offline recovery** | `SRC` | Reproduce C-01 through ordinary sign-in, not `phoneTest`. Require role-safe labelled read-only/stale saved orders with mutations disabled and reconnect without duplicates. If the defect does not reproduce, record that result instead of patching blindly. |
| **UX-02 — admin money review/parsing** | `SRC` | Final confirmation names driver, signed amount and action for remittance/adjustment; settings/subscription/role edits have concise review. Replace `Math.round(typedNumber(text) * 100)` with string-to-minor parsing. Two similarly named drivers plus timeout-after-commit yield one correct ledger entry/reference. Preserve approval and append-only rules. |
| **UX-03 — accessible pin selection** | `SRC` | Coordinate readout/edit or an address-driven equivalent plus TalkBack/switch/keyboard-usable zoom controls; no drag/current-location requirement. Verify Arabic and English on the physical phone. |
| **UX-04 — large text and offline accessibility** | `SRC` | Rework proof-code groups, price rows, fixed footers, driver actions and admin rows before raising the 1.35 cap toward 2.0. Verify no clipping/overlap in Arabic/English, including order detail and cash remittance. Keep a working reduced-motion/layout fallback. |
| **UX-05 — driver support and multi-recipient behavior** | `SRC` | Expose last accepted fix, last server acknowledgement, foreground-service state and next retry. Several recipients prove next-stop/proof/cash association, return/reattempt and earnings after reconnect. |

### Product tasks with explicit scope and inputs

| Node | Depends on | Output and acceptance contract |
|---|---|---|
| **PROD-01 — A11 door cash/variance** | `SCOPE`, [approved narrow-SQLite amendment](verification/OWNER-DECISIONS-2026-11-14.md) | Immutable expected and door-collected minor units plus the approved six-value variance vocabulary. Under- and over-collection require a compatible reason; discount/negative adjustment retains independent approval and append-only semantics. Migration, role boundaries, duplicate replay, old-snapshot import and reconciliation pass. Source preparation is not production activation. |
| **PROD-02 — A13 notification channels** | `SCOPE`; no native-push activation | Per-event versioned channels recreate changed definitions instead of silently reusing them. Version bump creates a new channel and old channel is unused. Token lifecycle/logout/multi-device tests pass; provider delivery remains **[U]** until proven separately. |
| **PROD-03 — A12 priority** | `SCOPE`, [approved policy](verification/OWNER-DECISIONS-2026-11-14.md) | `standard`/`same_day` parcel attributes only. Same-day uses the Asia/Jerusalem 12:00 cutoff, zero surcharge and existing capacity without reservation. Existing orders remain standard; no state-machine fork. Quote/replay identity, customer/partner paths and boundary tests must agree. |
| **PROD-04 — A14 alarm re-arm graph** | `SRC`, source deadline inventory completed | Preserve the 300 m/120 s arrival fence and five-minute waiting grace, driver-command creation/expiry and assignment fences, and next-fresh-fix recovery. Do not invent timed proof unlocks or guaranteed background delivery. Re-arm only durable recovery/retry deadlines through BOOT, USER_UNLOCK, TIME_SET, TIMEZONE_CHANGED and PACKAGE_REPLACED, with duplicate/cancel/logout/reassignment fences. Receiver and physical reboot/time-change gaps require device proof. |
| **PROD-05 — A5 shift/ready queue/custody** | Option A rehearsal and [approved minimal model](verification/OWNER-DECISIONS-2026-11-14.md) | One active shift per approved driver with explicit start/end and existing vehicle assignment. Each parcel order is one custody unit; no item-level custody, vehicle QR or automatic dispatch. Queue/list/claim requires active shift, one atomic winner, per-order append-only replay-safe history and reconnect/role/conflict tests. Implementation/activation still waits for Option A. |
| **PROD-06 — typed delivery failures** | `SCOPE` | A complete typed delivery-failure taxonomy, separate from cash variance and safety incidents, with reason and next action. No generic failure label or free-text-only state. Each type has a recovery path and acceptance test. |

### Maps and location, before field calibration

| Node | Depends on | Output and acceptance contract |
|---|---|---|
| **GEO-01 — reproducible routing** | `SRC`, approved source/licences | Pin the OSM extract date/checksum and record graph/profile versions in responses. Quarantine the unclipped OSRM Dockerfile. Rebuild twice and compare the graph checksum and selected route outputs. Road legality is not inferred from geometry. |
| **GEO-02 — map/network measurement** | `SRC`, no provider switch required | Measure cold/warm first tile/readiness on real networks and enforce a page-weight budget. Only then compare owner-approved alternatives to OpenFreeMap. Do not scrape restricted data or change providers merely for appearance. |
| **GEO-03 — locations people already have** | `SRC`, allowlists/timeouts | Accept coordinate pairs, allowlisted Google Maps URLs and Plus Codes, showing the parsed point for confirmation. Short links resolve server-side with host allowlist/timeout. Never book an unconfirmed point. |

Only ETA/economics calibration depends on completed trips. Do not invent fare/ETA/courier-cost calibration data. A domain is an owner-spend decision; preserve CloudFront until apps and existing tracking links migrate.

### Physical acceptance

| Node | Depends on | Output and acceptance contract |
|---|---|---|
| **PHONE** | Applicable fixes, QA builds, physical A53 | Remaining C/D/A/X cases with device/build/backend/network per result: manual-sign-in C-01, interruptions, lock/background/swipe/force-stop/reboot, connectivity changes, denied GPS, notification tokens, Arabic/English max text, TalkBack and memory pressure. Preserve scoped passes and every failure/[U]. Two-role parcel handover with keyboard open is required after navigation/sheet changes. |

### Operations — two independent evidence tracks

| Node | Depends on | Output and acceptance contract |
|---|---|---|
| **OPS-01 — live baseline** | Owner read-only host access | Record non-secret dialect/staging classification, variable presence (never URL values), running digest/revision, schema, row counts, SG/distribution and log/alarm config. **Never print `WIND_DATABASE_URL`, `/srv/wind-api.env`, or full environment values.** Exact live values replace [U]. |
| **OPS-02 — replacement recovery** | `OPS-01` | Restore newest backup to an isolated replacement host with continuous writer-freeze discipline. Record backup time, operator, elapsed RTO, observed RPO, image revision, row/money/custody reconciliation and session behavior. API and data are compatible; old backup is preserved. |
| **OPS-03 — human alert** | Owner-approved destination/spend; independent of `OPS-02` except for final GO | Configure backup-age/failure and public-readiness alarms with a confirmed destination. Induce a synthetic missed-backup/API failure and prove a named human receives and acknowledges it. An alarm’s existence is not delivery proof. |

### Release and production

| Node | Depends on | Output and acceptance contract |
|---|---|---|
| **REL** | Applicable `VERIFY/UX/SCOPE/PRODUCT/GEO/PHONE` gates; owner Git approval | Exact reviewed candidate and green CI. Signed compatible APK with new version ID; bundle contains CloudFront once and retired Azure zero. Stable HTTPS hosting, `EXPO_PUBLIC_UPDATE_URL` and compatible `WIND_MIN_CLIENT_BUILD`. An old build reaches the update screen and downloads the new artifact; known-good rollback preserved. |
| **PROD** | `REL`, compatible verified server, explicit approvals/reversal | Verify running server revision/digest and client compatibility before the journey; any required deployment is separately owner-approved. Run customer booking → driver pickup/delivery with customer code → admin cash record → driver confirmation. Record order ID, roles, timestamps, amounts, APK SHA, build ID and server revision. Sandbox evidence is not production proof. |
| **GO** | All applicable nodes, accountable owner | Explicit launch decision only after the complete applicable gate set. Review closure, green tests, installation or an alarm’s existence never independently implies GO. |

## 5. Option A rehearsal chain — separate from the SQLite pilot

1. Validate runtime/config compatibility and an absolute persistent data path; a URL alone is not a deployment plan.
2. Apply migrations **3–23 and 25–30**; version 24 is intentionally absent and must not be renumbered. Readiness requires 30.
3. Import both older v3 snapshots and current snapshots with terminal rejections; reconcile row/money/custody totals and `pg_dump`/`pg_restore`/HTTP parity.
4. Use a continuous writer freeze through cutover validation. `--freeze-writes` alone ends too early.
5. After the first authoritative PostgreSQL write—including sign-in, smoke or worker writes—recover forward. Do not roll back to stale SQLite.
6. Serialize deploy/watchdog activity with a real mutex such as `flock`. Payment activation remains a separate owner decision with its complete settlement test matrix.

## 6. Failure lessons Fable must retain

- A correct replay returns the committed order, not `409 quote_consumed`. The old 409 was the reproduced defect.
- Lock timeout 503/`55P03` is not success. `WIND_TEST_POSTGRES_LOCK_TIMEOUT_MS` is isolated-test-only; production default is 500 ms.
- Null receipts are never absence. No elapsed-time absence, `sentAt` commit proxy or timed release of unknown commands.
- `phoneTest` bypasses saved-summary recovery. Ordinary C-01 must use ordinary sign-in before any product fix.
- Do not edit generated `android/` or `ios/`; use config/plugins. The C++ changes are scratch-QA only, not an upstream production patch.
- Do not run new Gradle/test jobs on this PC. On `DESKTOP-S2JKMK5`, keep one job at a time. Earlier local OOM, Node allocation and map timing failures were resource-sensitive historical evidence, not generic app flakiness.
- Respect proxy ownership: 4193 belongs to an older acceptance proxy and was not stopped. The new forced-409 uses 4194 → 4192.
- Default QA versionCode 1 cannot upgrade installed version 28. Version 29 was required; no app data was cleared.
- Distinguish current results from historical evidence. Do not copy old suite counts or “DONE” labels without their tree/run.

## 7. Verification commands and expected current counts

Synchronize the exact inventoried source to `D:\wind-verify-20261113\src3` on `DESKTOP-S2JKMK5` and run every command below there, one job at a time. **Do not run these product test/build commands on this PC.** If SSH remains unavailable, record `VERIFY` as blocked. Documentation-only hash/link validation does not count as product verification.

```bash
npm run typecheck                 # app + server TypeScript, exit 0
npm run lint                      # Expo lint, exit 0
npm run check:audit               # current raw 13 moderate + 1 low; rejected: []
npm test                          # 109 selected suites
npm run test:persistence          # 52 selected suites + legacy runner, loopback PostgreSQL required
node tests/pg-contracts.mjs       # 90 installed + 80 additive, schema 30
node tests/pg-import.mjs          # old/current snapshots + dump/restore + HTTP parity
git diff --check                  # no whitespace errors
```

Physical scripts: `scripts/check-admin-tabs.mjs`, `check-native-cash.mjs`, and `check-native-ambiguous.mjs`. Use `WIND_AGENT_DEVICE` from `device_open` on the physical A53. Never substitute an emulator or direct adb UI while agent-device is active.

## 8. Evidence and knowledge map

### Current implementation and proof

- [Review fixes and current evidence](verification/REVIEW-FIXES-2026-11-14.md)
- [Structured final gate results](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/continuation/current-source-static-gates/result.json)
- [Selected-file source/hash checkpoint](verification/SOURCE-MANIFEST-2026-11-14.json) — 35 selected files, **not full release provenance**
- [Complete initial tracked/untracked inventory](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/current-remote/full-source-manifest.json) — 1,031 files; remote `src3` verified with zero mismatches/extras before subsequent implementation edits
- [Full continuation/history index](HANDOFF-2026-11-14-FABLE-5.2-VERIFIED-CONTINUATION.md)
- [Consolidated research/evidence report](verification/CONSOLIDATED-24H-2026-11-13.md)
- [Pilot readiness subset scorecard](REA/2026-11-13-PILOT-READY.md)
- [Pilot scope](REA/2026-11-13-PILOT-SCOPE.md) and [dialect ADR](REA/2026-11-13-DIALECT-ADR.md)
- [Gap backlog and acceptance criteria](REA/2026-11-13-GAP-BACKLOG.md)
- [Owner-approved A11/A12/A5 implementation decisions](verification/OWNER-DECISIONS-2026-11-14.md)

### Physical artifacts

- [Version-29 role artifact verification](../.expo/phone-qa-4192/apks-final-review-29/artifact-verification.json)
- [All-role smoke](../.expo/phone-qa-4192/device/smoke-results.json)
- [Five-tab admin navigation](../.expo/phone-qa-4192/device/admin-tabs-results.json)
- [Cash reconciliation](../.expo/phone-qa-4192/device/cash-final-results.json)
- [Forced post-commit 409 recovery](../.expo/phone-qa-4194/device/ambiguous-results.json)
- [N+1 automatic pending-command recovery](../.expo/phone-qa-4193/device/upgrade-final-summary.json)
- [App-level timed restore](C:/Users/osama/AppData/Local/Temp/opencode/fastship-verification-20261113/continuation/restore/timed-restore-result.json)

### Canonical AWS operational sources

These are canonical source references at `b89f220`, not live-host readback:

- `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\aws\wind.yaml`
- `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\vm\deploy.sh`
- `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\vm\wind-backup.sh`
- `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\vm\wind-restore.sh`
- `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\infra\vm\wind-watchdog.sh`
- `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\docs\operations\deploy.md`
- `C:\Users\osama\AppData\Local\Temp\opencode\wind-baseline-b89f220\docs\operations\restore.md`

### Dated research — use selectively, not as current status

- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Fable 5.2 production upgrade handoff.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\.claude\worktrees\leftover-tasks-4716c1\docs\HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Fable 5.2 production upgrade handoff\`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\PALESTINIAN-COMPETITORS-INDEX.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Wind verified research atlas.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Competitor feature implementation atlas.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Delivery comparison master evidence.md`
- [Competitor thread and demo-repository inventory](verification/COMPETITOR-THREAD-INVENTORY-2026-11-14.md) — Sol’s redacted, dated map of all five apps, proofs, current gaps, reusable mechanisms and archive exclusions
- [Complete 20-thread archive index](C:/Users/osama/OneDrive/Documents/wind-competitors/other-session-archive/INDEX.md) — 2,353/2,353 validated activity items, narrowly redacted
- [Merged Fable mission addendum](C:/Users/osama/OneDrive/Documents/wind-competitors/FABLE-MISSION-ADDENDUM.md) and [current demo build ledger](C:/Users/osama/OneDrive/Documents/wind-competitors/LEDGER.md) — newer source/APK identities and current demo evidence

The original-demo harness records **15/15 local package gates passing**, including Souq’s 24 earlier selfchecks. It predates the APKs and later Maps/API/persistence work. The five installed APKs are verified older demo artifacts; newer source is uncommitted and has no newer build or phone acceptance. This is not runtime/device or production behavior. See the inventory and `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\summary.json`. The exposed Maps credential and signing material are redacted and require owner rotation; do not archive the sensitive paths listed in the inventory.

A later additive merge now records newer clean build candidates, signed/installed APKs and passing source gates for all five demos, with the new identities preserved in the inventory and ledger. Those are current local-demo results, not production evidence. WindRide now launches, but logcat proves an Android-restricted-key authorization failure and blank tiles. The owner must enable Maps SDK for Android and whitelist all five release package/certificate pairs listed in the inventory and current ledger (or rotate the key and rebuild). A console-only change needs no rebuild; fresh tile screenshots remain required after propagation.

## 9. Required report-back format

For each task report **issue → exact change → exact command/result/host → source candidate → remaining gate**. Put bad news first. Preserve every failed, unrun, partial or flaky result; never silently replace it with a later pass.

Do not report production readiness from unit tests, sandbox trips, source review, installation alone, review closure, or green CI alone. Production GO requires every applicable gate above, including compatible server identity, authenticated journey, human alert, replacement recovery, update path and remaining product/field acceptance.
