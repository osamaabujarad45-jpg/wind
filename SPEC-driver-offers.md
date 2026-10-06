# SPEC: driver-offers (smart recommended price, drivers name their price, price rating)

Status: requested by the owner on 6 Oct 2026: "payments cash; the price based on the driver ask, but the driver can see
the recommended price and the customer can rate the price and the driver overall like the referenced apps; the
recommended price should be smart, based on trip distance, hour, time and road state."

Reference: inDrive (driver counter-offers, rider picks a driver by price, rating and car), Careem/Uber (fare from
distance + time, night and demand factors, post-trip rating).

## Owner decisions recorded (6 Oct 2026)

| Topic | Decision |
|---|---|
| Payments | Cash only. |
| Tipping | Not built: with cash the customer tips in hand. |
| Photo at drop-off | Not built: the 4-digit handover code is stronger proof than a photo. |
| Driver document upload | Deferred: storing ID/licence scans is a privacy liability; admins keep approving drivers after an in-person check. |
| Cancellation fee | Not built: a cash fee cannot be collected after a cancel, and inDrive charges none. |

## Measured before designing (public OSRM, 6 Oct 2026)

| Trip | Road km | OSRM min | km × 1.2 (50 km/h) |
|---|---|---|---|
| Ramallah → Nablus | 53.3 | 61 | 64 |
| Hebron → Ramallah | 54.0 | 53 | 65 |
| Ramallah → Jenin | 97.1 | 104 | 116 |
| Ramallah → Al-Bireh (pins) | 1.8 | 4 | 2 |

Between cities OSRM time is about 50 km/h, so charging every minute would charge distance twice. The time part charges
only minutes **beyond** 50 km/h (town traffic, checkpoint delays).

## Design

### 1. Smart recommended price (server, `src/pricing.ts` shared with the client for the breakdown)

`price = (base + perKm × roadKm + large + loadingHelp + perMinute × extraMinutes) × (1 + nightExtra if night) × (1 − plus)`

- **Distance**: road km of the route the driver would take (`roadRoute()`, the same checkpoint-aware route the map
  draws), between the pins when set, else city centres. Without routing: straight km × 1.3 (today's estimate).
- **Time**: `extraMinutes = max(0, routeMinutes − roadKm × 1.2) + delayMinutes`.
- **Road state** (Wind's own live API, `/api/roads`: driver reports, fresh for 2 hours): each checkpoint reported
  **slow** on the route adds 15 min; each **closed** checkpoint the route still has to cross adds 30 min. A closed one
  the route avoids already costs its detour in km and minutes. "On the route" = a positioned checkpoint within 200 m of
  the line, or an unpositioned one tied to either city.
- **Hour**: night (22:00–05:59 Palestine time, or the scheduled pickup time) adds `nightExtra`.
- New admin settings (Settings → Pricing): `perMinute` ₪0.25, `nightExtra` 20 %. Delay minutes and the night window are
  code constants (`ponytail:` knobs).
- `GET /api/price?…` returns `{ price, km, minutes, extraMinutes, night, slow: [names], closed: [names], estimated }`.
- Booking shows the recommended price and why ("53 km · 61 min · night rate · Surda slow +15 min").
- Orders store `recommended_price`. The server recomputes on booking; a different price → `409 price_changed` with the
  new price, and the app asks the customer to confirm again (same pattern as today).
- **Compatibility**: installed APKs ≤ 1.0.7 send the old client quote. Without `pricing: "smart"` in the body the server
  keeps the old tariff for that order, so old apps keep booking.
- **Souq partner orders keep the fixed tariff** (the buyer agreed a delivery price in Souq); drivers can only accept them.

### 2. Drivers name the price (inDrive pattern)

- A Wind order is created at the recommended price. On a job card the driver sees the recommended price and what they
  earn, and either:
  - **Accept ₪X**: takes the job at the recommended price at once (as today), or
  - **Offer a price**: any whole-shekel price from 50 % to 200 % of the recommended one (`ponytail:` band against
    typos). An offer is pending until the customer picks it, for 10 minutes, or until the driver takes another job.
    A new offer from the same driver replaces the old one.
- **Customer** (order screen while searching): "Driver offers" list, cheapest first: name, vehicle, ★ rating, price
  fairness rating, finished trips, price. **Accept** assigns that driver at that price; the other offers are dropped.
- On acceptance: price = offer, commission recomputed on it, a promo/credit discount is capped at price − 1.
  If the driver later releases the job, the order goes back to searching at the recommended price.
- Offers from a driver who is busy, blocked or whose offer expired are not shown and cannot be accepted.
- Partner (Souq) orders and orders from old apps that never see offers still work: Accept at the shown price.

### 3. Rate the price and the driver

- After delivery the customer rates the **driver** (★ 1–5, as today) and the **price** (★ 1–5, "How fair was the
  price?"), each once.
- A driver's profile carries average driver rating, average price rating and finished trips; customers see them on
  offers, drivers see them on their account.

## Acceptance criteria

1. Recommended price uses road km; a longer detour or a slow/closed checkpoint on the route raises it; night raises it;
   Plus lowers it; without routing it falls back to straight km × 1.3.
2. Booking shows the recommended price and its reasons, in Arabic and English; price changes ask for confirmation.
3. A driver can accept at the recommended price, or offer 50–200 % of it; out-of-band, expired or duplicate offers are
   refused.
4. The customer sees offers (cheapest first) with driver stats and accepts one; the order is assigned at that price,
   commission and discount follow it; two drivers' accepts race safely (one wins).
5. Partner orders and old app bookings keep working unchanged.
6. The customer rates the price separately from the driver; averages appear on offers and the driver account.
7. Verified on the connected phone (customer, driver, admin; English and Arabic).

## Out of scope

Customers proposing their own price (owner chose driver-asked prices); push notification for a new offer (the order
screen refreshes every 4 s); demand/surge pricing (PRODUCT.md forbids unexplained surge).
