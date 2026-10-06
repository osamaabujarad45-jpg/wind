# Plan: offer-alerts (SPEC-offer-alerts.md)

One slice: two push kinds on the existing Web Push outbox (`queuePush` → `flushPush` after the request commits).

1. `POST /api/jobs/:id/offer`: before the upsert, if this driver has no live offer (< `OFFER_TTL`) on the order, queue
   `offer` to the customer. A price change on a live offer stays silent.
2. `POST /api/orders/:id/offers/:driver/accept`: queue `offer_accepted` to the chosen driver inside the transaction.
3. `flushPush`: both kinds high urgency; `offer` TTL = `OFFER_TTL` (an alert for an expired offer is noise).
4. `public/sw.js`: Arabic and English words; tag stays `order-N`, so offers on one order collapse.
5. Test in `tests/push-server.test.mjs`; mutation-check each rule.

Verification: gate, then the phone sweep (also covers the release 27 items the ship pass did not re-run on the phone:
job card road km and the offer flow).
