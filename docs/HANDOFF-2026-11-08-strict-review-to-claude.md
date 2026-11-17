# Handoff — 8 November 2026: strict review to Claude

## Owner request

Take over the failed Claude session and complete it. Strictly audit work from 6–8 November for design, functionality, security, reliability, accessibility and evidence quality. Booking acceptance comes first, then all 25 remaining physical targets. Preserve and reconcile earlier work; do not overwrite dirty worktrees. Use Kimi K3.1 Pro Pool for design, Haiku 5.5 Pool for UI review, NVIDIA Step 5 Preview and Mistral Large for independent reading/reviews, each at its maximum exposed effort. Lead findings through T3 Code and independently reproduce them before fixing.

## Primary workspace

`C:/Users/osama/.t3/worktrees/Fastship/strict-review-20261108`

Branch `fix/strict-review-20261108`, pinned baseline `92b1cd2ba02f721c53f9ee338d870b0313b54efd` (merge PR #10). The worktree was clean before this handoff file; **no product edits, commits, pushes or deployments** have been made. Read its `AGENTS.md` and `CLAUDE.md`. Expo 57.0.31; use `npx`, not bun. Keep T3's session working directory at the original project root: moving it to this worktree previously removed T3 tools. Use explicit absolute paths for all review-worktree operations.

The failed predecessor thread is `<t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/3fa412d2-9ae3-49d0-a70c-034813213890>`.

## Reconciliation completed

Predecessor dirty V11 worktree: `C:/Users/osama/.t3/worktrees/Fastship/fix-complete-nov5-session`, based on `22526cc`. Preserve it. Its 40 modified/new source and test files were compared byte-for-byte with `92b1cd2`:

- 29 files are identical; all 11 new test files are present.
- Eleven differ because merged follow-up fixes supersede parts of V11: `public/map.html`, `src/app/book.tsx`, `src/copy.ts`, `src/map-sheet.tsx`, `src/ui.tsx`, `tests/phone-ui.test.mjs`, `tests/booking-controls.test.mjs`, `tests/booking-map-feedback.test.mjs`, `tests/order-history-serialization.test.mjs`, plus two related source/test differences already checked by this comparison. Recheck the exact list with `git diff --no-index` before editing; do not apply V11 wholesale.
- Merged commits after V11 include `c474bd5`, `90ed62d`, `8309f51`, `d01c857`, `f983c38`, `9689b32`, `66f3e3f` and CI Bicep corrections. Booking changes add deadline retry, mounted busy-state cleanup and a single quote-failure display.
- Two older design worktrees remain preserved: `ui-ux-pro-max-20261107-final` at `c9b4507` and `ui-ux-pro-max-20261107` at `4420326`.

Two-day review window begins at `747f60133b997a42e830ba0bce323c49c3b530a8` (last commit before 6 Nov). Review commits through `92b1cd2`, especially booking/recovery, session/admin changes, maps, persistence/backup and CI. Review tests before implementation and mutation-check important fixes.

## Physical device — control restored

Phone: physical Samsung SM-A5360, Android 16, serial `R5CTB0FJP9Z`; no emulator was started.

The old lock was held by `t3-66accd9bb186114cbbe3687a`; the owner closed it. Current T3 session owns the device. Call `device_open` with `hostId:"local"`, `deviceId:"R5CTB0FJP9Z"` after any restart, then use the returned command. Last known command:

`C:\Users\osama\.t3\userdata\device\targets\t3-bea89598aacfe9899802a97c\agent-device.cmd`

Run `open ps.wind.app.testcustomer` before every new snapshot/input sequence. Launch succeeded. Current home snapshot showed Arabic home with parcel/ride/freight buttons and existing orders. One attempted `press @e24` failed with `INVALID_ARGS: Missing target` before any tap; inspect `help press` and use the command's supported argument syntax. Do not bypass T3 device control with adb for UI.

Installed customer APK is predecessor **V11**, not `92b1cd2`: SHA-256 `b6947af9b65dd692062e873a0f27c0b1e2ac3fb02966c30cbcce58eb262a20f6`, installed 06:40 UTC, credentials/data preserved. Build/install the reviewed baseline (or final fixed source) before claiming current-source physical acceptance. Build scripts preserve private data and require isolated loopback QA provisioning.

All **26 physical targets remain pending**; no booking or other screen has been accepted. Existing predecessor records are historical claims, not fresh acceptance.

## Fresh findings/evidence

- `docs/screens/ar/order-live.png` at baseline has route markers but no map tiles. The corresponding user-supplied physical capture also showed an empty map background while the current Arabic home map does render tiles. Investigate live-order map loading/readiness and stale screenshots; do not infer a universal native tile failure from one screenshot.
- `scripts/screens.mjs` still captures most screens after `networkidle` timeout plus fixed waits (`console.log` then capture anyway), despite commit `9689b32` claiming ready-control waits. Readiness evidence is incomplete and must be strengthened, not treated as proof of loaded screens.
- The 6–8 Nov `22526cc..92b1cd2` diff contains ~1,984 source/script/test insertions plus many screenshot changes; there is no issue-free verdict yet.

## Reviewers / T3 orchestration

Maximum exposed variants verified through T3/model catalog: Kimi `kimi-pool/kimi-k3.1-pro#high`; Haiku `gpt-pool/claude-haiku-5-5#xhigh`; Step `nvidia/stepfun-ai/step-5-preview#max`; Mistral `nvidia/mistralai/mistral-large-4-1t-a52b#high`. Do not claim Mistral 5 or Kimi max; those are not exposed.

- Haiku whole-app review task ID: `node:delegated-task:command%3Amcp%3Ad5537da6-b7a0-471b-8d0c-15ad1fb98f04%3Adelegate-task%3A22c67f93-dc6a-4b6d-a5cc-fd7e074e501e`.
- Haiku thread: `<t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Ad5537da6-b7a0-471b-8d0c-15ad1fb98f04%3Adelegate-task%3A22c67f93-dc6a-4b6d-a5cc-fd7e074e501e>`. It was left running before the server restart. Read its final result if available; do not duplicate or poll a running task.
- Kimi failed three attempts with `invalid JSON body`. Activity proves it successfully read instructions/source and images before the provider failed, so this is not a prompt-only failure. No Kimi findings were produced. Diagnose provider image/tool-result serialization; preserve requested model/provider, and record the blocker if it persists.
- Step and Mistral reviews have **not yet been launched**. Assign bounded read-only reviews on pinned source: Step for booking/recovery correctness and races; Mistral for backend security/data integrity and history/test evidence. Call `orchestrator_capabilities` after the provider change/restart before new `delegate_task` calls.
- No T3 workflow-start tool exists in the discovered catalog, only `t3_workflow_stop`; use T3 delegation rather than pretending a workflow ran.

## Remote gates on k5

`k5` is reachable only with the explicit saved host options:

`ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes -o HostName=desktop-s2jkmk5.local k5 hostname` → `DESKTOP-S2JKMK5`.

Create a new isolated directory and fresh PostgreSQL data directory/port; never reuse or stop another session's tree/database. Node is at `C:\Users\pc gaming\smartstore-tools\node-v24.12.0-win-x64\node.exe`. PostgreSQL 18 binaries: `C:\wind-k5\.expo\implementation\postgresql18\bin`. Existing reference checkout `C:\wind-booking-20261108-sol` contains dependencies and previous evidence but belongs to earlier work; copy dependencies or reuse only read-only as appropriate, never overwrite it. `C:\wq-b1108` is the predecessor build directory; do not reuse it.

Sync the exact review source (including `tsconfig.server.json`) into a new `C:\wq-strict-review-...` directory and verify hashes before running. Required gates: `npm run lint`, both typechecks, relevant tests, full `npm test` (129 registered suites at baseline), PostgreSQL persistence, browser scenarios where supported, and refreshed screenshots after UI edits. Record failures rather than silently omitting suites. Earlier browser suites were unavailable on k5; if still unavailable, prove it and run a labelled fallback locally without claiming remote evidence.

Historical V11 evidence, not current acceptance: `C:/Users/osama/AppData/Local/Temp/opencode/wind-v11-resume-20261108-0711/readiness.json`. It claims 1,060 hashes verified, 3 orders preserved and gates passing. Verify independently.

## Next actions

1. Read Haiku's completed result if available; launch Step/Mistral at the requested variants. Retry Kimi only after addressing the demonstrated provider serialization failure.
2. Finish `747f601..92b1cd2` correctness/security/reliability review. Reproduce every reviewer claim; write a regression test before fixing a real defect. Keep fixes minimal and preserve merged follow-ups.
3. Run fresh isolated k5 gates and inspect every Arabic/English screenshot, including empty/loading/error states and actual tiles.
4. Build the reviewed/fixed customer APK, install it without clearing data, then complete Booking-first physical acceptance in Arabic and English: service selection, locations/map, quote/loading/failure, form validation, scheduling, freight fields, promo/credits, retry/recovery/account switch, submit/receipt. Then cover the other 25 route/state targets and driver/admin QA apps as required.
5. Refresh `docs/screens` after UI edits, record route-by-route evidence, run final gates and report confirmed/refuted/reworked reviewer findings. Do not commit/push/deploy without explicit owner approval.

## Current verdict

**Incomplete.** Phone access is restored, but no physical target is accepted; no fresh gates have run on `92b1cd2`; Step/Mistral reviews are outstanding; Kimi failed; stale/incomplete screenshot evidence is confirmed; and no completion or issue-free claim is justified.
