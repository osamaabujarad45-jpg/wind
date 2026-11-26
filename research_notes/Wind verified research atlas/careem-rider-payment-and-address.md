# Careem rider 26.43 — payment and address atlas supplement

**Artifact:** `com.careem.acma` 26.43, base APK SHA-256 `b19112d53d3e9a800ef35908fa48af57816d9f8f81b7a3897a7220f527127f58`.
**Scope:** static analysis only. This extends `research_notes/REA-2026-11-13-reference-apps/CAREEM.md` §11; it does not repeat its Arabic string tables.
**Labels:** **Observation** means present in the shipped artifact. **Inference** is an interpretation of that evidence. Neither establishes runtime or server behaviour.

## Evidence key

- **E1:** `rea inspect-android-package <apk> --format json` and `rea search-android-classes <apk> "" --format json` (each run once).
- **E2:** `rea inspect-android-class` on the named class. Same-digest saved REA evidence was reused for `PaymentTypeSelectionOption`, `Address`, `NewLocationModel`, the three activities, and the three gateways to avoid unnecessary APK reloads.
- **E3:** `rea inspect-android-method` on the named method; overload zero is used where stated.
- **E4:** `aapt2 dump resources <apk>`; local parsing of that output supplies resource IDs, values, and counts.
- **E5:** local `python -` DEX decoders for encoded static integers and resource-reference scanning, plus local parsing of the REA JSON for map-entry counts. These decoders read the APK only; they execute no app code.
- **E6:** `rea trace-android-references <apk> defpackage.l8i --method-name a --format json` to identify callers of the error mapper.

---

## 1. Payment

### 1.1 The booking option and the two different payment vocabularies

**Observation — E2.** `com.careem.acma.booking.model.local.PaymentTypeSelectionOption` stores `paymentType` as an `int`, alongside `paymentId`, `title`, `message`, `paymentCurrentStatusMessage`, `image`, `is3DSChargeEnabled`, `isExpired`, `isPackageOption`, `isPaymentTypeCash`, `businessInvoicePolicy`, and nullable `companyId`. Thus the four user-facing values already listed in the baseline are not, by themselves, the complete code-level taxonomy.

**Observation — E2 + E5.** The ride-hailing server class `com.careem.ridehail.payments.model.server.PaymentType` declares this complete constant set:

| Constant | Encoded integer |
|---|---:|
| `CREDIT_CARD_TYPE` | 1 |
| `INVOICE` | 2 |
| `USER_CREDIT` | 3 |
| `CASH_COLLECTION` | 5 |
| `CASH` | 6 |
| `DIGITAL_WALLET` | 7 |

The names come from `rea inspect-android-class`; the integers come from the class's DEX encoded-static-value array in `classes6.dex` (E5).

**Observation — E2 + E3 (`<clinit>`).** A separate shared enum, `com.careem.motcore.common.data.payment.PaymentType`, has six members with these serialized values:

| Enum member | `value` string |
|---|---|
| `CASH` | `cash` |
| `CARD` | `card` |
| `WALLET` | `wallet` |
| `CORPORATE` | `corporate_invoice` |
| `GOOGLE_PAY` | `google_pay` |
| `FAMILY_CIRCLE` | `family_circle` |

**Inference.** The six ride-hailing integer constants are the full declared server-side *vocabulary*, not proof that every constant is allowed for every booking. `PaymentTypeSelectionOption` proves that a booking option carries an integer type and a cash flag; its member inventory alone does not prove which of the six values a particular CCT receives. The shared enum must not be merged with the integer table: `CORPORATE`, `GOOGLE_PAY`, and `FAMILY_CIRCLE` belong to the former, while `CASH_COLLECTION` belongs to the latter.

**Observation — E1 and a failed exact-class lookup.** The class index contains `com.careem.acma.booking.BookingConfig$overrideAllowedPaymentTypesForCcts$toggleMap$1`, confirming the named override hook. However, `rea inspect-android-class <apk> com.careem.acma.booking.BookingConfig --format json` returns `Exact class not found`; the outer model is obfuscated/merged in this build. This pass therefore does **not** establish the override map's generic key/value types or any per-CCT subset. The baseline's toggle name should not be read as an enumeration of allowed values.

### 1.2 How a payment failure code becomes a message

**Observation — E3.** `defpackage.l8i` owns one `LinkedHashMap`. Its constructor populates string keys with Android `R.string` integer IDs. Its method `a(int, String): int` performs an exact-key lookup and returns the caller-supplied fallback resource ID when the key is null or absent.

**Observation — E3 (`defpackage.uzz.invoke`) + E6.** In the top-up caller associated with `PayAddFundsActivity`, the string `wk00Var.a` is passed to `l8i.a` with `R.string.topup_failed_generic` as fallback; the returned ID is then passed to `getString`. The same input string is also placed in analytics under `response_code_description`. The evidenced path is therefore:

`response string → exact LinkedHashMap key → string-resource ID (or topup_failed_generic) → localized getString result`.

This is an observed top-up code path, not a claim that every payment surface uses this mapper.

**Observation — E4 + E5.** The APK ships **27** `PAY_ERROR_*` string resources. **22** are uniquely numbered `PAY_ERROR_MESSAGE_PS_*` resources, with suffixes:

`1–7, 10–16, 26–28, 30, 32, 33, 36, 39`.

The mapper contains **49 entries**: **46 `PS-*` keys** (`PS-1` through `PS-45`, plus `PS-999`) and three bank/IBAN keys. Those 49 entries resolve to **25 distinct resources**: the 22 numbered resources plus three bank/IBAN resources. In other words, the numeric suffix is a **resource identifier**, not a promise that a separate string exists for every response code.

#### Exact `PS-*` aliases — new beyond the baseline string table

| String resource | Response keys mapped to it |
|---|---|
| `PAY_ERROR_MESSAGE_PS_1` | `PS-1` |
| `PAY_ERROR_MESSAGE_PS_2` | `PS-2` |
| `PAY_ERROR_MESSAGE_PS_3` | `PS-3`, `PS-9` |
| `PAY_ERROR_MESSAGE_PS_4` | `PS-4` |
| `PAY_ERROR_MESSAGE_PS_5` | `PS-5` |
| `PAY_ERROR_MESSAGE_PS_6` | `PS-6` |
| `PAY_ERROR_MESSAGE_PS_7` | `PS-7`, `PS-8`, `PS-21`, `PS-24`, `PS-29`, `PS-38`, `PS-45` |
| `PAY_ERROR_MESSAGE_PS_10` | `PS-10` |
| `PAY_ERROR_MESSAGE_PS_11` | `PS-11` |
| `PAY_ERROR_MESSAGE_PS_12` | `PS-12` |
| `PAY_ERROR_MESSAGE_PS_13` | `PS-13` |
| `PAY_ERROR_MESSAGE_PS_14` | `PS-14`, `PS-23`, `PS-37` |
| `PAY_ERROR_MESSAGE_PS_15` | `PS-15`, `PS-17`, `PS-18`, `PS-19`, `PS-20`, `PS-22` |
| `PAY_ERROR_MESSAGE_PS_16` | `PS-16`, `PS-25` |
| `PAY_ERROR_MESSAGE_PS_26` | `PS-26` |
| `PAY_ERROR_MESSAGE_PS_27` | `PS-27` |
| `PAY_ERROR_MESSAGE_PS_28` | `PS-28`, `PS-40` |
| `PAY_ERROR_MESSAGE_PS_30` | `PS-30`, `PS-31`, `PS-42`, `PS-44`, `PS-999` |
| `PAY_ERROR_MESSAGE_PS_32` | `PS-32`, `PS-34`, `PS-41`, `PS-43` |
| `PAY_ERROR_MESSAGE_PS_33` | `PS-33`, `PS-35` |
| `PAY_ERROR_MESSAGE_PS_36` | `PS-36` |
| `PAY_ERROR_MESSAGE_PS_39` | `PS-39` |

**Observation — E3.** The three non-`PS` entries are `BANK_NOT_SUPPORTED → PAY_ERROR_BANK_NOT_SUPPORTED`, `IBAN_ALREADY_USED → PAY_ERROR_IBAN_ALREADY_USED`, and `DUPL_IBAN → PAY_ERROR_IBAN_ALREADY_USED_SAME_ACCOUNT`. The other two resources in the 27-key family, `PAY_ERROR_ACCOUNT_AL_USED_SAME_ACCOUNT` and `PAY_ERROR_INCORRECT_PHONE_OTP`, are not entries in this particular map.

---

## 2. Address

### 2.1 Fields and what “mandatory” means at each layer

**Observation — E2.** `com.careem.motcore.common.core.domain.models.Address` has these 16 domain fields:

`id`, `name`, `location`, `street`, `area`, `building`, `buildingNumber`, `city`, `type`, `nickname`, `number`, `formattedAddress`, `distanceLocalized`, `prioritizeType`, `placeId`, `bookmarkId`.

`buildingNumber` and `number` are distinct fields. The apartment/villa validation key below concerns `number`; it is not evidence that `buildingNumber` is mandatory.

**Observation — E3 (`Address.<init>`, overload 0).** The constructor delegates to the overload that also accepts `bookmarkId` and performs explicit non-null checks only for the first argument, `id`, and for `location`. **Inference:** the DTO permits the other address fields to be absent at construction; DTO nullability must not be confused with form-level requiredness.

**Observation — E4.** The validation catalogue contains these exact default-locale strings (Arabic values remain tabulated in the baseline and are not duplicated here):

| Missing field | Resource / ID in this build | Exact default string |
|---|---|---|
| Area | `address_addressAreaMissing` / `0x7f15025d` | “Please enter the area of the address” |
| Building | `address_addressBuildingMissing` / `0x7f15025e` | “Please enter the building of your address” |
| Apartment/villa number | `address_addressNumberMissing` / `0x7f150264` | “Please enter apt/villa number” |

**Inference.** Area, building, and apartment/villa number are required by the validation flow represented by this copy. **Limit — E5:** a scan for these three resource IDs as DEX `const` operands and as binary XML references found no direct client call site. Dynamic/resource-name resolution remains possible, so the strings alone do not prove when or where validation fires. The firm statement is therefore: `id` and `location` are constructor-non-null; the dedicated required-field vocabulary covers area, building, and number, but this pass does not prove universal client-side enforcement.

### 2.2 Search/save activities and gateways

**Observation — E2 and same-digest saved method evidence.** `PickupSearchActivity` and `DropOffSearchActivity` share the `t2a0` base. Their type selectors are respectively `LocationType.Pickup` and `LocationType.Dropoff`; pickup also returns the mode identifier `pickup`. Drop-off selection can return a `LocationModel` in the `location_model` intent extra. `SaveLocationActivity` consumes `location_model` and an optional `booking_id`, and constructs `LocationPostModel` and `NewLocationModel` on save. Its local save-button gate checks one edit field through `l0()`/`t8u.u`; it does not reference the three missing-address resources above. These are static call/data-flow observations, not observed network saves.

**Observation — E2.** The gateways return `ResponseV2<List<NewLocationModel>>` but expose two endpoint families:

| Gateway | Declared search surface |
|---|---|
| `LocationSearchConsumerGateway` | `searchLocations(serviceAreaId, fieldType, lang, param, lat, lng, location-search-session-id, location-search-type, Booking-Id)` |
| `LocationSearchCoreGateway` | Same `location/5/nearby/search/...` signature and search/session headers as the consumer gateway |
| `LocationSearchLocationsGateway` | `searchCommuterLocations(...)` with `locationTypes`, and `searchMetroLocations(...)` with `locationTypes` and `radiusInMeters`, under `locations/v2/user/.../nearby/search/careem` |

**Observation — E2.** The declared transport fields on `NewLocationModel` are `_editableMoreDetails`, `_locationType`, `categoryLanguage`, `distance`, `googleTypes`, `id`, `latitude`, `locationSource`, `locationSourceType`, `longitude`, `mode`, `moreDetails`, `placeId`, `pointSource`, `searchComparisonName`, `searchDisplayName`, `searchDisplayNameLanguage`, `serviceAreaId`, `sourceUuid`, `updatedAt`, and `vicinity`. This is the gateway result shape; it should not be silently substituted for the 16-field domain `Address` above.

## Boundaries

- No activity, payment, search, validation, or save operation was executed.
- Actual per-CCT availability, server response codes, and validation triggers are not asserted.
- The failed `BookingConfig` outer-class lookup and the absence of direct references to the three address-validation resources are reported as limits, not filled in with guesses.
