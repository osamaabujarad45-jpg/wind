# Careem pair — rider (`com.careem.acma`) & Careem Captain (`com.careem.adma`) — implementation atlas

**Study date:** 2026-11-13 · **Method:** static analysis only (`rea`/JADX headless 0.7.1, `aapt2 dump resources/badging`, DEX string carving). No Careem host was contacted. No app was installed or run by this pass.
**Artifacts:**
- Rider `com.careem.acma` 26.43 (264301), base 85,446,587 B, SHA-256 `B19112D53D3E9A800EF35908FA48AF57816D9F8F81B7A3897A7220F527127F58` [O, rider pass, re-verified `aapt2 dump badging` this pass]
- Captain `com.careem.adma` **89.70.2** (**89702**), base **164,971,864 B** (157.33 MiB), SHA-256 `F5618AFD9E173B8B9A7C4D1D42EE5A6C2E0DEDAF71BA95064DD3FBD9B181C538`; arm64 split `com_careem_adma__split_config.arm64_v8a.apk` 26,634,229 B (24 native libs); xxhdpi split 2,423,017 B (316 entries, 0 libs). minSdk 32 / targetSdk 36 / compileSdk 37. Class count **60,549**, resource count 8,318 (`rea inspect-android-package`, this pass) [O]
- Pre-read builds: `research_notes\REA-2026-11-13-reference-apps\CAREEM.md` (rider study + §10 Captain seed) and `…\PALESTINIAN-COMPETITORS-INDEX.md`. Both are built on; deltas labelled.

**Labels:** [O] observed in artifact · [I] inference from artifact · [U] unknown / not established · [D] design implication for Wind (not evidence about Careem).

---

## 0. Executive summary

1. **Cash, not cards, is the load-bearing instrument on both sides** — as a ledger event, not a payment method (rider §5/§11.2), and as a **two-tier, server-set cash-limit** on the captain side with four escalation states: earn → accumulate → *warning limit* → *blocking limit* → cash jobs blocked while card jobs continue, with in-app settlement by card charge or recurring auto-deduct. The driver-side cash-debt is a **continuous wallet balance with an automatic consequence**, not a per-order flag an admin reads later.
2. **The driver's settlement primitives are three**: (a) `CashRequest{amountCollected: float, latLng, timestamp}` reported at trip end by the RH and Food pipelines (`CompleteReportCashStepRequest`); (b) a **trip is "unverified" until cash is reconciled** ("It takes up to 3 working days to verify the trip") — cash can arrive before trust; (c) a **cash-balance settlement dialog** ("Settle now" / "Settle later" / partial amount 0..max / auto-deduct from default payment method) with Arabic copy for every state.
3. **The earnings statement is a named taxonomy, not a number**: 14 shipped `breakdown_*` string keys (11 money lines + 3 UI labels) (bonus, tips, guarantees, fines, fines_refund, behavior_penalties, money_in, money_out, other, trip_earnings, matched_tips…) plus per-job `EarningsDto{totalAmount, items[{type, amount, breakdown[{name, amount}]}]}` and an aggregation-by-time model for week/month. Standalone **"Unverified Cash Trips"** tab exists.
4. **Arrival at pickup is a customer-held PIN** ("Enter Customer Pin" / أدخل رمز العميل) — the inverse of Wind's delivery code, at the *start* of the trip.
5. **Going online is precondition-gated**, not a free toggle: GPS *and* a Bluetooth sensor must be enabled; the app refuses otherwise and distinguishes "blocked from going online" (device/account) from "unable to go online" (precondition).
6. **Shifts are a booked, tiered, guarantee-bearing scheme** (Bronze/Silver/Gold tiers, weekly guarantee, attendance, auto-assign nudges, nudge-workers for pre-shift/shift-end/late) — *not* the Uber-style "tap to go online" model. Both exist in the binary; the on-demand toggle is the primary path, shifts layered on top for dense markets.
7. **Acceptance rate is measured and shown, gated only as a shift-priority signal** — "Minimum of %1$d%% acceptance"; nothing in the binary blocks a low-acceptance captain from cash bookings.
8. **Offer anti-abuse exists server-side**: blacklisted bookings are dropped before assignment ("Server state has blacklisted jobs", `server_state_has_blacklisted_jobs`), the client carries a blacklist filter and a reminder worker. This is fraud-prevention on the *dispatch* side, invisible in most teardown write-ups.

Wind takeaway in one line: **copy the two-tier cash-limit ledger and the per-job explained earnings statement; do not copy acceptance gating, shift tiers, or the SDK stack.**

---

## 1. RIDER (`com.careem.acma` 26.43)

Claims in §1 are inherited from CAREEM.md (rider study, 2026-11-13) and **re-anchored this pass** where local artifacts allow. New anchors marked "this pass".

### 1.1 Aurora SDUI — the server-driven home/campaign renderer

- `com.careem.aurora.sdui` is the SDUI module; CAREEM.md counted **169** sdui classes and 189 aurora classes; the pre-extracted class list in `careem-feature-research` counts **148 sdui / 165 aurora** (different extraction scope, both given, §11 of CAREEM.md) [O].
- The shipping binary contains a **closed vocabulary of component keys** (`MapAndAddress_Map`, `MapAndAddress_SaveAddressButton`, `ADDRESS_BOOK`, `DELIVERY_IMAGES`, …) as **DEX string literals** — verified this pass: `MapAndAddress_BuildingType`, `MapAndAddress_AddPickupPhoto`, `MapAndAddress_NicknameSheet` are *not* in `aapt2 dump resources` but are present in `classes12.dex` of the captain build [O, this pass].
- The captain build **embeds the same SDUI stack and the same `MapAndAddress_*` keys** (`classes12.dex` of `com_careem_adma__base.apk`, grep "MapAndAddress_", this pass) — the super-app shell is shared source across both apps [O].
- Both apps reference the same prod SDUI backend host: `sdui-activities.core.gw.prod.careem-rh.com` (rider `careem-urls.txt` line 190; captain `classes3.dex`/`classes12.dex`, carving this pass) [O].
- Model: **the app ships the renderer; the server ships the layout** — key registry + payload, no OTA channel needed to change copy/order of the home/campaign surfaces [I]. The rider HomeScreen and campaign/activity cards are SDUI; transactional flows are native [I, CAREEM.md §3].
- [U] The exact wire format of the SDUI payload (schema of actions/bindings) was not extracted; per-key required/optional flags are server-configured and unreadable statically.

### 1.2 Address model — pin + nickname + building type + notes + photo

Component keys (rider binary, DEX literals): `MapAndAddress_Map`, `_EditMapButton`, `_MapConfirmButton`, `_CurrentLocation`, `_SearchField`, `_MapSearchSheet`, `_NicknameSheet`, `_BuildingType`, `_BuildingTypeDropdown`, `_BuildingTypes`, `_DeliveryNotes`, `_PickUpNotes`, `_EnableDeliveryInstruction`, `_DisableDeliveryInstruction`, `_AddPickupPhoto`, `_AddDeliveryPhoto`, `_UploadPhoto`, `_TakePhoto`, `_PhotosSheet`, `_AddressSummaryBox`, `_ShowMoreButton`, `_SelectAnotherAddressButton`, `_SaveAddressButton`, `_UpdateAddressButton`; related: `ADDRESS_BOOK`, `ADDRESS_DETAILS`, `DELIVERY_IMAGES`, `PICKUP_IMAGES`, `PICKUP_POINT`, `DROPOFF_LOCATION`, `addressType`, `addressDetailsField(fieldId=…)` [O, CAREEM.md §4].
- `com.careem.superapp.feature.addressbook.AddressBookActivity` — the address book is a first-class feature, not a form inside booking [O].
- Building type is a **taxonomy chosen from a dropdown**, not free text [O]. Delivery/pickup instructions are a **per-address toggle** [O]. **Photo of the entrance/door is part of the address**, delivered to the fulfilment side [O].

**The contradiction to hold honestly:** a second independent pass (CAREEM.md §11.1) found validation copy making **area + building + apartment/villa number required** (`address_addressAreaMissing`, `address_addressBuildingMissing`, `address_addressNumberMissing`, `address_addressNumberInvalid`, `address_addressIncomplete`, `address_addressNotUsable` — الرجاء إدخال منطقة العنوان / مبنى عنوانك / رقم الشقة/الفيلا). Both are in the binary. Working reading [I]:
- The capture-side form is server-configured SDUI, so *requiredness is a server choice* per market/service;
- The strict validator guards *saved addresses used by delivery services* (door-drop to a door), while the map pin + photo covers the no-number case;
- For a Palestinian-market (no street numbers) deployment this means: adopt pin+nickname+building-type+notes+photo as the *capture* model, and make the strict validator **optional-per-field via server config**, not hard-coded — Careem's own binary shows validation as separately shipped strings, i.e. it is a product decision, not a technical constraint.

**Arabic copy (exact, this pass re-read from rider `acma-res-utf8.txt`):**
- `cashBookingNotAllowedMessage`: «لا يمكنك إجراء حجز نقدي ما لم تقم بتسوية الرصيد المستحق. للقيام بذلك، اشحن محفظتك أو غيّر طريقة الدفع للاستمرار في الحجز غير النقدي.» ("You cannot make a cash booking unless you settle your outstanding balance. To do this, top up your Wallet, or change your payment method to continue with a non-cash booking.") [O]
- `cash_only_unsupported_payment_warning_prompt`: «هذه الرحلة تقبل الدفع نقدًا فقط» [O]

### 1.3 Cash — first-class instrument with an arrears rule (rider)

- Cash is **not a payment-method enum**: second pass found payment methods `CARD` (بطاقة), `DEBIT` (خصم), `CREDIT` (رصيد), `CAREEM_PAY` only. What "cash" means is a **wallet ledger event**: `TITLE_PURCHASE_CASH_DELTA_UNDER_BALANCE` ("Negative balance" / رصيد سالب), `TOPUP_CASH_DELTA_NEGATIVE_CREDIT_BALANCED` ("Amount settled due to a previous underpayment"), `DETAILED_TOPUP_CASH_OVER_PAYMENT` ("Cash" / نقدًا), `DETAILED_TOPUP_CASH_DELTA_NEGATIVE_CREDIT_BALANCED` ("Negative balance settled") [O, CAREEM.md §11.2]. Money in/out of the rider's *careem balance* is a double-entry-style delta stream; cash rides are priced to the rider as cash and reconcile into the **captain's** balance (below) [I].
- **Arrears rule (rider):** an unpaid cash balance blocks a *cash* booking until settled (top up wallet, or switch method) — `cashBookingNotAllowedMessage` above [O]. Non-cash bookings remain possible — the block is cash-scoped, not account-scoped [O/I].
- **Cash-only service labelling**: `cash_only_unsupported_payment_warning_{title,desc,prompt,cta}` — a service can declare itself cash-only and the app states it *before* booking ("Book this ride" CTA) [O].
- **Cash-only promo gating**: `PROMO_CODE_INVALID_SERVICE_TYPE` — promo restricted to cash bookings [O].
- [D] Wind already matches the *rider-side* arrears concept partially; the missing piece is the **driver-side half** (§§2–4 below) — Careem is a two-sided ledger, Wind is rider-first.

### 1.4 Map behind an interface

`com.careem.superapp.map.core.MapView` / `MapFragment` with one implementation `map.google.MapFragmentImpl` / `MapViewImpl`; only **4** direct `gms.maps` references in 73,254 classes [O, CAREEM.md §6; interface names re-verified this pass in the class list].

### 1.5 Tracking modelled by concern + explicit status mapper

`com.careem.superapp.feature.ordertracking.model.{maps(31),misc(28),detail.delivery(17),detail.payment(16),detail.status(12),navigation(15),tipping(9)}` + `ordertracking.api(17)` + `featurelib.servicetracker.model(47)`. `OsirisBookingStatusMapper` (`com.careem.acma.booking.model.local.OsirisBookingStatusMapper`) maps server status → UI state [O, CAREEM.md §11.5; mapper class path re-verified this pass]. [D] A status mapper with an explicit "unknown" branch is the right place to tolerate a no-OTA app meeting a new server status.

---

## 2. CAPTAIN — the earnings statement is a taxonomy, and it is the useful part

### 2.1 The 14 shipped `breakdown_*` string keys (11 money lines + 3 UI labels) (exact strings, aapt2 UTF-8 dump this pass)

| key | English | Arabic (ar) | note |
|---|---|---|---|
| `breakdown_trip_earnings` | Trip earnings | **أرباح الرحلة** | the base leg |
| `breakdown_bonus` | Bonus | **مكافآة** | |
| `breakdown_tips` | Tips | **إكراميات** | |
| `breakdown_guarantees` | Guarantees | **الضمانات** | shift guarantee, not surge |
| `breakdown_fines` | Fines | **الغرامات** | |
| `breakdown_fines_refund` | Fines refund | **استرداد الغرامات** | signed reversal — the ledger is reversible per line, not per record |
| `breakdown_behavior_penalties` | Behavior penalties | **عقوبات السلوك** | |
| `breakdown_matched_tips` | Ramadan tips from Careem | — (English/ckb only; no `(ar)` line in this build) | localized event tips injected by the ops side |
| `breakdown_money_in` | Money in | **المال الداخل** | the in-leg of the running ledger |
| `breakdown_money_out` | Money out | **المال الخارج** | the out-leg (deductions) |
| `breakdown_other` | Other | **أخرى** | catch-all — honest taxonomy always has one |
| `breakdown_subtitle` | Understand your earnings | **افهم أرباحك** | the screen's single job |
| `breakdown_title` | Breakdown | **تحليل مفصّل** | |
| `breakdown_cta` | View all bookings | **عرض جميع الحجوزات** | drill-down to per-booking rows |

All values read this pass from `adma-res-utf8.txt` (aapt2 `dump resources`, captured as bytes, decoded UTF-8) [O]. Also `earning_breakdown_retrieval_failed` ("earnings breakdown" error) and `p2p_payment_breakdown_title` exist as adjacent keys [O].

### 2.2 The data model behind it (obfuscated fields, observed)

- `com.careem.captain.feature.earnings.data.model.Breakdown` — 9 numeric line items + 1 nullable (`h: Double?`), kotlinx-serialization [O, `rea inspect-android-class`]. Field count: `a..i` (trip/bonus/tips/guarantees/fines/fines_refund/behavior_penalties/other/matched_tips by elimination against the string table) [I].
- `AggregationModel{ a: Breakdown, b: String, c: Overview }` wraps per-period aggregation [O].
- `Overview{ List<AggregationByTime>, double }`; `AggregationByTime{ double, String, String }` — value + period label [O].
- `BookingItemModel{ long, String, String, String, String, double, cn81, vjq }`; `BookingListModel`, `BookingOverViewModel` — per-booking rows under a period [O].
- `EarningTransactionModel{ String, String, String, long, vjq, String, double, cn81 }` and `EarningTransactionsModel` — the transaction ledger API model [O].
- `AggregationByTime`/`AggregationModel` wire keys include `earnings`, `moneyIn`, `moneyOut`, `moneyInList`, `moneyOutList`, `unverifiedTransactions`, `earningsAndOrderCount` (classes11.dex, string carve this pass) [O].
- **Job-level earnings** (the Food/delivery pipeline): `com.careem.captain.jobs.data.model.food.EarningsDto{ totalAmount: v1l(BigDecimal-like), items: List<EarningsItemDto> }`; `EarningsItemDto{ type: EarningTypeDto, amount: v1l, breakdown: List<EarningsItemBreakdownDto> }`; `EarningsItemBreakdownDto{ name: String, amount: v1l }` — a job carries **typed earnings items, each with named sub-lines** [O, rea inspect this pass].
- `EarningTypeDto` enum values not recovered (Kotlin-obfuscated) [U].

### 2.3 Endpoints (strings carved from DEX this pass)

- `captain/portal/earnings/transaction/{captainId}/unverifiedTransactions` (classes8) [O]
- `captain/portal/earnings/transaction/{captainId}/cycleNumber/{cycle}` (classes8) [O]
- `captain/{captain_id}/earnings/aggregation-type/{aggregation_type}` (classes8) [O]
- Base hosts carved: `https://captain.careemapis.com/` (captain core), `https://captain-utility-edge.sandbox.careemapis.com/` (sandbox), `https://settlement-service.careemapis.com/` (settlement) [O]
- `captain_mobile_app/earnings_v1` (classes13 — telemetry/route constant, role unclear) [U]
- Retrofit interfaces present: `com.careem.adma.feature.earnings.api.RetrofitAggregationApi.getEarningsAggregationByType(int, e22, long, long, …)` and `RetrofitBookingsApi` (many methods, 77 KB of signatures; the full path strings above are the ground truth) [O]
- `e22` is the aggregation-type enum (week/month/year by `earnings_period_*` / `earnings_overview_week|month` keys) [I].

### 2.4 Unverified trips — cash is trusted before it is reconciled

| key | English | Arabic |
|---|---|---|
| `tab_transactions_unverified` | Unverified | **غير مُحقق** |
| `booking_status_unverified` | Unverified | **غير مُحقق** |
| `summary_type_unverified_cash_trip` | Unverified Cash Trips | **رحلات نقدية لم يتم التحقق منها** |
| `summary_type_unverified_normal_trip` | Trip Earnings | **أرباح الرحلة** |
| `summary_type_unverified_tooltip` | **It takes up to 3 working days to verify the trip** | **قد يستغرق التحقق من الرحلة مدة تصل إلى 3 أيام عمل** |
| `summary_type_unverified` | Total unverified balance | **إجمالي الرصيد الذي لم يتم التحقق منه** |
| `label_unverified` | Tap to verify | **اضغط للتحقق** |
| `booking_status_waived` | Waived | **معفى** |

[O, aapt2 dump this pass]. The earnings landing screen has `StatusFilterCarousel`, bookings have status filters, and there is a dedicated **Unverified** tab in transactions. The settlement-service closes the loop after the 3-working-day window [I].

**Take-home math, as evidenced:** take-home = Σ(all `breakdown_*` signed lines) for the period, split into `money_in`/`money_out` views, with a **Total unverified balance** figure alongside the confirmed one. The binary never shows a single "balance" number without the unverified companion [I]. This is exactly the shape Souq Tulkarm implements as an append-only ledger (`/driver/cash/handover` → `/admin/cash/settle`, SOUQ F-06) and it is structurally consistent with append-only accounting: lines are added and reversed, never edited (`fines_refund` exists; no "edit line" key exists) [I].

---

## 3. CAPTAIN — the cash-debt model, implemented on the driver side

### 3.1 The model (code, not copy)

`com.careem.pay.outstandingbalance.model.CashBalanceCaptainModel` [O, rea inspect this pass]:

```
balance:            java.math.BigDecimal
warningCashLimit:   java.lang.Integer   // server-set
blockingCashLimit:  java.lang.Integer   // server-set
currency:           java.lang.String
isWarningLimitReached(): boolean
isBlockingLimitReached(): boolean
```
wrapped in `CashBalanceCaptainResponse{ data }`, fetched by `com.careem.pay.outstandingbalance.gateway.OutstandingBalanceGateway.getCaptainCashBalance(Response<CashBalanceCaptainResponse>)` and `com.careem.adma.captain.cashbalance.api.CashBalanceApi.getCashBalanceStatus(String): pi01<ohc>` [O].

Notes: the balance is **BigDecimal** here (earnings models use `double`; money display layers differ — inconsistent defensive coding, but the *cash limit* path is exact-decimal) [O]. **Both limits come from the server** — the client does not hard-code them; the enforcement is therefore tunable per market/captain without an app release [I]. There is no local cache flag to defeat: `isWarningLimitReached()`/`isBlockingLimitReached()` are derived, not stored state [I].

### 3.2 The four escalation states (strings, Arabic included, this pass)

**State 1 — healthy.** `balance_card_positive_title` = "Available to transfer" / **متاح للتحويل**; `balance_card_zero_title` = "Current balance" / **الرصيد الحالي** [O]. Driver sees a positive, transferable balance.

**State 2 — warning (approaching the limit).**
- `cash_limit_warning_dialog_title` = "Please pay outstanding cash" / **الرجاء دفع المبلغ النقدي المستحق**
- `cash_limit_warning_dialog_message` = "Settle the negative cash balance to avoid getting blocked." / **عليك تسوية رصيدك النقدي السلبي لتفادي حظر حسابك.**
- `cash_limit_warning_static` = "You're close to your cash limit of %1$s %2$d. Pay %1$s %3$d to avoid getting blocked." / **أنت قريب من حدك النقدي %1$s %2$d. ادفع %1$s %3$d لتجنب الحظر.**
- `accelerator_low_balance` / `accelerator_low_balance_desc` = "Low balance" / **رصيد منخفض**, "Top up your wallet" / **اشحن رصيد محفظتك**
- `underpayments_warning_message` = "Pay %s outstanding from your previous transactions" / **قم بتسديد %s قيمة المدفوعات المستحقة من معاملاتك السابقة**
[O, aapt2 dump this pass]

**State 3 — blocked (limit crossed).**
- `cash_limit_blocked_dialog_title` = "You have exceeded your cash limit" / **لقد تجاوزت الحد الأقصى للرصيد النقدي**
- `cash_limit_blocked_dialog_message` = "You won't receive any more cash bookings. Please settle the outstanding amount." / **لن تستلم أي حجوزات نقدية. يرجى تسوية المبلغ المستحق.**
- `cash_limit_blocked_static` = "Blocked for cash bookings. Limit of %1$s %2$d reached." / **تم الحظر للحجوزات النقدية. تم الوصول إلى الحد %1$s %2$d.**
- `cash_block_bottom_sheet_title` = **"You are blocked for taking cash bookings"** / **لقد تم حظرك من حجز الرحلات النقدية**
- `cash_block_bottom_sheet_text_part_one` = "You have crossed your cash limit and owe" / **لقد تجاوزت حد النقدية وتدين** + part_two = "to Careem." / **إلى كريم.**
- `cash_block_notification_text` = "You are blocked for cash trips" / **لقد تم حظرك من الرحلات النقدية**
- `cash_blocked_currency_amount` = "%1$s %2$s cash blocked" / **%1$s %2$s مبلغ محجوز**
- `balance_card_cash_warning` = "If you go over the limit, you'll get cash blocked" / **إذا تجاوزت الحد، سيتم حظر النقد**
- `underpayments_blocked_title` = "Cash transactions blocked" / **تم حظر التحويلات النقدية**
[O, aapt2 dump this pass]

**State 4 — blocked but still earning.**
- `cash_block_card_payment_info` = **"You will still receive card bookings"** / **ستستمر في تلقي حجوزات البطاقات** [O]
  → The block is **cash-scoped, not account-scoped**. Careem does not zero a captain's income over a cash debt; it removes the *instrument* that created the debt. A fully cash-only market (Wind) must block differently — see §8 [D].
- Analytics events confirm the flow exists end-to-end: `balance_cash_blocked_banner_clicked`, `balance_cash_blocked_bottom_sheet_shown`, `balance_cash_blocked_bottom_sheet_pay_back_clicked`, `balance_cash_blocked_bottom_sheet_pay_back_later_clicked` (classes11, carve this pass); flow class `com.careem.captain.feature.balance.cashblock.CashBlockFlow` + view `com.careem.adma.feature.balance.landing.cashblock.CashBlockBottomSheetView` [O].

### 3.3 How the driver settles (the "settle now" surface)

| key | English | Arabic / note |
|---|---|---|
| `pay_settle_cash` | Settle cash balance | **قم بتسوية الرصيد الغير مُسدد** |
| `pay_settle_negative_balance` | Settle negative balance | **تسوية الرصيد السلبي** |
| `pay_settle_outstanding_balance_message` | Please, settle outstanding balance of %1$s | **يرجى تسوية الرصيد المستحق البالغ %1$s** |
| `pay_settle_text` / `pay_settle_balance_auto_deduct_message` | Settle / "Your outstanding cash balance will be automatically settled from your default payment method once it reaches: %1$s" | **التسوية** / **ستتم تسوية رصيدك النقدي المستحق تلقائيًا من خلال طريقة الدفع الافتراضية بمجرد وصول الرصيد إلى:%1$s** |
| `pay_auto_settle_balance_msg` | "With recurring payment set, Careem will always try to settle maximum of your negative cash balance based on your Captain policy." | **مع خيارات الدفعات المتكررة، سنعمل دائمًا في كريم على تسوية أقصى حد من رصيدك النقدي السلبي بحسب سياسة الكابتن الخاصة بك.** |
| `settle_now_key` / `settle_later_key` | Settle now / Settle later | **تسوية الرصيد الآن** / **تسوية الرصيد لاحقًا** |
| `settle_cash_continue` | Settle this amount | **قم بتسوية المبلغ** |
| `settle_cash_range_error` | "Please enter an amount between 0 and %s" | **من فضلك أدخل مبلغ بين 0 و %s** — **partial settlement is a first-class path** |
| `settle_cash_success` | "You've successfully sent money to Careem." | **لقد قمت بإرسال النقود إلى كريم بنجاح.** — the driver *sends* money to Careem |
| `settle_cash_unsuccessful` / `settle_cash_failure_desc` / `pay_cash_balance_settle_failed` | failure states | **لم تتم عملية التحويل** / **لم نتمكن من إتمام عملية التحويل. يرجى المحاولة لاحقاً.** |
| `outstanding_title_amount_settled` | "%1$s outstanding payment settled" / **يمكنك الآن الاستمرار باستخدام جميع خدمات كريم** (`outstanding_message_amount_settled`) | settle → restore all services |
| `pay_negative_cash_balance_settled` | Cash balance settled | **تم تسوية الرصيد النقدي** |
| `pay_outstanding_settled_promo_subtitle` | "You just saved %1$s by settling the outstanding payment. You can now continue using all of Careem's services." | settlement is *also* a retention tool |

[O, aapt2 dump this pass]. Class anchors: `com.careem.pay.paycareem.gateways.SettleCashGateway`, `…models.SettleBalanceRequest{ a: TotalBalance }`, `…models.SettleBalanceInvoiceRequest/Response`, `…view.SettleBalanceActivity`, `…view.PaySettleRecurringResultActivity`, `…view.PayRecurringSettleBalanceFailedCardView`, `com.careem.pay.outstandingbalance.widgets.PayCaptainCashBalanceView` [O]. The settlement *rail* is a **card charge against the captain's own default payment method** (Careem Pay rails) — i.e. the driver owes Careem money and pays it back by card [I]. [U] No in-person/cash handover UI exists in this build (`enter_handover_code` string exists, no class, no flow — likely a dead key or a remote-config surface) [O/U]. `pay_transfer_credit_to_balance` = "Transfer Careem credits to Cash", `pay_own_transfer_captain_cash_balance_title` = "Cash (Captain's Balance)" / **نقد (رصيد حساب الكابتن)** [O].

### 3.4 The per-trip cash reporting primitive (both ride-hail and food pipelines)

- `com.careem.captain.jobs.data.model.CashRequest` [O, rea inspect this pass]:
  `timestamp: long`, `latLng: LatLngDto`, `amountCollected: float`, `objectType: String` (kotlinx-serialization).
- `CompleteReportCashStepRequest{ step: CashRequest }` — the completion command for the RH pipeline (`com.careem.captain.jobs.job.rh.operation.CompleteReportCash` → `In/OutReportCashCommand`) and for Food (`FoodReportCash`, `InFoodReportCashCommand`) [O, class list this pass].
- **The driver is asked to enter the amount actually collected, or 0** if nothing was collected:
  - `cash_amount_parse_error` = "Enter the amount collected, or enter “0” if you did not collect any money." / **أدخل المبلغ الذي تم جمعه، أو أدخل "0" إذا لم تجمع أي أموال.** [O]
  - `cash_to_collect_shown_at_the_end` = "Cash to collect shown at the end" / **المبلغ النقدي المطلوب تحصيله يظهر في النهاية** [O]
  - `cash_collected` / `cash_trip_text` / `collect_cash` / `FinishButtonView`, `TaximeterCashCollectionView`, `CashTripLayoutView`, `CashReceiptBreakdownView` [O].
- **The app refuses to end the trip until the collection is sane:**
  - `underpayment_disallowed_dialog_title` = "Collect full trip fare" / **قم بتحصيل اجر الرحلة بالكامل**
  - `underpayment_disallowed_dialog_content` = "Collect a minimum of %1$s %2$s to end this trip." / **يرجى تحصيل على الاقل %2$s%1$s لتتمكن من انهاء الرحلة**
  - `overpayment_disallowed_dialog_title` = "Overpayment limit" / **سقف الدفع أعلى من الأجرة**
  - `overpayment_disallowed_dialog_content` = "Collect a maximum of %1$s %2$s to end this trip." / **يرجى تحصيل %2$s%1$s على الأقل لتتمكن من انهاء الرحلة** (note: the Arabic translation is inverted vs. English — a localization defect, flagged, not copied as-is) [O]
  - → The collection is **clamped to [min, max] around the fare** before the trip can be completed; extreme deviations are rejected client-side, residual deltas flow into the cash ledger [I].
- Metered cash taxis: `CheckMeterFareView`, `CheckMeterFareFailureView`, `TaximeterCashCollectionView` — a separate metered-cash flow for Dubai-style taxi captains [O].
- **Under-collection is not silently forgiven:** `FetchMaxExtraCashCollectibleCommand` exists (driver may be allowed to collect *more* up to a server cap, e.g. for wait time) and `NotifyCashCollectionTerminationAction` / `NotifyCashCollectionTerminationReducer` close out the collection sub-flow [O].

### 3.5 Where a driver ends up last-unpaid — the enforcement chain

1. Cash job completed → driver collects → reports `amountCollected` (may exceed/under-run fare by clamp).
2. Reported cash accrues to the **captain cash balance** (`CashBalanceCaptainModel.balance`, BigDecimal, updated server-side; settlement-service + outstandingbalance gateway) [I].
3. Balance goes negative past `warningCashLimit` → warning dialog ("Please pay outstanding cash") [O].
4. Driver keeps taking cash jobs → past `blockingCashLimit` → **cash-booking block** (bottom sheet + banner + notification + static home card), **card bookings continue** [O].
5. Driver settles via: one-off card charge ("Settle now", any amount 0..balance), recurring auto-deduct ("recurring payment set → auto-settle maximum of negative balance based on your Captain policy"), or buys time ("Settle later") [O].
6. On success: all services restored ("You can now continue using all of Careem's services") [O].
7. [U] Server-side: how limits are computed (per-market constant? per-tenure heuristic? ops-set per captain?), whether repeated blocking escalates to suspension, how long the block persists after settlement, and whether any of this applies in Palestine — none of it is in the artifact.
8. **Not in this build:** any "handover cash to an agent/driver/office" flow. Wind cannot assume one exists in Careem's playbook for Palestine [O/U].

---

## 4. CAPTAIN — shift / acceptance / arrival state machine

### 4.1 Going online is precondition-gated, and the failure modes are named

- Preconditions (Play services + device): **GPS must be on** (`enable_gps_before_go_online` = "Enable GPS from your mobile settings to go online." / **شغل نظام تحديد المواقع من إعدادات هاتفك للظهور بحالة متوفر.**) and **Bluetooth sensor must be on** (`enable_bluetooth_sensor_before_go_online` = "Enable Bluetooth Sensor from your mobile settings to go online." / **قم بتمكين مستشعر البلوتوث من إعدادات هاتفك للظهور بحالة متوفر.**) [O]. The Bluetooth requirement is for *merchant-proximity wait-time detection* on food orders ("Careem requires background location… and bluetooth permission to detect your wait time at the merchant to assign orders efficiently") [O].
- Go-online failure surfaces: `unable_to_go_online` (**غير قادر على الاتصال بالشبكة**), `blocked_from_going_online` ("Your device is blocked from going online." / **جهازك محظور من الاتصال بالإنترنت.** — a **device-level** ban path, distinct from precondition failure), `toggle_captain_online` (**متصل**) / status bar `status_activity_you_are_online|offline`, `go_online_now` / `go_online` ("غيّر إلى متوفر" — the Arabic uses "change to Available", i.e. a *status*, not a *mode*) [O].
- Going offline mid-shift is **discouraged with the cost of doing so**: `in_shift_go_offline_dialog_title` = "Planning for break?" / **تخطط للاستراحة؟**; `go_offline_dialog_content_title` = "%1$s break left" / **تبقى %1$s استراحة**; `go_offline_dialog_shift_availability_content_description` = "Make sure to meet %1$s shift availability" / **تأكد من تلبية توفر الوردية %1$s**; `go_offline_dialog_required_shift_availability_content_description` = "You will not meet required shift availability" / **لن تتمكن من تلبية متطلبات توفر الوردية**; `go_offline_dialog_go_offline_action` = "Go offline" / **غيّر إلى غير متوفر**, `stay_online_action` = "Stay online" / **البقاء بحالة متوفّر**; `default_go_offline_dialog_title` = "Going offline?" / **هل ستذهب إلى وضع عدم الاتصال؟** [O]. → **Going offline during a booked shift directly forfeits eligibility/guarantee.** The app makes the cost explicit at the moment of the choice.
- Idle nudging: `com.careem.adma.feature.shiftszones.reminder.{preshiftreminder.PreShiftNudgeWorker, shiftstart.ShiftStartWorker, shiftend.ShiftEndWorker, lateforshiftreminder.LateForShiftNudgeWorker, offlinenudge.ComeOnlineNudgeWorker, nextdayreminder.NextDayShiftReminderWorker}` — WorkManager jobs that fire *before* (nudge to book), at start (come online), at end ("Your shift is over!"), when late ("You have arrived late" → removed from queue), when offline mid-availability, and for the next day [O, class list this pass].

### 4.2 The booked-shift model (scheduled dense-market shifts)

Keys (aapt2, Arabic included, this pass): `book_shift` (حجز الوردية), `book_shifts_now`, `shift_schedule_screen_title` (Shift calendar / تقويم المناوبات), `shift_ready_to_book_button_label` (Book shift now), `shift_booked_successfully`, `shift_selection_*` (selection, auto-assign «سنقوم بالتعيين التلقائي قريبًا», rebook «نفس الوردية متاحة»), `shift_list_empty_title` ("Shift schedule coming soon!"), `shift_auto_assigned_reminder_message` ("We didn't hear from you, so we booked your shifts for the week of"), `shift_selection_auto_assigned_notification_*` ("Shift booked for you ✅"), `shift_selection_nudge_notification_*` ("You haven't booked your shift yet ⏳") [O].
- **Weekly booking window with tiered early access:** `shift_selection_open_time_prefix_label` ("Opens in %s"), tiers **Bronze/Silver/Gold** (`shift_selection_tier_bronze|silver|gold`), top performers get early access (`shift_selection_onboarding_list_item_3`), `shifts and zones` selection, `shift_zones_view_shift_schedule`, high-demand areas surfaced during shift (`you_are_in_high_demand_area_go_online_to_receive_more_orders`), `you_are_offline_for_some_time` ("You're offline for some time, don't miss your shift attendance") [O].
- **Guarantee mechanics (this is the part that matters for cash):**
  - `breakdown_guarantees` / **الضمانات** — guarantees are a first-class *earnings line*, paid only on full attendance [I].
  - `shift_gurantee_value` ("%1$s guarantee" / **ضمان %1$s**), `shift_summery_guarantee` (Guarantee / **ضمان**), `shift_summery_exceed_guarantee` ("You're doing really well! 🎉 Earned more than %1$s guarantee"), `shift_summery_not_exceed_guarantee` ("Guarantee received! 🎉"), `shift_summery_not_full_attendance` ("Guarantee not received 😔"), `shift_performance_*` (Order completion, Orders delivered, Rating), `shift_summary_*` (Earned %1$s, Order earnings, Shift hours) [O].
  - Attendance: `shift_attendance` (حضور الوردية), `shift_completed_status` (Full attendance / حضور كامل), `shift_not_completed_status` (Missed attendance / غياب عن الحضور), `shift_paused_status_widget_label` ("Looking for orders" / **البحث عن طلبات**), `shift_inprogress_status_widget_label` ("Come online to resume shift" / **قم بالاتصال بالإنترنت لاستئناف الوردية**) [O].
  - Tier-based overtime: `shift_tier_overtime_*` — Bronze: no extra time; Silver: more; Gold: more still; zone demand can move it ("Extra time can be different, if they're in different zones") [O].
  - Mandatory rest days: `shift_day_hint_min_rest_days` ("You need to select at least %1$d rest days") [O].
- The on-demand path coexists: plain `go_online` toggle with `you_are_in_high_demand_area…` nudges; the shifts layer is a *scheduling overlay* on the same availability concept, gated by tier and zone [I].
- [D] Wind should treat this whole tier/guarantee/attendance apparatus as **opt-in later**, gated on driver density; for a 50-driver pilot it is an unaffordable incentive engine [I].

### 4.3 Offer / accept / decline — how a job is actually offered

RBAC of the dispatch pipeline (class list + strings this pass):

1. **Offer arrives as a push** (`offer_received_notification_title` = "Booking offer received" / **لقد استملت عرض حجز**; `offer_received_notification_body` = "Please tap on this notification to see the offer" / **يرجى الضغط على هذه الرسالة لمشاهدة العرض**; `offer_missed_notification_*` = "You missed a booking. Tap here to edit your status" — a *miss* is a named event with a recovery CTA) [O].
2. Framework sequence (booking framework, `com.careem.captain.booking.framework`): `BookingOfferReceivedAction` → `DispatchBookingOfferAction` → `MarkBookingOfferReceivedCommandAction` → `FetchBookingOfferEtaCommandAction` → `SendOfferResponseCommandAction`; response = `BookingOfferResponseAction`/`…SentAction`; expiry = `BookingAssignmentTimedOutAction`/`…TimedOutAcknowledgeAction`/`BookingAssignmentTimedOutCommandAction` [O, class list this pass].
3. Offer UI strings: `offer_header_title` = "New order pickup" / **استلام طلب جديد**; `offer_action_accept` = "Tap to accept" / **اضغط للقبول**; `offer_action_reject` / `offer_reject` = "Reject" / **رفض**; `offer_new_cash` = "Cash" / **نقدًا** (payment instrument is shown on the offer); `offer_new_earn` ("Earn:" / **اكسب:**); `offer_new_payment` ("Payment:" / **الدفع:**); `offer_distance_in_km`; `dispatch_in_ride_booking_assigned` ("Mabrook! Booking confirmed" / **مبروك! تمّ تأكيد الحجز**); `dispatch_in_ride_booking_expired` ("Sorry! You did not get this booking"); `dispatch_in_ride_confirming_booking` ("Confirming booking…") [O].
4. **Assignment is fraud-filtered before the driver sees it**: `ValidateBookingOfferFraudCommandAction`, `OnOfferFraudDetectedAction`, `BlackListBookingOfferCommandAction`, `BookingBlacklistFilterAction`, and the server-side blacklist (`Booking is blacklisted`, `Drop the already blacklisted booking assignment`, `Server state has blacklisted jobs`, `server_state_has_blacklisted_jobs`, `com.careem.adma.worker.blacklistreminder.BookingBlacklistReminderWorker`) [O, classes + carve this pass]. → The dispatch system refuses to assign bookings the server has flagged; the client mirrors that filter. Anti-fraud at the *assignment* layer, not the *reporting* layer [I].
5. **Acceptance is tracked and surfaced**: `acceptance_rate` (Acceptance Rate / **نسبة القبول**), `acceptance_only` ("Minimum of %1$d%% acceptance" / **%1$d%% حد أدنى للقبول**) [O]. [I] It is an eligibility signal for shift tiers/guarantees, not an offer gate — nothing in the binary shows an offer being withheld for low acceptance. [U] Where exactly it gates (shift access? promotion? payout?) is server-side policy, not in the artifact.

### 4.4 Accept → arrive → customer PIN → pickup → end trip

State commands (RH pipeline, class list this pass): `UpdateStatusToOnMyWayCommand` / `OnMyWayAction` ("On my way" / **في طريقي للعميل**) → `UpdateStatusToArrivedForPickupCommand` / `ArrivedForPickupAction` / `NotifyArrivedForPickupAction` → customer PIN step → `CompletePickupPassenger` → `OnMyWay` toward drop-off → `UpdateStatusToTripEndedCommand` / `CompleteEndRide` → cash collection report (`CompleteReportCash`) [O].

- **Arrival at pickup requires the customer's PIN** — `arrive_at_pickup_button_text` = **"Enter Customer Pin"** / **أدخل رمز العميل**; arrival confirmation: `UpdateStatusToArrivedForPickupCommand`, `UpdateArrivedForPickupTimeCommand`, `arrive_at_pickup_info` ("Accept offers that are assigned to you" — drivers can receive *new* offers while waiting at pickup), `arrive_at_pickup_pickup_point` (Pickup Point / **نقطة الإنطلاق**), `arrived_at_pickup` (**وصلت إلى موقع الانطلاق**), `arrived_at_customer_location` [O].
- **Airport/parking queues** are a first-class arrival mode: `arrive_at_parking_bottom_sheet_title` ("Waiting in Parking"), `arrive_at_parking_waiting_position_title` ("Your Queue Number:" / **رقم دورك:**), `arrive_at_parking_reminder_text` ("You will be asked to move to staging area when your queue number is %d"), `arrive_at_queue_title` ("Waiting in Staging"), `arrive_at_queue_waiting_area_title` ("Wait at Staging"), `arrived_late_title` ("You have arrived late" / **لقد وصلت متأخرًا**), `arrived_late_description` ("You were removed from the queue for arriving late. Please be on time…") [O]. → The app manages **physical queue position** at airport pickups; late arrival = queue ejection, an entirely different enforcement vector than ride-hail [O/I].
- Food/Quik arrivals add merchant-side steps: `ArriveAtRestaurant`, `ArriveAtCustomer`, `CollectOrder`, `PlaceOrder`, `OrderReadyConfirmationBottomSheetView`, `ScanQrCode`, `VerifyOTPCode`, `ProofOfPickUp`, `ProofOfDelivery` [O].
- Waiting time: `waiting_time` / `waiting_time_left`; `arrived_at_store_confirmation_dialog_*` — arrival is an explicit confirmation with a "Not yet / Yes, arrived" dialog, not GPS-inferred alone (HDL store flow; store arrival uses confirmation dialog, pickup arrival uses PIN) [O].

### 4.5 Decline / timeout / cancellation

- Decline = `offer_reject` ("Reject" / **رفض**) → response sent, no penalty string exists for a *single* reject; penalty materializes as **acceptance_rate erosion** → shift-tier/guarantee consequence [I].
- Assignment timeout = `BookingAssignmentTimedOut*`; the rider-side effect is `dispatch_in_ride_booking_expired` [O].
- Cancellation: `cancel_trip` (Cancel trip / **إلغاء الحجز**), `BookingCancellationProcessed`, `BookingCancelled`, `BookingUnassigned`; post-assignment cash flows: `cash_to_collect_shown_at_the_end` ensures cash UI appears at **trip end**, not before [O].
- [U] Whether declines rate-limit future offers, and how cancellation fees/penalties accrue — server policy, not in artifact.

### 4.6 End of trip → cash collection → shift end

- `EndTripAction` → `UpdateStatusToTripEndedCommandAction` → `OnUpdateStatusToTripEndedAction` → cash collection sub-flow (`OnPrepareCashPaidTripCollectionAction` → `CashPaidTripCollectionAction` → `CompleteCashPaidTripCollectionCommandAction` → `OnCompleteCashPaidTripCollectionAction` / `OnCashPaidTripCollectionFailedAction` / `OnCashPaidTripCollectedAction` → `CashPaidTripCollectionReducer`) [O, class list this pass].
- Collection UI: `TaximeterCashCollectionView`, `FinishButtonView` (metered), `CashTripLayoutView` (standard), `CashReceiptView`, `CashReceiptBreakdownView`, `CashCollectionWarningBottomSheetView`, `CashCollectionLoadingScreenView`, `RateCashTripContainerView` [O].
- **Shift end (booked-shift mode):** `shift_end_dialog_title` = "Your shift is over!" / **انتهت ورديتك!**; `shift_end_dialog_description` = "Thank you for your time, review your shift performance"; `shift_end_dialog_action_button_text` = "View summary" / **عرض الملخص**; `ShiftEndWorker` [O].
- **Trip end is also where `enter_handover_code`** ("Enter handover code", English-only string) would slot in — as documented, no flow was found [U].

---

## 5. CAPTAIN — what the driver sees at end of day (settlement UI)

Inventory (strings + classes, this pass):

1. **Earnings screen** (`earnings_screen` route): Total earnings card (`earnings_total_earnings`, `EarningsLandingScreenView`, `TotalEarningCardView`, `TotalEarningChart`, `TotalEarningEmptyView`), **Breakdown card** (`BreakdownCardView`, `RememberBreakDownIcon/Title/BackgroundPainter` — icon+title+amount per line, `breakdown_*` keys), **bookings list** (`BookingListScreenView`, `StatusFilterCarousel`, `EarningsLandingFlow`), **period selector** (daily/weekly/monthly — `earnings_period_*`), **last transactions** (`LastTransactionsCardView`), **trip receipt** (`TripReceiptScreenView` — per-trip: `EarnedView`, `OrderDetailsView`, `MapCamera`, `PickupDropOffColumn`) [O].
2. **Cash balance card** (`PayCaptainCashBalanceView`, `balance_card_{positive,negative,zero}_title`, `captain_cash_balance_text` = "Captain cash balance" / **رصيد الكابتن النقدي**, `balance_payout_date_text`, `balance_transfer_button_title`) with **blocked state** (`CashBlockBottomSheetView`, `balance_cash_blocked_banner_clicked`, `balance_cash_blocked_bottom_sheet_shown`, `balance_cash_blocked_bottom_sheet_pay_back_clicked|later_clicked`) [O].
3. **Settlement dialogs** (§3.3): settle-now/later, partial amount "between 0 and %s", recurring auto-settle explanation, failure card (`PayRecurringSettleBalanceFailedCardView`), success = services restored + "You just saved %1$s by settling" [O].
4. **Earnings payout** (`TITLE_TOPUP_CAPTAIN_EARNINGS_TRANSFER` = "Careem earnings payout" / **تحصيل مكاسب كريم**, `TOPUP_CAPTAIN_EARNINGS_TRANSFER` = "Earnings received" / **مكاسب مُستلمة**, `pay_earning_transfer_*` = bank transfer flow for instant payout, KYC-gated `kyc_transfer_*` with card credential verification) [O].
5. **Payout configuration**: `PayoutConfigurationModel`, `PayoutConfigurationDetailsModel`, `DisburseAmountDetailsModel`, `CycleCurrency`, `PayoutOptionModel`, `PaymentMethodModel` — a formal **payout cycle/method** subsystem (cycle number in the earnings endpoints) [O, carve/inspect this pass]. [U] Actual cycle length, instant-payout eligibility, fees.
6. **Unverified trips tab** in transactions ("It takes up to 3 working days to verify the trip") [O].
7. **Shift summary** (booked-shift mode): `shift_summary_title` = "Earned %1$s" / **تم الكسب %1$s**, order completion %, guarantee badge ("Guarantee received! 🎉" / "Guarantee not received 😔") [O].

**The end-of-day truth:** the captain sees (a) an *explained* total for the day/week/month, (b) which of it is confirmed vs. **unverified cash**, (c) exactly what must be paid to unblock cash bookings, and (d) two ways to pay (one-off / recurring). There is **no** in-app "hand this envelope to an agent" path in this build [O/U].

---

## 6. CAPTAIN — crash reporting and analytics SDKs embedded, and what they collect

| SDK | Package/evidence | Classes | What it collects (per vendor role + manifest meta) |
|---|---|---|---|
| **Firebase Crashlytics** | manifest `ComponentDiscoveryService` registrar + `libcrashlytics*.so` (4 libs, arm64 split this pass) | (linked, no separate class count — runtime in native libs) | crash stack traces, native tombstones. Google Analytics collection is **disabled** (`firebase_analytics_collection_enabled=false`) [O this pass] |
| **Sentry** | `io.sentry` classes: **0**. Only `com.careem.superapp.core.sentry.SentryBootstrapProvider`, `SentryFeedbackActivity`, `SentryFeedbackForm` (+ `superapp.core.sentry.feedback` package); manifest `io.sentry.auto-init=false` | 4 | crash/error reporting **disabled by default** (auto-init false) but a **user-triggered feedback form** is wired (screenshot + message) [O this pass] |
| **Instabug → "Luciq"** | `ai.luciq.*` (rebranded Instabug) 79 classes; `lib/arm64-v8a/libluciq-native.so`; manifest `ScreenRecordingService` (mediaProjection!), `ScreenshotCaptureService`, `LuciqContentProvider` | 79 | **screen recording + screenshots + bug reports** — user-invoked and proactive reporting; most invasive feedback surface in either app [O this pass] |
| **Sentiance** | `com.sentiance.sdk.*` 355 classes; manifest meta `com.sentiance.sdk.feature.CrashDetectionFeature`, `BootCompletedReceiver`, `ForegroundService` (shortService\|location), geofence/activity-transition/power receivers, `libsentiance_breakpad.so` | 355 | **motion/activity detection, driving detection, crash detection** (automotive-grade driver-safety SDK, used for trip anomaly detection & incident evidence) [O] |
| **Braze** | `com.braze.*` 226 classes; manifest receivers/activities enabled | 226 | engagement/lifecycle messaging; braze HTML in-app bridge; push |
| **Adjust** | `com.adjust.*` 116 classes | 116 | install/ad attribution |
| **Pushy** | `me.pushy.*` **658 classes** | 658 | **a second, complete push pipeline** (pushy.me) — used for background/reliable high-priority push where FCM doze-limits bite (dispatch offers) [I] |
| **Firebase Messaging/Perf/RC** | `com.google.firebase:firebase-{messaging,perf,remote-config,crashlytics-ndk}` registrars in manifest | (counts inside com.google: 1,663 total) | push; perf monitoring; remote config |
| **SendBird** | `com.sendbird.android.*` 47 + `SendBirdFirebaseMessagingService` | 47 | in-app chat with customer |
| **InAppStory** | `com.inappstory.*` **812 classes**; `StoriesActivity`, `StoriesSDKAppTheme`, launch feed | 812 | in-app stories/walkthroughs (onboarding, shift education) [O] |
| **com.snowballtech** | 270 classes; `com.snowballtech.transit.rta.context.TransitContentProvider` (authorities `com.careem.adma.transit`) | 270 | **Dubai RTA transit SDK** — taxi/transit integration for Dubai taxis (meter pairing? taxi permit validation) [I]; [U] exact role |
| **Innovatrics DOT** | `com.innovatrics.*` 60 classes; `libdotc++.so`, `libdotcore.so`, `libdotyuv.so`, `libinnoonnxruntime.so`; manifest property `com.innovatrics.dot.face.REQUIRE_SECURE_ENV=1` | 60 | **on-device face verification** (KYC — selfie vs ID), ONNX runtime, secure env required [O] |
| **ML Kit** | text + barcode + common (manifest registrars) | 7 (named) | OCR/barcode — document scanning & QR scan for orders |
| **Tencent MMKV** | `libmmkv.so` | — | native key-value storage (high-perf booking state) [O] |
| **Uber H3** | `libh3-java.so` (JNA dispatch `libjnidispatch.so`) | — | **Uber's H3 hexagonal geospatial index** — zone/geofence matching for surge & shift zones [O] |
| **PAIRip** | `com.pairip.licensecheck.LicenseActivity` + `libpairipcore.so` | 18 | Google Play license check (integrity) embedded [O] |
| **TensorFlow Lite** | `libtensorflowlite_jni.so` | 12 (org.tensorflow) | on-device ML inference (driver identity/behavior models?) [U/I] |
| **com.careem.analytika** | 24 classes | 24 | Careem internal product analytics |
| **events-ingestor** | `events-ingestor.nc.gw.prod.careem-rh.com` carved (classes10) | — | first-party telemetry ingest endpoint [O] |
| Other | org.xbill (200 — DNS/Java net, inside Sentiance stack [I]), com.amazonaws (290 — AWS SDK, S3 doc/photo uploads), bo.content (196, unidentified [U]), org.junit 872 + androidx.test (test code shipped [O]), `org.jetbrains.androidx.compose.ui.tooling.PreviewActivity` **exported** in release build (same defect as rider) [O this pass] | | |

**Net posture:** the captain app is a superset of the rider's surveillance surface: it adds **motion-based driving detection, crash detection, screen recording, selfie/face verification and a second push stack**. None of it is appropriate for Wind's 50-driver pilot [D].

**What they collect that matters for a cash market:** Sentiance telemetry implies Careem **knows driver motion/route quality independent of GPS pings** (anti-fraud on route deviation & fatigue); Luciq screen recordings imply **support can see what the driver saw**, not what the server logged. If a driver disputes a cash-debt block, the evidence trail is Luciq + Sentiance + ledger [I]. [U] Upload policies for either SDK were not established.

---

## 7. What was re-derived from the Captain artifact this pass (evidence log)

Independent of CAREEM.md §10 (owner of this pass re-verified each):

1. Package/version/SDK: `com.careem.adma` 89.70.2 (89702), minSdk 32, targetSdk 36, compileSdk 37 — `aapt2 dump badging` this pass. **Note: CAREEM.md §10 reported "157.33 MB" for the base APK; actual bytes are 164,971,864 (157.33 MiB) — consistent unit reading, both given.**
2. SHA-256 of base = F5618AFD9E173B8B9A7C4D1D42EE5A6C2E0DEDAF71BA95064DD3FBD9B181C538 (matches `rea` inspection records).
3. arm64 split holds 24 native libs incl. Crashlytics ×4, Innovatrics DOT ×4 + ONNX, H3, TFLite, Sentiance breakpad, Luciq, MMKV — `zipfile` listing this pass.
4. `CashBalanceCaptainModel/Response` structure (BigDecimal balance, Integer warning/blocking limits, derived booleans, server-set) — `rea inspect-android-class` this pass.
5. `CashBalanceApi.getCashBalanceStatus`, `OutstandingBalanceGateway.getCaptainCashBalance` — `rea inspect-android-class` this pass.
6. `CashRequest{ timestamp, latLng, amountCollected: float, objectType }`, `CompleteReportCashStepRequest{ step }` — `rea inspect-android-class` this pass.
7. `EarningsDto`/`EarningsItemDto`/`EarningsItemBreakdownDto` (totalAmount/items{type,amount,breakdown{name,amount}}) and the nine-`double` `Breakdown` + `AggregationModel`/`Overview`/`AggregationByTime`/`BookingItemModel`/`EarningTransactionModel` shapes — `rea inspect-android-class` this pass.
8. Full `breakdown_*` Arabic/English table (§2.1) — from `aapt2 dump resources` captured as raw bytes and decoded UTF-8 this pass (the console/file dump in PowerShell loses Arabic as `?`; the byte-captured file is authoritative).
9. Earnings endpoints `captain/portal/earnings/transaction/{captainId}/{unverifiedTransactions,cycleNumber/{cycle}}`, `captain/{captain_id}/earnings/aggregation-type/{aggregation_type}`, hosts `captain.careemapis.com`, `captain-utility-edge.sandbox.careemapis.com`, `settlement-service.careemapis.com` — DEX string carve this pass.
10. Cash-block copy + analytics events (§3.2) — aapt2 dump + DEX carve this pass.
11. Settlement UX keys incl. partial-amount range error and auto-deduct message (§3.3) — aapt2 dump this pass.
12. Shift/tier/guarantee keys incl. Arabic `book_shift` (حجز الوردية), attendance, nudge workers — aapt2 dump + class list this pass.
13. Offer pipeline actions/commands + `offer_*` copy + anti-fraud blacklist classes — class list + carve + aapt2 dump this pass.
14. Arrival: `arrive_at_pickup_button_text` ("Enter Customer Pin" / أدخل رمز العميل), parking queue keys, `UpdateStatusToArrivedForPickupCommand` — aapt2 dump + class list this pass.
15. SDK census (§6) — manifest parse (`inspect-android-package` XML) + class-list counts + native-lib listing this pass.
16. Rider spot-anchors re-checked: aurora 165/sdui 148 (vs CAREEM.md's 189/169), `OsirisBookingStatusMapper` path, `cashBookingNotAllowedMessage` full Arabic string — this pass.
17. `sdui-activities.core.gw.prod.careem-rh.com` referenced by **both** binaries — rider `careem-urls.txt` line 190; captain `classes3/classes12.dex` this pass.
18. `androidx.compose.ui.tooling.PreviewActivity` exported in release build — manifest this pass (same defect CAREEM.md §11.6 found in the rider).

---

## 8. What Wind's cash and shift implementation must include to be viable in the Palestinian market

Scope assumption: cash-only, Arabic-first, no cards/wallets, intermittent 3G, 50-driver pilot, auditable ledger is a legal requirement (per SOUQ F-06 and Wind's own constraint).

**MUST adopt (mechanism, not copy — and not Careem's exact text; re-word):**

1. **One server-set two-tier cash limit per driver** (`warningX < blockingX`, set server-side, per-driver tunable). Client renders three states: OK → *warning* (persistent home banner + blocking warning dialog with Arabic copy naming the amount to pay) → *blocked-for-cash-jobs* (bottom sheet + banner; **no new job offers until settled**; existing in-flight job may complete). Cache nothing security-relevant locally [Careem §3; Wind adaptation: with no card rail, "blocked" must mean **no dispatch**, not "card-only jobs"].
2. **Partial settlement**: "Enter an amount between 0 and {balance}" — let drivers chip away; a binary "pay everything or nothing" collapses settlement rates in low-income markets.
3. **Auto-settle hook**: outstanding balance auto-deducted from the driver's default payout method once it reaches a threshold (Vodafone Cash/bank transfer in Palestine — this *replaces* Careem's card-charge rail; the mechanism is the schedulable deduction, not the rail).
4. **"Amount settled — services restored"** success state that names what was restored; settlement is a trust-repair moment, not just a receipt.
5. **Per-trip collection entry with [min,max] clamp**: driver enters amount collected (0 allowed); the app refuses trip completion while outside ±a fare band; the delta goes to the ledger, never silently dropped.
6. **Unverified-first cash accounting**: cash trips land in an **"Unverified / غير مُحقق"** bucket visible to the driver, settling to confirmed after reconciliation (target: ≤3 working days), with a "Total unverified balance" figure next to confirmed earnings. The driver must never see *only* an unconfirmed number without the qualifier.
7. **Explained earnings statement**: per line, signed — trip earnings, bonus, tips, guarantee, fines, fines refund, behavior penalties, money in, money out, other, + per-job breakdown lines with names and amounts (the `EarningsItemBreakdownDto{name, amount}` shape). Arabic names already ship in Careem's `breakdown_*` set (§2.1) — equivalent Wind keys, Wind wording.
8. **Period aggregation** daily/weekly/monthly with a **zero/empty state designed** ("Shift schedule coming soon!" equivalent — Wind will see empty weeks).
9. **Go-online preconditions**: GPS mandatory to go online (refuse otherwise, with a named, actionable Arabic error). Bluetooth-merchant-proximity detection is optional infrastructure — do not gate go-online on it.
10. **Typed trip-failure reasons** (`CUSTOMER_REFUSED`, `CUSTOMER_UNREACHABLE`, `CUSTOMER_DID_NOT_PAY`, …) — a cash app must distinguish "no one home" from "customer wouldn't pay"; Careem's `VerifyOTPCode`/`ProofOfDelivery` analog for delivery + SOUQ's typed enum both point here.
11. **Arrival confirmation split by mode**: explicit "Yes, arrived" dialog for store mode; **customer-held PIN at pickup** for door mode (mirror of Wind's delivery code).
12. **Offline-first writes** (Wind's standing constraint): the collection report must enqueue with `idempotencyKey` + `queueAs` label (Souq's pattern, applicable here because Careem's own unverified model implies the server tolerates late/dupe report handling — do not assume; enforce client-side idempotency).
13. **Append-only cash ledger, attributed corrections** (Souq A2): nothing edited; a correction is a new entry with a reason string; driver cannot mark own cash "received"; only admin counts and closes.
14. **Refusal/block copy in Arabic for every cash state** (block banner, warning, bottom sheet promise "no more cash bookings", settle success, retention restore) — Careem's Arabic is the *shape* to study; Wind must ship its own vetted wording [I].

**MUST NOT adopt:**
- Acceptance-rate gating (pilot supply is too scarce to throttle its own offers).
- Tiered shift booking/Bronze-Silver-Gold/guarantee engine (no density; legal/labor classification implications of "attendance" for gig drivers; cost unaffordable).
- Sentiance-style motion/crash SDK, Luciq screen/audio recording, face-KYC liveness, H3 geofencing (until zones matter), second push stack (Pushy) — one FCM pipeline is enough.
- The wallet/Careem-Pay/outstanding-balance stack (`com.careem.pay` is 1,872 classes — an entire fintech; Wind is cash-only and needs a licensed rail only for settlement out).
- "Enterprise" pressure mechanics (auto-assigned shifts with ✅ notifications) — behaviorally coercive and regulator-visible in a new market.

**MECHANISM Wind is still missing after this study (answer to the key question):** Careem proves the full two-sided cash loop exists at production scale in MENA — but it runs on **server-set limits + card-charge settlement + Careem Pay rails + ops tooling we cannot see**. Wind's viable subset is: **server-set two-tier block, partial settlement, recurring auto-deduct via the driver's payout rail (Vodafone Cash/bank), unverified-then-confirmed ledger, explained per-job statement, GPS-gated go-online, PIN-at-pickup.** Everything else is either Palestine-inapplicable (banking rails) or pilot-hostile (gating).

---

## 9. Explicitly NOT established by this study (do not let anyone paper over)

1. **All server-side behavior.** How `warningCashLimit`/`blockingCashLimit` are computed, whether they vary by tenure/market/debt velocity, whether the block lifts instantly on settlement or after the 3-day unverified window, whether card bookings are offered at full rate during a cash block, and whether any of it applies in **Palestine**. Zero network traffic was observed; all enforcement copy claims "bookings" blocked because the copy says so, not because we watched dispatch obey it.
2. **Wire format of `report-cash`**: exact endpoint path and payload field names beyond `timestamp/latLng/amountCollected/objectType` (likely `POST …/report-cash` on `captain.careemapis.com` — **not verified**; the `CompleteReportCash` command is what proves the step exists).
3. **EarningTypeDto values, Breakdown wire keys** (kotlinx obfuscation; no schema recovered).
4. **Actual cycle length** of an earnings "cycle" (`cycleNumber/{cycle}` exists; duration unknown) and payout/instant-payout fees.
5. **Pushy vs FCM division of labour** for offers (both present; which carries dispatch offers at what priority is unknown).
6. **Sentiance's exact retention/upload policy** and whether crash-detection forces shorter incident response SLAs with ops.
7. **Whether the metered-taxi (Dubai taxi captain) flow is gated by city/RTA permit** — the TransitContentProvider strongly implies yes; how is unknown.
8. **Instabug/Luciq upload conditions** (opt-in vs always-on) — only that the services and content providers are declared exported=false/init-order-2047483644 (i.e., early).
9. **Address SDUI flag `MapAndAddress_*` requiredness per market** — the server owns it; the strict "Address not usable" validator exists alongside the pin/photo flow and we cannot say which market gets which.
10. **Rider Aurora count discrepancy** (148 vs 169 sdui) — extraction-scope difference between the two inventories; neither run was re-baselined this pass; treat 169 (CAREEM.md §3) as the figure to cite, 148 as a lower bound.
11. **`enter_handover_code`** — orphan string, **no handover flow found**; do not cite it as a feature.
12. **Compose `PreviewActivity` exported** — present in release (both apps). Release-hygiene defect, not a pattern.
13. **Unit inconsistency** (double in earnings models vs BigDecimal in cash-limit model) — observed, unexplained; do not "fix" by assumption, it is evidence of organic growth, and its lesson is simply: *Wind must pick one money representation.*
14. **`com.snowballtech` 270 classes** — Dubai RTA transit SDK presence is clear; its exact role (permit validation? taxi e-hail feed? transit data?) is **not established**.
15. **`bo.content` 196 classes, `com.amazonaws` 290 classes** — identities unconfirmed (likely AWS SDK S3/Kinesis for document upload and ingestion) [U].
16. **Crashlytics enablement** — native libs + manifest registrars prove *presence*; whether crashlytics collection is runtime-enabled is not established (Firebase Analytics collection is explicitly disabled; that is the only hard flag we have).

---

## 10. Reproduction notes

```powershell
$env:REA_JADX_MCP_JAR="$env:USERPROFILE\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:JAVA_HOME="C:\Users\osama\scoop\apps\temurin17-jdk\current"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:REA_JADX_HEAP_MIB="8192"; $env:REA_JADX_OPERATION_TIMEOUT_MS="900000"
rea inspect-android-package <apk> --format json --full-output
rea inspect-android-class   <apk> <class> --format json --full-output   # every class cited in §§2–6
# resource strings (aapt2 substitute for absent apktool), captured as BYTES then decoded UTF-8:
python -c "import subprocess,os; out=subprocess.run([os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\build-tools\36.1.0\aapt2.exe'),'dump','resources',r'<apk>'],capture_output=True); open('adma-res-utf8.txt','wb').write(out.stdout)"
# DEX plaintext carving for endpoint paths / telemetry constants (printable ASCII runs):
python carve.py <apk> <pattern> [maxlen]      # writes class-of-origin + matched string
```
Rider strings: `acma-res-utf8.txt` in `rea-captain\` (canonical UTF-8); the two `careem-urls.txt` / `haat-urls.txt` pre-extracted lists were read as instructed (endpoint inventory §5 of the brief); captain endpoint paths were carved independently from this build's DEX files (§2.3, §3), not taken from the rider's list.
Class list used for census tables: `%TEMP%\opencode\careem-feature-research\captain-all-class-names.txt` (60,549 lines, one class per line).
No proprietary code, assets or iconography were copied into this repository; all quoted identifiers are short keys/class names used as evidence, consistent with the discipline in PALESTINIAN-COMPETITORS-INDEX.md §6.

---

## Appendix A — Captain manifest findings that matter (this pass)

- `io.sentry.auto-init=false`; `com.careem.superapp.core.sentry.feedback.SentryFeedbackActivity` themed `Theme.SentryFeedback.Overlay` [O].
- `firebase_analytics_collection_enabled=false`; default notification channel = `@string/ride_notification_channel_id` [O].
- `SuperMessagingService` (FCM) + `SuperHuaweiMessagingService` **disabled** (Huawei push present but off) + `SendBirdFirebaseMessagingService` [O].
- Permissions beyond a courier's need: `RECORD_AUDIO`, `READ_CONTACTS`, `DISABLE_KEYGUARD`, `BLUETOOTH_ADVERTISE/SCAN/CONNECT`, `HIGH_SAMPLING_RATE_SENSORS`, `DETECT_SCREEN_CAPTURE`, `USE_BIOMETRIC`, `AD_ID`, `ACCESS_BACKGROUND_LOCATION`, `ACTIVITY_RECOGNITION`, `CALL_PHONE` [O].
- Exported release components that should not ship: `androidx.compose.ui.tooling.PreviewActivity`, `org.jetbrains.androidx.compose.ui.tooling.PreviewActivity`, `androidx.test.core.app.InstrumentationActivityInvoker.{BootstrapActivity,EmptyActivity,EmptyFloatingActivity}` (all exported=true) [O].
- `android:usesCleartextTraffic` not asserted in what we captured → treat as platform default; the rider explicitly sets `false` (CAREEM.md §11.6) — the pair is inconsistent [O].
