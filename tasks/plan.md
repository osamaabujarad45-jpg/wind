# Plan: driver-offers

1. `src/pricing.ts`: pure `smartPrice()` + `isNight()` + offer band; unit tests (distance, extra time, slow/closed,
   night, plus, fallback). Settings `perMinute`, `nightExtra` (+ admin labels).
2. Server: `recommend()` (route + road state → smartPrice); `GET /api/price`; orders store `recommended_price`;
   `pricing: "smart"` recomputes and 409s with the new price; legacy path untouched; partner untouched.
3. Server: `order_offers`; `POST /api/jobs/:id/offer`; offers on the customer's order; `POST /api/orders/:id/offers/:driverId/accept`;
   release resets the price; price rating on `/rate`; driver stats (price rating, trips) in `toUser` and offers.
   Integration test `tests/offers.test.mjs` (band, expiry, busy driver, race, partner refused, discount cap, release, rating).
4. Client: booking uses `/api/price` (+ reasons); driver job card Accept / Offer; customer offers list; price-fairness stars;
   driver account stats. Copy en/ar. Screens.
5. Gate + mutation checks; phone (customer/driver/admin, en+ar) against the local server with real OSRM.
6. Ship: backup, deploy, live checks, APK 1.0.8, push, logs.
