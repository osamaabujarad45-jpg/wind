# REA self-audit of the Wind Android build (ps.wind.app 1.0.13)

**Date:** 30 October 2026 · **Tool:** REA (`rea-agents` 6.8.0, JADX headless 0.7.1) on the K5 PC · **Target:** our own app — authorization: owned artifact, pulled from the owner's test phone.

**Subject:** `wind-app-1.0.13.apk`, 107,157,758 bytes, SHA-256 `49dd46fd2aa11afcc571e626c5674bae5d92bbb8b8baa4a10a19788091a8372f` — pulled via adb from the physical test phone (SM-A5360), package `ps.wind.app`, installed versionName 1.0.13 (versionCode 16). Static analysis only; the APK was never executed and no signature was cryptographically verified (REA reads structure; see limitations in the raw evidence).

## Identity

- package `ps.wind.app` · versionName 1.0.13 · versionCode 16 · minSdk 24 · targetSdk 36 · compileSdk 36
- 15,964 classes · 1,406 resources · `allowBackup=false` · `extractNativeLibs=false` · RTL supported
- Expo modules present (updates meta-data present but `expo.modules.updates.ENABLED=false` in this build — OTA disabled), Firebase messaging, WorkManager, Room, RNC WebView, expo-location foreground service (`foregroundServiceType="location"`)

## Permissions (32 declared)

Sensitive set matches a location-tracking delivery app and nothing more: `ACCESS_BACKGROUND_LOCATION`, `ACCESS_FINE/COARSE_LOCATION`, `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `USE_BIOMETRIC`/`USE_FINGERPRINT`, `ACCESS_NETWORK_STATE`, `INTERNET`.

- **No** camera, microphone, contacts, SMS, storage/media or phone-state permissions. Clean.
- ~14 of the 32 are vendor badge permissions (Samsung/HTC/Sony/Oppo/Huawei launcher counters) — noise from a notification-badge library; harmless, could be trimmed later.
- Custom `ps.wind.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` is `signature`-protected — correct expo-notifications pattern.
- Install-referrer (`BIND_GET_INSTALL_REFERRER_SERVICE`) and FCM (`c2dm.RECEIVE`) are Play-standard.

## Exported components (5 of 32 — all expected)

| Component | Exported | Protection | Verdict |
|---|---|---|---|
| `ps.wind.app.MainActivity` | yes | none | Launcher + `wind://` deep link — intended; see follow-up 1 |
| `androidx.work…SystemJobService` | yes | `BIND_JOB_SERVICE` | Framework-standard WorkManager |
| `androidx.work…DiagnosticsReceiver` | yes | `android.permission.DUMP` | Framework-standard |
| `com.google.firebase.iid.FirebaseInstanceIdReceiver` | yes | `c2dm.SEND` | FCM-standard |
| `androidx.profileinstaller.ProfileInstallReceiver` | yes | `android.permission.DUMP` | Framework-standard |

No exported content providers. Both FileProviders (WebView, FileSystem) are `exported=false`. All expo services/receivers are `exported=false`. Nothing unexpected is reachable by other apps.

## Signing (release-integrity baseline — record this)

- Schemes: **v2 only** (no v1/v3/v3.1, no source stamp) — correct for minSdk 24; `self_consistent=true`, declared digests `matches_apk=true`.
- Signer: 1 · RSA · **cert SHA-256 fingerprint `5947bab05b2173ee99fc29a817e94070e71e15f93ae2c6681fcdce5e08403a2c`** · serial `75C509A37E7F1A98` · valid 2026-10-28 → 2054-03-15 · empty subject/issuer (EAS-managed keystore).
- Future check: any release whose APK doesn't carry this v2 fingerprint was not signed with the current EAS credential.

## Follow-ups

1. **`wind://` deep link** — MainActivity is exported+browsable with scheme `wind`. Any installed app can fire `wind://` intents. Validate every deep-link parameter server-side (trip-share, order-again flows) before trusting navigation.
2. **Chrome payment intents in `<queries>`** (`org.chromium.intent.action.PAY` etc.) — confirms Chrome Custom Tabs payment flow; keep the callback surface narrow.
3. **Signature verification was `not_performed` by the static reader** (structural read only). For a cryptographic check, compare against `keystore` metadata in EAS or sign-verify a local build.
4. Trim vendor badge permissions if a Play pre-launch report flags them.

## Reproduction

On K5 (`ssh k5`): `C:\Users\pc gaming\smartstore-tools\fastship-tools\run-rea.cmd inspect-android-package <apk>` and `… inspect-apk-signature <apk>`. Raw evidence: `wind-audit.json`, `wind-signature.json` in the same folder (kept on K5, not committed).
