# Low-cost Uber-quality maps, routing, ETA and geocoding for Palestine (+970), October 2026

All URLs accessed **2026-10-29** unless a page states its own update date. Labels: **[documented]** = provider/primary source states it; **[observed]** = I tested or the parent session tested it; **[unverified]** = secondary source or inference not confirmed by a primary page. Prices are USD list prices unless noted, excluding VAT.

**Bottom line:** In Palestine, no mainstream provider sells real-time West Bank traffic, and none models checkpoints, closures, permit roads or settlement bypasses. Google's own Navigation SDK coverage table marks Palestine's traffic layer and real-time disruptions as unavailable (`—`) while marking driving directions as good quality. So the expensive "Uber-quality" bundle buys road geometry and geocoding, not the thing that actually differentiates ETA in the West Bank. A self-hosted MapLibre + OSRM/Valhalla + Photon stack with a custom checkpoint/closure layer is the only combination that can be both cheap and locally correct. Paid APIs become worth it only for address-level geocoding outside Palestinian cities, a turn-by-turn SDK, or an SLA — and at 10,000 drivers Google costs roughly 47× the self-hosted stack even with its mobile map SDK free.

---

## 1. Google Maps Platform: current prices, free usage per SKU, and the ride-hailing terms

### Takeaway
Google no longer has the old $200 monthly credit. Each SKU has its own monthly free cap (10,000 events for most Essentials, 5,000 for Pro, 1,000 for Enterprise). The mobile **Maps SDK** has an unlimited free cap, so native Android/iOS map display is free; **Dynamic Maps ($7/1k)** is the web/JavaScript dynamic-map SKU. For a West Bank launch the billable SKUs are Routes Essentials ($5/1k), Geocoding ($5/1k) and Autocomplete ($2.83/1k), each with 10k free. The terms forbid using Routes/Geocoding/Places/Navigation SDK content with a non-Google map, so Google cannot be bolted onto MapLibre/OpenFreeMap.

### Cited Findings
- **[documented]** Google Maps Platform global price list, last updated **2026-10-28**: Dynamic Maps free cap 10,000; then $7.00/1k (to 100k), $5.60 (100k–500k), $4.20 (500k–1M), $2.10 (1M–5M), $0.53 (5M+) — [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing).
- **[documented]** **Maps SDK** (the mobile Android/iOS map SDK) and **Embed** both have an **Unlimited** free cap on the same price list; Dynamic Maps is the separate web/JavaScript dynamic-map SKU — same page.
- **[documented]** Routes: Compute Routes Essentials free cap 10,000; $5.00/1k (to 100k), $4.00 (100k–500k), $3.00 (500k–1M), $1.50 (1M–5M), $0.38 (5M+) — same page.
- **[documented]** Geocoding free cap 10,000; $5.00/1k (to 100k), $4.00 (100k–500k), $3.00 (500k–1M), $1.50 (1M–5M), $0.38 (5M+) — same page.
- **[documented]** Places Autocomplete Requests free cap 10,000; $2.83/1k (to 100k), $2.27 (100k–500k), $1.70 (500k–1M), $0.85 (1M–5M), $0.21 (5M+). Autocomplete Session Usage is unlimited/free when paired with Place Details — same page.
- **[documented]** Navigation SDK "Navigation Request": free cap **1,000**; $25.00/1k (to 100k), $20.00 (100k–500k), $15.00 (500k–1M), $8.00 (1M–5M), $2.00 (5M+) — same page.
- **[documented]** Places API (New) Place Details Essentials free cap 10,000; $5.00/1k; Text Search Pro $32/1k — same page.
- **[documented]** Google's Navigation SDK country table lists **PS Palestine**: Traffic Layer `—` (not available / low quality), Driving Directions `⬤` (good quality), Walking Directions `⬤`, Real-Time Disruptions `—` — [Navigation SDK country and region coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk), last updated 2026-10-20.
- **[documented]** Google Maps Platform Service Specific Terms, last modified **2026-10-28**: Routes API §19.2, Geocoding §6.2, Places §14.2, Navigation SDK §12.2 all state the customer "must not use Google Maps Content ... in conjunction with a non-Google map" — [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms).
- **[documented]** Geocoding lat/lng may be cached at most 30 consecutive days; formatted/structured address may be cached indefinitely only for direct end-user functionality of the app that made the request, not as a substitute for new calls and not shared across users — same terms, §6.3.
- **[documented]** Google's Navigation SDK is an Android/iOS SDK; the policies page addresses Android and iOS app implementations, not React Native — [Navigation SDK Android policies](https://developers.google.com/maps/documentation/navigation/android-sdk/policies), last updated 2026-10-20.

### Inferences
- Google's free tier is per SKU, so a small launch can stay near $0 only if routes, geocoding and autocomplete each stay under 10k/month (map display via the mobile Maps SDK is unlimited free). At 100 drivers (22k trips) routes alone are already 66k/month, so Google is not free at any real launch.
- The "no non-Google map" clause is the single biggest hidden constraint: choosing Google Routes forces a Google basemap (mobile Maps SDK or Dynamic Maps). You cannot keep OpenFreeMap tiles to save money while buying Google routing. The mobile Maps SDK is free, so this is a lock-in cost, not necessarily a dollar cost.
- Google's own table says Palestine has **no traffic layer**, so Google's traffic-aware ETA premium is not deliverable in the West Bank. Driving directions are good quality, which is why Google still routes there.

### Gaps
- Google's general Maps JavaScript/Routes coverage page may differ from the Navigation SDK table; only the Navigation SDK table was found with an explicit PS row.
- No public Google document was found that models West Bank checkpoints or closures. The 7amleh NGO analysis (below) says Google does not.
- Whether Google bills Navigation SDK per trip, per session or per request is not explicit in the SKU name; the $25/1k "Navigation Request" needs confirmation with Google before modeling.

---

## 2. Mapbox: free tier, MAU/request pricing, Navigation SDK for RN, coverage

### Takeaway
Mapbox is the cheapest credible commercial bundle at small scale: 25,000 mobile MAU free, 100,000 Directions requests free, 100,000 temporary geocoding requests free. At 100 drivers the bill can be $0. At 10,000 drivers it is roughly $10.4k/month before Navigation SDK trip fees. But Mapbox's geocoding coverage table has **no Palestine row** (Israel only), and its Navigation SDK for React Native is a community alpha, not an official product.

### Cited Findings
- **[documented]** Maps SDKs for Mobile: up to 25,000 MAU free; 25,001–125,000 at $4.00/1k MAU; 125,001–250,000 at $3.20/1k; 250,001+ at $2.40/1k — [Mapbox pricing](https://www.mapbox.com/pricing#mapsmaus).
- **[documented]** Directions API: up to 100,000 requests/month free; 100,001–500,000 at $2.00/1k; 500,001–1,000,000 at $1.60/1k; 1,000,001+ at $1.20/1k — same page.
- **[documented]** Temporary Geocoding API: up to 100,000 requests/month free; 100,001–500,000 at $0.75/1k; 500,001–1,000,000 at $0.60/1k; 1,000,001+ at $0.45/1k — same page.
- **[documented]** Permanent Geocoding API (results may be stored indefinitely): 1–500,000 at **$5.00/1k**, then $4.00/1k, then contact sales. Requires a valid credit card or enterprise contract — [Mapbox Geocoding API docs](https://docs.mapbox.com/api/search/geocoding/); [Mapbox pricing](https://www.mapbox.com/pricing).
- **[documented]** Temporary geocoding results "are not allowed to be cached"; permanent results are. Autocomplete counts every keystroke as one request unless the app debounces — [Mapbox Geocoding API docs](https://docs.mapbox.com/api/search/geocoding/).
- **[documented]** Navigation SDK v3.x: up to 100 MAU free, then $0.30/MAU; active guidance trips up to 1,000 free, then $0.08/trip (1,001–50k), $0.064 (50k–100k), $0.048 (100k–200k), 200k+ contact sales — [Mapbox pricing](https://www.mapbox.com/pricing#navigation).
- **[documented]** Mapbox geocoding/search coverage table lists **Israel (IL)** with region ● and place ● but **no Palestine/PS row**; the page itself warns that some data are available at city level and "do not appear in this list" — [Mapbox data coverage and quality](https://docs.mapbox.com/help/dive-deeper/mapbox-data/).
- **[documented]** Mapbox published 50 cm Israel and Palestine satellite imagery in 2021 — imagery only, not routing or address data — [Mapbox blog](https://www.mapbox.com/blog/new-israel-palestine-imagery).
- **[documented]** `@rnmapbox/maps` is "a community-supported, open-source React Native library" wrapping the Mapbox iOS/Android SDKs; Mapbox does not ship it as an official first-party RN SDK. Turn-by-turn is provided by `@rnmapbox/navigation` (alpha), built on top of the maps library — [rnmapbox/maps README](https://github.com/rnmapbox/maps).
- **[documented]** `@rnmapbox/maps` is not available in Expo Go; it needs a custom dev client / development build — same README.

### Inferences
- Mapbox's MAU model is friendly to a driver-heavy app but punishes consumer scale: at 210k total MAU the maps line is only $672/month, while 6.6M Directions calls cost $8,320/month.
- Mapbox's Navigation SDK is economically unusable for ride-hailing at volume if billed per trip: 200k trips already cost about $12,000 in trip fees; 2.2M trips would be roughly $111k/month if the $0.048 rate held (extrapolation; 200k+ is contact-sales).
- Because the geocoding coverage table omits Palestine, Mapbox address-level geocoding in the West Bank should be treated as unproven until tested with a key. City/place search may work; street addresses likely do not.
- Storing customer addresses for dispatch requires Permanent Geocoding at $5/1k, not the free temporary tier. That is a real hidden cost at 100k+ trips.

### Gaps
- No Mapbox public page states Palestine street-address coverage explicitly; the absence of a PS row is evidence of omission, not proof of zero coverage.
- Whether Mapbox Directions may be used with a non-Mapbox basemap is not addressed here; Mapbox's terms were not reviewed for that clause.
- Mapbox traffic/ETA quality in the West Bank is undocumented. No public coverage table was found.

---

## 3. HERE, TomTom, Apple MapKit, Azure Maps, MapTiler, Stadia, Geoapify, LocationIQ

### Takeaway
Most second-tier providers are cheaper than Google per request, but only TomTom was found publicly naming Israel in a real-time traffic expansion (not Palestine), and only Esri's StreetMap Premium commercial coverage table explicitly rates the West Bank (Level 1 geocoding, local roads, **fixed speeds**, i.e. no live traffic). The cheapest credible paid geocoders are Geoapify (3,000 credits/day free, commercial use allowed) and LocationIQ ($45–$100/month). MapTiler and Stadia are tile-first and become expensive at map-session scale.

### Cited Findings
- **[unverified]** HERE list pricing via Gold Partner Placematic, updated August 2026: Geocoding 30,000 free/month then **$0.88/1k** (to 5M), $0.70/1k (5–10M); Maps 30,000 free/month, vector from $0.088/1k at high volume; Routing 5,000 free/month, volume-tiered; Matrix 2,500 free; Traffic included in Base free tier; HERE raised Base Plan/pay-per-transaction prices ~6% from 2026-04-01 — [Placematic HERE pricing](https://placematic.com/here-location-services/here-pricing/). HERE's own pricing page is a JavaScript app and returned only navigation chrome when fetched — [HERE pricing](https://www.here.com/get-started/pricing).
- **[documented]** TomTom free monthly requests per API (no credit card): Map Display vector tiles 200k, raster tiles 200k, Routing 20k, Matrix 2.5k, Geocoding 20k, Reverse Geocoding 20k, Places Suggest 10k, Places Details 5k, Traffic Incidents 2.5k, Traffic Flow vector tiles 200k — [TomTom pricing](https://docs.tomtom.com/pricing/).
- **[documented]** TomTom paid unit rates are behind "Pricing details" toggles on the same page and were not rendered in the fetched text; only free tiers are confirmed. This is a gap, not a price.
- **[documented]** TomTom added traffic coverage for Israel in 2017, extending TomTom Traffic to 64 countries; the release names Israel, not Palestine/West Bank — [TomTom press release, 2017-06-20](https://www.tomtom.com/newsroom/press-releases/general/19876/tomtom-expands-its-global-traffic-footprint-to-64-countries/).
- **[documented]** Apple MapKit JS free daily limit: **250,000 map views and 25,000 service calls per Apple Developer Program membership**; Snapshots 25,000 unique requests/day. Additional capacity is contact-sales — [Apple Maps on the Web](https://developer.apple.com/maps/web/).
- **[unverified]** Apple Developer Program membership is required to use MapKit JS; the current annual fee was not re-fetched in this pass — [Apple Developer Program](https://developer.apple.com/programs/).
- **[documented]** Azure Maps Gen2 free monthly transactions: Base Map Tiles 5,000; Imagery Tiles 1,000; Traffic Tiles 5,000; Static Map Images 1,000; Search 5,000; Routing 1,000; Traffic 1,000. One base-map transaction = 15 tile requests; one routing transaction = 4 matrix cells; one search autocomplete transaction = 10 autocomplete requests — [Azure Maps pricing](https://azure.microsoft.com/en-us/pricing/details/azure-maps/).
- **[documented]** Azure Maps paid per-1k rates did not render in the fetched page (`$-` placeholders); only free tiers are confirmed. Gap.
- **[observed, parent session]** Azure Maps was live-tested for this project: partial West Bank data, no traffic, no checkpoint/landmark geocoding. Not re-run in this pass.
- **[documented]** MapTiler Free: $0, 5,000 map sessions/month, 1,000 search sessions, 100k API requests, non-commercial use only, MapTiler logo required. Flex: **$30/month**, 25,000 sessions, 3,000 search sessions, 500k API requests, commercial use; extra sessions **$2.50/1k**, extra API requests **$0.15/1k** — [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/).
- **[documented]** Stadia Maps Free: $0, 200,000 credits/month, no commercial use; Starter **$20/month**, 1,000,000 credits, +$0.03/1k extra; Standard $80/7.5M; Professional $250/25M. Vector/raster tile = 1 credit; forward/reverse geocoding = 20 credits; standard routing = 20 credits; traffic-influenced routing = 60 credits — [Stadia Maps pricing](https://stadiamaps.com/pricing/).
- **[documented]** Geoapify Free: **3,000 credits/day**, commercial use allowed, up to 5 req/s; API 10 **$59/month** for 10,000 credits/day; API 25 $109; API 50 $179; API 100 **$299/month** for 100,000 credits/day; custom from $860/month — [Geoapify pricing](https://www.geoapify.com/pricing/).
- **[documented]** LocationIQ Free: **5,000 requests/day**, 2 req/s, commercial use allowed with a prominent backlink; Maps Lite **$45/month** (maps only, no routing), Developer **$100/month** 25,000 req/day, Startup **$200/month** 60,000 req/day, Growth Plus **$500/month** 7.5M req/month, Business Plus **$950/month** 30M req/month — [LocationIQ pricing](https://locationiq.com/pricing).
- **[documented]** LocationIQ free-tier caching is limited to 48 hours; paid customers may cache for the life of the account. No server-side caching of map tiles — same page.

### Inferences
- For pure geocoding at 100–1,000 drivers, Geoapify's 90k credits/month free tier covers a 22k-trip launch (66k routes + 22k geocodes + 7k autocomplete = ~95k, just over), so the first paid dollar is $59/month. LocationIQ's $45 Maps Lite does not include routing, so its real entry point for a ride-hailing app is $100/month.
- MapTiler's $2.50/1k sessions makes it a poor fit for a high-session consumer app: 4.4M sessions at 10k drivers would be ~$10,970/month, before API requests.
- Stadia's credit system is transparent but routing-heavy workloads burn credits fast: at 20 credits per route, 6.6M routes = 132M credits, far beyond the $250 Professional plan.
- Apple's free tier is generous for map views but MapKit JS is web-only; there is no native Android MapKit, and no evidence of Palestine turn-by-turn coverage. It is not a credible primary stack for a cross-platform RN app.
- MapTiler, Stadia, Geoapify and LocationIQ are OSM-derived; their Palestine coverage therefore inherits OSM's completeness rather than a vendor-curated Palestinian address database. None of the four publishes a Palestine-specific coverage table (inference from their OSM basis; not directly documented on their pricing pages).

### Gaps
- HERE's official list prices and free-tier limits could not be read from HERE's own site; the Placematic numbers are a partner's summary and should be treated as unverified until a quote.
- TomTom's per-1k paid rates were not retrieved; the free tiers are documented but the marginal cost at 10k drivers is unknown.
- Azure's paid per-1k rates were not rendered; the free tiers are documented but the marginal cost is unknown.
- Apple MapKit coverage/routing quality in Palestine was not tested or documented; no public PS coverage table was found.

---

## 4. Palestine/West Bank coverage evidence by provider

### Takeaway
Coverage is not binary. Google has good driving directions but no traffic layer. Mapbox's geocoding coverage table omits Palestine entirely. Esri's StreetMap Premium commercial table (a separate dataset; its upstream provider is not named on that page) rates the West Bank Level 1 for geocoding and local roads, but only **fixed speeds** — no live or historical traffic. Gaza is much worse: Level 4, major roads only, fixed speeds, no trucking restrictions.

### Cited Findings
- **[documented]** Google Navigation SDK PS row: Traffic `—`, Driving `⬤`, Walking `⬤`, Two-wheel `—`, Biking `—`, Speed limits `—`, Traffic lights `—`, Real-time disruptions `—` — [Google coverage table](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk).
- **[documented]** Mapbox geocoding/search coverage table includes Israel (IL: region ●, place ●) but no Palestine row — [Mapbox data coverage](https://docs.mapbox.com/help/dive-deeper/mapbox-data/).
- **[documented]** Esri StreetMap Premium coverage: **Palestine (West Bank) XXW — Geocoding Level 1, Local Roads, Speed Data Source "Fixed Speeds", Trucking Restrictions Yes**; **Palestine (Gaza Strip) XXG — Level 4, Major Roads, Fixed Speeds, Trucking Restrictions No** — [Esri StreetMap Premium product coverage](https://doc.arcgis.com/en/streetmap-premium/latest/coverage/product-coverage.htm).
- **[documented]** Esri defines "Fixed Speeds" as "static travel times derived from historical average speeds"; "Live Traffic" and "Predictive Traffic" are separate, higher tiers — same page, legend.
- **[documented]** 7amleh's "Mapping Segregation" analysis of Google Maps, Waze and Maps.me: on Ramallah→Nablus Google routes through Israel and takes ~4.5 hours versus ~45 minutes through the West Bank; Ramallah→Bethlehem routes through Jerusalem, inaccessible to West Bank ID holders; Google shows "This route has restricted usage or private roads" and "This route may cross country borders"; Google cannot calculate routes in some Palestinian rural communities or to/from Gaza; Google does not mark checkpoints or settlements — [7amleh, Mapping Segregation, Route Planning](https://7amleh.org/ms/pln.html). The page is undated; treat as documented NGO analysis, possibly pre-2020, and re-test before relying on it.
- **[documented]** 7amleh: Maps.me marks checkpoints but routes through them without regard to green-ID restrictions; Waze works in Israel and Area C, stops directions at Qalandiya for Ramallah, and requires disabling "avoid high-risk areas" to enter Palestinian cities — same page.
- **[documented]** Al Jazeera (2026-09-28) reports Israel maintains roughly 300 checkpoints in the West Bank that cut off or restrict access between towns and main roads — [Al Jazeera](https://www.aljazeera.com/news/2026/9/28/mapping-israels-300-checkpoints-where-they-are-and-how-they-work).
- **[observed]** OSRM demo route Ramallah (31.9038, 35.2034) → Nablus (32.2211, 35.2544): 53.5 km, 61.8 min, with a single unnamed 36.66 km segment forming ~69% of the route. The response has no checkpoint, closure, permit or traffic attributes — [OSRM demo server](https://router.project-osrm.org/route/v1/driving/35.2034,31.9038;35.2544,32.2211?overview=false&steps=true), tested 2026-10-29.

### Inferences
- The West Bank is a **Level 1 road network with Level 0 traffic** in commercial data: good local roads, static speeds. That is exactly the profile of a market where a self-hosted router with a custom speed model can compete, because nobody is selling live speeds.
- Google's good driving directions plus no traffic means Google is best used as a fallback/deep-link for addresses and intercity routing, not as the ETA engine.
- The 7amleh findings and the OSRM test agree on the core defect: routers optimize the road graph, not the permit regime. A West Bank product must add its own checkpoint/closure costs to the graph.
- Esri's West Bank Level 1 / Gaza Level 4 split is consistent with the observed Azure "partial West Bank, no Gaza" behavior and should temper expectations for any commercial Middle East dataset.

### Gaps
- No provider publishes a Palestine-specific routing quality metric (e.g., % of addresses geocoded to rooftop, ETA error vs ground truth).
- HERE's own coverage page for Palestine was not retrievable; Esri is a proxy, not HERE's own statement.
- Mapbox routing/ETA quality in the West Bank is undocumented; only geocoding coverage omission is documented.
- Apple Maps coverage in Palestine is undocumented in this pass.

---

## 5. Traffic: who actually has real-time West Bank traffic

### Takeaway
Nobody documents real-time West Bank traffic. Google explicitly marks Palestine's traffic layer and real-time disruptions as unavailable. Esri's commercial West Bank data is fixed speeds only. TomTom's public traffic expansion names Israel, not Palestine. Mapbox sells "traffic- and incident-aware" Directions globally but publishes no Palestine traffic coverage statement. So "traffic-aware ETA" in the West Bank is currently a marketing claim, not a verified product.

### Cited Findings
- **[documented]** Google Navigation SDK PS: Traffic Layer `—`, Real-Time Disruptions `—` — [Google coverage table](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk).
- **[documented]** Esri StreetMap Premium West Bank: Speed Data Source "Fixed Speeds"; only Israel (ISR) is listed with "Historical Traffic" in the same region — [Esri coverage](https://doc.arcgis.com/en/streetmap-premium/latest/coverage/product-coverage.htm).
- **[documented]** TomTom Traffic expanded to Israel in 2017 as part of 64-country coverage; Palestine is not named — [TomTom press release](https://www.tomtom.com/newsroom/press-releases/general/19876/tomtom-expands-its-global-traffic-footprint-to-64-countries/).
- **[documented]** Mapbox Directions API is described as "a single request for a traffic- and incident-aware route for driving, walking, or cycling" — [Mapbox pricing](https://www.mapbox.com/pricing#navigation). No Palestine-specific traffic coverage claim was found.
- **[documented]** HERE's traffic product is marketed as real-time and historical, but no Palestine coverage statement was found — [HERE pricing (partner summary)](https://placematic.com/here-location-services/here-pricing/); [HERE traffic maps](https://placematic.com/here-location-services/traffic-maps/).
- **[observed]** OSRM response contains no traffic field at all; OSRM is a pure OSM router — [OSRM backend README](https://github.com/Project-OSRM/osrm-backend); test above.

### Inferences
- "Traffic-aware ETA" from Google/Mapbox/TomTom cannot be assumed to work in the West Bank. At best it will fall back to free-flow or historical speeds; at worst it will route around congestion that does not exist or miss a checkpoint queue that does.
- The only real-time signal available to a Palestinian ride-hailing app is its own drivers' GPS traces plus user-reported checkpoint delays. That is an operational data asset, not an API purchase.
- Because no vendor sells West Bank traffic, paying for a premium traffic SKU is pure waste at launch. Revisit only if a vendor publishes a PS traffic row or if you can buy a local probe dataset.

### Gaps
- No provider publishes West Bank traffic probe density, update frequency or ETA accuracy.
- Google Maps consumer app may show traffic in some West Bank cities even though the Navigation SDK table says `—`; the two products are not the same. This was not tested.
- TomTom's "Israel" traffic coverage may include West Bank roads in practice; no documentation confirms or denies it.

---

## 6. Checkpoints, closures, permit roads and settlement bypasses

### Takeaway
No mainstream provider models West Bank checkpoints, closures, permit-only roads or settlement bypasses. Google, Waze and Maps.me all fail to account for movement restrictions according to 7amleh; Maps.me marks checkpoints but routes through them. OSM contains checkpoint nodes, but OSRM ignores them unless they are tagged as barriers and even then cannot model dynamic opening/closing or permit class. This is the gap a local product must own.

### Cited Findings
- **[documented]** 7amleh: "None of the three route-planning apps analysed mark Israeli settlements as being illegal ... Maps.me is the only service that marks checkpoints on its maps, but it does not take them into consideration when planning routes and navigating users. All three services ... fail to take into account the movement restrictions and repercussions for Palestinians when planning routes." — [7amleh](https://7amleh.org/ms/pln.html).
- **[documented]** 7amleh: 79 km of "sterile" roads are accessible only to blue-ID holders/yellow plates; 155 km of road have restricted access for West Bank Palestinians and often require permits — same page.
- **[documented]** Al Jazeera 2026-09-28: ~300 checkpoints cut off or restrict access between West Bank towns and main roads — [Al Jazeera](https://www.aljazeera.com/news/2026/9/28/mapping-israels-300-checkpoints-where-they-are-and-how-they-work).
- **[observed]** OSM/Nominatim has a "Huwara checkpoint" way (32.15238, 35.26302) and Photon has a "Huwara checkpoint" street in Oudalah/Area B; OSM also has "Kalandia checkpoint Parking" as a bus stop. These are mapping artifacts, not a routable closure model — tests below.
- **[observed]** OSRM Ramallah→Nablus route passes through a single 36.66 km unnamed segment with no checkpoint/closure annotation; OSRM has no concept of permit class or dynamic closure — [OSRM test](https://router.project-osrm.org/route/v1/driving/35.2034,31.9038;35.2544,32.2211?overview=false&steps=true).
- **[documented]** OSRM's feature list is Nearest, Route, Table, Match, Trip, Tile; no traffic, closures or permit profiles — [OSRM README](https://github.com/Project-OSRM/osrm-backend).

### Inferences
- A West Bank router needs a custom edge cost layer: checkpoint penalty (queue minutes by time of day), closure flag (driver-reported or OCHA/B'Tselem feed), permit road flag (green-ID vs yellow-plate), and settlement bypass avoidance. None of this comes from an API.
- OSM checkpoint nodes are useful as a seed dataset but are incomplete and inconsistently named; they need manual curation and Arabic/English aliases.
- Because checkpoints change dynamically, a static graph is insufficient. The cheapest credible design is OSRM/Valhalla for the base route plus a live penalty service that re-ranks alternatives and a driver-report loop.

### Gaps
- No provider documentation was found that claims checkpoint/closure/permit-road routing. That is a negative finding, not a proven absence across every vendor.
- OCHA oPt and B'Tselem publish movement-restriction datasets, but their licenses and update cadence were not verified in this pass.
- No public ETA benchmark exists for checkpoint queue times.

---

## 7. Geocoding quality: city vs street vs landmark/checkpoint (Qalandia/Huwwara test)

### Takeaway
OSM-based geocoding is usable for city/street names but unreliable for checkpoint landmarks. In a live test, Nominatim returned **zero** results for "Qalandia checkpoint" while Photon returned a **bus-stop parking** named "Kalandia checkpoint Parking", not the crossing. Nominatim returned the correct Huwwara checkpoint; Photon returned a street plus a false positive in Peru. Any product that lets users type "Qalandia" or "Huwwara" needs an alias table and a POI fallback.

### Cited Findings
- **[observed]** Nominatim `q=Qalandia checkpoint`, `format=jsonv2`, `limit=3`, English: `[]` (no result) — `https://nominatim.openstreetmap.org/search?q=Qalandia%20checkpoint&format=jsonv2&limit=3&accept-language=en`, 2026-10-29.
- **[observed]** Nominatim `q=Huwwara checkpoint`: one result, OSM way 1558544813, `highway=secondary`, name "Huwara checkpoint", 32.1523801, 35.2630248, display "Huwara checkpoint, Huwara, Area C, Judea and Samaria, Palestinian Territories" — same endpoint, 2026-10-29.
- **[observed]** Photon `q=Qalandia checkpoint`: one result, OSM node 5210694964, `highway=bus_stop`, name "Kalandia checkpoint Parking", district "Qalandiya Refugee Camp", countrycode PS, 35.228509, 31.862611 — `https://photon.komoot.io/api/?q=Qalandia%20checkpoint&limit=3&lang=en`, 2026-10-29.
- **[observed]** Photon `q=Huwwara checkpoint`: first result is a `highway=secondary` street named "Huwara checkpoint" in Oudalah/Area B, 35.2762828, 32.1568887; second result is a false positive "Checkpoint mirador huaraca uro" in Peru — same endpoint, 2026-10-29.
- **[observed]** Nominatim labels the area "Judea and Samaria, Palestinian Territories" while Photon labels it "West Bank" or "Area B/C"; the same place has inconsistent administrative naming across OSM tools — tests above.
- **[documented]** Mapbox geocoding has no Palestine row in its coverage table; Israel is present — [Mapbox data coverage](https://docs.mapbox.com/help/dive-deeper/mapbox-data/).
- **[documented]** 7amleh: Google cannot calculate routes within some Palestinian rural communities and displays "Sorry, we could not calculate driving/walking directions"; settlement names and checkpoints are not highlighted — [7amleh](https://7amleh.org/ms/pln.html).

### Inferences
- City-level geocoding ("Ramallah", "Nablus", "Hebron") is safe on OSM. Street-level geocoding is likely good in dense cities but not verified. Landmark/checkpoint geocoding is unsafe without curation.
- Two OSM geocoders disagree on the same query, which means a single geocoder is not enough. A production app should query both Photon (fuzzy/autocomplete) and Nominatim (exact) and merge, or curate its own landmark table.
- The spelling gap ("Qalandia" vs "Kalandia" vs "Qalandiya") is the immediate failure mode. An alias table with Arabic names is mandatory for a Palestinian UX.
- Google/Mapbox may geocode "Qalandia" better than OSM, but this was not tested because no API key was available. Do not assume.

### Gaps
- No API key was available to test Google, Mapbox, HERE or TomTom geocoding for Qalandia/Huwwara. Their relative quality is unverified.
- No public benchmark of Palestinian address geocoding accuracy was found.
- The OSM tests used public demo endpoints with fair-use limits; results may differ from a self-hosted Photon/Nominatim with a full West Bank extract.

---

## 8. React Native support

### Takeaway
MapLibre has an official MIT-licensed React Native library supporting Expo and bare RN. Mapbox's RN library is community-supported, and its turn-by-turn navigation library is alpha. Google has no official React Native Navigation SDK; you either wrap the native Android/iOS SDKs yourself or use the Google Maps app via a deep link. This shifts engineering cost toward MapLibre for a small team.

### Cited Findings
- **[documented]** MapLibre React Native: "Interactive vector tile maps with MapLibre Native in Expo and React Native supporting Android & iOS", MIT license, originated as a fork of rnmapbox — [maplibre-react-native](https://github.com/maplibre/maplibre-react-native).
- **[documented]** `@rnmapbox/maps` is community-supported and not available in Expo Go; turn-by-turn is `@rnmapbox/navigation` (alpha), works with Expo development builds — [rnmapbox/maps README](https://github.com/rnmapbox/maps).
- **[documented]** Google Navigation SDK policies are written for Android and iOS apps; no React Native guide or first-party RN package was found — [Google Navigation SDK Android policies](https://developers.google.com/maps/documentation/navigation/android-sdk/policies).
- **[documented]** Mapbox Navigation SDK pricing is per MAU plus per active guidance trip, which applies regardless of whether you use the native SDK or the RN wrapper — [Mapbox pricing](https://www.mapbox.com/pricing#navigation).
- **[documented]** OpenFreeMap works with MapLibre and requires attribution; commercial use allowed; no API key — [OpenFreeMap](https://openfreemap.org/).

### Inferences
- MapLibre RN is the lowest-risk rendering choice for an Expo app: official, MIT, no per-MAU fee, works with OpenFreeMap/Protomaps.
- Mapbox RN is viable for maps but risky for navigation: community maintenance, alpha nav, Expo dev build required, plus per-trip fees.
- Google RN would require writing a native module bridge or using `react-native-maps` for display plus a separate native Navigation SDK integration. That is real engineering cost, not just API spend.
- If turn-by-turn is a launch requirement, budget for native work regardless of vendor; the cheapest path is a MapLibre map plus voice prompts from OSRM/Valhalla maneuvers, not a paid nav SDK.

### Gaps
- `react-native-maps` Google Maps provider support in Expo was not verified in this pass.
- No benchmark of MapLibre RN performance on low-end Android devices common in Palestine was found.
- No evidence on whether Mapbox's RN navigation alpha is production-ready.

---

## 9. Open-source/self-hosted stack: licenses, quality, traffic, ETA, hosting

### Takeaway
OSRM (BSD-2-Clause) and Valhalla (MIT) are free, run on OSM data, and can serve West Bank routes on a €6/month VPS. Neither has traffic or checkpoint semantics out of the box; Valhalla has historical-traffic and live-incident modules, OSRM does not. OpenFreeMap tiles are free with no request limits but no SLA. The cheapest reliable host is Hetzner (€5.99–€8.99/month, 20 TB traffic included); Oracle Always Free is $0 but can reclaim idle instances and has limited ARM capacity.

### Cited Findings
- **[documented]** OSRM: "High performance routing engine written in C++ designed to run on OpenStreetMap data"; services Nearest, Route, Table, Match, Trip, Tile; BSD-2-Clause license — [OSRM README](https://github.com/Project-OSRM/osrm-backend).
- **[documented]** Valhalla: "open source routing engine ... for use with OpenStreetMap data"; includes matrix, isochrones, elevation, map matching, tour optimization; MIT license — [Valhalla docs](https://valhalla.github.io/valhalla/).
- **[documented]** Valhalla docs include modules for "Historical traffic" and "Live traffic incidents" — [Valhalla docs home](https://valhalla.github.io/valhalla/) (navigation lists both pages).
- **[documented]** OpenFreeMap: public instance "completely free: there are no limits on the number of map views or requests", no registration/API key/cookies; commercial use allowed; MIT license; no SLA or personalized support; offline downloads capped at 3,000 tiles or 50 MB per download, max 4 parallel requests, unique User-Agent — [OpenFreeMap](https://openfreemap.org/).
- **[documented]** Hetzner Cost-Optimized: CX23 2 vCPU/4 GB/40 GB NVMe **€5.99/month**, CAX11 2 vCPU/4 GB **€6.49**, CX33 4 vCPU/8 GB **€8.99**, CX53 16 vCPU/32 GB **€29.99**; 20 TB traffic included in EU locations; CX23 marked "currently not available" at fetch time — [Hetzner Cost-Optimized](https://www.hetzner.com/cloud/cost-optimized/).
- **[documented]** Oracle Always Free: 2 OCPU Ampere A1 + 12 GB RAM total (1,500 OCPU-hours + 9,000 GB-hours/month), 200 GB block volume, 10 TB outbound/month. Oracle may reclaim instances it deems idle if, over 7 days, 95th-percentile CPU <20%, network <20%, and memory <20%; "out of host capacity" errors are possible — [Oracle Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
- **[documented]** Fly.io has no free tier; smallest always-on `shared-cpu-1x` 256 MB is **$2.19/month**, 512 MB $3.69, 1 GB $6.70; outbound $0.02/GB in North America/Europe — [Fly.io pricing](https://fly.io/docs/about/pricing/).
- **[documented]** GraphHopper Directions API: Free 500 credits/day, non-commercial only; Basic €69/month 5,000 credits/day; Standard €199/month 15,000/day; Premium €479/month 50,000/day; SLA 99.5% on paid plans — [GraphHopper pricing](https://www.graphhopper.com/pricing/).
- **[documented]** Stadia Maps offers traffic-influenced routing at 60 credits/request (premium 120), versus 20 for standard routing — [Stadia pricing](https://stadiamaps.com/pricing/).
- **[unverified]** Photon is an OSM-based geocoder from Komoot; the public instance was used in the tests above, but its license/self-host terms were not re-verified in this pass — [Photon](https://photon.komoot.io/).
- **[unverified]** Nominatim is the OSMF geocoder; public usage policy is rate-limited and not for heavy production use, but the policy page was not fetched in this pass — [Nominatim](https://nominatim.openstreetmap.org/).

### Inferences
- A West Bank OSRM graph is small relative to a planet graph, so a 2 vCPU/4 GB VPS is enough for launch. The constraint is not graph size but peak request concurrency and update cadence.
- OSRM is simpler and faster for A-to-B and matrix; Valhalla is the better choice if you want historical traffic, live incidents, isochrones and alternative routes in one engine. For a ride-hailing MVP, OSRM + custom penalties is enough; Valhalla becomes attractive when you add time-of-day speeds.
- OpenFreeMap removes tile bandwidth from the cost model entirely, but it is a donation-funded public service with no SLA. For production, mirror the tiles or self-host PMTiles on Hetzner's 20 TB included traffic.
- Oracle Always Free is not production-safe for a live dispatch service: idle reclamation and ARM capacity errors can take the router offline. Use it for staging, not production.
- GraphHopper's free API is non-commercial; the paid Basic plan at €69/month for 5k credits/day is more expensive than Geoapify for geocoding-heavy workloads.

### Gaps
- Photon and Nominatim self-host licenses and public usage policies were not re-verified; confirm before production.
- Protomaps pricing/licensing was not verified in this pass.
- No benchmark of OSRM vs Valhalla ETA accuracy in the West Bank was found.
- No evidence on how often OSM West Bank data is updated or how complete checkpoint tagging is.

---

## 10. Total cost at 100 / 1,000 / 10,000 drivers

### Takeaway
Using a consistent trip model (220 trips/driver/month, 3 route calls/trip, 1 geocode + 0.3 autocomplete/trip, 2 map loads/trip, 21 total MAU per driver), the monthly bill is roughly: **100 drivers — Google $340, Mapbox $0, self-host ~$6.50**; **1,000 drivers — Google $3,778, Mapbox $1,236, self-host ~$69**; **10,000 drivers — Google $18,720, Mapbox $10,429, self-host ~$400**. This assumes Google mobile **Maps SDK** (unlimited free) rather than Dynamic Maps; if the app renders Google maps through a WebView/JavaScript API, add $238 / $2,534 / $12,110 respectively. Mapbox is cheapest commercial at small scale; self-host is roughly 45–55× cheaper than Google and 18–26× cheaper than Mapbox at 1k–10k drivers. Google's number excludes Navigation SDK; adding it at 2.2M trips would add ~$17,600/month at the $8/1k tier.

### Assumptions (shown so they can be challenged)
- 220 trips per driver per month = 10 trips/day × 22 working days.
- 3 route calls per trip: 1 dispatch/matrix element + 1 pickup route + 1 trip route.
- 1 geocode + 0.3 autocomplete request per trip. Autocomplete is debounced; one search session per 3.3 trips.
- 2 map loads per trip (rider app + driver app).
- MAU = 1 driver + 20 riders per driver = 21 MAU per driver. This is a modeling assumption, not measured.
- No Navigation SDK, no traffic SKU (none is sold for Palestine), no static maps, no Places Details.
- EUR→USD at 1.08 (approximate; not a market quote).

### At the exact trip tiers requested (10k / 100k / 1M trips)
| Trips/month | Google (mobile Maps SDK) | Mapbox | Self-host |
|---|---:|---:|---:|
| 10,000 | $100 | $0 | ~$6.50 |
| 100,000 | $1,757 | $423 | ~$69 |
| 1,000,000 | $10,809 | $5,017 | ~$351 |

Derived from the same assumptions (3 routes/trip, 1 geocode + 0.3 autocomplete/trip, 2 map loads/trip, ~21 MAU per 220 trips). The 100k/1M rows use the same pricing tiers as the driver table below; they are interpolations, not vendor quotes.

### Google Maps Platform (calculated from [Google's price list](https://developers.google.com/maps/billing-and-pricing/pricing))
| Line | 100 drivers (22k trips) | 1,000 drivers (220k trips) | 10,000 drivers (2.2M trips) |
|---|---:|---:|---:|
| Maps SDK (mobile) | 44,000 loads → $0 (unlimited free) | 440,000 → $0 | 4,400,000 → $0 |
| Routes Essentials | 66,000 → $280 | 660,000 → $2,690 | 6,600,000 → $11,950 |
| Geocoding | 22,000 → $60 | 220,000 → $930 | 2,200,000 → $5,335 |
| Autocomplete | 6,600 → $0 | 66,000 → $158 | 660,000 → $1,435 |
| **Total (mobile Maps SDK)** | **$340** | **$3,778** | **$18,720** |
| If using Dynamic Maps (web/JS) instead of Maps SDK | add $238 → $578 | add $2,534 → $6,312 | add $12,110 → $30,830 |

### Mapbox (calculated from [Mapbox pricing](https://www.mapbox.com/pricing))
| Line | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---:|---:|---:|
| Maps SDK MAU | 2,100 → $0 | 21,000 → $0 | 210,000 → $672 |
| Directions | 66,000 → $0 | 660,000 → $1,096 | 6,600,000 → $8,320 |
| Temporary Geocoding + autocomplete | 28,600 → $0 | 286,000 → $140 | 2,860,000 → $1,437 |
| **Total** | **$0** | **$1,236** | **$10,429** |
| Navigation SDK add-on (if used) | 100 driver MAU × $0.30 + 22k trips (1,000 free + 21k × $0.08) ≈ $1,710 | 1,000 × $0.30 + 220k trips ≈ $13,180 | 10,000 × $0.30 + 2.2M trips ≈ $110,920 (trip rate extrapolated; 200k+ is contact-sales) |

### Self-hosted (Hetzner + OpenFreeMap + OSRM + Geoapify fallback)
| Line | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---:|---:|---:|
| Compute | CX23 €5.99 ≈ $6.50 | CX33 €8.99 ≈ $9.70 | 2× CX53 €59.98 ≈ $64.80 |
| Tiles | OpenFreeMap $0 | OpenFreeMap $0 | OpenFreeMap $0 or self-host PMTiles (included in 20 TB) |
| Routing | OSRM on same box $0 | OSRM on same box $0 | OSRM on same box $0 |
| Geocoding | Photon on same box $0 | Geoapify API 10 $59 | Geoapify API 100 $299 |
| Monitoring/backup | $0–10 | $10 | $30 |
| **Total** | **~$6.50** | **~$69** | **~$400** |

### Other providers (rough, from published tiers)
| Provider | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---:|---:|---:|
| TomTom | Free tiers cover ~6.6k trips (20k routes); 22k trips exceeds free routing by 46k → paid rate unknown | Paid rate unknown; free tier covers <10% of 660k routes | Paid rate unknown; free tier negligible |
| HERE | 5k routing free; 66k routes → paid, rate unknown | 660k routes → paid, rate unknown | 6.6M routes → paid, rate unknown |
| Geoapify | Free 3k/day ≈ 90k/mo; 95k requests just over → $59 | 953k requests → API 100 $299 (3M/mo) | 9.5M requests → custom from $860 |
| LocationIQ | 95k requests → free 5k/day = 150k/mo → $0 (2 req/s cap) | 953k → Startup $200 (60k/day = 1.8M/mo) | 9.5M → Business Plus $950 (30M/mo) |
| Stadia | 1.89M credits → Starter $20 + ~$27 = ~$47 | 18.9M credits → Professional $250 | 189M credits → custom |
| MapTiler | 44k sessions → Free plan non-commercial; Flex $30 + 19k×$2.50 = $77.50 | 440k sessions → $30 + 415k×$2.50 = $1,067.50 | 4.4M sessions → $30 + 4.375M×$2.50 = $10,967.50 |

### Inferences
- At 100 drivers, Mapbox's free tier is genuinely $0, but it requires a credit card and gives no Palestine address coverage; self-host costs about the price of two coffees and gives you control of the data.
- At 1,000 drivers, self-host is ~18× cheaper than Mapbox and ~55× cheaper than Google. At 10,000 drivers the gap is ~26× vs Mapbox and ~47× vs Google.
- Google's per-trip cost at 10,000 drivers is ~$0.0085 with mobile Maps SDK; that sounds cheap until you multiply by trips and compare with ~$0.00018/trip for self-host. The difference is ~$18k/month, which is real driver incentives or engineering headcount.
- Google's mobile Maps SDK being free narrows the gap to Mapbox at 10k drivers to ~1.8× (Google $18.7k vs Mapbox $10.4k); Mapbox remains cheaper, but the difference is no longer an order of magnitude. Both are still ~26–47× self-host.
- Mapbox's apparent cheapness at 100 drivers disappears at 10,000 because Directions and MAU both scale; Navigation SDK would make it the most expensive option by far.
- TomTom/HERE cannot be fully modeled without their paid rates, but both have free routing caps far below 22k trips, so they are not free at launch either.

### Gaps
- The MAU assumption (20 riders per driver) is not measured; if rider MAU is higher, Mapbox's MAU line grows and Google's map-load line grows proportionally.
- Route calls per trip could be 2 or 5 depending on dispatch design; the model uses 3.
- Tile bandwidth is assumed included/free; at 10k drivers, 4.4M sessions × ~1 MB ≈ 4.4 TB/month, which fits Hetzner's 20 TB but would cost ~$90/month on Fly.io at $0.02/GB.
- No vendor quote was obtained; all numbers are list-price calculations.

---

## 11. Hidden costs that appear at scale

### Takeaway
The sticker price is not the bill. The five hidden costs that matter most are: (1) Google's non-Google-map clause forces its basemap; (2) temporary geocoding cannot be cached, so dispatch must buy permanent geocoding; (3) Mapbox/Google Navigation SDKs charge per trip, which dwarfs map/route costs; (4) Mapbox counts re-installs as new MAU; (5) "traffic-aware" ETA buys nothing in Palestine because no traffic layer exists. Add engineering for RN native modules, checkpoint curation, and 24/7 ops.

### Cited Findings
- **[documented]** Google Routes/Geocoding/Places/Navigation SDK content must not be used with a non-Google map — [Google Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), §§6.2, 14.2, 19.2, 12.2.
- **[documented]** Google geocoding lat/lng cache max 30 days; indefinite address cache only for the requesting end-user's direct functionality, isolated per user — same terms §6.3.
- **[documented]** Mapbox temporary geocoding results cannot be cached; permanent geocoding costs $5/1k and requires a credit card — [Mapbox Geocoding docs](https://docs.mapbox.com/api/search/geocoding/); [Mapbox pricing](https://www.mapbox.com/pricing).
- **[documented]** Mapbox counts a re-install as an additional MAU because the SDK does not store personally identifying information; a single user is one MAU across upgrades only if the app is not deleted — [Mapbox Android Maps pricing guide](https://docs.mapbox.com/android/maps/guides/pricing/).
- **[documented]** Mapbox Navigation SDK bills per active guidance trip in addition to MAU: $0.08/trip at 1k–50k, falling to $0.048 at 100k–200k; 200k+ contact sales — [Mapbox pricing](https://www.mapbox.com/pricing#navigation).
- **[documented]** Google Navigation SDK "Navigation Request" is $25/1k at low volume, $8/1k at 1M–5M — [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing).
- **[documented]** Google Palestine traffic layer and real-time disruptions are `—` — [Google coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk).
- **[documented]** OpenFreeMap has no SLA and is donation-funded — [OpenFreeMap](https://openfreemap.org/).
- **[documented]** Oracle may reclaim idle Always Free instances — [Oracle docs](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
- **[documented]** rnmapbox is community-supported; navigation is alpha — [rnmapbox/maps](https://github.com/rnmapbox/maps).

### Inferences
- If Fastship keeps MapLibre/OpenFreeMap, it cannot legally use Google Routes or Geocoding. The "cheap hybrid" of free tiles + Google routing does not exist under Google's terms. That alone makes the self-host vs Google decision binary, not gradual.
- Caching rules turn geocoding into a recurring cost: every repeat address lookup must hit the API unless you pay for permanent storage or geocode once and store your own canonical address table (which Google's terms may restrict).
- Navigation SDK per-trip pricing is the largest hidden cost in ride-hailing. At 2.2M trips, Mapbox's published trip rates imply ~$111k/month; Google's Navigation Request at $8/1k implies ~$17.6k/month — both dwarf the map/route bill.
- The absence of Palestine traffic means a premium traffic SKU cannot improve ETA. The money is better spent on driver GPS traces and checkpoint reports.
- Community RN libraries and alpha navigation shift cost from API bill to engineering salary: native module maintenance, Expo dev builds, iOS/Android release cycles.
- OpenFreeMap's no-SLA model is acceptable for an MVP but not for a paid ride-hailing service with uptime promises; budget for a self-hosted tile mirror before launch.

### Gaps
- Google's exact enforcement of the non-Google-map clause for a mobile app that displays a MapLibre map but uses Google Routes server-side is a legal question; the terms say no, but enforcement practice was not researched.
- Mapbox's terms on using Directions with a non-Mapbox map were not reviewed.
- No data on Mapbox/Google geocoding accuracy in Palestine, so the quality-adjusted cost is unknown.
- No data on driver re-install rates, which would change Mapbox MAU cost.

---

## 12. Recommendation: cheapest credible combination that preserves Uber-quality basics

### Takeaway
Keep the self-hosted stack. The cheapest credible combination is **MapLibre React Native + OpenFreeMap (or self-hosted PMTiles) + OSRM (or Valhalla) + Photon/Nominatim + a curated checkpoint/closure layer + Geoapify free/paid fallback for geocoding**. Buy a commercial API only when you cross a specific threshold: address-level geocoding outside Palestinian cities, a turn-by-turn SDK requirement, or an SLA/enterprise contract. Do not buy Google or Mapbox "traffic" for Palestine; it does not exist.

### Cited Findings
- **[documented]** Google Palestine traffic layer and real-time disruptions are unavailable — [Google coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk).
- **[documented]** Esri StreetMap Premium West Bank speed data is "Fixed Speeds" (static speeds), not a live traffic feed — [Esri coverage](https://doc.arcgis.com/en/streetmap-premium/latest/coverage/product-coverage.htm).
- **[documented]** No provider documents checkpoint/closure routing; 7amleh found Google/Waze/Maps.me ignore movement restrictions — [7amleh](https://7amleh.org/ms/pln.html).
- **[documented]** MapLibre RN is official, MIT, Expo-compatible — [maplibre-react-native](https://github.com/maplibre/maplibre-react-native).
- **[documented]** OpenFreeMap is free, no request limits, commercial use allowed, MIT, no SLA — [OpenFreeMap](https://openfreemap.org/).
- **[documented]** OSRM is BSD-2-Clause and runs on OSM; no traffic/closure features — [OSRM](https://github.com/Project-OSRM/osrm-backend).
- **[documented]** Valhalla is MIT and has historical-traffic/live-incident modules — [Valhalla](https://valhalla.github.io/valhalla/).
- **[documented]** Hetzner CX23 is €5.99/month with 20 TB traffic; CX33 €8.99; CX53 €29.99 — [Hetzner](https://www.hetzner.com/cloud/cost-optimized/).
- **[documented]** Geoapify free 3,000 credits/day, commercial use allowed; API 10 $59/month — [Geoapify](https://www.geoapify.com/pricing/).
- **[documented]** Mapbox free tier is 25k MAU / 100k Directions / 100k temporary geocoding, and its geocoding coverage table omits Palestine — [Mapbox pricing](https://www.mapbox.com/pricing); [Mapbox coverage](https://docs.mapbox.com/help/dive-deeper/mapbox-data/).
- **[documented]** Google's non-Google-map clause prevents mixing Google routing with MapLibre — [Google terms](https://cloud.google.com/maps-platform/terms/maps-service-terms).

### Recommended stack and thresholds
1. **Rendering:** MapLibre RN + OpenFreeMap now. Mirror tiles to Hetzner/PMTiles when you have paying customers or >1M sessions/month. Cost: $0–$11/month.
2. **Routing/ETA:** OSRM on a CX33 (€8.99) with a custom cost layer for checkpoints, closures, permit roads and settlement bypasses. Move to Valhalla when you need historical time-of-day speeds or live incident tiles. Cost: €9–€30/month.
3. **Geocoding:** Photon + Nominatim self-hosted for city/street; Geoapify free 3k/day as fallback. Add a curated landmark table for Qalandia, Huwwara, Bethlehem checkpoint, etc. Upgrade to Geoapify API 10 ($59) at ~90k requests/month, then API 100 ($299) at ~3M.
4. **Buy Google only if:** (a) you need address-level geocoding in Israel/East Jerusalem or international expansion; (b) a corporate customer contractually requires Google; or (c) you are willing to switch the basemap to Google and pay ~$3.8k/month at 1k drivers. Budget ~$18.7k/month at 10k drivers before Navigation SDK (mobile Maps SDK; add $12.1k if using Dynamic Maps/WebView).
5. **Buy Mapbox only if:** you want a managed map + directions + geocoding bundle and stay under 25k MAU / 100k directions. At 1k drivers it is $1.2k/month; at 10k it is $10.4k/month. Do not add Mapbox Navigation SDK unless you have priced the per-trip fee.
6. **Do not buy traffic for Palestine** from any vendor until they publish a PS traffic row or you have measured their ETA against local ground truth. Spend the money on driver GPS traces and a checkpoint-report loop instead.
7. **Use Google Maps deep links** (`geo:`/`https://maps.google.com/?q=`) for "open in Google Maps" navigation. That is a free handoff and avoids the API terms issue, but it takes the user out of your app.

### Inferences
- The self-hosted stack preserves the Uber-quality basics that matter in Palestine: fast map rendering, accurate local roads, deterministic ETA, Arabic labels, checkpoint warnings. It cannot match Uber's global address search or live traffic, but neither can any vendor in the West Bank today.
- The threshold to buy is not trip volume; it is **coverage and contract requirements**. At 10k drivers, Google costs ~$18.7k/month (mobile Maps SDK), which is ~47× the self-hosted stack; that money buys address coverage and an SLA, not West Bank traffic.
- The biggest risk is operational, not financial: maintaining OSM extracts, checkpoint data, and a 24/7 routing service requires an owner. Budget one part-time GIS/ops engineer even at 100 drivers.
- A hybrid of MapLibre tiles + Google routing is not permitted by Google's terms, so the decision is binary. Pick self-host for cost and control, or Google for coverage and SLA — do not plan a half-and-half.

### Gaps
- No vendor quote was obtained; all costs are list-price calculations with stated assumptions.
- The recommendation assumes Fastship can curate checkpoint/closure data; if it cannot, the self-hosted ETA will be worse than Google's road-only ETA in normal conditions.
- No measured ETA accuracy comparison between OSRM, Valhalla, Google and Mapbox in the West Bank exists in this research; that is the single most valuable next test.
- Apple MapKit, HERE, TomTom and Azure paid rates were not fully retrievable; a procurement quote is needed before considering them.
- The 7amleh analysis may be outdated; re-test Google/Waze behavior in 2026 before citing it to customers or investors.
