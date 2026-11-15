# Competitor thread and demo-repository inventory — dated read-only snapshot

**Collected:** 14 November 2026, through observed thread position **2519** at **17:07:38 UTC**  
**Collector:** Codex `gpt-6.1-sol`, high effort, independent read-only inventory  
**Source thread:** `bdcb9416-7864-4dda-8667-5473062c13c4` (`Reproduce Uber, Careem, Hatt App Code`)  
**Repository root:** `C:\Users\osama\OneDrive\Documents\wind-competitors`

> **Boundary:** this is dated research, not an execution queue or production approval. The source thread was still `running`, `settled:false` at cutoff. It was not messaged, interrupted, cancelled or edited. No builds/tests, device actions, Git mutations, production access or file edits were performed by the collector. Current files may have advanced after this snapshot.

## 1. Most important conclusion

The **five installed APKs are verified older demo artifacts**. The newer Maps/API/persistence work is **uncommitted and has not been rebuilt or accepted on the phone**. Static package gates, installed APKs and current working files represent different revisions.

- The earlier harness proves **15/15 local package gates**, not remote execution, runtime/device behavior or production readiness.
- The installed APKs prove signature/install/initial-render evidence for their recorded artifacts, including old grid-map screens—not the newer Google Maps implementations or complete journeys.
- The staging build script uses `git clone`; merely rerunning it would **omit uncommitted/untracked completeness changes**.
- A whole-directory archive could include ignored signing material, while a Git-only archive would omit current uncommitted work. Neither is a safe complete handoff without a deliberate inventory.

## 2. Per-app deliverables and current source architecture

All five are original Expo SDK 57 / React Native 0.86.3 / React 19.2.3 / TypeScript / Expo Router implementations with React Context stores. They are not recovered competitor source or backend code. Every committed HEAD below still matches the original README commit; newer source is modified/untracked working state.

| App / repository | Frontend and typed domain behavior | Current maps, API/services and persistence at cutoff | HEAD |
|---|---|---|---|
| **WindRide** — `wind-comp-uber` | Map-first home, saved/recent destinations, pickup confirmation, tier/payment selection, matching/tracking, rating/comment/tip/receipt/history; integer-money fares and ETA helpers | `react-native-maps` Google Maps; foreground GPS/reverse geocoding, sharing, dialer and local-notification wrappers. `TripApi` create/read/cancel/rate/history. Default backend is an **in-process local server** persisted through AsyncStorage; clock-derived progression and deterministic drivers | `e346220` |
| **WindCaptain** — `wind-comp-careem` | Rider and captain flows in one binary; rich addresses, arrears gate, offers, job progression, paid/unpaid collection and earnings statement. Rewrite adds full-address offers, authoritative settlement and corrected accounting | Google Maps, GPS, image-library picker, local notifications, serialized commands and AsyncStorage snapshots. `CareemApi` bootstrap + command endpoint. Photo remains a **local URI**, without upload/storage service | `4812794` |
| **WindBazaar** — `wind-comp-haat` | Arabic RTL store search, menus, single-store cart, minimum quantity, coupons, service fee, payment selection, addresses, tracking/history/rating. New domain validates catalog relationships, limits quantities, prevents multiple active orders, snapshots address/store data, retains terminal orders until acknowledgement and restricts ratings to delivered orders | Google Maps, precise/approximate address coordinates, GPS capture, driver dialer and local delivery notifications. `HaatApi` bootstrap + commands. AsyncStorage-backed local server derives progression/ETA/simulated driver coordinates from `placedAt` | `2a231a5` |
| **WindParcel** — `wind-comp-shiply` | City/village/street addressing; Pay/Buy/Return/Replace; service level; parcel pipeline, custody scans, courier jobs, collection/wallet differences and ratings. New domain checks customer/driver roles and active assignment, preserves stars, prevents duplicate collection and requires collection before finishing applicable delivered jobs | Google Maps renderer, serialized bootstrap/command API, AsyncStorage snapshots, HTTP transport adapter and notification wrapper. **Coordinates still come from city centers plus address hashes; no screen supplies live driver position** | `6f9fc0a` |
| **WindMarket** — `wind-comp-souq` | Zone fees/minimums/windows, cash-only checkout, substitutions, shift/job board, delivery-code lockout, failure reasons, ledger and queue helpers | **Rewrite actively underway.** New admin role, custody-event types, shop coordinates, Google Maps component and corrected pure command domain had just been written. Existing store still used old reducer; new API contract/persistent local-server files were absent at inspection. Expo Crypto was installed for delivery-code generation | `1613ce0` |

### Source entry points

- WindRide: `src/services/localServer.ts`, `src/store/store.tsx`, `src/components/WindMap.tsx`.
- WindCaptain: `src/lib/domain.ts`, `src/services/localServer.ts`, `src/lib/earnings.ts`.
- WindBazaar: `src/lib/domain.ts`, `src/services/localServer.ts`, `src/app/tracking.tsx`.
- WindParcel: `src/lib/domain.ts`, `src/services/localServer.ts`, `src/lib/pricing.ts`.
- WindMarket: `src/lib/domain.ts`, `src/store/store.tsx`, `src/lib/ledger.ts`.

Each path is relative to its repository under the repository root above.

## 3. What the evidence proves

### Earlier static package gates

Evidence: `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\summary.json`.

- Run **05:32:24–05:32:52 UTC, 14 November 2026** across five repositories.
- **15/15 gates passed**, zero harness errors: `tsc --noEmit`, `expo lint`, package selfcheck per repository.
- HEADs stayed unchanged; only ESLint cache metadata changed.
- Explicitly `runtimeDeviceBehaviorClaimed:false`; execution mode is local package gates.
- This run **predates the APK timestamps and all later completeness changes**.

| App | Earlier result | Later recorded source-thread evidence |
|---|---|---|
| WindRide | Money, geometry, fares, surge and ETA assertions; no numbered count | Typecheck/lint clean; extended selfcheck passed for KV storage, corrupt JSON, HTTP retries/timeouts, service-area rejection, lifecycle, ratings/comments and server reconstruction |
| WindCaptain | Arrears, settlement, unpaid growth, quote totals, statement and geometry assertions; no numbered count | Typecheck/lint passed; expanded rider/captain server selfcheck passed after correcting its accounting expectation. Covers cash blocking, current-balance settlement, offers, unpaid collection, completion deduplication and reconstruction |
| WindBazaar | **12 checks** | Typecheck and **14 checks** passed. Lint initially reported one effect-dependency warning; source changed from `[order?.status]` to `[order]`. **No subsequent clean lint result was observed** |
| WindParcel | **17 checks** | Typecheck, lint and **18 checks** passed, including server commands, role guards, ratings, collection and reconstruction |
| WindMarket | **24 checks** | **No new gate result for the active rewrite at cutoff.** The 24-check result belongs to the earlier implementation |

“Restart persistence” in newer selfchecks means constructing another local-server instance over the same **in-memory KV adapter**. It does not prove Android process-death recovery, native AsyncStorage behavior or a separate deployed server.

### Signed APK and physical-install artifacts

Evidence: repository `LEDGER.md`, build logs and `apks/`. Sol independently recomputed all five APK hashes.

| APK | Package | Bytes | SHA-256 |
|---|---|---:|---|
| `apks/WindRide-1.0.0.apk` | `com.windcomp.windride` | 57,737,323 | `C3E14F9C382006BAC4FAE1F4115A2D73A7C942E79781FBBAAC1B4CCE8BCA3121` |
| `apks/WindCaptain-1.0.0.apk` | `com.windcomp.windcaptain` | 57,754,867 | `2F720E63D6DC1E864D00ED05797D37F6B156D5CE03A6A55C5C0161CE1AF98A0A` |
| `apks/WindBazaar-1.0.0.apk` | `com.windcomp.windbazaar` | 57,758,439 | `B1D31926E6037657A23C8AA4274EF3FA407E22BE03950EB3983F1291D0E1D26D` |
| `apks/WindParcel-1.0.0.apk` | `com.windcomp.windparcel` | 57,762,559 | `5928DA6C8D3D855041253D95020EBDC36F7A88497897EB4F24B394B163188979` |
| `apks/WindMarket-1.0.0.apk` | `com.windcomp.windmarket` | 57,772,183 | `AA6DB147CBEC3AACD6C4153A5586DBA9F255D6B0A472601B312D04132151DA55` |

Recorded inspection shows all five are version `1.0.0`, versionCode `1`, compile/target SDK 36; `apksigner` reports `Verifies` with v2 signing; `allowBackup=false` and `usesCleartextTraffic=false`.

Thread output records five successful `adb install -r` operations, coexistence of all packages on **SM-A5360 / R5CTB0FJP9Z**, and one injected launcher event per app. Saved screenshots show distinct initial home screens, including **old grid maps** in WindRide/WindCaptain. This proves installation and initial rendering of those artifacts only—not complete journeys or newer Google Maps behavior.

The APKs use **different signing certificates** despite the shared certificate display name. Exact certificate fingerprints are recorded in:

- `C:\b\uber-build.log:855`
- `C:\b\careem-build.log:904`
- `C:\b\haat-resume.log:938`
- `C:\b\shiply-build.log:903`
- `C:\b\souq-build.log:898`

Signing-material exposure and rotation are addressed in §7. Do not assume an exposed or replaced signing identity permits an in-place upgrade.

## 4. Recorded fixes and remaining contradictions

These changes were recorded in the source thread; Sol made no code fixes.

| Issue → recorded change → evidence boundary |
|---|
| WindParcel conflicting designs/incomplete files → consolidated types, domain, store and routes → original gates passed; later server rewrite passed 18 checks |
| WindParcel lost star values/customer collection/ungated completion → preserved stars, role/assignment checks, courier collection and completion gate → later typecheck/lint/18 checks passed |
| WindParcel omitted commission → included commission in itemized fee → revised pricing assertions passed |
| WindBazaar successful delivery unreachable/manual rejection → clock-derived lifecycle and assigned-driver state → 14 checks passed |
| WindBazaar terminal screens disappeared/history changed after address edits → terminal acknowledgement and order snapshots → source and happy-path server/reconstruction checks; no new APK acceptance |
| WindBazaar contact button did nothing/address edits overwrote coordinates → dialer action and precision-preserving GPS address edits → source inspected; native behavior untested |
| WindCaptain fixed-amount settlement and fines increasing net earnings → current-balance settlement, absolute money-out subtraction and unpaid work excluded from captain income → expanded selfcheck passed |
| Maps plugin wrote metadata under the wrong manifest property → corrected metadata placement → thread recorded evaluated config with a dummy test key and hardening flags |
| Native build failures → SDK-matched font package, shorter dependency/Gradle paths and regenerated CMake caches → original APK builds succeeded; historical local-build evidence only |

Material limits:

- `LEDGER.md` and READMEs still describe several apps as having no backend, mock maps and memory-only state. They accurately describe earlier committed implementations but are **stale for newer working files**.
- “Code complete” originally allowed adopt-list items to be documented as deferred. Later inventories found substantial functional gaps.
- WindMarket’s earlier 24 checks missed its **ledger wrapper no-op** and **delivery-code bypass**, corroborated in the old store/UI. Its new domain contains corrective branches, but store migration and verification were unfinished at cutoff.
- No per-repository handoff file, repository license file or Git remote was found. Package manifests say `private:true`. “Public apps code” does not establish public licensing, competitor ownership or guaranteed acceptance by another model.

### Active sequence at cutoff

1. **WindMarket:** connect new domain/maps to persistent command API and store; finish secure code generation, authorization, shop progression, substitution, custody history, review resolution, ledger dispatch and UI rewiring; add lifecycle/reconstruction checks.
2. **WindBazaar:** retain the 14-check result but obtain a clean lint result after the warning fix. Weighted finalization currently sets actual weight equal to ordered quantity; no weighing workflow exists.
3. Complete the requested cross-repository review/fix/recheck cycle, refresh documentation/handoffs, preserve new files and rebuild/install the newer implementations.
4. Future tests/builds must run on **DESKTOP-S2JKMK5** under the current owner runner rule; physical acceptance uses the A53. Earlier local recipes are history.

This inventory does not instruct the active thread or authorize an agent to take over its work.

## 5. Production and security boundaries across all five demos

- Empty `API_BASE_URL` selects local in-process code. HTTP clients exist, but separate deployed HTTP backends, databases and authenticated sessions are not delivered.
- Client-selected roles are demo controls, not authenticated authorization.
- HTTP adapters cast JSON into TypeScript types and retry mutations without a demonstrated durable idempotency protocol.
- AsyncStorage snapshots are not transactional server persistence or encrypted financial storage.
- Card selection and arrears “settlement” do not charge a payment processor.
- Notifications are local wrappers without proven remote/background delivery.
- Maps draw direct endpoint polylines. Driver motion is simulated; no verified directions/traffic/live-dispatch integration exists.
- WindRide’s shared tracking link is generated, but its tracking screen reads local active state rather than loading the supplied trip ID for another user.
- WindRide hydration writes initial state before hydration is gated, and its local rating method lacks delivered/range validation. These are static concerns outside the recorded happy-path checks.
- Installer output reported **12 dependency vulnerabilities: 9 moderate, 3 high**, plus a worklets peer-version conflict. No later resolution was observed.
- Accessibility, safe areas, Arabic numeral input/bidi behavior, web and iOS compatibility remain unverified.

## 6. Reusable findings for Fastship/Fable

Original reference evidence: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\PALESTINIAN-COMPETITORS-INDEX.md`.

| Reference artifact | Useful architectural evidence | Boundary |
|---|---|---|
| Uber rider **4.655.10001** | Native Android map-provider interfaces, Uber/Google provider configuration, typed/generated client contracts, map POI/cache shapes, upfront pricing and payment-first flow | Client evidence does not recover Uber’s backend. Counts vary by extraction; older 4.654 findings require version reconciliation |
| Careem rider **26.43**, Captain **89.70.2** | Native domain/workflow separation, Compose/server-driven UI, Retrofit/OkHttp/Moshi, Room, Maps behind an interface, rich addresses, cash arrears and explained earnings | Authenticated behavior was login-blocked. Do not import analytics/permissions or financial-service breadth wholesale |
| Haat client **21.0.4** | Native UI plus WebViews, local persistence, granular order vocabulary, landmark instructions, remote configuration and MQTT SDK/service evidence | MQTT presence does not prove a working tracking session. Network/login walls blocked journeys; driver/courier artifacts were unavailable |
| Shiply **1.8530** | Expo/React Native/Router, Google Maps, secure-store/image-picker, Notifee/FCM, Sentry, parcel axes, custody and reconciliation | Minified/debundled client evidence; exact backend enforcement, fees and Arabic product copy remain unknown. Source notes flag exposed configuration credentials |
| Souq Tulkarm **1.0.2** | Vite/React inside Capacitor, client API surface, zone/day capacity, append-only cash corrections, delivery proof, substitution consent and tracking health | Backend schemas/validation were not observed. Web Push reliability and production deployment identity remain unproven |

The strongest reusable mechanisms are:

- **Rich precision-labelled addresses** — useful input to `GEO-03`; preserve exact versus approximate coordinates and require confirmation.
- **Server-enforced cash rules, integer money and attributed corrections** — useful to `PROD-01` and `UX-02`, subject to the existing owner scope amendment and append-only/approval rules.
- **Immutable order snapshots and terminal acknowledgement** — relevant reference behavior for offline/recovery UX; do not infer that demo selfchecks prove Fastship behavior.
- **Explicit typed failures and custody transitions** — references for `PROD-06` and `PROD-05`; custody implementation/activation still waits for Option A.
- **Clock-injectable domain tests** — useful test design for `VERIFY`, but synthetic clock progression must never become production dispatch/delivery evidence.

Port mechanisms into Fastship’s existing domain/API/persistence layers. **Do not copy** synthetic coordinates, timer-driven delivery, client role switches, queue `sent` flags, predictable proof codes, payment-success wording, competitor credentials, extracted implementation text or analytics stacks. Existing Fable task contracts, dialect decisions and owner approvals take precedence.

## 7. Sensitive material and archive exclusions

- **Google Maps API credential:** `[REDACTED — OWNER ROTATION REQUIRED]`.
- **Signing passwords/material:** `[REDACTED — OWNER ROTATION REQUIRED]`. A signing-password line escaped the collector’s initial output-redaction filter; treat that material as exposed.
- Never reproduce a key, password, keystore, token or secret in reports, logs, prompts or handoff archives.

Exclude at least these sensitive paths from handoff archives:

- `C:\b\build-staging.ps1`
- `C:\b\uber\android\app\build.gradle`
- `C:\b\haat\android\app\build.gradle`
- `C:\b\shiply\android\app\build.gradle`
- `C:\b\souq\android\app\build.gradle`
- `C:\b\uber\android\app\windcomp-release.keystore`
- `C:\b\haat\android\app\windcomp-release.keystore`
- `C:\b\shiply\android\app\windcomp-release.keystore`
- `C:\b\souq\android\app\windcomp-release.keystore`
- `C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-uber\android\app\build.gradle`
- `C:\Users\osama\OneDrive\Documents\wind-competitors\wind-comp-uber\android\app\windcomp-release.keystore`

Treat raw competitor APK/config/bundle extraction material as potentially credential-bearing. Do not package it as reusable implementation source. Do not replay historical cleanup/device/build instructions automatically.

## 8. Short thread/evidence map

Positions are observed timeline positions and may shift while the active thread updates.

| Thread range | Contents |
|---|---|
| Start–~1376 | Scope, reference-app inventory, original five app builds, interrupted/conflicting writes, initial selfchecks and README mappings |
| ~1378–1777 | Names/packages, signing/hardening, build recovery, APK hashes, installation and launch screenshots |
| ~1779–1907 | Expanded completeness request, sensitive Maps-key message, five inventories and dependency setup problems |
| ~1907–2115 | WindRide maps/services/persistence rewrite and extended checks |
| ~2111–2171 | Detailed Careem/Haat and Shiply/Souq audits; highest-value catalogue of missed functional defects |
| ~2171–2253 | WindParcel command-domain/API migration and 18-check result |
| ~2270–2345 | WindBazaar lifecycle/snapshots/GPS/rating rewrite and 14-check result |
| ~2345–2477 | WindCaptain accounting/photo/API migration and passing server selfcheck |
| ~2477–2519 | WindMarket active rewrite; no completed acceptance result |

Disk starting points:

- `C:\Users\osama\OneDrive\Documents\wind-competitors\LEDGER.md` — earlier committed/APK evidence; stale for newer working files.
- `C:\Users\osama\AppData\Local\Temp\opencode\fastship-verification-20261113\other-session\final-demos\summary.json` — earlier 15/15 local package-gate evidence.
- Each app’s `scripts/selfcheck.mjs` and source entry points in §2.
- `C:\Users\osama\OneDrive\Documents\wind-competitors\screenshots` — initial-render artifacts, not journey acceptance.

## 9. Remaining risk

This is a snapshot of active work, not a frozen handoff. Current source, installed APKs and passing evidence represent different revisions. No newer implementation has a fresh remote test/build, signed artifact or physical acceptance record in this inventory. Fastship production remains **NO-GO** independently of these demos.

## 10. Additive knowledge merge received after the cutoff

The earlier sections remain unchanged as the Sol cutoff record. A later owner-supplied merge now provides newer implementation/build evidence; it does not backdate or rewrite the earlier findings.

### Complete archive

- `C:\Users\osama\OneDrive\Documents\wind-competitors\other-session-archive\INDEX.md`
- `C:\Users\osama\OneDrive\Documents\wind-competitors\FABLE-MISSION-ADDENDUM.md`
- `C:\Users\osama\OneDrive\Documents\wind-competitors\LEDGER.md`

The archive records the main thread and all 19 child threads at **2,353 / 2,353 activity items**, with expected/captured count and JSON-parse validation. Only Google Maps credentials and the local signing password were redacted; technical activity was retained.

### Newer build-source and APK identities

The merge ledger reports the following build HEADs. Later documentation-only commits are currently `10d20d2`, `c6336fe`, `5faa1e9`, `e8dbf0d` and `a7d0828`; all five working trees were confirmed clean during this merge review. The build candidates remain the earlier HEADs below.

| App | Build source HEAD | Current APK SHA-256, independently recomputed | Bytes |
|---|---|---|---:|
| WindRide | `ef8aa00` | `74A8A00EADC50E639A7EBDF7EA378A3487D36B0229EAB363A0152EA213586438` | 61,207,155 |
| WindCaptain | `e04fe69` | `0EA0244B45578B6D6E7B2474579FA3AC46376D2E62304EC6462A55AEBEFB5829` | 61,665,721 |
| WindBazaar | `49a4d7b` | `6D98E45B73127CA3315A1FEFED0875CC62C66BDB9927FCC7A657B5670E680455` | 61,215,531 |
| WindParcel | `01826a3` | `E62C7DFB8A53A76E276413C32577CD7BC0C74DB11A75CAF52E41D3C33F5544D0` | 61,180,971 |
| WindMarket | `a63abf9` | `8B86EF573E4D781CCA107DBF4009CC0D3E3A11D1054A7C952CD701A971E1EEE5` | 61,229,743 |

The current ledger reports typecheck/lint/selfcheck passing for all five, including WindBazaar 14 groups, WindParcel 18 groups and WindMarket 26 groups, plus zero dependency-audit findings. Signed v2 APKs have hardening and real Maps metadata, and all five are installed together on the physical A53. These are newer current-demo results, not the earlier 15/15 run and not production proof.

Fresh visual map-tile screenshots were still blocked by `DEVICE_IN_USE` from this mission’s device-panel session. That session was **released without shutting down the phone or changing app data** during the merge. A fresh visual pass is still required; APK metadata alone is not visual acceptance.

### Credential/build-script update

`C:\b\build-staging.ps1` now generates a fresh random keystore password per build instead of a hardcoded password. Historical exposed signing material must not be reused. The exposed Maps credential remains `[REDACTED — OWNER ROTATION REQUIRED]`. Continue excluding secret values and signing material from all archives.

These demos retain their local-demo boundary: in-process fixtures, compressed clocks and no deployed production sync/back-office services. The original Fastship mission remains **NO-GO**.

## 11. Maps runtime authorization diagnosis — owner console gate

The released device session allowed WindRide to launch. Its screenshot shows the app UI and Google logo but blank map tiles, unchanged after eight seconds. Logcat identifies **Google Android Maps SDK authorization failure** for the release package/certificate pair. This is not a layout, native-dependency or tile-delay defect.

Evidence: `C:\Users\osama\OneDrive\Documents\wind-competitors\screenshots\WindRide-maps-key-authorization-failure.png` and `C:\Users\osama\OneDrive\Documents\wind-competitors\LEDGER.md` §Maps runtime authorization.

**Owner console action required:** enable **Maps SDK for Android** and whitelist every current release package/certificate SHA-1 pair under the Android-restricted key:

| Package | Release-certificate SHA-1 |
|---|---|
| `com.windcomp.windride` | `72:60:98:90:8F:36:E4:CD:5D:99:4F:3A:E5:3B:5C:E2:3A:5A:85:8A` |
| `com.windcomp.windcaptain` | `10:91:37:9C:EA:06:4D:82:50:53:A6:EA:71:3F:47:53:FD:75:9A:5F` |
| `com.windcomp.windbazaar` | `FE:9E:0C:AC:2F:0C:73:75:7B:2D:26:9F:DE:B6:13:2C:55:E4:13:D9` |
| `com.windcomp.windparcel` | `60:1D:ED:57:26:96:2D:62:5B:7A:72:75:3D:33:E2:89:59:4A:41:C0` |
| `com.windcomp.windmarket` | `A2:A1:53:7F:C1:A5:8D:90:42:B6:46:33:E6:1B:EB:64:C5:80:DC:83` |

A Cloud Console-only restriction change needs **no rebuild**; reopen the apps after propagation and capture fresh tile evidence for all five. Alternatively, replace `C:\b\maps-key.txt` with a rotated key that permits these identities and rebuild. The exposed credential value remains redacted and requires rotation.

New documentation-only commits recording the requirement are WindRide `b8d233d`, WindCaptain `d2b373f`, WindBazaar `3d1eeff`, WindParcel `6b9ee11` and WindMarket `21bc041`. The complete archive was independently re-verified at **2,353/2,353 items** with valid counts/hashes/source links and zero unredacted credential matches. No visual map pass is claimed until tiles render.
