# Independent red team: Uber, Careem, HungerStation and HAAT comparison

**Review date:** 13 November 2026  
**Purpose:** test the study's highest-impact claims against primary sources and identify what the comparison still cannot establish.

## Verdict

The study is **not reliable as an investment or operating benchmark in its current form**. Two central corporate claims are contradicted by primary sources; a group loyalty metric is misattributed to HungerStation; and the H3 geometry statement is technically false. The unusually precise performance, temperature, retention and UX claims lack the test artifacts needed to reproduce or compare them.

**Labels used below**

- **False** — a primary source contradicts the claim.
- **Company-reported** — the cited company says it, within the stated scope and period; this is not independent validation.
- **Unverified** — no adequate primary evidence or reproducible test was supplied. This does **not** mean the feature or result does not exist.

## 1. Ownership and the July 2026 transaction

| Study claim | Verdict | What the primary evidence supports |
|---|---|---|
| Uber owns **62.47% of Careem**. | **False** | Uber's Q3 2026 10-Q says it acquired an additional interest in **Careem Technologies** on **31 July 2026**, resulting in **approximately 60% ownership** and consolidation from that date. It also says **e& retained approximately 40%** as a redeemable non-controlling interest. [Uber Q3 2026 10-Q, Note 3](https://www.sec.gov/Archives/edgar/data/1543151/000154315126000041/uber-20260930.htm) |
| Uber bought back Careem's remaining **40%** from e&. | **False as stated** | The same filing says Uber moved from approximately 45% at 30 June to approximately 60% on 31 July, while e& still held approximately 40%. It describes an **additional ownership interest**, not a buyback of e&'s entire stake. Careem Technologies is the **non-ridesharing** business; Uber says it continued to own Careem ridesharing fully. The entity boundary matters. [Same filing](https://www.sec.gov/Archives/edgar/data/1543151/000154315126000041/uber-20260930.htm) |
| Uber **acquired Delivery Hero on 16 July 2026**. | **False if presented as completed** | On 16 July, Uber entered a business combination agreement and launched a **voluntary public takeover offer** at **€41.50 per share**, subject to acceptance, regulatory and other conditions. The expected closing was **H2 2027**, and the companies continued operating independently. [Uber 10-Q](https://www.sec.gov/Archives/edgar/data/1543151/000154315126000041/uber-20260930.htm); [Delivery Hero announcement](https://www.deliveryhero.com/newsroom/delivery-hero-and-uber-to-join-forces/) |
| Uber already controls **100% of Delivery Hero/HungerStation**. | **False** | Uber reported 24.99% ownership when it moved to equity-method accounting in Q2 and **24.5% as of 30 September 2026**. At announcement, Delivery Hero separately reported a 24.77% shareholding, instruments of 11.74%, and irrevocable tender commitments of 16.68%, producing **more than 53% total economic interest**. Share ownership, instruments, tender commitments and completed ownership are not interchangeable. [Uber 10-Q](https://www.sec.gov/Archives/edgar/data/1543151/000154315126000041/uber-20260930.htm); [Delivery Hero announcement](https://www.deliveryhero.com/newsroom/delivery-hero-and-uber-to-join-forces/) |

**Required correction:** distinguish **Careem Technologies**, **Careem ridesharing**, **Delivery Hero**, and the **HungerStation brand**. Do not describe post-close integration, synergies or unified availability as accomplished facts.

## 2. Performance, scale and loyalty metrics

| Claim | Verdict | Red-team finding |
|---|---|---|
| Delivery Hero recorded **1.0B orders, +25% orders, €12.8B GMV (+21%), €4.0B revenue (+31%), and €257M adjusted EBITDA (+58%) in Q3 2026**. | **Company-reported** | These match Delivery Hero's **group** Q3 2026 release. They do not establish HungerStation-only performance or any app's technical quality. GMV, revenue and adjusted EBITDA are different measures; the release also distinguishes like-for-like growth from reported-currency growth. [Q3 2026 trading update](https://www.deliveryhero.com/newsroom/delivery-hero-hits-one-billion-orders-in-q3-as-growth-accelerates-further/) |
| **61% of HungerStation GMV comes from paid loyalty.** | **Unverified / inconsistent with cited evidence** | The release says **subscribers generated 51% of Group GMV**, while **62% of Group GMV** came from customers using multiple verticals. Neither is a HungerStation-only paid-loyalty share, and 62% is not 61%. The study appears to combine two different group metrics. [Q3 2026 trading update](https://www.deliveryhero.com/newsroom/delivery-hero-hits-one-billion-orders-in-q3-as-growth-accelerates-further/) |
| **95% matching accuracy**, **70% of bookings initiated by voice**, and similar precise Careem product metrics. | **Unverified** | No primary disclosure, measurement window, market, denominator or definitions were supplied. “Accuracy” needs a ground truth; “voice bookings” must distinguish attempts, completed voice sessions and final paid orders. |
| Loyalty caused a **27% frequency increase**, **20% retention uplift**, or comparable cross-company gains. | **Unverified causal claims** | Subscriber GMV and customer activity cannot establish causation. Paid members may already be heavier users. A credible result needs cohort definitions, pre-period behaviour, churn windows, organic versus paid acquisition, and a controlled or otherwise credible incremental analysis. |

**Bottom line:** group disclosures can describe group scale, but they cannot rank Uber, Careem, HungerStation and HAAT on unit economics, service quality or app performance.

## 3. H3 and the latency claim

### Geometry: false

H3 is not a grid in which every cell has six neighbours or one that eliminates distortion. Uber's own documentation states that a sphere cannot be tiled entirely with hexagons and that **every resolution contains exactly 12 pentagons**. Its traversal documentation explicitly describes failures and special handling caused by **pentagonal distortion**. [H3 overview](https://h3geo.org/docs/core-library/overview); [H3 traversal API](https://h3geo.org/docs/api/traversal)

Hexagonal adjacency may be useful for spatial indexing, but it does not prove faster dispatch, better routes or distortion-free geometry.

### “3,300 ms → 114 ms”: arithmetic only, not a validated benchmark

The arithmetic is valid:

- speed-up: `3300 / 114 = 28.95`, approximately **28.9×**;
- latency reduction: `(3300 - 114) / 3300 = 96.55%`.

The conclusion that H3 improved **matching** latency is **unverified**. No benchmark date, software versions, dataset, query mix, hardware, cache state, concurrency, warm-up, repetitions, percentile, error bars or production trace was supplied. A spatial-index lookup is only one component of end-to-end matching; an average database/query timing cannot be relabelled as rider-to-driver matching latency. A valid comparison needs the same workload and system boundaries for both measurements, plus p50/p95/p99 and production confirmation.

## 4. “Shaded Route”, LiDAR, temperature and retention

The named **Shaded Route** capability, real-time 3D/LiDAR shading, **10–15°C** lower food temperature and **20%** retention uplift remain **unverified**. A search of Delivery Hero's engineering blog returned no matching article; that is only an absence-of-evidence check, **not proof that the feature does not exist**. [Delivery Hero Tech search](https://tech.deliveryhero.com/?s=shaded+route)

These are separate claims and each needs its own evidence:

1. **Deployment:** product documentation identifying market, app version, dates and eligible devices/routes.
2. **Sensing:** whether LiDAR is on-device, pre-mapped or otherwise sourced; coverage and fallback behaviour.
3. **Temperature:** sensor location, packaging, ambient conditions, route length, solar exposure, sample size and a non-shaded control.
4. **Customer outcome:** a defined food-quality measure rather than an inferred temperature benefit.
5. **Retention:** a controlled experiment with cohort window, denominator and confidence interval; a route effect cannot simply be equated with a retention effect.

Until then, the study presents a plausible-sounding causal chain as measured fact without evidence for any link.

## 5. UX assertions: what can and cannot be concluded

| Assertion | Verdict | Evidence required |
|---|---|---|
| Uber registration takes **8 taps**; competitors are simpler or slower. | **Unverified** | Exact iOS/Android versions, country, language, account state and a step definition. Social login, autofill, OTP delivery and permission prompts can change the path. Screens alone do not measure elapsed time or completion rate. |
| Uber supports guest checkout; Careem/HungerStation require accounts. | **Unverified** | Successful checkout tests by market, platform, product, payment method and date. A visible “continue as guest” control is not proof of completed checkout; a login wall in one market is not a global rule. |
| Only Careem provides real-time driver tracking. | **Unverified** | Equivalent live-order tests for every app, with screenshots/recordings and timestamps. Feature lists or marketing screenshots cannot establish update frequency, freshness or exclusivity. |
| Careem's wallet is deeper and HungerStation's checkout takes **5 steps**. | **Unverified as a comparison** | A common wallet-feature checklist and identical checkout journey, including address, substitutions, vouchers, tipping, payment authentication and errors. Number of screens is not necessarily number of user decisions. |
| HungerStation is faster or easier; Careem is the best service. | **Unverified** | Task success, elapsed time, error/recovery rate and accessibility results using the same device, network, market, basket and participant protocol. Preference or visual polish is not service quality. |
| HAAT has equivalent features, better performance or broader availability. | **Unverified** | Versioned app/store evidence and observed market-level tests. No public financial or operating evidence supplied here supports an apples-to-apples HAAT ranking. |

These UX assertions should be rewritten as **dated observations about specific builds and markets**, or removed. They must not be generalised to all countries, all users or all app versions.

## 6. Cross-company comparability defects

The comparison currently mixes incompatible units of analysis:

- **Group versus brand:** Delivery Hero group KPIs are not HungerStation KPIs.
- **Entity versus product:** Careem Technologies, Careem ridesharing and the Careem app are not interchangeable.
- **Financial versus operational measures:** GMV, revenue, adjusted EBITDA, retention, matching latency and checkout steps cannot be combined into an unsupported overall ranking.
- **Reported versus like-for-like growth:** currency, hyperinflation and changes in consolidation scope affect comparability.
- **Feature presence versus production outcome:** a control, class name, screenshot or marketing claim does not demonstrate reliability, scale or business impact.
- **Correlation versus causation:** subscriber mix and route temperature do not by themselves prove incremental frequency or retention.

## 7. Questions investors and operators still cannot answer

### Investment and transaction

1. What are HungerStation's and Careem Technologies' **standalone revenue, contribution margin and free cash flow**, after courier cost, promotions, refunds, support and payment fees?
2. What is the **current offer acceptance, regulatory and closing status** of the Delivery Hero transaction, and what remedies or market disposals are required?
3. Which economics belong to Uber, e&, Delivery Hero shareholders or other partners before and after each transaction?
4. What are market-level customer and courier acquisition costs, payback periods, subsidy dependence and mature-cohort contribution margins?

### Service and market operations

5. By city and product, what are p50/p95 promised-versus-actual delivery time, cancellation, lateness, missing/wrong-item, refund and support-resolution rates?
6. Where is each feature actually available **today**, by country, city, platform, language and app version? Country counts do not establish nationwide availability.
7. What are courier net earnings, unpaid waiting time, incentives, insurance, churn and utilisation under comparable definitions?
8. How do batching, basket size, distance, weather, restaurant preparation and courier supply affect the service comparisons?

### Product and technical evidence

9. What are the benchmark artifacts behind every precise percentage and latency claim: raw results, dates, versions, denominators, confidence intervals and owners?
10. What is the incremental effect of paid loyalty after controlling for self-selection, promotions and pre-existing order frequency?
11. Is Shaded Route deployed in production, on which routes/devices, and do controlled measurements connect shade to food quality and then to retention?
12. What proportion of end-to-end dispatch latency is spatial lookup, network, matching policy, courier response and retry behaviour?

## Evidence standard for a revised comparison

For each performance or UX claim, preserve a dated source or test bundle containing the market, app/build version, device and network, workload, denominator, raw results and comparison baseline. Financial claims should link to the exact filing/release and retain their group/brand scope. Causal claims require controlled experiments or a defensible causal design. If those artifacts are unavailable, use **“company-reported”** or **“unverified”** rather than a numerical conclusion or ranking.
