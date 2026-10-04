# Spec: dispute-credit (Wind) — goodwill credit on a resolved issue

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md) (`trip-issues`). Approved under the standing go-ahead of 2026-10-04.

## Objective

Customers can already report an issue on a finished order and an administrator resolves it with a note
(SPEC-delivery-exceptions.md). Uber and Careem usually close a valid complaint with a credit for the next trip.
Wind pays cash, so the credit is a personal one-use code (the same owned codes as invite rewards, SPEC-referral.md).

1. When resolving, the administrator may add a goodwill credit of ₪1–50.
2. The customer gets a personal one-use code for that amount, valid 90 days; only they can use it. It appears on
   the order's resolved-issue card, in "Your ready codes" on the account and as the one-tap chip on booking.
3. Wind funds it through the driver cash ledger like every promo discount. Without a credit nothing changes.

## API

`POST /api/admin/disputes/:id/resolve` `+ {creditShekels?}`; the customer's order `dispute` gains `credit: {code, amount} | null`;
`GET /api/admin/disputes` gains `creditAmount`. Column `order_disputes.credit_promo_id` (additive).

## Testing

`tests/credit.test.mjs`: invalid amounts refused; credit issued once with the resolution; only the customer can use it;
listed in `/me/referral` credits; shown on the order; no credit when omitted.
