# SPEC: order-again

Status: approved by the owner's loop request (6 Oct 2026: "identify new scope compared to reference apps").

## Gap found (Wind vs Uber/Careem, 6 Oct 2026)

Scan of `src/` and `server/` for reference-app features with no Wind code yet:

| Feature | Reference | Decision |
|---|---|---|
| **Order again from a past order** | Uber "Rebook", Careem "Book again" | **this spec** (provider-free, client-only) |
| Tipping | Uber, Careem | waits for `digital-payments`: with cash only, a tip is handed over in person |
| Photo proof at drop-off | Uber Connect | handover code already proves delivery; needs a native camera module |
| Driver document upload | Uber/Careem driver sign-up | ID photos are sensitive data; owner decides storage |
| Cancellation fee, declared value | Uber, Careem | pricing decisions, owner |

## Problem

Customers repeat the same deliveries (same shop to the same relative, every week). Today they retype both
landmarks, the item description, the contact number, and re-pick map pins. Landmarks are the address here, so
retyping is slow and error-prone.

## Design

- **Order screen** (`src/app/order/[id].tsx`): a customer sees **Order again** on their own order once it has
  ended (`completed`, `returned`, `cancelled`). It opens `/book?again=<id>`.
- **Booking** (`src/app/book.tsx`): with `again`, after the pending-booking check, it loads `/orders/<id>` and
  fills the form from it. A saved pending booking always wins (it is an in-flight command that may already be
  committed, so it must not be replaced).
- **What is copied** (`againForm()` in `src/booking.ts`): service, both cities, both map points, both landmarks,
  item description, contact number, size/seat option, loading help.
- **What is never copied**: price (re-quoted from today's tariff), promo code, scheduled time (starts at "now"),
  the old request ID (a new booking gets a new one). An option that is no longer valid for the service falls back
  to the first one.
- A caption under the header says the form was copied from order W-xxxx and that the price is today's fare.
- Access: the server already returns an order only to its customer, driver or an admin (`getOrder`), so
  `again=<someone else's id>` loads nothing and the form stays empty. No server change.

## Acceptance criteria

1. A finished or cancelled order shows **Order again** to its customer; an active order, a driver and an admin
   do not see it.
2. Tapping it opens booking with service, cities, pins, landmarks, detail, contact, option and loading help filled.
3. Price comes from the current tariff; no promo and no schedule are carried over.
4. An unfinished pending booking is not overwritten.
5. A missing or foreign order leaves a normal empty form (no crash, no error banner).
6. Works in Arabic and English, on the phone (Android) and web.

## Out of scope

"Order again" on the orders list rows (one entry point is enough for now); Souq listings.
