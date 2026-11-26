# Wind verified research atlas

**Evidence cut-off:** 13 November 2026. **Question:** what is true about Wind today, how do the reference delivery apps implement comparable features, and what remains before Wind is trustworthy in the West Bank?

**Source precedence.** The eleven files in `research_notes/Wind verified research atlas/` are the newest detailed evidence and govern where they re-measure or correct older material. They are reconciled here with `docs/REPORT-2026-11-13-VERIFIED-STATE-AND-GAPS.md` (“Verified report”), `research_notes/verification-2026-11-13/CLAIMS-LEDGER.md` (“Ledger”), `docs/HANDOFF-2026-11-13-FABLE-5.2-CUTOFF.md` (“historical Cutoff”), and the earlier studies in `research_notes/REA-2026-11-13-reference-apps/` (“REA”). The historical Cutoff is explicitly superseded for implementation; its observations are retained only with their tree/time attached. No static reference-app finding is a claim about a competitor's server or enabled runtime behaviour.

## 1. Bottom line

1. **Fix the installed client before anything else:** production `ps.wind.app` v1.1.0/code 24 embeds retired `windapi236.swedencentral.cloudapp.azure.com`, not healthy `https://dlvxzw3gj596d.cloudfront.net`; the server returns ready while that APK cannot use it. [ran/current]
2. **Canonical source is `origin/master` `b89f2205965523b5ab8545dff3940d1eacb6062c`;** the dirty root `b609229…` is not its descendant and is 6 ahead/277 behind, so stale-root defects are not release facts. [ran/source]
3. **The surviving production backup contains 9 users and 2 cancelled orders, no completed order, cash entry, session or push subscription;** W-00007 and W-00008 were sandbox trips, not production deliveries, so ETA, courier economics and push rates have no production samples. [aws/phone/other-agent]
4. **Counts are now exact:** 131 integration entries = 122 `.test.mjs` + 9 other `.mjs`; 124 disk `.test.mjs` including two deliberate PostgreSQL exemptions; 56 persistence entries plus a separate legacy check. Neither 106 nor 97 is a current count. [ran/source]
5. **Typecheck and lint pass in the latest independent local clean-worktree rerun, but the whole release is not green:** an earlier three-module lint failure did not reproduce, full integration has an intermittent URL-decoder result, and full persistence remains unproven despite a working PostgreSQL 18.3/PostGIS 3.6.2 server on `DESKTOP-S2JKMK5:55493`. [current/ran/open]
6. **Wind has substantial safety engineering already:** three booking replay points, durable command protocols on PostgreSQL, a nine-state server-owned order model, customer proof codes, cash immutability/double entry on PostgreSQL, dispatch eligibility gates, a 26,727-row place index and checkpoint-aware OSRM. Production currently uses the narrower SQLite/jobs-board path. [source]
7. **The most useful implementation reference is Souq Tulkarm, not Uber:** its scoped idempotent outbox, append-only cash corrections, customer-held proof, shift/custody model and multi-axis states match West Bank cash delivery; Shiply adds municipal addressing and named financial deltas. [O/static client]
8. **HAAT supplies landmark-first addressing and MQTT-with-polling-fallback; Careem supplies explained earnings and cash-only debt blocking; Uber supplies anchored POI/saved/suggested-place structure and honest ETA/offer contracts.** None proves production availability, tariffs or Palestinian eligibility. [O/I/U]
9. **Several older conclusions are now wrong:** Shiply is Hermes HBC 98 and has Arabic, not Metro source text without Arabic; its numbered notifications are not a three-attempt state machine; Souq does not queue every write; HAAT's NXDOMAIN does not prove the cause of its splash error. [O/current]
10. **Remaining work is operational proof before feature breadth:** ship a corrected APK, archive clean gates, prove live image identity, restore and human alerting, complete real cash/background/retry scenarios, establish a stable domain/update channel, then collect real trips before changing fares, ETA calibration, dispatch or RDS topology. [open/policy]

## 2. How to read this document

### 2.1 Evidence tags and boundaries

| Tag | Meaning preserved from the sources |
|---|---|
| `[ran]` | Command executed in the cited session, on the named machine. |
| `[read]` / `[source]` | Read from source at the stated path/revision; for Wind's newest source atlases this means `git show origin/master:<path>`, not the dirty root. |
| `[current]` | Rechecked in the later verification continuation. |
| `[aws]` | Live read-only AWS/API answer; an `AccessDenied` result is not an empty inventory. |
| `[phone]` | Measured on the physical `SM-A5360`, adb `R5CTB0FJP9Z`, Android 16. |
| `[other-agent]` | Preserved dated evidence, not freshly re-run by the later verifier. |
| `[O]` / `[obs]` | Observed literal, class, member, method, manifest or resource in the shipped artifact. |
| `[I]` / `[inf]` | Interpretation of observations; never silently promoted to runtime behaviour. |
| `[U]` / `[unk]` / `[open]` | Unknown, inconclusive, or blocked by a named prerequisite. |
| `[NF]` | Not found by Shiply's stated searches; not proof of absence on a server or in another artifact. |
| `[O-negative]` | A searched absence in Souq's shipped client, with the same limitation. |
| `[D]` | Derived representation such as decompiled output, not original source. |
| `[L]` | Limitation wording used in the Shiply privacy discussion. |
| `[ran, false]` | A suspected finding checked and found false; retained to prevent re-raising it. |
| `E1…E6`, `C1…C3`, `CLASS`, `M`, `CTOR`, `TRACE`, `DEX`, `FIELDS`, `RES`, `@N`, `fn #N`, `JS @n` | Method/locator anchors, not confidence grades. Souq `JS @n` is a decoded-character offset, not a UTF-8 byte offset. |

Rules applied throughout:

- **Observation ≠ inference ≠ runtime.** Resource presence does not prove reachability, market enablement, server validation, persistence, authorization, delivery, settlement or a server guarantee.
- **Searched absence is scoped.** “Not found” means not found in that artifact by that method. It does not prove a feature does not exist elsewhere.
- **Counts need a basis.** Raw DEX definitions, JADX-materialised classes, resource entries and aapt2 string entries are different measures. Tool differences are not app changes.
- **Production snapshot ≠ lifetime history.** The surviving backup proves its rows, not that no delivery ever existed before deletion/archive/cancellation.
- **Sandbox ≠ production.** Phone trips prove the participating sandbox UI/API workflow only unless server rows and production provenance are separately captured.
- **Corrections are explicit.** Section 6 lists older claims that must not be repeated; unresolved differences stay unresolved.

### 2.2 Depth label for every atlas file

“Full” below means full coverage of the shipped product bundle across many feature areas, not that every native class was decompiled. The two broad earlier studies `REA/CAREEM.md` and `REA/HAAT.md` each had two independent passes; the atlas supplements are deliberately narrower.

| Atlas file | Depth label and method | What it cannot establish |
|---|---|---|
| `baseline-and-deployment.md` | **Command-verified multi-area baseline:** clean detached `b89f220`, literal test-array parsing, direct SSH/psql, Git/ECR queries, decompressed-ZIP search, source ETA, repeated local typecheck/lint. | Not a full integration/persistence pass; live running-container identity remains blocked; local lint result is not remote evidence. |
| `wind-money-and-state.md` | **Full clean-source multi-area read:** booking/receipts/commands/quotes, order transitions, legacy and double-entry cash, receipts, COD and admin totals. | No runtime server test; several searched absences are listed in §8. |
| `wind-geo-and-dispatch.md` | **Full clean-source/data multi-area read:** gunzipped place data, client search, dispatch SQL/flow, MapLibre, OSRM, checkpoints, arrival and ETA. | No live routing/map test; remote style contents and runtime provider availability are outside the source. |
| `uber-offer-eta-payment.md` | **Targeted three-area generated-contract/resource read:** one saved inventory of 174,898 names, focused `inspect-android-class` and aapt2; no method-body analysis. | Active transport, wire nullability, ETA units/formulas, runtime eligibility and server behaviour. |
| `uber-map-and-poi.md` | **Cheaper, narrow DEX-string-table study:** Python `zipfile` + regex over 23 DEX/186,163,396 B, **not JADX/decompilation**. | No method bodies, field types, full signatures or enum values; POI field associations and runtime/server enablement are limited accordingly. |
| `careem-rider-payment-and-address.md` | **Narrow two-area read:** payment and address only, using REA class/method inspection, aapt2, local DEX encoded integers/resource scans and reference tracing. | No executed activity/payment/search/save; `BookingConfig` outer class and universal validation triggers not recovered. |
| `careem-captain-earnings-and-cash.md` | **Narrow two-area resource-only read:** earnings statement and cash/payout; aapt2's complete 9,762-entry string block with multiline parser, 9,128 Arabic entries. | No classes/method bodies, screens or transactions; actual thresholds, enabled countries, enforcement and Palestine applicability unknown. |
| `haat-address-and-checkout.md` | **Narrow two-area JADX read:** address and checkout, only five requested classes plus inventory; selected method bodies. | R8 names, case-collided methods, final save/submission, full WebView payload models and runtime charging. |
| `haat-tracking-and-bootstrap.md` | **Narrow two-area static code read:** MQTT and environment bootstrap; selected classes/methods, reference traces, DEX instructions where JADX timed out, resources. | No app/broker/API/DNS run in this pass; concrete broker/domain values and the splash causal chain are not proven. |
| `shiply-feature-implementation.md` | **Full shipped product-bundle, eight-area read:** HBC 98 string tables (41,741 function headers, 68,400 small + 1,051 overflow strings) and targeted `hermes-dec` disassembly. | HBC 98 is newer than the disassembler's formally supported target, so literals are primary; no server/runtime proof. |
| `souq-tulkarm-feature-implementation.md` | **Full shipped JavaScript, seven-plus-area read:** entire minified Vite/React bundle, service worker and Capacitor assets, targeted call-site census. | No `.map`; reconstructed minified logic is derived; no server, background WebView or runtime proof. |

Earlier breadth that matters: `REA/UBER-4.655-rider.md` is a broad full-APK release diff (317 claims); `REA/CAREEM.md` and `REA/HAAT.md` are broad artifact studies; `REA/HAAT-DRIVER.md` is **manifest/resources only**, not a driver decompilation. Athkar (`net.fares.athkar`) and Salati (`com.masarat.salati`) are prayer/religious utilities, not delivery competitors. Careem Captain and HAAT Driver/Courier have since been acquired; Shiply's driver artifact and Careem Partner remain unstudied.

## 3. Wind's own app

### 3.1 Verified baseline

| Area | Established today | Evidence/source |
|---|---|---|
| Canonical revision | `origin/master` = **`b89f2205965523b5ab8545dff3940d1eacb6062c`**. Root `HEAD`/`master` = `b60922952d607f698eee24b9c68ac3394daecd3c`; `merge-base --is-ancestor` exits 1; root is 6 ahead/277 behind. Root had 239 tracked unstaged modifications, 0 staged, 117 untracked porcelain entries; 356 total porcelain entries collapse untracked directories and are not a file count. | `baseline-and-deployment` §1 [ran] |
| Product/runtime | Expo SDK 57/React Native, Expo Router, MapLibre WebView, server `server/main.ts` + `server/domain/`; **no Supabase**. Production is parcels only, cash only; rides/freight/automatic dispatch are off. Production service is in AWS account `083712835043`, Region `eu-north-1`. | Verified report/Ledger/historical Cutoff [read/aws] |
| Public service | `https://dlvxzw3gj596d.cloudfront.net/api/ready` → HTTP 200 `{"ok":true,"schema":3}`; `/api/health` also healthy in the earlier live checks. | [current/aws] |
| Production persistence | Current production shape is single-host Docker with SQLite and nightly S3 copy; `pg` enables additional capabilities but does not make process-local realtime/routing budgets shared. Earlier architecture recommendations for Fargate/RDS are not the running topology. | Verified report §10.10 and claim 5 [read/other-agent] |
| Production data snapshot | Surviving restored backup: 9 users (1 active admin, 8 blocked), 2 orders both `cancelled`, 0 completed orders, `cash_entries` 0, quotes/offers/locations/sessions/saved places/push subscriptions/native push tokens 0; 1 order action, 3 security events, 11 checkpoints, 1 road-restriction policy. **This is a snapshot, not lifetime proof.** | Verified report/Ledger A-02/A-05 [aws/other-agent] |
| Backups | `wind-20261112T165723Z.db.gz` and scheduled `wind-20261113T031001Z.db.gz` exist. The latter landed at 03:10:04Z, matching cron; 10,148 B gzip/364,544 B SQLite, `PRAGMA integrity_check=ok`, 37 tables, same row counts and decompressed bytes as the idle baseline. Mechanism is proven; timed replacement-host restore and missed-run human alert are not. | Verified report §2.2b/Ledger A-02 [aws/ran] |
| Alerts/log access | No Synthetics canaries in `eu-north-1`; returned Wind-named alarm inventory was empty, but unavailable permissions prevent a universal claim. No Wind CloudWatch log group was returned; host/API/watchdog/backup logs remain on the host. Production `push_subscriptions` is empty, so the in-app stale-backup push has no delivery path. | [aws/read/open] |
| Release channel | No `expo-updates`; `EXPO_PUBLIC_UPDATE_URL` is empty. The forced-update screen cannot download a replacement unless built with an HTTPS update URL. Production APK is code 24 from 9 Nov; sandbox role builds are code 1. | [source/phone] |
| Field measurements | Production cold-start medians: Wi-Fi 771 ms, no network 697 ms, mobile-data link 672 ms (5 runs each); this does not measure mobile RTT. Production PSS 157,483 KB. Fifty PC requests each: `/api/ready` p50 115.5 ms/p95 440.9 ms/p99 1,122.1 ms; `/api/health` p95 144.1 ms; all 100 returned 200. | Verified report §3 [ran/phone] |
| Static shipped APK | 15,948 classes, 1,408 resources, 4 activities/11 services/13 receivers/4 providers; `allowBackup=false`, `supportsRtl=true`; only browsable scheme `wind`; 32 permissions including background-location surface and 14 third-party badge permissions. Firebase/FCM ships. | Verified report §3.5/findings 17–18 [ran] |

#### Suite counts, including the counting method

The newest baseline parsed the literal `suites` and `tests` arrays without importing or executing their loops, then independently listed clean-origin top-level `tests`. [ran/source]

| Measure | Count at `b89f220` | Meaning |
|---|---:|---|
| `scripts/run-tests.mjs` `suites` entries | **131** | Actual integration selection. |
| Selected names ending `.test.mjs` | **122** | The subset the Ledger called the “122-suite integration gate.” |
| Selected other `.mjs` suites | **9** | `phone-provider.mjs`, `native-push-sqlite.mjs`, `dispatch-sqlite.mjs`, `ride-lifecycle-sqlite.mjs`, `resource-scope-sqlite.mjs`, `ledger-sqlite.mjs`, `payments-sqlite.mjs`, `activation-gates.mjs`, `ops-sqlite.mjs`. |
| Clean disk `tests/*.test.mjs` | **124** | 122 selected + deliberate `db-api.test.mjs` and `db-persistence.test.mjs` exemptions. |
| `scripts/check-persistence.mjs` `tests` entries | **56** | Five end in `.test.mjs`; an unfiltered run additionally invokes `scripts/check-postgres-legacy.mjs`, not included in 56. |
| Missing selected files / duplicate selected names | **0 / 0** | The runner also fails on any unselected, non-exempt disk test. |

The exclusions are intentional PostgreSQL-only suites and both occur in the persistence selection. Older 131/122/106/97/52 claims do not share a basis; see §6.1.

#### PostgreSQL availability, precisely where

The old statement “the test PC has no PostgreSQL” is false as re-measured. Over the authorized SSH route to **`DESKTOP-S2JKMK5`**, direct `psql` returned: [ran]

- PostgreSQL **18.3** on x86_64 Windows; listener **`127.0.0.1:55493`**.
- Database/user **`fastship_test` / `fastship_test`**.
- `postgis` default/installed **3.6.2**. `postgis_raster`, `postgis_sfcgal`, `postgis_tiger_geocoder`, `postgis_topology` are available at 3.6.2 but have no `installed_version` in that database.
- Process: `C:\wind-k5\.expo\implementation\postgresql18\bin\postgres.exe`; data `D:/wind-plan-20261110-astra/run/.expo/implementation/pgdata`, port 55493, loopback only, UTC.

This is distinct from the owner's PC's older PostgreSQL 16 on 5432 and older suites' expected port 55473. A working server does **not** make the full persistence gate green: earlier full runs hit a phone-identity 503 that passed standalone and a `pg_restore.exe ETIMEDOUT`; those are unresolved harness/performance results, not RDS/PostGIS incompatibility. [Ledger C-14/C-15]

#### Lint, typecheck and test state

- Latest isolated local Windows clean-worktree run: Node v24.12.0/npm 11.11.0, `npm ci` installed 871 packages; **`npm run typecheck` exit 0** (`tsc --noEmit` for app and server) and **`npx expo lint` exit 0, no diagnostics**, each repeated in the foreground. Tracked source remained unchanged. This was explicitly a local fallback, not remote `k5` evidence. [ran]
- An earlier continuation on `DESKTOP-S2JKMK5` also recorded typecheck exit 0 but lint failures for `expo-auth-session` and `expo-web-browser` in `src/entra-auth.ts`, and `expo-notifications` in `src/native-push.ts`. Node/TypeScript could resolve the named packages in that investigation. **The failure did not reproduce in the later independent clean local run; cross-machine root cause is unresolved, not evidence that imports should be deleted or lint disabled.** [current/open]
- Full clean integration is not archived green. One full run failed `tests/url-decoder.test.mjs:15` with `%41…` instead of `A…`; direct `node --test tests/url-decoder.test.mjs` and `node scripts/run-tests.mjs --filter=url-decoder` then passed. Treat as intermittent, not a proven decoder defect. [Ledger C-13]
- `expo-doctor` in the isolated baseline reported `.expo` not Git-ignored and eight SDK patch mismatches. No upgrades were applied; this is not itself a production runtime failure. [Ledger C-16]
- The old root-only `booking-retry-race.test.mjs:97` failure belongs to dirty `b609229`; that test is absent from canonical `b89f220`, whose booking client already retains the command on ambiguous failure and re-quotes `quote_consumed`. It is not a canonical P0. [source/other-agent]

### 3.2 Deployment provenance and the dead-host APK

**Registry/Git facts [current/ran]:**

- ECR repository `wind-api`, tag **`20261112-aws1`**, status ACTIVE, maps to full digest **`sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc`**. `DescribeImages` also returned push/pull timestamps.
- Git revision **`4f647e77ddc4b4f2ed0ecbd047dc1037953d888d`** exists, is PR #28 (`2026-11-12T18:45:18+02:00`) and is an ancestor of canonical `b89f220`.
- Ledger A-06 preserves an earlier live-host observation associating that revision, tag and digest prefix. It is `[other-agent]`, not a fresh revalidation.
- **Not established now:** the currently running container's digest or `org.opencontainers.image.revision`. SSM, EC2 and CloudTrail log reads are denied; ECR `BatchGetImage` is also denied. Public readiness carries no image provenance. There is no local Git tag `20261112-aws1`, which does not contradict its separate ECR tag use.

**Installed production artifact [ran/phone]:**

| Property | Value |
|---|---|
| Package/version | `ps.wind.app`, v1.1.0, versionCode **24**, updated 9 Nov 2026 |
| Size / SHA-256 | **107,454,199 B** / **`5248ABE94BB46DD9555E3DFEA4724C38279624B25A18AC1DCB58A66516891ABB`** |
| ZIP integrity | 1,408 entries; `testzip=None` (all CRCs pass) |
| Retired host | `windapi236.swedencentral.cloudapp.azure.com`: **1 occurrence**, in `assets/index.android.bundle` |
| Current host | `dlvxzw3gj596d.cloudfront.net`: **0**; generic `cloudfront.net`: **0 across every decompressed APK entry** |
| Old host runtime | DNS A `20.91.209.132`, but HTTPS timed out after 15 s in the later check; Azure VM had been stopped |
| Observed effect | Login renders, but phone-check fails with `تعذّر التحقق من حالة الرقم. حاول مرة أخرى.`; no real account was accessed. This is network failure presented as verification failure. |

**Why it happened [source + artifact]:** `src/api.ts:11-13` reads build-time `EXPO_PUBLIC_API_URL`, otherwise falls back to Metro's host or `localhost:4000`; it does not hardcode CloudFront. `eas.json` selects EAS environment `production` but does not contain the URL; `.env.example` leaves it blank. `app.config.js` correctly says store builds bake the variable into the bundle. Its release guard requires public HTTPS but does not require the current hostname, so the retired public Azure URL passes. The production build environment supplied that old value; moving the backend later cannot rewrite an already-built APK. The researchers did not inspect EAS history, so **who set the historical value and exactly when remains unknown**.

### 3.3 Booking and the three replay points

`POST /api/orders` has a booking-specific `requestId` protocol and an optional outer `commandId` protocol. They are not interchangeable. [Atlas `wind-money-and-state` §1, clean source]

| Step | Actual operation |
|---|---|
| 1 | Require active customer and any promo attempt limit; remove `requestId` and `commandExpiresAt` from the body, leaving canonical `input`. |
| 2 | Prepare smart pricing; reject `quoteId` combined with `quotedPrice`/`price`; validate quote UUID and require PostgreSQL quote capability. |
| 3 | Define reauthorization after asynchronous routing; PostgreSQL `lock=true` also takes user/session share locks. |
| 4 | **No `requestId`:** price if requested, reauthorize, `BEGIN IMMEDIATE`, `createOrder`, commit, return. No `order_commands` receipt is written. |
| 5 | **With `requestId`:** require UUID. Optional deadline must be a safe integer no farther than `BOOKING_COMMAND_TTL_MS + 60s` ahead; no deadline means not expired. Canonical hash excludes request ID and deadline. Client TTL is 10 minutes. |
| 6 | Define replay: read caller's `(user_id, request_id)` in `order_commands`; reauthorize, reject changed hash, return `getOrder(existing.order_id,user)`—the **current projection**, not a frozen response. |
| 7 | **Replay point 1, before first expiry check.** A committed command replays even after deadline/tariff change. Only no receipt leads to `409 booking_command_expired`. |
| 8 | Price unless quote-bound, reauthorize, begin write transaction. |
| 9 | **Replay point 2, inside the transaction**, covering a competitor that committed while routing was awaited; hit rolls back and returns that order. Only then comes the second expiry check, immediately before creation. |
| 10 | `createOrder`; insert `(user_id,request_id,payload_hash,order_id)` in the same transaction. |
| 11 | On error, rollback/reauthorize and **replay point 3**, returning a concurrent winner if one exists; otherwise rethrow the original error. |
| 12 | Commit is outside that try/catch. An uncertain commit failure is not converted to synthetic success; there is no further deadline check between creation and commit. |

Recovery semantics:

- `GET /api/orders/commands/<requestId>` returns `{orderId}` or `{orderId:null}` for the caller. Null is a point-in-time read, **not proof an in-flight POST cannot later commit**. Client treats missing as `unknown` until 30 seconds after deadline, then `absent`; with no deadline it stays `unknown`.
- Same account/request ID + different canonical input → `409 idempotency_conflict`; changing only the deadline is not a conflict. Replay reauthenticates, so a saved receipt does not preserve revoked access.
- Committed replay precedes quote consumption checks. A different command reusing a consumed quote gets `quote_consumed`; expired unconsumed quote gets `quote_expired`.

#### `order_commands` versus `command_results`

| Mechanism | Availability/key | Stored/replayed result |
|---|---|---|
| `order_commands` | SQLite + PostgreSQL; PK `(user_id,request_id)`; only successful order creation. | `user_id,request_id,payload_hash,order_id`; re-fetches current order. |
| `command_results` | PostgreSQL-only; PK `(actor_id,command_id)`; no SQLite definition found. | Payload hash, HTTP status, stored JSON response, created time; successful and caught HTTP failure outcomes replay as stored. |

`versionedCommand` requires authenticated user, UUID v1–v5 command ID and a supported path; SQLite with `commandId` returns `409 durable_protocol_unavailable`. It hashes canonical `{path,method,input}` after removing `commandId`/`clientRecordedAt`, takes a PostgreSQL advisory lock on actor+command, rechecks current role/status/session/resource access, and uses `expectedVersion`/optional `expectedStatus` for order-targeted mutations. Cash has version/amount checks; supplied currency must be ILS. It sets `body.requestId=commandId` if absent, so a durable booking may have both rows; outer replay returns before the booking route. Caught `HttpError`s are stored; unexpected errors are not.

Quotes are PostgreSQL-gated with **120,000 ms TTL**. Stored fields include identity/customer, itinerary/contact/scope, currency, `price_minor`, `discount_minor`, `commission_minor`, tariff/evidence/ETA versions, itinerary hash and consumption fields. Booking locks the quote `FOR UPDATE`, checks ownership/feasibility/expiry/consumption and supplied itinerary consistency, derives price from `price_minor`, inserts order and consumes quote atomically. A separate exported `consumeQuote` helper exists, but the examined booking route uses its own locked read/update.

### 3.4 Order state machine

The shared application type and PostgreSQL `orders_status_check` contain exactly nine statuses: **`searching`, `assigned`, `at_pickup`, `in_transit`, `completed`, `cancelled`, `on_hold`, `returning`, `returned`**. SQLite base schema lacks that status `CHECK`. [source]

```text
statusFlow = searching → assigned → at_pickup → in_transit → completed
activeStatuses = assigned, at_pickup, in_transit, on_hold, returning
finishedStatuses = completed, returned
nextStatus(returning) = returned; out-of-flow/final states map to themselves
```

PostgreSQL adds structural invariants: `searching` has no driver; custody/finished states other than `cancelled`/`searching` require one; `completed`/`returned` require `completed_at`. No general SQL old→new transition table was found; routes enforce direction.

| From → to | Actor/route and material guards |
|---|---|
| new → `searching` | Active customer `POST /api/orders`; both insert paths hard-code initial state. |
| `searching` → `assigned` | Driver `POST /api/jobs/:id/accept` with active role, service/vehicle/load eligibility and no prior release, CAS on still-searching; or owning customer accepting a fresh driver offer. Standard parcels have no recommended price and therefore normally use job acceptance, not the priced driver-offer route. |
| `assigned` → `at_pickup` → `in_transit` → `completed` | Assigned driver `POST /api/orders/:id/advance`; same driver, `activeStatuses`, exact `expectedStatus`, no open safety incident, computed next state. Pickup sets `picked_up_at` with `COALESCE`. Non-rides bypass the additive boarding guard. |
| `in_transit` → `completed` proof | Parcel creation assigns a four-digit handover code. Stored code must match normalized input; five failures lock proof. Success sets `completed_at`, preserves/computes commission and posts order journals. |
| `returning` → `returned` | Driver advance with return code and same five-attempt treatment, or admin `confirm_return`; sets `completed_at` and records return completion. |
| `searching`/`assigned`/`at_pickup` → `cancelled` | Owner/admin/partner cancellation uses those three CAS states; already-cancelled is idempotent only for owner/admin. Stale-demand worker cancels only still-unassigned stale searching rows. Driver cannot advance to cancelled. |
| `at_pickup` → `cancelled` via exception | Assigned active driver, recognized reason, exact expected state, no safety hold; records `PICKUP_FAILED`. |
| `assigned`/`at_pickup` → `searching` | Driver release before collection, or admin blocking/editing courier: clears driver/commission, restores price/discount and pool, records release, reoffers; prior release makes retry succeed. |
| `in_transit` → `on_hold` | Driver delivery exception (at pickup cancels instead), or admin eligibility recovery with expected version, reason/evidence. |
| `at_pickup` → `on_hold` for scope mismatch | PostgreSQL resource-scope pickup check: assigned driver, exact state, no safety incident, effective scope and actual load that fails `covers`; records check before hold. |
| scope `on_hold` → `at_pickup` | Customer supplies conforming revised declaration, or admin resolves scope with support reason/inspected capacity; resume clears exception. |
| `on_hold` → `in_transit` / `returning` | Admin resolve action `reattempt` / `return`, requiring exact state and reason ≥5; return generates return code and resets attempts. Eligibility recovery can also return from `in_transit`. |
| `in_transit`/`on_hold`/`returning` → `returning` | Admin eligibility recovery or courier blocking in custody; resets proof attempts. |
| terminal states | No outgoing transitions from `completed`, `returned`, `cancelled` were found. Driver cannot advance `on_hold`; admin owns its resolution. |

Phone evidence narrows runtime claims: sandbox W-00008 and later W-00007 completed through both role UIs, including visible delivery code with keyboard open. In W-00007 a real driver fix 48 km away produced explicit continue/cancel confirmation, not silent acceptance; this proves a **warning with override**, not a server-side distance block. Background lock continuity remains unproven. [Ledger C-17–C-21/other-agent]

### 3.5 Cash, receipts and the ledger

**Capability boundary:** legacy `cash_entries` works on SQLite and PostgreSQL. Double-entry accounting, cash receipts, quotes and several custody guards are PostgreSQL-gated; SQLite does not silently gain them. [source]

| Layer | Implementation |
|---|---|
| Legacy `cash_entries` | `id,driver_id,kind,amount_cents,note,status,recorded_by,created_at,decided_at`; kind `remittance`/`adjustment`, nonzero integer minor units, status `pending`/`confirmed`/`disputed`; request ID and resolution fields added. SQLite blocks deletes and most edits; PostgreSQL `immutable_cash` permits only pending remittance → confirmed/disputed with `decided_at`, all other compared fields unchanged, and rejects delete/truncate. |
| Order money | SQLite order `price`, `commission`, additive `discount` are `REAL`, with aggregation rounded to integer minor units. PostgreSQL adds trigger-maintained `price_minor`, `commission_minor`, `discount_minor`. |
| PostgreSQL double entry | `ledger_accounts` (unique code/kind/owner, ILS), `ledger_journals` (unique `business_ref`, kind/order/cash entry/actor/reason/rate/reversal), `ledger_entries` (exactly one positive debit/credit side). Deferred triggers require ≥2 lines and equal nonzero totals; accounts/journals/entries immutable. Reused business reference replays only identical normalized metadata/lines, else `idempotency_conflict`. |
| Cash receipts | PostgreSQL-only `cash_receipts` unique per order/receipt ref: due/collected/collector/status/timestamps; status `due/collected/partial/returned/settled`, collected requires collected=due. `cash_receipt_events` is append-only. |
| Merchant goods COD | Separate PostgreSQL `merchant_cod` + events: goods/collected/remitted minor units, beneficiary, collector, status, due date, payout ref. This is not driver commission debt. |

**Legacy driver debt formula** (`server/domain/money.ts`, BigInt/safe-integer checked):

```text
owedCents = commissionCents - discountsCents + adjustmentsCents - remittedCents
```

- Commission and Wind-funded discounts sum over `completed` + `returned`; positive adjustments increase debt, negative relieve it.
- Only **confirmed** remittances subtract. Pending remittances are shown separately and cap a new handover at `owed - pending`; disputed/pending do not settle.
- Drivers collect gross fare but the legacy exposure is Wind's commission snapshot, not a per-parcel gross collection table. Assignment snapshots commission; terminal advance preserves/computes it.
- PostgreSQL read alternative sums `debit_minor-credit_minor` on driver receivable. Commission journals debit driver receivable/credit platform revenue; promo discounts debit promo expense/credit driver receivable. Confirmed remittances credit receivable/debit provider clearing. Projected cash cap exists but defaults inactive.
- Driver deletion/role change is refused on nonzero owed or any pending handover.

**Receipt flow on PostgreSQL:**

1. `POST /api/orders/:id/cash-receipt` (assigned driver/admin) requires assigned driver, positive `price_minor`, non-searching/non-cancelled state; inserts due `CR-<orderId>` + recorded event, where `due=price_minor-discount_minor`. Same driver/due replays existing; reassignment only while due with zero collected.
2. `/cash-receipt/collect` requires positive `amountMinor`, locks receipt, allows due/partial, accumulates without overflow, stores actual collector/time and partial/collected state, and appends this call's amount. **No request-ID replay check exists inside this collect method.**
3. `{action:'return'}` on that route requires partial/collected and marks returned with event.
4. Receipt collection itself does not post double entry; order commission/discount journals post on completed/returned. A `cash_collection` journal construction was not found although the schema permits that kind.
5. Merchant COD `/cod/collect` is cumulative and does have actor/amount request-ID replay checks; finance `/cod/remit` records goods-value remittance separately.

**Handover/settlement routes:**

- `POST /api/admin/cash/remittance`: admin records positive pending handover, at most owed-pending and absolute ≤1,000,000 minor units; optional UUID replays only identical driver/kind/amount.
- `POST /api/driver/cash/:id/confirm`: driver confirms/disputes own pending remittance by CAS; confirmation posts journal, dispute alerts recording admin; second decision fails.
- `GET /api/admin/cash/pending`: up to 100 pending rows with driver name/phone/status.
- `POST /api/admin/cash/:id/resolve`: admin fallback confirm/dispute with reason ≥5 and optional evidence, stores actor/reason, CAS, posts on confirmation.
- `POST /api/admin/cash/adjustment`: immediately confirmed signed adjustment, cannot drive available balance below zero. Debt forgiveness requires approved subject/amount-bound financial approval decided by someone other than requester and recording admin; PostgreSQL consumes it atomically once.
- Driver cash view returns components/latest 50 plus all pending; admin cash sorts drivers by owed descending then ID. Admin UI creates fresh request ID per opened form and displays server remittance references.

**Cutover discrepancy [source/open]:** PostgreSQL `immutable_cash` excludes only `status` and `decided_at` from its “everything else unchanged” comparison, while admin resolve also writes `resolved_by` and `resolution_note`. As read, those extra writes do not satisfy the trigger predicate; no replacement definition was found. This needs an actual PostgreSQL resolution test before cutover.

**Admin totals:** `/admin/cash` uses legacy `cashBalances`, not double-entry admin balances. Dashboard `/admin/stats` uses major-unit order fields: GMV=sum price, commission=sum commission, discounts=sum discount over completed+returned; subscription revenue=sum activated subscription price; `profit=commission-discounts+subscriptionRevenue`; 14-day chart groups order commission by `completed_at` and subscriptions by `activated_at` into local days. `/api/admin/ledger` is a separate finance-staff account view.

**Digital payment defect before any activation [source/Verified report]:** `createIntent` and `query()` in `server/domain/payments.ts` can write `captured` without `settlementGate`; `getIntent` and `applyProviderEvent` gate. `query()` also calls the provider again after `getIntent`. Real card activation is not approved; correctness tests are still required before it could be enabled.

### 3.6 Dispatch gates and offers

Production does not currently run the new automatic dispatcher. [Atlas `wind-geo-and-dispatch` §2]

| Gate/fallback | Exact behaviour |
|---|---|
| Activation | `eligibilityDefaults.futureDispatchActivated=false`; otherwise enabled only when `NODE_ENV==='test' && WIND_DISPATCH_TEST_ONLY==='1'`. Production cannot be enabled through that test flag. |
| Enabled service | `WIND_ENABLED_SERVICES` defaults to `parcel`; automatic rounds accept only `service==='ride'` and `status==='searching'`, so parcels never enter. |
| Storage | Requires PostgreSQL, dispatch tables and `schema_migrations.version=13`; otherwise rounds do not start and guarded routes report unavailable. |
| Measured approach | Requires `order_requirements` and current matching `order_approaches` with vehicle/requirements/run revisions, exact pickup coordinates and `valid_until>now`; coverage checked with ETA/route/service time. |
| Production fallback | If no round starts, `dispatchOrBroadcast` legacy-broadcasts to up to 100 drivers with `ORDER BY random()`. |

Candidate shortlist: active approved/unexpired driver, approved/unexpired/inspection-clear vehicle, activated matching policy, online leased presence and same-session location no older than 30 s, current licence/registration/inspection, enough seats/equipment, no active driver/shared-vehicle order, no prior release, no earlier round offer and no other open offer. PostGIS distance then driver ID limits to 10.

Constants: offer lease **15 s**, maximum **3 offers/round**, round deadline **90 s**, matching fix maximum age **30 s**, idle credit cap **60 s**, idle divisor **10**. OSRM duration is used when available (`estimated:false`); missing/failing OSRM falls back to haversine at **30,000 m/hour**, rounded up and `estimated:true`.

```text
idleCreditSeconds = min(60, floor(max(0,idleSeconds)/10))
rankScore = pickupEtaSeconds - idleCreditSeconds
sort = rankScore ascending, then driverId; rating is not an input
```

Rounds reuse an open round/offer or increment `round_number` with deadline now+90 s. Candidates are rechecked before an offer with hashed lease nonce and stored ETA/idle/rank. Expiry is `min(now+15s, round.deadline)`. PostgreSQL permits one open offer per round and one per driver. Deadline, three offers or no eligible candidate exhausts; non-ride/non-searching cancels. Decline and worker-driven expiry issue the next candidate; repeat decline is idempotent. Acceptance revalidates UUID/nonce, matching order/driver, open/unexpired lease, order version/assignment epoch, same presence session, all driver/vehicle/policy/requirements/run revisions and no busy/shared vehicle or prior release before atomic assignment. Other offers are revoked, round marked matched, history/events appended. Customer retry requires capability/flag/ownership/searching ride. Release before collection returns to searching and starts a new round or legacy broadcast excluding the releasing driver. A PostgreSQL trigger revokes offers/cancels the round on order cancellation.

### 3.7 Addresses and places

**Server index [source + gunzipped JSON]:**

- `server/data/places-ps.json.gz`, built **2026-11-03**, root keys `built,places,streets,points`.
- Exactly **24,090 places**, each `[ar,en,latitude,longitude,kind,rank]`; first is `["بيتونيا","Bitunia",31.88602,35.17044,"town",0]`.
- Kinds: `town,area,health,education,worship,food,bank,fuel,transit,shop,junction,poi,street`; street rows load separately.
- **2,637 streets** `[ar,en]`; `points` has **102,357 numbers = 34,119 triples** `[streetRowIndex,lat,lng]`, with samples for every street. Total searchable rows **26,727**.
- Runtime objects add folded text/tokens; town/area and POI buckets use 0.01-degree keys (comment: about 1 km). Suggest scores token prefixes, rejects null `servedCity`, deduplicates and defaults to at most 8. Reverse precedence: POI <40 m, street <120 m, POI <100 m, area <2.5 km, then served-city name.

**Client/offline corpus and search:**

- `src/model.ts` has 16 records: `ramallah,bireh,nablus,hebron,bethlehem,jenin,tulkarm,qalqilya,jericho,salfit,tubas,jerusalem,gaza,deir_albalah,khan_younis,rafah`. None has a `served` property. `nearestCity` considers all; `servedCity` accepts nearest within `SERVICE_KM=20` km.
- Fold operations: trim/lowercase, remove Arabic diacritics/mark range, superscript alef and tatweel, fold `[أإآٱ]→ا`, `ى→ي`, `ة→ه`. It does not include the server's extra `ؤ/ئ`, digit, punctuation or optional-`ال` rules.
- Saved places precede cities in the pure helper; actual UI renders saved before server hits and recent+saved on empty query. Local towns are fallback only after `/places/suggest` failure. Helper saved choice has `point:null`, while actual `TripSearch` restores `saved.point`.
- Helper feedback: empty→`empty`; nonempty match→null; no match online→`no_match`; offline→`offline`; `offline=!online`. Current `TripSearch` calls with default `online=true` and handles failure via `shown.failed`, local fallback and `searchOffline`, rather than passing false.

**Choice → confirmed pin → order:**

- `mapChoices` keeps only hits with served exact point; `placeAt` returns `{error:'outside'}` otherwise. A pointed choice applies immediately; an unpointed choice opens pin mode centred on its city, preserving note. `proposePlace` retains an accepted pin only when accepted/proposed cities match; `confirmPlace` returns `{city,note,point}`.
- Stationary pin reverse-geocodes through `/places/reverse`; confirmation requires map ready, existing served point and no movement. Note precedence `pinNote || reverseLabel.name || cityName`. Server independently rejects a non-null booking pin >20 km from booked city.
- Map hit name becomes `TripPlace.note`. Pickup/dropoff notes remain editable, **required and maxLength 200**, flow through `newBooking`/`orderRequest` to `POST /orders`, are trimmed/rejected empty or over-limit server-side and persist in `orders.pickup_note/dropoff_note` on both legacy and quote paths.
- Stored notes serialize only to owner/admin/assigned driver; other viewers receive empty strings.

### 3.8 Maps, OSRM, checkpoints and ETA

**Map rendering [source]:**

- Android loads `${API_URL}/map/v1/map.html` in `react-native-webview`; web uses `/map.html` in an iframe. Page vendors **MapLibre 6.12.0**.
- Style is `https://tiles.openfreemap.org/styles/liberty`; header identifies OpenFreeMap vector tiles/OpenStreetMap data/no key. Concrete vector-tile template is inside the remote style, not in the files read. No alternate style/tile host was found.
- Import failure, ready timeout and WebGL loss emit `{type:'failed'}`. Readiness requires map load **and at least one actual loaded vector basemap tile**, not just a parsed style/overlay.
- `SceneMap` falls back to supplied UI + Retry; `BaselineRoute` uses `RoutePreview`, a stylized road/direct-connector/stop-label diagram, not a live tile map. `MapProviderBoundary` owns provider retry/failure.

**OSRM:**

- `OSRM_URL`; `OSRM_TIMEOUT_MS` default **3000 ms**, clamped **1000–10000 ms**.
- Request: `${osrmUrl}/route/v1/driving/{lng,lat;...}?overview=full&geometries=geojson&steps=true${extra}`.
- Requires `Ok`, finite nonnegative distance/duration and valid GeoJSON; `NoRoute` returns empty; other failures update health and throw. Without URL, `roadRoute` returns `503 route_unavailable`.

| Build path | Clip and reproducibility |
|---|---|
| `infra/osrm/Dockerfile` | Downloads `israel-and-palestine-latest.osm.pbf` and runs extract/partition/customize on the **full Israel-and-Palestine PBF**, so it is not West Bank-clipped. OSRM image is tagged `v26.6.1-amd64-alpine`; upstream extract is not pinned. |
| `infra/osrm/build-west-bank.sh` | Documented production path: `osmium extract -s simple -p /d/boundary.geojson` before OSRM stages; caller boundary's outer ring is identified as OSM relation 1803010. Same tagged image; upstream `-latest` is again not pinned and no checksum is recorded. |

**Checkpoints:**

- Active reports are read on demand; reports older than **2 h** or from blocked users do not count. Newest by `created_at,id` determines status/note/time; agreeing counts distinct reporters for that status.
- Active non-customers report `open|slow|closed`; repeat guard 10 min/checkpoint and 30 reports/hour across checkpoints. Optional admin point must be within `distanceKm<=25` of selected city.
- Positioned closed/slow checkpoints within **200 m** of a polyline are considered. OSRM `alternatives=3`; if first route crosses closure, try clear non-backtracking alternatives then ten via routes at **1,2,3,5,8 km** each side. If none works, retain fastest and report closure still crossed.
- Each slow checkpoint adds **15 min** to route selection/ETA; closed checkpoints get no invented fixed penalty. Cache identity includes closed/slow IDs/positions; calculated entries expire after **30 s**.

Seeded checkpoints (insert only missing names, owned by first active admin):

| Name | Cities | Lat,lng |
|---|---|---|
| حاجز حوارة · Huwara | nablus | 32.1780,35.2735 |
| حاجز زعترة · Za'tara | nablus, ramallah | 32.1153,35.2573 |
| حاجز دير شرف · Deir Sharaf | nablus, tulkarm | 32.2551,35.1852 |
| حاجز شافي شمرون · Shavei Shomron | nablus, jenin | 32.2642,35.1879 |
| حاجز عطارة · Atara | ramallah, bireh | 31.9828,35.2006 |
| حاجز جبع · Jaba' | ramallah, bireh, jericho | 31.8539,35.2564 |
| حاجز قلنديا · Qalandia | ramallah, bireh | 31.8623,35.2275 |
| حاجز عنبتا - عيناف · Anabta-Einav | tulkarm, nablus | 32.2904,35.1357 |
| حاجز شوفة · Shufa | tulkarm | 32.2803,35.0668 |
| حاجز أفني حيفتس · Avnei Hefetz | tulkarm | 32.2812,35.0757 |
| حاجز الطيبة · Taybeh | tulkarm | 32.2890,35.0152 |

**Arrival fence:** ride-only, exact pickup pin and latest fix required. Future fix or age `>120_000 ms` → `arrival_fix_stale`; distance `>300 m` → `arrival_too_far`. Exactly 120,000 ms and 300 m pass. Client mirrors these for warnings, explicitly not the server block; serialization withholds a driver fix older than 120,000 ms.

**Real ETA formulas and units [source]:**

```ts
// server/domain/journey.ts: raw is SECONDS; result fields are seconds
const min = band?.[0] ?? raw;
const max = band?.[1] ??
  (raw === null ? null : (Math.round(1.3 * Math.ceil(raw / 60)) + 2) * 60);

// src/map-math.ts: argument and tuple are MINUTES
export const etaRange = (minutes: number): [number,number] =>
  [minutes, Math.round(minutes * 1.3) + 2];
```

Thus client upper bound is **`round(minutes×1.3)+2` minutes**. Server default is **`(round(1.3×ceil(rawSeconds/60))+2)×60` seconds**, with raw as default minimum and explicit band values already in seconds. `ceil(minutes×1.3)+2` is not either implementation. `etaProjection` validates timestamps/range and returns `rawSeconds,minSeconds,maxSeconds`, basis/accuracy and issue/expiry validity. `/api/route?journeyProtocol=1` projects `result.minutes*60` with a **30-second validity window**. The multiplier is heuristic, not calibrated from production trips.

### 3.9 Realtime, tracking and sharing

- Wind uses server-issued bearer sessions and a **signed-cursor event stream** in `server/domain/realtime.ts`, not Supabase Realtime/PG_NOTIFY. Waiters and cursors are process-local; Google routing daily counters are also in memory. PostgreSQL persistence does not make them multi-instance shared. [read]
- Earlier research measured roughly 3 s GPS capture with 5 s moving/15 s stationary upload and found no durable offline location queue or raw location history; discarded fixes are therefore not recoverable. This is an evidence finding about the examined implementation, not a desired retention policy. [Verified report §10.6]
- Driver fixes older than 120 s are withheld from live order serialization. Driver background permission was granted in sandbox, but the app explicitly warns sharing stops on lock until “always allowed”; the attempted ADB lock/unlock did not produce valid continuity evidence. [Ledger C-19/open]
- Share URL is HTTPS `${API_URL}${path}` from `GET /orders/:id/share`, e.g. CloudFront `/track/<token>`, rendered by `src/app/track/[token].tsx`; the app's own deep scheme is `wind://`. Deleting/changing the distribution without a stable domain breaks installed clients **and previously shared tracking links**. [read/ran]
- Expo push ticket `ok` is treated as success in `server/push.ts`; no receipt lookup exists. Native token registration has no `addPushTokenListener`, so rotation is unhandled. Production has zero subscriptions in the surviving snapshot. [source/aws]
- Two sandbox trips prove UI/API agreement, not production transition authorization or money movement. W-00008 customer showed ₪20 and driver ₪17; without server rows this is only two displayed values, not commission reconciliation. Later admin sandbox view showed four completed orders/₪80/₪12 commission and separate handover/settlement controls; full reconciliation remains open. [other-agent/current]
- Named phone acceptance matrix C-01…C-07, D-01…D-07, A-01…A-06, X-01…X-05 has not been completed. Cold starts, memory, API latency, two sandbox trips and isolated UI observations do not substitute for it.

## 4. The reference apps, feature by feature

### 4.1 Uber rider 4.655.10001

**Artifact/depth.** `com.ubercab`, versionCode 323547, base `uber-rider__base.apk` **207,018,879 B**, SHA-256 `BC0E06D32B5EA6C2F12D36FDDC561BB6427B9A4A76B46A3D5B737368732965C4`, 23 DEX/186,163,396 B. Earlier broad REA counted 288,493 raw DEX definitions and 174,898 JADX-materialised names; these bases must not be mixed. Signer and Play source stamp match 4.654. The offer/ETA/payment study uses focused class/member inspection; the POI supplement uses only cheaper DEX strings. All product behaviour below is static `[O/I]`, not runtime.

#### Map POI, saved and suggested places

The central observed structure is one server-driven family spanning `com.uber.maps.mapsexperiencepresentation` and `com.uber.mapssdk.poi`: 35 top-level classes plus 53 nested builders/`*OrBuilder` interfaces in the narrow supplement. Earlier release diff counted +41 and +11 package classes respectively.

| Contract area | Observed classes and meaning |
|---|---|
| Query/response | `GetMapPoisForAnchorRequest/Response`, `PoiRequest(OrBuilder)`; `GetSavedPlacesRequest/Response`; `UpsertSavedPlaceRequest/Response/ResponseSuccess`; `DeleteSavedPlaceRequest/Response`. |
| Anchors | `MobileAnchor`, `TripDestinationAnchor`: the same query shape can represent near-me and near-destination. |
| Markers/groups | `PoiGroup`, `PoiGroupSuccess`, `PoiGroupOrBuilder`, `PoiMarker(OrBuilder)`, `PoiType`, `MarkerMetadata`, `AddressFieldKey`, `FulfillmentType`, `EatsFilters`. Separate group success supports partial group results `[I]`. |
| Saved/suggested | `SavedPlace(OrBuilder)`, `SuggestedPlace(OrBuilder)`, `ResidenceType`: system suggestion and customer-kept place share one model family. |
| Client | `POICache`, `POIService`, five anonymous implementation classes: a dedicated cache exists in front of the service. |

DEX strings, which are **consistent with** proto field names but do not prove message association: `anchor` 202, `latitude` 171, `zoom` 89, `longitude` 81, `radius` 67, `viewport` 40, `polygon` 22, `cluster` 13, `saved_places` 9, `request_id` 7, `bbox` 1. Whether radius/viewport/polygon are alternatives or compose is **not determinable** from strings.

Earlier full study establishes renderer context, not the cheap supplement: `MapProvider{UBER,GOOGLE,UNKNOWN}` → `MapFactory.create` → Uber/Google factories, default `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}`. The POI contract is engine-neutral `[I]`. Map framework classes were unchanged between 4.654/4.655; 80/82 cited map FQNs survive. Two old “missing class” claims were decompiler artifacts: `UberMapView` now materialises with 26 classes and `AccessPointGroup` with builder. Raw diffs must exclude 2,001 removed `*ScopeImpl$Dependencies` interfaces from DI churn.

#### Offer lifecycle

- `MarketplaceRiderApi.status(String,RiderUuid,StatusRequest): Single<StatusResponse>`. `StatusResponse` has `clientStatus,dispatchStatus,eyeball,scaledOffers,riderAppOrdersResponse` etc. `ScaledOffers` itself exposes only `isPollingEnabled:Boolean` and `pollingIntervalMS:Integer` plus adapter machinery; it is **not** shown to contain `GenericRiderOffer` directly.
- Push/Ramen and polling surfaces coexist: `RiderOfferPushModel`, `StatusResponsePushModel`, `RiderOfferRamenPluginFactory`, `RiderOfferWorkerPluginFactory`, `PollingRiderOfferWorkerPluginFactory`. `RiderOfferPushModel` exposes only `INSTANCE`, a marker/channel type here. Active transport and actual envelope are unknown.
- `GenericRiderOffer`: `offerUUID`, `tripUUID`, `riderOfferType`, `riderOfferViewModel`, string-keyed `linkedRiderOfferViewModels`, `riderOfferMetadata`, `riderOfferAdditionalStepsType`, `offerTripStates:ImmutableList<OfferTripState>`, `acceptWindowInSec:Integer`, `offerExpiryAt:TimestampInMs`. Relative countdown and absolute deadline are both represented; nullability/wire requiredness is unknown.
- Four API verbs, each `(String,Map<String,Object>):Single<Object>`: `acceptOffer`, `rejectOffer`, `ackOffer`, `expireOffer`. Decline is named **reject**; acknowledgement and expiry reporting are distinct. No method body proves local timer automatically calls expiry or what server then does.
- Typed error slots: accept `badRequest,notFound,rateLimited,unauthenticated,unauthorized`; reject `badRequest,rateLimited,unauthenticated`; expire same three; ack `noActiveSessions,serverError,unauthenticated`. Each generated model also has `code:String`. Runtime mapping/exclusivity/retry is not established.

#### ETA and payment contracts

Three separate generated models, not asserted to be one aggregate:

- `ue.types.common.EtaRange`: nullable-capable `Integer min,max,raw`. Units are not named.
- `presentation.rider.matchingsignal.EtaAccuracy`: enum `UNKNOWN,LOW,MEDIUM,HIGH`.
- `go.rider.presentation.mop.models.metadata.ETAValidity`: `issuedAt,expiresIn,expiresAt`; `expiresIn` is generated `Duration`, instants use display type `kvc.e`.

The useful shape `[I]` is raw estimate + interval + coarse confidence + relative/absolute validity. Member surfaces do not reveal computation, rounding, clamp, minimum width or `min<=max`; no Uber ETA formula is claimed.

`rtapi.models.payment.PaymentProfile` is a broad instrument model: identity/presentation (`uuid,useCase,status,statusMessage,displayable,tokenType,tokenDisplayName,tokenData`); capabilities/use cases; card/bank/debit/combo/flex details; `balance,hasBalance,isExpired,linkedPaymentProfile,networkTokenizationState,rewardInfo,amexReward`; management timestamps, billing country/ZIP, vendor/authentication/analytics. Adjacent models include `PaymentCapability,UseCaseKey,Balance,CashChangeFeatures,ArrearsAction,ArrearsReason`. No `cash` field or cash `tokenType` value is asserted.

Shipped English/Arabic resources `[O]` distinguish ordinary cash, arrears and change:

| Key | English | Arabic |
|---|---|---|
| `cash` | Cash | الدفع نقداً |
| `pay_with_cash` | Pay for trips with cash | ادفع أجرة المشاوير نقداً |
| `eats_spender_arrears_payment_pay_with_cash` | Pay with cash on delivery | ادفع نقداً عند الاستلام |
| `ub__spender_arrears_v3_payment_pay_with_cash` | Cash at the end of this trip | الدفع نقداً في نهاية هذا المشوار |
| `connect_cash_arrears_disclaimer` | Full cash payment must be resolved before the next trip | إذا لم يتم الدفع نقداً بالكامل، فستكون مسؤولاً عن تسوية عملية الدفع قبل مشوارك القادم. |
| `cash_charge_modal_disclaimer` and v3 variant | Total cash is due to the driver at the end of the next trip | من المتوقع أن تدفع المبلغ الإجمالي نقداً إلى السائق في نهاية مشوارك التالي / سيتعين عليك دفع المبلغ الإجمالي نقداً إلى السائق في نهاية مشوارك التالي |
| `cash_change_plus_one_title` | Driver does not provide change | تذكَّر أن السائق لا يقدم المبلغ المتبقي عند الدفع نقداً |
| `cash_change_plus_one_message` | Change is credited to the next ride or returned through PayPal | ادفع نقداً في نهاية هذا المشوار، وسيُضاف المبلغ المتبقي المستحق لك إلى حسابك لاستخدامه في مشوارك القادم. أو يمكنك استعادته من خلال PayPal. |
| `connect_checkout_delivery_item_size_details_title` | Item details | تفاصيل الطرد |

These resources do not prove market availability, settlement, PayPal availability or which users see them.

**Single strongest idea for Wind:** **one anchor-keyed place contract for POI search, saved places and suggested places, with group-level partial success and a client cache.** It unifies Wind's currently separate place index/saved places/learned-handover concepts while keeping customer promotion of a suggestion explicit. This is a structural reference only; Uber does not operate in the West Bank.

### 4.2 Careem rider 26.43 and Captain 89.70.2

#### Rider artifact and construction

`com.careem.acma` 26.43/code 264301, **85,446,587 B**, SHA-256 **`B19112D53D3E9A800EF35908FA48AF57816D9F8F81B7A3897A7220F527127F58`**, 7 DEX. Raw DEX parser: 73,254 definitions; REA/JADX view: 66,129, with 389 activities and 34 exported components in that projection. First run reached location/notification permissions, “Eat Pay Go,” then phone/Google login; no post-OTP screen was observed. The code includes native super-app areas, `com.careem.aurora.sdui` (169 classes), named booking workflows (`CreateBookingStepWorkflow`, `PickupStepWorkflow`, `DropOffMapStepWorkflow`, `EditPickupPostAssignmentStepWorkflow`, `BookingConfirmedWorkflow`, `UnsaveLocationWorkflow`), a shared domain layer and an interface-backed map with a Google implementation. These are construction facts, not proof that a Palestinian account can use them.

#### Address model: domain, validation, search and save

`com.careem.motcore.common.core.domain.models.Address` has exactly 16 fields:

```text
id,name,location,street,area,building,buildingNumber,city,type,nickname,number,
formattedAddress,distanceLocalized,prioritizeType,placeId,bookmarkId
```

`buildingNumber` and `number` are distinct. Constructor overload 0 explicitly non-null-checks only `id` and `location`; other fields may be absent at DTO construction. Form-level requiredness must not be inferred from DTO nullability.

Validation resources [O]:

| Missing field | Resource/ID | Default string |
|---|---|---|
| Area | `address_addressAreaMissing` / `0x7f15025d` | Please enter the area of the address |
| Building | `address_addressBuildingMissing` / `0x7f15025e` | Please enter the building of your address |
| Apartment/villa `number` | `address_addressNumberMissing` / `0x7f150264` | Please enter apt/villa number |

`address_addressNotUsable` = “Address not usable” / `العنوان غير صالح للاستخدام`. A DEX const and binary-XML reference scan found no direct client call site for those three IDs; dynamic/resource-name resolution is still possible. Therefore the copy represents a validation catalogue, **not proof of universal client enforcement**. This corrects both “Careem always requires apartment number” and “Careem needs no street details.”

The broader resource surface includes `MapAndAddress_Map`, edit/confirm map, current location, search, nickname, building type, delivery/pickup notes, instruction toggle, **add pickup/delivery photo/upload/take photo/photos sheet**, address summary, select/change/save/update actions. These support pin + nickname + notes + photo as an implementation pattern without turning them into a universal requirement.

Activities/gateways [O]:

- `PickupSearchActivity` and `DropOffSearchActivity` share `t2a0`; selectors `LocationType.Pickup`/`Dropoff`; pickup returns mode `pickup`; drop-off can return `LocationModel` in `location_model` extra.
- `SaveLocationActivity` consumes `location_model` and optional `booking_id`, builds `LocationPostModel`/`NewLocationModel`; its local save-button gate checks one edit field and does not reference the three missing-address resources. No network save was run.
- `LocationSearchConsumerGateway.searchLocations(...)` accepts service area, field type, language, query, lat/lng, `location-search-session-id`, `location-search-type`, `Booking-Id`. `LocationSearchCoreGateway` exposes the same `location/5/nearby/search/...` family. `LocationSearchLocationsGateway` separately declares commuter/metro searches with `locationTypes` and optional `radiusInMeters` under `locations/v2/user/.../nearby/search/careem`.
- `NewLocationModel` transport fields are `_editableMoreDetails,_locationType,categoryLanguage,distance,googleTypes,id,latitude,locationSource,locationSourceType,longitude,mode,moreDetails,placeId,pointSource,searchComparisonName,searchDisplayName,searchDisplayNameLanguage,serviceAreaId,sourceUuid,updatedAt,vicinity`. This gateway result must not be substituted for the 16-field domain `Address`.

#### Payment: two vocabularies and an actual error mapper

`PaymentTypeSelectionOption` stores integer `paymentType` plus `paymentId,title,message,paymentCurrentStatusMessage,image,is3DSChargeEnabled,isExpired,isPackageOption,isPaymentTypeCash,businessInvoicePolicy,companyId?`.

Two code-level vocabularies must stay separate [O]:

| Ride-hailing server `PaymentType` | Encoded int | Shared `motcore` enum | Serialized value |
|---|---:|---|---|
| `CREDIT_CARD_TYPE` | 1 | `CASH` | `cash` |
| `INVOICE` | 2 | `CARD` | `card` |
| `USER_CREDIT` | 3 | `WALLET` | `wallet` |
| `CASH_COLLECTION` | 5 | `CORPORATE` | `corporate_invoice` |
| `CASH` | 6 | `GOOGLE_PAY` | `google_pay` |
| `DIGITAL_WALLET` | 7 | `FAMILY_CIRCLE` | `family_circle` |

Declared constants are not per-booking eligibility. A nested class named `BookingConfig$overrideAllowedPaymentTypesForCcts$toggleMap$1` exists, but exact outer `BookingConfig` lookup returned “Exact class not found” (obfuscated/merged), so override map key/value types and per-CCT subsets are unknown.

Payment failure mapping was actually traced for top-up:

```text
response string → defpackage.l8i LinkedHashMap exact key → R.string ID
                → caller fallback topup_failed_generic if null/absent → localized getString
```

The same response string is logged as analytics `response_code_description`. This is not proven to be every payment surface's mapper. The APK has 27 `PAY_ERROR_*` resources; 22 numbered resources; map has 49 entries: `PS-1…PS-45` + `PS-999` + three bank/IBAN keys, resolving to 25 resources. Aliases [O]:

| Resource | Response keys |
|---|---|
| PS_1 / PS_2 / PS_4 / PS_5 / PS_6 / PS_10 / PS_11 / PS_12 / PS_13 / PS_26 / PS_27 / PS_33 / PS_36 / PS_39 | Same single number each; PS_33 also PS-35 |
| `PAY_ERROR_MESSAGE_PS_3` | PS-3, PS-9 |
| `PAY_ERROR_MESSAGE_PS_7` | PS-7, PS-8, PS-21, PS-24, PS-29, PS-38, PS-45 |
| `PAY_ERROR_MESSAGE_PS_14` | PS-14, PS-23, PS-37 |
| `PAY_ERROR_MESSAGE_PS_15` | PS-15, PS-17, PS-18, PS-19, PS-20, PS-22 |
| `PAY_ERROR_MESSAGE_PS_16` | PS-16, PS-25 |
| `PAY_ERROR_MESSAGE_PS_28` | PS-28, PS-40 |
| `PAY_ERROR_MESSAGE_PS_30` | PS-30, PS-31, PS-42, PS-44, PS-999 |
| `PAY_ERROR_MESSAGE_PS_32` | PS-32, PS-34, PS-41, PS-43 |

Non-PS map entries: `BANK_NOT_SUPPORTED→PAY_ERROR_BANK_NOT_SUPPORTED`, `IBAN_ALREADY_USED→PAY_ERROR_IBAN_ALREADY_USED`, `DUPL_IBAN→PAY_ERROR_IBAN_ALREADY_USED_SAME_ACCOUNT`. `PAY_ERROR_ACCOUNT_AL_USED_SAME_ACCOUNT` and `PAY_ERROR_INCORRECT_PHONE_OTP` exist but are not in this particular map. The numeric suffix identifies a resource, not a unique string per response code.

#### Captain artifact, earnings and cash consequence

`com.careem.adma` v89.70.2/code 89702, base about 157.33 MB. Latest atlas parsed the complete `aapt2` string block: **9,762 unique keys**, all default values, **9,128 with Arabic**; this supersedes the earlier 8,965 Arabic count from the shorter pass. No screen or transaction was run.

Complete 14-key `breakdown_*` set [O; direction is I]:

| Key | English / Arabic | Reading |
|---|---|---|
| `breakdown_trip_earnings` | Trip earnings / أرباح الرحلة | Base earnings, addition; omitted by shorter earlier selection. |
| `breakdown_tips` | Tips / إكراميات | Addition. |
| `breakdown_matched_tips` | Ramadan tips from Careem / no Arabic in build | Careem-funded/matched tip; recurrence unknown. |
| `breakdown_bonus` | Bonus / مكافآة | Addition. |
| `breakdown_guarantees` | Guarantees / الضمانات | Guarantee support; formula unknown. |
| `breakdown_fines` | Fines / الغرامات | Deduction. |
| `breakdown_fines_refund` | Fines refund / استرداد الغرامات | Reversal/addition. |
| `breakdown_behavior_penalties` | Behavior penalties / عقوبات السلوك | Deduction. |
| `breakdown_money_in` | Money in / المال الداخل | Credit-side bucket, not necessarily earnings itself. |
| `breakdown_money_out` | Money out / المال الخارج | Debit-side bucket, not necessarily penalty. |
| `breakdown_other` | Other / أخرى | Sign unresolved. |
| `breakdown_title` | Breakdown / تحليل مفصّل | Section title. |
| `breakdown_subtitle` | Understand your earnings / افهم أرباحك | Explanatory subtitle. |
| `breakdown_cta` | View all bookings / عرض جميع الحجوزات | Drill-down, not money line. |

There is no `breakdown_commission`, `breakdown_supplier_fee`, `breakdown_tax` or `breakdown_net_payout`. Adjacent copy says “You get/keep 100% of your earnings” and “supplier fees settled directly”; this may explain net display but is **not proof of zero take rate or universal applicability**.

Balance/debt mechanics reconstructed from copy [O→I]:

- States distinguish positive “Available to transfer,” zero/current and negative balance; no-outstanding says the captain owes nothing and can accept all booking types.
- Warning sequence: negative/outstanding balance → parameterized approach-to-limit warning including amount to pay → limit crossed → **cash bookings blocked**. “You will still receive card bookings” proves the specific block is **not a whole-account/all-booking ban**. Generic “service disruption” strings have unstated scope.
- Debt vocabulary includes previous underpayment, outstanding previous transactions, full-fare minimum and overpayment maximum checks, negative-balance settlement labels and changing outstanding amount. Not every negative balance is proven to have one cause.
- Repayment paths named: Pay back Careem, settle now/later, Careem Pay, bank-to-Careem transfer and a 12-digit recharge code. One resource describes automatic settlement from default method at a threshold, another recurring maximum settlement under captain policy, and top-up pays outstanding debt before wallet remainder. Whether these mechanisms coexist is unknown; unblock timing is unknown.
- Shipped translation defect retained: English `overpayment_disallowed_dialog_content` says collect a **maximum**, Arabic says `على الأقل` (“at least/minimum”). Do not silently “fix” the evidence.

Payout vocabulary [O] distinguishes cash-debt gates from payout eligibility: insufficient balance, min/max request, daily amount cap, too many requests, daily payout unavailable, Limo-partner exception, pending verification, suspected fraud, missing bank/details and restrictions on delete/update/default method. Positive balance supports transfer now/payout now/auto transfer on date and a primary method. Named destinations include bank, wallet, Careem Pay and cash pickup.

Important constraints from shared resources:

- Earnings transferred to Careem Pay **cannot then be cashed out** and must be used in Careem; this must not be erased by more general copy saying a cash balance can be withdrawn to bank. Different buckets/flows may explain it; static strings do not reconcile them.
- Prepaid-card copy describes transfer from captain cash balance and ATM withdrawal. Cash-pickup copy names a maximum, one free pickup/month then a fee, Lulu Exchange within five days with Emirates ID, and refund of uncollected funds. These are market-specific, **not Palestinian rules**.
- Withdrawal timing includes both “60 minutes” and “one business/working day”; no single SLA can be inferred. `$10 multiples` is another isolated resource, not a universal rule.

Earlier Captain resources also establish booked shifts (`book_shift`, capacity/lock copy), acceptance-rate gates and `arrive_at_pickup_button_text` = “Enter Customer Pin” / `أدخل رمز العميل`. This is a pickup-PIN pattern, not proof of a delivery-proof or server enforcement flow.

**Single strongest idea for Wind:** **an explained bilingual money statement coupled to a parameterized debt threshold and a precise cash-only consequence.** Wind can show trip earnings/tips/bonus/fines/reversals/money-in/out, warn before debt reaches a limit, block only the affected work type, and explain repayment/restoration—without copying Careem's wallet, card, acceptance-rate or exchange-provider stack.

### 4.3 HAAT client 21.0.4, plus Driver/Courier resource evidence

**Artifact/depth.** `com.haat.client` 21.0.4/code 312, **31,651,759 B**, SHA-256 **`52279A92F31FEBAFAC3EAAA7B64348A762E5BB41879E8B1EA318B7DEBD150366`**, 4 DEX. Raw parser 22,115 definitions; REA view 19,025 with only 229 `com.haat.client` classes. Earlier custom pass counted 267 first-party classes; basis differs. It is a thin native client with substantial SDK mass and WebView commerce surfaces, 1,526 Arabic and 1,525 Hebrew strings out of 1,617 base entries in the second pass. First run reached location permission then a no-internet screen; no product screen was observed. The two atlas supplements are static five-class/two-area studies.

#### Address form and checkout implementation

`AddEditLocationActivity` binds:

| Concept | Observed implementation and limit |
|---|---|
| Area/cluster | `customEdtArea`, selected `D:f69`; `apa.getAreaDescriptor()` exposes ID/name. Null area opens picker and returns before Places search (`e0()`); final-save requiredness is unknown. |
| Building number/name | `customEdtBuildingNo`, `a0(String)`, getters and `fieldBuildingNoError`; building name field. Presence/error slots do not prove universal required rules. |
| Street/apartment/floor | Separate fields/getters, raw street/city retained; floor error slot. No universal mandatory check in inspected methods. |
| Location name/type | `customLocationName`, Home/Office/Other. Unknown type hides name; blank Home/Office auto-fills localized home/office. |
| Driver instruction | `noteComponent` (`ComponentOrderNote`), `getDriverInstructions`, error `please_add_note_to_continue` with orange stroke. Predicate that raises it was not recovered; not always required by proof. |
| Coordinates/city | `getLatitude/getLongitude/getCity`; supporting model data. |

`D(apa)` centrally populates all fields, reconciles area ID against list `N().f`, falls back to descriptor/other area field, retains raw values and hands instructions to `N().d(new fpa(driverInstructions))`. `V()` resets inputs/error. On create, Places/map/model observers initialise; edit mode resolves existing location; new location may use stored coordinates/current location/service-area UI. `R` centres map at zoom 16. Current location has permission/enabled checks. No final HTTP save/serializer was visible.

`ClusterSelectionActivity` exists under `.dev`, but none of the five inspected classes references it. Production address flow instead removes `ServiceAreasFragment` and adds R8 `l69` with `service_areas_list,event_source`; another entry calls `kra.g0(...LOCATION_DETAILS_AREA_FIELD)`. Stable area ID is the evidenced selector key; production use/contract of the `.dev` activity is unknown.

`ComponentAddress` is a summary/entry control: delivery shows `getTitle/getSubTitle` + forward icon; pickup shows `getLocationName/getBusinessLocation` + map icon. Delivery type ordinal 0, pickup 1; unsupported delivery type produces `delivery_location` + `add_delivery_location_to_continue`. Exact external click callback is unknown.

**Payment selection:** `ComponentPaymentMethod` has buttons `CASH,CARD,CIBUS,GPAY,TENBIS`, selected `p:bi7`. Server/model entries arrive via `xd1.getPaymentMethods()` (`rv0` items), matched case-insensitively to `bi7.a`. `supported` controls visibility; `isEnabled` controls opacity and disabled selection shows `message`; unmatched/untagged buttons hide. Google Pay also has `setCanUseGooglePay(boolean)`. Tapping current selection does nothing; valid selection resets card presentation, marks exactly one selected and notifies external listener. CARD with no selected card shows insert prompt; saved card hides prompt and shows name/display/image. Changing method locally clears selected-card presentation; owner retention/refetch is unknown. No PAN/tokenisation/charge/cash settlement appears here.

**Place-order CTA gate, exact priority [O]:**

| Priority | Condition | CTA/enabled |
|---|---|---|
| 1 | `chooseLocationRequired` | `CHOOSE_LOCATION`, enabled |
| 2 | `deliveryRestriction.isRestricted` | `DISABLED`, disabled |
| 3 | `z && canReceiveScheduleOrder` | `ORDER_FOR_LATER`, enabled |
| 4 | scheduled OR `canReceiveScheduleOrder` | `ORDER_FOR_LATER`, enabled |
| 5 | restaurant status `ti8.b` or `ti8.c` | `DISABLED`, disabled; associated busy/closed copy, exact enum names R8-limited |
| 6 | `cartValid==false` | `CONTINUE`, enabled |
| 7 | otherwise | `PLACE_ORDER`, enabled |

Location-missing and invalid-cart are progression stages, not disabled buttons. No payment-validity or order endpoint is in this component.

**Card WebView contract:** `CreditCardWebHandler` constructor takes opaque String init data + logger + `Function1<Boolean,Unit> cardSuccessCallback` + optional `Function1<WebViewMessagePayload,Unit> onWebViewData`; `configureWebView` calls `initDataBridge.setupBridge`. Handler reads `getEventName/getData`. A `StatusResult` with event `MessageType.PayloadEvent.CLOSE_WEBVIEW` records result and returns success only when status exactly `"success"`; non-status payload forwards unchanged; other status events do neither. Before a bridge result, any URL containing `"redirect"` is intercepted: query `status=success` → true, `status=cancel` → false, other statuses consumed without callback; after result, superclass handles redirects. `CardUrlFields` exists but is not referenced in the permitted five classes, so its schema/relation to init data is unknown. Server charge/3DS/order submission is not established.

#### Live tracking over MQTT, with explicit fallback

The R8 `i44` current-orders fragment (semantic alias from `[FragmentDeliveriesCurrentOrders]` logs) owns `MqttAndroidClient n0`; manifest declares non-exported `MqttService`.

Credential request: `xo1.a + api/orders/v2/driver-location-credentials/ + orderId`, async callback `uib` branch 15. HTTP 200 JSON keys:

| JSON key | Use |
|---|---|
| `userName` | Stored then `MqttConnectOptions.setUserName`. |
| `password` | Stored then `setPassword(...toCharArray())`; no literal password. |
| `clientId` | Supplied whole to `MqttAndroidClient`; no local UUID/prefix scheme in this path. |
| `topic` | Supplied whole for post-connect subscription; no local template/wildcard/order interpolation. |
| `protocol`,`host`,`port` | Joined exactly `protocol + "://" + host + ":" + port`; concrete values are runtime-only and unknown. |

Connection settings [O]: `MqttAndroidClient(activity,uri,clientId,Ack.AUTO_ACK)`; callback `rt2` before connect; **`setAutomaticReconnect(false)`**, **`setCleanSession(true)`**, username/password from service, `SSLSocketFactory.getDefault()` into `setSocketFactory`. No first-party call in this method sets keep-alive, connection timeout, MQTT version, will or max-inflight; library defaults are not attributed to HAAT. Subscribe only after connect success, service topic, **QoS 0**. Disconnected buffer enabled after connect: size **100**, `persistBuffer=false`, `deleteOldestMessages=true`.

Custom retry: `K()` stop-then-schedule. `Y=1`, multiplier 2, cap 120; `J()` sets `Y=min(Y*2,120)` and posts on main Handler after `Y*1000` ms, giving initial scheduled delay **2 s**, exponential to **120 s**. MQTT lost throwable, connect failure and credential network failure reach it; no maximum-attempt counter appears in `J`; fragment lifecycle/`G/H` gates bound scheduling. `Q()` cancels and resets Y.

Credential HTTP 500 is parsed for `handleSuhailOutOfServiceError`; when `getIsSuhailOutOfService()` is true, fallback polls `api/orders/v2/driver-location/` + order ID. Server `getFetchOrderDriverLocationCallIntervalInSeconds()` can override default **30 s**. Exact log: `[FragmentDeliveriesCurrentOrders] Suhail MQTT service is down, switching to fallback polling`.

Payload parser expects `location → geometry → coordinates`, exactly two entries, index 1 latitude/index 0 longitude; empty/zero/invalid/missing ignored. Valid coordinates update/create `icon_driver_map` marker and fit driver/relevant endpoint. No other fields are consumed. Platform default charset is used. QoS 0 + clean session is not guaranteed delivery; freshness/sequence and last-known semantics remain necessary `[I]`.

#### Environment bootstrap and the “no internet” limit

`zd8.a()` reads Firebase Remote Config key **`dev_list_api_url`** as `DevListApiConfig(url,appType)`. Empty/missing/malformed falls back to **`https://envs-list.haatcloud.com/`**; default app type **`user-new-app`**. `yk1.a()` fetches via `q20`: OkHttp through `FirebasePerfOkHttpClient`, requires success/nonempty body, Gson parses `pb3`.

`EnvListResponse(domains=...)` has `domains:List<String>`. Each string becomes `Cluster(label=domain,url="https://"+appType+"."+domain+"/",isDefault=...)`. Concrete response domains are not embedded. A separate default cluster uses `ai4.s()`/fallback. Static fallbacks:

- `oy.c = https://user-new-app.internal.haat.delivery/`
- `oy.d = https://user-new-app-development.internal.haat.delivery/`
- `oy.e = https://user-new-app-staging.internal.haat.delivery/`

Selection persists exact key **`selected_base_url`**, assigns process-wide `xo1.a`, calls `xo1.p(context)`, logs out Intercom and calls `k91` (broader session semantics unknown). Normal production config from Remote Config key **`haat_client`** also sets `xo1.a`. Chain: selected/Remote Config → `xo1.a` → tracking credential/fallback endpoints.

Two failure surfaces are distinct:

1. Cluster fetch `UnknownHostException`, `SocketTimeoutException`, `ConnectException` yields `Unable to reach cluster API.\nMake sure Tailscale VPN is connected.` Other exceptions use own message/fallback `Failed to load clusters.` This is not the splash dialog in inspected code.
2. Splash schedules **10,000 ms** Remote Config timeout. On `RemoteConfig: Fetch timed out`, cached valid `haat_client` is applied and proceeds; without cache, `SplashActivity.F()` inflates non-cancelable `dialog_no_internet_connection` with “No Internet Connection,” stable-connection instruction and Try again.

Only `yk1.a` references `zd8.a`; non-exported `.dev.ClusterSelectionActivity` drives it. No direct static path to splash `F()` was found. Earlier `envs-list.haatcloud.com` NXDOMAIN is an owner-network observation only. **It does not establish the splash cause, a global outage, an app defect, geo-blocking, decommissioning or ISP blocking.** See §6.5.

#### HAAT Driver and Courier: narrower but real artifacts

`REA/HAAT-DRIVER.md` acquired official Play builds but did **no JADX/runtime**: Driver `com.haat.haatdriver` 9.72/code 132, base 26,313,879 B SHA-256 `594b0425…319c`; Courier `com.haat.courier` 1.1.1/code 8, base 24,449,839 B SHA-256 `883d54b7…e43f1e4`. (Older notes' Courier 1.1.0 metadata is superseded.)

Resources/manifests establish [O]: shift activities/screens, register/release/full/terminated/locked shifts; accept/reject, rejection confirmation, `%s seconds until auto reject`, rejection limits/reasons; pickup code, collect/deliver/arrived screens; balance/daily earnings/history/charge-refund; location services and MQTT components; offline layouts/sounds. They do **not** establish exact timeout/penalty values, assignment algorithm, QR/custody transitions, expected-vs-collected variance, cash close/immutable ledger, offline writes, background cadence or server receipts. Souq—not HAAT resources—is the stronger evidence for those mechanisms.

**Single strongest idea for Wind:** **area ID + map/search point + optional structural details + a first-class driver instruction/landmark**, with validation stated per layer rather than demanding house numbers. The MQTT design adds a second valuable pattern—server-issued per-order connection parameters and explicit polling fallback—to benchmark, not blindly adopt.

### 4.4 Shiply Palestine 1.8530

**Artifact/method correction.** `com.shiplypalestinemobileapp` 1.8530/code 310, `shiply__base.apk` **87,463,616 B**, SHA-256 **`000335d479a369530706d1fd67e8805e0fcdf665a71012a0b22f4a1b7ff8e7fe`**. Product bundle `assets/index.android.bundle` **10,847,624 B**, SHA-256 `eefcb81f91237961a2f1e560e3c07320e882e4098564069e8905e9416d608e62`.

It starts with Hermes magic `c6 1f bc 03 c1 03 19 1f`, declares **HBC version 98**, and is not a UTF-8/Metro-source bundle as the earlier study said. Parser read 41,741 function headers, 68,400 small and 1,051 overflow strings; string storage begins at 949,588. `hermes-dec` 0.1.8 targeted relevant functions but warns v98 is not formally supported, so exact literals are primary. Arabic translation objects/UTF-16 copy are present, e.g. `required_field` = “This field is required” / `هذا الحقل مطلوب`; the earlier “no Arabic product copy” limitation is closed. Static analysis only; no backend or app run.

#### Address model

`buildParcelPayload` constructs:

```text
recipient = { first_name, last_name:"", phone, phone2 }
address   = { city_id, village_id, street_name, latitude, longitude }
```

Recipient name comes from required `recipient_name`; primary phone from `phone_number_select`; optional second from `optional_pure_phone_number`; `last_name` is explicitly empty. Map values `recipientLatitude/Longitude` are renamed `latitude/longitude`. Separate parcel fields: `description,customer_instructions,note,customer_private_note,reference_number`; `is_favorite_recipient` is create-time preference, not default address.

Client rules [O]:

- Recipient name required; primary phone required + valid number (another rule uses `^\d{9}$`); second optional but validated. Arabic-Indic digits normalize; copy also says “Only English numbers are allowed.”
- `city_id`, `village_id` required; `street` required with separate non-form error. Description and shown driver/problem `note` have required + minimum 10 in their respective inputs. Customer instructions have empty rule object; private note has no attached rule.
- Street placeholder rejection includes `.`, `..`, `...`, repeated dashes, `الرئيسي`, `رئيسي`, `لا يوجد`, `لايوجد`; copy warns incorrect street delays delivery.
- **No parcel landmark or default-address key found.** `landmark` occurs only in icon names; `village_note` is not emitted. No house/building/apartment/postcode in parcel address. Export header independently has `City,Village,Street,QR`.
- Edit copy blocks city change once Shipped and says address change requires delete/recreate; same-day activation has its own area guard.

Do not confuse this with store billing `mapAddressToBillingPayload`: `additional,address,address_type:customer,city,company_name,country,default_address,email,first_name,gender,id,last_name,phone,postcode,state,use_for_shipping,vat_id`; `default_address=Boolean(address.is_default)`, endpoint `/customer/checkout/save-address`. That is the only established address-default mechanism and is not the parcel payload.

**Inference:** municipal **city → village → street + optional coordinates + separate notes**. Landmark-first would be an extension, not a field copied from this bundle.

#### Order lifecycle and corrections

Numeric enum [O]:

| ID | Value | ID | Value |
|---:|---|---:|---|
| 1 | `Draft` | 6 | `Delivered` |
| 2 | `Submitted` | 7 | `Returned` |
| 3 | `OnTheWay` | 8 | `Finished` |
| 4 | `AttemptToDeliver` | 9 | `Replaced` |
| 5 | `Pending` (Arabic “عالق”/stuck) | 10 | `Solved` (`Resolved`/`Processed` presentation aliases) |

`Postponed` appears as filter 11 and display/colour state but is absent from the numeric `ParcelStatus` object. `final_parcel_status_id`, `final_status_id`, `finalParcelStatus` are read.

Client-exposed mutations [O; server graph unknown]:

- Draft→Submitted via `{parcel_id,status_id}`; QR sticker preparation may be required. Submitted→Draft on cancel submission.
- Pending→Solved with `note`; return offered for OnTheWay/AttemptToDeliver/Solved → Returned with confirmation.
- Returned + `ParcelPosition.Customer` can continue→OnTheWay, with additional `continueCost` warning.
- Receipt action asks “Are you sure you received this parcel?”; final status metadata is read separately, so no universal hard-coded outcome is assigned.

No literal `final_parcel_status_ids` set, exhaustive terminal list, server transition table or automatic-transition trigger was found.

**Three-attempt correction:** `AttemptToDeliver` and translation `AttemptToDeliver2` = “Second Attempt to Deliver” prove at least second-attempt presentation. No third-attempt status, counter, maximum or automatic escalation was found. Earlier `delivered_1/2/3`, `returned_1/2/3`, `pending_1/2` are **notification channel IDs with matching sounds**, not attempt substates; there is no `delivered_3` channel. `attempttodeliver_three_step` from adjacent text does not prove a three-step model.

#### Cash, order types and service levels

Money direction: normal `Delivery` = “Normal (Cash on deliver),” amount taken from recipient, costs deducted before amount returned/added to invoice. `Pay`/purchase-return = amount paid to recipient, costs added and price deducted from invoice. `is_payment_parcel` and `is_paid_using_visa_card` exist; card display is not proof of cash settlement.

Distinct money concepts [O]:

- Collection/content: `total_price,actual_price,expected_collected_value,additional_cost/additional_costs`.
- Delivery: `parcel_delivery_cost,main_delivery_cost,delivery_cost,returned_delivery_cost,extra_delivery_cost,price_extra_fee,size_fee,total_delivery_costs,continueCost`.
- Card: `cc_payment_fees`.
- Net: `net_collection` = “Parcel Price − Total Delivery Costs.”
- `actual_price` is declared contents value when different from amount collected; do not conflate COD and parcel value.

Wallet/ledger surfaces:

| Mechanism | Observed client contract |
|---|---|
| Wallet | `GET /wallet`; `PUT /wallet/{id}/parameters` |
| Transactions | `GET /wallet-transactions/`; `POST /wallet-transactions/request` with `wallet_number,type,method`, conditional `authorized_recipient`; UI `DEPOSIT/WITHDRAW`, amount/isAll/balance-before/hold |
| Request/transaction metadata | `/wallet-transaction-requests/`, `/methods`, `/statuses`, `/types`; `/wallet-transactions/statuses`, `/types` |
| Holds/debts | `GET /wallet/hold-amount-details` tabs parcels/withdrawals/current debts; `GET /debts?from&to`, `/debts/statuses` |
| Invoice | `GET /customer-invoices/current-amount` |
| Financial differences | `exceptions + total` on parcels/returns/invoices; `/customerInvoices/getCustomerInvoiceExceptions`, `/addInvoiceException`, exception types/statuses, `/create`; `financial_differences_related_to_this_parcel` |

Wallet copy describes moving unreceived/new invoice values into balance; hold = Pay/Buy parcels + in-progress withdrawals. Sales forms have `fixed_commission_value` and `percent_commission_value` (0–100), invoice column and `total_collected_money,current_commission`. Separate card commission uses PATCH `/users/agree-to-cover-visa-commission`, `visa_commission_value`, `agreed_to_cover_visa_commission`. Actual ledger schema, settlement timing and numeric tariffs remain unknown.

Exact order-type axis:

| ID | Selector | Internal | Meaning |
|---:|---|---|---|
| 1 | `Delivery` | `SendParcel` | Normal COD |
| 2 | `Pay` | `PaymentParcel` | Pay |
| 3 | `Replace` | `ReplaceParcel` | Replace/remaining items |
| 4 | `Return` | `PurchaseParcel` | **Buy or Bring**; there is no separate `Buy` enum |

`is_replacement,partially_received,is_completely_received` affect replacement/receipt.

Same-day/JAYEEK is orthogonal: `delivery_method_object.key=normal|same_day`, `SameDayType=SAME_DAY`, gated by `same_day_enabled` + `CAN_MANAGE_JAYEEK_PARCELS`. Eligibility states `NO_AREA,READY,NOT_AVAILABLE,AVAILABLE,CHECKING,SELECTED`; flags `is_same_day_delivery_supported,can_pickup_only,can_be_scheduled_for_next_day,has_supported_source_address_for_sdd,has_supported_destination_address_for_sdd`. APIs `GET /same-day-delivery/check`, `/check-revert/{...}`, `/related-data`; upgrade `mark_as_same_day_delivery:true` (+optional `ignore_pickup_only`); revert `revert_same_day_delivery:true`, `keep_same_day_delivery_cost:false` or helper equivalent. A cannot-revert message coexists with real revert path, so conditions are data-driven; JAYEEK branding does not prove a third-party carrier.

Fees: `/parcels/fees {village_id,cost_map_type,parcel_type_id}`; `/parcels/calculateSizeExtraFee`; weight bands **0–5,5–10,10–20,20+**, default 5; dimensions width/length/height. Price threshold can add `price_extra_fee`; no hard-coded tariff, same-day price or numeric percentage was found.

#### Delivery proof, driver, offline and tracking

**QR/proof:**

- Scanner restricts `barcodeTypes` to `qr`; ML Kit registrar ships. Lookup `/parcels/getParcelByQRCode`, `/parcels/findByQRCode`; sticker `/parcels/addQRCode`; preparation may require scan or “I don't have QR sticker”; invalid/success copy exists; `ParcelScans` exposes scan history.
- Share links `shiply://parcels/id=…`, `shiply://parcels/qr=…`; manifest also `/p` web links. Guest tracking accepts parcel number/QR; parser understands `c=`, `?shiply`, `=shiply`.
- Sender receipt confirmation and permission-gated `partially_received/is_completely_received` (`CAN_SET_PARTIALLY_RECEIVED_PARCELS`): partial changes remaining items to Replace, complete to Normal/COD.
- `deliveredByUser`/`delivered_by_user` identifies associated actor, not recipient cryptographic confirmation.
- **No product delivery/recipient/handover OTP, PIN, signature or confirmation-code field found.** `authorized_recipient` belongs to wallet withdrawal. QR identity/lookup alone is not proof of delivery.

**Driver integration in this customer build:** `/users/{id}/deliver-receive-preferences` GET/PATCH; assigned primary/secondary/receiving drivers, active state, office vs Shiply driver, vehicle nickname/plate/make/model/colour. `GET /tasks/driver-details/{id}` has one retry, no cache (`staleTime:0,gcTime:0`). `POST /parcels/changeParcelStatusPositionDriver`; `DriverNoteBox` reads `driver_note,note,pending_attachments`; problem mutation may include note.

No driver earnings, settlement IDs/status/amount, job board, ready queue, offer/accept, shift start/end or driver-job endpoints found. Shared constants `LocationInterval:20000`, `LocationUploadInterval:60000`, `driverRefreshRateInterval:300000` had no references beyond declaration and do not prove GPS/queue. Wider Shiply driver product cannot be decided from this APK.

**Offline/retry:**

- Real user-scoped local create draft: `saveCreateParcelDraft` JSON `setItem`, load `getItem`+parse, clear `removeItem`; key `createParcelDraft`; debounce via `setTimeout/clearTimeout`, “Restore draft?”. Change detection covers description, instructions, weight, recipient/street/phones, price/reference, notes, city/village/date. Defaults for description/instructions also persist.
- Query-specific retry: parcel ID 0, QR 3, size fee 1, driver details 1, wallet requests 1. React Query offline/reconnect code is not a product outbox.
- `forceDuplicate` plus “recipient already has a parcel” confirmation and separate `DUPLICATE_REQUEST` throttle are not idempotency keys. Network handlers recognize `Network Error`, `ERR_NETWORK`, 504 with connection/timeout copy.
- **Correction:** “Error sending. Event queued.” is Sentry transport beside `x-sentry-rate-limits`, `retry-after`, envelope/replay logic—not parcel writes. `offlineMode` also appears as a react-native-maps tile option; global `offlineMode:false` has no demonstrated product use.
- No `idempotency`, `Idempotency-Key`, request UUID, parcel mutation outbox, offline write replay or parcel-sync endpoint found.

**Push/tracking:**

- Native `ReactNativeFirebaseMessagingService`/FCM + Notifee. Auto-init true, notification delegation false, default channel ID empty.
- JS channels at HIGH importance: `default,normal,pending,delivered,pending_1,pending_2,delivered_1,delivered_2,returned_1,returned_2,returned_3,ticket_update_1`; sounds default/success/pending and matching numbered names.
- FCM token requested/stored; Android notification permission; sends `device_token` to `/auth/notification/saveDeviceToken`, `/notification/linkDeviceToken`, `/notification/unlinkDeviceToken`; options `/notification/getNotificationOptions`, `/updateNotificationOptions`.
- Foreground data JSON displays title/body toast, vibrates and invalidates parcel/invoice/wallet/promotion/notification/dashboard queries. Routing supports `user_email` (direct PII), `account_region`, `parcel_code`, `invoice_id`, `transaction_number`, `promotion_id`, `announcement_id`, `ticket_id`, `action_parameter_1`, `title/body/message`, plus possible wallet amounts/balances/status metadata. This proves **PII-capable** handling, not what production senders actually include.
- Proven tracking is status/history/scan history, notifications, guest code/QR and deep links. No used driver-location upload, live polyline, GPS subscription or external navigation handoff was established; “real time” marketing and unused constants are insufficient.

**Single strongest idea for Wind:** **represent delivery money as named deltas and holds, not one COD scalar.** Keep recipient amount, declared parcel value, delivery/return/size/card fees, net collection, debts, holds and invoice exceptions distinct. Pair that with its municipal address/QR identity patterns, but do not invent an offline outbox, driver workflow, recipient OTP or three-attempt machine that this artifact does not prove.

### 4.5 Souq Tulkarm 1.0.2

**Artifact/method.** `ps.souqtulkarm.app` 1.0.2/code 3, `souqtulkarm__base.apk` **4,153,798 B**, SHA-256 **`27dd269784d7ff81a87146455d4fd8011d57b556f8a23f7a896a62fc0aa88478`**. Main evidence `assets/public/assets/index-Bh9QEjtC.js`, 654,679 UTF-8 B/618,519 decoded characters: Vite + React in Capacitor, minified and without `.map`. `JS @n` means decoded-character offset. Static analysis only.

Six corrections to the earlier study govern everything below:

1. `totalCents` is recovery metadata, **not sent** in `POST /orders`; only `s.payload` is posted.
2. Saved-address create is `{label,zoneId,addressLine,landmark,isDefault}`; no `notes`, and no edit call found. Checkout `notes` means note for shop.
3. Outbox is opt-in through `queueAs`, concentrated on driver custody/delivery/cash; not every write.
4. Main shop order enum has exactly ten statuses; shift/custody/alert tokens are not extra order statuses.
5. Shift polls every 10 s; ready queue reloads on active status and `order_updated,custody_updated,fleet_updated`, not directly every 10 s.
6. Admin proof reset is offered for admin + `IN_CUSTODY`, not a visible `deliveryProofLocked` field; driver learns lock via `PROOF_LOCKED`; no failed-attempt threshold is shipped.

#### Address models

Saved address create [O]:

```text
POST /addresses {label,zoneId,addressLine,landmark,isDefault}
```

No `notes,id,lat,lng,postcode,street-number,building/floor` in the request; empty landmark remains `""`. `zoneId` required; trimmed `addressLine` length ≥5 (untrimmed state is posted); landmark optional; `isDefault` initially false. `label` is visually required but has no non-empty/minimum Save guard or input `required` attribute. Failure uses server message or `تعذر حفظ العنوان.`; success `تم حفظ العنوان.` Server requiredness/trimming/limits are unknown.

`GET /addresses` supplies the book; checkout selects first default else first and copies line/landmark/zone. List renders `label,addressLine,zoneNameAr` and default marker. Delete is `DELETE /addresses/${id}` with success copy, no idempotency option. Census found list/create/delete only—**no saved-address edit/update endpoint found**.

Checkout order body [O]:

```js
{
  items: lines.map(e => ({productId:e.productId,quantity:e.quantity})),
  zoneId, windowId, deliveryDate, addressLine,
  landmark: landmark || undefined,
  notes: notes || undefined,
  substitutionPolicy,
  saveAddressLabel: saveAddressLabel || undefined
}
```

Outer local recovery record is `{idempotencyKey,totalCents,payload}`; HTTP call posts only `payload` with the key in `Idempotency-Key` header. `totalCents` and key are not JSON body members. Address line required/minLength 5/trimmed guard; zone/window/date and zone minimum also gate. `notes` is `ملاحظة للمحل`, optional; `saveAddressLabel` optional, with no `isDefault` in order body. Detail hint includes street/building/floor as free text, not structured fields; landmark hint says it helps the driver arrive faster.

A separate community-listing delivery model posts quote to `/community/markets/{marketId}/listings/{listingId}/shipping/quote`:

```text
{pickupCity,dropoffCity,option,shared:false,pickupNote,dropoffNote}
```

Cities come from `/community/shipping/config`; pickup/dropoff notes required/trimmed/max 200; option `small|medium|large`, default small. This city-pair + notes + size model must not be merged with the shop address schema.

#### Cash: collection, handover, physical count and corrections

| Stage | Exact observed request and queue behaviour |
|---|---|
| Delivery | `POST /driver/delivery/confirm {orderId,proofInput,amountCollectedCents,discrepancyReason,...optional lat/lng}`; reason undefined when amount equals due; idempotency + `queueAs`. |
| Driver handover | `POST /driver/cash/handover {shiftId,handoverAmountCents:Math.round(Number(i||0)*100),notes}`; notes sent even empty; idempotency + `queueAs:"تسليم نقدية الوردية"`. |
| Admin settle | `POST /admin/cash/settle {shiftId,countedAmountCents,resolutionNotes:notes||undefined}`; **no idempotency/outbox**. `status==="CLOSED"` closes modal; other status leaves it open with info toast. |
| Admin adjustment | `POST /admin/cash/adjust {shiftId,amountCents,reason}`; signed amount, negative deducts/positive adds, reason trimmed ≥3; no queue/key. |
| Reads | `GET /driver/cash`, `GET /admin/cash`; driver shift summary/deliveries, admin shifts + `ledger[]`. |
| Forced shift close | `POST /admin/shifts/${shiftId}/close {reason}` trimmed ≥3; moves to awaiting count per copy, does not settle cash. |

Exact product rules [O]:

- `القيود لا تُعدَّل ولا تُحذف. أي تصحيح يُسجَّل كقيد تسوية جديد باسمك وبسببه.` — entries are not edited/deleted; every correction is a new attributed, reasoned settlement entry.
- `استخدم قيمة سالبة للخصم وموجبة للإضافة. القيد يُضاف ولا يعدّل أي سطر سابق.` — signed adjustment adds, never edits.
- Driver cannot edit a recorded amount or mark cash received; counting/closing is admin-only. Privacy/role page says admins cannot delete custody/cash records either.

These literals and lack of client edit/delete endpoints strongly show intended design, not database enforcement or absence of privileged server tooling.

Ledger rows render `id,type,orderShortId,driverName,notes,amountCents,createdAt`; signed amount. Types: `EXPECTED` (متوقع), `COLLECTED` (محصَّل), `HANDOVER_SUBMITTED` (سلّمه السائق), `COUNTED_BY_ADMIN` (عدّته الإدارة), `ADJUSTMENT` (تسوية). `CASH_VARIANCE` is an admin-pulse alert, not a ledger type; `PENDING_SETTLEMENT` is shift state, not order status.

Three separate variances:

1. At door: `amountCollectedCents - (finalTotalCents ?? totalAmountCents)`; signed discrepancy and required reason when nonzero. Reasons: `PARTIAL_PAYMENT,CUSTOMER_DID_NOT_PAY,APPROVED_DISCOUNT,RETURNED_ITEMS,INCORRECT_CASH,OTHER_ADMIN_REVIEW`.
2. Driver declaration vs recorded collection: `handedOverCents-collectedCents`; admin is told to count physically before close.
3. Physical count vs recorded collection: `countedAmountCents-collectedCents`; driver also sees server `countedCents,varianceCents` when counted.

**Client/copy mismatch:** settlement copy says `resolutionNotes` is mandatory on physical variance and UI marks it required, but button has no notes-based disabled guard and empty notes are omitted. Server rejection is unknown.

#### Delivery proof

- Customer order exposes `deliveryCode` and `deliveryQrToken` only when code exists and status `PACKED_READY` or `IN_CUSTODY`. Numeric code and QR both feed driver's single `proofInput`.
- Copy says code/QR is required to close delivery and “belongs to you alone and does not contain your name, address or order amount.” Token contents/entropy/signing were not verified.
- Driver copy requests a four-digit code or customer QR and says location alone does not close delivery. Payload optionally adds lat/lng if geolocation succeeds. Button requires `IN_CUSTODY`, nonempty proof, finite nonnegative collection, discrepancy reason when needed, and no local lock. **Manual input checks only nonempty, not four digits.**
- Package credential `package.qrToken ?? package.shortCode` is distinct from `deliveryQrToken`; bag label can include customer name/zone, so token privacy copy does not cover the bag.
- Lock is known only from API `PROOF_LOCKED`; driver disables confirmation and offers refresh after shop review. Attempt count/duration/persistence unknown.
- Admin on `IN_CUSTODY` can `POST /admin/orders/${orderId}/proof-reset {reason}`; maxLength 500, trimmed ≥5. Copy explicitly says reset reopens attempts but **does not confirm delivery**. Audit label `DELIVERY_PROOF_EXCEPTION` and history fields `toStatus,reason,createdAt` exist; actual server audit on every reset and server-side role filtering are unverified.
- Role copy says driver sees assigned orders during shift and never customer delivery code/other customers; driver UI indeed does not render `deliveryCode`.

#### Driver shifts, ready queue and custody

Shift calls: `GET /driver/shift`; `POST /driver/shift/start {vehicleScan,...optional lat/lng}` with idempotency but no `queueAs`; `/driver/shift/location`, `/tracking`, `/location-health`. Only `ACTIVE` exposes custody/route/transfer/return and loads `GET /driver/ready-queue`. Vehicle copy says scan proves which vehicle and enables location only during shift. `PENDING_SETTLEMENT` says new shift can start after previous closes, but scan button is not disabled by that flag; actual server decision unknown.

Shift refreshes every 10 s and on `fleet_updated`; ready queue refreshes on active status and order/custody/fleet events. Queue fields used: `packageId,shortCode,mine,selectable,blockedReason,customerName,deliveryAddress,zoneNameAr,windowTitleAr,amountDueCents`; `mine` and blocked reason are displayed. `POST /admin/dispatch/assign {packageId,driverId}` allows null unassign, working on `PACKED_READY` + active fleet. `driverSelfSelect` chooses driver-selection vs admin-only assignment; actual enforcement is server-side.

`GET /driver/route` shows custody sorted by zone and sums due. Opening delivery fires `POST /driver/delivery/approaching {orderId}`, errors deliberately ignored; this is a milestone, not an order status.

| Scan/action | Request and meaning |
|---|---|
| `VEHICLE` | `/driver/shift/start {vehicleScan,lat?,lng?}`; associates vehicle/activates shift UI. |
| `CUSTODY` default | `/driver/custody/scan {scan,lat?,lng?}`, `queueAs:"استلام طرد"`; bag QR/manual short code; `ALREADY_IN_CUSTODY` is informational. |
| `OFFER` | `GET /driver/peers`, then `/driver/custody/offer-transfer {scan,toDriverId}`, queued; does not immediately move custody or expected amount. Recipient must scan; then two-scan chain and amount moves. |
| `TRANSFER` | `/driver/custody/transfer {scan,lat?,lng?}`, queued; recipient accepts offered parcel. |
| Driver `RETURN` | `/driver/custody/return {scan,reason,lat?,lng?}`, queued, reason ≥3; request only, parcel/expected amount stays with driver until shop scan. |
| Shop return confirmation | Same endpoint with `{scan,reason,orderId}` and idempotency only; copy says scan transfers custody to shop. |

Manual entry is recorded. `GET /orders/{id}/custody-chain` rows: `action,createdAt,actorName,vehicleName,source,latitude,longitude,notes`; sources `QR_SCAN,SHORT_CODE,ADMIN_ACTION`. Custody actions, separate from order statuses: `PACKED,ACCEPTED_BY_DRIVER,TRANSFERRED_OUT,TRANSFERRED_IN,DELIVERED,RETURN_REQUESTED,RETURNED_TO_SHOP,VOIDED`.

#### Main shop order lifecycle: exactly ten statuses

The client display map is observed; target transitions below are inference from actions because the server writes actual state.

| Status | Label and client-visible writer |
|---|---|
| `NEW` | New order; inferred initial after `POST /orders`; packing start only here. |
| `PACKING` | `POST /packing/{id}/start` from NEW. |
| `AWAITING_DECISION` | Packing creates substitution/price approvals; customer/admin `POST /approvals/{approvalId}/decide {approve}` or `{approve,note}`. Exact post-decision target not literal. |
| `PACKED_READY` | `POST /packing/{id}/finish {}` with zero pending approvals; issues label; dispatch queries this state. |
| `IN_CUSTODY` | Driver bag scan/accepted transfer; delivery confirmation enabled only here. |
| `DELIVERED` | Successful proof+cash confirm; code display gate no longer matches. |
| `DELIVERY_FAILED` | `POST /driver/delivery/fail {orderId,reason,note,lat?,lng?}`; physical package can remain `IN_CUSTODY`, so failure and custody are separate axes. |
| `RETURNED` | Shop confirms physical return with second custody-return scan; only then reissue/cancel decisions appear; order does not close itself. |
| `CASH_SETTLED` | Cash-closed display associated with `/admin/cash/settle`; exact per-order DELIVERED→CASH_SETTLED server rule not in JS. |
| `CANCELLED` | `POST /orders/{id}/cancel {reason}` trimmed ≥3. Customer only NEW; admin also PACKING/AWAITING_DECISION/PACKED_READY/RETURNED. Copy says void label, release stock, retain reason. |

`POST /packing/{id}/reissue {}` from RETURNED uses idempotency and new label; exact target unknown. Approaching adds no enum value. History has `events[].toStatus,reason,createdAt`, not a complete allowed-transition table.

Typed **delivery-failure** reasons (six): `CUSTOMER_UNREACHABLE,CUSTOMER_REFUSED,WRONG_ADDRESS,ACCESS_BLOCKED,CUSTOMER_RESCHEDULED,OTHER`; reason required, note free text, no collected amount recorded. Item states (not order states): `CONFIRMED,SHORTAGE,SUBSTITUTED,REMOVED`; packing can post `finalWeighedQuantity,itemStatus,substituteProductId`; approvals have `PENDING,detailAr,deltaCents`, audit `APPROVAL_ACCEPTED/REJECTED`.

#### Separate community-listing delivery lifecycle: 15 values

This Wind-labelled flow is not the grocery enum:

| Status | Arabic label / observed writer |
|---|---|
| `awaiting_seller` | بانتظار البائع; inferred initial after buyer quote/trip/requestId; seller decides. |
| `approved` | وافق البائع; seller `/community/shipping/{requestId}/decision {approve:true}`. |
| `submitting` | جارٍ تأكيد التوصيل; display/confirmable, exact writer/target unknown. |
| `booked` | تم تأكيد التوصيل; display only. |
| `declined` | رفض البائع الطلب; seller `{approve:false}`. |
| `searching` | بانتظار سائق; display, cancellation eligible. |
| `assigned` | تم تعيين سائق; display, cancellation eligible. |
| `at_pickup` | السائق عند الاستلام; external/driver writer absent. |
| `in_transit` | الطرد في الطريق; display only. |
| `completed` | تم التسليم; tracking link no longer offered. |
| `cancelled` | ملغي; inferred from `/cancel {}` at eligible stage. |
| `cancel_requested` | جارٍ إلغاء الطلب; exact staging unknown. |
| `on_hold` | تعذّر التسليم — بانتظار ويند; awaiting Wind operator, resolution writer absent. |
| `returning` | الطرد عائد للبائع; display only. |
| `returned` | أُعيد الطرد للبائع; seller may see separate `returnCode`. |

Buyer flow: quote → seller decision → buyer `/confirm {}` → eligible `/cancel {}`. `/track {}` returns `{url}` opened for map tracking and does not advance state. `handoverCode` and `returnCode` are distinct from grocery `deliveryCode/deliveryQrToken`; no QR token for them is visible in this module.

#### Offline and idempotency: actual scope

`souq.outbox` in `localStorage` is a JSON array. Record shape:

```text
{id,scope,method,path,body,label,queuedAt,attempts}  // later optional error
```

- `id` is idempotency key, normally `crypto.randomUUID()`; `scope=JSON.stringify([session.id,session.storeId,session.role])` and also `X-Actor-Scope`; body parsed JSON/null; label human `queueAs`; queuedAt `Date.now()`; attempts starts 0.
- Requests can carry bearer, actor scope and `Idempotency-Key`; fetch timeout **20 s** via `AbortSignal.timeout`.
- Network/read failure enqueues only with `queueAs`; HTTP 429 and ≥500 also enqueue. Other HTTP errors do not enter this queue.
- Same scoped key with different method/path/body throws `IDEMPOTENCY_CONFLICT` (`الإجراء المحفوظ له بيانات مختلفة...`); identical record is not duplicated. Queued user code `QUEUED`; storage failure `QUEUE_STORAGE` tells user to keep page open.
- Replay is sequential on browser `online`, signed-in online session and manual resend. Retryable: network/status 0, 401, `SESSION_CHANGED`, 429, ≥500; attempts increment and flush stops after retryable failure. Other errors remain with `error` and are excluded from automatic replay.
- UI lists pending actions with human label/time, explicitly says server has not confirmed them; deleting a rejected action deletes only unsent local intent after confirmation, not a ledger entry.
- Legacy unscoped records require review, mask alphanumeric label content and explicit confirmation they belong to current account before recovery.

Exact queued labels: `استلام طرد`, `تحويل عهدة`, `طلب إرجاع طرد`, `عرض تحويل طرد`, `تسليم الطلب ${shortId}`, `تعذر تسليم ${shortId}`, `تسليم نقدية الوردية`. Admin settle/adjust, address writes, cancellation, shift tracking and many other mutations are not covered.

Service worker has `activate,push,notificationclick` only—no `fetch` or `sync`; no evidence of service-worker background outbox replay. Mounted React provider owns replay; real WebView background execution is unknown. Bodies including proof/cash are plain JSON in localStorage with no outbox encryption; native encrypted session is separate; device-compromise impact untested.

Separate recovery mechanisms:

1. **Shop checkout:** `localStorage["souq.checkout.${session.id}.${session.storeId}"]` stores `{idempotencyKey,totalCents,payload}` before request; same key on retry, removed on success and most definitive 4xx except 401/408/429/`SESSION_CHANGED`/`IDEMPOTENCY_CONFLICT`. Loader validates key/items/required strings/safe integer total. Copy explicitly says continuing uses same request to avoid duplicates.
2. **Listing delivery:** `sessionStorage["souq.shipping-request.${userOrGuest}.${marketId}.${listingId}"]` stores `{trip,price,requestId}`; submit body adds `quotedPrice,requestId`. `requestId` is body field, not an `Idempotency-Key` header in this call; server idempotency is inference. Rotates after success/definitive rejection.
3. **Shop/community chat:** separate session drafts `{content,clientId,pending}`; shop uses clientId as HTTP key, community sends it in body.
4. **Delivery proof:** UUID created once in component state for screen retries; queued replay uses persisted queue ID.

#### Fees, promotions and order types

- Shop money uses integer `…Cents`, divided by 100 with two decimals and ₪; input returns via `Math.round(Number(value)*100)`.
- Estimate `subtotalCents=sum(round(priceCents*quantity))`; display subtotal + `selectedZone.deliveryFeeCents`; `minOrderCents` gates. `/public/schedule?zoneId&days=7` returns dates/windows with `selectable,remainingCapacity,cutoffTime,disabledReason`.
- **Computed `totalCents` stays local for recovery and is not posted**, consistent with server-authoritative pricing `[I]`; actual calculation/validation unknown. Responses read `subtotalCents,deliveryFeeCents,totalAmountCents,finalTotalCents?`; labels distinguish estimated/final cash. Driver due uses final else estimated.
- Zone admin `{zoneId,nameAr,deliveryFeeCents,minOrderCents,activeDays}`; new-form defaults 5.00/30.00 are **not deployed tariffs**. Window admin `{windowId,titleAr,startTime,endTime,cutoffTime,capacityOrders}`; vehicle `capacityBoxes` and store `maxStopsPerVehicle` are separate.
- `priceTolerancePct` describes increases requiring customer approval. Substitution choices: `NO_SUB`, `CONTACT_FIRST`, `BEST_EQUIVALENT`; approvals expose signed `deltaCents`.
- Listing quote uses `price/quotedPrice/order.price`, not cents; delivery price separate from item price. `shared` hardcoded false, sizes small/medium/large. Formula, minor units, payment method and COD are unknown.
- Daily catalogue override: `basePriceCents,priceCents,discounted`; admin `/admin/catalogue/availability {productId,isAvailable,priceOverrideCents}`; blank→null, otherwise finite >0. `APPROVED_DISCOUNT` is a door variance reason, not proof of coupon entity.
- **No promo-code client flow found:** zero `coupon,promoCode,promotion` and no `orderType/order_type`; two `promo` hits are CSS classes; no coupon endpoint in 167-call census. Server-only promotion cannot be ruled out. `MARKET_OFFER` negotiation is not a coupon.
- Three flows are distinct: shop `POST /orders` with zone/window/COD/custody; community listing shipping with seller approval and separate lifecycle; direct community sale where parties meet/pay directly, not another COD ledger type.

Earlier study also observed tracking health `trackingActive,lastLat,lastLng,driverLocation.updatedAt`, `STALE_LOCATION,LOW_BATTERY`, and copy that shop sees “tracking paused” instead of a stale pin, plus battery/permission health. External navigation uses Google Maps query from coordinates/address. These are useful patterns but still client evidence, not measured delivery reliability.

**Single strongest idea for Wind:** **a scoped, idempotent, human-labelled offline outbox for the writes that must not be lost—custody, delivery and driver cash—with sequential replay and conflict/session handling.** Its append-only ledger, customer proof and multi-axis states reinforce that design, but Wind should not copy universal queueing, unencrypted sensitive payloads, Capacitor background limits or the marketplace surface.

## 5. Cross-app comparison

“Proves” below means proves presence in the named shipped client, not production/server behaviour. `—` means not established by these studies, not proven absent from the company.

| Feature | Uber | Careem rider + Captain | HAAT + Driver/Courier | Shiply | Souq Tulkarm |
|---|---|---|---|---|---|
| **Address model** | **Uber proves:** anchor POI request/response, `MobileAnchor`/`TripDestinationAnchor`, `SavedPlace`/`SuggestedPlace`, `POICache`. Narrow method cannot bind proto fields or recover POI enums. | **Rider proves:** 16-field `Address`, only `id/location` constructor-non-null; map/nickname/building-type/notes/photo resource components; area/building/number validation copy without found call site; separate search/save DTOs and gateways. | **Client proves:** area required before Places search; optional structural fields; driver note with error state and explicit handoff; stable area ID. Earlier resources explicitly say no building number can be handled by instructions. | **Bundle proves:** parcel `{city_id,village_id,street_name,lat,lng}` + recipient/phones + separate notes; required municipal fields/street; coordinates; no parcel landmark/default/house number found. Store billing address is a different model. | **JS proves:** saved `{label,zoneId,addressLine,landmark,isDefault}`, zone + trimmed line ≥5, optional landmark, no edit found; checkout adds notes/save label; separate listing city-pair + required pickup/dropoff notes + size. |
| **Order lifecycle** | **Uber proves:** rider-offer `GenericRiderOffer` identity/view/trip states/relative+absolute deadlines; accept/reject/ack/expire and typed error slots. It is not a parcel state machine. ETA range/accuracy/validity are separate contracts. | **Rider proves:** named booking step workflows and `OsirisBookingStatusMapper`, not a recovered full order enum. **Captain proves:** shift/acceptance/pickup-PIN resources only. | **Client proves:** checkout CTA priority/gates and two-value local `CartStatus` (`InProgress`,`Completed`) in earlier pass; rich server state is not recovered. Driver resources prove offer/collection vocabulary, not a full graph. | **Bundle proves:** 10-value numeric enum + Postponed presentation 11, explicit client mutations, distinct final fields. Only second-attempt presentation; no server transition graph or three-attempt rule. | **JS proves:** exactly 10 shop states, 8 custody actions, item/approval/shift/cash axes, six delivery-failure reasons, and a separate 15-value listing-delivery lifecycle. Server targets/guards remain unknown. |
| **Cash and money** | **Uber proves:** broad `PaymentProfile`, cash/arrears/change model names and Arabic COD/arrears/no-change copy. No runtime eligibility or settlement. | **Rider proves:** integer `CASH=6`,`CASH_COLLECTION=5` plus separate shared enum and booking cash flag; exact error-code mapper. **Captain proves:** explained earnings, negative balance, parameterized warnings, cash-only block, repayment/payout vocabulary. Palestine enablement unknown. | **Client proves:** CASH/CARD/CIBUS/GPAY/TENBIS availability/enablement/selection and card WebView callback contract. No cash settlement/charge proven. Driver resources prove balance/history surfaces, not reconciliation. | **Bundle proves:** COD direction, Delivery/Pay/Replace/Return(Buy), many value/fee/net fields, wallet/holds/debts/invoice exceptions and same-day fee inputs. No authoritative ledger/tariff. | **JS proves:** integer cents; actual collected amount + six discrepancy reasons; handover→admin count; five ledger types, signed append-only adjustments and three variance calculations. Server immutability and some required-note enforcement unknown. |
| **Delivery proof** | Not established in these atlas studies. | Captain `Enter Customer Pin` at **pickup** is observed copy; it is not delivery proof or a runtime contract. | Driver `Pickup code` and collection/delivery resources exist; no QR/custody or recipient-proof flow established. Client supplement does not establish delivery proof. | QR identity/attachment/lookup, scan history, receipt confirmation, partial/complete flags and actor field. No recipient OTP/PIN/signature found; QR alone is not POD. | Customer `deliveryCode`/`deliveryQrToken` → driver `proofInput`; required in `IN_CUSTODY`, no name/address/amount per copy, `PROOF_LOCKED`, reasoned admin reset that does not bypass proof; package QR is a distinct credential. |
| **Driver model** | Rider offer contracts only; no driver artifact here. | Captain booked-shift/acceptance/arrival resources, earnings/debt/payout taxonomy; cash block can leave card bookings available. Actual server policy/market unknown. | Driver/Courier manifests/resources prove registered shifts, timed/rejection-limited offers, collection/delivery, balance and location/MQTT surfaces. Algorithms, custody and cash close unknown. | Customer build proves assignment/preferences, driver details, position/note integration only. No jobs/earnings/settlement/shift/queue found; separate driver artifact needed. | Active shift via vehicle scan; event-refreshed ready queue; self-select or admin assign; route by zone; VEHICLE/CUSTODY/OFFER/TRANSFER/RETURN; queryable custody chain; shift cash handover/count. |
| **Offline / retry** | Polling/push offer plumbing and `POICache`; no general offline mutation outbox established. Retry semantics of offer errors unknown. | No offline/outbox mechanism established in the two-area rider study or Captain resource study. | MQTT auto-reconnect off; custom 2 s exponential→120 s retry, buffer 100 nonpersistent, QoS0 clean session; HTTP 500 fallback polling default 30 s. No offline write queue proven. | Real user-scoped create draft; per-query retry 0/1/3; duplicate confirmation/throttle. No parcel idempotency/outbox/replay found; Sentry “queued” and map `offlineMode` were false leads. | Opt-in scoped durable outbox for custody/delivery/cash, idempotency conflict protection, sequential replay and human labels; checkout/listing/chat separate recovery. Admin and many writes not queued; no service-worker background replay evidence. |
| **Tracking transport** | Offer push/Ramen + polling types, data-driven polling cadence; not proof of live vehicle tracking transport. Map engine defaults Uber with Google fallback in earlier full study. | Order-tracking model split by map/status/payment/navigation and explicit server-status mapper; map interface with Google implementation. Actual live transport unknown. | Per-order server-issued MQTT credentials/topic/client ID, TLS socket factory, QoS0, custom retry + polling fallback. Driver apps also declare location/MQTT components. Runtime broker availability unknown. | FCM data + Notifee channels, query invalidation, status/scan history and guest QR/code/deep links. No used driver GPS upload/subscription/live polyline established. | Driver shift location/tracking/health endpoints, last-location freshness/battery/permission degradation, listing map-track URL; Web Push service worker rather than native FCM. Runtime delivery/background reliability unknown. |

### 5.1 What to adopt without copying the wrong product

| Pattern | Best evidence | Wind-shaped use |
|---|---|---|
| Unified anchored places | Uber POI + Saved/Suggested + cache | One contract for nearby points, saved addresses and consented learned handover points; partial group failure and cache for 3G. |
| Human address, machine zone | Souq + HAAT + Shiply; Careem photo as optional addition | Required enabled area/zone + exact confirmed pin where available + human line/landmark/driver instructions; optional structural fields/photo, never mandatory postcode/apartment. |
| Multi-axis state | Souq; Wind already separates several concerns | Keep fulfilment, physical custody, proof, payment and cash reconciliation separate. A delivered order may still have unsettled cash; failure does not mean parcel returned. |
| Append-only, explained money | Souq + Careem Captain + Shiply | Integer minor units, actual collected amount and variance reason, attributed correction entries, line-item earnings and debt warnings. |
| Proof and custody | Souq; Shiply QR only as identity | Customer-held code/QR, lock and audited reset; separate bag credential and custody scan history. Do not equate QR lookup with recipient confirmation. |
| Selective offline durability | Souq | Queue only commands with stable idempotency and actor scope; visible unconfirmed intents, conflict/session rules, encrypted sensitive data, server reconciliation. Do not claim every write should queue. |
| Tracking honesty | HAAT + Souq | Server-issued scoped tracking credentials; measure MQTT against signed cursor; always retain freshness/sequence and explicit polling/degraded state. |
| Specific refusal copy | Careem + HAAT bootstrap | Stable bilingual reason codes and stage/host/exception diagnostics, not one generic “payment failed” or “no internet.” |
| Server-driven capability | Careem `BookingConfig` hook + broader SDUI | With no OTA, narrow per-booking capability/configuration can change eligible behaviour without a new APK; exact types must be designed from Wind's own contract, not guessed from Careem. |

Do **not** copy: super-app/marketplace breadth, unapproved card/wallet rails, ad-storage analytics, broad contact/audio/ad permissions, Shiply `allowBackup=true`, exposed keys/config identifiers, Capacitor as a substitute for native background reliability, always-on location, a single unversioned hosted origin, or untested claims that presence equals enablement. Wind's WhatsApp entry point remains a differentiator: neither Shiply nor Souq shipped WhatsApp ordering in the searched clients; it must create a Wind order rather than bypass state/cash records.

## 6. Contradictions resolved

### 6.1 Suite counts: 131 / 122 / 106 / 97 (and 52 / 56)

| Source claim | Established reading now |
|---|---|
| “131 suites” (older handoff) | **Correct only as total entries in the current integration selection**, not as `.test.mjs` count: 122 test files + nine named `.mjs` suites. Latest literal-array parse at full canonical SHA. |
| “122 integration suites” (Ledger C-09) | **Correct subset:** selected entries ending `.test.mjs`. It omits the nine non-`.test.mjs` entries when used as the whole runner count. |
| “97 integration / 52 persistence; 99 test + 60 other files” (Verified report/older Cutoff) | **Superseded measurement from a different parse/tree/time.** Neither 97 nor 52 is the newest clean-origin literal-array result. |
| “106” | **No measure in the newest baseline corresponds to 106.** Do not use it. |
| Current disk/persistence | 124 top-level `.test.mjs`: 122 selected + `db-api` and `db-persistence` deliberately PostgreSQL-only. Persistence selection **56**, with a separate legacy check after the array; older 52 is not current. |

### 6.2 PostgreSQL on the test PC

- Earlier Verified report §8/§10.13/§11.8 said no PostgreSQL on `DESKTOP-S2JKMK5`, and older run failures expected 55473.
- Ledger C-14 later said 18.3 exists at 55493 and one isolated suite passed.
- **Newest baseline independently proves the later availability claim:** direct `psql` over authorized SSH → 18.3, `fastship_test`, `127.0.0.1:55493`, PostGIS 3.6.2 core installed, plus executable/data paths. The earlier negative statement is withdrawn.
- **Still unresolved:** full persistence is not green. Prior 503 and `pg_restore ETIMEDOUT` runs are harness/performance evidence, not incompatibility. Availability must not be rewritten as “all tests pass.”

### 6.3 The lint failure that did not reproduce; typecheck state

- Ledger C-12: exact `npm ci`, then three unresolved modules (`expo-auth-session`, `expo-web-browser`, `expo-notifications`) despite resolver investigation.
- Newest baseline: independent isolated clean worktree, `npm ci`, then `npx expo lint` **exit 0 twice/no diagnostics** and `npm run typecheck` **exit 0 twice**. Packages were present. This was a local Windows run, not remote `k5`.
- **Established:** typecheck passes in both cited later checks; lint passes in the newest independent local environment. **Unresolved:** why the earlier machine/toolchain produced three errors. Neither “lint always fails” nor “lint is green everywhere” is justified. Do not delete imports or suppress rules.

### 6.4 ETA formula and units

- Incorrect shorthand: `ceil(minutes × 1.3) + 2`; Ledger C-08 also warned that server seconds were being misstated.
- **Established:** client `[minutes, round(minutes×1.3)+2]` minutes. Server default upper bound `(round(1.3×ceil(rawSeconds/60))+2)×60` seconds. Server ceils raw seconds to minutes before inflation, then converts back; explicit bands are seconds.
- Dispatch fallback is a separate estimate: straight-line haversine at 30,000 m/hour, rounded up, `estimated:true`. Uber ETA models do not reveal a formula or even integer units.

### 6.5 HAAT “no internet” causation is not proven

- Earlier `HAAT.md` placed `envs-list.haatcloud.com` NXDOMAIN beside splash no-internet and inferred environment resolution caused it; its broad statement that this is “a fact about the Palestinian internet” also outran one-network evidence.
- New static pass proves: cluster fetch has its own Tailscale error and only `yk1.a` calls `zd8.a`; splash instead times out Remote Config after 10 s and shows generic dialog only when no usable cached `haat_client` exists. No direct static path from environment-list fetch to splash `F()` was found.
- **Established:** owner-network NXDOMAIN and the observed splash are real but separate facts; the generic dialog can conceal DNS, timeout, Remote Config failure or bad/missing cache. **Unresolved:** actual runtime cause, production reachability of the dev cluster by indirect means, global DNS state and why the hosts fail from this network.

### 6.6 Other material corrections, with the winning evidence

| Topic | Earlier claim | Established/corrected reading |
|---|---|---|
| Canonical booking P0 | Dirty root's red `booking-retry-race` implied current release defect. | Test absent from `b89f220`; canonical client has the safe guard/re-quote behaviour. Dirty root remains stale and divergent; do not carry its defect into release claims. |
| Production deliveries | “Production has never completed a delivery.” | Only the surviving snapshot has zero completed rows. Absolute lifetime claim is unsupported. Two completed sandbox orders do not change production evidence. |
| Backup | First pass said no scheduled object had landed. | Later 13 Nov 03:10:04Z object exists at exact cron slot and passes integrity; restore drill and missed-run human notification still open. |
| Live image | Ledger preserved revision/tag/digest as previous host inspection. | Latest verifies Git ancestor and ECR tag→full digest, **not current running identity**. Host permission block remains. |
| Careem “cash is not a payment method” | One displayed string set had CARD/DEBIT/CREDIT/CAREEM_PAY and no cash method string; another broad section called cash first-class. | Latest code recovers both `CASH`/`CASH_COLLECTION` integer constants and shared `cash` enum plus booking cash flag. Do not claim ordinary cash is globally absent or universally enabled; per-CCT/runtime eligibility is unknown. Wallet ledger and ordinary cash are distinct concepts. |
| Careem required apartment address | Validation copy was treated as universal enforcement; opposite section emphasised pin/no-number capture. | Constructor requires only id/location; three validation resources have no found direct call site. Pin/nickname/notes/photo coexist with postal-shaped validation. Choose layered evidence, not a blanket rule. |
| Careem cash block | Could be read as whole-account suspension. | Copy explicitly says no more **cash bookings** but card bookings continue. Other service-disruption scope is unknown. |
| Captain Arabic count | Earlier REA: 8,965 Arabic strings. | Latest complete multiline parser: 9,762 unique keys/9,128 Arabic. |
| Shiply bundle | Earlier: Metro bytecode with module source, no Arabic recovered. | Latest header proves Hermes HBC 98; Arabic objects/copy are present. Targeted disassembly corroborates, literals primary due tool support warning. |
| Shiply delivery attempts | Earlier: three-step state/substates from `attempttodeliver_three_step`, `delivered_1/2/3` etc. | Latest: only `AttemptToDeliver` and second-attempt copy; numbered strings are notification channels, no third-attempt/counter/max found. |
| Shiply offline | Earlier: “Error sending. Event queued.” and `offlineMode` suggested parcel queue. | Latest: Sentry transport and maps tile option respectively; drafts + query retries are real, parcel outbox/idempotency not found. |
| Shiply JAYEEK | Earlier: third-party courier and irreversible after commitment. | Latest: service-level axis and real revert request exist; exact eligibility is data-driven and third-party carrier is not proven. |
| Shiply order type | Earlier prose treated Pay/Buy/Return/Replace as separate enum members. | Latest exact enum: Delivery/Pay/Replace/Return; Buy/Bring is presentation of Return (`PurchaseParcel`). |
| Souq `totalCents` | Earlier order-body example included it. | Latest actual call posts only payload; total is local recovery metadata, key is HTTP header. |
| Souq address notes | Earlier saved address included notes/deletion-note interpretation. | Latest create has no notes; checkout notes means note for shop; no saved-address edit found. |
| Souq “every write queued” | Earlier F-10 and cross-app index generalised all mutations. | Latest call-site census: only `queueAs` actions, mainly driver custody/delivery/cash; checkout/listing/chat have separate recovery; admin settle/adjust and many writes lack key/queue. |
| Souq status count | Earlier mixed order, shift, custody and alerts; index said 29+ statuses/nine typed failure reasons. | Latest: exactly ten shop order statuses; eight custody actions; separate 15-value listing lifecycle; six delivery-failure reasons and six distinct door cash-discrepancy reasons. `PENDING_SETTLEMENT` and `CASH_VARIANCE` are not order statuses. |
| Souq queue refresh | Earlier: ready queue polled every 10 s. | Latest: shift polls every 10 s; queue reloads on active status and order/custody/fleet events. |
| Souq proof reset | Earlier implied visible lock field/failed-attempt threshold. | Latest: admin + `IN_CUSTODY` gate, driver sees only `PROOF_LOCKED`; no threshold in bundle. Reset does not deliver. |
| Competitor identity | Athkar/Salati were initially treated as delivery apps. | Artifacts are religious/prayer utilities. Their craft ideas may be cited separately, never as delivery evidence. |
| Driver artifacts | Earlier report said no Careem Captain or HAAT driver/courier; index said no driver artifacts at all. | Captain and HAAT Driver/Courier were subsequently acquired. Captain got resource atlas; HAAT siblings got manifest/resource-only study. Shiply driver and Careem Partner are still missing. |
| HAAT class counts / Careem class counts / Uber growth | Different reports give different totals. | Use labelled bases: HAAT 22,115 raw vs 19,025 REA (229 first party); Careem 73,254 raw vs 66,129 REA; Uber raw 288,493 vs materialised 174,898. Differences are not product changes. |
| Route inventory | Audit claimed 169 routes and missing `GET /api/auth/entra`. | Earlier independent parse found 182 registered routes (GET 60, POST 118, DELETE 2, PATCH 2); Entra exists as **POST**, a method typo in the audit. |
| Font scaling | Research alternately called 1.35 cap a P0/no scaling. | Phone measurement: tagline 82→116 px from system 1.0→2.0 (+41.5%), so scaling works but is capped below 200% expectation; fixed layouts need rework before raising cap. |
| Arabic source text | PowerShell displayed `????` in `server/worker.ts`. | `[ran,false]`: raw file bytes are valid UTF-8; console code-page artifact, not source corruption. |

### 6.7 Conflicts that remain deliberately unresolved

- Full integration's one `%41…` URL-decoder failure versus immediate direct/filter passes: intermittent cause unknown.
- Full persistence phone-identity 503 versus standalone pass and later `pg_restore ETIMEDOUT`: harness/performance cause unknown.
- Earlier remote lint errors versus latest local clean pass: environment root cause unknown.
- Current live container identity: registry/Git association verified, running process not currently inspectable.
- Careem Captain 60-minute versus one-working-day withdrawal copy, and Careem Pay no-cash-out versus general cash-balance withdrawal copy: likely different rails/buckets but static resources cannot reconcile.
- HAAT's failed hosts and splash: no proven causal or global diagnosis.
- Souq variance `resolutionNotes` client-required copy versus no button guard: server behaviour unknown.
- Production monitoring beyond the permitted inventory: `AccessDenied` is not evidence of absence.

## 7. What is still undone, ranked

Each row gives an exact command where the sources supply one, otherwise a concrete experiment. Paid infrastructure, production migration, service activation and public launch remain owner decisions; no recommendation here silently authorises them.

| Rank | Undone item | Exact command or experiment that closes it | Acceptance evidence |
|---|---|---|---|
| **P0-1** | **Production APK cannot reach the live API.** | In the EAS `production` environment set `EXPO_PUBLIC_API_URL=https://dlvxzw3gj596d.cloudfront.net`, rebuild with the project's production profile, then run the baseline's decompressed-ZIP scan over **every** entry for old host, current host and `cloudfront.net`. Record new size/SHA/version. Install on the physical phone and perform a real sign-in through phone check. Fix the misleading verification copy in the same release. | Current host present, Azure host absent, ZIP CRC clean; real sign-in succeeds; then one real production customer→driver→cash trip is captured. Until this exists, field acceptance of other changes is blocked. |
| **P0-2** | **No complete archived gate result for one exact SHA.** | `git worktree add ../wind-rc origin/master` → `cd ../wind-rc` → `git rev-parse HEAD` → `npm ci` → `npm run typecheck` → `npx expo lint` → `npm test`. On `DESKTOP-S2JKMK5`, set `WIND_TEST_DATABASE_URL` to `postgresql://fastship_test@127.0.0.1:55493/fastship_test` and run `npm run test:persistence`. Also run `node --test tests/url-decoder.test.mjs` and `node scripts/run-tests.mjs --filter=url-decoder` after any full-run URL failure. Repeat lint in the previously failing environment and preserve its exact diagnostics. | Full logs, machine/tool versions and exit codes for 131 integration selections and 56 persistence selections + legacy check; no skipped suites/timeouts hidden. Lint discrepancy explained or reproduced on both environments; intermittent URL result understood. |
| **P0-3** | **Two ungated digital-capture paths; real card stays disabled.** | Add tests around `createIntent`, `getIntent`/`query` and `applyProviderEvent`: immediate capture, delayed capture, duplicate and out-of-order webhooks, timeout→late capture, refund-before-capture, partial/full refund. Prove each fails when the single gated/idempotent transition is reverted; count settlement-gate execution and compare provider/ledger. Include a cash-already-collected order and assert no double settlement; verify redundant provider poll is removed without breaking status. | All transitions to captured pass one settlement gate exactly once per order; provider and ledger agree; no card activation occurs. |
| **P0-4** | **Running production provenance is not currently provable.** | Owner refreshes: `aws login --profile osama`; `aws sts get-caller-identity --profile osama`. Then: `aws ssm send-command --profile osama --region eu-north-1 --document-name AWS-RunShellScript --targets 'Key=tag:Name,Values=wind-host' --parameters '{"commands":["sudo docker inspect wind-api --format {{.Config.Image}}","sudo docker inspect wind-api --format {{json .Config.Labels}}","sudo docker image inspect $(sudo docker inspect wind-api --format {{.Image}}) --format {{json .RepoDigests}} {{json .RepoTags}}"]}'`; read with `aws ssm list-command-invocations --profile osama --region eu-north-1 --command-id <CommandId-from-send-command> --details`. | Live digest equals `sha256:dabea3995716b3c2f8f9a16ee3ce43bbe7e9bfe77c829e3ecfa7543b9eaad7dc` (or a deliberate newer release), revision label matches deployed source, deploy time and public env key names recorded. A merge is never treated as a deploy. |
| **P1-1** | **Backup validity is proven, recovery is not.** | Restore `wind-20261113T031001Z.db.gz` (or latest) into a throwaway replacement host/container, run `PRAGMA integrity_check`, enumerate all 37 tables, compare every row count and all money totals to source, open API against restored data, and time the operation. Separately simulate a missed 03:10 UTC run and verify the alert reaches a person. Record RPO/data-loss window and observe retention beyond one object. | Timed, usable replacement-host restore with matching rows/money; documented loss window; real missed-backup notification received. |
| **P1-2** | **No demonstrated human outage alert.** | With owner approval, create an `eu-north-1` Synthetics canary against `/api/ready`, configure generous timeout given measured p99 1.122 s and keep `/api/health` distinct, alarm to a human channel, force a controlled failure, and show the received message. Also ship host API/watchdog/backup logs to an accessible retained destination or demonstrate an equivalent working SSM path. Test the in-app `backupStale` path only after creating a real admin push subscription. | Alarm and matching received notification, including reason/stage; no reliance on an empty subscription table or an unproven hourly workflow. |
| **P1-3** | **No real production delivery or measurement sample.** | After P0-1, use consenting known users on production for a parcel trip. Capture order response, transition history, `orders` commission/discount/price rows, cash/receipt/journal rows, driver actual route/fixes, promised versus actual minutes, collected cash actor/time, push ticket **and receipt**. Do not substitute W-00007/W-00008 sandbox screenshots. | One independently reconstructable production order from booking to delivered and reconciled cash; sample count explicitly begins at 1. |
| **P1-4** | **Sandbox cash handover/settlement and PostgreSQL trigger discrepancy remain open.** | In an isolated PostgreSQL schema, create two similarly named drivers and finished orders; exercise `POST /api/admin/cash/remittance` → driver confirm/dispute → admin resolve → signed adjustment. Capture pending/confirmed/disputed balances and journal rows. Specifically call admin resolve with `resolved_by` + `resolution_note` and observe whether `immutable_cash` rejects it. Then exercise the phone's separate `تسجيل تسليم نقدي` and `تسجيل تسوية` UI end to end, including timeout after commit and stale offline screen. | Pending does not reduce debt; confirmed does; dispute alerts; negative adjustment approval guard holds; every correction has actor/reason; trigger issue is fixed/tested or proven not to occur; UI and DB reconcile. |
| **P1-5** | **Push delivery and rotation are not proven; release/update path is absent.** | Register a token, rotate it, and verify old token unsubscribes/new token receives. Send Expo push, persist ticket, then retrieve receipt and distinguish accepted ticket from device delivery. Lock phone during active trip with “always allow” and measure continuity. Choose `expo-updates`/EAS Update or signed HTTPS APK hosting, configure `EXPO_PUBLIC_UPDATE_URL`, and test a below-minimum build opening the forced-update screen and successfully downloading/installing the update. | Token rotation, ticket→receipt outcome and lock/background measurements archived; an actual update reaches the phone without manual side-loading, or the signed-APK alternative is proven. |
| **P1-6** | **AWS-owned hostname couples app and shared-link availability.** | Owner chooses/registers a stable domain, maps API + tracking + update hosting without changing public paths, builds against it, then retires the old dependency only after proving old WhatsApp tracking tokens still resolve through a compatibility redirect/host. | Fresh and previously issued tracking links open without app; new APK works; host migration does not invalidate existing tokens. |
| **P1-7** | **Named phone acceptance matrix and interrupted-command behaviour incomplete.** | Execute C-01…C-07, D-01…D-07, A-01…A-06, X-01…X-05 on `SM-A5360`, never emulator. Start C-03 at pre-response, post-server-accept/pre-client-response and reconnect; assert one order/correct price/preserved draft. Then offline saved orders, every state across foreground/background, two drivers on one offer, connectivity cycling, permission revoke, sign-out during upload, multi-parcel handover, cash disputes, TalkBack pin, reduced motion/narrow/tablet and cold launch under 5xx/timeout/2G-like conditions. Keep `adb reverse` sandbox separate from production. | Every scenario has result + artifact + SHA + backend; two-role trip with keyboard-open proof is repeated after relevant UI changes. Existing W-00007/W-00008 runs count as baselines only, not completion of interruption scenarios. |
| **P1-8** | **Background/weak-network durability is narrower than product needs.** | Interrupt booking, custody, delivery and cash commands after server commit but before client receipt; inspect receipt before retry, replay same key, and confirm no duplicates. Introduce offline periods during location upload and measure what is lost. Implement/test a scoped outbox only where authoritative receipt/replay exists, with encrypted sensitive payloads and visible unconfirmed state; benchmark HAAT-like MQTT + fallback against Wind signed cursor for freshness, bytes, reconnect and loss on real mobile data. | Exactly-once user outcome (not a claim of exactly-once network delivery), no cross-account replay, no silent lost cash/custody intent; stale location shown with age and transport measurements justify any migration. |
| **P2-1** | **Address model/offline corpus is still limited.** | Test unnamed roads, saved-place precedence, failed server search, Arabic folds, pin movement, 20 km boundary and privacy allowlist. Add a small versioned offline zone/place/fee/window corpus and show its age. Prototype unified anchored place results + saved/suggested places with explicit confirmation; optionally test entrance photo with size/privacy budget. Compare zone+landmark and municipal city/village/street against actual driver arrival success. | Offline search no longer collapses to 16 towns without telling the user; accepted pin never changes on search tap; notes/photos visible only to authorised roles; measured address-related failure rate improves. |
| **P2-2** | **Map/router has single-host and reproducibility risks.** | Pin the Geofabrik extract by date and SHA, record graph checksum + routing-profile version in route evidence, quarantine/parameterise the unclipped Dockerfile so it cannot silently replace the West Bank build, and run closure/slow-route fixtures. Measure OpenFreeMap failure/bytes/latency on actual Jawwal/Ooredoo app requests in Nablus, Ramallah and Jenin (ICMP is not a substitute). Compare a pinned hosted Palestine extract/fallback against those results. | Same input produces same graph/checksum; closure reports change route honestly; no unreported closure avoidance; tile failure reaches real fallback; byte/latency measurements support host choice. |
| **P2-3** | **PostgreSQL/RDS cutover must not precede gates/topology/recovery.** | Owner: `aws rds describe-db-engine-versions --engine postgres --region eu-north-1 --query "DBEngineVersions[?contains(EngineVersions,'18')]"`; `aws freetier get-account-plan-state --profile osama`; check AWS Settings → Billing/spend. First choose single-host versus managed topology and connection budget, rehearse importer and the no-fallback boundary after first authoritative PostgreSQL write, and repeat restore/rollback drill. | P0-2 and P1-1 green, PG cash discrepancy resolved, exact engine/PostGIS supported in Region, cost approved, timed cutover and post-write forward recovery proven. Current reference cost remains `db.t3.small` ≈ $27.01 + 20 GB GP3 ≈ $2.40 = **$29.41/month before backups/egress**, not an approval. |
| **P2-4** | **Flat fare and heuristic ETA have no production calibration set.** | Instrument promised/raw/min/max ETA and actual pickup/delivery timestamps, route/checkpoint history, distance and driver pay/cost on every real order. Report error by city pair with sample size; separately test 5 km and 60 km routes and courier take-home. Do not tune the 1.3/+2 heuristic or replace flat ₪20 until samples exist. | Versioned fare/ETA decision backed by actual distributions, courier viability and confidence/sample counts; displayed basis and freshness remain honest. |
| **P2-5** | **Permissions, accessibility, privacy and operations hygiene.** | Build role-specific manifests to remove customer background-location/badge surface not needed, re-inventory exported components, and update privacy/data-safety declarations for actual Firebase/analytics. Rework fixed-height proof/price/footer/admin layouts before raising 1.35 cap; rerun font scale 1.0/1.35/1.5/1.7/2.0 in Arabic and English on welcome and order detail. Replace stale Azure-first deploy validation docs and add a Wind log/alert runbook. | 200%-scale flows have no clipping/language-switch regression; least permissions pass two-role trips; declarations match artifact; operator follows AWS—not Azure—commands. |
| **P2-6** | **SMS and public-launch constraints need provider/legal proof.** | After owner refreshes account/plan, verify the selected provider's current +970/+972 documentation and run consented delivery tests on Jawwal and Ooredoo, recording sender identity and latency/failure. Keep OTP one-way, provide undelivered-code support and do not promise “from Wind.” Obtain legal review before strangers; verify market road-use evidence and licences before importing external map sources. | Real delivery outcomes on both carriers and documented fallback; no reply-by-SMS dependency; signed-off provider, road data and launch policy. |
| **P3** | **Reference-app runtime and economic unknowns remain.** | Acquire Shiply's actual driver artifact and, only if still decision-relevant, Careem Partner; inspect HAAT Driver/Courier code rather than resources; run authorized reference-app flows without real customer data; request public tariff/economics evidence rather than infer it. Obtain no IPA claims without IPAs. | Any copied mechanism has client + observed/server or explicitly labelled static-only support; no competitor fee/take-rate/Palestine claim is fabricated. These do not block P0/P1 Wind repairs. |

## 8. Every open question the sources recorded

This section consolidates the eleven atlas notes' `[U]`, `[unk]`, `[open]`, `[NF]`, “not found,” “unknown,” and “not determinable” items, followed by open items inherited from the background reports. Wording is compressed, not upgraded into answers. An item already resolved in §6 is not repeated as if still open.

### 8.1 `baseline-and-deployment.md`

- **[open]** What digest and `org.opencontainers.image.revision` is the live `wind-api` container actually running? SSM/EC2/CloudTrail reads are denied; ECR `BatchGetImage` is denied; public readiness cannot answer it.
- **[open]** What image config associates the verified Git revision with the registry image, beyond the preserved earlier host observation?
- **[open]** Who set the historical EAS production `EXPO_PUBLIC_API_URL`, and exactly when? EAS project history was not read.
- **[open]** Why did one environment report three unresolved-module lint errors while the newest independent local clean worktree passes twice?
- **[open]** What are the complete integration/persistence results on one exact SHA? This baseline establishes source counts and type/lint, not a green full gate.
- **[open]** Which AWS account plan/spend state and host permissions will allow the required owner-only inspection? The available read-only identity cannot answer them.

### 8.2 `wind-money-and-state.md`

- **[NF]** No SQLite `command_results` definition was found; the durable outer command protocol is PostgreSQL-only in the files read.
- **[NF]** No general SQL table of permitted old→new order-status pairs was found; route guards are the evidence.
- **[NF]** No outgoing transition from `completed`, `returned` or `cancelled` was found in the files read.
- **[NF]** No SQLite `cash_receipts` table was found.
- **[NF]** No `cash_collection` double-entry journal construction was found, although the schema permits that kind.
- **[NF/open]** No replacement `immutable_cash` definition reconciling `resolved_by`/`resolution_note` with its all-other-fields predicate was found. Will admin resolve fail on PostgreSQL?
- **[open]** How should uncertain commit failure be reconciled externally? Source deliberately does not synthesize success; `GET` null cannot prove an in-flight command absent.
- **[open]** Server/runtime outcome of the two ungated payment-capture paths and the duplicate provider query must be tested before activation; static source establishes the defect, not a real incident.

### 8.3 `wind-geo-and-dispatch.md`

- **[NF]** No per-city `served` property was found in `src/model.ts`; effective service is nearest-city ≤20 km, not a per-city boolean.
- **[NF]** The concrete vector-tile URL template was not found in `map.html`; it resides in the remote OpenFreeMap style.
- **[NF]** No alternate style/tile host was found in `map.html`.
- **[open]** What upstream OSM content will a future `-latest` rebuild contain? Neither build path pins extract date or checksum, and the live graph checksum/profile was not established by this source read.
- **[open]** Runtime availability/failure rates of OpenFreeMap and OSRM on West Bank mobile networks are not measured by static source inspection.
- **[open]** Owner evidence for roads Palestinian drivers may legally/practically use remains a policy/data gap; a route algorithm cannot infer legality from OSM alone.

### 8.4 `uber-map-and-poi.md` — hard DEX-string boundary

- **[U]** Method bodies, full signatures, field types and enum values are unavailable to this method. The five `PoiType` values and four `EtaAccuracy` values are not recoverable **by this study**; the separate offer study did observe the four accuracy names.
- **[U]** Are `radius`, `viewport` and `polygon` alternatives or composed inputs? Nearby string occurrence cannot bind them to a message or establish cardinality.
- **[U]** Which exact proto message owns each lowercase field-name string? Counts are context only.
- **[U]** Is POI enabled for a given city/account/experiment? Runtime configuration is invisible; server gating is only `[inf]`.
- **[U]** What is the actual server contract/behaviour behind generated client stubs? It was unobserved.
- **[U]** What applies to Palestine? Nothing directly; Uber does not operate in the West Bank and this is structural evidence only.

### 8.5 `uber-offer-eta-payment.md`

- **[U]** Which transport delivered any particular offer, which is active, server timing and the envelope wrapping `GenericRiderOffer`? `ScaledOffers` is not proven to contain it.
- **[U]** Which `GenericRiderOffer` fields are nullable or required on the wire?
- **[U]** Does a local countdown automatically call `expireOffer`, and what does the server do after accept/reject/ack/expire?
- **[U]** Are typed error slots mutually exclusive, how do they map to HTTP, what retries occur and which error will a server select?
- **[U]** What are the units of `EtaRange.min/max/raw`, and what is the relationship among the three ETA model packages?
- **[U]** What computation, rounding, clamp, minimum-width or `min<=max` rule exists elsewhere? No client or server ETA formula is claimed.
- **[U]** What cash value can `PaymentProfile.tokenType` take, what runtime eligibility applies, and what is `CashChangeFeatures`' field layout? The profile has no field simply named `cash`.
- **[U]** Are the Arabic cash resources available in a given market, what settlement logic applies, is PayPal available, and which Arabic-speaking rider sees them?
- **[U]** Earlier full-study values not read remain open: numeric camera/zoom/collision/fuzz/tolerance constants, runtime provider selection, merged split-manifest behaviour and re-obfuscated absolute error-class counts.

### 8.6 `careem-rider-payment-and-address.md`

- **[U]** What are `BookingConfig.overrideAllowedPaymentTypesForCcts`' generic key/value types and actual per-CCT subsets? Outer exact class was not found; only nested hook name survives.
- **[U]** Which of the six integer payment constants is allowed for a particular booking? Declared vocabulary and `isPaymentTypeCash` do not prove eligibility.
- **[U]** Does the traced `l8i` mapper serve payment surfaces beyond top-up? Only the top-up path was observed.
- **[U]** When/where do area/building/apartment-number validations fire? No direct DEX const or binary-XML call site was found; dynamic resolution is possible, universal client enforcement unproven.
- **[U]** What does `SaveLocationActivity` send and what does the server require? No network save was run and the local one-field gate is not the whole contract.
- **[U]** Actual per-CCT availability, server response codes, payment/search/save behaviour and validation triggers were not executed.
- **[U]** How do gateway `NewLocationModel` results map into the distinct 16-field domain `Address`? The artifact presents both shapes but this supplement does not establish a universal mapping.

### 8.7 `careem-captain-earnings-and-cash.md`

- **[unk]** Real statement amounts and signs, including the sign/meaning of `breakdown_other`.
- **[unk]** Guarantee eligibility/formula, fine policy/amounts, tax treatment, supplier-fee/commission/take-rate calculation, and whether matched Ramadan tips recur.
- **[unk]** Whether “100% earnings / supplier fee settled directly” applies to every service, captain or market; it is not zero-take-rate proof.
- **[unk]** Actual negative-balance threshold, debt calculation and whether every negative balance comes from underpayment.
- **[unk]** Exact scope of generic “service disruption” beyond the explicit cash-only block; actual unblock timing/server enforcement after settlement.
- **[unk]** Whether automatic threshold settlement and recurring maximum settlement are active together, and which repayment routes are enabled per captain.
- **[unk]** Payout eligibility, min/max/daily values, request-rate rules, country availability and server-side fraud/verification decisions.
- **[unk]** How earnings-to-Careem-Pay no-cash-out copy reconciles with general bank-withdrawal copy; different balance buckets/flows are only a possible explanation.
- **[unk]** Whether withdrawal is 60 minutes or one business/working day for a given rail; no single SLA follows.
- **[unk]** Whether any named flow is reachable/current rather than legacy/shared resource residue.
- **[unk] Palestine:** whether any earnings, debt, blocking, wallet, bank, card or cash-pickup mechanism applies. Emirates ID/Lulu Exchange must not be generalised.
- **[unk]** No screen or transaction was run; runtime behaviour is entirely unobserved.

### 8.8 `haat-address-and-checkout.md`

- **[U]** Original declarations/implementations behind R8 types `bt2,apa,ya4,bi7,rv0,xd1,a92,ti8,dt2,cb,fpa` and case-collided uppercase `C,S,W,Y,Z` methods.
- **[U]** Final address-save endpoint, request body, terminal persistence, server-required fields and final-save validation.
- **[U]** Universal building/floor requirements and the exact predicate for `please_add_note_to_continue`; an error view is not an always-required rule.
- **[U]** `ClusterSelectionActivity` fields, intent contract, production reachability and whether `.dev` implies build role; no inspected production reference was found.
- **[U]** Full text-change forwarding and API submission of driver instructions; only `N().d(new fpa(...))` handoff is visible.
- **[U]** Exact callback emitted by `ComponentAddress`' external click implementation.
- **[U]** Whether the owning checkout retains or refetches a saved card after method change; meaning of ordinal-1 coroutine is not assigned without `bi7`.
- **[U]** Submit-time payment validation, order idempotency, actual cash settlement, card charging, 3DS outcome and order submission.
- **[U]** Exact mapping of `ti8.b/c` to original busy/closed enum names.
- **[U]** Other `WebViewMessagePayload` variants, serialized key names and full deserializer contract.
- **[U]** `CardUrlFields` properties, JSON names, defaults and relation to opaque `WebViewInitDataBridge` string; it is not proven to be that payload.
- **[U]** Runtime availability of payment methods and server/model enablement beyond static component behaviour.

### 8.9 `haat-tracking-and-bootstrap.md`

- **[U]** Concrete MQTT protocol, host, port, client ID, topic, username/password and credential lifetime.
- **[U]** Actual keep-alive/connection timeout/MQTT version/will/max-inflight values; Paho defaults were deliberately not attributed to HAAT.
- **[U]** Actual message payloads, broker authentication outcomes, delivery frequency, packet loss and whether credentials are currently usable.
- **[U]** Runtime reconnect success, fallback freshness and broker/API availability.
- **[U]** Concrete `EnvListResponse.domains` entries and runtime-selected environment.
- **[U]** Full `k91` session semantics and whether environment change completely invalidates session/tenant state; only Intercom logout and handoff are visible.
- **[U]** Production reachability of `.dev.ClusterSelectionActivity` through reflection or another indirect path.
- **[U]** A static causal link from `envs-list.haatcloud.com` failure to splash no-internet; none was found.
- **[U]** Whether owner-network NXDOMAIN reflects geo-blocking, decommissioning, ISP behaviour, global DNS or an application defect; none can be inferred locally.
- **[U]** Whether cached `haat_client` is fresh enough for safe operation and whether any server honours the selected environment.

### 8.10 `shiply-feature-implementation.md`

**Global/server boundaries**

- **[U]** Server-side validation, transition enforcement, actual fee values, notification contents, background delivery and runtime success are not established.
- **[U]** Authoritative ledger schema, settlement timing, numerical fee schedule and backend postings behind client wallet/invoice instructions.

**Address**

- **[NF]** No parcel `landmark` payload field or parcel default-address key was found; icon names and `village_note` do not change that.
- **[NF]** No house/building/apartment number or postcode is emitted in the parcel destination.
- **[U]** Server trimming/requiredness and conditional validation when particular description/note inputs are shown.
- **[U]** Whether a future/other artifact adds landmark-first addressing; this bundle would require an extension.

**Lifecycle/service**

- **[NF]** No literal `final_parcel_status_ids` set, exhaustive terminal list, server transition table or automatic-transition trigger was found.
- **[U]** Universal hard-coded result of “confirm receipt”; final metadata is read separately.
- **[NF]** No third-attempt status, attempt counter, maximum-attempt rule or automatic escalation; only second-attempt presentation is established.
- **[U]** Precise same-day revert conditions and whether JAYEEK is physically delivered by a third-party courier.
- **[NF]** No hard-coded currency price table, same-day tier prices or numeric fee percentages; thresholds/computed tariffs are data.

**Money**

- **[U]** Actual commission rates, card fees, wallet hold/debt computations, invoice-exception resolution and settlement timing.

**Proof/driver/tracking**

- **[NF]** No delivery/recipient/handover OTP, PIN, signature or confirmation-code product field was found; `authorized_recipient` is wallet withdrawal only.
- **[U]** Server verification of receipt/QR events; QR lookup/attachment alone is not delivery proof.
- **[NF]** No driver jobs, earnings, settlement IDs/status/amount, ready queue, accept/decline offer, shift start/end/open/close or driver-job workflow was found.
- **[U]** Whether Shiply's wider product has those mechanisms in a separate driver/employee artifact.
- **[U]** Whether declared location intervals are used anywhere; no references beyond declaration were found.
- **[NF]** No used driver-location upload, live polyline, driver GPS subscription or external navigation handoff was established.
- **[U]** Actual production FCM payload contents: client is PII-capable, but sender inclusion of email/names/phones/addresses/financial details and title/body text is unknown.

**Offline**

- **[NF]** No `idempotency`, `Idempotency-Key`, request UUID, parcel mutation outbox, offline write replay or queued parcel-sync endpoint was found.
- **[U]** Background delivery/replay beyond local drafts and query-specific retry; React Query/Sentry/maps offline code is not a parcel outbox.

### 8.11 `souq-tulkarm-feature-implementation.md`

**Global/server boundaries**

- **[U]** Server-side transition guards, persistence, authorization, validation, actual append-only enforcement, privileged tooling, response schemas beyond fields read, live fees, quote calculation, proof generation/lock parameters, background WebView behaviour and runtime network behaviour.

**Address/pricing**

- **[U]** Saved-address server required fields, trimming and length limits; visual `label` requirement is not backed by a local non-empty gate.
- **[NF]** No saved-address edit/update endpoint or payload was found; only list/create/delete.
- **[U]** Whether checkout's recovery-only `totalCents` matches authoritative server pricing; actual server calculation/validation is not exposed.
- **[U]** Live zone fees/minimums/capacities; new-zone 5.00/30.00 values are only form defaults.
- **[U]** Listing quote formula, currency minor-unit convention, delivery payment method and whether cash is collected; shop COD cannot be generalised to listing shipping.

**Cash/proof**

- **[U]** Whether server rejects empty `resolutionNotes` on physical-count variance despite required copy; client omits it and does not disable the button.
- **[U]** Actual token contents, entropy and signing behind the no-name/address/amount privacy copy.
- **[U]** Proof failed-attempt count, lock duration/persistence and server lock model; only `PROOF_LOCKED` is visible. Client does not enforce four digits despite copy.
- **[U]** Whether every proof reset emits the named audit row and whether server responses actually filter delivery code/other-customer data by role.
- **[U]** Whether shift start is accepted during `PENDING_SETTLEMENT`; UI warning and enabled scan button conflict.
- **[U]** Actual ready-queue selectable/assignment enforcement and self-select policy server-side.

**Lifecycle**

- **[U]** Exact state after an approval decision, after packing reissue, and the server rule moving each `DELIVERED` order to `CASH_SETTLED`.
- **[U]** Complete allowed-transition table; history events are not one.
- **[U]** Listing `submitting` writer/target, driver assignment and other external transitions, cancellation staging, `on_hold` resolution and QR form of handover/return codes.
- **[U]** Listing `booked`, pickup/transit/return writers are not present in this module.

**Offline/storage**

- **[U]** Actual WebView background execution/replay; service worker has no `fetch`/`sync`, so React-provider replay is the only evidenced mechanism.
- **[U]** Device-compromise impact of unencrypted proof/cash bodies in localStorage; native session encryption is separate.
- **[U]** Server interpretation of listing body `requestId`; calling it a proven idempotency key would be inference.

**Promotions/order types**

- **[O-negative/U]** No coupon/promo-code client implementation or `orderType/order_type` field was found. Server-only promotion cannot be ruled out; marketplace offers are not coupons and the three order flows are separate.

### 8.12 Open questions inherited from the Verified report, Ledger and earlier REA studies

These are not new guesses; they are explicit background gaps not already covered above.

- **[open] Production operations:** What records existed before the surviving snapshot? What is the complete alarm/Route53/SNS inventory outside the available credential's permissions? What is the account Paid/Free plan and spend-limit state? What exact RDS 18 minors are available in `eu-north-1`? What is the current host log/event history?
- **[open] Recovery/alert:** How long does a replacement-host restore take and how much data would it lose? Does any missed-backup/outage notification actually reach a person? Will retention work over time rather than for one observed scheduled object?
- **[open] Phone/runtime:** What is app-level RTT and API behaviour over real Jawwal/Ooredoo mobile data? ICMP produced no samples. Does tracking continue through lock/background/swipe/force-stop/reboot and permission revocation? What are push device-delivery rates and token-rotation outcomes? What are the results of every named C/D/A/X scenario, especially interrupted booking and cash-after-commit?
- **[open] Money:** What are actual production commission, cash collection, handover and settlement rows? W-00008's ₪20/₪17 displays and the later ₪80/₪12 sandbox dashboard are not production reconciliation. Does PostgreSQL admin cash resolution hit the immutable-trigger mismatch?
- **[open] Release:** Which stable domain and update channel will be approved? How will already-shared CloudFront tracking links survive migration? What minimum supported build and forced-update URL will retire broken APKs?
- **[open] Product measurement:** What are actual route costs, courier take-home, ETA errors by city pair, address-related failure rates, map byte/latency budgets and notification latency? Production sample count is zero in the surviving snapshot.
- **[open] OTP/legal/map governance:** Which SMS provider reliably serves +970/+972 on both carriers, with what sender ID and best-effort limitation? Which external road/checkpoint sources are licensed and operationally appropriate? Who supplies evidence of roads drivers may use? What GPS retention and public-launch legal policy will the owner approve?
- **[open] Accessibility/security:** Can fixed-height layouts be reworked so text approaches 200% without clipping in both languages? Which role-specific permissions can be removed without breaking driver tracking? Do privacy notices and Play declarations exactly match shipped Firebase and other processors?
- **[open] Reference artifacts:** Shiply driver remains unacquired; Careem Partner remains unacquired; HAAT Driver/Courier need code-level study; no competitor server behaviour or economics is known; no reference app had a full order/cash runtime observation. Careem/HAAT first runs stopped at login/network walls.
- **[open] iOS:** Careem and HAAT iOS store metadata was read, but no IPA was obtained. No iOS implementation, background tracking or parity claim is supported.
- **[open] Shiply earlier residual limits:** Expo SDK/RN versions were not resolved in the broad study; signer was not exposed; parcel PII exposure through `allowBackup=true` beyond secure-store exclusions is unknown; use of overlay/storage/screen-capture permissions is unestablished. The newer atlas resolves bundle format and Arabic, not these items.
- **[open] Souq earlier residual limits:** native `SecretKey` derivation/storage, Web Push reliability in Capacitor, PWA install/service-worker details beyond the later `sw.js` handler census, actual production status of the Railway hostname and signer verification remain unproven.
- **[open] HAAT market:** Whether HAAT operates in the West Bank proper or only in the 1948 territories is not in the artifact; store download/review claims and Israeli payment heritage do not answer service eligibility or tariffs.
- **[open] Careem market:** Actual Palestinian operation, pricing, tariffs, take rate, enabled payment methods and address/payment/earnings rules are not established by APK presence.
- **[open] Uber baseline:** The 4.654 comparison uses archived repository lists, not a re-pulled old APK; merged split manifests, runtime flags, server overrides, IPC code-level checks and unread constants remain unverified. The two missing map FQNs and exact typed-offer wire changes should not be filled in from inference.

---

**Atlas conclusion.** Wind's core command, state and cash design is more substantial than the dead production client suggests, but a trustworthy West Bank product is not yet proven by source inspection or sandbox screenshots. Repair the artifact and its release path, prove the exact candidate and recovery operations, then use Souq's scoped offline/cash/custody discipline, HAAT's human addressing and explicit tracking fallback, Careem's explained money consequences, Shiply's named financial deltas and Uber's unified place/ETA contracts as **patterns with labelled limits**—while real Palestinian trips supply the only numbers that can make fares, ETAs and operations trustworthy.
