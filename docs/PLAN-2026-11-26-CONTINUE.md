# Continue Fastship from one feature branch

Prepared 26 November 2026. Read this before older handoffs.

## Starting point and authority

- Active branch: `feature/session-consolidation-20261126` in the main Fastship checkout.
- Base: `origin/master` at `941d5cac35030119bcf543599fbc7904441e22fe` (PR #119 merged). The local branch named `master` is an older, diverged lineage. Do not branch from it.
- This branch contains the reviewed server/recovery fixes, their regressions (including recovery snapshot consistency), the SQLite contract update, the Docker entry point, the standing delivery policy, and this continuation record. Commit status and final verification are in [the review report](reviews/2026-11-26-session-consolidation.md).
- Keep one active writer. The 86 other primary sessions were inventoried from their latest handoffs; none was running when takeover began. Do not resume an old writer against this checkout.
- The earlier root snapshot remains at `backup/root-review-20261125` (`2fc10b51`). It is evidence to compare, not a replacement for current master.
- Routine commits, pushes, PRs, merges and deployments follow the owner's standing review-gated delivery approval in `AGENTS.md`. Proceed automatically when those gates pass. Actions outside that approval, such as a database-platform cutover, destructive data operation or new spending commitment, still require the specified owner input.
- Tests and heavy builds stay on Docker cloud sandbox `sbx_001m7sknp49sr4g8bytx182r0z2`, through SSH. One job at a time. Never install dependencies in that sandbox; reuse a verified matching prepared cache.
- Acceptance uses the physical Galaxy A53 (`R5CTB0FJP9Z`). Never start an emulator. Keep isolated test backends on loopback with `adb reverse`; preserve Chrome's profile and unrelated tabs.

## 1. Reviewed local checkpoint

**Purpose:** retain the recovered fixes on the current release lineage without bringing back superseded UI, deployment, or dependency code.

1. Check `git status --short --branch`, `git rev-parse HEAD`, and `git diff --check`.
2. Read the final diff for `server/main.ts`, `server/domain/payments.ts`, `server/db/sqlite-schema.ts`, `server/migrate.ts`, and their tests. The report records failing-before and passing-after evidence.
3. Inspect the schema fixture diff. Only `orders.version`, its trigger, and the resulting column positions should change. Installed HTTP fixtures are unchanged.
4. Completed with owner approval on 26 November 2026: the 19-file checkpoint is `34a4f810c7d243155109f19484b48e03b0df4050`. Save subsequent reviewed fixes under the standing delivery policy. `.artifacts`, environment files, databases, research clones and other worktrees remain outside commits.
5. When integrating this feature branch, target the current remote `master`, check for intervening changes, repeat the affected gates, and describe the behavior fixes and the migration compatibility decision. Link the PR through T3 immediately after creating it; follow the standing policy through merge and rollout when all release gates pass.

**Acceptance:** reviewed changes are saved on this one branch, the exact tested revision/tree is identified, and no unrelated snapshot is merged. A local commit is distinct from a push or deployment.

### Published candidate and rollout checkpoint

- The application candidate is pushed to `origin/feature/session-consolidation-20261126`: initial checkpoint `34a4f810`, snapshot-consistency fix `67d28e88`, then standing-policy commit **`e5fd732255764efc56362eb2d0f8b3cc5ab1aa11`**. Later delivery-record edits are documentation only; resolve the final branch tip with `git log -1`.
- Two fresh independent subagents, `review_delivery_final_a` and `review_delivery_final_b`, returned **APPROVED** for the final policy/recovery diff and the committed sensitive fixes. Docker verification passed **168 integration suites**, lint, both typechecks, and **60 PostgreSQL 18.6 persistence suites + 22 legacy suites**, with a clean final exit 0. A Windows stdin carriage-return trailer was fixed by using SCP plus a Bash file and rerunning the gate. GitHub checks for `e5fd7322` also passed: **verify, persistence, image and validate**.
- Prepared and downloaded owner-local `.artifacts/delivery-policy-20261126/wind-reviewed-e5fd7322.tar.gz`, SHA-256 **`ee2d20112f60082bab167221c08bbf7ee9f425ec67402fa7c07e70fd6b3e2076`**. Its Docker build used one Metro worker and passed the packaged production dry run: readiness `{ "ok": true, "schema": 3 }`, web HTTP 200. Logs, reviewed source hashes and reviewer records are alongside it; private/generated evidence is excluded from Git.
- Normal Git push now uses the existing owner's protected credential through a repository-only Git Credential Manager helper reset; the globally active CLI account was restored. Two independent environment reviewers approved the corrected deployment-access repair. The existing SSH rule now allows only the current operator `/32`; all other semantic properties were checked unchanged. The host's Ed25519 public key was obtained through authenticated Azure VM access and strict SSH verification passed.
- Read-only production preflight at **14:53 UTC on 26 November** found `/opt/wind-releases/20261123185342` active, API/Caddy active, no ingress hold, passwordless sudo available, backup marker **14:00 UTC**, and readiness `{ "ok": true, "schema": 3 }`. No application install/restart or production data change occurred.
- **Blocker (resolved 26 Nov):** the owner added the second account as a collaborator, PR #120 merged at `f709cd8b`, and it was deployed as release `20261126200823`. Original note: T3's separate PR service returned `Validation Failed; must be a collaborator`. It identifies the correct repository; CLI owner access and the normal push work. The owner reported reconnecting T3, but the retry returned the same error. No PR was created or merged, and this candidate has **not been deployed**. That T3 connection needs effective repository write access; do not add another collaborator or bypass integration/branch protection as a workaround.

**Done on 26 November (superseded steps removed):** PR #120 merged at `f709cd8b` and was deployed as release `20261126200823`; PR #121 followed as release `20261126212854`. The Android APK 1.1.6 versionCode 44 was published before its full physical acceptance; the open checks are in §4 and in the runbook's State block (`docs/operations/deploy.md`, "Firebase and native push").

## 2. Complete native acceptance of PR #119 and this server candidate

**Purpose:** close the phone-specific gaps left by the prior Claude session. Deterministic hook tests and a web phone run do not prove a native first frame or background behavior.

**Sources:** `src/use-second-tick.ts`, `src/app/driver/index.tsx`, `tests/second-tick.test.mjs`, `scripts/check-phone-tests.mjs`, `scripts/phone-test-server.mjs`.

1. Confirm the attached physical device and record the installed app/build identity. Use an isolated test app/backend; never turn a synthetic journey into a production booking.
2. Confirm that the native app actually contains PR #119 before claiming its acceptance. If a new native build is needed, use the established EAS profile/environment under the standing delivery policy; request only missing access or any new spending commitment. Keep generated native projects out of source.
3. Leave the driver board open with no timed offers, then introduce a synthetic timed offer. Record the first visible frame: correct countdown, no disabled Accept flash, no temporary loading reason shifting the sheet.
4. Blur and refocus the screen, let an offer expire, decline one, and accept another. Verify one action per tap, correct expiry, and no idle ticking after the last timed offer disappears.
5. Against this server candidate, read an order's recovery snapshot, change its pickup instructions without changing status, and prove a command from the old snapshot is refused. Refresh and retry with a new command; prove the valid action happens once.
6. Walk Arabic and English at 200% text and with TalkBack: sign-in tabs, driver earnings, merchant acceptance, code entry with the numeric keyboard, map Recenter and the main tab bar.

**Acceptance:** build/source identity, physical-device captures, exact checks and limits are recorded. Browser acceptance stays labeled browser acceptance. Missing build/access leaves the native checks explicitly open.

## 3. Close the unfinished Arabic/English review

**Purpose:** the two localization sessions ended on unavailable-model/quota conditions, not a completed language review.

**Sources:** `src/copy.ts`, `src/ui.tsx`, `src/parts.tsx`, the customer/driver/admin/shop routes, `public/install.*`, and the current `docs/screens` index.

1. Review one role at a time: authentication/customer, driver, merchant, admin, public installation/tracking.
2. Compare the two languages for missing content, plural counts, dates, money, disabled reasons, recovery instructions and physical RTL layout. Preserve the existing theme and product decisions.
3. Start with actual text or layout failures; do not reapply the old design extraction worktree wholesale. Its base predates the merged design system and release fixes.
4. Add a focused behavioral regression for risky interactions; refresh captures only for affected UI or when a full screenshot sweep is warranted. Run the screenshot/build work in Docker, then inspect on the A53.
5. Re-run lint, both typechecks, affected suites and the physical checks for the edited role before moving to the next role.

**Acceptance:** each role has explicit reviewed/fixed/unverified findings; Arabic street-data limitations are distinguished from translation defects. No claim that a failed model session completed the audit.

## 4. Native push: live on Android, acceptance to finish

**Status, 26 Nov 21:55 UTC: Android push is live.** See `docs/operations/deploy.md` ("Firebase and native push", State block) and the CURRENT-WORK entry. Done:
- Firebase access.
- The platform-restricted config and FCM V1 key in EAS.
- The delivery gate (PR #121).
- The push-enabled APK vc44.
- The production switch.
- On the A53, background delivery of a push sent from the host, and the tap that opens Support.
- SDK 57 notification permission and channel check (code check; the SDK 57 notification docs were not re-read this time): the app creates the `default` high-importance channel before asking (`src/native-push.ts`), and the server names it (`server/push.ts`). The Fable shared-channel module was not adopted.

**Sources:** `src/native-push.ts`, `server/domain/native-push.ts`, `server/push.ts`, `server/worker.ts`, `app.config.js`, `eas.json`, and the native push suites.

Still open, on the physical A53 with a two-role trip:
1. Job and status events from real orders with the app terminated (this closes runbook step 6).
2. The other states: foreground, permission denial and its recovery, token rotation, logout, account switch, wrong-role taps, duplicate delivery.
3. iPhone push (APNs) when an iOS build is planned.
4. Firebase password reset after email verification (design §0 item 6 and §10).
5. Watch the pilot after the rollout: compare push receipts and support reports for missed alerts, with the runbook's rollback ready.

If acceptance fails, turn the production switch off with the runbook's rollback. Phones bring their local alerts back within 10 minutes.

**Acceptance:** real provider and device evidence for each state above, with safe session routing.

## 5. Keep PostgreSQL cutover separate from the live SQLite pilot

**Purpose:** the live pilot and the PostgreSQL extensions have different capability gates. The current PostgreSQL dispatch/measurement path still treats occupied vehicles as exclusive.

**Sources:** `src/model.ts` (`canTake`), `server/domain/eligibility.ts`, `server/domain/dispatch.ts`, `server/migrate.ts`, `tests/pooling.test.mjs`, `tests/capacity.mjs`, and the dispatch/PG import suites.

1. Pin the pilot's seat rules: four car seats, one motorcycle seat, parcels alongside shared riders, and exclusive private ride/freight/shop jobs.
2. Trace every PostgreSQL admission path: board projection, direct accept, negotiated offer, customer offer accept, dispatch round, measured reservation and admin assignment.
3. Add concurrent capacity cases before implementation. Include two competing final-seat accepts, mixed parcel/rider work, release/reassignment and shared-vehicle records.
4. Port the same rule consistently through admission, reservation and serialization. Keep the existing feature gates closed while incomplete; do not create a partial production cutover.
5. Re-run the full PostgreSQL 18 persistence and legacy suites, import/restore parity, and physical multi-order acceptance.
6. Preserve the new reconciliation rule: only the derived order revision may differ across engines. Row identities, all other content and financial totals must still match exactly.

**Acceptance:** every admission path enforces the same capacity rule, existing commands remain compatible, and the migration/restore evidence covers the exact candidate. A production migration still needs separate owner approval.

## 6. Reconcile historical task lists and unmerged work

**Purpose:** avoid repeating old work or discarding ideas merely because Git patch IDs differ after squash merges.

1. Use [the worktree inventory](reviews/2026-11-26-worktree-inventory.md). Raw session handoffs, full status lists, substantive diffs and patches are preserved locally under `.artifacts/takeover-20261126/`.
2. Treat line-ending-only changes as such. Do not run a mass formatter or reset a worktree with substantive edits or untracked files.
3. For each retained scope, compare its requirement, tests and callers against current `origin/master`; port only a reproduced missing behavior into this same active branch, in a small slice.
4. In particular, do not restore the old `SessionProvider.forget` behavior that swallowed token-deletion errors. The current release intentionally reports a failed sign-out while a live credential remains stored; server-ended sessions have their own local fallback.
5. The old BR01–BR04 checklist describes a different booking design. Current `src/booking.ts` uses an immutable command identity, an explicit server deadline, and conservative receipt recovery. Reconcile acceptance against that current protocol; do not mark the literal old tasks complete from a suite count.
6. Preserve the research archives and old local lineage. They contain useful evidence and user-owned material; they are not runtime dependencies or active release branches.
7. Remove another worktree only after its unique work is incorporated or deliberately archived, and its ignored data/dependency targets are accounted for. Never force-remove a dirty tree to make a count look clean.

**Acceptance:** every retained tree has a disposition and recovery path. Only one active feature writer remains, without erasing history or private QA state.

## 7. Operations follow-up after a release under the standing delivery policy

- Prepare a release package and disposable SQLite rehearsal for the additive revision migration. Preserve the previous release and a pre-install database checkpoint.
- Recheck current deployment state rather than copying dates/host state from `docs/CURRENT-WORK.md`. The original checkpoint left production untouched; the later access repair and read-only preflight are recorded above. At the 14:53 UTC preflight no application deployment or production data change had occurred; production has since run releases `20261126200823` (PR #120) and `20261126212854` (PR #121).
- Verify alert email delivery and run the timed replacement-host recovery drill from `docs/operations/azure-recovery-review.md`.
- Retire/redirect the old host only with the required student-project access and approval of that outward action.
- Verify the pilot's actual provider behavior with controlled field journeys. Routing fixtures and rendered tiles do not prove permitted roads or background GPS.
- Keep the unrelated `projects-verification` sandbox directory and other projects' images until their owners explicitly authorize cleanup. This task did not delete them.

**Acceptance:** release, restore and alert evidence refer to the actual deployed revision, with a measured recovery result and an explicit production decision.

## 8. Product flows: one app, profiles you switch

**Purpose:** remove the complexity of three services and three roles without removing features. The owner asked on 26 November for one person to switch between Personal, Captain and Shop the way a Facebook profile switches to a Page, with a simple, fast experience.

- Design authority: [one-app flows and profiles](design/FLOWS-2026-11-26-one-app-profiles.md), merged from independent Claude Opus 5.5 and GPT 6.2 Sol studies. Clickable sketch (private to the owner): <https://claude.ai/artifact/M7zMDXwXBp7g7uk51wKs8C>.
- Tickets F0–F11: `.scratch/one-app-profiles/issues/`, in build order, with `Blocked by:` lines.
- Order (design §11): F0 baseline runs with §2 on the same phone and builds. Then F1 home and F2 map host. Then F3 → F4 → F5 for profiles, with F3 landing alone. Run this plan's §3 language review after F1, F4 and F5 change the screens. Then F6–F9, §4 push and F10. §5 cutover stays separate.
- F3–F11 change auth, session, persistence, orders or money and need two independent reviewers; F0–F2 need one.

**Acceptance:** each slice's A53 acceptance in design §9, with before/after measurements under design §7.

## Repeatable verification and handback

1. From the feature checkout: `powershell.exe -NoProfile -File .\test.ps1` (Docker cloud, syncs uncommitted source).
2. On that exact synced tree over SSH, sequentially run `npm run lint`, `npm run typecheck`, `npm run check:audit`, and `npm run test:contracts`.
3. Set `WIND_TEST_DATABASE_URL=postgresql://fastship_test@127.0.0.1:55474/fastship_test` for `npm run test:persistence` on the existing PostgreSQL 18 container. Check the real server version first. Do not substitute PG16 for this gate.
4. Build/export with one worker in Docker. Run the appropriate isolated UI suite. For the physical Chrome suite, forward only its own loopback backend and debugging ports and close only the test tab.
5. Record command, host, exit status, source identity, provider tier and device/build identity. Report skipped checks explicitly.
6. Run `git diff --check`, review the final file list, and automatically complete the covered commit/push/deployment steps after subagent approval and verification. Ask only for inputs or actions outside the standing approval in `AGENTS.md`.

Handback: branch and revision/tree; issue -> change -> verification for every fix; gate results; physical-device scope and limitations; remaining owner-only inputs; next exact task. Keep credentials, private account data and raw GPS out of the handback.
