# Plan: android-map (SPEC-android-map.md)

1. A1: `public/map.html` (route + pin modes, message protocol); headless check of render, recenter, pin centre, failure.
2. A2: `src/route-map.android.tsx` (WebView, failure fallback, link policy); drop the dead Google-key branch; tests.
3. A3: deploy Wind (serves map.html), build APK 1.0.5 (code 6), verify on emulator/device, ship notes.
