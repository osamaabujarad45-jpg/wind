# Google Maps Coverage and Quality in Palestine (West Bank, +970) — October 2026

**Scope:** West Bank only (Ramallah, Nablus, Jerusalem approaches, Qalandia, Huwwara). Israel/US/EU behaviour is cited only where it is the explicit comparison in a source.

**Evidence grades used below**
- **[DOC]** — Google's own documentation or a Google spokesperson statement (primary).
- **[REP]** — credible third-party reporting, NGO fieldwork, or a named journalist/test (secondary; not independently reproduced here).
- **[UNTESTED]** — no reliable evidence found; must be measured with a key or in the field.
- No direct observation was possible in this task: no API key, no paid test, no field access. Every consumer-app claim below is therefore reported, not observed. All URLs accessed **2026-10-29**.

---

## 1. Google's official coverage table for PS Palestine: which layers exist

### Takeaway
Google's own tables say Palestine gets **driving and walking directions plus geocoding, but no traffic layer, no speed limits, no traffic-light/stop-sign data, no biking, and no real-time disruptions**. The Navigation SDK table is the binding one for an in-app turn-by-turn product; the Maps Platform table governs tiles/geocoding/Directions.

### Cited Findings
- Primary table for in-app navigation, **Navigation SDK for Android, page last updated 2026-10-20** — the PS row reads verbatim:
  `| PS | Palestine | — | ⬤ | ⬤ | — | — | — | — | — |`
  Column order: Region Code | Country/Region | Traffic Layer | Driving Directions / Snap to Roads | Walking Directions | Two-Wheeled Vehicle Directions | Biking Directions | Speed Limits | Traffic Lights / Stop Signs | Real-Time Disruptions — [Google, Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk)
- Legend meaning: ⬤ = "available in the area, with good data quality and availability"; ◯ = "approximate data quality or availability"; — = "not available in the area, **or with low data quality or availability**" — [Google, Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk)
- Google warns this table is product-specific: "Coverage for some of the features of the Navigation SDK differs from that of other Google Maps Plaform products" — [Google, Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk)
- Core Maps Platform table, **page last updated 2026-10-28** — the PS row reads verbatim:
  `| PS | Palestine | ⬤ | — | ⬤ | — | ⬤ | — | ⬤ | — |`
  Column order: Region code | Country/Region | Map Tiles 2D / 3D | Maps JavaScript 3D | Geocoding | Traffic Layer | Driving Directions / Snap to Roads | Biking Directions | Walking Directions | Speed Limits — [Google, Maps Platform Coverage Details](https://developers.google.com/maps/coverage)
- That page explicitly scopes itself away from the consumer app: "This page does not describe feature availability on Google Maps." — [Google, Maps Platform Coverage Details](https://developers.google.com/maps/coverage)
- **Critical calibration — Israel is blank in the same column.** The IL rows are `| IL | Israel | — | ⬤ | ⬤ | — | ⬤ | — | — | ⬤ |` (Navigation SDK) and `| IL | Israel | ⬤ | — | ⬤ | — | ⬤ | ⬤ | ⬤ | — |` (Maps Platform). So Israel also shows **no traffic layer and no speed limits** in both tables, while it does show biking and real-time disruptions. PS is distinguished from IL only by **biking** and **real-time disruptions**. — [Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk); [Maps Platform Coverage Details](https://developers.google.com/maps/coverage)
- The traffic layer fails independently of traffic-aware routing: Google's July 2026 incident lists "Traffic Layer" and "live traffic information unavailable for direction calculations" as distinct symptoms across Directions/Routes/Navigation SDK — [Google Maps Platform status incident, 2026-07-26/27](https://status.cloud.google.com/maps-platform/incidents/ujeMmtLLyYxik9k4zQcG6)
- Google's consumer help only commits to "Traffic information isn't available everywhere." — [Google Maps Help, Use layers](https://support.google.com/maps/answer/3092439)

### Inferences
- For a Navigation-SDK-based driver app, the documented PS feature set is: turn-by-turn + snap-to-roads + walking. Everything a dispatch product would use to explain *why* an ETA is wrong — speed limits, signal counts, incident/disruption events — is documented as absent or low-quality.
- The IL/PS symmetry on the traffic and speed-limit columns means these gaps are **regional product gaps, not a Palestine-only exclusion**. Do not build a bias argument on this table alone; the PS-specific deltas are biking and real-time disruptions.
- The IL "—" for traffic layer is internally inconsistent with the visibly traffic-coloured consumer map in Israel. Treat the column as "is this SDK layer sold/supported here", not "does traffic data exist here". This is the single easiest way to misread the table.

### Gaps
- Google publishes no date, methodology, or sample size behind ⬤/◯/—. There is no way to know whether PS driving ⬤ reflects 2026 road data or a 2019 assessment.
- Whether `duration_in_traffic` is actually populated for West Bank routes (as opposed to returning free-flow duration) is **not documented anywhere** and cannot be resolved without a key.
- No published Google statement on why PS lacks real-time disruptions while IL has them.

---

## 2. Live traffic in the West Bank: what exists, what was switched off, what is shown instead

### Takeaway
Documented: there is **no traffic layer product for PS**. Reported: Google **switched off the live-traffic overview** across the region after 7 Oct 2023 and only partially restored route-level traffic; users must enter a destination to see conditions. Route ETAs were never turned off and Google claims they remain traffic-aware.

### Cited Findings
- Google disabled "the ability to see live traffic conditions and busyness information" in Israel and Gaza on 2023-10-24, while stating: "Anyone navigating to a specific place will still get routes and ETAs that take current traffic conditions into account." — [CNBC, 2023-10-24](https://www.cnbc.com/2023/10/24/google-disables-live-traffic-conditions-on-maps-in-israel-and-gaza.html); [ITS International, 2023-10-26](https://www.itsinternational.com/google-maps-turns-live-traffic-information-israel-and-gaza/)
- Partial reactivation two months later: "users in Israel and Gaza can see real-time traffic conditions **along their route** as they navigate… some of the traffic functions on Google Maps are still disabled." — [Times of Israel, 2023-12-24](https://www.timesofisrael.com/liveblog_entry/after-2-months-amid-war-google-starts-to-reactivate-live-traffic-updates-on-waze-maps/)
- As of Dec 2024 the overview was still off: "Google shut off the ability to see an overview of live traffic in the region… Users now have to input a specific location to see traffic conditions along their route." WIRED describes the affected area as "the region", while Google's own 2023 statement named Israel and Gaza — the West Bank inclusion is implied, not stated. — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Google's spokesperson told WIRED that **checkpoint queues are reflected in routing and ETA**: "traffic jams caused by checkpoints are reflected in Google's routing and estimated time of arrival calculations." — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Google's own coverage table for PS still lists Traffic Layer as `—` as of the 2026-10-28 revision — [Maps Platform Coverage Details](https://developers.google.com/maps/coverage)
- West Bank trips routinely blow past any traffic model: a human-rights lawyer reports **9 hours to drive under 10 miles** because of a temporary checkpoint; a one-hour trip took five hours after an early checkpoint closure with "no indication" from Google Maps — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Average checkpoint delay rose from under 10 minutes to about 15 after Oct 2023, "with waits frequently exceeding hours"; ~70% of checkpoints closed during the June 2025 12-day war — [ARIJ, checkpoint methodology](https://arij.net/investigations/checkpoints-occupied-west-bank-palestine-Israel/en/methodology/)
- Google's consumer help documents no "typical traffic" mode; it only says traffic info "isn't available everywhere" — [Google Maps Help](https://support.google.com/maps/answer/3092439)

### Inferences
- Three different things get conflated in public discussion and must be kept apart in the product spec: (a) **traffic-coloured overview layer** — off/documented-absent; (b) **traffic-aware ETA during navigation** — on, per Google, and never disabled; (c) **incident/closure awareness** — absent for checkpoints by design (see §3).
- "What does it show instead?" The best-supported answer is **nothing at overview zoom, and route-conditional colouring once a destination is set**. There is no evidence Google renders a historical/typical-traffic pattern for West Bank roads.
- Because Google's traffic signal is phone-derived, it can only see a queue **after** it forms. It cannot know a gate is closed before cars back up. That is a reactive model being used for a predictive dispatch problem.

### Gaps
- **No source confirms whether the overview traffic layer has been restored in the West Bank by Oct 2026.** Google never published a restoration date for the overview, and the 2026 coverage table is an API table, not the consumer app.
- No evidence on whether `duration_in_traffic` returns real values or free-flow values for West Bank segments. This is the highest-value thing a live key would settle.
- No data on Google's probe density in the West Bank (how many Android devices feed a given Road 60 segment). Without it, ETA quality cannot be predicted, only measured.

---

## 3. Routing behaviour: Ramallah–Nablus, checkpoints, permit roads, settlement bypasses

### Takeaway
Public tests consistently report that Google **does not model the Palestinian road regime**: it has routed Ramallah–Nablus via Israel (2018), refused the route outright (2019), and in Dec 2025 withdrew guidance entirely on approach to Qalandia. Google denies bias and says it cannot distinguish road permissions without knowing citizenship.

### Cited Findings

Timeline of reported behaviour (all secondary, none independently reproduced here):

| Date of test | Route | Reported Google behaviour | Source |
|---|---|---|---|
| Apr 2018 | Ramallah–Nablus | 45-min drive sent on a **4.5-hour route through Israel**; app showed "This route has restricted usage or private roads" and "This route may cross country borders"; checkpoints and settlements not marked | [7amleh, *Mapping Segregation*](https://www.apc.org/sites/default/files/Mapping-Segregation-Cover_WEB-5.pdf) |
| Apr 2018 | Bethlehem–Ramallah | Fastest route goes **through Jerusalem**, unusable for West Bank ID holders; all alternatives also through Israel | [7amleh](https://www.apc.org/sites/default/files/Mapping-Segregation-Cover_WEB-5.pdf) |
| Jan 2019 | Nablus–Ramallah (35 km) | **"No route found"**; routes between Israeli settlements (Karnei Shomron–Elon Moreh) computed normally | [Deutschlandfunk, 2019-01-18](https://www.deutschlandfunk.de/google-maps-routenplaner-scheitert-im-palästinensergebiet-100.html) |
| 2019 | Bethlehem–Ramallah | Founder of Doroob Navigator "left lost in a remote valley" by Google Maps, prompting him to build a rival from scratch | [CBC, 2019-08-05](https://www.cbc.ca/news/science/palestinian-app-doroob-west-bank-traffic-1.5236687) |
| Dec 2024 | Hebron–Ramallah | **"Could not calculate driving directions"**; WIRED replicated it. A current Google employee attributed it to Google never enabling directions between the West Bank's three administrative areas (A/B/C) | [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/) |
| Dec 2025 | Jerusalem–Ramallah–Taybeh, via Jaba'–Ar-Ram and Qalandia | Warnings, **repeated proposed U-turns, then navigation withdrawn entirely** — location tracking continued but guidance stopped | [Zenodo essay, DOI 10.5281/zenodo.22133262](https://doi.org/10.5281/zenodo.22133262) |
| Sep 2026 | West Bank generally | "Google Maps is practically useless for Palestinians; it is **blind to the checkpoints** and tries to route drivers onto roads reserved for Israeli-plated cars" | [WIRED, 2026-09-30](https://www.wired.com/story/all-the-west-banks-checkpoints-mapped/) |

- Google's on-record position: it **does not distinguish Palestinian from Israeli routes**, because "that would require knowing personal information about users, such as their citizenship" — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Google denies bias: "Any claims of Google Maps showing bias in this region are false. We've updated thousands of roads, street names, place names, and postal codes in the West Bank and Gaza"; ~**5,000 miles of roads added** in the West Bank and Gaza since 2021 — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- The physical basis for the complaint is documented: ~**79 km of roads are Israeli-only** (settlement connectors) and ~**155 km are restricted** for West Bank Palestinians; unauthorised use risks arrest, fines, or violence — [7amleh](https://www.apc.org/sites/default/files/Mapping-Segregation-Cover_WEB-5.pdf); [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/)
- Scale of the obstacle regime: **925** movement obstacles as of Dec 2025 (89 permanent checkpoints, 218 partial, 232 road gates, 114 linear closures, 167 earth mounds, 105 roadblocks), 43% above the 20-year average of 647; **121 obstacles block access to Road 60** — [OCHA, Movement and Access, 2026-04-23](https://www.ochaopt.org/content/movement-and-access-west-bank-april-2026)
- Palestinian Commission (CRRC) count rose to **942** by 2026-09-25 — [Al Jazeera, 2026-09-29](https://www.aljazeera.com/news/2026/9/29/israels-west-bank-road-closures-turn-routine-journeys-into-long-ordeals)
- Main crossings named by UN/OCHA data: **Qalandia** (once ~a third of all West Bank–Israel movement), **Checkpoint 300** (Bethlehem–Jerusalem), Eyal, Taybeh, Tarqumiyah — [Al Jazeera, 2026-09-28](https://www.aljazeera.com/news/2026/9/28/mapping-israels-300-checkpoints-where-they-are-and-how-they-work)
- West Bank is not contiguous in routing terms: **one in five communities** had more checkpoints on its most direct hospital route in 2025 than in 2023; **a third now cross ≥3 checkpoints** to reach a hospital; commuters lose ~**90 min/week** to detours (~77 h/year) — [ARIJ](https://arij.net/investigations/checkpoints-occupied-west-bank-palestine-Israel/en/methodology/)
- Palestinians have built substitutes precisely because of this: **Doroob Navigator** (>200k active users) and **Azmeh** (~70k users, tracking 800+ checkpoints), plus Telegram/WhatsApp road-condition groups — [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/); [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Waze, also Google-owned, is avoided partly because it "treats us as Israelis" and warns that entering the West Bank is a "dangerous area" — [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/)

### Inferences
- The reported failure mode has **changed over time**: absurd detour (2018) → no route (2019–2024) → warnings, U-turns, guidance withdrawal near Qalandia (Dec 2025). Any 2026 conclusion must be tested, not inherited from the 2018 7amleh numbers.
- The Dec 2025 "guidance withdrawn" behaviour is worse for a dispatch product than a bad route: the driver loses turn-by-turn mid-trip while the app still shows their dot. That is a safety and support-load problem, not just an accuracy problem.
- Google's "we can't know citizenship" defence is technically coherent but functionally means the default route set is computed for the **most permissive** vehicle profile — i.e. one that can use settlement roads. For a Palestinian driver cohort this is systematically wrong, not randomly wrong.
- Because checkpoints are not graph entities, no amount of ETA tuning fixes them. A checkpoint layer has to be owned by Fastship.

### Gaps
- **No 2026 test of Ramallah–Nablus exists in the public record.** The most recent direct Ramallah–Nablus datapoint is 2019 ("no route found"). Whether it now routes via Route 60/Huwwara, via Israel, or fails is unknown.
- No source states whether Google routes *around* Huwwara specifically, or how it treats the Huwwara–Nablus approach when the checkpoint is closed.
- No public documentation of Google's turn restrictions at Qalandia (which directions/vehicle classes are allowed through).
- The Zenodo essay is single-author fieldwork with inconsistent date metadata (DOI dated 2025-12-01; text says originally published July 2026). Treat as a credible observation, not peer-reviewed evidence.

---

## 4. Geocoding and autocomplete: Arabic names, street addresses, landmarks

### Takeaway
Google's table rates PS geocoding ⬤ ("good data quality"), and Google says it shipped a West Bank address-lookup update in late 2024 — but **there is no independent, Palestine-specific accuracy evidence**, and no evidence at all on autocomplete for Arabic colloquial names or checkpoint landmarks.

### Cited Findings
- Geocoding is marked ⬤ for PS — [Maps Platform Coverage Details](https://developers.google.com/maps/coverage)
- Google launched "an update to help users easily look up West Bank addresses" around Nov 2024, and claims thousands of street names, place names and postal codes updated — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Street naming is unstable in practice: Ramallah officials "will turn a two-way street into a one-way or vice versa… Almost every time I go, the road has changed"; a 7amleh staffer says he spots Google Maps users driving the wrong way down one-ways — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Crowd edits are reportedly backlogged: two current employees say Google "hasn't acted on many of the suggested edits… which has caused road data on the app to become outdated over the past year"; Google says it applies edits when verifiable — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Local apps deliberately avoid formal addresses: Doroob is "intended to help drivers by using **widely recognized street and place names**", i.e. colloquial landmarks rather than postal addresses — [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/)
- A Palestinian national gazetteer exists: the PNCGN had ~**15,000** place names reviewed/verified against 1942 British maps and published via a web mapping app (`geomolg`) — [Palestine national report to UNGEGN](https://unstats.un.org/UNSD/geoinfo/UNGEGN/docs/11th-uncsgn-docs/E_Conf.105_35_CRP.35_5_National%20report%20progress_State%20of%20Palestine.pdf)
- Best independent geocoder benchmark available (2026): Google Maps v3 scores **100% candidate return rate** and **88.3% ±2.0 geohash-6 (~±0.6 km) accuracy** — best of 12 geocoders tested. But the benchmark is **98% Latin-script** and 49% North America / 43% Europe; Arabic addresses are a small minority and Palestine is not a stated stratum — [MESSY STREETS benchmark, 2026](https://arxiv.org/html/2609.01612)
- Historical (2008, pre-dates modern Maps): searching Arabic "جنين" returned a small town in Lebanon rather than Jenin, and English "Jenin" ranked Czech and Polish towns above the Palestinian city — [The Tuque Souq, 2008-11-15](http://thetuquesouq.blogspot.com/2008/11/israel-palestine-and-google-maps.html). **This is 18 years old and must not be presented as current.**

### Inferences
- Google's own ⬤ is a vendor self-rating with no published test set. It should be treated as "geocoding endpoint is served for PS", not "Arabic West Bank addresses resolve correctly".
- The global benchmark's strength (Latin-script, US/EU) is exactly where Palestinian addresses are weak: mixed Arabic/English naming, no reliable street-number grid, and landmark-based navigation. Expect materially worse than 88% top-accuracy; the size of the drop is unknown.
- Autocomplete ranking is the real risk, not raw geocoding: for "رام الله" the correct city will win, but for a neighbourhood or a shop the model must choose between transliteration variants (Ramallah/Ramalla/رام الله) and between same-named villages. No public evidence exists on how it behaves.
- Checkpoint names are the worst case: they are political objects with three naming systems (Arabic حاجز قلنديا, Hebrew מעבר קלנדיה, English "Qalandia Crossing"/"Checkpoint"), often no street address, and no stable official entry. Assume lookup fails or returns a nearby business.

### Gaps
- **No published Palestine-specific geocoding accuracy study** was found (match rate, positional error, Arabic vs English query parity). This is a genuine hole in the public record, not an oversight in searching.
- **No evidence on autocomplete at all** for Arabic West Bank queries — not from Google, not from any third party.
- **Untested:** whether Qalandia, Huwwara, and Checkpoint 300 resolve as named places, and whether the returned pin is on the road, at the pedestrian crossing, or at a nearby shop.
- No evidence on Arabic diacritics (تشكيل), definite article (ال), or transliteration tolerance.
- Whether Google ingests the Palestinian national gazetteer (`geomolg`) is unknown.

---

## 5. Place data: cities, businesses, checkpoints, settlements

### Takeaway
Palestinian cities and businesses are present and Google has invested in road/place data since 2021, but **checkpoints are not modelled as places or routing constraints**, and the 2018 NGO finding that settlements are mapped more seamlessly than Palestinian villages has not been retracted — Google disputes the bias framing.

### Cited Findings
- Google claims "thousands of roads, street names, place names, and postal codes" updated in the West Bank and Gaza, plus ~5,000 miles of roads since 2021 — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Google's spokesperson frames the area as hard to map: "constantly changing conditions on the ground and available data being inconsistent and ill-defined"; Google "stays neutral on geopolitical issues" — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- As of Sep 2026: Google Maps is "**blind to the checkpoints**" and routes onto Israeli-plated-only roads — [WIRED, 2026-09-30](https://www.wired.com/story/all-the-west-banks-checkpoints-mapped/)
- 7amleh's finding (2018): Google Maps "rarely includes the names of Palestinian areas unrecognised by Israel, while at the same time, it includes the names of illegal Israeli settlements and locates them seamlessly"; it "neglects to express the hundreds of roadblocks and permanent and flying checkpoints" — [7amleh / APC](https://www.apc.org/en/pubs/mapping-segregation-google-maps-and-human-rights-palestinians)
- Same report: routing within Palestinian rural communities and to/from Gaza returns "Sorry, we could not calculate driving/walking directions from x to y" — [7amleh PDF](https://www.apc.org/sites/default/files/Mapping-Segregation-Cover_WEB-5.pdf)
- Corroborating journalism (2019): Palestinian towns "appear… yet… they do not exist as places one can actually get to"; routes to the settlement of Ma'ale Adumim compute normally while Abu Dis does not — [Mondoweiss, 2019-06-03](https://mondoweiss.net/2019/06/palestinian-between-settlements/)
- Business-level data exists but is contested at the margins: a Google Maps-listed gas station reportedly denied a Palestinian customer access to its facilities — an anecdote about ground truth diverging from the listing, not about data completeness — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Independent local datasets now cover what Google does not: Azmeh tracks **800+ checkpoints and barriers** from 60k+ users; Doroob has >200k active users — [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/)

### Inferences
- Cities and businesses: adequate for search-and-select in Ramallah/Nablus; the risk is **freshness** (opening hours, closures, renamed shops), not absence.
- Checkpoints: not a place-data problem that can be fixed by adding pins. Even if pins exist, routing will not treat them as costs, and a pin at the wrong side of the barrier is worse than no pin.
- The 2018 "settlements seamless, Palestinian villages missing" asymmetry is the strongest concrete bias claim in the record, but it is 8 years old and Google says it has since updated thousands of names. **Do not present it as current without a 2026 re-test.**

### Gaps
- **Untested:** whether Qalandia/Huwwara/Checkpoint 300 exist as Google place entities in 2026, what category they carry, and whether they appear in autocomplete.
- **Untested:** whether settlement names are visually distinguished from Palestinian towns in 2026 (font, colour, boundary, or "illegal" annotation). 7amleh says no distinction as of 2018.
- No 2026 count of Palestinian businesses listed vs. actual, and no closure/opening-hours accuracy data.

---

## 6. Map labels: Arabic vs Hebrew vs English, RTL, "West Bank"/"Palestine", compliance risk

### Takeaway
Google has **never labelled "Palestine"** on Maps and says it will not until there is international consensus on borders; the area renders as **"West Bank" and "Gaza Strip" inside a dashed grey disputed boundary**, with names following the user's device language. This is a live product/reputational variable for a Palestinian-facing app, and Google localises borders by viewer country.

### Cited Findings
- Google's labelling rules: undisputed international borders = solid grey; treaty/provisional = dashed grey; **disputed = dashed grey**; country names are drawn on the map and "Google Maps automatically shows place names in the same language that is set in your browser's settings" — [Google Maps Help, Understand country borders and names](https://support.google.com/maps/answer/3145721)
- Google's policy hierarchy for disputed regions: ground truth → authoritative references (UN, ISO, FIPS) → local expectations; may show "multiple claim lines", "multiple names… separated by a slash", or clickable political annotations — [Google Public Policy Blog, 2009-12-04](https://publicpolicy.googleblog.com/2009/12/when-sources-disagree-borders-and-place.html)
- Google spokesperson (2024): there has been **no change** to how Palestine is depicted; a search for "Palestine" shows "labels for the West Bank and the Gaza Strip but — since there is no clear consensus across international bodies on its territories — they could not reliably show and label its borders"; disputed borders are shown as a dashed grey line — [AFP Fact Check, 2024-07-05](https://factcheck.afp.com/doc.afp.com.362D3LA)
- Same position restated in German fact-checking: "Palestine" was never a label; Google remains neutral and uses a dashed grey border; Google's own map-coverage details list Palestine among 256 countries and territories — [DPA Fact Check, 2024-07-31](https://dpa-factchecking.com/germany/240730-99-908076)
- Historical confirmation from Google itself: "There has never been a 'Palestine' label on Google Maps, however we discovered a bug that removed the labels for 'West Bank' and 'Gaza Strip'" — [WIRED, 2016-08-10](https://www.wired.com/story/google-palestine/); [The Guardian, 2016-08-10](https://www.theguardian.com/technology/shortcuts/2016/aug/10/google-maps-disputed-territories-palestineishere)
- Google **localises borders by viewer country**: "We remain neutral on issues of disputed regions and borders… In countries where we have local versions of Google Maps, we follow local legislation when displaying names and borders." — [Washington Post, 2020-02-14](https://www.washingtonpost.com/technology/2020/02/14/google-maps-political-borders/)
- That localisation is still active in 2025: Google confirmed Western Sahara's dotted border is shown outside Morocco but **not shown at all to users in Morocco**, as "longstanding policies for disputed regions" — [The Guardian, 2025-11-12](https://www.theguardian.com/world/2025/nov/12/google-maps-border-western-sahara-morocco)
- Google Maps Help has an Arabic-language version, and labels follow device language — [Google Maps Help (ar)](https://support.google.com/maps/answer/3145721?hl=ar)

### Inferences
- A Palestinian user opening Fastship sees **"West Bank"**, not "Palestine", and a dashed border at the Green Line. That is Google's rendering, not Fastship's — but users will not necessarily make the distinction.
- **RTL:** no evidence found on how Google's Arabic basemap handles mixed Arabic/Hebrew/English labels, bidi text, or label collision in dense West Bank areas. This is a visual-QA item for the field team, not something to assume.
- **Compliance/reputational risk is asymmetric and real.** If Fastship overlays its own "Palestine" label or redraws boundaries on Google tiles, that is a modification of licensed map content and needs a terms review before shipping; if it does not, some users will read the Google rendering as Fastship's position. Both directions need a deliberate decision, not a default.
- Because Google serves different borders by viewer country, the same build can show different geography to a user in Ramallah, a user in Tel Aviv, and a user in Berlin. Any screenshot-based QA must record the viewer's country.

### Gaps
- **No source found on Arabic/Hebrew/English label priority in the West Bank specifically** (e.g. does Nablus render as نابلس or Nablus on an Arabic-locale device).
- **No source on RTL rendering quality** or label collisions in West Bank cities.
- **Not reviewed:** Google Maps Platform Terms on modifying/overlaying map content and on disputed-territory display. This must be checked by whoever owns legal before any custom labelling.
- No evidence on whether Fastship's own Arabic name/description fields affect how Google renders the basemap (they do not, but this should be stated to stakeholders).

---

## 7. Traffic/ETA quality for a dispatch product: what can be inferred, what must be measured

### Takeaway
Google's ETA in the West Bank is best understood as **free-flow + ambient congestion, blind to checkpoints and closures**. It is usable as a baseline leg estimate and unusable as a customer promise without a Fastship-owned checkpoint/closure layer and locally measured queue times.

### Cited Findings
- PS has no traffic layer, no speed limits, and no real-time disruptions in Google's tables; driving directions are rated ⬤ — [Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk); [Maps Platform Coverage Details](https://developers.google.com/maps/coverage)
- Google states ETAs remain traffic-aware during navigation, and that checkpoint queues feed routing/ETA — [CNBC, 2023-10-24](https://www.cnbc.com/2023/10/24/google-disables-live-traffic-conditions-on-maps-in-israel-and-gaza.html); [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- But the observed error is categorical, not percentage: 9 hours for <10 miles; a 1-hour trip becoming 5 hours after an early closure; users budgeting **up to 3 hours of buffer** — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/)
- Checkpoint waits: median rose from <10 min to ~15 min post-Oct 2023, "frequently exceeding hours"; ~70% of checkpoints closed during the June 2025 12-day war; ~38 access incidents/week and ~15 flying checkpoints/week in 2025 — [ARIJ](https://arij.net/investigations/checkpoints-occupied-west-bank-palestine-Israel/en/methodology/); [OCHA](https://www.ochaopt.org/content/movement-and-access-west-bank-april-2026)
- GPS integrity is a separate failure mode: users report being located in **Beirut or Amman** instead of the West Bank "half the time"; the Palestinian telecom ministry says GPS jamming disrupts "navigation apps, vehicle tracking, and emergency services" — [WIRED, 2024-12-23](https://www.wired.com/story/google-maps-west-bank/); [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/)
- Connectivity is a constraint: 3G is patchy in the region — [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/)

### Inferences
- Model the ETA error as **bimodal, not normal**: most trips land within a normal traffic band; a minority blow out by 2–10× because of a checkpoint event. A single MAPE number will hide this. Report p50, p90 and the share of trips exceeding 2× the Google estimate.
- Google can only absorb a queue once it has formed and enough devices are in it. It cannot predict a closure. So:
  - **Google ETA ≈ "drive time if the road is open".**
  - **Dispatch ETA = Google ETA + P(checkpoint closed) × queue time + closure detour.**
- The three things Google cannot supply and Fastship must own: (1) checkpoint open/closed state, (2) queue-time distribution by checkpoint and hour, (3) which roads are legally usable by a green-plate vehicle.
- GPS jamming means **driver position itself is unreliable** near the seam. That breaks more than ETA: pickup matching, "driver arriving" notifications, trip replay for disputes, and SOS location all inherit the error. Any dispatch design that assumes a trustworthy lat/long at Qalandia is unsound.
- Offline resilience matters: patchy 3G plus a navigation SDK that needs tiles/reroutes means the driver app must cache the corridor, not just the city.

### Gaps
- No measured Google-vs-ground-truth ETA error for any West Bank route exists publicly. This is the core unknown.
- No public queue-time dataset by checkpoint/hour. OCHA counts obstacles; it does not time queues. ARIJ gives an average and a distribution shape, not a per-crossing table.
- No evidence on how often Google returns a route that is illegal for a green-plate driver, expressed as a rate. WIRED/7amleh give examples, not frequencies.
- No data on Google ETA behaviour during a full closure (Does it reroute? Does it hold the original ETA? Does it drop guidance?).

---

## 8. What can be evaluated without an API key vs what needs a live key and field test

### Takeaway
Documentation, public maps, OSM/OSRM baselines and the OCHA/CRRC checkpoint corpus are all evaluable now. Anything that depends on Google's actual answers — geocoding match rate, autocomplete ranking, ETA accuracy, traffic-layer presence, route legality — needs a key and wheels on the ground.

### Cited Findings
- Google publishes feature availability per country for Navigation SDK and core Maps Platform, with revision dates — [Navigation SDK coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk); [Maps Platform Coverage Details](https://developers.google.com/maps/coverage)
- Google publishes its border/label policy, which is sufficient to predict what the basemap will show — [Google Maps Help](https://support.google.com/maps/answer/3145721); [Public Policy Blog](https://publicpolicy.googleblog.com/2009/12/when-sources-disagree-borders-and-place.html)
- The checkpoint universe is public and current: 925 obstacles (Dec 2025), 942 (Sep 2026), with type and governorate breakdown, plus a poster-size access-restriction map — [OCHA](https://www.ochaopt.org/content/movement-and-access-west-bank-april-2026); [Al Jazeera](https://www.aljazeera.com/news/2026/9/29/israels-west-bank-road-closures-turn-routine-journeys-into-long-ordeals); [OCHA poster PDF](https://www.ochaopt.org/sites/default/files/Westbank_A0_2026_FINAL.pdf)
- A Palestinian national gazetteer (~15,000 verified names) exists as a reference set — [PNCGN national report](https://unstats.un.org/UNSD/geoinfo/UNGEGN/docs/11th-uncsgn-docs/E_Conf.105_35_CRP.35_5_National%20report%20progress_State%20of%20Palestine.pdf)
- Google's consumer app is publicly observable without a key (manual route entry, place search), but Google's terms and the JS-only rendering make scripted scraping impractical and legally risky — no source needed beyond [Google Maps](https://www.google.com/maps); treat manual screenshots as the only no-key observation method.

### Inferences
- **No-key work (do now):** read the two coverage tables; screenshot Google Maps web/app for Ramallah–Nablus, Ramallah–Jerusalem, Qalandia, Huwwara at three times of day; pull OCHA obstacle data; build an OSM/OSRM baseline; assemble the 25-address + 10-landmark ground-truth list; draft the label/RTL QA checklist.
- **Key-required work:** Geocoding API match rate and positional error; Places Autocomplete top-3 relevance; Directions/Routes `duration_in_traffic` population; Navigation SDK layer availability at runtime; route polyline inspection against the Israeli-only road list.
- **Field-required work (key alone is insufficient):** actual checkpoint queue times; whether Google's route is drivable by a green-plate car; whether guidance drops near Qalandia; GPS behaviour under jamming; Arabic autocomplete as a native speaker would type it.
- A key tells you what Google *returns*. Only the field tells you whether the return is *true*. Budget both.

### Gaps
- No information on Fastship's current Google Maps Platform contract, quota, or whether Navigation SDK is licensed. Cost/contract is out of scope for this note.
- Unverified whether a demo key (Google publishes a Maps demo key for evaluation) is sufficient to exercise Directions/Routes in PS; not tested here.

---

## 9. Field-test plan (20 trips, 25 Arabic addresses, 10 landmarks)

### Takeaway
A two-week, three-time-window protocol that produces the four numbers the product needs: ETA error distribution, checkpoint wait distribution, route-legality violation rate, and Arabic geocode/autocomplete top-3 hit rate.

### Cited Findings
- Baseline facts the plan must be powered against: median checkpoint wait ~15 min but "frequently exceeding hours"; ~90 min/week lost to detours; 121 obstacles affect Road 60; ~15 flying checkpoints/week — [ARIJ](https://arij.net/investigations/checkpoints-occupied-west-bank-palestine-Israel/en/methodology/); [OCHA](https://www.ochaopt.org/content/movement-and-access-west-bank-april-2026)
- Google's own route behaviour is unstable enough that repeated sampling is required, not optional: guidance was withdrawn mid-route in Dec 2025 fieldwork — [Zenodo essay](https://doi.org/10.5281/zenodo.22133262)
- Israeli-only road mileage (~79 km) is small enough to enumerate as a checklist for polyline inspection — [7amleh](https://www.apc.org/sites/default/files/Mapping-Segregation-Cover_WEB-5.pdf)
- OSM/OSRM is a legitimate independent baseline: it is community-maintained, used by Palestinians to represent villages/roads/barriers that Google omits — [Rest of World, 2025-05-19](https://restofworld.org/2025/palestinians-digital-maps-west-bank-israel/)

### Proposed protocol (inference, not sourced)

**Trip sample — 20 trips, 2 weeks, weekdays only, 3 windows (07:00–09:00, 12:00–14:00, 16:00–19:00):**

| # | Corridor | Trips | Purpose |
|---|---|---|---|
| 1 | Ramallah → Nablus (Route 60 / Huwwara) | 6 | Core long-haul; checkpoint exposure at Huwwara |
| 2 | Nablus → Ramallah | 3 | Direction asymmetry (queues differ by direction) |
| 3 | Ramallah → Jerusalem via Qalandia | 5 | Contested crossing; wall/gate errors |
| 4 | Ramallah → Qalandia terminal (short) | 3 | Dense-urban + checkpoint approach |
| 5 | Nablus → Huwwara → Nablus (loop) | 3 | Short checkpoint shuttle, high repetition |

**Per trip, log at departure and on arrival:**
- Google ETA and distance at T-0 (screenshot, with timestamp and viewer country).
- Chosen polyline; flag any segment on the Israeli-only road list.
- Whether Google issued a warning ("restricted usage or private roads" / "may cross country borders") or dropped guidance (timestamp of drop).
- Actual elapsed time (GPS + stopwatch), moving vs stopped time.
- Checkpoint(s) crossed, queue length (vehicles), wait minutes, gate open/closed, ID check duration.
- OSRM ETA/distance for the same OD pair (same departure time).
- Time of day, day of week, weather, known closure/incident.

**Metrics and provisional pass/fail (to be ratified by product):**
- ETA error: median absolute % error; p90; share of trips >2× Google estimate. Dispatch-viable if p50 ≤25% and p90 ≤50% **after** checkpoint correction; raw Google p90 is expected to fail.
- Route legality: % of trips where Google's polyline uses an Israeli-only segment. Target 0%; any occurrence is a safety defect.
- Guidance continuity: % of trips where turn-by-turn drops mid-route. Target 0%.
- Checkpoint wait: median/p90 by checkpoint and hour band — this becomes Fastship's own prior, not a Google metric.

**Geocoding — 25 Arabic addresses (5 each: Ramallah, Nablus, Hebron, Bethlehem, Jenin):**
- Mix: 10 street+number, 10 street-only/neighbourhood, 5 colloquial landmark-style ("مقابل جامع…").
- Record: returned? correct governorate? rank of correct result in top 3? distance from ground-truth pin (metres, measured on the ground or from a surveyed OSM node)?
- Pass: ≥80% top-3 for street-only, ≥60% for colloquial; ≤150 m median positional error for street addresses.

**Autocomplete — 10 landmarks:**
Qalandia checkpoint, Huwwara checkpoint, Checkpoint 300 (Bethlehem), Damascus Gate, Al-Manara Square (Ramallah), Joseph's Tomb junction (Nablus), Eyal checkpoint, Tarqumiyah checkpoint, Taybeh checkpoint, Atara checkpoint.
- Type progressively in Arabic (and once in English) as a local would; record first result, top-3, and whether the pin is on the correct side of the barrier.
- Pass: correct entity in top 3 for ≥7/10; pin on correct side for ≥8/10.

**Controls / threats to validity:**
- Same driver, same vehicle, same phone where possible; record Android vs iOS (Google Maps behaviour differs).
- Never test during a full closure (results are not comparable) — log closures and exclude, but keep them as separate "closure behaviour" cases.
- Record viewer country/account locale, because Google localises borders and names by country (see §6).
- Two independent observers for queue length to avoid single-rater bias.
- Pre-register the 20 trips and the 35 queries before starting; publish the raw log, not just summary stats.

### Inferences
- Twenty trips is enough for a directionally reliable ETA error distribution and a first-pass legality rate, **not** enough for per-checkpoint hourly priors. Plan a second wave (or instrument live drivers) before using queue times in customer-facing promises.
- The cheapest high-value test is not the 20 trips — it is the 10 landmark autocomplete queries plus the 5 Qalandia trips. Those answer "can a customer even select the right destination" and "does guidance survive the main crossing".

### Gaps
- No budget, staffing, or vehicle-access assumptions were provided; timeline and cost are out of scope.
- Ground-truth pins for the 25 addresses require local survey work; no existing public ground-truth set for West Bank street addresses was found.
- Legal/safety review for field staff crossing checkpoints was not assessed and should precede any fieldwork.
