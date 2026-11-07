# Order, receipt and public tracking source audit

**Product baseline:** `f8d58c14d43cc31475411899ebfa29c23b04f79c` (`f8d58c1`, also the checkout HEAD)  
**Audit date:** 2026-11-07  
**Model:** `kimi-k3.1-pro`  
**Method:** read-only source audit. No product file was edited; no test suite, phone, emulator, server or screenshot tool was run. **`read_image` was not called; no image was opened. This report makes no pixel, contrast-measurement or rendered-layout claim.**

## Result

**18 source-confirmed findings: 2 High, 13 Medium, 3 Low.** Severity describes user impact, not implementation effort:

- **High:** a supported core transition or exit is blocked in the UI.
- **Medium:** a recoverable but material workflow, record, failure state or accessibility path is wrong or missing.
- **Low:** limited-scope misleading feedback or a non-blocking accessibility/motion defect.

The implementation already has substantial good state handling: assignment-fenced retained fixes; private/public stale labels; public 120-second marker expiry; route fallbacks and retry; cached-order refresh errors; idempotent driver advance/problem commands; destination quote revision/expiry fences; scheduled Palestine-time slots; ride arrival/boarding guards; admin recovery; role-filtered identity/code disclosure; reduced-motion handling in the main searching/completion animations; and localized Arabic/English status copy. Those are retained in the acceptance matrix rather than reported as defects.

## Finding index

| ID | Severity | Finding |
|---|---|---|
| F01 | High | Customer cancellation disappears at `at_pickup`, although the contract still allows it before collection. |
| F02 | High | Parcel/freight pickup failure cannot be reported at `at_pickup`. |
| F03 | Medium | A malformed public tracking token produces an endless loading state. |
| F04 | Medium | An initial offline/server failure is falsely described as an ended or revoked tracking link. |
| F05 | Low | Public status age uses the phone clock without the server-clock correction used for fixes. |
| F06 | Medium | Boarding lockout removes the driver action without showing the available lock/recovery copy. |
| F07 | Medium | Fifth handover failure locks server-side, but the driver is neither told nor prevented from more attempts. |
| F08 | Medium | Paid `returned` orders have no reachable receipt/proof view. |
| F09 | Medium | Driver/admin shared receipts omit the financial rows visible on screen. |
| F10 | Medium | A stale reschedule can silently overwrite a newer schedule from another client. |
| F11 | Medium | Several controls remain enabled during another order action but silently do nothing. |
| F12 | Medium | Call, help and public-navigation external-link failures lack user-visible recovery. |
| F13 | Medium | Shared text rendering caps accessibility font scaling at 1.35×. |
| F14 | Medium | Names, landmarks and handover notes are hard-truncated with no expansion path. |
| F15 | Medium | Safety and admin-recovery modals lack modal accessibility isolation and focus management. |
| F16 | Medium | Chip sets expose radios without a radio group or arrow-key navigation. |
| F17 | Low | Main status transitions are not announced to screen readers. |
| F18 | Low | Shared error entrance motion ignores reduced-motion preference. |

---

## Detailed findings

### F01 — High — cancellation is hidden before collection at pickup

**Evidence:** [order/[id].tsx:590](../../src/app/order/[id].tsx#L590) renders the ordinary customer cancel action only for `assigned`; the searching branch at [order/[id].tsx:250](../../src/app/order/[id].tsx#L250) covers only `searching`. In contrast, [server/main.ts:1647](../../server/main.ts#L1647) defines `cancellable = ['searching', 'assigned', 'at_pickup']`, and [server/main.ts:1712](../../server/main.ts#L1712) authorizes the customer/admin transition. The API acceptance case explicitly cancels as customer and admin at pickup in [pickup.test.mjs:60](../../tests/pickup.test.mjs#L60).

**Exact scenario:** a customer has not handed over a parcel/freight item, or has not boarded a ride; the driver marks `at_pickup`. The cancel control disappears even though the order remains cancellable and the next-step copy still says to check the driver before handover.

**Smallest fix:** include `at_pickup` in the customer/admin cancel branch, retaining the existing confirmation and terminal-state handling. Do not enable it for `in_transit`, `on_hold`, or `returning`.

**Tests:** component cases for all three services at `searching`, `assigned`, `at_pickup`, and `in_transit`; customer and admin see cancel through pickup, driver does not; confirmation posts once; `cancelled` and pickup-failed cancelled states remain distinct. Preserve the API cases in [pickup.test.mjs:60](../../tests/pickup.test.mjs#L60).

### F02 — High — the supported pickup-failure workflow is absent

**Evidence:** [order/[id].tsx:395](../../src/app/order/[id].tsx#L395) shows **Report problem** only for `in_transit`, and [order/[id].tsx:413](../../src/app/order/[id].tsx#L413) always uses delivery-problem copy. The server accepts parcel/freight exceptions in either `at_pickup` or `in_transit` at [server/main.ts:2221](../../server/main.ts#L2221), deliberately cancelling a pickup failure at [server/main.ts:2227](../../server/main.ts#L2227). Localized `pickupProblem`, `pickupConfirm`, `pickup_absent`, `pickup_refused`, `pickup_unreachable`, and `pickup_wrong_address` already exist at [copy.ts:1400](../../src/copy.ts#L1400).

**Exact scenario:** the courier arrives and the sender is absent, refuses handover, is unreachable, or the pickup address is wrong. At `at_pickup` there is no report control. Releasing merely returns the job to the pool; falsely marking collection is not an acceptable workaround.

**Smallest fix:** expose the action for non-ride `at_pickup` and `in_transit`; select pickup copy/reason keys at pickup and delivery copy in transit. Keep the existing expected-status and request-ID recovery payload.

**Tests:** each of the four pickup reasons and four delivery reasons in Arabic and English; parcel and freight; ride remains excluded; at-pickup success becomes `cancelled` with `pickupFailed`; in-transit success becomes `on_hold`; ambiguous failure replays the same request ID; stale status shows `order_changed` and refreshes.

### F03 — Medium — malformed tokens never resolve to an error or empty state

**Evidence:** [track/[token].tsx:23](../../src/app/track/[token].tsx#L23) computes `valid`, but line 24 passes `null` to `useApi` when invalid. That leaves both `polled` and `error` unset, so [track/[token].tsx:77](../../src/app/track/[token].tsx#L77) permanently renders the loading branch.

**Exact scenario:** open `/track/abc`, an empty token, an uppercase token, or a 64-character token containing a non-hex character. The spinner remains indefinitely with no invalid-link explanation or recovery.

**Smallest fix:** add an explicit `!valid` terminal empty/error state before the loading branch; do not issue an API request. Reuse `trackEnded` only if product copy accepts “invalid” within that message; otherwise add specific invalid-link copy.

**Tests:** missing, short, overlong, uppercase, non-hex, and valid 64-lowercase-hex tokens; invalid cases make zero requests and immediately expose a named recovery state; valid malformed-on-server tokens still follow the API error path.

### F04 — Medium — transient tracking failure is mislabeled as link termination

**Evidence:** [track/[token].tsx:76](../../src/app/track/[token].tsx#L76) shows any initial error, then line 78 renders `Empty` with `trackEnded` whenever `error` is truthy. `useApi` retains the actual string code, including `network`, so this is not limited to `not_found`.

**Exact scenario:** a recipient opens a valid shared link while offline or during a server outage. The page says **“This tracking link has ended or was stopped”** alongside retry, falsely implying sender revocation or terminal expiry.

**Smallest fix:** reserve `trackEnded` for terminal `not_found`/revocation responses. Show the localized network/server error plus **Retry** for transient errors; keep cached data with an updates-paused notice when a refresh fails.

**Tests:** initial `network`, `server_error`, `unavailable`, `not_found`, and `forbidden`; refresh failure with an existing snapshot; recovery after retry. Assert both copy and presence/absence of cached status/map.

### F05 — Low — public “status updated” age is clock-skew sensitive

**Evidence:** [track/[token].tsx:66](../../src/app/track/[token].tsx#L66) computes `age` as `now - data.updatedAt`. `data.updatedAt` is a server timestamp, while `now` is `Date.now()` from the phone. The fix-age path correctly applies server offset and monotonic elapsed time through [location-state.ts:20](../../src/location-state.ts#L20), but status age does not.

**Exact scenario:** with a device clock ten minutes ahead, a newly arrived status immediately reads as ten minutes old; with a clock behind, it can read “just now” for too long. Fix timestamps on the same page can disagree.

**Smallest fix:** calculate status age with the same server-offset/monotonic helper, e.g. a `publicFixAgeMs({ updatedAt: data.updatedAt }, now, …)`-based status clock, and floor the displayed value only after correction.

**Tests:** device clock ±10 minutes, backward clock change while offline, and normal clock; status age and location age use the same corrected time base and never become negative.

### F06 — Medium — boarding lockout has no visible state or recovery instruction

**Evidence:** [ride-flow.ts:19](../../src/ride-flow.ts#L19) returns `locked` when `boardingLocked`; [order/[id].tsx:397](../../src/app/order/[id].tsx#L397) handles only `boarding` and `arrive`, so the locked driver action renders nothing. The customer card at [order/[id].tsx:565](../../src/app/order/[id].tsx#L565) continues showing the PIN without a lock notice. Yet `rideBoardingLocked` already says to contact support at [copy.ts:1063](../../src/copy.ts#L1063), and the server exposes the flag at [ride-lifecycle.ts:132](../../server/domain/ride-lifecycle.ts#L132).

**Exact scenario:** after repeated incorrect boarding PINs, the ride locks. The driver sees no primary action and only generic next-step copy; the customer still sees a PIN that cannot succeed. Neither is told that admin recovery is required.

**Smallest fix:** render `rideBoardingLocked` and the existing Help/support path in both role views when locked; disable code submission. Retain the admin reset/rotate recovery cards.

**Tests:** fourth/fifth wrong attempts, correct PIN while locked, admin reset without rotation, reset with rotation, and reassignment. Driver/customer see the lock until a fresh unlocked snapshot; old PIN cannot be treated as usable after rotation.

### F07 — Medium — handover lock is silent and the form stays actionable

**Evidence:** [server/main.ts:2202](../../server/main.ts#L2202) rejects further attempts once five failures exist, but the fifth wrong attempt itself still returns `wrong_code` at line 2207. The client clears the field for every wrong code at [order/[id].tsx:143](../../src/app/order/[id].tsx#L143), while [order/[id].tsx:387](../../src/app/order/[id].tsx#L387) always renders the code entry and confirmation in transit/returning. `Order` has no proof-lock field in [model.ts:129](../../src/model.ts#L129).

**Exact scenario:** the fifth wrong delivery or return code locks verification, but the driver sees only “Wrong handover code.” The input and confirm button remain active; only a sixth attempt reveals `proof_locked`. Polling cannot repair the state because lock status is absent from the order view.

**Smallest fix:** expose an additive `proofLocked` (and optionally remaining attempts) in participant order summaries; on lock, replace/disable the form with `err_proof_locked` and support guidance. Admin proof reset should clear the flag on the next response/poll.

**Tests:** five distinct wrong delivery codes, correct code while locked, admin reset, return-leg independent lock, process reload while locked, and replay of an unknown command. Assert no sixth request is sent from the disabled UI.

### F08 — Medium — returned orders cannot open a receipt or proof summary

**Evidence:** [receipt/[id].tsx:19](../../src/app/receipt/[id].tsx#L19) redirects every status other than `completed`, and [order/[id].tsx:594](../../src/app/order/[id].tsx#L594) shows **View receipt** only for `completed`. However, `returned` is a finished, paid status at [model.ts:49](../../src/model.ts#L49), and driver earnings include it at [server/main.ts:2693](../../server/main.ts#L2693).

**Exact scenario:** a failed delivery is returned with sender proof. Customer, driver, and admin can see the order’s original exception and rebook/dispute controls, but cannot issue the receipt/proof record available to other paid finished work; the driver’s earnings include a job for which no receipt view exists.

**Smallest fix:** admit `returned` to the receipt route and order link, with explicit returned status and return-proof wording (not “Delivered” or “Handover code confirmed”). Keep cancelled and all active statuses redirected.

**Tests:** returned parcel and freight for customer/driver/admin; returned ride if introduced by a future contract; completed remains unchanged; cancelled/active redirect; driver net/commission matches earnings; shared returned receipt uses return-proof copy.

### F09 — Medium — exported receipt content differs by omission from the displayed receipt

**Evidence:** [receipt/[id].tsx:43](../../src/app/receipt/[id].tsx#L43) builds share text only from `lines` and cash total. Driver commission, promo credit, and net earnings are added only to the visual card at [receipt/[id].tsx:67](../../src/app/receipt/[id].tsx#L67); admin commission is likewise visual-only at line 76.

**Exact scenario:** a driver shares a discounted completed receipt. The screen shows commission, Wind promo credit, and net earnings, but the exported text contains none of them. An admin export similarly omits commission. The recipient cannot reconcile the driver’s record with the displayed receipt.

**Smallest fix:** construct one role-aware receipt-line model used by both rendering and sharing, including driver commission/promo credit/net and admin commission. Preserve the customer export’s current fields.

**Tests:** mock `Share.share` for customer, driver with/without discount, and admin; exported rows exactly equal displayed role rows, including signs and currency; returned-receipt coverage follows F08.

### F10 — Medium — stale scheduled edits can overwrite a newer confirmed time

**Evidence:** the client sends only `{ scheduledFor: moving }` at [order/[id].tsx:135](../../src/app/order/[id].tsx#L135). The server checks ownership/status/time and then unconditionally updates `scheduled_for` and `updated_at` at [server/main.ts:1722](../../server/main.ts#L1722); it receives no expected revision or prior schedule.

**Exact scenario:** two customer devices open the same scheduled parcel. Device A saves 12:00. Device B, still showing the old 09:00 revision, saves 16:00 before its next poll. B silently overwrites A without the `order_changed` recovery already used by other guarded order actions.

**Smallest fix:** send `expectedUpdatedAt` (or `expectedScheduledFor`) and enforce it in the atomic `UPDATE … WHERE` predicate; on mismatch return `order_changed` so the existing catch reloads. Preserve same-target retry behavior after a lost response.

**Tests:** two clients with the same initial revision, same-target replay, different-target conflict, stale read followed by cancellation/assignment, and successful save followed by another save based on the refreshed revision.

### F11 — Medium — enabled-looking controls are silently discarded while busy

**Evidence:** [order/[id].tsx:123](../../src/app/order/[id].tsx#L123) returns immediately when `busy`. Several callers do not pass that state as `disabled`: driver release at [order/[id].tsx:534](../../src/app/order/[id].tsx#L534), admin/customer cancel at line 590, and both rating rows at [order/[id].tsx:743](../../src/app/order/[id].tsx#L743). `loading` disables only the one button currently loading.

**Exact scenario:** while schedule save is pending, a second action such as cancel remains enabled; tapping it produces no request, spinner, explanation, or error. During a slow rating request, tapping another star is likewise silently ignored.

**Smallest fix:** pass `disabled={!!busy}` and `reason={c.wait_busy}` to every `act`-owned control, and pass busy into rating components with an accessible busy/disabled state. Alternatively remove the guard, but serialized commands are safer here.

**Tests:** delay one action and inspect all other action controls; no silent no-op, one request only, accessible busy reason, and controls recover after success/failure. Include rating driver, price, and customer independently.

### F12 — Medium — external-action failures have no visible recovery

**Evidence:** customer/driver/admin person calls invoke `Linking.openURL` without handling rejection at [order/[id].tsx:730](../../src/app/order/[id].tsx#L730). Help does the same for support/privacy at [help.tsx:34](../../src/app/help.tsx#L34) and line 63. Public navigation catches and discards every rejection at [track/[token].tsx:88](../../src/app/track/[token].tsx#L88).

**Exact scenario:** no dialer/browser/WhatsApp handler is available, the user has restricted external opening, or the URL fails. Call/help can produce an unhandled rejection; public **Navigate** simply does nothing. No localized error or alternative appears.

**Smallest fix:** route external opening through a small helper that catches rejection and sets local, role-appropriate feedback (`callUnavailable`, `mapUnavailable`, or generic external-open copy). Keep emergency-call availability checks unchanged; do not turn share-sheet dismissal into an error.

**Tests:** mock rejected and successful `openURL` for person call, Help support/privacy, public navigation, and driver `openMaps`; assert one alert/inline error, no unhandled rejection, retry availability, and Arabic/English copy.

### F13 — Medium — dynamic text stops growing above 1.35×

**Evidence:** [ui.tsx:184](../../src/ui.tsx#L184) sets `maxFontSizeMultiplier={1.35}` on every shared `Txt`. This is a hard ceiling, not merely a layout constraint. Several raw-text elements have fixed geometry as well, such as the 30×40 code digit at [order/[id].tsx:781](../../src/app/order/[id].tsx#L781).

**Exact scenario:** a user selects a larger accessibility font above 1.35×. Headings, instructions, codes, errors, receipt values, tracking timestamps, and button labels stop scaling even though the OS requests more.

**Smallest fix:** remove the shared cap; replace fixed-height/line-height text containers with content-driven minimum sizes and wrapping. Validate rather than assume that existing layouts survive.

**Tests:** 1.0×, 1.35×, 2.0×, and the platform maximum in Arabic and English; all four audited routes, PIN/code cards, long receipt rows, errors, and buttons. Assert computed scale is not capped and content/actions remain readable without overlap or clipping.

### F14 — Medium — essential identity/address content is irrecoverably truncated

**Evidence:** route city and landmark rows cap content at one/two lines in [parts.tsx:78](../../src/parts.tsx#L78) and line 82; these controls have no `onFrom`/`onTo` expansion in the order screen. Person names are capped at one line at [order/[id].tsx:725](../../src/app/order/[id].tsx#L725), and order detail values at three lines at line 739. None offers an expand/detail action.

**Exact scenario:** a 140-character Arabic handover note, long recipient/customer/driver name, or enlarged text wraps beyond the hard limit. The precise landmark or identity is visually lost even though the underlying string exists. This is operationally different from compact truncation in order-list rows.

**Smallest fix:** allow full wrapping on the order detail route (or provide an explicit accessible expansion). Keep compact `OrderRow` truncation compact; do not reuse that constraint for the operational detail view.

**Tests:** maximum-length pickup/dropoff/detail/recipient values, mixed Arabic/Latin names and plates, 2× text, narrow and wide viewports. Assert full visible/readable content and no dependence on screen-reader-only disclosure.

### F15 — Medium — modal background and focus are not isolated

**Evidence:** Safety uses `Modal` at [order/[id].tsx:530](../../src/app/order/[id].tsx#L530), and admin recovery at line 597, without `accessibilityViewIsModal`, initial focus, focus trapping, or focus restoration. The nearby pin sheet demonstrates the native isolation prop at [pin-sheet.tsx:66](../../src/pin-sheet.tsx#L66), but even that pattern alone would not supply web keyboard focus management.

**Exact scenario:** with TalkBack/VoiceOver or keyboard navigation, focus can remain on or move to obscured order controls instead of starting in the safety/recovery form; closing does not deterministically return focus to the opener.

**Smallest fix:** add native modal isolation and shared dialog focus handling: focus the heading/first field on open, contain web Tab/Shift+Tab, support Escape/back where safe, and restore the opener. Disable dismissal while a recovery command is pending or clearly label it as background continuation.

**Tests:** TalkBack and VoiceOver background exploration, web Tab/Shift+Tab/Escape, Android back, focus return to each opener, keyboard-open safety note, and pending admin reset. Assert one active dialog and no background activation.

### F16 — Medium — radio chips lack group and expected keyboard behavior

**Evidence:** [ui.tsx:324](../../src/ui.tsx#L324) renders each chip as an independent `role="radio"` but has no containing `radiogroup`, accessible group label, roving tab index, or arrow-key handler. `SlotPicker` uses this for day and time at [parts.tsx:47](../../src/parts.tsx#L47), potentially creating dozens of separate tab stops; destination, exception, and safety choices use the same component.

**Exact scenario:** a web keyboard user must Tab through every schedule slot rather than using arrow keys within one group; assistive technology hears unrelated radios without the question/group name.

**Smallest fix:** add a required accessible group label and `radiogroup` wrapper, roving focus with arrows (respecting RTL), and Home/End where supported. Preserve single selection, disabled reasons, and native touch behavior.

**Tests:** Left/Right in LTR and RTL, Up/Down, Home/End, one group tab stop, selection on arrows/Space/Enter, disabled chips, horizontal scrolling of the focused chip, and TalkBack group/name/checked announcements.

### F17 — Low — primary status changes are visual-only to screen readers

**Evidence:** the order’s main status title/next-step region at [order/[id].tsx:324](../../src/app/order/[id].tsx#L324) has no live-region or change announcement; public status at [track/[token].tsx:80](../../src/app/track/[token].tsx#L80) likewise has none. ETA and errors have their own live regions, but they do not announce every lifecycle transition.

**Exact scenario:** while the order screen remains open, `assigned → at_pickup → in_transit → on_hold/completed` changes visually. A screen-reader user who is not navigating that exact node receives no primary status announcement.

**Smallest fix:** announce only actual status/next-step transitions with a polite live region or `AccessibilityInfo.announceForAccessibility`; do not announce every four/five-second poll or timestamp tick.

**Tests:** repeated identical snapshots produce zero announcements; every one of the nine statuses and ride-specific wording announces once in the selected language; destination-only/fare-only changes use their existing separate region.

### F18 — Low — error entrance motion ignores reduced motion

**Evidence:** [ui.tsx:379](../../src/ui.tsx#L379) always mounts `Animated.View entering={FadeInDown…}` for `ErrorText`. Unlike `Appear`, `Pulse`, and `Radar`, it never calls `useReducedMotion`. `FadeInDown` includes translation at [motion.tsx:57](../../src/motion.tsx#L57).

**Exact scenario:** with reduced motion enabled, an API/form error still translates into place on native and web, contrary to the rest of the audited order experience.

**Smallest fix:** use the same reduced-motion branch as `Appear`: omit entering motion when requested while retaining `role="alert"` and polite announcement.

**Tests:** reduced and normal motion on native/web for initial load error, cached refresh error, action error, chat error, destination quote error, and tracking error; state and announcement remain identical without translation.

---

# Full state acceptance matrix

## How to use this matrix

- **Expected** is the acceptance contract derived from current source and its server contract; **Gap** identifies where current UI does not meet it.
- Every applicable row must pass in **Arabic RTL and English LTR**, with long localized strings, screen reader, keyboard where available, 2× dynamic text, reduced motion, and pending/failure/retry variants. The variants are acceptance dimensions, not claims that current pixels were inspected.
- **Existing** refers only to a named entry in [docs/screens/README.md](../../docs/screens/README.md), not to a reviewed or accepted screenshot. **M##** refers to the missing-capture list below.

## A. Services, options, identity and proof

| Surface | Expected source-backed content/actions | Current result | Capture |
|---|---|---|---|
| Parcel | Small/medium/large; shared marker where applicable; sender/recipient identity and phone actions; item/note; handover code at delivery; pickup and delivery exceptions; optional scheduling. | Core model present; F01/F02/F07 block pickup/cancel/lock states. | Existing live/scheduled/completed; M07–M10, M19 |
| Ride | 1–4 passengers; passenger identity, vehicle/plate; driver arrival and grace; gated boarding PIN; completed-trip wording; no parcel handover/recipient WhatsApp flow. | Core branches present; F06 hides lock; F01 also affects pre-boarding cancellation. | Existing live; M08–M09 |
| Freight | Small/large, loading help, declared/measured scope and inspection, recipient/contact, handover code, pickup/delivery exceptions. | Details component present; F01/F02/F07 apply. | M06, M10 |
| Customer role | Own contact/driver identity, codes, schedule/destination, cancel, share/help/rate/receipt/rebook/dispute. | Role gates mostly present; gaps F01, F06–F14, F17. | Existing customer set; role/state gaps below |
| Assigned driver | Customer/sender identity, own-perspective status, navigation/location, advance/arrive/boarding/proof, release/exception/rate-customer. | Role gates present; F02/F06/F07/F11/F14. | Existing active/receipt; gaps below |
| Admin | Both parties’ identity/contact, neutral pause, hold/return decisions, cancel, arrival/boarding/proof recovery, receipt; no participant rating. | Role gates present; F08/F09/F11/F15. | Existing recovery; gaps below |
| Public recipient | Order code/status/service/cities, driver first name/vehicle, fresh position/ETA only; no private notes, phone, exact stops, code or account. | Privacy mapping present; F03–F05/F12/F17 affect state/accessibility. | M11–M13 |
| Pickup identity | Sender/customer name and phone, exact pin when present or landmark-search disclaimer, pickup note and operational reason. | Present, but F02 removes pickup-failure action and F14 can truncate. | M07, M22 |
| Delivery identity | Recipient name/phone where supplied, driver vehicle/plate for customer, delivery note and handover code only for customer; driver enters code. | Present; F07/F12/F14 affect failure and readability. | M10, M20 |
| Code recovery | Five-attempt delivery/return lock, admin reasoned reset; boarding reset or rotation with assignment/PIN revision fence; audit notice. | Admin recovery exists; participant lock states F06/F07. | M09, M20 |

## B. Every lifecycle status by role

| Status / service applicability | Customer acceptance | Driver acceptance | Admin acceptance | Public acceptance | Capture |
|---|---|---|---|---|---|
| `searching` — all services | Finding-driver state, cancel; scheduled parcel time/edit; dispatch retry/exhaustion for eligible ride; no driver identity. | Only authorized offered/visible work; accept/decline where offered; no unrelated future scheduled job. | Full read/cancel; no participant action. | Searching status, no driver/location; valid link works. | Existing searching/scheduled; M01, M04–M06, M11 |
| `assigned` — all services | Driver card/call, route/ETA, share/help/chat, cancel, destination quote; ride boarding PIN if gated. | Advance or GPS arrive, release, navigation, destination decision when pending. | Read/cancel, arrival/boarding recovery where applicable. | Driver first name/vehicle and fresh fix only. | M06, M14–M17 |
| `at_pickup` — all services | **Cancel until collection**, identity check, destination, boarding PIN where required. | **Pickup problem for parcel/freight**, collect/start, boarding input, release, destination. | Cancel, arrival/boarding recovery, read. | Pickup-target ETA/freshness. | **F01/F02/F06**; M07–M09 |
| `in_transit` — all services | Live/stale map and timestamps, handover code for parcel/freight, destination, share/help/chat/safety. | Complete with proof for parcel/freight; ride completion; delivery exception for parcel/freight; destination decision. | Neutral read, proof recovery, safety handling. | Dropoff ETA, delayed/shared-run copy, stale/expired location rules. | Existing live/parcel live; M10, M12–M18 |
| `on_hold` — parcel/freight | Neutral support-deciding status, exception reason, live last-known map; no false completion/cancel. | Hold item, no advance; support/help remains available. | Reasoned **retry delivery** → `in_transit` or **return** → `returning`; safety hold remains neutral. | Held status; retained fix ages and expires correctly. | M23 |
| `returning` — parcel/freight | Return code visible only to customer, pickup-target route/ETA, sender guidance. | Return code entry and confirm; proof lock recovery needed. | Reasoned confirm-return fallback, proof reset, read. | Returning status and pickup-target ETA while fresh. | M24 |
| `completed` — all services | Service-correct terminal wording, driver + separate price rating, receipt/share, rebook, parcel send-another, dispute within seven days. | Customer rating, receipt/net/commission, history. | Receipt/commission, dispute handling elsewhere; no rating. | Terminal status during share grace, then ended state; no stale driver identity/location. | Existing done/receipts; M25–M27 |
| `cancelled` — all services | Cancelled status, pickup-failed reason where applicable, rebook; no rating/receipt; parcel send-another remains closed. | Terminal read; no advance/release/location sharing. | Terminal read and reason; no recovery action inappropriate to cancelled. | Cancelled during grace, then ended; no location. | M28 |
| `returned` — parcel/freight | Returned status, original delivery exception, rebook/send-another/dispute, **return receipt/proof**. | Paid finished work, **return receipt/net/proof**, no customer rating under current completed-only contract. | **Return receipt/commission/proof**. | Returned during grace, then ended; no location. | **F08**; M29 |

## C. Scheduled and destination-change states

| State | Acceptance behavior | Current evidence / gap | Capture |
|---|---|---|---|
| Schedule initial/edit | Existing time shown; Palestine day/time chips; Save disabled unchanged/unselected with reason. | Present. | Existing scheduled; M05 |
| Schedule pending | One in-flight save; all other order actions expose disabled/busy reason. | Save has spinner; other actions F11. | M05 |
| Schedule success | Response updates displayed time and exits editing; same-target retry is safe. | Present. | M05 |
| Schedule invalid/too close/forbidden | Localized inline error, draft retained, retry/current order refresh as appropriate. | Error path present; matrix still requires captures. | M05 |
| Schedule concurrent revision | Newer schedule wins visibly; stale different-target save gets `order_changed`, never silently overwrites. | **F10.** | M05 |
| Destination unavailable | Assigned but ineligible order explains support path; non-participant sees no private card. | Present. | M14 |
| Destination edit | City, required landmark, optional pin, cancel; input retained after quote failure. | Present. | M14 |
| Pin permission/map failure | Manual landmark remains usable; outside-service pin rejected; failed map cannot confirm unseen point. | Present in pin sheet. | M15 |
| Quote loading/error | Spinner/disabled controls, localized error, retry possible. | Present. | M16 |
| Quote review | Old/new cash and gross discount terms, driver earnings, estimated/road warnings; expiry visible. | Present. | M16 |
| Quote expired/stale | Request disabled with reason; new quote available; no stale proposal submission. | Present. | M16 |
| Proposal pending | Customer withdraw; old fare/destination explicitly remain active. | Present. | M17 |
| Driver decision | Accept/decline, busy serialization, error retention; accepted response updates order/fare. | Present. | M17 |
| Withdraw/decline/expiry | Pending card clears or refreshes to a truthful editable state; no optimistic success. | Present; requires acceptance capture. | M17 |

## D. Maps, timestamps, connectivity and external actions

| State | Acceptance behavior | Current evidence / gap | Capture |
|---|---|---|---|
| Map initial loading | Reserved route area, no invented driver location, route labels accessible. | Present. | M11 |
| Map live, <30 s | Driver marker, next-stop route/ETA, corrected “updated ago”; pickup/dropoff focus by status. | Present. | Existing live; M12 |
| Private reconnecting, 30–59 s | Weak-signal copy and retained marker; no false live claim. | Present. | M12 |
| Private stale, ≥60 s | Faded last-known marker and explicit age; no current ETA. | Present. | M12 |
| Public stale, 60–120 s | Last-known label/faded marker; no fresh ETA/navigation. | Present. | M12 |
| Public expired, >120 s | Marker/ETA removed; no reappearance from backward device clock. | Present helper logic. | M12 |
| No driver fix | “Waiting for driver location update”; route stops still available. | Present. | M12 |
| Reassignment | Old driver name/fix/ETA removed immediately; new assignment starts a fresh fix clock. | Present. | M13 |
| Shared courier run | Explains other stops; no direct ETA/approach claim. | Present. | M13 |
| Delayed/closed road | Localized delay/checkpoint copy; no unsupported road geometry. | Present. | M13 |
| Map provider failure/offline | Route diagram plus Retry; private route/address text remains; retry reconstructs provider. | Present. | M18 |
| Cached order refresh failure | Last snapshot remains with “Updates paused” and pull/manual retry. | Present. | M02 |
| Initial order/receipt failure | Localized error, loading stops, Retry available. | Present. | M01–M02 |
| Public initial failure | Transient error/retry, **not** ended-link copy. | **F04.** | M03 |
| Public malformed/revoked | Immediate invalid state for malformed; truthful ended state only for revoked/expired. | **F03**; valid 404 path otherwise present. | M03 |
| Status clock skew | Status and fix ages share corrected server/monotonic time. | Fix path present; status **F05**. | M13 |
| Share create/stop | URL visible/selectable, native share where supported, stop confirmation, busy and error state. | Present. | M21 |
| Call/help/navigation failure | Localized visible failure and retry; no unhandled rejection. | **F12.** | M21–M22 |
| Help without configured support | Explains no support line; FAQs and privacy remain reachable. | Present. | M22 |

## E. Pending, failed, empty, permission, terminal and support states

| State | Acceptance behavior | Gap / capture |
|---|---|---|
| Initial loading | Spinner plus localized loading label, no indefinite invalid-token case. | F03; M01/M03 |
| Empty chat | Clear empty copy when writable; no pointless empty card for closed/no-history chat. | Source present; M19 |
| Chat refresh/send failure | History and draft retained; refresh retry; same failed-text request ID reused. | Source present; M19 |
| No location / no driver / no orders | Specific empty copy, not generic spinner or fake zero location. | Source present for order/track; M06/M12 |
| Unauthorized/session changed | Localized session error; protected data does not switch accounts from late responses. | API/session fence present; M04 |
| Forbidden/other user’s order | Localized permission failure, retry does not imply access will change; no private data. | API path present; M04 |
| Not found/deleted/revoked | Terminal polling stops and truthful empty/error state appears. | Order/receipt path present; public F03/F04 distinctions; M03–M04 |
| Action pending | Spinner and disabled/busy semantics across all conflicting actions. | F11 and modal focus F15; M05/M09/M20 |
| Action rejected | Localized alert/inline error; form/draft retained except intentionally cleared wrong code. | Mostly present; F06/F07 lock exceptions; M09/M20 |
| Ambiguous action failure | Advance/problem replay uses stable request/recovery identity; no duplicate proof attempt. | Source present; M20 |
| Wrong boarding/handover code | Clear error and safe retry until lock; locked state then explains recovery/disables input. | F06/F07; M09/M20 |
| Safety report pending/success/failure | Busy close/send, neutral other-party pause, admin resolution; modal accessible. | Behavior present; F15/F18; M30 |
| Rate pending/already rated | Busy feedback, one saved value per dimension, thanks state; no silent taps. | F11; M25 |
| Receipt native share | Exported content matches role-visible receipt; dismiss is non-error. | F08/F09; M26/M29 |
| Receipt web | Intentional native-share omission remains documented; printable/readable content and all role rows remain. | No pixel assessment; M26 |
| Rebook/send another/dispute | Correct ended-status/service gates; resolved/open dispute copy; no stale price/time copied. | Source helpers present; M25/M28–M29 |

## F. Accessibility, RTL, dynamic text, keyboard and motion acceptance

| Dimension | Required acceptance across all applicable matrix rows | Gap |
|---|---|---|
| Screen reader | Names/roles/states for controls; polite status/error/destination updates; decorative icons hidden; no duplicate route announcement. | F06/F07/F15–F18 |
| Keyboard | Every action operable; visible focus; radio-group arrows; modal focus containment/restoration; no keyboard-covered action. | F15/F16; keyboard-covered layout remains runtime acceptance, not a source finding |
| RTL | Logical row order and directional icons; isolated codes/plates/phones; Arabic status/reason copy; focused horizontal chip scrolls into view. | No additional source-confirmed RTL defect reported; capture M31–M32 required |
| Dynamic text | OS scale honored beyond 1.35×; full names/landmarks/codes/receipt rows remain available. | F13/F14 |
| Touch/options | All service/status options reachable without swipe-only dependency; disabled controls explain why; targets use shared minimum sizing. | F01/F02/F11 |
| Reduced motion | No searching/radar, completion zoom, error translation, modal slide, or map-camera animation when reduction is requested; state remains readable. | F18; other named components already branch |
| Color-independent state | Status text accompanies badge/marker/progress; stale/error/selected states have text or accessibility state, not color alone. | Source supports; screenshot/screen-reader acceptance M31–M32 |
| Permission/privacy | Location denial leaves landmark route; revoked session/link does not expose stale private identity; public link excludes codes/phones/notes/exact pins. | Source supports; malformed/transient public gaps F03/F04 |

---

# Screenshot inventory and missing capture list

## Existing inventory only (not visually audited)

The source inventory names Arabic and English variants for: `order-searching`, `order-scheduled`, `order-live` (ride), `order-parcel-live`, `order-done`, `receipt`, `driver-order`, `driver-receipt`, and `admin-order`. It also names generic Help and order-list shots. **There is no public `track/[token]` entry and no comprehensive terminal/exception/destination/loading/error/permission/accessibility state set.** See [docs/screens/README.md:34](../../docs/screens/README.md#L34) and [scripts/screens.mjs:173](../../scripts/screens.mjs#L173).

## Missing captures required for external Claude / acceptance

Capture each named state in **both `ar` and `en`** unless explicitly a platform-only interaction. Use deterministic seeded data and record route, role, service, status, network/fix age, font scale, motion preference and input modality. Do not treat an existing happy-path image as coverage of these states.

| ID | Exact missing state(s) |
|---|---|
| M01 | Order and receipt initial loading; initial network/server error with Retry. |
| M02 | Order cached snapshot + offline refresh warning; successful manual/pull refresh; receipt retry recovery. |
| M03 | Public malformed token; valid token offline/server error (must not say ended); revoked/not-found; retry recovery. |
| M04 | Order/receipt/public not-found, forbidden/other-user, expired session; no private data after permission loss. |
| M05 | Scheduled parcel initial/edit/unchanged/invalid/too-close/pending/failure/success; two-client stale revision conflict; slot rail keyboard focus. |
| M06 | `searching` and `assigned` for parcel, ride and freight; customer/driver/admin; scheduled-not-visible driver permission case; empty/no-driver location. |
| M07 | `at_pickup` customer cancel for all services; parcel/freight four pickup reasons, confirmation, pending, failure, cancelled-with-reason. |
| M08 | Ride arrival required, GPS too far/stale/missing errors, grace countdown/ended, boarding input and incorrect PIN. |
| M09 | Boarding fifth failure/locked customer+driver, admin reset, rotate, old-PIN rejection; pending reset modal and focus. |
| M10 | `in_transit` parcel/ride/freight; delivery identity and handover/proof; four delivery reasons; loading-help and measured freight scope. |
| M11 | Public live for each service; map loading/fallback/retry; no private notes/phone/code/exact-pin disclosure. |
| M12 | Private/public no fix, fresh (<30 s), weak (30–59 s), stale (60–120 s), expired (>120 s public); map and timestamps. |
| M13 | Reassignment during stale/offline; shared courier run; delayed road; device clock ahead/behind; terminal share grace. |
| M14 | Destination unavailable, empty edit, required landmark, city selection, cancel/reopen. |
| M15 | Destination pin selected/city changed, outside service area, location permission denied, map failure and manual-landmark fallback. |
| M16 | Destination quote pending/error/retry, review with discount/road/estimate, expired quote, stale order revision. |
| M17 | Customer pending/withdraw pending+failure; driver accept/decline pending+failure; accepted updated fare and cleared pending state. |
| M18 | Web/Android/iOS map provider failure, route diagram, retry, restored map; stale marker remains truthful during fallback. |
| M19 | Chat empty, history, cached refresh failure, send pending/failure/retry, closed read-only history; long Arabic/Latin messages. |
| M20 | Handover and return wrong attempts 1–5, locked form, no sixth UI request, admin proof reset success/failure/pending, unknown-command replay. |
| M21 | Share URL created, native share, stop-sharing confirmation/pending/error; public open; external navigation failure/retry. |
| M22 | Person call failure, driver map/open-navigation failure, Help support/privacy failure, support-unconfigured empty state; full long identity/address content. |
| M23 | `on_hold` customer/driver/admin/public; neutral pause; admin retry-delivery and return confirmations, pending/failure/success. |
| M24 | `returning` customer return code, driver entry, admin confirm-return fallback, live/stale pickup-target map, proof lock. |
| M25 | Completed parcel/ride/freight for all roles; unrated, driver-rated only, price-rated only, both rated, driver customer-rating, rating pending/failure. |
| M26 | Completed customer/driver/admin receipt with and without promo; native exported-text assertion for role rows; web receipt without share button. |
| M27 | Open/resolved dispute and seven-day boundary; receipt link and rebook/send-another on completed. |
| M28 | Ordinary cancelled and pickup-failed cancelled for all services/roles; rebook gates; public cancelled grace/ended. |
| M29 | `returned` customer/driver/admin order and return-proof receipt/share; rebook/send-another/dispute; public returned grace/ended. |
| M30 | Safety choices/note validation, pending/failure/success, neutral customer/driver hold, admin recovery; accessible modal focus. |
| M31 | For every M01–M30 representative workflow: Arabic RTL and English LTR at default and 2× text; longest names/notes/receipt values; no truncation/overlap. |
| M32 | Screen-reader announcement record and keyboard-focus captures for status changes, chips, dialogs, errors, disabled/busy reasons; normal/reduced-motion pairs for searching, completion, errors, map and modal. |

---

# Read scope and evidence limits

## Product/UI source read in full or in relevant numbered sections

- Targets: [order/[id].tsx](../../src/app/order/[id].tsx), [receipt/[id].tsx](../../src/app/receipt/[id].tsx), [track/[token].tsx](../../src/app/track/[token].tsx), [destination-change.tsx](../../src/destination-change.tsx).
- Direct UI/state helpers: [ui.tsx](../../src/ui.tsx), [parts.tsx](../../src/parts.tsx), [copy.ts](../../src/copy.ts), [model.ts](../../src/model.ts), [api.ts](../../src/api.ts), [api-client.ts](../../src/api-client.ts), [booking.ts](../../src/booking.ts), [location-state.ts](../../src/location-state.ts), [ride-flow.ts](../../src/ride-flow.ts), [road.tsx](../../src/road.tsx), [freight-details.tsx](../../src/freight-details.tsx), [pin-sheet.tsx](../../src/pin-sheet.tsx), [help.tsx](../../src/app/help.tsx).
- Map/motion implementations: [route-preview.tsx](../../src/route-preview.tsx), [map-provider-boundary.tsx](../../src/map-provider-boundary.tsx), [route-map.tsx](../../src/route-map.tsx), [route-map.android.tsx](../../src/route-map.android.tsx), [route-map.native.tsx](../../src/route-map.native.tsx), [motion.tsx](../../src/motion.tsx), [motion.native.ts](../../src/motion.native.ts).

## Contracts, fixtures and inventory used to confirm behavior

- [server/main.ts](../../server/main.ts) sections for order serialization, cancel/schedule/rate, share/public tracking, lifecycle advance/exception/decision, ETA and proof reset.
- [server/domain/destination-change.ts](../../server/domain/destination-change.ts) and [server/domain/ride-lifecycle.ts](../../server/domain/ride-lifecycle.ts).
- Relevant sections of [presentation.test.mjs](../../tests/presentation.test.mjs), [pickup.test.mjs](../../tests/pickup.test.mjs), [schedule.test.mjs](../../tests/schedule.test.mjs), and [map.test.mjs](../../tests/map.test.mjs); targeted searches across `tests/` for receipt, return, destination, lock, schedule and UI coverage.
- [package.json](../../package.json), [docs/screens/README.md](../../docs/screens/README.md), [docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md](../../docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md), and targeted source/documentation searches plus [scripts/screens.mjs](../../scripts/screens.mjs) capture inventory.

## Limits

No findings are inferred from screenshot appearance, animation observation, device behavior, network experiments or test execution. Recommendations are tests to add/run later, not claims of executed verification. Existing dirty screenshots/scripts/vendor files were left untouched. The only file created by this audit is this report.
