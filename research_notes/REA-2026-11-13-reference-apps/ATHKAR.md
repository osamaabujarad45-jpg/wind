# ATHKAR — static REA reference (Palestinian regional Android app)

**Artifact:** `net.fares.athkar` v1.1.1 (versionCode 33)
**Study date:** 2026-11-13 · **Method:** static only (no execution, no device)
**Engine:** REA 6.7.0 / jadx-headless-mcp 0.7.1 · **Artifact SHA-256:** `25ffad354d077a96b048e94447b36f0932884976e90352096bbb2059e3b4a00a`

> **HEADLINE CORRECTION TO THE STUDY BRIEF.** The brief describes Athkar as "rides + delivery".
> That is **not** what this artifact is. Athkar is an **Islamic religious app**: adhkar
> (أذكار), Quran reader, prayer times, qibla, home-screen widgets, and daily-worship
> tracking. There is **no** delivery, order, driver, cart, address, trip, courier,
> wallet or payment code anywhere in its 17,372 classes (§4, F-01). It is still worth
> studying — as a **Palestinian-market Android craft reference** (Arabic-first defaults,
> RTL, exact-alarm scheduling, Play Billing with subscription recovery, Google Maps
> city detection) — but it is **not** a delivery competitor and must not be used as
> evidence for delivery mechanics.

---

## 1. Artifact identity

| Field | Value | Source command |
|---|---|---|
| Package | `net.fares.athkar` | `rea inspect-android-package athkar__base.apk --format json` → `normalized_result.package_name` |
| versionName / versionCode | `1.1.1` / `33` | same → `version_name`, `version_code` |
| Base APK size | 159,914,697 bytes (152.5 MiB) | `Get-ChildItem` on the APK set |
| Base APK SHA-256 | `25ffad354d077a96b048e94447b36f0932884976e90352096bbb2059e3b4a00a` | `rea inspect-android-package` → `subject.digest.sha256` (matches `Get-FileHash -Algorithm SHA256`) |
| DEX files | **6** (`classes.dex` … `classes6.dex`; sizes 13,417,520 / 38,644 / 8,917,132 / 9,619,348 / 11,099,436 / 9,235,372) | APK central-directory listing via `System.IO.Compression.ZipFile` |
| Class count | **17,372** (`raw_class_count` 17,372) | `rea inspect-android-package` → `normalized_result.class_count`; `raw_result.calls[load_apk]` |
| Resource count | **2,261** | same → `normalized_result.resource_count`; `load_apk.resource_count` |
| minSdk / targetSdk / compileSdk | 26 / 36 / 36 | same → `min_sdk`, `target_sdk`; manifest `android:compileSdkVersion="36"` |
| Signer | **not exposed** — `signature_verification: "not_performed"` | same → `normalized_result.signature_verification` |
| REA evidence id | `ev_742cd4629d6804c1de1fcd84af1c57511b4f83dd1c51fa37d5891acf97405bef` | same → `evidence_id` |
| Sibling splits | `athkar__split_config.ar.apk` (111,001 B, sha256 `15434c39…f7b9f6`); `athkar__split_config.arm64_v8a.apk` (2,191,962 B, sha256 `32db9a9b…d7d42b1`); `athkar__split_config.xxhdpi.apk` (99,710 B) | `Get-FileHash` over the APK set |
| App label / name | `app_label` = `"Athkar"`, `app_name` = `"أذكار"` | `aapt2 dump resources athkar__base.apk` |

**Tooling note.** `rea decode-android-resources` was attempted for both the base APK and
the `.ar` split and **failed closed**: `capability_unavailable / unsupported_provider —
"The apktool launcher was not found on the selected Windows PATH/PATHEXT"`. Resource
strings were therefore read with the Android SDK's own `aapt2`
(`C:\Users\osama\AppData\Local\Android\Sdk\build-tools\36.1.0\aapt2.exe dump resources|strings`).
`rea extract-artifact` also fails on this APK family (`Destination filesystem cannot store
both res/9n.9.png and res/9N.9.png` — case-insensitive filesystem collision), so asset
enumeration was done by reading the ZIP central directory directly.

---

## 2. Declared surface

**Permissions (26)** — `rea inspect-android-package` → `normalized_result.permissions`:
`VIBRATE`, `INTERNET`, `POST_NOTIFICATIONS`, `POST_PROMOTED_NOTIFICATIONS`,
`USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`,
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `ACCESS_NOTIFICATION_POLICY`,
`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`, `FOREGROUND_SERVICE`
(+ `_SPECIAL_USE`, `_MEDIA_PLAYBACK`, `_MEDIA_PROCESSING`, `_DATA_SYNC`),
`com.android.vending.BILLING`, `ACCESS_NETWORK_STATE`,
`com.google.android.c2dm.permission.RECEIVE`,
`com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`,
`ACCESS_ADSERVICES_ATTRIBUTION`, `net.fares.athkar.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
`com.android.vending.CHECK_LICENSE`.

**Exported components** (manifest XML from `normalized_result.manifest.text`):

| Component | Exported | Why it matters |
|---|---|---|
| `net.fares.athkar.MainActivity` | yes (LAUNCHER) | single entry point |
| `net.fares.athkar.icon.Icon*` (13 classes) | yes | 13 standalone "icon launcher" activities — a shipped *icon-pack* feature |
| `net.fares.athkar.feature.settings.WidgetConfigActivity` | yes | widget configuration |
| `net.fares.athkar.feature.mywidget.MyWidgetActivity` | yes | user widget builder |
| `net.fares.athkar.core.widget.*WidgetReceiver` (~25) | yes | home-screen / lock-screen widget providers |
| `net.fares.athkar.core.notifications.AthanPlaybackService` | yes | media playback service |
| `androidx.glance.appwidget.GlanceRemoteViewsService` | yes (`BIND_REMOTEVIEWS`) | Glance widgets |
| `com.google.android.play.core.assetpacks.AssetPackExtractionService` | yes | Play Asset Delivery |
| `androidx.work.impl.background.systemjob.SystemJobService` | yes (`BIND_JOB_SERVICE`) | WorkManager |

**No deep-link schemes are declared** — the manifest contains no `<data android:scheme=…>`
element for `net.fares.athkar`.

**Notably absent vs. a delivery app:** no `com.android.vending.BILLING`-adjacent POS
permissions beyond Play Billing, no `SYSTEM_ALERT_WINDOW`, no `READ/WRITE_EXTERNAL_STORAGE`,
no `ACCESS_BACKGROUND_LOCATION` (background location is *not* requested).

**Notable present:** `USE_EXACT_ALARM` + `SCHEDULE_EXACT_ALARM` +
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` + `ACCESS_NOTIFICATION_POLICY` + `POST_PROMOTED_NOTIFICATIONS`
→ the app fights the OS to fire prayers on time.

---

## 3. Client framework and stack

**Native Kotlin + Jetpack Compose.** No Flutter and no React Native.

Evidence:
- **No** `lib/` directory at all in the APK → no `libflutter.so`, no `libapp.so`, no
  `libreactnativejni.so` (ZIP central-directory listing).
- **No** `assets/flutter_assets/`, **no** `assets/index.android.bundle`.
- Class names are Kotlin file-classes: `net.fares.athkar.feature.main.MainScreenKt`,
  `…MainScreenKt$MainScreen$2$1`, `…feature.quran.QuranReaderScreenKt`, plus Compose
  `ComposableSingletons$…` classes and `androidx.glance` widgets.
- Compose `remember`/`MutableState` usage visible in decompiled signatures, e.g.
  `net.fares.athkar.core.billing.ProStore.getPhase(): androidx.compose.runtime.State<…>`.

**Everything is readable.** Because this is ordinary Kotlin bytecode (R8-minified but not
obfuscated — class and method names survive), ~100% of Athkar's product logic is
inspectable with `rea inspect-android-class` / `rea inspect-android-method`. Contrast with
Shiply (§ SHIPLY.md) and Souq Tulkarm (§ SOUQ-TULKARM.md), where the logic lives in a JS bundle.

**Build markers:** `com.pairip.licensecheck.LicenseActivity` (PairIP license check) and
`com.google.android.play.core.assetpacks.*` (Play Asset Delivery) — the 152 MB APK is
mostly downloadable Quran media, not code.

---

## 4. Product mechanics visible in the shipped artifact

### F-01 — Athkar has no delivery/rides domain at all **[OBSERVATION, high confidence]**

`rea search-android-classes athkar__base.apk <query> --format json --full-output`, filtered to
the `net.fares.athkar.*` namespace:

| Query | `net.fares.athkar.*` hits |
|---|---|
| `Delivery` | 2 — `core.notifications.AlarmDeliveryWindow`, `core.quran.QuranPagesDownloader$fetchFromPlayAssetDelivery$finalState$1$1` (both unrelated) |
| `Order` | 0 |
| `Driver` | 0 |
| `Cart` | 0 |
| `Address` | 0 |
| `Ride` | 0 |
| `Trip` | 0 |
| `Ship` | 0 |
| `Courier` | 0 |
| `Wallet` | 0 |
| `Payment` | 0 |
| `Cash` | 0 |

**Inference (strong):** Athkar is a religious-content app, not a transport or delivery app.
Every `net.fares.athkar.feature.*` package is religious or app-chrome:
`main`, `prayers`, `quran`, `reader`, `today`, `tasks`, `names`, `qibla`, `sick`, `myathkar`,
`mydua`, `mywidget`, `onboarding`, `search`, `random`, `pages`, `settings`, `support`,
`notifications`, `pro`.

**Consequence for Wind:** Athkar must be dropped from the competitor set. It is only
relevant as a *regional craft* reference (§4, F-06…F-09).

### F-02 — Address / location model is **city-level, not street-level** **[OBSERVATION]**

`rea inspect-android-class athkar__base.apk net.fares.athkar.core.prayers.CityDetectorKt`:

```
cityFromCoordinates(double, double) : kotlin.Pair<java.lang.String, java.lang.String>
detectCity(android.content.Context, boolean) : java.lang.String
deviceCountryCode(android.content.Context) : java.lang.String
isCoordinatesOnlyCity(android.content.Context, java.lang.String) : boolean
```

The app resolves a **city name from coordinates** (pair = city + country, inferred from
the `Pair<String,String>` return) and has a `deviceCountryCode` fallback when geolocation
is unavailable. There is **no** free-text street address, no landmark field, no saved-address
list, no reverse-geocode map picker, no pin. `net.fares.athkar.core.prayers.VerifiedCities`
and `net.fares.athkar.core.prayers.LocationFixKt` / `LocationMonitorKt` support it.

**Inference:** Athkar's addressing model is city-granular and therefore useless as a model
for Wind's landmark-address requirement. Do **not** copy it.

### F-03 — Notification channels are **per-prayer, per-sound, versioned** **[OBSERVATION]**

`rea inspect-android-method athkar__base.apk net.fares.athkar.core.notifications.AthanChannels athanChannelId --format json`:

```java
public final String athanChannelId(String prayerKey, String soundKey) {
    return "athan_" + prayerKey + "_" + soundKey + "_v7";
}
```

Sibling members in the same class: `ensureAthanChannel(Context, String, String, String)`,
`ensureIqamaChannel(...)`, `ensurePreChannel(...)`, `deleteChannelSafely(...)`,
`bypassDndEnabled(Context)`, `alarmAttributes(Context)`, `audioUsage(Context)`.

**Observation:** the channel id embeds the *event type* (athan / iqama / pre), the *prayer*,
the *sound choice*, and a **version suffix `_v7`** so a changed channel definition can be
recreated rather than silently reused. **Inference:** Athkar re-creates channels when the
sound set changes, which is how it avoids a stale-channel bug on Android.

**Why Wind cares:** the same "event-type + user-selectable variant + version suffix" channel
naming works for *order-created / driver-assigned / out-for-delivery / delivered /
payment-collected / cash-collected* channels. Wind should ship one channel per notification
class so the customer can silence "driver assigned" without losing "delivered".

### F-04 — Exact-alarm scheduling with pre-alert and silence windows **[OBSERVATION]**

`rea inspect-android-class athkar__base.apk net.fares.athkar.core.notifications.AthanScheduler`
exposes:

```
scheduleAll(Context) ; nextOccurrence(Context, String, PrayerSlot) ; occurrencesForKind(...)
setExact(Context, String, PrayerSlot, long, int, long, long)
preMinutes(...) ; iqamaMinutes(...) ; preSoundKey(...) ; iqamaSoundKey(...) ; soundKey(...)
alertEnabled(...) ; iqamaEnabled(...)
setSilenceOnIqamaEnabled(Context, boolean) ; silenceStartAfterAthanMin(...) ; cancelDnd(...)
pendingIntent(Context, String, PrayerSlot, int, long, long, long)
```

**Observation:** the scheduler computes the *next occurrence* of a recurring event, derives
**pre-event** and **post-event (iqama)** sub-alarms from one anchor, and can arm a **silence
window** that mutes the device after the event and reverts it after N minutes
(`silenceRevertMinutes`).

**Why Wind cares:** the "one anchor event → derived pre-alert alarm → derived
mute-window alarm → guaranteed revert" shape is directly reusable for *delivery ETA
reminders* and *cash-collection windows* on a low-end device where `AlarmManager` exact
alarms plus `ACCESS_NOTIFICATION_POLICY` are the only reliable timers. Wind's 2G/3G
constraint makes this a real concern.

### F-05 — Play Billing with explicit subscription recovery **[OBSERVATION]**

`rea inspect-android-class athkar__base.apk net.fares.athkar.core.billing.ProStore` exposes
`purchase(Activity, ProStore$Plan)`, `purchasesUpdated(...)`, `queryProducts()`,
`queryOwnership(boolean, ...)`, `restore()`, `retry()`, `refresh()`, `getRecovery()`,
`getDiagnostics$Athkar_app_release()`, `getMessage()/getRestoreMessage()` (Compose `State`
wrappers), plus a dedicated `net.fares.athkar.core.billing.SubscriptionAcknowledgementWorker`
and `net.fares.athkar.core.billing.SubscriptionRecovery`.
Manifest meta-data: `com.google.android.play.billingclient.version = 8.0.0`.

**Observation:** Athkar treats "user paid but the app lost the receipt" as a first-class
state with a **recovery worker** and a **diagnostics object**, and surfaces a
human-readable message to the user. **Inference:** a cash-ledger app like Wind needs the
same discipline for a payment that was collected but not acknowledged.

### F-06 — Arabic-first, RTL-first defaults **[OBSERVATION]**

- Default (unqualified) `string/app_name` = `"أذكار"` — the **default** resource locale is
  Arabic, not English (`aapt2 dump resources athkar__base.apk`).
- Manifest: `android:supportsRtl="true"` on `<application>`; `android:label="@string/app_label"`
  (= `"Athkar"`, Latin) is used for the *launcher* activities while `app_name` (Arabic) is
  used elsewhere — a deliberate bilingual launcher.
- `res/values` strings are Arabic: e.g. `string/app_launch_action` = `"تشغيل التطبيق في هواتف هونر وهواوي"`
  ("run the app on Honor and Huawei phones"), `string/app_status_alarms` = `"السماح بالمنبهات الدقيقة"`.
- The `.ar` split adds 469 Arabic strings (`aapt2 dump strings athkar__split_config.ar.apk`).

**Why Wind cares:** Athkar sets the Arabic string as the *default* resource and lets the
`ar` split override. For an Arabic-first app with full English, the mirror of this is
**English as default resource + `values-ar` override**, which is what Wind's Expo/Android
pipeline should do so a missing translation degrades to English rather than to Arabic keys.

### F-07 — OEM-specific battery guidance is a first-class screen **[OBSERVATION]**

`aapt2 dump resources athkar__base.apk` → `string/app_launch_action` =
`"تشغيل التطبيق في هواتف هونر وهواوي"` ("run the app on Honor and Huawei phones").
Class `net.fares.athkar.core.notifications.OemLaunchSettings` and
`net.fares.athkar.feature.settings.AppStatusScreenKt` / `AppStatusRow` exist.
Manifest requests `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.

**Inference (moderate):** Athkar ships per-OEM autostart instructions because Huawei/Honor
killed background alarm reliability — a West Bank/region-relevant class of problem for any
app that must fire notifications on cheap Android devices.

### F-08 — Offline-first media with resumable download **[OBSERVATION]**

Assets: `assets/Quran.sqlite` (2,404,352 B), `assets/TimeMoments.json` (38,544 B),
`assets/HeaderAudioSchedule.json` (3,496 B), and ~50 files in `assets/audio/*.mp3|m4a`.
Classes: `net.fares.athkar.core.quran.QuranPagesDownloader` with
`downloadAll$job$1`, `checkForPackageUpdate$job$1`,
`fetchFromPlayAssetDelivery$finalState$1$1`;
`net.fares.athkar.core.quran.audio.SurahAudioRepository` with `download$2$1`, `resolve$3$1`,
`Sam$com_google_android_gms_tasks_OnSuccessListener$0` (a suspend wrapper over
`Tasks.await`).

**Inference:** large downloadable content is fetched lazily and cached locally, with a
separate "check for package update" job. This is the pattern for shipping **offline
address/zone data** in Wind on a 2G/3G budget.

### F-09 — Google Drive cloud sync with retry, for user-authored content **[OBSERVATION]**

Classes: `net.fares.athkar.core.sync.DriveApi`, `MyAthkarCloud$sync$4`,
`SyncStore$performSync$2$fileId$1` / `$merged$1` / `$remote$1$body$1` / `$withRetry$1`,
`SyncWorker`, `SyncCounter`, `SyncPayload`, `PersonalCloudFiles`.
Manifest carries `com.google.android.gms.auth.api.signin.internal.SignInHubActivity` and
`RevocationBoundService` → Google Sign-In.

**Inference:** user-created data (personal adhkar list) is synced to Google Drive rather
than a first-party backend — a zero-cost sync strategy that keeps a small operator's
server bill down. Wind could apply the same idea to a customer address book.

### F-10 — Analytics / crash / push SDKs actually embedded **[OBSERVATION]**

From manifest `meta-data` Firebase component registrars:
`firebase.messaging` (MessagingKtxRegistrar, MessagingRegistrar),
`firebase.crashlytics` (CrashlyticsKtxRegistrar, CrashlyticsRegistrar),
`firebase.analytics.connector.internal.AnalyticsConnectorRegistrar`,
`firebase.sessions.FirebaseSessionsRegistrar`,
`firebase.installations` (InstallationsKtxRegistrar, InstallationsRegistrar),
`firebase.common.FirebaseCommonKtxRegistrar`,
`firebase.datatransport.TransportRegistrar`.
Service `com.google.android.gms.measurement.AppMeasurementService` present.

**Absent (observed):** no Adjust, no AppsFlyer, no Amplitude, no Branch, no Mixpanel,
no Segment, no Sentry, no AppCenter, no OneSignal. (Searched by class-name query and by
manifest meta-data; the base APK's `*.properties` marker files are only
`firebase-analytics`, `firebase-encoders*`, `firebase-iid-interop`,
`firebase-measurement*`, `play-services-*`.)

**Push:** Firebase Cloud Messaging only (`com.google.android.c2dm.permission.RECEIVE`,
`com.google.firebase.messaging.FirebaseMessagingService`).

### F-11 — Sharing is a first-class export pipeline, not a text share **[OBSERVATION]**

`net.fares.athkar.core.share.*`: `ShareKit`, `ShareActionsKt`, `ShareSheetKt`,
`ShareVideo$encodeVideo$2$1`, `ShareMp4`, `ShareWallpapers`, `SharePalette`,
`SharePreviewCanvas`, `ShareExportWorker$doWork$2$1$reporting$1`, `ShareStorage`,
`ShareResultActivity`, `net.fares.athkar.feature.prayers.PrayerCalendarShareMenuKt`,
`net.fares.athkar.feature.random.RandomShareMenuKt`, `net.fares.athkar.core.quran.QuranDailyShare`.

**Inference:** export → render → share is a pipeline with a worker and a dedicated result
activity, i.e. sharing is a product surface, not an afterthought. Wind's "share a tracking
link" feature should be built to the same standard (rendered card, not a bare URL).

### F-12 — Remote config drives app appearance and feature rules **[OBSERVATION]**

`net.fares.athkar.core.remote.RemoteConfig`, `RemoteFeatureRules`, `RemoteWeather`;
`net.fares.athkar.core.appearance.AppearanceRepository` (`refresh$1$request$1`,
`resolve$result$1`, `resolveForLaunch$entry$1`), `CampaignLaunchHostKt`, `RemoteSplashLaunch`,
`VectorLottieValidator`, `SplashSession`.

**Inference:** remote feature-flag rules plus a remotely-controlled splash/appearance
campaign. Useful for Wind: ship order-type flags (Buy / Pay / Return) and promo
campaigns server-side without an app release.

---

## 5. Evidence table

| # | Finding | Command | Tool output anchor | Class / method / resource path |
|---|---|---|---|---|
| F-01 | No delivery domain | `rea search-android-classes athkar__base.apk <q> --format json` | `normalized_result.matches` empty for `Order`/`Driver`/`Cart`/`Address`/`Ride`/`Trip`/`Ship`/`Courier`/`Wallet`/`Payment`/`Cash` | `net.fares.athkar.feature.*` (all religious/chrome) |
| F-02 | City-only addressing | `rea inspect-android-class athkar__base.apk net.fares.athkar.core.prayers.CityDetectorKt --format json` | `normalized_result.methods[].reported_signature` | `net.fares.athkar.core.prayers.CityDetectorKt.cityFromCoordinates/detectCity/deviceCountryCode` |
| F-03 | Versioned per-event channels | `rea inspect-android-method athkar__base.apk net.fares.athkar.core.notifications.AthanChannels athanChannelId --format json` | `normalized_result.source.text` | `net.fares.athkar.core.notifications.AthanChannels.athanChannelId` → `"athan_"+prayerKey+"_"+soundKey+"_v7"` |
| F-04 | Exact-alarm scheduler | `rea inspect-android-class athkar__base.apk net.fares.athkar.core.notifications.AthanScheduler --format json` | `normalized_result.methods` list | `…AthanScheduler.setExact/nextOccurrence/preMinutes/setSilenceOnIqamaEnabled` |
| F-05 | Billing + recovery | `rea inspect-android-class athkar__base.apk net.fares.athkar.core.billing.ProStore --format json` | `normalized_result.methods` list | `…billing.ProStore.restore/queryOwnership/getRecovery`; `…billing.SubscriptionAcknowledgementWorker` |
| F-06 | Arabic default locale, RTL | `aapt2 dump resources athkar__base.apk` | `resource 0x7f100023 string/app_name → "أذكار"`; `resource 0x7f100020 string/app_label → "Athkar"` | `res/values/strings.xml` |
| F-07 | OEM battery guidance | `aapt2 dump resources athkar__base.apk` | `string/app_launch_action → "تشغيل التطبيق في هواتف هونر وهواوي"` | `res/values/strings.xml`; `net.fares.athkar.core.notifications.OemLaunchSettings` |
| F-08 | Offline media + resumable download | `rea search-android-classes athkar__base.apk "net.fares.athkar.core.quran" --format json` | `normalized_result.matches` | `…core.quran.QuranPagesDownloader`, `…core.quran.audio.SurahAudioRepository`; `assets/Quran.sqlite` |
| F-09 | Drive sync | `rea search-android-classes athkar__base.apk "net.fares.athkar.core.sync" --format json` | `normalized_result.matches` | `…core.sync.DriveApi`, `SyncStore$performSync$2$withRetry$1`, `SyncWorker` |
| F-10 | Firebase-only analytics stack | `rea inspect-android-package athkar__base.apk --format json` | `normalized_result.manifest.text` → `meta-data` Firebase registrars | `com.google.firebase.messaging.*`, `…crashlytics.*`, `…measurement.AppMeasurementService` |
| F-11 | Share export pipeline | `rea search-android-classes athkar__base.apk "net.fares.athkar.core.share" --format json` | `normalized_result.matches` | `…core.share.ShareKit/ShareVideo/ShareExportWorker/ShareResultActivity` |
| F-12 | Remote config / feature rules | `rea search-android-classes athkar__base.apk "net.fares.athkar.core.remote" --format json` | `normalized_result.matches` | `…core.remote.RemoteConfig/RemoteFeatureRules`; `…core.appearance.AppearanceRepository` |

---

## 6. Unknowns and limits (static analysis cannot establish)

1. **No runtime behaviour.** Nothing here proves any method actually executes on a device.
   The jadx provider states this explicitly in every evidence record's `limitations`.
2. **Server behaviour is unknown.** `net.fares.athkar.core.prayers.PrayersApi`,
   `PrayersSecret`, `core.remote.RemoteConfig` and `core.appearance.AppearanceHttp` show
   Athkar calls remote services, but the endpoints, payloads and auth are **not** in the APK.
   `PrayersSecret` being a compiled class means its value is not statically readable.
3. **Prayer-time accuracy / city database contents are unknown.** `VerifiedCities` exists but
   the city list itself is likely bundled or fetched; not enumerated here.
4. **Icon-pack activities are not characterised.** 13 exported `net.fares.athkar.icon.Icon*`
   activities exist; their behaviour was not analysed.
5. **The `.ar` split overlaps the base.** The base APK's default locale is already Arabic,
   so `athkar__split_config.ar.apk` appears to be the Play "Arabic language pack" for a
   language that the app already defaults to — the exact split semantics were not verified.
6. **No signer was exposed.** `signature_verification: "not_performed"`; the Play stamp
   (`com.android.stamp.type = STAMP_TYPE_DISTRIBUTION_APK`, source `play.google.com/store`)
   indicates Play-distribution but is not a signature verification.
7. **Code is R8-minified but not obfuscated.** Names are trustworthy as *labels*; the
   implementation bodies are a decompiler's reconstruction, not the original Kotlin.
8. **No APK was installed and no device was touched.** Per the study brief.

---

## 7. What this means for Wind

**Adopt (pattern only, no code or assets):**
- Per-event, versioned notification channel ids — `athan_<event>_<variant>_v7` shape
  (F-03). Map to Wind: `parcel_<event>_v1`.
- One-anchor → derived pre-alert alarm + derived mute-window alarm + guaranteed revert
  (F-04). Map to Wind: "driver arriving in 10 min" + "cash pickup window closes at 18:00".
- Subscription/ack **recovery** as an explicit state, not an edge case (F-05). Wind's
  analogue is a cash collection that was taken but not acknowledged — Wind must have a
  `CashCollection.PendingAcknowledgement` state and a retry worker.
- Remote feature rules (F-12) so order-type and promo behaviour can change without a
  Play release.

**Skip:**
- Athkar's city-granular addressing (F-02) — it does not satisfy Wind's landmark-address
  requirement and should not be copied.
- Any delivery/mechanics assumption sourced from Athkar (F-01). It has none.
- The 152 MB bundled-media approach (F-08) as a *bundling* choice — Wind should use
  on-demand download with a local cache, but the Quran media itself is irrelevant.

**Defer with an evidence gate:**
- **Google Drive as the sync backend** (F-09). Attractive for cost, but it depends on
  Google account availability and Play Services on the target device. Gate: confirm on the
  target handset that Google Sign-In is present and usable, and that Wind's account model
  can tolerate a Drive-linked identity. If not, ship a first-party sync endpoint first.
- **Per-OEM autostart education screens** (F-07). Gate: only if Wind's telemetry shows
  a material share of deliveries missed because the OS killed the app. Wind is a delivery
  app, so this evidence will be much stronger from Wind's own data than from Athkar.
