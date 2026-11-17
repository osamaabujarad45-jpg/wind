# Architecture, performance, operations and corporate audit

**Research date:** 2026-11-13  
**Scope:** The supplied architecture, performance, migration, campaign, operations and market claims. This is not a generic comparison of the companies or a claim that their 2026 production systems remain identical to old engineering articles.

## Verdicts and evidence limits

- **Supported:** Primary evidence establishes the material claim, with necessary scope.
- **Partly supported:** A real component or narrower result exists, but the claim overstates attribution, scale, deployment or measurement.
- **Not publicly verifiable:** The requested number, present deployment or causal assertion lacks sufficient public evidence. This does not prove the system or result does not exist.
- **Contradicted:** Available primary evidence establishes a materially different fact.

Historical articles establish what their authors reported at publication, not unchanged production architecture in 2026. Company engineering articles and campaign pages are primary accounts of company claims, not independent measurements. Autoscaling is not an acceptable sole cause for a migration-wide result.

## 1. H3 and the traffic pipeline

| Claim | Verdict | Correction and evidence |
|---|---|---|
| Exactly 12 pentagons occur at every H3 resolution. | **Supported** | Uber’s H3 overview states that each resolution has 12 pentagons. The total includes the icosahedron’s 12 vertices; pentagons are not distributed like ordinary hexagons. [H3 overview](https://h3geo.org/docs/core-library/overview) |
| Pentagonal distortion and traversal need special handling. | **Supported** | H3 documents pentagon-centered distortion and failed/special traversal cases. The practical correction is to handle pentagon-related failures rather than pretend H3 is distortion-free. [H3 traversal](https://h3geo.org/docs/api/traversal) |
| H3 eliminates geohash distortion. | **Contradicted** | H3 changes the grid and its distortion characteristics; it does not eliminate distortion. The pentagon documentation directly disproves the absolute wording. |
| GPS arrives about every four seconds, with tens of billions of updates daily. | **Partly supported** | Uber’s corrected 2026 traffic article describes roughly four-second GPS pings **per trip**, not a universal four-second interval for every phone, vehicle or fleet. It reports tens of billions of daily location updates. [Uber: Scaling real-time traffic](https://www.uber.com/us/en/blog/scaling-real-time-traffic/) |
| About two million segment predictions per second are produced. | **Supported, company-reported** | The same article reports approximately 2M segment predictions/second. That is a traffic-segment prediction rate, not proof of two million completed trips or matches per second. |
| DeepETT improved ETA performance. | **Partly supported** | Uber reports DeepETT outcomes in its company engineering account. Keep the result attached to the measured model, routes and evaluation period; do not turn it into a universal ETA improvement or an H3-only effect. |

## 2. Uber storage, gateway and mobile stack

| Claim | Verdict | Correction and evidence |
|---|---|---|
| Docstore is MySQL-backed, with Raft-based regional replication. | **Partly supported** | Uber describes Docstore as a distributed, MySQL-backed database with Raft-based replication. Its architecture includes regional replication; the exact supplied 150 µs leader / 10 ms regional / 250 µs follower figures are not independently established here and should not be presented as current global SLOs. [Uber: Docstore](https://www.uber.com/en-US/blog/docstore/) |
| The gateway uses Go, gzip and three load-balancing algorithms. | **Partly supported** | Uber’s gateway article supports a Go-based gateway, compression and multiple load-balancing strategies. A rounded 300 µs P50 figure is not a universal gateway latency guarantee. [Uber gateway architecture](https://www.uber.com/en-US/blog/gateway-architecture/) |
| RIBs modularise the mobile apps. | **Supported, architecture-level** | Uber describes RIBs as its cross-platform mobile architecture. The supplied 50+/200+ app-module counts and exact 20–25% cold-start improvement need a matching version and benchmark before they can be repeated as facts. [Uber: RIBs](https://www.uber.com/en-US/blog/rib-architecture/) |
| Fusion uses flat binary serialization and code generation. | **Supported, architecture-level** | Uber’s Fusion article supports the code-generated, flat-binary approach. Its **99.99%/99.999%** availability statements are company-reported service availability, not serialization latency and not QUIC latency. [Uber: Fusion](https://www.uber.com/en-US/blog/fusion/) |
| QUIC improves latency by exactly 75 ms P50 / 150 ms P95. | **Not publicly verifiable in the supplied form** | Protocol choice and a specific benchmark are separate claims. Do not merge Fusion availability, serialization design and unverified QUIC numbers into one performance result. |

## 3. Careem search, caching and fraud detection

| Claim | Verdict | Correction and evidence |
|---|---|---|
| Galileo uses a Go backend named Kepler and embedded Bleve indexes. | **Supported, 2022 account** | Careem’s corrected full-text-search article identifies Kepler, embedded Bleve indexes and Kafka/CloudEvents synchronization. Its benchmarks are synthetic; the article does not establish unchanged 2026 deployment or the supplied retention claim. [Careem: Galileo](https://engineering.careem.com/posts/galileo-implementing-full-text-search-without-elastic-search) |
| Galileo’s synthetic latency is exactly 15 ms P50 / 30 ms P99. | **Partly supported** | Treat the published figures as the article’s synthetic benchmark, not production SLOs. They do not validate a current retention period or all search workloads. |
| Careem’s Redis/Quadrant service provides an exact 10 ms P50 read with the supplied configuration. | **Not publicly verifiable** | No resolved primary source establishes the exact configuration and latency together. Do not borrow Galileo’s benchmark to fill this gap. |
| Careem used S3/Hive/EMR/PySpark and SQS/Python/Elastic Beanstalk in the fraud pipeline. | **Supported, 2021 account** | The AWS/Careem article describes these components and Neptune ML/SageMaker/DGL. [AWS: Careem identity fraud detection](https://aws.amazon.com/blogs/machine-learning/how-careem-is-detecting-identity-fraud-using-graph-based-deep-learning-and-amazon-neptune/) |
| Neptune achieved about 85% precision and greater than 50% recall. | **Supported, initial testing only** | Those results belong to initial testing in the article. Production deployment was future work; the source does not establish a single-digit-millisecond synchronous fraud result. |

## 4. HungerStation migration and ETA

| Claim | Verdict | Correction and evidence |
|---|---|---|
| The cited migration is an AWS case study. | **Contradicted** | The official customer story is published by **Google Cloud**, not AWS. [Google Cloud: HungerStation](https://cloud.google.com/customers/hungerstation) |
| Daily deliveries increased 2.5× and downtime was virtually eliminated because of autoscaling. | **Partly supported; sole attribution contradicted** | Google Cloud reports 2.5× daily deliveries and virtually eliminated downtime **since migration**. Those are migration-wide outcomes, not autoscaling-only effects. Capacity, reliability, demand and other changes cannot be separated by the case-study wording. |
| HungerStation’s ETA system has the supplied exact 88% accuracy and latency numbers. | **Not publicly verifiable** | No matching primary evidence establishes those exact figures and their measurement definition. “Accuracy” also needs an error metric, horizon, geography and evaluation window. |

## 5. HAAT benchmark

| Claim | Verdict | Correction and evidence |
|---|---|---|
| HAAT reduced CPU by 58%, cache misses by 97%, and latency from 3.3 s to 114 ms using H3. | **Not publicly verifiable** | The supplied Microsoft Startups URL did not resolve to usable primary evidence. No retrieved primary source establishes the exact CPU, cache-miss or latency figures. |
| The latency result is a 28.95× improvement and a 96.55% reduction. | **Arithmetic supported; benchmark unsupported** | `3300 / 114 = 28.95` and `(3300-114)/3300 = 96.55%`. Arithmetic does not validate the underlying benchmark, workload, H3 attribution or matching latency. |
| HAAT processes 120M records daily and added 30% street coverage. | **Not publicly verifiable** | No retrieved primary evidence establishes these exact figures. Missing public evidence does not prove they are false. |

## 6. Shaded Route campaign

| Claim | Verdict | Correction and evidence |
|---|---|---|
| HungerStation ran a Shaded Route campaign. | **Supported** | The official VML page confirms the campaign and reports its outcomes. [VML: The Shaded Route](https://www.vml.com/work/the-shaded-route) |
| The campaign generated 20K shaded kilometres daily. | **Contradicted** | VML reports **more than 114K shaded kilometres daily**, not 20K. It also reports **16K shaded rides daily**. |
| Rider and delivery outcomes improved. | **Supported as campaign-reported** | VML reports **+8% rider applications**, **+20% rider retention**, **+15% satisfaction**, **+20% peak-time deliveries**, and **+3K daily active riders**. These are the campaign agency’s reported outcomes, not independent causal measurements. |
| Shade was measured to lower food temperature by 10–15°C. | **Contradicted as worded** | VML says shade can make air **feel 10–15°C cooler** and discusses preserving food freshness. It does not disclose controlled food-temperature measurements. Campaign Middle East attributes cooler-route and phone-LiDAR details to HungerStation, which remains secondary coverage. [Campaign Middle East](https://campaignme.com/hungerstation-uses-ai-to-shield-riders-from-the-desert-heat/) |

## 7. Corporate and market claims

| Claim | Verdict | Correction and evidence |
|---|---|---|
| Uber acquired an additional interest in Careem Technologies on 31 July 2026. | **Supported** | Uber’s Q3 2026 10-Q reports approximately 60% ownership of Careem Technologies after the additional acquisition, with e& retaining approximately 40%. This entity-specific statement must not be broadened to every Careem operating company or product. [Uber Q3 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1543154/000154315426000041/uber-20250930.htm) |
| Uber bought e&’s remaining 40% of Careem Technologies. | **Contradicted** | The same filing says e& retained approximately 40%. Acquiring an additional interest is not acquiring the remaining stake. |
| Uber completed its Delivery Hero acquisition on 16 July 2026. | **Contradicted** | Uber announced an agreement and voluntary public takeover offer; completion remained subject to conditions and was expected in H2 2027. Announcement is not completed ownership. [Delivery Hero announcement](https://www.deliveryhero.com/newsroom/delivery-hero-and-uber-to-join-forces/) |
| Delivery Hero’s group KPIs prove HungerStation’s app quality. | **Contradicted** | Group GMV, revenue and adjusted EBITDA describe the consolidated group, not HungerStation’s standalone UX or reliability. They cannot substitute for app-level measurements. [Delivery Hero Q3 2026 update](https://www.deliveryhero.com/newsroom/delivery-hero-hits-one-billion-orders-in-q3-as-growth-accelerates-further/) |
| HungerStation has a specific current market-share percentage in Saudi Arabia. | **Not publicly verifiable from the supplied evidence** | A market-share figure needs a dated market definition, denominator and methodology. Company filings and campaign articles do not establish one by themselves. |

## 8. Consolidated corrections

1. **H3:** 12 pentagons per resolution is correct; “eliminates distortion” is false. Handle pentagon-related traversal explicitly.
2. **Uber traffic:** Four-second GPS is per trip; tens of billions of updates and approximately 2M segment predictions/second are company-reported rates, not trip counts.
3. **Uber mobile/backend:** Keep benchmark figures tied to their source, version and measurement. Do not combine Fusion availability with QUIC latency or treat Docstore regional figures as universal SLOs.
4. **Careem:** Galileo’s Kepler/Bleve architecture and synthetic benchmarks are supported for the cited 2022 article. Redis/Quadrant exact latency remains unverified. Neptune’s 85% precision and >50% recall are initial test results, not production latency.
5. **HungerStation:** The migration source is Google Cloud, not AWS. The 2.5× delivery and downtime outcomes are migration-wide, not autoscaling-only. Exact ETA accuracy remains unverified.
6. **HAAT:** 28.95× and 96.55% are valid arithmetic only. The CPU, cache-miss, record-volume and coverage claims lack retrieved primary evidence.
7. **Shaded Route:** VML reports >114K shaded km/day and 16K shaded rides/day, plus campaign-reported rider and delivery gains. Perceived heat relief is not controlled phone/food temperature evidence.
8. **Corporate:** Careem is approximately 60% Uber / 40% e&, not wholly Uber-owned or 50/50. Delivery Hero’s HungerStation acquisition was announced subject to approvals, not proof of completed ownership.
9. **Market share:** No supplied source establishes a current Saudi market-share percentage. Require dated methodology before publishing one.

## Source-quality note

Primary engineering and campaign sources are useful for what their authors measured or reported, but they are not independent validation. Where only secondary coverage or arithmetic was available, this audit says so rather than upgrading it to primary evidence. “Not publicly verifiable” is an evidence verdict, not a claim of falsity.
