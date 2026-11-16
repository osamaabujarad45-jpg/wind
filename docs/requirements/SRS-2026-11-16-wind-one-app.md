# Wind — Software Requirements Specification: one app for rides, shipping and delivery

**Version 1.0 · 16 November 2026 · Status: draft for owner review.**
**Baseline:** `origin/master` `fb05483`; production `https://4.223.118.16.sslip.io` (parcel only, cash only, SQLite).
**Owner request (16 Nov):** study the Kimi research and the competitor apps, then specify one app that combines a
shipping app, a delivery app and an Uber-style ride app — complete, designed, accessibility-checked, and consistent as
one product with no conflicts between the parts.

---

## 0. How to read this document

### 0.1 Keywords and IDs

- **MUST** = required for the service line to launch. **SHOULD** = required unless the owner waives it in writing.
  **MAY** = optional.
- Every requirement has a stable ID: `AREA-NN` (for example `RIDE-07`). PRs cite these IDs in their titles or bodies.
- **Status** (column `St`) is Wind's state at the baseline commit:
  - **E** = exists in code and enabled in production.
  - **E-off** = exists in code but disabled in production. The cause is a disabled service, PostgreSQL-only code, or a
    missing provider.
  - **P** = partial; the gap is named in the row.
  - **N** = new.
- **Gate** names an owner decision or an outside dependency (provider, licence, contract) that must be cleared first.

### 0.2 Sources studied

| Key | Source | What it contributed |
|---|---|---|
| **KIMI-MAP** | `docs/BUILD-SPEC-2026-11-02-fastship-map-uber-patterns.md` (main checkout; Kimi K3, verified by GLM 5.2 ×2) | Camera-intent model, pin anatomy, ETA pill, two-layer route line, glide/stale rule, per-stage map layers, recenter and compass buttons |
| **KIMI-API** | `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` (Kimi K3 pass 1, corrected by Sonnet pass 2) | Rider request lifecycle: fare estimate → draft order → offers → dispatch view → trip → receipt |
| **UB-F / UB-D** | `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md`, `…-screens-and-design-system.md` | Uber F1–F28 functional areas, N1–N15 non-functional areas, design-system structure |
| **R-UB** | `research_notes/REA-2026-11-13-reference-apps/UBER-4.655-rider.md` | Map-first home, saved places, live tracking, cash-first checkout |
| **R-CA** | `…/CAREEM.md` (rider + Captain) | Super-app structure, address model (pin + nickname + building type + notes + photo), cash as an instrument with an arrears rule, refusal-reason catalogue, captain earnings taxonomy |
| **R-HA / R-HD** | `…/HAAT.md`, `…/HAAT-DRIVER.md` | Arabic order-state vocabulary, ETA ladder, minimum order, separate service-fee line, coupons at payment, edit-before-dispatch |
| **R-SH** | `…/SHIPLY.md` | Parcel domain: sender/recipient/favourite recipients, status vs final status vs attempt step, COD order types, QR as parcel identity, same-day as a parcel attribute |
| **R-SQ** | `…/SOUQ-TULKARM.md` | Zone + landmark address, delivery windows with daily capacity, append-only cash ledger, delivery proof code + QR with lockout, typed failure reasons, custody chain, substitution consent, honest tracking degradation |
| **R-PAL** | `…/PALESTINIAN-COMPETITORS-INDEX.md` | Adopt A1–A15, skip S1–S13, defer D1–D14 with evidence gates |
| **D-UB … D-SQ** | `Documents/wind-competitors/*/HANDOFF.md` (WindRide, WindCaptain, WindBazaar, WindParcel, WindMarket) | Working mechanisms: server-owned clocks, single active order, weighted lines, shop progression without stuck orders, role-scoped snapshots |
| **PLAN** | `docs/REA/2026-11-15-FEATURE-INTEGRATION-PLAN.md` (131 features) and `docs/REA/2026-11-15-competitor-apps-vs-wind.md` | Feature-by-feature status of Wind against competitors, work packages WP-01…WP-20 |
| **WIND** | `docs/PRODUCT.md`, `docs/SYSTEM.md`, `docs/PILOT.md`, `docs/DESIGN-AUDIT-2026-11-09.md`, `src/`, `server/` | Current product, architecture, design tokens and accessibility work |

Rule carried from every study: Wind copies **behaviour**, never code, strings, art, colours or API shapes from another
app (R-PAL §2 header; PLAN §D).

---

## 1. Product definition

### 1.1 Vision

**Wind moves a person, an item, or an order across West Bank towns in one app.** It has three service lines, one
account, one map home, one order record, one captain app mode and one operations console:

| Service line | Customer job | Benchmark | Wind service key |
|---|---|---|---|
| **Ride** | "Take me there" | Uber, Careem | `ride` |
| **Shipping** | "Send this item, or this load, to that person" | Shiply, Uber Connect, Lalamove | `parcel`, `freight` |
| **Delivery** | "Bring me goods from a shop" | HAAT, Souq Tulkarm | `shop` (new) |

### 1.2 Market constraints that shape every requirement

- **Geography:** West Bank towns, with checkpoints and road closures. Rollout order is West Bank → Israel → airport.
  Phone numbers start +970 or +972. Routes are field-checked before a town pair is enabled.
- **Money:** cash first. Cards and wallets need a PMA-licensed provider (gate **G-PAY**). Courier payments over ₪500
  must be electronic (MTDE 2025 announcement, `docs/SYSTEM.md` §7). Money is always integer agorot.
- **Network and devices:** budget Android phones on 3G or 2G. Arabic first, with full English.
- **Supply:** a service line is visible only where verified captains, and for Delivery verified merchants, exist (SCOPE).

### 1.3 Roles

| Role | Description | Account |
|---|---|---|
| Customer | Books rides, sends items and orders goods. One account covers all three. | Phone + password; email optional |
| Recipient | Receives a parcel or delivery for someone else | No account. Gets a tracking link and the delivery code by message |
| Captain (driver) | Carries out jobs on approved vehicles and approved service lines | Driver account, approved by an admin |
| Merchant (new) | Shop that receives Delivery orders, prepares them and hands them over | Merchant account, approved by an admin. Uses the merchant mode of the same app or the web console |
| Admin / dispatcher / cashier | Approves people, dispatches, settles cash, resolves exceptions | Created by operator enrollment only (no self sign-up) |

---

## 2. One-app architecture rules (the "no conflict" guarantee)

These rules make the three service lines one product, not three apps in one install. They apply to every later
section.

| ID | Requirement | St |
|---|---|---|
| ONE-01 | There MUST be one account, one session and one profile per person. Role is derived from the server session, never from a client toggle (PLAN S-13). | E |
| ONE-02 | There MUST be one `orders` record type with a `service` field. Each service line adds its own child record (ride: seats, boarding PIN, waiting timer; shipping: package, recipient, proof, return, COD; delivery: merchant, basket lines, substitution policy). History, receipts, ratings, disputes, chat, push and admin tools work on `orders` and so cover all services without copies. | P: `orders` has `service`; the shop child record is N |
| ONE-03 | All services MUST share one state-machine spine using the code's names (`OrderStatus`, `src/model.ts`): `searching → assigned → at_pickup → in_transit → completed`, with the side and terminal states `cancelled`, `on_hold`, `returning`, `returned`, plus `failed` and `disputed`. `requested` (shop orders waiting for the merchant) and the ride sub-step `boarded` are new. A service adds only the sub-steps it needs (§2.1). A screen MUST NOT invent a service-specific top-level state. | P: `requested`, `boarded` and the shop sub-steps are N |
| ONE-04 | One status vocabulary in Arabic and English, naming the actor and the next step (R-HA §4), MUST be shared by every service: the same words for the same spine state. Service wording is allowed only in the sub-step line. | P |
| ONE-05 | One home MUST serve all services: a map-first home with a service switcher (Ride · Send · Shop), plus one "where to" entry, saved places, recents and an active-order card (§4.2). | P: parcel only |
| ONE-06 | One booking engine MUST cover all services, built as a step workflow (R-CA §3): place → service details → option/price → payment → confirm. Each step is a named, testable state, so a failed step is retried on its own. Service lines plug in steps and do not fork the flow. | P |
| ONE-07 | One quote model MUST serve all services: server-priced, versioned tariff, expiry, usable once, idempotent create (PLAN C-18). | P: server price check and idempotent create are live; versioned quote records (`server/domain/quotes.ts`) are PostgreSQL-only |
| ONE-08 | One payment model MUST serve all services: cash (plus account credit and promo) now, a licensed PSP later behind one `PaymentMethod` interface (gate G-PAY). | E (cash); account credit exists as one-use credit codes; the provider interface exists only in PostgreSQL-gated `payments.ts` |
| ONE-09 | One captain mode MUST serve all services: one job board and one offer channel, with each job showing a service badge (icon + word, never colour alone). Concurrency rules come from §2.2 and are enforced on the server. | P |
| ONE-10 | One cash ledger and one cash cap per captain MUST count every service's cash (fares, delivery fees and, when enabled, goods COD) (PLAN D-16/D-17, WP-16). | P: goods COD is E-off |
| ONE-11 | One notification system MUST serve all services, with one channel per event class (`jobs`, `status`, `cash`, `attention`, `chat`) shared across services, not per service (PLAN N-03, WP-10). | P |
| ONE-12 | One design system MUST serve all services: shared tokens and components (§11). A service line MAY have one identity accent, used only on its icon and badge, never on primary actions. | P |
| ONE-13 | A disabled service line MUST be invisible. It must not appear as a broken tile. A capability a deployment keeps switched off MUST read "not available in this stage", never as a fault (SCOPE, PR #63). | E |
| ONE-14 | The service catalogue (enabled lines, their order on home, town pairs) MUST be server-driven, so an operator can enable a line or a town without a store release (R-CA §8.5 key registry, R-HA §6). | P: `WIND_ENABLED_SERVICES` env; no per-town table |

### 2.1 State mapping per service line

| Spine state | Ride | Shipping (parcel/freight) | Delivery (shop) |
|---|---|---|---|
| `requested` (new) | — | — | order placed with merchant |
| merchant sub-steps | — | — | `accepted` → `preparing` → (`awaiting_approval` for substitutions) → `ready` |
| `searching` | finding a captain | finding a captain | finding a captain (starts when `ready` is near; see DLV-12) |
| `assigned` | captain on the way | captain on the way to pickup | captain on the way to shop |
| `at_pickup` | captain arrived; waiting timer runs | captain at sender; pickup code check | captain at shop; handover from merchant |
| `in_transit` | `boarded` sub-step (PIN checked), then on trip | in transit | on the way |
| `completed` | trip ended at drop-off | delivery code accepted | delivery code accepted |
| side states | `cancelled`, `no_show` | `on_hold` (typed reason) → `returning` → `returned`; `failed` | `rejected_by_merchant`, `on_hold`, `failed` → admin review |

### 2.2 Cross-service conflict rules

| ID | Rule | Why |
|---|---|---|
| CON-01 | A customer MUST have at most one active **ride**. They MAY hold several shipping and delivery orders at once. | A person is in one car at a time; items are not |
| CON-02 | A captain on an active ride MUST NOT receive or accept shipping or delivery jobs until the ride ends. Pooling stays out of scope (`docs/SYSTEM.md` §10). | Passenger safety and attention |
| CON-03 | A captain MAY carry several parcels and delivery orders together, up to the vehicle's load limit. The run sheet orders pickups, drop-offs and returns (PLAN D-11/D-12). Today `canTake` (`src/model.ts`) stacks parcels only with parcels, under a flat `PARCEL_LOAD = 200`. It MUST be extended to let `shop` stack with `parcel`, and to use a per-vehicle limit. | Courier efficiency |
| CON-04 | Job eligibility MUST be one server path: approved for the service line, vehicle class fits (§2.3), not blocked, under the cash cap, not on a ride, under the load limit, not held-cash-overdue (WP-12). It exists today as `canTake` plus `server/domain/driver-refusal.ts` (accept and admin-assign), and MUST be extended with service-line approval and cash age. Board, offer, accept and admin-assign all call it. | No path bypasses a rule |
| CON-05 | Cash exposure MUST be summed across all services before any accept (ONE-10). | One driver, one wallet |
| CON-06 | A promo code MUST declare which service lines it applies to. Applying it elsewhere returns a specific refusal (R-CA `PROMO_CODE_INVALID_SERVICE_TYPE`). | No silent misuse |
| CON-07 | A subscription plan (Plus/Pro) MUST state which services its benefits cover. | Clear value |
| CON-08 | Ratings MUST be per order and per role (customer→captain, captain→customer, customer→merchant). A rating MUST NOT carry over between service lines unless the owner decides it should. | Fairness |
| CON-09 | Notifications MUST name the order and service ("Your parcel to Nablus…"). A customer with three active orders MUST be able to tell them apart from the notification alone. | Many active orders |
| CON-10 | The active-order card on home MUST show one card per active order, ride first, then most recent. A ride takes the map; other orders show as compact cards. | One map, many orders |

### 2.3 Vehicle × service eligibility

Ride, parcel and freight follow `vehicleServices` in `src/model.ts` today. The shop column is new and proposed.
Changing any cell changes that table, which is server-enforced.

| Vehicle | Ride | Parcel | Freight | Shop delivery (new) |
|---|---|---|---|---|
| Bicycle | — | yes | — | yes, same town |
| Motorcycle | yes | yes | — | yes |
| Car | yes (seats from registration) | yes | — | yes |
| Van | — (passenger vans need a licence decision) | yes | yes | yes (bulk) |
| Truck | — | — | yes | — |

---

## 3. Account, identity and profile (ACC)

| ID | Requirement | St | Gate / source |
|---|---|---|---|
| ACC-01 | Sign-up and sign-in MUST use phone + password in Arabic and English. One account serves all service lines. | E | PLAN S-01 |
| ACC-02 | The phone MUST be verified by an SMS code before a first booking in any service line, once a provider is contracted. | E-off: the contact gate runs at sign-in behind `WIND_CONTACT_VERIFICATION_REQUIRED` (registration closes while it is set); phone codes are PostgreSQL-only (`phone-identity.ts`) | G-SMS (WP-04) |
| ACC-03 | Email verification and password reset by email MUST be available. | E-off | G-EMAIL (WP-05) |
| ACC-04 | A captain application MUST collect vehicle class, plate and requested service lines, and MUST wait for admin approval per service line. | P: one approval for all lines | R-CA §10 |
| ACC-05 | Captain documents (licence, insurance, ID) MUST be uploaded with an expiry date. An expired document MUST block the affected service line. | N | G-STORAGE |
| ACC-06 | A merchant application MUST collect shop name, location pin, opening hours, category and contact, and MUST wait for admin approval. | N | §7 |
| ACC-07 | A blocked or role-changed person MUST be told why and whom to contact, by push and at sign-in. | P | PLAN D-02, WP-03 |
| ACC-08 | Account deletion MUST be available in the app and on a public page. | E | PLAN S-04 |
| ACC-09 | The language switch (ar/en) MUST apply instantly and mirror the layout. | E | |
| ACC-10 | Captains MUST be able to set a "heading to" destination preference. | E | PLAN D-23 |
| ACC-11 | Plus (customer) and Pro (captain) subscriptions MUST state the services their benefits cover (CON-07); activation is manual by an admin while cash-only. | P: Plus and Pro exist with manual activation; benefits are not labelled per service line | PLAN A-13 |
| ACC-12 | A referral code MUST credit the referrer after the referee's first completed order in any service line. | E | PLAN C-20 |

---

## 4. Customer experience (shared across services)

### 4.1 Places and addresses (ADDR) — the Careem and Souq model

| ID | Requirement | St | Source |
|---|---|---|---|
| ADDR-01 | An address MUST be a confirmed map pin plus a free-text landmark. A street number MUST NOT be required. A town tap MUST force a pin. | E | R-CA §4, R-SQ F-01, PLAN C-03/C-04 |
| ADDR-02 | Saved places MUST support Home, Work and custom nicknames, and recents MUST be offered with one-tap reuse. | P: labels are fixed to home/work/other, named by the landmark; custom nicknames are N; recents exist | PLAN C-05 |
| ADDR-03 | An address book screen MUST allow rename, edit pin and delete outside any booking. | P | PLAN C-06, WP-14 |
| ADDR-04 | An address SHOULD carry a building type (house, apartment block, shop, office, other) and notes for the captain. Both travel into the order. | N | R-CA §4, WP-14 |
| ADDR-05 | An address MAY carry one entrance photo, shown to the captain before arrival. | N | R-CA §4; G-STORAGE |
| ADDR-06 | The pin MUST be settable by GPS, search, map drag, or typed coordinates / link / Plus Code. An accessible text alternative MUST exist for every map pick (A11Y-16). | E | UX-03 (#51), coordinate field (#54); phone check C-07 passed |
| ADDR-07 | An outside-service-area pin MUST be refused before pricing, with a specific message. | E | PLAN C-17 |
| ADDR-08 | Delivery and shop addresses SHOULD resolve to a zone, so that fees, minimums and windows can follow the zone (R-SQ F-02). | P | PLAN C-09; owner pricing policy |

### 4.2 Home and discovery (HOME)

| ID | Requirement | St |
|---|---|---|
| HOME-01 | Home MUST be map-first: a full-bleed map, a "Where to?" search, a service switcher (Ride · Send · Shop; only enabled lines), saved places and recents. | P |
| HOME-02 | An active order MUST show as a resumable card (CON-10). A ride takes the map; other orders are compact cards with status and ETA. | P |
| HOME-03 | Shop discovery MUST list nearby open merchants by category, with distance/zone, minimum order, delivery fee and an "open now / opens at" state (R-HA §5; D-HA §2). | N |
| HOME-04 | Place search MUST cover Palestinian places in Arabic and English from Wind's own index, with recents first (PLAN M-04). | E |
| HOME-05 | Road and checkpoint status MUST be reachable from home, and MUST affect ETA wording on affected routes (PLAN A-14). | P: Roads is reachable from Account, and road alerts appear in booking and on the order; there is no home entry |
| HOME-06 | The service switcher order and promo slots SHOULD be server-driven (ONE-14). | N |

### 4.3 Booking (BOOK) — shared workflow

| ID | Requirement | St |
|---|---|---|
| BOOK-01 | Booking MUST be the ONE-06 step workflow. Each step MUST state what is missing in words next to the control (`ui.tsx` button reason). | P |
| BOOK-02 | The price MUST be shown before confirm, itemised: base, distance/options, service fee as its own labelled line, promo, credit and total (R-HA §5; PLAN P-05). | P: shop service fee is N |
| BOOK-03 | "Cash only" and "the captain may not carry change" MUST be stated before confirm (PLAN C-22, WP-11). | P |
| BOOK-04 | A promo code MUST be applied at the payment step (R-HA §5) and MUST obey CON-06. | P: applied at payment (E); per-service scope (CON-06) is N: `promo_codes` has no service column |
| BOOK-05 | Scheduling MUST be available per service: ride later, parcel pickup time, shop delivery window. A scheduled job is hidden from captains until its release time (PLAN C-11). | P |
| BOOK-06 | Create MUST be idempotent with a client request id. A lost acknowledgement MUST recover the same order and never book twice (PLAN C-18, `booking-recovery`). | E |
| BOOK-07 | Edit before dispatch: note, recipient and drop-off note MAY change while `searching`; destination change after assignment needs captain consent (PLAN T-12/T-25). | P |
| BOOK-08 | Cancellation MUST be free before assignment. Ride and shipping orders can be cancelled until pickup; shop orders follow DLV-11. After pickup, cancellation MUST be refused with a reason. Fees stay out of scope while cash-only (PLAN T-10/T-11). | E (ride, parcel) |

### 4.4 Tracking, trust and after the order (TRK)

| ID | Requirement | St |
|---|---|---|
| TRK-01 | Live captain position MUST degrade honestly: last-fix time shown; "tracking paused" instead of a stale moving pin (R-SQ A10; KIMI-MAP §4). | E |
| TRK-02 | ETA MUST be a road-aware range with validity. Near the end it MUST use the ladder "less than 10/5/3 minutes" (R-HA §4; WP-11). | P |
| TRK-03 | Calling the captain and in-order chat with quick replies MUST be reachable from every live order (R-HA §4; PLAN T-07/T-08). Admin redaction is NTF-04. | E |
| TRK-04 | A share-tracking link with no login MUST exist for rides (trip share) and for recipients (parcel/shop) (PLAN T-06). | E |
| TRK-05 | Safety MUST have an emergency call plus a safety report on every live order; for rides it is on the trip screen at all times (UB-F F10; PLAN T-18). | E |
| TRK-06 | Rating MUST be per order (§2.2 CON-08); a customer rates the captain and, for shop orders, the merchant (R-HA). | P: merchant rating N |
| TRK-07 | Receipt MUST be itemised and the same format for all services; a cancelled order shows no charge (PLAN T-15). | P: one format for all services and cancelled orders show no charge (E); the itemised breakdown (base, options, service fee) is N |
| TRK-08 | Order history MUST list all services with a filter, and have separate empty states for current and past (R-HA §4). | P |
| TRK-09 | "Report a problem" MUST open a dispute within 7 days and can end in account credit (PLAN T-17). | E |
| TRK-10 | Order again / send another MUST copy the last order of the same service (PLAN C-14). | E (parcel) |
| TRK-11 | Lost item: a rider or sender MUST be able to report a lost item on a finished order; the captain is notified and support mediates. | N | UB-F F11 |
| TRK-12 | Phone masking (calls through a relay) MAY replace direct numbers once a telecom contract exists; until then a number is shown only during an active job (NFR-04). | N | gate: telecom contract |
| TRK-13 | A receipt that can serve as a tax invoice MUST follow the owner's accountant's requirements once a VAT position is decided. | N | gate: legal/tax |

---

## 5. Ride (RIDE) — Uber / Careem line

Gate **G-RIDE**: passenger-transport permission and insurance (`docs/SYSTEM.md` §7), the dispatch review, and the
PostgreSQL decision (ride lifecycle and dispatch are PostgreSQL-only today: `ride-lifecycle.ts:25`, `dispatch.ts:41`).

| ID | Requirement | St | Source |
|---|---|---|---|
| RIDE-01 | Pickup MUST be set by GPS or pin. Venue pickup points (access points) with a walking ETA SHOULD be offered where known. | P | KIMI-MAP §5; UB-F F3 |
| RIDE-02 | Ride options (economy, comfort, van/family) MUST each show seats, price and ETA range. Surge MUST NOT exist at launch (`docs/SYSTEM.md` §4). | E-off | D-UB §2; ride pricing `src/model.ts` (off in production) |
| RIDE-03 | Fare estimate MUST be upfront from the server tariff; the final fare MUST equal the estimate unless the route changes with the rider's consent. | E-off | KIMI-API; UB-F F4 |
| RIDE-04 | Dispatch MUST send timed offers to one captain or a small batch; the offer screen shows pickup distance, trip estimate, rider rating and a countdown. Declines are not penalised in the pilot. | E-off | R-HD §2.2; R-CA §10.4 |
| RIDE-05 | When no captain is found within the window, the rider MUST be offered retry, schedule or cancel, never left searching (`docs/SYSTEM.md` §3). | E-off | |
| RIDE-06 | Captain arrival MUST need a plausible fix within 300 m and 120 s. A 5-minute waiting grace MUST start at arrival, server-owned (`ride-lifecycle.ts`). | E-off | DEADLINE inventory |
| RIDE-07 | Boarding MUST be confirmed by a rider PIN entered by the captain; trip start is refused without it. | E-off | R-CA §10.3 |
| RIDE-08 | In-trip MUST show the route traveled/remaining, the car marker, the ETA pill, share trip and safety; changing destination needs captain consent. | P | KIMI-MAP §3–5; PLAN T-12 |
| RIDE-09 | No-show: after the grace ends, the captain MAY end as no-show with a reason. There is no fee while cash-only. | N | |
| RIDE-10 | Ride MUST obey CON-01 and CON-02. | P: CON-02 is enforced for captains by `canTake` (rides are exclusive); CON-01 (one active ride per customer) is N | |
| RIDE-11 | Women-preference and accessibility needs (wheelchair, service animal) SHOULD be bookable attributes, shown to the captain, once supply exists. | N | UB-F F10 |
| RIDE-12 | Scheduled rides MUST become an offer at T−N minutes, and the rider MUST be told if no captain accepted by T−M. | N | UB-F F13 |

---

## 6. Shipping (SHIP) — Shiply / Uber Connect line (parcel + freight)

Live today for parcels. Freight is gated by **G-FREIGHT** (vehicle supply, load policy).

| ID | Requirement | St | Source |
|---|---|---|---|
| SHIP-01 | The sender MUST enter recipient name and phone, item size option, a note, pickup and drop-off. Freight adds dimensions, weight, loading help and the vehicle match. | P: recipient name and phone are optional today; freight fields are E-off | D-SH §2; PRODUCT |
| SHIP-02 | Favourite recipients SHOULD be saved and picked in one tap. | N | R-SH F-01; PLAN C-13 |
| SHIP-03 | Same-day priority MUST be an attribute of the parcel, not an order type, and MUST be refused for a scheduled slot. | E | R-SH F-06; A12 |
| SHIP-04 | A pickup code shown only to the sender SHOULD confirm custody at pickup, with a 5-strike lockout like delivery. | N | PLAN T-19, WP-17 |
| SHIP-05 | The delivery code MUST be held by the recipient and needed to complete. It MUST lock out after 5 wrong tries, with an audited admin reset. The code MUST contain no personal data. | P: lockout, audited reset and a PII-free code exist; the code is shown to the sender, who passes it on (recipient delivery by message is SHIP-13) | R-SQ F-07 |
| SHIP-06 | A QR form of the delivery code MAY be offered beside the digits. | N | R-SQ F-07; PLAN T-21 |
| SHIP-07 | A failed delivery MUST use a typed reason (absent, refused, unreachable, wrong address, rescheduled, access blocked, damaged). Each reason maps to a suggested next action (reattempt or return). | E | R-SQ F-08; WP-09 |
| SHIP-08 | Attempts: a parcel SHOULD allow up to three attempts. The attempt step is tracked separately from status (R-SH F-02 three-axis model). | N | |
| SHIP-09 | Return to sender MUST be a tracked leg that needs the sender's return code. | E | PLAN T-23 |
| SHIP-10 | Custody chain: a per-parcel, append-only, human-readable event log (who held it, when) MUST be visible to sender and admin. | P: events stored; no customer view | R-SQ F-05 |
| SHIP-11 | Door cash: the captain MUST enter the amount collected. A difference needs a typed variance reason (A11). | E | R-SQ F-03; WP-01 |
| SHIP-12 | Goods COD (collect the item price for the sender and remit it later) MAY be enabled. It MUST keep goods money apart from fares and count it in the cash cap. | E-off: COD records and routes exist on PostgreSQL (`payments.ts`); no app UI; the cash cap does not count goods COD yet | R-SH F-03; WP-16; gate G-COD, ₪500 rule |
| SHIP-13 | The recipient MUST receive the tracking link and delivery code by message (WhatsApp/SMS) and MUST NOT need an account. | P: link shared by sender | PLAN C-12 |
| SHIP-14 | Delivery windows with a daily capacity cap per zone SHOULD be offered where scheduled delivery is enabled. | P | R-SQ F-02; PLAN C-10 |
| SHIP-15 | Handoff hints ("leave with neighbour", "call on arrival") MAY be chips on the order. | N | PLAN T-24 |
| SHIP-16 | Prohibited and regulated goods MUST be listed in the app; the sender confirms at booking; the captain MAY refuse at pickup with a typed reason, and the refusal is recorded (`docs/SYSTEM.md` §7). | N | |

---

## 7. Delivery (DLV) — HAAT / Souq line (shop orders)

New service key `shop`. Gate **G-SHOP**:
- The owner decision on a merchant segment (PLAN A-16). `docs/PRODUCT.md` §2 advised against a restaurant marketplace
  first, and this SRS follows the owner's 16 Nov request to include Delivery.
- Signed merchants in the launch towns.
- A food-handling and returns policy.

The design starts with **shops that prepare orders** (grocery, pharmacy-OTC, bakery, everyday goods). Restaurant
menus are a later variant of the same model.

| ID | Requirement | St | Source |
|---|---|---|---|
| DLV-01 | Merchant catalogue: categories, items with price (integer agorot), photo optional, availability toggle and "sold by weight" flag. | N | D-HA §2; R-HA §5 |
| DLV-02 | Cart MUST hold one merchant at a time. Switching merchant asks to clear the cart, with a confirm. | N | D-SQ §2; R-HA §5 |
| DLV-03 | Minimum order and delivery fee MUST be shown before checkout; the service fee is its own labelled line (BOOK-02). | N | R-HA §4–5 |
| DLV-04 | Weighted items: the cart shows an estimate labelled as an estimate. At handover the merchant records the actual weight and final line price. A final total above the customer's agreed limit MUST trigger consent (DLV-06). | N | D-HA §4; R-SQ F-09 |
| DLV-05 | Substitution policy MUST be chosen per order or item: "remove if out of stock", "ask me first", "similar item within limit". | N | R-SQ F-09; D-SQ §3 |
| DLV-06 | Consent-before-change: any change beyond the agreed limit MUST pause the order in `awaiting_approval` and notify the customer. Approve returns it to preparing; decline removes the line and recalculates. Falling below the minimum MUST cancel with a clear message. Waiting time MUST NOT count as preparation time. | N | R-SQ A9; D-SQ §3 |
| DLV-07 | The merchant MUST accept or reject within a set time. Rejection needs a reason ("closed", "out of stock", "too busy") shown to the customer in their language. | N | R-HA (المطعم رفض الطلبيه) |
| DLV-08 | The merchant MUST mark progress: accepted → preparing → ready. Each step is server-timestamped and drives ETA. | N | D-HA §3 |
| DLV-09 | Order states in Arabic and English MUST name the actor (for example "The shop is preparing your order", "The captain picked up your order from the shop"). | N | R-HA §4; ONE-04 |
| DLV-10 | Order snapshot: shop, items, prices and address MUST be frozen at placement; later edits do not rewrite history. | N | D-HA §3 |
| DLV-11 | Edit or cancel MUST be allowed until the merchant accepts. After that, cancel goes through support, and after pickup it is refused (R-HA "لا يمكن تغيير او الغاء الطلبية بعد ارسال الطلبية"). | N | |
| DLV-12 | Captain dispatch for a shop order MUST start so that arrival meets `ready` (prep ETA − captain ETA), not at placement. | N | |
| DLV-13 | At the shop the captain MUST confirm the order code with the merchant (handover); the merchant marks "handed over". | N | R-SQ F-04 |
| DLV-14 | Delivery completes with the customer delivery code (SHIP-05 mechanism, same lockout and reset). | N (reuse) | |
| DLV-15 | Cash at the door: goods total + delivery fee, collected by the captain (SHIP-11). Merchant settlement: Wind owes the merchant the goods total, minus commission, through a merchant ledger with append-only entries and a payout reference (ONE-10). | E-off: the `merchant_cod` tables and create/collect exist in `server/domain/payments.ts` (PostgreSQL only); the statement and payouts are N | R-SQ F-06; gates G-COD, G-PG, ₪500 rule |
| DLV-16 | Delivery windows: shops MAY offer windows with per-window capacity (SHIP-14 mechanism). | N | R-SQ F-02 |
| DLV-17 | The customer rates the merchant and the captain separately (CON-08). | N | |
| DLV-18 | Order again for shop orders MUST rebuild the cart from current prices and availability and show any changes before checkout. | N | R-SQ F-14 |
| DLV-19 | Merchants MUST NOT list prohibited or age-restricted goods. Regulated categories (OTC medicine, tobacco) need an owner policy, and age-restricted items need an ID check at the door before they are allowed. | N | gate G-SHOP |

### 7.1 Merchant mode (MER)

| ID | Requirement | St |
|---|---|---|
| MER-01 | The merchant MUST have an order inbox with a loud new-order alert (its own notification channel), accept/reject, a prep timer and "ready". | N |
| MER-02 | The merchant MUST be able to edit the catalogue, toggle availability, set open/closed and hours, and pause new orders. | N |
| MER-03 | The merchant MUST record actual weights and substitutions per line, which feed DLV-04/06. | N |
| MER-04 | The merchant MUST see a settlement statement (orders, goods total, commission, payouts) built from the merchant ledger. | N |
| MER-05 | Merchant mode MUST be a role mode inside the same app (and a web console), not a separate app, unless the owner chooses otherwise (R-PAL D2). | N |
| MER-06 | Partner API: an external shop system MAY create Delivery or Shipping orders with a key (PLAN A-15). | E (Souq parcels) |

---

## 8. Captain (DRV) — one mode for all lines

| ID | Requirement | St | Source |
|---|---|---|---|
| DRV-01 | Online/offline MUST be shift-scoped. Location is collected only while online or on a job, never always-on (R-PAL S9). Ride dispatch (RIDE-04) needs captain presence, which is PostgreSQL-only today (`presence.ts`). | P: job-scoped GPS; presence is PostgreSQL-only | PLAN D-05 |
| DRV-02 | One job board MUST show all eligible jobs, with a service badge (icon + word), pickup distance, payout, cash to collect and the customer rating. It is paged and filterable by service and by heading. | P | PLAN D-08 |
| DRV-03 | Ride offers MUST arrive as a full-screen timed offer on the `jobs` channel. Shipping and delivery MAY also be offered, or picked from the board. | E-off: timed offers are PostgreSQL-only (`dispatch.ts`); the `jobs` channel is N (one `default` channel today, WP-10) | R-HD §2.2 |
| DRV-04 | The run sheet MUST order pickups, drop-offs and returns by town for all carried non-ride jobs. | E | PLAN D-12 |
| DRV-05 | Navigation MUST hand off to an external maps app from every stop. | E | PLAN D-13 |
| DRV-06 | Every step advance MUST be an idempotent command with lost-acknowledgement replay. | E | PLAN D-14 |
| DRV-07 | Proof steps per service: ride PIN at boarding; parcel pickup code (SHIP-04) and delivery code; shop handover code and delivery code. | P | §5–7 |
| DRV-08 | The captain MUST NEVER see a customer's delivery code or other customers' data. | E | PLAN D-29 |
| DRV-09 | Door cash entry with variance reason (SHIP-11) MUST cover every service that collects cash. | E (parcel) | WP-01 |
| DRV-10 | Cash owed, handover, confirm/dispute MUST be append-only. A cash cap blocks new work; a warning MUST show at 80%. A held-cash age limit SHOULD exist (WP-12). | P | PLAN D-16..D-19 |
| DRV-11 | Earnings MUST show today/week/all plus a per-job statement (fare, discount, commission, net, cash status) for all services. | P | R-CA §10.1; WP-15 |
| DRV-12 | A delivery-location support card MUST show last accepted fix, server acknowledgement and registration state; it is collapsed by default. | E | UX-05 |
| DRV-13 | Release a job back before pickup MUST be allowed with a reason. | P: release exists (`POST /api/orders/:id/release`); no reason is captured | PLAN D-10 |
| DRV-14 | Deadline re-arm: protected recovery records MUST survive reboot and clock change (A14). | E (Android) | R-PAL A14 |
| DRV-15 | Acceptance-rate penalties and booked shifts MUST NOT exist in the pilot. | — | R-CA §10.4 |
| DRV-16 | The captain MUST have an emergency call and a safety report on every active job, including rides (a passenger issue), with the event trail preserved. | P: the customer side exists (TRK-05) | |

---

## 9. Map and location (MAP) — Kimi map spec

| ID | Requirement | St | Source |
|---|---|---|---|
| MAP-01 | One map component MUST be used: MapLibre/OSM baseline (no key) on web and Android, iOS renderer to be decided (`platformRenderers` lists Apple today), Google renderers only where licensed. The provider sits behind one interface so the tile host is configurable (R-CA §6). | P | KIMI-MAP; M-01 |
| MAP-02 | The camera MUST be driven by intents: `follow(target, zoom, offsetRatio)`, `fitBounds(bounds, padding)`, `free`. Fit padding MUST be derived from the measured sheet and header height and re-applied when the sheet snaps. | P | KIMI-MAP §1 |
| MAP-03 | Pins MUST be composed (anchor + callout + content row): circle 16 dp pickup, square 16 dp drop-off, 8 dp waypoints, a callout radius of 8 dp, and a touch area ≥ 44 dp. | P | KIMI-MAP §2 |
| MAP-04 | The ETA pill MUST have min height 36 dp, a 26 sp value and a stacked unit label in the `micro` style (11/15), and MUST be announced as text to screen readers (A11Y-15). | P | KIMI-MAP §2 |
| MAP-05 | The route line MUST be two-layer with round caps: a 5 dp fill over a 7 dp casing (fill + 2). It is split traveled/remaining at the captain's nearest vertex. The widths are Kimi's inferred recommendation, so tune them on the phone. | P | KIMI-MAP §3 |
| MAP-06 | The vehicle glide MUST last the fix period. A jump beyond the snap distance MUST snap, not glide. A fix past the stale limit MUST drop opacity to ~0.45 and stop gliding. Heading comes from the device, else the path bearing. | E | KIMI-MAP §4; `map-math.ts` |
| MAP-07 | Per-stage layer sets MUST drive the map from one state (pretrip / dispatch / in-progress / post): device location, pins, route, car, ETA, hints. | P | KIMI-MAP §5 |
| MAP-08 | Recenter and compass buttons MUST be 44 dp, sit 16 dp from the edges, and have accessible labels. The compass appears only when bearing ≠ 0. | P | KIMI-MAP §6 |
| MAP-09 | Shop orders MUST show the shop pin, the customer pin and the captain. Shop and customer coordinates MUST be independent (no zone-centroid shortcut presented as exact; an approximate pin says "approximate"). | N | D-HA §2, §5 |
| MAP-10 | Every map fact (where the captain is, ETA, route state) MUST also exist as text on the sheet (A11Y-15). | P | |
| MAP-11 | Routing MUST come from self-hosted OSRM with checkpoint-aware detours. Without it, show no invented route (the straight line × 1.3 is used for tariffs only). | E-off on new host | `docs/SYSTEM.md` §9 |

---

## 10. Payments, cash and money (PAY)

| ID | Requirement | St |
|---|---|---|
| PAY-01 | Money MUST be integer agorot end to end and display in ₪; amount fields MUST accept Latin and Arabic-Indic digits (`latinDigits`). | P: cash entries and door cash are integer cents; `orders.price`, `discount` and `commission` are stored as REAL shekels and need migrating |
| PAY-02 | Cash MUST be the default and stated before booking (BOOK-03). | E |
| PAY-03 | Account credit and promo codes MUST apply to all services, subject to CON-06. | P |
| PAY-04 | Cash entries MUST be append-only; corrections are new entries with a reason and an actor (R-SQ F-06). | E |
| PAY-05 | The ledger MUST keep three separate books: captain cash (fares and fees), goods COD (sender money, gated), and merchant settlement (shop goods, gated). They MUST NOT be netted silently against each other. | P |
| PAY-06 | Card/wallet MUST NOT be built until a PMA-licensed provider is contracted (G-PAY). When added, it plugs in behind ONE-08 and enables the >₪500 electronic rule. | N, gated |
| PAY-07 | Customer arrears MUST NOT exist while cash-only (no fees). If fees are ever introduced, the Careem arrears rule applies: an unpaid balance blocks the next cash booking and is shown before booking (R-CA §5). | — |
| PAY-08 | Tips MUST NOT be recorded in-app while cash-only (unrecorded money). | — |

---

## 11. Design requirements (DES)

Goal: the three lines look and behave as **one** app. Same tokens, same components, same patterns; a service is
recognised by its icon and name, not by a different look.

### 11.1 Foundations

| ID | Requirement | St |
|---|---|---|
| DES-01 | Tokens MUST come from `src/ui.tsx` `palette`. Identity: forest `#12342A` + lime `#D3F27A` (lime only on forest), paper `#F3F2EC`, card `#FFFFFF`, ink `#0E1F19`; text grey no lighter than `faint #66716B` (4.5:1); clay for markers only; `clayInk` for text on clay states. | E |
| DES-02 | Service accents (icon/badge only, never primary buttons): Ride = forest, Send = clay ink, Shop = blue `#2F5E8C`. Each badge MUST pair the colour with an icon and a word. | N |
| DES-03 | Type: Readex Pro for headings (bold/semibold), system font for body, in both scripts. Fixed type ramp: h1 21/30, h2 17/25, title, body 14/21, caption 12/17, micro 11/15, label (`textVariants`). | E |
| DES-04 | Spacing on a 4 dp grid (4/8/12/16/24/32); existing 3/6/13 px values migrate to it. Radius: 8 for chips/callouts, 12–16 for cards, pill for primary search. Soft shadows (`shadow`, `sheetShadow`) instead of hairlines. | P |
| DES-05 | Dark mode SHOULD be added with the same token names (dark values per token); the map gets a dark style. | N |
| DES-06 | Iconography: one icon set (Ionicons), one icon per concept across services (one "cash", one "parcel", one "shop", one "car" icon). | P |

### 11.2 Components and patterns

| ID | Requirement | St |
|---|---|---|
| DES-07 | The bottom sheet over the map MUST be the one pattern for booking, tracking and the captain job (`SceneMap`/`MapSheet`), with snap points and a grip. | E |
| DES-08 | Buttons: one primary action per screen. A disabled button MUST state why (`reason`). Destructive actions need a confirm. | E |
| DES-09 | One status component (badge + actor sentence + next step) MUST serve every service (ONE-04). | P |
| DES-10 | Empty, loading, offline, error and "not available in this stage" states MUST use shared components with their own copy. A blank screen is never allowed. | P |
| DES-11 | The receipt, rating, chat and dispute screens MUST be one implementation, parameterised by service. | P |
| DES-12 | Motion: short, purposeful transitions (sheet snap, pin drop, glide). Every animation MUST respect reduced motion: nothing moves, and the state still reads (`useReducedMotion`). | E |
| DES-13 | Copy rules: actor-named states; specific bilingual refusal sentences per error code (`errorText()`); the ETA ladder; cash wording; never copy competitor strings (R-PAL X9). | P |
| DES-14 | Screenshots of every screen in ar and en MUST be regenerated after UI changes (`npm run screens`), and new Ride and Shop screens added to the screen list in `scripts/screens.mjs`. | P: the screen list is in `scripts/screens.mjs`; Ride and freight screens are listed; Shop screens are N |

---

## 12. Accessibility requirements (A11Y)

Target: **WCAG 2.2 level AA** on Android (TalkBack), iOS (VoiceOver) and web, in Arabic and English.

| ID | Requirement | WCAG | St |
|---|---|---|---|
| A11Y-01 | Text contrast MUST be ≥ 4.5:1 (≥ 3:1 for large text and meaningful non-text UI); `faint #66716B` is the lightest text grey; lime only on forest. `dash` (1.7–2.1:1) is allowed only for decorative marks such as the sheet grip, whose drag action has a button alternative. | 1.4.3, 1.4.11 | E |
| A11Y-02 | Touch targets MUST be ≥ 44×44 dp (48 dp preferred on Android), including map pins and FABs (hitSlop allowed). This exceeds the AA minimum of 24 px. | 2.5.8 (exceeded) | P |
| A11Y-03 | Text MUST scale to 200% with no clipped or hidden control (`maxScale` 2.0 everywhere; `minHeight`, not fixed heights). | 1.4.4 | E (X-01), except fixed chrome capped at 1.3: tab labels, badges, route-preview map labels |
| A11Y-04 | Every interactive element MUST have a role and a label in the current language; headings use `header`; errors and status changes are announced (`alert` / live regions). | 4.1.2, 1.3.1, 4.1.3 | P |
| A11Y-05 | Focus order MUST follow reading order in both directions. In RTL the layout mirrors; directional icons flip; numbers and phone numbers stay LTR. | 1.3.2, 2.4.3 | P |
| A11Y-06 | Status MUST never be colour alone: service badges, order states and cash states always carry text and/or an icon. | 1.4.1 | P |
| A11Y-07 | Error text MUST sit next to its field, be announced, and say how to fix it. | 3.3.1, 3.3.3 | E |
| A11Y-08 | Timed actions (ride offers, waiting grace) MUST announce remaining time at intervals and MUST NOT auto-act without a warning. The offer timeout SHOULD be extendable in captain settings. | 2.2.1 | N |
| A11Y-09 | Reduced motion MUST be honoured everywhere (DES-12); auto-moving content (glide, carousels) can be paused or stops under reduced motion. | 2.2.2 (2.3.3 AAA, adopted voluntarily) | E |
| A11Y-10 | Language of content MUST be set (`lang` on web; RN `accessibilityLanguage` where supported) so screen readers switch voice. | 3.1.1 | P |
| A11Y-11 | Codes (delivery, pickup, PIN) MUST be readable digit by digit by screen readers and entered with large numeric keypads that accept Arabic-Indic digits. | 1.3.1, 3.3.2 | P |
| A11Y-12 | Notifications and in-app status updates MUST carry the full sentence (service + state + next step), not just an icon or a sound (CON-09). | 4.1.3, 1.3.1 | P |
| A11Y-13 | Haptics MAY confirm key actions but MUST NOT be the only signal. | 1.3.3 | — |
| A11Y-14 | Forms MUST keep entered data after an error or network failure (the booking-recovery draft), and MUST NOT ask again for an address or recipient already given in the same flow. | 3.3.1, 3.3.4, 3.3.7 | E |
| A11Y-15 | Map content MUST have a text equivalent on the sheet (captain distance, ETA range, last-fix age, route state). Markers expose labels. Pin placement has a non-gesture alternative (A11Y-16). | 1.1.1, 2.5.1 | P |
| A11Y-16 | Every drag/pinch interaction MUST have a single-pointer or text alternative: zoom buttons, typed coordinates/link/Plus Code, "use my location", search. | 2.5.7 | P: the booking pin has zoom buttons, typed coordinates/link/Plus Code, use-my-location and search (UX-03); tracking maps have recenter only |
| A11Y-17 | Accessible authentication: no cognitive test; password managers and paste allowed; OTP autofill supported. | 3.3.8 | P |
| A11Y-18 | Ride accessibility needs (RIDE-11) MUST be expressible at booking and visible to the captain. | — | N |
| A11Y-19 | A focused control MUST NOT be hidden under a bottom sheet, keyboard or sticky header; sheets move or scroll the focused item into view. | 2.4.11 | P |
| A11Y-20 | Help (support, FAQ, WhatsApp) MUST be in the same place on every screen (SUP-01). | 3.2.6 | P: help is on the account screens and every live order, not on every screen |
| A11Y-21 | Web content MUST reflow at 320 CSS px with no horizontal scroll; native screens MUST work at 360 dp width. | 1.4.10 | P |
| A11Y-22 | Increased line, letter and word spacing MUST NOT clip text (no fixed text boxes). | 1.4.12 | P |
| A11Y-23 | A control's accessible name MUST contain its visible label. | 2.5.3 | P |
| A11Y-24 | Screens MUST work in portrait and landscape unless the orientation is essential (the captain navigation hand-off). | 1.3.4 | P |

### 12.1 Accessibility checks (definition of done for every UI PR)

1. `npm run screens` at 360 px, font scale 100%, 130% and 200%, ar and en: no clipped button and no hidden primary action
   (the existing booking-narrow and driver-presence checks extend to Ride and Shop screens).
2. Automated: a test asserting every `Text`/`TextInput` uses `maxScale`. New lint or test rules MUST check that
   pressables have `accessibilityRole` + `accessibilityLabel` and that images/icons that act have labels.
3. Contrast: any new colour pair is checked against 4.5:1 or 3:1 before merge (a token test).
4. Physical A53 pass with TalkBack in Arabic and English through the PR's flow: every control is announced with a role
   and name, focus order is logical, timed screens announce time.
5. Reduced motion on: the PR's screens show no movement and the state still reads.
6. Keyboard (web): every action is reachable, focus is visible.

---

## 13. Notifications, chat and support (NTF/SUP)

| ID | Requirement | St |
|---|---|---|
| NTF-01 | Native push (FCM) MUST use per-event channels (`jobs`, `status`, `cash`, `attention`, `chat`, and `merchant_orders` for shops), with versioned channel ids. | P (WP-10) |
| NTF-02 | Web Push MUST serve the web/home-screen app. | E |
| NTF-03 | Push content MUST follow CON-09 and A11Y-12, and MUST contain no codes or personal data on the lock screen. | P |
| NTF-04 | Chat MUST be anchored to the order, with quick replies; admin MAY redact a message. | P |
| SUP-01 | Help, FAQ and WhatsApp support MUST be reachable from every screen's account area and from every live order. | E |
| SUP-02 | Disputes and incidents MUST share one admin queue covering all services. | P: disputes and safety incidents are separate admin tabs and endpoints; one queue is N |

---

## 14. Operations console (ADM)

| ID | Requirement | St |
|---|---|---|
| ADM-01 | Dashboard per service line: volume, active, stuck (searching too long, merchant not accepting, waiting grace exceeded), cash exposure and backup warning. | P |
| ADM-02 | Users: approve captains per service line and vehicle; approve merchants; block with reason; edit with compare-and-set (`expectedRole`). | P |
| ADM-03 | Dispatch: admin assign/reassign obeys `eligible()` (CON-04). | E (WP-02) |
| ADM-04 | Orders: cancel, resolve exception, proof reset (audited), decision card with suggested next step. | E |
| ADM-05 | Cash: three books (PAY-05), handover confirm/dispute, merchant payouts with reference. | P |
| ADM-06 | Settings: tariffs per service and vehicle, fees, minimums, zones, windows and capacity, cash cap and age limit, enabled services per town (ONE-14). Compare-and-set on save. | P |
| ADM-07 | Audit log viewer (read-only) over `security_events`. | N (WP-13) |
| ADM-08 | Fleet view: captains online, last fix (stale shown as stale), current job and service. | P (WP-18) |
| ADM-09 | Merchant management: catalogue moderation, hours, pause, settlement statements. | N |
| ADM-10 | Admin permissions MUST be split by duty: dispatcher (orders, assign), cashier (cash books, payouts), support (disputes, chat), super-admin (users, settings). Today there is one `admin` role. | N |
| ADM-11 | Abuse rules MUST exist: limits on promo use per person and device, flags for repeated cancellations, fake orders, and captain–merchant collusion (one captain repeatedly taking one shop's orders with cash mismatches), reviewed in the admin queue. | N |

---

## 15. Non-functional requirements (NFR)

| ID | Area | Requirement | St |
|---|---|---|---|
| NFR-01 | Performance | Proposed targets, to be confirmed by measurement on the A53: cold start to interactive home ≤ 4 s on 3G; booking steps respond ≤ 300 ms locally; the first map tiles render ≤ 3 s. | P |
| NFR-02 | Network | Every write is idempotent and recoverable. Shell, saved places and the active order are cached. A failed write keeps the user's input and shows a retry. Queued driver writes MAY be added (R-SQ A7). | P |
| NFR-03 | Battery and location | Location only while online or on a job. Cadence: 5 s moving with a good fix, else 15 s, 2 s floor. No always-on location. | E |
| NFR-04 | Privacy | No ad, attribution or engagement SDKs. `allowBackup=false`. Precise traces kept for a limited incident window. Recipient links show location only while the order is active and can be revoked by the sender (an expiry is N). A captain sees a customer's phone only during an active job. | E |
| NFR-05 | Security | HTTPS only. Server-side roles. Compare-and-set on admin edits. Rate limits on auth and codes. Proof lockouts. Audit events. No secrets in the app. Retired API hosts refused at build. | E |
| NFR-06 | Reliability | One SQLite instance with daily backups now. Before more than one API instance or the Ride/Delivery launch: a shared transactional store (the PostgreSQL decision), an off-host backup and a restore drill. | P (gate G-PG) |
| NFR-07 | Observability | Every order id traceable across API, dispatch, location, proof and cash. Alerts on stuck states and failed backups reach the owner (WP-08). | P |
| NFR-08 | Localisation | Arabic default, complete English. All copy in `src/copy.ts` with typed keys. Number, date and currency formats per language. | E |
| NFR-09 | Compatibility | Android: the versions Expo SDK 57 supports, up to Android 16, on ARM. iOS: the versions SDK 57 supports, once the iOS build is enabled. Web as a fallback for customers. | P |
| NFR-10 | Updates | A forced-upgrade floor by `CLIENT_BUILD`. Release builds keep the signing key (`5947bab0…`) across EAS accounts. | E |
| NFR-11 | Legal | Passenger, courier and merchant licensing, insurance, privacy and terms reviewed per service line before launch (`docs/SYSTEM.md` §7). | gated |

---

## 16. Owner gates and decisions

| Gate | Blocks | What is needed |
|---|---|---|
| G-RIDE | §5 | Passenger-transport permission, insurance, captain supply, dispatch review |
| G-FREIGHT | Freight in §6 | Vehicle supply, load and damage policy |
| G-SHOP | §7, MER | Merchant segment decision, signed merchants, product and returns policy |
| G-PG | NFR-06, ride lifecycle, dispatch, presence, ledger, COD | SQLite → PostgreSQL decision and migration |
| G-PAY | PAY-06, the >₪500 rule | PMA-licensed provider contract |
| G-COD | SHIP-12, DLV-15 | Goods-COD yes/no and remittance policy |
| G-SMS / G-EMAIL | ACC-02/03 | SMS provider and sender id; email sending domain |
| G-STORAGE | ADDR-05, ACC-05, proof photos | Object storage with scanning and retention |
| G-PUSH | NTF-01 closed-app | Firebase `google-services.json` and FCM key on the new EAS project; server Firebase key |

---

## 17. Release plan (phased, one app throughout)

| Phase | Scope | Exit gate |
|---|---|---|
| **1 — Shipping, hardened** (now) | ONE-01, 02, 04..07, 13; SHIP complete except gated items; ADDR-03/04; TRK-02; DRV-10/11; NTF-01; A11Y checks on all existing screens | Pilot of 50 users runs 2 weeks with no lost order and no cash mismatch; A11Y §12.1 passes on the A53 |
| **2 — One-app shell** | ONE-03 spine and state mapping (§2.1), service switcher, shared status/receipt/rating/chat components (DES-09..11), extend the existing eligibility path (`canTake` + `driver-refusal.ts`) with service-line approval and cash age (CON-04), notification channels | Parcel unchanged for users; Ride and Shop hidden (ONE-13); screens regenerated |
| **3 — Ride** | §5 after G-RIDE and G-PG | Field test per town pair; boarding PIN and waiting grace on real phones; CON-01/02 enforced |
| **4 — Delivery** | §7, MER after G-SHOP, plus G-COD and G-PG for merchant settlement | 3–5 merchants in one town; substitution consent and weighted totals verified; merchant ledger balances daily |
| **5 — Scale** | Cards (G-PAY), photos (G-STORAGE), windows and zones, dark mode | Per-service SLOs and unit economics reviewed |

---

## 18. Acceptance outline (per service line)

Each line is accepted on the physical A53 and in the test PC gate (`npm test` with PostgreSQL), in Arabic and English:

- **Shipping:** book → captain accepts → pickup (code) → in transit → wrong delivery code ×5 locks → admin reset → correct
  code completes → door cash with variance → handover confirmed → receipt. Failure path: on hold (each reason) → return
  with sender code.
- **Ride:** request → offer timeout to a second captain → accept → arrival check → waiting grace → PIN boarding → trip →
  change destination with consent → end → rating → receipt. No-show path. CON-01/02 refusals.
- **Delivery:** browse → cart (minimum) → place → merchant accepts → substitution asks → approve/decline → weighted final
  → ready → captain handover code → delivery code → cash → merchant settlement entry. Merchant reject path. Cancel windows.
- **Cross-service:**
  - A captain with two parcels cannot take a ride.
  - The cash cap counts parcel and shop cash together.
  - A promo for shipping is refused on a ride.
  - Three active orders show three distinguishable notifications.
  - A disabled line is invisible.

---

## 19. Traceability summary

These counts come from the `St` column of every requirement row above (215 requirements). "No build" covers rows
marked "—" or "gated": rules that forbid a feature, or items that wait on an outside dependency. Every E and E-off row
was checked against the code at `1c3100a` (16 Nov audit).

| Area | Total | Exists (E) | Exists, off (E-off) | Partial (P) | New (N) | No build |
|---|---|---|---|---|---|---|
| ONE one-app rules | 14 | 3 | 0 | 11 | 0 | 0 |
| ACC account | 12 | 5 | 2 | 3 | 2 | 0 |
| ADDR addresses | 8 | 3 | 0 | 3 | 2 | 0 |
| HOME home | 6 | 1 | 0 | 3 | 2 | 0 |
| BOOK booking | 8 | 2 | 0 | 6 | 0 | 0 |
| TRK tracking and after | 13 | 6 | 0 | 4 | 3 | 0 |
| RIDE | 12 | 0 | 6 | 3 | 3 | 0 |
| SHIP shipping | 16 | 4 | 1 | 5 | 6 | 0 |
| DLV delivery | 19 | 0 | 1 | 0 | 18 | 0 |
| MER merchant | 6 | 1 | 0 | 0 | 5 | 0 |
| DRV captain | 16 | 7 | 1 | 7 | 0 | 1 |
| MAP | 11 | 1 | 1 | 8 | 1 | 0 |
| PAY | 8 | 2 | 0 | 3 | 1 | 2 |
| DES design | 14 | 5 | 0 | 7 | 2 | 0 |
| A11Y accessibility | 24 | 5 | 0 | 16 | 2 | 1 |
| NTF notifications | 4 | 1 | 0 | 3 | 0 | 0 |
| SUP support | 2 | 1 | 0 | 1 | 0 | 0 |
| ADM operations | 11 | 2 | 0 | 5 | 4 | 0 |
| NFR | 11 | 5 | 0 | 5 | 0 | 1 |
| **Total** | **215** | **54** | **12** | **93** | **51** | **5** |

Delivery and merchant (23 new) is the largest block of new work. Ride exists mostly in code but is off
(6 E-off) behind G-RIDE and G-PG. Shipping is mostly built: what remains is the one-app shell (ONE, mostly
partial) and hardening.
