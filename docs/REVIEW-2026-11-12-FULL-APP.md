# Wind — full application review, 12 November 2026

Reviewer: Claude Fable 5.2 (principal-engineer review, read-only). Tree reviewed: branch `integrate/sessions-20261112` at `203914a`, whose files are identical to master merge `ea4d815` (`git diff ea4d815 HEAD` is empty). No source was edited, nothing was built, tested, committed or deployed. I had no access to production, so nothing here is evidence about the live system.

## How to read this

Each finding has an ID, a severity, and a basis:

- **V (verified)**: I read the cited code or configuration in this review.
- **D (documented)**: the project's own documents say so; I did not re-check it against production.
- **J (judgement)**: my assessment; reasonable engineers could disagree.

Effort: **S** is a day or less, **M** is two to five days, **L** is more than a week. "Owner" means it needs money, an account, a contract, a legal answer or a policy decision; "Eng" means engineering can do it alone.

One correction to the brief: the client is on Expo **57** with React Native 0.86 (`package.json`: `"expo": "~57.0.31"`), not SDK 54.

## The short version

1. **The largest risks are operational and commercial, and the code is ahead of them.** Production is stopped over an unpaid Azure bill, nobody is proven to receive an outage alert, the only API address is a hostname owned by that same Azure subscription, and a rebuild on a new host has never been rehearsed. A parcel pilot can survive most of the code limitations below; it cannot survive these.
2. **The live product is the SQLite parcel path.** A large share of the server (locked quotes, dispatch, ride boarding, payments, ledger, staff roles, phone identity, Entra sign-in, Google routing) is switched off or runs only on PostgreSQL, which is not live. That code costs review time and hides the live path. Most of it should stop growing until parcels work unattended.
3. **Three product gaps will hurt real deliveries first:** the recipient never receives the handover code from Wind, a courier's location sharing stops when Android kills the app, and nobody is alerted when an order sits unassigned.
4. **Identity is the main security weakness.** Phones and emails are unverified, a password reset link goes to an unverified address, and the admin account (which can read every phone number, reset passwords and adjust cash) has a password only.
5. **The right next investments are small:** pay and alert, buy a domain, rehearse a restore, restrict cities, send the code to the recipient, keep Android tracking alive, fix the update path. The PostgreSQL cutover and a 140 USD a month database are not among them at 50 users.

---

## 1. Customer booking flow

Files: `src/app/book.tsx`, `src/booking.ts`, `src/trip-search.tsx`, `server/main.ts` (`recommend`, `/api/price`, `createOrder`, `POST /api/orders`), `src/model.ts`.

What is solid (V): booking is idempotent end to end. The client saves the command with a request ID and a deadline before posting (`src/app/book.tsx:485`), the server stores a receipt in the same transaction as the order (`server/main.ts:1743`), a retry replays the order, and the form stays frozen until the server confirms the command is absent (`src/booking.ts:109-124`). Prices are computed on the server and a changed price forces a re-confirm (`server/main.ts:1648`).

**B1 · medium · V — Gaza and Jerusalem can be booked at the flat ₪20.**
- Evidence: the city list holds Gaza, Deir al-Balah, Khan Younis, Rafah and Jerusalem (`src/model.ts:15-19`); search lists every city when the user has no saved places (`src/trip-search.tsx:107`); the server only checks `isCity` (`server/main.ts:1376`, `1634`). Route feasibility checks exist only on PostgreSQL (`server/main.ts:1401`, `1421`).
- Impact: an order nobody can deliver sits on the job board and the customer waits up to 24 hours (see L3). Jerusalem needs permits the app knows nothing about.
- Fix: one server setting for enabled cities (default: the pilot's West Bank cities), refused at `/api/price` and `createOrder`, sent to the client in `capabilities` so the list hides the rest. Effort S. Eng, with the owner naming the cities.

**B2 · medium · V — Locked quotes do not exist in production.**
- Evidence: `POST /api/orders` refuses a `quoteId` unless the backend is PostgreSQL (`server/main.ts:1696`); `/api/price` returns the plain recommendation otherwise (`:1401`).
- Impact: for parcels, none (one flat price). For rides and freight the price can change between the screen and the booking; the client handles it with `price_changed`. The 130-line quote-bound branch of `createOrder` (`:1500-1628`) duplicates the legacy branch and never runs live.
- Fix: nothing for the parcel pilot. Do not enable rides on SQLite without it. Effort none now.

**B3 · medium · J — The flat ₪20 ignores distance.**
- Evidence: `parcelFare` (`src/model.ts:204-206`); `docs/PILOT.md:44` already tells the owner to watch it; ledger row 28.
- Impact: a Hebron to Jenin parcel pays the courier the same as one across Ramallah. Couriers will skip long jobs, which then expire.
- Fix: collect the real trips first. The smallest change that fits the existing settings screen is two bands: same city, and between cities. Effort S once the owner sets the numbers. Owner (pricing).

**B4 · medium · V — `BookForm` is one 800-line component with 65 `useState` calls.**
- Evidence: `src/app/book.tsx` (817 lines; `grep -c useState` gives 65).
- Impact: every keystroke re-renders the whole screen, map sheet included, which matters on low-end phones; and 20 test files assert on this file's source text (see T2), so it is expensive to change.
- Fix: when next touching it, lift the three steps (search, pin, trip details) into three components that share one reducer. Do not rewrite it as a project. Effort M. Eng.

**B5 · low · V — Default route is Ramallah to Nablus before the user chooses anything.**
- Evidence: `src/app/book.tsx:41-42`. The `pickupChosen`/`dropoffChosen` flags guard submission, so this is cosmetic.

**B6 · medium · V — A customer with no courier nearby gets no answer.**
- See L3. The booking succeeds and the order page says "searching" for up to 24 hours.

---

## 2. Order lifecycle and live tracking

Files: `src/app/order/[id].tsx`, `server/main.ts` (`advanceOrder`, `reportException`, cancel, share, `liveFix`).

What is solid (V): driver commands are idempotent with an expected-status check (`server/main.ts:2531-2568`); five wrong handover codes lock the order and alert admins (`:2447-2452`); failed delivery goes to `on_hold` and an admin decides reattempt or return, with a separate return code (`:2495-2523`); the share link is an allowlist with no phones, notes or codes (`:2008-2020`); the live map uses a long-poll that re-checks access before sending a coordinate (`:2727-2759`).

**L1 · high · V — The recipient never gets the handover code from Wind.**
- Evidence: the code is returned only to the order's owner (`server/main.ts:311`); the public tracking view excludes it by design (`:2013-2019`); the message the sender shares is only "Track my trip on Wind: {url}" (`src/copy.ts:389`, `src/app/order/[id].tsx:565-574`).
- Impact: the sender must remember to phone or message the 4-digit code to the recipient. When they forget, the courier stands at the door, calls the sender, or reports "absent" and the parcel goes on hold for an admin. This will be the most common failed delivery.
- Fix: in the "send to recipient on WhatsApp" button (which already targets `recipientPhone`), add the code and one line saying to give it only when the parcel is in hand. Keep the generic share link code-free. Later, when an SMS or WhatsApp provider exists, send it from the server. Effort S (needs a new APK). Eng.

**L2 · medium · V — The recipient WhatsApp link always uses +970.**
- Evidence: `https://wa.me/970${recipientPhone.slice(1)}` (`src/app/order/[id].tsx:574`). Wind's own support line is a 059 number registered as +972 (`.github/workflows/release-image.yml:44`), so +972 WhatsApp accounts on West Bank numbers exist.
- Impact: for recipients registered on WhatsApp under +972 the link opens "number not on WhatsApp".
- Fix: offer both ("WhatsApp +970 / +972") or fall back to the system share sheet when the first fails. Effort S. Eng.

**L3 · high · V — Nobody is alerted when an order is not picked up, and it expires only after 24 hours.**
- Evidence: `SEARCH_EXPIRY_MS` defaults to 24 h (`server/main.ts:1489`); the only admin `attention` pushes are driver signup, locked proof, exception, dispute, missed backup, cash dispute and subscription (`grep "'attention'"`); the dashboard shows status counts only.
- Impact: at pilot size there are few couriers. An order with no taker is the pilot's most likely failure and today only a person staring at the dashboard sees it.
- Fix: in the existing one-minute timer, push `attention` to admins when an unscheduled order has been searching for 10 minutes, once per order; show the customer "no courier yet, we have told the team" with the support button; cut the expiry to a few hours. Effort S. Eng.

**L4 · high · V — Pickup has no proof and no location check.**
- Evidence: `advanceOrder` moves `assigned → at_pickup → in_transit` with no code, photo or distance check (`server/main.ts:2435-2464`); ledger row 26 records a courier in Tulkarm marking a Ramallah pickup as arrived and collected.
- Impact: custody starts on the courier's word. A lost-parcel dispute has no evidence of who held it when. The customer also loses the right to cancel the moment the courier taps "picked up" (`cancellable`, `:1848`).
- Fix: cheapest first. (a) Server: when the order has a pickup pin and a fresh fix, refuse `in_transit` if the fix is more than about 1 km away unless the courier confirms "I am at the pickup" and record that. (b) Show the sender a pickup code as well and require it for `in_transit`, reusing the handover-code path. Effort S for (a), M for (b). Eng; the owner decides whether senders will accept a second code.

**L5 · medium · V — Cancellation is free until pickup, with no reason and no cost to anyone.**
- Evidence: `POST /api/orders/:id/cancel` allows `searching`, `assigned`, `at_pickup` for the customer and records nothing except for admins (`server/main.ts:1910-1926`).
- Impact: a courier who drove to the pickup earns nothing; the app cannot show which customers cancel on arrival.
- Fix: record actor and a reason chip on every cancel, count late cancels per customer for the admin, and let the owner decide on a fee later. Effort S. Eng, policy from the owner.

**L6 · medium · V — Only the latest courier position is stored.**
- Evidence: `driver_locations` is one row per driver, upserted (`server/main.ts:2698-2704`); `docs/SYSTEM.md` says the same.
- Impact: no trail for a dispute ("the courier never came"), no data to calibrate ETAs (ledger row 14), no measure of real route cost for pricing (B3).
- Fix: on each status change store the courier's position and time in the audit row that already exists. That gives pickup and delivery points without storing a full trace. Effort S. Eng. A full trace needs a retention decision first (owner).

**L7 · medium · V — Closed-app alerts are best effort with no retry.**
- Evidence: `deliver` swallows every failure (`server/main.ts:1254-1262`); native delivery reads only the send ticket (`:1249-1252`); `protocolCapabilities` reports `legacy_best_effort` on SQLite (`:3396`).
- Impact: a missed "job available" or "courier arrived" push is simply lost. `docs/PILOT.md:44` already lists couriers missing jobs.
- Fix: one retry after a few seconds for transport errors on urgent kinds only. A durable outbox is not worth it at this size. Effort S. Eng.

**L8 · low · V — The order screen polls every 4 s in addition to the live long-poll.**
- Evidence: `orderRefreshMs` default 4000 (`src/runtime-config.ts:3`); `src/app/order/[id].tsx:53-55`. Fine now; it is the first thing to relax if server CPU matters.

---

## 3. Driver app

Files: `src/app/driver/*`, `src/driver-work.tsx`, `src/background-location.ts`, `src/driver-presence*.ts`, `server/main.ts` (`/api/jobs`, accept, `/api/location`, earnings, cash).

What is solid (V): job cards hide exact pins, notes and phones until the job is taken (`server/main.ts:284-330`, `:2270-2279`); accept is a compare-and-set so two couriers cannot take one order (`:2330-2333`); location uploads are filtered for stale, out-of-order and impossible fixes (`:2646-2676`); a blocked or signed-out courier's queued fix is refused inside the write itself (`:2684-2697`).

**D1 · high · V — Location sharing stops when Android kills the app, until the courier opens it again.**
- Evidence: `trackingEnabled` is module state that starts false (`src/background-location.ts:34`); when the OS restarts the task without the app, the task stops itself (`:165-171`, "A restored native registration is not authority for this JavaScript launch"). Nothing asks the user to exempt Wind from battery optimisation (no match for "battery" or "doze" in `src/`, apart from one comment).
- Impact: on Samsung phones, which kill background apps aggressively, the customer's map freezes mid-trip and the courier does not know. `docs/PILOT.md:23` relies on telling couriers not to force-close the app.
- Fix: (1) on going online, check and request the battery-optimisation exemption with a one-screen explanation; (2) on a headless restart, validate the stored context against the stored session token and keep sharing if both match, instead of always stopping; (3) the server already knows a fix is stale after 120 s: push the courier "location sharing stopped, open Wind". Effort M, and it needs a phone to prove. Eng. Read the Expo 57 location and task-manager docs before touching the APIs (`AGENTS.md`).

**D2 · medium · V — A fix every 3 seconds at high accuracy for the whole job.**
- Evidence: `timeInterval: 3_000, distanceInterval: 0, accuracy: High` (`src/background-location.ts:109-112`).
- Impact (J): battery and data drain on a two-hour intercity run; a courier whose phone dies loses the handover screen.
- Fix: keep 3 s within a couple of kilometres of the pickup or drop-off, relax to 10–15 s with a distance filter elsewhere. Measure on the A53 before and after. Effort S–M. Eng.

**D3 · medium · V — Every fix costs at least two SQLite writes.**
- Evidence: the rate limit is itself an upsert into `request_limits` (`server/main.ts:419-423`, called at `:2610`), then the location upsert (`:2698`).
- Impact: none at pilot size. With some hundreds of couriers online it becomes the main write load on a database that commits with full sync.
- Fix: keep the per-driver location limit in memory (losing it on restart is harmless). Effort S. Eng. Do it when load says so.

**D4 · high · D — Cash handling records what a courier owes, not what was collected per order.**
- Evidence: `docs/SYSTEM.md:162` ("Per-order fare collection, refunds and shift reconciliation are not implemented"); `docs/operations/cash-controls.md` marks T23–T25 open; `docs/PILOT.md:9` tells the owner to keep a paper record.
- Impact: with 5 couriers, paper works. With 30 it does not, and a dispute over who paid is unanswerable.
- Fix: at delivery, record "cash collected ₪X from sender/recipient" as part of the same advance command; show the day's list on the earnings screen. Effort M. Eng, with the owner deciding who pays (see open questions).

**D5 · medium · V — A courier can hold up to 200 parcels with no route order.**
- Evidence: `PARCEL_LOAD = 200` (`src/model.ts:209`); the run sheet groups by stage and city only (`src/model.ts:303-320`).
- Impact (J): fine for a pilot; a real van round needs stop ordering. Not now.

**D6 · medium · D — Driver approval has no documents.**
- Evidence: registration takes a name, phone, vehicle and plate (`server/main.ts:645-687`); `docs/PILOT.md:20-21` says the admin "checks who they are".
- Impact: acceptable among people the owner knows; a blocker for strangers and for insurance.
- Fix: when growing, a private photo upload of ID and licence at signup. The storage module exists but is PostgreSQL-only. Effort M. Owner (policy, storage cost).

---

## 4. Admin

Files: `src/app/admin/*`, `server/main.ts` (`/api/admin/*`), `server/domain/cash-ops.ts`.

What is solid (V): every admin route checks the role (I checked each registration; the one route without an inline check, remittance, checks inside `recordCash`); support password resets need an emailed code or a written attestation and are audited (`server/main.ts:3275-3311`); settings have ceilings so a typo cannot set a 2000-shekel parcel (`src/model.ts:99-115`); admins cannot be created or changed over the API (`:3652-3658`).

**A1 · high · V — The admin signs in with a password only.**
- Evidence: no second factor anywhere in `server/` (no match for totp, 2fa, mfa); the login route is the same for every role (`server/main.ts:689-737`).
- Impact: one phished or reused password exposes every user's phone and email, allows password resets for any user, cash adjustments and price changes.
- Fix: TOTP for the admin role, enrolled from the server shell like `promote`. Effort M. Eng.

**A2 · medium · V — The audit log cannot be read from the app.**
- Evidence: `security_events` is written in about twenty places and read by one unrelated query (`server/domain/journey.ts:63`); there is no admin route for it.
- Impact: "who cancelled this order, who reset this password" needs SSH and SQL.
- Fix: one read-only route and a plain list on the order and user screens. Effort S. Eng.

**A3 · medium · V — One admin role, no limited staff.**
- Evidence: `need(user, 'admin')` is the only gate (`server/main.ts:412`); staff roles and approvals exist only for PostgreSQL (`server/domain/ops.ts`); ledger row 23.
- Impact: the first hired dispatcher gets full power, including cash and settings.
- Fix: not now. When a second person is hired, add one "dispatcher" role that cannot touch cash, settings or passwords. Effort M. Owner trigger.

**A4 · medium · V — Lists stop at 200 with no paging or export.**
- Evidence: users and subscriptions `LIMIT 200` (`server/main.ts:3146`, `:3335`); no export in `src/app/admin`.
- Impact: none at 50 users; the owner cannot hand an accountant a file.
- Fix: a CSV download for orders and cash by date range. Effort S. Eng.

**A5 · low · V — The dashboard recomputes all-time totals on every poll.**
- Evidence: `/api/admin/stats` runs about ten aggregates (`server/main.ts:3104-3138`) and the admin layout polls it every 10 s (`src/app/admin/_layout.tsx:7`). Harmless until there are tens of thousands of orders.

**A6 · medium · V — Subscriptions are paid offline, activated by hand, and lapse silently.**
- Evidence: activation sets 30 days (`server/main.ts:3349`); expiry is computed on read (`:259`); nothing reminds the user or the admin.
- Fix: a push three days before `ends_at`. Effort S. Eng. Low priority until anyone buys a plan.

---

## 5. Maps, routing, GPS

Files: `public/map.html`, `src/scene-map.tsx`, `src/route-map*.tsx`, `server/domain/place-search.ts`, `server/domain/place-index.ts`, `server/main.ts` (`roadRoute`), `infra/osrm/`.

What is solid (V): one map page everywhere; the page reports "ready" only after a real base tile loads and the app falls back to a route diagram with text search (`docs/operations/provider-failures.md`); routes avoid checkpoints reported closed with bounded detours (`server/main.ts:2821-2885`); the OSRM graph is cut to the West Bank so no route leaves it (`infra/osrm/build-west-bank.sh:2-4`); map assets are vendored and cached.

**M1 · high · V — One free public tile host with no fallback.**
- Evidence: `style: 'https://tiles.openfreemap.org/styles/liberty'` (`public/map.html:169`); the CSP allows only that host (`:12`, `server/main.ts:157-159`). The only monitor is the hourly GitHub job (`.github/workflows/uptime.yml`).
- Impact: an outage or a block of that host removes the map for every user. Booking still works through text search; pin confirmation and live tracking do not.
- Fix: keep the host (it is free and works) and put the tile check on the same outside monitor as O2. Write down the switch: a second style URL behind the existing runtime configuration. Do not self-host tiles yet. Effort S. Eng.

**M2 · high · D — A cold map on slow data takes 17–24 s and the timeout is 20 s.**
- Evidence: measured on the SM-A5360, `docs/operations/provider-failures.md:28-34`; `mapReadyTimeoutMs` default 20 000 (`src/runtime-config.ts:4`).
- Impact: on slow 3G the first open of the map often ends in the fallback diagram. First impressions happen on cold opens.
- Fix (J): start the map at a lower zoom with the route bounds so fewer tiles are needed, and show the pin and route over a blank background as soon as the style loads rather than waiting for tiles to count as usable for viewing (keep the strict rule for confirming a pin). Measure again. Effort M. Eng.

**M3 · medium · V — Place search depends on public Nominatim at one request a second for the whole server.**
- Evidence: `server/domain/place-search.ts:43-57`; the queue refuses when it is 5 s deep; the comment says to move when traffic grows. The User-Agent carries no contact address (`:55`), which the OSM usage policy asks for.
- Impact: at pilot size fine. Ten people searching at once get `search_unavailable`. A policy block would remove search for everyone.
- Fix: now, put a contact email in the User-Agent (S). Search the local 24 000-place index first and call Nominatim only on a miss (M). Self-host only if blocked.

**M4 · medium · D — Routes know nothing about permits, plates or gates; ETAs are uncalibrated.**
- Evidence: `docs/PILOT.md:26`; `infra/osrm/build-west-bank.sh:4`; ledger rows 14 and 27. The profile is OSRM's stock car profile (`build-west-bank.sh:16`).
- Impact: a route line may show a road the courier cannot use; minutes are a guess. The app says so, which is the right posture.
- Fix: with L6's stored status positions, compare promised and actual minutes after a hundred trips and scale the estimate. Do not build a permit model. Effort S after data exists. Eng.

**M5 · medium · V — The map page is served by the API, and routing runs on the same small machine.**
- Evidence: Android loads `map.html` from the API origin (`public/map.html:2-3`); the watchdog shows OSRM as a container next to the API (`infra/vm/wind-watchdog.sh:21`); the graph build "needs swap on a 1 GB VM" (`infra/osrm/build-west-bank.sh:5`).
- Impact: API down means no map and no routes, as now. A memory spike in either container can take the other down.
- Fix: nothing structural at this size. Give each container a memory cap so the kernel kills the right one, and size the VM by measuring (see O6). Effort S. Eng.

**M6 · low · D — Known map defects still open:** missed Confirm taps (ledger row 10), raw-GPS car drift (row 13), pin and label collision (row 15). All need the phone; none blocks parcels.

**M7 · low · V — The road graph is a snapshot.**
- Evidence: the build downloads the Geofabrik extract once (`infra/osrm/build-west-bank.sh:12`); nothing schedules a rebuild.
- Fix: rebuild quarterly by hand. No automation needed.

---

## 6. Auth, identity, sessions, verification, password reset

Files: `server/main.ts:645-1024`, `server/domain/passwords.ts`, `server/domain/firebase-reset.ts`, `src/session.tsx`, `src/storage.ts`, `src/app/auth.tsx`.

What is solid (V): scrypt in a bounded worker pool; session tokens are random, stored hashed, 90-day lifetime with 30-day idle expiry (`server/domain/session-policy.ts`); a reset ends every session; reset and login answers do not reveal whether an account exists (`server/main.ts:861-903`); native tokens live in SecureStore (`src/storage.ts:16-19`); account deletion scrubs personal data from orders and messages (`:968-1011`).

**I1 · high · V — Phone numbers are never verified, so anyone can register someone else's number.**
- Evidence: registration inserts the phone unchecked (`server/main.ts:648-671`); a second signup with that number gets `phone_taken` (`:660`).
- Impact: the real owner of the number is locked out and must reach support; orders can be placed with a number that is not the customer's. `docs/PILOT.md:51` accepts this for invited users only.
- Fix: an SMS or WhatsApp one-time code at signup. The server side (`server/domain/phone-identity.ts`, `phone-provider.ts`) is written but PostgreSQL-only and has no provider contract. Effort M for the SQLite path once a provider exists. Owner (contract, per-message cost, +970/+972 reach: ledger row 20).

**I2 · high · V — A password-reset link is sent to an unverified email address.**
- Evidence: with Cloudflare email off and Firebase on, `accountFor(body.identifier, emailReady)` passes `verified = false` (`server/main.ts:863`, `:856-860`); a successful Firebase reset then marks the address verified (`:710-712`).
- Impact: a mistyped email at signup gives the account to whoever owns that address. Documented and accepted for the pilot (`docs/PILOT.md:51`, `docs/operations/deploy.md` "Known limit").
- Fix: verify the email at signup with the code flow that already exists (`:800-852`). It is blocked only on a sending domain (see O4). Then restrict resets to verified addresses. Effort S after the domain. Owner (domain).

**I3 · medium · V — Five wrong passwords lock that phone number's login for ten minutes, for everyone.**
- Evidence: the limit key is the identifier alone (`server/main.ts:692-693`, `:728`).
- Impact: anyone who knows a courier's number can keep them signed out during work. Existing sessions keep working, so the effect is on re-login only.
- Fix: key the failed-attempt limit on identifier plus client address, and keep a higher per-identifier ceiling. Effort S. Eng.

**I4 · medium · V — "Sign out" ends every device's session.**
- Evidence: `DELETE FROM sessions WHERE user_id = ?` (`server/main.ts:906`).
- Impact: a courier with the app on two phones, or an admin on phone and laptop, is signed out everywhere. Safe, but surprising.
- Fix: delete only the presented token; keep "sign out everywhere" as a second action. Effort S. Eng.

**I5 · medium · V — Twelve-character minimum password in production.**
- Evidence: `newPassword` (`server/main.ts:226`).
- Impact (J): for this audience a long password with no SMS recovery means more forgotten passwords and more support resets. It was chosen because there is no second factor; once I1 lands, 8 characters with the existing attempt limits is the better trade.

**I6 · low · V — On the web, the session token is in `localStorage`.**
- Evidence: `src/storage.ts:5`, `:15`. The page CSP forbids inline and third-party scripts (`server/main.ts:153-161`), which is the right mitigation for a bearer-token app.

---

## 7. Server architecture and data

Files: `server/main.ts`, `server/db/*`, `server/domain/*`, `server/migrate.ts`, `infra/vm/*`.

What is solid (V): one process, no framework, Node's built-in SQLite with WAL; writes are serialised through one queue with a one-second wait that answers a retryable 503 (`server/db/persistence.ts:112-126`); graceful shutdown drains requests (`server/main.ts:3639-3649`); boot refuses a missing volume or a failed integrity check (`server/db/sqlite-schema.ts:8-9`, `server/main.ts:73-83`).

**S1 · high · J — Two products share one server: the live SQLite path and a larger gated PostgreSQL path.**
- Evidence: `server/main.ts` is 3 710 lines and registers 90 routes itself; it branches on the backend 33 times; the domain folder adds dispatch, ride lifecycle, ledger, payments, ops, phone identity, Entra, Google routing, private objects and resource scope, each PostgreSQL-only or off by environment (`server/domain/runtime-readiness.ts:10-14`, `server/db/runtime.ts:20-21`). `server/db/runtime.ts:21` refuses PostgreSQL outside tests and staging.
- Impact: every change to the live path must be reasoned about on both backends, and reviewers spend most of their time on code no user runs. The risk is not speed, it is mistakes on the path that carries parcels.
- Fix: decide once (open question 15). If PostgreSQL is not going live within a quarter, freeze it: no new PostgreSQL-only features, and extract the live parcel routes (auth, orders, jobs, location, cash, admin) into files as they are touched. Do not rewrite. Effort L spread over normal work. Eng, decision from the owner.

**S2 · medium · V — SQL is translated from SQLite to PostgreSQL by regular expressions at run time.**
- Evidence: `postgresSql` (`server/db/persistence.ts:32-46`), described in its own comment as "not a general SQL parser".
- Impact: a new query that is valid on SQLite can silently mean something else on PostgreSQL. The persistence test suite is the only guard.
- Fix: keep it while PostgreSQL is test-only. If the cutover happens, port the remaining `?` queries to native PostgreSQL once and delete the translator.

**S3 · medium · V — The SQLite schema evolves by "add the column if missing" at boot, with no version table.**
- Evidence: `server/db/sqlite-schema.ts:134-175`, `:272-297`; `user_version` stays 3 on purpose so an old image can open the file.
- Impact: additive changes are safe and make rollback easy, which suits a single VM. A change that is not additive has no mechanism, and nobody can list what a given database has had applied.
- Fix: keep additive-only as a rule and write it at the top of the file. Add nothing else.

**S4 · medium · V — Serialising an order list costs several queries per order, twice.**
- Evidence: `toOrder` calls three per-order summaries (`server/main.ts:289-291`); the client adds `journeyProtocol=1` to every orders call (`src/api.ts:28-29`) and the server then re-reads each order to decorate it (`server/main.ts:3542-3563`, "one re-read per card"); the customer home polls `/orders` every 10 s (`src/app/(customer)/index.tsx:23`) and the first page holds up to 200 ended orders (`src/model.ts:57`).
- Impact: none at 50 users. A shop with 200 past orders costs over a thousand synchronous queries every 10 seconds while their home screen is open; a few such users will be felt by everyone because SQLite calls block the one thread.
- Fix: return 20 ended orders on the first page instead of 200, and skip the journey decoration for ended orders. Effort S. Eng. Do it before inviting shops.

**S5 · medium · V — State that only works with one process.**
- Evidence: live-fix waiters (`server/main.ts:2722`), route cache (`:2771`), email code key (`:797`), share reference key (`:1994`), Firebase send guard (`:759`).
- Impact: a second API instance would break live tracking and codes. This is fine: one process is the right design here. It only matters as a reason not to "scale out" casually.

**S6 · high · D — Backups: nightly, about a day of loss, both copies depend on Azure or one PC, and a rebuild has never been run.**
- Evidence: `infra/vm/wind-backup.sh` (nightly `VACUUM INTO`, integrity check, upload to Blob in the same subscription); `docs/operations/restore.md:24` (up to a day lost), `:45` ("Not rehearsed: this replacement path was never run end to end"; the environment file, Caddy file and cron file "are not in any backup"), `:47` (four-hourly copies on the owner's PC, encrypted to that Windows account), `:56` (no retention rule).
- Impact: with the subscription in a warned state, the VM disk and the Blob copies share one fate. If the owner's PC task is not running, there is no copy outside Azure. A rebuild would be improvised during an outage.
- Fix: this week, download the newest Blob copy to a second place outside Azure and confirm the PC task's last file date. Then run the replacement-host procedure once on a throwaway machine and time it; put the environment file's secrets in the owner's password manager. Hourly copies are a one-line cron change if a day of loss is too much. Effort M. Eng plus owner (secrets, second storage location).

**S7 · low · V — Dead and leftover code ships in the production image.**
- Evidence: `server/domain/opencode.ts` spawns an AI coding CLI from an admin route; it refuses in production (`:25`), but it is registered in the live server (`server/main.ts:599-600`); `package.json` carries `zroScripts`; `railway.json` files remain; `server/main.ts:72` has a stray provider comment.
- Fix: delete the opencode module, its routes, its test and the leftover scripts. A process-spawning route has no place in this API. Effort S. Eng.

**S8 · low · V — Small per-request costs:** authentication runs twice per request (`server/main.ts:3473`, `:3475`, deliberately, to re-check after a slow body) and routes are matched by scanning every regular expression (`:3471`). Neither matters at this size. Leave them.

---

## 8. Security

What is solid (V): role and ownership checks on every write, re-checked after the body is read (`server/main.ts:3473-3476`); bodies capped at 20 KB (`:3427`); durable rate limits on login, registration, reset, price, route, offers, chat, tracking links (`:3450`, and per route); client address taken from the proxy's last hop, not the caller's header (`server/domain/client-address.ts`); push endpoints restricted to known push hosts (`server/push.ts:100-105`); strict CSP on the web app; HSTS; dependency audit in CI; no secrets found in tracked files (pattern scan for private keys and cloud keys).

**X1 · high — Unverified identity and password-only admin.** See I1, I2, A1. These are the security findings that matter.

**X2 · medium · V — The map page allows inline scripts and is served without the server's CSP header.**
- Evidence: `script-src 'self' 'unsafe-inline'` in the page's meta tag (`public/map.html:12`); the header is skipped for this file (`server/main.ts:138`).
- Impact: low in practice: the page takes its data by `postMessage` and draws with MapLibre. It matters only if order text is ever written into the page as HTML.
- Fix: move the inline module to a file and drop `'unsafe-inline'` when the page is next touched. Effort S. Eng.

**X3 · medium · V — Long-lived shared secrets.**
- Evidence: the partner API uses one static key (`server/main.ts:1760-1766`); the registry login in the release workflow is a username and password secret (`.github/workflows/release-image.yml:24-27`).
- Fix: rotate both on a calendar reminder; scope the registry credential to push only. Effort S. Owner (accounts).

**X4 · medium · D — Personal data is kept in backups forever.**
- Evidence: `docs/operations/restore.md:56`: no lifecycle rule; deleted accounts' data stays in old copies.
- Fix: a 30- or 90-day lifecycle rule on the container once the restore drill is done. Effort S. Owner (retention decision).

**X5 · low · V — Handover and return codes are stored in clear and visible to admins.**
- Evidence: `handover_code` column, shown to admins for recovery (`server/main.ts:311`). Acceptable: the code is short-lived and admin recovery needs it.

**X6 · low · V — Open CORS (`*`).**
- Evidence: `server/main.ts:3453`. Correct for a bearer-token API with no cookies. No change.

**X7 · medium · J — Registration has no bot check.**
- Evidence: 20 registrations per address per 10 minutes is the only limit (`server/main.ts:3450`), and drivers each trigger an admin push (`:673`).
- Impact: a script can fill the user table and squat numbers (I1). Phone verification fixes this too; do not add a CAPTCHA.

---

## 9. Reliability and operations

**O1 · critical · D — Production is down and only the owner can bring it back.**
- Evidence: `docs/CURRENT-WORK.md:3`: Azure stopped `wind-vm` at 00:58 UTC on 12 November, subscription state `Warned`. Two days earlier GitHub Actions was also blocked for a failed payment (`docs/CURRENT-WORK.md:7`).
- Impact: no bookings, no tracking, no maps on Android (M5). Parcels that were in transit at 00:58 are in couriers' hands with no app. Every hour also teaches pilot users that the app is unreliable.
- Fix: the owner pays the Azure balance and starts the VM. Then: check `/api/ready` from outside, check OSRM, run the backup script by hand, and phone every customer and courier with an open order. Two billing stops in three days means the payment method itself needs fixing, not only this invoice. Effort S. Owner.

**O2 · critical · D — No proven outage alert reaches a person.**
- Evidence: the outside check is an hourly GitHub cron that "emails whoever last changed this schedule" (`.github/workflows/uptime.yml:3-8`); `docs/PILOT.md:47` and ledger row 6 say receipt is not proven; the on-VM watchdog restarts containers and writes to syslog only (`infra/vm/wind-watchdog.sh:15-17`); the missed-backup alert is sent by the API, so it cannot fire when the API is down (`server/main.ts:1214-1223`).
- Impact: the monitor shares a failure mode with the thing it watches (an account's billing), and its granularity is an hour.
- Fix: a free outside monitor on `/api/ready` and on one tile URL, checking every one to five minutes, alerting the owner's phone by call, SMS or Telegram, on an account unrelated to Azure and GitHub. Add a heartbeat URL that the backup script pings on success. Prove it by stopping the API container for five minutes. Effort S. Owner (account, phone number); Eng to wire and prove.

**O3 · high · D — About 80% of Wind's Azure spend is a Container App nobody uses.**
- Evidence: `docs/operations/cost-model.md:16-17`: extra Container App `wind-api` 29.45 USD month to date on 10 November, against 2.31 USD for the production VM; ledger row 4 says cleanup waits for the owner's authorisation.
- Impact: roughly 90 USD a month wasted on a service whose own VM costs under 10, on a subscription that has just been stopped for non-payment.
- Fix: the owner authorises deleting it (or scaling it to zero today). Set an Azure budget alert at a small figure to the owner's email. Effort S. Owner.

**O4 · high · V — Every installed app is tied to a hostname that belongs to this Azure subscription.**
- Evidence: the API URL baked into builds is `https://windapi236.swedencentral.cloudapp.azure.com` (`.github/workflows/ci.yml:57`, `release-image.yml:44`, `docs/PILOT.md:18`); there are no over-the-air updates (no `expo-updates` in `package.json`).
- Impact: if the subscription is lost, or Wind moves to another provider or region, every installed APK stops working until each user installs a new one by hand. The lack of a domain is also the reason email verification is off (I2).
- Fix: buy one domain. Point `api.<domain>` at the VM through Caddy, keep the old name working, build the next APK against the new name. The same domain gives a sending address for email and a stable page for the APK link. Effort S. Owner (a few dollars a year, registrar account).

**O5 · high · D — A rebuild on a new host has never been run.** See S6.

**O6 · medium · D — One small VM runs the API, routing and the proxy.**
- Evidence: `docs/operations/deploy.md` ("one VM … running `wind-api`, `wind-osrm` and Caddy"); `infra/osrm/build-west-bank.sh:5` calls it a 1 GB VM.
- Impact (J): one machine is the right number for 50 users. One gigabyte shared with a routing engine is thin: a memory spike takes everything down together, and a graph rebuild needs swap.
- Fix: after O1–O3, look at a week of memory use. If it is tight, move one size up (a few dollars a month, far less than O3 saves). Effort S. Owner (cost).

**O7 · medium · V — Logs live only in the container, 100 MB rolling.**
- Evidence: `--log-opt max-size=20m --log-opt max-file=5` (`infra/vm/deploy.sh:36`); ledger row 45.
- Impact: the support reference shown to users (`server/main.ts:3584`) points at a log line that may have rotated away or died with the VM.
- Fix: a nightly copy of the day's log next to the database backup. No log platform. Effort S. Eng.

**O8 · medium · V — Deploys are manual, briefly offline, and not tied to CI.**
- Evidence: `infra/vm/deploy.sh` stops the old container before starting the new one (`:31-33`) and rolls back code only; the release workflow "does not check the candidate's CI itself" (`docs/operations/deploy.md:38`); the script has no lock (`deploy.sh:8`).
- Impact: a few seconds of downtime per release is fine. The human step of checking CI is where a mistake will happen.
- Fix: make the release workflow fail unless the commit's CI run is green. Effort S. Eng.

**O9 · medium · J — There is no place to try a release before production.**
- Evidence: staging templates exist but nothing is deployed (`docs/operations/deploy.md`, "IaC preparation"); phone tests use a sandbox on the test PC.
- Fix: not a staging environment. The test PC sandbox plus digest-pinned deploy with automatic rollback is enough at this size.

**O10 · medium · D — Incident handling is written for the system that is not live.**
- Evidence: `docs/operations/incident-and-degraded-mode.md` speaks of PostgreSQL, workers and Web PubSub; nothing says who phones couriers when the API is down.
- Fix: half a page for today's system: who is called, how couriers finish deliveries without the app (the sender reads the code by phone, the courier notes it on paper), how the admin reconciles afterwards. Effort S. Owner and Eng together.

---

## 10. Mobile delivery

**P1 · high · V — No over-the-air updates: every client fix needs a new APK that each user installs by hand.**
- Evidence: no `expo-updates` dependency (`package.json`); `docs/CURRENT-WORK.md` repeats that client changes reach Android only in a new APK; several fixes from 10–12 November are waiting for one.
- Impact: fixes L1, L2, D1 and others reach users only when each of them reinstalls. At 50 known users that is a phone call each; at 500 it does not happen.
- Fix (J): the standard answer on Expo is EAS Update for JavaScript-only changes, with a runtime version tied to the native build. It is worth adopting before growing, because it turns most client fixes into a silent update. Read the Expo 57 documentation first (`AGENTS.md` forbids relying on memory), and prove one update on the A53. Effort M. Eng; Owner if the EAS plan needs paying.

**P2 · high · V — The forced-update gate cannot tell two builds of the same version apart, and may have nowhere to send the user.**
- Evidence: `CLIENT_BUILD = 10100` is derived from the app version 1.1.0, not the Android build number (`src/api-client.ts:18-19`), so builds 1.1.0 (23) and 1.1.0 (24) report the same value; the update screen shows a download button only if the build was made with `EXPO_PUBLIC_UPDATE_URL` (`src/api.ts:22-23`, `src/app/_layout.tsx:92`), and `docs/operations/deploy.md:32` warns not to set the minimum before that.
- Impact: a broken build cannot be retired without also bumping the version, and a retired build may show a dead end.
- Fix: bump the version on every release (simplest), set the update URL to a page on Wind's own domain (O4) in every build, and add a gentle "a newer version is available" notice driven by a "latest build" value from the server. Effort S. Eng.

**P3 · medium · D — The APK is a link sent by hand.**
- Evidence: `docs/PILOT.md:12-16`; the build is an EAS internal-distribution build (`eas.json`, `docs/CURRENT-WORK.md`).
- Fix: host the signed APK at one stable address on Wind's domain with the install steps in Arabic. Effort S after O4.

**P4 · medium · J — Play Store readiness is mostly paperwork, and it is not started.**
- Evidence: background location is declared (`app.json`), which Play reviews with a declaration and a video; privacy and account-deletion pages exist (`server/main.ts:86-87`); the Firebase project in use is named `wind-development` (`docs/PILOT.md:53`); the terms page is under 3 KB (`server/terms.html`); the owner's legal review has not happened (`docs/PILOT.md:55`).
- Fix: after legal (G5): a developer account in the business's name, data-safety form, background-location justification, closed testing track with the pilot users. Effort M. Owner.

**P5 · low · D — iPhone users get the web app only.**
- Evidence: `docs/PILOT.md:18`. Closed-app alerts depend on the browser. Acceptable for the pilot; do not build native iOS now.

---

## 11. UX, accessibility, Arabic and RTL, low-end Android

What is solid: I opened the Arabic booking, live-order, driver-jobs and admin-dashboard screenshots. Layout is coherent in RTL, the back arrow faces the right way, the order code and handover digits stay left to right, touch targets are large, and errors sit next to fields. The 9 November design audit found and fixed a clipped Arabic label seen only on the A53 (`docs/DESIGN-AUDIT-2026-11-09.md:33`).

**U1 · high · D — No person has used the app with TalkBack.**
- Evidence: `docs/PILOT.md:52`; ledger row 17. Labels exist in code (`accessibilityLabel` appears throughout `src/ui.tsx`), but the map pin can only be adjusted by sight.
- Fix: one hour with a person and the A53: sign up, book by search (no pin), track, deliver. Fix what they hit. Effort S to test. Owner (find the person).

**U2 · medium · V — Text scaling is capped at 135%.**
- Evidence: `maxFontSizeMultiplier={1.35}` on the shared text component (`src/ui.tsx:200`).
- Impact: people who set a larger system font get less than they asked for. The cap protects layouts; the cost falls on older users.
- Fix: raise the cap on body text only and check the three busiest screens at 200% on the phone. Effort S–M. Eng.

**U3 · medium · V — No list is virtualised.**
- Evidence: no `FlatList` anywhere in `src/`; history pages hold 200 orders (`src/model.ts:57`).
- Impact: a customer or courier with a long history renders 200 cards at once on a mid-range phone, and re-renders them on each 10-second poll.
- Fix: the same change as S4 (20 per page) removes the problem without a new component. Effort S. Eng.

**U4 · medium · D — Cold map on slow data.** See M2.

**U5 · low · V — RTL is handled by hand in each component.**
- Evidence: `"supportsRTL": false` (`app.json`); direction comes from the language context in `src/ui.tsx`. It works and lets the user switch language without a restart; every new component must remember it. The screenshot run in both languages is the guard. Keep it.

**U6 · low · V — Light theme only, portrait only.**
- Evidence: `app.json` (`userInterfaceStyle: light`, `orientation: portrait`). Fine.

**U7 · medium · J — The courier's main screen opens with a location warning, a filter row, and disabled dashed buttons before any job is readable.**
- Evidence: `docs/screens/ar/driver-jobs.png`. The first job's price and route are below the fold on a 390×844 screen; the accept buttons look disabled with the reason in small text under them.
- Fix: collapse the "heading to" filter into the existing top-left filter button and show the reason on the button itself. Effort S. Eng. Confirm with two couriers before changing.

---

## 12. Testing and CI

What is solid (V): 131 suites run on every push including a real PostgreSQL for the persistence suite (`.github/workflows/ci.yml`); races, replays and lost acknowledgements are tested on both backends; the deploy script itself is tested; six browser suites drive the exported web app; every screen is screenshotted in both languages.

**T1 · high · V — The browser suites are not in CI.**
- Evidence: `ci.yml` runs typecheck, lint, `npm test`, the audit, an export, the persistence suite and an image build. `test:scenarios`, `test:location`, `test:jobs-ui`, `test:access`, `test:readiness` and `test:tulkarm` run only when someone runs them on the test PC (`docs/CURRENT-WORK.md:5`).
- Impact: the only tests that click through the app depend on one person's machine and memory.
- Fix: add a CI job that exports the web app, starts the API and runs `test:scenarios` and `test:access` headless. Leave the OSRM-dependent suite on the test PC. Effort S–M. Eng.

**T2 · medium · V — About twenty client tests assert on source text.**
- Evidence: 20 of the files in `tests/` read `src/` or `server/` files as strings; for example `tests/booking-submit-guards.test.mjs:16-19` asserts that `book.tsx` contains `onSubmitEditing={submit}` and slices functions out of the file by their first line.
- Impact: a harmless rename fails tests, and a real behaviour change can pass them. It makes B4 expensive.
- Fix: no new framework. When a screen is split (B4), move the logic under test into a plain module and test that, as `src/booking.ts` already is. Effort folded into B4. Eng.

**T3 · medium · D — Nothing automated runs on Android.**
- Evidence: phone runs are manual sessions recorded in `docs/CURRENT-WORK.md`; the client changes merged on 12 November had "no APK build or phone run".
- Fix: keep it manual, but make it a fixed ten-minute checklist per APK (sign in, book, accept, track with the screen locked, deliver with the keyboard open) rather than an ad hoc session. Effort S. Eng.

**T4 · medium · D — The persistence suite fails on the test PC under load.**
- Evidence: `docs/CURRENT-WORK.md:5` ("died on the known 'Connection terminated due to connection timeout'").
- Impact: a known-flaky gate trains people to ignore red. CI is the signal for now.
- Fix: find the cause once (pool size against the checkpoint load on that machine) or stop running it there. Effort S–M. Eng.

**T5 · low · V — CI runs twice for a pull request branch** (`on: push` and `pull_request`), which doubles minutes on an account that has already hit a billing limit. Limit `push` to `master`. Effort S.

**T6 · medium · J — Process weight.**
- Evidence: 193 files under `docs/`, 224 tracked files of research notes, a "read me first" file whose opening paragraphs are each over a thousand characters, and a 48-row ledger in which "launch blocker" appears on 20 rows.
- Impact: the next person cannot tell what matters. A blocker list of 20 is not a priority list.
- Fix: one page, kept current: what is live, what is broken, the next five things. Archive the rest. Effort S. Eng.

---

## 13. Product and business gaps for growing past 50 users

**G1 · high · D — Cash only, with no per-order record.** See D4. A licensed payment provider is a contract and months of work (`docs/SYSTEM.md` §7.3); cash with a proper record is the right next step, not cards.

**G2 · high · D — No SMS or WhatsApp channel.**
- Evidence: `docs/SYSTEM.md` §9 ("Self-service signup has no SMS provider"); ledger row 20.
- Impact: no phone verification (I1), no code to the recipient (L1), no fallback when a push is missed (L7). One provider contract closes all three.
- Fix: the owner picks one provider that reaches Jawwal and Ooredoo numbers under both prefixes and funds a small monthly budget. Effort M after the contract. Owner.

**G3 · high · D — Support is one WhatsApp number.**
- Evidence: `docs/PILOT.md:38`; `SUPPORT_CONTACT`. No hours, no second person, no record of contacts.
- Fix: publish hours in the Help screen; name a second person for when the owner is unreachable. Effort S. Owner.

**G4 · medium · D — No policy for lost or damaged parcels, prohibited items, or who pays for a return.**
- Evidence: `docs/SYSTEM.md` §10 lists each as not implemented; disputes record a decision and an optional credit only (`server/main.ts:2022-2033`).
- Fix: a written one-page policy first; software after the first real cases. Owner.

**G5 · high · D — No legal review.**
- Evidence: `docs/PILOT.md:55`; `docs/SYSTEM.md` §7 lists the courier licence question, the e-payment obligation and insurance; the terms page is a stub.
- Impact: this, not code, decides whether Wind may take strangers' parcels for money.
- Fix: the owner takes the three questions in `docs/SYSTEM.md` §7 to a local lawyer or the ministry. Owner.

**G6 · medium · J — No measurement of the pilot itself.**
- Evidence: the dashboard shows totals; nothing reports time to assignment, share of orders expired or cancelled, delivery time, or repeat customers.
- Fix: one admin page computed from order timestamps that already exist (`assigned_at`, `picked_up_at`, `completed_at`). Effort S. Eng. This is what tells the owner whether to grow.

**G7 · medium · V — Shops are not a first-class customer.**
- Evidence: the model has customers, drivers and admins only (`src/model.ts:24`); "send another" copies the pickup (`src/booking.ts:72-78`); there is no bulk entry and no monthly statement. A partner API exists for one named partner (`server/main.ts:1759-1862`).
- Impact (J): repeat volume in parcel delivery comes from shops. Not for the pilot; it is the first feature after it.

**G8 · low · J — Third-party research material sits in the product repository.**
- Evidence: 224 tracked files under `research_notes/` describing the reverse engineering of another company's app, plus the related documents in `docs/`.
- Fix: the owner decides whether it belongs in this repository; moving it out costs nothing and simplifies any future sharing of the code. Owner.

---

## (a) Top 15 actions, by impact for effort

### Now (this week)

| # | Action | Findings | Effort | Who |
|---|---|---|---|---|
| 1 | Pay Azure, fix the payment method, start the VM, check readiness, routing and a manual backup, and phone everyone with an open order | O1 | S | Owner |
| 2 | Copy the newest database backup to a place outside Azure and confirm the PC backup task's last file | S6 | S | Owner + Eng |
| 3 | Delete or stop the unused Container App and set a budget alert | O3 | S | Owner |
| 4 | Outside monitor every 1–5 minutes on readiness and tiles, alerting the owner's phone, plus a backup heartbeat; prove it by a deliberate stop | O2, M1 | S | Owner + Eng |
| 5 | Buy a domain; serve the API on it alongside the old name; use it for email and the APK page | O4, I2, P3 | S | Owner + Eng |
| 6 | Restrict bookable cities on the server to the pilot's cities | B1 | S | Eng |

### Next (this month)

| # | Action | Findings | Effort | Who |
|---|---|---|---|---|
| 7 | Rehearse a full rebuild on a throwaway host from the off-site copy; store the environment secrets in a password manager | S6, O5 | M | Eng + Owner |
| 8 | Alert admins and tell the customer when an order is unassigned for 10 minutes; shorten the 24-hour expiry | L3, B6 | S | Eng |
| 9 | Next APK, part 1: handover code in the recipient's WhatsApp message with both prefixes; version bump; update URL; "newer version available" notice | L1, L2, P2 | S | Eng |
| 10 | Next APK, part 2: keep courier location sharing alive (battery exemption, resume after restart, "sharing stopped" push) and add the far-pickup check | D1, L4 | M | Eng |
| 11 | Verify email at signup on the new domain and send resets only to verified addresses; TOTP for the admin; per-address login lockout | I2, A1, I3 | M | Eng |
| 12 | Put the browser scenario suites in CI and make the release workflow require a green run for the commit | T1, O8 | S–M | Eng |
| 13 | Record cash collected per order at delivery, with actor and time; record cancel reasons; add the pilot metrics page | D4, L5, G6 | M | Eng + Owner |

### Later

| # | Action | Findings | Effort | Who |
|---|---|---|---|---|
| 14 | Legal review, real terms, backup retention, one SMS or WhatsApp provider, then phone verification and the Play Store listing | G5, G2, I1, X4, P4 | L | Owner first |
| 15 | Decide the database question; freeze or finish the PostgreSQL path; delete dead code; split the live routes out of `main.ts` as they are touched; adopt over-the-air updates | S1, S7, S4, P1 | L | Owner decision, then Eng |

## (b) What not to do

- **Do not cut over to managed PostgreSQL now.** The planned database alone is about 141 USD a month (`docs/operations/cost-model.md`) on a subscription that was just stopped for non-payment, to serve a load one SQLite file handles easily. The cutover adds risk (`docs/operations/restore.md` lists three unsolved rollback problems) and removes none of the risks in the top 15.
- **Do not add instances, Redis, WebSockets, a queue or a worker.** One process with long-polling is correct for this size, and five pieces of in-process state depend on it (S5).
- **Do not self-host tiles or Nominatim yet.** Monitor the free hosts and keep the documented switch.
- **Do not turn on rides, freight, dispatch, boarding codes, payments, Entra or the Google renderer,** and stop adding features that only work on PostgreSQL. Each is a second product to operate.
- **Do not build card payments.** That is a licensed-provider contract, not an engineering task.
- **Do not build staff roles, dual approval for cash, or a document-verification pipeline** while one person the owner knows does all of it.
- **Do not rewrite `main.ts` or `book.tsx`.** Extract when touching; a rewrite of working, tested code is the classic way to lose a pilot month.
- **Do not add a test framework, a visual-diff service, a log platform or a staging environment.** Two CI jobs, a nightly log copy and the existing rollback are enough.
- **Do not add more review layers or planning documents.** The ledger already has 48 rows; the constraint is owner decisions and phone time, not analysis.
- **Do not chase parity with large ride-hailing apps.** The pilot's questions are whether a parcel arrives, whether the courier is paid fairly and whether people order again.

## (c) Questions only the owner can answer

1. Azure: when will the balance be paid, what failed with the payment method, and is the VM's data disk confirmed intact? Would a prepaid host suit Wind better?
2. Is the four-hourly backup task on your PC installed and running? What is the date of its newest file?
3. May the unused Container App `wind-api` be deleted?
4. Which domain name, and who holds the registrar account?
5. Who receives outage alerts, on which phone, and who covers when you are unreachable? What are the support hours?
6. How many real users, couriers and orders did the pilot have between 7 and 12 November, and what did people say? I could not see production data, and the priorities above assume very low volume.
7. Which cities are in the pilot? Are Jerusalem and Gaza to be offered at all?
8. Who pays the delivery fee, the sender or the recipient? What should happen when a customer cancels after the courier has arrived?
9. Is the flat ₪20 working for couriers on intercity trips? Would two price bands be acceptable?
10. Will senders accept giving a pickup code as well as the handover code?
11. Was the installed build 1.1.0 (24) made with an update link? Where should the APK be hosted?
12. SMS or WhatsApp provider: which one, what monthly budget, and does it deliver to +970 and +972 numbers?
13. Legal: has anyone asked about the courier licence, the e-payment obligation over ₪500 and insurance? Who will review the terms?
14. How long may backups keep the data of people who deleted their account?
15. PostgreSQL: is a cutover still wanted before growing, given its cost, or should that path be frozen?
16. Should the third-party app research stay in this repository?
17. Play Store: is publishing planned, under an individual or a business account, and when?
