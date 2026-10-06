# Plan: parcel-standard (SPEC-parcel-standard.md)

1. `src/model.ts`: `parcelPrice` (₪20) + `parcelLarge` replace base/per-km; `parcelFare()` used by `quote()` and
   `smartPrice()`; `PARCEL_LOAD` and `canTake()` shared by API and app.
2. `server/main.ts`: accept/offer via `canTake(activeLoad())`; parcel orders store no recommendation (no offers);
   parcel job alerts reach couriers carrying parcels; an accept keeps the live location while other orders are on board.
3. App: `useDriverWork()` holds every active order; jobs screen and order screen use `canTake`; "N orders in your care"
   links to Trips; booking shows "Standard parcel price"; admin settings show the new key; driver tip rewritten.
4. Tests: model (price, `canTake`), `tests/parcels.test.mjs` (price, multi-accept, exclusivity, alerts, location,
   load limit); older suites updated where they encoded one-job or distance pricing; mutation checks.
5. Phone: driver carrying 2 parcels sees Accept enabled, no offers, Trips lists both.
