# Complete booking experience — read-only source audit

**Date:** 2026-11-07  
**Baseline:** `f8d58c14d43cc31475411899ebfa29c23b04f79c` (verified with `git rev-parse HEAD`)  
**Model:** `kimi-k3.1-pro`  
**Result:** **15 source-confirmed findings: 2 High, 11 Medium, 2 Low.**  
**Deliverable:** `reports/ui-ux-pro-max-2026-11-07/booking-audit.md`

## Scope, method, and evidence limits

Read in full: `src/app/book.tsx`, `src/pin-sheet.tsx`, `src/place-search-panel.tsx`, `src/place-search.ts`, `src/freight-details.tsx`, `src/freight-scope.ts`, and `src/booking.ts`. Relevant support was traced through `src/parts.tsx`, `src/ui.tsx`, `src/api.ts`, `src/model.ts`, `src/copy.ts`, `src/route-preview.tsx`, `src/map-provider-boundary.tsx`, `src/route-map.tsx`, `src/route-map.native.tsx`, `src/route-map.android.tsx`, `src/google-map.web.tsx`, `src/google-map.native.tsx`, `public/map.html`, and `server/domain/booking-receipts.ts`. The reorder/recipient/schedule contracts and focused existing tests were read where they establish intended behavior.

The audit covers parcel, ride, and freight; service availability; pickup/destination city, saved/recent/manual search, GPS and map pin; swap; vehicle size/passenger count; now/later/day/time slots; promotion/credit; sender contact and recipient; quote loading/error/range/expiry; order again/send another; validation; submitting/offline recovery/success/failure; local controls; and accessibility, RTL, dynamic type, keyboard, safe area, and reduced motion.

- **No visual claims:** `read_image` was not called. Pixels, hierarchy, clipping, contrast, and rendered Arabic/English layout are for the external image-capable reviewer.
- No emulator, phone, browser runtime, heavy test, lint, typecheck, screenshot regeneration, product edit, or commit was used. Existing dirty files were not changed.
- Severity: **High** severely compromises a core booking/financial/recovery path; **Medium** has material wrong-state, accessibility, or recovery impact with a workaround; **Low** is localized misleading copy or motion/consistency debt.
- “Confirmed” means the defective branch or missing implementation is established by source. Device checks below verify actual assistive-technology and platform behavior; they are not claimed as already executed.

## Deduplication against earlier audits

The concurrent shared-design-system report's DS-01–DS-08 findings are incorporated by reference, not recounted: shared target sizes, `Txt` scaling/truncation, input contrast, inconsistent pressed states, shared reduced-motion gaps, refresh/async semantics, and badge RTL. B13 below is limited to booking-owned controls. The launch audit's home-entry findings and driver/admin findings are outside this report. Historical copy proposals P4/P5 and map lifecycle repairs were checked against current source and are not repeated. The historical “no pending discard” concern is not presented as new; B03 specifically assesses the **new Edit/Discard UI and its unreachable release state**. The old GPS-note-wiping finding is also not repeated: current code preserves notes.

## Findings summary

| ID | Severity | Finding |
|---|---|---|
| B01 | **High** | Phone-keyboard Go bypasses the live-quote loading/failure gate and can submit a fallback-priced order. |
| B02 | **Medium** | Send another copies the previous buyer's destination note and item despite its pickup-only contract and exact test. |
| B03 | **High** | Pending-booking Edit/Discard can never unlock: no code path produces `absent`. |
| B04 | **Medium** | Service-configuration loading/failure is presented as “service unavailable,” with no retry. |
| B05 | **Medium** | Request remains submittable during promotion validation, so the intended/new discount can be omitted. |
| B06 | **Medium** | Rejecting a stale default schedule resets to the same stale slot until the next half-hour bucket. |
| B07 | **Medium** | Initial pending-storage failure/corruption leaves booking permanently loading with no retry or recovery. |
| B08 | **Medium** | Reorder/send-another fetch failure silently becomes an empty default form. |
| B09 | **Medium** | Place-search query and unconfirmed proposal survive closing and reopening the sheet for another stop. |
| B10 | **Medium** | Freight validation disables the whole form without identifying the invalid field or constraint. |
| B11 | **Medium** | Web pin maps lack an accessible name, and precise pin placement has no app-owned non-drag alternative. |
| B12 | **Medium** | City/place modal always slides, ignoring reduced-motion preference. |
| B13 | **Medium** | Several booking-owned actions are below the project's 48dp target; Add code/Save place have no target minimum. |
| B14 | **Low** | GPS accuracy and rejected-pin copy remains attached to a subsequently changed/swapped route. |
| B15 | **Low** | Web and Android route accessibility labels hardcode a left-to-right arrow in Arabic. |

## Detailed findings

### B01 — High — Keyboard submission bypasses live-quote gating

**Evidence:** `src/app/book.tsx:326-344` validates readiness, availability, route, freight, schedule, and fields, but never checks `quoting` or `quoteFailed`. The visible Request button is disabled for both at `src/app/book.tsx:412-414`. The contact field invokes `submit` directly from keyboard Go at `src/app/book.tsx:600-605`. During a missing/failed quote, `price` falls back to local `quote(...)` at `src/app/book.tsx:139-146`, and that value enters the new command at `src/app/book.tsx:349-370`.

**Scenario:** Choose a valid ride route, hold or fail `/price`, then press Go on the contact keyboard. The UI says calculating/failed and Request is disabled, but the keyboard path can still create the order without the required live quote.

**Smallest fix:** Define one submission predicate used by both the button and `submit`; when no pending command exists, reject while quoting, quote failed, locating, or otherwise incomplete. Keep server re-pricing, but do not allow this client path to substitute the local fallback for a gate the UI explicitly enforces.

**Required regression/device test:** With delayed and failed `/price`, activate contact-field Go using the Android physical keyboard/on-screen keyboard and web Enter; assert zero POSTs and no stored command. Resolve a valid quote and assert one POST with the expected `quoteId`/smart pricing. Repeat for parcel, ride, and freight.

### B02 — Medium — Send another carries old destination and item data

**Evidence:** `src/booking.ts:69-75` returns `dropoffNote: order.dropoffNote` and `detail: order.detail`. `SPEC-send-another.md:14-17` requires only service, option, pickup city/pin/note to carry over; drop-off and item stay default. The exact expectation in `tests/presentation.test.mjs:114-116` contains only those five pickup/option keys, so current source and the existing assertion disagree. `src/app/book.tsx:263-283` applies these values to the new form.

**Scenario:** A shop sends a refrigerator to “Buyer office, Nablus,” then chooses Send another. The next parcel form retains “Buyer office, Nablus” and “refrigerator” even though it is for a new buyer and defaults the destination to the opposite of pickup. Choosing the new destination with a map pin does not itself clear the old note.

**Smallest fix:** Make `pickupForm` a pickup-only partial and default every other field at the call site; at minimum, `dropoffNote` and `detail` must start empty. Keep recipient name/phone and sender contact blank as intended. Align the existing exact unit assertion and implementation.

**Required regression/device test:** Use an old order with distinct pickup note, destination note, item, contact, recipient, and pin. Assert only pickup service/option/city/pin/note survive; new destination selection cannot resurrect the old note; Order again still copies route/item/recipient. Exercise the existing presentation test plus one browser journey in Arabic and English.

### B03 — High — Pending Edit/Discard release state is unreachable

**Evidence:** `src/app/book.tsx:419-424` displays Edit/Discard but enables them only when `pendingReleasable(outcome)` is true. `src/booking.ts:77-84` can return only `present` or `unknown`; `pendingReleasable` at `src/booking.ts:86` requires `absent`. The receipt API returns `{orderId: number|null}` at `server/domain/booking-receipts.ts:14-20`, and `pendingOutcome` deliberately maps null to `unknown`. Existing tests at `tests/booking-auth.test.mjs:49-58` explicitly require null/malformed receipts never to release. Thus the new controls are permanently disabled in every defined state.

**Scenario:** A response is lost and the command remains pending. Online recovery finds no receipt, but the UI stays “not confirmed yet”; the customer cannot edit or discard and can only retry the potentially unwanted booking. Signing out does not provide a recovery path.

**Smallest fix:** Do **not** map a null receipt to absent. Add a server-authoritative abandon/cancel-command protocol that fences a delayed original POST before returning an explicit releasable state, then map that state to `absent`. Until such a state exists, do not present Edit/Discard as available recovery actions.

**Required regression/device test:** Race delayed order creation against abandonment in both orders: creation-first must open the existing order; abandonment-first must make the late POST fail and then unlock Edit/Discard. Cover null receipt, malformed receipt, offline check, storage-delete failure, restart, account switching, and physical offline/reconnect. Preserve request ID on legitimate retries.

### B04 — Medium — Service loading/error is indistinguishable from disabled service

**Evidence:** `src/app/book.tsx:68-70` treats an absent services response as an empty enabled list. Although `useApi` exposes `error` and `reload` (`src/api.ts:99-105`), booking ignores both. `src/app/book.tsx:107-112` locks on `!available`, and `src/app/book.tsx:435-439` renders the unavailable card whenever the list has not loaded or has failed.

**Scenario:** Open booking offline or while `/services` is slow. Before any answer, the selected service is described as currently unavailable. On a network failure it remains unavailable with Help but no Retry, instead of explaining that availability could not be loaded.

**Smallest fix:** Use explicit `servicesLoading`, `servicesError`, and loaded states. Show loading while the first request is pending; show the actual error plus `servicesList.reload` on failure; show disabled-service UI only after a successful response excludes the service.

**Required regression/device test:** Delay, fail, then succeed at `/services`; verify no false unavailable state and working retry. Cover deep links to enabled/disabled parcel, ride, and freight, all-services-disabled, and switching from a disabled deep link to an enabled service.

### B05 — Medium — Promotion validation races an enabled Request action

**Evidence:** `applyPromo` sets `checking` only around the request at `src/app/book.tsx:305-313`. The main lock at `src/app/book.tsx:107-112` and Request disabled predicate at `src/app/book.tsx:412-414` omit `checking`. Submission uses the currently `applied` promo at `src/app/book.tsx:349-365`, not the code being checked. The promo input/Apply controls are at `src/app/book.tsx:589-601`.

**Scenario:** Tap Apply on a slow promotion or credit, then immediately tap Request (or keyboard Go). The order can be created at full price before validation finishes. If promo A was already applied and the customer is checking replacement B, submission can still send A while the field shows B.

**Smallest fix:** Include `checking` in the shared submission guard and expose a checking reason; alternatively await the active check and submit its accepted result, but never submit with ambiguous promo state.

**Required regression/device test:** Hold `/promos/check`, attempt both Request and keyboard Go, and assert no order POST. Resolve success/failure and verify the exact code/discount sent. Cover replacing an applied code, expired credit, route changes during check, and promo-change responses.

### B06 — Medium — Stale schedule reset reselects the same invalid slot

**Evidence:** Slots derive from `slotBucket` at `src/app/book.tsx:95-108`, and `chosen` falls back to `slots[0]` when `slot` is null at `src/app/book.tsx:116-121`. On a too-soon submission, `src/app/book.tsx:336-338` calls only `setSlot(null)` and does not refresh `slotBucket`; it therefore selects the same first slot again.

**Scenario:** Initialize booking and choose Later at 10:30:00 Palestine time: the first slot is 11:30. At 10:30:01 it is less than 60 minutes away. Submit rejects it and resets to the same 11:30 default. Repeated retries fail until the next half-hour bucket or a manual alternative selection.

**Smallest fix:** On stale-slot rejection, regenerate slots from current time and choose the first currently valid slot (or leave no selection and require an explicit new choice). Reuse the same freshness helper for display and submission.

**Required regression/device test:** With fake time, mount at 10:30:00, submit at 10:30:01, and assert the next retry does not reuse 11:30. Cover selected vs default slots, day switching, 06:00/22:00 boundaries, Palestine DST transitions, pending stale scheduled commands, and server acceptance.

### B07 — Medium — Initial storage failure has no recovery action

**Evidence:** `ready` starts false at `src/app/book.tsx:55`. The initial `storage.get`/reorder effect catches every failure with only `setError(c.bookingStorageError)` at `src/app/book.tsx:252-284`; the catch does not set ready or offer retry. `locked` includes `!ready` at `src/app/book.tsx:107-112`, leaving the footer at loading indefinitely. Only Help is offered alongside the error at `src/app/book.tsx:412-416`.

**Scenario:** Storage access rejects once, or a stored pending value is malformed and `readBooking` throws. Booking remains locked behind “Loading your request…” with “Try again,” but there is no Try again/reset action; navigation/remount is the only workaround.

**Smallest fix:** Add an explicit retry that reruns initialization. For malformed data, offer a clearly confirmed quarantine/reset path without silently discarding a valid uncertain command. Do not simply mark ready and bypass durable pending protection.

**Required regression/device test:** Make the first storage read reject and the next succeed; verify retry restores the exact pending command. Test malformed JSON, invalid payloads, unavailable storage, account-scoped records, and successful fresh initialization.

### B08 — Medium — Reorder fetch failure silently opens an unrelated default booking

**Evidence:** `src/app/book.tsx:254-284` maps every `/orders/:id` rejection to `old=null`, then marks ready. Missing/foreign orders intentionally use an empty form, but transient network/server failures follow the same path. No error or retry is set, and `src/app/book.tsx:652-655` shows provenance only when `old` exists.

**Scenario:** Tap Order again or Send another while offline. The route eventually opens an ordinary default booking without explaining that the requested order could not be copied, inviting the customer to believe the refill succeeded or to re-enter everything unnecessarily.

**Smallest fix:** Preserve the intentional empty form only for expected not-found/foreign-order responses. On transient failure, retain the reorder intent and show an inline error with Retry; do not silently discard `again`/`keep`.

**Required regression/device test:** Cover offline, timeout, 500, 401/403, 404, malformed response, retry success, and account isolation for both modes. Assert no caption falsely claims a copy and that successful retry copies exactly the intended fields.

### B09 — Medium — Place-search state leaks across stop-picker sessions

**Evidence:** `PlaceSearch` owns `query` and `choice` at `src/place-search-panel.tsx:30-36`. `CityPicker` remains mounted and only changes Modal `visible` at `src/app/book.tsx:679-708`. `onShow` resets the parent's `term`, not the child's query/choice (`src/app/book.tsx:681-685`), and the child has no open/stop key at `src/app/book.tsx:704`.

**Scenario:** Open Pickup, type a query and select a proposal, then close without applying. Open Drop-off. The old query/results/proposal can remain while the parent also shows saved places. Applying that stale proposal now changes Drop-off, a different stop from the one for which it was proposed.

**Smallest fix:** Unmount the picker content when closed, or key/reset `PlaceSearch` by stop and open session, clearing both query and choice on every open/close.

**Required regression/device test:** Close via backdrop, Android back, Cancel proposal, and successful apply; reopen on the same and opposite stop. Assert empty query/no stale proposal each time, correct stop ownership, and no simultaneous saved-list/old-result state. Repeat with keyboard open and account/service changes.

### B10 — Medium — Freight errors are aggregate and non-actionable

**Evidence:** `src/freight-details.tsx:10-16` renders seven fields without any `error` prop. `src/freight-scope.ts:18-35` collapses all numeric/range failures to one null scope. `src/app/book.tsx:124-134` converts that to one `scopeInvalid`, and the footer at `src/app/book.tsx:412-414` supplies only the generic “Enter valid piece count, dimensions…” reason.

**Scenario:** Enter 201 pieces, zero weight, 21 crew seats, a malformed decimal, or an excessive declared value. Every field remains visually unmarked and the same aggregate message appears; the customer must guess which value and bound failed.

**Smallest fix:** Return per-key validation from the freight parser and pass localized messages to each `Field`; retain aggregate scope validation for cross-field constraints. State accepted integer/decimal limits near the relevant field.

**Required regression/device test:** Test every field independently at empty, zero, negative, malformed, maximum, and maximum+1 values; Arabic digits/decimal separator; cross-field volume overflow; equipment/loading window preservation; keyboard and screen-reader association of each error.

### B11 — Medium — Pin placement lacks an accessible, non-drag implementation

**Evidence:** `src/pin-sheet.tsx:72-89` exposes the draggable map, optional Locate, Confirm, and Cancel. Drop-off has no Locate because `src/app/book.tsx:484-495` supplies `onLocate` only for pickup. `PinMapProps` has no accessible-label property (`src/route-preview.tsx:24`). Web MapLibre and Google pin containers at `src/route-map.tsx:342-370` and `src/google-map.web.tsx:222-290` provide no accessible map name or app-owned pan controls; Android pin gestures are drag/zoom events at `public/map.html:191-198`. Native Apple supplies a label, but the scoped implementations provide no directional button alternative for precise placement.

**Scenario:** A keyboard, switch-control, or screen-reader user who cannot perform a precise drag can choose a city and landmark, but cannot independently adjust an exact drop-off pin. On web the pin map itself has no app-supplied accessible name/instructions.

**Smallest fix:** Add a named map region and accessible 48dp directional pan/zoom controls (with keyboard bindings and current-position announcement), or an equivalent non-drag coordinate/place adjustment control. Keep drag as an option, not the only precise method.

**Required regression/device test:** Complete pickup and drop-off pin selection keyboard-only on web and with TalkBack + Switch Access on the physical Android device; VoiceOver on physical iOS when available. Verify accessible names, focus order, zoom/pan state, GPS/manual alternatives, and confirmation of the announced point. No emulator.

### B12 — Medium — City/place sheet ignores reduced motion

**Evidence:** `src/app/book.tsx:679` always uses `animationType="slide"`. There is no reduced-motion hook in this screen. The sibling pin sheet correctly chooses `none` when reduced motion is requested at `src/pin-sheet.tsx:18,64`.

**Scenario:** A user with Reduce Motion enabled opens either city/place sheet and still receives a full slide transition, unlike the pin sheet.

**Smallest fix:** Use `useReducedMotion()` in `CityPicker`/booking and select `animationType={still ? 'none' : 'slide'}`. Preserve focus and content state in the no-animation branch.

**Required regression/device test:** Toggle reduced motion before opening and while closing pickup/dropoff sheets on physical Android and iOS where available; verify no slide, correct focus/backdrop/back behavior, and unchanged search/pin functionality. Also check web `prefers-reduced-motion`.

### B13 — Medium — Booking-owned touch targets are below the adopted 48dp target

**Evidence:** Service choices use `minHeight:44` (`src/app/book.tsx:442-447,712`), GPS and map chips use `minHeight:44` (`src/app/book.tsx:468-490,716`). Add promotion code is a text-only `Press` with no minimum/hitSlop at `src/app/book.tsx:595-597`; Save place is similarly unconstrained at `src/app/book.tsx:660-662`. These are local controls, not the shared Button/IconButton findings already counted in DS-01.

**Scenario:** Dense booking actions, especially Add code and Save place, provide smaller pointer targets than the project's mobile target policy, increasing missed taps; the exact physical result needs device measurement.

**Smallest fix:** Give booking-owned actions a minimum 48×48dp target and adequate separation; use measured hitSlop only where it does not create overlapping targets. Do not inflate visual layout unnecessarily.

**Required regression/device test:** Measure source geometry plus physical hit-testing on the connected A53 at default/largest text in Arabic and English. Cover all service/GPS/map/promo/save controls, nearby Swap/delete actions, and web pointer targets; verify no adjacent-target overlap.

### B14 — Low — Location feedback becomes stale after route changes

**Evidence:** GPS writes accuracy text at `src/app/book.tsx:173-175`; rejected pins write `pinOutsideArea` at `src/app/book.tsx:630-631`. Swap at `src/app/book.tsx:460-464` changes both points/cities without clearing that feedback. Manual city/place confirmation at `src/app/book.tsx:632-647` also leaves it unchanged. The old message continues rendering at `src/app/book.tsx:638-639`.

**Scenario:** Locate pickup in Ramallah, then swap: the success copy still says “Pickup set in Ramallah” although Ramallah is now the destination. Similarly, after an outside-area pin error, choosing a valid manual city can leave the rejected-pin error attached to the new route.

**Smallest fix:** Clear or recompute location status whenever pickup city/point changes through swap, saved/recent place, search confirmation, or pin selection. Distinguish informational accuracy from errors semantically.

**Required regression/device test:** Sequence GPS→swap, GPS→manual city, outside pin→valid search, and service change. Assert copy always names the current pickup/current error and that Arabic/English screen readers receive the corrected status.

### B15 — Low — Arabic route accessibility labels use the wrong directional arrow

**Evidence:** Web MapLibre and Google route labels hardcode `pickupTitle → dropoffTitle` at `src/route-map.tsx:180-185,318` and `src/route-map.android.tsx:114-125` is also hardcoded. The native route implementation correctly chooses by `rtl` at `src/route-map.native.tsx:113-122`; `RoutePreview` does the same at `src/route-preview.tsx:33-37`.

**Scenario:** Arabic web/Android screen-reader output announces a rightward route arrow while the localized route representation and native implementation use the RTL direction.

**Smallest fix:** Build the accessible route description from `rtl`/language on every renderer, preferably with localized words rather than relying on arrow pronunciation.

**Required regression/device test:** With Arabic TalkBack on physical Android and Arabic web screen reader, verify pickup-to-destination order and direction for swapped routes and map fallback; compare English LTR output.

## State/use-case acceptance matrix

“Source result” is not runtime acceptance. Every row still requires the listed focused regression/device evidence before release.

| State / use case | Source result | Required acceptance and regression coverage |
|---|---|---|
| Parcel, enabled | City/landmarks, size, recipient, promo, quote, and submit exist. B01/B04/B05/B13 affect the path. | Complete now/later, small/medium/large, recipient blank/valid/invalid, success/offline/terminal failure in AR/EN. |
| Ride, enabled | Passenger 1–4 choices and ride-specific pickup/dropoff copy exist; recipient fields are correctly omitted. | Complete each seat option, verify no recipient payload, ride copy/accessibility, quote range, and keyboard Go gating. |
| Freight, enabled | Size, loading help/window, seven scope fields, and equipment checkboxes exist; B10 blocks clear correction. | Valid minimum/maximum loads, every invalid field, equipment combinations, declared value, scope-capability off/on, and payload equality. |
| Deep-linked disabled service | After a successful services response, unavailable card/help and enabled alternatives exist. B04 mislabels loading/error. | Enabled→disabled activation change, all disabled, pending command for now-disabled service, switch to enabled service. |
| Pickup/destination city | Saved/recent places and city selection set city/note and conditionally preserve same-city pins. | Same/different city, unchosen stop, long saved names, forget/save failure, and correct stop ownership. |
| Local search/manual choice | Explicit proposal/apply, same-city pin preservation, and cross-city pin clearing are implemented; B09 leaks sessions. | Empty/query/no-match, Arabic folded variants, saved+city results, keep/clear-pin copy, cancel/reopen, offline local corpus. |
| Pickup GPS | Permission purpose, locating state, accuracy, errors, Settings recovery, abort, and manual fallback exist; B14 leaves stale copy. | Prompt/deny/block/services off/timeout/inaccurate/success; close during fix; reopen; GPS→swap/manual; no-location-permission journey. |
| Map pin | Loading/positioning/ready/fail/retry, outside-area rejection, and cancel exist; B11 lacks non-drag access. | Every renderer/provider, drag/zoom, keyboard/switch alternative, outside/inside boundary, GPS camera timeout, map failure/retry, and reduced motion. |
| Swap | Cities, points, and notes swap and clear validation; B14 leaves location feedback stale. | Empty/one/two pins, same/different cities, GPS-origin point, recipient/option unchanged, quote refresh, Arabic accessible route direction. |
| Vehicle size / passengers | Service change selects the first valid option and freight-only loading controls stay scoped. | Every option, service switching during quote/promo, reorder with obsolete option, pending freeze, and selected/disabled accessibility states. |
| Now / later / slots | Palestine-time 30-minute slots, day/time radios, and client/server freshness exist; B06 resets stale default incorrectly. | First/last slot, day switching, exact +60-minute boundary, DST, stale pending time, manual valid recovery, no silent Now fallback. |
| Promotion / credit | Manual code, credit chips, applied/recheck/error states, and server recheck exist; B05 permits ambiguous submit. | Checking success/failure, replacement code, expired credit, route/price change, promo changed, keyboard Apply, no double submission. |
| Sender contact / recipient | Sender contact defaults appropriately; recipient is parcel/freight-only; inline errors and payload normalization exist. | Blank/valid/invalid Arabic and international phone forms, 60-character name, optional recipient blank, ride exclusion, first-invalid focus and announcement. |
| Quote loading / failure | Matching-key quotes, disabled visible Request, and retry reason exist; B01 bypasses via keyboard. | Slow success, offline/500 failure then retry, input change during flight, stale response suppression, no POST until valid. |
| Quote range / slow / expiry | Smart range and slow “or more” rendering exist; expired ETA is omitted at `src/app/book.tsx:160-170`. | Min/max range, null minute, `lo===hi`, slow/unbounded, expired/fresh ETA, fixed-price route, and screen-reader update. |
| Order again | Route/item/recipient copy, fresh fare, new time/promo/request ID are intended; B08 hides fetch failure. | Completed/returned/cancelled source orders, obsolete option, freight scope behavior, offline/404/retry, no old quote/promo/time/ID. |
| Send another | Pickup reuse and blank recipient are intended; B02 copies prohibited destination/item and B08 hides fetch failure. | Exact pickup-only assertion, different buyer/destination/item, blank contact/recipient, offline/retry, and no previous-buyer residue. |
| Submitting / double tap | `sending` ref, busy UI, durable request ID, and pending freeze are present. | Rapid double tap/keyboard+tap, delayed server response, app background/restart, one order/one request ID, no editable fields while pending. |
| Offline / uncertain recovery | Command saves before POST and exact receipt lookup recovers existing orders; B03 makes Edit/Discard unreachable and B07 blocks storage-error recovery. | Offline before/after commit, null/present receipt, safe abandon race, restart/account isolation, retry success, terminal 4xx, storage failure. |
| Success / terminal failure | Success releases storage and opens the order; terminal 4xx releases pending; price/promo changes request a fresh confirmation. | Storage-delete failure after success, duplicate retry, invalid schedule/scope/phone, unauthorized/forbidden, price/promo change, no false success. |
| Buttons/options/touch | Shared roles/states are generally present; B13 covers local targets and DS-01/DS-05 remain applicable. | Physical 48dp hit-testing, pressed/disabled/checked/loading states, every icon accessible name, adjacent-target separation. |
| Dynamic type / reflow | Shared DS-02 applies; local one-line service labels at `src/app/book.tsx:443-446` require focused coverage, not a duplicate finding. | Largest supported text, 320px/narrow and landscape, long Arabic/English names, no loss of service/price/slot/recipient actions. |
| Keyboard / safe area | Booking and sheets have keyboard avoidance and bottom safe-area wrappers; B01 is a keyboard action-contract defect. | On-screen and hardware keyboard, footer above keyboard, focused fields visible, modal scroll at largest text, notch/home-indicator insets, Android back. |
| Reduced motion | Pin sheet and map cameras have explicit still branches; B12 misses the city sheet and DS-06 remains shared debt. | Reduce Motion for all sheets, quote/error entrances, map movement, press feedback, and functional equivalence with motion disabled. |
| RTL / localization | Row/chevron helpers and localized copy are broadly present; B15 is renderer-specific and DS-08 remains shared. | Arabic/English every state, bidi phone/order codes/prices, swapped routes, map labels, screen-reader direction, long copy. |

## Screenshot inventory and missing states

Only these booking pairs exist under `docs/screens/en/` and `docs/screens/ar/`: `book-parcel.png`, `book-ride.png`, `book-freight.png`, `book-calculating.png`, `book-again.png`, and `book-send-another.png`. Their names/files were enumerated; **none was visually inspected**. The catalogue was generated at 390×844 @2x according to `docs/screens/README.md:1-6`, which is not current-state or accessibility acceptance.

The following states have no named booking capture in that inventory and should be captured in **both Arabic and English** after the relevant fixes, with scripted deterministic data rather than manual mockups:

1. **Service configuration:** first-load waiting, load failure/retry, currently selected disabled service with enabled alternatives, all services disabled.
2. **Place picker:** saved/recent list, active query with results, no match, proposal preserving pin, proposal clearing pin, reopened-after-cancel regression, Save place editor and save failure, keyboard open.
3. **Pin sheet:** pickup auto-locating, manual ready, locating/positioning disabled Confirm, permission denied/blocked/services off/inaccurate/Settings failure, map loading/failure/retry, outside-area rejection, drop-off without GPS, non-drag controls.
4. **Route:** both pins selected, GPS-selected pickup, swapped route, outside/error cleared after valid manual selection, map provider fallback.
5. **Options:** every parcel/freight size and ride passenger count; freight loading help plus valid scope, each invalid field, both equipment options, long/large values.
6. **Scheduling:** Later first slot, another day/time, boundary/stale-slot error and corrected slot, slow/expired quote variants.
7. **Promotion:** open unchecked, checking, applied code, applied credit, replacement checking, invalid/error, recheck after price change, expired credit.
8. **Contacts/validation:** blank and invalid sender contact, invalid recipient phone, long recipient name, multiple errors, keyboard open with focused field/error.
9. **Quotes:** fixed success, smart range, slow/unbounded ETA, expired ETA, failure with retry, price-changed confirmation; retain the existing calculating capture as regression coverage.
10. **Reorder modes:** loading and transient failure/retry for Order again and Send another; successful Send another proving old destination/item are blank; existing success pairs should be regenerated after fixes.
11. **Submission/recovery:** busy submit, offline saved, recovery checking, receipt found, unresolved unknown, safely releasable absent state, Edit/Discard busy/failure, terminal failure, storage initialization failure/retry.
12. **Accessibility/layout:** largest supported dynamic type, 320px/narrow viewport, landscape, keyboard focus, screen-reader focus order, reduced motion, safe-area insets, and RTL map/swap states. These need device/runtime evidence in addition to stills.

## Recommended fix order

1. **B01, B03:** close submission/recovery integrity failures first; B03 requires a safe server fence, not a client shortcut.
2. **B02, B04–B09:** correct carried data, service tri-state, promo/schedule races, storage/reorder recovery, and picker session ownership.
3. **B10–B13:** make freight correction and pin operation independently usable, honor reduced motion, and complete local target geometry.
4. **B14–B15:** clear stale location copy and align RTL accessible route descriptions.
5. Regenerate the deterministic booking captures and execute the matrix on the connected physical Android device; use physical iOS when available. Do not claim visual or assistive-technology acceptance from source alone.
