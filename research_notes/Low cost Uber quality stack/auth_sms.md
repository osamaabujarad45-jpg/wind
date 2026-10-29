# Cheapest credible identity, phone OTP/SMS, email and push stack for a ride-hailing/delivery app in Palestine (+970), October 2026

**Scope:** West Bank / +970, rider and driver onboarding. **All URLs accessed 2026-10-29** unless a page states its own "last updated" date, which is quoted where available.
**Evidence labels:** **[documented]** = provider's own page/docs states it. **[observed]** = what the page currently displays when fetched (still provider-published, not independently tested). **[unverified]** = sales-contact-only, secondary source, or inference not directly confirmed. **No message was actually sent to a +970 handset for this research — every deliverability claim below is provider documentation, not a field test.**

---

## 1. Firebase Authentication / Google Identity Platform: phone sign-in, pricing, Palestine, RN, phone-only accounts

### Takeaway
Firebase/Identity Platform is the cheapest *self-serve, documented* phone-OTP option for +970 at **$0.29 per SMS** with the first **10 SMS/day free**, and 50,000 MAU free — but phone auth is **never free at volume**, requires Blaze billing, and the project's SMS region policy defaults to **no regions allowed** until Palestine is explicitly enabled.

### Cited Findings
- **[documented]** Phone sign-in is a first-class provider; a user can be created with only a phone number (no email required). Phone auth is available on iOS, Android, Web, Flutter, Unity, C++ — [Firebase Auth overview](https://firebase.google.com/docs/auth).
- **[documented]** Verification-code SMS is **Blaze (pay-as-you-go) only**; Spark cannot send them. Firebase Authentication caps at **3,000 SMS/day**; upgrading to Identity Platform removes the cap. Per-IP limits: 150 verification requests/hour, 50 SMS/minute, 500 SMS/hour — [Firebase Auth limits, last updated 2026-10-20](https://firebase.google.com/docs/auth/limits).
- **[documented]** Identity Platform price for **Palestine, State of (PS): $0.29 per SMS sent**; "The first ten SMS that you send per day are not billed" — [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing).
- **[documented]** MAU pricing: **0–50,000 free**, then **$0.0055/MAU** to 100k, $0.0046 to 1M, $0.0032 to 10M, $0.0025 above — [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing).
- **[documented]** Firebase's own pricing page confirms "Phone Auth – All regions … Billed per SMS sent" and "50K MAUs" no-cost with Identity Platform — [Firebase pricing](https://firebase.google.com/pricing).
- **[documented]** Android phone auth requires app verification via **Play Integrity** (or reCAPTCHA fallback); web uses reCAPTCHA. "For new projects, the default [SMS region] policy allows no regions" — [Android phone auth docs, last updated 2026-10-21](https://firebase.google.com/docs/auth/android/phone-auth); [Web phone auth](https://firebase.google.com/docs/auth/web/phone-auth).
- **[documented]** React Native support is through `react-native-firebase`, which works with Expo **development builds** (not Expo Go) — [Expo authentication guide, modified 2026-10-21](https://docs.expo.dev/develop/authentication); [RNFirebase auth usage](https://rnfirebase.io/auth/usage).
- **[documented]** Firebase has **no native passkey SDK**; passkeys require a third-party extension (Corbado, or the community WebAuthn extension) — [Corbado "Passkeys for Firebase" extension](https://www.extensions.dev/extensions/corbado/authentication-corbado); [WebAuthn extension](https://www.extensions.dev/extensions/gavinsawyer/firebase-web-authn). Secondary confirmation that Firebase passkey support is "limited (no native passkey at SDK)" — [Security Boulevard, 2026-05-25](https://securityboulevard.com/2026/05/authentication-services-in-2026-how-they-work-top-providers-compared-and-how-to-choose).

### Inferences
- At 1,000 OTPs/month the bill is **$203** (700 billable after 300 free); 10,000 → **$2,813**; 100,000 → **$28,913**. The 300 free SMS/month is the only "free OTP" and it is a rounding error at any real scale.
- Firebase is the lowest-risk *build*: no SMS aggregator contract, no sender-ID registration, RN SDK exists, and 50k MAU free covers riders and drivers for years. Its weakness is price per SMS in Palestine and the need to allow-list PS in the console.
- Phone-only accounts are fully supported, so a rider can register with just a number; email can be added later and linked.

### Gaps
- Google does not publish a **delivery-rate** figure for PS; $0.29 only proves routing is offered, not that codes arrive.
- The Firebase docs do not state which Palestinian carriers are used or whether +972 Jawwal/Ooredoo prefixes (used by some Palestinians) are deliverable under the PS region policy.

---

## 2. Supabase Auth: phone OTP via Twilio/MessageBird, pricing, free MAU, RN, passkeys

### Takeaway
Supabase gives the most generous **identity** free tier (50,000 MAU, unlimited users) and charges **nothing per SMS itself**, but it does not deliver SMS: you connect your own Twilio/MessageBird/Vonage/TextLocal account and pay that provider's +970 rate (Twilio is **$0.4101/SMS**). It is cheap only if you already have a cheap local SMS route.

### Cited Findings
- **[documented]** Free plan: **50,000 MAU included**, unlimited total users, 2 active projects, projects paused after 1 week inactivity. Pro **$25/mo** includes **100,000 MAU**, then **$0.00325/MAU** — [Supabase pricing](https://supabase.com/pricing).
- **[documented]** Phone sign-in uses an SMS provider you configure: **MessageBird, Twilio, Vonage, TextLocal (community-supported)**; WhatsApp channel only with Twilio/Twilio Verify. Default rate limit 1 OTP/60 s, OTP expires in 1 hour; CAPTCHA recommended to control SMS cost — [Supabase phone login docs](https://supabase.com/docs/guides/auth/phone-login).
- **[documented]** Phone MFA (as a second factor) is a paid add-on: **$75/mo first project, $10/mo each additional** — [Supabase pricing](https://supabase.com/pricing). This is separate from phone *login* and not required for OTP sign-in.
- **[documented]** Passkeys (WebAuthn) exist but are labelled **Experimental**; require an existing confirmed non-anonymous user and a configured `[auth.webauthn]` RP ID — [Supabase passkey docs](https://supabase.com/docs/guides/auth/passkeys).
- **[documented]** React Native: `supabase-js` is used in Expo/RN; Expo's own auth guide lists Supabase as a supported option — [Expo authentication guide](https://docs.expo.dev/develop/authentication).

### Inferences
- Supabase + Twilio at 10,000 OTPs = **$4,101** in Twilio fees + $25 plan = **$4,126**, i.e. ~47% more expensive than Firebase at the same volume. Supabase + a local aggregator at, say, $0.05/SMS would be ~$525 — but that price is unverified.
- Supabase's MAU free tier is irrelevant to the OTP bill; the SMS provider is the cost driver. The 50k MAU free tier only matters once you exceed Firebase's 50k.

### Gaps
- Supabase does not publish a per-country SMS price because it does not resell SMS; there is no Supabase-branded +970 rate to compare.
- No documented evidence that Supabase's OTP template/sender survives Palestinian carrier filtering.

---

## 3. Clerk, Auth0, Amazon Cognito, WorkOS: free tiers, per-MAU, phone OTP, +970 routing, passkeys, RN

### Takeaway
All four are **identity layers, not SMS carriers**. Clerk is the only one that resells SMS (US/Canada $0.01; "international: market rate") and it **blocks every country except US/Canada by default**. Auth0 has the smallest free MAU (25k) and requires your own Twilio. Cognito has 10k free MAU and routes SMS through SNS (price not published on a fetchable page). WorkOS is free to 1M users but has no documented phone-OTP product — it is an email/social/SSO/passkey platform.

### Cited Findings
- **[documented]** Clerk: Hobby **$0**, advertised "Free Up to 50K Users"; Pro **$25/mo** ($20/mo annual), overage from **$0.02/MRU**; SMS codes "US and Canada, **$0.01 per SMS**. International: **market rate**" — [Clerk pricing](https://clerk.com/pricing).
- **[documented]** Clerk's SMS allowlist: "**By default, only the US and Canada are enabled.**" A disabled country's numbers "cannot receive OTPs and a request … will be rejected with an error" — [Clerk sign-up/sign-in options docs](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options).
- **[documented]** Clerk passkeys work with Expo — [Expo authentication guide](https://docs.expo.dev/develop/authentication), linking [Clerk Passkeys for Expo](https://clerk.com/docs/references/expo/passkeys).
- **[documented]** Auth0 Free: **$0, up to 25,000 MAU**, includes passwordless, unlimited social connections, 5 organizations — [Auth0 pricing](https://auth0.com/pricing).
- **[documented]** Auth0 SMS OTP/passwordless requires **Twilio or a custom phone provider**; you supply Twilio SID/token and pay Twilio directly — [Auth0 SMS OTP docs](https://auth0.com/docs/authenticate/passwordless/authentication-methods/sms-otp); [Configure Twilio as phone provider](https://auth0.com/docs/customize/phone-messages/configure-phone-messaging-providers/configure-twilio-as-a-phone-messaging-provider).
- **[documented]** Cognito: free tier **10,000 MAU/month** for Lite/Essentials (direct sign-in or social), **50 MAU** for SAML/OIDC; then **$0.0055/MAU** — [Cognito pricing](https://aws.amazon.com/cognito/pricing/).
- **[documented]** WorkOS: User Management/AuthKit **free up to 1,000,000 MAU**, then **$2,500/mo per additional 1M**; SSO $125/connection — [WorkOS pricing](https://workos.com/pricing).
- **[documented]** WorkOS AuthKit markets social auth, MFA, RBAC, SSO, passkeys — [WorkOS pricing](https://workos.com/pricing); its Firebase-alternatives article lists passkeys and MFA but **not phone/SMS OTP** — [WorkOS blog, 2026-04-29](https://workos.com/blog/firebase-auth-alternatives).

- **[documented]** React Native/Expo support across the four: Expo's auth guide documents **Clerk, Supabase, Cognito (via Amplify) and Firebase** integrations; WorkOS is absent from that list — [Expo authentication guide](https://docs.expo.dev/develop/authentication). Clerk ships an Expo passkeys reference — [Clerk Passkeys for Expo](https://clerk.com/docs/references/expo/passkeys).

### Inferences
- Clerk is disqualified as a turnkey +970 OTP provider: enabling Palestine means international SMS at an unpublished "market rate", plus $25/mo. It remains attractive if email/social/passkeys are the primary methods and phone is secondary.
- Auth0's free 25k MAU looks generous until you add Twilio at **$0.4601 per successful verification** ($0.05 Verify + $0.4101 SMS). Auth0 adds no SMS markup but no SMS capability either.
- Cognito's $0.0055/MAU after 10k is the cheapest per-MAU of the four, but the SMS leg is SNS and no public PS rate could be retrieved; and Cognito's phone-sign-up UX and Expo integration are the heaviest to build.
- WorkOS should be treated as **not supporting phone OTP** until proven otherwise; it is the wrong tool for a phone-first Palestinian rider base.

### Gaps
- **Cognito → SNS Palestine per-SMS price**: AWS SNS pricing page is JavaScript-rendered and returned "Sorry, pricing information requires JavaScript" — no PS rate captured. **[unverified]**
- **WorkOS phone OTP**: no public doc found; absence of evidence, not documented absence. **[unverified]**
- Auth0 paid-plan prices (Essentials/Professional) were not captured beyond the secondary claim of $35/$240 per month in Clerk's comparison — treat as **[unverified]**.

---

## 4. Twilio Verify, Vonage, Infobip, Bird/MessageBird, Sinch, AWS SNS: per-message cost to +970, sender ID, DLR, trial credit, coverage

### Takeaway
Only **Twilio publishes a clean +970 rate ($0.4101/SMS)** and it is the most expensive credible route; Twilio Verify adds **$0.05 per successful verification**. **D7 publishes $0.29** and **LabsMobile €0.2750**; Infobip (~$0.2195) and Sinch (~$0.32) appear only in a secondary comparison. Vonage, Bird and AWS SNS hide PS pricing behind a country selector/JS and should be treated as **quote-only**.

### Cited Findings
- **[documented]** Twilio Palestine: **International numbers $0.4101 outbound**, **Alphanumeric sender ID $0.4101**; SMS charged per segment; a **$0.001 failed-message fee** applies — [Twilio SMS pricing PS, "current as of October 2026"](https://www.twilio.com/en-us/sms/pricing/ps).
- **[documented]** Twilio Palestine guidelines: **two-way SMS: No**; **number portability: No**; MCC **425**; "**Numeric Sender ID is not supported in Palestine. Submission by International Long Codes will be attempted on a best-effort basis. The Long Code will be overwritten with a generic Alphanumeric Sender ID outside the Twilio platform.**" — [Twilio PS guidelines](https://www.twilio.com/en-us/guidelines/ps/sms).
- **[documented]** Twilio distinguishes Israel from Palestine by prefix, and notes **+97256 and +97259 are Palestinian Jawwal/Wataniya** prefixes — [Twilio changelog, 2023-03-07](https://www.twilio.com/en-us/changelog/programmable-sms-geo-permissions-israel-and-palestine-prefix-update).
- **[documented]** Twilio Verify: **$0.05 per successful verification + channel fee**; SMS attempts are always charged even if the user never completes; $0.05 is not charged for failed/expired verifications but the SMS is — [Twilio Verify pricing, "current as of August 2026"](https://www.twilio.com/en-us/verify/pricing).
- **[documented]** Twilio trial: "Start for free … No credit card required" — [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing). The dollar amount of trial credit is **not stated on the fetched pages**. **[unverified]**
- **[documented]** D7 Networks Palestine: **$0.29/SMS local and $0.29 international**, 160 chars, "Two Way SMS supported: No", MCC 425, sender-ID registration and content approval "managed through" Jawwal/Ooredoo — [D7 Palestine SMS page](https://d7networks.com/sms/palestine).
- **[documented]** LabsMobile price list (dated 2026-10-26): **Palestine (PS) €0.2750** at 33–817 SMS, €0.2445 at 818+ — [LabsMobile price list](https://www.labsmobile.com/en/prices/pricelist).
- **[unverified, secondary]** A provider-comparison page states Palestinian Territory SMS ranges **$0.0055 (Plivo) to $0.3869 (Twilio premium)**, with **Sinch $0.32**, **Infobip $0.2195**, Decision Telecom $0.0747, "all providers offer volume discounts" — [Sent.dm, 2026-03-08](https://www.sent.dm/fr/resources/sms-pricing/palestinian-territory-sms-pricing). The $0.0055 Plivo figure is implausible for PS and should not be used without a Plivo quote.
- **[documented]** Vonage's SMS pricing page has a country selector including "Palestine, State Of" but the rate is rendered client-side; **no public PS number captured** — [Vonage SMS pricing](https://www.vonage.com/communications-apis/sms/pricing). Vonage's own docs say account-specific rates are in **Billing → Pricing → Download pricing (CSV)** — [Vonage pricing download docs](https://developer.vonage.com/en/dashboard/control/pricing). **[unverified]**
- **[documented]** Infobip publishes only a calculator; "Per-network pricing is available in Portal. The exact price you'll pay per message may vary based on the destination country, network and applicable discounts" — [Infobip SMS pricing](https://www.infobip.com/sms/pricing); [Infobip pricing](https://www.infobip.com/pricing). **[unverified]**
- **[documented]** AWS SNS: free tier includes **1 million mobile push notifications, 1,000 email deliveries**; SMS per-country pricing requires JavaScript — [AWS SNS pricing](https://aws.amazon.com/sns/sms-pricing/). **[unverified for PS]**
- **[documented]** Twilio's own top-level price "starts at $0.0083" is a **US** rate and must not be used for PS — [Twilio pricing](https://www.twilio.com/en-us/pricing); [Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us).

### Inferences
- The +970 market is a **premium SMS destination**: roughly **30–50× the US rate**. Any budget built on US $0.0083 will be wrong by an order of magnitude.
- Numeric sender IDs are not supported; long codes are rewritten to a generic alphanumeric ID. That kills "reply STOP" style two-way flows and means the sender will display as a generic name/string, not a local number — a trust and deliverability risk for OTP.
- With Twilio Verify, the true cost per *successful* verification is **$0.4601** before retries; at a 20% retry rate it is ~$0.55.
- D7 at $0.29 matches Google's PS rate, which suggests $0.29 is a market clearing price for international A2P into PS; anything much below $0.10 should be treated as suspect until field-tested.

### Gaps
- **No provider publishes a +970 delivery-rate/SLA.** Twilio explicitly says long-code submission is "best-effort".
- **Bird/MessageBird** PS rate not captured at all; its pricing is quote-only in the pages found.
- **AWS SNS** PS coverage and price are unconfirmed; SNS may reject PS as an unsupported destination.
- Twilio trial credit amount and Vonage free credit are unverified.

---

## 5. Local Palestinian options: Jawwal, Paltel, Ooredoo, PalPay/aggregators — what is publicly documented

### Takeaway
The local route exists and is the only one that can plausibly beat $0.29/SMS, but **none of the local operators publish OTP pricing**. Jawwal sells Bulk/Application SMS with **custom sender name** through its own portal; **HotSMS (World Links Co.)** is a licensed, certified Jawwal/Ooredoo aggregator with a **dedicated API**; **Ooredoo Palestine exposes CAMARA OTP, Number Verification and SIM Swap APIs** — the most interesting product for a ride-hailing app because Number Verification can confirm a number **without sending an SMS**.

### Cited Findings
- **[documented]** Jawwal "Bulk SMS" and "Application SMS": send to numbers in Palestinian territories, 1948 Palestine and internationally; "through your own electronic portal"; "customize the date, time, and **sender name**"; sold to individuals and enterprise — [Jawwal SMS services](https://www.jawwal.ps/en/9663/9910/9917); [Jawwal Bulk SMS](https://www.jawwal.ps/en/individuals/9662/9668/9735/9736). **No price, API spec, throughput or DLR documentation is published.**
- **[documented]** HotSMS (World Links Co.): "a complete Bulk SMS platform", "**first certified provider for Jawwal and Ooredoo in Palestine since 2008**", licensed by the Ministry of Communications and IT to provide value-added services, PITA member, "largest authorized distributor for … JAWWAL for SMS services", "first provider of SMS services with Ooredoo in the Gaza Strip" (2017); offers "**your own dedicated API**", sub-accounts, multilingual panel, own domain — [HotSMS](https://www.hotsms.ps/portal/hotsms/en). **No public price or OTP-specific SLA.**
- **[documented]** Ooredoo Developer Portal lists **CAMARA OTP** (send-code / validate-code, `authenticationId`), available in **Palestine**; also **CAMARA Number Verification** ("verify phone numbers without SMS codes", available in Palestine) and **SIM Swap** (Palestine not listed in the SIM Swap availability line) — [Ooredoo CAMARA OTP](https://developer.ooredoo.com/api/camara-otp); [Ooredoo phone verification use case](https://developer.ooredoo.com/use-cases/user-verification); [Palestine developer portal](https://developer.ooredoo.com/palestine-developer-portal).
- **[documented]** Ooredoo's own use-case page recommends: verify silently with Number Verification when the device is on the mobile network, fall back to SMS OTP, and use SIM Swap before account recovery — [Ooredoo phone verification use case](https://developer.ooredoo.com/use-cases/user-verification).
- **[unverified, secondary]** Market share: Jawwal ~**78%**, Ooredoo ~**22%** — [D7 Palestine](https://d7networks.com/sms/palestine); Messaggio reports Jawwal **3,000,000** mobile users and Ooredoo Palestine **610,000**, with Jawwal MCC-MNC **425-05** — [Messaggio Jawwal page, data dated 2026-08-11](https://messaggio.com/messaging/carriers/israel/jawwal_palestine/). A second secondary source says Ooredoo passed **1.439M subscribers (March 2024)** and the market was **$167M (2024)** — [Sent.dm](https://www.sent.dm/fr/resources/sms-pricing/palestinian-territory-sms-pricing). These subscriber numbers conflict; use only the order of magnitude (Jawwal dominant, Ooredoo second).
- **[unverified, secondary]** Regulatory oversight is split/uncertain: "The Ministry of Telecommunications and Digital Economy (MTDE) oversees … An independent Palestinian Telecommunications Regulatory Authority (PTRA) remains in development" — [Sent.dm](https://www.sent.dm/fr/resources/sms-pricing/palestinian-territory-sms-pricing). D7 says PTRA "governs all SMS traffic" — [D7](https://d7networks.com/sms/palestine). **Conflict noted; do not assert a single regulator without legal check.**
- **[documented]** PalPay was not found to offer bulk SMS/OTP APIs in any public page; it is a payment provider, not an SMS aggregator. No evidence found — **gap, not a claim.**

### Inferences
- The cheapest credible path is a **local aggregator contract** (Jawwal direct or HotSMS) with a registered sender ID, because international A2P into PS carries a ~$0.22–$0.41 wholesale floor and local termination should be materially lower. But the actual local price is unknown and must be quoted.
- Ooredoo's CAMARA **Number Verification** is strategically important: for riders/drivers on Ooredoo mobile data it can verify the MSISDN with **zero SMS cost** and zero OTP friction; SMS OTP remains the fallback on Wi-Fi and for Jawwal subscribers until Jawwal exposes an equivalent API.
- A mixed carrier strategy is required: Ooredoo-only silent verification covers ~20% of users at best; Jawwal (~78%) still needs SMS.

### Gaps
- **No public OTP price, minimum commit, setup fee, throughput, DLR, or sender-ID registration timeline** from Jawwal, Paltel or Ooredoo. All are sales-contact-only. **[unverified]**
- **No public evidence** that Jawwal/HotSMS support programmatic OTP (as opposed to bulk marketing) at low latency; "Bulk SMS" language suggests campaign batching, and OTP latency must be contractually specified.
- **No public documentation** of whether a registered alphanumeric sender ID displays correctly on Jawwal vs Ooredoo handsets.
- **No public API docs** for Ooredoo CAMARA pricing, sandbox limits, or whether a Palestinian-licensed business (vs foreign entity) is required.

---

## 6. WhatsApp Business Cloud API: 2026 pricing, authentication templates, Palestine, free tier, can it replace SMS OTP?

### Takeaway
WhatsApp moved to **per-message pricing on 2025-07-01** and, from **2026-10-01**, charges for service messages again with a **1,000 free service messages/month per business number**. Authentication templates are the cheapest template category. **Palestine is not a standalone market on Meta's rate card — it falls into "Other"** — and a BSP quotes **€0.0092 per authentication message** to Palestine, roughly **30× cheaper than SMS**. It cannot fully replace SMS because it requires an approved template, opt-in, the WhatsApp app, and template availability at +970 is contested.

### Cited Findings
- **[documented]** Meta charges **per delivered message** (not per conversation) since **2025-07-01**; categories are Marketing, Utility, Authentication, Service, and (from 2026-07-01) Meta Business Agent; only delivered business→user messages are charged — [Meta WhatsApp pricing, effective 2026-10-01](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- **[documented]** From **2026-10-01**, service messages are charged again after a free tier of **1,000 delivered service messages per business phone number per month** (no rollover); utility messages sent inside an open customer-service window are also charged again — [Meta WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- **[documented]** **Volume tiers** apply only to Utility and Authentication, per market–category, aggregated at business-portfolio level; tiers reset monthly — [Meta WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- **[documented]** Palestine (+970) is **not** in the 39 standalone markets and **not** in the 8 named regions (Rest of Middle East = Bahrain, Jordan, Lebanon, Yemen only): "If a country is not listed below, it maps to **Other**" — [Meta WhatsApp pricing, pricing regions](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing). **The "Other" USD rate was not captured.**
- **[documented]** Authentication templates are "our most restrictive": must use Cloud API authentication templates from the Template Library, must configure a **one-time-password button** (copy-code or one-tap), **no URLs, media or emojis**, parameters limited to **15 characters** — [Meta template categorization, updated 2026-09-15](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization); [Authentication templates, updated 2026-10-05](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates).
- **[documented]** Meta does **not** charge for user→business messages; the free entry point (Click-to-WhatsApp ad) window can make auth/utility/service free for up to 7 days — [Meta WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- **[unverified, BSP quote]** Messaggio's Palestine page lists **€0.07150 marketing, €0.00920 utility, €0.00920 authentication** per message, and a **€50 prepaid balance** for the sender ID ("The monthly fee for WhatsApp Sender ID includes prepaid traffic … You can use €50 to send WhatsApp messages to Palestine") — [Messaggio WhatsApp pricing Palestine](https://messaggio.com/pricing-whatsapp/palestine). The page also returned a WordPress critical error in the footer; prices are BSP-quoted, not Meta's rate card.
- **[unverified, conflicting]** Twilio's WhatsApp pricing calculator displays "**Authentication Template (Not available for this region)**" for at least one region selection, alongside Meta's rule that auth templates may be blocked in some markets — [Twilio WhatsApp pricing, current as of September 2026](https://www.twilio.com/en-us/whatsapp/pricing). **I could not confirm whether that message applies to Palestine.** This directly conflicts with Messaggio's claim that authentication is available in Palestine. **Field-test before relying on WhatsApp OTP.**
- **[documented]** Twilio charges a **$0.005 per-message WhatsApp fee** on top of Meta's template fee — [Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing).
- **[documented]** WhatsApp OTP requires the Cloud API/on-prem API and an approved authentication template; the consumer WhatsApp app cannot send OTPs — [Wati OTP guide](https://www.wati.io/en/blog/send-otp-on-whatsapp) (secondary but consistent with Meta docs).

### Inferences
- If Messaggio's €0.0092 is real and auth templates are permitted at +970, WhatsApp is **~$0.011/message vs $0.29 (Firebase) / $0.41 (Twilio)** — a 26–37× saving. At 100k OTPs: **~$1,100 vs $28,900**. That is the single biggest cost lever in this entire stack.
- But WhatsApp OTP is **not a drop-in SMS replacement**: a user without WhatsApp, with a new number, or who has opted out cannot receive it; an approved template and a WABA are prerequisites; and if the auth template is unavailable for "Other" markets, the plan collapses. It should be a **primary channel with SMS fallback**, never the only channel.
- Meta's "Other" classification also means Palestinian traffic does not get volume-tier benefits specific to a named market; it shares the "Other" pool.

### Gaps
- **Exact Meta USD rate for "Other" (which includes Palestine)** — not captured; the CSV/PDF links are not machine-readable in the fetched page.
- **Whether authentication templates are approved for +970** — one BSP says yes, Twilio's calculator hints no for some region. **[unverified, must test]**
- **WhatsApp penetration among Palestinian riders/drivers** — no statistic found. Do not assume 90%.
- Whether a Palestinian business can get a WABA/display name approved without a local entity — no doc found.

---

## 7. Email: Resend, Postmark, Amazon SES, Brevo, Mailgun, ACS — free tiers, domain auth, deliverability to Palestinian inboxes

### Takeaway
Email is effectively **free at this scale**: Resend **3,000/month (100/day)**, Brevo **300/day**, Postmark **100/month**, SES **~$0.16/1,000** on the new Essentials plan. All support custom domains with SPF/DKIM. **No provider publishes Palestine-specific inbox placement**, and Palestinian consumer inboxes are dominated by Gmail/Outlook/Yahoo rather than local domains, so deliverability is a domain-authentication problem, not a country problem.

### Cited Findings
- **[documented]** Resend Free: **3,000 emails/month, 100 emails/day, 3 domains, 3 inboxes, 30-day data retention**, $0 — [Resend pricing](https://resend.com/pricing).
- **[documented]** Postmark: Free developer plan **100 emails/month**; Basic **$15/mo for 10,000**, extra **$1.80/1,000**; Pro **$16.50/mo for 10,000**, extra **$1.20/1,000** — [Postmark pricing](https://postmarkapp.com/pricing).
- **[documented]** Brevo Free: "**up to 300 emails per day**" once the account is approved for sending — [Brevo pricing](https://www.brevo.com/pricing/).
- **[documented]** Amazon SES now presents **Essentials** and **Pro** plans; the worked example bills **250,000 outbound at $0.16/1,000 = $40.00**, plus **$0.12/GB** attachments; new accounts can choose a **free plan available for 6 months** after account creation; free-tier credits expire within 12 months — [Amazon SES pricing](https://aws.amazon.com/ses/pricing/).
- **[documented]** Resend supports custom domains and shows DKIM/SPF setup in the domain settings; open/click tracking is per-domain on every plan including Free — [Resend pricing FAQ](https://resend.com/pricing). (DKIM/SPF mechanics are standard; the page confirms custom domains are included.)
- **[documented]** Postmark markets "industry-leading deliverability" and 45-day retention, custom sending domains, DMARC monitoring add-on ($14/mo/domain) — [Postmark pricing](https://postmarkapp.com/pricing).

### Inferences
- At 10k riders + 10k drivers, transactional email (receipts, verification fallback) is likely <10k/month → **$0** on Resend Free or Brevo Free; at 100k emails/month → **$16 on SES** or ~$20 on Resend Pro. This line item is noise compared with SMS.
- Deliverability to Palestine is not a provider-selection issue; it is SPF+DKIM+DMARC, a warmed domain, and avoiding URL shorteners. No provider claims a Palestinian inbox advantage.

### Gaps
- **Mailgun** free tier and **Azure Communication Services Email** pricing were not fetched — no data. **[unverified]**
- **No Palestine-specific inbox placement or bounce data** exists publicly from any of these providers. **Gap.**
- Resend's Pro price (beyond Free) was not captured; do not quote it.

---

## 8. Push: Expo Push, FCM, OneSignal — free tiers and RN/Expo support

### Takeaway
Push is **free** for this app. Expo Push and FCM have no per-message charge; OneSignal has a free plan with unlimited sends but charges on mobile MAU above an unpublished cap. Use Expo Push if already on Expo; FCM if you need direct control; OneSignal only if you need a dashboard/no-code segmentation.

### Cited Findings
- **[documented]** Firebase Cloud Messaging is in the **no-cost** column of Firebase pricing ("Cloud Messaging (FCM)") — [Firebase pricing](https://firebase.google.com/pricing).
- **[documented]** Expo Push Notifications are part of Expo's free tooling; the overview documents Expo Push Service and device tokens without any paid tier — [Expo push notifications overview](https://docs.expo.dev/push-notifications/overview/).
- **[documented]** OneSignal: "Free to start"; mobile push billed on **monthly active mobile users (MAU)** with **unlimited sends and unlimited in-app messages**; free plan retains subscription records active in the past 18 months; Growth is month-to-month — [OneSignal pricing](https://onesignal.com/pricing). **The numeric free MAU cap is not printed on the page.**
- **[documented]** Expo/RN auth and push integrate with development builds; Expo Go cannot load custom native modules — [Expo authentication guide](https://docs.expo.dev/develop/authentication).

### Inferences
- Push should carry all non-critical notifications (trip status, driver arrival, receipts) so SMS is reserved for OTP and emergencies. This is the main lever to keep SMS volume at ~1 OTP per user per month rather than 3–5.
- OneSignal's free cap being unpublished is a budgeting risk; Expo Push avoids it entirely.

### Gaps
- OneSignal's exact free MAU limit in 2026 is **not published on the pricing page**; older third-party figures should not be used. **[unverified]**
- No data on **Palestinian OEM push reliability** (aggressive battery savers on Huawei/Xiaomi/Transsion devices are a known risk); field test required.

---

## 9. Driver verification: Persona, Onfido, Stripe Identity, Azure AI Vision — cost and whether it is needed for Uber-quality onboarding in Palestine

### Takeaway
**Stripe Identity is the only self-serve, publicly priced option: $1.50 per completed verification, first 50 free.** Persona, Onfido and Azure AI Vision are quote-only or gated. ID+selfie verification is necessary but **not sufficient** for Uber-quality driver onboarding in Palestine: vehicle registration, driving licence, insurance and a background check still need document capture and human review, and there is no Palestinian digital background-check API.

### Cited Findings
- **[documented]** Stripe Identity: "**$1.50 per verification** — Charged when a user completes verification"; "**Your first 50 verifications are free**"; also **$0.50 per lookup**; captures ID documents, selfies, extracted data, and stores verification data for you — [Stripe Identity](https://stripe.com/identity).
- **[unverified]** Persona pricing page returned **HTTP 403** to automated fetch; no public price — [Persona pricing](https://withpersona.com/pricing).
- **[unverified]** Onfido pricing is quote-only; no public per-verification price found in this pass.
- **[unverified]** Azure AI Vision Face is a limited-access service; no public per-verification price for liveness/ID match was captured. Do not budget from memory.
- **[documented, context]** Uber-style onboarding requires driver documents and background checks; Uber's own Palestine availability/requirements page was not fetched in this pass — **gap**. Do not assert Uber's exact Palestinian requirements.

### Inferences
- At **1,000 drivers**, Stripe Identity costs **$1,425** (1,000 × $1.50 − 50 free). At **10,000 drivers**, **$14,925**. That is a one-time onboarding cost, not a monthly one, and it is small relative to the lifetime value of a driver — but it is **not free**, and it does not cover vehicle documents.
- The cheapest credible onboarding is: Stripe Identity for ID + selfie/liveness → store extracted data → **manual ops review** of licence, vehicle registration and insurance photos → periodic re-verification. Persona/Onfido only make sense if you need a global watchlist/AML check or a local document database; neither is documented for Palestine.
- A background check in Palestine cannot be bought from these vendors; it is a manual/legal process. Budget ops time, not API spend.

### Gaps
- **Persona/Onfido/Azure pricing** — all quote-only or blocked. **[unverified]**
- **No documented Palestinian document-type coverage** (Palestinian ID, vehicle registration, driver licence) for Stripe Identity, Persona or Onfido. This is the single biggest onboarding risk and must be tested with real documents.
- **No public Uber Palestine driver-requirements page** captured; "Uber-quality" is therefore an inference from general ride-hailing practice, not a cited standard.

---

## 10. Total cost at 1,000 / 10,000 / 100,000 OTPs per month (plus email and push), and the free-tier cliff

### Takeaway
The OTP bill spans **two orders of magnitude** depending on channel: **~$203–$460 at 1k**, **~$2,813–$4,601 at 10k**, **~$28,913–$46,010 at 100k** for SMS; **WhatsApp at ~€0.0092** would be **~$10–$920** for the same volumes, if it works at +970. Email and push are **$0–$20/month** at all three volumes. The free-tier cliff is **300 SMS/month** (Firebase's 10/day) — everything above that is paid.

### Cost table (USD unless stated; math shown)

Assumptions: 1 SMS per OTP attempt, no retries; Firebase free allowance 10/day ≈ 300/month; Twilio Verify = $0.05 + $0.4101; WhatsApp = €0.0092 (BSP quote, FX not converted); email = Resend Free (≤3k), SES $0.16/1k above; push = $0.

| Channel / provider | 1,000 OTPs/mo | 10,000 OTPs/mo | 100,000 OTPs/mo | Basis |
|---|---:|---:|---:|---|
| **Firebase / Identity Platform (PS $0.29)** | **$203.00** | **$2,813.00** | **$28,913.00** | (N−300) × $0.29 |
| **Google Identity Platform, no free SMS** | $290.00 | $2,900.00 | $29,000.00 | N × $0.29 |
| **Twilio Programmable SMS (PS $0.4101)** | $410.10 | $4,101.00 | $41,010.00 | N × $0.4101 |
| **Twilio Verify ($0.05 + $0.4101)** | $460.10 | $4,601.00 | $46,010.00 | N × $0.4601 (successes only) |
| **D7 Networks (PS $0.29)** | $290.00 | $2,900.00 | $29,000.00 | N × $0.29 |
| **LabsMobile (€0.2750)** | €275.00 | €2,750.00 | €27,500.00 | N × €0.2750 |
| **WhatsApp auth via Messaggio (€0.0092)** | **€9.20** | **€92.00** | **€920.00** | N × €0.0092, BSP quote **[unverified]** |
| **Local Jawwal/HotSMS** | **quote only** | **quote only** | **quote only** | no public price |
| **Email — Resend Free** | $0 | $0 | $0 (≤3k) | 3,000/mo, 100/day |
| **Email — SES Essentials** | $0.16 | $1.60 | $16.00 | $0.16/1,000 |
| **Push — Expo/FCM** | $0 | $0 | $0 | free |
| **Driver ID — Stripe Identity (one-time, 1k/10k drivers)** | $1,425 / $14,925 | — | — | $1.50 × N − 50 free |

**Illustrative all-in monthly at 10,000 OTPs (riders + drivers), SMS + email + push:**
- Firebase SMS + SES + Expo: **$2,813 + $1.60 + $0 = $2,814.60**
- Twilio Verify + SES + Expo: **$4,601 + $1.60 = $4,602.60**
- WhatsApp auth (if valid) + SMS fallback at 30% + SES + Expo: **€92 + (3,000 − 300 free) × $0.29 ($783) + $1.60 = €92 + $784.60 ≈ $877** (at an assumed 1:1 EUR/USD; FX must be applied).

### The free-tier cliff
- **Firebase phone auth:** 10 SMS/day free (≈300/month) — the only free OTP allowance; **3,000 SMS/day hard cap** on plain Firebase Auth, removed only by upgrading to Identity Platform. Crossing either is the cliff — [Firebase limits](https://firebase.google.com/docs/auth/limits).
- **Supabase:** 50,000 MAU free, but **zero free SMS** — the cliff is the first OTP, because Twilio bills from message one.
- **Clerk:** 50k users free, but SMS is **$0.01 US/Canada** and "market rate" international — the cliff is enabling Palestine.
- **Auth0:** 25,000 MAU free, **zero free SMS** (Twilio pass-through).
- **Cognito:** 10,000 MAU free, **zero free SMS** (SNS pass-through).
- **WhatsApp:** 1,000 free **service** messages/month per number — **not** authentication templates; auth is charged from message one.
- **Resend:** 3,000/month but **100/day** — the daily cap bites before the monthly one for a launch spike.
- **Brevo:** 300/day ≈ 9,000/month, no monthly rollover.

### Inferences
- The cost driver is 100% the SMS leg; auth vendor choice is second-order. Choosing Supabase/Clerk/Auth0 over Firebase changes the platform fee by $0–$25/month but the SMS bill by thousands.
- The **only way to make OTP cheap** is to (a) negotiate a local aggregator rate below $0.29, (b) shift most traffic to WhatsApp authentication, or (c) reduce OTP volume with silent verification (Ooredoo CAMARA Number Verification) and passkeys/social login.
- At 100k OTPs/month, SMS at Firebase's $0.29 costs **$28,913/month = $347k/year**. At that point a local interconnect deal is not optional; it is the business model.

### Gaps
- **Local aggregator price** is the missing number that determines whether the recommendation is $0.29 or $0.05 per OTP. Everything else is bounded.
- FX rate EUR→USD on 2026-10-29 was not captured; the WhatsApp/LabsMobile euro figures are quoted in EUR.

---

## 11. Recommendation: cheapest credible combination for riders and drivers, and what must be field-tested

### Takeaway
**No, Fastship/Wind cannot get Uber-quality registration and driver verification for free.** Identity can be free (Firebase 50k MAU, Supabase 50k MAU), but **phone OTP is never free beyond ~300 SMS/month**, and every credible SMS route to +970 costs **$0.29–$0.46 per message**. The cheapest credible stack is: **Firebase Auth for identity + a local Jawwal/HotSMS (or Ooredoo) SMS contract for OTP + WhatsApp authentication as the primary cheap channel with SMS fallback + Stripe Identity for driver ID + Resend/SES for email + Expo Push for notifications**, with **Ooredoo CAMARA Number Verification** for silent checks on Ooredoo data sessions. Keep app-owned OTP logic and a local aggregator; do not hand OTP delivery to a US CPaaS at $0.41.

### Cited Findings (basis for the recommendation)
- **[documented]** Firebase phone auth at **$0.29/SMS in PS**, 50k MAU free, phone-only accounts, RN via `react-native-firebase` — [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing); [Firebase Auth](https://firebase.google.com/docs/auth); [Expo auth guide](https://docs.expo.dev/develop/authentication).
- **[documented]** Twilio PS **$0.4101**, numeric sender ID unsupported, two-way SMS unsupported, long code overwritten — [Twilio PS pricing](https://www.twilio.com/en-us/sms/pricing/ps); [Twilio PS guidelines](https://www.twilio.com/en-us/guidelines/ps/sms).
- **[documented]** Local aggregator route exists (Jawwal Bulk/Application SMS with custom sender name; HotSMS certified Jawwal/Ooredoo provider with dedicated API) — [Jawwal](https://www.jawwal.ps/en/9663/9910/9917); [HotSMS](https://www.hotsms.ps/portal/hotsms/en).
- **[documented]** Ooredoo Palestine exposes CAMARA OTP, Number Verification and SIM Swap; Number Verification verifies without an SMS — [Ooredoo CAMARA OTP](https://developer.ooredoo.com/api/camara-otp); [Ooredoo verification use case](https://developer.ooredoo.com/use-cases/user-verification).
- **[documented]** WhatsApp auth templates are the cheapest template category; per-message since 2025-07-01; Palestine maps to "Other"; 1,000 free service messages/month — [Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [Meta auth templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates).
- **[unverified]** WhatsApp auth to Palestine at **€0.0092** — [Messaggio](https://messaggio.com/pricing-whatsapp/palestine); conflicts with Twilio's "not available for this region" hint — [Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing).
- **[documented]** Stripe Identity **$1.50/verification**, first 50 free — [Stripe Identity](https://stripe.com/identity).
- **[documented]** Email free tiers: Resend 3,000/100-day, Brevo 300/day, Postmark 100/mo, SES $0.16/1,000 — [Resend](https://resend.com/pricing); [Brevo](https://www.brevo.com/pricing/); [Postmark](https://postmarkapp.com/pricing); [SES](https://aws.amazon.com/ses/pricing/).
- **[documented]** Push free: FCM no-cost, Expo Push free, OneSignal free plan — [Firebase pricing](https://firebase.google.com/pricing); [Expo push](https://docs.expo.dev/push-notifications/overview/); [OneSignal](https://onesignal.com/pricing).

### Recommended architecture (cheapest credible)
1. **Identity:** Firebase Auth (phone + Google + Apple + email), 50k MAU free. Phone-only accounts for riders; drivers get phone + email. Add passkeys later only if you adopt Corbado/WebAuthn — Firebase has no native passkey SDK. **[documented]**
2. **OTP delivery:** app-owned OTP flow calling a **local aggregator** (Jawwal direct or HotSMS) with a registered alphanumeric sender ID; keep **Firebase phone auth / Twilio as a fallback route** if the local route degrades. Do not build the OTP logic into the aggregator — keep it in your backend so you can switch routes.
3. **Cheap primary channel:** **WhatsApp authentication template** with SMS fallback, only after confirming Meta approves auth templates for +970 and a BSP can deliver them. Budget ~€0.0092 vs $0.29 — a 30× saving worth the integration.
4. **Silent verification:** **Ooredoo CAMARA Number Verification** for users on Ooredoo mobile data; fall back to SMS OTP on Wi-Fi/Jawwal. This removes SMS cost for part of the base and improves UX.
5. **Driver verification:** **Stripe Identity** ($1.50) for ID + selfie/liveness; manual review for licence, vehicle registration and insurance; re-verify periodically. Persona/Onfido only if you need watchlist/AML.
6. **Email:** Resend Free (3k/mo) until you exceed it, then SES Essentials ($0.16/1k). Postmark only if deliverability becomes a problem.
7. **Push:** Expo Push (free) for all trip/status notifications; FCM direct if you need data-message control. Reserve SMS for OTP only.

### What must be field-tested on Jawwal / Paltel / Ooredoo before launch
- **Delivery:** send 50–100 OTPs per carrier (Jawwal, Ooredoo; Paltel is fixed-line, not mobile) to real handsets in Ramallah, Nablus, Hebron, Jenin and Gaza, at 2G/3G/4G, measuring **arrival rate, p50/p95 latency, and failure reasons**.
- **Sender ID:** confirm the registered alphanumeric sender displays as intended on Jawwal and Ooredoo handsets (Twilio warns long codes are rewritten to a generic alphanumeric ID) — [Twilio PS guidelines](https://www.twilio.com/en-us/guidelines/ps/sms).
- **DLR:** confirm the aggregator returns per-message delivery receipts and that they map to your OTP success metric; Twilio/aggregator DLR semantics differ.
- **Prefix coverage:** test **+970** and the **+97256 / +97259** Palestinian prefixes that Twilio says belong to Jawwal/Wataniya — [Twilio changelog](https://www.twilio.com/en-us/changelog/programmable-sms-geo-permissions-israel-and-palestine-prefix-update).
- **WhatsApp auth template:** submit an authentication template for `ar`/`en` with a copy-code button and confirm Meta approves it for Palestine; then measure delivery and completion vs SMS.
- **Firebase SMS region policy:** explicitly allow "Palestine" in the console; new projects default to **no regions** — [Firebase Android phone auth](https://firebase.google.com/docs/auth/android/phone-auth).
- **Play Integrity:** verify phone auth succeeds on low-end Android devices common in Palestine (Play Services present, no rooted/custom ROM) — [Firebase Android phone auth](https://firebase.google.com/docs/auth/android/phone-auth).
- **Ooredoo CAMARA:** confirm a Palestinian entity can onboard, sandbox limits, price per Number Verification/OTP, and coverage on Ooredoo vs roaming.
- **Stripe Identity document coverage:** test with real Palestinian ID, driver licence and vehicle registration; confirm acceptance and extraction accuracy before promising "Uber-quality" onboarding.
- **Push:** test delivery on Huawei/Xiaomi/Transsion devices with aggressive battery optimisation; Expo/FCM delivery is not guaranteed on OEM-killed background services.

### Inferences
- The **free-tier cliff** is not a MAU cliff; it is the **first SMS**. Fastship can run identity free forever at 50k MAU, but the moment it sends OTPs it pays. Budget **$0.29/OTP** as the planning number until a local contract proves lower.
- A local aggregator at even **$0.10/SMS** would cut the 100k/month bill from **$28,913 to $10,000** — a **65%** reduction — which is why the Jawwal/HotSMS quote is the highest-value action in this research.
- WhatsApp at €0.0092 is the only lever that changes the order of magnitude; it deserves a two-week spike before committing to any SMS contract volume.

### Gaps
- **No field test was performed**; every deliverability statement is provider documentation. The recommendation is conditional on the tests above.
- **No local price** from Jawwal/Paltel/Ooredoo/HotSMS; the entire "cheapest" claim is bounded by that missing quote.
- **No confirmation** that WhatsApp authentication templates are approved for +970; the BSP and Twilio signals conflict.
- **No confirmation** of Stripe Identity's Palestinian document support.
- **No legal review** of Palestinian SMS/OTP consent, sender-ID registration, or data-protection obligations; the regulator (PTRA vs MTDE) is itself disputed in secondary sources.
