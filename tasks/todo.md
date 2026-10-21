# Second pass — 21 October 2026

- [x] Merge the unfinished scenario review and live-tracking branch; resolve conflicts.
- [x] Tracking: heading only while moving, GPS jump gate, clock-skew freshness, ETA without a driver route, LRU route cache.
- [x] Email codes over Cloudflare: verify, self-service reset, support caller check.
- [x] Signed 1.0.13 on the A53; native tracking tested against this API (foreground, background, screen off, relaunch).
- [ ] Owner: deploy the API to Railway (map page, live push, email routes).
- [ ] Owner: add a domain to Cloudflare DNS, onboard it for Email Sending, set WIND_EMAIL_FROM, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_TOKEN.

# Scenario review — 21 October 2026

- [x] Audit current capabilities and stale backlog against implementation.
- [x] Fix GPS upload races, ignored-fix acknowledgments, pickup permission timeout and ride boarding copy.
- [x] Fix premature Android map readiness; verify delayed tiles and moved pin coordinates.
- [x] Run customer, driver, recipient and admin journeys against isolated databases.
- [x] Verify maps and booking on the connected A53 in Chrome.
- [x] Pass 38 test files, 15 browser groups, four phone groups, lint/typecheck, Expo Doctor and Android/iOS exports.
- [ ] Complete rebuilt native APK/iOS checks and provider integrations listed in [QA report](../docs/QA-2026-10-21.md).

# Historical todo: courier-run-eta (loop 19)

- [x] spec: wrong ETA on multi-parcel runs measured in code (useRoad, /track eta)
- [x] server + client
- [x] tests: parcels.test.mjs (run flag, eta, last stop, finished, single job); 3/3 mutants killed; npm test, tsc, lint
- [x] screens (78); A53 Chrome public page (Arabic): run line, no minutes; order page en (built-in browser, phone in owner's hands): run line, ETA back on the last stop; iPhone guide hidden on Android browsers
- [x] ship (deploy eb841dcb). Order-page change reaches Android in the next APK
