# Wind execution ledger — 10 November 2026

**Phase 0 remains open.** This is the consolidated queue, not a launch-readiness claim.
The [baseline](PLAN-2026-11-10-BASELINE.md) records commands, source and runtime evidence;
the [master plan](PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md) defines phase order and gates.

Terra's static review reconciled all 45 original rows against their cited documents at
`f6fd6fff85fe3fa76bf57a90ed9201567f9e73b3`, added rows 46–47, and compared the late Opus
draft with the merged plan. The lead integrates that review here, with subsequent runtime
evidence and row 48. Historical source anchors below refer to that candidate, before this
documentation update. **S** = source inspected; **C** = carried historical claim, not newly
proved; **R** = executed evidence in the baseline. Severity does not waive a phase's exit gates.

The owner delegated recommendations to the lead. Ordinary choices below no longer wait for
another preference interview. Actual credentials, contracts, legal/field evidence and specific
paid-resource, migration, activation and data-deletion authorizations remain prerequisites.

## One queue

| ID | Item and evidence | Severity / phase | Current disposition and next acceptance |
|---|---|---|---|
| 1 | Current-candidate baseline; master plan §7, CURRENT-WORK.md | launch blocker / 0 | R: G0–G1, six browser suites including corrected Tulkarm, 96 screenshots and final five-check physical Chrome pass recorded. Verified-source replacements installed; native acceptance remains open. Independent review completed after the lead takeover. |
| 2 | Production/script inventory; operations/deploy.md | launch blocker / 0 | R: readiness, image digest/revision, environment key names, OSRM, backup and all four installed script hashes verified. Inventory does not replace a restore drill or alert-delivery test. |
| 3 | Contradictory guidance; implementation/test-harness.md, PILOT.md, operations/deploy.md | launch blocker / 0 | S/R: corrections drafted for isolated resources, staging access, conditional recovery, permitted roads, service gates and installed scripts. Factual review by Claude Haiku 5.5 completed; findings fixed in this batch. |
| 4 | Cloud inventory and complete costs; operations/cost-model.md | launch blocker / 0–3 | R: Azure PAYG, zero credit, resources, actual spend, compute quotas and PostgreSQL rates inspected. PostgreSQL quota and complete operating estimate remain open. AWS queries failed with expired session. |
| 5 | Immutable release provenance; infra/vm/deploy.sh, master plan §6 | launch blocker / 1 | S: `infra/vm/deploy.sh` now pulls and runs the recorded digest and verifies its revision before the backup or switch; `tests/deploy-script.test.mjs` covers a moved tag, malformed references and each rollback (CI only: it needs `sh`). Open: install the reviewed script on the VM and compare hashes before any application release. |
| 6 | External outage detection; operations/incident-and-degraded-mode.md; C: 5 Nov handoff | pilot risk / 1 | Choose owner as alert recipient and a minutes-level outside check. Prove receipt. Hourly GitHub success is not delivery evidence. Investigate the carried failed Railway-backup task without altering the owner's task. |
| 7 | Two independently restorable copies; operations/restore.md, master plan §9 | launch blocker / 1 | Azure upload verified; restore both clouds in isolated drills. AWS encrypted versioned backup with write-new-only VM access waits for authenticated inventory, costs and resource authorization. |
| 8 | Retention/privacy/RPO/RTO; operations/restore.md:55–57 | pilot risk / 1 | Preserve current backups during baseline. Choose retention after timed restore and legal retention review; historical deleted-account data must be addressed. No deletion policy applied. |
| 9 | Replacement-host recovery; operations/restore.md:27–44,53 | launch blocker / 1 | Rehearse credentials/config, graph, proxy, cron and Blob access; reapply blocks/deletions and require reauthentication. Historical 12-second two-user/no-order restore is not full recovery evidence. |
| 10 | Maps 1: missed Confirm; maps handoff §4.1 | pilot risk / 1 | Reproduce immediate physical-phone taps, then fix proven cause. Acceptance: 0 misses/20 immediate taps and a regression test failing without the fix. Earlier delayed taps do not satisfy this. |
| 11 | Maps 2: slow data; maps handoff §4.2 | pilot risk / 1 | A53 cold/warm drawing, ready and bytes at Slow 3G and 400 kbit/s in Nablus, Ramallah and Jenin; verify compression/cache, then establish budget and regression check. |
| 12 | Maps 3: tile-host dependency; maps handoff §4.3 | pilot risk / 1 | Select monitoring of existing OpenFreeMap first; add provider-failure procedure. Self-host/fallback needs measured capacity, terms and complete cost. No provider switch inferred from delegation. |
| 13 | Maps 4: raw-GPS car drift; maps handoff §4.4 | pilot risk / 1 | Nearby route projection with true accuracy halo; preserve real wrong turns, mirror math helpers, unit check plus phone evidence. |
| 14 | Maps 5: empirical ETA; maps handoff §4.5 | pilot risk / 1 | Report real completed-trip sample size and promised/actual errors. Retain estimate when evidence is insufficient; no invented calibration. |
| 15 | Maps 6: pin/label collision; DESIGN-AUDIT-2026-11-09.md:52–56 | backlog / 1 | Before/after Arabic and English phone evidence; coordinate with measured style work. |
| 16 | Maps 7: misleading capture; maps handoff §4.7 | backlog / 1 | R: baseline confirms tall map captures and missing road fixtures. Capture one viewport and a deterministic road fixture, then refresh docs/screens. |
| 17 | TalkBack/nonvisual pin adjustment; PILOT.md; C: 5 Nov handoff | launch blocker / 1 | A person listens to signup, booking, tracking and driver flow. Design/validate nonvisual adjustment; current search-only limit is not accessibility proof. |
| 18 | Field/device evidence; C: 5 Nov handoff; master plan G5 | pilot risk / 1 | Verified-source two-role trips with handover keyboard, actual Samsung Arabic digits, far-pickup GPS, real roads/3G and notifications. Local sandbox trips do not prove production delivery. |
| 19 | Verified email/recovery; server/main.ts:747–751,852–875; provider-failures.md | launch blocker / 4 | Obtain sending-domain/provider access and prove mailbox delivery and verification. Cloudflare verification and Firebase reset fallback are separate configurations; historical Gmail receipt is insufficient. |
| 20 | Verified phone/carrier support; provider-failures.md:27–28; C: 5 Nov handoff | launch blocker / 4 | Obtain actual SMS contract/credentials and test deliveries. Confirm +970/+972 coverage and prefixes with primary operator evidence. |
| 21 | Legal/commercial review; PILOT.md; master plan §7 Phase 4 | launch blocker / 4 | Obtain qualified review of operations, privacy, retention and driver/customer arrangements. No completion evidence exists. |
| 22 | Support-reset safeguards/alerts; provider-failures.md; C: 5 Nov handoff | pilot risk / 1–4 | Verify current support attestation, admin-known temporary password, forced-change behavior and subscription removal. Communicate actual recovery path; see row 48. |
| 23 | Authorization matrix/staff scope; master plan Phase 2; C: 5 Nov handoff | launch blocker / 2 | Route × role coverage, demotion/limited staff checks, public rate limits and dependency audit. Existing narrow checks do not establish complete coverage. |
| 24 | Audit/privacy history; C: 5 Nov handoff; operations/restore.md | pilot risk / 1–2 | Inspect active-backend scope of old unaudited actions, reset notes, optional identity rows and phone_audit retention without exposing personal data. |
| 25 | Cash adjustments/remittances; operations/cash-controls.md | pilot risk / 1–3 | Verify T23–T25 per active backend: distinct approver, immutable audit, atomic execution, races/restart and evidence-based recovery. Policy text is not implementation or physical-cash proof. |
| 26 | Parcel custody/far pickup; HANDOFF-2026-11-05-NEXT-LEAD.md:211,218 | pilot risk / 1 | Validate blocked-courier handling and cancellation after physical handover; calibrate actual GPS. Do not assume the 1 km threshold is proven. |
| 27 | Permitted roads/checkpoints; maps handoff §2; C: 5 Nov handoff:142–145 | pilot risk / 1,5 | Obtain operating area and driver permit/plate evidence, then validate routing profile. A sandbox crossing does not establish production behavior or legal access. |
| 28 | Flat fare/courier viability; C: 5 Nov handoff; master plan §10 | pilot risk / 1,4 | Retain pilot fare while collecting actual route costs and courier supply; validate earnings staleness. Do not substitute an invented distance formula for market evidence. |
| 29 | API reliability/contracts; master plan Phase 2 | launch blocker / 2 | Every client-called route, stable bilingual codes, idempotent retries, real 500s/request IDs and release p95. Extract only route families a batch already touches. |
| 30 | Design tokens/responsiveness; master plan §§7–8 | launch blocker / 2 | Audit actual drift, 48 dp targets, contrast, RTL, 130% text, landscape and reduced motion on phone. Zero/flex literals are not automatically drift. |
| 31 | Search service hint; DESIGN-AUDIT-2026-11-09.md:57–58 | backlog / 1–2 | Keep existing later service choice unless observed confusion justifies a small hint. |
| 32 | Parcel tile wrapping; DESIGN-AUDIT-2026-11-09.md:59–60 | backlog / 1–2 | Evaluate copy/layout at actual width; do not assume three content-width tiles fit at 390 pt. |
| 33 | Concurrent booking/acknowledgement; C: 5 Nov handoff | pilot risk / 1–2 | Phone lost-response recovery, actual two-tab contention, reschedule last-write-wins and cancellation notification race. Earlier untriggered tests are not proof. |
| 34 | Expired PostgreSQL price display; C: 5 Nov handoff:187 | backlog / 3 | Verify requote UX after cutover; stale displayed price is not evidence an expired fare was charged. |
| 35 | PostgreSQL hosting/version; operations/deploy.md, cost-model.md | launch blocker / 3 | Select managed General Purpose for public-launch planning, subject to costs/quotas and approval. Rehearse selected major/PostGIS/TLS/transactions; template 16 versus test 18 remains unresolved. |
| 36 | Production importer/parity; server/migrate.ts; operations/restore.md | launch blocker / 3 | Implement reviewed production TLS/destination path; never bypass test flags. Three rehearsals with counts, money, orders/sessions and exclusions. Snapshot-only --freeze-writes does not keep SQLite frozen through import. |
| 37 | Cutover/worker/rollback; server/migrate.ts; infra/vm/deploy.sh | launch blocker / 3 | Continuously stop SQLite writers. Distinguish controlled import/setup from first new authoritative PostgreSQL write, including sessions, smoke or worker writes. After that, recover forward; never re-import stale SQLite over history. Two-vendor post-write failure drill. |
| 38 | Update gate/distribution; operations/deploy.md; server/domain/runtime-readiness.ts:41–46 | launch blocker / 4 | Choose existing signed APK distribution initially. Verify HTTPS update URL and install-over-old before minimum-build enforcement. Headerless/non-integer build values do not establish universal forced updates. |
| 39 | Public support/operating readiness; incident-and-degraded-mode.md; master plan Phase 4 | launch blocker / 4 | Reachable named support, incident coverage and 50→200→open go/no-go; recent restore and alert delivery required. |
| 40 | Staging graph/network/provider readiness; operations/deploy.md:62–86 | launch blocker / 3, conditional | Prove packaged worker, private connections, durable OSRM companion files/checksums, DNS, quota and representative route corpus before staging activation. Empty share/template compilation is insufficient. |
| 41 | Optional Entra/Google activation; provider-failures.md; C: 5 Nov handoff | backlog / conditional | Remain disabled pending real tenant/provider, restricted keys, geography, quota, cost and physical acceptance. Synthetic identity tokens are insufficient. |
| 42 | Rides/dispatch/boarding; master plan Phase 5; eligibility.ts, ride-lifecycle.ts | launch blocker / 5 | Public parcels and PostgreSQL first. Review/authorize each activation separately; native ride, permitted roads, empirical ETA and staffed safety path. Database/service flag alone enables neither dispatch nor boarding. |
| 43 | Freight/payments/refunds; operations/restore.md, provider-failures.md | backlog / later | Remain off. Licensed provider/contract, signed webhook and settlement proof; reconcile old rejected refunds to statements before payments capability. |
| 44 | Israel/native iOS; maps handoff §4 Later | backlog / later | Validate geography, rebuilt graph/place index and own physical iOS acceptance. Preserve documented Hebrew-label limitation. |
| 45 | Request-level observability; master plan Phase 1 | pilot risk / 1 | S/R: an unexpected 5xx now returns the logged correlation id as `reference` and the client shows its first eight characters after the error text; `tests/database-logging.test.mjs` ties it to the log line (fails without the change). Open: logs are still plain container output with no retention or search, and three background fetches that bypass `request()` show no reference. |
| 46 | PG destination-change parity; tests/pg-contracts.mjs:308–309; destination-change.ts:62–67; server/main.ts:306 | launch blocker / 3 | S: the routes follow table existence on either backend, but `canChangeDestination` is still sent only on SQLite, so a PostgreSQL customer is shown `changeDestinationUnavailable`. Comment corrected in this batch. Send the flag by capability, with a PostgreSQL test, before cutover. |
| 47 | Browser/phone test environment; scripts/check-tulkarm.mjs, check-android-browser.mjs | launch blocker / 0 | R: tunneled OSRM/RTL and final physical Chrome runner pass. Exact tab recovery, sheet expansion and keyboard-viewport wait verified; earlier failures retained. Both 206-input-verified APKs built and installed. Native acceptance still open. |
| 48 | Help promises unavailable email recovery; src/app/help.tsx, src/copy.ts | pilot risk / 1 | R/S: Help now asks `/auth/options` and gives the support-only answer unless the server offers an email reset. `test:scenarios` checks both configurations in both languages and fails without the fix (mutation run on the test PC); Help screenshots refreshed. Reaches Android only in a new APK. |

## Review/model dispositions

- **Opus 5.5 Native Pool, max:** authored the plan; late reconciliation adds environment details,
  importer exclusions and the stale destination-change comment. Correct its snapshot-freeze and
  first-write wording as in rows 36–37. A comment about additive columns is not old-image data compatibility proof.
- **Kimi K3.1 Pro Pool, high:** credit the completed owner-resumed review to Kimi, not Haiku.
- **Sol xhigh and Mistral high:** plan corrections integrated in merged PR #20. They have not
  reviewed the subsequent Phase 0 diff.
- **Terra xhigh:** completed 47-row static verification and late-Opus reconciliation; retain
  its evidence distinctions. Runtime checks are lead evidence, not Terra's work.
- **Step max:** accepted identification of WIND_DATABASE_URL and snapshot-only --freeze-writes.
  Rejected re-import-as-rollback and a post-pull mutable-tag check as a race solution. Narrow
  factual work remains suitable only with verification; no deploy/migration verdict credited.
- **GLM high requested; self-reported default:** calibration completed, but misclassified nine
  executable non-`.test.mjs` suites as helpers. Keep read-only inventory under full verification;
  do not credit highest-effort execution or repeat the completed calibration as if unfinished.
- **Haiku 5.5 Pool xhigh (Astra's session):** quota/retry-budget failures; no review is credited
  to that pool. Astra's `delegate_task` review of this batch stayed blocked (`Unknown tool`).
- **Lead takeover, 10 Nov:** Claude Fable 5.2 (Claude Code) replaced Astra 6 as lead at the owner's
  instruction. Claude Haiku 5.5 (`xhigh`, Claude Code subagent) then reviewed this batch against
  source: 16 findings, each checked by the lead. Fixed here: rows 26, 38 and 46, the CI job count,
  the phone-build provenance wording, the contract-suite count, the Tulkarm label bounds, and an
  empty-target and a sub-pixel viewport guard in the phone runner. Left open: row 46's PostgreSQL
  parity gap. Not adopted: a conditional sheet-expand click, because the booking sheet always starts
  closed (`src/app/book.tsx:63`).

Raw static-review artifact: `%LOCALAPPDATA%\Temp\opencode\wind-phase0-ledger-verified-20261110.md`.
The durable queue above supersedes its status-only statements with the baseline's later evidence.
