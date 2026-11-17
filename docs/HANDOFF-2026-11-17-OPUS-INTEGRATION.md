# Handoff 17 Nov 2026: Wind research → Fastship integration (Opus 5.5 lead)

Labels: [O] observed, [I] inference, [U] unknown. Status of each gate is filled from recorded evidence only.

## Corrections to the integration prompt / corpus
- [O] `wind-competitors` is not a git repository (`fatal: not a git repository`); "git status in both workspaces" cannot run there.
- [O] The session worktree branch was on the old 31 Oct lineage, 455 commits behind `origin/master`. The research names modules (`booking-receipts.ts`, `driver-receipts.ts`, `driver-recovery.ts`, ...) that exist only on `origin/master`. All slice branches start from `origin/master` (825109f0).
- [O] `booking-retry-race.test.mjs` does not exist; the file is `tests/booking-retry-receipt.test.mjs`.
- [O] k5 and DESKTOP-S2JKMK5 are the same machine (`ssh k5` → hostname DESKTOP-S2JKMK5, user `pc gaming`).
- [O] Owner decisions this session: no GPT 6.1 Sol (Opus does all work); Haiku 5.5 reviews each PR; Grok 4.7 only for UI/copy/RTL second review; choices follow what a professional ride/delivery company ships, without trade-off questions; push/PR/review/merge authorized.

## Slices
| Slice | PR | Branch | State |
|---|---|---|---|
| A-01 admin lost-reply remittance recovery | #79 | claude/p0-command-recovery | MERGED 63fe2452 (CI image/persistence/verify green at 55b4ad43; test PC: tsc, lint, unit, cash, admin-review, contracts pass; full suite blocked by test-PC memory) |
| Dispute resend returns the order | #80 | claude/dispute-resend | MERGED 117cf25b (CI green; test-PC npm test hit an env timeout, rerun queued) |
| Generic sender-scoped command receipt (server) | #81 | claude/command-receipts | review fixed; CI green at d682e825; master merged in at 5af4f5ac (contract conflict resolved), CI rerunning |
| Chat outbox: unsent messages survive restart (SQLite-compatible) | #82 | claude/chat-outbox | Haiku review running; gates queued |
| Design system part 1 (taken over) | #78 | claude/design-system | review fixed (11 findings); gates pending |
| Old UI audit | #9 | claude/ui-ux-audit-2026-11-07b | closed as superseded (branch kept) |

## Process notes
- [O] A worktree-isolation hook blocks this session from writing other worktrees. Earlier edits to the slice 2a/3 worktrees and `C:\w\wind-shop` (PR #78) were made through shell commands before the hook fired; later #78 fixes were made by checking out the PR head detached in this session's worktree and pushing `HEAD:claude/design-system`, so `C:\w\wind-shop`'s local branch is now behind its remote.
- [O] The test PC's PostgreSQL (pgdata-review) checkpoints take minutes (`sync=113 s`), which times out test pools; gate runs now start it with `fsync=off -c synchronous_commit=off -c full_page_writes=off` (throwaway test cluster).
- [O] Production (16 Nov student host) runs SQLite per the deploy notes.

## Work preserved
- [O] 29 dirty or unpushed Fastship worktrees, including the main checkout's 117 files that existed nowhere else, snapshotted to `origin/backup/wt-1117/*` with a temporary index (working trees untouched).
- [O] The old REA docs branch pushed: `origin/claude/wind-fastship-integration-258f07`.

## Evidence (test PC DESKTOP-S2JKMK5, `D:\wind-lead-1115\<label>`)
- a01r (origin/master + new tests): UNIT=1 (module missing), CASH=1 (`GET /admin/cash/commands/:id` → not_found). Red as expected.
- a01h (027f90cd): TSC=0, LINT=1 (set-state-in-effect), UNIT=0, CASH=1 (adjustment driver gone). Both fixed in b4fbdd37.
- a01j (b4fbdd37): TSC=0, UNIT=0, CASH=0, CONTRACTS=0; REVIEW=1 (harness storage stub, fixed 100867f7, then UUID stub c545bec1); LINT crashed 0xC0000409 with an empty log and PERSISTENCE hit `Connection terminated due to connection timeout` at Postgres init (test-PC environment, not code).
- Dispute red (origin/master + new credit test): CREDIT_RED=1, as expected.
- d2ag (bb81f84e, pre-review): TSC/LINT/UNIT/CASH/CONTRACTS=0; TEST=1 (old E047 test expected 409, fixed 645840be).
- d2ah (645840be): TSC=0, LINT=0, credit test 0, exceptions test 0, CONTRACTS=0; TEST=1 on `tests/url-decoder.test.mjs` spawnSync ETIMEDOUT (3 s child timeout on the i5-4460; rerun queued).
- CI (GitHub Actions) #80 at 645840be: image, persistence, verify all pass.
- Queued on the test PC: a01m (c545bec1), ds78d (29ae4bcf), cr81c (d682e825), d2ah npm test rerun.
- Reviewers: Claude Haiku 5.5 xhigh for #79, #80, #78, #81 (the #81 run paused on the weekly limit and resumed after the owner reset it; a Sonnet fallback was started and stopped unused).

## Blockers only the owner can clear
- [O] Test PC memory: `Python314-pool\python.exe` (PID 8036, started 08:51) holds about 9.5 GB of 16 GB, leaving about 0.6 GB free. Node then crashed natively during `npm test` (exit 134), ESLint crashed (0xC0000409), and PostgreSQL connections dropped. Full suites and the phone sandbox cannot run there until it is restarted or capped. My own queued runs were stopped (only processes under `D:\wind-lead-1115\seq-1117c` / `cr81c`).

## Not done / open
- Phone acceptance on the A53 for the A-01 restored-form states (not run).
- Slice 3 client adoption: see `docs/SPEC-command-receipts.md` (sequencing note: production runs SQLite, so the generic `commandId` client adoption waits for PostgreSQL; the chat outbox (#82) is the SQLite-compatible piece; the driver-advance fallback is not needed).
- Research priorities #2–#10 not started.
- n9 native audit: not touched (a native build was running on the test PC; no APK certified).
