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

- **Route through Israel (owner decision needed):** the driver's route from Tulkarm to Ramallah ran west of the Green Line. The sandbox uses the public OSRM demo server, but production is likely the same: `infra/osrm/Dockerfile` builds from Geofabrik's `israel-and-palestine` extract with the default `car.lua`, so nothing excludes Israeli roads, and no production route was checked. Whether that is wrong depends on which plates and permits the first drivers hold, and the rollout is West Bank first. The fix is a routing profile or a West Bank graph, once the owner says which roads drivers may use. `docs/SYSTEM.md` already says the code does not verify route coverage.
- **Arrive and pick up work from 80 minutes away:** the driver marked arrival and pickup from Tulkarm for a Ramallah pickup. Decide whether a real trip should warn or refuse.
- **One missed press:** a confirm-pickup tap did nothing on the first try, right after the keyboard closed by hand. It did not recur once the keyboard fix was in, over one retest. Not explained.

### Booking section, on `fix/booking-section`

**Everything testable without the phone is done. The phone was not attached on the afternoon of 6 November (`adb devices` empty, nothing on USB), so the items marked below as needing it are blocked, not finished.**

**Fixed earlier and rechecked on the A53, the morning of 6 November in the previous session (not rerun, and no log names these two changes):**

- **Enabled buttons reported as disabled to accessibility tools.** A control going from `disabled` to `undefined` kept Android's disabled flag, so the pin confirm read as disabled while it worked; TalkBack may also have refused to activate it, not tested. `Press` now always sends a boolean. The tree now reports it enabled. **TalkBack itself has not been run.**
- **Trip search opened with the field focused and no keyboard.** `autoFocus` on the active field opens it on arrival.
- **Recovery card said "this identifier" to customers.** Reworded in Arabic and English. Text only, not seen on the phone.

Passed on the A53, no change needed: with the backend cut mid-order the app showed the pending card and blocked edit; the pending order survived an app relaunch and a backend restart; the retry created exactly one order (W-00005); cancel confirmed first and the order list showed it cancelled. A response lost after the server took the order was not driven on the phone; `tests/` covers that replay.

**Fixed after that, without the phone:**

| Issue | Change | Proof |
|---|---|---|
| A refused route told the customer to check their connection, and retrying could never help | `src/app/book.tsx`: a 4xx refusal from `/price` shows the server's reason; transport, 5xx, 401, 408 and 429 keep the connection message | Scenario stage `price refusals...`; reverting the fix fails it |
| `route_prohibited`, `itinerary_changed`, `quote_not_found` had no message, so they read as "something went wrong" | Copy in both languages | `tests/schedule.test.mjs`, same scenario stage |
| After `itinerary_changed` or `quote_not_found` the old price stayed requestable while the new one loaded | Both now call `requote()`, which disables Request until the price lands | Same stage. The first version of this test passed with the fix reverted, because the price refetches anyway; it now asserts Request stays disabled during a delayed response, and fails with the fix reverted |
| A scheduled order whose time passed with no driver said only "finding a driver" | New `scheduledMissed` text, customers only. Expiry and dispatch unchanged | Same stage; reverting fails it |
| The scheduled hint said cancel stops when a driver accepts; the server and the button allow it until pickup | Copy now says "until pickup" | `tests/schedule.test.mjs`: failed first, then passed |
| With two SQLite processes a driver accepting between cancel's read and its update got no cancellation push | `POST /orders/:id/cancel` re-reads before notifying | **Not reproduced**: that window was never hit in a test. Correct by reading the code; `tests/cancel-race.test.mjs` guards the behaviour |
| Reschedule updated by id alone | The update now requires a searching order still outside the release window. It does not compare the time the customer read, so two tabs still end as last write wins | `tests/cancel-race.test.mjs` race C |
| "Keep time" ran past the card edge at 130% text | The row wraps | `scripts/screens.mjs` booking check failed first, then passed |

**Cancel race:** `tests/cancel-race.test.mjs` (SQLite) and `tests/pg-cancel-race.mjs` (two PostgreSQL API processes) run cancel against accept, pickup and reschedule, 20 concurrent rounds plus both fixed orderings. Cancel always succeeds against an accept. Racing the pickup, exactly one of the two wins; once in transit, cancel is refused with `cannot_cancel`. An accepted courier gets the push and no load or earnings remain. Mutation-checked: dropping the driver's push, or allowing cancel in transit, turns the SQLite test red. `tests/dispatch-races.mjs` no longer skips its cancel check silently. Driven by API only, not on a phone.

**Real defect found, partner cancel on PostgreSQL:** partner routes run outside the request's row lock, so a driver could accept between the partner cancel's read and its update. The order was cancelled and the driver was never told, and would keep driving to the pickup. Reproduced on round 0 of a new race in `tests/pg-cancel-race.mjs`, then fixed by re-reading before notifying. Partner API needs `SOUQ_PARTNER_KEY`.

**Ride and freight:** the service list, form and schedule picker render in both languages. The ride trip and the freight counter-offer pass in the browser scenarios, on the test PC. `scripts/check-expanded-services.mjs`, their real phone run, needs the phone. Production stays parcel-only (`WIND_ENABLED_SERVICES`).

**RTL and large text:** `npm run screens -- --only=booking-narrow` runs eight booking views at 360 px, 100% and 130% text, Arabic and English. It scales font sizes in the browser, without line height, so it finds overflow and clipped buttons and proves nothing about Android's font scale. Clipped Arabic descenders in its pictures come from the method. `Button` labels are raw `Text` with no `maxFontSizeMultiplier` while `Txt` caps at 1.35, so button text can grow further than the rest on a device. Not judged without the phone.

**The missed confirm press: not explained.** Two candidates, neither proven: the map's `moving` message disables Confirm during a move (`public/map.html:329`), including the 350 ms ease on arriving at the pin (`:197`); or the tap landed while the keyboard window was still closing. The keyboard path is gone either way, because search now dismisses before leaving. Retest when the phone is back: pick a place, tap Confirm at once, 20 times, and count misses.

**Needs the phone:** English on the phone, Android large text, TalkBack, ride and freight on the device, the cancel race seen from the app, the confirm-press retest.

**Recovery:** a pending booking, a lost reply and a refused reply are covered above. A scheduled order nobody takes keeps searching for 24 hours after its time (`SEARCH_EXPIRY_MS`), then is cancelled with a push.

**For the PostgreSQL cutover:** the client never reads `quoteExpiresAt`, so after the 120-second quote lifetime the old price stays shown and the first press is refused with `quote_expired`, then the price refreshes. Nothing is charged at the old price. Not changed: refreshing on a timer would add `/price` calls from idle forms. SQLite has no quotes, so this is not live today.

**Operational dependencies:** `WIND_ENABLED_SERVICES` for ride and freight; dispatch and boarding gates; real SMS and email are not configured.

### Palestinian-market evidence for booking, checked 6 November

Drafted by Kimi K3; each row below was rechecked by the lead unless it says otherwise. Figures are as printed by the source.

| | West Bank | Gaza | Source |
|---|---|---|---|
| Mobile data today | 3G since 2018; Israel approved 4G on 4 January 2026 | 2G only, excluded from that approval | [Jerusalem Post/Reuters, 6 Jan 2026](https://www.jpost.com/middle-east/article-882496), [Times of Israel, 6 Jan 2026](https://www.timesofisrael.com/israel-grants-4g-access-to-palestinian-west-bank-cell-companies-after-delay-due-to-war/) |
| When 4G arrives | Reported as four to six months in January. An Ooredoo filing reportedly assumes a 2027 start | Same report: mid-2027 | [Times of Palestine, 30 Jul 2026](https://www.timesofpalestine.com/en/story/israel-s-spectrum-hold-delays-palestinian-4g-to-7c751a9c6d.html). One secondary report of an accounting assumption; the filing itself was not read |
| Postal codes | Published by the ministry for all 11 governorates | Published for all 5 | [Ministry of Telecom and Digital Economy](https://www.mtde.gov.ps/home/PostalCodes): the list of 16 was read. Actual use was not measured |
| Household internet, Q1 2022 (not rechecked) | 91%; smartphone owners aged 10+ 82% | 90%; 56% | PCBS press release, [postId 20321](https://www.pcbs.gov.ps/ar/post-details/?postId=20321). Pre-war data, and Kimi's reading only: the lead's page tool does not take query strings |
| Landmark addresses (not rechecked) | Most buildings have no street number; addresses use landmarks | No source found; do not assume | [Engage in Palestine, 17 Mar 2022](https://ecpalestine.org/sending-and-receiving-mail-in-the-west-bank-palestine). One local organisation, not a survey |

**What this means for booking (interpretation):** plan for West Bank users on 3G for now. **Booking has never been measured on a 3G connection**; all phone runs used a local backend. Pin-and-landmark entry fits the evidence. Accessibility, cash and checkpoints were not researched for this section yet. Kimi's report also cited outage details for Gaza and the West Bank, which were not rechecked and are left out here.

### Workers used on 6 November

| Job | Model | Result | Reuse |
|---|---|---|---|
| Delegation probe, booking test list | `azure-gpt6/gpt-6-luna` | Accurate | Yes |
| Trace scheduled, ride, freight flows | `azure-gpt6/gpt-6-luna` | Five findings; three led to fixes, one was narrowed, one was not a defect | Yes, for reading only |
| Cancel race tests | `azure-gpt6/gpt-6.1-sol` | Strong. One setup line was wrong (`registration_closed`), fixed by the lead | Yes |
| Price refusal and scheduled text | `azure-gpt6/gpt-6.1-terra` | Fix correct. One test could not fail, and a message showed to drivers too; both fixed by the lead | Yes, check tests by mutation |
| Market evidence | `amazon-bedrock/us.moonshotai.kimi-k3` | Useful, but one cited URL was dead and it missed the later 2027 report | Yes, with rechecking |
| Source review | `amazon-bedrock/us.moonshotai.kimi-k3` | No findings. One run was interrupted with no result, and the retry finished | Yes |
| Review, first choice and fallback | `azure-terra/Kimi-K3.1-Pro`, `azure-terra/grok-4.7` | Both stopped on `exceeded token rate limit`, no output | Not for a diff this size |

Owner decisions:
- **Flat ₪20 parcel:** `SPEC-parcel-standard` sets it by owner instruction. In practice Ramallah to Nablus, 53.5 km and about an hour, pays the driver ₪17, against ₪74 for a ride on the same road. It assumes a courier carrying many parcels; a single-parcel driver takes a loss. Not changed.
- **Israeli roads:** below.

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

Driver and admin sections. Palestinian-market research for accessibility, cash and checkpoints.

## Owner's goal

Make Wind ready for real Palestinian users: customer registration, booking and trips, driver registration/work, and administration. Work **section by section** and finish the current section before moving on. Research local needs using verifiable sources. The owner permits the named models and asks for no unnecessary questions. Do not claim production readiness from source review or simulated tests. In particular, ride/freight, real payments, dispatch, phone verification and PostgreSQL cutover have safety gates; implement and verify requested workflows before changing gates, and do not deploy or migrate production without authorization.

The preceding interrupted Opus session is <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/a0d34f3c-0235-4bbd-9508-2a5180732584>. Its last run failed with `SELF_SIGNED_CERT_IN_CHAIN`. Its Terra port is <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3A17914186-12a0-4ae6-99c0-6d1a72e1f6d4%3Adelegate-task%3A9aa127ac-0ffa-46e8-a204-427954d3c9a4>. Read the actual histories if more detail is needed. Claude-Mem's `mem-search` skill was read from its GitHub repository; no Claude-Mem MCP search tools were available here. Do not assume it is installed or holds these sessions.

## Claude-Mem: findings and how to use it

- The owner's requested source is [Claude-Mem](https://github.com/thedotmack/claude-mem) and its [mem-search skill](https://github.com/thedotmack/claude-mem/blob/main/plugin/skills/mem-search/SKILL.md). It is a cross-session memory system: hooks capture observations, a worker stores summaries, and search retrieves those summaries. A summary is **not** a transcript, an actual test result, or proof that a change landed.
- If a configured memory connection is available, use the skill's three steps: **search** a narrow project/query to find IDs; **timeline** around relevant IDs; then **get_observations** in one batch for selected IDs. Follow the actual tool schema: native OpenCode names can be `claude_mem_search`, `claude_mem_timeline`, and `claude_mem_get_observations`. Raw tool I/O is a last resort when the selected observations omit exact command output or a diff.
- This session discovered no Claude-Mem search tools; the root `docs/CURRENT-WORK.md` says it was not installed there. We therefore read the T3 thread messages and checked Git branches, files, and K5 logs directly. Those sources, not memory summaries or old handoffs, establish the status below. Do not claim Claude-Mem recovered anything or install/configure its hooks as a side effect of resuming the app task.
- When a memory connection is available later, search for this project and the relevant topic/date, verify the retrieved claim against current source and actual logs, and never save secrets or whole transcripts as memory. The handoff and git state remain the immediate starting points even if memory search is unavailable.

## Earlier record: registration, login and account recovery (5 November; see the status update above for what closed)

### Changes made in this continuation

1. **SQLite partial signup:** `persistence.atomic()` is not a SQLite transaction. A synthetic session-insert failure reproduced a 500 and left the account behind (`nov5-reg2.log`). `server/main.ts` now wraps user creation, driver alert and session creation in a short explicit transaction; the password KDF stays outside. `tests/registration.test.mjs` tests failure, rollback and successful retry. Review PostgreSQL savepoint behavior too.
2. **Arabic recovery:** `src/phone/flow.ts` uses `latinDigits` before filtering codes; email reset/profile and admin identity-code fields use it. `tests/phone-ui.test.mjs` exercises Arabic-Indic, Persian, Latin and mixed digits, including real email-code callbacks. `server/main.ts` email verification/reset/support text had mojibake; Arabic text is restored, with a verification-email assertion in `tests/email.test.mjs`.
3. **Session recovery:** Terra changed `src/session.tsx`, `src/copy.ts`, and `tests/session-recovery.test.mjs`: failed token writes fail closed; logout failures are surfaced; delayed cleanup is revision-scoped. `src/parts.tsx` and `src/app/admin/settings.tsx` now display sign-out errors. **Still review carefully:** worker explicitly identified non-atomic cross-tab token compare/delete; cleanup can delete the old recovery cache before token removal fails. Unauthorized-callback cleanup catches errors silently. Preserve authority and avoid letting stale logout delete/revoke a replacement session. The tests are not proof of an atomic localStorage operation.
4. **Queued SQLite native push:** a reviewer found queued notification rows could survive revocation/mute. Eight mocked delivery slots reproduce the ninth send after logout in `tests/native-push-sqlite.mjs` (`nov5-registration-red.log`). The sender now rereads token/session/device binding and preferences after acquiring a slot, and only deletes a matching binding on a dead token. The focused test passed; examine reassignment and provider-in-flight limitations before calling this fully resolved.
5. **Booking GPS:** a manual gesture now cancels the pending location request and marks pickup touched; confirming is disabled/guarded while locating or the map is not ready. The copied regression failed on the old behavior (`nov5-gps-red2.log`) and then passed on K5.

### Open on 5 November, resolved in the 6 November table above

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
