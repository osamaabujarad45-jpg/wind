# Fastship maps, addressing, tracking and dispatch production handoff

**Research cut-off and official-source access date:** 2026-11-13  
**Repository:** current working tree of `Fastship`  
**Scope:** research and architecture only. No implementation, provider activation, paid API calls, infrastructure provisioning, secret access, or current device/load tests were performed.

## 1. Decision summary

Fastship should **not begin with a map-visual replacement**. The inspected deficiencies are primarily local address/POI coverage, routing-data and policy quality, operational GPS recovery, measured ETA, realtime fan-out, and production dispatch activation. Better-looking tiles cannot create a missing road, entrance, address, turn restriction, checkpoint rule, or traffic observation.

### Recommended direction, not a final provider award

1. **Keep the current renderer separation during the pilot:** MapLibre with OpenFreeMap on web/Android, Apple Maps on iOS, and no Google geometry on a non-Google map. OpenFreeMap's lack of an availability commitment means its public service is not, by itself, a production availability guarantee; pilot a self-hosted tile service or obtain a contracted service before general availability.
2. **Retain the self-hosted OSRM route as the control/baseline.** Benchmark it against self-hosted **Valhalla**; keep **GraphHopper** as the second alternative where its matrix, customization, or optimization capabilities justify another engine. Feature availability is not evidence of Palestinian road quality. No routing replacement is selected here.
3. **Pilot self-hosted Pelias plus a Fastship-owned, verified address/POI registry.** Pelias is a candidate search engine, not a source of missing Palestinian addresses. Preserve confirmed coordinates, local names, landmarks, written directions, provenance, and verification dates. Do not make the public Nominatim service a production dependency.
4. **Use one versioned OSM data release across tiles, search, routing, and map matching.** Record dataset and routing-profile versions in every route response. Import corrections lawfully and review them locally; never copy proprietary Google results into OSM or the private registry without a compatible licence.
5. **Make tracking recoverable before making it prettier:** durable on-device fix queue, server idempotency, raw-fix retention, production session fencing, explicit stale/offline states, and tested process/network recovery. Map matching is a derived display aid, never a replacement for raw observations.
6. **Make the server authoritative for offers, assignment, arrival, cancellation, release, and reassignment.** Add transactional state transitions, idempotency, audit events, a transactional outbox, and shared realtime fan-out before enabling automatic dispatch beyond its test gate.
7. **Treat ETA as a measured product, not a router duration with padding.** Build a ground-truth set and calibrate by area, time, trip type, and observed waiting/checkpoint delays. Google documents no Palestine traffic-layer coverage, and the repository's optional Google Routes call is explicitly traffic-unaware.

This is a **target architecture with go/no-go gates**, not a claim that the current system or any candidate is already production-ready.

## 2. Evidence language

- **Verified — repository:** directly observed in the cited current source. It describes source behavior, not necessarily deployed configuration.
- **Verified — official:** stated by the linked first-party documentation as accessed on 2026-11-13. Product documentation does not prove local data completeness or Fastship workload performance.
- **Proposed:** an architecture, rollout, or acceptance recommendation. Numeric thresholds below are proposed initial gates, not measured achievements or industry facts.
- **Field question:** requires physical devices, local drivers/customers, road observations, provider terms, or production-scale evidence.
- **Historical:** an older report may guide a test but is not a current acceptance result.

## 3. What the repository currently does

| Layer | Verified — repository | Production implication |
|---|---|---|
| Map rendering | Web/Android use MapLibre and OpenFreeMap; Android hosts `public/map.html` in a WebView. iOS uses Apple Maps. Google is optional and build-key gated. Renderer and route-geometry provenance are constrained in [`src/map-provider.ts`](../../src/map-provider.ts). | Preserve this separation. A route from one provider must not silently be drawn on another provider's map. |
| Place search | [`src/place-search.ts`](../../src/place-search.ts) searches ten hard-coded cities and saved landmarks; exact destinations rely on saved places, manual pins, notes, and GPS confirmation. | This is a small gazetteer, not national address geocoding or autocomplete. It cannot establish rooftop/entrance accuracy. |
| Route engine | [`infra/osrm/Dockerfile`](../../infra/osrm/Dockerfile) builds OSRM v5.23.0 with the car Lua profile and MLD preprocessing, downloading the unpinned Geofabrik `israel-and-palestine-latest.osm.pbf` on each image build. [`server/main.ts`](../../server/main.ts) owns route calls and feasibility. | Rebuilds are not reproducible and can silently change routes. Pin and version the extract and profile; retain the previous known-good graph. |
| Optional Google route | [`server/domain/google-routing.ts`](../../server/domain/google-routing.ts) is an optional, billing-controlled, display-only proxy using `TRAFFIC_UNAWARE`; it does not control fares or feasibility. | It supplies neither a live-traffic ETA nor independent proof of road legality. No paid upstream behavior was tested. |
| GPS capture | [`src/background-location.ts`](../../src/background-location.ts) requests high-accuracy background fixes approximately every three seconds and defines process-restoration behavior. Active-session fencing is enabled only by explicit development/test flags. | Sampling is not delivery. Production fencing and validated restart behavior are unresolved. |
| GPS delivery | [`src/location-delivery.ts`](../../src/location-delivery.ts) filters mock/old/outlier fixes and targets five-second moving and fifteen-second stationary uploads, with receipts. Stale fixes can be discarded. | There is no durable offline queue or raw location history. A filtered/discarded fix can become an unobservable gap. |
| Driver presence | Presence and latest location are server concepts in [`server/main.ts`](../../server/main.ts) and the domain modules. | Freshness must be based on server receipt and fix timestamps; a client must not appear online indefinitely after process death. |
| Live updates | [`server/main.ts`](../../server/main.ts) implements in-process, approximately twelve-second long-poll tracking. | Multiple replicas require shared fan-out and resumable event ordering; process-local waiting lists are insufficient. |
| Dispatch | [`server/domain/dispatch.ts`](../../server/domain/dispatch.ts) implements candidate ranking, offers, expiry, acceptance, and reassignment primitives. [`server/domain/eligibility.ts`](../../server/domain/eligibility.ts) keeps automatic dispatch behind a test gate. | Ordinary production behavior remains legacy broadcast/first-accept assignment. Source primitives do not establish safe multi-replica production activation. |
| Arrival/lifecycle | [`server/domain/ride-lifecycle.ts`](../../server/domain/ride-lifecycle.ts) includes GPS arrival, boarding proof, freshness checks, and operator overrides. Current arrival tolerance can be 300 m with a fix as old as 120 seconds. | Those values are calibration inputs, not verified arrival accuracy. GPS arrival must not be conflated with rider boarding. |
| ETA | [`server/main.ts`](../../server/main.ts) and [`SPEC-routing-eta.md`](../../SPEC-routing-eta.md) expose route duration and display ranges. | Current ranges are heuristics, not empirically calibrated confidence intervals. |
| Checkpoint handling | Routing/checkpoint logic uses geometry and detour heuristics over OSM-derived data. | It cannot prove that all roads/checkpoints are mapped, open, legal, safe, or currently passable. |
| Offline/maps/history | The inspected client/server paths contain no offline tile store, durable offline location queue, map-matched history, or measured ETA calibration pipeline. | Do not advertise offline navigation, complete tracking history, or learned ETA as existing capabilities. |
| Realtime adapter | The broader audit found a gated Web PubSub credential adapter while the app consumes long-poll recovery. | An available adapter is not evidence of enabled production realtime. |

Local evidence is source evidence only. No deployment outputs, cloud logs, provider bills, production database state, or current physical-device traces were inspected.

## 4. Provider and platform constraints that shape the design

### 4.1 Google Maps, Routes, and Places

**Verified — official:**

- Google's coverage table labels Palestine (`PS`) **good quality** for map tiles, geocoding, and driving directions/snap-to-roads. It marks the **traffic layer and speed limits unavailable**. The table does not establish address/POI completeness, entrance accuracy, road legality, current closures, or Places coverage for Fastship's target areas. [S1]
- Routes can return traffic-unaware routes; traffic-aware behavior requires a supported traffic preference and is not equivalent to historical ETA calibration. Fastship's existing proxy explicitly selects `TRAFFIC_UNAWARE`. [S2]
- Google Maps Platform terms restrict caching and derived content. The terms place a 30-consecutive-calendar-day limit on the listed coordinate caching exception; place IDs are exempt from the caching restriction. Exact rights depend on the specific service and current agreement, not a generic “Google allows caching” statement. [S3]
- Google's service-specific policies restrict using Google Maps Core Services with or near non-Google maps and restrict derived content. The current OpenFreeMap/Apple/Google separation should therefore remain a hard compliance boundary pending legal review. [S4]
- Google's asset-tracking documentation discusses mobility/location use cases, but it does not grant unlimited retention or use of Places/Routes content for an independent tracking or mapping database. [S5]

**Proposed:** do not enable a paid Google integration merely to fill the address registry or to obtain live Palestinian traffic. If Google is evaluated, run a separate, legally reviewed Google-map experience and benchmark search and routes independently. Do not export its results into OSM/Pelias/Valhalla/OSRM or display its route geometry on OpenFreeMap/Apple Maps without explicit contractual permission.

**Field/legal questions:** Does the intended combination violate the current agreement? Which exact fields may be cached, for how long, and for what purpose? What are actual address/POI recall and entrance error in the pilot set? No public coverage badge answers these questions.

### 4.2 OpenStreetMap, Geofabrik, Nominatim, and OpenFreeMap

**Verified — official:**

- OSM data is openly available under ODbL with attribution and applicable share-alike obligations. It is community-maintained and does not warrant complete or current Palestinian addresses, roads, access restrictions, or safety. [S6]
- Geofabrik supplies regional extracts and update metadata. A `latest` extract is a moving input, not a reproducible release or quality certification. [S7]
- Public Nominatim limits an application to an absolute aggregate maximum of one request/second, forbids autocomplete and systematic queries, and prohibits reselling geocoding results; its examples explicitly include package/vehicle-tracking applications. It recommends third-party or self-hosted alternatives for larger requirements. This policy applies to the OSMF-run service, not automatically to every independent Nominatim deployment. [S8]
- OpenFreeMap permits free use under its current terms but provides the service “as-is,” disclaims availability warranties, and may discontinue it without notice. Its terms dated 2026-10-14 allow an app-initiated offline download only when each download is at most **3,000 tiles or 50 MB**, uses at most **four parallel requests**, and sends a unique app-identifying User-Agent. Larger use requires contacting OpenFreeMap. Other automated collection is prohibited except that documented offline case. [S9]

**Proposed:** keep public Nominatim out of the production request path. Treat OpenFreeMap as a pilot dependency with a tested failover/self-hosting plan. Review ODbL attribution and share-alike obligations with counsel for any published derived database. Offline capabilities must respect the actual tile-provider licence; do not build a scraper around OpenFreeMap.

### 4.3 Candidate engines

| Candidate | Verified — official capability | What remains unproven |
|---|---|---|
| **OSRM** | The car profile and routing API provide route geometry/duration over imported OSM data; MLD is already used by Fastship. [S10] | Local access-rule quality, reproducible imports, ETA accuracy, custom checkpoint policy, matrix capacity, and route regression rate. |
| **Pelias** | Open-source geocoder architecture supports structured/search workflows and multiple data sources. Its interpolation component can estimate positions along road networks where address-range data exists. [S11] | Interpolation is not surveyed rooftop truth. Palestinian address/POI recall, Arabic ranking, aliases, and exact-vs-interpolated labeling require a ground-truth pilot. |
| **Valhalla** | Official documentation covers route, matrix, and map-matching/trace endpoints with costing/options. [S12] | Whether its costing and map matching outperform OSRM on Fastship's real routes, at acceptable latency/resource cost. |
| **GraphHopper** | Official documentation covers routing, matrices, custom models/profiles, route optimization, geocoding, and map matching. Hosted APIs have authentication, credits, rate limits, and coverage/plan constraints. [S13] | Local data quality, self-host versus hosted fit, licence/terms, optimization need, cost, and actual route/ETA results. |

**Proposed candidate order:** Pelias for the search pilot; Valhalla as the first routing challenger; GraphHopper only if the same ground-truth tests show a material benefit or a confirmed matrix/optimization requirement. Do not run three full migrations. Run small reproducible offline bake-offs against the same extract and test set.

### 4.4 Mobile OS constraints

**Verified — official:**

- Expo SDK 57 `expo-location` documents foreground/background permissions, background tasks, accuracy, time/distance intervals, and platform-specific behavior. A configured task is not a promise of continuous fixes under every kill, reboot, permission, or power state. [S14]
- Expo's SDK 57 MapView module wraps Google Maps on Android and Apple Maps on iOS; Fastship's MapLibre WebView path is a separate implementation and must be tested as such. [S15]
- Apple describes significant-location-change monitoring as updates after roughly **500 m** movement and normally no more often than once per **five minutes**. That service is unsuitable as the sole live driver-tracking stream. [S16]
- Android background-location access has separate permission and background/foreground-service restrictions. Users can grant limited/foreground-only access or revoke it; policy-compliant disclosure and real permission-flow tests are required. [S17]

**Proposed:** do not use web tracking as a substitute for native background driver tracking. On force-stop/termination, fail safely: the server must age out freshness and show stale/offline rather than claiming continued live tracking. Any OS relaunch behavior must be measured separately from normal background behavior.

## 5. Proposed production architecture

### 5.1 Keep the seven data planes distinct

| Plane | Proposed owner | Required provenance/output |
|---|---|---|
| **Tiles/visuals** | MapLibre + versioned self-hosted or contracted OSM tiles; Apple Maps on iOS; optional separately compliant Google experience. | Tile/style version, attribution, provider, offline package licence/version. |
| **Geocoding/search** | Pelias candidate plus Fastship curated places and aliases. | Result ID, source, exact/interpolated/centroid type, confidence, dataset version, language/alias provenance. |
| **Routable roads** | OSRM baseline; Valhalla challenger; GraphHopper only after comparative gate. | Engine/profile/version, OSM extract hash/date, snapped-input distance, route geometry, restrictions/warnings. |
| **Addresses/POIs** | Fastship private registry + appropriately licensed OSM imports; manual confirmation remains available. | Confirmed pin/entrance, accuracy, source, verifier/date, local label, landmark and directions; never fabricated precision. |
| **Traffic/ETA** | Fastship measured trips and time-of-day/delay model; router duration is only one feature. | Model/version, route duration, delay components, empirical interval/coverage, stale-data indicator. |
| **GPS ingestion** | Native capture, durable queue, idempotent server ingest, raw immutable history, latest-state projection. | Fix ID/session epoch/device timestamp/server receipt/accuracy/mock flag/sequence/ack/gap. |
| **Backend dispatch** | PostgreSQL-authoritative job/offer/assignment state and audit events; routing only supplies costs/feasibility. | State version, idempotency key, actor, reason, route snapshot, event sequence, correlation ID. |

A visual provider upgrade affects only the first row unless independent tests prove otherwise.

### 5.2 Reproducible map-data supply chain

**Proposed:**

1. Download an approved Geofabrik extract in a controlled data-build job; save its source URL, publication timestamp, byte hash, licence/attribution, importer version, and validation report.
2. Build tiles, Pelias data, OSRM/Valhalla graphs, and map-matching inputs from that same release. Never let a container rebuild silently pull `latest` into production.
3. Validate administrative coverage, road counts/lengths by class, disconnected components, turn/access restrictions, address/POI counts, Arabic/English names, and route regression fixtures before promotion.
4. Canary the new graph with replayed production-like route pairs. Preserve the previous release and a tested rollback.
5. Return `dataset_version`, `engine`, `engine_version`, and `profile_version` with routes and ETA observations so bad releases can be identified.

This improves consistency; it does not guarantee that the underlying map is complete or lawful to drive.

### 5.3 Palestinian address and POI model

**Proposed record:**

- Stable internal ID; service area/locality; Arabic name and aliases; optional English/transliterated aliases; optional street/building/floor/apartment/postcode.
- Confirmed longitude/latitude, separate road-access/entrance point when known, capture accuracy/time, source, verification status/date, and verifier role.
- Landmark, free-form directions, access notes, contact/safety notes with appropriate privacy controls.
- Location type: `surveyed_entrance`, `confirmed_pin`, `address_interpolated`, `building_centroid`, `street_centroid`, `locality_centroid`, or `manual_unverified`.
- Provenance and licence for every imported field. Never relabel an interpolation or centroid as a rooftop/entrance.

**Search behavior:** normalize Arabic diacritics and common letter variants without destroying the original text; index local spellings and aliases; rank verified Fastship places above unverified centroids for operational bookings; show the location type and let the user confirm/correct the pin. A failed search must offer saved place/manual pin/directions rather than silently choosing a distant similar name.

### 5.4 Routing and ETA

**Proposed routing policy:**

- Snap pickup/dropoff to a legal accessible road, report snap distance, and require confirmation when it exceeds a calibrated threshold. Keep the customer's original pin.
- Test one-way streets, turn restrictions, vehicle access, private/restricted roads, unpaved roads, barriers, and locality-specific driver rules. Maintain these as versioned routing policy, not ad hoc client route edits.
- Treat checkpoint avoidance as uncertain operational guidance. Store observation source/time and allow dispatcher override; never label a route “safe,” “open,” or “legal” solely because OSRM found geometry.
- Use a matrix only as a dispatch cost/feasibility input after its own latency and accuracy tests. Route optimization is not required for the current single-offer dispatch flow and should not be purchased by default.

**Proposed ETA model:**

`ETA = calibrated road travel time + pickup/approach + stop/service dwell + measured area/time delay + explicitly uncertain checkpoint/delay component`

- Store observed request, driver-start, arrival, boarding, pickup, and completion timestamps with the route/model/dataset versions.
- Compare router-only baseline against calibrated models by urban/rural area, distance band, time/day, and trip type.
- Show an interval only after empirical coverage testing; otherwise label it an estimate and avoid false precision.
- Use own-trip aggregates only with privacy retention/access controls. Map matching may clean a derived trajectory but raw fixes remain authoritative evidence.

## 6. Lawful map correction and local operations

**Proposed workflow:**

1. Collect driver/customer correction reports with consent, approximate category, optional precise entrance, photo/note only where lawful and safe, and observation date. Do not record people, documents, or unrelated private property by default.
2. Separate a **private operational correction** (for example, a customer's private entrance) from a **public OSM correction** (for example, a missing public road). Apply privacy and access rules to each.
3. Verify public edits through a trained mapper and the local OSM community. Use compatible sources and follow organized-editing/import rules; do not trace proprietary maps or import Google geocodes.
4. Keep disputed access, checkpoint, closure, and safety claims as dated observations requiring review. Do not convert one driver's successful passage into a permanent public access rule.
5. Rebuild all affected data planes on a controlled release, run route/search regressions, and notify operations of meaningful changes.
6. Provide attribution in every applicable map/search surface and obtain legal review for ODbL produced-work/derived-database obligations.

**Field question:** who owns verification, community relations, dispute resolution, and emergency rollback? Without named owners and an audit trail, a correction pipeline will create inconsistent routing rather than trustworthy local data.

## 7. Server-authoritative lifecycle and dispatch

### 7.1 State and invariants

**Proposed job states:** `draft → submitted → matching → offered → assigned → driver_en_route → arrived → in_progress → completed`, with explicit `cancelled`, `expired`, `unmatched`, `release_pending`, and `exception` paths. Product naming may follow the existing domain, but transitions must be explicit and append-only in the audit log.

**Required invariants:**

- At most one active assignment per job and at most one conflicting active assignment per driver.
- At most one acceptable offer per job/driver attempt; offer acceptance checks expiry, job version, driver eligibility, and current assignment in the same transaction.
- Cancellation, release, acceptance, arrival, boarding, and reassignment use idempotency keys and expected state/version.
- Every transition records actor, server timestamp, previous/new state, reason, operation ID, and correlation ID.
- An operator override is a privileged audited transition, not silent mutation of history.
- Offline client actions are pending observations. The server resolves conflicts; last-write-wins must not move a job backward.
- Reassignment creates a new assignment/offer generation and revokes the previous driver's live session and private job access as applicable.

### 7.2 Dispatch activation

**Proposed:** keep the existing test gate until shadow mode demonstrates correct candidate ranking and no regressions. Automatic dispatch should consume fresh server locations, route cost/feasibility, eligibility, offer expiry, and current state. Legacy broadcast/first-accept remains the rollback path only while it is operationally safe and supported.

Race tests must cover two drivers accepting one offer, one driver accepting two jobs, acceptance at expiry, customer cancellation during acceptance, operator release during driver arrival, reassignment while offline, duplicate webhooks/requests, and two API replicas acting concurrently. Exactly one legal outcome may commit; all other callers receive a deterministic conflict/current state.

### 7.3 Realtime fan-out and recovery

**Proposed minimal architecture:**

1. Commit domain change and a transactional outbox row in PostgreSQL in the same transaction.
2. Publish committed events through a shared broker/pub-sub layer to every API replica. Existing gated Web PubSub may be evaluated before adding another broker.
3. Give each job/event stream a durable monotonically increasing sequence. Clients reconnect with the last acknowledged sequence and replay gaps from persistence.
4. Keep public tracking on a least-privilege projection: no driver identity, precise historical trail, private notes, or internal dispatch candidates unless explicitly authorized.
5. Retain long-poll as a fallback if useful, but feed it from shared events; process-local waits alone are not multi-replica fan-out.

## 8. Tracking, offline recovery, and anti-spoofing

### 8.1 Device-to-server flow

**Proposed:**

1. On an authorized active trip/shift, create a server-issued tracking session with an epoch/generation. Enable this fencing in production, not only development/test.
2. Append each accepted native fix to a durable local queue before attempting upload. Include stable fix UUID, session epoch, sequence, device timestamp, coordinates, accuracy, speed/heading when available, and mock-location signal.
3. Upload bounded batches with retry/backoff. The server deduplicates `(driver, session_epoch, fix_uuid)` and acknowledges durable sequences. Delete local records only after acknowledgment.
4. Bound storage by bytes/time and expose an explicit data-gap record if the cap is reached; never silently discard the oldest fixes. Keep personally sensitive history encrypted/protected and subject to a documented retention policy.
5. On network reconnect, replay in sequence order without blocking current capture. On process restart, restore the queue and validate the session with the server. Resume only if the trip/shift remains authorized; otherwise stop the native task and clear/revoke stale credentials.
6. Preserve raw fixes in an append-only server store and update a separate latest-location projection. Track server receipt time, ingestion rejection, quarantine reason, and gaps.
7. Derive map-matched points for display/analytics asynchronously. Never overwrite raw coordinates or use a snapped point as sole arrival evidence.

### 8.2 Freshness, arrival, and permissions

- Mark tracking `connecting`, `live`, `delayed`, `stale`, `offline`, `permission_blocked`, or `ended` from explicit evidence. A socket being open is not proof of fresh GPS.
- Replace the unvalidated 300 m/120 s arrival rule with field-calibrated thresholds. Consider accuracy radius, consecutive fixes, speed/dwell, access-side geometry, and rider/driver confirmation. GPS arrival and rider boarding remain different events.
- Handle approximate location, denied background permission, revoked permission, disabled location services, battery optimization, app backgrounding, force-stop, reboot, and logout visibly. Never show “live” when capture is blocked.
- Treat mock flags, impossible speed, teleportation, timestamp anomalies, replay, accuracy anomalies, and session mismatch as risk signals. Quarantine/reject according to policy and expose review; no client-only check proves a device is unspoofed.
- Define raw-location retention, driver/customer visibility, operator access, export/delete behavior, and public-tracking minimization before collecting a larger history.

### 8.3 Offline maps are a separate decision

Do not build a broad offline tile downloader merely because GPS can work offline. First test whether saved job snapshots, written directions, confirmed pins, and a cached last route are enough. If offline tiles are required, use a provider/licence that permits the package size and update pattern, record package version, bound storage, and test stale-road behavior. Dispatch, server-confirmed status, and live ETA still require connectivity.

## 9. Staged rollout and acceptance gates

All thresholds in this section are **proposed initial go/no-go gates**, not measured Fastship results. The owner may adjust them before the pilot based on operational risk, but must not silently relabel a failed gate as passed. Any safety-critical illegal-route result is a release blocker even if aggregate metrics pass.

### Stage 0 — Freeze evidence and make builds reproducible

- Capture the current OSRM/search/renderer baseline, route fixtures, upload traces, and lifecycle race results.
- Replace the moving `latest` production input with an approved hashed release and record all engine/profile versions.
- Decide Google/non-Google compliance and OSM attribution with counsel before enabling any new provider flow.
- Build an anonymized ground-truth set: at least **300 verified destinations**, **200 route pairs**, and **100 completed trip timelines**, stratified across the actual launch neighborhoods, road classes, Arabic/English names, urban/rural areas, distance bands, and time bands. Include difficult and negative cases, not only known-good landmarks.
- **Exit:** every fixture has provenance/location type; no secret or unnecessary customer PII; previous graph rollback is demonstrated; baseline metrics are reproducible.

### Stage 1 — Search, road data, and routing bake-off

- Compare the current gazetteer, Pelias candidate, and any legally approved commercial candidate against the same blind query set.
- Compare OSRM and Valhalla on the same OSM release; add GraphHopper only if it answers a demonstrated unmet need.
- Correct high-impact data through the lawful workflow and rerun the entire suite before choosing.
- **Exit:** all functional/data gates below pass in the chosen pilot areas, or the rollout retains explicit manual-pin/directions fallback and does not claim address/search completion.

### Stage 2 — Tracking recovery and measured ETA

- Release durable queue, raw ingest/history, production session fencing, and explicit freshness behind a small internal-driver flag.
- Collect physical-device traces and completed trip timelines; calibrate arrival and ETA only after data quality passes.
- **Exit:** no unknown fix loss, duplicates are harmless, safe stale/offline behavior passes every process/permission case, battery budget passes, and ETA is no worse than the current baseline in every launch stratum.

### Stage 3 — Multi-replica realtime and dispatch shadow

- Deploy transactional outbox, shared fan-out, resumable sequences, idempotent transitions, and invariant tests.
- Run automatic dispatch in shadow without sending real offers; compare its decisions with dispatchers and legacy behavior. Review bad routes, stale fixes, long waits, and fairness/operational concerns.
- **Exit:** all race/load/recovery tests pass at two times forecast load and shadow findings are resolved.

### Stage 4 — Limited automatic dispatch and general availability

- Enable for one low-risk service area/shift with a named operator, kill switch, rollback, audit dashboard, and driver/customer support notice.
- Expand only after at least **500 automatically dispatched jobs** with zero double assignments, zero unauthorized state transitions, and no unresolved safety-critical route/tracking incident.
- General availability additionally requires a supported tile/realtime/data operating plan, on-call runbooks, backup/restore, retention controls, and monitoring/alert tests.

## 10. Quantitative acceptance matrix

### 10.1 Search, address, and route quality

| ID | Test | Proposed pass threshold and evidence |
|---|---|---|
| D1 | Blind address/POI search over all ground-truth records, including Arabic, aliases, misspellings, empty and ambiguous queries. | For curated launch coverage, correct result recall@5 **≥95%**; wrong top-1 silent selection **≤1%**; every no-result/ambiguous case offers pin/directions fallback. Report per area/language, not only aggregate. |
| D2 | Coordinate truth by location type. | `surveyed_entrance`/`confirmed_pin`: median error **≤25 m**, p95 **≤100 m** against surveyed truth. Interpolated/centroid results are never presented as exact; their errors are reported separately with no false-precision pass claim. |
| D3 | Route completion on 200 route pairs plus disconnected/negative fixtures. | Valid route or explicit manual-review result for **100%**; unexpected no-route **≤2%**; snap distance above calibrated warning threshold is always surfaced. |
| D4 | Legality/access review on driven routes and known restrictions. | **Zero** known illegal/private/restricted traversals presented as permitted; zero missed one-way/turn fixtures. Any safety-critical violation blocks release until corrected and regressed. |
| D5 | Distance/geometry accuracy against driven traces. | Median absolute route-distance error **≤5%**, p95 **≤12%**, excluding documented detours which are reported separately. Route geometry provider matches the approved display/compliance path. |
| D6 | Reproducibility and rollback. | Two builds from the same release produce identical data hashes and fixture routes; rollback completes in **≤15 min** with no mixed dataset versions. |
| D7 | Route/matrix service performance on production-like infrastructure. | At Stage 3 load, single-route server p95 **≤1.5 s**, p99 **≤3 s**; dispatch matrix p95 **≤3 s** for the actual candidate batch size; upstream error **<0.5%**. No paid load test is assumed here. |
| D8 | Arabic/local-name operations review. | Drivers correctly identify the intended place in **≥95%** of randomized local-name tasks; original Arabic and written directions are preserved and readable in RTL/mixed-direction layouts. |

### 10.2 ETA and arrival

| ID | Test | Proposed pass threshold and evidence |
|---|---|---|
| E1 | Chronological holdout: train/calibrate on earlier completed trips, test on later unseen trips. | Calibrated model beats router-only/current heuristic on median and p90 absolute error overall and in every launch stratum; no stratum regresses by more than **5%**. Publish sample sizes. |
| E2 | ETA accuracy for trips under 20 km. | Median absolute error **≤2 min or 15%**, p90 **≤5 min or 30%**, using the larger allowance in each pair; measure from the same defined ETA start event to actual arrival. Longer trips get a separately reported gate before promises are made. |
| E3 | Interval calibration on unseen trips. | An advertised 80% interval has empirical coverage **75–85%**; an advertised 95% interval has **90–98%**. Otherwise remove the probability label. |
| E4 | Arrival geofence versus observed arrival. | False automatic arrival **<0.5%**, missed arrival **<2%**, and no boarding transition based only on GPS. Evaluate dense urban, weak GPS, multi-entrance, and 300 m boundary cases. |
| E5 | Delay/checkpoint uncertainty. | Every such estimate exposes observation age/source and fallback; **100%** of closed/unknown test cases avoid an “open/safe” guarantee. Measure delay error separately rather than hiding it in route duration. |

### 10.3 Physical-device tracking, battery, permissions, and spoofing

Use the connected physical **Samsung SM-A5360 (`R5CTB0FJP9Z`)** for Android acceptance when attached; **do not start an emulator**. iOS requires a representative physical iPhone supplied by the owner. These are test specifications, not completed results.

| ID | Required scenario | Proposed pass threshold and evidence |
|---|---|---|
| T1 | 60-minute moving route on each physical OS/device class: foreground, background, screen locked, changing networks. | Connected moving accepted-fix interval median **≤7 s**, p95 **≤12 s**; server-to-client live-update p95 **≤2 s** after realtime rollout; freshness never claims live beyond its stated threshold. |
| T2 | 30-minute airplane-mode/network-loss interval during an active trip, then reconnect. | **100%** of locally captured eligible fixes either arrive once logically or appear in an explicit gap report; **0** duplicate domain effects; replay preserves order and current capture continues. |
| T3 | App swipe-kill/force-stop, crash, reboot, logout, and relaunch. | No false live state after freshness expiry (**≤30 s** after expected upload lapse); no unauthorized auto-resume; valid queue survives process death; Android force-stop/iOS termination behavior is reported honestly, not assumed to resume. |
| T4 | Stationary driver for 60 minutes and moving/stationary transitions. | Stationary accepted cadence p95 **≤20 s**; moving cadence recovers within **15 s**; no excessive high-accuracy wakeups after trip end. |
| T5 | Four-hour active shift battery/thermal test with a matched idle/control run, screen off where operationally safe. | Incremental battery drain **≤10 percentage points over four hours** on the designated Android pilot device; no thermal warning or OS background-service failure. iOS gets its own measured budget before launch rather than inheriting Android's result. |
| T6 | Fresh install and every permission choice: precise/approximate, foreground-only, deny, revoke in settings, location off, battery optimization. | **100%** show the correct actionable state; zero false live/background promises; no core customer booking crash when location permission is denied. |
| T7 | Mock provider, replayed fix UUID, duplicate sequence, old/future timestamps, teleport/impossible speed, poor accuracy, stale session epoch. | **100%** are rejected, quarantined, or explicitly flagged according to policy; no spoofed fix can authorize arrival/boarding or revive a revoked session. This does not claim detection of every rooted-device spoof. |
| T8 | Public/private tracking authorization and retention. | Public responses contain only approved fields in **100%** of authorization fixtures; revoked/reassigned driver loses private job access; retention/deletion jobs produce auditable results. |

### 10.4 Lifecycle, dispatch, and load

| ID | Test | Proposed pass threshold and evidence |
|---|---|---|
| L1 | All pairwise lifecycle races in §7.2, repeated against at least two API replicas. | **Zero** double assignments, backward transitions, expired acceptances, unauthorized overrides, or duplicate audit effects. Conflicts return current authoritative state. |
| L2 | Idempotent retry after timeout at every mutating endpoint and lost response. | Same operation ID yields one logical effect; client reconciles unknown outcomes; **0** duplicated offers, jobs, arrival events, or cancellations. |
| L3 | Sustained load at **2× forecast**, with a minimum pilot stress of **1,000 active drivers at one fix/5 s = 200 fix writes/s**, **5,000 tracking clients**, for **60 minutes**. | Ingest acknowledgment p95 **≤500 ms**, domain event fan-out p95 **≤2 s**, request errors **<0.1%**, **0** acknowledged event loss, no unbounded queue growth; resource headroom **≥30%**. This is a test size, not a capacity claim. |
| L4 | Replica kill, broker/pub-sub disconnect, database failover where supported, client reconnect from stale sequence. | No acknowledged event disappears; clients replay gaps exactly once logically; stale/offline is shown during degradation; recovery completes without manual cache clearing. |
| L5 | Dispatch shadow on at least **500 representative jobs** before limited activation. | **0** invariant violations; automatic candidate route feasibility is at least as good as legacy; dispatcher-documented bad assignments **<2%**, with every severe case blocking rollout. |
| L6 | Limited rollout of **500 real automatic jobs**. | **0** double assignments/unauthorized transitions; **100%** offers/releases/reassignments auditable; kill switch returns to the approved legacy/manual path within **5 min**. |
| L7 | Monitoring and incident drills. | Alerts fire for fix freshness, queue growth, route failures, offer expiry anomalies, outbox lag, and fan-out lag within **2 min** of injected breach; named operator completes rollback drill. |

## 11. Field-pilot questions that documentation cannot answer

1. **Addresses:** For each launch neighborhood, what fraction of real orders has a formal address, reliable pin, known landmark, or only verbal directions? What entrance—not rooftop centroid—does the driver actually need?
2. **Language:** Which Arabic names, alternate spellings, English aliases, camp/neighborhood names, and local landmarks do customers and drivers use? Does ranking preserve rather than “correct” their meaning?
3. **Roads:** Which missing roads, private/restricted segments, barriers, turn restrictions, unpaved segments, and inaccessible entrances produce actual courier failures?
4. **Checkpoints/closures:** Which observations can be collected safely and lawfully, how quickly do they become stale, and who may authorize operational avoidance? Never ask a driver to probe a restricted crossing for a test.
5. **ETA:** What delays dominate—road travel, finding an entrance, waiting for rider, checkpoint queues, parking, or merchant preparation? Does accuracy differ systematically by area/time?
6. **GPS:** What are moving cadence, accuracy, battery use, process-death behavior, and network gaps on the actual driver devices and carriers? What happens after force-stop, reboot, and permission revocation?
7. **Arrival:** What radius/freshness/dwell combination avoids false arrival in dense neighborhoods and multi-entrance sites? When is explicit confirmation required?
8. **Dispatch:** Do dispatchers trust route-ranked offers, and why do they override them? Are wait time, driver fairness, vehicle type, locality knowledge, and current commitments represented correctly?
9. **Offline:** Do drivers need tiles offline, or only confirmed pins, directions, assigned-job snapshots, and pending actions? How long must offline operation last?
10. **Commercial/legal:** Which provider agreement permits the exact renderer, caching, derived-data, asset-tracking, offline, and retention design? What availability/support commitment is contracted?
11. **Regional scope:** West Bank evidence must not be generalized to East Jerusalem or Gaza. Each proposed operating area needs its own operational, network, legal, safety, address, and route acceptance evidence.

## 12. Explicit non-decisions and risks

- **No final map, geocoder, router, broker, or hosted-provider selection is made.** Pelias, Valhalla, and GraphHopper remain candidates.
- **No paid-provider quality or billing behavior was verified.** Historical Azure/Google/device reports are not current primary acceptance evidence.
- **No claim of complete Palestinian OSM or Google coverage is made.** Google's “good quality” labels and engine feature lists do not answer the local ground-truth questions.
- **No current battery, moving cadence, killed-process, spoof-resistance, ETA, or load result is claimed.** The values above are proposed acceptance thresholds.
- **No offline dispatch or offline server confirmation is proposed.** Local records remain pending until the authoritative server acknowledges them.
- **No route can guarantee legality, safety, checkpoint passage, or current traffic.** Operations must retain override and incident procedures.
- **The public OpenFreeMap and Nominatim services are not production SLA solutions.** Their documented terms require an explicit alternative/operating plan.
- **Do not mix Google and non-Google content** or import proprietary results into OSM/private datasets without a reviewed contractual and licence basis.

## 13. Official source register

All web sources below were accessed **2026-11-13**. Documentation can change; recheck the live terms and exact SDK/service version before implementation or procurement.

| ID | Official source | URL | Accessed |
|---|---|---|---|
| S1 | Google Maps Platform coverage details — Palestine row and feature-quality definitions | https://developers.google.com/maps/coverage | 2026-11-13 |
| S2 | Google Routes — traffic-aware/routing preference documentation | https://developers.google.com/maps/documentation/routes/traffic_on_polylines | 2026-11-13 |
| S3 | Google Maps Platform Terms — caching restrictions and exceptions | https://cloud.google.com/maps-platform/terms/maps-service-terms#caching | 2026-11-13 |
| S4 | Google Maps Platform service-specific terms and Places policies — caching, derived content, and non-Google-map restrictions | https://cloud.google.com/maps-platform/terms/maps-service-terms ; https://developers.google.com/maps/documentation/places/web-service/policies | 2026-11-13 |
| S5 | Google Maps Platform asset-tracking documentation | https://developers.google.com/maps/documentation/transportation-logistics/asset-tracking | 2026-11-13 |
| S6 | OpenStreetMap copyright and ODbL guidance | https://www.openstreetmap.org/copyright | 2026-11-13 |
| S7 | Geofabrik Israel and Palestine extract/download metadata | https://download.geofabrik.de/asia/israel-and-palestine.html | 2026-11-13 |
| S8 | OSM Foundation public Nominatim usage policy | https://operations.osmfoundation.org/policies/nominatim/ | 2026-11-13 |
| S9 | OpenFreeMap Terms of Service, last updated 2026-10-14 | https://openfreemap.org/tos/ | 2026-11-13 |
| S10 | OSRM v5.24 API documentation and car profile source (Fastship image currently pins v5.23.0) | https://project-osrm.org/docs/v5.24.0/api/ ; https://github.com/Project-OSRM/osrm-backend/blob/v5.23.0/profiles/car.lua | 2026-11-13 |
| S11 | Pelias geocoder and address-interpolation documentation/source | https://github.com/pelias/pelias ; https://github.com/pelias/interpolation | 2026-11-13 |
| S12 | Valhalla route, matrix, and map-matching API documentation | https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/ ; https://valhalla.github.io/valhalla/api/matrix/api-reference/ ; https://valhalla.github.io/valhalla/api/map-matching/api-reference/ | 2026-11-13 |
| S13 | GraphHopper Directions API documentation — routing, matrix, custom models, optimization, geocoding, map matching | https://docs.graphhopper.com/ | 2026-11-13 |
| S14 | Expo SDK 57 Location API | https://docs.expo.dev/versions/v57.0.0/sdk/location/ | 2026-11-13 |
| S15 | Expo SDK 57 MapView API | https://docs.expo.dev/versions/v57.0.0/sdk/map-view/ | 2026-11-13 |
| S16 | Apple Core Location significant-location-change monitoring | https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoringsignificantlocationchanges() | 2026-11-13 |
| S17 | Android background location and location-permission documentation | https://developer.android.com/develop/sensors-and-location/location/background ; https://developer.android.com/develop/sensors-and-location/location/permissions | 2026-11-13 |

### Historical local evidence, not current acceptance

- [`docs/STUDY-2026-11-01-app-maps-gps-tracking.md`](../../docs/STUDY-2026-11-01-app-maps-gps-tracking.md) — earlier implementation/device study.
- [`research_notes/Google Maps integration for Fastship/palestine_coverage.md`](../../research_notes/Google%20Maps%20integration%20for%20Fastship/palestine_coverage.md) — earlier coverage research and pilot ideas.
- [`research_notes/Azure stack evidence review/azure_maps_live_test.md`](../../research_notes/Azure%20stack%20evidence%20review/azure_maps_live_test.md) — historical Azure/OSRM comparison.

These documents may supply candidate fixtures and hypotheses. They do not replace the current official sources, source audit, physical-device runs, paid-provider validation, or quantitative gates above.
