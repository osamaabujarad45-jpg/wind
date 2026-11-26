# Claude handoff — 18 November 2026 — new knowledge only

**Companion (later the same day, REA builds + Captain crash fix + phone proof):** `HANDOFF-2026-11-18-CLAUDE-NEW-KNOWLEDGE-REA-BUILDS.md`. Read it after this file; it contains only facts established in that continuation session.

This file records what was checked and found in this session. It does not restate the 13–17 November studies, adopt lists, or route maps. Those remain where they were. Paths below are the ones a change or a check actually touched.

Evidence labels: `[ran]` command this session · `[read]` file opened this session · `[phone]` physical SM-A5360 `R5CTB0FJP9Z` · `[rea]` REA 6.9.0.

No commit, push, or uninstall was done. App data and the Chrome profile were left in place.

## 1. REA, as it is tonight

`[ran]` `https://github.com/morluto/rea` `package.json` version is still **6.9.0**. The newest commit on `main` seen this session is `bc115af119` (`2026-11-17T22:50:06Z`, MCP prompt-context test). The local wrapper `C:\Users\osama\AppData\Local\Temp\opencode\rea24.cmd` reports `rea@6.9.0` on Node `v24.22.3`. The system `node` on this PC is still `v24.12.0`, so a bare `rea` on PATH still fails the engine check.

The check used on the new Captain APK was `rea inspect-apk-signature`. Evidence id `ev_04dc10e1c5bd03e74d083195f7edd65d5d2810a11c9b2162e813a297835e4794`, written to [careem-signature.md](C:\Users\osama\OneDrive\Documents\wind-competitors\evidence\n18-20261118\careem-signature.md).

## 2. Why release signing failed, and the two APKs that now verify

`[ran]` `apksigner` from build-tools 36.0.0 caches a password file in `PasswordRetriever.mFileInputStreams`, keyed by the canonical file. `--ks-pass file:X` and `--key-pass file:X` with the **same** `X` read the store password, then the key-password read hits EOF on that cached stream. The message is `end of file reached in <path>`. Adding a trailing newline does not fix it. `[ran]` Keytool accepts the original 32-byte file with no newline.

The keystore alias is `windcomp`. Certificate:

| Field | Value |
|---|---|
| Subject | `CN=Wind Competitors, O=WindComp, C=PS` |
| SHA-1 | `57:AF:6D:DB:35:87:C5:7E:77:E1:17:B9:42:6F:C4:A3:2E:F9:45:2F` |
| SHA-256 | `75:9E:72:F7:64:69:13:96:E5:1B:91:E4:CB:3F:58:FD:A4:76:F8:1B:18:F7:9A:64:98:FF:BE:94:83:8B:BC:D6` |
| Serial | `B9C0587674D546FC` |
| Not before / after | `2026-11-16T04:47:52Z` / `2056-11-08T04:47:52Z` |

`[rea]` The re-signed Captain APK has v1, v2, and v3. v3 min SDK is 24, max SDK is 2147483647, rotation lineage is absent, and the v2/v3 declared digest `matches_apk: true`.

Workaround that succeeded: two different files with the same password, one for `--ks-pass` and one for `--key-pass`. On k5 those files are `D:\b\n18\ks-store.pass` and `D:\b\n18\ks-key.pass`. Do not print them.

The n9 debug APKs were re-signed in place onto copies. JS bundle **lengths** are unchanged (Uber `assets/index.android.bundle` 2,809,864 bytes, Captain 2,819,428 bytes). Manifest entry lengths are also unchanged. A byte-for-byte bundle hash was not completed.

| App | Release APK | Bytes | SHA-256 |
|---|---|---:|---|
| WindRide / Uber pattern | `D:\b\n18\uber-release.apk` | 46,149,893 | `C9FE7D68CDB023D65795EB8A6FEB8823261374EC81BFA628E37C3F06031DE07D` |
| WindCaptain / Careem pattern | `D:\b\n18\careem-release.apk` and [local copy](C:\Users\osama\OneDrive\Documents\wind-competitors\evidence\n18-20261118\careem-release.apk) | 46,601,151 | `B88192123253E08B8B33AB9E6F561FF562989900425CD2622C2A3E368C9EA331` |

`[ran]` Spot hashes of `package.json`, `src\app\index.tsx`, `src\lib\domain.ts`, and `src\lib\fares.ts` match between this PC and `C:\windcomp\wind-comp-*` on `DESKTOP-S2JKMK5`. Against the n9 source freeze, the local trees differ only in the markdown docs (`README.md`, `HANDOFF.md`, `SPEC.md`, `STUDY.md`, `DESIGN.md`, `FRONTEND.md`, `BACKEND.md`, `PUBLIC-APP-CODE.md`). Shiply's freeze did not show a `SPEC.md` mismatch. App code was not rebuilt for Uber or Captain; those two release APKs are the n9 compile, re-signed.

HAAT, Shiply, and Souq still had no release APK when signing finished. The k5 script in section 5 is compiling them.

## 3. Phone — Captain updated, then Captain mode crashed

`[phone]` `adb install -r` of the Captain release APK returned `Success`. The installed certificate before the update, read with apksigner from the pulled base APK, was already SHA-1 `57:AF:6D:DB:35:87:C5:7E:77:E1:17:B9:42:6F:C4:A3:2E:F9:45:2F`. After the update, `dumpsys` shows `versionName=1.0.0`, `versionCode=1`, signature scheme version 3.

Saved data survived. Home still listed Home / Work / Cities Mall / Palestine Medical Complex. Search opened those rows with street text (`Rukab St, Ramallah`, `Al-Bireh`). The Home row opened the address editor with nickname `Family flat`, building type Apartment, and the existing delivery note. Screenshots:

- [captain-home.png](C:\Users\osama\OneDrive\Documents\wind-competitors\evidence\n18-20261118\captain-home.png)
- [captain-search.png](C:\Users\osama\OneDrive\Documents\wind-competitors\evidence\n18-20261118\captain-search.png)
- [captain-address.png](C:\Users\osama\OneDrive\Documents\wind-competitors\evidence\n18-20261118\captain-address.png)

The native map on that home and address screen was a beige surface with a clipped Google logo. `[ran]` A 2,500-line logcat window at that moment had no `Authorization failure` line. Do not treat the old 403 note as re-proven tonight. `[ran]` After the crash below, the same process logged `GoogleApiManager` `SecurityException: Unknown calling package name 'com.google.android.gms'` from `policy_maps_core_dynamite`. That line is after the activity was already backgrounded.

`[phone]` Tapping Captain mode, center of test id `captain-mode` at `(855, 212)`, crashed the activity. Samsung recorded `errorType=crash` for `com.windcomp.windcaptain`. The crash buffer says:

```
com.facebook.react.common.JavascriptException: TypeError: Cannot read property 'balanceCents' of undefined
    at CaptainScreen
    captainCashDecision
```

Process stayed up (`pidof` still returned a pid). The activity window was removed. Focus then moved to `ps.wind.app.testcustomer/.MainActivity`. The Arabic screen with working road tiles and order `W-00005` is **that** app, version `1.1.4`, not Captain mode. It was not driven further. Screenshot of that accidental foreground: [captain-after-captain-mode.png](C:\Users\osama\OneDrive\Documents\wind-competitors\evidence\n18-20261118\captain-after-captain-mode.png). Crash text: `adb logcat -b crash` at `2026-11-18 01:10:19` local, also summarized above.

`[read]` The crash matches this load path. `STATE_VERSION` is still `1` in [config.ts](C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-careem\src\lib\config.ts). [localServer.ts](C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-careem\src\services\localServer.ts) restores a saved blob when the version matches and `addresses`, `history`, and `earnings` are arrays. It does not require `captainWallet`. [store.tsx](C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-careem\src\store\store.tsx) `captainCashBlocked` calls `captainCashDecision(state.captainWallet)`. [cash.ts](C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-careem\src\lib\cash.ts) `isCaptainCashBlocked` reads `wallet.balanceCents` with no guard. [captain.tsx](C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-careem\src\app\captain.tsx) also reads `state.captainWallet.balanceCents` at the float card. `initialState.captainWallet` exists in [domain.ts](C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-careem\src\lib\domain.ts), so a fresh install would not hit this. The phone hit it because `install -r` kept the older saved blob.

Claude's fix, when you take it: on load, fill a missing `captainWallet` from `INITIAL_CAPTAIN_WALLET` (or bump `STATE_VERSION` and stop restoring version 1). Add a selfcheck that a version-1 blob without `captainWallet` still opens Captain mode. Do not uninstall the phone app to get a clean store.

## 4. Which installed packages can take a release APK

`[phone]` `dumpsys package` signature tokens, not SHA-1. Captain was separately confirmed with apksigner as the release cert above. After the update its dumpsys token is `229155fd`, scheme version 3.

| Package | versionName | dumpsys signature token | Release APK update |
|---|---|---|---|
| `com.windcomp.windcaptain` | 1.0.0 | `229155fd` | Done tonight, `install -r` Success |
| `com.windcomp.windparcel` | 1.0.0 | `229155fd` | Same token as the release cert. Update when a release APK exists. |
| `com.windcomp.windmarket` | 1.0.0 | `229155fd` | Same. |
| `com.windcomp.windride` | 1.0.0 | `46af224e` | Different signer. Do not `install -r` the new Uber APK. Do not uninstall. |
| `com.windcomp.windbazaar` | 1.0.0 | `51ed3f60` | Different signer. Same token as `ps.wind.app.testcustomer`. Do not uninstall. |
| `ps.wind.app.testcustomer` | 1.1.4 | `51ed3f60` | Not part of this build. Map tiles were visible when it came forward. |

## 5. k5

`[ran]` `ssh -o BatchMode=yes -o HostName=desktop-s2jkmk5 k5` reaches `DESKTOP-S2JKMK5`. `ssh k5` alone is still the wrong address. No `java.exe` was running at the start. About 12.8 GB free of 16.7 GB, 4 logical CPUs, pagefile `C:\pagefile.sys` allocated 10,717 MB. `C:` had about 3.4 GB free, so builds stay on `D:`. Node is `C:\node-v24.12.0-win-x64\node.exe`, not on PATH. Dependency junctions: Uber `D:\du`, Captain `D:\dc`, HAAT `D:\dh`, Shiply `D:\ds`, Souq `D:\dm`.

`eslint .` on k5 climbed to about 2.8 GB because the flat config's ignore list does not keep a root `.` lint off the `node_modules` junction. That process was stopped. The follow-up script lints `src`, `scripts`, `plugins`, and `app.json` only.

`[ran]` `D:\b\build-q.ps1` on `DESKTOP-S2JKMK5`, after the tests and while HAAT's release compile was still going:

| App | selfcheck | tsc | lint |
|---|---:|---:|---:|
| Uber | 0 | 0 | 0 |
| Captain | 0 | 0 | 0 |
| HAAT | 0 | 0 | 0 |
| Shiply | 0 | 0 | 0 |
| Souq | 0 | 0 | 0 |

tsc logs are empty. Lint exit 0 is not a clean log. Uber's lint log is 2 warnings and 0 errors: `app.json` ignored because no matching configuration was supplied, and `scripts\selfcheck.mjs:216` `import/first`. The other four lint logs are non-empty and were not re-read line by line. Uber's selfcheck printed `selfcheck OK: money, geo, fares, kv, HTTP retry/timeout, local server lifecycle`.

`[ran]` HAAT prebuild in the staged tree `D:\b\q\haat` exited 0. `C:\windcomp\wind-comp-haat\package.json` is still dated 14 Nov 2026 19:41, so prebuild did not rewrite the source tree. Gradle `assembleRelease` for HAAT was running when this file was written. Shiply and Souq had not started. Logs: `D:\b\q\tests\`, `D:\b\q\haat-prebuild.log`, `D:\b\q\haat-build.log`. Gradle is one worker, arm64 only, 2048 MB heap, `CMAKE_BUILD_PARALLEL_LEVEL=1`, then the two-file sign. A later green Gradle line is not phone acceptance. Read those logs before claiming the three APKs exist.

## 6. What to do next

Section 8 is later the same night and supersedes the four items below. Read it before acting on this list.

1. Read `D:\b\q\haat-build.log`, then the Shiply and Souq logs, when `D:\b\build-q.ps1` exits. The five-app selfcheck, tsc, and lint exits are already in section 5. Record each new APK's SHA-256 and cert SHA-1.
2. `install -r` only Shiply and Souq if their cert SHA-1 is `57:AF:6D:DB:...`. Open each and walk one primary screen. Leave HAAT and WindRide uninstalled over the existing apps.
3. Fix the Captain wallet restore in the files in section 3, then rebuild Captain. Until that ships, Captain mode on this phone crashes on the saved blob.
4. Blank native tiles stay an open check. The Fastship test customer app's map did render tiles in the same session, which only says this phone can show Google tiles for that other package.

## 7. Phone walk after the Captain crash — 18 Nov 2026, about 01:31–01:35 local

Physical Samsung SM-A5360, serial `R5CTB0FJP9Z`. No uninstall, no cache clear, no tap on `ps.wind.app.testcustomer` order `W-00005`. `agent-device` "Page:" can name the app you asked to open while `dumpsys window` still shows another activity. Focus below is from `mCurrentFocus`.

`[phone]` Captain rider path, already the release APK from section 3. From the Cities Mall editor (nickname `Mall entrance 2`, notes `Parking level P2`, building type Shop), "Use this address" opened checkout: pickup Al-Manara, drop Cities Mall. Tiers on screen: Go ₪15.24, Business ₪26.77, Cash Go ₪13.86. Cash was already selected. Choosing Cash Go changed the confirm line to `Confirm Cash Go · ₪13.86` and kept "Pay the captain in cash at drop-off". Confirm opened tracking: Karim D., Hyundai Elantra Silver, plate `55-678-90`, "heading to your pickup", cash ₪13.86, destination details shared. The map was beige with a clipped Google logo. The demo then reached the receipt by itself: `RCT-LBTG0R-1`, base ₪7.00 + distance ₪4.06 + time ₪0.80 + booking ₪2.00 = ₪13.86, status "Cash payment outstanding". Captain mode was not tapped again. Screenshots: `captain-checkout.png`, `captain-tracking.png`, `captain-receipt.png` in `evidence\n18-20261118`.

`[phone]` `com.windcomp.windride` was relaunched with activity `.MainActivity`. It did not stay up. At `2026-11-18 01:32:16` local, pid 22145, `logcat -b crash`:

```
java.lang.IllegalStateException: addViewAt: failed to insert view [118] into parent [4] at index 0
Caused by: java.lang.IllegalStateException: API key not found.  Check that <meta-data android:name="com.google.android.geo.API_KEY" ...> is in the <application> element of AndroidManifest.xml
    at com.rnmaps.maps.MapView.onCreate
```

Samsung's error dialog offered to clear WindRide's temporary storage. Cancel (`إلغاء`) was pressed. Storage was not cleared. Focus returned to the Captain receipt. This is the already-installed WindRide build, dumpsys token `46af224e`, not the new Uber release APK, which was not installed. Screenshot: `windride-crash-dialog.png`.

`[phone]` The other three are the already-installed builds, not new release APKs.

| App | Focus confirmed | What the phone did |
|---|---|---|
| `com.windcomp.windbazaar` | yes | Arabic home, three stores. مطعم الزيتون menu, one shawarma (₪22). Basket: service ₪3, delivery ₪12, total ₪37. Notification permission denied. Order `HAAT-MWLBW1EJ-2` reached "تم تسليم الطلبية" with the status steps. Map beige, Google logo visible. `bazaar-home.png`, `bazaar-basket.png`, `bazaar-tracking.png`. |
| `com.windcomp.windparcel` | yes | Arabic home, courier wallet ₪0.00, expected and collected ₪180.00. Opened `SH-48210` (Jerusalem, pay, 3.5 kg, collection ₪250.00). Timeline steps are present and still unmarked. Map beige, Google logo visible. `parcel-home.png`, `parcel-shipment.png`. |
| `com.windcomp.windmarket` | yes | Opened on the courier tab of سوق طولكرم المركزي. Customer tab listed three Tulkarm stores and active order 4821. خضار الجودة: one kg of tomatoes at ₪8.00, "اسألني أولاً" enabled, basket button `السلة (1)`. Checkout was not sent. `market-roles.png`, `market-grocer.png`. |

`[ran]` Checked k5 again after the phone walk. The SSH parent that launched `D:\b\build-q.ps1` had already aborted, but two `java` processes were still alive (pids 10736 and 11016). `D:\b\q\haat-build.log` was inside HAAT `lintVitalAnalyzeRelease`. `D:\b\n18` still has only `uber-release.apk` and `careem-release.apk`. No HAAT, Shiply, or Souq release APK yet. Do not kill those JVMs to "finish" the check.

## 8. Later the same night — fixes on the phone

`[ran]` k5 later showed `D:\b\q\haat-release.apk`, `shiply-release.apk`, and `souq-release.apk`, plus the earlier `D:\b\n18\uber-release.apk` and `careem-release.apk`. All five verify with cert SHA-1 `57:AF:6D:DB:35:87:C5:7E:77:E1:17:B9:42:6F:C4:A3:2E:F9:45:2F`. Inflating `AndroidManifest.xml` and searching for `com.google.android.geo.API_KEY` is true for all five. A search of the raw zip bytes is false because the manifest is compressed. A later `Get-PSDrive D` check printed `freeMB=216696`.

`[ran]` `expo export` from `C:\windcomp\wind-comp-careem` produced a Hermes bundle with no app strings. `node_modules` is a junction to `D:\dc\node_modules`, so Expo Router's app root is resolved across drives and the route context is empty (1197 modules, no `Karim`, no `captainWallet`). Copy the project onto `D:` (robocopy, exclude `node_modules`, `android`, `.expo`), junction `node_modules` back to `D:\dc\node_modules`, and export there. The relative root is then `..\..\..\b\n18\careem-proj\src\app` and the bundle has the app (1454 modules). Arabic UI strings in that Hermes bytecode are UTF-16LE; ASCII identifiers stay UTF-8. Swap the stored `assets/index.android.bundle`, `zipalign -p 4`, then apksigner 36.0.0 with two password files.

`[phone]` Captain `adb install -r` of `evidence\n18-20261118\careem-fixed.apk` returned Success. Captain mode opened. Cash float reads **₪125.00**, limit **−₪500.00**, Active. It did not crash. Screenshot `captain-mode-fixed.png`. After Done on the earlier cash receipt, a new Go ride to Work on Visa •••• 4242 completed by itself: receipt `RCT-LDQ8AO-3`, base ₪8.00 + distance ₪3.68 + time ₪0.84 + booking ₪2.00 = **₪14.52**, "Payment recorded on Visa •••• 4242", collected. Screenshot `captain-visa-receipt.png`. Home no longer shows an active trip.

`[phone]` WindBazaar is still the old certificate (`51ed3f60`). It was not replaced. On that build, one shawarma plus `WELCOME10` shows خصم −₪2.20 and total **₪34.80**. Cash and "بطاقة عند التسليم" are both on the basket, with the 3D Secure line. Sending while the previous delivered order was still the active order returned `تعذّر إرسال الطلبية. راجع الحد الأدنى والطلبية النشطة`. Opening that order and pressing طلباتي cleared it. The same basket then placed `HAAT-MWLDYO91-4`, which reached delivered. The receipt shows قسيمة `WELCOME10`, خصم −₪2.20, total ₪34.80. Screenshots `bazaar-coupon.png`, `bazaar-payment.png`, `bazaar-coupon-receipt.png`. The reorder fix is in source only. Do not uninstall Bazaar to force the new cert.

`[phone]` WindParcel and WindMarket `adb install -r` of `shiply-fixed.apk` and `souq-fixed.apk` both returned Success. Same release cert as the copies already on the phone. Parcel courier board, with `SH-48198` active, shows three disabled buttons labeled `أنهِ المهمة الحالية أولاً` for `SH-48216`, `SH-48210`, and `SH-48211`. Screenshot `parcel-busy-courier.png`. Market courier shift `VH-7713` was already open. Accepted order 4822, scanned the label, started the trip, entered `0000`. The phone showed **كود خاطئ — بقيت 2 محاولات**. Screenshot `market-wrong-code-fixed.png`. The window-error clear is in that same bundle and was not walked again.

`[phone]` WindRide was not updated. The new `uber-release.apk` contains the Maps key and the release cert, and the installed WindRide cert is still the other fingerprint (`SHA-1 63:19:05:8D:...`). `install -r` cannot replace it. It was not uninstalled. Captain was force-stopped once so it would stop returning to the foreground while Market was being tapped. Captain's data was not cleared.

Maps that have a key still draw a beige field and a Google logo. That is unchanged.
