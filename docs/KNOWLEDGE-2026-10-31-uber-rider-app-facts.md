# Android app composition & architecture reference — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Nature:** factual reference only. Every number below was observed directly from the app package installed on the owner's own test device (Samsung SM-A5360, Android 16) and from the vendor's own public technical publications. The app was never launched during the study, no vendor system or network service was contacted, and nothing here involves any other user's data. This file is the shareable facts edition; the internal research documents in this repository additionally contain tooling detail and procedure records that are not needed for these facts.

## 1. Build identity and packaging

- Package `com.ubercab`, versionName **4.654.10002**, versionCode **322019**, minSdk 29, targetSdk 36, compileSdk 36.
- Installable set = **10 APKs** (Play split delivery): `base.apk` 207,761,677 bytes (SHA-256 `55663c738053f8f9e11bc30f414d693473de1272082db4d3edf95b1ad1c3e4a2`), plus 9 splits. The split names alone map the product surface: `config.arm64_v8a` (all 13 native libraries), `VoipTwilio` (+ its arm64 config), `BarcodeScanner` (+ arm64 config), `GooglePaySdk`, `FlashNacional` (Brazil regional feature), `config.ar` (Arabic), `config.xxhdpi` (density).
- `base.apk` holds **23 code files defining 288,727 classes, plus 13,049 resources** (the code-inventory view lists 174,047 of the classes — see §3); the arm64 config split contains **zero code** (`android:hasCode="false"`) — all code lives in base and the feature modules. Per-module code: VoIP 170 classes, barcode 1,328 classes, Google Pay 145, FlashNacional 9.
- Language translations are **not in base**: all 35 `values*` tables there are configuration qualifiers (night/land/density/API-level); locale content ships in the language splits (e.g. `config.ar`).
- Curious artifact: base's default `app_name` string is an internal codename ("Proto SimpleStore"); the shipped launcher label resolves from elsewhere.

## 2. Distribution integrity

- All 10 APKs are signed with the **same certificate** (v2+v3 schemes, self-consistent): SHA-256 fingerprint `4003231ab42feb8d955e62fdfaa4fad59567054b9c6bbc3d950299ddfc268392`, subject `O=UberCab, CN=Jordan Bonnet`, validity 2010-10-15 → 2060-10-02.
- Every APK carries a **Google Play source stamp** (`CN=Android, O=Google Inc.`) — Play-distributed build.
- The device's own package manager reports the same signing certificate, so the studied files are exactly the installed build, not a mirror copy.

## 3. Architecture

- The apps are built on **RIBs** (Router / Interactor / Builder), Uber's open-source cross-platform architecture framework ([github.com/uber/RIBs](https://github.com/uber/RIBs), Apache-2.0): business logic drives the app in a deep tree of testable scopes; views stay shallow. Uber's own post on the driver app describes a core/non-core RIB tree with plugins and workers, built by ~40 teams ([Architecting Uber's New Driver App in RIBs](https://www.uber.com/us/en/blog/driver-app-ribs-architecture)).
- On this build the first-party class names are **readable, not renamed**: **125,670 of 288,727 class definitions (43.5 %)** carry `com.uber.*` (102,376) or `com.ubercab.*` (23,294) names — the feature tree is navigable by name, and the remaining 56.5 % are library, generated and short-name internals. *(Earlier editions of this file gave 67,408 of 174,047 from the code-inventory view; the class tables declare 288,727, verified against the platform's own inspector on three samples. The "2,558 `Router` classes" count below is a count within that inventory view.)*
- Dependency injection on Android is **Dagger** (constructors take `dagger.Lazy`; generated factory classes throughout). Uber's Needle project is the iOS/Swift counterpart, not Android.
- An in-app parameter-override debug screen (a RIB-based router) ships in this release build.

## 4. Vendor composition (class-namespace census)

| Category | Vendor | Classes |
| --- | --- | --- |
| Payments | Braintree | 219 |
| Payments | Adyen (incl. 3-D Secure) | 57 |
| Monitoring | Sentry | 40 |
| Analytics piping | Segment | 9 |
| Attribution | Adjust | 3 |
| Google platform | Play services (`com.google.android.gms`) | 927 |
| Google platform | Firebase | 151 |
| Attribution / analytics / messaging | AppsFlyer, Branch, Mixpanel, Amplitude, Stripe, Twilio (in base) | **0 each** |

Reading: **no third-party attribution or analytics SDKs ship in base** — growth measurement is first-party. Twilio VoIP is fully quarantined inside its feature module (with `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS` declared there, not in base). Barcode scanning is ML Kit. Payment flows integrate PayPal, Venmo, Google Pay and Adyen 3-D Secure activities.

## 5. Manifest and security configuration

- **46 declared permissions**; the sensitive set matches a location/voice/money product: coarse + fine location (**no background-location permission**), foreground-service (location/microphone/dataSync/mediaProjection types), camera, contacts, Bluetooth scan/connect, notifications, biometrics, exact alarm. No third-party attribution/analytics SDK ships in base; the Google platform advertising and install-referrer permissions (`AD_ID`, `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `BIND_GET_INSTALL_REFERRER_SERVICE`) are declared, as on most Play-distributed apps.
- **110 components, 26 exported** (`exported=true`), all intentional: the launcher/root activity and its App Link aliases (89 intent filters in the manifest in total, 72 of them on the 26 exported components), share-to-ride and Eats-fallback aliases, WhatsApp OTP autofill receivers (`com.whatsapp.otp.OTP_RETRIEVED`), payment-SDK activities (PayPal Connect, Venmo Connect, UberPay web authorization, Adyen challenge), FCM receiver, WorkManager internals.
- **38 intent filters are `autoVerify=true`** — verified App Links across hosts like `www.uber.com`, `m.uber.com`, `auth.uber.com`, `accounts.uber.com`, `trip.uber.com`, `wallet.uber.com`, `partners.uber.com`.
- Hardening configuration: `allowBackup="false"`, **network security config present**, no cleartext-traffic flag, no debuggable attribute, 3 direct-boot-aware components.
- **17 content-provider authorities**: 12 unexported FileProviders (help, documents, chat composer, bank statements, tax documents, APK download, …), 3 exported IPC providers (device sessions, SSO, SSO eligibility) whose code validates the calling app before serving, and 2 library/framework providers (AndroidX Startup, Picasso). The three custom-defined `<permission>` elements are all signature-level support-library boilerplate (C2D_MESSAGE, RECEIVE_BROADCAST, DYNAMIC_RECEIVER_NOT_EXPORTED), not custom security gates.
- TLS certificate pinning is a standard hardening option for this class of app; whether this build configures specific pins is a runtime property and was **not determined** by the study.

## 6. Security-relevant observations (authorized-review register)

For completeness, the study's candidate observations, stated factually. None was confirmed against a live system, and none is accompanied here by any procedure; the appropriate channel for any confirmation work is the vendor's authorized disclosure program. **All register entries were put through a formal evidence-based validation gate on 31 Oct 2026: none qualifies as a reportable finding today (F1 fails at demonstrated impact; the rest are defended-in-code or expected patterns), and the reports' cautious language is unchanged by validation.**

1. One exported broadcast component (parameters-override) has **no manifest-level permission protecting it** and its in-code feature gate **defaults to enabled**; the parameters it can change are determined by a server-driven catalogue cached on device. Severity would depend entirely on that catalogue's contents — not established.
2. The three exported IPC content providers **validate the caller's identity from the Binder UID** (resolved to a package name) and check it against a **static allowlist of 44 app-family packages** — 11 Uber app families (Rider, Eats, Driver, Postmates, Fleet, Freight, UberLite, Eats Orders, Restaurant Manager, Passenger, In-Car Tablet) each with production/internal/nightly/debug variants (full table in the companion reference §18.2).
3. A performance-debug entry scheme (`uber_performance_debug`) is accepted by the root activity in the release build.
4. WhatsApp OTP receivers and the payment-SDK activities follow standard integration patterns.

## 7. Resources and strings

- 15,380 default-locale string entries in base; localization by split (Arabic split present).
- Manifest-referenced scheme constants resolve to: `https` (third-party SSO redirect), `line.1486487802` (LINE messenger SSO), `fb277064115737714` (Facebook login app id).
- String resources contain **3 Google API keys** (`AIza…` format) — expected for Maps/ML Kit client keys on Android, restricted through the Google Cloud console; standard practice, not a misconfiguration finding. No AWS keys, no live payment secrets, no private-key material were present.

## 8. Product subsystem composition (wide class census, 31 Oct)

Exact class-name match counts across the build's code inventory, by product subsystem (first-party = `com.uber*`):

| Subsystem | Matches | First-party | Notable non-first-party content |
| --- | --- | --- | --- |
| ride | 10,442 | 10,406 | **Masabi JustRide SDK** (transit ticketing), first-party ads machinery (`com.uber.ads.rider`) |
| payment | 4,039 | 4,007 | Braintree client library |
| trip | 3,435 | 3,432 | Masabi JustRide UI, AndroidX car-app models |
| safety | 2,748 | 2,742 | **Google Play SafetyNet** references |
| identity | 1,744 | 1,658 | AndroidX Credentials (Play auth) |
| wallet | 791 | 784 | **Google Tap-and-Pay quick-access wallet** |
| chat | 584 | 584 | none — chat is 100 % first-party |
| auth | 580 | 508 | AndroidX Credentials |
| promotion | 211 | 211 | none |
| driver (in rider app: connect/checkout driver-notes flows) | 213 | 212 | SQLDelight (database driver naming) |
| fraud | 89 | 89 | none — includes a first-party screenshot blocker (`fraud_screenshot_defender.core.ScreenshotBlocker`) |

Reading: the ride subsystem alone is ~2.6× the payment subsystem and ~6× the maps-and-location class surface combined; payments embeds its vendor SDKs (Braintree/Adyen per §4) while chat, promotions and fraud are entirely home-grown; transit ticketing (Masabi) is the one notable vertical vendor outside payments/maps.

## 9. Device-state observations (owner's test phone, passive)

Observed on the connected test phone (Samsung SM-A5360, Android 16) — passive state reads and one launch, no UI interaction on the owner's account:

- Install source is **Google Play** (`com.android.vending`); the installed build is exactly the studied one (4.654.10002 / 322019) — package flags include `LARGE_HEAP`.
- Runtime permission grants on this device: fine + coarse location **granted**; notifications, camera, microphone **not granted**. Location mode is high-accuracy; no global location kill switch.
- On launch the app reaches its root activity (Vulkan is the system render engine selected for the app process) behind a first-run promotional/survey dialog; **no map is shown on the home surface** — the home layout is a card/list page in this build. Opening the destination screen does show a map, and on this device that map is drawn by the **Google Play services client** (Google attribution on screen; `androidmapsapi-*` / `google-maps-ini*` threads appear, no own-engine thread family), even though the shipped parameter default names Uber's own engine first (the 1 Nov maps deep dive documents both, §2.1–§2.2).

## 10. Native libraries (names and roles as shipped, arm64 split)

`libtensorflowlite_jni.so` (4.12 MiB, on-device ML), `libubermaps-gl.so` (3.91 MiB, Uber's own map renderer), `libvendor-mapdisplay.so` (3.74 MiB), `libeef0.so` (1.05 MiB, role unestablished), `libse.so` + `libse_loader.so` (a first-party wrapper over the open-source libsodium crypto library, behind a loader whose file is two-thirds stored data region — see the companion reference's addendum), `libml-imageproc.so`, `libh3.so` (Uber's open-sourced H3 hexagonal indexing), plus AndroidX graphics and crash-reporting helpers. None was studied at the instruction level; that would need a Linux analysis host and is a separate, optional effort.

## 11. Knowledge gaps (facts not yet collected)

- **Change comparison between releases** — needs a second build of the same app; the single-build numbers above will drift with every Play update.
- **Router/feature tree mapping** — the named class inventory supports it; estimated 1–2 days of focused work.
- **Native library internals** — needs a Linux host; only names/sizes are known.
- **The driver app** (`com.ubercab.driver`) is a separate product; none of the numbers above describe it.

## 12. Lessons applied to Fastship (our own repository, verified in-repo)

1. Our release exports only 5 components (4 framework-standard + the launcher); Uber's release carries 26 — external surface grows by default unless each component is a decision. Keep the pre-release package-inspection step in the release checklist.
2. Deep links: trip-share tokens are already server-validated (regex + SHA-256 against `orders.share_token_hash`, `server/domain/realtime.ts:87–90`) and order access is viewer-checked (`server/main.ts:359`); the remaining task is documenting that coverage for every `wind://` parameter (including the QA `wind-test-*` schemes).
3. Feature gates must fail closed: Uber's candidate observation #1 stems from a gate defaulting to enabled. Our `enableWorkloads` default is already `false` (`infra/main.bicep:11`) — keep security-relevant switches that way.
4. Feature modules (payments, VoIP, scanning, regional pricing) keep the base lean and isolate risky capabilities behind their own permission declarations — a packaging pattern worth remembering if Fastship's binary grows.

## 13. Source note

All figures come from the evidence set archived in this repository (146 files under `research_notes/`, in two dated folders) and from two public sources: the RIBs repository and Uber's driver-app architecture post. Where a statement says "not determined", that is a studied and reported absence, not an oversight.
