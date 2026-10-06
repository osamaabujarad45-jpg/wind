# Plan: order-again

1. `againForm(order)` and `canOrderAgain(order, role)` in `src/booking.ts` + tests in `tests/presentation.test.mjs`.
2. Copy keys (en/ar): `orderAgain`, `orderAgainFrom`.
3. Order screen button; booking `again` param fills the form after the pending-booking check.
4. Gate: `npm test`, tsc, lint, `npm run screens`; mutation-check the two rules.
5. Phone: debug build against the local demo server with real OSRM; customer completes an order with the demo
   driver, taps Order again (English and Arabic), books it; regression sweep of the core flows.
6. Ship: backup, deploy web, live checks, APK 1.0.7 over 1.0.6, push, logs.
