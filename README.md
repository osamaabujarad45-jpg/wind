# Darbna / دربنا

Arabic-first iOS and Android project for three services across multiple West Bank cities: parcels, licensed passenger rides, and large-load transport. Positioned as the shared, lower-cost delivery layer for Souqna orders: requests heading the same way are pooled so each pays less (a private option stays available). The Souqna integration and any co-branding need a written agreement with Souqna first.

## Run the interactive prototype

```bash
npm install
npm start
```

Open the QR code in Expo Go on iOS or Android. The prototype supports service selection, city and landmark entry, input validation, a clearly marked sample quote, current-device location permission, a route map, and an explorable order timeline.

**Prototype boundary:** There is no driver network, backend, payment capture, fare table, or live driver GPS yet. A sample request stays in memory until the app restarts. No displayed quote is a real fare and no booking is sent to a driver.

## Product documents

- [Product requirements and market study](docs/PRODUCT.md)
- [System requirements, service logic, and delivery plan](docs/SYSTEM.md)

## Checks

```bash
npm run typecheck
npm test
npx expo-doctor
```

## Deploy

Builds run on EAS (`eas.json`: `preview` = internal install links, `production` = store builds with remote auto-incremented build numbers).

```bash
npx eas-cli@latest login
npx eas-cli@latest init                       # links the project, writes projectId
npx eas-cli@latest env:create --name GOOGLE_MAPS_API_KEY --value <key> --environment preview --environment production --visibility sensitive
npx eas-cli@latest build --profile preview --platform all
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform all      # TestFlight / Play internal testing
npx expo export --platform web && npx eas-cli@latest deploy   # web preview on EAS Hosting
```

- `GOOGLE_MAPS_API_KEY` (Maps SDK for Android, restricted to package `ps.darbna.app`) enables the Android map. Without it Android shows the static route preview instead of crashing. iOS uses Apple Maps and needs no key.
- Layout direction is controlled by the in-app language toggle; OS RTL auto-flip is disabled (`expo-localization` `supportsRTL: false`).
- While this is a prototype, ship to TestFlight and Play internal/closed testing only. App Store review rejects demo builds (guideline 2.2) and a public Play listing for a ride/courier service needs the licensing described in `docs/SYSTEM.md`.

## Build direction

Expo/React Native keeps the customer and driver apps on one iOS/Android codebase. The production architecture in `docs/SYSTEM.md` adds a small dispatch API, PostgreSQL/PostGIS, real-time order events, licensed payment integration, and an operations console. The launch gate is a verified city-route coverage matrix and licensed transport/courier partners.
