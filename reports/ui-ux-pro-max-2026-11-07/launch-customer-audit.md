# Fastship / Wind — narrowed launch and customer UI/UX audit

**Audit date:** 2026-11-07  
**Baseline:** `f8d58c14d43cc31475411899ebfa29c23b04f79c` (confirmed; worktree was clean before this report)  
**Model:** `kimi-k3.1-pro`  
**Mode:** read-only source audit; no product edits, emulator, phone, screenshots regeneration, commits, or heavy tests  
**Deliverable:** `reports/ui-ux-pro-max-2026-11-07/launch-customer-audit.md`

## 1. Scope and evidence limits

The parent narrowed the original whole-app request to **only** these four route files and their welcome/sign-in/home/orders Arabic+English screenshot pairs:

- `src/app/welcome.tsx`
- `src/app/auth.tsx`
- `src/app/(customer)/index.tsx`
- `src/app/(customer)/orders.tsx`

This is therefore **not** a complete booking, order-detail, receipt, profile, recovery-form, recipient-tracking, roads, driver, or admin audit. Child components were read only where necessary to avoid guessing about the four routes' actual roles, target sizes, loading behavior, copy, or order-row semantics. No finding below expands the audit to another route.

### Screenshot limitation — material

All 12 requested `read_image` calls failed before any image content was returned: the runtime reported that `kimi-k3.1-pro` does not declare image input. Consequently:

- **No screenshot is marked visually inspected.**
- **No visual hierarchy, rendered Arabic/English copy, contrast, clipping, RTL layout, safe-area, or screenshot/source parity claim is confirmed in this report.**
- “Source confirmed” means the implementation or a mathematically derivable layout property is present in source. It does not mean its runtime effect was observed.
- Items whose user impact depends on a screen reader, keyboard, font scale, viewport, or network runtime are explicitly identified as hypotheses or as source-confirmed gaps requiring device verification.

The screenshot README says its normal captures are 390×844 @2x, full scroll height, generated 2026-10-28 (`docs/screens/README.md:1-6`). That does not establish parity with this 2026-11-07 baseline.

### Severity and certainty rubric

- **BLOCKING:** a real broken or inaccessible core behavior. None was established from the scoped source.
- **HIGH:** severe core journey impairment short of a blocker. None was established with the available evidence.
- **MEDIUM:** material usability/accessibility/recovery problem with a bounded workaround.
- **LOW:** polish, copy, efficiency, or robustness issue.
- **Confirmed defect:** directly established by scoped source (and, where useful, the shared primitive it invokes).
- **Hypothesis:** source shows risk, but actual impact requires rendering/device/runtime evidence.
- **Coverage gap:** missing evidence/test artifact, not asserted to be a user-facing defect.

## 2. Executive result

The four scoped files expose the expected first-run, authentication, home, and order-history controls, with generally explicit accessible names and button roles, safe-area containers, keyboard submission paths, visible async buttons, and an orders empty state. No scoped source finding justifies BLOCKING or HIGH severity without runtime proof.

The most actionable confirmed defects are:

1. The neutral **Where to? / Later** home entry silently opens **parcel** booking (`src/app/(customer)/index.tsx:42-50`).
2. The home **Later** target is only 40pt high (`src/app/(customer)/index.tsx:47-50,116`).
3. Auth permits switching Sign in/New account while a request is pending (`src/app/auth.tsx:118-128,196-197,244`).
4. Auth validation is detached from fields and does not focus the invalid field/error (`src/app/auth.tsx:106-129,178-188,208-243`).
5. Home/orders stale-data errors offer only pull-to-refresh, with no visible non-gesture retry (`src/app/(customer)/index.tsx:64-65`; `src/app/(customer)/orders.tsx:8-13`).
6. Privacy/terms and shared auth footer links fall below the product's 44pt target requirement (`src/app/auth.tsx:237-240,261`; `src/ui.tsx:173,177-184`; `src/parts.tsx:358-370,467`).
7. Dynamic status/error/reset-step transitions need focus and announcement work; reduced-motion handling is not uniform (`src/app/welcome.tsx:39-60`; `src/app/auth.tsx:86-103,174-194`; `src/ui.tsx:379-383`).

Visual acceptance remains open. The scoped screenshot set also lacks the loading/error/empty variants needed to accept important source branches.

## 3. Control and state inventory

“Source pass” below is deliberately narrow: it records a useful implementation provision, not runtime compliance. “Open” points to the finding or missing evidence that prevents acceptance.

### 3.1 Welcome — `src/app/welcome.tsx`

| Widget/option/state | Source evidence | Source-level acceptance | Remaining acceptance / test |
|---|---|---|---|
| Arabic↔English language pill | `:15-16,24-36` | Named `Press`, default button role; `minHeight:44` at `:121`; copy rekeys slide text at `:45`. | Verify language change preserves slide index and reading order in AR/EN; visual result unavailable. |
| Skip onboarding | `:33-35` | Visible only before last slide; named 44pt control; calls `finishOnboarding`. | Activate on each of slides 1–2 and relaunch: auth should appear and welcome should stay dismissed. |
| Slide 1: services artwork + title/body | `:20-21,40-48,66-71` | Reduced-motion-aware entrance; body lives in a `ScrollView`. | Inspect normal/large text and TalkBack/VoiceOver artwork output; W-H1. |
| Slide 2: price artwork, save badge, cash label | `:42,74-83` | Text and icon are present rather than color-only pricing meaning. | Check long localized strings and decorative-icon announcement; W-H1. |
| Slide 3: assigned → in transit → completed + illustrative code `4827` | `:43,86-106` | Code uses LTR writing direction at `:132`; entrance animations honor reduced motion. | Ensure the sample code is not mistaken for a real handover credential; W-H1. |
| Three pagination radios | `:51-58,125-127` | Each has a step-of-total name, `radio` role, checked value, and a 44×44 target. | TalkBack/VoiceOver must announce selected state; keyboard focus and activation need verification. |
| Next / Get started primary CTA | `:19,59-60` | One primary CTA; last-slide branch finishes onboarding; shared button supplies busy/disabled semantics when applicable. | W-D1: verify the new slide is announced and keyboard/SR focus reaches its heading. |
| Reduced motion | `:18,40,45,88-100` | Slide and artwork entrance animations are omitted when reduced motion is requested. | Enable OS reduced motion before launch; confirm no entrance/zoom movement and all three states remain readable. |
| Safe area and small screens | `:23,39,51-63,120-124` | `SafeAreaView`, scrollable body, and fixed footer are structurally present. | 320pt-wide phone, landscape, largest text, gesture navigation: footer must not cover slide copy. Rendered result open. |
| Install link | `:61` | Present through `InstallLink`; child implementation is outside this narrowed audit. | Do not infer its platform branches or accessibility from this packet. |

### 3.2 Authentication — `src/app/auth.tsx`

| Widget/option/state | Source evidence | Source-level acceptance | Remaining acceptance / test |
|---|---|---|---|
| Language pill | `:22,161-165` | Named control; 36pt visual height plus 4pt hitSlop on all sides gives 44pt total. | Product 44pt minimum is derivable; Android 48dp guidance and actual parent clipping require device review. |
| Sign in / New account mode radios | `:25,196-197` | Named radio group/options through `Choices`; selection changes form. | A-D1: selector is not disabled while busy. Test keyboard selected state and focus after changing modes. |
| Sign-in identifier + password | `:109,121-128,213-218` | Visible labels, username/password autocomplete, password submission, nonempty validation. | Wrong credentials, offline, paste/password manager, keyboard submit, and error announcement require runtime coverage. |
| Sign-up name/email/mobile/password | `:110-117,207-218` | Next-key focus chain; email/phone keyboard types; email/phone/password validation; maximum lengths. | A-D2: errors are global rather than field-associated/focused. Test very long valid inputs and Arabic digits. |
| Customer/driver role | `:43,220-227` | Radio group; driver-only fields are progressively disclosed. | Switch roles with partially entered plate/vehicle and while offline; confirm no accidental loss or irrelevant error. |
| Driver vehicle choices and plate | `:44-45,114,222-227` | All `vehicles` are options; plate required except bicycle; plate validation present. | This packet inventories the option only; driver onboarding behavior is otherwise out of scope. |
| Consent checkbox + privacy/terms links | `:42,116,230-240` | Named checkbox exposes checked state; consent blocks registration until accepted; legal links are separate. | A-D5: legal/footer targets are too small; test activation without toggling consent accidentally. |
| Create account / Sign in async state | `:46,106-130,244` | Busy guard prevents duplicate submit; fields and main button disable; button spinner/busy state and haptics accompany visual state. | A-D1: mode tabs remain active; test slow success/failure and app background/resume. |
| Registration policy: loading | `:51-64,199` | Sign-up waits for server policy rather than falsely reporting closed. | X-D3: spinner-only feedback lacks visible/named loading copy; no screenshot. |
| Registration policy: failed + retry | `:60-64,200-202` | Specific copy plus retry is present; request can be retriggered. | Simulate failed then successful `/auth/options`; no screenshot or runtime result. |
| Registration policy: closed + support | `:203-206` | Explains closure and shows support only when configured. | Test configured and missing support URL, external-link failure, and return to sign-in. |
| Optional Microsoft/Entra sign-in | `:47-49,72-77,132-157,245-247` | Preparation failure has retry; request/nonce is not reused; browser dismissal returns without an error; busy guard present. | Exercise unavailable provider, dismissal, invalid nonce, and sign-up validation. Child/auth-provider UI not audited. |
| Email reset entry | `:26-29,248-251` | Capability controls whether reset form or help opens; password is cleared on entry. | No busy/error/sent/reset-complete screenshots in the scoped pair. |
| Email reset: request code | `:79-104,174-179,186-194` | Generic response copy; six-digit OTP, autocomplete, new-password rules, resend and back paths. | A-D3/A-D4: focus and stale-code behavior; test generic response, expiry, resend, offline, and auto-login failure. |
| Phone recovery gate: checking/ready/unavailable/disabled/failed | `:31-38,66-70,252-257`; `src/phone/flow.ts:31-38` | Checking does not falsely advertise availability; ready opens recovery; failed has retry; unavailable/disabled are truthful notes. | The `PhoneRecovery` child form itself is outside this packet. Test each gate and retry transition. |
| Notices and errors | `:30,50,98,186,242-243` | Errors use shared alert role; reset/auth notice is visible. | A-D2/A-D3: notice and newly revealed controls need focus/live-region verification. |
| Help/privacy/support/install footer | `:189-194,261-262` | Help/reset/back links are named; footer is available outside the card. | A-D5/A-D6: target sizes and external-link failure recovery. |
| Reduced motion / safe area / keyboard avoidance | `:24,159-172`; `src/ui.tsx:118-136` | Main hero/form entrance is disabled for reduced motion; iOS wrapper and shared safe-area/keyboard handling exist. | Shared `ErrorText` still animates (X-D2). Test keyboard at largest text in driver sign-up and reset states. |

### 3.3 Customer home — `src/app/(customer)/index.tsx`

| Widget/option/state | Source evidence | Source-level acceptance | Remaining acceptance / test |
|---|---|---|---|
| Greeting, first name, help | `:24-37` | Local-time greeting, logo, first name, and a named 44pt help icon button. | Long first name is single-line at `:34`; visual truncation open but non-core. |
| “Where to?” destination entry | `:12,42-46` | Named, prominent destination-first action with a search icon. | H-D1: it silently chooses parcel. Verify expected service choice and accessible label against visible intent. |
| “Later” scheduling entry | `:47-50` | Real button rather than decorative label; opens scheduling branch. | H-D1 service mismatch and H-D2 40pt target; no scheduling child audit here. |
| Verify-email nudge | `:53`; `src/parts.tsx:339-355` | Conditional on capability, email presence, and unverified state; named route to profile. | Child verification flow and visible nudge variant not covered by scoped screenshot pair. |
| Enabled parcel/ride/freight service tiles | `:26,55-63` | Only server-enabled services render; each has a name, icon, press feedback, and two-line label. | H-D4 zero-service state; H-H2 text scaling/three-column layout. Test each service opens the matching form. |
| Initial loading | `:17-18,64-65` | Core service entries remain available while orders load; spinner appears when no data. | X-D3 loading name/copy; **home loading screenshot missing**. |
| Initial error + retry | `:64-65` | Localized error plus shared failed-loading retry when `data` is absent. | **Home initial-error/offline screenshot missing**; test retry success and repeated failure. |
| Stale/cached data + update failure | `:17-23,64-65` | Existing active/recent cards remain visible with “updates paused” copy. | X-D4: only pull gesture is offered for retry; **stale-error screenshot missing**. |
| Active orders | `:19,67-70` | All searching/active statuses map to named `OrderRow` controls with service/route/price/status. | H-D3 singular section title for multiple; no zero/one/multiple visual variants. |
| Recent distinct completed routes | `:20-23,72-85` | Deduplicates by service/city pair, newest first, maximum three; each row reorders with service/from/to/again params. | H-D5 accessible name omits service/direction; cancelled/returned reorder behavior needs product acceptance. |
| See all | `:73` | Named action navigates to orders; shared hitSlop brings its label target to 44pt (`src/ui.tsx:186-194`). | Keyboard focus and target verification remain runtime work. |
| Safety promo | `:87-104` | Full visible title/body form the accessible name; opens relevant help topic. | H-H2 two-line truncation; external route child not audited. |
| Plus promo / Plus-member safety layout | `:87-105` | Nonmembers get horizontal safety+Plus rail; members get one wide safety card; discount/price interpolated. | Test zero/large discount and price, long Arabic/English strings, rail start in RTL, and 320pt width. |
| Pull to refresh / safe area | `:28`; `src/ui.tsx:118-136` | RefreshControl and tab-aware safe-area handling exist. | Keyboard/switch alternative is missing specifically in stale-error state (X-D4). |

### 3.4 Customer orders — `src/app/(customer)/orders.tsx`

| Widget/option/state | Source evidence | Source-level acceptance | Remaining acceptance / test |
|---|---|---|---|
| Header and tab context | `:8-9` | Orders header has no inappropriate nested back button. | Heading name/order and tab selected state require SR/keyboard verification. |
| Initial loading | `:7,11` | Shared spinner while `data` is null. | X-D3; **orders loading screenshot missing**. |
| Initial error + retry | `:10-11` | Specific localized alert plus retry when no list is available. | **Orders initial-error/offline screenshot missing**; test retry and error alert announcement. |
| Empty result | `:11-12` | Explicit icon, “No orders yet” title/body, and Home action rather than a blank screen. | O-D1 action is indirect for the next core job; **orders empty screenshot missing**. |
| Loaded orders, every returned status | `:13`; `src/parts.tsx:160-193` | Generic rows include service, direction-aware cities, price, textual status badge, scheduled/created time, and code; cancelled price also has strike-through, not color alone. | This packet does not exhaustively fixture every status; test all customer statuses, long city/service names, and shared/private labels. |
| Stale list + polling failure | `:8-13` | Error alert is shown without discarding loaded rows. | X-D4 no visible retry; **stale-error screenshot missing**. |
| Pull to refresh | `:8` | Shared RefreshControl is wired to `reload`. | Test refresh success/failure and focus preservation; non-gesture retry remains open for stale data. |
| Load older: available/busy/failure/end | `:7,13`; `src/parts.tsx:115-157` | Cursor pagination, duplicate-submit guard, busy spinner, error copy, and retry through same button are implemented. | **Pagination loading/error/end screenshots missing**; test polling while an older page is in flight. |
| Long history rendering | `:13` | All loaded rows remain in one scrollable screen. | O-H1: map is not virtualized; profile after many pages before calling it a runtime performance defect. |

## 4. Confirmed-defect acceptance matrix

The “screenshot” column is intentionally uniform: no image could be decoded in this runtime, so no item has screenshot confirmation.

### 4.1 Welcome

| ID / severity | Exact scenario and defect | Evidence / certainty | Smallest fix | Required regression / device test |
|---|---|---|---|---|
| **W-D1 — MEDIUM** | On Next or a pagination radio, slide title/body changes while activation stays on the footer. There is no heading ref/focus move or live announcement, so a screen-reader user may receive no contextual announcement of the new slide. | `src/app/welcome.tsx:39-60`. **Confirmed source gap; screenshot unavailable.** Actual TalkBack/VoiceOver announcement remains to be measured. | Give the slide heading a ref and focus it after `index` changes, or use a carefully scoped polite live region containing the new title/body. Do not move focus for initial first paint unnecessarily. | With TalkBack and VoiceOver, activate Next, Back-equivalent radio selection, and each dot; hear slide n of 3 and its new heading once, without duplicate reading. Verify keyboard focus is visible and not trapped. |

### 4.2 Authentication

| ID / severity | Exact scenario and defect | Evidence / certainty | Smallest fix | Required regression / device test |
|---|---|---|---|---|
| **A-D1 — MEDIUM** | Start sign-in on a slow network, then tap New account before it resolves. `busy` disables fields/main button but not the mode `Choices`; the pending operation can still sign in while the UI says New account, and the spinner can inherit the other mode's label. | Busy/request at `src/app/auth.tsx:106-130`; mode selector lacks `disabled={busy}` at `:196-197`; button label switches on `mode` at `:244`. **Confirmed source defect; screenshot unavailable.** | Pass `disabled={busy}` to the sign-in/sign-up `Choices` (and disable other mode-changing links while busy), or explicitly cancel/ignore stale requests by operation id. Disabling is the smallest change. | Throttle both login and registration. Attempt mode switches during pending success/failure; verify no mislabeled spinner, unexpected navigation, or stale error. Repeat for Entra and password reset. |
| **A-D2 — MEDIUM** | Submit blank/invalid sign-up or reset fields. Validation sets one global error near the bottom; `Field` receives no `error`, and no invalid field/error ref is focused. On the long driver form the message may be off-screen and is not programmatically tied to the responsible input. | Validation `src/app/auth.tsx:79-117`; fields `:178-185,208-239`; one shared error at `:186,243`; no focus-on-error in `:54-57` or submit functions. **Confirmed source defect; screenshot unavailable.** | Track an error field key, pass the message to that `Field`'s existing `error` prop, and focus the first invalid ref. Keep the shared alert for server/global failures. Add refs for name/consent/plate as needed. | For every validation branch, verify inline association, alert announcement exactly once, first-invalid focus, retained values, visible focus above keyboard, and correction clearing the error. Test AR/EN and 200% font. |
| **A-D3 — MEDIUM** | After “Email me a code” succeeds, code/password fields appear below the identifier but focus remains on the initiating control; the changed explanatory copy and new fields have no explicit live announcement/focus. The reset-complete notice after failed automatic login is likewise plain text. | Reveal at `src/app/auth.tsx:86-103,174-188`; notice at `:98,242`. **Confirmed source gap; screenshot unavailable.** | Focus the OTP ref on transition to `resetSent`; announce the sent/generic status politely. On return to sign-in with `resetDone`, announce the notice and place focus predictably at the sign-in heading or identifier. | TalkBack/VoiceOver + keyboard: request code, resend, go back, expire code, reset successfully with auto-login both succeeding and failing. Verify focus never lands on an unmounted control. |
| **A-D4 — LOW** | Request a code, edit the identifier, then request for the second account. Editing sets `resetSent(false)` but leaves the previous six-digit `code` in state; the newly revealed OTP field can contain a stale code. | `src/app/auth.tsx:178` only changes phone/resetSent; code is cleared only by explicit resend/back paths at `:188,192`. **Confirmed source defect; screenshot unavailable.** | Add `setCode('')` when the identifier changes after a code was requested (and clear any stale reset error). | Request codes for two identifiers and ensure the second OTP starts empty; verify editing before first send does not erase unrelated sign-in state unexpectedly. |
| **A-D5 — MEDIUM** | Privacy/terms visible text is 17pt high and gets only 12pt top/bottom hitSlop: approximately **41pt**, below the documented 44pt minimum. Shared Help/Support/Privacy footer links are 17pt text + 8pt vertical padding = **33pt**, with no hitSlop. | Auth links `src/app/auth.tsx:237-240,261`; caption metrics `src/ui.tsx:173,177-184`; footer implementation/style `src/parts.tsx:358-370,467`. **Confirmed by source arithmetic; screenshot unavailable.** | Give each link a `minHeight:44` wrapper/style; preserve at least 8pt separation. Extend horizontal hit area if a link's text width is under 44pt. Prefer shared `link` style fix plus explicit legal-link minHeight. | Use Android layout bounds/accessibility scanner and iOS VoiceOver touch exploration on 320/390pt widths; confirm 44×44 minimum, no overlapping hit rects, and correct link activation in both languages. |
| **A-D6 — LOW** | Privacy, terms, registration-closed support, and shared support links call `Linking.openURL` without rejection handling. If no handler/browser/mail client can open the destination, the user receives no in-app error or recovery. | `src/app/auth.tsx:205,238-239`; shared footer invoked at `:261` and implemented at `src/parts.tsx:358-370`. **Confirmed missing failure branch; occurrence is conditional.** | Await/catch `openURL` and show the existing localized `ErrorText` with a retry or help route; do not report an external handoff as successful before it resolves. | Revoke/disable the external handler or reject the promise in a test harness; verify visible + announced error and working retry. Also test successful browser/mail handoff and back navigation. |

### 4.3 Home and shared home/orders recovery

| ID / severity | Exact scenario and defect | Evidence / certainty | Smallest fix | Required regression / device test |
|---|---|---|---|---|
| **H-D1 — MEDIUM** | Tap the neutral “Where to?” or “Later” home action intending a ride or freight job. Both hard-code `service:'parcel'` without saying “parcel” in their visible/accessibility names. The user is taken into the wrong service form and must back out/change context. | `src/app/(customer)/index.tsx:12,42-50`; generic `whereTo`/`later` labels are used at `:43-49`. **Confirmed navigation/copy mismatch; screenshot unavailable.** | Smallest honest fix: if these are intentionally parcel shortcuts, label/name them accordingly. Otherwise open a service chooser first and carry destination/schedule selection into the chosen parcel/ride/freight flow. | From each home entry, verify the resulting service is the one communicated before tap. Test all enabled-service subsets, AR/EN accessible names, and preservation of destination/schedule intent. |
| **H-D2 — MEDIUM** | The “Later” button's inner press style has `minHeight:40` and no hitSlop. The surrounding search container's padding does not enlarge this `Pressable`'s own hit rectangle, so the target is 40pt high, below the 44pt product requirement. | `src/app/(customer)/index.tsx:47-50,112-117`; `Press` applies the supplied style to the inner view, not hitSlop, at `src/ui.tsx:224-234`. **Confirmed source/target-size defect; screenshot unavailable.** | Change `styles.now.minHeight` from 40 to at least 44 (48dp on Android if adopting Material targets); optionally add symmetric hitSlop without overlapping “Where to?”. | Measure actual hit rects on small/large phones at default and largest fonts. Tap all edges of Later and adjacent Where to? to detect overlap or missed taps. |
| **X-D4 — MEDIUM** | With previously loaded home/orders data, a refresh/poll failure shows an error but `!data` is false, so the failed-loading retry button disappears. Copy tells home users to pull down; keyboard, switch-control, and users unable to perform that gesture have no equivalent visible retry action. | Home `src/app/(customer)/index.tsx:64-65`; orders `src/app/(customer)/orders.tsx:8-13`; shared pull gesture `src/ui.tsx:122-133`. **Confirmed source defect; screenshot unavailable.** | Add a small named Retry button beside the stale-data error on both screens (or render an error action independent of `!data`). Keep pull-to-refresh as an additional shortcut. | Seed data then fail the next poll on both screens. Activate Retry by touch, keyboard, TalkBack, and Switch Access; retain old data, announce result, and prevent duplicate retries. |
| **H-D3 — LOW** | If two or more active orders are returned, every row renders under the singular “Your current order” / Arabic singular section title. The code explicitly maps an array, so the copy does not agree with the multi-order state. | Filter/map at `src/app/(customer)/index.tsx:19,67-70`; `activeOrder` copy targeted in `src/copy.ts:285,1306`. **Confirmed conditional copy defect; screenshot unavailable.** | Use plural/generic “Active orders” copy whenever `active.length !== 1`, or replace the heading with a language-appropriate count. | Fixture zero, one, and multiple active orders in AR/EN; verify title, count, accessible reading order, and no duplicate IDs. |
| **H-D4 — MEDIUM** | If capabilities return `enabledServices:[]`, the Services heading renders with an empty row and no explanation, scheduled alternative, or support action. | Capability fallback/filter at `src/app/(customer)/index.tsx:26,55-63`. **Confirmed unhandled empty branch; screenshot unavailable.** | Add a localized empty-service card explaining temporary unavailability and linking to Help/support; only show the tile row when nonempty. | Return `[]`, one service, and all three; verify no blank heading, truthful availability copy, working support route, and no parcel-only shortcut bypassing capability policy. |
| **H-D5 — LOW** | A recent route visibly includes service and pickup note, but its accessible name is only “Request [pickup] [dropoff]” with no service, direction word, or note. Parcel/ride/freight routes between the same cities can therefore sound identical and ambiguous. | Visible row `src/app/(customer)/index.tsx:75-83`; label at `:75` omits `o.service`, `o.pickupNote`, and a direction connector. **Confirmed accessible-name deficiency; screenshot unavailable.** | Build the name as “Request again: [service], [pickup] to [dropoff]” using localized direction copy; include note only if useful and keep it concise. | Fixture two services on the same city pair in AR/EN. TalkBack/VoiceOver must distinguish each and announce the reorder action without reading a misleading visual-only label. |
| **O-D1 — LOW** | A new customer with no orders gets a useful empty explanation, but its only CTA is Home. This adds a navigation step and does not directly start the next job suggested by the empty state. | `src/app/(customer)/orders.tsx:11-12`. **Confirmed recovery inefficiency; screenshot unavailable.** | Make the primary CTA “Book a parcel”/“Start an order” to the appropriate enabled booking choice; retain Home via the existing tab, avoiding two competing primary actions. | With no orders and each service-capability subset, activate CTA and confirm an allowed booking path. Test empty→first order→empty-after-filter/history transitions in AR/EN. |

### 4.4 Shared states invoked by the scoped screens

| ID / severity | Exact scenario and defect | Evidence / certainty | Smallest fix | Required regression / device test |
|---|---|---|---|---|
| **X-D1 — LOW** | Initial sign-up policy, home orders, and orders list loading use an unlabeled `ActivityIndicator` with no visible explanatory text or explicit accessible name/busy region. Users get only a generic spinner, and assistive technology has no route-specific loading phrase. | Calls `src/app/auth.tsx:199`, `src/app/(customer)/index.tsx:65`, `src/app/(customer)/orders.tsx:11`; primitive `src/ui.tsx:486-490`. **Confirmed source gap; screenshot unavailable.** | Add a localized visible loading label and `accessibilityLabel`/`accessibilityRole` (or a named `accessibilityLiveRegion`) to `Loading`, e.g. “Loading orders” via an optional label prop. Avoid announcing polling refreshes repeatedly. | TalkBack/VoiceOver hear one meaningful loading phrase on initial load and no infinite/repetitive announcements during polling. Sighted users see what is loading at 200% text. |
| **X-D2 — LOW** | Auth/home/orders errors always enter with `FadeInDown.duration(200)` even when reduced motion is requested. The main welcome/auth entrances respect reduced motion, but the shared error path does not. | Error calls in `src/app/auth.tsx:186,243`, `src/app/(customer)/index.tsx:64`, `src/app/(customer)/orders.tsx:10`; implementation `src/ui.tsx:379-383`. **Confirmed source inconsistency; screenshot unavailable.** | Call `useReducedMotion` in `ErrorText` and set `entering={undefined}` when requested, while retaining alert semantics. | Enable reduced motion and trigger every scoped validation/network error. Verify no downward entrance, text remains visible, and alert announcement still occurs once. |
| **X-D3 — LOW** | The shared failed-loading Retry has no pending guard or busy feedback. Each tap calls `reload()` → `load(true)`; when a request is already in flight, `force` advances the generation and starts another request. Rapid taps can therefore create overlapping requests, with only the latest response applied. | Retry rendered at `src/app/(customer)/index.tsx:65` and `src/app/(customer)/orders.tsx:11`; primitive `src/ui.tsx:487-490`; forced generation/request behavior at `src/api.ts:49-69,104`. **Confirmed source defect; screenshot unavailable.** | Expose reload pending state from `useApi` and pass it to the retry action as loading/disabled, or make repeated manual reloads join the current in-flight request instead of forcing another generation. Preserve the intentional latest-response guard. | Double-tap Retry on slow failing and slow succeeding networks; verify one in-flight request per deliberate retry, visible busy feedback, no error/refresh-indicator storm, and only the latest result applied. |

> **Correction to ID naming:** X-D1/X-D2/X-D3 here are the shared-state defects; X-D4 is the home/orders stale-data retry defect in §4.3. IDs are unique despite appearing in separate tables.

## 5. Hypotheses and non-asserted risks

These must not be converted into certain defects without the stated evidence.

| ID / severity | Hypothesis and exact scenario | Source basis | Smallest prospective fix | Evidence required |
|---|---|---|---|---|
| **W-H1 — LOW** | Slide artwork, especially sample statuses and code `4827`, may be read as meaningful current-user content or produce noisy glyph announcements because the artwork container is not accessibility-hidden. | `src/app/welcome.tsx:40-44,66-106`; sample code at `:103`. | If SR confirms duplication/confusion, mark only the artwork container `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`; keep title/body accessible. | TalkBack and VoiceOver traversal of all three slides in AR/EN. Do not hide the slide's explanatory text. |
| **H-H1 — MEDIUM** | At large OS font sizes or 320pt width, Where to? and Later may clip/reflow poorly: both use raw `Text`, Where to? is single-line, and the fixed horizontal split competes for width. | `src/app/(customer)/index.tsx:42-50,112-117`. | Allow two lines or stack Later below the destination control at narrow/large-text breakpoints; preserve full accessible names and ≥44pt targets. | Render 320/360/390pt widths, AR/EN, font scales 130/160/200%, and landscape; inspect for ellipses, overlap, and target shrinkage. |
| **H-H2 — MEDIUM** | Three service columns and two-line promo labels may ellipsize essential service/discount/safety copy under long localization or larger text. | Fixed equal row `:56-63`, tile label `numberOfLines={2}` at `:60`; promo title/body two-line limits `:101-105`; fixed promo width `:121`. | Wrap service tiles at narrow widths, increase card height by allowing text to wrap, or use a vertical list when text no longer fits. Avoid solving by lowering font size. | Same matrix as H-H1, with longest real copy and service subsets 1/2/3. Verify full discount/price and safety message are available visually and to SR. |
| **X-H1 — MEDIUM** | Shared `Txt` caps OS scaling at 1.35, so a 200% user preference is not fully honored on much of the welcome/auth/home/orders text. This may fail the product's larger-device-text intent even where clipping is avoided. | `src/ui.tsx:177-184`; representative uses `src/app/welcome.tsx:46-47`, `src/app/auth.tsx:169-170`, home `:33-34`, orders through shared rows. | Remove the cap and fix any resulting fixed-height/single-line constraints, or obtain an explicit accessible product decision and provide another enlargement mechanism. Do not claim WCAG failure from the cap alone. | Compare actual rendered font sizes at OS 100/135/160/200%; inspect all scoped states and verify no lost content/actions. |
| **O-H1 — LOW** | After loading many older pages, mapping every order inside one `ScrollView` may cause memory/scroll degradation. No runtime slowdown is established. | `src/app/(customer)/orders.tsx:8,13`; accumulation in `src/parts.tsx:115-147`. | Only if measured: use a virtualized list with header/empty/error/footer components while preserving focus and pagination. | Profile a realistic multi-page history on the target Android phone and iOS; record row count, memory, frame drops, and SR traversal before/after. |
| **A-H1 — LOW** | Secure password fields have no show/hide control, which can make 12+ character entry and correction harder, especially with motor/low-vision needs. This is a usability enhancement, not proof that authentication is inaccessible; paste/autocomplete remain available. | Password `Field`s at `src/app/auth.tsx:183-184,217-218`; `Field` API at `src/ui.tsx:338-376` has no visibility toggle. | Add a named 44pt Show/Hide password control with pressed state; retain `secureTextEntry` default and autocomplete. | Keyboard, SR, password manager, paste, AR/EN, and external keyboard tests; ensure the toggle does not submit or move focus unexpectedly. |

## 6. Screenshot and state-coverage acceptance matrix

### 6.1 Requested existing pairs — attempted, not visually read

| Route/state | Arabic PNG | English PNG | Result |
|---|---|---|---|
| Welcome slide 1 | `docs/screens/ar/welcome-1.png` | `docs/screens/en/welcome-1.png` | `read_image` refused: model has no image input |
| Welcome slide 2 | `docs/screens/ar/welcome-2.png` | `docs/screens/en/welcome-2.png` | Same |
| Welcome slide 3 | `docs/screens/ar/welcome-3.png` | `docs/screens/en/welcome-3.png` | Same |
| Sign in | `docs/screens/ar/sign-in.png` | `docs/screens/en/sign-in.png` | Same |
| Home | `docs/screens/ar/home.png` | `docs/screens/en/home.png` | Same |
| Orders | `docs/screens/ar/orders.png` | `docs/screens/en/orders.png` | Same |

No screenshot-backed defect is claimed. An image-capable reviewer still needs to compare these files to baseline source, including rendered hierarchy, contrast, RTL alignment, artwork, text truncation, bottom-tab clearance, and actual empty/loading content.

### 6.2 Explicitly missing state captures in the scoped inventory

| Screen | Missing evidence | Why it matters / minimum new captures |
|---|---|---|
| Welcome | Reduced-motion equivalents; 200% text; 320pt/landscape; keyboard focus; screen-reader selected-slide state | Static normal slides cannot accept W-D1, W-H1, target/focus behavior, or layout growth. Capture each slide at largest text and document reduced-motion playback separately (a static PNG cannot prove animation behavior). |
| Sign in | Busy/pending; wrong credentials; offline/server error; keyboard open; optional Entra preparing/failed; phone gate checking/failed/unavailable/disabled | Only default sign-in was in the requested pair. These branches are implemented at `src/app/auth.tsx:31-77,118-157,242-257` but have no scoped visual evidence. |
| Sign up | Policy loading/failed/closed; customer validation; driver expanded with plate; consent error; pending registration | These are source-visible branches, not accepted screenshots in this packet. Existing sign-up PNGs were outside the parent's requested sign-in pair and were not used as evidence. |
| Email reset | Initial; code sent; invalid/expired code; resend pending; reset complete/auto-login failed | Needed for A-D2–A-D4 and keyboard/focus layout at `src/app/auth.tsx:174-194`. |
| Home | **Loading; initial error; stale-data error; no orders; one and multiple active orders; no recent routes; zero enabled services; email-verification nudge; member and nonmember variants; pagination-independent long/empty content** | Only normal `home.png` exists per scoped route. At minimum add home-loading, home-initial-error-with-retry, home-stale-error-with-retry, home-no-orders, home-no-services, and home-multiple-active in AR/EN. |
| Orders | **Loading; initial error; stale-data error; empty; pagination busy; pagination failure; end-of-history; every customer-visible status** | Only normal `orders.png` exists. The source empty state at `src/app/(customer)/orders.tsx:11-12` is therefore unverified visually. Add orders-loading, orders-initial-error, orders-stale-error, orders-empty, orders-more-loading, and orders-more-error in AR/EN; use fixtures for all statuses separately. |
| All four | Offline vs generic server failure; reduced motion; largest text; external keyboard focus; TalkBack/VoiceOver output; Android gesture bar and iOS home indicator | Static screenshots alone cannot prove focus order, announcements, reduced motion, touch targets, or async behavior. Pair visual captures with device recordings/accessibility assertions. |

## 7. Focused regression/device acceptance suite

No heavy tests were run. The following is the required manual/small-fixture acceptance plan after the smallest fixes:

1. **Welcome state traversal:** fresh install → language toggle on each slide → dots in and out of order → Next → Skip on slides 1/2 → Get started on slide 3 → relaunch. Verify persisted onboarding and no lost/duplicated announcement.
2. **Auth validation matrix:** blank sign-in; malformed sign-up email/phone; short/long password; missing consent; driver without plate; wrong credentials; offline; generic server failure. Verify first-invalid focus, inline error association, retained input, visible keyboard focus, and one alert.
3. **Auth pending matrix:** slow login/register/Entra/reset/capability/policy requests. Attempt every mode-changing action, double-tap submit, background/resume, then resolve out of order. No stale operation may change the newly selected mode's message or unexpectedly authenticate.
4. **Recovery matrix:** code request → edit identifier → second request → paste OTP → resend → expiry → reset success with login success/failure. OTP must start empty for the new identifier and focus/announcement must follow the revealed step.
5. **Home service intent:** Where to?, Later, every enabled service tile, recent-route reorder, safety promo, Plus promo, See all, active order, Help, and email nudge. Each must expose its actual destination/service in visible and accessible names.
6. **Home data states:** delayed initial load; initial failure/retry; cached data then failed poll/retry; no orders; zero/one/many active orders; zero/one/three enabled services; member/nonmember; long route/note/name/discount copy.
7. **Orders data states:** loading; initial failure/retry; empty; loaded; stale error/retry; load-older pending/failure/success/end; poll racing an older-page request; all statuses and shared/private labels.
8. **Accessibility devices:** Android TalkBack + Switch Access + external keyboard; iOS VoiceOver + external keyboard. Check names, roles, selected/checked/busy states, focus order, route-change focus, alert/live-region frequency, and non-gesture alternatives.
9. **Layout matrix:** 320, 360, and 390pt portrait; small-phone landscape; tablet width; AR and EN; OS font 100/135/160/200%; display zoom where available. No essential ellipses, overlap, hidden CTA, horizontal page scroll, or keyboard-obscured field.
10. **Motion and system areas:** reduced motion before app launch and changed while running; gesture-navigation/home-indicator insets; dynamic errors/loading/list insertion. Verify ErrorText is still and content does not jump under fixed UI.
11. **Touch measurements:** verify 44pt product minimum (and decide explicitly whether Android launch target is 48dp) for language, skip, dots, all legal/help links, Later, service tiles, recent rows, promos, retry, empty CTA, and pagination. Check adjacent hit rectangles do not overlap.
12. **Screenshot refresh:** regenerate the normal and missing state pairs only after fixes, then have an image-capable reviewer inspect both languages at baseline. Static images must be supplemented with motion/focus/device evidence.

## 8. Positive source provisions (not runtime certification)

- Welcome pagination dots have explicit radio names/checked values and 44×44 styles (`src/app/welcome.tsx:53-57,127`).
- Auth uses visible field labels, appropriate email/phone/OTP keyboards, autocomplete, password paste-compatible controlled inputs, duplicate-submit guards, and visible busy buttons (`src/app/auth.tsx:79-130,178-188,208-247`).
- Signup does not mistake a failed registration-policy request for closed registration (`src/app/auth.tsx:51-64,199-206`).
- Phone recovery does not advertise an unknown/unavailable capability as ready (`src/app/auth.tsx:31-38,66-70,252-257`; `src/phone/flow.ts:31-38`).
- Home retains old data on update failure and keeps service booking available during initial order loading (`src/app/(customer)/index.tsx:17-23,55-65`).
- Order rows include textual status and direction-aware route labels; cancelled status is not conveyed by color alone (`src/parts.tsx:160-193`).
- Orders has explicit initial error/retry and empty content, and older-history loading/error is separately represented (`src/app/(customer)/orders.tsx:10-13`; `src/parts.tsx:150-157`).
- Shared `Screen` supplies safe areas, keyboard avoidance, and pull-to-refresh structure (`src/ui.tsx:118-136`).
- Shared errors use `accessibilityRole="alert"`; fields have accessible labels and focused styling (`src/ui.tsx:338-383`).
- Welcome/auth primary entrances and shared `Appear` respect reduced motion; the specific ErrorText exception is X-D2 (`src/app/welcome.tsx:18,40,45`; `src/app/auth.tsx:24,167-172`; `src/ui.tsx:205-209,379-383`).

These provisions are not declarations of WCAG/platform compliance, screenshot fidelity, or defect-free behavior.

## 9. Audit closure — summary, report path, model, and exact reading

### Concise summary

This narrowed packet inventories every control and source-visible branch in the four requested route files. It records **17 confirmed or source-explicit findings**, **6 hypotheses**, **0 established BLOCKING**, and **0 established HIGH** issues. The strongest fixes are service-intent labeling/navigation, 44pt targets, pending-mode locking, field/focus error management, and non-gesture stale-data retry. Screenshot visual acceptance and runtime compliance remain unverified because the model could not decode any requested PNG. Loading/error/empty screenshot gaps are enumerated above rather than silently treated as covered.

**Report path:** `reports/ui-ux-pro-max-2026-11-07/launch-customer-audit.md`  
**Model name:** `kimi-k3.1-pro`

### Exactly what was read for this packet

**Scoped route files, in full:**

1. `src/app/welcome.tsx` — lines 1–134.
2. `src/app/auth.tsx` — lines 1–266.
3. `src/app/(customer)/index.tsx` — lines 1–123.
4. `src/app/(customer)/orders.tsx` — lines 1–15.

**Supporting source read to resolve invoked primitives/copy, without expanding route audit scope:**

5. `src/ui.tsx` — lines 1–583 (initial read 1–570, then 571–583).
6. `src/parts.tsx` — lines 100–199, 320–399, and 455–473; `HelpLinks` is therefore read at 358–370, while unrelated driver/account implementation in other ranges was not used for findings.
7. `src/phone/flow.ts` — lines 1–55.
8. `src/api.ts` — lines 1–105, to verify forced-retry/in-flight behavior for X-D3.
9. `src/copy.ts` — targeted Arabic+English entries returned by the recorded grep for onboarding, authentication/reset, home/orders, empty/error, promo, and pagination copy; **the full dictionary was not read in this narrowed packet**.

**Repository/docs read before the parent narrowed scope:**

10. `package.json` — full, lines 1–93.
11. `docs/PRODUCT.md` — full, lines 1–111.
12. `docs/screens/README.md` — full, lines 1–71.
13. `src/app/_layout.tsx` — full, lines 1–108.
14. `src/intro.tsx` — full, lines 1–64.
15. `src/app/help.tsx` — full, lines 1–71.

**PNG access attempted but no pixels/content returned:**

16. `docs/screens/ar/welcome-1.png` and `docs/screens/en/welcome-1.png`.
17. `docs/screens/ar/welcome-2.png` and `docs/screens/en/welcome-2.png`.
18. `docs/screens/ar/welcome-3.png` and `docs/screens/en/welcome-3.png`.
19. `docs/screens/ar/sign-in.png` and `docs/screens/en/sign-in.png`.
20. `docs/screens/ar/home.png` and `docs/screens/en/home.png`.
21. `docs/screens/ar/orders.png` and `docs/screens/en/orders.png`.

**Skills/guidance loaded:** `ui-ux-pro-max` and `frontend-ui-engineering`; a targeted React Native accessibility/touch/safe-area guidance query was also run. No emulator, physical phone, browser runtime, screenshot regeneration, lint, typecheck, or heavy test was used.
