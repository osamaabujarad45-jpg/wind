# KNOWLEDGE — Uber Rider API/Backend Contract Study (2026-11-02, verified revision)

> **Framing.** Authorized competitive-architecture study of an app the owner is
> authorized to examine. Goal: design/engineering **patterns** for an independent
> courier app (Fastship) — **not** cloning, infringing, or attacking. Static,
> read-only analysis of a local decompile. No proprietary code or artwork is
> reproduced; paths, route literals and field names are cited as evidence only.
> Each claim is **[O]** observed in the decompile, **[I]** inferred, or **[U]**
> unknown from static analysis.
>
> **Method.** Pass 1 was extracted by a delegated model (Kimi K3 via Bedrock)
> after both Claude pools rate-limited. Pass 2 (this revision) re-read the cited
> files, re-ran the censuses directly, and checked every Fastship claim against
> the working tree. §0 lists what pass 2 changed.
>
> **Evidence root:** `%LOCALAPPDATA%\Temp\opencode\uber\rea-full\sources\` (`…`).
> Abbreviations: `G` = `…\com\uber\model\core\generated`, `RT` = `G\rtapi\services`.
> Counts cover `…\com\uber` + `…\com\ubercab`. Obfuscated roots (`yua`, `a56`,
> `zhb`, `m0a`, `w46`, `z19`, `y19`) were read where a trail led, not enumerated.
> JADX can mis-restore code and routes assembled at runtime are invisible, so
> counts are floors.

---

## 0. What pass 2 changed

| # | Pass-1 claim | Verified result |
|---|---|---|
| 1 | `GET /rt/locations/v2/autocomplete` is a route (cited `yua\C139748a.java`) | **Wrong.** No Retrofit declaration exists for autocomplete, origins or destinations. `yua\C139748a.java` is a 10-path **set** of "core endpoints" for connectivity metrics (§3.5). Current text search is gRPC `maps.text-search/Search` (§1.2). |
| 2 | gRPC surface not covered | 50 `@GrpcApi(path=…)` literals; the `maps.*` family is the modern maps/location contract (§1.2). |
| 3 | `/rt/locations/v3/labeled/all` is GET/POST/DELETE with the base path | `/all` is **POST** only. |
| 4 | "Every call carries `x-uber-call-uuid`" and it is an idempotency key | True of generated interfaces (~1,040 occurrences). The hand-written `com\ubercab\presidio\realtime\core\client\RidersApi.java` omits it, and an OkHttp interceptor (`m0a\C81124n.java:111-113`) mints a random UUID when it is absent. Idempotency use is **unproven**: `PickupRequestV2` has no request-id field. It is a per-call correlation id **[I]**. |
| 5 | Binary wire only on `resolve-location`, `upload-locations` | 6 `Accept: application/octet-stream` sites: also `fare-estimate`, `surge/batch`, `upload-driver-device-locations`, an integration-test route. |
| 6 | `/rt/riders/offer/*` = dispatch offers to adopt | Those are **rider-facing** offers (`RiderOfferPushModel`, `StatusResponse.scaledOffers`). Driver dispatch is `/rt/drivers/{accept,ack,expire,reject,finalize}-offers` (plural, batch). Both have **untyped** bodies, so payloads are **[U]**. |
| 7 | `PushModelListener` is the listener contract | Empty marker interface. Real path: `a56\C0779e` subscribe, `a56\C0790p` stages, `zhb\C142468w` store (§3). |
| 8 | Error union was **[I]** | Now **[O]**: 743 per-endpoint `*Errors` classes (§2.5). |
| 9 | Models listed: 3 | Added `ResolveLocationResponse`, `StatusRequest`, `ClientStatus`/`RideStatus`, `Eyeball`, `StatusMetadata`, `ScaledOffers`, `RidersPreTripMapData`, `AppLaunch*`, `PickupRequestV2`/`PickupResponse`, gRPC search models. |
| 10 | Caching = `FareCacheSettings` only | Added server-driven poll cadence, `cachedMessages`, `Meta` stamps, prefetch/full-payload flags, `replay(1)` store, parameter serving (§5). |
| 11 | Fastship: "no closed error union; `ApiError` base is new work" | `HttpError`/`fail()` and a typed `OfferFailure` already exist; the gap is 123 open codes (§6). |
| 12 | Fastship: "extend `requestId` to `jobs/:id/accept`, `/api/location`" | Accept is already guarded by `offerId` + `leaseNonce`; location is rate-limited fixes. `requestId` exists on order create and messages. |
| 13 | Fastship: "adopt Ramen cursor in `realtime.ts`" | Cursor, snapshot and signed group credential **already exist** server-side. The **client has zero consumers**. |
| 14 | Fastship: "adopt quote TTL cache" | `QUOTE_TTL_MS`, `expires_at`, `itinerary_hash`, server-locked `quoteId` exist. Only bucketed keys and a prefetch flag are new. |

**Pass 3 (independent re-read of the same decompile, 2026-11-03).** Rows 1–8 re-checked
against source: all hold (autocomplete/origins/destinations appear only in
`yua\C139748a.java`; six octet-stream sites; interceptor backfill at `m0a\C81124n.java:111-113`;
`RideStatus`/`TripCancellationType` values). Nothing above was wrong; pass 3 adds what was
missing: a per-route index file (§1.0), `share`, `begin` and the optimistic-entity header
(§1.6–1.7), eleven more rider-path routes (§1.9), fare-estimate and status error slots incl.
the replacement-fare payload and `forceUpgrade` (§2.1, §2.3), a worked status→slot→code
example for `ResolveLocationErrors` with the result envelope (§2.6), the push topic registry
(§3.1), Ramen extras that resolve the old `content_type` unknown (§3.4), the optimistic
request journal (§5), and three Fastship rows (§6).

---

## 1. Route table **[O]**

### 1.0 Census
- Pass 2 counted **1,046** unique `@retrofit2.http.*("literal")` (a broad grep that also
  catches gRPC-adjacent literals); an independent recount with a stricter `"/rt/..."`-only
  grep returned **1,030**. Both are method-dependent **floors** — runtime-assembled routes
  are invisible to static analysis. Of the broad pass-2 set: **POST 935 (89%)**, GET 89,
  PUT 13, DELETE 8, PATCH 1. Largest `/rt/` families: eats 77, unused 68, payment 65,
  riders 55, drivers 44, safety 38, users 28, trips 27. **Quote counts with the grep
  method, never as a single absolute number.**
- Path-version segments: `v2` 101, `v1` 58, `v3` 34, `v4` 2 (~19% of literals).
- **Per-route index (verb, path, interface file)** for every annotation:
  `research_notes\REA Uber app reverse engineering\evidence-k5-today\retrofit-route-index.tsv`
  (1,052 rows = 1,031 distinct path strings; 0 rows outside `com\uber` + `com\ubercab`); the 50
  gRPC paths are in `grpc-route-index.txt` beside it. §1 below quotes the rider-relevant rows;
  the index has the rest.
- Bodies: 944 generated `@Body` params, **822 untyped `Map<String,Object>`** (87%);
  only the hot core flows have models.
- Return type is `io.reactivex.Single<T>`; fire-and-forget returns `kotlin.Unit`
  (`noc\C91072d0.java`).
- Identity alias: the hand-written `RidersApi` and the core set use
  `/rt/riders/me/...`; generated interfaces use `{riderUUID}` (typed `RiderUuid`).
  **[I]** server resolves identity from the auth session, not the path.

### 1.1 Maps / location (REST) — `RT\location\LocationApi.java` unless noted
| Method | Path | Request → Response |
|---|---|---|
| GET | `/rt/locations/v2/reversegeocode` | query lat, lng, locale, geocoder → Object |
| POST | `/rt/locations/v4/reversegeocode` | `ReverseGeocodeV4Request` → `GeolocationResultsResponse` |
| GET | `/rt/locations/v2/details` | query id, provider, language → `GeolocationResult` |
| GET / POST / DELETE | `/rt/locations/v3/labeled` | query label, delegatedUserUUID / `PostLabeledLocationRequestV2` / query → `GeolocationResultResponse` / same / Unit |
| POST | `/rt/locations/v3/labeled/all` | `GetAllLabeledLocationsRequestV1` → `GeolocationResultsResponse` |
| POST | `/rt/riders/{riderUUID}/resolve-location` (binary) | `ResolveLocationRequest` → `ResolveLocationResponse` — `RT\marketplacerider\MarketplaceRiderApi.java` |
| POST | `/rt/riders/{riderUUID}/upload-locations` (binary) | upload model → Object — same file |
| POST | `/rt/unifiedlocation/uploadpositions` (`x-uber-request-type: shadow`) | Map → Unit — `G\edge\services\uploadLocation\UnifiedLocationApi.java` |
| POST | `/rt/locations/v1/upload-driver-device-locations` (binary) | `G\edge\services\locations\LocationsApi.java` |
| POST | `/rt/location-resolver/v1/getSemanticLocation` | `G\edge\services\location_resolver\thrift\LocationResolverApi.java` |
| POST | `/rt/venue/get-venue` | `G\p169rt\colosseum\ColosseumApi.java` (`rt` renamed `p169rt` by JADX) |

### 1.2 Maps / location (gRPC) — `G\uber\maps\presentation\SearchGrpcApi.java`, models `…\com\uber\maps\presentation\*.java`
Path style `api/grpc/<package>.<kebab-rpc>/<PascalRpc>`; messages are
protobuf-lite `GeneratedMessageLite`. Field tags below are from `*_FIELD_NUMBER`.

| gRPC path | Request (tag) | Response (tag) |
|---|---|---|
| `maps.text-search/Search` | `query`(1), `search_region`(2, geometry), `search_context`(3: INVALID=0, ORIGIN=1, DESTINATION=2, GEOBIASED=3), `search_type`(4: INVALID=0, AUTOCOMPLETE=1, FULL_TEXT_SEARCH=2) | `results`(1, repeated `GeoEntityLite`) |
| `maps.poi-search/POISearch` | `location_context`(1), `filters`(2), `context`(3), `metadata_info`(4), `search_request_metadata`(5) | `geo_entities`(1), `bounding_box`(2), `search_metadata_map`(3), `analytics`(4) |
| `maps.get-details/GetDetails` | `geo_entity_lite_id`(1) | `geo_entity_lite`(1) |
| `maps.reverse-geocode/ReverseGeocode` | `coordinate`(1) | `geo_entity_lite`(1) |
| `maps.get-access-points-for-place/GetAccessPointsForPlace` | `anchor_reference`(1), `intent`(2), `optimization_parameters`(3) | `groups`(1), `recommended_index_path`(2), `access_point_metadata`(3), `access_point_analytics`(100) |
| `maps.get-geofences-with-geometry-by-bounding-box/…` | `namespace`(1), `bounding_box`(2) | — |
| paths only | `get-access-points-for-user-location`, `get-geofence-with-geometry-by-id`, `get-epudos-for-geometry`, `get/upsert/delete saved-place`, `udl-get/upsert-address-form`, `get-sli-metadata` | — |
| `unifiedlocation.uploadlocation_v2/AddPositionsToLocationStore` | location upload | — |
| `…ParameterServingPresentation/GetMobileParameters[Unauthenticated]` | server-driven flags | — |

`GeoEntityLite` = `geo_entity_lite_reference`(1), `location`(2), `placelite`(3),
`access_point_lite`(4): **a search hit is a place or a pickup access point.**
`SearchContext.ORIGIN/DESTINATION` shows pickup and drop-off search are one
endpoint with a context flag. Search → lite hit → `GetDetails(id)` is a
two-step. **[U]** gRPC framing and headers (`@GrpcApi` transport) were not read.

### 1.3 Routing / ETA / fare / map overlay
| Method | Path | Request → Response | File |
|---|---|---|---|
| POST | `/rt/routing/fetch-routelines` | `RoutelineRequest` → `RoutelineResponse` | `RT\routing\RoutingApi.java` |
| POST | `/rt/routing/predict-bulk` | `PredictBulkRequest` → `PredictBulkResponse` | same |
| POST | `/rt/riders/{riderUUID}/fare-estimate` (binary) | `RidersFareEstimateRequest` → `RidersFareEstimateResponse` | `RT\pricing\PricingApi.java` |
| POST | `/rt/trips/{tripUUID}/mid-trip-fare-estimate` | Map → `MidTripFareEstimateResponse` | same |
| POST | `/rt/riders/pre-trip-map` | **Map (untyped)** → `RidersPreTripMapData` | `RT\helium\HeliumApi.java` |
| POST | `/rt/map-feed/get-map-feed` | Map → Object (untyped both ways) | `G\edge\services\eats\presentation\feed\getmapfeed\MapFeedApi.java` |
| POST | `/rt/surge/batch` (binary) | — | `G\edge\services\pricing\SurgeApi.java` |

ETA sources **[O]**: `Eyeball.nearbyVehicles[].{etaString, averageEta, minEta,
maxEta}`, `DispatchStatus.{eta, etr}`, push `TripDriverLocationUpdateV2.etaToPickup*`,
and `predict-bulk`.

### 1.4 Rider status / pickup / bootstrap — `RT\marketplacerider\MarketplaceRiderApi.java`
| Method | Path | Request → Response |
|---|---|---|
| POST | `/rt/riders/{riderUUID}/app-launch` | `AppLaunchRequest` → `AppLaunchResponse` |
| POST | `/rt/riders/{riderUUID}/status` | `StatusRequest` → `StatusResponse` |
| POST | `/rt/riders/{riderUUID}/client-status` | `StatusRequest` → `ClientStatusResponse` |
| POST | `/rt/riders/me/client-status`, `rt/riders/me/status` (no leading slash) | same, hand-written `com\ubercab\presidio\realtime\core\client\RidersApi.java`, no call-uuid param |
| GET | `/rt/riders/{riderUUID}/dispatch-view` | query region-id, lat, lng → `Rider` |
| POST | `/rt/riders/{riderUUID}/pickup`, `/v2/pickup` | `PickupRequest` / `PickupRequestV2` → `PickupResponse` |
| POST | `/rt/riders/{riderUUID}/create-draft-order` | Map → `CreateDraftOrderResponse` |
| POST | `/rt/riders/{riderUUID}/edit-pickup-location` | `EditPickupLocationRequest` → Unit |
| POST | `/rt/riders/map-change` | Map → Unit |
| POST | `/rt/riders/{riderUUID}/select-payment-options`, `select-profile`, `select-voucher`, `/rt/riders/v2/{riderUUID}/select-payment-profile` (v2 **before** the id) | — |

### 1.5 Dispatch / offers
- **Rider-facing** (same file): `POST /rt/riders/offer/{accept,ack,expire,reject}`,
  Map → Object. Pair with `RiderOfferPushModel` and `StatusResponse.scaledOffers`.
- **Driver-facing** (`RT\marketplacedriver\MarketplaceDriverApi.java`, declared in
  the rider APK by the shared codegen; **[I]** not called by rider flows):
  `POST /rt/drivers/{accept,ack,expire,reject,finalize}-offers`,
  `/rt/drivers/get-upfront-offer`, `/rt/drivers/v2/{go-online,go-offline,available,
  capabilities,fetch-online-blockers,pin-accept}`. All bodies Map, so offer
  payloads are **[U]**.

### 1.6 Trip lifecycle (rider)
`POST /rt/trips/{tripUUID}/rider-cancel` (`RiderCancelRequest` → `RiderCancelResponse`),
`rider-set-info`, `rider-set-interaction-types`, `rider-redispatch-new-driver`
(`com.uber.model.core.EmptyBody`, a typed empty body), `/rt/trips/rider-set-participant`
— all `MarketplaceRiderApi`. `POST /rt/trips/{tripUUID}/rider-redispatch-sdu`,
`/rt/trips/end-walking-experience` — `RT\trips\TripsApi.java`.
`GET /rt/trips/{tripUUID}/sdu-redispatch-info` — `RT\atg\AtgApi.java`.
`POST /rt/trips/{tripUUID}/cancellation-info` — `RT\pool\RiderPoolApi.java` (a POST read).
Share: `POST /rt/trips/{tripUUID}/share` (`ShareMyTripRequest` → `ShareMyTripResponse`),
`GET /rt/trips/{tripUUID}/share-yo-ride` → `ShareTripResponse`, `POST /rt/sharetrip/fetch` →
`FetchResponse` — all `RT\safety\ShareApi.java`.

### 1.7 Courier-relevant extras (`MarketplaceDriverApi`, all POST)
`/rt/trips/v2/{complete-stops, batch-complete-waypoint-tasks, set-waypoint-destination,
generate-pickup-verification-pin, confirm-pin-is-verified, begin, end, driver-cancel,
driver-rate, start-waiting}`, `/rt/trips/update-waypoint-order`,
`/rt/drivers/v2/waybill`, `/rt/drivers/tasks/cancel-sources`,
`/rt/drivers/v2/complete-task-sources`; request side `PickupRequestV2.riderItemDeliveryRequestInfo`.
Multi-stop task completion and PIN-verified handover are first-class here.
Also `POST /rt/trips/{tripUUID}/begin` (id-in-path form) and `POST /rt/movement/complete-movement-job`.
**`x-optimistic-entity`** (a `String` header, only 4 sites): `begin` (v2), `complete-stops`,
`end` (v2), `complete-movement-job` (`RT\marketplacedriver\MarketplaceDriverApi.java:24,33,39,60`).
Transitions that move a trip forward carry the entity version the client acted on **[I]**; reads
and cancels do not. `OPTIMISTIC` is its own transport-error kind (§2.6).

### 1.8 Realtime fallback and config
`GET /ramen/sessions/{sessionId}/messages` with headers `x-uber-call-uuid`,
`x-uber-package-name`, `x-uber-ramen-polling-source` —
`com\uber\app_ramen_polling\core\RamenPollApi.java` (HTTP poll of the same queue;
`PushNotifierToRamenBridge.java` in the same package bridges push notifications).
`GET /rt/riders/dispatchconfig` → `DispatchConfigResponse` —
`G\edge\services\dispatchconfig\DispatchConfigApi.java`.

### 1.9 More rider-path routes (verb, request → response, file — from the index)
| Method | Path | Request → Response | File |
|---|---|---|---|
| POST | `/rt/riders/v2/get-offers` | `EmptyBody` → `GetRiderOffersResponse` (carries `pollingIntervalMS`) | `G\edge\services\rideroffer\OfferApi.java` |
| POST | `/rt/riders/evaluate-market-status` | Map → Unit | `G\edge\services\matchingMarketStatus\MatchingMarketStatusApi.java` |
| POST | `/rt/riders/register-market-status-user-action` | Map → `RegisterMarketStatusUserActionResponse` | same |
| POST | `/rt/riders/product-configuration` | Map → `RidersProductConfigurationData` | `RT\riderproductconfigurations\RiderProductConfigurationsApi.java` |
| POST | `/rt/session/launch` | `EmptyBody` → Unit | `G\edge\services\sessionlaunch\SessionLaunchApi.java` |
| POST | `/rt/fares/get-fare-breakdown` | Map → `FareBreakdownResponse` | `G\edge\services\fares\FaresApi.java` |
| POST | `/rt/fares/metered-fare-estimate` | Map → Object | same |
| POST / DELETE | `/rt/navigation/{get, route-preview, create-route-plan, update-activity, inject-route-id}`; DELETE `/rt/navigation/delete-route-plan/{agent_uuid}` | Map → `NavigationResponse` / Object / Unit | `G\edge\services\routeplanner\RoutePlannerApi.java` |
| POST | `/rt/shopping-service/nearby_vehicles/` | Map → `BatchGetNearbyVehiclesResponse` | `G\edge\services\nearbyvehicles\NearbyVehiclesApi.java` |
| POST | `/rt/scaled-offers/get-scaled-offers/`, `/scaled-offer-action/` | not read | `ScaledOffersApi` |
| PUT | `/rt/riders/waypoint/{complete-waypoint-task, fail-waypoint-task, complete-ready-for-pickup-waypoint-task}` | not read | `G\edge\services\riderwaypoint\WaypointApi.java` |

Rider-path GETs in the whole index: `dispatch-view`, `dispatchconfig`,
`pin-verification-requirement`, `get-client-promotions`, `get-offer-confirmation`,
`favorite-drivers`, `safety-contacts`. Everything else on the rider path is POST.

---

## 2. Request/response shapes **[O]**

Every model: `@GsonSerializable(X_GsonTypeAdapter.class)`, a Wire-style `ADAPTER`
(numbered fields), a Builder with required-field null checks, and a trailing
`unknownItems` field. In decoders the `default:` branch stores unknown tags.

### 2.1 fare-estimate
**Request** `RT\pricing\RidersFareEstimateRequest.java` (40+ fields). Key ones:
`pickupLocation`, `destination`, `viaLocations`, `pickupStopIndex`/`dropoffStopIndex`
(multi-stop), `pickupTimeMS`, `isScheduledRide`, `vehicleViewId(s)`,
`selectedVehicleViewId`, `paymentProfileUUID`, `voucherUUID`, `participants`,
`capacity`, `dynamicFares` (client echoes fares it holds), `allowedDeltaPercents`,
`fareUuid`, `fareInfo`, **`fareConsistencyContext`**, **`estimateConsistencyOverride`**,
**`isPrefetchingRequest`**, **`shouldFallbackToFullPayload`**,
**`pricingProgressiveLoadingData`**, `clientCapability`, `mobileCountryCode`,
`mobileNetworkCode`, `version`, `userExperiments`.
**Response** `RidersFareEstimateResponse.java`: `uuid`(1), `packageVariants`(14),
`vehicleViewIds`(16), `productsDisplayOptions`(18), `pricingProductsListType`(19),
`remainingVvids`(21), `fareExpType`(22), `userExperiments`(23), `trace`(24),
`shouldRefetchFaresOnClientPaymentOptionChanges`(25),
`paymentProfileToggleSnackbarMessageString`(26), `fareCacheTTLSettings`(27),
`homeCurrencyDisplayables`(28). Tag gaps (2–13, 15, 17, 20) = retired fields.
**[I]** `remainingVvids` + request `pricingProgressiveLoadingData` = quotes load in
stages; `isPrefetchingRequest` marks speculative quotes.
**Errors** `FareEstimateErrors.java`: 13 typed slots (`badRequest`, `unauthenticated`,
`rateLimited`, `riderBanned`, `commuterBenefitsNotAllowed`, `flexibleDeparturesNoHotspot`,
`verifyIdentity`, `verifyMobile`, `fareEstimateInvalidLocation`, `fareEstimateInvalidRequest`,
`fareEstimateNotAllowed`, `fareEstimateOutsideServiceArea`, `fareEstimateFareExpired`) + `code`.
**`FareEstimateFareExpired{code, message, data{newDynamicFare: Map<String,DynamicFare>}}`: the
error carries the replacement fare**, so a stale quote costs one round trip, not two.
Sub-shapes: `FareCacheSettings{serverTime, validUntilEpoch, pickupHexResolution,
dropoffHexResolution}`; `FareConsistencyContext{priorFareId}`; `ConsistencyOverrideType`
`UNKNOWN(0)` / `ONLY_REMOTE(1)`; `PricingProgressiveLoadingData{prevFareSessionUuid,
pricingProductsListType, progressiveVvids[], recommendedProductsSize}`.

### 2.2 resolve-location
**Request** `RT\marketplacerider\ResolveLocationRequest.java`: `requestLocation`
(**required**), `context` (**required**, enum), `productsToOptimize`,
`optimizeLocation`, `requestNearbyLocations`, `timestamp`, `telemetry`,
`experimentationParams`, `faresType`, `productContext`.
**Response** `ResolveLocationResponse.java`: `resultantLocations`
(**required**, `UpdatedPickupSuggestion`), `locationSuggestions`, `nearbyPOIs`,
`nearbyLocations`. One call = "snap my pin, suggest alternatives".
Sub-shapes: `ResolveLocationContext` = `UNKNOWN(0)`, `PICKUP(1)`, `DROPOFF(2)`, annotated
`@EnumFallback("UNKNOWN")` (`ResolveLocationContext.java:4-5`); `ClientRequestLocation{targetLocation,
anchorGeolocation, rendezvousLocation, locationSource, analytics}`; `TargetLocation{latitude:
double, longitude: double, ts: Double, type: String}`; `UpdatedPickupSuggestion{anchorGeolocation,
pickups[], dropoffs[], routeSnap, refinementPayload, locationSource, metadata, updatedTimestamp}`;
shared place model `GeolocationResult{location, addressFormat, confidence, score, payload,
relatedLocations[], legacyAddressComponents[], analytics[], debugInfo}` (`G\p166ms\search\generated\`).
The route sends `Accept: application/octet-stream`. **Errors:** worked example in §2.6.

### 2.3 trip status
**Request** `StatusRequest.java`: `targetLocation`, `targetLocationSynced`,
`destination`, `selectedVehicleViewId`, `vehicleViewIds`,
`visibleVehicleViewIds`, `userExperiments`, `mcc`, **`cachedMessages: Map<String,Integer>`**.
**Response** `StatusResponse.java`: `clientStatus`(1, **required**), `eyeball`(2),
`city`(4), `dispatchStatus`(6), `metadata`(7), `provider`(8),
`fulfillmentStateData`(9), `scaledOffers`(10), `riderAppOrdersResponse`(11),
`singleRiderAppOrderResponse`(12), two booleans(13/14), `riderAppOrdersFetchResult`(15);
tags 3 and 5 reserved **[I]**.
- **State discriminator:** `ClientStatus.status` is `RideStatus` =
  `LOOKING(0) · DISPATCHING(1) · WAITING_FOR_PICKUP(2) · ON_TRIP(3)`
  (`G\rtapi\models\rider\RideStatus.java`); plus `statusDescription`, `isArriving`,
  `lastRequestType` = `TripCancellationType` {CLIENT_CANCELED, DRIVER_CANCELED,
  AUTO_CANCELED, REQUEST_EXPIRED, FORCE_ENDED, UNKNOWN(5)}.
- `DispatchStatus`: `eta`, `etr`, `title`, `message`, `icon`, `titleIcon`,
  `waitTimeDescription`, `topDriverCandidates[]` (`DispatchCandidate`: `uuid`,
  `pickupLocation`, `pickupRouteline`, `locations[]`, `spritesheet`),
  `demandShapingStatus`, `isScheduleStatus`.
- **`StatusMetadata{pollingIntervalMs, targetLocationSynced}`** and
  **`ScaledOffers{isPollingEnabled, pollingIntervalMS}`**: the server tells the
  client how often to poll.
- `PickupResponse{clientStatus, eyeball, trip, singleRiderAppOrderResponse,
  checkoutActionParameters}`: **a mutation returns fresh state**.
- `PickupRequestV2` (50+ fields): `fareUuid`, `fareEstimateInfo`,
  **`riderFareConsent`**, `jobUUID`, `pickupRetry`, `recoverySpec`, `draftSpec`,
  `suggestedPickup`, `pinLocationSource`, `readyWhenYouAreInfo`, `isBatching`,
  `riderItemDeliveryRequestInfo`. No request-id/idempotency field.
- `AppLaunchRequest`/`Response` (cold-start bootstrap): in `mobileParameters`,
  `deviceParameters`, `requestPickupLocation`, `vehicleViewIds`; out `city`,
  `client` (`Rider`), `provider`, `status`, `riderAppOrdersResponse`,
  `appLaunchMessageOverlay`.
- **Errors** `StatusErrors.java`: `badRequest`, `unauthenticated`, `rateLimited`, `riderBanned`,
  `riderNotFound`, **`forceUpgrade`** (the status poll doubles as the client-version gate), `code`.
- `ClientStatus` also carries `meta` (`Meta`), `isConcurrencyEnabled`, `lastRequestJobUUID`,
  `lastRequestMsg`, `lastRequestNote`, `tripPendingRouteToDestination`.

### 2.4 map-feed (three different things)
1. **`/rt/map-feed/get-map-feed`** (Eats): untyped both ways, no model classes in its
   package, and **no caller anywhere in the decompile** (`getMapFeed(` has 0 references outside
   `MapFeedApi.java`). It is not a rider tracking call; the 2026-11-01 routes doc listed it
   under tracking in error (corrected there).
2. **`/rt/riders/pre-trip-map`** → `RidersPreTripMapData`: `pickupHotspots[]`,
   `dropoffHotspots[]` (`Hotspot{location, encodedPolyline, callout}`),
   `encodedPickupArea`, `encodedDropoffArea`, `pickup/dropoffWalkingRadiusMeter`,
   `pickup/dropoffTooltip`, `pickupHotspotsExplainer`, `pickupRefinementInstruction`,
   `peopleWaiting`, `optimizingRoute`, `isFromAirport`, `cityId`, `disableCanceling`.
   Server-driven overlays, not client geometry.
3. **`Eyeball`** (inside status): `nearbyVehicles: Map<String,NearbyVehicle>`,
   `nearbyAssets`, `dynamicFares`, `fareSplit`. `NearbyVehicle{averageEta, minEta,
   maxEta, etaString, vehiclePaths: Map<VehicleUuid, List<VehiclePathPoint>>}`;
   `VehiclePathPoint{latitude, longitude, course, speed, epoch}`. Cars animate
   along **server-supplied timestamped paths** between polls.

### 2.5 Error union and code discriminator
- **Hundreds of classes** extend the shared error base (`w46\AbstractC128229d.java`,
  `UNKNOWN_CODE = "synthetic.unknown"`, `isUnauthorized` flag, `isUnknown()`). Pass 2
  counted **743** with one base-class grep; an independent recount (`extends w46`)
  returned **839** files. Treat the exact number as a method-dependent **floor** — the
  durable fact is "hundreds of per-endpoint `*Errors` classes," e.g.
  `RT\marketplacerider\AcceptOfferErrors.java`: a `code` string plus nullable typed
  slots `badRequest`, `unauthenticated`, `unauthorized`, `notFound`, `rateLimited`
  (exactly one set).
- Slot types `G\rtapi\models\exception\*`: `BadRequest{code, data: Map<String,String>,
  message}`, `NotFound`, `RateLimited{code, message}` (no retry-after),
  `Unauthenticated{code, errorCode, message}`, `Unauthorized`, plus
  **`DuplicateRequest`**, `Forbidden`, `PayloadLimited`, `InvalidDeviceError`,
  `NoActiveSession`, `InternalServerError`, and **`DisplayAction`/`DisplayPayload`**
  (server tells the UI what to show). Each slot has its own closed `*Code` enum.
- Discriminators seen: error `code` string; proto enums with `*_INVALID = 0`;
  JSON enums with `UNKNOWN(5)`; `RideStatus`; Ramen `oneof`; `SearchContext`.
- **Required vs tolerant:** Builders throw on missing required fields
  (`requestLocation`, `context`, `clientStatus`, `resultantLocations`); decoders
  keep unknown tags. *Fail on what you require, never on what you don't know.*

### 2.6 Worked example: `ResolveLocationErrors` and the result envelope
**Shape** (`RT\marketplacerider\ResolveLocationErrors.java`, base `w46\AbstractC128229d`, exactly one
slot set): 6 generic slots (`badRequest`, `unauthenticated`, `unauthorized` = `RiderUnauthorized`,
`notFound`, `rateLimited`, `serverError`), 5 endpoint-specific slots (`invalidLocationSourceError`,
`invalidContextError`, `badRequestError`, `invalidGeolocationResolutionError`,
`geolocationNotFoundError`) and the `code` string. Every slot class is `{code: <closed enum>, message}`.
**Discriminator** — spelled out per endpoint in the generated client
(`RT\marketplacerider\MarketplaceRiderClient.java:718-816`), two levels: **HTTP status first, body
`code` second.**

| HTTP | Body `code` | Slot | `code` set on the union |
|---|---|---|---|
| 401 | not read | `unauthenticated` | `rtapi.unauthorized` |
| 403 | not read | `unauthorized` | `rtapi.rider.forbidden` |
| 429 | not read | `rateLimited` | `rtapi.too_many_requests` |
| 500 | not read | `serverError` | `rtapi.internal_server_error` |
| 400 | `rtapi.riders.resolve_location.` + `invalid_location_source` / `invalid_context` / `invalid_geolocation_resolution` / `bad_request`, or `rtapi.bad_request` | the matching endpoint slot, or `badRequest` | the same string |
| 404 | `rtapi.riders.resolve_location.geolocation_not_found`, or `rtapi.not_found` | `geolocationNotFoundError`, or `notFound` | the same string |
| other | any | none | **`synthetic.unknown`** |

401/403/429/500 pick the slot by status alone (the body is parsed into that slot's class); only
400/404 switch on the body `code` string. An error classified by RPC code instead of HTTP status
(`w46\AbstractC128234i`, kinds `RPC_CODE` / `STATUS_CODE`) throws "unable to handle RPC exceptions" on
this HTTP-only endpoint. `BadRequestCode` has a single value (`BAD_REQUEST`): the **code string** is the
discriminator, the enum only types the payload.
**Call envelope.** A generated call returns a three-way result `v46\AbstractC123731y<T, U>`: data, a
**transport error** (`w46\C128232g`, kinds `CONVERSION`, `HTTP`, `NETWORK`, `OPTIMISTIC`,
`UNEXPECTED`), or the **typed error** `U`. A call builder (`v46\C123727u`) chains
`api(class) → errorFactory + call → build(transaction)`; the `Transaction` hook lets a response write
into the shared in-memory store (`com\uber\presidio\realtime\core\DataStore.java`) **[I]**. The call id
is minted per call (`com\uber\presidio\realtime\core\RealtimeClient.java:6-8`, `UUID.randomUUID()`)
before the lazy `Single` is built and captured by the closure, so a resubscribe resends the same id **[I]**.

---

## 3. Realtime **[O]**

### 3.1 PushModel twin
Each pushable model has a singleton extending `v46\AbstractC123724r<T>`, a pair
(model class, **string topic**), e.g.
`RT\marketplacerider\TripDriverLocationUpdateV2PushModel.java` →
`"trip_driver_location_update_v2"`. Siblings: `DispatchStatusPushModel`,
`TripEventsDataPushModel`, `StatusResponsePushModel`, `RiderOfferPushModel`,
`EyeballPushModel`, `CityPushModel`. `com\uber\presidio\realtime_push\core\PushModelListener.java`
is an **empty marker interface**.

**Topic registry** (the second constructor argument; 125 `*PushModel` classes in the tree, all
this shape). A pushed payload is often the **same class** the matching HTTP call returns:

| Topic string | Payload class | HTTP twin |
|---|---|---|
| `push_status` | `StatusResponse` | `POST /rt/riders/{id}/status` (same class both ways) |
| `push_rider` | `rtapi.models.rider.Rider` | `GET /rt/riders/{id}/dispatch-view` |
| `push_riders_pre_trip_map` | `RidersPreTripMapData` | `POST /rt/riders/pre-trip-map` |
| `dispatch_status`, `push_eyeball`, `push_city` | `DispatchStatus`, `Eyeball`, `City` | fields inside `StatusResponse` |
| `push_rider_offer` | `RiderOffer` | none seen |
| `trip_driver_location_update_v2` | `TripDriverLocationUpdateV2` | none (push only) |
| `push_riders_trip_status_tracker`, `riders_trip_events_info` | `TripStatusData`, `TripEventsData` | none seen |
| `driver_routing_update` | `edge.services.routeplanner.NavigationPushUpdate` | `/rt/navigation/get` **[I]** |
| `push_rider_fare_breakdown`, `push_scaled_offer`, `fare_estimate_order_selection`, `matching_signal`, `push_reliability_status` | `edge.services.fireball.*` (`Push…Action`) | fares and scaled offers **[I]** |

`TripDriverLocationUpdateV2` (push only): `tripUuid`, `etaToPickup`, `etaToPickupString`,
`etaToPickupStringShort`, `currentRoute` (encoded polyline), `encodedCurrentTraffic`,
`vehiclePathPoints[]`, `prediction[]`, `meetupLocation`, `isAgentDetached`.

### 3.2 PushClient pipeline — `a56\C0779e.java:68`, stages `a56\C0790p.java`
- Named stages: `PUSH_CLIENT → RAMEN_CONSUMER → DATA_STORE`.
- `subscribe(pushModel, listenerClass)` **merges two transports**: the gRPC
  `RamenClient` (`com\ubercab\network\ramengrpc\RamenClient`) and a legacy path,
  so a migration needs no consumer change.
- Each item is wrapped in a result type (`z46\AbstractC140922b<U>`); a decode
  failure is published as a `w46` error subtype on an error subject **[I]**.
- On success in application scope the client acks `(msgType, messageId,
  listenerName, "PushClient")`, so acks carry the consuming stage.

### 3.3 Realtime store — `zhb\C142468w.java`
Implements `TripDriverLocationUpdateStream`. Subscribes by push model, folds into
a **map keyed by `tripUuid`** (latest message wins), then `.skip(1).replay(1)
.refCount()`. A late subscriber instantly gets the last-known state map;
`forTrip(id)` = `map[id]` + `distinctUntilChanged`.

### 3.4 Ramen wire envelope — `com\ubercab\ramen\proto\*`
- `RamenRequest`: `lastseen_seq_id`(1), `messageAcks[]`(2: `uuid`(1),
  `processing_timestamp`(2)), `featureAcks[]`(3: `uuid`(1), `consume_timestamp`(2),
  `background`(3), `num_consumer_plugins`(4), `consumer_plugins`(5)), `controlMsg`(4).
- `RamenResponse` **oneof**: `msgs`(1: list of `Msg`), `controlMsg`(2),
  `heartbeat`(3). `Msg`: `seq`(1), **`type`**(2, the topic string), `uuid`(3),
  `priority`(4), `content`(5: `content_type`(1), `payload`(2)), `create_timestamp`(6),
  `request_feature_ack`(7), `session`(8).
- `RamenControlMsgReason`: `INVALID`(0), **`DISCONNECT`**(1).
- Newer mirror `com\uber\streaming\ramen\*` adds `Priority`, `ContextHeaders`,
  GraphQL-subscription frames (`GraphqlSubReg/Cancel/Ack/Nack`).
- **[I]** one stream, typed messages by topic string, per-message ack, `lastseen_seq_id`
  resume = at-least-once + client dedup, heartbeat for liveness, server can ask for
  reconnect, HTTP poll fallback (§1.8).
- Newer mirror field tags (`com\uber\streaming\ramen\*`): `RamenStreamingRequest{last_seen_seq_id 1,
  message_acks 2, feature_acks 3, control_msg 4, graphql_subs 5, graphql_unsubs 6}`;
  `RamenStreamingResponse{msgs 1, control_msg 2, heart_beat 3, graphql_sub_status 4}`; `Msg` adds
  `connection_timestamp 9`, `pushed_at_timestamp 10`, `context_headers 11` (trace headers),
  `graphql_msg_type 12`; `MessageAck{message_id 1, processing_time_in_ms 2, consumption_time_in_ms 3}`;
  `Priority` `INVALID 0 · LOW 1 · MEDIUM 2 · HIGH 3`; `RamenControlMsgReason` adds **`REFRESH(2)`**
  (server asks for a resubscribe without dropping the link).
- App-side message model `com\ubercab\network\ramen\model\Message.java`: `type`, `msgUuid`, `seq`,
  `priority`, payload as a JSON string **or** bytes with `contentType` = `json` / `protobuf` (resolves
  the pass-1 unknown), and **`diffInterpretType`**: a message may be a full snapshot or a diff
  **[I]**, and the client is told how to apply it.
- Ack and poll also exist over HTTP: `POST /ramen/events/v2/ack`
  (`G\streamgate\api\StreamgateApi.java`), `GET ramen/events/ack`
  (`com\ubercab\network\ramen\RamenChannel.java`); poll in §1.8.

### 3.5 Core-endpoint set (metrics) — `yua\C139748a.java`
A 10-path set (`/rt/riders/me/{app-launch,v2/pickup,fare-estimate,status}`,
`/rt/locations/v2/{autocomplete,origins,details}`, `/rt/locations/v3/destinations`,
`/rt/locations/v4/reversegeocode`, `/rt/venue/get-venue`) behind base
`z19\AbstractC140446a`, consumed by a connectivity-metrics client
(`y19\C136169a`, only when parameter `isConnectivityMetricsEnabled`). Parameter
names in `z19\C140447b`: `getCoreEndpoints`, `getAppLaunchEndpoint`,
`isMeanTimeToRecoverEnabled`, `isTripNetworkLatencyEnabled`, `getUrlBlocklists`,
request latency/error breakdown flags. **[I]** the rider's *critical journey* is a
named set; availability, latency and time-to-recover are measured on that set only,
and the set can be overridden remotely.

---

## 4. Contract style **[O]**

- **Dual serializers per model.** Gson `X_GsonTypeAdapter extends` the shaded
  `TypeAdapter`, annotated `@GsonSerializable.ConstructorParameterCount(n)`, with
  lazily created per-field delegate adapters; string value classes use
  `TypeSafeStringTypeAdapter` (null-safe wrap). JSON keys = camelCase field names.
  The Wire `ADAPTER` uses tags. Binary is **opt-in per endpoint**: 6 sites.
- **Typed hot path, untyped long tail** (87% Map bodies, §1.0).
- **Path versioning is per endpoint, old versions stay live:** `/v2/reversegeocode`
  + `/v4/reversegeocode`, `/pickup` + `/v2/pickup`, `/rt/riders/v2/{id}/select-payment-profile`.
- **Headers:** `x-uber-call-uuid` ~1,040 times; every other `x-uber-*` is rare
  (`x-uber-uuid` 33, `x-uber-region-id` 12, `x-uber-client-name` 11,
  `x-uber-device-language` 9, `x-uber-client-user-session-id` 8,
  `x-uber-request-uuid` 7, `x-uber-client-version` 6). Interceptor backfills the
  call uuid (`m0a\C81124n.java:111-113`, flag-gated).
- **Call-id origin:** generated clients mint it per call (`RealtimeClient.java:6-8`); the
  interceptor only backfills hand-written clients. Two rarer headers worth knowing:
  `x-optimistic-entity` (4 trip transitions, §1.7) and `x-uber-request-type: shadow` (shadow
  traffic on the unified-location upload and the mirror/integration-test services).
- **Unknown-tolerant enums and decoders:** `@EnumFallback("UNKNOWN")` on Wire enums (e.g.
  `ResolveLocationContext`), `fromValue` maps any unseen int to `UNKNOWN`; Gson decoders skip
  unknown keys and null values, and write explicit nulls.
- **Typed empty body** (`EmptyBody`) and `Unit` return for no-payload POSTs.
- **Per-endpoint error class** with code + typed slots (§2.5).

---

## 5. Offline / caching hints **[O]**

| Primitive | Where | What it does |
|---|---|---|
| Server-driven poll cadence | `StatusMetadata.pollingIntervalMs`, `ScaledOffers.isPollingEnabled/pollingIntervalMS` | Each response says when to ask again. |
| Quote TTL + cache key | `RT\pricing\FareCacheSettings.java` | `serverTime`, `validUntilEpoch`, `pickupHexResolution`, `dropoffHexResolution` (H3-style bucketing). |
| Prefetch / payload-diet flags | fare request `isPrefetchingRequest`, `shouldFallbackToFullPayload` | Speculative quotes and light payloads, with a full-payload escape. |
| Refetch triggers owned by server | fare response `shouldRefetchFaresOnClientPaymentOptionChanges` | Server declares when the client cache is stale. |
| Per-object freshness | `G\rtapi\models\object\Meta{lastModifiedTimeMs, originTimeMs}` on status sub-objects | Order pushes vs polls by timestamp. |
| Last-known-good realtime state | `zhb\C142468w` `replay(1)` keyed map | Late subscribers get current state at once. |
| Resume | Ramen `lastseen_seq_id` + HTTP poll fallback | Gap-free resume after a drop. |
| Parameter serving | `AppLaunchRequest.mobileParameters`, `GetMobileParameters` | Server-driven flags, cached client-side. |
| Cache manifest | `StatusRequest.cachedMessages: Map<String,Integer>` | Field exists; **[U]** semantics (no caller found). |
| Optimistic request journal | `com\uber\presidio\realtime\core\optimistic\model\SerializableHttpRequest.java` (`method`, `url`, `mediaType`, `headers`, `body` bytes); transport-error kind `OPTIMISTIC` (`w46\C128232g.java`); header `x-optimistic-entity` (§1.7) | An HTTP request can be persisted and replayed, and a failed optimistic transition is its own error kind. **[I]** the offline queue for lifecycle actions; no UI flag found. |

**[U]** No explicit offline-UI flag observed. Quote TTL + server-driven cadence are
the concrete primitives.

---

## 6. Adopt vs skip for Fastship (grounded in the working tree)

Fastship today: 90 hand-rolled `route(...)` entries in `server\main.ts`; domain
modules `server\domain\*` (`dispatch`, `quotes`, `realtime`, `ride-lifecycle`,
`journey`, `events`, …); client `src\api.ts` + `src\api-client.ts`.

| Pattern (Uber evidence) | Fastship today | Verdict | Where |
|---|---|---|---|
| **Server-driven poll cadence** (`StatusMetadata.pollingIntervalMs`, `ScaledOffers`) | 15 `useApi` calls with fixed 10–60 s intervals chosen per screen; server sends no hint (0 hits for `nextPollMs`/`retryAfter` in `server\`) | **ADOPT (top)** | Add `nextPollMs` to order/jobs/track payloads (`server\domain\journey.ts` serializer); consume at `src\api.ts:86-88`, clamp 2–60 s; keep `terminal()` stop. Lets ops slow polling without an app release. |
| **Closed error codes + category/recovery** (743 `*Errors`, `synthetic.unknown`) | `fail()`→`HttpError` (`server\main.ts:191`); ≥123 distinct open codes, closed type only for `GoogleRoutesErrorCode`; typed `OfferFailure{category,recovery}` for accept/decline only (`server\domain\journey.ts:70`, `server\main.ts:3198`, `src\api-client.ts:53-59`) | **ADOPT (narrow)** | One exported `ApiErrorCode` tuple shared by server and client; extend `{category, recovery}` to other mutations behind `journeyProtocol=1`; keep client fallback `'server_error'` (= unknown). Skip per-endpoint classes. |
| **Realtime resume** (Ramen cursor, snapshot, control, poll fallback) | Server **already** issues `eventCursor`, `snapshotPath ?after=`, signed group token, `web_pubsub`/`long_poll` (`server\domain\realtime.ts:60-69,136-138`); **0 client consumers** in `src\` | **WIRE UP, don't redesign** | Have `useApi`/`useLiveFix` read `/realtime` and resume with `after=<cursor>`. **SKIP** per-message acks. |
| **Core-endpoint metrics set** (`getCoreEndpoints`, MTTR) | `clientDiagnostics.record('api_result', {durationMs, outcome, httpStatus})` has no route identity (`src\api-client.ts:67-69`) | **ADOPT (small)** | Add a route-template key (`/orders/:id`, never raw ids) for a fixed list: price, order create, order get, live, jobs accept, location. Per-endpoint p95 and error rate for the 50-user pilot. |
| **Per-call correlation id** (`x-uber-call-uuid`) | Server correlation IDs already exist (`server/main.ts:3089,3161,3200`); client request-ID propagation is missing | **ADOPT (cheap)** | Extend the existing server correlation context with a validated client request ID; retain the server-generated ID as fallback. Tracing only; idempotency stays with `requestId`/lease. |
| **Vehicle motion hints** (`VehiclePathPoint{course,speed,epoch}`) | Fix is `{point, updatedAt, ageSeconds, heading?, accuracy?}` (`src\model.ts:146`); no `speed` | **ADOPT (small)** | Add `speed` to the driver fix so the map extrapolates between 2 s long-poll answers. Skip multi-point prediction. |
| **Quote TTL + cache key + prefetch flag** (`FareCacheSettings`, `isPrefetchingRequest`) | `QUOTE_TTL_MS = 120_000`, `expires_at`, `itinerary_hash`, server-locked `quoteId` (`server\domain\quotes.ts:6,191,259`); ETA `validity.expiresAt` with clock offset (`src\app\book.tsx:287`) | **HAVE**; optional extra | Only add a `prefetch` flag or cell-bucketed key if routing cost shows (`src\api.ts:39-41`). |
| **Idempotent create** (`DuplicateRequest`, call uuid) | `order_commands(user_id, request_id, payload_hash)` on order create (`server\main.ts:1465-1503`); optional `requestId` on messages (`:1883`); accept guarded by `offerId`+`leaseNonce` in `BEGIN IMMEDIATE` | **HAVE** | None. |
| **Optimistic transition token** (`x-optimistic-entity` on begin / complete-stops / end) | Driver commands already take `requestId` + payload hash, replay the stored outcome (`idempotency_conflict` on a changed payload) and require `expectedStatus` (`server\main.ts:2233-2246`); assignment fence via `assignment_epoch` (`server\domain\ride-lifecycle.ts:64-115`) | **HAVE** | None; stronger than one header. |
| **Ordered telemetry** (call uuid on the location upload) | `/api/location` takes an active-GPS fence `{sessionId, seq, assignments[{orderId, assignmentEpoch}]}` and answers `sequence_old` for a stale `seq` (`server\main.ts:2325-2332`) | **HAVE** | A per-call UUID adds nothing here; do **not** add `requestId` to location (pass 2 row 12 stands). |
| **Error carries the replacement** (`FareEstimateFareExpired.data.newDynamicFare`) | `quote_expired` (409, `server\main.ts:1290`) and `price_changed` (409, `:1425`) return a bare code; `fail()` takes no payload (`:191`); the client re-calls `/api/price` | **ADOPT (small)** | Let `HttpError` carry an optional body and attach the fresh `{quoteId, quoteExpiresAt, price}` to those two 409s: one round trip less at the worst moment of the funnel. |
| **Offer lifecycle** (rider `offer/*`; driver batch `accept/ack/expire/reject/finalize-offers`, untyped) | `POST /api/jobs/:id/offer`, `/accept`; states offered/accepted/declined/expired/released (`server\domain\dispatch.ts`); no ack/seen | **HAVE**; optional `ack` | `ack` (device received) would split "never delivered" from "ignored" for re-offer timing; measure push delivery first. **SKIP** batching and finalize. |
| **State returned with the mutation** (`PickupResponse`) and **last-known-good** | Cancel returns `getOrder`; `setData(next)` (`src\api.ts:99-103`); keep last snapshot on transient failure (`:64-66`); server keeps `good_lat/good_lng/good_at` (`server\db\sqlite-schema.ts:147`) | **HAVE** | None. |
| **Freshness stamps** (`Meta{lastModifiedTimeMs, originTimeMs}`) | `version`, `assignment_epoch`, `updatedAt` | **HAVE** (epoch is stronger) | None. |
| **Typed hot path, validate at the edge** | `validateApiResponse` (`src\api-client.ts:60`), `requireContract` (`src\wire-contracts.ts`) | **HAVE** | Keep to hot paths only. |
| **Search two-step** (`Search{query,region,context,type}` → lite hit → `GetDetails`) | No search/geocode anywhere in `src\` or `server\`; booking is city + pin (`src\booking.ts:74`) | **DEFER; adopt shape when search lands** | `GET /api/places/search?q&ctx=<origin or destination>&bias=lat,lng` → `[{id, point, label, kind}]` + `GET /api/places/:id`; provider keys stay server-side. |
| **resolve-location + access points** | Pickup pin is set client-side (`src\pin-sheet.tsx`, `src\customer-location.ts`) | **ADAPT later** | `POST /api/location/resolve {point, context}` → canonical pickup + nearby spots, after West Bank map QA has road/access data. |
| **Server-driven map overlays** (`RidersPreTripMapData` areas/hotspots) | `/api/roads` reports, route checkpoints | **ADAPT when zones exist**; **SKIP** hotspots | Service-area polygons from the server; hotspots need demand data. |
| PushModel twin (class ↔ topic) | One realtime stream per order | **SKIP** | Revisit when more than one topic is pushed; `server\domain\events.ts` types are enough. |
| Dual wire (Wire + Gson), `unknownItems`, Retrofit/Rx codegen, `EmptyBody`/`Unit` | JSON + TypeScript | **SKIP** | Extra JSON keys are already ignored. |
| Everything-POST RPC (89% POST) | GET reads, e.g. `/api/route`, `/api/orders` | **SKIP** | Cacheable and simpler. |
| In-path versioning (~19% of literals) | Opt-in `journeyProtocol=1` query (`src\api.ts:24-25`) | **SKIP path versions** | Keep the query-flag protocol. |
| Cache manifest `cachedMessages` | Small payloads | **SKIP** | Use ETag if a payload grows. |
| Courier extras (waypoint tasks, PIN pickup, waybill) | Proof/handover flows exist in the order screen and admin proof-reset | **HAVE**; compare later | Reference when multi-stop lands. |

---

*Unknowns that matter.* Offer, map-feed, pre-trip-map-request, draft-order and
mid-trip-fare payloads are untyped in the client **[U]**. Whether the server dedupes on
`x-uber-call-uuid` **[U]**. `cachedMessages` semantics **[U]**. gRPC framing **[U]**.
Ramen `diffInterpretType` values and apply rules **[U]**. One app version only: treat contract *styles*
(server-driven cadence, per-endpoint error union, cursor resume, required-vs-tolerant
fields) as durable and literal paths as perishable.
