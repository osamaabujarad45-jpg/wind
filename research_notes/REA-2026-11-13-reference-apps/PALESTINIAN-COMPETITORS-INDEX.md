# PALESTINIAN COMPETITORS — cross-app index and Wind recommendations

**Study:** REA-2026-11-13-reference-apps · static reverse-engineering of real
Palestinian / regional Android apps pulled from the owner's phone.
**Artifacts studied:** `net.fares.athkar` 1.1.1 · `com.shiplypalestinemobileapp` 1.8530 ·
`ps.souqtulkarm.app` 1.0.2 · `com.masarat.salati` 3.7.66 · `com.careem.acma` 26.43 ·
`com.haat.client` 21.0.4 · `com.ubercab` 4.655.10001.
**Method:** static (REA 6.7.0 / jadx-headless-mcp 0.7.1; `aapt2` 36.1.0 for resource strings,
apktool unavailable; custom `dexparse.py` DEX class/string extraction) **plus** first-run
runtime passes on the owner's phone (`SM-A5360`, Android 16) for the four apps installed
13 Nov: Uber, Careem, Haat, and Wind's own test build. No app was executed before this
session's installs.

## Per-app study files

| File | Artifact | Verdict |
|---|---|---|
| [`ATHKAR.md`](ATHKAR.md) | `net.fares.athkar` 1.1.1 (152 MB) | **Not a delivery app.** Religious app (adhkar / Quran / prayer times / widgets). Kept as a *regional Android craft* reference. |
| [`SHIPLY.md`](SHIPLY.md) | `com.shiplypalestinemobileapp` 1.8530 (83 MB) | **Real competitor.** Full Palestinian parcel/logistics platform, Expo + React Native. Shipped JS bundle readable. |
| [`SOUQ-TULKARM.md`](SOUQ-TULKARM.md) | `ps.souqtulkarm.app` 1.0.2 (4 MB) | **Real competitor.** Tulkarm marketplace + delivery, Vite/React web app in a Capacitor shell. **The richest single source for Wind's cash-and-custody design.** |
| [`SALATI.md`](SALATI.md) | `com.masarat.salati` 3.7.66 (33 MB) | **Not a delivery app.** Prayer times / adhān / qibla / widgets. Kept as a *regional Android craft* reference. |
| [`UBER-4.655-rider.md`](UBER-4.655-rider.md) | `com.ubercab` 4.655.10001 (197 MB base + 9 splits) | **The global benchmark.** 15,948+ classes. The reference for map-first home, saved places, live tracking and payment-method-first checkout. |
| [`CAREEM.md`](CAREEM.md) | `com.careem.acma` 26.43 (81.5 MB base, 7 DEX, 73,254 classes) | **The MENA benchmark, and the closest architectural analogue to Wind's problems.** Solves address capture without street numbers (pin + nickname + building type + notes + photo) and cash as a first-class instrument with an arrears rule. |
| [`HAAT.md`](HAAT.md) | `com.haat.client` 21.0.4 (30 MB base, 4 DEX, 22,115 classes) | **The Palestinian-scale benchmark.** 1M+ downloads, Arabic-first, cash + card, landmark addresses, three-app fleet. **Not reachable from this network** — measured, see below. Its Arabic order-state copy is the most valuable transfer in the whole set. |

---

## 0. Correction to the brief (read this first)

The brief listed Athkar as "rides + delivery" and Salati as "food delivery/grocery".
**Both are wrong**, and the evidence is unambiguous:

| App | Claimed | Actual (evidence) |
|---|---|---|
| Athkar | rides + delivery | `rea search-android-classes athkar__base.apk` returns **0** classes for `Order`, `Driver`, `Cart`, `Address`, `Ride`, `Trip`, `Ship`, `Courier`, `Wallet`, `Payment`, `Cash` across all 17,372 classes. Every `net.fares.athkar.feature.*` package is religious (`prayers`, `quran`, `reader`, `tasks`, `names`, `qibla`, `sick`, `myathkar`, `mywidget`). **ATHKAR.md F-01.** |
| Salati | food delivery/grocery | Same search over `com.masarat.salati.*` returns **0** for `Delivery`, `Order`, `Driver`, `Cart`, `Address`, `Food`, `Restaurant`, `Grocery`, `Payment`, `Cash` across 3,525 classes. The app is prayer times + adhān + qibla + six widgets. **SALATI.md F-01.** |

**Consequence:** the effective competitor set for Wind is **two apps, not four** — Shiply
(enterprise parcel platform) and Souq Tulkarm (local marketplace delivery). Both still
assume a *different product* from Wind in important ways (see §4). Athkar and Salati are
retained because they are the only artifacts here that show **how Palestinian-market
Android apps are actually built** — Arabic-first, RTL, exact alarms, offline assets,
Huawei/OPPO accommodation.

**Also note what nobody had:** no app in this set ships **WhatsApp ordering**. Shiply's
bundle contains **zero** `whatsapp` / `wa.me` hits; Souq Tulkarm's contains **zero**
`whatsapp:` / `wa.me` / `intent:` hits. **Wind's WhatsApp-ordering hypothesis is not
validated by any Palestinian competitor's shipped artifact** — it is a real opportunity
(unclaimed), not a table-stakes pattern to copy.

---

## 1. Cross-app matrix

Legend: **●** = present with evidence in the shipped artifact · **◐** = partial /
present but thin, or present in one role only · **○** = explicitly searched for and **not**
present · **n/a** = app has no delivery domain at all.

| Mechanic | Shiply | Souq Tulkarm | Athkar | Salati | Anchor |
|---|---|---|---|---|---|
| **Address model** | | | | | |
| City / Village / Street triple, no house number | ● | ◐ (zone + free text) | ○ | ○ | SHIPLY F-07 (`City,Village,Street` in the export header) · SOUQ F-01 |
| Separate structured zone/area field | ○ | ● | ○ | ○ | SOUQ F-01 (`zoneId` required) |
| Distinctive-landmark free-text field | ○ | ● | ○ | ○ | SOUQ F-01 (`landmark`, `علامة مميزة`) |
| Saved address book with labels + default | ● (`/addresses`-style save) | ● (`/addresses` `{label,isDefault}`) | ○ | ○ | SOUQ F-01 · SHIPLY F-07 |
| Mandatory street number | ○ | ○ | n/a | n/a | — |
| Map pin / reverse geocode / place picker | ◐ (route `/auth/register/map-location`) | ○ | ◐ (city-from-coords only) | ○ | SHIPLY F-01 · ATHKAR F-02 |
| **Order state machine** | | | | | |
| Explicit status vocabulary | ● (10+ statuses) | ● (29+ statuses, typed) | n/a | n/a | SOUQ F-08 · SHIPLY F-02 |
| Terminal/final status set | ● (`final_status_id`) | ◐ (`final` + `DELIVERY_FAILED`) | n/a | n/a | SHIPLY F-02 |
| Multi-step delivery attempt | ● (`attempttodeliver_three_step`) | ○ | n/a | n/a | SHIPLY F-02 |
| Typed failure reasons | ◐ | ● (9 reasons) | n/a | n/a | SOUQ F-08 |
| Changeable "order type" axis (Pay/Buy/Return/Replace) | ● | ◐ (approvals) | n/a | n/a | SHIPLY F-03 |
| **Payment** | | | | | |
| Cash on delivery | ● (`is_payment_parcel`, "order type to Pay") | ● (`الدفع نقداً عند الاستلام`) | n/a | n/a | SHIPLY F-03 · SOUQ F-03 |
| Card / wallet payment | ● (`/customer/checkout/save-paymentCard`) | ○ | n/a | n/a | SHIPLY F-03 |
| Integer-cents money, ₪ display | ○ | ● (`*Cents` everywhere, `شيكل`) | n/a | n/a | SOUQ F-03 |
| Amount collected vs expected, with variance reason | ○ | ● (`amountCollectedCents`, `discrepancyReason`) | n/a | n/a | SOUQ F-03 |
| Append-only cash ledger, corrections as new entries | ◐ (financial differences) | ● (explicitly "records are not edited or deleted") | n/a | n/a | SOUQ F-06 |
| Driver handover → admin count-and-close | ○ | ● (`/driver/cash/handover` → `/admin/cash/settle`) | n/a | n/a | SOUQ F-06 |
| In-app purchase / subscription | ○ | ○ (Play Billing wired for Pro) | ● (Play Billing 8.0.0 + recovery) | ○ | ATHKAR F-05 · SOUQ §3 |
| **Driver side** | | | | | |
| Shift model (start/stop a working shift) | ○ | ● (`/driver/shift/*`, scan vehicle code) | n/a | n/a | SOUQ F-04 |
| Job board / ready queue | ○ | ● (`GET /driver/ready-queue`) | n/a | n/a | SOUQ F-04 |
| Driver picks from the queue | ○ | ● (`السائق يختار من الطرود الجاهزة`) | n/a | n/a | SOUQ F-04 |
| Offer / accept / decline between drivers | ○ | ● (`offer-transfer` + `/driver/peers`) | n/a | n/a | SOUQ F-04 |
| Custody transfer by scan | ○ | ● (`/driver/custody/{scan,transfer,return}`) | n/a | n/a | SOUQ F-04 |
| Chain of custody, queryable per parcel | ○ | ● (`/orders/{id}/custody-chain`) | n/a | n/a | SOUQ F-05 |
| Driver cannot see customer delivery code / other customers | ○ | ● (stated in UI copy) | n/a | n/a | SOUQ F-04 |
| Driver earnings / settlement | ◐ (`/driver-details/address`, driver notes) | ● (cash handover + shift settle) | n/a | n/a | SOUQ F-04/F-06 |
| External maps navigation handoff | ◐ (Google Maps SDK + API key) | ● (`google.com/maps?q=` / `maps/search/?api=1&query=`) | n/a | n/a | SOUQ F-11 |
| **Delivery proof** | | | | | |
| Customer-held code / QR required to complete | ◐ (`/parcels/qr`, `findByQRCode`) | ● (`deliveryCode` + `deliveryQrToken`) | n/a | n/a | SOUQ F-07 · SHIPLY F-08 |
| Proof contains no PII | ○ | ● (explicitly stated in UI copy) | n/a | n/a | SOUQ F-07 |
| Lockout after failed proof + audited admin reset | ○ | ● (`PROOF_LOCKED`, `/admin/orders/{id}/proof-reset`) | n/a | n/a | SOUQ F-07 |
| **Customer extras** | | | | | |
| Promo / coupon / discount | ● (`/invoices/offers-discounts`, `/promotion-details`) | ● (`/community/deals`) | n/a | n/a | SHIPLY F-11 |
| Ratings | ● | ● (`تقييم البائع … من 5`) | n/a | n/a | SOUQ F-13 |
| Live tracking | ● (notification-summary route + FAQ) | ● (with health/degradation states) | n/a | n/a | SOUQ F-11 |
| Chat with counterpart | ● (tickets + threaded comments) | ● (`/chat/*` + canned replies) | n/a | n/a | SOUQ F-12 |
| Voice messages | ● (expo-audio) | ○ | n/a | n/a | SHIPLY F-11 |
| Scheduled / windowed delivery | ● ("delivery window has passed…") | ● (zone + window + daily cap) | n/a | n/a | SOUQ F-02 |
| Re-order / repeat | ○ | ● (`/orders/repeat-last`) | n/a | n/a | SOUQ F-14 |
| Share link / deep link | ● (10 domains, `/p` prefix) | ○ (no deep links at all) | ○ | ○ | SHIPLY §2 |
| WhatsApp ordering | ○ | ○ | ○ | ○ | searched, absent everywhere |
| Referral programme | ○ | ○ | n/a | n/a | searched, absent |
| **Notifications / push** | | | | | |
| FCM | ● (data-only; delegation off) | ○ (**Web Push** only) | ● | ○ | SHIPLY F-09 · SOUQ limit 5 |
| Per-event notification channels | ● (Notifee `createChannel`) | ○ | ● (`athan_<prayer>_<sound>_v7`) | ◐ (local only) | SHIPLY F-09 · ATHKAR F-03 |
| Offline/queued writes on send failure | ◐ ("Error sending. Event queued.") | ● (idempotency key + `queueAs` on every write) | n/a | n/a | SOUQ F-10 |
| Alarm re-arm after boot/time/timezone | n/a | n/a | ● | ● | ATHKAR F-05 · SALATI F-05 |
| **Analytics / crash** | | | | | |
| Crash reporting | ● (Sentry, org `shiply-qw`, auto-init off) | ○ | ● (Firebase Crashlytics) | ○ | SHIPLY F-10 |
| Product analytics | ● (Firebase Analytics, ad-storage **on**) | ◐ (Firebase datatransport only) | ● (Firebase Analytics + Sessions) | ○ (none) | SHIPLY F-10 |
| Attribution / ad SDKs | ○ | ○ | ○ | ○ | searched, absent in all four |
| **Offline / weak network** | | | | | |
| Offline outbox | ◐ | ● (`souq.outbox` in localStorage) | n/a | n/a | SOUQ F-10 |
| Bundled offline data | ◐ (fonts, ML Kit models) | ◐ (PWA SW + install flow) | ● (adhān audio, Quran SQLite) | ● (adhān audio + fonts) | SALATI F-06 |
| **Localization / UX** | | | | | |
| Arabic-first default locale | ✗ (English inline; Arabic server-delivered) | ● (`lang="ar" dir="rtl"`, Arabic inline) | ● (`app_name` default = `أذكار`) | ◐ (en + ar in base) | ATHKAR F-06 · SOUQ §3 |
| Full English alongside Arabic | ● | ✗ (Arabic only) | ● (`app_label` = "Athkar") | ● | — |
| RTL-specific widgets | ◐ (React Native) | ● (CSS RTL) | ● (Compose + `supportsRtl`) | ● (`RtlViewPager`, `*AR` views) | SALATI F-07 |
| Hijri / locale calendar | ○ | ○ | ● (Umm al-Qura, `Islamic` calendar) | ● | ATHKAR F-12 |
| **Framework** | Expo + React Native (expo-router), Metro bytecode bundle | Vite + React web app in a Capacitor shell | Native Kotlin + Jetpack Compose | Native Java + Views (ProGuard in vendor layer) | each §3 |

---

## 2. Adopt for Wind — pattern only, never code or assets

> Each item cites the artifact finding that justifies it. "Adopt" means Wind should build
> the **behaviour**; it does **not** mean copying code, strings, icons, colours, layouts or
> API shapes from a proprietary app.

| # | Adopt | Why (artifact evidence) | Wind constraint satisfied |
|---|---|---|---|
| **A1** | **Zone-first addressing**: `zoneId` (structured, required) + `addressLine` (free text, required) + `landmark` (optional) + `label` + `isDefault` | Souq Tulkarm posts exactly `{label, zoneId, addressLine, landmark}` to `/addresses` and requires `zoneId` + a ≥5-char address line; the UI labels are `اسم العنوان`, `العنوان التفصيلي`, `علامة مميزة` — **SOUQ F-01**. Shiply independently uses a **City / Village / Street** triple with no house number — **SHIPLY F-07** | *Landmark addresses with no street numbers* — and it makes the delivery fee computable |
| **A2** | **Append-only cash ledger with attributed corrections** — nothing edited, nothing deleted; a correction is a **new entry with a reason**; the driver may not mark cash "received"; only admin may count and close | Souq Tulkarm's own UI copy: `القيود لا تُعدَّل ولا تُحذف. أي تصحيح يُسجَّل كقيد تسوية جديد باسمك وبسببه.` and `لا تستطيع تعديل أي مبلغ بعد تسجيله … العدّ والإغلاق من صلاحية الإدارة وحدها.`, implemented as `/driver/cash/handover {shiftId, handoverAmountCents, notes}` → `/admin/cash/settle {shiftId, countedAmountCents, resolutionNotes}` — **SOUQ F-06** | *Cash-only with an auditable cash ledger* — this is the ledger, already designed and already legal ("سجل محاسبي مطلوب قانونياً") |
| **A3** | **Delivery proof as a customer-held secret**: a code **and** a QR, containing no name/address/amount, required to close the delivery; lockout after failed attempts; audited admin reset | Souq Tulkarm: `deliveryCode` + `deliveryQrToken`, `هذا الرمز يخصك أنت وحدك ولا يحتوي على اسمك أو عنوانك أو مبلغ الطلب`, `بدونه لا يستطيع إغلاق التسليم`, plus `PROOF_LOCKED` and `/admin/orders/{id}/proof-reset` — **SOUQ F-07**. Shiply independently uses QR as the parcel identity (`/parcels/findByQRCode`, ML Kit barcode scanning) — **SHIPLY F-08** | *Cash-only* — proof that cash reached the right hand, without exposing PII |
| **A4** | **Typed delivery-failure reasons** as first-class states, not free text | Souq Tulkarm's enum: `CUSTOMER_UNREACHABLE`, `CUSTOMER_REFUSED`, `CUSTOMER_DID_NOT_PAY`, `CUSTOMER_RESCHEDULED`, `WRONG_ADDRESS`, `INCORRECT_CASH`, `PARTIAL_PAYMENT`, `OTHER_ADMIN_REVIEW` → `DELIVERY_FAILED` — **SOUQ F-08** | Each reason implies a different recovery action; a cash app needs them separated |
| **A5** | **Shift-first driver model with a job board**: scan the vehicle code → shift becomes `ACTIVE` → a **ready queue** the driver picks from; custody by scanning a printed label; the driver is structurally denied the customer's delivery code and other customers' data | Souq Tulkarm: `GET /driver/ready-queue` fetched only while `shift.status === 'ACTIVE'`; scan intents `VEHICLE`/`OFFER`/`TRANSFER`/`RETURN`; `السائق يختار من الطرود الجاهزة`; `السائق يرى الطلبات المسندة إليه … ولا يرى كود تسليم الزبون ولا بيانات زبائن آخرين` — **SOUQ F-04** | *3G/2G* — a shift-scoped queue is the cheapest thing to keep live on a weak link |
| **A6** | **Chain of custody** as an append-only, per-parcel, human-readable event log | Souq Tulkarm: `GET /orders/{id}/custody-chain`; `سجل مسح الرموز واستلام العهدة والتسليم: لإثبات من كان يحمل الطرد ومتى`; Arabic event labels `CUSTODY_TRANSFERRED: 'تحويل عهدة'`, `PACKAGE_ASSIGNED: 'تخصيص طرد'`, `SHIFT_STARTED: 'بدء وردية'` — **SOUQ F-05** | *Auditable* — proves who carried what and when |
| **A7** | **Every write idempotency-keyed and offline-enqueueable, with a human label** | Souq Tulkarm: every mutating call carries `{idempotencyKey: Fe(), queueAs: '<label>'}`; the outbox is `souq.outbox` in `localStorage`; failure copy `تعذر حفظ الإجراء على الجهاز. أبقِ الصفحة مفتوحة وحاول مرة أخرى.`; the server answers `QUEUED` — **SOUQ F-10** | *3G/2G mobile data* — the single most important pattern for Wind's network reality |
| **A8** | **Zone-driven fees + capacity-limited delivery windows with a daily per-window cap** | Souq Tulkarm: `GET /public/schedule?zoneId&days=7`, per-zone `deliveryFeeCents` and `minOrderCents`; `امتلاء فترات التوصيل`; `أقصى عدد طلبات تقبلها هذه الفترة في اليوم الواحد.`; `الزبون لا يرى فترات لهذه المنطقة في الأيام غير المحددة.` — **SOUQ F-02** | *West Bank checkpoints and road closures* — "when can we actually deliver" is a capacity question, not a promise |
| **A9** | **Consent-before-change**: act inside the customer's pre-agreed limit, otherwise **stop and ask**, and notify the counterparty either way | Souq Tulkarm: `substitutionPolicy` in the order payload; `إذا نفد الصنف، احذفه من الطلب ولا ترسل بديلاً`; `نسألك قبل أي تغيير يتجاوز الحد الذي وافقت عليه`; `POST /approvals/{id}/decide`; `تم إبلاغ المحل برفضك` — **SOUQ F-09** | Trust; also the right pattern for a cash app where the amount can change at the door |
| **A10** | **Delivery tracking that reports its own degradation** — stale location, low battery, permission denied are all *states the counterparty sees*, not silent failures | Souq Tulkarm: `STALE_LOCATION`, `LOW_BATTERY`, `POST /driver/shift/location-health`, `التتبع موقوف، والمحل يرى أن التتبع موقوف بدل موقع قديم. قد يتصل بك للتنسيق.` — **SOUQ F-11** | *3G/2G* + checkpoints — a stale pin is worse than an honest "tracking is off" |
| **A11** | **Money in integer cents, displayed as shekels**, with the collected amount entered by the driver at the moment of delivery | Souq Tulkarm: `amountCollectedCents`, `finalTotalCents`, `discrepancyReason`, `السعر المطلوب ${r/100} شيكل` — **SOUQ F-03** | *Cash-only* + auditable ledger — no float arithmetic ever |
| **A12** | **Service level (e.g. same-day) as an attribute of the parcel**, not a separate order type | Shiply: `Same-day delivery is available for this parcel. Do you want to activate JAYEEK?` / `JAYEEK not available for planned dates` — **SHIPLY F-06** | Lets Wind add priority handling without forking the state machine |
| **A13** | **Notification channels per event class, with a version suffix** so a changed definition can be recreated rather than silently reused | Athkar: `athan_<prayerKey>_<soundKey>_v7` plus `ensureAthanChannel` / `deleteChannelSafely` — **ATHKAR F-03**. Shiply uses Notifee `createChannel` with an explicit `channelId` and turns FCM **notification-delegation off** so the app renders data messages itself — **SHIPLY F-09** | Lets Wind ship "driver assigned", "out for delivery", "delivered", "collect cash" as separately mutable channels |
| **A14** | **Alarm re-arm graph** for any deadline Wind must not miss | Salati: receivers for `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `USER_UNLOCKED`, `USER_PRESENT`, `TIME_SET`, `TIMEZONE_CHANGED`, `PACKAGE_REPLACED`, `CONNECTIVITY_CHANGE`, plus `TIME_TICK` and WorkManager fallbacks — **SALATI F-05**; Athkar's `AthanScheduler.nextOccurrence`/`setExact`/silence-window shape — **ATHKAR F-04** | *3G/2G* + cheap handsets — the only way "collect cash by 18:00" survives a reboot |
| **A15** | **Bundle a tiny complete offline fallback** (zones, fees, windows, saved addresses) | Salati bundles the complete adhān audio set and both Arabic and Latin fonts so the app works with no network — **SALATI F-06**; Shiply bundles fonts and ML Kit models — **SHIPLY §3** | *3G/2G* — a driver on a dead SIM still sees today's jobs and the fee table |

---

## 3. Skip for Wind

| # | Skip | Why (artifact evidence) |
|---|---|---|
| **S1** | **Card / wallet payment and card-commission features** | Shiply ships `/customer/checkout/save-paymentCard` and a `visa-commision` opt-in with `/users/agree-to-cover-visa-commision` — **SHIPLY F-03**. Wind is cash-only by constraint, and a commission adds a contractual relationship Wind does not want |
| **S2** | **Marketplace / community / social layer** | Souq Tulkarm carries lists, problems, moderation, follows, blocks, community access rules, question answering, review replies, suggestions, deals — a large surface with **zero Wind value** — **SOUQ F-13, F-14** |
| **S3** | **B2B product catalogue, vendor management, store/cart/checkout, employees, salesmen** | Shiply's `/app/products-catalog/*`, `/app/store/*`, `/app/employees/*`, `/app/salesmen/*` and `/platform/users/{id}/approve` — **SHIPLY F-01, F-12**. Roughly doubles the product surface and is a different business from parcel delivery |
| **S4** | **A web app in a Capacitor shell as Wind's architecture** | Souq Tulkarm's entire Android layer is 4 classes and its JS runs in a WebView — it gives up native background location, native push channels, and reliable offline writes, and it forces a browser-first mental model — **SOUQ §3** |
| **S5** | **Shipping live API keys, Expo project ids and Sentry org/project in the app config** | `app.config` contains the Android + iOS Google Maps keys, `expo.modules.updates.EXPO_UPDATE_URL` with the project id `020aa5af-…`, and the Sentry `organization`/`project` — **SHIPLY §7, limit 6**. Wind must not ship credentials in a decompilable asset |
| **S6** | **`allowBackup="true"` at the application level for an app holding addresses and parcels** | Shiply sets it and only excludes secure-store material — **SHIPLY §2, limit 7**. Wind holds customer addresses and cash records |
| **S7** | **Ad-storage-enabled product analytics** | Shiply sets `google_analytics_default_allow_ad_storage = true`, `…allow_ad_user_data = true`, `…allow_ad_personalization_signals = true` — **SHIPLY F-10**. Wind should make that an explicit decision, not a default |
| **S8** | **`READ_PHONE_STATE`, `RECORD_AUDIO`, `BLUETOOTH`, `DISABLE_KEYGUARD`, `CHANGE_NETWORK_STATE`, full-screen intents** | Salati needs them for adhān + travel mode — **SALATI F-10**. Wind needs none of them; each is a privacy cost in a market where users are sensitive about location and identity |
| **S9** | **Always-on background location** | Salati's `SalatiService` is a persistent `LocationListener` service — **SALATI F-02**. On a 2G phone this is a battery and privacy disaster. Wind should use shift-scoped location instead (A5) |
| **S10** | **Chat-with-canned-replies and community chat as a launch feature** | Souq Tulkarm ships `/chat/canned-replies`, `/chat/{id}/redact`, plus a whole community-messaging stack — **SOUQ F-12**. Expensive until Wind has support volume |
| **S11** | **Reliance on a single hosted origin (Railway) as Wind's production shape** | `https://souq-production-52a0.up.railway.app/api` is the entire backend base URL — **SOUQ §1** |
| **S12** | **Athkar's and Salati's actual products** | Adhkar/Quran/prayer-times/qibla/widgets have no place in a parcel app — **ATHKAR F-01, SALATI F-01** |
| **S13** | **Web Push instead of FCM on Android** | Souq Tulkarm uses `/push/subscribe` + a service worker — **SOUQ limit 5**. It only works because it is a PWA; a native Android app must use FCM |

---

## 4. Defer with an evidence gate

Each item is plausible but needs a specific, checkable condition before Wind builds it.

| # | Defer | Evidence gate | Artifact basis |
|---|---|---|---|
| **D1** | **Driver-to-driver custody transfer** | Gate: **driver density** in Wind's first launch city is high enough that a nearby peer is usually available, **and** Wind has a written custody-dispute policy before a parcel can change hands outside the original driver | Souq Tulkarm: `POST /driver/custody/offer-transfer {scan, toDriverId}` + `GET /driver/peers` + `عرض تحويل طرد` — **SOUQ F-04** |
| **D2** | **A separate driver app / dispatcher console** | Gate: Wind can name the **exact** driver-side decisions the customer app cannot make (offer/accept, route, cash). Neither artifact here proves a customer app can do it — Shiply's customer APK contains only a "change position to driver" action and a driver-note field — **SHIPLY F-05** — and Souq's driver surface lives in the *same* JS bundle, so its separation is unknown | SOUQ F-04, SHIPLY F-05 |
| **D3** | **Voice messages** | Gate: (a) target handsets have a usable mic; (b) voice storage fits the 3G budget; (c) a policy exists for what the app stores | Shiply: `expo-audio` with `microphonePermission: "We need access to your microphone so you can record and send voice messages"`, `Voice recording saved successfully` — **SHIPLY F-11** |
| **D4** | **Home-screen / lock-screen widget** | Gate: Wind's notification delivery rate is proven good on the target handset first — a widget showing stale data is worse than no widget | Salati ships six widgets, all guarded by `com.masaratapp.salati.SALATUK_PERMISSION` — **SALATI F-04** |
| **D5** | **Calendar integration for pickup windows** | Gate: users report that remembering the pickup window is a real problem; and confirm `WRITE_CALENDAR` is acceptable to Wind's users | Salati writes prayer events to the calendar (`WRITE_CALENDAR`/`READ_CALENDAR`) — **SALATI F-10** |
| **D6** | **Per-OEM autostart / battery-optimisation education screens** | Gate: Wind's **own** telemetry shows a material share of deliveries missed because the OS killed the app. Athkar's Huawei/Honor screen is evidence the *problem* exists, not that it is Wind's problem | Athkar: `تشغيل التطبيق في هواتف هونر وهواوي`, `OemLaunchSettings`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — **ATHKAR F-07**; Salati requests Huawei and OPPO permissions — **SALATI F-09** |
| **D7** | **Google Drive / consumer-cloud as the address-book sync backend** | Gate: Google Play Services is present and usable on the target handset, and Wind's account model tolerates a Drive-linked identity. Otherwise ship a first-party endpoint first | Athkar: `core.sync.DriveApi`, `SyncStore$performSync$2$withRetry$1` — **ATHKAR F-09** |
| **D8** | **Weight-based final total / packing station** | Gate: Wind is not shipping a grocery or bulk-goods line. The weight/final-total/consent machinery is ~1/3 of Souq's order logic and is worthless for parcels | Souq: `/packing/{id}/{start,item,finish,reissue}`, `الأصناف تُوزن عند التجهيز` — **SOUQ F-09, F-14** |
| **D9** | **Ratings / two-way reviews** | Gate: Wind has enough completed deliveries for a rating to be meaningful, and there is a moderation path (Souq's is admin-gated `MESSAGE_REDACTED` / review hiding) | Souq: `تقييم البائع ${e.ratingAverage} من 5، ${e.ratingCount} تقييم` — **SOUQ F-13**; Shiply `recipient_rating_bad` — **SHIPLY F-11** |
| **D10** | **Customer-held delivery code as the *only* proof** | Gate: Wind measures how often drivers and customers cannot exchange the code (no signal, no app). Souq couples it with an admin reset and a lockout; Shiply's QR route suggests a scan-based fallback is needed too | SOUQ F-07, SHIPLY F-08 |
| **D11** | **WhatsApp ordering / WhatsApp notifications** | Gate: **none of the four apps does this** — it is an *unclaimed* position, not a proven pattern. Build it only if Wind confirms demand and accepts that it bypasses Wind's own order state, notifications and cash ledger. If Wind wants it, it must be an *entry point* that creates a Wind order, not a parallel channel | Shiply bundle: 0 `whatsapp`/`wa.me` hits · Souq bundle: 0 `whatsapp:`/`wa.me`/`intent:` hits — **both §4/§6** |
| **D12** | **A shared delivery-service abstraction ("JAYEEK"-style third-party courier)** | Gate: Wind has ≥2 contracted carriers whose settlement, SLA and liability terms can be modelled as a service level on a parcel. Shiply's activation is **not reversible** once a date is committed (`same_day_cannot_revert_parcel`) — Wind should not copy that without a compensation path | Shiply F-06 |
| **D13** | **A support ticket system with attachments and threaded comments** | Gate: Wind's tickets/week justifies it; Souq's lighter model (chat + canned replies + community problems) is the cheaper first step | Shiply F-11, Souq F-12/F-13 |
| **D14** | **Remote feature flags for order types / promos** | Gate: Wind has a release-train problem worth solving — otherwise remote config is a liability, not a feature | Shiply's `RemoteConfig`/`RemoteFeatureRules` analogue is Athkar's, **ATHKAR F-12**; Shiply's own remote control is unverified |

---

## 5. Biggest gaps this study could not close

> **Update, 13 Nov 2026 (same session, later pass).** Gaps 1, 3, 4 and 10 below were closed by a
> second pass that installed and studied three more real apps on the owner's phone. The
> additions are **not** merged into the matrix in §1 (which covers the four original artifacts);
> they live in their own files so the first pass stays reproducible as written:
>
> - **[`CAREEM.md`](CAREEM.md)** — `com.careem.acma` 26.43, 73,254 classes, 7 DEX, installed and
>   run on the phone (stops at the OTP wall). Closes the **address-capture-without-street-numbers**
>   gap (pin + nickname + building type + notes + photo) and the **cash-as-first-class-instrument
>   with an arrears rule** gap. Also the only artifact showing a **map provider behind an
>   interface** (`superapp.map.core.MapView` → `map.google.MapViewImpl`) and a **server-driven UI
>   key registry** (`aurora.sdui`, 169 classes).
> - **[`HAAT.md`](HAAT.md)** — `com.haat.client` 21.0.4, 22,115 classes, 4 DEX, installed and run
>   on the phone (fails at the network call). Closes the **Arabic product copy** gap: a complete,
>   shipped Arabic vocabulary for order states, ETA granularity ("أقل من 3 دقائق"), minimum order,
>   service fee, coupons and address details. Also documents referral + deep link + install
>   attribution. **Its API is not reachable from this network** — measured, and reported as a
>   fact about the network, not as "Haat is broken".
> - **[`UBER-4.655-rider.md`](UBER-4.655-rider.md)** — the global benchmark for map-first home,
>   saved places, live tracking and payment-method-first checkout.
>
> **Update, 17 Nov 2026 (this session).** **Driver-side gap (gap 2) is now CLOSED** for all three
> driver artifacts via a class-level REA 6.9.0 pass (jadx-headless-mcp 0.7.1):
> - **Careem Captain** `com.careem.adma` 89.70.2 — **48 class inspections** across earnings,
>   shift/acceptance, cash/debt, location, push, order/pickup, dropoff, cancel, queue, rejection.
>   Findings: step-based job workflow, booked shift + HDL driver-pull queue, customer PIN at
>   pickup, typed cash collection with receipt, line-item earnings taxonomy (`money_in`/`money_out`),
>   typed cancellation policy with acknowledgement protocol, foreground location service, async push
>   worker. Documented in `CAREEM.md` §10.7 and `DRIVER-SIDE-REA-2026-11-17.md`.
> - **HAAT Driver** `com.haat.haatdriver` 9.72 — **9 class inspections** (shift, offer, acceptance,
>   rejection, order flow). Findings: Activity-per-shift-state, ViewModel with auto-reject timeout
>   and reason selection, history-list earnings adapter. Documented in `HAAT-DRIVER.md` §10.7.
> - **HAAT Courier** `com.haat.courier` 1.1.1 — **6 class inspections** (shift, rejection limits,
>   collection, delivery). Findings: `RejectionLimitsActivity` with typed daily/shift counters,
>   Fragment-per-collection/delivery-step with explicit arrival actions. Documented in `HAAT-DRIVER.md`
>   §10.7.
>
> Still open after all passes: **no server behaviour** (gap 5), and **no competitor economics** (gap 9).

1. **Only 2 of the 4 apps are delivery apps.** The brief's premise about Athkar and Salati
   is wrong, so **half the requested competitive surface does not exist in these
   artifacts**. The local competitor set is still under-sampled: **Careem Palestine**,
   **HAAT** and any dedicated Palestinian *parcel* app (e.g. a Bosta-like or a
   Palestinian-specific courier) were **not** in the artifact set and were not studied.
2. **No Shiply driver artifact.** Shiply's customer app expects a driver surface
   (**SHIPLY F-05**) but the driver build was not provided, so the **offer/accept/decline
   handshake, driver earnings and settlement** — which Wind's brief explicitly names — are
   **unanswered from Shiply**. Souq Tulkarm fills the gap partially (same JS bundle).
3. **No Arabic product copy from Shiply.** Its bundle carries English inline; the Arabic
   appears to be server-delivered, so **Shiply's actual Arabic wording, error messages and
   notification text are unknown**. For an Arabic-first Wind, this is a real hole.
4. **No runtime or network evidence.** Everything here is static. No request/response,
   no fee schedule, no server-side validation, no push payload, no notification copy was
   observed. The **exact strings customers see in Arabic** are known only for Souq
   Tulkarm.
5. **No server behaviour anywhere.** Even Souq Tulkarm's append-only ledger is only
   *enforced by UI copy and API shape*; the server-side guarantee is unverified.
6. **`rea decode-android-resources` was unusable** (apktool absent from PATH), so
   resource-level string tables were read with `aapt2` instead — equivalent for string
   values, but it meant no `apktool`-style resource-ID → name mapping for every locale.
7. **The Shiply JS bundle is minified Metro bytecode.** Strings are literals and reliable,
   but **code structure is reconstructed**; exact field names on API payloads are
   best-effort, not authoritative.
8. **Single version per app.** Only one build of each app was available, so
   **feature evolution over time is invisible** — e.g. when Shiply's JAYEEK option or
   Souq's custody chain were added, and what the previous behaviour was.
9. **No pricing, no competitor economics.** No revenue model, no fee structure, no
   driver-economics numbers — all four apps' commercial models are either absent from the
   artifact or obfuscated.
10. **App-store metadata was not consulted.** The Play Store listings, review text and
    update history would explain *why* Athkar and Salati were assumed to be delivery
    apps, and would give shipped-vs-described deltas. Not done.

---

## 6. Reproduction notes

Every number in these files came from a tool run in this session. The commands used:

```powershell
$env:REA_JADX_MCP_JAR="$env:USERPROFILE\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:JAVA_HOME="C:\Users\osama\scoop\apps\temurin17-jdk\current"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:REA_JADX_HEAP_MIB="8192"
$env:REA_JADX_OPERATION_TIMEOUT_MS="900000"

rea inspect-android-package <apk> --format json --full-output     # used
rea search-android-classes   <apk> <query> --format json --full-output   # used
rea inspect-android-class     <apk> <class>  --format json --full-output   # used
rea inspect-android-method    <apk> <class> <method> --format json --full-output  # used
rea trace-android-references  <apk> <class>  --format json --full-output   # available, not needed
rea decode-android-resources  <apk> [--locales ar] --format json --full-output   # FAILS: apktool absent
rea extract-artifact <apk>                                        # FAILS: case-insensitive res/ filename collision

# resource strings (apktool substitute):
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt2.exe" dump resources <apk>
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt2.exe" dump strings   <apk>
```

APKs analysed (read-only; the phone was not touched):
`C:\Users\osama\AppData\Local\Temp\opencode\apks\{athkar,shiply,souqtulkarm,salati}__base.apk`
plus the `athkar__split_config.ar.apk` and `shiply__split_config.ar.apk` language splits.

**Artifacts of the analysis** (outside the repo, session temp dir
`opencode\rea-work\`): decoded JS bundle text, 2,335 recovered exact bundle strings,
per-topic hit dumps, extracted manifests, `aapt2` string dumps.

**Discipline note.** A decompiled method is a *derived representation*, not original
source. No runtime behaviour, network traffic or server behaviour is claimed anywhere in
these files. No proprietary code or asset was copied into this repository — only short
identifiers, string constants, field names and status tokens are quoted as evidence.
