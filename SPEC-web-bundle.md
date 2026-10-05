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

## Part 2 (2026-10-05): Reanimated off the web bundle

Scope: `src/motion.tsx` (web) maps the slice of Reanimated the app uses — `Animated.View` with `entering`
(`FadeIn`, `FadeInDown`, `FadeInUp`, `ZoomIn` + `.duration().delay()`), CSS animations (`animationName` keyframe
objects), `css.create` transitions, `cubicBezier`, `useReducedMotion` — onto browser CSS (keyframes injected once per
shape). `src/motion.native.ts` re-exports the real library, so iOS/Android are unchanged. All 8 screens import `./motion`.
Metro tries `motion.ts` before `motion.web.tsx`, so the web file is the base name (same pattern as `route-map.tsx`).

Deliberate limits (`ponytail:` in motion.tsx): exit and layout animations do nothing on web (a tip disappears
instantly, the help accordion reflows without gliding). The splash fade-out now uses a plain CSS animation in
`_layout.tsx`, so it fades on every platform.

Guard: `tests/map.test.mjs` fails if any file other than `motion.native.ts` imports Reanimated, or if the two motion
files stop exporting the same names.

| Measure (tree-shaken production export) | Part 1 | Part 2 |
|---|---|---|
| Entry JS raw | 1,964,027 B | 1,490,891 B (−24 %) |
| Entry JS gzip -9 | 480,275 B | 388,519 B (−19 %) |
| JS transferred (Brotli, served) | 378,633 B | 306,285 B (−19 %) |
| LCP, same throttled profile, local server, median of 5 ×2 | 3.80 / 3.92 s | 3.20 / 3.12 s (≈ −0.7 s) |

(Profile: Pixel 7, 150 ms latency, 1.6 Mbps, CPU ×4, cold cache. Production after deploy: median 4.2 s on the same profile,
which adds real latency to Railway; the A/B above is the like-for-like comparison.)

Visual check: intro frames (gust, pin drop, rise, name, fade to welcome) match production frame for frame
(Playwright, Pixel 7, ar); reduced motion holds the still splash then shows welcome; `npm run screens` passes
(76 screenshots, driver UI assertions); remaining screenshot differences are mid-animation capture timing and seeded GPS age.
