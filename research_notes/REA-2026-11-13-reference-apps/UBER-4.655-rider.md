# REA — Uber rider app `com.ubercab` **4.655.10001** (real shipped build)

**Compiled:** 13 November 2026 · **Edition:** static REA of the build installed on the owner's phone, diffed against the repo's existing study of **4.654.10002**
**Nature:** read-only static reverse-engineering of a locally-held APK set. No Uber system was contacted, no device was touched, no traffic was captured.
**Baseline being corrected:** `docs/KNOWLEDGE-2026-11-01-*`, `docs/KNOWLEDGE-2026-11-02-*`, `docs/RESEARCH-2026-10-31-rea-uber-app-reverse-engineering.md`, `research_notes/REA Uber app reverse engineering/evidence-k5-today/`.

---

## 0. Method, and how to read this file

### 0.1 Labelling convention

Every statement carries one of:

| Label | Meaning |
| --- | --- |
| **[O]** | **Observed** — read directly out of a tool result produced in this session. Cited to a command + output anchor. |
| **[I]** | **Inference** — a reading of observed structure. Plausible, not proven. |
| **[U]** | **Unknown** — not establishable from this artifact by static analysis. Stated as a gap, never guessed. |
| **[D]** | **Derived representation** — a decompiled method, or a class list parsed from a DEX class table. Not original source. |

### 0.2 Tooling actually used

| Tool | Version | Used for |
| --- | --- | --- |
| `rea` CLI | 6.7.0 (on PATH) | manifest + class census + **class member inventory** (`inspect-android-class` was used to verify 7 enum/constant surfaces: `MapProvider`, `MapProviderConfigurationModel`, `CameraUpdate`, `SemanticZoom`, `CameraManagerWorker`, `AccessPointIntent`, `AccessPointUsage`) |
| `jadx-headless-mcp` | 0.7.1 (`6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`) | the JADX engine behind `inspect-android-package` / `search-android-classes` / `inspect-android-class` |
| `dex-inventory.py` (repo's own script, run **unmodified** from `research_notes/REA Uber app reverse engineering/evidence-k5-today/`) | — | DEX class tables, string pool, API-path/URL/SQL extraction |
| `aapt2` | Android SDK build-tools 36.1.0 | resource dump (base + Arabic split) |
| `apksigner` | Android SDK build-tools 36.1.0 | signer certificate fingerprints |
| `System.IO.Compression` (PowerShell) | — | ZIP entry inventory, split sizes |

Environment for every `rea` call (PowerShell):

```powershell
$env:REA_JADX_MCP_JAR="$env:USERPROFILE\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:JAVA_HOME="C:\Users\osama\scoop\apps\temurin17-jdk\current"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:REA_JADX_HEAP_MIB="8192"
$env:REA_JADX_OPERATION_TIMEOUT_MS="900000"
```

### 0.3 Counting bases — read before comparing any number

The repo already flags this trap (`docs/KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md:5`, `docs/CURRENT-WORK.md:32`). **Four** bases are used in this file. They are not interchangeable.

| Basis | 4.654.10002 | 4.655.10001 | How measured here |
| --- | --- | --- | --- |
| (a) DEX **class definitions** (class tables) | 288,727 | **288,493** | `dex-inventory.py` `class_total` |
| (b) REA **code-inventory view** (what JADX materialises) | 174,047 | **174,898** | `rea inspect-android-package` → `normalized_result.class_count`; `rea search-android-classes ""` → `total_classes` |
| (c) REA **resource entries** | 13,049 | **12,747** | `rea inspect-android-package` → `normalized_result.resource_count` |
| (d) Base **default-locale `<string>` entries** | 15,380 (apktool) | **15,335** (aapt2) | `aapt2 dump resources base.apk` → `type string … entryCount` |

(a) and (b) move in **opposite directions** between the two builds. Any claim of the form "the app grew/shrank by N classes" is meaningless without naming the basis. The repo's own documents are careful about this; so is this file.

### 0.4 Two methodological constraints that shaped the work

- **The 4.654.10002 APK is no longer on this machine.** `C:\Users\osama\AppData\Local\Temp\opencode\uber\` does not exist; only the new 4.655 set does. **All name-level diffs therefore use the repo's archived 4.654 class list** (`evidence-k5-today/dex-classes.txt.gz`, 288,727 entries, gzip) and the repo's archived `dex-api-paths.json` / `dex-urls.json` / `dex-sql-strings.json` / `dex-inventory-summary.json` / `manifest.json` as the baseline. This is a *repository baseline*, not a re-pull of the old artifact — stated wherever it matters.
- **`rea decode-android-resources` is unusable here**: REA 6.7.0's apktool provider is not installed (`capability_unavailable … The apktool launcher was not found`). Resource decoding was done with `aapt2` instead, which changes the counting basis for (d) — apktool `<string>` elements vs aapt2 `type string` entries. The ~45-string gap between 15,380 and 15,335 is most plausibly that basis difference, **not** a deletion. Do not read it as a content change.
- **`rea inspect-signature` is macOS-only** (`provider_id: native-macos`, `reason: Native macOS utilities require macOS`). APK signing was read with `apksigner` instead.

---

## 1. Artifact identity

### 1.1 The base APK **[O]**

| Field | Value | Command / anchor |
| --- | --- | --- |
| Package | `com.ubercab` | `rea inspect-android-package uber-rider__base.apk --format json` → `normalized_result.package_name` |
| versionName | **4.655.10001** | same → `normalized_result.version_name` |
| versionCode | **323547** | same → `normalized_result.version_code` |
| minSdk | **29** | same → `normalized_result.min_sdk` |
| targetSdk | **36** | same → `normalized_result.target_sdk` |
| Size | **207,018,879 bytes** | `Get-Item` / ZIP entry sum |
| SHA-256 | `BC0E06D32B5EA6C2F12D36FDDC561BB6427B9A4A76B46A3D5B737368732965C4` | `Get-FileHash -Algorithm SHA256` |
| DEX count | **23** (`classes.dex` … `classes23.dex`) | ZIP entry scan + `dex-inventory.py` |
| DEX total uncompressed | **186,163,396 bytes** | ZIP entry sum |
| Class definitions (basis a) | **288,493** | `dex-inventory.py` → `class_total` |
| Code-inventory classes (basis b) | **174,898** | `rea search-android-classes <apk> "" --format json` → `normalized_result.total_classes` |
| Resource entries (basis c) | **12,747** | `rea inspect-android-package` → `normalized_result.resource_count` |
| Base default-locale strings (basis d) | **15,335** | `aapt2 dump resources base.apk` → `type string id=14 entryCount=15335` |
| `resources.arsc` | 5,085,120 B | ZIP entry scan |
| `assets/parameters.json` | 5,278,728 B | ZIP entry scan |
| `assets/` files | 1,307 | ZIP entry scan |
| `res/` files | ~9,880 (drawable 6,010 · layout 2,811 · color 301 · …) | ZIP entry scan |
| Native libs in base | **0** (all native code is in the arm64 splits) | ZIP entry scan, `lib/*` → 0 |
| JADX engine | `jadx-headless-mcp` 0.7.1, `source_revision 5844800a486d2248fa949b74c9896285f5b54de2`, heap 8192 MiB, worker_count 1 | `normalized_result.engine` |

**DEX file inventory** (uncompressed size, `classes.dex` → `classes23.dex`) **[O]**:

```
classes.dex   6,355,224     classes13.dex   6,831,284
classes2.dex  9,843,668     classes14.dex   8,589,284
classes3.dex  8,254,712     classes15.dex   8,096,896
classes4.dex 10,152,648     classes16.dex   8,832,984
classes5.dex  8,924,092     classes17.dex   8,327,196
classes6.dex  9,222,756     classes18.dex   8,593,408
classes7.dex  8,854,652     classes19.dex   7,932,128
classes8.dex  8,228,748     classes20.dex   9,283,736
classes9.dex  9,196,600     classes21.dex   9,287,412
classes10.dex 9,214,084     classes22.dex   5,184,872
classes11.dex 9,280,204     classes23.dex       4,452
classes12.dex 7,672,356
```

### 1.2 Split set **[O]** — 10 APKs, the same split names as the repo's 4.654 delivery

| Split | Bytes | SHA-256 |
| --- | --- | --- |
| `uber-rider__base.apk` | 207,018,879 | `BC0E06D3…32965C4` |
| `uber-rider__split_config.arm64_v8a.apk` | 15,291,729 | `57343A4C…A8E6C8` |
| `uber-rider__split_VoipTwilio.config.arm64_v8a.apk` | 11,694,518 | `BEBE5494…9A72E8` |
| `uber-rider__split_BarcodeScanner.config.arm64_v8a.apk` | 4,977,067 | `89F28EFF…C52DBDF` |
| `uber-rider__split_config.ar.apk` | 2,310,553 | `C6372C6A…A653C6` |
| `uber-rider__split_BarcodeScanner.apk` | 1,295,392 | `64FAFDC3…74998DF` |
| `uber-rider__split_config.xxhdpi.apk` | 735,406 | `E3EA37BF…C970E6A1` |
| `uber-rider__split_VoipTwilio.apk` | 303,311 | `7A060A93…61E5BD6` |
| `uber-rider__split_GooglePaySdk.apk` | 94,571 | `4F02C966…3A14858` |
| `uber-rider__split_FlashNacional.apk` | 24,783 | `940D2FA5…A864A122` |

> **The repo's claim holds.** `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:60` (N13) says *"10-APK delivery"*, and the 4.655 delivery is also **10 APKs** with the **same split names** — including the two `BarcodeScanner` splits (code + `BarcodeScanner.config.arm64_v8a`) that the repo's own 4.654 archive already records (`sig-split-split_BarcodeScanner.config.arm64_v8a.json` … `sig-split-split_config.xxhdpi.json`). **The split set is unchanged; no repo correction is needed here.** The per-split *sizes and hashes* above are new data for this build.

### 1.3 Signing **[O]**

```
apksigner verify --print-certs uber-rider__base.apk
Signer #1 certificate DN: CN=Jordan Bonnet, O=UberCab, L=San Francisco, ST=California
Signer #1 certificate SHA-256 digest: 4003231ab42feb8d955e62fdfaa4fad59567054b9c6bbc3d950299ddfc268392
Signer #1 certificate SHA-1 digest: 411c40b31f6d01dac68d711df99b6eafeec8e73b
Source Stamp Signer certificate DN: CN=Android, OU=Android, O=Google Inc., L=Mountain View, ST=California, C=US
Source Stamp Signer certificate SHA-256 digest: 3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d
```

Both fingerprints are **byte-identical** to the 4.654 baseline (`evidence-k5-today/sig-uber-base.json`: signer `4003231a…c268392`, source stamp `3257d599…3bbd6d`).

> **[O] Same signing key, same Play source stamp.** This is the strongest single statement in the file: **4.655.10001 is a signed, Play-distributed continuation of the same Uber application identity as the 4.654.10002 the repo studied.** The repo's `docs/CURRENT-WORK.md:61` line (`cert 4003231a…392` + Play source stamp) remains true and now applies to the newer build as well.

### 1.4 Native library inventory **[O]**

`split_config.arm64_v8a` (13 libs) — identical set to the repo's `evidence-k5-today/uber-split-arm64.json` / `exp-*.json` inventory:

```
libubermaps-gl.so           4,111,448      ← Uber's own GL map engine
libvendor-mapdisplay.so    3,925,904      ← engine↔Java bridge (network/disk/experiments/analytics)
libtensorflowlite_jni.so   4,320,480
libse.so                     666,496      ← security engine
libse_loader.so              640,488
libeef0.so                 1,104,560
libh3.so                      91,768      ← hex spatial index (com.uber.h3.NativeMethods)
libml-imageproc.so           258,144
libimage_processing_util_jni.so  29,008
libndk-crash.so               10,552
libndk-anr.so                 10,472
libsurface_util_jni.so         4,832
libandroidx.graphics.path.so   10,096
```

`split_VoipTwilio.config.arm64_v8a`: `libtwilio_voice_android_so.so` (11,666,200).
`split_BarcodeScanner.config.arm64_v8a`: `libbarhopper_v3.so` (4,946,720).

> **[O] Native surface unchanged.** Every library the repo names (`docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:40` F26 — `libtensorflowlite_jni.so`, `libml-imageproc.so`; `:54` N7 — `libse`/`libse_loader`; `:59` N12 — `libndk-crash`/`libndk-anr`) is present at the same path and role. **No native library was added or removed.**

---

## 2. Declared surface

### 2.1 Permissions — 48 unique / 50 declaration lines **[O]**

The manifest declares 50 `uses-permission*` lines resolving to **48 unique** permission names (two names appear twice: once as `uses-permission`, once as `uses-permission-sdk-23`).

**The 4.654 and 4.655 permission sets are IDENTICAL.** Verified by parsing `<uses-permission*>` lines out of both decoded manifests and set-comparing: *50 declaration lines and 48 unique names in both; difference set empty.*

Two permission names are declared only via the `-sdk-23` form — `android.permission.RECORD_AUDIO` and `android.permission.BLUETOOTH_ADMIN` — and both were **already present in 4.654**.

> **Correction to the repo.** `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:72`, `docs/RESEARCH-2026-10-31-rea-uber-app-reverse-engineering.md:37` and `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md` all state **"46 permissions"**. The real declared set is **48**. The 46 came from the *old REA release's* manifest parser, which collected `uses-permission` but not `uses-permission-sdk-23` — it silently dropped `RECORD_AUDIO` and `BLUETOOTH_ADMIN`. This is a **tool artifact, not a build difference**: the 4.654 manifest in the repo's own archive (`evidence-deepseek/manifest.json` → `manifest.text`) contains the very same `RECORD_AUDIO` and `BLUETOOTH_ADMIN` lines. **The correct number for both builds is 48.**

Full set (48): `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `BROADCAST_CLOSE_SYSTEM_DIALOGS`, `CALL_PHONE`, `CAMERA`, `CHANGE_NETWORK_STATE`, `DETECT_SCREEN_CAPTURE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `FOREGROUND_SERVICE_LOCATION`, `FOREGROUND_SERVICE_MEDIA_PROJECTION`, `FOREGROUND_SERVICE_MICROPHONE`, `GET_ACCOUNTS`, `HIDE_OVERLAY_WINDOWS`, `INTERNET`, `MANAGE_ACCOUNTS`, `MODIFY_AUDIO_SETTINGS`, `POST_NOTIFICATIONS`, `READ_BASIC_PHONE_STATE`, `READ_CONTACTS`, `READ_EXTERNAL_STORAGE`, `READ_PHONE_STATE`, `RECEIVE_BOOT_COMPLETED`, `RECORD_AUDIO`, `SCHEDULE_EXACT_ALARM`, `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_CREDENTIALS`, `USE_FINGERPRINT`, `USE_FULL_SCREEN_INTENT`, `VIBRATE`, `WAKE_LOCK`, `WRITE_EXTERNAL_STORAGE`, `com.google.android.c2dm.permission.RECEIVE`, `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`, `com.google.android.gms.permission.AD_ID`, `com.google.android.providers.gsf.permission.READ_GSERVICES`, `com.ubercab.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, `com.ubercab.permission.C2D_MESSAGE`.

**[O] No background-location permission** (repo N5, `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:52`) — confirmed, `ACCESS_BACKGROUND_LOCATION` is absent.

### 2.2 Components **[O]**

| | 4.654.10002 | 4.655.10001 |
| --- | --- | --- |
| Total components | 110 | **109** |
| activity / activity-alias | 36 / 2 | 36 / 2 |
| service | 22 | 22 |
| receiver | 33 | 33 |
| **provider** | **17** | **16** |
| `exported="true"` | 26 | **26** |
| `exported="false"` | 65 | 64 |
| exported unset | 19 | 19 |
| Components with ≥1 intent filter | 35 | **35** |
| Total intent filters | 89 | **89** |
| Intent filters on exported components | 72 | **72** |
| `autoVerify="true"` filters | 38 | **38** |
| Unique deep-link schemes | 23 | **23** |
| Unique link hosts | 35 | **35** |
| Unique provider authorities | 17 | **16** |
| Decoded manifest size | 103,309 B | **103,117 B** |

**The one component change: `com.squareup.picasso.PicassoProvider` is gone.** Its authority `com.ubercab.com.squareup.picasso` is the removed 17th. **[O]** The Square **Picasso** image-loading library's `ContentProvider` is no longer registered. *Note:* the `com.squareup.*` package itself still exists in the DEX (73 classes in 4.654) — this is a **provider-registration** removal, and by itself it does **not** prove Picasso was uninstalled. **[I]** Uber likely switched the app's image-loading path from Picasso to Coil/Glide; **[U]** which library now serves images is not statically determinable here.

Everything else is identical: the exported set, the 72 filters on exported components, the 38 `autoVerify` App Links, the 35 hosts and 23 schemes all match the repo's numbers exactly (`docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:72`, `docs/KNOWLEDGE-2026-11-01-uber-app-screens-and-design-system.md:37`).

### 2.3 Deep-link schemes (23, unchanged) **[O]**

`@string/line_auth_scheme`, `@string/sso_third_party_scheme`, `@string/uauth_applink_scheme`, `@string/uauth_dl_scheme`, `@string/uauth_grab_redirect_scheme`, `@string/ub__fb_login_protocol_scheme`, `adyen3ds2`, `braintree-paypal-connect-fallback.com.ubercab`, `braintree-paypal-connect.com.ubercab`, `braintree-venmo-connect.com.ubercab`, `com.ubercab`, `com.ubercab.payment.provider.callback`, `com.ubercab.uberpay`, `geo`, `google.navigation`, `http`, `https`, `package`, `uber`, `uber_performance_debug`, `uber-dragon-crawl-e2e`, `uber-wisdom-bugreport`, `uber.payment.provider.callback`.

> **[O] No new deep link. No removed deep link.** `uber_performance_debug` (repo F28, `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:42`) still present.

### 2.4 SDK levels **[O]** — `minSdk 29`, `targetSdk 36`, unchanged from 4.654.

---

## 3. Where this build differs from the repo's study of 4.654.10002

### 3.1 What was checked

| Group | Claims checked | Source of the claim |
| --- | --- | --- |
| Map capability — class FQNs | **82** | `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md` (every cited `sources/...` class path) |
| API contract — route literals | **145** | `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` §1.0–§1.9 |
| API contract — route families (prefix) | **67** | same, §1.0 census |
| Features / NFRs — discrete numeric + surface claims | **23** | `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md` §2 (F1–F28), §3 (N1–N15) |
| **Total discrete claims checked** | **317** | |

**Result: 317 checked → 21 changed or extended · 11 not verifiable from this artifact · 285 confirmed still true.**

Of the 21 changed/extended rows, 2 are *extensions* rather than *contradictions* (C21, C22): the repo's claim stands, but the implementation gained one constant and changed mechanism. The other 19 are genuine corrections.

### 3.2 CHANGED — the repo is now stale on these

| # | Repo claim (file:line) | 4.655 finding | How checked |
| --- | --- | --- | --- |
| C1 | *"Package `com.ubercab`, versionName **4.654.10002**, versionCode **322019**"* — `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:7`; `docs/CURRENT-WORK.md:61` | **versionName 4.655.10001, versionCode 323547** | `rea inspect-android-package` → `version_name` / `version_code` |
| C2 | *"base.apk = **207,761,677 bytes**, SHA-256 `55663c73…4a2`"* — `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:8` | **207,018,879 bytes**, SHA-256 `BC0E06D3…32965C4` (−742,798 B) | `Get-FileHash`, `Get-Item` |
| C3 | *"**23 DEX files, 13,049 resources, and 288,727 class definitions**"* — `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:8`; `docs/KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md:14` | 23 DEX ✓; **resources 12,747 (−302)**; **class definitions 288,493 (−234)** | `rea inspect-android-package` → `resource_count`; `dex-inventory.py` → `class_total` |
| C4 | *"the code-inventory view lists **174,047**"* — `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:8`, `:272` | **174,898 (+851)** | `rea search-android-classes ""` → `total_classes` |
| C5 | *"**125,670 of the 288,727** class definitions (43.5 %) carry `com.uber.*` (102,376) or `com.ubercab.*` (23,294) names"* — `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:22`; `docs/KNOWLEDGE-2026-10-31-uber-rider-app-facts.md:22` | **com.uber 101,489 (−887)**, **com.ubercab 22,300 (−994)** → **123,789 first-party (−1,881, 42.9 %)** | `dex-inventory.py` class list, 2-segment histogram, both builds |
| C6 | *"**46 declared permissions**"* — `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:72`; `docs/RESEARCH-2026-10-31-rea-uber-app-reverse-engineering.md:37`; `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:147` | **48 unique / 50 declaration lines** — for *both* builds. The "46" was an old-REA parser artifact that dropped `uses-permission-sdk-23`. | `<uses-permission*>` parse of both decoded manifests + set comparison |
| C7 | *"**110 components, 26 exported**"* — `docs/KNOWLEDGE-2026-10-31-uber-rider-app-facts.md:44`; `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:72` | **109 components, 26 exported.** `com.squareup.picasso.PicassoProvider` removed | XML parse of both decoded manifests |
| C8 | *"**14,516 parameters (7,258 boolean, 3,372 plugin switches)** … `FEATURE_FLAG` 5,467 … `BUG_FIX` 1,517"* — `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:55` (N8) | **14,572** (int64 1,864 · float64 625 · string 1,423 · bool **7,281** · pluginSwitch **3,379**). `FEATURE_FLAG` **5,457 (−10)**, `CONFIGURATION` 4,181 (+30), `PLUGIN` 3,381, `BUG_FIX` **1,546 (+29)** | `assets/parameters.json` parsed from the APK; baseline `evidence-k5-today/parameters-registry-summary.json` |
| C9 | *"`GET /rt/riders/dispatchconfig` → `DispatchConfigResponse` — `G\edge\services\dispatchconfig\DispatchConfigApi.java`"* — `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md:187-188`, and listed among *"Rider-path GETs in the whole index"* at `:205` | **Route literal absent.** The whole `com.ubercab.dispatch_config` package is gone: `DispatchConfigStream`, `DispatchPresentationCardStream`, `DispatchConfigCacheWorkerPluginFactory`, `DispatchConfigScriptsRamenWorkerPluginFactory`, `DispatchRequirementListener`, `DispatchRequirementProvider`, `DispatchPresentationCard` — 9 classes, **0 added** | `dex-inventory.py` `dex-api-paths.json` diff + class-list diff |
| C10 | *"`AccessPointGroup` failed to decompile — only an empty `AccessPointGroupOrBuilder` survives"* — `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:10` (honesty note) | **`AccessPointGroup` now materialises with a `$Builder` and 4 members** (`AccessPointGroup`, `AccessPointGroup$Builder`, `AccessPointGroup$a`, `AccessPointGroupOrBuilder`) | `dex-inventory.py` class list (4.654 vs 4.655) |
| C11 | *"`UberMapView` does **not** exist as a named class in this jadx output; only `GoogleMapView` survives by name"* — `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:9` (honesty note) | **`com.ubercab.android.map.UberMapView` exists in 4.655 with 26 classes**, incl. `UberMapTextureView`, `NativeCallbackHandler`, `UBMStyleObserver`, `UBMGlyphRangeObserver`, `UBMSpriteObserver`, `UBMManifestObserver`, `FocalPointCenterGesturePointInterceptor`, `DefaultGesturePointInterceptor` | `dex-inventory.py` class list; the 4.654 absence was a decompiler artifact, not a real gap |
| C12 | *"Exactly three values: `UBER`, `GOOGLE`, `UNKNOWN`"* — `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:23` | **Enum values are still exactly three** (✓) — but 4.655 adds a **fourth static member `MapProvider.FALLBACK_MAP_PROVIDER`** of type `MapProvider`, with synthetic accessor `access$getFALLBACK_MAP_PROVIDER$cp()` | `rea inspect-android-class` → `fields` + `methods` |
| C13 | *"the base package has **15,380** default-locale strings and no locale-qualified `values-*` tables"* — `docs/KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md:85`; `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:56` (N9); `docs/KNOWLEDGE-2026-11-01-uber-app-screens-and-design-system.md:75` | **15,335** by aapt2 (`type string entryCount=15335`). Base has **exactly one `type string` table** — the "no language tables in base" half of the claim is **confirmed**; the count differs by 45 on a different tool basis | `aapt2 dump resources base.apk` |
| C14 | *"the string set includes right-to-left layout qualifier tables (`values-ldrtl`)"* — `docs/KNOWLEDGE-2026-11-01-uber-app-screens-and-design-system.md:75` | **No `values-ldrtl` in base.** What exists is `res/drawable-ldrtl/` (7 files) — a **drawable** qualifier, not a **values** table. The repo conflated the two | `aapt2 dump resources` + ZIP `res/` dir scan |
| C15 | *"mapdisplay_flipr_available_map_providers = `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}`"* — `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:32` | **Unchanged, byte-identical.** But a *new* parameter `mapdisplay_flipr_map_provider` (CONFIGURATION, empty default) and `mapdisplay_flipr_map_provider_manager` (FEATURE_FLAG) now sit alongside it, and `MapProvider.FALLBACK_MAP_PROVIDER` exists in code — suggesting the fallback chain gained a fourth, code-level degree of freedom | `assets/parameters.json` + `rea inspect-android-class` |
| C16 | *"location editor owns reverse-geocoding its pin position"* (§8, `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:198`) | **The Compose migration completed.** `connect_location_editor_compose_migration` **removed**; `connect_location_editor_completed_event_handler_tnkch8`, `connect_request_location_editor_state_tnkch8`, `pickup_request_location_device_location_tnkch8` all flipped **false → true** | `assets/parameters.json` diff vs the repo's 400-entry `map_location_geo_parameters_sample` |
| C17 | *"render_frame_allocator_capacity 10,485,760 B"* (N3, `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:50`) | **Unchanged value (10,485,760)** — but the *map* parameter surface itself grew: new `mapdisplay_flipr_enable_xray_polyline`, `…_enable_sprite_atlas_v2`, `…_enable_dyn_param_stylesheet`, `…_single_pass_feature_values`, `…_drop_unused_label_precompute`, `…_dedupe_sprite_store`, `…_build_line_labels_in_place`, `…_collision_grid_clear`, `…_per_tile_reparse_v2`, `…_max_feature_request_polygon_vertices` (=1000), `…_placement_filter_heading_enabled` | `assets/parameters.json`, all `mapdisplay_*` keys |
| C18 | *"mapdisplay_flipr_enable_stencil_clip_interleave"* (implied present in 4.654 map params) | **Removed** in 4.655 | same |
| C19 | *"**1,046** unique `@retrofit2.http.*` literals (broad grep) … stricter `/rt/…` grep returned **1,030**"* — `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md:60-62` | **1,413** API-path literals by `dex-inventory.py`'s `PATH_RE` on the 4.655 base vs **1,406** by the same script on 4.654 (**+7**). The repo's two numbers were produced by a *different* grep on the *decompiled source tree*; the repo's own guidance to *"quote counts with the grep method, never as a single absolute number"* applies | `dex-inventory.py` on both builds, same script, same regex |
| C20 | *"743 per-endpoint `*Errors` classes"* / *"50 `@GrpcApi`"* / *"1,046 / 1,030 routes"* as **absolute** numbers — `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md:36`, `:30`, `:60-62` | **Not reproducible on this build** — the `w46` obfuscated root and the grep basis both changed. The *pattern* survives (§4.3). **See §3.4** | `dex-inventory.py` on both builds; `dex-inventory.py` class list |
| C21 | *"`CameraUpdate` … type constants: `CAMERA_POSITION(0), LAT_LNG(1), LAT_LNG_BOUNDS(2), LAT_LNG_BOUNDS_DIMEN(3), LAT_LNG_ZOOM(4), SCROLL_BY(5), ZOOM_IN(6), ZOOM_OUT(7), ZOOM_TO(8), LAT_LNG_BOUNDS_MAX_ZOOM(9)`"* — `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:43` | **All 10 named constants confirmed present**, in the same class, plus `DEFAULT_ANIMATION_DURATION_MS : long`. **One addition: an 11th constant `TEST : int`** that the repo does not list. The accessor set also confirms the repo's *"type + payload + padding + maxZoom + width/height + x/y pixels"*: `type()`, `target()`, `zoom()`, `bounds()`, `cameraPosition()`, `padding()`, `maxZoom()`, `width()`, `height()`, `xPixels()`, `yPixels()` | `rea inspect-android-class` → `fields` + `methods` |
| C22 | *"`SemanticZoom`: Named zoom levels: `WORLD 0, CONTINENT 2, CITY 12, NEIGHBORHOOD 14, STREETS 15, BUILDINGS 17, BUILDING 18, ANTS 22`, plus `CUSTOM(d)`; `Comparable`"* — `:48` | **All 9 names confirmed** — but the mechanism differs from what the repo implies: they are **Kotlin sealed nested classes** `SemanticZoom$WORLD` … `$ANTS`, `$CUSTOM` on the base `SemanticZoom` (which carries a single `zoomInLevel : double` field and implements `compareTo`/`compareTo2`). The base class itself exposes **no** named constants. The numeric ladder (0/2/12/…) is not visible without reading each subtype's body | `rea inspect-android-class` → `fields`/`methods`/`inner_classes`; `dex-inventory.py` class list |
| C23 | *"`AccessPointIntent`: `INVALID, PASSENGER_PICKUP, PASSENGER_DROPOFF, DELIVERY_DROPOFF, DELIVERY_PICKUP`"* — `:211` | **Confirmed exactly**, with protobuf-lite enum fields `ACCESS_POINT_INTENT_INVALID`, `…_PASSENGER_PICKUP`, `…_PASSENGER_DROPOFF`, `…_DELIVERY_DROPOFF`, `…_DELIVERY_PICKUP` (each with a `_VALUE : int` twin) plus the standard `UNRECOGNIZED` and `internalValueMap: com.google.protobuf.Internal$EnumLiteMap` | `rea inspect-android-class` → `fields` + `methods` |
| C24 | *"`CameraManagerWorker` defines a worker enum: `BASIC_LOCATION_EDITOR, CONFIRMATION, DEFAULT, EVENT_SHUTTLE, HCV, HELIUM, HUB_POOL, ROUTE_LINE, WALKING_PICKUP, NO_OP`"* — `:72` | **The 10 enum constants are NOT confirmable in 4.655.** `com.ubercab.rider_map_common.map_hub.CameraManagerWorker` is **unchanged between the builds** (present in both class lists; 0 added, 0 removed) and in 4.655 exposes **zero fields** and a single method `getType(): CameraManagerWorker$a` — i.e. a sealed type with one nested subtype, not a 10-value enum. The concrete worker `com.ubercab.map_hub.map_camera.ConfirmationCameraManagerWorker` (+`$ParentComponent`, `$a`) is likewise present in **both** builds. **This is the same decompilation limitation the repo itself flagged at `:72`** ("*the `com.uber.map_hub.*` implementations did not survive decompilation in this output*") — not a regression | `rea inspect-android-class` → `fields` (empty), `methods`; `dex-inventory.py` class-list diff (0 added / 0 removed) |

### 3.3 CONFIRMED STILL TRUE — spot-highlights (full list in §5)

| Repo claim (file:line) | Verdict | How checked |
| --- | --- | --- |
| *"`CameraUpdate` … type constants (10) … `DEFAULT_ANIMATION_DURATION_MS = 300`"* — `map-capability-inventory.md:43` | ✅ **all 10 constants confirmed** (+ a new `TEST` constant — see C21); the 300 ms *value* is not read | `rea inspect-android-class` → `fields` |
| *"`SemanticZoom`: `WORLD 0 … ANTS 22`, plus `CUSTOM(d)`; `Comparable`"* — `:48` | ✅ **all 9 names confirmed**, as sealed nested classes; numeric values not read (C22) | `rea inspect-android-class` + class list |
| *"`CameraManagerWorker` enum: `BASIC_LOCATION_EDITOR … NO_OP`"* — `:72` | ⚠️ **not confirmable** — see C24; the class is unchanged, but exposes no enum constants in 4.655 | `rea inspect-android-class` → `fields` (empty) |
| *"`AccessPointIntent`: `INVALID, PASSENGER_PICKUP, PASSENGER_DROPOFF, DELIVERY_DROPOFF, DELIVERY_PICKUP`"* — `:211` | ✅ **confirmed exactly** (C23) | `rea inspect-android-class` → `fields` |
| *"`AccessPointUsage`: … `PACKAGE_PICKUP`, `PACKAGE_DELIVERY`"* — `:212` | ✅ **confirmed exactly** — all 10 usages present (`PASSENGER_PICKUP`, `PASSENGER_DROPOFF`, `ENTRANCE`, `EXIT`, `PARKING`, `POSTAL`, `PACKAGE_PICKUP`, `PACKAGE_DELIVERY`, `FOOD_PICKUP`, `FOOD_DELIVERY`) + `INVALID` + `UNRECOGNIZED`, each with an `_VALUE : int` twin | `rea inspect-android-class` → `fields` |
| *"`MapProviderConfigurationModel` — Kotlinx-serialized JSON of `{initialMapProvider, fallbackMapProviders: List<String>, missingProviderDefault}`"* — `:24` | ✅ **confirmed exactly** — fields `initialMapProvider: String`, `fallbackMapProviders: List<String>`, `missingProviderDefault: String`, plus `Companion`, `JSON: lpc.b` and `$childSerializers: kotlinx.serialization.KSerializer[]` | `rea inspect-android-class` → `fields` |
| *"the two-backend design … `MapProvider` … `MapFactory` … `styleUrl = https://tc2.uber.com/style/default/native?o=DEFAULT`"* — `:26` | ✅ class present **and** the parameter `mapdisplay_flipr_stylesheet_path` still equals that exact URL | class list + `parameters.json` |
| *"minSdk 29 → targetSdk 36"* — `features-and-requirements.md:61` | ✅ | manifest |
| *"no background-location permission; location work only in foreground services"* — `:52` | ✅ | manifest |
| *"overlay cache 24, tile-query cache 131,072"* — `:50` | ✅ `mapdisplay_flipr_tile_overlay_cache_size`=24, `mapdisplay_flipr_tile_query_cache_size`=131072 | `parameters.json` |
| *"`mapdisplay_flipr_frame_rate` (0 = follow display)"* — `:49` | ✅ = `0` | `parameters.json` |
| *"`/rt/riders/pre-trip-map` → `RidersPreTripMapData`"* — `api-backend-contract-study.md` §1.3 | ✅ route family unchanged | `dex-api-paths.json` |
| *"50 `@GrpcApi(path=…)` literals"* — `:30` | ✅ `com.uber.model.core.generated.uber.maps.presentation.SearchGrpcApi` + `SearchGrpcClientImpl` + `EPUDOSearchGrpcApi` + `EPUDOSearchGrpcClientImpl` present | class list |
| *"10-APK delivery"*, *"38 `autoVerify` filters"* — `features-and-requirements.md:60` | ✅ both | manifest |
| *"locales ship as separate splits"* — `:56` | ✅ base has **one** `type string` table; Arabic ships in `split_config.ar.apk` (9,523 strings) | `aapt2` |

### 3.4 NOT VERIFIABLE STATICALLY — stated, not guessed

| Repo claim | Why not verifiable here |
| --- | --- |
| *"`MapProvider.Companion.fromString` maps empty → `UNKNOWN`, `"google"` → `GOOGLE`, everything else → `UBER`"* — `map-capability-inventory.md:23` | Needs a decompiled method body. The enum *shape* is confirmed (§3.2 C12); the **mapping** is **[D]**, not re-verified. |
| *"`CameraUpdate` type-constant **numeric values** (0…9, `DEFAULT_ANIMATION_DURATION_MS = 300`)"* — `:43` | Constant **names** are confirmed (C21); the values live in `<clinit>` and were not read. |
| *"`SemanticZoom` **numeric ladder** (0, 2, 12, 14, 15, 17, 18, 22)"* — `:48` | The **names** are confirmed as sealed subclasses (C22); each level's number lives in its own class body and was not read. |
| *"`CameraManagerWorker` enum **values** (10 named flavors)"* — `:72` | See C24. The class is unchanged between builds; the 4.655 shape exposes no enum constants. |
| *"collision scorer weights `currentPositionScore=+50`, `onScreen=+50`, `partiallyOnScreen=−55`, `offScreen=−125`, `equalPriorityCollision=−160`"* — `:119` | Constant values in a class body; class `com.ubercab.android.map.collision.layout.FloatingPlacementScoreWeights` present, values not read. |
| *"`FuzzedLatLng` offset `r = sqrt(rand) × 0.0071877807726864335°` (≈800 m)"* — `:182` | A literal in a method body. |
| *"`MapElementHitTester` 16 dp screen tolerance"* — `:207` | A literal in a method body. |
| *"743 / 839 `*Errors` classes"* — `api-backend-contract-study.md:36`, `:319-320` | The `w46` obfuscated root was **re-obfuscated** in 4.655, so the exact grep cannot be reproduced. The *pattern* survives — see §4.3. |
| *"743 per-endpoint `*Errors`"*, *"50 `@GrpcApi`"*, *"1,046 / 1,030 routes"* as **absolute** numbers | All three are grep-method-dependent by the repo's own admission; the obfuscated roots and the grep basis both changed. Only relative movement is reported here. |
| *"live resolution on the study device was `google`"* — `map-capability-inventory.md:32` | Runtime behaviour. **Not statically knowable and not claimed here.** |
| *"error-union discriminator: HTTP status first, body `code` second"* — `api-backend-contract-study.md` §2.6 | A behaviour of the generated client. Static artefacts can show the *shape*; the *selection rule* is server/transport behaviour. |

---

## 4. What this build adds

### 4.1 **[O] New first-party packages (absent entirely in 4.654)**

| Package | Classes | What it is |
| --- | --- | --- |
| **`com.uber.maps.mapsexperiencepresentation`** | **+41** | A new **server-driven POI-on-map presentation layer**: `GetMapPoisForAnchorRequest` / `GetMapPoisForAnchorResponse`, `PoiRequest` / `PoiRequestOrBuilder`, `PoiGroup` / `PoiGroupSuccess` / `PoiGroupOrBuilder`, `PoiMarker` / `PoiMarkerOrBuilder`, `PoiType`, `MobileAnchor`, `TripDestinationAnchor`, `MarkerMetadata`, `EatsFilters`, `FulfillmentType` |
| **`com.uber.mapssdk.poi`** | **+11** | A new **client-side POI cache + service**: `POIService`, `POICache`, `POICache$Entry`, plus 5 obfuscated impl classes |
| `com.uber.identity.invite` | +32 | Identity invitation flow |
| `com.uber.my_uber.commute` | +6 | "My Uber" commute tab |
| `com.uber.commute.alert_tracking` | +7 | Commute live-alert tracking |
| `com.uber.commute.commutemanager` | +6 | Commute manager |
| `com.uber.devicesdk.telemetry` | +8 | Device SDK telemetry |
| `com.uber.helix.upcoming_activity` | +6 | Helix activity scheduling |
| `com.uber.premium_order_selection.screen` | +8 | Premium offer selection screens |
| `com.ubercab.presidio.premium` | +19 | Premium tier |

> **Wind relevance.** `mapsexperiencepresentation` + `mapssdk.poi` together are a **POI-anchored map API**: the server asks for "the POIs around this anchor", the client caches and renders them as map markers with typed metadata, fulfillment types and Eats-style filters. For a parcel app this is the shape of *"show me the nearby shops / drop-off points / pickup boxes on the map"*, with the client owning a **cache** rather than re-fetching. **[I]** — the names and model shapes are observed; the wire contract is not read.

### 4.2 **[O] New generated server-contract packages (`com.uber.model.core.generated.*`)**

| Package | Net | Meaning |
| --- | --- | --- |
| `com.uber.model.core.generated.rider.product` | **+100 (new)** | A **product / vehicle-offer** contract family |
| `com.uber.model.core.generated.rider.presentation` | **+46 (new)** | A **presentation** contract family (what the client shows for a product) |
| `com.uber.model.core.generated.go.rider` | **+27 (new)** | "go" rider (a newer surface) |
| `com.uber.model.core.generated.amd.amdexperience` | +8 | Autonomous-vehicle experience models |
| `com.uber.model.core.generated.fraud.riskexperience` | +8 | Risk/fraud experience models |
| `com.uber.model.core.generated.go.tripexperience` | +4 | Trip-experience models |
| `com.uber.model.core.generated.edge.models` | +4 | Edge models |
| `com.uber.model.core.generated.rtapi.models` | +4 | rtapi models |
| `com.uber.model.core.generated.edge.services` | −47 | Edge service clients churned |

> **[I] Uber split its offer/product contract in two.** The repo's API study (`api-backend-contract-study.md` §1.5) describes rider-facing offers as *untyped* (`Map` bodies, `StatusResponse.scaledOffers`) and explicitly marks the payloads **[U]**. In 4.655 there is a dedicated **100-class `rider.product` package** — strongly suggesting product payloads are now **typed on the wire**. This is the single most consequential backend-contract change for the repo's open question. **[U]** The exact field set is not read here.

### 4.3 **[O] The error-union and gRPC patterns survive (new evidence for an old open question)

- `com.uber.model.core.generated.uber.maps.presentation.SearchGrpcApi` + `SearchGrpcClientImpl` present → the repo's §1.2 gRPC claim stands on a renamed-but-present class.
- `EPUDOSearchGrpcApi` + `EPUDOSearchGrpcClientImpl` present → the "enhanced PUDO" search surface now has a **dedicated gRPC client** (the repo only knew the EPUDO *model* classes). **[O]** present in both builds — **not new**; correcting a possible inference that it is.
- `com.uber.model.core.generated.rtapi.models` and the `*Errors` class pattern remain in the generated tree → the repo's §2.5 "hundreds of per-endpoint `*Errors` classes, builders throw on missing required fields, decoders keep unknown tags" pattern **[O]** still holds structurally, even though the exact count is not reproducible (see C20).

### 4.4 **[O] One API route removed, one added — the entire REST surface is otherwise identical

| Direction | Path | Evidence |
| --- | --- | --- |
| **−1** | `/rt/riders/dispatchconfig` | literal absent from 4.655 string pool; `com.ubercab.dispatch_config` package deleted (9 classes, 0 replacements) |
| **+1** | `/rt/payment/ubercashv2/getGiftingTopUpStatus` | new literal; `com.uber.gifting.payment` +12 net; `com.uber.ubercash.*` still present |
| +4 (non-API) | `/rt/unused/non-production-endpoint/submit{Verification,AccountLinking}{Start,Completed}` | new literals; same endpoint family as the repo's F14 Eats checkout flow |
| +1 | `/giftcards/purchase/pending` | new literal |
| +2 | `/proc/self/statm`, `/proc/self/status` | **not API paths** — `/proc` reads, caught by the path regex |

**Every one of the 67 route families is byte-count-identical except `/rt/riders/` (56→55) and `/rt/payment/` (63→64).** Families verified unchanged include: `/rt/eats/` 77, `/rt/safety/` 37, `/rt/safety-media-platform/` 24, `/rt/trips/` 27, `/rt/drivers/` 44, `/rt/users/` 25, `/rt/reservation/` 21, `/rt/gifting/` 21, `/rt/family/` 22, `/rt/emobility/` 20, `/rt/amd-experience/` 22, `/rt/membership/` 14, `/rt/transit/` 15, `/rt/group-ride/` 15, `/rt/business/` 15, `/rt/communications/` 15, `/rt/hcv/` 8, `/rt/shifts/` 6, `/rt/orders`-adjacent `/ramen/` 3, `/rt/navigation/` 7, `/rt/feedback/` 9, `/rt/receipts/` 7, `/rt/expensecodes/` 3, `/rt/payment/` 64, `/rt/cx/` 5, `/rt/consent/` 2, `/rt/privacypresentation/` 2, `/rt/identity/` 11, `/rt/webauthn-api/` 3, `/rt/silent-authentication/` 2.

> **This is the strongest validation the repo could ask for.** The API contract study's route table (`api-backend-contract-study.md` §1.0–§1.9) is **95 %+ accurate for 4.655** — every one of the 145 route literals I tested that is still present is present, and only one documented route was dropped.

### 4.5 **[O] New URLs (6) — all `tb-static.uber.com` content CDN

```
https://tb-static.uber.com/prod/mobile-content-public/reserve/airport_pickup/curbside.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/airport_pickup/meet_and_greet.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/illicons/child_seat.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/illicons/booster_seat.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/illicons/pet_collar.png
https://tb-static.uber.com/prod/mobile-content-public/Premium%20Reel%20Vertical%206mb.mp4
```
Removed: `https://cn-dc1.oojoovae.org,https://cn-dc1.uber.com` and `https://cn-geo1.uber.com/static/mobile-content/mobility-growth/dispatch/fact_default.png`.
> **[I]** The reserve/curbside/meet-and-greet/child-seat/booster-seat/pet-collar imagery is **curbside pickup** support — directly the "venue access point" problem Wind will hit on dense Palestinian streets.

### 4.6 **[O] Architectural change: the Dagger `$Dependencies` graph was replaced

| | 4.654 | 4.655 |
| --- | --- | --- |
| `*ScopeImpl$Dependencies` interfaces | present | **2,001 removed, 2 added** |
| Replacement shape | — | **nested host interfaces on the logic class**, e.g. `com.ubercab.presidio.app.core.root.LegacyRootLogic$EleLaunchHost`, `$LocationPermissionHost`, `$LogoutHost`, `$StatusBarColorsHost` |
| `dev.zacsweers.metro` classes | 0 (not in repo evidence) | **2** (`Provider`, `internal.Factory`) — present in `META-INF/dev/zacsweers/metro/*` |

> **[O]** This is why the raw class diff shows "97,295 added / 97,529 removed" — almost all of it is DI-codegen churn, **not** feature churn. **[I]** Uber moved generated scope wiring off Dagger-style `$Dependencies` interfaces toward a Metro/wiring-graph style. **[U]** Which framework generates the new scopes is not established here (`dev.zacsweers.metro` has only 2 classes in the APK, so Metro is present but not yet the whole graph).

> **Actionable for Wind:** any future comparison against the repo's class counts **must** exclude `$Dependencies`-suffixed classes, or it will report a false ~2,000-class regression. The repo's own `com.uber.payment` figure is the clean example: 36 classes "removed" — **34 are `$Dependencies`**, 2 are obfuscated `di.b`/`di.c` renames. The payment provider framework is **intact**.

### 4.7 **[O] The Arabic split is fully cash-capable — Wind's core model

`split_config.ar.apk`: **9,523** unique UTF-8 strings in the pool; **12,709** string/plural resource entries parsed. Observed Arabic values (resource key → Arabic value), with the English resource name as the anchor:

| Resource | Arabic value | English gloss |
| --- | --- | --- |
| `cash` | `الدفع نقداً` | "Pay in cash" |
| `cash_change_plus_one_message` | `ادفع نقداً في نهاية هذا المشوار، وسيُضاف المبلغ المتبقي المستحق لك إلى حسابك لاستخدامه في مشوارك القادم. أو يمكنك استعادته من خلال PayPal.` | Pay cash at end of trip; remaining balance is credited to your account for your next trip, or refunded via PayPal |
| `cash_charge_modal_disclaimer` | `من المتوقع أن تدفع المبلغ الإجمالي نقداً إلى السائق في نهاية مشوارك التالي` | You are expected to pay the total in cash to the driver at the end of your next trip |
| `connect_cash_arrears_disclaimer` | `إذا لم يتم الدفع نقداً بالكامل، فستكون مسؤولاً عن تسوية عملية الدفع قبل مشوارك القادم.` | If not fully paid in cash, **you are responsible for settling the payment before your next trip** |
| `eats_cash_charge_modal_disclaimer` | `تأكد من أن لديك ما يكفي من النقود لدفع المبلغ الإجمالي الجديد عند توصيل طلبك، وإلا فقد يتم إلغاؤه.` | Make sure you have **enough cash** to pay the new total **when your order is delivered**, otherwise it may be cancelled |
| `eats_spender_arrears_payment_pay_with_cash` | `ادفع نقداً عند الاستلام` | **Pay cash on delivery** |
| `cash_change_plus_one_title` | `تذكَّر أن السائق لا يقدم المبلغ المتبقي عند الدفع نقداً` | Reminder that the driver does not give change on cash |
| `hcv_ticket_details_payment_info_row_cash_subtitle` | `الدفع نقداً` | Pay in cash |
| `connect_checkout_delivery_item_size_details_title` | `تفاصيل الطرد` | **Parcel details** |
| `connect_delivery_time_details_header` | `موعد التوصيل` | Delivery time |
| `connect_delivery_radius_error_message` | `هذا المطعم خارج نطاق خدمة التوصيل. يُرجى تجربة مطعم آخر.` | This restaurant is outside the delivery service area |
| `connect_checkout_delivery_speed_changed` | `تم تحديث وقت التسليم في تفاصيل خدمة التوصيل` | Delivery time updated in delivery-service details |
| `add_pickup_placeholder` | `موقع الالتقاء` | Meeting/pickup point |
| `address_entry_pickup_edit_action` | `أدخِل موقع الالتقاء أو اختر موقعاً من القائمة` | Enter pickup point or pick from the list |

> **[O] Uber's own Arabic product copy already models exactly Wind's business**: cash-on-delivery, **cash arrears** carried as a debt to the next trip, a **no-change** reminder to the rider, delivery-service-radius rejection, and a **parcel-size** ("الطرد") checkout detail. Wind's Arabic UX can be lifted as a tested translation set — including the awkward, important cases (arrears, no change, out-of-area).

**[O]** `res/drawable-ldrtl/` (7 files) exists in base — right-to-left *drawable* qualifiers ship in base; the *string* RTL story is handled by the `ar` split, which carries both `(ar)` and `(ar-rSA)` variants for every entry observed.

### 4.8 **[O] Other measured movements

| Surface | 4.654 | 4.655 | Δ |
| --- | --- | --- | --- |
| `com.ubercab.helix.venues` | 303 | 206 | **−97** |
| `com.uber.reserve.tripedit` | (small) | +48 | **+27** net |
| `com.ubercab.emobility` | 628 | 580 | −48 |
| `com.ubercab.help` | 1,383 | 1,311 | −72 |
| `com.ubercab.presidio.realtime` | 147 | 113 | −34 (34 `active_trip` provider classes removed; 113 remain) |
| `com.ubercab.presidio.app` | 3,194 | 3,112 | −82 |
| `com.uber.app_ramen_polling` | 8 | 8 | **0** — realtime/Ramen polling intact |
| `com.uber.mapdisplay_framework` | — | — | **0 added, 0 removed** — the entire map display framework is unchanged |
| `com.uber.map_hub_common` | — | — | **0 added, 0 removed** — route/map-hub common types unchanged |
| `androidx.compose` | 1,134 | 1,140 | +6 |
| `com.slack` | 21 | 16 | −5 |
| URLs in string pool | 479 | 483 | +4 net (6 added, 2 removed) |
| SQL statements | 482 | 484 | +2 |
| Path templates | 67 | 67 | 0 |
| Parameter namespaces | 154 | 154 | 0 new namespaces |

> **[O] The map display framework (`com.uber.mapdisplay_framework`) and the map-hub common types (`com.uber.map_hub_common`) are byte-for-byte unchanged in class composition.** This is the single most important reassurance for the repo's map inventory: Uber did **not** re-architect the map layer in this release.

---

## 5. Evidence table

Each row: the exact command, the tool-output anchor, and the repo file:line it corrects or extends.

| # | Command (run 13 Nov 2026) | Tool-output anchor | Repo file:line | Effect |
| --- | --- | --- | --- | --- |
| E1 | `rea inspect-android-package uber-rider__base.apk --format json` | `normalized_result.{package_name,version_name,version_code,min_sdk,target_sdk,class_count,resource_count}` | `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:7-8`; `docs/CURRENT-WORK.md:61` | **Corrects** version to 4.655.10001 / 323547; resource_count 12,747; class_count 174,898 |
| E2 | `Get-FileHash -Algorithm SHA256 uber-rider__base.apk` | `BC0E06D3…32965C4` | `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:8`; `docs/HANDOFF-2026-11-01-maps-gps-and-uber-code-for-opus.md:225` | **Corrects** base SHA-256 and size |
| E3 | `apksigner verify --print-certs uber-rider__base.apk` | signer `4003231a…c268392`, source stamp `3257d599…3bbd6d` | `docs/CURRENT-WORK.md:61` | **Extends** — same key, same source stamp, new build |
| E4 | `Get-ChildItem apks\uber-rider__*` + `Get-FileHash` each | 10 splits, sizes + SHA-256 (table §1.2) | `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:60` | **Confirms** 10-APK delivery, same split names |
| E5 | `dex-inventory.py uber-rider__base.apk <tmp>` | `dex-inventory-summary.json` → `class_total` 288,493, `dex_count` 23 | `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:8`; `…-rider-app-facts.md:9` | **Corrects** 288,727 → 288,493 |
| E6 | `dex-inventory.py` + `dex-classes.txt.gz` set diff | added 97,295 / removed 97,529; 2,001 removed are `$Dependencies` | `docs/KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md:5` (counting basis) | **Extends** with the DI-codegen caveat |
| E7 | `dex-inventory.py` 2-segment histogram, both builds | `com.uber` 102,376→101,489; `com.ubercab` 23,294→22,300 | `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:22` | **Corrects** first-party counts |
| E8 | `dex-inventory.py` `dex-api-paths.json`, both builds | 1,406 → 1,413 literals; `dispatchconfig` removed; `ubercashv2/getGiftingTopUpStatus` added | `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md:60-62` | **Corrects** route census; **extends** §1.8 |
| E9 | `dex-inventory.py` `dex-api-paths.json`, 67 prefixes, both builds | every family identical except `/rt/riders/` 56→55, `/rt/payment/` 63→64 | `api-backend-contract-study.md` §1.0–§1.9 | **Confirms** the whole route table |
| E10 | `dex-inventory.py` class list, `com.ubercab.dispatch_config.*` | 9 removed, 0 added | `api-backend-contract-study.md:187-188, :205` | **Corrects** — dispatch-config feature deleted |
| E11 | `dex-inventory.py` class list, `com.uber.maps.mapsexperiencepresentation.*` | 41 added, 0 removed | *no repo coverage* | **Adds** — new POI-on-map layer |
| E12 | `dex-inventory.py` class list, `com.uber.mapssdk.poi.*` | 11 added, 0 removed | *no repo coverage* | **Adds** — client POI cache/service |
| E13 | `dex-inventory.py` class list, `com.uber.model.core.generated.rider.product.*` / `.rider.presentation.*` | +100 / +46, both new | `api-backend-contract-study.md` §1.5 (offers untyped, **[U]**) | **Extends** — product payloads likely now typed |
| E14 | `rea search-android-classes uber-rider__base.apk "" --format json` | `normalized_result.total_classes` = 174,898 | `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:272` | **Corrects** inventory-view count |
| E15 | `rea inspect-android-class … com.ubercab.android.map.compose.internal.MapProvider` | `fields`: `UBER`, `GOOGLE`, `UNKNOWN`, **`FALLBACK_MAP_PROVIDER`**; `methods`: `access$getFALLBACK_MAP_PROVIDER$cp` | `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:23` | **Extends** — provider enum gains a static default |
| E16 | `dex-inventory.py` class list, 82 repo-cited map FQNs | 80/82 present verbatim | `map-capability-inventory.md` §1–§12 | **Confirms** the map inventory wholesale |
| E17 | `dex-inventory.py` class list, `com.ubercab.android.map.UberMapView.*` | 26 classes | `map-capability-inventory.md:9` (honesty note) | **Corrects** — the class exists; the 4.654 absence was a decompiler artifact |
| E18 | `dex-inventory.py` class list, `com.uber.maps.presentation.AccessPointGroup*` | `AccessPointGroup` + `$Builder` now materialise | `map-capability-inventory.md:10` (honesty note) | **Corrects** — the decompile gap is closed |
| E19 | manifest text parse (both builds) | 48 unique permissions / 50 lines, **identical sets** | `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md:72`; `docs/RESEARCH-2026-10-31-…:37` | **Corrects** 46 → 48, for both builds |
| E20 | manifest text parse (both builds) | 109 vs 110 components; `com.squareup.picasso.PicassoProvider` removed | `docs/KNOWLEDGE-2026-10-31-uber-rider-app-facts.md:44` | **Corrects** 110 → 109 |
| E21 | manifest text parse (both builds) | exported 26, filters 89 (72 on exported), autoVerify 38, hosts 35, schemes 23 — all identical | `docs/KNOWLEDGE-2026-11-01-uber-app-screens-and-design-system.md:37` | **Confirms** |
| E22 | `aapt2 dump resources uber-rider__split_config.ar.apk --locales ar` | 9,523 pool strings; 12,709 parsed entries; `cash` = `الدفع نقداً` | *no repo Arabic-value coverage* | **Adds** — cash-on-delivery Arabic copy |
| E23 | `aapt2 dump resources uber-rider__base.apk` | `type string id=14 entryCount=15335`; exactly **1** string table | `docs/KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md:85`; `…-features-and-requirements.md:56` | **Confirms** "no language tables in base"; count differs on tool basis |
| E24 | ZIP `res/` scan | `res/drawable-ldrtl/` (7 files), **no** `values-ldrtl` | `docs/KNOWLEDGE-2026-11-01-uber-app-screens-and-design-system.md:75` | **Corrects** `values-ldrtl` → `drawable-ldrtl` |
| E25 | `assets/parameters.json` parse + repo `parameters-registry-summary.json` diff | 14,516 → 14,572; bool 7,258→7,281; pluginSwitch 3,372→3,379; `FEATURE_FLAG` 5,467→5,457; `BUG_FIX` 1,517→1,546 | `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md:55` (N8) | **Corrects** |
| E26 | `assets/parameters.json`, repo's 400-entry `map_location_geo_parameters_sample` diff | `mapdisplay_flipr_enable_stencil_clip_interleave` removed; `connect_location_editor_compose_migration` removed; 3 location-editor plugin switches false→true | `map-capability-inventory.md:198` (§8 location editor); `:32` | **Corrects/extends** |
| E27 | `assets/parameters.json`, all `mapdisplay_*` keys | `frame_rate`=0, `render_frame_allocator_capacity`=10485760, `tile_overlay_cache_size`=24, `tile_query_cache_size`=131072, `stylesheet_path`=tc2 URL — all unchanged; ~12 new map flags | `…-features-and-requirements.md:49-50` (N2/N3); `map-capability-inventory.md:26` | **Confirms** + **extends** |
| E28 | ZIP `lib/*` scan across arm64 splits | 13 + 1 + 1 libs, same set as repo | `…-features-and-requirements.md:40` (F26), `:54` (N7), `:59` (N12) | **Confirms** native surface |
| E29 | `rea decode-android-resources … --locales ar` | `capability_unavailable … apktool launcher was not found` | — | **Gap** — method note (§6) |
| E30 | `rea inspect-signature uber-rider__base.apk` | `provider_id: native-macos … require macOS` | — | **Gap** — method note (§6) |
| E31 | `rea inspect-android-class … com.ubercab.android.map.CameraUpdate` | `fields`: 10 repo constants + `DEFAULT_ANIMATION_DURATION_MS : long` + **`TEST : int`**; 11 accessors | `map-capability-inventory.md:43` | **Confirms + extends** (C21) |
| E32 | `rea inspect-android-class … com.ubercab.android.map.camera.calculating.SemanticZoom` | `fields`: `zoomInLevel : double`; `methods`: `compareTo`/`compareTo2`; class list shows `SemanticZoom$WORLD`…`$ANTS`, `$CUSTOM` | `map-capability-inventory.md:48` | **Confirms + extends** (C22) |
| E33 | `rea inspect-android-class … com.uber.maps.presentation.AccessPointIntent` | 5 `ACCESS_POINT_INTENT_*` + `UNRECOGNIZED` + `internalValueMap: com.google.protobuf.Internal$EnumLiteMap` | `map-capability-inventory.md:211` | **Confirms** (C23) |
| E34 | `rea inspect-android-class … com.uber.maps.presentation.AccessPointUsage` | 10 `ACCESS_POINT_USAGE_*` incl. `PACKAGE_PICKUP`/`PACKAGE_DELIVERY` + `INVALID` + `UNRECOGNIZED` | `map-capability-inventory.md:212` | **Confirms** |
| E35 | `rea inspect-android-class … com.ubercab.rider_map_common.map_hub.CameraManagerWorker` | `fields`: **empty**; `methods`: `getType(): CameraManagerWorker$a` only | `map-capability-inventory.md:72` | **Corrects the mechanism** — no 10-value enum (C24) |
| E36 | `rea inspect-android-class … com.ubercab.android.map.compose.internal.MapProviderConfigurationModel` | `initialMapProvider: String`, `fallbackMapProviders: List<String>`, `missingProviderDefault: String`, `JSON`, `$childSerializers` | `map-capability-inventory.md:24` | **Confirms** |

---

## 6. Unknowns and limits — what this artifact cannot establish

1. **No runtime, no traffic, no server.** Every statement here is from a static artifact. Nothing here states what Uber's backend does, what a server returned, or how the app behaved on a device. Any behavioural phrasing in this file is explicitly marked **[I]** or **[U]**.
2. **Decompiled output is a derived representation.** JADX reconstructs Java from bytecode; it can mis-restore code, drop members, and fail on some constructs (the repo documented exactly this for `AccessPointGroup` and the `com.uber.map_hub.*` package — the first of those gaps is now closed in 4.655, the second was not re-tested). Class *presence* is strong evidence; method *bodies* are not.
3. **The 4.654 baseline is a repository artefact, not a re-pull.** The old APK is gone from this machine. Name-level diffs use the repo's archived class list and API-path JSON. If the archive were produced by a differently-versioned tool, some movement could be tool-induced rather than build-induced. Mitigations used: identical script (`dex-inventory.py`) on both sides for everything numeric; identical manifest-text parse on both sides for the manifest; and the *signer fingerprint* (byte-identical) as an independent confirmation that the two artifacts are the same application.
4. **R8 re-obfuscation dominates the raw diff.** ~97 k class names changed because the short-name roots (`a01`, `a92`, `a94`, …) were re-assigned. Only `com.uber.*` / `com.ubercab.*` / `androidx.*` / vendor namespaces carry signal. Anyone diffing Uber builds must filter to those namespaces and to non-`$Dependencies` names, or they will report thousands of false changes.
5. **Runtime configuration is invisible.** The parameter registry ships *defaults*; Uber's servers override them per launch and per user. `mapdisplay_flipr_available_map_providers` in the APK is not what a user in Palestine would get.
6. **Entitlement-gated features cannot be distinguished from absent ones.** `com.uber.amd-experience` classes exist but the AV experience may be unavailable outside a handful of cities; `com.uber.transit_ticket` (Masabi JustRide) exists but is US-only. Static presence ≠ shipped behaviour. The repo already flags this for Masabi (`assets/*.justrideconfig`).
7. **Split-set interactions are not established.** The base declares providers/permissions; the BarcodeScanner, VoipTwilio, GooglePaySdk and FlashNacional splits contribute their own code and their own manifest fragments. This study inventoried the splits' *sizes, hashes and native libs* but did **not** decode each split's manifest, so the merged 10-APK manifest — which is what Android actually installs — was not reconstructed. **`exported` components contributed by splits are therefore not counted here.**
8. **The Arabic split was read as a resource table, not as a merged runtime.** The `ar` split's strings are the base's string *keys* localised; base-only and split-only key sets were not differenced against each other (the base has no language table, so the split is the authoritative Arabic set).
9. **Constant and enum *values* were not read** for `CameraUpdate`, `SemanticZoom`, `CameraManagerWorker`, `AccessPointIntent`, `AccessPointUsage`, `MapProvider.FALLBACK_MAP_PROVIDER`, `FloatingPlacementScoreWeights`, `FuzzedLatLng`'s radius, or `MapElementHitTester`'s 16 dp tolerance. Each is listed as *not verifiable statically in this session* rather than asserted.
10. **The `w46` error-union root was re-obfuscated**, so the repo's `743` / `839` error-class counts cannot be reproduced against 4.655 on the same basis. Only the *pattern* was verified.
11. **Not re-verified from this build:** the repo's IPC allowlist / caller-validation claims (`com.uber.identity.devicesessions.contentprovider.DeviceSessionsContentProvider` is still exported in the 4.655 manifest — the repo's security posture claims stand as stated for the manifest layer, but the *code-level* validation was not re-read), the screenshot blocker, `libse` internals, and the JustRide configs.
12. **No device was touched.** No adb, no install, no runtime capture, no screenshot. The owner's phone was not involved at any point.

---

## 7. One-page brief for Wind

**What did not change (and therefore still governs the repo's designs).** The map layer. `com.uber.mapdisplay_framework` and `com.uber.map_hub_common` have **zero** class-level change; **80 of the 82** map classes the repo cites are present verbatim with the same FQNs; the provider enum still has exactly `UBER`/`GOOGLE`/`UNKNOWN`; every map performance knob (`frame_rate`, `render_frame_allocator_capacity`, tile caches, stylesheet URL) is byte-identical; the native engine (`libubermaps-gl.so`) and its bridge are unchanged; the gesture set, the camera-intent model, the alpha-divider polyline, the epoch-stamped vehicle path and the slerp glide are all still there. **The repo's map capability inventory is safe to build against.** The only addition is a fourth, code-level default provider (`MapProvider.FALLBACK_MAP_PROVIDER`) and ~12 new map flags.

**What changed (and what it means).** The backend contract, not the map. Uber (a) **typed the product/offer wire format** (`rider.product`, 100 new generated classes) which closes the repo's biggest open `[U]`; (b) **deleted the dispatch-config feature** end-to-end (route + 9 classes); (c) **added a server-driven POI-on-map surface** (`mapsexperiencepresentation` + `mapssdk.poi`); and (d) **added Uber Cash v2 gifting top-up**. The REST surface is otherwise untouched — 65 of 67 route families byte-identical.

**What Wind should copy.** The Arabic cash-on-delivery copy set (§4.7) — including **cash arrears** (a debt carried to the next trip), **no-change** handling, and the **parcel-size** checkout detail — is a complete, tested translation of a cash-first delivery business. Uber's `connect_*` resource family (`connect_cash_arrears_disclaimer`, `eats_cash_charge_modal_disclaimer`) is the closest shipped precedent to Wind's actual model. The `mapsexperiencepresentation` shape (server asks for POIs around an anchor; client caches and renders them as typed markers) is the right shape for "show nearby pickup points / drop-off boxes on the map".

**What Wind should ignore.** The two-engine map fallback (Uber still pays for two engines; Wind should not), the RIB/Metro/Dagger DI machinery, and the reservation/venue/airport surfaces that shrank in this release.

---

*Generated by static REA of `com.ubercab` 4.655.10001 on 13 November 2026. All numbers come from tool output produced in that session; the baseline is the repository's archived 4.654.10002 evidence. No Uber system was contacted and no device was touched.*
