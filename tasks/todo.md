# App completion checklist — 29 October 2026

Read [plan.md](plan.md) and [HANDOFF.md](HANDOFF.md) first. All new items below are pending implementation, regardless of historical checks below. This extends the same app-completion work; the earlier checklist is preserved verbatim at the end.

**Common verification for every task:** `npm run lint`, `npm run typecheck`, `git diff --check`, plus the focused commands below. Run commands individually and stop on first failure. UI acceptance uses the physical phone. Follow plan.md for prerequisites, PostgreSQL isolation and evidence format. Estimated scope is S (1–2 files) or M (3–5); split larger work into numbered children before editing. Register any new suite in its runner and include that file in the budget.

## T01: Reconcile the baseline

- [x] Complete with acceptance evidence

**Description / implementation:** Assign every historical finding a current disposition and source symbol. Record HEAD, dirty files, runtime gates and baseline results. Never reopen a fixed defect solely because an old report lists it.

**Dependencies:** None.

**Files likely touched:**
- `tasks/evidence.md`
- `reports/HANDOFF-TERRA.md`
- `reports/REVIEW-2026-10-29-multiagent.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Every P1/P2/P3 finding is mapped.
- [x] Current and historical deployment claims are distinguished.
- [x] No existing edits or incomplete checklist are lost.

**Verification:** `npm run lint; npm run typecheck`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Review source before trusting report line numbers.

**Evidence:** Complete — see [evidence.md](evidence.md) "T01 — baseline reconciliation".
- Revision `85b5a3a4f3c6fc3044dc2aaaa5f95db1782f873d`, dirty tree preserved (4 modified + 4 untracked, none reset; the parent's T04 files untouched).
- Host: k5 unreachable (`ssh` exit 255, `Could not resolve hostname desktop-s2jkmk5.local`), so every result below is an **explicitly labelled local fallback**.
- Exit codes, run sequentially: `npm run lint` **0**; `npm run typecheck` **0** (app + server); `git diff --check` **0**; `npm test` **0**, `Integration gate: 85 suites passed`.
- Register expanded to one row per assertion, counted from the file: P1 × 23, P2 × 23, P3/prose × 25, docs prose × 10, killed/downgraded/corrected × 16, old unchecked checklist and handoff × 16. Each row carries source symbol, status, owner task and reason.
- Counts re-derived, not copied: 163 route declarations / 149 unique paths, 78 `*.test.mjs` all selected or exempt, 51 persistence suites, 893 copy keys with 0 drift, 13 PostgreSQL indexes and no `sessions(user_id)` index.
- Deployment claims split: template bindings present (`SUPPORT_CONTACT`, `WIND_IDENTITY_MODE`, `WIND_DATABASE_URL`, `OSRM_URL`, `/data` share) but unapplied; `WIND_POSTGRES_STAGING` branch exists, so the old "production refuses PostgreSQL outright" claim is stale; Railway `eb841dcb` is absent from history and stays historical.
- Remaining gaps handed on, not hidden: P2 #4 (card vs cash), the first-order promo race and the schedule-freshness claim stay **unverified** for T02, and T20 owns the partner concurrent-duplicate error mapping; persistence/contracts/browser/load/device tiers were not run.
- Tier: source review + deterministic local fixtures. No device, provider, PostgreSQL or deployment evidence.

## T02: Reproduce the remaining review findings

- [ ] Complete with acceptance evidence

**Description / implementation:** Re-run focused disposable probes for unverified findings. Capture expected versus actual behavior. Convert reproduced findings into the tasks below; add child tasks for findings not yet represented.

**Dependencies:** T01.

**Files likely touched:**
- `tasks/evidence.md`
- `reports/verify-2026-10-29/EVIDENCE.md`
- `reports/verify-2026-10-29/MUTATION.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Each finding has reproduced/fixed/unverified/blocked status.
- [ ] No production data is modified.
- [ ] All unexplained failures have an owner task.

**Verification:** `npm test; npm run test:persistence`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Run suites sequentially; mocks are not provider evidence.

**Evidence:** Characterization complete — see ../reports/verify-2026-10-29/T02-completion.md and evidence.md "T02 — characterization checkpoint". Parent closes when full `npm test` and `npm run test:persistence` are rerun sequentially on the final integrated tree (checkpoint window); every finding row already has reproduced/fixed/owner status and no unexplained failure lacks an owner.

## T03: Agree the map contract and regional corpus

- [x] Complete with acceptance evidence

**Description / implementation:** Specify baseline OSRM plus MapLibre/Apple and opt-in Google-native/web rendering. Build at least 30 synthetic route cases covering towns, villages, checkpoints, service boundary, same-city and unavailable roads. Record billing and content provenance rules.

**Dependencies:** T01.

**Files likely touched:**
- `tasks/maps-contract.md (new)`
- `research_notes/Google Maps integration for Fastship/palestine_coverage.md`
- `research_notes/Google Maps integration for Fastship/pricing_terms.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Every platform has a provider/failure decision.
- [x] Cases distinguish legal service coverage from road geometry.
- [x] Paid-call budget and activation prerequisites are explicit.

**Verification:** `npm run test -- --filter=route`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Live regional validation waits for provider access; a coverage table is not field proof.

**Evidence:** Specification complete: maps-contract.md and maps-corpus.json define 35 concrete synthetic cases, platform failure/provenance decisions and paid activation gates. Local fallback corpus validator checks actual servedCity decisions and coordinate validity (exit 0); route suites (2), lint and both typechecks exit 0. See maps-implementation-evidence.md. No live regional or field proof is claimed; provider activation and monetary budgets remain operator gates.

### Checkpoint C01 — after T03

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T04: Fresh pickup location fallback

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T04.1: Bounded cache/freshness logic and picker wiring (src/customer-location.ts, src/app/book.tsx, tests/customer-location.test.mjs); verify `npm run test -- --filter=customer-location` plus lint and both typechecks. Complete — see evidence.md "Continuation — T04.1/T05.1".
- [ ] T04.2: A53 device acceptance (old cached point, denied permission, slow fix, reopen picker, Arabic and English) batched into the D05 physical pass. Parent stays open until then.

**Evidence (T04.1):** `npm run test -- --filter=customer-location` exit 0 (1 suite) on 85b5a3a+dirty T18-final tree; lint 0; typecheck 0; host local fallback. Unit acceptance covers stale cache rejection (>30 s, >100 m), permission-error cache, late-result and abort cancellation, landmark preservation and denied-permission pinning.

**Description / implementation:** Bound cached GPS age and accuracy using SDK 57 location docs. Open the picker without indefinite waits and ignore late results after dismissal. Preserve explicit pin, fresh fix, usable cached fix, city fallback priority.

**Dependencies:** T03.

**Files likely touched:**
- `src/app/book.tsx`
- `src/customer-location.ts`
- `src/copy.ts`
- `tests/customer-location.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Old GPS is never presented as current.
- [ ] GPS refresh preserves typed landmark.
- [ ] Denied permission still allows manual pinning.

**Verification:** `npm run test -- --filter=customer-location`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53: old cached point, denied permission, slow fix, reopen picker, Arabic and English.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T05: Reliable baseline road routing

- [ ] Complete with acceptance evidence

Implementation children (split after the frozen route-inventory gate exposed the required additive protocol registration):
- [x] T05.1: Routing observation endpoint and additive boundary (server/main.ts, server/domain/routing-status.ts, tests/route.test.mjs, docs/implementation/contracts/additive-endpoints.json). Complete — route fixtures 2/2 exit 0 (29 Oct local fallback, T18-final tree); PostgreSQL contract boundary 90 installed + 74 additive per reports/verify-2026-10-29/T02-completion.md.
- [ ] T05.2: Operator configuration/evidence (docs/operations/provider-failures.md, tasks/maps-implementation-evidence.md); verify common gates and record staging DNS/graph/version acceptance separately. Parent remains open until staging acceptance.

**Description / implementation:** Prepare OSRM internal URL, populated graph/version and timeout checks. Expose routing capability separately from essential DB readiness. Keep existing checkpoint-aware pricing and feasibility authoritative.

**Dependencies:** T03.

**Files likely touched:**
- `server/main.ts`
- `infra/main.bicep`
- `tests/route.test.mjs`
- `docs/operations/provider-failures.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] No production public-demo-router fallback.
- [ ] No invented straight route when routing fails.
- [ ] Configured provider failure is visible to operators.

**Verification:** `npm run test -- --filter=route; node tests/azure-infra.test.mjs`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Staging validation must prove internal DNS and populated graph; no deployment in this task.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T06: Provider-aware route contract

- [ ] Complete with acceptance evidence

**Description / implementation:** Add typed renderer capability and route provenance without breaking existing OSRM consumers. Reset private route/ETA state on account, order, driver, stop or provider changes.

**Dependencies:** T03, T05.

**Files likely touched:**
- `src/road.tsx`
- `src/route-preview.tsx`
- `src/map-math.ts`
- `src/map-provider.ts (new)`
- `tests/map.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Google content cannot reach MapLibre/Apple overlays.
- [ ] Unknown capability chooses safe baseline.
- [ ] Existing clients retain compatible responses.

**Verification:** `npm run test -- --filter=map`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Test unsupported provider combinations and a stale response arriving after switching.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C02 — after T06

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T07: Google routing proxy

- [x] Complete with acceptance evidence

**Description / implementation:** Implement a narrow authenticated proxy with validated coordinates, minimal documented field mask, timeouts and redacted errors. Use fake upstream fixtures and explicit provider metadata; never accept arbitrary upstream URLs.

**Dependencies:** T06.

**Files likely touched:**
- `server/domain/google-routing.ts (new)`
- `server/main.ts`
- `tests/google-routing.test.mjs (new)`
- `scripts/run-tests.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Unauthorized or invalid input makes no upstream call.
- [ ] Units and longitude/latitude conversions are tested.
- [ ] 403/429/timeout/malformed responses produce typed unavailable errors.

**Verification:** `node tests/google-routing.test.mjs`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Server Routes credentials must never appear in app config, client bundles or logs.

**Evidence:** Complete (fixture tier). Delegate worktree commit `db3e5b4` (branch t3/41a545fa, DeepSeek V4.1 Flash 1017 via Modal dedicated) cherry-picked; leader wired the HTTP boundary as registrar `registerGoogleRouteRoutes` in the domain module (the frozen main.ts route inventory requires additive modules to own their `route(` declarations) and listed it in additive-endpoints.json; suite registered in scripts/run-tests.mjs. Commands exit 0 local fallback: google-routing suite (registered run), contracts (90 installed + 75 additive boundaries incl. anonymous 401 on /api/route/google), pg-contracts on PostgreSQL (same counts), lint, typecheck. Key never leaves server env (`GOOGLE_MAPS_SERVER_KEY`); no client config or bundle carries it. Live activation remains an operator gate (restricted key + budget, maps-contract.md).

## T08: Paid routing budgets

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T08.1: Server-side budgets, kill switch and trigger policy (server/domain/google-routing.ts + tests) — complete with T07 above; fake-call count assertions cover many-user, movement, navigation-remount and outage sequences; exhaustion returns typed limits without retry storms; global cap documented as single-instance-owned with `request_limits`/`google_usage` upgrade path.
- [ ] T08.2: Client trigger gating in src/road.tsx (foreground/movement-based reroute only; stationary/background polls must not bill) — lands with T13/T14 renderer integration.

**Description / implementation:** Bound concurrency and per-user/global requests; add a kill switch and foreground/movement-based reroute triggers. Do not inherit OSRM caching policy for Google. Specify multi-instance budget ownership before scaling.

**Dependencies:** T07.

**Files likely touched:**
- `server/domain/google-routing.ts`
- `src/road.tsx`
- `tests/google-routing.test.mjs`
- `docs/operations/cost-model.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Stationary/background clients do not continually reroute.
- [ ] Exhaustion degrades without retry storms.
- [ ] Global limit cannot multiply by replica count.

**Verification:** `node tests/google-routing.test.mjs`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Use fake-call counts for many users, navigation remounts, movement and outages; no unapproved billable load.

**Evidence:** T08.1 complete with T07 (server budgets fake-fixture tested, no billable load: GOOGLE_MAPS_SERVER_KEY unset in every run, kill switch default-off). T08.2 and the parent stay open until the client trigger gating lands with T13/T14.

## T09: Google native build setup

- [ ] Complete with acceptance evidence

**Description / implementation:** Configure SDK 57 react-native-maps with separate restricted Android/iOS keys and a build capability flag. Preserve release/QA guards and account for QA package IDs and signing certificates.

**Dependencies:** T06.

**Files likely touched:**
- `app.config.js`
- `eas.json`
- `tests/phone-test-build.test.mjs`
- `docs/implementation/native-environment.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Baseline binary needs no Google key.
- [ ] Google build fails early for missing platform key.
- [ ] Server route key is absent from public config.

**Verification:** `npm run test -- --filter=phone-test-build`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Native plugin changes require a rebuilt EAS binary; do not treat OTA as sufficient.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C03 — after T09

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T10: Android Google renderer

- [ ] Complete with acceptance evidence

**Description / implementation:** Implement provider-selected native Google rendering with pin movement, driver marker/accuracy/heading, follow/recenter, route and checkpoint overlays. Preserve MapLibre fallback with explicit data clearing.

**Dependencies:** T06, T09.

**Files likely touched:**
- `src/route-map.android.tsx`
- `src/google-map.native.tsx (new)`
- `src/route-preview.tsx`
- `tests/map.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Loaded tiles rather than initialization indicate ready.
- [ ] Provider failure clears incompatible overlays.
- [ ] Dragging inside the pin sheet and camera follow both work.

**Verification:** `npm run test -- --filter=map`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53 native: missing key, slow tiles, pin drag, pan/recenter and driver animation.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T11: iOS map parity

- [ ] Complete with acceptance evidence

**Description / implementation:** Wire the shared native Google renderer on iOS and retain Apple baseline without Google-sourced overlays. Review platform resolution, attribution, safe areas and permission handling.

**Dependencies:** T10.

**Files likely touched:**
- `src/route-map.native.tsx`
- `src/google-map.native.tsx`
- `docs/IOS-ACCESS.md`
- `tests/map.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Both provider modes select correct components.
- [ ] Failure leaves a usable baseline.
- [ ] Physical iPhone and signed-build evidence are separately recorded.

**Verification:** `npm run test -- --filter=map`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** No iPhone/signing access means device acceptance stays blocked; never use a simulator.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T12: Google web renderer

- [ ] Complete with acceptance evidence

**Description / implementation:** Load Google JS once with restricted browser key and documented narrow CSP. Implement pin, marker, camera and route parity with cleanup; retain MapLibre and visible provider attribution.

**Dependencies:** T06, T08.

**Files likely touched:**
- `src/route-map.tsx`
- `src/google-map.web.tsx (new)`
- `server/main.ts`
- `tests/map.test.mjs`
- `docs/operations/provider-failures.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] No duplicate script/listeners after navigation.
- [ ] RTL pin and route interactions work.
- [ ] Blocked SDK/quotas produce labelled retry/fallback.

**Verification:** `npm run test -- --filter=map; npm run test:scenarios`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Browser automation is diagnostic; physical A53 Chrome supplies UI acceptance.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C04 — after T12

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T13: Booking map integration

- [ ] Complete with acceptance evidence

**Description / implementation:** Select preview route by renderer while keeping fare/commission/feasibility on authoritative server policy. Changing pins invalidates obsolete preview/quote requests. Never relax servedCity for nearestCity.

**Dependencies:** T07, T10, T12.

**Files likely touched:**
- `src/app/book.tsx`
- `src/road.tsx`
- `src/booking.ts`
- `tests/booking-auth.test.mjs`
- `tests/route.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Google preview cannot change authoritative money.
- [ ] Out-of-area pins fail before booking.
- [ ] Estimated price/distance remains labelled during provider outage.

**Verification:** `npm run test -- --filter=booking-auth; npm run test -- --filter=route`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Book a synthetic parcel with Google enabled, disabled and failing.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T14: Private tracking integration

- [ ] Complete with acceptance evidence

**Description / implementation:** Apply provider selection to approach routing while preserving stale GPS, server clock, shared-run suppression, stop identity and terminal-access clearing.

**Dependencies:** T08, T13.

**Files likely touched:**
- `src/road.tsx`
- `src/app/order/[id].tsx`
- `src/map-math.ts`
- `tests/presentation.test.mjs`
- `tests/map.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Stale GPS cannot produce fresh ETA.
- [ ] Multi-parcel runs suppress direct approach.
- [ ] Revoked access removes cached markers and route data.

**Verification:** `npm run test -- --filter=presentation; npm run test:access`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53: driver reassignment, completed job, offline, background and access refusal.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T15: Public tracking privacy and cost

- [ ] Complete with acceptance evidence

**Description / implementation:** Default anonymous tracking to baseline MapLibre/OSRM. Any optional Google public mode needs compatible overlays and a bounded authorized call policy; 15-second public polling must not become unrestricted paid routing.

**Dependencies:** T08, T12, T14.

**Files likely touched:**
- `src/app/track/[token].tsx`
- `server/main.ts`
- `tests/share.test.mjs`
- `tests/route.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Expired/revoked links disclose no private location.
- [ ] Baseline public tracking makes zero Google calls.
- [ ] Provider switching removes old incompatible content.

**Verification:** `npm run test -- --filter=share; npm run test -- --filter=route`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53 Chrome: slow/backward clock, network loss, expired token and provider failure.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C05 — after T15

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T16: Local address search enhancement

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T16.1: Search module, panel and booking-sheet wiring (src/place-search.ts, src/place-search-panel.tsx, src/app/book.tsx, src/copy.ts, tests/place-search.test.mjs, scripts/run-tests.mjs). Complete — see evidence.md "T16 — local place search".
- [ ] T16.2: A53 sheet acceptance (long Arabic labels, keyboard overlap, proposal card TalkBack) batched into the D02 physical pass. Parent stays open until then.

**Description / implementation:** Ship searchable existing towns/landmarks/saved places with explicit pin confirmation first. Treat Google Places proxy and session billing as separate gated child tasks, not a silent extra dependency.

**Dependencies:** T12, T13.

**Files likely touched:**
- `src/place-search.tsx (new)`
- `src/app/book.tsx`
- `src/copy.ts`
- `tests/place-search.test.mjs (new)`
- `scripts/run-tests.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Arabic/English local choices are searchable.
- [ ] Search never silently replaces an accepted pin.
- [ ] Empty/offline/out-of-area choices have clear feedback.

**Verification:** `node tests/place-search.test.mjs`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Test long Arabic labels and keyboard overlap; no persistence of restricted Places fields.

**Evidence:** T16.1 complete, local fallback: delegate worktree commit `58492d8` (branch t3/9015813b) cherry-picked into the shared checkout, then leader wiring — panel embedded in the existing CityPicker sheet above the saved/recent block (forget and recent rows preserved; the sheet keeps showing places before typing, the panel lists hits only once a query exists, per delegate note 5 decision), six copy keys added ar+en (`searchLabel/searchEmpty/searchOffline/searchPinKept/searchPinCleared/searchApply`), suite registered in scripts/run-tests.mjs, panel renamed place-search.tsx→place-search-panel.tsx because `.ts` shadows `.tsx` in module resolution. Pin safety extended to the legacy saved-place and city taps (same-city taps now keep the confirmed pin instead of dropping it). Commands exit 0: place-search suite (registered run), presentation, booking-auth, customer-location, lint, typecheck (app+server). Module-resolution collision found by typecheck, fixed before commit. Offline flag not wired (repo has no connectivity sensor; feedback path unit-tested via searchPlaces(…, false)) — accepted limitation, sensor wiring belongs to T47 diagnostics. Device sheet checks deferred to T16.2.

## T17: Malformed password hash handling

- [x] Complete with acceptance evidence

**Description / implementation:** Validate salt/hash format and byte length before timing-safe comparison. Malformed stored credentials should deny authentication without throwing 500; retain valid historical hash compatibility.

**Dependencies:** T01.

**Files likely touched:**
- `server/main.ts`
- `tests/registration.test.mjs`
- `tests/email.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Malformed/short/nonhex hash does not crash.
- [x] Valid legacy login still works.
- [x] No response or log discloses hash/password/account existence.

**Verification:** `npm run test -- --filter=registration; npm run test -- --filter=email`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Corrupt only disposable fixtures, never a real account.

**Evidence:** Complete; see auth-implementation-evidence.md. Regression first reproduced HTTP 500, then six corrupt fixture values returned generic 401 while a legacy non-hex salt logged in successfully. Local fallback registration (2 suites), email (1), lint and both typechecks exit 0. No real account modified.

## T18: Asynchronous bounded password hashing

- [x] Complete with acceptance evidence

**Description / implementation:** Move synchronous scrypt off the HTTP event loop with bounded admission. Await every login/register/reset call and preserve format. Do not hold DB locks while waiting for expensive hashing.

**Dependencies:** T17.

**Files likely touched:**
- `server/main.ts`
- `server/domain/passwords.ts (new)`
- `tests/registration.test.mjs`
- `tests/session-idle.test.mjs`
- `scripts/check-load.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Existing passwords remain valid.
- [x] Queue/memory are bounded under auth bursts.
- [x] Health and order handling stay responsive.

**Verification:** `npm run test -- --filter=registration; npm run test:load`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Compare identical uncontended fixtures on k5, or explicitly label local fallback.

**Evidence:** Complete; see password-hashing-evidence.md. Dedicated 2-worker scrypt pool with a 64-job admission bound (503 `password_busy` past it); HTTP auth/password routes run outside the Postgres request transaction, and PhoneIdentity computes replay fingerprints, current-password proof and recovery KDFs before its short transactions, then revalidates the challenge/user snapshot on entry. Registration suite (2) and email (1), session-idle, Entra (3), Postgres email, phone identity/recovery and Postgres contracts pass; lint and both typechecks exit 0. Load: 40 password logins at concurrency 8, health p95 3.82 ms and order-read p95 4.16 ms during KDFs; all 14 performance gates and 6 correctness checks pass. Local fallback; k5 unreachable. Follow-up audit restored `partner_api` and acting-admin journal provenance that the transaction carve-out had dropped from partner orders and the support reset; SQLite and PostgreSQL contracts plus the full load rerun pass on the final code.

### Checkpoint C06 — after T18

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T19: Uncertain booking recovery

- [ ] Complete with acceptance evidence

**Description / implementation:** Provide reconciliation and retry for persisted pending booking commands. Permit discard/edit only after resolving uncertain success; scope stored payload to its account and preserve request identity.

**Dependencies:** T01.

**Files likely touched:**
- `src/app/book.tsx`
- `src/booking.ts`
- `src/session.tsx`
- `tests/booking-auth.test.mjs`
- `src/copy.ts`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Lost response creates at most one order.
- [ ] Another account sees no prior payload.
- [ ] Confirmed absence permits editing without trapping the customer.

**Verification:** `npm run test -- --filter=booking-auth`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Phone: server committed but response lost, restart, account switch and recovery.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T20: Booking idempotency contract

- [ ] Complete with acceptance evidence

**Description / implementation:** Inventory first-party requestId and partner external-reference behavior. Define a compatible transition before requiring identity on all modern creates; reject same-key changed-payload reuse.

**Dependencies:** T19.

**Files likely touched:**
- `server/main.ts`
- `tests/contracts.test.mjs`
- `tests/api.test.mjs`
- `tests/pg-contracts.mjs`
- `docs/implementation/contracts/endpoints.json`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Concurrent retry creates once on both backends.
- [ ] Changed payload conflicts.
- [ ] Old client and partner behavior have explicit compatibility coverage.

**Verification:** `npm run test -- --filter=contracts; npm run test:persistence -- --filter=pg-contracts`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Exercise lost response, partner retry, different users and missing identity.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T21: Marketplace abuse limits

- [ ] Complete with acceptance evidence

**Description / implementation:** Add transactional per-customer active-search limits and safe stale-demand expiry. Preserve pagination and future scheduled orders; never expire assigned custody automatically.

**Dependencies:** T20.

**Files likely touched:**
- `server/main.ts`
- `server/worker.ts`
- `tests/jobs-pagination.test.mjs`
- `tests/schedule.test.mjs`
- `src/copy.ts`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Spam cannot bury legitimate matching demand indefinitely.
- [ ] Concurrent creates cannot bypass limit.
- [ ] Expiry cannot cancel assigned or not-yet-due scheduled work.

**Verification:** `npm run test -- --filter=jobs-pagination; npm run test -- --filter=schedule`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Use many synthetic searching orders and test all pages remain reachable.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C07 — after T21

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T22: Subscription concurrency

- [ ] Complete with acceptance evidence

**Description / implementation:** Enforce one pending subscription per user/plan in storage, with safe duplicate migration. Serialize activate/reject and disable competing UI actions during a request.

**Dependencies:** T01.

**Files likely touched:**
- `server/main.ts`
- `server/db/sqlite-schema.ts`
- `server/db/postgres-schema.ts`
- `tests/api.test.mjs`
- `src/app/admin/subscriptions.tsx`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Concurrent create yields one pending record.
- [ ] Activate/reject race has one outcome.
- [ ] Migration preserves paid history and reports conflicts.

**Verification:** `npm run test -- --filter=api; npm run test:persistence -- --filter=pg-dialect`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Use independent DB connections; a single SQLite process alone cannot prove cross-replica safety.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T23: Cash adjustment control policy

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T23.1: Fail-closed forgiveness gate in recordCash + copy keys + cash-suite re-baseline (server/main.ts, src/copy.ts, tests/cash.test.mjs, docs/operations/cash-controls.md). Complete — see evidence.md "T23 — fail-closed forgiveness gate".
- [ ] T23.2: Owner policy acceptance of docs/operations/cash-controls.md thresholds (external gate; parent stays open).

**Description / implementation:** Prepare a fail-closed dual-control policy for debt forgiveness. Preserve current amount cap and no-negative-balance. Default proposal: forgiveness requires second approval; owner policy acceptance precedes activation.

**Dependencies:** T01.

**Files likely touched:**
- `server/main.ts`
- `server/domain/ops.ts`
- `tests/cash.test.mjs`
- `docs/operations/cash-controls.md (new)`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Unsupported approval capability cannot silently forgive debt.
- [ ] Actor/reason/amount are immutable audit inputs.
- [ ] Per-call cap is not described as dual control.

**Verification:** `npm run test -- --filter=cash; npm run test:persistence -- --filter=ops`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Do not enact new financial policy on live data during implementation.

**Evidence (T23.1):** Local fallback, sequential exits 0: cash suite (SQLite: forgiveness without approval 409 `approval_required`, missing approval table 503 `approval_unsupported`, positive adjustments and payout boundary unchanged), persistence ops on PostgreSQL under the shared lock, lint, typecheck. Gate order: amount/boundary checks first (400s preserved), then approval binding before insert, inside the same transaction. One-time consumption and atomic approval+mutation remain T24; UI T25; policy acceptance T23.2.

## T24: Cash approval persistence

- [ ] Complete with acceptance evidence

**Description / implementation:** Bind the cash adjustment path to pending approvals on the active backend. Execute approval and cash mutation atomically; include requester separation, immutable payload and one-time decision.

**Dependencies:** T23.

**Files likely touched:**
- `server/db/sqlite-schema.ts`
- `server/domain/ops.ts`
- `server/main.ts`
- `tests/cash.test.mjs`
- `tests/ops.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Requester cannot approve self.
- [ ] Concurrent decisions execute once.
- [ ] Changed amount/driver cannot reuse approval.

**Verification:** `npm run test -- --filter=cash; npm run test:persistence -- --filter=ops`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** HTTP tests with two admins, foreign role, replay and restart.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C08 — after T24

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T25: Cash recovery and approval UI

- [ ] Complete with acceptance evidence

**Description / implementation:** Add review/approve/reject and audited support resolution for pending remittances when driver is blocked/unavailable. Show balance impact and require deliberate confirmation; never impersonate driver confirmation.

**Dependencies:** T24.

**Files likely touched:**
- `src/app/admin/cash.tsx`
- `server/main.ts`
- `src/copy.ts`
- `tests/cash.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Unavailable driver does not cause permanent unresolvable pending cash.
- [ ] Resolution records reason/evidence reference/actor.
- [ ] Double taps cannot duplicate movement.

**Verification:** `npm run test -- --filter=cash`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Phone admin flow using synthetic funds and unauthorized-role controls.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T26: Order transition race review

- [ ] Complete with acceptance evidence

**Description / implementation:** Reproduce P3 reattempt/proof lock, conditional rating, schedule and first-order promo races. Split each proven defect into a child if this exceeds one session. Never reset a proof lock without verified recipient recovery.

**Dependencies:** T02.

**Files likely touched:**
- `server/main.ts`
- `tests/pickup.test.mjs`
- `tests/schedule.test.mjs`
- `tests/customer-rating.test.mjs`
- `tests/promo.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Every assertion has an executable disposition.
- [ ] Expected-state conditions prevent stale transitions.
- [ ] Wrong-code retries and first-order discounts remain bounded.

**Verification:** `npm run test -- --filter=pickup; npm run test -- --filter=schedule; npm run test -- --filter=promo; npm run test -- --filter=customer-rating`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Retain already-fixed reschedule ownership tests; use synchronized concurrent requests.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T27: Declared-scope authorization

- [ ] Complete with acceptance evidence

**Description / implementation:** Replace blanket searching-driver visibility with active status, service/vehicle eligibility and release exclusions. Minimize preassignment declaredValue/sourceRef/custody fields; retain owner/assigned/admin policy.

**Dependencies:** T01.

**Files likely touched:**
- `server/domain/resource-scope.ts`
- `server/domain/eligibility.ts`
- `tests/resource-scope.mjs`
- `tests/resource-scope-sqlite.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Pending/blocked/released/ineligible drivers denied.
- [ ] Preassignment response contains only necessary fields.
- [ ] SQLite capability remains gated.

**Verification:** `npm run test:persistence -- --filter=resource-scope`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Two customers and multiple driver roles; verify unauthorized sourceRef access is impossible.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C09 — after T27

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T28: Refund uncertain outcomes

- [x] Complete with acceptance evidence

**Description / implementation:** Keep pending/timeout unresolved and reserve refundable amount until definitive outcome. Add stable provider idempotency and bounded reconciliation; compare-and-set callbacks and retries.

**Dependencies:** T27.

**Files likely touched:**
- `server/domain/payments.ts`
- `server/db/postgres-payments.sql`
- `tests/payments.mjs`
- `server/worker.ts`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Lost provider response cannot allow double refund.
- [ ] Out-of-order callbacks cannot regress terminal state.
- [ ] Cumulative refunds remain within captured amount.

**Verification:** `npm run test:persistence -- --filter=payments`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Fake provider accepted-then-timeout, delayed success, duplicate request and process restart.

**Evidence:** Complete. Delegate worktree commit `c366293` (branch t3/ac2e9bb3, DeepSeek V4.1 Flash 1017 via Modal dedicated) cherry-picked unchanged; failing-first regression reproduced pre-fix (timeout row terminal `rejected`, second full refund reached the provider) and post-fix probe shows reservation held (`requested`, retry 400 refund_exceeds_capture, one provider call). Leader reran on master under the PG lock: payments suite exit 0 (SQLite+PG runner) and pg-contracts 90+75 boundaries exit 0; lint/typecheck 0. Worker sweep wired into DurableWorker.runOnce (bounded limit/age, CAS claims); production sweep is a no-op until a real provider adapter exists (payments gate stays closed). Carry-forward notes: rows written `rejected` under the old contract are not retro-reserved — reconcile against provider statements before any payment cutover (added to T34/T50 checklists); conflicting definitive answers for one idempotency key settle first-wins (`shortcut:` comment in payments.ts, upgrade on a PSP statement feed).

## T29: Live order ledger posting

- [ ] Complete with acceptance evidence

**Description / implementation:** Post balanced journals atomically at completion/return using stored commission and promo allocation. Reuse stable business references; importLegacy is not a continuous synchronization mechanism.

**Dependencies:** T28.

**Files likely touched:**
- `server/domain/ledger.ts`
- `server/main.ts`
- `tests/ledger.mjs`
- `tests/pg-cash.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] One journal per business fact.
- [ ] Rollback leaves neither partial order nor journal.
- [ ] Import plus new events never double-count.

**Verification:** `npm run test:persistence -- --filter=ledger; npm run test:persistence -- --filter=pg-cash`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Reconcile import, two completions and return against explicit minor-unit totals.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T30: Live cash ledger posting

- [ ] Complete with acceptance evidence

**Description / implementation:** Post confirmed remittance, adjustment and reversal transactionally. Pending/disputed remittances remain unsettled; corrections append reversals without deleting originals.

**Dependencies:** T29, T24.

**Files likely touched:**
- `server/domain/ledger.ts`
- `server/main.ts`
- `tests/ledger.mjs`
- `tests/pg-cash.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Live balances update immediately after confirmed events.
- [ ] Retry cannot post twice.
- [ ] Reversal restores expected balance with preserved history.

**Verification:** `npm run test:persistence -- --filter=ledger; npm run test:persistence -- --filter=pg-cash`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Compare cash-screen totals and ledger after confirm/dispute/reversal.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C10 — after T30

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T31: Single settlement authority

- [ ] Complete with acceptance evidence

**Description / implementation:** Define one settlement authority per order and lock cash/card transitions. Reconcile provider uncertainty before switching method; retain external evidence references.

**Dependencies:** T30.

**Files likely touched:**
- `server/domain/payments.ts`
- `server/domain/ledger.ts`
- `server/db/postgres-payments.sql`
- `tests/payments.mjs`
- `tests/ledger.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Captured card cannot also settle as cash.
- [ ] Concurrent capture/cash selects one valid outcome.
- [ ] Refund/reversal changes balance once.

**Verification:** `npm run test:persistence -- --filter=payments; npm run test:persistence -- --filter=ledger`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Race capture callback with cash settlement and retry both.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T32: Partial COD resolution

- [ ] Complete with acceptance evidence

**Description / implementation:** Define partial goods collection/remittance, outstanding remainder and exception authority. Keep goods proceeds distinct from delivery fee/commission and add stable command identities.

**Dependencies:** T31.

**Files likely touched:**
- `server/domain/payments.ts`
- `server/db/postgres-payments.sql`
- `tests/payments.mjs`
- `docs/operations/cash-controls.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Collected/remitted/outstanding totals reconcile.
- [ ] Duplicate collect/remit does not increment twice.
- [ ] Partial return/dispute has explicit resolution.

**Verification:** `npm run test:persistence -- --filter=payments`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Partial collect, return, remit, repeated command and collector change.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T33: PostgreSQL destination-change parity

- [ ] Complete with acceptance evidence

**Description / implementation:** Port existing customer request, driver consent, quote and commission-rate snapshot behavior with safe migration. Do not remove sqliteOnly until all lifecycle vectors pass.

**Dependencies:** T27.

**Files likely touched:**
- `server/domain/destination-change.ts`
- `server/db/postgres-schema.ts`
- `server/migrate.ts`
- `tests/change-destination.test.mjs`
- `tests/pg-dialect.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Consent remains mandatory.
- [ ] Accepted change preserves rate policy.
- [ ] Concurrent accept/cancel and old imported rows behave safely.

**Verification:** `npm run test -- --filter=change-destination; npm run test:persistence -- --filter=pg-dialect`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Run equivalent vectors on SQLite and PostgreSQL.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C11 — after T33

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T34: Import and cutover rehearsal

- [ ] Complete with acceptance evidence

**Description / implementation:** Rehearse consistent snapshot import into isolated PostgreSQL. Verify schema, counts, foreign keys, money, custody, events and API parity. Staging runtime exists; it is not public cutover approval.

**Dependencies:** T28, T29, T30, T31, T32, T33.

**Files likely touched:**
- `server/migrate.ts`
- `server/db/runtime.ts`
- `scripts/migrate-postgres.mjs`
- `tests/pg-import.mjs`
- `docs/operations/restore.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Migration retry is safe.
- [ ] Counts and monetary totals reconcile.
- [ ] Rollback after new PG writes never points at stale SQLite.

**Verification:** `npm run test:persistence; npm run test:contracts`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Fixtures first; real snapshots need authorized access and redacted evidence. Reconcile pre-T28 `rejected` refund rows against provider statements inside the rehearsal.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T35: Verified identity readiness

- [ ] Complete with acceptance evidence

**Description / implementation:** Exercise existing provider adapters and choose the supported pilot identity path. Distinguish Entra sign-in, verified phone ownership and email recovery. Keep unavailable capabilities honest.

**Dependencies:** T18, T34.

**Files likely touched:**
- `server/domain/phone-provider.ts`
- `server/domain/phone-identity.ts`
- `server/domain/entra.ts`
- `src/phone-recovery.tsx`
- `docs/operations/provider-failures.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Verified flags follow actual proof.
- [ ] Expiry/replay/resend/recovery work.
- [ ] Outage does not create duplicate identities or unsafe recovery.

**Verification:** `npm run test -- --filter=phone; npm run test:persistence -- --filter=phone-identity`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Only approved test numbers with credentials; never log codes or tokens.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T36: Email recovery activation preparation

- [ ] Complete with acceptance evidence

**Description / implementation:** Prepare verified sending domain, sender identity and reset rate limits. Update active runbook away from superseded Railway instructions without deleting history.

**Dependencies:** T18.

**Files likely touched:**
- `server/main.ts`
- `src/phone-recovery.tsx`
- `tests/email.test.mjs`
- `docs/operations/provider-failures.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Disabled email never promises delivery.
- [ ] Expired/used reset cannot replay.
- [ ] Real delivery evidence precedes activation.

**Verification:** `npm run test -- --filter=email`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Use approved test mailbox after access; do not invent sender or support details.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C12 — after T36

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T37: Native notification completion

- [ ] Complete with acceptance evidence

**Description / implementation:** Finish native provider setup, cold-start response handling, receipt cleanup and shared urgency policy. Replace obsolete VAPID defaults; reauthorize notification destinations after sign-in.

**Dependencies:** T34.

**Files likely touched:**
- `src/native-push.ts`
- `server/domain/native-push.ts`
- `server/worker.ts`
- `tests/native-push.mjs`
- `tests/push-server.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Foreground/background/terminated tap reaches current authorized screen.
- [ ] Account switch cannot expose old orders.
- [ ] Invalid tokens and duplicates do not retry forever.

**Verification:** `npm run test:persistence -- --filter=native-push; npm run test -- --filter=push`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53 approved test notification, then revoke access before tapping.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T38: Presence and dispatch readiness

- [ ] Complete with acceptance evidence

**Description / implementation:** Exercise online/offline leases, stale eligibility and reservation races on staging. Preserve legacy job flow until supported fleet client versions are known.

**Dependencies:** T05, T34, T35, T37.

**Files likely touched:**
- `server/domain/presence.ts`
- `server/domain/dispatch.ts`
- `src/driver-presence-runtime.ts`
- `tests/dispatch-races.mjs`
- `docs/operations/deploy.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Only active eligible drivers receive offers.
- [ ] Accept/expiry/reassignment selects one owner.
- [ ] Provider outage is explicit and bounded.

**Verification:** `npm run test:persistence -- --filter=presence; npm run test:persistence -- --filter=dispatch`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Phone background, no network, expired offer, completion; no real customer dispatch.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T39: Driver render and battery budget

- [ ] Complete with acceptance evidence

**Description / implementation:** Measure unnecessary provider re-renders and SecureStore reads. Separate frequently changing location from unrelated consumers while preserving revocation and secure persistence.

**Dependencies:** T14, T38.

**Files likely touched:**
- `src/driver-work.tsx`
- `src/driver-presence-runtime.ts`
- `src/background-location.ts`
- `tests/driver-presence-runtime.test.mjs`
- `tests/background-location.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Idle loop avoids redundant secure reads.
- [ ] Tracking ends after last job/logout.
- [ ] Optimization does not introduce GPS gaps.

**Verification:** `npm run test -- --filter=driver-presence; npm run test -- --filter=background`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Phone locked-screen walk/drive: duration, battery delta and GPS ages; fixture GPS is not field proof.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C13 — after T39

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T40: Booking interaction polish

- [ ] Complete with acceptance evidence

**Description / implementation:** Memoize schedule generation using relevant inputs, validate the submitted slot rather than a different value, preserve landmarks and show accessible loading/error states.

**Dependencies:** T19, T21.

**Files likely touched:**
- `src/app/book.tsx`
- `src/copy.ts`
- `tests/schedule.test.mjs`
- `tests/customer-location.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Unrelated typing does not rebuild every slot.
- [ ] Expired selected slot is rejected clearly.
- [ ] GPS/schedule changes do not erase entered text.

**Verification:** `npm run test -- --filter=schedule; npm run test -- --filter=customer-location`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Phone keyboard, large text, offline retry and Arabic dates.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T41: Sensitive administration UX

- [ ] Complete with acceptance evidence

**Description / implementation:** Add deliberate confirmation with target/reason/consequence for destructive admin actions. Serialize competing submits and preserve server permissions.

**Dependencies:** T22, T25.

**Files likely touched:**
- `src/app/admin/orders.tsx`
- `src/app/admin/users.tsx`
- `src/app/admin/subscriptions.tsx`
- `src/copy.ts`
- `tests/registration.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Double taps execute once.
- [ ] Cancel confirmation makes no mutation.
- [ ] Failed request leaves accurate recoverable UI.

**Verification:** `npm run test -- --filter=registration; npm run test:readiness`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Phone synthetic users only; verify unauthorized roles cannot reach mutation controls.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T42: Arabic accessibility and copy

- [ ] Complete with acceptance evidence

**Description / implementation:** Audit all screen-index routes, starting with shared text sizing, direction, labels, contrast and focus. Split remaining route fixes into small children; do not fix clipping by disabling OS text scaling.

**Dependencies:** T40, T41.

**Files likely touched:**
- `src/ui.tsx`
- `src/copy.ts`
- `src/phone-card.tsx`
- `src/app/help.tsx`
- `tests/presentation.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Large Arabic/English text remains actionable.
- [ ] TalkBack roles/errors are meaningful.
- [ ] Loading/empty/offline copy matches real capability.

**Verification:** `npm run test -- --filter=presentation; npm run screens`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53 TalkBack, large font, keyboard and narrow layouts; screenshots alone do not pass interaction checks.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C14 — after T42

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T43: Query-performance debt

- [ ] Complete with acceptance evidence

**Description / implementation:** Measure order-list N+1 and session lookup plans; add justified batching/indexes with upgrade coverage. Compare identical populated fixtures rather than empty boards.

**Dependencies:** T02, T34.

**Files likely touched:**
- `server/main.ts`
- `server/db/postgres-schema.sql`
- `tests/pg-dialect.mjs`
- `scripts/check-load.mjs`
- `tasks/evidence.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Query count scales by page.
- [ ] Migration creates required indexes safely.
- [ ] Latency improves without access or totals regressions.

**Verification:** `npm run test:persistence -- --filter=pg-dialect; npm run test:load`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Run load alone; never claim local SQLite capacity is production PostgreSQL capacity.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T44: Test harness debt

- [ ] Complete with acceptance evidence

**Description / implementation:** Resolve reproduced fixed-delay push flakes, duplicate suite imports and owned-schema cleanup. Document shared port/export serialization. Split timing-budget tests into deterministic assertions where feasible.

**Dependencies:** T02.

**Files likely touched:**
- `scripts/run-tests.mjs`
- `scripts/check-contracts.mjs`
- `tests/push-server.test.mjs`
- `tests/support/pg-test-server.mjs`
- `tests/presentation.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] New suite is selected or explicitly exempted.
- [ ] No unowned DB/schema is removed.
- [ ] Repeated sequential gates are stable without inflated duplicate counts.

**Verification:** `npm test; npm run test:persistence; npm run test:contracts`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Preserve failures as evidence; do not broaden deadlines to conceal incorrect behavior.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T45: Dependency and SDK upgrade audit

- [ ] Complete with acceptance evidence

**Description / implementation:** Stay on SDK 57 unless a documented blocker requires migration. Run compatibility/audit checks, assess reachable advisories, and preserve tested local vendor patches until a verified replacement exists.

**Dependencies:** T02.

**Files likely touched:**
- `package.json`
- `package-lock.json`
- `docs/implementation/dependency-security.md`
- `tests/dependency-security.test.mjs`
- `tasks/evidence.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] No blind latest install.
- [ ] Every actionable advisory has disposition.
- [ ] Native dependency change includes a rebuilt-device gate.

**Verification:** `npx expo-doctor; npx expo install --check; npm run test:dependency-security; npm audit --audit-level=high`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** 1.27.2 is the fetched SDK 57 react-native-maps recommendation; newer alone is not an upgrade reason.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C15 — after T45

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T46: Backups and recovery operations

- [ ] Complete with acceptance evidence

**Description / implementation:** Prepare unattended backup alerts, retention and independent key recovery. Define RPO/RTO, restore plus deletion replay, and quarantine restored provider outbox. Interactive workstation DPAPI backup is insufficient alone.

**Dependencies:** T34.

**Files likely touched:**
- `scripts/backup-azure.ps1`
- `scripts/install-azure-backup-task.ps1`
- `docs/operations/restore.md`
- `docs/operations/incident-and-degraded-mode.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Missed backup produces tested alert.
- [ ] Recovery does not assume original logged-in workstation.
- [ ] Restore validates integrity and an isolated business journey.

**Verification:** `npm run test:persistence`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Installation/cloud mutation requires approval after configuration is reviewable; no live data replaced.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T47: Production diagnostics and service policy

- [ ] Complete with acceptance evidence

**Description / implementation:** Prepare real support contact, parcel-first activation, ingress-address validation and provider/queue/backup alerts. Verify runtime VM versus staging Container App instead of trusting conflicting historical reports.

**Dependencies:** T05, T35, T36, T37, T46.

**Files likely touched:**
- `infra/main.bicep`
- `server/domain/diagnostics.ts`
- `docs/operations/deploy.md`
- `docs/operations/incident-and-degraded-mode.md`
- `tests/azure-infra.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Example support number cannot pass readiness.
- [ ] Ingress limiter behavior has evidence.
- [ ] Alert ownership and service enablement are explicit.

**Verification:** `node tests/azure-infra.test.mjs; npm run check:deployment -- --origin https://windapi236.swedencentral.cloudapp.azure.com`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** No heavy builds/load on live VM; read-only deployment check does not prove delivery readiness.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T48: Reconcile capabilities and docs

- [ ] Complete with acceptance evidence

**Description / implementation:** Update built/configured/enabled/field-tested distinctions, pg dependency, COD collection versus payout, native push, destination parity and origins. Classify routes without UI callers as internal, callback, admin, gated or missing before adding screens.

**Dependencies:** T01, T34, T47.

**Files likely touched:**
- `README.md`
- `CAPABILITY-MAP.md`
- `docs/SYSTEM.md`
- `docs/implementation/uber-parity.md`
- `tasks/evidence.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Every capability has source/gate/evidence.
- [ ] Superseded Railway notes are dated.
- [ ] No old fixed defect is recreated from prose.

**Verification:** `npm run test:contracts; git diff --check`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Preserve old reports and annotate rather than silently rewriting historical evidence.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C16 — after T48

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T49: Native artifact and physical-device matrix

- [ ] Complete with acceptance evidence

**Description / implementation:** Prepare exact candidate EAS build after approval. Record revision, environment, package, signing identity, hash and remote version. Test update install and full role journeys; never reuse consumed build numbers.

**Dependencies:** T10, T11, T14, T15, T35, T37, T39, T42, T45.

**Files likely touched:**
- `eas.json`
- `docs/implementation/native-environment.md`
- `tasks/device-matrix.md (new)`
- `tasks/evidence.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] No emulator/simulator acceptance.
- [ ] Binary matches reviewed code and API.
- [ ] D01-D15 and provider failures have evidence or explicit blockers.

**Verification:** `npm run lint; npm run typecheck; npm run phone:check; npm run test:android-browser`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** SM-A5360 R5CTB0FJP9Z, adb reverse for correct QA port, preserve Chrome profile; iOS requires physical iPhone.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T50: Staged cutover rehearsal

- [ ] Complete with acceptance evidence

**Description / implementation:** Prepare image outside live VM, staging migration/restore, worker restart and provider tests with approved accounts. Write exact activation/rollback steps before final approval; keep workload gates closed until then.

**Dependencies:** T34, T38, T46, T47, T49.

**Files likely touched:**
- `docs/operations/deploy.md`
- `docs/operations/restore.md`
- `tasks/evidence.md`
- `infra/main.bicep`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Cold boot and restart pass.
- [ ] Old/new clients follow compatibility contract.
- [ ] Rollback handles new writes without duplicate provider effects.

**Verification:** `npm test; npm run test:persistence; npm run test:contracts; npm run test:readiness`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** No automatic production cutover; approvals concern final concrete candidate/config/evidence. Pre-T28 `rejected` refund rows must be reconciled against provider statements before the payments gate opens.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T51: Controlled parcel pilot

- [ ] Complete with acceptance evidence

**Description / implementation:** Prepare supervised customer-driver-recipient-admin delivery, cancellation, failed handover, return, remittance and link revocation with operating support and consent.

**Dependencies:** T49, T50.

**Files likely touched:**
- `tasks/pilot-checklist.md (new)`
- `tasks/evidence.md`
- `docs/operations/incident-and-degraded-mode.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Real field evidence is distinct from mocks.
- [ ] Money/custody reconcile after pilot.
- [ ] Stop/rollback criteria and support owner are ready.

**Verification:** `npm run check:deployment -- --origin https://windapi236.swedencentral.cloudapp.azure.com`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Live orders/messages require explicit approval; stop on privacy, custody, money or route-safety failure.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C17 — after T51

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T52: Store and public-release package

- [ ] Complete with acceptance evidence

**Description / implementation:** Prepare internal-track distribution, privacy/data-safety disclosures, background-location justification, account deletion and reviewer accounts. Separate Android pilot readiness from iOS and public release.

**Dependencies:** T48, T51.

**Files likely touched:**
- `eas.json`
- `server/privacy.html`
- `server/terms.html`
- `docs/IOS-ACCESS.md`
- `tasks/release-checklist.md (new)`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Artifact matches accepted pilot.
- [ ] Support/legal/provider requirements are verified.
- [ ] Missing required evidence keeps relevant release blocked.

**Verification:** `npm run lint; npm run typecheck; npm run check:deployment -- --origin https://windapi236.swedencentral.cloudapp.azure.com`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** No upload/submission without approval and credentials; iOS block must not be described as Android failure.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T53: Pickup evidence enhancement specification

- [ ] Complete with acceptance evidence

**Description / implementation:** Specify pickup photos and driver-document workflows using existing private-object primitives. Cover consent, type/size limits, retention, review and access; create schema/API/upload/UI child tasks before coding.

**Dependencies:** T48.

**Files likely touched:**
- `tasks/enhancement-specs.md (new)`
- `docs/PRODUCT.md`
- `docs/SYSTEM.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Cross-order evidence access is denied by design.
- [ ] Collection requirements are explicit service policy.
- [ ] Every implementation child has at most five files and verification.

**Verification:** `npm run test:persistence -- --filter=private-objects`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** This task completes a specification, not the photo-upload feature.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

## T54: COD and digital-payment rollout specification

- [ ] Complete with acceptance evidence

**Description / implementation:** Define merchant onboarding, collection/remittance screens, reconciliation and real provider adapter rollout after money correctness. Create child tasks for webhook auth, uncertain outcomes, UI and operator support.

**Dependencies:** T32, T48.

**Files likely touched:**
- `tasks/enhancement-specs.md`
- `docs/PRODUCT.md`
- `docs/operations/cash-controls.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Goods proceeds and delivery fees remain separate.
- [ ] Provider/support obligations are documented.
- [ ] No optional card feature blocks an otherwise safe cash pilot.

**Verification:** `npm run test:persistence -- --filter=payments; npm run test:persistence -- --filter=ledger`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** No real charge or financial activation without explicit approval.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Checkpoint C18 — after T54

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T55: Future services and enhancement disposition

- [ ] Complete with acceptance evidence

**Description / implementation:** Classify remaining ideas: Google Places backend, driver documents, tipping, cancellation fees, wallet, pooling, multistop, Souqna, ride/freight. For approved scope add small implementation children, preserving partner/legal gates.

**Dependencies:** T48, T53, T54.

**Files likely touched:**
- `tasks/enhancement-specs.md`
- `docs/PRODUCT.md`
- `docs/SYSTEM.md`
- `tasks/evidence.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [ ] Every historical requirement has implement/defer/reject disposition.
- [ ] Approved features have dependencies/files/tests.
- [ ] Souqna activation/co-branding waits for written agreement.

**Verification:** `npm run test:contracts; git diff --check`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Explicitly deferred ideas are not secretly unfinished launch promises; do not claim they are implemented.

**Evidence:** Pending. Record revision, host, commands/exit codes, artifacts and remaining blockers. Do not mark complete for skipped acceptance.

### Final checkpoint

- [ ] Required release tasks have evidence; optional specifications are not mislabelled as implemented features.
- [ ] Every unverified review finding is dispositioned and no known required defect is hidden.
- [ ] Deployment/store actions remain subject to final explicit approval.

---

# Preserved historical checklist

Original check states below are historical; use current task evidence before repeating work.


# Third pass — 22 October 2026

- [x] Live tracking reviewed against Uber behaviour: GPS yardstick, live driver identity, rate limits and socket
      budget, follow camera on web/Android/iOS, stale handling, background polling pause, writer-lock stall.
- [x] 42 test files, lint, typecheck, 21/21 Expo Doctor, 15 browser groups, 9 readiness groups, customer-location
      group and the local load test pass on the new code; the load script is now a documented command.
- [x] Leftovers closed: profile password length (12-100), the dead shared-discount control, 23 untranslated API
      refusals, the orphaned load script (now `npm run test:load`), the phone serial is overridable with
      `WIND_PHONE_SERIAL` (the default is still the owner's A53), stale claims in README/SYSTEM/CAPABILITY-MAP.
- [x] The phone test apps have a documented entry point: `npm run phone:server`, `scripts/start-phone-tests.ps1`,
      `scripts/build-phone-tests.ps1`, `npm run phone:check`.
- [x] Everything committed on `master`; the release archive must be rebuilt from the new commit before a deploy.
- [x] A second, independent review of that pass and a leftover sweep: the defects they found are fixed and covered
      (a held live request must never answer with another driver's position, the Android map must not be torn down
      while it is drawing, a ride in transit shows its next step, resolved reports stay readable, the FAQ matches
      the cancel rule, the phone test apps have a documented entry point).
- [ ] The A53 was not attached during the review: the physical-device matrix (D01-D15) and the rebuilt APK run are
      still outstanding, and the API is still not deployed (Railway build pause, fresh backup, Cloudflare domain).

# Second pass — 21 October 2026

- [x] Recover the completed 1.0.13 checkout; preserve earlier workspace edits; push the held-live-session privacy fix.
- [x] Rerun 39 test files, lint/typecheck, 15 browser groups, customer-location checks and 21 Expo Doctor checks.
- [x] Restore production login, remove stale backup credential overrides and verify existing encrypted snapshots restore.
- [x] Authorize current Railway CLI SSH permission and register the protected, workspace-scoped backup key.
- [ ] Obtain a fresh verified backup once SSH connectivity returns; deploy when the provider's build pause ends. See [resumed handoff](../docs/HANDOFF-2026-10-21-deploy.md).

- [x] Merge the unfinished scenario review and live-tracking branch; resolve conflicts.
- [x] Tracking: heading only while moving, GPS jump gate, clock-skew freshness, ETA without a driver route, LRU route cache.
- [x] Email codes over Cloudflare: verify, self-service reset, support caller check.
- [x] Signed 1.0.13 on the A53; native tracking tested against this API (foreground, background, screen off, relaunch).
- [ ] Owner: deploy the API to Railway (map page, live push, email routes).
- [ ] Owner: add a domain to Cloudflare DNS, onboard it for Email Sending, set WIND_EMAIL_FROM, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_TOKEN.

# Scenario review — 21 October 2026

- [x] Audit current capabilities and stale backlog against implementation.
- [x] Fix GPS upload races, ignored-fix acknowledgments, pickup permission timeout and ride boarding copy.
- [x] Fix premature Android map readiness; verify delayed tiles and moved pin coordinates.
- [x] Run customer, driver, recipient and admin journeys against isolated databases.
- [x] Verify maps and booking on the connected A53 in Chrome.
- [x] Pass 38 test files, 15 browser groups, four phone groups, lint/typecheck, Expo Doctor and Android/iOS exports.
- [ ] Complete rebuilt native APK/iOS checks and provider integrations listed in [QA report](../docs/QA-2026-10-21.md).

# Historical todo: courier-run-eta (loop 19)

- [x] spec: wrong ETA on multi-parcel runs measured in code (useRoad, /track eta)
- [x] server + client
- [x] tests: parcels.test.mjs (run flag, eta, last stop, finished, single job); 3/3 mutants killed; npm test, tsc, lint
- [x] screens (78); A53 Chrome public page (Arabic): run line, no minutes; order page en (built-in browser, phone in owner's hands): run line, ETA back on the last stop; iPhone guide hidden on Android browsers
- [x] ship (deploy eb841dcb). Order-page change reaches Android in the next APK
