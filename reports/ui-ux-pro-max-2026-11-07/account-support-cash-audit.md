# Account, support, recovery, roads, cash and subscriptions audit

**Date:** 2026-11-07  
**Baseline:** `f8d58c14d43cc31475411899ebfa29c23b04f79c` (verified as `HEAD`)  
**Model:** `kimi-k3.1-pro`  
**Mode:** read-only source audit. No product edits, tests, phone, emulator, commits, or image reads.  
**Result:** **26 source-confirmed findings: 20 Medium, 6 Low; no High or Critical finding established.**

## Scope and evidence limits

This packet covers the requested remaining surfaces: `src/app/(customer)/account.tsx`, `src/app/profile.tsx`, `src/app/help.tsx`, `src/app/roads.tsx`, `src/app/driver/trips.tsx`, `src/app/driver/account.tsx`, `src/app/admin/cash.tsx`, `src/app/admin/subscriptions.tsx`, the shared account/referral/notification widgets in `src/parts.tsx`, `src/phone-card.tsx`, `src/phone-recovery.tsx`, `src/install-link.tsx`, `src/native-push.ts`, `src/push.ts`, and relevant Arabic/English copy. Contextual reads are listed at the end.

**No visual claims:** no PNG was opened or decoded. Screenshot coverage below is derived only from `docs/screens/README.md` and the capture manifest in `scripts/screens.mjs`. Source geometry is not a physical hit-test; keyboard, TalkBack/VoiceOver, RTL rendering, dynamic text and motion remain device-acceptance items.

Severity: **Medium** = material task failure, misleading financial/security state, inaccessible recovery, or destructive friction with a bounded workaround; **Low** = localized feedback, validation, copy or robustness defect. Each regression entry is a proposed test, not evidence that a test ran.

## Action and state inventory

| Surface | Every exposed option/action traced | State/result coverage in source |
|---|---|---|
| Customer/driver Account | Language; Edit profile; Help; Road status; plan request; push toggle/denied help; referral share; password open/change/cancel; sign out; delete with password or Microsoft/retry/cancel | Destructive confirmations and most busy/error states exist. Defects AS-01–AS-07, AS-14 and AS-26 remain. |
| Profile | Name save/keyboard submit; phone verify/change/send/prove/resend/cancel; email send/verify/resend/change/save | Disabled reasons, provider truthfulness and request fencing are strong. AS-06, AS-08–AS-10, AS-12 and AS-13 remain. |
| Help / Install | Support; eight FAQ disclosures; privacy; iPhone-install instructions | Role-filtered FAQ and order reference exist. AS-14–AS-16 remain. |
| Roads | Refresh; open/slow/closed reports; admin place/move/remove; new checkpoint name/cities/pin/add | Initial loading/error/retry, empty, permission-gated reporting, confirmation and pin-map failure states exist. AS-17 and AS-18 remain. |
| Driver Trips | Refresh; empty-state Jobs; order rows; older-history pagination | Active/run-sheet/last/history grouping and initial/empty states exist. AS-17 remains; no additional trips-only defect confirmed. |
| Admin Cash | Refresh; record remittance; pay driver; adjustment; pending-entry confirm/dispute; reason/evidence; resolve/cancel | Validation, idempotency key, destructive dialog and success live region exist. AS-17 and AS-19–AS-23 remain. |
| Admin Subscriptions | Refresh; activate; reject | Loading/error/empty, per-action spinner and global duplicate guard exist. AS-17, AS-24 and AS-25 remain. |
| Phone recovery | Send; code + new password save; resend after countdown; back to sign-in | Generic anti-enumeration reply, gates and validation exist. AS-08 and AS-11 remain. |
| Native notifications | Automatic permission/token registration; notification tap deep link | Cold/warm duplicate handling exists; denied/failed registration remains silent (AS-04). |

## Findings

### AS-01 — Referral loading and failure are indistinguishable from a missing feature
**Severity: Medium**  
**Source:** `src/parts.tsx:225-227,246`.

**Exact scenario:** `InviteCard` reads only `data` from `useApi('/me/referral')`. While the request is pending, and after an offline/server/permission failure, `data` is undefined and the component returns `null`. Ready credits and the invite action disappear with no loading, error or retry affordance; pull-to-refresh is not wired to this request.

**Smallest fix:** retain `error` and `reload`, render a small card with loading/error/retry states, and reserve the empty/success rendering for an actual response.  
**Regression/device test:** on customer and driver accounts, delay, fail, then recover `/api/me/referral`; verify visible status and keyboard/TalkBack-reachable retry in Arabic and English, with zero and multiple credits.

### AS-02 — Referral Share can do nothing, and its target is only 42dp
**Severity: Medium**  
**Source:** `src/parts.tsx:231-239`.

**Exact scenario:** the Share control is always rendered after data loads. `Share.canShare()` returns false on unsupported web platforms, so `onPress` returns without feedback or a copy fallback. If `Share.share()` rejects, the async handler has no catch. The icon container is 30×30 with 6dp hit slop: **42×42dp**, below the project’s 44dp minimum and requested 48dp Android target.

**Smallest fix:** provide a selectable/copy-code fallback, catch share failures with visible localized feedback, and make the hit area at least 48×48dp.  
**Regression/device test:** exercise native share success/cancel/rejection and a browser without Web Share; verify fallback, error announcement, and a 48dp target at 320/390px and largest text.

### AS-03 — Web push failures can be announced as success
**Severity: Medium**  
**Source:** `src/parts.tsx:206-218`; `src/push.ts:21-37,53-60`.

**Exact scenario:** enable failures are caught, but `toggle` only recomputes state; no visible error explains why permission/subscription/server registration failed. More seriously, `disablePush` suppresses both server-unsubscribe and local-unsubscribe failures. If both reject, `toggle` still sets `off` and announces “Notifications are off on this device” although the subscription remains. The row then hides its spinner and supplies a false terminal state.

**Smallest fix:** use a strict user-initiated disable path, verify `pushState()` after either operation, preserve `busy` until verification, and announce a localized error instead of success on failure. Keep best-effort cleanup separate for sign-out.  
**Regression/device test:** independently fail permission, service-worker registration, subscribe API, server unsubscribe and browser unsubscribe; verify no false On/Off announcement and working retry in Chromium and installed iOS web app.

### AS-04 — Native denied/failed notification state has no account recovery UI
**Severity: Medium**  
**Source:** `src/parts.tsx:197-218`; `src/push.ts:7-8,15-18`; `src/native-push.ts:29-46`.

**Exact scenario:** `pushSupported()` is web-only, so Account removes the notification row on native. `registerNativePush` silently returns on denial and swallows token/registration errors. A user who denies the system prompt, loses a token registration, or is offline sees no Blocked/Off state, explanation, retry, or Open Settings action anywhere in this surface.

**Smallest fix:** add a native notification row driven by `Notifications.getPermissionsAsync`, with denied/permanently denied copy, Settings deep link, and explicit registration retry/error state.  
**Regression/device test:** on physical Android and iOS cover first prompt, deny, permanently deny, offline token registration, settings return, and successful retry; confirm polling remains available.

### AS-05 — Password change remains editable/cancellable while its request is pending
**Severity: Medium**  
**Source:** `src/parts.tsx:250-289`.

**Exact scenario:** Save sets shared `busy`, but neither password field nor Cancel is disabled. A user can edit a field while the older values are being submitted; success then clears the newer edits. Tapping Cancel closes the form while the password change continues. A later failure is stored but hidden while closed; a later success still changes the password despite the apparent cancellation.

**Smallest fix:** disable both fields and Cancel during save, or use an operation epoch that makes cancellation semantics explicit and prevents stale completion from clearing newer edits.  
**Regression/device test:** delay the API, edit each field and attempt Cancel; test success/failure after every action and verify the visible form always describes the submitted values. Repeat with keyboard and screen reader.

### AS-06 — A successful name save can remain dirty with no success feedback
**Severity: Medium**  
**Source:** `src/app/profile.tsx:24-36,68-69`; `src/session.tsx:145-152`.

**Exact scenario:** POST `/me` returns the updated `Me`, but `save` discards it and depends on `refresh`. `refresh` swallows network failure. If POST succeeds and refresh fails, `user.name` remains old, `changed` stays true, the `saved && !changed` message never appears, and Save remains enabled for a duplicate submission despite the haptic success.

**Smallest fix:** apply the returned `Me` to session state atomically (or track the submitted-name baseline) and surface refresh failure separately without undoing acknowledged save success.  
**Regression/device test:** force POST success followed by GET `/me` failure; verify one success state, correct dirty state, no duplicate request, and preservation of any newer edits.

### AS-07 — Plan request success can leave an actionable, stale request form
**Severity: Medium**  
**Source:** `src/parts.tsx:242-264`; `src/session.tsx:145-152`.

**Exact scenario:** `subscribe` also discards the returned `Me` and relies on swallowing `refresh`. If the request POST succeeds and refresh fails, no pending-plan state is rendered, no success message is shown, and the Subscribe button can be pressed again. Additionally, `error` is not cleared at the start of a retry, so stale failure copy persists during and potentially after success.

**Smallest fix:** consume the returned `Me`, clear error before each request, and show a durable pending/success state independent of a best-effort refresh.  
**Regression/device test:** cover POST success + refresh failure, retry after server refusal, and genuine pending/active responses; assert one request only and no stale error.

### AS-08 — Arabic-Indic OTP digits are deleted in all three scoped verification flows
**Severity: Medium**  
**Source:** `src/app/profile.tsx:111-114`; `src/phone/flow.ts:27-29`; consumers `src/phone-card.tsx:222-228` and `src/phone-recovery.tsx:117-122`; server format `server/main.ts:743-751`.

**Exact scenario:** typing or pasting `١٢٣٤٥٦` into email verification produces an empty string because `/\D/g` accepts only ASCII digits. The shared `codeInput` does the same for phone verification and phone password recovery. This blocks valid six-digit input on Arabic keyboards even though other numeric fields already normalize Arabic digits.

**Smallest fix:** normalize Arabic-Indic and Persian digits with the existing `latinDigits` helper before removing non-digits, in `codeInput` and the email field.  
**Regression/device test:** type and paste ASCII, Arabic-Indic, Persian and mixed six-digit strings on Android/iOS/web; verify six accepted digits, valid server submission, and unchanged rejection of letters/extra digits.

### AS-09 — Phone capability failure disables both actions with “try again” but offers no retry
**Severity: Medium**  
**Source:** `src/phone-card.tsx:48-74,205-217,239-242`; copy `src/copy.ts:196,1219`.

**Exact scenario:** if either initial capabilities/self request fails, `gate === 'failed'` and both Verify and Change are permanently disabled for the mounted card. Their reason says to try again, but no button or polling path calls `load`; only leaving and recreating the profile card retries.

**Smallest fix:** render an enabled Retry action that reruns the epoch-fenced `load`, with its own busy state, and keep successful recovered actions enabled.  
**Regression/device test:** fail capabilities and self independently, retry offline then online, and confirm stale replies cannot cross account switches.

### AS-10 — Provider polling stops while the UI still says it is waiting
**Severity: Low**  
**Source:** `src/phone-card.tsx:24-25,91-123,200-203`.

**Exact scenario:** after 20 polls (about one minute), a challenge still `prepared`/`requested` receives no more status requests, but the same “Recorded. Waiting for provider” text remains indefinitely. There is no timed-out/stale status or explicit refresh, so the visible state no longer represents live provider knowledge.

**Smallest fix:** after `MAX_POLLS`, show “status not updated; check again” with a Retry status action that resets the bounded poll counter.  
**Regression/device test:** hold provider state pending beyond 20 polls, then resolve it; verify stale messaging, manual recovery, and no continued background polling after unmount.

### AS-11 — Recovery Back is under-sized and can hide a completed password reset
**Severity: Medium**  
**Source:** `src/phone-recovery.tsx:76-100,128-130`.

**Exact scenario:** Back to sign-in stays enabled during send/save. If Save is pending, Back unmounts the form; the server request can still change the password, while `alive.current` suppresses `onDone`, so the user receives no success notice. The same link has only 17px caption line height + 12px vertical padding = **29dp**, with no hit slop.

**Smallest fix:** disable Back while password save is pending (or route its eventual result to a persistent auth notice) and give it at least a 48dp target.  
**Regression/device test:** delay save, activate Back by touch/keyboard, then resolve success/failure; verify truthful outcome and 48dp target in both languages.

### AS-12 — Email code sending shows the spinner on Verify, not the pressed action
**Severity: Low**  
**Source:** `src/app/profile.tsx:86-98,111-120`.

**Exact scenario:** Send/Resend and Verify share one `busy` boolean, but only Verify and Change Save receive `loading={busy}`. Tapping Send Code disables the send button without a spinner and makes the separate Verify button spin—even when Verify is disabled—misidentifying the running operation.

**Smallest fix:** track `busyAction: 'send' | 'verify' | 'change' | null` and bind loading/disabled states to that action.  
**Regression/device test:** delay each of the three requests; assert spinner, accessible name and disabled reason stay on the invoked control and no other action appears active.

### AS-13 — Email change has no cancel/escape action
**Severity: Low**  
**Source:** `src/app/profile.tsx:116-121`.

**Exact scenario:** choosing “Wrong address? Change it” replaces that button with an editable address and Save. There is no Cancel to restore the original read-only state; leaving the entire profile is the only in-app escape without saving.

**Smallest fix:** add a Cancel ghost button that clears the change draft and related error without sending anything.  
**Regression/device test:** enter valid/invalid edits, cancel by touch and keyboard, reopen, and verify the current email/draft/error states reset correctly.

### AS-14 — Support, privacy and install handoffs suppress or ignore failure
**Severity: Medium**  
**Source:** `src/app/help.tsx:33-34,63`; `src/parts.tsx:67-68,425`; `src/install-link.tsx:11-12`.

**Exact scenario:** Help support/privacy and Account Help/privacy call `Linking.openURL` without handling rejection. Install explicitly catches and discards failure. With no browser/mail/WhatsApp handler, offline policy host, or a rejected deep link, the primary support action can do nothing and supplies neither an error nor a visible address/copy fallback.

**Smallest fix:** await each handoff, catch with localized visible feedback, and expose a copyable support/privacy URL or configured address when opening fails.  
**Regression/device test:** simulate unsupported scheme, missing handler and HTTP host failure; verify keyboard-accessible fallback and no unhandled rejection on Android/iOS/web.

### AS-15 — “Install on iPhone” is offered on non-Android desktop browsers
**Severity: Low**  
**Source:** `src/install-link.tsx:5-12`; copy `src/copy.ts:77,1101`.

**Exact scenario:** the component hides only on native, Android and installed/standalone web. Windows, macOS and Linux desktop browsers therefore see an explicitly iPhone-labelled action that opens iPhone instructions, despite the comment describing iPhone-only steps.

**Smallest fix:** gate to iPhone/iPad user agents (including supported iPadOS desktop UA) or rename/scope the destination as general installation help.  
**Regression/device test:** verify visibility and destination on Android, iPhone Safari/Chrome, installed iOS, Windows/macOS desktop and standalone desktop.

### AS-16 — Help FAQ motion has no reduced-motion branch
**Severity: Medium**  
**Source:** `src/app/help.tsx:48,56`; `src/motion.native.ts:1-2`; `src/motion.tsx:47-67,82-85`.

**Exact scenario:** FAQ expansion always requests a 200ms native `LinearTransition` and a 220ms `FadeIn`. Help never calls `useReducedMotion`. The native export is direct Reanimated; the web `FadeIn` emits CSS animation unconditionally even though a reduced-motion constant exists. Thus reduced-motion users still receive nonessential entrance/layout motion.

**Smallest fix:** call `useReducedMotion` and omit `layout`/`entering` when reduced motion is requested; make the web preset respect the same branch.  
**Regression/device test:** expand/collapse every FAQ with reduced motion on/off and verify immediate, fully readable state changes without movement in Arabic and English.

### AS-17 — Stale-data errors have no visible Retry on four data routes
**Severity: Medium**  
**Source:** `src/app/roads.tsx:43-47`; `src/app/driver/trips.tsx:13-16`; `src/app/admin/cash.tsx:53-58`; `src/app/admin/subscriptions.tsx:28-31`.

**Exact scenario:** after a successful load, a later poll/offline failure preserves rows and displays `ErrorText`, but Retry exists only in the initial `Loading` branch. A keyboard user or someone who cannot perform pull-to-refresh has no control to recover. This affects road reports, trip history, cash balances and subscription decisions while stale data remains actionable.

**Smallest fix:** render an explicit Retry beside each stale-data error calling the relevant reload function(s), while preserving cached content.  
**Regression/device test:** load then go offline for each route; recover by keyboard/TalkBack without a swipe and verify fresh data plus duplicate-request suppression.

### AS-18 — Road city edits remain live during Add and are then discarded
**Severity: Medium**  
**Source:** `src/app/roads.tsx:74-92`.

**Exact scenario:** the name and Pin/Add controls respect `busy`, but city checkboxes do not. While Add is pending, an admin can change cities. The request carries the earlier selection; on success `.then(ok => setDraft(...))` clears the entire draft, silently discarding the newer city edits.

**Smallest fix:** disable city chips while busy, or version the draft and only clear the exact submitted revision.  
**Regression/device test:** delay Add, toggle selected/unselected cities, then resolve success/failure; verify edits are either blocked or retained and submitted cities match the confirmation.

### AS-19 — Pending cash confirmations vanish on loading/failure and are omitted from manual refresh
**Severity: Medium**  
**Source:** `src/app/admin/cash.tsx:17-18,53-58,101-124`.

**Exact scenario:** `/admin/cash/pending` exposes only `pending` and `reloadPending`; its error is not read. If this request is slow/fails while balances succeed, the entire Confirmations-awaiting-driver section is absent with no loading/error/empty distinction. Pull-to-refresh calls only `reload`, not `reloadPending`, so it cannot explicitly recover this financial queue (only the 15-second poll can).

**Smallest fix:** capture pending error/loading, render section-scoped retry/empty states, and refresh both requests together.  
**Regression/device test:** independently delay/fail each endpoint, pull refresh, and verify pending entries never masquerade as an empty queue and stale entries are not actionable after resolution elsewhere.

### AS-20 — Cash actions can replace a form while another financial request is pending
**Severity: Medium**  
**Source:** `src/app/admin/cash.tsx:27-38,83-98`.

**Exact scenario:** Record/Pay driver/Record adjustment buttons outside the open form do not respect `busy`. During a slow submit, the admin can open another driver/kind form and type into it. Completion of the original request executes `setOpen(null)`, closing the replacement form and discarding its edits.

**Smallest fix:** disable every form-opening action while busy, or key busy state and completion to the exact form/request ID so stale completion cannot clear another draft.  
**Regression/device test:** delay remittance/adjustment, attempt every other cash action, and verify no replacement, data loss or duplicate request; cover two drivers and payout/remittance/adjustment kinds.

### AS-21 — Cash amount validation enables inputs that cannot succeed
**Severity: Medium**  
**Source:** `src/app/admin/cash.tsx:24-33,83-96`; `server/main.ts:2756-2785`.

**Exact scenarios:**  
1. Remittance disables only non-finite/zero amounts, so a negative value enables Record despite the “above zero” reason; the server rejects it. Oversized values likewise pass the client and fail server-side.  
2. Adjustment copy explicitly invites a negative amount (“negative = credit to driver”), but the client never collects/sends `approvalId`. The server requires that approval for every negative adjustment and otherwise returns `approval_required` or `approval_unsupported`; this advertised path cannot complete.

**Smallest fix:** enforce the server’s finite, safe-integer, sign and magnitude rules before enabling submit. Until the approval workflow exists, disallow negative adjustment and remove that instruction; otherwise add the required approved-request selection.  
**Regression/device test:** cover negative/zero/decimal/huge remittance; positive/negative payout and generic adjustment; and valid/invalid/missing approval. Assert no invalid submit is enabled and Arabic decimal input still works.

### AS-22 — Successful adjustment has no explicit visible success message
**Severity: Low**  
**Source:** `src/app/admin/cash.tsx:31-37,57`; `server/main.ts:2723-2724`.

**Exact scenario:** success copy is conditional on `entry.reference`, but adjustments always return `reference: null`. An adjustment therefore closes the form and reloads with haptic success only; unlike remittance and resolution, no visible/live-region confirmation identifies what completed, especially on web where haptics are absent.

**Smallest fix:** add localized adjustment-recorded feedback (including amount/driver where useful) for null-reference success and announce it politely.  
**Regression/device test:** complete positive payout and generic adjustment on native/web; verify persistent success feedback and no false remittance-reference copy.

### AS-23 — Cash resolution confirmation omits the entry and decision being confirmed
**Severity: Medium**  
**Source:** `src/app/admin/cash.tsx:20,42-50,101-119`; copy `src/copy.ts:251-255,1273-1277`.

**Exact scenario:** after choosing Confirm or Dispute on an entry, the inserted form shows only the generic title “Resolve handover,” reason and evidence. Neither it nor the generic confirmation names the driver, amount, or Confirm-vs-Dispute outcome. With many entries, the form is inserted before the pending list with no focus/scroll movement, away from the activated row. An admin can therefore confirm an irreversible financial decision without an identifying review step.

**Smallest fix:** carry the selected entry summary into the resolving state, display driver/amount/decision in form and dialog, and move accessibility/keyboard focus to the resolution heading.  
**Regression/device test:** resolve confirm and dispute for multiple similarly named drivers; verify exact summary, focus placement, cancel preservation, busy/error states and screen-reader announcement.

### AS-24 — Subscription rejection is a one-tap destructive decision
**Severity: Medium**  
**Source:** `src/app/admin/subscriptions.tsx:15-20,43-48`; server transition `server/main.ts:3031-3050`.

**Exact scenario:** Reject immediately changes a pending paid-plan request to rejected. Unlike road removal, cash resolution and account deletion, there is no confirmation, reason review, or undo on this screen. An accidental tap irreversibly rejects that request (the customer/driver would need to make a new request).

**Smallest fix:** add a confirmation naming user, plan and rejection, with Reject styled destructive and Cancel default; optionally collect a user-facing reason.  
**Regression/device test:** cancel vs confirm rejection, slow/failing request, double tap and a race with another admin; verify only one decision and accurate retained row state.

### AS-25 — A decided subscription can remain pending and actionable after refresh failure
**Severity: Medium**  
**Source:** `src/app/admin/subscriptions.tsx:15-25,46-47`; `src/api.ts:50-68`.

**Exact scenario:** activate/reject performs the mutation, fires success haptic, then awaits `reload`; `useApi.load` catches rather than throws refresh failures. If the mutation commits but reload fails, the old row remains Pending with enabled decisions and no decision-success feedback. The next tap acts on an already-decided request and produces a secondary error.

**Smallest fix:** apply a local decided/loading-success state immediately, remove pending actions for that row, and expose refresh failure separately until a fresh snapshot arrives.  
**Regression/device test:** force mutation success + GET failure for activate and reject; assert no repeated mutation, visible decided status, and keyboard-accessible refresh/reconciliation.

### AS-26 — Microsoft account-deletion preparation has no pending indicator
**Severity: Low**  
**Source:** `src/parts.tsx:303-322,450-460`.

**Exact scenario:** opening Delete for a Microsoft user starts `prepareEntraRequest`. Until it resolves, `entraRequest` and `entraFailed` are null/false, so the form shows reauthentication copy and Cancel but no Verify button, spinner or “Preparing” status. On a slow network this looks like a dead end.

**Smallest fix:** add an explicit preparing state and disable conflicting actions until the request resolves; preserve the existing failure Retry.  
**Regression/device test:** delay/fail preparation, cancel, retry and switch password/Microsoft paths; verify visible progress, no stale completion, and no deletion without successful reauthentication.

## Screenshot/state coverage gaps (evidence gaps, not additional findings)

The manifest has default `account`, `driver-account`, `profile`, `help`, `driver-trips`, `driver-run-sheet`, and `admin-subscriptions`; phone-specific captures are ready/code/change and recovery proof. **No `roads` or `admin-cash` capture is declared.** Existing captures are mostly 390×844 web happy paths and do not establish physical native, keyboard, permission or offline behavior.

| Surface | Important missing capture/state scenarios |
|---|---|
| Account (both roles) | Referral loading/error/empty/credits/share unsupported; push checking/off/denied/unsupported/toggle failure; native denied/settings return; plan request busy/error/pending/active/expired; password invalid/busy/error/success; delete password wrong/busy, Microsoft preparing/failure/retry, final confirmation; sign-out; long driver metadata; keyboard and largest text. |
| Profile / phone card | Name busy/success/failure/60+ characters; verified/unverified/email capability off; email sent/wrong/expired/change/cancel; phone checking/failed/unavailable/disabled, provider pending past polling cutoff/failed/unknown, expired/attempts exhausted, verification success and number-change session revocation; Arabic digits; keyboard and dynamic text. |
| Phone recovery | Initial phone step; all gate/device-storage failures; send busy/error; generic proof; resend countdown; wrong code/weak password; save busy/error/success; Back during save; 320px and largest text. |
| Help / Install | Every FAQ expanded/collapsed; customer role filtering; valid order-reference support; missing support line; external handoff failure; reduced motion; desktop/Android/iPhone/standalone install visibility. |
| Roads | Initial loading/error/retry, stale error, empty for each role; customer/pending/blocked/active-driver permissions; report busy/failure/rate limit/success; admin add validation/three-city limit/in-flight edit; pin loading/failure/too-far; move/remove confirmation and failure; Arabic/English long names/notes and dynamic text. |
| Driver Trips | Initial loading/error/empty; stale refresh error; active-only/history-only/last-trip variants; pagination loading/error/end; mixed returned/cancelled history; dynamic text and RTL run-sheet groups. |
| Admin Cash | All states are uncaptured: both endpoint loading/error/empty combinations; positive/negative/zero/pending balances; every amount boundary; remittance/payout/adjustment busy/failure/success; pending queue empty/populated; confirm/dispute form, generic-dialog risk, CAS conflict, reason validation; long names/notes/large money and keyboard. |
| Admin Subscriptions | Initial loading/error/empty; pending activation/rejection busy/failure/confirmation; mutation success + refresh failure; active/expired/rejected rows; long user/plan/phone/date text; 200-row performance and dynamic text. |

## Positive source observations and inherited constraints

- Phone commands are epoch-fenced, use stable idempotency slots, conceal account existence in recovery, distinguish provider acceptance from delivery, and keep codes/passwords out of persistent component storage.
- Road removal, account deletion and cash resolution do have confirmation primitives; destructive style is consistently available through the shared helper.
- Initial data states generally include loading/error/retry, and empty states exist for trips, roads, cash balances and subscriptions.
- `Appear`, profile keyboard avoidance, pin-sheet motion, labelled controls, LTR phone/code presentation, and accessible road-report labels are present.
- Shared 46/44/36dp control sizing, 1.35 text-scale cap, `ErrorText` live-region behavior, Press feedback, and reduced-motion defects are already documented in `shared-design-system-audit.md`; they are not recounted here except for the two locally measured 42dp/29dp targets.

## Recommended implementation order

1. Financial truthfulness: AS-19–AS-25, then AS-03 and AS-06–AS-07.
2. Security/recovery: AS-05, AS-08–AS-11 and AS-26.
3. Dead-end actions and accessibility: AS-01–AS-04, AS-14 and AS-16–AS-18.
4. Localized polish and target fixes: AS-12–AS-13, AS-15 and remaining low-severity feedback.

## Exact read scope

- **Requested route/widget files, full:** all eight named route files; `src/parts.tsx`; `src/phone-card.tsx`; `src/phone-recovery.tsx`; `src/install-link.tsx`; `src/native-push.ts`; `src/push.ts`.
- **Direct behavioral context:** `src/ui.tsx`; `src/api.ts`; `src/session.tsx`; `src/phone/flow.ts`; `src/phone/requests.ts`; `src/motion.tsx`; `src/motion.native.ts`; `src/pin-sheet.tsx`; `src/model.ts` (types and digit/number helpers); `src/app/auth.tsx` (recovery gate integration).
- **Copy:** `src/copy.ts` relevant Arabic/English account, phone, help, roads, cash, subscription, error and install sections, plus key inventories across the file.
- **Validation context only:** `server/main.ts:236-263,385-406,740-849,1948-2003,2720-2785,2990-3052`; `server/domain/cash-ops.ts` full.
- **Coverage context only:** `docs/screens/README.md`; `scripts/screens.mjs:145-219,510-594`; `package.json`; implementation handoff and the three existing audit packets to avoid recounting excluded/shared findings.
