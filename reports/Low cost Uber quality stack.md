# Uber quality has no free tier

**Uber quality for free does not exist.** Neither does it exist for $25 a month at any driver count that matters. The parts riders feel — the offer in seconds, the ETA that survives a checkpoint, the car live on a 3G handset, the SOS a human answers — are a private marketplace loop and a local operations system, not a vendor SKU. What can be bought is the floor: MapLibre/OpenFreeMap, OSRM, PostGIS, Cloudflare Durable Objects, Supabase, Firebase or a local SMS aggregator, Shufti or manual Hawiya review, and a Bank of Palestine QR rail at 0.25%. At the stated volumes (10 trips per driver per day, 3 map sessions and 2 route calls per trip, 1 OTP per login, 1 push per trip), the cheapest honest stack for Fastship/Wind is about **$60/month at 100 drivers, $217 at 1,000, and $1,620–$1,740 at 10,000** — but only with device-bound OTP. At one SMS per driver per day at Twilio’s rate, it costs **$1,290 / $12,520 / $124,600**, and the “free” identity tier is irrelevant. No mainstream provider sells West Bank traffic or models checkpoint routing; Google’s own coverage marks Palestine’s traffic and real-time disruptions unavailable. This is a **29 October 2026** list-price snapshot: no local operator quote, no payment integration, no device run.

## Uber quality is a private loop, not a purchasable SKU

Uber’s public engineering is explicit about the hard parts: ETA is a routing engine plus a learned residual model; marketplace balance is a reinforcement-learning problem; push uses at-least-once delivery, four-second heartbeats and a seven-second timeout; the PIN is four digits, five attempts, and gates trip start ([Uber, DeepETA](https://www.uber.com/us/en/blog/deepeta-how-uber-predicts-arrival-times); [Uber, RL for marketplace balance](https://www.uber.com/us/en/blog/reinforcement-learning-for-modeling-marketplace-balance); [Uber, real-time push platform](https://www.uber.com/ng/en/blog/real-time-push-platform); [Uber, PIN verification](https://www.uber.com/us/en/blog/pin-verification-drivers)). None of that is for sale. There is no Uber-quality API and no vendor that will sell you the queue time at Qalandia at 07:30.

What is for sale is the floor — map tiles, a routing engine, a geocoder, pub/sub, Postgres, SMS, IDV and acquiring. None of it decides whether the product feels like Uber in Ramallah; the local layer does.

The earlier Azure evidence review reached the same shape from the hosting side: Azure can supply the operational floor, but it is the buy-reliability option, not the cheap one, and it does not supply phone-first identity, Palestinian SMS, traffic or checkpoint semantics. This report answers the next question: if the floor is bought at list price, which vendors, which tiers, and what does the cheapest honest stack cost?

For this report, “Uber-quality” means eight observable behaviors: a bounded offer with a fallback, an ETA that refreshes and admits uncertainty, a seconds-old driver position, a four-digit start PIN, a signed trip-share link, a one-tap SOS to a human, proof of handoff, and a ledger that never loses a fare. Every one is buildable. None is free at scale.

| Capability | Cheapest credible choice | Price or free tier | What it cannot do | Evidence strength | First paid upgrade trigger |
|---|---|---|---|---|---|
| Basemap | MapLibre RN + OpenFreeMap | $0; no cap, no SLA | No SLA or address data | Documented + observed | >1M sessions/month: self-host PMTiles |
| Routing / ETA | OSRM + custom checkpoint/closure costs | €6–9/month; BSD-2 | No traffic, closures or permits | Documented + observed | Time-of-day speeds: Valhalla; SLA: GraphHopper |
| Geocoding | Photon + Nominatim + Arabic aliases; Geoapify fallback | $0; 3k credits/day free | Checkpoint queries unreliable | Observed | >90k requests/month: Geoapify $59 |
| Traffic / checkpoints | Own GPS + driver reports + OSM seed + closure table | $0; ops time | No live West Bank traffic to buy | Negative, documented | A vendor publishes a PS traffic row |
| Realtime | Cloudflare Durable Objects | $5 + ~$16 at 10k; 100k/day free | Not durable history; single vendor | Documented | Residency or DO limits: Centrifugo |
| Database | Supabase Pro | $25; free tier pauses, 500 MB, no backups | Free: 200 connections, 2M messages; Pro: 8 GB | Documented | >8 GB: compute add-on; PITR before money data |
| API hosting | Fly.io 512 MB or Render $7 | $3.69–7; Fly has no free tier | Single region, no Levant | Documented | Second replica or SLA: Azure Container Apps |
| Phone OTP | Firebase + local aggregator/WhatsApp; Twilio fallback | $0.29/SMS; Twilio $0.4101; WhatsApp €0.0092 unverified | No free OTP; no delivery SLA | Documented + unverified | >300/month: local quote; >10k: WhatsApp |
| Driver verification | Manual Hawiya/vehicle review; Shufti later | $0 at 100; Persona $250/month; Stripe $1.50 unusable | No background or vehicle API | Documented + vendor claim | Review exceeds one FTE: Shufti |
| Card acceptance | Bank of Palestine gateway | 2.5%; T+2; 3–5 day approval | No global processor; no split payouts | Documented | Corporate demand pays the 2.5% |
| QR + cash | BOP QR 0.25% + double-entry ledger | 0.25%; cash free | Merchant-present QR only | Documented | Dynamic per-trip QR API |
| Driver payouts | Cash reconciliation; Jawwal Pay manual | $0 software; fees unknown | No bulk payout API | Negative, documented | PSP bulk-credit API or BOP batch |
| Dispatch + safety | PostGIS + offer leases + VROOM; SOS + on-call | OSS free; staff cost | No turnkey Uber loop | Documented | Manual dispatch breaks; masking justified |

## No vendor sells the West Bank layer that matters

Google’s own Navigation SDK coverage table is the cleanest admission: for **PS Palestine** it marks traffic and real-time disruptions unavailable (`—`), while driving and walking directions are good ([Google coverage](https://developers.google.com/maps/documentation/navigation/android-sdk/coverage-nav-sdk)). Esri rates the West Bank at geocoding Level 1 with local roads and **fixed speeds**; live traffic is a separate tier Palestine does not get ([Esri coverage](https://doc.arcgis.com/en/streetmap-premium/latest/coverage/product-coverage.htm)). TomTom’s public traffic expansion names Israel, not Palestine ([TomTom, 2017](https://www.tomtom.com/newsroom/press-releases/general/19876/tomtom-expands-its-global-traffic-footprint-to-64-countries/)). **Traffic-aware ETA in the West Bank is a marketing claim, not a product you can buy.**

Local evidence agrees. 7amleh found Google routing Ramallah–Nablus through Israel at about 4.5 hours versus 45 minutes through the West Bank, and found Google, Waze and Maps.me ignoring movement restrictions; Maps.me marks checkpoints but routes through them ([7amleh](https://7amleh.org/ms/pln.html)). It is undated, so re-test. Al Jazeera reported roughly **300 checkpoints** in September 2026 ([Al Jazeera](https://www.aljazeera.com/news/2026/9/28/mapping-israels-300-checkpoints-where-they-are-and-how-they-work)). A live OSRM test routed Ramallah–Nablus at **53.5 km and 61.8 minutes**, with a 36.66 km unnamed segment and no checkpoint, closure, permit or traffic attributes ([OSRM demo query](https://router.project-osrm.org/route/v1/driving/35.2034,31.9038;35.2544,32.2211?overview=false&steps=true)).

Geocoding is the second defect. Nominatim returned **zero** for “Qalandia checkpoint”; Photon returned a **bus-stop parking** named “Kalandia checkpoint Parking” ([Nominatim](https://nominatim.openstreetmap.org/); [Photon](https://photon.komoot.io/)). For “Huwwara”, Nominatim returned the correct OSM way, while Photon returned a street in Area B and a false positive in Peru. City-level geocoding is safe on OSM; landmark and checkpoint geocoding is not. A rider typing “Qalandia” needs an Arabic alias table and a curated POI, not a geocoder default.

Google’s trap is the terms, not the price. The mobile **Maps SDK** is **unlimited free**, so native map display costs nothing. But Routes, Geocoding, Places and Navigation SDK terms forbid using Google content “in conjunction with a non-Google map” ([Google Maps Platform terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)). You cannot keep OpenFreeMap tiles and buy Google routing. The choice is binary: full Google basemap plus Google routing, or neither.

At this report’s volumes — 300 trips per driver per month, 3 map sessions and 2 route calls per trip, 1 geocode and 0.3 autocomplete per trip — the list-price arithmetic is:

| Monthly bill | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---:|---:|---:|
| Google, mobile Maps SDK plus Routes, Geocoding, Autocomplete | ~$350 | ~$3,830 | ~$18,320 |
| Mapbox, Directions plus mobile MAU plus temporary Geocoding | $0 | ~$1,110 | ~$9,770 |
| Self-host, Hetzner plus OpenFreeMap plus OSRM plus Photon/Geoapify | ~$7 | ~$70 | ~$400 |

Google is about **46×** the self-hosted stack at 10,000 drivers and Mapbox about **24×**; the premium buys address coverage and an SLA, not traffic ([Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing); [Mapbox pricing](https://www.mapbox.com/pricing); [Hetzner](https://www.hetzner.com/cloud/cost-optimized/); [OpenFreeMap](https://openfreemap.org/); [OSRM](https://github.com/Project-OSRM/osrm-backend)). Buy Google only for a contract or address coverage outside Palestinian cities; buy Mapbox only under 25k MAU and 100k Directions. Mapbox’s coverage table has no Palestine row, so its address search is unproven ([Mapbox coverage](https://docs.mapbox.com/help/dive-deeper/mapbox-data/)).

Keep the self-hosted base: **MapLibre RN + OpenFreeMap**, mirrored to PMTiles when paying customers arrive; **OSRM on a Hetzner CX33** with a custom edge-cost layer for checkpoints, closures, permit roads and settlement bypasses; **Photon and Nominatim** plus an Arabic alias table, with Geoapify’s 3,000 free credits/day as fallback. Move to Valhalla when time-of-day speeds matter. Do not buy traffic for Palestine until a vendor publishes a PS traffic row or you measure its ETA against local ground truth ([MapLibre RN](https://github.com/maplibre/maplibre-react-native); [Valhalla](https://valhalla.github.io/valhalla/); [Geoapify](https://www.geoapify.com/pricing)).

## The SMS bill and the Hawiya decide who gets onboarded

Firebase is the cheapest documented self-serve +970 route: **$0.29 per SMS**, first **10 SMS/day free** (about 300/month), **50,000 MAU free** ([Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)). It is also the lowest-risk build: phone-only accounts, RN support via `react-native-firebase`, no separate SMS aggregator contract. The catches are hard. Phone verification is **Blaze-only**; plain Firebase Auth caps at **3,000 SMS/day**; new projects allow **no SMS regions** until Palestine is enabled; Android needs Play Integrity; and Google publishes no Palestinian delivery rate ([Firebase limits](https://firebase.google.com/docs/auth/limits); [Android phone auth](https://firebase.google.com/docs/auth/android/phone-auth); [RNFirebase](https://rnfirebase.io/auth/usage); [Expo auth guide](https://docs.expo.dev/develop/authentication)).

Twilio is the most expensive credible route and the most transparent: **$0.4101 per SMS**, plus **$0.05 per successful verification**, so **$0.4601** before retries ([Twilio PS pricing](https://www.twilio.com/en-us/sms/pricing/ps); [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing)). Numeric sender IDs are unsupported, two-way SMS is unsupported, and long codes are best-effort and overwritten with a generic alphanumeric sender — a trust problem when the code arrives from an unknown name ([Twilio PS guidelines](https://www.twilio.com/en-us/guidelines/ps/sms)). D7 publishes **$0.29** and LabsMobile **€0.2750**; Infobip and Sinch appear only in secondary comparisons ([D7](https://d7networks.com/sms/palestine); [LabsMobile](https://www.labsmobile.com/en/prices/pricelist); [Sent.dm, secondary](https://www.sent.dm/fr/resources/sms-pricing/palestinian-territory-sms-pricing)).

The local route can beat $0.29, but nobody publishes its price. Jawwal sells Bulk/Application SMS with a custom sender name; HotSMS is a certified Jawwal/Ooredoo aggregator with a dedicated API; Ooredoo exposes **CAMARA OTP** and **Number Verification** ([Jawwal](https://www.jawwal.ps/en/9663/9910/9917); [HotSMS](https://www.hotsms.ps/portal/hotsms/en); [Ooredoo CAMARA OTP](https://developer.ooredoo.com/api/camara-otp)). Number Verification can confirm an MSISDN **without an SMS** on Ooredoo data, but Jawwal has no public equivalent, and a secondary estimate puts Jawwal at roughly 78% of the market ([Ooredoo verification use case](https://developer.ooredoo.com/use-cases/user-verification)). The missing number is a written Jawwal or HotSMS quote for OTP rate, sender-ID registration, DLR and latency; until then, $0.29 is the planning number, not the floor.

WhatsApp is the only lever that changes the order of magnitude. Palestine maps to Meta’s **“Other”** region, and authentication templates are the cheapest category but the most restrictive: approved template, OTP button, no URLs, media or emoji, 15-character parameters ([Meta WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [Meta auth templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates)). A BSP quotes **€0.0092 per authentication message**, roughly 30× cheaper than Firebase ([Messaggio](https://messaggio.com/pricing-whatsapp/palestine)). But Twilio’s calculator shows “Authentication Template (Not available for this region)” for at least one region, and I could not confirm whether that applies to Palestine ([Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing)). Treat WhatsApp as a primary channel with SMS fallback only after a two-week field test proves template approval and delivery at +970.

Verification is the other local document problem. Stripe Identity is **$1.50 per verification, first 50 free**, but Stripe’s country list omits Palestine, so it is unusable ([Stripe Identity](https://stripe.com/identity); [Stripe global availability](https://stripe.com/global)). Shufti markets explicit support for the **Palestinian Hawiya**, PA passport, driving licence and Arabic OCR ([Shufti Palestine](https://shuftipro.com/supported-countries/palestine/)). Sumsub’s Palestine list accepts **only a passport** ([Sumsub documents](https://docs.sumsub.com/docs/qes-supported-identity-documents)). Persona starts at **$250/month with a 12-month minimum**, a 1,000-driver decision ([Persona pricing](https://withpersona.com/pricing/)). At 100 drivers, manual review of Hawiya, selfie, licence, registration and plate costs $0 in software and 5–10 minutes per driver — one to two working days. Automate when that becomes an FTE.

At 3,000 / 30,000 / 300,000 OTPs per month — one login per driver per day — the SMS bill is:

| Channel | 3,000 OTPs | 30,000 OTPs | 300,000 OTPs |
|---|---:|---:|---:|
| Firebase PS, $0.29 | $783 | $8,613 | $86,913 |
| Twilio SMS, $0.4101 | $1,230 | $12,303 | $123,030 |
| Twilio Verify, $0.4601 | $1,380 | $13,803 | $138,030 |
| WhatsApp auth, €0.0092, unverified | €28 | €276 | €2,760 |
| Local Jawwal/HotSMS/Ooredoo | quote only | quote only | quote only |

Email and push are noise beside this: Resend Free is 3,000 emails/month, SES is $0.16 per 1,000, and Expo Push is free at 600 notifications per second ([Resend](https://resend.com/pricing); [SES](https://aws.amazon.com/ses/pricing/); [Expo push](https://docs.expo.dev/push-notifications/faq/)). The cliff is not MAU; it is the first SMS.

## Realtime transport decides the bill, and free tiers die at pilot

At 100 drivers sending one position every 10 seconds for 8 hours a day over 26 working days, the workload is about **7.5 million position updates a month**, or **9 million messages with 20% rider fan-out**; at 1,000 it is 90 million; at 10,000 it is 900 million. Supabase Free includes **200 concurrent connections and 2 million messages/month**; Pro includes 500 connections and 5 million messages, then **$2.50 per million** and **$10 per 1,000 connections** ([Supabase pricing](https://supabase.com/pricing); [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)). Firestore’s free tier is **20,000 writes/day**, and 100 drivers at 10-second cadence produce **288,000 writes/day**, 14× the quota; RTDB Spark caps at **100 simultaneous connections** ([Firestore quotas](https://firebase.google.com/docs/firestore/quotas); [RTDB limits](https://firebase.google.com/docs/database/usage/limits)). Ably Free is 200 connections and 6 million messages; Pusher Free is 100 connections and 200,000 messages/day; PubNub Free is 200 MAU or 1 million transactions ([Ably](https://ably.com/pricing); [Pusher](https://pusher.com/channels/pricing/); [PubNub](https://www.pubnub.com/pricing/)). Every free tier dies in a pilot.

Cloudflare Durable Objects are the exception because they bill WebSocket messages at a **20:1 ratio**, hibernate idle objects, and charge no egress for outgoing messages ([Cloudflare DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). At 10,000 drivers and 10-second cadence, the modelled bill is about **$21/month** — roughly $6.60 in requests, $9.40 in duration, and the $5 plan floor. Supabase Realtime or Ably at the same volume is about **$2,260/month**. That is a ~100× difference and the single largest avoidable cost in the stack. The catch is durability: a Durable Object’s SQLite storage is fine for presence and offer leases, not for trip history or the ledger. Pair DO with Postgres.

Hosting and database free tiers are just as brittle. Neon Free gives **100 CU-hours/month**; at the 0.25 CU floor that is **400 hours, about 16.7 days**, and scale-to-zero after 5 minutes adds a cold start ([Neon](https://neon.com/pricing)). Render’s free web service sleeps after **15 minutes**, and its free Postgres **expires 30 days after creation** ([Render free](https://render.com/docs/free)). Fly.io has **no free tier** ([Fly pricing](https://fly.io/docs/about/pricing/)). Oracle Always Free is the only free always-on VM — **2 OCPU / 12 GB Ampere, 200 GB block** — but Oracle may reclaim idle instances, it has no Levant region, and one A1 box holding both database and realtime is one reboot from an outage ([Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)).

Recommended floor: **Cloudflare DO for presence, offers and chat; Supabase Pro for Postgres/PostGIS and trip history; Fly.io or Hetzner for the API and OSRM.** The first paid dollar should go to the realtime transport and a Postgres with backups, not a bigger VM.

| Rank | Free-tier trap | Documented limit | When it bites |
|---:|---|---|---|
| 1 | Daily SMS OTP at Twilio PS | $0.4101/SMS from message one | 3,000 OTPs = $1,230, >20× the pilot stack |
| 2 | Firebase phone auth’s default SMS region policy | New projects allow no regions | First OTP fails until Palestine is enabled |
| 3 | Render free web and free Postgres | 15-minute sleep; database expires in 30 days | A quiet pilot cold-starts or loses its database |
| 4 | Neon Free | 100 CU-hours; scale-to-zero after 5 minutes | Compute suspends around day 17 |
| 5 | Supabase Free | 200 connections, 2M messages, 500 MB, pauses after a week, no backups | Messages exhausted in ~7 days; a quiet week pauses the project |
| 6 | Firestore and RTDB free tiers | 20k writes/day; 100 connections | 100 drivers at 10 s exceed writes in under 2 hours |
| 7 | Cloudflare DO Free | 100k requests/day | About 24 driver-days at 10 s |
| 8 | Ably, Pusher and PubNub free tiers | 100–200 connections; Pusher 200k messages/day | Connections or messages exhausted in the pilot |
| 9 | Google Maps free tier | 10k free events per SKU; the $200 credit is gone | 100 drivers: 60k routes and 30k geocodes, about $350 |
| 10 | Mapbox free tier | 25k MAU and 100k Directions | 1,000 drivers: 600k routes, about $960 |
| 11 | OpenFreeMap | No SLA, donation-funded | 9M sessions/month depend on one public service |
| 12 | Oracle Always Free | Idle reclamation, no Levant region | The router or database disappears, or latency is unmeasured |

## Payments are local or not at all — and the cheapest honest stack is $60

Payments are the largest variable cost and the least global. Stripe, PayPal, Checkout.com and HyperPay are not usable by a West Bank merchant: Stripe’s country list omits Palestine, PayPal’s selector has no Palestinian locale, Checkout.com’s country terms exclude Palestine, and HyperPay says it has no acquiring bank in Palestine ([Stripe global](https://stripe.com/global); [PayPal countries](https://www.paypal.com/en/webapps/mpp/country-worldwide); [Checkout.com country terms](https://www.checkout.com/legal/country-terms); [HyperPay FAQ](https://www.hyperpay.com/faq/can-we-utilize-your-services-in-palestine-gaza/)). Paddle does not list Palestine as an unsupported seller country, but its ride-hailing policy and Palestinian payout rail are unconfirmed, and it pays **monthly, $100 minimum, by the 15th**, with a possible **$15 SWIFT fee** ([Paddle supported countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle); [Paddle payouts](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid)). That is a rider-side experiment, not a driver payout rail.

The credible local rails are narrow. Bank of Palestine charges **2.5% on all cards**, settles on the **second working day**, and takes **3–5 working days** to approve a merchant ([BOP gateway](https://www.bop.ps/en/business/electronic-services/payment-gateway)). Its QR rail charges **0.25%**, debits the customer instantly, and works across BOP, Arab Islamic Bank and PalPay apps — but it is a merchant-present QR, not a documented API for per-trip dynamic amounts ([BOP QR](https://www.bankofpalestine.com/en/about/news/725)). PalPay is a PMA-regulated PSP, but its fee page renders empty, so its rate is not public ([PalPay](https://www.palpay.ps/en/merchants/e-commerce-service)). Cash remains the default, and the launch ledger should be a double-entry cash ledger, not a payments feature.

Driver payouts are harder. No provider I could verify offers a documented programmatic payout API to Palestinian bank accounts or wallets at daily cadence. Paddle is monthly; Stripe Global Payouts is a US/UK-sender product and Palestine is not a documented recipient market; PalPay and Jawwal Pay move money wallet-to-wallet but publish no bulk API; Payoneer’s prepaid card is not available in the Palestinian Territories and users reported freezes in 2024 ([Stripe Global Payouts](https://docs.stripe.com/global-payouts/send-money/recipient-countries); [Jawwal Pay](https://www.jawwalpay.ps/en/customers/money-transfer); [BHRRC on Payoneer](https://www.business-humanrights.org/it/latest-news/palestineisrael-criticism-against-wise-and-payoneer-for-freezing-the-accounts-of-palestinians-in-gaza-in-disproportionate-adherence-to-regulations-incl-co-comment/)). Cash reconciliation is not a compromise at launch; it is the only rail with same-day settlement and no counterparty permission. Digital payout becomes viable when a local PSP exposes a bulk credit API or BOP accepts a batch file.

Payment fees dwarf infrastructure once digital share rises. At 100 drivers, 30,000 trips at an assumed 20 ILS average fare is 600,000 ILS GMV; a 20% card mix costs 3,000 ILS at 2.5%, and a 30% QR mix costs 450 ILS at 0.25% — **3,450 ILS/month in acceptance fees versus roughly 220 ILS (about $60) for the entire software stack**. At 1,000 drivers the same mix is **34,500 ILS/month**. The mix is illustrative; the rates are BOP’s.

Cost model: 30 days; 10 trips per driver per day (300 per month); 3 map sessions and 2 route calls per trip; 1 OTP per login per day; 1 push per trip. Drivers only, so rider OTPs and map MAU are understated.

| Assumption or bill | 100 drivers | 1,000 drivers | 10,000 drivers |
|---|---:|---:|---:|
| Trips per month | 30,000 | 300,000 | 3,000,000 |
| OTP at 1 login per day | 3,000 | 30,000 | 300,000 |
| Daily SMS at Firebase $0.29 | $783 | $8,613 | $86,913 |
| Daily SMS at Twilio $0.4101 | $1,230 | $12,303 | $123,030 |
| Onboarding SMS, 10% new drivers, gross | 10, $3 | 100, $29 | 1,000, $290 |

| Tier | Drivers | What is included | Monthly, device-bound OTP | What is missing | At 1 OTP per login per day |
|---|---:|---|---:|---|---:|
| Free / under $25 | ≤25, closed alpha | Oracle A1 running Postgres/PostGIS, OSRM, API, Centrifugo; OpenFreeMap; Resend Free; Expo Push; R2; manual KYC; cash + QR | $0–6 | Backups, failover, SLA, Levant region, 24/7 support, card, phone OTP at volume | Not viable; 750 OTPs would cost ~$130 |
| Pilot under $100 (closed) | 100 | Render API, Supabase Pro, Cloudflare DO, Hetzner OSRM, free tiles/email/push/R2, 10 onboarding SMS, monitoring | ~$60 | HA, 24/7 safety, automated KYC, card gateway, PITR, multi-region, tile SLA | ~$843 with Firebase; ~$1,290 with Twilio |
| City under $500 | 1,000 | 2× Render, Supabase Pro + Small, DO, 2× Hetzner, R2, Resend Pro, 100 SMS, monitoring | ~$217 | 24/7 dispatcher/safety, automated payouts, time-series store, multi-zone, second region | ~$8,830 with Firebase; ~$12,520 with Twilio |
| Scale under $2,000 (infra) | 10,000 | 4× Render, Supabase Pro + Large, DO, 3× OSRM, R2, Resend, 1,000 SMS, monitoring, location store | ~$1,620–$1,740 | 24/7 multi-person dispatch/safety, automated payouts, fraud/risk ops, staff for 3M trips | ~$88,500 with Firebase; ~$124,600 with Twilio |

The jump from $60 to $1,620 buys resilience and throughput, not trust; the jump to daily SMS is **$783 at 100 drivers and $86,913 at 10,000**, larger than every server line combined. Azure is the buy-reliability option at several times the cost; the gap is resilience, not features. None of the four stacks includes a 24/7 dispatcher, a safety response team, driver payouts, cash-in-transit, legal and licensing, app-store fees or marketing. At 100 drivers those are people costs; at 10,000 they are the company.

## Field-test thirteen claims before anyone says Uber-quality

None of the rows below is green today. The notes record page observations and a handful of live OSM and Azure queries; no OTP was sent to a +970 handset, no payment was integrated, no app was run on a device, and no local operator was quoted. The matrix is the minimum field evidence that would replace a vendor claim with a measured result. The thresholds are proposed product bars, not Uber-published SLOs; the 99.9% availability and 43.2-minute error budget come from Google’s SRE method, and the 4-digit, 5-attempt PIN comes from Uber’s public description ([Google SRE](https://sre.google/workbook/implementing-slos/); [Uber PIN](https://www.uber.com/us/en/blog/pin-verification-drivers)).

| # | Claim to prove | Pass criterion | Smallest test | Why documents cannot settle it |
|---:|---|---|---|---|
| 1 | OTP arrives on Jawwal, Ooredoo and Paltel fixed line | 3/3; 50 sends each; ≥95% within 30 s; p95 recorded | 150 sends across four cities | No carrier publishes a +970 delivery rate |
| 2 | Sender ID and delivery receipts are usable | Stable alphanumeric sender on both mobile carriers; per-message DLR; +97256/+97259 accepted | 20 messages, screenshots and DLR IDs | Long codes may be rewritten; DLR semantics vary |
| 3 | Qalandia and Huwwara geocode to the crossing | Aliases return the checkpoint, not a bus stop, a street or Peru | 20 Arabic and English queries | Nominatim returned zero; Photon returned false positives |
| 4 | The absence of live traffic is handled honestly | 50 trips; p50 ETA error ≤2 min or 20%; p90 ≤5 min; no live-traffic claim | 50 trips with GPS ground truth | Google marks PS traffic `—`; no vendor sells probe data |
| 5 | Checkpoint and closure routing works | Closed checkpoint within 200 m avoided; ETA flags delay; 10/10 on a closure day | 10 trips through Qalandia and Huwwara | OSRM has no closure semantics |
| 6 | WebSocket survives a real drive on React Native | 30-minute drive, airplane mode, Wi-Fi/4G; p95 fix age ≤5 s; no gap >2 intervals | Two phones; fix, server, viewer and arrival timestamps | Native WebSocket behavior on RN is unmeasured |
| 7 | Realtime fan-out holds a city | 800–1,000 connections at 25 msg/s; p95 <1 s; no disconnect | Load test on the chosen transport | Connection quotas are not p95 latency |
| 8 | Map tiles fail and recover cleanly | First tile p95 ≤3 s; failure state ≤20 s; retry ≥99% | Block OpenFreeMap, then restore | OpenFreeMap has no SLA |
| 9 | Database failover and restore are real | Restore ≤5 min; no lost committed order; measured RTO | Kill the primary, promote, reconcile | Backups are documented; restore time is not |
| 10 | The cost model reconciles to the bill | One month of meters within 10% | Export DO, Supabase, SMS and maps billing | Price meters are documented; usage shape is not |
| 11 | QR and card settlement work | QR settles; card create, capture and refund reconcile | One low-value transaction per rail | No real payment integration was performed |
| 12 | Hawiya and vehicle verification work | 10 real drivers; documents accepted; extraction accuracy recorded | Manual review plus one vendor if Shufti is shortlisted | Only Shufti markets Hawiya support |
| 13 | Dispatch is bounded and exclusive | 15 s TTL, 3 offers, 90 s deadline; expired offers rejected; no double assignment | 100 staging rounds with forced expiry races | Offer leases are a design, not a vendor feature |

The smallest field run is two phones, 20 trips on two West Bank routes including a frequently closed checkpoint, with timestamps at fix, server receipt, viewer render and arrival. That closes the tracking, ETA and map rows; the carrier, payment, failover and cost rows need their own days. Do not call the product Uber-quality until the matrix is green and the results are published internally.

**Scope and evidence.** Prices and coverage are a **29 October 2026** snapshot, USD list prices excluding tax and FX; EUR→USD at ~1.08 is an assumption. No provider was field-tested for this report except the live OSM, OSRM, Nominatim and Photon queries; the Azure Maps test is from the earlier review. Everything else is provider documentation. No local operator quote, no payment integration, no device run, and no WhatsApp or Shufti field test was performed. This is a decision input, not a procurement quote or a quality certificate.

## Conclusion

Two conclusions change the buying decision. First, the cost curve is not servers; it is SMS, payment acceptance and payroll. The cheapest infrastructure is close to free at 100 drivers, and the difference between a $60 pilot and a $1,290 pilot is whether the app sends a code every day. Second, the moat is the checkpoint and closure graph, the cash ledger and the answered SOS — local, cheap relative to their value, and unsold by any vendor.

The practical sequence: launch cash plus QR on a $60 stack with device-bound auth; spend the first paid dollars on backups and a second instance, then a local SMS or WhatsApp route, then a staffed safety rota; automate KYC when manual review is the bottleneck; add cards when corporate or delivery demand pays the 2.5%. The cheapest honest stack is the one that can lose a server, a database or an SMS route without losing a fare or a passenger.
