# Fastship remaining handoff work — 3 November 2026

Completes the remaining software work identified after the first [implementation pass](handoff-implementation-2026-11-03.md). Existing dirty changes are preserved. No delegation, commit, push, deployment, production migration, emulator or simulator was used.

## Issue → change → verification

| Issue | Change | Verification |
| --- | --- | --- |
| A5: foreground bounces repeat Google endpoint requests | `src/road.tsx` retains the last requested URL through background/foreground transitions, including an unresolved response. The shared `useApi` API and other callers are unchanged. | `tests/road-focus.test.mjs` executes the actual `useRoad` and `useApi` hooks. The original code made four Google endpoint requests over three bounces; the fix makes one. Pending responses remain usable. This measures client requests, not historical provider charges. |
| A6: background movement advances the routing baseline | Only foreground fixes initialize or advance the movement baseline. A changed order/driver/stop is fenced by its key; background mounts and changed orders wait for foreground. | The same test sends two background fixes, then verifies the resumed request uses the latest fix and the full displacement from the preceding foreground request. Baseline mode retains free-route refresh and never requests Google geometry. |
| A4: map shell requires revalidation on every opening | Android uses `/map/v1/map.html`. The server serves the existing page with `public, max-age=86400`; `/map.html` retains its old behavior for installed clients. Version 1 identifies the bridge protocol, not immutable content. | `tests/map-cache.test.mjs` checks cold bytes, cache lifetime, warm 304, old-client compatibility, executable bootstrap and unknown-version failure. K5 Chromium separately verifies warm shell reuse without another origin request. |
| Same-timestamp updates can falsely validate old bytes | Map responses carry a content-based weak ETag. `If-None-Match` takes precedence over the modification date; compressed map bodies use the same content revision as their cache key. | Tests change page bytes while preserving timestamps, then verify HTTP 200, a new validator and the updated Brotli body. Browser revalidation also receives the compatible update. |
| Deployment health could pass without the new map endpoint | The existing deployment probe checks versioned map bytes and cache headers. Browser journey entry points use the new path. | Probe fixtures cover missing versioned delivery and incorrect caching in addition to the six previous failure cases; final journeys exercise the versioned page. |
| A2: a loaded map can wait indefinitely for camera completion | Both native pin adapters expire pending moves using the existing configured map deadline. The sheet also expires its target without enabling confirmation, shows Arabic/English recovery text, and retains manual selection/retry. | Lifecycle checks cover missing completion, successful completion, gesture cancellation, a disabled unseen pin and manual recovery. The numeric coordinate tolerance remains unchanged. |
| An aborted GPS attempt can clear the next attempt's loading state | Remove the duplicate, unguarded `setLocating(false)` from the catch branch. The existing guarded finalizer owns completion of the current attempt. | Reproduced a missing loading indicator after manual cancellation followed by retry and a late rejection; the corrected lifecycle test preserves the new attempt and confirms its eventual result. |
| Browser tile-failure fixture still targets the former hardcoded deadline | Both page fixtures read the default deadline from `runtimeRegistry` when accelerating map-failure tests. The product timeout is unchanged. | The earlier journey failure was a race between its own 20-second assertion and the now-configured 20-second map deadline; final journeys rerun the actual blank-tile refusal and Retry recovery. |
| Temporary reproduction files entered the compiler's include paths | Preserve that evidence outside the checked source tree; keep the repository's compiler settings intact. | Both TypeScript projects and lint pass after the move, with the earlier failure retained in the run records. |

No renderer licensing guard, reroute authorization rule, payment behavior, realtime contract or dependency was changed. Required-field validation, stale-location treatment and order/driver/stop isolation remain in place.

## Cache acceptance and tradeoff

The software acceptance contract is: cold online requests receive the current shell; warm opens can reuse it within 24 hours; revalidation detects changed content even with an equal file timestamp; installed `/map.html` clients still work; unsupported versions fail; unavailable map attempts cannot confirm a pin. The public cache contains only HTML, while location/configuration remains in the device-only fragment.

K5 Chromium verified cold fetch, warm reuse, compatible-update revalidation and cached-shell availability after switching the context offline. That is evidence for HTML caching, not a claim that offline map tiles exist or that an Android WebView has been accepted on hardware.

Compatible v1 fixes may remain cached for up to 24 hours. Breaking bridge changes require a new protocol path while retaining support for installed clients. The server endpoint must ship before an APK that requests it; this session performs neither deployment nor APK release. HTTP validator behavior was checked against [MDN's ETag documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag).

## Verification record

Heavy checks run on K5 (`DESKTOP-NE681OS`, Node 24.12.0), in `C:/wq-followthrough-20261103`, using the existing lock-compatible dependencies and the isolated loopback PostgreSQL/PostGIS fixture. Evidence is retained under `.artifacts/handoff-followthrough-2026-11-03/`: baseline/final manifests and archives, source delta, browser cache check, run results and full logs.

Final receipts are indexed in [final-run-results.json](../.artifacts/handoff-followthrough-2026-11-03/final-run-results.json). All **519 runtime/test/configuration hashes** match locally and on K5 after verification. Existing documentation was included in the earlier 799-file snapshot; these final report/tracker edits are separate.

- Run `1793684167203`: 104 integration suites, **all 52 persistence suites plus all 22 PostgreSQL legacy suites** passed. Its persistence run covers the final server behavior; subsequent changes concern pin UI/deadlines and verification scripts. The initial journey run failed on the obsolete timeout fixture, which was repaired rather than weakening the product deadline.
- Run `1793685054574`: the updated deadline/copy/deployment-probe code passed **all 104 integration suites**, map gates, both typechecks, lint, both platform exports and the corrected 26 browser journeys.
- Final review found the one-line aborted-GPS loading-state race. The separate controlled lifecycle reproduction failed before that correction and passed afterward (`cancellation-baseline.log`, `cancellation-fixed.log`).
- Run `1793685581197`: the final source passed routing/focus, billing, map/cache, lifecycle and deployment-probe checks, **fresh Android/iOS JavaScript/assets exports and all 26 rebuilt journeys with zero unhandled browser errors**. These are exports, not native APK/IPA builds or device acceptance.
- That run's client typecheck initially scanned the temporary, incomplete regression copy under `verification/`. The copy was moved outside the workspace to `C:/wq-followthrough-cancellation-evidence-20261103`, preserving its evidence without changing compiler rules. Run `1793685657343` then passed **both typechecks and lint with no warnings**. Raw failed receipts are retained alongside their successful replacements.
- The synthetic PostgreSQL fixture was stopped cleanly. No production database, deployed endpoint or real paid Google provider was used by these checks. Client request-count regressions do not establish historical billing savings.

## Hardware result

The attached physical A53 (`R5CTB0FJP9Z`) still returns `DEVICE_IN_USE`. The supported eight-second wait returned the same error. The owning session was not reused or closed, and no phone profile was cleared. No physical iOS device is available.

Consequently, physical Android accessibility/large-text/reduced-motion acceptance, physical WebView cache acceptance and iOS pin-tolerance calibration remain unverified. The positioning deadline closes the indefinite software wait, but does not establish a device-calibrated tolerance. No release acceptance is claimed.
