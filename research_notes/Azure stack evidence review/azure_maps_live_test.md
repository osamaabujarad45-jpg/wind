# Azure Maps live verification — 29 October 2026

This note corrects the documentary conclusion in `azure_maps_palestine.md`. That note said Palestine was absent from every coverage table and that Azure Maps could not serve the trip flow. The documentation is internally inconsistent, and the live service does return West Bank data.

## Test setup

- Temporary Azure Maps **Gen2** account (`wind-maps-verify`), kind `Gen2`, SKU `G2`, location `global`, in a temporary resource group `rg-wind-maps-verify` (West Europe metadata).
- Subscription: `Azure subscription 1` (`9b3ca69d-0c12-40c8-8a47-11aec6a73840`), tenant `e11bef2c-f666-4252-a5be-7623637018e5`.
- Calls made from the Windows development host over the public internet on 2026-10-29, using `api-version=2025-01-01` for geocode/route and `2024-04-01` for raster tiles.
- No application was deployed; no Palestinian device or network was used. Latency from Palestine was not measured.
- The account and resource group were deleted immediately after the test; `Microsoft.Maps` was returned to `NotRegistered`.

## Results

### Routing (Route Directions, car)

| Trip | Azure Maps | OSRM demo server | Notes |
|---|---|---|---|
| Ramallah → Nablus | 54.503 km, 3,305 s (55 min), 1,317 points | 53.499 km, 3,705.5 s (62 min) | Within 1 km of OSRM; Azure is 7 min faster |
| Ramallah → Hebron | 56.5 km, 3,660 s (61 min) | not run | Route returned |
| Ramallah → Jerusalem | 23.4 km, 1,920 s (32 min) | not run | Route returned |
| Qalandia → Ramallah | 6.9 km, 1,080 s (18 min) | not run | Route returned |
| Ramallah → Nablus, `travelMode=truck` with width/height/weight | 55.5 km, 3,840 s (64 min) | — | Returned despite no truck coverage for Palestinian Authority; restrictions are not trustworthy |

All car routes returned `trafficDelayInSeconds: 0` and `trafficLengthInMeters: 0`.

Route Matrix (2×2, Ramallah/Nablus) returned HTTP 202 with a polling URL, then HTTP 200:
- Ramallah→Ramallah: 0 km.
- Ramallah→Nablus: 63.561 km, 3,839 s (64 min). The matrix result differs from Route Directions (54.5 km); treat matrix geometry as a separate routing profile until explained.

### Rendering (raster tiles, `microsoft.base.road`)

| Tile | Bytes | Visual content |
|---|---|---|
| Ramallah z12 | 15,107 | City-scale road network |
| Ramallah z14 | 18,155 | Al Manara Square, Al-Bira, Sharia Nablus, road geometry |
| Ramallah z16 | 16,699 | Al Manara Square, Al-Muntazah Park, Al Ma'rad, Sharia Jaffa, Al-Ahli Hospital, Al-Nozha |
| Tel Aviv z14 (control) | 15,425 | Road network |

The Ramallah z16 tile renders dense street geometry and Latin-transliterated labels. This directly contradicts the render-coverage page's statement that a missing country means "data isn't provided".

### Geocoding

| Query | Result |
|---|---|
| `Ramallah` | West Bank, confidence High, 35.1952,31.9031 (second result: Ramallah, Iran, Low) |
| `Nablus` | West Bank, confidence Medium, 35.2569,32.2205 |
| `رام الله` (Arabic) | West Bank, confidence High, first result |
| Reverse `35.2034,31.9038` | "Al Manara Square, 26 Bint Jbeil, Ramallah, West Bank", High, Rooftop |
| `Qalandia` | 0 features |
| `Huwwara` | 0 features |
| `Qalandia checkpoint` | Philippines, confidence Low (wrong continent) |
| `Checkpoint 300` | Philippines, confidence Low (wrong continent) |
| Reverse `35.2265,31.8616` (Qalandia) | "Atarot industrial zone, East Jerusalem, West Bank" — coordinates near Qalandia, no checkpoint name |

City-level English and Arabic geocoding works. Landmark and checkpoint geocoding does not: two of the most important West Bank crossings return zero or a Philippines match.

### Traffic

- `traffic/flow/tile/png` at Ramallah z14 returned HTTP 200, `image/png`, 1,241 bytes. The Tel Aviv control returned the identical 1,241-byte blank tile, so this endpoint did not demonstrate usable flow data for either city.
- The coverage table has no Palestinian Authority traffic entry; Israel's traffic is marked "temporarily unavailable" (footnote 3).
- Every route reported zero traffic delay.
- The incident-details endpoint returned 404 for both Ramallah and Tel Aviv, so the call path/version was not proven; do not cite it as coverage evidence.

## Documentation contradiction

The live routing-coverage page contains two tables:

1. An older table with columns *Route Directions, Route Range, Route Matrix & Snap to Roads | Real-time traffic | Truck route* that omits Palestinian Authority.
2. A newer table with columns *Route Directions & Snap to Roads | Real-time Traffic | Truck Route Directions | Route Matrix & Range* that includes `Palestinian Authority<sup>1</sup>` with a check only in the first column. Footnote 1 means "partial road data with at least coverage for major roads".

The geocoding, traffic, and render pages contain no Palestinian entry at all, yet the live render and geocode calls return West Bank data. The coverage tables are therefore not a reliable predictor of service behaviour; a live call is required.

## Verdict

Azure Maps is **not** coverage-empty for the West Bank. It renders Ramallah streets and routes Ramallah–Nablus within about 1 km of OSRM, with a plausible time. The reasons not to adopt it as the primary map are different from the earlier report:

1. No real-time Palestinian traffic; ETA cannot beat the current OSRM estimate.
2. No checkpoint/closure/permit semantics; the app's checkpoint-avoidance moat is not representable.
3. Truck routing returns a route with no documented Palestinian truck coverage, so freight restrictions cannot be trusted.
4. Landmark/checkpoint geocoding fails (Qalandia, Huwwara, Checkpoint 300).
5. No first-party React Native SDK; native SDKs retired, WebView only.
6. Transaction pricing ($4.50/1,000 Gen2 transactions) versus zero marginal cost for OSRM/OpenFreeMap.
7. Only EU/US data residency and TomTom as a location-query subprocessor.

Keep OSRM + MapLibre as primary. Azure Maps is a credible **secondary/benchmark** for city geocoding or raster fallback behind a server proxy, not the system of record for routing or dispatch.
