# Wind implementation: design for WP08–WP10 (quotes, realtime, dispatch)

Status: design only. No `src/`, `server/` or config files were changed. Implementation of each packet waits for the backend fields named in §8.
Author: design sub-agent, Claude Haiku 5.5. No other model designed any part of this packet.
Scope: user-visible behaviour, copy and accessibility for:
- (a) WP08 immutable quotes: quote ID and 120-second expiry, minor-unit breakdown, ETA band, change-quote consent, expired-quote refresh without silent re-pricing.
- (b) WP09 notifications and realtime: push as a hint, reconnect and gap resync, revoked access, expired offers not actionable.
- (c) WP10 dispatch: customer search rounds 1–3 with a 90-second ceiling and a terminal no-driver state; driver 15-second offer lease with decline and timeout; atomic-accept conflict.

This packet extends `docs/implementation/design.md` (the earlier packet, D1–D6). Where it changes that packet, §6 says so. Packets D1 (presence), D4 (boarding), D5 (payments off) and D6 (operator support) are not touched here.

## 1. Evidence used

Source read as it exists now:
- `src/app/book.tsx`: price is fetched from `POST /api/price` on every form change, debounced 300 ms (lines 162–176). The Request button shows the price only when it is not quoting (line 272). A `price_changed` error is cleared by `refresh()` plus `setPriceTick` (line 255) and is shown in an `ErrorText` at the bottom of the form (line 441), not next to the button. There is no quote ID and no expiry.
- `src/app/order/[id].tsx`: order polled every 4 s (line 41); live driver fix via `useLiveFix` (line 43). The searching state shows a Radar card (lines 180–186) and a "Driver offers" card with Accept buttons (lines 187–204) for every service, including rides. That is the wrong model for instant ride dispatch (see §5.4).
- `src/app/driver/index.tsx`: `/jobs` polled every 8 s; each job has an Accept button (lines 191–197). Accept is blocked when the driver is not `known` or has a conflicting job (`canTake`).
- `src/driver-presence-card.tsx`: presence has nine states (`offline`, `starting`, `online`, `stale`, `reconnecting`, `busy`, `unavailable`, `ineligible`, `permission_denied`). The earlier packet listed five; the code has nine. This packet uses the nine.
- `src/ui.tsx`: palette, `Button` (its `reason` prop is already the "why it waits" line), `Reason`, `Radar`, `Pulse`, `Card` tones, `Badge`, `Empty`, `Rail`, `FilterChips`, `Press`, `haptic`, `useReducedMotion` via `src/motion.tsx`.
- `src/model.ts`: `PriceQuote` = `{price, km, minutes, delayMinutes, night, slow, closed, avoids, estimated, standard?}`. `Order` has `recommendedPrice`, `routeKm`, `offers[]` (driver bids), `myOffer`, `scheduledFor`. `statusFlow` = `searching → assigned → at_pickup → in_transit → completed`.
- `src/copy.ts`: existing keys listed in §6.1.
- `server/main.ts`: `/api/price` (line 865) returns the recommendation with no ID or expiry. `createOrder` returns `409 price_changed` when `quotedPrice` differs (line 891). `/api/orders/:id/live` is a held request with `since` (line 1067); the client re-asks after each answer (`src/api.ts` line 98).
- `server/worker.ts`: outbox with leases, backoff and review state. `order_releases` hides a released job from that driver (`server/main.ts` line 273).

Screenshots (390 px width, Arabic and English captures, seeded session; not native-device captures):
- `docs/screens/ar/book-ride.png`: the footer reads only "اطلب" with no price, and the reason line says "اختر مكان الاستلام والتسليم لعرض السعر." The price is not shown while the route is incomplete; the "calculating" state is not visible in this capture (`ar/book-calculating.png` exists and should be checked when D7 ships).
- `docs/screens/en/order-searching.png`: Radar, "Finding a driver", and a "Driver offers" card with an Accept button for a ride. §5.4 removes this for instant-dispatch rides.
- `docs/screens/ar/order-searching.png`: the same card in Arabic with "قبول" and a total of ₪ 71.
- `docs/screens/ar/driver-jobs.png`: Accept buttons look grey, with a reason line "أكمل طلباتك الحالية أولاً." That is the disabled look from design §10 and is intended. The reason line is the only signal, so §5.2 keeps it.

Expo: `AGENTS.md` requires official docs for Expo APIs. This packet names no Expo or React Native API. The native behaviours it needs (focus, announcements, haptics, push permission, deep links) are device checks in §10.

## 2. Rules for all three packets

1. **The server is the clock and the authority.** The phone never decides that a quote, lease or search is still valid. Every timer starts from a remaining-milliseconds value sent by the server at response time (`expiresInMs`, `leaseExpiresInMs`, `deadlineInMs`), plus local elapsed time. The phone clock is not used for expiry.
2. **Never re-price silently.** A price, route or ETA change always passes through a visible state that the customer approves. A refresh that yields the same total is a success message, not a new price.
3. **Hold, not guarantee.** Price is "held" for the quote lifetime. ETA is an "estimate" with a band. No screen says "guaranteed", "مضمون", "guaranteed arrival" or "سيصل في". The design's old key `quote_held` used "مضمون" in Arabic; it is corrected here to "محجوز" (§6.2).
4. **Push is a hint.** A notification only tells the app to fetch a snapshot. No screen acts on a push payload alone (§4.3).
5. **Authority for an action sits with one state.** A button that acts on an order, offer or search is enabled only when the last server snapshot says the action is allowed. A pending request keeps its loading look (not a grey disabled look) so the driver or customer can see work is in progress.
6. **Colour is never the only signal.** Each state has a text line and an icon. The round track has numbers, the countdown has digits, the offer card has words.
7. **Reuse the existing components.** New components are listed in §7 and each has one owning packet. Nothing new uses a new colour, font size or radius. Palette, spacing and type scale are those in `design.md` §2.
8. **Western digits, LTR, one node per value** for every code, time, count, money amount and order ID inside Arabic sentences (`design.md` §3). Countdowns use `mm:ss`.
9. **Reduced motion:** no moving bars, no pulsing dot, no radar rings. Each state reads from its text and its static track position.
10. **Announcements are rare.** Screen readers hear a change once: a round start, a terminal outcome, an accept result, a reconnect or resync result. Never a per-second countdown.

## 3. WP08 — immutable quotes (booking)

Extends `design.md` §5 (quote footer). Where the two differ, this section wins.

### 3.1 Quote lifecycle as the customer sees it

| Quote state | Trigger | What the footer shows | Button |
|---|---|---|---|
| `none` | route not complete | Reason line `quote_pick_route` | Disabled, reason shown |
| `pricing` | route complete, `/price` in flight, or the form changed | Skeleton bar and `quote_calculating` | Disabled, reason `quote_calculating`; the number is never shown |
| `held` | quote returned with `quoteId`, `expiresInMs > 0` | Total, `quote_held` with countdown `mm:ss` and track | Enabled: "اطلب · مشوار" / "Request · Ride", trailing total |
| `held` under 20 s | `remaining < 20 s` | Same, track and countdown turn `clayInk` (text unchanged) | Enabled |
| `expired` | `remaining = 0`, or `409 quote_expired` on submit | `quote_expired` text; old total struck through and labelled `quote_previous` | Replaced by `quote_refresh` (primary) |
| `refreshing` | user taps refresh | Old total kept with `quote_previous`; `quote_calculating` | Disabled, reason `quote_calculating` |
| `changed` | server returns a different total or route (§3.5) | Consent sheet over the form (§3.5) | Footer CTA disabled, reason `quote_review_first` |
| `unchanged` | refresh returns the same total | `quote_unchanged` for 3 s, then `quote_held` | Enabled |
| `submitting` | request sent with `quoteId` | Button `loading` (keeps its colours) | Loading |

The footer stays one sticky block (`Screen footer`, existing).

### 3.2 Footer layout (held state)

- Line 1: `Button` "اطلب · مشوار" / "Request · Ride" with `trailing` as the money total (`money()` for whole shekels; `moneyMinor` when the total has agorot, see §3.3).
- Line 2, `secondary`, `body` variant: "السعر محجوز 01:45" / "Price held for 01:45". The countdown is its own `Text` node, LTR digits.
- Line 3: a 4 pt track under the footer. The track fills from full to empty over 120 s. Colour `olive`; below 20 s `clayInk`. Reduced motion: a static track that steps down every 10 s.
- The quote ID is not in the footer. It is in the breakdown sheet (§3.3) as "رقم السعر · Q-7F3K2A" / "Price ID · Q-7F3K2A" in `caption`, LTR, so support can read it.

Expired state:
- Line 1 replaced by `Button` "حدّث السعر" / "Refresh price" (primary, no trailing).
- Line 2: "انتهت مدة السعر. حدّث السعر قبل الطلب." / "This price expired. Refresh it before requesting." in `body`, `secondary`.
- The old total is shown in the price card (not the footer) struck through, with `quote_previous` label. Strike-through is additional; the words carry the meaning.

Pricing state: the skeleton is a 14 pt bar in `muted`, width 40% of the footer, with `quote_calculating` as the reason. No dots, no placeholder number.

### 3.3 Breakdown: minor-unit lines

Tap "تفاصيل السعر" / "Price details" (a 44 pt `Press` with a chevron, `ListRow` style) under the total. It opens a bottom sheet with the same sheet pattern as `CityPicker` in `book.tsx`.

Rules:
- Every line is an integer in ILS minor units (agorot) from the server. The sheet formats each as `₪ 12.50` (two decimals always), so lines visibly add up.
- The payable total is whole shekels (current behaviour). The last line is `quote_rounding` with the difference (may be `₪ 0.00`, shown anyway so the sum is explicit).
- Each row: label on the reading-start side, value on the reading-end side, `row` direction from `useCopy()`. Value is its own `Text`, LTR.
- Negative lines (discounts) show a leading minus sign: `−₪ 5.00`. The existing `money()` puts the sign before `₪`; the new helper follows it.
- Customer lines only: base fare, distance and time, night rate, Plus discount, promo, rounding, total. Commission and driver earnings never appear here.
- Quote ID at the foot, caption, LTR.
- The sheet's last row is the total, `title` weight, and it matches the footer total exactly.

New formatter needed: `moneyMinor(minor: number)` in a new `src/money.ts` (owned by D7). Not in `ui.tsx`, so `ui.tsx` stays free of pricing logic. It uses the existing `copy[language].nis`.

### 3.4 ETA band

ETA is shown in two places: the booking smart-price card (before order) and the order screen (after assignment, already `EtaLine`).

Booking:
- Under the total, one `caption` line: "يصل السائق خلال 12–18 د تقريباً" / "Driver arrives in about 12–18 min". For rides and freight, the trip time reads "الوصول خلال …" / "Arrival in …" (existing `etaToDropoff` style).
- Second line, `caption`, `secondary`: "الوقت تقديري وليس مضموناً." / "Time is an estimate, not a guarantee."
- If the quote is an estimate because road data is not confirmed (`basis = 'estimated'`): "تقدير تقريبي: بيانات الطريق غير مؤكدة لهذا المسار." / "Rough estimate: road data is not confirmed for this route." Use the `clayInk` text colour (passes at 4.8:1 on `clayPale`) with a warning icon, not colour alone.
- Upper bound open-ended (`highMin = null`): `etaToPickupSlow` / `etaToDropoffSlow` ("أو أكثر" / "or more").
- Never show a single number as the ETA. Never show a band narrower than 5 minutes; the server enforces this in the quote.

Uncertainty copy used on every ETA: "قد يتغير الوقت بسبب الطريق والحواجز." / "Road and checkpoint delays can change this." It appears once in the breakdown sheet, not on every line.

### 3.5 Change-quote consent

When a route, load, destination, tariff version, plan or promo changes after a quote was issued, the server does not reprice the existing quote. The customer gets a new quote with `changes[]` (see §8). The app shows consent before any new charge.

Sheet (modal, same look as the city picker; `accessibilityViewIsModal`):
- Title: "تغيّر السعر قبل الطلب" / "The price changed before you ordered" (`h2`).
- Reason line from `changes[0].reason`: one of `quote_reason_route`, `quote_reason_tariff`, `quote_reason_road`, `quote_reason_promo`. Body: "{reason}. لن نغيّر السعر دون موافقتك." / "{reason}. We won't change your price without your approval."
- Changed lines only: old value and new value per changed line, old in `secondary` with strike-through, new in `ink`. Unchanged lines are hidden behind "عرض كل التفاصيل" / "Show all details".
- Buttons, RTL-ordered, both 44 pt or taller:
  - Primary, forest: `quote_accept_new` "اقبل السعر الجديد · ₪ 79" / "Accept new price · ₪ 79". Sends `acceptQuoteId`.
  - Outline: `quote_edit` "عدّل الطلب" / "Edit order". Closes the sheet, returns to the form. The changed quote is discarded server-side when the form changes.
- The sheet has its own 120-second life, from the new quote's `expiresInMs`. If it runs out: the sheet becomes the expired state (§3.6).
- Accepting is one committed action: one `haptic.success()` after the server confirms the new quote, never on tap.
- No "cancel and keep old price" option: the old quote is already expired or changed on the server.

Old clients (before WP08 ships): they keep the current behaviour (`409 price_changed` → refresh and re-confirm). The server must keep that path for `quotedPrice` requests. The new consent sheet only exists in the new client. This is a compatibility rule (plan, "Compatibility rules that every packet must preserve", rule 2).

### 3.6 Expired quote refresh without silent re-pricing

Flow:
1. Quote hits zero. Footer switches to `expired` (§3.2). Nothing is requested automatically.
2. User taps "حدّث السعر". State `refreshing`; server call `POST /api/price` with the same inputs.
3. Response:
   - Same total and same route: `quote_unchanged` · "لم يتغير السعر · محجوز 02:00" / "Price unchanged · held for 02:00". Show for 3 seconds (announced once), then `held`.
   - Different total or route: the change sheet (§3.5). No CTA is enabled until the customer chooses.
   - Refresh fails (network, 5xx): `err_network` text in an `errorPale` card above the footer, with `retry` (existing). The old total stays marked `quote_previous`. The CTA stays "حدّث السعر".
4. Submitting with an expired quote: the server returns `409 quote_expired`. The app goes to `expired` and shows `err_quote_expired` above the footer (not at the bottom of the form, which is where `price_changed` sits today; §3.7).

The app never sends an expired quote. It never submits a new total unless the customer has seen it.

### 3.7 Submit, replay and errors

- Submit sends `quoteId` with the existing `requestId` (command replay). Successful replay returns the committed order even after quote expiry, so the app navigates to the order and shows `booking_replayed` as a caption on the order screen ("طلبك مسجّل من قبل. فتحنا تفاصيله." / "Your order was already placed. Opening it.").
- `409 quote_changed`: the change sheet (§3.5) opens with the new quote from the error body. Never a silent retry.
- `409 quote_expired`: `expired` state (§3.6).
- `409 price_changed` (legacy clients and the non-quote path): unchanged from today, but the message moves from the bottom of the form to a card directly above the footer, `errorPale`, `err_price_changed` text plus the new total. The button stays disabled until the customer taps it again. This is the only change to the legacy path.
- `503 route_blocked` (new error, quote refused because every alternative is prohibited): card above the footer: `quote_route_blocked` "لا نستطيع توصيل هذا المسار الآن. غيّر نقطة الالتقاء أو التسليم." / "We can't serve this route now. Change the pickup or drop-off." Button disabled with that sentence as the reason.
- Connection lost at submit: existing pending-booking card (`bookingPending`, `bookingOfflineSaved`) stays. Replay uses the saved command and its quote ID; no new quote is requested for a pending command.

### 3.8 Accessibility (booking)

- Countdown announced at 60 s, 20 s and 0 s only, through `AccessibilityInfo.announceForAccessibility` (`design.md` §11).
- The breakdown sheet's rows are read as "label, value" in one `accessibilityLabel` per row. The total row is announced last.
- The consent sheet takes focus when it opens (`accessibilityViewIsModal`); focus returns to the footer CTA on close.
- The footer reason line is a `Reason` (existing), not a tooltip.
- Font scale 1.3, 360×800: the breakdown rows wrap; values never truncate (`numberOfLines` not set on values).

### 3.9 Blockers (WP08)

Blocked on server fields in §8.1. Until `quoteId` and `expiresInMs` exist, the footer keeps the current behaviour (no countdown), and this packet does not show a countdown.

## 4. WP09 — notifications and realtime states

### 4.1 Connection states on the order screen

One status note sits directly under the header. It is one line in `caption`, with an icon, shown only when the state is not `live`.

| State | Condition | Look | Text (ar / en) | Actions |
|---|---|---|---|---|
| `live` | snapshot or live fix within 8 s | none | none | all enabled |
| `reconnecting` | no successful update for 8 s (two missed polls) | `bluePale`, spinner (static icon with reduced motion) | "انقطع التحديث المباشر. نعرض آخر حالة معروفة." / "Live updates paused. Showing the last known status." | enabled; actions that change state are blocked until resync (§4.2) |
| `resyncing` | snapshot requested after a gap or reconnect | `bluePale`, spinner | "نحدّث الحالة…" / "Updating status…" | state-changing actions disabled, reason `rt_action_wait` |
| `synced` | resync succeeded | `olivePale` | "الحالة محدّثة." / "Status up to date." (shown 3 s, announced once) | enabled |
| `stale` | no successful update for 30 s and reconnect failing | `clayPale`, `clayInk` text, time icon | "آخر تحديث قبل {t}. اسحب للتحديث." / "Last updated {t} ago. Pull down to refresh." | enabled, pull to refresh (`Screen onRefresh`) |
| `offline` | network off | existing `offline` copy and `retry` | "تعذّر الوصول للخادم" / "Can't reach the server" | retry |
| `revoked` | `401` or the order is no longer visible (§4.5) | full access card | §4.5 | back only |

Thresholds (8 s, 30 s) are UI defaults chosen here; they are not server policy. They must be configurable with the other poll constants.

`{t}` is a relative time computed from the server's `updatedAt` and `serverTime`, not from the phone clock alone.

### 4.2 Gap detection and snapshot resync

- Every realtime event carries an `order sequence` and `assignment epoch` (`plan` §09). The client keeps the highest sequence applied.
- Event with a sequence higher than last+1: a gap. The client does not apply the event. It sets `resyncing` and fetches `GET /api/orders/:id` (the snapshot is authoritative).
- Event with a lower sequence or a lower epoch: discarded silently.
- Reconnect: after a `reconnecting` period, the first successful answer triggers a snapshot fetch and `resyncing`; then `synced`.
- During `resyncing` the screen keeps the last known status visible. It is not blanked. The status title gets a `caption` line "نحدّث الحالة…" and the progress track is drawn from the last known step with the segment outline dashed (reduced motion: same, no animation).
- If the snapshot shows a different status, the status card updates with the same entrance animation as today (`Appear`), and the change is not announced twice.
- If the driver changed (new epoch): notice "تغيّر السائق. نعرض السائق الحالي." / "The driver changed. Showing the current driver." in `caption`, `polite`. The driver card and map pin change to the new driver; the old fix is dropped (`order/[id].tsx` already does this for `driverChanged`).

Drivers' screens follow the same rules. An accept or advance button is disabled with `rt_action_wait` until a snapshot confirms the job is still theirs.

### 4.3 Push as a hint

- A push tells the app that something changed. The app opens the order and fetches the snapshot before showing any status. No status, price, address or code is taken from the push payload.
- Lock-screen text is generic and contains no customer name, address, price, phone, code or ETA:
  - Customer order update: title "تحديث على طلبك {code}" / "Update on order {code}"; body `push_order_body` "افتح التطبيق لمعرفة الحالة." / "Open the app to see the status."
  - Driver offer: title "طلب جديد" / "New job"; body `push_offer_body` "لديك عرض جديد. افتح التطبيق للرد." / "You have a new offer. Open the app to respond."
- No action buttons on any notification. Accept, decline or pay are never offered from a lock screen: the lease is 15 seconds and identity must be checked in the app.
- Tap opens the target screen (`/order/:id`, or `/driver` with the offer card). The target screen shows its own state; if the offer has expired it shows the timed-out card (§5.2), not an accept button.
- Notification permission hint (shown once after the first booking or the first driver online session): "فعّل الإشعارات لتصلك التحديثات. التطبيق يعرض الحالة الحقيقية عند فتحه." / "Turn on notifications for updates. The app always shows the real status when you open it." If denied: "الإشعارات متوقفة. ستظهر التحديثات عند فتح التطبيق." / "Notifications are off. Updates appear when you open the app." — not a red error; `secondary` text.
- Every notification category follows the same rule: the app never assumes delivery. A missed push costs a late screen, not a wrong state.

### 4.4 Expired offer is not actionable (push or in-app)

- A push for an offer, opened after the lease has ended, shows the timed-out card (§5.2) with no buttons.
- A push opened inside the lease shows the live offer only after the snapshot confirms `open`. Until then the card is in `checking` (§5.3).
- An offer that appears in the list after the lease is over is shown with `offer_timed_out`, and it disappears after 3 seconds (`design.md` §6).

### 4.5 Revoked access

Three cases, one visible card style (`StateCard`: one icon, one sentence, one action):

1. **Session revoked** (sign-out elsewhere, password change, account blocked): any request returns `401 unauthorized`. The screen replaces its content with:
   - Title: "لم يعد لديك وصول إلى هذا الطلب" / "You no longer have access to this order".
   - Body: "انتهت الجلسة أو أُلغي الوصول. سجّل الدخول من جديد إن لزم." / "Your session ended or access was removed. Sign in again if needed."
   - Action: "سجّل الدخول" / "Sign in" (primary).
   - Live streams are closed at once; no more fixes are drawn.
2. **Order no longer visible to this user** (released driver, reassigned, or deleted from the user's list): `404 not_found`. Card with `err_not_found` "غير موجود أو لم يعد متاحاً." / "Not found or no longer available." and action "الطلبات" / "Orders" (back to list). The last known data is not shown.
3. **Share link revoked** (tracking page or `/api/track/:token/live`): `share_ended` "انتهت مشاركة هذا التتبع." / "This tracking link has ended." Used on the public tracking screen only; no order details are shown.

Accessibility: the revoked card is announced once (`accessibilityRole="alert"`, `ErrorText` pattern).

Logout and account switch: the device token is unregistered before the sign-out completes. No status from the previous account remains on screen (the cached snapshot for that account is removed). No design element is needed beyond the normal sign-in screen.

### 4.6 Blockers (WP09)

Blocked on §8.2: sequence number and epoch on events, `serverTime` on snapshots, realtime connection state from Web PubSub (or the long-poll fallback), device registration status, and the revocation response codes. The connection-state table can run on the current long-poll with the same states; the WebPubSub connection is a transport change only.

## 5. WP10 — dispatch

### 5.1 Customer: searching, rounds 1–3, 90-second ceiling

Replaces the generic Radar card for `service = ride` (and for freight and parcels when they use automatic dispatch). Negotiated offers keep the "Driver offers" card (§5.4).

Card layout (top to bottom, one `Card`):
1. Radar with the service icon (existing component). Reduced motion: one static ring (existing).
2. Title `findingTitle` "نبحث عن سائق" / "Finding a driver" (`h2`).
3. Body: `finding_ride_body` "نرسل طلبك لسائق قريب واحداً تلو الآخر. ستظهر بيانات السائق عند القبول." / "We send your request to one nearby driver at a time. Driver details appear once one accepts." (replaces `findingBody` for rides, which says "معروض الآن على السائقين المناسبين" — accurate for parcels, not for sequential rides).
4. Round track: `maxRounds` segments (server value; default display 3). Segment states:
   - done: `olive` fill;
   - active: `forest` fill with a 2 pt white inner gap so it is not colour alone; plus the text below;
   - not yet: `muted` fill.
   Height 5 pt, same as the order progress track (`styles.progress`). Accessibility label on the track: `search_round` "المحاولة {n} من 3 · …" / "Attempt {n} of 3 · …".
5. Text under the track: `search_round` "المحاولة {n} من 3 · نرسل الطلب لسائق واحد في كل مرة" / "Attempt {n} of 3 · we send it to one driver at a time". During a round with an open offer: `search_waiting_reply` "بانتظار رد السائق" / "Waiting for the driver to reply". Between rounds: `search_sending` "نرسل الطلب إلى سائق قريب" / "Sending to a nearby driver".
6. Deadline bar: a 4 pt track, full at the start of the search, empties over 90 s from the server's `deadlineAt` (remaining ms at fetch plus local elapsed). Colour `olive`; under 20 s `clayInk`. Text under it: `search_remaining` "باقٍ {t} من البحث" / "{t} left to find a driver", LTR digits `01:24`.
7. Cancel stays available, as today: "إلغاء الطلب" / "Cancel order" (existing `cancelOrder`, `danger` size sm).

Timing rules:
- The search starts at the release time (30 minutes before a scheduled pickup, or at booking for a now-order), not at booking. Scheduled orders before release keep the existing "later" card.
- Ceiling: 90 s from the server's `deadlineAt`. It does not extend for retries. A round that is still open when the deadline passes is closed by the server, and the search becomes terminal.
- The search also ends (terminal) when the third offer's lease ends without acceptance, whichever comes first.

Announcements (polite, once each):
- A new round starts: "المحاولة 2 من 3" / "Attempt 2 of 3".
- Terminal: `search_none_title` "لم نجد سائقاً الآن" / "No driver available right now".
- The countdown is never announced. Deadline bar is decorative; the text line carries the value.

Terminal no-driver state (replaces the searching card; the track stays at the final round):
- Icon: `car-outline` in `clayPale` (no radar). Title `search_none_title`. Body `search_none_body` "جرّب مرة أخرى أو جدول الطلب لوقت لاحق." / "Try again or schedule it for later."
- Retry keeps price: `search_retry_keeps` "نُبقي السعر والمسار كما هما." / "Price and route stay the same." — shown under the body, so the customer knows the retry does not re-price.
- Actions, stacked, `gap 8`:
  - Primary: `search_again` "ابحث مرة أخرى" / "Search again". Starts a new search on the same order (new 3 rounds, new 90 s). Button `loading` while the request is in flight.
  - Outline: `search_schedule` "جدولة الطلب" / "Schedule it". Opens the existing `SlotPicker` (order screen parcel reschedule pattern).
  - Ghost: `cancelOrder`.
- No statement about charges. `O4` (finance decision on unsuccessful searches) blocks any wording on that.
- Terminal is shown only once: a second tap on "ابحث مرة أخرى" cannot start two searches. The button disables with reason `wait_busy` while the request is open.

### 5.2 Driver: offer card with a 15-second lease

The offer is a separate card at the top of the driver jobs screen (`src/app/driver/index.tsx`), above the job list. It is not inside a job card. Rides under instant dispatch do not appear in the list with an Accept button (§5.4).

Open state:
- Top: `LeaseBar` (4 pt, across the card, shrinks over 15 s) and text `offer_open` "العرض مفتوح {t}" / "Offer open for {t}" (LTR `ss` seconds, e.g. "00:12"). Last 5 s: bar `clayInk`.
- Body, in this order (`design.md` §6, earnings first):
  - earnings "حصّتك ₪ 60" / "You earn ₪ 60" (`micro` label, `h2` olive value);
  - route spine (existing `RouteLine`);
  - pickup distance and time from the offer: "{km} كم · {min} د" / "{km} km · {min} min" for the drive to pickup, with `offer.pickupEtaSec` (see §8.3);
  - cash to collect (existing `collectCash`).
- Actions, one row, RTL order: `offer_accept_price` "قبول · ₪{p}" / "Accept · ₪{p}" (forest, 46 pt, flex 1.6) and `offer_decline` "تجاهل" / "Decline" (outline, 46 pt, flex 1). Both at least 44 pt.
- Decline is a real server action (`POST` decline with `offerId`). Decline does not change eligibility or rating. Copy after decline: `offer_declined` "تم تجاهل العرض." / "Offer declined." (card goes away after 2 s). No penalty wording.
- The Accept button keeps its forest look while the lease is open. It is never grey while live. A grey look only appears with a reason line (see `design.md` §10 and O6).

Timed-out state:
- Card to `paper` with a faint border; title `offer_timed_out` "انتهى وقت هذا العرض" / "This offer timed out"; no buttons.
- Removed after 3 s, or when the next snapshot arrives.
- Local timer reaching zero disables Accept and Decline at once. The server still decides: if an accept request was sent before the lease ended and the server accepts it, the outcome follows the server (§5.3, row 5).

Presence interaction:
- Going offline or going stale while an offer is open: the server closes the offer. The card shows `offer_closed_presence` "أوقفت الاتصال، فأُغلق العرض." / "You went offline, so the offer closed." or `offer_closed_stale` "موقعك غير محدّث، فأُغلق العرض." / "Your location is out of date, so the offer closed." and no buttons. Presence states come from D1 (`driver-presence-card.tsx`).

Offer count: the driver sees one offer at a time (the server sends one at a time). If a second offer arrives while one is open (should not happen), the first is replaced by the server; the card does not stack.

### 5.3 Atomic accept: conflict states

Accept sends the offer ID and the lease nonce. The server runs the accept transaction (`plan` §10). The client shows one of these states; nothing is shown as accepted until the server says so.

| # | Situation | Server answer | Card state | Text (ar / en) | Next |
|---|---|---|---|---|---|
| 1 | Accept pressed, request in flight | none yet | `checking`, Accept shows loading (keeps forest) | "نتحقق من قبول العرض…" / "Checking your acceptance…" | wait for answer |
| 2 | Success | `assigned`, this driver | success | "الطلب لك الآن" / "This job is yours now" (`offer_assigned`) | `haptic.success()` once; navigate to `/order/:id` |
| 3 | Another driver won | `409 already_taken` | card closes | `err_already_taken` "سبقك سائق آخر لهذا الطلب." / "Another driver took this job first." | reload `/jobs`; card removed after 3 s |
| 4 | Lease ended on server | `409 offer_expired` | timed-out card | `offer_timed_out` + `err_offer_expired` "لم يعد هذا العرض متاحاً. اختر عرضاً آخر." / "This offer is no longer available. Pick another one." | no buttons |
| 5 | Accept sent before local lease end, answer after it | success or conflict from server | follows the server row above | row 2 or 3 or 4 | the server is authoritative; the card does not second-guess the answer |
| 6 | This driver has conflicting work | `409 blocked_exclusive` or `blocked_parcels` | card with reason | `accept_blocked_exclusive` / `accept_blocked_parcels` (existing) | Accept disabled, reason shown |
| 7 | Network failure or timeout after sending | unknown | `checking` for up to 5 s, then reconcile | `offer_unknown` "لم نتمكن من تأكيد القبول بعد. نعيد تحميل الطلب." / "We couldn't confirm your acceptance yet. Reloading the job." | fetch `/jobs` and `/orders/:id`; show row 2, 3 or 4 from the truth; if still open with lease left, show open again |
| 8 | Driver's presence changes during accept | `409 presence_changed` | card closes | `offer_closed_presence` | reload |
| 9 | Retry after row 7 | same command ID | replays the same answer | as the replayed answer | the server returns the committed result, never a second assignment |

Rules:
- Retries use the same command ID. No new command is created for a retry.
- A `2xx` answer that says the driver is not assigned is treated as row 3.
- Two drivers accepting the same offer ID (one device re-sent): one winner, the other gets row 3.
- Accept never disappears into grey. During `checking` the button shows the spinner (`Button loading`) with the same colours.
- Haptic: one success on row 2 only. One error on rows 3, 4, 6 and 8 (`haptic.error()`), not on row 7.

### 5.4 Ride requests are not a shared list

Instant dispatch means a ride reaches one driver at a time. The current `/jobs` list shows every searching order with an Accept button, and the current customer screen shows a "Driver offers" card with a price-and-accept list. Under `ride = instant_dispatch` both are wrong.

Design decisions (recommendation, to be confirmed with the backend owner, see §9):
- **Driver list:** ride orders in `searching` do not show an Accept button. They show the line `offer_rides_direct` "طلبات الرحلات تصلك كعرض مباشر، ولا تظهر هنا للقبول." / "Ride requests come to you as a direct offer, not in this list." once in the list header. Parcel and freight rows are unchanged.
- **Customer:** the "Driver offers" card is hidden for ride orders under instant dispatch. It stays for freight (negotiated offers, customer chooses) and for parcels with counter-offers, unchanged.
- **Feature flag:** all of §5 is behind `dispatch_instant` (server flag and client flag). Off means the current behaviour, exactly as now.

### 5.5 Blockers (WP10)

Blocked on §8.3: dispatch state and round fields, search deadline, offer object with lease and pickup ETA, accept request body with offer ID and nonce, the decline endpoint, the conflict error codes (`already_taken`, `offer_expired`, `presence_changed`, `blocked_exclusive`, `blocked_parcels`), and the answer to O5/O6 (does a declined driver come back in a later round?).

## 6. Copy

### 6.1 Existing keys reused (verified)

Verified by grep against `src/copy.ts` on this revision. Every key below is an object key in both the `ar` block (lines 3–879) and the `en` block (lines 883–1735). Method: `grep -nE "^\s*KEY:" src/copy.ts`, with the line number checked against the block boundaries. Keys this packet adds are in §6.3 and §6.4, not here.

Quote and booking: `quote_calculating`, `quote_pick_route`, `err_price_changed`, `fare`, `total`, `youPayCash`, `nightRate`, `promoDiscount`, `bookingPending`, `bookingOfflineSaved`, `bookingRetryHint`, `err_network`, `retry`, `nis`.

Offers and dispatch: `err_already_taken`, `err_offer_expired`, `accept_busy`, `accept_wait_status`, `accept_blocked_exclusive`, `accept_blocked_parcels`, `wait_busy`, `findingTitle`, `cancelOrder`, `cancelConfirm`, `scheduleRequest`, `changeTime`, `saveTime`, `keepTime`, `etaToPickup`, `etaToDropoff`, `etaToPickupSlow`, `etaToDropoffSlow`, `collectCash`, `earnLabel`.

Connection and access: `offline`, `offlineDesc`, `retry`, `err_unauthorized`, `err_not_found`, `updatesPaused` (already used on the order screen for poll errors).

Passing references (used in §4.5): `signIn`, `orders`, `km`.

Not in `src/copy.ts` (so NOT reused; they are new keys, defined in §6.4): `offer_open`, `offer_timed_out`, `offer_accept_price`, `offer_decline`, `search_round`, `search_none_title`, `search_none_body`, `search_again`, `quote_expired`, `quote_refresh`, `quote_previous`, and `quote_held` (defined in §6.3 with its corrected text). Their earlier mention as "reused" was wrong: `design.md` §12 only proposed them. The `consent_*` keys belong to D1 and are not part of this packet.

### 6.2 Corrections to `design.md`

| Key | Old | New | Reason |
|---|---|---|---|
| `quote_held` | AR "السعر مضمون {t}" | AR "السعر محجوز {t}" | "مضمون" means guaranteed; the design's own rule says "held". EN unchanged: "Price held for {t}". |
| `offer_taken` (§12) | "أخذه سائق آخر" | superseded by `err_already_taken` | Use the existing message used for the server's `already_taken` answer, so the wording matches across the app. Key not added. |
| Lost-offer text (§6) | reuse `err_offer_expired` | `err_already_taken` for "taken"; `err_offer_expired` only for "lease ended" | Two different server facts; §5.3 separates them. |
| `search_deadline` (§12) | "نبحث لمدة {t} كحد أقصى" | retired; use `search_remaining` | The customer needs remaining time, not the cap. |
| `a_price` (existing, `src/copy.ts`) | "…ولا يتغير بعد قبوله." | new text in §6.3 | The existing sentence promises no change after accept. Change-quote consent makes that promise false unless the customer approves; the new text says so. |
| `findingBody` (existing) | "معروض الآن على السائقين المناسبين" | `finding_ride_body` for rides only | Rides are sequential, not broadcast. Parcels keep `findingBody`. |
| Presence (§4 of `design.md`) | five states | nine states (code) | Presence is owned by D1; listed here only for §5.2. |

### 6.3 New keys, Arabic (drafted, needs native review) and English

All new keys go in `src/copy.ts` under new section comments: `// quote (WP08)`, `// realtime (WP09)`, `// dispatch (WP10)`.

Collision check (run on this revision, `grep -nE "^\s*KEY:" src/copy.ts` for every key in §6.3 and §6.4): no new key name exists in either language block. Near-name checked: `err_route_unavailable` exists ("تعذّر حساب الطريق. حاول مرة أخرى." / "The road route could not be calculated. Try again."). It means a routing failure, not a prohibited route, so `err_route_blocked` is kept as a separate key. `a_price` exists in both blocks and is replaced in place (listed above), not added.

Quote and booking (D7):

| Key | Arabic (drafted, native review) | English |
|---|---|---|
| `quote_id` | رقم السعر | Price ID |
| `quote_time_note` | الوقت تقديري وليس مضموناً. | Time is an estimate, not a guarantee. |
| `quote_eta_band` | يصل السائق خلال {lo}–{hi} د تقريباً | Driver arrives in about {lo}–{hi} min |
| `quote_eta_arrival` | الوصول خلال {lo}–{hi} د تقريباً | Arrival in about {lo}–{hi} min |
| `quote_eta_open` | قد يتجاوز الوقت هذا النطاق بسبب الطريق والحواجز. | Road and checkpoint delays can push it past this range. |
| `quote_eta_estimate` | تقدير تقريبي: بيانات الطريق غير مؤكدة لهذا المسار. | Rough estimate: road data is not confirmed for this route. |
| `quote_breakdown` | تفاصيل السعر | Price details |
| `quote_distance_time` | المسافة والوقت | Distance and time |
| `quote_rounding` | تقريب إلى الشيكل الكامل | Rounded to the whole shekel |
| `quote_total_cash` | المجموع نقداً للسائق | Total, cash to driver |
| `quote_held` | السعر محجوز {t} | Price held for {t} |
| `quote_unchanged` | لم يتغير السعر · محجوز {t} | Price unchanged · held for {t} |
| `quote_changed_title` | تغيّر السعر قبل الطلب | The price changed before you ordered |
| `quote_changed_body` | {reason}. لن نغيّر السعر دون موافقتك. | {reason}. We won't change your price without your approval. |
| `quote_reason_route` | تغيّر المسار | The route changed |
| `quote_reason_tariff` | تغيّرت التعرفة | The tariff changed |
| `quote_reason_road` | تغيّرت حالة الطريق | Road conditions changed |
| `quote_reason_promo` | لم يعد الخصم ينطبق | The discount no longer applies |
| `quote_accept_new` | اقبل السعر الجديد · {p} | Accept new price · {p} |
| `quote_edit` | عدّل الطلب | Edit order |
| `quote_review_first` | راجع التغيير أولاً. | Review the change first. |
| `quote_show_all` | عرض كل التفاصيل | Show all details |
| `quote_route_blocked` | لا نستطيع توصيل هذا المسار الآن. غيّر نقطة الالتقاء أو التسليم. | We can't serve this route now. Change the pickup or drop-off. |
| `err_quote_expired` | انتهت مدة السعر. حدّث السعر قبل الطلب. | This price expired. Refresh it before requesting. |
| `err_quote_changed` | تغيّر السعر قبل الطلب. راجع التغيير ثم اختر. | The price changed before you ordered. Review the change, then choose. |
| `err_route_blocked` | لا نستطيع توصيل هذا المسار الآن. | We can't serve this route right now. |
| `booking_replayed` | طلبك مسجّل من قبل. فتحنا تفاصيله. | Your order was already placed. Opening it. |
| `a_price` (replaces existing) | ترى السعر قبل الطلب. إذا تغيّر الطلب أو التعرفة نعرض لك الفرق، ولا نغيّر سعرك دون موافقتك. | You see the price before you order. If the order or tariff changes, we show the difference and never change your price without your approval. |

Realtime (D8):

| Key | Arabic (drafted, native review) | English |
|---|---|---|
| `rt_reconnecting` | انقطع التحديث المباشر. نعرض آخر حالة معروفة. | Live updates paused. Showing the last known status. |
| `rt_resyncing` | نحدّث الحالة… | Updating status… |
| `rt_synced` | الحالة محدّثة. | Status up to date. |
| `rt_last_update` | آخر تحديث قبل {t} | Last updated {t} ago |
| `rt_pull` | اسحب للتحديث | Pull down to refresh |
| `rt_action_wait` | ننتظر تحديث الحالة قبل هذا الإجراء. | Waiting for the status to update before this action. |
| `rt_driver_changed` | تغيّر السائق. نعرض السائق الحالي. | The driver changed. Showing the current driver. |
| `access_revoked_title` | لم يعد لديك وصول إلى هذا الطلب | You no longer have access to this order |
| `access_revoked_body` | انتهت الجلسة أو أُلغي الوصول. سجّل الدخول من جديد إن لزم. | Your session ended or access was removed. Sign in again if needed. |
| `share_ended` | انتهت مشاركة هذا التتبع. | This tracking link has ended. |
| `push_order_body` | افتح التطبيق لمعرفة الحالة. | Open the app to see the status. |
| `push_offer_title` | طلب جديد | New job |
| `push_offer_body` | لديك عرض جديد. افتح التطبيق للرد. | You have a new offer. Open the app to respond. |
| `notif_permission_hint` | فعّل الإشعارات لتصلك التحديثات. التطبيق يعرض الحالة الحقيقية عند فتحه. | Turn on notifications for updates. The app always shows the real status when you open it. |
| `notif_permission_denied` | الإشعارات متوقفة. ستظهر التحديثات عند فتح التطبيق. | Notifications are off. Updates appear when you open the app. |

Dispatch, customer (D9):

| Key | Arabic (drafted, native review) | English |
|---|---|---|
| `finding_ride_body` | نرسل طلبك لسائق قريب واحداً تلو الآخر. ستظهر بيانات السائق عند القبول. | We send your request to one nearby driver at a time. Driver details appear once one accepts. |
| `search_waiting_reply` | بانتظار رد السائق | Waiting for the driver to reply |
| `search_sending` | نرسل الطلب إلى سائق قريب | Sending to a nearby driver |
| `search_remaining` | باقٍ {t} من البحث | {t} left to find a driver |
| `search_retry_keeps` | نُبقي السعر والمسار كما هما. | Price and route stay the same. |
| `search_schedule` | جدولة الطلب | Schedule it |
| `search_attempt_announce` | المحاولة {n} من {total} | Attempt {n} of {total} |
| `offer_rides_direct` | طلبات الرحلات تصلك كعرض مباشر، ولا تظهر هنا للقبول. | Ride requests come to you as a direct offer, not in this list. |

Dispatch, driver (D10):

| Key | Arabic (drafted, native review) | English |
|---|---|---|
| `offer_declined` | تم تجاهل العرض. | Offer declined. |
| `offer_checking` | نتحقق من قبول العرض… | Checking your acceptance… |
| `offer_assigned` | الطلب لك الآن | This job is yours now |
| `offer_unknown` | لم نتمكن من تأكيد القبول بعد. نعيد تحميل الطلب. | We couldn't confirm your acceptance yet. Reloading the job. |
| `offer_closed_presence` | أوقفت الاتصال، فأُغلق العرض. | You went offline, so the offer closed. |
| `offer_closed_stale` | موقعك غير محدّث، فأُغلق العرض. | Your location is out of date, so the offer closed. |
| `offer_pickup_eta` | {km} كم · {min} د للوصول إلى الاستلام | {km} km · {min} min to pickup |

Count: new keys are listed in §6.3 (D7, D8, D9, D10 tables) and §6.4 (carried from `design.md`). The exact count and a mechanical check that every §6.3 and §6.4 key is absent from `src/copy.ts` are in the validation output for this revision. `a_price` is replaced in place (§6.2), not added.

Arabic is Modern Standard Arabic, matching `src/copy.ts`. Each Arabic line in these tables is drafted and needs review by a native speaker before release (O5 in `design.md`). The phrase "الطلب لك الآن" and the verbs of acceptance and declining are the most likely to need a native check.

### 6.4 Design-packet keys carried into `src/copy.ts` (new)

These come from `design.md` §12 as proposals. They are not in `src/copy.ts` yet, so they are new keys. Arabic is drafted and needs native review, as §6.3.

| Key | Arabic (drafted, native review) | English | Used in |
|---|---|---|---|
| `quote_expired` | انتهت مدة السعر. حدّث السعر قبل الطلب. | This price expired. Refresh it before requesting. | §3.2 footer |
| `quote_refresh` | حدّث السعر | Refresh price | §3.2 footer |
| `quote_previous` | السابق | Previous | §3.2 struck-through total |
| `offer_open` | العرض مفتوح {t} | Offer open for {t} | §5.2 lease line |
| `offer_timed_out` | انتهى وقت هذا العرض | This offer timed out | §5.2, §5.3 row 4 |
| `offer_accept_price` | قبول · ₪{p} | Accept · ₪{p} | §5.2 accept button |
| `offer_decline` | تجاهل | Decline | §5.2 decline button |
| `search_round` | المحاولة {n} من {total} · نرسل الطلب لسائق واحد في كل مرة | Attempt {n} of {total} · we send it to one driver at a time | §5.1 round text |
| `search_none_title` | لم نجد سائقاً الآن | No driver available right now | §5.1 terminal title |
| `search_none_body` | جرّب مرة أخرى أو جدول الطلب لوقت لاحق. | Try again or schedule it for later. | §5.1 terminal body |
| `search_again` | ابحث مرة أخرى | Search again | §5.1 terminal primary action |

The `{total}` placeholder is new: `design.md` §12 hard-coded "3". §5.1 takes the value from the server (`dispatch.maxRounds`).

## 7. Packets

Each packet owns the files listed. Packets run in this order: D7 → D8 → D9 → D10. D10 needs D1 (presence) live. D7 supersedes the quote parts of D2 in `design.md`. D9 and D10 supersede the lease and search parts of D3.

| Packet | Scope | Files (owned) | Shared components added (one packet each) | Blocked on |
|---|---|---|---|---|
| D7 Quote v2 (WP08) | footer states, breakdown sheet, ETA band, change-quote consent, expired refresh, error card above footer | `src/app/book.tsx`, `src/money.ts` (new), `src/quote-view.tsx` (new), `src/copy.ts` (quote keys) | `Countdown` (`mm:ss`, announcements at 60/20/0), `MoneyLine` (minor-unit row) | §8.1 |
| D8 Realtime states (WP09) | connection note, gap resync, stale/offline, revoked access card, push deep-link handling | `src/app/order/[id].tsx` (status area only), `src/api.ts` (live hook events, read-only states), `src/realtime-note.tsx` (new), `src/copy.ts` (realtime keys) | `ConnectionNote`, `StateCard` (shared with D1, D2, D6 in `design.md`; this packet adds it if D1 has not) | §8.2 |
| D9 Customer dispatch (WP10) | search rounds, deadline bar, terminal no-driver state, hide ride "Driver offers" | `src/app/order/[id].tsx` (searching branch only), `src/dispatch-view.tsx` (new), `src/copy.ts` (customer dispatch keys) | `RoundTrack`, `DeadlineBar` | §8.3 (customer part) |
| D10 Driver offer and atomic accept (WP10) | offer card with `LeaseBar`, decline, accept states, ride-not-in-list line | `src/app/driver/index.tsx`, `src/driver-offer.tsx` (new), `src/copy.ts` (driver offer keys) | `LeaseBar` (`design.md` §13 names it for D3; this packet implements it here if D3 has not) | §8.3 (driver part), D1 |

Feature flags: `quote_v2`, `realtime_states`, `dispatch_instant`. Each off = the current behaviour, byte for byte in the user path.

## 8. Backend fields each element is blocked on

Element names match this document. "Exists" means present in the current code.

### 8.1 WP08 quotes

| Element | Needed field or response | Exists now? |
|---|---|---|
| Footer total | `quote.totalMinor` (ILS minor units) and `quote.payableWhole` | No: `PriceQuote.price` is a whole number |
| Countdown and track | `quote.id`, `quote.expiresInMs` (remaining at response time), `serverTime` | No |
| Breakdown lines | `quote.lines[] = {key, labelKey, amountMinor, sign}` (keys from §6.3; customer lines only) and `quote.roundingMinor` | No |
| ETA band | `quote.eta = {lowMin, highMin|null, basis: 'road'|'estimated'}` (`highMin` null = open-ended, band ≥5 min) | Partial: `minutes`, `estimated`, `slow`, `closed` |
| Change consent | `409 quote_changed` body with `quote` (new ID) and `changes[] = {kind, reason, from, to}` | No |
| Expired refresh | `POST /api/price` returns new quote; same total flag `unchanged: true` | Partial: no flag |
| Submit with quote | `POST /api/orders` accepts `quoteId`; `409 quote_expired`; replay returns committed order with `replayed: true` | No |
| Route refusal | `503 route_blocked` (or `409 route_blocked`; choose one, see O-list B1) | No |
| Versions | `quote.versions = {tariff, routing, restriction}` (required by `plan` §08 quote table; shown only in support, not in UI) | No |

### 8.2 WP09 realtime and notifications

| Element | Needed field | Exists now? |
|---|---|---|
| Gap detection | `event.sequence` (per order) and `event.assignmentEpoch` | No |
| Snapshot authority | `serverTime` and `version` on `GET /api/orders/:id` | No |
| Connection state | `realtime.state` from the live transport (Web PubSub connection state or long-poll state) | Partial: long-poll only (`useLiveFix`) |
| Driver change | `driverChanged` plus new `assignmentEpoch` | Partial: `driverChanged` exists |
| Revocation | `401 unauthorized` (exists), `404 not_found` (exists), share link `share_ended` response (`/api/track/:token`) | Partial |
| Device registration | `device.status` (registered / unregistered / denied) and `deviceToken` lifecycle | No: Expo push not yet registered |
| Push deep link | notification `data.targetId`, `data.kind` (no PII) | Partial: `push.ts` kinds exist |
| Notification receipt | provider receipt ID, `attempt` (for support, not UI) | No |

### 8.3 WP10 dispatch

| Element | Needed field | Exists now? |
|---|---|---|
| Search state | `order.dispatch = {state: 'searching'|'exhausted'|'assigned', round, maxRounds, deadlineInMs, exhaustedReason: 'no_driver'|'deadline'|null}` | No |
| Round track | `dispatch.round`, `dispatch.maxRounds` (server value, default 3) | No |
| Customer offers card | `order.offers` already exists; server must return it empty for `dispatch_instant` rides | Partial |
| Retry | `POST /api/orders/:id/dispatch/retry` returns the order with `dispatch.state='searching'` and a new 3-round set; no price change | No |
| Driver offer | `GET /jobs` returns `offer = {id, leaseExpiresInMs, earn, pickupEtaSec, km, state}` for this driver only | No |
| Accept | `POST /jobs/:id/accept` body `{offerId, leaseNonce, requestId}` (current body is empty) | No |
| Decline | `POST /offers/:id/decline` with `requestId` | No |
| Conflicts | `409 already_taken`, `409 offer_expired`, `409 blocked_exclusive`, `409 blocked_parcels`, `409 presence_changed` | Partial: `already_taken`, `blocked_*` exist, `offer_expired` and `presence_changed` do not |
| Presence close | `offer.state = 'closed_presence'` when presence leaves `online` | No |

### 8.4 What the design does without these fields

- No field: the element is not shown. No invented values (`design.md` O1).
- No quote ID: no countdown; the screen keeps today's footer.
- No dispatch fields: the search card keeps the current Radar, with the current copy, and the "Driver offers" card stays hidden only if the flag is on.
- No `offer` field: the driver sees no offer card; the list shows the §5.4 line only when the flag is on.

## 9. Decisions needed (owner: backend, product, finance)

These are not blocking the design, but each changes a screen. Each has a recommended default that the design uses.

| # | Question | Default used in this design | Owner |
|---|---|---|---|
| B1 | Route refusal status: `503` or `409`? | `409 route_blocked` (consistent with other business refusals) | backend |
| B2 | Does a retry after an exhausted search keep the same order ID? | Yes, same order, new 3 rounds, same price (§5.1) | backend, product |
| B3 | Does a declined driver get offered the same ride again in a later round? | No, the same driver is skipped for that order (no penalty copy) | product |
| B4 | Are ride requests removed from the driver list entirely under `dispatch_instant`? | Yes, shown as a line (§5.4) | product |
| B5 | Change consent: can the customer accept a new quote after the form changed? | No: a form change creates a new quote; consent is only for the quote shown | product |
| O4 | Is there a charge for an unsuccessful search? | Not written. Terminal copy has no charge statement | finance |
| O5 | Arabic copy review | Required before release (§6.3) | native reviewer |
| O6 | Grey Accept look in `ar/driver-jobs.png` | Reason line is the disabled signal; live offers never grey | design, verified on device |
| O7 | Thresholds 8 s and 30 s for connection states | UI defaults in §4.1 | design, to make configurable |

## 10. Verification each packet must pass

- `npm run lint` and `npx tsc --noEmit` before the packet is done.
- `npm test`: tests that count elements on booking, driver and order screens need their help cards dismissed (handoff note).
- `npm run screens` after each UI change. Add these states (ar and en):
  - D7: booking `pricing`, `held`, `expired`, `changed` sheet, breakdown sheet with agorot lines, ETA estimate wording;
  - D8: order `reconnecting`, `stale`, `revoked`;
  - D9: customer search round 2, terminal no-driver, ride without "Driver offers" card;
  - D10: driver offer live (lease bar at mid), timed out, accept `checking`, `already_taken`.
  Read each new PNG with the Read tool.
- Check the Arabic captures for: bidi order of codes and times inside sentences, countdown digits LTR, truncation at font scale 1.3, flip of directional icons only (chevrons, send), no flip of logo, pin, phone, checkmark.
- Device pass (native gate, not a screenshot):
  - Android and iOS, light mode and reduced motion;
  - TalkBack and VoiceOver reading the countdown only at 60, 20, 0 s;
  - focus moves to the consent sheet title when it opens and back to the footer CTA on close;
  - haptics fire once per committed action (accept, confirm new price, refresh with change), never on ticks;
  - push tap opens the correct screen and shows the snapshot, not the payload;
  - logout clears the previous account's order from screen and from the device token.

## 11. Changed files

- `docs/implementation/design-wp08-wp10.md` (this file, new).

No `src/`, `server/`, `docs/screens/`, config or dependency file was changed. No commit, push, deploy, or paid resource was used. The earlier `design.md` was read and is not edited; the corrections are listed in §6.2 and should be applied to it when D7 starts.
