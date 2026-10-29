# Microsoft Entra External ID (CIAM) + Azure Communication Services as the auth/messaging stack for a +970 ride-hailing app

All sources accessed **2026-10-29**. Evidence labels: **[D]** = documented by Microsoft (quote/paraphrase with doc date), **[O]** = observed by me today (what the page/API actually returned), **[U]** = unverified, needs a real tenant/number test. No tenant was provisioned and no SMS was sent for this note — every deliverability claim below is documentary, not measured.

---

## Q1. What authentication methods do Entra External ID *customer* (external) tenants actually support in Oct 2026 — email/password, email OTP, phone SMS OTP, Google/Facebook/Apple, passkeys?

### Takeaway
External tenants support exactly two local first factors — **email + password** and **email + OTP** — plus social/OIDC/SAML federation. **SMS exists only as a paid second factor (MFA/SSPR), never as a first factor**, so "phone-first signup" is not a product capability. Passkeys are GA-ish in external tenants but only for email/username+password local accounts, and cannot be *required* by policy.

### Cited Findings
- **[D]** Local account options in an external tenant are email+password and email one-time passcode; social IdPs are Facebook, Google, Apple; plus Entra ID federation, custom OIDC, custom SAML/WS-Fed. Doc `ms.date` 2026-03-27, page updated 2026-06-17 — [Identity providers for external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers).
- **[D]** "Federated identity providers (Facebook, Google, Apple, Microsoft Entra ID, and custom OIDC or SAML/WS-Fed providers) are available only with **browser-delegated authentication**. **Native authentication** supports local account methods only—email with one-time passcode (OTP) and email with password." — same page.
- **[D]** MFA second factors in external tenants: email OTP, SMS (add-on, extra cost), passkey (FIDO2). Doc `ms.date` 2026-05-21 — [MFA in external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-multifactor-authentication-customers).
- **[D]** Direct quote: "SMS is available at an additional cost for second-factor verification and for self-service password reset in external tenants. **It isn't currently supported for first-factor authentication.**" — same MFA page.
- **[D]** Second-factor availability is conditional on the first factor: email+password → email OTP / SMS / passkey; **external IdP users → email OTP or SMS only, no passkey**; **email-OTP users → SMS only, no passkey, and email OTP cannot be reused as the second factor** — same page.
- **[D]** Passkeys: usable as passwordless first factor or as MFA; **"Only email + password and username + password local account users can register a passkey"**, registration **requires a custom URL domain** (the domain is the WebAuthn relying party) and **MFA completed within the last five minutes**. Doc `ms.date` 2026-10-06 — [Sign in with passkeys in External ID](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey).
- **[D]** Hard limits on passkeys in external tenants (same page, FAQ): **no Conditional Access authentication strengths** ("You can't enforce phishing-resistant MFA through a Conditional Access policy"); **no passkeys for email-OTP or social/federated users** ("Not yet"); **no passkeys in native authentication** ("Passkeys aren't currently supported through native authentication APIs"); **no embedded webviews** (WebView/WKWebView have limited or no WebAuthn support — use system browser); **no related origins** (one passkey = one domain); **no Microsoft Authenticator as passkey provider**; **no out-of-box registration UX** (build it with Graph FIDO2 provisioning APIs).
- **[D]** Feature comparison table for browser-delegated vs native auth marks SMS OTP MFA, social IdP and SSO as available in both, with footnotes: social sign-in "still uses a browser window" even in native auth, and **native auth has no cross-app SSO through system browsers** (SSO only for embedded web views). Doc `ms.date` 2026-04-16 — [Choose an authentication approach](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-choose-authentication-approach).
- **[D]** Supported frameworks list for native auth is **Android (Kotlin/Java), iOS/macOS (Swift/Obj-C), Web (JS/React/Angular)** — **React Native is not listed**; other platforms must use the raw native-auth API. Browser-delegated list also omits React Native (it lists ASP.NET Core, Android, iOS, JS/React/Angular, Node, Python, Java) — same page.
- **[D]** SMS/voice retirement in **workforce** Entra ID (passkeys by default from 2026-09-01; Microsoft-provided SMS/voice retired 2027-02-01, 2027-07-01 for admins/external users) explicitly **excludes** External ID for now: "For Microsoft Entra External ID, this change comes next year, and a separate announcement will follow." Doc `ms.date` 2026-10-20 — [FAQ for Microsoft-provided SMS and voice retirement](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-sms-voice-retirement-faq).

### Inferences
- If the product promise is "enter your phone number, get a code, you're in", Entra External ID cannot be the system of record for that step. Either (a) the app/BFF owns phone verification and Entra holds a linked account, or (b) a custom OIDC IdP that does phone-OTP is federated into the tenant (supported), accepting that those users then **cannot use passkeys** and cannot use native auth for the social/federated leg.
- The "passkey" checkbox is real but narrow: email+password users only, needs a custom domain, needs a bespoke credential-management screen, and cannot be mandated. For a driver workforce you cannot say "passkeys required".
- The workforce SMS retirement is a warning shot: Microsoft is actively pushing telephony out of its own identity stack. Betting a phone-first product on Microsoft-provided SMS MFA is a medium-term platform risk even though External ID is currently carved out.

### Gaps
- No Microsoft doc found that states a roadmap date for phone-as-first-factor in external tenants. **[U]**
- Did not verify whether native auth (raw API) can be driven from React Native/Expo; vendor docs list no RN support. **[U]** — see Q6 test plan.
- Whether external-tenant SMS MFA survives the workforce telephony retirement announcement beyond "separate announcement will follow" is unknown. **[U]**

---

## Q2. Can the phone number be the primary identifier (signup + sign-in)? What custom policy/user-flow work is needed, and what are the constraints?

### Takeaway
No. There is no phone-only local account, no phone-as-username, and no user-flow setting that makes a mobile number the sign-in name. The maximum Microsoft gives you is: phone captured as an MFA/SSPR method on an account whose identifier is an email (or, in preview, a username/alias). Phone-first UX therefore requires the app/BFF to own the identifier and map phone → Entra account.

### Cited Findings
- **[D]** The only local-account identifiers documented are **email** and, in preview, a **username/alias** ("customer ID, membership ID, insurance number, frequent flyer number or anything similar") which still requires a password — [Identity providers for external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers) (doc 2026-03-27).
- **[D]** Username/alias sign-in is explicitly scoped to "users who sign in with a local account (**email and password**)" and pairs with a password prompt, not an OTP — same page, "Username or alias sign-in (preview)".
- **[D]** When SMS MFA is enabled: "users sign in with their primary method and are prompted to verify their identity with a code sent via text. **They enter their phone number** and receive an SMS with the verification code." — i.e. the phone is enrolled at the MFA step, not used to look up the account — [MFA in external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-multifactor-authentication-customers).
- **[D]** Phone numbers are not usable as a second factor for email-OTP users *except* SMS — meaning an email-OTP-first product can bolt SMS on, but then must pay per SMS and depend on telephony opt-in (Q4) — same page.
- **[D]** No "custom policy" engine exists in external tenants comparable to B2C Identity Experience Framework custom policies in these docs; the extension points documented are **custom claims providers**, **custom authentication extensions** (max 100 per tenant, 2,000 ms timeout, 1 retry, 50 rps combined) and **event listener policies** (max 249) — [Service limits and restrictions](https://learn.microsoft.com/en-us/entra/external-id/customers/reference-service-limits) (doc 2025-07-07, updated 2026-06-23).
- **[D]** Configuration APIs are Microsoft Graph: `List availableProviderTypes`, `List identityProviders`, `Create identityProvider` — [Identity providers for external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers).
- **[D]** Regional opt-in for SMS is controlled per-application via a Graph **event listener** (`onPhoneMethodLoadStartExternalUsersAuthHandler`, `includeAdditionalRegions` / `excludeRegions`) — this is the *only* documented "policy" lever over phone auth, and it is a country-code allowlist, not an identity model — [Regional opt-in for MFA telephony verification (preview)](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-region-code-opt-in) (doc 2026-04-17).

### Inferences
- A workable Uber-style shape with Entra as the IdP: account identifier = synthetic per-user email (e.g. `u_<id>@users.example.ps`) or phone-derived alias, phone verified by the app/BFF or a federated phone-OTP IdP, Entra used for token issuance, social federation, passkeys and admin/driver MFA. This keeps the BFF token-validation code intact (same issuer/JWKS) but moves the "phone is the login" semantics into your own service.
- Do **not** plan on using the Entra user's `phoneNumber`/mobile phone attribute as a login key: no doc supports sign-in by it, and using it as a de-facto identifier means duplicate accounts when a number is recycled by the carrier.
- Custom authentication extensions are too slow/limited (2 s timeout, 50 rps tenant-wide) to be the primary phone-verification path for a consumer funnel.

### Gaps
- No official statement found on whether phone number can ever be a *unique* attribute constraint at signup in external tenants (duplicate-account prevention). **[U]**
- Account linking between a social identity and an existing local/phone account: no External ID doc surfaced in searches that describes built-in linking/merge; the identity-providers page describes only "a user object is created for them in your directory" at first social sign-in. Treat automatic linking as **unsupported/unverified** until tested. **[U]**
- Preview status of username/alias for a production consumer app: preview terms apply; GA date not found. **[U]**

---

## Q3. 2026 pricing: MAU tiers, premium features, free tier, what counts as an MAU

### Takeaway
The only hard number Microsoft publishes in machine-readable text is the **50,000 MAU free tier** on the Basic SKU; per-MAU and per-SMS dollar rates are rendered client-side on the pricing page and the Azure Retail Prices API returns nothing for this service. SMS is a separate per-transaction add-on tiered by *destination* country, and **Palestine sits in the most expensive tier**.

### Cited Findings
- **[D]** "The Microsoft Entra External ID Basic tier includes the first **50,000 Monthly Active Users (MAU)** at no cost"; Basic table row: "0-50,000 MAUs - Free / More than 50,000 MAUs - $-/Monthly Active Users" (the dollar cell is a placeholder in the fetched HTML) — [Microsoft Entra External ID pricing](https://www.microsoft.com/en-us/security/pricing/microsoft-entra-external-id) (accessed 2026-10-29).
- **[O]** That page renders prices client-side: the fetched markdown contains `$-` placeholders for Basic MAU, ID Governance MAU and GSA, and the footnote "Prices are estimates only and are not intended as actual price quotes". A headless fetch cannot recover the numbers.
- **[O]** Azure Retail Prices API returned **zero items** for `serviceName eq 'Microsoft Entra External ID'` and for `contains(meterName,'MAU')`, and HTTP **429** on three other filter shapes — [Azure Retail Prices API](https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20%27Microsoft%20Entra%20External%20ID%27). Conclusion: External ID is **not** exposed as a retail meter; do not plan cost models off the retail API.
- **[D]** MAU definition: "the count of unique external users who authenticate to your tenants within a calendar month… we combine MAUs from all workforce and external tenants that are linked to a subscription." In an external tenant, **all** users count, "regardless of their `UserType`" — including admins with directory roles — [External ID Pricing](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing) (doc 2026-06-22).
- **[D]** Premium add-ons and their billing models: **M2M Authentication** (transaction-based), **SMS Phone Authentication** (transaction-based, "text only; voice isn't supported"), **Go-Local** (MAU-based; **"Currently available only in Australia and Japan"**), ID Governance (workforce only), GSA for Guests (workforce only) — same page.
- **[D]** SMS is billed as **one transaction per SMS phone verification attempt**, across **four country meters** ("One transaction equals one SMS phone verification attempt") — [Entra External ID pricing page](https://www.microsoft.com/en-us/security/pricing/microsoft-entra-external-id).
- **[D]** Tier placement: **"Palestinian National Authority"** appears in the **"Phone Authentication High Cost"** bucket — the most expensive of the four (Low / Mid Low / Mid High / High). Israel, Jordan, Egypt, Lebanon, Iraq, Saudi Arabia, UAE are also in Mid-High or High buckets — [MFA in external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-multifactor-authentication-customers) (doc 2026-05-21).
- **[D]** SMS requires a linked subscription; **"If your subscription expires or is canceled, end users will no longer be able to authenticate using SMS"** — i.e. an MFA-policy'd population can be locked out by a billing failure — same page.
- **[D]** Passkeys are **free** in all tiers: "Passkeys are included in all Microsoft Entra External ID pricing tiers at no additional cost, unlike SMS-based MFA which requires a linked subscription" — [passkeys how-to](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey) (2026-10-06).
- **[D]** Data residency: Go-Local covers only Australia and Japan, so **there is no documented Middle-East/EU-adjacent residency option for Palestinian user data** in External ID — [External ID Pricing](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing).

### Inferences
- Cost shape for this app: identity is effectively free until 50k MAU; the real variable cost is **SMS MFA at the highest country tier**, paid per *attempt* (including failed/abandoned attempts and retries), plus Conditional Access-driven MFA on every sign-in if you enforce it. Enforcing SMS MFA on all riders is likely to dominate the identity bill; enforcing it only on drivers/admins keeps it small.
- Because SMS is per-attempt and Palestine is top-tier, "resend code" UX must be rate-limited in the app, not just by Microsoft's throttles (Q4).
- MAU counts admins too — a 30-person ops team is noise at 50k, but it means you cannot treat admin accounts as free.

### Gaps
- **Exact USD per-MAU rate above 50k and exact per-SMS rates for the Palestine meter are not published in any machine-readable form I could retrieve.** Do not quote a number without pulling the interactive pricing page in a browser or asking a Microsoft account team. **[U]**
- Whether MFA-via-SMS transactions are billed when the SMS is blocked by CAPTCHA/throttling or fails at the carrier is not documented. **[U]**
- No doc found on whether the 50k free MAU is per-subscription (aggregated across tenants) or per-tenant in practice; the pricing FAQ links to an MAU definition doc I could not retrieve. **[U]**

---

## Q4. ACS SMS and Email for +970: country availability, sender ID rules, delivery reports, throughput, price, filtering; WhatsApp availability; email custom-domain requirements

### Takeaway
**ACS direct SMS cannot send to Palestine at all** — the supported-destination matrix has no Palestinian entry and senders are country-scoped. The only Microsoft-blessed path to +970 is **Messaging Connect (public preview) with Infobip**, where Infobip, not Microsoft, owns coverage, sender identity, price and deliverability. ACS Email is fine (managed subdomain or your own domain with SPF/DKIM). ACS WhatsApp claims worldwide reach but routes through Meta's WhatsApp Business Platform.

### Cited Findings
- **[D]** ACS sender types: toll-free, short code, 10DLC, mobile numbers, dynamic/preregistered alphanumeric sender ID; throughput per type is 200 msg/min (long code/mobile/toll-free), 600/min (alphanumeric), 6000/min (short code), "can be increased upon request" — [SMS overview](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/concepts) (doc 2025-04-10, updated 2026-09-23).
- **[D]** **Sender geographic scope**: "SMS senders are **country/region-scoped**… Cross-country/region SMS delivery using a single sender is not supported." — same page.
- **[D]** The "Sender Type Availability by Country/Region" table lists only: US, Canada, Puerto Rico, UK, Australia, Austria, Germany, France, Italy, Ireland, Finland, Denmark, Netherlands, Sweden, Poland, Belgium, Latvia, Estonia, Lithuania, Portugal, Spain, Switzerland, Czech Republic, Norway, Slovakia, Slovenia. **No Palestine, no Israel, no MENA country at all** — same page.
- **[D]** Prices are quoted only for those destinations (e.g. alphanumeric: Germany $0.0895, France $0.076, Italy $0.0833, UK $0.04; mobile numbers: Netherlands $0.092, Belgium $0.105) — **no rate exists for +970** because no destination offer exists — [SMS pricing](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms-pricing) (doc 2025-04-10, updated 2026-09-23).
- **[D]** **Messaging Connect** is the escape hatch: "Global reach across 190+ countries", preview, **partner = Infobip** ("more partners coming soon"); long codes and dynamic alphanumeric IDs supported, short codes not yet; delivery reports via Event Grid; **"The Messaging Connect partner determines country availability"** — [Messaging Connect overview](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/messaging-connect) (doc 2025-07-15, updated 2026-09-23).
- **[D]** Messaging Connect commercial model: **"Azure charges a $0.0025 platform fee for each SMS send request submitted—regardless of whether the message is ultimately delivered by the partner. Microsoft doesn't charge for delivery."** Partner bills number lease + per-message delivery separately (Infobip pay-as-you-go); optional Azure Marketplace consolidated billing — same page.
- **[D]** Messaging Connect requires a `messagingConnect` object with the **partner API key** in every send; missing/mismatched → 400/401; downstream carrier rejections arrive asynchronously as delivery reports — same page.
- **[D]** Preview caveat: "Preview APIs and SDKs are provided without a service-level agreement. We recommend that you don't use them for production workloads." — same page.
- **[D]** ACS Email: two domain types — **Azure managed domain** (one-click, `donotreply@<guid>.azurecomm.net`, preconfigured auth) and **custom domain** (you must prove ownership and publish **SPF** and **DKIM** DNS records); each Communication Service resource links to exactly one verified Email domain, and switching means disconnect/reconnect — [Email domains and sender authentication](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email/email-domain-and-sender-authentication) (doc 2023-03-31, updated 2026-09-23).
- **[D]** ACS WhatsApp: send/receive via the ACS Messaging SDK; connect new or existing WhatsApp Business Accounts; "Participate in conversations with WhatsApp users **world-wide**"; template-based business-initiated messages; delivery reports for sent/delivered/read — [Advanced Messaging for WhatsApp overview](https://learn.microsoft.com/en-us/azure/communication-services/concepts/advanced-messaging/whatsapp/whatsapp-overview) (doc 2024-02-12, updated 2026-09-23).
- **[D]** WhatsApp breaking change live now: usernames + **BSUID**; "BSUIDs begin appearing in webhook payloads and will be supported as recipient identifiers in send requests starting in June 2026"; **`from`/`to` may be empty** when a user hides their phone number → must use `fromBSUID`/`toBSUID` — same page. This directly breaks "phone number is the identity" assumptions for WhatsApp notifications.
- **[D]** Microsoft is warning that "Azure Communication Services is introducing breaking changes, and some services are being retired" on every ACS SMS/WhatsApp page (banner linking `aka.ms/acs-retirement-and-breaking-changes-guide`). **[O]** I did not open that guide, so the specific ACS retirements affecting SMS/WhatsApp in 2027 are unknown.

### Inferences
- For +970 the realistic Microsoft stack is: **ACS Email (GA) for receipts/receipts-like mail + Messaging Connect/Infobip (preview) for SMS OTP and trip notifications**, with a second SMS vendor as failover. Anything else is a claim you cannot support with Microsoft documentation today.
- Because Messaging Connect charges $0.0025 per *submitted* request whether or not it delivers, a carrier-filtering problem in Palestine costs money per failure. Budget for retries as a cost line, not an edge case.
- WhatsApp as an OTP channel is attractive in Palestine (high WhatsApp penetration) but the BSUID change means you cannot key notification recipients on phone number alone going forward; and Meta template approval + per-conversation pricing sit outside Microsoft's price sheet.
- Alphanumeric sender ID is the realistic sender type for +970 (no local long code offer from Microsoft); that means **one-way SMS** only — no inbound "STOP" handling through ACS for that sender, which shifts opt-out compliance to you.

### Gaps
- **No Microsoft document states that +970 is supported by Messaging Connect/Infobip.** Coverage is delegated to Infobip's own coverage page, which I did not verify for Palestine. **[U]**
- No documented per-message price for Palestine from either Microsoft or (in the pages reviewed) Infobip. **[U]**
- No documented sender-ID registration requirement, throughput, or carrier-filtering behaviour for Palestinian carriers (Jawwal/Paltel/Ooredoo). **[U]**
- Whether ACS WhatsApp is contractually available to a Palestinian entity (Meta WABA verification country list) is not addressed in Microsoft docs. **[U]**
- ACS retirement/breaking-changes guide not read; may affect SMS long codes or WhatsApp in the planning horizon. **[U]**

---

## Q5. Uber-style requirements: driver identity/vehicle verification, admin MFA/step-up, session revocation, device trust, ATO resistance — which are product features vs IdP features?

### Takeaway
Entra gives you authentication, MFA policy, Conditional Access and passkeys. It does **not** give you driver identity verification, vehicle documents, device binding you control, or a "sign out this phone" primitive you can call from your own admin tooling without Graph work. Roughly: identity proofing and device trust are **your product**, session/token control is **shared**, MFA/step-up policy is **the IdP's**.

### Cited Findings
- **[D]** Admin/step-up: external tenants support Conditional Access policies (target users/groups, all or specific apps, grant = require MFA) and **authentication context** for in-app step-up ("high-value transactions or viewing personal information") — [MFA in external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-multifactor-authentication-customers) (2026-05-21).
- **[D]** But step-up cannot demand *phishing-resistant* auth: "External ID tenants don't currently support authentication strengths in Conditional Access. You can't enforce phishing-resistant MFA through a Conditional Access policy." — [passkeys how-to](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey) (2026-10-06).
- **[D]** Anti-abuse built into SMS MFA: telephony throttling + **CAPTCHA** ("If a risky user is detected, we block the user from signing in or ask the user to complete a CAPTCHA before sending an SMS verification code") — [MFA in external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-multifactor-authentication-customers).
- **[D]** Rate limits that bound brute-force resistance and burst onboarding: **20 requests/second per IP per tenant**, **200/second per tenant**, 20/second on trial tenants; a sign-in consumes 4 dynamic-endpoint requests, sign-up 6, so a single sign-in flow tops out around 50 sign-ins/sec tenant-wide — [Service limits and restrictions](https://learn.microsoft.com/en-us/entra/external-id/customers/reference-service-limits) (updated 2026-06-23).
- **[D]** Telephony throttles per phone number: **15 texts / 15 min, 20 / 60 min, 30 / 24 h, 50 / 7 days**; per IP 100 / 15 min, 300 / 60 min, 500 / 24 h; per tenant 500 / 15 min, 1,500 / 60 min, 5,000 / 24 h — same page.
- **[D]** Passkey lifecycle is admin-mediated: admins can delete a lost passkey via admin center or Graph API; there is **no admin-on-behalf-of registration** — [passkeys how-to](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey).
- **[D]** No mention anywhere in the External ID pages reviewed of device trust, device compliance, managed devices, or named-location policy for external tenants. Conditional Access in external tenants is documented only for the MFA grant in these pages. **[U]** for anything beyond MFA.

### Inferences
- Mapping for this app:
  - **Your product / your BFF**: driver licence + vehicle registration + insurance verification, selfie/liveness, vehicle-plate OCR, "is this the same device as last trip" heuristics, risk scoring, step-up *decisions* (which action needs re-auth), fraud rules, and the actual session cookie/refresh-token lifecycle you expose to the app.
  - **Entra**: credential storage, MFA challenge execution, social federation, passkey ceremonies, token issuance/signature, Conditional Access policy evaluation for MFA, CA auth-context claims for step-up.
  - **Shared / needs design**: session revocation (Graph `revokeSignInSessions` is the Entra-side lever; your BFF must also invalidate its own refresh tokens and push a "signed out" event to the device), device trust (nothing in Entra for consumers), ATO resistance (Entra throttles + CAPTCHA; you own velocity rules on phone/email/device).
- The 20 rps **per IP** limit is a real Palestine-specific risk: mobile carriers heavily CGNAT, so a morning peak behind one carrier NAT could throttle sign-ins for many users at once. This deserves load testing with a real carrier, not a lab.
- "Admin MFA" is cheap to do properly (CA policy + passkey for the ~30 ops accounts, which are email+password local accounts → eligible for passkeys). "Driver MFA" is where the SMS cost and the CAPTCHA/friction land.

### Gaps
- No source found confirming `revokeSignInSessions` behaviour and token-invalidation latency **in external tenants** specifically. **[U]** — must be tested (see Q7).
- Conditional Access in external tenants beyond MFA (sign-in risk, location, device filters, block rules) — not confirmed in the pages reviewed. **[U]**
- Entra ID Protection / "risky user" signals availability in external tenants — not addressed in any page I read. **[U]**
- Vehicle/driver verification: Microsoft has separate products (Entra Verified ID, Azure AI Vision) but I did not research them; assume out of scope for this note. **[U]**

---

## Q6. Integration reality: Expo/React Native + system browser + PKCE, BFF token exchange, custom domain branding, tenant limits, what can't be configured via Bicep

### Takeaway
The supported path for an Expo app is **browser-delegated auth in the system browser with PKCE**, app registered as a public client, BFF validating tokens against the tenant's issuer/JWKS. Custom domain branding is a hard prerequisite for passkeys and is DNS-verified. Tenant and object counts have hard caps, and External ID configuration is a **Microsoft Graph** surface — no Bicep/ARM resource for user flows, IdPs or auth methods was documented in anything I read.

### Cited Findings
- **[D]** Browser-delegated auth = redirect to Microsoft-hosted page in **system browser or embedded web view**, app receives tokens; "requires minimal code and offers built-in branding customization". Microsoft states it is "the more secure option" because "Microsoft manages the sign-in surface" — [Choose an authentication approach](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-choose-authentication-approach) (2026-04-16).
- **[D]** Passkeys **do not work in embedded webviews** — "Use system browsers or the device's default browser" — [passkeys how-to](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey) (2026-10-06).
- **[D]** Passkey relying party = the tenant's **custom URL domain**, configured before passkeys; registration happens against that domain and **related origins are not supported** (one domain per passkey) — same page.
- **[D]** Native auth (in-app UI, MSAL) supports only Android/iOS/Web in the documented framework list; social sign-in still opens a browser window; no cross-app SSO via system browser. Microsoft explicitly warns native auth shifts security responsibility to your team ("Your team must follow security best practices for handling user credentials") — [Choose an authentication approach](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-choose-authentication-approach).
- **[D]** Configuration caps: **20 external tenants per subscription**; 300,000 objects per tenant (10,000 in a trial tenant, "can't be extended"); 100 custom attributes/user; 100 redirect URLs/app; **1 sign-out URL/app**; 250 chars/attribute; 100 custom auth extensions; 249 event listener policies — [Service limits and restrictions](https://learn.microsoft.com/en-us/entra/external-id/customers/reference-service-limits) (updated 2026-06-23).
- **[D]** Throughput caps: 200 req/s per tenant, 20 req/s per IP, 20 req/s on trial tenants — same page.
- **[D]** An external tenant **cannot own a subscription** and must be linked to one owned by a workforce tenant; moving it to a subscription in a *different* workforce tenant "isn't currently supported" — [External ID Pricing](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing) (2026-06-22).
- **[D]** Directory capability tiers: "standard mode" supports advanced queries/delta/SCIM up to 15M objects; **HSC mode** drops filtering/sorting/count/search, delta queries and SCIM entirely — relevant if the tenant ever scales past standard-mode limits — [Service limits and restrictions](https://learn.microsoft.com/en-us/entra/external-id/customers/reference-service-limits).
- **[D]** Sign-in method changes are **not retroactive**: "the change affects only new users. Existing users continue to sign in using their original method" — e.g. switching email+password → email OTP leaves existing users on passwords — [Identity providers for external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers).
- **[D]** All tenant configuration surfaced in docs is Graph-based (`identityProviders`, `authenticationEventListeners`, `authenticationmethodspolicy`, FIDO2 provisioning APIs) — [Identity providers](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers), [regional opt-in](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-region-code-opt-in), [passkeys](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey).
- **[O]** None of the pages reviewed document an ARM/Bicep resource type for external tenant user flows, identity providers, or authentication methods; the only ARM-adjacent operation documented is *linking* a tenant to a subscription/resource group.

### Inferences
- For Expo: use `expo-web-browser`/`ASWebAuthenticationSession`/Custom Tabs (system browser, not `react-native-webview`), authorization code + PKCE, no client secret in the app, and a redirect URI that is either an https App/Universal Link or a custom scheme. Then the BFF does the code→token exchange and keeps refresh tokens server-side; the app holds only a short-lived BFF session. This preserves the existing "BFF verifies Entra tokens" design and adds refresh-token custody where it belongs.
- Because social sign-in always opens a browser even under native auth, there is no UX win from native auth for this app — only added security responsibility and lost SSO. Browser-delegated is the correct default.
- IaC: plan on Graph API scripting (Bicep-deployed Function/Container App that calls Graph, or a pipeline step with `az rest`/Graph SDK) for user flows, IdPs, auth methods, and the `onPhoneMethodLoadStart` region policy. Treat the tenant itself as a manual/one-time bootstrap.
- The 1-sign-out-URL and 100-redirect-URL caps are enough for one app + one BFF + dev/staging, but you must budget redirect URIs across environments rather than minting one per feature.

### Gaps
- **React Native/Expo is absent from Microsoft's supported-framework lists** for both browser-delegated and native auth. Browser-delegated + PKCE is standards-based and should work, but Microsoft does not document RN as supported. **[U]**
- BFF token-exchange specifics for External ID (whether OBO or a confidential-client code exchange is the documented pattern for a mobile+BFF topology) were not verified. **[U]**
- Whether custom URL domain requires the domain be in the same DNS zone as the app / any residency constraint for `.ps` domains — not verified. **[U]**
- No confirmation that `expo-auth-session`/`expo-web-browser` interoperates with the external-tenant authorize endpoint (PKCE + custom scheme) — **[U]**, see Q7.

---

## Q7. What must be field-tested with real Palestinian numbers and a real tenant before claiming it works — acceptance tests and failure cases

### Takeaway
Everything about +970 deliverability is currently unproven: Microsoft's own docs put Palestine in the top SMS price tier **and** on the default-blocked opt-in list, and ACS has no Palestinian destination at all. The test plan must therefore prove (a) that Entra will even send to +970 after the Graph opt-in, (b) that Jawwal/Paltel/Ooredoo deliver it, and (c) that the app's browser/PKCE/passkey flow survives real Android devices.

### Cited Findings
- **[D]** **+970 "Palestinian Authority" is on the list of country codes "deactivated by default for SMS verification"**; enabling requires the Graph `onPhoneMethodLoadStart` event policy with `includeAdditionalRegions` (feature in **preview**) — [Regional opt-in for MFA telephony verification (preview)](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-region-code-opt-in) (doc 2026-04-17).
- **[D]** When a country code is blocked, "customers trying to set up SMS verification… might encounter the message **'Try another verification method.'**" — this is the exact failure string to assert against — same page.
- **[D]** The opt-in mechanism is per-**application** (`includeApplications`), not tenant-wide, so a test on one app registration does not prove another app works — same page.
- **[D]** SMS MFA fails closed when the subscription lapses: "end users will no longer be able to authenticate using SMS, which could block them from signing in" — [MFA in external tenants](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-multifactor-authentication-customers).
- **[D]** CAPTCHA/risk blocking can pre-empt the SMS entirely: "we block the user from signing in or ask the user to complete a CAPTCHA before sending an SMS verification code" — same page. Expect this on new numbers and on VPN/CGNAT egress.
- **[D]** Per-number throttle ceilings (15/15 min, 30/24 h, 50/7 days) mean a single QA handset cannot be used to test more than a handful of flows per hour — [Service limits](https://learn.microsoft.com/en-us/entra/external-id/customers/reference-service-limits).
- **[D]** ACS direct SMS: no Palestinian destination offer exists; senders are country-scoped — [SMS overview](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/concepts).
- **[D]** Messaging Connect is preview with no SLA and requires per-message partner API keys; delivery failures arrive asynchronously as DLRs — [Messaging Connect](https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/messaging-connect).

### Inferences — concrete acceptance tests
Run these in a **non-trial** external tenant linked to a real subscription, with the `onPhoneMethodLoadStart` policy applied to the test app registration:

1. **Opt-in gate.** Send SMS MFA to a +970 number *before* adding `970` to `includeAdditionalRegions`. Expected: no SMS, UI shows "Try another verification method." This establishes the baseline and proves you are testing the right lever.
2. **Opt-in works.** Add `970`; repeat. Pass = SMS received on Jawwal within 30 s; record carrier, handset, message text, sender ID shown, and whether the code is 6 digits.
3. **Three carriers.** Repeat on Paltel and Ooredoo. Pass = 3/3 delivered. Any carrier failure is a launch blocker for phone auth in that region.
4. **Sender identity.** Record what the handset displays (short code? alphanumeric? foreign number?). If it shows a random international number, phishing-report and blocking rates will be high — treat as a UX failure even if delivery passes.
5. **Throttle + CAPTCHA.** Request 16 codes to one number in 15 min. Pass = clean throttling error, no charge-only failures, no silent success. Log the exact error surface for app copy.
6. **Recycled number / wrong holder.** Sign up with number A, then attempt signup with A again from a different device. Pass = deterministic behaviour (either "already registered" or step-up to the existing account), never two accounts silently sharing a phone.
7. **Account linking.** Sign up with email+password, then "Sign in with Google" using the same email. Observe: new user object or linked? Document actual behaviour — no doc predicts it (Q2 gap).
8. **Passkey ceremony on real devices.** Register a passkey on (a) Android 9+ Chrome, (b) iOS 16+ Safari, (c) a mid-range Android with no Google Play Services / no screen lock. Pass = a+c handled gracefully with a fallback path; b = success. Also test from inside the app's webview to confirm it fails (expected) and that the app never routes auth there.
9. **Custom domain.** Verify the custom URL domain resolves, certificate is valid, and the passkey is bound to it; then test a second domain — pass = registration refused (no related origins).
10. **BFF token validation.** Confirm issuer/`tid`/audience checks against the external tenant's discovery document; confirm a token from a *workforce* tenant is rejected. Then revoke a session in the admin center and measure how long the BFF keeps accepting the access token (expected: until expiry — document the number).
11. **Concurrency from one carrier IP.** Drive 30 concurrent sign-ins from a single mobile-carrier egress (CGNAT) and look for 429s against the 20 rps/IP cap.
12. **Email path.** ACS Email from a custom domain with SPF+DKIM; verify inbox placement at Gmail/Outlook/Jawwal mail, and that OTP mail isn't landing in spam in Arabic locale.
13. **WhatsApp (if pursued).** Meta template approval in Arabic, delivery to a +970 WhatsApp account, and BSUID presence in webhooks.

### Gaps
- No documented evidence that any Palestinian carrier delivers Entra SMS OTPs, at any price tier. Only the *pricing tier* and the *opt-in requirement* are documented — the two facts together are consistent with "supported but expensive and fraud-gated", not with "proven working". **[U]**
- No documented test of Infobip→+970 delivery via Messaging Connect. **[U]**
- Whether Entra SMS to +970 arrives with an alphanumeric sender or a foreign long code — undocumented, and the single biggest phishing-perception risk. **[U]**
- Cost per delivered OTP in Palestine (Entra meter) and per message (Infobip) — both unretrievable from published machine-readable sources today. **[U]**
