# SPEC: customer-rating (Uber/Careem: drivers rate riders; drivers see a rider's rating before taking the job)

Status: loop 10, 8 Oct 2026, owner standing instruction (Uber/Careem parity; loop without asking).

## Problem (measured)

Ratings run one way. Customers rate the driver and the price (`/api/orders/:id/rate`), but a driver has no way to
say a sender was absent, rude or did not pay, and a driver choosing between job cards knows nothing about who is
asking. Uber and Careem both show drivers the rider's rating on the request card. Wind is cash only, so a driver
deciding whether to drive to a no-show is risking real fuel money.

## Design

- `orders.customer_rating INTEGER` (additive column). `POST /api/orders/:id/rate { customerRating }` from the
  assigned driver on a completed order, 1–5, once; anything else is 409 `cannot_rate`.
- A driver sees `customerStats: { rating, trips }` on job cards (searching) and on orders assigned to them:
  `trips` = the customer's finished orders, `rating` = average driver-given stars rounded to a tenth, shown only from
  3 ratings (fewer could expose one driver's rating). Job card line: «★ 4.8 · 12 رحلة» or «عميل جديد».
- `customerRating` on an order is visible to the driver who gave it and admins; customers do not see per-order
  ratings (Uber hides them too).
- Completed-order screen for the driver: «كيف كان العميل؟» five stars, then «شكراً لتقييمك».

Owner decision (agent default): information only. A low rating never hides a job from drivers or blocks a
customer; admins already have suspension for abuse.

## Acceptance criteria

1. Driver rates once; customer, other drivers, unfinished orders, out-of-range and second ratings are refused.
2. Stats: trips counts finished orders; rating hidden below 3 ratings, average of driver ratings from 3.
3. Customers never receive `customerRating` or `customerStats`.
4. Job card and completed-order rating work in Arabic and English (RTL rule respected).
5. Tests: `node --test` server test (mutation-checked); tsc, lint, `npm test`.
