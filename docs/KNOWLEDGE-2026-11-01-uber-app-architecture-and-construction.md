# Architecture, construction practices and configuration — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Edition:** second, deep pass · **Nature:** factual reference, shareable. All counts are exact counts read from the installed package's own code and resource tables; every figure cites the archived evidence file named at the end of its section (§12). Companion documents: the full reference (`KNOWLEDGE-2026-10-31-uber-app-full-reference.md`), the maps deep dive, the backend-services document, the data/persistence document, the screens-and-design document, and the features-and-requirements document.

**One correction carried from the deep pass.** The earlier inventory reported "174,047 classes" — that is the count the package reader's inventory settles on. A direct read of the 23 code files' own class tables gives **288,727 class definitions** (independently confirmed on three samples against the platform's own inspector). Both numbers are true statements about different things: 288,727 is what the files declare, 174,047 is what the code-inventory view lists. This document uses **288,727** as the denominator and says so wherever a share is given.

## 1. What the build is made of

| Property | Value |
| --- | --- |
| Package / version | `com.ubercab` 4.654.10002 (versionCode 322019; minSdk 29, targetSdk 36, compileSdk 36) |
| Delivery | 10 APKs: base + ABI + density + Arabic language + 4 feature modules (+2 module configs) |
| Code files | 23 (multi-dex), 288,727 class definitions; the files' own tables reference 1,376,645 methods and 925,286 fields in total |
| Resources | 13,049 resource entries in the base package across 22 types (§ screens-and-design document) |
| Native libraries | 13 (arm64), 2 of them the map engine, 1 the crypto engine, 1 H3, 1 TensorFlow Lite |
| First-party names | 125,670 class definitions (43.5 %) carry `com.uber.*` (102,376) or `com.ubercab.*` (23,294) names |
| Generated model layer | 65,152 class definitions under `com.uber.model.*` — JSON/protobuf/Thrift/gRPC models for the service contract |

Reading: the app is a **single large first-party codebase plus vendored infrastructure**, not a shell around third-party product SDKs. Two thirds of the definitions are generated or library code; the hand-written product surface is the `com.uber*` third.

## 2. Layering, as the names show it

| Layer | What the package shows | Class evidence (definitions, this build) |
| --- | --- | --- |
| Feature tree | RIBs (Router / Interactor / Builder) | 2,947 classes whose names contain `Router` (2,330 ending in it); 839 `*Interactor`; 15,001 `*Builder`; 358 `*Scope`; 836 `*Presenter` |
| Presentation | Views, view models, screen containers | 570 `*ViewModel`; 49 `*Activity`; 65 `*Fragment`; 47 `*Dialog`; 45 `*Controller` |
| Domain/service | Stores, providers, workers | 113 `*Store`; 937 `*Provider`; 157 `*Worker`; 2,959 `*Factory`; 13 `*Repository` |
| Model | Generated contract types | 65,152 `com.uber.model.*` |
| Platform | Maps, location, H3, security, crash | see §5 and the maps document |

The RIB pattern is not inferred from blog posts here: the class names and the `com.uber.rib.core` runtime (`RibActivity`, `CoreAppCompatActivity`) are in the package, and each feature area carries its own `...Router`, `...Interactor`, `...Builder` triple plus a Dagger provider for the scope.

## 3. Dependency injection

- **Dagger** is the injection framework: `dagger.Lazy` appears in constructors, `dagger.internal.Factory`/`Provider` are present, and every RIB scope has a generated `...RouterDaggerProvider` (for example `com.ubercab.presidio.profiles_feature.check_pending_invitations_flow.RiderCheckPendingInvitationsFlowRouterDaggerProvider`, which also declares a `ParentComponent`). Only 6 `dagger.*` classes ship, i.e. the graph is compiled, not reflected.
- Constructor injection plus per-feature `*Scope`/`*Module` types is the unit of wiring; a feature's scope is created by its router and torn down when the router is detached.
- 3,007 `*Factory` and 457 `*Provider` classes are the generated graph surface for those scopes.

## 4. Asynchronous and background work

| Mechanism | Presence | Numbers |
| --- | --- | --- |
| RxJava | `io.reactivex` | 1,107 classes (Schedulers, Observables, Flowables throughout the domain layer) |
| Kotlin coroutines | `kotlinx.coroutines` | 85 classes |
| WorkManager | `androidx.work` | 79 classes; 7 internal tables (`WorkSpec`, `WorkTag`, `Dependency`, `WorkName`, `WorkProgress`, `SystemIdInfo`, `Preference`) with SQL visible in the package |
| Threading configuration | parameter registry | thread-pool sizes are remotely tunable, e.g. `rider_foundations_mobile.critical_pool_location_thread_count` (default 1) |
| Foreground services | manifest | location, microphone, dataSync, mediaProjection types declared |

The app is **Rx-first with coroutines adopted in newer modules** — both are present in the same build, and both feed the same RIB interactors.

## 5. Platform subsystems inside the package

| Subsystem | Implementation in the package |
| --- | --- |
| Map rendering | own GL engine (`libubermaps-gl.so`, 6,504 exports) + Google Play services Maps client behind `com.ubercab.android.map.*` — see the maps deep dive |
| Tiles, glyphs, sprites | `RasterTileClient`, `VectorTileProviderBridge`, `GlyphProviderBridge`, `SpriteDelegate`, `DiskCacheClient` (Java side) over `maps::mapdisplay::*Bridge` (native side) |
| Location | first-party pipeline (no Google fused-location classes); `HighAccuracyLocationFetcherPluginPoint`; `upload-locations` route |
| Geospatial indexing | H3 (`libh3.so`, 192 exports) with `com.uber.h3.NativeMethods` bridge |
| Crypto | `libse.so` (open-source libsodium inside) + `libse_loader.so` (two-thirds stored data region) — full reference §18 |
| Integrity | device-integrity routes (`/rt/riders/verify-device-integrity`, `/rt/devices/*`), filesystem probes, screenshot blocker, Play Integrity references |
| Crash/ANR | `libndk-crash.so` (`forceNativeCrash`, `signalHandler`), `libndk-anr.so`, `com.uber.reporter` with 269 tunable parameters |
| Media | ExoPlayer 319 classes (video), Lottie 149 (animation), Coil 115 + Glide 206 (images), Masabi JustRide (transit tickets), ML Kit barcode feature module |
| Voice | VoIP is quarantined in its own feature module (170 classes, `RECORD_AUDIO`) |

## 6. The configuration platform (the app's real control plane)

`assets/parameters.json` (5,259,028 bytes) is the **shipped default catalogue of 14,516 runtime parameters** — the app's own feature-flag and tuning registry, evaluated at launch against server-delivered overrides.

| Dimension | Value |
| --- | --- |
| Total parameters | 14,516 |
| By type | boolParameters 7,258 · pluginSwitch 3,372 · int64Parameters 1,844 · stringParameters 1,420 · float64Parameters 622 |
| By category | FEATURE_FLAG 5,467 · CONFIGURATION 4,151 · PLUGIN 3,374 · BUG_FIX 1,517 · OTHER 7 |
| Namespaces | 153 (one per team/product area) |
| Largest namespaces | `rider_growth_mobile` 536 · `cx_mobile` 501 · `audio_recording_mobile` 494 · `u4b_mobile` 458 · `payment_methods_mobile` 453 · `maps_experience_mobile` 420 · `maps_navigation_mobile` 416 · `rider_foundations_mobile` 407 |
| Registry classes (owner of the parameters) | `HelixPluginsDeprecated` 406 · `com.ubercab.android.nav.NavigationParameters` 229 · `ApplinkPlugins` 224 · `SafetyMediaRecordingParameters` 150 · `ReporterConfigurationParameters` 141 |
| Map/location/geography-related | 1,722 parameters |

Each entry carries `namespace`, `name`, `defaultValue`, `category`, the owning class (`fileName`, e.g. `com.uber.threading.experiments.ThreadingParameters`) and a `uniqueId`. Reading: **product behaviour, performance tuning (frame rates, cache sizes, thread counts), bug fixes and rollouts are all data**, resolved per launch — which is why the package contains hundreds of `*Parameters`/`*Plugins` registry classes and why behaviour can change without a release.

## 7. Build and packaging shape

- Multi-dex 23 files; the largest first-party package is the generated model layer, the second the RIB feature tree.
- Feature modules are separate APKs (`VoipTwilio`, `BarcodeScanner`, `GooglePaySdk`, `FlashNacional`), each with its own permissions/classes — base stays lean of camera-recording and ML code.
- Language content ships per-locale split (Arabic split present in the studied delivery); the base package has 15,380 default-locale strings and no locale-qualified `values-*` tables.
- Native code is ABI-split (all 13 libraries only in the `arm64-v8a` config split).
- `allowBackup="false"`, network-security-config present, no cleartext flag, no debuggable attribute, 3 direct-boot-aware components (full reference §§8, 13).

## 8. Error handling, logging and telemetry

- First-party reporting stack: `com.uber.reporter` (269 parameters across `ReporterParameters`/`ReporterConfigurationParameters`), `libndk-crash.so` for native crashes, `libndk-anr.so` for ANR reporting, plus the `rt/bug-reporting/*` routes for user-initiated reports.
- No third-party analytics or attribution SDK ships in base (0 classes for AppsFlyer, Branch, Mixpanel, Amplitude, Stripe; Twilio confined to its feature module). The analytics layer is first-party and parameter-driven: `assets/analytics_filter_prod_all_apps.json` (877,690 bytes) carries the event-filter configuration.
- Structured logging is generated: 13,178 `*_GsonTypeAdapter` classes serialize the model layer for both transport and log records.

## 9. Testing and instrumentation visible in the package

- `/rt/mobile-integration-test/{name}` is a shipped integration-test route.
- `uber-dragon-crawl-e2e` is a shipped scheme used by an end-to-end harness, and `DragonCrawlActivity` exists in the package.
- The parameter registry carries 1,517 entries categorised `BUG_FIX` — production behaviour fixes gated by parameter rather than by release.
- A performance-debug scheme (`uber_performance_debug`) is accepted by the root activity in this release build (full reference §12; no impact established).

## 10. Scale, in one reading

Three numbers frame the construction: **288,727** class definitions, **14,516** parameters in the shipped registry, **1,746** map-stack classes — a product built as a plugin tree of independently tunable features rather than a single shipping unit.

## 11. What is not determined here

- Team boundaries and repository layout: not derivable from a packaged build; the 153 parameter namespaces are the closest available proxy.
- Which parameters are overridden server-side at runtime, and their delivered values: not determinable from package contents (only defaults ship).
- Code coverage, test counts and CI practice: not present in the artifact.

## 12. Evidence (archive: the current-study evidence folder under `research_notes/`)

| Claim group | Evidence file |
| --- | --- |
| Per-code-file counts (strings/types/methods/fields/classes), 288,727 total | `dex-inventory-summary.json` (produced by `dex-inventory.py`) |
| Per-class member inventories, lane selections | `dex-class-members.txt` (produced by `dex-members.py`; archived gzipped), `lane-summary.json`, `feature-modules.json` |
| Name-based counts (Router/Interactor/Builder/Scope/ViewModel/Activity/Fragment/Store/Provider/Worker/Factory) | `dex-classes.txt.gz` + `dex-mine.py` |
| Library presence counts (retrofit/okhttp/grpc/thrift/protobuf/gson/moshi/Rx/coroutines/Dagger/DataStore/SQLDelight/Room/Glide/Coil/Lottie/ExoPlayer/TensorFlow/WorkManager) | `dex-classes.txt.gz`; counts recomputable with `dex-mine.py` patterns |
| Parameter registry (14,516 params, namespaces, categories, owning classes) | `parameters-registry-summary.json` (produced from `assets/parameters.json`, SHA-256 recorded in that file) |
| Manifest facts, permissions, components | `evidence-deepseek/manifest.json` |
| Native library identity and exports | `exp-*.json`, `exp2-*.json`, `elf-sections-summary.json` |
| Analytics filter asset size | `dex-inventory-summary.json` (ZIP entry listing) and `assets` inventory captured in `res-type-census.json` run notes |


