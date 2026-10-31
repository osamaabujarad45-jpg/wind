# T03 map contract and synthetic regional corpus

Status: implementation contract prepared; regional and paid-provider acceptance pending. This document does not activate Google billing or change the service area.

## Existing compatible contract

`GET /api/route?from=lat,lng&to=lat,lng&heading=degrees` requires authentication. `server/main.ts` roadRoute returns km (kilometres), minutes, and line tuples in **[longitude, latitude]** order. Point objects use `{latitude, longitude}`. Optional avoids/through arrays contain checkpoint names and closed contains Point objects. Never swap these representations. Preserve these fields for old clients; provenance additions are optional or use a separate endpoint.

Coordinates must be finite, latitude within ±90, longitude within ±180. Reject malformed geometry, negative/nonfinite distance or duration and oversized payloads before rendering. Existing provider/parser bounds remain authoritative; adapters must have explicit finite point/byte limits and tests. A failed road request supplies no line or road ETA; quote estimates remain explicitly marked and do not become map geometry.

## Platform and provider decisions

- Android baseline: hosted MapLibre in WebView. Web baseline: MapLibre. iOS baseline: Apple maps. Baseline routes come from configured OSRM, never an implicit public demo service.
- Opt-in Google renderers must be compiled/configured for each native platform and loaded for web. A runtime switch only selects renderers available in that artifact. Unrecognized capabilities choose baseline.
- Route provenance is `osrm` or `google`; renderer family is `maplibre`, `apple` or `google`. Google geometry and provider-generated address content must never be passed to MapLibre/Apple. Switching back clears overlays and independently requests baseline data. Do not reuse the OSRM LRU for Google content.
- Public recipient tracking uses baseline routing. Anonymous ETA polls cannot initiate paid calls.
- Pricing, commissions, service eligibility, checkpoint delays and custody decisions remain server authority. A displayed Google route does not alter OSRM-based quote/checkpoint policy.
- Routing capability distinguishes configured, healthy, unavailable reason and renderer availability. Essential DB readiness does not imply routing readiness.

## Request lifecycle and paid calls

Every route request is associated with account, order, driver, next stop, endpoint coordinates and provider. Cancel obsolete work and reject late results when any identity changes, including logout, recipient-link revocation, stop transition and provider switch. A failed refresh clears freshness; old route data cannot silently become a current ETA.

Paid triggers: initial meaningful preview, destination change, significant foreground movement, explicit authorized retry. No paid trigger on rerender, stationary poll, background timer or anonymous link refresh. Before activation, T08 must enforce atomic per-user and global finite request budgets, simultaneous-request reservations, coalescing, timeout handling and explicit exhaustion responses using a fake provider. Unapproved/unset production budgets disable paid routing. Operator approval of traffic forecast, monetary limits, restricted keys, billing, geography and alert ownership is required for live activation.

No raw Google response logging or unreviewed durable caching. Review applicable agreement and each content class before storage. Google Routes map results require Google maps presentation; current policy reference: https://developers.google.com/maps/documentation/routes/policies (read 29 October 2026). Terms and field acceptance are separate gates. SDK baseline: https://docs.expo.dev/versions/v57.0.0/ .

## Synthetic regional corpus

Concrete input pairs and provider fixture conditions are in [maps-corpus.json](maps-corpus.json): 35 cases with separate service and routing expectations. Village/boundary offsets are deliberately synthetic; checkpoint scenario names do not assert surveyed checkpoint positions.

These are named synthetic scenarios, not surveyed endpoints or evidence that a road is passable. Resolve endpoints from existing city/checkpoint fixtures, never customer GPS. For each case record service-area decision independently from route availability, checkpoint outcome and provider response. The shared `servedCity` 20 km bound remains unchanged. Operator confirmation and supervised field checks remain required.

| ID | Scenario | Expected fixture assertion |
|---|---|---|
| R01 | Ramallah centre to centre | Same-city quote and valid road geometry are separate |
| R02 | Nablus centre to centre | Same-city route can have nonzero road distance |
| R03 | Tulkarm centre to centre | Tuple orientation preserved |
| R04 | Jenin centre to centre | Pins remain visible when route absent |
| R05 | Hebron centre to centre | Arabic labels do not change coordinates |
| R06 | Bethlehem centre to centre | No straight chord substituted |
| R07 | Ramallah to Nablus | Intercity quote policy preserved |
| R08 | Nablus to Tulkarm | Driver heading optional |
| R09 | Tulkarm to Jenin | Reversed endpoints produce independent route |
| R10 | Hebron to Bethlehem | Road distance does not redefine service coverage |
| R11 | Village fixture 5 km from city | Service accepted independently of provider |
| R12 | Village fixture 17 km from city | Within current shared 20 km bound |
| R13 | Village fixture just inside 20 km | Accepted by service-area fixture |
| R14 | Village fixture just outside 20 km | Rejected even if provider returns road |
| R15 | Unsupported remote locality | No paid routing before eligibility |
| R16 | Qalandia synthetic closed checkpoint | Closure provenance retained |
| R17 | Huwwara synthetic slow checkpoint | Server delay policy retained |
| R18 | Closed checkpoint with alternate road | Avoids/through fields match chosen fixture |
| R19 | Closed checkpoint without alternate | Explicit through warning; no safety guarantee |
| R20 | Two closed checkpoints | No duplicate no-entry markers |
| R21 | Closure moved during request | Old response cannot overwrite new state |
| R22 | Provider returns no road | Pins and explicit unavailable state |
| R23 | Provider times out | Bounded wait; retry available |
| R24 | Provider 403 | Configuration failure visible to operators |
| R25 | Provider 429 | Budget failure without automatic billable loop |
| R26 | Malformed/nonfinite coordinate | Rejected before renderer |
| R27 | Oversized line | Rejected at adapter bound |
| R28 | Driver reassigned during request | Previous driver response discarded |
| R29 | Pickup becomes dropoff during request | Previous stop ETA discarded |
| R30 | Google switches to baseline mid-request | Google content discarded; independent OSRM fetch |
| R31 | Recipient link revoked mid-request | No private marker/ETA survives |
| R32 | Stationary anonymous 15-second polling | Zero Google calls |
| R33 | Simultaneous identical paid previews | Budget reservation/coalescing tested |
| R34 | Google renderer missing from binary | Safe baseline; no paid request |
| R35 | Account logout/login during request | No route from previous account |

T06–T15 must turn relevant cases into executable fixture assertions. This corpus specifies them; it does not claim those assertions or field journeys have passed.
