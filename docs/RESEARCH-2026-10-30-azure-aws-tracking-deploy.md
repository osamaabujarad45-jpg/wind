# Fastship (Wind): Azure and AWS research for live tracking and production deployment

> **Correction (30 Oct 2026, after a source audit):** three figures in this document are wrong and are corrected in `RESEARCH-2026-10-30-part2-verification-cloud-features.md` §2.2. Azure PostgreSQL B2s compute is $0.088 per hour in Israel Central (about $64.24 a month), not about $58. API Gateway WebSocket prices in §5.1 are US East figures; Israel is $1.254 per million messages (up to 1 billion a month) and $0.3135 per million connection-minutes. AWS Location Service has no price entries for Israel, UAE or Bahrain. Part 2 also replaces the Cloud decision in §1 with the verified option comparison and conditions.

**Prepared:** 30 October 2026 · **Repo state:** `master` at `65509bb` (30 Oct 2026, 04:53 +0200), working tree clean · **Audience:** Claude Opus 5.5 (implementation), and the owner for the decisions in §8.

**Scope:** research and plan only. No cloud resource was created or changed. No command was run against the owner's Azure or AWS accounts. Nothing was committed, pushed or deployed.

## 0. Rules used in this document

- **[W]** verified in this session against the official page listed in §11 (retrieved 30 Oct 2026).
- **[R]** verified in this repository, with the file and line given.
- **[X]** not verified. §10 lists these. Do not build on an [X] item until it is verified.
- Unlabelled arithmetic uses [W] prices and states its assumptions beside it. It is a scenario, not a quote.
- No Uber or Careem internal metric is used. None was verified.

## 1. Decisions (answer first)

1. **Do not run production on the two free credits.** [W] Azure for Students is limited to education, noncommercial research, and building, testing or demonstrating software for those purposes. Its $100 lasts 12 months. [W] The AWS Free plan is for experiments and proofs of concept for up to 6 months. When it ends without an upgrade, AWS suspends the account and erases its data after 90 days. Paying riders and drivers need commercial, paid billing on whichever cloud runs production. The credits fund development, load tests and benchmarks.
2. **Use one production cloud: Azure.** The infrastructure is already written in Bicep for Azure [R infra/main.bicep]. Azure has an Israel region with three zones [W]. Azure Web PubSub is priced there: $2.3023 per unit-day and $1.43 per million messages [W]. Two clouds would double identity, monitoring, infrastructure-as-code and egress paths. Nothing measured in this research favours AWS for production.
3. **Realtime tracking: Azure Web PubSub Standard, one hub, one group per order.** Microsoft's Web PubSub SDK README does not mention React Native [W], so the app needs a raw WebSocket client. Keep the existing HTTP long-poll as a fallback.
4. **Benchmark AWS AppSync Events only if the Azure client fails the physical-phone tests in §7.** At the pilot load in §5 the two realtime options cost about the same: about $100 and $104 a month. Price is not the reason to choose one.
5. **Keep MapLibre and OSRM for maps and routes.** [W] The AWS Location Service coverage page does not list Palestine. [R] The Azure Maps evidence is mixed and has no checkpoint semantics. Google stays a gated option.
6. **Replace the in-process fix waiters before running a second API replica.** [R server/main.ts:2376] says the waiters need shared pub/sub before several instances run. [R infra/main.bicep:372–373] caps API and worker at one replica.
7. **Most tracking quality comes from the phone and the rules, not the cloud.** Background permission, GPS cadence, reconnect behaviour and the stale-marker rule decide what the rider sees. Measure them on the physical Android phone (§7).
8. **Production is blocked by owner decisions, not code** (§8): which host serves users now, the launch scope, a commercial billing account, identity and SMS, store declarations, backups and a support channel.

## 2. The app today (from the repo)

### 2.1 Stack and state

- Expo `~57.0.31` and React Native `0.86.3` [R package.json]. AGENTS.md requires reading the matching SDK 57 docs before any Expo API change.
- The server is one Node process, `server/main.ts`, on SQLite (`node:sqlite`, WAL) for the built app [R docs/SYSTEM.md §1]. PostgreSQL migrations also exist [R server/db].
- Repo state: HEAD `65509bb`, clean [R git]. The CLAUDE.md pointer to the 21 Oct handoff is stale. The 27 Oct handoffs are newer [R docs/HANDOFF-2026-10-27-continue.md, docs/HANDOFF-2026-10-27-wp14-refund.md].

### 2.2 Tracking path today

| Step | What the code does | Evidence |
|---|---|---|
| Driver capture | Background location, `accuracy: High`, `timeInterval 3000 ms` | [R src/background-location.ts:109] |
| Driver send cadence | 5 s when moving (speed above 2.5 m/s and accuracy at or below 50 m), otherwise 15 s | [R src/location-delivery.ts:25–26] |
| Server intake | `POST /api/location` takes lat, lng, heading and accuracy (0–5000 m). A jump gate keeps the last plausible fix | [R server/main.ts:2301–2356] |
| Customer view | Long-poll `GET /api/orders/:id/live`, answers on a new fix or after 12 s | [R server/main.ts:1615, 2377] |
| Public track link | `GET /api/track/:token/live`, same long-poll | [R server/main.ts:1709] |
| Limits | 20 waiters per order and 200 in total, held in process memory | [R server/main.ts:2377–2378] |
| Staleness | Marker hidden after 120 s without a fix | [R SPEC-live-map.md, AC3] |
| Scaling | API, worker and OSRM all set `maxReplicas: 1` | [R infra/main.bicep:372–373, 399–400, 410] |
| Realtime service | Web PubSub `Standard_S1`, capacity 1, local auth disabled, Entra auth enabled. The live-tracking code paths do not use it | [R infra/main.bicep:300–306] |
| App permissions | `expo-location` with "when in use" and "always" text, iOS and Android background location, Android foreground service | [R app.json:40–46] |

### 2.3 Infrastructure already written

- `infra/main.bicep` (resource-group scope) defines a VNet, private DNS, PostgreSQL Flexible (default `Standard_B1ms`, Burstable), storage with private endpoints, Key Vault, Web PubSub, Container Registry, Log Analytics, Application Insights and a budget notification. Workloads are off by default (`enableWorkloads = false`), and ACS is off by default [R infra/main.bicep:8–51, 335–453].
- The repo test `tests/azure-infra.test.mjs` compiles, lints and builds the parameter files [R docs/implementation/azure-preparation.md; docs/HANDOFF-2026-10-27-continue.md].

### 2.4 Deployment state: sources disagree (owner must confirm)

- 21 and 27 Oct handoffs: production runs the old build on Railway, and Railway builds are paused [R docs/HANDOFF-2026-10-21-deploy.md; docs/HANDOFF-2026-10-27-continue.md].
- 29 Oct release readiness: the live web app and the Android build point to an Azure VM at `windapi236.swedencentral.cloudapp.azure.com` (Sweden Central). The candidate image is in `windprodacr.azurecr.io`. The same report says "Not ready for a public release" [R reports/release-readiness-2026-10-29.md].
- The same report found the VM has no OSRM URL, no Entra tenant, no SMS provider and no native-push setting, and runs `WIND_IDENTITY_MODE=self-service` [R same file].
- Recent commit subjects say Railway is superseded, for example `27246b3` [R git log].
- **Action:** confirm the production host before any migration decision.

### 2.5 Launch scope: sources disagree

- `docs/PRODUCT.md` (27 Sep) says the first release includes all three services: parcel, ride and large load [R].
- `tasks/plan.md` (29 Oct) says the default product is Arabic-first parcel delivery, and rides and freight are gated [R].
- The 29 Oct VM configuration enables `parcel,ride,freight` [R release readiness].
- **Action:** the owner chooses the launch scope. Ride and freight tracking depend on it.

### 2.6 Maps

- The current design is MapLibre on web, Apple Maps on iOS, MapLibre in a WebView on Android, and OSRM for routes [R reports/Google Maps integration for Fastship.md].
- The Google verdict is to keep MapLibre and OSRM, and to consider Google only behind a contract or an address-coverage failure [R same file].
- The task tracker still holds Google routing and renderer tasks T07–T12 [R tasks/todo.md]. The owner should close or gate them.

## 3. The credits, verified

| Term | Azure for Students | AWS Free plan (new accounts) |
|---|---|---|
| Amount | $100. The page does not name the currency [W] | $100 at sign-up. Up to $100 more by using eligible services such as EC2 and Bedrock. Up to $200 in total [W] |
| Duration | 12 months [W] | Ends at the earlier of 6 months after account opening or when credits run out [W] |
| Who qualifies | Full-time student at an accredited degree-granting institution, verified by institution email. One subscription per eligible customer [W] | New AWS customers only [W] |
| Permitted use | "support of education or teaching, noncommercial research, or efforts to design, develop, test, and demonstrate software applications for these purposes" [W] | The Free plan is for experiments and proofs of concept. The paid plan gives "full access to AWS services and features to build production applications" [W] |
| If it ends | Upgrade to pay-as-you-go to continue. Otherwise deployed products are decommissioned and the subscription is canceled. You have 90 days to upgrade [W] | Account and projects are suspended. Data is kept for 90 days, then the account is erased unless upgraded [W] |
| Service limits | Credit cannot be applied to Marketplace offers [W] | Free plan is limited to a subset of services. Credits apply to participating services [W] |
| Currency | Not stated on the page [W] | USD, applied automatically to the bill [W] |
| Expiry wording | Stated as 12 months or until the credit is used up [W] | Inconsistent across the page: the general FAQ says credits expire 6 months after account creation; a Free plan answer says 12 months after upgrading. The console Credits page is the authority [W] |

**Conclusions**

- On the plain wording of the Azure page, serving paying riders is not one of the listed purposes. Treat the student subscription as development and test only. This is a reading of the page, not legal advice.
- The AWS Free plan suspends at expiry. Upgrade to a paid plan before any production use on AWS.
- The two credits do not pool. Two $100 credits give $200 of build and test budget, spread across two clouds.
- The Azure Web PubSub Free tier (1 unit, 20 concurrent connections, 20,000 messages per day) [W] covers development at no cost.
- Azure budgets only notify. "Resources aren't affected, and your consumption isn't stopped" [W]. Put the hard limits in code: replica caps, request rate limits, fix cadence and log sampling.

## 4. Regions, verified

| Region | Availability zones | Paired region | Notes |
|---|---|---|---|
| Azure Israel Central | 3 [W] | None [W] | Location "Israel" [W]. Web PubSub and Container Apps have Israel Central prices [W] |
| Azure UAE North | 3 [W] | UAE Central, access-restricted [W] | |
| Azure Qatar Central | 3 [W] | None [W] | |
| Azure West Europe | 3 [W] | North Europe [W] | |
| Azure Sweden Central (current VM) | 3 [W] | Sweden South, access-restricted [W] | |
| AWS il-central-1 (Israel, Tel Aviv) | 3 [W] | Not applicable | Generally available 1 Aug 2023 [W]. Service availability not verified [X] |
| AWS me-central-1 (UAE) | 3 [W] | Not applicable | Opened 29 Aug 2022 [W]. Service availability not verified [X] |

**Consequences**

- Israel Central has no paired region, and Container Apps is single-region. "If the region becomes unavailable, your environment and apps are also unavailable" [W]. Any disaster-recovery region is a funded project.
- Latency from Ramallah, Nablus and Hebron to any of these regions has not been measured [X]. §7 measures it.
- Whether Israel-resident data is acceptable is a legal question for counsel [X].

## 5. Realtime tracking: options and arithmetic

### 5.1 Verified service facts

| | Azure Web PubSub (Standard) | AWS AppSync Events | AWS API Gateway WebSocket |
|---|---|---|---|
| Price | Israel Central: $2.3023 per unit-day; Standard message $1.43 per million [W, Azure Retail Prices API] | $1.00 per million event operations; $0.08 per million connection-minutes [W] | $1.00 per million messages; $0.25 per million connection-minutes, US East example [W] |
| Metering | Outbound, billed in 2 KB increments. The first 1,000,000 messages per unit per day are free [W] | Operations include published inbound messages, outbound broadcasts, handler invocations and WebSocket actions. Metered per 5 KB [W] | Not verified [X] |
| Capacity | 1,000 concurrent connections per unit; up to 100 units on Standard [W] | Not stated on the pricing page [X] | Not verified [X] |
| SLA | Standard 99.9%; Premium 99.95% [W] | Not verified [X] | Not verified [X] |
| Free tier | 1 unit, 20 connections, 20,000 messages per day [W] | 250,000 real-time updates and 600,000 connection-minutes per month for 12 months, new customers [W] | 1,000,000 messages and 750,000 connection-minutes per month for 12 months, new customers [W] |
| React Native | SDK README covers Node.js and browsers, with no React Native mention [W] | Amplify has a React Native docs page for AppSync Events. Its samples are web-style and need adapting [W] | Not verified [X] |
| Client connection | `wss://<service>.webpubsub.azure.com/client/hubs/<hub>?access_token=<token>`. The server issues the token with `userId`, `roles`, `groups` and `expirationTimeInMinutes` [W] | Not verified in this session [X] | Not verified [X] |

### 5.2 Scenario arithmetic (not a forecast)

**Assumptions:** 100 drivers active at once. Each sends one fix per cadence (0.2 Hz for the 5 s moving cadence, 0.1 Hz for 10 s). Each fix reaches one rider. Each fix is under 2 KB. 100 riders are connected all month. A 30-day month (2,592,000 s). Israel Central list prices [W]. No chat, status or other messages. Container Apps prices are list prices, before any included allowance, which was not checked [X].

| Line | 0.2 Hz (5 s) | 0.1 Hz (10 s) |
|---|---|---|
| Fixes per month | 51,840,000 | 25,920,000 |
| Web PubSub: units (1 × $2.3023 × 30) | $69.07 | $69.07 |
| Web PubSub: messages | Daily 1,728,000, so 728,000 above the free 1,000,000 a day. 21.84M billable × $1.43/M = **$31.23** | Daily 864,000, under the free allowance. **$0.00** |
| **Web PubSub total** | **$100.30** | **$69.07** |
| AppSync: operations (2 per fix: one publish, one delivery) × $1.00/M | $103.68 | $51.84 |
| AppSync: connection-minutes (4,320,000 × $0.08/M) | $0.35 | $0.35 |
| **AppSync total** (before any free tier; region not verified) | **$104.03** | **$52.19** |
| Container Apps requests if every fix is an HTTP request (× $0.40/M) | $20.74 | $10.37 |

**What the scenario shows**

- At the pilot scale both realtime options cost about $50–$105 a month. Neither price is decisive.
- Fix frequency is the lever. Halving the cadence cuts the AppSync meter in half. It removes the Web PubSub message charge entirely at this size, because the daily total falls under the free allowance.
- Re-run this table at 1,000 drivers before any purchase. Web PubSub units add 1,000,000 free messages per day each, so the break-even point moves with unit count.

**Decision rule**

- Build the realtime path on Azure Web PubSub. It is in the same cloud as the rest of the stack, and the Bicep already defines it.
- Keep AppSync Events as a time-boxed alternative. Switch only if the Azure client fails the §7 tests on the same phones and AppSync passes them, with its React Native integration cost counted.

## 6. Target architecture (Option A)

```
Driver app (Expo SDK 57)                         Rider, recipient and public track link
  GPS, background, permission-gated               HTTP snapshot on open and on reconnect
  POST /api/location (5 s moving / 15 s else)     Web PubSub WebSocket, token from the API
          │                                                ▲
          ▼                                                │ publish accepted fix to group order:<id>
  API on Azure Container Apps, Israel Central  ────────────┘
    • validates fix, jump gate, authorization
    • writes last fix and history to PostgreSQL (PostGIS)
    • issues client tokens: userId, groups [order:<id>], roles = join only, no send
    • long-poll kept as fallback
  PostgreSQL Flexible (system of record) · Blob (private proofs) · Key Vault + managed identity
  OSRM (routes, checkpoint detours) · MapLibre + OpenFreeMap (map tiles) · Application Insights
```

**Notes**

- The server SDK can issue a client token with `groups` to join on connect, and with `roles` that control operations such as joining groups and sending messages [W]. Grant only the join role, and never a send role, to riders and recipients.
- The API publishes accepted fixes to the group. This replaces the in-process `fixWaiters` map [R server/main.ts:2378], so replicas can scale.
- Azure is single-region in this design. A regional failure is an outage, and the DR decision is open (§8).
- Verify the exact server-side publish method names in the SDK docs before coding. They are not confirmed here [X].

## 7. Quality bars and the field test

No public Uber or Careem target is used, because none was verified. The bars below are **proposals** for the owner to confirm before the first run. They are not facts.

| Bar | Proposal | Source |
|---|---|---|
| Freshness | Show a "last updated" time. Hide the marker after 120 s without a fix | [R SPEC-live-map.md AC3] |
| Latency | p50 and p95 from the driver's device timestamp to the rider's screen render. Owner sets the threshold after a baseline run | Proposal |
| Reconnect | After airplane mode and a Wi-Fi-to-mobile handover, the rider view matches server state after one snapshot request | Proposal |
| No invented position | No marker animation without a new fix | [R product doc §6 rule 6] |
| GPS gate | Fixes above 50 m accuracy do not move the cadence to 5 s | [R src/location-delivery.ts:25–26] |

**Test rig**

- Physical Android phones only: `SM-A5360`, adb serial `R5CTB0FJP9Z` [R AGENTS.md]. No emulator.
- At least two phones: one driver and one rider.
- 20 trips on two West Bank routes, including one frequently closed checkpoint. Record the device timestamp, server receipt, viewer render and arrival time for each fix.
- Load test: 800 concurrent connections at the §5 fan-out rate. The k5 PC was refused over SSH on 29 Oct [R AGENTS.md]. A local run is a labelled fallback.
- Mutation tests: break the code on purpose and confirm the test fails before trusting it. This is the repo's practice [R docs/HANDOFF-2026-10-27-continue.md].

## 8. Owner gates before real users

| # | Gate | Why it matters | Owner action | Evidence to attach |
|---|---|---|---|---|
| 1 | Production host | Railway or Azure VM in Sweden Central (§2.4) | Confirm which host serves users | Dated statement and health check |
| 2 | Launch scope | Ride and freight tracking depend on it (§2.5) | Choose services | Signed scope |
| 3 | Commercial billing | Azure for Students and the AWS Free plan do not cover paying customers [W] | Fund a commercial subscription | Offer name in the portal |
| 4 | Israel Central SKUs | Only Web PubSub and Container Apps prices were checked for Israel Central [W] | Check each SKU (PostgreSQL, Key Vault, ACR, Blob) | Retail Prices API output |
| 5 | Data residency | Counsel question [X] | Decide the region | Written counsel note |
| 6 | Phone verification | ACS SMS has no Palestine destination [W]. Entra External ID's SMS is second-factor only [R earlier research, not re-verified] | Choose a local SMS provider or contract | Delivery test on three carriers |
| 7 | Email domain | Receipts and recovery. The Cloudflare sending domain is missing [R handoffs] | Onboard a domain | Test sends |
| 8 | Google Play background location | Requires one declared feature, an in-app disclosure before the permission prompt, a video of 30 s or less, and an active privacy-policy URL [W]. Delivery tracking for users is listed as usually foreground [W]. Driver background tracking needs a core-functionality case [W] | Decide: background driver tracking, or a foreground-only fallback | Play declaration approved, or the fallback shipped |
| 9 | Apple 5.1.5 and 5.1.1 | Location only when directly relevant. Notify and obtain consent. Offer a way to withdraw consent. Offer in-app account deletion [W]. The purpose strings are in `app.json` [R] | Check the consent flow and in-app deletion | Review notes |
| 10 | EAS build | `projectId` and production build numbers [R handoffs, release readiness] | Owner | EAS build IDs |
| 11 | Support channel | No monitored channel verified [R release readiness] | Name a monitored channel | Tested contact |
| 12 | Payments | PMA-licensed provider, merchant agreement and finance sign-off [R handoffs] | Owner | Signed agreements |
| 13 | Backups and restore | Container Apps has no built-in backup [W]. The Railway backup task failed [R release readiness] | Choose the database backup plan and run a restore drill | Restore log |
| 14 | Budgets | Budgets only notify [W] | Set caps in code and test the notification | Alert test |

## 9. Implementation plan for Claude Opus 5.5

**Repo rules to follow:** AGENTS.md (read SDK 57 docs before any Expo API change; use `npx expo install`; never edit `ios/` or `android/` by hand; no emulator). `tasks/HANDOFF.md` (at most five files per change; reproduce before fixing; record evidence in `tasks/evidence.md`). No commit, push or deploy without owner approval [R docs/HANDOFF-2026-10-27-continue.md].

**Phase 0: reconcile (no spend)**
- Owner confirms the production host (gate 1) and the launch scope (gate 2).
- Run the gate on `HEAD`: `npm test`, `npm run test:persistence` (on Windows, run it through `cmd /c`, per the 27 Oct handoff), `npx tsc --noEmit`, `npx expo lint`, `node tests/azure-infra.test.mjs`. Save each log.
- Acceptance: a reconciliation note in `docs/` with host, scope, `HEAD` and gate results.

**Phase 1: realtime client on a dev Web PubSub (Free tier)**
- Create a Free-tier Web PubSub instance in a dev resource group. Student subscriptions are for development and test only [W].
- API: a token endpoint that applies the same authorization as `GET /api/orders/:id/live`, then returns a client URL with `groups: ['order:<id>']` and a join-only role.
- App: a React Native WebSocket client with reconnect and backoff. Refresh the token before it expires. On reconnect, fetch the HTTP snapshot.
- Acceptance: on a physical phone, airplane-mode toggle and Wi-Fi-to-mobile switch both recover. An automated test shows customer A cannot obtain order B's group. Removing the authorization check makes that test fail.

**Phase 2: server fan-out**
- Publish each accepted fix to `order:<id>`, after the jump gate and before the response.
- Keep long-poll as the fallback. Remove the single-instance assumption [R server/main.ts:2376], so `maxReplicas` can exceed 1.
- Acceptance: two API instances in a local test both deliver to one subscriber. Existing suites stay green.

**Phase 3: time-boxed benchmark on Azure Standard**
- One Standard unit in Israel Central. Load 800 concurrent connections at the §5 fan-out rate. Record p50, p95 and errors.
- Run an AppSync Events spike only if this phase fails.
- Acceptance: a results file with exact commands, console output and dates.

**Phase 4: cost controls**
- Choose 5 s or 10 s cadence from §5 and the field results. Record the choice.
- Set replica caps and request rate limits. The repo already has rate limits [R server/main.ts].
- Configure budget notifications and test them.

**Phase 5: deployment readiness**
- Close or explicitly accept each §8 gate.
- Restore-drill the chosen database.
- Run a supervised physical-device pilot. No live orders without owner approval [R tasks/HANDOFF.md, AGENTS.md].
- The owner writes the go or no-go decision.

## 10. Not verified or excluded: do not build on these

- The Azure Container Apps 99.95% SLA. The page defers to the SLA document, and the figure was not confirmed [W].
- The Azure PostgreSQL Flexible B2s price (about $58 a month in earlier repo research) [X]. The price retrieval was incomplete.
- Any user-to-region latency figure [X].
- Whether AWS il-central-1 and me-central-1 offer AppSync, API Gateway WebSocket, ECS, RDS or Location [X]. The regional matrix did not render.
- The AWS credit expiry date. The FAQ is inconsistent [W]. It also refers to "the new sign-up experience in October 2026", which conflicts with the July 2025 announcement [W].
- The AWS Free plan's service list [X].
- AppSync Events and API Gateway WebSocket SLAs, capacity, regions and auth model [X].
- Whether Amplify's AppSync Events works in production on React Native [X].
- AWS Location Service and Palestine. Palestine is absent from the coverage page [W]. That is an absence, not a confirmed "not supported" statement.
- Azure Maps and Palestine. The Microsoft pages conflict, and the earlier live test is repo evidence [R research_notes/Azure stack evidence review/azure_maps_live_test.md]. It was not re-tested here [X].
- Entra External ID's SMS rules and +970 behaviour [R earlier research, not re-verified].
- Azure Communication Services Messaging Connect, a preview with Infobip [X].
- Cognito, SES, Resend, Brevo, Postmark and AWS RDS prices in repo research [R; not re-verified].
- Any +970 SMS delivery by any provider [X].
- The Azure and Palestine legal and data-residency position [X].
- Expo SDK 57 background-location APIs. Read the v57 docs before implementation [X].
- Any Uber or Careem internal figure [X].

## 11. Sources and evidence

**Web (retrieved 30 Oct 2026)**

- [Azure for Students FAQ](https://learn.microsoft.com/en-us/azure/education-hub/faq). The page says it was last updated 31 Jul 2025.
- [AWS Free Tier credits announcement](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/). Posted 16 Jul 2025.
- [AWS Free Tier FAQs](https://aws.amazon.com/free/faqs/).
- [AWS API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/).
- [AWS AppSync pricing](https://aws.amazon.com/appsync/pricing/).
- [Amplify, AppSync Events for React Native](https://docs.amplify.aws/react-native/build-a-backend/data/connect-event-api/).
- [AWS Location Service data quality and coverage](https://docs.aws.amazon.com/location/latest/developerguide/data-quality.html).
- [AWS Israel (Tel Aviv) region announcement](https://aws.amazon.com/blogs/aws/now-open-aws-israel-tel-aviv-region). Dated 1 Aug 2023.
- [AWS UAE region announcement](https://aws.amazon.com/blogs/aws/now-open-aws-region-in-the-united-arab-emirates-uae/). Dated 29 Aug 2022.
- [Azure region list](https://learn.microsoft.com/en-us/azure/reliability/regions-list). The page says it was last updated 13 Oct 2026.
- [Azure Web PubSub billing model](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-billing-model).
- [Azure Web PubSub pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/). Used for the SLA and unit limits. The Standard price did not render on this page.
- [Azure Web PubSub client access URL](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/howto-generate-client-access-url).
- [Web PubSub client SDK README](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/web-pubsub/web-pubsub-client/README.md).
- Azure Retail Prices API, filtered by `serviceName` and `armRegionName`:
  - Web PubSub, `israelcentral`: 6 items returned.
  - Azure Container Apps, `israelcentral`: 16 items returned.
  - PostgreSQL, `israelcentral`, B2s: not isolated, so not used.
- [Azure Communication Services SMS](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/concepts). The page says it was last updated 23 Sep 2026.
- [Azure Container Apps reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps).
- [Azure budgets tutorial](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets). The page says it was last updated 26 Jun 2025.
- [Google Play background location policy](https://support.google.com/googleplay/android-developer/answer/9799150).
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), sections 5.1.1 and 5.1.5.

**Repository (commit `65509bb`)**

- `package.json`, `app.json`, `AGENTS.md`, `tasks/HANDOFF.md`, `tasks/plan.md`, `tasks/todo.md`.
- `server/main.ts` lines 1615, 1709, 2301–2356, 2368–2405, 3146.
- `src/background-location.ts:109`, `src/location-delivery.ts:25–26`.
- `infra/main.bicep` lines 8–51, 300–306, 335–453 and the replica settings at 372–373, 399–400, 410.
- `SPEC-live-map.md`, `docs/PRODUCT.md`, `docs/SYSTEM.md`.
- `docs/HANDOFF-2026-10-21-deploy.md`, `docs/HANDOFF-2026-10-27-continue.md`, `docs/HANDOFF-2026-10-27-wp14-refund.md`.
- `reports/release-readiness-2026-10-29.md`, `reports/Google Maps integration for Fastship.md`, `reports/azure-entra-uber-review-2026-10-28.md`.

**Device check**

- The `.azure` folder exists on the PC. It is a credential folder. Only its names were listed. Access was not granted, so the profile was not read and no token file was opened.
- `.aws` is not in the PC's home directory listing. This suggests the default AWS CLI profile does not exist. It is not confirmed.

## 12. CLI and credit check: owner action

Run these in PowerShell and paste the output back. Do not include keys or tokens.

- `az account show -o table`
- `az account list -o table`
- `aws sts get-caller-identity`
- `aws configure list`

Then:

- In the Azure portal, open the subscription and note its offer name. If it is not Azure for Students, §3 changes.
- In Cost Management + Billing, open Credits and note the balance and expiry.
- In the AWS console, open Billing and Cost Management, then Credits. Note the Free plan expiry.

With those results, the subscription name, state, default account, offer and credit balance can be confirmed. Until then the CLI state and credit balances are **unverified**.
