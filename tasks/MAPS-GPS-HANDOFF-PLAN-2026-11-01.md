# Maps, GPS and journey contracts — implementation plan

> **Status (1 Nov, evening):** GPT 6.1 stopped mid-session at S4. Its edits were integrated into branch `claude/uber-reference-enhancement-7dcc6b` (PR #4, commit `0172be5`) with integration fixes. Resume from that branch, not the main checkout's dirty copy. Done there: S1 (harnesses, session purity, lint), S2a/S2b recovery changes as GPT 6.1 left them, S3 (generation-fenced failure memory and explicit exhaustion), S4 wrappers through `MapProviderBoundary`, with the Google route maps reporting to it. Still open: the rest of S4 (Google-web stale marker fade, native retry readiness reset, `public/map.html` initial driver), S5–S15, and the plan's own verification of S2. The phone-checked lost-acknowledgement recovery in PR #4 covers only part of S2a's exit.

Prepared 1 November 2026 by the Astra planning reviewer for the parent implementer (gpt-6.1-sol). **Planning only; implementation remains the parent's work.** This is the planner's only repository edit. Preserve the existing dirty tree, including untracked sources. No commit, push, deployment, production migration, native/configuration change, or delegated work was performed.

Canonical brief: [the owner-confirmed handoff](../docs/HANDOFF-2026-11-01-maps-gps-and-uber-code-for-opus.md), read in full, lines 1–424. Its Part D defines the scope. Also consulted its maps/GPS study, the real-code reference's behavioral interpretation, WP10/WP11, current runtime/recovery work, and the live-map, Android-map, routing-ETA, road-aware-ETA, courier-run-ETA and change-destination specifications. Historical claims in those documents are subordinate to current source and the decisions below. Proprietary Java is reference material, never implementation input to copy.

## 1. Outcome and boundaries

Deliver reliable map fallback and recovery; remove the misleading unused camera abstraction; repair the known gates and the handover failure; then add compatible offer, boarding, ETA, waiting and fare-change contracts that the actual screens consume. Keep the work in the current application and API. Each slice has a bounded exit criterion; complete and verify it before proceeding to its dependents.

In scope:

- Renderer failure reporting, exhausted-provider behavior, explicit retry, cleanup, pin readiness and provenance-safe route invalidation.
- Camera behavior on the shipped adapters, with an explicit simplification decision rather than a test-only abstraction.
- The two stale harnesses, three lint diagnostics, rejected-command recovery, and completion of the scenario journey.
- Opt-in journey metadata and per-verb offer failures; boarding policy/reason and controlled rotation; honest ETA ranges/validity; the existing waiting deadline; a durable accepted-fare-change record.
- Small confirmed parity defects adjacent to these paths: initial Android-page driver state, Google-web stale marker/line behavior, native route framing, and robust gesture/retry behavior.

Non-goals:

- No new renderer, navigation framework, turn-by-turn implementation, offline tile store, cloud service, or microservice split.
- No change to parcel states, capacity rules, dispatch ranking, tariffs, waiting/cancellation charges, payment settlement, or production activation.
- No scheduled/night/risk PIN product, QR/wireless verification, automatic PIN expiry, offer acknowledgement endpoint, or client-authoritative offer expiry.
- No invented route confidence, arrival percentage, stop sequence, cancellation accounting taxonomy, or inferred physical/provider acceptance.
- No dependency upgrade, native rebuild configuration, hand editing of generated platform directories, or general rewrite of `server/main.ts`.

## 2. Evidence from the current tree

Anchors below are to the inspected dirty tree, not HEAD; line numbers will move during implementation. Untracked modules such as `map-failures`, `map-viewport`, `runtime-config`, `driver-command`, `driver-recovery`, `wire-contracts`, `ride-flow`, `runtime-sources` and their tests were included.

| Finding | Current evidence and implication |
| --- | --- |
| Failure memory is unwired | `src/map-failures.ts:6` has no production caller. `src/map-mode.ts:38` subscribes to changes; `src/map-provider.ts:73` reads failures. Renderer failure paths still only update component state. |
| Recording failures alone is insufficient | `src/map-provider.ts:66–77` returns `null` from resolution when exhausted, then `selectRenderer()` substitutes baseline. Route and pin wrappers (`src/route-map.tsx:153,329`, `.android.tsx:68,103`, `.native.tsx:21,143`) use that substitution. Public maps bypass resolution with literal baseline selection. Exhaustion must become an explicit diagram/unavailable state. |
| Provider switch can leave stale approach data | `src/road.tsx:37–76` filters fetched routes but retains a separate prior route; its `provider` can come from the OSRM trip route even when the approach is Google. `src/app/book.tsx:131–144` independently selects the renderer. Use the same effective decision for consumers and adapters; validate retained geometry as well as fresh responses. |
| Camera abstraction is unused | `src/map-viewport.ts:1–16` is imported only by `tests/map-policy.test.mjs:5`. Actual follow behavior is at `src/route-map.tsx:150,246,289`, `public/map.html:38,195,267`, `src/route-map.native.tsx:19,32–56`, `src/google-map.web.tsx:39,108–116`, and `src/google-map.native.tsx:17,22–43`. |
| Some handoff camera claims are stale | Apple pin reporting already uses `onRegionChangeComplete` (`src/route-map.native.tsx:171`), not every region change. Do not implement that fix again. Native route bounds still omit road geometry; Google web stops follow on drag but does not establish equivalent user-zoom handling (`src/google-map.web.tsx:74`). |
| Renderer lifecycle details still matter | Web MapLibre permits late readiness to clear failure (`src/route-map.tsx:87–97`); Android's `onFail` ref is captured only initially (`src/route-map.android.tsx:29`); native retry does not consistently reset readiness (`src/google-map.native.tsx:45–68`). A centralized failure policy needs attempt fencing, not just added callbacks. |
| Android initial driver is missing from page state | `public/map.html:95` uses `config.driver` for initial bounds, but `:120` initializes `state.driver` to null. The normal injected update masks this. Seed the same bounded initial state used for subsequent updates. |
| Google web stale rendering differs | `src/google-map.web.tsx:159` hides a stale marker rather than fading it; `drawLines()` (`:118–124`) can redraw approach geometry separately from the stale branch at `:167`. Keep last-known styling and suppress stale approach consistently. |
| Harness failures are current | `tests/google-map-lifecycle.test.mjs:54–64` lacks `runtime-config`/`map-failures` stubs now imported by map mode. `tests/deployment.test.mjs:37–52` expects individual Docker COPY lines, while `Dockerfile:19–29` uses `scripts/runtime-sources.mjs:6–30` to copy the dependency closure. |
| Lint diagnostics are current | `src/session.tsx:49` calls `Date.now()` during render; `src/api.ts:2` imports unused `Platform`; `src/use-driver-recovery.ts:32–36` lists dependencies that represent intended invalidation but are not read in the callback. Fix the lifecycle, not merely the warning. |
| Handover has a specific recovery failure | SQLite recovery revision is `COUNT(order_actions)+1` (`server/main.ts:1632–1636`). Rejected actions are stored (`:2259–2263`). The immediate error path unlocks the input without obtaining fresh recovery metadata (`src/app/order/[id].tsx:120–131,165–171`). Current `tests/driver-recovery-api.test.mjs` does not exercise wrong-code → corrected-code against a fresh revision. |
| Mutation replies lose recovery metadata | The GET path opts into recovery at `server/main.ts:1638–1642`; `driverCommand()` returns a plain order at `:2266`. `src/app/order/[id].tsx:130` replaces the decorated snapshot with it. A subsequent quick action can temporarily use the legacy branch. Keep the opted-in command path stable. |
| Offers already have absolute and issue timestamps | `server/domain/dispatch.ts:63–78` serializes `issuedAt`, `expiresAt`, ETA scalar and `etaEstimated`. `:184` caps each lease at the round deadline. Only relative-window/display semantics and typed failure projection are missing; no new lease table is needed. |
| Offer verbs differ from the reference | Actual public verbs are accept and decline (`server/domain/dispatch.ts:203,262,366`); expiry is worker-owned (`:317–361`). Decline deliberately masks another driver's offer as 404. Do not copy the reference's different authorization/error rules. |
| Boarding already protects the PIN | Customer-only current-assignment disclosure is implemented (`server/domain/ride-lifecycle.ts:91–106`). Arrival, separate attempts, five-miss lockout, release reset and guards already exist. `ensureAssignment()` can reset the same epoch (`:61–66`); reset clears attempts but does not rotate (`:182–193`); issue/verification metadata is absent. |
| Waiting end is already server-derived | `server/domain/ride-lifecycle.ts:103` returns `graceUntil = arrivedAt + RIDE_GRACE_MS`; `src/app/order/[id].tsx:476–478` displays it. This is a contract normalization and clock-hardening task, not a new timer subsystem. |
| ETA domains are already different | Dispatch has `{seconds, estimated}` (`server/domain/dispatch.ts:9,38`, `server/main.ts:509–516`). Quotes persist an ETA band and expiry (`server/domain/quotes.ts:188–274`). Route cache has no calculation timestamp/TTL (`server/main.ts:2467–2571`). UI range is heuristic (`src/map-math.ts:98`, `src/road.tsx:76`). Do not overwrite quote feasibility or dispatch ranking with display metadata. |
| Public ETA freshness claim needs correction | Server cutoff is 120 seconds (`server/main.ts:2599`); the current public UI suppresses an estimate based on a fix older than 30 seconds (`src/app/track/[token].tsx:45–52`). The handoff attributes the latter to the server. Preserve installed responses; enforce the stricter validity in the new opt-in ETA projection and consuming UI. |
| Fare-change workflow already exists on both backends | `server/domain/destination-change.ts:61–65` checks table availability, not backend identity. Migration 26 supplies PG storage (`server/db/postgres-destinations.sql:1–17`). Acceptance updates the order and writes `DESTINATION_ACCEPTED` with old/new fare and discount (`server/domain/destination-change.ts:134–162`). The older SPEC's SQLite-only statement is superseded by current code. Do not remove PG parity or expand this into payment settlement. |
| Event machinery exists; it is not a new streaming project | `server/domain/events.ts:7–37`, `server/db/postgres-events.sql:24–40`, and `server/main.ts:3016–3026` implement PG journal/outbox/cursor/snapshot behavior. `realtime.ts` primarily handles credentials/transport. Reuse the journal and snapshots. SQLite deliberately has no durable protocol. |
| Money has a compatibility boundary | Installed order fields are legacy amounts; PG guards derive checked `*_minor` fields (`server/db/postgres-guards.sql:28–52`). Cash totals use safe integers (`server/domain/money.ts`). New fare event amounts must be integer minor units without changing existing wire amounts or SQLite storage. |

### Baseline actually executed by this planner

All execution below was **on k5**, hostname `DESKTOP-NE681OS`, not locally. Snapshot: `C:\wq-maps-plan-20261101-170306`. It contains 711 tracked/untracked input files, excluding unrelated research/report archives, credentials, installed packages and build outputs. No checkout of HEAD replaced dirty sources. `planner-source-manifest.json` records source hashes; rechecking all copied inputs after execution found no changes.

- Lock SHA-256: `7f60c423c99e450786eedd63847c8b553247225df4eaabe3ef1b39e5df1f2713`, equal locally and in the dependency-source snapshot.
- Dependencies reused through a junction to `C:\wq-audit-deps-20261101\node_modules`; no install or dependency mutation. Verified installed Expo 57.0.31 / React 19.2.3 / RN 0.86.3; Node v24.12.0 at `C:\wq-k5\nodejs\node.exe`.
- `expo lint`: **FAIL**, exactly one purity error and two warnings listed above.
- Client and server `tsc --noEmit`: **PASS**.
- `google-map-lifecycle.test.mjs`: **FAIL**, missing `./runtime-config` in VM harness.
- `deployment.test.mjs`: **FAIL**, obsolete `COPY src/model.ts` assertion.
- `driver-command.test.mjs`, `driver-recovery-api.test.mjs`: **PASS**. They do not prove the corrected handover sequence.
- A read-only-to-source HTTP reproduction on a throwaway SQLite DB confirmed: wrong PIN → `wrong_code`; corrected PIN with old revision → `order_changed`; refresh → corrected PIN succeeds and status becomes `completed`. Old revision 3, refreshed revision 5, **one** proof failure. This establishes the stale-revision cause without changing application code.

Logs: snapshot-local `planner-baseline-results.json`, `<check>.stdout.log`, `<check>.stderr.log`, and `planner-handover-repro.log`. These are baseline evidence, not successful implementation evidence. The earlier `.expo/scenarios/results.json` and `failure-6.txt` are historical UI evidence: wrong-code 400 followed by 409 and the “Order status changed” alert. Their screenshot directory also contains older successes; file existence is not a current pass.

Local hardware inventory, using the installed SDK's adb executable, reported physical Android `R5CTB0FJP9Z`, model `SM_A5360`, attached. No app was driven, no phone state was cleared, and no physical UI, iOS, paid Google, drive trace, PG race suite, full-suite sweep or fresh browser E2E was performed by the planner. The parent's SDK57 documentation verification is supplied context; package versions were independently checked here.

## 3. Architecture and authority decisions

### 3.1 Preserve the existing authorities

| Domain | Source of truth | Client responsibility / forbidden inference |
| --- | --- | --- |
| Renderer | Shipped capability ∩ current configured policy ∩ user preference ∩ attempt-scoped failure memory | Render selected adapter or unavailable UI. Runtime configuration cannot manufacture Google capability. Public scope is baseline-only. |
| Geometry | Route response provenance and exact request context | Check before every overlay and retained-route reuse. Google data never reaches Apple/MapLibre. Unknown provenance fails closed under the existing legacy-null convention. |
| Order/custody | Current authorized server order; PG version/epoch; existing SQLite recovery revision | Never optimistically advance custody, infer completion from elapsed time, or replace the parcel state machine. |
| Command outcome | Existing durable command/receipt identity and fresh authorization | Receipt lookup precedes replay; failed proof counts once. New user input after a definite rejection needs a fresh snapshot and a new identity. Unknown delivery keeps the old identity and exact payload. |
| Offer deadline | Stored offer issue/expiry and round deadline, checked under locks using server time | Countdown is advisory. Never queue acceptance offline or turn an expired offer into legacy accept. Presence, assignment, eligibility and vehicle fences still decide acceptance. |
| Boarding | Current-assignment lifecycle row plus separate boarding-attempt counter | Customer alone may receive a displayable PIN. Driver submits the passenger's code; admin can reset/rotate but never reads it. Policy presentation cannot enable boarding. |
| ETA | Domain-specific server calculation/quote/offer snapshot and its timestamp | Display only while its provider, assignment, target, stage and fix remain valid. Accuracy is estimate quality, not GPS accuracy or routing feasibility. |
| Waiting | Recorded arrival and the existing fixed grace interval | `waitingEndsAt` is an alias/projection, not another mutable deadline. Safety hold blocks actions but does not imply a paused clock or charges. |
| Fare change | Accepted destination transaction and its immutable change record; current order remains current fare | No client repricing, payment inference, delta journal in `cash_entries`, or fare mutation from a display event. |
| Public tracking | Current validated share link and its existing allowlist | City-level stops only; no exact pickup/dropoff, contacts, PINs, fare history, nonce, private reasons, or paid calls. Reauthorize after awaited routing work. |

Session/logout/revocation/assignment fences, encrypted bounded recovery storage, no offline GPS replay, presence-versus-active-job exclusivity, minor-unit safety, no-show/custody rules, and production gates are invariants. Preserve the 30/60/120-second freshness vocabulary. Do not replace those thresholds with ETA validity.

### 3.2 Map policy: one effective decision, finite attempts

- Expose a small shared hook/adapter around the existing `effectiveMapProvider()` and subscriptions. Return the policy key, renderer **including null**, attempt generation and explicit retry action. `selectRenderer()` must no longer hide exhaustion in production consumers.
- Preserve the current bounded, in-memory failure store; do not persist failure state or put coordinates/order IDs in its keys. Include public/private scope and configuration/preference identity. Fence reports by the currently mounted attempt so a late callback from a retired renderer cannot poison a retry or new policy.
- Each terminal failure reports its selected renderer once, then selects the next eligible configured provider once. Exhaustion stays terminal until explicit retry or one bounded existing online/foreground recovery. Successful fallback does not silently clear the failed primary or oscillate back.
- Retry clears only that policy scope and creates a new attempt. All adapter readiness/timer/gesture state resets; failed instances, overlays, animation frames, listeners and deadlines are disposed. No callback from the old attempt may announce readiness or update a pin.
- Public maps must use the same exhaustion machinery with the baseline-only policy. No Google script load, native Google mount or paid route may occur in that scope, including when all baseline attempts fail.
- Renderer failure and route-provider error are distinct. An unavailable route does not automatically condemn a usable tile renderer. While no renderer is available, route fetching must not make paid requests; explanatory route/ETA text may retain only independently valid safe data.
- Pin readiness is attempt-specific: unready/failure/provider change disables confirmation immediately, fallback becomes confirmable only after its own readiness. Preserve a user-chosen center without accepting a center from a dead attempt.

### 3.3 Camera decision: justified simplification

**Delete `src/map-viewport.ts` and its test-only assertions.** No production caller supplies its proposed occlusion model, and native region spans are not a reliable conversion of web zoom 15. Wiring an unused insets system into five adapters and a standalone HTML page would add unrequested product behavior.

Retain the actually shared `routeFramePoints`, fitting and marker math. Test the real adapters/page for this small common behavior contract:

1. Before a driver exists, fit the selected stops plus licensed road geometry; after a driver exists, follow the displayed driver at the adapter's documented street-level scale.
2. A real user map gesture stops automatic camera movement until recenter; programmatic fitting/animation does not. Recenter causes one camera operation. A conservative user-touch boundary is acceptable on Apple when distinguishing pinch from programmatic region changes is unreliable; document it and test its event sequencing rather than guessing a zoom delta.
3. Keep web/Android zoom/offset equivalence (15, `[0,-60]`) and native region span 0.012 as explicit platform choices. Test current constants/behavior, not invented pixel-identical views. Respect reduced motion on recenter as well as normal following.
4. Preserve pin reporting on movement completion and latest center after delayed SDK load/retry. Native fitting must include `routeFramePoints` instead of only stop extrema.

This removes dead policy while fixing concrete drift. Do not replace it with another exported helper that is exercised only by its own tests. If the parent instead chooses shared intent, it must demonstrate real use by web, HTML/WebView and native adapters in this task; partial integration is not completion.

### 3.4 Additive wire design

Use **one presentation opt-in, `journeyProtocol=1` in the query**, on the relevant reads/mutations. Keep it separate from existing `protocol=1` (durable event snapshots), `recoveryProtocol=1` and `capacityProtocol=1`. Query negotiation must not be mixed into command payload hashes or confer authority.

- Opted-in order responses gain optional `journey: { schemaVersion: 1, serverTime, ... }`. Within it expose only supported `offer`, `boarding`, `waiting` and `lastFareChange` sections. Unavailable domains are omitted; absent journey means installed/older server behavior, not permission to invent a capability. Unknown query versions get no extension.
- Decorate only authorized projections. Propagate the opt-in consistently through job pages/arrays, order detail, relevant mutation responses and recovery refreshes. Avoid changing `toOrder()` globally for unopted callers. Reuse a bounded domain projector rather than copying serializer logic in screens.
- Keep existing `dispatch`, `ride`, `price`, `graceUntil`, error strings/statuses and receipt formats unchanged for unopted requests. For opted-in responses, new fields derive from those same authorities; no second stored deadline, fare or boarding flag.
- Decorate mutation results **after** existing command/receipt storage, from current authorized data. Do not persist new PIN-bearing presentation objects in `command_results`, `order_actions`, logs, diagnostics, offline summaries or push payloads. Replay must not disclose a former assignment's private snapshot.
- Extend `src/wire-contracts.ts` with bounded validation for extensions, nested jobs pages, partial arrival/decline envelopes and error metadata. Missing optional fields stay compatible; malformed present authority/deadline/PIN metadata must disable the dependent action, not silently take a legacy route. No unsafe integers, inverted ranges, impossible timestamps, or unbounded strings/arrays.
- `ApiError` keeps its existing `message` and `status`; add an optional validated offer-failure member. Unknown metadata falls back to existing conservative error handling.
- Advertise support via the existing runtime capability endpoint using actual migration/feature availability. Schema/configured status is not operational readiness. Do not add a global capability that implies all backends support all sections.

### 3.5 Offer contract and semantics

Project an offered driver's record with existing IDs and absolute instants plus `acceptWindowSeconds = (expiresAt - issuedAt) / 1000`. This is a finite nonnegative duration (fractional seconds are permitted for a round-truncated lease), **not remaining time**; absolute `expiresAt` controls acceptance. Include `serverTime` and, where needed for existing PG command replay, the authorized current order version/assignment epoch. Do not expose another driver's lease or ranking input.

Define typed failures for the actual verbs, retaining all existing HTTP statuses/codes:

| Verb | Categories / client decision |
| --- | --- |
| Accept | Invalid input → correct/review; unavailable/closed/expired/version/session/eligibility/capacity conflict → discard stale card and refresh; masked not-found/forbidden → stop; authentication → sign in; rate limit/server/network ambiguity → reconcile current order and any supported existing command receipt before retry. |
| Decline (the application's reject verb) | Invalid input, authentication, masked not-found, unavailable/closed and transient/rate-limit categories. A repeat decline keeps its existing idempotent outcome. Preserve 404 privacy; do not imitate Uber's omission of that error. |
| Expiry | Internal worker result only: expired / already terminal / revoked due to changed order. Existing order-first locking and server deadline remain authoritative. No public expire request. |
| Acknowledgement | No existing product action or delivery guarantee; do not add an endpoint or claim an acknowledgement happened. Revisit only with defined semantics. |

Opted-in HTTP failures can carry `offerFailure: { schemaVersion: 1, verb, code, category, recovery }` alongside the unchanged `error`. Keep this mapping at the HTTP boundary so authentication/rate-limit failures are classified too; never expose raw SQL/provider errors. Accept and decline have separate allowed codes/recovery decisions, not one catch-all “retry”.

Use the existing server clock helper as the compatibility fallback. For new timestamped envelopes, anchor a countdown to received `serverTime` plus monotonic elapsed time; resynchronize on focus/reconnect and reject out-of-context samples. Never reset a countdown to `acceptWindowSeconds` after remount, and never extend a lease due to a phone-clock jump. Server validation wins at `now >= expiresAt`. Sample time after lock waits before final lease validation; a request arriving before expiry is not entitled to commit after expiry.

Do not add a durable offline accept queue. If using the existing PG `commandId` replay facility, preserve a single in-flight identity with `expectedVersion` and the exact offer/nonce; do not send that protocol to SQLite. Lost-response reconciliation must first determine whether assignment already succeeded.

### 3.6 PIN policy, disclosure and rotation

Conservative supported policy: `all_trips` **within the existing boarding cohort**, reason `provider_setting`; `not_required` outside a required challenge. Reserve `unknown` for unrecognized metadata. Do not interpret “all trips” as all services or activation outside the current gate. Night/time-zone and risk-policy meanings are undefined, so they are not enabled.

Proposed boarding projection: policy, reason, required/locked, `shouldShow`, `isVerified` (boolean or unknown/null for historical evidence), `pinIssuedAt`, `pinRevision`, and `pin` only when authorized and displayable. `shouldShow` requires the customer owner, current driver/epoch, pre-boarding status, a required code and an unlocked, unverified challenge. Driver/admin projections contain no PIN. Existing legacy `ride.boardingCode` redaction remains intact; new UI must obey the new projection when present.

Rotation is **assignment change or an explicit audited admin rotate-and-reset**, not a timer. Add optional `rotate: true`, `expectedAssignmentEpoch`, `expectedPinRevision` to the existing reset action only for the negotiated new contract. Preserve the legacy reason-only reset's behavior. New admin UI requests rotation; an older server/capability cannot silently downgrade that intent to a reset. Require the current pre-boarding assignment; prevent stale/terminal/verified rotation. Generate a different code, update issue time/revision and reset only boarding attempts in one transaction. Record a reason and revision, never the code.

- Make `ensureAssignment()` idempotent for the same assignment so reconnect/replay cannot silently rotate or clear failures. A genuinely new epoch clears old arrival/challenge evidence as today.
- Persist successful verification only with the successful authoritative start transition, in its transaction. Do not mark verified in a guard before later checks can fail and a refusal receipt can commit.
- New clients bind boarding submissions to the PIN revision as well as current assignment/version, including in protected pending commands. Reject a stale revision before counting it as a wrong PIN. Preserve legacy callers' current code checks.
- `pinIssuedAt` is informational; there is no automatic validity interval. The reference supplies no safe rotation cadence or grace policy. Never synthesize `pinRotatesAt`, auto-reset lockout, or impose arrival-proximity display semantics without a product decision.

### 3.7 ETA, waiting and fare contracts

**ETA:** add a versioned seconds-based object with `rawSeconds`, `minSeconds`, `maxSeconds`, `accuracy`, `basis`, and validity `{issuedAt, expiresAt, expiresInSeconds}` plus server time. Values are finite nonnegative safe seconds; raw may be null when the existing source provides only a band. A present raw value lies within the band. No conversion may reinterpret minutes as seconds.

- Preserve the existing quote's persisted range/expiry. Dispatch derives from the immutable stored scalar/estimated flag and offer issue/expiry; ranking still uses its scalar. Live routes derive a conservative heuristic band consistent with the current `etaRange` policy, documenting rounding once on the server. Keep old `minutes`/`seconds` unchanged.
- `accuracy: unknown` for uncalibrated road/quote estimates, `low` for the expressly marked straight-line dispatch fallback. Do not label OSRM/Google “high” because a request succeeded. `basis` distinguishes a heuristic estimate from a persisted quote band; routing feasibility is separate.
- Stamp calculation time when the result is computed, including on the OSRM cache entry. Do not renew `issuedAt`/expiry by serializing the same cached calculation. A bounded live ETA validity of 30 seconds is a display freshness default aligned with the current fix policy, not a prediction-confidence claim. Offer validity cannot exceed its lease; quote validity cannot exceed its stored expiry.
- Recompute expired free-route ETA only through a bounded foreground request path. Paid Google display data expires without triggering a new bill: only existing authorized preview/destination/movement/retry triggers may request again. No Google persistence/cache is introduced.
- A live ETA is valid only while both calculation and starting fix are valid, with matching order/assignment/stage/target/provider. Shared runs retain no direct-to-this-stop estimate or approach. Delayed checkpoint copy remains `N+`, never a confident upper bound.
- Public opt-in ETA enforces the 30-second starting-fix validity and rechecks authority, driver, status, cities and shared-run state after routing awaits. Preserve the public allowlist and old unopted shape. The existing 120-second marker retention remains a different rule.
- Do not impose new route validity on the legal lifetime of static trip geometry; stale approach and minute claims disappear, while permitted static trip geometry may remain.

**Waiting:** `journey.waiting = { waitingEndsAt, state }` derives from existing `graceUntil` and the same request's server time. Null before arrival; waiting/elapsed only while pre-boarding. A safety hold is exposed separately as blocked actions, not a claim that the timer paused. Client may fall back to legacy `graceUntil`. End of grace causes no fee, cancellation, departure or boarding authorization. No additional column or worker is required.

**Fare change:** limit the event to the existing accepted destination change, reason `destination_changed`. Include stable `changeId` (proposal UUID), occurredAt, currency ILS, before/after gross/discount/due amounts in minor units, and safe localized UI copy/key. The gross fare is not the amount due; show discounts explicitly. A destination change whose gross and due amounts do not change does not need a monetary fare-change event.

- Current order money remains authoritative; derive PG event values from checked minor columns before/after the accepted update. For SQLite use the established nonnegative safe rounding rule at this boundary, including zero discount. Do not change legacy numeric wire fields, tariff calculations or cash ledgers.
- Use existing `security_events` as the durable accepted-change record on both backends: retain its existing detail fields and add a bounded versioned `fareChange` document. Query a validated projection, not arbitrary audit detail. No parsing of the positional `destination_changes.original` string to reconstruct money.
- On PG, append a `fare.changed` domain event with the same stable `changeId` inside the transaction, using the existing journal/outbox. The accepted proposal transition under the order lock is the dedupe boundary: repeated decisions cannot append a second event. The existing HTTP envelope already locks the order (`server/main.ts:3090–3095`); preserve that order and make helper-level transaction/locking assumptions explicit rather than adding an incompatible lock order.
- Keep new fare events out of unopted installed snapshot envelopes. With durable `protocol=1`, negotiate the new event family with `journeyProtocol=1`; when filtering it for old consumers, advance the cursor over scanned raw events and correctly handle an all-filtered page. Never change existing event payload shapes. Add explicit compatibility tests rather than rewriting fixtures.
- `journey.lastFareChange` is the bounded current authorized projection so both SQLite and PG clients can show it without a new streaming transport. PG event feed is an additional delivery path; deduplicate display by `changeId`, refetch the current order, and never apply events as financial deltas.
- No event on quote, proposal, decline, withdrawal, expiry, failed safety/assignment checks, or rolled-back acceptance. No public fare event and no proof/address/contact detail in journal/push. Push continues to carry only its existing safe nudge.

## 4. Compatibility and migration strategy

1. **Do not rewrite applied migrations.** Highest registered PG migration in this tree is 28 (`server/db/postgres-schema.ts:116–118`). Recheck before implementation; use the next unused version (29 if still free) for boarding metadata only.
2. Add nullable `pin_issued_at` / `pin_verified_at` and a bounded nonnegative `pin_revision` with a backward-compatible default to `ride_lifecycle`. Existing rows keep their current code, attempts and arrival; historical issuance/verification times remain unknown. Do not backfill from `updated_at` (arrival updates it) or invent a past rotation. New issuance writes metadata. Same-epoch idempotence preserves it.
3. Detect metadata capability separately from migration-14 lifecycle support. On SQLite, no lifecycle rows are created; on PG with only migration 14, legacy lifecycle still works and new metadata/rotation is unavailable. Do not unconditionally SELECT missing columns. Update runtime migration/capability detection accordingly.
4. Derived offer window, ETA envelope, waiting projection and fare event use existing storage; **no extra migration** for them. Route calculation timestamp is process-local cache metadata. The typed fare record lives in existing audit JSON; PG journal/outbox already exists. Do not manufacture historical fare events; omit legacy records that cannot be validated faithfully.
5. No SQLite schema/user_version change. Existing production SQLite can remain writable as before. No cross-backend cutover, dual writes between databases, or import of new operational policy is authorized. No new table means no new import allowlist entry; nevertheless verify `server/migrate.ts`/PG import behavior against migration 29.
6. Test fresh PG install, upgrade from the previous complete schema, migration rerun, partially migrated fixtures, and current SQLite fixtures. Old clients with no query flag receive their installed payloads and statuses; new clients with old servers fall back without exposing newly gated actions. Never regenerate frozen fixtures to make a changed contract pass.
7. New presentation projection occurs outside receipt hashing/storage and does not change existing command body hashing. Boarding revision is a deliberately new input only on opted-in commands; exact retries reuse it. An old pending command remains readable by the bounded recovery validator.
8. Default `futureDispatchActivated`, `futureBoardingChallengeActivated`, measured eligibility/PG cutover/payment/native push/Google activation switches remain unchanged. Test flags are confined to isolated fixtures. Schema migration capability alone cannot activate services.

## 5. Ordered implementation slices

The parent implements these personally. Dependencies below are explicit. Split a slice into its listed backend/client parts when it spans several adapters; do not hold unrelated fixes for a large final merge. All paths named “new” are proposed, not already implemented.

### S0 — Preserve baseline and reproducible execution (before edits)

- Record dirty status and source hashes; retain all existing modifications/untracked inputs. Make a new k5 snapshot for implementation verification, with a matching lock/vendor/dependency inventory. Do not overwrite the planner snapshot or another worker's checkout.
- Reuse the baseline logs above as diagnosis; do not claim they test later code. Verify a dedicated loopback PostgreSQL fixture is available before PG slices; parent may repair its test setup without production changes.
- **Exit:** source identity, host, Node/dependency versions and log location are known; no tests are silently running against HEAD or stale build outputs.

### S1 — Repair baseline harnesses and session purity (depends S0)

- Files: `tests/google-map-lifecycle.test.mjs`, `tests/deployment.test.mjs`, `src/session.tsx`, `src/api.ts`; consult `scripts/runtime-sources.mjs` and `tests/runtime-dependencies.test.mjs`.
- Stub the new map-mode imports in the VM harness with observable subscriptions/cleanup; retain denied-storage and lifecycle assertions.
- Replace the COPY-string assertion with a behavioral build-closure check: construct the runtime artifact in a throwaway directory, verify transitive shared imports are present, and run its isolated API entrypoint without accidentally resolving the source checkout. Cover a missing transitive dependency as a failure. Keep Docker origin/vendor/production-header/startup tests.
- Start session timing in a mount effect (nullable ref initialized once); record duration once when ready, including Strict Mode/remount behavior. Remove the unused import. No blanket lint suppression.
- **Exit:** both harnesses run their real assertions; session purity error and unused import are gone; failed closure still fails the test. Do not hardcode “six files” as the success condition.

### S2a — Rejected-command regression and fresh recovery state (depends S1)

- Files: `tests/driver-recovery-api.test.mjs`, `tests/driver-command.test.mjs`, `src/driver-command.ts`, `src/driver-recovery.ts`; add PG coverage in the existing persistence suite or a narrowly named registered suite.
- Add the reproduced wrong → correct sequence before changing behavior. Exercise receipt-before-replay after both accepted and rejected commands. Preserve HTTP status from a rejected receipt instead of converting every result to 400.
- Require fresh recovery metadata after a definitive refusal and before creating a new command. Preserve the original pending identity for network/timeout/429/unknown outcomes. Do not “fix” handover by ignoring expectedVersion, changing the SQLite revision formula, or silently retrying corrected input with an old identity.
- **Exit:** one wrong proof increments once; a corrected explicit attempt after reconciliation can complete immediately; duplicate/lost rejection never spends a second proof attempt; an expired or reassigned command never applies.

### S2b — Screen integration and recovery dependency fix (depends S2a)

- Files: `src/app/order/[id].tsx`, `src/use-driver-recovery.ts`, `server/main.ts`, related hook/UI tests.
- Keep the proof field/action in a “refreshing/checking” state after definitive refusal until a fresh authorized snapshot is installed. Keep the useful error message. Let the user correct it afterward with a new command identity. Reconcile successful mutation replies too so absence of recovery metadata cannot switch the next action to legacy behavior.
- Return opt-in recovery metadata after storing the action receipt, or fetch the decorated GET before the next action becomes available. Ensure revision includes the just-recorded refusal/success.
- Refactor the recovery hook so actual captured order/actor/version/authorization data drives focus recovery, rather than deleting intentional dependencies to appease lint. Preserve generation cancellation and latest callbacks; account/order switch during async read/send/refresh cannot install a result.
- **Exit:** lint has no recovery dependency warning; wrong/correct handover completes without waiting for a polling interval; immediate next action stays in recovery protocol; logout/blur/new-order/late-poll races remain fenced.

### S3 — Effective map decision and terminal exhaustion (depends S1)

- Files: `src/map-provider.ts`, `src/map-failures.ts`, `src/map-mode.ts` (or one small hook alongside it), `tests/map-policy.test.mjs`.
- Implement section 3.2's null/exhausted state, bounded attempt-generation invalidation and scoped retry. Keep pure selection separate from React subscription. Validate public versus private scopes and expired runtime config behavior.
- **Exit:** primary → configured fallback → terminal is finite; retries restore exactly one fresh attempt; stale callbacks cannot mark the new attempt failed; no capability escalation or public Google fallback occurs.

### S4a — Web renderer integration (depends S3)

- Files: `src/route-map.tsx`, `src/google-map.web.tsx`, `src/route-preview.tsx` if internal callbacks require types, lifecycle tests.
- Route and pin wrappers mount only the effective renderer; record loader/style/tile-deadline/context failures once. Pass failure/readiness callbacks from the coordinator. Dispose failed attempts and test late readiness. The terminal route view is the labeled diagram + Retry; terminal pin is unavailable + Retry.
- Fix Google's stale marker to fade and make all line redraw paths honor stale state. Ensure explicit retry resets readiness and listeners/DOM/overlays, including delayed SDK completion and callback replacement.
- **Exit:** real wrapper→adapter failure callbacks cause policy transitions; tests do not call only `recordMapFailure()` directly. No dead provider can revive the map or confirm a pin.

### S4b — Android and native renderer integration (depends S3; apply after S4a's callback shape settles)

- Files: `src/route-map.android.tsx`, `src/route-map.native.tsx`, `src/google-map.native.tsx`, `public/map.html`, focused adapter tests.
- Wire WebView error/HTTP/render-process/page-message/deadline paths and native map load/deadline paths to the same coordinator. Refresh callback refs and reset ready state for each attempt. Preserve vector-tile versus style readiness; native Google still waits for `onMapLoaded`.
- Seed validated initial HTML-page driver state; do not send location/config in the URL query (fragment stays device-side). Keep the page restriction/link handling.
- **Exit:** 404 page, no vector tiles, GPU/WebView death and retry are finite and recoverable; initial driver draws without depending on the first injected update; old messages cannot enable a replacement picker.

### S5 — Route consumer/provenance integration (depends S4a/S4b)

- Files: `src/road.tsx`, `src/app/book.tsx`, `src/map-provider.ts`, `tests/map-security.test.mjs`, map/route lifecycle tests.
- Use the effective renderer including exhaustion in booking and tracking. Key kept approaches to assignment, stage/stop and **the approach's actual provider**. Invalidate synchronously on provider change; check provenance on retained data as well as fresh data. Abort/ignore late replies from previous decisions.
- Preserve OSRM fare/feasibility authority, Google movement threshold/budgets and no refocus rebilling. Retry of tiles alone is not authorized paid-route retry.
- **Exit:** injected Google response completing after fallback cannot produce a baseline overlay; exhausted/public maps make zero paid calls; both fresh and cached route states obey provider and assignment changes.

### S6 — Remove dead camera abstraction and test actual behavior (depends S4/S5)

- Delete `src/map-viewport.ts`; replace the associated `tests/map-policy.test.mjs` assertions with adapter/page tests in `tests/map.test.mjs` and lifecycle suites. Make the small real camera fixes from section 3.3 in web/page first, then native/Google adapters.
- Do not modify Apple pin completion reporting as if it were still broken. Include native route geometry in fitting; stop follow on real user gesture and honor recenter/reduced motion. Keep documented platform scales instead of forcing a fabricated zoom conversion.
- **Exit:** no dead camera import/export remains; tests cover gesture followed by a new GPS fix, programmatic fit followed by a fix, one recenter, delayed layout/geometry and no-driver framing. Android physical gestures require S15 evidence; native iOS remains explicitly unverified without hardware.

**Checkpoint A:** S1–S6 green targeted tests, lint and both typechecks on k5. Run the repaired handover scenario through completion/receipt/rebook/schedule/return/legacy ride stages; any remaining failure is diagnosed and fixed before contract expansion. A browser run is functional regression evidence, not physical-device acceptance.

### S7 — Opt-in projector and validated contract boundary (depends Checkpoint A)

- Files: new small shared journey DTO module, `src/model.ts`, `src/wire-contracts.ts`, a small server projector and `server/main.ts`; update `tests/wire-contracts.test.mjs`/contract tests in a following focused change.
- Implement section 3.4 without forcing clients to request unavailable PG durable protocol. Add flags to the precise list/detail/mutation consumers as each subsequent slice becomes usable; do not turn on empty UI features globally.
- **Exit:** bare installed fixtures are unchanged; old server/new client and new server/old client behave safely; partial/malformed/unknown extension tests pass; private projection cannot be serialized into public tracking or command receipts.

### S8a — Offer window and per-verb failures (depends S7)

- Files: `server/domain/dispatch.ts`, boundary/projector in `server/main.ts`, `src/api-client.ts`, shared DTO/validator, `tests/dispatch.mjs` and `tests/dispatch-races.mjs`.
- Derive the relative window from stored times; implement separate accept/decline metadata mapping while preserving existing codes and privacy. Audit final time checks after locks, round-deadline truncation, replay-before-expiry and competing accept/expire/cancel/decline outcomes.
- **Exit:** exact expiry refuses new acceptance; previously committed identical command can reconcile under current authorization; wrong driver has no offer disclosure; no ack/expire endpoint has been invented; SQLite gates and legacy accepts stay unchanged.

### S8b — Offer client and countdown integration (depends S8a)

- Files: `src/ride-flow.ts`, `src/api-clock.ts`/clock helper, `src/app/driver/index.tsx`, `src/app/order/[id].tsx`, copy and narrow client tests.
- Consume the actual optional window/error/clock fields on job cards and detail accept/decline flows. Preserve lease recheck after location permission waits. Do not make a whole relative window reappear after resume; expired cards disable and refresh. Known errors drive specific refresh/sign-in/backoff UI.
- **Exit:** near-expiry/clock-jump/focus/lost-reply cases cannot produce delayed or legacy fallback acceptance; authoritative assignment can be recovered without a second application of the command. Old-server fallback still works.

### S9a — Boarding metadata migration and domain behavior (depends S8; migration number rechecked)

- Files: new PG migration, `server/db/postgres-schema.ts`, `server/domain/ride-lifecycle.ts`, `server/domain/runtime-readiness.ts`, focused migration/lifecycle tests.
- Add only the section 4 boarding metadata. Make same-assignment issuance idempotent. Implement opted-in audited rotate-and-reset, current-epoch/revision fences and atomic successful verification metadata. Keep failure counters separate from parcel proof attempts.
- **Exit:** migration is repeatable and preserves existing rows; old PG fixtures avoid missing-column queries; same-epoch calls do not reset attempts; rotation cannot run after boarding/terminal state or against an old assignment; two API processes cannot both apply an old/new challenge transition.

### S9b — Boarding projection and client integration (depends S9a)

- Files: projector/DTO, `src/ride-flow.ts`, `src/driver-command.ts` and its validator, `src/app/order/[id].tsx`, localized copy; associated recovery/lifecycle tests.
- Render policy reason and code only from authorized `shouldShow`. Show locked/verification state without exposing proof to driver/admin. Carry PIN revision through protected pending commands; reconcile after rotation before accepting another code. Admin UI explicitly chooses the supported rotation operation with reason and current revision.
- **Exit:** no PIN in driver/admin/public/outbox/diagnostic/offline-summary payloads; old code is invalid after rotation; stale queued proof fails safely without consuming the new challenge's attempts; correct code while locked remains refused; legacy noncohort rides remain unchanged.

### S10a — Domain ETA projection and calculation validity (depends S9)

- Files: new pure server ETA projection helper, `server/domain/dispatch.ts`, `server/domain/quotes.ts`, `server/main.ts` route/cache/public projection, `server/domain/google-routing.ts` boundary only if needed.
- Implement section 3.7 per existing source authority. No pricing/ranking/feasibility change. Preserve cached calculation timestamps and keep explicit range basis. Tighten only the negotiated public ETA projection to its fresh-fix validity.
- **Exit:** quote/offer timestamps do not renew on read; cache hit cannot rejuvenate an expired calculation; no upstream or malformed calculation produces a fabricated estimate; public response after route delay rechecks current authority/context/shared-run state.

### S10b — ETA client validity and display (depends S10a)

- Files: `src/road.tsx`, `src/app/track/[token].tsx`, `src/parts.tsx`, wire validators/clock helper, focused route/customer-location/map tests.
- Consume seconds consistently; preserve checkpoint `N+` copy and legacy fallback range. Expire a kept ETA even without a new GPS event, rerender or network error; clear approach as appropriate. Separate static trip geometry from live approach validity. Refresh free ETA only while focused; do not rebill Google on validity expiry.
- **Exit:** exact validity boundary, stale fix with fresh HTTP response, provider/stage/assignment change, shared-run transition and background/resume all suppress invalid arrival claims. Public tracking reveals no additional private fields.

### S11 — Waiting-end normalization (depends S9 and clock work in S8/S10)

- Files: journey projector, `src/ride-flow.ts`, `src/app/order/[id].tsx`, lifecycle/clock tests.
- Expose `waitingEndsAt` from `graceUntil`; reuse clock handling. Keep legacy fallback. Respect arrival/boarding/assignment/safety state without inventing pause/fee mechanics.
- **Exit:** pre-arrival null; repeated arrival/reconnect same end instant; exact end shows elapsed; no client countdown drives a mutation; safety hold still prevents advance and reassignment removes old waiting state.

### S12a — Accepted fare-change record/event (depends S11)

- Files: `server/domain/destination-change.ts`, `server/domain/events.ts` or narrow event helper, `server/main.ts` opted-in event projection, money conversion helper only if needed, destination/event tests.
- Persist section 3.7's typed change record within existing acceptance and emit PG journal event. Preserve all original proposal/rate/discount/safety/status checks and lock order. New event filtering must maintain cursor progress for old consumers.
- **Exit:** acceptance updates order, audit and PG event atomically; duplicate acceptance emits once; decline/expiry/withdrawal/race loss emits none; zero/discounted/boundary/overflow money is correct; no cash-entry or payment delta is created.

### S12b — Fare-change client integration (depends S12a)

- Files: journey projector/validator, `src/app/order/[id].tsx`, existing destination-change UI and receipt presentation where applicable, `src/copy.ts`, focused UI/contract tests.
- Show one authorized before/after gross/discount/due explanation per accepted change, including the existing cash-settlement wording. Current order/receipt values remain authoritative. Reconnect/refetch/deduplicate by changeId; only show valid current-context history.
- **Exit:** both participants see the accepted change; proposal alone leaves current fare unchanged; repeated event/poll does not duplicate the notice or modify money; stranger/public/previous driver gets no history.

### S13 — Bounded remaining parity audit (depends S12)

- Verify the requested B7 items against the implemented result. Reuse `dispatch.closeReason`/current offer state for existing status copy; do not introduce a speculative `lastRequest*` history or disclose other drivers.
- Keep existing step-based parcel progress. `timeline.progress` would need an agreed meaning (workflow steps versus travel distance); do not manufacture a percent. Keep safety block distinct from waiting-clock pause. Cancellation accounting taxonomy, night PIN, QR and ack remain explicit non-goals.
- **Exit:** all Part D items are either implemented and consumed, or have the explicit conservative decision in this plan; no standalone DTO/helper is claimed as end-to-end adoption.

### S14 — Aggregate automated gates (depends S13)

- Register new `.test.mjs` suites in `scripts/run-tests.mjs` and PG suites in `scripts/check-persistence.mjs`; honor the orphan/duplicate suite guard. Keep schema/endpoints/feature changes in additive contracts, not frozen fixture rewrites.
- Run the commands below against the final source snapshot. Diagnose and fix every observed failure within scope; do not report targeted success as a full gate. Re-run only affected checks after later edits, then the final required gate once.
- **Exit:** full registered suite, contract fixtures, both typechecks, zero lint diagnostics and relevant PG migrations/races pass, with exact source hashes and logs. Current web export contains the current `public/map.html`; runtime closure is tested in isolation.

### S15 — Physical acceptance and final parent review (depends S14)

- Use only SM-A5360 `R5CTB0FJP9Z`. Tests/heavy builds and browser runners run on k5. If USB remains on the local host, keep its QA port on `adb reverse` and forward the loopback test backend/CDP connection to k5; do not expose the QA server on a public interface. No emulator/simulator or Chrome-profile reset.
- Cover route/pin map readiness, failed tile/page/renderer recovery, provider exhaustion/Retry, gesture-stop/recenter, fresh/stale marker, actual wrong-code→correct-code completion, receipt/rebook/schedule/return and optional journey cards in Arabic/English. Use existing test identities and approved test packages; never production data. Preserve native permissions/profile state except deliberately tested reversible changes.
- Use `check-scenarios` as an automated browser regression too, but its Chromium fixture/GPS/OSRM results are not phone acceptance. The PG boarding/dispatch opt-in cohort requires its own isolated PG backend for physical testing; SQLite phone success cannot prove it.
- **Exit:** physical evidence identifies device, tested artifact/source, backend, exact cases and provider mode. If hardware/key/approval is unavailable, report that specific acceptance limit; do not replace it with simulated evidence or enable production gates.

## 6. Verification commands and meaningful failure cases

Run from a new final-source snapshot on k5. Repository has `package-lock.json`, no Bun lock: use npm/npx. Pin the existing matching install; if a fresh install is needed, use `npm ci` there without altering the lock. Dependencies are not added by this plan. All shell/child processes must capture exit codes, stdout/stderr and host identity. On the current k5 shell, add `C:\wq-k5\nodejs` to that process's PATH; do not edit machine configuration.

```powershell
# Source/check environment first; capture each exit code independently.
hostname
node --version
Get-FileHash -LiteralPath package-lock.json -Algorithm SHA256
npm run lint
npm run typecheck

# Focused gates during their slices (filter is a literal substring, not a regex).
node scripts/run-tests.mjs --filter=google-map-lifecycle
node scripts/run-tests.mjs --filter=deployment
node scripts/run-tests.mjs --filter=driver-command
node scripts/run-tests.mjs --filter=driver-recovery
node scripts/run-tests.mjs --filter=map
node scripts/run-tests.mjs --filter=route
node scripts/run-tests.mjs --filter=wire-contracts
node scripts/run-tests.mjs --filter=change-destination
node scripts/run-tests.mjs --filter=activation-gates

# Installed contract and complete unit/SQLite/integration gates.
npm run test:contracts
npm test

# Dedicated loopback fastship_test only; use existing fixture setup on k5.
node scripts/check-persistence.mjs --filter=dispatch
node scripts/check-persistence.mjs --filter=ride-lifecycle
node scripts/check-persistence.mjs --filter=events
node scripts/check-persistence.mjs --filter=commands
node scripts/check-persistence.mjs --filter=pg-contracts
node scripts/check-persistence.mjs --filter=pg-import
node scripts/check-persistence.mjs --filter=pg-migration-lock
npm run test:persistence

# Runtime source closure and a fresh browser scenario export.
node scripts/runtime-dependencies.mjs .expo/maps-plan-runtime-check
npm run test:scenarios
```

The closure command alone is not an artifact boot check; S1's test must isolate runtime module resolution. `test:scenarios` builds its own export with the intended origin; use `--no-build` only with matching source/build/origin evidence. Do not serve stale tracked `dist/` as proof. PostgreSQL race/legacy tests must use real PG fixtures, not SQLite substitutes; do not run a persistence suite against production or an arbitrary existing database. Serial execution avoids the previously documented `pg_dump` contention; retain a genuine failure if it recurs.

Physical-browser runner example, after the matching exported sandbox and USB forwarding are prepared: `npm run test:android-browser` (read its env/port preconditions) and `npm run test:expanded-phone` for applicable gated services. Existing `phone:check` covers native test packages separately. Confirm which package/build actually includes the new JS before claiming native acceptance. Use device tooling required by the parent runtime for native interactions; adb remains suitable for inventory, installation, port forwarding, logs and supported existing test runners. Do not trigger `expo start --android` or simulator scripts as a substitute.

Required regressions, beyond happy paths:

| Area | Boundary / negative / race assertions |
| --- | --- |
| Map lifecycle | Loader rejection; style-only/no-vector-tile; tile deadline; context loss after ready; page 404/HTTP/WebView death; repeated failure; late SDK/ready/center after unmount; two mounted maps sharing policy; retry then old failure; public and private scopes; change preference/config while loading. |
| Geometry/camera | Google result lands after baseline fallback; retained approach from previous provider; unknown provenance; user gesture then GPS fix; programmatic animation does not disable follow; resize/zero-size map; long road outside stop bounds; reduced motion; initially configured driver without injection; stale fade and no approach. |
| Recovery/handover | Immediate corrected proof after rejection without poll; replay of rejected command; lost success/rejection response; process death; unavailable protected storage; missing metadata in action response; focus/session/order/epoch changes during lookup/send/refresh; five attempts; reset; return proof counter unaffected. |
| Offers | `expiry-1`, exact expiry, after expiry; round-truncated window; permission request outliving lease; backward/forward phone-clock jump; two processes accepting; accept vs expiry/decline/cancel; driver/presence/vehicle changes while waiting; duplicate committed replay after expiry; masked stranger 404; no silent legacy acceptance. |
| Boarding | Same-epoch initialization twice; release/reassign same driver; rotate vs start/lockout; stale pin revision; correct PIN while locked; failed-start rollback; verification reconnect; reason validation; hidden code for driver/admin/public/finished/old assignment; no code in durable receipts/events/offline summaries. |
| ETA | Nonfinite/negative/unsafe seconds; inverted band; minute/second confusion; zero duration; provider timeout/no-route; unknown grade; old cache with fresh serialization; slow response already expired; fix ages 30/60/120; same driver new epoch/stage/target; shared-run change during awaits; hidden/background timers; no paid retry on expiration. |
| Waiting | No arrival; repeated arrival; exact five-minute end; clock jump; restart; reassignment; safety hold without invented pause; no financial/lifecycle mutation at zero. |
| Fare events | Accepted once; duplicate and concurrent decisions; accept vs withdrawal/release/safety/cancel; discounts changing while gross unchanged; no-price change; zero/maximum/unsafe minor amounts; order/event rollback together; PG delivery duplicate; old-client event filter cursor progresses; new events never leak through public snapshots. |
| Compatibility | Frozen SQLite and PG exchanges unchanged; migration14-only/28/full/29 repeated; old pending recovery payloads; new client + old server; query opt-in combined with capacity/recovery/durable flags; malformed extensions disable only dependent action; production flags remain false. |

Evidence labels in final implementation reporting must distinguish: **pure/unit**, **HTTP SQLite**, **real PostgreSQL multi-process**, **browser fixture**, **physical Android WebView/native**, **real OSRM**, **real paid Google**, and **iOS physical**. Live tiles with fixture GPS/OSRM are still a fixture scenario. A stationary phone proves sensor/foreground-service paths, not speed cadence or driving behavior. A Google stub proves mapping/budget behavior, not a valid restricted key or working paid tiles.

## 7. Risks, prerequisites and handback

- **Dirty-tree integration:** substantial current work crosses the same files. Preserve it; review diffs per slice and snapshot hashes. Do not discard an untracked module just because it was absent at HEAD. The camera helper deletion is deliberate and limited.
- **Recovery fix safety:** a refusal is a committed decision. Removing revision fences or resetting command IDs after ambiguous delivery would mask the symptom and permit duplicate effects. Refresh-before-new-action is the chosen correction.
- **Provider failure loops/costs:** central policy plus local adapter retries can fight each other. There must be one attempt owner; failure, readiness and billed-route lifecycles are separate.
- **Rolling migration:** legacy servers may still issue codes without metadata. Keep metadata nullable and advertise unknown/unavailable accurately; no historical inference. Production rollout/cutover and any new gate activation require separate approval, not this plan's completion.
- **Historical spec drift:** current PG destination parity, server waiting instant and completed-region pin callbacks are real; do not regress them to old prose. Conversely, implemented schema/client code is not production operating approval.
- **No new fee/payment policy:** a fare-change notice cannot settle cash or trigger card/refund adjustments. Keep existing gates and do not broaden destination eligibility to unsupported financial arrangements.

Only genuine user/provider prerequisites may remain outside implementation:

1. An iOS physical device for Apple/native-Google acceptance. Source/unit evidence can be completed now; do not substitute a simulator.
2. Approved restricted Google platform keys and an already authorized matching test build/billing context for real Google tests. Stub coverage and free baseline acceptance proceed without them; no new spend or production key changes.
3. Physical phone availability at acceptance time and, if needed, access to an approved test package/build. It was attached during planning. If it becomes unavailable, stop physical acceptance and report that fact rather than start an emulator.
4. A safe owner/driver-assisted field run if speed/heading/movement behavior must be claimed as physically verified. No planner or bench test establishes it.
5. Existing routing corpus/operator approvals, staging credentials/cutover approval and production activation decisions remain prerequisites to deployment/readiness, not to this code/test work. k5 SSH access is **not** currently a blocker; the old refusal note is superseded by successful SSH here.

Undefined optional product semantics are resolved conservatively in this plan rather than blocking the parent: no automatic/night PIN policy, no QR, no ack/client expiry, no timer pause/fees, no fabricated timeline percentage. Reopen only if the owner requests those products.

The parent should review this plan, implement personally, and report every completed fix as **issue → change → verification**, naming remaining evidence limits precisely. No implementation is claimed by this planning artifact. Optional later independent reviews may be recommended, not launched here: MiniMax M3.1 Flash or DeepSeek V4.1 Flash. Verify the requested provider/model first; the advertised `opencode minimax-mavis/MiniMax-M3.1-Flash` at max is not interchangeable with the MiniMax Code short catalog's M3/M2.7. Never silently substitute a provider/model.
