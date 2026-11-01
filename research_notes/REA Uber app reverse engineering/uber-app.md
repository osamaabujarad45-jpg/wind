# Reverse-engineering the real Uber Android app with REA

Research note · 30 Oct 2026 · target repo: [morluto/rea](https://github.com/morluto/rea) @ `main` (package `rea-agents` 6.8.0, MIT)

Question: the repo is a reverse-engineering toolkit. What can it actually do against the
production Uber rider app (`com.ubercab`) and driver app (`com.ubercab.driver`), what is
blocked, and what is out of bounds?

Everything in **§3** was executed on this machine. Everything else is read from the repo's
own source/docs or from the cited primary sources; nothing was run against Uber.

---

## 1. Verdict

| Goal | Feasible with REA? | Why |
| --- | --- | --- |
| Manifest, permissions, exported components, intent filters | **Yes**, fully static | `inspect_android_package` projects all of it from the decoded manifest |
| Third-party SDK / library census, resource and asset inventory | **Yes** | class search + resource decode + artifact inventory |
| APK authenticity, signer identity, release-to-release diffing | **Yes** | `inspect-apk-signature`, `compare`, evidence bundles |
| Feature architecture (Uber's RIBs tree) | **Yes, largely** | 2,558 readable `*Router` classes on the real build; R8 kept first-party names (see analysis note) |
| Endpoint/protocol shape | **Partial, static only** | hostnames/paths/descriptor strings survive in DEX/resources; live capture needs pinning bypass → out |
| Native `.so` (crypto, anti-tamper) | **No on this host** | REA's Windows Ghidra lane admits PE + raw 6502 only, not Android arm64 ELF |
| UI/behaviour teardown on a real session | **Yes** | ADB screen/logcat/window lanes, own device and own account |
| Runtime hooking | Tooling exists, prerequisites do not | needs `frida-server` on the device (root) — not installed, and REA never installs it |
| Bypassing pinning / root detection / anti-tamper against production | **No** | REA's own disclaimer forbids circumventing protection measures; outside the tool's supported use |

The binding constraint is not analysis capability. It was **getting a real Uber APK** — and on this
device that turned out to be a non-issue: Uber is installed and `adb pull` from `/data/app` worked as
`shell`. The remaining constraints are JADX cost on a 207 MB APK and the Windows-only Ghidra lane.
See §5.

---

## 2. What the repo is

REA is one CLI (`rea`) plus one MCP server that gives an agent the same operations. It runs
**locally**, returns typed Evidence (artifact digest, provider identity, parameter echo,
coverage/limitations) and never executes an APK for the Android static lane. The lanes that
matter for a mobile target:

| Lane | Entry points | Grounded in |
| --- | --- | --- |
| Android static | `inspect-android-package`, `search-android-classes`, `inspect-android-class`, `inspect-android-method`, `trace-android-references`, `inspect-android-jni-bindings` | wraps pinned `jadx-headless-mcp` 0.7.1 |
| Android resources | `decode-android-resources` (Apktool, caller-supplied) | string tables, locales, decoded manifest |
| APK signatures | `inspect-apk-signature` (v1/v2/v3/v3.1, rotation, certs) | static ZIP/PKCS#7 |
| Device | 25 `*-adb-*` commands: inventory, packages, pull, logcat, screen, intents, install/uninstall | caller's `adb` |
| Runtime | `list-frida-devices`, `start-frida-session`, `load-frida-script`, `instrument-with-frida` | optional `frida` 17.23.2 binding |
| Observation | `inspect-web-network-capture` (HAR/SAZ/qlog), `inspect-pcap-capture`, `analyze-javascript-application` | saved captures only |
| Native | `analyze`, `decompile`, `function`, `search`, `xrefs` via Ghidra/Hopper/IDA/Kuna | provider-dependent |

Two facts that shape everything below:

- The Android family is **static**: "these operations do not execute the APK or provide split
  APK/AAB handling, signature validation, full resource-table semantics, native-library
  analysis or Android runtime capture" (`docs/android-analysis.md`). Runtime is a separate lane.
- Windows Ghidra support is a deliberately narrow P0: "Windows P0 admission remains limited to
  native PE and raw NMOS 6502 images" (`docs/windows-ghidra-p0.md`). Android `.so` files are
  ELF/arm64 — out of scope on this host.

---

## 3. Verified on this machine

| Check | Result |
| --- | --- |
| `npx rea-agents@latest inspect-adb-client` | works; adb **36.0.0** at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` |
| `list-adb-devices` | `R5CTB0FJP9Z`, Samsung **SM-A5360** (Galaxy A53), state `device` |
| `inspect-adb-device` | **Android 16 / API 36**, patch 2026-08-05, `arm64-v8a`, `ro.debuggable=0`, `ro.kernel.qemu=0` |
| `pm list packages \| grep uber` | **`com.ubercab` installed**, version **4.654.10002** (322019); full 10-APK split pull verified — see §5 |
| `su -c id` / `ro.build.type` | `su: inaccessible or not found`, build type `user` → **unrooted stock device** (only matters for runtime work) |
| Node / Java | Node **24.12.0** (below REA's `^24.22.1`; npm warns `EBADENGINE`, the binary still runs), Temurin JDK **17.0.20.1** with `jdk.compiler` |
| JADX engine | downloaded pinned `jadx-headless-mcp-0.7.1-all.jar`, SHA-256 **matched** `6e5eacf5…3ff75` |
| Static Android lane | **works**: 21.5 MB APK → 1,313 classes / 416 resources loaded in **914 ms**, decoded manifest + full component inventory returned |
| Method decompilation | **works**: `ProActivity.onCreate` returned `body_status: available` with readable Java — on a small smoke-test APK with `a.n` / `C.b` / `c0.a` style symbols, i.e. a worst-case obfuscation sample |
| `--detail summary` on this CLI | rejected (`Unknown flag: --detail`); summary delivery is an MCP/`inspect-analysis-view` contract in this build |

So: **static APK analysis, device inspection and evidence handling are proven here today.**
What remains for a real Uber teardown is a native-analysis host for `.so`, a rooted or debuggable
build for runtime work, and patience with JADX on 207 MB (§5.1 covers the fallback acquisition path
that was never needed).

---

## 4. What that buys you on Uber specifically

### 4.1 Attack surface, fully static — highest value per hour
`inspect_android_package` returns the decoded `AndroidManifest.xml`, permission list and a
structured inventory of every activity/alias/service/receiver/provider: `exported`,
`exported_default`, inherited `permission` + `permission_source`, `authorities`,
`intent_filters` (actions, categories, schemes, hosts, paths), `process`, `enabled`.
That is exactly the data you need for "what can another app on the device reach", deep-link
surface, FileProvider/ContentProvider exposure, and background-service start-up paths.
`trace-android-references` then finds the code that consumes an exported entry point.

### 4.2 SDK and dependency census — fully static
Class-name search over the whole DEX gives the third-party inventory (maps, payments, analytics,
attribution, crash, feature-flag SDKs). `decode-android-resources` adds locales and string tables.
This is the cheapest way to answer "which vendors see rider data".

### 4.3 Architecture recovery — yes, names largely survive

Uber's Android apps are built on **RIBs** (Router / Interactor / Builder), open-sourced at
[github.com/uber/RIBs](https://github.com/uber/RIBs) and described for the driver app in
[Architecting Uber's New Driver App in RIBs](https://www.uber.com/us/en/blog/driver-app-ribs-architecture).
On the real 4.654.10002 build the `*Router` names **survived**: 2,558 matches with readable
packages (`com.uber.accessibilitysettings…`). Release builds still ship no `mapping.txt`, so a few
layers are renamed, but the RIBs tree is navigable without one; `--mapping-path` remains the option
if a specific obfuscated class must be restored.

### 4.4 Protocol and endpoints — partial, and where the legal line sits
Hostnames, path templates, protobuf descriptor strings, header names and feature flags usually
survive as DEX/resource string literals; `search-android-classes` + `inspect-android-method` can
follow a networking class and its interceptors. What you cannot do within REA's supported use is
MITM production traffic: that needs certificate-pinning bypass, which is exactly the
"circumventing … technical protection measures" its disclaimer excludes. Saved captures
(`inspect-web-network-capture`) are analysis-only, so they are useful for *your own* app or
authorized test endpoints, not for decrypting Uber's.

### 4.5 Native libraries — blocked on this host
Uber ships arm64 `lib/*.so` (crypto, networking, anti-tamper). REA can enumerate JNI
declarations and match them to exports/`JNINativeMethod` tables statically
(`inspect-android-jni-bindings`), but decompiling the ELF itself needs Ghidra/Hopper/IDA on a
host where REA admits ELF. On Windows that is not supported; the practical route is a Linux
box or WSL running REA, with Ghidra 12.x.

### 4.6 Authenticity and release diffing — fully static
`inspect-apk-signature` gives v1/v2/v3/v3.1 signers, certificate fingerprints and key rotation.
Use it to prove a downloaded APK is genuinely Uber-signed before you trust any analysis of it —
essential if the APK comes from a mirror rather than the device. Then `compare` two versions'
evidence to see what a release added or removed (new SDK, new permission, new exported component).

### 4.7 Behaviour and UI — doable on your own device/account
ADB lanes give window focus, logcat (bounded, pid-filterable), screen capture, package metadata,
installed-split list. That supports flow teardown, permission prompts, deep-link behaviour and
crash/ANR evidence without touching the code. `start-adb-activity` lets you replay a deep link.

---

## 5. Acquisition (solved on this device)

On the attached phone Uber is now installed. **`adb pull` of `/data/app/...` succeeded as `shell`**
on this Samsung/Android 16 build — no root was needed, contradicting the usual expectation. The
whole 10-APK split set was pulled and digest-verified (§5.1 stays as the fallback for devices that
do deny it). If a pull is denied:

1. **Rooted test device** (not the daily phone): install from Play, then
   `pull-adb-package` works and you get the exact Play-signed split set. Cleanest provenance.
   Costs: Knox/warranty, and root is detectable.
2. **Third-party mirror (APKMirror/APKPure)**: gives the split bundle without root, but
   provenance is weaker and redistribution terms are murky. Verify with
   `inspect-apk-signature` against the Play signing certificate before analyzing.
3. **Rooted emulator**: technically easiest, but the owner rule for this workspace forbids
   emulators, so it is not an option here.

### 5.1 Fallback: rooted spare device (only if the direct pull is denied)

Root alone is not enough for REA's `pull-adb-package`: every adb command in that lane runs as
`shell` (fixed argument vectors, no arbitrary `su`), so `/data/app/...` stays unreadable even
with Magisk installed. `adb root` only works on userdebug/custom builds. The reliable sequence
is a manual root copy into a readable directory, then REA's `pull-adb-file`:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$serial = "<rooted-device-serial>"

# 1. confirm root (must print uid=0)
& $adb -s $serial shell "su -c id"

# 2. install Uber from Play on the device first (rider app shown; driver app is com.ubercab.driver)
& $adb -s $serial shell pm path com.ubercab          # base.apk + split_config.*.apk lines

# 3. stage the split set into a shell-readable directory
& $adb -s $serial shell "su -c 'rm -rf /sdcard/uber && mkdir -p /sdcard/uber && cp /data/app/*/com.ubercab-*/base.apk /sdcard/uber/ && cp /data/app/*/com.ubercab-*/split_*.apk /sdcard/uber/ 2>/dev/null'"
& $adb -s $serial shell "ls -l /sdcard/uber"

# 4. pull with REA, then analyze
$env:REA_ADB_PATH = $adb
rea pull-adb-file $serial /sdcard/uber/base.apk --output-directory D:\targets\uber
rea pull-adb-file $serial /sdcard/uber/split_config.arm64_v8a.apk --output-directory D:\targets\uber
rea inspect-apk-signature D:\targets\uber\base.apk --format json   # must match Uber's Play cert
rea inspect-android-package D:\targets\uber\base.apk --format json
```

`su -c cp` is the one step REA does not perform for you; it is a shell copy on a device you own,
not a provider bypass. Some Play installs place base and splits under more than one `/data/app/*`
directory — confirm the `pm path` output before copying.

Whichever route: Play delivers **split APKs** (base + `config.arm64_v8a` + `config.xxhdpi` +
feature modules). REA analyzes one standalone APK; it does not merge splits. Analyze `base.apk`
for manifest/code, then the config/feature splits for resources and extra DEX, and keep the
split set together as evidence.

> **Decision taken:** the direct `adb pull` from `/data/app` succeeded on the stock A53, so neither
> the rooted spare device nor a mirror APK was needed. §5.1 is kept as the fallback for devices that
> deny the pull.

---

## 6. Runbook (executed on this device)

```powershell
# engine
$env:REA_JADX_MCP_JAR = "$HOME\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"
$env:REA_JADX_OPERATION_TIMEOUT_MS = "480000"
$env:REA_JADX_HEAP_MIB = "10240"   # 4096 dies with "Java heap space" on this 207 MB APK
$env:REA_ADB_PATH = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

$apk = "D:\targets\com.ubercab\base.apk"

rea inspect-android-package $apk --format json > uber-manifest.json
rea inspect-apk-signature $apk --format json > uber-signer.json
rea search-android-classes $apk Router --format json
rea inspect-android-class $apk com.ubercab.some.Class --format json
rea inspect-android-method $apk com.ubercab.some.Class someMethod --format json
rea trace-android-references $apk com.ubercab.some.Class --method-name someMethod --format json
rea inspect-android-jni-bindings $apk --format json      # declaration → .so export map
rea decode-android-resources $apk --locale en            # needs REA_APKTOOL_COMMAND
rea compare uber-manifest-v1.json uber-manifest-v2.json --format json
```

Device side (read-only unless flagged): `list-adb-packages --scope third_party`,
`inspect-adb-package`, `read-adb-logcat --pid`, `capture-adb-screen`, `inspect-adb-window`,
`start-adb-activity` (mutating), `stop-adb-app` (mutating).

MCP instead of CLI: same names in snake_case (`inspect_android_package`, …). Register with
`npx rea-agents@latest setup`, or run the server with `rea mcp`.

Rules of thumb learned from the smoke test: the JADX session is reused across calls but retires
after 60 s idle; the 1 MiB upstream text budget truncates large method bodies and manifests, and
truncation is reported explicitly; class search pages 4,096 names at a time.

---

## 7. Limits that will actually bite

- **Node engine**: REA wants `^22.23.4 || ^24.22.1 || >=26.12.1`; this host has 24.12.0. It runs,
  with an `EBADENGINE` warning. Upgrading Node removes the doubt.
- **No `.aab` support** — an `.aab` is treated as a ZIP, not an APK.
- **No split merging** — see §5.
- **No runtime capture in the Android lane** — Frida is a separate, optional lane and REA never
  installs `frida-server`.
- **Windows native analysis is PE-only** — Android ELF needs Linux/WSL + Ghidra 12.x.
- **Decompiler output is a derived representation** — every result carries that limitation;
  do not present a decompiled body as original source.
- **The CLI's `--detail` flag is not available on this build** for the one-shot Android commands
  even though the docs show it for MCP; use `--filter-output` to keep output small.

---

## 8. Legal and ethical boundary

REA's own `DISCLAIMER.md` states it will not help with "circumventing DRM, license checks,
anti-cheat systems or other technical protection measures", "tampering with online services",
or "bypassing authentication, bot protection or access controls on systems you are not
authorized to test". That maps directly onto what *not* to attempt here:

- no bypassing certificate pinning, root/tamper detection or app-integrity checks against
  production Uber;
- no intercepting or replaying another person's session, trip or payment data;
- no scraping, automated ride/account activity, fare or incentive manipulation, driver/rider
  impersonation;
- no redistribution of decompiled code or extracted assets.

Legitimate scopes that stay inside the tool's stated purpose: static architecture study,
permission/exported-component review, dependency and privacy-surface mapping, authenticity
verification, and — for security findings — reporting through
[Uber's HackerOne program](https://hackerone.com/uber) after reading its current policy
(scope, exclusions, rate-limit findings are out of scope per Uber's public update). Reverse
engineering is lawful in many jurisdictions for interoperability/security research, but
contract terms and anti-circumvention law still apply; this note is not legal advice.

---

## 9. Effort, if the APK is obtained

| Deliverable | Rough effort | Confidence |
| --- | --- | --- |
| Manifest + permission + exported-component report | 2–4 h | high |
| SDK/vendor and data-flow-relevant library census | 4–8 h | high |
| RIBs/feature architecture map (obfuscated names) | 1–2 days | medium |
| Static endpoint/flag inventory | 1 day | medium |
| Signature + version-diff report | 1–2 h | high |
| Native `.so` study | needs Linux/WSL + Ghidra first | low on this host |

---

## 10. Sources

- Repo: `docs/android-analysis.md`, `docs/adb-device-analysis.md`, `docs/frida-instrumentation.md`,
  `docs/apk-signature.md`, `docs/apktool-resource-analysis.md`, `docs/windows-ghidra-p0.md`,
  `DISCLAIMER.md`, `package.json` (engines 6.8.0).
- Uber app identities: [Play – Uber](https://play.google.com/store/apps/details?id=com.ubercab),
  [Play – Uber Driver](https://play.google.com/store/apps/details?id=com.ubercab.driver).
- Uber mobile architecture: [uber/RIBs](https://github.com/uber/RIBs),
  [Architecting Uber's New Driver App in RIBs](https://www.uber.com/us/en/blog/driver-app-ribs-architecture).
- Program policy: [hackerone.com/uber](https://hackerone.com/uber) (read the live policy; the page
  is JS-rendered and could not be quoted verbatim here).
