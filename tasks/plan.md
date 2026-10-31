# Implementation plan: finish Wind / Fastship

Prepared 29 October 2026 against clean baseline `85b5a3a`. Task tracker: [todo.md](todo.md). Agent start prompt: [HANDOFF.md](HANDOFF.md). This is a planning deliverable, not implementation or production authorization.

## Objective and scope

Finish known app defects, integrate reliable maps, complete required provider/backend work, improve mobile usability and prepare an evidenced release. Preserve existing parcel, customer, driver, recipient and administrator behavior. “All issues” means all presently discovered issues plus newly reproduced regressions encountered during execution; it is not a claim that a read-only audit found every possible bug.

The next agent must work one small task at a time. The default product is Arabic-first parcel delivery. Rides/freight, digital payments, goods payouts, new evidence uploads, pooling and other expansion stay explicitly gated until their contracts and operating requirements are met. T53–T55 produce specifications and implement/defer decisions, then add implementation child tasks for approved scope. They must never be marked as completed product features merely because a specification exists.

This extends the earlier incomplete plan for the same app-completion work. Original plan and checklist contents are retained below their new sections. Do not delete old unchecked items or pretend historical verification applies to a new candidate.

## What was actually checked

- Read package/config, existing plans, release readiness, feature inventory, review, handoff, maps research, test runners and selected source implementations.
- Current package: Expo `~57.0.31`, React Native `0.86.3`, react-native-maps `1.27.2`; npm lockfile exists, no Bun lockfile was observed. Use npm/npx until repository state changes.
- Current map split: web MapLibre, Android hosted MapLibre WebView, iOS native Apple map. Existing maps are implemented; provider operations and Google integration are separate work.
- Read source confirms unbounded-age last-known pickup GPS, synchronous password hashing/malformed-hash exception risk, blanket searching-driver scope access, pending/timeout refund rejection, import-only ledger journals, and partial-COD terminal limitations.
- Existing reports show many landed fixes. The former nolock/GPS-grace/WEB_ROOT issues were fixed in `2b61fc4`; retain their regressions.
- SSH to `k5` was refused: `Permission denied (publickey,password,keyboard-interactive)`.
- **Local fallback** `npm run lint` and `npm run typecheck` passed; typecheck includes app and server configurations.
- ADB was absent from PATH; the installed SDK executable at `C:/Users/osama/AppData/Local/Android/Sdk/platform-tools/adb.exe` listed `R5CTB0FJP9Z`, model `SM_A5360`, state `device`.
- No device interaction, full test suite, provider delivery, cloud mutation, live order or field route validation was performed for this plan.

Evidence tiers must remain distinct: source review; deterministic fixture; isolated integration; physical browser; native binary; real provider; supervised field pilot. Passing one does not substitute for another.

## Decisions for the implementing agent

1. **Keep SDK 57 during completion.** Validate with Expo Doctor and SDK-compatible installs. Major upgrades require their own bounded migration, benefit, compatibility proof and rollback plan. No dependency replacement merely because a newer release exists.
2. **Preserve server authority.** Money is integer minor units where the contract requires it; quote/commission/eligibility/checkpoint policy is not derived from map display data. Do not casually change legacy units: inspect the specific boundary.
3. **Maps have independent rendering and routing capabilities.** Represent source/provider on route data. Preserve existing OSRM price/feasibility/checkpoint behavior. Google display routes are a separate adapter; old clients keep current route endpoints.
4. **Baseline first, Google opt-in.** Android/web retain MapLibre; iOS retains Apple baseline. Google native and web are planned, but production enablement requires restricted keys, covered geography, cost controls and platform acceptance. A kill switch cannot enable a renderer absent from the binary.
5. **No dishonest fallback.** When road routing fails, show pins and explicit estimate/unavailability; no invented road line, fake ETA or implicit public OSRM service. Keep servedCity rejection and the shared 20 km bound until an explicit service-policy change.
6. **Google content stays within allowed presentation.** Do not draw Google Routes/Places content on MapLibre or Apple maps. Switching to baseline clears Google overlays and requests independently sourced baseline data. Do not assume the converse prohibition: whether independent OSRM geometry may appear on Google is a distinct policy/product question; this plan uses separate provider paths to avoid ambiguity.
7. **Public tracking defaults to baseline.** Avoid charging a Google request for every anonymous 15-second ETA poll. Any optional Google public path has separate authorization, quotas and provenance handling.
8. **No unreviewed Google cache.** Do not reuse OSRM route LRU rules, store raw Google bodies in logs, or make blanket claims about allowed retention. Check current agreement and specific content class. Provider-generated address data is not automatically ordinary user-entered data.
9. **Repair dormant money/privacy defects before PostgreSQL activation.** The older handoff deferred them; this broader completion plan schedules isolated fixes while keeping production gates closed. Current runtime has a restricted `WIND_POSTGRES_STAGING` branch; do not claim PG is completely unreachable, or that it is already production-ready.
10. **Avoid unrelated rewrites.** Keep Expo Router in `src/app`; components/domain helpers stay outside it. Modify existing seams before inventing frameworks, generic repositories or global state systems.
11. **Financial controls fail closed.** Proposed policy requires a second approver for forgiveness; unsupported backend must reject approval-required actions. Policy thresholds remain draft until owner acceptance. Do not silently accept a per-call cap as equivalent control.
12. **Separate readiness scopes.** Android parcel pilot can be assessed independently from optional cards or iOS. A missing physical iPhone blocks iOS acceptance, not truthful reporting of passed Android checks. T49 records per-platform sub-status, allowing Android-specific release descendants when their required criteria pass.

## Provider contract to write before UI changes (T03/T06)

Document the existing route tuple order before adding adapters: `[longitude, latitude]` geometry versus `{latitude, longitude}` point objects. Specify km/minutes units, bounded line length, malformed coordinate rejection, and current checkpoint fields. Preserve consumer compatibility through optional additions or a separate endpoint.

Recommended new capability concepts (names are proposals, not existing APIs): renderer family; available platform renderers baked into the binary; route provider/source; configured versus currently healthy; explicit unavailable reason. A response for another order/driver/stop/provider must never update current state. Define cancellation/late-response tests.

Paid route calls need a trigger table: initial meaningful preview, destination change, significant movement while foreground, authorized retry. Rerender, stationary poll, background timer and anonymous link refresh are not independent reasons to bill. Specify finite global/per-user budgets and simultaneous-request handling with fake-provider assertions. Monetary budget values and projected traffic need operator approval before actual service activation.

Do not add Google Places casually while implementing search. T16 delivers local searchable choices. An approved Places enhancement needs separate proxy, session-token lifecycle/field-mask cost review, attribution, allowed storage, out-of-area confirmation, quotas and renderer compatibility tasks.

## Execution order and dependencies

The checklist is a topologically ordered backlog, not a command to run every phase concurrently. Default: choose the lowest numbered eligible required task; if blocked on access, record it and continue unrelated eligible work.

| Workstream | Tasks | Completion meaning |
|---|---|---|
| Establish truth | T01–T03 | Current finding register and map decision/corpus |
| Maps | T04–T16 | Baseline reliability, provider separation, platform renderers, booking/tracking and local search |
| Existing app correctness | T17–T26 | Authentication, uncertain booking, limits, subscription/cash controls and transitions |
| Gated backend correctness | T27–T34 | Scope privacy, refund/ledger/COD invariants, destination parity and import rehearsal |
| Providers and mobile quality | T35–T45 | Identity/email/push/dispatch, battery, accessibility, performance and supported dependencies |
| Operational release | T46–T52 | Recovery, diagnostics, docs, exact binary, staged cutover, pilot and store package |
| Explicit expansion | T53–T55 | Specifications/disposition, followed by approved implementation children |

Ordered task index:
- [ ] T01: Reconcile the baseline
- [ ] T02: Reproduce the remaining review findings
- [ ] T03: Agree the map contract and regional corpus
- [ ] T04: Fresh pickup location fallback
- [ ] T05: Reliable baseline road routing
- [ ] T06: Provider-aware route contract
- [ ] T07: Google routing proxy
- [ ] T08: Paid routing budgets
- [ ] T09: Google native build setup
- [ ] T10: Android Google renderer
- [ ] T11: iOS map parity
- [ ] T12: Google web renderer
- [ ] T13: Booking map integration
- [ ] T14: Private tracking integration
- [ ] T15: Public tracking privacy and cost
- [ ] T16: Local address search enhancement
- [ ] T17: Malformed password hash handling
- [ ] T18: Asynchronous bounded password hashing
- [ ] T19: Uncertain booking recovery
- [ ] T20: Booking idempotency contract
- [ ] T21: Marketplace abuse limits
- [ ] T22: Subscription concurrency
- [ ] T23: Cash adjustment control policy
- [ ] T24: Cash approval persistence
- [ ] T25: Cash recovery and approval UI
- [ ] T26: Order transition race review
- [ ] T27: Declared-scope authorization
- [ ] T28: Refund uncertain outcomes
- [ ] T29: Live order ledger posting
- [ ] T30: Live cash ledger posting
- [ ] T31: Single settlement authority
- [ ] T32: Partial COD resolution
- [ ] T33: PostgreSQL destination-change parity
- [ ] T34: Import and cutover rehearsal
- [ ] T35: Verified identity readiness
- [ ] T36: Email recovery activation preparation
- [ ] T37: Native notification completion
- [ ] T38: Presence and dispatch readiness
- [ ] T39: Driver render and battery budget
- [ ] T40: Booking interaction polish
- [ ] T41: Sensitive administration UX
- [ ] T42: Arabic accessibility and copy
- [ ] T43: Query-performance debt
- [ ] T44: Test harness debt
- [ ] T45: Dependency and SDK upgrade audit
- [ ] T46: Backups and recovery operations
- [ ] T47: Production diagnostics and service policy
- [ ] T48: Reconcile capabilities and docs
- [ ] T49: Native artifact and physical-device matrix
- [ ] T50: Staged cutover rehearsal
- [ ] T51: Controlled parcel pilot
- [ ] T52: Store and public-release package
- [ ] T53: Pickup evidence enhancement specification
- [ ] T54: COD and digital-payment rollout specification
- [ ] T55: Future services and enhancement disposition

The detailed task checklist is authoritative for status; this index is navigation. Checkpoints occur after each three tasks and at final acceptance. If a task spans more than one focused session or five files, split it before editing. For example, provider credentials, adapter tests and phone acceptance can be separate children, but the parent stays open until all required children pass.

Safe future parallel work, only if requested: independent documentation/evidence and isolated test authoring after contracts are fixed. Serialize changes to `server/main.ts`, schemas, `src/copy.ts`, `src/road.tsx`, package lock and shared test ports. This planning turn spawned no agents.

## Existing findings: carry-forward map

| Historical issue | Current treatment |
|---|---|
| SQLite nolock/WAL crash, GPS assignment-grace mismatch, production WEB_ROOT guard, 17 km boundary test | Fixed in 2b61fc4; preserve tests, not new implementation tasks |
| IaC bindings, CI PostgreSQL gate, test orphan detection, settings bounds, nearest trusted-hop limiter, audit rows, courier unblock guard | Reported landed; T01 checks source and current evidence before reopening |
| Reschedule owner assertion, home search/font minimum height, staging migration search_path | Reported fixed; preserve regressions |
| Old Railway deployment blocker | Superseded for active Azure origin according to readiness report; legacy data export/access remains an explicit inventory question |
| Old native build/device requirement | Some physical evidence exists for previous artifacts; T49 still requires exact new candidate |
| P2 #1–#5 refund, ledger, COD, payment method, scope | T27–T32; prepare fixes in isolated PG, keep production gates |
| P2 #6/#7 admin password/edit audit | Audit rows landed; T01 additionally disposition plaintext temporary-password behavior and recovery design |
| P2 #9/#10 password CPU and malformed hash | Source-confirmed; T17–T18 |
| P2 #11 pending remittance / #14 forgiveness | T23–T25 |
| P2 #12 subscriptions / #13 board starvation | T21–T22; pagination already landed, do not confuse pagination with abuse limits |
| P2 #15 destination PG / #16 image CI / #17 idempotency | T33; T01 verifies existing image job; T20 |
| P3 proof-lock reattempt, rating, schedule, first-order promo | T26; reproduction before changing correct guards |
| P3 sessions index and per-row queries | T43 |
| P3 pending booking, action confirmations, opposing subscription submits | T19/T22/T41 |
| P3 Arabic large text, inline copy, landmark reset, schedule recalculation/freshness | T04/T40/T42 |
| P3 cold-start push, repeated secure reads/provider rerenders | T37/T39 |
| P3 fixed waits, duplicate imports/contracts, wall-clock regression tests, schema cleanup, shared ports | T44; split additional files into explicit children |
| P3 release version number | EAS remote numbering already chosen; T49 verifies exact artifact, never adds stale local code |
| P3 no-dependency claim, push/COD/destination docs, VAPID/urgency, cash formula | T37/T48; cash formula must match discounts and journal semantics |
| P3 unused SQLite tables, routes without clients, nonexistent spec paths, stale screenshots | T01/T48 classify each; T42 refreshes visual evidence; remove nothing without proven non-use |

T01 must expand this grouped map into one row per actual assertion in the historical report, including items embedded in prose. Counts in old reviews are not an acceptance oracle. Each row needs current source, status, task, verification, and reason if rejected/deferred. A code-presence claim is not a passing test.

## Command playbook

Commands below are known repository commands, not promises that they were all run here.

1. Capture `git status --short`, `git rev-parse HEAD`, Node/npm versions. Do not reset, clean, stash or overwrite another agent's files.
2. Try `ssh -o BatchMode=yes -o ConnectTimeout=8 k5 exit`. If authorized remote workspace is available, verify matching revision/dirty diff, Node and lockfile before running there. Never imply local results came from k5. Authentication refusal blocks remote work only; local checks are an explicitly labelled fallback.
3. Use `npm ci` only when dependency installation is necessary and safe for the current work. Do not regenerate lockfile casually. Use `npx expo install <package>` for Expo/native dependencies, not generic npm add.
4. Run `npm run lint`, then `npm run typecheck`; latter covers both app and server. Run shell commands separately so a later success cannot hide an earlier failure.
5. Focused main-suite example: `npm run test -- --filter=route`. Persistence example: `npm run test:persistence -- --filter=payments`. Confirm the filter selected intended files; a short substring can select more than one.
6. Persistence runner uses isolated PostgreSQL support. Read `scripts/local-postgres.mjs`, `tests/support/pg-test-server.mjs` and `docs/implementation/local-database.md` before setting `WIND_TEST_DATABASE_URL`. Never point tests at production or turn off SSL guards to make staging work.
7. Full code checkpoint: `npm test`, `npm run test:persistence`, `npm run test:contracts`, `npx expo-doctor`, sequentially. Verify new tests are registered; .mjs test files are JavaScript, not TS.
8. `npm run test:scenarios` builds the web export in `.expo/location-review-web` with the correct localhost API. Then run `npm run test:location`, `npm run test:access`, `npm run test:jobs-ui`, `npm run test:readiness` sequentially after confirming each script's prerequisites. Shared port 4188 and export directory cannot be used by two runs at once.
9. Diagnostic browser fixtures do not replace mobile acceptance. For physical Chrome, inspect `scripts/check-android-browser.mjs` before using `npm run test:android-browser`; manage only test-owned tab/forward mappings.
10. Native sandbox: read `scripts/start-phone-tests.ps1`, `scripts/build-phone-tests.ps1`, `scripts/phone-test-server.mjs`; API binds loopback port 4191. Use explicit serial and `adb reverse tcp:4191 tcp:4191`; browser scenario backend uses 4188. Never expose synthetic test credentials to a public API.
11. Device check: `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l`. If A53 is absent/unauthorized, stop device acceptance and request attachment/access. Continue independent planning/unit work. Never launch emulator/simulator or clear phone Chrome profile.
12. Platform export syntax: `npx expo export --platform android --output-dir .expo/verify-android`, likewise ios/web with separate directories. Use intended API env; never reuse a cached bundle from a different origin. JS export proves bundling only, not native compilation.
13. EAS `npx eas-cli@latest build --profile preview --platform android` is an outward build request and belongs after required approval. Production version numbers are remotely managed. Inspect archive, signing, environment, SHA and installation; no source edits under generated native directories.
14. Load testing `npm run test:load` runs alone against disposable fixtures; not on production VM. Compare same host/fixture/parameters. Full checks need not be repeated after documentation-only edits unless new concerns justify it.

## Physical acceptance matrix

Copy into T49's device matrix and record artifact hash and evidence per case:

- D01 fresh install and update install, launch, splash and correct API origin.
- D02 Arabic/English, RTL, large font, TalkBack, keyboard/safe areas.
- D03 customer registration/sign-in/recovery/logout and session revocation.
- D04 driver registration/approval/block/unblock with custody preserved.
- D05 pickup GPS grant/deny/timeout/stale cache; manual pickup/dropoff; service boundary.
- D06 both selected map modes: actual tiles, marker/heading/accuracy, pin gestures, retry, attribution.
- D07 quote/promo/schedule, expiry, changed destination, uncertain booking replay.
- D08 driver eligibility/jobs pagination/offer accept/release, concurrent acceptance.
- D09 pickup/proof failure/lock/support recovery and completed delivery.
- D10 background/locked-screen tracking, battery restrictions, reconnect/relaunch, stop after final job.
- D11 multi-parcel runs, return/on-hold, shared-run ETA suppression.
- D12 recipient link open/revoke/expire; stale clock/network; no residual private marker.
- D13 notification foreground/background/cold start, revoked order, account switch.
- D14 receipts/rating/chat/support/dispute and cash remittance/approval; synthetic funds only.
- D15 offline transitions, provider 403/429/timeout, version compatibility and rollback presentation.

Single physical phone can exercise role apps sequentially and concurrency at API level. It cannot alone establish two simultaneous physical-device field positions; label that limit and obtain another physical device for a multi-device pilot if required. iPhone acceptance remains a separate physical-device gate.

## Access and outward-action register

No access is required to write this plan or implement fixture-backed adapters. The agent should prepare code/config/tests first and request only what's necessary for the next blocked step.

| Needed input | Blocks | Independent work still possible |
|---|---|---|
| Authorized k5 account/key | Remote test/GPU execution | Explicit local fallback checks and docs |
| Google project/billing/restricted keys and budget | Live Google routes/native/web activation | Fake proxy tests, renderer contracts, baseline maps |
| Local operating-area/checkpoint confirmation | Service/field acceptance | Boundary regression and corpus preparation |
| Approved identity/phone/email accounts and sending domain | Real proof delivery/recovery | Adapter tests and capability UI |
| EAS/FCM/APNs/signing, physical iPhone, Play service account as applicable | Platform-specific delivery/store gates | Android/source validation and distribution preparation |
| Real monitored support, enabled service scope, money approval policy | Public operating readiness | Fail-closed proposed configuration |
| Authorized legacy Railway export if data matters | Legacy-data completeness | Current Azure staging/fixture import |
| Explicit deployment/commit/push/store/payment/live-message approval | Relevant outward action only | Complete reviewable candidate, diff and tests first |

If a secret is needed, request it using the secure secret tool rather than asking for plaintext in chat. Never put credentials into tasks files.

## Definition of done and failure handling

A task completes when all its criteria, relevant failure paths and common gates have recorded evidence. No test may use live customer data or weaken authentication/idempotency to make fixtures easier. Fixtures must assert externally observable behavior; money/concurrency/privacy changes deserve adversarial tests, whereas low-impact copy edits need no mirrored tests.

Every evidence entry: task ID; revision plus dirty diff identity; source finding; implementation; exact command; exit; execution host; fixture/staging/native/field tier; artifact paths; limitations; next step. Report fixes as issue → change → verification.

Keep parent open for missing device/provider evidence. Do not call a release “ready” from health endpoints, exports or historical suite counts. If an external gate blocks one branch, continue unrelated tasks instead of repeatedly requesting the same approval.

Before release: reconcile required issue register, all relevant platform criteria, money/custody totals, restore/rollback, provider delivery and monitored support. Then show the concrete image/binary/config/diff and ask final approval for the outward step. Do not automatically publish because a checklist is green.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Old review contradicts newer code | T01 source/commit/evidence register; preserve history |
| Shared checkout changes during work | Status/diff before each task; no reset or unrelated edits |
| Google call amplification or data mixing | Separate provider provenance, fake-call budget tests, restricted keys, kill switch |
| Regional routes cross operationally impossible roads | Representative corpus, checkpoint policy and supervised local field validation |
| Unknown refund outcome or ledger drift | Reservation/reconciliation, atomic journals, stable business references, independent totals |
| PostgreSQL gate opened before parity | Keep gated until full import/cutover/restore and feature acceptance |
| UI passes web but fails native background | Exact-binary A53 tests, real lock-screen behavior and separate iPhone gate |
| “All enhancements” becomes endless rewrite | Required release path versus explicit expansion specifications and child tasks |
| Backup depends on original workstation | Independent key recovery, unattended alerts, restore rehearsal |
| Concurrent suites create misleading failures | Sequential shared-port/DB/load gates and preserved logs |

## Primary references checked for this plan

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and [Expo documentation index](https://docs.expo.dev/llms.txt): use versioned pages before API changes.
- [SDK 57 react-native-maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/): recommends 1.27.2 and documents native key configuration.
- [Google Routes policies](https://developers.google.com/maps/documentation/routes/policies): map presentation, attribution and caching restrictions.
- [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies): content presentation, storage restrictions and place-ID exception.
- [Google Routes coverage](https://developers.google.com/maps/documentation/routes/coverage): provider reference, not proof of specific West Bank route feasibility.

Re-read current provider terms/security/pricing and exact SDK APIs when implementing; do not copy unverified snippets or cost estimates from earlier research.

---

# Preserved original plan


# Current review — 21 October 2026

Exercise the customer, driver, recipient and administrator stories on an isolated
local API; fix reproduced failures; validate maps on desktop and the connected
Android browser; run unit/API tests, lint, typecheck, Expo Doctor and native exports.
Results and remaining release checks: [QA report](../docs/QA-2026-10-21.md).

# Historical plan: courier-run-eta (SPEC-courier-run-eta.md, loop 19)

1. Server: orders carry sharedRun (driver has other active orders); /track eta returns no minutes/approach on a run.
2. Client: useRoad skips the driver leg on a run; order page and public page show the run line (en+ar).
3. Tests in tests/parcels.test.mjs, mutation-checked; tsc, lint, npm test, screens.
4. Phone check (web app in the A53's Chrome against the local demo server), ship.
