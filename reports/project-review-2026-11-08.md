# Fastship project review — 8 November 2026

## Decision

**Fix booking recovery, current-client query amplification, closed-route selection, and GPS outlier handling before treating this workspace as release-ready.** These are reproduced defects. The source-confirmed post-wait booking authorization gap also needs repair and its own regression. The existing persistence, authorization, recovery, and provider boundaries are valuable and should be retained.

The largest measured performance gap is in the protocol the app actually sends: the same local mixed-60 workload rose from **428.82 ms to 4,183.89 ms API p95** when `journeyProtocol=1` was included. A 20-order history response grew from **3 to 65 database statements**. Fixing that read path is more useful than adding a cache service or changing databases blindly.

This review covers the current tracked **and untracked** application source, not just HEAD or the deployed service. HEAD at review start: `b60922952d607f698eee24b9c68ac3394daecd3c`. Substantial pre-existing edits and new modules are present. Source anchors below refer to this working tree. The deliverable is an audit and remediation plan; application fixes were not applied.

**Post-audit follow-up:** the owner-selected [no-test cleanup](review-2026-11-08/cleanup.md) removed three unused exports and one callback parameter across three files, with fresh lint/typecheck passes. This is partial R16 completion; the table and source anchors below describe the audit baseline. R01/R17 implementation is prepared in the [booking repair plan](../tasks/plan.md#8-november-follow-up--booking-recovery-and-authority-r01r17), not yet applied.

### Evidence vocabulary

- **Reproduced:** executed against the actual module/handler, using synthetic inputs and isolated local infrastructure.
- **Measured:** observed in a synthetic benchmark; its environment and limits matter.
- **Source-confirmed:** control flow and callers inspected, without claiming end-to-end or hardware reproduction.
- **Acceptance proposal:** a target for subsequent implementation/field work, not an achieved result.

Priorities are engineering priorities, not CVSS scores: **P1** before release/affected capability activation; **P2** next focused changes; **P3** bounded cleanup or UX consistency.

## Ranked findings

| ID | Priority | Finding | Evidence | Applicability |
|---|---|---|---|---|
| R01 | P1 | A committed booking can return a rejection to a retry; the client erases its recovery command | Quote-bound HTTP race + real catch-block execution; legacy-cap variant source-confirmed | PostgreSQL booking |
| R02 | P1 | Current-client journey projection multiplies queries and misses latency gates | Query instrumentation + mixed load | Current app against SQLite; shared read pattern also exists on PostgreSQL |
| R03 | P1 | Closure filtering can select a closed alternative although a clear route exists | Mock-provider HTTP reproduction | Baseline OSRM routing |
| R04 | P1 | Claimed better accuracy admits an impossible displayed GPS jump | HTTP upload/read reproduction | Active-job `/api/location` path |
| R17 | P1 | Quote-bound booking does not recheck session authority after provider/lock waits | Source-confirmed by Sol, Mistral and leader; not runtime-reproduced | PostgreSQL quote-bound booking |
| R05 | P2 | First Google route response can be lost across screen blur/refocus | Actual hook with controlled pending response | Booking Google preview and order Google approach |
| R06 | P2 | Global nearest-segment trimming skips a required leg of the displayed approach polyline | Actual helper, parallel-leg fixture | Private and public tracking |
| R07 | P2 | Fresh but coarse/unknown GPS produces precise ETA and nearby messaging | Source-confirmed | Tracking/approach consumers |
| R08 | P2 | Public tracking drops location accuracy | HTTP payload + type/renderer inspection | Shared tracking links |
| R09 | P2 | Refresh throttling moves the baseline routing origin by rounding GPS | Actual URL generation + callers | OSRM approach routes |
| R10 | P2 | Detour checking is quadratic on full route geometry | Synthetic microbenchmark | Closure/detour branch |
| R11 | P2 | Admin lists stop at 200; driver listing also performs per-driver aggregates | 201-driver HTTP fixture + query counts | Operator UI/API |
| R12 | P2 | Admin badges repeatedly fetch full financial statistics | Source + endpoint query count | Admin tabs/dashboard |
| R13 | P2 | Vehicle classes share car routing/ETA | Source-confirmed | Bicycle, motorcycle, truck support |
| R14 | P2 | Pickup acquisition settles on the first merely usable fix | Source-confirmed improvement opportunity | Current-location pickup button |
| R15 | P3 | Private tracking retains stale fixes indefinitely, including as route-request inputs | Source-confirmed | Private order screen |
| R16 | P3 | Small unused exports/parameters and documented drafts need disposition | Import/reference and unused checks | Maintenance |

### R01 — Booking retry can lose its recovery identity

**Sources:** `server/main.ts:1321–1345`, `1539–1560`; `src/app/book.tsx:351–385`; `server/domain/booking-receipts.ts:13–19`; `tests/booking-retry-race.test.mjs:90–100,159–210`.

Two identical requests can both miss `order_commands` before the first commits. The retry then waits on the per-customer PostgreSQL advisory lock inside `createOrder`. After the original commits, the retry sees a consumed quote and returns `409 quote_consumed`. The catch block only performs a post-rollback replay for SQLSTATE `23505`, so this conflict does not recover the winner.

The actual client treats most 4xx responses as definitive rejection and clears its stored command. The reproduction proved all three facts together: one committed searching order, a receipt pointing to that order, and a retry response that makes the real client catch block delete the recovery command. The order remains in the database/history; it is the pending-command pointer that is lost. A further booking can create duplicate demand after requoting.

**Applicability:** the executed `quote_consumed` race is PostgreSQL-only. SQLite does not issue these quotes and serializes its decisive replay with `BEGIN IMMEDIATE`. PostgreSQL legacy booking has a source-confirmed sibling: a winner creates the fifth searching order, then its waiting same-key retry fails `too_many_searching` before reaching the receipt insert. The same race does not itself create two orders; duplicate demand needs a subsequent new command.

**Smallest complete repair:** acquire the existing customer-creation lock before the decisive receipt replay, and replay before applying the searching cap or quote rejection checks. A command-key lock alone cannot enforce the customer-wide cap. Preserve payload-hash conflicts, current-session/role checks after waits, quote ownership, and consistent lock ordering across creation paths.

Retain ambiguous saved commands and recover committed results through account-owned receipts. However, `pendingOutcome` maps a null receipt to `unknown`, and `pendingReleasable` requires `absent` (`src/booking.ts:100–107`): retention alone can permanently freeze a genuinely rejected/expired command. Provide a durable rejection/closure decision that fences outstanding same-key writers before edit/discard. A null receipt, elapsed client timer, or quote expiry alone is not that fence. Do not classify every 4xx as ambiguous forever.

**Required regression:** delayed first request + concurrent same-key retry returns the same order; lost reply followed by `quote_consumed` never drops the saved command; mismatched payload remains a conflict. Include the legacy searching-cap boundary, safe release after genuine rejection, quote expiry, service changes, and capped demand during the retry window.

**Test caveat:** the existing test fails first at line 97 in Part B, before its PostgreSQL Part A runs. Part A was executed separately with module resolution adjusted in memory. It currently *asserts the defect* (409 and command clearing), so its successful reproduction is not a green fixed-behavior regression. Part B's preservation assertions for several refusal codes do not demonstrate that many committed-order interleavings. Update both halves when implementing. Its comment that `/price` always supplies a quote is also too broad: the default SQLite path does not.

The quote branch additionally awaits `roadRoute` at `server/main.ts:1400` while holding customer/quote locks. The HTTP reproduction parked there and observed a waiting retry. PostgreSQL's outer HTTP transaction starts at `server/main.ts:3212`; the handler's apparent BEGIN/COMMIT are savepoints (`server/db/persistence.ts:173–182,225–244`). Moving routing above the handler BEGIN alone does not leave that outer transaction. Move provider work outside the actual transaction envelope using a revision-bound result, then revalidate authority, feasibility and quote state inside the short committing transaction. Do not remove the final prohibition check to shorten the lock.

### R17 — Quote-bound provider waits outlive the last session check

**Sources:** `server/main.ts:1325,1400–1403,1427–1437,1525–1529,1547`; `server/domain/commands.ts:10`; `tests/booking-auth.test.mjs:79–94`.

For the installed client's `requestId` path, authentication is rechecked before `createOrder`, but the quote branch then waits for customer/quote locks and routing without rechecking the session before insertion. A recently used session can be revoked during that wait; the subsequent write has no session fence. The versioned-command wrapper immediately invokes the handler when `commandId` is absent. This is a source-confirmed authorization window, not a runtime-reproduced logout incident. Existing booking-auth tests cover legacy smart routing, where the provider wait precedes reauthentication.

Mistral independently accepted this trace. The caller starts authenticated; the defect is revocation during an in-flight request, not anonymous booking. The leader also checked the two remaining peer-review questions: initial wrapper authentication (`server/main.ts:3149–3152`) precedes the wait, and `dispatchOrBroadcast`/`newJobPush` (`1109–1131`, called at `1454`) and ride dispatch (`server/domain/dispatch.ts:90–200`) do not revalidate the customer's session. Driver-presence checks in dispatch serve a different principal. The analysis uses a recently touched session so the conditional hourly session-timestamp update is not an incidental lock.

**Repair and regression:** revalidate and serialize current session/role authority against revocation after provider/lock waits and before replay or mutation. Test a quote-bound request parked at the provider, complete logout, then release routing: no new order or receipt may commit. Keep valid-session booking and idempotent replay intact. Consider the post-commit journey projection separately: rejecting a response cannot undo an already committed order.

### R02 — Journey projection turns a bounded list into N+1 reads

**Sources:** `src/api.ts:22–26`; `server/main.ts:1661–1676,3218–3233`; `server/domain/journey.ts:46–66`; `server/db/persistence.ts:122–148,168–198`; `scripts/check-load.mjs`.

The client automatically opts relevant paths into `journeyProtocol=1`. After the handler has already produced its response, `decorate` authenticates again and calls `getOrder` for every order. `journeyOrder` then reads each eligible order's fare-change history; ride/recovery metadata can add more work. `Promise.all` does not make one PostgreSQL transaction connection parallel, and SQLite executes synchronous statements under the connection owner.

**Measured 20-order completed-history response:**

| Work | Without journey opt-in | With current-client opt-in |
|---|---:|---:|
| Authentication reads | 2 | 22 |
| List read | 1 | 1 |
| Individual order reloads | 0 | 20 |
| Fare-history reads | 0 | 20 |
| BEGIN/COMMIT | 0 | 2 |
| **Total statements** | **3** | **65** |

The fixture used a customer and 20 completed orders without assigned-driver/ride work; this is not an upper bound for richer payloads. Local `PRAGMA index_list('security_events')` returned no indexes. `EXPLAIN QUERY PLAN` for the latest `DESTINATION_ACCEPTED` lookup returned **`SCAN security_events`**. Existing driver/customer statistics indexes do not solve that lookup.

**Smallest complete repair:** fetch and project the response within one authorized, consistent snapshot; authorize the viewer once at the correct boundary; batch authorized orders, relevant fare changes, and ride metadata. Preserve field-level privacy, former-driver restrictions, assignment/version binding, and revocation behavior. Do not simply reuse stale handler objects without authorization, or remove the transaction. Reuse `jobCardData`/request-scoped memo patterns already in the project. Add the appropriate order/action/id index for retained fare-history queries, checking its plan on both backends.

Authenticating once must not remove per-order authorization. Fare-history visibility at `server/domain/journey.ts:60–64` permits an admin, the owning customer, or the current driver only when the event's `detail.driverId` and `detail.assignedAt` match that assignment. Retain those predicates for every projected row when batching.

Preserve `validFareChange` and newest-event selection **per order**: a global `LIMIT 1` or falling back to an older eligible event when the newest is invalid/unauthorized changes the contract. Reassignment to the same driver must not reveal an earlier assignment's fare history.

**Required regressions:** query count remains bounded as a page grows from 1 to 20/200 orders; no per-row auth or full reload; revoked/foreign/former-driver payload tests remain green. Add `journeyProtocol=1` to the representative load request path while retaining legacy protocol coverage.

#### Local load comparison

Environment: Windows, Node **24.12.0**, Ryzen **5 5600X**, **16 GiB** RAM; isolated loopback child API, synthetic **SQLite WAL**, 10,000 historical orders, 120 searching orders, 121 synthetic accounts, 60 concurrent mixed workers. Each phase uses the same eight-second request-scheduling window. These are short comparative measurements, not production capacity estimates or PostgreSQL throughput results.

| Measurement | Isolated existing harness | Same harness + current-client protocol |
|---|---:|---:|
| API p95 | 428.82 ms | **4,183.89 ms** |
| Populated jobs p95 | 425.07 ms | **4,183.89 ms** |
| Critical command p95 | 428.74 ms | **2,650.63 ms** |
| Phase requests | 1,471 | 283 |
| Observed requests/sec | 174.72 | 28.04 |
| Phase unexpected errors/timeouts | 0 / 0 | 0 / 0 |
| Event-loop p95 | 408.42 ms | 1,934.62 ms |
| Idempotent bookings stored once | 123 | 24 |
| Existing latency gates | Pass | **Fail** |

Both runs passed the separate foreign/anonymous-access, accepted-live-fix, lock-recovery, integrity, foreign-key and booking-once checks. Expected 401/404/503 correctness probes are not workload errors. The current-client variant evaluated the existing harness in memory and changed only request opt-in/output paths; API source and repository harness were unchanged.

An earlier contended run overlapped other review work and reached 700.4 ms API / 695.28 ms jobs p95. It is not used as a stable regression finding. The isolated comparison above is the relevant evidence.

Artifacts: [baseline](review-2026-11-08/load-baseline.json), [current client](review-2026-11-08/load-current-client.json), [comparison chart](review-2026-11-08/load-comparison.html). Original per-request data remains under `%LOCALAPPDATA%/Temp/opencode/review20261108/load-journey/` and `.expo/load/`.

### R03 — A clear fastest route does not make every alternative safe

**Sources:** `server/main.ts:2582–2609`; callers at `1212,1400,2637,2663–2675`.

Closure filtering runs only if `routes[0]` crosses a closure. However, `bestRoute(routes, delay)` can select a different route because slow-checkpoint penalties change the ranking.

**Reproduction:** a clear 600-second first route carried a slow-checkpoint penalty; a 660-second alternative crossed a closed checkpoint. `/api/route` selected the closed alternative and returned `through: ["Closed fixture"]`, `minutes: 11`. The warning is present, but a viable clear route was unnecessarily discarded.

**Repair:** evaluate closure eligibility across all candidates before scoring; choose the best clear candidate. Try forced detours only if no clear candidate exists. Keep an explicit degraded/no-clear-route outcome if all choices are blocked, and preserve closure provenance and warning text. Regression must cover clear-first/closed-second with a delay penalty, closed-first/clear-second, and all-blocked alternatives.

### R04 — Better reported accuracy is not proof of physical plausibility

**Sources:** `server/main.ts:2395–2431,2450–2455`; contrasting pre-assignment policy at `server/domain/presence.ts:174–180`.

The active-job path permits an otherwise impossible fix when its claimed accuracy is better than the previous reference. An immediate jump of approximately **27.8 km**, improving reported accuracy from **30 m to 5 m**, was accepted and appeared in the customer's order response. The trusted `good_*` reference did not move, but the displayed location did. Subsequent route origin and customer messaging consume the displayed coordinate.

**Repair:** reject impossible jumps independently of a claimed accuracy improvement. Keep display validity separate from reference recovery; reacquire after an outage using a bounded consistent-fix sequence/time policy rather than accepting a single more precise-looking point. Reuse the established presence policy where appropriate, while preserving the active-assignment/session fences. Update existing `tests/map.test.mjs` assertions that intentionally expect wild improved-accuracy fixes to display.

This reproduction is **not** proof of ride-arrival bypass: `server/domain/ride-lifecycle.ts:140–180` reads the plausible reference. Client-supplied GPS also is not independent proof of a person's physical location.

### R05 — Screen refocus can leave a route with neither result nor error

**Sources:** `src/api.ts:43–98`; `src/road.tsx:66–71`; `src/app/book.tsx:125–139`; `tests/api-focus.test.mjs:39–55`.

`loaded.current` is set during focus-effect setup, before starting the request. Focus cleanup changes the response generation, so a pending success is discarded after a blur while the screen stays mounted. On refocus, the path is considered loaded and `refetchOnFocus: false` suppresses another request. The controlled pending-response reproduction left zero published data, zero error, and no replacement request. An AppState background/foreground bounce alone does not change that generation. Both the booking Google preview and order Google approach use the affected option; the booking fallback also waits for an error that never arrives in this case.

**Repair:** preserve/rejoin an in-flight request for the same path/session or distinguish requested, pending and successfully loaded states. Do not blindly refetch a billable endpoint on every refocus. Existing focus tests await the first response before leaving; add blur-before-success, blur-before-error, path change and session change while pending. Assert both result visibility and upstream-call count.

### R06 — Nearest geometry can be the wrong part of the journey

**Sources:** `src/map-math.ts:140–152`; `src/road.tsx:89`; `src/app/track/[token].tsx:75`.

The helper searches the complete line for the closest segment and then prefixes the raw fix. It has no route progress or heading continuity.

This changes the displayed approach polyline, not provider geometry, ETA calculation, authoritative assignment progress, or the trusted arrival reference.

**Executed fixture:** line `[[35,32],[35.002,32],[35.002,32.001],[35,32.001],[35,32.00002],[35.002,32.00002]]`, fix `{longitude:35.001,latitude:32.000012}`. A fix approximately 1.3 m north of the initial segment selected the later parallel segment. The six-vertex route became two vertices and the required loop disappeared.

**Repair:** retain matched progress per route/assignment/stop identity, bound candidate movement by elapsed time and plausible travel, use heading only when meaningful, and project the display onto the chosen segment. Reset when an actual reroute/assignment changes. Ambiguous initial matching should retain the route rather than invent progress. Test loops, stacked/parallel roads, U-turns and reassignments.

### R07–R09 — Carry uncertainty through the full location-to-ETA path

**R07 sources:** `server/main.ts:2395–2416`; `src/road.tsx:48–83`; `src/app/order/[id].tsx:303–306`. Accuracy up to 5,000 m or unknown is accepted, while ETA and the within-500-m message mainly check freshness/raw distance. A fresh fix can be unusable for navigation. Retain coarse last-known display if useful, but require known acceptable uncertainty before rerouting or giving proximity claims. For a conservative nearby assertion, use distance plus uncertainty, with hysteresis, rather than distance alone. An initial 100 m navigation threshold is a tuning proposal, not a measured optimum.

**R08 sources:** `server/main.ts:1810`; `src/app/track/[token].tsx:16–18`; `src/route-preview.tsx:6–9`. Public tracking experimentally returned latitude, longitude, time and heading but omitted accuracy. Add the optional accuracy field to snapshot/live contracts and the public type; existing renderer support can show its halo. Test privacy and backwards compatibility. Do not expose additional identity/location history while adding this field.

**R09 sources:** `src/map-math.ts:107–110`; `src/road.tsx:70`; `server/main.ts:2566–2568`. Three-decimal origin rounding is used as a refresh key *and* the actual routing coordinate. Near local latitudes, the rounded grid spacing is about 111 m north/south and 94 m east/west, with a maximum cell-center displacement around 73 m. That can select the wrong road or junction. Keep the movement/cadence decision separate from the precise sampled origin; retain server cache bucketing and the Google billing rules. Do not solve it by requesting a route on every GPS fix.

### R10 — Full-geometry detour checks can stall the API event loop

**Sources:** `src/map-math.ts:128–137`; `server/main.ts:2592–2605`.

`backtracks` tests all nontrivial vertex pairs. A straight-line synthetic benchmark measured approximately **30.69 / 91.92 / 343.79 ms** for **1,500 / 3,000 / 6,000 vertices**. These are helper timings, not full-request p95. Multiple candidates amplify synchronous work during routing. Closure responses are an unrepresentative path for the normal load harness.

**Repair:** use a small spatial grid/window for nearby prior segments/vertices and bound provider geometry/candidate work. Preserve legitimate U-turn behavior and avoid marking necessary real road loops as invalid merely because they return nearby. Check correctness against current fixtures and long route/detour cases before considering worker threads. Record event-loop delay during the closure-heavy load case.

### R11–R12 — Admin scale costs are identifiable and bounded

**R11 sources:** `server/main.ts:234–235,2877–2882,3025–3028`; `server/domain/statistics.ts:5–10`; `src/app/admin/users.tsx:24,89`, `subscriptions.tsx:11,32`.

A synthetic 201-pending-driver fixture produced `pendingDrivers: 201`, but `/admin/users?role=driver` returned only 200 rows and no continuation. The same listing executed **203 statements**, including **200 driver aggregate queries**. The last record is inaccessible by ordinary paging; name/phone search can narrow users, but it is not a replacement for complete queue traversal. Subscriptions similarly cap at 200; disputes/incidents also have bounded lists.

**Source-confirmed P3 extension:** `/api/admin/eligibility` also returns five lists capped at 200 without continuation: service areas, route permissions, vehicles, driver eligibility rows and verification checks (`server/domain/eligibility.ts:396–402`). This limits complete configuration review as those lists grow. It was source-checked, not exercised with a separate 201-row eligibility fixture; no enforcement bypass is demonstrated.

Those are row limits, not guarantees of 200 distinct active configurations: areas and routes can have versioned records. The policy query is a singleton, not a sixth capped list.

**Repair:** cursor-page operator queues with deterministic pending-first/id ordering; keep counts and continuation explicit. Batch driver statistics for the page in one grouped query; request memoization cannot combine 200 different IDs. The current screens render rows inline; adopt platform list virtualization for growing user/subscription/order queues while reusing existing row components and preserving RTL, touch targets, focus and loading/error states. Exact device frame/RAM improvement remains to be measured.

**R12 sources:** `src/app/admin/_layout.tsx:7`; `src/app/admin/index.tsx:27`; `server/main.ts:2841–2873`.

Badge counts poll the full `/admin/stats` response every 10 seconds; the dashboard separately polls it every 30 seconds. Instrumentation counted **13 statements** per stats response, including authentication and 11 statistics queries. Thus the navigation shell repeatedly requests historical financial/grouped totals to obtain two counts.

`/admin/stats` is outside the journey opt-in/decorating path: R12 is repeated full-statistics work, not R02's per-order query amplification.

**Repair:** share one focused stats result between shell/dashboard if practical; otherwise give badges a lightweight authorized counts query/endpoint. Keep freshness and error handling visible. Do not introduce long-lived cross-user cache state for this optimization.

Artifact: [admin query instrumentation](review-2026-11-08/admin-query-count.json).

### R13–R15 — Location quality improvements with clear limits

**R13:** `src/model.ts:19`, `server/main.ts:2530–2533`, `server/domain/google-routing.ts:353–358`. Vehicle choices include bicycles, motorcycles and trucks; routes use OSRM driving and Google `DRIVE`. Route names alone do not select a different OSRM graph/profile. Map vehicle/service to a validated routing profile and include profile/version in cache identity. Until supported, mark ETA as a car-based estimate or suppress inappropriate guidance. Truck restriction/clearance routing needs an appropriate data source; changing the label is insufficient. Preserve the separation between paid display routes and authoritative fare/feasibility rules.

**R14:** `src/customer-location.ts:75–115`. Acquisition stops at the first fresh fix with accuracy ≤100 m. This is bounded and intentional, but it does not refine an approximate network fix into an entrance-quality pickup. Show an early candidate with uncertainty; optionally refine during a short bounded window until a better measured threshold or stable cluster is reached. Never move a user-confirmed/manual pin. Keep cancellation, permissions, timeout, served-area validation and explicit entrance confirmation. Add a coarse-then-fine stream regression, and measure first-usable and settled-fix time separately on hardware.

**R15:** `src/app/order/[id].tsx:50–61,92`, `src/road.tsx:48,66–89` versus `src/location-state.ts:28–30`. Private tracking retains an old assignment fix without an age ceiling, while public tracking has a 120-second boundary. The private marker is faded and labelled last-known, limiting severity. The retained coordinate also reaches `useRoad`: its OSRM approach request can continue refreshing every 25 seconds while focused, although freshness suppresses ETA and the displayed approach line. Choose an explicit retention policy and gate stale route-request inputs as well as the marker; a consistent 120-second retention limit is the smallest option. Preserve reassignment invalidation and existing Google billing rules.

## Dead code and maintainability

Reference scanning covered **179 source/script files**, followed by caller inspection. A zero-import result is not proof of dead code in Expo Router, platform resolution, CLI scripts, workers or tests.

| Candidate | Evidence / decision |
|---|---|
| `server/domain/quotes.ts:279–288` — `fetchQuote`, `consumeQuote` | No callers found. Booking implements authoritative locking/consumption itself. Remove the unused alternatives rather than rewiring booking through a weaker helper merely to reuse it. |
| `src/driver-presence-runtime.ts:50` — exported `markPresenceReconnecting` | Export has no caller. Remove the unused exported alias after checking external consumers; retain controller behavior used elsewhere. |
| `src/customer-location.ts:31` — `cachedPickup` | Only tests call it now; `tasks/evidence.md:41–43` records its origin in owner T04 work. Establish current intent before deleting this helper and its dedicated tests. |
| `src/place-search.ts:43` — `placeAt` | Test-only use; same disposition rule. Do not remove tested behavior solely to improve a dead-code count. |
| `src/ui.tsx:509` — `index` | Unused map callback parameter. Trivial cleanup. |
| `server/domain/eligibility.ts:174` — `req`; `server/domain/ride-lifecycle.ts:110` — `row` | Unused-parameter checks identify these. Preserve required signature contracts when removing them. |
| `src/design-tokens.ts` | Documented optional draft linked from `docs/competitive-architecture-uber-tokens.md`. Adoption/archive decision, not automatic deletion. |
| `server/migrate.ts`, `server/worker.ts`, platform map files, route screens | Runtime/CLI/platform/router entry points; retain. |

There is no evidence-based case for a wholesale framework rewrite or replacing the working domain modules. `server/main.ts` is large, but extraction should follow the fixes: booking command orchestration, response projection and routing policy are natural seams. Move tests/validation/error handling with each seam; file count alone is not the goal. Keep API/DTO fields explicit at trust boundaries.

## Security and database assessment

### What the executed checks support

- Full PostgreSQL/PostGIS persistence gate completed successfully, including real rollback/commit ownership, two-process races, import plus `pg_dump`/`pg_restore` reconciliation, authorization/privacy, command/outbox recovery, identity, quotes, dispatch, ride lifecycle, private-object gates, ledger, payments and operations.
- Load correctness probes rejected foreign/anonymous reads and preserved one stored order per idempotent command under that fixture.
- Driver active-GPS/presence tests exercise assignment, device, sequence and logout fences. These do not negate R04: legacy uploads and the test-gated active-GPS upload branch converge on the same displayed-fix acceptance logic.
- Database diagnostic tests preserve SQLSTATE without copying sensitive token/PIN/password/detail fields into logs.
- The optional autonomous OpenCode endpoint is admin-only, explicitly opt-in and disabled in production (`server/domain/opencode.ts:21–33`). Its environment is filtered. Non-production process execution still shares filesystem privileges; keep the production guard until a genuinely isolated runner exists.

### Concrete improvements

1. Repair R01 using authoritative receipt/lock semantics; do not weaken idempotency or define all 4xx as safe-to-forget.
2. Repair R02 and R11 by batching, then inspect real `EXPLAIN` plans for page/history/statistics queries. Existing indexes and request memoization already help other paths; add indexes only for demonstrated scans.
3. Keep provider calls outside database lock windows where possible, with revision/authority checks on return. R01 demonstrates the quote-bound provider wait; do not generalize that every request holds a PostgreSQL write transaction.
4. Preserve activation gates: advanced PostgreSQL capabilities, dispatch, payments and private objects have explicit prerequisites. Passing synthetic provider tests does not show a payment/SMS/push provider is configured in the deployed environment.
5. Keep the tested import/restore path and its reconciliation evidence. Migrate to PostgreSQL for demonstrated concurrency/operational needs, not as a substitute for repairing N+1 queries or missing protocol load coverage.

### Dependency state, freshly checked

`npm audit --json` returned **0 critical, 0 high, 15 moderate and 1 low affected package entries** on 8 November. These are dependency-graph entries, not 16 unique exploitable vulnerabilities. The moderate roots include `glob` cancellation and `minimatch` amplification in the build/lint dependency chain; the low `deepmerge` advisory has a vendored mitigation whose focused tests passed.

Artifact: [raw npm audit](review-2026-11-08/npm-audit.json). Reconcile older reports that cite 3 high or 25 moderate entries with this current result. Preserve the audit gate and vendored-source checks. Investigate compatible SDK 57/toolchain updates; npm's suggested older Expo major is not a sound blanket fix. A version-only audit neither proves runtime exploitability nor proves the entire application secure.

## GPS and source-to-destination routing plan

Treat **measurement**, **accepted fix**, **map display**, **route origin**, **ETA**, and **arrival/nearby decisions** as different stages. Smoothing the car icon cannot correct a bad sensor fix or a route on the wrong road.

### Stage 1 — Make present information trustworthy

- Fix impossible-jump display bypass; propagate known/unknown accuracy end to end.
- Gate ETA/reroute/nearby decisions on freshness, uncertainty and assignment identity.
- Fix closure candidate selection and in-flight route focus recovery.
- Use a clear unavailable/last-known state rather than precise-looking guidance from missing evidence.
- Keep background collection limited to authorized work, and preserve current logout/assignment revocation and reduced-motion behavior.

### Stage 2 — Align route geometry with actual progress

- Separate the movement refresh key from precise routing coordinates.
- Keep route progress bounded and direction-aware; test parallel carriageways, intersections, loops and genuine U-turns.
- Recalculate when route identity, stop, supported profile, closure state or sustained off-route evidence changes. Require hysteresis to avoid GPS-noise request storms.
- Keep Google requests on existing authorized billable triggers; retain renderer/provenance rules (`src/map-provider.ts:97–101`) and free anonymous tracking. No timer-based paid route polling.
- Bound/speed up detour geometry checks before increasing candidate count.

### Stage 3 — Improve pickup and ETA with local evidence

- Refine the early pickup candidate without overriding manual confirmation; support a deliberate street entrance/side-of-road choice.
- Validate provider coverage and vehicle profiles on representative local routes. Version road/profile/restriction inputs in cache and quote provenance.
- Calibrate ETA bands by route/conditions using observed arrival error, separately measuring GPS age, dispatch/wait time and checkpoint delay. Do not present a generic 30% band as a measured confidence interval.
- Add map matching only after collecting traces that show where the bounded-progress method fails. A large filter or new paid service is not the first fix.

### Proposed acceptance gates

These are initial engineering targets to calibrate with the owner, **not measured results**:

| Area | Proposed check |
|---|---|
| Location trust | Zero admitted impossible jumps in adversarial traces; a normal fix after rejection recovers without marker freeze. |
| Navigation uncertainty | No precise ETA/nearby claim for unknown or >100 m uncertainty; tune the cutoff from observed hardware distributions. |
| Delivery freshness | Moving upload p95 ≤8 s; stationary p95 ≤20 s; measure background/screen-off separately. |
| Pickup | Measure time to first usable and stable fix; prefer ≤30 m uncertainty for confirmation when available, with an explicit manual fallback. |
| Route legality | Zero selected closed alternatives when a tested clear candidate exists. |
| Route progress | Zero wrong-leg trims in loop/parallel-road/out-and-back regression traces. |
| Entrances | At least 9 of 10 representative selected entrances reached by the correct street approach; record each exception. |
| ETA | Across ≥20 representative approaches, initial target median absolute error ≤3 min and p90 ≤7 min after settling; stratify by duration/checkpoint conditions. |
| Billing | Zero additional Google upstream calls from stationary rerenders, refocus, background bounces or anonymous tracking. |
| API | Current-client mixed-60 API/jobs p95 <500 ms and command p95 <1,000 ms, retaining correctness checks; then repeat on intended PostgreSQL runtime before extrapolating. |
| Privacy | No old-driver fix after reassignment/revocation, and no new public identity/history fields from uncertainty propagation. |

Field work should use physical **SM-A5360 / R5CTB0FJP9Z**, the loopback QA backend through `adb reverse`, and real urban, parallel-road, weak-signal and screen-off trips. The phone was discovered during this review. Sensor accuracy, entrance success, ETA error and native camera behavior require those actual observations; synthetic coordinate tests cannot establish them. The ≤`0.000001` camera-completion tolerance in native map adapters and `src/pin-sheet.tsx` is an unverified hardware lead, not a confirmed UI bug.

Expo API reference used: [SDK 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/) and [Expo documentation index](https://docs.expo.dev/llms.txt). Review the installed SDK's versioned guidance before changing native APIs.

## Verification and coverage

All executable evidence in this review is **local fallback**. K5 SSH failed with `banner exchange: Connection to UNKNOWN port -1: Connection refused`; no remote run is claimed.

| Check | Result |
|---|---|
| `npm run typecheck` | Passed client and server configurations. |
| `npm run lint` | Passed. |
| `npm test` | **Failed** at `tests/booking-retry-race.test.mjs:97`; 59 preceding suites passed. |
| 46 suites after that failure | Executed separately rather than hidden by early exit; PostgreSQL-dependent initial failures resolved against the fresh fixture, including subscription migration. This does not turn `npm test` green. |
| `npm run test:persistence` | **Passed**, complete real PostgreSQL/PostGIS 3.6 run, including legacy slices. |
| Standard isolated mixed-60 load | Passed existing gates. |
| Current-client mixed-60 load | Failed all three latency gates; correctness checks passed. |
| Focused findings | Booking race/client clearing, closure selection, GPS jump/public serialization, pending-response focus and wrong-leg trim reproduced. |
| Static quality checks | Import/reference scan, optional unused checks, query/caller/contract inspection completed. |
| Live service / signed release / field GPS | No new acceptance evidence from this review. Findings apply to the inspected workspace and local fixtures. |

Full persistence output: [persistence.log](review-2026-11-08/persistence.log). Expected failure-injection logs inside passing suites are not unhandled production errors. Local database fixtures preserve synthetic data and diagnostics in `%LOCALAPPDATA%/Temp/opencode/review20261108/` and `.expo/implementation/`; no production database was used.

Cleanup: the review fixture on 55474 stopped normally. The older 55473 fixture, already stuck in startup/recovery, returned `pg_ctl: server does not shut down` to fast shutdown; targeted `pg_ctl -m immediate` then stopped that exact data directory. Both ports were confirmed without listeners. Data/logs remain; the older fixture will require crash recovery if restarted.

Coverage included client session/API/focus/recovery, booking and order screens, admin screens, background/presence/GPS delivery, private/public maps and renderers, OSRM/Google routing and billing policy, authentication/authorization, booking/quotes, dispatch/capacity, lifecycle/custody, ledger/payments, persistence/migrations, packaging/configuration and test selection. This is a whole-project, risk-prioritized review, not proof that every line is defect-free.

Existing CI **does** include an independent PostGIS persistence job (`.github/workflows/ci.yml:56–82`). Historical claims that persistence is ungated are stale. The actual gap identified here is protocol-representative load coverage and missing interleavings/geometry cases, plus the already-red booking regression.

## Recommended implementation order

1. **Booking recovery and authority:** repair server replay/lock order, post-wait authorization and client reconciliation with safe terminal release; make the existing failing regression assert the fixed end-to-end behavior.
2. **Current-client reads:** batch journey projection and index history access; fix admin batching/pagination; enforce representative load/query-count gates.
3. **Route/location correctness:** closure filtering, outlier trust, uncertainty propagation, pending route focus and progress-aware trimming.
4. **Measured quality:** precise sampled origins, bounded detours, pickup refinement, supported vehicle profiles and physical acceptance.
5. **Small cleanup:** delete proven unused exports/parameters and make an explicit decision on test-only helpers/drafts.

Each slice should keep lint, both typechecks, affected integration contracts and the relevant PostgreSQL/privacy/billing checks green. No new dependency is needed for the first three slices on the evidence available.

## Review provenance

- **GPT-6.1 Sol, high** (`gpt-pool/gpt-6.1-sol`): booking/concurrency challenge added PostgreSQL savepoint and cap-boundary qualifications, safe terminal-release requirements, and the source-confirmed R17 authorization window. Its fresh peer check of Mistral confirmed batching privacy, eligibility truncation and the audit tally, adding newest-event/validation safeguards. The leader checked accepted source corrections.
- **Kimi K3.1 Pro, high**, through user-approved Kimi Pool: GPS/routing review and a fresh peer check of Step's frontend corrections. The leader independently reproduced the highest-impact original claims; Kimi's new scope refinements were source-verified.
- **Step 5 Preview, high:** fresh frontend/dead-code review plus independent cross-review of Kimi's R03/R04/R06/R15 conclusions. Both peer checks agreed after the leader incorporated precise scope/caller corrections. Its earlier unrelated Docker output remains excluded; those identified edits were narrowly reverted.
- **Mistral Large 4, high** (`nvidia/mistralai/mistral-large-4-1t-a52b`): database/performance review confirmed R02/R11/R12, required per-row fare-history privacy in batching, and added the five capped eligibility lists to R11. Its completed peer challenge accepted Sol's R01/R17 conclusions, savepoint semantics and terminal-release requirement. Broad security/execution claims remain attributed to leader evidence. The discovered provider offered `high`, not `max`.
- **Leader:** source validation, all local execution/measurements described here, severity calibration and synthesis.

Detailed accepted corrections and reviewer links: [cross-review record](review-2026-11-08/cross-review.md). Source checks were not relabelled as fresh runtime tests. No application file was modified by the fresh bounded-review delegates.

All four domain reviews and all four fresh peer checks have been incorporated: Kimi ↔ Step and Sol ↔ Mistral. No requested peer verdict remains pending. R17 remains source-confirmed rather than runtime-reproduced.

The review-owned change set consists of this report and selected evidence artifacts. No commit, push or deployment was performed. Pre-existing working-tree changes remain owner work.
