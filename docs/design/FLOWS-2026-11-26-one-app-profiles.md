# Wind flows: one app, three services, profiles you switch

Prepared 26 November 2026. Two independent studies were written separately, then merged:

- Claude Opus 5.5 (lead): [`.scratch/one-app-profiles/opus-proposal.md`](../../.scratch/one-app-profiles/opus-proposal.md).
- GPT 6.2 Sol at xhigh effort: [`.scratch/one-app-profiles/gpt-6.2-proposal.md`](../../.scratch/one-app-profiles/gpt-6.2-proposal.md).

§12 records where they disagreed and what was decided. A clickable sketch of the main flows is at <https://claude.ai/artifact/M7zMDXwXBp7g7uk51wKs8C> (private to the owner).

This document is the design authority for user flows, identity modes and the order of that work. [The continuation plan](../PLAN-2026-11-26-CONTINUE.md) remains the authority for release, acceptance and operations; §11 places these slices in it.

Words used below: **mode** = the profile you are using right now. **Derived role** = the role the server computes from your account and your mode. **Revision** = a counter that goes up each time a phone switches mode; a request sent before a switch is refused (the *fence*). **Person lock** = the server handles one switch, accept or booking per person at a time. **Shadow** = the new rules are computed and logged but not yet enforced. **Online** = a captain who has pressed Go online and can receive work. **Work GPS** = location the phone sends as a captain: for a job in hand on both engines, and for availability on PostgreSQL only. **Custody** = a captain holding a parcel or shop order. **Ride due** = a ride you booked as a rider that is searching, assigned, in progress, or within 2 hours of its scheduled pickup. **Re-check** = an approved captain's profile checked again after a vehicle or identity change (`captain_state = 'review'`). **Finish and settle** = Captain mode that can complete jobs in hand, hand over cash and show earnings, but gets no new work. **COD** = cash collected for goods at the door.

Labels: **[source]** = read in this checkout at `d8acdda4`, with file:line. **[practice]** = what Uber, Careem, Bolt, Grab or Facebook ship. **[proposal]** = a decision made here. Every number marked *target* is a budget to measure against, not a measurement.

---

## 0. The answer on one page

1. **One person, one sign-in, several profiles.** Everyone has a **Personal** (customer) profile. From inside the app a person can add a **Captain** profile ("Become a captain") and a **Shop** profile named after the shop ("Open a shop"). Both are approved by an admin, as today. Staff keep separate, operator-enrolled admin accounts that never appear in the switcher. This is the Facebook Page pattern the owner named: one login, a switcher on your own picture, and the app becomes that identity.
2. **The switcher is on your picture.** It sits at the top of Account in every mode, with a shortcut on the identity chip at the top of each home. The sheet lists your profiles with live state ("Captain · offline", "Sultan Sweets · 3 new orders"). It also offers the profiles you can add. A dot on your picture means another profile needs you.
3. **Each mode is a small app with three or four tabs.** Personal: Home · Orders · Account. Captain: Jobs · Trips · Earnings · Account (today's four). Shop: Orders · Catalogue · Shop · Account. Account is always last, so the switcher is always in the same place.
4. **The server decides the mode.** The session stores the active mode and a revision number. The session resolver (`server/main.ts:4324`) turns them into the role that most checks already read. The places that read the stored role directly are listed in §8.3 and changed one by one. Leaving Captain mode ends availability: no job alerts, no board, no work GPS. A captain carrying a job cannot switch, and nobody is ever matched to their own order. A write sent under an old revision is refused, so a stale screen cannot act in the wrong mode. Role still comes from the server session (ONE-01). ONE-01's "one profile per person" wording would change to "one Personal profile plus approved work profiles". F0 proposes that edit for the owner to confirm.
5. **Personal home asks one thing at a time.** Ride · Send · Shop sit directly above one input, whose words follow the choice ("Where to?", "Where are you sending it?", "Deliver to"). Large load is the biggest size under Send. Booking defaults to here, now, cash and the smallest size, so a saved place should book a ride in three taps (*target*, checked in F0 and F7).
6. **Sign-up becomes personal.** It asks for name, phone, password and consent. Email becomes optional, as SRS §1.3 already says. Both self-service reset paths, the email sender and Firebase reset, need an email on the account [source `server/main.ts:998, 1118-1124, 957`; `server/domain/firebase-reset.ts:8-14`]. The pilot's email sender is still blocked (G-EMAIL). Once a reset path is live in production, Account asks for an email after the first order and verifies it. A person without an email recovers the account through support. Firebase reset must require a *verified* email before it is switched on: today `accountFor` skips that check on the Firebase path [source `server/main.ts:1116, 1120`], so a mistyped address could reset someone else's account. ACC-03 says email reset MUST be available; F0 puts this trade-off to the owner (§10). Vehicle, plate and documents move into the in-app captain application, which ships in the same slice, so drivers can still join.
7. **Speed: one map, kept alive.** Today Home, booking, tracking and Jobs each start their own map WebView (§1 D7). One map host behind those screens should remove the reloads and survive mode switches (*target*, measured in F2). Shop and list screens draw no map. Cached data paints the first frame, and a text route stays usable when tiles are slow.

---

## 1. What makes the app feel complex today

| # | Finding | Evidence | Effect on a real person |
|---|---|---|---|
| D1 | A phone number holds one role | `phone UNIQUE`, `role IN ('customer','driver','admin')` [source `server/db/sqlite-schema.ts:14-15`]; registration resolves one stored role [source `server/main.ts:569-583, 890-900`] | A captain cannot order a taxi for his mother or send a parcel with his own number. He needs a second SIM. |
| D2 | The role is chosen at sign-up, with vehicle and plate | [source `src/app/auth.tsx:221-245`; `docs/screens/en/sign-up.png`] | A new customer meets "Driver", "Truck" and "Plate number" before seeing a price. |
| D3 | Each role is its own app inside the app | `Stack.Protected` per role [source `src/app/_layout.tsx:118-143`] | Correct for safety, but a person with two jobs must sign out and in. |
| D4 | Shop is buried | "My shop" sits in Account's lower list, after Language, Password, Notifications, Appearance and Road status, shown even to people without a shop; `/merchant` is the application, the review status and the inbox in one route [source `src/parts.tsx:524-525`, `src/app/merchant/index.tsx:18-26`] | The most time-critical user scrolls past invite codes to reach new orders. |
| D5 | Four tiles plus "Where to?" plus "Later" compete in one area | [source `src/app/(customer)/index.tsx:150-167`; `docs/screens/en/home.png`] | The person chooses a category before saying anything they know. "Where to?" silently means Ride, or Parcel when rides are off. |
| D6 | Taps to a placed order (warm app, signed in, typing excluded) | Ride **6** with two new town pins, **3** with a saved destination; parcel **7**; shop order **7** [GPT study §1, from `src/app/book.tsx:236-735`, `src/app/shop/cart.tsx:155-206`] | The baseline that every slice must lower or keep. A first install adds 4–6 taps for slides and sign-up. |
| D7 | Every map screen starts its own map | Home renders `{focused && <SceneMap …>}` [source `src/app/(customer)/index.tsx:124`]; booking [source `src/app/book.tsx:619`]; tracking [source `src/app/order/[id].tsx`]; Jobs [source `src/app/driver/index.tsx:218`]; the four core MapLibre files plus `map.html` are about 1.2 MiB unpacked before tiles and glyphs [GPT study §1] | Home → Book → Order can boot MapLibre three times. On a budget phone over 3G each boot is a grey moment. |
| D8 | Launch waits for a 1.6 s intro, then three slides | [source `src/intro.tsx:8`, `src/app/welcome.tsx:13-54`] | Time before anything useful. |
| D9 | Roads (checkpoints) sit under Account | HOME-05 "P" [source SRS §4.2] | The thing every traveller checks first is three taps deep. |
| D10 | "Heading to" lets in any job that ends in the heading town | `o.dropoff_city = heading` in the board query and `r.dropoff_city === heading` in `fits` pass whatever the pickup [source `server/main.ts:2722, 2728`] | A captain heading Tulkarm → Ramallah can be shown Jenin → Ramallah, which is not on the way. It predates the along-the-way decision (D-9). It is fixed in slice F9, not silently changed now. |

Already right, and kept: map-first home, landmark-first places, button reasons, idempotent create and booking recovery, actor-named status, handover codes, one `orders` record, one receipt, cash rules, and native notification taps that wait for the signed-in session and check its role [source SRS §2; `docs/REA/2026-11-15-competitor-apps-vs-wind.md`; `src/native-push.ts:22, 30-35, 60-62`]. Web push today goes to every subscription of the person [source `server/main.ts:1564`]; §8.3 changes that.

---

## 2. Profiles

### 2.1 Who exists

| Profile | Who | How it starts | States | Look |
|---|---|---|---|---|
| Personal | Every non-staff account | Sign-up | Account active / blocked (existing policy) | Base Wind colours |
| Captain | A person approved to drive | Account → Switch profile → Become a captain | draft → under review → action needed / approved → paused or in review again; rejected with reason. Only approved and active takes new work | Header reads "Captain · Offline/Online". Appearance "Automatic" already turns Night for captains after dark [source `src/theme-context.tsx:2`] |
| Shop | The owner of one merchant (`owner_user_id UNIQUE` [source `server/db/postgres-shop.sql:14`, `server/db/sqlite-shop.ts:6`]) | Account → Switch profile → Open a shop | draft → under review (`pending`) → approved (`active`) → `paused` with a reason (manual or licence); a separate `paused_new` flag stops new orders; open or closed by its hours | Shop name and initial as the avatar, clay accent on the badge only |
| Admin | Staff | Operator enrollment | Existing duties | Never in the switcher; the switch API refuses operator sessions |

- A **pending** captain keeps full Personal access while waiting. Today a pending driver cannot use the app at all.
- A **captain pause** (cash shortfall, expired papers) or a re-check (vehicle changed) affects the Captain profile only. A paused captain can still open Captain mode to finish jobs in hand, hand over cash and see earnings, but gets no new work. An **account block** affects everything. Either way the person is told why and whom to contact, at sign-in and by push (Android since 26 November; ACC-07; continuation plan §4).
- **Multi-shop** (several branches per person, staff seats) comes later. A second branch becomes another row in the switcher.

### 2.2 The switcher

```
Account (top card)           Switch profile (sheet)
┌──────────────────────┐     ┌──────────────────────────────────────┐
│ (ل) Laila         ⌄  │ ──► │ (ل) Laila                       ✓   │ Personal · 1 order on the way
│     Personal          │     │ (🚗) Laila · Captain                  │ Offline · go online to see jobs
└──────────────────────┘     │ (ح) Sultan Sweets            ●       │ Open · 3 new orders
                              │ ADD A PROFILE                        │
                              │ +  Become a captain                  │ only if none
                              │ +  Open a shop                       │ only if none
                              └──────────────────────────────────────┘
```

- **Counts show only things you can act on:** new shop orders, a consent request, a review decision. They never show customer names or order details.
- **Rows that are not fully active** open only what works. A captain application (draft, under review, action needed, rejected) opens its status screen in Personal. A Captain profile under re-check, paused or closing opens Captain mode for finish and settle. A pending shop opens Shop mode with its application status and catalogue drafting. A paused shop opens Shop mode to finish accepted orders, with no new ones. Each shows the next action ("Upload your licence", "Renew licence").
- **Switching:** a 300 ms identity card ("Captain · Laila") covers the server round trip. The new home appears only after the server confirms. If the reply is lost, "Checking your profile" reconciles by revision; the app never trusts its local choice alone. With reduced motion, the card does not move.
- **Memory:** the app reopens in the last **server-confirmed** mode. Captain mode always reopens with Online off; a job in hand opens on its own screen. A new sign-in opens Personal, except for a person whose `captain_state` is set (an approved captain, including re-check, paused or closing), whose sign-in opens Captain mode with Online off, as today. That happens only when no other phone holds Captain mode; otherwise the sign-in opens Personal and says why.
- **Drafts stay put:** a Personal cart or booking draft survives a trip into Shop mode and back. Shop drafts belong to their shop.

### 2.3 Switch rules (server-enforced)

| From → To | Allowed when | Otherwise |
|---|---|---|
| Personal → Captain | `users.captain_state` is set (active, re-check, paused or closing; never for an application that was never approved), and no other phone holds Captain mode (Two phones, below). Finish and settle (jobs in hand, cash handover, earnings) is then always reachable. **Going Online** also needs `captain_state = 'active'` and no *ride due* [proposal: no new captain work while your own ride is due, extending CON-01 and CON-02] | Go online refused: "You have a ride booked for 14:30. You can go online after it ends." |
| Captain → anything | Offline, nothing in hand | **Online, nothing in hand:** one confirm, "Go offline and switch?". The server clears Online (`captain_online_at` on SQLite, the presence lease on PostgreSQL), pending offers lapse and the phone stops location tasks before the new mode renders. **Work in hand** (assigned, at pickup, in transit, on hold, returning, or holding goods in the SHIP-10 custody chain): refused, with "Finish your current job to switch" and a "Resume job" button. Release follows its own path from the job screen, never silently. |
| Any → Shop | You own a shop (any state) | Access follows the shop's state (§2.2): pending drafts, paused finishes, active is full |
| Shop → anything | Always; entering Captain still follows the Captain rules | If orders are new or unfinished, one "Continue" that shows the count. The shop stays open; "Pause new orders" is a separate control. Alerts keep ringing. |
| Races | Switch, go-online, accept, admin assign and a Personal ride create are serialized per person | The first to commit wins; the other sees the real state. **Online is defined as "the Online flag is set and there is no ride due"**, in one server predicate that every board, alert, dispatch, accept and assign check uses (§8.2). So the moment your own ride becomes due, by booking it or by the clock reaching 2 hours before a scheduled pickup, you get no new work, and a worker tick tells you and clears the flag. Jobs already in hand carry on, because job steps never depend on Online. Booking a ride that is due when booked (now, or for a pickup within 2 hours) while Online with nothing in hand asks first, "You are online as a captain. Book and go offline?"; with work in hand, such a booking is refused. Nothing changes silently. |
| Own work | Always | Nobody is offered, assigned or allowed to accept their own order, and a shop owner never delivers their own shop's orders (§8.3) |
| Two phones | One Captain-mode phone at a time | Only one session per person can be in Captain mode. A sign-in never moves it; only a session end or expiry frees it. A sign-in on another phone opens Personal with "Captain mode is open on another phone. To drive here, sign that phone out." **Sign out other phones** (Account, needs the password, with the password-change rate limit and key derivation [source `server/main.ts:1217-1229`]) ends the other sessions, as a password change already does [source `server/main.ts:1225`]. Work in hand stays assigned to the person, so this phone can then enter Captain mode and resume the job; a lost or dead phone strands nothing. Every session end (sign-out, password change or reset, support reset, admin edit, operator promotion, account delete, expiry [source `server/main.ts:961, 1010-1011, 1160, 1171, 1225, 1309, 3960, 4174, 4536, 4577`]) frees Captain mode the same way and writes an audit event when a job was in hand. The password is the account, as today, so anyone holding it can do this; that risk is unchanged by this design. |

**Notifications** carry their target profile and object. Captain work is sent only to the phone in Captain mode. Other phones get a neutral "You have captain work. Switch to see it", with no job detail (§8.3). A tap loads the session, verifies on the server that the person still holds that profile and object, then offers the switch. If Captain is locked by a job, the event waits in Account with its count. An expired or revoked event opens a safe status screen.

---

## 3. Tabs and homes

| Mode | Tabs | Home, top to bottom |
|---|---|---|
| Personal | Home · Orders · Account | Map behind a sheet; identity chip and Roads chip on the map; the active ride or most urgent order first, then compact cards for every active order (CON-10); Ride · Send · Shop above one input; at most two saved or recent places while collapsed. Orders has Current / Past and a service filter. |
| Captain | Jobs · Trips · Earnings · Account | Jobs: Offline/Online header, Go online or Resume trip; online shows one paged board across services with word+icon badges, route, payout, cash to collect, rating; filters and "Heading to" behind one button, the applied heading shown as a chip. Trips: the active run sheet first, then history. Earnings: take-home, cash held and amount due, with the cap meter. |
| Shop | Orders · Catalogue · Shop · Account | Orders: Open / Closed / Paused and its reason in the header; New first with the accept deadline, then Preparing, Ready, Done. Catalogue: items, prices, availability. Shop: hours, pause, licence, statement and payouts. No map. |

Rules: no mode has more than four tabs. A tab never shows another mode's work. The service colour is used only on the icon and badge (ONE-12). In Arabic, the route spine, tab order and chevrons mirror, while phone numbers, money and codes keep their own direction.

---

## 4. How the services relate

### 4.1 Booking from the Personal home

```
[ Ride ] [ Send ] [ Shop ]          ← one choice, remembered
┌──────────────────────────────┐
│ 🔍 Where to?                 │     Ride: "Where to?"  ·  Send: "Where are you sending it?"  ·  Shop: "Deliver to <saved address>"
└──────────────────────────────┘
   ↓ saved place / search / town → pin with landmark
Review sheet: route, defaults (here · now · cash · 1 rider or small parcel), price from the server quote, one Confirm
   ↓ only if the choice needs it: seats (Shared), recipient name+phone (Send), size/access (large item)
```

- Defaults: Ride is one rider, private, now. Send is a small standard parcel. Shop uses the last confirmed delivery address as an editable suggestion. Later lives in the review sheet, not on the home.
- Changing the service before Confirm keeps compatible places and refreshes the quote.
- Ride · Send · Shop show only enabled lines (ONE-13).

### 4.2 Relations

| Moment | Shared experience |
|---|---|
| After a ride | "Send something to this address" in the finished order's secondary actions: a parcel draft with only the destination copied. It does not create an order or promise a pooled car. |
| Places and reorder | One set of named places for every line. "Book again", "Send another (keep pickup)" and "Order again" (today's cart, with changes flagged) refresh price and stock before Confirm [source `src/app/order/[id].tsx:670`]. |
| Track and finish | One Current/Past history, one order number and status spine, one support entry, one receipt layout with service lines [source `src/app/receipt/[id].tsx:33`]. |
| Work along a route | A captain heading to Nablus sees passing parcels and shared riders that fit the corridor (D-9), seats (D-6), load and cash cap, with the run-sheet impact. |
| Shop ships a parcel | Shop tab → "Send a parcel from my shop" switches to Personal (the Shop → anything rules in §2.3) and opens Send with the shop's pin as pickup (goods cash stays behind the COD gate). |
| Recipient becomes customer | The public tracking page ends with "Send yours with Wind" after delivery. |
| One wallet, one rating per order | Credit, promo and Plus where their rules allow (CON-06/07); ratings per order and role (CON-08). |

---

## 5. Scenario flows

Tap counts exclude typing and assume a signed-in warm app unless stated.

**S1 · First launch.** A short branded first frame (no forced 1.6 s wait) → Home in Arabic with English reachable → the person can search towns and build a draft without an account → at Request, one sign-up/sign-in sheet; the draft resumes on success. If the phone is already registered, the draft is kept and sign-in or recovery is offered. Location is asked only from "Use my location"; denial keeps search, saved places and pin+landmark working. *Target:* first price within 60 s of install. (Ships in F10, after the profile work; until then, sign-up stays at the start but shorter.)

**S2 · Private ride now, 3 taps with a saved place.** Ride is already selected (remembered) → "Where to?" (1) → saved place with its pin (2) → review: route, ETA range, fare, "Cash to the captain at drop-off; exact change helps" → Request (3). A new town instead of a saved place adds one pin confirmation for each new end. → "Finding a captain" with free cancel and support → matched: name, plate, car, pickup landmark, call/chat → drop-off: pay, then give the 4-digit trip code (D-7) → shared receipt. An active ride already open → "You already have a ride" with Open. No captain → Schedule or Shared seat offered; never a fake wait.

**S3 · Shared seats between towns.** Ride → two towns → Shared seats (where enabled) → seat count, "₪ per seat", party total, meeting point, and "other riders and parcels may join along the way" → Request. Last seat taken → a fresh shared match, a private quote or Later, each needing explicit consent to a different price. Riders never see other riders' details.

**S4 · Send a parcel to someone without Wind.** Send → "Where are you sending it?" → place → small parcel (default) → what it is, recipient name and phone, handoff landmark → payer and amount, prohibited-goods line beside Request → Request. Next action: "Share with recipient" opens WhatsApp/SMS with a view-only tracking link (no proof secret in it). The sender passes the delivery code separately, as today [source SRS §2.1a]. Pickup code at collection → recipient gives the delivery code → proof for both. Unreachable recipient → typed hold → support decides reattempt or return (return code).

**S5 · Order from a restaurant.** Shop → "Deliver to" (saved address) → open shops first (fee, minimum, prep estimate; closed shops browsable with their opening time) → menu → cart (a second shop asks before replacing the basket) → goods, delivery, service fee, cash total → Place. The shop accepts with a prep time, or declines or times out with no charge. Consent requests have a deadline. Ready → merchant pickup code → delivery code → one receipt with the final items.

**S6 · A customer becomes a captain.** Account → Switch profile → Become a captain → areas and lines → vehicle and plate (only fields the vehicle needs) → licence, ID and insurance numbers with expiry (uploads wait on G-STORAGE; the pilot checks papers at the office) → Submit. Progress saves. The switcher shows "Under review"; "Action needed" resumes at the missing field. Approval arrives through Account (and push once live) → Captain → offline Jobs → Go online, with the location purpose explained when asked. Approval grants only the reviewed lines.

**S7 · A shop owner opens a shop.** Account → Switch profile → Open a shop → name, category (grocery, bakery, restaurant, goods), pin, contact, hours, licence → Submit. Pending owners can draft their catalogue. Approved → Shop mode with a checklist: add items, check hours and payout, Open for orders. Publishing needs approval, a valid licence, hours and at least one available item. Licence expiry freezes new orders, lets accepted ones finish and shows "Renew licence".

**S8 · A captain books a ride for family.** Idle Captain → Account → Laila (Personal); if online, one confirm takes them offline (§2.3). Ride → review → "Who is riding?" Me / Someone else (name and phone, so the captain can call; real pickup) → "Cash ₪… at drop-off" → Request. The trip code stays with the booker, who passes it to the rider, as the sender passes a parcel's delivery code [source SRS §2.1a; `server/main.ts:357`]. SRS D-7 and RIDE-15 say the code is the rider's, so F0 proposes "shown to the order owner: the rider, or the person who booked for them" (§10). Sending the code straight to the rider's phone waits on SMS (G-SMS). The captain cannot be matched to the ride they booked, and cannot go online while it is open (§2.3). During their own job, Account shows "Switching is locked" with Resume job, and a ride due when booked, from any phone, is refused the same way; a ride for later can still be booked.

**S9 · Switching with work in several profiles.** The dot on your picture → the sheet names the count → switch when the rules allow. Shop work stays live across switches. No switch ever cancels an order.

**S10 · Weak signal or offline.** Local shell, saved places and the last known order with "Last updated 14:32". Tracking shows "Tracking paused", never invented movement. Cart and text edits are instant. Booking, switch, accept, consent, proof and cash stay "Sending…" until the server confirms. Booking recovers by its request id and receipt (existing); job steps and cash by re-reading the order or balance; the switch by the `/api/me` revision. The captain keeps the last run sheet and the call/help path. Safe actions only are queued.

**S11 · Checkpoint or road closure.** The live order shows "Checkpoint delay · new arrival about 25 min", with the time and whether it is confirmed. The captain, stopped safely, reports "Road blocked" with segment and reason, and support offers an approved reroute. A normal detour keeps the agreed price. A customer-requested destination change needs consent and new terms. If the trip cannot continue, support closes a ride with the ride rule, or holds a parcel or shop order with custody kept. The Roads chip shows the closure to everyone heading there.

**S12 · Cash.** Before Confirm: who pays, when, how much, and the breakdown. Captain: expected cash → actual received with a typed variance → completion code → posted once through the ledger. Earnings shows take-home, cash held and due to Wind, an 80% warning and the cap block across lines. Shop settlement shows goods, fees, commission, adjustments and payout separately.

---

## 6. Simplicity rules

1. **One decision on screen.** Service, then place, then only the details that change price or handoff, then one Confirm. A field can be corrected without walking back through earlier steps.
2. **Defaults over questions:** here, now, cash, one rider, small parcel, last delivery address. Ask only for a new exact point, an unusual size, another rider or recipient, a later time or anything that changes the charge.
3. **Show what matters when it matters:** cash total, proof, access, safety and why something cannot be done. Collapse promo and credit, price maths, scheduling, loading options, substitutions and manual location until needed.
4. **Name the actor and the next step:** "The shop is preparing your order", "Ask for the delivery code". Icon and words together. No dead ends; Help or Resume is always visible in an exception.
5. **A mode shows only its own work.** Other profiles appear only as the dot on your picture.
6. **Ask for permissions at the moment of use.**
7. **One order card anatomy everywhere:** line icon + word, route, state in words, money.
8. **Never a broken tile** (ONE-13).

| Remove or merge | Where it goes |
|---|---|
| Forced intro wait, three welcome slides, the duplicate first-order guide | A short branded frame; tips at the first cash or handover moment; Help |
| Sign-up role, vehicle and plate | Become a captain (S6). Old deep links redirect while legacy builds exist |
| "My shop" Account row | The switcher |
| Four tiles + "Where to?" + Later in one area | Ride · Send · Shop above one input; Later in review; Large load under Send |
| Booking's repeated service chooser and long mixed sheet | One route with conditional details and a cash review |
| Plus/referral/safety promos on the Home sheet | Account (benefits) and the relevant order or Help (safety) |
| Roads row in Account | Roads chip on the home map |
| Merchant inbox mixed with hours and statements | Orders tab for action; hours and money under the Shop tab |

---

## 7. Speed plan

| Area | Change |
|---|---|
| Launch | First frame from bundled copy, theme and a skeleton; saved places and the input usable before map and session finish. One small bootstrap (identity, mode, visible capabilities, own badges, current-work summary) extends `/me`. Defer history, referrals, statements and inactive tabs. |
| Map | One map host per window, mounted above the map routes, reusing the browse/pin/route bridge [source `src/scene-map.tsx:31`, `src/map-page.native.tsx:18`]. Camera and overlays change in place between Home, booking, tracking and Jobs. Old pins, routes and pending bridge messages are cleared at each scope change, so nothing from another order or mode flashes. Shop screens draw no map. Pause when hidden; dispose after long background, memory trim, sign-out or renderer death, keeping only the camera. A text route stays usable when tiles fail. |
| Caching | Measure document, modules, style, glyphs and first useful tiles separately. Keep immutable vendor caching [source `public/map.html:12-20`, `server/main.ts:138`]. A bounded recent-area tile cache (about 24 MiB) only if measured to help. Public map assets only; private routes and places stay identity-scoped. Check Arabic glyphs on the A53. |
| Requests | Debounce and cancel search; bundled town index and recents first. Quote and route geometry in parallel once both ends are usable. Preload one likely next item (the first menu after a shop tap). No speculative downloads on weak service. Jobs and proof outrank map decoration. |
| Writes | Local edits instant. Server transitions show "Sending…" and recover with what each already has: the booking request id, PostgreSQL durable commands, expected-version re-reads, and the mode revision for a switch. Never show a booking, cash, completion or mode switch as done from optimistic state. |

**Measurement protocol.** Use the physical SM-A5360 (`R5CTB0FJP9Z`), an isolated loopback backend over `adb reverse`, and signed builds of the current release and each candidate. Shape the app and map traffic to 1.2 Mbps down, 400 kbps up, 300 ms RTT and 1% loss. Run 30 fixed journeys per cold and warm case. Report p50 and p95, peak app and renderer memory, and compressed bytes by origin. Record build SHA, language, text size and provider. The SRS baseline is ≤ 4 s interactive and ≤ 3 s first tiles [source SRS §15].

| Metric | *Target* |
|---|---|
| Launch to usable controls (existing session) | p50 ≤ 1.5 s, p95 ≤ 4 s process-cold; p95 ≤ 1 s returning to a rendered screen; typing and step changes p95 ≤ 300 ms |
| Network before review | Bootstrap ≤ 25 KiB compressed; first visible data ≤ 100 KiB (map counted apart); quote p95 ≤ 2 s after input settles |
| Map | Usable tiles p95 ≤ 3 s warm, ≤ 4 s cold, with the text route usable within 1 s; ≤ 500 KiB before the first useful view when cold; no map reload across Home → booking → tracking |
| Mode switch | Account opens from local data ≤ 200 ms; new mode painted ≤ 300 ms after the server reply; no location write accepted and no location indicator after leaving Captain |
| Memory and safety | One live map renderer per window; ≤ 15 MiB growth across 20 switch/tab/booking cycles; zero duplicate orders, accepts, consumed codes or cash records in loss and restart drills |

A slice that makes a measured journey slower does not merge.

---

## 8. Server and data design

**Approach: derive the role from the session, and change every place that reads the stored role on purpose.** About 144 server and 55 client source lines contain a `role === / !== '…'` comparison (`grep -rEc "role (===|!==) '"` over `server` and `src`, 26 Nov). Most of them read the authenticated user and will see the role derived from the mode without change. A smaller set reads `users.role` straight from the database, and each of those is listed below and changed deliberately. It is not true that every check changes by itself; the list is the work.

### 8.1 Data

| Field | Meaning | Notes |
|---|---|---|
| `users.role` | `'driver'` = has a Captain profile that is approved, being re-checked, paused, or closing with jobs or cash still open (table below); `'admin'` = staff; otherwise `'customer'` | Approved drivers are unchanged. Pending drivers who were never approved become `'customer'` in F5 (§8.5). Admin role edits [source `server/main.ts:3915`] go through the captain profile from F5: "make captain" approves a profile with its vehicle, "remove captain" starts closing. |
| `users.captain_state` (new) | `active` · `review` (re-check after a vehicle or identity change) · `paused` · `closing`; null for non-captains and for applications never approved | A cheap copy of the profile state for SQL joins. **New work needs `active`** and an online Captain-mode session. `review`, `paused` and `closing` open Captain mode for finish and settle only. |
| `users.status` | Account only: `active` or `blocked`, from F5 | It no longer carries captain review. The automatic vehicle/identity edit that sets `pending` today [source `server/main.ts:3923-3924`] sets `captain_state = 'review'` instead, and the admin edit stops accepting `pending` [source `server/main.ts:3914`], so Personal keeps working (ACC-07). |
| `captain_profiles` (new) | Application and history: state (draft, under review, action needed, approved, paused, closing, rejected), vehicle, plate, requested and granted lines, document numbers and expiry, reviewer, reason, revision | The admin Approvals screen and the pending count [source `server/main.ts:3879`] read this table. `users.vehicle`/`plate` are copied on approval while legacy callers read them there. |
| `sessions.active_mode` (new) | `personal` · `captain` · `shop`; column default `personal` | A new session starts in `captain` for a person whose `captain_state` is set, only when no other session holds Captain mode and the §2.3 entry rules pass; otherwise `personal`, with the reason. Staff sessions keep a null mode. **At most one session per person is in Captain mode**, held by a partial unique index on both engines, created by F3 after its backfill. Ending a session frees its Captain mode (§2.3 "Two phones"). A closing captain's last settlement also returns their Captain-mode session to `personal`, in the same transaction. |
| `sessions.mode_revision` (new) | Increases on every change of that session's mode, by the person or by the server (§8.4) | The stale-write fence (§8.4). |
| `sessions.captain_online_at` (new) | Set by Go online. Cleared by Go offline, a switch, booking a ride now, session end, **a cold start of the app** (the first bootstrap after launch says so and runs the same offline path as Go offline, which on PostgreSQL also retires the presence lease, so a relaunch never leaves the server Online while the screen shows Offline), and after 30 minutes without activity from that session. On PostgreSQL every clear listed here also retires the presence lease, through the same offline path. Activity is a new `sessions.last_activity_at`, written without the hourly throttle of `last_seen_at` [source `server/main.ts:4331-4332`] on the board poll [source `src/app/driver/index.tsx:59`], the work provider's order poll that runs on every captain tab [source `src/driver-work.tsx:158-179`], and accepted location writes for a job in hand (a `200` with `accepted: false` [source `server/main.ts:3290`] does not count, and PostgreSQL availability writes do not count either, so a backgrounded captain still idles out). The app says "You went offline" when Online is cleared; that new copy goes through the Arabic/English review | **Online on SQLite.** PostgreSQL also keeps its presence lease. Clearing it never touches assignments, job steps, cash or the mode: job steps are fenced by the revision, not by Online, so a job in hand carries on and the screen shows Online off beside it. |
| `push_subscriptions.auth_session_hash` (new) | The session a web push subscription belongs to | Native tokens are already bound to a session [source `server/db/sqlite-schema.ts:399-401`]; this lets web push be routed by that session's mode too. |

How the states line up once F5 has converted pending drivers (in F3 and F4, never-approved applicants are still `users.role = 'driver'` with `status = 'pending'`, as today):

| `captain_profiles.state` | `users.role` | `users.captain_state` | Captain mode allows |
|---|---|---|---|
| draft, under review, action needed, rejected (never approved) | `customer` | null | Not available; the switcher row opens the application |
| approved | `driver` | `active` | Go online and take work |
| approved, re-checking after a vehicle or identity change | `driver` | `review` | Finish and settle |
| paused (cash, papers) | `driver` | `paused` | Finish and settle |
| closing (removed, or rejected after approval) | `driver` until jobs and cash reach zero, then `customer` | `closing`, then null | Finish and settle |

Shop needs no new role, but Shop mode is enforced on the server: merchant routes, reads and writes, require `active_mode = 'shop'` from F6 (§8.3). Shop states stay as the schema has them: `pending`, `active`, `paused`, with the separate `paused_new` flag [source `server/db/postgres-shop.sql:16`]. The licence pause is a reason shown on `paused`.

### 8.2 The derived role

`authenticate` [source `server/main.ts:4324`] returns:

- `role: 'admin'` for staff, unchanged;
- `role: 'driver'` only when `users.role = 'driver'`, `captain_state` is set, and this session's `active_mode = 'captain'`;
- `role: 'customer'` otherwise.

The client-facing `/api/me` also returns the mode, the revision, the profile list with states and actionable counts, and the captain state.

**Online, on both engines,** is one predicate: a Captain-mode session, `captain_state = 'active'`, no *ride due*, and the engine's flag. On SQLite the flag is `captain_online_at`. On PostgreSQL it is the presence lease, whose 60-second heartbeat [source `server/domain/presence.ts:137, 158`] already lapses after a relaunch. Presence leases are PostgreSQL-only today [source `server/domain/presence.ts:27`, `server/domain/dispatch.ts:40-42`; SRS DRV-01]. On SQLite the board is served to any active driver [source `server/main.ts:2697-2699`], and job alerts go to every active driver, with approval checked only in production self-service [source `server/main.ts:1609`]. From F4, the board, job alerts, accept, admin assign, PostgreSQL dispatch, the measured guard and the presence sweep all use the predicate (§8.3). SQLite stores location only for a job in hand [source `server/main.ts:3269-3290`], so it has no availability GPS to gate.

### 8.3 Stored-role readers that must change

| Where | Today | Change |
|---|---|---|
| Job board `GET /api/jobs` [source `server/main.ts:2697`] | `need(user,'driver')` | Works through the derived role; add `captain_state = 'active'` and Online |
| New-job push candidates [source `server/main.ts:1609-1611`] | Stored role, any approved captain | Only captains with `captain_state = 'active'` **and** an Online Captain-mode session; exclude the order's customer and, for shop orders, the merchant owner |
| Native push fan-out [source `server/main.ts:1567`; `server/domain/events.ts:5`; `server/worker.ts:112-113`]; web push [source `server/main.ts:1516-1519, 1564`] | Every token and subscription of the person (selected by `user_id`); at delivery the worker joins native tokens to their session [source `server/worker.ts:112-113`], web subscriptions have no session | Captain work goes only to the Captain-mode session's token; web push uses the new `auth_session_hash` and, until a subscription has one, gets the neutral text. Other sessions get a neutral "You have captain work. Switch to see it" with no job detail |
| Shop-order alerts [source `server/domain/shop.ts:388`] | Every token of the owner | Keep ringing on every session of the owner, because a missed order costs the shop: every Shop-mode session of the owner gets the full alert, other sessions get "Sultan Sweets has a new order" with no customer detail, and a tap offers the switch |
| Push worker validation [source `server/worker.ts:84-87, 94-100`] | `/driver` and `/admin` path checks and the job branch read the stored role; the job branch (`:94-96`) has no own-order or captain-state check; the pending-driver support push (`:84`) reads `status = 'pending'` | Validate against the target session's mode, `captain_state` and Online; add the own-order check to the job branch; the pending-driver push reads `captain_profiles` from F5 |
| PostgreSQL dispatch candidates [source `server/domain/dispatch.ts:131-153`] | Stored role | Add `captain_state = 'active'`, the Online Captain-mode session, the own-order exclusion and the merchant-owner exclusion for shop orders |
| Accept: legacy [source `server/main.ts:2749-2770`, re-read at `:2754`] and `dispatch.acceptOffer` | Never compares `customer_id`. The legacy route reads the captain at `:2754`, then takes `FOR UPDATE` on the person on PostgreSQL [source `server/main.ts:2781-2782`]; SQLite runs it under `BEGIN IMMEDIATE` [source `:2752`] | Require Online and `captain_state = 'active'`; refuse own orders (`own_order`) and the merchant owner's shop orders; make the mode, Online and own-order checks inside the lock |
| Admin assign [source `server/domain/admin-assign.ts:45, 74-75`; `server/domain/driver-refusal.ts:24-32`] | Stored role, vehicle, load and cash cap | Also require `captain_state = 'active'` and an Online Captain-mode session, or refuse with `captain_not_in_mode`, shown to the admin; own-order and merchant-owner exclusions. The admin's candidate list [source `server/domain/admin-assign.ts:44-45`] applies the same rule, so ineligible captains are not shown |
| Measured assignment guard `base()` [source `server/domain/eligibility.ts:166-167, 176`] (PostgreSQL) | Stored role, status and approval | Same rule as admin assign; it sits behind assign and accept |
| Presence actor [source `server/domain/presence.ts:71-73`] | Re-reads `users.role`, `status`, `approved_at` | Uses the derived role, `captain_state` and the session mode |
| Presence sweep [source `server/domain/presence.ts:40`] | Stored role | Also expire leases whose session is not in Captain mode or whose `captain_state` is not `active` |
| Location writes [source `server/main.ts:3160, 3202, 3274`] | Stored role + session | Add `s.active_mode = 'captain'`. SQLite writes stay job-gated; PostgreSQL availability writes also need Online |
| Command replay [source `server/domain/commands.ts:13, 33, 37, 44-46`; `server/domain/command-receipts.ts:19`] | PostgreSQL only (SQLite refuses a `commandId` with `durable_protocol_unavailable`); results keyed by person and command id; the role check reads the stored role | On PostgreSQL, a stored result answers before the fence, to any session of the same person, and the role check uses the session's derived role. On SQLite, a lost reply is reconciled the existing way: re-read the order or cash balance and retry with `expectedVersion`/`expectedStatus`, never by resending a refused write. Money actions read the current balance first |
| Realtime order access [source `server/domain/realtime.ts:117, 121`] | By `driver_id` | Captain views of an order need the Captain-mode session; a switch revokes that session's captain-view realtime credentials [source `server/domain/realtime.ts:113-122`]; the customer view stays |
| Driver-licence evidence [source `server/domain/eligibility.ts:485`] (PostgreSQL) | Requires `role='driver'` | Attaches to the `captain_profiles` application, so evidence can be recorded before approval (F5) |
| Admin shop-cash review `POST /api/admin/users/:id/shop-review` [source `server/domain/shop.ts:1107-1112`] (PAY-09) | The target user must have stored `role = 'customer'`, otherwise 404 | Any user with shop cash orders, whatever the stored role, so a captain who also buys from shops can be reviewed |
| Operator promotion [source `server/main.ts:4573`] | Sets `admin` and clears the vehicle | Also closes any captain profile (F5) |
| Staff actor [source `server/domain/ops.ts:19-23`], used by commands and ops [source `server/domain/commands.ts:50`; `server/domain/ops.ts:45`] | Re-reads the stored role and overwrites the actor | Returns the derived role |
| Phone-identity resolver [source `server/domain/phone-identity.ts:72, 143`] | Second resolver returning `u.*` | Goes through the same derivation |
| Subscriptions [source `server/main.ts:289-296, 3818-3819`] and commission (`activePlan` at `:1778, 2764, 2788, 2856, 2961, 3619`) | Purchase uses the session role; activation compares with the stored role (row below); `activePlan` uses `CASE u.role` | One `planFor(profile)` used everywhere: Plus belongs to Personal, Pro to Captain, both can be active, and commission always reads Pro whatever the current mode |
| Registration writers (Entra [source `server/main.ts:580`], password [source `:915`], operator CLI [source `:4612`]) | Create `role='driver'`, `status='pending'` | From F5, every sign-up that resolves to driver (`registrationRole`, or `role` when `registrationRole` is absent [source `server/main.ts:572-574, 898-900`]), including one from an F4 build or a direct API call, creates a customer plus a `captain_profiles` application; no new row gets `status = 'pending'`. Builds below the current floor get `426` [source `server/main.ts:4357`; `server/domain/runtime-readiness.ts:46`]; F4 raises the floor (§8.4), after which pre-F4 builds are refused. F5 does not raise it again |
| Support thread list [source `server/domain/support.ts:149, 163`] | Shows stored `user_role` | Display only; keep, labelled "has a captain profile" |
| Merchant routes `needMerchant` [source `server/domain/shop.ts:126-127`] | `need(customer)` plus ownership | Also require `active_mode = 'shop'` (F6) |
| Plan activation [source `server/main.ts:4219`] | Compares with `planForRole[target.role]` (stored) | Uses `planFor(profile)` like purchase |
| `needActive` [source `server/main.ts:491-493`]; command status check [source `server/domain/commands.ts:47-48`] | Account status | Keep: `status` means the account only from F5 |
| PostgreSQL triggers [source `server/db/postgres-eligibility-repairs.sql:74`, `server/db/postgres-freight-crew.sql:38`, `server/db/postgres-resource-scope.sql:137`, `server/db/postgres-presence.sql:58`, `server/db/postgres-active-gps.sql:59`] | Stored role and status | Keep as integrity guards (the assignee must have a captain profile); mode and Online are enforced by the application rows above |
| Admin cash driver list [source `server/main.ts:3598`] | Stored role | Keep: anyone with a captain profile and open balances belongs there |

### 8.4 Switching, locks and the fence

- **`POST /api/session/mode { mode, expectedRevision }`.** In one transaction it locks the person (the `users` row with `FOR UPDATE` on PostgreSQL; SQLite's single writer). It checks the §2.3 rules: work in hand when leaving Captain; another live session already in Captain mode; profile state. Before testing "another session", it demotes Captain-mode rows that `authenticate` would already treat as expired [source `server/main.ts:4328-4329`], because those rows are deleted only by the start-up and hourly prunes [source `server/main.ts:4626, 4632`]. Sign-in does the same. When leaving Captain it clears Online and retires presence, then bumps the revision and returns the new `/api/me` projection. It refuses with `work_in_hand`, `captain_elsewhere`, `profile_not_active` or `revision_changed`. There is no command id: a retry after a lost reply gets `revision_changed`, and the phone reconciles from `/api/me`. Operator sessions are refused.
- **The same per-person lock** is taken by go-online, legacy and dispatch accept, admin assign and Personal ride create, so they cannot interleave with a switch.
- **Fence.** Clients send `X-Wind-Mode-Revision` on mode-owned writes: job and order steps (`/api/jobs/*`, `/api/orders/:id/advance|release|exception`), captain cash, location and presence, order create and offer accept, and merchant order actions. The switch carries its revision in the body. A write carrying an older revision gets `409 mode_changed`, even if the person has since switched back, except an exact replay of a stored PostgreSQL command, which returns its stored result. The CORS allow-list [source `server/main.ts:4342`] gains the header. Reads carry no revision. **F4 ships with `WIND_MIN_CLIENT_BUILD` raised to the F4 build**, published on the install page first. Older builds that send `X-Wind-Client` see the existing update screen [source `src/app/_layout.tsx:100-110`]. A request with no `X-Wind-Client` header still passes the build gate today [source `server/domain/runtime-readiness.ts:43`; `server/main.ts:4357`], so from F4 production also refuses any mode-owned write without a valid `X-Wind-Mode-Revision`, following the existing cash-client fence [source `server/domain/runtime-readiness.ts:64-70`; `server/main.ts:3754`]. Captains on SQLite also need the F4 build for Go online, which older builds lack [source `server/main.ts:622, 991`; `src/app/driver/index.tsx:98`]. The gap is the time to install the update. It affects every pilot user on an older build, customers included, so it is announced to all of them beforehand.
- **Pause, review or closing with work or cash open.** Captain mode stays open for finish and settle: jobs in hand (the SHIP-10 custody chain; DRV-17 for pay), cash handover [source `server/main.ts:3694-3708`] and earnings. A closing captain keeps `users.role = 'driver'` until no job and no cash balance remain. Then the role becomes `'customer'` and `captain_state` null, in the same transaction as the last settlement.
- **Going Online** needs Captain mode, `captain_state = 'active'`, no *ride due* (§2.3), and the per-person lock. A switch out of Captain mode, booking a ride that is due when booked, a cold start, or the worker tick at a ride's 2-hour mark clears `captain_online_at`, and on PostgreSQL retires the presence lease, in the same transaction. The cold-start clear rides the bootstrap read, which carries no revision; it can only turn Online off, so it is deliberately not fenced.
- **Every change of `active_mode` bumps `mode_revision` in the same transaction**, whoever makes it: the person's switch, sign-in and expiry demotion, a closing captain's last settlement, Sign out other phones, and the F3 and F6 backfills.

### 8.5 Migration (both engines, idempotent)

**F3: additive only, shadow.** New tables and columns, nothing existing changes meaning, and Approvals and the pending count keep reading today's columns.

- Every driver gets a `captain_profiles` row mirroring today's state. Approved drivers also get `captain_state = 'active'`, or `review` when their status is `pending` after an edit.
- Existing sessions: for each driver whose `captain_state` is set by this backfill (approved drivers only), the most recently seen session (`COALESCE(last_seen_at, created_at)`, as `server/domain/realtime.ts:119` does) gets `active_mode = 'captain'`. Their other sessions, never-approved applicants' sessions and everyone else's get `personal`; staff sessions keep a null mode. Revisions start at 0 and every row changed here is bumped once. The partial unique index is created after this backfill. Rehearse with a driver who has two live sessions.

**F6: shop sessions.** For each shop owner, the most recently seen session that is still `personal` becomes `shop`, with its revision bumped. A Captain-mode session is never changed by this backfill, so a captain who also owns a shop keeps Captain mode and reaches Shop through the switcher.
- `/api/me` logs what the new rules would decide, for comparison.

**F5: the conversion, behind the new sign-up.**

- Pending, never-approved drivers become `role = 'customer'`, `status = 'active'`. Their `captain_profiles` row stays under review, with vehicle, plate and lines kept. No line is newly granted. Their sessions move to `personal`.
- Approved drivers left with `status = 'pending'` by an edit become `status = 'active'`, `captain_state = 'review'`.
- Approvals and the pending count [source `server/main.ts:3879`; `src/app/admin/approvals.tsx:23`] switch to `captain_profiles` in the same release.
- The original `role` and `status` are kept on the profile row, so a rehearsed down-script can restore them.
- Deleted, operator and integration accounts are excluded. Contract fixtures are updated.
- SQLite stays at `user_version` 3 with additive columns only, so the previous build still opens the database [source `server/db/sqlite-schema.ts:9, 155`; `server/db/sqlite-shop.ts:1`]. F3 acceptance opens a migrated copy with the previous release.
- Rollback: F3 is undone by turning off the shadow log and leaving the additive data unused. F5 is undone by the down-script above. Rehearse backup, restore and import parity on copies first. No PostgreSQL cutover is needed.

### 8.6 Later

- A general `user_profiles` table for several shops per person and staff seats.
- Dropping the single-owner constraint once handlers are merchant-scoped, including a SQLite table rebuild with the same merchant ids.
- Per-line captain pauses. Until then ACC-05 stays partial: an expired document pauses the whole captain profile, not only the affected line.

---

## 9. Implementation slices

Each slice is one PR from `origin/master` under `AGENTS.md`: Docker cloud gates one job at a time, independent subagent review (two reviewers for auth, session, money or persistence), CI, then physical A53 acceptance in Arabic and English at 200% text and with TalkBack. Each slice records before and after measurements under the §7 protocol.

| # | Slice | Main files | Risk | Acceptance on the A53 |
|---|---|---|---|---|
| F0 | Baseline: measure today's journeys under §7; align SRS terms (Personal profile, active mode) in ACC/MER | `docs/requirements/…`, QA scripts | Low | Before-numbers recorded for ride, parcel, shop, launch and map |
| F1 | Personal home and Orders: Ride · Send · Shop above one input with service wording, active order first, Roads chip, Current/Past with service filter, one welcome card, no forced intro wait | `src/app/(customer)/index.tsx`, `orders.tsx`, `src/app/welcome.tsx`, `src/intro.tsx`, `src/parts.tsx`, `src/copy.ts` | Low | Ride and parcel placed, active ride resumed, Shop address right, disabled lines hidden; screenshots refreshed |
| F2 | One map host behind every map screen; first frame from cache | `src/scene-map.tsx`, `src/route-map.tsx` and its imports, `src/map-page*.tsx`, `src/app/_layout.tsx`, home/book/order/track/driver screens | Medium | No map reload across Home → booking → tracking; RTL labels; renderer death; no-tiles text route; memory cycles |
| F3 | Profiles data and shadow projection: `captain_profiles`, session columns, backfill on both engines; `/me` reports what the new model would decide, while the old behavior stays live | `server/db/sqlite-schema.ts`, the PostgreSQL schema and its next migration, `server/migrate.ts`, `server/main.ts`, `src/model.ts` | **High** (two reviewers) | Existing customer, pending and active captain and merchant resume on the installed build with unchanged permissions, orders and admin approvals; shadow grants match; the previous release opens a migrated SQLite copy |
| F4 | Mode switch and switcher: derived role, Online on SQLite, revision fence, per-person lock, switch API, every §8.3 reader, Account switcher with Sign out other phones, identity chip, mode tabs, notification target, `WIND_MIN_CLIENT_BUILD` raised | `server/main.ts`, `server/worker.ts`, `server/domain/session-policy.ts`, `presence.ts`, `dispatch.ts`, `eligibility.ts`, `admin-assign.ts`, `driver-refusal.ts`, `commands.ts`, `realtime.ts`, `phone-identity.ts`, `ops.ts`, `shop.ts`, `runtime-readiness.ts`, the SQLite presence flag [source `server/main.ts:622-625`], schema for `captain_online_at`, `last_activity_at` and `push_subscriptions.auth_session_hash`, `src/session.tsx`, `src/api.ts`, `src/app/_layout.tsx`, new `src/profile-switcher.tsx`, `src/driver-work.tsx`, `src/active-gps-session.ts` | **High** (two reviewers) | On the SQLite pilot build: a captain books a ride with the same phone; in Personal mode no job alert or board reaches them; Captain → Personal stops GPS; a switch with a job is refused; their own ride is never offered to them; with a ride due (§2.3), Go online is refused; kill, restart and a lost reply recover the right mode; an offline captain gets no board, alert or assignment; the previous APK sees the update screen; a captain signs in again on the same phone and is still a captain; a sign-in on a second phone opens Personal; Sign out other phones with the password lets the second phone resume a job in hand and writes an audit event; a step whose reply was lost before sign-out is reconciled on the new phone by re-reading the order, without a duplicate; a mode-owned write with no revision header is refused; a captain session idle past expiry does not block Captain mode on a new phone; with a ride due, Go online is refused but cash handover still works; a scheduled ride reaching its 2-hour mark while Online stops new offers at once and tells the captain, while the job in hand completes; booking a ride for 90 minutes ahead while Online asks first; with a job in hand, a ride due when booked is refused and a ride for tomorrow is accepted; a captain who backgrounds the app for 30 minutes goes offline; after a relaunch the captain is Offline on the server too; a captain Online on the Earnings tab stays Online; two phones race last-seat accept against a switch |
| F5 | Become a captain and personal sign-up together: application screens, the §8.5 conversion, Approvals and the pending count on `captain_profiles`, admin role and status edits through the profile, registration writers (password, Entra, operator CLI) create a customer plus an application, sign-up without role/vehicle and with optional email; F4 builds' driver sign-up becomes an application; an F4-build driver sign-up, and an API body with only `role: 'driver'`, after F5 ships each yield an active customer with an application under review | `src/app/auth.tsx`, new application route, `src/app/admin/approvals.tsx`, `server/main.ts` | **High** (two reviewers) | New account in under 30 s; apply, resume, approve one line, deny then grant location, go online; a pause with cash held still allows the cash handover; a vehicle edit leaves Personal working |
| F6 | Shop as a profile: merchant routes become Orders · Catalogue · Shop · Account; Open a shop moves into the switcher; publish checklist; alerts routed to the shop profile; each owner's most recently seen session is backfilled to `shop` | `server/domain/shop.ts`, `src/app/merchant/`, `src/app/_layout.tsx`, `src/native-push.ts`, `server/domain/native-push.ts`, session backfill | **High** (two reviewers) | An existing owner updates and lands on their inbox; the owner leaves Shop mid-preparation, sees the dot, returns to the right order, pauses new orders; merchant actions from Personal mode are refused; a pending shop drafts its catalogue, a paused shop finishes accepted orders |
| F7 | Booking steps and sharing: one place/quote/confirm path for ride, send and shop address; book for someone else (rider name and phone; the code stays with the booker, once the owner confirms the D-7/RIDE-15 wording in §10); Share with recipient | `src/app/book.tsx`, `src/app/shop/cart.tsx`, `src/booking.ts`, `src/app/order/[id].tsx`, `src/app/track/[token].tsx`, `server/main.ts` | **High** (two reviewers) | Manual pin, guest opening web tracking, cash and code, stock change, lost reply on 3G, no duplicate order; the captain sees the rider's name and phone for a ride booked for someone else; tap counts at or below D6 |
| F8 | Relations: send from my shop, send to this address after a ride, recipient invite on tracking, order again with flagged changes | various | **Medium** (creates and re-prices orders, two reviewers) | Each relation walked once |
| F9 | Along the way and cash parity: fix D10 (heading filter must also honour the corridor), service badges and filters on Jobs, cash meter with the 80% warning, PostgreSQL capacity parity kept separate from cutover | `server/main.ts`, `server/domain/eligibility.ts`, `dispatch.ts`, `src/app/driver/*` | **High** (two reviewers, money) | A Nablus-bound captain gets an on-route parcel but not an off-route one; a mixed run sheet completes proof and cash for each order |
| F10 | Browse before signing up: public, rate-limited quotes; account created at Request with the draft kept | `server/main.ts`, `src/app/_layout.tsx`, `src/app/auth.tsx` | **High** (auth, abuse) | No order without an account; rate limit verified; draft survives sign-up |
| F11 | Several shops per owner | shop schema on both engines, shop routes, push | **High** (persistence, two reviewers) | Two shops under one owner plus another owner; cross-shop access refused; rollback rehearsed |

---

## 10. What needs the owner

The owner delegated ordinary product choices. These were decided here, following what professional ride and delivery apps do:

- Admin is never a switchable profile.
- One shop per person until F11.
- Captain mode uses the existing appearance setting, so "Automatic" turns Night after dark.
- Email is optional at sign-up; Account asks for it, and verifies it, once a reset path is live (pending the ACC-03 decision below).
- Browsing prices before signing up is F10, after the profile work.
- A captain who leaves Wind in the background for 30 minutes without a job goes offline and stops getting job alerts, unlike today, where every active driver gets them. This keeps alerts for captains who are really available. The app says so when it happens.
- Rides booked for someone else: the booker keeps the trip code and passes it to the rider, as parcel senders do with the delivery code.

These still need the owner's input or access. None blocks F0–F6; F7's trip-code step waits for the D-7/RIDE-15 confirmation below:

- **SRS wording, proposed in F0 for the owner to confirm:** D-7 and RIDE-15 (the trip code is shown to the order owner, who may have booked for someone else); ACC-03 (email reset MUST be available) against optional email at sign-up.
- **ONE-01 wording.** The owner's request for profile switching changes SRS ONE-01's "one profile per person" to "one Personal profile plus approved work profiles". Role still comes from the server session. F0 makes the SRS edit for the owner to confirm.
- **Sending messages for the customer.** The trip code for someone else (S8) and the recipient's delivery code (S4) are passed on by the booker or sender until an SMS provider is contracted (G-SMS).
- **Captain documents.** Uploads need private storage (G-STORAGE). Until then the pilot records numbers and expiry dates, and the office checks the papers.
- **Real push.** Live for Android since 26 November, accepted on the A53 with the app closed (continuation plan §4). iPhones still need APNs.
- **New areas.** Any new ride town pair, and later Israel or the airport, needs the owner to confirm partners, permits and insurance first.

---

## 11. Place in the continuation plan

1. Integrate and deploy the reviewed branch (continuation plan §1). Done on 26 November: PR #120 and PR #121 are merged and released (`docs/operations/deploy.md`, "Firebase and native push").
2. F0 runs alongside continuation plan §2 (native acceptance), with the same phone and builds.
3. F1 and F2 next: small, visible, and every later screen benefits.
4. F3 → F4 → F5 are the profile feature, in that order. F3 lands alone.
5. Run continuation plan §3 (Arabic/English review) on screens after F1, F4 and F5 change them, so copy is reviewed once.
6. Then F6–F9, push (continuation plan §4) and F10. PostgreSQL cutover (continuation plan §5) stays separate from this work.

---

## 12. Where the two studies differed

The Opus column records the lead's positions from its kept study and from the first draft of this document (26 Nov); the GPT column is from its kept study.

| Topic | Opus 5.5 | GPT 6.2 Sol | Decided | Why |
|---|---|---|---|---|
| Home input | Destination first; one sheet mixing ride and send options to the same place | Ride · Send · Shop above one input whose words follow the choice | **GPT** | Sending needs a pickup and a recipient that a rider never needs. A mixed sheet adds rows to every ride. The relation survives as "Send something to this address" after a ride. |
| Data model | Derived role from the session; minimal tables | General `user_profiles`, `active_profile_id`, `mode_revision`, per-person lock | **Both:** derived role now, plus GPT's revision fence and person lock, plus the stored-role reader list from the Haiku review (§8.3); `user_profiles` when multi-shop arrives | Most role checks keep working; the ones that read the database directly are changed on purpose |
| Captain pause | Deferred; account block only | Captain restriction separate from the account block | **GPT** | A pending or paused captain should still be able to book. The migration of pending drivers needs it anyway. |
| Tabs | Three in every mode, Account dropped from Shop | Captain keeps four; Account in every mode | **GPT** | The switcher must always be in the same place; Trips holds the run sheet. |
| Captain look | Forced Night | Base colours with a labelled header | **GPT, with the existing rule** | Changing a person's chosen appearance is surprising. "Automatic" already means Night after dark for captains. |
| Mode memory | Reopen in last mode; reset to Personal after 12 h | Last server-confirmed mode; Captain always reopens offline | **GPT** | Simpler, and it never puts a captain online without a fresh decision |
| Email at sign-up | Optional | Keep current requirements until a policy decision | **Optional** (SRS §1.3), ACC-03 to the owner | The email sender is blocked (G-EMAIL), and an unverified email is a reset risk on the Firebase path; a verified email asked for later is safer than an unchecked one at sign-up. |
| Sign-in default | Last mode | New sign-ins open Personal | **Captain for an approved captain, if no other phone holds Captain mode; Personal otherwise** | Captains on the current APK sign in straight into work, as today; nobody else lands in a mode they did not pick |
| Sign-up timing | Early slice | With the captain application | **GPT** | Removing the driver choice before in-app applications exist would stop new drivers from joining. |
| Speed targets | Tighter, unmeasured (≤ 2.5 s cold) | p50/p95 on shaped 3G with SRS baseline | **GPT** | Reproducible numbers on the real phone |
| Map host order | Early | Late (slice 8) | **Opus: early (F2)** | It is client-only and independent of identity, and every later screen benefits. The F0 baseline protects against regressions. |
