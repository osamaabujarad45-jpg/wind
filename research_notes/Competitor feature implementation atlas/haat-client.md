# HAAT (هات) — client app internal mechanism

**Artifact:** `com.haat.client` 21.0.4 · versionCode 312 · minSdk 32 · targetSdk 35 ·
compileSdk 36 · packageName `com.haat.client` · base ~30 MB + `split_config.arm64_v8a` + `split_config.xxhdpi`
**Method:** static analysis only; `rea inspect-android-package`, aapt2 36.1.0 resource dump (raw
bytes, not PowerShell-redirected), DEX string pool scan
**Labels:** `[O]` observed · `[I]` inference · `[U]` not establishable
**Unknowns:** server behaviour, payment enforcement, MySQL/internal stack — all unverifiable from this artifact.

---

## 1. Artifact identity — what the APK declares

| Field | Value |
|---|---|
| Package | `com.haat.client` |
| versionName / versionCode | 21.0.4 / 312 |
| minSdk / targetSdk | 32 / 35 |
| Classes | 19,025 (JADX view) |
| Resource entries | 2,155 |
| Native entry point | `com.pairip.application.Application` (Google Play `pairip` license check) |
| `allowBackup` | **false** (correctly) |
| Intercom | **3,000+ classes** — support is a product surface, not an email link |
| Firebase | Crashlytics, Performance, Analytics, Messaging, Remote Config, App Check (Play Integrity), Sessions |
| Messaging | `org.eclipse.paho.android.service.MqttService` — MQTT, foreground `dataSync` — push beyond FCM |
| Payments | `com.google.android.gms.wallet.api.enabled=true` (Google Pay) + `CompositeAuthentication` button/refresh |
| Attribution | AppsFlyer (installation + referral proofs) |
| Observability | Datadog RUM (`DdRumContentProvider`) + Firebase Perf + Mixpanel |
| Deep links | `haat://haat.delivery?…`, `https://haat.delivery`, `https://www.haat.delivery`, `https://haat.onelink.me` |

**Permissions of note:** `USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM`, `FOREGROUND_SERVICE_DATA_SYNC`,
`CALL_PHONE`, `CAMERA`, `RECORD_AUDIO`, `READ_PHONE_STATE`. WAZE/WhatsApp/Google Maps/Instagram/
Facebook/Google Maps queried via `<queries>` — nav hand-off. `com.haat.client.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` signature-scoped.

---

## 2. Framework and stack

`[O]` Native Java/Kotlin app with Views (no React Native, no Compose at the app level; Intercom embeds
Jetpack Compose). Base package `com.haat.client`, activity nouns under `…client.activity.*` /
`…client.ui.activity.*`. Firebase App Check + pairip license check + splitting required for Play delivery.

---

## 3. The Arabic order-state vocabulary — the single most valuable find in the set

Extracted verbatim from the shipped `values-ar` resources (`aapt2 dump resources`):

| Concept | Haat's Arabic | Note for Wind |
|---|---|---|
| Order sent to restaurant | **«تم ارسال طلبيتك الى المطعم»** / «…الى المتجر» | actor named: *to the restaurant* / *to the store* |
| Restaurant started preparing | **«بدأ المطعم بتجهیز الطلبیة»** | explicit prep state, not a generic "processing" |
| Order being prepared | **«الطلبية قيد التحضير»** | distinct from "sent" |
| Order ready | **«الطلبية جاهزة»** | pickup-ready trigger |
| Driver assigned | **«لقد تم تعيين المرسل»** | explicit assignment event |
| Driver on the way | **«المرسل أخذ الطلبیة وھو في طريقه إلیك»** | actor named + direction-causal |
| Order received by sender | **«تم استلام الطلبية من قبل المرسل»** | explicit custody transfer |
| Restaurant/Store rejected | **«المطعم رفض الطلبيه»** / **«وافق المطعم على الطلب»** (positive twin) | named rejection state |
| Order timed out | **«انتهت مهلة الطلب»** | a named timeout state |
| Delivered | **«تم تسليم الطلبية»** | terminal success |
| Cancelled | **«طلبية ملغية»** | terminal negative |
| ETA granularity | **«{minutes} دقائق متبقية»** / «أقل من 3 دقائق» / «أقل من 5 دقائق» / «أقل من 10 دقائق» / «أقل من دقائق» | exact, "less than", done |
| Minimum order | **«الحد الأدنى هو %1$d منتجات»** / «الحد الأدنى هو منتج واحد» | stated before checkout |
| Maximum order | **«الحد الأقصى هو %1$d منتجات»** / «الحد الأقصى هو منتج واحد» | stated before checkout |
| Service fee | **«رسوم الخدمة:»** | its own labelled line, **not folded into the total** |
| Same: delivery fee | **«سعر التوصيل:»** / «تكلفة التوصیل:» | two labelled lines |
| Coupon | **«كوبونات (%s)»**, «كوبونات منفصلة جاهزة للاستخدام عند الدفع», «جاهز للاستخدام عند الدفع» | plural, at payment |
| Cadence / ETA | **«الساعة المقدرة لتسليم الطلبية»** | "estimated clock for order delivery" |
| Edits locked after dispatch | **«لا یمكن تغییر او الغاء الطلبیة»** | hard lock, matches Wind's post-lock rule |

**Two copy moves Wind's product should absorb:**
1. **Name the actor in the state** — "تم استلام الطلبية من قبل المرسل" (the sender has received the order) is
   what a customer actually needs, not "Status: 4".
2. **The "أقل من N دقائق" ladder** — Wind's ETA is one rounded number; Haat's 3/5/10-minute granularity
   is what a customer actually needs.

---

## 4. Address model — landmark addressing that actually works

- **Three code paths:** pin (move the pin), **manual entry** («تحديد الموقع يدويًا»), **current location**
  («استخدام موقعي الحالي») — Plus «حذف الموقع» (delete saved).
- **"Labelling system"** for the pin: «اسم الموقع» (name) + «تفاصيل العنوان» (details) + floor/building
  instructions («اكتبوا 0 إن لم يكن هناك رقم طابق» — "write 0 if there is no floor number") +
  «ساعدوا المرسل في تحديد مكانكم» (help the courier identify your location) — **the app instructs the
  customer to help the courier find them**, which is exactly the West-Bank no-street-number reality.
- **Save location** button: «حفظ الموقع» — saved addresses on file, used later for fast checkout.
- **Autocomplete / Google Places fusion**: «البحث عن مكان» with Quick-Google Maps disclosure in Arabic
  shown to the user (not legalese, visible Arabic text).
- **GPS permission re-request**: «HAAT سوف تستخدم موقعك الحالي» with a fallback to manual entry.

---

## 5. Checkout and commerce mechanics

- **Standalone service-fee line**: «رسوم الخدمة:» with copy: «رسوم الخدمة تساعد في الحفاظ على تطبيقنا
  وتحسينه، تغطية التكاليف مثل الصيانة ودعم العملاء» — explicit, labelled, never merged into the total.
- **Delivery fee as its own line**: «سعر التوصيل:» / «تكلفة التوصیل:» per branch.
- **Minimum-order gate**: «الحد الأدنى هو %1$d منتجات» shown before cart — prevents the entire support
  class of "why was my card charged ₪20?"
- **Cart saved per branch** — «سلة محفوظة»: the cart is remembered per venue — Wind can adopt the same for
  saved carts per branch/restaurant.
- **Weight-priced items** — «المنتج بأوزان», «تباع بالوزن».
- **Substitution flow** — «منتج بديل» — replaces unavailable items rather than hard-cancel; the user
  confirms the substitution before charge.
- **Card 3DS**: «لضمان خصوصيتك، ستتم عملية تحقق آمنة للموافقة على البطاقة، مما يساهم في حماية معلومات
  الدفع الخاصة بك» — the Arabic SCA/3DS explanation shown before the bank challenge.
- **"You cannot change or cancel after dispatch"** — «لا یمكن تغییر او الغاء الطلبية» — hard terminal state.

---

## 6. Support, referral and remote config

- **Intercom, ~3,000 classes**: support is a first-class surface — chat, tickets, articles, surveys.
- **Referral**: «ادعوا اصدقاءكم إلى HAAT. يحصلون على خصم، وتكسبون رصيداً على كل طلب أول لهم» — earn on
  each first order. Deep link `haat://haat.delivery?type=referAndEarn` and AppsFlyer proof.
- **Coins/wallet**: «عملات هات» — a wallet surface: «قسائمكم», «قسائمي», «عملات مستردة», «لا توجد عملات متاحة».
- **Firebase Remote Config** gates feature rollout; AppsFlyer proves install attribution per referral.
- **Deep links**: `haat://haat.delivery?type=referAndEarn`, `https://haat.delivery/store/…`,
  `https://haat.onelink.me/…`.

---

## 7. Network / backend — what the APK reveals

| Host | Role | `[O]` Reachability from this PC |
|---|---|---|
| `https://haat.delivery` | cloudflare | A=198.202.211.1; HTTP 200, `Server: cloudflare`, 54–64 ms RTT |
| `https://user.haat.delivery` | cloudflare | A=104.20.20.185 / 172.66.171.120 |
| `user.haat.delivery/delete-account` | account deletion | — |
| `https://haat.onelink.me` | OneLink deep links | — |
| `icom.yaad.net` | Yaad payments gateway | 176.100.170.239 (referenced in prior study) |

**No auth probe was run** here — static strings + prior measured network reality only: the API is
unreachable from West Bank networks (prior measured observation; consistent with Palestinian internet
conditions, not Haat engineering). Mirror behaviour: the client shows «لا يوجد اتصال بالإنترنت» —
**service degrades honestly** on no-network rather than hanging the UI thread.

---

## 8. Three-app fleet implications

The artifacts point to a **three-app fleet**: `com.haat.client` (this), `com.haat.haatdriver`,
`com.haat.courier`. Customer and merchant-courier are separate APKs. The fleet design tells us:

- **Customer app is a UI shell over a server-driven surface** — most copy and all offer/category
  configuration is server-delivered, not baked in.
- **Push is multi-channel**: FCM + MQTT + Braze (lifecycle/marketing) + Intercom (support) — Wind's own
  single-channel FCM is under-powered for the same base.
- **Support is a product, not an add-on** — Intercom everywhere; support is owned, measured, and offered
  before checkout.

---

## 9. Adopt / skip for Wind

| # | Adopt for Wind | Verdict |
|---|---|---|
| 1 | «الحد الأدنى هو X منتجات» before checkout | **adopt** — prevents abandonment and card-declined support |
| 2 | «رسوم الخدمة:» as its own labelled line | **adopt** — its own transparent line, never merged |
| 3 | «أقل من N دقائق» ETA ladder | **adopt** — replaces round ETA with honest granularity |
| 4 | Actor-named state copy | **adopt wholesale** — «استلام من قبل المرسل» |
| 5 | «لا یمكن تغییر او الغاء الطلبیة» hard post-dispatch lock | **adopt** — aligns with retention rule |
| 6 | «ساعدوا المرسل في تحديد مكانكم» address-help copy | **adopt** — an instruction to help the courier |
| 7 | Three-path address input (pin / manual / current) | **adopt** |
| 8 | `haat.onelink.me` + `haat://haat.delivery` deep-link host | **adopt shape** (Wind's own deep-link host) |
| 9 | Intercom-class support inside the app | **defer** — expensive; a canned-reply chat is enough for now |
| 10 | Multi-channel push (FCM + MQTT + Braze) | **defer** — FCM + one lifecycle campaign system will do |
| 11 | pairip/App-Check attestation | **adopt for later** — for release integrity on public APK |
| 12 | Copy their Arabic verbatim | **skip** — same language, *not the same sentences*; Wind is not grocery delivery, and copy is trade-dress |
| 13 | Their backend stack | **unknown / N/A** — unreachable, unmeasurable, no purchase possible |

---

## 10. Unknowns —

- Payment enforcement (whether card required for any path, or cash fallback exists) — not establishable.
- Backend architecture, data model — only that it's cloudflare + some .NET-style API paths.
- The driver/courier apps' actual mechanics — not yet obtained from the store.
- Any of the three apps' release schedule vs Play Store.
