# Client app review (routes, UI, GPS, copy, platform splits)

## Verdict

The client is unusually disciplined where it matters most: the booking command is persisted before it is sent and replayed with one request id, every poll aborts on blur/unmount, GPS watches are consent-gated and torn down, and copy has no key drift (checked mechanically). The real risk is concentrated in admin money surfaces (prices, cash, credits, subscriptions) that commit on a single unconfirmed tap, and in the booking retry being a one-way door that can leave a customer permanently unable to book. No P0 found; one P1 (silent zero pricing) and five P2s.

## Findings

### [P1] Admin pricing saves `0` for any field left blank — silently, for every future order
- Where: `src/app/admin/settings.tsx:20`, `src/app/admin/settings.tsx:30`, `src/app/admin/settings.tsx:46-48`
- Code:
  ```tsx
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(me!.settings).map(([k, v]) => [k, String(v)])));
  ...
  await api('/admin/settings', Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typedNumber(v)])));
  ...
  {group.keys.map(key => <Field key={key} keyboardType="decimal-pad"
    label={`${c[`set_${key}`]}${fractionSettings.includes(key) ? ` (${Math.round(typedNumber(values[key]) * 100) || 0}%)` : ' ₪'}`}
    value={values[key]} onChangeText={text => setValues(v => ({ ...v, [key]: text }))} />)}
  ```
  with `export const typedNumber = (text: string) => Number(latinDigits(text.trim()).replace(/[٫,]/, '.'));` (`src/model.ts:234`) so `typedNumber('') === 0`.
- Why it matters: the field has no `error`, no required check, and the Save button is always enabled. The server's only floor is `n < 0` (`server/main.ts:2688`), so an empty string is a valid price of zero. The whole form is posted at once, and the screen then says "Saved".
- Failure scenario: an admin taps `parcelPrice`, clears it to retype, is interrupted (call, second admin, notification), and taps Save. Every parcel booked afterwards is quoted ₪0 until someone notices the revenue graph. No error, no confirm, nothing in the UI shows which field changed.
- Fix: block the save when any value is empty or not a positive finite number, and surface it per field:
  ```tsx
  const bad = Object.keys(values).filter(k => !values[k].trim() || !Number.isFinite(typedNumber(values[k])));
  if (bad.length) { setError(c.setting_number_required); return; }   // and pass error={bad.includes(key) ? ... : undefined}
  ```
  Server side, reject `n <= 0` for the price keys (keep 0 legal only for `commission*` if that is intentional).
- Confidence: HIGH (traced client → server validation → price computation).

### [P2] A saved pending booking is a one-way door: everything is locked and nothing discards it
- Where: `src/app/book.tsx:67`, `src/app/book.tsx:252`, `src/app/book.tsx:279-280`
- Code:
  ```tsx
  const locked = busy || !!pending || !ready || locating || !available;
  ...
  try { await storage.set(pendingKey, null, true); setPending(null); }
  ...
  {pending && <Card tone="clay"><Txt variant="title">{c.bookingPending}</Txt><Txt variant="caption">{c.bookingRetryHint}</Txt>
  ```
  `bookingRetryHint` = "Confirm this same request before starting a new one."
- Why it matters: `locked` freezes every field, the service switcher (`disabled={busy || !!pending || ...}`, line 292), both city pickers (`open={picker !== null && !locked}`, line 463), the promo controls and the slot choices. `setPending(null)` exists only on a terminal 4xx (line 252). There is no "start over". The pending record is stored under `booking.<userId>` and `forget()` only clears `token` (`src/session.tsx:49`), so signing out and back in restores the same frozen request.
- Failure scenario: customer taps Request in a dead zone → "saved on your device". They then notice the drop-off note is wrong (or the recipient phone). The form is frozen; the only way to book the correct address is to submit the wrong booking, wait for the order screen, and cancel it — creating a real order and a cancellation, or reinstalling the app.
- Fix: a ghost "Discard this request" button under the pending card: `onPress={() => { void storage.set(pendingKey, null, true).catch(() => {}); setPending(null); }}`. Keep the payload frozen while it is being retried, but let the customer abandon it.
- Confidence: HIGH (traced every control's `disabled`/`open` condition).

### [P2] One corrupt pending record deadlocks the booking screen for that account, permanently
- Where: `src/app/book.tsx:123-124`, `src/app/book.tsx:155`; validation in `src/booking.ts:64-82`
- Code:
  ```tsx
  storage.get(pendingKey).then(async saved => {
    const existing = readBooking(saved);      // throws on JSON.parse / payload mismatch
    ...
  }).catch(() => { if (mounted) setError(c.bookingStorageError); });
  ```
  `readBooking` throws `invalid_pending_booking` when e.g. `p.shared !== false` or `option` is no longer in `optionsFor(service)` (`booking.ts:68-79`).
- Why it matters: the catch sets an error but never `setReady(true)` and never deletes the key. `ready` false → `locked` true → all fields disabled, Request disabled with `requestReason = c.form_loading` ("Loading your request.") forever. `c.bookingStorageError` says "Try again", but nothing on screen retries the read.
- Failure scenario: ship an update that tightens `BookingPayload` (or a partial keychain write, or a read before first unlock after reboot). The customer opens Book, sees a form they cannot touch with a Help button. Leave/re-enter, sign out and back in — same user id, same key, same throw. Only a reinstall or clearing app data clears it.
- Fix: treat an unreadable pending as "no pending":
  ```tsx
  } catch { if (mounted) { void storage.set(pendingKey, null).catch(() => {}); setReady(true); setError(c.bookingStorageError); } }
  ```
- Confidence: HIGH (the catch has no recovery; `readBooking` throws deterministically).

### [P2] Admin money and destructive actions commit on one tap, without the `confirm()` the app uses elsewhere
- Where: `src/app/admin/cash.tsx:23-33` + `:61-64`, `src/app/admin/orders.tsx:95-101` + `:119-121`, `src/app/admin/users.tsx:111-112`
- Code:
  ```tsx
  <Button title={open.kind === 'remittance' ? c.cashRecord : c.cashAdjust} ... onPress={submit} />
  ...
  await api(`/admin/disputes/${id}/resolve`, { resolution: drafts[id].trim(), ...(credit != null && { creditShekels: credit }) });
  ...
  onPress={() => action(user, '', { status: user.status === 'blocked' ? ... : 'blocked' }, 'PATCH')}
  ```
  (Cancel, delete-user, delete-account, promo-deactivate and driver-side dispute all do use `confirm(...)`.)
- Why it matters: recording a cash handover settles a driver's debt, a dispute credit mints a promo code, and blocking a driver mid-shift strands their parcels. Each is a single tap on a control next to another (`cashRecord`/`cashAdjust`, `activate`/`reject`), with no dialog and no amount cap (`Math.round(typedNumber(text) * 100)`).
- Failure scenario: cashier means ₪50, the prefilled `owed` value is edited to `500`, taps Record → the ledger says the driver paid ₪500; the driver's balance drops and the real debt is discovered days later. Same shape for a mistyped dispute credit (grants real money).
- Fix: `confirm(fill(c.cashConfirm, { name: row.name, amount: money(cents(open.amount) / 100) }), submit, c.cashRecord, c.cancel)` for both cash kinds, `confirm(...)` around the dispute resolve, and cap remittance at `row.owedCents - row.pendingCents`.
- Confidence: HIGH.

### [P2] Subscription Activate/Reject can both be in flight for the same row
- Where: `src/app/admin/subscriptions.tsx:15-25`, `src/app/admin/subscriptions.tsx:43-46`
- Code:
  ```tsx
  async function decide(sub: Subscription, action: 'activate' | 'reject') {
    setBusy(`${sub.id}${action}`);          // no `if (busy) return`, no per-row lock
  ...
  <Button title={c.activate} loading={busy === `${sub.id}activate`} onPress={() => decide(sub, 'activate')} />
  <Button title={c.reject} variant="danger" loading={busy === `${sub.id}reject`} onPress={() => decide(sub, 'reject')} />
  ```
- Why it matters: `loading` does not disable a `Button` (`ui.tsx:249` disables on `disabled || loading`, and these pass neither), and `decide` has no in-flight guard. A subscription is a payment decision; the two contradictory decisions race.
- Failure scenario: admin taps Activate; the 30 s poll keeps showing "pending", so they tap Reject. Both requests land; whichever is last wins. A customer who paid is rejected (or a rejection is silently activated), and nothing in the audit trail records that the admin did both.
- Fix: `if (busy) return;` at the top of `decide` and `disabled={!!busy}` on both buttons.
- Confidence: HIGH.

### [P2] Large OS text scale clips every piece of text (fixed `lineHeight` on all variants)
- Where: `src/ui.tsx:166-174`
- Code:
  ```tsx
  const textVariants = {
    h1: { fontSize: 21, lineHeight: 28, fontWeight: '800', color: palette.ink },
    h2: { fontSize: 17, lineHeight: 24, ... },
    title: { fontSize: 15, lineHeight: 21, ... },
    body: { fontSize: 14, lineHeight: 21, ... },
    label: { fontSize: 13, lineHeight: 18, ... },
    caption: { fontSize: 12, lineHeight: 17, ... },
    micro: { fontSize: 11, lineHeight: 15, ... },
  }
  ```
  No `maxFontSizeMultiplier` anywhere in `src/` (grep: 0 hits).
- Why it matters: RN multiplies `fontSize` by the OS font scale but uses `lineHeight` as given, so at 130–200% the glyph box is taller than the line box and Arabic (taller ascenders/descenders than Latin) is clipped top and bottom. Rows that also use `numberOfLines={1}` (`OrderRow`, `ListRow`, tab labels, price rows) truncate horizontally too.
- Failure scenario: an older customer sets system text to 150%: on the Orders tab the route line loses its Arabic diacritics/descenders, the price and the status badge are shaved at the top, and the `W-00042` code line clips — the app reads as broken at exactly the setting the target audience uses.
- Fix: drop `lineHeight` from `textVariants` (the platform's default tracks the scaled font), or scale it:
  ```tsx
  const { fontScale } = useWindowDimensions();
  lineHeight: Math.round(base * 1.35 * Math.min(fontScale, 2))
  ```
  and let one-line rows wrap above ~1.3 (`numberOfLines={fontScale > 1.3 ? 2 : 1}`).
- Confidence: MEDIUM (mechanism is certain on iOS/Android RN; the exact clip amount needs a device with the setting at 150%).

### [P3] A push tapped at cold start loses its deep link
- Where: `src/native-push.ts:14-17`
- Code:
  ```ts
  Notifications.addNotificationResponseReceivedListener(response => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  });
  ```
  No `getLastNotificationResponseAsync()` / `useLastNotificationResponse` anywhere in `src/` (grep: 0 hits).
- Why it matters: the response that *launched* the app is not delivered to a listener registered after startup, so the only path that handles a tap is one received while the app is already running.
- Failure scenario: driver's phone is locked, app killed; "New job" arrives (300 s TTL); they tap it; the app opens on the Jobs tab instead of `/order/<id>` — they still see the card, but a customer's "driver assigned" tap lands on Home with no obvious next step.
- Fix: after mount, once:
  ```ts
  const last = await Notifications.getLastNotificationResponseAsync();
  if (last) handle(last);
  ```
  reusing the same `startsWith('/')` guard and a `useRef` so it fires once.
- Confidence: HIGH (API absent).

### [P3] The driver work provider re-renders every consumer every 3 s and reads secure storage each tick
- Where: `src/driver-work.tsx:312-314`, `src/driver-work.tsx:321`, `src/driver-work.tsx:328`
- Code:
  ```tsx
  const status = () => backgroundLocationState().then(value => {
    if (!cancelled) setTrackingResult({ actor, orderId: nativeOrderId, value });
  }).catch(() => {});
  ...
  const timer = setInterval(status, 3_000);
  ...
  return <Context.Provider value={{ order, orders, known: ..., tracking, ... }}>{children}</Context.Provider>;
  ```
- Why it matters: a fresh object is set every 3 s even when `value` is unchanged, and the context value is rebuilt inline on every render, so all consumers (jobs list, trips, order screen and its map) re-render 20×/min during a delivery. Each tick also does two `SecureStore.getItemAsync` + `JSON.parse` + a native `hasStartedLocationUpdatesAsync` (`background-location.ts:108-114`).
- Failure scenario: a 40-minute delivery = ~800 ticks; the live order screen and its map re-render while the phone is already encoding GPS at 3 s and running the foreground service — frame drops and avoidable battery on the exact screen the driver stares at.
- Fix: bail out on an unchanged value (`setTrackingResult(prev => prev && prev.actor === actor && prev.orderId === nativeOrderId && prev.value === value ? prev : { ... })`) and poll every 10 s; `backgroundLocationState` already treats a receipt younger than 60 s as "sharing".
- Confidence: HIGH for the re-render, MEDIUM for the measured battery impact.

### [P3] `scheduleSlots()` (≈227 `Intl` format calls) runs on every keystroke
- Where: `src/app/book.tsx:60` (also `src/app/order/[id].tsx:180,182`)
- Code:
  ```tsx
  const slots = scheduleSlots();     // loops ~331 half-hours, each with Intl.DateTimeFormat.formatToParts
  ```
  (`src/booking.ts:92-101`)
- Why it matters: the whole booking screen re-renders on every character typed in any of the controlled `Field`s, and `scheduleSlots` is recomputed each time; measured ~1.4 ms per call on desktop Node, several times that on a low-end Android in Hermes, per keypress.
- Failure scenario: typing a 40-character landmark on a cheap Android drops a frame per key; on the order screen the reschedule picker rebuilds the same array twice per render.
- Fix: `const slots = useMemo(() => scheduleSlots(), []);` (the "sat open past the slot" case is already handled by the `Date.now()` check at submit, line 208).
- Confidence: HIGH (measurement + React re-render path).

### [P3] Arabic strings and "Palestine" live outside `copy.ts`
- Where: `src/ui.tsx:287`, `src/ui.tsx:291`, `src/app/order/[id].tsx:32`
- Code:
  ```tsx
  accessibilityLabel={`${language === 'ar' ? 'إنقاص' : 'Decrease'} ${label}`}
  accessibilityLabel={`${language === 'ar' ? 'زيادة' : 'Increase'} ${label}`}
  ...
  const q = encodeURIComponent(`${landmark}, ${place}, فلسطين`);
  ```
- Why it matters: the translation pipeline and the copy review only see `copy.ts`; these two a11y labels are assembled inline (so they also cannot use the name/word-order rules the file follows), and `openMaps` hardcodes the country for every landmark search.
- Failure scenario: the Arabic wording for the stepper is changed in `copy.ts` during a copy pass but the screen-reader label keeps the old wording; a search for a landmark in a border town always appends فلسطين, which can bias the maps result to the wrong side.
- Fix: add `stepperDecrease` / `stepperIncrease` keys and use `fill(c.stepperDecrease, { label })`; use a `c.country` key (or drop the suffix and rely on the city) in `openMaps`.
- Confidence: HIGH (both strings are literal).

### [P3] "Use my location" silently wipes the landmark the customer typed
- Where: `src/app/book.tsx:111`, `src/app/book.tsx:453`, `src/app/book.tsx:456`
- Code:
  ```tsx
  if (result.city !== pickupCity) setPickupNote('');
  ...
  if (near !== pickupCity) setPickupNote('');
  ...
  if (near !== dropoffCity) setDropoffNote('');
  ```
- Why it matters: "the landmark belongs to its place" is defensible, but nothing tells the user their sentence disappeared — and `servedCity` flips on a city boundary, which is exactly where a GPS fix near the edge lands.
- Failure scenario: customer types "Al-Manara building, 3rd floor", taps "Use my location"; the fix resolves to Al-Bireh instead of Ramallah; the note vanishes. Submit then fails with "field required" and they retype, not knowing why.
- Fix: keep the text (the server prices by points/cities, not the note) or, if clearing is required, set the existing `locationError` caption: `setLocationError(fill(c.noteCleared, { city: city(result.city)[language] }))` next to the field.
- Confidence: HIGH.

### [P3] Booking freshness is validated on a different time than the one submitted
- Where: `src/app/book.tsx:208`, `src/app/book.tsx:232`
- Code:
  ```tsx
  if (!pending && scheduledFor !== null && scheduledFor < Date.now() + 60 * 60_000) { haptic.error(); setSlot(null); ... return; }
  ...
  const command = pending ?? newBooking({ ... ...(scheduledFor !== null && { scheduledFor }) });
  ```
- Why it matters: `scheduledFor` is derived from the form (`when`/`chosen`), while a retry sends the **pending payload's** time. The two diverge as soon as the customer touches the time controls or `setSlot(null)` runs.
- Failure scenario: a scheduled booking lost its acknowledgement overnight. Next morning they tap Continue: `slot` is null → `chosen = slots[0]` (valid, +1 h) → the guard passes → the body carries yesterday's `scheduledFor` → server rejects `invalid_schedule` → the 4xx clears the pending (line 251) and the customer loses the whole request with a generic error. Worse on the 429/5xx branch, which keeps the stale pending.
- Fix: validate exactly what will be sent (`const sendAt = pending?.payload.scheduledFor ?? scheduledFor;`) and, when a pending's slot has passed, offer "choose a new time" (drop the pending's `scheduledFor`) instead of only erroring.
- Confidence: HIGH (two different values, one guard).

## Suspicions (unverified)

- `expo-notifications` is added with no Android `icon`/`color`/`defaultChannel` (`app.config.js:49`): heads-up notifications likely show a white square and land on the default channel (no importance control). Needs a device to confirm.
- `eas.json` defines `submit.pilot` but no `build.pilot` profile, so `eas build --profile pilot` fails; `submit.production` is an empty object while `build.production` pins `environment: production` — verify the release runbook still matches.
- `src/app/profile.tsx:107-122`: a **verified** email can never be changed in-app (the change control only renders in the `!emailVerifiedAt` branch), though the server supports `POST /me/email`. May be intentional; worth a product decision.
- `src/app/admin/settings.tsx:30` posts every setting at once, so two admins editing different fields overwrite each other (last write wins). Not traced to a real incident.
- `src/app/admin/users.tsx:34` runs the recursive `action(...)` from inside the `catch` on web (`window.confirm` is synchronous), so the outer `finally` clears `busy` while the retry is still in flight — a fast second tap there is possible.
- `driver-work.tsx:219-226`: on `watchPositionAsync` rejection it calls `stopPresence()` and sets `unavailable`, but the 15 s `getCurrentPositionAsync` retry timer is created *before* the async failure and only cleared on effect cleanup — harmless today, but it keeps a High-accuracy fix every 15 s after a provider failure if the state does not change (three states do change it).
- `src/app/book.tsx:84` `api<Road[]>('/roads')` is fetched on every Book mount to show checkpoint alerts; a customer who opens Book from four entry points re-fetches each time (no cache), and the alert card is the only consumer.
- `src/app/admin/index.tsx:89` `useState(daily.length - 1)`: the server always returns 14 buckets today (`server/main.ts:2514`), so no crash; a future stats change to an empty array would throw on `daily[selected].date`.

## What I checked and found clean

- `npx tsc --noEmit` and `npx expo lint` both pass with no output.
- Working-tree delta (`server/*`, `tests/outbox.mjs`) does not touch `src/`; it adds `destination_*` to `PUSH_KINDS`/`URGENT_KINDS` and routes webpush through `validate()` — I compared `validate()` (`server/worker.ts:72-92`) line by line with the code it replaced in `subscription()`: user active, kind allow-list, `/admin`+`/driver` path role checks, TTL, assignment epoch, searching/scheduled window, participant and terminal-status guards are all present, so webpush behaviour is preserved; the test now asserts every `PUSH_KINDS` kind reaches `delivered`. No client regression from the delta.
- Copy parity, checked mechanically: 886 keys in `ar`, `en` typed as `Copy` (tsc), **zero** missing keys and **zero** dead keys across all `c.foo` / `c['foo']` / template-literal usages; every dynamic family resolves for every value the UI can produce (`road_*`, `advance_*` only for reachable statuses, `safety_*`, `reason_*`, `pickup_*`, `place_*`, `next_*`, `driver_*`, `<status>_ride`, `vehicle`, `entry_*`).
- `api-client.request`: 20 s timeout, caller `AbortSignal` wired and removed, a stale token/revision rejects the reply *before* any state write, 401 only signs out on the server's `unauthorized`, Date-header clock offset guarded by round-trip time.
- `useApi`: focus-gated, pauses on background, backs off, stops on terminal codes (401/403/404/session_changed/aborted), ignores stale responses via generation + path, no setState after blur.
- `useLiveFix`: aborts the held request on blur, no radio use in the background, backoff, resets on path (driver) change, `stopped` guard before every setState.
- `customer-location.findPickup`: abort + timeout cover the permission prompt *and* the watch; a watch that resolves after the timeout is removed immediately; fixes must be <30 s old and ≤100 m accurate and inside a served city.
- `background-location`: the context envelope binds token+actor+order, every await is followed by a generation/token re-check, a task that runs with no JS authority deletes the context and stops updates, fixes are 3 s only while an active order exists, `killServiceOnDestroy: false` is deliberate.
- `driver-work`: every effect removes its watch/interval; presence is explicit-consent only, nothing starts on mount, it stops on background and when an order starts; foreground permission is requested only from a user action.
- `session`: token in `SecureStore` (`AFTER_FIRST_UNLOCK`) on native, `localStorage` on web with no silent fallback between them; sign-out stops presence + background location, drops web push, unregisters native push; a `/me` reply landing after sign-out cannot restore the session (`setMe(current => current && data)`).
- Platform split: all three map modules export `default`, `canPin`, `PinMap` and `RouteMapProps`; web/native/android each fall back to `RoutePreview` + Retry on failure and never draw a straight pickup→dropoff line; `document`/`window` appear only in web-only modules or behind `Platform.OS`.
- Order screen: no client-trusted price (server re-prices; `quoteId` sends id only), destination change is quote-then-driver-acceptance with an expiry, handover/return codes are LTR with spaced digit a11y labels; every action is guarded by `busy`, and the `accept` path additionally re-checks `apiSessionRevision`/`focusRevision` after the permission step.
- Booking double-submit: `sending` ref + `busy` + `pending` freeze; the command is written before the request and replayed with the same `requestId`; terminal 4xx clears it.
- Track page: 64-hex token validated before any request, only first name/vehicle/cities/status, `not_found` → "link ended", fixes older than 120 s are dropped, stale ones fade.
- Lists & keys: every `map` in the screens I read uses a stable id key; `useOrders` carries older pages across polls and drops an answer for a superseded cursor.
- Touch/a11y: icon-only controls all go through `IconButton`/`Press` with a label; stars, slide dots, chips and stepper keys are ≥44 pt; the progress bar exposes `accessibilityValue`; disabled buttons state their reason in text; status is never colour-only (badge text + pulse + label).
- Confirm dialogs exist for cancel order, driver release, pickup problem, delete user/account, logout, promo deactivate, driver-side cash dispute, and admin order resolve.
