# Bounded model review — 8 November 2026

All tasks inspect the dirty working tree and existing evidence. They do not certify deployment or hardware behavior. The leader owns severity, checks cited source, and incorporates accepted corrections. Runtime evidence remains attributed to the leader; source-only cross-review does not turn it into a new execution.

## Completed adjudications

### Kimi Pool → Step cross-review: GPS/routing

- Kimi K3.1 Pro (`kimi-pool/kimi-k3.1-pro`, high) confirmed R03/R04/R06–R10/R13–R15 with two main corrections: R06 is displayed-polyline trimming, and R15 also leaves stale coordinates driving OSRM requests.
- Step 5 Preview (`nvidia/stepfun-ai/step-5-preview`, high) independently accepted R03/R04/R06/R15 after six focused reads. No material disagreement or new finding.
- Leader checked the shared GPS admission branch, private retention, 120-second public retention, `useRoad` request/ETA gates, and `fromDriver` consumers. R15 now explicitly says ETA **and** rendered approach expire while free OSRM requests continue; no periodic Google billing claim is made.
- R14 stays an intentional pickup-refinement opportunity, not evidence of poor hardware accuracy. R04 does not establish ride-arrival bypass.

Kimi: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3Aefc72379-6d25-4965-aa23-5424199c3b66>

Step peer review: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3Ac80ceb09-dabb-47e8-8027-7694ac4e6c4d>

### Sol: booking/concurrency corrections

- GPT-6.1 Sol (`gpt-pool/gpt-6.1-sol`, high) confirmed R01 and identified a source-confirmed legacy PostgreSQL searching-cap sibling.
- Corrected transaction wording: PostgreSQL handler boundaries are savepoints under an outer HTTP transaction; moving provider work before a handler BEGIN is insufficient.
- Corrected remediation: null receipts cannot release a retained command; genuine terminal rejects need a durable, writer-fenced release path.
- Distinguished Part B preservation assertions from Part A's reproduced `quote_consumed` race.
- Added R17, the missing post-wait session fence in quote-bound booking, as source-confirmed. Leader traced `authorize`, `createOrder`, authentication, logout, command wrapper, outer envelope and test coverage; no fresh-session lock or session-bound order FK/RLS guard was found.

Sol: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3Acfc291d0-d1f8-40e0-91c0-a6647aeeb994>

### Step: frontend/admin/dead-code corrections

- Confirmed R05/R11/R12/R16. Leader verified focus setup timing, focus cleanup versus AppState, both billable consumers, the lack of existing virtualized lists, and `cachedPickup`'s recorded T04 ownership history.
- R05 now covers both booking preview and order approach. Ordinary background bounces are distinguished from mounted-screen blur; the repair must preserve upstream call counts and restore response visibility.
- R11 now describes virtualization as new adoption using existing row components. R12 explicitly excludes journey decoration.
- The raw-Error observation mentioned by Step came from older reports and is not a finding in this report. Historical T04 evidence is provenance, not proof that the older design is still active.
- Step exceeded the requested 10-operation bound (22 reads/greps); no executable tests or edits occurred.

Step: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3A88efeb28-935f-44da-a7f4-0c9de8bac2d9>

Kimi's fresh peer check accepted R05, both consumers/fallback behavior, admin scope/virtualization wording, and T04 provenance without material amendment. The leader independently verified these corrections before the peer check.

Kimi peer review: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3A881c3a5a-4104-4348-b984-07e869f909e9>

### Mistral: database/performance/privacy corrections

- Mistral Large 4 (`nvidia/mistralai/mistral-large-4-1t-a52b`, high) confirmed R02/R11/R12 against source and selected artifact anchors.
- Required retaining each order's fare-history viewer predicate while batching: admin, owning customer, or current driver with matching event driver and assignment timestamp. Leader checked `journey.ts:46–69` and incorporated the explicit predicate into R02.
- Added five capped eligibility configuration lists (`eligibility.ts:396–402`) as a source-confirmed P3 extension of R11; no new runtime fixture or enforcement bypass is claimed.
- Leader checked the admin query artifact and npm-audit metadata: 15 moderate, 1 low, no high/critical affected package entries. Mistral's broad security/persistence labels rely on leader evidence, not an independent rerun. Poll intervals were separately checked by Step and Kimi.
- The bounded review used 10 operations but took approximately 28.5 minutes. Its final source corrections are useful; that runtime is not a successful two-minute review benchmark.

Mistral: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3A4aadeda3-f92f-4566-8d28-9d4df127cf8d>

Sol's fresh four-read peer review accepted the three corrections. It additionally required retaining `validFareChange` and newest-event selection per order: neither a global limit nor searching backward for an older allowed event preserves behavior. The leader checked `journey.ts:59–66` and added this constraint. Sol also clarified that eligibility caps count versioned rows, not distinct active configurations, and the policy singleton is not a sixth list. No new runtime evidence was added.

Sol peer review: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3A2e672173-465e-4930-8518-31d26e2bf9d2>

### Mistral → Sol: booking peer challenge

- Accepted R01's replay-before-lock defect and PostgreSQL legacy-cap sibling, the outer-transaction/savepoint correction, and the requirement for a durable writer-fenced terminal release.
- Independently accepted R17 after tracing the quote/provider wait, session authentication/logout, command wrapper and schema. The caller was authenticated at request start; this is an in-flight revocation window, not anonymous booking. No runtime reproduction was claimed.
- Leader closed the peer's two remaining source questions: initial wrapper authentication (`main.ts:3149–3152`) precedes the provider wait; `dispatchOrBroadcast`/`newJobPush` (`main.ts:1109–1131,1454`) and `dispatch.startRound`/`issueNext` (`dispatch.ts:90–200`) contain no customer-session fence. Dispatch's driver-presence validation does not authorize the booking customer.
- Retained the fresh-session qualification: `authenticate`'s conditional hourly timestamp update can incidentally lock an older session; no unconditional fence protects a recently touched one. The report does not claim every logout interleaving succeeds.
- The original Mistral run completed in approximately 33.4 minutes, well over its two-minute target. Its final verdict is incorporated without changing the earlier runtime evidence or finding count.

Mistral peer review: <t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Abaa975c7-b576-4f15-a5e3-328499e833cb%3Adelegate-task%3Ae51fc887-2e1f-4d0c-852e-8410dda2765e>

## Model effort and scope

All four domain reviews and four fresh peer checks are complete and adjudicated. R17 remains source-confirmed by Sol, Mistral and leader, without runtime reproduction.

All fresh tasks use high effort. Mistral's discovered providers expose `high`, not `max`; high is the highest supported setting. The original prolonged Mistral audit was cancelled in favor of the bounded replacement. The earlier unrelated Step Docker output is excluded from evidence and its identified changes were narrowly reverted.

No additional broad test run was requested by these tasks. Lint, typechecks and full persistence evidence were already available; only a material unresolved claim warrants another targeted reproduction.
