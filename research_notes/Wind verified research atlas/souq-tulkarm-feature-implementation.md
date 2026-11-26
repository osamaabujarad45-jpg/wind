# Souq Tulkarm — feature implementation map from the shipped JavaScript

**Subject:** `ps.souqtulkarm.app` v1.0.2 (versionCode 3), Souq Tulkarm / سوق طولكرم  
**Artifact:** `souqtulkarm__base.apk`, 4,153,798 bytes; SHA-256 `27dd269784d7ff81a87146455d4fd8011d57b556f8a23f7a896a62fc0aa88478`  
**Primary evidence:** `assets/public/assets/index-Bh9QEjtC.js` inside the APK (654,679 UTF-8 bytes; 618,519 decoded characters)  
**Study method:** lawful static competitive-architecture analysis only. The APK was opened as a ZIP with Python; the Vite/React bundle, service worker and Capacitor assets were read as UTF-8. Targeted regular-expression census plus surrounding-code inspection was used for endpoints, request fields, status maps, gates and Arabic literals. No APK was run, no backend was contacted, and no server response was captured.

> **Reading limitation.** This is **minified, bundled output, not the original source**. The APK contains no `.map` file. Short field names, endpoint paths and Arabic string literals below are quoted exactly; nearby logic is reconstructed from the minified expressions. `JS @n` anchors are zero-based **decoded-character offsets in Python**, not UTF-8 byte offsets. The unique literal/field name is the more durable anchor.
>
> **Evidence labels.** **[O]** = directly observed in client code or copy. **[I]** = inference from that client code, especially an expected state transition. **[U]** = not established by the artifact. Nothing here proves server-side validation, persistence, authorization, actual immutability, notification delivery or runtime behaviour.

This builds on `research_notes/REA-2026-11-13-reference-apps/SOUQ-TULKARM.md`; it checks the actual request construction and adds the second, listing-delivery order system rather than repeating the earlier summary.

## Material corrections and refinements to the earlier note

1. **`totalCents` is not sent in `POST /orders`.** It is a sibling of `payload` in the local recovery record; only `s.payload` is posted (JS @410788).
2. **Saved-address creation has no `notes` field and no edit call was found.** Its shape is `label`, `zoneId`, `addressLine`, `landmark`, `isDefault`; `notes` belongs to checkout and is labelled `ملاحظة للمحل` (“note for the shop”), not deletion notes (JS @482601, @418651).
3. **The offline outbox is opt-in, not universal.** Only calls supplying `queueAs` enter `souq.outbox`; those are driver custody/delivery/cash actions. Admin settlement, address writes, cancellation and many other mutations neither enqueue nor supply an idempotency key. Checkout and the two chat flows have separate recovery mechanisms (JS @199901 and the call-site census below).
4. **The main order enum is exactly ten statuses.** `PENDING_SETTLEMENT` is a shift state, `RETURN_REQUESTED` a custody action, `AWAITING_CUSTOMER` and `CASH_VARIANCE` dashboard-alert keys; they must not be flattened into the order enum (JS @233103, @456310, @529586).
5. **The ready queue is event-refreshed, not directly polled every ten seconds.** The shift is polled every ten seconds; `GET /driver/ready-queue` is loaded on active-status changes and on `order_updated`, `custody_updated`, `fleet_updated` (JS @248200, @502832).
6. **The admin proof-reset UI is not conditioned on a visible `deliveryProofLocked` field.** It is offered to an admin while the order is `IN_CUSTODY`; the driver learns of a lock only from error code `PROOF_LOCKED`. No failed-attempt threshold is shipped (JS @539900, @548355).

---

## 1. Address model

### 1.1 Saved address book: create and delete, not edit

**[O] Exact creation call** (JS @482601–484100):

`POST /addresses` with `{...i,isDefault:o}`, where the initial object is `{label:"",zoneId:"",addressLine:"",landmark:""}` and `o` is initially `false`.

Thus the wire-level shape is exactly:

`{label, zoneId, addressLine, landmark, isDefault}`

There is **no `notes`, `id`, `lat`, `lng`, postcode, street-number or separate building/floor field** in this request. Empty `landmark` remains an empty string here; unlike checkout, this call does not convert it to `undefined`.

| Field | UI label and requirement evidence | Actual client gate |
|---|---|---|
| `label` | `اسم العنوان` (“address name”), visually marked required; placeholder `البيت / الدوام` | **No non-empty/minimum check** in the Save button expression. The input itself has no `required` attribute in this modal. |
| `zoneId` | `المنطقة` (“zone”), visually required; options from `GET /public/zones` | Required: `!i.zoneId` disables Save. |
| `addressLine` | `العنوان التفصيلي` (“detailed address”), visually required | Required and **trimmed length at least 5**: `i.addressLine.trim().length<5` disables Save. The untrimmed state value is what goes into the request. |
| `landmark` | `علامة مميزة` (“landmark”) | Optional; no minimum or maximum in this form. |
| `isDefault` | Checkbox `اجعله العنوان الافتراضي` (“make it the default address”) | Boolean, initially false. |

**[O] Validation copy:** there is no special “five characters” error string. The button is simply disabled. Failure shows the server-provided message when available, otherwise `تعذر حفظ العنوان.` (“could not save the address”); success is `تم حفظ العنوان.` (JS @482859). **[U] Server-side required fields, trimming and length limits remain unknown.**

**[O] Other saved-address behaviour:**

- `GET /addresses` supplies the address book. Checkout chooses the first `isDefault` entry, otherwise the first entry, and copies `addressLine`, `landmark`, `zoneId` into the form (JS @409123, @409842).
- The address list renders `label`, `addressLine`, `zoneNameAr` and `(الافتراضي)` for the default (JS @477286).
- Deletion is `DELETE /addresses/${e.id}` followed by `تم حذف العنوان من قائمتك.` (JS @477446). It has no idempotency option in the client.
- A census of every `/addresses` occurrence found only list, create and delete. **No saved-address edit/update endpoint was found [O-negative]**, so an “edit address payload” is **not present [U]**, rather than something to invent.

### 1.2 Checkout address: related but not the same payload

**[O] Exact request construction** (JS @410788):

`POST /orders` receives `s.payload`, whose object literal is:

`{items:e.lines.map(e=>({productId:e.productId,quantity:e.quantity})),zoneId:l,windowId:d,deliveryDate:te,addressLine:p,landmark:h||void 0,notes:b||void 0,substitutionPolicy:S,saveAddressLabel:v||void 0}`

The outer local record is `{idempotencyKey:Fe(),totalCents:ce,payload:{...}}`; the call is `k.post("/orders",s.payload,{idempotencyKey:s.idempotencyKey})`. Therefore **`totalCents` and `idempotencyKey` are not JSON body members**. The key goes in the HTTP header; `undefined` optional values disappear during `JSON.stringify`.

Address-specific fields are consequently:

- `zoneId`, `addressLine` — required by the client;
- `landmark` — optional;
- `notes` — optional and explicitly labelled `ملاحظة للمحل (اختياري)` / `ملاحظة للمحل`, with hint `مثال: اتصل قبل الوصول، أو اترك الطلب عند الجيران.` (JS @418651);
- `saveAddressLabel` — optional save-as name, under `احفظ هذا العنوان باسم`, with hint `اتركه فارغاً إن لم ترد حفظه.`; there is no `isDefault` in the order body.

**[O] Checkout validation:** the detailed address textarea has `minLength:5` and `required:true`, and the submit guard contains `p.trim().length>=5`. The full guard also requires zone, window and delivery date and rejects a subtotal below the zone minimum: `!!l&&!!d&&!!te&&!D&&p.trim().length>=5` (JS @411859). Its detail hint is `الشارع، اسم البناية، رقم الطابق.` and its example is `مثال: شارع نابلس، بناية الأمل، الطابق الثاني`; the nearby landmark field is `علامة مميزة قريبة`, with hint `تساعد السائق على الوصول أسرع.` (JS @413715). This is free text, not distinct structured building/floor fields.

### 1.3 A separate listing-delivery address model exists

**[O] Community-listing delivery does not reuse `/addresses`.** Its quote body is built as `{pickupCity,dropoffCity,option,shared:false,pickupNote,dropoffNote}` and posted to the dynamically built path `/community/markets/{marketId}/listings/{listingId}/shipping/quote` (builder `Ui` at JS @289017; quote at @298073).

- `pickupCity` / `dropoffCity`: required city identifiers from `GET /community/shipping/config` → `cities`.
- `pickupNote`: required, trimmed, maximum 200; label `مكان الاستلام`, placeholder `عنوان واضح للبائع`.
- `dropoffNote`: required, trimmed, maximum 200; label `مكان التسليم`, placeholder `الحي والمعلم القريب`.
- `option`: `small`, `medium`, or `large` (`صغير`, `متوسط`, `كبير`), default `small`.

**[I]** The product therefore has two address patterns: a reusable **zone + detailed text + landmark** shop address, and a listing-specific **city pair + pickup/drop-off notes + parcel size** shipment request. They should not be merged into one alleged endpoint schema.

---

## 2. Append-only cash ledger

### 2.1 Endpoints and exact fields

| Stage | Observed request | Fields and client behaviour |
|---|---|---|
| Delivery collection | `POST /driver/delivery/confirm` (JS @517512) | `{orderId,proofInput,amountCollectedCents,discrepancyReason,...optional lat/lng}`. `discrepancyReason` is `undefined` when collected equals due. Uses an `Idempotency-Key` and `queueAs`. |
| Driver handover | `POST /driver/cash/handover` (JS @528315) | `{shiftId:u.shift.id,handoverAmountCents:Math.round(Number(i||0)*100),notes:o}`. `notes` is sent even when empty. Uses idempotency and `queueAs:"تسليم نقدية الوردية"`. |
| Admin physical count/settlement | `POST /admin/cash/settle` (JS @567363) | `{shiftId:n.shiftId,countedAmountCents:Math.round(Number(i||0)*100),resolutionNotes:o||void 0}`. Empty resolution notes are omitted. **No idempotency or outbox option is supplied.** A returned `status==="CLOSED"` closes the modal; any other status leaves it open and produces an informational toast. |
| Admin correcting entry | `POST /admin/cash/adjust` (JS @569143) | `{shiftId:c.shiftId,amountCents:Math.round(Number(u)*100),reason:f}`. The amount is signed; copy says negative deducts and positive adds. Reason is required by the button at trimmed length ≥3. No outbox/idempotency option. |
| Driver/admin read models | `GET /driver/cash`, `GET /admin/cash` | Driver sees shift summary and deliveries; admin sees shifts plus a `ledger` array. |
| Admin forced shift closure | `POST /admin/shifts/${shiftId}/close` with `{reason}` | Reason trimmed length ≥3. Success copy: `أُغلقت الوردية وانتقلت لانتظار عدّ النقدية.` This does **not** count or close cash (JS @562117). |

### 2.2 Exact append-only copy

**[O] Admin ledger rule** (JS @567087):

> `القيود لا تُعدَّل ولا تُحذف. أي تصحيح يُسجَّل كقيد تسوية جديد باسمك وبسببه.`

Meaning: entries are not edited or deleted; every correction becomes a new adjustment entry attributed to the admin and its reason.

**[O] Adjustment-specific rule** (JS @569494):

> `استخدم قيمة سالبة للخصم وموجبة للإضافة. القيد يُضاف ولا يعدّل أي سطر سابق.`

**[O] Driver restriction** (JS @528100):

> `لا تستطيع تعديل أي مبلغ بعد تسجيله، ولا تحديد النقدية كـ«مستلمة» — العدّ والإغلاق من صلاحية الإدارة وحدها.`

**[O] Privacy/role page reinforces the same product rule:** `الإدارة ترى العمليات والسجلات المالية، ولا تستطيع حذف أي سجل عهدة أو نقد — التصحيح يكون بقيد جديد.` (JS @493378).

**[U]** These literals and the lack of edit/delete client endpoints are strong evidence of the intended design, but they cannot prove database append-only enforcement or the absence of privileged server tooling.

### 2.3 Ledger representation and variance

**[O] Ledger row fields rendered by the admin:** `id`, `type`, `orderShortId`, `driverName`, `notes`, `amountCents`, `createdAt`. The type-to-Arabic map at JS @562786 is:

- `EXPECTED` → `متوقع`
- `COLLECTED` → `محصَّل`
- `HANDOVER_SUBMITTED` → `سلّمه السائق`
- `COUNTED_BY_ADMIN` → `عدّته الإدارة`
- `ADJUSTMENT` → `تسوية`

`amountCents` is rendered with an explicit sign. This is an append-oriented read model; the artifact does not expose its server table schema.

**[O] There are three related but distinct variance calculations:**

1. **At the door:** `amountCollectedCents - (finalTotalCents ?? totalAmountCents)`. The UI renders it as signed `فرق` and requires a discrepancy reason before enabling confirmation. The reason values are exactly `PARTIAL_PAYMENT`, `CUSTOMER_DID_NOT_PAY`, `APPROVED_DISCOUNT`, `RETURNED_ITEMS`, `INCORRECT_CASH`, `OTHER_ADMIN_REVIEW` (JS @516198). The delivery-history row independently computes `amountCollectedCents-amountDueCents` and displays it as `عن المطلوب`.
2. **Driver declaration versus recorded collection:** `handedOverCents-collectedCents`. Admin copy says `المبلغ الذي أعلنه السائق يختلف عن المسجَّل ... اعدّ النقد فيزيائياً قبل الإقفال.`
3. **Physical count versus recorded collection:** `countedAmountCents-collectedCents`. The settlement dialog displays `الفرق عن المسجَّل` and says the shift will not close before the difference’s reason and decision are recorded. Separately, the driver summary renders server-returned `countedCents` and signed `varianceCents` when `countedCents!==null`.

**Important client/copy mismatch [O]:** `resolutionNotes` is marked required when the physical count differs, and the copy says it is mandatory, but the settlement button has no notes-based `disabled` guard. The request simply omits empty notes. Whether the server rejects that case is **[U]**.

`CASH_VARIANCE` is an admin-pulse alert key (`وردية بانتظار عدّ النقدية`), not a ledger entry type. The shift state `PENDING_SETTLEMENT` means awaiting admin count; it is not an order status.

---

## 3. Delivery proof

### 3.1 Customer-held code and QR

**[O] Fields:** `deliveryCode` and `deliveryQrToken`. The customer order screen shows them only when `deliveryCode` exists and status is `PACKED_READY` or `IN_CUSTODY` (JS @463199, @468555). The numeric code and QR are alternative inputs to the same driver field, `proofInput`.

**[O] Exact customer copy:**

> `أعطِ هذا الكود للسائق عند الاستلام، أو اعرض له رمز الـ QR. بدونه لا يستطيع إغلاق التسليم.`

> `هذا الرمز يخصك أنت وحدك ولا يحتوي على اسمك أو عنوانك أو مبلغ الطلب. لا تشاركه إلا مع السائق لحظة الاستلام.`

This privacy statement covers **name, address and order amount**. It is product copy; token contents were not decoded and actual token entropy/signing cannot be verified here.

**[O] Driver proof step:** copy asks for `كود التسليم المكوّن من أربعة أرقام` or the customer QR and explicitly says `الموقع وحده لا يُغلق التسليم.` The confirmation payload is:

`{orderId,proofInput,amountCollectedCents,discrepancyReason,...await Hs()}`

`Hs()` optionally adds `lat` and `lng`; geolocation failure yields no coordinates. The button requires `IN_CUSTODY`, non-empty proof, a finite non-negative collected amount, a discrepancy reason when needed, and no local lock. Although copy says four digits, the manual input only checks non-empty text—there is no four-digit client guard (JS @517512–521800).

**[O] Distinct package credential:** `package.qrToken ?? package.shortCode` is printed on the bag for custody scans. It is not `deliveryQrToken`. The printed package label can include customer name and zone, so the delivery-token privacy sentence must not be generalized to the bag label (JS @549690).

### 3.2 Lock and admin reset

- **[O] Lock signal:** the only lock token is API error code `PROOF_LOCKED`. On receiving it, the driver sets local lock state, disables confirmation and offers `تحديث بعد مراجعة المحل` (“refresh after shop review”) (JS @517775). **[U] Attempt count, lock duration and persistence are not in the bundle.**
- **[O] Reset:** for an `admin` role on an `IN_CUSTODY` order, `POST /admin/orders/${orderId}/proof-reset` with exactly `{reason:v}` (JS @548355). The reason textarea has `maxLength:500`; the button requires trimmed length ≥5.
- **[O] Reset is not delivery bypass:** copy says `أعد فتح المحاولات بعد مراجعة المشكلة مع الزبون. هذا الإجراء لا يؤكد تسليم الطرد.` Success says `أُعيد فتح محاولات الكود. ما زال إثبات التسليم مطلوباً.`
- **[O] Audit vocabulary:** the audit-label map contains `DELIVERY_PROOF_EXCEPTION: "استثناء إثبات تسليم"` (JS @583850), and order history renders `toStatus`, `reason`, `createdAt`. **[I]** The reason-required reset plus that audit event strongly indicates an audited exception path; **[U]** the static client cannot prove that every reset emits that exact server audit row.
- **[O] Role/privacy copy:** `السائق يرى الطلبات المسندة إليه أثناء الوردية، ولا يرى كود تسليم الزبون ولا بيانات زبائن آخرين.` The driver UI indeed never renders `deliveryCode`; **[U]** role-filtering of the actual `/orders/{id}` response is server-side and unverified.

---

## 4. Driver model

### 4.1 Shift gate and ready queue

**[O] Shift calls:** `GET /driver/shift`; `POST /driver/shift/start` with `{vehicleScan,...optional lat/lng}` and an idempotency key; tracking/health calls are `/driver/shift/location`, `/driver/shift/tracking`, `/driver/shift/location-health`.

- Only `shift.status==="ACTIVE"` exposes custody/route/transfer/return controls and loads `GET /driver/ready-queue` (JS @502832).
- Vehicle copy: `امسح رمز الـ QR الملصق داخل السيارة. المسح يثبت أي سيارة تقودها ويشغّل تتبع الموقع طوال الوردية فقط.` Shift start has an idempotency key but **no `queueAs`**, so it is not an offline-outbox action.
- For `PENDING_SETTLEMENT`, the UI says `ورديتك السابقة بانتظار عدّ النقدية من الإدارة. يمكنك بدء وردية جديدة بعد إغلاقها.` **[O]** The vehicle-scan button is nevertheless not disabled by that flag; actual rejection/acceptance is **[U]**.
- The driver provider refreshes the shift every 10 seconds and on `fleet_updated`. The ready queue reloads on `order_updated`, `custody_updated`, `fleet_updated`, not on that 10-second timer.
- Admin force-close moves the shift to awaiting count according to the success copy; it does not settle cash. Audit labels include `SHIFT_STARTED`, `SHIFT_FORCE_CLOSED`, `HANDOVER_SUBMITTED`, `SHIFT_SETTLED`.

**[O] Ready-queue entry fields used by the UI:** `packageId`, `shortCode`, `mine`, `selectable`, `blockedReason`, `customerName`, `deliveryAddress`, `zoneNameAr`, `windowTitleAr`, `amountDueCents`. `mine` renders `مخصص لك`; a non-selectable row can show its `blockedReason`. The single scan action says `مسح ملصق طرد لاستلامه`.

**[O] Assignment policy:** `POST /admin/dispatch/assign` sends `{packageId,driverId}` where `driverId` may be `null` to unassign, and operates on `GET /orders?status=PACKED_READY` plus active drivers from `GET /admin/fleet` (JS @554042). Store setting `driverSelfSelect` has choices `السائق يختار من الطرود الجاهزة` and `الإدارة تخصص الطرود فقط`; its hint says that when disabled a driver cannot take a parcel not assigned by admin (JS @598728). **[U]** The actual selectable/assignment rule is enforced server-side and cannot be proven from the generic scan button.

**[O] Route:** `GET /driver/route` returns the parcels currently in custody, presented as `الطرود التي في عهدتك الآن، مرتبة حسب المنطقة.` The client sums `amountDueCents`. Opening a delivery screen fires `POST /driver/delivery/approaching` with `{orderId}` and deliberately ignores errors; this is a milestone notification, not a displayed order-status enum value.

### 4.2 Scan intents and custody movement

| UI intent | Exact request | Custody meaning visible in client |
|---|---|---|
| `VEHICLE` | `POST /driver/shift/start {vehicleScan:scan,lat?,lng?}` | Associates the shift with the scanned vehicle and enables the active-shift interface. |
| `CUSTODY` (default scan) | `POST /driver/custody/scan {scan,lat?,lng?}`; `queueAs:"استلام طرد"` | Takes a ready parcel by bag QR/manual short code. Response `status==="ALREADY_IN_CUSTODY"` is shown as information rather than a generic success. |
| `TRANSFER` | `POST /driver/custody/transfer {scan,lat?,lng?}`; `queueAs:"تحويل عهدة"` | Recipient accepts a parcel offered by another driver. |
| `OFFER` | First `GET /driver/peers`; then `POST /driver/custody/offer-transfer {scan,toDriverId}`; `queueAs:"عرض تحويل طرد"` | Does **not** immediately move custody. Copy says the parcel and expected amount remain the original driver’s responsibility until the other driver scans it; then the expected amount moves to that driver’s shift and the chain records two scans (JS @511465). |
| `RETURN`, driver stage | `POST /driver/custody/return {scan,reason,lat?,lng?}`; `queueAs:"طلب إرجاع طرد"`; reason trimmed length ≥3 | Registers a return request only. Copy: `يبقى الطرد والمبلغ المتوقع في عهدتك حتى يستلم موظف المحل الطرد ويمسح ملصقه.` |
| Shop return confirmation | Same `POST /driver/custody/return`, but `{scan,reason,orderId}` and idempotency only | Shop copy explicitly says `المسح ينقل العهدة إلى المحل.` This is the second scan that completes return custody (JS @549690). |

**[O] Manual entry is not invisible:** `كل إدخال يدوي يُسجَّل في سجل العهدة.` The custody-chain reader is `GET /orders/{id}/custody-chain`; rendered row fields are `action`, `createdAt`, `actorName`, `vehicleName`, `source`, `latitude`, `longitude`, `notes`. Sources are `QR_SCAN`, `SHORT_CODE`, `ADMIN_ACTION`.

**[O] Custody action vocabulary, separate from order statuses:** `PACKED`, `ACCEPTED_BY_DRIVER`, `TRANSFERRED_OUT`, `TRANSFERRED_IN`, `DELIVERED`, `RETURN_REQUESTED`, `RETURNED_TO_SHOP`, `VOIDED`, with Arabic labels at JS @456447. This is the concrete two-sided custody model: pack/issue → driver accepts → optional paired transfer → delivered, or return requested → shop confirms; cancellation can void the label.

---

## 5. Order lifecycle

### 5.1 Main shop-order enum: every status and its client-visible trigger

The authoritative **client display map** at JS @233103 has exactly these ten order statuses. Targets below are necessarily **[I]** unless stated otherwise: the JavaScript issues an action and reloads the order; the server writes the actual state.

| Status | Exact customer / staff label | Trigger evidence and limits |
|---|---|---|
| `NEW` | `طلب جديد` / `جديد` | **[I]** Initial state after `POST /orders`; packing start button exists only in this state. |
| `PACKING` | `قيد التجهيز` | **[I]** `POST /packing/{id}/start` from `NEW`; success `بدأ تجهيز الطلب.` |
| `AWAITING_DECISION` | `بانتظار ردك` / `بانتظار الزبون` | **[I]** Packing can create approvals for substitutions/price changes. Customer or admin calls `POST /approvals/{approvalId}/decide` with `{approve}` or `{approve,note}`. Admin phone notes are `موافقة هاتفية سجّلتها الإدارة` / `رفض هاتفي سجّلته الإدارة`. **[U]** Exact post-decision target is not literal, although packing/finish supports both `PACKING` and this state once no `PENDING` approvals remain. |
| `PACKED_READY` | `جاهز للتوصيل` / `جاهز` | **[I]** `POST /packing/{id}/finish {}` while packing/awaiting decision and with zero pending approvals; success `تم إنهاء التعبئة وإصدار ملصق الطرد.` Dispatch queries exactly this status. |
| `IN_CUSTODY` | `مع السائق` | **[I]** Driver bag scan `/driver/custody/scan` (or accepted transfer) after ready/assignment; custody event is `ACCEPTED_BY_DRIVER`. Delivery confirmation is enabled only here. |
| `DELIVERED` | `تم التسليم` | **[I]** Successful `/driver/delivery/confirm` with proof and collected cash. The code disappears because the customer display gate no longer matches. |
| `DELIVERY_FAILED` | `تعذر التسليم` | **[I]** `POST /driver/delivery/fail {orderId,reason,note,lat?,lng?}`. Copy instructs returning the parcel; while `package.status==="IN_CUSTODY"`, admin sees `بانتظار رجوع الطرد`, proving failure and physical custody are separate axes. |
| `RETURNED` | `أُعيد للمحل` / `مُرتجع` | **[I]** Shop confirms the physical return with the second `/driver/custody/return` scan. Only then does the UI offer reissue/cancel decisions: `الطلب لا يُغلق من تلقاء نفسه.` |
| `CASH_SETTLED` | `مغلق ومسوّى` / `مسوّى` | **[I]** Final cash-closed display state associated with the settlement flow. `/admin/cash/settle` is the only cash-close writer found. **[U]** The exact server rule that changes each order from `DELIVERED` to `CASH_SETTLED` is not in the JavaScript. |
| `CANCELLED` | `ملغي` | **[I]** `POST /orders/{id}/cancel {reason}`; reason trimmed length ≥3. Customer UI offers it only in `NEW`; admin detail offers it in `NEW`, `PACKING`, `AWAITING_DECISION`, `PACKED_READY`, and from the `RETURNED` decision card. Admin copy says cancellation voids the label, releases reserved quantities and retains the reason. |

**[O] Additional transitions that do not add new enum values:**

- From `RETURNED`, `POST /packing/{id}/reissue {}` uses an idempotency key and success copy `تمت إعادة التجهيز بملصق جديد...`; **[U] its exact target status is not stated**.
- `POST /driver/delivery/approaching` is fired when the driver opens the delivery screen; no corresponding main status exists.
- Order history renders `events[].toStatus`, `reason`, `createdAt`; no complete transition table or allowed-transition response is embedded.

**[O] Typed delivery-failure reasons, not statuses:** `CUSTOMER_UNREACHABLE`, `CUSTOMER_REFUSED`, `WRONG_ADDRESS`, `ACCESS_BLOCKED`, `CUSTOMER_RESCHEDULED`, `OTHER`. A reason is required; `note` is free text. No collected amount is recorded by the fail UI: `لن يُسجَّل أي مبلغ محصّل.`

**[O] Item-level states, also not order statuses:** `CONFIRMED`, `SHORTAGE`, `SUBSTITUTED`, `REMOVED` (JS @460067). Packing posts `finalWeighedQuantity`, `itemStatus`, and optionally `substituteProductId`. Approval rows have at least `status==="PENDING"`, `detailAr`, `deltaCents`; approval audit events are `APPROVAL_ACCEPTED` and `APPROVAL_REJECTED`.

### 5.2 Community-listing delivery has a separate 15-value lifecycle

**[O]** The `Hi` display map at JS @289017 defines a different, lower-case lifecycle. This flow is labelled `التوصيل مع ويند` and must not be confused with the grocery enum.

| Status | Exact Arabic label | Writer/trigger visible in this artifact |
|---|---|---|
| `awaiting_seller` | `بانتظار البائع` | **[I]** Initial request after buyer submits trip, quote and `requestId`; seller decision UI is available here. |
| `approved` | `وافق البائع` | **[I]** Seller calls `/community/shipping/{requestId}/decision {approve:true}`; buyer can then confirm. |
| `submitting` | `جارٍ تأكيد التوصيل` | **[O]** A display/confirmable state; **[U] exact writer and target**. |
| `booked` | `تم تأكيد التوصيل` | **[O]** Display state only; no direct booking writer is visible in this module. |
| `declined` | `رفض البائع الطلب` | **[I]** Seller decision `{approve:false}`; buyer may start again. |
| `searching` | `بانتظار سائق` | **[O]** Display state; cancel is offered here and in `assigned`. Driver-side assignment writer is not present in this module. |
| `assigned` | `تم تعيين سائق` | Same as above. |
| `at_pickup` | `السائق عند الاستلام` | **[O]** Display state only; external/driver transition not shipped here. |
| `in_transit` | `الطرد في الطريق` | **[O]** Display state only. |
| `completed` | `تم التسليم` | **[O]** Display state; tracking link is no longer offered. |
| `cancelled` | `ملغي` | **[I]** Result of `/community/shipping/{requestId}/cancel {}` at an eligible stage. |
| `cancel_requested` | `جارٍ إلغاء الطلب` | **[O]** UI can show `متابعة الإلغاء`; exact server staging is unknown. |
| `on_hold` | `تعذّر التسليم — بانتظار ويند` | **[O]** Display state meaning awaiting the Wind operator; no resolution writer here. |
| `returning` | `الطرد عائد للبائع` | **[O]** Display state only. |
| `returned` | `أُعيد الطرد للبائع` | **[O]** Terminal display state; seller can be shown a separate `returnCode`. |

**[O] Buyer actions:** quote → submit to seller → seller approve/decline → buyer `/confirm {}` → later `/cancel {}` where eligible. `POST /community/shipping/{requestId}/track {}` returns a `{url}` opened for map tracking; it does not itself advance state. `handoverCode` is shown for eligible active orders, while `returnCode` is a distinct seller-return proof. **[U]** These two codes are not the grocery `deliveryCode`/`deliveryQrToken`, and no QR token for them is visible in this module.

---

## 6. Offline and idempotency

### 6.1 The actual outbox

**[O] Storage:** `localStorage["souq.outbox"]` contains a JSON array (JS @199228). Each queued record has exactly these client-written members:

`{id,scope,method,path,body,label,queuedAt,attempts}`

- `id` is the idempotency key, normally `crypto.randomUUID()`.
- `scope` is `JSON.stringify([session.id,session.storeId,session.role])` and is also sent as `X-Actor-Scope`.
- `body` is a parsed JSON value (or `null`), not the raw JSON string.
- `label` is the human-readable `queueAs` value.
- `queuedAt` is `Date.now()`; `attempts` starts at zero; a later `error` member is added for a rejected action.

**[O] Request helper:** JSON requests can carry `Authorization: Bearer …`, `X-Actor-Scope`, and `Idempotency-Key`. Fetch uses a 20-second `AbortSignal.timeout`. A network/read failure enqueues only if `queueAs` was supplied; HTTP 429 and ≥500 do the same. Other HTTP errors do not enter this queue (JS @199901).

**[O] Duplicate protection before enqueue:** if the same scoped key already exists with a different method, path or serialized body, the helper throws `IDEMPOTENCY_CONFLICT` with:

> `الإجراء المحفوظ له بيانات مختلفة. راجعه قبل المحاولة.`

An identical existing record is not duplicated. The user-facing queued error is code `QUEUED` with:

> `حُفظ الإجراء على جهازك. بانتظار الاتصال.`

A localStorage write failure throws code `QUEUE_STORAGE`:

> `تعذر حفظ الإجراء على الجهاز. أبقِ الصفحة مفتوحة وحاول مرة أخرى.`

**[O] Replay:** queued actions flush sequentially on the browser `online` event, when a signed-in session is online, and through manual `إعادة الإرسال`. Retryable cases are network/status 0, 401, `SESSION_CHANGED`, 429 and ≥500; attempts increment and the flush stops after a retryable failure. Other errors remain in the queue with `error` and are excluded from subsequent automatic replay. `SESSION_CHANGED` copy is `تغير الحساب المستخدم. أعد المحاولة بحسابك الحالي.`

**[O] User presentation:** the modal title is `الإجراءات المعلّقة`, explains `لم يؤكد الخادم هذه الإجراءات بعد.`, shows each label/time, and marks unsent rows `بانتظار التأكيد`. Banner states include `${h} إجراء بانتظار الإرسال.`, `لا يوجد اتصال — الإجراءات المعلّقة محفوظة على الجهاز.`, and `تعذر الوصول للخادم، جارٍ إعادة المحاولة.` A rejected local action can be deleted only after `حذف «…» من هذا الجهاز؟ الإجراء لن يُنفّذ.` This deletes an **unsent local intent**, not a cash/custody ledger entry.

**[O] Legacy unscoped entries:** old records without scope show under `إجراءات قديمة تحتاج مراجعة`; alphanumeric content in their labels is masked with `•••`. Recovery requires signing in, checking `أؤكد أن الإجراءات التي أستعيدها تخص هذا الحساب`, then `استعادة إلى حسابي`.

**[O] Exact queued labels in this bundle:**

- `استلام طرد`
- `تحويل عهدة`
- `طلب إرجاع طرد`
- `عرض تحويل طرد`
- `تسليم الطلب ${shortId}`
- `تعذر تسليم ${shortId}`
- `تسليم نقدية الوردية`

Thus the durable outbox is focused on **driver custody, delivery and cash handover**. `POST /admin/cash/settle`, `/admin/cash/adjust`, `/orders/{id}/cancel`, `/addresses`, shift tracking and many admin writes have no `queueAs`; they are not covered by it.

**[O] Service worker limit:** `assets/public/sw.js` contains `activate`, `push` and `notificationclick` handlers only—no `fetch` or `sync` handler. **[I]** There is no evidence of service-worker background outbox replay; the visible replay implementation lives in the mounted React provider and browser online/manual events. Actual WebView background execution is **[U]**.

### 6.2 Separate recovery paths that are not `souq.outbox`

1. **Shop checkout [O]:** key `souq.checkout.${session.id}.${session.storeId}` in **localStorage** (JS @408852). Before the request it stores `{idempotencyKey,totalCents,payload}`; retries use the same key. On success it removes the record. On most definitive 4xx errors it also removes it, except 401/408/429 and `SESSION_CHANGED`/`IDEMPOTENCY_CONFLICT`. Recovery copy says `لم يصل تأكيد الطلب. المتابعة تستخدم نفس الطلب حتى لا يُنشأ طلب مكرر.` The loader validates the key, non-empty items, required string fields and safe-integer `totalCents`.
2. **Listing delivery request [O]:** key `souq.shipping-request.${userIdOrGuest}.${marketId}.${listingId}` in **sessionStorage** (JS @293461). It stores `{trip,price,requestId}`; submit sends `{...trip,quotedPrice:price,requestId}`. **`requestId` is a body field here, not an `Idempotency-Key` header supplied by this call [O].** It is reused on retry and rotated after success/definitive rejection. Calling it a proven server idempotency key would be **[I]**.
3. **Shop/community chat [O]:** separate sessionStorage draft keys retain `content`, `clientId`, `pending`; shop chat passes `clientId` as the HTTP idempotency key, while community chat sends it in the message body. They are not in the driver outbox.
4. **Delivery proof retry [O]:** the delivery screen creates its idempotency UUID once in component state, so repeated confirmation from that screen reuses it; queued replay uses the persisted queue id.

**[O] Storage caution visible from the implementation:** outbox bodies are JSON-serialized directly to localStorage. That includes driver proof/cash payloads. No encryption step exists in this outbox helper; the native encrypted-session mechanism is separate. Runtime device compromise impact was not tested.

---

## 7. Fees, promotions and order types

### 7.1 Shop-order fees and final total

**[O] Money representation:** shop/cash values use integer `…Cents`; the formatter divides by 100, renders two decimals and `₪`, with optional explicit sign (JS @232165). Cash entry converts shekels back with `Math.round(Number(value)*100)`.

**[O] Checkout estimate:** the client computes `subtotalCents` as the sum of `Math.round(priceCents*quantity)` and displays `subtotalCents + selectedZone.deliveryFeeCents`. Zone data also supplies `minOrderCents`; below it, copy says how much more must be added. `GET /public/schedule?zoneId=${zoneId}&days=7` supplies dates/windows with `selectable`, `remainingCapacity`, `cutoffTime`, `disabledReason` (JS @409426, @416306).

**Crucial request distinction [O]:** this computed `ce` is stored as recovery-only `totalCents`; it is **not posted**. The server receives items, zone/window/date, address and policies. **[I]** This is consistent with server-authoritative order pricing, but actual server calculation/validation is **[U]**.

**[O] Order response/read fields:** `subtotalCents`, `deliveryFeeCents`, `totalAmountCents`, nullable `finalTotalCents`. UI labels the total `الإجمالي التقديري نقداً` while final is null and `الإجمالي النهائي نقداً` afterwards. Driver collection uses `finalTotalCents ?? totalAmountCents`; route/cash views call it `amountDueCents`.

**[O] Zone administration:** `POST /admin/zones` sends `{zoneId,nameAr,deliveryFeeCents,minOrderCents,activeDays}`. The new-zone form initializes fee/minimum as `5.00`/`30.00`, but those are **form defaults, not evidence of the deployed fee schedule**. Actual live zone values are not in the APK.

**[O] Window/capacity administration:** `POST /admin/windows` sends `{windowId,titleAr,startTime,endTime,cutoffTime,capacityOrders}`. Capacity copy says it is the maximum orders accepted by that window per day. Vehicle `capacityBoxes` and store `maxStopsPerVehicle` are separate driver-capacity controls.

**[O] Weight/substitution adjustment:** `priceTolerancePct` is a store setting described as `حد تغيير الإجمالي المقبول دون سؤال الزبون`; its hint specifically says any **increase** above it goes for customer approval. Order substitution choices are exactly:

- `NO_SUB` — `بدون بدائل`
- `CONTACT_FIRST` — `اسألني أولاً`
- `BEST_EQUIVALENT` — `اختر لي الأنسب`

Approvals expose signed `deltaCents`; item changes use `finalWeighedQuantity`, `SHORTAGE`, `SUBSTITUTED`, `REMOVED`. This is a final-total/consent mechanism, not a promo engine.

### 7.2 Listing-delivery quote

**[O] Quote request:** `{pickupCity,dropoffCity,option,shared:false,pickupNote,dropoffNote}` to the listing’s `/shipping/quote`. The returned `price` is displayed directly as `₪`, and recovery validation requires a positive safe integer; unlike grocery money, this module uses `price`/`quotedPrice`/`order.price`, not `…Cents`.

**[O] Submit request:** `{pickupCity,dropoffCity,option,shared:false,pickupNote,dropoffNote,quotedPrice,requestId}` to the listing’s `/shipping`. UI copy is `التكلفة منفصلة عن ثمن القطعة` (“delivery cost is separate from the item price”). The only size/order options are `small`, `medium`, `large`, and `shared` is hard-coded false. **[U]** Quote formula, currency minor-unit convention, delivery-payment method and any cash collection for this second flow are not exposed; do not infer COD merely from the shop flow.

### 7.3 Promotions/discounts: what exists and what does not

- **[O] Daily price override:** catalogue entries use `basePriceCents`, `priceCents`, `discounted`; discounted products show `سعر اليوم` and the base price struck through. Admin posts `POST /admin/catalogue/availability {productId,isAvailable,priceOverrideCents}`. Blank input becomes `null` to return to base price; non-null values must be finite and >0 (JS @570727).
- **[O] Approved door discount:** `APPROVED_DISCOUNT` is one `discrepancyReason` when actual cash collected differs from amount due. It is not evidence of a coupon/promotion entity.
- **[O-negative] No promo-code implementation found:** full-bundle case-insensitive searches returned zero for `coupon`, `promoCode`, `promotion`, and zero for `orderType`/`order_type`. The two `promo` hits are CSS class names for home cards. The 167 literal HTTP call-site census contains no coupon/promo endpoint. **[U]** A server-only promotion cannot be ruled out, but there is no shipped client flow for one.
- **[O] Marketplace price offers are different:** `MARKET_OFFER` and buyer/seller `amountCents`/`counterCents` are negotiation over a second-hand listing, not discount coupons.

### 7.4 Order types are separate flows, not an `orderType` field

| Flow | Creation endpoint and discriminating fields | Logistics/payment model proven in client |
|---|---|---|
| Shop grocery/goods order | `POST /orders`; `items[{productId,quantity}]`, `zoneId`, `windowId`, `deliveryDate`, `substitutionPolicy`, address fields | Zone fee/minimum, capacity window, packing/weighing, package custody, customer delivery proof, integer-cent COD and shift cash ledger. |
| Community listing delivery | Dynamic `/community/markets/{market}/listings/{listing}/shipping`; city pair, pickup/drop-off notes, `option`, `shared:false`, `quotedPrice`, `requestId` | Seller approval then a separate Wind-labelled delivery lifecycle, map-tracking URL, handover/return codes. Delivery price is separate from item price; payment collection is unknown. |
| Direct community marketplace sale | Listing/offer/message endpoints, not `POST /orders` | Copy says buyer and seller arrange a public meeting and payment directly; optional listing delivery above is a separate choice. This is not evidence of another COD ledger order type. |

---

## Evidence boundaries and implementation takeaways

- The strongest directly portable **shapes** are: saved address `{label,zoneId,addressLine,landmark,isDefault}`; driver handover `{shiftId,handoverAmountCents,notes}`; settlement `{shiftId,countedAmountCents,resolutionNotes}`; delivery `{orderId,proofInput,amountCollectedCents,discrepancyReason}`; and outbox record `{id,scope,method,path,body,label,queuedAt,attempts}`.
- The lifecycle is deliberately **multi-axis**: ten shop-order states, eight custody actions, item states, approval state, shift state, cash-ledger types and a separate 15-state listing-delivery enum. Combining them into one status field would misrepresent the shipped design.
- The most important negative findings are the absence of saved-address edit, promo-code flow, universal mutation queueing, a visible proof-attempt threshold, and a client `orderType` enum.
- Still unknown: all server-side transition guards and persistence, actual append-only enforcement, response schemas beyond fields the client reads, live fees, quote calculation, proof generation/lock parameters, background WebView behaviour and runtime network behaviour. These require server evidence or authorized runtime testing and are deliberately not claimed here.
