# Static teardown: Uber rider app 4.654.10002 (`com.ubercab`)

Analysis note · 30 Oct 2026 · tool: REA 6.8.0 (JADX 0.7.1, pinned) · target pulled from `R5CTB0FJP9Z`
(Samsung SM-A5360, Android 16/API 36) · **static only — the app was never executed for this pass**

---

## 1. Provenance

| Check | Value |
| --- | --- |
| Package / version | `com.ubercab` **4.654.10002** (versionCode **322019**), minSdk 29, targetSdk 36 |
| Pull | `pull-adb-package` → **10 APKs**, `coverage: complete`, `failures: []` |
| Base APK | **207,761,677 bytes**, SHA-256 `55663c738053f8f9e11bc30f414d693473de1272082db4d3edf95b1ad1c3e4a2` |
| Signing | v2 + v3, `self_consistent: true`, `schemes_agree_on_signer: true` |
| Certificate SHA-256 | `4003231ab42feb8d955e62fdfaa4fad59567054b9c6bbc3d950299ddfc268392` |
| Certificate subject | `O=UberCab, CN=Jordan Bonnet`, self-signed, 2010-10-15 → 2060-10-02 |
| Device cross-check | `dumpsys package com.ubercab` reports `Signatures: [40:03:23:…:83:92]` — **exact match** |
| Play source stamp | present (`CN=Android, O=Google Inc.`) → Play-distributed build |

The device-reported signer and the pulled `base.apk` signer are the same certificate, so the
artifact analyzed here is the build installed on the phone, not a mirror copy.

## 2. Artifacts

| File | MB | Role |
| --- | --- | --- |
| `base.apk` | 198.1 | code + default resources, 23 DEX (`classes.dex` … `classes23.dex`), **no native libs** |
| `split_config.arm64_v8a.apk` | 14.6 | all native libraries (13 `.so`) |
| `split_VoipTwilio.config.arm64_v8a.apk` | 11.2 | Twilio VoIP native code |
| `split_BarcodeScanner.config.arm64_v8a.apk` | 4.7 | barcode/ML native code |
| `split_config.ar.apk` | 2.2 | Arabic resources |
| `split_BarcodeScanner.apk` | 1.2 | feature module |
| `split_config.xxhdpi.apk` | 0.7 | density resources |
| `split_VoipTwilio.apk` | 0.3 | feature module |
| `split_GooglePaySdk.apk` | 0.09 | feature module |
| `split_FlashNacional.apk` | 0.02 | regional feature module (Brazil) |

Split names alone map the product surface: barcode scanning, VoIP calls (Twilio), Google Pay,
Brazilian "Flash" pricing, and Arabic localization. ABI and density are split out — which is why
`base.apk` carries no `lib/`.

## 3. Manifest facts

- **46 permissions**, **110 components** (36 activities, 2 activity-alias, 33 receivers,
  17 providers, 22 services), **26 exported**, `components.status: complete`.
- **174,047 classes**, **13,049 resources**, decoded manifest **103,309 bytes**.
- Location, camera, contacts, phone state, Bluetooth scan/connect, overlay, exact alarm,
  foreground-service location/microphone/media-projection/data-sync, screen-capture detection.

## 4. Exported surface (26 components, all `android:exported="true"`)

| Component | Kind | Permission | Notes |
| --- | --- | --- | --- |
| `com.ubercab.presidio.app.core.root.RootActivity` | activity | — | MAIN/LAUNCHER + NFC `NDEF_DISCOVERED` + VIEW |
| `…root.ShareToRideAlias` | alias | — | `ACTION_SEND` share-to-ride entry |
| `…root.UberEatsFallbackAlias` | alias | — | VIEW fallback |
| `com.uber.dragon_crawl_receiver.DragonCrawlActivity` | activity | — | VIEW |
| `com.uber.auto_trigger_elements.deeplink.AutoBugReporterActivity` | activity | — | VIEW, internal bug-reporter deeplink |
| `com.uber.identity.api.uauth.internal.helper.AppLinkActivity` | activity | — | VIEW + `com.whatsapp.otp.OTP_RETRIEVED` |
| `…whatsapp.WhatsAppOtpCodeReceiver` | receiver ×2 | — | WhatsApp OTP autofill |
| `com.uber.parameters.override_broadcast.ParametersOverrideRequestBroadcastReceiver` | receiver | **none** | action `com.uber.parameters.cli` — see §5.1 |
| `com.uber.identity.devicesessions.contentprovider.DeviceSessionsContentProvider` | provider | **none** | authority `com.ubercab.provider.ds` — see §5.2 |
| `com.uber.firstpartysso.provider.SSOContentProvider` | provider | **none** | authority `com.ubercab.provider.sso` — see §5.3 |
| `…SSOEligibilityContentProvider` | provider | **none** | authority `com.ubercab.provider.sso.eligibility` |
| `com.uber.payment.thirdparty.paypalclient.connect.PaypalConnectActivity` | activity | — | VIEW |
| `com.uber.payment.thirdparty.venmoclient.connect.VenmoConnectActivity` | activity | — | VIEW |
| `com.ubercab.presidio.payment.uberpay.operation.authorization.UberPayWebAuthorizationActivity` | activity | — | VIEW |
| `com.uber.payment.provider.common.custom_tab_switcher.CustomTabSwitchListenerActivity` | activity | — | VIEW |
| `com.adyen.threeds2.internal.ui.activity.ChallengeActivity` | activity | — | 3-D Secure challenge (SDK) |
| `com.uber.time.ntp.NtpBootCompletedReceiver` | receiver | — | `BOOT_COMPLETED` |
| `com.google.firebase.iid.FirebaseInstanceIdReceiver` | receiver | `com.google.android.c2dm.permission.SEND` | push |
| `androidx.profileinstaller.ProfileInstallReceiver` | receiver | `android.permission.DUMP` | baseline profile |
| `androidx.work.impl.diagnostics.DiagnosticsReceiver` | receiver | `android.permission.DUMP` | WorkManager diagnostics |
| `androidx.work.impl.background.systemjob.SystemJobService` | service | `BIND_JOB_SERVICE` | WorkManager |
| `androidx.browser.customtabs.PostMessageService` | service | — | Custom Tabs postMessage |
| `com.google.android.gms.auth.api.signin.RevocationBoundService` | service | `REVOCATION_NOTIFICATION` | GMS |
| `com.ubercab.video_call.base.VideoCallActivity` | activity | — | VIEW |
| `androidx.compose.ui.tooling.PreviewActivity` | activity | — | Compose tooling artifact in release |

25 unique names / 26 declarations — `WhatsAppOtpCodeReceiver` is declared twice, each with its own
`com.whatsapp.otp.OTP_RETRIEVED` filter (that is the ×2 row above).

No exported component carries a custom signature-level permission except the framework ones
(`DUMP`, `BIND_JOB_SERVICE`, `c2dm.SEND`). Everything Uber-specific relies on runtime checks.

### 4.1 Findings register

| # | Observation | Status | Provisional severity |
| --- | --- | --- | --- |
| F1 | `ParametersOverrideRequestBroadcastReceiver`: exported, no permission, sender unchecked, gate `xp_mobile/is_parameter_override_via_broadcast_allowed` defaults **true** | **Candidate** — needs test-account confirmation | Medium (impact depends on catalogue) |
| F2 | `DeviceSessionsContentProvider` exported without signature permission | Defended in code (`ValidateAppForIPCUseCase`) | Info |
| F3 | `SSOContentProvider` exported without signature permission (validated); `SSOEligibilityContentProvider` is a stub (all data methods throw) | Defended / no surface; SSO allowlist contents unknown | Info |
| F4 | `RootActivity` accepts debug scheme `uber_performance_debug` in a release build | Observation, exported by design | Low/Info |
| F5 | WhatsApp OTP receiver + `AppLinkActivity` accept `com.whatsapp.otp.OTP_RETRIEVED` | Standard integration; server validation assumed | Info |
| F6 | Imported payment SDK activities exported (Adyen 3DS, PayPal, Venmo, UberPay) | Normal SDK pattern, host-bound | Info |

Only F1 is worth a report unless Phase 3 below proves otherwise.

## 5. Deep dives

### 5.1 `ParametersOverrideRequestBroadcastReceiver` — exported, no permission

Manifest: exported, `permission: null`, action `com.uber.parameters.cli`. Base class
`com.uber.broadcast.MonitoredBroadcastReceiver.onReceive` is `final` and performs **no
sender/UID/permission check**: it consults an internal flag and dispatches straight to the
subclass (`this.b.getValue()).onReceive(context, intent)`).

The subclass handler reads `namespace`, `key`, `value`, and `action` from the intent; when
`action == "clear"` it removes an override, otherwise it writes one
(`parametersOverrideProxy.P5().c(iVar4, str)`), then emits telemetry
(`PARAMETER_OVERRIDE_BROADCAST_SUCCESS/FAILURE`). Writes are gated only by an in-app parameter
flag (`bVar.f38534a.b(b.c[0])`).

The gate is now resolved. `com.uber.parameters.override_broadcast.b.<init>` reads:

```java
super("xp_mobile");
this.f38534a = sb4.b.e(this, null,
    "is_parameter_override_via_broadcast_allowed", true, ParameterCategory.OTHER, 1);
```

so the decision is the mobile parameter **`xp_mobile/is_parameter_override_via_broadcast_allowed`,
default `true`**. The handler only touches parameters that already exist
(`ParametersOverride.d(namespace, key)` must return one, otherwise `PARAM_NOT_FOUND`), and boolean
parameters accept only the literal `"true"` / `"false"`.

Assessment: any app on the device can target this receiver, it checks nothing about the sender, and
its gate defaults to on. What that reaches depends on which catalogue parameters are
security-relevant (one that disables a check turns this from configuration tampering into a
bypass); that mapping is not established here, and it needs confirmation on a **test account** —
not on production. This is a reportable candidate, not a confirmed vulnerability.

### 5.2 `DeviceSessionsContentProvider` — exported, validated in code

`query()` calls `getCallingPackage()` and runs it through `ValidateAppForIPCUseCase.A(pkg)`
before any URI matching; on failure it logs "Caller validation failed for authority: …" and
returns `null`. So the missing manifest permission is compensated by an allowlist check. Same
pattern is expected on `insert/update/delete` (not individually inspected).

Verdict: defense observed, no finding.

### 5.3 `SSOContentProvider` — gate resolved, validated

`query()` returns immediately unless `e()` is true, then serves URI match 1/2 via `b(boolean)`.
`e()` is now read:

```java
public final synchronized boolean e() {
    String nameForUid = getContext().getPackageManager().getNameForUid(Binder.getCallingUid());
    if (nameForUid == null) return false;
    return this.f.A(nameForUid);   // ValidateAppForIPCUseCase.A
}
```

So the calling UID is resolved to a package name and checked against the same
`com.uber.identity.ipcutils.usecase.ValidateAppForIPCUseCase.A(String)` allowlist used by the
DeviceSessions provider. `A` itself is **abstract** (`body_status: not_available`,
`markers: ["abstract_method"]`) and its concrete binding is not named `ValidateApp*`, so the
allowlist contents stay unknown — but the provider does not serve unvalidated callers.

Verdict: defense observed. Residual unknown: which packages the allowlist admits.
`trace-android-references` on the abstract class returns 16 using nodes (`SSOScopeImpl`, both
providers, `gl2.*`/`jl2.b` Dagger factories) but **no concrete subclass**, so the binding itself is
still unlocated — the allowlist contents cannot be read from this APK without following the Dagger
graph further.

`SSOEligibilityContentProvider` (authority `com.ubercab.provider.sso.eligibility`) is a stub and
needs no gate: `query`/`insert`/`update`/`delete` all throw `UnsupportedOperationException`,
`getType` returns `null`, `onCreate` returns `true`. It reserves the authority, it does not serve
data.

### 5.4 WhatsApp OTP path

`AppLinkActivity` and `WhatsAppOtpCodeReceiver` are both exported and both accept
`com.whatsapp.otp.OTP_RETRIEVED` — the Android "OTP autofill from WhatsApp" integration.
Standard pattern; the risk is a forged intent delivering a bogus OTP, which only matters if the
app trusts the code without server-side validation.

### 5.5 Deep links (89 intent filters, attributed)

Exported activities and the schemes/hosts they claim:

| Activity | Custom schemes | Hosts |
| --- | --- | --- |
| `…core.root.RootActivity` (30 filters) | `uber`, `com.ubercab`, `geo`, `google.navigation`, `uber_performance_debug`, plus `@string` refs `sso_third_party_scheme`, `line_auth_scheme`, `ub__fb_login_protocol_scheme` | 24 incl. `www.uber.com`, `m.uber.com`, `auth.uber.com`, `accounts.uber.com`, `account.uber.com`, `identityverification.uber.com`, `trip.uber.com`, `pass.uber.com`, `plus.uber.com`, `wallet.uber.com`, `r.uber.com`, `x.uber.com`, `a.uber.com`, `health.uber.com`, `referrals.uber.com`, `biz*.uber.com`, `partners.uber.com`, `ocie.app.link`, `ocie-alternate.app.link`, `rides.sng.link`, `uberm.bttn.io` |
| `…root.ShareToRideAlias` | `package`, `adyen3ds2` | `www.ubereats.com`, `eats.uber.com`, `www.uber.com`, `com.ubercab` |
| `…uberpay.…UberPayWebAuthorizationActivity` | `com.ubercab.uberpay` | `authorization` |
| `…venmoclient.connect.VenmoConnectActivity` | `braintree-venmo-connect.com.ubercab` | `payment-providers.uber.com` |

Non-exported activities also claim `uber-wisdom-bugreport`, `uber-dragon-crawl-e2e`, the Braintree
PayPal return schemes, and the `uauth_*` SSO redirect schemes — unreachable from other apps, so
not part of the attack surface.

The **`android:host="*"` entries are a false lead**: both occurrences live inside a `<queries>`
block (package-visibility declarations for `smsto`/`tel` `SENDTO`/`DIAL`), not in any component
intent filter. No exported component claims a wildcard host.

One debug entry is worth noting: `RootActivity` accepts scheme `uber_performance_debug`, so any app
can launch Uber's performance-debug entry point. It is exported by design, but it is a debug
surface shipped in a production build.

## 6. Architecture: RIBs, not obfuscated

`search-android-classes Router` → **2,558 matches** out of 174,047 classes, with **readable
names**, e.g.:

```
com.uber.accessibility_settings.HelixAccessibilitySettingsRouter
com.uber.accessibilitysettings.AccessibilitySettingsRouter
com.uber.accessibilitysettings.features.simplemode.SimpleModeSettingsRouter
com.uber.accessibilitysettings.plugins.communicationpreferences.CommPreferencesSectionRouter
```

This confirms the RIBs architecture on the real build and — more useful — shows that R8 kept
package and class names for first-party code. The earlier assumption that Uber ships heavily
obfuscated code is wrong for this build: decompilation gives navigable names, not `a.b.c`.

## 7. Native libraries (all in `split_config.arm64_v8a.apk`)

| Library | MB | Likely role |
| --- | --- | --- |
| `libtensorflowlite_jni.so` | 4.12 | on-device ML (TFLite) |
| `libubermaps-gl.so` | 3.91 | Uber Maps GL renderer |
| `libvendor-mapdisplay.so` | 3.74 | map display (vendor) |
| `libeef0.so` | 1.05 | Uber "EEF" runtime (name only; role unverified) |
| `libse.so` + `libse_loader.so` | 0.64 + 0.61 | secure-element / keystore helper (name only) |
| `libml-imageproc.so` | 0.25 | image preprocessing |
| `libh3.so` | 0.09 | H3 hexagonal indexing |
| `libandroidx.graphics.path.so`, `libndk-anr.so`, `libndk-crash.so`, `libsurface_util_jni.so` | <0.05 | AndroidX / Crashlytics NDK |

None of these were disassembled: REA's Windows Ghidra lane admits PE only. Analysis of the
`.so` set needs Linux/WSL + Ghidra 12.x.

## 8. Limits of this pass

- Static only. The receiver's reachability and the effect of the parameters it can flip are
  **unverified**; the provider allowlist contents are unknown.
- Only `base.apk` was decompiled; feature splits were inventoried, not analyzed (REA does not
  merge splits).
- Each JADX one-shot reloads the 207 MB APK (~59 s). Heap matters: `REA_JADX_HEAP_MIB=4096` dies
  with `Java heap space`; **10240** succeeds (host has 15.9 GB RAM). One earlier call also hit the
  15-minute ceiling and was dropped.
- `inspect-android-package` reports `signature_verification: not_performed` — signing was checked
  separately with `inspect-apk-signature` (§1).

## 9. Safe next steps

1. `trace-android-references` on `ParametersOverrideRequestBroadcastReceiver` and on
   `ParametersOverride.d/c` to enumerate which catalogue parameters are writable and whether any
   gate security behavior (root/tamper/pinning checks).
2. Resolve the concrete binding of `ValidateAppForIPCUseCase.A` (Dagger `@Binds` module) to learn
   the allowlist contents.
3. Class census by package family (`com.uber`, `com.ubercab`, third-party SDKs) from the 23 DEX
   files, to quantify first-party vs vendor code.
4. Copy the ABI split to a Linux/WSL host and run Ghidra via REA on `libeef0.so` / `libse*.so`.
5. If §5.1 is confirmed on a **test account**, report through Uber's HackerOne program with a
   minimal PoC; do not run it against production or other users. The probe shape is:

   ```powershell
   adb shell am broadcast -a com.uber.parameters.cli `
     -n com.ubercab/com.uber.parameters.override_broadcast.ParametersOverrideRequestBroadcastReceiver `
     --es namespace <known-ns> --es key <known-key> --es value true
   ```

   Success is visible in logcat telemetry as `PARAMETER_OVERRIDE_BROADCAST_SUCCESS`; `PARAM_NOT_FOUND`
   means the parameter does not exist and nothing was changed.

## 10. Reproduce

```powershell
$env:REA_ADB_PATH = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$env:REA_JADX_MCP_JAR = "$HOME\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:REA_JADX_OPERATION_TIMEOUT_MS = "480000"; $env:REA_JADX_HEAP_MIB = "10240"

rea pull-adb-package R5CTB0FJP9Z com.ubercab --output-directory C:\targets\uber
rea inspect-apk-signature C:\targets\uber\com.ubercab\base.apk --format json
rea inspect-android-package C:\targets\uber\com.ubercab\base.apk --format json
rea search-android-classes  C:\targets\uber\com.ubercab\base.apk Router --format json
rea inspect-android-method  C:\targets\uber\com.ubercab\base.apk com.uber.broadcast.MonitoredBroadcastReceiver onReceive --format json
```

Evidence captured under `C:\Users\osama\AppData\Local\Temp\opencode\uber\evidence\`
(`manifest.json`, `monitored-*.json`, `sso-*.json`).
