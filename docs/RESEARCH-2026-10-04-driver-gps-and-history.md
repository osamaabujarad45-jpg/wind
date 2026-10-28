# Driver GPS, vehicles and trip history — 4 October 2026

**Later update:** The active-delivery implementation now includes a native background location task, and `app.json` declares the iOS and Android background-location configuration. The October decision below is historical. The current implementation and the additional WP07 presence work still require real-device permission, lifecycle, battery and network validation; configuration alone does not establish that background updates will run.

## Decision made

Wind now asks an approved driver to enable location when they accept a job, checks that device location services are actually on, asks Android to enable high-accuracy mode when needed, sends an immediate high-accuracy point after acceptance, and then watches only while the app is foregrounded and the job is active. The driver sees **GPS شغّال / GPS is sharing** only after the API accepts a point.

The driver Trips tab now puts the latest completed trip ahead of the rest of the history. It keeps the existing receipt and earnings views rather than creating another, duplicate trip-detail flow.

Vehicle choices are motorcycle, bicycle, car, van and truck. Motorcycle is available for parcels and operator-enabled, licensed rides. Bicycle is parcel-only, so it cannot receive a passenger-ride offer. This keeps the new choices within the current dispatch model and avoids unsafe passenger assignments.

## Research used

- [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/) documents `hasServicesEnabledAsync`, Android's `enableNetworkProviderAsync`, one-off current-position reads, and foreground-only `watchPositionAsync`.
- [Google Play location policy](https://support.google.com/googleplay/android-developer/answer/9799150) prefers foreground location where possible and requires background access to be a documented, core, user-benefiting feature. The original release decision did not add background location; the later implementation must satisfy that policy before release.
- [Apple location guidance](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services) recommends asking at the moment a user engages a feature that needs it; acceptance is that moment for a driver.
- [Uber's driver earnings guidance](https://help.uber.com/driving-and-delivering/article/fuvarkereset-megtekint%C3%A9se?nodeId=9fbc207b-2837-4428-8133-2d2df7b3b17d) presents recent trips alongside per-trip gross and net earnings. Wind already has a receipt and earnings breakdown, so the missing practical addition was a clear latest-completed-trip entry.

## Deliberate launch boundaries

Push delivery offers, background tracking, turn-by-turn routing/ETA, payments, document capture, return/dispute workflows and cash settlement need provider, policy, licensing or operating-process work. They remain in [SYSTEM.md](SYSTEM.md) as launch gates rather than being represented by incomplete controls. Parcel is still the enabled production service until the operator has approved the relevant service, drivers and routes.
