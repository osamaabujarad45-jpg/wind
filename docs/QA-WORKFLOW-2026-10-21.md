# Wind readiness workflow and results — 21 October 2026

## Decision and scope

The current local browser journeys pass against the real application API and fresh,
isolated SQLite databases. This is evidence for the tested build and environment;
it does not establish that the deployed API, iOS runtime, notification providers or
every real-world road condition has passed. Native phone installation and runtime
results must be recorded separately below before claiming device readiness.

The app has three signed-in roles: customer, driver and administrator. The recipient
uses a private tracking link without an account. Parcel, passenger ride and freight
are service types, not separate account roles. Drivers additionally vary by vehicle,
pending/approved/blocked status, destination filter and Pro subscription; customers
can have a Plus subscription. Production enables parcels by default; rides/freight
are tested with explicit local opt-in and remain operationally gated.

## Execution order and exit criteria

1. Preserve existing data and record the source/build/package/API version. Use
   temporary databases for every synthetic order, account, report and cash action.
2. Run `npm test`, `npm run typecheck`, `npm run lint` and `npx expo-doctor`.
   Investigate every failure before proceeding.
3. Run `npm run test:scenarios` to build the web app and execute the core journeys.
   Then run `npm run test:location` and `npm run test:readiness` sequentially.
   These browser commands share port 4188 and must not run concurrently.
4. Install separate customer/driver/admin test apps on the attached Android device.
   Each should open the appropriate role without typing credentials, use the same
   isolated test API, and have a distinct package, name and session. The production
   package must continue using its normal authentication.

   The sandbox is scripted, so the matrix below is repeatable:

   ```bash
   npm run phone:server            # synthetic accounts on 127.0.0.1:4191 (ignored .expo/phone-qa)
   powershell -File scripts/start-phone-tests.ps1   # health check + adb reverse to the phone
   powershell -File scripts/build-phone-tests.ps1  # three debug APKs, one per role
   npm run phone:check             # cold launch, no sign-in, correct role identity
   ```

   The build refuses anything but a local debug build pointed at the loopback
   API, so a store build can never carry a test role or a test credential
   (`tests/phone-test-build.test.mjs`). `WIND_PHONE_SERIAL` overrides the
   device serial.
5. Execute the physical-device matrix below: real tiles, pinning, delivery, GPS,
   background/lock/resume, permission changes, logout and network recovery.
6. Before a public launch, verify the deployed revision, routing service and map
   assets; restore a fresh backup in isolation; validate real support and alert
   delivery. Provider-dependent features require provider evidence.

Pass criteria: no unhandled browser/native errors in tested journeys; exact order
counts after retries; no private recipient data; server-confirmed location with
truthful freshness; correct role restrictions; lint/types/tests pass. Blocked or
unexecuted checks remain visible and prevent a claim of complete public readiness.

## Current audit results

| Check | Current evidence | Result |
|---|---|---|
| Model/API/regression suite | `.expo/run-tests-7.log` | All 42 test files passed under Expo 57.0.31 |
| Typecheck/lint | `.expo/run-types-1.log`, `.expo/run-lint-1.log` | Passed |
| Expo Doctor | `.expo/run-doctor-1.log` | 21/21 passed |
| Core browser journeys | `.expo/run-scenarios-2.log`, `.expo/scenarios/results.json` | 15 groups passed; no page errors |
| Pickup/GPS edge cases | `.expo/run-location-2.log` | Passed; no orders created and no page errors |
| Extended readiness journeys | `.expo/run-readiness-2.log`, `.expo/readiness/results.json` | Nine groups passed, including safety navigation and account lifecycle; no page errors |
| Local load test | `.expo/run-load-4.log`, `.expo/load/results.json` | 60-way concurrency: no unexpected errors; the location throttle answers 429; 60 held live requests woke on new fixes; a long writer lock returns a retryable 503 in 299 ms without freezing other requests |
| Live-tracking pass (22 Oct) | `docs/QA-2026-10-21.md` | GPS yardstick, live driver identity, camera follow, background polling pause: fixed and covered by the suite above |
| Android/iOS Hermes bundles | `.expo/qa-native-exports.log`, `.expo/qa-native-exports/metadata.json` | Both exports passed; no test-role configuration bundled |
| Phone sandbox public web | `.expo/phone-qa-web-export.log`, `.expo/phone-qa/web/` | Export passed with normal sign-in/public tracking, API 4191, no role credentials; maps/vendor/icons included |
| Fresh backup restore | `.expo/qa-backup-summary.json`, `.expo/qa-backup-restore-latest.log` | Encrypted 18:23:44 UTC snapshots restored at 18:25:56 UTC; integrity OK, zero foreign-key errors, all 58 Souq and 28 Wind tables checked |
| Production mutations | Synthetic accounts/orders and cash actions use throwaway databases | No production test mutations by these scripts |

The browser uses a 390 × 844 viewport plus 360/768/1440-pixel administrator layouts.
MapLibre, worker modules, OpenFreeMap styles/fonts/tiles load from real URLs. GPS
and OSRM replies are controlled fixtures for repeatability: map rendering is real,
but route geometry in these suites does not certify live OSRM or road accuracy.
The extended suite provisions test sessions through the API so it can focus on
feature actions; the core suite separately exercises actual signup and login UI.

## Reproduced defect fixed during this audit

| Issue | Change | Verification |
|---|---|---|
| A dashboard safety alert opened an already visited Orders tab with All still selected, hiding incident resolution | Orders derives its selected filter from the current route parameter; filter chips update that parameter | The new readiness regression visits Orders, opens Dashboard, clicks its safety alert and requires the incident resolution form before clearing the hold |
| Malformed routing responses could produce a cached success containing invalid distance/geometry | Server validates OSRM HTTP status, numeric metrics and geometry coordinates, returning retryable 503 for malformed data | `tests/route.test.mjs` reproduced the defect before the fix and passes afterwards in the 42-file suite |
| Broader features had API coverage but no repeatable browser acceptance journey | Added `scripts/check-readiness.mjs` for tariff/promos, places, roads, freight/offers/destination, profile, safety, dispute credit and account management | Nine full browser groups use actual form controls and assert persisted API/database outcomes |

## Function-by-function acceptance matrix

`UI` means executed by an actual browser journey in this audit. `API` names the
repeatable test files that verify rules; their full suite result belongs in the
final verification record. A browser result is not a native OS result.

| Priority / area | Workflow and expected outcome | Coverage |
|---|---|---|
| P0 — Signup/login | Register customer and driver; driver is pending with no Accept action; admin approves; approved driver signs in | UI core; `registration`, `booking-auth`, `api` |
| P0 — Authentication boundaries | Unauthenticated/foreign account cannot see orders or perform role actions; revocation takes effect during live requests and commands | API `booking-auth`, `driver-scope`, `map`, `api` |
| P1 — Identity/profile | Edit display name; refresh preserves it; phone remains read-only | UI extended; `registration`, `api` |
| P1 — Password/account lifecycle | Change password, reject old credentials; admin edits/blocks/unblocks/resets/deletes; customer deletion anonymizes identity and revokes every session | UI extended; API `registration`, `api`, `courier-block` for active-order restrictions and other session boundaries |
| P0 — Route selection | No default route is silently booked; select pickup/dropoff; changing city clears old landmark; invalid/outside/poor GPS explained | UI location; `customer-location`, `booking-auth` |
| P0 — GPS cleanup | Locate then leave the form; outstanding permission/watch stops, including timeout/late-permission paths | UI location; `customer-location`, `background-location` |
| P0 — Map pin | Real tiles load; drag and immediately confirm; next quote contains moved coordinates | UI core; `map` |
| P0 — Map failures | Block library/tiles; fallback and Retry recover; Android readiness waits for tiles | UI core; `map`, `url-decoder` |
| P0 — Parcel quote/booking | Fill landmarks, contents, option and contact; see server fare; confirm one searching order | UI core/extended; `api`, `parcels`, `booking-auth` |
| P0 — Booking retry | Commit order but drop reply, reload and retry using the saved identity; exactly one order | UI core; `booking-auth`, `api-client` |
| P1 — Saved/recent places | Save Home landmark, find it in picker, reuse its city/note; delete is owner-only; caps and Home/Work uniqueness | UI extended; `places` |
| P1 — Recipient/contact | Name and phone persist for assigned driver; public link/jobs do not leak them | UI core; `recipient`, `driver-scope`, `share` |
| P1 — Schedule | Future slot stays out of immediate dispatch; reschedule/cancel uses valid future windows | UI core booking/cancel; API `schedule` for rescheduling/boundaries |
| P0 — Vehicle matching | Each of motorcycle/bicycle/car/van/truck only receives compatible jobs; pending/blocked drivers cannot accept | API `api`, `parcels`, `driver-scope`, `vehicle-migration`; native vehicle matrix below |
| P0 — Driver acceptance | Permission required; accept once; customer sees assignment; queued fresh GPS is eventually accepted | UI core; `map`, `driver-scope`, `background-location` |
| P0 — Status/handover | Assigned → arrived → collected → delivered; wrong code rejected; right code completes; GPS collection ends | UI core; `api`, `pickup`, `exceptions` |
| P0 — Tracking freshness | Newer fixes win; stale fix is marked, not claimed live; finish/logout/revocation ends collection/access | UI core; `map`, `background-location`, `background-registration` |
| P0 — Anonymous tracking | Share a link; recipient sees cities/status/driver marker without contacts, landmarks or proof; revocation/expiry stops access | UI core render/privacy; API `share`, `map` for revocation/expiry |
| P1 — Chat | Customer sends; assigned driver reads/replies; customer reads; retries do not duplicate; others cannot access | UI core; `chat` |
| P1 — External navigation/contact | Exact pin or landmark launches map; driver/customer/recipient call links use intended destination; failures surface | Source review and API privacy; real external apps require phone check |
| P0 — Failed pickup/delivery | Report an exception, hold delivery, admin records reattempt/return decision; correct sender return code closes | UI core return; `pickup`, `exceptions`, `courier-block` |
| P0 — Safety | Report synthetic incident; order freezes; admin Dashboard safety alert opens incident; reasoned resolution clears hold | UI extended; `safety` |
| P1 — Ratings/receipts | Driver/customer/price ratings save once; receipt reflects actual settlement rather than claiming cash received | UI core; `customer-rating`, `presentation`, `api` |
| P1 — Rebook/send another | Rebook prefills full prior details and re-quotes; send another retains only pickup, clears recipient/destination | UI core send-another; `presentation`, `booking-auth` |
| P1 — Order/trip history/run sheet | Active parcels grouped by pickup/delivery city/return; older history loads without lost/duplicate rows | API `parcels`, `presentation`, `api`; browser earnings/list render |
| P0 — Multiple parcels | Courier carries compatible parcels, single ride/freight stays exclusive; shared run does not imply direct-to-you ETA | API `parcels`, `map`, `route` |
| P1 — Ride service | Boarding action has passenger wording; trip completes without parcel proof; disabled services cannot book | UI core with local opt-in; `api`, `model` |
| P1 — Freight service | Load description, option/loading help and quotation persist; van matches the job | UI extended with local opt-in; `api`, `offers` |
| P1 — Counter-offers | Driver offers within allowed band; customer chooses; final price equals chosen offer | UI extended; `offers` |
| P1 — Destination filter | Set Hebron and Nablus; only matching destination jobs appear; expiry restores all cities | UI extended set/filter; `driver-destination` for expiry |
| P1 — Checkpoints | Admin adds/removes/positions checkpoint; approved driver reports open/slow/closed; customer reads only; old reports expire | UI extended add/report/read restriction; `roads`, `route` |
| P1 — Road routing/ETA | Use road geometry; avoid placed closed checkpoint where possible; show uncertainty when delayed; no misleading direct ETA on shared run | API `route`, `map`, `roads`; UI uses deterministic OSRM fixture |
| P1 — Promo codes | Admin creates/deactivates; customer applies; fare, discount and cash owed preserve separate amounts; caps/expiry enforced | UI extended create/apply; `promo`, `cash` |
| P1 — Referrals | Invite code attributed on first booking; completion grants once; limits, cancellation and credit redemption correct | API `referral`, `promo` |
| P1 — Finished-order support | Customer reports within seven days; admin resolves once and can grant future credit; customer sees outcome | UI extended; `exceptions`, `credit` |
| P0 — Cash accounting | Admin records numbered handover; driver confirms/disputes; only confirmation changes debt; retries do not duplicate | UI core confirm; `cash` |
| P1 — Plus/Pro | Customer/driver requests eligible plan; admin activates/rejects; price/commission and expiration reflect valid plan | UI core customer Plus; `api`, `promo`, `model` |
| P0 — Admin operations | Dashboard totals/filtering; pending drivers approved; synthetic settings change affects next quote; account privileges enforced | UI core/extended; `api`, `registration`, `driver-scope` |
| P1 — Email codes/reset | Hide unavailable provider UI; configured fake transport verifies codes, expiry, limits and password recovery | API `email`; real sending domain/provider still required |
| P1 — Web Push | Subscription, encryption, recipient selection, offers/exceptions/signup alerts and revocation | API `push`, `push-server`, `driver-signup-alert`; real push delivery requires provider/browser check |
| P1 — Arabic/English/layout | Switch language; Arabic order/map labels; admin 360/768/1440 widths; no horizontal overflow or page errors | UI core; `presentation`, `url-decoder` |
| P0 — Partner bridge | Private server key, external idempotency reference, consistent quote and status; no public session/key leakage | API `api`, `promo`, `deployment`; partner production traffic not exercised |
| P0 — Deployment/data | HTTPS/public API guard; writeable DB/readiness; migration preserves users/orders/GPS; backup restore and drain behavior | API `deployment`, `vehicle-migration`, `job-alert-migration`; actual deployment/backup sign-off separately |

## Physical-device acceptance workflow

The customer, driver and admin apps share the same synthetic test API. Complete
these with location permission granted at the OS prompt where needed; that prompt
cannot be bypassed by an app authentication setting.

| Step | Device action | Required result |
|---|---|---|
| D01 | Cold-launch each icon, force-stop and relaunch | Correct role screen without login/intro; unique app identities and sessions |
| D02 | Customer selects both map pins and books parcel | Real map tiles, moved points and fare; exactly one order visible to driver/admin |
| D03 | Driver accepts; switch to customer app | Driver GPS received by API; live marker, freshness and ETA correspond to latest accepted fix |
| D04 | Lock phone during assigned/in-transit job, then resume | Foreground tracking service continues; multiple newer server timestamps and customer updates while locked |
| D05 | Revoke location / disable location services / return | Sharing indicator is truthful; recovery action returns tracking after permission/services restored |
| D06 | Turn network off/on during booking and tracking | Saved booking retries once; no duplicate delivery; old GPS is not re-stamped as fresh |
| D07 | Arrive, collect, wrong/right code, rate, receipt | Correct transitions/rejection/closure; location service stops after final active job |
| D08 | Failed delivery and return using admin icon | Hold → recorded decision → returning → sender code → returned |
| D09 | Trigger synthetic safety incident; visit Orders first then dashboard alert | Driver blocked from advancement; alert selects Safety; admin resolution restores actions |
| D10 | Exercise customer/driver account, places, offers, schedule, cash and support | Same server-confirmed outcomes as matrix; keyboard/back/tab interactions work |
| D11 | Change driver vehicle fixture across all five supported types | Compatible jobs offered; prohibited ride/freight/parcels absent; pending/blocked gates hold |
| D12 | Logout or finish while locked/resume; force-stop/relaunch | No obsolete sharing; no old session location; test icon can restore intended role on next launch |
| D13 | Tap maps, call and WhatsApp navigation then cancel | Correct OS destination; no real message/call sent during acceptance test |
| D14 | Open recipient link and revoke from customer | No sign-in required, no private fields, revoked page stops showing tracking |
| D15 | Change Arabic/English, use back button and rotate/resume | Coherent labels/RTL, no blank screen, clipped essential action or crash |

Record app package/version, phone model/OS, API revision, start/end timestamps and
server/device evidence for each device result. Fixture GPS and browser execution
alone must not be entered as passes for D03–D06.

## Remaining release gates and intentional product limits

- The previous QA documents reported that current API/map/live changes were not
  deployed. Public release requires fresh deployed-version, real OSRM and map-asset
  checks after a verified backup. Fresh backup restoration passed during this audit,
  but read-only deployment checks still identified the previous 20 October build.
  Railway's [public status page](https://status.railway.com) still reported builds
  and deployments paused at 18:15 UTC. Local passing tests cannot certify that host.
- Native push still needs an EAS project/FCM credentials and delivery verification.
  Web Push API tests do not prove native closed-app notifications.
- Real email codes need a configured sending domain; phone ownership is currently
  unverified self-service. Credentials/domain access are external prerequisites.
- iOS/Apple Maps and iOS background behavior require an actual iPhone build/device.
- Cash is the supported payment method. Digital payments/tips, sender goods-price
  payouts, photos, document uploads and cancellation fees are intentionally absent
  or deferred; these tests do not silently enable them.
- Support staffing, incident response, cash operations, permissions/licensing and
  accurate checkpoint reports need operational acceptance before real customers.

## Evidence locations

Core screenshots include `.expo/scenarios/customer-live-map.png`,
`recipient-tracking.png`, `customer-receipt.png`, `android-map-bridge.png`, and
`arabic-completed.png`. Extended screenshots/results are in `.expo/readiness/`.
All `.expo` files are local, ignored evidence. The executable scripts and this
workflow are retained for repeatable future release checks.
