# Session consolidation review — 26 November 2026

## What this change does

This branch recovers verified gaps from the older root review onto current `origin/master`, while preserving the later release, UI, pooling, deployment and security work. It repairs password-reset rollback, remittance retry identity, and SQLite recovery revisions. It also restores the project Docker entry point and makes the physical-phone harness usable through a separate debugging port.

**Active branch:** `feature/session-consolidation-20261126`.

**Base:** `941d5cac35030119bcf543599fbc7904441e22fe`, confirmed against the remote master ref. The previous root checkout was `backup/root-review-20261125` at `2fc10b51`; local `master` is the older `b6092295` lineage and was not used as the integration base.

**Historical checkpoint boundary:** the owner approved the local checkpoint on 26 November 2026, and this report accompanies that commit. At that checkpoint no push, PR, production deployment, production migration, provider enablement or paid-resource creation had been performed. The owner's subsequent standing delivery approval in `AGENTS.md` governs future reviewed commits, pushes, merges and deployments; this historical record does not revoke that approval.

## Session and worktree ownership

- Listed 87 primary Fastship sessions, including this one. Read the latest three messages/handoff entries from each of the 86 earlier primary sessions. This is a handoff inventory, not a claim to have reread every historical tool call.
- No other primary session was running at takeover. The one unsettled earlier quality session was interrupted with no pending background tasks.
- Inventoried all 128 registered worktrees: heads, branches, tracked/untracked state, unique commit subjects, patch equivalence, and substantive diffs ignoring end-of-line whitespace.
- Found 31 trees with tracked status entries; only 16 had substantive diffs once line-ending-only changes were excluded. There were also trees with untracked research or QA material.
- Removed 23 worktrees only after rechecking that each was clean, fully reachable from `origin/master`, and contained no ignored files. No force removal, reset or branch deletion was used.
- The remaining 105 trees are preserved. This includes unique/squashed history, uncommitted work, research, QA databases and dependency junction targets. They are not 105 active writers.
- Raw inventory, recent handoffs and tracked binary patches for the 16 substantive trees are preserved locally in `.artifacts/takeover-20261126/`. The patches are in `tracked-wip.zip` with a SHA-256 manifest; every compressed entry was hashed against its original before removing the generated loose copies (774.7 MB compressed to 242.0 MB). Untracked files remain in their original trees; the archive is not represented as a complete backup of ignored or untracked material.

See [all 128 tree dispositions](2026-11-26-worktree-inventory.md) and [the continuation plan](../PLAN-2026-11-26-CONTINUE.md).

Key source handoffs:

- [Root All-Work Review Handoff](t3-thread://v2/df03bf3c-4d3a-48a0-99d2-0f5d8252ce8d/708105cf-d5b1-46e9-a060-a2729a036b77): PR #119 merged, prior gate evidence, native first-frame acceptance still open.
- [Code Quality Review](t3-thread://v2/df03bf3c-4d3a-48a0-99d2-0f5d8252ce8d/61cc8c8d-db40-419d-b03e-7d91529e19c0): the older-lineage review and interrupted final verification.
- [Review Arabic and Localization](t3-thread://v2/df03bf3c-4d3a-48a0-99d2-0f5d8252ce8d/582f7483-970d-41ba-a3b8-d3914236cdc0): ended on an unavailable requested model; no completed localization audit was assumed.

## Review method and scopes, in order

Used the `code-review-and-quality` and `ponytail-review` skills, and `writing-for-agents` for the handoff pointers. Reviewed behavior/tests and connected callers for correctness, security, readability, architecture and performance. The intended operating model remains the existing single-writer SQLite pilot, with separately gated PostgreSQL extensions; no new scale or provider capability is claimed.

1. **Ownership and provenance.** Compared old root/Fable, T3, Claude, OpenCode, Traycer and Copilot work against the current release lineage. A different Git patch ID after a squash merge was not treated as evidence of missing functionality. Whole old trees were not merged over current code.
2. **Server input, authentication and booking.** Rechecked the old malformed-target, account-revocation and booking-replay findings against current guards and their existing tests. Kept the current deadline/receipt booking protocol. Reproduced the reset-code rollback gap and fixed it below.
3. **Money, custody and remittance.** Preserved the merged cash, custody, payroll, shop and return policies. Reproduced missing payout-reference binding. Reviewed the fix for old-reader compatibility and changed the initial encoding design before handback.
4. **Recovery and persistence.** Compared the old SQLite revision implementation with the current command-count fallback. Reproduced stale metadata after a same-status edit, added a persisted revision, and checked SQLite-to-PostgreSQL import/restore with a narrowly scoped derived-field comparison.
5. **Client session, booking and driver work.** Kept the current storage-error semantics, session fences, cross-order driver-command recovery, saved checkout behavior and PR #119 countdown hook. In particular, the older sign-out change that swallowed token-deletion failures was not copied over the newer intentional refusal.
6. **Maps, GPS, UI and localization.** Compared the old map/design work with the current provider boundary, saved pins, route rendering, theme and merged UI fixes. SDK 57 reference/index were fetched before Expo-related testing decisions. Physical Chrome acceptance and remaining native/accessibility limits are recorded separately below.
7. **Infra, dependencies and runner.** Kept current Azure/SQLite deployment choices and provider gates. Repaired the missing root runner entry point and dependency setup. Ran the pinned Bicep checks through the Docker gate without logging into or changing production infrastructure.
8. **Tests, evidence and cleanup.** Re-recorded the deliberate SQLite schema change, confirmed the installed-client HTTP fixture stayed unchanged, archived tracked WIP patches, removed only proven completed trees, and wrote a concrete next-work plan.

This is an integration/provenance review with scoped behavioral rechecks. It is not a fresh line-by-line audit of every file or a certification of all historical research claims.

## Findings and fixes

### 1. Required: a failed password reset consumed its code

**Issue -> change -> verification:** a session-delete/database failure rolled back the new password but left the reset code consumed -> validate first, then lock/recheck the current account and consume the code inside the same transaction as the password/session writes -> a new SQLite HTTP regression failed on the old implementation and passed after the fix; the PostgreSQL email suite exercises the same failure and retry. Existing concurrent reset, wrong-code, spent-code and old-session checks remain active.

Files: `server/main.ts`, `tests/email.test.mjs`, `tests/pg-email.mjs`. Wrong-code attempt accounting remains outside the reset write transaction so a refusal does not erase its own attempt evidence.

### 2. Required: a remittance retry could change its payout reference

**Issue -> change -> verification:** reusing a remittance request ID with a different reference silently replayed -> validate bounded, well-formed references and bind new commands to their original reference in an atomic `COD_REMITTED` audit entry -> the new PostgreSQL regression failed before the fix; the final payments suite passes changed-reference, malformed/overlong-reference, exact retry and later-remittance cases.

**Compatibility finding -> correction -> verification:** the first recovery approach encoded the reference into `merchant_cod_events.request_id`, which an older API build would not recognize -> retain the original request ID and store its reference separately in the existing audit table -> a new old-reader lookup regression failed for the encoded form and passes for the final form. Old events without a reference-binding audit retain their previous replay behavior. No PostgreSQL schema migration is needed for this fix.

Files: `server/domain/payments.ts`, `tests/payments.mjs`. Both the money event and the audit binding are written in the same transaction.

### 3. Required: same-status SQLite edits left recovery versions unchanged

**Issue -> change -> verification:** the SQLite version was a count of driver action receipts, so editing pickup instructions did not invalidate an old snapshot -> add the additive `orders.version` column and an update trigger, and serialize that stored version on both engines -> the new driver-recovery regression failed with the count fallback and passes with the row revision; existing replay, expiry, proof and assignment cases still pass.

**Import compatibility -> change -> verification:** PostgreSQL generates its own order revisions when importing -> exclude only `orders.version` from row-content comparison, preserving identities, all other imported fields and financial checks -> PostgreSQL 18 import, dump/restore and HTTP parity pass. A rolled-back test proves an order-revision-only change yields zero mismatches while changing a user's name yields exactly one `users` mismatch. Recursive JSON canonicalization is preserved.

Files: `server/db/sqlite-schema.ts`, `server/main.ts`, `server/migrate.ts`, `tests/driver-recovery-api.test.mjs`, `tests/pg-import.mjs`, `docs/implementation/contracts/schema.json`. SQLite `user_version` stays 3. The schema fixture changes only the new column/trigger and column positions; HTTP fixtures have no diff.

### 4. Runner and environment repairs

- **Stale root base ->** created the feature branch from verified remote master while retaining the root backup and older local lineage -> remote master resolved to `941d5cac`; the branch begins there.
- **Git HTTPS empty replies ->** selected OpenSSL in this repository's local Git configuration after proving the transport worked -> fetch succeeded and a final ordinary `git ls-remote` without an override confirmed master. The previous local config is backed up in the ignored evidence folder; global Git settings and the active authentication account were unchanged.
- **Missing `test.ps1` on current master ->** restored the thin project entry point that forwards to the configured Docker cloud runner -> the entry point ran the full integration gate successfully.
- **Nested review worktree included in source sync ->** added an explicit exclusion to the local cloud sync worker -> source sync and the gate succeed without copying that second checkout.
- **WSL cannot follow absolute Windows dependency junctions ->** made the local PowerShell runner resolve junction targets before passing the dependency path to its Bash worker, with cycle detection -> parser/Bash syntax checks and the normal cached dependency path pass. Both local runner files have `.before-takeover-20261126` backups. A forced full dependency upload is not claimed as tested.
- **A circular junction chain was exposed during dependency setup ->** restored the original physical directory, then refreshed Windows dependencies from the unchanged lockfile with install scripts disabled -> installation succeeded and a static installed-version comparison found zero mismatches. No tests ran on Windows and no dependency versions or lockfile bytes changed.
- **Docker SSH rejected reverse forwarding for the phone ->** prepared a temporary loopback-only framed transport over an ordinary SSH command and an optional `WIND_ANDROID_CDP_PORT` in the phone harness -> physical Chrome connectivity is verified through port 19228. Full phone results are recorded below. Existing SSH/device sessions were not closed or adopted.
- **Stale UI ride-completion scenario ->** updated the browser journey to read the customer's trip code and enter it in the rider-code field before ending the trip -> the old scenario reproduced a real `Wrong handover code` refusal at completion; the corrected full UI run is recorded below. The product's trip-code requirement was preserved.
- **Stale agent entry points ->** updated `CLAUDE.md`, `tasks/HANDOFF.md` and `docs/CURRENT-WORK.md` to point to this review and the continuation plan -> checked the pointers and retained older material as explicitly historical evidence.

Local runner changes are environment repairs outside this Git branch. Their originals and the exact scripts/transport evidence are retained locally. Product source, regressions, the root entry point and documentation are reviewable on the feature branch.

## Verification

All automated tests/builds ran in Docker cloud sandbox `sbx_001m7sknp49sr4g8bytx182r0z2` through SSH, sequentially. Runtime: Node 24.12.0; pinned Bicep 0.48.1. The phone is the physical `SM-A5360`; the installed production app reports 1.1.6, version code 43. No emulator or simulator was used.

- Three new behavioral regressions were observed failing before their fixes. The remittance compatibility regression also failed on the initial encoded-ID form.
- Full default gate: **168 suites passed**, including clean-checkout typecheck, schema/contracts, privacy, deployment and Bicep checks. The gate was repeated after the remittance compatibility correction and passed again.
- Final product lint and app/server typecheck: exit 0.
- Native npm audit gate: exit 0; the raw report lists 12 moderate, 0 high and 0 critical advisories. Reviewed backports remain hash checked; the moderate entries remain reported rather than suppressed.
- Focused final PostgreSQL payments suite: exit 0.
- PostgreSQL 18 import/restore: exit 0, 46 tables / 195 synthetic rows; both content-drift assertions pass.
- Complete PostgreSQL persistence: **60 suites + 22 legacy suites**, exit 0, PostgreSQL **18.6**. This includes import/restore, durable money, capacity and dispatch races, account revocation and legacy HTTP compatibility.
- Final phone-harness focused gate: **6 suites**, exit 0, after adding the configurable debugging port.
- Fresh SDK 57 web export: exit 0, one worker, built in Docker. After correcting the stale ride scenario, the full UI rerun passed **33 journeys**, with **0 unhandled browser errors**. Coverage includes lost replies/reload, driver/customer/admin flows, payment proof, ride completion, returns, map download/tile failure, a short landscape screen and the 330 KB cold-map budget.
- Physical Galaxy A53 / Chrome **158.0.8127.42**: **5 checks passed**, **0 page errors**, **0 map failures**: signup, exact pickup map, booking to searching, Arabic tiles/live driver marker, and a real touch pinch revealing Recenter. The runner stayed in Docker; only the temporary TCP transport ran on Windows. Screenshots were copied locally and visually inspected. This is physical browser acceptance, not a new native APK or background-location test.
- Lint and both typechecks were repeated after the final harness fixes: exit 0. Staged whitespace and credential-pattern checks pass. All 24 source-file pointers in the continuation plan resolve.

Final UI/device evidence: `.artifacts/takeover-20261126/web-results.json`, `a53-results.json`, `a53-booked.png`, `a53-android-map.png`, `web-scenarios-rerun.log`, `physical-phone.log`, and `final-checks.log`. The initial failed UI log is retained as before-fix evidence. The suite closed its test tab; no Chrome profile was cleared.

Cleanup checkpoint: temporary bridge processes and the task's two ADB mappings are removed. The sandbox stop request was accepted and TTL is paused; the last inspect still reported `stopping`. The earlier interrupted quality thread was settled after takeover. The owner approved committing the 19 reviewed files locally; this checkpoint is saved on the feature branch. Resolve its identity with `git log -1` rather than embedding this document's own commit hash.

Local logs: `.artifacts/takeover-20261126/` (`default-gate.log`, `final-gate.log`, `final-targeted.log`, `persistence.log`, and the later UI/phone logs). Raw audit is retained in the sandbox's `.artifacts/dependency-audit/raw.json` and copied with final evidence when available.

## Delivery-policy follow-up and additional review finding

**Issue -> change -> verification:** older handoffs required another approval for every routine commit, push and deployment -> add the owner's standing, subagent-review-gated delivery approval to `AGENTS.md` and point the active handoff/plan to it -> independently review the instruction scope and check its file pointers. Sensitive changes require two independent approvals; Docker, physical-device, branch protection and deployment checks remain mandatory. Missing credentials, new spending, destructive data operations and a PostgreSQL cutover retain their separate input/authorization gates.

**Required review finding -> change -> verification:** a recovery-only order response could combine old pickup instructions with a newer revision, and a command response could do the same after commit -> serialize recovery metadata from the exact base order row, carry it inside protocol/journey snapshots, and capture the command's complete recovery response before committing -> a deterministic Docker HTTP regression failed before the fix (`5 !== 4`) and passed afterward. The test edits instructions after the base-row read, proves the stale command is refused, edits again immediately after command commit, and verifies that both the reply and replay retain coherent instructions/revisions. Legacy clients still receive no recovery field.

The first independent subagent review requested this correction and found no additional blockers in the password-reset, remittance or migration changes. Fresh final approvals and the follow-up Docker gate results must be reported with the delivered revision; local command/evidence logs are kept in `.artifacts/delivery-policy-20261126/`.

## Remaining work and limits

- A clean code/test gate is not a production deployment. At the original 19-file checkpoint production was untouched; the later SSH-access repair, live preflight, published candidate and current rollout blocker are recorded in [the continuation plan](../PLAN-2026-11-26-CONTINUE.md#published-candidate-and-rollout-checkpoint).
- PR #119's native first-frame acceptance, a complete TalkBack/200% native walk, real closed-app push delivery, field road/GPS evidence, and the timed replacement-host restore remain separate acceptance tasks.
- Firebase activation and old-host retirement still depend on the owner's access/approval. Gates were not enabled to make a test appear complete.
- Old worktrees with real edits and private QA state are preserved, not falsely labeled finished. The continuation plan explains the next review/port sequence and identifies superseded historical task designs.
- The approved local checkpoint contains the reviewed work and plan on the single active feature branch. Subsequent delivery follows the current standing approval and gates in `AGENTS.md`.

**Verdict:** the scoped reproduced defects are fixed; final gate/device results and any actual limitation must be read with this report. Continue from [the ordered plan](../PLAN-2026-11-26-CONTINUE.md), not from the old local master or a blanket cherry-pick of the backup.
