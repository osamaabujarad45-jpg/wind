# Fastship (Wind): Part 2 research. Verification, cloud decision, and Uber-style feature plan

**Prepared:** 30 October 2026 · **Repo:** `master` at `65509bb`, clean · **Builds on:** `RESEARCH-2026-10-30-azure-aws-tracking-deploy.md` (Part 1). Where this part corrects Part 1, §2.2 says so.

**Scope:** research only. No cloud resource was created or changed. No command was run against your Azure or AWS accounts. Nothing was committed, pushed or deployed.

## 0. How to check each claim

| Level | Meaning | How to re-check |
|---|---|---|
| **A. Raw data** | Read from Azure's Retail Prices API, AWS's Price List files, or raw Microsoft Learn Markdown | Commands in §2.3 |
| **B. Public page, read through a fetch tool** | The tool returns a model-written summary of the page, so wording is paraphrased. Only facts that appeared in that summary are used | Open the page and find the fact before quoting it |
| **C. Repo** | A file in this repo, read in this session | `git show 65509bb:<path>` |
| **X. Not verified** | Listed in §7. Do not build on these | Verify first |

Part 1 used [W] for official-page checks and [R] for repo checks. Here, [W] is level A or B, and [R] is level C.

Rules applied in this part: quotation marks only where the exact wording came from raw text. Everything else is paraphrase. A citation is given only where the source was retained in this session. A fact that could not be tied to a source is marked X.

Two limits remain. The free-tier numbers are level B only. The Azure and AWS accounts have not been checked, because CLI folder access was denied (§5).

## 1. Decisions

1. **REA is not run against the Uber app.** REA's own disclaimer rules out copying proprietary software, tampering with online services, and bypassing authentication on systems you are not authorised to test. Decompiling Uber's app, intercepting its traffic, or extracting its private API calls falls under those. Public Uber material is used instead (§4). REA can be used on software you own or are authorised to test, such as your own Fastship builds for a security review.
2. **Cloud: Azure only, for the pilot.** §3.3 gives the conditions that would change this.
3. **Uber-style features: foundations first.** Realtime and resync come first, then dispatch with expiring offers, then the visible extras (§4.3).
4. **Infrastructure is designed, not proven.** `infra/main.bicep` is in the repo. I have not run a what-if or a deployment against your subscription, and I have not checked in this session that the template compiles.

## 2. Verification results and corrections

### 2.1 Raw and official results

**Azure, Israel Central** (Retail Prices API, level A)

| Meter | Price (USD) | Unit |
|---|---|---|
| Web PubSub, Standard Unit | 2.3023 | per unit-day |
| Web PubSub, Standard Message | 1.43 | per million |
| Container Apps, Standard Requests | 0.40 | per million |
| Container Apps, Standard vCPU Active | 0.000034 | per vCPU-second (= 0.1224 per vCPU-hour) |
| Container Apps, Standard Memory Active | 0.000004 | per GiB-second (= 0.0144 per GiB-hour) |
| Container Apps, Standard vCPU Idle | 0.000004 | per vCPU-second |
| PostgreSQL Flexible, B2s compute | 0.088 | per hour |
| PostgreSQL Flexible, Storage | 0.164 | per GiB-month |
| PostgreSQL Flexible, Backup Storage LRS | 0.105 | per GB-month |

**AWS** (Price List offer files, level A)

| Service | Israel (Tel Aviv) | US East (reference) |
|---|---|---|
| AppSync Events, operations | $1.00 per million | $1.00 per million |
| AppSync Events, connection-minutes | $0.08 per million | $0.08 per million |
| API Gateway WebSocket, messages | **$1.254 per million up to 1 billion a month; $1.034 above** | $1.00 per million (first 1 billion) |
| API Gateway WebSocket, connection-minutes | **$0.3135 per million** | $0.25 per million |
| Fargate, vCPU (Linux) | $0.0518144 per vCPU-hour | not checked |
| Fargate, memory | $0.0056896 per GB-hour | not checked |
| RDS PostgreSQL, db.t4g.micro / small / medium (Single-AZ) | $0.018 / $0.037 / $0.072 per hour | not checked |
| RDS PostgreSQL, gp3 storage | $0.153 per GB-month | not checked |

The vCPU and memory sizes of the RDS instances were not verified (X). The prices are therefore not a like-for-like performance comparison.

**Availability and gaps**

- AWS AppSync, API Gateway, ECS (Fargate) and RDS offer files list Israel (Tel Aviv). The region-specific ECS and RDS files for `il-central-1` downloaded in this session (A).
- AWS Location Service: its offer file has no price entries for Israel, UAE or Bahrain (A).
- AWS SNS: the offer file has no SMS entry for Palestine (+970) (A). That absence does not prove SMS to +970 is unavailable. It is X.
- Microsoft's Web PubSub billing page, raw Markdown (level A): each unit supports up to 1,000 concurrent connections. The free outbound quota is set per unit per day. Each replica is billed separately.

### 2.2 Corrections to Part 1

| Part 1 said | Corrected | Why it matters |
|---|---|---|
| Azure PostgreSQL B2s "about $58 a month", from earlier repo research | **$0.088 per hour in Israel Central, which is $64.24 for 730 hours.** Compute only (A) | The earlier figure was wrong. Storage and backup are extra |
| API Gateway WebSocket at $1.00 per million messages and $0.25 per million connection-minutes | Those were US East figures. **Israel is $1.254 per million messages up to 1 billion a month, and $0.3135 per million connection-minutes** (A) | A Tel Aviv deployment uses the Israel rates |
| AWS Location Service does not cover Palestine | Location has no price entries for Israel, UAE or Bahrain (A) | Location is not an option for the map in Israel |
| AWS RDS and Fargate prices not verified | Israel prices now verified (A). Instance specs still X | §3 uses the prices, with that caveat |

Part 1's scenario totals still hold, because they were built from raw rates. At 100 drivers sending 0.2 Hz with 30-day months, Web PubSub comes to about $100.30 a month and AppSync to about $104.03. Container Apps request charges come to about $20.74. These are scenarios, not forecasts (A, arithmetic).

### 2.3 How to reproduce the numbers

```bash
# Azure, Israel Central (no login needed)
curl -s "https://prices.azure.com/api/retail/prices?\$filter=serviceName eq 'Web PubSub' and armRegionName eq 'israelcentral'"
curl -s "https://prices.azure.com/api/retail/prices?\$filter=serviceName eq 'Azure Container Apps' and armRegionName eq 'israelcentral'"
curl -s "https://prices.azure.com/api/retail/prices?\$filter=serviceName eq 'Azure Database for PostgreSQL' and armRegionName eq 'israelcentral'"

# AWS, offer files (no login needed)
curl -s -O "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSAppSync/current/index.json"
curl -s -O "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonApiGateway/current/index.json"
curl -s -O "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/il-central-1/index.json"
curl -s -O "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/il-central-1/index.json"
```

The service names above returned data in this session. If a filter returns nothing, list the service names first. AppSync's service code is `AWSAppSync`. The code `AmazonAppSync` returned 404 in this session.

## 3. Cloud decision: Azure, AWS, or both

### 3.1 The evidence side by side

| Factor | Azure (Israel Central) | AWS (Israel, Tel Aviv) | Level |
|---|---|---|---|
| Availability zones | 3. No paired region | 3 | B (Part 1 §4) |
| Compute list rate | Container Apps active: $0.1224 per vCPU-hour and $0.0144 per GiB-hour, plus $0.40 per million requests | Fargate: $0.0518 per vCPU-hour and $0.0057 per GB-hour | A |
| Compute ratio | Azure active vCPU rate is about 2.4 times Fargate's. Memory is about 2.5 times | | A (arithmetic) |
| Compute caveat | The two services bill differently, and Container Apps has an idle rate. The ratio is a list-rate comparison, not a workload cost | | A |
| Postgres compute | B2s: $0.088 per hour | db.t4g.medium: $0.072 per hour. db.t4g.small: $0.037 per hour | A. Spec match X |
| Realtime | Web PubSub Standard: $2.3023 per unit-day and $1.43 per million messages. A daily free message quota applies per unit | AppSync Events: $1.00 per million operations. API Gateway WebSocket: $1.254 per million messages | A |
| React Native SDK | The Web PubSub SDK README checked covers Node.js and browsers. It does not mention React Native | Amplify has a React Native docs page, but its samples are web-style | B |
| Maps in Israel | Azure Maps: not checked in this part (X) | AWS Location: no Israel price entries | A |
| SMS to Palestine (+970) | **Not verified** (X) | **Not verified.** SNS offer file has no Palestine entry (A) | X |
| Infrastructure code | Bicep in the repo. Not run against a subscription | No AWS infrastructure code in the files read this session | C |
| Monthly cost difference for a pilot | **Not computed.** Part 1 §5 has realtime scenario totals only. Compute and idle costs need a measured workload | | X |

### 3.2 The three options

**Option 1: Azure only (recommended for the pilot).** For: the Bicep template is already in the repo, Web PubSub matches the realtime design, Israel Central has published prices and three zones, and there is one bill and one identity model. Against: Container Apps list rates are higher than Fargate's, and Israel Central has no paired region.

**Option 2: AWS only.** For: Fargate and RDS list prices per hour are lower, though instance specs are not matched (X). AppSync's realtime cost in Part 1's scenario ($104.03 a month) is close to Web PubSub's ($100.30). Tel Aviv has three zones. Against: the infrastructure code must be written from scratch. The React Native path for AppSync is less documented (B). API Gateway WebSocket messages cost more than AppSync operations (A). AWS Location has no Israel pricing (A).

**Option 3: both.** Not recommended. It means two bills, two identity systems, two monitoring setups, and traffic between clouds. Nothing in the verified material shows a capability that only one cloud provides for this app. This is an assessment, not a measured result.

### 3.3 Decision, and what would change it

**Decision: Option 1, Azure only, for the pilot.** The list-rate saving from AWS is real, but a rewrite of the infrastructure has not been costed. The quality-critical parts (realtime and the database) are already designed for Azure.

**Switch to Option 2 if any of these becomes true:**
- The Azure subscription cannot get Israel Central quota or Container Apps capacity.
- A measured workload shows compute cost high enough to justify a rewrite. The rewrite itself has not been costed.
- The realtime tests in §4.4 pass on AppSync and fail on Web PubSub.

**Production needs a paid commercial subscription.** Azure for Students is limited to education and non-commercial use (Part 1 §3, B). The AWS Free plan suspends at expiry, and data is erased after 90 days if the account is not upgraded (Part 1 §3, B). Neither credit funds a production service.

## 4. Uber-style features: what is public, and what Wind should build

### 4.1 Boundary

This section uses only public Uber and Careem material. Uber's internal dispatch, ETA and pricing models are not public, and they are not reproduced or modelled here. The repo's parity note also excludes copying them (C, `docs/implementation/uber-parity.md`).

### 4.2 Feature evidence and Wind's current state

| Feature | Public evidence (paraphrased unless marked) | Wind today | Gap to build |
|---|---|---|---|
| **Upfront price before requesting** | Uber's upfront-pricing help page (B) says the app shows an estimated price before a request. The estimate uses the trip's expected length and duration, and can change with demand and traffic. Whether it changes when the route changes is not stated (X) | The repo has quotes and `quoteId` (Part 1 §2). Whether the app sends `quoteId` and the server enforces it was not re-tested in this session (X) | Show the price with its validity time and the reason it can change. The server stays the only price authority |
| **Share trip with contacts** | Uber (B): a rider can share with up to five contacts. Recipients get a text with a link. The link shows the driver's first name, vehicle information, and the driver's real-time location on a map. Whether recipients need an account, and how long the link lasts, is not stated (X). Careem's help page (B) says to tap "Share details" to share ride details | A public track endpoint exists: `/api/track/:token/live` (C, `server/main.ts`). Whether it hides private pickup and drop-off points was not checked in this session (X) | Contact picker limited to five, text link, driver first name and vehicle. Keep the private-point rule, after checking it in code |
| **Check-in when something seems wrong** (RideCheck) | Uber newsroom, 17 Sep 2019, US launch (B). The system can detect a possible crash, an unusually long stop, or a trip that goes off course. It asks the rider and driver whether all is well, and offers an emergency button and a call to the Uber Safety Line. A safety team may follow up by phone. How crash detection works is not stated (X) | An SOS baseline exists (C, parity note). Automatic detection was not found in the files read (X) | Detect a long stop and a route deviation from live fixes, against the planned route. Thresholds need measurement on real trips. Crash detection needs a sensor design and is not in scope |
| **Live driver map and status** | Uber's share page shows real-time location (see above) | Long-poll updates up to every 12 seconds. A marker is hidden after 120 seconds without a fix (C, `server/main.ts`, `SPEC-live-map.md`) | Push fixes over Web PubSub. Resync from a snapshot after reconnect (§4.3, step 1) |
| **Phone privacy** | Uber blog, 19 Nov 2015 (B): rider and driver numbers are hidden, calls go through the app, the number may show as a landline, and the numbers used for calls and texts can differ | Not checked in the repo in this part (X) | A telephony provider. SMS and voice to +970 are unverified (X), so this is an owner gate |
| **Spatial indexing** | Uber blog, 27 Jun 2018 (B): H3 is an open-source grid system used for pricing and dispatch analysis | The parity note excludes H3 from v1 (C) | Keep excluded for the pilot. Revisit for demand maps after real data exists |

Careem's SOS button appears only in a 2020 news headline. It was not checked on Careem's site, so it is not used (X).

### 4.3 Build order

The parity note rates dispatch as the only ride blocker (C). It rates ETA and routing, realtime and push, and pricing and quotes as high-priority gaps (C). The features above depend on those, so the order follows the dependencies.

1. **Realtime fan-out and resync.** Publish each accepted fix to `order:<id>` on Web PubSub. After a reconnect, fetch a snapshot. The other tracking features depend on this.
2. **Dispatch with expiring offers, and a driver-to-pickup ETA.** Dispatch is the ride blocker in the parity note (C). The ETA and routing gap is rated high (C).
3. **Share trip with contacts** (up to five), showing the driver's first name and vehicle. Depends on step 1 and reuses the existing track link.
4. **Upfront price display with validity time.** Builds on the quote handling already in the repo.
5. **Check-in on long stops and route deviation.** Build after field data exists to set thresholds.
6. **Phone privacy through a telephony provider.** Gated on the SMS and voice decision (§6).
7. **H3 demand maps.** Later, after real data.

### 4.4 Physical-phone acceptance tests

These are recommendations from this review, not repo rules. Run each test on a physical Android phone. Each one also has a mutation check: deliberately break the behaviour and confirm the test fails.

- **Realtime:** toggle airplane mode, and switch from Wi-Fi to mobile data. The rider's view catches up after one snapshot request.
- **Dispatch:** an offer expires and moves to the next driver. A database constraint, not only the UI, prevents double assignment.
- **Share trip:** the link opens without an account and shows the driver's first name and vehicle. It never shows private points.
- **Upfront price:** the server rejects a changed quote, and the app shows the new price before the rider confirms.
- **Check-in:** on a planned test route, the check-in fires on a staged stop and does not fire during normal traffic stops. Thresholds are set from measurement.

### 4.5 Owner decisions this creates

The repo's v1 list excludes surge, H3, ML dispatch, cancel and wait fees, and drop-off photos (C, parity note). The features above need none of those. But the upfront price, share and check-in features are visible to riders, so the owner should confirm they fit the v1 product before they are built.

## 5. CLI check status

- **Azure:** the request for `C:\Users\osama\.azure` was refused twice by the automatic permission check. The first time, the dialog timed out before you answered. The second time, the check denied it. I have not tried any other route around that check, and I have not read the Azure CLI profile.
- **AWS:** `.aws` does not appear in the PC's home-folder listing. The AWS CLI profile may not exist, or the config may be stored elsewhere. This is not confirmed.

**To complete the check, either of these works:**

1. In the Claude desktop app, use "Add folder" to add `C:\Users\osama\.azure` to this session. This is the direct way to grant access.
2. Run these four commands in PowerShell and paste the output back. Do not include keys or tokens. `aws configure list` shows masked values only.
   - `az account show -o table`
   - `az account list -o table`
   - `aws sts get-caller-identity`
   - `aws configure list`

Please also confirm the offer name of the Azure subscription. The offer decides the terms. If it is not Azure for Students, Part 1's credit section needs revising.

## 6. Owner gates (new or changed since Part 1)

| # | Gate | Why |
|---|---|---|
| 1 | Confirm the Azure subscription type (commercial or student). Create a commercial pay-as-you-go subscription for production if needed | Student terms do not allow production service to paying customers (Part 1 §3, B) |
| 2 | Choose an SMS and voice provider that reaches Palestine (+970) | Not verified on Azure or AWS (§7) |
| 3 | Confirm the v1 product scope against §4.5 | Several requested features are visible to riders |
| 4 | Decide whether to keep the repo's exclusions (no surge, no H3, no cancel fees) | Listed as do-not-build in the parity note (C) |
| 5 | Provide CLI access (§5) | Subscription and offer are unverified |

Part 1's gates still apply: production host, launch scope, store declarations, backups, support channel, and payments.

## 7. Not verified: do not build on these

- Web PubSub free-tier limits (1 unit, 20 connections, 20,000 messages a day). Level B only.
- AppSync Events and API Gateway free-tier figures. Level B only.
- Container Apps SLA percentage. The page defers to Microsoft's SLA document.
- vCPU and memory specs of the B2s, t4g and t3 instances. Only prices were compared.
- Fargate load-balancer charges, and whether Fargate has any per-request charge.
- The active-to-idle split of Container Apps for a real workload. The rates are verified, but a monthly total is not.
- Multi-AZ prices for RDS and Azure PostgreSQL in Israel.
- SMS delivery to +970 on any provider, on either cloud.
- Whether API Gateway counts one server push as one message. Part 1 assumed one; this needs a test.
- Latency between Israel Central or Tel Aviv and users in Palestine. Not measured.
- Data residency and legal requirements for location data. Not researched.
- Whether Uber's RideCheck uses phone sensors for crash detection. The source does not say.
- RideCheck availability outside the 2019 US launch. Not checked.
- Careem's SOS button. Only a 2020 news headline was found.
- Whether Uber's upfront price changes when the route changes. The source does not say.
- Whether Uber share links need an account or expire. The source does not say.
- Whether the repo's trip-share link hides private pickup and drop-off points. Not checked in code.
- Whether the quote lock works end to end in the app. Not re-tested.
- Any Uber or Careem internal figure or model.

## 8. Sources

- Azure Retail Prices API, `prices.azure.com/api/retail/prices`, queried 30 Oct 2026 (A).
- AWS Price List offer files, `pricing.us-east-1.amazonaws.com/offers/v1.0/aws/...`, queried 30 Oct 2026 (A).
- Microsoft Learn, Web PubSub billing model, raw Markdown from `MicrosoftDocs/azure-docs` (A).
- Uber newsroom, RideCheck, 17 Sep 2019 (B).
- Uber blog, H3, 27 Jun 2018 (B).
- Uber blog, phone anonymisation, 19 Nov 2015 (B).
- Uber help pages on upfront pricing and sharing a trip (B). The page addresses were not kept in this session. Search for the page titles to find them.
- Careem help centre, sharing ride details (B). The page address was not kept.
- `github.com/morluto/rea`, DISCLAIMER file. Read from a clone. Not executed.
- Repo files, commit `65509bb` (C): `docs/implementation/uber-parity.md`, `server/main.ts`, `SPEC-live-map.md`, `infra/main.bicep`.

## 9. Next step

Once CLI access is granted or the four commands are pasted, the next pass will check the actual subscription and offer. It will then run an Azure what-if for `infra/main.bicep` against a dev resource group. That confirms whether the Israel Central SKUs deploy. Until then, the Azure infrastructure is designed but unproven.
