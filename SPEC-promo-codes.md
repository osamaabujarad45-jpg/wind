# Spec: promo-codes (Wind) — first slice of `promo-referral`

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Careem/Uber grow with promo codes ("first ride ₪10 off"). Wind has none. Payments are cash, so the
discount must be honest for the driver: the customer pays less in cash and Wind, not the driver,
funds the difference through the existing cash ledger.

1. **Admin creates codes:** code (A–Z/0–9, 4–16 chars, unique), fixed discount in whole shekels (1–100),
   total uses (1–10 000), expiry (1–90 days), optional "first order only". Admins can deactivate.
2. **Customer applies a code** on the booking screen; the app shows the discount and "you pay ₪X".
   Each customer can use a code once. The discount never brings the fare below ₪1.
3. **Order:** `price` stays the full fare (driver earnings and commission unchanged); `discount` is
   stored; the customer pays `price − discount` in cash. A cancelled order frees the use.
4. **Driver:** the order shows "Collect ₪(price − discount) in cash". The cash ledger credits the
   driver with the discount of each finished order (owed = commission − discounts + adjustments − remitted).
5. **Integrity:** the server recomputes the discount; if the client's expected discount differs,
   `409 promo_changed`. Invalid/expired/used codes: `400 invalid_promo` / `409 promo_used`.

## API

| Method + path | Who | Result |
|---|---|---|
| `POST /api/promos/check` `{code, price}` | customer | `{ code, discount }` |
| `POST /api/orders` `+ {promoCode, expectedDiscount}` | customer | order with `discount` |
| `GET /api/admin/promos` / `POST /api/admin/promos` / `POST /api/admin/promos/:id/deactivate` | admin | list |

Tables `promo_codes`, `promo_redemptions`; column `orders.discount` (additive; `user_version` 3).

## Testing

`tests/promo.test.mjs`: admin validation; check/apply; once per customer; total-use cap; expiry; first-order
rule; cancel frees the use; floor ₪1; promo_changed; driver sees collect amount; cash ledger credit;
non-admin 403; partner orders unaffected.

## Success criteria

Tests, typecheck, lint, screenshots; browser check of applying a code and the driver collect amount.

## Known limits (ship review)

- A returned order counts its discount like it counts commission (`finishedSql`); revisit both once the return-fare policy in SYSTEM.md is decided.
- A `searching` order that never matches keeps its code use until the customer cancels it.
- When promos outweigh commission, Wind owes the driver; admins settle with "Pay driver" (a payout adjustment).
