# Wind feature-integration master plan — 15 November 2026

Baseline: `origin/master` 7748234 (worktree `C:\w\wind-plan`). Master has since moved past it: PR #35 (expo patch versions) and PR #36 (admin exact cash, bcc0c97) are MERGED, and PR #34 (driver cash cap) is already inside 7748234 (merged). In review (open): #38 (admin subscriptions review), #39 (WP-06 large text), #40 (WP-03 blocked account told at sign-in). Production: Azure VM `wind-vm`, **SQLite**, `WIND_ENABLED_SERVICES=parcel`
(`docs/operations/deploy.md` "Production host on Azure"; `server/domain/eligibility.ts:58`). Cash only. Ride and freight code exists and is off.
Companion page: `docs/REA/2026-11-15-competitor-apps-vs-wind.md` (mechanism table). This page widens it to every feature, adds a mock/demo audit and
the work packages. Nothing here was run; every "Wind has it" claim was read in code at the cited line. `[inferred]` marks a judgement, not a read.

## 0. How to read this

**Sources (short keys).**
- Demos, `C:\Users\osama\OneDrive\Documents\wind-competitors\`: **D-UB** `wind-comp-uber` (WindRide), **D-CA** `wind-comp-careem` (WindCaptain), **D-HA** `wind-comp-haat` (WindBazaar), **D-SH** `wind-comp-shiply` (WindParcel), **D-SQ** `wind-comp-souq` (WindMarket); each `HANDOFF.md §n`. **FM** = `FABLE-MISSION-ADDENDUM.md`.
- Real-app studies, `research_notes\REA-2026-11-13-reference-apps\`: **R-UB** `UBER-4.655-rider.md`, **R-CA** `CAREEM.md`, **R-HA** `HAAT.md`, **R-HD** `HAAT-DRIVER.md`, **R-SH** `SHIPLY.md`, **R-SQ** `SOUQ-TULKARM.md`, **R-PAL** `PALESTINIAN-COMPETITORS-INDEX.md`. **ATL** = `reports\Competitor feature implementation atlas.md`.
- The demos are original public demos with an in-process fake server, fixture captains and "payment recorded" labels (each HANDOFF §8, "public-demo boundary"). Their value is the mechanism, not the data: nothing is copied, and no fixture is imported.
- The atlas (13 Nov) was written against an older tree; where it says ABSENT and master has since landed the feature, the matrix says DONE with the line.

**Priority, cash-only West Bank launch.** P0 = blocks opening beyond known users, or protects money/identity. P1 = high launch value. P2 = quality after launch. P3 = later or owner-gated.

**Status.** DONE (file:line), PARTIAL (what is missing), MISSING, N/A (reason).

**Count (section A, 131 features; C-16 and P-02 merged):** DONE 79 · PARTIAL 25 · MISSING 15 · N/A 12 · IN PROGRESS 0. By priority: P0 26 · P1 42 · P2 32 · P3 19 · none (N/A) 12.

**Cross-cutting fact that changes many rows (read once).** Eleven modules answer "unavailable" unless the database is PostgreSQL, and production is SQLite:
`commands.ts:11`, `dispatch.ts:41`, `eligibility.ts:33`, `events.ts:35`, `ledger.ts:15`, `presence.ts:27`, `quotes.ts:9`, `resource-scope.ts:30`, `ride-lifecycle.ts:25`, `payments.ts` (gate), `private-objects.ts` (gate). Anything below marked "PG-only" is not live in the pilot. The dialect cutover is an owner decision outside this plan (ATL §23.1); packages say when they depend on it.

---

## A. Feature inventory matrix

Columns: **ID** · feature · competitor(s) and source · how they do it · **Wind status** · what "real, no mock" needs · priority.

### A1. Customer: booking, addresses, search, scheduling

| ID | Feature | Competitor / source | How | Wind status | Real, no mock needs | Pri |
|---|---|---|---|---|---|---|
| C-01 | Map-first home, "where to", recents | UB D-UB §2 `index.tsx`; R-UB; D-CA §2 | Home is a map with saved + recent places and an active-order resume card | DONE `src/app/(customer)/index.tsx` (`c.whereTo`, `c.recent`, active order card); recents from `server/main.ts:1048` | Real places from own index | P1 |
| C-02 | GPS pickup ("use my location") with contained failure | D-UB §4; D-CA §5; D-HA §5 | `expo-location`; permission failure returns null, busy state resets | DONE `src/customer-location.ts`, `src/app/book.tsx` (`c.useLocation`); A53 verified (gap page) | none | P1 |
| C-03 | Confirm pin on a real map; a town tap forces a pin | D-UB `pickup.tsx`; R-CA §4; R-HA §11.1 | Pin confirm, not geocode trust | DONE `src/pin-sheet.tsx`, `src/app/book.tsx:228` | none | P1 |
| C-04 | Landmark-first address (no street numbers) | D-HA §2; D-SQ; R-SQ F-01; R-HA §11.1 | Free-text landmark plus structured area | DONE `src/app/book.tsx:59,155,788` (landmark kept with its place, saved under "Save to my places") | none | P1 |
| C-05 | Saved places Home/Work/Other and recents | D-UB; D-CA `address.tsx`; R-CA §4 | Per-user list, one tap reuse | DONE `server/main.ts:1048-1066`, `server/db/sqlite-schema.ts:105`, `src/app/book.tsx:794` | none | P1 |
| C-06 | Address book as its own screen: rename, edit, delete | D-CA §2; R-CA §4 (`AddressBookActivity`); R-HA §4 | Nickname, edit, delete outside the booking flow | PARTIAL: add/forget only inside booking (`src/app/book.tsx` `c.forgetPlace`); no edit/rename; no `PATCH /api/me/places/:id` | Account → My places screen; PATCH route; tests | P2 |
| C-07 | Building type + delivery notes per address | R-CA §4 (`MapAndAddress_BuildingType`, `_DeliveryNotes`); D-CA §2 | Taxonomy + note on the saved address | MISSING (landmark text only) | Two nullable columns on `saved_places`; picker; show to driver | P2 |
| C-08 | Entrance/door photo on an address, shown to driver | R-CA §4 (`_AddDeliveryPhoto`); D-CA §5 `expo-image-picker` | Photo attached to address | MISSING; `private-objects.ts` is PG-only and rejects with no store | Object storage (S3/Blob), virus scan, retention, PG cutover: BLOCKED-EXTERNAL | P3 |
| C-09 | Zone-first address with per-zone fee and minimum | R-SQ F-01/F-02; ATL §2 | Zone is a structured choice that drives fee and deliverability | PARTIAL: city list `src/model.ts:3`, 20 km shortcut `:202`, flat price `:222` | Zone table + fees only if owner drops the flat ₪20 policy | P3 |
| C-10 | Delivery windows with a daily capacity cap | R-SQ F-02 ("windows full"); R-SH planned dates | Window per zone/day; cap per window | PARTIAL: scheduled pickup time only (`src/app/book.tsx:660`, `server/main.ts:1930`, release gate `eligibility.ts:61`); no capacity | Capacity table + "full" state; needs owner policy | P3 |
| C-11 | Scheduled booking and rescheduling | R-SH (planned dates); D-HA windows | Later time, hidden from drivers until due | DONE `src/app/book.tsx:652-660`, `server/main.ts:1930` | none | P1 |
| C-12 | Recipient name/phone; share a tracking link to the recipient | D-SH §2 `create.tsx`; R-UB Connect | Recipient fields; link via WhatsApp | DONE `src/app/book.tsx` (`c.recipientName`, `c.recipientPhone`), `src/app/order/[id].tsx:570-576` | none | P1 |
| C-13 | Favourite recipients | R-SH F-01 (`create-parcel/edit-favourite-recipient`, `recipient/`) | Saved recipients list | MISSING | `saved_recipients` table, picker in booking | P3 |
| C-14 | Order again / send another | D-SQ `orders/repeat-last` (R-SQ F-14); R-SH | One tap copy of last order | DONE `src/booking.ts:56,71`, `src/app/order/[id].tsx:552-555`, `src/app/book.tsx:332` | none | P1 |
| C-15 | Parcel size/service options | D-SH §2; R-UB `connect_checkout_delivery_item_size_details` | Size tier changes the price | PARTIAL: `optionsFor` `src/model.ts:84`, `parcelFare :222`; no weight, no declared value | Declared value only if COD or cover is built (P-02) | P3 |
| C-16 | Goods COD (Pay / Buy / Return / Replace): collect from recipient, remit to sender, resolve | R-SH F-03/F-04; D-SH §2; R-SQ F-03 | Parcel flagged as payment parcel; expected, collected, remitted states | PARTIAL, dead in prod: server code `server/domain/payments.ts:158-190,198-201` is PG-only and answers 409 on SQLite; no booking field or client screen; return exists only after a failed delivery (`server/main.ts:2450-2459`) | Owner decision (is goods-COD in scope); then SQLite port and client (WP-16) | P2 |
| C-17 | Outside-service-area message | D-UB §3 (`no_captains`); R-UB `connect_delivery_radius_error_message` | Typed rejection | DONE `src/app/book.tsx` `c.pinOutsideArea`, `src/model.ts:203` | none | P1 |
| C-18 | Quote shown before confirm; quote usable once; create is idempotent | D-UB §3; FM §7; D-HA §3 | Server prices; stable client request id; no create retry | DONE `server/main.ts:1395,1515` (`quote_consumed`), `:1685` | none | P0 |
| C-19 | Promo code at the payment step | R-HA §5 (coupons at payment); R-CA PROMO strings | Code applied before confirm | DONE `src/app/book.tsx:754`, `server/main.ts:1100,1155-1166` | none | P2 |
| C-20 | Referral code and credit | R-HA §6 (`referAndEarn`) | Code, reward on first completed order | DONE `server/main.ts:1139`, `rewardReferral` call `:2463`; install attribution is N/A (AppsFlyer is skipped by ATL S7) | none | P2 |
| C-21 | Account credit used at checkout | R-CA §5 (`CREDIT`) | Credit offsets fare | DONE `src/app/book.tsx` `c.useCredit`; credits from disputes `server/main.ts:2042` | none | P2 |
| C-22 | Cash-only label and cash copy (exact cash, no change) | R-UB §4.7 (`cash_change_plus_one_title`); R-CA §5; R-HA §4 | States cash before booking; "driver gives no change" | PARTIAL: `youPayCash` `src/copy.ts:605`, "cash" step in booking; no no-change reminder | Copy only (own words, ar+en) | P2 |
| C-23 | Ride tiers, comfort surge | D-UB §2 `options.tsx` | Tier cards, surge line | N/A: production is parcel-only; ride pricing exists (`src/model.ts:231-262` smart price) and is off | Owner gate for ride | — |

### A2. Customer: tracking, order lifecycle, trust

| ID | Feature | Competitor / source | How | Wind status | Real, no mock needs | Pri |
|---|---|---|---|---|---|---|
| T-01 | Live driver position that degrades honestly | R-SQ F-11; D-UB `tracking.tsx`; D-HA §5 | Last fix time, "tracking paused" instead of stale pin | DONE `server/main.ts:1898,2612`, `src/app/order/[id].tsx` (`c.updatesPaused`, `c.driverSignalWeak`) | none | P0 |
| T-02 | Road-aware ETA with a range | R-UB (ETA range+validity); D-UB §3 | ETA range with validity | DONE `server/main.ts:2895,2917`, `src/app/book.tsx:398-406` | none | P1 |
| T-03 | ETA ladder "less than N minutes" | R-HA §4 | Exact, then "<3/<5/<10" | MISSING (`minutesShort` only) | Copy + one helper | P2 |
| T-04 | Human, actor-named states with next step | R-HA §4; D-HA §3 | "Driver at pickup", per-role next step | DONE `src/copy.ts:358-384,502-506` | none | P1 |
| T-05 | Driver-nearby alert | R-HA; D-UB notifications | Push/message at distance | DONE `src/copy.ts:478` (`driverNearby`, shown in `src/app/order/[id].tsx`) | none | P2 |
| T-06 | Public share-tracking link, no login | D-UB §4 (share summary); R-SQ | Tokenised page | DONE `server/main.ts:1986-1999`, `src/app/track/[token].tsx` | none | P1 |
| T-07 | Call the driver / customer | R-HA §4 ("تواصل مع السائق"); D-HA §5 | `tel:` action | DONE `src/app/order/[id].tsx:838`; number masking N/A (needs a telecom contract) | none | P1 |
| T-08 | In-app chat anchored to the order | R-SQ F-12; ATL §18 | Messages on the order | DONE `server/main.ts:2130-2135`, `src/app/order/[id].tsx:816` | none | P2 |
| T-09 | Canned replies and message hiding by admin | R-SQ F-12 | Quick replies; `redact` | PARTIAL: quick replies exist (`src/app/order/[id].tsx:753` defines `quickReplies`, `:810` renders and sends them); missing only the admin redact (`order_messages` plain) | Admin redact route | P3 |
| T-10 | Cancel before pickup, driver told | all five demos | Cancel only in early states | DONE `server/main.ts:1910-1925` | none | P0 |
| T-11 | Cancel/no-show fee | R-SH (`same_day_cannot_revert_parcel`); R-CA arrears | Fee or arrears after assignment | N/A: no in-app way to collect a customer debt (see D-section); ATL X4 | Owner decision after P-04 | — |
| T-12 | Change destination with the driver's consent | D-UB (change leg); SPEC-change-destination | Propose, driver accepts, fare recomputed | DONE `server/domain/destination-change.ts`, `src/destination-change.tsx`, `src/app/order/[id].tsx:16` | none | P1 |
| T-13 | Rate driver (stars + price) and rate customer | D-UB `rate.tsx`; R-HA §4 | Rating by order id | DONE `server/main.ts:1942`, `src/app/order/[id].tsx:855`, `server/domain/statistics.ts:7` | none | P1 |
| T-14 | Tip | D-UB `rate.tsx` (`tipCents`) | Amount stored with rating | N/A: cash-only; an in-app tip would be unrecorded cash. Drivers may be tipped by hand | none | — |
| T-15 | Itemised receipt, cancelled = no charge | D-UB `receipt.tsx` | Per-trip receipt | DONE `src/app/receipt/[id].tsx` (cancelled never shows earnings `:21`), `server/domain/booking-receipts.ts` | none | P1 |
| T-16 | Order history, resume the active order | D-UB `activity.tsx`; D-HA `orders.tsx` | Server history; separate empty states | DONE `src/app/(customer)/orders.tsx`, `src/model.ts:65` (`HISTORY_PAGE`), `src/offline-recovery.ts` | none | P1 |
| T-17 | Report a problem and get a credit | R-SQ F-13; D-SQ admin review | Dispute, admin decision | DONE `server/main.ts:2024-2062`, `src/app/order/[id].tsx:584` | none | P1 |
| T-18 | Safety report with emergency call | D-UB §2 (`tel:100`) | Dialer + report | DONE `server/main.ts:2071-2100`, `src/app/order/[id].tsx:711-735` | none | P1 |
| T-19 | Pickup PIN checked by the driver | R-CA §10.3 ("Enter Customer Pin"); R-HD ("Pickup code") | Driver enters code to start | PARTIAL: ride boarding PIN exists (`server/domain/ride-lifecycle.ts`, `src/ride-flow.ts:20`) but PG-only and ride is off; parcel pickup has no code | Parcel `pickup_code` on the sender screen (WP-17) | P2 |
| T-20 | Delivery proof code, 5-strike lockout, audited admin reset | R-SQ F-07; D-SQ §3; R-CA PIN | Customer-held secret | DONE `server/main.ts:2450-2459` (`proof_locked`), `:3114`; `src/app/order/[id].tsx:249,506` | none | P0 |
| T-21 | QR form of the proof | R-SQ F-07 (`deliveryQrToken`); R-SH F-08 | QR beside the code | MISSING | Token + scanner permission; demos removed fake QR on purpose (D-SQ §4) | P3 |
| T-22 | Typed delivery failure reasons then admin review | R-SQ F-08 (8 reasons); D-SQ §3; D-SH | Reason, `on_hold`, admin decides | DONE (WP-09, #61): 7 reasons in `src/model.ts` (absent, refused, unreachable, wrong_address, rescheduled, access_blocked, damaged) with a suggested next action; cash reasons (did_not_pay, incorrect_cash, partial_payment) live in A11 door-cash variance, not here | Extend list + validation + copy + admin labels | P2 |
| T-23 | Return to sender with return code | R-SQ F-08; D-SH | Return leg, sender code | DONE `server/main.ts:2450-2459`, `src/copy.ts:380-383` | none | P1 |
| T-24 | Handoff hints (leave at door / call on arrival) | R-UB §Connect `add_pickup_placeholder` [inferred] | Pre-set instruction chips | MISSING | Chips + one text field on the order | P3 |
| T-25 | Edit order before dispatch | R-HA §5 ("تعديل الطلبية") | Edit until sent | PARTIAL: reschedule (`server/main.ts:1930`) and destination change only; recipient/note not editable | PATCH for note/recipient while `searching` | P3 |
| T-26 | Baskets: weights, substitutions, minimum, service-fee line | D-HA §4; D-SQ; R-HA §5 | Shop cart logic | N/A: Wind carries parcels, not shop baskets | Only with a shop service (A-16) | — |
| T-27 | Customer arrears blocks a new cash booking | R-UB §4.7; R-CA §5 (`cashBookingNotAllowedMessage`) | Unpaid balance blocks next booking | N/A: the customer pays the driver in hand, Wind holds no customer debt | Exists only if T-11 fees are created | — |

### A3. Driver

| ID | Feature | Competitor / source | How | Wind status | Real, no mock needs | Pri |
|---|---|---|---|---|---|---|
| D-01 | Driver signup, vehicle, plate, pending approval | R-CA §10; D-SQ §3 shift validation | Admin approves before work | DONE `src/app/auth.tsx`, `server/main.ts:645,3266`, `src/app/driver/index.tsx:175` | none | P0 |
| D-02 | Driver told when blocked, approved, unblocked | R-SQ F-13 (`ACCESS_BLOCKED`); R-CA | Push + reason | PARTIAL: approval pushes exist (`server/main.ts:3261` in `editUser`; `:3283` in the approve route, `queuePush 'approved'`). Gap is the block path: `:3252` writes `COURIER_BLOCKED`, `:3258-3259` push only to customers; the blocked driver gets no push, no role-change notice, no blocked message at sign-in (PILOT.md "they are not told") | Block/role-change push kind + a blocked message at sign-in; auth-adjacent | P1 |
| D-03 | Identity verification by the admin | R-SQ F-13 (OTP, seller verification) | Admin checks and records | DONE `server/main.ts:3341-3357` | none | P1 |
| D-04 | Licence/insurance document upload with expiry | R-CA (docs) [inferred]; D-SQ vehicle validation | Upload + review | MISSING; storage PG-only (`private-objects.ts`) | Object storage + dialect: BLOCKED-EXTERNAL | P3 |
| D-05 | Online/offline with location-health | R-SQ F-11 (`location-health`); R-HD §2.5 | Presence, battery, permission | PARTIAL: `presence.ts:27` PG-only so SQLite pilot has no presence; job-time GPS only (`server/main.ts:2612`); client `src/driver-presence*.ts` waits for it (`server/main.ts:534-537`) | Either PG cutover or an SQLite presence table | P2 |
| D-06 | Booked shifts with capacity | R-HD §2.1; R-CA §10.3 | Register for slots | N/A: 50-user pilot needs every driver available (R-CA §10.4) | — | — |
| D-07 | Shift-scoped cash close | R-SQ F-04/F-06 (`SHIFT_SETTLED`) | Cash settled per shift | MISSING: Wind keeps a running per-driver balance | Owner decision; running balance + cap already covers exposure | P3 |
| D-08 | Job board, paged | R-SQ F-04 (`ready-queue`); R-HD | Driver picks from ready work | DONE `server/main.ts:2242-2288`, `src/app/driver/index.tsx` (`c.jobsNextPage`) | none | P0 |
| D-09 | Timed offers, accept/decline with limits | R-HD §2.2; R-CA §10.3 | Countdown, rejection limits | PARTIAL: ride dispatch offers `dispatch.ts:41` PG-only, off; parcels use the open board | Ride activation later | P3 |
| D-10 | Release a job back | R-HD (release shift/job) [inferred] | Driver gives job back | DONE `server/main.ts:2411`, `src/app/order/[id].tsx:542` | none | P1 |
| D-11 | Several parcels at once | D-SH §3 (one job) contrast | Batch carry | DONE `src/model.ts:227` (`PARCEL_LOAD`), `canTake :228` | none | P1 |
| D-12 | Run sheet by city | R-SQ F-04 ("sorted by zone") | Pickup, deliver, return order | DONE `src/app/driver/trips.tsx:3,20`, `src/model.ts:312` | none | P1 |
| D-13 | Navigate in an external map app | R-SQ F-11 (maps URL) | Deep link | DONE `src/app/order/[id].tsx:686` | none | P1 |
| D-14 | Step advance with idempotent command and lost-ack replay | all five demos | Request id per command | DONE `server/main.ts:2530-2566` (`order_actions`) | none | P0 |
| D-15 | Amount collected at the door plus variance reason | R-SQ F-03 (`amountCollectedCents`, `discrepancyReason`); D-SH `CollectPanel`; D-SQ §4 | Driver types amount, difference needs a reason | MISSING: cash is display-only (`src/app/driver/index.tsx:262`, `src/copy.ts:607`); no stored amount or reason | Nullable columns, validated on `completed`, shown to admin and in disputes (WP-01) | P1 |
| D-16 | Cash owed, handover, confirm/dispute, append-only | R-SQ F-06; D-CA §4; R-CA §10.2 | Entries are never edited | DONE `server/main.ts:3015-3035`, `server/db/sqlite-schema.ts:128-132` (triggers), `src/app/driver/earnings.tsx:61-68` | none | P0 |
| D-17 | Cash cap blocks new work | R-CA §10.2; Wolt, Cedar GO, Upzaar (gap page) | Cap on what the driver may owe | DONE `server/main.ts:2991-3004`, `src/model.ts:98` (₪150); board, offers, accept all check | Field-tune the amount | P0 |
| D-18 | Warning before the block (amber state) | KOHME (gap page) | Warn at a threshold | PARTIAL: "left before limit" `src/app/driver/earnings.tsx:61`; no push or board banner at 80% | Threshold + push (WP-12) | P2 |
| D-19 | Time limit on held cash | Wolt weekly (gap page) | Handover due date | MISSING (gap page: add if handovers drift) | `driverCashMaxDays` setting + guard (WP-12) | P2 |
| D-20 | Earnings today / week / all | R-CA §10.1; R-HD §2.4 | Summary cards | DONE `server/main.ts:2958`, `src/app/driver/earnings.tsx` | none | P1 |
| D-21 | Earnings as an explained statement (line items) | R-CA §10.1 (`breakdown_*`) | Money in/out per line | PARTIAL: gross, commission, net, promo credits, cash entries; no per-job statement | Per-job list route + screen (WP-15) | P2 |
| D-22 | Customer rating shown before accepting | D-CA §3; SPEC-customer-rating | Rating chip on the offer | DONE `src/app/driver/index.tsx` (`c.customerStars`) | none | P2 |
| D-23 | Driver destination ("heading to") | R-UB (driver filter) [inferred] | Prefer jobs toward a place | DONE `server/main.ts:914`, `src/app/driver/index.tsx:228` | none | P3 |
| D-24 | Background GPS with filters; mock location rejected | R-SQ F-11; D-UB §4 | Foreground service, filters | DONE `src/background-location.ts`, `src/driver-presence.ts:170`, `src/location-delivery.ts:43` | none | P0 |
| D-25 | Battery/permission health shown to the dispatcher | R-SQ F-11 (`LOW_BATTERY`) | Health ping | MISSING (no battery signal anywhere; stale-GPS only) | Add to `/api/location` body, show on admin order | P3 |
| D-26 | Acceptance-rate gating, rejection limits | R-CA §10.3; R-HD §2.2 | Penalty for declining | N/A: R-CA §10.4 advises against for a pilot | — | — |
| D-27 | Pickup/delivery photo proof | R-CA (`_AddDeliveryPhoto`) | Photo at the door | MISSING; storage PG-only | Object storage: BLOCKED-EXTERNAL | P3 |
| D-28 | Custody scans, hub in/out, driver-to-driver transfer | R-SQ F-04/F-05; D-SH §4 | Scan chain | N/A: point-to-point courier, no hubs (gap page) | — | — |
| D-29 | Sees no customer code or other customers' data | R-SQ F-04 | Role-scoped payloads | DONE: handover code only to owner (`server/main.ts:310`, `handoverCode: owner ? ... : null`), role-scoped `getOrder :392` | none | P0 |
| D-30 | Driver signup alert to admin | SPEC-driver-signup-alert | Push to admins | DONE `server/main.ts:504,673` (`queuePush(adminIds,'attention')` on driver registration) | none | P2 |

### A4. Admin and merchant

| ID | Feature | Competitor / source | How | Wind status | Real, no mock needs | Pri |
|---|---|---|---|---|---|---|
| A-01 | Dashboard (volume, commission, stuck orders, backup warning) | R-SQ ("admin pulse"); D-SQ | Counters + alerts | DONE `server/main.ts:3129`, `src/app/admin/index.tsx` | none | P1 |
| A-02 | Users: search, approve, block, edit, delete | R-SQ F-13; D-SQ §6 | Admin console | DONE `server/main.ts:3166-3315`, `src/app/admin/users.tsx` | none | P0 |
| A-03 | Password reset with identity attestation | R-SQ F-13 (reset) | Admin writes what they checked | DONE `server/main.ts:3297-3357`, `src/app/admin/users.tsx` (`c.resetAttestation`) | none | P1 |
| A-04 | Orders: cancel, resolve exception, proof reset | R-SQ F-07/F-08 | Admin escape hatches | DONE `server/main.ts:1910,2500,3114`, `src/app/admin/orders.tsx` | none | P0 |
| A-05 | Manual dispatch: admin assigns or reassigns a driver | R-SQ F-14 (`/admin/dispatch/assign`); D-SQ admin role | Admin picks the driver | MISSING: no admin assign route (route list `server/main.ts:1864-2530`). The only nearby route is `POST /api/orders/:id/dispatch/retry` (`server/domain/dispatch.ts:371`), which re-runs dispatch and is PostgreSQL-only (gate `dispatch.ts:41`); PILOT.md watches "orders stuck searching" with no remedy in the pilot | Route that reuses cash-cap, load and eligibility guards (WP-02) | P1 |
| A-06 | Fleet view: drivers online, last fix | R-SQ F-14 (`/admin/fleet`) | Map/list | PARTIAL: per-order driver location (`src/app/admin/orders.tsx` `c.openLocation`); no fleet list | Needs presence (D-05) or last `driver_locations` row | P2 |
| A-07 | Disputes and incidents queues with credit | R-SQ F-12/F-13 | Admin resolves with reason | DONE `server/main.ts:2035-2062,2090-2120`, `src/app/admin/orders.tsx` | none | P1 |
| A-08 | Cash: record handover, adjust, resolve pending | R-SQ F-06; D-SQ §4 | Append-only, admin-only count | DONE `server/main.ts:3038-3094`, `src/app/admin/cash.tsx` | none | P0 |
| A-09 | Exact-decimal cash amount parsing in admin | — | Integer cents from text | DONE (PR #36, bcc0c97, merged) | none | P1 |
| A-10 | Audit log viewer | R-SQ F-06 (`GET /admin/audit`) | Read-only event list | MISSING: `security_events` is written throughout (`server/main.ts:2453,2477,3238`), no read route | `GET /api/admin/audit` + screen (WP-13) | P2 |
| A-11 | Settings: prices, commission, cap | R-SQ (admin zones/fees); D-SH §4 | Server-held numbers | DONE `server/main.ts:3392`, `src/app/admin/settings.tsx`, `src/model.ts:89-125` | Owner confirms the numbers (B-11) | P0 |
| A-12 | Promo and referral admin | R-HA §5 | Create/deactivate | DONE `server/main.ts:1155-1166`, `src/app/admin/settings.tsx` | none | P2 |
| A-13 | Plus/Pro subscriptions, manual activation | R-CA (Plus); D-CA | Plan request, admin activates | DONE `server/main.ts:3097-3113,3357-3392`, `src/app/admin/subscriptions.tsx`; payment is by contacting support (`src/copy.ts:311`), by design | none | P2 |
| A-14 | Road/checkpoint status reports | Palestinian-specific (R-PAL) | Crowd + admin | DONE `server/main.ts:2173-2240`, `src/app/roads.tsx` | Field-verify seed list `:2204-2215` (B-07) | P1 |
| A-15 | Partner API (Souq) | R-SQ; D-SQ | Keyed external orders | DONE `server/main.ts:1779-1860` (`SOUQ_PARTNER_KEY`) | Partner key issued | P2 |
| A-16 | Merchant console: shop creates orders, sees status, COD remit | R-SQ F-14 (packing, catalogue); R-SH F-12 | Shop-side app | MISSING | Owner decision on a merchant segment; partner API (A-15) is the base | P3 |
| A-17 | Support tickets with comments/history | R-SH F-01 (`tickets/*`) | Ticketing | N/A: disputes (T-17) + WhatsApp support (`src/api.ts:19-21`) cover pilot volume (ATL S10) | — | — |
| A-18 | Catalogue, packing station, B2B vendors | R-SQ F-14; R-SH F-12 | Shop back office | N/A: ATL S3 | — | — |

### A5. Cash and payments

| ID | Feature | Competitor / source | How | Wind status | Real, no mock needs | Pri |
|---|---|---|---|---|---|---|
| P-01 | Cash only, stated before booking | R-UB §4.7; R-CA §5; R-HA §4 | "Cash only" label | DONE `src/copy.ts:605` (`youPayCash`), `src/app/book.tsx` (`c.payWith`, `c.cash`), welcome `c.cash` | none | P0 |
| P-03 | Append-only cash entries | R-SQ F-06 | Triggers/no edits | DONE `server/db/sqlite-schema.ts:60,128-132` | none | P0 |
| P-04 | Balanced double-entry journals | R-CA §10.1; R-SQ F-06 | Debits=credits | PARTIAL: `postOrderJournals` is called (`server/main.ts:2464`) but `ledger.ts:15` is PG-only | PG cutover (owner) | P3 |
| P-05 | Commission and discount visible in the total | D-SH §4; R-HA §5 | Itemised | DONE `src/app/receipt/[id].tsx` (`c.commission`, `c.promoDiscount`), `server/main.ts:2459` | none | P1 |
| P-06 | One stable code + one specific bilingual sentence per refusal | R-CA §11.3 | Error catalogue | DONE: `err_*` keys `src/copy.ts` (e.g. `:994,1016,1272`) and typed `fail(...)` codes | none | P1 |
| P-07 | Idempotent writes, lost-ack replay, offline outbox | R-SQ F-10; D-UB §3 | Key per write, queue offline | PARTIAL: booking recovery (`src/app/book.tsx` `c.bookingRecovery*`, `src/offline-recovery.ts`), driver replay (`server/main.ts:2536`), customer replay; general durable protocol is PG-only (`commands.ts:11`); no offline queue of driver writes | Decide which driver writes may queue; replay tests | P2 |
| P-08 | Cards, wallets, PSP, refunds | R-SH F-03/F-04; R-CA §5 | Card rails | N/A: out of scope (section D) | — | — |
| P-09 | Driver commission tiers (Pro lower rate) | R-CA (Plus) [inferred] | Plan changes commission | DONE `server/main.ts:2459`, `src/model.ts:82,98` | none | P2 |

### A6. Notifications, maps, accounts, support, platform

| ID | Feature | Competitor / source | How | Wind status | Real, no mock needs | Pri |
|---|---|---|---|---|---|---|
| N-01 | Web push | SPEC-web-push (own) / R-SQ PWA | VAPID | DONE `server/main.ts:1333-1347`, `public/sw.js` | none | P2 |
| N-02 | Native push with a high-importance channel | R-SH F-09 (Notifee+FCM) | FCM data + channel | DONE `src/native-push.ts:36`, `server/push.ts:68`, `server/domain/native-push.ts` | Firebase project named `wind-development` is used in prod (PILOT.md) | P0 |
| N-03 | One channel per event class | R-SH F-09; ATL §13 | Offer vs status vs cash | PARTIAL: one `default` channel (`src/native-push.ts:36`) | New channel ids + server mapping + forced-upgrade build (WP-10) | P2 |
| N-04 | Stale push token pruning | R-SH F-09 | Receipts | PARTIAL: `server/main.ts:1249` reads the send ticket only | Expo receipts job | P3 |
| M-01 | Real map, no blank map | all five demos (§10 of each) | Fail-fast key, fallback | DONE `src/map-provider.ts`, `public/map.html`, `app.config.js` (baseline MapLibre/OpenFreeMap, no key) | none | P0 |
| M-02 | Route line and ETA on the map | D-UB §2 | Polyline | DONE `src/route-map*.tsx`, `server/main.ts:2895` | none | P1 |
| M-03 | Smooth driver marker | D-UB §2 `geo.ts` | Interpolation | DONE `src/map-math.ts` | none | P2 |
| M-04 | Place search over Palestine (AR/EN) | R-HA §4 (Places); D-UB `search.tsx` | Search + recents | DONE `server/domain/place-index.ts`, `place-search.ts`, `server/data/places-ps.json.gz`, `src/trip-search.tsx` ("bireh" fixed, #32) | none | P0 |
| M-05 | Pin label (reverse) | D-UB §4 | Name under the pin | DONE `src/pin-sheet.tsx`, `src/app/book.tsx:58` | none | P2 |
| S-01 | Phone + password sign-up/in, Arabic and English | R-SQ F-13 | Account | DONE `server/main.ts:645,689`, `src/app/auth.tsx` | none | P0 |
| S-02 | Verified phone (SMS code) | R-SQ F-13 (`auth/otp/*`); R-CA | OTP | PARTIAL: built (`server/domain/phone-identity.ts`, `phone-provider.ts`, `src/phone/*`, `src/phone-card.tsx`) but off (env reads `phone-provider.ts:10-34`; `WIND_PHONE_ENABLED` gate `:34`, production refusal `:10`) | SMS provider contract, sender id, approved prefixes, daily budget, evidence ref: BLOCKED-EXTERNAL | P0 |
| S-03 | Verified email, reset by email | R-SQ F-13 | Code by email | PARTIAL: `server/main.ts:753` (`emailReady`), `:829-905`; sending needs a domain | Sending domain on Cloudflare (or other): BLOCKED-EXTERNAL | P1 |
| S-04 | Delete account in app and on a public page | R-SQ F-13 (`deletion-request`) | Request + page | DONE `server/main.ts:1012`, `server/account-deletion.html`, `src/parts.tsx:417-429` (delete card) | none | P0 |
| S-05 | Privacy and terms pages | R-SH §12 | Bilingual page | DONE `server/privacy.html`, `server/terms.html`, `src/api.ts:13-14`; legal review not done (PILOT.md) | Owner's legal review: BLOCKED-EXTERNAL | P1 |
| S-06 | Help, FAQ, WhatsApp support, feedback | R-HA §6 (Intercom skipped) | Support link | DONE `src/app/help.tsx`, `src/api.ts:19-21`; `EXPO_PUBLIC_SUPPORT_WHATSAPP` set (HANDOFF-2026-10-31 :73) | none | P1 |
| S-07 | Forced upgrade | R-SQ F-10 (`SESSION_CHANGED`) [inferred] | Server refuses old build | DONE `server/main.ts:3492` (426), `src/api.ts:23-24` | none | P1 |
| S-08 | Server-driven copy/config without a release | R-CA §8; R-HA §6 | Remote config | PARTIAL: numbers are server settings (`src/model.ts:89`); copy ships in the APK | Only if copy changes outpace APK cadence | P3 |
| S-09 | Large-text accessibility | all demos (none); WCAG | Scalable text | PARTIAL: X-01: `src/ui.tsx:200` caps `Txt` at 1.35 and `Button` text has no cap | Rework fixed-height layouts first (WP-06) | P1 |
| S-10 | Reduced motion | — | Respect system | DONE `src/motion.tsx`, `src/intro.tsx` | none | P2 |
| S-11 | Onboarding | D-HA; R-HA | Intro slides | DONE `src/app/welcome.tsx` | none | P2 |
| S-12 | Release hardening: no backup, no cleartext, no ad ids, no keys in repo | D-* plugins; ATL S5-S8 | Manifest | DONE `app.json:19` (`allowBackup:false`), `app.config.js:54-58` (HTTPS/retired host refusal) | none | P0 |
| S-13 | Role from server session, not a client toggle | FM §8 | Server auth | DONE session policy; `server/main.ts:413-415` (`needActive`) gates pending/blocked status and driver approval, role checks are `need` at `:412` | none | P0 |
| S-14 | Install link for iPhone/web | R-SQ (PWA) | Web app | DONE `public/install.html`, `src/install-link.tsx` | none | P2 |
| S-15 | Operational alerting, restore drill | ATL §22 | Alarms | PARTIAL: hourly GitHub uptime, per-minute VM watchdog and 03:10 UTC backup (`docs/operations/deploy.md` "Cron"); no alert-delivery proof (PILOT.md "Server down") | Owner's contact route + a delivered test alert + restore drill: BLOCKED-EXTERNAL | P0 |
| S-16 | Driver-facing ride boarding PIN, ride tiers | D-UB, R-CA | Ride | N/A while ride is off; code in `ride-lifecycle.ts` (PG-only) | Ride activation review (section D) | — |

---

## B. Mock/demo audit of production code (`src/`, `server/`, no tests)

A grep for mock, fixture, sample, dummy, fake, demo, TODO, stub, lorem, example.com found no placeholder screens, no hardcoded fake users or orders, and no stubbed UI.
Real data is real: `server/data/places-ps.json.gz` (OSM index), pilot checkpoints (`server/main.ts:2204-2215`). What it did find:

| # | file:line | Finding | Kind | Needed |
|---|---|---|---|---|
| B-01 | `server/domain/opencode.ts:1-102`, `server/main.ts:56,598-600`, `server/db/sqlite-schema.ts:204` | A developer-agent job runner (spawns a CLI) is registered in the production API. It refuses in production (`opencode.ts:25`) so it is a dead admin surface, not a mock | Dev tool in prod bundle | Remove from the production entry point (WP-21) |
| B-02 | `server/domain/payments.ts:19-33,192-201` | `FakePaymentsProvider` ships in the bundle; `/api/orders/:id/payments*` and `/cod*` routes are registered and answer 409 `payments_unavailable` on SQLite/prod. No client screen calls them | Test fake + unwired feature | Move the fake to a test-only module; decide COD (WP-16) or unregister routes (WP-21) |
| B-03 | `server/domain/private-objects.ts:37-44,154` | `fakeObjectScanner` and `InMemoryObjectStore` ship in the bundle; routes dead (no store configured, PG-only) | Test fake + unwired feature | Same as B-02; real store is BLOCKED-EXTERNAL |
| B-04 | `server/domain/ledger.ts:12-13`, `server/domain/eligibility.ts:21` | `PROJECTED_CASH_CAP_MINOR = 100000` (₪1,000) and `cashCapActivated: false` contradict the live cap `src/model.ts:98` (₪150, `server/main.ts:3000`); `eligibility.ts:21` holds a second copy (`projectedCashCapMinor: 100000`). Tests depend on them: `tests/activation-gates.mjs:2,8` imports `ledgerConfig` and asserts the values; `tests/ledger.mjs:64` builds a `Ledger` with the literal 100000 | Stale constant, two numbers | Delete or derive from settings (WP-21) |
| B-05 | `commands.ts:11, dispatch.ts:41, eligibility.ts:33, events.ts:35, ledger.ts:15, presence.ts:27, quotes.ts:9, resource-scope.ts:30, ride-lifecycle.ts:25` | Code paths that never run in the pilot (SQLite). Client code that depends on them: `src/driver-presence*.ts`, `src/ride-flow.ts`, `src/freight-details.tsx`, `src/phone/*` | Features not wired in prod | Owner dialect decision; until then label them in `docs/SYSTEM.md` as "off in production" |
| B-06 | `server/main.ts:1772-1776` | Partner customer is hardcoded as `partner:souq` / name "سوقنا" | Hardcoded partner | Parameterise by partner key when a second partner exists (A-15); leave for now |
| B-07 | `server/main.ts:2204-2215,3720` | 11 checkpoint coordinates (array `:2204-2215`) seeded by CLI only | Real data, unverified in the field | Owner/driver confirms each point before invite |
| B-08 | `server/main.ts:1249` | Push reads the send ticket only; stale tokens are never pruned (comment says add receipts when the pilot shows stale tokens) | Documented stub | N-04, P3 |
| B-09 | `src/model.ts:89-100` | Defaults `rideBase 15`, `ridePerKm 1.1`, `freight*`, `plusPrice 29`, `proPrice 99`, `nightExtra`, `perMinute` are guesses [inferred] (only `parcelPrice 20` and `driverCashCap 150` have owner/source). Admin-editable | Placeholder numbers | Owner confirms or sets under Settings before each service is switched on |
| B-10 | `src/model.ts:227,247,263` and 35 other `ponytail:` comments (`grep -c` = 38) | Deliberate shortcuts with a stated ceiling (e.g. `:1929` parcel reschedule ignores time; note `server/main.ts:758` is a `// shortcut:` fencing tag, not a `ponytail:` comment) | Known ceilings | Keep a ledger; not work items by themselves |
| B-11 | `src/copy.ts:311` | Subscription "contact support to pay" is a manual step, no receipt | Manual process | Acceptable for cash; record in `docs/PILOT.md` |
| B-12 | `app.config.js:19-33`, `src/phone-test.ts`, `plugins/with-phone-test.js` | Test credentials baked into a debug APK | Guarded: loopback `127.0.0.1:4191` only, refused for EAS/release | No change; WP-07 adds an ordinary-sign-in variant |
| B-13 | `server/domain/google-routing.ts:16,220` (`upstreamOrigin` option), module imported in production at `server/main.ts:35` | A test-only seam ("Tests only: point the fixed path at a fake node:http fixture") ships in the production module; `server/main.ts:2911` does not pass it, so nothing a client sends reaches it | Test seam in prod bundle | Keep, or move the seam behind a test-only factory; no behaviour change |

No screen shows invented data (checked every route under `src/app/**`). The only "sample" strings are input placeholders (`WELCOME…` promo, `0599123456` phone example).

---

## C. Work packages

Rules for every package. One PR, about one day. Branch from `origin/master`. Merge order is the table order unless a dependency says otherwise.

**Hot-file protocol (the files that many packages must touch).** `server/main.ts`, `src/copy.ts`, `src/app/order/[id].tsx`, `src/model.ts`. Put new server logic in a new file under `server/domain/` and add one registration line in `server/main.ts`; put new copy in a clearly marked block (one block per package, ar and en); rebase onto master before opening the PR and re-run the contract recorder (`docs/implementation/contracts/*.json`) when an endpoint or field is added.

**Two-vendor review** (owner rule): money, auth and dispatch packages are marked **2V**. Each gets a Haiku review at `xhigh` per the global PR rule plus an independent second vendor, and the merge waits for both.

**Test rule.** Add tests beside the closest existing suite in `tests/` (189 files; `scripts/run-tests.mjs`). Tests run on the test PC (DESKTOP-S2JKMK5) per the owner rule, not here.

### Ordered list

| WP | Title | Pri | Flags | Depends |
|---|---|---|---|---|
| WP-01 | Door-time amount collected + typed variance | P1 | 2V money | none |
| WP-02 | Admin assign / reassign driver | P1 | 2V dispatch | none |
| WP-03 | Driver told when blocked / approved | P1 | 2V auth | none |
| WP-04 | Verified phone sign-up activation | P0 | 2V auth, BLOCKED-EXTERNAL | S-02 provider |
| WP-05 | Email verification and reset delivery | P1 | 2V auth, BLOCKED-EXTERNAL | sending domain |
| WP-06 | X-01 large text: rework fixed heights, then raise the cap | P1 | UI | none |
| WP-07 | Ordinary-sign-in sandbox test variant | P1 | test infra | none |
| WP-08 | Alert delivery proof + restore drill | P0 | BLOCKED-EXTERNAL | owner contact route |
| WP-09 | Failure reasons: did_not_pay, rescheduled, incorrect_cash, partial_payment | P2 | money-adjacent | WP-01 (labels) |
| WP-10 | Per-event notification channels | P2 | needs new APK | none |
| WP-11 | Copy: ETA ladder, no-change cash reminder | P2 | copy | none |
| WP-12 | Held-cash age limit and warning before the cap | P2 | 2V money | none |
| WP-13 | Admin audit-log viewer | P2 | admin | none |
| WP-14 | My places screen + building type/notes | P2 | UI | none |
| WP-15 | Driver per-job earnings statement | P2 | money display | none |
| WP-16 | Goods COD on SQLite (two PRs) | P2 | 2V money, owner decision | decision |
| WP-17 | Parcel pickup code | P2 | custody | none |
| WP-18 | Admin fleet list / last-seen | P2 | admin | D-05 or last fix |
| WP-19 | Remove dead dev/test surface from production | P2 | hygiene | none |
| WP-20 | P3 backlog (compact) | P3 | mixed | various |
| DONE | Admin cash exact-decimal parsing (A-09, PR #36); expo-doctor patch versions (PR #35) | — | merged elsewhere | — |

### Detail

**WP-01 Door-time amount collected + typed variance. P1, 2V (money).**
- Goal: the driver confirms the cash actually received at delivery; a difference against what was due needs a reason. Evidence for disputes and for the cap. (D-15; R-SQ F-03; D-SH `CollectPanel`.)
- Files: `server/db/sqlite-schema.ts` (two nullable columns on `orders`: `collected_cents`, `variance_reason`, added by the existing `ALTER` loop at `:135`); new `server/domain/door-cash.ts`; one line in `server/main.ts` at `advanceOrder :2440-2468` (accept the two fields only when `next==='completed'`); `src/model.ts` (type + `varianceReasons`); `src/app/order/[id].tsx` (amount step before the code step, driver only); `src/copy.ts` (ar+en block); `src/wire-contracts.ts`.
- Server: amount is integer cents (`server/domain/money.ts`); reject negative or non-integer; due = `price - discount` (as shown at `src/app/driver/index.tsx:262`); difference ≠ 0 requires a reason in the list, else `400 invalid_input`; store with the same transaction as the status change; replay-safe through `order_actions` (`:2536`).
- Client: numeric field with Latin/Arabic digits (`latinDigits` `src/model.ts:272`); the confirm button states the reason it waits (`ui.tsx:286`).
- Tests: `tests/` cash suite (`cash.test.mjs`) new cases: exact amount, short, over, missing reason, replay, wrong role; contract fixtures recorded.
- Acceptance: completed order stores amount and reason; admin order view shows both; no change to commission, journals or cap maths; existing orders unaffected (nullable).
- Depends: none. Does not touch `ledger.ts`.

**WP-02 Admin assign / reassign a driver. P1, 2V (dispatch).**
- Goal: an admin can place a `searching` order on a named active driver, or move an assigned one, with a reason. Fixes "orders stuck searching" (PILOT.md). (A-05; R-SQ F-14.)
- Files: new `server/domain/admin-assign.ts`; one line in `server/main.ts` near `:2500`; `src/app/order/[id].tsx` (AdminAssign card, `src/admin-assign.tsx`; the admin order screen, not a separate list); `src/copy.ts`; contracts `additive-endpoints.json`.
- Server: `POST /api/admin/orders/:id/assign {driverId, reason, requestId}`; reuse, do not copy, `guardCashCap` (`:3000`), `canTake` limits (`src/model.ts:228`), active/pending/blocked checks (`needActive`), push to the driver and the customer; write `security_events`; refuse if the order left `searching`/`assigned`.
- Tests: assign, reassign, over-cap refused, blocked driver refused, double submit, status race with a driver accept.
- Acceptance: assignment cannot bypass any rule a driver accept enforces.

**WP-03 Driver told when blocked or approved. P1, 2V (auth).**
- Goal: tell the driver on block and role change (push), and show a blocked message at sign-in (D-02; PILOT.md gap). Approval pushes already exist (`server/main.ts:3261`, `:3283`). PR #40 is open for the sign-in message.
- Files: `server/main.ts` (`editUser` from `:3175`, block path `:3252-3259`; approve route `:3266`) one `queuePush` on the block and role-change transitions; `server/push.ts` kind names; `src/native-push.ts`/`src/push.ts` handling; `src/copy.ts` (`err_blocked` exists `:1016`); driver screen `src/app/driver/index.tsx:175` reasons.
- Tests: transition → push queued once; no push for no-op edits.
- Acceptance: a blocked driver sees why and whom to call; a block never strands a carried parcel silently (the existing `blockCarrying` warning stays).

**WP-04 Verified phone sign-up activation. P0, 2V (auth), BLOCKED-EXTERNAL.**
- Goal: turn the built phone flow on safely. (S-02.)
- Obtain from the owner: SMS provider contract (Ooredoo or ACS), sender id, approved prefixes, daily message and budget limits, evidence reference (`phone-provider.ts:10-34` reads the exact variables), HMAC key.
- Files: none to build; `docs/operations/` runbook, `.env`-key list in `docs/implementation/contracts/config.json`; verification tests on the test PC with the provider's sandbox; physical run on the A53 (`src/phone/*`, `src/phone-card.tsx`).
- Acceptance: a number cannot register twice, a wrong code locks out, budget cap stops sends, test providers refused in production (`phone-provider.ts:10-11`).

**WP-05 Email delivery. P1, 2V (auth), BLOCKED-EXTERNAL.**
- Goal: verified email and reset by email work in production (S-03).
- Obtain: sending domain with SPF/DKIM on the email provider the code uses (`server/main.ts:753`: `emailFrom`, Cloudflare account and token).
- Files: operations doc only unless the provider changes; test: send to a real inbox, check spam placement (PILOT.md watch item).
- Acceptance: reset link and code arrive; unverified email can no longer take over an account (PILOT.md "known limits").

**WP-06 X-01 large text. P1.**
- Goal: Android font scale 130% and 200% do not clip or hide controls. Retain the 1.35 cap and rework fixed-height layouts before raising it (source: `docs/HANDOFF-2026-11-13-FABLE-5.2-FINAL-VERIFIED-CUTOFF.md` Batch 4.4, which is not on `origin/master`, so this is [inferred]; `docs/HANDOFF-2026-11-05-NEXT-LEAD.md:179` only records that `Button` labels have no cap). Now PR #39; `Button` labels are raw `Text` with no cap.
- Files: `src/ui.tsx` (`Txt :200`, `Button`, `IconButton`), `src/parts.tsx`, fixed `height`/`numberOfLines` sites in `src/app/book.tsx`, `src/app/order/[id].tsx`, `src/app/driver/index.tsx`, `src/pin-sheet.tsx`, `src/map-sheet.tsx`; `scripts/screens.mjs` (`booking-narrow` scales fonts without line height, so add line height).
- Method: grep `height:` and `numberOfLines`; convert to `minHeight`/wrap; then raise `maxFontSizeMultiplier` from 1.35 to the tested value and cap `Button` the same way.
- Acceptance: screenshots at 360 px, 130% and 200%, ar+en, no clipped button; then A53 with Android font scale set (needs the phone; `Needs the phone` list in the handoff).
- Note: touches many UI files; schedule it after WP-01/02/09/11/14/17 merge, to avoid conflicts.

**WP-07 Ordinary-sign-in sandbox test variant. P1, test infra.**
- Goal: build the phone test APK against the loopback sandbox but let a person sign in through the normal sign-in screen (today `scripts/build-phone-tests.ps1` bakes synthetic credentials (env names `:70`, set at `:107-109`) and `src/session.tsx:112-116` signs in automatically, so the real sign-in path is never exercised).
- Files: `scripts/build-phone-tests.ps1` (new `-SignIn Ordinary` switch: skip the `WIND_TEST_ROLE/IDENTIFIER/PASSWORD` block, keep `WIND_LOCAL_TEST=1` and the loopback `EXPO_PUBLIC_API_URL`); `app.config.js:19-33` (new `WIND_TEST_SANDBOX=1` accepted without a role, loopback origin enforced, still refused under `EAS_BUILD`/`WIND_RELEASE`, and it must enable `plugins/with-phone-test` at `:75` so the debug network-security file permits `127.0.0.1`); `plugins/with-phone-test.js`; `scripts/check-phone-tests.mjs` and the `tests/phone-test*` suite; `scripts/phone-test-server.mjs`/`phone-test-state.mjs` to print the provisioned identifier and password for the human to type; `docs/implementation/test-harness.md` one paragraph.
- Acceptance: variant APK contains no credentials (assert in the check script), refuses a non-loopback URL, shows the sign-in screen; the scripted variant still signs in automatically.

**WP-08 Alert delivery proof + restore drill. P0, BLOCKED-EXTERNAL.**
- Goal: an outage or ledger failure reaches the owner within minutes (ATL §22; PILOT.md "Server down"). Not a feature, but a launch gate.
- Obtain: owner's alert route (WhatsApp/SMS/email), an Azure monitor or external uptime account, a restore target.
- Files: `infra/vm/*` (cron/watchdog), `docs/operations/restore.md`, `.github/workflows` uptime; no app code.
- Acceptance: a deliberately failed readiness check produces a received alert; a nightly backup restores into a scratch directory and a SQLite integrity check passes; both recorded with timestamps.

**WP-09 More failure reasons. P2.**
- Files: `src/model.ts:29-30` (`ExceptionReason`, `exceptionReasons`), `server/main.ts:2493-2497` validation list, `src/copy.ts` labels (driver form, customer `on_hold`, admin queue), `src/app/order/[id].tsx:398` form, `src/app/admin/orders.tsx`; contract fixtures.
- Add `did_not_pay`, `rescheduled`, `incorrect_cash`, `partial_payment` (R-SQ F-08). `did_not_pay` and `partial_payment` appear to the admin as cash flags.
- Acceptance: old clients sending the four old values still work; unknown values still `400`.

**WP-10 Per-event notification channels. P2.**
- Files: `src/native-push.ts:36` (create channels `jobs`, `status`, `cash`, `attention`), `server/push.ts:68` (map `kind` to `channelId`), `server/domain/native-push.ts`, copy for channel names, tests.
- Needs a new APK and the forced-upgrade value (`docs/operations/deploy.md`, release note). Keep `default` for old builds.
- Acceptance: a job offer rings on its channel; status updates do not.

**WP-11 Copy: ETA ladder and no-change cash reminder. P2.**
- Files: `src/copy.ts` (new keys), `src/app/order/[id].tsx` and `src/app/track/[token].tsx` ETA text, `src/app/book.tsx:405` range, `src/app/driver/index.tsx` cash line. Own words, ar+en, Palestinian Arabic reviewed.
- Acceptance: "less than 3/5/10 minutes" states; "the driver carries no change" before confirm and on the driver cash line.

**WP-12 Held-cash age limit and warning. P2, 2V (money).**
- Goal: Wolt/KOHME-style (gap page). Setting `driverCashMaxDays` (default off until the owner picks), guard in the same function as `guardCashCap` (`server/main.ts:3000`), push at 80% of cap or day limit, banner in `src/app/driver/earnings.tsx:61` and the job board.
- Files: `src/model.ts:89-125` (setting + ceiling), `server/main.ts:2991-3010`, `src/app/admin/settings.tsx`, `src/app/driver/index.tsx`, tests, contract fixture for settings.
- Acceptance: the age is measured from the oldest unconfirmed finished job; confirmed handover resets it; cap behaviour unchanged.

**WP-13 Admin audit-log viewer. P2.**
- Files: new `server/domain/audit-read.ts`; `GET /api/admin/audit?before=&action=` read-only over `security_events` (`server/db/sqlite-schema.ts:53`), paged; new `src/app/admin/audit.tsx` and a link in `src/app/admin/_layout.tsx`; copy labels per action (`PROOF_FAILED`, `DELIVERY_EXCEPTION`, `ORDER_CANCELLED_BY_ADMIN`…).
- Acceptance: admin only; no write route; details redact secrets.

**WP-14 My places screen. P2.**
- Files: `server/main.ts:1048-1066` (add `PATCH /api/me/places/:id`), `server/db/sqlite-schema.ts:105` (nullable `building_type`, `notes`), new `src/app/places.tsx` linked from `src/app/(customer)/account.tsx`, `src/model.ts:36` type, `src/app/book.tsx:155,794` pre-fill, copy.
- Acceptance: rename/edit/delete; building type + note travel into the order note shown to the driver.

**WP-15 Driver per-job earnings statement. P2.**
- Files: `GET /api/driver/earnings/jobs?before=` beside `server/main.ts:2958`; `src/app/driver/earnings.tsx` list (job code, fare, discount, commission, net, cash status); copy.
- Acceptance: row sums equal the existing today/week/all cards for the same period.

**WP-16 Goods COD on SQLite. P2, 2V (money), owner decision first.**
- Decision needed: will senders ask the driver to collect the goods price (Shiply "Pay", C-16; was also listed as P-02)? If no, mark D and stop (and do WP-19 to unregister the routes).
- PR 1: `server/db/sqlite-schema.ts` (`merchant_cod`, `merchant_cod_events`, append-only triggers like `:128-132`), port `server/domain/payments.ts:158-190` to the SQLite dialect behind a new `server/domain/cod.ts`, cash cap counts goods held (extend `cashExposureCents` `server/main.ts:2991`).
- PR 2: booking field "collect from recipient", driver collect step (reuses WP-01's amount and variance), admin remit/resolve in `src/app/admin/cash.tsx`, receipts.
- Acceptance: collected goods money never mixes with commission maths; remit needs a payout reference; cap counts goods held.
- Door cash on `orders` (WP-01, A11) is the source of truth for delivery-fee collection until the PostgreSQL cutover decision; the dormant PG `cash_receipts` ledger (`server/domain/ledger.ts`) is not read or written by the app, so it must not be reconciled against `orders` until that decision.

**WP-17 Parcel pickup code. P2.**
- Files: `server/db/sqlite-schema.ts` (nullable `pickup_code` next to `return_code :135`), `advanceOrder` at the `at_pickup→in_transit` step (`server/main.ts:2440`, same lockout pattern as `proof_attempts`), `src/app/order/[id].tsx` (sender sees code, driver enters it), copy.
- Acceptance: five misses lock and alert admin like delivery; the code is shown only to the sender.

**WP-18 Admin fleet / last-seen list. P2.**
- Files: `GET /api/admin/drivers/live` reading `driver_locations` (`sqlite-schema.ts:29`) and active job, `src/app/admin/users.tsx` or new screen, copy. Uses presence only if the dialect cutover has happened.
- Acceptance: stale > 2 minutes shown as stale, never as a position.

**WP-19 Remove dead dev/test surface from production. P2.**
- Files: `server/domain/opencode.ts` + `server/main.ts:56,598-600` (B-01), `server/domain/payments.ts:19-33,192` and `private-objects.ts:37-44,154` (move fakes to `tests/` helpers; B-02/B-03), `server/domain/ledger.ts:12-13` and `server/domain/eligibility.ts:21` (B-04), `docs/SYSTEM.md` label list (B-05).
- Acceptance: production `/api/opencode*` returns 404; tests still pass using the relocated fakes; the cap change also updates `tests/activation-gates.mjs:2,8` and `tests/ledger.mjs:64`; no behaviour change for users.

**WP-20 P3 backlog (each its own later PR; compact).**

| Item | Files | Note |
|---|---|---|
| Saved recipients (C-13) | `server/db/sqlite-schema.ts`, `server/main.ts` places area, `src/app/book.tsx` | |
| Handoff hint chips (T-24) | `src/app/book.tsx`, order note | |
| QR proof (T-21) | proof code path `server/main.ts:2450`, camera permission | needs camera permission review |
| Delivery windows + capacity (C-10), zone fees (C-09) | new tables, `src/app/book.tsx` | owner policy |
| Edit order before dispatch (T-25) | `server/main.ts` new PATCH | |
| Battery/permission health (D-25) | `server/main.ts:2612` body, admin order | |
| Photos for address/proof/documents (C-08, D-04, D-27) | `server/domain/private-objects.ts` | BLOCKED-EXTERNAL object storage + dialect |
| Merchant console (A-16) | new role | owner decision |
| Expo receipts for stale tokens (N-04) | `server/main.ts:1249` | |
| Server-driven copy (S-08) | new settings table | |
| Shift-scoped cash close (D-07) | cash module | owner decision |

**BLOCKED-EXTERNAL summary (what to obtain).** SMS provider + sender id + budget (WP-04). Email sending domain (WP-05). Alert route and monitor (WP-08). Object storage for photos (WP-20). Owner decisions: goods-COD yes/no (WP-16), dialect cutover (cross-cutting), cash age limit value (WP-12), merchant segment (A-16), legal review (S-05), checkpoint field check (B-07), prices (B-09).

---

## D. Out of scope, with reasons

| Item | Reason |
|---|---|
| Cards, wallets, PSP, refunds, top-ups (Shiply wallet, Careem Pay, Haat Google Pay) | Needs a payment provider and licence; Wind is cash-only (ATL S1, §19). `payments.ts` stays dark |
| Customer tip in app | Cash only: an in-app tip would be unrecorded money |
| Cancellation or no-show fee, customer arrears | No way to collect a customer debt in cash; needs a decision after COD/ledger work (ATL X4) |
| Acceptance-rate gating, rejection limits | A 50-user pilot needs every accepted job (R-CA §10.4) |
| Booked shifts with capacity | Same reason; Wind has an open board plus a cash cap |
| Hub custody scans, driver-to-driver transfer | Point-to-point courier, no hubs (gap page) |
| Baskets: weights, substitutions, minimum order, service-fee line | Wind carries parcels, not shop orders |
| Marketplace, community, lists, reviews, moderation (Souq) | ATL S2: large surface, no pilot value |
| B2B catalogue, vendors, employees, salesmen (Shiply) | ATL S3: a different business |
| Support ticketing, Intercom | WhatsApp support covers pilot volume (ATL S10) |
| Analytics/ad SDKs, AppsFlyer attribution, Braze, Datadog | ATL S7/S8; privacy cost |
| Always-on background location | ATL S9; shift/job-scoped location only |
| Masked calls | Needs a telecom contract |
| Ride tiers, surge, boarding PIN activation | Production is parcel-only; ride also needs the dispatch review (`dispatch.ts:41` PG-only) and owner authorization (PILOT.md) |
| Capacitor/WebView architecture, Google Maps as default map | ATL S4; Wind's OSM/MapLibre baseline needs no key |
| Copying competitor strings or art | Shape transfers, wording does not (ATL X9) |
| Dialect cutover SQLite to PostgreSQL | Owner decision with migration risk (ATL §23.1); packages note where they depend on it |

---

## E. What the demos taught that stays true in Wind

A timer never collects cash or creates income; a role switch is not authentication; a rejected command never returns a success id; no automatic retry of a create (FM §7-8; each demo §6). Wind already does these (`server/main.ts:1515,414,2536`). Do not regress them for parity.
