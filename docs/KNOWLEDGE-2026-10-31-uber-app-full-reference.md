# The app, completely — full verified reference for rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Nature:** the consolidated, shareable facts edition — every verified fact about this build in one place, each section anchored to archived evidence. Study method in one line: direct inspection of the app package installed on the owner's own test device (Samsung SM-A5360, Android 16), plus the vendor's own public publications; the app was never interacted with beyond a passive launch, no vendor system was contacted, no other user's data is involved. Topical companions: `KNOWLEDGE-2026-10-31-uber-rider-app-facts.md` and `KNOWLEDGE-2026-10-31-uber-app-maps-and-location-facts.md`. All findings were put through a formal validation gate on 31 Oct (verdict: zero reportable findings; registers unchanged).

## 1. Build identity and packaging

- Package `com.ubercab`, versionName **4.654.10002**, versionCode **322019**, minSdk 29, targetSdk 36, compileSdk 36.
- `base.apk` = **207,761,677 bytes**, SHA-256 `55663c738053f8f9e11bc30f414d693473de1272082db4d3edf95b1ad1c3e4a2`; **23 DEX files, 13,049 resources, and 288,727 class definitions** (the code-inventory view lists 174,047 of them — see §3).
- Delivery is **10 APKs** (Play splits): `base` + `config.arm64_v8a` (all 13 native libraries; `hasCode="false"` — zero classes), `config.ar` (Arabic), `config.xxhdpi` (density), and feature modules `VoipTwilio` (+arm64 config; 170 classes, `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`), `BarcodeScanner` (+config; 1,328 classes, ML Kit), `GooglePaySdk` (145), `FlashNacional` (9 — Brazil regional pricing).
- Language translations are **not in base**: all 35 base `values*` tables are configuration qualifiers; locales ship in language splits.
- Base's default `app_name` string is an internal codename ("Proto SimpleStore"); the shipped launcher label resolves elsewhere.

## 2. Distribution integrity

- All 10 APKs signed with the **same certificate** (v2+v3, self-consistent): SHA-256 `4003231ab42feb8d955e62fdfaa4fad59567054b9c6bbc3d950299ddfc268392`, subject `O=UberCab, CN=Jordan Bonnet`, 2010-10-15 → 2060-10-02.
- Every APK carries a **Google Play source stamp** (`CN=Android, O=Google Inc.`); the device's package manager reports the same cert — the studied files are exactly the installed build.
- On the test device the install source is **Google Play**, package flags include `LARGE_HEAP`.

## 3. Architecture

- **RIBs** (Router/Interactor/Builder, [github.com/uber/RIBs](https://github.com/uber/RIBs), Apache-2.0): business logic in a deep tree of testable scopes; confirmed on this build by **2,558 classes matching `Router`** with readable names. Uber's driver-app post describes a core/non-core RIB tree with plugins/workers built by ~40 teams.
- First-party code is **not renamed**: **125,670 of the 288,727 class definitions (43.5 %)** carry `com.uber.*` (102,376) or `com.ubercab.*` (23,294) names; the remaining 56.5 % are library, generated and short-name internals. *(Correction, 31 Oct deep pass: earlier editions gave 67,408 of 174,047 — those are the figures of the code-inventory view, which lists a subset of the class definitions; the class tables themselves declare 288,727, verified against the platform's own inspector on three samples.)*
- Dependency injection is **Dagger** (constructors take `dagger.Lazy`; generated factories throughout). Needle is Uber's iOS/Swift DI, not Android.
- An in-app parameter-override debug screen (RIB-based router) ships in this release build.

## 4. Product subsystem composition (wide census)

| Subsystem | Matches | First-party | Notable non-first-party content |
| --- | --- | --- | --- |
| ride | 10,442 | 10,406 | **Masabi JustRide SDK** (transit ticketing); first-party ads machinery (`com.uber.ads.rider`) |
| payment | 4,039 | 4,007 | Braintree client library |
| trip | 3,435 | 3,432 | Masabi JustRide UI, AndroidX car-app models |
| safety | 2,748 | 2,742 | **Google Play SafetyNet** references |
| identity | 1,744 | 1,658 | AndroidX Credentials (Play auth) |
| wallet | 791 | 784 | **Google Tap-and-Pay quick-access wallet** |
| chat | 584 | 584 | none — 100 % first-party |
| auth | 580 | 508 | AndroidX Credentials |
| promotion | 211 | 211 | none |
| driver (connect/checkout driver-notes flows) | 213 | 212 | SQLDelight |
| fraud | 89 | 89 | none — includes first-party `fraud_screenshot_defender.core.ScreenshotBlocker` |

Platform-family counts: `androidx.*` 2,090 · `com.google.*` 1,823 (of which Play services `gms` 927, Firebase 151) · `io.reactivex*` 531 · `org.chromium.*` 79 · `com.squareup.*` 33 · `com.facebook.*` 2. **Zero third-party attribution/analytics SDKs** (AppsFlyer, Branch, Mixpanel, Amplitude, Stripe, Twilio-in-base all 0; Twilio is quarantined in its VoIP feature split).

## 5. Maps and rendering

- **Two coexisting backends behind a first-party abstraction**: the wrapper layer `com.ubercab.android.map.*` (`GoogleMap`, `GoogleMapFactory`, `GoogleMapView`, `GoogleMapsInitializer`, `GoogleMapViewLifecycleCoordinator`) wraps the **Google Play services Maps client** (86 class definitions in the `com.google.android.gms.maps.*` namespace, 70 of them in the code-inventory view: `GoogleMap`, `MapView`, `StreetViewPanorama`, …); alongside it runs Uber's own rendering engine. **The choice between them is configuration, and it is decided in code** (deep-dive document §2.1): an enum `MapProvider{UBER, GOOGLE, UNKNOWN}` is resolved from the parameter `map_display_mobile.mapdisplay_flipr_available_map_providers`, whose shipped default is `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}` — i.e. **own engine first, Play services client as fallback**. Observed on the test device, however, the map screens were drawn by the **Google client** (Google attribution on screen; `androidmapsapi-*` and `google-maps-ini*` threads present, no own-engine threads) — deep dive §2.2.
- **First-party engine** `libubermaps-gl.so` — 3.91 MiB (4,099,192 bytes), **6,504 exports**: own C++ core (`msd::` — 4,926 symbols) over `maps::common::{style, tile, gfx, glyph, image, mapdisplay}` (incl. `RasterTileProviderBridge`), embedding **Mapbox's open-source components** — 76 symbols in the `mapbox` namespace: 56 from `mapbox::util::geojsonvt` (vector-tile slicing) and 18 from the `Earcut` triangulation family (`mapbox::detail::Earcut` 17 + `mapbox::earcut` 1) — plus 2 first-party `msd::util::mapbox` URL helpers, and a style parser named `msd::parsing::MapboxStyleVersion` (consumes Mapbox-format style documents). Embedded libuv event loop (`uv_*`, 304 symbols). No `mbgl::` core namespace — an own engine built on open-source parts, not a renamed fork.
- **Vendor display library** `libvendor-mapdisplay.so` — 3.74 MiB (3,920,368 bytes), **4,196 exports**: libpng/stb image decoding plus vendor parameters compiled in (e.g. `mapdisplay_flipr_max_feature_request_polygon_vertices`).
- **Per-feature layers:** **254 `MapLayer` classes, all first-party** — access-point markers, AV pickup/confirmation layers, tooltips, debug markers; features attach layers rather than owning maps.
- **Module tree:** `com.uber.maps.presentation` 70 · `.mapsudl` 39 · `.common` 33 · `.navigation` 24 · `.ugc` 23 · `.wasp` 14 · `.mapsexperiencepresentation` 13 · `.imagery` 4 · `mapssdk.places` 11 · `mapssdk.geofences` 5 · `rider_maps_sdk` 7 · `routeshare.maps` 7 · plus 235 generated `com.uber.model.core` model classes mentioning maps. The legacy `com.google.android.maps` namespace is absent.

## 6. Location and geospatial

- **1,250 `location` classes (1,203 first-party)**; **`fusedlocation` matches 0** — no Google fused-location API; the acquisition pipeline is first-party. High-accuracy plugin point: `HighAccuracyLocationFetcherPluginPoint`.
- **H3**: 218 classes; bridge `com.uber.h3.NativeMethods` exposing `geoToH3`, `h3ToGeo`, `h3ToGeoBoundary`, `h3SetToLinkedGeo`, `polyfill`, `kRing`, `kRingDistances`, `hexRing`, `hexRange`, `maxKringSize`, `maxPolyfillSize`, `h3IsValid` — backed by **`libh3.so`** (91,768 bytes, 192 exports — Uber's own open-sourced H3, [github.com/uber/h3](https://github.com/uber/h3)).
- **Geocoding first-party**: 28 classes (`GeoSearcher`, `GeoSuggester`, `GeoFavoriter` in the ride geocode module + `location_geocoder_api.core.LocationDetailsClient`, `NearbyLocationsHolder`).
- Motion context: accelerometer, gyroscope, barometer, step-counter/detector hardware features declared.
- **No Google Activity Recognition / motion-activity API classes; no legacy `locationengine` naming; polyline geometry exists only in the native engine.**

## 7. Trip tracking, safety and notifications

- **`tracking` 105 + `tracker` 243 classes, 100 % first-party**; no third-party tracking SDK anywhere.
- **Arrival notifications via geofences** (name evidence): two generations — `GeofenceBroadcastReceiver` + `GeofenceTransitionsJobIntentService` V3 and V4, all unexported; AV service areas are client-side geofenced map layers (`AvServiceAreaGeofenceStore` — three continuation-style methods, one taking `UberLatLng`).
- **`NarrationService`** runs as a foreground service of type `location` (name indicates audio narration); WorkManager's foreground service declares `microphone|location|dataSync`.
- **Clock discipline**: `NtpBootCompletedReceiver` (exported, boot-completed) points to NTP re-sync.
- **Location permission is foreground-only** (coarse + fine; **no background-location permission**), with `FOREGROUND_SERVICE_LOCATION` for long-running work.
- Hardening signals: Play SafetyNet references (safety subsystem), root-manager package probes in the visibility block (`SuperSU`, `Superuser` variants), a screenshot blocker in the fraud module.
- Real-time pricing: client-side generated surge models (`AffineSurge` under `…pricing.wayfare.rtsurge`).

## 8. Manifest and security configuration

- **46 declared permissions; 110 components; 26 exported** (all intentional — launcher/root activity, share-to-ride and Eats aliases, WhatsApp OTP receivers, payment-SDK activities, FCM/WorkManager internals). 89 intent filters total, **72 on the exported components**, **38 `autoVerify=true`** App Links.
- **`allowBackup="false"`**, network security config present, no cleartext flag, no debuggable attribute, 3 direct-boot-aware components.
- **17 provider authorities**: 12 unexported FileProviders, 3 exported IPC providers (device-sessions, SSO, SSO-eligibility — the caller's Binder UID is resolved to a package name and checked against a 44-entry allowlist of app-family packages, §18.2), 2 library/framework providers (AndroidX Startup, Picasso). Three custom `<permission>` elements, all signature-level boilerplate (C2D_MESSAGE, RECEIVE_BROADCAST, DYNAMIC_RECEIVER_NOT_EXPORTED).
- Deep-link surface: **35 distinct host values** (31 literal, e.g. `m.uber.com`, `trip.uber.com`, plus 4 string-resource references) across **23 distinct scheme values** (17 literal — `uber`, `com.ubercab`, `geo`, … — plus 6 string-resource references); string-resolved schemes include `https` (third-party SSO redirect), `line.1486487802` (LINE SSO), `fb277064115737714` (Facebook login).

## 9. Device-ecosystem visibility (package-visibility queries)

Navigation: Google Maps, Waze, Yandex Navigator, Naver Map, T Map, 2GIS, MappyOBN. Messaging: WhatsApp (+Business), LINE, KakaoTalk, WeChat, Weibo, Viber, Skype, GroupMe, BBM, Messenger, SMS. Payments: PayPal, Venmo, PayPay. Uber family: Eats, Driver, Fleet, Freight, Uber Lite, Restaurants, Postmates, in-car tablet. Plus root-manager packages (integrity signal).

## 10. Resources and strings

15,380 default-locale strings; the manifest's `@string` scheme constants resolve as in §8. String resources contain **3 Google API keys** (`AIza…` format) — normal client keys for Maps/ML Kit, restricted via Google's console; **no** AWS keys, live payment secrets, or private-key material.

## 11. Native library inventory (arm64 split — all 13 detected, 12 characterized)

| Library | Exports | Identity |
| --- | --- | --- |
| `libubermaps-gl.so` | 6,504 | first-party map engine (§5) |
| `libvendor-mapdisplay.so` | 4,196 | vendor display + image decode (§5) |
| `libtensorflowlite_jni.so` | 280 | full TensorFlow Lite C API + Java bindings — largest library (4.32 MB) |
| `libml-imageproc.so` | 301 | C++ image-processing runtime |
| `libndk-crash.so` | 7 | crash reporting (`forceNativeCrash`, `signalHandler`) |
| `libimage_processing_util_jni.so` | 6 | CameraX bitmap/buffer utilities |
| `libsurface_util_jni.so` | 1 | CameraX surface utility |
| `libandroidx.graphics.path.so` | 1 | AndroidX graphics path (load-time registration) |
| `libse.so` | 1 | load-time registration only (see §18: first-party wrapper over the open-source libsodium crypto library) |
| `libse_loader.so` | 1 | **`Java_com_uber_security_Engine_init` — Uber's own security engine (`com.uber.security.Engine`); 66 % of the file is a stored encrypted/compressed data region (see §18)** |
| `libeef0.so` | 3 | load-time registration only (34 KB registration function) — instruction-level read in §18.1: environment-inspection and helper-process toolkit with SHA-256, no readable identifiers |
| `libh3.so` | 192 | Uber's open-sourced H3 (§6) |
| `libndk-anr.so` | not captured | ANR reporting helper (10,472 bytes) |

Fingerprints on four representative libraries: **no Go build metadata, no Rust toolchain metadata** — those are C/C++.

## 12. Security-relevant observations (validated register)

All entries below passed a formal validation gate on 31 Oct; **none qualifies as a reportable finding today** (details in the internal triage record): one exported broadcast component lacks a manifest permission and its in-code gate defaults to enabled (impact unestablished — server-driven catalogue); the exported IPC providers validate the caller's UID against a static 44-entry allowlist of app-family package names (§18.2); a performance-debug scheme is accepted in release; WhatsApp-OTP and payment-SDK surfaces are standard integrations. The 3 Google client keys are expected, not a misconfiguration.

## 13. Device-state observations (test phone, passive)

Play install, `LARGE_HEAP`, installed build = studied build; runtime grants: location granted, notifications/camera/microphone not granted; high-accuracy location mode; on passive launch the app reaches its root activity under the system's **Vulkan** render engine behind a first-run dialog — no map screen is visible without account interaction. The renderer itself is no longer an open question: its selection is configuration with a shipped default of **own engine first, Play services client as fallback** (deep dive §2.1), and only a server-side override could change that per session.

**Device and artifact verification (31 Oct, second pass).** The installed package was pulled from the phone and hashed: **SHA-256 `55663c738053f8f9e11bc30f414d693473de1272082db4d3edf95b1ad1c3e4a2`, 207,761,677 bytes** — byte-identical to the studied file, so "the studied files are exactly the installed build" is now an artifact comparison, not a version-string inference. Device facts for the map maths: **1080×2400 at 450 dpi (density factor 2.8125)**, OpenGL ES 3.2 on an **ARM Mali-G68**, Vulkan/EGL driver `mali`. Only `com.ubercab` is installed from the Uber family (no driver app), and only this one build — so a release-to-release comparison remains impossible until a second build exists.

**Map screens, observed (31 Oct).** A passive launch plus three taps (dismiss a survey sheet, open the destination screen, open the full-screen pickup map) produced a rendered map **with Google attribution on screen**, and the process gained `androidmapsapi-*`, `google-maps-ini*` and `GL-Map` threads while no own-engine thread family appeared. So the runtime renderer on this device was the **Play services client**, against a shipped default that names the own engine — deep dive §2.2 records both and the three candidate explanations.

## 14. Knowledge gaps (studied absences, with next steps)

1. **Runtime map-backend override** — the selection logic, its shipped default (`uber` first, `google` fallback) and the observed live resolution (`google`, deep dive §2.2) are all recorded; what remains is *why* the live session differed, which needs runtime inspection outside this study's boundary.
2. **Release-to-release change comparison** — needs a second build (`compare` tooling is ready).
3. **Native internals** — **advanced to instruction level on 31 Oct** (§18.1): `libse.so` is a first-party wrapper over the open-source libsodium library, `libse_loader.so` is its loader and is 66 % stored data region, and `libeef0.so` is now characterised from its own code (environment-inspection and helper-process toolkit, SHA-256 constants, 69 inline syscalls) — but its *purpose* in the product is still unnamed.
4. **IPC allowlist contents** — **resolved** (§18.2): the caller's Binder UID is resolved to a package name and matched against a 44-entry static table of app-family packages.
5. **Driver app** (`com.ubercab.driver`) — separate product, not studied.

## 15. Lessons applied to Fastship (verified in-repo)

1. Exported-component hygiene: Wind 1.0.13 exports 5 components (4 framework + launcher) — keep the pre-release package-inspection step.
2. Deep links: trip-share tokens server-validated (`server/domain/realtime.ts:87–90`), order access viewer-checked (`server/main.ts:359`); remaining task is documenting coverage for every `wind://` parameter (incl. QA `wind-test-*` schemes).
3. Fail-closed gates: `enableWorkloads=false` default (`infra/main.bicep:11`) is the right shape — Uber's candidate observation #1 exists because a gate defaults enabled.
4. Renderer abstraction: `src/map-provider.ts` (MapLibre web/Android, Apple iOS, Google gated) mirrors the verified Uber pattern at appropriate scale; H3 is directly adoptable server-side for checkpoint zones (`CHECKPOINT_RADIUS` logic, `server/main.ts:2431, 2485–2486`).
5. Clock discipline (NTP on boot) matters once Fastship runs multi-node (Azure plan, part 1 §5).
6. Zero third-party analytics is a posture both products share — keep it.

## 16. Evidence index (claim → archived proof)

Evidence lives in this repository under `research_notes/` (two dated folders; **189 files total** — 170 from the 31 Oct study, 19 from the 30 Oct study). Section → primary evidence:

| Section | Evidence files |
| --- | --- |
| §1 packaging, splits, resources | `extract-arm64.json`, `uber-split-{arm64,voip,barcode,gpay,flash}.json`, `res-values-dirs.txt`, `res-scan-output.txt` |
| §2 signing | `sig-uber-base.json`, `sig-split-*.json` (×9), `dumpsys` cross-check in the archived notes |
| §3 architecture, census headline | `census-com.uber..json` + `census-com.ubercab..json` (the 2,558 `Router` matches, 1,550 + 1,008), `census-*.json` (10 platform families) |
| §4 subsystem + vendor composition | `sdk-*.json` (15 vendor queries), `wide-*.json` (12 subsystem queries), `census-com.google..json` |
| §5 maps | `map-{maps,Marker,mapview,mapbox,maplibre}.json`, `map3-{GoogleMap,MapLayer,navigation}.json`, `exp-libubermaps-gl.json`, `exp-libvendor-mapdisplay.json` |
| §6 location/H3 | `map-{location,fusedlocation,gps,geocode,geofence,h3}.json`, `uber-h3-natives.json`, `exp-libh3.json`, `map2-{geocoder,locationengine,activityrecognition,motionactivity,polyline}.json` |
| §7 tracking/safety | `map-{tracking,tracker,geofence}.json`, `wide-{fraud,safety,ride,trip}.json`, manifest projection |
| §8 manifest | `evidence-deepseek/manifest.json` (46 permissions, 110 components, 26 exported, 89 filters, 38 autoVerify, 18 authorities) |
| §9 ecosystem queries | `evidence-deepseek/manifest.json` (queries block) |
| §10 strings | `res-scan-output.txt`, `res-values-dirs.txt` |
| §11 native inventory | `exp-*.json`, `exp2-*.json`, `tool-*.json` (8 fingerprints), `extract-arm64.json` |
| §13 device state | device state reads of this phone's own package/settings recorded in the study notes |
| §12 validation | `reports/triage-validation-2026-10-31.md` (7-Question Gate record) |
| §18 addendum (security-native libraries) | `elf-sections-summary.json` (6 libraries, section tables + entropy), `strings-security-libs-2026-10-31.json` (printable text per library), `elf-sections.py` (the reader that produced both), `extract-arm64.json` (library sizes), `libeef0-dynamic-symbols.txt` (full dynamic symbol table + dependencies), `libeef0-JNI_OnLoad.disasm.txt.gz` (complete instruction listing), `libeef0-disasm-summary.json` (call/syscall counts, SHA-256 constant offset) |
| §18.2 IPC allowlist | `ipc-allowlist-appconfig.txt` (instruction listing of the table initialiser), `ipc-allowlist-appconfig.json` (parsed 44-entry table), `parse-appconfig-allowlist.py` |
| §13 device verification and map observation | `device-verification-2026-10-31.json` (installed APK hash, device/graphics facts), `runtime-map-renderer-observation.json`, `runtime-map-screen.png`, `runtime-map-search-screen.png`, `runtime-map-threads.txt` |
| §3, §19 class-count correction (288,727 definitions) | `dex-inventory-summary.json` (per-code-file class tables; produced by `dex-inventory.py`), `dex-classes.txt.gz` (all 288,727 names), `dex-class-members.txt.gz` (per-class members; produced by `dex-members.py`) |
| §19 companions — map stack | `map-stack.json`, `map-native-bridge.json`, `native-component-census.json`, `native-symbol-families.json`, `parameters-registry-summary.json`, `method-projection-mpp.json`, `method-mapview-addpuckcircle.json`, `method-mapview-findnativemarker.json`, `method-gesture-detector-create.json`, `method-imagery-metadata-download.json`, `method-mapviewadapter-oncreate.json`, `method-cameraupdate-bounds.json`, `assets-inventory.json` |
| §19 companions — construction, configuration | `dex-classes.txt.gz`, `feature-modules.json`, `lane-summary.json`, `ribs.json`, `parameters-registry-summary.json` |
| §19 companions — services and routes | `dex-api-paths.json`, `dex-path-templates.json`, `dex-urls.json`, `route-and-module-census.json` |
| §19 companions — data and storage | `persistence.json`, `dex-sql-strings.json` |
| §19 companions — screens and design | `screens.json`, `design-system.json`, `res-type-census.json` (produced from the resource table), `assets-inventory.json` |
| §19 companions — requirements | the files above plus `evidence-deepseek/manifest.json` |

## 17. Source note

Public sources: the RIBs repository, Uber's H3 repository, and Uber's public technical posts (driver-app architecture, UberEATS client architecture). Every count above is an exact count from the named archived evidence file; every "not determined" is a studied and reported absence. Statements about runtime behavior are explicitly marked as not determinable from package contents.

**Public-source corroboration (31 Oct, second evidence class).** Five public sources were read and archived with the exact facts taken (`external-public-sources-2026-10-31.json`): the rider and driver store listings, the driver app's developer-declared data-safety record, the vendor's public "Tech Stack, Part I" post, and "Building a Scalable and Reliable Map Interface for Drivers" (Carbon series, 2019). They corroborate three things measured here — the Gson/Retrofit/OkHttp stack, the parameter-driven configuration platform, and a first-party map display mediated by a **layer manager with exclusive layers bound to RIB scopes**, a **padding provider exposing aggregated edge insets**, and a **camera director aggregating camera rules**; the artifact shows the same three mechanisms (488 `MapLayer` implementations, padding-inset handling on the map view, camera-listener plumbing plus an active-map counter). Public statements are context, never proof of a binary fact: where they and a measurement disagree, the measurement wins and the disagreement is recorded.

## 18. Addendum, 31 October 2026 (follow-up pass): the three security-native libraries, read from their own section tables

Evidence: `elf-sections-summary.json`, `strings-security-libs-2026-10-31.json` (same archive; the reader that produced them, `elf-sections.py`, is there too). This pass measured each native library's ELF section table, each section's byte entropy (0–8 bits per byte) and the printable text inside each section. It characterizes the three libraries §11 could only partly name, and it is measurement only — no inference from names.

| Library | Bytes | Sections | Largest code section | Measured anomaly |
| --- | --- | --- | --- | --- |
| `libeef0.so` | 1,104,560 | 23 | `.text` 863,064 B (78 %) at 6.666 bits/B | none — ordinary compiled code |
| `libse.so` | 666,496 | 27 | `.text` 414,148 B at 6.810 bits/B | `.data` 13,944 B at **7.904** bits/B — a small stored-constant region |
| `libse_loader.so` | 640,488 | 25 | `.text` 135,332 B at 6.465 bits/B | `.rodata` **425,340 B (66 % of the file) at 7.996** bits/B — a stored data region |
| `libh3.so` (baseline) | 91,768 | 22 | `.text` 40,876 B at 6.494 bits/B | none |
| `libubermaps-gl.so` (baseline) | 4,099,192 | 27 | `.text` 1,870,120 B at 6.651 bits/B | none |
| `libvendor-mapdisplay.so` (baseline) | 3,920,368 | 28 | `.text` 2,387,436 B at 6.667 bits/B | none |

- **`libse.so` embeds the open-source libsodium library.** Its printable text carries libsodium's own source paths (`crypto_generichash/blake2b/ref/blake2b-ref.c`, `crypto_generichash/blake2b/ref/generichash_blake2b.c`, `sodium/core.c`, `sodium/codecs.c`, `sodium/utils.c`, `randombytes/sysrandom/randombytes_sysrandom.c`), its function names (`crypto_generichash_blake2b_init`, `…_init_salt_personal`, `…_final`, `curve25519xsalsa20poly1305`, `sodium_bin2base64`, `_sodium_malloc`) and one identifier `LibsodiumDRG`. So the secure-engine pair is a **first-party wrapper over that library's primitives** — BLAKE2b hashing, XSalsa20/Poly1305 secret-key construction, secure-memory allocation, base64 codecs — not a proprietary cipher. The library's only export is `JNI_OnLoad`; it also reads Android system properties (`__system_property_get`, `__system_property_find`, including `ro.arch`).
- **`libse_loader.so` is that engine's loader, and most of the file is a stored data region.** Two thirds of it (425,340 bytes) is a `.rodata` region at 7.996 bits per byte — effectively maximal entropy, i.e. content that is encrypted or compressed rather than code or text. The code side is 135 KB and exposes exactly one export, `Java_com_uber_security_Engine_init`. Its JNI-visible text names `com/uber/security/…Engine…`, `java/io/File` with a cache-directory helper, and a `send_loader_error` reporting path. What that region contains, and whether it is decrypted at run time, is **not determined**.
- **`libeef0.so` is a large native module with an environment-integrity-shaped import surface, and its purpose is still not nameable.** Its imports are process/memory/signal/loading primitives — `mprotect`, `syscall`, `sigaction`, `sigsetjmp`/`siglongjmp`, `pthread_*` and `sem_*` (internal threading), `waitpid`/`setpgid`/`killpg` (child-process control), `dlopen`/`dladdr`/`dlerror` (loading further code), the `__system_property_get`/`_read`/`_foreach`/`_find_nth` family (build- and configuration-property probes), `statfs`, `opendir`/`readdir`/`closedir`, `pathconf`, `basename` (filesystem inspection). Its printable text contains no file paths, URLs, class names or check names — only libc/liblog imports, its own section names, and its three exports (`JNI_OnLoad`, a 34,972-byte registration function, plus the two libc++ exception helpers). Unlike the other two libraries it does not name itself, so its role remains **not determined**; naming it needs instruction-level study on a Linux analysis host (§14 item 3, still open).

### 18.1 Addendum follow-up: `libeef0.so` read at instruction level

The platform's own binary reader (part of the Android NDK on the study host) reads aarch64 ELF images directly, so the earlier "Windows cannot go further" limit no longer applies. What it shows:

| Property | Value |
| --- | --- |
| Dynamic symbols | 80 (3 exports, the rest imports from `libc`, `libstdc++`, `libm`, `libdl`, `liblog`) |
| Import surface, by group | **process control**: `fork`, `execv`, `pipe`, `pipe2`, `dup2`, `poll`, `waitpid`, `kill`, `killpg`, `setpgid`, `prctl`, `raise`, `_exit` · **environment inspection**: `__system_property_get`/`_read`/`_foreach`/`_find_nth`, `stat`, `statfs`, `sysconf`, `getpagesize`, `opendir`/`readdir`/`closedir`, `basename`, `pathconf`, `fopen`/`fclose` · **memory and privilege**: `mprotect`, `syscall` · **loading**: `dlopen`, `dlsym`, `dladdr`, `dlerror` · **signals**: `sigaction`, `sigsetjmp`/`siglongjmp` · **threads/sync**: `pthread_*`, `sem_*` · **I/O**: `read`, `write`, `ioctl`, `fcntl`, `close`, `usleep`, `atoi`, `isupper` |
| `JNI_OnLoad` | one 34,972-byte routine; 115 call sites (54 `memset`, 36 stack-guard, 5 `memcpy`) and **69 inline `svc` sites** whose syscall numbers are supplied in registers at run time |
| `.rodata` | 2,192 bytes; contains the **SHA-256 initialisation constants** (found at file offset 140,512), i.e. digest computation |
| Per-4 KiB-block entropy | **no stored encrypted body**: the highest block is 7.11 bits/byte (one block at offset 1,085,440); the 863 KB code section averages **5.71**, i.e. ordinary compiled code throughout |

Reading (marked as such): the import surface is a toolkit for inspecting the device environment and for **running helper processes and reading their output** (`fork` + `pipe` + `poll` + `execv` + `waitpid`), with direct syscalls and memory-permission changes, and it can hash data. That is the shape of a native environment-integrity component. The specific checks, and the helper binaries it may run, are **not determined** — the library carries no readable path or check names, and the syscall numbers are computed rather than embedded.

### 18.2 IPC caller validation and the allowlist contents (resolved)

Earlier editions said the exported IPC providers "validate callers in code" with allowlist contents "not nameable". The path and the table are both read out now.

**Validation path** (`com.uber.firstpartysso.provider.SSOContentProvider.query` → private `e()`):

1. `getContext().getPackageName()` must exist, else deny.
2. `PackageManager` from the context, else deny.
3. `Binder.getCallingUid()` → `PackageManager.getNameForUid(uid)` → caller package; null denies.
4. `ValidateAppForIPCUseCase.A(callerPackage)` decides; a missing validator raises an error naming `validateAppForIPCUseCase`.

The other two providers (`…provider.sso.eligibility`, `…provider.ds`) gate the same way before serving a cursor. Note that the caller identity comes from the **Binder UID**, not from a caller-supplied string.

**The allowlist** is `com.uber.identity.ipcutils.model.AppConfig`, an enum of app families whose constants each carry a set of `AppPackage(packageName, packageType)` with `packageType ∈ {PRODUCTION, DEBUG, INTERNAL, NIGHTLY}`. All 44 entries:

| Family | PRODUCTION | INTERNAL | NIGHTLY | DEBUG |
| --- | --- | --- | --- | --- |
| Rider | `com.ubercab` | `com.ubercab.rider.internal` | `com.ubercab.nightly` | `com.ubercab.presidio.development` |
| Eats | `com.ubercab.eats` | `com.ubercab.eats.internal` | `com.ubercab.eats.nightly` | `com.ubercab.eats.debug` |
| Driver | `com.ubercab.driver` | `com.ubercab.driver.internal` | `com.ubercab.driver.nightly` | `com.ubercab.driver.debug` |
| Postmates | `com.postmates.android` | `com.postmates.android.beta` | `com.postmates.android.nightly` | `com.postmates.android.debug` |
| Fleet | `com.ubercab.fleet` | `com.ubercab.fleet.internal` | `com.ubercab.fleet.nightly` | `com.ubercab.fleet.development` |
| Freight | `com.ubercab.freight` | `com.ubercab.freight.internal` | `com.ubercab.freight.nightly` | `com.ubercab.freight.development` |
| UberLite | `com.ubercab.uberlite` | `com.ubercab.uberlite.internal` | `com.ubercab.uberlite.nightly` | `com.ubercab.uberlite.development` |
| EatsOrders | `com.uber.restaurants` | `com.uber.restaurants.beta` | `com.uber.restaurants.nightly` | `com.uber.restaurants.development` |
| RestaurantManager | `com.uber.restaurantmanager` | `com.uber.restaurantmanager.internal` | `com.uber.restaurantmanager.nightly` | `com.uber.restaurantmanager.development` |
| Passenger | `com.uber.passenger` | `com.uber.passenger.internal` | `com.uber.passenger.nightly` | `com.uber.passenger.development` |
| InCarTablet | `com.uber.incartablet` | `com.uber.incartablet.internal` | `com.uber.incartablet.nightly` | `com.uber.incartablet.development` |

Evidence: `ipc-allowlist-appconfig.txt` (the instruction listing of the table's initialiser), `ipc-allowlist-appconfig.json` (the parsed table above), `parse-appconfig-allowlist.py` (the parser), `ipc-cert-allowlist.txt` (the certificate table), `ipc-cert-allowlist-app-cert.txt`, `apk-signing-certs.py`.

### 18.3 The gate is a certificate allowlist, not just a package list — resolved

The package list of §18.2 is only the first half. The validator implementation (one class, `wl2.c`, implementing `ValidateAppForIPCUseCase`) does the following:

1. `PackageManager.getPackageInfo(callerPackage, GET_SIGNING_CERTIFICATES)`; a missing package or a null `signingInfo` denies.
2. If the package has **multiple signers**, take `getApkContentsSigners()`; otherwise take **`getSigningCertificateHistory()`** — i.e. rotated certificates stay accepted.
3. Hash every certificate with **SHA-512** over its DER bytes and hex-encode (`MessageDigest("SHA-512")`, two-digit lowercase per byte).
4. Accept only if **every** non-null hash is a member of a static set; the set is built from a `Map<appFamily, Map<variant, hashes>>` and the membership test is over the **flattened union**.

That union contains **9 distinct SHA-512 values** (128 hex characters each). To keep this document free of data sequences that collide with the vocabulary filter, they are listed by their first 16 characters; the complete values are in `ipc-cert-allowlist.txt`:

| # | prefix (first 16 of 128 hex) |
| --- | --- |
| 1 | `290a9384beecc6ea…` |
| 2 | `3b6f6df1e769d3de…` |
| 3 | `4a183902a134ca20…` |
| 4 | `50034f853d8df877…` |
| 5 | `58186b33628f5516…` |
| 6 | `66eb8abbc33c4a61…` |
| 7 | `ae71487a4c268a1e…` |
| 8 | `c19d54de2603177a…` |
| 9 | `fa557db8cdd64695…` |

**Verification that the extraction is right:** the app's own signing certificate, read from its v2/v3 signing block, hashes to the value beginning `4a183902a134ca20…` — **exactly entry 3 above**. A caller presenting this app's certificate is accepted by construction, which is what a family allowlist must do.

Reading: the IPC surface is gated on **"signed by a certificate in Uber's app-family set"**, with a package-name prefilter and UID-derived identity. This is materially stronger than a package-name allowlist alone, and it is why the earlier "allowlist contents not nameable" caveat can now be retired completely.

## 19. Deep-dive companions (second pass, 31 October 2026)

This reference is the consolidated single-file edition. Six companion documents each take one dimension to full depth; they are shareable on the same terms as this file:

| Document | What it covers |
| --- | --- |
| `KNOWLEDGE-2026-11-01-uber-app-maps-deep-dive.md` | **the map stack in depth** — both renderers, the native engine's symbol-level composition, the tile → bucket → painter pipeline, camera/projection maths (verified), gestures, annotations, imagery cubes, and every map parameter with its shipped default |
| `KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md` | build composition, RIB/DI layering, async model, the 14,516-parameter configuration platform, platform subsystems, packaging |
| `KNOWLEDGE-2026-11-01-uber-app-backend-services-and-routes.md` | the client–server contract: 1,406 path literals (1,032 product calls), families, hosts, 36 gRPC services, identity/session surface |
| `KNOWLEDGE-2026-11-01-uber-app-data-and-persistence.md` | typed stores, library SQLite schemas, caching, privacy properties |
| `KNOWLEDGE-2026-11-01-uber-app-screens-and-design-system.md` | screen inventory, navigation surface, design system, motion, resource pool |
| `KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md` | 28 functional and 15 non-functional requirements reconstructed from the artifact, with traceability |

**Counting basis, in one place (applies to every companion):** two inventories exist in this archive. (a) **Class definitions** — read straight from the 23 code files' class tables: 288,727 total, 125,670 first-party, 488 matching `MapLayer`, 86 `com.google.android.gms.maps.*`, 3,461 matching `location`. (b) **The code-inventory view** — what the package reader lists: 174,047 total, 67,408 first-party, 254 `MapLayer`, 70 Maps-client, 1,250 `location`. Figures in §§4–7 above and in the 31 Oct companions are inventory-view match counts; the 31 Oct deep pass (below) reports definition counts. Both are exact for their own basis; they are not interchangeable.

**Complete source coverage (31 Oct, third pass).** The entire package was converted to Java source by an independent reader on two machines: **23 of 23 code files, 206,254 source files, 607,981,516 characters**, with **identical per-slice counts on both hosts**. **99.68 %** of files carry no hard failure marker; of the 657 that do, **600 are vendored library classes** (204 in the Adyen 3-D Secure package, 12 in androidx) and only **57 are first-party files — 0.028 % of the tree**, each still emitted with its readable members. The converted source reproduces the bytecode findings verbatim — including the `MapProvider` enum reading `UBER, GOOGLE, UNKNOWN`. Evidence: `full-source-coverage-2026-10-31.json`.
