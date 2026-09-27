# Wind — product requirements and market study

Research snapshot: 27 September 2026. The launch geography is **multiple West Bank cities** and the first release includes **all three services**. This document distinguishes published facts from product assumptions; market size, competitor transaction volumes, and live city coverage have not been independently measured.

## 1. The product

Wind lets someone move **an item, a person, or a large load** through one familiar route flow: choose service → set pickup and destination → add the few details that service needs → see the available vehicle and price → confirm → track → complete with proof and support.

The customer should always know:

1. Whether this city pair and service are available now.
2. Which vehicle type is coming and what it can carry.
3. What the price includes and who pays.
4. Where the driver is, when the last location was received, and what happens if the route is delayed.
5. Who has custody of an item and how a handoff is confirmed.

### Design intent

The person opening the app may be outside a shop, in a shared taxi station, or moving a household item with weak connectivity. The interface should feel calm, local, and direct. Its visual language comes from limestone, olive trees, road asphalt, and terracotta signs. The signature is a **single route spine** that stays legible from booking through proof of delivery. Avoid a giant map as the home screen, a crowded “super app” menu, and unexplained surge pricing.

Arabic is the default with complete English copy; both must use clear labels, readable type, 44-point minimum touch targets, and full screen reader names. The customer can manually enter a landmark when GPS fails.

## 2. What the market evidence says

| Published product or source | Observed offer | Wind implication |
|---|---|---|
| [Yummy Palestine](https://yummy.ps/?lang=ar&language=en) | Food and grocery ordering with order tracking in Palestine. | Do not build a restaurant marketplace first. Serve customer-owned parcels and non-food pickup. |
| [Waselne](https://waselne.com/) | Peer-to-peer parcel and passenger matching; its site also shows road conditions. | A managed order, driver verification, support, clear fare, and handoff record are useful differentiators. This is a proposed positioning, not a measured competitor weakness. |
| [Taxi Palestine on the App Store](https://apps.apple.com/us/app/taxi-palestine/id6791242597) | Taxi-office selection, vehicle categories, live driver map, Arabic/English. | Vehicle choice and live tracking are baseline expectations for rides. Availability should be verified city by city. |
| [OPER](https://www.oper.ps/) | Advertises taxi, economy, VIP, and parcel categories. | A combined ride/parcel offer already exists. Its self-reported customer and driver counts are not used in our sizing. |
| [Lalamove](https://www.lalamove.com/en-hk/personal) | Vehicle selection, extra services, upfront price, live tracking, and recipient tracking in another market. | Large-load work needs dimensions, loading help, and an explicit vehicle match. This is a feature reference, not a Palestine competitor. |
| [Uber package delivery guidance](https://help.uber.com/driving-and-delivering/article/uber-connect---proof-of-delivery-pin?nodeId=61478729-8a5f-4f93-ba77-8fbcec909c16) | Recipient PIN as delivery proof. | Use a handoff code for parcels and a documented exception process. |

The [Palestinian Central Bureau of Statistics 2024 yearbook](https://www.pcbs.gov.ps/media/duelruxt/book2709.pdf) reports 2023 smartphone access in 95.2% of West Bank households. This supports a mobile-first approach, but it does not measure willingness to use this product. [OCHA's 2025 West Bank access snapshot](https://www.un.org/unispal/document/ocha-west-bank-humanitarian-access-snapshot-january-december-2025/) documents movement constraints, so quoted ETAs need confidence ranges and route-delay handling.

The [Palestinian Ministry of Telecommunications and Digital Economy's 2025 express-courier payment announcement](https://www.mtde.gov.ps/home/news/23075?culture=ar-SA) says courier companies must offer electronic payment and payments over ₪500 must use electronic means. Applicability to Wind's exact legal structure must be checked before launch. The [PMA's licensed payment providers directory](https://www.pma.ps/supervision-institutions-companies/electronic-payment-service-companies) is the starting point for choosing a provider.

## 3. Users and jobs

| User | Job | Success means |
|---|---|---|
| Individual sender | Send keys, a purchased item, documents, or a gift | Recipient gets the correct item and both parties can see proof. |
| Passenger | Reach a destination within or between supported cities | Fare and driver identity are clear before boarding; route can be shared. |
| Household or small business | Move an appliance, furniture, or stock | Vehicle fits, loading effort is known, and damage responsibility is recorded. |
| Driver or courier | Accept suitable jobs and get paid | Offer states route, load, payout, and any restricted conditions. |
| Recipient | Receive an item with minimal setup | Tracking link, ETA, and handoff code work without installing the app. |
| Dispatcher/support | Resolve late, failed, unsafe, or disputed jobs | Every decision and state change is auditable. |

## 4. Service rules

| Rule | Parcel | Ride | Large load |
|---|---|---|---|
| Customer input | Item type, size/weight band, declared value band, sender and recipient | Passenger count, accessibility needs, optional note | Dimensions/weight band, floors/lift, loading help, item photos with consent |
| Vehicle | Courier vehicle that fits the package | Licensed passenger vehicle with enough seats | Van/pickup/truck matched to capacity and loading crew |
| Scheduling | Now or chosen window | Now or chosen departure | Scheduled window by default; same-day if capacity exists |
| Confirmation | Pickup scan/photo and recipient PIN | Driver identity, plate, pickup PIN | Before/after condition photos and signed or coded delivery |
| Payment | Sender or recipient pays as selected; COD requires reconciliation | Rider pays | Booker pays; material extras require approval |
| Failure path | Recipient unreachable → contact sender → reattempt/return quote | Rider no-show → grace period → transparent fee | Load mismatch → new vehicle/quote or cancel without surprise charge |

**Safety and scope:** Never silently mix passenger rides with package carriage. No dangerous or unlawful goods, cash transport, medical emergencies, or unlicensed taxi work. Prescription drugs, valuables, live animals, and cross-border trips require separate policy and partner review before enabling.

## 5. User requirements

### Customer

- **U1** Book any of the three services from the same home screen without choosing a vehicle prematurely.
- **U2** Set pickup and destination by map pin, search, saved place, or typed landmark; GPS is optional.
- **U3** See service availability and a price or a clearly labeled manual quote before commitment.
- **U4** Change/cancel with visible fee and refund effect before confirming the change.
- **U5** Track a real assigned driver with last-updated time, ETA range, and status timeline.
- **U6** Contact support and share a ride or delivery tracking link; recipient does not need an account.
- **U7** See a receipt, payment status, and proof after completion.
- **U8** Use Arabic RTL or English, larger device text, screen reader, and keyboard controls.

### Driver

- **U9** See only jobs matched to verified vehicle type, capacity, operating area, and license.
- **U10** See expected pay, pickup, destination, item/load notes, and required documents before accepting.
- **U11** Use turn-by-turn external navigation while Wind reports job status and location.
- **U12** Record arrival, pickup, delay, handoff, and incident with offline retry.
- **U13** Stop location sharing immediately when a job ends and see earnings/settlement history.

### Operations

- **U14** Verify identity, vehicle, license, insurance, and documents before activating supply.
- **U15** Edit service coverage and tariffs by city pair and vehicle type without app release.
- **U16** Reassign stalled jobs, approve exceptions, contact both parties, and record reason codes.
- **U17** Reconcile cash, COD, digital payments, refunds, driver payouts, and failed transfers.
- **U18** Investigate complaints using an immutable event trail and limited access to private data.

## 6. Flows without conflicts

1. **Availability first.** City pair and service determine which vehicles and time windows can be shown. “No vehicle now” offers a scheduled slot or support request, never a false instant booking.
2. **One authoritative order state.** Customer, driver, and dispatcher read the same server event stream. A driver cannot complete a parcel delivery without proof; a passenger trip cannot enter parcel handoff states.
3. **One active assignment.** A job can have only one active driver assignment. Reassignment closes the old assignment before a new one is offered.
4. **Quote before commitment.** Price includes base, estimated route, vehicle, stops, loading, and tax/fees if applicable. Any route/load change requires a new quote and customer approval.
5. **Handoff before completion.** Parcel and freight completion requires proof, then payment settlement. A “delivered” tap alone is insufficient.
6. **Location confidence.** If GPS is denied or stale, show the last update and use manual call/landmark workflow; never animate an invented vehicle position.
7. **Road delays.** Driver reports blocked route or delay; dispatcher may change route, ETA, and price only through a visible, consented event.

## 7. Initial release and exclusions

**Initial release:** customer and driver apps, admin dispatch console, the three service types, verified city/route availability, quotes, cash plus one licensed digital provider, live location during active jobs, proof of completion, support, and receipts.

**Later only after demand evidence:** merchant bulk portal/API, recurring rides, pooled rides, multiple simultaneous stops, AI route optimization, subscriptions, and an open marketplace. These complicate custody, pricing, or safety before the base journey is proven.

## 8. Product success measures

Track service and city pair separately: request-to-assignment rate, median assignment time, on-time arrival, completed-with-valid-proof rate, price-change rate, cancellation reason, support contacts per 100 orders, safety incidents, net revenue per job, and driver take-home pay. Do not optimize cheaper fares by hiding driver costs.

Pilot exit targets must be set from observed local supply and real tariff interviews; no unsupported market-size or fare target is asserted here.
