# Wind: study-based implementation, rides and freight

The owner selected passenger rides and freight **within Wind**. This change
connects Wind's existing server modules to mobile client journeys and applies
the map architecture findings supported by the study. It does not copy the
studied vendor's endpoints, wire formats, branding or native implementation.
Food, transit, autonomous vehicles and the rest of the study's wider product
catalogue are outside this selection.

Work is uncommitted in the existing working tree. Earlier audit/research edits
were preserved. The earlier whole-app review and its skill sequence remain in
`reports/app-audit-2026-11-01.md`; this report covers the subsequent implementation.
The implementation used incremental-implementation and source-driven-development,
then code-review-and-quality and security-and-hardening for the new flows.
The owner's fix-in-place and no-commit/no-deploy rules take precedence over
skill defaults suggesting commits or approval of reversible fixes.

## Cloud state verified through CLI

| Project/subscription | Observed state | Implication |
| --- | --- | --- |
| Azure subscription 1 | Live ARM Enabled; PayAsYouGo quota; spending limit Off | Existing Wind resources can be assessed for a deployment. No resource change was made. |
| Azure for Students | Live ARM Disabled; spending limit On | Cached `az account list` incorrectly still showed Enabled. Do not select it for Wind deployment. |
| AWS profile osama | STS identity works; configured Region eu-north-1 | Inspected EC2, Lambda, RDS, ECS, CloudFormation and S3 inventories were empty. This is not an inventory of every AWS service. |
| AWS plan | Free Tier plan API returned ResourceNotFoundException, Missing data | Paid-plan status is unknown. Do not infer a paid plan or launch resources from this response. |

Azure has Wind's existing running VM, Container App/environment, registry,
storage/network/logging resources and a successfully provisioned G2 Azure Maps
resource. Resource existence does not establish provider activation, restricted
keys, regional data quality or commercial suitability. No keys or secret values
were fetched. Existing unrelated AI/search resources were left alone.

For any future AWS activation, confirm plan/spend status in AWS Settings > Billing
and Region in AWS Settings > View all projects > Overview > Additional Info >
Region. Regional resources must stay in eu-north-1. No AWS resources were created.
CLI evidence is under `.artifacts/study-implementation-2026-11-01/cloud/`.

## Issue → implementation → verification

| Issue | What changed | Verification |
| --- | --- | --- |
| Map renderer selection lacked typed provider policy and explicit failure state | Added bounded initial/fallback/missing policy, unknown/unavailable diagnostics, fallback tracking and platform capability enforcement | Map regression suite on k5, including unknown platform and exhausted fallback cases |
| Accuracy halos used an approximate projection scale | WGS-84 radius, 512-pixel tiles, Mercator latitude clamp and explicit pixel density now drive both map paths | A53 study fixtures, zoom/density properties, invalid-input checks and exact HTML/helper parity on k5 |
| Private ACR roles existed without runtime registry authentication binding | API/worker bind the shared workload identity; OSRM gets a separate AcrPull-only identity and explicit registry configuration | Pinned Bicep compilation/lint/parameter checks and compiled-template assertions; no deployment or live image-pull claim |
| Driver could retrieve the boarding PIN and satisfy the challenge alone | PIN serialization is customer-only, current assignment only, before boarding | PostgreSQL lifecycle and race regressions, including hiding the PIN after boarding; A53 role check passed |
| Ride screen could not use arrival evidence or boarding challenge | Added arrival action, customer PIN panel, driver entry/lock states, server-derived grace clock and reasoned operator arrival/unlock controls; partial responses trigger a full refresh | State-boundary and server recovery/authorization tests; A53 core flow passed |
| Leased ride offers were sent as legacy accepts | Accept sends offer id/nonce, checks expiry after permission preparation, shows expiry/decline and suppresses price bidding for dispatch rounds; countdowns use server clock offset | Expiry/skew unit tests, mutation check and PostgreSQL dispatch integration; A53 core flow passed |
| Driver presence permanently claimed automatic requests were disabled | Requests state now requires online presence plus explicit server eligibleForMatching | Presence wiring regression; no automatic consent or location collection added |
| Exhausted searches had no client retry | Customer can retry the existing ride/order at the same price | Existing idempotent retry API plus order-screen integration |
| Freight details were absent from booking and retries | Captures equal-piece dimensions in cm, total kg, piece count, crew seats, declared value, equipment and loading window; stores exact wire units | Arabic-digit/decimal/limit tests, restart round trip and PostgreSQL scope/quote tests; A53 freight booking passed |
| Equipment selection did not expose selected state to assistive technology | Uses named checkboxes with checked state and 48-point minimum height | Type/lint/export checks; A53 checkbox state passed; TalkBack not run |
| Acceptance did not bind reviewed capacity requirements | Jobs/order reads request safe measured scope; accept/offer commands send capacity protocol and reviewed revision, with measured-over-declared precedence | Precedence regression and PostgreSQL freight offer/accept integration; A53 negotiated acceptance passed |
| Client could display an earlier quote after load edits or reuse an expired quote | Quote display is keyed to complete scope; expired/consumed quotes request a fresh price and reconfirmation; new failure states have Arabic/English copy | Type/lint gates and quote integration; A53 freight booking passed |

The freight UI follows the migrated server's optional declaredScope capability.
Servers without it retain their existing response shape and booking behavior.
No frozen installed-client fixture was rewritten to hide a contract change.
Declared data is labeled as declared; it does not pretend to be an inspection.
Server capacity checks and operator-approved vehicles/coverage remain authoritative.

## Verification evidence

Commands run on k5 (`DESKTOP-NE681OS`) against an isolated copy and disposable
loopback PostgreSQL. Base revision is `83533e39c286d792bd257da70284649599e2d929`
plus the uncommitted working tree. Final source hashes and logs are archived in
`.artifacts/study-implementation-2026-11-01/`.

- Integration gate: **94 suites passed**, including maps, provider policy,
  installed SQLite contracts, security gates and compiled Azure infrastructure.
- PostgreSQL focus: **9 suites passed**: dispatch migration/dispatch/races (3),
  ride lifecycle/races (2), resource scope (1), frozen contracts (1), quotes and
  quote routing (2). PostgreSQL contracts retain 174 exchanges and 21 transitions.
  The new capability is explicitly asserted before normalizing that one optional
  extension for comparison with the frozen SQLite fixture.
- The last client review then added clock-offset handling, operator recovery
  controls, accessible equipment state and error copy. Focused presentation
  checks, lint, both TypeScript configurations and web/Android/iOS exports all
  passed after those edits; they are distinct from the earlier 94-suite snapshot.
- The expiry mutation was rejected, original bytes restored, focused checks passed.

**Ride/freight A53 acceptance passed after the owner released the prior session.**
The task-owned device session opened Chrome through the supported device command.
The project runner executed on k5 with loopback API/CDP forwarding to the physical
SM-A5360. Four checks passed with zero unhandled browser errors: leased ride
acceptance and PIN privacy; arrival/grace/wrong-and-correct PIN/trip completion;
quote-bound freight booking with exact pins and load units; inspected freight
price offer and customer acceptance with capacity revision binding. Evidence is
in `.artifacts/study-implementation-2026-11-01/phone-acceptance/results.json` and
the two adjacent screenshots. The profile and other sessions were preserved.

The first attempts exposed fixture startup/locator assumptions (fixed in the
runner), then a real measured-freight crew bug: the API rejected nonzero cargo
seats and the SQL guard rejected an otherwise valid negotiated assignment.
The API now accepts inspected freight crew seats and preserves declared crew
requirements over older zero-seat cargo records. Migration 28 replaces the SQL
assignment guard with matching rules while preserving cargo totals, equipment,
packing, ownership and vehicle/run locking. Old migration files are unchanged.
Without migration 28, measured freight crew operations fail closed with 409.

Final backend verification on k5 passed resource-scope (including positive SQL
assignment, zero-seat bypass rejection and missing-migration rejection), capacity,
eligibility and frozen PostgreSQL contracts. Lint and both typechecks passed.
Production must apply migration 28 before activating this capability; rollback to
the previous guard requires draining affected freight work first. No live schema
was changed. A small English count-label correction followed the phone run;
final client gates cover that text-only change.

The executed phone flow used synthetic operating approvals and synthetic
foreground GPS. It does not establish physical GPS accuracy,
native background delivery, battery behavior, real traffic, actual carrier
permissions or field operating readiness.

The earlier map phase passed five A53 checks (signup, map/pin rendering, booking,
Arabic Android HTML/live marker, fragment injection rejection). Its web build
ran on k5; its phone runner used a labeled local SQLite fallback. New ride/freight
acceptance subsequently passed using PostgreSQL on k5, as recorded above.

Review experiment: changing lease expiry rejection from `expiresAt <= now` to
`expiresAt < now` made the exact-boundary regression fail. The original bytes
were restored, and the focused suite passed again.

Failures are retained in the session evidence: an obsolete assertion demanded
requests always be off; it now requires explicit server eligibility. An initial
remote browser run lacked Playwright's Chromium binary; that local test tool was
installed on k5. A test harness initially started PostgreSQL too late; startup
now precedes every integration suite and cleanup follows. A new false capability
field changed the frozen SQLite response; unsupported servers now omit the
optional extension, preserving the baseline. None of these failures is counted
as a passing result. A duplicate localization key found by the final lint pass
was removed in favor of the existing canonical translation before rerunning gates.
The final whitespace gate found an extra EOF blank line in the existing research
reference; only that blank line was removed, and `git diff --check` passed.

## Activation status

No deployment, commit, push, subscription switch, payment or cloud resource
creation occurred. Live Wind service configuration was not expanded.
Production dispatch/boarding activation remains off under the repository's
existing controlled-pilot gates; their test-only flags cannot activate production.
The observed Container App has not been proven to use the PostgreSQL/identity/
worker deployment required by these newer server protocols.

Before production activation: finish the controlled WP16 deployment/pilot with
real operator coverage, licensed drivers/vehicles, capacity/approach evidence,
database/queue health, supported map/routing-provider tests, live consented
device-location checks and rollback evidence. Azure template validation is not
a successful rollout. A new native binary and iOS physical-device acceptance
have not been produced in this task.

## Primary references

- Local study: `C:\UberAppKnowledge\UBER-APP-MASTER-KNOWLEDGE-2026-11-01.md`, especially §§7.2, 7.5, 15–17.
- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/): verified SDK/RN/React versions before mobile edits.
- [Expo Router focus handling](https://docs.expo.dev/router/reference/focus-handling/): focused subscriptions use useCallback and clean up on blur/unmount.
- [Azure managed identity image pulls](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull): identity, AcrPull role and explicit registry binding are distinct requirements.
- [Azure Container Apps secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets): existing Key Vault binding was inspected before changing infrastructure.


Final resumption gates: client-final.cmd exit 0 after the count-label follow-up (presentation, lint, both typechecks, web/Android/iOS exports). All four A53 checks and the four additional backend suites passed. The task-owned device session was closed after testing; other sessions/profile data were preserved.
