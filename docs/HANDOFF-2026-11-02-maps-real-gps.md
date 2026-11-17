# Handoff: maps locate the user, real-GPS proof, production status (2 November 2026)

## Why the maps "never located the user"

Nothing in the map stack was broken. The product never used the user's position:

1. **Booking opened without location.** GPS ran only after a tap on "Use my current location". The map stayed hidden
   until both cities were chosen, and the pins then sat on the two **city centres** (for example Ramallah centre to
   Nablus centre). That looked like a canned demo route.
2. **No map drew the user.** No renderer had a "you are here" marker, so the user never saw themselves on a map.
3. **Production has no users.** On 2 Nov the database held one blocked test customer, no admin, no driver and no
   orders. An order there can never be assigned, so nothing can ever be tracked. Self-service sign-up is open
   (`WIND_IDENTITY_MODE=self-service`). No real account has been created there yet.
4. **Earlier device "proof" used fake positions.** The 1 Nov handoff posted a driver fix by hand. The phone's GPS was
   real, but the demonstrated movement was not.

## What changed (branch `claude/map-integration-design-b05917`)

- **Booking starts at the user** (`src/app/book.tsx`). A fresh form looks up the position on open without locking the
  form. Android asks for location permission once if it never asked, and a refusal stays a refusal. The pickup becomes the
  exact GPS point and city. The map appears as soon as that pickup is known, before any destination. A pickup the
  user chose meanwhile, a restored pending booking and linked or copied pickups are never replaced. If location is
  switched off on Android, a tap on the chip opens the system "turn on location" dialog. The new copy strings are
  `locationServicesOff` and `locationDenied`.
- **"You are here" on every renderer.** `RouteMapProps.me` and `PinMapProps.me` add a blue dot with an accuracy halo on
  web and Android (`public/map.html`). The dot sits under the stops, so a pickup at your position reads as a green dot
  inside your blue ring. iOS and Google native use `showsUserLocation`. `dropoff` is optional, so a map can show the
  pickup before a destination exists. `routeFramePoints` then frames the pickup and `me`.
- **Pin sheet follows the app** (`src/pin-sheet.tsx`, `route-map.android.tsx`, `route-map.native.tsx`). It has a
  "Use my current location" button. The Android page and both native pins now move when the app moves the pin. Before,
  the Android pin page ignored every centre after load.
- **Place search confirm is always visible** (`src/place-search-panel.tsx`). Tapping a result collapses the list, and
  only the chosen place with Confirm/Cancel stays under the field. On the A53 that button used to sit below the sheet.
- **Driver home** (`src/app/driver/index.tsx`). Missing GPS is now a plain clay warning card instead of a pale pill on a
  dark slab. The go-online card hides during an active job, where it is paused anyway.
- **Screenshots** (`scripts/screens.mjs`). The seeded live driver moved from West Jerusalem to Al-Bireh, on the route.

## Coverage of the location area: 100 %

Measured with `node --test --experimental-test-coverage --test-coverage-include=<module>` (lines / branches /
functions):

| Module | Before | After | Suites |
|---|---|---|---|
| `src/customer-location.ts` (pickup GPS) | 100 / 86.8 / 100 | **100 / 100 / 100** | `customer-location` |
| `src/map-math.ts` (camera, frames, routes) | 100 / 95.7 / 100 | **100 / 100 / 100** | `map` |
| `src/location-delivery.ts` (driver GPS upload) | 100 / 89.6 / 83.3 | **100 / 100 / 100** | new `location-delivery` + the three active-GPS suites, run in one process (`--test-isolation=none`) |
| `src/location-state.ts` (freshness) | 100 / 89.5 / 80 | **100 / 100 / 100** | `presentation` |

## Device proof (SM-A5360 over USB, 2 Nov, real GPS, no injected fixes)

The test apps were built from this branch and run against the USB sandbox, with the public OSRM router and live
Nominatim. Screenshots are in `.expo/phone-proof/` (git-ignored, because they show the owner's location).
Coordinates below are rounded; the full-precision values matched exactly.

| Step | Observation |
|---|---|
| Open booking | Chip showed "جارٍ تحديد موقعك…" with no tap. Android logged `HIGH_ACCURACY` for `ps.wind.app.testcustomer` at 17:46:05 and `OFF` at 17:46:16. |
| Located | Map of real Tulkarm streets, pickup طولكرم, "±20 m". Android's own fused fix: 32.312…, 35.048…, hAcc 20. |
| Destination | OSM search "An-Najah" → جامعة النجاح الوطنية - الحرم الجديد. Real road route of 27.5 km along roads 57/60, ₪20. |
| Order W-00005 | Stored pickup equals the phone's fused fix to 7 decimals. |
| Driver accepts | Driver screen showed its own position "موقعك، قبل 0 ث". Android: `gps provider request HIGH_ACCURACY @+3s` for `ps.wind.app.testdriver`, and `LocationTaskService` foreground. Stored driver fix equals the phone's fused fix (±6.9 m vs ±6.3 m). |
| Customer tracks | "موقع السائق، قبل 11 ث" and "السائق على بعد أقل من 500 م من موقع الاستلام". Fixes kept arriving every ≤ 15 s with the driver app in the background. |

**Not shown:** movement. The phone stayed in one place, so the marker could only glide between near-identical fixes.
Walking or driving with the driver app open is the remaining check. It needs a person; nothing has to be faked.

## Production: what the owner has to do

1. Register in the Wind app against production with your own phone number.
2. Give the go-ahead, then run on the VM: `docker exec wind-api node server/main.ts verify-phone <phone> --phone-verified`,
   then `... promote <phone>`, then `... seed-checkpoints`.
3. Deploy this branch:
   - API image: `public/map.html` reaches phones through the API's web root.
   - A new EAS Android build (versionCode 18). The booking changes live in the app bundle, and `expo-updates` is not
     installed, so over-the-air updates are not possible.
4. Approve the first drivers from the admin screen, then run one real order with two phones.

## Gate

Recorded in the PR: k5 full gate, lint, both typechecks, contracts, `npm test` and `test:persistence`, all in its own
folder `C:\wq-k5m` on PostgreSQL port 55483. Local runs were `test:location` (browser, real MapLibre) and
`npm run screens` (96 screenshots, every built-in UI check passed).
