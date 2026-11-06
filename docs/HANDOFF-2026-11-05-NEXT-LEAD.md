# Next lead handoff — 5 November 2026

## Status update — 6 November 2026 (read this first; it replaces the older status below)

**The registration section's code is finished, gated and driven on the A53, on the Android test apps. It is not production-proven: nothing is deployed, sign-up was not driven on the native test apps (they sign in by themselves; the form ran in Chrome), and there is no iOS device, Entra tenant or email sending domain.** The merge the old text calls "in progress" is finished as commit `10f8d16`. This branch contains every commit on PR #13, so merging it lands #13 too.

### Open items from the section below, now resolved

| Item | Fix | Proof |
| --- | --- | --- |
| Phone tables kept the number after deletion and blocked reuse | `PhoneIdentity.forget` inside `deleteAccount`: drops profile, mapping, aliases; blanks challenges (the append-only audit references them); marks unsent codes obsolete; returns the budget of codes never sent. Takes `identity_commands` first, the order every phone command uses. | `tests/phone-identity-deletion.mjs` (PostgreSQL): whole-row scan finds no number, audit kept, open recovery dead, number enrolls again, other accounts untouched |
| Microsoft-only accounts could not set a password | `/api/me/password` accepts a fresh Microsoft sign-in through its own `/api/me/password/challenge`. Nonce is purpose- and session-bound, one use, inside the transaction. Button on the password card. | `tests/entra-exchange.test.mjs`, `tests/account-delete-ui.test.mjs` |
| Support reset needed no proof | With an email path the reset requires a receipt from `identity-check`, an HMAC over admin, account, current password hash and time, valid 10 minutes, dead after the reset. With no email path the admin must write what they checked (10 to 300 characters, no phone number), which goes in `SUPPORT_PASSWORD_RESET`. | `tests/email.test.mjs`, `tests/api.test.mjs`, `tests/admin-recovery-ui.test.mjs`, readiness journey |
| Sign-out ordering and cross-tab race | Token removed first, recovery cleared after, so a failed sign-out keeps the record of the still-open session. `storage.exclusive` (Web Locks) serializes read-and-delete with sign-in across tabs. A 401, deleted account or changed phone always ends the session on screen. | `tests/session-recovery.test.mjs`, `tests/protected-recovery.test.mjs` |
| Importer dropped native push tokens | `server/migrate.ts` imports them after sessions, with JSONB, and reconciles by content. Old snapshots import zero. Reports carry hashes, never tokens. | `tests/pg-import.mjs`, including pg_dump/pg_restore |
| Arabic text and digits | Reset and support mail asserted. **New bug fixed:** the handover and boarding PIN rejected Arabic-Indic digits, so a courier on an Arabic keypad got `wrong_code`. Fixed on client and server. | `tests/email.test.mjs`, `tests/api.test.mjs`, `tests/phone-ui.test.mjs` |

Each failed first for the intended reason (`nov6-reg-red.log`). A Haiku 5.5 review of the diff found no high or medium defects and seven low ones. Five were fixed. Two were kept on purpose: sign-out stops alerts before the token removal that can fail, because that fails toward fewer alerts and the suggested write probe could overwrite another tab's token; and sign-in leaves the replaced session's cache, which is unreadable without its token and evicted later.

### Evidence, on DESKTOP-S2JKMK5 against the final source

Logs are in `C:\Users\osama\AppData\Local\Temp\opencode\`. `nov6-last-gates.log`: typecheck, lint, integration **114 suites**, contracts, scenarios, readiness, all persistence suites, audit gate. `nov6-last-export.log`: release export for web, Android and iOS with CI's environment. `nov6-last-screens.log`: 96 bilingual screenshots, in `docs/screens`. `npm run check:deployment` was not run: it needs a live `--origin` and probes production, and CI does not run it either.

Physical A53 (`nov6-phone-last-run.log`), via APKs built on the test PC from this tree and installed with matching hashes: `phone:check` smoke passes for customer, driver and admin; `test:android-browser` passes sign-up, booking, Arabic map on the GPU and pinch. **No physical iOS device. Native sign-up is not covered: test apps sign in by themselves, so the sign-up form ran in Chrome only.**

### Native two-role trip on the A53, 6 November

Run with the owner's OK to close the stale agent-device session `t3-3ae2e7a2b7854b798d9d3a6e`. Synthetic accounts, sandbox on the test PC (`C:\wq-astra-1105\ps.cmd`, tunnel `ssh -L 4191:127.0.0.1:4191`, `adb reverse tcp:4191 tcp:4191`).

- Passed: order W-00004 from the customer app; driver accepted, arrived, picked up; handover code typed as `٣٤٤٢` and read as `3442` by the field; order delivered. The keyboard left the handover field and button visible, on a Samsung number pad, in that screen layout. Arabic digits went in through agent-device's test keyboard because the adb and clipboard paths refuse them on this phone, so **typing Arabic digits on the Samsung keyboard itself was not done**.
- Passed: admin reset. A note holding a phone number was refused; a valid note issued a temporary password; on the API the new password signed in (200) and the old one was refused (401).

What the trip found, each fixed and rechecked on the phone with the Samsung keyboard:

| Found on the phone | Fix |
|---|---|
| Picking a place with the keyboard up left it over the map pin, hiding the confirm button | `src/trip-search.tsx`: dismiss before leaving the search step |
| A refused admin reset showed its error above the fold, nothing where the admin was looking | `src/app/admin/users.tsx`: a failed action scrolls to the error and keeps the card and note |
| Open customer order sheet: dead band mid-sheet, last rows under the system buttons | `src/map-sheet.tsx`: the inset ends the content when open |
| One stray tap on Block ended every session of a synthetic account, with no question asked | `src/app/admin/users.tsx`: Block now confirms, like delete and reset. Unblock does not |

### Review, PR #14

Claude Haiku 5.5 at extra effort. Fixed: nested JSONB keys broke import reconciliation for any token with quiet hours, so a cutover would have aborted (`server/migrate.ts`); the phone-number guard missed numbers split by `/`, `,` or bidi marks (`holdsPhoneNumber`); an open Microsoft reauth panel kept a challenge past its five minutes (`useEntraReauth` now refreshes every two). Answered: a note is allowed for any account without a verified email, which is what "no email path" means. A date of eight digits in a note is refused too, by choice: the admin rewords.

The phone runs above predate these three fixes. None changes a screen the trip used: the import is server-side, the reauth panel needs an Entra tenant, and the guard is covered by `tests/api.test.mjs`.

### Open items found by the trip, for the booking and driver sections

- **Route through Israel:** the driver's route from Tulkarm to Ramallah ran west of the Green Line, along roads a West Bank driver may be unable to use. The sandbox uses the public OSRM demo server, so this is not evidence about production's self-hosted `wind-osrm`. Check that graph with the same trip, and the checkpoint-aware claim in `docs/SYSTEM.md`, before the driver section closes.
- **Arrive and pick up work from 80 minutes away:** the driver marked arrival and pickup from Tulkarm for a Ramallah pickup. Decide whether a real trip should warn or refuse.
- **Search field focused with no keyboard:** opening trip search focuses the field but the keyboard stays down until tapped, on the first field of a screen. Later fields do open it.
- **Accessibility state of the pin confirm button:** the a11y tree kept reporting `enabled: false` while the button looked and acted enabled. The admin reset button updates correctly, so it is not all buttons. Check with TalkBack; it may be a stale tree rather than what a screen reader hears.
- **One missed press:** a confirm-pickup tap did nothing on the first try, right after the keyboard closed by hand. It did not recur once the keyboard fix was in, over one retest. Not explained.

### Limits to keep stating

- An attested reset is accountability, not proof: any admin who writes a plausible sentence can reset an account with no email path. Per the email blocker notes that is every account in production until a sending domain exists; confirm the production value.
- The temporary password is known to the admin, and nothing forces a change at next login. The target does see it: every session ends.
- Microsoft flows are verified with synthetic signed tokens only; no Entra tenant is configured.
- Web Locks need a secure context, so plain http keeps the old race. Production is https.
- Older `phone_audit` text written before this change is not scrubbed; PostgreSQL is not live, so none exists in production.

### Test PC

The Android SDK moved to `C:\wq-android-sdk` (the old path is a junction): a space in the path breaks the native build. The disk filled during the APK build, so with the owner's approval 79 SmartStore validation checkouts from before 6 November and 69 stale temp folders were deleted (about 20 GB freed, 20 GB free after). A SmartStore thread also uses this PC and adds about 0.25 GB per run with nothing removing old ones, so this will recur.

### Phone number formats, checked 6 November

No code change. Accepting `+970` and `+972` as one line is supported: in [its ITU notice of 1 October 2024](https://www.itu.int/dms_pub/itu-t/oth/02/02/T02020000FF0001PDFE.pdf) the Palestinian ministry says the move to `+970` "has not been fully completed" and operators "should not change to use CC +970 until further notice". `canonicalGroup` uses `+970` only as an internal key; real SMS routing is the reviewed `routing_e164`, so it follows whichever code works.

Limits: this is the latest public notice found, and it is two years old. A December 2025 [ministry contribution on an "updated National Numbering Plan"](https://www.itu.int/md/T25-SG02-C-0145/_page.print) exists but is restricted to ITU members, so the position may have moved. `056` and `059` as the only mobile prefixes rest on secondary sources ([Wikipedia](https://en.wikipedia.org/wiki/Telephone_numbers_in_Palestine), [1Lookup](https://www.1lookup.io/tools/country-code/970)), not a primary one. Confirm with the ministry or an operator before relying on this for Gaza or any new operator.

### Not started

The rest of the Palestinian-market research (accessibility, connectivity, cash, landmarks, checkpoints), then customer booking, driver and admin sections.

## Owner's goal

Make Wind ready for real Palestinian users: customer registration, booking and trips, driver registration/work, and administration. Work **section by section** and finish the current section before moving on. Research local needs using verifiable sources. The owner permits the named models and asks for no unnecessary questions. Do not claim production readiness from source review or simulated tests. In particular, ride/freight, real payments, dispatch, phone verification and PostgreSQL cutover have safety gates; implement and verify requested workflows before changing gates, and do not deploy or migrate production without authorization.

The preceding interrupted Opus session is <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/a0d34f3c-0235-4bbd-9508-2a5180732584>. Its last run failed with `SELF_SIGNED_CERT_IN_CHAIN`. Its Terra port is <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3A17914186-12a0-4ae6-99c0-6d1a72e1f6d4%3Adelegate-task%3A9aa127ac-0ffa-46e8-a204-427954d3c9a4>. Read the actual histories if more detail is needed. Claude-Mem's `mem-search` skill was read from its GitHub repository; no Claude-Mem MCP search tools were available here. Do not assume it is installed or holds these sessions.

## Claude-Mem: findings and how to use it

- The owner's requested source is [Claude-Mem](https://github.com/thedotmack/claude-mem) and its [mem-search skill](https://github.com/thedotmack/claude-mem/blob/main/plugin/skills/mem-search/SKILL.md). It is a cross-session memory system: hooks capture observations, a worker stores summaries, and search retrieves those summaries. A summary is **not** a transcript, an actual test result, or proof that a change landed.
- If a configured memory connection is available, use the skill's three steps: **search** a narrow project/query to find IDs; **timeline** around relevant IDs; then **get_observations** in one batch for selected IDs. Follow the actual tool schema: native OpenCode names can be `claude_mem_search`, `claude_mem_timeline`, and `claude_mem_get_observations`. Raw tool I/O is a last resort when the selected observations omit exact command output or a diff.
- This session discovered no Claude-Mem search tools; the root `docs/CURRENT-WORK.md` says it was not installed there. We therefore read the T3 thread messages and checked Git branches, files, and K5 logs directly. Those sources, not memory summaries or old handoffs, establish the status below. Do not claim Claude-Mem recovered anything or install/configure its hooks as a side effect of resuming the app task.
- When a memory connection is available later, search for this project and the relevant topic/date, verify the retrieved claim against current source and actual logs, and never save secrets or whole transcripts as memory. The handoff and git state remain the immediate starting points even if memory search is unavailable.

## Recommended subagents for the next lead

Keep the user-selected lead in charge. Use a small number of narrowly scoped workers on the **same active section**, one writer per file, with the lead reproducing findings and owning money, authorization, migration and release decisions. Do not dispatch all sections at once. Delegated reviews are not device or production acceptance. Do not expose `.env`, databases, credentials or production secrets to workers.

| Next task | Recommended worker | Evidence / constraint |
| --- | --- | --- |
| Finish registration/session fixes and their regression tests | **GPT-6.1 Terra, Azure** (`azure-gpt6/gpt-6.1-terra`) | Terra already mapped registration and implemented the Arabic-code and session drafts. It correctly identified the SQLite signup failure and mojibake, both reproduced on K5. Its other findings need verification; session draft explicitly has an unresolved cross-tab race. Assign only disjoint owned files and have the lead review. |
| Independent narrow account/security review | **Kimi K3, AWS Bedrock** (`amazon-bedrock/...kimi-k3`) | Useful second perspective on deletion, recovery and admin proof. An AWS K3 call completed in this continuation, but its market research lacked key primary sources, so do not treat output as verified. Discover the exact currently available model/profile before calling it. |
| Review one small, high-risk diff or second opinion on money/permissions | **GPT-6.1 Sol, Azure** (`azure-gpt6/gpt-6.1-sol`) | Reserve for a bounded, independently checked correctness review of a completed diff. It is not an independent vendor from another GPT/Azure reviewer. The lead remains responsible for the final decision. |
| Palestinian-market evidence for the active section | **Kimi K3 on AWS**, or **Kimi K3.1 Pro on Azure** (`azure-terra/Kimi-K3.1-Pro`) for a *small* packet | Require dated primary URLs, Arabic and English queries, and explicit geographic/uncertainty limits. Azure K3.1 hit its **100k TPM** quota in this session; keep inputs narrow and do not claim its failed result. Previous AWS K3 market output did not verify the necessary ITU/PCBS claims. |
| Later map/route and tracking audit, once registration is closed | **DeepSeek 4.1 Flash Free on OpenCode** (`opencode/deepseek-v4.1-flash-free`) | The previous session's DeepSeek review led to a confirmed route-budget issue. Use it for bounded source/test triage; the lead must verify with the real routing and device tests. This is the free model ID observed on 6 November, not the paid `opencode/deepseek-v4.1-flash`. |
| Later release configuration and orphaned-code inventory | **MiniMax M3.1 Flash**, requested via MiniMax Code | The previous MiniMax sweep produced useful cleanup candidates, but each still needs verification. The requested MiniMax Code provider's exact model availability was not established here; `minimax-mavis/MiniMax-M3.1-Flash` is a separately listed provider, **not** proof that MiniMax Code offers it. Check provider/model and obtain the owner's choice before silently switching. |
| Later visual/accessibility or market-copy review | **Gemini 3.8 Flash via Antigravity**, if actually available | Availability of that exact provider/model was not established. Source review cannot certify Arabic rendering, accessibility, or layouts: the lead must inspect the exact build on the physical phone. |

The model registry can change: discover current IDs, variants and provider availability before delegation; use `orchestrator_capabilities` and `delegate_task` as required by the harness. Record unavailable providers or quota errors rather than claiming a model ran. A child gets a bounded brief, explicit file ownership, no subagents and no commit/push/deploy; the lead independently reviews its diff and runs the K5 gate. Avoid running multiple jobs against the same K5 test directory.

## Critical: preserve the work

- **Continue in** `C:\Users\osama\.t3\worktrees\Fastship\fix-complete-nov5-session`, branch `fix/complete-nov5-session`, HEAD `747f601`.
- **A merge is in progress.** `git status` reports `UU src/road.tsx`: the working file has its conflict markers resolved, but has **not** been staged or committed. Review its combined paid-route foreground fence, no rebill for same stop, and free-route request budget before staging. There are many staged **and** unstaged changes and an untracked `tests/booking-gps-gesture.test.mjs`; inspect `git diff`, `git diff --cached`, and untracked files. Do not reset, clean, discard, or replace them.
- The root checkout `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship` is an old commit `b609229` with extensive unrelated dirty work. Preserve it; do not apply its changes wholesale or use it as the new integration base.
- HEAD already merges `claude/client-recovery-gaps` (`279a9ef`) with the branch for [PR #13](https://github.com/osama-2000236/wind/pull/13). The in-progress merge is `claude/land-stale-tree-fixes` (`2f887c1`): deletion proof, COD replay, session recovery, versioned map delivery, offline recovery, map adapters and tests. Its source worktree `C:\Users\osama\.t3\worktrees\Fastship\t3-bb5ccf24` has the original untracked GPS regression; our worktree has a copy with a Windows line-ending fix and registration in `scripts/run-tests.mjs`.
- PR #13 remains **open**, head `3d085f280f972d7722733b73d6c819a8923cbc77`; its checks were green when checked, and it was linked to this thread. A Haiku review and disposition are recorded in its comments; GitHub Codex review failed on quota. Its production boot checks require explicit `WIND_TRUST_PROXY` and `WIND_PUSH_SUBJECT`, and its backup marker script must be deployed with the API. Do not confuse PR #13 checks with checks of the combined, uncommitted tree. No PR, push, merge to master, production deployment or migration was performed in this continuation.

## Current section: registration, login and account recovery

### Changes made in this continuation

1. **SQLite partial signup:** `persistence.atomic()` is not a SQLite transaction. A synthetic session-insert failure reproduced a 500 and left the account behind (`nov5-reg2.log`). `server/main.ts` now wraps user creation, driver alert and session creation in a short explicit transaction; the password KDF stays outside. `tests/registration.test.mjs` tests failure, rollback and successful retry. Review PostgreSQL savepoint behavior too.
2. **Arabic recovery:** `src/phone/flow.ts` uses `latinDigits` before filtering codes; email reset/profile and admin identity-code fields use it. `tests/phone-ui.test.mjs` exercises Arabic-Indic, Persian, Latin and mixed digits, including real email-code callbacks. `server/main.ts` email verification/reset/support text had mojibake; Arabic text is restored, with a verification-email assertion in `tests/email.test.mjs`.
3. **Session recovery:** Terra changed `src/session.tsx`, `src/copy.ts`, and `tests/session-recovery.test.mjs`: failed token writes fail closed; logout failures are surfaced; delayed cleanup is revision-scoped. `src/parts.tsx` and `src/app/admin/settings.tsx` now display sign-out errors. **Still review carefully:** worker explicitly identified non-atomic cross-tab token compare/delete; cleanup can delete the old recovery cache before token removal fails. Unauthorized-callback cleanup catches errors silently. Preserve authority and avoid letting stale logout delete/revoke a replacement session. The tests are not proof of an atomic localStorage operation.
4. **Queued SQLite native push:** a reviewer found queued notification rows could survive revocation/mute. Eight mocked delivery slots reproduce the ninth send after logout in `tests/native-push-sqlite.mjs` (`nov5-registration-red.log`). The sender now rereads token/session/device binding and preferences after acquiring a slot, and only deletes a matching binding on a dead token. The focused test passed; examine reassignment and provider-in-flight limitations before calling this fully resolved.
5. **Booking GPS:** a manual gesture now cancels the pending location request and marks pickup touched; confirming is disabled/guarded while locating or the map is not ready. The copied regression failed on the old behavior (`nov5-gps-red2.log`) and then passed on K5.

### Still open — do not mark section complete

- Verify whether the PostgreSQL phone identity tables (`phone_profiles`, `phone_mappings`, aliases/challenges) retain identifiable phone data after account deletion and prevent reuse. Terra identified this from source, not runtime; preserve audit/retention requirements and test enrollment, deletion, re-registration and data cleanup before changing it. PostgreSQL activation stays gated.
- Microsoft-only accounts appear to receive an unknown placeholder password, while password/phone changes require the current password. Trace real user flows and implement a safe Microsoft reauthentication or verified-password setup if reproduced; never bypass reauthentication.
- Admin support can reset a non-admin password without recent verified identity. Existing email-code checking is separate and optional. Reproduce and design an enforceable, audited verification path that works when email is unavailable; do not invent unsupported proof or make silent account takeover possible.
- Cross-tab logout and recovery-storage ordering need an explicit, tested fix as noted above. Also test failure display, 401 cleanup, native SecureStore and concurrent sign-in. The current worker tests and changes need independent review.
- The SQLite-to-PostgreSQL importer intentionally excludes `native_push_tokens` (`server/migrate.ts`); now that SQLite stores real registrations, a reviewer flagged that a cutover would lose tokens/preferences and closed apps would not receive alerts until they register again. Verify target schema, JSONB normalization, session foreign-key ordering, old snapshots, and migration/restore reconciliation; do not simply remove it from the exclusion set.
- Verify both Arabic reset and support email text, not just the welcome email; test all administrative code entry points and handover PINs.

## Verification record — distinguish snapshots

- `C:\Users\osama\AppData\Local\Temp\opencode\nov5-combined-gates.log`: **before** the later registration/email/session/push edits, the merged working snapshot passed both TypeScript checks, 114 integration suites, GPS and routing focused tests; lint had two unused-disable warnings, subsequently removed. The persistence run stopped at `tests/pg-import.mjs` because the isolated runner did not set `WIND_TEST_PG_BIN` (`spawnSync pg_config.exe ENOENT`). This is an incomplete persistence result, not an app pass.
- `nov5-reg2.log`: before the signup fix, the session-insert trigger proved the dangling-account bug. The session and phone UI tests passed in that snapshot.
- `nov5-registration-red.log`: before fixes, Arabic welcome mail was mojibake and a ninth queued native push was sent after logout. Its registration test initially aborted early and its finally block obscured the original error; `nov5-reg2.log` is the valid signup reproduction.
- `nov5-auth-green.log`: **after** the focused changes, registration, email, native SQLite push, session recovery and phone UI focused suites, both typechecks and lint passed on K5. This does **not** replace a full current-tree integration/persistence/scenario run. The shell completed successfully.
- Re-run the complete integration and persistence gates, contracts, scenario/browser checks, UI screenshots and any new focused tests on the exact final tree. Inspect flaky presence and PostgreSQL contention failures rather than assuming a retry proves correctness. Existing older evidence and PR checks are useful but are not evidence for the merged tree.

## K5 and physical phone

- K5 SSH works as `ssh -o HostName=desktop-s2jkmk5.local k5 hostname` → `DESKTOP-S2JKMK5`; `~/.ssh/config` currently contains an old IP. Test only on K5 while reachable.
- This continuation created an **isolated** K5 folder `C:\wq-astra-1105`, PostgreSQL port `55485`, and a local runner `C:\Users\osama\AppData\Local\Temp\opencode\nov5-testpc.sh` plus `nov5-run.cmd`. The runner copies current tracked and untracked nonignored source, preserves docs except screenshot/research archives, installs dependencies if its lockfile changes, starts/stops only its own database, and uses a folder lock. `WIND_TEST_PG_BIN` was corrected after the first persistence failure. `cmd /d /c` was used to ensure a failing nested npm test returns to cleanup. Inspect its current lock/process state before reuse; never disturb another session's folder/database. No secrets belong in test logs or handoffs.
- Example from PowerShell: `& 'C:/Program Files/Git/bin/bash.exe' 'C:/Users/osama/AppData/Local/Temp/opencode/nov5-testpc.sh' 'C:/Users/osama/.t3/worktrees/Fastship/fix-complete-nov5-session' 'npm run test:persistence'`. The `cmd.exe` job string supports `&&`; use sequential jobs and retain the exit code. Re-run full gates after all changes.
- Physical `SM-A5360` serial `R5CTB0FJP9Z` was attached. T3 `device_open` succeeded. `ps.wind.app.phonetest` opened but displayed **Can't reach the server**, because a QA sandbox/reverse was not started; this is not acceptance evidence and is not a test of the new build. Use the device tools/returned agent-device command for every UI action; builds/installs and `adb reverse` are allowed. Never start an emulator, clear Chrome, reuse or close another session. Build and identify the exact integrated candidate, run an isolated synthetic backend on `127.0.0.1` with `adb reverse`, and exercise customer/driver/admin end-to-end. No physical iOS device was available.

## Palestinian-market research and next sections

- Azure Kimi K3.1 Pro hit its **100k TPM** limit. AWS Kimi K3 returned a preliminary report, but web search returned HTTP 402 and it did not retrieve the ITU/PCBS numbering/statistics sources. Treat its numeric claims and conclusions as **unverified**. Check primary Palestinian telecom/operator/ITU sources before changing accepted `056`/`059`, `+970`/`+972` formats; avoid claiming complete geographic coverage. Research accessibility, low-connectivity behavior, Arabic RTL/digits, ILS/cash, location/landmarks and checkpoint/ETA limitations with dated primary sources, distinguishing West Bank and Gaza. Never infer legal authorization or payout availability from a model's summary.
- The owner named GPT-6.1 Terra (Azure), Kimi K3 (AWS), Kimi K3.1 Pro (Azure 100k TPM), DeepSeek 4.1 Flash free (OpenCode), MiniMax M3.1 Flash (MiniMax Code), Gemini 3.8 Flash (Antigravity), and other suitable providers. Discover exact available model IDs and provider capabilities; do not silently substitute. Use narrow read-only reviews, one writer per file, no secrets, and personally verify findings. User wants quality and efficiency, not model use for its own sake.
- After registration/account recovery is actually green, cover customer booking/trips and interrupted retries; then driver onboarding/approval, offers, pickup, navigation, delivery and cash; then admin identity, support, operations and permissions. For each section record source, positive/negative tests, real-device evidence, accessibility/RTL, recovery, operational dependencies and remaining uncertainty. Finally cover joins, backup/restore, release packaging and staged deployment readiness.
- Apply `AGENTS.md`/`CLAUDE.md`: Expo SDK **57**, fetch matching versioned docs before touching Expo/RN APIs, no hand edits to generated native directories, run lint/typecheck, refresh bilingual screenshots after UI changes. Do not add paid Google calls or bypass map provider restrictions.

## First actions for the next lead

1. Read this handoff, the current git status/diffs and the prior thread; preserve every dirty file. Review and stage the already-resolved `src/road.tsx` conflict only after confirming both routing behaviors; finish the merge without losing unstaged work.
2. Finish the **registration/account** open items above; add failing behavioral tests first. Check real operational provider gates instead of declaring their configuration complete.
3. Run focused checks and then full integration/persistence on the isolated K5 environment; build a candidate and perform phone acceptance. Document exact evidence, blockers and remaining scope honestly. Continue section by section.
