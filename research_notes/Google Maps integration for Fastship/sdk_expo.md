# Google Maps integration for Fastship — SDKs, Expo SDK 57 / RN 0.86, October 2026

Scope: Android, iOS and web integration options for Google Maps in this repository (`expo ~57.0.31`, `react-native 0.86.3`, `react-native-maps 1.27.2`, `maplibre-gl 6.12.0`), plus key handling, Places, Routes, Navigation SDK, Palestine/West Bank coverage, and migration sequence.

Method and labels: all web sources were fetched on **2026-10-29** (URLs carry `acc. 2026-10-29`). Claims are tagged **[documented]** (stated by a primary vendor/Expo source), **[observed]** (read directly from this repository or a fetched page's content), **[inferred]** (my reasoning from cited facts), or **[unverified]** (plausible but not confirmed by a source I fetched). Local repo facts cite the file path instead of a URL.

Repo baseline **[observed]**: `src/route-map.tsx` (web, MapLibre GL), `src/route-map.native.tsx` (iOS, `react-native-maps` default Apple Maps; comment says "no Google Maps key in the build"), `src/route-map.android.tsx` (Android, MapLibre inside `react-native-webview` against `${API_URL}/map.html`, with a 25 s failure fallback), `app.json` (no `react-native-maps` plugin, no Google Maps key, `expo-localization` configured with `"supportsRTL": false`). `package.json` pins `react-native-maps 1.27.2`, not the current upstream release.

---

## Which Google Maps products are current vs legacy in October 2026?

### Takeaway
The current stack is: Maps SDK for Android, Maps SDK for iOS, Maps JavaScript API, Routes API (v2), Places API (New) incl. Autocomplete (New), Geocoding API, Maps Static API, and the Navigation SDK. The old Directions API, Distance Matrix API, legacy Places API/web service, and legacy JS `PlacesService`/`DirectionsService` have been **Legacy since 1 March 2025**: frozen, unavailable to new Cloud projects, and still supported only for existing projects.

### Cited Findings
- Legacy list: Distance Matrix API, Directions API, JS Distance Matrix/Directions services → Routes API; legacy Places API, JS Places Service, Places SDK for Android/iOS → Places API (New). All "Legacy Date: March 1, 2025". — [Google, Legacy products](https://developers.google.com/maps/legacy) (acc. 2026-10-29) **[documented]**
- Legacy services are "not available in new Cloud projects but remain fully supported for existing projects"; no shutdown date, with at least 12 months' notice before decommissioning. — [Google, Legacy products](https://developers.google.com/maps/legacy) (acc. 2026-10-29) **[documented]**
- Google explicitly warns that "many AI coding assistants generate code for legacy APIs by default" and publishes migration prompts for Places API (New) and Routes API. — [Google, Legacy products](https://developers.google.com/maps/legacy) (acc. 2026-10-29) **[documented]**
- Routes API is the v2 surface: `POST https://routes.googleapis.com/directions/v2:computeRoutes` for directions, and `https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix` for matrices. — [Google, Get a route](https://developers.google.com/maps/documentation/routes/compute_route_directions) (acc. 2026-10-29); [Google, Compute Route Matrix overview](https://developers.google.com/maps/documentation/routes/compute-route-matrix-over) (acc. 2026-10-29) **[documented]**
- Maps Static API is a current product: "lets you embed a Google Maps image on your web page without requiring JavaScript", URL-parameter based, with digital-signature support. — [Google, Maps Static API overview](https://developers.google.com/maps/documentation/maps-static/overview) (acc. 2026-10-29) **[documented]**
- Navigation SDK is a current product and **replaces** the Maps SDK: "You cannot use the Navigation SDK and Maps SDK in the same app." — [Google, Navigation SDK overview](https://developers.google.com/maps/documentation/navigation/android-sdk/overview) (acc. 2026-10-29) **[documented]**
- Expo SDK 57 docs list `react-native-maps` (third-party) and `expo-maps` (Expo-built, alpha) as the two map options; `expo-maps` is Google Maps on Android and Apple Maps on iOS only. — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (modification date 2026-08-10) (acc. 2026-10-29); [Expo, Maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/maps/) (modification date 2026-07-28) (acc. 2026-10-29) **[documented]**

### Inferences
- Any new code should target Routes API + Places API (New) + Autocomplete (New) only; legacy code paths will fail with `LegacyApiNotActivatedMapError` on a new Fastship Cloud project.
- Maps Static API is the cheapest "thumbnail / fallback image" primitive for web and for notification/preview contexts, but it cannot replace an interactive map.
- Because the Navigation SDK replaces the Maps SDK on a platform, adopting it for drivers is an architectural fork, not an additive dependency **[inferred]**.

### Gaps
- No source fetched states a hard retirement date for Legacy APIs; Google says there is no date yet.
- I did not verify whether Places API (New) and Routes API are available in every Cloud region/billing country; only the Palestine data coverage table was checked.

---

## Is `react-native-maps` still the standard, and what is its state on Expo SDK 57 / RN 0.86?

### Takeaway
Yes — `react-native-maps` remains the mainstream RN map component and is the only map library listed by Expo that supports Google Maps on both Android and iOS (plus Apple Maps on iOS). It is actively maintained (1.29.11 on 2026-09-27), works in Expo Go per Expo's docs, and uses a config plugin for keys — but shipping your own Google keys requires a development/production build. This app is on 1.27.2, two minor releases behind.

### Cited Findings
- Expo SDK 57 page: "A library that provides a Map component that uses Google Maps on Android and Apple Maps or Google Maps on iOS"; platforms `android, ios, expo-go`; `inExpoGo: true`. — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- "No additional setup is required when testing your project using Expo Go. However, **to deploy the app binary on app stores** additional steps are required for Google Maps." — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- Expo documents the plugin form `["react-native-maps", { "androidGoogleMapsApiKey": ..., "iosGoogleMapsApiKey": ... }]`, and says `provider={PROVIDER_GOOGLE}` "works on both Android and iOS". — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- Upstream: the Expo config plugin "is only compatible with react-native-maps version 1.22 and above, and requires Expo SDK version 53 or higher". — [react-native-maps, installation.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) (acc. 2026-10-29) **[documented]**
- Latest release is **v1.29.11 (2026-09-27)**, with recent fixes explicitly mentioning Fabric layout metrics and marker re-attachment on Google's MapView. — [react-native-maps releases](https://github.com/react-native-maps/react-native-maps/releases) (acc. 2026-10-29) **[documented]**
- iOS Google Maps requires an iOS deployment target of **14 or later**, and `GMSServices.provideAPIKey` must be the **first call** in `didFinishLaunchingWithOptions`. — [react-native-maps, installation.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) (acc. 2026-10-29) **[documented]**
- Apple Maps raises runtime errors for Google-only features: "Making markers from KML files, Heatmap rendering, Marker clustering, etc." — [react-native-maps, installation.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) (acc. 2026-10-29) **[documented]**
- Repository pins `react-native-maps` **1.27.2** while upstream latest is 1.29.11. — `package.json` (acc. 2026-10-29) **[observed]**
- `expo-maps` is **alpha**, "will frequently experience breaking changes", is **not available in Expo Go**, supports Google Maps **only on Android**, and has no web support. — [Expo, Maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/maps/) (acc. 2026-10-29) **[documented]**

### Inferences
- For Fastship, `react-native-maps` wins over `expo-maps` because Fastship needs one component across Android + iOS, needs Google on both (brand consistency with web), and `expo-maps` explicitly does not support Google Maps on iOS. `expo-maps`' alpha status and Expo Go exclusion make it unsuitable as the primary dependency **[inferred]**.
- The 1.27.2 → 1.29.x gap matters: several 1.29.x fixes are Fabric/marker-layout fixes that would show up as misplaced or clipped custom markers on RN 0.86 **[inferred from release notes]**.
- Keeping `PROVIDER_GOOGLE` on iOS would force the Google iOS SDK pod and key; today's Apple Maps path is why the build has no key. Switching is a product decision (same tiles/labels as Android/web vs. no key/no pod on iOS) **[inferred]**.

### Gaps
- No fetched source states an explicit "Fabric/new architecture supported" matrix entry for react-native-maps; support is only evidenced by Fabric-specific fixes in release notes.
- I did not verify the exact `react-native-maps` version that `npx expo install react-native-maps` resolves to on SDK 57 (Expo's page does not print a version).
- App-size impact of adding `GoogleMaps` (iOS) / Play Services Maps (Android) was not found in any fetched source.

---

## Web: Maps JavaScript API with React, SSR, and sharing a component with native

### Takeaway
Use the Maps JavaScript API with the inline bootstrap loader + `importLibrary()`, wrapped by `@vis.gl/react-google-maps` (MIT, vis.gl). Avoid `@react-google-maps/api` v3+, which its own README now calls commercial software. The JS API is browser-only, so any Expo web route must render the map client-side only.

### Cited Findings
- Three supported loading paths: dynamic library import (inline bootstrap + `importLibrary()`), direct script tag (`loading=async&callback=...`), and the NPM `@googlemaps/js-api-loader` (`setOptions()` + `importLibrary()`). — [Google, Load the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api) (acc. 2026-10-29) **[documented]**
- The `key` parameter is required: "The Maps JavaScript API won't load unless a valid API key is specified." Supported optional parameters include `v`, `libraries`, `language`, `region`, `auth_referrer_policy`, `map_ids`, `channel`. — [Google, Load the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api) (acc. 2026-10-29) **[documented]**
- `@vis.gl/react-google-maps` is MIT-licensed, provides `APIProvider`, `Map`, `AdvancedMarker`, `Polyline`, `Circle`, `Polygon`, `InfoWindow`, `MapControl`, `StaticMap`, `Map3D`, and `useMapsLibrary()` for lazy library loading. — [vis.gl/react-google-maps README](https://github.com/visgl/react-google-maps) (acc. 2026-10-29) **[documented]**
- `@react-google-maps/api` README: "**Version 3.x and later** of `@react-google-maps/api` is commercial software." — [JustFly1984/react-google-maps-api README](https://github.com/JustFly1984/react-google-maps-api) (acc. 2026-10-29) **[documented]**
- Localization: `language=ar` is supported (Arabic is in the supported language table), and the API "supports bi-directional (Bidi) text … natively"; Google recommends adding `dir='rtl'` to the page's `<html>` element for RTL languages. — [Google, Localize the Map](https://developers.google.com/maps/documentation/javascript/localization) (acc. 2026-10-29) **[documented]**
- `region` "alters the map's behavior based on a given country or territory"; Google recommends always setting it because services such as Places Autocomplete return better results. — [Google, Localize the Map](https://developers.google.com/maps/documentation/javascript/localization) (acc. 2026-10-29) **[documented]**
- Marker clustering on web is a first-party library: `@googlemaps/markerclusterer`, with `SuperClusterAlgorithm` default, `radius`, `maxZoom`, `minPoints`, and custom `renderer`. — [Google, Marker Clustering](https://developers.google.com/maps/documentation/javascript/marker-clustering) (acc. 2026-10-29) **[documented]**
- The loader warns/guards against loading the JS API more than once ("only loads once. Ignoring"). — [Google, Load the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api) (acc. 2026-10-29) **[documented]**

### Inferences
- Sharing one map component across native and web is not realistic at the component level: `react-native-maps` renders native views, `@vis.gl/react-google-maps` renders DOM. Share the *data contract* (markers, polyline, camera) behind the existing `RouteMap` props and provide `.tsx` / `.native.tsx` / `.android.tsx` implementations — which is exactly the pattern the repo already uses **[inferred]**.
- SSR breaks because `APIProvider` injects a `<script>` and touches `window`; the map must be dynamically imported or gated behind `useEffect`/`Platform.OS === 'web'`. Expo Router `web.output: "single"` (observed in `app.json`) already produces a client-rendered SPA, which sidesteps SSR **[inferred]**.
- `language="ar"` + `region="PS"` + `dir="rtl"` is the documented combination for Arabic map labels and Arabic-formatted service responses; whether Google returns "Palestine" vs "Israel" in formatted addresses is not documented **[inferred / unverified]**.

### Gaps
- No fetched source confirms CORS behavior for calling Routes/Places/Geocoding REST directly from a browser; Google's security guidance recommends a proxy instead, so this remains an open verification item.
- I did not verify a Google-published React tutorial beyond the existence of the "Add a Google Map to a React app" codelab link in the JS API nav.

---

## API keys, application restrictions, billing, and what must never ship in the client

### Takeaway
Four separate keys (Android, iOS, Web, Server), each with exactly one application-restriction type and an explicit API allowlist. Mobile map loads are free/unlimited under the "Maps SDK" SKU, but every other call is metered per SKU with a 10,000/month free cap (5,000 for Pro, 1,000 for Enterprise). Web-service keys (Routes/Geocoding/Places REST) must never be embedded in the app; proxy them server-side.

### Cited Findings
- "Apps and projects that use the Google Maps Platform APIs and SDKs **must** use API keys"; "You are financially responsible for charges caused by abuse of unrestricted API keys." — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29) **[documented]**
- Restriction types: Websites (full referrer incl. scheme), IP addresses/CIDR, Android apps (package name + SHA-1), iOS apps (bundle ID). "If you place an application restriction on an API key, you cannot use it on other platforms." — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29) **[documented]**
- "Use separate API keys for each app"; up to **300 API keys per project**; rotate with care because mobile keys are not replaced until users update the app; delete unused keys; disable unused services. — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29) **[documented]**
- "Web service API keys are **not** expected to be publicly exposed … meant to remain a shared secret between the developer's servers and Google." If no client SDK exists, use a proxy; if direct mobile calls are unavoidable, send `X-Android-Package`/`X-Android-Cert` or `X-Ios-Bundle-Identifier` and restrict the key accordingly. — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29) **[documented]**
- Expo's Android flow requires the package name **and SHA-1**, with **different SHA-1s for debug builds and Play App Signing**, and a rebuild after adding the key. — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- Expo's iOS flow requires the bundle identifier and `iosGoogleMapsApiKey` in the config plugin; rebuild required. — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- react-native-maps: "Before you can start using the Google Maps Platform APIs and SDKs, you must sign up and create a **billing account**!" — [react-native-maps, installation.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) (acc. 2026-10-29) **[documented]**
- Current price list (global, last updated 2026-10-28): **Maps SDK** SKU `6DE1-4D9C-5B67` — free usage **Unlimited**; **Dynamic Maps** — 10,000 free then $7.00/1,000; **Static Maps** — 10,000 free then $2.00/1,000; **Routes: Compute Routes Essentials** — 10,000 free then $5.00/1,000; **Routes: Compute Routes Pro** — 5,000 free then $10.00/1,000; **Routes: Compute Route Matrix Essentials** — 10,000 free then $5.00/1,000; **Autocomplete Requests** — 10,000 free then $2.83/1,000; **Place Details Essentials** — 10,000 free then $5.00/1,000; **Geocoding** — 10,000 free then $5.00/1,000; **Navigation Request** — 1,000 free then $25.00/1,000 (Enterprise tier). — [Google, Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29) **[documented]**
- Subscription alternative: Starter $100/mo (50,000 calls), Essentials $275/mo (100,000), Pro $1,200/mo (250,000); new customers get a **$300 trial credit**. — [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/) (acc. 2026-10-29) **[documented]**
- Google recommends splitting client-side and server-side usage into separate Cloud projects to get per-user quotas on the client project. — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29) **[documented]**
- Optional hardening: App Check is documented for Maps JavaScript API and for the Navigation SDK for Android. — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29); [Google, Navigation SDK overview](https://developers.google.com/maps/documentation/navigation/android-sdk/overview) (acc. 2026-10-29) **[documented]**

### Inferences
- Fastship's minimum viable key set is 4 keys, not 1: Android (debug SHA-1 + Play SHA-1 entries), iOS bundle ID, Web referrers (`https://app.example.com/*`, `http://localhost:8081/*`), and Server IP-allowlisted. A single key cannot satisfy all four because one restriction type locks out the others **[inferred]**.
- The Android key will be extracted from the APK; restrictions (package + SHA-1 + API allowlist) are the only real defense. Rotating it is slow because installed apps keep the old key until update **[documented + inferred]**.
- Because mobile Maps SDK loads are unlimited/free, the visible bill will be dominated by Dynamic Maps (web), Routes Pro (traffic-aware), Autocomplete, and Place Details — not by the native map **[inferred from SKU table]**.

### Gaps
- No fetched source quantifies abuse/cost ceilings or per-user quota defaults for a new project.
- Whether Google Maps Platform is contractually available to a business billing address in Palestine (and under which terms) was not verified.

---

## Feature mapping for this app: markers, heading, polyline, camera, traffic, night mode, RTL, sheet gestures, offline

### Takeaway
Every requested interactive feature except clustering and offline tiles is available in `react-native-maps` and the JS API. Traffic is the trap: Google's own coverage table marks the **Traffic Layer as unavailable in Palestine (PS)**, so a traffic toggle will render nothing regardless of SDK.

### Cited Findings
- MapView props include `provider`, `region`/`camera`, `mapPadding`, `mapType`, `customMapStyle`, `userInterfaceStyle: 'light'|'dark'`, `showsTraffic`, `showsUserLocation`, `showsMyLocationButton`, `zoomEnabled`, `scrollEnabled`, `scrollDuringRotateOrZoomEnabled`, `rotateEnabled`, `pitchEnabled`, `toolbarEnabled`, `googleMapId`, `loadingEnabled`. — [react-native-maps, mapview.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md) (acc. 2026-10-29) **[documented]**
- Camera methods/props: `animateCamera(camera, {duration})`, `setCamera`, `animateToRegion`, `getCamera`, `fitToCoordinates(coordinates, {edgePadding, animated})`, `fitToElements`, `fitToSuppliedMarkers`; `Camera` supports `center`, `pitch`, `heading`, and `zoom` (Google Maps). `duration` is not supported on iOS. — [react-native-maps, mapview.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md) (acc. 2026-10-29) **[documented]**
- `fitToCoordinates` "If called in ComponentDidMount in android, it will cause an exception. It is recommended to call it from the MapView `onLayout` event." — [react-native-maps, mapview.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md) (acc. 2026-10-29) **[documented]**
- Marker props: `coordinate`, `rotation` (degrees), `flat`, `anchor` (default `(0.5, 1)`), `image`/`icon` (local images only), `opacity`, `tracksViewChanges`, `animateMarkerToCoordinate` (Android only). — [react-native-maps, marker.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/marker.md) (acc. 2026-10-29) **[documented]**
- `showsTraffic` "A Boolean value indicating whether the map displays traffic information" — but per-country coverage is separate. — [react-native-maps, mapview.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md) (acc. 2026-10-29) **[documented]**
- Coverage table, region `PS` Palestine: Map Tiles 2D/3D **⬤**, Maps JavaScript 3D **—**, Geocoding **⬤**, Traffic Layer **—**, Driving Directions/Snap to Roads **⬤**, Biking **—**, Walking **⬤**, Speed Limits **—**. — [Google, Coverage details](https://developers.google.com/maps/coverage) (last updated 2026-10-28; acc. 2026-10-29) **[documented]**
- `followsUserLocation` is **Apple Maps only**, so camera-follow on Google Maps must be implemented with `animateCamera({center, heading})`. — [react-native-maps, mapview.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md) (acc. 2026-10-29) **[documented]**
- JS API clustering is `@googlemaps/markerclusterer`; Android/iOS have separate first-party clustering utilities (`android-sdk/utility/marker-clustering`, `ios-sdk/utility/marker-clustering`), but `react-native-maps`' component docs list no clustering component. — [Google, Marker Clustering](https://developers.google.com/maps/documentation/javascript/marker-clustering) (acc. 2026-10-29); [react-native-maps, mapview.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md) (acc. 2026-10-29) **[documented + inferred from absence]**
- Offline/caching: "Customer will not pre-fetch, index, store, reshare, or rehost Google Maps Content outside the services" and "will not cache Google Maps Content except as expressly permitted." — [Google Maps Platform Terms, §3.2.3](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29) **[documented]**
- Current Android implementation already treats map failure as a first-class state: WebView points at `${API_URL}/map.html`, calls `onFail` if the page never reports ready, and falls back to `RoutePreview`; web has a 20 s deadline and Android a 25 s timer. — `src/route-map.android.tsx` (acc. 2026-10-29) **[observed]**
- `expo-maps` provides `contentPadding`, `colorScheme`, `properties.isTrafficEnabled`, `GoogleMapsUserLocation.followUserLocation`, markers/polylines/circles, and `setCameraPosition` — but no clustering and no web. — [Expo, Maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/maps/) (acc. 2026-10-29) **[documented]**

### Inferences
- Driver marker with heading: `Marker rotation={bearing}` + `flat` for a ground-plane arrow, and `animateCamera({ center, heading: bearing, pitch: 45, zoom: 17 })` for follow mode. `animateMarkerToCoordinate` is Android-only, so iOS needs a `key`-change or a Reanimated interpolation **[inferred]**.
- Recenter = `animateCamera({center: userCoordinate, heading: bearing, pitch: 0})`; fit bounds = `fitToCoordinates([pickup, dropoff, driver], {edgePadding, animated:true})` from `onLayout`, not mount **[inferred from documented method contract]**.
- Map-in-scroll-sheet: the documented `scrollEnabled`/`zoomEnabled`/`pitchEnabled`/`rotateEnabled` props are the only lever; toggle `scrollEnabled` while the sheet is being dragged, and re-enable on release. There is no documented "cooperate with parent scroll view" mode **[inferred]**.
- Night mode is `userInterfaceStyle="dark"` on the MapView (documented) plus a dark `customMapStyle` JSON or a Cloud `googleMapId`; the app's `userInterfaceStyle: "light"` in `app.json` means the map would follow light unless forced **[inferred]**.
- Traffic should be feature-flagged off for PS, because the coverage table says the layer has no data there; showing a toggle that draws nothing is a UX bug, not an API bug **[inferred from coverage table]**.
- Offline: there is no legal tile cache. Keep the existing "diagram fallback" pattern (which the repo already has) and never persist tiles/polylines beyond session state; a locally stored route geometry computed by your own server is the only safe offline artifact **[inferred from Terms §3.2.3]**.

### Gaps
- I did not verify Google Maps SDK behaviour for Arabic map labels under an app-level locale override; RN Maps exposes no `language` prop in the fetched docs, so this likely follows the device locale.
- Marker clustering for native `react-native-maps` requires a third-party wrapper (e.g. `react-native-map-clustering`); I did not verify its current version, maintenance, or RN 0.86 compatibility, so it is intentionally not named as a recommendation.
- Exact offline behaviour (grey tiles vs cached tiles vs logo-only) was not tested on a device in this research pass.

---

## Places Autocomplete: sessions, billing, Palestine restriction, Arabic, and "checkpoints"

### Takeaway
Autocomplete (New) is `POST https://places.googleapis.com/v1/places:autocomplete`, returns at most 5 predictions, and bills either per request (10,000 free, then $2.83/1,000) or per session terminated by Place Details (New)/Address Validation. Restrict to the West Bank with `locationRestriction` (rectangle or ≤50 km circle) plus `includedRegionCodes: ["ps"]` and `languageCode: "ar"`. It cannot return military checkpoints as a category.

### Cited Findings
- Endpoint and required `input`; response `suggestions[]` of `placePrediction` or `queryPrediction`. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- "Autocomplete (New) returns **five total predictions**"; `includeQueryPredictions` defaults to false. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- `locationBias` and `locationRestriction` are mutually exclusive; circle radius must be between 0 and 50,000 m; `locationRestriction` requires radius > 0. If both are omitted, **IP biasing** applies. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- `includedRegionCodes` accepts up to **15** two-character ccTLD values; combining it with `locationRestriction` returns the intersection. `languageCode` uses IETF BCP-47; `regionCode` formats the response. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- `sessionToken` groups calls into a session "for billing purposes"; session starts at first Autocomplete call and terminates at Place Details (New) or Address Validation. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- Session billing: first **12** Autocomplete requests are billed per request; requests 13+ are free under "Autocomplete Session Usage"; the terminating Place Details Essentials request is billed. Incomplete sessions revert to per-request pricing. — [Google, Autocomplete and session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing) (acc. 2026-10-29) **[documented]**
- Cost optimization: if you only need address + lat/lng and users select within **4 or fewer** Autocomplete requests on average, per-request Autocomplete + **Geocoding API** is cheaper than session + Place Details. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- `includedPrimaryTypes` accepts up to five primary types from Table A/B, or the collections `(regions)`/`(cities)`; results are restricted to the place's **single primary type**. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- Predictions may use alternative names in a different language than `languageCode` when they match the typed input more closely; street addresses are formatted in the local language. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29) **[documented]**
- Palestine is a supported region code (`PS`) for core mapping/geocoding coverage. — [Google, Coverage details](https://developers.google.com/maps/coverage) (acc. 2026-10-29) **[documented]**

### Inferences
- West Bank-only search: a rectangle around the West Bank (approx. 31.2–32.6 N, 34.8–35.6 E) as `locationRestriction.rectangle` is safer than `includedRegionCodes: ["ps"]`, because `ps` also covers Gaza and IP biasing may pull Israeli results for users near Jerusalem **[inferred; the rectangle is a product decision, not a Google-provided boundary]**.
- Arabic-first UX: `languageCode: "ar"` + `regionCode: "ps"` + `origin` (for `distanceMeters`) gives Arabic labels and a straight-line distance for sorting; `structuredFormat.mainText/secondaryText` should be used for two-line rows **[inferred from documented fields]**.
- Checkpoints: the Places taxonomy is a fixed list of business/POI types (Table A/B). Nothing in the fetched docs defines a "checkpoint" primary type, and a military checkpoint is not a business listing. A reliable checkpoint picker needs an app-owned dataset (name, Arabic name, lat/lng, direction/queue notes), optionally geocoded once server-side and then served from your own DB **[inferred / unverified]**.
- Because sessions terminate only on Place Details/Address Validation, a user who types and then dismisses the sheet leaves an incomplete session billed per request; cap debounce (e.g. 300 ms, min 3 chars) and abort stale requests **[inferred from session pricing]**.

### Gaps
- No source confirms whether Google returns checkpoints, roadblocks, or flying checkpoints as places in the West Bank; I found no documented type for them.
- I did not execute a live Autocomplete query for Ramallah/Nablus/Hebron, so result quality and Arabic formatting are **unverified**.
- The interaction between `includedRegionCodes: ["ps"]` and Jerusalem/East Jerusalem address formatting is undocumented in the pages reviewed.

---

## Routes API: computeRoutes vs computeRouteMatrix, traffic, waypoints, alternatives, ETA, polylines, field masks

### Takeaway
Use `computeRoutes` for the Fastship route line/ETA (one origin, one destination, optional waypoints, alternatives, traffic-aware), and `computeRouteMatrix` only for dispatch-style many-to-many ETAs (up to 625 elements). Both require an `X-Goog-FieldMask`; without it the request is invalid. Traffic-aware routing is the Pro SKU (5,000 free, then $10/1,000).

### Cited Findings
- `computeRoutes` is `POST https://routes.googleapis.com/directions/v2:computeRoutes`; request body carries `origin`, `destination`, `travelMode`, `routingPreference`, `computeAlternativeRoutes`, `routeModifiers`, `languageCode`, `units`; response fields are selected by `$fields` or `X-Goog-FieldMask`. — [Google, Get a route](https://developers.google.com/maps/documentation/routes/compute_route_directions) (acc. 2026-10-29) **[documented]**
- The documented example uses `"routingPreference": "TRAFFIC_AWARE"`, `"computeAlternativeRoutes": false`, `languageCode: "en-US"`, `units: "METRIC"`, and field mask `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline`. — [Google, Get a route](https://developers.google.com/maps/documentation/routes/compute_route_directions) (acc. 2026-10-29) **[documented]**
- Response shape: `{"routes":[{"distanceMeters":772,"duration":"165s","polyline":{"encodedPolyline":"ipkcFfichVnP@j@BLoFVwM{E?"}}]}` — `duration` is a string with an `s` suffix, distance is always meters. — [Google, Get a route](https://developers.google.com/maps/documentation/routes/compute_route_directions) (acc. 2026-10-29) **[documented]**
- `computeRouteMatrix` is `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`; requires at least one origin and **two or more destinations**, `travelMode`, and a field mask; origins × destinations ≤ **625**; elements can stream before the full matrix is computed. — [Google, Compute Route Matrix overview](https://developers.google.com/maps/documentation/routes/compute-route-matrix-over) (acc. 2026-10-29) **[documented]**
- Matrix field mask example: `originIndex,destinationIndex,duration,distanceMeters,status,condition`. — [Google, Compute Route Matrix overview](https://developers.google.com/maps/documentation/routes/compute-route-matrix-over) (acc. 2026-10-29) **[documented]**
- Traffic controls: include/exclude traffic data, request **traffic-aware polylines** (billed at a higher rate), and choose a traffic model. — [Google, Available traffic options](https://developers.google.com/maps/documentation/routes/traffic-opt) (acc. 2026-10-29) **[documented]**
- Pricing: Compute Routes Essentials 10,000 free then $5/1,000; Compute Routes **Pro** 5,000 free then $10/1,000 (plan copy: "with real-time traffic … up to 25 waypoints"); Compute Route Matrix Essentials 10,000 free then $5/1,000; Matrix Pro 5,000 free then $10/1,000. — [Google, Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29) **[documented]**
- For turn-by-turn consistency, the Navigation SDK can consume a **route token** from the Routes API; the waypoints passed to `setDestinations` "must match the waypoints used when generating the route token", and `routingOptions`/`routeTokenOptions` are mutually exclusive. — [@googlemaps/react-native-navigation-sdk README](https://github.com/googlemaps/react-native-navigation-sdk) (acc. 2026-10-29) **[documented]**

### Inferences
- A server-side `POST /routes` proxy should request exactly `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction` (or a narrower set) and never `*` in production — Google's own gRPC sample says `*` is "OK for testing, but discouraged in production" **[documented + inferred]**.
- Alternatives for driver choice: set `computeAlternativeRoutes: true` and render up to N polylines; each alternative increases response size, so keep the field mask tight **[inferred]**.
- Decode `encodedPolyline` on the client (Google publishes the Encoded Polyline Algorithm and an interactive decoder); do not re-encode server-side unless you need to simplify **[documented: decoder exists at /maps/documentation/utilities/polylineutility]**.
- Waypoints: `computeRoutes` supports intermediate waypoints and `optimizeWaypointOrder` for stop ordering (documented nav entries exist under Waypoints), but the exact request fields were not fetched in this pass — treat as a follow-up verification, not a fact **[unverified]**.
- PS routing: driving directions are rated ⬤ for Palestine, so Routes should return a drivable line; traffic-aware ETAs will be degraded because the traffic layer has no PS coverage **[inferred from coverage table]**.

### Gaps
- `routeLabels` (e.g. default vs fuel-efficient labels) and `polylineQuality`/`polylineEncoding` options were not verified in the pages fetched; do not assume their names.
- I did not verify toll/ferry avoidance behaviour or `routeModifiers` semantics for West Bank roads.
- No source fetched documents Routes API CORS support for direct browser calls; keep routing server-side.

---

## Navigation SDK: licensing, contract, turn-by-turn, and Expo/RN support

### Takeaway
The Navigation SDK is real, documented, and self-serve *technically*: billing account + enable Navigation SDK for Android/iOS + API key. I found **no** requirement for a signed sales contract in the current docs — only a "contact Sales" path for Mobility Services and for large-vehicle routing. But the official React Native wrapper is **Beta**, requires **RN 0.87+ with the new architecture**, and therefore **does not support this app's RN 0.86.3** at its current version.

### Cited Findings
- Prerequisites: a Cloud project **with a billing account** and the Navigation SDK for Android **and** iOS enabled, plus an API key. — [Google, Navigation for Flutter and React Native](https://developers.google.com/maps/documentation/cross-platform/navigation) (acc. 2026-10-29) **[documented]**
- Android Navigation SDK 7.0.0+: **target API 36**, **min API 24**, device needs Google Play services, **2 GB RAM**, OpenGL ES 2.0; attributions required; cannot coexist with the Maps SDK. — [Google, Navigation SDK setup overview](https://developers.google.com/maps/documentation/navigation/android-sdk/setup-overview) (acc. 2026-10-29) **[documented]**
- Official RN package: "React Native library (**Beta**) for bringing Google Navigation SDK to Android and iOS apps"; "Beta until it reaches version 1.0 … breaking changes may be introduced." — [googlemaps/react-native-navigation-sdk](https://github.com/googlemaps/react-native-navigation-sdk) (acc. 2026-10-29) **[documented]**
- Compatibility: "tested and verified with **React Native 0.87.0**"; "requires React Native **0.87+** with the new architecture (Fabric & TurboModules)"; "If you need support for earlier React Native versions, use version **0.16.3**." — [googlemaps/react-native-navigation-sdk](https://github.com/googlemaps/react-native-navigation-sdk) (acc. 2026-10-29) **[documented]**
- Platform minimums for the RN wrapper: Android SDK 24+, iOS 16.0+; requires Jetifier, core library desugaring, Kotlin Gradle Plugin 2.3.0+ (RN 0.87 bundles 2.2.0, so override to 2.3.21), and iOS `UIBackgroundModes` = `location` + `audio`. — [googlemaps/react-native-navigation-sdk](https://github.com/googlemaps/react-native-navigation-sdk) (acc. 2026-10-29) **[documented]**
- Terms dialog is mandatory before init (`showTermsAndConditionsDialog()`), and `NavigationSessionStatus` distinguishes `NOT_AUTHORIZED`, `TERMS_NOT_ACCEPTED`, `LOCATION_PERMISSION_MISSING`, `NETWORK_ERROR`. — [googlemaps/react-native-navigation-sdk](https://github.com/googlemaps/react-native-navigation-sdk) (acc. 2026-10-29) **[documented]**
- Turn-by-turn: `setDestinations()` → `startGuidance()`, listeners `setOnTurnByTurn`, `setOnArrival`, `setOnRouteChanged`, `setOnReroutingRequestedByOffRoute`, `setOnTrafficUpdated`, `setOnRemainingTimeOrDistanceChanged`; background location via `setBackgroundLocationUpdatesEnabled` (iOS) and `TaskRemovedBehavior.CONTINUE_SERVICE` (Android). — [googlemaps/react-native-navigation-sdk](https://github.com/googlemaps/react-native-navigation-sdk) (acc. 2026-10-29) **[documented]**
- Pricing: **Navigation Request** SKU, Enterprise tier, 1,000 free then **$25.00/1,000**. — [Google, Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29) **[documented]**
- Coverage for `PS` Palestine in the Navigation SDK: Traffic Layer **—**, Driving Directions **⬤**, Walking **⬤**, Two-Wheeled **—**, Biking **—**, Speed Limits **—**, Traffic Lights/Stop Signs **—**, Real-Time Disruptions **—**. — [Google, Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk) (last updated 2026-10-20; acc. 2026-10-29) **[documented]**
- The Flutter/RN navigation plugins are "not a Google Maps Platform Core Service", so TSS/SLA/deprecation policy do not apply to the library code (the underlying services still do). — [Google, Navigation for Flutter and React Native](https://developers.google.com/maps/documentation/cross-platform/navigation) (acc. 2026-10-29) **[documented]**

### Inferences
- For Fastship today, the Navigation SDK is **not shippable on RN 0.86.3** without either (a) pinning the wrapper to `0.16.3` — which predates the 0.87/new-arch requirement and therefore needs its own compatibility test — or (b) upgrading to RN 0.87, which Expo SDK 57 does not provide **[inferred from the two version statements]**.
- Adopting it would also force removing the Maps SDK from the driver binary (Google: cannot coexist), which conflicts with the current `react-native-maps` Google-provider plan for Android **[inferred]**.
- Even if integrated, PS turn-by-turn would have no traffic, no speed limits, and no real-time disruptions; the guidance line itself is supported (driving ⬤) **[inferred from coverage table]**.
- A signed sales contract is not documented as a prerequisite, but the only listed price is an Enterprise SKU — budget/ procurement review is still warranted before commitment **[inferred]**.

### Gaps
- I did not find a sentence in the fetched docs that says "no contract required"; absence of a requirement is not proof. Confirm with Google Sales before planning a driver-facing launch.
- Whether the RN wrapper's `0.16.3` works with RN 0.86/new architecture was not verified.
- iOS Navigation SDK minimum OS/pricing parity was not separately fetched (the RN wrapper states iOS 16+).

---

## Known integration pitfalls: Play services, pods, app size, Fabric, prebuild, CORS, key leakage, billing

### Takeaway
The expensive pitfalls are predictable: Android needs Google Play services and the right SHA-1; iOS needs the GoogleMaps pod + first-line `provideAPIKey`; Expo Go cannot carry your production key; `expo prebuild` in SDK 57 now wipes native dirs by default; and every retry or abandoned Places session is billable.

### Cited Findings
- Android blank map is usually a key/restriction problem; react-native-maps documents both "blank background" and "grey screen" key failure modes, and requires `play-services-maps >= 18.0.0`. — [react-native-maps, installation.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) (acc. 2026-10-29) **[documented]**
- Google Play services must be installed/enabled on the device; emulators need a system image **with Google APIs**. — [react-native-maps, installation.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) (acc. 2026-10-29) **[documented]**
- iOS: `pod 'react-native-maps/Google'` + `GMSServices.provideAPIKey` as the first call; Info.plist **must** contain `NSLocationWhenInUseUsageDescription` even if you do not access location, because the Google Maps iOS SDK contains location code. — [react-native-maps, installation.md](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) (acc. 2026-10-29) **[documented]**
- Expo SDK 57 change: "`expo prebuild` now clears and regenerates the native **android** and **ios** directories by default; pass `--no-clean` to apply changes to the existing folders instead." — [Expo, SDK 57 changelog](https://expo.dev/changelog/sdk-57) (published 2026-06-30; acc. 2026-10-29) **[documented]**
- Expo SDK 57 ships **React Native 0.86** (0.86.3 as of `expo@57.0.17`); React 19.2 unchanged. — [Expo, SDK 57 changelog](https://expo.dev/changelog/sdk-57) (acc. 2026-10-29) **[documented]**
- Fabric is live in the RN Maps release line: v1.29.9 fixes "size Google marker icon view from **Fabric** layout metrics". — [react-native-maps releases](https://github.com/react-native-maps/react-native-maps/releases) (acc. 2026-10-29) **[documented]**
- WebView/referrer caveat: webviews "will likely restrict the `Referer` header to the `Origin` … or omit sending it altogether", which can make website-restricted keys fail. — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29) **[documented]**
- Billing: Maps SDK mobile loads are unlimited/free, but Dynamic Maps, Static Maps, Routes, Autocomplete, Place Details, Geocoding and Navigation Requests are metered per SKU with monthly free caps. — [Google, Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29) **[documented]**
- "The first 12 Autocomplete (New) requests" are billed per request even inside a session; requests 13+ are free; incomplete sessions revert to per-request. — [Google, Autocomplete and session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing) (acc. 2026-10-29) **[documented]**

### Inferences
- Because the Android app already ships without a Google key and uses a WebView map, adding Google Maps means a **new native dependency + new key + new build**, not an OTA update. Plan a store release, not an `eas update` **[inferred]**.
- App size: Android likely grows little (Play Services is on-device); iOS grows substantially because the GoogleMaps framework is statically/dynamically linked into the app. No number was found, so treat size as a measurement task on a real build, not an estimate **[unverified]**.
- Debug vs release SHA-1 is the most common "works on my machine, blank in Play" failure; register both, and re-check after Play App Signing key rotation **[inferred from Expo's two-SHA-1 instructions]**.
- Keeping the WebView/MapLibre path as a runtime fallback is cheaper than trying to make Google Maps degrade gracefully offline — the repo already has the fallback machinery **[inferred from `route-map.android.tsx`]**.

### Gaps
- CORS behaviour for direct browser → Routes/Places/Geocoding calls is unverified; Google's guidance points to a proxy, which also solves key secrecy.
- No measured APK/IPA size delta, cold-start impact, or memory impact for Google Maps on RN 0.86 was found or measured.
- I did not verify Expo Go's bundled Google Maps key behaviour on iOS (whether `PROVIDER_GOOGLE` renders in Expo Go without your own key).

---

## Palestine / West Bank specifics that change the design

### Takeaway
Google has map tiles, geocoding, and driving/walking directions for `PS`, but **no traffic layer, no speed limits, no biking, no two-wheeled routing, and no real-time disruptions**. Design the product around static/ETA-based routing, hide traffic UI, and own the checkpoint/landmark dataset yourself.

### Cited Findings
- Core coverage for `PS`: Map Tiles 2D/3D ⬤, Maps JavaScript 3D —, Geocoding ⬤, Traffic Layer —, Driving Directions/Snap to Roads ⬤, Biking —, Walking ⬤, Speed Limits —. — [Google, Coverage details](https://developers.google.com/maps/coverage) (acc. 2026-10-29) **[documented]**
- Navigation SDK coverage for `PS`: Traffic —, Driving ⬤, Walking ⬤, Two-Wheeled —, Biking —, Speed Limits —, Traffic Lights/Stop Signs —, Real-Time Disruptions —. — [Google, Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk) (acc. 2026-10-29) **[documented]**
- Autocomplete supports `includedRegionCodes` (ccTLD) and `regionCode` for formatting; `PS` is a listed region code. — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (acc. 2026-10-29); [Google, Coverage details](https://developers.google.com/maps/coverage) (acc. 2026-10-29) **[documented]**
- Arabic is a supported `language` for the JS API, and the API handles bidi text natively with `dir='rtl'` recommended on the page. — [Google, Localize the Map](https://developers.google.com/maps/documentation/javascript/localization) (acc. 2026-10-29) **[documented]**
- The app currently disables RTL at the Expo level: `expo-localization` plugin `"supportsRTL": false`. — `app.json` (acc. 2026-10-29) **[observed]**

### Inferences
- A West Bank bounding box is the only reliable "Palestine-only" search restriction; country-code restriction alone can include Gaza and may behave unexpectedly around Jerusalem **[inferred]**.
- Because traffic and speed limits are absent, ETA should be presented as "estimated" and recalculated from your own completed-trip history; do not promise live traffic **[inferred]**.
- Arabic map labels on native: JS API can be forced with `language=ar`; native Google Maps SDKs generally follow device locale, and RN Maps exposes no language prop — so the only guaranteed Arabic map is the web map, unless the device is Arabic **[inferred / unverified]**.
- Checkpoints/landmarks must be an app-owned table (Arabic + English name, coordinates, approach direction, typical delay) joined to Places results by proximity, not by place type **[inferred]**.

### Gaps
- No source documents how Google labels the West Bank on tiles (e.g. "Palestine", "West Bank", "Israel") at different zoom levels; this is politically and legally sensitive and must be reviewed with the client, not inferred.
- No source confirms whether Places results in East Jerusalem are returned under `ps` or `il`; needs live testing.
- I did not verify geocoding quality for informal West Bank addresses (e.g. "behind the mosque, Beitunia") — likely poor, but untested.

---

## Minimal implementation sequence for Fastship

### Takeaway
Ship it in seven steps: enable APIs → create four keys → wire the config plugin and rebuild → swap the three `route-map.*` implementations behind the existing props → add a server-side Routes/Places/Geocoding proxy → localize to `ar`/`PS` and hide traffic → test keys, offline, RTL, and store builds.

### Cited Findings
- Expo config plugin install: `npx expo install react-native-maps`, add `["react-native-maps", { androidGoogleMapsApiKey, iosGoogleMapsApiKey }]`, use `provider={PROVIDER_GOOGLE}`, then rebuild. — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- Key creation steps (Android): enable Maps SDK for Android → copy SHA-1 (Play Console → App integrity for release; Expo credentials for dev builds) → create key → Android apps restriction with package + SHA-1 → save. — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- Key creation steps (iOS): enable Maps SDK for iOS → create key → iOS apps restriction with bundle ID → save → add `iosGoogleMapsApiKey`. — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/) (acc. 2026-10-29) **[documented]**
- Web service calls should go through a proxy that "construct[s] your Google Maps Platform requests on the proxy server" and "post-process[es] the responses … filter out data that the client doesn't need"; always require authentication for client access. — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29) **[documented]**
- Routes request/response contract and required field mask. — [Google, Get a route](https://developers.google.com/maps/documentation/routes/compute_route_directions) (acc. 2026-10-29) **[documented]**
- Autocomplete session + Place Details termination contract. — [Google, Autocomplete and session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing) (acc. 2026-10-29) **[documented]**
- Web localization contract (`language=ar`, `region=PS`, `dir='rtl'`). — [Google, Localize the Map](https://developers.google.com/maps/documentation/javascript/localization) (acc. 2026-10-29) **[documented]**

### Inferences
- Concrete order for this repo:
  1. Cloud project + billing; enable Maps SDK Android, Maps SDK iOS, Maps JavaScript API, Routes API, Places API (New), Geocoding API.
  2. Keys: `wind-android` (package `ps.wind.app`, debug SHA-1 + Play SHA-1, APIs: Maps SDK Android), `wind-ios` (bundle `ps.wind.app`, Maps SDK iOS), `wind-web` (referrers, Maps JS + Places UI/Data + Routes), `wind-server` (IP allowlist, Routes + Places + Geocoding, no referrer/package restriction).
  3. `app.json`: add the `react-native-maps` plugin with keys from `process.env`; ensure `.easignore` does not exclude `.env` (Expo documents this exact failure). Keep `provider={PROVIDER_GOOGLE}` on Android; decide iOS provider explicitly.
  4. Replace implementations, not call sites: `src/route-map.tsx` (web → `@vis.gl/react-google-maps`), `src/route-map.native.tsx` (iOS/Android → `react-native-maps` with `PROVIDER_GOOGLE`), delete `src/route-map.android.tsx`'s WebView path or keep it as the failure fallback. Preserve `RouteMapProps`, `PinMapProps`, `canPin`.
  5. Server (`server/main.ts`): add `POST /api/routes` (proxy to `computeRoutes`, strip to `duration`, `distanceMeters`, `encodedPolyline`), `GET /api/places/autocomplete` (session token minted server-side, `locationRestriction` West Bank box, `languageCode=ar`), `GET /api/places/:id`, `GET /api/geocode`. Never expose `wind-server`.
  6. UI: traffic toggle hidden for PS; `userInterfaceStyle` follows app theme; driver marker `rotation` + `flat`; `animateCamera` follow; `fitToCoordinates` from `onLayout`; sheet drag toggles `scrollEnabled`.
  7. Tests: debug build on a Play-services emulator, release build via internal testing (Play SHA-1), iOS simulator + device (pod install), web (RTL + Arabic), airplane mode (fallback), and a key-misconfiguration test (wrong SHA-1 must show blank → confirms restrictions are live).
- Estimated integration surface is small (three files + one server module) because the repo already isolates maps behind `RouteMap`; the risk is build/key configuration, not UI code **[inferred]**.

### Gaps
- The repo has no `research_notes` sibling for server conventions; the proxy shape above is a proposal, not an existing pattern I verified.
- I did not verify that `process.env` interpolation works in `app.json` (Expo docs show it, but this repo uses static `app.json`, not `app.config.ts`); a migration to `app.config.ts` may be required.

---

## Source conflicts, confidence, and open questions

### Takeaway
Coverage is strong and primary-sourced; two claims are version-sensitive and one is a genuine conflict of ecosystems: `@react-google-maps/api` is now commercial, while `@vis.gl/react-google-maps` remains MIT. The Navigation SDK/RN 0.86 mismatch is the single most consequential finding for this app.

### Cited Findings
- Docs freshness: Google pages fetched show "Last updated 2026-10-28" (Routes, Places, Maps Static, pricing, coverage); Navigation SDK pages 2026-10-20; Expo react-native-maps page modification date 2026-08-10; Expo Maps 2026-07-28. — sources above (acc. 2026-10-29) **[documented]**
- `react-native-maps` 1.29.11 (2026-09-27) is newer than the repo's 1.27.2. — [releases](https://github.com/react-native-maps/react-native-maps/releases) (acc. 2026-10-29); `package.json` **[documented + observed]**
- `@react-google-maps/api` v3+ commercial vs `@vis.gl/react-google-maps` MIT. — [README](https://github.com/JustFly1984/react-google-maps-api) and [README](https://github.com/visgl/react-google-maps) (acc. 2026-10-29) **[documented]**
- Navigation SDK RN wrapper: RN 0.87+, tested 0.87.0; repo is RN 0.86.3. — [README](https://github.com/googlemaps/react-native-navigation-sdk) (acc. 2026-10-29); `package.json` **[documented + observed]**
- Palestine traffic layer is "—" in both the core coverage table and Navigation SDK coverage table. — [coverage](https://developers.google.com/maps/coverage); [nav coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk) (acc. 2026-10-29) **[documented]**

### Inferences
- Confidence: **high** for product/legacy status, key restrictions, pricing, coverage, and Expo/RN version facts (all primary, dated). **Medium** for implementation sequencing and gesture behaviour (reasoned from documented props, not tested). **Low/unverified** for app-size, CORS, Arabic label behaviour on native, and checkpoint data.
- The report writer should not present any "supported in Expo Go" claim as meaning "Google Maps with your key works in Expo Go"; Expo's own wording separates testing from store deployment **[inferred]**.

### Gaps
- No live device/build test was performed; every runtime claim is documented or inferred, never observed on a build.
- Not verified: Google Maps Platform availability/terms for a Palestine billing address; iOS App Store review implications of Google Maps + `NSLocationWhenInUseUsageDescription`; Play Store data-safety implications of Places/Routes data flows.
