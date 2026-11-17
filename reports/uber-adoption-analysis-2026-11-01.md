# What Wind / Fastship can take from the Uber study

Analysis date: 1 November 2026. The repository is named Fastship; the app and product documents call it Wind.

**The strongest opportunity is to improve reliability across the complete journey: finding a place, confirming a price, accepting a job, tracking it, recovering from interruption, and proving completion. Much of that foundation already exists here.** The study supports improving those foundations; its enormous feature catalogue is not a suitable launch backlog.

This analysis reads all 37 sections of [the supplied reference](C:/UberAppKnowledge/UBER-APP-COMPLETE-KNOWLEDGE-2026-11-01.md), compares them with the current, uncommitted source, and distinguishes implemented code from activated capability and verified runtime behavior. It does not claim to have independently read all 206,254 converted vendor source files or reproduced the study's package measurements. Supplied-reference SHA-256: `841957329ddf5f06e0ef99651838203c37c54b721e3e391a57ed4f3ecf273485`.

## 1. What we already have and should retain

| Study lesson | Current Wind evidence | Decision |
| --- | --- | --- |
| Home can be a useful card page without loading a map | `src/app/(customer)/index.tsx:13` renders a greeting, destination entry, enabled service tiles, active orders, recent routes and safety content | Keep. This agrees with the observed Uber home in §§6.3 and 30.1 and Wind's own product intent. |
| Destination entry, landmarks, saved places and explicit map confirmation belong together | `src/app/book.tsx:118`, `src/app/book.tsx:662`, `src/place-search.ts:1`, `src/pin-sheet.tsx:10` | Keep the local, Arabic-friendly foundation. Add remote suggestions only after local place-quality and provider evidence justifies them; retain manual landmarks. |
| Use a common map interface over available providers | `src/route-preview.tsx:5`, `src/map-provider.ts:17`, platform-specific `src/route-map*` implementations | Retain the existing adapters. Complete their runtime policy rather than replacing the map stack. |
| Explain real location quality and avoid invented movement | `src/location-state.ts`, `src/location-delivery.ts:39`, `src/map-math.ts:45`, `src/road.tsx:28` | Preserve stale handling, invalid-fix rejection, large-jump behavior, accuracy and route provenance. Verify them with physical field traces. |
| Protect the whole request-to-trip lifecycle | `src/ride-flow.ts:5`, `src/ride-flow.ts:14`, `server/domain/dispatch.ts`, `server/domain/ride-lifecycle.ts` | Leased offers, server clocks, arrival/grace and boarding protection already exist. Finish their controlled activation and operating evidence. |
| Keep service-specific requirements inside one familiar journey | `src/freight-scope.ts`, `src/freight-details.tsx`, `src/ride-flow.ts:8`, `server/domain/resource-scope.ts` | Keep parcel custody, passenger boarding and freight capacity as distinct rules. A common screen must not collapse their different completion requirements. |
| Isolate credentials and disable Android backup | `src/api.ts:24`, `app.json` Android `allowBackup: false` | Retain. Feature caching should use a separate storage policy; it should not turn SecureStore into a large content database. |
| Build a reusable design language | `src/ui.tsx:19`, `src/ui.tsx:44`, `src/copy.ts`, `src/motion*` | Extend existing colors, controls, type, accessibility, Arabic/English and reduced-motion behavior. No need to recreate Uber's design system. |

“Keep” means the implementation is present and worth preserving. It does not establish deployment, operational readiness or a new physical-device result.

## 2. The most useful next improvements

### A. Make driver actions survive network loss and process restart

This is the first implementation priority. Wind persists an account-bound pending booking (`src/booking.ts:14`, `src/app/book.tsx:207`, `src/app/book.tsx:344`), while order advance and problem retry identities are kept in React refs (`src/app/order/[id].tsx:65`, `src/app/order/[id].tsx:68`, `src/app/order/[id].tsx:123`). Those refs do not survive a process restart.

Use the existing server command receipt and version checks (`server/domain/commands.ts:7`, `server/domain/commands.ts:58`) to support a bounded, durable driver action queue. Each entry needs an actor, resource, command identity, expected version/assignment, creation time and an explicit pending/acknowledged/conflict result. Reconcile after reconnect or restart before offering the next action. Clear or quarantine entries on logout, revocation, reassignment or expiry.

Offer acceptance, payment authorization and expired boarding challenges must remain subject to their live authority checks; queueing is not permission to execute them later. Avoid storing reusable boarding secrets in a general queue. GPS has different semantics: retain the current fresh-fix retry policy, not a backlog that replays stale positions as current (`src/location-delivery.ts:71`). The Uber package does not itself prove its offline write semantics; this recommendation follows Wind's concrete gap and local connectivity requirements.

Acceptance: lose the acknowledgement after a successful command, terminate the app, reopen, and reconcile to exactly one transition. Repeat after reassignment, logout, a version conflict and a proof rejection. Show “pending” until the server acknowledges the action.

### B. Allow a useful, limited offline cold start

`src/api.ts:65` keeps an in-memory snapshot through transient failures, but `src/session.tsx:69` marks a failed cold-start session fetch offline and `src/app/_layout.tsx:60` replaces the route tree with a retry screen. An active order cannot currently be reconstructed from a durable read cache through that path.

Add small, account-scoped, versioned caches for the last active order summary, necessary places and booking draft. Show saved-at time and an unmistakable stale/read-only state. Validate session and assignment authority before new sensitive actions or location collection. On shared devices, enforce retention and deletion rules; exclude private proofs, reusable secrets and unnecessary precise trace history. Backend state remains authoritative.

Choose the persistent adapter after defining record sizes and privacy. Expo's [SDK 57 SecureStore documentation](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/) warns that large values may fail at the native layer and that it should not be the sole record of irreplaceable data. A local database could sit behind feature stores if needed; the useful lesson is store ownership, not a ban on databases.

Acceptance: reopen an active job in airplane mode; see its stale summary and support path; restore connectivity and replace it with the authorized latest state. Logout removes the cache, and a different account cannot read it.

### C. Centralize a small, typed configuration policy

Uber's 14,516 parameters (§11) show that behavior can be controlled as data. Wind already returns settings and capabilities (`src/session.tsx:14`), refreshes them (`src/session.tsx:96`), and filters home services (`src/app/(customer)/index.tsx:26`). We need consistent validation and ownership rather than thousands of new flags.

Start with the decisions we actually vary: enabled services/cities, map provider policy, safe refresh intervals, supported client protocol and controlled feature rollout. Define type, default, allowed range, owner, version and expiry. Use safe last-known configuration where appropriate, with a clear stale policy. Record configuration revisions with diagnostics and require server-side authority for eligibility, money, coverage and trust decisions.

A remotely supplied flag must not manufacture a native module, grant a role, override licensing or bypass a deployment gate. Keep emergency disablement separate from authorization.

Acceptance: unknown, malformed, expired and unsupported configurations resolve predictably; a service disabled server-side cannot be booked by a cached or modified client.

### D. Connect provider fallback to actual map failures

The resolver already accepts a provider configuration and failed-renderer list and returns `didFallback`/an error (`src/map-provider.ts:28`). Current screens call `selectRenderer`, which supplies only the preference (`src/map-provider.ts:64`, `src/route-map.android.tsx:75`, `src/route-map.tsx:160`, `src/route-map.native.tsx:24`). This is capability/preference selection; it is not yet screen-driven fallback through that failure list. Several map implementations already offer a bounded failure state, retry and route diagram.

Complete one provider session that owns attempts, selected renderer, failure reason, safe retry and terminal diagram/manual fallback. Publish the effective renderer so route loading and rendering agree. Keep existing content-provenance checks (`src/map-provider.ts:87`): a provider switch cannot reuse geometry where that renderer is disallowed.

Record platform, configured provider, selected provider, fallback reason, first usable map time and retry outcome without precise coordinates or credentials. The study's own Google-at-runtime versus Uber-in-defaults result (§13) demonstrates why effective behavior matters more than configuration alone.

Acceptance: unavailable key/module, tile timeout, failed WebView process, exhausted providers and repeated retry each reach a usable, honest state without loops or leaked listeners. Routing follows the effective provider and existing content rules.

### E. Share camera and overlay rules without building a map engine

The study's layer/padding/camera split (§20) is useful. Wind already has shared route-frame points (`src/map-math.ts:79`), but viewport rules live in several renderers: for example web has `FOLLOW_ZOOM`, `FOLLOW_OFFSET` and height-based padding (`src/route-map.tsx:150`, `src/route-map.tsx:173`), while native paths use a fixed region delta (`src/route-map.native.tsx:19`, `src/google-map.native.tsx:17`).

Define a small shared camera intent: fit route, follow driver, inspect pickup or user-controlled. Let adapters translate that intent. If the UI gains a map with overlapping sheets, measure the actual occupied insets and arbitrate camera ownership. Attach/detach feature overlays with their screen lifetime. Do not introduce a general layer framework merely to wrap today's small set of inline maps.

Acceptance: opening a sheet, changing text size, changing phase, reassigning the driver and dragging the map never hide required points or cause competing automatic camera moves. Test Arabic and English on the physical phone.

### F. Measure startup, battery, routing uncertainty and failure recovery

Wind has privacy-conscious structured server error logging (`server/domain/diagnostics.ts:6`). It does not establish end-to-end mobile performance. The launch overlay waits for both session readiness and the 1,600 ms intro (`src/intro.tsx:8`, `src/app/_layout.tsx:38`). Measure how much of the perceived launch this adds before deciding whether to shorten or move the animation. Record usable-home and usable-order time separately from splash duration.

Measure map-ready latency, command acknowledgement/recovery, assignment delay, stale-location duration and battery use in foreground, screen-lock and navigation scenarios. Establish proposed budgets from physical A53 baselines, then add regression checks; no measured p95 or battery result is asserted here.

The client `etaRange` helper uses a heuristic (`src/map-math.ts:98`), not a calibrated statistical confidence interval. Retain honest estimated ranges, validate local routes and restrictions, and calibrate against actual journeys before making precision claims. Neither the study's route names nor its H3 inventory reveals Uber's dispatch or ETA algorithm.

### G. Make contracts and capability readiness precise

The client fetch layer casts JSON to a requested type (`src/api-client.ts:48`). Begin runtime request/response validation with the highest-value shared contracts: command receipt, order snapshot, quote, dispatch lease, ride summary and configuration. Derive types from the same small schema source when practical, preserve installed-client fixtures, and add version-skew cases. A type assertion alone does not check the network response.

Readiness should separately describe storage, schema compatibility, feature activation and operational/provider evidence. The current PostgreSQL `/api/ready` list requires migrations through 21 (`server/main.ts:581`), while schema migrations extend through 28 (`server/db/postgres-schema.ts:116`). That does not prove a live unsafe mutation, but generic readiness cannot establish every newer capability's prerequisites. Expose a minimal public availability signal and keep detailed migration/provider diagnostics restricted to operators.

Acceptance: malformed contracts fail safely; old clients retain their documented responses; a migration-21-only database never advertises a capability requiring migration 28. Do not weaken an existing activation gate.

## 3. How to adapt the architecture

Adopt feature ownership from RIBs, not a new navigation framework. Expo Router is already the project's navigation contract. Keep routes thin and group booking, active-order, tracking, payment and support behavior behind small interfaces. Clean up subscriptions, timers and overlays when the owning screen ends.

The current `server/main.ts` is 3,230 lines and booking/order screens are 716/740 lines at this snapshot. Line count alone is not a defect. It does suggest places where the proposed recovery/configuration work should be extracted into focused modules instead of adding more local effects. Keep the existing modular monolith and transactional database. Many generated vendor models, a gRPC inventory and an endpoint dictionary are not evidence that Wind needs microservices, GraphQL or a new transport.

For contracts, keep shared domain types and runtime validation; evolve additive capabilities and compatibility fixtures. Generate more client/server types from a common schema when duplicated validation or drift makes that useful. Copying `/rt/...` strings would provide neither server implementations nor an interoperable contract.

## 4. Patterns to defer or leave out

| Study item | Wind decision and reason |
| --- | --- |
| First-party C++ GL renderer, shaders, imagery cubes, glTF and 3-D | Leave out of the current roadmap. Our existing map providers cover booking and tracking; the study does not supply a supported drop-in engine. |
| RIBs/Compose/custom Android architecture | Take feature ownership and cleanup. Retain Expo Router and React Native for cross-platform delivery. |
| H3 everywhere | Defer until spatial aggregation or dispatch queries show a measured need; current geographic validation should remain authoritative. |
| Thousands of parameters and generated models | Adopt typed ownership and contracts at our scale. Counts are not a quality target. |
| Food, transit, scooters, autonomous vehicles, ads and family products | Defer. They do not advance Wind's parcel, ride and freight launch journey. |
| A full server-driven UI platform | Defer. Typed service availability and a bounded set of configurable cards can come first; keep navigation, safety and transactional flows governed by shipped code. |
| Custom crypto loaders/environment inspection | Leave out. Use supported platform security, server authorization and established cryptographic libraries where required. |
| Uber's cross-app IPC package/certificate table | Not currently applicable: Wind does not expose the equivalent SSO provider family. Apply strict caller validation if such an integration is actually introduced. |
| The rider app's permission list | Do not copy it. Wind includes a driver role with active-job tracking requirements; least privilege must be assessed by role and operation. |
| Dynamic pricing inferred from names | Leave automatic surge out of this launch. Use transparent, approved tariffs and evidence-based policy. |

For location specifically, customer pickup discovery and driver active-job tracking are different jobs. Keep just-in-time consent, explicit sharing state, fresh-fix fencing and prompt stop behavior. The [SDK 57 Location documentation](https://docs.expo.dev/versions/v57.0.0/sdk/location/) documents native configuration, permission and app-lifecycle limitations; copying the rider package's absence of a background permission would not validate Wind's driver requirements.

## 5. Coverage of the entire supplied study

| Study sections | What transfers | What must not be inferred |
| --- | --- | --- |
| §§1–4: artifact, coverage and census | Reproducible version/hash evidence; distinguish generated code and counting bases | Conversion success does not prove every feature is reachable, correct or understood. |
| §§5–7: product, screens and design | Card home, progressive disclosure, clear picker, coherent shared controls | Reproducing every product or native toolkit is unnecessary. |
| §§8–10: background work, permissions and location | Lifecycle ownership, limited collection, explicit state, bounded work | Rider permission policy does not settle driver background tracking. |
| §11: configuration | Small typed registry, safe defaults, revision visibility | A client flag cannot grant server authority or enable absent native code. |
| §§12–22: maps | Provider interface, effective-provider observation, overlay ownership, camera intent, correct units | Renderer internals, shipped tuning constants and 3-D work are not our performance requirements. |
| §23: contract and transports | Named business operations, typed request/response models, explicit lifecycle | Included paths are not proof of live endpoint reachability or Uber's server implementation. |
| §24: persistence | Feature-owned local stores, isolated tokens, retention and cache bounds | The absence of a client relational schema says nothing about the vendor's backend database; keep Wind's transactional backend. |
| §§25–29: security | Trust a verified actor, validate sensitive operations, use evidence and preserve closed findings | Presence of crypto/integrity code does not establish effectiveness. Do not reopen the closed vendor security register. |
| §30: roles | Role-appropriate actions and least-privilege presentation | Driver/admin names inside rider code do not describe the complete separate driver or operations products. |
| §31: 28 functional + 15 non-functional requirements | Use as a coverage checklist and prioritize by Wind's product scope | A requirement inferred from package evidence is not automatically a launch commitment. See the companion mapping below. |
| §§32–33: corroboration and unknowns | Keep public claims, observations and open questions distinct | Do not invent wire formats, at-rest encryption, animation curves or fallback causes. |
| §§34–37: checklist, method, evidence and recap | Claim-to-evidence links, archived revisions, repeatable checks | Class/export/route counts are not measures of user value or production readiness. |

One study conclusion needs particular care: “no third-party analytics” should not become a Wind privacy claim. The supplied file also lists Firebase and Google measurement services (§§4.1, 8.1). An inventory of named attribution vendors does not establish the absence of all third-party telemetry. Inventory Wind's actual SDKs, network destinations, purpose and consent behavior instead.

The [companion backend and 43-requirement mapping](uber-adoption-backend-analysis-2026-11-01.md) records individual F1–F28 and N1–N15 decisions with source anchors. Presence, partial implementation, deferred scope and operational proof remain distinct.

The [decision chart](uber-adoption-map-2026-11-01.html) summarizes which foundations to retain, which reliability work to complete next and which vendor-scale systems to defer. It uses categorical decisions, not invented completion percentages.

## 6. Recommended execution order

1. Establish the current source/deployment/protocol baseline, precise capability readiness and privacy-safe recovery/performance measurements. Preserve existing staging and activation gates.
2. Implement the durable driver action protocol, its runtime schemas and limited offline read cache together, reusing booking recovery and server receipt/version machinery.
3. Add the bounded typed configuration policy and wire actual map failures through effective-provider state. Keep provider-specific route handling synchronized.
4. Consolidate shared map camera intent and feature lifetime cleanup where current screens duplicate the behavior. Add measured insets only where overlays require them.
5. Validate the whole parcel/ride/freight journey on the connected physical Android phone: restart, network loss, denied/stale GPS, screen lock, reassignment, Arabic/English, large text and TalkBack. Obtain separate physical iOS evidence.
6. Complete the existing controlled deployment/pilot work with real operator coverage, provider integration, route evidence and rollback/restore proof before expanding activation. Prior implementation reports are historical evidence, not a current live-state claim.

This sequence improves the product people already use and makes later expansion safer. No delivery-time or cost estimate is asserted without implementation planning.

## 7. Verification for this analysis

All application checks ran on **k5 / DESKTOP-NE681OS**, using a new isolated source directory `C:\wq-uber-adoption-20261101` with Node 24.12.0. The supplied SSH connection worked on this date. The dependency base had the same package-lock SHA-256 as this source (`7f60c423c99e450786eedd63847c8b553247225df4eaabe3ef1b39e5df1f2713`); Expo was 57.0.31. Source archive SHA-256: `d257e007a4b3b2a50af8f3751cd352875c2de95d0a80d17ca16c17c2454528f5`. Dockerfile was copied separately after a test exposed its omission from the first snapshot.

Passed: Expo lint; client and server TypeScript checks; `map.test.mjs`, `google-maps-loader.test.mjs`, `google-map-lifecycle.test.mjs`, `presentation.test.mjs`, and `booking-auth.test.mjs`. Raw results and logs are in `.artifacts/uber-adoption-analysis-2026-11-01/`. These checks support the baseline described here; they do not prove the proposed enhancements exist, migrated PostgreSQL feature activation, native GPS accuracy, battery behavior or live field readiness.

The first remote harness stopped while reporting a missing Dockerfile in the isolated copy; the missing input and native-process log handling were corrected and the complete selected gate then passed. No application defect was concealed by changing an assertion. No application code, live configuration, database or cloud resource was changed for this analysis. No new phone test, emulator, simulator, deployment, commit or push occurred.

Expo guidance was checked against the [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) and its SecureStore/Location pages, accessed through the connected public-documentation tool. These sources guide Expo-specific tradeoffs, not claims about Uber.

Documentation corrections made in this task: stale current-runtime/“absent” claims in SYSTEM and the old parity matrix → marked the historical scope and linked the current source analysis → source comparison and whitespace verification passed. The old pending vendor-security decision → marked closed to match supplied-reference §29 → checked against that section without reopening the investigation. CURRENT-WORK records this checkpoint. A local report check confirmed 28 functional rows, 15 nonfunctional rows and no broken file/line targets across the two analysis reports.
