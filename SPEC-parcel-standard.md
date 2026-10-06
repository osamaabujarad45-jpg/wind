# SPEC: parcel-standard (₪20 standard parcel, drivers carry many parcels)

Status: owner instruction, 6 Oct 2026: "for طرود the driver may have 100 or more, for example, and every one can cost the
customer 20 ILS, the standard price for it. Fill any gaps or wrong logic in the app."

## Wrong logic found (measured in code, 6 Oct 2026)

1. **One job per driver.** `/api/jobs/:id/accept` and `/offer` refuse any driver with an active order
   (`vehicle_busy`), new-job alerts skip them, and the driver app disables Accept while one job is active
   (`useDriverWork().order`, a single order). A parcel courier works a route with dozens to hundreds of parcels.
2. **Parcels priced like taxi trips.** `parcelBase + parcelPerKm × km` (₪12 + ₪0.8/km: Ramallah→Nablus ₪49–55) plus
   minutes, night and checkpoint terms. The owner's standard is a flat ₪20 per parcel, as local parcel companies charge.
3. **Driver offers on parcels.** With a standard price there is nothing to bargain; a driver offering on 100 parcels
   one by one is noise for customers.
4. Accepting a job deletes the driver's last location (`driver_locations`), which would blank the live map of every
   other parcel the driver is carrying.

## Design

- Settings: `parcelPrice` ₪20 (admin, Settings → Pricing) replaces `parcelBase` and `parcelPerKm`; `parcelLarge` stays
  (large parcels cost ₪20 + ₪10 by default). Plus still takes its discount. No distance, minutes, night or road terms
  for parcels. Same price in `quote()` (Souq partner orders, old apps) and `smartPrice()` (booking, `/api/price`).
- Parcel orders are fixed-price: `recommended_price` stays null, so drivers Accept (no offers); the road km is still
  stored for the job card.
- `canTake(active, service)` in `src/model.ts`, shared by server and app:
  - parcel job: allowed while every active order is a parcel and there are fewer than `PARCEL_LOAD` (200, a
    `ponytail:` knob, the owner said 100+);
  - ride / freight job: only with no active order (a passenger or a truckload is exclusive).
- Server: accept and offer use `canTake`; job alerts reach parcel drivers below the load limit; accepting keeps the
  driver's location when they already carry other orders.
- App: the driver holds a list of active orders; Accept on a job card follows `canTake`; the jobs screen shows
  "N parcels in your care" linking to Trips instead of a single current order.
- Booking shows "Standard parcel price" instead of the distance/time breakdown for parcels.

## Acceptance criteria

1. Any parcel trip (Ramallah→Nablus, Hebron→Jenin, same city) is ₪20 small/medium, ₪30 large, Plus 15 % off; booking
   and Souq quotes agree.
2. A driver with 3 active parcels can accept a 4th; with an active ride can accept nothing; with active parcels cannot
   accept a ride; at 200 parcels cannot accept a 201st.
3. Parcel orders have no driver offers (`fixed_price`); rides and freight keep offers.
4. Accepting a second parcel keeps the driver's live location on the first one.
5. Job alerts reach a driver carrying parcels for a new parcel job, not for a ride.
6. Tests: model unit tests for the price and `canTake`; API test for multi-accept, limits, offers refused, location
   kept, alerts; mutation-checked. Phone check: driver accepts two parcels, both in Trips, customer sees ₪20.

## Compatibility

Apps ≤ 1.0.7 compute their own quote and will be asked to re-confirm (409 `price_changed`) until updated; 1.0.8 gets
its price from the server. Admin-saved `parcelBase`/`parcelPerKm` values are ignored from now on.
