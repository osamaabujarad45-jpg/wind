# Azure realtime, data and hosting stack for a Palestine ride-hailing backend (October 2026)

**Scope.** Live driver tracking, dispatch fan-out, in-trip chat and notifications at Uber-like quality; what to adopt, at what cost and limits; what must be proven before cutover. No code was modified.

**Access date.** Every URL below was retrieved on **2026-10-29** in a single research session. Where a Microsoft page carries its own `ms.date`/`updated_at`, that date is quoted too, because some pricing/limits pages lag the product.

**Evidence labels used throughout:**
- **[D] documented** — stated on a Microsoft Learn / azure.microsoft.com page.
- **[O] observed** — read from a live API (Azure Retail Prices API), a public repo, or this codebase.
- **[U] unverified** — inference, third-party measurement, or a claim I could not confirm from a primary source.

**Baseline in this repo [O].**
- `server/main.ts:2168` — `LIVE_HOLD = 12_000, LIVE_WATCHERS = 20, LIVE_TOTAL = 200`; in-process `fixWaiters` map of promise resolvers.
- `server/main.ts:2167` — the code's own comment: "in-process waiters, one API process; several instances need shared pub/sub (e.g. Redis) here."
- `railway.json` — `numReplicas: 1`.
- `infra/main.bicep:278-284` — already provisions `Microsoft.SignalRService/webPubSub` `Standard_S1`, `capacity: 1`, `disableLocalAuth: true`, `disableAadAuth: false` (AAD-only).
- `infra/main.bicep:320-323` — API container `minReplicas: 1, maxReplicas: 1`, 0.5 vCPU / 1 GiB.

---

## 1. Azure Web PubSub: SDKs, auth, limits, size, price, SLA, React Native

### Takeaway
Web PubSub is a raw-WebSocket pub/sub service that maps almost one-to-one onto the current `fixWaiters` design: one group per order, one connection per viewer, 1 MB frames, and a server-issued short-lived token instead of a shared secret. The hard planning numbers are **1,000 concurrent connections per unit** and **2 GB outbound per unit per day included**; at a 80 % utilisation rule that is **800 connections per unit**. There is **no supported React Native client SDK** — Microsoft's own position is that a React Native app should speak raw WebSocket and fetch a token from your server.

### Cited Findings
**[D] Capacity and billing**
- Each unit supports up to **1,000 concurrent connections**; an instance can have 1, 2, 5, 10, 20, 50 or 100 units (the scaling article also lists 3–9 and 20–100 in tens). — [Billing model of Azure Web PubSub](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-billing-model)
- Included outbound quota is **1,000,000 messages (2,000,000 KB) per unit per day**; messages over 2 KB count as multiple 2 KB messages, and **messages under 2 KB are accumulated**, so billing is effectively per 2 KB of outbound traffic, not per frame. — [Billing model](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-billing-model); [Pricing page FAQ](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/)
- Free tier: 20 connections, 20,000 messages/unit/day, max 1 unit. Standard: 1,000 conns/unit, 1M messages then metered, max 100 units, **SLA 99.9 %**. Premium: same 1,000 conns/unit, max 1,000 units (P1 1–100, P2 100–1,000), **SLA 99.95 %**, AZ support, autoscale, geo-replication. — [Pricing page](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/)
- Manual scale steps are 1–10, then 20…100; **Premium_P2** goes 100–1,000 units (up to 1 M connections); default soft quota is **150 units per subscription per region**. — [Scale an instance](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/howto-scale-manual-scale)
- Docs recommend planning for **no more than 80 % unit utilisation** before scaling out. — [Billing model](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-billing-model)

**[D] Message size and protocol**
- Messages (text, binary or JSON) have a **maximum size of 1 MB**; the maximum allowed message size for one WebSocket frame is 1 MB. — [Key concepts](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/key-concepts); [Service internals](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-service-internals)
- Optional subprotocol `json.webpubsub.azure.v1` lets clients join/leave groups and publish directly, with per-group roles such as `webpubsub.joinLeaveGroup.<group>` and wildcard patterns (`webpubsub.sendToGroups.clientA.**`, max five `*` per pattern). — [Wildcard group roles](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-wildcard-group-roles)

**[D] Auth model**
- Clients connect to a **Client Access URL**: `wss://<name>.webpubsub.azure.com/client/hubs/<hub>?access_token=…`, generated server-side by `WebPubSubServiceClient.getClientAccessToken({ userId, roles, groups, expirationTimeInMinutes })`. Never ship the connection string to the app. — [Generate client access URL](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/howto-generate-client-access-url); [JS client SDK reference](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/reference-client-sdk-javascript)
- Server side can authenticate with **Microsoft Entra ID / managed identity** (`new WebPubSubServiceClient(endpoint, new DefaultAzureCredential(), hub)`); the identity needs **both** `Microsoft.SignalRService/WebPubSub/clientConnection/generateToken/action` and `…/clientConnection/write`, which only the broad "Web PubSub Service Owner" built-in role grants — a custom role is required for least privilege. — [Authorize from a managed identity](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/howto-authorize-from-managed-identity); [Use Azure Identity with WebPubSubServiceClient](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/howto-use-azure-identity)
- A token can carry `userId`, `groups` (joined on connect) and `roles`; group-scoped roles are the correct way to scope a rider to their own order group. — [GenerateClientTokenOptions](https://learn.microsoft.com/en-us/javascript/api/@azure/web-pubsub/generateclienttokenoptions?view=azure-node-latest)

**[D]/[O] React Native**
- The JS client SDK (`@azure/web-pubsub-client`) is documented for **Node.js** and browsers ("Currently supported environments: LTS versions of Node.js"); Metro fails on its `events`/`ws` requires. — [SDK README](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/web-pubsub/web-pubsub-client/README.md); [issue #26400 "Web PubSub Client doesn't support React Native"](https://github.com/Azure/azure-sdk-for-js/issues/26400) (opened 2023-07-05, auto-closed as stale 2025-07-04 without a fix)
- Microsoft's maintainer position: "Since the React Native app is a pure WebSocket client, there is no need for it to use the `@azure/web-pubsub` package, just use the `ws` package… The common way … is … a `/negotiate` API on the server to generate the token." A later answer corrects that React Native should use the **native `WebSocket` object**, not `ws`. — [azure-webpubsub issue #445](https://github.com/Azure/azure-webpubsub/issues/445); [StackOverflow answer](https://stackoverflow.com/questions/73055397/how-to-use-azure-pubsub-in-react-native)
- The service itself is protocol-level WebSocket; Microsoft lists Blazor, React, Vue, Unity and "major app development platforms" as supported, with no dedicated RN SDK. — [Samples: platforms and frameworks](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/samples-platforms-and-frameworks)

**[O] Price, Israel Central vs neighbours** (Azure Retail Prices API, `priceType eq 'Consumption'`, queried 2026-10-29; query shape `https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Web%20PubSub'`)

| Region | Standard unit | Standard message | Premium unit | Premium message |
|---|---|---|---|---|
| Israel Central (`israelcentral`) | **$2.30/day** | **$1.43/M** | $2.86/day | $1.43/M |
| UAE North (`uaenorth`) | $1.61/day | $1.00/M | $2.00/day | $1.00/M |
| West Europe (`westeurope`) | $1.61/day | $1.00/M | $2.00/day | $1.00/M |
| Qatar Central (`qatarcentral`) | $1.61/day | $1.00/M | $2.00/day | $1.00/M |

- Israel Central carries a **~43 % premium** on both the unit-day and the per-million-message meter versus UAE North / West Europe / Qatar. The same premium applies to Azure SignalR (see §2), which points to a regional price tier rather than a service-specific one. — [Retail Prices API](https://prices.azure.com/api/retail/prices) [O]
- Presence of a meter for a region is evidence the service is sold there; it is not the same as the "products by region" page. I did not load that page successfully (JS-rendered table), so **Israel Central availability is [O] from pricing, not [D] from the availability matrix** — see Gaps.

**[D] SLA and reliability features**
- Standard 99.9 %, Premium 99.95 %; Premium adds availability-zone support, Azure Monitor autoscale, custom domain and **geo-replication**; a single resource scales to 1,000,000 concurrent WebSocket connections. — [Pricing page](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/); [Reliability in Web PubSub](https://learn.microsoft.com/en-us/azure/reliability/reliability-web-pubsub); [Overview](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/overview)
- Autoscale is **Premium only**, reacts in ~3–5 minutes, and Microsoft advises ≥30 minutes between autoscale operations. — [Autoscale Web PubSub](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/howto-scale-autoscale)

### Inferences
- The 200-watcher cap in `server/main.ts` exists because of process-local waiter slots, not because of a protocol limit. One Standard unit (1,000 connections) replaces it at **$2.30/day**; the design change is a group per order plus a token endpoint, not a rewrite.
- Because billing is per 2 KB of outbound, a 150–250 byte fix is roughly **1/10th of a billable message**. Message-count intuition ("25 fixes/s × 86,400 = 2.16 M messages/day, so 3 units") overstates cost by ~10×; the byte-based model is the one to plan with.
- Three concurrent viewers per order (rider, driver, support) puts 10,000 drivers + 30,000 viewers at 40,000 connections → **50 units at the 80 % rule** ($115/day). Fan-out to one group per order, with only the rider and driver joined, is the cost-control lever.
- 1 MB frames mean a driver could push a compressed fix batch or a short chat image without a separate upload path; it does not mean you should — Blob + a URL keeps the realtime path cheap.

### Gaps
- No Microsoft page states "Web PubSub is available in Israel Central"; I inferred it from live pricing meters. Confirm with `az provider show`/the products-by-region table before committing.
- No documented p95 end-to-end latency for Web PubSub, and no documented reconnect/backoff behaviour for raw RN WebSocket clients. Both need measurement (§8).
- I found no first-party React Native sample or support statement for Web PubSub beyond the two GitHub threads above.

---

## 2. Azure SignalR Service vs Web PubSub for one-way fix push plus chat

### Takeaway
SignalR and Web PubSub have **identical capacity economics** (1,000 connections/unit, 1 M messages/unit/day, 99.9 %/99.95 % SLA) and, in Israel Central, identical prices. The choice is therefore purely operational: SignalR gives you a hub contract, automatic reconnect and a mature .NET/ASP.NET story; Web PubSub gives you raw WebSocket, a JS-first server SDK, MQTT, and no dependency on the SignalR protocol. For a Node/Expo stack with no .NET, **Web PubSub is the better fit**; SignalR only wins if the team standardises on ASP.NET Core.

### Cited Findings
**[D] Identical tier structure**
- SignalR: Free 20 conns / 20 k msgs; Standard 1,000 conns/unit, 1 M msgs/unit/day then metered, max 100 units, SLA 99.9 %; Premium 1,000 conns/unit, max 1,000 units, SLA 99.95 %, AZ support, autoscale, geo-replication. — [SignalR pricing](https://azure.microsoft.com/en-us/pricing/details/signalr-service/)
- Subscription limits mirror Web PubSub: 1,000 concurrent connections per unit (Standard/Premium), 1,000,000 included messages per unit per day, 150 total units per subscription per region (soft). — [Azure subscription and service limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits)

**[D] Where SignalR differs technically**
- Billing counts **outbound messages only**, messages >2 KB count as multiple 2 KB messages, and **server connections count against the quota**: each app server opens **five initial connections per hub**. Two API replicas × 3 hubs = 30 server connections before a single user connects. — [Messages and connections in SignalR](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-concept-messages-and-connections)
- Message sizes: client messages ≤1 MB over long-poll/SSE, **no size limit over WebSocket**; server messages have no hard limit but <16 MB is recommended; serverless REST is 1 MB body / 16 KB headers; messages are split into 2 KB frames on the wire. — [Messages and connections](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-concept-messages-and-connections)
- Serverless mode exists (REST + management SDK) but is constrained (1 MB request body, 16 KB headers). — same page.

**[D]/[O] Client support**
- The `@microsoft/signalr` JavaScript client is not documented as React Native-supported; there is an **open** issue "Does @microsoft/signalr support react-native?" (dotnet/aspnetcore #60606, opened 2025-02-25, still open 2025-08-18). — [dotnet/aspnetcore#60606](https://github.com/dotnet/aspnetcore/issues/60606)
- RN failures are recurring and polyfill-dependent: `URL.pathname not implemented` on v8 (fixed by `react-native-url-polyfill`), `document is not defined`, and WebSocket-vs-long-polling mismatches. — [dotnet/aspnetcore#52071](https://github.com/dotnet/aspnetcore/issues/52071); [dotnet/aspnetcore#38286](https://github.com/dotnet/aspnetcore/issues/38286)

**[O] Price, Israel Central** (same Retail API query as §1)

| Region | SignalR Standard unit | SignalR Standard message | SignalR Premium unit |
|---|---|---|---|
| Israel Central | **$2.30/day** | **$1.43/M** | $2.86/day |
| UAE North / West Europe / Qatar Central | $1.61/day | $1.00/M | $2.00/day |

- SignalR prices in Israel Central are **identical to Web PubSub's**, confirming a regional price tier rather than a product difference. — [Retail Prices API](https://prices.azure.com/api/retail/prices) [O]

### Inferences
- At equal price and equal connection limits, SignalR's five-server-connections-per-hub overhead is pure loss for this workload: it consumes quota that riders and drivers need, and it grows with replica count — exactly the axis you scale on.
- SignalR's advantage (automatic reconnect, hub methods, strongly-typed contract) matters most when you also own the server in .NET. Here the server is Node/TypeScript (`server/main.ts`), so you would be using the SignalR management/negotiate path without the ASP.NET hub machinery — the worst of both.
- Web PubSub's group model (`order:<id>`) is the direct equivalent of `fixWaiters` keyed by order id, and its `userId` claim lets one driver hold several devices without duplicate delivery logic.
- Decision: **Web PubSub for both fix push and chat**; one hub, groups `order:<id>`, `user:<id>` for direct messages, roles scoped per group. SignalR should be revisited only if the backend moves to ASP.NET Core.

### Gaps
- No first-party statement that SignalR is unsupported on React Native — only an open issue and a pattern of polyfill workarounds. Treat "unsupported" as [U] and "works only with polyfills" as [O].
- No documented head-to-head latency or throughput benchmark between the two services for small-message fan-out; the performance guides give bandwidth formulas, not comparative p95.

---

## 3. Event Hubs / Kafka: warranted for location ingestion, overkill for fan-out

### Takeaway
Event Hubs is a durable, partitioned **log**, not a push channel to phones — it cannot replace Web PubSub for the live map. It becomes warranted when location data needs **replay, more than one consumer, or retention longer than you want in Postgres**, and it is the correct answer to the write-amplification problem: 10,000 drivers at 0.25 Hz is **2,500 rows/s**, which no Burstable Postgres will absorb. The cost driver is **events per second, not bytes**: one TU admits 1 MB/s *or* 1,000 events/s, whichever binds first.

### Cited Findings
**[D] Throughput, retention, partitions**
- Throughput per TU (Basic and Standard): **ingress 1 MB/s or 1,000 events/s; egress 2 MB/s or 4,096 events/s**. — [Event Hubs quotas](https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-quotas) (page `ms.date` 2026-02-05)
- Maximum event size: **256 KB Basic, 1 MB Standard/Premium, 20 MB Dedicated**; retention **1 day Basic, 7 days Standard, 90 days Premium/Dedicated**; partitions **32 Standard, 100/PU Premium, 1,024 Dedicated**; **20 consumer groups** per hub on Standard, 1,000 Kafka consumer groups per namespace. — same page.
- Standard supports **Capture** (priced per hour) and **Kafka** (1,000 Kafka consumer groups per namespace); geo-DR on Standard, geo-replication on Premium only. — same page.
- Event storage for retention is **84 GB per TU** on Basic/Standard. — same page.

**[O] Price, Israel Central** (Retail API, 2026-10-29)

| Meter | Israel Central | UAE North | West Europe |
|---|---|---|---|
| Standard Throughput Unit | **$0.04/hr** (≈$29.2/mo) | $0.04/hr | $0.03/hr |
| Standard Ingress Events | **$0.04/M** | $0.04/M | $0.03/M |
| Standard Capture | $0.13/hr | $0.13/hr | $0.10/hr |
| Standard Kafka Endpoint | $0.09/hr | $0.09/hr | $0.09/hr |
| Premium Processing Unit | $1.47/hr | $1.47/hr | $1.34/hr |
| Dedicated Capacity Unit | $8.50/hr | $8.50/hr | $6.85/hr |

**[O] Workload arithmetic**
- 1,000 drivers × 1 fix / 4 s = **250 events/s**, ~50 KB/s → **1 TU**, because the event-rate limit (1,000/s) binds long before the byte limit.
- 10,000 drivers × 1 fix / 4 s = **2,500 events/s**, ~500 KB/s → **3 TUs** (event-rate bound), $87.6/mo at Israel Central rates, plus $0.04/M ingress events.
- The same 2,500 events/s written synchronously to Postgres is 2,500 INSERTs/s — two orders of magnitude beyond a Burstable B1ms (35 user connections, §5).

### Inferences
- Event Hubs is **overkill for dispatch fan-out** and does not solve the live-map problem at all: consumers would still need Web PubSub (or equivalent) to reach devices.
- It is **justified** the moment you want (a) an immutable trip trace for disputes/safety, (b) a second consumer (ETA model, surge pricing, fraud), or (c) to keep the OLTP database off the GPS write path. The cheapest defensible shape is: driver → API → Event Hubs (1–3 TUs) → Capture to Blob for history; the API writes only the latest fix to Postgres.
- Because Capture writes to Blob, retention in Event Hubs can stay at the 1–7 day minimum while history lives cheaply in Blob (§8 pricing).
- Kafka compatibility removes vendor lock-in at the client level but adds a $0.09/hr endpoint charge; for a Node backend the native SDK is simpler.

### Gaps
- No documented end-to-end ingest latency for Event Hubs (only throughput quotas); "sub-second" is an assumption, not a citation.
- I did not verify whether Israel Central supports Capture, geo-DR, or the Kafka endpoint beyond the presence of their price meters. Price presence is [O], feature availability is [U].

---

## 4. Azure Container Apps: revisions, scale, WebSocket, SLA, cold start, regions

### Takeaway
Container Apps is a credible host for this API **if the app becomes stateless**: it supports WebSocket ingress, scale-to-zero, KEDA/HTTP/TCP scale rules and managed identity, and the SLA is **99.95 %**. It cannot host SQLite as a system of record — local storage is ephemeral and lost on restart or replica move — and the current single-replica, in-process waiter design must become a shared pub/sub channel before `maxReplicas` can go above 1.

### Cited Findings
**[D] Ingress and WebSocket**
- HTTP ingress supports **HTTP/1.1 and HTTP/2, WebSocket and gRPC**, TLS 1.2/1.3 termination, and a **request timeout of 240 seconds**. — [Ingress in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview) (page `ms.date` 2026-10-22)
- The 4-minute idle timeout is the default and **not configurable in the default ingress mode**; premium ingress mode raises it to 4–30 minutes and adds a termination grace period up to 3,600 s. — [Ingress environment configuration](https://learn.microsoft.com/en-us/azure/container-apps/ingress-environment-configuration); [azure-container-apps#597](https://github.com/microsoft/azure-container-apps/issues/597)
- WebSocket requires the ingress `transport` to be HTTP/1.1; `http2` upstream breaks the Upgrade handshake. `auto` behaves as `http` per the product team. — [azure-container-apps#280](https://github.com/microsoft/azure-container-apps/issues/280)

**[D] Scaling**
- Rules are **HTTP (concurrent requests), TCP (concurrent connections) or custom (any KEDA scaler: Service Bus, Event Hubs, Kafka, Redis, CPU, memory)**; min replicas 0, max 1,000 per revision. — [Scaling in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/scale-app) (page `ms.date` 2026-05-19)
- Scale behaviour: **polling 30 s, cool-down 300 s, scale-up stabilisation 0 s, scale-down stabilisation 300 s, scale-up step 1→4→8→16→32**. HTTP concurrency is computed as requests in the last 15 s ÷ 15. — same page.
- Scale rules can authenticate with **Container Apps secrets or managed identity**; Azure Queue/Service Bus/Event Hubs scalers support identity. — same page.
- Revisions are immutable snapshots; adding or editing a scale rule creates a new revision; single-revision mode is required for non-HTTP event rules. — [Scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app); [Revisions](https://learn.microsoft.com/en-us/azure/container-apps/revisions)

**[D] State, SLA, regions**
- Container Apps is **stateless by design**: "Any data that your app stores in ephemeral storage … is deleted when the container or replica is shut down"; there is **no built-in backup**, and local file systems are ephemeral. — [Reliability in Azure Container Apps](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps) (page `ms.date` 2025-10-23)
- Container Apps is a **single-region service**: if the region is unavailable, the environment and apps are unavailable; multi-region requires you to deploy per region plus Front Door/Traffic Manager and your own data replication. — same page.
- Zone redundancy must be enabled **at environment creation**, requires a VNet, and needs **≥2 replicas (3 recommended)** to matter; there is no extra charge. — same page.
- SLA: **99.95 % monthly uptime**, credits 10 % below 99.95 %, 25 % below 99 %, 100 % below 95 %; no SLA on the free tier. — [SLA for Azure Container Apps v1.0](https://www.azure.cn/en-us/support/sla/container-apps/v1_0/) *(Azure China mirror of the same SLA text; the global SLA page is behind `aka.ms/CSLA`)*
- Zone redundancy does **not** raise the SLA number. — [Reliability in Container Apps (AZ tab)](https://learn.microsoft.com/en-us/azure/reliability/reliability-azure-container-apps?tabs=azure-cli)

**[O] Price, Israel Central** (Retail API, 2026-10-29)

| Meter | Israel Central | UAE North | West Europe |
|---|---|---|---|
| Standard vCPU active | **$0.000034/s** | $0.000024/s | $0.000034/s |
| Standard memory active | **$0.000004/GiB-s** | $0.000003/GiB-s | $0.000004/GiB-s |
| Standard requests | **$0.40/M** | $0.40/M | $0.56/M |
| Environment management | $0.14/hr | $0.14/hr | $0.14/hr |

- Observed monthly cost of one always-on 0.5 vCPU / 1 GiB replica in Israel Central: `(0.5 × 0.000034 + 1 × 0.000004) × 86,400 × 30.4` ≈ **$55/month**. — arithmetic on the meters above [O]

### Inferences
- The 240 s HTTP request timeout is irrelevant to a WebSocket connection (the connection is long-lived, not an idle request), but it **is** relevant to the current 12 s long-poll: it fits, with a 20× margin, and would keep fitting if the hold were raised to 60 s. Long-poll is not the thing that breaks on Container Apps — the in-process waiter map is.
- SQLite on Container Apps is safe only as a **read-only cache or a scratch file**, never as the system of record: any revision change, scale event, or node move discards it. `infra/main.bicep:292-293` already says this ("Without these they use ephemeral SQLite").
- Multi-replica correctness is the gating item, not the platform: today a rider's long-poll lands on replica A while the driver's fix lands on replica B, so the waiter never fires and every request burns the full 12 s hold. Moving to Web PubSub removes the shared-state problem entirely; moving to two replicas *without* it makes latency worse, not better.
- Cold start is a config choice, not a platform constant: with `minReplicas: 0` there is no running instance to serve the first request, and no Microsoft document quantifies the resulting delay (see Gaps). For a dispatch API, **`minReplicas: 1` (or 2 for zone redundancy) is the correct default**, and the $55/replica/month is the price of avoiding the unknown.
- Israel Central pricing for ACA compute matches West Europe and is *cheaper* per request ($0.40/M vs $0.56/M), which makes it the natural primary region — if the service is confirmed available there.

### Gaps
- **No documented cold-start latency** for scale-to-zero on Container Apps. The only related statement is qualitative ("pre-warming new replicas before shifting traffic"). Must be measured with the real image.
- I did not confirm Container Apps availability in Israel Central from the products-by-region matrix — only from live price meters [O].
- No documented maximum concurrent WebSocket connections per replica or per environment; the ingress proxy is the implied bottleneck and premium ingress exists for that reason, but no number is published.

---

## 5. Azure Database for PostgreSQL Flexible Server + PostGIS

### Takeaway
PostGIS is fully supported and current (**3.6.1 on PostgreSQL 14–18**), and geofence/routing queries are practical: GiST + `ST_DWithin` on `geography` is the standard shape, and pgRouting 3.8.0 is available on PG 16–18. The binding constraints are **connections** (B1ms allows only **35 user connections**), **no HA and no PgBouncer on Burstable**, and **no paired region for Israel Central**, which removes the easy geo-redundant-backup story.

### Cited Findings
**[D] Extensions and versions**
- `postgis`, `postgis_raster`, `postgis_sfcgal`, `postgis_topology`, `postgis_tiger_geocoder`: **3.6.1 on PostgreSQL 14, 15, 16, 17, 18**; 3.5.2 on 13. — [List of extensions by name](https://learn.microsoft.com/en-us/azure/postgresql/extensions/concepts-extensions-versions)
- `pgrouting` **3.8.0** on PG 16/17/18, 3.5.0 on 15, 3.3.0 on 14; `postgis` 3.6.1 confirmed in the engine-by-version matrix. — [Extensions by engine](https://learn.microsoft.com/en-us/azure/postgresql/extensions/concepts-extensions-by-engine)
- Supported majors: **18 (18.6), 17 (17.11), 16 (16.15), 15 (15.19), 14 (14.24)**, 13/12/11 in Extended Support. — [Supported versions](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions)
- Enabling an extension requires it in the `azure.extensions` server parameter — which `infra/main.bicep:165-169` already does for `postgis`.

**[D] Connections**
- Default **maximum connections**: B1ms 50 total / **35 user**; B2s 429 / 414; B2ms 859 / 844; B4ms 1,718 / 1,703; D2ds_v5 859 / 844; D4ds_v5 1,718 / 1,703. 15 connections are reserved for replication/monitoring. — [Limits in Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits) (page `ms.date` 2026-07-08)
- Raising `max_connections` is possible but discouraged; Microsoft recommends **PgBouncer in transaction mode**, sized at 2–5× vCores. — same page.
- **Burstable servers do not have access to the built-in PgBouncer pooler.** — same page.

**[D] HA, failover, backup**
- Zone-redundant HA: sync replication, **RPO 0**, failover **60–120 s**, SLA **99.99 %**; zonal HA SLA 99.95 %; no HA SLA 99.9 %. — [Reliability in Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/reliability/reliability-database-postgresql) (page `ms.date` 2026-03-24)
- HA requires **General Purpose or Memory Optimized**; **Burstable supports neither HA nor read replicas**; HA bills a standby at the same rate as the primary (2× compute). — same page
- Backups: automatic, **7 days default, extendable to 35**, PITR to any point in the window, ZRS backups in AZ regions, LRS elsewhere; geo-redundant backup only "in Azure regions with pairs". — same page
- Cross-region read replicas: up to 5, **asynchronous**, lag "typically at least several minutes", promotion is **manual** (Azure never auto-promotes on region failure), forced promotion loses unreplicated data, RTO 1–3 min. — same page
- Storage auto-grows and **cannot shrink**; at 95 % usage (or <5 GiB free) the server goes **read-only**. — [Limits](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits)

**[O] Price, Israel Central** (Retail API, 2026-10-29)

| SKU | Hourly | ≈ Monthly (730 h) |
|---|---|---|
| B1MS (1 vCore, 2 GiB) | **$0.0199** | **$14.53** |
| B2S (2 vCore, 4 GiB) | **$0.0796** | **$58.11** |
| B2ms (2 vCore, 8 GiB) | **$0.1592** | **$116.22** |

- These Israel Central compute rates match West Europe's published meters exactly [O]; HA doubles the compute line [D].

### Inferences
- **Geofencing is not the hard part.** A `GEOGRAPHY(Point, 4326)` column with a GiST index and `ST_DWithin(geom, :p, :metres)` answers "which drivers are within 3 km of this pickup" in milliseconds at 10k rows. The hard part is connection budget: 35 user connections on B1ms cannot serve a horizontally scaled API plus a worker plus admin sessions, and the usual escape hatch (PgBouncer) is unavailable on the tier that needs it most.
- Practical floor for a multi-replica API: **B2s (414 user connections)** or **General Purpose + PgBouncer**. B2s at $58/month is the cheapest configuration that does not force connection gymnastics.
- `pgrouting` on PG 16 is a real alternative to a separate OSRM service for small graphs, but the repo already runs OSRM behind a private network (`infra/main.bicep:345-354`) — keep OSRM for road routing, use PostGIS only for proximity/containment predicates.
- Because Israel Central has **no paired region**, "geo-redundant backup" has no default target; DR must be an explicitly chosen region (UAE North or West Europe) with its own server and its own cost. That is a design decision, not a checkbox.
- HA is a **General Purpose** feature here; the pilot should either accept 99.9 % (no HA, ~43 min/month of allowed downtime) or budget 2× on a GP SKU. Burstable + HA is not an option.

### Gaps
- No documented storage price per GB-month for Flexible Server in Israel Central from my queries (only compute meters were returned); the storage line in §7 is therefore excluded rather than guessed.
- No documented `max_connections` behaviour for the new Basv2/Batsv2/Bafsv2/Balsv2 Burstable v2 families beyond the v1 table.
- I did not verify that Israel Central offers zone-redundant HA *in practice* (capacity, not just feature support). The docs note a region can temporarily place both servers in one zone when capacity is short.

---

## 6. Regions, latency and data residency

### Takeaway
**Israel Central** is the only Azure region that keeps Palestinian-user data at rest inside Israel, has **3 availability zones**, opened in **2023**, and has **no paired region**. It sells every service in this stack at a **~43 % realtime premium** over UAE North / Qatar / West Europe, and it is the lowest-latency choice for the West Bank by geography — but **no Microsoft document quantifies user-facing latency**, and no Azure region exists in Palestine.

### Cited Findings
**[D] Region facts**
- Israel Central: **3 availability zones**, paired region **N/A**, physical location Israel, geography Israel, programmatic name `israelcentral`. — [List of Azure regions](https://learn.microsoft.com/en-us/azure/reliability/regions-list) (page `ms.date` 2026-10-12)
- Qatar Central: 3 AZs, no paired region; UAE North: 3 AZs, paired with UAE Central; UAE Central: no AZs, paired with UAE North. — same page
- Israel Central: **"Stored at rest in Israel"**, opened **2023**, available to all customers and partners, 3 zones. — [Microsoft datacenter globe](https://datacenters.microsoft.com/globe/explore); [Azure Speed region profile](https://www.azurespeed.com/Information/AzureRegions/IsraelCentral)
- Data residency: "Most Azure services enable you to specify the region where your customer data will be stored and processed. Microsoft may replicate to other regions for data resiliency, but Microsoft will not store or process customer data outside the selected Geo." — [Data residency in Azure](https://azure.microsoft.com/en-us/explore/global-infrastructure/data-residency); region-by-region table in [Data residency in Azure (PDF)](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/final/en-us/microsoft-brand/documents/1_data-residency-in-azure-2024-06-20.pdf)
- Each region is "contained within a single geography that serves as a fixed data residency boundary". — [What are Azure regions?](https://learn.microsoft.com/en-us/azure/reliability/regions-overview)

**[O] Service presence by price meter, 2026-10-29**

| Service | Israel Central | UAE North | West Europe | Qatar Central |
|---|---|---|---|---|
| Web PubSub / SignalR | ✅ ($2.30/unit-day) | ✅ ($1.61) | ✅ ($1.61) | ✅ ($1.61) |
| Container Apps | ✅ ($0.40/M requests) | ✅ ($0.40/M) | ✅ ($0.56/M) | ✅ ($0.40/M) |
| Event Hubs Standard | ✅ ($0.04/TU-h) | ✅ | ✅ ($0.03) | ✅ |
| PostgreSQL Flexible | ✅ (B1MS $0.0199/h) | ✅ | ✅ | ✅ |
| Blob (Hot LRS) | ✅ ($0.020/GB-mo) | ✅ | ✅ | ✅ |
| Azure Cache for Redis | ✅ (C0 meters present) | ✅ | ✅ | — (no C0 meter returned) |
| Key Vault | ✅ ($0.04/10k ops) | ✅ | ✅ ($0.03/10k) | ✅ |

**[U] Latency**
- Microsoft publishes an Azure backbone latency dataset with a documented methodology, but it measures **region-to-region**, not user-to-region. — [Azure network latency statistics](https://learn.microsoft.com/en-us/azure/networking/azure-network-latency)
- Third-party rendering of that dataset: lowest median RTT from Israel Central is **France South 42 ms, Austria East 48 ms, Italy North 49 ms**; 53 measured destinations. These are backbone numbers between datacenters, **not** phone-to-Azure numbers from Ramallah or Nablus. — [Azure Speed — Israel Central](https://www.azurespeed.com/Information/AzureRegions/IsraelCentral)
- Preliminary Israel Central round-trip measurements exist on the same site but are collected from users who run the browser test, i.e. selection-biased. — [Azure Speed latency test](https://www.azurespeed.com/Azure/Latency)

### Inferences
- From the West Bank, Israel Central is the only option with a plausible **single-digit-to-low-tens-of-ms** last mile; UAE North and Qatar Central add a Gulf hop, West Europe adds a Mediterranean hop plus EU jurisdiction. The exact numbers must be measured (§8), not assumed.
- The realtime premium is real but bounded: at pilot scale it is **~$21/month** on Web PubSub (1 unit), and it is the price of keeping GPS traces and phone numbers in-country. At 10k drivers the premium alone is **~$520/month** (25 units), worth re-examining at that scale, but not before.
- **No paired region** is the sharpest constraint. Azure's usual "geo-redundant backup to the paired region" and "paired-region DR" patterns do not apply; DR must be an explicitly designed second region with its own Postgres, its own Web PubSub, and Front Door in front. That doubles fixed cost and adds a manual promotion runbook.
- Residency nuance: "stored at rest in Israel" is a datacenter statement, not a legal opinion about the Palestinian Authority or Israeli jurisdiction over data. That question is outside this note and needs counsel, not a docs page.

### Gaps
- **No documented or measured latency from West Bank cities to Israel Central.** This is the single most important missing number for the region decision, and it can only come from a field test (§8).
- The products-by-region matrix (`azure.microsoft.com/explore/global-infrastructure/products-by-region/table`) is JS-rendered and did not yield a readable table to this fetch; per-service availability in Israel Central is therefore [O] from pricing, not [D].
- No primary source on Palestinian data-protection obligations or on whether Israeli law reaches data stored in Israel Central. Out of scope; flagged for legal review.

---

## 7. Cost model at 100 / 1,000 / 10,000 concurrent drivers

### Takeaway
At pilot scale the realtime layer is **cheap** (≈$70/month for 100 drivers on Web PubSub) and the **API request meter is the surprise**: at 0.25 Hz per driver, Container Apps bills **$26 / $263 / $2,627 per month** for 100 / 1,000 / 10,000 drivers respectively — more than the realtime service itself once you pass ~1,000 drivers. Batching fixes to 0.1 Hz cuts that line by 60 % and is the single highest-leverage cost decision in the stack.

### Cited Findings
**[O] Unit prices used** (Azure Retail Prices API, Israel Central, 2026-10-29; all `priceType eq 'Consumption'`)

| Meter | Price |
|---|---|
| Web PubSub Standard unit | $2.30/day |
| Web PubSub Standard message | $1.43 per 1M (2 KB units) |
| Container Apps vCPU active | $0.000034/s |
| Container Apps memory active | $0.000004/GiB-s |
| Container Apps requests | $0.40 per 1M |
| PostgreSQL B1MS | $0.0199/hr |
| PostgreSQL B2S | $0.0796/hr |
| PostgreSQL B2ms | $0.1592/hr |
| Event Hubs Standard TU | $0.04/hr |
| Event Hubs ingress events | $0.04 per 1M |
| Blob Hot LRS | $0.020/GB-month |
| Key Vault operations | $0.04 per 10k |

**[D] Inclusion rules that the model depends on**
- 1 unit = 1,000 connections, **plan at 80 %** → 800 connections/unit. — [Billing model](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-billing-model)
- 1 unit includes **2 GB outbound/day** (1 M × 2 KB). — same page
- Container Apps bills per request and per vCPU/GiB-second, and does not bill usage at zero replicas. — [Scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
- Event Hubs TU = 1 MB/s **or** 1,000 events/s. — [Event Hubs quotas](https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-quotas)

**Assumptions (explicit, all [U] until measured)**
1. One fix per driver every **4 s** (0.25 Hz) while online; payload **200 bytes** JSON including envelope.
2. Each fix is delivered to **one** rider (1 group member). Driver echo and support views excluded.
3. Rider connections = driver connections (1:1). Chat and notifications are negligible on this channel (Expo push is separate).
4. One always-on API replica at 0.5 vCPU / 1 GiB for 100–1,000 drivers; 4 replicas at 10k.
5. Postgres: B1ms at 100, B2s at 1,000, B2ms at 10,000. **Storage excluded** (price not verified, §5 Gaps).
6. Event Hubs only from 1,000 drivers up (below that, write fixes straight to Postgres).
7. 30.4 days/month.

**Result (0.25 Hz)**

| Drivers | Conns | WPS units (max of conns/800, GB/day÷2) | Web PubSub | ACA requests | ACA compute | Postgres | Event Hubs | **Total ≈** |
|---|---|---|---|---|---|---|---|---|
| 100 | 200 | 1 | $70 | $26 | $55 | $15 | — | **$166** |
| 1,000 | 2,000 | **3** (2.5 conn-bound) | $210 | $263 | $55 | $58 | $55 | **$641** |
| 10,000 | 20,000 | **25** (conn-bound; 22 byte-bound) | $1,748 | $2,627 | $221 | $116 | $350 | **$5,062** |

**Same model at 0.1 Hz (one fix per 10 s, client interpolates)**

| Drivers | Web PubSub | ACA requests | ACA compute | Postgres | Event Hubs | Total ≈ |
|---|---|---|---|---|---|---|
| 100 | $70 | $11 | $55 | $15 | — | **$151** |
| 1,000 | $210 | $105 | $55 | $58 | $40 | **$468** |
| 10,000 | $1,748 | $1,051 | $221 | $116 | $134 | **$3,270** |

**Worked arithmetic, 10,000 drivers @ 0.25 Hz**
- Outbound: 2,500 deliveries/s × 200 B = 500 KB/s = **43.2 GB/day** → 21.6 units → 22.
- Connections: 20,000 ÷ 800 = **25 units** → connection-bound, 25 × $2.30 = **$57.50/day = $1,748/mo**.
- API requests: 2,500 req/s × 86,400 × 30.4 = **6.57 B requests** × $0.40/M = **$2,627/mo**.
- ACA compute: 4 × $55.2 = **$221/mo**.
- Event Hubs: 2,500 events/s → **3 TUs** × $0.04 × 730 = **$87.6/mo**, plus **$263/mo** ingress events (6.57 B) = **$350/mo**.

### Inferences
- **Web PubSub cost is linear in connections, sub-linear in fixes.** The 80 % rule, not the byte quota, is what you pay for at scale — 25 units for 20k connections. If riders and drivers share a group and only one device per order subscribes, the same 20k people cost the same; if support desks also subscribe, it does not.
- **The request meter is the dominant line above ~1,000 drivers.** Two levers: batch fixes client-side (0.1 Hz halves-plus the request count) or ingest over the WebSocket (client→Web PubSub→upstream) — but upstream events still arrive at the API as HTTP, so batching, not transport, is the real lever.
- **Event Hubs is not a cost optimisation at these volumes** ($55–350/month including ingress events) — it is a correctness/latency decision (keeping GPS writes off Postgres).
- Fixed floor for any single-region deployment: **one ACA replica ($55) + smallest Postgres ($15) + one Web PubSub unit ($70) ≈ $140/month**, before Blob, Key Vault, Log Analytics, App Insights, SMS and push. That is the number to beat against Railway today.
- Excluded and non-trivial: **egress bandwidth** (fix fan-out to riders leaves Azure), **Log Analytics ingestion** (ACA logs are billed per GB), **Application Insights**, **Blob** for evidence photos (~$0.02/GB-month, negligible until you store dashcam clips), **Key Vault** (~$0.04/10k ops, negligible), **SMS/OTP** via ACS, and **OSRM** compute (2 vCPU / 4 GiB always-on is another ~$70–110/month at these rates).

### Gaps
- No measured request rate: the 0.25 Hz assumption is a design choice, not an observation from the app. The real number depends on the client's location task interval, which I did not audit.
- Container Apps **idle** rates ($0.000004/vCPU-s and /GiB-s in the price sheet) are not modelled; they apply to replicas that are running but not processing, so the compute line is a floor, not a ceiling.
- PostgreSQL **storage** and **backup** charges are excluded for lack of a verified Israel Central meter.
- No bandwidth/egress calculation; Azure egress pricing was out of scope and is not zero.

---

## 8. Reliability: SLAs, multi-region, and what a single-region Palestine deployment cannot promise

### Takeaway
A single-region Israel Central deployment composes to roughly **99.75 %** on the documented SLAs (Container Apps 99.95 % × Web PubSub 99.9 % × Postgres 99.9 % without HA) — about **1.8 hours of allowed downtime per month**, and **100 % outage during any Israel Central regional failure**, because Container Apps is single-region and Israel Central has no paired region. With zone redundancy and Postgres HA the composite rises to ~99.84 %, but the regional-failure exposure does not move at all.

### Cited Findings
**[D] Per-service SLAs**
- Container Apps: **99.95 %** monthly uptime, tiered credits; no SLA on free tier; zone redundancy does not raise it. — [SLA for Container Apps v1.0](https://www.azure.cn/en-us/support/sla/container-apps/v1_0/)
- Web PubSub: **99.9 % Standard / 99.95 % Premium**. — [Web PubSub pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/)
- SignalR: **99.9 % Standard / 99.95 % Premium**. — [SignalR pricing](https://azure.microsoft.com/en-us/pricing/details/signalr-service/)
- PostgreSQL: **99.99 % zone-redundant HA / 99.95 % zonal HA / 99.9 % no HA**. — [Reliability in Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/reliability/reliability-database-postgresql)
- Event Hubs: AZ support in all tiers; geo-DR on Standard, geo-replication on Premium only. — [Event Hubs quotas](https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-quotas)

**[D] Failure behaviour**
- Container Apps: single-region; regional outage = full outage; multi-region requires per-region environments + Front Door/Traffic Manager + your own data replication; no built-in backup; zone failover "typically about 30 seconds" for traffic rerouting. — [Reliability in Container Apps](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps)
- Postgres HA: automatic failover **60–120 s** for zone-redundant; **user errors are replicated to the standby**, so a dropped table requires PITR, not failover. — [Reliability in PostgreSQL](https://learn.microsoft.com/en-us/azure/reliability/reliability-database-postgresql)
- Postgres cross-region: async replicas lag "at least several minutes"; **promotion is manual**; forced promotion loses unreplicated data; RTO 1–3 min after you trigger it. — same page
- Web PubSub Premium: geo-replication routes clients to a healthy replica; Standard has no geo-replication. — [Web PubSub overview](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/overview); [Pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/)

**[O] Composite arithmetic (naive independence, 730 h/month)**
- `0.9995 × 0.999 × 0.999 = 0.99750` → **99.750 %** → **1.83 h/month** allowed downtime.
- `0.9995 × 0.999 × 0.9999 = 0.99840` → **99.840 %** → **1.17 h/month**.
- Neither figure includes Front Door, DNS, OSRM, the mobile networks, or your own deploy cadence.

### Inferences
- **The SLA composite is not the real risk.** 1.8 h/month of *platform* downtime is acceptable for a pilot; a **multi-hour regional outage** or a **manual Postgres promotion at 2 a.m.** is not. The failure that hurts is the one with no runbook, not the one with a 10 % service credit.
- A single-region deployment cannot promise: survival of an Israel Central outage; a documented RTO/RPO for regional failure; automatic database promotion; or that GPS history survives a regional loss (no paired region → no default geo-redundant backup target).
- What it *can* promise, with work: zone-failure survival (3 AZs; enable ACA zone redundancy at environment creation with ≥2 replicas, Postgres zone-redundant HA on General Purpose), 60–120 s database failover, and per-order realtime delivery that survives an API replica restart once the waiter state is in Web PubSub rather than in process memory.
- The cheapest credible DR story is **active-passive**: Israel Central primary, UAE North (or West Europe) warm standby with its own Postgres read replica and its own Web PubSub, Front Door health probes, and a written promotion runbook. That roughly doubles the fixed infrastructure line (~$140 → ~$280/month at pilot) and is the honest price of not having a paired region.
- Do not promise "Uber-like availability" on a single region. Promise measured p95 latency, a documented RTO, and a tested failover — those are provable; 99.99 % is not.

### Gaps
- No Microsoft SLA for **OSRM**, **Front Door** or **DNS** is included in the composite above; adding them lowers it further.
- No published RTO/RPO for a **full Israel Central regional failure** — the docs only describe zone failures and manual cross-region promotion.
- Whether Container Apps zone redundancy is actually available in Israel Central (capacity) is unverified; the docs say "all regions that support Container Apps and availability zones", and Israel Central lists 3 zones, but I did not confirm with a deployment.

---

## 9. Decision summary and what must be proven before cutover

### Takeaway
Adopt **Web PubSub (Standard, 1 unit, AAD-only)** as the realtime channel, **Container Apps with ≥2 replicas** as the host, **PostgreSQL Flexible Server B2s + PostGIS** as the system of record, **Blob** for evidence, **Key Vault** for secrets, and **Event Hubs only when location history needs a second consumer**. Keep everything in **Israel Central** for residency and latency, and treat multi-region as a funded phase-two decision, not a pilot promise.

### Cited Findings
- Web PubSub and SignalR cost the same in Israel Central ($2.30/unit-day, $1.43/M messages) and have the same 1,000-connection unit; Web PubSub has no .NET dependency and no 5-connections-per-hub server tax. — [Web PubSub pricing](https://azure.microsoft.com/en-us/pricing/details/web-pubsub/); [SignalR messages and connections](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-concept-messages-and-connections) [D]/[O]
- The repo already provisions Web PubSub `Standard_S1` with local auth disabled and AAD enabled (`infra/main.bicep:278-284`) — the infrastructure decision is already made; the application has not adopted it. [O]
- Container Apps supports WebSocket ingress with a 240 s request timeout and 99.95 % SLA, but is stateless and single-region by design. — [Ingress](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview); [Reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps) [D]
- PostGIS 3.6.1 is available on PG 14–18; B1ms allows 35 user connections and Burstable has no PgBouncer. — [Extensions](https://learn.microsoft.com/en-us/azure/postgresql/extensions/concepts-extensions-versions); [Limits](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits) [D]

### Inferences
**Adopt now (pilot, ~$170/month)**
1. Web PubSub Standard, 1 unit, one hub, `order:<id>` groups, token endpoint issuing `userId` + group-scoped roles with a 5–15 minute expiry.
2. Container Apps, `minReplicas: 1` (2 if zone redundancy is enabled at environment creation), ingress `transport: http`, managed identity for Web PubSub and Key Vault.
3. PostgreSQL Flexible Server **B2s** (not B1ms — 35 user connections is below the multi-replica floor), PG 16, `postgis` + `pgrouting` in `azure.extensions`.
4. Blob Hot LRS for photos/evidence; Key Vault for the DB URL and ACS key.

**Adopt later, with a trigger**
5. Event Hubs (1–3 TUs) + Capture **when** a second consumer appears or Postgres write load from fixes exceeds ~20 % of CPU.
6. Premium Web PubSub **when** you need geo-replication or autoscale (Standard has neither).
7. Multi-region active-passive **when** the business can fund ~2× infrastructure and own a tested promotion runbook.

**Must be proven (each is a falsifiable test, not an opinion)**
- [ ] **RN WebSocket end-to-end**: raw `WebSocket` to a Web PubSub client URL, token refresh on 401/expiry, reconnect after airplane mode, Android Doze, and Wi-Fi↔4G handover. Success = no missed fix > 2 intervals in a 30-minute field walk.
- [ ] **Latency from the West Bank**: p50/p95 fix-to-screen on a real device in Ramallah, Nablus and Hebron, on 3G and 4G, against Israel Central. Success = p95 under the product's stated target (pick one; do not leave it implicit).
- [ ] **Unit sizing**: 1 unit sustaining 800 concurrent connections with 25 msg/s fan-out at p95 < 1 s; then 2 units. Success = no throttling, no reconnect storms.
- [ ] **Container Apps cold start**: measured time from zero to first 200 on the real image, with and without a 1 GiB / 0.5 vCPU allocation. This number decides whether `minReplicas: 0` is ever allowed.
- [ ] **Postgres connection budget**: peak concurrent connections with N API replicas + worker + PgBouncer absent on Burstable; confirm B2s is enough or move to GP + PgBouncer.
- [ ] **PostGIS query plan**: `EXPLAIN ANALYZE` on `ST_DWithin` over 10k driver rows with a GiST index; confirm index usage and sub-10 ms.
- [ ] **Failover drill**: forced Postgres failover under load; measure actual downtime against the documented 60–120 s, and confirm the API reconnects without manual intervention.
- [ ] **Regional-failure runbook**: promote the UAE North replica, repoint Front Door, and time it. If it cannot be done in one hour by one engineer, the multi-region promise is fiction.
- [ ] **Cost validation**: reconcile one month of real usage against §7's model, especially the Container Apps request meter, which is the largest and least certain line.

### Gaps
- The recommendation above is an architecture judgement on documentary evidence; **none of the nine proofs has been run**. Until they are, treat latency, cold start, unit sizing and failover time as unknown.
- Legal/residency review of storing Palestinian users' location data in Israel is not covered by any source in this note and must precede production, not follow it.
- Pricing is a 2026-10-29 snapshot of the Retail API for Israel Central; it excludes negotiated discounts, Dev/Test rates, and the Azure for Students subscription constraints that a prior note in this repo examined.
