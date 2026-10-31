# Maps, location and trip-tracking knowledge reference — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Nature:** factual reference only, companion to `KNOWLEDGE-2026-10-31-uber-rider-app-facts.md`. Every figure was observed directly from the app package installed on the owner's own test device (Samsung SM-A5360, Android 16) and from Uber's public publications. The app was never launched during the study, no vendor system or network service was contacted, and no other user's data is involved. Class counts are exact counts of class-name matches in the build's code inventory; library symbol counts are exact counts from the native libraries' own export tables.

## 1. The map rendering stack is first-party (with one embedded Google client library)

| Query | Matches | First-party (`com.uber*`) | Reading |
| --- | --- | --- | --- |
| `maps` | 571 | 492 | Uber's own map feature tree **plus 79 Google classes — 70 of them `com.google.android.gms.maps.*` (`GoogleMap`, `MapView`, `GoogleMapOptions`, `StreetViewPanorama`, `OnMapReadyCallback`), i.e. the Google Play services Maps SDK client library is embedded in the package** |
| `Marker` | 184 | 179 | the marker/layer system (per-feature map layers), incl. `com.google.android.gms.maps.model.MarkerOptions` |
| `mapview` | 0 | 0 | no third-party view wrapper |
| `mapbox` | 0 | 0 | **no Mapbox SDK** |
| `maplibre` | 0 | 0 | **no MapLibre SDK** |
| `com.google.android.maps` | 0 | 0 | no legacy Google Maps SDK namespace |

So: the **rendering engine is Uber's own**, and no Mapbox/MapLibre/legacy vendor SDK is present — but the Google Play services Maps client library ships in the base module alongside it (70 classes). The choice between them is configuration resolved in code, and the shipped default is **own engine first, Play services client as the fallback** (deep dive §2.1 of the 1 Nov edition).

The first-party rendering engines are two native libraries in the arm64 split:

- **`libubermaps-gl.so`** — 3.91 MiB (4,099,192 bytes), **6,504 exported symbols** (export table fully enumerated). The symbols show a complete C++ map engine: style handling (`maps::common::style`, `msd::Map` style-class checks), tile loading and geometry extraction (`maps::common::tile`, `GeometryTileFeatureExtractor`), polylines with pattern support (`msd::PolylineAPI_impl::addPatternPolyline` over `PatternPolylineOptions`), polygon tessellation (`tess*`), and an embedded libuv event loop (`uv_*`) for async work. The namespace and class layout are consistent with a Mapbox-GL-lineage rendering engine (see §1.1 for what the symbol table does and does not establish) — Uber has publicly described building its own map rendering stack.
- **`libvendor-mapdisplay.so`** — 3.74 MiB (3,920,368 bytes), **4,196 exported symbols**: image decoding (libpng `png_*`, stb `stbi_*`) and vendor display parameters — including vendor feature flags compiled into the binary (e.g. `mapdisplay_flipr_max_feature_request_polygon_vertices`).

The standalone Google Maps app is **queried** (package visibility) for navigation handoff — see §5.

### 1.1 Maps integration architecture (verified from class inventory and native symbol tables)

The build carries **two coexisting map backends behind a first-party abstraction**:

- **Backend abstraction:** `com.ubercab.android.map.*` — six wrapper classes (`GoogleMap`, `GoogleMapFactory`, `GoogleMapView`, `GoogleMapsInitializer`, `GoogleMapViewLifecycleCoordinator`, `GoogleMapEventProxyListener`) wrap the Google Play services Maps client behind Uber's own factory/lifecycle interfaces. Which backend a given screen gets is resolved from the `map_provider` configuration at map creation, with the own engine as the shipped initial provider (1 Nov deep dive §2.1).
- **First-party engine:** `libubermaps-gl.so` — its 6,504 symbols resolve to an own C++ core (`msd::` — 4,926 symbols: `msd::Map`, run-loop invokers, `GeometryTileFeatureExtractor`, polyline API) layered over `maps::common::{style, tile, gfx, glyph, image, mapdisplay}` (including a `RasterTileProviderBridge`). The engine **embeds Mapbox's open-source geometry components** — 76 symbols in the `mapbox` namespace: 56 from `mapbox::util::geojsonvt` (vector-tile slicing) and 18 from the `Earcut` triangulation family (`mapbox::detail::Earcut` 17 + `mapbox::earcut` 1), plus 2 first-party `msd::util::mapbox` URL helpers, both open-source libraries — and its style parser is literally named `msd::parsing::MapboxStyleVersion`, i.e. it consumes Mapbox-format style documents. An embedded libuv loop (`uv_*`, 304 symbols) handles async work. This is an own engine built on open-source Mapbox components, not a renamed Mapbox-GL core (no `mbgl::` namespace exists in the binary).
- **Per-feature layer system:** **254 classes match `MapLayer`, every one first-party** — each product feature contributes its own layer factories/listeners (access-point markers, AV pickup and confirmation layers, tooltips, debug markers). Maps integration is plugin-style: features attach layers rather than owning maps.
- **Module tree** (class counts by first-party package): `com.uber.maps.presentation` 70, `.mapsudl` 39 (design-language), `.common` 33, `.navigation` 24, `.ugc` 23, `.wasp` 14, `.mapsexperiencepresentation` 13, `.imagery` 4; plus `com.uber.mapssdk.places` 11, `.mapssdk.geofences` 5, `com.uber.rider_maps_sdk` 7, `com.uber.routeshare.maps` 7; and 235 generated `com.uber.model.core` data-model classes mentioning maps.

## 2. The location stack is also first-party

- **1,250 classes match `location`** — 1,203 of them first-party (`com.uber*`).
- **`fusedlocation` matches: 0.** Uber does not use Google's fused-location API in this build (the substring search would have caught `FusedLocationProviderApi`/`FusedLocationApi`); the acquisition pipeline is its own (the vendor's public technical blog has described a first-party driver-location pipeline for years).
- High-accuracy path: the homescreen container exposes a high-accuracy location fetcher plugin point (`HighAccuracyLocationFetcherPluginPoint`).
- **Geocoding/search is first-party too**: 28 classes across the ride geocode module (`GeoSearcher`, `GeoSuggester`, `GeoFavoriter` under `com.ubercab.presidio.*.ride.geocode`) and the `location_geocoder_api` module — not Android's framework geocoder.
- Motion context: the manifest declares accelerometer, gyroscope, barometer and step-counter/detector hardware features — sensor-fused motion awareness around location use.

## 3. Geospatial indexing: H3, bridged natively

- 218 classes match `h3`; the bridge is `com.uber.h3.NativeMethods`, whose methods include the full hexagonal-indexing API: `geoToH3(lat,lng,res): long`, `h3ToGeo`, `h3ToGeoBoundary`, `h3SetToLinkedGeo`, `polyfill`, `kRing`, `kRingDistances`, `hexRing`, `hexRange`, `maxKringSize`, `maxPolyfillSize`, `h3IsValid`.
- The backing **`libh3.so`** (91 KB) exposes the complete H3 C API by symbol name — this is Uber's own open-sourced H3 library ([github.com/uber/h3](https://github.com/uber/h3)), compiled into the app for cell-based spatial indexing (ETAs, service areas, pricing zones, dispatch geometry are the known public uses of H3 at Uber).

## 4. Trip-tracking machinery (all first-party)

- **`tracking` 105 + `tracker` 243 classes, 100 % first-party** — activity tracking, commute-hub tracking and similar are Uber's own subsystems; no third-party tracking SDK appears anywhere (consistent with the vendor composition in the companion file).
- **Arrival notifications run on geofences** (name evidence): two generations of machinery in the manifest — `GeofenceBroadcastReceiver` + `GeofenceTransitionsJobIntentService` (V3 and V4), all `exported=false`.
- **Voice/visual cues during trips**: `NarrationService` runs as a **foreground service of type `location`** (the name indicates audio narration while navigating).
- **Clock discipline**: `NtpBootCompletedReceiver` (exported, on the boot-completed broadcast) points to NTP time re-sync (correct timestamps for location samples and trip events).
- WorkManager's system foreground service is declared with combined types `microphone|location|dataSync`; location permission is **foreground-only** (coarse + fine — the manifest declares no background-location permission), but `FOREGROUND_SERVICE_LOCATION` is present, so long-running location work is done in foreground services.
- **Autonomous-vehicle service areas**: a small `geofence` module exists under the AV namespace (`AvServiceAreaGeofenceStore`, AV map layers) — AV service-area boundaries are managed client-side as geofenced map layers.

## 5. The device-ecosystem queries (what the app can see)

The manifest's package-visibility block (what other installed apps the app may detect and hand off to) is itself a map of integrations:

- **Navigation/map apps**: Google Maps, Waze, Yandex Navigator, Naver Map, T Map (Korea), 2GIS (Russia), MappyOBN (Middle East) — regional navigation handoff.
- **Messaging apps** (share-a-trip/OTP): WhatsApp, WhatsApp Business, LINE, KakaoTalk, WeChat, Weibo, Viber, Skype, GroupMe, BBM, Facebook Messenger, default SMS.
- **Payment apps**: PayPal, Venmo, PayPay (Japan).
- **The Uber app family**: Eats, Driver, Fleet, Freight, Uber Lite, Restaurants, Postmates, in-car tablet — cross-app detection and handoff.
- **Root-manager packages** (SuperSU, Superuser variants, root-removal tools): the app queries for their presence — a standard device-integrity signal (see the companion file's observations register for how this relates to the security posture).

## 6. What is *not* in the client

- No offline routing engine is apparent in the code inventory (no routing/nav census was run, so this is an inference from the export tables and module names rather than an exhaustive search): route/ETA computation is expected server-side; the client renders results and handles geometry display (tiles, polylines) plus H3 indexing.
- No third-party map, location, or tracking SDK **except the Google Play services Maps client library** (70 classes, §1); no third-party attribution, analytics, or tracking vendors at all (companion file §4).
- Certificate-pinning configuration, if any, is a runtime property — not determinable from package contents alone.

## 7. Lessons for Fastship (our own repository, verified in-repo)

1. **Map rendering:** Fastship's renderer table is MapLibre on web/Android, Apple on iOS, with Google as the single gated build-capability option (`src/map-provider.ts`). Uber shows the end-state of owning the renderer (a forked GL engine with vendor display parameters); for Fastship's scale, MapLibre remains the right call — the lesson is the *parameter* pattern: renderer feature flags compiled as build capabilities, exactly like our `selectRenderer` capability table.
2. **Spatial indexing:** H3 is open source and directly adoptable server-side for Fastship's checkpoint zones, service areas and surge-style geometry — a more robust primitive than the hand-rolled checkpoint-radius checks (`CHECKPOINT_RADIUS`, `nearLine`, `server/main.ts:2431, 2485–2486`).
3. **Arrival notifications:** Uber's geofence-transition pattern (V3→V4 evolution, unexported receivers) is the platform-native way to do "driver is arriving" alerts; Fastship currently does long-poll marker staleness (`SPEC-live-map.md`) — a geofence-triggered local notification on the driver device is the natural next capability.
4. **Clock discipline:** an NTP re-sync on boot matters for trip-event timestamps once Fastship ships multi-node servers (part 1's Azure Web PubSub plan) — clock skew shows up as stale-marker bugs.
5. **First-party telemetry:** no third-party analytics/attribution in the base module (companion file §4) — the same posture Fastship already has (no analytics SDKs in `package.json`).
6. **Sensor fusion:** Fastship's driver cadence rules (`src/background-location.ts:109`, 3 s interval, `src/location-delivery.ts` movement thresholds) could read the step/activity sensors the way Uber declares them, to cut GPS samples while stationary.

## 8. Deeper-investigation addendum (same day, second multi-agent pass)

A second evidence pass extended every section above; the new facts:

**Native-library inventory: all 13 libraries detected, 12 characterized by their export tables:**

| Library | Exports | Identity as read from its own symbols |
| --- | --- | --- |
| `libubermaps-gl.so` | 6,504 | first-party map rendering engine (§1) |
| `libvendor-mapdisplay.so` | 4,196 | vendor display + image decode (§1) |
| `libtensorflowlite_jni.so` | 280 | complete TensorFlow Lite C API + Java bindings (on-device ML) — also the largest library at 4.32 MB |
| `libml-imageproc.so` | 301 | C++ image-processing runtime |
| `libndk-crash.so` | 7 | crash reporting (`forceNativeCrash`, `signalHandler`) |
| `libimage_processing_util_jni.so` | 6 | CameraX bitmap/byte-buffer utilities |
| `libsurface_util_jni.so` | 1 | CameraX surface info utility |
| `libandroidx.graphics.path.so` | 1 | AndroidX graphics path (registration at load) |
| `libse.so` | 1 | registration at load only — embeds the open-source libsodium crypto library (full reference §18) |
| **`libse_loader.so`** | **1** | **`Java_com_uber_security_Engine_init` — the loader of that engine (`com.uber.security.Engine`); two-thirds of its file is a stored encrypted/compressed data region (full reference §18)** |
| `libeef0.so` | 3 | registration at load only (34 KB registration function) — role still not nameable |
| `libh3.so` | full API | Uber's open-sourced H3 (§3) |
| `libndk-anr.so` | not captured | ANR reporting helper (10,472 bytes) — no export record in this pass |

Build-toolchain fingerprints on four representative libraries (`libubermaps-gl`, `libvendor-mapdisplay`, `libeef0`, `libh3`): **no Go build metadata, no Rust toolchain metadata in any of them** — those libraries are C/C++; no claim is made here about the others.

**Extended class census (new queries, same method):**

| Query | Matches | First-party | Reading |
| --- | --- | --- | --- |
| `eta` | 3,887 | 3,745 | **substring-inflated**: most matches are `Metadata`/`Details`/`Completable`-style names containing the letters; genuine ETA classes are a small subset (only 6 contain the literal token) — the real ETA surface spans the `…eta.*` and `walking_eta` packages |
| `camera` | 469 | 197 | barcode-scanner/camera integrations |
| `tracker` | 243 | 243 | first-party tracking subsystems (§4) |
| `tile` | 18 | 17 | mostly non-map UI "tiles" |
| `geocoder` | 5 | 5 | first-party geocoder API client (`LocationDetailsClient`, `NearbyLocationsHolder`) — not Android's framework geocoder |
| `surge` | 6 | 6 | real-time surge-pricing models in the client (`AffineSurge`, generated pricing-model code) |
| `com.google.android.maps` | 0 | 0 | no legacy Google Maps SDK namespace (but see §1: the Play services Maps client, 70 classes, is a different thing and is present) |
| `activityrecognition` | 0 | 0 | no Google Activity Recognition API |
| `motionactivity` | 0 | 0 | — |
| `locationengine` | 0 | 0 | the location pipeline uses other naming (§2's 1,250-class census covers it) |
| `polyline` | 0 | 0 | polyline geometry lives only in the native engine (§1), not as Java classes |

**Service-area check structure:** the autonomous-vehicle geofence store exposes three Object-returning continuation-style methods, one taking `UberLatLng` — point-in-service-area membership checks are coroutine-wrapped lookups, consistent with §4's AV map-layer module.

## 9. Source note

All counts come from the evidence set archived in this repository — 127 files in the current-study evidence folder plus 19 more in its earlier-study sibling (146 total), both under `research_notes/` — and from two public sources: Uber's H3 repository and Uber's public technical posts. Statements marked "not determined" are studied absences, not omissions.

