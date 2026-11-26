# Delivery comparison master evidence

**Date:** 2026-11-13
**Purpose:** Single entry point for agents reviewing the Uber, Careem, HungerStation and HAAT comparison.

## Agent instructions

Read this file, then every local evidence file in section 4. Use section 5 to check the primary sources. This is a corrected synthesis and evidence index, not a substitute for the detailed notes. Do not treat missing public evidence as proof of absence.

Evidence labels: **verified public fact**, **company-reported**, **historical design**, **unverified**, and **contradicted**. No apps, production systems or Palestinian checkouts were tested for this reconciliation.

## 1. Corrected synthesis

| Topic | Correct interpretation |
|---|---|
| H3 geometry | H3 does not eliminate distortion or give every cell six equidistant neighbors. It has 12 pentagons at every resolution and documented pentagon-related distortion/traversal cases. It is a spatial index, not proof of faster dispatch. |
| H3 latency | An H3 operation time is not rider-to-driver matching latency. Benchmarks need operation boundaries, hardware, dataset, concurrency and p50/p95/p99. |
| Uber traffic | Uber reports about 2 million traffic-segment predictions/second, not 2 million trips or matches/second. Four-second GPS is per trip, not a universal device interval. |
| Careem architecture | Galileo/Kepler/Bleve and the Neptune fraud design are historical engineering accounts, not current production SLOs. Neptune precision/recall was initial testing; production deployment was future work in that account. The Galileo article's synthetic laptop table reports approximately 0.5–1087.7 ms by query type and collection size; it does not support a generic 15 ms P50 / 30 ms P99 claim. |
| HungerStation migration | Google Cloud reports 2.5x daily deliveries and virtually eliminated downtime after migration. These are migration-wide company-reported outcomes, not proof autoscaling alone caused them. |
| Shaded Route | The campaign exists. VML reports retention, satisfaction and delivery gains; these are campaign-reported outcomes, not independent causal measurements. Perceived heat relief is not a controlled 10-15 degree Celsius food-temperature reduction. |
| HAAT 3300ms to 114ms | Arithmetic is 28.95x faster and 96.55% lower latency. The benchmark and attribution to H3 remain unverified without workload, environment, percentiles and raw results. |
| Other HAAT metrics | Exact CPU, cache-miss, daily-record and street-coverage figures need primary artifacts; do not present them as independently verified. |
| Backend stacks | Engineering pages support particular components at particular dates, not a complete current stack or request path in 2026. |
| Delivery Hero / HungerStation | Group orders, GMV, revenue and EBITDA describe Delivery Hero's consolidated group, not HungerStation alone and not app quality. |
| Careem ownership | Reconciled: e& announced a 12.50-percentage-point transfer and 37.53% retained ownership, making 62.47% a **derived complement**, not a directly disclosed Uber figure. Uber's Q3 2026 10-Q separately reports approximately 60% Uber / 40% e& and consolidation from 31 July 2026. Both descriptions must retain the Careem Technologies / non-ridesharing entity boundary; neither means every Careem entity is 62.47% Uber-owned. |
| Palestine | Historical launches, app-store presence and city counts do not establish current service at a named Palestinian address. Neither presence nor absence should be asserted without current address-level evidence. |

## 2. Fastship implications

Useful hypotheses, not proof of competitor superiority:

- HAAT publicly emphasizes informal addressing, underserved communities and cash/card flexibility.
- Shaded Route is a useful courier-welfare and potential supply-retention example.
- Careem articles are architecture case studies, not production guarantees.
- Uber's traffic pipeline demonstrates location-data value, not a stack Wind should copy.

For an approximately 50-user parcel/COD pilot, prioritize reliable addresses/manual pins, duplicate prevention, connectivity recovery, COD reconciliation and proof of delivery, courier exceptions, completed support/refunds, and courier net economics. Do not copy hyperscale infrastructure merely because a large competitor uses it.

## 3. Missing decision-grade evidence

**Economics:** use a common delivered-order ledger: net receipts = merchant commission + consumer platform fees excluding tips + allocated ads/subscriptions; contribution = net receipts - courier - payment/cash - refunds/fraud/support/insurance - platform promotions - other variable cost. State VAT treatment. Add separate customer, merchant and courier CAC, completed-order cohorts, contribution-based LTV and downside scenarios.

**Reliability:** add acceptance, assignment, cancellation by responsible party, p50/p95 delivery/lateness, missing/wrong items, substitution, refund decision and money-received times, support response/resolution and post-exception retention.

**Couriers:** measure net engaged and online hourly earnings after waiting, empty travel, fuel, depreciation, insurance, data, taxes and cash-settlement costs. Include payout latency, deactivation evidence, appeals and classification review.

**Cash/fraud/safety:** add cash variance, float failures, settlement aging, proof of delivery, promo/refund abuse, account takeover, fake-delivery controls, incident rates and loss per order/bps of GMV.

**Regulation:** separate Saudi, Palestinian and Israeli matrices for entity/licensing, consumer/e-commerce, tax/invoices/e-invoicing, labor/social insurance, payments/cash, privacy/transfers, food/pharmacy and accessibility.

**Availability:** for each city/build, record app version, storefront, account requirements, address/manual-pin result, quote, fees, final pre-commit checkout and local terms. Add low-connectivity recovery, duplicate prevention, accessibility and informal-address tests.

## 4. Complete local evidence package

Agents must read all four files:

1. [Corporate and market evidence](../research/delivery-comparison-evidence/corporate-market.md) - transactions, Uber results, HAAT funding/scale, HungerStation market claims and historical Palestine launches.
2. [Architecture and performance evidence](../research/delivery-comparison/architecture-performance.md) - H3, Uber, Careem, HungerStation, HAAT and Shaded Route technical claims.
3. [Operations and decision-readiness gaps](../research/delivery-comparison-evidence/operations-gaps.md) - economics, reliability, couriers, cash/fraud/safety, connectivity, regulation and research protocols.
4. [Independent red-team review](../research/delivery-comparison-evidence/independent-red-team.md) - independent classifications, evidence limits and unanswered operator questions.

## 5. Primary-source index

### Engineering
- H3 overview: https://h3geo.org/docs/core-library/overview
- H3 traversal: https://h3geo.org/docs/api/traversal
- Uber traffic: https://www.uber.com/us/en/blog/scaling-real-time-traffic/
- Uber Docstore: https://www.uber.com/en-US/blog/docstore/
- Uber gateway: https://www.uber.com/en-US/blog/gateway-architecture/
- Uber RIBs: https://www.uber.com/en-US/blog/rib-architecture/
- Uber Fusion: https://www.uber.com/en-US/blog/fusion/
- Careem Galileo: https://engineering.careem.com/posts/galileo-implementing-full-text-search-without-elastic-search
- AWS/Careem fraud: https://aws.amazon.com/blogs/machine-learning/how-careem-is-detecting-identity-fraud-using-graph-based-deep-learning-and-amazon-neptune/
- Google Cloud/HungerStation: https://cloud.google.com/customers/hungerstation
- VML/Shaded Route: https://www.vml.com/work/the-shaded-route
- Campaign Middle East secondary coverage: https://campaignme.com/hungerstation-uses-ai-to-shield-riders-from-the-desert-heat/

### Companies and markets
- HAAT: https://haat.delivery/
- HAAT funding/CTech: https://www.calcalistech.com/ctechnews/article/sj1jyjx2zg
- HAAT profile/CNN: https://www.cnn.com/2026/09/20/middleeast/israel-food-delivery-app-intl
- Careem profile: https://www.careem.com/en-AE/about-us/
- Careem legal: https://www.careem.com/en-AE/legal/
- Uber Q1 2026: https://investor.uber.com/news-events/news/press-release-details/2026/Uber-Announces-Results-for-First-Quarter-2026/default.aspx
- Uber Q3 2026: https://investor.uber.com/news-events/news/press-release-details/2026/Uber-Announces-Results-for-Third-Quarter-2026/default.aspx
- Delivery Hero Q3 2026: https://www.deliveryhero.com/newsroom/delivery-hero-hits-one-billion-orders-in-q3-as-growth-accelerates-further-raises-full-year-guidance/
- Delivery Hero/Uber announcement: https://www.deliveryhero.com/newsroom/delivery-hero-and-uber-to-join-forces/
- Eurex Delivery Hero update: https://www.eurex.com/ex-en/rules-regs/corporate-actions/corporate-action-information/Delivery-Hero-SE-Cash-Takeover-5285646
- e& stake sale completion: https://www.eand.com/content/dam/eand/assets/docs/latest-announcements/2026/eand-successfully-completes-the-sale-take-in-careem-technologies-to-uber-en.pdf
- e& retained-stake announcement: https://www.eand.com/content/dam/eand/assets/docs/latest-announcements/2026/adx-announcement-divest-partial-stake-in-careem-en-01-june-26.pdf
- Uber Q3 2026 10-Q / Careem Technologies ownership: https://www.sec.gov/Archives/edgar/data/1543151/000154315126000041/uber-20260930.htm
- HungerStation market-share secondary report: https://www.pymnts.com/cpi-posts/saudi-arabia-reviews-ubers-14-8-billion-delivery-hero-takeover/

### Historical Palestine reporting
- Arab News/Careem Gaza and Nablus: https://www.arabnews.com/corporate-and-sponsored-content/careem-announces-launch-operations-gaza-nablus-1223516
- MENAbytes historical account: https://www.menabytes.com/careem-gaza-nablus/

## 6. Verification protocol

The independent review covered this file and all four local evidence files, checked local links and the external-source index, reconciled corporate ownership and transaction status, and tested the principal technical corrections against accessible primary sources. Future changes must repeat the same checks rather than treating this review as permanent validation.

## 7. Independent verification record

**Status:** VERIFIED WITH QUALIFICATIONS for the corrected synthesis in this file. This is **not** a blanket verification of every claim in the underlying research notes, nor evidence that any platform is operationally best.

**Reviewer:** fresh `explore` subagent, independent of the research authors.  
**Review date:** 2026-11-13.  
**Files read:** this master plus `corporate-market.md`, `architecture-performance.md`, `operations-gaps.md`, and `independent-red-team.md`. All four local links resolve.

### Material reviewer findings and corrections

1. **Careem Galileo latency:** the architecture ledger's generic `15 ms P50 / 30 ms P99` wording is not supported by the cited Galileo article. The article's synthetic laptop table reports results from approximately **0.5 ms to 1087.7 ms**, depending on query and collection size, without those P50/P99 labels. The corrected synthesis above removes the unsupported generic latency claim.
2. **Delivery Hero Q3 2026:** the independent-red-team ledger contains stale/incorrect group figures. The corrected company release reports **1,001M orders**, **€13.9346B GMV**, and **€4.3479B revenue**, with like-for-like growth of **+11.5%**, **+13.6%**, and **+22.0%**, respectively. It does not substantiate the ledger's `~€12.8B GMV`, `€4.0B revenue`, or `€257M adjusted EBITDA (+58%)` wording. These remain Delivery Hero **group** metrics, not HungerStation-only results.
3. **Careem ownership:** the corporate ledger's `62.47%` is a valid arithmetic complement of e&'s disclosed `37.53%` retained stake, but is derived rather than directly disclosed. Uber's 10-Q separately reports approximately **60% / 40%**, consolidation from **31 July 2026**, and continued full ownership of Careem ridesharing. The conflict is resolved by presenting both figures with their source and entity scope, not by choosing one as universally correct.
4. **Shaded Route:** the independent-red-team section is too broad when it leaves the whole capability merely unverified. VML's campaign page supports the named campaign and company/agency-reported outcomes, including **>114K shaded km/day**, **16K shaded rides/day**, **+20% rider retention**, **+15% satisfaction**, and **+20% peak-time deliveries**. These remain campaign-reported, not controlled causal measurements. Controlled **10–15°C** food-temperature improvement remains unsupported.
5. **HAAT arithmetic:** `3300 / 114 = 28.947...` and `(3300-114)/3300 = 96.545...%`; the rounded **28.95×** and **96.55%** statements are correct. The underlying production workload, benchmark, and H3 attribution remain unverified.
6. **Corporate transaction:** the Delivery Hero release and Eurex update support a pending transaction, not a completed July takeover. Uber's reported attributable interest and the expected H2 2027 closing must not be conflated with completed ownership.

### Per-file verdicts

| File | Verdict |
|---|---|
| `corporate-market.md` | Useful claim ledger; ownership wording is appropriately qualified. Treat secondary funding, valuation, and market-share figures as dated reports, not universal facts. |
| `architecture-performance.md` | Strong historical/source caveats, but its generic Galileo latency row requires the correction recorded above. Do not use old engineering posts as current production SLOs. |
| `operations-gaps.md` | Decision-readiness recommendations and formulas are coherent; they are not evidence that live regulatory, accessibility, checkout, or courier tests passed. |
| `independent-red-team.md` | Useful adversarial classifications, but its Q3 group metrics and broad Shaded Route limitation are stale relative to the cited releases; use the corrections above. |

### Source-access limitations

- CNN returned **HTTP 451** and Calcalist/CTech could not be independently fetched by the reviewer. HAAT funding, valuation, founding, and scale therefore remain secondary/company-reported in this package.
- e& PDF text was not directly parseable by the fetch tool; the ownership reconciliation uses preserved filing excerpts plus Uber's SEC filing.
- Some localized Uber engineering URLs redirected or were unavailable, so exact historical gateway/load-balancer details were not independently revalidated.
- No app/device, production, Palestinian-address, checkout, accessibility, or courier test was performed. Current availability and UX claims remain unverified.

### Final assessment

The corrected master is a reliable **qualified research synthesis** for an agent to use as an entry point. It is not decision-grade proof of profitability, service quality, current country availability, or technical superiority. Read the four ledgers for detail, apply the corrections in this section, and preserve the distinction between primary evidence, company-reported outcomes, historical designs, and unverified claims.

---

## 8. Dialect parity (13 Nov 2026, leader-verified)

This study compares *features*. It matters to Fastship that a large share of the comparable
feature set is not reachable in its own pilot. Added by the leader pass; evidence in
[`docs/REA/2026-11-13-VERIFIED-ADDITIONS.md`](../docs/REA/2026-11-13-VERIFIED-ADDITIONS.md) §1.

- **The deployed pilot writes SQLite.** `server/db/runtime.ts:1-27` has three branches: no
  `WIND_DATABASE_URL` → SQLite (`:9`); `WIND_POSTGRES_STAGING=1` + a valid non-loopback URL →
  Postgres pinned to `search_path=wp16_staging` (`:11-18`, a staging path, not the production
  cutover); any other URL → throws at `:20-21`. The deployed dialect is established from the
  deployment (the nightly host backup is a SQLite file; one EC2 host with SQLite), not from the
  code alone.
- **Twelve domain modules gate on `db.backend === 'postgres'`** and therefore report
  "unavailable" in production: `commands.ts:11`, `dispatch.ts:41`, `eligibility.ts:33`,
  `events.ts:35`, `ledger.ts:15`, `native-push.ts:26`, `ops.ts:14`, `payments.ts:36`,
  `private-objects.ts:48`, `quotes.ts:9`, `resource-scope.ts:30`, `ride-lifecycle.ts:24`.
- The outbox, `domain_events`, `payment_intents`, `custody_records`, the double-entry ledger, the
  durable command protocol and the ride lifecycle are consequently **dead code in the pilot**,
  while `main.ts` serves older inline SQLite paths.

**Why this reframes the comparison:** competitor analysis is only decision-grade against a
feature set Fastship can actually ship. Measuring Uber, Careem, HungerStation and HAAT against
capabilities that are test-dialect-only would produce a plan for a system that does not exist.
Any parity item that depends on the outbox, the ledger, payment intents or custody records
carries a **dialect prerequisite** and must not be scheduled as a feature.

**Typecheck status, corrected wording.** "Server typecheck passes" is the accurate claim:
`npx tsc --noEmit -p tsconfig.server.json` exits 0. The client half does not run in this tree —
`npx tsc --noEmit` dies with a JS heap OOM, exit 134, because `tsconfig.json` includes
`**/*.ts(x)` and therefore sweeps `research_notes/` (≥5,000 files), ten clones under
`.claude/worktrees/`, `research/`, `vendor/` and `session-bridge/`. Do not report a global
typecheck pass until that glob is corrected.
