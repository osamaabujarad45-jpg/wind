# Plan: android-map (SPEC-android-map.md) — done; then web-bundle part 2 (SPEC-web-bundle.md) — done

1. A1: `public/map.html` (route + pin modes, message protocol); headless check.
2. A2: `src/route-map.android.tsx` (WebView, failure fallback, link policy); tests.
3. A3: deploy Wind, APK 1.0.5, phone check, ship notes.
4. W1: `src/motion.tsx` CSS stand-in + `motion.native.ts`; swap 8 imports; splash fade as CSS; guard test.
5. W2: screens + intro frame comparison with production; bundle and LCP numbers; deploy.
