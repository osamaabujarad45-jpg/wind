# SPEC: parcel-recipient (courier "recipient name and phone"; Uber Connect recipient)

Status: loop 16, 8 Oct 2026, owner standing instruction (courier parity; loop without asking).

## Problem (measured)

Production Wind is parcels only. A parcel booking stores one phone, «رقم للتواصل», pre-filled with the sender's own
number. The driver's order screen shows that as "Customer", so at drop-off the driver can only call the sender, who
then relays to the buyer; the handover code also has to be passed on by hand. Every courier app (and Uber Connect)
takes the recipient's name and phone.

## Design

- `orders.recipient_name`, `orders.recipient_phone` (additive). `POST /api/orders` accepts optional
  `recipientName` (≤ 60) and `recipientPhone` (Palestinian mobile, normalized) for parcels and loads; a ride with a
  recipient, or an invalid phone, is 400.
- `recipientName` / `recipientPhone` on an order for its customer, its assigned driver and admins only; never on job
  cards before acceptance (same rule as phones today) and never on the public tracking page.
- Booking: «اسم المستلم» and «هاتف المستلم» (optional) under the drop-off for parcels and loads. Order again copies
  them; send another does not (new buyer).
- Order screen: the driver gets a «المستلم» card with call; the customer gets «أرسل رابط التتبع للمستلم على
  واتساب», which creates the share link and opens `wa.me/970…` with the link (no SMS provider needed).
- Account deletion blanks both fields with the rest of the order's personal data.

## Acceptance criteria

1. Stored and normalized; invalid phone and ride-with-recipient refused; optional.
2. Visible to customer, assigned driver, admin; hidden on job cards and public tracking; cleared on deletion.
3. Booking fields, driver call card, WhatsApp button in Arabic and English.
4. Server test (mutation-checked); presentation test for againForm/pickupForm; tsc, lint, `npm test`, screenshots.
