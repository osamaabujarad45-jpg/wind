# Wind — Software Requirements Specification: one app for rides, shipping and delivery

**Version 1.0 · 16 November 2026 · Status: draft for owner review.**
**Baseline:** commit `fb05483` (later master commits change docs only); production `https://4.223.118.16.sslip.io` (parcel only, cash only, SQLite).
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
  - **E** = exists in code and live in production (the row's behaviour works there).
  - **E-off** = exists in code but disabled in production. The cause is a disabled service, PostgreSQL-only code, or a
    missing provider.
  - **P** = partial; the gap is named in the row. A row marked just "P" has an unconfirmed gap that needs a short
    gap analysis before implementation.
  - **N** = new.
  - A row whose code is **service-specific** and names several services is **P** if at least one named service is
    live and another is E-off or N; it is E-off or N only when no named service is live. A row about
    **service-agnostic** order code (it works for any order, such as calling the captain or a dispute) is E when
    that code is live. "Live" means the row's own behaviour works in production for that service, not merely that
    the service is enabled. Between E-off and N: E-off when the code exists but is switched off, N when it does not
    exist. A row whose code exists but is switched off is E-off even if part of it is still N; the N part is named in
    the St text.
- External sources (the Kimi spec, the reference-app studies, the demo apps) are **outside this repository**. They are
  in the main checkout `research_notes/`, its `docs/BUILD-SPEC-…`, and `Documents/wind-competitors/`. IDs taken from
  them always carry their source key, for example `R-SQ A10`, `R-PAL A14`, `PLAN A-14`.
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
| **SCOPE** | `docs/REA/2026-11-15-SCOPE-AUDIT.md` (PR #63) | Switched-off capabilities read as "not available in this stage" |
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
- **Money:** cash first, including goods money collected at the door (decision D-1, §16a). Cards and wallets need a PMA-licensed provider (gate **G-PAY**). An announcement by the Ministry of Telecommunications and Digital Economy (MTDE, 2025) is
  read as requiring electronic payment for courier payments over ₪500; this is **unconfirmed**. `docs/SYSTEM.md` §7
  (item 3) asks counsel to confirm it (gate **G-LEGAL**). Item-sale proceeds are decided for the shop and goods-COD pilot (D-1), superseding
  `docs/SYSTEM.md` §10's exclusion; the MTDE reading, the tax invoice and licensing stay open under G-LEGAL. Once built, ADM-12 MUST apply a per-order cash ceiling to
  every cash-collecting order, defaulting to ₪500 (D-1). Money MUST be integer agorot (PAY-01).
- **Network and devices:** budget Android phones on 3G or 2G. Arabic first, with full English.
- **Supply:** a service line is visible only where verified captains, and for Delivery verified merchants, exist (SCOPE).

### 1.3 Roles

| Role | Description | Account |
|---|---|---|
| Customer | Books rides, sends items and orders goods. One account covers all three. | Phone + password; email optional |
| Recipient | Receives a parcel or delivery for someone else | No account. Gets a tracking link and the delivery code by message |
| Captain (driver) | Carries out jobs on approved vehicles and approved service lines | Driver account, approved by an admin |
| Merchant (new) | Shop that receives Delivery orders, prepares them and hands them over | Merchant account, approved by an admin. Uses the merchant mode of the same app or the web console |
| Admin (duties: `dispatcher`, `finance`, `safety`, `driver_reviewer`, `support`, `platform_admin`; ADM-10) | Approves people, dispatches, settles cash, resolves exceptions | Created by operator enrollment only (no self sign-up) |

---

## 2. One-app architecture rules (the "no conflict" guarantee)

These rules make the three service lines one product, not three apps in one install. They apply to every later
section.

| ID | Requirement | St |
|---|---|---|
| ONE-01 | There MUST be one account, one session and one profile per person. Role is derived from the server session, never from a client toggle (PLAN S-13). | E |
| ONE-02 | There MUST be one `orders` record type with a `service` field. Each service line adds its own child record (ride: seats, boarding PIN, waiting timer; shipping: package, recipient, proof, return, COD; delivery: merchant, basket lines, substitution policy). History, receipts, ratings, disputes, chat, push and admin tools work on `orders` and so cover all services without copies. | P: `orders` has `service`; the shop child record is N |
| ONE-03 | All services MUST share one state-machine spine using the code's names (`OrderStatus`, `src/model.ts`): `searching → assigned → at_pickup → in_transit → completed`, with the side and terminal states `cancelled`, `on_hold`, `returning`, `returned`. Merchant rejection and ride no-show are `cancelled` with a typed reason. A dispute is a flag on the order (`order_disputes`), not a state. A failed shop delivery is `on_hold` then admin review. `requested` (shop orders before dispatch starts), the shop `merchant_state` axis (a separate field, §2.1) and the ride sub-step `boarded` are new. DLV-04, DLV-06 and MER-03 gate on `merchant_state`, not on the spine. A service adds only the sub-steps it needs (§2.1). A screen MUST NOT invent a service-specific top-level state. | P: `requested`, `boarded` and the shop sub-steps are N |
| ONE-04 | One status vocabulary in Arabic and English, naming the actor and the next step (R-HA §4), MUST be shared by every service: the same words for the same spine state. Service wording is allowed only in the sub-step line. | P: shared ladder exists for parcels; ride and shop sub-step wording is N |
| ONE-05 | One home MUST serve all services: a map-first home with a service switcher (Ride · Send · Shop), plus one "where to" entry, saved places, recents and an active-order card (§4.2). | P: parcel only |
| ONE-06 | One booking engine MUST cover all services, built as a step workflow (R-CA §3): place → service details → option/price → payment → confirm. Each step is a named, testable state, so a failed step is retried on its own. Service lines plug in steps and do not fork the flow. | P: booking is one component tree (`src/app/book.tsx`), not named step states |
| ONE-07 | One quote model MUST serve all services: server-priced, versioned tariff, expiry, usable once, idempotent create (PLAN C-18). | P: server price check and idempotent create are live; versioned quote records (`server/domain/quotes.ts`) are PostgreSQL-only |
| ONE-08 | One payment model MUST serve all services: cash (plus account credit and promo) now, a licensed PSP later behind one provider interface (`PaymentsProvider`, `server/domain/payments.ts`) (gate G-PAY). | P: cash, credit codes and promo are live; the `PaymentsProvider` interface and routes exist, but no live provider is wired (test fake only) and the Payments service's SQL runs only on PostgreSQL |
| ONE-09 | One captain mode MUST serve all services: one job board and one offer channel, with each job showing a service badge (icon + word, never colour alone). Concurrency rules come from §2.2 and are enforced on the server. | P |
| ONE-10 | One cash ledger and one cash cap per captain MUST count every service's cash: fares, delivery fees, shop goods cash at the door and, when enabled, goods COD (PLAN D-16/D-17, WP-16). | P: goods COD is E-off |
| ONE-11 | One notification system MUST serve all services, with one channel per event class (`jobs`, `status`, `cash`, `attention`, `chat`, and `merchant_orders` for merchants) shared across services, not per service (PLAN N-03, WP-10). | P |
| ONE-12 | One design system MUST serve all services: shared tokens and components (§11). A service line MAY have one identity accent, used only on its icon and badge, never on primary actions. | P |
| ONE-13 | A disabled service **line** (ride, shipping, shop) MUST be invisible: it must not appear as a broken tile. A switched-off **capability** inside an enabled line (for example freight within shipping, or a PostgreSQL-only feature) MUST read "not available in this stage", never as a fault (SCOPE, PR #63). | E |
| ONE-14 | The service catalogue (enabled lines, their order on home, town pairs) MUST be server-driven, so an operator can enable a line or a town without a store release (R-CA §8.5 key registry, R-HA §6). | P: `WIND_ENABLED_SERVICES` env; no per-town table |

### 2.1 State mapping per service line

| Spine state | Ride | Shipping (parcel/freight) | Delivery (shop) |
|---|---|---|---|
| `requested` (new) | — | — | order placed, dispatch not started (the merchant may already be preparing) |
| merchant axis (separate field) | — | — | `merchant_state`: `accepted` → `preparing` ⇄ `awaiting_approval` (DLV-06) → `ready` → `handed_over`, plus `ready` → `preparing` when a handover exception reopens the order (DLV-13). It runs alongside the spine: the order moves `requested` → `searching` (DLV-12) → `assigned` → `at_pickup` while `merchant_state` is still `preparing`, so an early captain waits (DLV-13) |
| `searching` | finding a captain | finding a captain | finding a captain (starts when `ready` is near; see DLV-12) |
| `assigned` | captain on the way | captain on the way to pickup | captain on the way to shop |
| `at_pickup` | captain arrived; waiting timer runs | captain at sender; pickup code check | captain at shop; handover from merchant |
| `in_transit` | `boarded` sub-step (PIN checked), then on trip | in transit | on the way |
| `completed` | trip ended at drop-off | delivery code accepted | delivery code accepted |
| side states | `cancelled` (reason: rider cancel, no-show, admin/support cancel); rides never enter `on_hold` or `returning`: support holds and custody recovery MUST refuse a ride; a courier block re-queues a ride still `assigned` or `at_pickup` (as a release would) and ends one `in_transit` as an admin/support cancel, where the rider pays nothing and the blocked captain is paid the trip so far only if the block review clears them (today the hold, recovery and block paths can move a ride in `in_transit` to `on_hold` or `returning`; custody recovery runs on PostgreSQL only) | `cancelled` before pickup only, with the app's pickup reasons (`absent`, `refused`, `unreachable`, `wrong_address`, `rescheduled`, `access_blocked`, `damaged`, shown as the `pickup_*` labels) plus `sender_cancel`, `captain_refused_pickup` (the captain refuses under SHIP-16 or SHIP-17, with the sub-reason prohibited goods or damaged parcel), and `operational` (safety incident, legal or regulatory hold, platform outage); after pickup a hold is `on_hold` with admin review, never a cancel; `on_hold` (typed reason) → `in_transit` (reattempt) or → `returning` → `returned` | `cancelled` with one typed reason: `customer_before_accept`, `customer_via_support_accepted`, `accept_expired`, `below_minimum` (server-set only), `no_captain`, `operational` (safety incident, legal or regulatory hold, platform outage), and the merchant-caused set `merchant_rejected`, `merchant_closed`, `out_of_stock`, `merchant_request`, `handover_exception_unresolved` (DLV-23 money follows the reason); `on_hold` → admin review → reattempt (`in_transit`, `rescheduled` only, DLV-20) or return leg (DLV-21); a stop after `handed_over`, including while still `at_pickup`, is `on_hold` (`operational` or a DLV-20 reason), never `cancelled`. A shop captain never cancels: a captain exception at `at_pickup` before `handed_over` is a DLV-13 handover exception (it reopens `preparing`), and only an admin cancels (DLV-13, DLV-23); the server's driver `at_pickup` exception path, which cancels, MUST refuse shop orders (the parcel pre-pickup cancel is unchanged) |

### 2.1a Codes and handover vocabulary

"Handover" means three different things in Wind. Each has its own term and code:

| Term | What it is | Who sees it | Secret? |
|---|---|---|---|
| Order number | `orderCode(id)`, for example `W-00042` | everyone on the order, support | No: never used as a proof |
| Merchant pickup code (new) | proves the captain collected the shop order | merchant (shows it) and captain (enters it); never the customer | Yes, lockout as SHIP-05 |
| Pickup code (parcel, SHIP-04) | proves the captain collected the parcel | sender | Yes |
| Delivery code (`handover_code`) | proves the item reached the recipient | order owner (sender or buyer), passed to the recipient | Yes, lockout and audited reset |
| Return code (`return_code`) | proves the item came back to the sender, or the goods to the shop | sender, or merchant for goods (DLV-21) | Yes |
| Cash handover | the captain hands cash to the office (DRV-10) | captain, `finance` | Not a code |

### 2.2 Cross-service conflict rules

| ID | Rule | Why |
|---|---|---|
| CON-01 | A customer MUST have at most one active **ride**. They MAY hold several shipping and delivery orders at once. | A person is in one car at a time; items are not |
| CON-02 | A captain on an active ride MUST NOT receive or accept any other job until the ride ends, and a captain carrying jobs MUST NOT accept a ride (`canTake` enforces both directions). Pooling stays out of scope (`docs/SYSTEM.md` §10). | Passenger safety and attention |
| CON-03 | A captain MAY carry several parcels together, up to the vehicle's load limit (kg and volume per vehicle class, ADM-06). The run sheet orders pickups, drop-offs and returns (PLAN D-11/D-12). Today `canTake` (`src/model.ts`) stacks parcels only with parcels, under a flat count `PARCEL_LOAD = 200`. Shop orders start one per trip (DLV-24); stacking them is a later phase. | Courier efficiency |
| CON-04 | Job eligibility MUST be one server path: approved for the service line, vehicle class fits (§2.3), documents valid (ACC-05), not blocked, under the cash cap, not on a ride, under the load limit, not held-cash-overdue (WP-12). Today there are **two implementations**: production (SQLite) uses `canTake` plus `server/domain/driver-refusal.ts` (accept and admin-assign); `server/domain/eligibility.ts` (document expiry, measured capability) runs only on PostgreSQL. They MUST converge into one path that board, offer, accept and admin-assign all call. | No path bypasses a rule |
| CON-05 | Cash exposure MUST be summed across all services before any accept (ONE-10). | One driver, one wallet |
| CON-06 | A promo code MUST declare which service lines it applies to. Applying it elsewhere returns a specific refusal (R-CA `PROMO_CODE_INVALID_SERVICE_TYPE`). | No silent misuse |
| CON-07 | A subscription plan (Plus/Pro) MUST state which services its benefits cover. | Clear value |
| CON-08 | Ratings MUST be per order and per role: customer→captain, captain→customer, customer→merchant and merchant→customer (with a report option). A rating MUST NOT carry over between service lines unless the owner decides it should. | Fairness |
| CON-09 | Notifications MUST name the order and service ("Your parcel to Nablus…"). A customer with three active orders MUST be able to tell them apart from the notification alone. | Many active orders |
| CON-10 | The active-order card on home MUST show one card per active order, ride first, then most recent. A ride takes the map; other orders show as compact cards. | One map, many orders |

### 2.3 Vehicle × service eligibility

Ride, parcel and freight follow `vehicleServices` in `src/model.ts` today. The shop column is new and proposed;
"same town" means within one town's service area.
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
| ACC-05 | Captain documents (licence, insurance, ID) MUST be uploaded with an expiry date. An expired document MUST block the affected service line. | P: licence/registration expiry checks exist only on PostgreSQL (`eligibility.ts`); production checks none; upload needs G-STORAGE | G-STORAGE |
| ACC-06 | A merchant application MUST collect shop name, location pin, opening hours, category and contact, and MUST wait for admin approval. | N | §7 |
| ACC-07 | A blocked or role-changed person MUST be told why and whom to contact, by push and at sign-in. | P | PLAN D-02, WP-03 |
| ACC-08 | Account deletion MUST be available in the app and on a public page. | E | PLAN S-04 |
| ACC-09 | The language switch (ar/en) MUST apply immediately and mirror the layout. Today mirroring is done in code (`rtl` flags), not by `I18nManager`; see A11Y-25. | E | |
| ACC-10 | Captains MUST be able to set a "heading to" destination preference. | E | PLAN D-23 |
| ACC-11 | Plus (customer) and Pro (captain) subscriptions MUST state the services their benefits cover (CON-07); activation is manual by an admin while cash-only. | P: Plus and Pro exist with manual activation; benefits are not labelled per service line | PLAN A-13 |
| ACC-12 | A referral code MUST credit the referrer after the referee's first completed order in any service line. | P: credited on the referee's first completed order; rides are E-off, so their referrals are too | PLAN C-20 |

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
| BOOK-01 | Booking MUST be the ONE-06 step workflow. Each step MUST state what is missing in words next to the control (`ui.tsx` button reason). | P: button reasons exist; steps are not named, separately retryable states |
| BOOK-02 | The price MUST be shown before confirm, itemised: base, distance/options, service fee as its own labelled line, promo, credit and total (R-HA §5; PLAN P-05). | P: shop service fee is N |
| BOOK-03 | "Cash only" and "the captain may not carry change" MUST be stated before confirm (PLAN C-22, WP-11). | P: "cash" is stated (`youPayCash`); the no-change reminder is N (WP-11) |
| BOOK-04 | A promo code MUST be applied at the payment step (R-HA §5) and MUST obey CON-06. | P: applied at payment (E); per-service scope (CON-06) is N: `promo_codes` has no service column |
| BOOK-05 | Scheduling MUST be available per service: ride later, parcel pickup time, shop delivery window. A scheduled job is hidden from captains until its release time (PLAN C-11). | P |
| BOOK-06 | Create MUST be idempotent with a client request id. A lost acknowledgement MUST recover the same order and never book twice (PLAN C-18, `booking-recovery`). | E |
| BOOK-07 | Edits after placing MUST follow §4.3a, which is the single source per service and state (for example a shop destination cannot change after the merchant accepts). Destination change after assignment needs captain consent where the table allows it (PLAN T-12/T-25). | P |
| BOOK-08 | Cancellation by the customer MUST be free while cash-only (no fees, PLAN T-10/T-11). Ride and shipping orders can be cancelled until pickup; shop orders until the merchant starts preparing (§4.3a, DLV-11, D-2). After that point a customer cancel MUST be refused with a reason, except the automatic `below_minimum` cancel (DLV-06, D-2(e)). Operators cancel shop orders under DLV-23. | P: ride cancellation is E-off; shop cancellation (DLV-11) is N |

### 4.3a What may change after placing (one table for all services)

| Service, state | Note / recipient / drop-off note | Destination | Items | Cancel |
|---|---|---|---|---|
| Ride, `searching` | yes | yes | — | yes, free |
| Ride, `assigned`/`at_pickup` | note only | with captain consent (PLAN T-12) | — | yes, free |
| Ride, `in_transit` | — | with captain consent | — | no |
| Shipping, `searching` | yes | yes | — | yes, free |
| Shipping, `assigned`/`at_pickup` | note only | with captain consent | — | yes, free |
| Shipping, `in_transit` and later | — | with captain consent | — | no |
| Shop, before the merchant accepts | yes | yes | yes (new snapshot) | yes, free |
| Shop, `merchant_state` `accepted` | note only | no | none (preparation has not started) | through support, free (DLV-11, DLV-23) |
| Shop, `merchant_state` `preparing`/`awaiting_approval` | note only | no | customer: approve or decline only (DLV-06); merchant: changes recorded while `preparing` (DLV-04, MER-03), each evaluated by DLV-06 | no, with the reason shown (D-2) |
| Shop, `merchant_state` `ready` | note only | no | none (items are final) | no, with the reason shown (D-2) |
| Shop, `merchant_state` `handed_over` and later | — | no | — | no |

In the shop rows the Cancel column covers customer-initiated cancels; the automatic `below_minimum` cancel after a merchant change, decline or consent timeout (DLV-06) still applies, as in the WindMarket demo (D-SQ §3). The column binds the customer, and operators (admin, support) cancel under DLV-23; for rides and shipping operators follow the same Cancel column. Shop rows key on `merchant_state` (§2.1), not on the spine: an order can still be `requested` or `assigned` while the
merchant is preparing. DLV-10's snapshot is taken again at `ready` and whenever items change: before acceptance, on a DLV-06 consent, or at the merchant's
final weights and substitutions (DLV-04, MER-03). BOOK-07 and DLV-11 follow this table.

### 4.4 Tracking, trust and after the order (TRK)

| ID | Requirement | St |
|---|---|---|
| TRK-01 | Live captain position MUST degrade honestly: last-fix time shown; "tracking paused" instead of a stale moving pin (R-SQ A10; KIMI-MAP §4). | E |
| TRK-02 | ETA MUST be a road-aware range with validity. Near the end it MUST use the ladder "less than 10/5/3 minutes" (R-HA §4; WP-11). | P |
| TRK-03 | Calling the captain and in-order chat with quick replies MUST be reachable from every live order (R-HA §4; PLAN T-07/T-08). Admin redaction is NTF-04. | E |
| TRK-04 | A share-tracking link with no login MUST exist for rides (trip share) and for recipients (parcel/shop) (PLAN T-06). | P: parcel recipients and trip share exist; shop links are N |
| TRK-05 | Safety MUST have an emergency call plus a safety report on every live order; for rides it is on the trip screen at all times (UB-F F10; PLAN T-18). | P: the order screen has the emergency numbers and safety report (`src/app/order/[id].tsx`); rides are E-off, shop is N; the recipient tracking page has no safety block |
| TRK-06 | Rating MUST be per order (§2.2 CON-08); a customer rates the captain and, for shop orders, the merchant (R-HA). | P: merchant rating N |
| TRK-07 | Receipt MUST be itemised and the same format for all services; a cancelled order shows no charge (PLAN T-15). | P: one format for all services and cancelled orders show no charge (E); the itemised breakdown (base, options, service fee) is N |
| TRK-08 | Order history MUST list all services with a filter, and have separate empty states for current and past (R-HA §4). | P |
| TRK-09 | "Report a problem" MUST open a dispute within 7 days and can end in account credit (PLAN T-17). | E |
| TRK-10 | Order again / send another MUST copy the last order of the same service (PLAN C-14). | E |
| TRK-11 | Lost item: a rider or sender MUST be able to report a lost item on a finished order; the captain is notified and support mediates. (UB-F F11) | N |
| TRK-12 | Phone masking (calls through a relay) MAY replace direct numbers once a telecom contract exists; until then a number is shown only during an active job (NFR-04). (gate G-TELECOM) | N |
| TRK-13 | A receipt that can serve as a tax invoice MUST follow the owner's accountant's requirements once a VAT position is decided. (gate G-LEGAL) | N |

---

## 5. Ride (RIDE) — Uber / Careem line

Gate **G-RIDE**: passenger-transport permission and insurance (`docs/SYSTEM.md` §7), the dispatch review, and the
PostgreSQL decision (ride lifecycle and dispatch are PostgreSQL-only today: `ride-lifecycle.ts:25`, `dispatch.ts:41`).

| ID | Requirement | St | Source |
|---|---|---|---|
| RIDE-01 | Pickup MUST be set by GPS or pin. Venue pickup points (access points) with a walking ETA SHOULD be offered where known. | P | KIMI-MAP §5; UB-F F3 |
| RIDE-02 | Ride options MUST each show seats (1–4 today, `optionsFor`), price and ETA range; comfort or family tiers are N. Surge MUST NOT exist at launch (`docs/SYSTEM.md` §4). | E-off: seat options and pricing exist (off); comfort/family tiers are N | D-UB §2; ride pricing `src/model.ts` (off in production) |
| RIDE-03 | Fare estimate MUST be upfront from the server tariff; the final fare MUST equal the estimate unless the route changes with the rider's consent. | E-off | KIMI-API; UB-F F4 |
| RIDE-04 | Dispatch MUST send timed offers to one captain or a small batch; the offer screen shows pickup distance, trip estimate, rider rating and a countdown. Declines are not penalised in the pilot. | E-off | R-HD §2.2; R-CA §10.4 |
| RIDE-05 | When no captain is found within the window, the rider MUST be offered retry, schedule or cancel, never left searching (`docs/SYSTEM.md` §3). | E-off | |
| RIDE-06 | Captain arrival MUST need a plausible fix within 300 m and 120 s. A 5-minute waiting grace MUST start at arrival, server-owned (`ride-lifecycle.ts`). | E-off | DEADLINE inventory |
| RIDE-07 | Boarding MUST be confirmed by a rider PIN entered by the captain; trip start is refused without it. | E-off | R-CA §10.3 |
| RIDE-08 | In-trip MUST show the route traveled/remaining, the car marker, the ETA pill, share trip and safety; changing destination needs captain consent. | P | KIMI-MAP §3–5; PLAN T-12 |
| RIDE-09 | No-show: after the grace ends, the captain MAY end as no-show with a reason. There is no fee while cash-only. | N | |
| RIDE-10 | Ride MUST obey CON-01 and CON-02. | P: CON-02 is enforced for captains by `canTake` (rides are exclusive); CON-01 (one active ride per customer) is N | |
| RIDE-11 | Women-preference and accessibility needs (wheelchair, service animal) SHOULD be bookable attributes, shown to the captain, once supply exists. | N | UB-F F10 |
| RIDE-12 | Scheduled rides MUST become an offer at T−N minutes, and the rider MUST be told if no captain accepted by T−M. | P: scheduled orders are released 30 minutes ahead (`server/main.ts`); the late-acceptance notice to the rider is N | UB-F F13 |

---

## 6. Shipping (SHIP) — Shiply / Uber Connect line (parcel + freight)

Live today for parcels. Freight is gated by **G-FREIGHT** (vehicle supply, load policy).

| ID | Requirement | St | Source |
|---|---|---|---|
| SHIP-01 | The sender MUST enter recipient name and phone, item size option, a note, pickup and drop-off; a goods-COD sender MUST also describe the contents. Freight adds dimensions, weight, loading help and the vehicle match. | P: recipient name and phone are optional today; freight fields are E-off | D-SH §2; PRODUCT |
| SHIP-02 | Favourite recipients SHOULD be saved and picked in one tap. | N | R-SH F-01; PLAN C-13 |
| SHIP-03 | Same-day priority MUST be an attribute of the parcel, not an order type, and MUST be refused for a scheduled slot. | E | R-SH F-06; A12 |
| SHIP-04 | A pickup code shown only to the sender SHOULD confirm custody at pickup, with a 5-strike lockout like delivery. | N | PLAN T-19, WP-17 |
| SHIP-05 | The delivery code (`handover_code`) MUST be needed to complete. It is shown to the order owner, who passes it to the recipient (SHIP-13 adds direct delivery to the recipient). It MUST lock out after 5 wrong tries, with an audited admin reset. The code MUST contain no personal data. For goods-COD parcels the captain also records, at every attempt, whether the sender's seal is intact or broken; the record is append-only; the recipient disputes it by phone to support (telling the captain only prompts the captain to log the dispute) and the sender through their order in the app; support decides from all accounts; this record feeds DLV-22. | E | R-SQ F-07 |
| SHIP-06 | A QR form of the delivery code MAY be offered beside the digits. | N | R-SQ F-07; PLAN T-21 |
| SHIP-07 | A failed delivery MUST use a typed reason (absent, refused, unreachable, wrong address, rescheduled, access blocked, damaged). Each reason maps to a suggested next action (reattempt or return). For goods COD, `wrong_or_missing_item` (DLV-20) is also offered and suggests return (N). | E | R-SQ F-08; WP-09 |
| SHIP-08 | Attempts: a parcel SHOULD allow up to three attempts. The attempt step is tracked separately from status (R-SH F-02 three-axis model). | N | |
| SHIP-09 | Return to sender MUST be a tracked leg that needs the sender's return code. | E | PLAN T-23 |
| SHIP-10 | Custody chain: a per-parcel, append-only, human-readable event log (who held it, when) MUST be visible to sender and admin. | P: events stored; no customer view | R-SQ F-05 |
| SHIP-11 | Door cash: the captain MUST enter the amount collected. A difference needs a typed variance reason (A11). | E | R-SQ F-03; WP-01 |
| SHIP-12 | Goods COD (collect the item price for the sender and remit it per MER-07) is decided yes (D-1); once enabled it MUST keep goods money apart from fares and count it in the cash cap. | E-off: COD records and routes exist on PostgreSQL (`payments.ts`); no app UI; the cash cap does not count goods COD yet | R-SH F-03; WP-16; gates G-COD, G-LEGAL |
| SHIP-13 | The recipient MUST receive the tracking link and delivery code by message (WhatsApp/SMS) and MUST NOT need an account. | P: link shared by sender | PLAN C-12 |
| SHIP-14 | Delivery windows with a daily capacity cap per zone SHOULD be offered where scheduled delivery is enabled. | P | R-SQ F-02; PLAN C-10 |
| SHIP-15 | Handoff hints ("leave with neighbour", "call on arrival") MAY be chips on the order. | N | PLAN T-24 |
| SHIP-16 | Prohibited and regulated goods MUST be listed in the app; the sender confirms at booking; the captain MAY refuse at pickup with the reason `captain_refused_pickup` (sub-reason: prohibited goods, stored as SHIP-17 says), and the refusal is recorded (`docs/SYSTEM.md` §7). | N | |
| SHIP-17 | At parcel pickup the captain MUST confirm the parcel's visible condition (sealed, no visible damage) with typed exceptions, recorded in the custody chain (SHIP-10). An exception lets the captain refuse the pickup with the reason `captain_refused_pickup` (sub-reason: damaged parcel). The code needs a new entry in the server's exception reason list and its own app label (`pickup_captain_refused_pickup`); the code is accepted only while `at_pickup`, and the sub-reason is stored in a new `exception_detail` field, never as the existing `damaged` reason. This record judges sender fault for goods-COD refunds (DLV-22). | N | `docs/SYSTEM.md` §10 pickup row |
| SHIP-18 | A goods-COD delivery that fails (any DLV-20 reason) MUST first go to the DLV-20 admin review and follow SHIP-07/08: support decides, normally following the SHIP-07 suggestion (`refused`, `damaged` and `wrong_or_missing_item` return; the other reasons are reattempted up to the allowed attempts) (each attempt records the seal, SHIP-05, and pays the captain from operating expenses as DRV-17). After the last attempt, or for a return reason, the parcel goes back to the sender on the SHIP-09 return leg with the sender's return code; the recipient pays nothing and nothing is remitted to the sender for that parcel. | N | decided D-1; gate G-COD |
| SHIP-19 | Returned goods nobody receives at the return endpoint MUST be taken to the Wind office, where office staff record the receipt through the existing support `confirm_return` step (no code; a reason such as "received at office"), which moves the order from `returning` to `returned`. The sender or merchant is told daily; goods are held up to 7 days (non-perishables) or 24 hours (perishables), then donated if support judges them safe and sellable, otherwise destroyed, recorded with an actor (and a photo once G-STORAGE exists). No money moves for disposed goods beyond DLV-25. | N | decided D-5 |

---

## 7. Delivery (DLV) — HAAT / Souq line (shop orders)

New service key `shop`. Gate **G-SHOP** is decided (D-2, §16a): a one-town pilot. `docs/PRODUCT.md` §2 advised
against a restaurant marketplace first; the owner's 16 Nov decision includes Delivery. Still needed before launch:
- Signed merchants and their product lists in the pilot town.
- A food-handling policy; the returns policy is D-2.
- G-PG and the NFR-06 items (D-2), and per-town service enablement (ONE-14), so the shop line opens only in the pilot town.

The design starts with **shops that prepare orders** (grocery, bakery, everyday goods; pharmacy OTC once DLV-19's policy exists). Restaurant
menus are a later variant of the same model.

| ID | Requirement | St | Source |
|---|---|---|---|
| DLV-01 | Merchant catalogue: categories, items with price (integer agorot), photo optional, availability toggle and "sold by weight" flag. | N | D-HA §2; R-HA §5 |
| DLV-02 | Cart MUST hold one merchant at a time. Switching merchant asks to clear the cart, with a confirm. | N | D-SQ §2; R-HA §5 |
| DLV-03 | Minimum order and delivery fee MUST be shown before checkout; the service fee is its own labelled line (BOOK-02). | N | R-HA §4–5 |
| DLV-04 | Weighted items: the cart shows an estimate labelled as an estimate. While `merchant_state` is `preparing` (packing, before marking `ready`; the spine may already be `assigned` or `at_pickup`), the merchant records the actual weight and final line price. At checkout the customer chooses an agreed limit as a percentage over the estimate (default +10%, owner-tunable), which the server stores as a per-order **goods cap** in agorot (estimate × (1 + %)). The cap applies to the cumulative goods total, not to each change. | N | D-HA §4; R-SQ F-09 |
| DLV-05 | Substitution policy MUST be chosen per order or item: "remove if out of stock", "ask me first" (always goes through DLV-06), or "similar item within the goods cap" (DLV-04). | N | R-SQ F-09; D-SQ §3 |
| DLV-06 | Consent-before-change: every merchant change (weight, substitution, removal) is evaluated in this order. (1) If it would take the order's cash above the ADM-12 ceiling, it is refused when the merchant records it; the order does not pause, and the merchant removes the line or substitutes within the cap. (2) If it is an "ask me first" substitution, `merchant_state` pauses in `awaiting_approval` for consent, whatever its effect on the minimum. (3) Otherwise, if it would take the goods total below the minimum, the order is cancelled with the reason `below_minimum` and a clear message. (4) Otherwise, if it would take the goods total above the goods cap (DLV-04), `merchant_state` pauses in `awaiting_approval`. While paused (between `preparing` and `ready`; an assigned captain keeps waiting) the customer is notified. Approve returns the order to preparing and raises the goods cap to the approved goods total if that is higher (bounded by the ADM-12 ceiling less the delivery and service fees); approval never lowers the cap. Decline removes the line and re-runs steps 1, 3 and 4. With no answer within the consent timeout (owner-set, default 5 minutes), the change is declined automatically. Waiting time MUST NOT count as preparation time. | N | R-SQ A9; D-SQ §3 |
| DLV-07 | The merchant MUST accept or reject within the accept timeout (owner-set, default 5 minutes). Rejection needs a typed reason ("closed" `merchant_closed`, "out of stock" `out_of_stock`, "too busy" `merchant_rejected`) shown to the customer in their language. With no answer, the order expires automatically at no charge and the customer is told. | N | R-HA (المطعم رفض الطلبيه) |
| DLV-08 | The merchant MUST set the preparation minutes when accepting, then mark progress: accepted → preparing → ready (and back to preparing when a DLV-13 handover exception reopens the order). Each step is server-timestamped and drives the ETA and the dispatch start (DLV-12). | N | D-HA §3 |
| DLV-09 | Order states in Arabic and English MUST name the actor (for example "The shop is preparing your order", "The captain picked up your order from the shop"). | N | R-HA §4; ONE-04 |
| DLV-10 | Order snapshot: shop, items, prices, address and (once `ready`) the packing record (MER-03) MUST be frozen at placement, frozen again at `ready` with the packing record, and frozen again whenever items change: before acceptance (§4.3a), by a DLV-06 consent, or by the merchant's final weights and substitutions (DLV-04, MER-03); earlier snapshots are kept, so later edits never rewrite history. | N | D-HA §3 |
| DLV-11 | Edit or cancel MUST follow §4.3a and D-2: items and destination are free to change until the merchant accepts; the drop-off note may change through `ready` (until `handed_over`); customer cancellation is free until the merchant accepts, through support (still free) while `merchant_state` is `accepted`, and refused with the reason shown once it is `preparing` or later. | N | |
| DLV-12 | Captain dispatch for a shop order MUST start so that arrival meets `ready` (the merchant's preparation minutes minus the captain's ETA), not at placement. If no captain is assigned by `ready` + X minutes (owner-set, default 10 minutes), the customer is told and keeps waiting (cancellation is refused from `preparing`, D-2), an admin may reassign or cancel with reason `no_captain`, the merchant is told to hold the order, and the admin stuck-order list shows it. | N | |
| DLV-13 | At the shop the captain MUST enter the **merchant pickup code** (§2.1a), shown by the merchant and never to the customer, with the SHIP-05 lockout. Before accepting the handover the captain MUST confirm the number of packages, the items in any open bag, and visible condition (seal intact, no visible damage) against the order snapshot (items, DLV-10), using the merchant's packing record (MER-03) only for the package count, which packages are sealed and which items are in each open bag (an order item not listed in an open bag is taken to be in a sealed package; if the packing record lists no sealed package, an unlisted item is a missing-item exception), with typed exceptions (missing item, wrong item, damaged, package count). An exception **reopens `merchant_state` to `preparing`**, so the merchant fixes it under MER-03 and every change is evaluated by DLV-06 (a drop below the minimum cancels with reason `below_minimum`, money per DLV-23). If the exception is not resolved within 10 minutes (owner-set), an admin decides: remove the line (which re-runs DLV-06 like any change), or cancel with reason `handover_exception_unresolved` under DLV-23. `handed_over` is recorded only when the captain accepts the handover after this check (pickup code entered, no open exception), which needs `merchant_state` `ready`; a captain who arrives earlier waits at `at_pickup`. The confirmed handover is the record DLV-22 uses to judge fault. | N | R-SQ F-04 |
| DLV-14 | Delivery completes with the customer delivery code (`handover_code`, §2.1a), with the same lockout and audited reset as SHIP-05. At every delivery attempt, completed or failed, the captain MUST record each sealed package as intact or broken (before the code, or when recording a DLV-20 failure), shown to the customer; the record is append-only; the customer may dispute it in the app and the merchant in merchant mode; support decides from all accounts. This delivery record feeds DLV-22. | N (reuse) | |
| DLV-15 | Cash at the door: goods total + delivery fee + service fee, all collected by the captain (SHIP-11); the fees go into the captain cash book and the goods into captain-held goods cash (PAY-05). The service fee is Wind's: it moves from the captain cash book to Wind revenue at the captain's cash handover and is not part of the captain commission base. Merchant settlement: Wind owes the merchant the goods total less merchant-fault refunds (DLV-22), minus merchant commission on the MER-09 base, through a merchant ledger with append-only entries and a payout reference (ONE-10). | E-off: the `merchant_cod` tables and create/collect exist in `server/domain/payments.ts` (PostgreSQL only); the statement and payouts are N | R-SQ F-06; gates G-COD, G-PG, G-LEGAL |
| DLV-16 | Delivery windows: shops MAY offer windows with per-window capacity (SHIP-14 mechanism). | N | R-SQ F-02 |
| DLV-17 | The customer rates the merchant and the captain separately (CON-08). | N | |
| DLV-18 | Order again for shop orders MUST rebuild the cart from current prices and availability and show any changes before checkout. | N | R-SQ F-14 |
| DLV-19 | Merchants MUST NOT list prohibited or age-restricted goods. Regulated categories (OTC medicine, tobacco) need an owner policy, and age-restricted items need an ID check at the door before they are allowed. | N | gate G-SHOP |
| DLV-20 | Failed shop delivery MUST use the typed `ExceptionReason` list (absent, refused, unreachable, wrong address, rescheduled, access blocked, damaged, plus `wrong_or_missing_item` for a refusal caused by wrong or missing contents: a merchant error for shop orders, or the sender's for goods-COD parcels, judged under DLV-22) and go to admin review. For shop orders the action is fixed by DLV-25 (return for every reason except `rescheduled`, which MAY get one more attempt), not by the parcel next-action map. | N | WP-09 reuse |
| DLV-21 | Goods return: undelivered goods MUST go back to the shop on a tracked return leg, confirmed by the return code (`return_code`, §2.1a) shown to the merchant. Perishables travel back like other goods; support decides on the merchant's report whether returned lines can still be sold (DLV-25). | N | decided D-2 |
| DLV-22 | Refunds: if goods paid in cash are later found wrong, missing or damaged, the refund MUST be recorded with a reason and an actor, append-only. **The fault result** is recorded by support for every failed shop or goods-COD delivery, every post-handover operational stop and every refund claim, within 2 working days of the order reaching `returned` or the claim being raised (a missed deadline flags the order on the admin dashboard), from the captain's DLV-13/14 (or SHIP-17/05) records and the customer's report; until it is recorded, no DLV-25 credit is posted and PAY-09 does not count the order. It has three values: `merchant`, `wind`, or `none` (the goods matched the order and were as handed over, and the delivery failed only because of the customer, for example a refusal or absence with no defect). An `operational` stop is always `wind`. **Who pays** follows one complete rule (D-2(a)): the merchant pays only for (i) items wrong or missing against the order snapshot (DLV-10) inside a package that was sealed at the DLV-13 handover and is still sealed and intact at delivery (whoever sealed a package answers for its contents), and (ii) items whose printed date had already passed on the day of the DLV-13 handover (support checks the date on the product the customer reports); claims about contents are judged by support from the customer's report against the order snapshot; **Wind pays for everything else** (damage, spoilage, loss, a seal broken after pickup, and anything the captain's check of open bags and package count should have caught), for the pilot and subject to the NFR-11 damage and insurance review (support may later recover a proven negligent loss from the captain under the cash rules, never automatically). **Where the cash comes from** depends on timing: before the captain's cash handover it is paid from captain-held goods cash, and that book is refilled by a recorded transfer from the operating-expense book when Wind pays, or by a single debit on the merchant ledger when the merchant is at fault, so it still clears the gross total; after the captain's cash handover the office pays, posting to the merchant ledger (merchant fault) or the operating-expense book (Wind). At cash handover of a completed order the merchant ledger is credited the gross goods total of the delivered order. **Goods-COD parcels:** the same rule with the sender in the merchant's place: the sender pays for wrong or missing contents of a parcel that was sealed at the SHIP-17 pickup and is still sealed and intact at delivery (support judges the customer's report against the sender's description of the contents at booking, SHIP-01), and for items whose printed date had already passed on the pickup day; Wind pays for everything else. A sender-fault refund before the captain's cash handover is paid from the goods-COD money the captain holds and the amount cleared into the goods COD book is reduced by the same sum (no refill); after the cash handover the office pays it and debits the goods COD book. Either way the sender's remittance is reduced. A Wind-fault goods-COD refund follows the Wind rules above. Merchant commission is always computed on the MER-09 base. The refund goes to whoever paid: for shop orders the customer (cash, or account credit if they choose); for goods-COD parcels the recipient, in cash from the captain at the door if found before paying (they simply pay less), otherwise in cash or transfer arranged by support by phone (account credit only if the recipient has a Wind account). A customer refusal or absence is not a refund case: the goods go back to the shop (DLV-21) and nothing is charged (D-2). | N | decided D-2 |
| DLV-23 | Cancellation after placing follows D-2, and its money follows the typed reason (§2.1), posted through the books in PAY-05. `customer_before_accept`: free; nobody is owed. `accept_expired`: free; nobody is owed, and no captain is assigned yet (DLV-12). `customer_via_support_accepted` and `operational` while `merchant_state` is `accepted`: free; the merchant is owed nothing; an assigned captain is paid the distance driven toward the shop from operating expenses. From `preparing` on, no operator (admin or support) may cancel at the customer's request (D-2(d)). From `preparing` on, operators cancel only for `no_captain`, `operational` (limited to: safety incident, legal or regulatory hold, platform outage) or a merchant-caused reason, each recorded with the operator and a note; `below_minimum` is set only by the server under DLV-06. `below_minimum`: the merchant is owed nothing; any assigned captain is paid the trip so far from operating expenses. Merchant-caused reasons: the merchant is owed nothing; any assigned captain is paid the trip so far from operating expenses. `no_captain` and `operational` from `preparing` until `handed_over`: sellable stock goes back on the shelf and is owed nothing; unsellable lines (damaged, or perishables the merchant must dispose of), decided by support on the merchant's report, are credited to the merchant ledger at those lines' goods value by a transfer from operating expenses, then the normal commission transfer to Wind revenue follows, so it appears on the merchant statement (MER-04); any assigned captain is paid the trip so far. After `handed_over` (still `at_pickup`, or `in_transit`) there is no cancel: an operational stop (safety incident, legal or regulatory hold, platform outage; set by an admin, never a captain reason) puts the order `on_hold` with the reason `operational`, and an admin then returns it (DLV-21); the captain is paid the trip and the return leg (DRV-17) and the merchant's money follows DLV-25 (unsellable lines only). Refusal, absence and every other failed delivery: money per DLV-25. While cash-only, no fee is ever charged to the customer. | N | decided D-2 |
| DLV-25 | Failed shop delivery money (every DLV-20 reason, including `wrong_or_missing_item`, and a post-handover `operational` hold): the customer pays nothing; the goods return to the shop (DLV-21), except `rescheduled`, where an admin MAY book one more attempt (SHIP-08) instead; the captain is paid the trip and the return leg (or the extra attempt) from operating expenses (DRV-17). The merchant's money follows the DLV-22 fault result: goods returned sellable are owed nothing; unsellable lines (damaged, or perishables the merchant must dispose of), decided by support on the merchant's report, are credited to the merchant ledger at those lines' goods value by a transfer from operating expenses, then the normal commission transfer, when the DLV-22 fault result is `wind` or `none`; when it is `merchant`, the merchant is owed nothing. | N | decided D-2 |
| DLV-24 | The shop line MUST launch with **one shop order per captain trip**. Stacking shop orders with each other or with parcels is deferred until the single-stop journey is proven (`docs/PRODUCT.md` multi-stop rule). | N | |

### 7.1 Merchant mode (MER)

| ID | Requirement | St |
|---|---|---|
| MER-01 | The merchant MUST have an order inbox with a loud new-order alert (its own notification channel), accept/reject, a prep timer and "ready". | N |
| MER-02 | The merchant MUST be able to edit the catalogue, toggle availability, set open/closed and hours, and pause new orders. Pausing or closing does not cancel orders already accepted; an order the merchant can no longer fulfil goes to support with the customer told. | N |
| MER-03 | The merchant MUST record actual weights and substitutions per line while `merchant_state` is `preparing`, before marking `ready`, whatever the spine state, and MUST record the **packing record** when marking `ready`: the number of packages, which packages are sealed, and the items in each open bag. These feed DLV-04/05/06, the DLV-13 handover check and the DLV-10 snapshot. | N |
| MER-04 | The merchant MUST see a settlement statement (orders, goods total, commission, payouts) built from the merchant ledger. | N |
| MER-05 | Merchant mode MUST be a role mode inside the same app (and a web console), not a separate app, unless the owner chooses otherwise (R-PAL D2). | N |
| MER-06 | Partner API: an external shop system MAY create Delivery or Shipping orders with a key (PLAN A-15). | P: Souq creates parcel orders (`SOUQ_PARTNER_KEY`); Delivery orders are N |
| MER-07 | Payouts to merchants and to goods-COD senders MUST have a channel (bank transfer or cash pickup at the office), a frequency, a minimum amount and a payout reference. A captain cash shortfall is the captain's liability under the cash rules, never the merchant's or the sender's. | N |
| MER-08 | Merchant onboarding MUST record the trade licence (with expiry) and the payout details; an expired licence pauses the shop. | N |
| MER-09 | Merchant commission MUST be an admin setting per merchant or category (ADM-06), computed on the goods total of completed orders net of merchant-fault refunds (DLV-22), plus any unsellable-goods credits (DLV-23, DLV-25). | N |

---

## 8. Captain (DRV) — one mode for all lines

| ID | Requirement | St | Source |
|---|---|---|---|
| DRV-01 | Online/offline MUST be shift-scoped. Location is collected only while online or on a job, never always-on (R-PAL S9). Ride dispatch (RIDE-04) needs captain presence, which is PostgreSQL-only today (`presence.ts`). | P: job-scoped GPS; presence is PostgreSQL-only | PLAN D-05 |
| DRV-02 | One job board MUST show all eligible jobs, with a service badge (icon + word), pickup distance, payout, cash to collect and the customer rating. It is paged and filterable by service and by heading. | P: paged board with rating and cash exists; no service filter, badges are not service-specific | PLAN D-08 |
| DRV-03 | Ride offers MUST arrive as a full-screen timed offer on the `jobs` channel. Shipping and delivery MAY also be offered, or picked from the board. | E-off: timed offers are PostgreSQL-only (`dispatch.ts`); the `jobs` channel is N (one `default` channel today, WP-10) | R-HD §2.2 |
| DRV-04 | The run sheet MUST order pickups, drop-offs and returns by town for all carried non-ride jobs. | E | PLAN D-12 |
| DRV-05 | Navigation MUST hand off to an external maps app from every stop. | E | PLAN D-13 |
| DRV-06 | Every step advance MUST be an idempotent command with lost-acknowledgement replay. | E | PLAN D-14 |
| DRV-07 | Proof steps per service (§2.1a): ride PIN at boarding; parcel pickup code (SHIP-04) and delivery code; merchant pickup code (DLV-13) and delivery code. | P | §5–7 |
| DRV-08 | The captain MUST NEVER see a customer's delivery code or other customers' data. | E | PLAN D-29 |
| DRV-09 | Door cash entry with variance reason (SHIP-11) MUST cover every service that collects cash. | P: live for parcels; rides are E-off and shop is N | WP-01 |
| DRV-10 | Cash owed, handover, confirm/dispute MUST be append-only. A cash cap blocks new work; a warning MUST show at 80%. A held-cash age limit SHOULD exist (WP-12). | P: append-only cash and cap exist; the 80% warning and held-cash age are N (WP-12) | PLAN D-16..D-19 |
| DRV-11 | Earnings MUST show today/week/all plus a per-job statement (fare, discount, commission, net, cash status) for all services. | P | R-CA §10.1; WP-15 |
| DRV-12 | A delivery-location support card MUST show last accepted fix, server acknowledgement and registration state; it is collapsed by default. | E | UX-05 |
| DRV-13 | Release a job back before pickup MUST be allowed with a reason; for shop orders "before pickup" means before `handed_over` (DRV-17). | P: release exists (`POST /api/orders/:id/release`); no reason is captured | PLAN D-10 |
| DRV-14 | Deadline re-arm: protected recovery records MUST survive reboot and clock change (A14). | E (Android) | R-PAL A14 |
| DRV-15 | Acceptance-rate penalties and booked shifts MUST NOT exist in the pilot. Dispatch MUST NOT rank by acceptance reliability in the pilot either (this overrides `docs/SYSTEM.md` §4 for the pilot). | — | R-CA §10.4 |
| DRV-16 | The captain MUST have an emergency call and a safety report on every active job, including rides (a passenger issue), with the event trail preserved. | P: the safety report and emergency numbers (tel:100/101/102) exist on the order screen for the assigned captain; the preserved event trail is N | |
| DRV-17 | When a shop order or any parcel (plain or goods COD) fails after pickup, or is stopped after `handed_over` (DLV-23), and goes back, the captain MUST still be paid the trip and the return leg (except after a custody recovery or courier block, below) (or each extra attempt) from Wind operating expenses (PAY-05), and DRV-11 earnings show it as a separate line (D-2, DLV-25). **Custody is never re-queued:** once a parcel is picked up or a shop order is `handed_over` (even while still `at_pickup`), driver release (DRV-13), admin reassignment and the courier block's back-to-pool step MUST refuse it; a stop goes to `on_hold` and the captain keeps the goods (today none of the three checks `handed_over`). **Entries into `returning`:** an admin resolves any `on_hold` with `return` (a DLV-20 reason, a support hold, a scope mismatch (the order no longer fits the captain's approved scope, server `scope_mismatch`), or an `operational` stop); support custody recovery; or a courier block. **Who carries it:** the captain holding the order carries the return, except after a custody recovery or courier block; a `returning` order is never reassigned. After a custody recovery or courier block, support collects the goods from the captain to the Wind office and closes the order with `confirm_return`; no return leg is paid to anyone, the office trip is an operating expense, and the blocked captain is paid the trip so far only if the block review clears them. **When the return leg is paid:** on any move to `returned`: the captain enters the return code shown to the sender or merchant at the return endpoint (the shop for shop orders; the sender's address for parcels and goods COD); office staff record the receipt at the Wind office when nobody receives the goods (`confirm_return`, SHIP-19), in which case the captain's extra leg to the office is paid too (not when support itself collected the goods); or support closes a custody recovery or a courier block (support collected the goods, so no captain leg is paid). Every move to `returned` also opens the DLV-25 decision for shop orders. **Captain commission** (Wind's share of the delivery fare) is earned only when an order reaches `completed`: a `returned` order collected no fare and owes none, and no return fee is charged while cash-only. Today the server writes it at assignment and counts `returned` orders as finished (`postOrderJournals`, the ledger backfill, and the owed sum through `finishedStatuses`); this MUST change so a `returned` order adds nothing to what the captain owes. **Merchant commission** on goods (MER-09) is a separate charge on the merchant ledger and follows DLV-23/25. Rides never enter `returning` (§2.1). | N | decided D-2 |
| DRV-18 | When a shipping order is cancelled before pickup after a captain was assigned (any §2.1 shipping pickup reason), the captain MUST be paid the distance driven toward the pickup from Wind operating expenses, shown on DRV-11 earnings. A `captain_refused_pickup` is paid only when support confirms the refusal. While cash-only the sender is never charged. Rider cancels and no-shows pay the captain nothing while cash-only (RIDE-09; a courier-block cancel follows §2.1); shipping differs because Wind sends the captain on a dedicated trip to the pickup. After pickup, holds follow SHIP-07/18 and DRV-17. | N | decided D-1 |

---

## 9. Map and location (MAP) — Kimi map spec

| ID | Requirement | St | Source |
|---|---|---|---|
| MAP-01 | One map component MUST be used: MapLibre/OSM baseline (no key) on web and Android, on iOS the web map in Safari (the installable web app, NFR-09), Google renderers only where licensed. The provider sits behind one interface so the tile host is configurable (R-CA §6). | P | KIMI-MAP; M-01 |
| MAP-02 | The camera MUST be driven by intents: `follow(target, zoom, offsetRatio)`, `fitBounds(bounds, padding)`, `free`. Fit padding MUST be derived from the measured sheet and header height and re-applied when the sheet snaps. | P: the camera is set per screen through props; one intent model is N | KIMI-MAP §1 |
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
| PAY-01 | Money MUST be integer agorot end to end and display in ₪; amount fields MUST accept Latin and Arabic-Indic digits (`latinDigits`). | P: cash entries and door cash are integer agorot; `orders.price`, `discount` and `commission` are stored as REAL shekels and need migrating |
| PAY-02 | Cash MUST be the default and stated before booking (BOOK-03). | E |
| PAY-03 | Account credit and promo codes MUST apply to all services, subject to CON-06. | P |
| PAY-04 | Cash entries MUST be append-only; corrections are new entries with a reason and an actor (R-SQ F-06). | E |
| PAY-05 | The ledger MUST keep six separate books: captain cash (fares and fees); captain-held goods cash (shop goods and goods-COD money collected at the door; counts in the captain cap; shop goods clear into the merchant ledger and goods-COD money into the goods COD book at the captain's cash handover, as the gross amount; DLV-22 covers refunds made before that); goods COD (sender money, paid out per MER-07; gated); merchant settlement, also called the merchant ledger (shop goods owed to merchants: credited with the gross goods total of a completed order at the captain's cash handover, or by a DLV-23 cancel transfer or a DLV-25 unsellable-return transfer, debited by merchant-fault refunds, by the commission transfer and by payouts, so it returns to zero after each payout; gated); Wind revenue (commissions transferred from the merchant ledger and the captain cash book, and service fees, DLV-15); and Wind operating expenses (refunds Wind pays, DLV-22; captain pay for failed deliveries of shop orders and all parcels and post-handover operational holds (DLV-23), per DRV-17 including its custody-recovery and courier-block exception; captain pay for pre-pickup shipping cancels, DRV-18; merchant credits for unsellable returns, DLV-25; cancel payments, DLV-23). They MUST NOT be netted silently against each other. | P |
| PAY-06 | Card/wallet MUST NOT be built until a PMA-licensed provider is contracted (G-PAY). When added, it plugs in behind ONE-08. Whether orders above ₪500 must be paid electronically is decided under G-LEGAL, not by the provider contract. | —, gated (G-PAY) |
| PAY-07 | Customer arrears MUST NOT exist while cash-only (no fees). If fees are ever introduced, the Careem arrears rule applies: an unpaid balance blocks the next cash booking and is shown before booking (R-CA §5). | — |
| PAY-08 | Tips MUST NOT be recorded in-app while cash-only (unrecorded money). | — |
| PAY-09 | Two shop orders within 30 days that fail with a DLV-20 `refused` or `absent` reason and a DLV-22 fault result of `none` MUST pause the customer's cash shop orders until support reviews them, with the reason shown before booking (D-2). `wrong_or_missing_item` and `damaged` never count. This is a behaviour rule, not an arrears rule (PAY-07): no balance is owed. | N |

---

## 11. Design requirements (DES)

Goal: the three lines look and behave as **one** app. Same tokens, same components, same patterns; a service is
recognised by its icon and name, not by a different look.

### 11.1 Foundations

| ID | Requirement | St |
|---|---|---|
| DES-01 | Tokens MUST come from `src/ui.tsx` `palette`. Identity: forest `#12342A` + lime `#D3F27A` (lime only on forest), paper `#F3F2EC`, card `#FFFFFF`, ink `#0E1F19`; text grey no lighter than `faint #66716B` (4.5:1); clay for markers only; `clayInk` for text on clay states. | E |
| DES-02 | Service accents (icon/badge only, never primary buttons): Ride = olive `#34765A`, Send = clay ink `#A94A28`, Shop = blue `#2F5E8C`. Forest stays reserved for primary actions. Each badge MUST pair the colour with an icon and a word. | N |
| DES-03 | Type: Readex Pro for headings (bold/semibold), system font for body, in both scripts. Fixed type ramp (`textVariants`): h1 21/30, h2 17/25, title 15/21, body 14/21, label 13/18, caption 12/17, micro 11/15. | E |
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
| A11Y-03 | Text MUST scale to 200% with no clipped, overlapping or hidden control (`maxScale` 2.0; `minHeight`, not fixed heights; check fixed `lineHeight` values at 200% on the A53). | 1.4.4 | P: tab labels, badges and route-preview map labels are capped at 1.3 (`src/ui.tsx`, `src/route-preview.tsx`); remove the caps (two-line tabs, route labels in the sheet text) or record an owner waiver |
| A11Y-04 | Every interactive element MUST have a role and a label in the current language; headings use `header`; errors and status changes are announced (`alert` / live regions). | 4.1.2, 1.3.1, 4.1.3 | P: 88 `accessibilityLabel` occurrences in `src/` (grep count, 16 Nov); a full audit of pressables and roles is N |
| A11Y-05 | Focus order MUST follow reading order in both directions. In RTL the layout mirrors; directional icons flip; numbers and phone numbers stay LTR. | 1.3.2, 2.4.3 | P: layout mirrors through `rtl` flags; focus order with TalkBack is unverified (A11Y-25) |
| A11Y-06 | Status MUST never be colour alone: service badges, order states and cash states always carry text and/or an icon. | 1.4.1 | P |
| A11Y-07 | Error text MUST sit next to its field, be announced, and say how to fix it. | 3.3.1, 3.3.3 | E |
| A11Y-08 | Timed actions MUST announce the remaining time at intervals and MUST warn before acting automatically. Ride offers use the WCAG real-time exception (D-3): default window 20 s, and a captain can lengthen it up to 40 s in settings. The other timers MUST offer a way to extend: the merchant can add 5 minutes once to the accept timeout (DLV-07); the customer can add 5 minutes once to the consent timeout (DLV-06); the rider can ask for 2 more minutes once during the waiting grace (RIDE-06). | 2.2.1 | N |
| A11Y-09 | Reduced motion MUST be honoured everywhere (DES-12); auto-moving content (glide, carousels) can be paused or stops under reduced motion. | 2.2.2 (2.3.3 AAA, adopted voluntarily) | E |
| A11Y-10 | Language of content MUST be set (`lang` on web; RN `accessibilityLanguage` on iOS) so screen readers switch voice; Android behaviour is verified on the A53 (A11Y-26). | 3.1.1 | P |
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
| A11Y-25 | The RTL source of truth MUST be decided and tested: with TalkBack on the A53, check device English + app Arabic, and device Arabic + app Arabic. If reading order does not match the visible order, switch to `I18nManager` (which needs an app reload) and update ACC-09. | 1.3.2 | N |
| A11Y-26 | Words in the other language inside a sentence (place names, codes, English brand names in Arabic copy) MUST be read correctly; mark the language of parts on web, and check Android reading on the A53 (`accessibilityLanguage` is iOS-only in React Native). | 3.1.2 | N |
| A11Y-27 | Phone, OTP, password, name and address fields MUST declare their purpose (`autoComplete` / `textContentType`) so autofill and assistive tech work. | 1.3.5 | P: OTP uses `one-time-code`; the other fields are not audited |

### 12.1 Accessibility checks (definition of done for every UI PR)

1. `npm run screens` at 360 px, ar and en: no clipped button and no hidden primary action. **Exists at scales 1 and 1.3**
   (`scripts/screens.mjs`); a 200% pass and Shop screens are **N** (ride and freight screens are listed), and the screen pass is not a device test.
2. Automated: `tests/large-text.test.mjs` asserts every `Text`/`TextInput` uses `maxScale` (**exists**). A rule that
   pressables have `accessibilityRole` + `accessibilityLabel` and that acting icons have labels is **N**.
3. Contrast: a token test that checks every colour pair against 4.5:1 or 3:1 is **N**; until it exists, the PR
   states the ratio of any new pair.
4. Physical A53 pass with TalkBack in Arabic and English through the PR's flow: every control is announced with a role
   and name, focus order is logical, timed screens announce time.
5. Reduced motion on: the PR's screens show no movement and the state still reads.
6. Keyboard (web): every action is reachable, focus is visible.
7. Scope: TalkBack on Android and VoiceOver on iOS Safari (the installable web app), both now (NFR-09). VoiceOver pass:
   an iPhone with the home-screen web app, ar and en, through the PR's customer flow. Until an iPhone is available the
   iOS pass is waived by decision D-4 (§16a) and the flow is checked in desktop Safari with VoiceOver.

---

## 13. Notifications, chat and support (NTF/SUP)

| ID | Requirement | St |
|---|---|---|
| NTF-01 | Native push (FCM) MUST use per-event channels (`jobs`, `status`, `cash`, `attention`, `chat`, and `merchant_orders` for shops), with versioned channel ids. | P: one `default` channel today (`src/native-push.ts`); per-event channels are N (WP-10) |
| NTF-02 | Web Push MUST serve the web/home-screen app. | E |
| NTF-03 | Push content MUST follow CON-09 and A11Y-12, and MUST contain no codes or personal data on the lock screen. | P |
| NTF-04 | Chat MUST be anchored to the order, with quick replies; admin MAY redact a message. | P: order chat with quick replies exists; admin redaction is N |
| NTF-05 | Shop orders MUST have order chat between customer and merchant (substitution questions) and between merchant and captain (pickup), anchored to the order. | N |
| SUP-01 | Help, FAQ and WhatsApp support MUST be reachable from every screen's account area and from every live order. | E |
| SUP-02 | Disputes and incidents MUST share one admin queue covering all services. | P: disputes and safety incidents are separate admin tabs and endpoints; one queue is N |

---

## 14. Operations console (ADM)

| ID | Requirement | St |
|---|---|---|
| ADM-01 | Dashboard per service line: volume, active, stuck (searching too long, merchant not accepting, waiting grace exceeded, fault result overdue DLV-22), cash exposure and backup warning. | P: one dashboard with stuck orders and backup warning; per-service split and merchant/grace metrics are N |
| ADM-02 | Users: approve captains per service line and vehicle; approve merchants; block with reason; edit with compare-and-set (`expectedRole`). | P |
| ADM-03 | Dispatch: admin assign/reassign obeys the eligibility path (`driverRefusal`, CON-04). | E (WP-02) |
| ADM-04 | Orders: cancel, resolve exception, proof reset (audited), decision card with suggested next step. | E |
| ADM-05 | Cash: six books (PAY-05), handover confirm/dispute, merchant payouts with reference. | P |
| ADM-06 | Settings: tariffs per service and vehicle, fees, minimums, merchant commission (MER-09), zones, windows and capacity, load per vehicle class in kg and volume (CON-03), cash cap and age limit, the per-order cash ceiling (ADM-12), the shop timers and limits (agreed limit DLV-04, consent timeout DLV-06, accept timeout DLV-07, no-captain wait DLV-12, handover exception timer DLV-13), and enabled services per town (ONE-14). Compare-and-set on save. | P |
| ADM-07 | Audit log viewer (read-only) over `security_events`. | N (WP-13) |
| ADM-08 | Fleet view: captains online, last fix (stale shown as stale), current job and service. | P: per-order driver location exists; a fleet list is N (WP-18) |
| ADM-09 | Merchant management: catalogue moderation, hours, pause, settlement statements. | N |
| ADM-10 | Admin permissions MUST be split by duty, using the roles in `server/domain/ops.ts`: `dispatcher` (orders, assign), `finance` (cash books, payouts), `safety` (incidents), `driver_reviewer` (captain approval) and `platform_admin` (users, settings), plus support (disputes, chat). Production has one `admin` role today. | E-off: staff duty roles exist in `server/domain/ops.ts` (PostgreSQL-only); production has one `admin` role |
| ADM-11 | Abuse rules MUST exist: limits on promo use per person and device, flags for repeated cancellations, fake orders, merchants rejecting after acceptance, and captain–merchant collusion (one captain repeatedly taking one shop's orders with cash mismatches), reviewed in the admin queue. | N |
| ADM-12 | A per-order cash ceiling MUST be an admin setting, enforced for every cash-collecting order (ride, parcel, freight, goods COD, shop) against the highest reachable total: at booking, highest reachable cash = goods cap (DLV-04) + delivery fee + service fee for shop orders, quoted fare + declared COD amount for goods-COD parcels (SHIP-12), and the quoted fare for other services; afterwards any consent (DLV-06) or route change (RIDE-03, PLAN T-12) that would exceed the ceiling is refused. It defaults to ₪500 (D-1); an order above it is refused with a specific message. Because goods cash counts in the one captain cash cap (ONE-10), the cap (DRV-10) MUST be at least the ceiling: saving a ceiling above the cap is refused, and enabling shop or goods COD in a town raises the default cap to ₪1,000 (owner-set). Door cash entries keep their existing upper bound. The existing goods-COD limit (`COD_LIMIT_MINOR`, ₪10,000 in `server/domain/payments.ts`) stays as a hard upper bound; ADM-12 sits under it. | N |

---

## 15. Non-functional requirements (NFR)

| ID | Area | Requirement | St |
|---|---|---|---|
| NFR-01 | Performance | Proposed targets, to be confirmed by measurement on the A53: cold start to interactive home ≤ 4 s on 3G; booking steps respond ≤ 300 ms locally; the first map tiles render ≤ 3 s. | P |
| NFR-02 | Network | Every write is idempotent and recoverable. Shell, saved places and the active order are cached. A failed write keeps the user's input and shows a retry. Queued driver writes MAY be added (R-SQ A7). | P: booking and driver replay recover writes; queued driver writes and a cached shell are N |
| NFR-03 | Battery and location | Location only while online or on a job. Cadence: 5 s moving with a good fix, else 15 s, 2 s floor. No always-on location. | E |
| NFR-04 | Privacy | No ad, attribution or engagement SDKs. `allowBackup=false`. Precise traces kept for a limited incident window. Recipient links show location only while the order is active and can be revoked; an expiry (`docs/SYSTEM.md` §4) SHOULD be added (N). A captain sees a customer's phone only during an active job. | P: no ad SDKs and `allowBackup=false` hold. The assigned captain sees the customer's phone for 24 h after the last update, not only during the job (`server/main.ts`); share links stay valid for 24 h after the order's last update (`server/domain/realtime.ts`); there is no time-based trace retention (rows are deleted on driver-state events); link expiry is N |
| NFR-05 | Security | HTTPS only. Server-side roles. Compare-and-set on admin edits. Rate limits on auth and codes. Proof lockouts. Audit events. No secrets in the app. Retired API hosts refused at build. | E |
| NFR-06 | Reliability | One SQLite instance with daily backups now. Before more than one API instance or the Ride/Delivery launch: a shared transactional store (the PostgreSQL decision), an off-host backup and a restore drill. | P: SQLite with daily on-disk backups; off-host backup, restore drill and a shared store are N (G-PG) |
| NFR-07 | Observability | Every order id traceable across API, dispatch, location, proof and cash. Alerts on stuck states and failed backups reach the owner (WP-08). | P |
| NFR-08 | Localisation | Arabic default, complete English. All copy in `src/copy.ts` with typed keys. Number, date and currency formats per language. | E |
| NFR-09 | Compatibility | Android: the versions Expo SDK 57 supports, up to Android 16, on ARM (APK and Play). iOS: the installable web app opened in Safari and added to the home screen (`public/install.html`); no App Store build is planned now (owner, 16 Nov). iOS limits: a web page cannot track location in the background, so captains MUST use the Android app (iOS is for customers); Web Push on iOS needs the home-screen install (NTF-02); closed-app FCM push is Android only. Web is also the fallback for any customer. | P |
| NFR-10 | Updates | A forced-upgrade floor by `CLIENT_BUILD`. Release builds keep the signing key (`5947bab0…`) across EAS accounts. | E |
| NFR-11 | Legal | Passenger, courier and merchant licensing, insurance, privacy and terms reviewed per service line before launch (`docs/SYSTEM.md` §7). | —, gated (G-LEGAL) |

---

## 16. Owner gates and decisions

| Gate | Blocks | What is needed |
|---|---|---|
| G-RIDE | §5 | Passenger-transport permission, insurance, captain supply, dispatch review |
| G-FREIGHT | Freight in §6 | Vehicle supply, load and damage policy |
| G-SHOP | §7, MER | **Decided D-2 (go):** one-town pilot with 3–5 shops. Still needed: signed merchants and their product lists, a food-handling policy, and the DLV-19 policy before any regulated category (pharmacy OTC is excluded until then) |
| G-PG | NFR-06, ride lifecycle, dispatch, presence, ledger, COD | SQLite → PostgreSQL decision and migration |
| G-PAY | PAY-06 | PMA-licensed provider contract |
| G-COD | SHIP-12, SHIP-18, DLV-15 | **Decided D-1 (yes):** Wind collects goods cash for shops and senders, under the ADM-12 ceiling; remittance per MER-07. The code part still waits on G-PG |
| G-SMS / G-EMAIL | ACC-02/03 | SMS provider and sender id; email sending domain |
| G-STORAGE | ADDR-05, ACC-05, proof photos | Object storage with scanning and retention |
| G-PUSH | NTF-01 closed-app | Firebase `google-services.json` and FCM key on the new EAS project; server Firebase key |
| G-OSRM | TRK-02 road-aware ETA, MAP-11 | Self-hosted OSRM with the West Bank graph on the production host |
| G-LEGAL | the MTDE ₪500 courier-payment reading (§1.2, PAY-06), the ADM-12 ceiling value, item-sale proceeds (SHIP-12, DLV-15), tax invoice (TRK-13), licensing and insurance per service line (NFR-11) | **Partly decided:** D-1 lets cash collection, including goods, proceed under ₪500 for the pilot. **Open:** the PAY-06 reading, TRK-13 and NFR-11 (counsel's written answer) |
| G-TELECOM | TRK-12 phone masking | A telecom contract for relayed calls |
| G-A11Y-TIME | A11Y-08 ride-offer timing | **Decided D-3 (accepted):** ride offers use the WCAG 2.2.1 real-time exception |
| G-REFUND | DLV-21..23, PAY-09, DRV-17 | **Decided D-2:** the refund, cancellation and captain-pay policy in §16a |


### 16a. Owner decisions, 16 November 2026

The owner asked for these three to be decided by recommendation, following the competitor apps. iOS is served by the
installable web app from Safari (NFR-09); no App Store build is planned now.

| ID | Decision | Competitor basis |
|---|---|---|
| D-1 | **Cash, including goods money, is collected at the door** for shop orders and goods-COD parcels, with a ₪500 per-order cash ceiling (ADM-12; ₪500 is Wind's own value, not a competitor figure). Electronic payment comes later through G-PAY. A failed goods-COD parcel follows the parcel rule: support decides, normally following SHIP-07 (`refused`, `damaged` and `wrong_or_missing_item` return, the other reasons are reattempted up to the allowed attempts, then returned to the sender, SHIP-18); the recipient never pays for a failed delivery. Counsel review stays recommended before raising the ceiling or growing beyond the pilot. This **supersedes** `docs/SYSTEM.md` §10's exclusion of item-sale proceeds for the shop and goods-COD pilot. The pilot also proceeds without the counsel confirmation of e-payment obligations in `docs/SYSTEM.md` §7 item 3, as the live parcel bookings already do (an accepted exception); that reading stays open under G-LEGAL. | Direct evidence: Souq Tulkarm records the amount collected at the door (R-SQ F-03). Inferred: Shiply's COD order types (R-SH F-03) and HAAT's cash option beside card (R-HA §4–5). |
| D-2 | **Shop delivery goes ahead** as a one-town pilot with 3–5 shops (grocery, bakery, everyday goods). Pharmacy OTC is **excluded** until the DLV-19 policy exists. **The first shop order waits on G-PG and the NFR-06 items** (shared store, off-host backup, restore drill), because merchant settlement and goods COD run only on PostgreSQL today. **Refunds and cancellation:** (a) fault has one complete rule (DLV-22): the merchant pays only for (i) items wrong or missing against the order snapshot (DLV-10) inside a package that was sealed at the DLV-13 handover and is still sealed and intact at delivery (whoever sealed a package answers for its contents), and (ii) items whose printed date had already passed on the day of the DLV-13 handover (support checks the date on the product the customer reports); claims about contents are judged by support from the customer's report against the order snapshot; Wind pays for everything else (damage, spoilage, loss, a seal broken after pickup, and anything the captain's check of open bags and package count should have caught), for the pilot and subject to the NFR-11 damage and insurance review; (b) customer refusal or absence: the goods go back to the shop (DLV-21), the customer pays nothing for them and no delivery fee is collected; the captain is still paid for the trip and the return leg from Wind operating expenses (DRV-17, except after a custody recovery or courier block), and the merchant's money follows DLV-25 (by DLV-22 fault); (c) two shop orders within 30 days ending with a DLV-20 `refused` or `absent` reason and a DLV-22 fault result of `none` pause the customer's cash shop orders until support reviews (PAY-09); (d) the customer may cancel free until the merchant accepts, through support while `merchant_state` is `accepted`, and not once it is `preparing` (DLV-11, DLV-23), except the automatic `below_minimum` cancel in (e): when a merchant change (including a "remove if out of stock" removal the customer agreed to, an admin line removal after a handover exception, or an "ask me first" substitution the customer declines or does not answer) leaves the order below the minimum, it is cancelled and the merchant bears the prepared goods, because the merchant's stock change started it; (e) an automatic below-minimum cancel owes the merchant nothing; captain pay and merchant money on every cancel path are decided as written in DLV-23. The owner accepts these policies for the pilot without counsel; counsel review is recommended before scaling. This supersedes, for the shop pilot only, the counsel requirement for the customer refund and cancellation policy in `docs/SYSTEM.md` §7 item 4; the item's other policies (prohibited goods, damage and insurance, privacy, emergency, support) still go through NFR-11 before the first shop order. | Souq Tulkarm types failure reasons and returns goods (R-SQ F-08). HAAT refuses changes or cancellation once an order is sent (R-HA §5); Wind deliberately allows free cancellation until the merchant accepts, because no goods have been prepared yet. |
| D-3 | **Timed ride offers are accepted** under the WCAG 2.2.1 real-time exception: the rider is waiting, so an offer must expire and no alternative to the limit is possible. Wind's own values: default window 20 s, which a captain can lengthen up to 40 s in settings; the remaining time is announced (A11Y-08). | Timed offers with automatic expiry exist in courier apps (R-HD §2.2; exact timeouts unknown). The 20 s and 40 s values are Wind's. |
| D-4 | **iOS VoiceOver acceptance waiver** until an iPhone is available: until then the customer flow is checked with VoiceOver in desktop Safari (§12.1 item 7). Recorded under the owner's 16 Nov instruction to decide the open items by recommendation. | iOS customers use the Safari web app (NFR-09); no competitor basis needed |
| D-5 | **Uncollected returns** (parcels and shop orders) are held at the Wind office for 7 days, or 24 hours for perishables, then donated if safe and sellable, otherwise destroyed (SHIP-19). Recorded under the owner's 16 Nov instruction to decide the open items by recommendation. | Common courier practice; no competitor study covers it |

---

## 17. Release plan (phased, one app throughout)

| Phase | Scope | Exit gate |
|---|---|---|
| **1 — Shipping, hardened** (now) | ONE-01, 02, 04, 06, 13 (ONE-07 is already met for parcels on SQLite; versioned quote records wait for G-PG); PAY-01 (prices in integer agorot); ADM-12 (per-order cash ceiling, default ₪500); SHIP complete except gated items; ADDR-03/04; TRK-02 (needs G-OSRM); DRV-10/11; NTF-01 (closed-app part needs G-PUSH); A11Y checks on all existing screens | Pilot of 50 users runs 2 weeks with no lost order and no cash mismatch; A11Y §12.1 passes on the A53 |
| **2 — One-app shell** | ONE-03 spine and state mapping (§2.1), ONE-05 service switcher, shared status/receipt/rating/chat components (DES-09..11), extend the existing eligibility path (`canTake` + `driver-refusal.ts`) with service-line approval and cash age (CON-04), notification channels | Parcel unchanged for users; Ride and Shop hidden (ONE-13); screens regenerated |
| **3 — Ride** | §5 after G-RIDE and G-PG | Field test per town pair; boarding PIN and waiting grace on real phones; CON-01/02 enforced |
| **4 — Delivery** | §7, MER (G-SHOP, G-REFUND, G-COD decided and G-LEGAL partly decided in §16a); G-PG, the NFR-06 items and per-town service enablement (ONE-14) are needed before the first shop order | 3–5 merchants in one town; substitution consent, timeouts and weighted totals verified; failed delivery, goods return and refund drilled; the cash ceiling holds; the NFR-11 licensing review is done before the first shop order; merchant ledger balances daily and a first payout is made |
| **Unphased rows** | Rows not named above (for example CON, the rest of ONE, ADM, NFR) belong to Phase 2 unless their gate places them later; each implementation PR names its phase. | — |
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
  → ready → merchant pickup code → delivery code → cash → merchant settlement entry. Merchant reject and accept-timeout
  paths; consent timeout; no-captain wait/cancel; failed delivery → return code; refund; cancel windows (§4.3a).
- **Cross-service:**
  - A captain with two parcels cannot take a ride.
  - The cash cap counts parcel and shop cash together.
  - A promo for shipping is refused on a ride.
  - Three active orders show three distinguishable notifications.
  - A disabled line is invisible.

---

## 19. Traceability summary

These counts come from the `St` column of every requirement row above (235 requirements). The conflict
rules CON-01..10 (§2.2) have no St column and are not counted; their implementation is tracked through the rows that
enforce them. "No build" covers rows
marked "—" or "gated": rules that forbid a feature, or items that wait on an outside dependency. Every E and E-off row
was checked against the code at `1c3100a` (16 Nov audit); baseline `fb05483` has the same `src/`, `server/`,
`scripts/` and `tests/`.

| Area | Total | Exists (E) | Exists, off (E-off) | Partial (P) | New (N) | No build |
|---|---|---|---|---|---|---|
| ONE one-app rules | 14 | 2 | 0 | 12 | 0 | 0 |
| ACC account | 12 | 4 | 2 | 5 | 1 | 0 |
| ADDR addresses | 8 | 3 | 0 | 3 | 2 | 0 |
| HOME home | 6 | 1 | 0 | 3 | 2 | 0 |
| BOOK booking | 8 | 1 | 0 | 7 | 0 | 0 |
| TRK tracking and after | 13 | 4 | 0 | 6 | 3 | 0 |
| RIDE | 12 | 0 | 6 | 4 | 2 | 0 |
| SHIP shipping | 19 | 5 | 1 | 4 | 9 | 0 |
| DLV delivery | 25 | 0 | 1 | 0 | 24 | 0 |
| MER merchant | 9 | 0 | 0 | 1 | 8 | 0 |
| DRV captain | 18 | 6 | 1 | 8 | 2 | 1 |
| MAP | 11 | 1 | 1 | 8 | 1 | 0 |
| PAY | 9 | 2 | 0 | 3 | 1 | 3 |
| DES design | 14 | 5 | 0 | 7 | 2 | 0 |
| A11Y accessibility | 27 | 4 | 0 | 18 | 4 | 1 |
| NTF notifications | 5 | 1 | 0 | 3 | 1 | 0 |
| SUP support | 2 | 1 | 0 | 1 | 0 | 0 |
| ADM operations | 12 | 2 | 1 | 5 | 4 | 0 |
| NFR | 11 | 4 | 0 | 6 | 0 | 1 |
| **Total** | **235** | **46** | **13** | **104** | **66** | **6** |

Delivery and merchant (32 new) is the largest block of new work. Ride exists mostly in code but is off
(6 E-off) behind G-RIDE and G-PG. Shipping is mostly built: what remains is the one-app shell (ONE, mostly
partial) and hardening.
