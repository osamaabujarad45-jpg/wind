# Cheapest credible realtime + database + hosting stack for a Palestine ride-hailing backend (October 2026)

*All pages fetched 2026-10-29 unless stated. Labels: **[documented]** = stated on the vendor's own page; **[observed]** = seen in a vendor page/table during this research but not stated as a policy; **[unverified]** = my estimate or inference, not from a source. Prices are USD unless noted.*

---

## 1. Supabase: free tier, Pro price, Realtime limits/authorization, React Native, PostGIS, backups, pausing

### Takeaway
Supabase is the cheapest single-vendor "Postgres + Realtime + Auth" bundle, but its Free plan is a demo tier for this workload: 200 concurrent Realtime connections, 2M messages/month, 500 MB database, and projects pause after a week of inactivity. Pro at $25/month is the real entry point and even then Realtime message overage ($2.50/million) becomes the dominant cost at city scale.

### Cited Findings
- Free plan includes: 500 MB database, 5 GB egress, 1 GB file storage, 50,000 MAU, unlimited API requests, 2 active projects; **"Free projects are paused after 1 week of inactivity"**; no automatic backups on Free — [Supabase pricing](https://supabase.com/pricing) **[documented]**
- Pro is **"from $25/month"**, includes 8 GB disk per project, 250 GB egress, 100,000 MAU, daily backups retained 7 days, 7-day log retention, **"Projects on paid plans are not paused for inactivity"** — [Supabase pricing](https://supabase.com/pricing) **[documented]**
- Realtime Free: **200 concurrent peak connections**, **2 million messages/month**, 256 KB max message. Pro: **500 concurrent**, **5 million messages/month**, then **$2.50 per million**, 3 MB max message, **$10 per 1,000 additional concurrent connections** — [Supabase pricing](https://supabase.com/pricing) **[documented]**
- Realtime per-project ceiling on Free is 200 connections and 2,500 messages/second; exceeding limits produces `too_many_connections` / `too_many_channels` / `too_many_joins` errors and disconnects — [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits) **[documented]**
- Realtime Authorization is enforced with RLS policies on the `realtime.messages` table; private channels require `private: true`, RLS must be enabled on that table, and Postgres Changes on RLS tables only deliver rows the client may read — [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) **[documented]**
- PostGIS is a first-class extension enabled from the dashboard, installed into a dedicated schema (`extensions`), with `geography`/`geometry` types and GiST-backed nearest-neighbour ordering — [Supabase PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis) **[documented]**
- Compute add-on table: Micro $10/month = shared CPU, **1 GB RAM, 60 direct connections, 200 pooler connections**; Small $15 = 2 GB / 90 direct / 400 pooler — [Supabase pricing](https://supabase.com/pricing) **[documented]**
- Official Expo/React Native guide uses `supabase-js` in an Expo app (auth tutorial; the JS client is the supported path) — [Supabase Expo React Native guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native) **[documented]**
- PITR costs **$100/month per 7 days retention**; custom domain $10/domain/month — [Supabase pricing](https://supabase.com/pricing) **[documented]**

### Inferences
- The 200-connection Free ceiling is roughly 100 drivers + 100 riders online simultaneously — a single city district at best, not a pilot with riders.
- 2M messages/month is consumed in ~3 days by 100 drivers sending a position every 10 s for 8 h/day (calculation in §10).
- Free has **no backups**, so it cannot hold the only copy of trip/payment data.
- Micro's 60 direct connections mean a Node API must use the pooler (port 6543-style transaction pooling) or a very small pool; serverless functions should never hold direct connections.

### Gaps
- Supabase does not publish a per-message size accounting rule (whether one Broadcast counts once per subscriber). Cost model in §10 assumes one billable message per publish, which may understate fan-out cost.
- No documented statement found on Realtime region placement for the Levant; project region is chosen at creation (Frankfurt/EU is the nearest listed option I could confirm) — latency unmeasured.

---

## 2. Firebase (Firestore + Realtime Database): free quotas, concurrency, pricing, RN support, fit for driver fan-out and chat

### Takeaway
Firebase's free quotas are small in the dimensions that matter here: Firestore gives 50k reads/20k writes per **day**, and Realtime Database's Spark plan caps **100 simultaneous connections**. Firestore is a poor fit for high-frequency driver positions (each write is billed, each listener re-reads), and RTDB's 100-connection cap blocks anything past a demo.

### Cited Findings
- Firestore free tier: **1 GiB storage**, **50,000 document reads/day**, **20,000 writes/day**, **20,000 deletes/day**, **10 GiB/month egress**; quotas reset daily around midnight Pacific — [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) **[documented]**
- Firebase pricing page restates: no-cost up to 1 GiB total, 20K writes/day, 50K reads/day, 20K deletes/day, 10 GiB/month — [Firebase pricing](https://firebase.google.com/pricing) **[documented]**
- Realtime Database Spark: **1 GB stored, 10 GB/month downloads**, and **"The Spark plan limit on simultaneous connections is 100"** — [RTDB limits](https://firebase.google.com/docs/database/usage/limits) and [RTDB billing](https://firebase.google.com/docs/database/usage/billing) **[documented]**
- RTDB storage on Blaze is **$5 per GB/month**, billed daily — [RTDB billing](https://firebase.google.com/docs/database/usage/billing) **[documented]**
- Firestore's own docs warn that realtime listeners are billed for reads and that query listeners re-deliver on change; there is a dedicated "Understand real-time queries at scale" page — [Firestore realtime at scale](https://firebase.google.com/docs/firestore/real-time_queries_at_scale) **[documented, page exists; numeric guidance not extracted]**
- 10 GiB/month inter-region transfer free, then $0.01/GiB within the US — [Firestore pricing](https://firebase.google.com/docs/firestore/pricing) **[documented]**

### Inferences
- A driver app writing one position per 10 s produces 2,880 writes/day; 100 drivers = 288,000 writes/day, i.e. **14× the Firestore free write quota** — the free tier dies in under two hours of full pilot operation.
- With Firestore, every rider listening to a trip document is a read stream; location fan-out cost scales with listeners × updates, which is the worst possible billing shape for live tracking.
- RTDB is technically a better shape (one write fans out to listeners, billed on bandwidth), but 100 concurrent connections on Spark and no published concurrency ceiling below Blaze make it a "buy" not a "free" option.
- Firebase has no PostGIS-equivalent; geo queries require geohash + range queries (documented as a recipe), which is weaker than PostGIS for "nearest available driver within polygon".

### Gaps
- Exact Blaze per-operation rates for Firestore reads/writes/deletes were not captured from the pricing page in this pass (page renders tables client-side); do not quote per-100k prices without re-checking.
- No official React Native SDK from Firebase itself; `@react-native-firebase/*` is community-maintained — I did not fetch a source for this in this pass, so treat RN support as **[unverified]**.

---

## 3. Ably, Pusher, PubNub: free tiers, concurrency, presence, RN SDKs, cost at 1k/10k drivers

### Takeaway
Managed pub/sub vendors all price on connections + messages and all have free tiers of 100–200 concurrent connections, so all three break at pilot. Ably is the most transparent for cost modelling ($2.50/million messages, $1/million connection-minutes); Pusher is cheapest at 1k drivers but caps at 20M messages/day on its top self-serve plan; PubNub's MAU model is cheapest to reason about and most expensive per driver at scale.

### Cited Findings
- **Ably Free**: 200 concurrent connections, 200 concurrent channels, **6M messages/month**, 500 messages/s, 200 presence members/channel, 1-day message storage, 64 KiB max message — [Ably pricing](https://ably.com/pricing) **[documented]**
- **Ably Standard $29/month**: 10k connections, 10k channels, 2.5k msg/s; messages **$2.50/million**, connection-minutes **$1.00/million**, channel-minutes **$1.00/million**; additional data transfer $0.25/GiB — [Ably pricing](https://ably.com/pricing) **[documented]**
- Ably documents message delivery latency of **6.5 ms** and WebSocket edge infrastructure in "11+ regions and 700+ PoPs" — [Ably pricing](https://ably.com/pricing) **[documented, vendor claim]**
- Ably has an official **React Native (Expo) getting-started guide** — [Ably React Native guide](https://ably.com/docs/getting-started/react-native) **[documented]**
- **Pusher Channels Sandbox (free)**: **100 concurrent connections**, **200,000 messages/day**. Startup $49 = 500 connections / 1M messages/day; Pro $99 = 2,000 connections / 4M/day; Business $299 = 5,000 / 10M/day; Premium $499 = 10,000 / 20M/day — [Pusher Channels pricing](https://pusher.com/channels/pricing/) **[documented]**
- **PubNub Free**: **200 MAU or 1M transactions**, 1 GB storage for 7 days, 5 serverless functions — [PubNub pricing](https://www.pubnub.com/pricing/) (page last updated 2026-09-09) **[documented]**
- **PubNub Starter $98/month** for 1,000 MAU; Platform Pro documented examples: **1,000 MAU $190/mo, 5,000 MAU $370/mo, 10,000 MAU $550/mo, 25,000 MAU $1,130/mo**; PubNub states connections, channels, message volume and storage are included in MAU pricing — [PubNub pricing](https://www.pubnub.com/pricing/) **[documented]**
- PubNub claims "unlimited concurrent users" on all plans and <100 ms global latency (marketing claim, no region detail) — [PubNub pricing](https://www.pubnub.com/pricing/) **[documented, vendor claim]**

### Inferences
- At 100 drivers + ~100 riders (200 concurrent), **Ably Free fits connections but not messages** (6M/month vs ~9M needed at 10 s cadence), and **Pusher Free fits neither** (100 connections, 200k messages/day = 6M/month).
- At 1,000 drivers, Pusher Pro ($99, 4M/day = 120M/month) is the cheapest of the three; Ably at ~90M messages would be ~$29 + ~$210 usage; PubNub at ~1,200 MAU is ~$190–$210.
- At 10,000 drivers, Pusher's self-serve ceiling (20M/day = 600M/month) is below the ~900M/month this workload implies, forcing a sales conversation; PubNub is ~$550/month at 10k MAU and is the only vendor whose price does **not** grow with message rate — attractive if position cadence is aggressive.
- None of these prices include presence-heavy dispatch semantics; presence is included by all three, but Ably caps presence at 200 members/channel on Free.

### Gaps
- Ably's Standard package "included" message volume is not stated on the pricing page (only the $2.50/M rate), so the $29 base may or may not absorb 6M messages — do not present Ably totals as exact.
- No independent latency benchmark to Palestine/West Bank was found for any of the three; their PoP claims are global averages.

---

## 4. Cloudflare Workers + Durable Objects + D1/Hyperdrive: free limits, WebSockets, DO pricing, Postgres connectivity, dispatch suitability

### Takeaway
This is the only stack where the free tier is generous in the *right* dimension: Durable Objects bill WebSocket messages at a **20:1 ratio** and hibernate idle objects, so 900M messages/month costs single-digit dollars in requests. DO is genuinely suitable for stateful dispatch rooms and driver presence; D1 is not a PostGIS database, so durable geo data still belongs in Postgres via Hyperdrive.

### Cited Findings
- Workers Free: **100,000 requests/day**, **10 ms CPU per invocation**; Workers Paid $5/month includes 10M requests + 30M CPU-ms, then $0.30/million requests and $0.02/million CPU-ms; **"WebSocket connections made to a Worker are charged as a request"** and WebSocket messages routed through a Worker do not count as requests — [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) **[documented]**
- Durable Objects are available on Workers Free but **only SQLite-backed** DOs; Free limits: **100,000 requests/day, 13,000 GB-s/day duration, 5M row reads/day, 100,000 rows written/day, 5 GB SQLite storage**; daily limits reset 00:00 UTC and further operations of that type fail when exceeded — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (page last updated **2026-10-18**) **[documented]**
- DO Paid: 1M requests/month included then **$0.15/million**; 400,000 GB-s included then **$12.50/million GB-s**; **"a 20:1 ratio is applied to incoming WebSocket messages"**; **"A request is needed to create a WebSocket connection. There is no charge for outgoing WebSocket messages"**; duration is billed at 128 MB regardless of actual use — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) **[documented]**
- WebSocket Hibernation API avoids duration charges while sockets are idle; vendor example: 100 DOs × 100 hibernatable sockets, 1 msg/min → **$20.65/month total** — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) **[documented]**
- D1 Free: **5M rows read/day, 100,000 rows written/day, 5 GB storage**; paid: 25B rows read/month included + $0.001/M, 50M rows written + $1.00/M, 5 GB included + $0.75/GB-month — [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) **[documented]**
- Hyperdrive (Postgres pooler/accelerator) is included on Free and Paid plans with daily-reset free limits; cached and uncached queries both count against the limit — [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) **[documented]**
- DO supports both HTTP and WebSocket traffic and is positioned for "chat or real-time user state" (vendor's own example) — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) **[documented]**

### Inferences
- Cost at 10k drivers, 10 s cadence, ~900M messages/month: 900M/20 = 45M billable requests → (45M − 1M) × $0.15/M ≈ **$6.60**; duration with hibernation and ~10 ms CPU per message ≈ 9M s ≈ 1.15M GB-s → (1.15M − 0.4M) × $12.50/M ≈ **$9.40**; plus $5 plan floor ≈ **$21/month for the entire realtime layer**.
- This is ~100× cheaper than message-priced pub/sub at the same volume, and it is the single strongest argument in this research for making DO (or a self-hosted equivalent) the realtime backbone.
- DO's weakness is durability/geo: SQLite storage per object is fine for presence and offer leases, not for trip history or PostGIS. Pair DO with Postgres through Hyperdrive for anything auditable.
- Free-tier cliff for DO is **100k requests/day**; at 20:1 that is ~2M WebSocket messages/day ≈ 24 drivers at 10 s cadence for 8 h — so even the Free DO tier is a demo.

### Gaps
- Hyperdrive free-tier query count and connection limits were not shown as numbers on the fetched page (table rendered without values) — do not quote.
- Cloudflare does not publish per-country latency; anycast means West Bank traffic likely terminates in a nearby PoP (unverified which), and DO objects are single-homed to a location chosen by the platform (location hints exist but were not fetched).

---

## 5. Postgres providers: Neon, Supabase, Railway, Render, Amazon RDS — storage, compute, connections, PostGIS, backups, pausing

### Takeaway
Every "free Postgres" except Supabase's paused-on-inactivity tier and Neon's CU-hour allowance is either time-limited (Render: expires in 30 days) or too small to hold position history. Neon's 100 CU-hours/month is the trap: it covers ~16 days of the smallest always-on compute, so a 24/7 dispatch database runs out mid-month unless it idles.

### Cited Findings
- **Neon Free**: 1 GB Postgres storage/project (20 GB account total), **100 CU-hours/project/month**, **scale-to-zero after 5 minutes** (cannot be disabled on Free), 5 GB egress/project, 100 projects, 6-hour history, 1 manual snapshot; **PostGIS included** ("Postgres extensions (pgvector, PostGIS, TimescaleDB…)") — [Neon pricing](https://neon.com/pricing) **[documented]**
- Neon paid: **$0.106/CU-hour (Launch)**, **$0.35/GB-month storage**, 500 GB egress included then $0.10/GB; **exceeding CU-hours or egress suspends compute until next billing period**; exceeding 1 GB storage blocks writes but does not delete data — [Neon pricing](https://neon.com/pricing) **[documented]**
- Neon: a CU is "~4 GB RAM + CPU + SSD"; 0.25 CU × 4 h = 1 CU-hour — [Neon pricing](https://neon.com/pricing) **[documented]**
- **Render Free Postgres**: **1 GB fixed storage**, **expires 30 days after creation**, inaccessible unless upgraded, 14-day grace period, **no backups/point-in-time recovery on Free**, may restart/maintenance at any time — [Render free docs](https://render.com/docs/free) **[documented]**
- **Render Free web service**: spins down after **15 minutes without inbound traffic — "This includes both HTTP requests and WebSocket messages from existing connections"**; spin-up takes **about one minute**; 750 free instance-hours/month; free services suspended for the rest of the month if hours run out — [Render free docs](https://render.com/docs/free) **[documented]**
- **Railway**: Free plan = **$1/month of usage credit**, 1 vCPU / 0.5 GB per service, 1 replica, 500 MB volume; Hobby $5 includes $5 usage; usage rates **$20/vCPU-month, $10/GB RAM-month, $0.15/GB-month volume, $0.05/GB egress** — [Railway pricing](https://railway.com/pricing) **[documented]**
- **Amazon RDS Free Tier (new model)**: "Free plan is available on **db.t3.micro and db.t4g.micro**" for MySQL/PostgreSQL/MariaDB/SQL Server Express; accounts activated **before July 15, 2025** keep the legacy 12-month free tier — [AWS RDS free tier](https://aws.amazon.com/rds/free/) **[documented]**
- Supabase Postgres free/Pro limits and pooler connection counts: see §1 — [Supabase pricing](https://supabase.com/pricing) **[documented]**

### Inferences
- Neon Free cannot host a 24/7 dispatcher: 100 CU-hours at the 0.25 CU floor = **400 hours ≈ 16.7 days** of continuous compute, and scale-to-zero adds a cold start to the first query after idle — fatal for an offer/accept loop with sub-second deadlines.
- Render Free Postgres is unusable for production by policy (30-day expiry), and Render Free web services cannot hold WebSockets open (15-minute idle spin-down counts WebSocket messages as traffic, but a quiet dispatch socket still risks spin-down).
- Railway Free ($1 credit) buys roughly 50 vCPU-hours or 100 GB-RAM-hours — a few days of a small API, not a month.
- RDS's value is not price; it is managed backups/PITR and Multi-AZ. At pilot scale it is 5–10× the cost of Neon/Supabase and has no free option post-2025 for new accounts beyond credits.

### Gaps
- Exact RDS Free-plan allowances (storage GB, IOPS, duration, credit amounts for post-July-2025 accounts) were not captured — the page describes instance classes but not the full allowance table.
- Supabase/Neon/Railway/Render region lists near Palestine were not fetched; Supabase and Neon both offer EU (Frankfurt) regions, which is the practical nearest option, but I have no dated latency measurement (see §11).

---

## 6. Hosting: Railway, Render, Fly.io, Cloudflare, Vercel, Hetzner, Oracle Always Free

### Takeaway
Free always-on hosting near Palestine effectively does not exist: Fly has no free tier and no Middle East region; Render free sleeps after 15 minutes; Railway free is $1 of credit; Vercel is not built for persistent WebSockets; Cloudflare Workers is the only free-tier option that stays awake, and it is serverless. The only genuinely free always-on VM is Oracle Always Free (2 OCPU / 12 GB Ampere), with idle-reclamation risk and no Levant region.

### Cited Findings
- **Fly.io: "No. New organizations don't have a free tier or a monthly free usage allowance."** Smallest always-on Machine **$2.19/30 days**; 1 GB Machine **$6.70/month**; egress **$0.02/GB** North America/Europe, **$0.04/GB** APAC, **$0.12/GB Africa and India** — [Fly pricing](https://fly.io/docs/about/pricing/) **[documented]**
- Fly region list contains **ams, arn, cdg, dfw, ewr, fra, gru, iad, jnb, lax, lhr, nrt, ord, sin, sjc, syd, yyz** — **no Middle East / Levant region** — [Fly regions](https://fly.io/docs/reference/regions/) **[documented]**
- **Oracle Always Free**: 2× `VM.Standard.E2.1.Micro` (AMD, 1/8 OCPU each) **plus** Ampere A1: **1,500 OCPU-hours + 9,000 GB-hours per month = "2 OCPUs and 12 GB of memory"**; **200 GB total block volume** (boot + block combined, 5 volume backups); **"Idle Always Free compute instances may be reclaimed by Oracle"** if idle over a 7-day window — [OCI Always Free docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) **[documented]**
- Oracle Free Tier also includes US$300 credit for 30 days; accounts idle 30+ days may be deemed abandoned — [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) **[documented]**
- **Hetzner Cloud**: shared-vCPU cloud instances start at **€5.99/month excl. VAT** (dedicated-vCPU line from €43.49/month; server auction from €72.70/month) — [Hetzner Cloud](https://www.hetzner.com/cloud/) **[documented, floor price only]**
- **DigitalOcean droplets** (fallback VPS anchor): 1 GiB/1 vCPU **$6/mo**, 2 GiB **$12/mo**, 4 GiB/2 vCPU **$24/mo**, with 1,000–4,000 GiB transfer included — [DigitalOcean droplet pricing](https://www.digitalocean.com/pricing/droplets) **[documented]**
- **Cloudflare Workers Free** stays always-on with 100k requests/day (see §4) — [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) **[documented]**
- Render free web service = 750 hours/month, 15-minute idle spin-down, ~1 minute cold start; free instances explicitly **"Do not use them for production applications"** — [Render free docs](https://render.com/docs/free) **[documented]**

### Inferences
- For a Node API + WebSocket gateway that must never sleep, the cheapest always-on options are: Oracle A1 (free, 2 OCPU/12 GB, but reclaimable and far from Palestine), Fly 512 MB ($2.19–3.69/mo, Frankfurt), Railway Hobby (~$5–10/mo at low CPU), DigitalOcean $6, or Cloudflare Workers ($5/mo, no VM).
- Vercel was out of scope for persistent sockets in this pass (no pricing fetched); treat "Vercel for WebSockets" as **[unverified]** and unsuitable by architecture (serverless functions, no long-lived process).
- Hetzner is likely the best price/performance for a self-hosted stack, but I could not extract per-type prices (table is client-rendered); the only verifiable number is the €5.99/month floor, so any Hetzner total in this report must be treated as a floor, not a quote.

### Gaps
- Hetzner per-plan prices (CX22/CPX11/CAX11 vCPU/RAM/disk) not captured — **do not invent**; re-check https://www.hetzner.com/cloud/ in a browser.
- No dated latency measurement from Ramallah/Nablus/Hebron ISPs to Frankfurt, Amsterdam, Bahrain, or Tel Aviv was found. Azure publishes inter-region RTT tables that include an **Israel Central** region — [Azure network latency](https://learn.microsoft.com/en-us/azure/networking/azure-network-latency) **[documented table exists; column mapping not resolved, so no number is quoted]**.
- Vercel pricing/limits not fetched (out of scope by architecture).

---

## 7. Self-hosted OSRM/Valhalla + PostGIS + Centrifugo on one VPS: cost at 100/1,000/10,000 drivers and reliability given up

### Takeaway
A single VPS can run the whole stack (Postgres/PostGIS + OSRM/Valhalla + Centrifugo + Node API) and is the cheapest option at every tier — roughly $0 on Oracle Always Free, ~$6–12 on DigitalOcean, ~€6+ on Hetzner — but it converts every scaling problem into an ops problem: no failover, no managed backups, no DDoS absorption, and one disk failure loses live trips.

### Cited Findings
- OSRM is an open-source routing engine (repo `Project-OSRM/osrm-backend`) — [OSRM README](https://github.com/Project-OSRM/osrm-backend) **[documented]**
- Valhalla is open source under the **MIT License**, runs on open data, and its public demo enforces fair-use rate limits — [Valhalla README](https://github.com/valhalla/valhalla) **[documented]**
- VROOM is an open-source C++20 route-optimization engine (VRP with vehicles/resources); a paid "Vroom Premium" exists for traffic/speed accuracy — [VROOM README](https://github.com/VROOM-Project/vroom) **[documented]**
- Google OR-Tools is an open-source combinatorial-optimization suite (routing, CP-SAT, LP) — [OR-Tools README](https://github.com/google/or-tools) **[documented]**
- Oracle Always Free gives 2 OCPU / 12 GB Ampere + 200 GB block storage at $0, but idle instances can be reclaimed — [OCI Always Free docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) **[documented]**
- DigitalOcean 2 GiB/1 vCPU = $12/mo, 4 GiB/2 vCPU = $24/mo with 1–4 TB transfer — [DigitalOcean pricing](https://www.digitalocean.com/pricing/droplets) **[documented]**
- Hetzner cloud floor €5.99/month excl. VAT — [Hetzner Cloud](https://www.hetzner.com/cloud/) **[documented, floor only]**

### Inferences
- **100 drivers:** Oracle A1 free tier is enough (Centrifugo + Node + Postgres/PostGIS + OSRM Palestine extract). OSRM West Bank extract is small (a few hundred MB), so RAM is not the constraint; the constraint is Oracle's reclaim policy and 200 GB disk shared with Postgres WAL.
- **1,000 drivers:** a 2 vCPU/4 GB VPS ($12–24) handles ~5–10k WebSocket connections with Centrifugo (single node), but OSRM and Postgres compete for the same 4 GB; plan on 8 GB (~$24–48) or split routing onto a second box.
- **10,000 drivers:** one VPS stops being credible. Centrifugo scales horizontally only with a broker (Redis/NATS), Postgres needs a replica + PITR, and OSRM needs a dedicated machine for the routing graph. Expect 3–4 boxes (~$60–150/month) plus the ops time — still cheaper than managed, but now you are running a distributed system.
- Reliability given up: no SLA, single point of failure for dispatch, self-managed Postgres backups (pgBackRest/WAL-G), no managed DDoS protection, TLS renewal, OS patching, and no status page. A dead VPS means every live trip is orphaned until restore.

### Gaps
- Centrifugo and Soketi were not fetched in this pass; their free/self-host terms, connection ceilings and RN SDK support are **[unverified]** here. Centrifugo is open source and self-hostable (widely known) but this report should not quote its limits without a source.
- No benchmark of OSRM/Valhalla query latency on a 2 vCPU box for the Palestine extract was found.

---

## 8. Dispatch/optimization: VROOM, OR-Tools, OSRM, GraphHopper, Valhalla; what "Uber-quality dispatch" actually requires

### Takeaway
The optimization engines are free (VROOM, OR-Tools, OSRM, Valhalla); what Uber actually sells is not an optimizer but a *marketplace loop* — continuous re-ranking, batched offer waves, lease/expiry semantics, and a scoring model over ETA, acceptance probability, and driver economics. No vendor sells that loop as a drop-in service at SMB prices; GraphHopper sells routing API credits, not dispatch.

### Cited Findings
- VROOM solves VRP variants (vehicles, capacities, time windows) as an open-source C++20 engine; "Vroom doesn't replace domain expertise" and a paid Premium exists for accurate speed/traffic — [VROOM README](https://github.com/VROOM-Project/vroom) **[documented]**
- OR-Tools covers routing/CP-SAT/LP and is open source — [OR-Tools README](https://github.com/google/or-tools) **[documented]**
- Valhalla = MIT-licensed routing engine on open data; demo server rate-limited — [Valhalla README](https://github.com/valhalla/valhalla) **[documented]**
- GraphHopper Directions API free plan = **500 credits/day**; paid tiers **€69/mo (5,000/day), €199/mo (15,000/day), €479/mo (50,000/day)**, max locations and vehicles per request scale with tier — [GraphHopper pricing](https://www.graphhopper.com/pricing/) **[documented]**
- OSRM = open-source routing engine — [OSRM README](https://github.com/Project-OSRM/osrm-backend) **[documented]**

### Inferences
- "Uber-quality" is an architecture, not a library: (1) driver state stream with freshness decay, (2) candidate generation by geospatial index (PostGIS `ST_DWithin` / geohash), (3) ranking with ETA + acceptance probability + fairness, (4) **offer leases with expiry and idempotent accept** (a DO per city or a Postgres advisory-lock/`SELECT … FOR UPDATE SKIP LOCKED` loop), (5) re-offer on timeout, (6) surge/eligibility rules.
- Of those, only (2) and part of (4) are commodity. VROOM/OR-Tools solve batching/assignment given a cost matrix; they do not implement offer waves, leases, or acceptance modelling.
- A realistic build: PostGIS for candidates + VROOM (batch re-optimization every N seconds for scheduled/pooled trips) + a lease table in Postgres or a Durable Object per city for the live offer loop. That is a few weeks of engineering, not a purchase.
- GraphHopper/Google Maps pricing becomes relevant only for ETA quality at scale; at 500 credits/day free, a 100-driver pilot can use GraphHopper free for ETA spot-checks but not for per-ping map-matching.

### Gaps
- No vendor was found selling a turnkey "Uber dispatch loop" (offers/leases/ranking) as a service; I did not search exhaustively, so absence is not proof.
- No public, dated benchmark comparing VROOM/OR-Tools solution quality vs Uber's dispatch was found.

---

## 9. Cost model: pilot (100), city (1,000), scale (10,000) drivers

### Takeaway
At every tier the **realtime transport** decides the bill, not the database. Message-priced pub/sub costs ~$2,200/month at 10k drivers; Durable Objects cost ~$21. The cheapest credible combination is Cloudflare DO (transport) + Supabase/Neon Postgres (durable + PostGIS) + Fly/Railway (API), landing at roughly **$30–40 (100), $60–90 (1,000), $220–320 (10,000)** per month.

### Cited Findings
- Assumption set used below (**[unverified]**, stated so the writer can re-run): 1 position update per online driver every **10 s**, **8 h/day**, **26 days/month** = **74,880 messages/driver/month**; +20 % for rider fan-out on active trips; ~150 B payload.
- Resulting volume: **100 drivers ≈ 9.0M msg/mo; 1,000 ≈ 90M; 10,000 ≈ 900M** (arithmetic from the assumption above).
- Supabase Pro: $25 base, 5M messages included, **$2.50/M** after; 500 concurrent included, **$10 per 1,000** after — [Supabase pricing](https://supabase.com/pricing) **[documented rates]**
- Ably: $29 base, **$2.50/M messages**, $1.00/M connection-minutes — [Ably pricing](https://ably.com/pricing) **[documented rates]**
- Pusher: $49 (1M msg/day), $99 (4M/day), $299 (10M/day), $499 (20M/day) — [Pusher pricing](https://pusher.com/channels/pricing/) **[documented]**
- PubNub: 1,000 MAU $190, 10,000 MAU $550 — [PubNub pricing](https://www.pubnub.com/pricing/) **[documented]**
- Cloudflare DO: $0.15/M requests, WebSocket messages billed **20:1**, $12.50/M GB-s, $5 plan floor — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) **[documented]**
- Neon Launch: $0.106/CU-hour, $0.35/GB-month — [Neon pricing](https://neon.com/pricing) **[documented]**
- Railway: $20/vCPU-month, $10/GB RAM-month, $0.05/GB egress — [Railway pricing](https://railway.com/pricing) **[documented]**
- Fly: 512 MB Machine $3.69/mo, 1 GB $6.70/mo, egress $0.02/GB EU — [Fly pricing](https://fly.io/docs/about/pricing/) **[documented]**

### Inferences — modelled monthly totals (assumptions above; **[unverified]** arithmetic, documented unit prices)

| Component | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---|---|---|
| **Realtime — Cloudflare DO** | ~$5 (floor; volume within included) | ~$6–8 | ~$21 (requests ~$6.6 + duration ~$9.4 + $5 floor) |
| **Realtime — Supabase Realtime** | $25 + ~$10 = **~$35** | $25 + ~$213 = **~$238** | $25 + ~$2,238 = **~$2,263** |
| **Realtime — Ably** | ~$29 + ~$8 = **~$37** | ~$29 + ~$210 = **~$239** | ~$29 + ~$2,235 = **~$2,264** |
| **Realtime — Pusher** | **$49** (300k msg/day) | **$99** (~3M/day) | >$499 (30M/day exceeds 20M self-serve) |
| **Realtime — PubNub** | Free if <200 MAU, else **$98–190** | **~$190–210** | **~$550** |
| **Postgres (Supabase Pro)** | $25 | $25 + extra disk ~$1 = **$26** | $25 + ~$13 disk = **$38** (may need Medium compute $60) |
| **Postgres (Neon Launch)** | ~$20 (0.25 CU always-on) | ~$20 + storage | ~$20–40 + storage |
| **API host (Fly/Railway)** | $4–7 | $15–25 | $60–120 (2–4 vCPU) |
| **Egress** | <$1 | ~$5 | ~$30–50 |
| **Cheapest credible total** | **~$30–40** | **~$60–90** | **~$220–320** |

- If Supabase Realtime is used instead of DO, the 10k-driver bill goes to **~$2,300/month** — the single largest avoidable cost in the stack.
- At 10k drivers, storing every raw ping in Postgres is ~110 GB/month at 150 B/row (100 drivers ≈ 1.1 GB/month). Supabase's $0.125/GB overage makes that cheap in dollars but expensive in vacuum/index churn; store the latest position per driver + trip breadcrumbs at lower cadence instead.

### Gaps
- Rider/driver ratio, trips per driver-hour, and chat volume are assumed, not measured from Fastship/Wind telemetry.
- The table omits auth (Supabase MAU beyond 100k), push notifications (FCM/APNs free), SMS OTP (not priced here), and map tiles.

---

## 10. Free-tier cliffs (where each free tier actually breaks)

### Takeaway
The cliffs are ordered by how early they bite: **messages** (days), **connections** (one city district), **DB write/storage** (days to weeks), **compute hours** (half a month), **idle pausing/spin-down** (minutes), **project expiry** (30 days). Only Cloudflare's free tier fails on a daily request count rather than a monthly one, which paradoxically makes it more predictable.

### Cited Findings
- Supabase Free: **200 concurrent Realtime connections**, **2M messages/month**, **500 MB DB**, **5 GB egress**, pause after **1 week** inactivity, **no backups** — [Supabase pricing](https://supabase.com/pricing) **[documented]**
- Firebase Firestore Free: **50k reads/day, 20k writes/day, 20k deletes/day, 1 GiB, 10 GiB/month** — [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) **[documented]**
- Firebase RTDB Free: **100 simultaneous connections**, 1 GB, 10 GB/month — [RTDB limits](https://firebase.google.com/docs/database/usage/limits) **[documented]**
- Ably Free: **200 connections, 6M messages/month, 200 channels, 500 msg/s** — [Ably pricing](https://ably.com/pricing) **[documented]**
- Pusher Free: **100 connections, 200k messages/day** — [Pusher pricing](https://pusher.com/channels/pricing/) **[documented]**
- PubNub Free: **200 MAU or 1M transactions** — [PubNub pricing](https://www.pubnub.com/pricing/) **[documented]**
- Cloudflare DO Free: **100k requests/day, 13,000 GB-s/day, 5 GB SQLite**; DOs with KV backend not available on Free — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) **[documented]**
- Cloudflare Workers Free: **100k requests/day, 10 ms CPU** — [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) **[documented]**
- D1 Free: **5M rows read/day, 100k rows written/day, 5 GB** — [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) **[documented]**
- Neon Free: **100 CU-hours/month, 1 GB storage, scale-to-zero after 5 min**; exceeding CU-hours **suspends compute until next period** — [Neon pricing](https://neon.com/pricing) **[documented]**
- Render Free Postgres: **1 GB, expires 30 days after creation**; free web service spins down after **15 min** and takes **~1 min** to wake — [Render free docs](https://render.com/docs/free) **[documented]**
- Railway Free: **$1/month credit** — [Railway pricing](https://railway.com/pricing) **[documented]**
- Fly: **no free tier** — [Fly pricing](https://fly.io/docs/about/pricing/) **[documented]**
- Oracle Always Free: 2 OCPU/12 GB A1 + 200 GB block; **idle instances may be reclaimed** — [OCI docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) **[documented]**

### Inferences
- Time-to-cliff at 100 drivers / 10 s cadence / 8 h day:
  - Supabase messages (2M): **~7 days**; Pusher (200k/day at ~288k/day): **~17 hours of full operation**; Ably (6M): **~20 days**; RTDB connections (100): **instant** with 100 drivers + any rider; Firestore writes (20k/day): **~1.7 hours**.
  - Supabase DB (500 MB at ~43 MB/day of raw pings): **~11 days**.
  - Neon CU-hours (100 at 0.25 CU): **~16.7 days**, then compute suspends mid-month.
  - DO requests (100k/day at 20:1 ≈ 2M messages/day): **~24 driver-days**.
- "Free tier" for a live dispatch product is therefore a **development/staging** tier only. The first paid dollar should go to the realtime transport (DO) and a Postgres with backups (Supabase Pro/Neon Launch), not to a bigger VM.

### Gaps
- No vendor publishes "messages per subscriber" accounting for fan-out, so cliff dates for chat/presence may be 2–5× earlier than the table above.
- Push notification (FCM/APNs) limits were not researched; they are free but rate-limited.

---

## 11. Region latency to the West Bank (and where only regional evidence exists)

### Takeaway
No provider in this comparison has a Palestine or Levant region except Azure (Israel Central). Fly has none, Hetzner's nearest is Germany/Finland, Supabase/Neon offer Frankfurt, Oracle's nearest options are UAE/Saudi/EU (unverified which). Any latency claim for West Bank users is therefore an inference from European or Gulf PoPs, not a measurement.

### Cited Findings
- Fly.io region list: **ams, arn, cdg, dfw, ewr, fra, gru, iad, jnb, lax, lhr, nrt, ord, sin, sjc, syd, yyz** — no Middle East entry — [Fly regions](https://fly.io/docs/reference/regions/) **[documented]**
- Microsoft publishes inter-region round-trip latency statistics and the table includes an **Israel Central** row (region exists; no column mapping resolved in this pass, so no RTT is quoted) — [Azure network latency](https://learn.microsoft.com/en-us/azure/networking/azure-network-latency) **[documented, partially observed]**
- Hetzner Cloud's published locations are Germany/Finland/US/Singapore (page lists shared, dedicated and auction lines; no Levant location) — [Hetzner Cloud](https://www.hetzner.com/cloud/) **[documented]**
- Oracle: "You can create OCI Ampere A1 Compute instances in any availability domain, except South Korea North (Chuncheon)" — region availability for the Levant not stated — [OCI Always Free docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) **[documented, no Levant confirmation]**
- Ably claims 6.5 ms delivery latency and 11+ regions/700+ PoPs (vendor claim, no per-country data) — [Ably pricing](https://ably.com/pricing) **[documented, vendor claim]**
- PubNub claims <100 ms globally (vendor claim) — [PubNub pricing](https://www.pubnub.com/pricing/) **[documented, vendor claim]**

### Inferences
- Practical ranking for a West Bank deployment, by distance and available regions: **Azure Israel Central (documented region) < EU (Frankfurt/Amsterdam/Paris) < Gulf (Bahrain/UAE) < US**. This is geography, not measurement — labeled **[unverified]**.
- Expected RTT from Ramallah to Frankfurt is plausibly 60–90 ms and to Tel Aviv 10–30 ms; **I did not find a dated public measurement**, so the report must not present these as facts. If latency matters (it does for offer/accept), commission a RIPE Atlas measurement from Palestinian ASNs to fra/ams/tel-aviv before choosing a region.
- Cloudflare's anycast + DO single-homing means the DO location is chosen by the platform (location hints exist); a city-level DO per city (Ramallah/Nablus/Hebron) keeps state near users but does not reduce the client→PoP hop, which anycast already optimizes.

### Gaps
- **No public, dated RTT measurement for West Bank ISPs to any of these regions was found.** This is the single biggest evidence gap in this research.
- GCP `me-west1` (Tel Aviv) and AWS Israel availability were not verified in this pass; do not claim them without a source.
- Last-mile mobile latency in Palestine (3G/4G congestion, outages) dominates any datacenter choice and was not researched here.

---

## 12. Recommendation: cheapest credible combination, what to self-host, what to buy at a threshold

### Takeaway
Buy the realtime transport (Cloudflare Durable Objects) and a backed-up Postgres (Supabase Pro or Neon Launch); self-host nothing at pilot; self-host routing (OSRM/Valhalla) only when map-matching/ETA volume exceeds free API credits; self-host the realtime layer only if Cloudflare's DO model becomes constraining (vendor lock-in, SQLite limits, or a need for on-prem).

### Cited Findings
- DO pricing structure (20:1 WebSocket billing, hibernation, $5 floor) — [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) **[documented]**
- Supabase Pro $25 with 8 GB disk, daily backups, no pausing — [Supabase pricing](https://supabase.com/pricing) **[documented]**
- Neon Launch $0.106/CU-hour, $0.35/GB-month, PostGIS included — [Neon pricing](https://neon.com/pricing) **[documented]**
- Fly 512 MB $3.69/mo, 1 GB $6.70/mo, EU egress $0.02/GB — [Fly pricing](https://fly.io/docs/about/pricing/) **[documented]**
- Oracle Always Free 2 OCPU/12 GB A1 + 200 GB — [OCI docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) **[documented]**
- Render Free spins down after 15 min and Free Postgres expires in 30 days — [Render free docs](https://render.com/docs/free) **[documented]**
- GraphHopper free 500 credits/day, €69/mo for 5,000/day — [GraphHopper pricing](https://www.graphhopper.com/pricing/) **[documented]**

### Inferences — recommended stack by stage

| Stage | Realtime | Database | API host | Routing | Est. $/mo |
|---|---|---|---|---|---|
| **Dev / pilot (≤100 drivers)** | Cloudflare DO ($5 plan) | Supabase Pro ($25) *or* Neon Launch (~$20) | Fly 512 MB ($3.69) or Railway Hobby ($5) | OSRM self-host on same VM, or GraphHopper free 500/day | **$30–40** |
| **City (1,000)** | Cloudflare DO (~$6–8) | Supabase Pro + disk (~$26) | Fly 1 GB ($6.70) + a second for workers, or Railway (~$15) | OSRM on a 2 GB VPS ($12) | **$60–90** |
| **Scale (10,000)** | Cloudflare DO (~$21) | Supabase Pro/Medium ($60) or Neon Launch (~$40) | 2–4 vCPU across 2 regions ($60–120) | OSRM/Valhalla dedicated 4 GB ($24) + GraphHopper paid if ETA quality demands | **$220–320** |

- **Buy, don't build:** realtime fan-out (DO), Postgres with PITR/backups (Supabase/Neon), TLS/DDoS (Cloudflare), push (FCM/APNs).
- **Self-host only when the threshold is crossed:** OSRM/Valhalla when routing calls exceed ~500/day free or per-call cost > a $12 VPS (i.e., almost immediately for per-ping map-matching, but not for trip ETAs); Centrifugo/Soketi only if DO's single-vendor model or SQLite storage becomes a blocker; Postgres only if managed cost > ~$60/month and you have someone on call.
- **Do not** run the pilot on Oracle Always Free: idle reclamation, no SLA, no Levant region, and a single A1 instance holding both DB and realtime is one reboot from a full outage.
- **Do not** use Firebase for positions: write-billed and read-billed fan-out is the worst cost shape here, and RTDB's 100-connection Spark cap is below a pilot.
- The prior recommendation (Web PubSub + Container Apps + Postgres B2s in Israel Central) is credible on latency but is the **most expensive** of the shortlisted options at every tier; it should be treated as the "buy reliability" option, not the "cheapest credible" one. (Prior recommendation is context from the parent session, not independently verified here.)

### Gaps
- No quote for Azure Web PubSub / Container Apps / Postgres B2s was fetched in this pass, so the cost comparison against the prior recommendation is qualitative only.
- The recommendation assumes Cloudflare DO can satisfy data-residency expectations; Palestinian customer data stored in Cloudflare's global network may raise compliance questions that were not researched.
- Chat moderation, payments, and SMS OTP costs are outside this scope.
