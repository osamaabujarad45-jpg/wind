# SPEC: send-another (parcel couriers' "new shipment from the same sender")

Status: loop 14, 8 Oct 2026, owner standing instruction (Uber/Careem/courier parity; loop without asking).

## Problem (measured)

Production Wind offers parcels only (`WIND_ENABLED_SERVICES=parcel`, checked 8 Oct). The senders who book most are
shops and Souq sellers sending several parcels from one place to different buyers. Each booking starts from
Ramallah→Nablus defaults: the shop re-picks its pickup city, pin and note every time. "Order again" copies the whole
old order, recipient included, so it is wrong for a different buyer.

## Design (client only)

- On a customer's own parcel order, in any state but cancelled: «أرسل طرداً آخر من نفس المكان» →
  `/book?again=<id>&keep=pickup`.
- `pickupForm(order)` (src/booking.ts) copies only service, option, pickup city, pin and note. Drop-off, recipient
  phone and item stay the form's defaults, so one buyer's details never reach the next parcel.
- Caption «نفس مكان الاستلام في الطلب {code}. أدخل المستلم الجديد.».

Not built (owner decision needed): cash on delivery (the courier collects the goods price for the sender). It needs a
sender payout ledger, and SPEC-cash-settlement.md marks payouts "ask first".

## Acceptance criteria

1. `pickupForm` copies the pickup only (unit test, mutation-checked).
2. Button only for the order's customer, parcel orders, not cancelled.
3. Booking from it shows the pickup filled and the recipient blank; tsc, lint, `npm test`, screenshots.
