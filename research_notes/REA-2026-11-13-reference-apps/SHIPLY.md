# SHIPLY PALESTINE — static REA reference (Palestinian regional Android app)

**Artifact:** `com.shiplypalestinemobileapp` v1.8530 (versionCode 310)
**Study date:** 2026-11-13 · **Method:** static only (no execution, no device)
**Engine:** REA 6.7.0 / jadx-headless-mcp 0.7.1 · **Artifact SHA-256:** `000335d479a369530706d1fd67e8805e0fcdf665a71012a0b22f4a1b7ff8e7fe`

> **This is the single most decision-relevant artifact in the study.** Shiply is a
> **full Palestinian parcel / logistics platform** (sender, recipient, employee, salesman,
> driver, business) built as an **Expo + React Native** app, and it is the only one of the
> four apps whose shipped artifact actually contains the parcel-delivery mechanics Wind
> needs to copy as a *pattern*: parcel status machine, COD vs card, a driver-facing side,
> a wallet with financial-difference reconciliation, a QR-based parcel identity, and a
> courier-service option ("JAYEEK") for same-day delivery.
>
> **Read the caveat in §4 preamble before using any of it.**

---

## 1. Artifact identity

| Field | Value | Source command |
|---|---|---|
| Package | `com.shiplypalestinemobileapp` | `rea inspect-android-package shiply__base.apk --format json` → `normalized_result.package_name` |
| versionName / versionCode | `1.8530` / `310` | same → `version_name`, `version_code` |
| Base APK size | 87,463,616 bytes (83.4 MiB) | `Get-ChildItem` on the APK set |
| Base APK SHA-256 | `000335d479a369530706d1fd67e8805e0fcdf665a71012a0b22f4a1b7ff8e7fe` | `rea inspect-android-package` → `subject.digest.sha256` (matches `Get-FileHash -Algorithm SHA256`) |
| DEX files | **7** (`classes.dex` … `classes7.dex`; 11,416,636 / 13,188,648 / 9,202,668 / 9,627,996 / 8,287,100 / 10,671,352 / 6,050,040) | ZIP central-directory listing |
| Class count | **28,585** (`raw_class_count` 28,585) | `rea inspect-android-package` → `normalized_result.class_count`; `raw_result.calls[load_apk]` |
| Resource count | **1,287** | same → `normalized_result.resource_count` |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 | same → `min_sdk`, `target_sdk`; manifest `android:compileSdkVersion="36"` |
| Signer | **not exposed** — `signature_verification: "not_performed"` | same |
| REA evidence id | `ev_927b34f56fc40e1c42db91f9aeeae8a0026cc95424ddd7c15f48c3f099f518fd` | same |
| Sibling splits | `shiply__split_config.ar.apk` (57,753 B, sha256 `bfbef7c8…b5f625`); `shiply__split_config.arm64_v8a.apk` (28,277,347 B, sha256 `67a4016a…723cd7`); `shiply__split_config.xxhdpi.apk` (136,564 B) | `Get-FileHash` over the APK set |
| Expo config version / iOS build | `app.config` `version: "1.8530"`, `ios.buildNumber: "313"` vs `android.versionCode: 310` | `assets/app.config` extracted from the APK |
| App label / name | `string/app_name` = `"Shiply"` | `aapt2 dump resources shiply__base.apk` |
| Play distribution stamp | `com.android.stamp.source = https://play.google.com/store`, `com.android.stamp.type = STAMP_TYPE_DISTRIBUTION_APK` | manifest `meta-data` |

**Tooling note.** `rea decode-android-resources` failed closed here too
(`capability_unavailable / unsupported_provider` — "apktool launcher was not found on the
selected Windows PATH/PATHEXT"). Resource strings were read with the Android SDK's
`aapt2` (`build-tools\36.1.0\aapt2.exe dump resources|strings`).
`rea extract-artifact` was not usable (case-insensitive filename collision on `res/`),
so assets were extracted by reading the ZIP central directory directly.

---

## 2. Declared surface

**Permissions (28)** — `rea inspect-android-package` → `normalized_result.permissions`:
`CAMERA`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `INTERNET`,
`MODIFY_AUDIO_SETTINGS`, `READ_EXTERNAL_STORAGE`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`,
`USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE`, `WRITE_EXTERNAL_STORAGE`,
`ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `ACCESS_WIFI_STATE`, `DOWNLOAD_WITHOUT_NOTIFICATION`,
`DETECT_SCREEN_CAPTURE`, `RECEIVE_BOOT_COMPLETED`, `POST_NOTIFICATIONS`,
`com.google.android.c2dm.permission.RECEIVE`,
`com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`,
`com.google.android.gms.permission.AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`,
`ACCESS_ADSERVICES_AD_ID`,
`com.shiplypalestinemobileapp.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
`SCHEDULE_EXACT_ALARM`, `BROADCAST_CLOSE_SYSTEM_DIALOGS`, `ACCESS_NOTIFICATION_POLICY`.

**Manifest observations (from `normalized_result.manifest.text`):**
- `android:supportsRtl="true"`, `android:allowBackup="true"` with
  `android:fullBackupContent="@xml/secure_store_backup_rules"` and
  `android:dataExtractionRules="@xml/secure_store_data_extraction_rules"` → **expo-secure-store
  backup rules are honoured**, i.e. tokens are excluded from cloud backup. Good hygiene.
- `android:usesCleartextTraffic` is **not** set to true anywhere in the manifest; the app
  talks to `https://shiplylogistics.com` and `https://jordan.shiplylogistics.com` only.
- `android:enableOnBackInvokedCallback="false"`.

**Exported components:**

| Component | Exported | Notes |
|---|---|---|
| `com.shiplypalestinemobileapp.MainActivity` | yes | LAUNCHER + deep links |
| `app.notifee.core.NotificationReceiverActivity` | yes | boot / exact-alarm permission re-arm |
| `io.invertase.firebase.messaging.ReactNativeFirebaseMessagingReceiver` | yes (`com.google.android.c2dm.permission.SEND`) | FCM receiver |
| `com.google.firebase.iid.FirebaseInstanceIdReceiver` | yes (`com.google.android.c2dm.permission.SEND`) | FCM receiver |
| `app.notifee.core.AlarmPermissionBroadcastReceiver` | yes | exact-alarm permission state |
| `androidx.work.impl.background.systemjob.SystemJobService` | yes (`BIND_JOB_SERVICE`) | WorkManager |
| `androidx.work.impl.diagnostics.DiagnosticsReceiver` | yes (`DUMP`) | WorkManager diagnostics |
| `com.google.android.gms.auth.api.signin.RevocationBoundService` | yes | Google Sign-In revoke |
| `androidx.profileinstaller.ProfileInstallReceiver` | yes (`DUMP`) | baseline profile |

**Deep links (from `MainActivity`'s intent filters + `app.config.android.intentFilters`):**

| Scheme | Host / path | Source |
|---|---|---|
| `shiply://` | any | manifest `data` + `app.config` `intentFilters[1]` |
| `myapp://` | any | manifest |
| `com.shiplypalestinemobileapp://` | any | manifest |
| `exp+shiplypalestine://` | any | manifest (Expo dev-client scheme) |
| `https`/`http` | `www.shiplypalestine.com`, `shiplypalestine.com`, `www.shiply.ps`, `shiply.ps`, `www.shiplylogistics.com`, `shiplylogistics.com`, `www.shiplytechnologies.com`, `shiplytechnologies.com`, `www.shiplyjordan.com`, `shiplyjordan.com` — **all with `pathPrefix "/p"`** | `app.config.android.intentFilters[0].data` (20 host/scheme pairs) |

**Observation:** the `/p` path prefix is used on *every* verified domain — a shareable
tracking/tracking-link convention. **Inference:** `https://<domain>/p/<code>` is Shiply's
public share-link format.

**App links for iOS** (`app.config.ios.associatedDomains`): the same 10 domains, and
`CFBundleURLSchemes: ["shiply"]`.

---

## 3. Client framework and stack

**Expo (SDK: `sdkVersion` present in `app.config` but not disclosed in the artifact) + React Native + expo-router.** The product logic is **JavaScript**, in `assets/index.android.bundle` — **not** in the 7 DEX files.

Evidence:
- `assets/index.android.bundle` — 10,847,624 bytes.
- `assets/app.config` (4,467 B) and `assets/app.manifest` (19,463 B) are **Expo app config /
  Expo Updates manifest** artifacts; `assets/expo-root.pem` is Expo's self-signed update
  certificate.
- **No `lib/` directory** → no `libreactnativejni.so`, no `libhermes.so`, no `libflutter.so`.
- `app.config.android.intentFilters` includes `exp+shiplypalestine` → Expo dev client scheme.
- `app.manifest` asset paths include `/assets/node_modules/expo-router/assets/…` → **expo-router**.
- `app.config.experiments.typedRoutes = true`; `app.config.extra.router.origin = false`.
- Native app classes are only four: `com.shiplypalestinemobileapp.MainActivity`,
  `MainApplication`, `BuildConfig`, `R` (`rea search-android-classes shiply__base.apk "com.shiplypalestinemobileapp"` → 4 matches out of 28,585). Everything else is library code.

### 3.1 What `assets/index.android.bundle` actually is — and how it was read **[OBSERVATION]**

The file starts with bytes `c6 1f bc 03 c1 03 19 1f 62 00 00 00 …` — it is a
**Metro bytecode bundle**, not a plain JS text file and not Hermes bytecode. Decoding it as
UTF-8 yields only **11.68 % replacement characters**, i.e. ~88 % of the bytes are valid
UTF-8 text: the bundle stores each module's **minified JavaScript source verbatim** in a
contiguous string blob, with a `(offset, size)` index.

Verification performed: an 8-byte `(u32 address, u32 size)` pair at file offset `0x000e7d24`
was decoded as `addr=0x17db1e, size=18678`, and `buf[0x17db1e : 0x17db1e+18678]` decoded as
clean printable UTF-8 beginning `"reviously logged in to right bottomContentopPressHeaderBarBu…"`.
A systematic scan for `(offset, size)` pairs that slice cleanly recovered **2,335 distinct
strings**, including the whole i18n/key table and the module bodies.

**Consequence for this study:** Shiply's product logic IS readable, but only as a
**minified, de-bundled string stream**, and the string table is **concatenated without
delimiters** — a key like `show_parcel_details` may be glued to a neighbouring string. Every
citation below therefore names the exact token *and* its byte offset in the bundle so a
reader can re-locate it.

**Working files** (outside the repo, in the session temp dir): the decoded bundle text,
the 2,335 recovered exact strings, and the per-topic hit dumps.

### 3.2 Stack inventory (from `assets/app.config` `plugins[]` and bundle strings)

`plugins[]`: `./withNotifeeAndroidFix`, `react-native-maps` (Google Maps API key present in
`app.config` and in manifest `meta-data` `com.google.android.geo.API_KEY`),
`@sentry/react-native/expo` (url `https://sentry.io/`, org `shiply-qw`, project
`shiply-customer`), `expo-image-picker`, `expo-secure-store`,
`@react-native-firebase/app`, `@react-native-firebase/messaging`, `expo-build-properties`,
`expo-font` (9 Noto Kufi Arabic weights), `expo-router`, `expo-splash-screen`,
`expo-localization`, `expo-audio`, `expo-video`.

Additional libraries resolved from bundle strings (57 distinct package names):
`@react-native-community/geolocation`, `@react-native-community/progress-bar-android`,
`@react-native-firebase/attributest`, `@react-navigation/{bottom-tabs,drawer,stack}`,
`expo-{asset,constants,development-client,linking,local-authentication,platform,updates,
google-fonts,linear-gradient,camera-altop}`, `react-native-{clipboard,gesture-handler,
linear-gradient,maps,masked-view,progress-view,push-notification,reanimated,safe-area-context,
screens,svg,ui-datepicker,vector-icons,walkthrough-tooltip,web,webview,worklets}`.

**Not present (observed absence):** no WhatsApp SDK or `whatsapp:` / `wa.me` intent
anywhere in the bundle; no AppsFlyer, Adjust, Branch, Amplitude, Mixpanel, Segment,
OneSignal, PostHog, or AppCenter; no Workbox/Service Worker for offline.

---

## 4. Product mechanics visible in the shipped artifact

> **Preamble — how to read this section.** All anchors are `assets/index.android.bundle`
> byte offsets. Strings are minified-source fragments, i.e. a **derived representation** of
> the app, not original source. Nothing here establishes runtime behaviour, server
> behaviour, or what any API returns. The route paths are recovered from the
> **expo-router** route table embedded in the bundle and are therefore high-confidence
> (a route path is a literal, not a guess).

### F-01 — The parcel domain model, recovered from expo-router routes **[OBSERVATION, high confidence]**

Recovered route table (175 candidates, de-duplicated; the `app/` tree is complete):

```
/(auth)/login  /auth/register/_layout  /auth/forgot-password  /auth/verify-account
/auth/on-boarding  /auth/guest-parcel  /auth/register/map-location
/(app)/(drawer)/(tabs)/home/{index,create-parcel,edit-parcel,edit-parcel-one-page,parcel-info,
   parcels,search-details,search-filters-details,notification-summary,notifications-list,camera}
/(app)/create-parcel/{_layout,index,edit-favourite-recipient}
/(app)/create-parcel-one-page/{_layout,index,edit-favourite-recipient}
/(app)/parcels/{_layout,index,edit-parcel,edit-parcel-one-page,parcel-info,parcel-image-viewer,
   notifications-list,notification-summary,recipient-search-filters,recipient-search-results,
   recycle-bin/index,scan-parcel-qr,search-details,search-details-v2,search-filters-details-v2,
   financial-differences,add-edit-content-details/index}
/(app)/recipient/{_layout,index,add-favourite-recipient}
/(app)/contacts/{_layout,index,edit-contact}
/(app)/wallet/{_layout,index,wallet-deposit,wallet-withdrawal,wallet-transactions,
   wallet-debts-details,wallet-details-requests-search,wallet-holds-details,
   wallet-request-confirmation,wallet-summary,request-details,transaction-details}
/(app)/bank-accounts/{_layout,index,add-bank-account,bank-account-details}
/(app)/invoices/{_layout,index,invoice-info,financial-differences,offers-discounts}
/(app)/invoices-report/{_layout,index,invoice-search-results}
/(app)/tickets/{_layout,index,[id],attachments,comments,history,create-ticket,
   ticket-search-details,ticket-search-results}
/(app)/reports/{_layout,index,user-search-report-detail,user-search-reports,
   user-search-template-create,user-search-templates}
/(app)/settings/{_layout,index,about,contact-us,delete-account,enable-visa-commision,faq,
   help-center,notification-settings,preferences,receive-preferences,security-list,
   terms-conditions,tutorial-settings,user-configurations,wallet-settings,change-language,
   change-password}
/(app)/store/{_layout,index,cart,checkout,orders,product-details}
/(app)/products-catalog/{_layout,index,main,all-products,categories,category-products,
   create-update-product,create-vendor,activate-categories,inventory-sources,
   inventory-sources-products,manage-product-inventory-sources,product-details,
   vendor-status-check}
/(app)/{profile/_layout,profile/index,profile/profile-phone-verification,
   identity-verification/_layout,identity-verification/index,compensations/*,returns/*,
   employees/*,salesmen/*,notifications/*,promotion-details/*,feedback/*,
   create-parcel-one-page/_layout}
```

**Observation:** Shiply is not a "consumer courier app". It is a **business parcel
platform**: sender → recipient → employee → salesman → driver → admin finance, plus a
**B2B product catalogue with a store/cart/checkout** and **tickets/comments/history**.

### F-02 — Parcel state machine (observed status vocabulary) **[OBSERVATION]**

The bundle contains a `parcelStatusColor` map keyed by parcel status. Recovered tokens
(bundle offsets in parentheses; neighbouring characters from the concatenated table are
shown in `()` to make the boundary explicit):

```
parcelStatusColor.Pending        (@1278004)
parcelStatusColor.Submitted      (@1372557)
parcelStatusColor.Draft          (@1220648 / @1594377)
parcelStatusColor.OnTheWay       (@1221237)
parcelStatusColor.Delivered      (@1083250)
parcelStatusColor.Returned       (@1304891)
parcelStatusColor.Resolved       (@1076060)
parcelStatusColor.postponed      (@2009816)
parcelStatusColor-finished       (@1740096)
parcelStatusColor-replaced       (@2020349)
parcelStatusColor-attempttodeliver_three_step (@932143)
parcelStatusColor-submitted_count (@1344838)
parcelStatusColor-delivered_1 / -delivered_2 / -delivered_3
parcelStatusColor-returned_1 / -returned_2 / -returned_3
parcelStatusColor-pending_1 / -pending_2
parcelStatusColor-onTheWay / -ontheway
parcelStatusColor-finished-delivered_2 / -finished-returned_3
```

**Observed state set (observation):** `Draft → Submitted → Pending → OnTheWay → Delivered`,
with side branches `Returned`, `Resolved`, `Postponed`, `Replaced`, and a **three-step
delivery-attempt** sub-state (`attempttodeliver_three_step`).

**Observed copy confirming the transitions (observation):**
- `"Agree and Continue to create parcel"` (@1221237) and `"Create Parcel Page could not be found."` (@1282360)
- `"Deleted parcels are stored for 7 days, after which …"` (@1282360)
- `"Add Note to the parcel"` (@1083250)
- `"Driver Notes must be at least 10 characters long"` (@932143)
- `"Parcel Price"`, `"Parcel Price Description"`, `"Additional Cost"`, `"total_delivery_costs"`
- `"The delivery window has passed, but your parcel can still be picked up today. Delivery will happen tomorrow."` (@1505723)
- `"Order created successfully"` (@1509025)
- `"changeParcelStatusPositionDriver"` (@932143, @1974177) — a route/function that moves a parcel to the driver's position state
- `"final_parcel_status_ids"`, `"final_status_id"` (@2169989) — a *terminal* status set is a distinct concept from the whole state set

**Inference (moderate):** Shiply separates "status" (what the parcel is doing) from
"final status" (which statuses close the parcel and stop further transitions) and from
"delivery attempt step" (a 3-step sub-progress on a single delivery). That three-axis model
is exactly what Wind needs for a parcel that may be attempted three times before failing.

### F-03 — Payment: COD *and* card, with an explicit order-type selector **[OBSERVATION]**

Recovered API paths (bundle string table; the `.js`/route suffixes are literal in the source):
```
/customer/checkout/save-address
/customer/checkout/save-orderBy
/customer/checkout/save-paymentCard
/customer/checkout/save-shipping
/customer/address
/customer/shiply/cart
/customer/cart/add/     /customer/cart/update
/customer/orders
/customerInvoices/{addInvoiceException,create,find,getCustomerInvoiceExceptions,
   getInvoiceExceptionTypes,getInvoiceExceptionStatuses,printInvoice,
   regenerateInvoiceCode,setInvoiceRecipientNamedRange}
/customer-invoices/{statuses,types,current-amount}
```

Recovered user-facing copy:
- `"You can change order type to Pay from the select box at the top of this page"` (@1505723) — and the same sentence twice more at @1506409 / @1506619
- `"You can change order type to Pay from parcel details section"` (@1506409)
- `"You can change order type to Buy/Return from parcel details section"` (@1065626)
- `"You can change order type to Replace from parcel details section"` (@1509025)
- `"is_payment_parcel"` (@2021843) — a parcel flagged as requiring payment
- `"shiply_store.please_select_payment_method"` (@948853)
- `"enable-visa-commision"` route (`/app/settings/enable-visa-commision`) + API
  `/users/agree-to-cover-visa-commision` (@1505723 region) → the platform charges a **commission on
  card payments** which the sender agrees to cover. The route text is `enable-visa-commision`
  (a transliteration typo of "commission"), consistently.

**Observation:** the parcel's **order type** is user-selectable and includes
**Pay / Buy / Return / Replace**, and **card payment** is a first-class checkout step
(`/customer/checkout/save-paymentCard`). **Inference:** "Pay" = cash-on-delivery (the
recipient pays the driver); "Buy" = the sender is buying the shipment; "Return" and
"Replace" are service-level variants that reuse the same parcel object.

**For Wind (cash-only constraint):** Shiply's *state machine* is reusable, its *payment
menu* is not. Wind should adopt the **order-type** axis (a parcel can be "send only",
"send + collect", "collect only", "return") but hard-wire the payment method to cash.

### F-04 — Financial reconciliation is a first-class module **[OBSERVATION]**

- Routes: `/app/wallet/*` (deposit, withdrawal, transactions, **debts**, **holds**,
  requests, request-confirmation, summary), `/app/bank-accounts/*`,
  `/app/invoices/financial-differences`, `/app/parcels/financial-differences`,
  `/app/returns/financial-differences`, `/app/invoices/offers-discounts`.
- Bundle strings: `"financial_differences_related_to_this_parcel"`, `"total_delivery_costs"`,
  `"Additional Cost"`, `"Parcel Price"`, `"show_current_debts"`, `"show_invoice_parcels"`,
  `"show_negative_parcels"`, `"cent_commission_value"` (@1109736),
  `"wallet_transaction_requests"`, `"wallet_transaction_requests_types"`.
- `GET /customer-invoices/current-amount` (@198804 region) — a running balance for the customer.

**Inference (strong):** Shiply models cash as a **ledger with named deltas**: expected
amount, amount due, amount collected, difference, and debt/hold. "Financial differences"
appears on parcels, returns, and invoices — i.e. the same reconciliation shape is reused
everywhere money can disagree with the paperwork.

**Why Wind cares:** Wind's "auditable cash ledger" constraint is exactly this shape.
Shiply's terminology is a ready-made vocabulary: *amount due* → *amount collected* →
*difference* → *debt/hold* → *invoice*. Adopt the vocabulary; re-derive the schema.

### F-05 — Driver side exists but is thin in the customer app **[OBSERVATION]**

Recovered driver-specific strings and API paths:
- `/parcels/changeParcelStatusPositionDriver` (@932143, @1974177)
- `"Driver Notes must be at least 10 characters long"` (@932143)
- `"How does the driver know I have parcels to pick up?"` (@1358796) — FAQ copy
- `"receive_preferences.error_getting_drivers"` (@1348015 region)
- `/driver-details/address/editUserAddress` (@2096394 region)
- `getDeliveryMethodDisplayName` (@1715520 region)
- `"assign"`-family strings: `"Assigned"`, `"assigning"`, `"assignment-returned_1"`,
  `"assignment-returned_2"`, `"assignment_returned_2"` (@2021854, @1313770)

**Observation:** the *customer* app contains only a slice of driver capability — a
"change position to driver" action, a driver-note field, and driver preferences
(receive-preferences). **Inference:** Shiply ships **separate driver and enterprise apps**
(the `app.config` lists `ios.bundleIdentifier: com.shiplypalestine.shiplypalestine` alongside
the Android customer package, and the Play domains include `shiplylogistics.com` /
`shiplytechnologies.com`). **Unknown:** whether a driver app exists as a separate artifact
was not established here — it was not in the provided APK set.

**Explicitly NOT observed in Shiply:** a job board, an offer/accept/decline handshake, an
external maps-URL handoff (`geo:`, `google.navigation:`, `maps.google.com`), or driver
earnings/settlement. Those mechanics were searched for and **not found** in this artifact.

### F-06 — "JAYEEK" is an optional same-day courier service **[OBSERVATION]**

Recovered copy and keys:
- `"Same-day delivery is available for this parcel. Do you want to activate JAYEEK?"` (@1269433)
- `"JAYEEK Service Quality"` / `"JAYEEK is Activated."` / `"JAYEEK not available for planned dates"` (@1372486)
- `"Are you sure you want to remove JAYEEK service?"` (@936115)
- `"Are you sure you want to remove JAYEEK?"` (@1233579)
- `"Disable JAYEEK service"` (@1039095)
- `"JAYEEK parcels"` (@1024053); i18n keys `showJayeekParcels` (@1108799), `show_jayeek_parcels` (@1117892),
  `same_day_jayeek_subtitles_` (@1258682)
- Asset names `customerJayeekSplash1.jpg` (@1152560), `customerJayeekSplash2.jpg` (@1158524)
- `"Keep same-day delivery"` (@1260829), `"same_day_delivery"` (@2095373),
  `"save_same_day_parcel"` (@1594377), `"same_day_cannot_revert_parcel"` (@1313770)

**Inference (moderate-high):** JAYEEK (جيك) is a **third-party same-day courier** that
Shiply offers as an *upgrade on a parcel*, with its own branded onboarding splash, its own
"service quality" concept, and an activation that is **not reversible** once a date is
committed. **JAYEEK is a "who physically carries it" dimension orthogonal to the parcel
status machine** — this is a good, transferable idea: Wind could model "standard delivery"
vs "same-day" as a **service level on the parcel**, not as a separate order type.

### F-07 — Address model: City + Village + Street, no street numbers **[OBSERVATION]**

The strongest single piece of evidence is the **CSV export header** embedded in the bundle
(@930638):

```
Creator name,Creation date,Type,Recipient Phone,Recipient Name,City,Village,Street,QR,
deliveredByUser,returnedDate
```

**Observation:** Shiply's parcel address is a **triple of City / Village / Street**, plus
a per-parcel **QR** value, a recipient name and phone, and two boolean-ish delivery
outcomes (`deliveredByUser`, `returnedDate`). **There is no street-number field.**

Supporting strings: `"additional-name"` (@2096394), `"additional_phone_number_detected"`
(@2095374), `"cant-change-address_type"` (@2096394), `"address_updated_successfully"`
(@2096394), `"unable_save_checkout_address_street_name"` (@1743375), `"editUserAddress updated successfully"`,
`"Address"` (@1221237), `"error_getting_cities"` (@1509025), `"cities"` (@1233579).

**Observation:** `additional-name` + `additional_phone_number_detected` + a
`address_type` that *"can't change"* ⇒ a parcel can carry **one primary recipient plus
additional recipients**, and the address **type** is fixed at creation.

**Inference (strong):** `City / Village / Street` is the canonical Palestinian municipal
address triple — it maps to the West Bank's city/village hierarchy and needs no house
number. **This is the single most transferable finding for Wind's landmark-address
requirement**, together with Souq Tulkarm's `landmark` field (see SOUQ-TULKARM.md F-02).

### F-08 — QR / barcode is the parcel identity **[OBSERVATION]**

- Native: ML Kit barcode scanning is present —
  `com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity`,
  `com.google.firebase.components:com.google.firebase.mlkit.vision.barcode.internal.BarcodeRegistrar`,
  `assets/mlkit_barcode_models/{barcode_ssd_mobilenet_v1_dmp25_quant.tflite,
  oned_auto_regressor_mobile.tflite, oned_feature_extractor_mobile.tflite}`.
- Routes: `/app/parcels/scan-parcel-qr`, `/app/parcels/qr`.
- API: `/parcels/findByQRCode`, `/parcels/qr`, `/parcels/scan-parcel-qr`.
- Strings: `"qr_updated_successfully"`, `"scanned_invalid_Q"` (@1024053), `"parcel_status[0]"`,
  `"parcel_status[1]"`, `"parcel_status[]"` (@2007907, @2212957).
- Also `play-services-code-scanner.properties` and `play-services-maps.properties` markers.

**Observation:** Shiply's parcel identity is a **QR code**; scanning it looks the parcel
up. **Inference:** the QR is how a driver and a customer meet without a phone call, and
how the parcel moves between staff (dispatcher → driver → recipient).

### F-09 — Notifications: Notifee + FCM, with the FCM auto-init path **disabled** **[OBSERVATION]**

Manifest `meta-data`:
- `com.google.firebase.messaging.auto_init_enabled = true`
- `com.google.firebase.messaging.notification_delegation_enabled = false`
- `com.google.firebase.messaging.default_notification_channel_id = @None`
- `com.google.firebase.messaging.default_notification_color = @color/white`
- `expo.modules.updates.ENABLED = true`, `EXPO_UPDATES_CHECK_ON_LAUNCH = ALWAYS`,
  `EXPO_UPDATE_URL = https://u.expo.dev/020aa5af-efc8-4d27-bb01-a6660826eb4e`
- `io.sentry.auto-init = false`

Native Notifee surface: `app.notifee.core.NotificationReceiverActivity`,
`ReceiverService`, `ForegroundService`, `RebootBroadcastReceiver`,
`AlarmPermissionBroadcastReceiver`, `NotificationAlarmReceiver`, `BlockStateBroadcastReceiver`,
`io.invertase.notifee.NotifeeInitProvider`.
Bundle API surface: `notifee.createChannel`, `notifee.createChannels`, `notifee.createChannelGroups`,
`notifee.deleteChannel`, `notifee.getChannel`, `notifee.isChannelCreated`, `notifee.isChannelBlocked`,
`notifee.displayNotification`, `notifee.createTriggerNotification`, `notifee.cancelTriggerNotification`,
`notifee.cancelDisplayedNotification`, `notifee.openNotificationSettings`,
`notifee.setNotificationCategories`, `notifee.registerForegroundService`,
`notifee.onBackgroundEvent`, `notifee.onForegroundEvent`.

**Observed:** the FCM **notification-delegation is off** (`notification_delegation_enabled = false`)
and the **default notification channel is `@None`** ⇒ when FCM delivers a `notification`
payload, Android has no default channel to route it to; the app is expected to render
**data messages** and call `notifee.displayNotification` itself with an explicit
`channelId`. The bundle contains the schema for that: `"notification.android.channelId"
expected a string value`, `"notification.android.actions"`, `"notification.android.style"`,
`"notification.android.tag"`, `"notification.android.asForegroundService"`,
`"notification.android.chronometerDirection"`, `"notification.android.ticker"`,
`"notification.android.category"`, `"notification.android.timeoutAfter"`.

**Inference (moderate):** Shiply handles push **entirely in JS** with Notifee, choosing the
channel per event type. This is a deliberate choice for an app with many notification
classes (parcel / invoice / wallet / ticket / feedback / chat).

**For Wind:** adopt the same split — FCM **data-only** messages, explicit `channelId` per
event class, `notifee.createChannel` on first use. It keeps Wind's notification copy
Arabic/English switchable in one place.

### F-10 — Crash + analytics: Sentry (auto-init off) + Firebase Analytics **[OBSERVATION]**

- `app.config.plugins` → `["@sentry/react-native/expo", {url: "https://sentry.io/",
  organization: "shiply-qw", project: "shiply-customer"}]`
- Manifest → `io.sentry.android.core.SentryInitProvider`, `io.sentry.android.core.SentryPerformanceProvider`,
  `io.sentry.auto-init = false` (Sentry is initialised from JS, not automatically).
- Bundle strings → `"Sentry SDK can't connect to Sidecar…"`, `sentry-ignore`, and the
  standard Sentry RN surface (`captureException`, `captureBreadcrumb`, `captureXhrBreadcrumbToReplay`,
  `makeNetworkReplayBreadcrumb`, `browserLinkedErrorsIntegration`, `buildFeedbackIntegration`,
  `enableAutoSessionTracking`, `sessionSampleRate`, `replaysSessionSampleRate`).
- Firebase Analytics is enabled: `firebase_analytics_collection_enabled = true`,
  `google_analytics_automatic_screen_reporting_enabled = true`,
  `google_analytics_default_allow_ad_storage = true`,
  `google_analytics_default_allow_ad_user_data = true`,
  `google_analytics_default_allow_ad_personalization_signals = true`,
  `delivery_metrics_exported_to_big_query_enabled = false`.
- `@react-native-firebase/attributest` is present.
- `delivery_metrics_exported_to_big_query_enabled` is a **Shiply-internal** flag — Shiply
  exports delivery metrics to BigQuery but this build has it **off**.

**Absent (observed):** no AppsFlyer / Adjust / Branch / Amplitude / Mixpanel / Segment /
OneSignal / PostHog / AppCenter.

### F-11 — Customer-facing extras **[OBSERVATION]**

| Feature | Evidence (bundle token) |
|---|---|
| Ratings | `recipient_rating_bad` (@1707033), `showRatingModal` (@2095373 region) |
| Feedback (structured, not just star) | `addCustomerFeedbacks`, `getParcelFeedback`, `FeedbackForm`, `FeedbackButtonManager`, `addFeedbackHandler` |
| Reorder / repeat | route `/orders/repeat-last` is Souq; Shiply has `"addParcelImages"`, `"Create Parcel"` — **no repeat-last route found** |
| Live tracking | route `/app/parcels/notification-summary` + `notification-summary`; FAQ copy `"How do I track my parcel to see if it has arrived?"` (@1358796) |
| Chat with support | `/app/tickets/{index,comments,attachments,history,create-ticket}`; `"threadedComment added successfully"`, `"addComment"`, `"addComment-arrow-right-outline"` |
| Voice messages | `"Microphone permission was denied. Recording is not available."` (@1509025), `"Voice recording saved successful"`, `"Voice recording saved successfully"`, `recording_in_progress-helper`, `Voice Message`; `expo-audio` plugin with `microphonePermission: "We need access to your microphone so you can record and send voice messages"` |
| Scheduling / delivery windows | `"The delivery window has passed, but your parcel can still be picked up today. Delivery will happen tomorrow."` (@1505723) |
| Referral / promo | route `/app/promotion-details/index`; `/app/invoices/offers-discounts`; `APPROVED_DISCOUNT` token (@1989381 region) |
| Identity verification | route `/app/identity-verification/index`; `"IsIdentityBlockingParcelCreation"` (@1974177) |
| Reporting | routes `/app/reports/*` with **user-search templates** (`user-search-template-create`) ⇒ operators can save a reusable report query |
| Offline | `"Error sending. Event queued."` (@1260829), `anon_0_createParcelDraft` (@1707033), `getParcelDetailsFromCreateParcelData` (@2005537) |
| Paracel draft | `"createParcelDraft"`, `Create Parcel Page could not be found.` |
| Recycle bin | route `/app/parcels/recycle-bin/index`; `"Deleted parcels are stored for 7 days, after which …"` (@1282360) |
| Share link | deep-link `/p` prefix on all 10 verified domains (§2) |
| WhatsApp ordering | **NOT observed** — zero `whatsapp`/`wa.me` hits in the bundle |

### F-12 — B2B / enterprise surface **[OBSERVATION]**

Routes `/app/employees/*` (create/edit employee, change-employee-password),
`/app/salesmen/index`, `/app/products-catalog/*` (vendors, categories, inventory sources,
`vendor-status-check`), `/app/store/{cart,checkout,orders}`, `/app/invoices-report/*`,
`/app/user-configurations`. API `/platform/users?q=`, `/employees/*`.

**Observation:** Shiply operates a **multi-tenant B2B distribution platform**: vendors own
products and inventory sources, employees and salesmen are managed, invoices are issued per
customer, and a user-approval workflow exists (`/platform/users/${id}/approve`).

---

## 5. Evidence table

| # | Finding | Command | Tool output anchor | Path / offset in `assets/index.android.bundle` |
|---|---|---|---|---|
| F-01 | Route tree | `rea search-android-classes` not applicable; route strings recovered by pattern over the decoded bundle | byte offsets in decoded bundle | `/(app)/(drawer)/(tabs)/home/create-parcel.js` @1296394 region; `/(app)/parcels/scan-parcel-qr.js`; `/(app)/wallet/wallet-deposit.js`; `/(app)/settings/enable-visa-commision.js` |
| F-02 | Status machine | pattern `parcelStatusColor[.\-][A-Za-z0-9_]+` over decoded bundle | 20 distinct tokens | `parcelStatusColor.Pending` @1278004, `.Submitted` @1372557, `.Draft` @1220648, `.OnTheWay` @1221237, `.Delivered` @1083250, `.Returned` @1304891, `.Resolved` @1076060, `.postponed` @2009816, `.replaced` @2020349, `.attempttodeliver_three_step` @932143 |
| F-03 | Payment / order type | pattern `is_payment_parcel\|change order type\|orderType` | 7 hits | `"You can change order type to Pay from the select box at the top of this page"` @1505723; `is_payment_parcel` @2021843; API `/customer/checkout/save-paymentCard` @198804 region |
| F-04 | Money reconciliation | pattern over routes + API strings | route + API lists | `/app/wallet/wallet-debts-details.js` @2032236 region; `financial_differences_related_to_this_parcel` @1740096; `total_delivery_costs` @1974177 |
| F-05 | Driver surface | pattern `driver\|Driver Notes\|positionDriver\|driverId` | 30 hits | `changeParcelStatusPositionDriver` @932143; `"Driver Notes must be at least 10 characters long"` @932143; `/driver-details/address/editUserAddress` @2096394 region |
| F-06 | JAYEEK courier | pattern `JAYEEK\|Jayeek` | 24 hits | `"JAYEEK is Activated."` @1372486; `"Same-day delivery is available for this parcel. Do you want to activate JAYEEK?"` @1269433; `customerJayeekSplash1.jpg` @1152560 |
| F-07 | Address triple | pattern over string table (CSV header) | 1 hit | `Creator name,Creation date,Type,Recipient Phone,Recipient Name,City,Village,Street,QR,deliveredByUser,returnedDate` @930638; `unable_save_checkout_address_street_name` @1743375 |
| F-08 | QR identity | manifest + route/API strings | manifest meta-data + bundle | `com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity`; `/parcels/findByQRCode`; `scanned_invalid_Q` @1024053 |
| F-09 | Notifee + FCM | manifest `meta-data` + bundle notifee API | 16 hits | `com.google.firebase.messaging.notification_delegation_enabled = false`; `default_notification_channel_id = @None`; `notifee.createChannel` @1008518 |
| F-10 | Sentry + GA | `app.config` plugins + manifest meta-data | plugin entry | `@sentry/react-native/expo` `{organization: shiply-qw, project: shiply-customer}`; `io.sentry.auto-init = false`; `delivery_metrics_exported_to_big_query_enabled = false` |
| F-11 | Extras | patterns per feature | 32–93 hits each | ratings @1707033; voice @1509025; scheduling @1505723; recycle bin @1282360; identity gate @1974177 |
| F-12 | B2B | route + API extraction | route list | `/app/products-catalog/vendor-status-check.js`; `/platform/users/${id}/approve`; `/app/salesmen/index.js` |

**Secondary evidence — native surface.** `rea search-android-classes shiply__base.apk "com.shiplypalestinemobileapp" --format json` → 4 matches
(`BuildConfig`, `MainActivity`, `MainApplication`, `R`) out of 28,585 classes ⇒ all product
logic is in JS. `rea inspect-android-package shiply__base.apk --format json` →
`normalized_result.manifest.text` for all component/permission/meta-data facts.

---

## 6. Unknowns and limits

1. **The JS is minified and de-bundled.** All strings above come from a concatenated string
   table; a token's neighbours may be a *different* string. The tokens themselves are
   literals from the module source and are reliable; anything reconstructed around them is
   inference.
2. **No API responses.** The API surface is *client-side* only. Whether Shiply's servers
   enforce COD, what the fee schedule is, whether the driver app exists, and how cash is
   reconciled server-side are all unknown.
3. **The driver app was not in the artifact set.** Whether Shiply has a separate driver
   build, an employee build, or a dispatcher build is **unknown**. The customer APK clearly
   expects *some* driver surface.
4. **No Arabic product copy was recovered.** The bundle contains English copy inline; the
   Arabic is presumably served by the API (`changeLanguage`, `ar-sa`, `locales`,
   `translation` markers present). **Shiply's Arabic wording, error messages and
   notifications are unknown from this artifact.** This matters a lot for Wind.
5. **Expo SDK / RN versions are not pinned in the artifact** in a form we could read
   (`sdkVersion` key exists in `app.config` but was not resolved).
6. **`app.config` leaks live credentials.** The artifact contains a Google Maps API key
   (`androidGoogleMapsApiKey` / `com.google.android.geo.API_KEY`), the iOS Maps key, the
   Expo project id (`020aa5af-efc8-4d27-bb01-a6660826eb4e`), the Sentry org/project, and
   the Vercel-style asset CDN domain. These are **not** reproduced in this document beyond
   the shape of the finding, and they are a shipping-hygiene problem Wind should not copy.
7. **`allowBackup="true"`** is set at the application level; only the secure-store rules
   exclude tokens. Whether parcel PII could still land in a cloud backup is **unknown**.
8. **`SYSTEM_ALERT_WINDOW`, `DETECT_SCREEN_CAPTURE`, `READ/WRITE_EXTERNAL_STORAGE`** are
   requested. Their use is not established here.
9. **Hermes vs Metro bytecode:** the bundle is Metro bytecode (module sources retained as
   text). It was **not** executed; the string-table reading is a static parse.
10. **No signer** exposed (`signature_verification: "not_performed"`).

---

## 7. What this means for Wind

**Adopt (pattern only — no code, no assets, no keys):**
- **Order type as a first-class axis on the parcel** — Send / Send+Collect / Collect /
  Return, with the type fixed at creation and changeable only in defined places (F-03).
- **Three-axis status model**: status × delivery-attempt-step × terminal-status-set (F-02).
- **`City / Village / Street` address triple with no house number**, plus a separate
  landmark field (F-07 + Souq Tulkarm F-02). Wind should combine the two.
- **QR as the parcel identity** so a driver and a customer meet without a phone call (F-08).
- **Money reconciliation vocabulary**: amount due → amount collected → difference → debt/hold
  → invoice, reused identically on parcels, returns and invoices (F-04).
- **Service level as a parcel attribute** ("same-day" upgrade), not a separate order type (F-06).
- **FCM data-only + Notifee with an explicit channel per event class** (F-09).
- **Per-parcel draft + queued-write on failure** ("Error sending. Event queued.") (F-11).

**Skip:**
- **Card payment** (`/customer/checkout/save-paymentCard`) and the **visa commission**
  feature — Wind is cash-only by constraint, and the commission adds a contractual
  relationship Wind does not want.
- **The exposed API keys and Expo/Sentry identifiers** shipped in the app config (limit 6).
- **Exposing the full B2B catalogue/store/checkout** (F-12) at launch. It roughly doubles
  the product surface and is a different business from parcel delivery.
- **`allowBackup="true"`** at the app level for an app holding addresses and parcels.

**Defer with an evidence gate:**
- **Sentry + Firebase Analytics with ad-storage ON** (F-10). Defer until Wind has a data
  protection position. Gate: a written decision on what Wind may collect, because
  `google_analytics_default_allow_ad_storage = true` plus parcel addresses is a
  combination Wind should not ship by accident.
- **Voice messages** (F-11). Attractive in a market where calls are expensive, but it
  needs `RECORD_AUDIO` and a store. Gate: confirm Wind's target handsets have a usable
  mic and that voice storage fits the 3G budget.
- **A separate driver app / job board.** Shiply's customer artifact does not contain one,
  so there is no evidence here to copy. Gate: find Shiply's actual driver artifact, or
  design the driver surface from Souq Tulkarm's `ready-queue` (SOUQ-TULKARM.md F-04).
- **Feedback + ticket system with attachments and threaded comments** (F-11). Gate: Wind
  should not build this before it has volume; Souq Tulkarm shows a much lighter
  chat-with-canned-replies pattern.
