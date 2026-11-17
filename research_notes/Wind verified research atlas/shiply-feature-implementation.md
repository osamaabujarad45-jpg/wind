# Shiply Palestine — feature implementation from the shipped bundle

**Subject:** `com.shiplypalestinemobileapp` 1.8530 (Android versionCode 310)  
**Artifact:** `shiply__base.apk`, 87,463,616 bytes, SHA-256 `000335d479a369530706d1fd67e8805e0fcdf665a71012a0b22f4a1b7ff8e7fe`  
**Bundle:** `assets/index.android.bundle`, 10,847,624 bytes, SHA-256 `eefcb81f91237961a2f1e560e3c07320e882e4098564069e8905e9416d608e62`  
**Analysis date:** 2026-11-13. Static analysis only; the APK was not run and no backend was contacted.

This extends `research_notes/REA-2026-11-13-reference-apps/SHIPLY.md` rather than restating its route and SDK inventory. It also corrects several conclusions that resulted from reading adjacent printable text as though it were structured source.

## Method and evidence rules

- **[O] Observation** means a literal, key, object shape, function, or manifest entry exists in the artifact.
- **[I] Inference** means a design interpretation of those observations. It is not a claim about production behaviour.
- **[NF] Not found** means the named mechanism was not found by the stated searches in this artifact. It does **not** prove that Shiply lacks it on a server or in another application.
- **`@N`** is a byte offset in `assets/index.android.bundle`. **`fn #N`** is the function number in the targeted HBC disassembly; it is an analysis locator, not a Shiply API identifier.

### The bundle is Hermes bytecode, not plain JavaScript

**[O] ZIP/header inspection:** the bundle starts with the Hermes magic bytes `c6 1f bc 03 c1 03 19 1f` and declares **HBC version 98**. It is not a UTF-8 JavaScript bundle. Calling it merely “Metro bytecode with module bodies” is inaccurate: Metro may have produced the input, but the shipped format is Hermes HBC.

**[O] Parsing method:** a version-aware parser read 41,741 function headers, 68,400 small-string entries, and 1,051 overflow entries. String storage begins at file offset 949,588. I extracted exact UTF-8/UTF-16 strings and then disassembled only the relevant functions with `hermes-dec` 0.1.8. Object shapes and call sites, not adjacency in a printable-string dump, are the basis for the relationships below. The disassembler warns that v98 is a recent/not formally supported target, so literal string-table evidence remains primary; targeted disassembly is corroboration.

**[O] Arabic is present:** the HBC contains English and Arabic translation objects and UTF-16 product copy. The earlier note's “no Arabic product copy recovered” limitation no longer applies. Examples below include `required_field` = “This field is required” / “هذا الحقل مطلوب”.

**Scope limit:** the artifact exposes client payload shapes, UI guards, copy, and endpoint names. It does not establish server-side validation, transition enforcement, actual fee values, notification contents, background delivery, or runtime success.

---

## 1. Address model

**Method:** HBC string-table search plus targeted disassembly of `buildParcelPayload` (fn #30366), create/update submission (fn #40053), form-rule construction (fn #16251), non-form validation (fn #40109), recipient UI (fn #19810), and store-address mapping (fn #19618).

### Parcel recipient and destination supplied at create/update

**[O] Recipient fields:** the request's `recipient` member is built from:

| Field | Implementation evidence |
|---|---|
| `first_name` | recipient name; `recipient_name` is the form key and is required |
| `last_name` | emitted as an empty string in `buildParcelPayload` |
| `phone` | primary phone from `phone_number_select` |
| `phone2` | additional phone from `optional_pure_phone_number` |

The UI also exposes `recipient_name`, `recipient_number`, `additional_phone_number`, favourite-recipient selection, and a second-phone toggle. `first_name` is @1379970, `phone2` @1143118, `recipient_name` @2223771, and `optional_pure_phone_number` @2032681.

**[O] Address request shape:** `buildParcelPayload` constructs an `address` containing exactly these location keys: **`city_id`, `village_id`, `street_name`, `latitude`, `longitude`**. The same five keys occur in the create/update path (fn #40053). Their string-table anchors include `city_id` @1612042, `village_id` @1266406, `street_name` @1763798, `latitude` @2126537, and `longitude` @994834. Map selection populates `recipientLatitude` / `recipientLongitude`, which are then renamed to `latitude` / `longitude`.

**[O] Associated, but separate, parcel fields:** the same payload carries `description`, `customer_instructions`, `note`, `customer_private_note`, and `reference_number`. These are not folded into the address object. `is_favorite_recipient` is a create-time preference flag, not a default-address flag.

**[O] Required client-side inputs and validation copy:**

| Input | Client rule observed | Copy / caveat |
|---|---|---|
| Recipient name | `recipient_name` has `required`; fn #40109 also checks the non-form name | `required_field`: “This field is required” / “هذا الحقل مطلوب” |
| Primary phone | `phone_number_select` has `required`; the related `pure_phone_number` rule also has `required` plus `validNumber` | “Enter a valid phone number”; another phone rule uses `^\d{9}$` with `invalid_phone_num` |
| Additional phone | `optional_pure_phone_number` is explicitly not required but retains number validation | “Additional Phone Number (optional)” |
| City | `city_id` has `required` | `select_city` |
| Village | `village_id` has `required` | `select_village` |
| Street | `street` has `required`; fn #40109 separately sets a street error | `recipient_street_note2`: “Please fill Street name so the Parcel will deliver ASAP”; also “Incorrect street name may lead to delay your delivery” |
| Description | required with minimum length 10 when this input is used | “Description must be at least 10 characters long” / templated `short_description_num` |
| Driver/problem note | the `note` input has required + minimum length 10 when shown | label `Driver Notes`; separate string “Notes must be at least 10 characters long” |
| Customer instructions | empty rule object | No required rule found |
| Customer private note | no rule object attached in `getFormInputs` | Treated as optional by the client form |

The street-leave handler rejects placeholder-like values including `.`, `..`, `...`, repeated dashes, and the Arabic strings `الرئيسي`, `رئيسي`, `لا يوجد`, and `لايوجد`; it then shows `recipient_street_note2`. Number handling normalises Arabic-Indic digits and has the copy “Only English numbers are allowed”.

**[O] No parcel landmark or default-address key was found:** `landmark` occurs only as an icon name alongside `landmark-alt`, `landmark-flag`, and `landmark-dome`; it is absent from both parcel address payloads. `village_note` is displayed in a village-information modal, but is not emitted by `buildParcelPayload`. No house/building/apartment number or postal-code field is emitted either. The export header independently confirms the public triple `City,Village,Street` and includes `QR` (@950993), not a landmark.

**[O] Editing restrictions:** copy says “City cannot be changed, because parcel status is Shipped” and “If you want to change the address, you must delete this parcel and create a new one.” Same-day activation has a separate area-change guard.

### Do not confuse the store billing address with a parcel address

**[O]** `mapAddressToBillingPayload` (fn #19618) handles the store checkout model and includes `additional`, `address`, `address_type: customer`, `city`, `company_name`, `country`, `default_address`, `email`, `first_name`, `gender`, `id`, `last_name`, `phone`, `postcode`, `state`, `use_for_shipping`, and `vat_id`. Here `default_address` is derived from `Boolean(address.is_default)`. `/customer/checkout/save-address` (@1178176) is a distinct store endpoint. This is the only address-default mechanism established in this analysis; it is not part of the parcel destination payload.

**[I]** The parcel implementation is a municipal **city → village → street** model with optional coordinates and separate free-text notes. A landmark-first design would be an extension, not a field copied from this bundle. Required rules for conditional fields should be applied when those inputs are shown, not misread as every field being mandatory on every parcel type.

---

## 2. Order lifecycle

**Method:** literal enum/object recovery from fn #2596 and fn #19154; action-graph inspection in fn #19162; status-mutation functions fn #40056, #40159, #40239, #40245, #40246, #41094, #41098, #41125, and #41661; notification-channel inspection in fn #36797.

### Status vocabulary actually present

**[O] Numeric parcel-status enum:**

| ID | Value | Display / role visible in the client |
|---:|---|---|
| 1 | `Draft` | creation/edit state |
| 2 | `Submitted` | ready for submission / submitted |
| 3 | `OnTheWay` | shipped / under delivery |
| 4 | `AttemptToDeliver` | attempt to deliver |
| 5 | `Pending` | Arabic copy renders this as “عالق” (stuck/problem), not merely waiting |
| 6 | `Delivered` | delivered |
| 7 | `Returned` | returned |
| 8 | `Finished` | finished |
| 9 | `Replaced` | replaced |
| 10 | `Solved` | `Resolved`/`Processed` aliases in UI and colour maps |

**[O]** `Postponed` appears as filter value **11** in fn #19154 and as a colour/display state, but is absent from the numeric `ParcelStatus` enum object in fn #2596. `Resolved` is a presentation alias; `Solved` is the enum member. `final_parcel_status_id` (@2190406), `final_status_id` (@2190429), and `finalParcelStatus` are read by parcel UI/action code.

### Client-exposed transitions and triggers

| Trigger visible to the user | Status mutation evidence |
|---|---|
| Submit a draft | `Draft` → `Submitted`; `{parcel_id,status_id}` in fn #40056/#40159. A QR-prep step can ask the user to scan/add a sticker first. |
| Cancel submission | `Submitted` → `Draft`; fn #40239 (and duplicate path #40286), with `cancel_parcel_submission_confirmation`. |
| Mark a problem solved | `Pending` → `Solved`; fn #41094/#41125 includes `note` as well as `parcel_id` and `status_id`. |
| Return during delivery/problem handling | `useParcelActions` offers return for `OnTheWay`, `AttemptToDeliver`, and `Solved`; fn #41098/#41661 sets `Returned`. Confirmation: “Are you sure you want to return this parcel?” |
| Continue a returned parcel held at the customer | `Returned` + `ParcelPosition.Customer` exposes continue; fn #40246 sets `OnTheWay`. fn #40245 warns “An additional cost will be charged … {{continueCost}} {{currency}}”. |
| Confirm receipt | `received_parcel` action with “Are you sure you received this parcel?”; final-status metadata is read separately. The artifact does not justify assigning this action a universal hard-coded outcome. |

**[O] Terminal/exception modelling:** `Finished`, `Delivered`, `Returned`, `Replaced`, `Postponed`, `Pending`, and `Solved` are distinct vocabulary, and singular final-status fields exist. **[NF]** No literal `final_parcel_status_ids` set, exhaustive terminal-state list, server transition table, or automatic-transition trigger was found. Therefore the enum must not be presented as a fully proven allowed-transition graph.

### Multi-attempt finding — and a necessary correction

**[O]** `AttemptToDeliver` is status 4, and the translation table maps `AttemptToDeliver2` to “Second Attempt to Deliver”. **[NF]** No third-attempt status, `attempttodeliver_three_step`, attempt counter, maximum-attempt rule, or automatic escalation sequence was found.

The earlier note's `delivered_1/2/3`, `returned_1/2/3`, and `pending_1/2` are **not attempt-stage substates**. Disassembly of `registerForPushNotificationsAsync` (fn #36797) proves they are notification-channel IDs with matching sound names (`id`, `name`, `sound`). There is no `delivered_3` channel in this build. These strings must not be used to infer a three-step delivery model.

**[I]** The client supports at least a second-attempt presentation, while the artifact does not prove a general three-attempt lifecycle or its terminal rule.

---

## 3. Cash and money

**Method:** order-type/price translation objects (fn #2494/#2495), price UI (fn #18438/#19100), fee request builders (fn #29959/#30375), wallet/debt APIs (fn #36548, #36596–36604, #37873–37877, #38712–38713), transaction construction (fn #32910/#32992/#40632), and invoice-exception/financial-difference functions (fn #18582/#36553/#36555).

### COD and amount direction

**[O]** The normal `Delivery` type is labelled “Normal (Cash on deliver)” in the bundle; the store separately has a `cashondelivery` method key. The order-type/price copy distinguishes:

- `Delivery`: “The amount to be taken from the recipient”; after costs the amount is returned and added to the invoice.
- `Pay` / purchase-return flow: “The amount to be paid to the recipient”; costs are added and the price is deducted from the invoice.

`is_payment_parcel` and `is_paid_using_visa_card` also occur. The latter belongs to card-payment display, not proof that a parcel was cash-settled.

### Per-parcel cost and value fields

**[O]** The client displays or submits the following distinct concepts:

- Collection/content values: `total_price`, `actual_price`, `expected_collected_value`, `additional_cost` / `additional_costs`.
- Delivery charges: `parcel_delivery_cost`, `main_delivery_cost`, `delivery_cost`, `returned_delivery_cost`, `extra_delivery_cost`, `price_extra_fee`, `size_fee`, `total_delivery_costs`, and `continueCost`.
- Card charge: `cc_payment_fees`.
- Net result: `net_collection`, rendered in copy as “Net Collection (Parcel Price − Total Delivery Costs)”.

The `actual_price` explanation is explicit: “The actual value of the parcel depends on its contents, not on the collected amount. Enter this value if it differs from the contents' value.” This prevents conflating COD value with declared parcel value. `actual_price` is @1037068, `total_price` @2171787, and `total_delivery_costs` @1994555.

### Wallet, holds, debts, and requests

| Mechanism | Literal client endpoint / shape |
|---|---|
| Wallet record | `GET /wallet`; wallet parameters via `PUT /wallet/{id}/parameters` |
| Transactions | `GET /wallet-transactions/` with paged/filter params |
| Deposit/withdraw request | `POST /wallet-transactions/request`; UI types `DEPOSIT` and `WITHDRAW` |
| Request metadata | `/wallet-transaction-requests/`, plus `/methods`, `/statuses`, `/types` |
| Transaction metadata | `/wallet-transactions/statuses`, `/wallet-transactions/types` |
| Holds | `GET /wallet/hold-amount-details`; tabs for parcels, withdrawal requests, and current debts |
| Debts | `GET /debts` with `from`/`to`; `GET /debts/statuses`; current and paid debt views |
| Current invoice amount | `GET /customer-invoices/current-amount` |

**[O]** The create-transaction payload includes `wallet_number`, `type`, `method`, and conditional `authorized_recipient`; the UI carries amount, `isAll`, balance-before, and hold amount into confirmation. Withdrawal has an insufficient-balance error path.

**[O] Wallet instructional copy:** activating the wallet is described as moving unreceived invoices and new invoice values into wallet balance. The reserved/hold amount is described as “the value of Pay/Buy parcels and withdrawal requests in progress.” These are product instructions shipped in the app, not independent verification of backend ledger postings.

### Financial differences and commission

**[O]** Financial differences are passed as `exceptions` plus `total`, with routes on parcels, returns, and invoices. APIs include `/customerInvoices/getCustomerInvoiceExceptions`, `/customerInvoices/addInvoiceException`, exception types/statuses, and `/customerInvoices/create`. Parcel details expose `financial_differences_related_to_this_parcel`.

**[O]** Sales/employee forms contain `fixed_commission_value` and `percent_commission_value`; percentage validation is 0–100 and copy says the commission appears as a separate invoice column. A salesman summary reads `total_collected_money` and `current_commission`.

**[O]** Card commission is separate from sales commission: `/users/agree-to-cover-visa-commission` is a PATCH, the UI shows `visa_commission_value` with `%`, and parcel data reads `agreed_to_cover_visa_commission`.

**[I]** The client models money as a set of named ledger deltas and holds rather than a single COD scalar. The artifact does not reveal the authoritative ledger schema, settlement timing, or numerical fee schedule.

---

## 4. Order types and service levels

**Method:** enum object in fn #2596, parcel payload builders, same-day component fn #18537–18542, same-day APIs fn #36571–36573 and conversion fn #40238, fee builders, and weight/fee validation strings.

### Order-type axis

**[O] Exact enum and internal names:**

| ID | Selector value | Internal name | User-facing meaning in shipped copy |
|---:|---|---|---|
| 1 | `Delivery` | `SendParcel` | “Normal (Cash on deliver)” |
| 2 | `Pay` | `PaymentParcel` | Pay |
| 3 | `Replace` | `ReplaceParcel` | Replace parcel / remaining items |
| 4 | `Return` | `PurchaseParcel` | “Buy or Bring Parcel” |

Thus there is no separate `Buy` enum member: **Buy/Bring is the presentation of `Return`**. Copy allows changing to Pay, Buy/Return, or Replace from designated parcel-detail controls. `is_replacement` and `partially_received` affect replacement handling; `is_completely_received` is emitted for the receipt flow.

### Same-day / JAYEEK is an orthogonal delivery method

**[O]** `delivery_method_object.key` distinguishes `normal` from `same_day`, and `SameDayType` is `SAME_DAY`. JAYEEK is the branded UI for this service, gated by the `same_day_enabled` preference and `CAN_MANAGE_JAYEEK_PARCELS` permission.

**[O] Eligibility state and flags:** the same-day UI uses `NO_AREA`, `READY`, `NOT_AVAILABLE`, `AVAILABLE`, `CHECKING`, and `SELECTED`; it reads `is_same_day_delivery_supported`, `can_pickup_only`, `can_be_scheduled_for_next_day`, `has_supported_source_address_for_sdd`, and `has_supported_destination_address_for_sdd`.

**[O] API and mutation shapes:**

- `GET /same-day-delivery/check`
- `GET /same-day-delivery/check-revert/{...}`
- `GET /same-day-delivery/related-data`
- Upgrade adds `mark_as_same_day_delivery: true` and may include `ignore_pickup_only`.
- Revert uses `revert_same_day_delivery: true` with `keep_same_day_delivery_cost: false` (or the corresponding helper flag).

**[O] Correction:** reversion is not universally irreversible. A `same_day_cannot_revert_parcel` message exists, but so do an eligibility check and actual revert payload. The precise conditions are data-driven and not recoverable from static strings. JAYEEK branding alone does not prove that a third-party courier performs delivery.

### Fee tiers and extra charges

**[O]** `/parcels/fees` receives `village_id`, `cost_map_type`, and `parcel_type_id`. `/parcels/calculateSizeExtraFee` is separate. The weight selector shows **0–5, 5–10, 10–20, 20+** with default parcel weight 5; dimension fields are `width`, `length`, and `height`.

**[O]** Price-based extra-fee copy says: “The price you entered exceeds limit({{threshold}}), an extra fee({{fee}}) will be added”. Other visible fee components are `extra_delivery_cost`, `price_extra_fee`, `size_fee`, and same-day `deliveryCost` / `returnedCost`.

**[NF]** No hard-coded currency price table, same-day tier prices, or numeric fee percentages was found. Thresholds and computed values are consumed as data, so static analysis cannot supply the actual tariff.

---

## 5. Delivery proof and handover

**Method:** QR/share functions fn #15258–15259, #15881, #18305, #19931, #36506, #36514, #36575, and #40243; scan history fn #19146; receipt actions and proof-code searches across all extracted strings.

### What is implemented

**[O] QR as parcel identity and lookup:**

- Camera scanner restricts `barcodeTypes` to `qr`; native manifest also registers `com.google.mlkit.vision.barcode.internal.BarcodeRegistrar`.
- Lookup endpoints include `/parcels/getParcelByQRCode` and `/parcels/findByQRCode`; attaching a sticker uses `/parcels/addQRCode`.
- `prepareToSubmitParcel` can require the QR step and offers `open_camera_scan_qr` or `i_dont_have_qr_sticker` before submission.
- Invalid scans have `scanned_invalid_QR` / `scanned_invalid_qr`; successful attachment has “QR code added successfully”.
- `ParcelScans` loads scan history, so QR events have a client-visible audit surface.

**[O] Share/track handoff:** share code builds `shiply://parcels/id=…` and `shiply://parcels/qr=…`; the manifest also accepts web links with `pathPrefix="/p"`. Guest tracking accepts a typed parcel number or scanned QR. QR parsers understand `c=`, `?shiply`, and `=shiply` forms.

**[O] Receipt confirmation and partial receipt:** the sender-side action asks “Are you sure you received this parcel?”. `partially_received` / `is_completely_received` is permission-gated (`CAN_SET_PARTIALLY_RECEIVED_PARCELS`). Copy explains that partial receipt changes the parcel to Replace for remaining items, while complete receipt changes it to Normal/COD.

**[O] Actor evidence:** export contains `deliveredByUser`, and return details read `delivered_by_user`. This records who is associated with delivery; it is not recipient cryptographic confirmation.

### What is not established

**[NF]** Searches for delivery/recipient/handover OTP, PIN, signature, and confirmation-code fields returned no product match. `authorized_recipient` belongs to wallet withdrawal, not parcel handover. QR scanning proves lookup/attachment capability, not by itself proof of delivery. No recipient-signature capture or server verification flow can be claimed.

**[I]** The artifact's concrete handover pattern is QR identity + user receipt confirmation + partial/complete flag + scan history, rather than an OTP proof-of-delivery ceremony.

---

## 6. Driver side

**Method:** driver/receive-preference functions fn #19113, #20049–20051, #32547, #36509, and #38512–38514; exhaustive string searches for driver jobs, earnings, settlement, shifts, offer/accept, and queues.

### Driver-facing integration visible in this customer build

**[O] Assignment/preferences:** `/users/{id}/deliver-receive-preferences` supports GET and PATCH. The UI exposes assigned drivers, primary/secondary driver, active/inactive state, receiving drivers, office-versus-Shiply-driver preferences, and vehicle nickname, licence plate, make, model, and colour.

**[O] Driver details:** `GET /tasks/driver-details/{id}` backs `useDriverDetails`, with one retry and no cache (`staleTime: 0`, `gcTime: 0`).

**[O] Parcel position and notes:** `POST /parcels/changeParcelStatusPositionDriver` exists. `DriverNoteBox` reads `driver_note`, `note`, and `pending_attachments`, especially around Pending/Returned history. Problem-resolution mutation can include `note`. These are driver integration fields in the customer app, not a driver job workflow.

### Jobs, earnings, settlement, shift, and queue

**[NF]** The only `/driver`- or `/tasks`-style product endpoint found is `/tasks/driver-details/`. Searches for `driver_earnings`, courier earnings, settlement IDs/status/amount, job board, available jobs, ready queue, accept/decline offer, shift start/end/open/close, and driver-job combinations returned **zero matches**.

A shared configuration object contains `LocationInterval: 20000`, `LocationUploadInterval: 60000`, and `driverRefreshRateInterval: 300000`, but no references beyond its declaration were found. It is insufficient evidence for live GPS upload or a driver queue. `UserTypes.Driver` and assigned-driver display likewise do not establish a driver app.

**[I]** This APK contains customer-side driver assignment and parcel-position integration only. A driver job offer, earnings, settlement, shift, or queue implementation must be sought in another artifact; its existence or absence in Shiply's wider product cannot be decided here.

---

## 7. Offline and retry

**Method:** draft functions fn #19818, #2597, #32180–32183, and #36450–36456; query configuration in fn #18278/#19709/#32547; create duplicate path fn #40053; network-error handlers fn #15895/#20100/#20101; queue attribution in fn #41336; idempotency searches across all strings.

### Local draft persistence is real; a parcel outbox is not proven

**[O]** `saveCreateParcelDraft` serialises JSON through the storage API's `setItem`; load uses `getItem` + `JSON.parse`, scoped with user identity; clear uses `removeItem`. `createParcelDraft` (@1727329) is the module's draft key. Draft-change detection includes description, customer instructions, parcel weight, recipient name, street, phone, total price, reference number, note/private note, city/village, and delivery date. Save scheduling uses `setTimeout`/`clearTimeout`, and UI copy includes “Restore draft?”. Default parcel description and customer instructions are also persisted under user configuration keys.

**[O] Retry is query-specific:** parcel-by-ID uses `retry: 0`, parcel-by-QR uses `retry: 3`, size-fee uses `retry: 1`, driver details uses `retry: 1`, and wallet request queries use `retry: 1`. React Query also ships generic reconnect/offline code, but the presence of that library is not a product outbox.

**[O] Duplicate handling:** create/update can send `forceDuplicate` (@1044975). The UI handles a `duplicate` response with “This recipient already has a parcel, do you want to create another parcel?” and optional previous date/price. A separate `DUPLICATE_REQUEST` error maps to “Please wait a moment before submitting this request again.” These are duplicate-confirmation/throttle mechanisms, not an idempotency key.

**[O] Connection-drop copy:** handlers recognise `Network Error`, `ERR_NETWORK`, and status 504. User copy includes “Please check your internet connection and try again.” (`check_internet`) and “Request Timed out, try again later please” (`timeout_error`).

### Two corrections to the earlier offline reading

1. **“Error sending. Event queued.” belongs to Sentry transport.** It occurs in fn #41336 beside `x-sentry-rate-limits`, `retry-after`, `envelopeContainsItemType`, and replay item types. It is not evidence of parcel writes being queued.
2. `offlineMode` also appears as a react-native-maps tile option; that library flag is not a parcel offline mode. A separate global `offlineMode: false` declaration has no demonstrated product use here.

**[NF]** No `idempotency`, `Idempotency-Key`, request UUID, parcel mutation outbox, offline write replay, or queued parcel-sync endpoint was found. Local draft recovery and per-query retries must not be described as offline order submission.

---

## 8. Push and tracking

**Method:** `aapt2 dump xmltree` for native messaging components/meta-data; HBC push registration fn #36797; token APIs fn #36018–36021; foreground handler fn #41183; notification routing fn #35997–35998 and #40233–40234; QR/share/history functions above.

### Transport, channels, and token lifecycle

**[O] Native transport:** the manifest contains `io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService` and receiver handling `com.google.firebase.MESSAGING_EVENT`, plus Firebase IID receiver and Notifee components. Meta-data sets:

- `firebase_messaging_auto_init_enabled = true`
- `firebase_messaging_notification_delegation_enabled = false`
- `com.google.firebase.messaging.default_notification_channel_id = ""` (empty in this build)

**[O] JS-created channels:** `registerForPushNotificationsAsync` calls Notifee `createChannel` with `AndroidImportance.HIGH`. Literal channel IDs are `default`, `normal`, `pending`, `delivered`, `pending_1`, `pending_2`, `delivered_1`, `delivered_2`, `returned_1`, `returned_2`, `returned_3`, and `ticket_update_1`. Sounds include `default`, `success`, `pending`, and matching numbered names. As noted in section 2, these are notification channels, not delivery attempts.

**[O] Token APIs:** registration gets and stores `fcmToken`, requests Android `POST_NOTIFICATIONS`, and sends `device_token`. Endpoints are `/auth/notification/saveDeviceToken`, `/notification/linkDeviceToken`, and `/notification/unlinkDeviceToken`; notification options use `/notification/getNotificationOptions` and `/notification/updateNotificationOptions`.

### Payload keys and PII

**[O]** Foreground handling parses JSON `data`, displays `title` / `body` in an in-app toast, vibrates, and invalidates parcel, invoice, wallet, promotion, notification, and dashboard queries. Notification/routing code is prepared to consume:

| Key(s) | Client use | Privacy reading |
|---|---|---|
| `user_email` | checks whether the notification belongs to the current account | **Direct account PII expected by the client** |
| `account_region` | Palestine/Jordan routing and regional guard | Account metadata |
| `parcel_code` | opens parcel detail | Linkable parcel identifier |
| `invoice_id` | invoice route | Linkable financial identifier |
| `transaction_number` | wallet lookup/detail; routing also reads amount, balances, status, and completion metadata when present | Linkable financial identifier and possible transaction details |
| `promotion_id`, `announcement_id`, `ticket_id` | respective routes | Object identifiers |
| `action_parameter_1` | JSON-parsed action parameters in a stored notification | Indirect payload container |
| `title`, `body`, `message` | display text | Arbitrary copy; actual content cannot be determined statically |

**[O]** `user_email` is @2180452, `parcel_code` @1768993, `invoice_id` @2183410, and `transaction_number` @1718243. **[L]** The client clearly supports email and object identifiers in notification data, but the artifact cannot show what a production FCM sender actually includes, whether every message carries them, or whether title/body contain recipient names, phones, or addresses. It therefore proves **PII-capable payload handling**, not universal payload contents.

### Tracking model

**[O]** Tracking surfaces include parcel history, scan history, notification summaries, guest parcel lookup by code/QR, custom `shiply://parcels/id=` / `shiply://parcels/qr=` links, and `/p` web deep links. Notification presses mark items read and route to parcel, invoice, ticket, promotion, announcement, or wallet screens as applicable.

**[NF]** No used driver-location upload, live polyline, driver GPS subscription, or external navigation handoff was established. Marketing copy saying “real time” and unused location constants do not prove live driver tracking. The proven model is status/history/scan tracking with notification-driven refresh.

---

## Bottom line

The strongest implementation evidence is a **city/village/street + coordinate address payload**, a numeric parcel enum with user-driven status mutations, **Delivery/Pay/Replace/Return(Purchase)** order types, an orthogonal same-day method with eligibility and revert paths, named money/fee/ledger fields, QR identity and scan history, local create drafts, and FCM/Notifee routing with explicit account/object keys.

The main negative findings are equally important: **no proven three-attempt state machine, no parcel landmark/default-address field, no recipient OTP/signature proof, no driver jobs/earnings/settlement/shift queue, no parcel outbox or idempotency key, and no proof of live GPS tracking or server-side transition/tariff enforcement.** These limits should be preserved when turning the atlas into Wind requirements.
