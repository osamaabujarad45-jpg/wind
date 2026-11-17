# Souq Tulkarm (`ps.souqtulkarm.app` 1.0.2) — competitor feature implementation atlas

**Artifact:** `ps.souqtulkarm.app` v1.0.2 (versionCode 3), `souqtulkarm__base.apk` (4,153,798 bytes)
**Study date:** 2026-11-13 · **Method:** static read only. No server contact, no credentials, no execution, no decompilation beyond reading `assets/` inside the APK ZIP. Native shell is 4 classes; all product logic lives in one file.
**Scope:** the top 6 features flagged in the engagement (address model · cash-cents door model · append-only cash ledger · delivery proof · order state machine · delivery windows/zone fees) plus custody chain, shift/job board, offline outbox and chat. Each: (1) observed mechanism, (2) anchor, (3) "done like Souq" in Wind's own code, (4) failure modes.
**Claim labels:** `[O]` observed (file + char offset in the decoded bundle) · `[I]` inference · `[U]` unknown · `[D]` derived representation (minified JS — string literals reliable, surrounding code reconstructed).
**Anchors** are char offsets into the UTF-16-decoded bundle `assets/public/assets/index-Bh9QEjtC.js` (decoded length 618,519 chars — the older study's byte offsets in SOUQ-TULKARM.md run ~1–2 % lower for the same strings). The bundle is 24 physical lines, RTL Arabic, Vite build. `jsQR` (129,975 B) ships for QR decode; no native business logic exists (`lib/` absent).

---

## 0. Re-derived claims vs. the prior study (SOUQ-TULKARM.md) — corrections first

Do not build on the older file without these corrections. All re-derived directly from the bundle this pass.

| # | Old claim | Verified reality this pass | Evidence |
|---|---|---|---|
| C1 | "9 typed failure reasons" (`CUSTOMER_DID_NOT_PAY`, `WRONG_ADDRESS`, …) presented as one enum | There are **two distinct typed maps**: `Gs` — **cash-variance reasons** shown at door-confirm time, 6 entries: `PARTIAL_PAYMENT` `دفع جزئي` · `CUSTOMER_DID_NOT_PAY` `الزبون لم يدفع` · `APPROVED_DISCOUNT` `خصم معتمد` · `RETURNED_ITEMS` `أصناف مرتجعة` · `INCORRECT_CASH` `نقص في النقد المستلم` · `OTHER_ADMIN_REVIEW` `سبب آخر يحتاج مراجعة الإدارة`. `Ks` — **delivery-failure reasons**, 6 entries: `CUSTOMER_UNREACHABLE` `الزبون غير متاح` · `CUSTOMER_REFUSED` `الزبون رفض الاستلام` · `WRONG_ADDRESS` `العنوان غير صحيح` · `ACCESS_BLOCKED` `تعذر الوصول للعنوان` · `CUSTOMER_RESCHEDULED` `الزبون طلب تأجيل` · `OTHER` `سبب آخر`. `CUSTOMER_DID_NOT_PAY` is a *cash* reason, not a "delivery failed" reason. | `[O]` @516424 |
| C2 | "29+ statuses" as if one vocabulary | The **customer-facing order enum `gr=`** is exactly **10**: `NEW, PACKING, AWAITING_DECISION, PACKED_READY, IN_CUSTODY, DELIVERED, DELIVERY_FAILED, RETURNED, CASH_SETTLED, CANCELLED` — each `{label, staffLabel?, tone}`. The "29+" was a bundle-wide SCREAMING_SNAKE token census, which mixes in adjacent machines: shift (`ACTIVE`, `PENDING_SETTLEMENT`), delivery result (`SUCCESSFUL`), checkout/custody event kinds (`PACKED, ACCEPTED_BY_DRIVER, TRANSFERRED_OUT, TRANSFERRED_IN, RETURN_REQUESTED, RETURNED_TO_SHOP, VOIDED` — 8), scan methods (`QR_SCAN, SHORT_CODE, ADMIN_ACTION` — 3), admin pulse kinds (`STALE_LOCATION, AWAITING_CUSTOMER, DELIVERY_FAILED, CASH_VARIANCE` — 4), payment results, and audit kinds. | `[O]` @233287 (`gr=`), @456390 (`os=` progress ladder), @529620 (`Xs=`/`Zs=`), @516424 |
| C3 | Progress model implied as linear statuses | `os={NEW:0,PACKING:0,AWAITING_DECISION:0,PACKED_READY:1,IN_CUSTODY:2,DELIVERED:3,DELIVERY_FAILED:2,RETURNED:1,CASH_SETTLED:4,CANCELLED:0}` — order status maps onto a **5-stop progress rail** `PACKING → CUSTODY → DOOR → CASH` (keys seen @456350). The rail indexes a UI timeline, not a transition table. | `[O]` @456350–456390 |
| C4 | Delivery-confirm spread `...await Hs()` implied to be device/battery health | `Hs()` = **best-effort geolocation**: `navigator.geolocation.getCurrentPosition(...)` with `enableHighAccuracy:!1, timeout:4e3, maximumAge:3e4`, resolving `{lat,lng}` or `{}`. It is spread into `/driver/delivery/confirm`, `/driver/delivery/fail`, custody scans — i.e. **custody/delivery events carry a GPS fix**. Battery and permission health travel a different path (`POST /driver/shift/location-health`, `/driver/shift/tracking` with `health:'PERMISSION_DENIED'` @252495). | `[O]` @512409, @252495 |
| C5 | `idempotencyKey` + `queueAs` pattern "every write" | Confirmed and sharpened: the HTTP helper sets header `Idempotency-Key` to `n.idempotencyKey ?? (n.queueAs ? Fe() : void 0)` where `Fe = () => crypto.randomUUID()`; the key is **also the outbox entry's `id`** — replay re-sends `{idempotencyKey:i.id}`. Same key + **different body** → `409 IDEMPOTENCY_CONFLICT` with Arabic copy `الإجراء المحفوظ له بيانات مختلفة. راجعه قبل المحاولة.` ("the saved procedure has different data — review it before retrying"). | `[O]` @202157, @200561, @200105–200145 |
| C6 | Outbox = `souq.outbox`, replay rules undocumented | Full replay loop recovered @202157: entries carry `{id, scope, method, path, body, label, queuedAt, attempts}`; replayed only while `entry.scope === currentSessionScope`; on failure, `status===0 \|\| 401 \|\| code==='SESSION_CHANGED' \|\| 429 \|\| >=500` → `attempts+1`, entry kept, flush **stops**; any other error → entry kept with `error:message` and surfaced to the user as a failed item. Unscoped "legacy" entries (`De()`) are listed separately and migratable via `Oe()`. Flush triggers: `window` `online` event, `visibilitychange` (non-hidden), session/store/role change, explicit `flushNow`. 20 s `AbortSignal.timeout(2e4)`; `credentials:'include'`; on Android the token comes from `SouqNative.getSession()` (native `SecretKey`), web falls back to cookies; `X-Actor-Scope` header carries `[userId, storeId, role]`. | `[O]` @199490–199520, @200105–200230, @202157–202230, @249339–249420, @250119–250393 |
| C7 | Proof-reset and lockout "after failed attempts" | `PROOF_LOCKED` occurs **exactly once** in the bundle — in the `catch` of the delivery-confirm call, setting a `m(!0)` lockout UI flag @517775. Admin reset: `POST /admin/orders/${id}/proof-reset {reason:v}`, `v.trim().length<5` required, up to 500 chars, copy `أُعيد فتح محاولات الكود. ما زال إثبات التسليم مطلوباً.` ("code attempts reopened; delivery proof still required") @548381. | `[O]` @517775, @548381 |
| C8 | `cashHandoverPolicy` not noted | Admin settings carry `cashHandoverPolicy: PER_ROUTE` (بعد كل جولة) / `PER_SHIFT` (نهاية كل وردية) / `END_OF_DAY` (نهاية اليوم), hinted as "تشغيلية تُعرض للسائقين؛ الإقفال المحاسبي يبقى بعدّ الإدارة" (operational, shown to drivers; accounting close remains admin's physical count). Also `maxStopsPerVehicle`, `locationPingSeconds` (interval hint: "رقم أكبر يوفّر بطارية السائق" — bigger number saves driver battery), and per-vehicle `capacityBoxes` ("أقصى عدد طرود في الحمولة الواحدة"). | `[O]` @599562–599926, @596983 |
| C9 | Zones = fee + minOrder only | Zone admin payload to `POST /admin/zones`: `{zoneId?, nameAr, deliveryFeeCents, minOrderCents, activeDays:[0..6]}` with `days` default `[0,1,2,3,4,5,6]` and the list UI rendering `كل الأيام` when 7, else `e.activeDays.map(...)`. Customer order screen reads `s.data.find(z=>z.id===l)` and enforces `subtotalCents < minOrderCents` → block. Admin zone form defaults `fee:5.00, min:30.00`. | `[O]` @602206, @604037, @604418, @413715 |
| C10 | Windows = "daily cap" only | Window record: `{titleAr, startTime, endTime, cutoffTime, capacityOrders}` — `cutoffTime` is "آخر موعد لاستقبال الطلبات … بعد هذا الوقت لا تظهر الفترة للزبون في نفس اليوم" (last order-accept time; after it the window disappears for the customer that day), default `08:00`; `capacityOrders` default `25`; customer-side schedule via `GET /public/schedule?zoneId=${l}&days=7` selecting the first day having a `selectable` window; admin dispatch shows `booked/capacityOrders` with a fill-bar going leaf→brass→crate at 60 %/90 %. | `[O]` @606374, @607549, @409432, @534663, @603496 |
| C11 | `substitutionPolicy` options unknown | Enum `Us={NO_SUB, CONTACT_FIRST, BEST_EQUIVALENT}` (@512409 tail) — the order screen's policy state defaults `CONTACT_FIRST` (`[S,C]=useState('CONTACT_FIRST')` @409129, S feeds `substitutionPolicy` at @410864). The pending-order stash key is `souq.checkout.<userId>.<storeId>` (@408852); the client-side validator enforces shape (`idempotencyKey`, `zoneId|windowId|deliveryDate|addressLine|substitutionPolicy` all strings, `totalCents` safe integer, `items[]` with positive quantities) before resubmission — corrupt stash → `تعذر قراءة الطلب المحفوظ. راجع طلباتك قبل إنشاء طلب جديد.` @253450. | `[O]` @409129, @408852, @410864, @253450, @512409 |
| C12 | Customer delivery-fail flow | Fail UI title `تعذّر التسليم`, reason from `Ks`, optional note, POST `/driver/delivery/fail` with `queueAs:'تعذر تسليم ${shortId}'` and geolocation spread; success copy "أعِد الطرد للمحل من شاشة الوردية" (return the parcel to the shop from the shift screen). | `[O]` @522873 |

**Offset convention note.** The earlier study cited byte offsets; this file cites char offsets measured with `String.IndexOf`. Same strings, same anchors, ±small delta.

---

## 1. Artifact identity & method

| Field | Value | Anchor |
|---|---|---|
| Package / version | `ps.souqtulkarm.app` 1.0.2 (versionCode 3), targetSdk 36, minSdk 24, RTL default (`<html lang="ar" dir="rtl">`) | prior study §1–3, verified `assets/public/index.html` |
| Engine | Vite + React SPA in Capacitor 7 shell; `assets/public/assets/index-Bh9QEjtC.js` = **the whole product**; `assets/public/assets/jsQR-DkYl7kvi.js` = QR decoder; `sw.js` = Web Push SW | `[O]` ZIP listing |
| Backend | `https://souq-production-52a0.up.railway.app/api` (constant `ue`, trailing slash stripped) | `[O]` @198750 |
| Native surface | 4 classes; `SouqNativePlugin` exposes `getSession`, `key(): SecretKey`, `connected`, billing bridge. Token on Android comes from the native layer (`le.getSession()` → `{token}`); `souq.token` in `localStorage` is removed on logout (per prior study) | `[O]` @198750 (`le=w(\`SouqNative\`)`, `_e()`), prior study §3 |
| Storage keys | `souq.token` · `souq.outbox` · `souq.cart` · `souq.checkout.<userId>.<storeId>` · `souq.theme` · `souq.shipping-request` · `souq.tip` · `souq.shop-chat-draft` · `souq.message-draft` | `[O]` @198750, @410864, @253450; full-file regex census |
| Font note | `index.html` comment claims Alexandria headlines + IBM Plex Sans Arabic + Plex Mono for codes — "shared with Wind" per the shipped comment (observation about the artifact, not an instruction) | `[O]`, prior study §3 |
| WhatsApp | No `whatsapp:` / `wa.me` / `intent:` substring anywhere in the bundle (re-searched this pass) | `[O]` negative result |

---

## 2. FEATURE 1 — Address model: `zoneId + addressLine + landmark + label + isDefault` (the fee-computable pattern)

### (1) Exact observed mechanism

Souq Tulkarm splits the address into **one structured, required choice** (the delivery zone — which alone determines fee, minimum order, and deliverability) and **free text** (the human address + landmark). There is no street number, building, floor, or postcode anywhere in the form.

- Saved-address form posts `k.post('/addresses', {...i, isDefault:o})` where `i = {label, zoneId, addressLine, landmark}`; the form requires `i.zoneId` truthy **and** `i.addressLine.trim().length >= 5` (button `disabled` logic). Reset after save: `{label:'', zoneId:'', addressLine:'', landmark:''}`.
- Order payload (`POST /orders`) carries `zoneId, windowId, deliveryDate, addressLine, landmark?, notes?, substitutionPolicy, saveAddressLabel?, totalCents, items`.
- The zone picker is fed by `GET /public/zones`; each zone arrives as `{id, nameAr, deliveryFeeCents, minOrderCents, activeDays}`. The order screen computes `oe = zones.find(z=>z.id===l)`, `se = oe?.deliveryFeeCents ?? 0`, `ce = subtotalCents + se`, and blocks submission when `oe && subtotalCents < oe.minOrderCents`.
- The component the customer actually feels: the zone dropdown hint renders **"أجرة التوصيل {fee} — الحد الأدنى للطلب {min}"** (delivery fee — minimum order) or, when no zone is picked, **"نوصل داخل طولكرم فقط في هذه المرحلة."** (we only deliver inside Tulkarm at this stage). The zone name is rendered as `zoneNameAr` next to saved addresses.
- Validation is minimal client-side; the zone list itself is server-authoritative (the client cannot invent a fee — it can only read `deliveryFeeCents` from `/public/zones` and add it).

### (2) Anchors

`[O]` `POST /addresses` payload + disabled logic @482866; order payload @410864/@410829; order-time zone math @410019; zone hint copy @413715; zone-name rendering @477693/@466199 (`e.zoneNameAr`); `GET /public/zones` @409129/@473370/@602206; admin zone create `POST /admin/zones` with `activeDays` @604418; zone admin form default fee 5.00 / min 30.00 @604037.

Directly quoted fragments: `nameAr`/`deliveryFeeCents`/`minOrderCents`/`activeDays` (zone record); `i.zoneId||i.addressLine.trim().length<5` (gate); `e.subtotalCents<oe.minOrderCents` (min-order block).

### (3) "Done like Souq" in Wind's own code

Wind's current bound is the src/model.ts:185 placeholder: `SERVICE_KM = 20` crow-flies from a served city centre, `servedCity(point)` picks the nearest city if within 20 km, and `distanceKm` applies a 1.3 road factor. There is **no zone table, no fee, no min-order anywhere in the booking path**; fare comes from `parcelFare()`/`quote()` on flat settings (`s.parcelPrice`, …). To match Souq:

1. **Data:** new table `zones(id text pk, name_ar text, delivery_fee_minor integer, min_order_minor integer, active_days int[], active bool)` — Wind money is already integer minor units ILS (`server/domain/money.ts` invariant: "never serialize a rounded/overflowed balance"; `ledger.ts` ILS journal). Do **not** add a second currency/units path.
2. **API:** `GET /api/public/zones` → `[{id,nameAr,deliveryFeeCents,minOrderCents,activeDays}]`; booking screen loads it exactly where src/model.ts:185's `servedCity()` is called today. Keep `isCity`/`nearestCity` for city selection; zone becomes an additional required structured pick *within* the served area.
3. **Types:** `Order` (src/model.ts:129) gains `zoneId: string | null`, `deliveryWindowId: string | null`; `Address` gains `label: string | null`, `isDefault: boolean`. src/model.ts never carries the fee — compute `deliveryFeeMinor` server-side from the zone at quote time (same trick Souq uses by reading the zone, never trusting a client-sent fee) and persist it on the order for the cash ledger to reference.
4. **UI:** booking screen shows the zone select with the hint pattern ("Delivery fee X — minimum order Y", fee formatted from minor units), and disables submission under min-order. Saved-addresses sheet lists zones by `nameAr`/`zoneNameAr` equivalent.
5. **Tests:** one assert that an order cannot be priced without a zone; one that subtotal < minOrderCents is rejected server-side (client-side gate is advisory only).

### (4) Failure modes

- **Fee drift:** the client adds `deliveryFeeCents` for display, but the *authoritative* total is re-derived server-side; if Wind's server takes the client's `totalCents` verbatim (Souq's pending-order stash *is* client-side (`souq.checkout.<userId>.<storeId>` @408852) and revalidated @253450), a stale zone fee leaks into the ledger. Mitigation: server recomputes from `zoneId`; client stash validated on resume (Souq does both — worth copying verbatim).
- **Zone/window mismatch:** a zone marked active on Monday in `activeDays` but window caps full → customer stranded. Souq surfaces "windows full" client-side rather than silently failing; Wind needs the same empty-schedule state.
- **Address ≥ 5 chars** is a weak proxy for real deliverability; the landmark is optional, so bad addresses still pass. Failure shows up at the door (`WRONG_ADDRESS` / `ACCESS_BLOCKED` typed reasons — see §5) and on the cash ledger as an undelivered-but-cash-touched shift.
- **Zone rename/split:** `zoneId` is stable, `nameAr` is not — never reference zones by name in orders (Souq references `zoneId` everywhere; `zoneNameAr` is display-only). [I]
- **Multi-city:** Souq is single-city (Tulkarm); the `zoneId` pattern generalizes but Wind must decide zone∩city semantics before launch — [U] in their artifact (single tenant `storeId` scoped everything, see outbox scope tuple).

---

## 3. FEATURE 2 — Cash-only, integer cents, amount entered at the door with a variance reason

### (1) Exact observed mechanism

Money is integer cents everywhere; currency display is شيكل (shekel). At the door, the driver does not press "delivered" — they **type the cash actually collected**; the app computes the delta against `finalTotalCents ?? totalAmountCents` and forces a **typed variance reason** whenever delta ≠ 0.

Door-to-door flow in the driver's confirm screen (the component around @517556). The math, in identifiers: `E = T.finalTotalCents ?? T.totalAmountCents`; `ee = s === '' ? E : Math.round(Number(s) * 100)`; `te = ee - E`; `ne = te !== 0`. The mutation is `POST /driver/delivery/confirm` with body `{orderId, proofInput, amountCollectedCents: ee, discrepancyReason: ne ? l : undefined, ...Hs()}` and options `{idempotencyKey, queueAs: 'تسليم الطلب ' + T.shortId}` — i.e. collected-cash-in-cents, variance reason only when the delta is non-zero, plus the driver's geolocation fix. `proofInput` = the customer's delivery code/QR (see §6). `w` = pre-generated idempotency key. `Hs()` = geolocation (C4).

- The variance select options are exactly `Gs` (C1): `PARTIAL_PAYMENT · CUSTOMER_DID_NOT_PAY · APPROVED_DISCOUNT · RETURNED_ITEMS · INCORRECT_CASH · OTHER_ADMIN_REVIEW` (Arabic labels @516424). Note `APPROVED_DISCOUNT` — a *legitimate* reason the cash is light, distinct from cheating.
- The driver's shift screen lists every delivery with due vs collected (`المستحق {amountDueCents} · المستلم {amountCollectedCents}`) and renders the signed delta (`+N عن المطلوب`) per row when non-zero (@526918–527708). Any non-zero delta — including over-collection — is flagged, never silently absorbed.
- Customer-side order detail renders the same pair when `result==='SUCCESSFUL'` — due vs collected vs `discrepancyReason` — and shows `failureReason` in crate-ink when not (@467915).
- Display component `F` formats cents→shekel (`cr`/`mr` are the formatters throughout).

### (2) Anchors

`[O]` confirm payload + math @517556–517600; `Gs`/`Ks` maps @516424; order-detail due/collected/failure row @467915; fee line + finalTotalCents≠totalAmountCents conditional @466199; shift delivery list @526918–527708; `Hs()` definition @512409; delivery-fail UI @522873; cents→shekel formatters (`F`, `cr`, `mr`) throughout.

### (3) "Done like Souq" in Wind's own code

Wind already speaks integer minor units ILS (`server/domain/money.ts`, `cashOwed` uses BigInt with MAX_SAFE_INTEGER guard; `ledger.ts` journals in `debitMinor`/`creditMinor`). What Wind lacks is the **door-time collection entry** — today Wind's cash flow is *remittance-only* (driver owes commission; see SPEC-cash-settlement.md): there is no captured `amountCollected` per delivery, no variance reason, no door-side confirmation. To match Souq:

1. **Schema:** `cash_entries` gains a per-delivery capture — either `kind='collection'` rows written at delivery confirm, or a columns-on-order approach (`amount_due_minor`, `amount_collected_minor`, `variance_reason text null`, `variance_note text null`). Given Wind's ledger is already double-entry + `business_ref`-idempotent (`ledger.ts postJournal` replays on same key, 409 on same key/different body), the clean cut is: **collection posts a balanced journal** (debit driver-cash account, credit order-revenue/fees clearing) at confirm time; variance reason rides `Journal.reason` (already exists; length cap [U]) or a typed `kind`.
2. **Typed variance reasons:** new CHECK-constrained column or enum `cash_variance_reason ∈ (PARTIAL_PAYMENT, CUSTOMER_DID_NOT_PAY, APPROVED_DISCOUNT, RETURNED_ITEMS, INCORRECT_CASH, OTHER_ADMIN_REVIEW)` — deliberately *not* free text, because Wind's dispute flow (SPEC-dispute-credit.md) and cash-ops `resolve` path want to group them. Mirror `Gs`, but keep Arabic labels in delivery-strings table.
3. **Client:** delivery-confirm screen = amount field prefilled with the order total (Wind's Order carries `price`; parcels never change it, so prefill `price*100`), delta computed client-side, reason required iff delta≠0, mutation carries `requestId` (Wind's `newRequestId()` + server `requestId` dedupe in `server/main.ts` order tables — the header-based `Idempotency-Key` Souq uses is the PWA variant of the same idea).
4. **UI copy:** show `due / collected / variance (signed)` in red in both driver shift view and customer order view, exactly as Souq does (@467915, @527708).
5. **Server authority:** server re-derives `delta` from stored `price` (Wind's `parcelFare` output is integer shekels; ×100 for minor units) — never trust client delta.

### (4) Failure modes

- **Driver under-reports collection.** Souq's mitigation is structural: the delta + forced typed reason at confirm, plus the append-only ledger (§4) where nothing is editable afterwards, plus shift-level visibility. Residual risk: a driver and a complicit customer just split the difference off-app — no app can fix that; the ledger at least makes it *attributable*.
- **`Math.round(Number(s)*100)`** — float parse of user input; `1.005`-class errors land in cents. Souq accepts this (round-half-even-ish via IEEE); Wind should parse with a string-to-minor-units helper, not `Number*100`.
- **finalTotal vs totalAmount ambiguity.** Souq: final = what shop computed after packing; falls back to `totalAmountCents` (order-time). If a final total is ever missing (parcels with no packing station), the door math silently uses the order-time total — fine for Wind (parcels), but if Wind ever ships variable-weight goods, the same ambiguity returns. [I]
- **Over-collection.** Forced through the same gate — `te !== 0` catches ±, so entering *more* than due also requires a typed reason. Over-collection is thus never silent either; it just has no cap. [O] verified by the `te!==0` predicate.
- **Offline confirm + variance reason:** queued via outbox with `queueAs` label (§9) — the reason text is captured at door time, so no 2G loss of the variance; the risk is *queue-then-crash* before flush — mitigated by the queue copy "أبقِ الصفحة مفتوحة" (keep the page open) in Souq's own error string.
- **`APPROVED_DISCOUNT` without an approval link.** Souq's `APPROVAL_ACCEPTED/REJECTED` audit kinds exist (@583825) but the door UI doesn't visibly require a linked approval when `APPROVED_DISCOUNT` is picked. [I] gap — Wind should require the approval id for that reason or ban the reason at the door.

---

## 4. FEATURE 3 — Append-only cash ledger: handover → admin count → settle (+ dispute)

### (1) Exact observed mechanism

The cash lifecycle is **driver handover → admin physical count → settlement entry**, and the ledger is **correction-by-new-entry only**: UI copy states outright that entries are never edited or deleted, and any correction is a new named entry with a reason.

Driver side (`/driver/cash/handover`, @528322–528365):
- Copy: `لا تستطيع تعديل أي مبلغ بعد تسجيله، ولا تحديد النقدية كـ«مستلمة» — العدّ والإغلاق من صلاحية الإدارة وحدها.` ("you cannot edit any amount once registered, nor mark cash as 'received' — counting and closing is admin-only").
- Payload: `{shiftId, handoverAmountCents: Math.round(Number(i||0)*100), notes: o}`, `{idempotencyKey: Fe(), queueAs: 'تسليم نقدية الوردية'}` ("handover of the shift's cash").
- Shift states: shift becomes `PENDING_SETTLEMENT` after handover; driver UI (`Ls`/route) shows the shift cash view (`نقدية الوردية`, started at `mr(u.shift.startTime)`), f = `u.shift.status==='PENDING_SETTLEMENT'` toggles the badge (@524954). While pending, the job board (`Rs`) is replaced by a settlement-pending screen and **scan-to-start is disabled** (`onScan:()=>n('VEHICLE')` routes to a different surface) — you cannot run a second shift with uncounted cash. [O] @504914.
- Entries listed as `سجل التسليمات في هذه الوردية` ("log of deliveries in this shift") with due/collected/delta per row.

Admin side (`/admin/cash/settle`, @567370; adjust @569150; pending list @563311):
- Screen title `عدّ النقدية وإقفال الوردية` ("count the cash and close the shift"); subtitle `العدّ الفيزيائي والإقفال من صلاحيتك وحدك.` ("physical count and closing are your authority alone").
- Payload: `{shiftId, countedAmountCents: Math.round(Number(i||0)*100), resolutionNotes: o || undefined}` → response `status==='CLOSED'` closes the dialog, else `info`.
- Copy: `القيود لا تُعدَّل ولا تُحذف. أي تصحيح يُسجَّل كقيد تسوية جديد باسمك وبسببه.` ("entries are not edited and not deleted; any correction is recorded as a new settlement entry in your name and with your reason").
- `POST /admin/cash/adjust {shiftId, amountCents, reason}` — the corrective "قيد تسوية" (settlement entry) itself requires a **reason** (placeholder: "مثال: نقص 20 شيكل، السائق سيسددها غداً من راتبه بموافقته" — "example: 20 ₪ short, the driver will pay tomorrow from his salary with his consent") and `f.trim().length >= 3`.
- `/admin/cash` lists `PENDING_SETTLEMENT` shifts; `/admin/audit?limit=60` is the global audit; `GET /admin/reports?from=&to=` for period reports. `ledger…`-adjacent copy: `تفاصيل الطلبات والمبالغ النقدية المستلمة: سجل محاسبي مطلوب قانونياً.` ("order details and cash received: a legally required accounting record"); `الإدارة ترى العمليات والسجلات المالية، ولا تستطيع حذف أي سجل عهدة أو نقد — التصحيح يكون بقيد جديد.` ("admin sees operations and financial records, cannot delete any custody/cash record — correction is a new entry").
- Admin **pulse** surfaces `CASH_VARIANCE` ("وردية بانتظار عدّ النقدية" — shift awaiting cash count) routing to `/admin/cash`, alongside `STALE_LOCATION → /admin/fleet`, `AWAITING_CUSTOMER → /admin/orders`, `DELIVERY_FAILED → /admin/orders`.
- Policy knob: `cashHandoverPolicy: PER_ROUTE|PER_SHIFT|END_OF_DAY` (C8) — explicitly labelled operational, not accounting.

Dispute path: the artifact's dispute *mechanism* is (a) typed variance reasons at the door (§3), (b) `DELIVERY_PROOF_EXCEPTION` audit kind (§6), (c) admin-only settle with `resolutionNotes`, (d) `CASH_ADJUSTED` audit kind for the corrective entry, (e) `APPROVAL_REQUESTED/ACCEPTED/REJECTED` kinds. There is **no in-app "driver disputes admin's count" button** visible; the driver protection is that only admin can mark cash received/settled at all, and every adjustment is named and reasoned. [I]

### (2) Anchors

`[O]` handover payload + admin-only copy @528322–528365; settle payload + new-entry copy @567370; adjust payload + reason floor @569150; pending-settlement admin list @563311; driver shift cash badge @524954; audit kinds `HANDOVER_SUBMITTED, SHIFT_SETTLED, CASH_ADJUSTED, SHIFT_FORCE_CLOSED, DELIVERY_PROOF_EXCEPTION, APPROVAL_ACCEPTED/REJECTED` @583533–583870; pulse routes `CASH_VARIANCE → /admin/cash` @529620–529764; `cashHandoverPolicy` @599562–599926.

### (3) "Done like Souq" in Wind's own code

Wind is **already closer to this than to any other competitor pattern**: SPEC-cash-settlement.md §1–4 mandates "Ledger rows are never edited or deleted; corrections are new rows; only remittance status moves pending → confirmed|disputed, once, by that driver", "Two-person check: a remittance counts only after the driver confirms it in the app. The driver can instead dispute it", and numbered receipts `R-000123`. `server/domain/ledger.ts` implements append-only journals (`postJournal`, `reverses_journal_id` for reversals, `business_ref` idempotency → replay/409) and `server/domain/cash-ops.ts` implements `/api/admin/cash/pending` + `/api/admin/cash/:id/resolve {confirm|dispute}` with a `status='pending'` CAS and 500-char reason (`evidenceRef` optional, joined as `reason | evidence: ref`). So "done like Souq" is mostly **parity, not invention**:

1. **Add the per-delivery collection leg** (§3) — Souq's handover pools *shift* cash incl. fares; Wind's remittance today models only commission owed. Add `kind='collection'` journals at door confirm so the admin count has something concrete to count, not just commission math.
2. **Shift object:** Wind has no shift concept (closest: driver presence `driver-presence.ts`, `driver-presence-card.tsx`). Minimal table `driver_shifts(id, driver_id, vehicle_id, started_at, ended_at, status ∈ ACTIVE|PENDING_SETTLEMENT|SETTLED|FORCE_CLOSED, started_with_scan bool)` — Souq proves `PENDING_SETTLEMENT` blocks the next shift via the job-board gate (@504914); implement the same rule: no `ACTIVE` shift while one is pending settlement.
3. **Vehicle QR-as-shift-token:** Souq starts a shift by scanning the vehicle (`/driver/shift/start {vehicleScan}`); Wind's driver-app has no vehicle entity — model vehicles minimally or make shift start scan-free but admin-gated; do not copy the scan UX before a vehicle inventory exists. [I]
4. **Admin settle UI** mirrors cash-ops: list `PENDING_SETTLEMENT` shifts, count input (minor units), `resolutionNotes` required on variance, CAS on `status='PENDING_SETTLEMENT'` so double-tap/race moves exactly once (cash-ops already does this for remittances).
5. **Adjust flow** = `POST /api/admin/cash/adjust` with reason ≥ 5 chars (Wind's cash-ops uses ≥ 5; Souq uses ≥ 3 — pick ≥ 5, it's Wind's house rule) writing an append-only journal with `reverses_journal_id` optional, `actor_id` + reason mandatory — exactly what `ledger.ts postJournal` supports today.
6. **Audit feed:** reuse `/admin/audit` analogue → Wind has `server/domain/ops.ts` staff-action logging; add kinds `HANDOVER_SUBMITTED, SHIFT_SETTLED, CASH_ADJUSTED, SHIFT_FORCE_CLOSED, CUSTODY_TRANSFERRED, DELIVERY_PROOF_EXCEPTION`.
7. **"Legally required accounting record" framing:** Wind's SPEC already notes earnings are not evidence of settlement; cite the same framing for ops/legal review.

### (4) Failure modes

- **Two-person check gap.** Wind has driver-confirm on remittances; Souq has admin-count on shift cash with *no driver confirmation of the admin's count* — the shift just settles. Driver disputes only via variance reasons captured at the door. A miscount is silently absorbed into `CASH_ADJUSTED`. If Wind wants a stronger two-person rule than both, SPEC already does it for remittances — keep it; do not regress to Souq's weaker one-sided count for the new collection leg.
- **`Math.round(Number(i||0)*100)`** on admin input — same float-parse caveat as §3; use minor-unit string parsing.
- **Handover while empty shift:** handover of 0 with no deliveries is allowed client-side (no min check) — creates noise entries; server should accept 0 but flag/sort it. [I]
- **Force-close (`SHIFT_FORCE_CLOSED`)** exists as an audit kind — i.e. admins can close abandoned shifts out-of-band; every such exit path must mint a `SHIFT_FORCE_CLOSED` entry or the ledger silently diverges from reality. [O] kind exists @583533; no UI anchor found → [U] how often used.
- **Enforcement is UI-copy-deep.** "Entries are not edited or deleted" is enforced by the API shape (no edit/delete endpoints for cash found in the bundle — `GET /admin/cash`, `POST /admin/cash/settle`, `POST /admin/cash/adjust`, handover only) + `business_ref` idempotency on the server (per `ledger.ts` pattern) — but the *server* module wasn't observable. [U] server-side guarantee strength.
- **Dispute → resolve → re-settle loop:** cash-ops CAS means a second decide → `409 already_decided`. Good. But nothing prevents *repeated* new remittances for the same physical cash (a "fix" loop); that's an ops policy, not a code gate. [I]

---

## 5. FEATURE 4 — Order state machine: 10-status enum on a 5-stop rail, plus typed variance/failure axes

### (1) Exact observed mechanism

There is no single FSM in the client — the client ships a **status → label/tone map** (`gr=`), a **progress ladder** (`os=`), and renders states; transitions are server-owned. What is shippable and exactly enumerable from the artifact:

**`gr=` (customer-facing order status; staffLabel where set; tone) [O] @233287–233340:**

| Token | Customer label | Staff label | Tone | Ladder step (`os=`) |
|---|---|---|---|---|
| `NEW` | طلب جديد | جديد | sky | 0 |
| `PACKING` | قيد التجهيز | — | brass | 0 |
| `AWAITING_DECISION` | بانتظار ردك | بانتظار الزبون | crate | 0 |
| `PACKED_READY` | جاهز للتوصيل | جاهز | leaf | 1 |
| `IN_CUSTODY` | مع السائق | — | sky | 2 |
| `DELIVERED` | تم التسليم | — | leaf | 3 |
| `DELIVERY_FAILED` | تعذر التسليم | — | crate | 2 |
| `RETURNED` | أُعيد للمحل | مُرتجع | crate | 1 |
| `CASH_SETTLED` | مغلق ومسوّى | مسوّى | neutral | 4 |
| `CANCELLED` | ملغي | — | neutral | 0 |

Progress rail keys: `PACKING · CUSTODY · DOOR · CASH` (@456350; `PACKED→CUSTODY→DOOR→CASH` with icons/labels `تعبئة ووسم` / `عهدة السائق` / `التسليم للباب` / `تسوية النقد`).

**Adjacent machines (not order statuses, but the same bundle):**
- **Shift status:** `ACTIVE`, `PENDING_SETTLEMENT` (@502846, @524954, @563311). (SETTLED/CLOSED/FORCE_CLOSED not seen as literals apart from the audit kinds `SHIFT_SETTLED`, `SHIFT_FORCE_CLOSED`.) [U] full shift enum.
- **Delivery result:** `e.result === 'SUCCESSFUL'` gates the due/collected block; else `failureReason` renders (@467915).
- **Custody event kinds** (`cs=`, chain events @456592): `PACKED · ACCEPTED_BY_DRIVER · TRANSFERRED_OUT · TRANSFERRED_IN · DELIVERED · RETURN_REQUESTED · RETURNED_TO_SHOP · VOIDED`.
- **Scan methods** (`ss=`): `QR_SCAN مسح QR · SHORT_CODE كود يدوي · ADMIN_ACTION إجراء إداري`.
- **Cash-variance reasons** `Gs` (6, @516424) and **delivery-failure reasons** `Ks` (6, @516424) — see C1/§3/§5.
- **Admin pulse exception kinds** `Xs` (kind → route): `STALE_LOCATION → /admin/fleet`, `AWAITING_CUSTOMER → /admin/orders`, `DELIVERY_FAILED → /admin/orders`, `CASH_VARIANCE → /admin/cash`; labels `Zs` (@529620–529764).
- **Payment/attempt-adjacent:** `ALREADY_IN_CUSTODY` (scan response, @503520), `PENDING_SETTLEMENT` (shift), `AWAITING_DECISION` (customer must act on a change request).
- Token census (this pass, `\b[A-Z][A-Z0-9_]{3,}\b`, bundle-wide): `IN_CUSTODY`×12, `QUEUED`×11, `PACKED_READY`×10, `AWAITING_DECISION`×8, `DELIVERY_FAILED`×7, `CASH_SETTLED`×5, `PENDING_SETTLEMENT`×4, `SUCCESSFUL`×3, plus QR-lib and billing tokens — i.e. "29+ statuses" = the census, not an enum. C2.

Terminal-ish states: `DELIVERED` (→ flows into cash axis `CASH_SETTLED`), `DELIVERY_FAILED`, `RETURNED`, `CANCELLED`. `DELIVERED` and `CASH_SETTLED` are separate axes: an order can be `DELIVERED` but not `CASH_SETTLED` — the cash axis closes at shift settlement, not at the door.

### (2) Anchors

`[O]` `gr=` @233287–233340; `os=` + rail @456350–456390 (rail `key`s `PACKING/CUSTODY/DOOR/CASH`, icons, labels); `vr`/`_r` labelers @233340; admin pulse `Xs/Zs` @529620–529764; token census this pass (`token-census.txt`); `SUCCESSFUL` gate @467915; `ALREADY_IN_CUSTODY` info-toast @503520.

### (3) "Done like Souq" in Wind's own code

Wind's order status exists on type level (`Order.status: OrderStatus` — src/model.ts:138) with values like `in_transit`, `on_hold`, `returned`, `completed` (inferred from SPEC-delivery-exceptions.md and SPEC-cash-settlement.md; full enum [U] without reading wire-contracts). The gap vs Souq:

1. **Adopt the two-axis split explicitly.** Delivery axis (`PACKING…DELIVERED/DELIVERY_FAILED/RETURNED`) × cash axis (`…→CASH_SETTLED` at shift settle). Wind's SPEC already approximates this (`on_hold` for delivery failure; `remittance pending→confirmed|disputed` for cash). Make the axes separate columns/statuses, never one overloaded `status`.
2. **Adopt the rail for UX** (Packing→Custody→At your door→Cash settled) — a 4-stop timeline is dramatically easier to render than 10 states, and Souq's `os=` ladder proves it ships.
3. **Typed failure reasons** map almost 1:1 to Wind's **on_hold** flow (SPEC-delivery-exceptions.md): `CUSTOMER_UNREACHABLE/REFUSED/WRONG_ADDRESS/ACCESS_BLOCKED/CUSTOMER_RESCHEDULED/OTHER` for the door, `INCORRECT_CASH/PARTIAL_PAYMENT/CUSTOMER_DID_NOT_PAY` belong to the *cash* axis (Variance), exactly as Souq split them (C1). Wind's current `exceptionReason: ExceptionReason | null` on Order (src/model.ts:139) should become this typed pair, not one flat list.
4. **`DELIVERY_FAILED` does not auto-return.** Souq's flow: fail → toast "أعِد الطرد للمحل من شاشة الوردية" → parcel returns via `RETURN_REQUESTED → RETURNED_TO_SHOP` custody events → `RETURNED` status → admin counts. Wind's spec has reattempt vs return-to-sender decision by admin with written reason ≥ 5 chars — strictly better; keep it, and add Souq's door-time typed reason as the *input* to that decision.
5. **Server-side transition authority** + client `gr=`-style display maps (label/staffLabel/tone) — Wind should ship exactly one client map file, server owns transitions.

### (4) Failure modes

- **Status congestion / enum drift.** Souq mixes 10 order statuses + 8 custody events + audit kinds + shift states + cash reasons in one mental model; the client needed `vr()` (tone) and `_r(e,t)` (customer vs staff label) to avoid leaking staff language to customers. Wind should enforce role-scoped label maps from day one.
- **English/Arabic label split (`staffLabel`) missing** for `IN_CUSTODY` — driver UI shows raw for staff. Minor.
- **`DELIVERY_FAILED` reused in admin pulse** (`Zs DELIVERY_FAILED: 'تسليم متعذر بحاجة قرار'` — needs admin decision) vs `gr` customer label (`تعذر التسليم`) — same token, two meanings, context disambiguates. Confusing but shipped.
- **No timeouts or SLA transitions** visible in the bundle — an order stuck in `AWAITING_DECISION` forever has no auto-revert. [U] server cron behavior.
- **Unmapped status → raw token renders** (`return n ? … : e` falls back to the token itself) — a server-added status crashes nothing but renders `CHECKOUT_…`-class gibberish to users. Loud-fail via error boundary would be better.
- **Ladder position for `DELIVERY_FAILED` = 2** (same as `IN_CUSTODY`) and `RETURNED` = 1 — the rail deliberately does not regress; a failed delivery sits "at the door" step forever until admin acts. Acceptable but must be explained in Wind's support macros.

---

## 6. FEATURE 5 — Delivery proof: customer-held code/QR secret, lockout, audited admin reset

### (1) Exact observed mechanism

Proof-of-delivery is a **customer-held secret** with zero PII inside it, required to close the delivery, with a **counter lockout** and an **audited admin escape hatch**.

- Order carries `deliveryCode` (short code, entered manually) and `deliveryQrToken` (opaque token, rendered as QR via the bundled `is=<QR>` component at size 200, level M). Displayed in a modal titled `رمز تسليم الطلب` ("the order's delivery code") with the digital code beneath (`أو رمز التسليم الرقمي`, "or the digital delivery code").
- Display gate (both render sites): `m.deliveryCode && ['PACKED_READY','IN_CUSTODY'].includes(m.status)` — **the code is only shown while the parcel is staged at the shop or out for delivery**, never earlier/later (@463199, @463843).
- Copy states the model verbatim:
  - `أعطِ هذا الكود للسائق عند الاستلام، أو اعرض له رمز الـ QR. بدونه لا يستطيع إغلاق التسليم.` — "give this code to the driver on delivery, or show the QR; **without it he cannot close the delivery.**"
  - `هذا الرمز يخصك أنت وحدك ولا يحتوي على اسمك أو عنوانك أو مبلغ الطلب. لا تشاركه إلا عند التسليم.` — "this code is yours alone, contains no name/address/order amount; share it only at delivery."
- Driver side: the confirm screen (`qs`-family component around @517556) takes the code as `proofInput` via a scan modal with a manual-entry mode; the delivery-**fail** screen shows the same modal family (`Is`) with `manualLabel:'أو أدخل كود التسليم'`, `manualPlaceholder:'4 أرقام'` ("4 digits") @522873. The QR scanning uses the bundled `jsQR` decoder. [O for the fail screen; the confirm screen's exact manual-entry strings [U] not re-dumped this pass]
- Failure → `PROOF_LOCKED`: the confirm `catch` checks `n.code === 'PROOF_LOCKED'` and flips a local `m(!0)` lockout state (renders the locked panel) — **server locks after N bad attempts; client only obeys** (@517775). The error is *not* shown as a toast; it swaps the UI into a locked state.
- Admin escape hatch (@548381): modal `إعادة فتح محاولات الكود` ("reopen code attempts"), required reason textarea (`maxLength:500`, `trim().length<5` gated), POST `/admin/orders/${e}/proof-reset {reason:v}`; response toast `أُعيد فتح محاولات الكود. ما زال إثبات التسليم مطلوباً.` — "code attempts reopened; **delivery proof is still required**" (i.e. reset ≠ bypass — the driver still needs a valid code/QR, just gets fresh attempts). Pre-modal explainer copy at @548350: "اعادة فتح المحاولات بعد مراجعة المشكلة مع الزبون. هذا الإجراء لا يؤكد تسليم الطرد." ("reopen attempts after reviewing the problem with the customer; this action does **not** confirm the parcel's delivery").
- The lockout and opening are audit-visible: `DELIVERY_PROOF_EXCEPTION: 'استثناء إثبات تسليم'` is an audit kind (@583825).
- Code entropy: the shared scan modal family hints `4 أرقام` (4 digits) for manual entry ⇒ manual codes are likely **4-digit numeric**; the confirm screen's own placeholder [U] not re-dumped. QR token entropy unknown but `jsQR` level-M, size 200 — opaque. [O manual-scan modal; U confirm-screen placeholder / QR entropy].

### (2) Anchors

`[O]` QR modal + digital code + privacy copy @468555–468734; display gates `IN_CUSTODY`/`PACKED_READY` @463199/@463843; confirm payload `proofInput` @517556–517600; `PROOF_LOCKED` catch @517775; proof-reset modal + toast @548381; audit kind @583825; scan modal `4 أرقام` @522873; fail UI (alternative when no proof possible) @522873; customer copy `رقم التسليم بحوزتك أنت` / `أعطه للسائق عند الاستلام فقط` (prior study quotes, consistent with this pass's fragments).

### (3) "Done like Souq" in Wind's own code

Wind already ships the same **shape** in SPEC-delivery-exceptions.md §3: "the delivery is blocked after **5 failed attempts**; admin proof-reset works here too" and return codes "shown only to the order owner". What to add from Souq's artifact:

1. **Zero-PII guarantee, explicit:** `delivery_code` (4-digit, order-owner-visible) and `delivery_qr_token` (opaque, ≥128 bits) carry **no name/address/amount** — document as a security property; Wind's tracking link must likewise not leak it (Wind already keeps chat off the tracking link — SPEC-in-app-chat.md §5).
2. **Display window gate:** show the code only between "packed/ready" and "in custody of driver" equivalents — Wind parcel equivalent: after assignment, before `completed`. Never show earlier (an untrusted courier could photograph it), never later (a stale code read by a passer-by confirms nothing, but why keep it valid).
3. **Lockout + reset symmetry:** keep the 5-attempt lockout; implement proof-reset as `POST /api/admin/orders/:id/proof-reset {reason ≥ 5 chars}` writing an audit entry `DELIVERY_PROOF_EXCEPTION`-analogue; **explicitly copy the "reset does not confirm delivery" semantics** — resets attempts, not the proof requirement.
4. **Driver sees different data than the code.** Souq: "السائق يرى الطلبات المسندة إليه … ولا يرى كود تسليم الزبون" — the driver never sees the *customer's* code; the code flows customer→driver verbally/QR scan. Wind: code must be input-only on the driver screen, never rendered.
5. **Server-side attempt counter** per order, atomic increment, `PROOF_LOCKED` at threshold, proof-reset zeroes it with audit. Wind's SPEC's "5-attempt lockout" is already this; the artifact just confirms it ships in production shape.

### (4) Failure modes

- **4 digits = 10,000 codes; 5 attempts is the only thing standing between a driver and enumeration.** If the lockout counter is per-order and the driver can just… try a different delivery attempt flow (fail → retry path), enumeration re-opens. Mitigation: counter is order-scoped and survives reopen? *No* — admin reset *zeroes* it by design. The real mitigation is that reset requires a reason and writes audit. [I]
- **Offline confirm with a wrong code:** confirm is `queueAs`-queued when offline; `PROOF_LOCKED` surfaces only after flush — driver wastes a door visit and only learns post-hoc. Not fixable on 2G; show "pending sync" state. [I]
- **Code shown to driver via QR during scan:** Souq's driver confirm accepts `proofInput` (typed or scanned) — scan bypasses nothing (the QR *is* the secret), but it means the customer must unlock the app at the door; a phone-number call-out fallback is absent — if the customer's phone is dead, only admin proof-reset unblocks. Wind should add a **call-verify + admin attestation** path for dead-phone deliveries (SPEC's exception flow covers this).
- **QR screenshot sharing:** a customer can pre-share the screenshot; the secret property is "anyone with it can close the delivery" — that's the intended capability grant, but it is indistinguishable from theft after the fact except via the audit trail (scan method `QR_SCAN` vs `SHORT_CODE` vs `ADMIN_ACTION` on the chain — §8 — which *is* a useful forensic signal).
- **Reset abuse by admins:** reset is human-gated by a reason ≥ 5 chars but there's no second-admin approval; repeated resets on one order should page a supervisor — Wind's ops console should threshold this (`>2 resets/order/day`). [I]
- **`proofInput` not visible-echoed:** fine, but no evidence the client zeroes it from memory; treat as sensitive in the pending-order stash too (Souq stashes the *order*, not the proof — good).

---

## 7. FEATURE 6 — Delivery windows per zone+day with daily cap; zone fees and min-order

### (1) Exact observed mechanism

Delivery capacity is a first-class, server-enforced concept: **zones have `activeDays`; admin creates per-zone named windows; each window has a cutoff time and a per-day order cap; the customer sees only deliverable zone+day combos; full windows are simply not selectable.**

- Public schedule: `GET /public/schedule?zoneId=${l}&days=7` fires when a zone is picked (@409432); result drives `windows.some(e=>e.selectable)` per date; the order screen auto-selects the first day with a selectable window and blocks submission when none (`le = ie.length>0 && !ie.some(d=>d.windows.some(e=>e.selectable))`).
- Copy: `امتلاء فترات التوصيل` ("delivery windows full"), `أقصى عدد طلبات تقبلها هذه الفترة في اليوم الواحد.` ("max orders this window accepts per day"), `الزبون لا يرى فترات لهذه المنطقة في الأيام غير المحددة.` ("the customer does not see windows for this zone on unspecified days"), `بعد هذا الوقت لا تظهر الفترة للزبون في نفس اليوم` ("after this time the window disappears for the customer on the same day").
- Admin window record: `{titleAr, startTime, endTime, cutoffTime, capacityOrders}`; list renders `السعة {capacityOrders} طلب` and `إغلاق الطلب {cutoffTime}`; defaults `09:00–12:00`, cutoff `08:00`, cap `25`; `POST /admin/windows {windowId?, ...}` (@606374, @607549, @603496).
- Admin dispatch dashboard shows per window `booked/capacityOrders` with a fill bar (leaf < 60 % ≤ brass < 90 % ≤ crate) — capacity *pressure* is a dispatch signal, not just a booking gate (@534663).
- Zones carry `activeDays` (weekday indices; 7 → `كل الأيام` "every day"); window creation/update is per-zone (`/admin/zones`, `/admin/windows`); vehicle fleet (`/admin/vehicles` with `capacityBoxes`, `plateNumber`, `active`, QR rotate) is the physical capacity behind the caps.
- The order form stores `windowId` + `deliveryDate`; `/public/windows` also exists for flat lists.

### (2) Anchors

`[O]` schedule call + auto-select logic @409432–409480; zone math @410019; full-windows copy (string verified present); window admin form + defaults @606374–607549; zone admin form `activeDays` @602206–604418; dispatch fill bar @534663–534720; `capacityBoxes` vehicle cap @596983; `locationPingSeconds` + `maxStopsPerVehicle` fleet settings @599926. `[I]` The "windows full" copy was verified present in-bundle; its exact render site not pinned (irrelevant to mechanics).

### (3) "Done like Souq" in Wind's own code

1. **Schema:** `delivery_windows(id, zone_id fk, title text, start_time, end_time, cutoff_time, capacity_orders int, active bool)` + `zones.active_days int[]` (as §2). Order gains `window_id`, `delivery_date`.
2. **API:** `GET /api/public/schedule?zoneId&days=7` returning per-day windows with a server-computed `selectable` boolean (cap not full, cutoff not passed, weekday active). This "selectable" flag is the important design bit — capacity enforcement is in the *schedule read*, not only at write time; a race still exists at write (two customers grab the last slot simultaneously) → also enforce cap atomically at `POST /api/orders` (count orders per window per date inside the transaction; Wind's API already wraps writes in envelope transactions, see cash-ops caller comment).
3. **Booking UI:** zone → date rail (7 days) → window chips with "full" disabled state; auto-pick first selectable day (Souq's exact behavior); hard block when nothing selectable ("New delivery requests are currently unavailable" copy in Arabic + English).
4. **Dispatch pressure:** admin queue shows `booked/capacity` per window with the same 60/90 thresholds — Wind's dispatch already surfaces driver assignment; add window pressure to it.
5. **No backend magic in the client:** cap and cutoff are server truths; client mirrors them for UX only.

### (4) Failure modes

- **Read/write race on the last slot.** Souq's `selectable` flag does not appear to reserve; two clients can both see `selectable:true` and one loses at write → the loser needs a clean "window filled while you were checking out" error path. Wind must render that error, not a generic failure. [I]
- **Timezone:** windows are wall-clock (`09:00–12:00`) in local time; Palestine DST vs Asia/Hebron IANA handling lives server-side. A server in UTC without TZ-aware window evaluation will accept orders past cutoff half the year. Wind: store `timezone` on zone or hardcode `Asia/Hebron` evaluation like src/model.ts already hardcodes `Asia/Hebron` for night-hours (line ~232).
- **`capacityOrders` vs vehicle `capacityBoxes` double counting:** two cap systems that can contradict (25 orders cap, 1 vehicle × 12 boxes) — Souq ships both with no visible reconciliation. Wind should derive recommended `capacityOrders` from fleet capacity or document the mismatch as "order cap ≠ load cap". [I]
- **Cutoff semantics:** cutoff hides the window for *same-day* booking; no advance cutoff logic visible for tomorrow+. [U]
- **No surge/priority per window:** fine for a cash local market; Wind shouldn't bolt pricing onto capacity v1.
- **Stale schedule cache:** if Wind caches `/public/schedule`, a filled window may linger selectable; Souq's bundle shows no cache headers handling → flush on checkout attempt error instead (server rejects, client refreshes schedule). [I]

---

## 8. FEATURE 7 — Custody chain: first-class, per-parcel, queryable, with GPS at the door

### (1) Exact observed mechanism

Every parcel carries a **custody chain** — an append-only, human-readable event log answering "who carried the parcel and when" — rendered to both admins (`f = session.role==='admin'||'packer'` gating `GET /orders/${e}/custody-chain` @540563) and customers (@460478), with Arabic event labels and a progress-ladder visualization.

- Endpoint: `GET /orders/{id}/custody-chain`, consumed by two roles with the same component (`ls`/`Chain`) — customer order detail and admin order detail.
- Event kinds (`cs=`, @456592): `PACKED` `تم تجهيز الطرد ووسمه` · `ACCEPTED_BY_DRIVER` `استلم السائق الطرد` · `TRANSFERRED_OUT` `خرج من عهدة السائق` · `TRANSFERRED_IN` `دخل في عهدة سائق آخر` · `DELIVERED` `سُلّم للزبون` · `RETURN_REQUESTED` `بانتظار استلام المحل للطرد` · `RETURNED_TO_SHOP` `أُعيد إلى المحل` · `VOIDED` `أُلغي الملصق`.
- Scan methods (`ss=`): `QR_SCAN` `مسح QR` · `SHORT_CODE` `كود يدوي` · `ADMIN_ACTION` `إجراء إداري`.
- Route/method used for each scan (`custody-chain` source fields seen): scan events carry method + time; `ADMIN_ACTION` lets admins inject events (e.g. forced reassignment) without a physical scan.
- The chain is the **fraud/dispute forensic**: PACKED→ACCEPTED_BY_DRIVER timestamps expose packing-to-custody lag; TRANSFERRED_* pairs expose driver-to-driver hops; DELIVERED + method distinguishes QR vs manual vs admin.
- Driver mutations spread `Hs()` ({lat,lng}, 4 s timeout) into custody payloads — the door event carries a fix (C4).
- Label for empty chain: `سجل مسح الرموز واستلام العهدة والتسليم: لإثبات من كان يحمل الطرد ومتى.` ("log of QR scans, custody pickup and delivery: to prove who carried the parcel and when").
- "خروج من عهدة السائق" / "دخل في عهدة سائق آخر" phrasing is customer-facing (the customer sees who held their parcel without seeing names of other customers).

### (2) Anchors

`[O]` endpoint call sites @460478/@540563; event/scan enums @456592; chain component (`ls`) header @456630; GPS spread @512409; admin gating @540563; `DELIVERY_PROOF_EXCEPTION` as audit (§6); Arabic copy quoted above (verified verbatim this pass).

### (3) "Done like Souq" in Wind's own code

1. **Schema:** `custody_events(id, order_id fk, kind text check in (...8 kinds), method text check in ('QR_SCAN','SHORT_CODE','ADMIN_ACTION'), actor_id, actor_role, lat real, lng real, note text?, created_at)` — append-only, no update/delete routes, same posture as `ledger.ts` journals.
2. **API:** `GET /api/orders/:id/custody-chain` role-gated: order owner sees it, assigned driver sees own legs, admin sees all. (Souq gates by `admin||packer` for the *admin* view and separately for customer view; Wind: owner + admin.)
3. **Driver mutations:** stop just writing `status`; every accept/deliver/return writes a kind-typed event; delivery confirm writes `DELIVERED` + `{lat,lng}` best-effort.
4. **Vehicle scan → shift:** Souq's `VEHICLE` scan starts a shift; Wind may skip vehicle QR (§4) but should still bind `ACCEPTED_BY_DRIVER` to scan/QR of the parcel label where parcels carry codes (Wind has `handoverCode` on Order — reuse as the parcel label token, don't invent a second code system).
5. **Admin ACTION events** mandatory for force-reassign/force-close paths.

### (4) Failure modes

- **GPS precision at door:** 4 s timeout, low accuracy — many confirms will carry `{}`. Chain is valid without coords; treat lat/lng as hint, never as proof. Do not build "driver was at the door" claims on this.
- **`ADMIN_ACTION` forge risk:** admin can mint chain events; audit kind `ADMIN_ACTION` on the chain + global audit entry is the only control. Require reason on every ADMIN_ACTION (Souq doesn't visibly; Wind should). [I]
- **Chain gaps:** if driver loses the label and never scans, the chain jumps PACKED→DELIVERED (or stays empty while physical custody moved). The UI must render gaps honestly (missing ACCEPTED_BY_DRIVER + delivered-with-method=SHORT_CODE = "unverified handoff" badge), not interpolate.
- **Customer privacy:** chain shown to the customer exposes that *a* transfer happened (TRANSFERRED_OUT/IN) — acceptable (it's their parcel) but never show other customers' data (Souq states this rule for the driver; mirror it for the customer view of the chain).
- **Retention:** legally-required accounting framing applies to cash, less clearly to custody; decide retention with counsel before launch. [U]
- **VOIDED label:** voided parcels keep the chain row — correction-by-new-entry again, consistent with the ledger philosophy.

---

## 9. FEATURE 8 — Offline outbox: `souq.outbox`, idempotency key doubles as entry id, scoped replay

### (1) Exact observed mechanism

Every mutating call in the app passes `{idempotencyKey: Fe(), queueAs: '<human Arabic label>'}` as a third arg (or second for the queue helper). The HTTP helper:

1. Sets headers: `Content-Type: application/json` (when a body is present), `Idempotency-Key: <key>` where key = `n.idempotencyKey ?? (n.queueAs ? Fe() : undefined)` (`Fe` returns `crypto.randomUUID()`), `Authorization: Bearer <token>` (from the native bridge on Android, else none), `X-Actor-Scope: [userId, storeId, role]` JSON when signed in, `credentials: 'include'`, 20 s timeout (`AbortSignal.timeout(2e4)`).
2. **On network failure or explicit offline enqueue**: appends `{id: key, scope: actorScope, method, path, body, label: queueAs, queuedAt, attempts: 0}` to `souq.outbox` (localStorage JSON array) and throws `ye(0, 'حُفظ الإجراء على جهازك. بانتظار الاتصال.', 'QUEUED')` — callers treat `code==='QUEUED'` as info, not error, and typically `reload()`.
3. Before queueing, if an unscoped entry with the same id exists → `409 IDEMPOTENCY_CONFLICT` ("saved procedure has different data — review it before retrying") when body differs (C5).
4. **Replay** (@202157): trigger points — `online` event, `visibilitychange`→visible, session/store/role effect, explicit `flushNow`. Replay is **scope-filtered** (`scope === currentScope`); retries on `status===0 || 401 || code==='SESSION_CHANGED' || 429 || >=500` with `attempts+1`, **stops the whole flush** on the first such failure; all other 4xx → entry kept with `error: message`, reported in a failed list, flush continues. Replayed with the **entry's own id as `Idempotency-Key`**.
5. **Legacy unscoped** entries (`scope` missing) surface separately (`legacyOutbox`) and can be claimed into the current scope via `Oe()` (`{...t, scope: he}`) or discarded via `ke()`.
6. If `localStorage` write itself fails → throws `ye(0, 'تعذر حفظ الإجراء على الجهاز. أبقِ الصفحة مفتوحة وحاول مرة أخرى.', 'QUEUE_STORAGE')` — the app **refuses to silently drop the action** and tells the user to keep the page open.
7. Pending-order checkout stash `souq.checkout.<userId>.<storeId>` is a *separate* mechanism — the in-flight checkout (items, substitutionPolicy, `souq.cart` consumption) survives reload without server roundtrip; validator @253450 enforces shape (`idempotencyKey`, `zoneId|windowId|deliveryDate|addressLine|substitutionPolicy` all strings, `totalCents` safe integer, `items[]` with positive quantities) before any retry.
8. **Service worker** (`sw.js`) exists for Web Push; the outbox itself is **plain localStorage, not SW-backed** — a killed WebView loses in-flight JS state but not the outbox (written synchronously at enqueue). [O] no SW outbox code found.
9. Retry-storm failure UX: `تعذر الوصول للخادم، جارٍ إعادة المحاولة.` ("cannot reach the server, retrying").

### (2) Anchors

`[O]` storage keys + scope tuple @198750; helper headers + QUEUED throw @200105–200230; `Ce()/we()` (read/write outbox, QUEUE_STORAGE) @199490–199520; legacy split `Ee/De/Oe/ke` @199520–199600; replay loop @202157–202230; `Fe()` uuid @202157; flush triggers `online`/`visibilitychange`/scope-effect/`flushNow` @249339–250393; `QUEUED` caller pattern `code==='QUEUED'?'info':'error'` @503608–503642; checkout stash @408852/@410864/@253450.

### (3) "Done like Souq" in Wind's own code

Wind's 3G/2G reality makes this table stakes, not polish:

1. **Outbox module** (`src/offline-outbox.ts` or similar): same shape — `{id, scope, method, path, body, label, queuedAt, attempts, error?}`; scope = `[userId, storeId?…]` → Wind has no multi-store; use `[userId]`. Storage: AsyncStorage not localStorage (native) — keep JSON array, cap at ~50 entries.
2. **Idempotency end-to-end:** every mutation carries a client `requestId` (Wind already does this for orders/actions/messages/cash via `newRequestId()` + server dedupe tables in `server/main.ts`, 409-on-hash-mismatch; `ledger.ts` uses `business_ref`). Thread the **same** id through the immediate attempt and the outbox queue entry; replay reuses it — exactly Souq's double role for the key. Routes that don't take `requestId` today (location pings, tracking) are safe to skip; money/proof/custody routes are not.
3. **`queueAs` labels** in Arabic+English everywhere, surfaced in a "Pending actions (N)" settings/home row with per-item failure reasons — Souq's UX shows toast info + keeps working; Wind's UI should list them (`src/offline-summary.ts` + `offline-recovery.ts` exist — wire them).
4. **Scope-on-account-change:** if the signed-in user changes, unscoped/different-user pending actions must not replay as the new user — X-Actor-Scope analogue header, and clear-on-signout semantics.
5. **Retry policy:** 0/401/429/5xx retry-with-backoff-and-halt; other 4xx → per-entry error state, user-visible, never auto-discarded. Match Souq exactly here; it is correct.
6. **QUEUE_STORAGE path:** if AsyncStorage write fails, **block the mutation with a hard error** — never continue as if saved.
7. **Connectivity signals:** Wind has `driver-presence.ts`, `location-state.ts`; reuse `online`/`offline` + AppState (background→active) as flush triggers; Android WebView-free so `visibilitychange` ≈ AppState.

### (4) Failure modes

- **Duplicate delivery confirms:** replay sends stored key; server dedupes by `Idempotency-Key`. If Wind's server ignores the header, a 2G retry double-collects cash in the ledger. Non-negotiable: server dedupe on every keyed route.
- **`attempts` never surfaced to the user:** Souq increments but shows only generic "retrying"; a poison entry (e.g. 422) keeps retrying? No — non-retryable 4xx are marked `error`, kept but not retried; flush continues. OK. But there's no max-attempts circuit breaker for retryable ones → infinite 2G retries, battery drain, silent. Wind: cap (e.g. 25 attempts or 7 days, then park with error).
- **PII in the queue:** bodies (addresses, phone numbers, amounts) sit in AsyncStorage world-readable-ish; Souq's answer is "it's a delivery app, the data is already on the device" — acceptable; Wind should at-rest encrypt or at least exclude from backups (`allowBackup` decision — Shiply got this wrong, per PALESTINIAN-COMPETITORS-INDEX S6).
- **Scope tuple mismatch after store switch:** `souq.outbox` entries scoped to store A don't replay as store B; user sees "pending actions missing" confusion — Wind single-store sidesteps this; keep scope = userId only.
- **Checkout stash corruption:** validated before submit (@253450) — copy this exactly for Wind's pending-order recovery.
- **SW vs localStorage divergence:** none in Souq; Wind has native FCM + own state — no SW needed.
- **Hard crash between enqueue and UI update:** action queued, toast lost — user re-taps "confirm delivery" → second confirm with **different** idempotency key → door total double-counted unless server dedupes by order+active-proof. Server must dedupe *also* semantically ("active proof attempt for order X"), not only by key. [I]

---

## 10. FEATURE 9 — Driver side: shift, job board, scan intents

(Covered operationally under §7–§9; driver-side mechanics only, for completeness.) `GET /driver/route` (the day's route; prior-pass anchor), `GET /driver/ready-queue` (the parcels you may take **while shift ACTIVE**; prior-pass + this pass @502838), `/driver/peers` (prior-pass anchor; nearby drivers for transfers), scan intents route from one modal: `VEHICLE → /driver/shift/start {vehicleScan}`; `RETURN → set-state only`; `OFFER → pick peer, then /driver/custody/offer-transfer {scan,toDriverId}` (`queueAs:'عرض تحويل طرد'`); `TRANSFER → /driver/custody/transfer`; else `/driver/custody/scan`. All custody calls carry `{scan, ...Hs()}` and `idempotencyKey`. Vehicle QR rotate is admin-only (`POST /admin/vehicles/{id}/rotate-qr`, copy `تغيير رمز سيارة`) — the vehicle-as-shift-token is revocable. `PENDING_SETTLEMENT` disables the start-scan (C8). Peer transfers require both drivers in the fleet; `ALREADY_IN_CUSTODY` is an info-level idempotent response, not an error. [O] @502838–503600, @511143–511310, @596983–597300, @504914.

**Failure modes:** vehicle QR shared/photographed → anyone can start an attributed shift (scan is bearer); rotation is the only revocation → set rotation cadence; peers list leaks driver presence to all drivers (privacy: it's needed for transfers; don't widen it). [I]

---

## 11. FEATURE 10 — Chat: canned replies + moderation (built, not faked)

### (1) Exact observed mechanism

- API: `GET /chat/conversations` · `GET /chat/canned-replies` · `GET /chat/thread?customerId=…` · `POST /chat/send` (`{customerId, content}`; customer's own send uses `{content}` + `idempotencyKey: clientId` and a `sessionStorage` optimistic draft `souq.shop-chat-draft`-style) · `POST /chat/${id}/redact {reason}` · `GET/POST community/messages*` for the community surface (separate).
- Live updates via events bus (`Zr(['chat_message'], reload)`).
- Canned replies are **server-managed** (not client constants) — the shop side renders a quick-reply row from `/chat/canned-replies`; placeholder seen: `من مزارع طولكرم` ("from Tulkarm farms") in one canned reply text field.
- Moderation: **redact, never delete** — redacted messages render as italic `e.redactedAt`-gated placeholder, both bubble styles differ (`leaf`/`slate`) by sender; the redact button passes a fixed reason (copy mangled in console but the call shape is `k.post(\`/chat/${t.id}/redact\`,{reason:'…'})`) and toasts `…ستُخفى الرسالة من السجل.`-class confirmation. Community messages/questions/reviews/problems all have `hide` endpoints (`/community/messages/{id}/hide`, `/community/questions/{id}/hide`, `/community/reviews/{id}/hide`, `/community/problems/{id}/decide`) — same redact-don't-delete discipline as the cash ledger.
- Audit kind `MESSAGE_REDACTED: 'إخفاء رسالة'` (@583825).
- Thread carries `orderShortId` as an order-context chip — chat is order-anchored, not a global DMs system.
- Admin read access: support/disputes; the moderation surface is `/admin`-side (per the redact gate `!t.redactedAt` + admin role check in the admin bundle section).

### (2) Anchors

`[O]` canned-replies load + thread + redact button @578148–578500; customer send + `idempotencyKey: clientId` + sessionStorage draft @472151; order-context chip (`orderShortId`) + redact render @471685/@581706; audit kind @583825; redact POST @582101.

### (3) "Done like Souq" in Wind's own code

Wind's SPEC-in-app-chat.md is *already the design* (order/parties-only, admin read-only, quick replies, 30 msg/10 min, 500 chars, account-deletion placeholder). Souq adds these concrete bits:

1. **Server-managed canned replies** table + admin CRUD (`sent_canned_replies`) instead of client constants — Wind should store them so ops can A/B wording without a release.
2. **Redact, don't delete**, plus `redactedAt`/`redactedBy`/`reason` columns and a `MESSAGE_REDACTED` audit entry — mirrors the ledger. Account deletion → placeholder already in Wind's spec.
3. **Order-anchored chips** (`order #A1B2`) on every message — cheap dispute-resolution context.
4. **Rate limit** 30/10min per person (Wind's spec) — Souq doesn't show one; keep Wind's, it's better.
5. **Events reload**, not polling (`chat_message` channel).

### (4) Failure modes

- **Canned reply becomes gospel:** shop sends "we're preparing your order" mechanically → customer disputes with a message timestamp that lies. Ops needs audit (`chat_message` events) + redact-accountability; do not remove redact.
- **Redact pre-litigation:** shop/admin redacting incriminating messages before a dispute is evidence-tampering — mitigation: redact keeps the row (`redactedAt`, content replaced), never hard-deletes; audit kind exists. Keep forever, never prune (evidence).
- **No read receipts / presence** shown to customer — fine; Wind shouldn't add them (privacy + noise).
- **Optimistic-draft loss:** customer's `sessionStorage` draft key is per some draft id; a crash clears it → message lost silently. Acceptable (retry is one tap).
- **Moderation backlog:** redact is reactive; report rate unknown [U]. If Wind expects abuse, add auto-flag on keyword + human queue; Souq's community moderation (`problems/{id}/decide`) suggests they needed it — don't launch chat + community together; chat first.
- **Chat off the tracking link** (Wind's spec) — keep; it's the right privacy call.

---

## 12. Cross-feature failure-mode synthesis

What actually breaks, in order of how badly it hurts a cash-on-delivery launch:

1. **Door code wrong/locked + offline** → delivery impossible, no admin reachable → lost parcel, angry customer, cash in driver's pocket overnight. Souq answer: admin proof-reset + `QUEUE_STORAGE` refusal to lie. Wind must ship both before scale.
2. **Float math on shekels** (`Number*100`) at door → persistent ±1-agora ledger noise; eliminate with string parsing.
3. **Handover→settle without driver confirmation** (Souq) — Wind's two-person remittance rule is stronger; never weaken it to "match Souq".
4. **Zone fee client-computed display, server-authoritative total** — if server trusts client total, ledger is decorative; recompute always (§2/§3).
5. **Scope-lost outbox after sign-out/sign-in** → actions never replay or replay as wrong user → `X-Actor-Scope` + userId scope mandatory.
6. **`PROOF_LOCKED` after flush (offline confirm with bad code)** → door visit wasted; surface "pending" prominently.
7. **Admin `CASH_ADJUSTED` with free-text reason only** → un-auditable; require typed `reason` enum at least for adjustments, like Wind's cash-ops evidenceRef + reason.
8. **Vehicle QR as shift bearer token** → rotation policy and per-vehicle revocation UI mandatory once vehicles exist.
9. **Chat redact without audit retention** → misconduct invisible; keep `MESSAGE_REDACTED` audit forever.
10. **Server-added status token renders raw to users** (Souq falls back to token-as-label) — add an "unknown status" error UI + error-boundary alert instead of raw token.

---

## 13. Diff vs Shiply (why Souq is the better template for cash custody)

Shiply (`com.shiplypalestinemobileapp`, Expo/RN): parcel statuses exist but **no typed cash-variance reasons, no append-only ledger, no two-person remittance, no shift/job-board, no door-time amount capture, no delivery-proof secret**; its payment edge is COD-vs-card (`is_payment_parcel`; card via `/customer/checkout/save-paymentCard`) and QR as *parcel identity* (`/parcels/findByQRCode`). Its three-step delivery attempt (`attempttodeliver_three_step`) and `final_status_id` set are richer than Souq's fail flow. **Transfer:** status machine breadth + attempt semantics. **Do not transfer:** anything about cash — Shiply does not do it. Souq is the cash-custody template; Shiply is the lifecycle-attempt template; Wind needs both, weighted Souq.

---

## 14. Unknowns / not verified this pass

- Server-side enforcement of: append-only ledger, window cap atomicity, proof attempt counter, zone min-order — all client observations; server unobservable (no requests made, static read only). [U]
- `deliveryQrToken` entropy/rotation; `deliveryCode` length confirmed only as "4 أرقام" hint. [U]
- Full shift enum (settled/closed literal names), force-close UI. [U]
- Whether `/public/schedule` `selectable` is pure read or reserves. [U]
- Where `THE_TRACKING/…` — SW/push payload handling; Web Push vs FCM sufficiency on their Android base [U] (prior study flagged Web Push on Capacitor as fragile — unchanged).
- Admin `/admin/pulse` polling interval and event-bus transport (SSE/websocket) — `Zr([...])` wraps a subscribe; transport unverified. [U]
- `SouqNative.key()` derivation/persistence (native crypto) — not decompiled (4-class shell, read-only scope). [U]
- Exact cash-ops settlement states server-side (`CLOSED` literal seen in settle response handling @567370 — `a.status==='CLOSED'`). [O token; U machine]
- Bundle byte offsets in SOUQ-TULKARM.md vs this file's char offsets — same strings, ±1–2 %; not an error either way. [D]

---

## 15. Wind adoption checklist (priority order)

1. Zone + window + fee table (§2, §7) — replaces src/model.ts:185 `SERVICE_KM` shortcut.
2. Door-time collection capture with typed variance (§3) — new `collection` journal leg.
3. Shift + `PENDING_SETTLEMENT` gate on job board (§10, §4) — even without vehicle QR v1.
4. Delivery proof code/QR + lockout + proof-reset (§6) — spec already exists; ship it.
5. Two-axis order status + typed door/cash reasons (§5) — extend `SPEC-delivery-exceptions.md`.
6. Idempotent outbox with scoped replay (§9) — AsyncStorage + `Idempotency-Key` everywhere.
7. Custody chain events on every custody mutation (§8) — cheap once (4) exists.
8. Canned replies as server data + redact-with-audit (§11) — after support volume exists.
9. Admin pulse `CASH_VARIANCE`-class alerting (§4/§5) — Wind `ops.ts` dashboard.
10. Fleet `locationPingSeconds`/battery-aware tracking interval (§4/§9) — when driver tracking ships.
