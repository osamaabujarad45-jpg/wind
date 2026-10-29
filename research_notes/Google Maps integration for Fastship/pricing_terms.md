# Google Maps Platform — pricing, quotas, licensing and terms for a Palestine-based ride-hailing/delivery product (as of October 2026)

**Method and labelling.** All sources were fetched on **2026-10-29**. Google's pricing and terms pages carry a visible "Last updated" date, quoted where relevant. Findings are labelled:

- **[documented]** — stated verbatim on a Google-owned page fetched for this note.
- **[observed]** — read off a Google table/page but requiring interpretation (e.g. a coverage glyph).
- **[unverified]** — plausible but not confirmed by a primary source I could fetch; treat as a question to close, not a fact.
- **[inference]** — my arithmetic or reasoning on top of documented facts.

Every bullet carries its URL and the access date. No price or quota in this note is invented; where a number is my arithmetic it is marked **[inference]** and the inputs are shown.

---

## 1. The 2026 pricing model: Essentials/Pro/Enterprise, monthly free caps, and the $200 credit

### Takeaway
Google Maps Platform in 2026 is pure pay-as-you-go per SKU, with a **per-SKU monthly free cap** replacing the old $200 monthly credit (removed 1 March 2025). Essentials SKUs get 10,000 free events/month, Pro 5,000, Enterprise 1,000, and Map Tiles 100,000. Mobile Maps SDK and Maps Embed are **unlimited free**; Static Maps is **not** — it is metered after 10,000.

### Cited Findings
- Pricing is per billable event per SKU, quoted as cost per 1,000 events (CPM) in USD; volume tier is determined by aggregating usage **across all projects linked to the billing account** for the month — [Google Maps Platform core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (last updated 2026-10-28; acc. 2026-10-29).
- Three categories exist — Essentials, Pro, Enterprise — and "each ... includes free billable events per Core Service SKU each month" — [Pricing overview](https://developers.google.com/maps/billing-and-pricing/overview) (last updated 2026-10-28; acc. 2026-10-29).
- **The $200 credit is gone:** "As of March 1, 2025 ... Free usage caps replace monthly $200 credit" — [Pricing overview, "March 2025 changes"](https://developers.google.com/maps/billing-and-pricing/overview) (acc. 2026-10-29). The replacement mechanics are on [pay-as-you-go](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go) (last updated 2026-10-28; acc. 2026-10-29).
- New customers instead get a **$300 Google Cloud trial credit**, and Google now also sells three fixed subscriptions: Starter $100/mo (50,000 calls), Essentials $275/mo (100,000 calls), Pro $1,200/mo (250,000 calls) — [mapsplatform.google.com/pricing](https://mapsplatform.google.com/pricing/) (acc. 2026-10-29). Subscription calls are a single combined pool across included SKUs, not per-SKU — [Pricing overview, "Subscriptions"](https://developers.google.com/maps/billing-and-pricing/overview) (acc. 2026-10-29).
- Free-cap sizes by category, read from the price list's "Free Usage Cap" column — [pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29):
  - **Unlimited (no cost, no cap):** Maps SDK (Android/iOS), Embed, Street View Metadata, Autocomplete Session Usage, Place Details Essentials (IDs Only), Text Search Essentials (IDs Only).
  - **10,000/month:** Dynamic Maps, Static Maps, Static Street View, Compute Routes Essentials, Compute Route Matrix Essentials, Geocoding, Autocomplete Requests, Place Details Essentials, Time Zone, Geolocation.
  - **5,000/month:** Pro SKUs (Compute Routes Pro, Compute Route Matrix Pro, Place Details Pro, Text Search Pro, Nearby Search Pro, Aerial View, Elevation, etc.).
  - **1,000/month:** Enterprise SKUs (Compute Routes Enterprise, Compute Route Matrix Enterprise, Place Details Enterprise, Navigation Request, Address Validation Enterprise).
  - **100,000/month:** Map Tiles API 2D Map Tiles and Street View Tiles.
- **Static Maps is metered, not free-unlimited**: 10,000 free then $2.00 per 1,000 — [pricing list, "Maps – loads"](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29). Google's own cost guidance recommends Static Maps/thumbnails as the cheap path for non-interactive screens — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (last updated 2026-10-28; acc. 2026-10-29).
- Volume discounts are automatic and tiered, no action required; additional discretionary discounts require a signed order form (example qualification cited: 10,000,000+ monthly billable events under one paid core SKU) — [pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29).

### Inferences
- For a mobile-first dispatch product, **map rendering is effectively free** (Maps SDK unlimited). The bill is driven almost entirely by Routes, Geocoding and Places calls, not by "map sessions" — provided the app uses the native Maps SDK and not the Maps JavaScript API.
- The subscriptions are only attractive above roughly the volumes where their included calls beat pay-as-you-go at the same SKUs; at Fastship's early volumes the per-SKU free caps (10k/5k) cover a small pilot entirely. **[inference — no breakeven published]**

### Gaps
- No page states whether the 10,000/5,000/1,000 caps are "per SKU per project" or "per SKU per billing account"; the price list says usage is *aggregated* across projects for tiering, and the overview says each SKU provides free events per month, which implies one cap per billing account per SKU. Not stated explicitly.

---

## 2. Exact list prices for the SKUs Fastship would use

### Takeaway
Routes with traffic (`TRAFFIC_AWARE`) bills at the **Pro** rate of **$10.00/1,000** after 5,000 free — double the Essentials $5.00/1,000. Geocoding is $5.00/1,000 after 10,000. Autocomplete is $2.83/1,000 requests. Place Details ranges $5 → $17 → $20 depending on fields. Map Tiles 2D is the cheapest metered map surface at $0.60/1,000 after 100,000.

### Cited Findings
All from the [global price list](https://developers.google.com/maps/billing-and-pricing/pricing) (last updated 2026-10-28; acc. 2026-10-29), USD per 1,000 events, monthly tiers:

| SKU | Free cap | 0–100k | 100k–500k | 500k–1M | 1M–5M | 5M+ |
|---|---|---|---|---|---|---|
| Dynamic Maps (Maps JavaScript API map load) | 10,000 | $7.00 | $5.60 | $4.20 | $2.10 | $0.53 |
| Maps SDK (Android/iOS) | **Unlimited** | — | — | — | — | — |
| Embed | **Unlimited** | — | — | — | — | — |
| Static Maps | 10,000 | $2.00 | $1.60 | $1.20 | $0.60 | $0.15 |
| Map Tiles API: 2D Map Tiles | 100,000 | $0.60 | $0.48 | $0.36 | $0.18 | $0.045 |
| Routes: Compute Routes **Essentials** | 10,000 | $5.00 | $4.00 | $3.00 | $1.50 | $0.38 |
| Routes: Compute Routes **Pro** | 5,000 | $10.00 | $8.00 | $6.00 | $3.00 | $0.75 |
| Routes: Compute Route Matrix **Essentials** | 10,000 | $5.00 | $4.00 | $3.00 | $1.50 | $0.38 |
| Routes: Compute Route Matrix **Pro** | 5,000 | $10.00 | $8.00 | $6.00 | $3.00 | $0.75 |
| Routes: Compute Routes/Metas **Enterprise** | 1,000 | $15.00 | $12.00 | $9.00 | $4.50 | $1.14 |
| **Navigation Request** (Navigation SDK) | 1,000 | $25.00 | $20.00 | $15.00 | $8.00 | $2.00 |
| Geocoding | 10,000 | $5.00 | $4.00 | $3.00 | $1.50 | $0.38 |
| Places: Autocomplete Requests | 10,000 | $2.83 | $2.27 | $1.70 | $0.85 | $0.21 |
| Places: Autocomplete Session Usage | **Unlimited** | — | — | — | — | — |
| Places: Place Details Essentials | 10,000 | $5.00 | $4.00 | $3.00 | $1.50 | $0.38 |
| Places: Place Details Essentials (IDs Only) | **Unlimited** | — | — | — | — | — |
| Places: Place Details Pro | 5,000 | $17.00 | $13.60 | $10.20 | $5.10 | $1.28 |
| Places: Place Details Enterprise | 1,000 | $20.00 | $16.00 | $12.00 | $6.00 | $1.51 |
| Places: Text Search Pro | 5,000 | $32.00 | $25.60 | $19.20 | $9.60 | $2.40 |
| Places UI Kit Query | 10,000 | $1.00 | $0.80 | $0.60 | $0.30 | $0.08 |

- **Compute Route Matrix is billed per element**, where elements = origins × destinations; "if a request contains two origins and three destinations, then the request is billed for six elements" — [Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) (last updated 2026-10-28; acc. 2026-10-29).
- **Which Routes SKU you get is decided by the request's features**, not by intent: Essentials = basic features with ≤10 intermediate waypoints; **Pro = any advanced feature "such as the `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL` route modifiers"**; Enterprise = two-wheel or large-vehicle routing — [Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) (acc. 2026-10-29). Setting `departureTime` to now enables real-time traffic models and is billed at the higher rate — same page.
- Requesting traffic models **without** traffic is still billed higher: Google's own guidance says requests that include real-time traffic models are billed at a higher rate, and omitting them gives results based "solely on physical factors: roads, distance, and speed limits" — [Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) (acc. 2026-10-29).
- Autocomplete **sessions themselves are free** ($0 SKU, "Unlimited"); the money is in the per-request Autocomplete SKU and in any Place Details call you make afterwards — [pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29), and the equivalent note for the legacy model: "The Autocomplete request is free of charge, but subsequent Places Details calls are charged based on regular Places Details pricing" — same page, footnote 1.
- Mobile maps are free: "**Maps SDK** ... Unlimited" — [pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29).
- Legacy Directions and Distance Matrix still exist at $5.00/1,000 (10,000 free), with Advanced variants at $10.00/1,000 — [pricing list, "Routes APIs Legacy"](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29). Google now labels these Legacy and recommends migrating — [Pricing overview, subscription footnotes](https://developers.google.com/maps/billing-and-pricing/overview) (acc. 2026-10-29).

### Inferences
- A traffic-aware ETA costs **$0.01 per computeRoutes call** at the first tier, versus $0.005 for a traffic-blind call. At 600 route calls/driver/month that is $6 vs $3 per driver — small per driver, large at 10,000 drivers ($19,900 vs $9,950 for routes alone, see §7).
- If Fastship uses Place Details to resolve an autocomplete selection, budget **Autocomplete request + Place Details** per search, not just the $2.83. Using the "IDs Only" / Essentials field mask keeps this at $5.00/1,000 and stays inside the 10,000 free cap.

### Gaps
- I did not fetch the per-SKU "Usage details" page that enumerates every field mask and which fields push a request into Pro/Enterprise for Places and Routes. Exact field-level triggers beyond `TRAFFIC_AWARE*`, waypoint count, two-wheel and large-vehicle are **[unverified]**.

---

## 3. Free-tier mechanics: reset, pooling, and overage behaviour

### Takeaway
Free caps reset on the **1st of each month at midnight US Pacific**. They are per SKU, not a shared pool — an Essentials call does not consume a Pro cap. Exceeding a cap does **not** stop service: requests keep succeeding and are billed at the tier rate until you hit a quota you configured yourself.

### Cited Findings
- "This free usage resets on the first day of each month, at midnight Pacific US time" — [Pay-as-you-go](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go) (last updated 2026-10-28; acc. 2026-10-29); repeated in [Pricing overview](https://developers.google.com/maps/billing-and-pricing/overview) (acc. 2026-10-29).
- The free allowance is attached to each SKU individually ("each SKU provides free billable events every month, the quantity of which depends on the price category the SKU belongs to") — [Pricing overview](https://developers.google.com/maps/billing-and-pricing/overview) (acc. 2026-10-29); caps per SKU visible in the [price list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29).
- Tiering aggregates usage from **all projects on the billing account**, so splitting into more projects does not multiply tiers (but the free cap is per SKU per month, so splitting projects does not create extra free usage either, on the documented reading) — [pricing list intro](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29).
- Billing is monthly; there are no up-front fees or termination charges for pay-as-you-go — [Pay-as-you-go](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go) (acc. 2026-10-29).
- Overage = billed, not blocked. Google frames quotas as the only hard stop: "A quota sets the most your project can use an API, so it also sets the most you can be charged for that API"; when reached, "requests to that API fail for the rest of the day" — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (acc. 2026-10-29).
- Quota accounting: successful requests **and** 5xx responses count against quota; auth failures do not — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (acc. 2026-10-29).
- Daily quotas reset at midnight Pacific — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (acc. 2026-10-29).

### Inferences
- Free caps are a **billing** construct; quota is an **availability** construct. A startup that only reads the free caps and never lowers quotas has no hard ceiling — the first runaway loop is billed in full and only visible on the Cloud Billing dashboard (which Google says can lag up to 48 hours).
- Google's own rule of thumb for staying inside a free cap: divide the monthly cap by 31 and floor it, then set that as the daily quota on the quota that counts the billed unit — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (acc. 2026-10-29). For Compute Route Matrix the billed unit is **elements**, not requests, so the quota to lower is elements/day.

### Gaps
- Whether a 4xx (e.g. `INVALID_ARGUMENT`) is billable is not stated on the pages fetched; only 5xx is confirmed to count against quota. Billing treatment of failed requests is **[unverified]**.

---

## 4. Navigation SDK: price, licensing, and whether a small Palestinian startup can buy it

### Takeaway
Navigation SDK is an **Enterprise-category, metered** product: 1,000 free Navigation Requests/month, then **$25.00 per 1,000** at the first tier — roughly 2.5× a traffic-aware route call. Google publishes the price and a public sign-up button (no visible "contact sales only" gate), and the SDK does have driving-direction coverage for Palestine — but **no traffic layer, no speed limits and no real-time disruptions** there.

### Cited Findings
- Navigation SDK is listed under Routes as "Add custom Google Maps navigation into your mobile app", and is badged **Enterprise** on its product page with a normal "Create an account" CTA — [Navigation SDK product page](https://mapsplatform.google.com/maps-products/navigation-sdk/) (acc. 2026-10-29).
- The metered SKU is **"Navigation Request"**, Enterprise, free cap 1,000, then $25.00 / $20.00 / $15.00 / $8.00 / $2.00 per 1,000 across the tiers — [pricing list, "Navigation SDK"](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29).
- Setup requires only "a Google Cloud console project with the Navigation SDK enabled" plus an API key; no contractual precondition is stated — [Navigation SDK setup overview](https://developers.google.com/maps/documentation/navigation/android-sdk/setup-overview) (last updated 2026-10-20; acc. 2026-10-29), and [Set up the Navigation SDK](https://developers.google.com/maps/documentation/navigation/android-sdk/get-api-key) (acc. 2026-10-29).
- Licensing terms specific to Navigation SDK: content may be used **without a Google map**, must **not** be used with a non-Google map, and lat/lng may be cached at most **30 consecutive calendar days** — [Maps Platform Service Specific Terms §12](https://cloud.google.com/maps-platform/terms/maps-service-terms) (last modified 2026-10-28; acc. 2026-10-29).
- Navigation SDK **replaces** the Maps SDK: "You cannot use the Navigation SDK and Maps SDK in the same app" — [Navigation SDK overview](https://developers.google.com/maps/documentation/navigation/android-sdk/overview) (last updated 2026-10-20; acc. 2026-10-29).
- Device/build floors (v7.0.0+): target Android 16 / API 36, minimum Android 7 / API 24, Google Play services, ≥2 GB RAM, OpenGL ES 2.0 — [setup overview](https://developers.google.com/maps/documentation/navigation/android-sdk/setup-overview) (acc. 2026-10-29).
- **Palestine coverage for Navigation SDK** — Traffic Layer `—` (not available/low quality), Driving Directions `⬤` (good), Walking `⬤`, Two-Wheeled `—`, Biking `—`, Speed Limits `—`, Traffic Lights/Stop Signs `—`, Real-Time Disruptions `—` — [Navigation SDK country coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk) (last updated 2026-10-20; acc. 2026-10-29) **[observed from glyph table]**.
- There is also a **Navigation Connect** product (drivers navigate in Waze/Google Maps, you get trip telemetry), governed by its own Service Specific Terms: U.S.-person data restrictions, identity verification, and a prohibition on using the data "as a basis for adverse employment actions ... disciplinary action, performance reviews, or termination" — [Service Specific Terms §11](https://cloud.google.com/maps-platform/terms/maps-service-terms) (acc. 2026-10-29).

### Inferences
- Nothing in Google's public terms restricts Navigation SDK by country of the *customer*; the restriction is by *coverage of the data*. A Palestinian entity should be able to enable it, but **[unverified]** whether console enablement is instant or allowlisted — the docs are silent and I could not find a stated approval step.
- At $25/1,000, one navigation start per trip costs $0.025 — about **$7.50 per driver per month** at 10 trips/day, i.e. more than routes + geocoding + autocomplete combined at 100 drivers. For a cost-sensitive launch, handing off to the installed Google Maps app (free) is far cheaper than embedding Navigation SDK.
- Because Navigation SDK and Maps SDK cannot coexist, adopting Navigation SDK is a **one-way door** for the driver app: it forces a migration of the map layer and forfeits the free unlimited Maps SDK SKU for that app.

### Gaps
- No primary source states minimum contract value, minimum volume, or an approval process for Navigation SDK in 2026. Any "contract-only / minimum spend" claim would be **[unverified]**.
- Navigation SDK's billing trigger ("Navigation Request" = per navigation session start? per route request?) is not defined on the pricing page I fetched; the "Usage details" SKU page would settle it.

---

## 5. Contract terms that constrain a dispatch product

### Takeaway
The terms are stricter than the pricing. Google prohibits **caching almost everything** (lat/lng max 30 days; Google IDs may be cached indefinitely), prohibits **placing Google content on or near a non-Google map** (one exception: Places UI Kit), prohibits **building a real-time navigation experience out of Directions + Geolocation + Maps SDK**, and forbids shipping Google Maps in **vehicle-embedded** systems. Attribution may not be altered or hidden. End-user PII must not be sent to Google.

### Cited Findings
- **No caching by default:** "Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms" — [Google Maps Platform ToS §3.2.3(b)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **No scraping / no rehosting:** no pre-fetching, indexing, storing, resharing or rehosting content outside the services; no bulk download of tiles, geocodes, directions, distance-matrix results, places; no copying business names/addresses/reviews — [ToS §3.2.3(a)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **No creating content from Google content**, including tracing roads from satellite imagery, building 3D models, or using lat/lng from Places as input to point-in-polygon analysis; and no use of Google Maps Content to train/test/fine-tune ML or AI models — [ToS §3.2.3(c)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **No re-creating Google products.** Explicitly prohibited example: "combine data from the Directions API, Geolocation API, and Maps SDK for Android to create real-time navigation functionality substantially similar to the functionality provided by the Google Maps for Android mobile app" — [ToS §3.2.3(d)(iv)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **No use with non-Google maps:** "Customer will not use the Google Maps Core Services with or near a non-Google Map in a Customer Application", with examples: Places content on a non-Google map, Street View and non-Google maps on the same screen, linking a Google Map to non-Google map content — [ToS §3.2.3(e)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **One documented exception:** "Customer may use Places UI Kit in Customer Applications with or without any map, including a non-Google Map. This clause will prevail over the No Use with Non-Google Maps clause" — [Service Specific Terms §15.1](https://cloud.google.com/maps-platform/terms/maps-service-terms) (acc. 2026-10-29).
- **No embedded vehicle systems:** no app "embedded in an in-dashboard automotive infotainment system" that lets end users request directions — [ToS §3.2.3(f)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29). Limited exception for **Large Vehicle Routing** inside Routes API / Route Optimization, subject to Safety Requirements — [Service Specific Terms §18.5, §19.4](https://cloud.google.com/maps-platform/terms/maps-service-terms) (acc. 2026-10-29).
- **Attribution is mandatory and untouchable:** display all attribution Google provides (branding, logos, copyright/trademark notices) or that the Service Specific Terms specify; "will not modify, obscure, or delete such attribution" — [ToS §3.2.2(b)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29). Service Specific Terms restate: "Customer will attribute all the Services in accordance with the Documentation" — [§A.2](https://cloud.google.com/maps-platform/terms/maps-service-terms) (acc. 2026-10-29).
- **Caching that IS allowed** — [Service Specific Terms §A.3 and §6.3, §14.3, §19.3](https://cloud.google.com/maps-platform/terms/maps-service-terms) (acc. 2026-10-29):
  - Google **IDs** (e.g. `place_id` from Places/Directions/Geolocation/Routes, `pano_ID`, `video_ID`) may be cached indefinitely, per their documentation (§A.3).
  - **lat/lng** from Geocoding, Directions, Distance Matrix, Places, Routes, Roads, Geolocation, Route Optimization, Navigation SDK: max **30 consecutive calendar days**, then delete (§6.3.1, §14.3, §19.3, §12.3).
  - **Geocoding exception:** lat, lng, `formatted_address` and structured address components may be cached **indefinitely**, but *solely* to support the direct end-user-facing functionality of the app that made the request, not as a replacement for making further calls, and the cache must be logically isolated per end user and not shared across users (§6.3.2). Note this exception is written for the Geocoding API; Places/Routes get only the 30-day lat/lng allowance.
- **Privacy / data use:** Google collects search terms, IP addresses and lat/lng and may use and retain them to provide and improve Google products — [ToS §4.4(a)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29). Customer "will not provide to Google (1) any End User's personally identifiable information; or (2) any European End User's Personal Data" — [ToS §4.4(c)(ii)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29). Location privacy: notify users in advance of data collected and of combining location with other providers' data, and do not obtain or cache a user's location without express, prior, revocable consent — [ToS §4.4(c)(iii)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **App terms flow-down:** the app's ToS must tell users it includes Google Maps features and content and that use is subject to the Google Maps End User Additional Terms and Google Privacy Policy — [ToS §3.2.2(a)(i)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **Disclaimer:** "GOOGLE MAPS CORE SERVICES ARE PROVIDED FOR PLANNING PURPOSES ONLY. INFORMATION ... MAY DIFFER FROM ACTUAL CONDITIONS" — [ToS §13](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **Liability cap:** aggregate liability limited to the fees paid in the 12 months before the event, with carve-outs (IP infringement, payment obligations, breach of use restrictions) — [ToS §15.1(b), §15.2](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **Change/discontinuation notice:** 12 months' notice before discontinuing a service or making a backwards-incompatible API change (excluding pre-GA, legal/security/economic exceptions); 30 days for material agreement changes — [ToS §1.3(b),(c)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **Governing law:** California law, exclusive venue Santa Clara County, for non-government entities — [ToS §18.11(c)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).

### Inferences
- A dispatch product that stores "pickup pins" per rider is on solid ground **only** if it stores either the `place_id` or the rider's own geocoded address indefinitely under the Geocoding §6.3.2 exception, isolated per user. Building a shared table of West Bank addresses → coordinates reused across riders is **not** permitted beyond 30 days and is exactly the "index/rehost" pattern the ToS bans.
- Displaying Google Places results next to a Mapbox/OSM basemap is prohibited for Places API, but **permitted for Places UI Kit**. That is the only clean legal path to a mixed stack.
- Because content is "for planning purposes only" and liability is capped at 12 months of fees (small for a startup), a dispatch product should not treat Google ETAs as a contractual SLA to riders — the SLA covers uptime of the API, not accuracy of the ETA.

### Gaps
- The product-specific attribution docs (exact logo/wordmark placement, "Powered by Google" rules for Routes/Places) were not fetched; the ToS obligation is documented, the visual spec is **[unverified]** here.
- Whether a ride-hailing *dispatch/matching* use is itself restricted: I found no clause naming dispatch, ride-hailing or delivery as prohibited. The constraints bite through "no re-creating Google products", "no non-Google maps" and "no embedded vehicle systems" rather than a named ban. Absence of a named ban is **[observed absence]**, not a permission.

---

## 6. Billing controls, quotas and the production key setup Google recommends

### Takeaway
Budgets and budget alerts **do not cap spend**. The only hard ceiling is a lowered per-API daily quota, and Google explicitly says quotas are a backstop, not the main defence — key restrictions are. The documented production pattern is: separate projects for client vs server, a separate restricted key per app, Android/iOS app restrictions + API restrictions, and IP restrictions for web-service keys.

### Cited Findings
- "Setting a budget does *not* automatically cap Google Cloud or Google Maps Platform usage or spending" — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (last updated 2026-10-28; acc. 2026-10-29).
- Lowering a daily quota is the documented hard stop; requests fail for the rest of the day, resetting at midnight Pacific — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (acc. 2026-10-29).
- The Quotas page "is not a source of truth for billing"; use the Cloud Billing dashboard, which "may have up to 48 hours of latency" — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) (acc. 2026-10-29).
- "You are financially responsible for charges caused by abuse of unrestricted API keys" — [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs) and [Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29).
- Restrict every key with **one** application restriction type (websites / IP addresses / Android package+SHA-1 / iOS bundle ID) **plus** API restrictions; a key restricted to one platform cannot be used on another — [Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29).
- Use a **separate key per app** (up to 300 keys per project), delete unused keys, disable unused services at project level, and **split client-side and server-side usage into separate projects** so per-user quotas on the client project don't throttle server jobs — [Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29).
- Web-service keys are "not expected to be publicly exposed"; restrict them by IP, or put a proxy in front and never let clients relay arbitrary calls through it — [Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29).
- For direct mobile→REST calls, use a separate client key in secure storage plus `X-Android-Package`/`X-Android-Cert` or `X-Ios-Bundle-Identifier` headers and verify wrong identifiers are rejected — [Security guidance](https://developers.google.com/maps/api-security-best-practices) (acc. 2026-10-29).
- Routes API also has its own rate ceilings: 3,000 QPM for computeRoutes (max 25 intermediate waypoints), 3,000 EPM for computeRouteMatrix, max 50 origins/destinations by place ID or address, 625 elements/request (100 for `TRAFFIC_AWARE_OPTIMAL` or transit) — [Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) (acc. 2026-10-29).

### Inferences
- Minimum viable guardrails for Fastship: (1) mobile app key — Android/iOS app restriction + only Maps SDK/Routes/Places APIs; (2) server key — IP-restricted, used for geocoding and matrix; (3) a daily quota per SKU set to ~cap/31; (4) a budget alert at 50/90/100% purely as an alarm; (5) Cloud Billing → BigQuery export if they want next-day per-trip cost attribution **[inference from the docs above]**.
- Because the client project and server project bill to the same account, the free caps are consumed once, not twice — splitting does not buy extra free usage.

### Gaps
- No source found on whether Google Maps Platform honours a **project-level spend cap** (as opposed to budget alerts). Google Cloud has a "spend cap budget" feature for some products; whether it applies to Maps SKUs is **[unverified]** — [budgets/spend caps doc referenced in nav](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) (not fetched).

---

## 7. Cost model at 100 / 1,000 / 10,000 drivers

### Takeaway
On a mobile app, maps are free and the bill is Routes + Geocoding + Autocomplete: roughly **$650/month at 100 drivers, $6.2k at 1,000, $28k at 10,000** with traffic-aware routes. Switch to the Maps JavaScript API for the same "map sessions" and add **$560 / $4,550 / $15,490**. Adding Navigation SDK at one navigation per trip adds **$725 / $6,475 / $33,975**.

### Assumptions (all supplied by the brief; monthly = 30 days)
- 10 trips per driver per day → **300 trips/driver/month**.
- 3 map sessions per trip → 900/driver/month.
- 2 route calls per trip → 600/driver/month.
- 1 geocode per trip → 300/driver/month.
- 0.3 autocomplete per trip → 90/driver/month.
- Routes are traffic-aware, therefore **Pro** SKU ($10/1,000 after 5,000). Geocoding $5/1,000 after 10,000. Autocomplete $2.83/1,000 after 10,000. Maps SDK unlimited. Prices from [pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (acc. 2026-10-29). Arithmetic is **[inference]**.

### Volumes

| Drivers | Trips/mo | Map sessions/mo | Route calls/mo | Geocodes/mo | Autocomplete/mo |
|---|---|---|---|---|---|
| 100 | 30,000 | 90,000 | 60,000 | 30,000 | 9,000 |
| 1,000 | 300,000 | 900,000 | 600,000 | 300,000 | 90,000 |
| 10,000 | 3,000,000 | 9,000,000 | 6,000,000 | 3,000,000 | 900,000 |

### Cost, mobile SDK (map sessions free)

| Line | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---|---|---|
| Routes (Pro) | 5,000 free; 55,000 × $0.010 = **$550.00** | 5,000 free; 95,000 × $0.010 = $950; 400,000 × $0.008 = $3,200; 100,000 × $0.006 = $600 → **$4,750.00** | 5,000 free; 95,000 × $0.010 = $950; 400,000 × $0.008 = $3,200; 500,000 × $0.006 = $3,000; 4,000,000 × $0.003 = $12,000; 1,000,000 × $0.00075 = $750 → **$19,900.00** |
| Geocoding | 10,000 free; 20,000 × $0.005 = **$100.00** | 10,000 free; 90,000 × $0.005 = $450; 200,000 × $0.004 = $800 → **$1,250.00** | 10,000 free; 90,000 × $0.005 = $450; 400,000 × $0.004 = $1,600; 500,000 × $0.003 = $1,500; 2,000,000 × $0.0015 = $3,000 → **$6,550.00** |
| Autocomplete | 9,000 inside 10,000 free = **$0** | 10,000 free; 80,000 × $0.00283 = **$226.40** | 10,000 free; 90,000 × $0.00283 = $254.70; 400,000 × $0.00227 = $908; 400,000 × $0.0017 = $680 → **$1,842.70** |
| Maps (mobile SDK) | $0 | $0 | $0 |
| **Total/month** | **$650.00** | **$6,226.40** | **$28,292.70** |

### Cost, web map (Maps JavaScript API dynamic map loads, $7/1,000 after 10,000)

| Line | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---|---|---|
| Map loads (90k / 900k / 9M) | 80,000 × $0.007 = **$560.00** | 90,000 × $0.007 = $630; 400,000 × $0.0056 = $2,240; 400,000 × $0.0042 = $1,680 → **$4,550.00** | 90,000 × $0.007 = $630; 400,000 × $0.0056 = $2,240; 500,000 × $0.0042 = $2,100; 4,000,000 × $0.0021 = $8,400; 4,000,000 × $0.00053 = $2,120 → **$15,490.00** |
| **Total with routes+geo+autocomplete** | **$1,210.00** | **$10,776.40** | **$43,782.70** |

### Cost, mobile + Navigation SDK (1 Navigation Request per trip)

| Drivers | Navigation requests/mo | Cost |
|---|---|---|
| 100 | 30,000 | 1,000 free; 29,000 × $0.025 = **$725.00** |
| 1,000 | 300,000 | 1,000 free; 99,000 × $0.025 = $2,475; 200,000 × $0.020 = $4,000 → **$6,475.00** |
| 10,000 | 3,000,000 | 1,000 free; 99,000 × $0.025 = $2,475; 400,000 × $0.020 = $8,000; 500,000 × $0.015 = $7,500; 2,000,000 × $0.008 = $16,000 → **$33,975.00** |

### Sensitivity notes
- **Traffic vs no traffic.** Same volumes on Compute Routes **Essentials** ($5/1,000): $275 / $2,375 / $9,950 for routes. Per-driver routes cost halves — **[inference]** from the same price list.
- **Matrix-based matching dominates.** A `computeRouteMatrix` call with 20 candidate drivers × 1 pickup = **20 billed elements** ([Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing), acc. 2026-10-29). At 100 drivers (30,000 dispatches/month × 20 = 600,000 elements, Pro) the matrix alone costs **$4,750/month** — 7× the 2-route-calls-per-trip line, because 20 elements per dispatch is 20× one route call. **[inference]**
- **Per-trip unit economics at 100 drivers:** $650 / 30,000 trips = **$0.0217 per trip** on mobile; $1,210 / 30,000 = **$0.040 per trip** on web. With Navigation SDK: $1,375 / 30,000 = **$0.0458 per trip**. **[inference]**
- Free caps cover a pilot: at 100 drivers, autocomplete is entirely free and geocoding is 2/3 free; only routes are meaningfully billed.

### Gaps
- The model ignores Places details on autocomplete selection, static maps on the rider receipt, refunds/retries, and any per-driver location streaming (which uses no Google quota if done on your own backend). Real bills will be higher than this floor.

---

## 8. Coverage in Palestine: what Google provides, what it does not

### Takeaway
Google documents **good** map tiles, geocoding, driving directions and walking directions for Palestine (PS) — and **no traffic layer, no speed limits, no biking, no 3D**. That is the crux for a dispatch product: Google will route you, but it will not tell you how traffic is flowing in the West Bank.

### Cited Findings
- **PS row** in the core coverage table: Map Tiles 2D `⬤` (good), Maps JavaScript 3D `—`, Geocoding `⬤`, **Traffic Layer `—`**, Driving Directions / Snap to Roads `⬤`, Biking `—`, Walking `⬤`, Speed Limits `—` — [Google Maps Platform coverage details](https://developers.google.com/maps/coverage) (last updated 2026-10-28; acc. 2026-10-29) **[observed from glyph table]**.
- The same table for **IL (Israel)**: Traffic Layer `—`, Speed Limits `—`, driving/walking `⬤` — [coverage details](https://developers.google.com/maps/coverage) (acc. 2026-10-29) **[observed]**. So the missing traffic layer is regional, not specific to PS.
- **Navigation SDK PS row**: Traffic Layer `—`, Driving Directions `⬤`, Walking `⬤`, Two-Wheeled `—`, Biking `—`, Speed Limits `—`, Traffic Lights/Stop Signs `—`, Real-Time Disruptions `—` — [Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk) (last updated 2026-10-20; acc. 2026-10-29) **[observed]**.
- The coverage page's own caveat: "data coverage can change due to various reasons, including construction activities for roads, changes in government regulations, and changes in the licensing agreements with the data providers" — [coverage details](https://developers.google.com/maps/coverage) (acc. 2026-10-29).
- Traffic-aware routing is billed as a Pro feature regardless of whether traffic data exists for that geography — the SKU trigger is the request modifier `TRAFFIC_AWARE` / `TRAFFIC_AWARE_OPTIMAL` — [Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) (acc. 2026-10-29).
- **SLA:** Google will use "reasonable commercial efforts" to provide **99.9% Monthly Uptime** per Covered Service, with credits of 10% / 25% / 50% of the monthly bill for that service, capped at 50%, and the customer **must claim within 30 days** — [Google Maps Platform SLA](https://cloud.google.com/maps-platform/terms/sla) (last modified 2025-01-27; acc. 2026-10-29). Excludes failures caused by quotas, invalid requests, or the customer's own software.
- Place/POI breadth: Google markets "250M+ global places" as the grounding dataset — [mapsplatform.google.com/pricing nav / agent tools](https://mapsplatform.google.com/pricing/) (acc. 2026-10-29) **[marketing claim, not a measured PS figure]**.

### Inferences
- **The coverage table is the single most decision-relevant document here.** For a West Bank dispatch product, Google delivers the geometry (roads, addresses, turn-by-turn) but not the dynamics (traffic, disruptions, speed limits, closures). ETAs will be based on road class and distance, not observed flow.
- Paying the Pro (traffic-aware) premium in PS may buy **nothing but a higher price**, because the traffic layer is documented unavailable there. Fastship should A/B `TRAFFIC_AWARE` vs plain routing against its own driver GPS traces before defaulting to Pro. **[inference — worth an explicit test, not an assumption]**
- **Checkpoints, closures and settler-road restrictions are not a documented Google dataset.** Nothing in the coverage tables or terms mentions them. Any product requirement around checkpoints must come from Fastship's own data/ops, not Google. **[inference from documented absence — no source claims Google provides this]**
- The 99.9% SLA is availability of the API, not freshness or accuracy of traffic/ETA — consistent with the ToS "planning purposes only" disclaimer.

### Gaps
- No Google page quantifies **address or POI coverage density for the West Bank** (e.g. share of streets with names, number of verified POIs). The coverage glyphs are qualitative. Any "Google has better address coverage in Palestine than X" claim would be **[unverified]** without a field test.
- Arabic-language geocoding quality for West Bank localities (including variant spellings and informal neighbourhood names) is not documented anywhere I found — needs an empirical test set.
- Whether `TRAFFIC_AWARE` returns any meaningful signal in PS despite the `—` traffic-layer glyph is **[unverified]**; the glyph describes a map layer, not necessarily the routing model.

---

## 9. Contracting from Palestine: billing country, currency, tax

### Takeaway
Google Cloud **does** support a Palestinian Territory billing profile: charges in **ILS**, paid by **credit/debit card**, self-serve. That removes the biggest "can we even buy it" risk. Tax treatment is contractual (customer bears all taxes) and the specific VAT position is not documented on the pages I read.

### Cited Findings
- Cloud Billing currency table lists **"Palestinian Territory | ILS | credit/debit card"** — [Currencies available for Cloud Billing self-serve accounts](https://docs.cloud.google.com/billing/docs/resources/currency) (last updated 2026-10-26; acc. 2026-10-29) **[documented]**.
- Each billing account operates in a **single currency that cannot be changed** after creation; Google converts USD list prices to the local currency monthly at published rates — [same page](https://docs.cloud.google.com/billing/docs/resources/currency) (acc. 2026-10-29).
- If a country is not listed, "your Cloud Billing account might incur charges in USD" — [same page](https://docs.cloud.google.com/billing/docs/resources/currency) (acc. 2026-10-29). Palestine **is** listed, so ILS applies.
- Payment methods for self-serve accounts are per-country; invoiced billing is a separate application process — [same page](https://docs.cloud.google.com/billing/docs/resources/currency) and nav entry "Apply for invoiced billing" (acc. 2026-10-29).
- **Taxes:** "Customer is responsible for any Taxes, and Customer will pay Google for the Services without any reduction for Taxes. If Google is obligated to collect or pay Taxes, the Taxes will be invoiced to Customer" — [ToS §2.3(a)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29). Customer must supply valid tax ID information where required, and is liable for penalties from mis-declaration — [ToS §2.3(b)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- Google's measurement of usage is final; refunds are issued only as service credit, not cash — [ToS §2.2, §2.4](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).
- **EEA terms do not apply:** the EEA ToS governs only if the billing account address is in the EEA — [ToS preamble](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29); the Service Specific Terms repeat this and route EEA customers to a separate document — [Service Specific Terms preamble](https://cloud.google.com/maps-platform/terms/maps-service-terms) (acc. 2026-10-29). A Palestinian billing address therefore sits under the global ToS + global Service Specific Terms.
- Contracting entity and governing law: Google entity per [cloud.google.com/terms/google-entity](https://cloud.google.com/terms/google-entity) (referenced, not fetched); disputes governed by California law, Santa Clara County courts — [ToS §18.11(c)](https://cloud.google.com/maps-platform/terms) (acc. 2026-10-29).

### Inferences
- Fastship can start **self-serve, today, on a card, in ILS** — no reseller, no local entity requirement documented, no EEA-specific obligations.
- Because the account currency is fixed at creation and cannot be changed, choosing the billing profile country correctly at signup matters more than it looks; a profile created under the wrong country cannot simply be re-based.
- Budget in ILS but reason in USD: Google's published prices are USD and the ILS figure moves monthly with the conversion rate, so a "fixed" ILS map cost is not actually fixed.
- The 12-month liability cap (§15.1(b)) is denominated in **fees paid**, so a Palestinian startup's practical recourse if Maps breaks is a few hundred dollars — this is a business-continuity argument for keeping a fallback geocoder/router, not a legal one.

### Gaps
- **VAT / customs treatment for a Palestinian Territory billing profile is not documented on any page I fetched.** Whether Google charges Israeli VAT (given ILS billing), Palestinian VAT, or zero-rates the supply is **[unverified]** and should be confirmed with a local accountant before signing.
- Which Google contracting entity signs a Palestinian customer (Google LLC vs Google Ireland vs Google Commerce Ltd) is defined at [cloud.google.com/terms/google-entity](https://cloud.google.com/terms/google-entity), which I did not fetch — **[unverified]**.
- I found no Google statement on whether **invoiced billing / purchase orders** are available to Palestinian entities; the self-serve card path is the only documented one.
- No primary source on whether Google Cloud's **$300 trial credit** is available to Palestinian Territory accounts. The pricing page advertises it globally ("New customers get a $300 trial credit") — [mapsplatform.google.com/pricing](https://mapsplatform.google.com/pricing/) (acc. 2026-10-29) — but country-level eligibility is **[unverified]**.
