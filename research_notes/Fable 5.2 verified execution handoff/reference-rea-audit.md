# Reference-app REA evidence audit — Uber, Careem, HAAT → Wind

**Date:** 2026-11-13  
**Scope:** read-only evidence audit for a ~50-user Palestinian parcel/cash pilot.  
**Method:** existing local Uber-derived evidence, documented artifact-location checks, and public Careem/HAAT store pages. No source, git, device, or AWS mutation; no acquisition, installation, decompilation, protection bypass, or proprietary-code copying in this audit.

## 0. Legend and bottom line

- **[O] Observation:** directly present in a cited local record or public page.
- **[I] Inference:** a recommendation or interpretation, not a claim about a competitor's implementation.
- **[U] Unknown:** not established by available evidence; requires the stated next step.

**[O] Bottom line:** within this audit's Uber/Careem/HAAT evidence set, only Uber has historical binary/decompilation evidence. That evidence records a real 10-APK Uber rider split set, base SHA-256 `55663c738053f8f9e11bc30f414d693473de1272082db4d3edf95b1ad1c3e4a2`, and 23/23 DEX coverage, but every documented original/decompile disk root checked on 2026-11-13 is currently absent. Careem and HAAT have public store observations only, with no local binary evidence. Therefore this is a bounded evidence audit, **not** three completed reverse-engineering studies. A separate same-day study records static analysis of Uber 4.655, Shiply, Souq Tulkarm, Athkar, and Salati; it is outside this audit's reproduced evidence and has unresolved acquisition-provenance wording.

## 1. Artifact verdicts

| App | Verdict | Evidence status |
|---|---|---|
| Uber rider | **Historically evidenced real APK/decompile; bytes currently absent locally** | [O] `com.ubercab` 4.654.10002, ten splits, signer/digests, DEX and decompile manifests exist. [O] `%LOCALAPPDATA%\Temp\opencode\uber\apk`, `%LOCALAPPDATA%\Temp\opencode\uber\rea-full`, `C:\targets\uber`, and `D:\targets\com.ubercab` were absent when checked. [O] No competitor `.apk`, `.apks`, `.xapk`, `.apkm`, `.ipa`, `.aab`, `.dex`, or `.jar` artifacts were found in the checked competitor evidence locations. This does not assert absence of Wind's own build artifacts elsewhere in the project tree. |
| Careem | **Public-store observation only** | [O] Google Play and Apple listings were read. [O] No Careem binary/decompilation evidence was found locally. [U] Internal architecture, state machines, API contracts, storage, security, and offline behavior. |
| HAAT | **Public-store observation only** | [O] Google Play package `com.haat.client` and Apple bundle ID `com.haat.client` were read. [O] No HAAT binary/decompilation evidence was found locally. [U] Internal architecture, state machines, API contracts, storage, security, and offline behavior. |

[O] Store descriptions establish advertised product capabilities, not implementation quality or mechanisms. HAAT's Play “Data safety” declarations are developer-provided declarations, not independently audited behavior.

## 2. Uber evidence chain and current verification boundary

### 2.1 Recorded artifact identity

| Field | Recorded observation |
|---|---|
| Application | [O] Uber rider, package `com.ubercab`, version 4.654.10002 (`versionCode 465410002`). |
| Provenance | [O] Historical collection record: APKPure, `https://apkpure.com/uber-request-a-ride/com.ubercab/download/4.654.10002`, collected 2026-10-30. |
| Split set | [O] `base.apk`; `split_config.arm64_v8a.apk`; `split_config.ar.apk`; `split_config.en.apk`; `split_config.es.apk`; `split_config.fr.apk`; `split_config.pt.apk`; `split_config.ru.apk`; `split_config.xhdpi.apk`; `split_config.xxhdpi.apk`. |
| Base digest | [O] SHA-256 `55663c738053f8f9e11bc30f414d693473de1272082db4d3edf95b1ad1c3e4a2`; size 71,926,670 bytes; CRC-32 `b64c77ba`. |
| Recorded signer | [O] SHA-256 `4003231ab42feb8d955e62fdfaa4fad59567054b9c6bbc3d950299ddfc268392`; SHA-1 `ef2a203751cb56ae46b968bf4319f6c95f96e519`; MD5 `ea0449f2252723457b8acbb1f9c119a4`. |
| Signing boundary | [O] v1 true; v2/v3 false in `aapt dump badging`; v2/v3 true in `apksigner verify --verbose`. [I] Preserve both tool results rather than collapsing them into one claim. |
| Binary role | [O] `lib/arm64-v8a/libc++_shared.so` and `lib/arm64-v8a/libconscrypt_jni.so` recorded in the ABI split. |

### 2.2 Recorded provenance/collection sequence

| Step | Observation |
|---|---|
| 1 | [O] Public APKPure artifact/version recorded as above. |
| 2 | [O] Ten split names, sizes, hashes, and manifest/tool facts were catalogued in the local analysis and closure records. |
| 3 | [O] Base manifest declared `minSdkVersion 23`, `targetSdkVersion 35`, `platformBuildVersionCode 36`, and `com.android.vending.splits.required true`. |
| 4 | [O] `AndroidManifest.xml` decoded to 217,434 bytes; resource table decoded to 4,100,088 bytes; 16,639 string entries and 91 locales recorded. |
| 5 | [O] Base DEX inventory recorded six DEX files, sizes 0 / 9,420,160 / 11,597,112 / 10,129,064 / 9,952,984 / 10,266,516 bytes. |
| 6 | [O] All 23 DEX slices across all ten APKs were included in the historical JADX source-coverage job; individual DEX hashes are not supplied by the cited summary. |
| 7 | [O] JADX reported 206,261 exported Java files; the coverage job counted 206,254 Java files, including 6,048 named Android/Smali fallback slices. [U] The seven-file count difference is not reconciled in the cited records. |
| 8 | [O] Original bytes/decompile were documented as intentionally excluded from git and preserved only on disk; those disk roots are now absent. No restored acquisition or re-hash was performed in this audit. |

### 2.3 Coverage and analysis limits

| Area | Observation / limit |
|---|---|
| DEX coverage | [O] 23/23 DEX slices included in the 2026-10-31 coverage job; 10 APKs, 206,254 Java files counted, `all_dex_covered=true`. |
| Map capability study | [O] Evidence set E1 names 16 base-DEX slices; 11 `classes2`–`classes11` indexes were reported complete, `classes` was reported empty/unavailable, and remaining slices were not established as decoded. [O] `overrides/base/classes12/classes12.dex` was reported incomplete, index rebuilt. |
| Decode health | [O] Resource-table `invalid config flags` warnings; `cutil_jni` export truncated with error 124; JADX finished with errors including `NullPointerException` in `EnumVisitor` and `Failed to get debug info from dex file`. |
| Boundary | [O] One Android rider app only. [U] Driver/recipient apps, backend behavior, native implementation internals, production rollout, experiment flags, and all server-side algorithms are not proved by this artifact set. |
| Current reproducibility | [U] Original APK bytes, decompile output, and the K5-run command's actual target state cannot be revalidated now because the documented roots are absent. [O] This audit therefore relies on historical records and does not pretend to have re-hashed missing bytes. |

[I] Restore the exact recorded split set, re-run independent SHA-256 checks against every catalogued digest, verify both signing-tool results, and regenerate DEX coverage before describing the old work as currently reproducible. A missing original artifact is an evidence-availability gap, not proof that the historical hash was false.

### 2.4 What decompilation can and cannot establish

[O] JADX output is a partial approximation of bytecode, not the original Android/TypeScript project. It cannot reconstruct the original repository, comments, exact formatting, build configuration, all debug metadata, backend source, or native C/C++ source. No claim is made that the decompile is clean or compilable. Protobuf definitions, native geometry/network code, and server behavior require separate lawful evidence; store binaries alone cannot supply them.

## 3. Careem public observations — not REA

### 3.1 Observable product facts

| Observation | Source |
|---|---|
| [O] Android package `co.careem.acma`; developer Careem; Play listing updated 2026-11-11. | [Careem Google Play](https://play.google.com/store/apps/details?id=co.careem.acma&hl=en&gl=US) |
| [O] Apple app ID `592978487`; current version `26.44.0`; current release date 2026-11-09. | [Apple lookup](https://itunes.apple.com/lookup?id=592978487&country=us) |
| [O] Advertised rides include city rides, scheduled rides, and live captain tracking. | Same Play/Apple listings. |
| [O] Advertised verticals include food, groceries, shops, Careem Box delivery, home cleaning, laundry, car wash, Careem Pay, and Careem Plus. | Same Play/Apple listings. |
| [O] Advertised Pay functions include transfers, bill/mobile payments, QR payment, card top-up, wallet use, and international remittances; availability varies by market. | Same Play/Apple listings. |

[U] No public listing evidence here establishes Careem's actual client framework, persistence, queues, retry/idempotency implementation, authentication protocol, map engine, route planner, matching algorithm, telemetry backend, recipient-handover data model, or cash-ledger implementation.

### 3.2 Pilot-relevant interpretation

- **[I] Adopt as product expectations:** easy booking, optional scheduling only if dispatch needs it, and live driver/order tracking with explicit privacy rules.
- **[I] Defer:** wallet/remittance/card/QR payment breadth. Wind's immediate cash ledger and reconciliation problem does not justify building a payments product.
- **[I] Skip for this pilot:** food/grocery/shop discovery, home services, laundry/car wash, Careem Plus-style membership, and super-app navigation.

## 4. HAAT public observations — not REA

### 4.1 Observable product facts

| Observation | Source |
|---|---|
| [O] Android package `com.haat.client`; developer HAAT Delivery LTD; Play listing updated 2026-11-12. | [HAAT Google Play](https://play.google.com/store/apps/details?id=com.haat.client&hl=en&gl=US) |
| [O] Apple app ID `1496579620`; bundle ID `com.haat.client`; current version `21.0.4`; current release date 2026-09-29. | [Apple lookup](https://itunes.apple.com/lookup?id=1496579620&country=us) |
| [O] Advertised service targets cities without street addresses and mentions cash payments and Point of Sale. | Same Play/Apple listings. |
| [O] Current release notes advertise live order tracking, lock-screen/notification updates, cashback/campaign incentives, restaurant items sold by weight, an improved address flow, clearer connection-drop screens, and performance fixes. | Same Play/Apple listings. |
| [O] Play exposes related Courier, Driver, and Partner apps; this does not reveal their internals. | HAAT Google Play listing. |

[U] HAAT's precise landmark-address schema, geocoding strategy, address-confirmation flow, POS protocol, cash reconciliation model, tracking transport, offline queue/retry behavior, and notification payload/privacy design are unknown.

### 4.2 Pilot-relevant interpretation

- **[I] Highest-value product cue:** address-light delivery. Require recipient name/phone, city/area, landmark and written directions, optional map pin, and driver callback—not a mandatory formal street address.
- **[I] Cash/POS cue:** treat cash collection, change, POS/reference status, recipient handover, and daily driver settlement as an auditable ledger, not a boolean `paid` field.
- **[I] Connectivity cue:** explicit stale/offline/error states and safe retry are more relevant than assuming continuous live tracking.
- **[I] Defer:** weight-based parcel pricing only if a real tariff requires it; restaurant weighted-item UX is not itself a parcel requirement.
- **[I] Skip initially:** cashback/campaign/rewards machinery. Lock-screen updates are optional after privacy and notification correctness are proven.

## 5. Requirements and dispositions for Wind

“Adopt” means adopt the product/technical **pattern**, not copy code or UI. Current-state references are from the local capability map; each still needs normal implementation tests.

| ID | Requirement and evidence | Current local status | Pilot disposition / acceptance gate |
|---|---|---|---|
| W1 | **[I] Phone OTP auth and durable session.** Uber evidence describes phone-first OTP/session flows. | Real Supabase OTP and restored `wind.customer`/`wind.driver` sessions; delivery auth still partially transitional. | **Adopt now.** Prove valid/expired/duplicate OTP, session restore/logout, role isolation, and no cross-customer data access. |
| W2 | **[I] Explicit pickup, dropoff, and recipient identity.** | Address-confirmation data exists, but “explicit recipient identity” is recorded as not done. | **Adopt now.** Recipient name/phone, alternate contact if needed, city/area, landmark/directions, optional pin, and validation before dispatch. |
| W3 | **[I] Double-entry address/map pin plus arrival assistance.** Uber evidence supports double-entry/map/arrival-pattern study; HAAT advertises improved address flow and address-light cities. | Existing address-confirmation UI; no proof of competitor internals. | **Adopt minimally.** Pin is adjustable and never silently replaces written landmark/directions; no Google dependency required. |
| W4 | **[I] Server-authoritative quote with readable failure states.** Uber `upfront_fare.v2` study covers errors/refresh. | Local delivery create/quote flow exists; exact parity not required. | **Adopt.** Quote expiry, currency/amount precision, unavailable/route-error state, refresh, and no silent price substitution. |
| W5 | **[I] Single active customer order and driver offer lifecycle.** Uber evidence supports one-active-order, offer countdown, cancellation/requote themes. | Single-active-request assumption; atomic driver accept exists. | **Adopt.** Atomic accept, explicit expiry/cancel/reject, stale-offer rejection, and one authoritative active state. |
| W6 | **[I] Monotonic delivery state machine.** | Local state machine and atomic transition helpers exist. | **Adopt.** Define legal transitions; reject replay/out-of-order client transitions; driver UI never advances state locally without server confirmation. |
| W7 | **[I] Trip/order event log for disputed transitions.** Uber evidence supports trip event logging; backend internals unknown. | Event helpers and notifications exist; complete parcel-event audit needs verification. | **Adopt lightweight.** Append order ID, actor, old/new state, timestamp, and request/event ID; retain enough for support disputes. |
| W8 | **[I] Cash/COD subledger, not payment UI.** Uber payment study supports ledger/invariant thinking; HAAT advertises cash/POS. | Customer Payments is explicitly ledger/history; planned driver cash collection/settlement remains deferred work. | **Highest priority.** Amount due, collected, currency, collector, time, order, handover/settlement status, correction/reversal entries; no destructive edits; idempotent posting. |
| W9 | **[I] Recipient handover/proof and exceptions.** | Current proof details are not established by the reviewed competitor evidence. | **Adopt minimum.** Recipient confirmation plus timestamp/driver/order; optional PIN/photo only with consent, retention, and operational need. Record refused, unavailable, damaged, partial, and returned outcomes. |
| W10 | **[I] Driver cash settlement/reconciliation.** | Not completed; must remain pilot-scale. | **Adopt before cash launch.** Per-driver/day expected vs collected vs settled, discrepancy reason, actor and timestamp; exportable summary is enough. |
| W11 | **[I] Tracking is supplemental and privacy-scoped.** Uber dual-channel pattern observed; HAAT/Careem advertise live tracking. | `driver_positions`, `customer_order_tracking`, and presence plumbing exist. | **Adopt bounded.** Only active-order participants; coarse/stale indication; stop on terminal state; avoid public exact location and continuous background tracking when not delivering. |
| W12 | **[I] Reconnecting primary channel plus authoritative invalidation/refetch.** Uber evidence supports realtime + refetch. | Supabase Realtime/PG_NOTIFY consumers with invalidation exist. | **Adopt existing pattern.** Sequence/created-at checks, reconnect, resync after gap, no phantom completion from a stale push. |
| W13 | **[I] Offline/outbox and read-your-writes recovery.** Uber decompile does not prove offline persistence. HAAT only advertises clearer connection-drop screens. | Outbox, stale state, and non-durable-connection UX exist locally. | **Adopt conservative retry.** Idempotency key per mutation, visible pending/failed/sent state, bounded retry, never duplicate COD or terminal transitions. |
| W14 | **[I] Human-readable connectivity/error states.** HAAT advertises clearer connection-drop screens. | Stale/offline handling exists. | **Adopt.** Last-updated time, retry action, cached-data label, and safe recovery in Arabic/English as supported by the app. |
| W15 | **[I] Notifications for material order changes; optional lock-screen updates.** HAAT advertises lock-screen/notifications; Expo push plumbing exists locally. | Push/token work exists; payload correctness still requires normal tests. | **Adopt basic notifications now; defer rich live activities.** No address, phone, cash amount, or precise location on lock screen by default. |
| W16 | **[I] Simple operational health metrics and safe client errors.** Uber studies identify health/retry/metrics patterns, not a mandate to clone their stack. | Security/error telemetry exists. | **Adopt small.** Auth failures, quote failures, offer accept conflicts, transition rejects, outbox retries/dead letters, cash discrepancies; structured logs/metrics with PII redaction. |
| W17 | **[I] Idempotent server writes and non-2xx safety.** Uber API study emphasizes idempotency/observability; implementation is not available to copy. | Atomic helpers and outbox exist; per-endpoint proof required. | **Adopt.** Unique client mutation IDs, server dedupe, bounded retry/backoff, and reconciliation after timeout/unknown outcome. |
| W18 | **[I] Recipient/contact privacy and role-scoped APIs.** | RLS/security work exists; no competitor claim needed. | **Non-negotiable.** Test customer/driver/admin matrices, terminal-order access, tracking access, storage URLs, logs, and notification content. |
| W19 | **[I] Lightweight admin/support audit.** | Admin/driver work exists locally. | **Adopt operationally.** Search by order, inspect event/cash trail, record manual corrections with reason; no broad super-admin client shortcuts. |
| W20 | **[I] Scheduled orders.** Careem advertises scheduled rides. | Not necessary for immediate proof of cash parcel delivery. | **Defer** until dispatch can honor windows and customers request it. |
| W21 | **[I] Weight-based pricing.** HAAT advertises restaurant weighted items. | Parcel tariff requirement unknown. | **Defer** unless the actual tariff uses weight; do not copy restaurant UX. |
| W22 | **[I] Rich driver navigation/arrival routing.** Uber native GL/arrival research is extensive but incomplete. | OpenStreetMap/no-Google constraint remains. | **Defer advanced navigation.** Start with pin/landmark/callback and external navigation handoff if needed. |

## 6. Explicit adopt / skip / defer

### Adopt for the 50-user pilot

- **[I]** W1–W19 above, prioritizing recipient/handover data, cash ledger and settlement, legal state transitions, idempotent retry, tracking privacy, and minimal support/health visibility.
- **[I]** Reuse Wind's existing Supabase/Expo/MapLibre/OSM patterns rather than introducing a new backend, map stack, or state framework.
- **[I]** Use competitor evidence to define acceptance questions, not visual clones or implementation assertions.

### Skip for this pilot

- **[I]** Uber custom GL/map engine, deep navigation/arrival stack, ML/ETA/ADS/AV, large experimentation/platform machinery, ads, memberships, and multi-vertical super-app scope.
- **[I]** Careem food/grocery/shop/home-services breadth, Careem Plus clone, wallet/remittance product, and super-app shell.
- **[I]** HAAT restaurant catalog/ordering, rewards/cashback campaigns, and weight-sold restaurant item UX.
- **[I]** Any attempt to reconstruct a compilable original Uber project or copy proprietary implementation/assets.

### Defer with an evidence gate

- **[I]** Protobuf/R2R2 IDL/code generation: only after a demonstrated payload/versioning need; JSON/IDL evidence remains incomplete.
- **[I]** Server-driven UI/design-system machinery: only after repeated operational need; `propel/model` JSON evidence exists but is not a pilot requirement.
- **[I]** Rich payments/POS integrations: only after a named provider, market, settlement contract, and security/compliance review exist.
- **[I]** Scheduled delivery, weight pricing, rich lock-screen tracking, advanced arrival guidance, and microVM/domain-service decomposition: only after pilot metrics justify them.

## 7. Missing evidence and exact next steps

### 7.1 Uber — needed before calling the REA chain currently reproducible

1. **[U] Current artifact bytes:** restore or lawfully reacquire the exact 4.654.10002 ten-split set; record source URL, UTC acquisition time, file sizes, and independent SHA-256 for every split. Verify the recorded base digest before analysis.
2. **[U] Full split digests/signer:** compare every restored split with `uber-app-analysis.md` and `CLOSURE-INVENTORY.json`; retain both `aapt` and `apksigner` results and explain any discrepancy.
3. **[U] Current decompile/coverage:** rebuild the 23-DEX manifest and Java-file counts; reconcile 206,261 vs 206,254; preserve the hard-failure/error logs rather than claiming a clean decompile.
4. **[U] Native implementation:** separately identify native `.so` hashes/symbols and disassemble only what is lawfully necessary. JADX cannot prove native map, geometry, network, or crypto internals.
5. **[U] Backend/wire behavior:** obtain separate authorized dynamic evidence with test accounts and owner permission. Do not infer production endpoints, auth, rollout, matching, or fraud behavior from strings/decompile alone.
6. **[U] Cross-app parity:** a rider artifact says nothing definitive about driver/recipient implementations; those need their own artifacts and consent/scope.

### 7.2 Careem — needed for an actual REA

1. **[U]** Lawfully acquire and hash the exact Android APK/split set or iOS artifact under written scope; preserve provenance, signer, entitlements, and acquisition time.
2. **[U]** Generate per-container/per-DEX coverage and native-binary inventories; record all decode failures.
3. **[U]** With authorized test accounts, capture booking, scheduling, tracking, cancellation, payment-selection, and offline/reconnect behavior; redact tokens/PII.
4. **[U]** Establish actual order states, endpoint contracts, persistence/retry behavior, and tracking/privacy controls before making implementation recommendations.
5. **[U]** Do not use the Play “Data safety” labels as proof of transport/storage security; verify only within authorized scope.

### 7.3 HAAT — needed for an actual REA

1. **[U]** Lawfully acquire and hash the exact `com.haat.client` Android artifact/splits or iOS artifact under written scope; record version, provenance, signer/entitlements, and UTC time.
2. **[U]** Generate container/DEX/native coverage and failure inventories; customer, courier/driver, and partner apps are separate evidence sets.
3. **[U]** Test address creation without a formal street address, landmark correction, weighted items only if relevant, cash/POS selection, tracking, notifications, and offline recovery with authorized accounts.
4. **[U]** Establish actual address schema, order state machine, POS/cash reconciliation, retry/idempotency, and tracking privacy; none is proved by store copy.
5. **[U]** Independently verify any security/privacy claim; developer-provided “no data collected/shared” labels are not audit evidence.

## 8. Evidence sources and limitations

### Local Uber-derived records

- `research_notes/REA Uber app reverse engineering/uber-app-analysis.md` — provenance, split inventory, hashes/signer, manifests, static-analysis boundary.
- `research_notes/REA Uber app reverse engineering/evidence-k5-today/full-source-coverage-2026-10-31.json` — 23-DEX/JADX coverage and failure markers.
- `research_notes/REA Uber app reverse engineering/evidence-k5-today/decompile-2026-10-31-summary.json` — export counts and errors.
- `docs/rea-work/DECOMPILE-ACCESS.md` — historical decompile root and documented coverage; root now absent.
- `docs/rea-work/CLOSURE-INVENTORY.json` — disk-only original/derived artifact preservation records; roots now absent.
- `docs/rea-work/SOURCE-MAP-COVERAGE-2026-11-01.json` — map-study coverage boundary.
- `docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md` — reconstructed F1–F28/N1–N15 requirements and explicit unknowns.
- `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` — API/realtime/offline/payment patterns and unknowns.
- `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md` — map capabilities and decompilation limits.
- `docs/REVIEW-2026-11-02-uber-full-stack-gap-analysis.md` — cross-stack adopt/skip findings and Fastship gates.
- `CAPABILITY-MAP.md` — current Wind capabilities, deferred work, and Palestinian-market constraints.

### Public reference observations

- Careem Google Play: `https://play.google.com/store/apps/details?id=co.careem.acma&hl=en&gl=US`
- Careem Apple lookup: `https://itunes.apple.com/lookup?id=592978487&country=us`
- HAAT Google Play: `https://play.google.com/store/apps/details?id=com.haat.client&hl=en&gl=US`
- HAAT Apple lookup: `https://itunes.apple.com/lookup?id=1496579620&country=us`

**Final boundary:** [O] This audit created no app/source/config/git changes and used no device or AWS action. [U] It does not establish current artifact reproducibility, clean compilation, backend parity, dynamic behavior, or any Careem/HAAT internals. Its recommendations are pilot-scale inferences from the cited evidence and Wind's own needs.
