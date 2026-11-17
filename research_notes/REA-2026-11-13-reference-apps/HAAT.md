# HAAT - static REA reference (Palestinian grocery + food delivery)

**Artifact:** `com.haat.client` v**21.0.4** (versionCode **312**)
**Study date:** 2026-11-13 — **Method:** static analysis of a real Play Store build **plus** a
first-run runtime pass on the owner's phone (`SM-A5360`, Android 16), which fails at the network
call and stops there.
**Engine:** custom DEX + resource extraction (`dexparse.py`, `aapt2` from `build-tools\36.1.0`),
REA method.

> **Why Haat matters to Wind.** Haat is the closest thing to Wind that actually *ships at scale in
> Palestine*: **1M+ Play Store downloads, 4.8★ from ~12K reviews**, Arabic-first, cash and card,
> landmark addressing, a three-app fleet (client / driver / courier), and — critically — **it runs
> on the same West Bank networks Wind runs on and its API is unreachable from them.** Its
> Arabic order-state copy is the most valuable single artifact in the whole REA set for Wind,
> because it is written by people who deliver in Palestine, for people who receive in Palestine.
>
> The negative finding matters too: a well-funded competitor with 1M+ downloads cannot reach this
> network either. That is a fact about the Palestinian internet, not about Haat's engineering.

---

## 1. Artifact identity

| Field | Value | How it was read |
|---|---|---|
| Package | `com.haat.client` | `aapt2 dump badging` |
| versionName / versionCode | **21.0.4** / **312** | `aapt2 dump badging` |
| Base APK size | **31,651,759 bytes (30.18 MiB)** | `Get-ChildItem` |
| Base APK SHA-256 | `52279A92F31FEBAFAC3EAAA7B64348A762E5BB41879E8B1EA318B7DEBD150366` | `Get-FileHash` |
| DEX files | **4** (`classes.dex` 10.86 MB, `classes2.dex` 37 KB, `classes3.dex` 9.78 MB, `classes4.dex` 903 KB) | ZIP central directory |
| Class count | **22,115** | `dexparse.py` over the 4 DEX files |
| String count | **156,174** | same |
| minSdk / targetSdk | **32 / 35** | `aapt2 dump badging` |
| Permissions declared | **25+** (incl. `CALL_PHONE`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `FOREGROUND_SERVICE_DATA_SYNC`, `RECORD_AUDIO`, `AD_ID`) | `aapt2 dump permissions` |
| Installed on device | 2026-11-13 03:56 local, first install = last update | `dumpsys package` |
| Play Store listing | 14 MB download, 4.8★, ~12K reviews, **1M+ downloads** | Play listing |
| iOS equivalent | v21.0.4, 4.44★ / **23,914 ratings**, 164.5 MB, AR/EN/HE | App Store listing |
| Sibling apps | **Haat Driver** `com.haat.haatdriver` v9.72 · **Haat Courier** `com.haat.courier` v1.1.0 | Play listings |

For scale: the Wind production APK carries one ~4.3 MB JavaScript bundle; Haat carries
**22,115 classes**. Again — read the *architecture*, not the size.

---

## 2. What the runtime pass saw

`[ran]` on `SM-A5360`, owner's Wi-Fi (validated, 433 Mbps link, 9–19 ms RTT to 8.8.8.8,
54–64 ms RTT to `haat.delivery`):

1. Splash → **location permission dialog** ("تحتاج HAAT إذن لتحديد موقعك لتزويدك بأفضل وأدق خدمة توصيل" —
   *HAAT needs location permission to determine your location and give you the best and most accurate
   delivery service*). Grant → dismiss → **"لا يوجد اتصال بالإنترنت"** (*no internet connection*).
2. The app never advanced past the splash/permission screen; it sat on `SplashActivity` with a
   permission dialog for the whole pass. `uiautomator` reported *"could not get idle state"*,
   which is the usual signature of an app blocked on a network call with the UI thread waiting.
3. Network forensics on the phone and from the PC:

| Host | From | Result |
|---|---|---|
| `envs-list.haatcloud.com` | PC (1.1.1.1) and phone | **NXDOMAIN — does not exist** |
| `haatcloud.com` | PC (1.1.1.1) | SOA only, no A record |
| `haatproduction.blob.core.windows.net` | PC (1.1.1.1) | **NXDOMAIN** |
| `haat.delivery` | PC and phone | **A = 198.202.211.1**, HTTP 200, `Server: cloudflare`, 54–64 ms RTT |
| `user.haat.delivery` | PC | 104.20.20.185 / 172.66.171.120 (Cloudflare) |
| `icom.yaad.net` | PC | 176.100.170.239 (reachable) |

`[read]` in the binary: the app fetches its environment list from `https://envs-list.haatcloud.com/`
(`dex_strings.txt` index 137079). With that host dead from here, the app cannot resolve which
environment to talk to, and shows "no internet connection" — a **misleading error for a real
configuration/DNS failure**, which is itself a lesson for Wind.

**Conclusion about the runtime pass:** no home screen, no product, no order screen was observed.
Everything in sections 3–6 is binary or store-listing evidence, not observed behaviour.

---

## 3. Architecture — a native app with an Israeli-heritage backend

| Package / namespace | Classes | What it is |
|---|---|---|
| `com.google.*` | 3,238 | Play services, Places, Firebase, auth |
| `io.intercom.*` | **3,021** | **in-app customer support chat** — the largest third-party surface in the app |
| `io.appsflyer.*` | 443 | install + referral attribution |
| `com.haat.client.*` | 267 | Haat's own code |
| `com.appsflyer` / `com.braze` | 420 | Braze engagement |
| `com.yalantis.*` | 88 | image cropping / UI components |
| `androidx.media3` + `com.google.android.exoplayer2` | 59 / 31 | video (ads, onboarding) |
| `com.facebook.*` | 28 | login / sharing |
| `androidx.compose` | 24 | Compose UI parts |
| `androidx.datastore` | 19 | preferences |
| `com.pairip.*` | **36** | Play Integrity / licensing (anti-tamper) |
| `com.mixpanel` / `com.datadog` / Firebase | 14 / 10 / crashlytics 2, messaging 5 | analytics, RUM, crash, push |
| `io.coil` / `com.bumptech.glide` | 15 / 11 | image loading |

Haat's own package shape (`com.haat.client.*`, 267 classes):

| Sub-package | Classes | What it is |
|---|---|---|
| `ui.activity` | 40 | screens |
| `haats.web` | 34 | **WebView-hosted screens** (marketing, legal, promo landing) |
| `model.search` | 32 | search models |
| `ui.components` | 26 | design-system components |
| `ui.views` | 17 | custom views (`HaatTextView`, `HaatRecyclerView`, `HaatDynamicRectView`, `SemiCircleArcProgressBar`, `AutoScrollViewPager`, `OnlyVerticalSwipeRefreshLayout`, `NonSwipeableViewPager`) |
| `data.local` | 15 | local persistence (Room/DataStore) |
| `model.referral` | 11 | **referral models** |
| `remoteConfig.datadog` + `model.remoteConfig` | 8 + 8 | remote config |
| `ui.bottomsheets` | 8 | bottom sheets |
| `activity.globalsearch` | 8 | global search |
| `model.annoncement` | 3 | announcements |
| `model.restaurantMarketHomeResponse` | 2 | home feed (restaurants + market) |
| `model.checkout`, `model.review` | 2 each | checkout + reviews |
| `service.MyServiceRefreshUserToken` | 1 | **auth-token refresh as a foreground service** |

API surface (`[read]` from strings): `/api/place-order`, `/api/venue/%s/item/%s`,
`/api/charge-supplier/tenbis/balance`, `/api/users/%s/terms-and-privacy-consent`, `/api/v2/logs`,
custom headers `Android-Haat-User` and `DD-API-KEY`, deep link
`haat://haat.delivery?type=referAndEarn`, account deletion at
`https://user.haat.delivery/delete-account`.

The `tenbis` path and `icom.yaad.net` identify the heritage: Haat's commerce and payment plumbing
grew out of an Israeli grocery-delivery operation, with Yaad (an Israeli payment gateway) behind
the card flow. For Wind this is a **structural lesson, not a technical one**: Haat ships
marketplace, restaurant, courier and wallet surfaces inside one APK because its backend does.

---

## 4. The Arabic order-state vocabulary — the most valuable find

Haat ships a complete, human Arabic vocabulary for the states an order passes through. Every
string below is `[read]` from the shipped `values-ar` resources:

| Concept | Haat's Arabic | Note for Wind |
|---|---|---|
| Contact driver | **«تواصل مع السائق»** | a direct action, always reachable |
| Rate driver | **«قیم السائق %1$s»** / «قیم السائق» | rated per order, with the name inline |
| Minutes left | **«%1$s دقائق متبقية»** / «أقل من 3 دقائق» / «أقل من 5 دقائق» / «أقل من 10 دقائق» | three granularities: exact, "less than", done |
| Order received by sender | **«تم استلام الطلبية من قبل المرسل»** | explicit custody transfer to the sender |
| Restaurant rejected the order | **«المطعم رفض الطلبيه»** | a named rejection state |
| Minimum order | **«الحد الأدنى هو %1$d منتجات»** / «الحد الأدنى هو منتج واحد» | stated *before* checkout |
| Service fee | **«رسوم الخدمة:»** | a separate, labelled line — not folded into the total |
| Cash | **«نقدي»** | |
| Cash only | **«نقدًا فقط»** | |
| Card | **«إضافة بطاقة جديدة»** | |
| Coupon | **«كوبونات منفصلة جاهزة للاستخدام عند الدفع»** / «جاهز للاستخدام عند الدفع» | coupons surfaced at payment, plural |
| Address details | **«تفاصيل العنوان»** / «املأ تفاصيل عنوانك» / «أضف عنوانًا» / «لم تجدوا عنوانكم؟» | an address *details* form is a first-class screen |
| Manual location | **«تحديد الموقع بشكل يدوي»** / «تحديد الموقع» / «الموقع الحالي» / «حذف الموقع» | pin + manual + current + delete |
| Search | **«البحث عن مكان»** + *"When searching for businesses or places near a geographic location, Google Maps shows local results…"* | Google Places with a **user-visible Arabic disclosure** |
| Empty states | **«لم يتم العثور على الطلبات الحالية»** / «لم يتم العثور على الطلبات القديمة» | separate current vs past empty states |
| No-internet | **«لا يوجد اتصال بالإنترنت»** / *"Please make sure your internet connection is stable and try again"* | |

Two things Wind should copy immediately:

1. **Order states in Arabic with the actor named** ("تم استلام الطلبیة من قبل المرسل" — the sender
   has received it). Wind's status ladder is English-named internally and generic in Arabic.
2. **"أقل من N دقائق" granularity.** Wind's ETA is a single rounded number; Haat distinguishes
   "under 3 minutes" from "5 minutes remaining", which is what a customer actually needs.

---

## 5. Checkout and commerce mechanics

`[read]` from strings: minimum order per venue, **service fee as its own labelled line**, separate
coupons usable at payment, cash **and** card ("لضمان خصوصيتك، ستتم عملية تحقق آمنة للموافقة على
البطاقة" — an Arabic 3DS/SCA explanation shown to the user), cart with *"Are you sure you want to
delete the whole cart?"* guard, per-item quantity and *"products sold by weight"*, order edit
before dispatch ("تعدیل الطلبیة") and a hard "you cannot change or cancel the order" state after
dispatch ("لا یمكن تغییر او الغاء الطلبیة بعد ارسال الطلبیة").

Wind's parcel product is the direct analogue: a minimum, a fee that must be *visible*, and a
point after which cancellation is refused.

---

## 6. Support, referral and remote config

- **Support is a product surface, not an email link.** 3,021 Intercom classes ship in the app.
- **Referral is a modelled feature** (`com.haat.client.model.referral`, 11 classes) with a deep
  link `haat://haat.delivery?type=referAndEarn` and AppsFlyer attribution (443 classes) to prove
  which install came from which referral.
- **Remote config** (`remoteConfig.datadog`) so ops can change behaviour without a release.
- **Live activity / lock-screen tracking** is documented in the iOS release notes ("يتيح لك Haat
  تتبّع طلبك مباشرة من شاشة القفل") — the iOS notes also document **cashback and campaigns**,
  **items by weight**, an **improved address flow**, and **offline screens**.

---

## 7. Adopt / skip for Wind

**Adopt (patterns, re-implemented in Wind's own code):**

1. The **Arabic order-state vocabulary** in section 4, verbatim as copy inspiration. This is the
   single highest-value transfer in this file.
2. **ETA granularity** ("less than N minutes" alongside an exact estimate).
3. **A separate, labelled service-fee line** and a **stated minimum** before checkout.
4. **Coupons surfaced at the payment step**, not in a separate promo tab.
5. **Address details as its own screen** with manual / current / pin / delete actions.
6. **Rate the driver and contact the driver** as always-reachable actions on the live order.
7. **Referral with a deep link + install attribution** (Wind has a referral code but no
   attribution, so it cannot tell which referral produced which install).
8. **Remote config**, so a copy or threshold change does not need a Play Store release.

**Skip:**

- Marketplace + restaurant + courier + wallet in one APK. Wind's product is parcel and ride.
- Intercom (3,021 classes) — a human answers from the owner's phone; use WhatsApp, which the
  pilot population already has.
- The Israeli payment gateway and the `tenbis` heritage.
- AppsFlyer / Braze / Mixpanel / Datadog / Play Integrity wrapping for a 2-city pilot.

---

## 8. What is not known

- **No product screen was ever rendered** — the app never got past the splash permission dialog
  on this network, so no home screen, venue list, cart, checkout, tracking or rating screen was
  observed. Every product claim here is from the binary or the store listings.
- Whether Haat operates in the West Bank proper or only in the 1948 territories is not in the
  artifact (its iOS listing is AR/EN/HE and its Arabic is Palestinian-colloquial; its payment
  heritage is Israeli).
- The **driver app** (`com.haat.haatdriver`) and **courier app** (`com.haat.courier`) were not
  pulled, so the offer/accept handshake, courier settlement and driver payouts are unanswered.
- Haat's tariffs, take rate, minimums and delivery fees are **not** in the artifact.
- Why `envs-list.haatcloud.com` and `haatproduction.blob.core.windows.net` do not resolve is
  unknown: geo-blocking, a decommissioned host, or an ISP-level block all look identical from
  this network. **Do not report this as "Haat is broken"** — report it as "Haat is not reachable
  from this network", which is what was measured.

---

## 11. Second independent pass — verified deltas

This file was produced by one analysis pass. A second pass over the same artifact (`com.haat.client`
21.0.4, base `31,651,759` B, SHA-256 `52279A92F31FEBAFAC3EAAA7B64348A762E5BB41879E8B1EA318B7DEBD150366`)
added the following, using the REA toolchain (JADX bridge 0.7.1, JAR SHA-256 `6e5eacf5…eff75`) rather than a
custom DEX parser. Where the two passes disagree on a count, both are given.

### 11.1 The landmark-address proof, in the app's own Arabic

`[obs]` The single most useful string for Wind, with its exact key:

| key | English | Arabic |
|---|---|---|
| `if_there_is_no_building_number_use_driver_instructions_to_describe_your_exact_location` | If there is no building number use driver instructions to describe your exact location | **"إن لم يكن هناك رقم مبنى، استعينوا بالتعليمات للمرسل لوصف موقعكم الدقيق"** |

Around it, the complete landmark-first form `[obs]`: `Add_area_name` (أضف اسم المنطقة) · `choose_an_area`
(اختر منطقة) · `area` (منطقة) · `address_details` (تفاصيل العنوان) · `fill_in_your_address_details` ·
`building_number` (رقم المبنى) · `street_name` (اسم الشارع) · `instruction_for_the_driver` (تعليمات للمرسل) ·
`leave_a_note_for_the_driver` (اضف ملاحظة للمرسل) · `tell_the_driver_how_to_locate_you` ·
`choose_from_previous_locations` (استخدم موقع سابق) · `current_location` (موقعي الحالي) ·
`can_t_find_your_address` (لم تجدوا عنوانكم؟).

`[obs]` **Area is required; building number and street are present but optional; the driver-instruction field is
what actually locates the person.** The placeholder example is keyed `example_ain_jarrar_the_back_district` —
Ein Jarrar is a Palestinian locality — and reads "Example: By the main post office" (مثال: بجانب مكتب البريد
الرئيسي). That is the address shape Wind should build, and it independently matches Souq Tulkarm's
`zoneId + addressLine + landmark` form from a different vendor.

### 11.2 Locale coverage, counted per locale

`[obs]` 1,617 strings in the base; **1,526 Arabic**, **1,525 Hebrew**, then 824 each for ru/nl/de/th/in and a
long tail of 70+ locales. Hebrew at parity with Arabic is a product decision worth naming rather than assuming.

### 11.3 What the app is made of

`[obs]` Using REA's class inventory: **19,025** class definitions, of which only **229** are `com.haat.client`.
The rest is SDK: `com.google.android` 2,736 · `io.intercom.android` 1,371 · `bo.app` (Braze) 431 ·
`com.appsflyer.internal` 272 · `com.braze.ui` 119 · `org.eclipse.paho` (**MQTT**) 112. `[obs]` The second pass
counts 22,115 class definitions with its own parser; the difference is a counting-basis difference, not a
disagreement about the app.

`[obs]` Manifest facts: 4 activities / 11 services / 13 receivers / 4 providers in REA's component projection;
``android:name="com.pairip.application.Application"`` — **Play's PairIP integrity wrapper** — with
`com.android.vending.CHECK_LICENSE`; `allowBackup="false"`, `supportsRtl="true"`, `largeHeap="true"`,
`extractNativeLibs="false"`.

`[obs]` **Live tracking runs over MQTT** (`org.eclipse.paho.android.service.MqttService`), not WebSocket or
long-poll. For a 3G market that is a defensible alternative to Wind's signed-cursor long-poll, and it is a
hypothesis to measure, not a decision.

### 11.4 Order state is deliberately two-value on the client

`[obs]` `com.haat.client.data.local.db.schema.cart.CartStatus` is an enum with exactly **two** entries,
`InProgress` and `Completed`, plus a `status` String field. The real state machine is server-side. **Do not
simplify Wind toward this** — Wind's server-owned machine is richer, and that is a strength.

### 11.5 Two counter-examples internalised

`[obs]` `delivery_fee` and `driver_charge` both carry the Arabic label **"سعر التوصيل"** — two keys, one label.
Whatever it means, Wind's copy table should not repeat it.

`[obs]` These are the permissions Wind should *not* mirror: `RECORD_AUDIO`, `READ_PHONE_STATE`,
`WRITE_EXTERNAL_STORAGE`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `AD_ID`, `ACCESS_ADSERVICES_*`. Wind's
parcel flow needs none of them, and six data processors (Braze, AppsFlyer, Intercom, Datadog RUM, Crashlytics,
Facebook) are not what a 50-user pilot should start with.
