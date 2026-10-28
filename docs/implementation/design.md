# Wind implementation: visual and UI design packet

Status: design only. No `src/` files were changed. Implementation waits for the backend contract confirmation in §9.
Author: design sub-agent, Claude Haiku 5.5. No other model designed any part of this packet.
Scope: the user-visible additions named in the work plan: driver presence controls, quote expiry, offer lease, boarding proof, disabled payment states, and operator support. Also the Arabic/English/RTL mobile layout and accessibility rules those additions must follow.

## 1. Evidence used

Screens inspected as images (Arabic and English captures, 390×844 @2x, seeded browser session, 21 Oct 2026, not native-device captures):
- `docs/screens/ar/home.png`, `ar/book-ride.png`, `ar/order-live.png`, `ar/driver-jobs.png`, `ar/driver-run-sheet.png`, `ar/driver-order.png`, `ar/order-parcel-live.png`, `ar/driver-trips.png`
- `docs/screens/en/order-searching.png`, `en/admin-dashboard.png`, `en/admin-order.png`, `en/admin-orders.png`

Source read for tokens and copy:
- `src/ui.tsx` lines 1–80: `palette`, `shadow`, `size`, `useCopy` (the `rtl`, `row`, `align` helpers), `haptic`.
- `src/copy.ts`: existing keys for handover/return codes, offers (`acceptOffer`, `noOffers`, `yourOffer`), cash (`cashOwed`, `cash`, `youPayCash`), safety, support, and errors (`err_price_changed`, `err_offer_expired`, `err_proof_locked`, `err_wrong_code`, `err_service_unavailable`).
- `docs/HANDOFF-2026-09-29-uber-careem-redesign.md` and `docs/HANDOFF-2026-09-28-brand-and-screens.md`: the design rules already adopted.

Reports read in full: `reports/Fastship Claude implementation plan.md` (work packets 01–17, launch gate register, binding decisions), `reports/Fastship Uber behavior and Azure.md` (main findings and policy register). From `reports/Fastship algorithm specifications.md` I read the defaults table and D01–D30. The rule for these is: the report prescribes behavior; it prescribes no layout, colour or component.

Expo: `AGENTS.md` requires official docs for any Expo/RN work. I read `https://docs.expo.dev/llms.txt` and `https://docs.expo.dev/versions/v57.0.0/`. The v57 page confirms React Native 0.86, React 19.2.3, Expo Router, Node 22.13+ minimum. It does not cover RTL, reduced motion or accessibility, so those rules come from the existing app code (`useReducedMotion`, the `useCopy().rtl` pattern) and React Native core props. Native behaviour must be checked on device before launch.

## 2. Identity to keep

Do not change the palette, logo, type scale or shadow. Every new piece uses these existing tokens:

| Role | Token | Hex | Use |
|---|---|---|---|
| Page ground | `palette.paper` | `#F3F2EC` | screen background |
| Surface | `palette.card` | `#FFFFFF` | cards, rows |
| Text | `palette.ink` | `#0E1F19` | titles, values (15.2:1 on paper) |
| Secondary text | `palette.secondary` | `#56635C` | body hints (5.6:1 on paper, 6.3:1 on white) |
| Caption | `palette.faint` | `#66716B` | captions on paper/white only (4.5:1 on paper) |
| Lead surface | `palette.forest` | `#12342A` | primary button, presence strip, boarding digits |
| Accent on forest | `palette.lime` | `#D3F27A` | dot/icon on forest only (10.8:1) |
| Live / ok | `palette.olive` / `olivePale` | `#34765A` / `#E2EEE5` | "ready", ride identity |
| Warning / handover | `palette.clay` / `clayInk` / `clayPale` | `#CB6845` / `#A94A28` / `#F9E9E1` | parcel handover, attention |
| Error | `palette.error` / `errorPale` | `#A3392A` / `#F8E6E2` | failures, blocked states |
| Info | `palette.blue` / `bluePale` | `#2F5E8C` / `#E6EDF6` | vehicle identity, searching |

Scale (from `size` and `ui.tsx`): body 14, item titles 15, page titles 21; controls 36 / 40 / 44 / 46; radius 16; gutter 16. Every tap target is at least 44pt, through padding or `hitSlop`.

Contrast rules verified with the WCAG formula on the palette values:
- `onFill` (white) on `clay` is 3.75:1. Do not put 14–15pt labels on a clay fill. Use `clayInk` (5.7:1 with white).
- `faint` on `olivePale` is 4.25:1. Do not use `faint` for text on olive-pale. Use `secondary` there.
- `clayInk` on `clayPale` is 4.8:1, `error` on `errorPale` is 5.5:1, `blue` on `bluePale` is 5.7:1, `forest` on `olivePale` is 11.4:1. These pass for body text.

Not allowed: a second accent colour, gradients, emoji as status, and any state carried by colour alone. Every state has text plus an icon.

## 3. Arabic, English and RTL rules

Arabic is the default. English is the same layout, mirrored. Keep the existing manual pattern (`useCopy()` returns `row`, `align`, `rtl`). Do not call `I18nManager.forceRTL` as part of this work. It needs a native reload and would flip layouts that are already right.

Rules for every new component:
1. Horizontal order follows `useCopy().row`. Lists start at the reading edge: the right in Arabic, the left in English. The existing `Rail` already does this.
2. Directional icons flip with the language: chevrons, back arrows, "next", send arrow. Non-directional marks never flip: the logo, the pin on a map, phone, share, checkmark, the code digits.
3. Identifiers and figures stay Western digits and LTR inside RTL text: order codes (`W-00002`), times (`06:54`), phone numbers, and money. Put each value in its own `Text` node so the bidi algorithm does not reorder a code inside an Arabic sentence. The money format keeps the existing `money()` helper (`₪ 71`).
4. Countdown text uses LTR digits: `01:45`, not `١:٤٥`.
5. Arabic needs more line height than English. Body line height is at least 1.45× in Arabic. Never clip a line in a fixed-height pill. Let the pill grow.
6. Test at font scale 1.3 and at 360×800 (a small Android phone). The check is that nothing is truncated without a way to read the full text.
7. Long Arabic route names wrap. Do not ellipsize the destination of an active trip. Ellipsize only lists.

## 4. Presence controls (driver)

The current driver screen has an online strip ("جاهز للطلبات" / "Ready for requests") and a location banner. This packet turns the strip into one control with five states.

| State | When | Look | Text (ar / en) |
|---|---|---|---|
| Offline | not online | card `palette.card`, grey icon | غير متصل / Offline. "لن تصلك طلبات جديدة." / "You won't get new requests." |
| Ready | online, heartbeat current, location fresh | forest strip, lime dot | جاهز للطلبات / Ready for requests |
| Location stale | online, last fix older than 30 s | `clayPale` card, `clayInk` text, pause icon | "موقعك غير محدّث. الطلبات متوقفة حتى يتحدّث." / "Location out of date. Requests paused until it updates." |
| Reconnecting | heartbeat lease lost (60 s without renewal) | `bluePale`, spinner | "انقطع الاتصال. نعيد الاتصال…" / "Connection lost. Reconnecting…" |
| Not eligible | approval, vehicle, or document blocks matching | `errorPale`, shield icon, no toggle | "حسابك أو مركبتك غير مؤهلة الآن. راجع ويند." / "Your account or vehicle isn't eligible now. Contact Wind." |

Other rules:
- The toggle is two `Choices` presses, not a switch. Labels: "اتصل بالطلبات" / "Go online" and "أوقف الطلبات" / "Go offline". Each has `accessibilityRole="radio"` and `accessibilityState={{ checked }}`. Changes are announced with `AccessibilityInfo.announceForAccessibility` after the server confirms, not optimistically.
- Going online first shows a consent sheet (see below). Refusing keeps the driver offline. The sheet appears once per consent version, not on every toggle.
- Location denied: the strip shows "فعّل الموقع 'أثناء استخدام التطبيق' لاستقبال الطلبات." / "Turn on location 'While using the app' to receive requests." with an "Open settings" action. It never shows Ready.
- The "Not eligible" state never shows the reason code. It shows the message and the support route.
- Heartbeat and lease times come from the server, not the phone clock. A "آخر تحديث قبل {n} ث" / "Updated {n}s ago" line may appear in a new diagnostics row on the driver account screen (proposed, not in the current app). Customers never see it.

Consent sheet (shown before the first online session per consent version):
- Title (ar): "نتابع موقعك وأنت متصل فقط" / (en): "We track your location only while you're online"
- Body (ar): "عند الاتصال نرسل موقعك الأخير لنعرف أي طلب قريب منك. عند إيقاف الاتصال يتوقف هذا فوراً." / (en): "While you're online we send your latest location so we can match nearby requests. Going offline stops this immediately."
- Buttons: "موافق وأتصل" / "Agree and go online" (primary, forest), "ليس الآن" / "Not now" (outline, 44pt).

Customers do not see the driver's live presence. They see only the order's assigned driver after assignment.

## 5. Quote expiry (booking)

Current issue seen in `ar/book-ride.png`: the sticky footer reads only "اطلب" followed by three dots, with no price while the quote loads. Specify this state.

Footer (sticky, all booking services):
- Line 1: CTA "اطلب · مشوار" / "Request · Ride" with the price as `trailing` (existing `Button` prop). While the quote is loading: a 14pt skeleton bar in `muted` with the label "نحسب السعر…" / "Calculating price…". Never show a placeholder price or dots alone.
- Line 2 (quote valid): "السعر مضمون {t}" / "Price held for {t}" in `secondary`, with a 4pt track under the footer. The track fills `olive`; in the last 20 seconds it turns `clayInk`. The countdown is text, `mm:ss`, updated once per second.
- At 0: the track is empty. The CTA is replaced by "حدّث السعر" / "Refresh price" (primary). Line 2 reads "انتهت مدة السعر. حدّث السعر قبل الطلب." / "This price expired. Refresh it before requesting." The old total stays visible struck through and labelled "السابق" / "Previous". Never auto-refresh silently and never submit an expired quote.
- If the server returns `err_price_changed`, show the existing copy ("تغيّر السعر. راجع المجموع الجديد واطلب مرة أخرى.") in an `errorPale` card above the footer with the new total.
- Wording: the price is "held", not "guaranteed". The quote has a 120-second lifetime; the design must not promise a fare beyond the quote.
- Reduced motion: no moving track. Keep the text countdown and a static bar that steps every 10 seconds.

Accessibility: the countdown is not announced every second. It is announced at 60, 20, and 0 seconds, through `AccessibilityInfo.announceForAccessibility`.

## 6. Offer lease (driver offers and customer dispatch)

There are two different objects. Keep them visually distinct.
- Automatic dispatch offer (rides): the server sends one offer to one driver at a time. Its lease is 15 seconds. Maximum 3 offers per search.
- Negotiated offer (freight, and parcel counter-offers): a price offer with its own expiry. Existing 10-minute life is unchanged.

Driver offer card (automatic dispatch):
- Top: a 4pt lease bar across the card (`olive`, shrinking). Last 5 seconds: `clayInk`. Text "العرض مفتوح {t}" / "Offer open for {t}" in 14pt, `secondary`.
- Body: pickup and drop-off (existing route spine), earnings first (existing offer card rule), then "{km} كم · {min} د" / "{km} km · {min} min" for pickup distance and time.
- Actions in one row, RTL-ordered: Accept (forest, 46pt, flex 1.6, label "قبول · ₪{p}" / "Accept · ₪{p}"), Decline (outline, 46pt, flex 1, "تجاهل" / "Decline"). Both actions are 44pt or taller.
- Expired: the card goes to `paper` with a faint border, label "انتهى وقت هذا العرض" / "This offer timed out", no buttons. It disappears after 3 seconds or on refresh.
- Lost to another driver: "أخذه سائق آخر" / "Another driver took it" (reuse `err_offer_expired`: "لم يعد هذا العرض متاحاً. اختر عرضاً آخر."). Stop all timers on the card.
- Haptic: one success haptic on Accept committed (server confirmed). No haptic on lease tick. The existing rule is one haptic per committed action.

Driver's Accept button must not look disabled while the card is live. In `ar/driver-jobs.png` the accept buttons are grey-filled with white labels, which reads as disabled. Fix it with the state rule in §10.

Customer side during automatic search (`en/order-searching.png` shows the radar and "Driver offers"):
- Replace the generic radar subtitle with a three-segment indicator and text: "محاولة {n} من 3 · نرسل الطلب لسائق واحد في كل مرة" / "Try {n} of 3 · we send it to one driver at a time".
- Deadline line: "نبحث لمدة {t} كحد أقصى" / "Searching for up to {t}". The 90-second maximum is shown as a bar that ends at the same time the search ends. It never extends.
- Terminal no result: card "لم نجد سائقاً الآن" / "No driver available right now". Body: "جرّب مرة أخرى أو جدول الطلب لوقت لاحق." / "Try again or schedule it for later." Actions: "ابحث مرة أخرى" / "Search again" (primary) and "جدولة الطلب" / "Schedule it" (outline). Do not claim a charge or no-charge status until finance confirms the policy (open item O4).

## 7. Boarding proof (ride start)

The ride start code is a four-digit boarding code, separate from the parcel handover code and the sender return code. Three codes, three different looks:

| Code | Who gives it | Look | Label (ar / en) |
|---|---|---|---|
| Boarding (rides) | Customer gives to driver when getting in | `olivePale` card, `forest` digits, car icon | رمز الصعود / Boarding code |
| Handover (parcels) | Recipient gives to courier | existing `clayPale` card, `clayInk` digits, box icon | رمز التسليم / Handover code |
| Return (parcels) | Sender gives to courier on return | `bluePale` card, `blue` digits, return icon | رمز الإرجاع / Return code |

Customer order screen (`ar/order-live.png` for rides):
- Hidden before assignment and while the driver is far away. Card text: "يظهر الرمز عند وصول السائق." / "The code appears when your driver arrives."
- After server-confirmed arrival: four digit boxes (the handover/return digit row in `src/app/order/[id].tsx`, `styles.digit`, is 30×40 and display-only; the boarding display uses 44pt boxes), hint "أعطِ هذا الرمز للسائق عند الصعود فقط." / "Give this code to the driver only when you get in."
- The card sits directly above the driver card. It is not in the share-tracking link, and it is not in the chat quick replies.
- Never in pre-arrival driver payloads, logs or screenshots of the driver side.

Driver order screen:
- Before arrival: no PIN field. The Start trip button is shown but disabled, with reason "ابدأ الرحلة بعد الوصول إلى نقطة الالتقاء." / "Start the trip after arriving at pickup."
- After arrival: a four-box input (`CodeBoxes`, reused from the handover input). Start trip button enabled only with four digits entered.
- Attempts: text "بقي {n} من 5 محاولات" / "{n} of 5 attempts left" under the boxes. Wrong code: "الرمز غير صحيح." / "Code is incorrect." and the boxes clear; the count drops. Colour is not the only signal.
- Locked (5 failed attempts): card in `errorPale`: "أوقفنا المحاولات. تواصل مع الدعم لفتحها." / "Attempts are paused. Contact support to reopen." Action: "تواصل مع الدعم" / "Contact support" (outline). The driver cannot start until support reopens.

## 8. Payments: disabled states

Current reality: payment is cash to the driver only. The booking payment row says "نقداً للسائق" / "Cash to driver" and the order shows "Cash to driver". No card, wallet or Bank of Palestine capability is live. The work plan (packet 14) keeps those capabilities off until the merchant agreement and sandbox pass.

Rules:
1. Do not render a card, wallet or BoP option in the customer booking or the order screen while it is not live. A visible disabled option would promise a method the app cannot take.
2. The payment row stays a single fixed row: "الدفع: نقداً للسائق" / "Payment: Cash to driver".
3. When the capability is off in admin: show it in the capability matrix (§9) with the badge "غير مفعّل" / "Off" and the reason ("بانتظار اتفاقية التاجر" / "Waiting for merchant agreement").
4. When a future digital state exists (packet 14), define the copy now but do not render it:
   - "الدفع قيد التأكيد. لا تدفع مرة أخرى." / "Payment pending confirmation. Don't pay again."
   - "تم الدفع · بانتظار إكمال الرحلة" / "Paid · trip not complete yet" (separate, because completion and capture are independent facts).
5. Receipt: amount shown as "نقداً للسائق" / "Cash to driver" with the amount. No "paid" badge for cash until the driver's confirmation exists.
6. The COD merchant amount is a separate line ("مبلغ المتجر" / "Merchant amount") from the transport fee. It is never shown as platform revenue. It stays hidden until packet 14 ships.

## 9. Operator support (admin, mobile first)

Operators are on phones in the screenshots, so every admin screen works at 390 wide. Tablet and desktop layouts are optional and not part of this packet.

Support queue (`en/admin-orders.png` is the base):
- Top: the existing `FilterChips` row (Rail). Add: "عاجل" / "Urgent", "معلّق للدعم" / "Support deciding", "محاولات مقفلة" / "Attempts locked", "بانتظار السائق" / "Waiting for driver", "تسوية نقدية" / "Cash review".
- Row content, top to bottom: order code (LTR) and the service label; route with arrow (arrow flips by language); status badge; owner and due time when a case exists ("المسؤول: {name} · الموعد: {t}" / "Owner: {name} · Due {t}"). An overdue case gets the `errorPale` badge "متأخر" / "Overdue".
- Each row is one 44pt-tall tap target to the order. Actions live on the order screen, not in the list.

Order detail (admin):
- Case card at the top: severity, owner, due time, and the next action. Severity is text plus icon, not colour alone.
- Boarding-attempt recovery: the card "محاولات الرمز" / "Code attempts" uses the existing reset pattern (`proofResetTitle`, `proofResetReason` min 5 characters, `proofResetConfirm`). Add the boarding variant: "فتح محاولات الصعود" / "Reopen boarding attempts". It requires the same confirmation text: "هل تواصلت مع الراكب وتحققت منه؟" / "Did you contact and verify the passenger?"
- Assignment history: a timeline (driver, epoch, reason, time), most recent first. Read-only.
- Capability matrix (admin settings): rows for presence, dispatch, boarding code, card payment, wallet, merchant COD, masked calling, AI assistance. Each row shows "مفعّل" / "On" or "غير مفعّل" / "Off" and the reason. Off rows cannot be toggled in the UI until their gate passes; this matches the work plan.

Dashboard (`en/admin-dashboard.png`): keep the current cards. Add one "Cash exposure" row linked to the cash screen, showing "₪ {amount} من ₪ 1,000" / "₪ {amount} of ₪ 1,000" with a bar. Color changes at 80% and at 100%; the number is always shown.

## 10. Disabled and blocked states (cross-screen rule)

The driver jobs screenshot shows the offer buttons looking disabled while the location banner asks for permission. Rule for all controls:
- A disabled control keeps its shape and label. It uses `paper` fill with `secondary` text (5.6:1). It never uses white text on a grey fill.
- Any disabled control with an action gets a visible reason line directly under it, 14pt, `secondary`, not a tooltip.
- Blocked (eligibility, safety hold, cash cap, location) is a card, not a button: icon, one sentence, one next action.

## 11. Accessibility checklist for every new piece

- Tap targets 44pt+; countdown bars are decorative, the text is the control.
- Every state has text. Colour alone never signals offer live/expired, online/stale, or enabled/off.
- Screen reader: buttons have `accessibilityRole` and `accessibilityState` (`disabled`, `checked`, `busy`); live status uses `accessibilityLiveRegion="polite"` only for online/offline/stale changes and for locked/unlocked boarding.
- Countdown announcements: at 60, 20 and 0 seconds only. Never per second.
- Reduced motion (`useReducedMotion` in `src/motion.tsx`): no moving lease bar, no pulsing dot, no radar. Each state still reads through text.
- Focus after a state change: move focus to the new card's heading when the screen switches from search to assigned, or from the quote to the refreshed quote.
- Arabic and English labels exist for every control. No label contains only an icon.
- Haptics: only on committed actions (accept, start trip, refresh price). Never on ticks.

## 12. Copy (proposed keys for `src/copy.ts`)

These keys go in `src/copy.ts` under new sections. They are proposals; the existing keys listed in §1 are reused where they fit.

Presence:
- `presence_offline` — غير متصل / Offline
- `presence_offline_hint` — لن تصلك طلبات جديدة. / You won't get new requests.
- `presence_ready` — جاهز للطلبات / Ready for requests (existing `online`)
- `presence_stale` — موقعك غير محدّث. الطلبات متوقفة حتى يتحدّث. / Location out of date. Requests paused until it updates.
- `presence_reconnecting` — انقطع الاتصال. نعيد الاتصال… / Connection lost. Reconnecting…
- `presence_gps_off` — فعّل الموقع "أثناء استخدام التطبيق" لاستقبال الطلبات. / Turn on location "While using the app" to receive requests.
- `presence_blocked` — حسابك أو مركبتك غير مؤهلة الآن. راجع ويند. / Your account or vehicle isn't eligible now. Contact Wind.
- `presence_go_online` — اتصل بالطلبات / Go online
- `presence_go_offline` — أوقف الطلبات / Go offline
- `consent_online_title` — نتابع موقعك وأنت متصل فقط / We track your location only while you're online
- `consent_online_body` — عند الاتصال نرسل موقعك الأخير لنعرف أي طلب قريب منك. عند إيقاف الاتصال يتوقف هذا فوراً. / While you're online we send your latest location so we can match nearby requests. Going offline stops this immediately.
- `consent_online_yes` — موافق وأتصل / Agree and go online
- `consent_online_not_now` — ليس الآن / Not now

Quote:
- `quote_calculating` — نحسب السعر… / Calculating price…
- `quote_held` — السعر مضمون {t} / Price held for {t}. Use "held" not "guaranteed": the quote has a limit.
- `quote_expired` — انتهت مدة السعر. حدّث السعر قبل الطلب. / This price expired. Refresh it before requesting.
- `quote_refresh` — حدّث السعر / Refresh price
- `quote_previous` — السابق / Previous
- `err_price_changed` — existing

Offer lease and search:
- `offer_open` — العرض مفتوح {t} / Offer open for {t}
- `offer_timed_out` — انتهى وقت هذا العرض / This offer timed out
- `offer_taken` — أخذه سائق آخر / Another driver took it
- `offer_accept_price` — قبول · ₪{p} / Accept · ₪{p}
- `offer_decline` — تجاهل / Decline
- `search_round` — محاولة {n} من 3 · نرسل الطلب لسائق واحد في كل مرة / Try {n} of 3 · we send it to one driver at a time
- `search_deadline` — نبحث لمدة {t} كحد أقصى / Searching for up to {t}
- `search_none_title` — لم نجد سائقاً الآن / No driver available right now
- `search_none_body` — جرّب مرة أخرى أو جدول الطلب لوقت لاحق. / Try again or schedule it for later.
- `search_again` — ابحث مرة أخرى / Search again

Boarding:
- `board_label` — رمز الصعود / Boarding code
- `board_hint_customer` — أعطِ هذا الرمز للسائق عند الصعود فقط. / Give this code to the driver only when you get in.
- `board_hidden` — يظهر الرمز عند وصول السائق. / The code appears when your driver arrives.
- `board_enter` — أدخل رمز الصعود / Enter boarding code
- `board_attempts` — بقي {n} من 5 محاولات / {n} of 5 attempts left
- `board_wrong` — الرمز غير صحيح. / Code is incorrect.
- `board_locked` — أوقفنا المحاولات. تواصل مع الدعم لفتحها. / Attempts are paused. Contact support to reopen.
- `board_start_after_arrival` — ابدأ الرحلة بعد الوصول إلى نقطة الالتقاء. / Start the trip after arriving at pickup.
- `board_start` — ابدأ الرحلة / Start trip

Payments:
- `pay_row` — الدفع: نقداً للسائق / Payment: Cash to driver (reuse `cash` for the value)
- `cap_off` — غير مفعّل / Off
- `cap_on` — مفعّل / On
- `cap_waiting` — بانتظار {reason} / Waiting for {reason}
- `pay_pending_future` — الدفع قيد التأكيد. لا تدفع مرة أخرى. / Payment pending confirmation. Don't pay again. (do not render until packet 14)

Operator:
- `ops_urgent` — عاجل / Urgent
- `ops_support_deciding` — معلّق للدعم / Support deciding (reuse existing "On hold — support deciding" where it exists)
- `ops_attempts_locked` — محاولات مقفلة / Attempts locked
- `ops_waiting_driver` — بانتظار السائق / Waiting for driver
- `ops_cash_review` — تسوية نقدية / Cash review
- `ops_owner` — المسؤول: {name} · الموعد: {t} / Owner: {name} · Due {t}
- `ops_overdue` — متأخر / Overdue
- `ops_reopen_boarding` — فتح محاولات الصعود / Reopen boarding attempts
- `ops_reopen_boarding_confirm` — هل تواصلت مع الراكب وتحققت منه؟ / Did you contact and verify the passenger?
- `ops_cash_exposure` — ₪ {a} من ₪ 1,000 / ₪ {a} of ₪ 1,000

Write Arabic in Modern Standard Arabic consistent with `src/copy.ts`. Give the final wording a native-speaker review before release.

## 13. Implementation packets (after §9 contract confirmation)

Each packet owns its files. Other agents are editing the shared checkout, so each packet touches only the files listed, and rebases before editing.

| Packet | Scope | Files (owned) | Blocked on |
|---|---|---|---|
| D1 Presence | driver presence state, consent sheet, stale/blocked cards | `src/driver-work.tsx`, `src/app/driver/index.tsx`, `src/copy.ts` (presence + consent keys) | driver session state and lease fields |
| D2 Quote expiry | booking footer countdown, refresh, loading skeleton | `src/app/book.tsx`, `src/copy.ts` (quote keys) | quote id and `expiresAt` from `/api/price` |
| D3 Offer lease | driver offer card lease bar, customer search rounds and deadline | `src/app/driver/index.tsx`, `src/app/order/[id].tsx`, `src/copy.ts` (offer and search keys) | offer `leaseExpiresAt`, `round`, `maxRounds`, search `deadlineAt` |
| D4 Boarding | customer code card, driver code entry, attempts, locked state | `src/app/order/[id].tsx`, `src/pin-sheet.tsx`, `src/copy.ts` (boarding keys) | boarding challenge fields: `visible`, `attemptsLeft`, `locked` |
| D5 Payments off | payment row, capability matrix row, receipt line | `src/app/book.tsx`, `src/app/receipt/[id].tsx`, `src/app/admin/settings.tsx` | capability flags from server |
| D6 Operator support | support queue filters, case card, reopen-boarding action, cash exposure row | `src/app/admin/orders.tsx`, `src/app/admin/index.tsx`, `src/app/admin/cash.tsx`, `src/app/order/[id].tsx` (admin branch only) | case `severity`, `owner`, `dueAt`; cash exposure figures |

Shared components to add in `src/ui.tsx` (only one packet adds each, in order D1 → D6, and the rest reuse them):
- `LeaseBar` (D3): shrinking bar with text, reduced-motion fallback, uses the existing `useReducedMotion`.
- `Countdown` (D2, D3): text countdown `mm:ss` in LTR, announcement at 60/20/0 seconds.
- `CapabilityOff` (D5, D6): badge plus reason line, used in the matrix and disabled rows.
- `CodeBoxes` (D4): a new component extracted from the inline digit rows in `src/app/order/[id].tsx` (handover and return cards). Props: label, length, attempts text, locked state, and an input mode for the driver. Existing handover and return cards must render identically after the extraction.
- `StateCard` (D1, D2, D6): one icon, one sentence, one action; replaces ad-hoc blocked/expired cards.

Ordering and gating: D1 before D3, because the lease needs the online state. D4 is independent after its fields arrive. D5 and D6 do not block anything. No packet adds a live payment, SMS, or push capability; they render only what the server reports.

## 14. Verification each packet must pass

- `npm run lint` and `npx tsc --noEmit` (the project's `npm run typecheck`) before the packet is done.
- Relevant tests in `npm test` that count elements on driver, booking, or order screens. The handoff notes say help cards must be dismissed or `tip:*` cleared in those tests.
- `npm run screens` after every UI change, then open the new PNGs with the Read tool in both `ar/` and `en/`. Add screenshots for these states: driver Offline, Ready, Location stale, Not eligible; booking Calculating, Held, Expired; driver offer Live and Timed out; customer search round 2 and No driver; boarding Hidden, Entry, Locked; admin support queue with the Urgent filter and capability matrix. Update `docs/screens/README.md` only through the script.
- Check the Arabic screenshots for: bidi order of codes and times inside sentences, truncation at font scale 1.3, and the flip of directional icons only.
- Physical device pass (native gate, not a screenshot): Android and iOS, light and reduced motion, TalkBack/VoiceOver reading the countdown only at the announced points.

## 15. Open items and risks

- O1 (blocks D1–D4): the server fields listed in §13 must be confirmed in the backend packet. Until then the design uses names, not values. Do not invent a field, and do not show a value the server did not send.
- O2: the lease and deadline countdowns use server-provided remaining milliseconds at fetch time plus local elapsed time. The phone clock is not trusted, per the work plan.
- O3: the boarding code is shown only after server-confirmed arrival. If the arrival rule changes (poor-GPS override), the card state changes with it; design for "visible after arrival" only.
- O4: copy "no charge" for an unsuccessful search is not written. It needs a finance and product decision first.
- O5: the Arabic copy is drafted, not reviewed by a native speaker. Review before release.
- O6: the grey accept-button look in `ar/driver-jobs.png` must be checked on device. If it is a disabled state, it is fixed under §10; if it is the normal state, the contrast of white on that grey must be measured on the real colour first.
- O7: no Expo/RN API has been called or changed by this packet. Native behaviour (announcements, focus, haptics on device) is a device check, not a doc claim.

## 16. Changed files

- `docs/implementation/design.md` (this file, new).

No `src/`, `server/`, or config files were changed. No commit, push, deploy, or paid resource was used.
