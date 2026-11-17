# Independent candidate6 verification — 15 November 2026

Status: **SOURCE GATES PASS; scoped phone-web checks pass.** Owner redirected subsequent release work to current master `7748234`. This is not release or production approval.

## Ownership and scope

- User asked Codex to verify the handoff independently, finish the outstanding work, and coordinate with Claude session `25b2c904-58ea-4a6d-aee7-58dcfc4e2584`.
- Codex owns the preserved `fable-5.2-verification` checkout, two phone test-fixture corrections below, and this document. Claude confirmed it will not edit this checkout.
- Claude owns `C:\w\wind-cash`, branch `claude/driver-cash-cap`, PR #34. Its product changes are not imported here. The original dirty Fastship root is untouched.
- Claude stopped its K5 APK launcher and copy job and released the machine before this run. The process inventory confirmed no competing Node/Java/Gradle/robocopy job. Codex will notify Claude when K5 is released.
- No commit, push, deployment, production migration, payment activation, resource creation or phone-data clearing is authorized by this checkpoint.

## Findings established from actual files and logs

1. `candidate6-fix8` is finished, not in flight. Its `gates-result.json` has **24 passing gates, persistence exit 1**. Failure: `tests/phone-identity.mjs:50`, expired proof expected HTTP 400 but returned HTTP 200.
2. The expiry fixture writes `expires_at=Date.now()-1`. The adjacent rate-limit fixture also clears `resend_at` with a one-millisecond margin. Neither scenario tests a one-millisecond boundary; both require an already elapsed deadline. Product `phone-identity.ts` directly compares the stored expiry with `Date.now()`.
3. All 1,063 paths in the fix8 manifest exist locally; only the chronological `CONTINUATION-2026-11-15.md` differs from that freeze before this task's edits. The remote fix8 source-verification artifact records 1,063 checked files and zero mismatches. Old `src12`/`src13` remain invalid historical extracts and were not touched.
4. The actual `expo` dependency is `~57.0.33`; the verification handoff's Expo 56 description is stale. No Expo/React Native API was edited in this continuation.
5. Prior claims of multi-minute clock steps are not independently established by this task. The three inspected Kernel-General time-change events show small adjustments, not evidence sufficient to attribute every prior failure to the clock. The fresh runner records wall-clock and monotonic elapsed time per gate; a passing retry alone will not prove that diagnosis.
6. Claude reports newer hosting/search/build-profile commits on `origin/master` and a cash-cap PR in progress. These are a different source line. This candidate's green checks, if obtained, cannot establish compatibility with those changes or the currently deployed server.

## Minimal fixes

| Issue | Change | Verification |
| --- | --- | --- |
| Expired OTP fixture depends on a one-millisecond wall-clock margin | `tests/phone-identity.mjs`: set the explicitly expired fixture deadline to `0` | Remote syntax check and full persistence gate pass; HTTP 400 assertion retained and passed |
| Rate-limit fixture uses the same fragile margin to bypass cooldown | `tests/phone-identity-limits.mjs`: set the elapsed cooldown to `0`, matching the existing daily-limit fixture | Full persistence gate passes; immediate cooldown denial, rolling limits and provider-budget race assertions retained and passed |

No product TTL, timeout, authentication check or rate limit is changed.

## Candidate and evidence

- Base: `candidate4-final-fix1.tar`, SHA-256 `a3cf8fd562c922f95437585b59afdacda4909288d4340bb6cf3f7aaa95b53eb3`.
- Integrated patch: `candidate6-integrated1-patch.tar`, SHA-256 `5abe4e62a093a443b8d7fab75d810a2887108348e16f92f5a0725b85e9de6296`.
- New patch: `candidate6-codex9-patch.tar`, SHA-256 `88d4c11711c7aa3b8e3e0629cbc04141336d93a60ae3c127bcaf1f088c93078f`.
- Manifest: `candidate6-codex9.json`, 1,063 file hashes, SHA-256 `c6e268a472835ac8a93f36a3b6c6db42fc3159eca685625f03577ade0727c6ff`.
- Source: `D:\wind-verify-20261113\src-codex9`; fresh disposable PostgreSQL 18.3/PostGIS 3.6 fixture, loopback port `55528`.
- Remote runner: `D:\wind-verify-20261113\current\run-candidate6-codex9-20261115.ps1`.
- Remote logs: `D:\wind-verify-20261113\current\candidate6-20261115\codex9\`.
- Local evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\codex-continuation-20261115\`.
- All three uploaded artifacts were individually transferred and SHA-256 checked remotely before execution. Runner parses with PowerShell's parser. Local `git diff --check` passes. Product tests/builds run only on K5, sequentially, at normal priority with no new worker throttling.

## Acceptance boundary

The task's immediate open source gate is full remote persistence, alongside the other 24 gates including app/server typechecks, Expo lint, Doctor, audit, integration, contracts and import/restore. Source hashes must still match after execution.

The implementation brief also requires separate physical-phone, routing/network, operations, update-distribution and production evidence. None is replaced by these JavaScript gates. In particular ordinary-sign-in offline recovery, physical accessibility/reboot cases, replacement-host RTO/RPO, human alert acknowledgment and an authenticated production journey are not claimed. Prior production-credential refusal remains respected. No emulator is used.

## Verified outcome

- `codex9/gates-result.json`: **25/25 exit 0**, including app/server typechecks, Expo lint, Doctor, audit, all focused gates, integration and full persistence.
- `codex9/integration.log`: **119 selected suites passed**. The persistence log contains all selected PostgreSQL suites followed by real `PASS PostgreSQL legacy ...` results through `change-destination`; this was not a filtered or isolated rerun.
- `codex9/post-gate-source-verification.json`: **1,063 checked hashes, zero mismatches after the run**, as well as the initial zero-mismatch verification.
- `codex9/gate-clock.jsonl`: largest absolute wall/monotonic elapsed-time difference is **12 ms**. No large net clock step was measured per gate in this run. This does not exclude all intermediate corrections or prove the cause of historical failures.
- Runner exit **0**; fixture PostgreSQL shut down cleanly. No production database was used.
- Logs were copied to the local evidence root under `codex9/`. Windows `scp` rejected a remote source with the spaced username; a task-local SSH-config alias with `User "pc gaming"` fixed the transfer while preserving host-key checks. The owner's SSH config was not modified.
- Claude was sent the passing results, exact changes and candidate boundary before phone acceptance started.

## Scoped physical outcome and ownership transition

- Actual physical A53 `R5CTB0FJP9Z`, Android 16, Chrome, ordinary manual sign-in with a disposable sandbox customer (no bundled `phoneTest` identity).
- Fresh web export from the same verified source: `index-fb28d2ad15bbd79ab848ef7c4be42abf.js`, served by a loopback-only K5 backend on 4208 through the synthetic API-outage proxy on 4209, SSH forwarding and `adb reverse`.
- Arabic and English: after an API 503 outage and Chrome process relaunch, the saved summary showed the same orders, explicit read-only/stale copy and last-saved time. No order mutation controls were exposed. Restoring API access and pressing Retry returned to the live home screen in each language.
- Final server-side order inventory remains exactly `[3, 2, 1]`, three seeded orders. No duplicate booking was created.
- `ordinary-physical-result.json`, `ordinary-order-baseline.json`, and export output are in the local `codex9/` mirror. Screenshots and snapshots are in the local evidence root: `ordinary-online.*`, `ordinary-offline-ar.*`, `ordinary-offline-en.*`.
- Pin smoke only: named zoom controls and editable latitude are exposed in the physical accessibility tree, without requesting GPS. Coordinate editing/confirmation, TalkBack and native pin acceptance were **not completed** before the owner's redirect.
- Device contention resolved during the single prescribed `--wait 30000` retry. No foreign session was reused or closed. PowerShell device refs must be quoted, and each action needs a fresh snapshot if its target was not emitted by the preceding diff.
- Candidate6 backend/proxy listeners on 4208/4209 were stopped after validating their process ownership; `adb reverse tcp:4209` removed. No production app was opened, signed out, reinstalled or cleared.
- K5 and the A53 remain reserved for the new owner-assigned master `7748234` gate/build/acceptance task. The production release/master compatibility and complete native acceptance remain separate and unproven by candidate6.

Next action: verify committed master `7748234` in a fresh K5 directory. Report product failures to Claude; do not patch product code in this verification role.
