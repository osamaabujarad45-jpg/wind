# Uber / Careem / HungerStation / HAAT comparison: decision-readiness gap audit

**Audit date:** 13 November 2026  
**Decision context:** product, market-entry, investment, and operating-model decisions  
**Severity:** **P0** = launch/investment blocker; **P1** = materially changes strategy or valuation; **P2** = improves completeness

## Scope and verdict

This is a decision-readiness audit, not an invented line-by-line rebuttal. The reviewed material did not provide one source study containing all four platforms, so “missing” below means **required before the comparison can support a consequential decision**, not an assertion about an unavailable document's exact wording.

**Verdict: not decision-ready.** A comparison of app features, advertised coverage, fees, or market estimates does not establish coverage, demand, profitability, service quality, courier welfare, or regulatory permission. The correction plan must add market-specific operating evidence, per-order contribution, cohort economics, courier net earnings, exception costs, competition, and an auditable confidence model.

Two wording corrections apply throughout:

1. **“No evidence in the reviewed sources” is not “proof of absence.”** This is especially important for Careem and HAAT in Palestine.
2. **A company is not a market.** Every claim must name platform, legal entity where relevant, country/territory, city, observation date, and metric denominator. Historical Uber or Careem activity cannot establish current availability or market share.

## 1. Gap matrix and required corrections

| Priority | Consequential gap | Why the current comparison is insufficient | Required addition |
|---|---|---|---|
| **P0** | Current market and service coverage | Corporate pages, app-store presence, historical launches, and marketing city counts do not prove that a customer at a named address can currently obtain a quote and complete checkout. | For every claimed market, record current app build, OS, country storefront, test address/coordinates, date/time, location search, quote, fees, applicable terms, and final pre-commit checkout result. Use an approved live order only where checkout cannot otherwise be verified. Label everything else **unverified**. |
| **P0** | Per-order unit economics | GMV, merchant commission, consumer fees, IFRS revenue, and courier cost are different quantities. Comparing one platform's commission with another's recognized revenue creates a false take-rate ranking. | Reconcile a common order ledger and calculate merchant commercial take rate, consumer-fee yield, net platform yield, variable cost, contribution, and contribution margin using the formulas in §2. Show city and cohort results, not only company averages. |
| **P0** | CAC, retention, LTV, and payback | Downloads are not customers; revenue per order is not contribution; “LTV/CAC” calculated from revenue rewards unprofitable growth. | Add fully loaded customer, merchant, and courier acquisition costs; completed-order cohorts; monthly churn/survival; orders per active customer; contribution-based LTV; and CAC payback using §3. |
| **P0** | Courier economics and worker model | Gross payout per delivery ignores unpaid waiting, fuel, depreciation, insurance, data, taxes, cash settlement, and deactivation risk. It also does not establish employment classification. | Add gross and net earnings per engaged hour and per online hour, unpaid waiting, expense ranges, payout latency, cash-debt exposure, acceptance/deactivation rules, appeals, insurance, and territory-specific legal review. See §5. |
| **P0** | Cash, fraud, safety, and incident economics | Fraud and cash leakage are not merely risk-register prose; they reduce contribution and can block operations. Marketing safety statements are not incident rates. | Add order-level cash variance, settlement aging, promo/refund abuse, account takeover, payment fraud, false-positive controls, safety incidents by severity, emergency response, insurance cost, and loss in basis points of GMV and per order. |
| **P0** | Regulatory and tax eligibility by territory | One “Middle East” regulatory section can conflate Saudi Arabia, Palestine, and Israel. A corporate contact address does not identify the contracting entity or applicable law. | Create separate Saudi, Palestinian, and Israeli matrices covering entity/licensing, consumer/e-commerce, VAT/tax/e-invoicing, labor/social insurance, food/pharmacy, payments/cash, privacy/data transfers, and accessibility. Cite the exact instrument and responsible authority; obtain local sign-off where sources are incomplete. See §6. |
| **P1** | Fulfillment reliability | Advertised ETA and menu availability do not measure acceptance, assignment, substitution, cancellation, or late delivery. | Add acceptance, courier-assignment, cancellation by responsible party, promised/actual delivery time, p50/p90/p95 lateness, item availability, substitution, refund, and reorder rates by city, address type, daypart, basket, and weather/disruption period. |
| **P1** | Support and exception recovery | Median delivery time excludes the orders that create refunds, complaints, churn, and safety exposure. | Add support contact success, first response and resolution p50/p95, refund approval and completion time, recontact rate, unresolved cases, compensation, and post-incident retention. Separate customer, courier, and merchant support. |
| **P1** | Palestinian qualification for Careem and HAAT | Careem's reviewed corporate page advertises aggregate scale, while its legal hub lists selected other markets; neither supplies current Palestinian booking evidence. HAAT advertises 40+ cities and shows an Israeli contact address, but that alone does not map Palestinian coverage. | Use the qualified wording in §4. Do not state “Careem/HAAT does not operate in Palestine” unless a current authoritative source or comprehensive reproducible test proves it. Do not state that either does operate there without current booking and terms evidence. |
| **P1** | Low-bandwidth and informal-address performance | A screen recording, cached menu, mapping SDK, or network-log capture does not prove offline ordering, address resolution, or reliable fulfillment. | Measure geocode/pin success, location accuracy, landmark/manual address rescue, low-bandwidth completion, retry/idempotency, order-state recovery, duplicate-order prevention, and assisted ordering. Test formal and informal addresses separately. |
| **P1** | Privacy and data governance | Listing SDKs or links to privacy policies does not establish lawful collection, actual retention, deletion, or cross-border transfer practice. | Add a data-flow map for consumers, couriers, and merchants; controller/processor roles; precise/background location; SDK/consent behavior; retention values; deletion/DSAR tests; international transfers; breach process; and actual recipient categories. |
| **P1** | Accessibility | An AA logo or support article is not evidence that ordering, payment, exceptions, and support are usable with assistive technology. | Test complete journeys with TalkBack and VoiceOver, Arabic/Hebrew RTL, dynamic type, contrast, touch targets, error announcement, accessible authentication, refund, and human support. Reference WCAG 2.2 AA and publish defects and remediation dates. |
| **P1** | Competition and substitution | Four app brands omit merchant-owned fleets, phone/WhatsApp orders, local platforms, and non-delivery substitutes. Downloads and public web traffic are not order share. | Add matched-basket fieldwork, merchant/courier interviews, local alternatives, exclusive supply, multi-apping, subscription/ads effects, and order/GMV/active-customer measures. Run the scenarios in §7. |
| **P1** | Evidence freshness and confidence | Static reverse engineering, SDK inventories, marketing claims, third-party estimates, and current booking observations have different probative value and expiry rates. | Put every material claim in the claim register in §8 with period, denominator, source tier, independent corroboration, confidence, owner, and expiry. Financial and coverage claims need current primary evidence. |

## 2. Required per-order economic model

### 2.1 Use a common, contract-aware order ledger

Start with **completed customer orders**, while retaining canceled-order costs for allocation. Define every variable net of VAT consistently and exclude customer tips from platform revenue. Separate platform-funded from merchant-funded promotions.

For one delivered order:

- `G` = merchandise order value under a stated VAT and discount convention.
- `c` = merchant commission earned by the platform.
- `f` = consumer delivery, service, small-order, and other platform fees, net of VAT and excluding tips.
- `a` = advertising and other platform receipts allocated to that order.
- `NR` = comparable net commercial receipts before variable fulfillment costs.
- `K` = courier pay and incentives, including employer/insurance cost where applicable.
- `P` = payment processing, cash collection, and settlement cost.
- `S` = variable support, refunds, compensation, fraud, safety, and insurance cost.
- `D` = platform-funded discounts and order incentives not already deducted from `c`, `f`, or `a`.
- `V` = other variable fulfillment cost.

Use:

```text
NR = c + f + a
Contribution per delivered order (CM) = NR - K - P - S - D - V

Merchant commercial take rate = c / G
Consumer fee yield = f / G
Net platform yield = NR / G
Contribution margin on GMV = CM / G
Contribution margin on net receipts = CM / NR
```

These are deliberately different metrics. **Do not rename net platform yield as “the commission rate.”** Also reconcile `NR` to recognized IFRS revenue in a separate bridge: principal-versus-agent accounting can put merchandise value and merchant remittance in different lines without changing the underlying commercial receipts. Do not force different contracts into one accounting denominator.

Additional rules:

- Allocate courier payments and support costs from canceled orders to completed orders using a stated driver; report canceled-order economics separately as well.
- Include only the platform-funded share of a promotion in `D`; show merchant-funded discounts in the merchant's economics.
- Include refunds and compensation whether paid in cash, credit, or wallet balance. Wallet issuance is not zero cost.
- Do not count the same acquisition or order incentive in both CAC and `D`.
- Show a second model excluding advertising and subscriptions, then add their incremental receipts and costs. Otherwise advertising can conceal loss-making delivery.
- Report per city, daypart, basket band, customer cohort, and fulfillment model. A positive regional average can hide structurally loss-making cities.

### 2.2 Minimum financial exhibit

For each platform-market, provide a 12-month monthly table and a latest-90-day order-level reconciliation containing:

| Exhibit | Required fields |
|---|---|
| Demand | completed/canceled orders, GMV, active customers, orders per active customer, new/returning cohorts |
| Receipts | merchant commission, each consumer fee, ads/subscriptions, merchant/platform promotion share, VAT treatment |
| Fulfillment | courier base pay, surge/incentives, waiting/canceled-order pay, insurance/employer costs, payment/cash cost |
| Exceptions | refunds, compensation, support minutes/cost, fraud and cash loss, safety incidents and claims |
| Result | CM/order, CM/GMV, CM/NR, fixed product/technology/G&A allocation, operating result |
| Reconciliation | sampled order totals through ledger to financial statements, with all differences explained |

A market-entry model must show base, downside, and severe-downside cases. Vary courier cost, order density, promotion intensity, refunds/fraud, and order frequency together; independent one-variable sensitivities can miss correlated downside.

## 3. CAC, LTV, retention, and payback

### 3.1 Acquisition cost

Report consumer, merchant, and courier acquisition separately:

```text
Consumer CAC =
  (consumer media + acquisition sales/marketing payroll + agencies + tools
   + acquisition incentives not already in order contribution)
  / new consumers with a first completed order
```

Use analogous denominators for merchants and couriers: **activated merchants/couriers**, not leads or sign-ups. Show paid CAC and fully loaded blended CAC. Include salaries, agencies, tools, referral/sign-up incentives, and onboarding cost once. Do not sum three differently denominated CAC values and call the result “network CAC”; allocate supply/acquisition cost to customer cohorts with a documented driver and report the three-sided acquisition model separately.

### 3.2 Retention and contribution-based LTV

For monthly cohort `t`:

- `s_t` = probability the acquired customer remains active in month `t`.
- `o_t` = completed orders per active customer in month `t`.
- `CM_t` = expected contribution per completed order after all variable exception costs.
- `i` = monthly discount rate.
- `T` = stated horizon, not an assumed infinite life.

```text
LTV(T) = sum from t=1 to T of [s_t × o_t × CM_t / (1 + i)^t]
CAC payback months = CAC / (steady-state monthly orders × steady-state CM/order)
LTV:CAC = LTV(T) / CAC
```

If using constant monthly churn `h`, set `s_t = (1-h)^(t-1)` and disclose that simplification. Do not use `1/churn` as customer lifetime when churn changes with tenure, promotions, season, or market maturity.

**Gate:** if steady-state `CM/order <= 0`, CAC payback and a positive LTV:CAC are not meaningful; additional orders increase losses. Fix the order economics or identify a separately evidenced cross-subsidy before valuing growth.

Add:

- cohort survival curves at months 1, 2, 3, 6, and 12;
- completed-order frequency by customer tenure, not app opens;
- organic versus paid cohort retention;
- city-level LTV, CAC, and payback;
- supply-constrained versus demand-constrained periods;
- merchant retention/GMV retention and courier retention as separate marketplace health indicators.

## 4. Required Careem/HAAT Palestine qualification

Use this statement until stronger current evidence is collected:

> **Palestinian availability is unverified in the reviewed evidence.** Careem's corporate page describes aggregate operations in over 70 cities across 10 countries but does not provide a current Palestinian booking footprint; the reviewed legal hub lists selected other markets and no Palestinian terms. This is not proof that Careem service is unavailable. HAAT's marketing advertises 40+ cities and its reviewed contact details identify Israel; this does not by itself prove or disprove Palestinian service. Each platform requires current, address-level app/quote/checkout evidence and applicable local terms before Palestine can be marked available or unavailable.

Sources: [Careem corporate profile](https://www.careem.com/en-AE/about-us/), [Careem legal hub](https://www.careem.com/en-AE/legal/), [HAAT corporate site](https://haat.delivery/).

For each platform, capture a dated evidence pack for named Palestinian addresses:

1. app version, device/OS, app-store country and account prerequisites;
2. location search and manual-pin result;
3. serviceable merchants and basket quote;
4. complete consumer fee display and currency;
5. final pre-commit payment/checkout result;
6. local terms, support confirmation, and contracting entity;
7. result classification: **verified**, **explicitly unsupported**, **inconclusive**, or **not tested**.

Do not use a successful menu view as successful checkout. Do not turn a historical Careem Palestine launch, old help article, or prior app review into a 2026 availability claim. Conversely, a missing country link is not a comprehensive service-denial test.

## 5. Operating-model additions

### 5.1 Reliability, exceptions, fraud, and safety

Add the following to the comparison, segmented by platform, city, daypart, basket, address type, and customer cohort:

| Workstream | Minimum metrics and evidence |
|---|---|
| Order reliability | merchant acceptance; time to acceptance; courier assignment success/time; cancellation by customer/merchant/courier/platform; no-courier rate; item availability; substitution approval; wrong/missing-item rate |
| Delivery | promised and actual time; p50/p90/p95 delivery duration and lateness; on-time rate against the displayed promise; batching rate; distance and orders/courier/hour; failed delivery and re-delivery |
| Support | channel contact success; first response and full resolution p50/p95; recontact and escalation; refund decision and money-received time; unresolved cases; customer/courier/merchant satisfaction after the case |
| Cash | cash-order share; change/float failure; courier/customer cash variance; proof of delivery; settlement aging; negative balances; bad debt; cash-related deactivation and dispute outcomes |
| Fraud | promo/referral abuse; refund abuse; account takeover; card testing/payment fraud; GPS spoofing/fake delivery; courier-customer-merchant collusion; loss bps of GMV; prevented loss and false-positive rate |
| Safety | incidents per 100,000 orders by severity; road injuries/fatalities; harassment and violence; emergency-contact response; insurance coverage and claims duration; corrective-action closure |
| Churn impact | reorder and 30/90-day retention after cancellation, late delivery, refund, support case, safety incident, and courier dispute versus matched unaffected cohorts |

Do not convert “zero reported incidents” into “zero incidents.” Record reporting coverage, definitions, investigation status, and severity. A low complaint rate can reflect inaccessible reporting.

### 5.2 Courier net earnings and treatment

For each market and courier cohort, calculate both:

```text
Net engaged hourly earnings =
  (delivery pay + incentives + tips - variable work expenses)
  / engaged hours

Net online hourly earnings =
  (delivery pay + incentives + tips - variable work expenses - allocated unpaid-time expenses)
  / all logged-online hours
```

Expenses must include fuel/energy, maintenance and depreciation, vehicle rental/finance where relevant, insurance, mobile/data, equipment, taxes/social contributions, and cash-settlement cost. Show ranges and percentiles, not just an average. Separately report:

- paid delivery time, unpaid waiting, and empty travel;
- gross pay per order and per kilometer;
- payout latency, failed payout, cash debt, and dispute amount;
- acceptance requirements, incentive eligibility, and algorithmic allocation transparency;
- deactivation reason, notice, evidence, human appeal, reinstatement, and lost-income exposure;
- accident, injury, liability, health, and passenger/goods insurance applicability;
- employment/independent-contractor status and actual working practices under local law.

Courier acquisition, retention, and utilization belong in the same supply model: high courier sign-ups can coexist with poor active supply if onboarding, first-delivery activation, or net hourly earnings are weak.

### 5.3 Connectivity and address execution

Test on real Android and iOS devices under constrained connectivity, not only by reading static code or logs:

- geocode/manual-pin success and median location error for formal and informal addresses;
- landmark/text instructions and courier-customer contact success;
- menu/cart/checkout completion at stated latency, packet loss, and bandwidth;
- network drop before payment, after payment authorization, and after order submission;
- unique order/idempotency key, duplicate charge/order rate, and recovery of authoritative order state;
- offline behavior stated accurately: cached browsing, queued action, assisted order, or no service;
- low-end device memory, app size, battery, and crash/ANR behavior.

An SDK inventory can suggest capabilities; it cannot validate server-side checkout, dispatch, fraud, or address handling.

## 6. Regulatory, safety, accessibility, and privacy correction plan

### 6.1 Market-specific legal matrix

| Area | Saudi Arabia | Palestine | Israel, where the contracting/operating entity is Israeli |
|---|---|---|---|
| Entity and consumer/e-commerce | Identify contracting entity, licenses, consumer terms, Arabic disclosures, complaints and refund duties with the Ministry of Commerce and applicable authority. | Determine company, municipal, consumer, tax, and sector permissions for the actual territory and contracting entity; do not infer from Israeli or Saudi terms. | Identify contracting entity, consumer terms, tax invoices, refund/cancellation duties, and sector permissions. |
| Tax and invoicing | Determine VAT treatment for merchant commission, each customer fee, tips, promotions and courier payments; determine e-invoicing integration/phase applicability by taxpayer and transaction with ZATCA. | Establish applicable tax and invoice rules from current local authority/counsel; retain documentary support. | Establish VAT/tax and invoice duties for the actual entity and transaction flow. |
| Courier/labor | Review contractual and actual working model, labor/social-insurance, occupational safety, vehicle and delivery-worker requirements with HRSD/GOSI/other competent bodies. | Obtain territory-specific employment, social-insurance, insurance, vehicle, and safety advice; do not assume a contractor label settles classification. | Review labor classification, social benefits, safety, insurance, and vehicle requirements under Israeli law. |
| Food and restricted goods | Map SFDA food obligations; separate pharmacy, controlled medication, alcohol and other restricted goods rather than applying one generic delivery policy. | Identify competent health/food/pharmacy authorities and permitted goods for the territory. | Identify competent food, health, pharmacy, and restricted-goods requirements. |
| Payments and cash | Distinguish ordinary cash collection from regulated payment/wallet services; determine whether any stored value, acquiring, or transfer function triggers SAMA requirements. | Do the same under the Palestine Monetary Authority's actual mandate and licensing perimeter; do not imply that accepting cash automatically makes the platform a payment institution. | Determine whether stored value, acquiring, transfers, or other regulated payment functions require authorization. |
| Privacy and transfers | Map Saudi PDPL obligations, cross-border transfer mechanism, retention, rights and breach duties; identify non-Saudi processing separately. | Identify applicable privacy, telecom, sector, and contractual rules with local counsel; do not automatically import Israeli or Saudi law. | Map Israeli privacy law, registry/security/transfer requirements, rights and breach duties with the Privacy Protection Authority. |
| Accessibility | Identify applicable Saudi legal duties and procurement requirements in addition to WCAG testing. | Identify applicable local duties and public-procurement requirements. | Identify Israeli accessibility duties and applicable accessibility statements/testing. |

Official starting points—not substitutes for transaction-specific advice:

- Saudi Arabia: [ZATCA e-invoicing](https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx), [ZATCA](https://zatca.gov.sa/en/Pages/default.aspx), [Ministry of Human Resources and Social Development](https://www.hrsd.gov.sa/en), [Saudi Food and Drug Authority](https://www.sfda.gov.sa/en), [Saudi Data and AI Authority / PDPL resources](https://sdaia.gov.sa/en/SDAIA/about/Pages/PersonalDataProtectionLaw.aspx), [Saudi Central Bank](https://www.sama.gov.sa/en-US/Pages/default.aspx).
- Palestine: [Palestine Monetary Authority](https://www.pma.ps/), [Palestinian Ministry of National Economy](https://www.mne.gov.ps/). Add the competent labor, health, telecom, tax, and municipal source for each actual operation.
- Israel: [Privacy Protection Authority](https://www.gov.il/en/departments/the_privacy_protection_authority), [Ministry of Economy and Industry](https://www.gov.il/en/departments/ministry_of_economy), [Israel Tax Authority](https://www.gov.il/en/departments/israel_tax_authority).

Every matrix row needs an exact legal instrument/article, authority URL, applicable entity/transaction, evidence of compliance, unresolved question, and named reviewer. A generic regulator homepage alone is not compliance evidence.

### 6.2 Accessibility acceptance test

Use [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) as the test baseline, without claiming that conformance alone proves legal compliance. Test at minimum:

- onboarding, OTP/authentication, location and manual address;
- menu, customization, cart, fees, promotions and payment;
- courier tracking, cancellation, substitution, refund and complaint;
- TalkBack on Android and VoiceOver on iOS;
- Arabic and Hebrew screen-reader pronunciation and RTL focus order;
- large text/reflow, contrast, touch target, error identification and announcement;
- non-visual alternative to CAPTCHA/map-only tasks and access to a human.

Record device/OS/app versions, journey video or defect evidence, success rate, severity, owner, and fix release. Courier and merchant apps need equivalent testing, not only consumer checkout.

### 6.3 Privacy evidence, not policy copying

Build consumer, courier and merchant data maps covering:

- legal entity, controller/processor/joint-controller roles and purposes;
- exact/background location, contacts, device identifiers, payment, identity and safety data;
- every SDK's actual initialization/consent state and recipients;
- data residency, international transfer routes and safeguards;
- field-level retention schedule and verified deletion from production, backups and third parties;
- access, correction, deletion, objection and portability request completion;
- courier monitoring, automated allocation/deactivation and human review;
- children/restricted-user policy and incident/breach notification workflow.

A retention table must contain actual values, not “as long as necessary.” Test at least one deletion and one access request per platform/role and measure completion time and residual data.

## 7. Competition and market-demand additions

### 7.1 Measure the actual choice set

For each launch city, include local delivery apps, merchant-owned fleets, phone/WhatsApp ordering, pickup, and cooking at home. Separate:

- order share, GMV share, and monthly transacting-customer share;
- merchant share, exclusive merchants, and top-merchant concentration;
- active courier share and courier multi-apping;
- consumer multi-apping, subscription penetration, and switching triggers;
- advertising income versus core delivery economics;
- formal versus informal address coverage and urban versus peri-urban service.

Downloads, app ratings, search interest, and web visits can support awareness analysis but must not be relabeled order share, GMV share, or market leadership.

### 7.2 Matched-basket field protocol

For every city being compared:

1. Select the same three baskets across convenience, grocery, and restaurant use cases; include one substitution-prone basket.
2. Use the same delivery addresses, including one formal and one informal address, and matched merchants/items where available.
3. Test lunch, dinner, and one off-peak period over four weeks. Target at least **30 matched observations per platform-city-daypart**, recording missing service as a result rather than discarding it.
4. Capture item prices, every fee, VAT treatment, displayed and actually redeemed promotion, tip separately, promised ETA, actual ETA, cancellation, substitution, refund, and support outcome.
5. Compare total checkout cost and reliability, not menu price alone.
6. With informed consent and anonymized reporting, interview **10–15 merchants and 10–15 couriers per launch city** about commissions, net payout, exclusivity, multi-apping, support, and channel substitution. Record sample recruitment and selection limits.

Use these observations to build an evidence-backed price/reliability frontier. Do not average away city or daypart failures.

### 7.3 Required downside scenarios

Model each scenario using the unit-economic and retention model, with a stated response and recovery time:

| Scenario | Required analysis |
|---|---|
| Incumbent cuts merchant commission or consumer fee by 5 percentage points | Effect on merchant supply, order share, CM/order, CAC and payback; identify who funds the response and maximum sustainable duration. |
| Rival subscription/free-delivery campaign | Incremental order frequency versus cannibalization, subscription cost, churn after campaign, courier utilization and support load. |
| Top-merchant exclusivity or removal | Order/GMV concentration, substitute merchant conversion, consumer churn, and reacquisition cost. |
| Courier net cost rises 15% or active supply falls | Price/pay response, assignment and late-delivery deterioration, order density, CM and service-level feedback loop. |
| Refund/fraud/cash loss doubles | Direct CM effect, stricter-control false positives, conversion/accessibility impact, and collection/control response. |
| Regulatory, connectivity, or market-access disruption | City/service shutdown exposure, cash/refund obligations, courier/customer communication, data continuity and restart cost. |

A serious investment case also reports the maximum affordable CAC and minimum order density at which each city reaches positive contribution, then compares those thresholds with observed field data.

## 8. Evidence schema and research workflow

### 8.1 Source tiers and confidence

| Tier | Evidence | Permitted use | Typical limitation |
|---|---|---|---|
| **A** | Current laws/regulatory decisions; audited filings; signed merchant/courier contracts; reconciled production order logs; reproducible booking evidence | Can support a current factual or financial claim within its stated market and period | May be confidential, sampled, aggregate, or transaction-specific |
| **B** | Current official terms/help/rate cards; observed app behavior; direct structured interviews | Supports current policy or observed behavior, not universal execution | Policy can differ from practice; observation may be city/device/time specific |
| **C** | Company marketing, app-store metadata, SDK/static reverse engineering, single web capture | Generates leads and qualified capability statements | Does not establish server behavior, actual coverage, order economics, or universal performance |
| **D** | Third-party market estimates, traffic panels, old articles, app reviews, anecdote | Context and hypotheses only unless independently corroborated | Methodology, freshness, sample and denominator often unclear |

Confidence must be assigned independently of source tier:

- **High:** current primary evidence with reproducible method and applicable denominator; material claims corroborated by an independent source or second observation.
- **Medium:** one current official source or reproducible observation with known geographic/sample limits.
- **Low:** inference, stale evidence, uncorroborated third-party estimate, or incomplete test.
- **Unverified:** no applicable evidence collected.

Marketing does not become high-confidence merely by appearing on an official domain. Static code evidence cannot establish current production server behavior.

### 8.2 Mandatory claim-register fields

```text
Claim ID
Platform / legal entity / country or territory / city
Exact claim and decision affected
Observation start/end and evidence expiry
Metric definition, numerator, denominator, exclusions and currency/VAT basis
Source URL or document, archive/screenshot, author and publication date
Source tier and collection method (booking, logs, interview, filing, static analysis)
Sample/device/app version/address/daypart where applicable
Independent corroboration and contradictory evidence
Confidence (high/medium/low/unverified) with one-sentence rationale
Required next action, owner, reviewer and resolution date
```

No claim enters an executive summary without a Claim ID. No market-share claim is valid without an explicit denominator. No availability claim is valid without location and date.

### 8.3 Priority research requests

1. **Production economics:** latest 90 days of anonymized order-level data plus 12 months of weekly cohorts; order timestamps, city, basket, fees, promotions, courier cost, payment/cash cost, cancellations, refunds, support, fraud and safety outcomes.
2. **Commercial contracts:** current merchant rate cards, consumer fee rules, courier pay/incentive schedules, subscription/ads terms, promotion funding, insurance and payment/cash agreements by market.
3. **Acquisition:** spend by channel/campaign, fully loaded sales/marketing cost, activation events, first completed order, referral incentives, merchant/courier onboarding funnel.
4. **Finance:** monthly GMV-to-revenue-to-contribution bridge, general-ledger reconciliation, exception loss accounts, fixed technology/G&A allocation, and scenario assumptions.
5. **Field verification:** Palestine address-level Careem/HAAT tests; matched baskets in every proposed city; low-bandwidth/informal-address tests; accessibility and privacy-request tests.
6. **Legal operations:** current contracting entities, local terms, exact tax/labor/food/payment/privacy instruments and documented local review for each launch territory.
7. **Independent market evidence:** merchant/courier interviews, local alternative channels, exclusive supply, multi-apping and actual reorder behavior.

## 9. Decision-ready acceptance gates

The comparison is ready only when all applicable boxes are checked:

- [ ] Every availability claim names platform, territory, city/address, date and evidence; Palestine is either currently verified or explicitly unverified, never inferred from historical activity.
- [ ] Merchant take rate, consumer-fee yield, net platform yield, IFRS revenue and CAC are not conflated.
- [ ] Order totals reconcile to the ledger; VAT, tips, merchant/platform promotions, canceled orders and wallet compensation have consistent treatment.
- [ ] CM/order includes courier, payment/cash, support, refunds, fraud, safety and platform-funded incentives; results are segmented by city and cohort.
- [ ] LTV uses retention and contribution, not revenue or GMV; CAC and payback use completed-order customers and fully loaded acquisition cost.
- [ ] Negative-contribution markets are identified rather than hidden by LTV:CAC or advertising receipts.
- [ ] Courier net engaged/online hourly earnings, unpaid waiting, expenses, safety, payout and appeal evidence are included.
- [ ] Reliability, support, cash, fraud and safety metrics include p90/p95 tails and post-exception retention.
- [ ] Saudi, Palestinian and Israeli regulatory claims use separate, current, source-cited matrices and name unresolved legal questions.
- [ ] Accessibility and connectivity claims come from completed device journeys, including informal addresses, low bandwidth, assistive technology and exception recovery.
- [ ] Competition includes local and informal alternatives, matched baskets, supplier/courier behavior and downside scenarios.
- [ ] Every material claim has a Claim ID, denominator, source tier, confidence, contradiction check, owner and expiry.
- [ ] Base, downside and severe-downside models show minimum order density and maximum affordable CAC for each launch city.

Until these gates pass, the appropriate output is a **qualified research comparison**, not a market-availability, profitability, or launch recommendation.
