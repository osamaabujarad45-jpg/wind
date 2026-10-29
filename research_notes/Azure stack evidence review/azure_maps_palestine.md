# Azure Maps for a Palestine (West Bank, +970) ride-hailing/delivery app — evidence review

**State as of:** 29 October 2026. All URLs accessed 2026-10-29. Page dates are the `ms.date` / `updated_at` values published by Microsoft Learn.
**Scope:** Azure Maps only, judged against the current stack (MapLibre GL + OpenFreeMap tiles + self-hosted OSRM). Apple Maps is **not** assessed here (see Gaps).
**CORRECTION (29 October 2026, live test):** The documentary bottom line below is wrong for the live service. A temporary Gen2 account returned detailed Ramallah z16 tiles, West Bank city geocodes, and Ramallah–Nablus routes within 1 km of OSRM. The coverage pages omit data the service actually has. The reasons to keep OSRM primary are the missing real-time traffic, checkpoint/closure semantics, trustworthy truck restrictions, and landmark geocoding, plus cost and no RN SDK — not absence of coverage. See `azure_maps_live_test.md`. The service/API facts below remain useful; do not reuse the coverage conclusion.

**Original bottom line (superseded):** Azure Maps' own coverage tables omit Palestine from routing, geocoding, traffic and render. On the documented evidence it cannot replace OSRM/OpenFreeMap for the core trip flow, and even "augment" use is limited to non-Palestine legs or non-spatial services (time zone, weather).

## 1. Which Azure Maps services exist in 2026, current API versions, and what is deprecated?

### Takeaway
Seven services are current: Geolocation 1.0, Render 2024-04-01, Route 2025-01-01, Search 2026-01-01, Timezone 1.0, Traffic 2025-01-01, Weather 1.1. The 2026 cleanup cycle already removed Render v1 (17 Sep 2026), Gen1 pricing (15 Sep 2026), the Android/iOS native SDKs, and the Azure Maps Service Module (30 Sep 2026). Geofencing is the anomaly: still advertised on the overview page, but absent from the current REST index and its doc URLs 404.

### Cited Findings
- Current stable API versions table: Geolocation **1.0**; Render **2024-04-01**; Route **2025-01-01**; Search **2026-01-01**; Timezone **1.0**; Traffic **2025-01-01**; Weather **1.1** — [Azure Maps REST API links](https://learn.microsoft.com/en-us/azure/azure-maps/rest-api-azure-maps) (page dated 2026-09-17).
- "Previous releases … some are slated for retirement": Render 2022-08-01, Route 1.0, Search 1.0, Traffic 1.0 — [Azure Maps REST API links](https://learn.microsoft.com/en-us/azure/azure-maps/rest-api-azure-maps).
- Search docs confirm `2026-01-01` is the default moniker with `2025-01-01` and `1.0` as "Other Supported Versions" — [Search REST API](https://learn.microsoft.com/en-us/rest/api/maps/search?view=rest-maps-2026-01-01) (docs updated 2026-04-09).
- Route docs show API Version **2025-01-01** even under the `2026-01-01` docs moniker (i.e. no separate Route 2026 API) — [Route REST API](https://learn.microsoft.com/en-us/rest/api/maps/route?view=rest-maps-2026-01-01).
- Render docs show API Version **2024-04-01** with `2022-08-01` as the older version — [Render REST API](https://learn.microsoft.com/en-us/rest/api/maps/render?view=rest-maps-2026-01-01).
- "Azure Maps Render version 1.0 retired on September 17, 2026. Render 1.0 requests are no longer supported." — [Migrate Azure Maps Render 1.0 APIs](https://learn.microsoft.com/en-us/azure/azure-maps/migrate-render-v1-api) (statement taken from the page's indexed excerpt; page not fetched in full).
- Pricing tier: "The Gen1 pricing tier retired on September 15, 2026. All accounts that used Gen1 S0 or S1 were automatically converted to Gen2." — [Azure Maps account pricing](https://learn.microsoft.com/en-us/azure/azure-maps/how-to-manage-pricing-tier) (2026-08-28, updated 2026-09-15).
- "The Azure Maps Native SDK for Android is now retired and no longer supported." Migration path is the Web SDK inside a WebView — [Android SDK migration guide](https://learn.microsoft.com/en-us/azure/azure-maps/android-sdk-migration-guide) (2025-03-31).
- "The Azure Maps Native SDK for iOS is now retired and no longer supported." Same WebView migration path — [iOS SDK migration guide](https://learn.microsoft.com/en-us/azure/azure-maps/ios-sdk-migration-guide) (2025-03-31).
- "The Azure Maps Service Module is deprecated and slated for retirement 2026/09/30. We need to migrate to Azure Maps JavaScript REST SDK" (customer question, Microsoft Q&A) — [Microsoft Q&A 2263582](https://learn.microsoft.com/en-us/answers/questions/2263582/timeline-for-azure-maps-deprecated-functionality-r). Status: **customer-reported**, not an official retirement page.
- "The Azure Maps Creator indoor map service is being retired on Sep 30 2025" — [Microsoft Q&A 5542405](https://learn.microsoft.com/en-us/answers/questions/5542405/azure-maps-creator-retirement-question).
- Overview page still lists "Geofencing service with location information hosted in Azure" as an Azure Maps capability — [What is Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/about-azure-maps) (2026-09-17).

### Inferences
- Any 2026 design must target Gen2 / G2 SKU and the versioned REST surface above; any tutorial or sample using `api-version=1.0` for Render is dead (Render 1.0 retired) and Search 1.0 is on a published deprecation track.
- The Service Module retirement matters if we planned server-side Node calls via `azure-maps-rest`; that layer must be re-written against the JavaScript REST SDK or raw REST.
- Geofencing cannot be designed against until Microsoft confirms status: the overview advertises it, but it is missing from the current REST index, missing from the transaction/billing table, and `learn.microsoft.com/en-us/rest/api/maps/geofence` (and `/spatial`) return 404 on 2026-10-29.

### Gaps
- No official page found listing *all* Azure Maps retirements in one place; deprecation evidence is scattered across Q&A and migration guides.
- Could not confirm whether Geofence/Spatial was silently retired or merely de-indexed. **Needs a support ticket before any design depends on it.**
- Search 1.0 retirement date: a Q&A thread asks for it, no official date found.

## 2. Does Azure Maps have road / geocoding / traffic coverage for Palestine (West Bank)? Is routing available? Checkpoint gaps?

### Takeaway
No. Palestine is absent from all four coverage tables — routing, geocoding, traffic, render. It is not listed as "partial" either: the country simply does not appear, while Israel appears with full routing and address-point geocoding. Even inside Israel, real-time traffic is documented as unavailable "temporarily". There is no documented mechanism for checkpoint-aware routing anywhere in the product.

### Cited Findings
- Coverage method: each service has its own table; the geographic-coverage hub only links to them — [Geographic coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geographic-coverage) (updated 2026-03-25).
- **Routing table**: one alphabetical list; it runs `Iraq → Ireland → Isle of Man → Israel → Italy` with **no Palestine / West Bank / Gaza / "Palestinian Authority" row anywhere**. Israel row is `| Israel | ✓ | ^3^ | ✓ |` (directions, real-time traffic, truck) — [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage) (2026-10-02).
- Footnote 3 of the routing table, verbatim: "Real-time traffic is temporarily unavailable because current traffic data doesn't meet quality requirements. Map and routing data remain available." — [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage).
- Footnote 1 defines partial coverage: "Country/region has partial road data with at least coverage for major roads." Palestine does not carry this footnote because it is not in the table at all — [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage).
- **Geocoding table**: Middle East & Africa includes `Israel | ✓ | ✓ | ✓ | ✓ | ✓` (address points, house numbers, street level, city level, POI), `Jordan | ✓ | | ✓ | ✓ | ✓`, `Lebanon`, `Egypt`, `Syria` (city level only). **No Palestine row.** — [Geocoding coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geocoding-coverage) (2025-06-12, updated 2025-10-21).
- Geocoding precision definitions, verbatim: "**Address points** - Address data can be resolved to latitude/longitude coordinates within the address parcel… 'Rooftop' accurate"; "**House numbers** - Addresses are interpolated… on the street"; "**Street level** - Addresses are resolved to the… street… house number may not be processed"; "**City level** - City place names are supported." — [Geocoding coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geocoding-coverage).
- **Traffic table**: `| Israel^1^ |  |  |` — both Incidents and Flow blank; footnote 1: "Traffic service is temporarily unavailable because current traffic data doesn't meet quality requirements." No Palestine row. — [Traffic service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/traffic-coverage) (2026-10-02).
- Traffic coverage rule, verbatim: "If a market is missing in the following tables, it isn't currently supported." — [Traffic service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/traffic-coverage).
- **Render table**: Middle East & Africa lists Algeria…Yemen, including `Jordan`, `Lebanon`, `Israel` is also absent from this table's Europe section, and there is **no Palestine row**. Legend, verbatim: "Country/region is missing | Country/region data isn't provided." — [Render service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/render-coverage) (2026-09-17).
- Routing exists on the Israeli side of the seam (Israel = ✓ directions), and across the Jordanian and Egyptian borders (both = ✓ directions; Egypt also has traffic), so cross-border legs are asymmetric by design — [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage); [Traffic service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/traffic-coverage).
- No Azure Maps feature documented for restricted roads, military checkpoints, closures, or permit-gated segments. Route options documented are traffic, vehicle type, "conditions to avoid", truck attributes — [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage).

### Inferences
- A Ramallah→Nablus or Bethlehem→Qalandia request is a request whose origin and destination sit in a country with no documented routing data. The most likely documented-consistent outcomes are a `no route` / error response or a route built only from whatever global geometry exists — **but the docs do not state which**, so this is unverified until tested.
- Because geocoding has no Palestine row — not even "city level" — there is no documented basis for Arabic address autocomplete for West Bank addresses. The address-point support that exists for Israel does not extend across the seam on paper.
- The absence from *Render* is the most severe finding: it is not only routing that is unsupported, the road-tile coverage page says data is not provided. Whether the world basemap still draws West Bank streets at z12–16 is undocumented and must be checked visually.
- Even if Palestine were covered, the Israel traffic outage (footnote 3) means a cross-seam ETA would fall back to static speeds on the Israeli side today.

### Gaps
- No official statement on what the API *returns* for coordinates inside Palestine (error code vs empty route vs global-fallback route). Docs only define the coverage table.
- No public Microsoft Q&A / Stack Overflow / GitHub issue found reporting Palestine routing behaviour (searched 2026-10-29). Absence of reports is not evidence of function.
- Nothing found on how Area A/B/C administrative status, seam zones, or checkpoint closures are modelled (or not) in Azure Maps/TomTom data.
- Render coverage table lists neither Israel nor Palestine in its Middle East section; I did not establish whether that is a documentation omission or a real gap for Israel.

## 3. Is there a first-party React Native SDK? Rendering options, licensing, mobile terms?

### Takeaway
No first-party React Native SDK, and no native SDKs at all anymore — both Android and iOS native SDKs are retired and Microsoft's own migration guide says to embed the Web SDK in a WebView. For an Expo/RN app that means a WebView map (or keeping MapLibre for rendering and calling Azure REST only), plus unofficial community wrappers.

### Cited Findings
- "The Azure Maps Web SDK lets you customize interactive maps… You can use this interactive map for both your web or mobile applications. The map control makes use of WebGL" — [What is Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/about-azure-maps).
- Android native SDK retired; official guidance is `WebView` + `atlas.min.js` (`mapcontrol/3`) + `addJavascriptInterface` bridge — [Android SDK migration guide](https://learn.microsoft.com/en-us/azure/azure-maps/android-sdk-migration-guide).
- iOS native SDK retired; same WebView approach with `WKWebView` + `WKScriptMessageHandler` — [iOS SDK migration guide](https://learn.microsoft.com/en-us/azure/azure-maps/ios-sdk-migration-guide).
- Only React binding found is web-only (`react-azure-maps`, Azure GitHub Pages) — [react-azure-maps](https://azure.github.io/react-azure-maps/).
- React Native wrapper that exists is explicitly unofficial: "react-native-azure-maps is an unofficial React Native component" — [ibrahimMH13/react-native-azure-map](https://github.com/ibrahimMH13/react-native-azure-map).
- Microsoft Q&A thread asking whether Azure Maps supports React Native — [Microsoft Q&A 1382963](https://learn.microsoft.com/en-us/answers/questions/1382963/will-azur-map-is-supporting-react-native).
- Attribution obligation: "You're required to display the appropriate copyright attribution on the map anytime you use the Azure Maps Render service, either as basemaps or layers, in any third-party map control." — [What is Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/about-azure-maps); attribution mechanics in [How to show attribution](https://learn.microsoft.com/en-us/azure/azure-maps/how-to-show-attribution).
- Auth for mobile clients: subscription key, Microsoft Entra, or SAS token; SAS tokens can be scoped by region — [Authentication with Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/azure-maps-authentication); [geographic scope](https://learn.microsoft.com/en-us/azure/azure-maps/geographic-scope).

### Inferences
- In this Expo app, the realistic Azure rendering path is a `react-native-webview` screen hosting an HTML page with `atlas.min.js`, bridged via `postMessage`/`injectedJavaScript`. That is a second rendering engine alongside MapLibre — duplicated styling, duplicated gesture/performance work, and a WebView cold-start cost on low-end Android devices common in the local market.
- A cheaper integration is "Azure REST, MapLibre rendering": keep MapLibre + OpenFreeMap for tiles, call Azure only for routing/search. But §2 says those calls have no Palestine coverage, so this buys little.
- Shipping a subscription key inside an RN app is not acceptable; a SAS token minted server-side is the documented pattern, which adds a token service to the backend.

### Gaps
- No official statement that the Web SDK is *licensed* for native app embedding beyond the overview sentence; the Product Terms / Azure Maps Terms of Use were not located and parsed. Legal sign-off needed.
- No first-party RN/Expo plugin, no official statement of WebView performance guidance for mobile.
- Arabic/RTL map label behaviour in the Web SDK (vs MapLibre) not verified.

## 4. Pricing model, free tier, quotas, throttling, SLA (2026)

### Takeaway
Gen2 only, flat **$4.50 per 1,000 transactions** below 500K/month with per-meter monthly free grants (5,000 tile transactions = 75,000 tiles; 1,000 routing; 5,000 search). Billing ratios are favourable for autocomplete (10 requests = 1 transaction) and brutal for map panning if Azure also renders (15 tiles = 1 transaction). QPS caps are per-service and low for traffic/route (50). No Azure Maps-specific SLA figure could be retrieved.

### Cited Findings
- "Unless otherwise specified, the prices below are per 1,000 transactions." Table columns: `Free | <500K | 500K+`; the `<500K` cell is **4.5** (USD) for every meter, and `500K+` is "Contact Us" — [Azure Maps pricing](https://azure.microsoft.com/en-us/pricing/details/azure-maps/) (page build 2026-10-27).
- Free monthly grants per meter, from the same table: Base Map Tiles **5,000**; Imagery Tiles **1,000**; Traffic Tiles **5,000**; Weather Tiles **1,000**; Static Map Images **1,000**; Data **5,000**; Geolocation **5,000**; Search **5,000**; Routing **1,000**; Spatial Calculations **5,000**; Time Zone **5,000**; Traffic **1,000**; Weather **1,000** — [Azure Maps pricing](https://azure.microsoft.com/en-us/pricing/details/azure-maps/).
- Independent corroboration of the 9× jump: Gen1 S0 "roughly $0.50 per 1,000" → Gen2 "approximately $4.50 per 1,000" — [OnTerra Systems, Guide to the Azure Maps Price Increase](https://www.onterrasystems.com/azure-maps-price-increase/) (secondary source, vendor blog).
- Billing ratios, verbatim: Render "15 tiles = 1 transaction"; Route "One request = 1 transaction"; Route Matrix `Ceiling(0.25*origins*destinations)`; Search "One request = 1 transaction"; "When using Geocode Autocomplete, every 10 autocomplete requests count as one billable Search transaction." — [Understanding Azure Maps transactions](https://learn.microsoft.com/en-us/azure/azure-maps/understanding-azure-maps-transactions) (2026-08-28, updated 2026-09-15).
- Free-tier example, verbatim: "you get 5,000 free *Base Map Tile* transactions per month. Each transaction can include up to 15 tiles for a total of 75,000 tiles rendered for free each month." — same page.
- Non-billable: 5xx, 401, 403, 408, 429, CORS preflight — same page.
- Transaction table covers Geolocation, Render, Route, Search, Timezone, Traffic, Weather — **no Geofence, no Spatial row**, despite "Spatial Calculations" existing as a pricing meter — [Understanding Azure Maps transactions](https://learn.microsoft.com/en-us/azure/azure-maps/understanding-azure-maps-transactions).
- QPS defaults: Copyright 10; Geolocation 50; Render road tiles **500**; satellite 250; static 50; traffic tiles 50; weather tiles 100; Route batch 10; **Route single 50**; Search batch 10; **Search single 500**; reverse 250; **autocomplete 100**; Timezone 50; **Traffic 50**; Weather 50. "When you reach a QPS limit, the service returns an HTTP 429." — [QPS rate limits](https://learn.microsoft.com/en-us/azure/azure-maps/azure-maps-qps-rate-limits) (2026-08-28, updated 2026-09-15).
- "Azure Maps doesn't have any maximum daily limits on the number of requests" — same page.
- No daily cap, but 500K+/month pricing is "Contact Us" (negotiated) — [Azure Maps pricing](https://azure.microsoft.com/en-us/pricing/details/azure-maps/).

### Inferences (our arithmetic, list price, before tax/discount)
- 10,000 trips/month × 20 route calls/trip = 200,000 route transactions → 199,000 billable × $4.50/1,000 ≈ **$895/month** for routing alone.
- 200 driver devices × 100 tile-transactions/day × 30 = 600,000 tile transactions → 595,000 billable × $4.50/1,000 ≈ **$2,678/month** just for basemap panning. At 15 tiles/transaction this is ~9M tiles/month; a MapLibre/OpenFreeMap stack incurs €0 marginal tile cost.
- Autocomplete is the one cheap meter: 5,000 free search transactions = **50,000 free autocomplete requests/month**, then $4.50 per 10,000 requests.
- 50 QPS on Route single-request is ample at our scale (≈0.6 QPS average for 10k trips/day), so throttling is not the binding constraint — coverage is.

### Gaps
- **SLA not verified.** `azure.microsoft.com/en-us/support/legal/sla/azure-maps/` redirects to the consolidated Online Services SLA index; the Azure Maps-specific uptime figure was not extracted from the October 2026 DOCX.
- Volume-discount breakpoints above 500K transactions are not published ("Contact Us"); no quote obtained.
- Whether geofence operations would be billed (and under which meter) is undocumented; no meter appears in either the pricing table or the transactions table.

## 5. Data residency / region options relevant to Palestine

### Takeaway
Azure Maps is a global service with only **two** data-residency geos: Europe (`eu.atlas.microsoft.com`) and United States (`us.atlas.microsoft.com`). There is no Middle East geo and no Israel/UAE account region for Maps — the ARM template's allowed account locations are westeurope, northeurope, eastus, westus2, westcentralus, usgovvirginia, usgovarizona. Palestine falls under no local residency option; EU is the nearest documented choice.

### Cited Findings
- Verbatim: "Azure Maps is a global service that supports specifying a geographic scope, which allows you to limit data residency to the European (EU) or United States (US) geographic areas (geos). All requests (including input data) are stored exclusively in the specified geographic area." — [Azure Maps service geographic scope](https://learn.microsoft.com/en-us/azure/azure-maps/geographic-scope) (updated 2026-03-25).
- Only two geographic endpoints exist: `eu.atlas.microsoft.com` and `us.atlas.microsoft.com` (plus `atlas.azure.us` for Azure Government) — same page.
- Replication caveat, verbatim: "For disaster recovery and high availability, Microsoft may replicate customer data to other regions within the same geographic area." — same page.
- Account location allowed values in the official ARM template: `westeurope`, `eastus`, `westus2`, `northeurope`, `westcentralus`, `usgovvirginia`, `usgovarizona`; SKU `G2`, kind `Gen2`, API `2023-06-01` — [Azure Maps account pricing](https://learn.microsoft.com/en-us/azure/azure-maps/how-to-manage-pricing-tier) (2026-08-28).
- Privacy/subprocessor, verbatim: "Azure Maps shares customer-provided address/location queries with third-party TomTom for mapping functionality purposes. These queries aren't linked to any customer or end user when shared with TomTom and can't be used to identify individuals. TomTom is a subprocessor that is authorized to subprocess Azure Maps customer data." — [What is Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/about-azure-maps) (2026-09-17).
- Service availability exclusion: Azure Maps services are "currently available except in … China … Korea" — same page (no Palestine restriction stated).

### Inferences
- Choosing the `eu` endpoint keeps West Bank user coordinates in EU datacenters; choosing default/global may land in the US. For a Palestinian operator weighing data-sovereignty expectations, neither is local — this is a policy decision, not an engineering one.
- Every address/location query (pickup, dropoff, driver position sent for reverse geocode) is shared with TomTom as a subprocessor. For a ride-hailing app this is a materially larger disclosure than self-hosted OSRM, which shares nothing.
- Latency from Ramallah to West Europe is plausibly 60–100 ms RTT, but **no published measurement exists**; treat as unverified and measure.

### Gaps
- No published latency figures or region-pairing guidance for the Levant.
- Did not verify whether `eu.atlas.microsoft.com` is served from West Europe/North Europe specifically or any EU datacenter.
- No legal analysis of Palestinian data-protection expectations vs EU/US residency; out of scope here.

## 6. What Azure Maps uniquely adds vs OSRM/MapLibre, and what would be lost

### Takeaway
On paper Azure adds traffic-influenced ETA, matrix/route-range/snap-to-roads, rooftop-grade geocoding, and managed SLA/billing — but every one of those is gated on coverage, and Palestine has none. For this app the realistic delta is near-zero on the core flow, while the losses (self-hosting, checkpoint control, predictable cost, offline tolerance) are concrete.

### Cited Findings
- Azure Route considers "real-time traffic information and historic traffic data, like the typical road speeds on the requested day of the week and time of day"; supports car/truck/bicycle/walking/EV, departure time, weight/hazmat restrictions — [What is Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/about-azure-maps).
- Route feature set: batch, matrix, route range (isochrone) — same page; API list in [Route REST API](https://learn.microsoft.com/en-us/rest/api/maps/route?view=rest-maps-2026-01-01).
- Traffic provides "Traffic flow: Real-time observed speeds and travel times for all key roads" and "Traffic incidents" — [What is Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/about-azure-maps); coverage limited per §2.
- Search offers "Geocode Autocomplete… suggest location completions as you type, based on partial input and optional location context", search-along-route, search-inside-area, batch — same page.
- Geocoding quality tiers only reach "rooftop" in countries with address points (Israel yes, Palestine absent) — [Geocoding coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geocoding-coverage).
- Traffic-influenced ETA is unavailable for Israel "temporarily" and Palestine is unsupported entirely — [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage); [Traffic service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/traffic-coverage).
- Azure Maps is a consumption service with per-transaction billing and no self-host option; there is no documented on-prem/offline deployment — [Azure Maps pricing](https://azure.microsoft.com/en-us/pricing/details/azure-maps/); [What is Azure Maps](https://learn.microsoft.com/en-us/azure/azure-maps/about-azure-maps).
- The current stack's properties (self-hosted OSRM profiles, OpenFreeMap tiles, MapLibre styling) are not Azure equivalents: Azure exposes fixed route profiles and a fixed style catalogue (`TilesetID`), not custom routing graphs — [Get Map Tile / TilesetID](https://learn.microsoft.com/en-us/rest/api/maps/render/get-map-tile).

### Inferences
- **Uniquely adds (conditional):** live-traffic ETA and incident awareness *where covered*; matrix for dispatch/batching; isochrones for delivery zones; snap-to-roads for GPS cleanup; enterprise auth/billing/SLA wrapper. None of these apply inside the West Bank on current docs.
- **Would be lost:** checkpoint/closure-aware routing (OSRM at least lets us encode custom penalties or a bespoke graph; Azure exposes no such knob), self-hosting and offline tolerance during connectivity outages, per-request cost control, and the ability to fix a bad road ourselves in OSM.
- **Cost trajectory is adverse:** Gen1→Gen2 was ~9× for the same transactions in Sept 2026, and the 500K+ tier is negotiated. A tile-heavy consumer app is the worst-case shape for this pricing.
- Net: Azure Maps is not a replacement. The only defensible augmentation is non-spatial services (time zone, weather-along-route) or operations that stay outside Palestine — both marginal for this product.

### Gaps
- No quantitative comparison of OSM/OpenFreeMap West Bank road completeness vs TomTom (Azure's data supplier) — would need a sampled diff, not desk research.
- Apple Maps West Bank coverage not assessed (out of scope of this note); no claim made.
- Nothing found on whether Azure Maps exposes closure/incident *reporting* (as opposed to consumption) for this region.

## 7. What field tests would be required before adoption

### Takeaway
Coverage tables are country-level and stale-prone; a paid, instrumented spike is the only way to know what the API actually does with West Bank coordinates. The tests below are ordered so the cheapest kill-shots come first.

### Cited Findings
- Coverage pages are the only official granularity statement, and they are country-level with no city-level detail for the region — [Geographic coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geographic-coverage); [Geocoding coverage](https://learn.microsoft.com/en-us/azure/azure-maps/geocoding-coverage); [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage).
- Microsoft's own guidance is to verify behaviour per region because "Azure Maps has various levels of information and accuracy for different regions" — [Route service coverage](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage).
- Geocode Autocomplete pricing means a broad autocomplete test set is cheap: 10 requests = 1 transaction, 5,000 free transactions/month — [Understanding Azure Maps transactions](https://learn.microsoft.com/en-us/azure/azure-maps/understanding-azure-maps-transactions).
- 429 behaviour is documented, so throttling tests are deterministic — [QPS rate limits](https://learn.microsoft.com/en-us/azure/azure-maps/azure-maps-qps-rate-limits).

### Inferences — test plan (each test must record request, HTTP status, response body, and portal meter)
1. **Tile render (cheapest kill-shot).** Load `Get Map Tile` at z12/14/16 for Ramallah (31.9038, 35.2034), Nablus (32.2211, 35.2544), Hebron (31.5326, 35.0998), Qalandia (31.895, 35.222). Record whether road geometry/labels exist, in Arabic and English, and whether any tile returns 404/blank.
2. **Geocode.** 25 real addresses (Arabic script + English transliteration + "near <landmark>" phrasing) across Area A/B/C; measure exact-match rate, rooftop vs street vs city fallback, and whether West Bank results are returned at all vs snapped to Israeli localities.
3. **Reverse geocode.** 20 driver GPS points; check street names, municipality naming, and whether the response asserts a country of "PS" or "IL".
4. **Routing.** 10 real trips including Qalandia→Ramallah, Huwwara→Nablus, Bethlehem→Jerusalem via Checkpoint 300, and a Ramallah→Amman cross-border leg. Record: route returned?, distance/ETA vs OSRM, whether the route crosses a closed checkpoint, and whether `traffic=true` changes anything.
5. **ETA accuracy.** 3 days × 20 trips, log predicted vs actual arrival; compare against OSRM and against driver-reported reality. This is the only way to price the "traffic ETA" claim.
6. **Autocomplete UX.** Arabic partial queries ("شارع", "دوار", transliterations), latency from a Ramallah network, and hit-rate in top-5.
7. **Latency.** p50/p95 to `eu.atlas.microsoft.com` and default endpoint from Palestine on 3G/4G; compare with self-hosted OSRM.
8. **Geofence status.** Attempt `PUT /geofence` per legacy docs; if 404, escalate to support — do not design around it.
9. **Billing verification.** Run a scripted 10K-transaction workload and reconcile the portal meter names/counts against the transactions table (especially tiles and autocomplete) before trusting any cost model.
10. **Licensing/attribution review.** Confirm WebView embedding and attribution text with Microsoft/legal before build.

### Gaps
- No public, reproducible field report of Azure Maps behaviour inside the West Bank exists to shortcut step 1–4; the plan above is the substitute.
- Test budget, Azure subscription, and a data-processing agreement are prerequisites not yet in place.
- No acceptance thresholds defined (e.g. "≥90% rooftop geocode, ETA MAPE ≤15%") — these must be agreed with product before the spike, otherwise results are unactionable.
