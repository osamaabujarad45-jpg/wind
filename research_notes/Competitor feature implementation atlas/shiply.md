# Shiply Palestine — feature implementation atlas (for Wind)

**Topic:** how `com.shiplypalestinemobileapp` 1.8530 (versionCode 310) implements its parcel/logistics-platform features, and what Wind (cash-only parcel/ride/freight, Palestinian market) should learn — and refuse to copy.
**Date:** 2026-11-13 · **Method:** static reading of the public Play-distributed APK set only. No host was contacted, no credentials used, no execution, no circumvention. Only short identifiers/strings are quoted as evidence; no code or assets are copied.
**Inputs:** `shiply__base.apk` (87,463,616 B), `shiply__split_config.ar.apk` (57,753 B), `shiply__split_config.arm64_v8a.apk`, `shiply__split_config.xxhdpi.apk`
**Builds on:** `research_notes/REA-2026-11-13-reference-apps/SHIPLY.md` (prior study, 13 Nov 2026) and `PALESTINIAN-COMPETITORS-INDEX.md` (S-/A-/D-class tables). Where this pass contradicts SHIPLY.md, this pass wins and the correction is called out.

## Labels and anchors

- **[O]** — observed this session, with a tool anchor. `bundle@<offset>` = offset into the **decoded UTF-8 text** of `assets/index.android.bundle` (10,781,466 chars, 1,267,024 replacement chars ≈ 11.7 %; the file is Metro bytecode whose module sources are stored as minified JS text — head bytes `c6 1f bc 03 c1 03 19 1f 62 00 00 00`). SHIPLY.md used raw-byte offsets from the same file, so offsets differ by a small delta. `manifest` = `AndroidManifest.xml` via `rea inspect-android-package` / raw text in tool output. `app.config` / `app.manifest` = Expo config/update assets extracted from the APK. `aapt2` = `aapt2 dump strings` on the AR split.
- **[I]** — inference from [O] evidence; reasoning shown, confidence stated.
- **[U]** — unknown from this artifact set.
- **[D]** — from the prior SHIPLY.md study, **not** re-verified this pass.

## Re-derived this pass (20 concrete claims)

| # | Claim | Anchor |
|---|---|---|
| 1 | Bundle is Metro bytecode, not text/Hermes: head `c6 1f bc 03 c1 03 19 1f 62` | `bundle@0x0` (read 16 bytes) |
| 2 | 136 **unique** route literals matching `/\((app\|auth)\)/[A-Za-z0-9_\-/\[\]\.]+\.js` (vs 175 non-deduped candidates in SHIPLY.md) | regex over `bundle.txt` |
| 3 | Route histogram: parcels 19, settings 18, products-catalog 15, wallet 13, tickets 9, reports 6, employees 5 | regex + group-by |
| 4 | `parcelStatusColor.Pending` @1278046 · `.Delivered` @1083292 · `.Returned` @1304933 · `.Submitted` @1372599 · `.OnTheWay` @1221279 · `.Draft` @1220690 · `-finished` @1740138 · `-replaced` @2020391 · `-postponed` @2009858 | `bundle@…` |
| 5 | `parcelStatusColor-attempttodeliver_three_step` @1076911 (glued to neighbour token; three-step delivery-attempt sub-state) | `bundle@1076911` |
| 6 | Terminal status set: `final_parcel_status_ids` @2170025, `final_status_id` @2170048 | `bundle@2170025/2170048` |
| 7 | CSV export header: `Creator name,Creation date,Type,Recipient Phone,Recipient Name,City,Village,Street,QR,deliveredByUser,returnedDate,` | `bundle@930617` |
| 8 | JAYEEK activation prompt: `Same-day delivery is available for this parcel. Do you want to activate JAYEEK?` | `bundle@1269475` |
| 9 | JAYEEK bundle: `JAYEEK Service Quality` + `JAYEEK is Activated.` + `JAYEEK not available for planned dates` | `bundle@1372528` |
| 10 | `same_day_cannot_revert_parcel` | `bundle@1313789` |
| 11 | `Error sending. Event queued.` | `bundle@1260965` |
| 12 | `is_payment_parcel` | `bundle@2021885` |
| 13 | `/customer/checkout/save-paymentCard` in the checkout URL cluster | `bundle@1157932` |
| 14 | `/users/agree-to-cover-visa-commission` | `bundle@1163600` |
| 15 | `/parcels/findByQRCode` | `bundle@1161277` |
| 16 | `changeParcelStatusPositionDriver` | `bundle@932179` and `@1282396` |
| 17 | `scan-parcel-qr` route literal | `bundle@1109828` |
| 18 | `/parcels/financial-differences` route @1108398, `wallet-debts-details` @1120829, `wallet-holds-details` @1121485 | `bundle@…` |
| 19 | Team reverse-domains disagree: Android `com.shiplypalestinemobileapp` (manifest) vs iOS `com.shiplypalestine.shiplypalestine` (`app.config`) vs Expo owner `shiplydev`, EAS project `020aa5af-efc8-4d27-bb01-a6660826eb4e`, slug `shiplypalestine`, scheme `shiply` | manifest + `app.config` |
| 20 | AR split contains 354 strings, **zero** Arabic product copy (0 hits for شيبلي/طرد/توصيل/استلام/دفع) — Arabic UI strings are framework-only; product copy is English-inline in JS + server-delivered locales | `aapt2 dump strings` on AR split |

Corrections to SHIPLY.md from this pass:
- `com.google.firebase.messaging.default_notification_channel_id` is an **empty string** (`android:value=""`), not `@None`; the auto-init flag is named `firebase_messaging_auto_init_enabled` (value `true`), and delegation is `firebase_messaging_notification_delegation_enabled=false` — not `messaging.*` names.
- `/platform/users/${id}/approve` could **not** be re-derived as a literal anywhere in this bundle ([U], see §6); SHIPLY.md's claim stays [D].
- Route count: 136 unique `.js` routes. SHIPLY.md's 175 "candidates" are not reproducible as unique literals.
- `IsIdentityBlockingParcelCreation` not re-found; treat as [D].

---

## 1. Parcel domain model (routes + status enum)

### Observed mechanism
- The whole app tree is embedded in the Metro bundle as expo-router routes. **136 unique `.js` route literals**, histogram in claim 3. Top-level groups: `/(auth)/…` (login, register, guest-parcel, on-boarding, verify-account, map-location) and `/(app)/…` (home, create-parcel, create-parcel-one-page, parcels, wallet, bank-accounts, invoices, invoices-report, tickets, reports, settings, store, products-catalog, employees, salesmen, contacts, recipient, identity-verification, compensations, returns, promotion-details, notifications, feedback) — [O] `bundle` regex.
- Platform is a **business parcel platform**, not a consumer courier: recipient search/filters/favourites (`/recipient-search-*`), content details per parcel (`add-edit-content-details`), recycle bin (`/parcels/recycle-bin/index`, "Deleted parcels are stored for 7 days" [D]), parcel image viewer, parcel drafts (`createParcelDraft` [D]).
- **Three-axis state model** [O for tokens, I for structure]:
  - `status`: `Draft → Submitted → Pending → OnTheWay → Delivered`, side branches `Returned`, `Resolved`, `Postponed`, `Replaced`, `Finished` — `bundle@…` claim 4. The `-1/-2/-3` suffixes (`delivered_1..3`, `returned_1..3`, `pending_1/2`, as `assignment-returned_1/2`) indicate the same state at **attempt number** granularity.
  - **attempt axis**: `attempttodeliver_three_step` [O] `bundle@1076911` — a parcel can go through a three-step attempt-to-deliver sub-flow without changing its top-level status.
  - **terminal axis**: `final_parcel_status_ids` / `final_status_id` [O] `bundle@2170025/2170048` — a separate concept: which statuses close the parcel.
- `changeParcelStatusPositionDriver` (×2 sites) [O] `bundle@932179`, `@1282396` — a driver-position transition function. `Driver Notes must be at least 10 characters long` [D].
- Cancel: `Cancel Parcel Submission` [O] `bundle@1154427`; unverified exact flow.
- "The delivery window has passed, but your parcel can still be picked up today. Delivery will happen tomorrow." [D] — scheduled/windowed delivery is a first-class parcel concept.

### Anchor
`rea search-android-classes …` not required; routes are literals. Re-derivation: `Select-String`-equivalent regex over `bundle.txt`; tokens above. CSV export (F-7) cross-confirms the parcel fields: creation date, type, recipient phone/name, City/Village/Street, QR, deliveredByUser, returnedDate — [O] `bundle@930617`.

### How Wind implements this correctly
- Model **status × attempt-step × terminal-set** as three orthogonal columns on the parcel table; never encode a terminal flag as another status. Attempts: `attempt_no` (1..3) + `attempt_outcome` enum; terminal = boolean-ish `closed_at` + reference to the closing status id.
- Status vocabulary Wind actually needs (copy the *shape*, not the tokens): `draft, submitted, picked_up, on_the_way, attempt_1/2/3, delivered, returned, cancelled` with typed failure reasons per attempt (cf. Souq Tulkarm's 9 typed reasons, INDEX A4).
- Route-level parity: Wind's Expo Router tree needs `/parcels/[id]/info`, `/parcels/[id]/attempt`, `/parcels/create`, `/parcels/scan` — Shiply's `/scan-parcel-qr` screen shows QR scanning is the driver verb.

### What not to copy
- The **status token sprawl** (20+ `parcelStatusColor-*` keys with `_1/_2/_3` copies) is a maintenance smell — one source of truth enum, derive display variants. S-class: none directly, but violates index "one writer per file / smallest complete change" spirit.
- Do not expose `/(auth)/guest-parcel` (ghost/unauthenticated parcel creation) without an abuse policy — guest ordering is an open invitation to fraud; INDEX D-class gate applies.

---

## 2. Payment: COD plus card (`is_payment_parcel`, `/customer/checkout/save-paymentCard`)

### Observed mechanism
- Parcel carries a user-selectable **order type**: "Pay / Buy / Return / Replace" — exact copy: "You can change order type to Pay from the select box at the top of this page" (×3 variants incl. "parcel details section"); "…to Buy/Return…", "…to Replace…" [O] `bundle@1505765`, `@1506661`, `@1506451`, `@1260871`, `@1509067`, `@1065668`.
- `is_payment_parcel` — a parcel flagged as requiring payment [O] `bundle@2021885`.
- Card checkout is a first-class step: `/customer/checkout/save-address`, `save-orderBy`, **`save-paymentCard`**, `save-shipping` [O] `bundle@1157932` (URL cluster). `shiply_store.please_select_payment_method` [D].
- Shiply charges a **card commission the sender opts into**: `/users/agree-to-cover-visa-commission` [O] `bundle@1163600`; route `/app/settings/enable-visa-commision` (note the consistent transliteration typo) [O] `bundle@1115939` region; `enable_visa_commision` i18n key [O] `bundle@1304723` region; `cent_commission_value` / `_commission_value` [O] `bundle@1116469` region.
- i18n: `shiply_store.no_payment_methods_found` [O] `bundle@1157741` region.

### Anchor
Section strings above; `save-paymentCard` exact path appears once, as a literal in the checkout module's URL table (`bundle@1157932`).

### How Wind implements this correctly
- Wind is **cash-only by constraint**: adopt the **order-type axis** (`send_only / send_collect / collect_only / return`) but hard-wire `payment_method = cash` and render the other methods as "not available in Palestine — cash only" or not at all.
- Keep `is_payment_parcel`-equivalent as a **server-authoritative boolean** driving COD flows (driver reminders, ledger posting), never a UI toggle alone.

### What not to copy
- **S1** (INDEX): `/customer/checkout/save-paymentCard` and the entire visa-commission opt-in (`enable-visa-commision`, `/users/agree-to-cover-visa-commission`). Wind must not ship card rails or a commission contract it does not want. **Do not copy the typo verbatim either** — and definitely not the pattern of shipping opt-in fine print inside Settings.
- Do not copy the ambiguity of "Pay" meaning both "COD" and "card" — Wind's single method should be explicit (`cash_on_delivery`).

---

## 3. Financial reconciliation module

### Observed mechanism
- Reconciliation vocabulary reuses one delta shape everywhere money can disagree with paperwork: **amount due → collected → difference → debt/hold → invoice** [I, strong].
- Routes: `/(app)/parcels/financial-differences`, `/(app)/invoices/financial-differences`, `/(app)/returns/financial-differences`, `/(app)/wallet/{wallet-debts-details, wallet-holds-details, wallet-deposit, wallet-withdrawal, wallet-transactions, wallet-summary, request-confirmation}`, `/(app)/bank-accounts/*` [O] `bundle@1108398` (parcels financial-differences), `@1120829` (debts), `@1121485` (holds), route list from regex histogram (wallet 13, bank-accounts 4).
- Bundle keys: `financial_differences_related_to_this_parcel` [O] `bundle@1740100`; `total_delivery_costs` [O] `bundle@1974174`; `show_current_debts`, `show_invoice_parcels`, `show_negative_parcels`, `cent_commission_value`, `wallet_transaction_requests`, `wallet_transaction_requests_types` [D].
- API: `GET /customer-invoices/current-amount` (running balance) [D]; `/customerInvoices/{addInvoiceException,create,find,getCustomerInvoiceExceptions,printInvoice,regenerateInvoiceCode,…}` and `/customer-invoices/{statuses,types,current-amount}` [O] via URL cluster `bundle@1153447` region.
- `-finished-delivered_2`, `-finished-returned_3` compound status keys [O] `bundle@1740138` region — closed parcels still carry money state.
- Invoice exception flow exists (`addInvoiceException`, `getInvoiceExceptionTypes/Statuses`) [O] URL cluster @1157932 region — i.e. disputes against invoices are typed, not free text [I].

### Anchor
`bundle@1108398, @1120829, @1121485, @1740100, @1974174`; route histogram.

### How Wind implements this correctly
- Same ledger shape Souq Tulkarm validated (INDEX A2/A11): **integer cents, shekels display**, `amount_due`, `amount_collected`, `discrepancy_reason`, on every cash-touching object (parcel, return, invoice, shift handover).
- Append-only ledger + a **differences queue** a human finance role works through; corrections are new entries with reasons, never edits.
- Reuse the vocabulary verbatim as i18n keys (Arabic: الفرق/المديونية — write Wind's own copy).

### What not to copy
- The **wallet** (deposits/withdrawals to bank accounts, `add-bank-account`) is a stored-value feature — regulatory surface Wind does not need. S3-adjacent (business surface doubling). Ship the difference queue, not the wallet.
- `regenerateInvoiceCode` implies invoice mutation semantics Wind's append-only ledger forbids; fix by issuing void+reissue pairs instead.
- Do not expose `financial-differences` on returns to end customers without role-gating — in Shiply it exists as a route; whether it's role-gated is [U].

---

## 4. QR / barcode as parcel identity

### Observed mechanism
- Native: ML Kit barcode scanning is bundled — `GmsBarcodeScanningDelegateActivity` (non-exported) [O] manifest; `com.google.mlkit.vision.DEPENDENCIES=barcode_ui` [O] manifest; `com.google.firebase.mlkit.vision.barcode.internal.BarcodeRegistrar` [O] manifest `ComponentDiscoveryService`; three bundled models: `assets/mlkit_barcode_models/barcode_ssd_mobilenet_v1_dmp25_quant.tflite` (390,456 B), `oned_auto_regressor_mobile.tflite` (213,880 B), `oned_feature_extractor_mobile.tflite` (276,552 B) [O] ZIP listing.
- Routes: `/(app)/parcels/scan-parcel-qr` [O] `bundle@1109828`; `/(app)/parcels/qr` (+ `/parcels/qr` API-style path) [D].
- API: `/parcels/findByQRCode` [O] `bundle@1161277`; `/parcels/qr`, `/parcels/scan-parcel-qr` [D/O].
- Copy: `scanned_invalid_Q` [O] `bundle@1024108`; `qr_updated_successfully` [D]; `parcel_status[0|1|[]]` triple vocabulary for scan results [D].
- The CSV export includes a `QR` column — the parcel identity survives export [O] `bundle@930617`.
- Scan is the driver verb: it sits next to `changeParcelStatusPositionDriver` in the bundle [O] `@932179` region.

### Anchor
`bundle@1161277, @1109828, @1024108, @930617`; manifest meta-data + ComponentDiscoveryService; ZIP entry listing.

### How Wind implements this correctly
- Parcel identity = opaque QR token (random ≥128-bit, hashed at rest), printed on the label; driver scans to advance custody; customer shows QR/code to close delivery (Souq's deliveryCode+deliveryQrToken pattern, INDEX A3).
- Bundle the small on-device models only if offline scanning is required; otherwise use **ML Kit via Google Play services** (Shiply already depends on GMS) — but gate on GMS availability per handset.
- `findByQRCode` → Wind: `GET /parcels/lookup?qr=…` returning minimal parcel + custody state; never PII in the scan response.

### What not to copy
- Do not copy the QR as the **only** close-proof without souq-style lockout + audited admin reset (INDEX D10). Pair with a short customer-held code.
- Do not copy bundled TFLite models blindly — Shiply hosts them for offline certainty; Wind should first measure whether Play-services ML Kit is enough (saves ~880 KB and model-update burden).
- Never let the QR encode name/address/amount (Souq's own UI states the code carries none — adopt that explicitly).

---

## 5. Fleet verification (`/platform/users/{id}/approve`, employees/salesmen/vendor mgmt, B2B catalogue)

### Observed mechanism
- Employee management in-app: routes `/(app)/employees/{index,create-employee,edit-employee,change-employee-password}` [O] `bundle@1106028/1106346/1106445/1106133`.
- Salesmen: routes `/(app)/salesmen/index` (+ search) [O] `bundle@946504/1114790`; API-prefix `salesmen` hits ×6.
- Vendor mgmt: routes `/(app)/products-catalog/{create-vendor,vendor-status-check,all-products,categories,category-products,create-update-product,inventory-sources,inventory-sources-products,manage-product-inventory-sources,activate-categories}` — **15 products-catalog routes**, histogram [O] route regex.
- Vendor approval copy: `Vendor account approved successfully!` [O] `bundle@1039327` region; `Vendor account already exists` [O] `bundle@1616879`; `vendor-status-check` route in the **drawer** nav (`/(app)/(drawer)/products-catalog/vendor-status-check.js`) [O] `bundle@980092`, `@1112228`.
- `/platform/users/${id}/approve`: **not re-derivable as a literal** in this bundle — likely template-constructed or server-named differently; keep as [D] from SHIPLY.md (`/platform/users?q=`, `/platform/users/{id}/approve`). Treat as the shape of an **approval webhook/endpoint**, not fact.
- B2B store: `/(app)/store/{cart,checkout,orders,product-details}` + `/customer/cart/add|update`, `/customer/shiply/cart`, `/customer/orders` [O] URL cluster `bundle@1157741` region; `is_payment_parcel` reused here.
- Identity verification as a gate: routes `/(app)/identity-verification/index`, i18n `identity_verification.approved_title/message` [O] `bundle@1968585`, `@1347553` — approval precedes functionality [I].

### Anchor
Route list + `bundle@980092, @1112228, @1039327, @1616879`; employees block `bundle@1106028–1106451`.

### How Wind implements this correctly
- Fleet = **three roles** (driver/courier/salesman) with a single `fleet_users` table, `kyc_status: pending|approved|rejected`, audited `approved_by/at`. Admin approves in a console; the app only reflects state.
- Salesmen as **order-origination agents** (field sales capturing parcels) is genuinely useful in Palestine where B2B order capture happens on the street — model as "agent-created parcel" with attribution, not as employees with full admin.
- Vendor/B2B catalogue: do **not** build now (see below). If later, reuse parcel primitives (order, ledger, QR) for vendor drops.

### What not to copy
- **S3** (INDEX): catalogue + vendors + store/cart/checkout + employees + salesmen surface — doubles product surface, different business.
- Do not embed a **vendor-status-check** screen visible to unvetted users in the drawer nav; gate fleet screens server-side by role and review state.
- Do not copy client-side approval (`identity_verification.approved_*` rendered without server challenge) — approval must be a server decision echoed to the client.

---

## 6. JAYEEK same-day service (activation, non-reversibility, price & dates)

### Observed mechanism
- Activation flow: "Same-day delivery is available for this parcel. Do you want to activate JAYEEK?" [O] `bundle@1269475`; "JAYEEK Service Quality" [O] `bundle@1372528` region; "JAYEEK is Activated." [O] `@1372550`; "JAYEEK is available for your parcel" [O] `@1372570`; "JAYEEK not available for planned dates" [O] `@1372638`.
- **Non-reversible once committed**: `same_day_cannot_revert_parcel` [O] `bundle@1313789`; "Are you sure you want to remove JAYEEK service?" / "Are you sure you want to remove JAYEEK?" [D]; "Keep same-day delivery" [D]; "Disable JAYEEK service" [O] `bundle@1039129`.
- Promotion entry: "User tapped create Jayeek parcel from same-day promotion modal" [O] `bundle@1614592`; "JayeekParcels" route/i18n `show_jayeek_parcels` / `showJayeekParcels` [O] `bundle@1108841`, `@1117934`; assets `customerJayeekSplash1/2.jpg` [O] `bundle@1152602`, `@1158566`.
- Save path: `save_same_day_parcel` [O] `bundle@1539604`; `same_day_delivery` key [O] `bundle@1079511`; `same_day_jayeek_subtitles_` [D]; `JAYEEK_PARCEL` key [O] `bundle@1565839`.
- Price: **not statically visible** — no price constant, fee key, or amount literal for JAYEEK appears in the bundle; it is server-driven ("JAYEEK not available for planned dates" implies server-side date capacity checks) [I] + [U] for the actual price mechanism.
- "Service level as attribute, not order type" [I] — consistent with A12 (INDEX).

### Anchor
`bundle@1269475, @1372528, @1313789, @1539604, @1108841, @1117934, @1039129`.

### How Wind implements this correctly
- Model as `parcel.service_level = standard | same_day` (extendable enum), chosen at creation or via an upgrade prompt pre-pickup; server checks same-day capacity per date/zone and returns eligible/fee — mirror "not available for planned dates".
- **Reversibility rule Wind should actually ship**: allow cancel of same-day upgrade **only until cutoff hour**, then it becomes non-reversible with a visible fee consequence. Never ship Shiply's hard `same_day_cannot_revert_parcel` without a compensation path (S12-adjacent, INDEX D12 gate: ≥2 contracted carriers + settlement/SLA/liability modelled as a parcel attribute before building).

### What not to copy
- Non-reversible activation without compensation (D12 gate, INDEX).
- Bundled branded splash assets (`customerJayeekSplash*.jpg`) — that's Shiply/JAYEEK's brand, not Wind's. Omit.
- Promotion-modal growth hack ("create Jayeek parcel from same-day promotion modal") before Wind has a same-day supply plan — pushes unfulfillable promises.

---

## 7. Address model (City + Village + Street; no street numbers)

### Observed mechanism
- CSV export header (the canonical parcel address triple, literal): `Creator name,Creation date,Type,Recipient Phone,Recipient Name,City,Village,Street,QR,deliveredByUser,returnedDate, ` — [O] `bundle@930617`.
- API: `getCitiesAndVillages` [O] `bundle@1154403`, `@1219758`; `villageID` [O] `bundle@1158074`; `error_getting_cities` [D]; `/customer/address`, `/customer/checkout/save-address` [O] URL cluster `bundle@1157741` region; `/driver-details/address/editUserAddress` [D].
- Strings: `unable_save_checkout_address_street_name` [D]; `additional-name`, `additional_phone_number_detected`, `address_type`, `cant-change-address_type` [O] `bundle@2096377`, `@2096392`, `@2096436` — one primary recipient + additional recipients; address **type fixed at creation**.
- **No street-number/building-apartment field anywhere** [O — absence search]; Palestinian municipal reality: city → village/neighbourhood → street name is enough; couriers navigate by landmark and phone.
- Saved addresses: routes `/(app)/recipient/add-favourite-recipient`, `/(app)/contacts/*`, `edit-favourite-recipient` on both create flows [O] route list.
- Map picker exists but thin: `/(auth)/register/map-location` [O] route list — registration-time only, not per-parcel [I].

### Anchor
`bundle@930617, @1154403, @1158074, @1219758, @2096377–@2096436`; route histogram.

### How Wind implements this correctly
- **City (structured, required) → Village/neighbourhood (structured, required) → Street (free text, required, ≥5 chars) → Landmark (free text, optional) → Label + isDefault** — Shiply's triple **union** Souq Tulkarm's landmark field (INDEX A1). No house numbers, ever.
- Server stores `city_id`, `village_id` FKs + free-text street; phone is the actual locator — enforce "recipient phone reachable" as part of the address deliverability check.
- Additional recipients: one primary + N alternates with the "additional phone detected" pattern — useful when courier can't reach the main number.

### What not to copy
- Nothing structurally harmful — the main anti-pattern to avoid is **adding a street-number field anyway** (every Palestinian-market study so far shows it fails deliverability).
- Do not make `address_type` immutable if Wind supports freight vs parcel — make type explicit but editable until first pickup attempt (Shiply's `cant-change-address_type` [O] `bundle@2096436` region is a UX dead-end).

---

## 8. Notifications (Notifee per-channel; FCM auto-init off; data-only)

### Observed mechanism (with correction)
- Manifest meta-data: `firebase_messaging_auto_init_enabled=true` (FCM **is** auto-initialised), **`firebase_messaging_notification_delegation_enabled=false`**, **`com.google.firebase.messaging.default_notification_channel_id=""`** (empty string — SHIPLY.md said `@None`; correction), `default_notification_color=@color/white` [O] manifest raw text.
- Meaning: Android has **no default channel** and **no delegation** ⇒ any FCM `notification` payload has nowhere to land; the app must handle **data messages** and render via Notifee itself with explicit channel IDs [I, high confidence].
- Notifee is deeply integrated: `app.notifee.core.{NotificationReceiverActivity (exported), ForegroundService (foregroundServiceType=shortService), ReceiverService, RebootBroadcastReceiver, NotificationAlarmReceiver, BlockStateBroadcastReceiver, AlarmPermissionBroadcastReceiver}`; `io.invertase.notifee.NotifeeInitProvider` with auth `com.shiplypalestinemobileapp.notifee-init-provider` [O] manifest.
- Bundle API surface: `notifee.createChannel`, `createChannels`, `createChannelGroups`, `deleteChannel`, `getChannel`, `isChannelCreated`, `isChannelBlocked`, `displayNotification`, `createTriggerNotification`, `cancelTriggerNotification`, `openNotificationSettings`, `onBackgroundEvent`, `registerForegroundService`, `setNotificationCategories` [O] e.g. `bundle@1008560` (createChannel), `@2005059/@2005138` (createChannels/…Groups), `@1352764` (isChannelBlocked).
- The channel **IDs are constructed at runtime, not literals** — only API-schema error strings appear; the `notification.android.*` schema catalogue (actions/style/tag/asForegroundService/chronometerDirection/ticker/category/timeoutAfter/inputHistory/largeIcon) is embedded [O] `bundle@1108700–1117000` region.
- Local config plugin `./withNotifeeAndroidFix` [O] `app.config` plugins — they had to patch Notifee's manifest fit on modern Android; BOOT_COMPLETED re-arm is handled (notifee receivers declare BOOT_COMPLETED, not exported publicly).
- Expo Updates enabled: `CHECK_ON_LAUNCH=ALWAYS`, `EXPO_UPDATE_URL=https://u.expo.dev/020aa5af-…`, channel `production-expo-upgrade` [O] manifest.
- FCM receiver: invertase `ReactNativeFirebaseMessagingReceiver` exported with SEND permission; `FirebaseInstanceIdReceiver` [O] manifest.

### Anchor
`rea inspect-android-package` → manifest raw text; `bundle@1008560, @2005059, @2005138, @1108841` (`showJayeekParcels` next to channel-schema strings).

### How Wind implements this correctly
- Identical split: **FCM data-only** + Notifee with one explicit channel per event class: `wind_driver_assigned`, `wind_out_for_delivery`, `wind_delivered`, `wind_cash_required`, `wind_invoice`, `wind_system` — version-suffixed (`_v1`) so a definition change forces recreation, never silent reuse (INDEX A13).
- Channels created on first use at boot/JS start; deep-link payloads routed by `wind_route` key.
- Reboot re-arm for any scheduled local notification (pickup windows) via Notifee triggers + BOOT_COMPLETED receivers (INDEX A14).

### What not to copy
- Do not ship a **no-default-channel** configuration unless Wind's JS is guaranteed to render — a bare FCM notification on a broken JS path silently drops for the user. Wind should set a real `default_notification_channel_id` fallback **in addition to** explicit channels (defence in depth; Shiply's choice is deliberate but brittle).
- Do not enable `firebase_messaging_auto_init_enabled=true` before consent/opt-in flows exist — auto-init registers the device before the user agrees to anything.
- Do not copy `EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS` + free OTA updates for a cash-ledger app without a staged rollout + update-integrity story; a bad OTA to Wind's ledger is unrecoverable in the field.

---

## 9. Crash / analytics (Sentry org `shiply-qw`, auto-init off; Firebase AdStorage ON)

### Observed mechanism
- Sentry **present but not auto-initialised**: manifest `io.sentry.auto-init=false` [O]; providers `io.sentry.android.core.SentryInitProvider`/`SentryPerformanceProvider` [O] manifest; JS init from `app.config` plugin `["@sentry/react-native/expo", {url:"https://sentry.io/", organization:"shiply-qw", project:"shiply-customer"}]` [O] `app.config`.
- **Full Sentry DSN embedded in the bundle**: `https://1a0371b851c04a47c17e0f90ee041bff@o4507674090995712.ingest.de.sentry.io/4507675460763728` [O] `bundle@1967690`. Region: `ingest.de.sentry.io` (EU).
- Bundle strings: `Sentry SDK can't connect to Sidecar`, `sentry-ignore`, `captureXhrBreadcrumbToReplay`, `replaysSessionSampleRate`, `enableAutoSessionTracking`, `sessionSampleRate` [O] `bundle` grep.
- Firebase Analytics ON: `firebase_analytics_collection_enabled=true`, `google_analytics_automatic_screen_reporting_enabled=true`, `google_analytics_default_allow_analytics_storage=true`, **`_allow_ad_storage=true`, `_allow_ad_user_data=true`, `_allow_ad_personalization_signals=true`**, `google_analytics_adid_collection_enabled=true`, `google_analytics_ssaid_collection_enabled=true` [O] manifest.
- `delivery_metrics_exported_to_big_query_enabled=false` [O] manifest — the internal BigQuery export flag exists but is off in this build.
- `@react-native-firebase/attributest` in the bundle [O] library list incl. `RNFB_SILENCE_MODULAR_DEPRECATION_WARNING` [O] `bundle@1570163` region.
- Absent (searched): AppsFlyer/Adjust/Branch/Mixpanel/Segment/OneSignal/PostHog/AppCenter — [D], consistent with SHIPLY.md.

### Anchor
`bundle@1967690`; `app.config` plugins; manifest meta-data block; ZIP assets.

### How Wind implements this correctly
- Sentry (or self-hosted glitchtip) with `auto-init=false`, init from JS after consent; scrub addresses/phones from breadcrumbs (`beforeSend`).
- **Ad-storage: OFF by default** — Wind holds parcel PII + cash ledger; `ad_storage`/`ad_user_data` must never be `true`. Analytics = first-party, purpose-limited (delivery events only), no AD_ID permission at all (drop `com.google.android.gms.permission.AD_ID` + `ACCESS_ADSERVICES_*` — Shiply ships them [O] manifest, Wind should not).
- BigQuery export: defer; if added, gate behind a written decision on what leaves the device.

### What not to copy
- **S7** (INDEX): ad-storage-on analytics defaults — explicit decision, not a default.
- **S5** (INDEX): shipping the Sentry DSN + org/project + Maps keys in app.config. A DSN is public-by-design but it hands anyone the ability to pollute Wind's crash stream; rotate/scope before reuse, and never commit keys (Shiply's Maps API keys are equally shipped — Android + iOS both [O] `app.config`).
- Do not copy client-side session replay (`replaysSessionSampleRate`) for an app that screens cash amounts — replay of parcel PII is a data-protection incident waiting to happen.

---

## 10. Export / sharing (10 deep-link domains, universal share pipeline)

### Observed mechanism
- **10 verified-ish domains × 2 schemes (https/http), all with `pathPrefix="/p"`, `autoVerify=true`**, in intent filters: `www/shiplypalestine.com`, `shiply.ps` (+www), `shiplylogistics.com` (+www), `shiplyjordan.com` (+www), `shiplytechnologies.com` (+www) = 20 `<data>` pairs [O] manifest raw text.
- Custom schemes: `shiply`, `myapp`, `com.shiplypalestinemobileapp` (listed twice), `exp+shiplypalestine` (Expo dev) [O] manifest + `app.config` intentFilters.
- iOS associated domains: the same 10, `CFBundleURLSchemes=["shiply"]` [O] `app.config`.
- `/p` path convention appears in the bundle as `https://shiplylogistics.com/p/customer/address`, `https://jordan.shiplylogistics.com/p/customer-invoices/current-amount` [O] `bundle@1157741`, `@1157192` — universal links are app deep-links into screens (expo-router handles them) [I].
- Share mechanics: `cl.json.RNShareFileProvider` with `com.shiplypalestinemobileapp.rnshare.fileprovider` authority + `share_download_paths` [O] manifest — react-native-share under the hood for files/text via system share sheet [I]; `expo-web-browser` `BrowserProxyActivity` (`.webContainer` taskAffinity) for external flows [O] manifest.
- CSV export: header at `bundle@930617` (see §7); `printInvoice` API [O] `bundle@1153447`; "Export" strings ×2+ and export routes in invoices/reports [O] `bundle@1206408`, `@1222032` region; `choose_file_format` [O] `bundle@1344913`.
- `ReactNativeBlobUtil` blob paths (`/parcels/companion/ReactNativeBlobUtil-blobs/`) [O] `bundle@1152848` — export files are staged on-device before sharing.

### Anchor
`app.config` + manifest intent filters; `bundle@1157741, @1157192, @1153447, @930617`.

### How Wind implements this correctly
- **One** canonical domain + `pathPrefix` convention (e.g. `https://app.wind.ps/p/<code>`), `autoVerify`, apple-app-site-association + assetlinks.json served from that host; skip the 10-domain spray (each extra domain is an attack surface for link hijacking and an ops burden for verification).
- `/p/<token>` = parcel status share (public, no PII: "parcel 8F3K… out for delivery"); separate authenticated deep links `/app/parcels/<id>` for owner actions.
- Export pipeline: generate file → stage in app cache → share via system sheet (react-native-share or RN's built-in Share) → never embed PII in public filenames (`invoice-<id>.csv`, not `name-phone.csv`).

### What not to copy
- The **10-domain sprawl** — registry squatting risk and Play review confusion; Wind needs one.
- Do not copy http:// variants without HSTS + verification of each host — autoVerify on plain HTTP is meaningless and abusable by any network.
- Do not copy share-sheet UX that exports the CSV with full recipient PII unguarded — Wind's export must warn "contains personal data" and default the filename neutral.

---

## 11. Offline (bundled fonts/models, ML Kit models, "Error sending. Event queued." outbox)

### Observed mechanism
- **Offline write semantics exist**: `Error sending. Event queued.` [O] `bundle@1260965` — failed mutations are queued client-side for retry (exact storage mechanism [U]; plausibly AsyncStorage/SQLite given `androidx.room.MultiInstanceInvalidationService` in manifest [O]).
- Everything else offline-ish is **bundled assets**, not a sync engine:
  - 9 × Noto Kufi Arabic weights (`NotoKufiArabic-{Thin…Black}.ttf`, ~0.9 MB total) [O] ZIP listing; `expo-font` plugin [O] `app.config`.
  - ML Kit barcode models (~0.88 MB) [O] ZIP listing (see §4).
  - `material-symbols` + vector-icon fonts in `res/raw` (30+) [O] ZIP listing.
  - i18n/copy is inline English in the bundle; Arabic is server-delivered ([O] AR split shows framework-only Arabic; §Claim 20).
- No PWA/Service Worker strings (no Workbox) [D]; `expo-updates` OTA is the "offline tolerance" strategy once code is installed — cached JS bundle always launches (`fallbackToCacheTimeout:1000`) [O] `app.config`.
- Draft persistence: `createParcelDraft`, `anon_0_createParcelDraft`, `getParcelDetailsFromCreateParcelData` [O] `bundle@1707033` region — parcel creation is draft-first, tolerant of process death [I].
- No visible outbox UI, retry screen, or conflict-resolution UX tokens in the bundle [O — absence search]; reliability story is thin [U].

### Anchor
`bundle@1260965`; ZIP listing; AR split aapt2; `app.config` expo-updates block.

### How Wind implements this correctly
- Do what Souq Tulkarm does (INDEX A7), which Shiply only gestures at: every mutation carries **idempotencyKey** + `queueAs` human label; outbox in localStorage/SQLite with a visible pending count; server answers `QUEUED`; replay in FIFO with per-item failure surface; conflict = server wins + entry marked `conflict_needs_review`, never silent drop.
- Bundle: Wind's own Arabic font subset (not Noto Kufi wholesale — measure glyph coverage; Kufi is fine), ML Kit **or** GMS-provided models (not both), fee table + zone list for current city.
- Expo Updates: keep (it's Expo's edge), but gate ledger-affecting updates behind explicit QA (see §8).

### What not to copy
- Do not treat "event queued" toast as an offline story — without idempotency keys and a reconciliation path, queued writes corrupt a cash ledger under retries.
- Do not bundle fonts you don't use; Shiply bundles all 9 Kufi weights + 30 icon fonts (~3–4 MB) — Wind can ship ~0.6 MB.
- No service worker / no `beforeinstallprompt` path — this is a native app; PWA offline is S4-adjacent (INDEX S4).

---

## 12. Cross-cutting observations (not one of the 11, but needed for the report)

### Team identity / reverse-domain mismatch [O]
Android package `com.shiplypalestinemobileapp` ≠ iOS bundle ID `com.shiplypalestine.shiplypalestine` (`app.config`) ≠ Expo owner `shiplydev` ≠ EAS project `020aa5af-…` ≠ slug `shiplypalestine` ≠ scheme `shiply`. Firebase/Sentry/provider authorities are all minted under the Android package (`com.shiplypalestinemobileapp.firebaseinitprovider`, `…notifee-init-provider`, `…SentryInitProvider`, `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` with `protectionLevel="signature"` — good practice). Lesson: Wind must mint **one** reverse-domain and use it everywhere including Gradle namespace, bundle ID, Firebase registration, deep links.

### Shipping hygiene failures (all [O])
- Google Maps API keys (Android + iOS) in `app.config` and manifest.
- Full Sentry DSN in bundle (§9).
- Expo project ID + channel (`production-expo-upgrade`) in manifest; `EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS`.
- `allowBackup="true"` with secure-store exclusions (good) but app-level backup still on — INDEX S6 still applies.
- `READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE` legacy permissions, `SYSTEM_ALERT_WINDOW`, `DETECT_SCREEN_CAPTURE`, `BROADCAST_CLOSE_SYSTEM_DIALOGS` (maxSdk 30) — Wind: none of these.
- Secure-store backup rules read as binary AXML: `SecureStore` excluded from `full-backup-content` + `data-extraction-rules` (cloud-backup + device-transfer) [O] text fragments of `res/xml/secure_store_backup_rules.xml`. Tokens are excluded; general parcel PII is not.

### iOS fastlane of truth [O]
`app.config`: `sdkVersion "57.0.0"`, `runtimeVersion "1.1.0"`, iOS buildNumber 313 vs Android versionCode 310; `owner: shiplydev`; EAS channel `production-expo-upgrade` (the name says it all — an upgrade branch).

---

## 13. What Wind should actually take (synthesis)

Adopt pattern-only: **three-axis parcel state** (§1), **order-type axis minus card** (§2), **difference-queue vocabulary** (§3), **QR identity + ML Kit scan** (§4), **City/Village/Street + landmark triple** (§7), **FCM data-only + explicit Notifee channels + boot re-arm** (§8), **Sentry-with-consent, ad-storage off, no AD_ID** (§9), **single-domain `/p/<token>` universal link + neutral-filename exports** (§10), **idempotent outbox with human labels** (§11, from Souq more than Shiply).

Refuse: **card/visa-commission** (S1), **B2B catalogue/store/employees-as-surface** (S3 — keep the role model, drop the storefront), **`/platform/users/*/approve` as client-side concept** (server decision only), **10-domain deep-link sprawl**, **ad-storage analytics** (S7), **shipped secrets** (S5), **non-reversible same-day without compensation** (D12), **analytics auto-init before consent**, **OTA without staged rollout**.

Defer with gates: JAYEEK-style same-day as carrier attribute (D12 + Wind has ≥2 carriers), driver app handshake "change position to driver" equivalent until a driver artifact exists to ground it (Shiply's customer app only hints at one — INDEX gap 2), ticket system (D13), voice messages (D3).

## 14. Gaps / unknowns

1. `/platform/users/${id}/approve` — not re-derivable; likely template string or renamed; approval mechanism's real contract unknown.
2. Notification channel IDs constructed at runtime — only schema error strings are static; actual IDs and their grouping are unverifiable.
3. Driver app / dispatcher console unknown — customer APK contains `changeParcelStatusPositionDriver` + driver-note only; offer/accept/decline handshake absent (consistent with INDEX gap 2).
4. JAYEEK price/fee mechanism — server-driven; no static price literal, contract, or settlement term exists in the artifact. Whether Shiply/JAYEEK settle per parcel or per route is [U].
5. Server behaviour unverifiable: fee schedule, COD enforcement, ledger write path, reconciliation finality, webhook signatures. All [U].
6. Arabic product copy: zero product strings in AR split; Shiply's customer-facing Arabic wording is unknown — Wind cannot borrow phrasing, only structure.
7. Whether `attempttodeliver_three_step` is server- or client-driven is [U]; the token's presence as a status colour key implies it is at least display-known client-side.
8. `anonym`-prefixed handlers (`anon_0_createParcelDraft`) are minified module ids; behaviour inferred, not verified.
9. `delivery_metrics_exported_to_big_query_enabled=false` — whether the underlying export path exists when true cannot be determined.
10. Bundle de-minification is partial; offsets are decoded-text offsets and will drift with any re-extract.

## 15. Tooling / reproduction

```powershell
# extraction
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('...shiply__base.apk')
[System.IO.Compression.ZipFileExtensions]::ExtractToFile($zip.Entries | ? FullName -eq 'assets/index.android.bundle', 'bundle.bin', $true)

# decode + scan (Select-String equivalent used throughout)
$text = [IO.File]::ReadAllText('bundle.bin', [Text.Encoding]::UTF8)   # 10,781,466 chars, 11.7% FFFD
[regex]::Matches($text, '/\((app|auth)\)/[A-Za-z0-9_\-/\[\]\.]+\.js')  # 136 unique routes
[regex]::Matches($text, 'parcelStatusColor[.\-][A-Za-z0-9_]+')         # status tokens

# manifest
rea inspect-android-package shiply__base.apk --format json --full-output
# AR split strings (framework-only check)
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt2.exe" dump strings shiply__split_config.ar.apk
```

Working files outside the repo: `C:\Users\osama\AppData\Local\Temp\opencode\shiply-work\{index.android.bundle,bundle.txt,app.config,app.manifest}`. APK analysis used no device, no network, no credentials.
