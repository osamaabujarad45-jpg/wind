# Google Maps integration for Fastship/Wind — repository-level integration plan

Read-only review of the working tree at `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship` on **2026-10-29**. No files were modified. Line numbers are from that working tree and may drift because another session is editing concurrently. This note is deliberately repo-first: the sibling notes in this folder cover pricing/terms (`pricing_terms.md`), Palestine coverage (`palestine_coverage.md`) and SDK/Expo specifics (`sdk_expo.md`); this one answers "which files change, in what order, and what proves it works".

**Headline:** the app already isolates every map behind `RouteMap`/`PinMap` props, so a Google **native** map is a small provider switch. But Google cannot be dropped in as a pure rendering swap: the routing contract (`RoadRoute` from `/api/route`), the 15-second public ETA poll, the 110 m approach re-route and the checkpoint-aware OSRM detours all touch the integration. The current call pattern would multiply Google route spend by roughly 10–40×, and Google's terms forbid the obvious hybrid (Google routing drawn on MapLibre). The cheapest honest first step is the server proxy plus keys, not the UI.

## 1. Every rendering and route touchpoint in the repository

### Takeaway
There are exactly three map renderers (web MapLibre, iOS Apple Maps, Android WebView MapLibre), one shared props/diagram contract, and one server routing module. `react-native-maps` 1.27.2 is already a dependency; no Google key is used today. OSRM is not only the map line: it also feeds pricing, booking feasibility and dispatch ETA, so it cannot be deleted in a Google build.

### Cited Findings

**Rendering surface**

| File | What it does | Google impact |
|---|---|---|
| `src/route-preview.tsx:6-20` | `RouteMapProps` and `PinMapProps`: `pickup`, `dropoff`, titles, `driver`, `stale`, `focus`, `height`, `road`, `approach`, `closed` | Keep unchanged; this is the provider-neutral contract |
| `src/route-preview.tsx:25-49` | Hand-drawn diagram used while a map loads and when it fails | Keep unchanged; fallback for every mode |
| `src/route-map.tsx:13` | `export const canPin = true` | Keep; `PinSheet` and Roads gate on it |
| `src/route-map.tsx:17` | Vendored MapLibre path `/vendor/maplibre-6.12.0` | Web-only; Google web needs its own loader |
| `src/route-map.tsx:51-117` | `useMap`: loads MapLibre, creates the map, waits for a real vector tile, 25 s failure timer, retries on `online` | Web-only; Google has a `tilesloaded` event, but the MapLibre vector-tile proof does not transfer; native uses `onMapLoaded` |
| `src/route-map.tsx:148-313` | `RouteMap`: markers, road/approach GeoJSON lines, driver glide, accuracy halo, camera follow, recenter | Web-only; a Google web component must reimplement this imperatively |
| `src/route-map.tsx:316-343` | `PinMap`: fixed centre pin, `moveend` → `onChange` | Web-only |
| `src/route-map.native.tsx:11` | Comment: "iOS: Apple Maps, no key. Android uses route-map.android.tsx" | This is the current platform split |
| `src/route-map.native.tsx:65-76` | `MapView` with `initialRegion`, `onMapReady`, `onPanDrag`, `onRegionChangeComplete` | Add `provider={PROVIDER_GOOGLE}`; keep the rest |
| `src/route-map.native.tsx:69` | `Polyline` from `props.road` | Same component works with Google |
| `src/route-map.native.tsx:70-74` | Pickup/dropoff/closed markers | Same; verify Google marker rendering/attribution |
| `src/route-map.native.tsx:75,89-122` | `Car`: per-frame `setState` glide, `Marker` with Ionicons child, `Circle` accuracy, `rotation`/`flat` | Works on Google, but per-frame custom marker updates can re-rasterise on Android; needs `tracksViewChanges`/asset testing |
| `src/route-map.native.tsx:130-156` | `PinMap`: `showsUserLocation`, centre pin | Same; test inside the sheet |
| `src/route-map.android.tsx:12` | `PAGE = ${API_URL}/map.html` | Android MapLibre path |
| `src/route-map.android.tsx:18-59` | `MapPage`: WebView, fragment config, `ready`/`failed`/`drawing`/`center` messages, 25 s timer, external links | Keep as the maplibre fallback |
| `src/route-map.android.tsx:62-82` | Android `RouteMap` | Add a Google branch before this |
| `src/route-map.android.tsx:85-95` | Android `PinMap` | Add a Google branch before this |
| `public/map.html:25-70` | Standalone MapLibre page and duplicated map helpers | No change for Google native; keep in step with `map-math` |
| `public/map.html:82-88` | MapLibre map, OpenFreeMap style, cooperative gestures | No change |
| `public/map.html:96-103` | `ready` only after a real vector tile | The Android fallback's readiness proof; not reusable for Google |

**Call sites**

| File | What it does | Google impact |
|---|---|---|
| `src/app/book.tsx:87` | Booking preview: `useApi<RoadRoute>(roadPath(..., 5))` | Must switch to `/api/google/route` in Google mode, otherwise OSRM geometry is drawn on a Google map |
| `src/app/book.tsx:302-303` | `<RouteMap road={preview?.line} closed={preview?.closed} />` | The line source changes with the mode; props stay |
| `src/app/order/[id].tsx:222-224` | Live order map: `road`, `approach`, `closed`, `stale` | Same; `useRoad` supplies the lines |
| `src/app/track/[token].tsx:37` | Public ETA: `useApi('/track/:token/eta', 15_000)` | In Google mode this must not return OSRM lines (see §5) |
| `src/app/track/[token].tsx:61-63` | Public trip map | Google mode either drops ETA/lines or this page stays MapLibre |
| `src/app/track/[token].tsx:77` | `https://www.google.com/maps/search/?api=1&query=...` deep link | Not an API call; leave as is (no key, no billing) |
| `src/app/roads.tsx:66-67,87-94` | Admin checkpoint placement via `PinSheet` | Same `PinMap` contract |
| `src/pin-sheet.tsx:21-26` | `Modal` → `ScrollView` → `PinMap` | Android Google map vs sheet scroll gesture conflict; see §9 |
| `src/road.tsx:15-40` | `useRoad`: trip route at grid 5, approach at grid 3 (~110 m), ETA keep/drop logic, checkpoint aggregation | The central client switch point |
| `src/map-math.ts:95-97` | `roadPath` builds `/route?from=...&to=...&heading=...` | Add a `base` parameter, or a wrapper, for `/google/route` |
| `src/map-math.ts:84` | `etaRange` widens a single ETA into a range | Keep; Google ETA also needs the checkpoint widening |
| `src/map-math.ts:127-140` | `fromDriver` trims the approach line under the car | Keep; works on a decoded Google polyline |

**Server routing and money paths**

| File | What it does | Google impact |
|---|---|---|
| `server/main.ts:2220-2246` | `osrmUrl`, `RoadRoute`, `OsrmRoute`, `osrmRoutes` | Keep; Google is a separate upstream |
| `server/main.ts:2224-2309` | `roadCache` LRU, 200k points, 10 m rounding, checkpoint detours, alternatives | **Must not be reused for Google**: ToS only allows lat/lng caching for 30 days, not route geometry/duration (§3) |
| `server/main.ts:2254-2310` | `roadRoute`: fastest OSRM route, alternatives, forced via-point detours around closed checkpoints, `avoids/through/closed` | Google cannot reproduce this without extra calls; Google mode loses checkpoint-aware detours |
| `server/main.ts:2315-2320` | `GET /api/route`, auth, 120/10 min, heading validation | The model for `GET /api/google/route` |
| `server/main.ts:2323-2354` | `GET /api/track/:token/eta`: OSRM lines, `minutes`, `delayed`, 300/10 min by token hash | Public, anonymous, 15 s polling; a Google version is unaffordable |
| `server/main.ts:1005-1028` | `recommend`: OSRM route → km/minutes → smart price, checkpoint delay | Keep OSRM; fares must not vary with Google traffic/routing |
| `server/main.ts:1054` | `evaluateQuoteFeasibility` with the OSRM line | Keep OSRM; the quote's evidence is tied to the OSRM graph |
| `server/main.ts:1189-1192` | Booking re-checks prohibition on the OSRM line | Keep OSRM |
| `server/main.ts:440-448` | Dispatch ETA provider calls `osrmRoutes`, falls back to `straightLineEta` | Keep OSRM; internal, not drawn on a map |
| `server/domain/quotes.ts:164-185` | Feasibility uses `routeLine`, records provider/graph evidence | Keep OSRM |
| `server/domain/dispatch.ts:38` | `straightLineEta` fallback | Keep |
| `server/main.ts:338-346` | `limit(key, max, window)` and `identityKey(kind, value)` | Reuse for Google quotas |
| `server/main.ts:158-162` | `HttpError`/`fail(status, code)` | Reuse for error mapping |
| `server/main.ts:430-434` | `route(method, path, handler, isPublic)` registration | Reuse |
| `server/main.ts:121-123` | `webCsp`: `script-src 'self'`, `img-src ... openfreemap`, `connect-src ... openfreemap` | Google web needs a wider CSP; Google native does not |
| `server/main.ts:67-115` | `webRoot`, static serving, `map.html` exception | No change for native Google |

**Build and tests**

| File | What it does | Google impact |
|---|---|---|
| `package.json:31` | `react-native-maps` 1.27.2 | Already installed; no new native dependency for the map |
| `package.json:9,30` | Expo ~57.0.31, RN 0.86.3 | Matches the Google/Fabric constraints |
| `package.json:45-46` | `maplibre-gl` and `playwright` dev deps | Playwright can drive the browser scenario |
| `app.config.js:1-3` | Comment: Android uses MapLibre, no Google key needed; `GOOGLE_MAPS_API_KEY` | Split into Android/iOS keys; add a Google build guard |
| `app.config.js:49` | `['react-native-maps', { androidGoogleMapsApiKey: key }]` | Add `iosGoogleMapsApiKey`; pass keys only in Google builds |
| `app.config.js:12-25` | Phone-test build names, schemes, packages, bundle IDs | Those test package/bundle IDs also need key-restriction entries |
| `app.json:10-16` | iOS `bundleIdentifier: ps.wind.app` | iOS key restriction |
| `app.json:17-32` | Android `package: ps.wind.app`, blocked permissions | Android key restriction |
| `app.json:37-65` | Plugins, `expo-localization` `supportsRTL: false` | No plugin change for Google beyond `react-native-maps` |
| `app.json:33-36` | `web.output: "single"` (SPA) | Google web is client-only anyway |
| `.gitignore` | `/android`, `/ios` are generated native folders | Never hand-edit; change `app.config.js` and prebuild |
| `android/app/src/main/AndroidManifest.xml` | Generated; currently no `com.google.android.geo.API_KEY` | The plugin adds it when the Android key is set; do not edit by hand |
| `tests/route.test.mjs:11-36` | Fake OSRM HTTP server + env `OSRM_URL` | The exact pattern for a fake Google upstream |
| `tests/route.test.mjs:48-75` | Auth, validation, reshape, cache hit, heading, errors | Copy the assertions for Google, but assert **no cache** |
| `tests/route.test.mjs:82-114` | Public ETA, null on failure, per-driver/status checks | Google mode should return no OSRM lines here |
| `tests/map.test.mjs:221` | `roadPath` exact string | Update if the signature gains a `base` |
| `tests/map.test.mjs:224-262` | Vendored MapLibre version/source checks, `map.html` helper parity, serving | Rename the web MapLibre file and update the scan |
| `scripts/run-tests.mjs` | Suite list | Add the Google suite |
| `eas.json` | `preview` and `production` environments | Add the two Google key secrets to the right environment |

**What already exists but is easy to miss**

- `src/api.ts:40-98` `useApi` is path-keyed: changing the path (`/route` → `/google/route`) automatically refetches on focus and on driver-grid changes. No new data layer is needed.
- `src/road.tsx:31-33` already keeps the last approach route while the next fetch is pending, keyed by `order.id:driverId:stop`. That logic survives a provider switch; only the error behaviour needs review.
- `src/app/track/[token].tsx:77` already deep-links to Google Maps; that is a URL scheme, not the Maps SDK, and has no terms/cost impact.
- `react-native-maps` 1.27.2 supports Fabric on RN ≥ 0.81.1 (`node_modules/react-native-maps/README.md:23-28`), so the installed version is compatible on paper. Upstream is 1.29.11 with Fabric marker fixes (per `sdk_expo.md`), which matters for the custom driver marker.
- `onMapLoaded` exists and is documented as "called when the map has finished rendering all tiles", iOS Google only + Android (`node_modules/react-native-maps/dist/src/MapView.d.ts:259-265`). That is the correct Google readiness signal; `onMapReady` fires before tiles.

### Inferences
- The props contract is genuinely provider-neutral; `RouteMap`/`PinMap` are the right seam. A Google implementation can be added without touching any screen's JSX.
- The hard coupling is not the component API but the **data path**: `roadPath` → `/api/route` → OSRM `RoadRoute`. Every screen that draws a line gets it from there. A Google mode must switch that path, not just the renderer.
- OSRM must stay in every deployment because `/price`, booking feasibility, dispatch ETA and the fallback all use it. Google is a display/routing layer, not a replacement for the pricing graph.
- The public track page is the outlier: anonymous, 15 s polling, and it draws OSRM lines. It is the main reason a blanket "Google everywhere" switch is not financially or legally clean.

### Gaps
- There is no `ios/` directory in the tree, so the iOS Google pod path is untested here; only EAS/prebuild can produce it.
- No Google key exists in the environment; no live Google call was made for this note.
- The working tree had concurrent edits; exact line numbers may have moved.

## 2. The smallest change that puts Google Maps on Android, iOS and web

### Takeaway
Native is the small change: set the two keys, add `provider={PROVIDER_GOOGLE}`, and give Android a Google branch before its WebView. Web is not small: the current component is written against MapLibre's imperative API and the app's CSP forbids Google's script (`script-src 'self'`, and Google's own CSP guide requires `'unsafe-eval'`). The smallest complete plan is **native Google behind a runtime mode**, with web left on MapLibre, unless web Google is an explicit requirement.

### Cited Findings
- Expo SDK 57 documents the plugin form `["react-native-maps", { "androidGoogleMapsApiKey": ..., "iosGoogleMapsApiKey": ... }]`, says `provider={PROVIDER_GOOGLE}` works on both Android and iOS, and says a rebuild is required after adding the key — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).
- The plugin source confirms the iOS work: it writes `GMSApiKey` into Info.plist, adds `pod 'react-native-maps/Google'` to the Podfile, and inserts `GMSServices.provideAPIKey(...)` before `super.application(...)` in the AppDelegate (`node_modules/react-native-maps/plugin/build/ios.js`). On Android it adds the `com.google.android.geo.API_KEY` meta-data, and removes it when the key is absent (`plugin/build/android.js`).
- Android file resolution: Metro picks `route-map.android.tsx` over `route-map.native.tsx`. Today Android therefore never reaches the `MapView` code. A Google Android build must change `route-map.android.tsx`, not only `route-map.native.tsx`.
- The current Android WebView is a deliberate keyless design: `SPEC-android-map.md:7-25` says "the APK has no Google Maps key" and lists "Google Maps" as out of scope. This is the exact decision a Google switch reverses.
- `app.config.js` already exists and already wraps `app.json`; no migration to `app.config.ts` is needed. This corrects a gap in `sdk_expo.md` ("a migration to app.config.ts may be required").
- `android/` exists locally but is gitignored, and `ios/` does not exist; both are CNG outputs (`.gitignore` `/android`, `/ios`). Expo SDK 57 `expo prebuild` clears and regenerates native directories by default (per `sdk_expo.md`, citing the SDK 57 changelog).
- `onMapLoaded` is the tile-ready callback (`MapView.d.ts:259-265`); `onMapReady` is only "the map is ready" and can fire before tiles.
- Google's Maps JavaScript API CSP guide's samples include `script-src ... 'unsafe-eval' blob:` and Google domains in `img-src`/`connect-src`; its strict-CSP variant also includes `'unsafe-eval'` — [Google, CSP guide](https://developers.google.com/maps/documentation/javascript/content-security-policy). The repo's current `webCsp` is `script-src 'self'` and `connect-src 'self' https://tiles.openfreemap.org` (`server/main.ts:121-123`), and `tests/map.test.mjs:230` explicitly asserts the web map does not use `new Function`/eval. Adding Google web means weakening a tested security boundary.
- `react-native-maps` README says Fabric is supported from 1.26.1+ on RN ≥ 0.81.1 (`node_modules/react-native-maps/README.md:23-28`); the repo has 1.27.2 / RN 0.86.3. Upstream 1.29.11 contains Fabric/marker fixes (per `sdk_expo.md`), so the installed version is compatible but not the latest.

### The smallest complete design

**One build-time renderer flag, one server mode, one downgrade path.**

- `EXPO_PUBLIC_MAP_PROVIDER=google|maplibre` is baked into the JS bundle. It decides whether the Google native SDK/JS API may be used at all.
- `MAP_PROVIDER=google|maplibre` on the server decides whether `/api/google/*` is open. The client's effective mode is `buildGoogle && serverGoogle`; the server can force `maplibre` but can never force a build that lacks Google to use Google.
- `GET /api/config` (public) returns `{ mapProvider }`; the root layout calls `configureMapMode()` once at startup. If that fetch fails, the build default applies; the first `maps_disabled` response downgrades.
- A client-side `downgrade()` switches the whole session to MapLibre/OSRM after a Google map or quota failure. It never switches back up at runtime. This avoids a half-Google/half-MapLibre screen and keeps the terms boundary clean.

**File-by-file**

| File | Change | Size |
|---|---|---|
| `src/map-mode.ts` (new) | Build flag, server `configureMapMode`, `downgradeMapMode`, `useMapMode` via `useSyncExternalStore` | ~30 lines |
| `src/route-map.tsx` (new chooser) | Imports the MapLibre and Google web components, picks by `useMapMode`, re-exports `canPin` | ~20 lines |
| `src/route-map.maplibre.tsx` (moved) | The current `src/route-map.tsx`, unchanged except imports; keeps `LiveMap`, `PinMap`, `canPin` | 0 logic change |
| `src/route-map.google.tsx` (new, web only) | Google JS API loader + `Map`, `Marker`, `Polyline`, `Circle`, camera, glide; shares `map-math` and `RoutePreview` | ~250–350 lines; the largest new file |
| `src/native-map.tsx` (new) | The current `route-map.native.tsx` body, parameterised by a `provider` prop; uses `onMapLoaded` when Google | ~150 lines moved |
| `src/route-map.native.tsx` (iOS) | Thin wrapper: `<NativeMap provider={google ? PROVIDER_GOOGLE : undefined} />` | ~15 lines |
| `src/route-map.android.tsx` | `useMapMode() === 'google' ? <NativeMap provider={PROVIDER_GOOGLE}/> : <LiveMap/>`; keep `MapPage` | ~10 lines + branch |
| `src/map-math.ts` | `roadPath(..., base = '/route')`; callers pass `routeBase()` | ~2 lines |
| `src/road.tsx` | Use `useRouteBase()`; in Google mode use grid 2 (~1.1 km) plus a 1 km/60 s refresh ref (see §5) | ~15 lines |
| `src/app/book.tsx` | Use `useRouteBase()` for the preview `roadPath` | 2 lines |
| `src/app/_layout.tsx` | Fetch `GET /api/config` once and call `configureMapMode()` | ~8 lines |
| `package.json` | Add `@types/google.maps` as a devDependency (types only) if the web Google component is built; otherwise declare a minimal local namespace | 1 line |
| `src/pin-sheet.tsx` | Disable the parent `ScrollView` while the map owns gestures (Android Google) | ~5 lines |
| `app.config.js` | Split keys, iOS key, Google-mode guard, pass keys only in Google builds | ~15 lines |
| `plugins/with-release-guard.js` | Fail an EAS build that sets `EXPO_PUBLIC_MAP_PROVIDER=google` without both native keys | ~5 lines |
| `server/main.ts:121-123` | Widen `webCsp` only when `MAP_PROVIDER=google` **and** web Google is in scope | ~5 lines |
| `tests/map.test.mjs` | Point the MapLibre source scan at `route-map.maplibre.tsx`; add `roadPath` base test | ~5 lines |

**Sketch: `src/map-mode.ts`**

```ts
import { useSyncExternalStore } from 'react';

export type MapMode = 'google' | 'maplibre';
const built: MapMode = process.env.EXPO_PUBLIC_MAP_PROVIDER === 'google' ? 'google' : 'maplibre';
let mode: MapMode = built;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

export const mapMode = () => mode;
export const configureMapMode = (server: MapMode) => {
  const next = server === 'google' && built === 'google' ? 'google' : 'maplibre';
  if (next !== mode) { mode = next; emit(); }
};
export const downgradeMapMode = () => { if (mode !== 'maplibre') { mode = 'maplibre'; emit(); } };
export const useMapMode = () => useSyncExternalStore(subscribe, mapMode, mapMode);
export const routeBase = () => mode === 'google' ? '/google/route' : '/route';
// Hooks must subscribe, not call routeBase(), so a downgrade re-renders the screen that owns the fetch.
export const useRouteBase = () => useMapMode() === 'google' ? '/google/route' : '/route';
```

**Sketch: `app.config.js`**

```js
const provider = process.env.EXPO_PUBLIC_MAP_PROVIDER === 'google' ? 'google' : 'maplibre';
const androidKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
const iosKey = process.env.GOOGLE_MAPS_IOS_KEY;
if (provider === 'google' && (!androidKey || !iosKey)) {
  throw new Error('EXPO_PUBLIC_MAP_PROVIDER=google requires GOOGLE_MAPS_ANDROID_KEY and GOOGLE_MAPS_IOS_KEY');
}
// ...
plugins: [...config.plugins, 'expo-web-browser', 'expo-notifications', 'expo-local-authentication',
  ['react-native-maps', { androidGoogleMapsApiKey: provider === 'google' ? androidKey : undefined,
                          iosGoogleMapsApiKey: provider === 'google' ? iosKey : undefined }],
  './plugins/with-release-guard', ...]
```

Passing `undefined` is important: the plugin removes the Android manifest meta-data and does not add the iOS pod, so a `maplibre` build stays exactly as keyless as today.

**Sketch: Android branch**

```tsx
// src/route-map.android.tsx
export default function RouteMap(props: RouteMapProps) {
  const mode = useMapMode();
  return mode === 'google' ? <NativeMap provider={PROVIDER_GOOGLE} {...props} /> : <LiveMap {...props} />;
}
```

`PinMap` gets the same branch. The existing `MapPage` and `LiveMap` stay untouched as the fallback.

**Sketch: native readiness**

```tsx
<MapView
  provider={provider}
  onMapReady={provider ? undefined : () => setReady(true)}
  onMapLoaded={provider ? () => setReady(true) : undefined}
  // ...
/>
```

The 20 s failure timer then catches a blank Google map (no tiles), not just a missing native view. Keep `onMapReady` for Apple Maps.

**Sketch: web loader (only if web Google is in scope)**

```ts
// src/route-map.google.tsx, web only
const src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
  key: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? '',
  v: 'weekly',
  language: 'ar',
  region: 'PS',
  loading: 'async',
  callback: '__windGoogleMaps',
});
// inject once, resolve on window.__windGoogleMaps, reject on script error/timeout
```

This is the dependency-free path. `@vis.gl/react-google-maps` (MIT) is the alternative if the team prefers a React wrapper and `AdvancedMarkerElement`; it still needs the same key and CSP. Do not use `@react-google-maps/api` v3+, which its README calls commercial software (per `sdk_expo.md`).

### Inferences
- Native-only Google is roughly a 1–2 day code change plus a dev build and a store release; the risk is build/key configuration, not the component.
- Web Google is a 3–5 day change (new component + CSP + loader + tests) and it weakens a security boundary the repo currently tests. It is not required for a native Google pilot.
- Extracting `native-map.tsx` is the only refactor with regression risk on iOS; it is a move, not a rewrite, and the existing iOS behaviour is preserved when `provider` is `undefined`.
- `react-native-maps` 1.27.2 is compatible on paper; upgrading to 1.29.x is a separate, testable change that may fix Fabric marker layout. Do not bundle it with the Google switch.

### Gaps
- No measured APK/IPA size delta. Android already compiles `play-services-maps:19.1.0` and `play-services-location:21.3.0` through `react-native-maps` (`node_modules/react-native-maps/android/build.gradle:100-103`), so the APK delta should be small; iOS gains the GoogleMaps pod only when the iOS key is set. Measure the EAS artifacts before/after.
- Expo Go on iOS with `PROVIDER_GOOGLE` was not tested; the safe assumption is that a development build is required.
- No `ios/` folder exists to inspect the generated Podfile/AppDelegate; EAS prebuild output must be checked.

## 3. Terms: the two compliant modes and what is not allowed

### Takeaway
Google's terms make the choice binary in practice. Google Routes/Geocoding/Places content cannot be used "with or near a non-Google Map"; Google map tiles plus OSRM route lines is the inverse hybrid and, while not named as explicitly, is broad enough under the "link a Google Map to non-Google Maps Content" example that it should be treated as prohibited until Google says otherwise in writing. The compliant modes are **full Google** (Google map + Google APIs) and **current** (MapLibre/Apple + OSRM). A runtime flag may choose between them, but a screen must never mix them.

### Cited Findings
- **No use with non-Google maps:** "Customer will not use the Google Maps Core Services with or near a non-Google Map in a Customer Application." Examples: "(i) display or use Places content on a non-Google Map, (ii) display Street View imagery and non-Google Maps on the same screen, or (iii) link a Google Map to non-Google Maps Content or a non-Google Map." — [Google Maps Platform ToS §3.2.3(e)](https://cloud.google.com/maps-platform/terms).
- **Routes specifically:** "Customer must not use Google Maps Content from the Routes API in conjunction with a non-Google map." — [Service Specific Terms §19.2](https://cloud.google.com/maps-platform/terms/maps-service-terms). Geocoding §6.2 and Places §14.2 say the same.
- **Caching:** "Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms" — [ToS §3.2.3(b)](https://cloud.google.com/maps-platform/terms). The permitted route-caching allowance is only "latitude (lat) and longitude (lng) values ... for up to 30 consecutive calendar days" — [Service Specific Terms §19.3](https://cloud.google.com/maps-platform/terms/maps-service-terms). Route geometry, distance and duration are not in that allowance.
- **Geocoding exception:** lat/lng, `formatted_address` and structured address values may be cached indefinitely **only** to support the direct end-user functionality of the app that made the request, not as a replacement for further calls, logically isolated per end user and not shared across users — [Service Specific Terms §6.3.2](https://cloud.google.com/maps-platform/terms/maps-service-terms).
- **Google IDs** (`place_id`) may be cached indefinitely — [Service Specific Terms §A.3](https://cloud.google.com/maps-platform/terms/maps-service-terms).
- **Attribution:** display all Google-provided branding/logos/notices and do not modify, obscure or delete them — [ToS §3.2.2(b)](https://cloud.google.com/maps-platform/terms). The native SDK draws the logo/attribution itself; the app must not cover it (the current recenter button sits bottom-right at 34 px, `src/route-map.native.tsx:125`; verify it does not cover Google's logo/attribution controls on each platform and move it if it does).
- **Terms/privacy flow-down:** the app's terms must tell users it includes Google Maps features/content and that use is subject to Google's End User Additional Terms and Privacy Policy — [ToS §3.2.2(a)(i)](https://cloud.google.com/maps-platform/terms). The repo's `server/terms.html` and `server/privacy.html` need this text.
- **Data collection:** Google collects and receives search terms, IP addresses and lat/lng, and may use/retain them to provide and improve Google products — [ToS §4.4(a)](https://cloud.google.com/maps-platform/terms). The privacy page must disclose this in addition to the flow-down notice.
- **No PII to Google:** "Customer will not provide to Google (1) any End User's personally identifiable information; or (2) any European End User's Personal Data" — [ToS §4.4(c)(ii)](https://cloud.google.com/maps-platform/terms). The proxy must send only the address/landmark text and coordinates, never `contact`, `recipientPhone`, `pickupNote` or a user id.
- **Planning-only disclaimer:** "GOOGLE MAPS CORE SERVICES ARE PROVIDED FOR PLANNING PURPOSES ONLY. INFORMATION ... MAY DIFFER FROM ACTUAL CONDITIONS" — [ToS §13](https://cloud.google.com/maps-platform/terms).
- **Places without a map:** predictions may be shown without a map, but then the Google logo must appear inline with the search field/results; if a map is shown, it must be a Google map — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) (page summary) and the legacy page's explicit wording ("If you do show a map, it must be a Google map ... include the Google logo displayed inline with the search field/results").
- **The one documented mixed-stack exception:** Places UI Kit may be used "with or without any map, including a non-Google Map", and that clause prevails over the No Use with Non-Google Maps clause — [Service Specific Terms §15.1](https://cloud.google.com/maps-platform/terms/maps-service-terms). Fastship is not using Places UI Kit; do not assume the exception applies to raw Places API.
- **No traffic in Palestine:** Google's Navigation SDK coverage marks `PS` Traffic Layer `—`, Real-Time Disruptions `—`, Speed Limits `—`, while Driving and Walking are `⬤` — [Google, Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk). The same negative is in the core coverage table per `sdk_expo.md`/`palestine_coverage.md`.
- **Routing quality is the product risk:** the 7amleh finding in `reports/Low cost Uber quality stack.md:33` — Google routed Ramallah–Nablus through Israel at about 4.5 hours versus 45 minutes through the West Bank, and ignored movement restrictions. Treat as dated evidence to re-test, not a permanent fact, but it is the reason a Google switch must be route-tested before launch.

### The two modes

| Surface | Mode `maplibre` (today) | Mode `google` |
|---|---|---|
| Web map | MapLibre + OpenFreeMap (`src/route-map.tsx`) | Google Maps JavaScript API + Google map tiles |
| iOS map | Apple Maps via `react-native-maps` (`route-map.native.tsx`) | Google Maps SDK for iOS via `react-native-maps` + `PROVIDER_GOOGLE` |
| Android map | MapLibre in a WebView (`route-map.android.tsx` + `public/map.html`) | Google Maps SDK for Android via `react-native-maps` + `PROVIDER_GOOGLE` |
| Trip/approach route | OSRM `/api/route` | Google Routes via `/api/google/route` |
| Geocoding/autocomplete | App landmarks + city centres; no geocoder | Google Geocoding/Places via `/api/google/geocode`, `/api/google/autocomplete` |
| Price/booking/dispatch | OSRM (server) | OSRM (server, internal only) |
| Public track page | OSRM lines + ETA | Recommended: stay `maplibre` (no Google content); see §5 |
| Checkpoint avoidance | OSRM alternatives + forced via-point detours | No detour; markers/warnings only (v1) |
| Traffic | Own road reports | Google traffic unavailable in PS; do not show a traffic UI |

**Not allowed / not safe**

1. **Google Routes/Geocoding/Places drawn on MapLibre.** Explicitly prohibited: §19.2 (Routes), §6.2 (Geocoding), §14.2 (Places), and §3.2.3(e).
2. **Caching Google routes.** The existing `roadCache` (`server/main.ts:2224-2309`) is an LRU of full geometry and durations; using it for Google would violate §19.3 and §3.2.3(b). Only lat/lng may be cached, 30 days; route geometry/duration may not.
3. **A global geocode/places cache.** §6.3.2 allows a per-user, user-facing cache, not a shared table reused across riders. `place_id` is the only safe long-lived key.
4. **Google map tiles + OSRM route line.** Not expressly named in §3.2.3(e), but example (iii) ("link a Google Map to non-Google Maps Content") is broad enough that it should be treated as prohibited. Do not ship this and call it compliant; get written confirmation from Google if it is ever considered.
5. **Hiding or covering the Google logo/attribution**, including placing the recenter button over the attribution.
6. **Sending PII to Google** (phone, name, contact, notes, user id); the proxy accepts address text and coordinates only.
7. **Using Google content to train/test models**, or bulk-downloading/scraping it.
8. **A traffic layer/toggle in Palestine.** The data is not there; showing a control that renders nothing is a product lie.

### Inferences
- The safest product architecture is one provider per surface, chosen at build/startup, with a whole-session downgrade. That is what §2's `map-mode.ts` implements.
- Google mode loses the app's best differentiator: OSRM's checkpoint-aware alternatives and forced detours. Google can route around a closure only if the app supplies via-points; that would be 5–10 extra Google calls per re-route and still lacks the app's closure semantics. Do not pretend Google mode is feature-parity.
- The public track page is the hardest case. It is anonymous and high-fanout; putting Google Routes behind it is unaffordable (§5). Keeping it on MapLibre/OSRM while the authenticated app is Google creates a mixed-provider product. That is a legal-review question, not an engineering one. The conservative reading is: if the product ships Google mode, the public page must either use Google (and drop live ETA/line) or the product must stay `maplibre`.
- Platform-specific builds (native Google, web MapLibre) may be argued as separate Customer Applications, but that is exactly the kind of argument to get in writing, not to assume.

### Gaps
- Whether platform-specific builds count as one "Customer Application" under §3.2.3(e) is not addressed by the terms; counsel/Google confirmation needed.
- The exact visual attribution spec for Routes/Places on native (logo placement, "Powered by Google" asset) was not fetched; the ToS obligation is clear, the pixel spec is not.
- Whether Google Maps Platform is contractable from a Palestinian billing address is unverified (also a gap in `pricing_terms.md`).
- Google's current Ramallah–Nablus route and checkpoint behaviour needs a live test; the 7amleh evidence is undated.

## 4. Server-side proxy design

### Takeaway
Add three authenticated GET endpoints that speak the app's existing shapes, call Google with POST + field masks, and never expose the server key. Reuse `route()`, `limit()`, `identityKey()`, `fail()`/`HttpError`, and the `RoadRoute` shape. Do **not** reuse `roadCache`; Google responses may only be deduplicated in flight, not cached. The proxy is the right first deliverable because it can ship dark (`MAP_PROVIDER=maplibre`) with no client change.

### Cited Findings
- The repo's route registration is `route(method, path, handler, isPublic)` with `:id` → `(\d+)` (`server/main.ts:430-434`); handlers receive `{ user, body, params, query, req }`.
- `limit(key, maximum, windowMs)` is a durable fixed-window counter; `identityKey(kind, value)` hashes the value (`server/main.ts:338-346`). Use `identityKey('google-route', user.id)` so the key is not a raw id.
- `fail(status, code)` throws `HttpError`; the HTTP layer returns `{ error: code }` (`server/main.ts:158-162`, `:2817-2819`). The client's `errorCode` reads that shape (`src/api-client.ts`, used by `useApi`).
- Routes API: POST `https://routes.googleapis.com/directions/v2:computeRoutes`, JSON body, `X-Goog-Api-Key`, and a required `X-Goog-FieldMask`. The documented example uses `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline` — [Google, Get a route](https://developers.google.com/maps/documentation/routes/compute_route_directions).
- `routingPreference` is `TRAFFIC_UNAWARE` by default; `TRAFFIC_AWARE`/`TRAFFIC_AWARE_OPTIMAL` are billed at a higher rate — [Google, Set the level of traffic data](https://developers.google.com/maps/documentation/routes/config_trade_offs). In PS, traffic is unavailable, so `TRAFFIC_UNAWARE` is both cheaper and honest.
- Autocomplete (New): POST `https://places.googleapis.com/v1/places:autocomplete`, body `input`, `languageCode`, `includedRegionCodes`, `locationBias`/`locationRestriction`, `sessionToken`; field mask `X-Goog-FieldMask: suggestions.placePrediction...` — [Google, Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete).
- Geocoding: GET `https://maps.googleapis.com/maps/api/geocode/json?address=...&language=...&region=...&key=...`; it returns HTTP 200 with a `status` field (`OK`, `ZERO_RESULTS`, `OVER_QUERY_LIMIT`, `REQUEST_DENIED`, `INVALID_REQUEST`, `UNKNOWN_ERROR`), so map the status, not only the HTTP code — [Google, Geocoding requests](https://developers.google.com/maps/documentation/geocoding/requests-geocoding).
- Place Details (New): GET `https://places.googleapis.com/v1/places/{placeId}` with `X-Goog-FieldMask`; fields `id`, `formattedAddress`, `location`, `displayName` are enough to turn a prediction into a pin.
- The app's `RoadRoute` is `{ km, minutes, line, avoids, through, closed }` (`server/main.ts:2222`). `line` is `[lng, lat][]`, rounded to 1e-5 (`:2245`). Returning exactly this shape means `src/road.tsx` and every screen stay unchanged.
- `useApi` is path-keyed and keeps the last data on error (`src/api.ts:40-98`); `roadPath` is the only path builder (`src/map-math.ts:95-97`).
- The fake-OSRM test starts a local HTTP server, sets `OSRM_URL`, imports `server/main.ts`, and asserts request URL/response reshaping (`tests/route.test.mjs:11-36`, `:48-75`). The same pattern works for Google with `GOOGLE_ROUTES_URL`/`GOOGLE_GEOCODING_URL`/`GOOGLE_PLACES_URL` overrides.

### Endpoint contract

All three are authenticated (`route(..., isPublic=false)`), return JSON, and never return raw Google payloads or the key.

**`GET /api/google/route?from=31.9038,35.2034&to=32.2211,35.2544&heading=90&order=123`**

- `from`, `to`: required `lat,lng`; validate with `pointOf` (`server/main.ts:992-996`) and range checks.
- `heading`: optional, 0–359, accepted for signature compatibility but **ignored in v1**. Google's Routes waypoint/location modifiers can express heading/side-of-road, but that path was not verified for this use; do not claim a bearing hint.
- `order`: optional integer; enables the per-order cap.
- Response 200: `{ km: 61.2, minutes: 55, line: [[35.2034,31.9038], ...], avoids: [], through: [], closed: [] }`.
- `km = Math.round(distanceMeters / 100) / 10`; `minutes = Math.max(1, Math.round(seconds / 60))`; `line` from `decodePolyline`, rounded to 1e-5, at least 2 points.
- `avoids/through/closed`: **empty in v1**. Google mode does not run the checkpoint detour; returning empty is honest. If the product needs the no-entry markers, fetch `/api/roads` separately in the screen rather than pretending the route avoided them.
- Errors: 400 `invalid_point`/`invalid_heading`; 404 `no_route`; 429 `too_many_attempts`; 503 `maps_disabled` (kill switch or wrong mode), `maps_quota` (daily/per-order cap), `maps_unavailable` (Google 5xx/timeout/key failure).

**`GET /api/google/geocode?q=...&lang=ar` or `?placeId=...&lang=ar&session=...`**

- `q`: 3–200 chars; reject 7+ consecutive digits (`/\+?\d{7,}/`) as a probable phone number, because Google must not receive PII. This is a trust-boundary guard, not a UX restriction.
- `placeId`: `^[A-Za-z0-9_-]{10,300}$`; resolves via Place Details (New), which is also how a selected autocomplete prediction becomes a pin.
- `lang`: `ar` or `en`; default `ar` for this market.
- Response 200: `{ results: [{ latitude, longitude, formatted, placeId }] }`, max 3 for a text query; for `placeId`, a single object is fine.
- Geocoding request: `address=q`, `language`, `region=ps`, `components=country:PS` (bias; East Jerusalem may still come back as `il`), `key`.
- Place Details request: `X-Goog-FieldMask: id,formattedAddress,location,displayName`, `languageCode=ar`; `sessionToken` only if sessions are enabled (§ below).
- Errors: 400 `invalid_query`; 404 `not_found`; 503 `maps_*`.

**`GET /api/google/autocomplete?q=...&lang=ar&lat=31.9&lng=35.2`**

- `q`: 3–100 chars; client debounces 300 ms and requires 3 characters.
- `lat`/`lng`: required in practice. **Do not rely on IP bias**: the request originates from the Railway server, so Google would bias to the server's IP, not the rider's. Send `locationBias` with the rider's current point (or the pickup city centre) and `includedRegionCodes: ['ps']`.
- Body: `{ input, languageCode, includedRegionCodes: ['ps'], locationBias: { circle: { center: { latitude, longitude }, radius: 50000 } } }`.
- Field mask: `suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text`.
- Response 200: `{ suggestions: [{ placeId, main, secondary }] }`, max 5. No query predictions.
- Selection: the client calls `/api/google/geocode?placeId=...` to get the coordinate, then `PinSheet`/booking stores it.
- Errors: 400 `invalid_query`; 503 `maps_*`.

### Request building

```http
POST https://routes.googleapis.com/directions/v2:computeRoutes
Content-Type: application/json
X-Goog-Api-Key: <GOOGLE_MAPS_SERVER_KEY>
X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline

{
  "origin": { "location": { "latLng": { "latitude": 31.9038, "longitude": 35.2034 } } },
  "destination": { "location": { "latLng": { "latitude": 32.2211, "longitude": 35.2544 } } },
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_UNAWARE",
  "polylineQuality": "HIGH_QUALITY",
  "computeAlternativeRoutes": false,
  "languageCode": "ar",
  "units": "METRIC"
}
```

- `TRAFFIC_UNAWARE` keeps the request in the Essentials SKU ($5/1000 after 10k) and avoids paying for traffic that PS does not have. If a future market has traffic, switch to `TRAFFIC_AWARE` only for endpoints inside that market (Pro, $10/1000 after 5k).
- `polylineQuality: HIGH_QUALITY` matters at street zoom; the app's OSRM path already uses full geometry for the same reason (`server/main.ts:2250-2251`).
- Decode the polyline on the server; never send Google's encoded string to a MapLibre client (it would be Google content in a non-Google map). In Google mode the client is Google, but the app contract is still `[lng,lat][]`; decoding once keeps one shape.

### Caching rules

| Data | Allowed? | Design |
|---|---|---|
| Google route geometry/duration | **No** beyond the request | No `roadCache`. Optional in-flight promise dedupe for identical concurrent requests (same user/order), discarded when settled. |
| Google lat/lng | Yes, 30 days | Only if a saved-place feature is added; not needed for the first proxy. |
| Geocoding lat/lng + formatted address | Yes, indefinite **per user**, user-facing only | Future `saved_places` enrichment; never a shared address→coordinate table. |
| `place_id` | Yes, indefinite | Safe to store on orders/saved places as the durable reference. |
| Autocomplete predictions | No | Do not cache; they are ephemeral and user-specific. |
| Route request logs | N/A | Log counts/sku, not coordinates, for cost reconciliation; avoid storing Google content in logs. |

The existing OSRM `roadCache` is a useful shape but the wrong policy. If a Google request is retried after a 5xx, the proxy should call Google again; there is no cached success to reuse.

### Rate limits and quotas

| Control | Value (pilot) | Mechanism |
|---|---|---|
| Per-user route | 60 / 10 min | `limit(identityKey('google-route', user.id), 60, 600_000)` |
| Per-order route | 40 / 24 h | `limit(identityKey('google-route-order', orderId), 40, 86_400_000)` |
| Per-user geocode | 30 / 10 min | `limit(identityKey('google-geocode', user.id), 30, 600_000)` |
| Per-user autocomplete | 120 / 10 min | `limit(identityKey('google-ac', user.id), 120, 600_000)` |
| Global daily route | 2,000 | `google_usage` counter + `GOOGLE_DAILY_ROUTE_CAP` |
| Global daily geocode | 1,000 | same |
| Global daily autocomplete | 2,000 | same |
| Per-user daily route | 200 | `google_usage` keyed by user-day, or a second `limit` window of 24 h |
| Kill switch | off/on | `GOOGLE_MAPS_ENABLED=0` or `MAP_PROVIDER=maplibre` → 503 `maps_disabled` before any upstream call |

`limit` persists counters in `request_limits` (`server/main.ts:340-343`), so it survives restarts and works on SQLite/Postgres. The global daily counter needs a tiny new table because `request_limits` has no per-SKU history:

```sql
CREATE TABLE IF NOT EXISTS google_usage (
  day TEXT NOT NULL,
  sku TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, sku)
);
```

`INSERT ... ON CONFLICT (day, sku) DO UPDATE SET count = count + 1` works on both backends. Add it in `server/migrate.ts` as a new version; do not edit old migrations. A race can overshoot the cap by the number of concurrent requests; acceptable for a pilot, or use `limit('google-day-route', cap, 86_400_000)` for an atomic cap and keep `google_usage` only for reconciliation.

### Error mapping

| Google response | Proxy status/code | Client behaviour |
|---|---|---|
| 400 `INVALID_ARGUMENT` | 400 `invalid_input` | Fix the request; no retry |
| 403 `PERMISSION_DENIED` (bad key/API not enabled) | 503 `maps_unavailable` | Alert; keep Google map, no line; retry later |
| 404 from Routes (no route) | 404 `no_route` | Show pins, no line; do not downgrade |
| 429 `RESOURCE_EXHAUSTED` | 503 `maps_quota` | Downgrade the session to MapLibre/OSRM |
| 500/502/503/504 | 503 `maps_unavailable` | Retry once; keep the last line; ETA unavailable |
| Timeout (4 s) | 503 `maps_unavailable` | Same |
| Geocoding `ZERO_RESULTS` | 404 `not_found` | "Address not found" |
| Geocoding `OVER_QUERY_LIMIT` | 503 `maps_quota` | Downgrade/disable address search |
| Geocoding `REQUEST_DENIED` | 503 `maps_unavailable` | Alert |
| Kill switch / wrong mode | 503 `maps_disabled` | Downgrade immediately |

Never forward Google's `error.message` to the client; it can contain project/key details. Log it with a correlation id and the route only, not the coordinates.

### Reuse and placement

- Put the proxy in a new `server/domain/google.ts` and register it next to the other domains in `server/main.ts:436-468`. Pass `fail`, `limit`, `identityKey` in, following the `Dispatch`/`Eligibility` pattern. Keep `RoadRoute` as a structural type in the module (or export the type from a small shared file) so `main.ts` does not need to export its local type.
- Add `GET /api/config` (public) returning `{ mapProvider: 'google' | 'maplibre' }`; it exposes no keys. The root layout uses it once.
- When `MAP_PROVIDER=google`, `GET /api/track/:token/eta` must return `{ minutes: null }` (and no `road`/`approach`) instead of OSRM geometry. It is an anonymous, 15 s-polled endpoint; a Google version is unaffordable (§5). If the public page is to stay on MapLibre, it must be a separate surface, not a Google map with OSRM lines.
- Export pure helpers for tests: `routeBody(origin, destination, { traffic })`, `decodePolyline(encoded)`, `toRoadRoute(json)`, `mapGoogleStatus(status, body)`, `autocompleteBody(q, { lat, lng, lang })`.
- Env overrides for tests: `GOOGLE_ROUTES_URL`, `GOOGLE_GEOCODING_URL`, `GOOGLE_PLACES_URL`, defaulting to the real endpoints. This mirrors `OSRM_URL` and is the only way to test without a key.
- Timeout: `AbortSignal.timeout(4000)` for routes, 3000 for geocode/autocomplete, matching the OSRM 3 s timeout (`server/main.ts:2233-2234`). The API server's request timeout is 30 s (`:2821`), so 4 s leaves room for retries.
- `X-Goog-Api-Key` only on the server; never put it in a response header, log, error string or crash report.

### Sessions

- **v1: no session tokens.** Autocomplete Requests are $2.83/1000 after 10k; a debounced 3-character search typically makes fewer than 12 requests, and the first 12 requests in a session are billed per request anyway. Sessions only make requests 13+ free, and an abandoned session reverts to per-request pricing — [Google, Autocomplete and session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing). Skipping sessions is simpler and avoids a server-side token store.
- **If sessions are added (phase 3b):** mint `randomUUID()` on the server, bind it to `{ userId, createdAt }` in a 3-minute TTL map/table, return it with the autocomplete response, require it on `/api/google/geocode?placeId=...`, and terminate the session with the Place Details call. Never accept a client-generated token (cross-user billing/abuse). Do not add sessions without Place Details; an unterminated session is billed per request anyway.

### Inferences
- The proxy is ~200–250 lines plus tests. It is a smaller and safer first deliverable than the client map, and it can be merged dark.
- Returning the existing `RoadRoute` shape is the key simplification: the client change becomes a `base` argument, not a new data model.
- The absence of a Google cache is a feature, not a gap: it is the only compliant design. It also means the proxy must reject or throttle the app's current 110 m re-route pattern (§5).

### Gaps
- No live Google project/key was available, so the exact current Geocoding API surface (legacy vs newer `geocode.googleapis.com`) and the Place Details field mask were not exercised.
- Railway's outbound IPs are not guaranteed static; an IP-restricted server key may need a fixed-egress proxy or a no-application-restriction key plus API restrictions and a secret.
- Whether Places API (New) is enabled by default on a new project in 2026 was not checked against the console; the plan assumes it must be enabled explicitly.

## 5. Cost controls, quotas and what happens to ETA when Google is unavailable

### Takeaway
The map is free on native; the bill is **route calls**, and the repository's current call pattern is the problem. `useRoad` re-routes the approach every ~110 m (`src/road.tsx:25`, grid 3) and the public track page asks for a fresh ETA every 15 s (`src/app/track/[token].tsx:37`). OSRM absorbs this with a 10 m-rounded LRU cache; Google cannot. At 100 drivers the current pattern is roughly **$7.5k/month** for routes alone at Essentials prices, versus **~$250/month** at one call per leg. Changing the refresh policy is a prerequisite, not an optimisation.

### Cited Findings
- Prices (global list, last updated 2026-10-28): **Maps SDK** unlimited free; **Dynamic Maps** 10,000 free then $7.00/1,000; **Routes: Compute Routes Essentials** 10,000 free then $5.00/1,000; **Routes: Compute Routes Pro** 5,000 free then $10.00/1,000; **Geocoding** 10,000 free then $5.00/1,000; **Autocomplete Requests** 10,000 free then $2.83/1,000; **Place Details Essentials** 10,000 free then $5.00/1,000 — [Google, Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing).
- Traffic-aware routes are billed at a higher rate; `TRAFFIC_UNAWARE` is the default — [Google, Set the level of traffic data](https://developers.google.com/maps/documentation/routes/config_trade_offs). PS has no traffic layer, so paying for `TRAFFIC_AWARE` in PS buys nothing.
- "Setting an *alerts-only* budget doesn't automatically cap Google Cloud or Google Maps Platform usage or spending" — [Google Cloud, Create/edit budgets](https://cloud.google.com/billing/docs/how-to/budgets). Lowering a per-API daily quota is the documented hard stop; billing data can lag up to 48 hours (per `pricing_terms.md`, citing Google's "Manage costs").
- The current approach path is built by `roadPath(driver, target, 3, heading)` (`src/road.tsx:25`); grid 3 = 3 decimal places ≈ 110 m at this latitude (`src/map-math.ts:95-97`). The static trip line uses grid 5 (~1.1 km) and changes only with the stops (`src/road.tsx:19`, `src/app/book.tsx:87`).
- The public ETA endpoint is polled every 15 s (`src/app/track/[token].tsx:37`) and recomputes the approach on the server (`server/main.ts:2348-2353`); OSRM's cache makes repeats cheap (`server/main.ts:2256-2265`).
- The OSRM cache is 200k geometry points and LRU-evicts (`server/main.ts:2226-2309`); `tests/route.test.mjs:54-55` proves a few-metres-away request reuses the cached route. There is no equivalent for Google.
- Google route caching is limited to lat/lng for 30 days; geometry/duration are not allowed (§3). So the OSRM cache cannot be repurposed.
- The public track page is anonymous and rate-limited by token hash (`server/main.ts:2326`), not by user. A Google-backed public ETA would need its own budget and abuse controls.

### Cost model (inference, list prices, 30-day month)

Assumptions: 30,000 trips/month at 100 drivers (10 trips/driver/day), one trip line + one approach line per active viewer session, average 12 km per trip, 50 route calls/trip for the current 110 m pattern (range 20–90 depending on how long the customer keeps the screen open), 6 calls/trip for a 1.1 km refresh, 2 calls/trip for one call per leg.

| Route refresh policy | Calls/trip | Calls/month at 100 drivers | Essentials after 10k free | Pro after 5k free |
|---|---:|---:|---:|---:|
| Current: every ~110 m | 50 | 1.5M | **~$7,450** | **~$14,950** |
| Every ~1.1 km | 6 | 180k | **~$850** | **~$1,750** |
| Once per leg (~2) | 2 | 60k | **~$250** | **~$550** |

Add geocoding and autocomplete separately:

| Line | Volume/month (100 drivers) | Cost |
|---|---:|---:|
| Geocoding one selected address per trip | 30,000 | 10k free + 20k × $0.005 = **$100** |
| Autocomplete, 2 addresses × 4 requests/trip | 240,000 | 10k free + 230k × $0.00283 = **~$651** |
| Place Details on selection (if used) | 60,000 | 10k free + 50k × $0.005 = **$250** |
| Web Dynamic Maps (if web Google) | 90,000 loads | 10k free + 80k × $0.007 = **$560** |

The autocomplete line is sensitive to debounce and minimum characters; at 1 request per address it falls to the free tier. The route line is the one that decides whether Google is affordable.

At 1,000 drivers, multiply volumes by 10 and the costs are not exactly 10× because of tiering; the 110 m pattern is roughly **$75k/month** Essentials, the 1.1 km pattern roughly **$9k**, and one call per leg roughly **$3k** (before geocode/autocomplete). Use the 100-driver table for the decision and re-run the script at pilot volume.

### Controls

**Server**

- `MAP_PROVIDER=google|maplibre` — gates `/api/google/*`; `maplibre` returns 503 `maps_disabled`.
- `GOOGLE_MAPS_ENABLED=0|1` — a second, independent kill switch for incidents.
- `GOOGLE_DAILY_ROUTE_CAP=2000`, `GOOGLE_DAILY_GEOCODE_CAP=1000`, `GOOGLE_DAILY_AUTOCOMPLETE_CAP=2000` — fail closed with `maps_quota` before calling Google.
- `GOOGLE_ORDER_ROUTE_CAP=40` (24 h), `GOOGLE_USER_DAILY_ROUTE_CAP=200` — per-order/per-user.
- `google_usage(day, sku, count)` for reconciliation; `GET /api/admin/google/usage` (admin only) returns today/month by SKU. This is the app's own meter, not the bill.
- Log only `{ sku, status, latencyMs, userIdHash }`; never coordinates or the key.

**Client**

- Google mode: approach `grid=2` (~1.1 km), not 3; refresh only when the driver has moved ≥1 km **or** 60 s have passed (whichever is later). Implement this in `useRoad` with a small "last fetch point/time" ref, or by including a 1 km bucket in the path. Do not let every GPS fix create a new path.
- Static trip line: one call per order/screen focus, grid 5.
- Pass `order=<id>` on the `/google/route` path from `useRoad` so the proxy can apply the per-order cap; the booking preview has no order id and omits it.
- In `useRoad`, watch `route.error`/`approach.error` and call `downgradeMapMode()` for `maps_disabled`/`maps_quota`. This is the one place both the order and booking screens share; the map component also downgrades on its own `onFail`.
- Autocomplete: 300 ms debounce, minimum 3 characters, cancel in-flight requests on new input.
- Public track page: **no Google route calls in v1.** Either keep the page on MapLibre/OSRM (recommended) or show the car/cities without ETA/line. If the app ships Google, `/api/track/:token/eta` must return `{ minutes: null }` and no `road`/`approach` geometry; it must not send OSRM lines to a Google map.
- On `maps_quota` or `maps_disabled`: `downgradeMapMode()` immediately; the screen re-renders with MapLibre + OSRM. On a transient `maps_unavailable`, keep the Google map, drop the line/ETA for that refresh, retry on the next tick.

**Cloud**

- Budget alerts at 50/90/100% of a monthly figure (e.g. $100 for the pilot); they are alarms, not caps — [Google Cloud, budgets](https://cloud.google.com/billing/docs/how-to/budgets).
- Set a daily quota per API in the Cloud Console (Routes Essentials, Geocoding, Autocomplete). This is the hard stop; it resets at midnight Pacific.
- Export billing to BigQuery or download the monthly CSV for reconciliation; the app's `google_usage` table is the other side of the check.

### ETA behaviour when Google is unavailable

| Failure | Map | Route line | ETA | Action |
|---|---|---|---|---|
| Google route 5xx/timeout | Google stays | Keep the last trip line if `useApi` has it; drop the approach (`shownApproach` returns undefined on error) | Hidden | Retry next refresh; do not call OSRM |
| Google quota/kill switch | Downgrade to MapLibre/Apple | OSRM line | OSRM ETA | `downgradeMapMode()` on `maps_quota`/`maps_disabled` |
| Google map fails (no Play services, bad key, offline) | Downgrade after the 20 s timer | OSRM line if the fallback map loads | OSRM | `onMapLoaded` never fires → timer → downgrade |
| Offline and MapLibre also fails | `RoutePreview` diagram | None | None | Existing "never a blank box" behaviour |
| Google route 404 `no_route` | Google stays | None | Hidden | Show pins; no downgrade |

The key rule: **never silently draw an OSRM line on a Google map.** A transient Google error hides the line; a quota/kill error switches the whole map. That is both a terms boundary and an honest UX.

### Inferences
- The current 110 m pattern is a ~25× cost multiplier versus one call per leg; it exists because OSRM is free and cached. Google mode must change the client refresh policy before the first production call.
- The public track page cannot be Google Routes at 15 s polling; at 1,000 concurrent viewers it is millions of calls per month. Keeping it on MapLibre/OSRM is the only affordable option, and it is a legal-review item because the product would then have two map providers.
- At one call per leg, Google Routes at 100 drivers is ~$250–$550/month for the route line alone, close to the sibling model's route line; autocomplete can dominate if it is not debounced. At the app's current pattern the route line is an order of magnitude worse. The difference is a product decision (how often the ETA refreshes), not a vendor negotiation.

### Gaps
- No real viewer-session length data; the 20–90 calls/trip range is a planning assumption, not a measurement.
- No live bill; the tier arithmetic is list-price, before tax/FX and before Google's own free-tier pooling across projects.
- The exact cost of `TRAFFIC_AWARE` in a future non-PS market was not modelled; it doubles the route SKU and may buy real traffic there.

## 6. Key setup, restrictions and where the keys live

### Takeaway
Use four keys, not one: Android, iOS, web and server. Each has exactly one application-restriction type plus an API allowlist. Mobile keys are extractable from the binary and are defended by package/SHA-1 or bundle-ID restrictions; the server key is a secret and never reaches the client; the web key is public by nature but referrer-restricted. Store mobile keys in EAS secrets, the server key in the hosting environment, and only placeholders in the repo. Add a build guard so a Google build cannot ship without both native keys.

### Cited Findings
- Google's security guidance: every app/project using Maps Platform must use API keys; you are financially responsible for abuse of unrestricted keys; use separate keys per app; a key with one application-restriction type cannot be used on other platforms; web-service keys are "not expected to be publicly exposed" and should be proxied or IP-restricted — [Google, Security guidance](https://developers.google.com/maps/api-security-best-practices) (as cited in `pricing_terms.md` §6 and `sdk_expo.md`).
- Expo's Android flow: enable Maps SDK for Android, copy the package name and SHA-1 (Play Console → App integrity for release; Expo credentials for debug builds), create a key, choose **Android apps**, add package + SHA-1, save, add `androidGoogleMapsApiKey`, rebuild — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/). Expo notes different SHA-1s for debug builds and Play App Signing.
- Expo's iOS flow: enable Maps SDK for iOS, create a key, choose **iOS apps**, add the bundle identifier, save, add `iosGoogleMapsApiKey`, rebuild — [Expo, react-native-maps (v57)](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).
- The repo's identifiers: Android `ps.wind.app`, iOS `ps.wind.app` (`app.json:12,18`). Phone-test builds use `ps.wind.app.testcustomer`, `.testdriver`, `.testadmin` and schemes `wind-test-*` (`app.config.js:12-25`). Those test package/bundle IDs need their own key restrictions or they will show blank maps.
- The current `app.config.js` reads a single `GOOGLE_MAPS_API_KEY` and passes only `androidGoogleMapsApiKey` (`app.config.js:3,49`). There is no iOS key, and no guard that a Google build has keys.
- The repo's env policy: `.env.example` says "Public values are compiled into the app. Never put API or partner secrets here"; `.env*` is gitignored except `.env.example`; `eas.json` has `preview` and `production` environments. EAS secrets are the right home for `GOOGLE_MAPS_ANDROID_KEY`/`GOOGLE_MAPS_IOS_KEY`; `EXPO_PUBLIC_*` values are public by design.
- `app.config.js:26-38` already fails a release build when `EXPO_PUBLIC_API_URL` is missing or not public HTTPS. The same pattern should fail a Google build when a key is missing.
- `expo prebuild` in SDK 57 clears native directories by default (per `sdk_expo.md`, citing the SDK 57 changelog); `android/`/`ios/` are gitignored. Do not hand-edit `AndroidManifest.xml` or the Podfile.

### Key matrix

| Key | Application restriction | API restriction | Where it lives | Notes |
|---|---|---|---|---|
| `wind-android` | Android apps: `ps.wind.app` + debug SHA-1 + Play App Signing SHA-1 + `ps.wind.app.test*` + their SHA-1s | Maps SDK for Android | EAS secret `GOOGLE_MAPS_ANDROID_KEY` | Extractable from the APK; restrictions are the only defence. Rotating is slow because installed apps keep the old key. |
| `wind-ios` | iOS apps: `ps.wind.app` + `ps.wind.app.test*` | Maps SDK for iOS | EAS secret `GOOGLE_MAPS_IOS_KEY` | Adds the `react-native-maps/Google` pod and `GMSServices.provideAPIKey` via the config plugin. |
| `wind-web` | Websites: `https://<app-domain>/*`, `http://localhost:8081/*` | Maps JavaScript API | `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` (public) | Public in the bundle; referrer restriction is the control. Do not add Routes/Geocoding/Places to this key. |
| `wind-server` | IP addresses/CIDR of the API host (if static); otherwise no application restriction + API restriction + secret | Routes API, Geocoding API, Places API (New) | Hosting env `GOOGLE_MAPS_SERVER_KEY` | Never in the app, repo, EAS `EXPO_PUBLIC_*`, logs or error bodies. |

**APIs to enable:** Maps SDK for Android, Maps SDK for iOS, Maps JavaScript API (only if web Google), Routes API, Geocoding API, Places API (New). Enable billing on the project first; the Maps SDK mobile loads are free but the project still needs a billing account.

**Build-time vs runtime**

- `GOOGLE_MAPS_ANDROID_KEY`/`GOOGLE_MAPS_IOS_KEY` are consumed by `app.config.js` at build time; they must be present in the EAS build environment (secret visibility). They are baked into the binary by the native SDK; that is expected.
- `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` is inlined into the web bundle; it is public, restricted by HTTP referrer.
- `GOOGLE_MAPS_SERVER_KEY` lives only in the API host (Railway environment/variables), never in EAS or the app.
- `MAP_PROVIDER`/`GOOGLE_MAPS_ENABLED`/caps are server env; `EXPO_PUBLIC_MAP_PROVIDER` is build env. The client's effective mode is the AND of build and server (§2).

**Build guard**

```js
// app.config.js, after computing provider/keys
if (provider === 'google' && (!androidKey || !iosKey)) throw new Error('...');
if (provider === 'google' && !process.env.EXPO_PUBLIC_API_URL) throw new Error('...'); // existing guard already covers release
```

A `maplibre` build passes `undefined` for both plugin keys; the plugin removes the Android meta-data and does not add the iOS pod (`node_modules/react-native-maps/plugin/build/{android,ios}.js`). This keeps today's keyless build byte-for-byte closer to current behaviour.

### Inferences
- One key cannot cover Android + iOS + web + server; the restriction types are mutually exclusive. Four keys is the minimum.
- The phone-test bundle IDs are a common blank-map trap: they are separate apps to Google. Add them to the restrictions or give testers a debug build signed with a registered SHA-1.
- The Android key will be in the APK; the only real defences are package + SHA-1 + API allowlist + quota. Do not treat it as a secret.
- The web key is also public; the referrer restriction is the control. If the web app is served from multiple domains (preview + production), list each explicitly; wildcards are risky.
- Because the iOS Google pod is only added when `iosGoogleMapsApiKey` is set, a `maplibre` iOS build stays Apple Maps and adds no Google framework. That is the clean rollback story.

### Gaps
- Railway's egress IPs are not confirmed static; the server key may need a fixed-egress proxy or no IP restriction (with API restriction + secret + quota).
- The exact SHA-1 values for the current debug keystore and Play App Signing were not read; they must be copied from EAS/Play Console.
- Whether a Palestinian billing address can enable Maps Platform was not verified (also a `pricing_terms.md` gap).
- App Store privacy-manifest requirements for the GoogleMaps pod were not checked; treat the iOS submission checklist as a to-do.

## 7. Tests that prove it works

### Takeaway
Five layers: pure request/response unit tests, a fake Google HTTP upstream through the real server, a browser scenario with a stubbed Maps JS API, device acceptance on real Android/iOS builds, and a monthly cost reconciliation. The existing fake-OSRM test is the template; the one assertion that must be inverted is caching — Google calls must **not** be cached.

### Cited Findings
- `tests/route.test.mjs:11-36` starts a fake OSRM HTTP server, sets `OSRM_URL`, imports `server/main.ts` after the env is set, and records `calls`/`lastUrl`. `:48-75` checks auth, validation, reshaping, cache reuse, heading, no-route and 5xx recovery. This is the exact harness for Google.
- `tests/route.test.mjs:54-55` asserts a few-metres-away request reuses the cached route; the Google test must assert the opposite (`calls === 2`).
- `tests/route.test.mjs:82-114` covers the public ETA and its null-on-failure behaviour; Google mode should return no OSRM lines there, so add a separate assertion rather than changing this test.
- `tests/map.test.mjs:221` asserts the exact `roadPath` string; `:224-262` scans the web map for the vendored MapLibre version, the `load.mjs` loader, and `map.html` helper parity. Renaming the web MapLibre file requires updating this scan.
- `package.json:46` already has Playwright; `scripts/check-android-browser.mjs:10-90` shows the pattern: local API, web export, sign-up, booking, map selector, screenshot. The Google browser scenario can reuse it with a `page.route` stub.
- The native readiness signal is `onMapLoaded` (`node_modules/react-native-maps/dist/src/MapView.d.ts:259-265`), not `onMapReady`; the test plan must check the blank-tile timeout.
- `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npx expo prebuild --clean`, and `eas build --profile development` are the repo's documented gates (`AGENTS.md`, `package.json:54,59`).

### Test matrix

| Layer | File | What it proves |
|---|---|---|
| Request building | `tests/google.test.mjs` | `routeBody` sends `origin/destination`, `DRIVE`, `TRAFFIC_UNAWARE`, `HIGH_QUALITY`, `languageCode: ar`, `units: METRIC`; `X-Goog-FieldMask` is exactly the three fields; `X-Goog-Api-Key` is the server key |
| Polyline decode | `tests/google.test.mjs` | A known encoded fixture decodes to the expected first/last `[lng,lat]`, rounded to 1e-5; a malformed/short line is rejected as 503 |
| Response reshape | `tests/google.test.mjs` | `distanceMeters`/`duration` become `km`/`minutes` with the same rounding as OSRM; `line` has ≥2 points; `avoids/through/closed` are `[]` |
| No cache | `tests/google.test.mjs` | Two identical calls produce two upstream calls (inverse of `tests/route.test.mjs:54-55`) |
| Error mapping | `tests/google.test.mjs` | 400→400, 403→503 `maps_unavailable`, 429→503 `maps_quota`, 500→503, empty routes→404 `no_route`; no upstream error message in the body |
| Kill switch | `tests/google.test.mjs` | `GOOGLE_MAPS_ENABLED=0` and `MAP_PROVIDER=maplibre` → 503 `maps_disabled`, zero upstream calls |
| Daily cap | `tests/google.test.mjs` | `GOOGLE_DAILY_ROUTE_CAP=1`; second call → 503 `maps_quota`, zero second upstream call |
| Per-user/per-order limits | `tests/google.test.mjs` | 61 calls → 429; a 41st call for one `order` → 429; `request_limits` rows are used |
| Key hygiene | `tests/google.test.mjs` | The server key never appears in any response body; the proxy ignores a client-supplied `key`/`X-Goog-Api-Key` header and uses only the env key |
| PII guard | `tests/google.test.mjs` | `q=0599123456` → 400 `invalid_query`, zero upstream calls; only `q`/coordinates are forwarded, never `contact`/`recipientPhone`/`note` |
| Autocomplete location | `tests/google.test.mjs` | Body has `includedRegionCodes: ['ps']` and a `locationBias` circle from `lat/lng`; without `lat/lng` the proxy returns 400 rather than letting Google IP-bias from the server |
| Place selection | `tests/google.test.mjs` | `/api/google/geocode?placeId=...` sends the Place Details field mask and returns a single coordinate; an invalid placeId is rejected before the call |
| Config/guard | `tests/google-config.test.mjs` (or `tests/deployment.test.mjs`) | `app.config.js` with Google env includes both plugin keys; with `EXPO_PUBLIC_MAP_PROVIDER=google` and missing keys it throws; with `maplibre` it passes `undefined` and no key |
| MapLibre regression | `tests/map.test.mjs` | The MapLibre web file still points at `/vendor/maplibre-6.12.0`, still uses `load.mjs`, still has no `new Function`; `map.html` helpers still match |
| Browser wiring | `scripts/check-google-browser.mjs` | With `EXPO_PUBLIC_MAP_PROVIDER=google`, `MAP_PROVIDER=google`, a fake server and a stubbed `maps.googleapis.com` script, the booking screen creates a Google map, renders pickup/dropoff markers and the route polyline, and shows no CSP violations or key leakage |
| Device acceptance | manual checklist (below) | Real Google tiles, key restrictions, gestures, fallback, RTL, offline |
| Cost reconciliation | `scripts/check-google-cost.mjs` | `google_usage` × list prices is within 10% of the Cloud Billing export for the month |

### Fake Google upstream

Follow the OSRM pattern: start a `node:http` server, set the three URL env vars, then import `server/main.ts`.

```js
process.env.GOOGLE_ROUTES_URL = `http://127.0.0.1:${port}/directions/v2:computeRoutes`;
process.env.GOOGLE_GEOCODING_URL = `http://127.0.0.1:${port}/maps/api/geocode/json`;
process.env.GOOGLE_PLACES_URL = `http://127.0.0.1:${port}/v1`;
process.env.GOOGLE_MAPS_SERVER_KEY = 'test-key';
process.env.MAP_PROVIDER = 'google';
process.env.GOOGLE_MAPS_ENABLED = '1';
const { server, shutdown } = await import('../server/main.ts');
```

The fake server should record `{ url, method, headers, body }` and answer with Google-shaped JSON:

```text
Routes:
{ "routes": [ { "distanceMeters": 61234, "duration": "3300s",
  "polyline": { "encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@" } } ] }

Geocoding:
{ "status": "OK", "results": [ { "formatted_address": "...",
  "geometry": { "location": { "lat": 31.9, "lng": 35.2 } }, "place_id": "..." } ] }

Places autocomplete:
{ "suggestions": [ { "placePrediction": { "placeId": "...", "text": { "text": "..." },
  "structuredFormat": { "mainText": { "text": "..." }, "secondaryText": { "text": "..." } } } } ] }

Place details:
{ "id": "...", "formattedAddress": "...", "location": { "latitude": 31.9, "longitude": 35.2 },
  "displayName": { "text": "..." } }
```

### Browser scenario

- Export the web app with `EXPO_PUBLIC_MAP_PROVIDER=google` and a dummy `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY=test-key`; run the local API with `MAP_PROVIDER=google`, `GOOGLE_MAPS_SERVER_KEY=test-key`, and the fake Google upstream.
- `page.route('https://maps.googleapis.com/**', route => route.fulfill({ contentType: 'application/javascript', body: googleStub }))`. The stub implements only `google.maps.Map`, `Marker`, `Polyline`, `Circle`, `LatLngBounds`, `event`, and records constructor calls on `window.__googleMapCalls`.
- Sign up a customer (reuse `scripts/check-android-browser.mjs:58-67`), navigate to `/book?from=ramallah&to=nablus`, confirm a pickup pin, request the order, open `/order/:id`.
- Assert: `window.__googleMapCalls.map` is non-zero; pickup/dropoff markers exist; the fake `/api/google/route` response produced a polyline; the recenter button does not cover the attribution area; console has no CSP errors other than the stubbed script; no page source contains `test-key` in an API response.
- This proves wiring, not Google rendering. A separate manual smoke with a real key on a staging domain is mandatory.

### Device acceptance checklist

**Android (GMS device, e.g. the Samsung A53 used in `SPEC-android-map.md:38`)**
- Development build with the debug SHA-1 key; map renders streets, pickup/dropoff, route, live car, heading arrow, accuracy halo.
- Release/internal-testing build with the Play App Signing SHA-1; the same map renders (the classic "works in debug, blank in Play" check).
- A device without Google Play services (e.g. Huawei): Google map never fires `onMapLoaded`; after the 20 s timer the screen downgrades to the MapLibre WebView, or shows the diagram if that also fails.
- Airplane mode: no blank box; after the timeout, the diagram/fallback appears; online recovery retries.
- Pin sheet: vertical drag moves the map, not the sheet; pinch works; confirm stores the moved point; the sheet's confirm button is reachable.
- Arabic UI with an English device locale: note whether Google labels are Arabic; if not, record it as a known gap (no `language` prop).
- 30-minute drive: marker glide, memory, no crash; background/foreground.
- Wrong SHA-1 test: a key restricted to a different SHA-1 must produce a blank map and the fallback, proving the restriction is live.

**iOS (development build, not Expo Go)**
- `pod install` pulls `react-native-maps/Google`; `GMSServices.provideAPIKey` is the first call in `didFinishLaunchingWithOptions` (the plugin does this; verify the generated AppDelegate).
- Map renders on device; custom driver marker/rotation works; `onMapLoaded` drives readiness; the 20 s timer catches a bad key.
- Pin sheet gestures; safe-area insets; Google logo/attribution not covered.
- RTL/Arabic labels; `NSLocationWhenInUseUsageDescription` present (the Google iOS SDK contains location code; the repo already has the expo-location string).
- App size: compare the IPA before/after; no published number exists.

### Cost reconciliation

- `scripts/check-google-cost.mjs` reads `google_usage` for the month (SQLite via `node:sqlite`, or the admin endpoint for Postgres), applies the list-price table (Essentials/Pro/Geocoding/Autocomplete/Place Details/Dynamic Maps), prints a per-SKU table, and compares to a Cloud Billing CSV export.
- Pass criterion: within 10% of the bill (the field-test threshold in `reports/Low cost Uber quality stack.md:146`), with the difference explained by free-tier pooling, retries, tax/FX, or untracked console usage.
- Run it monthly during the pilot; the first month is the calibration, not a pass/fail.

### Inferences
- The fake-upstream test is the highest-value test: it catches request-shape, field-mask, error-mapping and quota bugs without a key or a bill.
- The browser stub proves the component wiring but not Google's rendering; do not let it substitute for a real-key smoke.
- Device tests are mandatory because the failure modes (Play services, SHA-1, pod, `onMapLoaded`, sheet gestures, RTL) are native and invisible to Node tests.
- The cost script is as important as the unit tests: the most likely production incident is a runaway route loop, not a wrong polyline.

### Gaps
- No CI device farm; Android/iOS acceptance is manual.
- Playwright cannot render real Google tiles without a key; the real-key smoke is manual and needs a staging domain/referrer.
- The exact Google error bodies for every 2026 case were not captured; the mapping table is based on documented status codes and should be adjusted after the first fake/live run.

## 8. Migration sequence and rollback

### Takeaway
Ship the proxy dark first, then native Google behind a flag, then places, then traffic only where it exists. Web Google is optional and last. Rollback is a server flag plus a JS flag (OTA if the Google SDK is already in the binary); no data migration and no Google cache to purge.

### Cited Findings
- `route()`/`limit()`/`fail()` are already in place; a new domain module can be registered without touching existing routes (`server/main.ts:430-468`).
- `useApi` is path-keyed; switching `/route` → `/google/route` is a string change, not a new state layer (`src/api.ts:40-98`).
- `app.config.js` already has a release guard pattern that throws on a bad build (`app.config.js:26-38`); reuse it for Google keys.
- `expo prebuild` clears native dirs by default in SDK 57 (per `sdk_expo.md`); a local Google build needs `npx expo prebuild --clean` or EAS.
- EAS OTA can change `EXPO_PUBLIC_MAP_PROVIDER` only if the native Google SDK is already in the binary; it cannot add the SDK/pod. A store release is required to add Google native code the first time.
- The public track page is the one surface that should not switch in the first release (§5).

### Phases

| Phase | Work | Exit criteria | Rollback |
|---|---|---|---|
| **0 — keys + proxy, dark** (1–2 days) | Cloud project/billing; enable APIs; create 4 keys with restrictions; add `server/domain/google.ts` + `google_usage` migration; add `tests/google.test.mjs`; keep `MAP_PROVIDER=maplibre`; update ToS/privacy pages | `GET /api/google/route` returns 503 `maps_disabled`; the fake-upstream suite passes; if the server key is IP-restricted, a `curl` from the API host gets 200 and from a laptop gets 403 (if Railway egress is dynamic, verify the API allowlist/secret instead); no key in any response | Delete/disable the key; the proxy is dark |
| **1 — web map (optional)** (3–5 days) | `route-map.maplibre.tsx` rename + `route-map.tsx` chooser; `route-map.google.tsx`; widen `webCsp` only for Google mode; `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY`; `check-google-browser.mjs` | Browser stub scenario green; a real-key smoke on a staging referrer; no CSP violations; MapLibre still the default build | `EXPO_PUBLIC_MAP_PROVIDER=maplibre` + redeploy; CSP reverts |
| **2 — native map** (2–3 days + build) | Extract `native-map.tsx`; provider switch; `app.config.js` keys/guard; Android branch; `onMapLoaded`; `pin-sheet` gesture fix; dev build; internal testers | Android GMS + no-GMS + iOS device acceptance; pin sheet drag; blank key fallback; app size recorded | Server `MAP_PROVIDER=maplibre` + OTA `EXPO_PUBLIC_MAP_PROVIDER=maplibre`; Google SDK remains unused |
| **3 — places/autocomplete** (2–3 days) | `/api/google/autocomplete`, `/api/google/geocode?placeId`; booking search field + "Powered by Google" logo; debounce/min chars; optional sessions only with Place Details | Arabic queries for Ramallah/Nablus; Qalandia/Huwwara results recorded (expected weak); cost per session; PII guard | Hide the search field with a flag; the landmark text field still works |
| **4 — traffic/ETA** (only covered markets) | `TRAFFIC_AWARE` for bboxes with coverage; measure ETA vs ground truth; keep `TRAFFIC_UNAWARE` in PS | ETA error p50/p90 within the field-test bar; no traffic UI in PS | Switch the preference back to `TRAFFIC_UNAWARE` |
| **Public track** (not Google v1) | Keep MapLibre/OSRM; or show Google map without ETA/line | Cost per 1,000 viewers measured; legal review of the split | Revert to MapLibre/OSRM |

### Rollback plan

1. **Immediate (server):** set `MAP_PROVIDER=maplibre` and `GOOGLE_MAPS_ENABLED=0`. New `/api/config` reads return `maplibre`; any Google route call returns 503 `maps_disabled`; the client calls `downgradeMapMode()` on that code. Existing screens switch on the next render.
2. **Client OTA:** if the Google native SDK is already in the binary, an EAS update with `EXPO_PUBLIC_MAP_PROVIDER=maplibre` flips the JS flag; no store review. If the SDK is not in the binary, a store build is required to remove it (but it can simply stay unused).
3. **Keys:** disable the server key first (stops spend); the mobile keys can stay because an unused SDK makes no calls, but rotate/delete them when the Google experiment is closed.
4. **Data:** there is no Google route cache to purge. `google_usage` is the app's own counter; keep it for reconciliation. If Geocoding/Places wrote lat/lng or formatted addresses into user-facing saved places, the §6.3.2 per-user exception applies; if any shared table was built, delete it (not allowed beyond 30 days). `place_id` can stay.
5. **Product:** the public track page was never switched, so shared links keep working. The order/booking screens fall back to OSRM lines and ETA.

### Inferences
- The native switch can ship behind a flag with low blast radius because old clients keep calling `/api/route`; the server flag only gates the new proxy. A mixed fleet is expected and fine.
- The first store release with the Google SDK is the irreversible step (you cannot remove a native framework via OTA). Do it only after phase 0/2 acceptance, and keep the `maplibre` build profile as the default until the pilot proves the cost/quality.
- Web Google is the easiest to roll back (server-rendered HTML/CSP + a JS flag) but the least valuable for the Palestine product; do it last or not at all.

### Gaps
- EAS OTA runtime-version compatibility with the new native module was not checked; a runtime version bump may force a store update.
- Store review time for the Google SDK/privacy manifest is unknown.
- No pilot date or driver count was fixed; the phase durations are engineering estimates, not commitments.

## 9. Risks

### Takeaway
The technical risks are manageable; the product/terms/cost risks are not. The three that can kill the integration are (1) the current 110 m re-route pattern making Google unaffordable, (2) the terms boundary around the public track page / hybrid map, and (3) Google's West Bank routing quality (detours through Israel, no checkpoint semantics, no traffic). Build, keys and gestures are ordinary mobile work.

### Cited Findings
- Google's PS coverage marks traffic/real-time disruptions unavailable — [Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk); core coverage table per `sdk_expo.md`/`palestine_coverage.md`.
- Google's routing has been observed sending Ramallah–Nablus through Israel at ~4.5 hours vs ~45 minutes through the West Bank, and ignoring movement restrictions — `reports/Low cost Uber quality stack.md:33`, citing 7amleh (undated; re-test).
- Google's terms forbid Google content with/near a non-Google map and cap route caching at lat/lng 30 days — [ToS §3.2.3](https://cloud.google.com/maps-platform/terms), [Service Specific Terms §19](https://cloud.google.com/maps-platform/terms/maps-service-terms).
- The app currently draws OSRM geometry on every map and polls a public ETA every 15 s (`src/road.tsx:25`, `src/app/track/[token].tsx:37`); Google cannot cache those calls.
- `react-native-maps` needs Google Play services on Android and a GoogleMaps pod/`provideAPIKey` on iOS; Expo Go cannot carry the production key (per `sdk_expo.md`, citing the upstream installation docs).
- SDK 57 `expo prebuild` clears native dirs by default (per `sdk_expo.md`); `android/`/`ios/` are gitignored.
- Google Maps JS API CSP includes `'unsafe-eval'` in its allowlist sample — [Google, CSP guide](https://developers.google.com/maps/documentation/javascript/content-security-policy); the repo's current CSP is eval-free and tested (`server/main.ts:121-123`, `tests/map.test.mjs:230`).
- The pin sheet wraps `PinMap` in a `ScrollView` (`src/pin-sheet.tsx:21-26`); Android Google map gestures inside a scroll container are a known conflict class (inference from the platform, not a fetched bug report).
- `onMapReady` can fire before tiles; `onMapLoaded` is the tile-ready callback (`MapView.d.ts:259-265`).
- Native Google labels follow the device locale; `react-native-maps` has no `language` prop (per `sdk_expo.md`); the app disables RTL at the Expo level (`app.json:54`).

### Risk register

| Risk | Likelihood | Impact | Mitigation | Proof |
|---|---|---|---|---|
| Route-call cost runaway (110 m loop) | High if unchanged | High (10–40× bill) | Grid 2 + 1 km/60 s refresh; per-order cap; kill switch; daily cap | `google_usage` vs bill; `tests/google.test.mjs` no-cache/cap tests |
| Terms: hybrid Google map + OSRM line | Medium (easy to ship by accident) | High (account suspension) | One provider per screen; `map-mode` downgrade; public track stays MapLibre; legal review | Code review: no `/api/route` call in Google mode; browser test checks the path |
| Terms: caching Google routes | Medium (the OSRM cache is tempting) | High | Do not use `roadCache`; only in-flight dedupe; test asserts two upstream calls | `tests/google.test.mjs` |
| Google routing through Israel/checkpoints | High in PS | High (product trust) | Route-test 20 real trips before launch; keep OSRM as default; checkpoint warnings; no "Google-quality" claim | Field test with GPS ground truth |
| No traffic in PS | Certain | Medium | Do not show a traffic toggle; label ETA as estimate; own road reports | Coverage table; UI review |
| Android blank map (SHA-1/key) | High on first build | High | Register debug + Play + test SHA-1s; wrong-key test; fallback | Device acceptance |
| iOS pod/`provideAPIKey`/app size | Medium | Medium | Config plugin; dev build; measure IPA; `onMapLoaded` timeout | iOS device acceptance |
| Expo Go cannot carry the key | High | Low (dev only) | Require a development build; document it | Build check |
| Fabric/custom marker layout on 1.27.2 | Medium | Medium | Test driver marker; consider 1.29.x upgrade separately | Device test |
| Pin sheet gesture conflict | High on Android Google | Medium | Disable sheet scroll while the map is touched; test | Device test |
| Offline grey map not detected | Medium | Medium | Use `onMapLoaded` + 20 s timer; downgrade to MapLibre/diagram | Airplane-mode test |
| RTL/Arabic labels on native | Medium | Medium | `language=ar` on web; test device locale; document the native gap | Arabic device test |
| Key leakage (mobile) | Certain (extractable) | Medium | Package/SHA-1/bundle-ID restrictions; API allowlist; quotas; rotate | Wrong-key test; key audit |
| PII sent to Google | Medium (notes/phone in the query) | High (terms/privacy) | Proxy accepts only `q`/coords; reject 7+ digits; never forward notes/contact | `tests/google.test.mjs` |
| Storing geocoded pins >30 days | Medium | Medium | Store `place_id` + user-confirmed point; per-user geocoding exception; legal review | Schema review |
| Web CSP `unsafe-eval` | Certain if web Google | Medium (security regression) | Keep web on MapLibre; if not, scope the CSP to the Google build and test | CSP test/browser console |
| Public track page cost/terms | High if switched | High | Keep MapLibre/OSRM; no Google Routes; legal review | Cost model; code review |
| Vendor price/term change | Medium | Medium | Budget alerts; kill switch; OSRM fallback; 12-month deprecation notice | Quarterly review |
| Billing from Palestine | Unverified | High (procurement) | Confirm with Google sales/legal before build | Contract |

### Inferences
- The cost and terms risks are correlated: the same public track page that is expensive is also the hardest mixed-provider surface. Solving it by keeping it on MapLibre/OSRM solves both, at the cost of a legal-review question.
- The checkpoint-aware OSRM routing is the product moat; Google mode is a coverage/address-quality play, not an ETA-quality play. Position it accordingly.
- The native build risks are ordinary and testable; do not let them dominate the decision. The decision should be made on cost, terms and West Bank route quality.

### Gaps
- No field measurement of Google's current Ramallah–Nablus route, ETA error, or checkpoint behaviour.
- No app-size measurement, no cold-start/memory measurement.
- No legal review of the two-provider product or the 30-day pin storage.
- No confirmation that a Palestinian entity can contract Maps Platform.

## 10. Recommendation

### Takeaway
Do not switch the production West Bank app to Google now. The current MapLibre/OSRM stack is the product differentiator, it is already built and tested, and Google's own coverage removes the one feature that would justify the cost (traffic). If Google is required for a contract, address coverage outside Palestinian cities, or expansion into a market with traffic, build **native-only Google mode behind flags**, keep OSRM for pricing/dispatch and the public track page, cap route refreshes at 1 km/60 s, and get the two-provider split reviewed before shipping.

### Cited Findings
- Mobile Maps SDK loads are unlimited free, but Routes/Geocoding/Places are metered; at the app's current 110 m pattern the route line alone is ~$7.5k/month at 100 drivers (list-price inference, §5).
- Google's PS coverage has no traffic layer/real-time disruptions — [Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk).
- Google's terms forbid Google routing/geocoding/places on a non-Google map and cap route caching at lat/lng 30 days — [ToS §3.2.3](https://cloud.google.com/maps-platform/terms), [Service Specific Terms §19](https://cloud.google.com/maps-platform/terms/maps-service-terms).
- The app's OSRM path is not just a line: it feeds `/price`, booking feasibility, dispatch ETA and checkpoint detours (`server/main.ts:1005-1028`, `:1189-1192`, `:440-448`, `:2254-2310`).
- Native Google is a small provider switch; web Google is a new component plus a CSP weakening (`server/main.ts:121-123`; [Google CSP guide](https://developers.google.com/maps/documentation/javascript/content-security-policy)).

### Inferences
- The best first move is the dark proxy + keys + tests (phase 0). It costs little, proves the key restrictions and error mapping, and keeps every option open.
- If the pilot proceeds, native-only is the smallest blast radius: Android/iOS Google, web MapLibre, public track MapLibre. The mixed-provider legal question is the gate.
- If Google is adopted for a non-PS market, the same proxy works; switch `TRAFFIC_AWARE` on only for bboxes with coverage, and keep `TRAFFIC_UNAWARE` in PS.

### Gaps
- This note did not run a live Google call, build a dev client, or measure a bill. The first three things a developer should do are: create the four keys, run the fake-upstream suite, and build one Android dev client with a real key.

---

**Source note.** Repo facts are `path:line` from the working tree read on 2026-10-29. External facts are linked inline; the sibling notes in this folder (`pricing_terms.md`, `palestine_coverage.md`, `sdk_expo.md`) carry the fuller pricing/terms/coverage/SDK evidence and were used for cross-checks. No file in the working tree was modified.
