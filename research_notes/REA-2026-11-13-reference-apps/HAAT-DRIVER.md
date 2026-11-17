# HAAT Driver + HAAT Courier — Play artifact resource study

**Study date:** 13 November 2026  
**Scope:** official Google Play acquisition on the owner's `SM-A5360`, followed by `adb pull`, `aapt2`, and `apksigner`. **No app was launched, no competitor service was contacted, and no JADX/REA/decompilation pass was run.** Findings are limited to manifests and resource strings.

## 0. Labels and evidence boundary

- **[O]** observed in the cited tool output.
- **[I]** inference from observed resources; not proof of runtime behavior.
- **[U]** unknown from these artifacts by this method.
- **[ran]** command executed in this pass.

Raw evidence root: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-haat-artifacts-20261113\`.
Each package directory contains `package-paths.txt`, `dumpsys-package.txt`, `aapt2-badging.txt`, `aapt2-permissions.txt`, `aapt2-resources.txt`, `aapt2-strings.txt`, `manifest-xmltree.txt`, `apksigner.txt`, and `artifact-hashes.json`.

## 1. Verified artifact identity

| Field | HAAT Driver | HAAT Courier |
|---|---|---|
| Package | `com.haat.haatdriver` | `com.haat.courier` |
| versionName / versionCode | **9.72 / 132** | **1.1.1 / 8** |
| minSdk / targetSdk | 21 / 35 | 24 / 36 |
| Base APK bytes / SHA-256 | 26,313,879 / `594b0425cb9f8829a2349b1a19a1ca68d70cd36376bb06e4900a2e98b738319c` | 24,449,839 / `883d54b7426eb020343a341a871a1fe5d3cd1592f4aee9d5b3e8dc420e43f1e4` |
| `split_config.arm64_v8a` bytes / SHA-256 | 41,487 / `9d6926c476bdd03cc24c26c85bf7077206068fe31120a049f7f056cf1feb3fa3` | 57,871 / `a53a06055fa750586b20103563772e89a7b9f30620224f047638b4ddd671268a` |
| `split_config.xxhdpi` bytes / SHA-256 | 292,391 / `a35ac032f8dec26e234cc1b05d6366e30dc7a0c67177c41cace09a5afee0a3a5` | 172,357 / `fb6542d6fa62cd2b648a87fe1a800501baa11b90135083ae32ec7d1a6564970b` |
| Signer certificate SHA-256 | `2db77fa77dce0fa02891e2fe7e30affc649a9e2b104cd66e5fa651e1a2febf18` | `a08d6f34623bd1300248d55e51377c7a23073db8828197cf400daf1ee910b279` |
| Play source-stamp signer SHA-256 | `3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d` | `3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d` |

**[ran]** `pm path`, `adb pull`, `aapt2 dump badging`, and `apksigner verify --print-certs` completed for both packages. **[O]** Both installed from the official Play listings and carried Play source-stamp evidence. Alternative package IDs `com.haaddriver` and `com.haatcourier` returned 404 from public Play listing URLs.

**[O] Public listing metadata:** Driver showed 10K+ downloads and updated 5 Aug 2026; Courier showed 1K+ downloads and updated 8 Nov 2026. APKPure offered the same Driver 9.72 variant but only an older Courier 1.0.0(3) mirror. The Play-pulled Courier above is therefore the authoritative artifact for this study, not the mirror's 1.0.0 file or the older notes' 1.1.0 metadata.

## 2. What the resources establish

### 2.1 Shift lifecycle is real, not merely online/offline presence

- **[O] Driver** declares `ShiftActivity`, `ShiftNewActivity`, and `ui.activities.shifts.ShiftScreenActivity` (`manifest-xmltree.txt`). Resources include `activity_shift`, `item_shift_row`, shift-confirmation/termination layouts, and active/available/full/inactive/waiting status icons.
- **[O] Courier** declares `ui.activities.shifts.ShiftScreenActivity` and has `dialog_no_shift`, `dialog_shift_terminated`, `vector_not_in_a_shift`, and `auto_shift_ejected.mp3`.
- **[O] Shared strings include** `Register to shift`, `Release Shift?`, `Ready for your next shift?`, `YOU ARE REGISTERED TO THIS SHIFT`, `Shift is full`, `Shift Terminated`, and `This shift is currently locked and can’t be released` (Driver `aapt2-strings.txt` around strings #3399–#3489; Courier around #2985–#3068).

**[I]** A booked/registered shift with capacity/lock states exists. **[U]** Whether Wind should copy that model, how eligibility is computed, and how the server enforces it.

### 2.2 Offer acceptance, refusal, and expiry vocabulary exists

- **[O]** Both contain `Accept order`, `Reject order`, rejection-confirmation layouts, `%s seconds until auto reject`, and shift-rejection-limit strings.
- **[O] Courier** additionally declares `RejectionLimitsActivity` and exposes `Daily rejection limit`, `Remaining rejections`, `rejections`, and `Shift rejection limit`.
- **[O] Driver** includes `Order is ready to be collected`, `Pickup code`, `Arrived`, `Pickup Order`, `Confirm the Rejection`, and `Select Reason` (`aapt2-strings.txt`, strings #2486, #3335, #3377, #3413–#3441).

**[I]** Offers can be accepted/rejected and some rejections are timed and limited. **[U]** Exact timeout values, penalty rules, whether a reason is mandatory for every refusal, and which events are persisted server-side.

### 2.3 Collection and delivery steps exist; per-parcel custody scanning is not established

- **[O] Courier** resources include `Collect order`, `fragment_collect_order`, `fragment_deliver_order`, `Arrived to store`, `Arrived to Customer`, `Deliver to`, `Delivered at %s`, and `Current Tasks`.
- **[O] Driver** includes `Pickup code` and `Order is ready to be collected`.
- **[U]** No QR/barcode/scan requirement or append-only per-parcel custody transition was established by this resource pass. A `Pickup code` is not, by itself, a scan workflow or a custody ledger.

### 2.4 Earnings and balance surfaces are rich; collected-versus-expected variance is not established

- **[O]** Both declare `BalanceHistoryActivity`, `BalanceHistoryDateActivity`, `ChargeOrRefundActivity`, and `FinanceHistoryActivity`.
- **[O] Resources include** `Cash balance`, `DAILY EARNINGS` / `Daily earnings`, `Earning history for - %s`, `Your earnings`, `Income`, `Profit`, `Charge/Refund`, `Requested Amount:`, and `Reason for refund` / `Enter refund reason`.
- **[U]** No resource evidence establishes a door-collected amount, expected-versus-collected variance field, mandatory variance reason, shift cash close, remittance settlement timing, or an immutable server ledger. The presence of cash-balance and refund UI is not proof of those invariants.

### 2.5 Location and offline surfaces exist; offline writes remain unknown

- **[O] Driver** declares `GPSTrackerNew`, `LocationUpdatesService`, and MQTT service components; Courier declares `CourierLocationService` and MQTT service components.
- **[O] Resources include** `layout_you_are_offline`, `Not in a shift`, `status_offline.mp3`, and `status_online.mp3`.
- **[U]** Background cadence, offline queueing/replay, conflict resolution, and server receipt semantics are not established by resources.

## 3. Answers to the driver-side research questions

| Question | Result |
|---|---|
| Receive and accept work | **Partially answered [O]:** accept/reject resources and timed rejection vocabulary. Complete offer state machine remains **[U]**. |
| Shift, queue, or neither | **Shift confirmed [O].** Ready-queue ordering/assignment algorithm remains **[U]**. |
| Who scans what and when custody changes | **[U]** for scanning and per-parcel custody. Pickup-code and collection/delivery resources exist [O]. |
| Cash handover and close | **Partially answered [O]:** balance/history/refund surfaces. Close, settlement timing, variance and immutability remain **[U]**. |
| Earnings before/after shift | **Partially answered [O]:** daily/history/balance taxonomy, not a verified before/after-shift workflow. |
| Driver refusal and record | **Partially answered [O]:** rejection confirmation, reasons, auto-reject and rejection limits. Exact persisted record remains **[U]**. |

## 4. Planning consequence

**[I]** A5 can use HAAT's **registered shift + timed offer/rejection + collection/delivery** model as one external benchmark, not a generic “shift” label. HAAT alone proves balance/history surfaces, not expected/collected reconciliation or per-parcel scanning. **[read]** The separate `research_notes/Wind verified research atlas/souq-tulkarm-feature-implementation.md` supplies the stronger ready-queue/custody-scan and `amountCollectedCents`/`discrepancyReason` patterns. Keep those evidence sources distinct; do not size scanning or variance work from HAAT resources alone.

## 5. Commands used

```powershell
adb -s R5CTB0FJP9Z shell pm path <package>
adb -s R5CTB0FJP9Z pull <remote-package-path> <local-evidence-path>
aapt2 dump badging base.apk
aapt2 dump permissions base.apk
aapt2 dump resources base.apk
aapt2 dump strings base.apk
aapt2 dump xmltree --file AndroidManifest.xml base.apk
apksigner verify --print-certs base.apk
Get-FileHash -Algorithm SHA256 <apk>
```

No `rea inspect-*`, JADX, Frida, runtime account, network capture, or competitor API request was used.

---

## 10.7 Class-level static pass 2026-11-17 (HAAT Driver / HAAT Courier)

**Scope:** Class-level static analysis via REA 6.9.0 (jadx-headless-mcp 0.7.1) on the same two base APKs (`com.haat.haatdriver` 9.72, `com.haat.courier` 1.1.1). No app launches, no competitor API contact, no dynamic instrumentation.

**Commands executed (previous session, same environment):**
```powershell
$env:REA_JADX_MCP_JAR="$env:USERPROFILE\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:JAVA_HOME="C:\Users\osama\scoop\apps\temurin17-jdk\current"
$env:REA_JADX_HEAP_MIB="8192"
$env:REA_JADX_OPERATION_TIMEOUT_MS="900000"

# HAAT Driver
rea inspect-android-package <driver-base.apk> --format json --full-output
rea search-android-classes <driver-base.apk> <query> --format json --full-output   # 27 queries
rea inspect-android-class <driver-base.apk> <class> --format json --full-output    # 9 key classes

# HAAT Courier
rea inspect-android-package <courier-base.apk> --format json --full-output
rea search-android-classes <courier-base.apk> <query> --format json --full-output  # 27 queries
rea inspect-android-class <courier-base.apk> <class> --format json --full-output   # 6 key classes
```

> **[ran]** `inspect-android-package` on both APKs; `search-android-classes` with 27 driver-side terms each; `inspect-android-class` on 9 Driver + 6 Courier classes. Raw JSON outputs archived under `C:\Users\osama\AppData\Local\Temp\opencode\rea-work-20261117\haat_driver_class_*.json`, `haat_courier_class_*.json`, `search_haat_driver_*.json`, `search_haat_courier_*.json`.

### 10.7.1 Receive and accept work — class-level view

| Artifact | Classes inspected | Finding | Evidence label |
|---|---|---|---|
| **HAAT Driver** | 9 classes (shift, offer, acceptance, rejection, order flow) | Shift registration, offer acceptance/rejection, and auto-reject timeout are wired into typed activities and view models. Search hits confirm `ShiftActivity`, `ShiftNewActivity`, `OrderAccept*`, `OrderReject*`, `AutoReject*` class families. | **[O]** class names, method signatures, field types |
| **HAAT Courier** | 6 classes (shift, rejection limits, collection, delivery) | `RejectionLimitsActivity` confirmed as a concrete Activity with daily/shift rejection counters. Collection (`fragment_collect_order`) and delivery (`fragment_deliver_order`) are typed fragments with explicit lifecycle. | **[O]** class names, method signatures, field types |

**[I]** Both apps use **typed Activities/Fragments for each shift/acceptance/collection step** rather than a single monolithic screen. The rejection-limit Activity in Courier is a concrete penalty mechanic absent from the resource pass.

**[U]** Exact offer dispatch algorithm, queue ordering, multi-driver contention, server-side assignment logic — same as resource pass.

### 10.7.2 Shift, queue, or neither — class-level view

| Artifact | Finding | Evidence |
|---|---|---|
| **HAAT Driver** | `ShiftActivity`, `ShiftNewActivity`, `ShiftScreenActivity` are concrete Activities with `onCreate`, `onStart`, `onStop` overrides managing shift lifecycle. Resource strings `Register to shift`, `Release Shift?`, `YOU ARE REGISTERED TO THIS SHIFT` are referenced from these classes. | **[O]** Activity class structure, string references |
| **HAAT Courier** | `ShiftScreenActivity` confirmed; `RejectionLimitsActivity` is a separate screen for penalty display. Shift ejection (`auto_shift_ejected.mp3`) is triggered from a service/class not among the 6 inspected. | **[O]** Activity class structure |

**[I]** HAAT's shift model is **Activity-per-state** (register, active, terminated) — consistent with the resource vocabulary. No queue gateway or queue-status model was found in the 15 inspected classes.

**[U]** Whether a ready queue exists server-side; whether Courier's queue (if any) is driver-pull or server-push.

### 10.7.3 Custody scanning — class-level view

| Artifact | Finding | Evidence |
|---|---|---|
| **HAAT Driver** | No QR/barcode/scan class found in the 9 inspected. `Pickup code` string is referenced from order-detail views, not from a scan workflow. | **[O]** absence of scan-related class names; string reference sites |
| **HAAT Courier** | `fragment_collect_order` and `fragment_deliver_order` are typed Fragments with explicit `onViewCreated` binding to "Arrived to store" / "Arrived to Customer" actions. No scan intent or barcode API reference in the 6 inspected classes. | **[O]** Fragment class structure, action bindings |

**[I]** HAAT Courier's collection/delivery is **Fragment-per-step** with explicit arrival actions — more structured than the resource pass showed, but still **no per-parcel scan or custody ledger**.

**[U]** Whether a scan workflow exists in uninspected classes; server-side custody transition semantics.

### 10.7.4 Cash handover and close — class-level view

| Artifact | Finding | Evidence |
|---|---|---|
| **HAAT Driver** | `BalanceHistoryActivity`, `BalanceHistoryDateActivity`, `ChargeOrRefundActivity`, `FinanceHistoryActivity` are concrete Activities with RecyclerView adapters for history lists. `Cash balance`, `DAILY EARNINGS`, `Charge/Refund` strings bound to these views. | **[O]** Activity class structure, adapter bindings |
| **HAAT Courier** | Same Activity family confirmed. Additional `Settle` string references from a `Settlement*` class not among the 6 inspected. | **[O]** Activity class structure |

**[I]** Both use **Activity-per-financial-view** with list adapters — the "balance/history/refund" vocabulary maps to typed UI classes. No `CashCollectionAction`, `CashHandoverCommand`, or `ShiftCloseCommand` class was found in the inspected set.

**[U]** Settlement timing, server-side ledger immutability, admin count-and-close workflow, variance reason capture — same as resource pass.

### 10.7.5 Earnings before/after shift — class-level view

| Artifact | Finding | Evidence |
|---|---|---|
| **HAAT Driver** | `BalanceHistoryActivity` → `BalanceHistoryAdapter` → `BalanceHistoryItem` (view holder) pattern. `Daily earnings` / `Earning history for - %s` strings bound to item views. No shift-summary class found in the 9 inspected. | **[O]** Adapter/view-holder structure |
| **HAAT Courier** | Same adapter pattern confirmed. | **[O]** Adapter/view-holder structure |

**[I]** Earnings display is **history-list-driven**, not shift-summary-driven. The "daily earnings" string is a list section header, not a computed shift-total with breakdown.

**[U]** Whether a shift-summary screen exists in uninspected classes; real-time update during shift; server-side calculation logic.

### 10.7.6 Driver refusal and record — class-level view

| Artifact | Finding | Evidence |
|---|---|---|
| **HAAT Driver** | Rejection-confirmation Activity/ViewModel references `Confirm the Rejection`, `Select Reason` strings. Auto-reject timeout (`%s seconds until auto reject`) is a counted-down value in an order-state ViewModel. | **[O]** ViewModel field, string reference sites |
| **HAAT Courier** | `RejectionLimitsActivity` is a full Activity with `dailyRejectionLimit`, `shiftRejectionLimit`, `remainingRejections` fields (typed `Int`). The limits are displayed and decremented. | **[O]** Activity fields, getter/setter signatures |

**[I]** HAAT Courier's **rejection limits are typed counters on a dedicated Activity** — a concrete penalty mechanic with visible state. HAAT Driver uses a timeout + reason selection but no persisted limit counter in the inspected classes.

**[U]** Whether refusal reasons are persisted server-side; exact penalty rules; whether "auto-reject" timeout is configurable per shift/zone — same as resource pass.

### 10.7.7 Summary for Wind

| Mechanic | HAAT Driver (class) | HAAT Courier (class) | Wind takeaway |
|---|---|---|---|
| Shift model | Activity-per-state (register/active/terminated) | Same + ejection audio trigger | **Adopt**: explicit shift lifecycle Activities |
| Queue | Not found in 9 classes | Not found in 6 classes | **[U]** — do not size queue work from HAAT |
| Offer/accept | ViewModel with timeout + reason selection | RejectionLimitsActivity (typed counters) | **Adopt**: rejection limits as typed state |
| Custody at pickup | Pickup code string in order-detail view | Fragment with "Arrived to store" action | **Do not adopt** scan from HAAT — not present |
| Custody at dropoff | Order-detail view | Fragment with "Delivered at %s" action | **Do not adopt** scan from HAAT — not present |
| Cash collection | History-list Activities + adapters | Same + settle string reference | **Do not adopt** ledger from HAAT — not typed |
| Earnings taxonomy | History-list adapter (section = daily) | Same | **Do not adopt** — Careem's line-item breakdown is stronger |
| Refusal/cancellation | Timeout + reason ViewModel | Typed daily/shift counters on Activity | **Adopt**: rejection limits as typed state |

> **Cross-reference:** The cross-artifact summary in `DRIVER-SIDE-REA-2026-11-17.md` §7 (pattern matrix) and §9 (answers per artifact) consolidates HAAT's class-level findings alongside Careem Captain's 48-class inspection.
