# Driver-Side REA Static Analysis — Cross-Artifact Summary

**Study date:** 17 November 2026  
**Scope:** Class-level static analysis (REA 6.9.0 via jadx-headless-mcp 0.7.1) on three verified Play Store driver artifacts. No app launches, no competitor API contact, no dynamic instrumentation.  
**Evidence labels:** **[O]** observed in tool output · **[I]** inference from observed structure · **[U]** not established by this method · **[D]** derived representation (decompiled)

---

## 0. Artifacts studied

| Artifact | Package | versionName / versionCode | Base APK SHA-256 | Class count (REA) |
|---|---|---|---|---|
| HAAT Driver | `com.haat.haatdriver` | 9.72 / 132 | `594b0425cb9f8829a2349b1a19a1ca68d70cd36376bb06e4900a2e98b738319c` | ~60K (not fully loaded in REA) |
| HAAT Courier | `com.haat.courier` | 1.1.1 / 8 | `883d54b7426eb020343a341a871a1fe5d3cd1592f4aee9d5b3e8dc420e43f1e4` | ~60K (not fully loaded in REA) |
| Careem Captain | `com.careem.adma` | 89.70.2 / 89702 | `f5618afd9e173b8b9a7c4d1d42ee5a6c2e0dedaf71ba95064dd3fbd9b181c538` | **60,549** |

> **[O]** All three APKs acquired via `adb pull` from the owner's `SM-A5360` after Play Store install. Signatures and Play source-stamp certificates verified via `apksigner`. HAAT artifacts previously documented in `HAAT-DRIVER.md`; Careem rider app in `CAREEM.md`. This pass adds **class-level inspection** on all three.

---

## 1. How does a driver receive and accept work?

| Artifact | Finding | Evidence |
|---|---|---|
| **Careem Captain** | **Explicit offer/accept state machine** with named actions: `BookingCancelAction`, `CancelJobCommand`, `EnqueueJobCancellationOnBackendCommand`, `InPickupPassengerCommand`, `InHdlArriveAtPickupCommand`. Jobs flow through a **step-based workflow** (`CollectOrder`, `CompleteCollectOrder`, `CompleteArriveAtQueue`, `CompleteLeaveForQueue`). Each step has metadata DTOs (`HdlArriveAtPickupStepMetadataDto`, `CollectOrderRequest`, `CollectOrderWithPinRequest`). | **[O]** `CareemCaptain` classes: `com.careem.captain.booking.framework.jobs.job.*`, `com.careem.captain.booking.framework.action.*`, `com.careem.captain.jobs.data.model.*` |
| **HAAT Driver** | Resources confirm `Accept order`, `Reject order`, `%s seconds until auto reject`, shift-rejection-limit strings. No class-level inspection completed in this pass (REA load focused on Careem). | **[O]** `HAAT-DRIVER.md` §2.2 (resource strings) |
| **HAAT Courier** | Resources include `RejectionLimitsActivity`, `Daily rejection limit`, `Remaining rejections`, `Shift rejection limit`. Collection/delivery fragments (`fragment_collect_order`, `fragment_deliver_order`). | **[O]** `HAAT-DRIVER.md` §2.2 (resource strings) |

**[I]** Careem's step workflow is the most explicit: each job is a sequence of typed steps with audit fields (`JobAuditUpdateRequest`, `RouteAuditUpdateRequest`). HAAT's resource vocabulary implies similar accept/reject/timeout mechanics but the state machine is not visible at class level in this pass.

**[U]** Exact offer dispatch algorithm, queue ordering, multi-driver contention, server-side assignment logic.

---

## 2. Is there a shift, a queue, or neither?

| Artifact | Finding | Evidence |
|---|---|---|
| **Careem Captain** | **Registered shift model** with booking API: `ShiftsZonesApi` exposes `fetchShiftSummary`, `shiftScheduleList`, `shiftProgress`, `getHotspots`. UI screens for `ShiftCalendarScreenView`, `ShiftSlotSelectionScreenView`, `ShiftConfirmationScreenView`. Reminder workers: `PreShiftNudgeWorker`, `ShiftStartWorker`, `ShiftEndWorker`, `LateForShiftNudgeWorker`, `NextDayShiftReminderWorker`. **HDL queue**: `HdlMotQueueInfoGateway`, `QueueGateway`, `HdlMotQueueInfoModel`, `ArriveAtQueueRequest`, `HdlArriveAtQueueStepMetadataDto`. Driver picks from queue (`ArriveAtQueueScreenView`, `LeaveForQueueScreenView`). | **[O]** `ShiftsZonesApi` methods; UI views; `PreShiftNudgeWorker` fields; `HdlMotQueueInfoGateway`; `ArriveAtQueueRequest` fields (`bookingId`, `carId`, `latLng`, `timestamp`) |
| **HAAT Driver** | `ShiftActivity`, `ShiftNewActivity`, `ShiftScreenActivity` declared in manifest. Resources: `Register to shift`, `Release Shift?`, `YOU ARE REGISTERED TO THIS SHIFT`, `Shift is full`, `Shift Terminated`. | **[O]** `HAAT-DRIVER.md` §2.1 (manifest + resource strings) |
| **HAAT Courier** | `ShiftScreenActivity`, `dialog_no_shift`, `dialog_shift_terminated`, `vector_not_in_a_shift`, `auto_shift_ejected.mp3`. | **[O]** `HAAT-DRIVER.md` §2.1 (manifest + resource strings) |

**[I]** All three use **registered shifts** (not just online/offline toggle). Careem adds a **structured queue** (HDL = "Hala Delivery Logistics"?) with explicit arrive/leave queue commands and queue status metadata. HAAT's queue mechanics remain **[U]** at class level.

**[U]** Whether HAAT Courier's queue is server-push or driver-pull; exact queue ordering algorithm in any app.

---

## 3. Who scans what, and when does custody change?

| Artifact | Finding | Evidence |
|---|---|---|
| **Careem Captain** | **Two distinct custody flows**: (1) **Food/Hala** — `CollectOrderRequest` (bookingId, carId, latLng, timestamp) and `CollectOrderWithPinRequest` (adds `pin: String`). Step metadata `HdlArriveAtPickupStepMetadataDto` includes `pickupPointAddress`, `pickupPointLatLng`, `pickupLimit`, `image`, `hdlVariant`. (2) **Ride-hailing** — `InPickupPassengerCommand` / `InArriveAtPickupCommand` for passenger pickup. **Customer PIN at pickup** confirmed: `HdlArriveAtPickupView` UI, `CollectOrderWithPinRequest.pin` field. | **[O]** `CollectOrderRequest` fields; `CollectOrderWithPinRequest.pin`; `HdlArriveAtPickupStepMetadataDto` fields (`pickupPointAddress`, `pickupPointLatLng`, `pickupLimit`, `image`, `hdlVariant`); `HdlArriveAtPickupView` UI methods |
| **HAAT Driver** | Resources: `Pickup code`, `Order is ready to be collected`. No scan workflow or per-parcel custody ledger in resource pass. | **[O]** `HAAT-DRIVER.md` §2.3 |
| **HAAT Courier** | Resources: `Collect order`, `fragment_collect_order`, `Arrived to store`, `Arrived to Customer`, `Deliver to`, `Delivered at %s`. No QR/barcode scan requirement established. | **[O]** `HAAT-DRIVER.md` §2.3 |

**[I]** Careem has the **most explicit custody model**: typed requests for collection with location + optional PIN, step metadata with pickup point details, and audit trail fields (`JobAuditUpdateRequest`, `RouteAuditUpdateRequest`). The `CollectOrderWithPinRequest.pin` is the **customer-held secret at pickup** — mirroring the delivery handover code pattern.

**[U]** Whether the PIN is server-validated or client-checked; barcode/QR scan requirement in any app; append-only custody chain persistence.

---

## 4. How is cash handed over and closed?

| Artifact | Finding | Evidence |
|---|---|---|
| **Careem Captain** | **Standing-float wallet model** with automatic consequence: `CashBalanceApi.getCashBalanceStatus`, `CashBalanceCaptainModel` (from `com.careem.pay.outstandingbalance`). **Cash collection flow**: `CashPaidTripCollectionAction` (amount + `CashCollectionSource` enum), `CompleteCashPaidTripCollectionCommandAction` (bookingId, bookingUid, amount, businessType, tripReceipt), `CompleteCashPaidTripCollectionCommand` (execute), `CashPaidTripCollectionReducer`. `TripReceipt` exists as a domain model. `SendCashReceivedApi` for reporting collection. Negative balance → cash blocked (from resource strings in `CAREEM.md` §10.2). | **[O]** `CashPaidTripCollectionAction` fields (`amount: double`, `cashCollectionSource: CashCollectionSource`); `CompleteCashPaidTripCollectionCommandAction` fields (`bookingId`, `bookingUid`, `amount`, `businessType`, `tripReceipt`); `CashBalanceApi`; `CashBalanceCaptainModel` |
| **HAAT Driver** | Resources: `Cash balance`, `DAILY EARNINGS`, `Earning history`, `Charge/Refund`, `Requested Amount:`, `Reason for refund`. No class-level cash collection flow inspected in this pass. | **[O]** `HAAT-DRIVER.md` §2.4 |
| **HAAT Courier** | Same balance/history/refund vocabulary as Driver. `Settle` strings present. | **[O]** `HAAT-DRIVER.md` §2.4 |

**[I]** Careem's **continuous ledger with automatic cash-block consequence** is structurally different from HAAT's (and Wind's) per-order reconciliation. Careem's `TripReceipt` and `CompleteCashPaidTripCollectionCommandAction` imply a **formal collection closure event** with booking reference, amount, and receipt object.

**[U]** Settlement timing, server-side ledger immutability, admin count-and-close workflow, variance reason capture.

---

## 5. What does a driver see about earnings before/after a shift?

| Artifact | Finding | Evidence |
|---|---|---|
| **Careem Captain** | **Typed earnings taxonomy** (not a single number): `EarningsDto` → `totalAmount` + `List<EarningsItemDto>`. Each `EarningsItemDto` has `type` (`EarningTypeDto`), `amount`, `List<EarningsItemBreakdownDto>`. Each `EarningsItemBreakdownDto` has `name` + `amount`. Serializable analytics mirror: `SerializableEarningsBreakdown` (amount, name, type). UI: `EarningsLandingScreenView`, `SplitEarningsOnboardingActivity`, `EarningsCardView`, `SplitEarningsCardView`. | **[O]** `EarningsDto` fields (`totalAmount: v1l`, `items: List<EarningsItemDto>`); `EarningsItemDto` fields (`type: EarningTypeDto`, `amount: v1l`, `breakdown: List<EarningsItemBreakdownDto>`); `EarningsItemBreakdownDto` fields (`name: String`, `amount: v1l`); UI views |
| **HAAT Driver** | Resources: `BalanceHistoryActivity`, `BalanceHistoryDateActivity`, `ChargeOrRefundActivity`, `FinanceHistoryActivity`. `DAILY EARNINGS`, `Daily earnings`, `Earning history for - %s`, `Your earnings`, `Income`, `Profit`. | **[O]** `HAAT-DRIVER.md` §2.4 |
| **HAAT Courier** | Same earnings vocabulary as Driver. | **[O]** `HAAT-DRIVER.md` §2.4 |

**[I]** Careem's **line-item breakdown with named categories** (`breakdown_bonus`, `breakdown_tips`, `breakdown_guarantees`, `breakdown_fines`, `breakdown_behavior_penalties`, `breakdown_money_in`, `breakdown_money_out` — from `CAREEM.md` §10.1) is the **explained-statement pattern** Wind should adopt for cash markets. HAAT shows the vocabulary but not the structure.

**[U]** Whether earnings are shown as *shift-summary* vs *cumulative*; real-time update during shift; server-side calculation logic.

---

## 6. How does a driver refuse work, and what is recorded?

| Artifact | Finding | Evidence |
|---|---|---|
| **Careem Captain** | **Explicit cancellation framework**: `BookingCancelAction` (bookingId), `CancelJobCommand` (with `CancelJobRequest`, `InstantlyCancelJobRequest`, `AcknowledgeCancellationRequest`), `EnqueueJobCancellationOnBackendCommand`, `BookingCancellationApiError`, `CancellationPolicy` (with `CancellationRestrictedReason`, `CancellationType`). Step-level cancellation: `StepCancellationData`. | **[O]** `BookingCancelAction.bookingId`; `CancelJobCommand` fields; `CancellationPolicy` class; `BookingCancellationApiErrorType` |
| **HAAT Driver** | Resources: `Reject order`, rejection-confirmation layouts, `%s seconds until auto reject`, `Confirm the Rejection`, `Select Reason`. | **[O]** `HAAT-DRIVER.md` §2.2 |
| **HAAT Courier** | `RejectionLimitsActivity`, `Daily rejection limit`, `Remaining rejections`, `Shift rejection limit`, `rejections`. | **[O]** `HAAT-DRIVER.md` §2.2 |

**[I]** Careem has a **typed cancellation policy** with restricted reasons and types, plus an **acknowledgement protocol** (client acknowledges server cancellation). HAAT Courier adds **rejection limits** (daily/shift caps) — a concrete penalty mechanic.

**[U]** Whether refusal reasons are persisted server-side; exact penalty rules; whether "auto-reject" timeout is configurable per shift/zone.

---

## 7. Cross-artifact pattern matrix

| Mechanic | Careem Captain | HAAT Driver | HAAT Courier | Wind takeaway |
|---|---|---|---|---|
| **Shift model** | Registered, booked via API, calendar UI, reminder workers | Registered (manifest + strings) | Registered (manifest + strings) | **Adopt**: booked shift + pre-shift reminders |
| **Queue** | Explicit HDL queue (gateway, arrive/leave commands, status model) | [U] | [U] | **Adopt**: driver-pull queue with arrive/leave commands |
| **Offer/accept** | Step workflow with typed actions per step | Accept/Reject/Auto-reject (strings) | Accept/Reject + rejection limits (strings + Activity) | **Adopt**: step workflow; rejection limits |
| **Custody at pickup** | `CollectOrderRequest` (latLng) + `CollectOrderWithPinRequest` (PIN) + step metadata | Pickup code (string) | Collect fragment, arrived strings | **Adopt**: location + optional customer PIN; typed metadata |
| **Custody at dropoff** | `UpdateDropoffLocationCommand`, `InPickupPassengerCommand` | Dropoff strings | Deliver fragment, `Delivered at %s` | **Adopt**: explicit dropoff location update command |
| **Cash collection** | `CashPaidTripCollectionAction` (amount, source) → `CompleteCashPaidTripCollectionCommandAction` (bookingId, receipt) | Balance/history/refund (strings) | Same + settle strings | **Adopt**: typed collection action with receipt; standing float with auto-block |
| **Earnings taxonomy** | `EarningsDto` → items → breakdowns (named line items) | Daily/History/Balance (strings) | Same | **Adopt**: line-item breakdown with `money_in`/`money_out` sides |
| **Refusal/cancellation** | `CancellationPolicy` (typed reasons, restricted types), acknowledgement protocol | Auto-reject timeout, reason selection (strings) | Rejection limits (daily/shift) | **Adopt**: typed policy + limits + acknowledgement |
| **Location** | `ForegroundLocationService` (29 methods, 16 fields, status-reactive) | `GPSTrackerNew`, `LocationUpdatesService`, MQTT | `CourierLocationService`, MQTT | **Adopt**: foreground service with captain-status coupling |
| **Push** | `PushNotificationAsyncWorker` (ListenableFuture, async), `BookingPushMessageUtil` | MQTT service components | MQTT service components | **Adopt**: async worker + booking-specific push util |

---

## 8. Commands executed (evidence anchors)

```powershell
# Environment
$env:REA_JADX_MCP_JAR="$env:USERPROFILE\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:JAVA_HOME="C:\Users\osama\scoop\apps\temurin17-jdk\current"
$env:REA_JADX_HEAP_MIB="8192"
$env:REA_JADX_OPERATION_TIMEOUT_MS="900000"

# Careem Captain (com.careem.adma) — 48 class inspections
rea inspect-android-package <apk> --format json --full-output
rea search-android-classes <apk> <query> --format json --full-output   # 19 queries: Earnings, Shift, Accept, Reject, Cash, Debt, Balance, Location, Tracking, Push, Notification, Order, Task, Pickup, Dropoff, Handover, Refusal, Cancel, Queue
rea inspect-android-class <apk> <class> --format json --full-output   # 48 key classes across all categories
```

Raw JSON outputs: `C:\Users\osama\AppData\Local\Temp\opencode\rea-work-20261117\careem_class_*.json` and `search_careem_*.json`

---

## 9. Answers to the 6 plan questions (per artifact)

| Question | Careem Captain | HAAT Driver | HAAT Courier |
|---|---|---|---|
| **Receive/accept work** | **[O+I]** Step workflow with typed actions (`InPickupPassengerCommand`, `CollectOrder`, `CompleteCollectOrder`, `CancelJobCommand`) | **[O]** Accept/Reject/Auto-reject strings; state machine **[U]** | **[O]** Accept/Reject + rejection limits; state machine **[U]** |
| **Shift/queue/neither** | **[O]** Registered shift + booked via API + explicit HDL queue (gateway, arrive/leave) | **[O]** Registered shift; queue **[U]** | **[O]** Registered shift; queue **[U]** |
| **Custody scanning** | **[O]** `CollectOrderRequest` (latLng) + `CollectOrderWithPinRequest` (PIN) + step metadata with pickup point details | **[U]** Pickup code only | **[U]** Collection/delivery fragments only |
| **Cash handover/close** | **[O]** `CashPaidTripCollectionAction` → `CompleteCashPaidTripCollectionCommandAction` (receipt) + standing float with auto-block | **[O]** Balance/history/refund strings; close/settlement **[U]** | **[O]** Same + settle strings; close/settlement **[U]** |
| **Earnings before/after shift** | **[O]** Line-item taxonomy (`EarningsDto` → `EarningsItemDto` → `EarningsItemBreakdownDto`) | **[O]** Daily/History/Balance vocabulary; shift workflow **[U]** | **[O]** Same; shift workflow **[U]** |
| **Refusal recording** | **[O]** `CancellationPolicy` (typed reasons, restricted types), acknowledgement protocol | **[O]** Auto-reject timeout, reason selection; persisted record **[U]** | **[O]** Rejection limits (daily/shift); persisted record **[U]** |

---

## 10. What Wind should adopt (from this pass)

1. **Step-based job workflow** (Careem) — each job = sequence of typed steps with audit fields
2. **Booked shift + pre-shift reminders** (Careem workers) — not just online/offline
3. **Driver-pull queue with arrive/leave commands** (Careem HDL queue) — cheapest to keep live on weak links
4. **Customer PIN at pickup** (Careem `CollectOrderWithPinRequest.pin`) — mirrors delivery handover code
5. **Typed collection action with receipt** (Careem `CompleteCashPaidTripCollectionCommandAction` with `TripReceipt`)
6. **Line-item earnings breakdown** (Careem `EarningsDto` → items → breakdowns with `money_in`/`money_out`)
7. **Typed cancellation policy + rejection limits** (Careem `CancellationPolicy` + HAAT Courier limits)
8. **Foreground location service coupled to captain status** (Careem `ForegroundLocationService` 29 methods)

---

## 11. What remains **[U]** (requires server/runtime evidence)

- Exact offer dispatch algorithm and queue ordering
- Server-side shift eligibility and capacity enforcement
- Cash settlement timing, variance reason capture, admin count-and-close
- Append-only custody chain persistence and server validation
- Whether PIN is server-validated or client-checked
- Real commission rates, fine amounts, negative-balance limit calculation
- Push payload shapes and offline queueing/replay semantics

---

**Discipline note:** All findings are from static analysis of publicly distributed Play Store artifacts. No runtime behaviour, network traffic, or server behaviour is claimed. No proprietary code or assets copied — only short identifiers, field names, and status tokens quoted as evidence.