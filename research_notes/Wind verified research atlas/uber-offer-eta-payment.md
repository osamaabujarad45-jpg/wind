# Uber rider 4.655: offer lifecycle, ETA contracts, payment and Arabic cash copy

**Artifact:** `com.ubercab` 4.655.10001, `uber-rider__base.apk`; Arabic from `uber-rider__split_config.ar.apk`.
**Scope:** static, read-only analysis of the shipped APKs. No app, server, device, network or runtime behaviour was exercised. This extends `research_notes/REA-2026-11-13-reference-apps/UBER-4.655-rider.md`; it does not repeat its artifact census, signing, map or packaging findings.

**Labels:** **[O]** observed in the named tool output; **[I]** inference from those names/types; **[U]** not established statically. No decompiled method body is reproduced below.

## Commands behind the evidence

The one and only class inventory was **C1**:

```powershell
rea search-android-classes $APK "" --format json > classes.json
```

It returned 174,898 materialised class names. All later class-name searches were local filters of that saved JSON, not new APK inventories. Focused member inspections used **C2**:

```powershell
rea inspect-android-class $APK "<exact-class-name>" --format json
```

The exact inspected names were:

- `com.uber.model.core.generated.rtapi.services.marketplacerider.GenericRiderOffer`
- `com.uber.model.core.generated.rtapi.services.marketplacerider.MarketplaceRiderApi`
- `com.uber.model.core.generated.rtapi.services.marketplacerider.StatusResponse`
- `com.uber.model.core.generated.rtapi.services.marketplacerider.ScaledOffers`
- `com.uber.model.core.generated.rtapi.services.marketplacerider.RiderOfferPushModel`
- the four `AcceptOfferErrors`, `RejectOfferErrors`, `ExpireOfferErrors`, `AckOfferErrors` classes in the same package
- `com.uber.model.core.generated.ue.types.common.EtaRange`
- `com.uber.model.core.generated.presentation.rider.matchingsignal.EtaAccuracy`
- `com.uber.model.core.generated.go.rider.presentation.mop.models.metadata.ETAValidity`
- `com.uber.model.core.generated.rtapi.models.payment.PaymentProfile`

For resources (**C3**), Android SDK build-tools 36.1.0 `aapt2.exe dump resources <apk>` was called through Python `subprocess.check_output`; stdout remained raw bytes until decoded as UTF-8 by Python. Base `()` values supply literal English and split `(ar)` values supply literal Arabic. PowerShell did not carry the Arabic text.

## Area 1 — offer lifecycle

### Delivery surfaces and payload

**[O | C1,C2]** `MarketplaceRiderApi.status(String, RiderUuid, StatusRequest)` returns `Single<StatusResponse>`. `StatusResponse` has `clientStatus`, `dispatchStatus`, `eyeball`, `scaledOffers`, `riderAppOrdersResponse` and related fields. Its `ScaledOffers` member itself exposes only `isPollingEnabled: Boolean` and `pollingIntervalMS: Integer` (apart from adapter/unknown-item machinery); it is not, at this member level, a list of `GenericRiderOffer`.

**[O | C1,C2]** A separate push surface is named by `RiderOfferPushModel`, `StatusResponsePushModel`, `com.ubercab.rider_offer_v2.push.RiderOfferRamenPluginFactory`, and `RiderOfferWorkerPluginFactory`. `RiderOfferPushModel` itself exposes only an `INSTANCE` singleton, so it is a marker/channel type here, not the offer payload. A polling path is also named by `PollingRiderOfferWorkerPluginFactory`.

**[I]** The client therefore ships both Ramen/push and polling plumbing around rider offers, with polling cadence represented as data. **[U]** Static names do not establish which surface delivered any particular offer, the active transport, server timing, or the envelope that wraps `GenericRiderOffer` on that transport. In particular, it would be wrong to claim that `StatusResponse.scaledOffers` directly contains the offer object.

### Offer fields

**[O | C2]** `GenericRiderOffer` contains:

| Field | Reported type / role visible in the model |
| --- | --- |
| `offerUUID` | `OfferUUID` |
| `tripUUID` | `TripUuid` |
| `riderOfferType` | `RiderOfferType` |
| `riderOfferViewModel` | `RiderOfferViewModel` |
| `linkedRiderOfferViewModels` | string-keyed map of `RiderOfferViewModel` |
| `riderOfferMetadata` | `RiderOfferMetadata` |
| `riderOfferAdditionalStepsType` | `RiderOfferAdditionalStepsType` |
| `offerTripStates` | `ImmutableList<OfferTripState>` |
| `acceptWindowInSec` | `Integer` |
| `offerExpiryAt` | `TimestampInMs` |

**[I]** This is both an identity/state contract and a presentation contract: stable offer/trip identifiers, a type, trip states, primary and linked view models, metadata/additional-step policy, and two deadline representations. **[U]** Nullability rules and which fields are required on the wire were not inferred from the field list.

### Accept, decline/reject, acknowledgement and expiry

**[O | C1,C2]** `MarketplaceRiderApi` declares all four verbs, each taking `(String, Map<String,Object>)` and returning `Single<Object>`:

- `acceptOffer` — acceptance; the class inventory also names `RiderOfferAcceptButtonCTA`.
- `rejectOffer` — the code's decline verb is **reject**, also matched by `RiderOfferRejectButtonCTA`.
- `ackOffer` — a distinct acknowledgement verb.
- `expireOffer` — a distinct expiry-reporting verb.

**[O | C2]** `GenericRiderOffer` carries both relative `acceptWindowInSec` and absolute `offerExpiryAt`. **[I]** A client can drive a countdown from the relative value and reconcile it against an absolute expiry, while `expireOffer` provides a separate transition/reporting path. **[U]** No inspected method body establishes that a local timer automatically calls `expireOffer`, nor what the server does after any verb.

### Typed error slots per verb

**[O | C2]** Each generated error model has a `code: String` plus the following typed slots:

| Verb model | Typed fields observed |
| --- | --- |
| `AcceptOfferErrors` | `badRequest`, `notFound`, `rateLimited`, `unauthenticated`, `unauthorized` |
| `RejectOfferErrors` | `badRequest`, `rateLimited`, `unauthenticated` |
| `ExpireOfferErrors` | `badRequest`, `rateLimited`, `unauthenticated` |
| `AckOfferErrors` | `noActiveSessions`, `serverError`, `unauthenticated` |

The slot types are generated exception models such as `BadRequest`, `NotFound`, `RateLimited`, `Unauthenticated`, `Unauthorized`, `NoActiveSession` and `ServerError`. **[U]** Field presence alone does not prove runtime exclusivity, HTTP mapping, retry behaviour, or which error a server will select.

## Area 2 — ETA: range, accuracy and validity

These are three separate generated models; the evidence does **not** show one object that necessarily contains all three.

| Contract | Exact observed surface | Command |
| --- | --- | --- |
| Range | `ue.types.common.EtaRange` has nullable-capable `Integer` fields `min`, `max`, `raw` | **C2** |
| Accuracy | `presentation.rider.matchingsignal.EtaAccuracy` is an enum with `UNKNOWN`, `LOW`, `MEDIUM`, `HIGH` | **C2** |
| Validity | `go.rider.presentation.mop.models.metadata.ETAValidity` has `issuedAt`, `expiresIn`, `expiresAt`; `expiresIn` is generated `Duration`, while the two instants use display type `kvc.e` | **C2** |

**[I]** The useful design is a point estimate (`raw`) accompanied by an interval (`min`/`max`), a coarse confidence grade, and issue/expiry information. Both relative (`expiresIn`) and absolute (`expiresAt`) validity are represented, mirroring the offer deadline pattern. **[U]** The units of `EtaRange` integers are not named by these fields, and no relationship among the three model packages is claimed.

**[O | C2]** `EtaRange` exposes only three short accessors plus standard value-object methods; `ETAValidity` likewise exposes three accessors plus standard methods. No computation, rounding, clamp, minimum-width rule, or `min <= max` enforcement is visible in these inspected member surfaces. **[U]** Bodies were not used to hunt for a formula, so this note makes **no** claim that the client computes ETA or never clamps it elsewhere. It also makes no claim about server ETA calculation.

## Area 3 — payment models and cash vocabulary

### Payment-method model

**[O | C2]** `rtapi.models.payment.PaymentProfile` is a broad instrument/profile model rather than a card-only type. Its fields include:

- Identity and presentation: `uuid`, `useCase`, `status`, `statusMessage`, `displayable`, `tokenType`, `tokenDisplayName`, `tokenData`.
- Selection policy: `supportedCapabilities: ImmutableList<PaymentCapability>` and `supportedUseCases: ImmutableList<UseCaseKey>`.
- Instrument-specific details: `cardType`, `cardNumber`, `cardBin`, `cardCategory`, `cardExpiration`, `cardExpirationEpoch`, `bankAccountDetails`, `personalDebitCardDetails`, `gobankDebitCardDetails`, `comboCardInfo`, `flexCardInfo`.
- State and linked value: `balance`, `hasBalance`, `isExpired`, `linkedPaymentProfile`, `networkTokenizationState`, `rewardInfo`, `amexReward`.
- Management/metadata: `managementFlows`, `createdAt`, `updatedAt`, `billingCountryIso2`, `billingZip`, `vendorData`, `authenticationType`, `analytics`.

**[O | C1]** Adjacent generated models include `PaymentProfileDetail`, `LinkedPaymentProfile`, `PaymentBundlePaymentMethod`, `PaymentCapability`, `UseCaseKey`, `Balance`, `CashChangeFeatures`, `ArrearsAction` and `ArrearsReason`.

**[I]** A payment selector should model identity, display, status, capabilities/use cases and instrument-specific details separately, rather than collapse every method into a card number or a single enum. Cash change and arrears have their own named model concepts. **[U]** No cash value for `tokenType`, no runtime eligibility rule, and no field layout for `CashChangeFeatures` is asserted here; the inspected `PaymentProfile` has no field simply named `cash`.

### Literal English ↔ Arabic resource pairs

**[O | C3]** These are resource values, not inferred translations and not proof of a live payment flow:

| Purpose / key | Base English | Arabic `(ar)` |
| --- | --- | --- |
| Cash — `cash` | Cash | الدفع نقداً |
| Pay for trips with cash — `pay_with_cash` | Pay for trips with cash | ادفع أجرة المشاوير نقداً |
| Cash on delivery — `eats_spender_arrears_payment_pay_with_cash` | Pay with cash on delivery | ادفع نقداً عند الاستلام |
| Cash at trip end — `ub__spender_arrears_v3_payment_pay_with_cash` | Cash at the end of this trip | الدفع نقداً في نهاية هذا المشوار |
| Arrears before next trip — `connect_cash_arrears_disclaimer` | If full cash payment is not made, you will be responsible for resolving the payment prior to your next trip. | إذا لم يتم الدفع نقداً بالكامل، فستكون مسؤولاً عن تسوية عملية الدفع قبل مشوارك القادم. |
| Deferred total at next trip — `cash_charge_modal_disclaimer` | You’ll be expected to pay the total amount in cash to the driver at the end of your next trip | من المتوقع أن تدفع المبلغ الإجمالي نقداً إلى السائق في نهاية مشوارك التالي |
| Same deferral case, v3 surface — `ub__spender_arrears_cash_deferral_modal_disclaimer` | You’ll be expected to pay the total amount in cash to the driver at the end of your next trip | سيتعين عليك دفع المبلغ الإجمالي نقداً إلى السائق في نهاية مشوارك التالي |
| Driver has no change — `cash_change_plus_one_title` | Remember, Your Driver Doesn't Provide Change | تذكَّر أن السائق لا يقدم المبلغ المتبقي عند الدفع نقداً |
| What happens to change — `cash_change_plus_one_message` | Pay cash at the end of this ride and any change owed will be applied to your next ride. Or you can get it back through PayPal. | ادفع نقداً في نهاية هذا المشوار، وسيُضاف المبلغ المتبقي المستحق لك إلى حسابك لاستخدامه في مشوارك القادم. أو يمكنك استعادته من خلال PayPal. |
| Parcel details — `connect_checkout_delivery_item_size_details_title` | Item details | تفاصيل الطرد |

**[I]** The copy separates three different cash states that a parcel product should not merge: ordinary cash payment/COD, an unpaid balance that must be resolved or is deferred to the next trip, and overpayment when a driver does not provide change. The parcel label is specifically `تفاصيل الطرد`, even though the base English resource says “Item details.” **[U]** Resource presence alone does not establish market availability, settlement logic, PayPal availability, or that any particular Arabic-speaking rider sees these strings.
