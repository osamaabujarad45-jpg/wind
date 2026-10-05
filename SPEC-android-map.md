# SPEC: android-map (Wind)

Status: approved by lead (Claude, 2026-10-05). Lifecycle: spec → plan → build → test → review → ship.

## Problem

The Android APK has no Google Maps key, so every map in it is the hand-drawn diagram (`src/route-preview.tsx`):
no real streets, no live driver, and no "Pickup/Dropoff on map" buttons. Web and iPhone already have the real map (`live-map`).

## Scope

1. `public/map.html`: a standalone page with the same MapLibre + OpenFreeMap map as `src/route-map.tsx` — route mode
   (pickup, dropoff, dashed line or road line, live driver with glide/heading/accuracy halo, auto-fit, recenter) and
   pin mode (fixed centre pin, reports the centre on every move end). Served by the Wind API from the web root, so it
   loads the already-vendored library (`/vendor/maplibre-<version>/`) and can be fixed without a new APK.
2. `src/route-map.android.tsx`: the page in `react-native-webview`. Static input in the URL fragment (stays on the
   device), live updates through `injectJavaScript`, page messages `ready` / `failed` / `center`.
   `canPin` becomes true on Android.
3. Only the map page may load inside the WebView; credits and any other link open in the system browser.
4. Any failure (offline, blocked, server without the page, no `ready` within 15 s) → the diagram (route) or no map
   (pin sheet keeps confirm + starting point), exactly as on web.

## Out of scope

Offline tiles, bundling MapLibre inside the APK, Google Maps.

## Acceptance criteria

- AC1 Android order/booking/track maps show streets, pickup/dropoff markers, the road line when known and the live driver.
- AC2 Booking on Android offers "Pickup/Dropoff on map"; dragging the map moves the stored point.
- AC3 Map failure shows the diagram, never a blank box.
- AC4 The page's helper copies behave exactly like `src/map-math.ts`, and it points at the vendored version (test).
- AC5 Existing suites, tsc, lint green; web and iOS unchanged.

## Result (2026-10-05)

See SHIP-2026-10-04.md (android-map entry) for device evidence and the APK.
