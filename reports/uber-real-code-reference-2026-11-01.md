# Uber rider app — real-code reference for Fastship (internal)

**Prepared:** 1 November 2026 · **Target:** `com.ubercab` 4.654.10002 (versionCode 322019), base APK `device-base.apk` 207,761,677 bytes, SHA-256 `55663c73…c3e4a2` — the same build as `docs/RESEARCH-2026-10-31-rea-uber-app-reverse-engineering.md`.

**What this is:** the code-level companion to the fact documents. The earlier passes established *what the app does*; this one quotes *the real declarations* behind the behaviour that Fastship builds: lifecycle states, offers, boarding PIN, ETA uncertainty, money, realtime feed, request phases. Every excerpt is copied verbatim from the converted source tree with its file path, so a successor can open the full file.

**Internal document.** Unlike the `docs/KNOWLEDGE-*.md` set it is allowed to name the toolchain (the hygiene-term rule applies to the shareable reports only).

**Use rule — read before copying anything:** Uber's code is proprietary. This document is a behavioural and contractual reference. Port the *shape* (state names, field semantics, error taxonomy, ordering guarantees) into Fastship's own TypeScript; do not paste Java into the repo. Anything Fastship ships must be written against `server/domain/*.ts` conventions and the SPEC files, not transcribed from here.

---

## 0. Where the real code is

| Item | Value |
| --- | --- |
| Source tree used | `C:\Users\osama\AppData\Local\Temp\opencode\uber\jadx-out2\sources` — **128,117 `.java` files**, 268.7 MB |
| Second full tree | `…\uber\jadx-out\sources` — 94,544 files, 177.4 MB (earlier run) |
| Partial sweep trees | `…\uber\sweepA` (99,172), `…\uber\sweepB` (107,082) — per-DEX slices |
| Package coverage in `jadx-out2` | 227 `com.ubercab.*` packages + `com.uber.*`; vendor (`adyen`, `braintree`, `google`, `squareup`, …) alongside |
| APK set | `…\uber\apk\com.ubercab\` (10 splits) + `…\uber\device-base.apk` |
| Toolchain that produced it | REA 6.8.0 + JADX (per `docs/RESEARCH-2026-10-31-…`), record in `research_notes/REA Uber app reverse engineering/` |

**Re-deriving the tree** (phone is attached as `R5CTB0FJP9Z`, APK is a local file already, so only the decompile step is needed):

```powershell
# source of truth is the phone; the split set is what is installed
adb -s R5CTB0FJP9Z shell pm path com.ubercab
# decompile the base split (jadx 1.5.6 is in …\uber\jadx-1.5.6.zip)
java -jar jadx.jar -d out --no-res --threads-count 4 device-base.apk
```

Tree paths below are relative to `…\uber\jadx-out2\sources\`.

---

## 1. Ride lifecycle — the states Uber actually ships

### 1.1 The four-status ride enum

`com\uber\model\core\generated\rtapi\models\rider\RideStatus.java`

```java
public enum RideStatus implements WireEnum {
    LOOKING(0),
    DISPATCHING(1),
    WAITING_FOR_PICKUP(2),
    ON_TRIP(3);
```

Reading: the rider-side state machine has **four** states and no `COMPLETED`/`CANCELLED` — termination is a separate request outcome (`TripCancellationType`), and completion is a property of the finished trip record. Fastship's `OrderStatus` (`src/model.ts:21`) carries `searching | assigned | at_pickup | in_transit | completed | cancelled | on_hold | returning`. The extra Fastship states are parcel-specific and fine; the point to keep is that Uber models **completion and cancellation outside the live-status enum**, which is what makes its status field safe to key UI off.

### 1.2 The status envelope the client polls/streams

`…\services\marketplacerider\ClientStatus.java`

```java
public class ClientStatus extends f {
    private final Boolean isArriving;
    private final Boolean isConcurrencyEnabled;
    private final JobUuid lastRequestJobUUID;
    private final String lastRequestMsg;
    private final String lastRequestNote;
    private final TripCancellationType lastRequestType;
    private final Meta meta;
    private final RideStatus status;
    private final String statusDescription;
    private final TripPendingRouteToDestination tripPendingRouteToDestination;
```

Two things worth copying as ideas:

- **`isArriving` is a separate boolean, not a status.** "Driver is arriving" is a sub-condition of `WAITING_FOR_PICKUP`, which is why the status count stays at four.
- **The last request's result rides in the same envelope** (`lastRequestType`, `lastRequestNote`, `lastRequestMsg`, `lastRequestJobUUID`). A client that reconnects mid-flight learns *why* its last action ended without a second call — this is the pattern Fastship's `/api/orders/:id` serialization should keep when it adds offer history (WP10).

### 1.3 Pickup sub-states (the part Fastship's `at_pickup` lacks)

`…\services\marketplacerider\TripEventsPickupStatus.java`

```java
public enum TripEventsPickupStatus {
    UNKNOWN,
    EN_ROUTE,
    ARRIVING_SOON,
    ARRIVED_WAITING,
    ARRIVED_WAITING_LATE,
    ARRIVED_CHARGING,
    ARRIVED;
```

`…\services\marketplacerider\TripEventsPickupState.java`

```java
public enum TripEventsPickupState {
    EN_ROUTE,
    ARRIVED_WAITING,
    ARRIVED_LEAVING_SOON,
    ARRIVED_WAITING_PAUSED,
    ARRIVED_CHARGING,
    ARRIVED_CHARGING_PAUSED;
```

Reading: `ARRIVED_WAITING → ARRIVED_WAITING_LATE → ARRIVED_LEAVING_SOON` is the driver-side waiting timer expressed as states, and `*_PAUSED` / `ARRIVED_CHARGING` exist for the EV case (charging pauses the waiting clock). Fastship deliberately has no waiting fee (WP11 grace of 5 minutes, `RIDE_GRACE_MS`), so the **fee** half does not apply — but the `_PAUSED` idea does: a suspended clock (checkpoint, safety hold) must not be "arrived and leaving soon" at the same time.

### 1.4 Cancellation / termination taxonomy

`…\services\marketplacerider\TripCancellationType.java`

```java
public enum TripCancellationType implements WireEnum {
    CLIENT_CANCELED(0),
    DRIVER_CANCELED(1),
    AUTO_CANCELED(2),
    REQUEST_EXPIRED(3),
    FORCE_ENDED(4),
    UNKNOWN(5);
```

Fastship's `cancelled` status currently collapses these. If cancellation accounting (WP13/WP15) needs to distinguish "rider cancelled" from "offer expired" from "admin ended", this six-value enum is the minimum that has proven sufficient in a production ride app.

### 1.5 Request-phase union

`…\services\marketplacerider\RequestStateUnionType.java`

```java
public enum RequestStateUnionType {
    UNKNOWN(1),
    PRODUCT_SELECTION(2),
    PRODUCT_CHECKOUT(3),
    LOCATION_EDITOR(4),
    REQUEST_BLOCKER(5),
    PLUS_ONE(6),
    NON_CORE(7);
```

Mapping to Fastship: `book` (product selection) → `quotes` (checkout) → `REQUEST_BLOCKER` is the interesting one — Uber models "you cannot request right now" as a **first-class screen phase with a reason**, not an error toast. Fastship returns `409` codes from quotes/dispatch; a blocker phase is the honest UI shape when dispatch is disabled or a restriction applies.

---

## 2. Offers — the real dispatch contract

`…\services\marketplacerider\GenericRiderOffer.java`

```java
public class GenericRiderOffer {
    private final Integer acceptWindowInSec;
    private final h<String, RiderOfferViewModel> linkedRiderOfferViewModels;
    private final TimestampInMs offerExpiryAt;
    private final ImmutableList<OfferTripState> offerTripStates;
    private final OfferUUID offerUUID;
    private final RiderOfferAdditionalStepsType riderOfferAdditionalStepsType;
    private final RiderOfferMetadata riderOfferMetadata;
    private final RiderOfferType riderOfferType;
    private final RiderOfferViewModel riderOfferViewModel;
    private final TripUuid tripUUID;
```

`…\services\marketplacerider\RiderOffer.java` is a union of exactly two shapes:

```java
public class RiderOffer {
    private final GenericRiderOffer genericRiderOffer;
    private final XToPoolOffer xToPoolOffer;
```

Reading, and the four decisions worth adopting in `server/domain/dispatch.ts`:

1. **`acceptWindowInSec` and `offerExpiryAt` are both sent.** A relative window for the countdown UI and an absolute instant for correctness under clock skew — Fastship currently sends only `expiresAt`. Adding `acceptWindowSeconds` on the offer row makes the driver app's countdown correct after a resume without trusting the device clock.
2. **`offerTripStates` is a list, not a single state** — an offer can be valid across several trip states, so the client filters instead of the server re-issuing.
3. **The offer is keyed by both `offerUUID` and `tripUUID`** — the lease and the trip are separable, which is what Fastship's `offerId` + `orderId` pair already does implicitly.
4. **`linkedRiderOfferViewModels` maps entity id → view model**, i.e. presentation data travels with the offer rather than being fetched per render.

### 2.1 Offer error taxonomy (the part with the most to steal)

Four separate error unions, one per verb:

| File (`…\services\marketplacerider\`) | Members |
| --- | --- |
| `AcceptOfferErrors.java` | `badRequest`, `notFound`, `rateLimited`, `unauthenticated`, `unauthorized`, `code` |
| `RejectOfferErrors.java` | `badRequest`, `rateLimited`, `unauthenticated`, `code` |
| `ExpireOfferErrors.java` | `badRequest`, `rateLimited`, `unauthenticated`, `code` |
| `AckOfferErrors.java` | `noActiveSessions`, `serverError`, `unauthenticated`, `code` |

What it says about the design: **accept is the only verb that can return "not found" and "unauthorized"** (the offer may be gone or may not be yours), while reject/expire only fail on malformed input, rate limit or auth. `AckOfferErrors` has *no* `badRequest` and *no* `notFound` — ack is fire-and-forget telemetry, and its unique failure is `noActiveSession`. Fastship's dispatch currently answers accept/decline with a shared `409` family; splitting them this way is what lets a driver client decide "retry" vs "drop the card".

---

## 3. Boarding PIN — server-issued, policy-driven, rotating

### 3.1 Why a PIN is requested at all

`com\uber\model\PinVerificationSchedule.java`

```java
public static final PinVerificationSchedule ALL_TRIPS;
public static final PinVerificationSchedule NIGHT_TRIPS;
public static final PinVerificationSchedule NOT_REQUIRED;
public static final PinVerificationSchedule UNKNOWN;
```

`…\services\marketplacerider\PinVerificationType.java`

```java
public enum PinVerificationType implements WireEnum {
    UNKNOWN(0),
    SAFETY_PREFERENCE(1),
    PICKUP_RISK_CONFIRMATION(2),
    PARTICIPANT_VERIFICATION(3),
    SAFETY_MODE(4),
    THIRD_PARTY_PARTICIPANT_VERIFICATION(5),
    PROVIDER_SETTING(6);
```

This is the single most transferable finding for Fastship's WP11. Fastship treats boarding as a **binary flag** (`boardingEnabled()`, `ride-lifecycle.ts:19`). Uber treats it as **policy + reason**: a schedule (`ALL_TRIPS` / `NIGHT_TRIPS` / `NOT_REQUIRED`) plus a typed reason the client can display (safety preference, risk confirmation, participant verification, provider setting). The reason is what makes the challenge explicable to the rider instead of an unexplained 4-digit demand.

### 3.2 The verification payload

`…\services\marketplacerider\PinVerificationInfo.java`

```java
public class PinVerificationInfo extends f implements Retrievable {
    private final Boolean isVerified;
    private final String pin;
    private final PinVerificationType pinVerificationType;
    private final QRCodeInfo qrCodeInfo;
    private final Boolean shouldShow;
    private final VerificationMethod verificationMethod;
    private final Boolean wirelessVerificationEnabled;
```

`…\services\marketplacerider\PinSpec.java`

```java
public class PinSpec {
    private final Boolean usePin;
```

`…\services\marketplacerider\QRCodeInfo.java`

```java
public class QRCodeInfo extends f implements Retrievable {
    private final String title;
    private final String url;
```

`com\uber\model\core\generated\rider\models\order\transport\waypoint\tasks\PinVerificationTask.java`

```java
public class PinVerificationTask extends f {
    private final PinVerificationBackwardCompatibilityInfo backwardCompatibilityInfo;
    private final Boolean isVerified;
    private final String pin;
    private final PinType pinType;
    private final PinQRCodeInfo qrCodeInfo;
```

Four design points Fastship does not have:

1. **`shouldShow` is separate from `pin`.** The server may hold the PIN while telling the client not to display it yet — that is how "PIN appears only when the driver is near" is implemented without a second round trip.
2. **`isVerified` is on the payload**, not inferred from a status change, so reconnects are idempotent.
3. **The alternative method is data**: `verificationMethod`, `wirelessVerificationEnabled`, `QRCodeInfo` — QR is the fallback when the rider cannot read a PIN aloud. Fastship's run-sheet/handover has a code only; a QR fallback is cheap (`qrCodeInfo.url` is just a URL).
4. **Two generations coexist** (`PinVerificationTask.backwardCompatibilityInfo`): the client accepts an old and a new shape rather than forcing an app update.

### 3.3 What Fastship should change (concrete)

| Fastship today | Uber's shape | Minimal change |
| --- | --- | --- |
| `newBoardingCode() = String(randomInt(1000,10000))` — generated at assignment, never rotates | server-issued `pin` + `isVerified` + `shouldShow` | keep the code, add `boarding_reason` (`safety_preference` \| `night` \| `provider_setting`) and `pin_issued_at` for rotation |
| `boardingEnabled()` boolean | `ALL_TRIPS` / `NIGHT_TRIPS` / `NOT_REQUIRED` | one enum in `eligibilityDefaults`, night window from the existing night-rate settings |
| failures counter only | `PinVerificationSchedule` + per-trip policy | unchanged (Fastship's lockout is already stronger) |

No expiry currently exists on `boarding_code`. Uber rotates the PIN; a `pin_rotates_at` column would close the one real gap (a code read over a shoulder stays valid for the whole trip today).

---

## 4. ETA — uncertainty is modelled, not implied

`com\uber\model\core\generated\eats\eater_growth\r2egateway\models\EtaRange.java`

```java
public class EtaRange {
    private final Integer max;
    private final Integer min;
    private final Integer raw;
```

`com\uber\model\core\generated\presentation\rider\matchingsignal\EtaAccuracy.java`

```java
public enum EtaAccuracy {
    UNKNOWN,
    LOW,
    MEDIUM,
    HIGH;
```

`com\uber\model\core\generated\go\rider\presentation\mop\models\metadata\ETAValidity.java`

```java
public class ETAValidity {
    private final d expiresAt;
    private final Duration expiresIn;
    private final d issuedAt;
```

`com\uber\model\core\generated\go\rider\presentation\mop\orderselectionbindings\ETAType.java`

```java
public enum ETAType {
    UNKNOWN,
    MIN_ETA,
    MAX_ETA;
```

This is directly relevant to the open item in `uber-parity.md`: Fastship's quotes are `uncertain` and never `feasible`, and the corpus is missing. (`EtaRange` is from the Eats gateway package; `EtaAccuracy`, `ETAValidity` and `ETAType` are rider presentation models — the package ships the same four ideas in several generated contracts.) The shape a measured ETA must carry:

- **a range with a raw point** (`min`/`max`/`raw`) rather than a single number;
- **an accuracy grade** (`LOW`/`MEDIUM`/`HIGH`) the UI can render differently;
- **validity stamps** (`issuedAt`, `expiresAt`, `expiresIn`) so a stale ETA is visibly stale instead of silently wrong;
- **min and max as separate bindings** (`ETAType`) — the display layer picks, the model does not collapse.

Fastship's `EtaResult = { seconds, estimated }` (`dispatch.ts:9`) is the two-value version of this. Adding `minSeconds`, `maxSeconds`, `accuracy` and `expiresAt` to the quote/ETA payload closes the parity gap without new infrastructure — OSRM already returns legs the range can be derived from.

---

## 5. Money — what Uber sends as strings

`…\models\rider\TripBalance.java`

```java
public class TripBalance implements Retrievable {
    private final String amount;
    private final int count;
    private final String currency;
    private final String detail;
    private final String endsAt;
    private final String label;
    private final String startsAt;
```

`…\services\marketplacerider\FareChange.java`

```java
public class FareChange extends f implements Retrievable {
    private final String changeType;
    private final String changeTypeText;
    private final String detailedMessage;
    private final String oldFare;
    private final String title;
    private final String updatedFare;
```

Reading: on the wire Uber ships **formatted decimal strings plus a currency code**, and a *pair* (`oldFare`, `updatedFare`) for a fare change, with title/detail already localized. Fastship's `money.ts` is deliberately the opposite — integer minor units, `RangeError` on unsafe aggregates, no floats on the live path. **Keep Fastship's internal representation**; the transferable part is the *event shape*: a fare change is an event carrying before/after plus a typed reason (`changeType`) and pre-rendered copy, which is exactly what `SPEC-change-destination.md` needs for the mid-trip re-quote.

### Waiting timer

`…\services\marketplacerider\DriverWaitingInfo.java`

```java
public class DriverWaitingInfo {
    private final String calloutText;
    private final TimestampInSec waitingEndTimestampSec;
```

An absolute end instant plus the copy to show. Fastship's 5-minute grace is a constant (`RIDE_GRACE_MS`); exposing `waitingEndsAt` on the order is a one-field change that lets the client count down without recomputing the window.

---

## 6. Realtime feed — the shape of a trip stream

`…\services\marketplacerider\TripEventsInfo.java`

```java
public class TripEventsInfo {
    private final TripEventsInfoEventUuid currentEventRef;
    private final ImmutableList<RiderUuid> currentMatchedEntityRefs;
    private final DriverWaitingInfo driverWaitingInfo;
    private final h<RiderUuid, TripEntity> entities;
    private final ImmutableList<TripEventsInfoEvent> events;
    private final h<String, Location> locations;
    private final TripEventsMatchLookingState matchLookingState;
    private final TripEventsMatchStatus matchStatus;
    private final String matchStatusDescription;
    private final String matchStatusDescriptionShort;
    private final String statusDescription;
    private final TripEventsInfoTimeline timeline;
    private final TripUuid tripUUID;
    private final TripEventsWalkingInfo walkingInfo;
```

`…\services\marketplacerider\TripEventsInfoTimeline.java`

```java
public class TripEventsInfoTimeline {
    private final Double progress;
    private final String tripStateDescription;
```

Pattern: the stream is **normalised**, not a pile of deltas — `entities` is a map keyed by id, `locations` is a map, `events` is an append-only list with `currentEventRef` pointing into it. A client that misses a frame re-renders from the snapshot; there is no "resync" endpoint. Fastship's `Realtime` class already issues cursor-based credentials and a snapshot-resync contract (`server/domain/realtime.ts`); this confirms the design and adds two fields worth having: `matchStatusDescriptionShort` (a short line for a compact card) and `timeline.progress` (0–1 for the progress indicator).

`com\uber\helix\trip_common\core\RiderTripState.java` defines the rider's top-level state as an interface whose implementations are the four variants (the converter renamed the classes, their `toString` keeps the names):

```java
public interface RiderTripState {
    // "ExitRiderTrip(destination=…)"   -> a(vd2.d)
    // "TripFeed(jobUuid, orderId)"     -> b(OrderId, String)
    // "TripMode(jobUuid, orderId)"     -> c(OrderId, String)
    // "TripRequestInProgress(jobUuid, tripRequestWrapper)" -> d(String, TripRequestWrapper)
}
```

Note the split: **feed vs mode vs request-in-progress** are separate top-level states, not flags on one trip screen.

---

## 7. Request phases for the booking sheet

Already covered in §1.5, but the practical note: `RequestState` carries one config object per phase (`ProductSelectionConfig`, `ProductCheckoutConfig`, `LocationEditorConfig`, `RequestBlockerConfig`, `PlusOneConfig`, `RequestNonCoreState`) and a `type` discriminator. Fastship's `book.tsx` is a single form; if the sheet grows past ride/parcel/freight selection, the discriminator-plus-payload shape is the one that has scaled to Uber's product count.

---

## 8. Mapping: Uber type → Fastship file

| Uber (real code) | Fastship today | Converge? |
| --- | --- | --- |
| `RideStatus` (4 states) | `OrderStatus` in `src/model.ts:21` | No — Fastship needs `on_hold`/`returning`; keep |
| `ClientStatus.lastRequest*` envelope | order serialization in `server/http` | **Yes** — add last offer outcome to the order payload |
| `TripEventsPickupStatus` / `PickupState` | `at_pickup` single status | **Yes** — add `arrived_waiting` / `arrived_leaving_soon` sub-state, and a paused variant for safety hold |
| `TripCancellationType` | `cancelled` | **Yes** if cancellation accounting (WP13/15) needs the reason on the record |
| `GenericRiderOffer.acceptWindowInSec` | `dispatch_offers.expires_at` only | **Yes** — cheap |
| `Accept/Reject/Expire/AckOfferErrors` | shared `409` family in `dispatch.ts` | **Yes** — split per verb |
| `PinVerificationSchedule` + `PinVerificationType` | `boardingEnabled()` boolean | **Yes** — this is the WP11 policy gap |
| `PinVerificationInfo.shouldShow` / `isVerified` | `boarding_code` + attempts | **Yes** — `shouldShow` + `pin_issued_at` |
| `QRCodeInfo` | none | Optional — `qrCodeInfo` is a URL, no new infra |
| `EtaRange` / `EtaAccuracy` / `ETAValidity` | `EtaResult { seconds, estimated }` | **Yes** — closes the "uncertain, never feasible" gap in `uber-parity.md` |
| `DriverWaitingInfo.waitingEndTimestampSec` | `RIDE_GRACE_MS` constant | **Yes** — one field |
| `FareChange` (old/new + typed reason) | `SPEC-change-destination.md` re-quote | **Yes** — event shape |
| `TripEventsInfo` normalised maps + `currentEventRef` | `server/domain/realtime.ts` cursor protocol | Already equivalent; adopt `timeline.progress` |
| `TripBalance` string amounts | `money.ts` integer minor units | **No** — Fastship is stricter, keep |

---

## 9. What this reference does **not** contain

| Not here | Reason |
| --- | --- |
| Dispatch ranking, surge, matching rounds | server-side; no code in the APK |
| Price computation | server-side; the APK only carries quotes and formatted strings |
| Route/ETA algorithms | OSRM-equivalent runs behind Uber's backend |
| Map camera maths | not in this source tree — the shipped formula is already documented in `docs/KNOWLEDGE-2026-11-01-uber-app-maps-deep-dive.md` §5 |
| Obfuscated first-party internals | the converter renamed Kotlin data classes to `a`/`b`/`c`; readable names survive mainly in `com.uber.model.core.generated.*` and `com.ubercab.*` packages |

**Limits of the evidence:** the tree was produced by a decompiler, so recovered generics, synthetic companions and `/* JADX INFO */` markers are artefacts, not Uber's source. Where the converter failed to restore an enum it emits constants plus a warning comment (`PinVerificationSchedule.java` shows this — the values are still exact). No excerpt above depends on a restored member that the converter flagged.

**Re-deriving a claim:** open the path in §0 and read the file. Anything not found there is not established by this document.

---

## 10. One line for the successor

Uber's transferable code shape is four ride states, an offer with a relative *and* absolute deadline and per-verb error unions, a PIN that is server-issued with a policy reason and a `shouldShow` flag, an ETA that is a range plus an accuracy grade plus validity stamps, and a realtime feed that is a normalised snapshot rather than a delta stream — five changes, all small, all inside files Fastship already has.
