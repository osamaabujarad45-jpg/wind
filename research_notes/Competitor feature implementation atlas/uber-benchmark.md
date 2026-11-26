# Uber rider app 4.655.10001 — Competitor Feature Implementation Atlas (Wind differentiation targets)

**Compiled:** 13 Nov 2026 · **Subject:** `com.ubercab` 4.655.10001 ("the 4.655 build"), diffed against the repo's archived 4.654.10002 evidence · **Nature:** static, read-only study of a publicly distributed APK set. No Uber system was contacted, no credential was used, no traffic was captured, no device was touched. Identifiers and short strings only — no Uber code or visual assets are reproduced.

**Wind context assumed throughout:** Expo ~57 / RN 0.86.3 / React 19, MapLibre/Google-Maps rendering behind `src/map-provider-boundary.tsx` + `src/google-map.*`, custom SQLite via `server/` (route registry in `server/main.ts`), CloudFront/EC2 delivery, cash-first product. Wind has **no** place-search backend yet (`src/place-search.ts` is a client-side filter over a static list) and **no** saved-places table.

## 0. Method, labels, and evidence bases

Every claim carries one of:

| Label | Meaning |
| --- | --- |
| **[O]** | Observed — read from a tool result in this session, cited to file + line/offset |
| **[D]** | Derived representation — decompiled method or DEX class table; not original source |
| **[I]** | Inference — a reading of observed structure |
| **[U]** | Unknown — not establishable from this artifact by static analysis; stated, never guessed |

**4.655 observed vs 4.654 archive.** The 4.655 build was analyzed fresh in the `REA-2026-11-13-reference-apps/UBER-4.655-rider.md` session (read first for this file). The 4.654 build survives **only as the repo's archived evidence** at `research_notes/REA Uber app reverse engineering/evidence-k5-today/` (`dex-classes.txt.gz` 288,727 name-level class entries; `dex-api-paths.json` 1,406; `dex-urls.json` 479; `grpc-route-index.txt`; `wide-payment.json`). The 4.654 APK itself is gone from this machine. **Anything attributed to 4.654 below is "archive, not re-verified."** Counting bases differ (class-table vs JADX code-inventory view); where a number moved, the basis is named. The repo doc cited as "KNOWLEDGE-2026-11-01-uber-app-full-reference.md" does **not exist** at that path — its content lives in `KNOWLEDGE-2026-10-31-*` and `KNOWLEDGE-2026-11-01-*` docs; noted, not silently substituted.

**Local re-verifications performed for this file** (all `[O]`):

| Check | Result |
| --- | --- |
| `aapt2 dump resources` of `uber-rider__split_config.ar.apk` (re-dumped today, UTF-8) | 12,709 resource entries = 12,706 `string/` + 3 `plurals/`; every observed key carries both `(ar)` and `(ar-rSA)` variants — matches the study's 12,709 |
| `assets/parameters.json` parsed from the 4.655 base APK | 14,572 parameters total (int64 1,864 · float64 625 · string 1,423 · bool 7,281 · pluginSwitch 3,379) — matches study C8/E25 |
| Removed key `connect_location_editor_compose_migration` | absent; `connect_request_location_editor_state_tnkch8`, `connect_location_editor_completed_event_handler_tnkch8` both default `true` — matches study C16 |
| Map perf params | `mapdisplay_flipr_frame_rate`=0, `render_frame_allocator_capacity`=10,485,760, `tile_query_cache_size`=131,072, `tile_overlay_cache_size`=24 — unchanged |
| `mapdisplay_flipr_available_map_providers` default | `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}` — byte-identical to 4.654; plus NEW `mapdisplay_flipr_map_provider` (CONFIGURATION, empty default) and `mapdisplay_flipr_map_provider_manager` (FEATURE_FLAG) |
| 4.654 archive spot checks | `com.ubercab.presidio.realtime` = 147; `mapssdk.poi` = 0; the 6 new reserve `tb-static` URLs = 0 occurrences; `UberMapView` name-level entries = 16 (the 4.654 JADX output had failed to materialise them; 4.655 has 26); `generated.rider.product` = 41 (subtrees `intercity`/`reservations` only); `generated.rider.presentation` = 1,104; `mapsexperiencepresentation` = 38 (saved-places family only); `mapdisplay_framework` = 78 name-level entries, `map_hub_common` = 8 |
| `grpc-route-index.txt` (4.654) | `maps.get-saved-places/GetSavedPlaces`, `maps.upsert-saved-place/UpsertSavedPlace`, `maps.delete-saved-place/DeleteSavedPlace`, `maps.text-search/Search`, `maps.poi-search/POISearch` present; **no** GetMapPoisForAnchor — consistent with it being a 4.655 addition |

Primary sources: `research_notes/REA-2026-11-13-reference-apps/UBER-4.655-rider.md` (the 4.655 study, cited as "4.655 study §n"); `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md` (4.654 map inventory, cited as "map inventory §n"); `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` (4.654 API study, cited as "API study §n"); evidence-k5-today files cited by name.

---

## Feature 1 — Map-first home (UberMapView, provider chain, native GL engine, H3)

### (1) Observed mechanism

**Two-engine design with a config-driven selection chain — not a runtime guess.**

- `MapProvider` enum: exactly `UBER`, `GOOGLE`, `UNKNOWN`, **plus a fourth static member `FALLBACK_MAP_PROVIDER`** added in 4.655 (with synthetic accessor `access$getFALLBACK_MAP_PROVIDER$cp()`). `Companion.fromString` maps empty→`UNKNOWN`, `"google"`→`GOOGLE`, everything else→`UBER` (mapping itself is [D], not re-verified). — map inventory §1; 4.655 study C12/E15
- `MapProviderConfigurationModel`: kotlinx-serialized JSON of `{initialMapProvider: String, fallbackMapProviders: List<String>, missingProviderDefault: String}` plus `Companion`, `JSON`, `$childSerializers`. Confirmed in 4.655. — map inventory §1; 4.655 study C15/E36
- `MapProviderState`: holds config + Compose `MutableState` current provider + `didFallback` flag. `UNKNOWN`→substitute `missingProviderDefault`; adopt a new provider **only** if it is in the fallback set; sets `didFallback` once; every change emits `providerUsed`/`context=composeMap` analytics. — map inventory §1
- `MapFactory.create(provider, deps)`: `UBER`→`UberMapFactory` with `styleUrl = parameters.getStringParameter("mapdisplay_flipr_stylesheet_path", "https://tc2.uber.com/style/default/native?o=DEFAULT")` (**still that exact URL in 4.655**, re-verified from `assets/parameters.json` today); `GOOGLE`→`GoogleMapFactory`; `UNKNOWN`→assertion. — map inventory §1; 4.655 study C15/E27
- `MapDependencies`: every map is built with five injected handles — `Parameters` (flag registry), `Network`, `Storage` (disk cache), `EventReceiver` (analytics), `Assert`. — map inventory §1
- `MapViewAdapter` (abstract FrameLayout): `onCreate/Start/Resume/Pause/Stop/Destroy`, `onLowMemory`, `onSaveInstanceState`, `getMap(OnMapReadyCallback)`, `setHandlerBasedRenderingEnabled`, `setTargetDisplayRefreshRate` — the lifecycle contract both backends implement. — map inventory §1
- `UberMapView`: **exists in 4.655 with 26 classes** (4.654's absence was a JADX materialisation artifact; the 4.654 name-level archive lists 16). Includes `UberMapTextureView`, `NativeCallbackHandler`, `UBMStyleObserver`, `UBMGlyphRangeObserver`, `UBMSpriteObserver`, `UBMManifestObserver`, `FocalPointCenterGesturePointInterceptor`, `DefaultGesturePointInterceptor`. — 4.655 study C11/E17
- Fallback chain unchanged on the wire: `mapdisplay_flipr_available_map_providers` = `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}` (4.654 = 4.655, byte-identical; re-verified today from the base APK). 4.655 **adds** `mapdisplay_flipr_map_provider` (CONFIGURATION, empty default) and `mapdisplay_flipr_map_provider_manager` (FEATURE_FLAG) — suggesting a fourth, code-level degree of freedom (`FALLBACK_MAP_PROVIDER`) in the selection chain. — map inventory §1, 4.655 study C15
- Leak guard: `ActiveMapCounter` — process-global per-provider counter; emits `active_map_count` analytics with total/uber/google counts when a new peak passes threshold. — map inventory §1
- Selection/usage are observable streams (`MapProviderSelectionStream`, `MapProviderUsageStream` + Mutable variants) — analytics and A/B ride the same mechanism. — map inventory §1

**Map-first home surface.** The home map is not a per-screen view: a persistent map hub (`MapHubBuilder`/`MapHubRouter`, `rider_map_common`) keeps one long-lived map across the flow; screens attach **layer recipes** (`MapConfiguration = {List<MapLayerBuilder>, CameraManagerWorker}`). Stage recipes: confirmation map = waypoints + route-line + confirmation-hint layers; reserve has its own recipe (`ReserveConfirmationMapConfiguration`). Server can deliver a whole versioned map document (`MapModel{mapCamera, mapIdentifier, mapLayers, mapSettings, targetMapsIdlVersion}` + `MapLayerModel` [deprecated in 4.655] + `MapSettingsModel{mapIdentifier, userInteractionSettings, userLocation}`) applied per scope. — map inventory §11

**Camera.** Position `{target, zoom, tilt, bearing, offset}`; `CameraUpdate` is a single intent union (11 types incl. `LAT_LNG_BOUNDS_MAX_ZOOM` and a new 4.655 `TEST` constant; `DEFAULT_ANIMATION_DURATION_MS : long`); `CameraUpdateFactory` argument-checked; per-property keyframe timeline exists but is not the common path; easing = cubic-Bézier presets (Linear, EaseInOut); `SemanticZoom` is 9 sealed nested classes (`WORLD 0 … ANTS 22`, `CUSTOM`) in 4.655 — the "ladder" is per-subtype, not named constants (C22). `AutoPositionAndZoom{locations, center?, layout}` is the declarative "frame these points" request (default layout MAXIMIZED). Camera arbitration: `MapCameraDirector` merges "these coordinates must stay visible" rules from all scopes (union), with exclusive disposable control tokens (`CompletableAmb`) — many features' visibility wants merge into one camera target. — map inventory §2–3; 4.655 study C21/C22/E31/E32

**Payment-first adjacency.** The map and checkout are not separate surfaces: the pre-request map shows nearby supply (`base_map_layer/nearby_vehicles`), and one status poll carries both `eyeball.nearbyVehicles[].vehiclePaths` (epoch-stamped `VehiclePathPoint{latitude, longitude, course, speed, epoch}`) and the fare/offer payloads the checkout needs. — API study §2.3–2.4; map inventory §6

**Live tracking / presidio delta (4.654 → 4.655).** `com.ubercab.presidio.realtime` **147 → 113** — the 34 `active_trip` provider classes were removed; `com.ubercab.presidio.app` 3,194 → 3,112; `com.uber.app_ramen_polling` **8 → 8** (Ramen polling intact); `com.ubercab.helix.venues` 303 → 206; `com.uber.mapdisplay_framework` and `com.uber.map_hub_common` **zero change**. — 4.655 study §4.8, §4.4; names verified in 4.654 archive (147)

**Native engine (capacity-relevant, not copyable).** All native code ships in the arm64 splits; base has **0** native libs. `libubermaps-gl.so` 4,111,448 B (Uber's own Mapbox-format GL engine: vector/raster tile pipelines, label/line/fill/circle/marker buckets, glyph/sprite atlases, pattern polylines); `libvendor-mapdisplay.so` 3,925,904 B (engine↔Java bridge: network/disk/experiments/analytics, image decode); `libh3.so` 91,768 B (`com.uber.h3.NativeMethods`, 13 methods; exports incl. `vertexGraphToLinkedGeo`, `h3FatToFaceIJKwithInitializedFIJK` — Uber's H3 fork compiled arm64); `libse.so` 666,496 B + `libse_loader.so` 640,488 B (security engine; internals [U]); `libeef0.so` 1,104,560 B ([U] — not dissected); `libtensorflowlite_jni.so` 4,320,480 B + `libml-imageproc.so` 258,144 B (on-device ML, role [U] — likely ranking/image tasks, not confirmed); `libndk-crash`/`libndk-anr` (crash reporting); `libsurface_util_jni.so`. — 4.655 study §1.4/E28; evidence-k5-today `exp-libh3.json`, `exp-libubermaps-gl.json`, `exp-libvendor-mapdisplay.json`; map inventory §13

**H3 is used twice**, independently: (a) hex spatial indexing for map data (`com.uber.h3.NativeMethods`, `libh3.so`); (b) **quote caching** — `FareCacheSettings{serverTime, validUntilEpoch, pickupHexResolution, dropoffHexResolution}` in the fare response tells the client to bucket quote cache keys by H3 hex resolution. — API study §2.1, §5

**Rendering performance levers (all server/parameter-tunable).** Handler-based render loop with frame coalescing + fps cap (`render_frame_allocator_capacity` = 10 MiB unchanged; `mapdisplay_flipr_frame_rate` = 0 = follow display); fps tiers `PreferredFrameRate{VERY_LOW, LOW, FIVE, FIFTEEN, THIRTY}`; zoom-range culling on every annotation (marker/polyline/car all carry `minZoom/maxZoom`; server `visibleZoomRange`); tile-query cache 131,072 and overlay cache 24 (unchanged); one map across screens via the persistent hub; encoded polylines over the wire. — map inventory §12; 4.655 study §4.8/E27

### (2) Anchors

- Map inventory `docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md:17-34` (provider chain), `:38-56` (camera), `:58-84` (camera director/padding), `:259-276` (map recipes/server document), `:278-298` (performance), `:296-299` + §13 (native)
- 4.655 study: C11/E17 (UberMapView 26), C12/E15 (`FALLBACK_MAP_PROVIDER`), C15/E36 (provider config byte-identical + new params), C21/C22 (CameraUpdate/SemanticZoom), §4.8 (presidio/venues deltas), §1.4/E28 (native libs), §1.1 (base has 0 native libs), §3.2 C8/E25 (14,572 params)
- Local today: `assets/parameters.json` parsed from `uber-rider__base.apk` (values above); 4.654 archive counts (147/16/38/41/1,104/78/8)
- `evidence-k5-today/map-provider-selection.txt`, `map-stack.json`, `uber-h3-natives.json`, `exp-libh3.json`

### (3) Wind feasibility verdict + cost

**Verdict: ADOPT the shape, never the engines.** Wind already has the skeleton of this (`src/map-provider-boundary.tsx`, `selectRenderer`-style build-time capability table). The Uber-specific moves worth porting are (a) make the provider config a **serializable value** (one JSON: `{initial, fallbacks, missingDefault}`) instead of scattered build flags; (b) Compose/observable camera state with `isMoving`/`moveInitiatedByGesture` and an auto-follow lambda — not an imperative `animateTo` soup; (c) camera intents (`CameraUpdate` factory incl. bounds-with-maxZoom) so camera behaviour is testable and server-drivable; (d) "frame these points" declarative intent (`AutoPositionAndZoom` shape) for the trip-overview camera; (e) epoch-stamped vehicle path + slerp glide (already flagged ADOPT in the API study §6 via `speed` on driver fixes); (f) padding-as-insets-into-camera-environment rather than `setPadding` calls; (g) live-map leak counter (a peak-map-count analytics event — cheap, catches mini-map leaks in a courier app).

**Do NOT port:** own GL engine (MapLibre covers it), runtime two-engine fallback with `didFallback` telemetry (build-time flag suffices at Wind's scale), quadtree collision solver + floating placements (fixed zIndex + priority suffices < ~10 annotations), 3-D GLTF car (flat rotated marker + heading), server style documents / `MapModel` full SDUI document (adopt gesture/settings slice only), keyframe `CameraUpdateTimeline`, sockets/Ramen machinery.

| Item | Cost |
| --- | --- |
| Serializable provider-config value + state object (fall-forward-only + analytics event) | 1–2 days |
| Camera intent union + factory + `AutoPositionAndZoom`-style framing | 2–3 days |
| Padding model (edge + anchored corner insets) feeding map camera/safe-area | 1–2 days |
| Epoch-stamped path + slerp glide + heading snap (RN `requestAnimationFrame` loop, fake-clock test) | 2–3 days |
| Live-map counter + `active_map_count` event | 0.5 day |
| **Skipped entirely:** GL engine, quadtree collision, 3D cars, server map documents | — |

Risk if copied blindly: Uber's chain exists to serve two renderers in production; Wind with one renderer gains no reliability from a fallback set — it only adds a silent-failure path. Keep the shape, drop the second engine.

---

## Feature 2 — POI-anchored map API (NEW in 4.655)

### (1) Observed mechanism

**Server-driven POI-on-map presentation + a client-side POI cache.** The new layer sits on top of existing saved-places/access-point infrastructure; it is the shape of *"the server tells the client which POIs matter around this anchor; the client caches and renders them as typed markers."*

New in 4.655 — `com.uber.maps.mapsexperiencepresentation` (+41 classes; 4.654 had 38 — all saved-places classes; the entire POI-anchor family is new):

- Request/response: `GetMapPoisForAnchorRequest`, `GetMapPoisForAnchorResponse`, `PoiRequest` (+`PoiRequestOrBuilder`)
- Groups/markers: `PoiGroup`, `PoiGroupSuccess`, `PoiGroupOrBuilder`, `PoiMarker`, `PoiMarkerOrBuilder`, `PoiType`
- Anchors: `MobileAnchor`, `TripDestinationAnchor` (i.e. an anchor is either a free-form mobile anchor or a trip destination — pickup-side anchoring extends the existing `pudoanchoring` streams)
- Metadata: `MarkerMetadata`
- Delivery filters: `EatsFilters`, `FulfillmentType` (Eats-style; strongly implies restaurant/dark-kitchen POIs are a first-class use case)

New in 4.655 — `com.uber.mapssdk.poi` (+11 classes; **absent entirely in 4.654**): `POIService`, `POICache`, `POICache$Entry`, plus 5 obfuscated impl classes. — 4.655 study §4.1/E11/E12; 4.654 archive: 0 entries for `mapssdk.poi`, 38 for `mapsexperiencepresentation` (re-verified today)

Pre-existing substrate (4.654, unchanged in purpose):

- gRPC `maps.*` family: `maps.text-search/Search`, `maps.poi-search/POISearch`, `maps.get-details/GetDetails`, `maps.reverse-geocode/ReverseGeocode`, `maps.get-access-points-for-place/GetAccessPointsForPlace`, `maps.get-saved-places/GetSavedPlaces`, `maps.upsert-saved-place/UpsertSavedPlace`, `maps.delete-saved-place/DeleteSavedPlace` — `grpc-route-index.txt` (4.654). `GeoEntityLite{geo_entity_lite_reference(1), location(2), placelite(3), access_point_lite(4)}` — a search hit is a place or a pickup access point; search→lite hit→`GetDetails(id)` is a two-step. — API study §1.2
- `maps.get-access-points-for-place` request carries `anchor_reference(1), intent(2), optimization_parameters(3)` → `groups(1), recommended_index_path(2), access_point_metadata(3)`; `AccessPointIntent = PASSENGER_PICKUP | PASSENGER_DROPOFF | DELIVERY_DROPOFF | DELIVERY_PICKUP`; `AccessPointUsage = ENTRANCE | EXIT | PARKING | POSTAL | PACKAGE_PICKUP | PACKAGE_DELIVERY | FOOD_PICKUP | FOOD_DELIVERY` (+INVALID/UNRECOGNIZED, protobuf-lite `internalValueMap`). — API study §1.2; map inventory §8; 4.655 study C23/E33/E34
- PUDO anchor streams: `AnchorLocationStream` / `MutableAnchorLocationStream` / `MutableDestinationLocationResolver` in `com.uber.pudoanchoring` — pickup *and* destination anchors are shared mutable streams observed by search, pin, and confirmation UI. — map inventory §8
- Saved-places models (4.654): `GetSavedPlacesRequest/Response`, `UpsertSavedPlaceRequest/Response(+Success)`, `DeleteSavedPlaceRequest/Response`, `SavedPlace`, `SuggestedPlace` (+Builders/OrBuilders/`$a`/`$b` shims), `ResidenceType`, `AddressFieldKey` — protobuf-lite generated, wire format tagged. `AddressFieldKey`/`ResidenceType` values NOT read [U]. — 4.654 archive `dex-classes.txt.gz` (re-verified today)

**Mechanism summary.** The server issues an anchor-scoped POI request (`GetMapPoisForAnchor`); the client-side `POIService` resolves it via `POICache` (entry-counted cache with its own eviction semantics [U]); results arrive as `PoiGroup`s of typed `PoiMarker`s carrying `MarkerMetadata` + `PoiType` + fulfillment filters; rendering consumes `MarkerMetadata` to style markers. The cache existing at all is the point: POIs don't re-fetch on pan — cache-then-render. The wire path for the new RPC is not in the 4.654 gRPC index (expected — it shipped in 4.655); its `api/grpc/...` route name was not read and must be treated as [U].

**What it replaces/complements.** `RidersPreTripMapData` (`/rt/riders/pre-trip-map`) already pushes server-driven overlays (hotspots, walking radii, tooltips). The POI-anchor API generalizes this from fixed trip stages to arbitrary anchors — including *delivery* anchors with `FulfillmentType`.

### (2) Anchors

- 4.655 study §4.1 (table), E11 (`mapsexperiencepresentation` +41), E12 (`mapssdk.poi` +11), E17/C11 (not related — listed for completeness), C23/E33/E34 (AccessPoint intents/usages)
- 4.654 archive: `dex-classes.txt.gz` lines (re-verified today): `com.uber.maps.mapsexperiencepresentation.*` (38, saved-places only), `com.uber.mapssdk.poi.*` (0), `com.uber.model.core.generated.uber.maps.mapsexperiencepresentation.SavedPlacesGrpcApi` / `SavedPlacesGrpcClientImpl`
- `grpc-route-index.txt` (saved-places + maps.* gRPC paths), `dex-api-paths.json` (`/rt/locations/v3/labeled`, `/rt/locations/v2/autocomplete`, `/rt/riders/pre-trip-map`)
- API study §1.2 (gRPC tables, `GeoEntityLite`, search→details two-step), §2.4 (pre-trip map), §2.2 (`ResolveLocationResponse{resultantLocations(required), locationSuggestions, nearbyPOIs}` — one call = snap pin + suggest), §1.4 (`resolve-location`, `edit-pickup-location`)
- Map inventory §8 (pudoanchoring, access points, pin mechanics)

### (3) Wind feasibility verdict + cost

**Verdict: ADOPT the shape now; the endpoint lands when Wind has POI data.** This is the single most transferable 4.655 idea for a delivery app: *"show me the nearby pickup boxes / shops on the map"* as a server-driven, cached, typed-marker layer — instead of Wind's current static client-side list. The shape needs: (a) one typed request/response (`GetMapPoisForAnchor{anchor, filters?}` → `{groups: [{poiType, markers: [{id, point, metadata}]}]}`), (b) a SQLite-backed POI cache (Wind already has SQLite), (c) a marker layer keyed by `poiType`. The `FulfillmentType`/Eats-style filters map 1:1 onto parcel categories if Wind wants them later — but filters are optional at v1.

Wind caveats:

- Wind has **no POI data source**. Google Places (or a West Bank POI list Wind builds itself) is the realistic upstream; keys stay server-side (same conclusion as the API study's search deferral). Until that exists, the POI layer renders an empty list — ship the cache + layer behind a flag, not as a visible feature.
- Do not port the protobuf-lite machinery; Wind's contract style is JSON-over-HTTP with `wire-contracts.ts` validation — that is sufficient and cheaper.
- `MobileAnchor` vs `TripDestinationAnchor` distinction: Wind only needs the trip-destination anchor v1; "mobile anchor" (anchor attached mid-flow) is later.

| Item | Cost |
| --- | --- |
| Typed POI anchor contract + server route (`POST /api/map/pois {anchor, ctx}` → groups) | 1–2 days |
| SQLite `poi_cache` table (key = anchor hex cell + filters hash, TTL ~10 min) | 1–2 days |
| Map layer: render `PoiGroup` markers by type with priority/zoom-range | 1–2 days |
| Server upstream wiring (Google Places proxy or Wind POI table) | 2–4 days (blocked on data decision) |
| **Skipped:** FulfillmentType filters v1, MobileAnchor, POICache eviction tuning | — |

---

## Feature 3 — Saved places & pickup confirmation (place-search pipeline, Compose location editor)

### (1) Observed mechanism

**Saved places** is a first-party gRPC surface — `GetSavedPlaces` / `UpsertSavedPlace` / `DeleteSavedPlace` under `api/grpc/maps.*` — with protobuf-lite generated models and full `OrBuilder` surfaces (`SavedPlaceOrBuilder`, `SuggestedPlaceOrBuilder`, `UpsertSavedPlaceResponseSuccess`). The model family includes a separate `ResidenceType` enum (values unread [U]) and an `AddressFieldKey` enum (address-field schema keys; field list not read [U]). Saved places are queried on demand, not synced wholesale; deletes are first-class RPCs. Field-level contents of `SavedPlace` itself were **not read** [U]. — 4.654 archive; `grpc-route-index.txt`; API study §1.2/§1.1 (REST twins `/rt/locations/v3/labeled` GET/POST/DELETE + `/labeled/all` POST for the same concept over REST)

**Place-search pipeline (two-step, typed).** Text search is gRPC `maps.text-search/Search{query, search_region(geometry), search_context(ORIGIN|DESTINATION|GEOBIASED), search_type(AUTOCOMPLETE|FULL_TEXT_SEARCH)}` → `results[]: GeoEntityLite`; then `maps.get-details/GetDetails{geo_entity_lite_id}` → full `GeoEntityLite`. REST autocomplete exists as `/rt/locations/v2/autocomplete` (query lat/lng/locale). `resolve-location` (`POST /rt/riders/{riderUUID}/resolve-location`, binary, `ResolveLocationRequest{requestLocation(required), context(required: PICKUP|DROPOFF|UNKNOWN), productsToOptimize, …}` → `ResolveLocationResponse{resultantLocations(required UpdatedPickupSuggestion), locationSuggestions, nearbyPOIs, nearbyLocations}`) is one call that snaps the pin **and** suggests alternatives. — API study §1.1/§1.2/§2.2

**Pickup confirmation = a center-pin editor, Compose-migrated in 4.655.**

- Pin pair: `PinPresenter` / `PinViewV2` — "pin fixed at map center while the map moves under it" is a dedicated presenter, not screen ad-hoc code. — map inventory §8
- Location-editor API (`com.ubercab.location_editor_api.core`): `LocationEditorListener` (obfuscated methods; location-chosen callbacks take `RequestLocation` + optional lists), `LocationEditorModeAndContext{mode, context}`, `MapStateTransitionStream` (two `Observable`s), `LocationEditorLocationManager`, `LocationEditorChromeManager`, `LocationEditorConfigurationStream`, plugins `AddressEntryPlugin{V2}` + `GenericReverseGeocodeListener` — **the editor owns reverse-geocoding of its pin position**. — map inventory §8 (§8 honesty: listener methods obfuscated)
- Anchor streams (`com.uber.pudoanchoring`): `MutableAnchorLocationStream` set-per-key + broadcast-to-all-keys + reset; `MutableDestinationLocationResolver` — search, pin, and confirmation UI observe one truth. — map inventory §8
- Nearest-road snap is an **engine query**, not a client-side road-network hack: `NearestRoadOptions{excludedRoadClasses, excludedRoadUsages, searchDistanceMeters, shouldExcludeClosures}` via `NearestFeatureTypeOptions`; `HitTestOptions{distanceThresholdMeters, includeClosures, roadClassExclusions}`; bridges `BaseMapQueryBridge`/`TileQueryBridge` return `MapQueryResult{Success|Failure}`. Never snap a pickup onto a highway/closure. — map inventory §8
- Confirmation-stage map recipe: waypoints + route-line + confirmation-hint layers + `ConfirmationCameraManagerWorker` (still not readable as 10 values in 4.655 — the class is unchanged, sealed-type shape; C24). — map inventory §8/§11; 4.655 study C24

**4.655 deltas relevant here:**

- **The Compose location editor migration completed.** `connect_location_editor_compose_migration` was **removed**; `connect_request_location_editor_state_tnkch8`, `connect_location_editor_completed_event_handler_tnkch8`, `pickup_request_location_device_location_tnkch8` flipped **false → true** (all re-verified `true` in `assets/parameters.json` today). — 4.655 study C16/E26
- `SemanticZoom` clarified into 9 sealed nested classes — zoom clamping for editor framing is expressed semantically, not raw doubles. — 4.655 study C22
- `MapSettingsManager` applies server-driven `MapSettingsModel` (user location on/off, 3D buildings, closures/traffic toggles) — the pickup map's chrome is server-controllable. — map inventory §3, §11

**Saved-place → pickup flow (assembled, [I]).** Home/Work chips in the editor footer are driven by `GetSavedPlaces` (cached); typing in the address field goes through `TextSearch`(AUTOCOMPLETE) → `GeoEntityLite`; choosing a hit emits on the shared anchor stream; the editor reverse-geocodes the final pin (`ReverseGeocode`/`resolve-location`) for the confirmation card; confirm fires `edit-pickup-location` (`POST /rt/riders/{riderUUID}/edit-pickup-location` → Unit) — a mutation that returns Unit, with fresh state arriving via the status poll/push. — assembled from API study §1.1/§1.2/§1.4 + map inventory §8

### (2) Anchors

- Map inventory §8 (`map-capability-inventory.md:194-216`), §3 padding/§11 recipes for the confirmation stage
- 4.655 study C16/E26 (migration completion), C22 (SemanticZoom), C24 (CameraManagerWorker), E26 (parameters re-verified today)
- API study §1.1 (labeled places REST), §1.2 (saved-places gRPC + search), §1.4 (`edit-pickup-location`), §2.2 (`resolve-location` response shape), §2.4 (pre-trip map)
- 4.654 archive: saved-places class family + `SavedPlacesGrpcApi(ClientImpl)`; `grpc-route-index.txt` (`maps.get-saved-places` etc.)
- Local: parameters dump lines (`connect_request_location_editor_state_tnkch8` true, `connect_location_editor_completed_event_handler_tnkch8` true, `connect_location_editor_compose_migration` absent)

### (3) Wind feasibility verdict + cost

**Verdict: ADOPT saved places + center-pin editor as Wind's booking confirm step. PARTIAL on the engine query.**

- Saved places: trivially feasible. Wind's SQLite has users/orders; add `saved_places(user_id, label, point, address, residence_type)` + 3 routes (`GET/POST/DELETE /api/saved-places`) + Home/Work/Custom chips in the booking sheet. This is a pure copy of the *shape* (gRPC RPCs → Wind's REST style) and needs no map data beyond what Wind has.
- Place search: Wind has no search backend. Minimum viable = city/zone picker + pin-drag (current Wind booking). The two-step `TextSearch → GetDetails` shape should be adopted when search lands (provider keys server-side) — do not block booking on it.
- Center-pin editor: Wind has `src/pin-sheet.tsx` already; upgrade it to the presenter pair pattern (state machine + `MapStateTransitionStream`-style observable) so search/pin/confirmation share one anchor state. Moderate refactor, high payoff.
- Nearest-road snap: **blocked by map data**, not by code. Needs West Bank road-class data QA (closures especially). Until then Wind's pin stays where the user dropped it — acceptable at launch, flagged for QA.
- Reverse-geocode for the confirmation card: Wind's `customer-location.ts` + `/api/roads` already reports; a `GET /api/location/resolve` shaping `resolve-location`'s response (`{resultantLocations, locationSuggestions, nearbyPOIs}`) is the right contract when road data exists.

| Item | Cost |
| --- | --- |
| Saved-places table + CRUD routes + Home/Work chips in booking sheet | 2–3 days |
| Pin-sheet → presenter/anchor-state refactor (single source of truth) | 2–3 days |
| `/api/location/resolve` contract returning `{resultant, suggestions}` | 1–2 days (after road-data QA) |
| Search two-step (server proxy to Google Places/Maps + two-step client) | 3–4 days (defer; product decision) |
| **Skipped:** nearest-road snap (blocked), AddressEntryPlugin machinery, AddStop layers | — |

---

## Feature 4 — Offers / product contract (typed wire payloads)

### (1) Observed mechanism

**The repo's open question — "are rider offer/product payloads typed on the wire?" — is now answered in direction, not in field detail.** In 4.654, rider-facing offers were untyped: `StatusResponse.scaledOffers{}`, `RiderOfferPushModel`, `POST /rt/riders/v2/get-offers → GetRiderOffersResponse{pollingIntervalMS}`, `POST /rt/scaled-offers/get-scaled-offers/` — bodies observed as `Map<String,Object>` (87% of generated bodies are untyped; typed "hot core only"). Fare-estimate **was** already typed (`packageVariants(14)`, `vehicleViewIds(16)`, `productsDisplayOptions(18)`, `remainingVvids(21)`, `pricingProgressiveLoadingData`, `fareCacheTTLSettings(27)` → `FareCacheSettings{serverTime, validUntilEpoch, pickupHexResolution, dropoffHexResolution}`). — API study §1.0, §1.9, §1.5, §2.1/§2.3

**4.655 added exactly the missing middle:**

| Package | Net | Reading |
| --- | --- | --- |
| `com.uber.model.core.generated.rider.product` | **+100** (was 41 — only `intercity`/`reservations` subtrees) | A full product/vehicle-offer model family — strongly suggests product payloads are now typed on the wire [I] |
| `com.uber.model.core.generated.rider.presentation` | **+46** (was 1,104) | What the client *shows* for a product (presentation models) |
| `com.uber.model.core.generated.go.rider` | +27 (new) | Newer "go" rider surface |
| `com.uber.model.core.generated.go.tripexperience` | +4 (new) | Trip-experience models |
| `com.uber.model.core.generated.amd.amdexperience` | +8 | Autonomous-vehicle experience models |
| `com.uber.model.core.generated.fraud.riskexperience` | +8 | Risk/fraud experience models |
| `com.uber.model.core.generated.edge.models` / `.rtapi.models` | +4 / +4 | Edge/rtapi models |
| `com.uber.model.core.generated.edge.services` | −47 | Edge service clients churned |
| `edge.services.dispatchconfig` | **deleted end-to-end** | Route `/rt/riders/dispatchconfig` absent + 9 classes gone, 0 replacements |

— 4.655 study §4.2/E13, §4.4/E10; 4.654 archive re-verified today (41 / 1,104)

**Offers mechanism (how an offer reaches the screen).**

1. **Poll path:** `POST /rt/riders/v2/get-offers` (`EmptyBody` → `GetRiderOffersResponse` carrying `pollingIntervalMS`) with server-driven cadence — the sibling `StatusMetadata.pollingIntervalMs` / `ScaledOffers{isPollingEnabled, pollingIntervalMS}` tell the client when to ask again. — API study §1.9/§2.3/§5
2. **Push path:** topic `push_rider_offer` → `RiderOfferPushModel` (+125 push models; pushed DTO is often the same class as the HTTP twin; Ramen envelope `RamenResponse oneof{msgs, controlMsg, heartbeat}`, per-message ack, `lastseen_seq_id` resume). — API study §3.1/§3.4
3. **Error discipline:** per-endpoint `*Errors` union; discriminator = **HTTP status first, body `code` second**; 401/403/429/500 pick the slot by status alone; 400/404 switch on `code`; unclassified → `synthetic.unknown`. Builders throw on missing required fields; decoders keep unknown tags ("fail on what you require, never on what you don't know"). — API study §2.5/§2.6
4. **Product selection is a separate typed channel:** `POST /rt/riders/product-configuration` → `RidersProductConfigurationData` (`.rt/riders/product-configuration`); fare-estimate carries `vehicleViewIds`/`selectedVehicleViewId` + `productsDisplayOptions` — the *decision* is typed; the *delivery of the offer itself* rides the status/poll/push path. — API study §1.4/§1.9/§2.1

**Scale of the typed tail:** 14,572 parameters; 3,379 plugin switches; `BUG_FIX` 1,546 (+29); `FEATURE_FLAG` 5,457 (−10); `CONFIGURATION` 4,181 (+30) — product-gating is parameter-driven, and the product model family is the typed counterpart of those gates. — 4.655 study C8/E25; parameters re-verified today

### (2) Anchors

- 4.655 study §4.2 table (E13), §4.4 (§4.4 route delta: only `dispatchconfig` removed, `ubercashv2/getGiftingTopUpStatus` added), §4.6 (payment provider framework intact), C8/E25
- API study §1.0 (census: 87% untyped bodies, POST 89%), §1.5 (offers untyped), §1.9 (`get-offers`, `product-configuration`), §2.1 (fare-estimate typed, `FareCacheSettings`), §2.3 (`StatusResponse.scaledOffers`, `StatusMetadata`, `PickupResponse{checkoutActionParameters}`), §2.5–2.6 (error union + discriminator), §5 (server-driven cadence)
- 4.654 archive: `dex-classes.txt.gz` re-verified today — 41 `generated.rider.product`, 1,104 `generated.rider.presentation`, 2,335 `generated.rider.*` total
- 4.655 study §4.2 note: product payloads "strongly suggested typed — **field set not read**" [U]

### (3) Wind feasibility verdict + cost

**Verdict: ADOPT the *direction* (typed product contracts + server-driven cadence), SKIP the codegen machinery.** Wind already has typed hot paths (`wire-contracts.ts`, `validateApiResponse`) and an `OfferFailure{category, recovery}` for accept/decline. The 4.655 direction validates extending that discipline to the **product list itself**: the fare/product sheet should render from one typed JSON payload (`{products: [{id, name, fare, eta, ...}], selectedProductId, nextPollMs?}`), not from loose keys — this is exactly what `product-configuration` + typed product models buy Uber.

Concretely for Wind:

1. Typed product payload on the existing price/ETA route (extend `/api/price` response — `products[]` with closed `id` enum incl. cash availability) — 1–2 days.
2. Server-driven `nextPollMs` on the trip/order serializer (already "ADOPT (top)" in the API study §6) — 0.5–1 day.
3. `checkoutActionParameters`-style: Wind's order create already returns fresh state (cancel → `getOrder`); formalize "mutation returns state" as a contract rule across the driver command paths — mostly discipline, ~0.5 day.
4. The per-endpoint `*Errors` union: Wind's one shared `ApiErrorCode` tuple (already flagged ADOPT-narrow in API study §6) is sufficient; do not per-endpoint classes.

**Do NOT port:** Ramen push topics, `ScaledOffers` poll-token plumbing, the generated `rider.product` codegen style, `EmptyBody`/Wire machinery.

| Item | Cost |
| --- | --- |
| Typed product list on `/api/price` + validator + client render | 1–2 days |
| `nextPollMs` server hint (journey serializer) | 0.5–1 day |
| `ApiErrorCode` tuple shared client/server | 1 day |
| **Skipped:** push topics, codegen, per-endpoint error classes | — |

Open question that survives: the **exact** field set of 4.655's product models is [U] — Wind should not guess at Uber's wire format; design Wind's own contract from its product model (cash-first, parcel types) instead.

---

## Feature 5 — Payment-method-first checkout & cash in Arabic (10-APK delivery, `connect_cash_*`)

### (1) Observed mechanism

**The 10-APK delivery architecture (all unchanged between 4.654 and 4.655):**

| Split | Bytes | What it carries |
| --- | --- | --- |
| `base` | 207,018,879 | All Java/Kotlin (23 DEX, 288,493 class definitions), 12,747 resources, **0 native libs**, 15,335 default-locale strings (one `type string` table — base is English-only; Arabic ships in the ar split), `assets/parameters.json` (14,572 params), manifest (48 unique permissions, 109 components, 26 exported) |
| `config.arm64_v8a` | 15,291,729 | All native code: `libubermaps-gl.so` (4.1 MB), `libvendor-mapdisplay.so` (3.9 MB), `libtensorflowlite_jni.so` (4.3 MB), `libse*.so`, `libeef0.so`, `libh3.so`, `libml-imageproc.so`, `libndk-crash/anr`, `libsurface_util_jni.so`, `libandroidx.graphics.path.so` |
| `VoipTwilio` + `VoipTwilio.config.arm64_v8a` | 303,311 + 11,694,518 | Twilio voice in-app calling (rider↔driver) — native `libtwilio_voice_android_so.so` 11.7 MB + code |
| `BarcodeScanner` + `BarcodeScanner.config.arm64_v8a` | 1,295,392 + 4,977,067 | Barcode scanning (parcel IDs) — `libbarhopper_v3.so` 4.9 MB + code |
| **`config.ar`** | **2,310,553** | **The full Arabic string table: 9,523 unique UTF-8 pool strings; 12,709 parsed resource entries (12,706 `string/` + 3 `plurals/`); both `(ar)` and `(ar-rSA)` variants on every observed key** |
| `config.xxhdpi` | 735,406 | xxhdpi-density drawables only |
| `GooglePaySdk` | 94,571 | Google Pay SDK wiring |
| `FlashNacional` | 24,783 | [U] — not analyzed; name suggests a Peruvian Flash/Nacional payment integration |

Same split names in both builds; base SHA-256/size changed (−742,798 B); signer certificate **byte-identical** across builds (`4003231a…c268392`, source stamp `3257d599…3bbd6d`) — a signed Play continuation of the same app identity. minSdk 29, targetSdk 36; no background-location permission. — 4.655 study §1.2–1.4, §2.1–2.4, §1.1

**Local re-verification (today):** `aapt2 dump resources` on the ar split yields exactly 12,709 entries (12,706 + 3) and confirms every cash key below with line-anchored Arabic values in `%LOCALAPPDATA%\Temp\opencode\ar-dump-utf8.txt`.

**Payment-method-first checkout — the mechanism.** Checkout is a *payment-provider pipeline shared by all rails*, with cash as a first-class provider, not a bolt-on:

- Payment providers are registered in a provider framework (`com.uber.payment.provider.*`); the 4.655 study explicitly notes the payment provider framework is **intact** (all "removed" payment classes were `$Dependencies` DI codegen, 2 obfuscated renames). — 4.655 study §4.6
- Checkout-action coordinator: `checkoutcomponents.checkoutactions.actionscoordinator` — every checkout side effect (e.g. cash charge to next trip, arrears settlement) is an **action** dispatched through one coordinator with handlers (`ClearArrearsHandlerRouter`, …). So "pay cash", "settle arrears before next ride", "add to next fare" are all the same pipeline. — 4.654 archive `wide-payment.json` (ClearArrearsHandler*/SpenderArrears* names)
- The status/pickup responses carry `checkoutActionParameters` on `PickupResponse` — the server hands the client the checkout action to present. — API study §2.3
- Payment method selection is a server-side concern: `POST /rt/riders/{riderUUID}/select-payment-options`, `/select-payment-profile` (v2 `/rt/riders/v2/{id}/select-payment-profile`), `/select-voucher`. — API study §1.4
- Braintree/PayPal: manifest deep links `braintree-paypal-connect(-fallback).com.ubercab` — PayPal connect flow exists; cash remainder refund settles via PayPal (see no-change copy below).

**Cash in Arabic — the shipped copy set (each value re-verified today; English gloss is the resource name's conventional meaning):**

| Resource (`ar` + `ar-rSA` identical) | Arabic value (quoted, from the split) | Meaning / function |
| --- | --- | --- |
| `cash` (`…ar-dump-utf8.txt:3859`) | `الدفع نقداً` | "Pay in cash" — the product-level cash label |
| `pay_with_cash` (:17386) | `ادفع أجرة المشاوير نقداً` | "Pay trip fares in cash" — payment-method picker label |
| `cash_charge_modal_disclaimer` (:3880) | `من المتوقع أن تدفع المبلغ الإجمالي نقداً إلى السائق في نهاية مشوارك التالي` | Cash-to-next-trip charge: expected to pay the driver at end of next trip |
| `cash_charge_modal_header` (:3883) | `هل ترغب في الإضافة إلى أجرة المشوار التالي؟` | "Add to next fare?" — the upsell/confirm modal title |
| `cash_change_plus_one_title` (:3868) | `تذكَّر أن السائق لا يقدم المبلغ المتبقي عند الدفع نقداً` | **No-change reminder**: driver does not give change on cash |
| `cash_change_plus_one_message` (:3862) | `ادفع نقداً في نهاية هذا المشوار، وسيُضاف المبلغ المتبقي المستحق لك إلى حسابك لاستخدامه في مشوارك القادم. أو يمكنك استعادته من خلال PayPal.` | **Change handling**: remainder credited to account for next trip, or refundable via PayPal |
| `cash_change_plus_one_ok` (:3865) | `موافق` | "OK" |
| `connect_cash_arrears_disclaimer` (:4741) | `إذا لم يتم الدفع نقداً بالكامل، فستكون مسؤولاً عن تسوية عملية الدفع قبل مشوارك القادم.` | **Arrears**: underpaid cash = debt, settled before the next trip |
| `eats_cash_charge_modal_disclaimer` (:9235) | `تأكد من أن لديك ما يكفي من النقود لدفع المبلغ الإجمالي الجديد عند توصيل طلبك، وإلا فقد يتم إلغاؤه.` | Order modified in flight → pay new total cash on delivery or the order may be cancelled |
| `eats_spender_arrears_payment_pay_with_cash` (:9277) | `ادفع نقداً عند الاستلام` | "Pay cash on delivery" |
| `product_option_payment_cash_error_modal_title` (:19125) | `الدفع نقدًا فقط` | "Cash only" — a product option that refuses non-cash payment |
| `product_option_payment_cash_error_modal_message` (:19122) | `لا نسمح بدفع أجرة المشاوير التي يتم إجراؤها باستخدام رمز المشوار سوى بالنظام النقدي.` | Cash-only rule enforced for promo-code rides |
| `past_trip_details_cash` (:17317) | `الدفع النقدي` | Past-trip receipt label |
| `guest_rider_value_prop_v2_bullet3_title_cash` (:11855) | `اختر من سيدفع` | Guest flow: "choose who pays" (guest cash option) |
| `connect_checkout_delivery_item_size_details_title` (:4744) | `تفاصيل الطرد` | **Parcel details** — Connect parcel checkout row |
| `connect_delivery_time_details_header` (:4906) | `موعد التوصيل` | Delivery time — Connect parcel checkout row |
| `connect_bai_delivery_radius_error_message` (resource at :4737, value :4738) | `هذا المطعم خارج نطاق خدمة التوصيل. يُرجى تجربة مطعم آخر.` | Out-of-delivery-radius rejection |
| `add_pickup_placeholder` (:896) | `موقع الالتقاء` | Pickup point — booking placeholder |
| `address_entry_pickup_edit_action` (:935) | `أدخِل موقع الالتقاء أو اختر موقعاً من القائمة` | Enter pickup or pick from list |

**Cash machinery in code (4.654 archive, framework intact in 4.655):**

- `edge.services.payment.arrears.ArrearsApi` / `ArrearsClient` / `ArrearsDataTransactions` — typed arrears endpoints
- `GetConsolidatedArrearsV2{Request,Errors}`, `GetSpenderArrearsPaywallPresentation{Request,…}`, `GetUserArrearsErrors`, `GetSpenderArrearsPayments{Response,Errors}` — the rider arrears ("you owe cash from a previous trip") API family
- RIBs under `presidio.payment.feature.spenderarrears.*`: `SpenderArrearsBanner(BannerInteractor/Router/View/ScopeImpl)`, `SpenderArrearsCheckoutFlowPluginFactory`, `SpenderArrearsConfirmedActionableItem`, `SettleSpenderArrearsActionableItem`, `ClearArrearsHandler{Router,ScopeImpl}` — arrears are a **banner + checkout-blocking action**, settled in the checkout flow, not a separate debt screen
- `TipsArrearsException`, `ArrearsAction`, `ArrearsReason` — analytics/typed enums for why arrears arose
- Cash remainder ("change") path is explicitly PayPal-linked (`cash_change_plus_one_message` above) and Crediting to account is handled inside the cash-charge flow, not via a new payment instrument

**What this means for Wind's model.** Uber — the global benchmark — treats *cash as a payment provider inside one checkout pipeline*, and treats *underpaid cash as a pre-trip gate* (arrears disclaimer shown before booking the next trip; checkout blocked until settled). That is exactly Wind's cash-first reality, shipped and translated into Arabic at production scale. The two mechanisms Wind does **not** yet have confirmed in its own codebase are the arrears ledger/gate and the no-change/remainder UX — both are cheap.

### (2) Anchors

- 4.655 study §1.2 (split table), §1.4 (native libs), §1.1 (base 0 native libs, 15,335 strings, one string table), §1.3 (signer identical), §2.1 (48 permissions, no background location), §2.2 (109 components, PicassoProvider removed, rest unchanged), §4.6 (payment framework intact; `$Dependencies` caveat), §4.7/E22 (Arabic cash copy — quoted values), §4.4 (payment route +1: `ubercashv2/getGiftingTopUpStatus`)
- Local today: `%LOCALAPPDATA%\Temp\opencode\ar-dump-utf8.txt` (lines above), `assets/parameters.json` (`mapdisplay_*`, `connect_*`)
- 4.654 archive: `wide-payment.json` (arrears/`ClearArrears*`/`SpenderArrears*` names), `sig-split-split_config.ar.json`, `sig-uber-base.json`, `dex-urls.json` (`braintree-paypal-connect` schemes via manifest, not URLs file), manifest deep links §2.3 of the study
- `docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md` §1.4 (payment selection routes), §2.3 (`checkoutActionParameters`)

### (3) Wind feasibility verdict + cost

**Verdict: ADOPT wholesale — this is the closest shipped precedent to Wind's business.** Concrete work items, in priority order:

1. **Arrears ledger + pre-trip gate** (SQLite `cash_arrears(user_id, order_id, amount_due, settled_at NULL)`; on order create, if open arrears > 0 → show blocking sheet reusing the Arabic disclaimer copy; settle action sets `settled_at`; admin override exists in `admin/cash.tsx`). Reuses Wind's existing `admin/cash.tsx` surface. — **3–4 days**
2. **Arabic copy set for cash flows** — lift the *tested* Uber Arabic phrasing (identifiers and short strings are fine; do not copy assets) into Wind's `copy.ts`, both `ar` and `ar-rSA`, with RTL pass. Include arrears, no-change, cash-on-delivery, parcel details rows, cash-only product error. — **1–2 days**
3. **No-change/remainder UX** at trip completion: "driver does not give change; remainder credited to your account" + fallback "or refund via your payment method" (Wind: manual or cash-topup — do **not** promise PayPal unless Wind integrates it; the *pattern* is what matters). — **1–2 days**
4. **Payment-method-first checkout layout**: Wind's checkout should pin the *payment method selector* above fare details on the order screen — cash first, then card, then other. Straightforward RN. — **1 day**
5. **Cash-on-delivery for parcels** — Wind's parcel flow exists (`freight-details.tsx`); add COD as a selectable payment rail with the `eats_cash_charge_modal_disclaimer` analogue ("have enough cash at delivery or the order may be cancelled"). — **1–2 days**

**Do NOT port:** 10-APK split delivery (Wind's CloudFront+EAS update model is fine and simpler), Twilio voice (Wind has phone reveal/push), BarcodeScanner split (Wind's parcel scan can use the same approach if needed later), GooglePaySdk (Wind is cash-first), FlashNacional (unknown, ignore).

| Item | Cost |
| --- | --- |
| Arrears ledger + gate + copy | 3–4 days |
| Arabic cash copy set + RTL | 1–2 days |
| No-change remainder UX | 1–2 days |
| Payment-method-first checkout order | ~1 day |
| Parcel COD rail | 1–2 days |
| **Total** | **~7–11 days** |

Risk: none substrate-wise. The one real decision is whether Wind's remainder settles to account credit or a manual refund path — product decision, not engineering.

---

## Feature 6 — Reserve / curbside hints (content-CDN imagery, access-point UX)

### (1) Observed mechanism

**Six new content-CDN URLs, all `tb-static.uber.com`, all absent from 4.654** (re-verified: 0 occurrences in `dex-urls.json`):

```
https://tb-static.uber.com/prod/mobile-content-public/reserve/airport_pickup/curbside.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/airport_pickup/meet_and_greet.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/illicons/child_seat.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/illicons/booster_seat.png
https://tb-static.uber.com/prod/mobile-content-public/reserve/illicons/pet_collar.png
https://tb-static.uber.com/prod/mobile-content-public/Premium%20Reel%20Vertical%206mb.mp4
```

Removed: `https://cn-dc1.oojoovae.org,https://cn-dc1.uber.com` and `https://cn-geo1.uber.com/static/mobile-content/mobility-growth/dispatch/fact_default.png`. — 4.655 study §4.5

**What they are for.** All five images live under `reserve/` — airport pickup for **Reserve** (pre-booked rides): `curbside.png` vs `meet_and_greet.png` are the two "how does the driver meet you at the airport" choices (curbside = meet at curb, meet-and-greet = driver waits inside/with sign); `child_seat`/`booster_seat`/`pet_collar` are reservation add-on icons (illicons). The mp4 is a premium-product reel. These are **not** map tiles or bundled assets — they are **hot-swappable CDN content**, i.e. the pickup-experience copy/imagery can change without an app release. — [I] from path naming + Reserve context; the exact UI call sites were not read [U]

**Reserve surface around them:**

- `com.uber.reserve.tripedit` grew to +48/+27 net (a second, reservation-specific editor flow) — 4.655 study §4.8, §3.2 (E-table)
- `/rt/reservation/*` — 21 routes, byte-identical between builds (`/rt/reservation/{new,plan,list,get-airlines-by-airport,get-rapu-pickup-access-point,landing_screen,predict-reservation-time,query-flights-list,…}`) — 4.655 study §4.4
- `AccessPointIntent = PASSENGER_PICKUP | PASSENGER_DROPOFF | DELIVERY_*` and `AccessPointUsage = … PACKAGE_PICKUP | PACKAGE_DELIVERY | FOOD_PICKUP | FOOD_DELIVERY` — the venue-access-point taxonomy is shared between rides and delivery; the reserve pickup flow is the **entrance/curb** UX with access-point data from `maps.get-access-points-for-place` — 4.655 study C23/E33/E34; API study §1.2
- `com.ubercab.helix.venues` shrank 303 → 206 — venue/wayfinding work moved rather than grew — 4.655 study §4.8
- Reservation flight-integration (`get-airlines-by-airport`, `query-flights-list`) is the &"flight-aware" pickup primitive; irrelevant to Wind [skip]

**Why this matters for Wind.** Wind delivers into dense Palestinian streets — the hardest pickup problem there is exactly the same shape: *where exactly does the driver meet the customer / where exactly does the courier hand over the parcel?* Uber's answer is (a) a typed access-point contract (entrance/exit/parking/postal/package/food usages), (b) a small set of **server-selectable hint images on a content CDN**, and (c) a reservation flow that surfaces the choice *before* dispatch. The CDN-hint pattern is the cheap, durable part: Wind can serve "leave at door / meet at entrance / call on arrival" imagery from CloudFront with different assets per city without an app update.

### (2) Anchors

- 4.655 study §4.5 (the 6 URLs, verbatim), §4.8 (`reserve.tripedit` +27 net; `helix.venues` −97), §4.4 (`/rt/reservation/` 21 unchanged), C23/E33/E34 (access-point taxonomy)
- 4.654 archive: `dex-urls.json` — all six URLs **absent** (0 hits; re-verified today); `grpc-route-index.txt` has `maps.get-access-points-for-place/GetAccessPointsForPlace` + `maps.get-epudos-for-geometry/GetEPUDOsForGeometry`
- API study §1.2 (access points gRPC), map inventory §8 (access points + pickup cue views: `pickup_tooltip`, `meet_and_greet_callout`, `MeetupLocationView`)
- 4.655 study §7: "The only addition is a fourth, code-level default provider and ~12 new map flags… Uber still pays for two engines; Wind should not."

### (3) Wind feasibility verdict + cost

**Verdict: ADOPT the pattern (CDN-served hint imagery + typed handoff choice), SKIP the reserve/flight/child-seat machinery.**

Minimum viable Wind version:

1. A `handoff_hint` field on the order (`meet_at_door | meet_at_entrance | leave_at_door | call_on_arrival`), chosen in booking, rendered for both customer and courier. Server-stored, no app update needed to change the set later. — **1–2 days** (schema + both apps' UI)
2. Two or three small PNG/SVG hint icons served from Wind's CloudFront bucket (assets Wind creates itself — **do not** fetch or bundle Uber's images), referenced by key, not URL-hardcoded, so they can be swapped per city. — **0.5–1 day**
3. Courier-side handoff screen shows the chosen hint (plus Wind's existing proof/photo flow) — small RN change. — **0.5 day**

| Item | Cost |
| --- | --- |
| `handoff_hint` contract + booking UI + courier display | 2–3 days total |
| CDN assets (Wind-created) + swap mechanism | 0.5–1 day |
| **Skipped:** airport/flight integration, child/booster/pet illicons, meet-and-greet signage flow, premium reel | — |

---

## Cross-cutting evidence (not one of the six features, but load-bearing)

**The 10-APK delivery means split *code + manifests* are per-config; base declares all providers and permissions** (split manifests were NOT decoded in the 4.655 study — exported components contributed by splits are therefore not counted; Wind should not replicate this). — 4.655 study §2.2, §6(7)

**DI rewrite, not feature churn.** 2,001 `*ScopeImpl$Dependencies` interfaces removed (2 added); nested host interfaces instead (`LegacyRootLogic$EleLaunchHost`…); `dev.zacsweers.metro` present with 2 classes. Any class-count comparison between Wind and Uber-scale apps must filter `$Dependencies` or report false regressions. — 4.655 study §4.6

**Parameters, not code, gate most behavior.** 14,572 parameters; 154 namespaces (unchanged); `FEATURE_FLAG` 5,457, `BUG_FIX` 1,546, server overrides per launch — Wind's `remote-config`-via-`/api/config` equivalent should follow the same idea: flags ship in the APK as defaults, server wins. Wind already has runtime config (`src/runtime-config.ts`) — keep it.

**Error union discipline.** HTTP status first, body `code` second; `synthetic.unknown` fallback; tolerant decoders; required-or-throw builders. Wind's `ApiErrorCode` tuple plan (API study §6) is the right scale. — API study §2.5–2.6

**H3 (`libh3.so`, 91,768 B)** is a legitimate capacity-modeling target: Uber uses one H3 fork for map spatial indexing *and* quote-cache bucketing (`pickupHexResolution/dropoffHexResolution`). Wind's analog: bucket driver-search cells by H3 (or geohash) server-side for dispatch batching — Wind's `server/domain/dispatch.ts` already does geo-search; H3 specifically is optional. Measure before adopting. — API study §2.1/§5; exp-libh3.json

**Native libs for adversarial capacity modeling** (never to copy): `libubermaps-gl.so` 4.1 MB (own GL engine — years of investment), `libvendor-mapdisplay.so` 3.9 MB (bridge), `libtensorflowlite_jni.so` 4.3 MB (on-device inference), `libse.so`/`libse_loader.so` 1.3 MB combined (security — unknown internals [U]), `libeef0.so` 1.1 MB (unknown [U]), `libml-imageproc.so` 258 KB. All present unchanged from 4.654 → 4.655. — 4.655 study §1.4/E28

## Unknowns and gaps (stated, not guessed)

1. **The wire contract of `GetMapPoisForAnchor*` is unread** — class presence and model names only. Field numbers, gRPC path, and framing headers [U]. Nothing above claims a specific route.
2. **The exact field set of the +100 `rider.product` / +46 `rider.presentation` models is unread** [U]; the "typed product payloads" conclusion is an [I] from package growth and naming, the single strongest open-question signal the repo had.
3. **Arabic split vs base key difference was not differenced** (base has no language table, so the split is the authoritative Arabic set; no value-level diff against base defaults was performed).
4. **Split manifests were not decoded**; merged 10-APK manifest (what Android actually installs) not reconstructed.
5. **`FlashNacional` nature unknown** [U].
6. **`libse.so` / `libeef0.so` / tensorflow-lite on-device role unknown** [U] — do not infer "safety" or "ranking" from names.
7. **Reserve URL call sites unread** — the six content URLs are known from the string pool; their UI wiring was not read.
8. **4.654 evidence is archive, not re-pull** — same scripts/bases used on both sides where numeric, but the old APK is gone; R8 re-obfuscation dominates raw diffs.
9. **`CameraManagerWorker` 10 values still unconfirmed** in 4.655 (sealed type, zero fields exposed) — repo claim not contradicted, just not re-verifiable.
10. **Best-effort anchors**: `ar-dump-utf8.txt` line numbers are stable for this dump; the study's E-rows are the authority for 4.655 command output.

## Cost summary for Wind

| # | Feature | Verdict | Rough cost |
| --- | --- | --- | --- |
| 1 | Map-first home (provider chain shape, intents, padding, glide, map counter) | ADOPT shape; skip engines | 6–9 person-days |
| 2 | POI-anchored map API | ADOPT shape; ship empty behind flag until POI data exists | 4–8 person-days |
| 3 | Saved places + pickup center-pin | ADOPT saved places + pin refactor; defer search & snap-to-road | 5–8 person-days |
| 4 | Offers/product contract | ADOPT typed product list + server cadence; skip codegen | 3–4 person-days |
| 5 | Cash in Arabic + payment-first checkout | ADOPT wholesale (arrears gate, copy set, no-change UX, COD) | 7–11 person-days |
| 6 | Reserve/curbside-style handoff hints | ADOPT pattern; skip reserve/flight machinery | 3–4 person-days |
| | **Total** | | **~28–44 person-days** |

Recommended order: **5 → 3 → 4 → 6 → 1 → 2** (cash first — it's Wind's market; saved places and product contract are cheap wins; hints are quick; map-first home pays off across every order; POI needs a data decision).

---

*Static analysis only. No Uber host was contacted. All identifiers/strings quoted for identification only. 4.655 facts from the 4.655 study session unless re-verified locally today (noted inline); 4.654 facts from the repo's archived evidence, not re-verified against a live artifact.*
