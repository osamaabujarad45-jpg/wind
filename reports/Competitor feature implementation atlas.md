# Inside the delivery apps: Wind's implementation atlas

**BLUF — The finding in one paragraph.** The best mechanisms in the competitor set are not exotic: they are a small number of boring, copyable patterns that make cash-first delivery auditable — integer-cents amounts captured at the door with a forced typed variance reason, an append-only ledger where only an admin counts and closes, a customer-held proof secret with lockout and an audited admin reset, an idempotency-keyed outbox scoped to the signed-in user, zone-first addressing with capacity-capped delivery windows, and a two-tier driver cash limit enforced server-side. Souq Tulkarm (`ps.souqtulkarm.app`, a Capacitor-shell Palestinian grocery app) ships the cash-and-custody pattern end to end and is the correct template for Wind's money path; Shiply (`com.shiplypalestinemobileapp`, Expo/RN) ships the richer parcel lifecycle (three-axis status, attempt steps, financial-differences vocabulary) but no cash discipline; Careem Captain ships the server-set two-tier cash-limit and the explained earnings taxonomy; Uber 4.655 ships the map-first, saved-places and payment-method-first shapes plus the Arabic cash copy set proven at production scale. Wind already has a real subset of this — `handover_code` proof with five-strike lockout and audited `proof-reset`, consent-before-change tracking, stale-location degradation reporting, trigger-enforced append-only `cash_entries` — but the deployed pilot runs SQLite while **twelve modules and eighteen of twenty probed tables are Postgres-only**, payments have **no provider at all**, the phone's production APK still points at the retired Azure host, and there is no evidence the production deployment is ready. Wind must not "catch up to Uber"; it must close ten concrete gaps in a decided dialect, in the adoption order in §23, with the skip list in §21 enforced.

**How to read this.** Sections 2–20 are the feature areas, each with the same four parts: **(1) Best-in-class** — how the leading competitor actually implements it, with tool anchors and claim labels; **(2) Wind today** — verified from the notes and the repo evidence cited inline; **(3) Target shape** — the exact implementation Wind should aim for; **(4) Do not copy** — with reasons. Section 21 consolidates the skip list. Section 22 reproduces the production deployment evidence. Section 23 is the one-page decisions page. Section 24 states what is unknown. Every factual claim carries a label: **[O]** observed in the artifact with an anchor · **[I]** inference shown · **[U]** unknown · **[D]** design implication. Where repo documents are the source, they are named with their own evidence labels (`[read]`/`[ran]`). Where a claim has no label or no anchor, treat it as defective and check the sources in §26.

---

## 1. Feature map — every area at a glance, with the verdict

| # | Feature area | Best-in-class | Wind today | Verdict |
|---|---|---|---|---|
| 2 | Zone-first address + landmark | Souq Tulkarm | A1 `PARTIAL` — Postgres-only `service_areas`; address model has city only; `src/model.ts:185` 20 km crow-flies shortcut | **Build on SQLite** |
| 3 | Delivery windows, zone fees, daily cap | Souq Tulkarm | A8 `PARTIAL` — `scheduled_for` only on SQLite; capacity model Postgres-only | **Build on SQLite** |
| 4 | Customer-held delivery proof | Souq Tulkarm | A3 `DONE` (needs test) — `handover_code`/`return_code`, five-strike lockout, audited `proof-reset` (`main.ts:2826`); QR token absent | **Test, keep, add QR** |
| 5 | Chain of custody | Souq Tulkarm | A6 `PG-ONLY` — `resource-scope.ts:33` gates on `to_regclass('custody_records')` | **Dialect decision first** |
| 6 | Door-time cash capture + variance reasons | Souq Tulkarm / Careem Captain | A11 `PARTIAL` — no collected amount or variance reason exists on SQLite at all (`postgres-ledger.sql:70` only) | **Build — cash-market viability** |
| 7 | Append-only cash ledger (handover→count→settle) | Souq Tulkarm / Careem | A2 `PARTIAL` — append-only enforced by SQLite triggers today; double-entry journal Postgres-only | **Build the door leg; journal after B1** |
| 8 | Cash checkout UX + arrears gate | Uber 4.655 / Careem Captain | Nothing — no arrears ledger, no cash-remainder UX, no COD rail framing | **Build — cheap, Arabic-proven copy** |
| 9 | Order state machine, three axes, typed reasons | Souq Tulkarm / Shiply | A4 `PARTIAL` — free-text disputes; `safety_incidents.kind` checked enum only; two-axis split not explicit | **Extend, don't fork** |
| 10 | Idempotency-keyed durable writes / outbox | Souq Tulkarm | A7 `PARTIAL` — durable protocol opt-in and allowlisted (`commands.ts:7-19`); not a general outbox | **Extend, with scope rules** |
| 11 | Shift + job board + earnings statement | Souq Tulkarm / Careem Captain | A5 `ABSENT` — offer acceptance + active-job guard exist; no shift lifecycle | **Build — largest genuine gap** |
| 12 | Service level as parcel attribute | Shiply (JAYEEK) | A12 `ABSENT` — `partner_orders` is an idempotency map only | **Build — S-sized** |
| 13 | Notification channels, FCM data-only + Notifee | Shiply | A13 `ABSENT` — one push path, zero per-event channel declarations | **Build — S-sized** |
| 14 | Alarm re-arm graph + offline fallback bundle | Salati / Athkar (index) | A14 `PARTIAL` (`background-location.ts` only); A15 `PARTIAL` (`offline-summary.ts` not a fallback bundle) | **Build — M-sized** |
| 15 | Map-first home, camera intents, saved places, POI anchors | Uber 4.655 | Wind has `map-provider-boundary.tsx`, `pin-sheet.tsx`, no saved-places table, `place-search.ts` static filter | **Adopt shape; engines stay MapLibre** |
| 16 | Typed product contract + server-driven cadence | Uber 4.655 | typed hot paths exist (`wire-contracts.ts`); no typed product list | **Adopt direction, skip codegen** |
| 17 | Handoff hints (door / entrance / call) | Uber 4.655 | Nothing | **Build — 2–3 days** |
| 18 | Chat + canned replies | Souq Tulkarm | `order_messages` table exists; SPEC-in-app-chat.md is the design | **Defer — support volume first** |
| 19 | Payments — the actual path | nobody (Sell) | `payments.ts:36` gate + **no provider class**; test fake only | **Cash-only; provider post-gates only** |
| 20 | HAAT: Arabic order-state copy, address-help path | Haat client | Actor-named «{minutes} دقائق متبقية», «تم استلام الطلبية من قبل المرسل», «لا یمكن تغییر او الغاء الطلبیة» shipped in `values-ar`; multi-path address capture (pin/manual/current) | **ADOPT — Arabic is the product** |


The three facts that reframe everything below `[read]` (`docs/REA/2026-11-13-VERIFIED-ADDITIONS.md` §1; `docs/REA/2026-11-13-GAP-BACKLOG.md` §2.1): the deployed pilot writes **SQLite** (`server/db/runtime.ts:1-27`: unset `WIND_DATABASE_URL` → SQLite at `:9`; `WIND_POSTGRES_STAGING=1` + valid URL → Postgres pinned to `wp16_staging` at `:11-18`, a staging path; anything else throws at `:20-21`); **twelve modules return "unavailable" on SQLite** (`commands.ts:11`, `dispatch.ts:41`, `eligibility.ts:33`, `events.ts:35`, `ledger.ts:15`, `native-push.ts:26`, `ops.ts:14`, `payments.ts:36`, `private-objects.ts:48`, `quotes.ts:9`, `resource-scope.ts:30`, `ride-lifecycle.ts:24`); and **eighteen of the twenty tables those gates probe exist only in `postgres-*.sql`** — only `quotes` and `road_restrictions` are shared. `main.ts` serves older inline SQLite paths, so the pilot is narrow but functional: orders, cash entries with trigger-enforced append-only, destination-change consent, handover-code proof, stale-tracking degradation, idempotent order creation. No REA finding licenses the claim that any ledger/outbox/custody mechanism is live in production.

---

## 2. Zone-first address: the Palestinian address that actually works

### (1) Best-in-class — what the leading artifact does

**Souq Tulkarm splits the address into one structured required choice (zone) and free text (line + landmark); there is no street number anywhere.** The saved-address form posts `/addresses` with `{label, zoneId, addressLine, landmark}` and requires `zoneId` truthy and `addressLine.trim().length >= 5`; the zone list is server-authoritative — the client can only read `deliveryFeeCents` from `GET /public/zones`, never invent it. The customer-facing hint renders **"أجرة التوصيل {fee} — الحد الأدنى للطلب {min}"** (delivery fee — minimum order), and the order screen blocks submission when `subtotalCents < minOrderCents` (`[O]` `POST /addresses` + disabled logic @482866; order payload @410864; zone math @410019; hint copy @413715; admin zone create `activeDays` @604418). Zone identity is stable (`zoneId`); `nameAr`/`zoneNameAr` are display-only; zone rename/split must never be referenced by name in orders `[I]`. Zones also carry `activeDays` (weekday indices; 7 → "كل الأيام") and are the fee/min-order vehicle, not a tag `[O]` @602206.

**Shiply and Careem independently confirm the no-street-number rule.** Shiply ships `City → Village → Street` with no house-number/building-apartment field anywhere (`[O]` absence search; `getCitiesAndVillages` @1154403, `@1219758`; the canonical CSV export field order is `Creator name,Creation date,Type,Recipient Phone,Recipient Name,City,Village,Street,QR,…` @930617). Careem's rider needs pin + nickname + building type + notes + entrance photo (`MapAndAddress_*` DEX literals, re-verified this pass in both rider and captain `classes12.dex` `[O]`), and its binary *also* carries a strict validator (`address_addressAreaMissing` / `address_addressBuildingMissing` / `address_addressNumberMissing` — الرجاء إدخال منطقة العنوان / مبنى / رقم) `[O]` — the working reading is that requiredness is server-configured SDUI per market, not a technical constraint; for a Palestinian deployment the strict fields must be optional-per-field, not hard-coded `[I]` (careem-rider-captain.md §1.2).

### (2) Wind today

A1 is `PARTIAL` and the customer side has no zone at all: `saved_places` is `{user_id, label home|work|other, city, note}` — no zone, no landmark, no default flag — and the only "zone" in the booking path is the shortcut comment at `src/model.ts:185` ("20 km as the crow flies … stands in for real service zones") `[read]` (GAP-BACKLOG A1; VERIFIED-ADDITIONS A1). A real spatial model *exists* but only in Postgres: `postgres-eligibility.sql` defines `service_areas`, `route_permissions`, `vehicle_runs`, `capacity_reservations` `[read]`. "No zones in the system" would therefore be wrong; "no zone on the customer address on the dialect production runs" is right.

### (3) Target shape

1. **Data:** new SQLite table `zones(id TEXT PK, name_ar TEXT, delivery_fee_minor INTEGER, min_order_minor INTEGER, active_days TEXT, active INTEGER)` — Wind money is already integer minor units ILS (`server/domain/money.ts`, BigInt with MAX_SAFE_INTEGER guard; `ledger.ts` journals in `debitMinor`/`creditMinor`). Do **not** add a second currency path. If the Postgres machinery survives a future cutover, `service_areas` can become the zone source — but the customer-address model must not wait for that.
2. **API:** `GET /api/public/zones` → `[{id, nameAr, deliveryFeeCents, minOrderCents, activeDays}]`, loaded where `servedCity()` is called today; keep `isCity`/`nearestCity` for city selection, zone as an additional required structured pick *within* the served area `[D]`.
3. **Types:** `Order` gains `zoneId: string | null`, `deliveryWindowId: string | null`; `Address` gains `label`, `isDefault`; the fee is computed **server-side from `zoneId` at quote time** and persisted on the order for the ledger to reference — never trust a client-sent fee (Souq's client adds `deliveryFeeCents` for display but the zone list is server-authoritative; Wind should go further and re-derive entirely) `[D]`.
4. **UI:** booking screen renders the zone select with the hint pattern ("Delivery fee X — minimum order Y" in minor units), disables submission under min-order; saved-address sheet lists zones by Arabic name. Zone-as-display-name rule: orders reference `zoneId` only.
5. **Tests:** one assert that an order cannot be priced without a zone; one that `subtotal < minOrderCents` is rejected **server-side** (client gate is advisory only). This is the A1 acceptance shape; both run on SQLite.
6. **Address union (Shiply ∩ Souq):** City/Village-or-neighbourhood (structured, required) → Street/line (free text, required, ≥5 chars) → **Landmark (free text, optional — the actual Palestinian locator)** → Label + `isDefault`. No house numbers, ever; make `address_type` explicit but editable until first pickup attempt (Shiply's `cant-change-address_type` is a UX dead-end `[O]` @2096436). Additional recipients with the "additional phone detected" pattern (Souq/Shiply both ship it) — useful when the courier cannot reach the main number `[D]`. Phone is the real locator: enforce "recipient phone reachable" as part of deliverability `[D]`.

### (4) Do not copy

- **Careem's hard-number validator** — it contradicts the market reality (no street numbers) and its own SDUI configuration `[O]`; requiredness belongs in server config, not the binary.
- **Souq's client-computed display fee as the authority** — display may mirror the server; authority must stay server-side, or fee drift leaks into the ledger (`[I]` — fee-drift failure mode, souq-tulkarm.md §2).
- **Street-number/building fields "just in case"** — every Palestinian-market study shows they fail deliverability; the landmark + phone is the address `[O]` absence search (shiply.md §7).

---

## 3. Delivery windows, zone fees and capacity: "when can we actually deliver" is a capacity answer

### (1) Best-in-class

Souq Tulkarm makes delivery capacity a first-class, server-enforced concept: `GET /public/schedule?zoneId=${l}&days=7` fires when a zone is picked and drives per-day window selection; each window record is `{titleAr, startTime, endTime, cutoffTime, capacityOrders}` where **`cutoffTime` is the last time to accept an order for that window — after it the window disappears for the customer that day**; `capacityOrders` defaults 25, default window 09:00–12:00, cutoff 08:00; the customer never sees windows on inactive weekdays for the zone; **full windows are simply not selectable** (a server-computed `selectable` boolean on the schedule read, "امتلاء فترات التوصيل" — windows full). Admin dispatch shows `booked/capacityOrders` per window with a fill bar going leaf→brass→crate at 60 %/90 % — capacity *pressure* is a dispatch signal, not just a booking gate (`[O]` schedule call + auto-select @409432–409480; window admin form + defaults @606374–607549; zone `activeDays` @602206; dispatch fill bar @534663–534720; cutoff copy "بعد هذا الوقت لا تظهر الفترة للزبون في نفس اليوم" @606374; the selectable flag is a read-time gate — whether it reserves is **[U]**, so a write-time race still exists and the loser needs a clean "window filled while you were checking out" path). Souq is single-city (Tulkarm, one storefront tenant) — the pattern generalizes; zone∩city semantics for Wind is an open product decision `[U]`/`[D]`.

### (2) Wind today

A8 is `PARTIAL`: SQLite carries only `scheduled_for` on the quote/order (`quotes.ts:48,151,203,240,265`) — no per-zone fee, no window, no daily cap. The capacity machinery exists in Postgres (`capacity_reservations`, `capacity_stops`, `vehicle_runs`, `order_requirements` in `postgres-eligibility.sql`) but not as zone-priced windows on SQLite `[read]` (VERIFIED-ADDITIONS A8; GAP-BACKLOG A8).

### (3) Target shape

1. **Schema:** `delivery_windows(id TEXT PK, zone_id TEXT FK, title TEXT, start_time TEXT, end_time TEXT, cutoff_time TEXT, capacity_orders INTEGER, active INTEGER)` + `zones.active_days TEXT` (as §2). Order gains `window_id`, `delivery_date`.
2. **API:** `GET /api/public/schedule?zoneId&days=7` returning per-day windows with a **server-computed `selectable` boolean** (cap not full, cutoff not passed, weekday active). This "selectable" flag is the important design bit — capacity enforcement lives in the *schedule read*, and is also enforced **atomically at `POST /api/orders`** (count orders per window per date inside the transaction; Wind's API already wraps writes in envelope transactions) `[D]`.
3. **Booking UI:** zone → 7-day rail → window chips with a "full" disabled state; auto-pick the first selectable day (Souq's exact behavior); hard block with Arabic+English copy when nothing is selectable.
4. **Dispatch pressure:** admin queue shows `booked/capacity` per window with the same 60/90 thresholds; wire Wind's existing dispatch surface.
5. **Timezone:** windows are wall-clock (`09:00–12:00`) in local time; evaluate against `Asia/Hebron` server-side (Wind already hardcodes it for night hours, `src/model.ts` ~232) — a UTC server will accept orders past cutoff half the year `[D]`.
6. **Cap reconciliation:** document "order cap ≠ vehicle load cap" — Wind should not add surge/priority pricing onto capacity v1 `[D]`.
7. **Tests:** the A8 acceptance shape — a window at cap rejects the next order inside the transaction; a past-cutoff window is not selectable.

### (4) Do not copy

- **Souq's `DEFERRED_ANYTIME` absence / no advance-cutoff logic** — not observed; design Wind's cutoff explicitly per-window, same-day vs multi-day `[U]`.
- **`capacityOrders=25` as a universal** — derive Wind's recommended cap from fleet capacity later; ship the gate first `[D]`.
- **Pricing tied to capacity** — fine for local cash market semantics to stay capacity-only at v1 `[D]`.
- **The "windows full" copy without the race-aware error path** — the write-time loser must get a specific error, not a generic failure `[I]` (souq-tulkarm.md §7).

---

## 4. Customer-held delivery proof: the code that makes cash reach the right hand

### (1) Best-in-class

**Souq Tulkarm's proof-of-delivery is a customer-held secret containing zero PII, required to close the delivery, with a counter lockout and an audited admin escape hatch.** The order carries `deliveryCode` (short code, manually entered — the shared scan modal hints `4 أرقام`, "4 digits") and `deliveryQrToken` (opaque token rendered as QR at size 200, level M). Display is gated to `['PACKED_READY','IN_CUSTODY']` — the code is only shown while the parcel is staged at the shop or out for delivery — and the copy states the model verbatim: `أعطِ هذا الكود للسائق عند الاستلام، أو اعرض له رمز الـ QR. بدونه لا يستطيع إغلاق التسليم.` ("without it he cannot close the delivery") and `هذا الرمز يخصك أنت وحدك ولا يحتوي على اسمك أو عنوانك أو مبلغ الطلب` ("this code is yours alone, contains no name/address/order amount") `([O] @463199/@463843 gates; modal @468555–468734; scan modal `4 أرقام` @522873)`. Failure → `PROOF_LOCKED`: the confirm `catch` flips a local lockout flag — **the server locks after N bad attempts; the client only obeys** `[O] @517775; PROOF_LOCKED appears exactly once in the bundle]`. The admin escape hatch is `POST /admin/orders/${id}/proof-reset {reason}` with `trim().length >= 5` required, ≤500 chars — and the pre-modal explainer and toast both state that **a reset reopens attempts; it does not confirm the parcel's delivery** (`أُعيد فتح محاولات الكود. ما زال إثبات التسليم مطلوباً.` + `… هذا الإجراء لا يؤكد تسليم الطرد`) `[O] @548381, @548350`. The reset writes an audit kind `DELIVERY_PROOF_EXCEPTION` (`[O] @583825`). Wind's driver never sees the customer's code — the code flows customer→driver verbally or by scan; scan bypasses nothing (the QR *is* the secret).

**Shiply independently lands on the same identity primitive** — QR as the parcel's identity (`/parcels/findByQRCode` `[O]` @1161277; `scan-parcel-qr` route `[O]` @1109828; CSV export carries a `QR` column `[O]` @930617) but with **no customer-held close-proof and no lockout** — it is parcel identity, not delivery proof `[O]/[I]`. Souq is the proof template; Shiply is the identity marker.

### (2) Wind today

**A3 is `DONE` (needs test) — drop it from the build list and write the acceptance test instead.** `orders.handover_code` (customer→driver at delivery) and `return_code` (sender→driver on a return) are in `sqlite-schema.ts`; `main.ts:2201` requires the expected code to complete the order; `POST /api/admin/orders/:id/proof-reset` exists at `main.ts:2826` and writes a `security_events('PROOF_RESET', {reason})` audit row at `:2835`; `proof_attempts` adds the five-strike lockout with `proof_locked`. Missing only: a QR token, and the no-PII property is satisfied because the code is a 4-digit number `[read]` (VERIFIED-ADDITIONS A3; GAP-BACKLOG A3). Souq's bundle confirms this whole shape ships in production form elsewhere — Wind's design is validated, not novel.

### (3) Target shape

1. Keep the five-attempt lockout and the server-side counter per order (atomic increment, `PROOF_LOCKED` at threshold; reset zeroes it with audit — never lets the driver "try once more without a trace").
2. Add the **QR token** as an optional second proof: opaque ≥128-bit, hashed at rest, rendered in the existing customer modal; scan via ML Kit (Google Play services — Wind already ships GMS dependencies; do not bundle Shiply-style offline TFLite models until Play-services availability is measured, ~880 KB saved) `[D]`.
3. **Wire the reset semantics explicitly:** `proof-reset` reopens attempts, it never marks the parcel delivered; the admin UI copy must say so (Souq's exact semantic, worth copying verbatim in Wind's own words, not theirs).
4. **Display window gate:** show the code only between "assigned to a driver" and "completed" — never earlier (an untrusted courier could photograph it), never later `[D]`.
5. **Reset thresholds for supervisors:** >2 resets per order per day should page a supervisor rather than silently succeed `[I]` (souq-tulkarm.md §6).
6. **Dead-phone path:** a call-verify + admin attestation path for deliveries where the customer's phone is dead (Souq has none — phone-dead means admin proof-reset is the only unblock) `[I]` (souq-tulkarm.md §6).
7. **Acceptance test (the only thing between A3 and "DONE, drop it"):** complete with wrong code fails; right code succeeds; five failures lock the order; an admin `proof-reset` writes a `PROOF_RESET` audit row `[read]` (GAP-BACKLOG §4, A3).

### (4) Do not copy

- **Shiply's QR as the *only* close-proof** — without a lockout + audited reset it is a forgeable bearer instrument; pair it exactly as above (A3 already implies this) `[O]/[D]`.
- **`ADMIN_ACTION`-mintable proof events without a reason** — Wind should require a reason on every admin-injected proof event; Souq doesn't visibly `[I]`.
- **Souq's `4 أرقام` as a dogmatic length** — keep Wind's existing `handover_code` shape rather than migrating to Souq's exact digits; the pattern is what transfers `[D]`.
- **Screenshot-share as a non-issue** — Wind's audit must distinguish `QR_SCAN` vs manual-code vs admin reset as the scan method (Souq's chain records exactly this forensic signal — adopt it) `[I]` (souq-tulkarm.md §8).

---

## 5. Chain of custody: who carried the parcel, when, with a GPS hint at the door

### (1) Best-in-class

**Souq Tulkarm attaches an append-only, human-readable custody chain to every parcel.** `GET /orders/{id}/custody-chain` is consumed by two roles with the same component — the customer order detail and the admin order detail (`role==='admin'||'packer'` gate) `[O] @460478/@540563`. Event kinds (`cs=` @456592): `PACKED` (تم تجهيز الطرد ووسمه) · `ACCEPTED_BY_DRIVER` (استلم السائق الطرد) · `TRANSFERRED_OUT/IN` (driver-to-driver hops) · `DELIVERED` · `RETURN_REQUESTED` · `RETURNED_TO_SHOP` · `VOIDED` — with scan methods `QR_SCAN` / `SHORT_CODE` / `ADMIN_ACTION` (`ss=`). The chain is the fraud/dispute forensic: PACKED→ACCEPTED_BY_DRIVER timestamps expose packing-to-custody lag; TRANSFERRED_* pairs expose driver-to-driver hops; DELIVERED + method distinguishes QR vs manual vs admin. Custody calls spread `Hs()` — best-effort geolocation (`enableHighAccuracy:!1, timeout:4e3, maximumAge:3e4`) — into payloads, so **custody/delivery events carry a GPS fix** (`[O] @512409; correction C4 in souq-tulkarm.md §0`). The empty-chain copy states the purpose verbatim: `سجل مسح الرموز واستلام العهدة والتسليم: لإثبات من كان يحمل الطرد ومتى` ("to prove who carried the parcel and when") `[O] @456630`. Correction-by-new-entry again: voided parcels keep the chain row, `VOIDED` is an event, not a delete.

**Shiply's parcel identity is QR (see §4) but carries no chain log** — scanning advances status (`changeParcelStatusPositionDriver` ×2 sites `[O]` @932179/@1282396), not a queryable per-parcel history `[O]/[I]`.

### (2) Wind today

**A6 is `PG-ONLY`.** `resource-scope.ts:33` gates the whole feature on `to_regclass('custody_records')`, a Postgres check; the SQLite-era concept is only `eligibility.ts:577` (`custody_required`) and `:590` (`ELIGIBILITY_CUSTODY_RECOVERY`). No per-parcel human-readable append-only log exists on the dialect production runs `[read]` (VERIFIED-ADDITIONS A6; IMPLEMENTATION-HANDOFF §4). If the dialect stays SQLite, A6 is *build new*; if it cuts over to Postgres, the gate opens and the work is parity/enablement, not reimplementation.

### (3) Target shape

1. **Schema (one dialect, one table either way):** `custody_events(id TEXT PK, order_id TEXT FK, kind TEXT CHECK IN (8 kinds), method TEXT CHECK IN ('QR_SCAN','SHORT_CODE','ADMIN_ACTION'), actor_id, actor_role, lat REAL, lng REAL, note TEXT, created_at)` — append-only, no update/delete routes, same posture as `ledger.ts` journals.
2. **API:** `GET /api/orders/:id/custody-chain`, role-gated — order owner sees it, the assigned driver sees own legs, admin sees all.
3. **Driver mutations write kind-typed events** — every accept/deliver/return writes a row; delivery confirm writes `DELIVERED` + best-effort `{lat,lng}`.
4. **Bind chain events to Wind's existing parcel token** — `handover_code` on Order is the parcel label token; do not invent a second code system. Scans of it advance custody `[D]`.
5. **`ADMIN_ACTION` requires a reason** — admin can inject reassigned-guard events; every one must carry a written reason and land in the audit feed (exception class `DELIVERY_PROOF_EXCEPTION`-analogue) `[I]` (souq-tulkarm.md §8).
6. **Gaps render honestly** — missing ACCEPTED_BY_DRIVER + delivered-with-`SHORT_CODE` = "unverified handoff" badge; never interpolate a plausible chain `[D]`.
7. **GPS is a hint, never proof** — chain remains valid without it; do not build "driver was at the door" claims on a 4-second low-accuracy fix `[I]`.

### (4) Do not copy

- **Souq's unreasoned `ADMIN_ACTION`** — Wind adds the reason requirement; custody forge risk is otherwise indistinguishable from legitimate injection `[I]`.
- **GPS-as-door-proof** — treat lat/lng as colour on the chain, never as a deliverability assertion `[O]/[D]`.
- **Shipping A6 before the dialect decision** — it is either free (post-cutover) or a redundant build (stay-SQLite); sequencing it before B1 is guesswork `[read]` (GAP-BACKLOG B1, A6).
- **Customer privacy leak** — the chain tells the customer *a* transfer happened; never show other customers' data in it `[D]`.

---

## 6. Door-time cash collection and the typed variance: the missing moment in Wind's money flow

### (1) Best-in-class

**Souq Tulkarm's driver does not press "delivered" — they type the cash actually collected, and a typed reason is forced whenever the delta is non-zero.** The confirm-screen math, in identifiers: `E = T.finalTotalCents ?? T.totalAmountCents`; `ee = s === '' ? E : Math.round(Number(s) * 100)`; `te = ee - E`; `ne = te !== 0`; the mutation is `POST /driver/delivery/confirm` with `{orderId, proofInput, amountCollectedCents: ee, discrepancyReason: ne ? l : undefined, ...Hs()}` with `{idempotencyKey, queueAs: 'تسليم الطلب ' + shortId}` `[O] @517556–517600`. The variance select options are exactly **six cash-variance reasons** (`Gs` @516424): `PARTIAL_PAYMENT` · `CUSTOMER_DID_NOT_PAY` · `APPROVED_DISCOUNT` · `RETURNED_ITEMS` · `INCORRECT_CASH` · `OTHER_ADMIN_REVIEW` (Arabic labels ship). **Over-collection is gated by the same `te !== 0` predicate — entering more than due also forces a reason** `[O]`. The driver's shift screen lists every delivery with `due / collected / signed delta` per row and flags any non-zero delta red — never silently absorbed @526918–527708; the customer-side order detail renders the same pair when `result==='SUCCESSFUL'` @467915. `APPROVED_DISCOUNT` is the *legitimate* light-cash reason and its audit kinds (`APPROVAL_ACCEPTED/REJECTED`) exist @583825 — but the door UI does not visibly require a linked approval (`[I]` gap worth closing). Float parsing of the amount field (`Math.round(Number(s)*100)`) ships in Souq and is a real ±1-agora defect class — **Wind must parse strings to minor units, never `Number*100`** `[D]`.

**Careem Captain ships the complementary guard-rail: collection is clamped.** The driver is asked to enter the amount collected *or 0* ("Enter the amount collected, or enter “0” if you did not collect any money." / أدخل المبلغ الذي تم جمعه، أو أدخل "0" — `cash_amount_parse_error` `[O]` aapt2 dump this pass); **the app refuses to end the trip until the collection is sane**: `underpayment_disallowed_dialog_title` "Collect full trip fare" / "Collect a minimum of %1$s %2$s to end this trip", and `overpayment_disallowed_dialog_title` "Overpayment limit" / "Collect a maximum of %1$s %2$s" (`[O]`). Residual deltas flow into the cash ledger. `FetchMaxExtraCashCollectibleCommand` exists (driver may over-collect up to a server cap, e.g. wait time) `[O]` (careem-rider-captain.md §3.4). Note the Arabic string for overpayment is inverted vs. the English — a localization defect to not copy `[O]`.

### (2) Wind today

A11 is `PARTIAL` — and on the dialect production runs, **the collected amount does not exist at all**: `cash_entries` carries only `kind remittance|adjustment`, `amount_cents`, `note`, `status` — no expected or collected amount; the `collected_minor` column lives in `cash_receipts`, created **only** in `postgres-ledger.sql:70`. The claim that `cash_entries` "stores expected/collected amounts" does not reproduce on SQLite `[read]` (GAP-BACKLOG A11 + source-audit correction). This is the single most important unbuilt moment in Wind's cash flow: money changes hands at the door, and the pilot currently cannot say how much.

### (3) Target shape

1. **Capture at confirm:** extend the delivery-confirm mutation to carry `amount_due_minor` (server-derived from the order), `amount_collected_minor` (string-parsed by a minor-units helper), `variance_reason` (enum required iff collected ≠ due), `variance_note` (≤500 chars, optional). Wind's `Order.price` is the due source for parcels (never changes mid-flow), so prefill the field with `price*100` but **server re-derives the delta — never trust the client's delta** `[D]`.
2. **Schema:** columns on the order **or** `kind='collection'` rows in `cash_entries` — prefer the journal leg (below, §7): collection posts a balanced journal (debit driver-cash, credit clearing/order-revenue), variance reason rides `Journal.reason` or a typed `kind`. Given `cash_entries` is already trigger-enforced append-only, per-order capture via the journal is the clean cut `[D]`.
3. **Enum as CHECK constraint**, copying Souq's six reasons verbatim in English identifiers, Arabic labels in Wind's copy table: `(PARTIAL_PAYMENT, CUSTOMER_DID_NOT_PAY, APPROVED_DISCOUNT, RETURNED_ITEMS, INCORRECT_CASH, OTHER_ADMIN_REVIEW)` — not free text, because dispute flow and cash-ops grouping both want the axis typed.
4. **`APPROVED_DISCOUNT` requires a linked approval id** or it is banned at the door (Souq ships it without the link — Wind should close that gap) `[I]` (souq-tulkarm.md §3).
5. **Clamp like Careem, but Wind's band is the parcel's fixed price** — for parcels, min=max=price (a fixed-price door can't legitimately deviate); variance is an *exception requiring a reason*, not a normal mode. For rides, adopt Careem's server-cap band (`FetchMaxExtraCashCollectibleCommand`-analogue) `[D]`.
6. **Client:** door confirm = amount field prefilled, delta computed client-side for display only, reason required iff delta≠0, mutation carries Wind's `requestId` (header `Idempotency-Key` is Souq's PWA variant of the same idea) + a `queueAs` human label so an offline door confirm queues with its reason captured at door time `[D]`.
7. **UI copy:** show due / collected / signed variance in red in the driver shift view and the customer order view; over-collection included (Wind does not cap upward silently either) `[I]`.
8. **Tests (A11 acceptance):** a collected amount below expected records a variance **with a reason**; it cannot be edited afterwards (trigger-enforced) `[read]` (GAP-BACKLOG §4, A11).

### (4) Do not copy

- **`Math.round(Number(s)*100)`** — the float-parse 1.005-class defect; string→minor-units only `[D]` (souq-tulkarm.md §3, §12 item 2).
- **Souq's missing approval link on `APPROVED_DISCOUNT`** — require the id or ban the reason at the door `[I]`.
- **Careem's inverted Arabic overpayment string** — Wind's copy must ship fluent Palestinian Arabic, reviewed, never lifted `[O]` (careem-rider-captain.md §3.4).
- **A generic free-text variance "Other" without admin review routing** — `OTHER_ADMIN_REVIEW` must route to the admin queue, not into the same bucket as routine noise `[D]`.

---

## 7. Append-only cash ledger: handover → admin count → settle, and Wind's two-person rule

### (1) Best-in-class

**Souq Tulkarm's cash lifecycle is driver handover → admin physical count → settlement entry, and the ledger is correction-by-new-entry only — entries are never edited or deleted; any correction is a new named entry with a reason.** Driver side (`POST /driver/cash/handover` @528322): payload `{shiftId, handoverAmountCents, notes}`, `{idempotencyKey: Fe(), queueAs: 'تسليم نقدية الوردية'}`; UI copy states outright that the driver cannot edit a recorded amount and cannot mark cash "received" — counting and closing are admin-only. After handover the shift becomes `PENDING_SETTLEMENT`, the job board is replaced by a settlement-pending screen, and **scan-to-start is disabled — you cannot run a second shift with uncounted cash** (`[O] @504914; shift badge @524954`). Admin side (`POST /admin/cash/settle` @567370): `{shiftId, countedAmountCents, resolutionNotes}`; response `status==='CLOSED'` closes the dialog. Corrections go through `POST /admin/cash/adjust {shiftId, amountCents, reason}` with a reason ≥3 chars (example shipped in the artifact: "means a 20 ₪ shortfall the driver pays tomorrow from salary with consent") `[O] @569150`. Admin pulse surfaces `CASH_VARIANCE → /admin/cash` `[O] @529620`. Audit kinds: `HANDOVER_SUBMITTED, SHIFT_SETTLED, CASH_ADJUSTED, SHIFT_FORCE_CLOSED, DELIVERY_PROOF_EXCEPTION, APPROVAL_ACCEPTED/REJECTED` `[O] @583533–583870`. Admin settings carry `cashHandoverPolicy: PER_ROUTE / PER_SHIFT / END_OF_DAY`, explicitly labelled *operational, shown to drivers; accounting close remains admin's physical count* `[O] @599562–599926`. **Dispute mechanism is structural, not a button:** typed variance reasons at the door + `DELIVERY_PROOF_EXCEPTION` audit + admin-only settle + named, reasoned adjustments — there is **no in-app "driver disputes admin's count"** path in the bundle `[I]`. **Wind's own SPEC-cash-settlement.md mandates the stronger rule and should not regress to Souq's weaker one:** "a remittance counts only after the driver confirms it in the app. The driver can instead dispute it" (two-person check), plus numbered receipts `R-000123` `[read]` (souq-tulkarm.md §4; IMPLEMENTATION-HANDOFF §3).

**Careem Captain ships the server-set two-tier cash limit — the strongest driver-side cash-debt instrument in the set** (full mechanics in §8): `CashBalanceCaptainModel{ balance: BigDecimal, warningCashLimit: Integer, blockingCashLimit: Integer, currency, isWarningLimitReached(), isBlockingLimitReached() }` — **both limits are server-set**, enforced as derived booleans, tunable per market/captain without a release `[O]` (careem-rider-captain.md §3.1). And the **earnings statement is a named taxonomy, not a number** — 14 `breakdown_*` keys (`breakdown_trip_earnings` أرباح الرحلة · `breakdown_bonus` مكافأة · `breakdown_tips` · `breakdown_guarantees` الضمانات · `breakdown_fines` · `breakdown_fines_refund` (signed reversal — the ledger is reversible **per line**, never per record) · `breakdown_behavior_penalties` · `breakdown_money_in/out` · `breakdown_other` · + 3 UI labels), per-job `EarningsDto{totalAmount, items[{type, amount, breakdown[{name, amount}]}]}`, and a dedicated **"Unverified Cash Trips" tab** with copy: "It takes up to 3 working days to verify the trip" / قد يستغرق التحقق من الرحلة مدة تصل إلى 3 أيام عمل; `summary_type_unverified` "Total unverified balance" / إجمالي الرصيد الذي لم يتم التحقق منه `[O]` aapt2 dump this pass (careem-rider-captain.md §2.1–2.4). **Cash is trusted before it is reconciled; the binary never shows an unconfirmed number without the qualifier** `[I]`.

**Shiply's financial-differences vocabulary confirms the same delta discipline** in a card-capable app — due → collected → difference → debt/hold → invoice as routes `[O]` (`/parcels/financial-differences` @1108398; `wallet-debts-details` @1120829; `wallet-holds-details` @1121485) and `financial_differences_related_to_this_parcel` / `total_delivery_costs` bundle keys `[O]` @1740100/@1974174. Ship the difference queue, **not** the wallet (stored-value instrument, regulatory surface — S3-adjacent) `[I]`.

### (2) Wind today

A2 is `PARTIAL` and **stronger than the handoff first recorded**: `cash_entries` enforces append-only **by trigger** — `cash_entries_no_delete` and `cash_entries_no_edit` (`sqlite-schema.ts:126,128`) — so the ledger cannot be rewritten even by a bug. What production lacks is the double-entry journal (`ledger.ts:15` returns unavailable unless `backend==='postgres'`) and the per-delivery collection leg (§6). `cash-ops.ts` implements driver handover → admin `/api/admin/cash/pending` + `/resolve {confirm|dispute}` with a `status='pending'` CAS and 500-char reason (`evidenceRef` optional) `[read]` (VERIFIED-ADDITIONS A2, GAP-BACKLOG A2). Wind is **closer to Souq than to any other competitor pattern** — this is parity work plus one missing leg, not invention.

### (3) Target shape

1. **Add the collection leg (§6)** so the admin count has something concrete to count, not just commission math.
2. **Minimal shift object:** `driver_shifts(id, driver_id, vehicle_id, started_at, ended_at, status ∈ ACTIVE|PENDING_SETTLEMENT|SETTLED|FORCE_CLOSED, started_with_scan bool)`; enforce Souq's rule — **no `ACTIVE` shift while one is `PENDING_SETTLEMENT`** (the job-board gate @504914) `[D]`.
3. **Vehicle QR-as-shift-token: defer.** Wind has no vehicle entity; scan-to-start only after a vehicle inventory exists; make shift start admin-gated but scan-free at v1 `[I]` (souq-tulkarm.md §4, §10).
4. **Admin settle UI** mirrors cash-ops: list `PENDING_SETTLEMENT` shifts → count input (minor units) → `resolutionNotes` required on variance → CAS on `status='PENDING_SETTLEMENT'` so double-tap/race moves exactly once (cash-ops already does this for remittances) `[D]`.
5. **Adjust flow:** `POST /api/admin/cash/adjust` with reason ≥ **5** chars (Wind's house rule — Souq uses ≥3; don't weaken it), append-only journal with `reverses_journal_id` optional, `actor_id` + reason mandatory — exactly what `ledger.ts postJournal` supports today for `business_ref` idempotency (replay on same key, 409 on same key/different body) `[D]`.
6. **Keep the two-person check** for the collection leg — do **not** regress to Souq's one-sided admin count. Remittance: driver confirms or disputes. Collection leg: admin count closes; the door-captured variance is the driver's side of the story, already on record `[read]` (souq-tulkarm.md §12 item 3; IMPLEMENTATION-HANDOFF §3).
7. **Audit kinds to add** (Wind has `ops.ts` staff-action logging; add): `HANDOVER_SUBMITTED, SHIFT_SETTLED, CASH_ADJUSTED, SHIFT_FORCE_CLOSED, CUSTODY_TRANSFERRED, DELIVERY_PROOF_EXCEPTION` — all append-only, all with actor + reason `[D]`.
8. **Admin pulse:** `CASH_VARIANCE → /admin/cash` analogue in Wind's ops dashboard (currently absent) `[D]`.
9. **"Legally required accounting record" framing:** Souq's own copy says the ledger is `سجل محاسبي مطلوب قانونياً` ("order details and cash received: a legally required accounting record") — cite the same framing in ops/legal review; Wind's SPEC already notes earnings are not evidence of settlement `[O] @567370 region; read IMPLEMENTATION-HANDOFF §3]`.
10. **Double-entry journal:** if the dialect cuts over to Postgres, `ledger.ts` comes alive with it; until then, do not claim "we have an append-only ledger" as if it were double-entry — triggers make it tamper-evident, not balanced `[read]` (VERIFIED-ADDITIONS §1).

### (4) Do not copy

- **Souq's one-sided admin count for the collection leg** — Wind's two-person rule is stronger; never weaken it to "match Souq" `[read]` (souq-tulkarm.md §4 failure modes).
- **`Math.round(Number(i||0)*100)` on admin input** — same float caveat; string-parsed minor units `[D]`.
- **Zero-amount handover with no deliveries** — allowed client-side in Souq (noise entries); server should accept 0 but flag/sort it `[I]`.
- **`SHIFT_FORCE_CLOSED` without an audit mint** — every force-close path must write the entry or the ledger silently diverges from reality; Wind needs a named, reasoned exit for abandoned shifts `[O] kind exists @583533; UI unverified → [U]]`.
- **Enforcement-by-UI-copy** — "entries are not edited or deleted" must be API-shape + trigger enforced (Wind has triggers — keep them; never add an edit endpoint) `[O]/[D]`.

---

## 8. Cash checkout UX and the arrears gate: the cheapest Arabic-proven lift in the corpus

### (1) Best-in-class

**Uber — the global benchmark — treats cash as a first-class payment provider inside one checkout pipeline, and treats underpaid cash as a pre-trip gate.** The Arabic split (`config.ar`, 12,709 entries) ships production-tested cash copy, re-verified line-by-line in the study (`cash` الدفع نقداً; `pay_with_cash` ادفع أجرة المشاوير نقداً; `cash_charge_modal_disclaimer` "from the next trip you're expected to pay the total cash to the driver"; **`cash_change_plus_one_title` "تذكَّر أن السائق لا يقدم المبلغ المتبقي عند الدفع نقداً" (no-change reminder); `cash_change_plus_one_message` "…وسيُضاف المبلغ المتبقي المستحق لك إلى حسابك لاستخدامه في مشوارك القادم. أو يمكنك استعادته من خلال PayPal." (remainder → account credit, or PayPal refund); `connect_cash_arrears_disclaimer` "إذا لم يتم الدفع نقداً بالكامل، فستكون مسؤولاً عن تسوية عملية الدفع قبل مشوارك القادم." (underpaid cash = debt, settled before the next trip); `eats_cash_charge_modal_disclaimer` (order modified in flight → pay the new total cash on delivery or the order may be cancelled); `product_option_payment_cash_error_modal_title` "الدفع نقدًا فقط" (cash-only ride rule)**. The machinery behind it (`[O]` `wide-payment.json`, 4.654 archive — framework intact in 4.655): `ArrearsApi/ArrearsClient/ArrearsDataTransactions`; `GetConsolidatedArrearsV2{Request,Errors}`; `GetSpenderArrearsPaywallPresentation`; `SpenderArrearsBanner` + `SettleSpenderArrearsActionableItem` + `ClearArrearsHandler{Router}` — arrears are a **banner + checkout-blocking action settled inside the checkout flow, not a separate debt screen**; `checkoutActionParameters` on `PickupResponse` lets the server hand the client the checkout action to present; and the payment-provider framework is **intact** in 4.655 ("all removed payment classes were `$Dependencies` DI codegen") `[O]/[D]` (uber-benchmark.md Feature 5, anchors: `ar-dump-utf8.txt` lines; 4.655 study §4.6).

**Careem ships the same loop with bigger limits but the same shape (§7):** cash-scoped arrears block on the rider side (`cashBookingNotAllowedMessage` — «لا يمكنك إجراء حجز نقدي ما لم تقم بتسوية الرصيد المستحق…», cash-scoped, not account-scoped `[O]`), `cash_only_unsupported_payment_warning` before booking, and a **driver-side two-tier limit**: server-set `warningCashLimit` → warning dialog; server-set `blockingCashLimit` → **cash bookings blocked, card bookings continue**; settlement by one-off card charge ("Settle now", any amount 0..balance — **partial settlement is first-class**, `settle_cash_range_error` «من فضلك أدخل مبلغ بين 0 و %s»), or recurring auto-deduct from the default payment method, or "Settle later"; success names what was restored ("You can now continue using all of Careem's services") `[O]` aapt2 dump (careem-rider-captain.md §1.3, §3.2–3.5).

### (2) Wind today

Nothing: Wind has no arrears ledger, no cash-remainder UX, no payment-method-first checkout ordering, no COD-as-rail framing (parcel flow `freight-details.tsx` exists without a cash rail; payment method is not pinned above fare details); the only payment reality is `payments.ts` — **no provider at all** (§19) `[read]` (fable-52 HANDOFF §3.2, §3.6; VERIFIED-ADDITIONS §1).

### (3) Target shape (in priority order — this is the highest leverage per day in the corpus)

1. **Arrears ledger + pre-trip gate** — SQLite `cash_arrears(user_id, order_id, amount_due_minor, settled_at NULL)`; on order create, if open arrears > 0 → blocking sheet reusing the Arabic disclaimer shape (Wind's own wording); settle action sets `settled_at`; admin override in `admin/cash.tsx`. **3–4 days.** This is Uber's arrears loop with Careem's cash-scope (Wind has no card rail to fall back to — a stricter gate is correct) `[D]`.
2. **Arabic cash copy set** — Wind's own equivalents of: arrears disclaimer, no-change reminder, cash-on-delivery, parcel details rows, cash-only product error. RTL pass + fluent Palestinian Arabic review. **1–2 days.**
3. **No-change / remainder UX at completion** — "driver does not give change; the remainder is credited to your account" or settled manually/cash-topup — **do not promise PayPal** (Wind has no PayPal integration; the *pattern* transfers, the rail does not). **1–2 days.**
4. **Payment-method-first checkout layout** — payment method selector pinned above fare details, cash first. **~1 day.**
5. **COD as an explicit parcel rail** with the eats-cash-charge analogue ("have enough cash at delivery or the order may be cancelled"). **1–2 days.**
6. **Driver-side application:** the same two-tier server-set limit on the driver's cash-debt — Wind must implement it as **no dispatch** (not "card jobs continue" — there are none): one server-set warning limit → persistent home banner + blocking warning dialog naming the amount to pay; one blocking limit → no new offers until settled (in-flight job may complete); **partial settlement** ("an amount between 0 and {balance}"); **auto-settle hook** via the driver's payout rail (Vodafone Cash / bank transfer — the *schedulable deduction* is the mechanism, Careem's card rail is not); **"Amount settled — services restored"** success state naming what was restored `[D]` (careem-rider-captain.md §8 items 1–4).
7. **"Unverified first"** — cash trips land in a visible **"Unverified / غير مُحقق"** bucket, settling to confirmed after reconciliation (target ≤3 working days), with a **"Total unverified balance"** figure alongside confirmed earnings `[D]` (careem-rider-captain.md §8 item 6).
8. **No-change UX for rides:** the fare remainder either credits to a Wind wallet (does not exist) or is simply "no change given" — pick one, write it down, ship it `[D]`.

### (4) Do not copy

- **PayPal-linked remainder settlement** — no PayPal rail in Wind; promising it is a lie at the door `[O]` (uber-benchmark.md Feature 5).
- **Careem's card-fallback block semantics** — meaningless in a cash-only market; block = no dispatch `[D]`.
- **Uber's 10-APK split architecture / Twilio voice / BarcodeScanner split / GooglePaySdk / FlashNacional** — untouched (§20, §15) `[O]`.
- **Non-reversible same-day activation without compensation** (`same_day_cannot_revert_parcel`) — Shiply's hard gate; Wind ships a cutoff-hour cancel with a fee consequence instead, and only ever after D12's gate is met `[O]` @1313789.
- **Cash-only labelling copied verbatim** — Wind writes its own Arabic; Uber's strings are *evidence of production-tested shape*, not Wind's copy `[read]` (hard rule 2 of the handoff: never copy strings-as-a-set).

---

## 9. Order state machine: two axes, ten statuses, typed failure reasons — not a 29-token enum

### (1) Best-in-class

**Souq Tulkarm ships a status → label/tone map (`gr=`, 10 customer-facing statuses) and a 5-stop progress ladder (`os=`), not a transition FSM in the client — transitions are server-owned.** The `gr=` enum `[O] @233287–233340`: `NEW` · `PACKING` · `AWAITING_DECISION` · `PACKED_READY` · `IN_CUSTODY` · `DELIVERED` · `DELIVERY_FAILED` · `RETURNED` · `CASH_SETTLED` · `CANCELLED` (each with `{label, staffLabel?, tone}` — staffLabel exists to avoid leaking staff language to customers). The ladder: `os={NEW:0, PACKING:0, AWAITING_DECISION:0, PACKED_READY:1, IN_CUSTODY:2, DELIVERED:3, DELIVERY_FAILED:2, RETURNED:1, CASH_SETTLED:4, CANCELLED:0}` over the rail `PACKING → CUSTODY → DOOR → CASH` (keys @456350) — **a failed delivery sits at the door step (2) forever until an admin acts; the rail deliberately never regresses** `[O]`. The "29+ statuses" in the prior study was a bundle-wide SCREAMING_SNAKE token census mixing in shift states (`ACTIVE`, `PENDING_SETTLEMENT`), custody events (8), scan methods (3), admin pulse kinds (4), and audit kinds — not an enum (correction C2) `[O] @456390, @529620, @516424`. Terminal-ish states split across **two axes**: `DELIVERED` ends the delivery axis; `CASH_SETTLED` ends the cash axis at shift settlement — an order can be `DELIVERED` but not `CASH_SETTLED` `[O]/[I]`.

**Shiply's model is three orthogonal axes on the parcel** `[O]/[I]`: top-level `status` (`Draft → Submitted → Pending → OnTheWay → Delivered`, side branches `Returned`, `Resolved`, `Postponed`, `Replaced`, `Finished`), an **attempt axis** (`attempttodeliver_three_step` `[O]` @1076911 — a parcel may be mid a three-step delivery-attempt sub-flow without moving its top-level status; `-finished-delivered_2` compound status keys carry the attempt number `[O]` @1740138), and a **terminal axis** (`final_parcel_status_ids` / `final_status_id` `[O]` @2170025/2170048 — which statuses close the parcel). **Terminal is not a status; it is a set** `[I]` (shiply.md §1).

**Careem contributes the explicit status mapper** — `OsirisBookingStatusMapper` maps server status → UI state with an "unknown" branch; the right place to tolerate a no-OTA app meeting a new server status `[O]` (path re-verified this pass; careem-rider-captain.md §1.5).

### (2) Wind today

A4 is `PARTIAL`: `safety_incidents.kind` is a checked enum, `order_disputes.reason` is free text with `open|resolved` only; **no delivery-failure enum exists** `[read]` (VERIFIED-ADDITIONS A4). Wind's `Order.status` (`src/model.ts:138`) carries values like `in_transit`, `on_hold`, `returned`, `completed`; `exceptionReason: ExceptionReason | null` (`:139`) is a single flat list — it conflates the door axis and the cash axis exactly as Souq had to un-conflate in its own design `[read]` (souq-tulkarm.md §5; IMPLEMENTATION-HANDOFF §3).

### (3) Target shape

1. **Adopt the two-axis split explicitly** — delivery axis (`…→DELIVERED/DELIVERY_FAILED/RETURNED`) × cash axis (`…→CASH_SETTLED` at shift settle). Never one overloaded `status`. Wind's SPEC already approximates this (`on_hold` for delivery failure; remittance pending→confirmed|disputed for cash) — make the axes separate columns/statuses `[D]`.
2. **Adopt the 4-stop rail for UX** (Packing → Custody → At your door → Cash settled) — easier to render than 10 states; Souq's `os=` ladder proves it ships `[D]`.
3. **Typed failure reasons, split by axis** (replacing the flat `ExceptionReason`): door-axis `CUSTOMER_UNREACHABLE · CUSTOMER_REFUSED · WRONG_ADDRESS · ACCESS_BLOCKED · CUSTOMER_RESCHEDULED · OTHER`; cash-axis variance reasons live on the cash axis (§6). Wind's `SPEC-delivery-exceptions.md` maps almost 1:1 — edit it to carry the pair, not one list `[D]`.
4. **`DELIVERED_FAILED` does not auto-return** — Souq's flow: fail → toast "أعِد الطرد للمحل" → return requested → `RETURNED` → admin counts. Wind's SPEC keeps the reattempt-vs-return-to-sender admin decision with a written reason ≥5 chars — strictly better; keep it, add Souq's door-time typed reason as the *input* to that decision `[D]`.
5. **One client display map file** — `{label, staffLabel, tone}` per status, role-scoped (customer vs driver/staff), server owns transitions, **unknown status → an explicit error UI, never the raw token rendered** (Souq falls back to token-as-label; Wind should fail loud through an error boundary) `[I]` (souq-tulkarm.md §5).
6. **Shiply's three axes where they pay:** `attempt_no` (1..3) + `attempt_outcome` enum on the attempt path; terminal = `closed_at` + closing status id — **not** an enum member `[D]`.
7. **Shiply's status-vocabulary discipline:** one source-of-truth enum, display variants derived — the `parcelStatusColor-*` token sprawl is a maintenance smell; Wind ships one `wire-contracts.ts` enum source `[I]` (shiply.md §1).
8. **Status mapper with explicit unknown branch** — one mapper file, default→`UNKNOWN` UI state `[D]` (careem-rider-captain.md §1.5).

### (4) Do not copy

- **One flat enum of 29+ tokens** — census ≠ vocabulary; role separation via `staffLabel` is mandatory before launch `[O]/[I]`.
- **Unmapped-status raw-token rendering** — error boundary instead `[I]`.
- **No SLA transitions** — decide Wind's timeout/auto-revert behaviour deliberately (e.g. `AWAITING_DECISION` expiry); Souq shows none `[U]` (souq-tulkarm.md §5).
- **Shiply's guest-parcel creation** (`/(auth)/guest-parcel`) — unauthenticated parcel creation is an open fraud invitation; Wind keeps auth-required booking `[O]` (shiply.md §1).
- **`-1/-2/-3` suffix token sprawl** — attempt number is a column, not a naming convention `[I]`.

---

## 10. Idempotency-keyed durable writes and the outbox: the pattern for 3G/2G reality

### (1) Best-in-class

**Every mutating call in Souq Tulkarm passes `{idempotencyKey: Fe(), queueAs: '<human Arabic label>'}`; the key doubles as the outbox entry's id, and the HTTP helper re-sends it on replay.** Header construction: `Idempotency-Key` is set to `n.idempotencyKey ?? (n.queueAs ? Fe() : undefined)` where `Fe = () => crypto.randomUUID()` `[O] @202157`; `X-Actor-Scope` carries `[userId, storeId, role]` JSON; `credentials: 'include'`; 20 s `AbortSignal.timeout(2e4)`; Android token from the native bridge (`SouqNative.getSession()`), web falls back to cookies `[O] @200105–200230`. **On network failure or explicit offline enqueue**, the helper appends `{id: key, scope, method, path, body, label: queueAs, queuedAt, attempts: 0}` to `souq.outbox` (localStorage) and throws `QUEUED` (`حُفظ الإجراء على جهازك. بانتظار الاتصال.`) — callers treat it as info, not error `[O] @200105, @199490`. **Replay** (@202157–202230): triggers are the `online` event, `visibilitychange`→visible, session/store/role change, explicit `flushNow`; replay is **scope-filtered** (`scope === currentScope`); retryable failures (`status===0 || 401 || code==='SESSION_CHANGED' || 429 || >=500`) bump `attempts+1` and **halt the whole flush**; any other 4xx → entry kept with `error: message`, surfaced as a failed item, flush continues; entries replay with the **entry's own id as `Idempotency-Key`**. If `localStorage` write fails, the app throws `QUEUE_STORAGE` — *it refuses to silently drop the action* and tells the user to keep the page open `[O] @199490–199520`. Legacy unscoped entries are listed separately and migratable `[O]`. Unscoped/other-user pending actions never replay as the new user — `X-Actor-Scope` is mandatory.

### (2) Wind today

A7 is `PARTIAL` — **corrected from `DONE` by the source audit**: the durable protocol is **opt-in, not universal**. `commands.ts:7-19`: `:10` passes through unchanged when `body.commandId` is absent; `:11` returns `409 durable_protocol_unavailable` when a `commandId` is supplied on a non-postgres backend; `:14` allowlists only `/api/orders`, `/api/jobs/`, `/api/admin/orders/`, `/api/admin/cash`, `/api/driver/cash`. On the pilot, durability exists for booking creation and driver advance/exception via `order_commands`/`order_actions`, and **not** as a general outbox for every mutation `[read]` (GAP-BACKLOG A7; VERIFIED-ADDITIONS A7). Booking retention for the eight post-lock codes is fixed and tested (`booking-retry-race`, `booking-auth` exit 0) — Wind's booking path is now the strongest offline-write path in the app, but the rest of the mutation surface has nothing `[read]` (VERIFIED-ADDITIONS §7–8).

### (3) Target shape

1. **Outbox module** `src/offline-outbox.ts`: same shape — `{id, scope, method, path, body, label, queuedAt, attempts, error?}`; scope = `[userId]` (single-store Wind doesn't need storeId); AsyncStorage not localStorage; JSON array, cap ~50 entries; human labels in Arabic+English everywhere.
2. **Idempotency end-to-end:** every mutation carries a client `requestId` (Wind already does this for orders/actions/messages/cash via `newRequestId()` + server dedupe in `server/main.ts` order tables, 409-on-hash-mismatch; `ledger.ts` uses `business_ref`). **Thread the same id through the immediate attempt and the outbox entry; replay reuses it** — Souq's double role for the key, Wind already half-built. Routes that don't take `requestId` today (location pings, tracking) stay exempt; money/proof/custody routes are not `[D]`.
3. **Server dedupe is non-negotiable on every keyed route** — if Wind's server ignores the header, a 2G retry double-collects cash in the ledger. Bearer: a **semantic dedupe in addition to key dedupe** ("an active proof attempt exists for order X" / "an open collection exists for order X") so a crash between enqueue and UI update can't double-count the door total `[I]` (souq-tulkarm.md §9).
4. **Pending actions surface:** a "Pending actions (N)" row in driver home + settings, per-item failure reasons; wire Wind's existing `offline-summary.ts` + `offline-recovery.ts` + `src/offline-outbox.ts` wiring; show `QUEUED` as info, not error `[D]`.
5. **Retry policy exact copy of Souq:** 0/401/429/5xx retry-with-backoff-and-**halt**; other 4xx → per-entry error state, user-visible, never auto-discarded. Add a circuit breaker Souq lacks: **max 25 attempts or 7 days, then park with error** `[D]` (souq-tulkarm.md §9).
6. **QUEUE_STORAGE path:** AsyncStorage write failure → hard error, block the mutation — never continue as if saved `[D]`.
7. **Flush triggers:** Wind has `driver-presence.ts`, `location-state.ts`, AppState (background→active) ≈ `visibilitychange`; `online`/`offline` events + explicit `flushNow` ✓; scope-on-account-change = clear-on-signout + `X-Actor-Scope` analogue header `[D]`.
8. **Extend the allowlist** from `/api/orders,/api/jobs/,/api/admin/orders/,/api/admin/cash,/api/driver/cash` to: collection capture, custody events, shift start/end, location-health — enumerate and record coverage; "A7 enumerate covered commands" is the GAP-BACKLOG's own next step (S → M) `[read]` (GAP-BACKLOG A7).
9. **Acceptance:** enumerate the covered commands and their retry semantics **before** promising offline writes anywhere in marketing or ops docs `[read]` (GAP-BACKLOG A7).

### (4) Do not copy

- **`souq.outbox` unencrypted bodies at rest** — Wind should at-rest encrypt or at least exclude from backups (`allowBackup` decision — §20) `[I]`/`[read]` (skip list S6).
- **Uncapped retry attempts** — Souq retries forever; battery drain and silent 2G storms; Wind caps (25/7d) `[D]`.
- **"Error sending. Event queued." as an offline story** — Shiply's single toast with unknown storage semantics and **no visible outbox UI, retry screen, or conflict path**; adopting it would corrupt a cash ledger under retries `[O]` @1260965; shiply.md §11.
- **SW-backed outbox** — Souq's is plain localStorage (no SW writes found); Wind has native FCM + own state; no SW `[O]` (souq-tulkarm.md §9).
- **Legacy unscoped entry migration as a user-facing feature** — internal one-off only; Wind ships clean scoped entries from day one `[O]/[D]`.

---

## 11. Driver shift, job board and the earnings statement: A5, the largest genuine gap

### (1) Best-in-class

**Souq Tulkarm runs the driver's day as: scan the vehicle → shift ACTIVE → ready queue → scan parcel labels → custody.** `/driver/shift/start {vehicleScan}`; `GET /driver/ready-queue` fetched **only while `shift.status==='ACTIVE'`**; scan intents from one modal — `VEHICLE → /driver/shift/start` · `RETURN → set-state only` · `OFFER → /driver/custody/offer-transfer {scan, toDriverId}` (`عرض تحويل طرد`) · `TRANSFER → /driver/custody/transfer` · else `/driver/custody/scan` — all custody calls carry `{scan, ...Hs()}` + idempotency key; `ALREADY_IN_CUSTODY` is an info-level idempotent response, not an error; vehicle QR rotation is admin-only; `PENDING_SETTLEMENT` disables the start scan; `/driver/peers` feeds driver-to-driver transfers (requires both drivers in the fleet) `[O] @502838–503600, @511143–511310, @504914, @596983–597300`. The driver sees only their assigned orders and **never sees the customer's delivery code** `[O]`.

**Careem Captain ships the richest driver-side surfaces in the set, all observed in the binary:**
- **Going online is precondition-gated, failure modes are named:** GPS must be on (`enable_gps_before_go_online` — "Enable GPS… to go online" / شغل نظام تحديد المواقع…) *and* Bluetooth (merchant-proximity wait-time detection); the app distinguishes `unable_to_go_online` (precondition) from `blocked_from_going_online` (**device-level ban**) `[O]`.
- **Booked shifts over on-demand:** shift calendar (`book_shift` حجز الوردية), weekly booking window with **Bronze/Silver/Gold tier early access**, shift guarantee (`breakdown_guarantees` الضمانات — paid only on full attendance: "Guarantee received! 🎉" / "Guarantee not received 😔"), attendance tracking, auto-assign nudges, `ShiftEndWorker` ("Your shift is over!" / انتهت ورديتك!) — **not** Uber-style tap-to-online; both coexist, shifts are a scheduling overlay for dense markets `[O]`.
- **Offers are anti-fraud filtered before the driver sees them:** `ValidateBookingOfferFraudCommandAction` → `BookingBlacklistFilterAction` → `BlackListBookingOfferCommandAction`, server-side blacklist ("Server state has blacklisted jobs" `server_state_has_blacklisted_jobs`), `BookingBlacklistReminderWorker` `[O]`. Dispatch refuses flagged assignments; the client mirrors the filter `[I]`.
- **Acceptance rate is measured, shown, but not a gate** — `acceptance_rate` / `acceptance_only` ("Minimum of %1$d%% acceptance") gates shift tiers/guarantees (server policy), nothing in-binary withholds cash bookings for low acceptance `[O]/[I]/[U]`.
- **Arrival at pickup = customer-held PIN** — `arrive_at_pickup_button_text` = **"Enter Customer Pin"** / **أدخل رمز العميل** — the inverse of Wind's delivery code, at the *start* of the trip `[O]`. Airport/parking queues are first-class arrival modes (queue number, "You will be asked to move to staging area when your queue number is %d", late arrival = queue ejection) `[O]`. Store mode uses an explicit "Yes, arrived" dialog, not GPS inference alone `[O]`.
- **Earnings are an explained statement** (§7): 14 `breakdown_*` lines + per-booking rows + daily/weekly/monthly aggregation + unverified-cash tab + last-transactions card `[O]`.

### (2) Wind today

**A5 is `ABSENT` as specified** — offer acceptance exists (`dispatch.ts:284` `already_taken`) and a driver holding an active job is blocked (`presence.ts:168` `presence_active_job`), but there is **no shift lifecycle, no ready queue, no vehicle-code scan** `[read]` (VERIFIED-ADDITIONS A5; GAP-BACKLOG A5). `driver_presence` covers "currently available"; `driver/index.tsx`, `driver/trips.tsx`, `driver/earnings.tsx` exist but no shift entity. The earnings screen has no line-item taxonomy.

### (3) Target shape

1. **Minimal shift table** (as §7): `driver_shifts(id, driver_id, vehicle_id NULL, started_at, ended_at, status ∈ ACTIVE|PENDING_SETTLEMENT|SETTLED|FORCE_CLOSED, started_with_scan bool)`.
2. **Shift start:** admin-gated, scan-free v1 (no vehicle inventory); scan-to-start arrives with the vehicle QR when it exists.
3. **Ready queue endpoint:** `GET /api/driver/ready-queue` — served only while the caller has an `ACTIVE` shift; else 403/empty. This is the enforcement Souq ships at `/driver/ready-queue` `[O] @502838`.
4. **Job board gate:** no `ACTIVE` shift → no queue → **no scan actions**; `PENDING_SETTLEMENT` replaces the board with the settlement-pending screen (§7) `[D]`.
5. **Earnings statement, Wind-flavoured** (Careem's taxonomy, Wind's wording): signed lines `trip_earnings · tips · bonus · guarantee(zero at pilot) · fines · fines_refund(named reversal) · behavior_penalties · money_in · money_out · other` + per-job named sub-lines (`EarningsItemBreakdownDto{name, amount}` shape) + period aggregation (daily/weekly/monthly) with a **designed empty state** ("Shift schedule coming soon!" equivalent — empty weeks will happen) `[D]` (careem-rider-captain.md §2.1–2.3, §8 items 7–8; SOUQ F-06 naming complement).
6. **Unverified tab:** "Unverified / غير مُحقق" bucket for cash trips settling after reconciliation (≤3 working days target) + "Total unverified balance" beside confirmed earnings `[D]`.
7. **GPS-gated go-online** — refuse with a named, actionable Arabic error; **Bluetooth not required** at pilot (merchant-proximity is optional infrastructure) `[D]` (careem-rider-captain.md §8 item 9).
8. **PIN-at-pickup** for the ride flow — mirror of the delivery code, inverse direction (driver enters customer's PIN) `[D]` (careem-rider-captain.md §8 item 11).
9. **Assignment-side anti-fraud (cheap, Wind-shaped):** before an offer reaches a driver, check a server-side blacklist of flagged bookings/recipients; drop silently and log. Fraud prevention at the assignment layer, not the reporting layer `[D]` (careem-rider-captain.md §4.3).
10. **Typed failure reasons feed dispatch** — `CUSTOMER_UNREACHABLE` ×3 vs `CUSTOMER_REFUSED` produce different requeue decisions; wire §9's enum into the offer outcome `[D]`.
11. **No acceptance-rate gate, no tiers, no guarantee engine at pilot scale** — supply is too scarce to throttle its own offers; tiered booked shifts are an unaffordable incentive engine for a 50-driver pilot and carry labour-classification implications `[D]` (careem-rider-captain.md §4.2, §8 MUST NOT).

### (4) Do not copy

- **Bronze/Silver/Gold shifts + guarantee/attendance engine** — unaffordable and regulator-visible; defer with a driver-density gate `[D]`.
- **Acceptance-rate offer gating** — pilot supply too scarce; measure it, show it, never gate on it `[D]`.
- **Sentiance-style motion/crash SDK, Luciq screen recording, face-KYC liveness, Pushy second push stack, H3 geofence matching** (until zones matter) — "none of it appropriate for Wind's 50-driver pilot" `[O]` (careem-rider-captain.md §6, §8 MUST NOT).
- **`enter_handover_code`** — orphan string in Careem's build, no flow found; do not cite it as a feature, do not copy it `[O/U]`.
- **Bluetooth go-online precondition** — optional infrastructure, not a gate `[O]`.
- **Auto-assigned shift ✅ notifications** — coercive, regulator-visible in a new market; opt-in only, later `[D]`.
- **Parking-queue machinery** — no parking-attendant reality at Wind's scope v1; the mechanism is noted and skipped `[I]`.

---

## 12. Service level as a parcel attribute: the one-field version of Shiply's JAYEEK

### (1) Best-in-class

**Shiply ships same-day as an opt-in service on a parcel, not as a second product**: "Same-day delivery is available for this parcel. Do you want to activate JAYEEK?" `[O]` @1269475; "JAYEEK Service Quality" / "JAYEEK is Activated." / "JAYEEK is available for your parcel" / **"JAYEEK not available for planned dates"** (server-side date-capacity check) `[O]` @1372528…; activation is **non-reversible once committed**: `same_day_cannot_revert_parcel` `[O]` @1313789; save path `save_same_day_parcel` `[O]` @1539604; `JAYEEK_PARCEL` key `[O]` @1565839; promotion-modal entry ("create Jayeek parcel from same-day promotion modal") `[O]` @1614592; **price is not statically visible — server-driven** (no fee literal in the bundle; contract/settlement terms unknown) `[I]` + `[U]`. JAYEEK is "service level as attribute, not order type" `[I]` (shiply.md §6).

### (2) Wind today

A12 is `ABSENT`: `partner_orders` is only `{external_ref, payload_hash, order_id}` — an idempotency map with no service-level field `[read]` (VERIFIED-ADDITIONS A12; GAP-BACKLOG A12).

### (3) Target shape

1. `parcel.service_level TEXT CHECK IN ('standard','same_day') DEFAULT 'standard'` on the order — one field, not a second order type; the state machine (§9) does not fork.
2. Chosen at creation or via a pre-pickup upgrade prompt; **server checks same-day capacity per date/zone and returns eligible/fee** — mirror "not available for planned dates" back to the customer before dispatch `[D]`.
3. **Reversibility rule Wind should actually ship:** cancel the same-day upgrade **only until a cutoff hour**, then it becomes non-reversible with a visible fee consequence — never ship Shiply's hard lockout without a compensation path (and only after D12: ≥2 contracted carriers + SLA/settlement/liability modelled as the parcel attribute) `[O] @1313789; read index D12]`.
4. **No branded splash assets** — Wind ships its own; Shiply's are JAYEEK's brand (`customerJayeekSplash*.jpg` `[O]` @1152602/@1158566) `[O]`.
5. S-sized: one column, one eligibility check, one prompt — **but the eligibility check needs the capacity model (§3) to mean anything**; land it after A8 `[D]`.

### (4) Do not copy

- **Hard non-reversibility without compensation** (`same_day_cannot_revert_parcel`) — regulatory and customer-relations risk `[O]`.
- **Promotion-modal growth hack before a same-day supply plan exists** — pushes unfulfillable promises onto the ledger `[O]/[D]`.
- **Bundled branded splashes** — IP + bloat `[O]`.
- **JAYEEK's price invisibility** — Wind's same-day fee is shown before activation, always `[D]`.

---

## 13. Notifications: FCM data-only + Notifee with one explicit channel per event class

### (1) Best-in-class

**Shiply runs FCM auto-initialised but with no default notification channel and no delegation — every FCM notification payload has nowhere to land; the app must handle data messages and render via Notifee itself** (`firebase_messaging_auto_init_enabled=true`; **`firebase_messaging_notification_delegation_enabled=false`**; **`default_notification_channel_id=""`** `[O]` manifest — correcting SHIPLY.md's `@None` reading; the auto-init flag is `firebase_messaging_auto_init_enabled`, not `messaging.*` `[O]`). Notifee is deeply integrated (`NotifeeInitProvider` with auth `com.shiplypalestinemobileapp.notifee-init-provider`; receivers `NotificationReceiverActivity (exported)`, `ForegroundService (shortService)`, `ReceiverService`, `RebootBroadcastReceiver`, `BOOT_COMPLETED` re-arm handled `[O]` manifest); bundle API surface: `createChannel(s)`, `displayNotification`, `createTriggerNotification`, `openNotificationSettings`, `onBackgroundEvent`, `isChannelBlocked` `[O]` e.g. @1008560, @2005059/@2005138. The real channel IDs are runtime-constructed, not literals; only schema error strings are visible `[U]`. A local config plugin `./withNotifeeAndroidFix` patches Notifee's manifest fit on modern Android `[O]` app.config plugins. `EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS` `[O]` manifest.

Firebase Analytics is **on** in Shiply — including `_allow_ad_storage=true`, `_allow_ad_user_data=true`, `_allow_ad_personalization_signals=true`, `AD_ID` permission shipped `[O]` manifest (S7).

### (2) Wind today

A13 is `ABSENT` (as specified): one push path (`native-push.ts`, `push.ts`), **zero per-event channel declarations** — `grep channel server/domain/native-push.ts` → 0 hits `[ran]` (VERIFIED-ADDITIONS A13; GAP-BACKLOG A13). Wind ships `native_push_tokens` (SQLite-probeable; PG-only path unexercised on SQLite) and `push_subscriptions`/`push_keys` (Web Push legacy) `[read]` (IMPLEMENTATION-HANDOFF §3). A14 is `PARTIAL`: `background-location.ts:3,165` uses `expo-task-manager` `defineTask` only — **no boot/user-unlock/time-set/timezone/package-replaced re-arm handlers** `[read]`. A15 is `PARTIAL`: `offline-summary.ts:2-13` is a versioned cache, not a fallback bundle `[read]`.

### (3) Target shape

1. **FCM data-only + Notifee, one channel per event class, version-suffixed:** `wind_driver_assigned_v1`, `wind_out_for_delivery_v1`, `wind_delivered_v1`, `wind_cash_required_v1`, `wind_invoice_v1`, `wind_system_v1` — a definition change forces recreation, never silent reuse; channels created on first use at boot/JS start; deep-link payloads routed by `wind_route` key `[D]` (index A13).
2. **Wind should set a real `default_notification_channel_id` fallback *in addition to* explicit channels** — defence in depth; Shiply's deliberate no-default choice is brittle on a broken-JS path (a bare FCM notification silently drops) `[I]` (shiply.md §8).
3. **Do not enable `firebase_messaging_auto_init_enabled` before consent exists** — Shiply's `true` registers the device before the user agrees; Wind gates on an opt-in flow `[I]` (shiply.md §8).
4. **Reboot re-arm graph (A14)** — receivers/handlers for `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `USER_UNLOCKED`, `USER_PRESENT`, `TIME_SET`, `TIMEZONE_CHANGED`, `PACKAGE_REPLACED`, `CONNECTIVITY_CHANGE`, plus `TIME_TICK` + WorkManager fallbacks; Salati's receiver graph is the reference shape `[O]` (index A14; Salati F-05).
5. **Offline fallback bundle (A15)** — today's zones, fees, windows and the driver's saved addresses cached locally (not just the summary) — a driver on a dead SIM still works; bundle fee table + zone list for the pilot city only; measure size `[D]` (index A15).
6. **OTA discipline:** Wind may keep Expo Updates but **gate every ledger-affecting update behind explicit QA and a staged rollout** — a bad OTA to a cash ledger is unrecoverable in the field; `CHECK_ON_LAUNCH=ALWAYS` stays off the ledger path `[I]` (shiply.md §8).
7. **Tests (A13 acceptance):** a bumped channel version produces a new channel; the old one is not reused `[read]` (GAP-BACKLOG §4, A13).

### (4) Do not copy

- **No-default-channel configuration** — Wind adds the fallback channel anyway `[I]`.
- **FCM auto-init before consent** — consent first `[I]`.
- **Ad-storage / AD_ID analytics defaults** — S7 (§20) `[O]`.
- **Unmetered OTA on a cash app** — staged rollout + QA gate or no OTA `[I]`.
- **Shiply's runtime-constructed channel IDs with no static truth** — Wind's channels are named constants in one file, versioned `[D]`.
- **Web Push instead of FCM** — S13 (§20); Souq's `/push/subscribe` + service worker only works because it is a PWA `[O]` (index S13; souq-tulkarm.md §1, §9).

---

## 14. Alarm re-arm and the fallback bundle: surviving the cheap Android phone

(Salati and Athkar — not delivery apps; studied for *craft*, per the corrected corpus. Their delivery-domain claims in the original brief were wrong: zero delivery-domain classes in 17,372 and 3,525 classes respectively `[re]` (index §0; IMPLEMENTATION-HANDOFF §1).)

### (1) Best-in-class

Salati ships receivers for `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `USER_UNLOCKED`, `USER_PRESENT`, `TIME_SET`, `TIMEZONE_CHANGED`, `PACKAGE_REPLACED`, `CONNECTIVITY_CHANGE`, plus `TIME_TICK` and WorkManager fallbacks — the alarm survives the OS killing the app `[O]` (index A14; Salati F-05). Athkar ships `athan_<prayerKey>_<soundKey>_v7` versioned notification channels with `ensureAthanChannel`/`deleteChannelSafely` and `AthanScheduler.nextOccurrence`/`setExact` silence-window shape `[O]` (index A13/A14; Athkar F-03/F-04). Both bundle their complete offline asset sets (audio + fonts) — the app works with no network `[O]` (index A15; Salati F-06).

### (2) Wind today

A14 `PARTIAL` — `background-location.ts` only; A15 `PARTIAL` — summary cache only (see §13) `[read]`.

### (3) Target shape

1. Alarm re-arm task: one `TaskManager.defineTask` handler registered for all eight system broadcasts + `TIME_TICK`; each re-arm recomputes "next deadline" from persisted state (booking cutoff, pickup window, cash settlement reminder) and schedules an exact alarm `[D]`.
2. Fallback bundle: `offline_bootstrap` table — zones + fees + windows + saved addresses + config version; written on first online launch, read on cold offline start; **exclude from cloud backup until the `allowBackup` decision (§20) is made** `[D]`.
3. Battery-aware tracking interval — `locationPingSeconds` fleet setting from Souq ("رقم أكبر يوفّر بطارية السائق" — bigger number saves driver battery) `[O]` @599562.
4. **Notification re-arm ties to A13's versioned channels** — a re-armed alarm posts to `wind_system_v1`, never a reused stale channel `[D]`.

### (4) Do not copy

- **Salati's persistent `LocationListener` service** — S9 (§20) `[O]` (index S9).
- **Athkar's OEM-autostart screens before Wind's own telemetry proves missed deliveries from OS kills** — evidence gate D6 ("Wind's own telemetry shows a material share of deliveries missed…") — not at pilot `[read]` (index D6).
- **Salati's permission stack** (`READ_PHONE_STATE`, `RECORD_AUDIO`, `BLUETOOTH`, `DISABLE_KEYGUARD`, `SYSTEM_ALERT_WINDOW`, `DETECT_SCREEN_CAPTURE`) — Wind needs none; each is a privacy cost in a location-sensitive market `[O]` (index S8; shiply.md §12).

---

## 15. Map-first home, saved places and POI anchors (Uber 4.655): ADOPT the shape, never the engines

### (1) Best-in-class

**Feature 1 — Map-first home with a config-driven provider chain (not a runtime guess).** `MapProviderConfigurationModel` = kotlinx-serialized `{initialMapProvider, fallbackMapProviders, missingProviderDefault}` + `Companion`/`JSON`; `MapProviderState` holds config + Compose `MutableState` current provider + `didFallback` flag — `UNKNOWN` substitutes `missingProviderDefault`, adopts a new provider **only** if in the fallback set, emits `providerUsed` analytics; `MapFactory.create(provider, deps)` routes `UBER→UberMapFactory` (styleUrl `…tc2.uber.com/style/default/native?o=DEFAULT` — **still that exact URL in 4.655**, re-verified from `assets/parameters.json`), `GOOGLE→GoogleMapFactory`; every map is built with five injected handles (`Parameters`, `Network`, `Storage`, `EventReceiver`, `Assert`); `UberMapView` exists in 4.655 with **26 classes** (4.654's "absence" was a JADX materialisation artifact; 4.654's name-level archive lists 16); `ActiveMapCounter` is a process-global per-provider counter emitting `active_map_count` analytics when a new peak passes a threshold; one persistent map hub across the flow; camera is a single intent union (11 types incl. `LAT_LNG_BOUNDS_MAX_ZOOM` + new 4.655 `TEST`), CameraUpdateFactory argument-checked, `AutoPositionAndZoom{locations, center?, layout}` declarative framing; camera arbitration via `MapCameraDirector` merging visibility-wants from all scopes with exclusive control tokens; epoch-stamped vehicle paths (`VehiclePathPoint{latitude, longitude, course, speed, epoch}`) carried in the same status poll as the fare/offer payloads; **H3 is used twice** — hex spatial indexing *and* fare-cache bucketing (`FareCacheSettings{serverTime, validUntilEpoch, pickupHexResolution, dropoffHexResolution}` — quote cache keys bucketed by H3 hex) `[O]` (uber-benchmark.md Feature 1; anchors: map inventory §1–3, §6, §12; 4.655 study C11/C12/C15/C21/C22/E15–E28). Live-tracking internals moved: `com.ubercab.presidio.realtime` **147 → 113** (34 `active_trip` provider classes removed); Ramen polling intact; `mapdisplay_flipr_frame_rate=0`, `render_frame_allocator_capacity=10,485,760`, `tile_query_cache_size=131,072` — all parameter-tunable server-side, unchanged `[O]`.

**Feature 2 — POI-anchored map API (NEW in 4.655).** `com.uber.maps.mapsexperiencepresentation` grew +41 classes (4.654: 38, all saved-places) — `GetMapPoisForAnchor{Request,Response}`, `PoiGroup(Success)`, `PoiMarker`, `PoiType`, `MobileAnchor`, `TripDestinationAnchor`, `EatsFilters`, `FulfillmentType` — server-driven POIs around an anchor with **a client-side `POICache`** (`com.uber.mapssdk.poi` +11 classes; **absent entirely in 4.654**) — cache-then-render, don't re-fetch on pan. Delivery filters (`FulfillmentType`) strongly imply restaurant/dark-kitchen POIs are a first-class use case `[O]/[I]/[U]` (uber-benchmark §Feature 2; 4.655 study E11/E12/E13; the wire path is NOT in the 4.654 gRPC index — treat the route as `[U]`).

**Feature 3 — Saved places + center-pin location editor.** Saved places are a first-party gRPC surface (`maps.get-saved-places/UpsertSavedPlace/DeleteSavedPlace`) with full protobuf OrBuilder models + REST twins (`/rt/locations/v3/labeled` GET/POST/DELETE) `[O]` grpc-route-index, 4.654 archive re-verified. Place search is **two-step, typed**: `maps.text-search/Search{search_region, search_context(ORIGIN|DESTINATION|GEOBIASED), search_type(AUTOCOMPLETE|FULL_TEXT_SEARCH)}` → `results[]: GeoEntityLite`; then `maps.get-details/GetDetails{geo_entity_lite_id}`; REST autocomplete twin `/rt/locations/v2/autocomplete`; `resolve-location` is **one call that snaps the pin and suggests alternatives** (`ResolveLocationRequest{context(PICKUP|DROPOFF),…}` → `ResolveLocationResponse{resultantLocations(required), locationSuggestions, nearbyPOIs, nearbyLocations}`) `[O]/[I]` (API study §1.1–1.2, §2.2). The pickup editor is a center-pin editor, **Compose-migrated in 4.655** — `connect_location_editor_compose_migration` removed; the three migration flags flipped false→true (re-verified `true` in `assets/parameters.json` today) `[O]`; `PinPresenter`/`PinViewV2` — "pin fixed at map center while the map moves under it" is a presenter, not screen ad-hoc code; the editor **owns reverse-geocoding of its pin position**; nearest-road snap is an **engine query** (`NearestRoadOptions{excludedRoadClasses, shouldExcludeClosures, …}`), never a client-side road-network hack. Map chrome (`MapSettingsModel`: user location, 3D buildings, closures) is server-controllable `[O]` (uber-benchmark §Feature 3; map inventory §8, §11; 4.655 study C16/E26).

### (2) Wind today

Wind has `src/map-provider-boundary.tsx` (capability-table renderer behind MapLibre/Google), `src/google-map.*`, `src/pin-sheet.tsx`, `src/customer-location.ts`, `/api/roads`, `src/place-search.ts` (**client-side filter over a static list — no search backend**), `server/domain/dispatch.ts` (geo-search) — and **no saved-places table**. MapLibre is Wind's GL engine commitment; Wind will never ship a two-engine fallback telemetry chain `[read]` (uber-benchmark §Feature 1 components list; IMPLEMENTATION-HANDOFF §3).

### (3) Target shape

1. **Serializable provider config** — one JSON `{initial, fallbacks, missingDefault}` passed to a `MapProviderState`-style object + one `active_map_count` analytics event (0.5–1 day). Drop the second engine entirely; a fallback set buys nothing over one renderer and only adds a silent-failure path `[D]`.
2. **Camera intent union + factory** — `CameraUpdate` one-of (incl. bounds-with-maxZoom) so camera behaviour is testable and server-drivable; plus the `AutoPositionAndZoom` framing request for trip overview (2–3 days). Padding-as-insets fed to the camera environment, not `setPadding` calls (1–2 days).
3. **Saved-places table + CRUD + chips** — `saved_places(user_id, label, point, address, residence_type)` + `GET/POST/DELETE /api/saved-places` + Home/Work/Custom chips in booking (2–3 days). Pure shape adoption; needs no map data beyond Wind's own.
4. **Pin-sheet → presenter/anchor-state refactor** — single source of truth for search/pin/confirmation (`pin-sheet.tsx` upgraded to the `PinPresenter` pair + `MutableAnchorLocationStream`-style observable MS) (2–3 days).
5. **POI layer behind a feature flag, shipped empty** — typed contract `POST /api/map/pois {anchor, ctx}` → `{groups:[{poiType, markers:[{id, point, metadata}]}]}`; SQLite `poi_cache` (key = anchor hex cell + filters hash, TTL ~10 min); map layer renders by type. **Blocked on a POI data decision** (Google Places proxy with server-side keys, or a West Bank POI table Wind builds itself) — until then render nothing (1–2 days for the contract + cache + layer; 2–4 blocked days upstream) `[D]`.
6. **Epoch-stamped vehicle path + slerp glide** — Wind's `MapView` receives driver fixes with `speed`; interpolate client-side with a heading snap; fake-clock test (2–3 days) `[D]` (already flagged ADOPT in the API study §6).
7. **`/api/location/resolve`** shaping Uber's response (`{resultant, suggestions}`) when West Bank road-class data QA passes — **not now** `[D]`.
8. **Keep runtime config server-wins** — Uber gates behaviour by 14,572 parameters server-side over APK defaults; Wind's `src/runtime-config.ts` already follows the shape — keep it, don't grow it into per-endpoint parameter swamps `[O]/[D]`.

### (4) Do not copy

- **Own GL engine / `libvendor-mapdisplay.so` / two-engine fallback + `didFallback` telemetry** — MapLibre covers Wind; the fallback chain exists to serve two production renderers Uber Wind does not have (6–9 person-days saved) `[O]/[D]`.
- **Quadtree collision + floating placements** — fixed zIndex + priority suffices at <~10 annotations `[D]`.
- **3-D GLTF cars** — flat rotated marker + heading `[D]`.
- **Server map documents (`MapModel` SDUI) with deprecated layers** — adopt the gesture/settings slice only (`MapSettingsModel`), not the document `[D]`.
- **`CameraUpdateTimeline` keyframes / sockets/ramen machinery** — Cubic-Bézier presets + the status poll suffice `[D]`.
- **Nearest-road snap before West Bank road-class QA (closures especially)** — blocked by map data, not code; Wind's pin stays where the user dropped it — acceptable at launch, flagged `[D]`.
- **AddStop/`AddressEntryPlugin` machinery** — out of scope; Wind's stop flow is one parcel `[D]`.
- **POI consumer Eats filters v1** — no restaurant use case; filters are optional later `[D]`.

---

## 16. Typed product contract and server-driven cadence: Uber Feature 4

### (1) Best-in-class

**The open repo question — "are rider offer/product payloads typed on the wire?" — is now answered in direction, not in field detail.** In 4.655 the rider offer path stayed as it was (`POST /rt/riders/v2/get-offers` EmptyBody → `GetRiderOffersResponse{pollingIntervalMS}`, server-driven cadence; push path `push_rider_offer` → `RiderOfferPushModel`, Ramen envelope with per-message ack + `lastseen_seq_id` resume) — **the middle filled in**: `com.uber.model.core.generated.rider.product` **+100** (was 41 — only `intercity`/`reservations` subtrees), `rider.presentation` **+46** (was 1,104), `go.rider` +27, `go.tripexperience` +4, `edge.models` +4, `rtapi.models` +4, `edge.services.dispatchconfig` **deleted end-to-end** (route + 9 classes gone) `[O]` (uber-benchmark §Feature 4; 4.655 study E10/E13; re-verified 41/1,104 against 4.654 archive today). Fare-estimate **was** already typed (`packageVariants(14)`, `vehicleViewIds(16)`, `productsDisplayOptions(18)`, `fareCacheTTLSettings(27)` → `FareCacheSettings{…H3 hex resolutions}`); product *selection* is a separate typed channel (`POST /rt/riders/product-configuration` → `RidersProductConfigurationData`); the *decision* is typed, the *delivery of the offer* rides the status/poll/push path. **Error discipline** industry-wide: per-endpoint `*Errors` unions, discriminator = **HTTP status first, body `code` second**; 401/403/429/500 pick the slot by status alone; 400/404 switch on `code`; unclassified → `synthetic.unknown`; builders throw on missing required fields; decoders keep unknown tags — "fail on what you require, never on what you don't know" `[O]` (API study §2.5–2.6). 14,572 parameters gate product behaviour server-side; `FEATURE_FLAG` 5,457, `BUG_FIX` 1,546 `[O]`.

### (2) Wind today

Wind has typed hot paths (`wire-contracts.ts`, `validateApiResponse`, `journey-contracts.ts`) and `OfferFailure{category, recovery}` on accept/decline; no typed product list; `nextPollMs` absent; API error handling is shared-shape already `[read]` (uber-benchmark §Feature 4; IMPLEMENTATION-HANDOFF §3).

### (3) Target shape

1. **Typed product list on `/api/price`** — extend the price/ETA response: `products[]` with a closed `id` enum including cash availability, fare, eta; validate with the existing validator; render the fare/product sheet from one payload, not loose keys (1–2 days) `[D]`.
2. **`nextPollMs` server hint** on the trip/order serializer — client polls when the server says, not on a fixed timer (0.5–1 day) `[D]`.
3. **Shared `ApiErrorCode` tuple** client/server — one enum, one validator; do **not** port per-endpoint `*Errors` classes or codegen `[D]` (API study §6: ADOPT-narrow).
4. **"Mutation returns state"** as a contract rule across driver command paths (cancel → fresh `getOrder`) — discipline, ~0.5 day `[D]`.
5. **Do not guess Uber's wire format** — the field set of the +100 product models is `[U]`; design Wind's own contract from its product model (cash-first, parcel types), never from Uber's `[U]`.

### (4) Do not copy

- **Ramen push topics, `ScaledOffers` poll-token plumbing, the generated `rider.product` codegen style, `EmptyBody`/Wire machinery** — `[D]`.
- **`product-configuration` as a separate RPC** — fold into Wind's price response; one call `[D]`.
- **Uber's parameter-gated everything (14,572)** — Wind ships flags in `/api/config`; nobody will maintain 154 namespaces in this repo `[O]/[D]`.

---

## 17. Handoff hints: Uber's airport pickup answer to Wind's densest streets

### (1) Best-in-class

**Feature 6 — Six new `tb-static.uber.com/prod/mobile-content-public/reserve/` URLs, all absent from 4.654** — `airport_pickup/curbside.png` vs `meet_and_greet.png` (the two "how the driver meets you at the airport" choices for Reserve), `illicons/{child_seat,booster_seat,pet_collar}.png` (reservation add-on icons), and a premium reel mp4 `[O]` 4.655 study §4.5, re-verified absent from `dex-urls.json`. All live under `reserve/` and are **hot-swappable CDN content — the pickup-experience imagery changes without an app release**. The Reserve surface around them: `reserve.tripedit` +48/+27 net (a second, reservation-specific editor flow); 21 `/rt/reservation/*` routes byte-identical between builds; `AccessPointIntent = PASSENGER_PICKUP|DROPOFF|DELIVERY_PICKUP|DELIVERY_DROPOFF` + `AccessPointUsage = … PACKAGE_PICKUP|PACKAGE_DELIVERY|FOOD_PICKUP|FOOD_DELIVERY` — **the venue access-point taxonomy is shared between rides and delivery**; the Reserve pickup flow is the entrance/curb UX with access-point data from `maps.get-access-points-for-place` `[O]/[D]` (uber-benchmark §Feature 6; 4.655 study C23/E33/E34).

**Why it matters for Wind:** the hardest pickup problem in dense Palestinian streets is the same shape — *where exactly does the driver meet the customer / where exactly does the courier hand over?* Uber's answer is (a) a typed access-point contract, (b) a small set of server-selectable hint images on a content CDN, (c) a reservation flow that surfaces the choice *before* dispatch. **The CDN-hint pattern is the cheap, durable part.**

### (2) Wind today

Nothing — no handoff choice anywhere; the delivery-proof flow (§4) closes the handoff but never frames it `[read]`.

### (3) Target shape

1. **`handoff_hint` on the order** — `meet_at_door | meet_at_entrance | leave_at_door | call_on_arrival`, chosen in booking, server-stored, rendered for customer and courier (2–3 days total) `[D]`.
2. **Two or three small hint icons served from Wind's CloudFront bucket** — **Wind-created assets only, never Uber's** — referenced by key, swappable per city (0.5–1 day) `[D]`.
3. **Courier-side handoff screen shows the chosen hint** + Wind's existing proof/photo flow (0.5 day) `[D]`.

### (4) Do not copy

- **Airport/flight integration, child/booster/pet illicons, meet-and-greet signage, premium reel** — irrelevant at Wind's scope `[O]/[D]`.
- **Reservation-override machinery** — Wind has no pre-booked ride product v1 `[D]`.
- **Uber's images** — fetching or bundling them is both a license and a brand problem `[read]` (hard rule 2).

---

## 18. Chat with canned replies: built for real, but not Wind's launch problem

### (1) Best-in-class

**Souq Tulkarm's chat is order-anchored, server-managed canned replies, redact-never-delete moderation.** API: `GET /chat/conversations` · `GET /chat/canned-replies` · `GET /chat/thread?customerId=…` · `POST /chat/send` (`{content}` + `idempotencyKey: clientId` + a `sessionStorage` optimistic draft) · `POST /chat/${id}/redact {reason}` · customer send uses `{content}` `[O] @578148–578500, @472151`. Canned replies are **server-managed data, not client constants** — the shop renders a quick-reply row from `/chat/canned-replies` (placeholder seen: `من مزارع طولكرم` — sold by Tulkarm farms) `[O]`. Moderation is **redact, never delete**: redacted messages render as an italic `redactedAt`-gated placeholder; both bubble styles differ by sender (leaf/slate); audit kind `MESSAGE_REDACTED` (`إخفاء رسالة`) `[O] @583825`; communities carry the same redact-don't-delete discipline (`/community/messages|questions|reviews/{id}/hide`, `/community/problems/{id}/decide`). Threads carry an `orderShortId` chip — order-anchored, not a global DM system `[O]`. No read receipts/presence for the customer `[O]`.

### (2) Wind today

`order_messages` table exists; `SPEC-in-app-chat.md` is already the design (order/parties-only, admin read-only, quick replies, 30 msg/10 min, 500 chars, account-deletion placeholder) `[read]` (souq-tulkarm.md §11; IMPLEMENTATION-HANDOFF §3). **Chat is a support-ops tool, not a growth feature; Wind has no support volume yet.**

### (3) Target shape (when support volume justifies it — after cash flow works)

1. **Server-managed canned replies table** + admin CRUD — ops A/B wording without a release (skip client constants entirely) `[D]`.
2. **Redact, don't delete** — `redactedAt`/`redactedBy`/`reason` columns + `MESSAGE_REDACTED` audit entry; redaction keeps the row forever (evidence) `[D]`.
3. **Order-anchored chips** (`order #A1B2`) on every message `[D]`.
4. **Keep Wind's rate limit** (30/10 min per person) — Souq shows none; Wind's is better `[D]`.
5. **Events-reload, not polling** — a `chat_message` channel triggers reload `[O]` pattern; Wind has `events.ts` (PG-gated today — §21) — wire when the dialect allows, or poll at 3 s for v1 `[D]`.

### (4) Do not copy

- **The community layer entirely** — S2 (§20) `[O]` (index S2).
- **Presence/read receipts for customers** — privacy + noise `[O]/[D]`.
- **Launching chat at the same time as the cash ledger** — Souq's own moderation backlog signals the cost; chat AFTER the ledger works, AFTER support volume exists `[I]`.
- **Optimistic-draft reliance** — Wind's draft stays retryable; never let a crash silently lose a customer message `[I]`.
- **Chat on the tracking link** — Wind's spec keeps chat off the public tracking link; keep it — right privacy call `[read]` (souq-tulkarm.md §11).
- **Redact without audit retention** — misconduct becomes invisible; keep `MESSAGE_REDACTED` forever `[I]`.

---

## 19. Payments: no provider, no activation — and the honest path

### (1) What "no provider" means, precisely

**Two independent blockers, not one** `[read]` (fable-52 HANDOFF §3.6; VERIFIED-ADDITIONS §1):
1. **Dialect.** `paymentsAvailable()` returns false on SQLite (`payments.ts:36`), so every payment route fails `409 payments_unavailable` via `gate()` (`:47`).
2. **No provider at all.** `paymentsConfig()` enables payment only for the test fake — `testFake: env.NODE_ENV === 'test' && env.WIND_PAYMENTS_TEST_ONLY === '1'` (`:32-34`), with the comment *"No payment provider is wired yet."* (`:29-31`). A PostgreSQL cutover alone would **not** activate payments.

A third finding on the same file: `payments.ts:53-63` always delegates the capture decision to `provider.create`; a provider outcome of `captured` can be stored and returned from `createIntent` **without calling `settlementGate`**; the gate runs on later query/webhook paths (`:78`, `:91`); `settlementGate` only takes the per-order lock and rejects conflicting cash/card settlement — it does **not** execute order/cash/custody side effects. Because provider capture precedes those checks, a 409 conflict can leave money captured at the provider while local state stays pending — **no automatic void/refund reconciliation exists** `[read]` (fable-52 HANDOFF §3.2). This is a *future immediate-capture activation blocker*, **not evidence of a reachable production PSP exploit or real-money movement** — the reviewed provider is a test fake `[read]`.

### (2) What competitors do (for calibration only)

Shiply ships card via `/customer/checkout/save-paymentCard` + a visa-commission opt-in — a commission contract Wind does not want (S1) `[O]` @1157932, @1163600. Uber ships a full payment-provider framework with cash as a first-class provider + arrears gate + cash-remainder-to-PayPal `[O]` (§8). Careem runs card-charge settlement of driver cash-debt on Careem Pay rails `[O]` (§7). **None of these rails is available to or wanted by Wind** — the mechanisms transfer (arrears gate §8; two-tier driver limit §7), the instruments do not (S1).

### (3) The honest path — in order

1. **Stay cash-only.** No payment method is enabled; the customer pays the driver at the door; the door amount flows into the ledger (§6). This is a complete, coherent product, not a degraded one — Souq runs exactly this way in Tulkarm `[O]`.
2. **Do not "activate payments" as a flag flip** — after the dialect decision (B1) and a provider decision, activation additionally requires **P0-5** in the repo's own backlog: fix `captureMethod` branching and settlement-gate ordering, void/refund reconciliation for post-capture 409s, regressions on the old control flow, a controlled real-provider walkthrough, owner authorization, and a disable switch `[read]` (fable-52 HANDOFF §4, P0-5; §3.2).
3. **Wind's settlement-out rail** (driver payouts) is Vodafone Cash / bank transfer — the mechanism is a **schedulable auto-deduct** of the driver's outstanding negative balance at a server-set threshold (Careem's recurring auto-deduct shape), never a card charge `[D]` (careem-rider-captain.md §3.3).
4. **Provider selection criteria when the day comes**: BoP-available in Palestine (Bank of Palestine), settlement to shekel accounts, PSP licensing path, fee structure compatible with cash-first economics, reconciliation API (not hosted redirect), and a contract that does not force Wind into card commissions `[D]`.
5. **Until then: `payments.ts` stays dark**; the `409 payments_unavailable` answers stay; nothing in the UI implies digital payment exists `[read]`.

---

## 20. HAAT (هات): the Palestinian-scale benchmark — Arabic order-state copy, proven

**(1) Best-in-class.** Haat (`com.haat.client` 21.0.4, native Java/Kotlin + Views on Play/pairip attestation, Intercom ×3,000 classes, MQTT paho + FCM + Braze push, Google Pay enabled, AppsFlyer attribution) ships the corpus's only production-tested Arabic order-state vocabulary — extracted verbatim from the shipped `values-ar` resources: order sent to venue `«تم ارسال طلبيتك الى المطعم»` / received by sender `«تم استلام الطلبية من قبل المرسل»` / driver assigned `«لقد تم تعيين المرسل»` / on the way `«المرسل أخذ الطلبية وهو في طريقه إليك»` / venue approved `«وافق المطعم على الطلب»` / venue rejected `«المطعم رفض الطلبيه»` / ETA granularity `«{minutes} دقائق متبقية»` with 3/5/10-minute "less than" ladders / minimum order `«الحد الأدنى هو %1$d منتجات»` / service fee `«رسوم الخدمة:»` as its own labelled line / hard post-dispatch lock `«لا یمكن تغییر او الغاء الطلبیة»` — [O] `aapt2 dump resources` against the shipped `.values-ar` table (`research_notes/Competitor feature implementation atlas/haat-client.md`). Address capture offers three paths — pin / manual entry / current location — plus `«ساعدوا المرسل في تحديد مكانكم»` ("help the sender find you"), the exact no-street-number fix for Palestinian addressing. Support is a first-class product (Intercom); referral is modelled end-to-end (`com.haat.client.model.referral`, deep link `haat://haat.delivery?type=referAndEarn`); backend is Cloudflare-fronted (`haat.delivery`, HTTP 200, 54–64 ms RTT, `user.haat.delivery` for account).

**(2) Wind today.** No Arabic order-state copy; ETA is one rounded number; no minimum-order gate, no ETA ladder, no labelled service fee, no actor-named states.

**(3) Target shape.** Actor-named state copy for three visible states only (out-for-delivery / delivered / pre-dispatch editable), a `«أقل من 3 دقائق»`-style ETA ladder, a labelled `رسوم الخدمة` fee line, and the address-help prompt on the address screen — in Wind's own words. Server-driven wording is fine; the list of states stays small.

**(4) Do not copy.** Their Arabic verbatim (trade dress); their stack wholesale (native vs Expo/RN); the pairip attestation (adopt later if/when the APK is publicly distributed); the Intercom footprint.

---

## 21. What Wind must NOT copy — the consolidated skip list, with the reasons

| # | Skip | Reason (artifact evidence) |
|---|---|---|
| S1 | Card / wallet payment + card-commission (Shiply `/save-paymentCard`, `enable-visa-commision`, `/users/agree-to-cover-visa-commission` `[O]` @1157932/@1115939/@1163600) | Wind is cash-only by constraint; a commission adds a contractual relationship Wind does not want; Wind has no provider anyway (§19) (index S1) |
| S2 | Marketplace / community / social layer (Souq's lists, problems, moderation, follows, blocks, Q&A, reviews, suggestions, deals) `[O]` (index S2, F-13/F-14) | Large surface, zero Wind value at this stage; support volume gates it |
| S3 | B2B catalogue / vendors / store+cart+checkout / employees / salesmen (Shiply 15 products-catalog routes; employees; salesmen; `/platform/users/{id}/approve` `[O]` route regex/histogram) | Roughly doubles product surface; a different business; Wind's "employee" is a driver (index S3, F-12) |
| S4 | Capacitor-shell web app as Wind's architecture (Souq: 4 native classes, JS in a WebView `[O]` ZIP listing) | Loses native background location, native push channels, reliable offline writes; forces browser-first model onto a courier app (index S4; souq-tulkarm.md §1) |
| S5 | Shipping credentials in app config — Google Maps API keys Android **and** iOS, Expo project id, Sentry DSN + org `shiply-qw`/project `shiply-customer`, `EXPO_UPDATE_URL` (all `[O]` `app.config`) | Decompilable; grants anyone the right to pollute Wind's crash stream and Maps quota (index S5; shiply.md §9, §12) |
| S6 | `allowBackup="true"` at application level (Shiply sets it; only secure-store excluded `[O]` manifest) | Wind holds addresses and cash records; address data rides into any restore ever (index S6; shiply.md §12) |
| S7 | Ad-storage analytics defaults — `_allow_ad_storage/user_data/personalization_signals=true`, `AD_ID`, `ACCESS_ADSERVICES_*`, `google_analytics_automatic_screen_reporting_enabled=true` `[O]` manifest | Wind's parcel PII + cash ledger must never be ad-tech exhaust; first-party, purpose-limited analytics only; explicit written decision, never a default (index S7; shiply.md §9) |
| S8 | Permission sprawl — `READ_PHONE_STATE`, `RECORD_AUDIO`, `BLUETOOTH`, `DISABLE_KEYGUARD`, `SYSTEM_ALERT_WINDOW`, `DETECT_SCREEN_CAPTURE`, `BROADCAST_CLOSE_SYSTEM_DIALOGS`, `AD_ID` (Shiply/Careem both ship these) `[O]` manifests | Each is a privacy cost and a Store-review liability in a location-sensitive market; Wind needs none (index S8; shiply.md §12; careem-rider-captain.md Appendix A) |
| S9 | Always-on background location (Salati `SalatiService` persistent `LocationListener` `[O]`) | Battery + privacy disaster on 2G cheap phones; Wind uses **shift-scoped** location instead (A5) (index S9; SOUQ's `locationPingSeconds` hint `[O]` @599562) |
| S10 | Chat with canned replies at launch (Souq ships it; Wind's support volume is zero) | Expensive without volume; order-anchored chat first, community never (index S10; §18) |
| S11 | Single hosted origin (Railway) as production shape (Souq's entire backend `[O]` @198750) | Wind's CloudFront/EC2 + SQLite/Postgres single host is equivalent-class; neither gets multi-instance until §21/§22 gates pass (index S11) |
| S12 | Athkar's and Salati's actual products | Not delivery apps (index S12, §0; IMPLEMENTATION-HANDOFF §1) |
| S13 | Web Push instead of FCM on Android | S13 is correct to skip: FCM data-only + Notifee, or nothing (index S13; §13; souq-tulkarm.md §14) |

**Additionally-skipped, competitor-specific (not in the original S1–S13 but found this pass):**

| # | Skip | Why |
|---|---|---|
| X1 | Shiply's 10-domain deep-link sprawl with `autoVerify=true` on http variants `[O]` manifest | Registry-squatting/hijack surface + verification ops burden; one canonical domain, `https://wind.ps/p/<token>`, autoVerify, AASA + assetlinks.json (shiply.md §10) |
| X2 | Shiply's reverse-domain mismatch (Android `com.shiplypalestinemobileapp` ≠ iOS `com.shiplypalestine.shiplypalestine` ≠ EAS owner `shiplydev` ≠ sentry org `shiply-qw`) `[O]` | Mint **one** reverse-domain and use it everywhere — package id, bundle id, Firebase, deep links, signing; Firebase authorities must be minted under it (shiply.md §12) |
| X3 | Float money anywhere — Souq's `Math.round(Number(s)*100)` and Careem's earnings `double` vs cash-limit `BigDecimal` split `[O]` | Wind must pick **one** money representation — it already has: integer minor units ILS in `money.ts`; never regress (souq-tulkarm.md §3; careem-rider-captain.md §3.1, §9.13) |
| X4 | Hard non-reversible activation without compensation (Shiply's `same_day_cannot_revert_parcel` `[O]` @1313789) | Customer-relations and regulatory risk; cutoff-hour cancel + fee consequence instead, only after D12's gate (shiply.md §6) |
| X5 | `RECEIVER exported=true` + Compose/test `PreviewActivity` in release (Careem ships `androidx.compose.ui.tooling.PreviewActivity` and test-invoker activities exported `[O]` manifest) | Release-hygiene defect; Wind's manifest must not carry any exported debug surface (careem-rider-captain.md Appendix A) |
| X6 | `firebase_messaging_auto_init_enabled=true` before consent (Shiply `[O]`) | Consent first, always (§13) |
| X7 | Uber's verification-removal direction (`presidio.realtime` 147→113) as "proof we should delete Wind tracking states" | Wind's A10 (stale/reconnecting states) is implemented and correct — never regress it for parity (index A10; Uber Feature 1) |
| X8 | Pin machinery ad-hoc per screen (pin shipped without PinPresenter discipline) | Wind's `pin-sheet.tsx` becomes one presenter, one anchor state (§15) |
| X9 | Copying any string set as Wind's copy (Souq's Arabic, Uber's Arabic split, Careem's Arabic) | Shape transfers, wording does not — Wind's Arabic is fluent, reviewed, Palestinian (hard rule 2; §8) |
| X10 | Treating static artifact reading as "competitor X does Y in production" | Every server-behaviour claim in this corpus is shape-only; competitor runtime is unverified; never sold as certain to stakeholders (§23) |

---

## 22. Production deployment evidence (read before planning any release)

**Source: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\production-deployment-evidence.md` (13 Nov 2026, delegated read-only verification pass; credentials redacted by the researcher). Wind deployment facts, not competitor facts.**
**Git / release provenance.** Local `master` @ `b609229` (`ahead 6 / behind 277` vs `origin/master` — `git rev-list --left-right --count origin/master...master` → `277  6`). `git ls-remote origin refs/heads/master` → **`b89f2205965523b5ab8545dff3940d1eacb6062c`** — the canonical `origin/master`. Object `4f647e77ddc4b4f2ed0ecbd047dc1037953d888d` exists, is the `2026-11-12 18:45:18 +0200` merge of **PR #28 ("Move production hosting from Azure to AWS")**, and is an ancestor of `origin/master`. **No git tag `20261112-aws1` exists anywhere — it is an ECR image tag only**; `git grep` on origin/master for `20261112-aws1|dabea3995716|4f647e77ddc4` returns no matches (the strings live in untracked docs only). Five/six "earlier verification docs" (`HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md`, `…FINAL-VERIFIED-CUTOFF.md`, `REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md`, `VERIFICATION-ADDENDUM-2026-11-13-FINAL.md`, `CLAIMS-LEDGER.md`, `HANDOFF-2026-11-13-FABLE-5.2-UBER-GRADE.md`) are **untracked, not on `origin/master`**; UBER-GRADE exists only in a stray worktree. `docs/operations/deploy.md` in the root tree is stale (Azure-only); `origin/master`'s version carries a "Production host on AWS" section. `origin/master` is canonical; the untracked "FINAL" docs are historical and unverified.

**AWS (fresh, read-only; `python -m awscli` v1.46.3; AWS CLI v2 "not present" in this env).** Caller identity for profile `pool-bedrock-083712835043` → account `083712835043`, user `BedrockAPIKey-vaer`. Profiles `wind` and `osama` → "session has expired … aws login" (exit 255). **ECR `wind-api`: exactly one image** — `20261112-aws1`, digest **`sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc`**, pushed `2026-11-12T16:53:26Z`, pulled `16:54:39Z`, `ACTIVE`, 86,309,038 B (~82.3 MiB). `BatchGetImage` → **AccessDenied** — image config / `revision` label unreadable here, so tag↔digest consistency is established but the deployed container's `org.opencontainers.image.revision` is **not**. GitHub (`gh`, logged in as `osama-2000236`): release-image workflow run **`43263201635` success** on head_sha `4f647e77ddc4…` (2026-11-12T16:51:27Z), pushed `wind-api:20261112-aws1` with digest `sha256:dabea3995716…`; failed predecessor `43262109795` (OIDC `AssumeRoleWithWebIdentity` denied); **PR #29 codified the fix afterwards**. Read-only attempts — EC2 `DescribeInstances`, SSM, CloudFormation `DescribeStacks` (error leaks stack physical id `d11cbdb0-deb3-11f1-8e7c-06ffc9f28a8f`), CloudFront `ListDistributions`, SNS, `logs:FilterLogEvents`, `s3api get-bucket-versioning`, `ecr batch-get-image`, `freetier:GetAccountPlanState` — **all AccessDenied** (exit 255). **`synthetics describe-canaries --region eu-north-1` → `{"Canaries": []}`**; **`cloudwatch describe-alarms --alarm-name-prefix wind` → `{"MetricAlarms": [],"CompositeAlarms": [],"LogAlarms": []}`**; no Wind log groups. `s3 ls s3://wind-backups-083712835043` → **exactly two objects, 10,148 B each**: `wind-20261112T165723Z.db.gz` (12 Nov 16:57Z) and `wind-20261113T031001Z.db.gz` (13 Nov 03:10:04Z) — **2 backups**. Public checks: `https://dlvxzw3gj596d.cloudfront.net/api/ready` → **200 `{"ok":true,"schema":3}`** (**schema 3**); `/api/health` → **200 `{"ok":true}`**; hourly Uptime **green**.

**Azure (`azure-cli` 2.91.0).** `az account list` → "Azure subscription 1" `9b3ca69d-0c12-40c8-8a47-11aec6a73840` **Enabled**; "Azure for Students" `b1c03267-01e8-4ca6-96d1-e3390c2f9bd8` **Disabled** — create-time docs calling Azure "disabled" are contradicted at ARM layer (fresh read), though the data plane is broken. VM `wind-vm` (RG `wind-prod`, swedencentral) — **deallocated**, `20.91.209.132`. Container App `wind-api` present, `provisioningState: Failed`, no ingress — the "unused" app is confirmed still there. ACR `windprodacr` (Basic, admin Enabled) exists; `repository list` → `connectivity_forbidden_error`; old Azure image unverifiable. Storage `windprodstore` (swedencentral) exists; `az storage blob list --auth-mode login` → **`AccountIsDisabled`** (2026-11-13T15:39:20Z).

**Still not established (needs owner re-auth / host access).** What is **running** on the host: the running image digest, the `org.opencontainers.image.revision` label, deploy time, env key names — the settling command requires a refreshed owner session; the CloudFront config is unreadable with the current credential. **That the running container is `20261112-aws1`** — the pull time is indirect; rollback container `wind-api-pre-20261112-aws1` may exist. Backup **integrity** — not re-verified this pass (only metadata presence; integrity was verified earlier only for downloaded objects). Plan/spend-limit state — denied to both the read-only key and the expired login.

**Consequences.** The untracked 2026-11-13 "FINAL" docs are historical, not canonical — `origin/master` is canonical. **The production APK on the phone still points at the retired Azure host** per those same untracked docs — the AWS API is healthy but the client is not aligned to it. Backup retention/restore drill has no fresh evidence since 13 Nov 03:10Z; "Uptime green" is one hourly synthetic, not monitoring; **no canaries, no alarms, no log groups** — an outage or ledger bug pages nobody. **This deployment is not "ready" by any of the repo's own gates** (fable-52's P0-6: restore drill + alert delivery are open; P0-1 baseline and P0-8 physical release journeys unmet) — and no section of this report claims otherwise. Nothing above weakens the competitor analysis; it fences it: every "Wind today" cell in §1–§20 describes a codebase whose production deployment is unverified beyond a single health endpoint and a 200 on readiness.

---

## 23. Decisions to make (one page)

**1 — Dialect (B1). Adopt ADR-001's recommendation: C now, A as the next milestone, B never.** Measured, not argued: `runtime.ts:1-27` picks SQLite when `WIND_DATABASE_URL` is unset (`:9`); `WIND_POSTGRES_STAGING=1` + valid non-loopback URL → Postgres pinned to `wp16_staging` (`:11-18`, a staging path, not a cutover); any other URL throws (`:20-21`) `[read]`. Twelve modules gate on `backend==='postgres'` and are **dead code in the pilot** `[read]` (VERIFIED-ADDITIONS §1). **18 of 20 tables** those gates probe exist only in `postgres-*.sql`; only `quotes` and `road_restrictions` are shared — and `quotes.ts:9` fails on SQLite anyway (requires `schema_migrations`) `[ran]` (VERIFIED-ADDITIONS §6). Options: **A** finish the cutover (5–10 days + migration risk; unlocks ledger/outbox/custody/dispatch at once; the cheapest *timing* window is now, before data accumulates; the pilot is ~9 users, 2 cancelled orders) · **B** port the twelve modules to SQLite (18 tables + invariants a second time — outbox, double-entry journal, custody chain, `FOR UPDATE SKIP LOCKED` semantics SQLite lacks; a permanent second product — reject) · **C** scope the pilot on purpose (declare what the pilot does not have; disable or visibly mark the gated paths; write the "what this pilot does not do" note for operators; keep the gates as the mechanism that makes the scoping true). **Recommendation stands as the ADR proposes: C this week, A scheduled next with its own ADR and rehearsal, B ruled out explicitly.** B2/B3/B4 (host dialect confirmation, restore drill, schema-orphan decision — `firebase_resets`, `native_push_tokens`) are minutes each and can invalidate everything else; do them first (GAP-BACKLOG sequence 1).

**2 — Haat driver artifacts: yes, pull them next.** The corpus has zero driver-side artifacts except Careem Captain; HAAT Driver (`com.haat.haatdriver` v9.72) and HAAT Courier (`com.haat.courier` v1.1.0) are the closest Palestinian-scale analogue to Wind at all `[re]` (HAAT.md:38; index §5). Acquisition is a Play listing + public artifact — lawful — but the DRIVER-SIDE-RESEARCH-PLAN's discipline is mandatory: verify identity from the listing and `aapt2 dump badging` before any analysis (the alternate spellings `com.haaddriver`/`com.haatcourier` are `[U]` until a base-APK manifest agrees); record timestamp/URL/version/SHA-256/signer per artifact; split sets are one build, not one file; an evidence manifest before findings; no execution; static only. Cost: days, not weeks; value: answers A5 (shift/queue reality), A11 (driver-side cash flow), and whether Wind's shift design matches a shipping Palestinian product. **Also re-verify Shiply's driver surface is genuinely absent** before commissioning anything further on Shiply. Do it before building A5.

**3 — Payments: the path, not just the gap.** (i) Stay cash-only; no route, screen, or doc implies digital payment. (ii) Two independent blockers must both clear: the dialect (B1→A cutover) and **a provider decision + P0-5** (settlementGate ordering on every capture path — `create`, direct `query()`, webhook — void/refund reconciliation for post-capture 409s, controlled real-provider walkthrough, owner sign-off, disable switch) `[read]` (§19; fable-52 P0-5). (iii) Wind's settlement-out is Vodafone Cash / bank transfer via a schedulable auto-deduct of driver negative balance — never a card charge (§19). (iv) No flag flip: until both blockers clear, `payments.ts` stays dark and `409 payments_unavailable` stays the correct answer. (v) The moment the dialect cuts over, payments is still off — a PSP is a commercial + compliance decision, deliberately not bundled with the migration.

**4 — Per-feature adoption order (souq's ledger/proof/idempotency patterns first — they are what make a cash market viable):**

0. **B2, B3, B4** — host dialect confirm, restore drill, orphan decision (minutes; do before anything).
1. **B1** — dialect decision (C now / A next).
2. **D3** — PostgreSQL fixture on `127.0.0.1:55473` or `WIND_TEST_DATABASE_URL`; unblocks 4 suites + D1 Part A.
3. **A3, A9, A10 — acceptance tests only** (already implemented; convert source-read confidence into evidence; remove from the plan).
4. **A11** — door-time capture + typed variance reasons on the cash axis (§6) — **the single highest-value cash-market feature missing; with it, reconciliation stops being a spreadsheet**.
5. **A2 (collection leg)** — balanced journal per collection against Wind's trigger-enforced append-only `cash_entries` (§7) — parity with Souq's `/driver/cash/handover`, minus the one-sided count.
6. **A5** — shift + `PENDING_SETTLEMENT` gate + ready queue (§11) — the operational model the business runs on; fixed after (4)–(5) so the gate has something to gate.
7. **A13** — versioned per-event channels, FCM data-only + Notifee + `default_notification_channel_id` fallback (§13).
8. **A12** — `service_level` one-field parcel attribute (§12) — after the capacity model means something (A8).
9. **A1 + A8** — zone-first address and windowed capacity on SQLite (§2–§3) — or free post-cutover, either way; replace the `model.ts:185` 20 km shortcut.
10. **A7 (extend)** — outbox scope, caps, allowlist extension; enumerate covered commands before promising offline money writes (§10) — and A3-aligned: collection/custody/shift routes join the durable path.
11. **A2 (journal leg) + A6 + A15 + A14** — after B1: double-entry journal, custody chain, fallback bundle, alarm re-arm graph.
12. **Then, and only then, the Uber set:** arrears gate + Arabic cash copy (§8, 7–11 days) → saved places + pin presenter (§15, 5–8 days) → typed product list + `nextPollMs` (§16, 3–4 days) → handoff hints (§17, 3–4 days) → map-first polish + saved-places→POI-behind-flag (§15, remainder).
13. **Chat last (§18), community never (S2).**

---

## 24. What is unknown (do not let anyone paper over)

**Competitor side.** All server behaviour is unobserved: Souq's append-only ledger guarantee is anchored in API shape + UI copy + Wind-analogue `business_ref` idempotency — the server module is unobservable (static read only) `[U]` (souq-tulkarm.md §4, §14). Window-capacity race and whether `selectable` is read or reserve `[U]`. `deliveryQrToken` entropy/rotation; `deliveryCode` length ("4 أرقام" hint only) `[U]`. Full shift enum; force-close UI `[U]` (kind exists, UI not found). Admin pulse poll interval / event-bus transport (SSE vs WebSocket) `[U]`. Shiply's approval contract (`/platform/users/{id}/approve` not re-derivable) `[U]`. JAYEEK price/settlement terms — server-driven, contract unknown `[U]` (shiply.md §6). Uber POI wire path `[U]`; `+100` product-model field set `[U]`; `CameraManagerWorker` 10 values unconfirmed `[U]`; `FlashNacional` nature `[U]`; `libse.so`/`libeef0.so`/on-device TFLite roles `[U]`. Reserve URL call sites unread `[U]`. Careem's server limit computation, block-lift semantics, Palestine applicability, `EarningTypeDto` values, cycle length, Pushy-vs-FCM division of labour `[U]` (careem-rider-captain.md §9). Every competitor APK set studied is static-only; **no request was sent, no host contacted, no traffic observed** — acquisition provenance ("pulled from owner's phone" vs "phone not touched") remains unresolved in the corpus and must not be silently harmonized `[read]` (fable-52 HANDOFF §3.5). Four of the eight prior studies are single-build snapshots `[read]`.

**Wind side.** What runs on the AWS host (digest/revision/env) `[U]` (§21); whether the phone's APK can even reach the pilot API (points at retired Azure) `[U]` (§21); backup restore proof fresh since 13 Nov 03:10Z `[U]`; the PostgreSQL fixture at `127.0.0.1:55473` refused `psql -w` — four suites unexecuted, D1 Part A unrun `[ran]` (VERIFIED-ADDITIONS §8); physical-device release journeys (P0-8) unmet; production load/SLOs unmeasured; k5 remote testing unavailable (keys refused) `[read]` (fable-52 HANDOFF §6).

**Method note that applies to every section above.** A token grep proves a name is absent, never a capability; a passing test is not a correct change; the dialect is stated from the deployment, not the code `[read]` (IMPLEMENTATION-HANDOFF §0, §4; VERIFIED-ADDITIONS §2). Three of this repo's own "absent" labels failed that test (A9, A3, A1/A8) before the source audit corrected them; any future absence claim in this file must be read the same way.

---

## 25. Conclusion

The competitor corpus converges on one transferable truth: **the apps that make cash work do so with server-held truth and client-held dumbness** — the server owns the cap, the cap on the door amount, the limit on the driver's cash-debt, the lockout on the proof, the scope on the outbox, the append-only write on the ledger; the client captures, renders and queues. Nothing in that list is expensive, and almost all of it is already half-built in Wind. What is missing is not ingenuity; it is (a) the dialect honesty decision — stop planning against capabilities that return 409 — and (b) the door-time collection leg, without which Wind cannot say how much cash a driver owes, which makes everything downstream (handover, settlement, arrears gate, earnings statement) decoration. The second truth is quieter: Wind's remaining failures are mostly *verification* failures — unrun restore drills, an unread host, an unverified phone build, unexecuted Postgres suites, tests-that-look-like-progress. The competitors studied here never claimed their servers worked; the repo docs here prove Wind's pilot works only within its narrow path, and §21 shows exactly how far that proof extends. Adopt C now, A next, B never; build A11–A13–A12–A5–A1–A8 on the dialect that exists; keep the skip list enforced; and let the Souq/Careem/Uber precedents be what they are — evidence of shape, never of law, and never of permission to ship unreviewed Arabic, unreasoned admin actions, or a ledger that trusts the client.

---

## 26. Sources (absolute paths)

**Competitor notes synthesized in this report:**
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\souq-tulkarm.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\shiply.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\uber-benchmark.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\careem-rider-captain.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\production-deployment-evidence.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\Competitor feature implementation atlas\haat-client.md`

**Earlier studies and syntheses built upon (not re-verified; cited as background):**
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\PALESTINIAN-COMPETITORS-INDEX.md` (A1–A15 adopt, S1–S13 skip, D1–D14 defer; A13 evidence Athkar/Shiply)
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\SOUQ-TULKARM.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\SHIPLY.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\CAREEM.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\HAAT.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\UBER-4.655-rider.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\ATHKAR.md` (referenced via index A13/D6)
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\SALATI.md` (referenced via index A14/A15/S9)
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\reports\Delivery comparison master evidence.md`

**Wind repo documents and evidence (12–13 Nov 2026 passes):**
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-GAP-BACKLOG.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-IMPLEMENTATION-HANDOFF.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-VERIFIED-ADDITIONS.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-DIALECT-ADR.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\docs\REA\2026-11-13-DRIVER-SIDE-RESEARCH-PLAN.md`
- `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\fable-52-verified-execution-2026-11-13\HANDOFF.md`

**Wind repo code paths named inline as `[read]`/`[ran]` evidence** (not re-read by this synthesis; cited as recorded by the passes above): `server/db/runtime.ts`, `server/db/sqlite-schema.ts`, `server/db/postgres-*.sql`, `server/domain/{commands,dispatch,eligibility,events,ledger,native-push,ops,payments,private-objects,quotes,resource-scope,ride-lifecycle,cash-ops,presence,eligibility,quotes,journey,money,destination-change}.ts`, `server/main.ts`, `src/model.ts`, `src/location-state.ts`, `src/background-location.ts`, `src/offline-summary.ts`, `src/offline-recovery.ts`, `src/offline-outbox.ts` (planned), `src/app/book.tsx`, `src/app/driver/*`, `src/app/admin/cash.tsx`, `tests/booking-retry-race.test.mjs`, `tests/booking-auth.test.mjs`.

**External anchors quoted for reference** (public endpoints the notes verified as unresolvable or reachable; not fetched by this synthesis): `https://haat.delivery`, `https://souq-production-52a0.up.railway.app/api`, `https://sdui-activities.core.gw.prod.careem-rh.com`, `https://captain.careemapis.com/`, `https://settlement-service.careemapis.com/`, `https://dlvxzw3gj596d.cloudfront.net`, `https://tc2.uber.com/style/default/native?o=DEFAULT`, `https://tb-static.uber.com/prod/mobile-content-public/reserve/*`, `https://play.google.com/store/apps/details?id=com.haat.haatdriver`.

*All competitor identifiers are quoted for identification only; no code, asset, icon, layout, or string set was copied into this file. No competitor system was contacted. No Wind production system was mutated by this synthesis.*
