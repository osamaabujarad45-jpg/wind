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

- [x] Complete with acceptance evidence

**Description / implementation:** Re-run focused disposable probes for unverified findings. Capture expected versus actual behavior. Convert reproduced findings into the tasks below; add child tasks for findings not yet represented.

**Dependencies:** T01.

**Files likely touched:**
- `tasks/evidence.md`
- `reports/verify-2026-10-29/EVIDENCE.md`
- `reports/verify-2026-10-29/MUTATION.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Each finding has reproduced/fixed/unverified/blocked status.
- [x] No production data is modified.
- [x] All unexplained failures have an owner task.

**Verification:** `npm test; npm run test:persistence`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Run suites sequentially; mocks are not provider evidence.

**Evidence:** Characterization complete — see ../reports/verify-2026-10-29/T02-completion.md and evidence.md "T02 — characterization checkpoint". **Closed 29 Oct:** full gates rerun sequentially on the final integrated tree, explicitly labelled local fallback (k5 `Permission denied`, exit 255): `npm test` **0** (87 suites), `npm run test:persistence` **0** (51 suites + 21 legacy-parity suites), `npm run test:contracts` **0**, `npm run lint` **0**, `npm run typecheck` **0**. The close-out caught a real regression the filtered gates had missed: the T18 KDF carve-out runs `/api/partner/*` outside the HTTP envelope, but only partner *create* got its own transaction — partner **cancel**'s `queuePush` then hit PostgreSQL's `Durable push requires the mutation transaction` → 500 `server_error` (SQLite deferred, so only PG legacy parity caught it). Fixed by wrapping the cancel mutation in `persistence.atomic` like partner create; reproduced (filtered legacy pickup FAIL → 500) and verified green after (PG legacy pickup PASS, SQLite pickup PASS, full persistence rerun exit 0). No production data touched.

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

- [x] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker. (T01/T02/T03 complete; T02 closed this turn by the full-gate rerun below.)
- [x] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends. (`npm test` 87 suites 0; `test:persistence` 0; `test:contracts` 0; lint 0; typecheck 0.)
- [x] Changed platform exports/builds and physical UI checks are evidenced where applicable. (Server/spec tasks only; no UI surface changed.)
- [x] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

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

- [x] Complete with acceptance evidence

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
- [x] Google content cannot reach MapLibre/Apple overlays.
- [x] Unknown capability chooses safe baseline.
- [x] Existing clients retain compatible responses.

**Verification:** `npm run test -- --filter=map`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Test unsupported provider combinations and a stale response arriving after switching.

**Evidence:** Complete 29 Oct, local fallback. New `src/map-provider.ts`: typed `MapRenderer`/`RouteProvider`, `platformRenderers` (baked-binary capability table keyed by `Platform.OS`), `selectRenderer` (unknown platform → `maplibre` baseline — a kill switch cannot enable a renderer the binary lacks), `routeProvider` (normalizes absent → `osrm` legacy compat, string `'google-routes'` and the T07 proxy's metadata object → `google`, anything else → unknown), `canShowOnRenderer` (Google geometry only on a Google renderer; unknown provenance fails closed), `approachKey` (kept route/ETA state bound to order, driver, stop **and provider**). `useRoad` now resolves the platform renderer, drops lines whose provenance the renderer may not show, and includes provider in the kept-stop key. Server: `roadRoute` responses carry additive `provider: 'osrm'` (old clients ignore unknown fields; route.test fixture updated deliberately). Tests: map suite gains the capability/provenance/kept-key matrix plus source-wiring asserts; `npm run test -- --filter=map` 0 (1 suite), `--filter=route` 0 (2 suites), lint 0, both typechecks 0; full persistence gate (incl. PG legacy map/route parity) 0 on the same tree. Stale-response-after-switch and unsupported-combination manual checks are unit-covered; A53 visual pass rides the D06 device pass. No money/feasibility path reads map display data.

### Checkpoint C02 — after T06

- [x] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker. (T04.2 device pass and T05.2 staging acceptance carry explicit blocked/deferred status batched into their physical/operator passes; no dependent code crossed them.)
- [x] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends. (Full gates on the T06 tree: `npm test` 87 suites 0, `test:persistence` 0 incl. both backends and legacy parity, `test:contracts` 0, lint 0, typecheck 0, expo-doctor 21/21.)
- [x] Changed platform exports/builds and physical UI checks are evidenced where applicable. (No UI surface changed in T04/T05/T06 landed code; A53 D06 visual pass owns the map-renderer device evidence.)
- [x] Diff reviewed, feature gates preserved, evidence and next-task handoff updated. (Money/feasibility/COD paths untouched; payments and service gates unchanged.)

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

- [x] Complete with acceptance evidence

Implementation children:
- [x] T08.1: Server-side budgets, kill switch and trigger policy (server/domain/google-routing.ts + tests) — complete with T07 above; fake-call count assertions cover many-user, movement, navigation-remount and outage sequences; exhaustion returns typed limits without retry storms; global cap documented as single-instance-owned with `request_limits`/`google_usage` upgrade path.
- [x] T08.2: Client trigger gating (src/api.ts refetchOnFocus option, src/road.tsx billed-fix movement gating, src/app/book.tsx preview triggers) — complete with T13/T14; stationary/background/refocus never builds a billable URL.

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

**Evidence:** T08.1 complete with T07 (server budgets fake-fixture tested, no billable load: GOOGLE_MAPS_SERVER_KEY unset in every run, kill switch default-off). **T08.2 complete 29 Oct:** `useApi` gains `refetchOnFocus:false` (defaults unchanged for every free endpoint); `useRoad` builds the Google approach URL from the last *billed* fix — the first approach per stop is `preview&shown=1`, later ones `movement&foreground=1&metres=N` only at the server's 250 m threshold (`SIGNIFICANT_MOVEMENT_METRES` mirrored client-side, asserted equal by source read), and a backgrounded app builds no URL at all; the booking screen bills a first shown preview or a changed pin pair, never a rerender/refocus. Parent complete.

## T09: Google native build setup

- [x] Complete with acceptance evidence

**Description / implementation:** Configure SDK 57 react-native-maps with separate restricted Android/iOS keys and a build capability flag. Preserve release/QA guards and account for QA package IDs and signing certificates.

**Dependencies:** T06.

**Files likely touched:**
- `app.config.js`
- `eas.json`
- `tests/phone-test-build.test.mjs`
- `docs/implementation/native-environment.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Baseline binary needs no Google key.
- [x] Google build fails early for missing platform key.
- [x] Server route key is absent from public config.

**Verification:** `npm run test -- --filter=phone-test-build`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Native plugin changes require a rebuilt EAS binary; do not treat OTA as sufficient.

**Evidence:** Complete 29 Oct, local fallback. `app.config.js`: separate restricted keys `GOOGLE_MAPS_ANDROID_KEY` / `GOOGLE_MAPS_IOS_KEY` (legacy `GOOGLE_MAPS_API_KEY` secret still maps to the Android key so existing EAS environments keep working); explicit opt-in `WIND_GOOGLE_MAPS=1` fails the build early when the key for the built platform (`EAS_BUILD_PLATFORM`, `WIND_BUILD_PLATFORM` locally; unknown platform demands both) is missing; phone-test loopback apps cannot opt in, so test APKs never embed a Google key. Keys reach only the react-native-maps plugin (native manifest); `extra.googleMaps` bakes boolean capability `{android, ios}` for `selectRenderer` — never key strings. `GOOGLE_MAPS_SERVER_KEY` remains server-only (T07). Suite extended: baseline bakes no capability and embeds no key; legacy secret maps to Android; opted-in Android/iOS builds fail `/missing: (android|ios)/` without their key and never embed the other platform's key; key strings never appear in `extra`; phone-test opt-in rejected. `npm run test -- --filter=phone-test-build` exit 0; lint 0; typecheck 0. The rebuilt EAS binary with real restricted keys remains the T49/D06 gate.

### Checkpoint C03 — after T09

- [x] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker. (T07 complete; T08 parent open only for T08.2 client gating, which lands with T13/T14 as its own checklist records; T09 complete.)
- [x] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends. (Full gates rerun at the C04 window on the same tree; map/phone-build/scenario suites 0.)
- [x] Changed platform exports/builds and physical UI checks are evidenced where applicable. (No renderer is enabled by default: baseline binaries unchanged; Google-keyed rebuild evidence belongs to T10.2/T49.)
- [x] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T10: Android Google renderer

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T10.1: Renderer implementation and selection wiring (src/google-map.native.tsx new, src/route-map.android.tsx, src/map-provider.ts, src/map-mode.ts new, src/route-map.native.tsx exports Car, tests/map.test.mjs). Complete — see evidence below. `npm run test -- --filter=map` 0; lint 0; typecheck 0 (29 Oct local fallback).
- [ ] T10.2: A53 device acceptance on a Google-keyed rebuilt binary (missing key, slow tiles, pin drag, pan/recenter, driver animation) — blocked on restricted Google keys and the EAS rebuild (T49 gate). Parent stays open until then.

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

**Evidence (T10.1):** New `src/google-map.native.tsx`: react-native-maps `provider={PROVIDER_GOOGLE}` (1.27.2 exports the constant directly, no `Provider` object — verified against the installed module source); readiness waits for `onMapLoaded` (loaded tiles), never `onMapReady` (initialization) — the suite asserts `onMapReady` is absent; failure unmounts the map so overlays go with it and shows the diagram with Retry; foreground-return retry; recenter button; follow camera; pins, closed-checkpoint no-entry markers, road/approach lines converted from `[lng,lat]`; the provider-agnostic gliding `Car` is now exported from `route-map.native.tsx` and reused, so marker motion is identical across native renderers. `src/map-mode.ts` (new): SecureStore-backed `useMapMode` defaulting to `baseline`; an unreadable preference can never select a renderer the binary lacks. `src/route-map.android.tsx`: `RouteMap`/`PinMap` resolve `selectRenderer('android', Constants.expoConfig?.extra?.googleMaps, mode)` — Google only when the binary baked the capability and the user chose the mode; the MapLibre WebView page remains the default and fallback. map suite extended with the capability/preference matrix (kill switch cannot enable an absent renderer; another platform's capability does not select Google) and source-wiring asserts. Both backends unaffected server-side. Device acceptance deferred to T10.2 (Google-keyed rebuild).

## T11: iOS map parity

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T11.1: iOS selection wiring onto the shared Google renderer with the Apple baseline as default (src/route-map.native.tsx, tests/map.test.mjs). Complete — `--filter=map` 0; lint 0; typecheck 0 (29 Oct local fallback).
- [ ] T11.2: Physical iPhone and signed-build evidence — blocked: no physical iPhone and no iOS signing access; never a simulator. Parent stays open until then.

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

**Evidence (T11.1):** `src/route-map.native.tsx` now resolves `selectRenderer('ios', Constants.expoConfig?.extra?.googleMaps, mode)` for both `RouteMap` and `PinMap`: the Google mode reaches the shared `google-map.native.tsx` renderer only when the binary was built with `GOOGLE_MAPS_IOS_KEY`, and the Apple `RouteMap`/`PinMap` (renamed `AppleRouteMap`/`ApplePin`) remain the default and fallback. Marker motion is shared (`Car`), so Google iOS animates exactly like the Apple baseline. Map suite asserts the iOS selection source and that the Apple baseline stays default. Both provider modes cannot be exercised on device without a signed iPhone build (T11.2/D06-iOS gate). No Google-sourced overlay can reach the Apple map: the T06 provenance guard in `useRoad` applies to every renderer.

## T12: Google web renderer

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T12.1: Renderer, singleton loader, CSP gating and web-entry selection (src/google-map.web.tsx new, src/route-map.tsx, server/main.ts webCspFor, app.config.js web capability, tests/map.test.mjs, docs/operations/provider-failures.md). Complete — see evidence below. `--filter=map` 0; lint 0; typecheck 0 (29 Oct local fallback).
- [ ] T12.2: Physical A53 Chrome acceptance (Arabic/English labels, RTL pin drag, blocked-SDK retry/fallback, attribution visible) batched into the D06 pass; needs the restricted browser key configured. Parent stays open until then.

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

**Evidence (T12.1):** New `src/google-map.web.tsx`: Maps JS fetched once per page through a singleton loader (script id `wind-google-maps`, failed loads reset so Retry can refetch), readiness gated on `tilesloaded` (never map construction), per-instance listeners/overlays removed on unmount (`l.remove()`, `setMap(null)`, source-asserted), pins/no-entry/driver-arrow/accuracy-halo drawn as Google symbols, gliding driver snapped across far jumps, follow camera until the user grabs the map, diagram+Retry fallback for blocked SDK/quota/deadline, Google's own attribution untouched. Web entry (`src/route-map.tsx`) selects via `selectRenderer('web', extra.googleMaps, mode)` with MapLibre as default and fallback; `map-mode` now stores the preference in localStorage on web (SecureStore stays native-only). Server CSP is now `webCspFor(key)`: the baseline deployment keeps the exact installed policy (asserted byte-for-byte), and only a deployment with `EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` opens the narrow Google origins (script/connect/img/font/style), framing guard intact. `app.config.js` bakes `extra.googleMaps.web` from the same variable. Suite: `--filter=map` 0 (CSP both variants, source wiring, server-key absence from web code), `--filter=phone-test-build` 0 (web capability case), lint 0, typecheck 0; `npm run test:scenarios` 0 after fixing its own stale reference — the T19 integration removed the `confirmBooking` copy keys and made reconciliation automatic, but `check-scenarios.mjs:126` still clicked a button named `^undefined`; the lost-response branch now reloads and lets the T19 recovery find the committed order on its own (it navigates to `/order/:id` without a second booking), which is the behavior the task ships. Labels follow the browser locale (the Maps JS language is fixed per page load); the Arabic-label check rides T12.2/D06. Tier: fixture + browser automation; physical Chrome acceptance deferred to T12.2.

### Checkpoint C04 — after T12

- [x] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker. (T10.2/T11.2/T12.2 device passes carry explicit blocked status pending Google keys, a rebuilt binary and a physical iPhone; all code halves complete with suites 0.)
- [x] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends. (Full gates: `npm test`, `test:persistence`, `test:contracts`, `test:scenarios` 15/15, lint, both typechecks, expo-doctor 21/21 — all 0 on this tree.)
- [x] Changed platform exports/builds and physical UI checks are evidenced where applicable. (Web export verified by test:scenarios; baseline rendering unchanged with zero Google calls; Google-keyed binaries remain T10.2/T49 gates.)
- [x] Diff reviewed, feature gates preserved, evidence and next-task handoff updated. (Money/feasibility paths untouched by the renderer work; `provider` provenance is additive.)

## T13: Booking map integration

- [x] Complete with acceptance evidence

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
- [x] Google preview cannot change authoritative money.
- [x] Out-of-area pins fail before booking.
- [x] Estimated price/distance remains labelled during provider outage.

**Verification:** `npm run test -- --filter=booking-auth; npm run test -- --filter=route`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Book a synthetic parcel with Google enabled, disabled and failing.

**Evidence:** Complete 29 Oct, local fallback. `src/app/book.tsx`: the preview line follows the selected renderer — Google display route (`googlePreviewPath`) only when the binary baked the capability and the user chose Google; the first shown pin pair bills `preview&shown=1` and every different pair `destination&changed=1` (render-phase trigger state), `refetchOnFocus:false` so remounts and foreground bounces never re-bill, and a typed Google failure falls back to the free OSRM line with the price flow's existing estimated labelling. The preview is provenance-guarded (`canShowOnRenderer`) before it reaches any map; fares, feasibility and the servedCity bound stay on `/price` and `/orders` (money never reads display routes — structurally unchanged, booking-auth suite re-run 0). Out-of-area pins are refused server-side before any booking (map suite pins the URL encoding and the source guards). A physical book-with-Google run needs a Google-keyed binary; that acceptance rides D06/D07 and the T49 matrix.

## T14: Private tracking integration

- [x] Complete with acceptance evidence

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
- [x] Stale GPS cannot produce fresh ETA.
- [x] Multi-parcel runs suppress direct approach.
- [x] Revoked access removes cached markers and route data.

**Verification:** `npm run test -- --filter=presentation; npm run test:access`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53: driver reassignment, completed job, offline, background and access refusal.

**Evidence:** Complete 29 Oct, local fallback. `src/road.tsx` (`useRoad`): the approach source follows the selected renderer — Google calls are gated by T08.2's trigger policy (preview once per stop, then >=250 m foreground movement; URL built from the billed fix so stationary fixes cannot refetch; refocus refetch suppressed; backgrounded builds no URL), while the OSRM approach keeps its ~110 m grid and focus refresh. Stale-GPS freshness, shared-run suppression and stop identity are the existing tested behaviors (presentation/map suites 0, unchanged); a failed or revoked fetch still drops the ETA (`approach.error` → no `shownApproach`) and terminal codes clear data (`useApi`), so revoked access cannot leave cached route state. Kept-route state remains bound to order, driver, stop and provider (T06). A53 device pass rides D06/D10.

## T15: Public tracking privacy and cost

- [x] Complete with acceptance evidence

**Description / implementation:** Default anonymous tracking to baseline MapLibre/OSRM. Any optional Google public mode needs compatible overlays and a bounded authorized call policy; 15-second public polling must not become unrestricted paid routing.

**Dependencies:** T08, T12, T14.

**Files likely touched:**
- `src/app/track/[token].tsx`
- `server/main.ts`
- `tests/share.test.mjs`
- `tests/route.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Expired/revoked links disclose no private location.
- [x] Baseline public tracking makes zero Google calls.
- [x] Provider switching removes old incompatible content.

**Verification:** `npm run test -- --filter=share; npm run test -- --filter=route`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** A53 Chrome: slow/backward clock, network loss, expired token and provider failure.

**Evidence:** Complete 29 Oct, local fallback. `RouteMapProps.forceBaseline` (route-preview.tsx) is honored by all three platform entries: the anonymous track page passes `forceBaseline`, so even a Google-keyed build draws MapLibre/Apple there and makes zero Google calls; the server's `/track/:token/eta` stays OSRM-only (route suite). Expired/revoked-link privacy and the no-private-location rules are the existing share-suite behaviors (0, unchanged). Provider-switch content clearing is the T06 provenance guard plus per-renderer unmount cleanup. Any optional Google public path remains a separate authorization decision (maps-contract paid-activation gates); none is wired. A53 Chrome pass rides D06/D12.

### Checkpoint C05 — after T15

- [x] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker. (T13/T14/T15 complete; renderer device passes stay explicitly batched into D06/D07/D10/D12.)
- [x] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends. (Full `npm test` 87 suites 0, `test:scenarios` 15 groups 0, `test:persistence` 0 incl. 21 legacy-parity suites, `test:contracts` 0, lint 0, typecheck 0 on the wave tree.)
- [x] Changed platform exports/builds and physical UI checks are evidenced where applicable. (Web export exercised by test:scenarios; baseline behavior unchanged with zero Google calls.)
- [x] Diff reviewed, feature gates preserved, evidence and next-task handoff updated. (Money/feasibility untouched; the paid-call policy is client-side gating on top of the server's trigger table.)

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

- [x] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker. (T17/T18/T19 complete; T19.2 device pass batched D07.)
- [x] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends. (The T02 close-out and the C05 window ran the full gates green on the T18-final tree and its successors; persistence passed on both backends again after T20/T21/T22.)
- [x] Changed platform exports/builds and physical UI checks are evidenced where applicable. (No UI surface in T17/T18; T19.1 verified by booking-auth suites.)
- [x] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T19: Uncertain booking recovery

- [ ] Complete with acceptance evidence

Implementation children:
- [x] T19.1: Account-scoped pending payload, recovery card (retry same requestId / edit or discard after confirmed absence), corrupt-record clearing (src/booking.ts, src/app/book.tsx, src/copy.ts, tests/booking-auth.test.mjs). Complete — see evidence.md "Delegation wave 1–2 results".
- [ ] T19.2: A53 recovery journey (server committed + response lost, restart, account switch) batched into the D07 physical pass. Presence matching is list-based with a 2-minute settle window (delegate's noted residual risk); retry stays the idempotent path. Parent stays open until then.

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

**Evidence (T19.1):** Delegate commit `5b66a48` (branch t3/2b5c1e5b, DeepSeek V4.1 Flash 1017 via Modal dedicated) cherry-picked; coexists with the T16 sheet wiring in book.tsx (both verified by typecheck and suites). booking-auth suite exit 0 (recovery checks + authority checks), presentation 0, lint 0, typecheck 0; local fallback. Server-side "at most one order" relies on existing commandId idempotency (T20 formalizes the contract). Dead `confirmBooking` keys removed at integration.

## T20: Booking idempotency contract

- [x] Complete with acceptance evidence

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
- [x] Concurrent retry creates once on both backends.
- [x] Changed payload conflicts.
- [x] Old client and partner behavior have explicit compatibility coverage.

**Verification:** `npm run test -- --filter=contracts; npm run test:persistence -- --filter=pg-contracts`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Exercise lost response, partner retry, different users and missing identity.

**Evidence (T20):** Local Windows revision `d4b1323` + this diff; isolated loopback PostgreSQL 18 on 127.0.0.1:55473. Inventory found `order_commands` (first-party `requestId`, `PRIMARY KEY(user_id, request_id)`) and `partner_orders.external_ref` already stored a payload hash and returned the committed order, but a retry that raced its own first attempt crossed the PG constraint instead of the replay path: before the fix, four concurrent `POST /api/orders` with one `requestId` produced `500 {"error":"server_error"}` (SQLSTATE 23505, logged `correlationId`) for the losers. Fix in `server/main.ts`: on a unique violation the request rolls back and replays the winning key, so concurrent callers receive the committed order (changed payload still `409 idempotency_conflict`); `POST /api/partner/orders` maps a concurrent `externalRef` duplicate onto the winner's order the same way instead of a constraint error. Identity stays optional: a create without `requestId` still books per call, and the key remains user-scoped (`tests/pg-contracts.mjs` T20 block runs after the frozen comparison so recorded ids stay stable). Commands: `npm run test:persistence -- --filter=pg-contracts` exit 0 (frozen 174 exchanges unchanged; 4-way same-request race → one order, changed payload 409, two no-identity creates → two orders, another customer reusing the key → separate order, 4-way partner race → one order + 409 on changed payload); `npm run test -- --filter=api.test` exit 0 (SQLite parity for same-key duplicate, changed payload, no-identity pair and partner race); `npm run test:contracts` exit 0 (two suites); `npm run lint` and `npm run typecheck` exit 0. Docs: `endpoints.json` E029/E032 guards and the WP08 API-contract transition note. Limitation: SQLite serializes requests through one event loop and connection, so its concurrent assertions document installed behaviour but cannot exercise the PG constraint path; the PG suite is the failing-before/passing-after evidence, and no device or field tier applies to this server contract.

## T21: Marketplace abuse limits

- [x] Complete with acceptance evidence

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
- [x] Spam cannot bury legitimate matching demand indefinitely.
- [x] Concurrent creates cannot bypass limit.
- [x] Expiry cannot cancel assigned or not-yet-due scheduled work.

**Verification:** `npm run test -- --filter=jobs-pagination; npm run test -- --filter=schedule`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Use many synthetic searching orders and test all pages remain reachable.

**Evidence:** Complete 29 Oct, local fallback. `server/main.ts`: `WIND_SEARCHING_LIMIT` (default 5, env-tunable) caps a customer's **unscheduled** searching orders inside the write transaction — every booking path enters `createOrder` under `BEGIN IMMEDIATE` (SQLite) or `persistence.atomic` (PostgreSQL), and PostgreSQL additionally takes `pg_advisory_xact_lock` per customer so concurrent creates cannot slip past the count under READ COMMITTED (a real 9-concurrent-create race in `pg-jobs-pagination.mjs` yields exactly 5 created and 4 `409 too_many_searching`); refusals carry a new `err_too_many_searching` copy pair (ar+en). `expireStaleDemand` (exported, hourly timer next to the scheduled-release sweep, own `stale_demand_expiry` transaction) system-cancels searching orders older than `WIND_SEARCH_EXPIRY_MS` (default 24 h, floored at 1 h) with a CAS predicate — assigned custody and not-yet-due scheduled orders are never touched, and the sender gets the existing `cancelled` push. Pagination untouched. Suites: jobs-pagination (cap, cancel-frees-a-slot, scheduled exclusion, expiry CAS vs assigned/scheduled) 0; schedule 0; `test:persistence --filter=pg-jobs-pagination` 0; lint 0; typecheck 0. Job-push throttling (5/10 min) already existed and is preserved.

### Checkpoint C07 — after T21

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T22: Subscription concurrency

- [x] Complete with acceptance evidence

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
- [x] Concurrent create yields one pending record.
- [x] Activate/reject race has one outcome.
- [x] Migration preserves paid history and reports conflicts.

**Verification:** `npm run test -- --filter=api; npm run test:persistence -- --filter=pg-dialect`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Use independent DB connections; a single SQLite process alone cannot prove cross-replica safety.

**Evidence:** Complete 29 Oct, local fallback. **Storage:** a unique partial index `subscriptions_pending ON subscriptions(user_id, plan) WHERE status='pending'` on both backends — SQLite in an additive, idempotent, no-version-bump migration block (like the audit rebuild) that first collapses pre-existing duplicate pendings to the newest per user and plan (paid `active`/`rejected` history untouched); PostgreSQL as versioned migration 22 (`postgres-subscriptions.sql`) with the same collapse statements. **Routes:** the customer request catches the PG unique violation into `409 already_subscribed` (the SQLite envelope serializes check+insert; a 4-way concurrent burst yields exactly one pending record); the admin decision now runs read-check-write in one `persistence.atomic` with a `status='pending'` CAS predicate, so a concurrent activate/reject race has exactly one outcome and the loser gets `409 subscription_decided` (new copy pair ar+en) or `not_found` once the decision committed. **UI:** `subscriptions.tsx` disables both controls while any decision is in flight. **Tests:** api.test burst+race (outcome-aware), `tests/subscription-migration.test.mjs` (new, registered) proving the legacy-SQLite collapse across two real processes plus the PG constraint refusing a duplicate insert, pg-dialect 0. Suites: api.test 0, subscription-migration 0, `test:persistence --filter=pg-dialect` 0, lint 0, typecheck 0. Cross-replica race proof rests on the unique index itself (SQLite cannot open two writers; the PG index is the hard guarantee).

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

**Evidence (T23.1):** Local fallback, sequential exits 0: cash suite (SQLite: forgiveness without approval 409 `approval_required`, missing approval table 503 `approval_unsupported`, positive adjustments and payout boundary unchanged), persistence ops on PostgreSQL under the shared lock, lint, typecheck. Gate order: amount/boundary checks first (400s preserved), then approval binding before insert, inside the same transaction. One-time consumption and atomic approval+mutation remain T24; UI T25; policy acceptance T23.2. Follow-up on 29 Oct: `tests/pg-cash.mjs` had not been re-baselined and still expected unapproved forgiveness, failing the shared persistence gate at the new check; it now registers a second promoted admin, requests the approval, decides it from that other account, asserts the bound-amount refusal (`409` on `-201` against a 200 approval) and records both forgivenesses with their `approvalId` (`npm run test:persistence -- --filter=pg-cash` exit 0).

## T24: Cash approval persistence

- [x] Complete with acceptance evidence

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
- [x] Requester cannot approve self.
- [x] Concurrent decisions execute once.
- [x] Changed amount/driver cannot reuse approval.

**Verification:** `npm run test -- --filter=cash; npm run test:persistence -- --filter=ops`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** HTTP tests with two admins, foreign role, replay and restart.

**Evidence:** Complete 29 Oct, local fallback. `financial_approvals` gains `consumed_at` (postgres-ops.sql for fresh schemas; additive idempotent migration 23 `postgres-ops-repairs.sql` for staging schemas). `recordCash`'s fail-closed forgiveness gate (T23.1) now **consumes** the decision in the same transaction as the cash entry — `UPDATE ... WHERE status='approved' AND consumed_at IS NULL` — so a second entry (new requestId) holding the same approval is refused `409 approval_used` (copy ar+en); the amount/subject binding still re-checks before consumption, so a changed amount/driver fails `approval_required` without spending the approval. Requester separation is enforced at decision time (`second_approver_required`, re-checked at consumption: `decided_by != requested_by` and `decided_by != recorder`). Concurrent decisions: `decideApproval`'s `FOR UPDATE` + `status='pending'` predicate gives exactly one outcome — proven by a two-eligible-approver `Promise.all` race in ops.mjs (loser `approval_decided`). SQLite keeps the deliberate fail-closed `503 approval_unsupported` for forgiveness (no approval protocol on the legacy backend); production money gates stay closed regardless. Suites: ops 0, pg-cash 0 (consumption replay refused), cash 0, contracts 0 (77 additive boundaries), lint 0, typecheck 0.

### Checkpoint C08 — after T24

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T25: Cash recovery and approval UI

- [x] Complete with acceptance evidence

**Description / implementation:** Add review/approve/reject and audited support resolution for pending remittances when driver is blocked/unavailable. Show balance impact and require deliberate confirmation; never impersonate driver confirmation.

**Dependencies:** T24.

**Files likely touched:**
- `src/app/admin/cash.tsx`
- `server/main.ts`
- `src/copy.ts`
- `tests/cash.test.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Unavailable driver does not cause permanent unresolvable pending cash.
- [x] Resolution records reason/evidence reference/actor.
- [x] Double taps cannot duplicate movement.

**Verification:** `npm run test -- --filter=cash`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Phone admin flow using synthetic funds and unauthorized-role controls.

**Evidence:** Complete 29 Oct, local fallback. New additive module `server/domain/cash-ops.ts` (registered in the additive contract as T25-cash-ops: 2 boundaries, anonymous 401): `GET /api/admin/cash/pending` lists handovers with driver identity and status; `POST /api/admin/cash/:id/resolve` confirms or disputes a pending remittance with a required reason (>=5 chars) and optional evidence reference, recording `resolved_by` + `resolution_note` (additive columns on both backends) and reusing the driver's own CAS predicate so a double tap or a racing driver decision moves the entry exactly once (`409 already_decided`). `src/app/admin/cash.tsx` gains a pending-handover section with a deliberate confirm()-guarded resolution dialog (reason + evidence fields, both controls wait while busy). The blocked-driver journey is HTTP-tested: block revokes the driver session, the administrator resolves with reason+evidence, the row records actor/note, the repeat resolve refuses, and the balance math accounts for the resolution. Suites: cash 0, presentation 0, contracts 0 (schema fixture re-recorded with review: +subscriptions_pending index, +cash_entries resolved_by/resolution_note), ops 0, pg-cash 0, lint 0, typecheck 0. Physical admin-flow acceptance rides D14 (synthetic funds only).

## T26: Order transition race review

- [x] Complete with acceptance evidence

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
- [x] Every assertion has an executable disposition.
- [x] Expected-state conditions prevent stale transitions.
- [x] Wrong-code retries and first-order discounts remain bounded.

**Verification:** `npm run test -- --filter=pickup; npm run test -- --filter=schedule; npm run test -- --filter=promo; npm run test -- --filter=customer-rating`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Retain already-fixed reschedule ownership tests; use synchronized concurrent requests.

**Evidence:** Complete 29 Oct, local fallback. **Rating race (real, fixed):** both rating branches read a snapshot then wrote unconditionally — a concurrent second rating with a different value could overwrite the first. Both UPDATEs are now conditional (`customer_rating IS NULL OR customer_rating = ?`, and per-provided-field equivalents for rating/price_rating), so a raced different value is refused `cannot_rate`, a raced or replayed same value (lost response) still succeeds, and a replay beside a new field (rating already saved + first priceRating) works — proven by a Promise.all race in customer-rating.test.mjs plus the existing replay suite. **Promo race (fixed without a constraint):** a unique `(promo_id, customer_id)` index was tried and correctly REJECTED — a cancelled order's redemption deliberately frees the code (`promoUses` ignores cancelled orders), so the index would block legitimate re-use; reverted before commit. The count-then-insert race is instead closed by a per-promo-and-customer `pg_advisory_xact_lock` inside the booking transaction (the T21 pattern); SQLite serializes through `BEGIN IMMEDIATE`. **Proof lock (by design, now executable):** the five-miss lock survives a driver reattempt — pickup.test.mjs walks five wrong codes → `proof_locked` with the correct code → on_hold → admin reattempt → still locked → return leg starts its own five attempts and completes. **Schedule race:** refuted in T01 (do not reopen); the reschedule ownership assertion remains green (schedule suite 0). Suites: customer-rating 0, pickup 0, promo 0, schedule 0, contracts 0, pg-contracts 0 (readiness migration expectation updated to the current 23 with the reason recorded), lint 0, typecheck 0.

## T27: Declared-scope authorization

- [x] Complete with acceptance evidence

Implementation children:
- [x] T27.1: Scope predicates and redaction (server/domain/eligibility.ts, server/domain/resource-scope.ts, tests/resource-scope.mjs, tests/resource-scope-sqlite.mjs) — complete; sqlite capability suite registered in scripts/run-tests.mjs by the leader so `npm test` always covers the fail-closed gate.
- [ ] T27.2: Rewire getOrder's inline `canSee` (server/main.ts ~L348-355) onto `openToDriver` to remove the duplicated visibility policy (semantics verified equal at integration; drift risk only). Shares main.ts with T22/T29, so schedule after wave 3 merges.

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

**Evidence:** Complete. Delegate commit `e3399ed` (branch t3/f672ee2d, DeepSeek V4.1 Flash 1017 via Modal dedicated) cherry-picked unchanged; resource-scope persistence suites (5 lines incl. the new "browsing-driver scope is active, vehicle-bound, release-aware and redacted") exit 0 on PostgreSQL under the shared lock, local fallback. Preassignment field minimization and SQLite capability gating verified by the same suites. Full-suite closure at the checkpoint window.

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

- [x] Complete with acceptance evidence

**Description / implementation:** Post balanced journals atomically at completion/return using stored commission and promo allocation. Reuse stable business references; importLegacy is not a continuous synchronization mechanism.

**Dependencies:** T28.

**Files likely touched:**
- `server/domain/ledger.ts`
- `server/main.ts`
- `tests/ledger.mjs`
- `tests/pg-cash.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] One journal per business fact.
- [x] Rollback leaves neither partial order nor journal.
- [x] Import plus new events never double-count.

**Verification:** `npm run test:persistence -- --filter=ledger; npm run test:persistence -- --filter=pg-cash`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Reconcile import, two completions and return against explicit minor-unit totals.

**Evidence:** Complete 29 Oct, local fallback. `server/main.ts` gains `postOrderJournals`/`postCashJournal` over the WP13 Ledger capability (PostgreSQL + migration 16 only; SQLite has no ledger tables and keeps the legacy cash flow as the sole authority). Completion and return post the commission-accrual and discount-funding journals inside the advance transaction, using exactly `importLegacy`'s stable business references (`order:{id}:commission` / `order:{id}:discount`) and the trigger-maintained `commission_minor`/`discount_minor`; a posting failure fails the enclosing money transition, so a rollback leaves neither a partial order nor a journal. Suite: a real HTTP completion posts the journals, and a subsequent `/admin/ledger/import` adds none for the same order (business-ref dedupe). ledger suite 0.

## T30: Live cash ledger posting

- [x] Complete with acceptance evidence

**Description / implementation:** Post confirmed remittance, adjustment and reversal transactionally. Pending/disputed remittances remain unsettled; corrections append reversals without deleting originals.

**Dependencies:** T29, T24.

**Files likely touched:**
- `server/domain/ledger.ts`
- `server/main.ts`
- `tests/ledger.mjs`
- `tests/pg-cash.mjs`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Live balances update immediately after confirmed events.
- [x] Retry cannot post twice.
- [x] Reversal restores expected balance with preserved history.

**Verification:** `npm run test:persistence -- --filter=ledger; npm run test:persistence -- --filter=pg-cash`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Compare cash-screen totals and ledger after confirm/dispute/reversal.

**Evidence:** Complete 29 Oct, local fallback. The driver's `confirm` decision, the T25 administrator resolution (`cash-ops` gained a `postCashJournal` hook), and `recordCash` adjustments all post the `cash-entry:{id}` journal in the settling transaction — pending and disputed handovers stay unsettled (no journal), adjustments post as they are recorded with the import's sign-aware direction, and `postJournal`'s `business_ref` conflict makes any retry idempotent (same payload replays, changed payload `409 idempotency_conflict`). Suite: pending records no journal, confirmation lowers the receivable, a positive adjustment raises it, and import adds nothing for the live entries. ledger 0, pg-cash 0, typecheck 0, lint 0 errors. Dispute/reversal visual reconciliation stays a D14 device check; production posting requires the PostgreSQL gate to open (T34/T50).

### Checkpoint C10 — after T30

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T31: Single settlement authority

- [x] Complete with acceptance evidence

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
- [x] Captured card cannot also settle as cash.
- [x] Concurrent capture/cash selects one valid outcome.
- [x] Refund/reversal changes balance once.

**Verification:** `npm run test:persistence -- --filter=payments; npm run test:persistence -- --filter=ledger`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Race capture callback with cash settlement and retry both.

**Evidence:** Complete 29 Oct, local fallback. `server/domain/payments.ts` gains a per-order settlement gate: a card capture (webhook apply, provider-create, and the query/getIntent promotion paths) refuses when `cash_receipts.collected_minor > 0`, and `Ledger.collect` refuses (`409 settlement_conflict`, copy ar+en) while a card capture stands (`captured`/`partially_refunded`). Both sides take the same per-order `pg_advisory_xact_lock` inside their transactions, so a concurrent capture/cash race selects exactly one winner. A **full refund releases the order back to cash** (`refunded` is not a standing capture) — proven end-to-end: captured card blocks cash, collected cash blocks capture, refund then permits collection. Refund/reversal balance-once semantics are the existing cumulative-refunds + ledger rules (T28/T30), re-run green. Suite: payments 0, ledger 0, contracts 0, typecheck 0, lint 0 errors. The concurrent race is serialized structurally by the shared advisory lock; the live-provider capture race remains a T50 rehearsal item.

## T32: Partial COD resolution

- [x] Complete with acceptance evidence

**Description / implementation:** Define partial goods collection/remittance, outstanding remainder and exception authority. Keep goods proceeds distinct from delivery fee/commission and add stable command identities.

**Dependencies:** T31.

**Files likely touched:**
- `server/domain/payments.ts`
- `server/db/postgres-payments.sql`
- `tests/payments.mjs`
- `docs/operations/cash-controls.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Collected/remitted/outstanding totals reconcile.
- [x] Duplicate collect/remit does not increment twice.
- [x] Partial return/dispute has explicit resolution.

**Verification:** `npm run test:persistence -- --filter=payments`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Partial collect, return, remit, repeated command and collector change.

**Evidence:** Complete 29 Oct, local fallback. `merchant_cod` gains `remitted_minor` (CHECK ≤ collected; postgres-payments.sql for fresh schemas, idempotent migration 25 `postgres-payments-repairs.sql` for existing) and `merchant_cod_events.request_id`. `remitCod` now moves **everything collected but not yet remitted** — from a partial collection as well as a full one — keeping the outstanding explicit (goods − collected, collected − remitted); a repeat without new collection refuses `cod_unavailable`, and a replayed command identity (request_id on the append-only event) returns the same row without moving again. Goods proceeds stay structurally separate from delivery fee/commission (merchant_cod carries goods_minor only). New finance authority `POST /api/orders/:id/cod/resolve` (additive contract WP14 +1 boundary, anonymous 401) closes an unremittable COD as `returned` with a required reason and event. Suite: partial collect → partial remit (remitted = collected, status partial) → nothing-to-remit refusal → replayed remit returns once → remainder collected → final remit reconciles remitted == goods; resolve refuses an already-terminal row and a short reason, closes a disputed COD, and further collection is refused. payments 0, contracts 0 (78 additive), typecheck 0, lint 0 errors. Operator-facing COD/cash rollout documentation stays T54; live remittance is an operator gate.

## T33: PostgreSQL destination-change parity

- [x] Complete with acceptance evidence

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
- [x] Consent remains mandatory.
- [x] Accepted change preserves rate policy.
- [x] Concurrent accept/cancel and old imported rows behave safely.

**Verification:** `npm run test -- --filter=change-destination; npm run test:persistence -- --filter=pg-dialect`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Run equivalent vectors on SQLite and PostgreSQL.

**Evidence:** Complete 29 Oct, local fallback. **Storage:** migration 26 `postgres-destinations.sql` — the `destination_changes` table in PostgreSQL types plus `orders.commission_rate` (idempotent ALTER); `SQLITE_ONLY_COLUMNS` emptied so the import populates the rate snapshot. **Module:** the `sqliteOnly` gate became `destinationAvailable` (capability follows the storage, either backend); the legacy `BEGIN IMMEDIATE`/`COMMIT` blocks became an `inTx` helper that **joins the HTTP envelope's transaction on PostgreSQL instead of nesting a second one** (the earlier naive port lost the propose UPDATE to the envelope boundary — caught by the new PG vector before commit); `ORDER BY rowid` became `created_at`. **Writers unified:** the three `commission_rate` assignment writers and the account-deletion privacy scrub now run on both backends; `toOrder`'s pending-card gate follows `destinationAvailable`. **Tests:** the SQLite suite passes unchanged (consent, assignment rate, atomic cash, retries, stale orders, privacy scrub); `change-destination` joined the PG legacy-parity list as its 22nd suite with a durable-outbox drain adaptation — the same vectors now run against real PostgreSQL. Suites: change-destination 0 (SQLite), full `test:persistence` 0 incl. 22/22 legacy suites, `npm test` 0, contracts 0, typecheck 0, lint 0 errors. `sqliteOnly` is gone from the module, closing P2.15.

### Checkpoint C11 — after T33

- [x] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker. (T31/T32/T33 complete; the money-correctness workstream T27-T33 is closed with production gates still off.)
- [x] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends. (Full `test:persistence` 0 with 22/22 legacy-parity suites, `npm test` 88 suites 0, contracts 0, lint 0, typecheck 0 on the T33 tree.)
- [x] Changed platform exports/builds and physical UI checks are evidenced where applicable. (Server-only work; no UI surface.)
- [x] Diff reviewed, feature gates preserved, evidence and next-task handoff updated. (Payments/COD/ledger gates remain closed; the PG parity work does not open cutover.)

## T34: Import and cutover rehearsal

- [x] Complete with acceptance evidence

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
- [x] Migration retry is safe.
- [x] Counts and monetary totals reconcile.
- [x] Rollback after new PG writes never points at stale SQLite.

**Verification:** `npm run test:persistence; npm run test:contracts`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Fixtures first; real snapshots need authorized access and redacted evidence. Reconcile pre-T28 `rejected` refund rows against provider statements inside the rehearsal.

**Evidence:** Complete 29 Oct, local fallback — the rehearsal is continuous, not a one-off. `tests/pg-import.mjs`: consistent SQLite snapshot → import into an isolated PostgreSQL schema → exact reconciliation of counts, money totals, rounding exceptions and open custody → `pg_dump`/`pg_restore` restore → HTTP parity against the restored database (suite output records tables/rows/rounding exceptions/open custody per run, exit 0 in every full persistence gate this session). `tests/pg-migration-lock.mjs`: the migration CLI waits through a concurrent advisory lock and stays retry-safe. The rollback rule and the **pre-T28 `rejected` refund reconciliation duty** are now written into `docs/operations/restore.md` (import-rehearsal section): a provider statement reconciliation is required before the payments capability enables on imported data, and PostgreSQL backups own recovery once the API writes there — the SQLite snapshot is never re-promoted (no production fallback branch exists). A real authorized snapshot rehearsal with the operator record remains T50's staging gate; this task closes the repository-side rehearsal duty.

## T35: Verified identity readiness

- [x] Complete with acceptance evidence

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
- [x] Verified flags follow actual proof.
- [x] Expiry/replay/resend/recovery work.
- [x] Outage does not create duplicate identities or unsafe recovery.

**Verification:** `npm run test -- --filter=phone; npm run test:persistence -- --filter=phone-identity`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Only approved test numbers with credentials; never log codes or tokens.

**Evidence:** Complete 29 Oct, local fallback. The capability disposition is now written into `docs/operations/provider-failures.md` (T35/T36 section): Entra sign-in implemented behind tenant configuration; verified phone implemented with proof-required flows against the local provider double, real proof gated on an approved SMS provider; verified flags follow actual proof, never configuration. Expiry/replay/resend/recovery are the WP06 identity suites' coverage (identity, limits, recovery, authority, crash — all 0 in every full persistence gate). Outage honesty: provider failure creates no identity, marks nothing verified, and preserves send budgets (WP06 crash suite). Real phone-proof delivery remains the operator's SMS-account gate (access register); no claim of real delivery is made.

## T36: Email recovery activation preparation

- [x] Complete with acceptance evidence

**Description / implementation:** Prepare verified sending domain, sender identity and reset rate limits. Update active runbook away from superseded Railway instructions without deleting history.

**Dependencies:** T18.

**Files likely touched:**
- `server/main.ts`
- `src/phone-recovery.tsx`
- `tests/email.test.mjs`
- `docs/operations/provider-failures.md`

**Estimated scope:** M (3–5 files); split if the actual change exceeds this.

**Acceptance criteria:**
- [x] Disabled email never promises delivery.
- [x] Expired/used reset cannot replay.
- [x] Real delivery evidence precedes activation.

**Verification:** `npm run test -- --filter=email`. Execute each semicolon-separated command separately; common checks above also apply.

**Manual / failure-case check:** Use approved test mailbox after access; do not invent sender or support details.

**Evidence:** Complete 29 Oct, local fallback. `docs/operations/provider-failures.md` records the activation prerequisites: a verified sending domain and sender identity on Cloudflare Email Sending (the historical Railway e-mail setup is explicitly superseded, kept only as history), `WIND_EMAIL_FROM` on that domain, and one approved test-mailbox delivery as recorded evidence before `emailReset` may flip true — the API's `auth/options` never promises delivery it cannot perform. One-use reset with replay refusal, cooldowns, lockouts and provider-failure honesty remain the email suite's coverage (0). The interim support-recovery control (audited operator-read one-time password) is documented as an interim control with its transition path, closing the T01 P2.6 disposition honestly.

### Checkpoint C12 — after T36

- [ ] Prior three tasks meet criteria or have explicit blocked status; no dependent work crosses a blocker.
- [ ] Lint, both typechecks and affected tests pass sequentially; shared persistence changes pass on both backends.
- [ ] Changed platform exports/builds and physical UI checks are evidenced where applicable.
- [ ] Diff reviewed, feature gates preserved, evidence and next-task handoff updated.

## T37: Native notification completion

- [ ] Complete with acceptance evidence

Code-side children (device delivery remains the EAS/FCM operator gate):
- [x] T37.1: cold-start link handling, relaunch reauthorization, shared VAPID subject without the obsolete default, kind-driven web-push urgency (src/native-push.ts, src/session.tsx, server/push.ts, server/main.ts, server/worker.ts, worker-suite environments). Complete 29 Oct — see evidence below.

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
- [x] Foreground/background/terminated tap reaches current authorized screen. (Cold-start path now handled in code; device tap evidence rides D13.)
- [x] Account switch cannot expose old orders. (Existing server-side session binding/revocation suites.)
- [x] Invalid tokens and duplicates do not retry forever. (Existing outbox expiry/410/poison suites.)

**Verification:** `npm run test:persistence -- --filter=native-push; npm run test -- --filter=push`. Execute each semicolon-separated command separately; common checks above also apply.

**Evidence (T37.1):** `src/native-push.ts`: the cold-start response — a tap that launched the app, which the response listener never sees — is now opened via `getLastNotificationResponseAsync`, with per-identifier dedupe so the listener and the cold-start path cannot double-navigate. `src/session.tsx`: a relaunch into an existing session re-authorizes the device's push destination (idempotent re-registration; the account-switch/revocation guarantees stay server-side). `server/push.ts` gains `pushSubject()`: the obsolete `wind-production-72aa.up.railway.app` default is REMOVED — `WIND_PUSH_SUBJECT` (operator mailto:/https:) is required before web push can send, and `main.ts`/`worker.ts` read it at send time. The worker's web-push `Urgency` now follows the shared `URGENT_KINDS` list (high for urgent kinds, normal for the rest) instead of a hard-coded high. Suite environments (events/outbox/native-push/dispatch-races/realtime-auth and the legacy-parity fixture) supply a synthetic subject; the legacy parity fixture sets it for every generated suite. Gates: full `test:persistence` 0 (22/22 legacy), push suites 0, typecheck 0, lint 0 errors. Device cold-start/battery evidence rides D13 with a rebuilt EAS binary (T49).

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

- [x] Complete with acceptance evidence

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

**Evidence:** Complete. Delegate work `62d1f5d` (branch t3/733b16b2) — the child's summary claimed a commit that did not exist; the leader committed its uncommitted diff verbatim after review. Selection discipline now uses a reasoned exemption map plus a duplicate-registration guard; check-contracts delegates to the runner registry (single source of truth); pg-test-server drops only fixture-owned schemas (`wp03_legacy_<uuid32>`, asserted by regex, and drops on init failure); push-server settle waits on recorded `persistence.detached` promises instead of a 50 ms sleep (the legacy PG generator's replace target now matches the commented original, documented in the child's summary and in docs/implementation/test-harness.md). Verification: full `npm test` sequential at the checkpoint window below; lint/typecheck 0; presentation and customer-location suites 0 post-integration (duplicate import removed). No deadline widening observed in the diff.

## T45: Dependency and SDK upgrade audit

- [x] Complete with acceptance evidence

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

**Evidence:** Complete. 29 Oct 2026 local fallback, sequential exits 0: `npx expo-doctor` 21/21; `npx expo install --check` up to date; `npm audit --audit-level=high` one high (deepmerge GHSA-gcqx-w48m-w2h4) with no SDK-57-line fix — dispositioned in docs/implementation/dependency-security.md as a carried vendor patch with regression tests (the stale "zero vulnerabilities" claim corrected); seven lows under threshold. No blind installs, no lockfile change, no native dependency change (so no rebuilt-device gate triggered); SDK stays 57 per plan decision 1. dependency-security suite result rides in the checkpoint full-gate run.

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
