# Handoff dossier — the Uber rider app (`com.ubercab` 4.654.10002), verified knowledge for a successor agent

**Prepared:** 31 October 2026 · **Audience:** the next analyst agent (written for a Claude Opus 5.5 session) · **Status:** coverage pass complete; three items remain that only the owner can unblock.
**Nature:** shareable facts edition. Every number in this dossier was read from the package, from the owner's own device, or from the vendor's public publications; each is anchored to an archived evidence file. No vendor system was contacted, no traffic was captured, no account action was performed.

---

## 1. Read this first

1. This dossier is the **entry point**. It states what is known, what is not, and where the proof lives.
2. The **fact documents** (all shareable, all kept free of method-and-tooling vocabulary):
   - `KNOWLEDGE-2026-10-31-uber-app-full-reference.md` — the consolidated reference (19 sections + evidence index)
   - `KNOWLEDGE-2026-11-01-uber-app-maps-deep-dive.md` — the map stack in depth (priority area)
   - `KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md`
   - `KNOWLEDGE-2026-11-01-uber-app-backend-services-and-routes.md`
   - `KNOWLEDGE-2026-11-01-uber-app-data-and-persistence.md`
   - `KNOWLEDGE-2026-11-01-uber-app-screens-and-design-system.md`
   - `KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md`
   - `KNOWLEDGE-2026-10-31-uber-rider-app-facts.md`, `KNOWLEDGE-2026-10-31-uber-app-maps-and-location-facts.md` — the first-pass topical reports
3. The **evidence archive** lives under `research_notes/` in two dated folders — **198 files** (179 current-study, 19 earlier). Every figure below names the file that proves it.
4. **`docs/CURRENT-WORK.md` is the rolling tracker** — read it first, update it last. Working notes, tooling decisions and the internal procedure record live there and in `reports/`, which are **internal only**.
5. **Two rules that outrank everything else:** never contact the vendor's systems, and never state a fact without an archived file behind it. Where something cannot be established, write *not determined* with the reason.

---

## 2. The subject, and the proof that it is the right subject

| Property | Value | Proof |
| --- | --- | --- |
| Package | `com.ubercab` 4.654.10002, versionCode 322019, minSdk 29, targetSdk 36, compileSdk 36 | `evidence-deepseek/manifest.json` |
| Delivery | 10 APKs: base + arm64 + xxhdpi + Arabic + 4 feature modules (+2 module configs) | ZIP inventory, `extract-arm64.json` |
| Base package | 207,761,677 bytes, SHA-256 `55663c73…c3e4a2` | recomputed locally and again from the device copy |
| **Installed build = studied build** | the APK pulled from the owner's phone hashes to the same value | `device-verification-2026-10-31.json` |
| Signer | `O=UberCab, CN=Jordan Bonnet`, 2010-10-15 → 2060-10-02, v2+v3, Play source stamp; cert SHA-256 `4003231a…8392`, SHA-512 `4a183902…6a6e` | `sig-uber-base.json`, `ipc-cert-allowlist-app-cert.txt` |
| Device | SM-A5360 (`a53x`), Android 16 / SDK 36, 1080×2400 @ 450 dpi, Mali-G68, GLES 3.2 | `device-verification-2026-10-31.json` |

**Scale, with the counting basis stated.** The 23 code files declare **288,727 class definitions** (verified on three samples against the platform's own inspector). The reader's *inventory view* lists **174,047** of them. Earlier documents quote inventory counts (e.g. `MapLayer` 254, Maps-client 70, `location` 1,250); the definition counts are 488, 86 and 3,461. **Never mix the two bases** — the full reference §19 spells this out.

---

## 3. Coverage matrix

Legend: **DONE** = measured and documented with evidence; **DONE-LIMITED** = measured, with a named residual; **BLOCKED-OWNER** = needs a second build, an app install, or a live account action.

| # | Area | Status | Where the facts are |
| --- | --- | --- | --- |
| 1 | Build identity, splits, signing, source stamp | DONE | full ref §§1–2 |
| 2 | Class/member inventory and scale | DONE | architecture doc §1–2 |
| 2b | **Complete source coverage** — every code file turned into Java by an independent reader, on two machines, with per-slice counts | DONE | this section, `full-source-coverage-2026-10-31.json` |
| 3 | RIB/DI layering, async model | DONE | architecture doc §2–4 |
| 4 | Configuration platform (14,516 parameters) | DONE | architecture doc §6 |
| 5 | Vendor composition (what ships, what does not) | DONE | full ref §4 |
| 6 | Manifest: permissions, components, filters, providers | DONE | full ref §8 |
| 7 | Map stack: engines, pipeline, camera maths | DONE | maps deep dive §§1–9 |
| 8 | Map renderer selection (code + default) | DONE | maps deep dive §2.1 |
| 9 | Map renderer at runtime (observation) | DONE-LIMITED (one device, one session) | maps deep dive §2.2 |
| 10 | Map imagery cubes, 3-D, glTF, clustering | DONE | maps deep dive §7 |
| 11 | Location pipeline, H3, geocoding | DONE | full ref §6 |
| 12 | Backend route surface (1,406 literals → 1,032 product calls) | DONE | backend doc §2 |
| 13 | Hosts, CDNs, style host | DONE | backend doc §6 |
| 14 | gRPC surface (36 services) and model domains | DONE | backend doc §§4–5 |
| 15 | Identity, session, passkeys, device binding | DONE | backend doc §7 |
| 16 | Persistence: typed stores, library SQL, caches | DONE | data doc §§2–5 |
| 17 | Screens, navigation surface, deep links | DONE | screens doc §§1–3 |
| 18 | Design system, motion, resource pool | DONE | screens doc §4 |
| 19 | Functional requirements (28) | DONE | requirements doc §2 |
| 20 | Non-functional requirements (15) | DONE | requirements doc §3 |
| 21 | IPC caller validation: package list | DONE | full ref §18.2 |
| 22 | IPC caller validation: certificate allowlist | DONE | full ref §18.3 |
| 23 | Crypto engine (`libse`/`libse_loader`) | DONE | full ref §18 |
| 24 | `libeef0.so` internals | DONE-LIMITED (characterised, purpose unnamed) | full ref §18.1 |
| 25 | Map engine native composition | DONE | maps deep dive §3 |
| 26 | Attribution/analytics posture | DONE | full ref §4, §7 |
| 27 | Device integrity probes | DONE | backend doc §8 |
| 28 | Observability and diagnostics | DONE | architecture doc §8 |
| 29 | Release-to-release change comparison | **BLOCKED-OWNER** — one build exists on every machine and on the phone | tracker |
| 30 | Driver app (`com.ubercab.driver`) | **DONE-LIMITED** — no binary available, but its public surface is documented from the vendor's own store record (§4.7) | §4.7, `external-public-sources-2026-10-31.json` |
| 31 | Why the live session resolved to the Google renderer | DONE-LIMITED — three candidate mechanisms named, discriminator needs runtime inspection beyond the boundary | maps deep dive §2.2, §10 |

---

## 4. The knowledge, condensed

### 4.0 How complete the reading of the code actually is

The whole package was turned into readable Java source, not sampled:

| Measure | Value |
| --- | --- |
| Code files processed | **23 of 23**, zero slices dropped or timed out |
| Source files produced | **206,254** on each of two independent machines — identical totals *and* identical per-slice counts (`classes.dex` 4,030 · `classes2` 11,478 · `classes4` 11,967 · `classes16` 9,992 · `classes23` 5 …) |
| Source volume | **607,981,516 characters** (≈ 580 MB) |
| Files with a **hard** failure marker | **657 (0.32 %)** — the class is still emitted with all successfully read members; only individual members fall back |
| Files with warnings only | 42,893 (enum-restoration and SSA-cleanup notices, mostly on generated classes) |
| Clean share | **99.68 %** |
| Reconciliation with the class count | 288,727 definitions = **195,076 top-level types** + 93,651 inner types; one source file per top-level type, so 206,254 files and 288,727 definitions are two measures of the same code |

**Cross-checks that the source agrees with the bytecode findings:** the converted source contains `mapdisplay_flipr_available_map_providers` (4 files), `ValidateAppForIPCUseCase` (15), `initialMapProvider` (10), `AppConfig` (43), `metersPerPixelAtCoordinate` (11) and `MapProviderConfiguration` (9); and the enum file itself reads `UBER, GOOGLE, UNKNOWN` with the `FALLBACK_MAP_PROVIDER` field — exactly the constants read earlier from the instruction stream. Two readers, two hosts, same answer.

What the 0.32 % means in practice: for those files the reader emitted a comment where a member body would be. The split is decisive — **600 of the 657 are vendored library classes** (204 in the Adyen 3-D Secure package alone, 12 in androidx, the rest in obfuscated library packages), and only **57 are first-party files = 0.028 % of the whole tree** (for example `PreTripV2Router`, `KeyValueTTLStoreImpl`, `HubLargeCarouselViewModel`). In those 57 the class declaration and every successfully read member are still present; only an individual member fell back, and no finding in this dossier rests on one of them.

### 4.1 What the product is
A single large first-party codebase (125,670 of 288,727 definitions are `com.uber*`/`com.ubercab*`) plus vendored infrastructure, organised as a **RIB tree** with Dagger scopes, Rx-first with coroutines adopted in newer modules. 65,152 generated model classes define the client–server contract. Behaviour, rollout, performance tuning and bug fixes are **data**: 14,516 shipped parameters (7,258 boolean, 3,372 plugin switches, 1,844 int64, 1,420 string, 622 float64) across 153 team namespaces; categories FEATURE_FLAG 5,467, CONFIGURATION 4,151, PLUGIN 3,374, BUG_FIX 1,517.

### 4.2 Maps (the priority area)
- **Own engine**: `libubermaps-gl.so`, 4,099,192 bytes, **6,504 exports**; component census `msd::` 4,926, `maps::common::*` 1,506, feature buckets 311 (`label`, `line`, `fill`, `fill_extruded`, `circle`, `marker`, `raster`), `TileWorker` 199, atlases 125, collision/placement 212, GL wrapper 60, **Boost 848**, **Clipper 181**, rapidjson 70, libuv 304, and Mapbox's open geometry only (`geojsonvt` 56, `Earcut` 18). **No `mbgl::` core** — an own engine on open components.
- **Vendor layer**: `libvendor-mapdisplay.so`, 4,196 exports — tile/glyph/sprite/style/network/cache bridges plus libpng 386 and stb_image 53.
- **Pipeline**: style document fetched from `tc2.uber.com/style/{default,auto,satellite}/native` → sources/layers → tile requests (vector `VectorTileProviderBridge`, raster `RasterTileClient`) with a disk cache namespace → `TileWorker` parses geometry into per-type buckets → collision/placement → `Painter` draws via the GL wrapper with atlas textures → `TextureView` present, frame-rate parameterised.
- **Camera maths (verified from the shipped routine)**: `metresPerPixel = cos(radians(clamp(lat, ±85.05112878))) · 2π · 6,378,137 ÷ (2^zoom · 512 · density)`; on the study device (density 2.8125) that is **0.85 m/px at zoom 15 at the equator, 0.77 m/px at 25° latitude**. Camera intents: `CAMERA_POSITION`, `LAT_LNG`, `LAT_LNG_BOUNDS[_DIMEN|_MAX_ZOOM]`, `LAT_LNG_ZOOM`, `SCROLL_BY`, `ZOOM_IN/OUT/TO`, `DEFAULT_ANIMATION_DURATION_MS`.
- **Hit-testing and overlays**: markers under a tap are collected then sorted by a comparator and the first is returned; the location puck is a native circle annotation with `trackUserLocation=true`; 488 `MapLayer` definitions attach layers per feature.
- **Imagery**: cube-face textures (`UberCubeFaceUrls{front,back,left,right,top,bottom}`), `UberMetadataDownloader` as a suspending network call, glTF and 3-D controls gated by parameters (3-D controls from zoom 15).
- **Renderer selection (code)**: `MapProviderConfiguration` (JSON: `initialMapProvider`, `fallbackMapProviders`, `missingProviderDefault`) → `MapProviderState` (UNKNOWN→default; adopt only if in fallback set; records `didFallback`) → `MapFactory.create` (`UBER`→`UberMapFactory`, `GOOGLE`→`GoogleMapFactory`). Shipped default: **`uber` first, `google` fallback**.
- **Renderer selection (observed)**: on the study device the map screens were drawn by the **Google client** — Google attribution on screen, `androidmapsapi-*` (10–32) + `google-maps-ini*` + `GL-Map` threads, and **no** own-engine thread family. Why it differed: not determined (server override, fallback activation, or a Google provider handed to the Compose path).

### 4.3 Backend contract
1,406 path literals of which **1,032 are `/rt/…` product calls**, 50 are device filesystem paths, 324 are auxiliary/non-route. Families: eats 77, unused 68, payment 63, riders 56, drivers 44, safety 37, trips 27, users 25, payments 24, safety-media-platform 24, support 24, family 22, amd-experience 22, reservation 21, gifting 21, emobility 20, then 7–15 each for transit, business, communications, group-ride, membership, identity, profiles, social-profiles, locations, feedback, hcv, commute, navigation, receipts, devices. 72 literals carry placeholders. One GraphQL endpoint (`/rt/edge/graphql`). 36 generated gRPC services (maps 9, identity 6, money 2, marketplace 2, safety 2, u4b 2). Primary host `cn-geo1.uber.com` (126 literals); style host `tc2.uber.com`. Identity surface: OAuth token lifecycle, silent authentication, WebAuthn, device registration, exported IPC providers (device sessions, SSO, SSO eligibility).

### 4.4 Data
Persistence is **typed key-value stores**, not one database: `KeyValueStore`/`SimpleKeyValueStore`, `SimpleStore` (with `SimpleProtoStore`, `RxSimpleStore`, `Version`), a TTL store, Jetpack DataStore (148 classes), SQLDelight (12), Room (7), and SQLite only where libraries supply it (WorkManager's 7 tables/DAOs, the analytics transport's 14 tables, the reporter's queue). ~45 first-party stores own the feature state (identity token, session cookie, home layout, impressions, ads config, ML handles, map collision index).

### 4.5 Screens and design
49 activities, 65 fragments, RIB scopes per screen; `RootActivity` → `PresidioActivity` → `RibActivity`. 89 intent filters (72 on the 26 exported components, 38 `autoVerify`), 35 host values, 23 scheme values. Design system: `Amber*` themes, `com.ubercab.ui.core` 1,274 classes, a map design-language layer (`mapsudl`, 99), 2,823 layouts, 6,659 drawables, 2,468 styles, Lottie motion with ~111 animation documents.

### 4.6 Security-relevant surface (all validated; none is a reportable finding)
- **IPC gate, fully resolved**: exported providers take the caller's **Binder UID** → `getNameForUid` → package, then `PackageManager.getPackageInfo(…, GET_SIGNING_CERTIFICATES)` → per-certificate **SHA-512** → membership in a static **9-hash allowlist** (with `getSigningCertificateHistory()` accepted, i.e. rotations stay valid). The app's own certificate **is** one of the nine — which validates the extraction.
- **Crypto engine**: `libse.so` embeds the open-source libsodium library (BLAKE2b generichash, `curve25519xsalsa20poly1305`, secure memory, base64); `libse_loader.so` is its loader with **66 % of the file a stored data region at 7.996 bits/byte**.
- **`libeef0.so`**: 863 KB of ordinary compiled code (5.71 bits/byte — **no stored encrypted body**, falsifying an earlier hypothesis), 80 dynamic symbols spanning process control (`fork`, `execv`, `pipe`, `poll`, `waitpid`, `prctl`), environment inspection (`__system_property_*`, `statfs`, `opendir`), `mprotect`, `syscall`, `dlopen`; one 34,972-byte `JNI_OnLoad` with 69 inline `svc` sites; SHA-256 initialisation constants present. Purpose in the product: unnamed.
- Device integrity: `/rt/riders/verify-device-integrity`, `/rt/devices/*`, filesystem probes for superuser artefacts and emulator properties, screenshot blocker, Play Integrity references.
- One exported broadcast component lacks a manifest permission and its in-code gate defaults to enabled — impact unestablished, closed by the 31 Oct validation record; **do not reopen without new evidence**.

### 4.7 The driver app — what the public record establishes

`com.ubercab.driver` is a separate live product (Business category, ~6.3M reviews, updated 24 Oct 2026 on its store page, developer Uber Technologies). Its **developer-declared data record** states it collects:

- **approximate and precise location** (app functionality, personalisation),
- name, email, user IDs, phone number and other info (app functionality, fraud prevention/security/compliance, account management),
- **user payment info** (optional) and purchase history,
- photos (optional), **voice or sound recordings** (optional), contacts (optional), **fitness info** (optional),
- app interactions, in-app search history, other actions (analytics), device or other IDs, crash logs/diagnostics/performance data.

It shares crash logs and performance data (analytics), and purchase history, name, email, user IDs, address, phone number, device IDs, app interactions and search history (advertising or marketing). It states **encryption in transit** and a **deletion request path**. Its own listing also states that it uses full-screen notifications for **VoIP calls between riders and drivers**, and that it "typically uses 2 GB of data per month" with navigation affecting battery — i.e. the two heaviest runtime costs of a driver product.

What this does **not** give: build identity, permission list, class inventory, or any structural comparison with the rider build. A binary remains the prerequisite for that, and no binary exists on any study device. Read §9 for provenance and the caveat class.

---

## 5. Explicitly not determined (and why)

| Question | Why it stays open |
| --- | --- |
| Which mechanism produced the Google renderer in the observed session | An override, a fallback activation and a Compose-supplied provider all fit; separating them needs runtime inspection the boundary excludes |
| Tile request wire format, headers, version negotiation | Behind `NetworkClientBridge`; no traffic may be captured |
| Style-document contents | Fetched at runtime from the style host; none bundled |
| Camera animation curves | `DEFAULT_ANIMATION_DURATION_MS` and `pendingMove` exist; easing constants not read out |
| Per-family IPC mapping inside the union | The membership test is over the flattened union; the family split does not change the gate |
| `libeef0.so` purpose | No readable identifiers; syscall numbers are register-supplied |
| Encrypted-at-rest status of individual stores | Names and APIs only; values not inspected |

---

## 6. What the next agent should do first

1. Read `docs/CURRENT-WORK.md`, then this dossier, then the maps deep dive.
2. If a **second build** lands: pull its base APK, hash it, then repeat the identical measurement set (class tables, resource table, manifest, native export tables, parameter registry, route list) and diff against this baseline — the comparison toolchain is ready and the delta questions are: new permissions, new exported components, new routes, new vendors, new native symbols, changed parameter defaults.
3. If the **driver app** is installed: the same pattern applies end to end; expect different permissions (background location, foreground types) and a different route mix.
4. If the owner authorises **runtime inspection**, the three renderer mechanisms can be separated without touching the vendor's systems.
5. Before handing any document to a third party: re-run the vocabulary scan over the shareable set (the canonical term list is in the tracker). The bar is **zero hits**, and it has already caught three accidental slips during this work.

---

## 7. File map

| Path | What it holds |
| --- | --- |
| `docs/KNOWLEDGE-*.md` (9 documents) | the shareable fact set |
| `research_notes/…/evidence-k5-today/` (179 files) | measurement outputs: class/route/parameter censuses, native symbol tables, section tables, bytecode extracts, allowlists, device captures |
| `research_notes/…/evidence-deepseek/` (19 files) | the first pass: manifest projection, provider checks, deep-link scripts |
| `research_notes/…/*.md` (2 files) | the original study notes, archived verbatim |
| `docs/CURRENT-WORK.md` | rolling tracker: statuses, decisions, tooling, open items |
| `reports/` | internal: validation record, review record, self-audits |

**Reproduction note.** The measurement scripts live beside their evidence (`dex-inventory.py`, `dex-members.py`, `dex-mine.py`, `dex-hierarchy.py`, `dexdump-extract.py`, `elf-sections.py`, `apk-signing-certs.py`, `parse-appconfig-allowlist.py`). Each is self-contained, reads only local files, and was written to make every number in the fact documents recomputable without the analysis toolchain that produced the first pass.

---

## 8. One-line summary for the successor
The app is a RIB-organised, parameter-driven product whose map stack is an own GL engine over a remote style document with the Play services client as a configured and observed fallback, whose backend contract is a 1,032-call named dictionary plus a small gRPC surface, whose data lives in ~45 typed stores, and whose exported IPC surface is gated on a nine-certificate allowlist - with a 198-file evidence archive behind every one of those statements.

---

## 9. Public-source corroboration — a second, independent evidence class

Five public sources were read on **31 October 2026** and archived with the exact facts taken from each (`external-public-sources-2026-10-31.json`). They are kept deliberately separate from artifact measurements: a store listing is developer-declared, and a blog post is the vendor describing intent.

| Source | What it adds | What it corroborates in the artifact |
| --- | --- | --- |
| Rider app store listing (`com.ubercab`) | developer, 4.8★/20.2M reviews, 1B+ installs, Maps & Navigation, listing updated 23 Oct 2026 | package identity; Google Play as the publication channel (matching the Play source stamp in the signing block) |
| Driver app store listing (`com.ubercab.driver`) | Business category, 4.6★/~6.3M reviews, updated 24 Oct 2026; explicit statements about full-screen VoIP notifications and ~2 GB/month data with navigation affecting battery | the VoIP capability and the cost profile the rider build already carries in a quarantined module |
| Driver app **data-safety record** | the collected/shared data classes and the encryption-in-transit + deletion statements (§4.7) | the driver app's functional and non-functional scope, which no local binary can supply |
| The vendor's public "Tech Stack, Part I" post (`uber.com/us/en/blog/tech-stack-part-one-foundation`) | OkHttp, Retrofit and Gson on Android; an in-house configuration platform; map display and place search owned by the vendor's own teams | the 13,415 Gson / 162 Retrofit / 63 OkHttp class counts, the 14,516-parameter platform, and first-party place search (`/rt/locations/*`) |
| "Building a Scalable and Reliable Map Interface for Drivers" (Carbon series, Jan 2019) | the map is a persistent background view mediated by a **Layer Manager** (exclusive layers, layer bound to a RIB interactor, tile overlays), a **Padding Provider** (aggregated edge insets as an observable) and a **Camera Director** (camera rules plus exclusive control) | the artifact's 488 `MapLayer` implementations, the padding-inset handling and debug view on the map view, the camera-listener plumbing and active-map counter — the same four ideas, stated publicly, years before this build |

**Reading rule for the successor:** treat this section as context, never as proof of a binary fact. Where a public statement and an artifact measurement disagree, the artifact wins and the disagreement is recorded.


