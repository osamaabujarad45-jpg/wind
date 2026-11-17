# SOUQ TULKARM (سوق طولكرم) — static REA reference (Palestinian regional Android app)

**Artifact:** `ps.souqtulkarm.app` v1.0.2 (versionCode 3)
**Study date:** 2026-11-13 · **Method:** static only (no execution, no device)
**Engine:** REA 6.7.0 / jadx-headless-mcp 0.7.1 · **Artifact SHA-256:** `27dd269784d7ff81a87146455d4fd8011d57b556f8a23f7a896a62fc0aa88478`

> **The single most useful artifact for Wind's cash-and-custody design.** Souq Tulkarm is a
> **local marketplace + delivery app for Tulkarm, Palestine**, shipped as a **Vite + React
> web app wrapped in Capacitor**. Unlike Shiply, almost all of its product logic is
> **plain, readable JavaScript** in `assets/public/assets/index-Bh9QEjtC.js` (654,679 bytes,
> minified but unminified-enough to read).
>
> It contains, in shipped code, the exact things Wind's brief names: **landmark addressing
> with no street numbers**, **cash-only with an append-only auditable ledger**, **a driver
> job board**, **a chain of custody**, **delivery windows per zone**, and **an offline write
> queue for 2G/3G**. It is also the only app in the set with **no WhatsApp integration**
> (a notable negative finding for Wind's brief).

---

## 1. Artifact identity

| Field | Value | Source command |
|---|---|---|
| Package | `ps.souqtulkarm.app` | `rea inspect-android-package souqtulkarm__base.apk --format json` → `normalized_result.package_name` |
| versionName / versionCode | `1.0.2` / `3` | same → `version_name`, `version_code` |
| Base APK size | 4,153,798 bytes (3.96 MiB) | `Get-ChildItem` on the APK set |
| Base APK SHA-256 | `27dd269784d7ff81a87146455d4fd8011d57b556f8a23f7a896a62fc0aa88478` | `rea inspect-android-package` → `subject.digest.sha256` (matches `Get-FileHash -Algorithm SHA256`) |
| DEX files | **1** (`classes.dex`, 8,433,724 bytes) | ZIP central-directory listing |
| Class count | **4,092** (`raw_class_count` 4,092) | `rea inspect-android-package` → `normalized_result.class_count` |
| Resource count | **510** | same → `normalized_result.resource_count` |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 | same → `min_sdk`, `target_sdk`; manifest `android:compileSdkVersion="36"` |
| Signer | **not exposed** — `signature_verification: "not_performed"` | same |
| REA evidence id | `ev_e5035a642869880a5fdd3a3fa26d77738a9a74061835ef4c04fd208e6ee7188d` | same |
| App name | `string/app_name` = `"سوق طولكرم"` | `aapt2 dump resources souqtulkarm__base.apk` |
| Web app name (Capacitor) | `"appName": "سوق"` | `assets/capacitor.config.json` |
| App description (meta) | `"سوق — أسواق محلية للمجتمعات في فلسطين. بيع وشراء داخل مدينتك، جامعتك، ومجتمعك."` | `assets/public/index.html` `<meta name="description">` |
| Backend base URL | `https://souq-production-52a0.up.railway.app/api` | bundle @198587 |

**Tooling note.** `rea decode-android-resources` failed closed here too
(`capability_unavailable / unsupported_provider` — "apktool launcher was not found on the
selected Windows PATH/PATHEXT"); `aapt2` from `build-tools\36.1.0` was used instead.
`rea extract-artifact` is unusable on case-insensitive filesystems for this APK family
(`res/9n.9.png` vs `res/9N.9.png` collision), so assets were read from the ZIP central
directory directly.

---

## 2. Declared surface

**Permissions (7)** — `rea inspect-android-package` → `normalized_result.permissions`:
`INTERNET`, `CAMERA`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`,
`com.android.vending.BILLING`, `ACCESS_NETWORK_STATE`,
`ps.souqtulkarm.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.

**Observation:** this is a **minimal** permission set — no background location, no
notification permission (it uses **Web Push**, not FCM), no storage, no overlay windows.

**Components** (manifest `normalized_result.manifest.text`):

| Component | Exported | Notes |
|---|---|---|
| `ps.souqtulkarm.app.MainActivity` | yes | LAUNCHER; `launchMode="singleTask"`; Capacitor `BridgeActivity` subclass |
| `androidx.core.content.FileProvider` (authority `ps.souqtulkarm.app.fileprovider`) | no | `@xml/file_paths` |
| `com.android.billingclient.api.ProxyBillingActivity` / `ProxyBillingActivityV2` | no | Play Billing 8.3.0 |
| `com.google.android.gms.common.api.GoogleApiActivity` | no | Google Play services |
| `com.google.android.datatransport.runtime.backends.TransportBackendDiscovery` + `JobInfoSchedulerService` + `AlarmManagerSchedulerBroadcastReceiver` | no | **Firebase datatransport is present** (measurement/CCT) |
| `androidx.startup.InitializationProvider` (EmojiCompat, ProcessLifecycle, ProfileInstaller) | no | |
| `androidx.profileinstaller.ProfileInstallReceiver` | yes (`DUMP`) | baseline profile |

**Deep links:** **none declared.** No `<data android:scheme=…>` element exists in the
manifest, and `assets/capacitor.config.json` sets only `"server": { "androidScheme": "https" }`.
**Observation:** Souq Tulkarm ships **no app links, no custom scheme, no shareable deep
link** — a real limitation for a delivery app where a tracking link is table stakes.

**Other manifest facts:**
- `android:supportsRtl="true"`, `android:allowBackup="false"`,
  `android:usesCleartextTraffic="false"`, `android:extractNativeLibs="false"`.
- `android:appComponentFactory="androidx.core.app.CoreComponentFactory"`.
- `com.google.android.play.billingclient.version = 8.3.0`.
- `<queries>` for `InAppBillingService.BIND` and the Play billing test companion.

---

## 3. Client framework and stack

**A Vite-built React web app (PWA) wrapped in a Capacitor Android shell.** Not React Native.

Evidence (ZIP central directory of `souqtulkarm__base.apk`, 510 entries):
```
assets/capacitor.config.json        325
assets/capacitor.plugins.json       228
assets/native-bridge.js          53,467      <- Capacitor's JS bridge
assets/public/index.html           1,758      <- <script type="module" src="/assets/index-Bh9QEjtC.js">
assets/public/assets/index-Bh9QEjtC.js   654,679   <- the entire application
assets/public/assets/index-CYgjKKj0.css   58,343
assets/public/assets/jsQR-DkYl7kvi.js    129,975   <- QR decoding library
assets/public/sw.js                 2,268     <- service worker
assets/public/manifest.webmanifest    529    <- PWA manifest
assets/public/install.js / install.html        <- PWA install prompt
assets/public/cordova.js, cordova_plugins.js  (0 bytes — Capacitor placeholders)
```
- **No `lib/` directory** → no `libflutter.so`, no `libreactnativejni.so`, no native
  business logic.
- `assets/public/index.html` contains `<html lang="ar" dir="rtl">` ⇒ **RTL by default**.
- `assets/public/index.html` line 19 carries the comment:
  *"Alexandria for headlines and money, IBM Plex Sans Arabic for the interface, Plex Mono for codes (shared with Wind)."*
  ⇒ the shipped app documents a **font stack shared with Wind**. (Observation about the
  artifact; no Wind code or asset is reproduced here.)
- `assets/capacitor.plugins.json` registers only `@capacitor/splash-screen`
  (`com.capacitorjs.plugins.splashscreen.SplashScreenPlugin`) and `@capacitor/status-bar`
  (`com.capacitorjs.plugins.statusbar.StatusBarPlugin`).
- `assets/capacitor.config.json`: `webDir: "dist"`, `SplashScreen` (launchShowDuration 1200,
  background `#12342A`), `StatusBar` (style LIGHT, background `#12342A`).

**Native app classes (4 only)** — `rea search-android-classes souqtulkarm__base.apk "ps.souqtulkarm" --format json`:
`ps.souqtulkarm.app.MainActivity`, `ps.souqtulkarm.app.R`,
`ps.souqtulkarm.app.SouqNativePlugin`, `ps.souqtulkarm.app.SouqNativePlugin$$ExternalSyntheticBackport0`.

**`SouqNativePlugin` is the interesting native class.** `rea inspect-android-class
souqtulkarm__base.apk ps.souqtulkarm.app.SouqNativePlugin --format json` → `normalized_result.methods`:
```
key() : javax.crypto.SecretKey
getSession(com.getcapacitor.PluginCall) : void
connected(com.getcapacitor.PluginCall, java.lang.Runnable) : void
handleOnDestroy() : void
… lambdas taking com.android.billingclient.api.BillingResult / ProductDetails /
  ProductDetails$SubscriptionOfferDetails
```
**Observation:** the native bridge provides (a) an **AES-style `SecretKey`** for protecting
the session locally, (b) a session getter, (c) a billing bridge (product details,
subscription offer details, purchase result), (d) a connectivity probe.

**Implication (inference, strong):** because this is a **web app in a shell**, Souq Tulkarm
must store its auth token in the **native** layer (encrypted with `SecretKey`), not in
`localStorage`. The web layer's storage keys are `souq.token` and `souq.outbox`
(bundle @198587), and `souq.token` is removed from `localStorage` on logout (@198799) —
consistent with the token living natively.

**Consequence for this study:** Souq Tulkarm's logic is **100 % readable** — it is minified
JS with intact UTF-8 Arabic literals (verified: 7,469 Arabic UTF-8 runs in the bundle,
0 encoding damage; `index.html`, `manifest.webmanifest`, `sw.js` and `install.html` all
carry correct Arabic).

---

## 4. Product mechanics visible in the shipped artifact

> **Preamble.** Anchors are byte offsets in `assets/public/assets/index-Bh9QEjtC.js`.
> The file is minified JavaScript; strings are literals from the shipped source, so they
> are high-confidence, but the surrounding code is a **minified derivation**, not original
> source. No claim here establishes runtime or server behaviour.

### F-01 — Address model: **zone + free-text line + landmark + notes** — no street numbers **[OBSERVATION, high confidence]**

The saved-address form posts (bundle @482616 / @482966):

```js
await k.post(`/addresses`, {...i, isDefault:o})
// i = { label, zoneId, addressLine, landmark }
```

and the order payload (bundle @410829):

```js
{ items:[{productId,quantity}], zoneId, windowId, deliveryDate,
  addressLine, landmark, notes, substitutionPolicy, saveAddressLabel, totalCents }
```

The form's Arabic labels (bundle @482616, @483779, @483808):
- `اسم العنوان` — **address name** (required)
- `العنوان التفصيلي` — **detailed address** (required, free-text textarea)
- `علامة مميزة` — **distinctive landmark** (optional, single-line input)
- `ملاحظات للحذف (اختياري)` — **notes for deletion (optional)**
- `المنطقة` — **zone** (required; `/public/zones`)

Validation observed: `disabled:!i.zoneId || i.addressLine.trim().length<5` → **zone required,
address line ≥ 5 characters**. **There is no street-number field, no building field, no floor
field, no postcode.**

**Inference (strong):** this is *exactly* Wind's landmark-address model, and it is
**zone-first**: the delivery zone (which determines the fee and deliverability) is a
**separate, structured choice** from the free-text line. That separation is the key idea —
it makes fees and windows computable while keeping the address human.

**Why Wind cares:** Wind's "landmark addresses with no street numbers" constraint is
satisfied by `zoneId + addressLine + landmark`, with `label` for a saved-address book.

### F-02 — Delivery fee and availability are **per zone**, windows are per zone+day **[OBSERVATION]**

- `GET /public/zones` (@409088, @482534, @597554) — the zone list.
- `GET /public/windows` (@397939, @597589) — delivery windows.
- `GET /public/schedule?zoneId=${l}&days=7` (@409426) — **the 7-day schedule for a zone**.
- Order screen computes `se = oe?.deliveryFeeCents ?? 0` and `ce = e.subtotalCents + se`,
  and enforces `D = oe ? e.subtotalCents < oe.minOrderCents : false` (@409895) ⇒ **each
  zone carries its own `deliveryFeeCents` and `minOrderCents`.**
- Arabic copy: `أجرة التوصيل` (delivery fee), `الحد الأدنى للطلب` (minimum order),
  `أيام التوصيل` (delivery days), `إضافة فترة توصيل` (add a delivery window),
  `تعديل فترة توصيل` (edit a window), `امتلاء فترات التوصيل` (delivery windows full),
  `أقصى عدد طلبات تقبلها هذه الفترة في اليوم الواحد.` (max orders that window accepts per day),
  `الزبون لا يرى فترات لهذه المنطقة في الأيام غير المحددة.` (the customer does not see
  windows for that zone on unspecified days),
  `عنوان التوصيل والمنطقة: لتحديد إمكانية التوصيل وأجرته.` (delivery address and zone:
  to determine deliverability and its fee),
  `طلبات التوصيل الجديدة غير متاحة حالياً.` (new delivery requests are currently unavailable),
  `الحد الأدنى للطلب` / `أقل كمية للطلب`.

**Inference (strong):** Souq Tulkarm sells **capacity-constrained delivery slots**: a zone
has named windows; each window has a **daily order cap**; when the cap is hit the customer
sees "windows full" and the shop sees "new delivery requests currently unavailable".
**This is a very strong pattern for Wind**, where driver capacity on 2G/3G and West Bank
road closures make "when can you actually deliver" a first-class problem.

### F-03 — Cash-only, in cents, with the amount settled at the door **[OBSERVATION]**

- Copy: `الدفع نقداً عند الاستلام · أجرة التوصيل حسب منطقتك` ("cash on delivery · delivery
  fee depends on your zone"); `طولكرم · الدفع عند الاستلام` ("Tulkarm · cash on delivery");
  `الإجمالي النهائي نقداً` ("final total in cash"); `الإجمالي وقت الطلب` ("total at order time");
  `السعر المطلوب ${r/100} شيكل. أدخل مبلغاً بالشيكل.` ("requested price …₪. Enter an amount in ₪.")
  ⇒ **money is in integer cents, currency is the Israeli shekel (شيكل)**.
- Amount fields on the order/driver payloads: `totalCents`, `subtotalCents`,
  `finalTotalCents` / `totalAmountCents`, `amountDueCents`, `amountCollectedCents`,
  `deliveryFeeCents`, `minOrderCents`, `handoverAmountCents`, `countedAmountCents`.
- Driver delivery confirmation (@517556):

```js
await k.post(`/driver/delivery/confirm`, {
  orderId, proofInput, amountCollectedCents, discrepancyReason: ne ? l : undefined,
  ...await Hs()
}, { idempotencyKey: w, queueAs: `تسليم الطلب ${T.shortId}` })
```

with `E = T.finalTotalCents ?? T.totalAmountCents`, `ee = Math.round(Number(s)*100)`,
`te = ee - E`, `ne = te !== 0`.

**Observation:** the driver **enters the cash amount actually collected**, the app
computes the **difference** against the final total, and if there is a difference the
driver must **select a discrepancy reason** before the delivery can be confirmed.
**Inference:** cash-on-delivery with an explicit variance reason, at the moment of
delivery, with the amount in integer cents — this is the mechanism Wind's "auditable cash
ledger" needs on the driver side.

### F-04 — Driver side: **shift → ready-queue (job board) → custody scan → delivery**, with live tracking **[OBSERVATION]**

Recovered driver API surface (all from the bundle):

| Endpoint | Purpose |
|---|---|
| `GET /driver/shift` | current shift state (`status === 'ACTIVE'`) |
| `POST /driver/shift/start` | start a shift — payload `{vehicleScan, ...}` |
| `POST /driver/shift/location` | location ping |
| `POST /driver/shift/tracking` | tracking on/off |
| `POST /driver/shift/location-health` | device/battery/permission health |
| `GET /driver/ready-queue` | **the job board** — fetched only while the shift is `ACTIVE` |
| `GET /driver/route` | the driver's route |
| `GET /driver/peers` | nearby drivers (for transfers) |
| `POST /driver/custody/scan` | take custody of a parcel by scanning its label |
| `POST /driver/custody/transfer` | take custody of a parcel that was offered to you |
| `POST /driver/custody/offer-transfer` | **offer a parcel to another driver** — `{scan, toDriverId}` |
| `POST /driver/custody/return` | hand a parcel back |
| `POST /driver/delivery/approaching` | mark approaching |
| `POST /driver/delivery/confirm` | confirm delivery (with cash + proof) |
| `POST /driver/delivery/fail` | record a failure |
| `GET /driver/cash` | the driver's cash view |
| `POST /driver/cash/handover` | hand over the shift's cash |

**Scan-driven intent state machine (bundle @503114):** one scan code drives four intents —
`VEHICLE` → `POST /driver/shift/start {vehicleScan}`; `OFFER` → accept an offered transfer;
`TRANSFER` → `POST /driver/custody/transfer`; `RETURN` → hand back; otherwise
`POST /driver/custody/scan`.

**Job board (bundle @502838):** `GET /driver/ready-queue` is polled while the shift is
`ACTIVE`, and the app re-fetches on the events `order_updated`, `custody_updated`,
`fleet_updated`.

**Arabic copy that states the job-board rule (bundle, driver view):**
- `السائق يختار من الطرود الجاهزة` — "the driver chooses from the ready parcels."
- `الطرود التي في عهدتك الآن، مرتبة حسب المنطقة.` — "the parcels currently in your custody,
  sorted by zone."
- `السائق يرى الطلبات المسندة إليه أثناء الوردية، ولا يرى كود تسليم الزبون ولا بيانات
  زبائن آخرين.` — "the driver sees only the orders assigned to them during the shift, and
  does **not** see the customer's delivery code or other customers' data."
- `عند الإيقاف، لا يستطيع السائق أخذ طرد غير مخصص له من الإدارة.` — "when stopped, the driver
  cannot take a parcel not assigned to them by the admin."
- `تحويل طرد لسائق آخر` — "transfer a parcel to another driver."
- `ابدأ الوردية بمسح رمز السيارة.` / `أدخل رمز السيارة` — "start the shift by scanning the
  vehicle code."
- `الملصق موجود داخل السيارة. مسحه يبدأ الوردية ويشغّل تتبع الموقع.` — "the label is inside the
  vehicle; scanning it starts the shift and turns on location tracking."
- `الملصق مطبوع على كيس الطلب. إن كان ممزقاً، أدخل الكود المطبوع بجانبه.` — "the label is
  printed on the order bag; if torn, enter the printed code."
- `رمز التسليم بحوزتك أنت` — "the delivery code is in your hands."
- `الطرد مع السائق` / `الطلب في المحل` / `بانتظار سائق` /
  `بانتظار استلام المحل للطرد` — parcel-with-driver / order-at-shop / awaiting-driver /
  awaiting-shop-collection.

**Why Wind cares:** this is the **shift-first** model — a driver has no parcels until they
start a shift by scanning the vehicle code; the shift produces a **ready queue the driver
picks from**; custody is transferred by **scanning a printed label**; and the driver is
**structurally prevented** from seeing the customer's delivery code or other customers'
data. That last point is a privacy control Wind should copy verbatim.

### F-05 — Chain of custody is a first-class, queryable object **[OBSERVATION]**

- `GET /orders/${e}/custody-chain` (@460478, @540544) — a custody chain per order.
- Copy: `سلسلة عهدة الطلب` ("the order's custody chain"),
  `سجل مسح الرموز واستلام العهدة والتسليم: لإثبات من كان يحمل الطرد ومتى.` ("log of QR scans,
  custody pickup and delivery: to prove who was carrying the parcel and when"),
  `رقم التسليم بحوزتك أنت` and `أعطه للسائق عند الاستلام فقط` ("give it to the driver only at
  delivery"), `خروج من عهدة السائق` ("left the driver's custody"),
  `دخل في عهدة سائق آخر` ("entered another driver's custody").
- Audit events with Arabic labels (bundle @583859):
  `SHIFT_STARTED: 'بدء وردية'`, `SHIFT_FORCE_CLOSED: 'إغلاق إداري لوردية'`,
  `HANDOVER_SUBMITTED: 'تسليم نقدية'`, `SHIFT_SETTLED: 'إقفال وردية'`,
  `CASH_ADJUSTED: 'قيد تسوية نقدي'`, `PACKAGE_ASSIGNED: 'تخصيص طرد'`,
  `CUSTODY_TRANSFERRED: 'تحويل عهدة'`, `DELIVERY_PROOF_EXCEPTION: 'استثناء إثبات تسليم'`,
  `ORDER_CANCELLED: 'إلغاء طلب'`, `APPROVAL_ACCEPTED: 'موافقة على تغيير'`,
  `APPROVAL_REJECTED: 'رفض تغيير'`, `MESSAGE_REDACTED: 'إخفاء رسالة'`,
  `DELETION_REQUESTED: 'طلب حذف حساب'`, `OTP_REQUESTED: 'طلب رمز تحقق'`.

**Inference (strong):** the custody chain is an **append-only event log** with a
human-readable Arabic label per event type, queryable per order. Wind should implement
exactly this for a cash-on-delivery parcel.

### F-06 — The cash ledger is **append-only** and corrections are new entries **[OBSERVATION, high confidence]**

**Driver handover (bundle @528322):**
```js
await k.post(`/driver/cash/handover`, {
  shiftId: u.shift.id, handoverAmountCents: Math.round(Number(i||0)*100), notes: o
}, { idempotencyKey: Fe(), queueAs: `تسليم نقدية الوردية` })
```
Copy shown next to it: `لا تستطيع تعديل أي مبلغ بعد تسجيله، ولا تحديد النقدية كـ«مستلمة» —
العدّ والإغلاق من صلاحية الإدارة وحدها.` — "you cannot edit any amount once it is registered,
nor mark the cash as 'received' — counting and closing is admin-only."

**Admin settlement (bundle @567370):**
```js
await k.post(`/admin/cash/settle`, {
  shiftId: n.shiftId, countedAmountCents: Math.round(Number(i||0)*100),
  resolutionNotes: o || undefined
})
```
Copy: `القيود لا تُعدَّل ولا تُحذف. أي تصحيح يُسجَّل كقيد تسوية جديد باسمك وبسببه.` — "entries are
not edited and not deleted. Any correction is recorded as a **new settlement entry with
your name and your reason**."

Related: `POST /admin/cash/adjust`, `GET /admin/cash`, `GET /admin/audit?limit=60`,
`الإدارة ترى العمليات والسجلات المالية، ولا تستطيع حذف أي سجل عهدة أو نقد — التصحيح يكون
بقيد جديد.` ("the admin sees operations and financial records and cannot delete any custody
or cash record — the correction is a new entry."),
`تفاصيل الطلبات والمبالغ النقدية المستلمة: سجل محاسبي مطلوب قانونياً.` ("order details and
cash received: a legally required accounting record").

**Inference (very strong):** this is the **append-only cash ledger with named, attributed
corrections** that Wind's brief asks for. The rule is explicit in the UI copy:
**nothing is edited or deleted; a correction is a new signed entry.** The
`resolutionNotes` field on settlement and the `notes` field on handover are the
"reason" fields.

### F-07 — Delivery proof: a **private code/QR** the customer must present **[OBSERVATION]**

- Fields `deliveryCode` and `deliveryQrToken` on the order.
- Copy: `أعطِ هذا الكود للسائق عند الاستلام، أو اعرض له رمز الـ QR. بدونه لا يستطيع إغلاق
  التسليم.` — "give this code to the driver on delivery, or show him the QR. **Without it he
  cannot close the delivery.**"
- `هذا الرمز يخصك أنت وحدك ولا يحتوي على اسمك أو عنوانك أو مبلغ الطلب. لا تشاركه إلا عند
  التسليم.` — "this code belongs to you alone and contains no name, address or order
  amount. Do not share it except at delivery."
- Driver confirm payload carries `proofInput` (bundle @517556).
- Failure mode: `PROOF_LOCKED` — the delivery is blocked after failed proof attempts
  (@517775). Admin escape hatch: `POST /admin/orders/${e}/proof-reset` with `{reason:v}`,
  copy `أُعيد فتح محاولات الكود. ما زال إثبات التسليم مطلوباً.` ("code attempts have been
  reopened; delivery proof is still required") (@548381).
- **Status values** observed gating the code display: `['PACKED_READY','IN_CUSTODY']`
  (@463199, @463694).

**Inference (strong):** Souq Tulkarm proves delivery with a **customer-held secret** that
is useless to a third party, plus a **lockout** on repeated failure, plus an audited admin
reset. That is a well-designed proof-of-delivery for a cash-on-delivery flow where the
driver is the one carrying cash.

### F-08 — Order state machine (exact status vocabulary) **[OBSERVATION]**

Recovered SCREAMING_SNAKE tokens with occurrence counts (bundle-wide token scan):

```
PACKED_READY 17   IN_CUSTODY 10   AWAITING_DECISION 13   DELIVERY_FAILED 9
PENDING_SETTLEMENT 8   CASH_SETTLED 7   AWAITING_CUSTOMER 2   ALREADY_IN_CUSTODY 2
CASH_VARIANCE 2   PROOF_LOCKED 2   SHIFT_STARTED 1   SHIFT_SETTLED 1
SHIFT_FORCE_CLOSED 1   HANDOVER_SUBMITTED 2   CASH_ADJUSTED 1   COUNTED_BY_ADMIN 1
PACKAGE_ASSIGNED 1   CUSTODY_TRANSFERRED 1   TRANSFERRED_IN 1   TRANSFERRED_OUT 1
ORDER_CANCELLED 1   RETURN_REQUESTED 1   RETURNED_ITEMS 1   RETURNED_TO_SHOP 1
ACCEPTED_BY_DRIVER 1   APPROVAL_ACCEPTED 1   APPROVAL_REJECTED 1
DELIVERY_PROOF_EXCEPTION 1   CUSTOMER_DID_NOT_PAY 1   CUSTOMER_REFUSED 1
CUSTOMER_UNREACHABLE 1   CUSTOMER_RESCHEDULED 1   WRONG_ADDRESS 1   INCORRECT_CASH 1
PARTIAL_PAYMENT 1   OTHER_ADMIN_REVIEW 1   AWAITING_CUSTOMER 2
```

Also observed as API query values: `GET /orders?status=PACKED_READY` (@553681).
Customer-visible status copy: `الطلب ملغي — لم يُستكمل المسار.` ("order cancelled — the path
was not completed"), `تم التسليم`, `تم الحل`, `تم الشراء`, `تم بيع هذه القطعة`,
`تعذّر التسليم`, `تعذّر التسليم — بانتظار ويند` ("delivery failed — awaiting a wind"/retry).

**Observation:** the machine has (a) a **pre-delivery** set (`PACKED_READY` → `PACKAGE_ASSIGNED`
→ `IN_CUSTODY`), (b) a **failure set with typed reasons** (customer unreachable / refused /
did not pay / rescheduled / wrong address / incorrect cash / partial payment / other →
admin review), (c) **returns** as first-class states, (d) a **cash settlement** axis
separate from the delivery axis, and (e) an **approval** axis for changes that need a human.

**Inference (strong):** the failure-reason list is *the* design artifact Wind should copy —
a cash-on-delivery parcel fails for a handful of specific reasons, and each needs a
distinct operational response.

### F-09 — Weight-based final total with a **substitution policy** and a consent threshold **[OBSERVATION]**

Copy:
- `الوزن والتعبئة` ("weight and packing"), `تجهيز وتعبئة` ("packing"), `تعبئة ووسم` ("packing and labelling"),
  `إنهاء التعبئة وإصدار الملصق` ("finish packing and issue the label"),
  `الأصناف تُوزن عند التجهيز. إن اختلف الوزن الفعلي عن المطلوب، يظهر الإجمالي النهائي في
  تفاصيل الطلب، ونسألك قبل أي تغيير يتجاوز الحد الذي وافقت عليه.` ("items are weighed at
  packing; if the actual weight differs from the requested, the final total appears in the
  order details and **we ask you before any change that exceeds the limit you agreed to**").
- `إذا نفد الصنف، احذفه من الطلب ولا ترسل بديلاً.` ("if the item is out of stock, remove it
  from the order and do not send a substitute").
- `إذا تجاوز الفرق ذلك الحد، أو نفد صنف، نسألك قبل إتمام التجهيز حسب الخيار الذي اخترته عند الطلب.`
- `تم إبلاغ المحل برفضك، وسيُحذف الصنف من الطلب.` / `تم إبلاغ المحل بموافقتك.`
- `أرسل الطلب للبائع` ("send the order to the seller"), `رفض البائع الطلب` ("the seller
  rejected the order"), `بانتظار ردك` ("awaiting your reply"), `تم موافقتك`/`تم رفض العرض`.
- Order payload field: `substitutionPolicy` (bundle @410829).
- `POST /approvals/${e}/decide` — the **approval** flow for substitutions/changes.

**Inference (strong):** the pattern is: *the shop packs and may discover a discrepancy →
if the discrepancy is within the customer's pre-agreed limit, act automatically; if it
exceeds the limit, **stop and ask the customer**, who approves or rejects; the shop is
notified either way.* **This is the consent model Wind needs** for anything that changes
the customer's money or contents after the order is placed.

### F-10 — Offline write queue and low-connectivity handling **[OBSERVATION]**

- Storage keys (bundle @198587): `souq.token` (session), `souq.outbox` (write queue).
- `Ce()` reads `souq.outbox` from `localStorage` and parses it as a JSON array; `we(e)`
  writes it back and, on failure, throws with the Arabic message
  `تعذر حفظ الإجراء على الجهاز. أبقِ الصفحة مفتوحة وحاول مرة أخرى.` ("could not save the
  action on the device. Keep the page open and try again.") and the code `QUEUE_STORAGE`
  (@199383).
- Every mutating call in the app passes `{ idempotencyKey: Fe(), queueAs: '<human label>' }`
  as a third argument to the HTTP helper (e.g. `queueAs: 'تسليم نقدية الوردية'`,
  `queueAs: 'عرض تحويل طرد'`, `queueAs: \`تسليم الطلب ${T.shortId}\``).
- The HTTP helper returns `code === 'QUEUED'` on offline enqueue, and the UI shows
  `تعذر الوصول للخادم، جارٍ إعادة المحاولة.` ("cannot reach the server, retrying") and
  `Error sending. Event queued.`-style messaging.
- Errors are structured with codes: `QUEUED`, `PROOF_LOCKED`, `IDEMPOTENCY_CONFLICT`,
  `SESSION_CHANGED` (copy: `تغير الحساب المستخدم. أعد المحاولة بحسابك الحالي.` — "the signed-in
  account changed; retry with your current account"), `ACCESS_BLOCKED`, `PERMISSION_DENIED`.

**Inference (very strong):** every write is **idempotency-keyed and enqueueable offline**,
with a human-readable label so the customer can see what is pending. This is the single
most important pattern for Wind's **3G/2G** constraint, and it is better than anything
Shiply's customer artifact shows.

### F-11 — Live tracking that degrades honestly, and reports its own health **[OBSERVATION]**

- `POST /driver/shift/tracking` (on/off), `POST /driver/shift/location`,
  `POST /driver/shift/location-health`.
- Customer view fields: `trackingActive`, `lastLat`, `lastLng`, `driverLocation.updatedAt`,
  `driverPhone`, `driverLocation`.
- Copy: `آخر موقع للسائق: <time>` ("driver's last location: …"),
  `تتبع كل طلب من التجهيز حتى الباب.` ("track every order from packing to the door"),
  `التتبع يعمل` / `التتبع موقوف` / `التتبع موقوف، والمحل يرى أن التتبع موقوف بدل موقع قديم.
  قد يتصل بك للتنسيق.` ("tracking is paused; the shop sees 'tracking paused' instead of a stale
  location — they may call you to arrange"),
  `إذن الموقع مرفوض. المحل يرى أن التتبع متوقف — فعّل الإذن من إعدادات الهاتف أو تابع
  هاتفياً.` ("location permission denied; the shop sees tracking stopped — enable the
  permission or follow up by phone"),
  `حالة الجهاز (مستوى البطارية وحالة إذن الموقع) لتنبيه المحل عند انقطاع التتبع.` ("device
  state — battery level and location-permission status — to warn the shop when tracking breaks").
- Status tokens: `STALE_LOCATION` (2), `LOW_BATTERY` (2).
- External navigation: `https://www.google.com/maps?q=${lat},${lng}` and
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(\`${e.deliveryAddress} …\`)}`
  — i.e. **the address, not a place id**, is turned into a maps query.

**Inference (strong):** the app distinguishes "stale location" from "no location" and shows
the *shop* the degraded state so the shop can call the customer. It also surfaces
**battery level** as a first-class signal. For Wind on 2G/3G, "the driver's phone is at 8%
and tracking is off" is a signal you want on the dispatcher's screen, not a silent failure.

### F-12 — Chat with the shop, with **canned replies** and moderation **[OBSERVATION]**

- API: `GET /chat/conversations`, `GET /chat/canned-replies`, `GET /chat/thread?customerId=…`,
  `POST /chat/send`, `POST /chat/${t.id}/redact`.
- Copy: `رسائل المحادثة مع المحل: لخدمة الزبائن وحل الخلافات حول الطلب.` ("shop chat messages:
  for customer service and resolving disputes about the order"),
  `إخفاء رسالة` ("hide a message"), `أرسل الرسالة`, `تعذر إرسال الرسالة.`,
  `تم الحل` ("resolved").
- Community messaging separately: `POST /community/messages`, `GET /community/messages/${e}`,
  `POST /community/messages/${e}/read`, `POST /community/questions/${e.id}/answer`,
  `POST /community/questions/${e.id}/hide`, `POST /community/reviews/${t.id}/reply`,
  `POST /community/reviews/${t.id}/hide`, `POST /community/problems`, `POST /community/problems/${n.id}/decide`.

**Inference:** Souq Tulkarm ships chat **without a WhatsApp integration**, with **canned
replies** for the shop and **admin-moderated hiding** for both chat and community content.

### F-13 — Ratings, identity verification, billing verification, and community governance **[OBSERVATION]**

- Ratings: `التقييم ${e.average} من 5، ${e.count} تقييم` ("rating X of 5, N ratings"),
  `تقييم البائع ${e.ratingAverage} من 5، ${e.ratingCount} تقييم` ("seller rating …").
- Seller verification: `GET /community/verification`, `POST /community/verification`,
  `GET /community/verification/requests`, `POST /community/verification/requests/${t.userId}`,
  copy `طلب توثيق البائع` ("seller verification request"),
  `طلب توثيق البائع بمراجعة بشرية` ("seller verification with human review").
- Billing verification: `POST /community/billing/verify`.
- Community governance: `GET /community/access`, `POST /community/access`, `GET /community/blocks`,
  `POST /community/blocks/${e.id}`, `GET /community/preferences`, `POST /community/preferences/reset`,
  `GET /community/suggest?q=`, `GET /community/markets`, `GET /community/markets/${market}/problems`,
  copy `إدارة المجتمع وقواعده والبلاغات` ("manage the community, its rules and its reports"),
  `انضم إلى مجتمعك أولاً` ("join your community first"), `اكتشف مجتمعاتك` ("discover your communities").
- Identity: `GET /auth/otp/request`, `POST /auth/otp/request`, `POST /auth/otp/verify`,
  `POST /auth/reset-password`, `POST /auth/password`, `POST /auth/deletion-request`,
  `GET /auth/sessions`, copy `أرسل رمز التحقق` ("send the verification code"),
  `طلب حذف الحساب` ("account deletion request"),
  `أو أرسل طلب حذف الحساب إلى ${Ss} مع رقم الحساب. نتحقق من هويتك قبل التنفيذ.`
  ("or send an account-deletion request to <addr> with your account number; we verify your
  identity before executing it").
- PWA install: `assets/public/install.html` + `install.js`, `manifest.webmanifest`,
  `sw.js`; copy `ثبّت سوق على جهازك` ("install Souq on your device").

### F-14 — Customer-facing marketplace mechanics **[OBSERVATION]**

- Lists (shopping lists): `GET/POST /community/lists`, `/community/lists/${e}`,
  `POST /community/lists/${e}/items/${n}`, `POST /community/lists/${e}/rename`,
  `POST /community/lists/${e}/delete`, `GET /community/lists?listing=…`.
- Orders: `POST /orders` (idempotency-keyed), `GET /orders`, `GET /orders/${e}`,
  `POST /orders/${e}/cancel`, `GET /orders/repeat-last` (**re-order**).
- Cart: `GET /community/cart`, `POST /community/cart/checkout`.
- Shop catalogue: `GET /public/catalogue`, `GET /public/store`, `GET /public/windows`.
- Admin packing station: `POST /packing/${e}/start`, `POST /packing/${e}/item`,
  `POST /packing/${e}/finish`, `POST /packing/${e}/reissue`.
- Admin dispatch: `POST /admin/dispatch/assign`, `GET /admin/fleet`,
  `POST /admin/shifts/${n.shiftId}/close`.
- Vehicles: `GET /admin/vehicles`, `POST /admin/vehicles`, `POST /admin/vehicles/${c.id}/rotate-qr`
  (copy `تغيير رمز سيارة` — "rotate a vehicle code").
- Zones/windows admin: `POST /admin/zones`, `POST /admin/windows`,
  `POST /admin/catalogue/availability`, `POST /admin/catalogue/copy-previous`,
  `POST /admin/products`.
- Reports/audit: `GET /admin/reports?from=&to=`, `GET /admin/audit?limit=60`,
  `GET /admin/pulse`, `GET /admin/staff`, `GET /admin/settings`.
- Safety copy: `افحص القطعة قبل الدفع، واتفق على اللقاء في مكان عام. البيع والدفع بينك وبين
  البائع مباشرة.` ("inspect the item before paying and agree to meet in a public place; the
  sale and payment are directly between you and the seller"),
  `صورة واضحة بضوء النهار، عنوان فيه النوع والموديل، وسعر عادل. اذكر العيوب بصراحة ومنطقة
  الاستلام بدون عنوان بيتك.` ("a clear daylight photo, an address with the type and model,
  and a fair price; state the defects honestly and the pickup **area** without your home
  address").

**Observation:** Souq Tulkarm is a **marketplace with its own delivery operation** — the
shop is the seller, the app is the logistics provider, and the cash flows from the
customer to the shop.

---

## 5. Evidence table

| # | Finding | Command | Tool output anchor | Path / offset in `assets/public/assets/index-Bh9QEjtC.js` |
|---|---|---|---|---|
| F-01 | Zone + addressLine + landmark | bundle pattern `deliveryAddress\|addressLabel\|zoneId\|landmark` | 60 hits | `POST /addresses` payload @482616/@482966; order payload @410829; labels `اسم العنوان` / `العنوان التفصيلي` / `علامة مميزة` @483779–483808 |
| F-02 | Zone fees + windows | bundle pattern `zoneId\|windowTitleAr\|deliveryFee` | 60 hits | `GET /public/schedule?zoneId=${l}&days=7` @409426; `deliveryFeeCents`/`minOrderCents` @409895; `امتلاء فترات التوصيل` |
| F-03 | COD in cents + variance | bundle pattern `cash` | 28 hits | `POST /driver/delivery/confirm` payload @517556; `amountCollectedCents`/`discrepancyReason` |
| F-04 | Driver job board + custody | bundle pattern `driver\|deliveryFee\|trackingActive` | 118 hits | `GET /driver/ready-queue` @502838; `POST /driver/shift/start` @503114; `POST /driver/custody/offer-transfer` @511143; `POST /driver/cash/handover` @528322 |
| F-05 | Custody chain | bundle pattern `custody` | in status/api dumps | `GET /orders/${e}/custody-chain` @460478; `سلسلة عهدة الطلب`; audit labels @583859 |
| F-06 | Append-only cash ledger | bundle pattern `cash` | 28 hits | `POST /admin/cash/settle {shiftId, countedAmountCents, resolutionNotes}` @567370; copy `القيود لا تُعدَّل ولا تُحذف` |
| F-07 | Delivery proof code/QR | bundle pattern `deliveryCode\|custodyCode\|proof` | 11 hits | `deliveryCode`/`deliveryQrToken` @463199/@468734; `PROOF_LOCKED` @517775; `POST /admin/orders/${e}/proof-reset` @548381 |
| F-08 | Status vocabulary | bundle SCREAMING_SNAKE token scan | 80 tokens | `PACKED_READY` ×17, `IN_CUSTODY` ×10, `AWAITING_DECISION` ×13, `DELIVERY_FAILED` ×9, `PENDING_SETTLEMENT` ×8, `CASH_SETTLED` ×7, `CUSTOMER_DID_NOT_PAY`, `WRONG_ADDRESS`, `INCORRECT_CASH`, `PARTIAL_PAYMENT` |
| F-09 | Substitution consent | bundle pattern `weight\|substitution\|approval` | — | order payload `substitutionPolicy` @410829; `POST /approvals/${e}/decide` @461186; copy `نسألك قبل أي تغيير يتجاوز الحد` |
| F-10 | Offline queue | bundle pattern `souq.outbox\|QUEUE_STORAGE\|offline\|retry` | 20 hits | `souq.outbox` @198587; `Ce()`/`we()` @199252–199383; `idempotencyKey` + `queueAs` @517556/@528322 |
| F-11 | Tracking health | bundle pattern `battery\|STALE_LOCATION\|trackingActive\|location-health` | 21 hits | `trackingActive`/`lastLat`/`lastLng`; `STALE_LOCATION`, `LOW_BATTERY`; `POST /driver/shift/location-health` |
| F-12 | Chat + canned replies | bundle pattern `chat\|message\|ردّ` | 120 hits | `GET /chat/canned-replies` @578148; `POST /chat/${t.id}/redact` @582081 |
| F-13 | Ratings + verification + governance | bundle pattern `otp\|verification\|rating` | 159 hits | `GET/POST /community/verification`; `GET /community/access`; `POST /community/blocks/${e.id}` |
| F-14 | Marketplace + admin ops | bundle pattern `shop\|store\|vendor\|product\|listing` | 200 hits | `/community/lists`, `/orders/repeat-last`, `/packing/${e}/start`, `/admin/dispatch/assign`, `/admin/vehicles/${c.id}/rotate-qr` |

**Secondary evidence — native surface.** `rea search-android-classes souqtulkarm__base.apk "ps.souqtulkarm" --format json`
→ 4 matches. `rea inspect-android-class souqtulkarm__base.apk ps.souqtulkarm.app.SouqNativePlugin --format json`
→ `normalized_result.methods` = `key(): javax.crypto.SecretKey`, `getSession(PluginCall)`,
`connected(PluginCall, Runnable)`, `handleOnDestroy()`, plus Billing lambdas.
`rea inspect-android-package souqtulkarm__base.apk --format json` → manifest, permissions, SDK levels.

---

## 6. Unknowns and limits

1. **The APK is a web app in a shell.** The Android layer is 4 classes; all product logic is
   browser JavaScript. On a real device the same JS runs against the same API, but the
   **web/PWA deployment is a separate surface** (`/install.html`, `sw.js`,
   `manifest.webmanifest`) that was not analysed.
2. **No API responses.** The 167 client API calls are *requests*; the response schemas,
   server-side validation, and the actual fee schedule are **unknown**.
3. **The backend is a single Railway deployment** (`souq-production-52a0.up.railway.app`),
   with a **Jordan** deployment referenced in Shiply. Souq's own multi-region/tenant
   strategy is not visible here. Whether the Railway deployment is the production one is
   an **inference** from the hostname.
4. **`SecretKey` generation and storage were not decompiled.** `SouqNativePlugin.key()`
   exists; how the key is derived and persisted is unknown.
5. **No push notification channel names.** Souq Tulkarm uses **Web Push**
   (`/push/subscribe`, `/push/key`, `/push/unsubscribe`; `sw.js` present), not Android FCM
   notification channels. On Android, Web Push on a Capacitor WebView is fragile; whether
   it works reliably here is **unknown** and untested.
6. **No `whatsapp:` / `wa.me` / `intent:` scheme** anywhere in the bundle — a *negative*
   observation (searched with a full-file literal scan). It does not prove the shipped app
   never links out to WhatsApp via a server-provided URL.
7. **`install.html` / `install.js` / `sw.js`** were extracted but their behaviour was not
   analysed beyond the PWA-install copy.
8. **No signer** exposed (`signature_verification: "not_performed"`).
9. **The minified JS is a derived representation**, not original source. Identifiers are
   single-letter; string literals are reliable but their *context* is reconstructed.
10. **No APK was installed and no device was touched.**

---

## 7. What this means for Wind

**Adopt (pattern only — no code, no assets):**
- **The address model, verbatim in shape:** `zoneId` (structured, required) +
  `addressLine` (free text, required, ≥5 chars) + `landmark` (optional) + `notes` +
  `label` + `isDefault` (F-01). This satisfies Wind's "landmark addresses with no street
  numbers" **and** makes fees computable.
- **Zone-driven fees and capacity-limited delivery windows**, with a daily per-window
  order cap and a customer-facing "windows full" state (F-02). West Bank road closures
  make slot capacity a real constraint, not a nicety.
- **Shift-first driver model**: scan the vehicle code to start the shift; the shift opens
  the **ready queue** the driver picks from; custody is taken by scanning a printed
  label; the driver **cannot see the customer's delivery code or other customers' data**
  (F-04).
- **The append-only cash ledger**: driver handover → admin count-and-close → every
  correction is a **new attributed entry with a reason**; nothing is edited or deleted;
  the driver may not mark cash "received" (F-06). This is Wind's auditable cash ledger,
  already designed.
- **Delivery proof as a customer-held secret** (code + QR), with a lockout after failed
  attempts and an audited admin reset (F-07).
- **The typed failure-reason set** (F-08) — customer unreachable / refused / did not pay /
  rescheduled / wrong address / incorrect cash / partial payment / other → admin review.
- **Substitution + approval consent** (F-09): act inside the customer's pre-agreed limit,
  otherwise stop and ask; the shop is notified either way.
- **Offline write queue with idempotency keys and human labels on every write** (F-10) —
  the answer to Wind's 3G/2G constraint.
- **Tracking that reports its own degradation** (`STALE_LOCATION`, `LOW_BATTERY`,
  permission denied) to the *shop*, so a human can call the customer (F-11).
- **Cash in integer cents, currency shown as shekels** (F-03).

**Skip:**
- **The marketplace/community layer** (lists, problems, moderation, follows, blocks,
  community access, question answering) (F-13, F-14). Wind is a parcel/cash app, not a
  community marketplace; this is a large surface with zero Wind value.
- **The Web-PWA install path** (`install.html`, `sw.js`) as a Wind architecture. Wind is
  Android-only; a Capacitor web app gives up native background location, native push,
  and offline reliability.
- **Railway-hosted single-origin deployment** as Wind's production shape.
- **Sellers/`cs-cart`-style vendor management** — Shiply's equivalent is likewise out of
  scope.

**Defer with an evidence gate:**
- **Driver-to-driver custody transfer** (`offer-transfer` + `peers`) (F-04). Elegant, but
  it presupposes a driver population dense enough for peers to be useful, and a dispute
  policy. Gate: Wind's driver density in the first launch city, and a written custody-
  dispute policy.
- **Admin packing station + weight-based final total** (F-09, F-14). Only meaningful for
  goods, not parcels. Gate: confirm Wind is not going to ship a grocery/bulk line.
- **Canned replies + chat with the shop** (F-12). Gate: Wind's support volume per week.
  If low, a phone number + in-app "call" is cheaper than a chat system.
- **Web Push instead of FCM** (limit 5). Defer and do not copy: on Android, FCM is the
  only reliable background push for an app that must wake a 2G phone. Gate: none needed —
  reject outright, but note that Souq's choice only works because it is a PWA.
