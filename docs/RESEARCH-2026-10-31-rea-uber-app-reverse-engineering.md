# Fastship research: REA × the real Uber app — completed teardown (part 2)

**Prepared:** 31 October 2026 · **Supersedes/extends:** `docs/RESEARCH-2026-10-30-rea-uber-reverse-engineering.md` (the 30 Oct part-1 doc; its §10 execution record stands) · **Audience:** the owner; any session continuing REA work on K5.

**What this document is:** the completed form of the interrupted DeepSeek V4.1 Flash session *"REA research: Uber app reverse engineering"* (read from the owner's OpenCode session export `C:\Users\osama\OneDrive\سطح المكتب\rea-research-uber-app-reverse-engineering.json` — Desktop — which records model `deepseek-v4.1-flash-free` and final error `provider.free-limit` 429; the session died on the provider's usage limit, not on the work). That session produced two research notes in a temp clone of the REA repo and stopped before its own "safe next steps" (§9 of its analysis note). This document: (1) preserves those notes into this repository with all their evidence, (2) reports the completion of **every statically completable aspect of the app** — DeepSeek's own §9 list (§4.1–4.3) plus the full 29-aspect coverage pass (§4.5) — executed 31 Oct on K5, and (3) states what is deliberately left open. The two original notes are archived verbatim at `research_notes/REA Uber app reverse engineering/uber-app.md` and `uber-app-analysis.md`, with 19 evidence files in `evidence-deepseek/` and 62 more from today (result JSONs, split signatures, Apktool scan script + outputs, and the two `run-rea*.cmd` helpers) in `evidence-k5-today/`.

**Scope and boundary (unchanged from part 1 §0/§5):** static analysis only, of an APK pulled from the owner's own phone of an app the owner has installed; the app was never executed for these passes; no request was sent to any Uber system; no circumvention technique is described or used; the security-candidate item (F1) is documented for **owner-decided, test-account, HackerOne-gated** handling only. Nothing here is legal advice.

## 0. Rules used in this document

- **[W]** verified this session against the cited primary source. **[R]** verified in this repository (file given). **[D]** established in DeepSeek's archived notes (evidence JSONs in `research_notes/REA Uber app reverse engineering/evidence-deepseek/`, artifact SHA-256-anchored). **[K5]** executed on K5 today, evidence in `evidence-k5-today/`. **[X]** not verified — §7 lists them.
- All Uber numbers below describe **one build**: rider app `com.ubercab` **4.654.10002** (versionCode 322019), pulled 30 Oct from the SM-A5360 test phone. They are not claims about other builds or Uber's server side.

## 1. Answers first

1. **REA works end-to-end against the real production Uber rider app.** The full pipeline — `pull-adb-package` from the phone (10 APKs, no root needed on this device), signature provenance match against the device-reported signer, manifest projection over 174,047 classes / 23 DEX files, class search, method decompilation, reference tracing, class census — all executed and all returned evidence [D, K5]. The binding constraint is never the tool; it is host RAM for the 207 MB base APK (heap ≥ ~6 GiB; 10,240 MiB was proven on this PC, 6,144 MiB proven on K5 today) [D, K5].
2. **The "Uber is heavily obfuscated" assumption is wrong for first-party code.** 67,408 of 174,047 classes (38.7 %) carry readable first-party names (`com.uber.*` 54,986 + `com.ubercab.*` 12,422), including **2,558 classes matching `Router`** — the RIBs tree is navigable without any mapping file [D §6 of the analysis note; census numbers K5]. Vendor code is largely renamed or under its own namespaces (com.google. 1,823; androidx. 2,090; io.reactivex 531; org.chromium. 79; com.squareup. 33; com.facebook. 2) [K5].
3. **One reportable security candidate came out of the whole teardown (F1)**, and it is *not confirmed*: `ParametersOverrideRequestBroadcastReceiver` is exported with no permission and its feature gate `xp_mobile/is_parameter_override_via_broadcast_allowed` defaults to **true** [D §5.1]. Today's completion run adds the fact that **no code in the APK references the receiver** (trace total 0 — manifest-declared receivers are instantiated by the framework, so "who consumes it" is not answerable by reference tracing) [K5], and the catalogue of writable parameters is server-driven data, not statically enumerable. Decision needed: pursue or drop, only via a test account under Uber's HackerOne rules — never against production or other users.
4. **The IPC allowlist contents are now provably unreachable by name-directed static search.** Today we inspected the last candidate classes (`ipcutils.usecase.b` = a coroutine runner, `usecase.c` = a Dagger wrapper taking `dagger.Lazy`, `util.AppInfoProvider` = abstract) and searched the full 174,047-class space for `AllowList`/`allowlist` (0 matches). The concrete `ValidateAppForIPCUseCase` binding is an obfuscated Dagger-bound class; resolving it needs a manual Dagger-graph walk, which we did not spend more hops on. Residual unknown, low value [K5].
5. **What stays out of reach on these hosts, unchanged:** native `.so` decompilation (REA's Windows Ghidra lane admits PE only — needs Linux/WSL + Ghidra), runtime hooking (needs frida-server on a rooted device; REA never installs it), anything behind TLS pinning (out of bounds by REA's disclaimer and this repo's rules) [D §2, §7 of `uber-app.md`; the pinning boundary is argued in that note's §4.4/§8].
6. **Fastship's own audit (part 1) remains the model of what this toolkit is for here:** our release APK was clean, and the Uber teardown's most transferable lessons are now concrete — see §6.

## 2. Provenance and integrity of the target [D — archived evidence]

| Check | Value |
| --- | --- |
| Artifact | `base.apk` **207,761,677 bytes**, SHA-256 `55663c73…4a2` — re-verified bit-identical on 31 Oct before the K5 runs [K5] |
| Source | `pull-adb-package` from the owner's SM-A5360 (Android 16/API 36, unrooted, `ro.debuggable=0`), split set of 10 APKs, `coverage: complete` |
| Signing | v2+v3, `self_consistent: true`; cert SHA-256 `4003231a…392`, subject `O=UberCab, CN=Jordan Bonnet`, 2010 → 2060 |
| Device cross-check | `dumpsys package com.ubercab` reports the same signing cert — the analyzed build is the installed build, not a mirror |
| Play source stamp | present (`CN=Android, O=Google Inc.`) — Play-distributed |

Split-set composition maps the product surface by filename alone: `split_config.arm64_v8a` (all 13 native libs), `split_VoipTwilio…` (Twilio VoIP), `split_BarcodeScanner…` (ML scanning), `split_GooglePaySdk`, `split_FlashNacional` (Brazil pricing feature), `split_config.ar` (Arabic), `split_config.xxhdpi` (density). REA does not merge splits; only `base.apk` was decompiled [D §2]. (Note: the DeepSeek session's 30 Oct pull supersedes part 1's "we deliberately did not obtain the APK" stance — part 1 §10 recorded that the Uber app on the phone was not touched; the same owner then had DeepSeek run the pull-and-analyze pass the next day, and this document completes it.)

## 3. What the teardown established on the real build [D — `uber-app-analysis.md`]

- **Manifest:** 46 permissions, 110 components, **26 exported**, 89 intent filters across all components (72 of them on the 26 exported ones — the other 17 sit on non-exported components and are not externally reachable), 103,309-byte decoded manifest, minSdk 29 / targetSdk 36.
- **Exported surface:** 25 unique components — Uber's own deep-link entries (`RootActivity` with 30 filters across `uber`, `com.ubercab`, `geo`, 24 hosts), payment SDK activities (Adyen 3DS, PayPal, Venmo, UberPay), WhatsApp OTP receivers (`com.whatsapp.otp.OTP_RETRIEVED`), and three unvalidated-looking IPC surfaces (F1/F2/F3 below). No exported component carries a custom signature permission — everything Uber-specific relies on runtime checks.
- **Findings register:** F1 candidate (the parameters-override receiver, §1.3 above); F2/F3 defended in code (`ValidateAppForIPCUseCase` allowlist, contents unknown); F4 the `uber_performance_debug` scheme shipped in production; F5/F6 standard integrations. Full table and deep dives in the archived analysis note §4–5.
- **Architecture:** RIBs confirmed on the real build by name evidence (§1.2); Uber's own blog confirms the driver app is a core/non-core RIBs tree with plugins and workers built by ~40 teams [W uber.com blog, verified 31 Oct].
- **Native libraries (not disassembled):** `libubermaps-gl.so` 3.91 MB, `libtensorflowlite_jni.so` 4.12 MB, `libvendor-mapdisplay.so`, `libeef0.so`, `libse*.so`, `libh3.so` (H3 indexing) and AndroidX/Crashlytics helpers — all in the ABI split.

## 4. Completed on K5 today (the interrupted session's §9, static items)

§4.1–4.3 below complete DeepSeek's own five-item "safe next steps" list; §4.5 (added after an independent 29-aspect coverage audit by a review subagent) completes the **remaining statically reachable aspects of the app** — named-vendor census, split verification, resources/locales, manifest security attributes, and the F1 parameter registry — that that list never mentioned. All evidence files live in `research_notes/REA Uber app reverse engineering/evidence-k5-today/` (62 files after the second pass). Engine for both passes: REA 6.8.0 + JADX 0.7.1 (pinned JAR, SHA-verified) on `uber-base.apk` (SHA re-verified); each one-shot CLI call reloads the APK (~70 s observed, range 58–80 s on K5); heap 6,144 MiB.

1. **Receiver consumers (F1 reachability): `trace-android-references` on `ParametersOverrideRequestBroadcastReceiver` → total 0.** [uber-override-trace.json, coverage complete] Code *can* reference manifest-declared component classes explicitly (DeepSeek's traces found 16 using nodes for the IPC use-case class), so zero here is an observation, not a tautology: nothing in this APK's code refers to the receiver — the OS instantiates it from the manifest. The interesting question (which catalogue parameters are writable, and whether any gates a security check) is a question about **server-driven parameter data**, not about code references; it is not answerable statically from the receiver alone. F1 therefore remains exactly where DeepSeek left it: a plausible, unconfirmed candidate needing a controlled test-account experiment — owner decision, HackerOne rules.
2. **IPC allowlist binding: unreachable by name-directed static search.** [uber-ipc-b.yaml/c.yaml — these two were captured in REA's rendered-text format, not JSON — uber-gl2a/f, uber-dlcf, uber-appinfoprovider, uber-allowlist(-2).json] `usecase.b` is a `RunIpcDiagnosticUseCase` coroutine; `usecase.c` is a Dagger wrapper whose constructor takes `(Context, ValidateAppForIPCUseCase, dagger.Lazy)`; `util.AppInfoProvider` is abstract (its `b` method carries the `abstract_method` marker — `uber-appinfo-b.json`); class-space searches for `AllowList` and `allowlist` return **0** matches. Also corrected part 1's [X]: Needle is Uber's **iOS/Swift** DI [W github.com/uber/needle] — on Android the APK shows **Dagger** (`dagger.Lazy` in the inspected constructor; Dagger factories among the using nodes, e.g. `gl2.*` today [K5] and `jl2.*` in DeepSeek's trace, `evidence-deepseek/validate-ipc-refs.json` [D]). The concrete binding would need a hand walk of generated Dagger modules — which *is* static analysis, just not name-directed search; not worth more hops for an Info-grade item.
3. **Class census by package family (23 DEX files, 174,047 classes, all queries `coverage: complete`):** [census-*.json]

| Family | Classes | Share |
| --- | --- | --- |
| `com.uber.*` | 54,986 | 31.6 % |
| `com.ubercab.*` | 12,422 | 7.1 % |
| **first-party subtotal** | **67,408** | **38.7 %** |
| `androidx.*` | 2,090 | 1.2 % |
| `com.google.*` | 1,823 | 1.0 % |
| `io.reactivex*` | 531 | 0.3 % |
| `org.chromium.*` | 79 | <0.1 % |
| `com.squareup.*` | 33 | <0.1 % |
| `com.facebook.*` | 2 | <0.1 % |
| `com.amazonaws.*` | 0 | 0 % |
| `kotlin*` (substring match: `kotlin.*`, `kotlinx.*`, 5 Compose-embedded androidx classes — overlaps the vendor rows and the remainder; family rows are not additive) | 190 | 0.1 % |
| everything else (obfuscated/generated) | 102,081 | 58.7 % |

Reading: first-party code is ≈15× the *named* vendor code (67,408 vs 4,558 across the listed vendor families); the 58.7 % short-name bulk is where vendored internals, generated code and renamed libraries live. For a future pass, the census gives a cheap regression metric: re-run after each Play release and diff the families (new SDK = new namespace appearing).

### 4.5 Coverage-completion pass (second K5 session, 31 Oct — every statically reachable aspect)

An independent GLM-5.3-Flash audit enumerated 29 aspects an analyst would want covered on this build and marked the then-current state honestly: the work covered the **attack-surface + architecture slice**, with named-vendor census, split verification, JNI mapping, resources/locales, manifest security attributes and the F1 parameter registry never attempted. That audit drove the second K5 session; results (evidence `sdk-*.json`, `sig-*.json`, `uber-split-*.json`, `uber-jni-*.json`, `uber-param*.json`, `res-scan.js` output in `evidence-k5-today/`):

**Split verification — the set is coherent.** All 9 non-base splits carry the **same signing certificate** as base (`4003231a…392`, v2+v3) plus the Google **Play source stamp** (`CN=Android, O=Google Inc.`) — the whole 10-APK set is Play-signed and self-consistent [sig-split-*.json ×9, sig-uber-base.json]. Per-split content: `arm64_v8a` = **0 classes** (`android:hasCode="false"` — pure native libs + 18 resources; confirms all code lives in base + feature modules); `VoipTwilio` = 170 classes, 5 permissions (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, network trio); `BarcodeScanner` = 1,328 classes, 1 component (ML Kit discovery service, unexported); `GooglePaySdk` = 145 classes; `FlashNacional` = 9 classes; `ar`/`xxhdpi` = resource-only.

**Named-vendor SDK census (the "which vendors see rider data" question).** [sdk-*.json] Payments: `braintree` 219 classes, `adyen` 57, plus the GooglePay/Adyen 3DS/Venmo components from §3. Monitoring: `sentry` 40, `segment` 9, `adjust` 3. **Zero third-party attribution/analytics/messaging SDKs in base**: `appsflyer` 0, `com.branch` 0, `mixpanel` 0, `amplitude` 0, `stripe` 0, `twilio` 0 (Twilio is quarantined in its own VoIP feature split — the cleanest possible answer for a ride-hailing app). Google decomposition of the 1,823 `com.google.*`: `com.google.android.gms` 927 + `com.google.firebase` 151, remainder vendor libs.

**Hardening signals (class-name evidence only).** [sdk-*.json] `CertificatePinner` 1 match — an Uber Cronet okhttp shim class (`com.ubercab.okhttp3_cronet.CronetCertificatePinner`), not okhttp's own; presence says nothing about configured pins. `PlayIntegrity` 2, `JavascriptInterface` **0** (no JS-bridge annotation reference found in class names). Whether pins are actually configured is a runtime property — static class-name search cannot confirm it [X].

**Resources and locales (Apktool 3.0.3, decode `-s` on base).** [res-scan-output.txt, res-values-dirs.txt] 15,380 default-locale strings; the base's 35 `values*` tables are all **configuration qualifiers, zero language tables** — translations ship in the language splits (`split_config.ar`), matching the split model. The manifest's three `@string` deep-link schemes resolve to `https` (SSO redirect), `line.1486487802` (LINE SSO) and `fb277064115737714` (Facebook login app id). Secret-pattern scan (counts only; values deliberately not reproduced): **3 `AIza…` Google API keys present** in string resources — normal for Maps/ML Kit client keys, restricted server-side by Google's console, not a finding; 0 AWS keys, 0 live secrets, 0 private-key blocks, 1 string naming an `api_key`, 1 `firebaseio` reference. Curious artifact: base's default `app_name` is a leftover internal codename ("Proto SimpleStore") — the shipped launcher label resolves elsewhere.

**Manifest security attributes (re-parsed from the archived manifest evidence — zero new tool runs).** `allowBackup=false`; `networkSecurityConfig` **present** (1 reference); no `usesCleartextTraffic`, no `debuggable`; **38 `autoVerify=true`** App-Link filters (verified deep links, consistent with the 24-host surface); **3 Uber-defined `<permission>` elements, all `protectionLevel="signature"`** (`com.ubercab.permission.C2D_MESSAGE`, `com.ubercab.permission.RECEIVE_BROADCAST`, `com.ubercab.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — FCM/support-library boilerplate, not custom security gates); framework signature-gated components: 2 receivers under `DUMP`, 5 services under `BIND_JOB_SERVICE`; 18 provider authorities (12 unexported `FileProvider`s + the 3 exported IPC providers of §3 + 3 library/framework ones), 3 `directBootAware`; foreground-service types: `location`, `microphone`, `microphone|location|dataSync`, `mediaProjection`.

**F1 parameter registry, bounded.** [uber-paramoverride2.json, uber-paramproxy.json, sdk-ParametersOverride.json] The registry is `com.uber.parameters.override.ParametersOverride` with exact mechanics now read: `d(namespace, key): Optional` lookup (absent key ⇒ the `PARAM_NOT_FOUND` path), `c(param, value)` write, and `f()` streaming the full catalogue as an `ImmutableList` — the catalogue itself is device-cached **server data**, so the writable key set cannot be enumerated statically. Two additions to the record: a **`ParametersOverrideRouter` debug UI ships in the release build** (in-app parameter-override screen, RIB-based), and the broadcast proxy's method table confirms the receiver path (`P5()` → registry). F1's assessment is unchanged and now fully grounded.

**Structurally unreachable on this toolchain (documented negatives, both archived):** REA 6.8.0 has **no `inspect-android-jni-bindings` CLI command** (the docs' Android guide names it, but the npm release ships without it — both attempts archived as `COMMAND_NOT_FOUND` errors), so the ACC_NATIVE↔`.so` map is not producible with this toolchain regardless of splits. Endpoint/hostname string inventory: **deliberately not performed** — this repo's own no-go list (part 1 §5) forbids harvesting endpoints from apps we are not authorized to examine, and the capability adds nothing for Fastship that the architecture findings haven't already given.

**Final coverage table (29 audited aspects):**

| # | Aspect | Final status |
|---|---|---|
| 1 | Provenance & acquisition | COVERED |
| 2 | Signing & cert lineage | COVERED (base signature evidence archived; all 10 APKs same cert + Play stamp) |
| 3 | Manifest inventory | COVERED |
| 4 | Permissions | COVERED (declared list + defined-permission analysis: 3 Uber-defined, all signature-level boilerplate — see §4.5) |
| 5 | Exported surface + findings register | COVERED |
| 6 | F1 reachability + registry | COVERED to the static limit (server catalogue unreachable — data, not code) |
| 7 | Deep links (hosts, schemes, `@string` values, autoVerify) | COVERED (38 autoVerify; string values resolved; host→handler routing not decompiled — a 1–2 day task per the effort table in the archived `uber-app.md` §9) |
| 8 | Content providers / IPC | COVERED to the static limit (allowlist contents name-unreachable; other 14 non-exported providers inventoried by authority only) |
| 9–10 | Services & receivers beyond exported | PARTIAL (inventoried in aggregate; individually only the exported/notable ones — low value, documented) |
| 11 | Architecture (RIBs) | COVERED (presence + census; tree map not drawn — effort-table item in archived `uber-app.md` §9) |
| 12–13 | Obfuscation + platform census | COVERED |
| 14 | Named-vendor SDK census | COVERED (15 vendor queries + Google decomposition) |
| 15 | Native library inventory | COVERED (names/sizes/roles; identity of `libeef0.so` still [X]) |
| 16 | JNI declaration↔library mapping | UNPRODUCIBLE (REA 6.8.0 CLI ships without the command — both attempts archived as COMMAND_NOT_FOUND) |
| 17–18 | Resources, strings, locales, assets | COVERED (Apktool decode; locales by split; secret scan counts-only) |
| 19 | Manifest security attributes | COVERED |
| 20 | WebView/JS-bridge surface | COVERED at the static limit (0 `JavascriptInterface` class-name matches; the 12 WebView fileproviders appear in the provider list in §4.5) |
| 21 | Endpoint/API string inventory | OUT-OF-SCOPE by this repo's no-go list (deliberate) |
| 22 | Hardening indicators (pinning/integrity/root) | COVERED at the static limit (class-name signals only; configuration is runtime [X]) |
| 23 | The 9 non-base splits | COVERED (all signature-checked; code-bearing ones manifest-inspected with class/permission counts) |
| 24 | Version diffing (`rea compare`) | NEEDS SECOND BUILD (acquisition routes already documented) |
| 25 | Native `.so` disassembly | HOST-BLOCKED (needs Linux/WSL + Ghidra; unchanged) |
| 26 | Runtime/dynamic lanes | OUT-OF-SCOPE by boundary (app never executed; no frida-server; owner rules) |
| 27 | Server-side semantics | OUT-OF-SCOPE by boundary |
| 28 | Driver app (`com.ubercab.driver`) | OUT-OF-SCOPE for this document (scope fixed to the rider build in §0; a future pass could repeat the pipeline unchanged) |
| 29 | Evidence-archival completeness | COVERED (62 evidence files + 19 from DeepSeek; every claim in this document anchors to an archived file) |

**Deliberately not executed, unchanged from §4:** the F1 broadcast probe — it touches the production app on the owner's phone and is **the owner's call**, under Uber's HackerOne policy, on a test account, with the minimal probe shape documented in the archived note §9; and the Ghidra native lane — no Linux/WSL host on this LAN.


## 5. What Fastship should take from the Uber teardown [R — repo files where given]

1. **Our exported surface is already clean — keep it that way.** Wind 1.0.13 exports 5 components — 4 framework-standard plus our own launcher (part-1 report, §Exported components). Uber's teardown shows what accumulates when it isn't governed: 26 exported components, three IPC surfaces needing code-level defense. Rule for Fastship: every new component ships `exported=false` unless a documented feature needs otherwise, re-checked by `rea inspect-android-package` before each release.
2. **Deep links are the real external surface.** Uber's exported activities claim 24 hosts across custom schemes; whether each is validated server-side cannot be established statically — which is exactly why the client must not be trusted either. Fastship's position is partly good already: the trip-share token is server-validated (regex then SHA-256 match against `orders.share_token_hash` [R server/domain/realtime.ts:87–90]) and order deep links resolve through viewer-checked access (`getOrder` 404s non-authorized viewers [R server/main.ts:359]). Residual [X]: no consolidated audit that **every** `wind://`-reachable parameter is validated server-side — audit and document the coverage before the next release (note: QA variants register `wind-test-${testRole}` schemes in separate test packages [R app.config.js:60]).
3. **Feature gates that default to true are how F1-class bugs happen.** Uber's override receiver is gated by a parameter whose default is `true` — fail-open. Fastship's switches already model the right shape: the `WIND_*` env switches [R infra/main.bicep:354–366, 394–397] and the `enableWorkloads` default (already `false` — fail-closed) [R infra/main.bicep:11]. Rule: security-relevant switches fail **closed** by default, and stay that way in review.
4. **Feature splits are a product-surface map, not just a size optimization.** Uber ships barcode/VoIP/payments/regional-pricing as separate feature splits; base stays leaner. Fastship currently needs no feature modules — fine at our scale — but if the binary keeps growing, the `expo` config-plugin route is the documented path; note it in `docs/PRODUCT.md` rather than acting on it now.
5. **The audit loop is the asset.** Pull → signature check → manifest projection → census took ~30 minutes of tool time on K5 (after setup). That loop belongs in the release checklist (`docs/QA-WORKFLOW-2026-10-21.md` gains a step; not changed in this research pass).

## 6. Legal and program boundary [D §8 + part 1 §5 — restated, governing]

No pinning/tamper/root-check bypass; no interception of other people's sessions or payments; no automated ride/account activity or scraping against production; no redistribution of decompiled code. REA's own DISCLAIMER excludes circumvention of technical protection measures and tampering with online services [W REA repo DISCLAIMER.md]. Reverse engineering is lawful in many jurisdictions for interoperability and security research, but Uber's ToS forbids it "except as may be permitted by applicable law" [W, part 1 §5 quotes the clause], statute scope was not verified this session [X], and any security finding goes through [hackerone.com/uber](https://hackerone.com/uber) after reading its live policy. This document is research documentation of what was done and observed; it is not a playbook against Uber's services or users.

## 7. Not verified in this session ([X] register)

- Deep-link coverage: that **every** `wind://`-reachable parameter is validated server-side — trip-share tokens and order access are verified [R]; the rest of the parameter surface is unaudited (§5.2).
- Whether F1's parameters can gate a security-relevant check — server-side data, unverified, owner-gated experiment.
- Whether Uber's OkHttp `CertificatePinner` is actually **configured** with pins for its API hosts — class-name evidence only; configuration is a runtime property and probing it is out of bounds (§6).
- The `ValidateAppForIPCUseCase` allowlist contents (proven name-unreachable today; Dagger-graph walk not performed).
- The current live Uber build's numbers (all figures are for 4.654.10002, pulled 30 Oct — Play updates will invalidate them).
- DMCA §1201 / interoperability statute scope as applied here (unchanged from part 1).
- DeepSeek's claim that the first `pull-adb-package` on a stock device "contradicts the usual expectation" (§5 of its note) — observed once here [D], not independently confirmed as generally reproducible.
- Whether `libeef0.so` is what its name suggests — never disassembled.

## 8. Sources

- **Archived DeepSeek notes (verbatim):** `research_notes/REA Uber app reverse engineering/uber-app.md`, `uber-app-analysis.md` [D]; evidence: `evidence-deepseek/` (19 files), `evidence-k5-today/` (62 files: result JSONs, 10 split+base signatures, Apktool scan script + outputs, 2 helpers) [R, K5].
- **Executed today on K5:** REA 6.8.0, JADX headless 0.7.1 (pinned, SHA `6e5eacf5…775`), JDK 21.0.13, Node 24.22.2, heap 6,144 MiB; helper `run-rea-uber.cmd` archived with the evidence; artifact SHA re-verified before runs [K5].
- Uber architecture: [uber/RIBs](https://github.com/uber/RIBs) · [Architecting Uber's New Driver App in RIBs](https://www.uber.com/us/en/blog/driver-app-ribs-architecture) (verified 31 Oct) · [uber/needle](https://github.com/uber/needle) (iOS/Swift DI — verified 31 Oct).
- Program: [hackerone.com/uber](https://hackerone.com/uber) · REA: [morluto/rea](https://github.com/morluto/rea), [rea.tools](https://rea.tools), [npm rea-agents](https://www.npmjs.com/package/rea-agents) · Part 1: `docs/RESEARCH-2026-10-30-rea-uber-reverse-engineering.md` and `reports/rea-self-audit-2026-10-30.md` [R].
