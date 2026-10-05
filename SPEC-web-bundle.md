# SPEC: web-bundle (Wind)

Status: approved by lead (Claude, 2026-10-05). Lifecycle: spec → plan → build → test → review → ship.

## Problem (measured)
The web/home-screen app ships one 2.73 MB JS file (674 kB gzip). After the 5 Oct compression fix, largest
contentful paint on a throttled phone is still 3.4 s, dominated by downloading and parsing that file.
Source-map attribution (`expo export --source-maps`):

| Package | Raw kB |
|---|---|
| react-native-reanimated | 734 (whole preset catalogue: Flip, Bounce, Rotate… — the app uses ~8) |
| expo-router | 431 |
| react-native-web | 284 |
| react-dom | 175 |
| src/copy.ts (ar + en) | 96 |

## Scope
1. Build the production web export with Metro tree shaking (`EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1`,
   `EXPO_UNSTABLE_TREE_SHAKING=1`) in the Dockerfile. No source changes.
2. Guard: a test fails if the Dockerfile stops setting them.

## Acceptance
- AC1 Entry gzip drops ≥ 25 % (measured: 674 → 482 kB, −29 %; raw 2.73 → 1.96 MB).
- AC2 `npm run screens` (every screen, ar + en, plus its driver UI assertions) passes on the tree-shaken build.
- AC3 Production LCP improves on the same throttled profile (recorded in the SHIP log).

## Out of scope / next
- Reanimated still weighs 447 kB after shaking. A web-only shim (`motion.web.ts` mapping `entering`/`exiting`
  presets to CSS keyframes) would remove most of it; touches 8 files — its own loop.
- Lazy-load the inactive language from `copy.ts` (~20 kB gzip) — low value.
