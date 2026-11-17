# Sequential app repair — 2 November 2026

Owner request: fix the location/map problem first, then work through verified app issues using the existing Uber study. Preserve the existing dirty tree. No commit, deployment or production data changes are authorized.

## Queue

1. Software complete; physical acceptance open: pickup-map opening acquires bounded permitted foreground location, exposes status/retry and respects manual pinning. Native later-center, pre-ready and gesture races, positioning deadlines and stale-attempt cancellation are repaired. Physical iOS coordinate tolerance remains uncalibrated.
   - Owner clarification: request permission and explain Android/iPhone behavior. Map opening checks existing permission; only an explicit location action can trigger the system prompt. Foreground access only for pickup; denied, blocked, disabled services, timeout and inaccurate fixes have distinct Arabic/English recovery text. Settings is an explicit action. Manual pin selection remains available.
2. Complete: show the minimized Arabic/English read-only offline summary, replace complete order snapshots, merge history/detail refreshes, remove terminal/omitted work, expire open summaries and fence late failures after sign-out. Actual cache/root/session regressions pass.
3. Complete: carrying-parcels confirmation starts after the first request finishes; a shared pending ref serializes mutations and prevents stale callbacks from duplicating the recovery request. Synchronous-confirmation regression passes.
4. Complete investigation: `/ready` deliberately describes storage through migration 21; additive runtime capability detail checks feature dependencies through 29 and reports operational evidence as unknown. No generic readiness threshold or activation default was changed.
5. Complete software verification: final product source passes all 105 integration suites, both typechecks, warning-free lint, Android/iOS JS exports and 26 rebuilt customer/driver/public/admin browser journeys. Bounded disposable SQLite load passes all 14 gates over 11,581 requests, with zero unexpected errors/timeouts. Physical acceptance remains unavailable.

Full requirement coverage, fix records, exact run chronology and release boundaries: [3 November quality review](../reports/app-quality-review-2026-11-03.md). The earlier completion report retains the all-52 persistence plus 22 legacy PostgreSQL pass; this review changes no server/database code. All existing dirty work is preserved; no outward action occurred.

## Evidence and constraints

- k5 SSH succeeds; hostname `DESKTOP-NE681OS`. Isolated source snapshot: `C:/wq-app-repair-20261102`, lock-compatible dependencies at `C:/wq-audit-deps-20261101/node_modules`.
- Initial source archive and hashes: `.artifacts/app-repair-2026-11-02/`. Baseline lint passed on k5; other verification is pending.
- Physical A53 `R5CTB0FJP9Z` opened successfully through the device tools. Installed customer test app displays the old picker without GPS acquisition status or a current-location button inside the sheet. This is baseline evidence, not acceptance of new source.
- Existing Uber reports include already-fixed findings. Current source, rather than historical recommendation lists, determines the queue.
- Native Android build tooling was not found in the inspected k5 locations; local Android build tooling exists. Any build fallback will be explicitly labelled. Automated tests remain on k5.

## Permission research applied

- [Android runtime location permission](https://developer.android.com/develop/sensors-and-location/location/permissions/runtime): request in context, start with foreground, respect approximate/precise and one-time decisions. Never assume permission implies precision.
- [Apple authorization](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services): ask at the point of use, prefer When In Use, and explain why. A denied request is not an invitation to repeatedly prompt.
- [Expo SDK 57 location](https://docs.expo.dev/versions/v57.0.0/sdk/location/): `getForegroundPermissionsAsync`, `requestForegroundPermissionsAsync`, `hasServicesEnabledAsync` and cancellable `watchPositionAsync`. iOS Allow Once is indistinguishable from a persistent When In Use grant during that session; read OS permission each attempt instead of persisting an app-made grant.
- Customer pickup does not request background permission. Existing driver background sharing remains separately disclosed and explicitly enabled.

## Verification so far

- On physical A53, the old standalone location action returned Tulkarm with approximately 60 m accuracy. Thus the phone can obtain GPS; the map-open path was missing acquisition.
- On k5, the updated customer-location, Google/native map lifecycle and map-security suites pass; updated app TypeScript check passes. Baseline app/server typechecks and lint also passed. New browser and physical acceptance remain in progress.
- Sol reached its usage limit during implementation. Preserved its partial changes and switched independent review to MiniMax M3.1 Flash through OpenCode. Parent completed permission behavior and regression coverage.
