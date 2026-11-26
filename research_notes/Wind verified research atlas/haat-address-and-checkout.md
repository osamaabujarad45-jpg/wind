# HAAT address form and checkout — code-level atlas

**Artifact:** `com.haat.client` 21.0.4, the same base APK documented in `research_notes/REA-2026-11-13-reference-apps/HAAT.md`.
**Purpose:** extend that report with the address and checkout implementation shape; resource copy, artifact counts and the earlier network pass are deliberately not repeated.
**Method:** static JADX inspection only. No screen was run and no server was contacted. Nothing below establishes runtime availability, server validation, payment capture or order acceptance.

## Evidence notation and exact commands

- **[O]** observation directly present in the inspected signature or method.
- **[I]** inference from those observations; never a runtime claim.
- **[U]** unknown from the permitted evidence.
- **INVENTORY** means `rea search-android-classes <apk> "" --format json`, followed by local filtering of the returned class names.
- **CLASS(C)** means `rea inspect-android-class <apk> <C> --format json`.
- **M(C.m)** means `rea inspect-android-method <apk> <C> <m> --format json`.
- **CTOR(C, n)** means the same method command for `<init>` with `--overload-index <n>`.

Only the five requested classes were inspected. `ClusterSelectionActivity`, `WebViewMessagePayload`, `CardUrlFields` and the R8-support types were not separately decompiled.

## R8 boundary

The useful public names survive, but most model and listener names do not. Examples actually returned by **CLASS** are `setupDeliveryLocation(apa)`, `d(bt2, apa)`, `setAddressActionListener(ya4)`, `setAvailablePaymentMethods(xd1)`, `setSelectedCreditCard(a92)`, `setDeliveryRestriction(dt2)` and `setRestaurantStatus(ti8)`. `apa` is used here as “the address-like model” and `f69` as “the area-like model”; those are semantic aliases, not recovered original names. The original declarations of `bt2`, `apa`, `ya4`, `bi7`, `rv0`, `xd1`, `a92`, `ti8`, `dt2`, `cb` and `fpa` cannot be deobfuscated from these five classes.

There is also a tool-addressing limitation in `AddEditLocationActivity`: requests for uppercase `C`, `S`, `W`, `Y` and `Z` returned the distinct lowercase `c`, `s`, `w`, `y` and `z` methods. For example, **M(AddEditLocationActivity.S)** returned `s(): java.util.List`. Consequently no behaviour is assigned to the uppercase case-collided methods. The synthetic forwarder `CreditCardWebHandler.a` also fell back to smali, but its Java target, `initDataBridge$lambda$0`, decompiled normally.

---

# Area 1 — address form

## 1.1 Fields actually present

**[O — M(AddEditLocationActivity.w)]** `activity_add_edit_location` binds the following inputs and controls:

| Concept | Static anchor | What the permitted methods prove about requirement |
|---|---|---|
| Area / cluster | `customEdtArea`; selected-area field `D: f69`; `apa.getAreaDescriptor()` exposes area ID/name | **Required before the `e0()` address-search path**: null `D` takes the area-picker branch and returns. Final-save validation is **[U]**. |
| Building number | `customEdtBuildingNo`; `a0(String)`; `apa.getBuildingNumber()`; `fieldBuildingNoError` | Presence and an error-view slot are proven. A universal required rule is **not** proven. |
| Building name | `customEdtBuildingName`; `apa.getBuildingName()` | No mandatory check appears in the inspected methods. |
| Street | `customEdtStreet`; `apa.getStreetToDisplay()`; raw `apa.getStreet()` is retained in `m0` | No mandatory check appears in the inspected methods. |
| Apartment | `customEdtApartment`; `apa.getApartment()` | No mandatory check appears in the inspected methods. |
| Floor | `customEdtFloor`; `apa.getFloor()`; `fieldFloorError` | Presence and an error-view slot are proven; the predicate is **[U]**. |
| Location name and type | `customLocationName`; `btnTypeHome`, `btnTypeOffice`, `btnTypeOther`; `b0(zb)` | `b0` hides the name for `zb.UNKNOWN` and selects HOME/WORK/OTHER. **[O — M(AddEditLocationActivity.E)]** a blank name is auto-filled with localized `home` or `office` for those two types, so a custom name is not inherently mandatory on that path. |
| Driver instruction | `noteComponent` (`ComponentOrderNote`); `apa.getDriverInstructions()`; `fieldInstructionError` | **[O — M(AddEditLocationActivity.d0)]** there is an explicit validation state showing `please_add_note_to_continue`. This does **not** prove that a note is always required; the predicate that calls `d0(true)` is outside the recovered methods. |
| Coordinates and city | `apa.getLatitude()`, `getLongitude()`, `getCity()` | Supporting model data, not additional free-text inputs in the inspected binding. |

**[O — M(AddEditLocationActivity.D)]** `D(apa)` is the central form-population method: it fills building number/name, apartment, floor, driver note, location name, street, coordinates, type and area descriptor. It tries to match the area ID against `N().f`, then falls back to the existing address descriptor or the other area-like field `E`. It also retains raw street/city and the driver instruction in `s0`. **[O — M(AddEditLocationActivity.V)]** the reset path clears those inputs and removes the instruction error.

This extends, rather than restates, HAAT.md's resource-level “area required / building and street optional” finding: the code proves the area gate for the **search path** and proves a note-error state, but the final save validator is not visible in the permitted methods. It would overstate the evidence to turn either into a universal server-side rule.

## 1.2 Observed flow order

1. **Initialise the editor and map.** **[O — M(AddEditLocationActivity.onCreate)]** `onCreate` initialises Places, obtains the address-like object through `J(): apa`, marks an existing non-null ID as edit mode (`W`), seeds street and driver-instruction state, installs model observers and attaches the map.
2. **Resolve an existing location, or establish a new one.** **[O — M(AddEditLocationActivity.A)]** edit mode calls `Q()` then `O()`. A new address with the relevant location conditions calls `Q()` and moves the map to the stored coordinates through `R`. Otherwise it invokes the current-location control and opens the service-area UI.
3. **Choose an area before Places search when none is selected.** **[O — M(AddEditLocationActivity.e0)]** null selected area `D` calls `kra.g0(...)` with `af3.LOCATION_DETAILS_AREA_FIELD` and returns. With an area present, it creates an `AutocompleteSessionToken`, enables search and either submits initial suggestions or searches the entered text.
4. **Move/search the map, then populate details.** **[O — M(AddEditLocationActivity.R)]** `R` centres the map at zoom 16; **[O — M(AddEditLocationActivity.D)]** `D(apa)` populates the form from the resulting address-like model. **[O — M(AddEditLocationActivity.T)]** current-location is separately gated by permission and location-enabled checks.
5. **Validate and save:** **[U]**. The inspected activity exposes validation UI and analytics (`B`, `F`, `G`, `X`) but no HTTP call or terminal persistence method. The case-collided uppercase methods and external `ca`/`qa` callback types prevent a truthful end-to-end save sequence from being claimed.

## 1.3 Area/cluster selection — and what `ClusterSelectionActivity` does *not* prove

- **[O — INVENTORY]** the APK contains `com.haat.client.ui.activity.dev.ClusterSelectionActivity`.
- **[O — local search of the five classes' inspection output]** none of their inspected signatures or methods references that class. Its `.dev` package suggests a development screen **[I]**, but package naming alone does not prove build role.
- **[O — M(AddEditLocationActivity.A)]** the inspected production-address path instead removes an existing `ServiceAreasFragment` and adds an R8-named fragment `l69` to `serviceAreaFragmentContainer`, passing `service_areas_list` and `event_source`.
- **[O — M(AddEditLocationActivity.e0)]** the other entry point delegates to `kra.g0(...)` with the service-area list and `LOCATION_DETAILS_AREA_FIELD`.
- **[O — M(AddEditLocationActivity.D)]** selection is reconciled by area ID, with area name/coordinates used to construct a fallback `f69` when no list match is found.

**Conclusion [I]:** the evidenced user-facing selector is a service-area fragment/helper flow, not a proven `ClusterSelectionActivity` launch. The cluster activity's fields, intent contract and whether any production build reaches it remain **[U]** under the five-class constraint.

## 1.4 Driver instruction capture and submission boundary

- **Capture [O — M(AddEditLocationActivity.w), M(AddEditLocationActivity.D)]:** free text lives in `noteComponent`, a `ComponentOrderNote`, not in the street/building `CustomEditTextView`s. `D(apa)` calls its note setter with `apa.getDriverInstructions()` and also retains that value in `s0`.
- **Validation presentation [O — M(AddEditLocationActivity.d0)]:** the error is `please_add_note_to_continue`, attached to `fieldInstructionError`, with the instruction card stroke changed to orange. `V()` clears that state.
- **Explicit handoff [O — M(AddEditLocationActivity.D)]:** the same method calls `N().d(new fpa(driverInstructions))`, where `N(): cb` is the activity's view-model-like collaborator. This is the only direct instruction handoff visible in the permitted activity methods.
- **Submission [U]:** `cb` and `fpa` were outside the allowed classes, and no endpoint/request serializer appears in the inspected activity. Therefore `N().d(...)` can be reported as a handoff, **not** as proof of an API save. Text-change forwarding from `ComponentOrderNote` and the final save request cannot be reconstructed without the external callbacks/model.

## 1.5 Checkout's address summary component

`ComponentAddress` is a summary/entry control, not the address editor:

- **[O — M(ComponentAddress.setupDeliveryLocation)]** delivery displays `apa.getTitle()` and `getSubTitle()` with `ic_next_forward_icon`.
- **[O — M(ComponentAddress.setupPickupLocation)]** pickup instead displays `getLocationName()` and `getBusinessLocation()` with `ic_show_map_icon`.
- **[O — M(ComponentAddress.d)]** `d(bt2, apa)` chooses delivery for `bt2` ordinal 0 and pickup for ordinal 1. A delivery address whose type ordinal is outside 0–3 gets `delivery_location` plus `add_delivery_location_to_continue`. It then applies the type icon and hides an empty subtitle.
- **[O — M(ComponentAddress.c), M(ComponentAddress.setAddressActionListener)]** the inflated `component_address` root has a click listener; `setAddressActionListener` stores a `ya4` in field `o`. The click implementation is external `o71`, so the exact callback emitted is **[U]**.

---

# Area 2 — checkout

## 2.1 How payment choice is made

**[O — CLASS(ComponentPaymentMethod), M(ComponentPaymentMethod.e)]** the component exposes buttons for `CASH`, `CARD`, `CIBUS`, `GPAY` and `TENBIS`; its selected value is `p: bi7`, read by `getPaymentMethod()`.

1. **[O — M(ComponentPaymentMethod.setAvailablePaymentMethods)]** server/model entries arrive as `xd1.getPaymentMethods()` (`rv0` items). Their names are matched case-insensitively to `bi7.a`. `supported` controls visibility and `isEnabled` controls opacity; unmatched or untagged buttons are hidden. Google Pay also has the independent `setCanUseGooglePay(boolean)` visibility gate.
2. **[O — M(ComponentPaymentMethod.d)]** tapping the already-selected method does nothing. An explicitly disabled `rv0` shows its `message` in a snackbar through the listener and does not select the method. Otherwise `d` calls `g(rv0, bi7)`.
3. **[O — M(ComponentPaymentMethod.g)]** `g` stores the selected `bi7`, resets card UI, marks exactly one method button selected and notifies the `or1` listener. The concrete listener behind it is R8-named `xe1`; payment processing is not implemented in this component.

## 2.2 Cash versus card

| Path | Static behaviour | Boundary |
|---|---|---|
| **Cash** | **[O — M(ComponentPaymentMethod.g)]** selects the CASH button and, for analytics, uses `rv0.getMessage()` specifically when the method is CASH. Like every non-CARD method, it takes the `xe1.O()` / `xe1.D()` listener calls. | Those two R8 listener methods cannot be semantically deobfuscated here. No cash order request or cash settlement is present in this component. |
| **Card, no selected card** | **[O — M(ComponentPaymentMethod.g), M(ComponentPaymentMethod.setSelectedCreditCard)]** selecting CARD with null `a92` shows `componentInsertCardPrompt`; non-CARD hides it. | The prompt's click is delegated through `or1`; this class does not itself instantiate the card WebView. |
| **Card, saved card supplied** | **[O — M(ComponentPaymentMethod.setSelectedCreditCard), M(ComponentPaymentMethod.setCardDetails)]** a non-null `a92` hides the insert prompt, shows `componentSelectedCard`, and populates card name/display value/image. | No PAN handling, tokenisation or charge call is visible here. |

**[O — M(ComponentPaymentMethod.g)]** changing payment selection calls `setSelectedCreditCard(null)`, so the component locally clears the previous selected-card presentation before applying the new method. **[U]** whether the owning screen retains or re-fetches the corresponding saved-card model is outside this class.

A separate ordinal-1 branch in `g` launches an `ef1` coroutine. Mapping that ordinal to a particular `bi7` member would require inspecting `bi7`; it is therefore not used above as a cash/card fact.

## 2.3 What `ComponentPlaceOrder` gates

**[O — CLASS(ComponentPlaceOrder)]** the gate inputs are `chooseLocationRequired` (`i`), `deliveryRestriction` (`g: dt2`), scheduled state (`b`), `canReceiveScheduleOrder` (`d`), `restaurantStatus` (`e: ti8`) and `cartValid` (`c`). **[O — M(ComponentPlaceOrder.a)]** `a(z): Pair` resolves them in this exact priority:

| Priority | Condition | CTA state and enabled flag |
|---|---|---|
| 1 | `chooseLocationRequired` | `CHOOSE_LOCATION`, **enabled** |
| 2 | `deliveryRestriction.isRestricted == true` | `DISABLED`, **disabled** |
| 3 | `z && canReceiveScheduleOrder` | `ORDER_FOR_LATER`, enabled |
| 4 | scheduled **or** `canReceiveScheduleOrder` | `ORDER_FOR_LATER`, enabled |
| 5 | restaurant status is `ti8.b` or `ti8.c` | `DISABLED`, **disabled** |
| 6 | `cartValid == false` | `CONTINUE`, **enabled** |
| 7 | otherwise | `PLACE_ORDER`, **enabled** |

**[O — M(ComponentPlaceOrder.e)]** these are real `TextView.setEnabled` changes with enabled/disabled colours. **[O — M(ComponentPlaceOrder.c)]** the two status states are associated through `vr1` mappings with “currently busy” and “currently closed” messages; exact enum-name mapping remains R8-dependent. The same method supplies order-for-later guidance when `z` is true.

Two nuances matter for an independent checkout design:

- Location-missing and cart-invalid are **CTA stage changes**, not hard-disabled buttons in this component. Only restriction and the two restaurant states return a disabled CTA in `a`.
- **[O — CLASS(ComponentPlaceOrder), M(ComponentPlaceOrder.setActionListener)]** no payment-method validity check and no order endpoint appears here. The component only calculates/display state and stores an `ur1` action listener. Actual submit-time payment validation and server idempotency are **[U]**, not something to infer from the CTA label.

## 2.4 WebView card contract

### Native boundary

**[O — CLASS(CreditCardWebHandler), CTOR(CreditCardWebHandler, 0)]** the primary constructor is shaped as:

`String + ydb logger + Function1<Boolean, Unit> cardSuccessCallback + Function1<WebViewMessagePayload, Unit> onWebViewData`.

The string is passed, without parsing in this class, into `WebViewInitDataBridge`. The synthetic constructor makes logger and `onWebViewData` optional/null **[O — CTOR(CreditCardWebHandler, 1)]**. `configureWebView` calls the superclass configuration and then `initDataBridge.setupBridge(webView)` **[O — M(CreditCardWebHandler.configureWebView)]**.

### `WebViewMessagePayload` shape visible at this boundary

- **[O — M(CreditCardWebHandler.initDataBridge$lambda$0)]** the handler reads `getEventName()` and `getData()`.
- One recognised data variant is `WebViewPayloadData.StatusResult`, which exposes `getStatus()`.
- A `StatusResult` whose event name equals `MessageType.PayloadEvent.CLOSE_WEBVIEW` sets `resultReceivedFromMessage`, logs status/event, and emits Boolean success only when status is exactly `"success"`.
- A non-`StatusResult` payload is forwarded unchanged to `onWebViewData`, if present.
- Other `StatusResult` event names are neither forwarded nor completed by this lambda **[O — same method]**.

Thus the verified contract is **event name + variant data**, with at least **status result** and a **close-WebView event**. Other payload variants and serialized key names are **[U]** because the model/deserializer were not among the five permitted classes.

### URL fallback

**[O — M(CreditCardWebHandler.shouldOverrideUrlLoading)]** before a bridge close result has arrived, a URL containing `"redirect"` is intercepted. Query `status=success` invokes the callback with true; `status=cancel` invokes it with false; either returns true. Other status values are consumed without a callback. Once `resultReceivedFromMessage` is true, redirects go to the superclass instead. Non-redirect URLs always go to the superclass.

### `CardUrlFields` limit

**[O — INVENTORY]** `com.haat.client.haats.web.models.CardUrlFields` exists. **[O — CLASS and all inspected CreditCardWebHandler methods]** none of the five permitted classes names it in a field, signature or method body. Its properties, JSON names, defaults and relationship to the constructor's opaque init-data string are therefore **[U]**. In particular, this atlas does **not** claim that `CardUrlFields` is the payload of `WebViewInitDataBridge`; proving that requires inspecting the model or bridge, which was outside scope.

---

## Implementation-safe takeaways for Wind

1. **Model address as area + map/search result + optional structural details + driver note**, but keep client and server validation distinct. The inspected client proves only specific gates, not universal field rules. **[I from M(AddEditLocationActivity.D/e0/d0)]**
2. **Use a service-area selector keyed by stable area ID**, retaining name/coordinates as display/fallback data. Do not treat the `.dev.ClusterSelectionActivity` name as evidence of the production contract. **[I from INVENTORY and M(AddEditLocationActivity.A/D/e0)]**
3. **Separate method availability, enablement and selection.** HAAT's `supported` hides a method, `isEnabled` preserves a visible explanation path, and selecting a method resets the card presentation. **[I from M(ComponentPaymentMethod.setAvailablePaymentMethods/d/g)]**
4. **Distinguish CTA progression from hard submission gates.** “Choose location” and invalid-cart “continue” remain actionable; restrictions and busy/closed states disable. **[O/I from M(ComponentPlaceOrder.a/e)]**
5. **Treat card completion as a two-channel client contract:** structured bridge close messages and a redirect fallback, with an explicit Boolean callback. Server verification and actual charge outcome are not established by this client code. **[I from M(CreditCardWebHandler.initDataBridge$lambda$0/shouldOverrideUrlLoading)]**

## Explicitly unproven

- Final address-save endpoint, request body and server-required fields.
- The predicate for `please_add_note_to_continue` and any final-save equivalent.
- Any production use of `ClusterSelectionActivity`.
- Actual cash settlement, card charging, 3DS outcome and order submission.
- Original names/implementations behind the listed R8 types and case-collided uppercase activity methods.
- Full serialized schemas for `WebViewMessagePayload` and `CardUrlFields`.
