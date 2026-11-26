# SALATI / SALATUK (صلاتي) — static REA reference (Palestinian regional Android app)

**Artifact:** `com.masarat.salati` v3.7.66 (versionCode 431)
**Study date:** 2026-11-13 · **Method:** static only (no execution, no device)
**Engine:** REA 6.7.0 / jadx-headless-mcp 0.7.1 · **Artifact SHA-256:** `ef74d8bcd78a0cfe0894ad206f61a512279213c976dbc7a5142bb497ad0eaab4`

> **HEADLINE CORRECTION TO THE STUDY BRIEF.** The brief describes Salati as
> "food delivery/grocery". That is **not** what this artifact is. `com.masarat.salati`
> is **Salatuk (صلاتوك)** — a **prayer-times / adhān (أذان) app**: prayer schedule, qibla,
> adhān alarms with full offline audio, prayer-time adjustment, and six home-screen /
> lock-screen widgets. It ships **no food, no grocery, no delivery, no cart, no order** —
> confirmed by class-name search across all 3,525 classes (§4, F-01).
>
> It is, however, a genuinely useful **regional craft reference**: it is a
> **long-lived (v3.7.66), RTL-first, Arabic-and-English, offline-first Palestinian app**
> that solves "fire a scheduled event reliably on a cheap Android phone, offline, after
> boot, across Huawei/OPPO devices" — the same class of problem Wind faces for delivery
> deadlines and cash-collection windows.

---

## 1. Artifact identity

| Field | Value | Source command |
|---|---|---|
| Package | `com.masarat.salati` | `rea inspect-android-package salati__base.apk --format json` → `normalized_result.package_name` |
| versionName / versionCode | `3.7.66` / `431` | same → `version_name`, `version_code` |
| Base APK size | 34,434,788 bytes (32.8 MiB) | `Get-ChildItem` on the APK set |
| Base APK SHA-256 | `ef74d8bcd78a0cfe0894ad206f61a512279213c976dbc7a5142bb497ad0eaab4` | `rea inspect-android-package` → `subject.digest.sha256` (matches `Get-FileHash -Algorithm SHA256`) |
| DEX files | **2** (`classes.dex` 8,236,384 B; `classes2.dex` 579,000 B) | ZIP central-directory listing |
| Class count | **3,525** (`raw_class_count` 3,525) | `rea inspect-android-package` → `normalized_result.class_count` |
| Resource count | **1,293** | same → `normalized_result.resource_count` |
| minSdk / targetSdk | **21** / **35** | same → `min_sdk`, `target_sdk` |
| compileSdk | 35 (manifest `platformBuildVersionName`) | manifest text |
| Signer | **not exposed** — `signature_verification: "not_performed"` | same |
| REA evidence id | `ev_23924cecc53db023bf32838bc3fe9e40d7a4dbe52b97131abac4f87ec1945053` | same |
| App name / label | `string/app_name` = `"Salatuk"` | `aapt2 dump resources salati__base.apk` |
| Own permission | `com.masaratapp.salati.SALATUK_PERMISSION` (signature-level) | manifest |
| Package feature | `com.android.vending.splits.required = true`, `com.android.stamp.source = https://play.google.com/store` | manifest `meta-data` |

**Notable:** Salati is the **oldest and widest-reach** artifact in the set —
`minSdk 21` (Android 5.0) and `versionCode 431` at `versionName 3.7.66`. It is also the
only one of the four that ships **no `.ar` language split** — the Arabic and English
resources are both inside the base APK (`aapt2 dump resources salati__base.apk` shows
`(en)` and `(ar)` locale variants of the same resources in the same table).

**Tooling note.** `rea decode-android-resources` failed closed here too
(`capability_unavailable / unsupported_provider` — "apktool launcher was not found on the
selected Windows PATH/PATHEXT"); `aapt2` from `build-tools\36.1.0` was used instead.
`rea extract-artifact` is unusable on case-insensitive filesystems for this APK family.

---

## 2. Declared surface

**Permissions (30)** — `rea inspect-android-package` → `normalized_result.permissions`
plus the manifest `uses-permission` list:
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `FOREGROUND_SERVICE_LOCATION`,
`FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
**`ACCESS_BACKGROUND_LOCATION`**, `SCHEDULE_EXACT_ALARM`, `HIGH_SAMPLING_RATE_SENSORS`,
`WAKE_LOCK`, `INTERNET`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED`, `ACCESS_NETWORK_STATE`,
`CHANGE_NETWORK_STATE`, `DISABLE_KEYGUARD`, `MODIFY_AUDIO_SETTINGS`,
**`WRITE_CALENDAR`**, **`READ_CALENDAR`**, `BLUETOOTH`, `ACCESS_NOTIFICATION_POLICY`,
**`USE_FULL_SCREEN_INTENT`**, `RECORD_AUDIO`, `READ_PHONE_STATE`,
`com.android.alarm.permission.SET_ALARM`,
**`com.huawei.permission.external_app_settings.USE_COMPONENT`**,
**`oppo.permission.OPPO_COMPONENT_SAFE`**, `POST_NOTIFICATIONS`,
`com.masaratapp.salati.SALATUK_PERMISSION`,
`com.masarat.salati.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.

**Observation:** the permission set tells the whole story — this is an app that must **make
noise at a precise time on the user's phone**, therefore: exact alarms, background
location (to stay accurate while travelling), Do-Not-Disturb access, full-screen intents,
keyguard disable, and **explicit Huawei and OPPO OEM permissions**.

**Exported components** (manifest):

| Component | Exported | Notes |
|---|---|---|
| `com.masarat.salati.ui.activities.MainActivity` | yes | LAUNCHER |
| `com.masarat.salati.receivers.BootCompletedReceiver` | yes | `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `USER_UNLOCKED`, `USER_PRESENT` |
| `com.masarat.salati.receivers.UserUnlockedReceiver` | yes | `USER_UNLOCKED`, `USER_PRESENT` |
| `com.masarat.salati.widgets.SalatukWidget{V2,V3,Large,Medium,All,LockScreenTransparent}` | **no** | guarded by `com.masaratapp.salati.SALATUK_PERMISSION` |
| `com.masarat.salati.receivers.SalatiReceiver` | no | `BOOT_COMPLETED`, `CONNECTIVITY_CHANGE`, `TIME_SET`, `TIMEZONE_CHANGED` |
| `androidx.work.impl.background.systemjob.SystemJobService` | yes (`BIND_JOB_SERVICE`) | WorkManager |
| `androidx.work.impl.diagnostics.DiagnosticsReceiver` | yes (`DUMP`) | WorkManager |

**Deep links:** **none declared** — no `<data android:scheme=…>` in the manifest.

**Other manifest facts:**
- `android:supportsRtl="true"`, `android:networkSecurityConfig="@xml/network_security_config"`
  (a network security config is present — cleartext policy is declared, not defaulted).
- `com.google.android.geo.API_KEY` present (`meta-data`) → **Google Maps is used**, for
  the qibla compass and location.
- `<queries>`: **empty** — Salati queries no other package.
- `androidx.work.WorkManagerInitializer`, `androidx.emoji2`, `androidx.lifecycle.ProcessLifecycleInitializer`,
  `androidx.profileinstaller` via `androidx.startup`.
- `com.android.play.core.common.PlayCoreDialogWrapperActivity` → **Play In-App Update** is wired.
- `com.google.android.gms.common.api.GoogleApiActivity` present.

**Notably absent (observed):** no `com.android.vending.BILLING`, no
`com.google.android.c2dm.permission.RECEIVE`, no Firebase, no ad-SDK permissions
(`AD_ID` / `ACCESS_ADSERVICES_*`), no `SYSTEM_ALERT_WINDOW`, no
`FOREGROUND_SERVICE_MEDIA_PROCESSING`. **Salati has no in-app billing and no push
notifications at all.**

---

## 3. Client framework and stack

**Native Java (not Kotlin, not Compose) on the classic View system, with an obfuscated
support layer.**

Evidence:
- **No `lib/` directory** → no `libflutter.so`, no `libapp.so`, no `libreactnativejni.so`.
- **No** `assets/flutter_assets/`, **no** `assets/index.android.bundle`.
- Class naming is classic Java Android: `com.masarat.salati.ui.activities.*`,
  `com.masarat.salati.ui.fragments.*`, `com.masarat.salati.ui.views.*`,
  `com.masarat.salati.preferences.*`, `com.masarat.salati.services.*`,
  `com.masarat.salati.receivers.*`, `com.masarat.salati.widgets.*`,
  `com.masarat.salati.WorkManager.*`.
- `com.masarat.salati.ui.views.CalendarView.MaterialCalendarView` wraps a third-party
  calendar widget library (MaterialCalendarView); `RtlViewPager.RtlViewPager` is a
  custom RTL pager; `HijriCalendarView.MaterialHijriCalendarView` is a custom Hijri calendar.
- **ProGuard obfuscation is present but only in the library/vendor layer.** The app's own
  classes keep their names; vendor classes are mangled to single letters
  (`com.masarat.salati.ui.views.CalendarView.a` … `.x`, `com.masarat.salati.managers.a`…`.e`,
  `com.masarat.salati.ui.activities.b0`, `.d1`, `.j0`, `.x1`, `.y1`). Those single-letter
  classes are the **obfuscated** ones and are effectively unreadable.
- View-system UI (no Compose classes, no `ComposableSingletons`).

**Readability:** the app's own product logic is fully readable via
`rea inspect-android-class` / `rea inspect-android-method`; the obfuscated third-party
layers are not. Shipped assets are also readable (§4, F-06).

---

## 4. Product mechanics visible in the shipped artifact

### F-01 — Salati has no food, grocery, or delivery domain **[OBSERVATION, high confidence]**

`rea search-android-classes salati__base.apk <query> --format json --full-output`, filtered
to `com.masarat.salati.*`:

| Query | `com.masarat.salati.*` hits |
|---|---|
| `Delivery` | 0 |
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
| `Food` | 0 |
| `Restaurant` | 0 |
| `Grocery` | 0 |

**Inference (very strong):** Salati = prayer times + adhān + qibla + widgets + prayer-time
adjustment. Every `com.masarat.salati.*` package is religious or app-chrome:
`preferences`, `receivers`, `services`, `ui.activities`, `ui.fragments`, `ui.views`,
`util`, `util.ummalqura`, `widgets`, `WorkManager`, `managers`.

**Consequence for Wind:** Salati must be dropped from the delivery-competitor set. It is
retained here only as a **regional Android craft reference** (F-02…F-07).

### F-02 — Continuous location tracking to keep prayer times accurate **[OBSERVATION]**

`rea inspect-android-class salati__base.apk com.masarat.salati.services.SalatiService --format json`
→ `normalized_result.methods` includes:
```
onLocationChanged(android.location.Location) : void
onProviderEnabled(java.lang.String) : void
onProviderDisabled(java.lang.String) : void
onStatusChanged(java.lang.String, int, android.os.Bundle) : void
onStartCommand(android.content.Intent, int, int) : int
c(SalatiService, android.location.Location, boolean) : void
m(android.location.Location, boolean) : void
f(java.util.List) : android.location.Location
```
So `SalatiService` is a **bound `LocationListener` service** with provider
enable/disable handling.

Related classes: `com.masarat.salati.services.LocationService`,
`com.masarat.salati.WorkManager.LocationWorker`, `com.masarat.salati.preferences.DSTPreferences`
(daylight-saving), `com.masarat.salati.preferences.AdjustPrayerMinPreferences`,
`com.masarat.salati.preferences.PrayertimesPreferences`.

**Observation:** Salati requests `ACCESS_BACKGROUND_LOCATION` and runs a **persistent
location service** so prayer times follow the user as they travel. **Inference:** it is a
location-driven app, but its "address" concept is a **city / world-city list**, not a
street address.

### F-03 — City model: a **world-cities list**, not a user address book **[OBSERVATION]**

`rea inspect-android-class salati__base.apk com.masarat.salati.managers.WorldCitiesManager --format json`:
```
a() : WorldCitiesManager        (singleton accessor)
b() : java.util.ArrayList       (the city list)
c(android.content.Context) : void
d(android.content.Context, java.util.ArrayList) : void
e(android.content.Context, c5.i) : void
```
UI: `com.masarat.salati.ui.activities.AddWorldCityActivity`,
`com.masarat.salati.ui.fragments.worldcities.WorldCitiesFragment`,
`com.masarat.salati.ui.views.WorldCityView`.

**Observation:** the only "address" concept in Salati is a **selection from a curated
world-cities list**, with an add-screen and a management fragment. **There is no
free-text address, no landmark, no saved personal address, no map pin.**

### F-04 — Six widgets, all guarded by a signature permission **[OBSERVATION]**

`com.masarat.salati.widgets.SalatukWidgetAll`, `SalatukWidgetLarge`, `SalatukWidgetMedium`,
`SalatukWidgetV2`, `SalatukWidgetV3`, `SalatukWidgetLockScreenTransparent` — each is a
`BroadcastReceiver` for `APPWIDGET_UPDATE`, **not exported**, and protected by
`com.masaratapp.salati.SALATUK_PERMISSION`. Their provider XMLs are declared as
`meta-data android.appwidget.provider`:
`@xml/widget_provider`, `@xml/widget_v2_provider`, `@xml/widget_v3_provider`,
`@xml/widget_large_provider`, `@xml/widget_medium_provider`,
`@xml/widget_lock_screen_transparent_provider`.

**Observation:** Salati ships **six widget variants including a lock-screen widget**, and
locks them down with a signature-level permission so only Salatuk can drive them.
**Why Wind cares:** a **lock-screen widget** is a low-cost way to put "your parcel is out
for delivery / collect cash by 18:00" in front of the user without a notification tap —
and on 2G, a widget is cheaper than push.

### F-05 — Exact-alarm scheduling with **re-arm after boot, time change, and timezone change** **[OBSERVATION]**

- `com.masarat.salati.receivers.BootCompletedReceiver` — exported, listens for
  `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `USER_UNLOCKED`, `USER_PRESENT`.
- `com.masarat.salati.receivers.UserUnlockedReceiver` — exported, `USER_UNLOCKED`, `USER_PRESENT`.
- `com.masarat.salati.receivers.SalatiReceiver` — `BOOT_COMPLETED`, `CONNECTIVITY_CHANGE`,
  `TIME_SET`, `TIMEZONE_CHANGED`.
- `com.masarat.salati.receivers.UpgradeReceiver` — `PACKAGE_REPLACED`, `BOOT_COMPLETED`.
- `com.masarat.salati.receivers.TravelModeReceiver` — `MEDIA_BUTTON`, Bluetooth ACL
  connect/disconnect, `BOOT_COMPLETED`.
- `com.masarat.salati.receivers.{AdhanReceiver,ContinuousNotificationReceiver,SilentReceiver,CancelAdhanReceiver}`.
- `com.masarat.salati.receivers.NotificationDismissedReceiver` — `TIME_TICK`.
- `com.masarat.salati.WorkManager.{LocationWorker,OpenLinkWorker,PersistentNotificationWorker,PlayAdhanWorker,PlaySilentWorker,PriereWorker,SalatiRefreshWorker,SalatiWorker}`.
- Permissions `SCHEDULE_EXACT_ALARM`, `com.android.alarm.permission.SET_ALARM`,
  `ACCESS_NOTIFICATION_POLICY`, `DISABLE_KEYGUARD`, `USE_FULL_SCREEN_INTENT`.
- Classes `com.masarat.salati.services.{AdhanService,SilentService,PersistentNotificationService,PriereService,OpenLinkService,SalatiRefreshService}`.

**Observation:** every plausible event that invalidates a scheduled alarm has a receiver:
boot, user unlock, time set, timezone change, app upgrade, Bluetooth connect, and the
`TIME_TICK` minute tick. **Inference (strong):** Salati's reliability comes from
**re-arming from many system events plus a WorkManager fallback**, not from a single
scheduling API. This is the cheapest, most proven way to make "your delivery window closes
at 18:00" survive a phone reboot in the West Bank.

### F-06 — **Fully offline adhān audio is shipped in the APK** **[OBSERVATION]**

Asset inventory (ZIP central directory, `assets/`):
```
assets/adhans/standard/01/01-debut.ogg, 01-fajr.ogg, 01-milieu.ogg, 01-fin.ogg, ...
assets/adhans/maghrebi/01/... 02/...
assets/adhans/haramayn/01/... 02/...
assets/adhans/reminders/02_default_shahada.m4a ... 21_bird_long_3.ogg
assets/adhans/reminders/iqama_haram_full.ogg, iqama_haram_short.ogg,
                 iqama_nabawi_short.ogg, iqama_nabwai_full.ogg
assets/Cairo_Regular.ttf (170,560 B), assets/Roboto_Regular.ttf (126,072 B)
```
Three **madhhab**-specific adhān sets (standard, maghrebi, haramayn) plus reminder tones,
plus **Arabic and Latin fonts bundled**.

**Observation:** the app plays prayer alerts **offline, from bundled audio**, with a
per-madhhab choice and a separate "iqama" variant. **Inference:** it degrades to
"no network" with zero loss of core function.

**Why Wind cares:** the transferable pattern is **bundling a tiny, complete, offline
fallback** — e.g. Wind shipping the **zone/fee table and the delivery-window calendar as
bundled JSON** so a driver on a dead 2G SIM can still see today's jobs and the fee table.
Souq Tulkarm ships this server-side only; Salati ships it in the APK.

### F-07 — UI vocabulary is RTL-native, not mirrored **[OBSERVATION]**

- `com.masarat.salati.ui.views.RtlViewPager.RtlViewPager` — a hand-written RTL pager.
- `com.masarat.salati.ui.views.CheckedTextViewAR`, `PreferenceCheckedTextViewAR`,
  `RadioButtonAR`, `TextViewAR` — custom Arabic-aware text widgets.
- `com.masarat.salati.util.views.CheckedTextViewAR`, `CustomEditTextPreference`.
- `com.masarat.salati.ui.views.SalatukAnalogClock`, `SalatukTextView`, `TypeWriterTxtView`,
  `SwipeButtonView`.
- `com.masarat.salati.util.ummalqura.{a,b,c}` — the **Umm al-Qura** Hijri calendar
  algorithm, obfuscated.
- `com.masarat.salati.ui.views.CalendarView.MaterialCalendarView` +
  `HijriCalendarView.MaterialHijriCalendarView` — Hijri calendar UI.
- `android:supportsRtl="true"`, and **both `en` and `ar` resource locales in the base APK**.

**Observation:** Salati is a **bilingual Arabic/English** app with an RTL-first widget set
and a Hijri calendar. `TextViewAR` / `CheckedTextViewAR` naming implies the Arabic-aware
variants are the *default* class, with English variants separate.

### F-08 — No analytics, no crash reporting, no push, no ads **[OBSERVATION]**

Evidence from the manifest `meta-data` block and the APK marker files:
- **Present:** `com.google.android.gms.version`, `com.google.android.geo.API_KEY`,
  `androidx.work.WorkManagerInitializer`, `androidx.emoji2.text.EmojiCompatInitializer`,
  `androidx.lifecycle.ProcessLifecycleInitializer`, `androidx.profileinstaller.ProfileInstallerInitializer`.
- **Absent:** no Firebase component registrars, no `firebase-*.properties` marker files,
  no Sentry / Crashlytics / AppCenter / Adjust / AppsFlyer / Meta / Google Ads classes,
  no `com.google.android.c2dm.permission.RECEIVE`, no `com.android.vending.BILLING`.
- **Notification path is local only:** `AdhanService`, `SilentService`,
  `PersistentNotificationService`, `NotificationPushActivity` (a local "push" = the app's
  own persistent notification), `NotificationDismissedReceiver`.
- **Analytics by hand:** `com.masarat.salati.preferences.AndroidAppsPreferences`,
  `MoreAppsPreferences` — cross-promotion of other apps instead of an ad SDK.

**Observation:** a 431-version-code Palestinian app with **no tracking SDK at all**.
**Inference (moderate):** Salati's business model does not depend on behavioural data.

### F-09 — OEM-specific permissions and a Play Core update path **[OBSERVATION]**

- `com.huawei.permission.external_app_settings.USE_COMPONENT` and
  `oppo.permission.OPPO_COMPONENT_SAFE` are requested in the manifest.
- `com.google.android.play.core.common.PlayCoreDialogWrapperActivity` → **Play In-App Update**.
- `com.masarat.salati.receivers.UpgradeReceiver` listens for `PACKAGE_REPLACED`.
- `com.masarat.salati.ui.activities.ImportantNoteActivity` (a "read this first" screen).

**Observation:** Salati explicitly accommodates **Huawei and OPPO** devices (both dominant
in Palestinian/Android markets) and ships a self-update prompt. **Inference:** Salatuk's
release process is Play-based with an in-app nudge, and it has hit OEM-specific background
limits before.

### F-10 — Privacy-adjacent permissions that a delivery app must think twice about **[OBSERVATION]**

`WRITE_CALENDAR`, `READ_CALENDAR`, `READ_PHONE_STATE`, `RECORD_AUDIO`, `BLUETOOTH`,
`DISABLE_KEYGUARD`, `CHANGE_NETWORK_STATE`.

**Observation:** Salati writes to the user's calendar (prayer-time events — a legitimate
use) and reads phone state. **For Wind:** `WRITE_CALENDAR` is a *transferable* idea —
deliveries can be added to the user's calendar, which is a genuinely useful feature on a
phone where the user does not want to keep the app open. But `READ_PHONE_STATE` and
`RECORD_AUDIO` should not be copied without a reason.

---

## 5. Evidence table

| # | Finding | Command | Tool output anchor | Class / method / resource path |
|---|---|---|---|---|
| F-01 | No delivery domain | `rea search-android-classes salati__base.apk <q> --format json` | `normalized_result.matches` empty for `Order`/`Driver`/`Cart`/`Address`/`Food`/`Restaurant`/`Grocery`/`Payment`/`Cash` | `com.masarat.salati.{preferences,receivers,services,ui,util,widgets,WorkManager,managers}` |
| F-02 | Persistent location | `rea inspect-android-class salati__base.apk com.masarat.salati.services.SalatiService --format json` | `normalized_result.methods` | `com.masarat.salati.services.SalatiService.onLocationChanged/onProviderEnabled/onProviderDisabled/onStatusChanged` |
| F-03 | World-cities model | `rea inspect-android-class salati__base.apk com.masarat.salati.managers.WorldCitiesManager --format json` | `normalized_result.methods` | `…managers.WorldCitiesManager.b(): java.util.ArrayList`; `…ui.activities.AddWorldCityActivity` |
| F-04 | Six locked widgets | `rea inspect-android-package salati__base.apk --format json` | `normalized_result.manifest.text` (receiver entries + `meta-data android.appwidget.provider`) | `com.masarat.salati.widgets.SalatukWidget{All,Large,Medium,V2,V3,LockScreenTransparent}` guarded by `com.masaratapp.salati.SALATUK_PERMISSION` |
| F-05 | Alarm re-arm graph | same manifest | receivers with action lists | `…receivers.BootCompletedReceiver`, `UserUnlockedReceiver`, `SalatiReceiver` (BOOT_COMPLETED / CONNECTIVITY_CHANGE / TIME_SET / TIMEZONE_CHANGED), `UpgradeReceiver`, `TravelModeReceiver` |
| F-06 | Bundled adhān audio | ZIP central-directory listing of the APK | asset sizes | `assets/adhans/{standard,maghrebi,haramayn}/**`, `assets/adhans/reminders/**`, `assets/Cairo_Regular.ttf`, `assets/Roboto_Regular.ttf` |
| F-07 | RTL-first widgets | `rea search-android-classes salati__base.apk "com.masarat.salati" --format json` | 148 app-class matches | `…ui.views.RtlViewPager.RtlViewPager`, `…ui.views.CheckedTextViewAR`, `…util.ummalqura.*`, `…ui.views.CalendarView.MaterialCalendarView` |
| F-08 | No SDKs | same manifest + `res/raw`/`*.properties` inspection | `meta-data` block contains only gms + androidx.startup entries | absence of Firebase/Sentry/ad registrars |
| F-09 | OEM handling | same manifest | `uses-permission` lines | `com.huawei.permission.external_app_settings.USE_COMPONENT`, `oppo.permission.OPPO_COMPONENT_SAFE`; `com.google.android.play.core.common.PlayCoreDialogWrapperActivity` |
| F-10 | Calendar/phone-state permissions | same manifest | `uses-permission` lines | `WRITE_CALENDAR`, `READ_CALENDAR`, `READ_PHONE_STATE`, `RECORD_AUDIO` |
| Identity | Package / version / counts / SDK levels | `rea inspect-android-package salati__base.apk --format json` | `normalized_result.*` | `com.masarat.salati`, 3.7.66, 431, 3,525 classes, 1,293 resources, minSdk 21, targetSdk 35 |
| App name | `Salatuk` | `aapt2 dump resources salati__base.apk` | `resource 0x7f130064 string/app_name → "Salatuk"` | `res/values/strings.xml` |

---

## 6. Unknowns and limits

1. **No runtime behaviour.** The app is never executed; jadx provider `limitations` state
   this explicitly in every evidence record.
2. **Obfuscated vendor layers are unreadable.** `com.masarat.salati.managers.{a..e}`,
   `com.masarat.salati.ui.views.CalendarView.{a..x}`, `com.masarat.salati.util.ummalqura.{a,b,c}`,
   and `com.masarat.salati.ui.activities.{b0,d1,j0,x1,y1}` are ProGuard-mangled. Any
   behaviour implemented only there is **not** established.
3. **The prayer-time computation is not analysed.** `com.masarat.salati.util.ummalqura.*`
   and the calculation services are obfuscated; the astronomical method is unknown.
4. **Server behaviour is unknown.** `SalatiRefreshService`, `PriereService` and
   `SalatiRefreshWorker` imply network refresh of prayer data, but endpoints, payloads and
   auth are not in the APK.
5. **Notification channels are not enumerated.** Salati's notification path is local
   (services + receivers), and the channel ids were not extracted; the app targets
   `targetSdk 35`, so channels exist but their ids were not read.
6. **No in-app billing or Play Billing** — verified absent. The commercial model
   (donation, ads, Pro) is **not determinable** from this artifact.
7. **The `network_security_config` was not decoded** (apktool unavailable); whether
   cleartext is permitted for any domain is unknown.
8. **No signer** exposed (`signature_verification: "not_performed"`).
9. **No APK was installed and no device was touched.**

---

## 7. What this means for Wind

**Adopt (pattern only — no code, no assets):**
- **The alarm re-arm graph** (F-05): boot → user-unlock → time-set → timezone-change →
  app-upgrade → connectivity-change → `TIME_TICK` minute tick, plus WorkManager as a
  backstop. Wind's "delivery window closes" and "collect cash by 18:00" reminders must
  survive a reboot; this is the cheapest, most field-proven answer.
- **A lock-screen widget** (F-04) showing "out for delivery / collect cash" — cheaper than
  push on 2G and visible without unlocking. Note Salati gates its widget receivers with a
  signature permission; Wind should do the same.
- **A bundled offline data fallback** (F-06): ship the zone/fee table, delivery-window
  calendar and the customer's saved addresses as bundled JSON so a driver on a dead SIM
  still sees today's jobs.
- **Calendar integration** (`WRITE_CALENDAR`/`READ_CALENDAR`, F-10) — deliver the pickup
  window to the user's own calendar so the customer does not have to keep the app open.
- **Bilingual Arabic/English in the same APK, RTL-first widgets** (F-07) with **no tracking
  SDK** (F-08) — a defensible, privacy-positive position for a Palestinian app, and a
  real differentiator against apps that ship ad SDKs.
- **Huawei/OPPO accommodation** (F-09) plus Play In-App Update — the West Bank handset
  reality.

**Skip:**
- **Salati's actual product** (F-01). Prayer times, qibla, adhān, Umm al-Qura Hijri
  calendar, world cities. None of it belongs in Wind.
- **`READ_PHONE_STATE`, `RECORD_AUDIO`, `BLUETOOTH`, `DISABLE_KEYGUARD`,
  `CHANGE_NETWORK_STATE`** (F-10). Salati needs them for adhān + travel mode; Wind does
  not, and each one is a privacy cost in a market where users are sensitive about
  location and identity.
- **Full-screen-intent + keyguard-disable for order events** — appropriate for a prayer
  alarm, not for a delivery notification. Wind should use ordinary high-importance
  notifications.

**Defer with an evidence gate:**
- **A continuous background location service** (F-02). Salati needs it to keep prayer
  times correct as the user moves. Wind needs driver location, but **always-on background
  location** on a 2G phone is a battery and privacy disaster. Gate: Wind's dispatch model
  must be shift-based (as in Souq Tulkarm) rather than always-on, with location sampled
  only while a shift is active — that removes the need for `ACCESS_BACKGROUND_LOCATION`.
- **A home-screen widget** (F-04). Gate: only after Wind's notification delivery rate is
  proven good on the target handsets; a widget that shows stale data is worse than no
  widget.
- **Full offline bundled data** (F-06). Gate: measure Wind's actual zone/fee table size;
  if it is small enough to ship, do it, otherwise fall back to a cached-last-known copy
  with a stale flag.
