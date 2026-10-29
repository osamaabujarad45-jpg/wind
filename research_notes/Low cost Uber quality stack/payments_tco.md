# Payments, safety tooling, and the real total cost of an Uber-quality minimum - Palestine (West Bank), October 2026

**Scope.** Ride-hailing and delivery in the West Bank, cash-first, 100 to 10,000 drivers. What card/wallet acquiring is actually available to a Palestinian merchant, what driver payouts are possible, what safety and identity tooling costs, and a bottom-up monthly cost model built from published unit prices.

**Access date.** Every URL below was retrieved on **2026-10-29** unless the page itself carries an older date, which is quoted where relevant.

**Evidence labels used throughout:**

- **[D] documented** - stated on the cited page.
- **[O] observed** - what the page actually returned in this session (a country omitted from a list, a fee page rendering empty, a link blocked).
- **[U] unverified** - inference, secondary source, or arithmetic that depends on an assumption I could not confirm from a primary source.

**Price conventions.** USD list prices, excluding tax, at the tiers published on the access date. Where a vendor quotes in ILS, I keep ILS and do not apply an FX rate. No price below is invented; where a vendor does not publish a price, the line says so and the item moves to Gaps.

**Not legal advice.** PMA licensing, e-money rules, sanctions screening, merchant onboarding, and settlement are flagged where they arise and need Palestinian counsel and a merchant-relationship conversation. Nothing here substitutes for either.

**Working definition.** "Uber-quality minimum" in this note means: a bounded dispatch offer with a fallback, an ETA that refreshes and admits when it cannot estimate, a live driver position that is seconds old, a 4-digit start PIN, trip sharing, a one-tap SOS that reaches a human, proof of handoff for deliveries, and a ledger that never loses a fare. It does not mean Uber's ML matching or its 99.99% push infrastructure; those are not purchasable at this scale.

**Bottom line.** The cheapest honest 100-driver Ramallah pilot is roughly **$55-65/month in software plus about $41 one-time SMS onboarding**, running MapLibre/OpenFreeMap tiles, self-hosted OSRM routing, one managed Postgres, Expo push, and manual driver verification, with cash and a 0.25% bank QR rail. The moment you turn on **daily SMS OTP at Twilio's Palestine rate ($0.4101/message)**, the same pilot costs about **$1,290/month** and the 1,000-driver tier costs about **$12,500/month**. That single line item is a bigger launch risk than every free-tier trap combined. Card acceptance at 2.5% is the second-largest variable cost and dwarfs infrastructure once even 20% of trips are digital.

---

## 1. International card processors: who will actually take a Palestinian merchant?

### Takeaway
Stripe, PayPal, Checkout.com, and HyperPay are not usable by a West Bank merchant on the public evidence. Paddle is the one international merchant-of-record that does not list Palestine as unsupported for sellers, but its product fit for ride-hailing and its Palestinian payout rail are unconfirmed, so it is a "request in writing" option, not a launch path. The usable card rails are local: Bank of Palestine's gateway at 2.5%, and PalPay's gateway whose merchant pricing is not public.

### Cited Findings
- Stripe's global availability page presents its supported countries list; **Palestine does not appear in the retrieved list**, while Israel does. A third-party incorporation guide states plainly that "Stripe is not currently supported in Palestine." - [Stripe, global availability](https://stripe.com/global) **[O]**; [Doola, Stripe in Palestine](https://www.doola.com/stripe-guide/how-to-open-a-stripe-account-in-palestine/) **[U, secondary]**. Because Stripe's country list is rendered client-side, the omission is observed rather than machine-verified; treat "not supported" as the working conclusion, not a legal opinion.
- PayPal's country selector lists Middle East markets including Bahrain, Israel, Jordan, Kuwait, Oman, Qatar, Saudi Arabia, the UAE, and Yemen; **"Palestine" / "Palestinian Territories" is absent from the entire selector**. This is PayPal's site/country menu, not a formal merchant-eligibility table, so it is evidence of no Palestinian locale rather than a legal refusal. A Gaza-specific thread reports that Palestinians there cannot link a local bank account to withdraw; I found no equivalent West Bank evidence. - [PayPal, list of countries and currencies](https://www.paypal.com/en/webapps/mpp/country-worldwide) **[O]**; [Reddit r/Gaza discussion](https://www.reddit.com/r/Gaza/comments/1lm6oh3/does_anyone_here_know_if_it_is_possible_to_make_a/) **[U, anecdotal, Gaza only]**.
- Paddle's seller policy: "Paddle works with software businesses anywhere in the world with the exception of the unsupported countries listed below." **Palestine is not on the unsupported list** (the list includes Iran, Iraq, Syria, Yemen, Russia, Belarus, and others). Paddle's separate supported-countries table for buyers does include `PS | Palestinian territories | ILS`, so Palestine is also a supported sales market. - [Paddle, which countries are supported](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) **[D]**; [Paddle developer docs, supported countries](https://developer.paddle.com/concepts/sell/supported-countries-locales) **[D]**.
- Paddle pays sellers **once a month**, by wire transfer or Payoneer, minimum payout **$100**, by the 15th; "for certain countries, a $15 SWIFT fee may be applicable." - [Paddle, when and how do I get paid](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid) **[D]**. That cadence is incompatible with daily driver settlement.
- Checkout.com advertises "57 domestic processing countries" and direct acquiring in APAC, MENAP, UK/EEA and the US, but its **country terms do not include Palestine**, and its payment-method directory lists Visa/Mastercard acceptance in 200+ countries **without a Palestine row**. - [Checkout.com, international coverage](https://www.checkout.com/solutions/international-coverage) **[D]**; [Checkout.com, country terms](https://www.checkout.com/legal/country-terms) **[O]**; [Checkout.com, payment methods](https://www.checkout.com/payment-method/accept) **[O]**.
- HyperPay answers the question directly: "Unfortunately, now, we do not have any acquiring banks in Palestine. Therefore, we are unable to provide our online payment solution in this region." - [HyperPay FAQ](https://www.hyperpay.com/faq/can-we-utilize-your-services-in-palestine-gaza/) **[D]**.
- Network International's public material describes MENA/GCC acquiring (250+ financial institutions, 240,000+ merchants) but **no Palestinian acquiring entity or licence** was found. - [Network International](https://www.network.ae/en) **[O]**; [Network International, RAKBANK acquisition](https://www.network.ae/en/about-us/press-and-media/news/network-international-announces-the-acquisition-of-rakbank-merchant-acquiring-business) **[D]**.

### Inferences
- A Palestinian company cannot honestly launch on Stripe, PayPal, Checkout.com, or HyperPay. Any workaround (US LLC + Stripe) puts the merchant account, the funds, and the founder's personal exposure in a jurisdiction where the business has no licence; this is a legal question, not an engineering one.
- Paddle is worth one email because it is a merchant of record, which shifts chargeback and tax liability, and because Palestine is not on its prohibited-seller list. The questions that decide it: does Paddle's acceptable-use policy cover ground transport services, will its banking partners accept a West Bank registered entity, and can it wire to a Palestinian bank or Payoneer account. None of that is answered on the pages I could access.
- Paddle's monthly payout also means it cannot be the driver payout rail; it could only be the rider card rail, with the company funding driver cash from its own working capital.

### Gaps
- No primary page states "Stripe does not support Palestine" as a sentence; the evidence is the omission from Stripe's list plus a secondary guide. A Stripe support ticket answer would settle it.
- Paddle's acceptable-use policy for ride-hailing, and its payout success rate to Palestinian banks, were not found. **Get written confirmation before designing around Paddle.**
- Checkout.com's merchant-country eligibility beyond the country-terms page (which covers only a handful of jurisdictions) is not fully enumerated; "not listed" is weaker evidence than HyperPay's explicit refusal.
- No public evidence found for **Cairo Amman Bank** merchant acquiring or a developer gateway; it may exist as a bank relationship without a public API.

---

## 2. Local PSPs, banks, and wallets: cards, QR, settlement, fees, API quality

### Takeaway
Bank of Palestine publishes a complete, usable card proposition: 2.5% on all local and international cards, settlement on the second working day, 3-5 working days to approve a merchant, 3-D Secure, and plugins for WooCommerce/Magento/OpenCart/PrestaShop. Its QR rail is far cheaper at 0.25% and debits the customer's account instantly, but it is a merchant-present QR, not a documented e-commerce API. PalPay runs a PMA-regulated e-commerce gateway but publishes no merchant fee; Jawwal Pay is a credible wallet-to-wallet payout rail with ILS settlement and PMA limits, but its fee page blocked this research. Cash remains the default.

### Cited Findings
- Bank of Palestine gateway: "**2.5% commission fees for all types of local and international cards**"; money is received "on your account in Bank of Palestine on the **second working day**"; merchant approval takes "**3-5 working days**" with a current account and signed agreement; supports 3-D Secure for Visa and Mastercard and plugins for WooCommerce, Magento, OpenCart, PrestaShop. - [Bank of Palestine, online payment gateway](https://www.bop.ps/en/business/electronic-services/payment-gateway) **[D]**.
- Bank of Palestine QR: merchants are charged "a **0.25% fee** deduction from the purchase value"; payment is deducted directly from the customer's bank account by scanning the merchant's QR; one QR works across Bank of Palestine, Arab Islamic Bank, and PalPay apps. Page dated **31/01/2022**. - [Bank of Palestine, QR launch](https://www.bankofpalestine.com/en/about/news/725) **[D, page dated 2022]**.
- PalPay describes an e-commerce gateway for merchants, regulated by the Palestine Monetary Authority; it lists Visa machines, SoftPOS, payment services, accounting-system integration, and a merchant wallet. - [PalPay, e-commerce](https://www.palpay.ps/en/merchants/e-commerce-service) **[D]**. Bank of Palestine describes the group's single merchant QR as working across Bank of Palestine, Arab Islamic Bank, and PalPay, which establishes a close operating relationship but not, on that page, ownership. - [Bank of Palestine, QR launch](https://www.bankofpalestine.com/en/about/news/725) **[D]**.
- PalPay's "Fees & Limits" page returns only the navigation and footer: **no fee table is present in the HTML** served to this session. - [PalPay, fees and limits](https://www.palpay.ps/en/commissions-and-ceilings) **[O]**. PalPay's merchant fee is therefore **not publicly documented**; treat any number quoted elsewhere as unverified.
- HyperPay has no Palestinian acquiring bank and does not serve the region. - [HyperPay FAQ](https://www.hyperpay.com/faq/can-we-utilize-your-services-in-palestine-gaza/) **[D]**.
- Palestine's payment infrastructure is being modernised through the PMA with World Bank support: the RTGS system "Buraq", the instant payment system "iBuraq", the national QR standard, and the "E-Sadad" bill presentment system; the World Bank is also working on e-KYC. - [World Bank, e-payments in West Bank and Gaza (2024-12-16)](https://www.worldbank.org/en/news/feature/2024/12/16/e-payments-as-a-pathway-to-growth-empowering-the-west-bank-and-gaza-through-digital-inclusion) **[D]**.
- A draft decree would cap cash transactions at **20,000 shekels** and expand electronic payments; this is a **public consultation draft**, not stated law. - [Kurdi Law, PMA consultation on reducing cash use](https://kurdi.law/pma-opens-public-consultation-on-draft-decree-law-on-reducing-cash-use-in-palestine/) **[U, law-firm summary]**; the MAS November 2025 bulletin separately documents "efforts to curb cash transactions" - [MAS, Palestine Economic Update special bulletin, Nov 2025](https://mas.ps/cached_uploads/download/2025/12/02/special-bulletin-nov-2025-eng-1764678641.pdf) **[D]**.
- No public source found that states the share of Palestinian transactions that are cash. The World Bank feature documents the *direction* of reform and Gaza's infrastructure destruction (only 3 of 94 ATMs operational), not a West Bank cash share. - [World Bank](https://www.worldbank.org/en/news/feature/2024/12/16/e-payments-as-a-pathway-to-growth-empowering-the-west-bank-and-gaza-through-digital-inclusion) **[D]**.

### Inferences
- The minimum digital payment integration worth doing is **not** a card gateway first. It is the **0.25% QR rail**: it is 10x cheaper than cards, settles instantly to the merchant account, and matches how banked Palestinians already pay. The constraint is that it is a merchant-present flow: the rider scans a static or per-trip QR. A per-trip dynamic QR (amount embedded) needs a bank/PalPay integration that is not publicly documented.
- Cards are worth adding only for corporate accounts, deliveries to people without a Palestinian bank app, and tourists. At 2.5% and T+2 settlement, cards are a convenience feature, not the economic default.
- PalPay is the natural single counterparty because it is both a PSP and a wallet with a close Bank of Palestine relationship, but the absence of a public fee table means the commercial terms have to be negotiated. Do not put PalPay's rate in a financial model until it is in a signed merchant agreement.
- ePay/Bank e-Pay is a consumer bill-payment brand, not a documented merchant gateway; do not confuse it with the BOP e-commerce product in planning.
- Keep the existing Fake PSP behind a server-side flag. Do not wire a real provider into the client until there is a signed merchant agreement and a settlement account; the failure mode is a shipped payment button that cannot be enabled on launch day.

### Gaps
- PalPay merchant discount rate, settlement time, chargeback policy, and API documentation (REST? hosted page? webhooks?) are not public. This is the single biggest commercial unknown in the local payment stack.
- No public documentation found for **Cairo Amman Bank** merchant acquiring, **Network International Palestine**, or a Palestinian **Apple Pay / Google Pay** tokenisation path.
- The 20,000 ILS cash cap is a draft. Its status as of October 2026 needs a PMA/counsel check; if enacted, cash-first operations need a compliance plan.
- No public statistic found for West Bank card penetration or cash share; the model below therefore treats digital share as an assumption, not a fact.

---

## 3. Payouts to drivers: is cash reconciliation the only credible launch path?

### Takeaway
Yes, for launch. No provider I could verify offers a documented programmatic payout API to Palestinian bank accounts or wallets at daily cadence. Paddle pays monthly by wire/Payoneer; Stripe Global Payouts is a US/UK-sender product; PalPay and Jawwal Pay can move money wallet-to-wallet but publish no bulk-payout API; Payoneer accounts exist for Palestinians but have a reported freeze risk and no card in the Territories. Cash reconciliation is not a compromise; it is the only rail with same-day settlement and no counterparty permission.

### Cited Findings
- Paddle: monthly payout cycle, minimum $100, wire or Payoneer, possible $15 SWIFT fee, funds arrive up to 3 working days after sending. - [Paddle, when and how do I get paid](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid) **[D]**.
- Stripe Global Payouts supports recipients "in the countries and currencies on this page" and the product is available to **US and UK senders**; I did not find Palestine in the retrieved list, so it is not a documented recipient market. - [Stripe, Global Payouts recipient countries](https://docs.stripe.com/global-payouts/send-money/recipient-countries) **[O, list page not fully retrieved]**.
- Jawwal Pay wallet transfer: transfers are **in shekels (ILS)**, recipient identified by phone number/QR/alias, all transactions within **PMA limits**; if the recipient has no wallet, they get an SMS and can claim at an agent **within 14 days**, otherwise the amount returns to the sender. - [Jawwal Pay, money transfer](https://www.jawwalpay.ps/en/customers/money-transfer) **[D]**. The "Services Fees" page returned an access-denied rejection to this session, so **Jawwal Pay's transfer fee is not documented here**. - [Jawwal Pay, services fees](https://www.jawwalpay.ps/en/customers/services-fees) **[O, blocked]**.
- PalPay offers a "Merchant Wallet" for "comprehensive financial management" but publishes no payout API, bulk-transfer product, or fee. - [PalPay, e-commerce](https://www.palpay.ps/en/merchants/e-commerce-service) **[D]**.
- Payoneer is widely described as the most established international option for Palestinians, but its **prepaid card is not available in the Palestinian Territories**, and Palestinian users in Gaza, the West Bank, and Israel reported account freezes in 2024. - [Google Summer of Code, Payoneer payment info](https://developers.google.com/open-source/gsoc/help/payoneer) **[D]**; [Business & Human Rights Resource Centre, Wise/Payoneer freezes](https://www.business-humanrights.org/it/latest-news/palestineisrael-criticism-against-wise-and-payoneer-for-freezing-the-accounts-of-palestinians-in-gaza-in-disproportionate-adherence-to-regulations-incl-co-comment/) **[U, press round-up]**; [Novara Media, Palestinian accounts frozen](https://novaramedia.com/2024/01/03/palestinians-are-having-their-bank-accounts-frozen-their-banks-wont-explain-why/) **[U, press]**.
- Wix's payment-provider country list shows **"Palestinian Territories: N/A"**, which is consistent with the absence of a mainstream hosted checkout for Palestinian merchants. - [Wix, available payment providers](https://support.wix.com/en/article/available-payment-providers-in-your-country) **[U, secondary]**.

### Inferences
- The launch ledger should be a **cash ledger**: every trip has a cash amount, a driver commission, a platform fee, and a settlement state. The driver hands over cash or receives a top-up; the platform reconciles daily. This is accounting software, not payments software, and it is the part most likely to be outsourced wrongly.
- Digital payout becomes viable only when a local PSP exposes a bulk credit API, or when the company opens a payroll account at BOP and submits a batch file. Both are bank-relationship products, not developer products; budget weeks of onboarding, not an afternoon.
- Payoneer should not be the primary driver payout rail. A freeze at the wrong moment strands driver earnings and destroys trust faster than a late feature.

### Gaps
- No documented **bulk payout API** for PalPay, Jawwal Pay, BOP business banking, Cairo Amman Bank, or Network International Palestine was found. This needs direct merchant/relationship manager confirmation.
- No documented fee or settlement time for a BOP business-to-business local transfer, or for a PalPay merchant-wallet withdrawal, was found.
- The legal character of platform-held driver balances (client money vs. company money) under PMA rules is not established here; **needs local counsel before holding driver funds**.

---

## 4. Safety tooling: SOS, number masking, trip sharing, PIN, chat moderation

### Takeaway
The safety features that matter at 100 drivers are nearly free to build and impossible to fake with a vendor: a one-tap dial to 101/100/102, an in-app SOS that posts trip + live location to an on-call human, a signed trip-share link, a 4-digit start PIN, and an in-app masked chat. Twilio Proxy is still a public beta with no SLA and no published proxy fee, and at 100 drivers its value is lower than a staffed phone line. The real cost is the human who answers, not the button.

### Cited Findings
- Palestine emergency numbers: police **100**, ambulance **101**, fire **102**. - [US State Department, 911 abroad](https://travel.state.gov/content/dam/students-abroad/pdfs/911_ABROAD.pdf) **[D]**; [Wikipedia, list of emergency telephone numbers](https://en.wikipedia.org/wiki/List_of_emergency_telephone_numbers) **[U, secondary]**. The Palestine Red Crescent Society consolidated **101** calls through one center in Ramallah serving the entire West Bank in 2019. - [PRCS, 101 call center](https://www.palestinercs.org/en/Article/11233/101-Call-Center) **[D]**.
- Twilio Proxy "is currently available as a **Public Beta** product... Public Beta products are **not covered by a Twilio SLA**." It creates a temporary number per session and forwards SMS/voice between two parties. - [Twilio, Proxy docs](https://www.twilio.com/docs/proxy) **[D, page modified 2026-07-07]**.
- Twilio's SMS price for Palestine is **$0.4101** on the country pricing page; the page notes that text messages are charged per segment and failed messages incur $0.001. Two-way SMS is supported and alphanumeric sender IDs are preserved, but sender-ID provisioning and long-code availability vary. - [Twilio, SMS pricing Palestine](https://www.twilio.com/en-us/sms/pricing/ps) **[D]**; [Twilio, Palestine SMS guidelines](https://www.twilio.com/en-us/guidelines/ps/sms) **[D]**.
- Twilio trial accounts can message **only verified numbers** (up to 5), cannot keep the trial number after upgrading, and are rate-limited. - [Twilio, trial account restrictions](https://www.twilio.com/docs/usage/trials) **[D]**.
- Expo Push Service costs **nothing** and is rate-limited to **600 notifications per second per project**; exceeding it fails requests until the rate drops. Delivery is best-effort/at-least-once to APNs/FCM, not a guaranteed delivery SLA. - [Expo, push notifications FAQ](https://docs.expo.dev/push-notifications/faq/) **[D, page modified 2026-09-03]**.
- Uber's documented PIN control is a **4-digit PIN, 5 attempts**, and the trip cannot start until the driver enters it. - [Uber, how PIN verification works](https://www.uber.com/us/en/blog/pin-verification-drivers) **[D]**.

### Inferences
- SOS at pilot scale should be: a persistent in-app button that (a) offers a `tel:101` dial, (b) creates an incident row with the last known location and trip state, and (c) notifies a named on-call person with an acknowledgement timer. Building (b) and (c) is a day of work; staffing (c) is the expensive part.
- Trip sharing is a signed, expiring, read-only web page showing driver name, vehicle plate, and live position. It is a commodity feature and should be built, not bought.
- Number masking is only worth buying when the harassment/abuse volume justifies it. At 100 drivers, in-app chat plus a single dispatcher line solves the same problem and leaves an auditable transcript. Twilio Proxy's beta status and unpublished fee make it a poor launch dependency.
- Chat moderation at this scale is a profanity/keyword filter, a report button, a block list, and retained transcripts. No vendor needed.

### Gaps
- No published **Twilio Proxy per-session price** was found; the Proxy product page and docs describe the mechanism, not the fee. It bills as number rental + per-message/voice usage, but the exact proxy surcharge needs a quote.
- Twilio **+970 number inventory** is not confirmed. The voice pricing page advertises "Palestinian Territory phone number pricing... starting at $1.15/mo", but availability by number type (local/mobile) was not verified in the console. - [Twilio, voice pricing Palestine](https://www.twilio.com/en-us/voice/pricing/ps) **[U]**.
- No Palestinian vendor quote for number masking (Vonage, Infobip) was found; both are quote-based.
- No source found for a Palestinian 24/7 private emergency-response provider; the credible option is staffing your own dispatcher.

---

## 5. Identity and vehicle verification: cost per check and Palestinian document support

### Takeaway
Most global IDV vendors do not support the document every West Bank driver actually carries, the Hawiya. Sumsub's published list accepts **only a Palestinian passport**. Shufti is the standout: it explicitly supports the Hawiya, the PA passport, the Palestinian driving licence, and Arabic OCR. Persona's price is real but its Palestine document coverage is undocumented; Stripe Identity is unusable because Stripe is unavailable to the merchant. At 100 drivers, manual admin review is the correct answer; automate only when onboarding volume makes 5-10 minutes per driver the bottleneck.

### Cited Findings
- Shufti's Palestine page: "Shufti supports **5 Palestinian document types**", listing the **Palestinian ID Card (Hawiya)**, Palestinian Authority passport, Palestinian driver's licence, birth certificate, and marriage certificate; it claims Arabic-script OCR, Hawiya-first workflows, and <5 second verification. - [ShuftiPro, Palestine](https://shuftipro.com/supported-countries/palestine/) **[D, vendor marketing]**.
- Sumsub's supported-document table for Palestine lists **only "Passport"** - no Hawiya, no driving licence. - [Sumsub, supported identity documents](https://docs.sumsub.com/docs/qes-supported-identity-documents) **[D, updated 2026-10-27]**.
- Stripe Identity costs **$1.50 per document + selfie verification**, with the **first 50 free**, and $0.50 per US ID-number lookup; custom pricing above roughly 2,000 verifications/month. - [Stripe, Identity](https://stripe.com/identity) **[D]**; [Stripe, pricing](https://stripe.com/pricing) **[D]**. It requires a Stripe account, which a Palestinian merchant does not have on the evidence in section 1.
- Persona's pricing page describes plans "starting at **$250/month** (minimum contract term of 12 months)"; third-party pricing research reports the Essential plan includes 500 verifications then **$1.50 each**, and per-verification costs of $0.50-$4.00 depending on check type and volume. - [Persona, pricing](https://withpersona.com/pricing/) **[D, page returned 403 to this session; snippet only]**; [Vendr, Persona pricing](https://www.vendr.com/marketplace/persona) **[U, secondary]**; [TrustSwiftly, IDV pricing comparison 2026](https://trustswiftly.com/blog/identity-verification-pricing-comparison-and-2026-update) **[U, secondary]**.
- No public Onfido price list was found; Onfido is quote-based, and its Palestine document coverage was not confirmed. **Azure AI Vision** can do face/liveness but no Palestinian Hawiya OCR coverage was documented in this pass.

### Inferences
- The practical launch stack is **manual review with a structured checklist**: Hawiya front/back, a selfie holding the ID, the vehicle registration, the driver's licence, and a vehicle photo with plate. Store the images encrypted, record the reviewer and timestamp, and re-verify annually. Software cost: $0. Labour cost: 5-10 minutes per driver, which at 100 drivers is one working day.
- If automation is needed, Shufti is the first call because it is the only vendor with a published Hawiya capability. Persona is the second call only if it confirms Hawiya support in writing; its $250/month minimum makes it a 1,000+ driver decision, not a pilot decision.
- Stripe Identity's $1.50 is the cheapest published per-check price, but it is irrelevant without a Stripe merchant account. Do not put it in the model as if it were available.

### Gaps
- Persona's actual document coverage for Palestine (Hawiya vs passport-only) is not documented on a public page I could retrieve. **Ask for the country/document matrix in writing.**
- Onfido's price and Palestine coverage are unknown; no public page found.
- No vendor publishes a Hawiya **fraud/authenticity** benchmark; the Shufti pass-rate claim (98.10%) is vendor marketing and not independently verified.
- Vehicle registration verification has no API: Palestinian vehicle registration documents are not in a public registry that a vendor can query. Manual review is the only path.

---

## 6. Bottom-up TCO at 100 / 1,000 / 10,000 drivers

### Takeaway
Using published unit prices and the assignment's volumes, the **infrastructure-only** cost of an Uber-shaped stack is about **$61/month at 100 drivers, $217/month at 1,000, and $1,442/month at 10,000**, provided you use OpenStreetMap/OSRM, keep SMS for onboarding only, and accept a single-region deployment. The same stack with **daily SMS OTP** costs **$1,291 / $12,520 / $124,472**. Mapbox routing adds $0 / $960 / $7,600; Google Maps adds $810 / $6,900 / five figures. Payment acceptance overtakes the entire software bill at only **~1.5% of GMV paid by card** (2.5% fee) or **~15% of GMV paid by QR** (0.25% fee); at a 20% card mix the fees are roughly 14x the software cost.

### Cited Findings
The model below is arithmetic on the published unit prices in the next table. The assumptions are mine and are stated explicitly; the prices are the vendors' documents, each linked and labelled.

#### Model assumptions (mine, not sourced)
- 30 days/month; **10 trips/driver/day = 300 trips/driver/month**.
- **3 map sessions/trip**, **2 route calls/trip**, **1 push/trip**, **1 OTP/login/day** in the "as specified" scenario.
- Login is once per driver per day. The "recommended" scenario replaces daily SMS with a device-bound session and sends SMS only to a new device or a monthly re-verification, assumed at **10% of the driver base per month**.
- Drivers are the only mobile MAU in the map SDK count; riders are assumed to use the same app but are not separately counted in the mobile-MAU line (this understates Mapbox mobile MAU at consumer scale).
- No location-ingest line in the base table; it is modelled separately below because it is the hidden cost that breaks the 10,000-driver tier.
- All prices are the published list prices on 2026-10-29, excluding tax and FX.

#### Published unit prices used

| Line item | Published price | Source |
|---|---|---|
| Twilio SMS, Palestine | **$0.4101 per segment** | [Twilio SMS pricing PS](https://www.twilio.com/en-us/sms/pricing/ps) **[D]** |
| Mapbox Directions | 100k requests free, then **$2.00/1k** (to 500k), $1.60/1k (to 1M), $1.20/1k | [Mapbox pricing](https://www.mapbox.com/pricing) **[D]** |
| Mapbox Mobile Maps SDK | **25k MAU free**, then $4.00/1k (to 125k) | [Mapbox pricing](https://www.mapbox.com/pricing) **[D]** |
| Mapbox Geocoding | 100k requests free, then **$0.75/1k** (to 500k), $0.60/1k (to 1M), $0.45/1k | [Mapbox pricing](https://www.mapbox.com/pricing) **[D]** |
| Google Dynamic Maps | 10k free/SKU/month, then **$7.00/1k** (first band) | [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/) **[D]**; [Google March 2025 changes](https://developers.google.com/maps/billing-and-pricing/march-2025) **[D]** |
| Google Compute Routes Essentials | 10k free/SKU/month, then **$5.00/1k** (first band) | [Google March 2025 changes](https://developers.google.com/maps/billing-and-pricing/march-2025) **[D]** |
| Supabase Pro | **$25/mo**, 8 GB disk, 100k MAU, 500 realtime connections, 100 GB storage; compute add-ons from $10 (Micro) / $15 (Small) / $110 (Large) | [Supabase pricing](https://supabase.com/pricing) **[D]** |
| Neon Launch | **$0.106/CU-hour**, $0.35/GB-month, scale-to-zero; 0.25 CU always-on ≈ **$19.35/mo** + storage | [Neon pricing](https://neon.com/pricing) **[D]** |
| Render web service | **$7/mo** (0.5 CPU/512 MB), $25 (1 CPU/2 GB), $85 (2 CPU/4 GB) | [Render pricing](https://render.com/pricing) **[D]** |
| Render Postgres | **$6/mo** (256 MB), $19 (1 GB), $40 (2 GB/4 GB) | [Render pricing](https://render.com/pricing) **[D]** |
| Resend | **$0** 3,000 emails/mo (100/day), **$20/mo** 50,000 | [Resend pricing](https://resend.com/pricing) **[D]** |
| Expo Push | **$0**, 600 notifications/sec/project | [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/) **[D]** |
| Cloudflare R2 | **$0.015/GB-month**, 10 GB free, egress free | [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) **[D, updated 2026-10-26]** |
| OpenFreeMap tiles | **$0**, "no limits on the number of map views or requests", **no SLA**, donation-funded | [OpenFreeMap](https://openfreemap.org/) **[D]** |
| OSRM routing | **free, open source, BSD-2-Clause** (you pay the server) | [Project OSRM](https://project-osrm.org/) **[D]** |

#### Volumes

| Volume | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---:|---:|---:|
| Trips/month | 30,000 | 300,000 | 3,000,000 |
| Map sessions/month | 90,000 | 900,000 | 9,000,000 |
| Route calls/month | 60,000 | 600,000 | 6,000,000 |
| SMS OTP/month (daily login) | 3,000 | 30,000 | 300,000 |
| SMS OTP/month (device-bound, 10% new) | 10 | 100 | 1,000 |
| Push/month | 30,000 | 300,000 | 3,000,000 |

#### Recommended stack: OSM tiles + self-hosted OSRM + device-bound auth

| Line item | Unit basis | 100 | 1,000 | 10,000 |
|---|---|---:|---:|---:|
| App servers (Render) | $7 / $25 / $85 | $7 | $50 (2×$25) | $340 (4×$85) |
| Postgres (Supabase Pro + compute) | $25 / $30 / $125 | $25 | $30 | $125 |
| Routing server (OSRM) | $25 / $25 / $85 | $25 | $25 | $255 (3×$85) |
| Geocoding (self-hosted Nominatim/Photon) | $0 licence, shares routing node | $0 | $0 | $0 |
| Object storage (R2) | $0.015/GB after 10 GB | $0 | $1 | $7 |
| Transactional email (Resend) | $0 / $20 / $35 | $0 | $20 | $35 |
| Push (Expo) | $0 | $0 | $0 | $0 |
| SMS onboarding (10% new drivers) | $0.4101 | $4 | $41 | $410 |
| Realtime (Supabase connections) | 500 included, $10/1k | $0 | $0 | $20 |
| Monitoring/support allowance | not verified | $0 | $50 | $250 |
| **Total/month** | | **~$61** | **~$217** | **~$1,442** |

**What this table does not include:** card/QR fees, cash-handling labour, 24/7 dispatcher/safety staff, legal/licensing, app-store fees, SMS at daily login, and location time-series storage. It is infrastructure, not a P&L.

#### Sensitivity 1: daily SMS OTP (the assignment's stated volume)

| Volume | SMS messages/month | SMS cost | Total with SMS |
|---|---:|---:|---:|
| 100 drivers | 3,000 | **$1,230** | **~$1,291** |
| 1,000 drivers | 30,000 | **$12,303** | **~$12,520** |
| 10,000 drivers | 300,000 | **$123,030** | **~$124,472** |

Arithmetic: messages × $0.4101. This is the single most important number in the note. A daily SMS login is not an affordable design in Palestine at Twilio's rate.

#### Sensitivity 2: Mapbox Directions instead of OSRM

| Volume | Billable route calls | Mapbox Directions cost | Total |
|---|---:|---:|---:|
| 100 | 0 (60k < 100k free) | $0 | ~$61 |
| 1,000 | 500,000 (100k free) | 400k×$2/1k + 100k×$1.60/1k = **$960** | **~$1,177** |
| 10,000 | 5,900,000 | 400k×$2 + 500k×$1.60 + 5M×$1.20 = **$7,600** | **~$9,042** |

Mobile MAU stays inside Mapbox's 25k free tier at all three driver counts; the routing calls are what break it. If destination search also uses Mapbox Geocoding at 1 request/trip, add **$0 / $150 / $1,455** (100k free, then $0.75/1k to 500k, $0.60/1k to 1M, $0.45/1k above).

#### Sensitivity 3: Google Maps Platform instead of OSM

| Volume | Dynamic Maps (after 10k free) | Compute Routes (after 10k free) | Add-on | Total |
|---|---:|---:|---:|---:|
| 100 | 80k×$7/1k = $560 | 50k×$5/1k = $250 | **$810** | **~$871** |
| 1,000 | 90k×$7 + 400k×$5.60 + 400k×$4.20 = **$4,550** | 90k×$5 + 400k×$4 + 100k×$3 = **$2,350** | **$6,900** | **~$7,117** |
| 10,000 | five figures by the same bands | five figures | **not computed** | **not computed** |

Google's subscription plans (Starter $100/50k calls, Essentials $275/100k, Pro $1,200/250k) are an alternative, but 150k events at 100 drivers already exceeds the Essentials allowance, so the effective entry point is Pro. This assumes one "call" equals one billable event across SKUs; the plan page does not define the conversion precisely, so confirm it with Google before relying on the subscription ceiling. Neither Google row includes geocoding: at 1 request/trip, Google Geocoding (10k free, $5/1k first band) adds **$100 at 100 drivers** and **~$1,250 at 1,000** to the totals above. - [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/) **[D]**.

#### Sensitivity 4: the hidden location-ingest cost

At 10,000 drivers online 8 hours/day with one GPS fix every 5 seconds: 10,000 × 5,760 = **57.6 million fixes/day**, or **667 writes/second average** (peaks 3-5x), **1.73 billion rows/month**, roughly **173 GB/month at 100 bytes/row**. A single Postgres instance will not carry that with indexes and live queries; it needs a time-series store (Timescale/ClickHouse) or an append-only queue plus rollups. I did not find a published managed price for this exact workload, so the line is **unverified**; budget **$300-1,500/month** at the 10,000-driver tier, which pushes the "under $2,000" stack close to its ceiling before staff.

#### Payment fees are larger than infrastructure

Illustrative only: 30,000 trips at an assumed 20 ILS average fare = **600,000 ILS/month** GMV at 100 drivers. At 20% card share, 120,000 ILS × 2.5% = **3,000 ILS/month**; at 30% QR share, 180,000 ILS × 0.25% = **450 ILS/month**. That is **3,450 ILS/month in acceptance fees**, versus roughly 220 ILS for the entire software stack. At 1,000 drivers the same mix yields 30,000 + 4,500 = **34,500 ILS/month**. The fare and digital-share assumptions are mine, not sourced; the fee rates are BOP's published rates. - [BOP gateway](https://www.bop.ps/en/business/electronic-services/payment-gateway) **[D]**; [BOP QR](https://www.bankofpalestine.com/en/about/news/725) **[D]**.

### Inferences
- The "Uber-quality" cost curve is not driven by maps or hosting. It is driven by **SMS**, **payment acceptance**, **cash handling**, and **people**. A team that optimises the database bill and ignores the 2.5% card fee has optimised the wrong 2% of cost.
- OSM/OSRM is the only routing stack that stays cheap at 1,000+ drivers. Mapbox is acceptable at 100 drivers and painful at 1,000; Google is painful at 100.
- The 10,000-driver column is an infrastructure estimate, not an operating plan. At 3 million trips/month, location ingest, support, and payment operations each cost more than the entire table.

### Gaps
- No published price for a **managed time-series/location store** at 57M writes/day; the $300-1,500 estimate is unverified.
- No Palestinian SMS aggregator price (Jawwal/Ooredoo direct) was found; Twilio's $0.4101 is likely to be materially above the local wholesale rate. **This is the highest-value quote to obtain.**
- No published price for PalPay merchant fees, BOP bulk payouts, or cash-in-transit/reconciliation labour.
- No verified FX rate applied; all ILS figures are left in ILS.
- The model assumes drivers are the only map MAU; a consumer app with 10x riders would change Mapbox's MAU band, though not the free 25k until rider count exceeds it.

---

## 7. Free-tier traps, ranked by risk to a launch

### Takeaway
The most dangerous "free" tier is not a free tier at all: it is Twilio's Palestine SMS rate, which is metered from message one and can exceed the entire infrastructure budget on day one. The second is Render's free web service, which sleeps after 15 minutes and cold-starts in about a minute, and whose free Postgres is deleted 30 days after creation. Third is the Google Maps credit change: the old $200 pool is gone, replaced by 10,000 free calls per SKU, and a single 100-driver pilot generates 150,000 map/route events.

### Cited Findings
Every trap below is a documented limit or price on the linked page. The ranking is my inference about launch impact.

#### Ranked traps

1. **Twilio SMS at $0.4101/segment (not a free tier, a cost cliff).** 3,000 OTPs/month = $1,230, more than 20x the rest of the pilot stack. The trial is worse: verified recipients only, max 5, no number portability after upgrade. - [Twilio SMS pricing PS](https://www.twilio.com/en-us/sms/pricing/ps) **[D]**; [Twilio trial restrictions](https://www.twilio.com/docs/usage/trials) **[D]**.
2. **Render free web service: sleeps after 15 minutes of no inbound traffic, ~1 minute cold start, 750 free instance-hours/month, and a free Postgres that expires 30 days after creation and is deleted after a 14-day grace period.** A dispatch API that cold-starts is an outage. - [Render, free deploy](https://render.com/docs/free) **[D]**.
3. **Google Maps: the $200 monthly credit was retired on 1 March 2025**, replaced by 10,000 free calls per Essentials SKU; Dynamic Maps then costs $7/1k and Routes $5/1k. At 100 drivers the add-on is ~$810/month; at 1,000 drivers ~$6,900. - [Google, March 2025 changes](https://developers.google.com/maps/billing-and-pricing/march-2025) **[D]**; [Google Maps pricing](https://mapsplatform.google.com/pricing/) **[D]**.
4. **Mapbox: 25k mobile MAU free, but Directions is 100k requests free then $2/1k.** At 1,000 drivers, 600k route calls cost $960; at 10,000, $7,600. The free MAU tier hides the routing bill. - [Mapbox pricing](https://www.mapbox.com/pricing) **[D]**.
5. **Supabase free: 500 MB database, 5 GB egress, 200 realtime connections, and projects are paused after 1 week of inactivity; paid projects are never paused.** A pilot with a quiet week can wake up to a paused database. - [Supabase pricing](https://supabase.com/pricing) **[D]**.
6. **Neon free: scale-to-zero after 5 minutes, 100 CU-hours/project, 1 GB storage; running out of CU-hours or egress suspends compute until the next billing period.** Cold starts are directly visible in dispatch latency. - [Neon pricing](https://neon.com/pricing) **[D]**.
7. **Paddle payout: monthly, $100 minimum, by the 15th, possible $15 SWIFT fee.** Fine for a SaaS; wrong for a cash-flow business that pays drivers daily. - [Paddle payouts](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid) **[D]**.
8. **OpenFreeMap: free, no request limits, commercial use allowed, but "no SLA guarantees or personalized support" and donation-funded.** At 10,000 drivers and 9M map sessions/month you are depending on one person's servers. - [OpenFreeMap](https://openfreemap.org/) **[D]**.
9. **Payoneer/Wise account freezes for Palestinian users.** Not a free tier, but a "free" international account that can freeze is a liquidity trap; keep driver float in a local bank. - [Business & Human Rights Resource Centre](https://www.business-humanrights.org/it/latest-news/palestineisrael-criticism-against-wise-and-payoneer-for-freezing-the-accounts-of-palestinians-in-gaza-in-disproportionate-adherence-to-regulations-incl-co-comment/) **[U, press]**.
10. **Twilio Proxy is a public beta with no SLA.** Building a safety-critical masking flow on a beta product is a launch risk even when the price is acceptable. - [Twilio Proxy docs](https://www.twilio.com/docs/proxy) **[D]**.

### Inferences
- The cheapest way to de-risk the list is architectural, not commercial: make SMS optional (device-bound sessions, WhatsApp/email fallback), keep the dispatch API on a paid $7 instance from day one, and put a hard spend cap on every metered API.
- Free tiers are acceptable for email, push, object storage under 10 GB, and map tiles during a closed pilot. They are not acceptable for the database, the dispatch API, or anything on the safety path.

### Gaps
- No verified price for a **local SMS aggregator** in Palestine; this is the quote that would change the model most.
- No published SLA or rate-limit policy for OpenFreeMap's public instance beyond "no SLA"; heavy-use behaviour is undocumented.
- No current price for **Firebase Spark/Blaze** or **Vercel Hobby** was collected in this pass; both are common free-tier traps but are outside the chosen stack.

---

## 8. Build vs buy: commodity vs moat

### Takeaway
Buy the undifferentiated plumbing: email, push, database, object storage, map tiles, SMS termination, card acquiring. Build the four things that decide whether the product works: dispatch/matching, checkpoint-aware routing and ETA, the cash/fare ledger, and driver onboarding/supply operations. Never outsource the ledger or the dispatch decision; those are the company. Safety accountability can use vendor tools but cannot be delegated to a vendor.

### Cited Findings
- Uber's own public description of matching is multi-objective ("minimizing wait times for riders while maximizing earnings for drivers") with a reinforcement-learning ranking signal, and its ETA is a routing engine plus an ML residual model (DeepETA). Neither is a commodity API you can buy. - [Uber, DeepETA](https://www.uber.com/us/en/blog/deepeta-how-uber-predicts-arrival-times) **[D]**; [Uber, RL for marketplace balance](https://www.uber.com/us/en/blog/reinforcement-learning-for-modeling-marketplace-balance) **[D]**.
- Uber moved trip state from polling to push because 80% of API gateway requests were polling; the push platform uses at-least-once delivery, 4-second heartbeats, 7-second client timeout, and priority buckets. This is a build decision, not a vendor SKU. - [Uber, real-time push platform](https://www.uber.com/ng/en/blog/real-time-push-platform) **[D]**.
- Uber's PIN verification is 4 digits, 5 attempts, and gates trip start; that is a buildable control, not a differentiator to license. - [Uber, PIN verification](https://www.uber.com/us/en/blog/pin-verification-drivers) **[D]**.
- The commodity layer has published, substitutable prices: Resend $20/50k email, Expo push $0, Supabase $25, R2 $0.015/GB, OpenFreeMap $0, OSRM free. Switching costs are low and none of them touch the customer promise. - [Resend](https://resend.com/pricing); [Expo](https://docs.expo.dev/push-notifications/faq/); [Supabase](https://supabase.com/pricing); [R2](https://developers.cloudflare.com/r2/pricing/); [OpenFreeMap](https://openfreemap.org/); [OSRM](https://project-osrm.org/) **[all D]**.

### Inferences
- The moat in a West Bank ride-hailing product is **local operational knowledge**: which checkpoints are open, how long a Qalandia crossing takes at 07:30, which Ramallah streets are one-way in practice, which drivers will actually show up, and who owes cash at the end of the day. No global API sells that.
- The ledger is the second moat. If the platform cannot prove what each driver owes after each shift, cash-first operations collapse into dispute handling. Build it as double-entry from day one, even in a spreadsheet-backed pilot.
- Buying dispatch (a white-label ride-hailing SaaS) gives away the only thing that differentiates the product and usually the customer relationship. It is the one "buy" that should be refused even when it looks cheaper.

### Gaps
- No public benchmark compares a local OSRM ETA against Uber/Google in Ramallah; the prior repo research proposes an ETA acceptance bar but has not measured it. - [Prior note: uber_quality_acceptance.md](../Azure%20stack%20evidence%20review/uber_quality_acceptance.md) **[U, internal]**.
- No published price for a white-label dispatch SaaS in Palestine; the build-vs-buy comparison therefore excludes a real quote.

---

## 9. Minimum credible stacks under $100, $500, and $2,000 per month

### Takeaway
Under $100 is a real 100-driver pilot if you accept a single region, a single database, cash-first payments, manual KYC, and no 24/7 staff. Under $500 is 1,000 drivers with backups, a second app instance, and room for a card gateway priced on top at 2.5%. Under $2,000 is 10,000 drivers on infrastructure only, and it is not honest to call it "Uber-quality" without a time-series location store and a staffed safety/dispatch team.

### Cited Findings
Each tier is priced from the unit prices in section 6. The service choices are the cited services; the totals are arithmetic on those prices.

#### Under $100/month: 100-driver Ramallah pilot

| Component | Choice | Monthly |
|---|---|---:|
| App/API | Render 0.5 CPU/512 MB | $7 |
| Database | Supabase Pro (8 GB, backups, 500 realtime) | $25 |
| Routing | Self-hosted OSRM on a small node | $25 |
| Tiles | OpenFreeMap public instance | $0 |
| Storage | Cloudflare R2 (<10 GB) | $0 |
| Email | Resend free (3k/mo) | $0 |
| Push | Expo Push | $0 |
| SMS | Onboarding only, 10 new drivers | $4 |
| Support | WhatsApp Business + shared inbox, no paid tool | $0 |
| **Total** | | **~$61** |

**What is missing:** high availability (single app instance, single DB), automated KYC, card payments (add BOP at 2.5%), number masking, 24/7 safety staffing, PITR beyond daily backups, and a disaster-recovery region. This tier is honest only for a closed pilot with a named on-call person.

#### Under $500/month: 1,000 drivers

| Component | Choice | Monthly |
|---|---|---:|
| App/API | 2× Render 1 CPU/2 GB | $50 |
| Database | Supabase Pro + Small compute | $30 |
| Routing | Dedicated OSRM node | $25 |
| Tiles | OpenFreeMap, with a self-host fallback plan | $0 |
| Storage | R2 ~45 GB | $1 |
| Email | Resend Pro 50k | $20 |
| Push | Expo | $0 |
| SMS | Onboarding, 100 new drivers | $41 |
| Realtime | Included 500 connections | $0 |
| Monitoring/support allowance | allowance, not a quote | $50 |
| **Total** | | **~$217** |

**What is missing:** 24/7 dispatcher/safety staff, automated driver payouts, a time-series location store, multi-zone dispatch, and a second region. Card acquiring is available but its 2.5% is a variable cost on top.

#### Under $2,000/month: 10,000 drivers (infrastructure only)

| Component | Choice | Monthly |
|---|---|---:|
| App/API | 4× Render 2 CPU/4 GB | $340 |
| Database | Supabase Pro + Large compute | $125 |
| Routing | 3× OSRM nodes | $255 |
| Tiles | Self-hosted tiles + CDN, or OpenFreeMap with a support plan | not priced |
| Storage | R2 ~450 GB | $7 |
| Email | Resend 100k | $35 |
| Push | Expo | $0 |
| SMS | Onboarding, 1,000 new drivers | $410 |
| Realtime | ~2,000 concurrent connections | $20 |
| Monitoring/support allowance | allowance, not a quote | $250 |
| **Total** | | **~$1,442** |

The total excludes the tile line: it is $0 on OpenFreeMap's public instance, which has no SLA, and a self-hosted tile stack is not priced here.

**What is missing:** location time-series ingest (**$300-1,500/month unverified**), 24/7 multi-person dispatch and safety, automated payouts, fraud/risk ops, and the staff to run 3 million trips/month. At this tier the software bill is ~$1,450 but the operating company is a payroll, not a server.

### Inferences
- The $100 tier is not a toy: it can run a real 100-driver pilot in one city. What it cannot do is survive a database loss or a 2 a.m. SOS without a human.
- The jump from $100 to $500 buys resilience (second instance, backups, monitoring), not features. The jump from $500 to $2,000 buys throughput. Neither buys trust; that is staffing and process.

### Gaps
- No quote for a self-hosted tile stack at 9M sessions/month; OpenFreeMap is free but has no SLA, and a CDN/object-storage bill for self-hosting was not modelled.
- No price for 24/7 dispatch/safety staffing in Ramallah; salaries are excluded from every tier.
- No price for a managed time-series database at the modelled write rate.

---

## 10. Recommendation: the cheapest honest 100-driver Ramallah pilot, and the first three paid upgrades

### Takeaway
Launch on **cash + a 0.25% bank QR rail**, **MapLibre/OpenFreeMap + self-hosted OSRM**, **one managed Postgres with backups**, **Expo push**, **manual Hawiya/vehicle review**, and **SMS only for new-device verification**. That is about **$61/month, plus about $41 of one-time SMS if all 100 drivers are verified in month one**, and it is honest for a closed 100-driver Ramallah pilot if you name an on-call person and cap every metered API. The first three paid upgrades should be resilience, a local SMS/WhatsApp OTP path, and human safety coverage, in that order. Card acceptance and automated KYC come later.

### Cited Findings
The recommendation is an inference from sections 1-9; every product claim reused here is cited inline.

#### The pilot stack, concretely

- **Payments:** cash is the default. Add Bank of Palestine's QR at **0.25%** for riders who bank with BOP/AIB/PalPay; add the BOP card gateway at **2.5%** only for corporate/delivery accounts. Do not integrate Stripe/PayPal/Checkout/HyperPay. Ask PalPay and Paddle for written terms in parallel, but do not block launch on them.
- **Payouts:** daily cash reconciliation in a double-entry ledger; driver handover at a physical office or via a trusted captain. No digital payout at launch.
- **Maps/routing:** MapLibre GL + OpenFreeMap tiles; self-hosted OSRM with an OSM West Bank extract. Keep a manual "checkpoint delay" adjustment in the ETA until you have measured data.
- **Auth:** phone number + device-bound session; SMS only on a new device. Do not run daily SMS OTP.
- **Safety:** in-app SOS that dials 101 and posts trip + location to an on-call person; signed trip-share link; 4-digit start PIN with 5 attempts; in-app chat with report/block. No Twilio Proxy at launch.
- **Identity:** manual review of Hawiya front/back, selfie with ID, driver's licence, vehicle registration, and plate photo; annual re-review. Keep images encrypted and access-logged.
- **Ops:** one dispatcher phone, one WhatsApp support number, a shared incident log, and a daily cash reconciliation sheet.

#### The three paid upgrades, in order

1. **Resilience: managed Postgres with daily backups and a second app instance (~$40-65/month).** The first outage during a Friday evening surge costs more in trust than a year of this upgrade. Supabase Pro's daily backups and paid compute, or Render Postgres at $19-40, are the documented options; point-in-time recovery is a separate Supabase add-on at **$100/month per 7 days retention** if you need it. - [Supabase pricing](https://supabase.com/pricing); [Render pricing](https://render.com/pricing) **[D]**.
2. **Kill the SMS cost trap: a local aggregator or WhatsApp OTP (quote-dependent).** Twilio at $0.4101 makes daily OTP impossible; a local Jawwal/Ooredoo short-code or WhatsApp authentication template is likely to be materially cheaper. Get the quote before setting a budget, and do not assume a multiplier. This is the highest-ROI commercial negotiation in the stack. - [Twilio SMS PS](https://www.twilio.com/en-us/sms/pricing/ps) **[D]**; local rates **unverified**.
3. **Human safety and dispatch coverage: a named 24/7 rota (people cost, not software).** Uber-quality safety is an answered call, not a button. Staff one dispatcher per shift before buying number masking or an IDV vendor. The PRCS 101 center is the escalation path for medical emergencies, not a substitute for your own acknowledgement. - [PRCS 101](https://www.palestinercs.org/en/Article/11233/101-Call-Center) **[D]**.

**Then, as volume grows:** number masking (Twilio Proxy or a local PBX) when harassment volume justifies it; automated KYC (Shufti first, because of Hawiya support); card gateway when corporate/delivery demand pays for the 2.5%; a time-series location store before 1,000 drivers, not after.

#### What must never be outsourced
- **Dispatch and offer logic.** It is the product. A white-label dispatch vendor owns your driver relationships and your SLA.
- **The fare/cash ledger.** Double-entry, auditable, reconciled daily. This is the only defence against cash leakage and driver disputes.
- **The driver onboarding decision.** Vendors can check documents; they cannot decide who is trustworthy on a Ramallah street.
- **Safety accountability.** A vendor can deliver an SOS payload; it cannot own the 2 a.m. response.

### Inferences
- The cheapest honest pilot is not the cheapest possible pilot. Skipping backups, on-call coverage, or the ledger saves $50/month and creates a failure mode that ends the company. The $61 stack above includes the parts that matter and excludes the parts that can wait.
- Paddle is the only international card option worth a written enquiry, but it is a **rider-side** option with a monthly payout, not a driver-side rail. Treat it as a later experiment, not a launch dependency.
- The real "Uber-quality" gap in Palestine is not the app; it is **checkpoint-aware ETA, cash trust, and an answered emergency call**. Those are local operations, and they are cheaper to build than to buy.

### Gaps
- No written quote from PalPay, BOP, Jawwal Pay, Paddle, Shufti, Persona, Twilio, or a local SMS aggregator. Every commercial term in this note is a list price or a public statement, not a negotiated contract.
- No legal opinion on PMA licensing, e-money rules, sanctions screening, or the draft 20,000 ILS cash cap. **Get local counsel before holding customer or driver funds.**
- No field measurement of West Bank OSM/OSRM ETA quality, checkpoint delays, or OpenFreeMap tile latency in Ramallah. The pilot should measure these in week one.
- No Palestinian cash-share statistic was found; the payment-mix assumptions in section 6 are illustrative and must be replaced with pilot data.
