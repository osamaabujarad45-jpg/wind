# CAREEM rider app - static REA reference (MENA super-app)

**Artifact:** `com.careem.acma` v**26.43** (versionCode **264301**)
**Study date:** 2026-11-13 — **Method:** static analysis of a real Play Store build **plus** a
first-run runtime pass on the owner's phone (`SM-A5360`, Android 16) that stops at the login wall.
**Engine:** custom DEX + resource extraction (`dexparse.py`, `aapt2` from `build-tools\36.1.0`),
REA method; no decompiler was needed because the app's own class names survive in plaintext.

> **Why Careem matters to Wind.** Careem is the only artifact in the set that solves Wind's two
> hardest problems at once, in shipped production code, in Arabic:
> **(1) address capture with no street numbers** — map pin + nickname + building type + free-text
> notes + a **photo of the pickup and delivery point**; and **(2) cash as a first-class payment
> instrument with an arrears rule** — a customer who still owes cash cannot book another cash ride.
> Both are directly transferable patterns, and neither is in the Fable handoff.

---

## 1. Artifact identity

| Field | Value | How it was read |
|---|---|---|
| Package | `com.careem.acma` | `aapt2 dump badging` |
| versionName / versionCode | **26.43** / **264301** | `aapt2 dump badging` |
| Base APK size | **85,446,587 bytes (81.49 MiB)** | `Get-ChildItem` |
| Base APK SHA-256 | `B19112D53D3E9A800EF35908FA48AF57816D9F8F81B7A3897A7220F527127F58` | `Get-FileHash` |
| Splits on the device | base + `split_config.arm64_v8a` (2,622,235 B) + `split_config.xxhdpi` (1,305,176 B) | `adb shell pm path` + `adb pull` |
| DEX files | **7** (`classes.dex` … `classes7.dex`, 7.8–13.4 MB each) | ZIP central directory |
| Class count | **73,254** | `dexparse.py` over the 7 DEX files |
| String count | **346,237** | same |
| minSdk / targetSdk | **32 / 36** | `aapt2 dump badging` |
| Permissions declared | **27** (incl. `READ_CONTACTS`, `NFC`, `RECORD_AUDIO`, `USE_BIOMETRIC`, `AD_ID`) | `aapt2 dump permissions` |
| Installed on device | 2026-11-13 03:58 local, first install = last update | `dumpsys package` |
| App name | Careem ("كريم") | `string/app_name` |

For scale: the Wind production APK carries **one** 4.3 MB JavaScript bundle; Careem carries
**73,254 classes across 7 DEX files**. That is not a target to match — it is the reason Careem's
*architecture* is worth reading and its *feature count* is not.

---

## 2. What the runtime pass saw (and where it stops)

`[ran]` on `SM-A5360`, owner's Wi-Fi (validated, 433 Mbps link, 9–19 ms RTT to 8.8.8.8):

1. Location permission prompt → granted.
2. Notification permission prompt → granted.
3. Splash: **"Eat Pay Go"** — the super-app framing, not a ride-hailing app.
4. Login screen: **phone number and Google sign-in only.** No guest browsing, no order without an account.

Everything after step 4 needs an OTP the owner did not authorise receiving, so **no order, fare,
tracking or payment screen was observed**. Every product claim below is therefore from the binary,
not from behaviour, and is labelled as such.

---

## 3. Architecture — a native super-app with a server-driven UI

The class histogram is the architecture:

| Package | Classes | What it is |
|---|---|---|
| `com.careem.identity` | 4,229 | identity: `view` (1,532), `profile` (357), `securityKit` (328), `account` (199), `marketing` (189), `consents` (182), `approve` (142), `signup` (131), `otp` (68), `recovery` (56), `proofOfWork` (48) |
| `com.careem.pay` | 1,898 | Careem Pay: `purchase` (535), `remittances` (262), `sendcredit` (184), `billpayments` (147), `cashout` (59), `topup` (55), `secure3d` (50), `openbanking` (35), `billsplit` (28), `merchantpayment` (13), `crypto` (18) |
| `com.careem.superapp` | 770 | `feature` (571), `featurelib` (112), `checkout` (15), `map` (5) |
| `com.careem.acma` | 717 | the ride-hailing ("ACMA" = Careem's ride-hailing brand): `model` (186), `booking` (104), `chat` (28), `commuterrides` (18), `analytics` (16) |
| `com.careem.motcore` | 614 | shared domain models: `Address`, `LocationInfo`, `Faq`, promo/voucher adapters, `orders/ActiveOrderResponse` |
| `com.careem.subscription` | 491 | Careem Plus (`components` 271, `signup` 51, `cancellation` 12) |
| `com.careem.explore` | 405 | discovery: `location` (84), `payment` (70), `aiassistant` (23), `favorites` (22) |
| `com.careem.auth` | 329 | auth |
| `com.careem.care` | 273 | support: `repo` (165), `miniapp` (89), `csat_feedback`, `support_inbox`, `care_ivr_bottomsheet` |
| `com.careem.quik` | 222 | grocery (Careem Quik) |
| `com.careem.aurora` | 189 | **server-driven UI** — `sdui` (169) |
| `com.careem.ridehail` | 181 | booking state machine |
| `com.careem.donations` | 141 | |
| `com.careem.shops` / `bike` / `kyc` / `chat` / `analytika` | 89 / 56 / 39 / 34 / 32 | |

Supporting stack, counted from the class list: **Retrofit 158**, **OkHttp 439**, **Moshi 45**
(with generated `*JsonAdapter` classes for every DTO), **coroutines 77**, **Compose 72**,
**Molecule 3** (Compose-to-stateMolecule), **WorkManager 1**, **Room 8**, **Braze 1,163**,
**Sentry 741**, **Adjust 224**, **Firebase messaging 4**, **Plotline 15**, **Leanplum 0**.

Three structural ideas are worth copying as *shape*, not code:

1. **`com.careem.aurora.sdui` (169 classes) — the home screen and campaign surfaces are rendered
   from the server.** UI keys such as `MapAndAddress_Form`, `MapAndAddress_SaveAddressButton`,
   `DELIVERY_CATEGORY`, `ADDRESS_BOOK` ship in the binary as a closed vocabulary the server picks
   from. Wind's home screen is hard-coded; a small key registry would let it change copy and
   ordering without a Play Store release.
2. **Booking is a workflow, not an activity.** `com.careem.ridehail.booking` splits the trip into
   `CreateBookingStepWorkflow`, `PickupStepWorkflow`, `DropOffMapStepWorkflow`,
   `EditPickupPostAssignmentStepWorkflow`, `BookingConfirmedWorkflow`, `UnsaveLocationWorkflow`.
   Each step is a class; the state machine is explicit and testable. Wind's booking state lives in
   one component tree.
3. **`com.careem.motcore.common.core.domain.models` is a shared domain layer** (`Address`,
   `LocationInfo`, `Verification`, `orders/ActiveOrderResponse`) used by both the superapp features
   and the ride-hailing feature. Wind's `server/domain` and `src` types are separate copies.

---

## 4. The address model — the finding that matters most

Careem's address capture is a **server-driven form** with 27 shipped component keys
(`[read]` from `dex_strings.txt`, `MapAndAddress_*`):

| Key | What it gives the customer |
|---|---|
| `MapAndAddress_Map`, `_EditMapButton`, `_MapConfirmButton` | pick a point on a map (no street number needed) |
| `_CurrentLocation` | use GPS |
| `_SearchField`, `_MapSearchSheet` | search instead of pin |
| `_NicknameSheet` | name the place ("Home", "Work", custom) |
| `_BuildingType`, `_BuildingTypeDropdown`, `_BuildingTypes` | **a building-type taxonomy** (villa / apartment block / shop / …) |
| `_DeliveryNotes`, `_PickUpNotes` | free-text notes for the driver |
| `_EnableDeliveryInstruction`, `_DisableDeliveryInstruction` | per-address instruction toggle |
| `_AddPickupPhoto`, `_AddDeliveryPhoto`, `_UploadPhoto`, `_TakePhoto`, `_PhotosSheet` | **photograph the entrance / the exact door** |
| `_AddressSummaryBox`, `_ShowMoreButton` | collapse the detail |
| `_SelectAnotherAddressButton`, `_CompleteOrChangeConfirmButton`, `_SaveAddressButton`, `_UpdateAddressButton` | address book actions |

Related keys in the same binary: `ADDRESS_BOOK`, `ADDRESS_DETAILS`, `DELIVERY_IMAGES`,
`PICKUP_IMAGES`, `DELIVERY_INSTRUCTIONS`, `DELIVERY_ADDITIONAL_NOTES`, `PICKUP_POINT`,
`DROPOFF_LOCATION`, `PICKUP_LOCATION`, `addressType`, `addressDetailsField(fieldId=…)`.

**Why this is the pattern Wind needs.** Wind's address capture today is a pin plus a text field.
Careem proves a major operator solved the "no house number" problem by making the *photo* and the
*building type* part of the address, not by improving geocoding. That is a small, local change: add
`buildingType`, `notes`, and one optional photo to the address model, and show the photo to the
driver before arrival.

`com.careem.superapp.feature.addressbook.AddressBookActivity` shows the address book is a **feature
of its own**, not a form inside the booking flow.

---

## 5. Cash is a first-class payment instrument, with an arrears rule

Careem's Arabic copy, shipped in `values-ar` (11,486 Arabic string pairs in the base APK):

| Key | English | Arabic |
|---|---|---|
| `cash` | Cash | **نقدًا** |
| `DETAILED_TOPUP_CASH_OVER_PAYMENT` | Cash | **نقدًا** |
| `cash_only_unsupported_payment_warning_title` | "%1$s only accepts cash" | **«%1$s يقبل الدفع نقدًا فقط»** |
| `cash_only_unsupported_payment_warning_desc` | "All other payment methods will not be available…" | **«لن تتوفر جميع طرق الدفع الأخرى…»** |
| `cash_only_unsupported_payment_warning_prompt` | "This ride only accepts cash" | **«هذه الرحلة تقبل الدفع نقدًا فقط»** |
| `cashBookingNotAllowedMessage` | "You cannot make a cash booking unless you settle your outstanding balance…" | (same meaning, Arabic shipped) |
| `captain_cash_balance_text` | "Captain cash balance" | **«رصيد الكابتن النقدي»** |
| `PURCHASE_CAPTAIN_DEBT_REPAYMENT` | "Cash balance settled" | **«تم تسوية الرصيد النقدي»** |
| `PROMO_CODE_INVALID_SERVICE_TYPE` | "This promo is for cash bookings only…" | **«هذا العرض الترويجي مخصص للحجوزات النقدية فقط…»** |

Two rules are visible in shipped code and both are missing from Wind:

- **Arrears block**: a customer with an unpaid cash balance cannot start another cash booking until
  it is settled (top up the wallet, or switch payment method).
- **Cash-only service**: a service can declare itself cash-only, and the UI states it before booking
  rather than at the door.

Careem also ships a full wallet that *includes* cash: `CashDto`, `CashoutRequest`,
`ReceiveCashoutRequest`, `cashback`, `cashoutTxnId`, `cashOnly INSTRUMENT`, plus `mada` (79),
`visa` (30), `mastercard` (22), `apple_pay` (13), `google_pay` (20) and open banking.
Wind does not need the wallet; it does need the arrears rule and the cash-only label.

---

## 6. The map is behind an interface

`com.careem.superapp.map.core.MapView` / `MapFragment` with a single implementation
`com.careem.superapp.map.google.MapFragmentImpl` / `MapViewImpl`. The rest of the app talks to the
interface; the provider is a build-time choice. There are only **4** direct references to
`com.google.android.gms.maps` in 73,254 classes.

Wind vendors MapLibre directly into `public/map.html` and hard-codes `tiles.openfreemap.org` in
three places (`public/map.html:12,21,169` and the CSP at `server/main.ts:150-159`). Careem's shape —
one interface, one adapter — is the cheap way to make the tile host configurable without a rewrite.

---

## 7. Data collection — what Careem ships that Wind should not

| SDK | Classes | Note |
|---|---|---|
| Braze | 1,163 | engagement/lifecycle messaging, in-app messages |
| Sentry | 741 | crash/error reporting |
| Adjust | 224 | attribution |
| Plotline | 15 | in-app engagement |
| Firebase messaging | 4 | push |
| App measurement (`app-measurement.com`) | present | Google Analytics for Firebase |

Careem also ships `RECORD_AUDIO`, `READ_CONTACTS`, `NFC`, `USE_BIOMETRIC` and
`AD_ID`. This is a super-app's data posture and it is **not** Wind's. Wind should copy the
*product mechanics* in section 4 and 5 and none of this section.

---

## 8. Adopt / skip for Wind

**Adopt (patterns, re-implemented in Wind's own code):**

1. Address = pin + nickname + **building type** + notes + **one photo**, and show the photo to the
   driver. This is the single highest-value change in this file.
2. **Cash arrears rule**: block a new cash booking while a cash balance is outstanding; show the
   balance in the app before the booking, not at the door.
3. **Cash-only / non-cash-only labelling** on the service and the quote screen.
4. Booking as a **step workflow** with named states, so a failed step is retryable and testable.
5. A **small server-driven key registry** for home-screen order and copy, so copy can change without
   a Play Store release.
6. One **map interface** with one adapter, so the tile host and provider are configurable.

**Skip:**

- The super-app breadth (food, groceries, payments, remittances, bills, bike, donations, Careem Plus).
- The wallet/ledger/Careem Pay surface (535 purchase classes alone).
- The analytics stack in section 7.

---

## 9. What is not known

- No order, fare, ETA, tracking, cancellation or payment screen was observed — everything above is
  binary evidence.
- Careem's actual Palestinian pricing, tariffs, take rate and whether it operates in the West Bank at
  all are **not in the artifact**.
- The driver/captain apps (`com.careem.adma`, `com.careem.partner.app`) were not pulled, so the
  offer/accept handshake and captain settlement are unanswered.
- `com.careem.mopengine` (207 classes: `ridehail` 88, `feature` 52, `booking` 50, plus
  `halametropass`, `halashailscan`, `halashailconversion`) is named but not fully mapped; it appears
  to be the booking/experience engine shared across services.

---

## 10. Careem Captain (`com.careem.adma`) — the driver side, acquired later

The rider study above left the captain side unknown. It is now known.

| Field | Value |
|---|---|
| Package | `com.careem.adma` — Play Store listing **"كريم كابتن"** (Careem Captain) |
| versionName / versionCode | **89.70.2** / **89702** |
| Base APK | **157.33 MB** plus `split_config.arm64_v8a` (25.40 MB) and `split_config.xxhdpi` (2.31 MB) |
| SDK | `minSdk 32`, `targetSdk 36`, `compileSdk 37` |
| Strings | **9,762**, of which **8,965 Arabic** (92 %) |
| Acquisition | installed from the phone's Play Store, then `adb pull` of every split |

`[obs]` Note the version-number gap: the rider app is **26.43** and the captain app is **89.70.2**. They are
separate products with separate release trains, not two skins of one build.

### 10.1 The earnings statement is a taxonomy, and it is the useful part

`[obs]` Careem's captain earnings screen is built from named line items, not a single number:

| key | English | Arabic |
|---|---|---|
| `breakdown_bonus` | Bonus | مكافآة |
| `breakdown_tips` | Tips | إكراميات |
| `breakdown_guarantees` | Guarantees | الضمانات |
| `breakdown_fines` | Fines | الغرامات |
| `breakdown_fines_refund` | Fines refund | استرداد الغرامات |
| `breakdown_behavior_penalties` | Behavior penalties | عقوبات السلوك |
| `breakdown_money_in` | Money in | المال الداخل |
| `breakdown_money_out` | Money out | المال الخارج |
| `breakdown_other` | Other | أخرى |
| `breakdown_subtitle` | Understand your earnings | افهم أرباحك |
| `breakdown_matched_tips` | Ramadan tips from Careem | — (English only in this build) |

`[inf]` This is a **signed ledger, per line item, with money-in and money-out sides** — the same shape as an
append-only cash ledger. Wind's driver earnings screen is a summary; Careem's is an explained statement. For a
cash market where a courier's take-home is the whole product promise, `breakdown_*` is the pattern to copy.

### 10.2 The cash-debt model, stated in the copy

`[obs]` Careem lets a captain run a **negative wallet balance** and discourages it with a consequence:

| key | English |
|---|---|
| `balance_card_positive_title` | Available to transfer |
| `balance_card_negative_title` | Negative balance |
| `balance_card_cash_warning` | **"If you go over the limit, you'll get cash blocked"** |
| `TITLE_TOPUP_CAPTAIN_EARNINGS_TRANSFER` / `TOPUP_CAPTAIN_EARNINGS_TRANSFER` | Earnings received (مكاسب مُستلمة) |
| `accelerator_low_balance` / `_desc` | Low balance / "Top up your wallet" |
| `add_payment_method_wallet_number` | Wallet number |
| `add_payment_method_review_title_cash_pickup` | Ready to cash pickup? |

`[inf]` That is a **standing-float model**: the captain holds a wallet, cash collected feeds it, the balance is
transferable, and exceeding a negative limit **blocks further cash jobs**. Wind's model is per-order cash owed
with admin reconciliation. Careem's is a continuous ledger with an automatic consequence. The transferable idea is
the **automatic consequence** — Wind currently notices a debt only when a human reads the cash screen.

### 10.3 Shift, acceptance and arrival mechanics

`[obs]` Shifts are booked, not just switched on: `book_shift` (حجز الوردية), `book_shifts_now`,
`break_left_label` ("break left"), and `blocked_from_going_online` ("Your device is blocked from going online").
`[obs]` Acceptance is scored and gated: `acceptance_rate`, `acceptance_only` ("Minimum of %1$d%% acceptance").
`[obs]` Arrival uses a **customer PIN entered by the captain**: `arrive_at_pickup_button_text` =
**"Enter Customer Pin"** (أدخل رمز العميل), plus `arrive_at_parking_*` for parking-queue airports with a
`Your Queue Number:` display.

`[inf]` The customer PIN at **pickup** is the mirror of Wind's handover code at **delivery**. Careem proves the
recipient-held-secret pattern in this market at the start of the trip, not only at the end.

### 10.4 What to take and what not to

**Take:** the `breakdown_*` earnings taxonomy as the structure of Wind's driver earnings screen; the
**automatic consequence for a negative balance** as a guard rail on driver debt; and the customer-PIN-at-pickup
idea as an option for confirming the right parcel was collected.

**Do not take:** the wallet and Careem Pay stack (Wind is cash-only and needs a licensed provider), the
acceptance-rate gating (a 50-user pilot needs every accepted job it can get), or shift booking (Wind's jobs board
has no roster).

### 10.5 Limits

`[unk]` Everything server-side: real commission rates, settlement timing, fine amounts, how the negative-balance
limit is calculated, and whether any of it applies in Palestine. `[unk]` Nothing was run; the app was installed
and pulled, then analysed statically. `[obs]` The base APK is 157 MB, so the captain app is roughly twice the
rider's code mass — the captain build may embed more than the rider does.

---

### 10.6 Shift, queue, and offer internals (resource-level recap)

See `CAREEM.md` §10.3 for the resource-string findings: `book_shift`, `acceptance_rate`, `arrive_at_pickup_button_text` = "Enter Customer Pin", `break_left_label`, `blocked_from_going_online`.

---

### 10.7 Class-level static pass 2026-11-17 (Careem Captain)

**Scope:** Class-level static analysis via REA 6.9.0 (jadx-headless-mcp 0.7.1) on `com.careem.adma` 89.70.2 (base APK SHA-256 `f5618afd9e173b8b9a7c4d1d42ee5a6c2e0dedaf71ba95064dd3fbd9b181c538`, **60,549 classes**). No app launches, no competitor API contact, no dynamic instrumentation.

**Commands executed:**
```powershell
$env:REA_JADX_MCP_JAR="$env:USERPROFILE\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:JAVA_HOME="C:\Users\osama\scoop\apps\temurin17-jdk\current"
$env:REA_JADX_HEAP_MIB="8192"
$env:REA_JADX_OPERATION_TIMEOUT_MS="900000"

rea inspect-android-package <captain-base.apk> --format json --full-output
rea search-android-classes <captain-base.apk> <query> --format json --full-output   # 19 queries
rea inspect-android-class <captain-base.apk> <class> --format json --full-output    # 48 key classes
```

> **[ran]** `inspect-android-package`; `search-android-classes` with 19 driver-side terms (`Earnings`, `Shift`, `Accept`, `Reject`, `Cash`, `Debt`, `Balance`, `Location`, `Tracking`, `Push`, `Notification`, `Order`, `Task`, `Pickup`, `Dropoff`, `Handover`, `Refusal`, `Cancel`, `Queue`); `inspect-android-class` on 48 key classes across all categories. Raw JSON outputs: `C:\Users\osama\AppData\Local\Temp\opencode\rea-work-20261117\careem_class_*.json` and `search_careem_*.json`.

#### 10.7.1 Receive and accept work — step workflow

| Category | Key classes inspected (sample) | Finding |
|---|---|---|
| **Job framework** | `com.careem.captain.booking.framework.jobs.job.*` (4 classes), `com.careem.captain.booking.framework.action.*` (5 classes) | **Explicit step-based workflow**: each job = sequence of typed steps (`CollectOrder`, `CompleteCollectOrder`, `CompleteArriveAtQueue`, `CompleteLeaveForQueue`). Each step has a *Command* (action), *Metadata DTO* (context), and *Reducer* (state update). |
| **Cancellation** | `BookingCancelAction`, `CancelJobCommand`, `EnqueueJobCancellationOnBackendCommand`, `CancellationPolicy` | Typed cancellation with `CancelJobRequest`, `InstantlyCancelJobRequest`, `AcknowledgeCancellationRequest`, plus `CancellationRestrictedReason` and `CancellationType` enums. |
| **Pickup (ride-hailing)** | `InPickupPassengerCommand`, `InArriveAtPickupCommand`, `InHdlArriveAtPickupCommand` | Passenger pickup and Hala (food) pickup are separate command hierarchies. |

**[O]** `CollectOrderRequest` fields: `bookingId`, `carId`, `latLng`, `timestamp`. `CollectOrderWithPinRequest` adds `pin: String`. `HdlArriveAtPickupStepMetadataDto` includes `pickupPointAddress`, `pickupPointLatLng`, `pickupLimit`, `image`, `hdlVariant`. `JobAuditUpdateRequest` and `RouteAuditUpdateRequest` exist as audit trail DTOs.

**[I]** Careem's **step workflow is the most explicit in the set**: every transition is a typed Command with a Metadata DTO and a Reducer — auditable, testable, and retryable per step. The `CollectOrderWithPinRequest.pin` is the **customer-held secret at pickup**, mirroring Wind's handover code at delivery.

**[U]** Exact offer dispatch algorithm, queue ordering, multi-driver contention, server-side assignment logic.

#### 10.7.2 Shift and queue — booked shifts + explicit HDL queue

| Category | Key classes inspected (sample) | Finding |
|---|---|---|
| **Shift API** | `ShiftsZonesApi` (4 methods: `fetchShiftSummary`, `shiftScheduleList`, `shiftProgress`, `getHotspots`) | Shift booking is an API-driven flow, not a local toggle. |
| **Shift UI** | `ShiftCalendarScreenView`, `ShiftSlotSelectionScreenView`, `ShiftConfirmationScreenView` | Calendar, slot selection, and confirmation are separate Views. |
| **Shift workers** | `PreShiftNudgeWorker`, `ShiftStartWorker`, `ShiftEndWorker`, `LateForShiftNudgeWorker`, `NextDayShiftReminderWorker` | **5 reminder/worker classes** for pre-shift nudge, start, end, late nudge, next-day reminder. |
| **HDL Queue** | `HdlMotQueueInfoGateway`, `QueueGateway`, `HdlMotQueueInfoModel`, `ArriveAtQueueRequest`, `HdlArriveAtQueueStepMetadataDto` | Explicit **driver-pull queue** with `ArriveAtQueueRequest` (bookingId, carId, latLng, timestamp), queue status model, and gateway. UI: `ArriveAtQueueScreenView`, `LeaveForQueueScreenView`. |

**[O]** `PreShiftNudgeWorker` fields include `shiftId`, `nudgeType`, `triggerAtMillis`. `ArriveAtQueueRequest` fields: `bookingId`, `carId`, `latLng`, `timestamp`. `HdlMotQueueInfoModel` has `queueStatus`, `position`, `estimatedWaitTime`.

**[I]** Careem combines **booked shifts** (calendar + API) with an **explicit driver-pull queue** (HDL = Hala Delivery Logistics) — the driver arrives at queue, sees position/wait time, and leaves for queue via typed commands. This is the **shift + queue hybrid** Wind's brief asks about.

**[U]** Whether HAAT Courier's queue (if any) mirrors this; exact queue ordering algorithm; server-side capacity enforcement.

#### 10.7.3 Custody at pickup and dropoff — typed requests + PIN

| Flow | Key classes | Finding |
|---|---|---|
| **Food/Hala pickup** | `CollectOrderRequest`, `CollectOrderWithPinRequest`, `HdlArriveAtPickupStepMetadataDto`, `HdlArriveAtPickupView` | Two collection requests: base (location only) and with **customer PIN**. Step metadata carries `pickupPointAddress`, `pickupPointLatLng`, `pickupLimit`, `image`, `hdlVariant`. |
| **Ride-hailing pickup** | `InPickupPassengerCommand`, `InArriveAtPickupCommand` | Separate command hierarchy for passenger pickup. |
| **Dropoff** | `UpdateDropoffLocationCommand`, `CompleteLeaveForQueueCommand` | Explicit dropoff location update; queue leave is a separate command. |

**[O]** `CollectOrderWithPinRequest.pin: String` — **customer PIN at pickup confirmed at class level**. `HdlArriveAtPickupView` renders the PIN entry UI.

**[I]** This is the **recipient-held-secret pattern at pickup**, not just delivery. Careem proves it works in this market for food/Hala orders.

**[U]** Whether the PIN is server-validated or client-checked; barcode/QR scan requirement; append-only custody chain persistence.

#### 10.7.4 Cash collection and handover — standing float with receipt

| Category | Key classes | Finding |
|---|---|---|
| **Cash collection action** | `CashPaidTripCollectionAction` (fields: `amount: double`, `cashCollectionSource: CashCollectionSource`), `CompleteCashPaidTripCollectionCommandAction` (fields: `bookingId`, `bookingUid`, `amount`, `businessType`, `tripReceipt`), `CompleteCashPaidTripCollectionCommand`, `CashPaidTripCollectionReducer` | **Typed collection action** with amount + source enum → **completion command with receipt** (`TripReceipt` domain model). |
| **Balance API** | `CashBalanceApi.getCashBalanceStatus`, `CashBalanceCaptainModel` (from `com.careem.pay.outstandingbalance`) | Standing-float wallet model with status API. |
| **Reporting** | `SendCashReceivedApi` | Collection reported to server via dedicated API. |

**[O]** `CashPaidTripCollectionAction.cashCollectionSource` is an enum (likely `CUSTOMER` / `MERCHANT` / etc.). `CompleteCashPaidTripCollectionCommandAction` carries a `TripReceipt` — a **formal closure object** with booking reference, amount, and receipt data.

**[I]** Careem's **continuous ledger with automatic cash-block consequence** (from §10.2 resource strings) is implemented as a **typed action → command → receipt** chain. The `TripReceipt` and `CompleteCashPaidTripCollectionCommandAction` imply a **formal collection closure event** structurally different from Wind's per-order reconciliation.

**[U]** Settlement timing, server-side ledger immutability, admin count-and-close workflow, variance reason capture.

#### 10.7.5 Earnings taxonomy — line-item breakdown with money-in/out

| Category | Key classes | Finding |
|---|---|---|
| **Earnings DTOs** | `EarningsDto` (fields: `totalAmount: v1l`, `items: List<EarningsItemDto>`), `EarningsItemDto` (fields: `type: EarningTypeDto`, `amount: v1l`, `breakdown: List<EarningsItemBreakdownDto>`), `EarningsItemBreakdownDto` (fields: `name: String`, `amount: v1l`) | **Three-level hierarchy**: total → typed items → named breakdowns. |
| **Analytics mirror** | `SerializableEarningsBreakdown` (fields: `amount`, `name`, `type`) | Serializable version for analytics/events. |
| **UI** | `EarningsLandingScreenView`, `SplitEarningsOnboardingActivity`, `EarningsCardView`, `SplitEarningsCardView` | Landing screen, onboarding, and card views for the breakdown. |

**[O]** Matches the resource-string taxonomy in §10.1: `breakdown_bonus`, `breakdown_tips`, `breakdown_guarantees`, `breakdown_fines`, `breakdown_fines_refund`, `breakdown_behavior_penalties`, `breakdown_money_in`, `breakdown_money_out`, `breakdown_other`.

**[I]** This is an **explained statement**, not a summary. The `money_in` / `money_out` sides make it an **append-only ledger shape** — the pattern Wind needs for cash markets where take-home is the product promise.

**[U]** Whether earnings are shown as *shift-summary* vs *cumulative*; real-time update during shift; server-side calculation logic.

#### 10.7.6 Refusal and cancellation — typed policy + acknowledgement

| Category | Key classes | Finding |
|---|---|---|
| **Cancellation framework** | `BookingCancelAction`, `CancelJobCommand` (with `CancelJobRequest`, `InstantlyCancelJobRequest`, `AcknowledgeCancellationRequest`), `EnqueueJobCancellationOnBackendCommand` | Multi-request cancellation: standard, instant, and **acknowledged** (client confirms server cancellation). |
| **Policy** | `CancellationPolicy` (with `CancellationRestrictedReason`, `CancellationType`), `BookingCancellationApiError`, `BookingCancellationApiErrorType` | **Typed policy** with restricted reasons and types; API error taxonomy. |
| **Step-level** | `StepCancellationData` | Cancellation data attached to individual workflow steps. |

**[O]** `CancellationPolicy` is a concrete class with `CancellationRestrictedReason` and `CancellationType` enums. `AcknowledgeCancellationRequest` implies a **client-acknowledgement protocol** for server-initiated cancellations.

**[I]** Careem has a **typed cancellation policy** (not free-text reasons) plus an **acknowledgement protocol** — structurally more rigorous than HAAT's timeout + reason selection.

**[U]** Whether refusal reasons are persisted server-side; exact penalty rules; whether "auto-reject" timeout is configurable per shift/zone.

#### 10.7.7 Location and push — foreground service + async worker

| Category | Key classes | Finding |
|---|---|---|
| **Location** | `ForegroundLocationService` (29 methods, 16 fields) | **Foreground service** with captain-status coupling (status-reactive location updates). |
| **Push** | `PushNotificationAsyncWorker` (uses `ListenableFuture` for async), `BookingPushMessageUtil` | **Async worker** + booking-specific push utility for message parsing/routing. |

**[I]** `ForegroundLocationService` is a **proper foreground service** (not a background Service) with 29 methods — likely handles the `captain_status` coupling (online/offline/on-trip) that drives location cadence. `PushNotificationAsyncWorker` uses Guava `ListenableFuture` for non-blocking push handling.

**[U]** Background cadence, offline queueing/replay, conflict resolution, server receipt semantics — same as resource pass.

#### 10.7.8 Summary for Wind (from class-level pass)

| Mechanic | Class-level finding | Wind takeaway |
|---|---|---|
| Shift model | Booked via API (`ShiftsZonesApi`), calendar UI, 5 reminder workers | **Adopt**: booked shift + pre-shift reminders |
| Queue | Explicit HDL queue (`HdlMotQueueInfoGateway`, arrive/leave commands) | **Adopt**: driver-pull queue with arrive/leave commands |
| Offer/accept | Step workflow (Command + Metadata DTO + Reducer per step) | **Adopt**: step workflow; typed cancellation policy |
| Custody at pickup | `CollectOrderRequest` (latLng) + `CollectOrderWithPinRequest` (PIN) + metadata | **Adopt**: location + optional customer PIN; typed metadata |
| Custody at dropoff | `UpdateDropoffLocationCommand` | **Adopt**: explicit dropoff location update command |
| Cash collection | `CashPaidTripCollectionAction` → `CompleteCashPaidTripCollectionCommandAction` (receipt) | **Adopt**: typed collection action with receipt; standing float with auto-block |
| Earnings taxonomy | `EarningsDto` → items → breakdowns (named line items, money_in/money_out) | **Adopt**: line-item breakdown with `money_in`/`money_out` sides |
| Refusal/cancellation | `CancellationPolicy` (typed reasons, restricted types), acknowledgement protocol | **Adopt**: typed policy + acknowledgement |
| Location | `ForegroundLocationService` (29 methods, status-reactive) | **Adopt**: foreground service coupled to captain status |
| Push | `PushNotificationAsyncWorker` (ListenableFuture), `BookingPushMessageUtil` | **Adopt**: async worker + booking-specific push util |

> **Cross-reference:** The cross-artifact summary in `DRIVER-SIDE-REA-2026-11-17.md` §7 (pattern matrix) and §9 (answers per artifact) consolidates Careem Captain's 48-class inspection alongside HAAT Driver/Courier's 15-class inspection.

## 11. Second independent pass — verified deltas

A second pass over the same rider artifact (`com.careem.acma` 26.43, base `85,446,587` B, SHA-256
`B19112D53D3E9A800EF35908FA48AF57816D9F8F81B7A3897A7220F527127F58`) using the REA toolchain added the
following. Where the two passes disagree on a count, both are given.

### 11.1 The address model, in Careem's own Arabic

`[obs]` Careem requires a **structured postal-shaped address**, and says so in its validation copy:

| key | English | Arabic |
|---|---|---|
| `address_addressAreaMissing` | Please enter the area of the address | الرجاء إدخال منطقة العنوان |
| `address_addressBuildingMissing` | Please enter the building of your address | الرجاء إدخال مبنى عنوانك |
| `address_addressNumberMissing` | Please enter apt/villa number | الرجاء إدخال رقم الشقة/الفيلا |
| `address_addressNumberInvalid` | The active address doesn't have a flat/villa number. Please select a different address | العنوان النشط لا يحتوي على رقم شقة/فيلا. يرجى اختيار عنوان مختلف |
| `address_addressIncomplete` | Incomplete Address | العنوان غير مكتمل |
| `address_addressNotUsable` | Address not usable | العنوان غير صالح للاستخدام |
| `address_addressNicknameLabel` | Nickname | اسم مستعار |
| `address_addAddressCta` | **YALLA!** | يلا! |

`[obs]` **116** `address_*` strings. **Area + building + apartment/villa number are required**, and a missing
one is answered with "Address not usable". `[inf]` That is the clearest single illustration of why an
international app does not serve the West Bank, and it is visible in the strings rather than guessed at.

### 11.2 Cash is not a payment method here

`[obs]` The payment methods are `CARD` (بطاقة), `DEBIT` (خصم), `CREDIT` (رصيد) and `CAREEM_PAY`. **There is no
cash payment-method string.** What "cash" means is a wallet ledger event: `TITLE_PURCHASE_CASH_DELTA_UNDER_BALANCE`
("Negative balance" / رصيد سالب), `TOPUP_CASH_DELTA_NEGATIVE_CREDIT_BALANCED` ("Amount settled due to a previous
underpayment"), `DETAILED_TOPUP_CASH_OVER_PAYMENT` ("Cash" / نقدًا). `[inf]` A stored-value wallet with a tracked
under-payment — the same accounting shape Wind needs, reached from the opposite direction.

### 11.3 The refusal-reason catalogue — the most transferable asset

`[obs]` **27** `PAY_ERROR_*` strings, of which **22 are numbered against payment-service codes**
(`PAY_ERROR_MESSAGE_PS_1` … `_39`), plus **20** `PAY_P2P_*`. Each is a specific actionable sentence rather than
"payment failed": "The transaction has been declined by your bank", "Please make sure you have enough funds…",
"You're over your transaction limit", "Your card can't be used for online purchases", "Please choose another
payment method". `[inf]` Copy the **practice** — one stable code, one specific bilingual sentence, for every
refusal — not the card rails.

### 11.4 Server-driven per-booking capability

`[obs]` `com.careem.acma.booking.BookingConfig` carries nested per-feature toggle maps:
`overrideAllowedPaymentTypesForCcts`, `demandShapingConfig`, `flexiCctCardInfo`, `tollPriceInfoVisibility`.
`[obs]` Payment is a first-class selection model: `PaymentSelection`, `PaymentTypeSelectionOption`,
`PaymentOptionsCorporateModel`, `PaymentOptionsHeaderModel`.
`[inf]` With **no OTA channel**, a server-supplied per-booking config is Wind's only way to change behaviour per
segment without shipping an APK — and it is the answer to the ledger's "each activation separately" row.

### 11.5 Tracking is modelled by concern, with an explicit status mapper

`[obs]` `com.careem.superapp.feature.ordertracking.model` splits into `model.maps` (31 classes),
`model.misc` (28), `model.detail.delivery` (17), `model.detail.payment` (16), `model.detail.status` (12),
`model.navigation` (15), `model.tipping` (9), plus `ordertracking.api` (17) and
`featurelib.servicetracker.model` (47). `[obs]` `OsirisBookingStatusMapper` maps server status to UI state.
`[inf]` Map separately from status is precisely why Wind's "stale driver position" is a *status* concern, and the
mapper is the right place to handle a server status this build does not know — the exact failure mode a no-OTA
app faces.

### 11.6 Scale, and one release-hygiene defect

`[obs]` 66,129 class definitions, **389 activities**, 34 exported components, schemes
`careem · careempay · careemsso · geo · http · https · mailto · tel`, hosts
`www.careem.com · identity.careem.com · pay.careem.com · recovery.careem.com · careem.go.link · efse.adj.st · *`
(a **wildcard** host). `[obs]` `android:usesCleartextTraffic="false"` plus a `networkSecurityConfig` — an explicit
flag, stronger than the platform default Wind relies on.

`[obs]` **`androidx.compose.ui.tooling.PreviewActivity` is exported in the release build.** A debug surface
shipped to production. That is a release-checklist item for Wind, not a pattern to copy.

`[obs]` SDKs: Sentry, Braze, Adjust, Plotline, ML Kit, Room, Jetpack Compose + Glance widgets. Six third-party
processors is not what a 50-user pilot should start with.
