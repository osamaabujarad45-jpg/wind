# Maps deep dive: how the map works, what it is built from, and the algorithms — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Edition:** deep pass (priority area) · **Nature:** factual reference, shareable.

Everything here is read from the installed package: class and member inventories, the native engines' own export tables and section tables, the resource table, the shipped parameter registry, and the package's assets. Where a statement is a *reading* of that evidence it is marked as one; where something cannot be established statically it says **not determined**. No map was observed on a live session and no service was contacted.

**Summary in five lines.** The map is a **first-party tile renderer** (native engine `libubermaps-gl.so`, 6,504 exported symbols) with a **Java abstraction layer** (`com.ubercab.android.map.*`, 1,083 classes) that can also host the Google Play services Maps client (70 classes) — both exist in this build. Styles are **server-delivered documents** (`tc2.uber.com/style/…`), tiles are **vector or raster** with disk caching, labels and markers go through a **collision/placement pipeline**, and the camera is a **Web Mercator** model (512-pixel tiles, ±85.05112878 latitude clamp, 6,378,137 m sphere). 1,746 classes and 1,722 parameters make up the map surface.

## 1. Layer map of the whole map stack

| Layer | Package / library | Classes | Role |
| --- | --- | --- | --- |
| Public map API | `com.ubercab.android.map.*` | 1,083 | views, camera, annotations, tile/glyph/sprite providers, caching, gestures |
| Map feature tree | `com.uber.maps.presentation` | 210 | map screens, access points, saved places, restrictions (protobuf models + RIBs) |
| Map design language | `com.uber.maps.mapsudl` | 99 | styling vocabulary for map elements |
| Map common models | `com.uber.maps.common` | 85 | protobuf models incl. `BackendInfo` |
| Map UGC | `com.uber.maps.ugc` | 66 | user-generated content on maps (reports, corrections) |
| Map navigation | `com.uber.maps.navigation` | 60 | camera following / turn-by-turn presentation |
| Map ads | `com.uber.maps.wasp` | 51 | waypoint ad presentation (`WaypointAdsServiceGrpcApi`) |
| Map experience | `com.uber.maps.mapsexperiencepresentation` | 36 | presentation models for the map experience |
| Places / geofences / routing SDK | `com.uber.mapssdk.{places,geofences,routing}` | 14 / 5 / 1 | saved places, zone geofences, `RouteService` |
| Rider map SDK | `com.uber.rider_maps_sdk.optional` | 14 | rider-specific map surfaces |
| Route share maps | `com.uber.routeshare.maps` | 10 | shared-trip map layer |
| Spatial imagery | `com.ubercab.android.map.spatialimagery` | 34 | cube-face imagery fetch (satellite/3D) |
| **Native engine** | `libubermaps-gl.so` | 6,504 exports | tile → bucket → GL renderer |
| **Native display vendor layer** | `libvendor-mapdisplay.so` | 4,196 exports | image decode, bridges back into Java, vendor flags |
| Google client (optional backend) | `com.google.android.gms.maps.*` | 86 | Play services Maps SDK client |

## 2. How a map screen is assembled (Java side)

| Step | Element | What it does |
| --- | --- | --- |
| 1 | `MapFactory` → `mapViewAdapter()` | one interface for "make me a map view" |
| 2 | `UberMapFactory` / `UberMapFactory.Builder` | builds the first-party map: its builder takes `network`, `parameters`, `receiver`, `storage` and **`styleUrl`** — i.e. the map is constructed with a network client, the feature-parameter registry, a broadcaster, a cache storage handle and a **style document address** |
| 3 | `MapViewAdapter` | lifecycle bridge: `onCreate`, `onStart`, `onResume`, `onPause`, `onStop`, `onDestroy`, `onLowMemory`, `onSaveInstanceState`, `getMap`, `addViewWithPriority`, `removeViewWithPriority`, `setHandlerBasedRenderingEnabled`, `setTargetDisplayRefreshRate` |
| 4 | `UberMapView` | the real surface: 179 methods, 70 fields. Holds `ubmMap`, `nativeMapView`, `renderer` (`UberGLRenderer`), `textureView`, `cameraState`, `glyphProviderDelegate`, `spriteObserver`, `styleObserver`, `rasterTileProviderDelegates`, `vectorTileProviderDelegates`, `polylineManager`, `pins`, `puck`, `annotations`, `viewMarkerContainer`, gesture and padding fields |
| 5 | RIB scope | map screens live in the map feature tree (`com.uber.maps.presentation`), attaching `MapLayer` implementations — **488 class definitions match `MapLayer`, every one first-party** (the code-inventory view lists 254 of them) — rather than owning maps |

Two backends, one API: `GoogleMapFactory`/`GoogleMapView` implement the same abstraction over the Play services client (**86 class definitions** under `com.google.android.maps`-family namespaces: `GoogleMap`, `GoogleMapOptions`, `StreetViewPanorama`, `Projection`, `CameraUpdate` wrappers). A third factory, `UBMMapFactory`, exists for the own-engine path alongside `UberMapFactory`.

### 2.1 Which renderer runs, and how the choice is made (verified)

The choice is **not** a runtime unknown — it is configuration read from a parameter, and the whole decision path is in the bytecode:

| Step | Element | Verified behaviour |
| --- | --- | --- |
| 1 | `MapProviderConfiguration` (holds `parameters`, `initialMapProvider`, `fallbackMapProviders`, `missingProviderDefault`; `hydrateConfig`, `getConfigJson`, `isKnownProvider`) | parses a JSON configuration model (`MapProviderConfigurationModel`, serialized/deserialized) into three values |
| 2 | `MapProviderState` (`configuration`, `currentMapProvider`, `didFallback`) | if the supplied provider is `UNKNOWN`, substitutes the configuration's missing-provider default; adopts a provider only when it is in the configured fallback set, recording `didFallback` and reporting usage |
| 3 | `MapFactory.create(MapProvider, MapDependencies)` | switch on the enum (`MapFactory$WhenMappings`: `UBER`→1, `GOOGLE`→2, `UNKNOWN`→3): **`UBER` builds `UberMapFactory`** with `network`, `parameters`, `receiver`, `assertClient`, `storage` and `styleUrl` from `parameters.getStringParameter("mapdisplay_flipr_stylesheet_path", "https://tc2.uber.com/style/default/native?o=DEFAULT")`; **`GOOGLE` builds `GoogleMapFactory`** with `parameters`, `receiver`, `assertClient`; `UNKNOWN` hits an assertion; anything else logs `"Tried creating a map factory from an unknown provider"` |
| 4 | Enum `MapProvider` | exactly three constants: `UBER`, `GOOGLE`, `UNKNOWN` |

**And the shipped configuration** (`map_display_mobile.mapdisplay_flipr_available_map_providers`) is:

```json
{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}
```

So in this build the **first choice is the own engine, with the Play services client as the fallback**, and a missing value also lands on the own engine. Two related parameters sit beside it: `mapdisplay_flipr_map_provider` (empty default) and `mapdisplay_flipr_streetview_provider` = `google`.

### 2.2 What the shipped default does not decide: the runtime observation (31 Oct)

The default above is what ships. It is **not** what the studied session used. On the owner's device, opening the trip-planning screen and then the full-screen pickup map produced:

| Signal | Observation |
| --- | --- |
| On-screen attribution | a **Google** wordmark in the map's corner (`runtime-map-screen.png`) |
| Process threads before any map | 281 threads; map-adjacent names only `GmsDynamite`, `GoogleApiHandle`, `RenderThread` |
| Process threads with the map open | 288 threads; **`androidmapsapi-*` (10–32 of them)**, **`google-maps-ini*`**, **`GL-Map`** |
| Own-engine thread families | **none**: no `msd*`, `TileWorker*`, `mapdisplay*`, `uv-*` names at all |

Reading: **in this session the map screens were drawn by the Google Play services client**, while the shipped parameter default selects the own engine. Three mechanisms could produce that gap — a **server-delivered parameter override at launch**, the **fallback path** (`fallbackMapProviders:["google"]` with `didFallback` set), or a Google provider being handed to the Compose map path by its `MapProviderState` — and distinguishing them needs runtime inspection beyond this study's boundary. What is settled: the decision code (§2.1) is correct, the shipped default is `uber`, and **the live resolution on this device was `google`**.

*Counting basis for this document: class **definitions** read from the code files' own class tables (288,727 total). Match counts quoted from the 31 Oct editions are code-inventory counts and are lower; where both exist they are given side by side.*

## 3. The native engine, by its own symbol table

`libubermaps-gl.so` — 4,099,192 bytes, 6,504 exports, 27 ELF sections, code section 1,870,120 bytes at 6.651 bits/byte (ordinary compiled code).

| Component (symbol evidence) | Symbols | Meaning |
| --- | --- | --- |
| `msd::*` (own engine) | 4,926 | the engine's own namespace |
| `maps::common::*` shared types | 1,506 | style, tile, gfx, glyph, image, mapdisplay, math |
| `MapContext` | 991 | per-map runtime context |
| Boost | 848 | general C++ utilities embedded |
| `Bucket` (feature buckets) | 311 | per-feature-type draw batches: `label`, `line`, `fill`, `fill_extruded`, `circle`, `marker`, `raster` |
| `Polyline*` | 304 | polyline drawables, pattern polylines (`PatternPolylineDrawable` 90) |
| libuv (`uv_*`) | 304 | embedded event loop for async tile/network work |
| `TileWorker` | 199 | tile parsing/placement workers |
| Clipper (`ClipperLib`) | 181 | polygon clipping/offsetting |
| `Annotation*` | 185 | annotation factory and animation |
| `Glyph*` / `Sprite*` / `Atlas` | 183 / 115 / 125 | text glyphs, sprite atlas, line atlas |
| `Collision` / `Placement` | 110 / 102 | label and marker collision solving |
| `Painter` | 112 | draw pass orchestration |
| `LiveTileData` / `VectorTileData` / `RasterTile` | 126 / 66 / 95 | tile representations |
| `maps::common::gfx::GLWrapper` / `OGLDevice` / `Uniform` / `Shader` | 60 / 46 / 34 / 33 | GL abstraction and shader plumbing |
| Stencil / Depth / Light | 21 / 15 / 10 | 3-D passes and lighting |
| rapidjson | 70 | JSON parsing (style documents and tile metadata) |
| `mapbox` namespace | 76 | open-source geometry only: `geojsonvt` 56 (vector-tile slicing), `Earcut` 18 (triangulation), 2 first-party URL helpers |
| Mapbox style parser marker | 1 | `msd::parsing::MapboxStyleVersion` — consumes Mapbox-format style documents |

There is **no `mbgl::` core namespace**: this is an own engine whose pipeline shape and style format follow the widely used open tile-rendering pattern, with open-source geometry components embedded — not a renamed third-party renderer.

`libvendor-mapdisplay.so` — 3,920,368 bytes, 4,196 exports — is the bridge/vendor layer: `maps::mapdisplay::*Bridge` for raster tiles, vector tiles, glyphs, sprites, styles, network, disk cache, analytics and experiments (`NetworkClientBridge`, `DiskCacheClientBridge`, `ExperimentsClientBridge`, `AnalyticsClientBridge`, …), plus image decoding (libpng 386 symbols, stb_image 53) and vendor feature flags compiled in (`mapdisplay_flipr_max_feature_request_polygon_vertices`).

## 4. The rendering pipeline, reconstructed

1. **Style** — the map is built with a `styleUrl`. The shipped defaults are `https://tc2.uber.com/style/default/native?o=DEFAULT`, `…/style/auto/native` (light/dark switching) and a `satellite` variant. The document is parsed by the style layer (`Style`, `MapboxStyleVersion` parser, rapidjson) into sources and layers.
2. **Sources and layers** — vector sources request tiles through `VectorTileProviderBridge` (`loadTile`, `cancelTile`); raster sources through `RasterTileClient`/`RasterTileProviderBridge`; remote imagery through the spatial-imagery path (§7). Each source has observers (`VectorTileObserver`, `RasterTileObserver`) and a `DiskCacheClient` with a configurable namespace (`mapdisplay_flipr_ubm2_disk_cache_namespace`).
3. **Tile work** — `TileWorker` (199 symbols) parses tile geometry, applies per-feature extraction (`GeometryTileFeatureExtractor`), and places features into **buckets by feature type** (label, line, fill, fill_extruded, circle, marker, raster). Symbol placement runs a collision pass across buckets (`Collision`, `Placement`), and the Java side indexes collision/polygon data in `SparseIndexedQuadTreeStore`.
4. **Draw** — `Painter` issues passes over the buckets through the GL wrapper (`Uniform`, `Shader`, framebuffer/`Stencil`/`Depth` state), with glyph, sprite and line atlases bound as textures.
5. **Present** — the engine renders into the `TextureView` held by `UberMapView`; frame pacing is parameterised (`mapdisplay_flipr_frame_rate`, default 0 = follow the display; `setTargetDisplayRefreshRate`, `setHandlerBasedRenderingEnabled` both exist on the view/adapter).

## 5. Camera and coordinate maths (verified)

**Camera state.** `CameraPosition{target, zoom, tilt, bearing, offset}` with a builder; `CameraUpdate` expresses intents and carries the constants `CAMERA_POSITION`, `LAT_LNG`, `LAT_LNG_BOUNDS`, `LAT_LNG_BOUNDS_DIMEN`, `LAT_LNG_BOUNDS_MAX_ZOOM`, `LAT_LNG_ZOOM`, `SCROLL_BY`, `ZOOM_IN`, `ZOOM_OUT`, `ZOOM_TO` and `DEFAULT_ANIMATION_DURATION_MS`. `com.ubercab.android.map.camera.CameraUpdating` exposes `OnCameraEventListener`; the view exposes `onCameraChange/Idle/MoveStarted/Move/MoveCanceled` listeners internally and `getCameraPosition`, `getZoomLevel`, `getPitch`, `getDirection`, `getCenterCoordinate`, `getProjection`, `getSnapshotProjection`.

**Projection.** Tiles are **512 px** in Web Mercator, and resolution is computed as (verified from the shipped implementation of `ProjectionUtils.metersPerPixelAtCoordinate`):

> metresPerPixel(lat, zoom, density) = (cos(radians(clamp(lat, −85.05112878, +85.05112878))) × 2 × π × 6,378,137) ÷ (2^zoom × 512 × density)

That is the standard spherical-Mercator resolution formula with three things fixed by the constant: the **WGS-84 sphere radius 6,378,137 m**, the **±85.05112878° latitude clamp** (the Mercator "square world" limit), and a **512-pixel tile**. Device density is passed in, so the same camera produces different pixel densities per device.

**How the arguments are supplied (verified).** `UberProjection.metersPerPixelAtCoordinate(lat)` calls the helper with `(lat, NativeMapView.getZoom(), screenDensity)`, and its constructor captures `screenDensity` plus the view's visible bounds at creation; `GoogleProjection` and `UberSnapshotProjection` call the same helper. So the formula's second argument is the native zoom and the third is the device density factor.

**On the study device** (1080×2400 at 450 dpi → density 2.8125): at zoom 15 the resolution is **0.85 m/px at the equator** and **0.77 m/px at latitude 25°** — i.e. one screen pixel covers roughly 0.8 m, and a 2400-px-tall screen spans about 1.8 km. At zoom 17 it is 0.21 m/px; at zoom 12 it is 6.8 m/px.

**Fit-to-bounds.** `CameraUpdate.LAT_LNG_BOUNDS[_DIMEN|_MAX_ZOOM]` are the intents for fitting a region: the engine receives the bounds, the viewport dimensions and a maximum zoom, and derives the camera — i.e. the classic "zoom to fit bounding box, capped at max zoom" operation expressed as an intent type rather than a client-side formula.

**Geo indexing.** Zones, service areas and pickup geometry use H3 (`libh3.so`, 192 exports; `com.uber.h3.NativeMethods` bridge) — hex cells rather than rectangles; AV service areas are client-side geofenced map layers (`AvServiceAreaGeofenceStore`).

**Geometry operations.** Polygon clipping/offsetting is Clipper (181 symbols); GeoJSON is sliced into tiles by `geojsonvt` (56 symbols); triangulation for fill meshes is `Earcut` (18 symbols); polylines have their own tessellation and pattern support (`PatternPolylineDrawable`, `PolylineV2AnimationOptions`, `UMDFPolylineAdapter`).

## 6. Interaction surface

**The layer model is plugin-style by design, and this is corroborated publicly.** The vendor described the same architecture in 2019 for its driver app: a persistent background map mediated by a **Layer Manager** (each feature registers its own layer; an *exclusive* layer hides the rest; every layer is bound to a RIB interactor so it dies with its feature), a **Padding Provider** (chrome registers as a padding source and the aggregated edge insets are published as an observable), and a **Camera Director** (features register camera rules listing coordinates that must stay visible; one feature at a time may hold exclusive camera control). The artifact shows all three: 488 `MapLayer` implementations, padding-inset fields plus a padding debug view on the map view, and camera listeners with an active-map counter. Public statement and measurement agree, so the layer model is treated as settled rather than inferred from names.

| Capability | Evidence |
| --- | --- |
| Tap, double-tap, scale, rotate, **shove** (two-finger pitch) | `MapGestureDetector{Scale,Rotate,Shove,Gesture}Listener`; timeouts `TAP_TIMEOUT`, `DOUBLE_TAP_TIMEOUT`; per-gesture running flags |
| Focal-point centring | `GoogleMapView.TouchEventHandler.transformEventToMapCenter`, `dispatchFocalPointCenterTouchEvent`, `isFocalPointCenterEnabled` |
| Hit-testing at a tap point | `findNativeMarkerAtTapPoint`, `findNativePolygonAtTapPoint`, `findNativeCircleAtTapPoint`, `findMarkers`, `highlightNearest` |
| Click callbacks | `onMarkerClickListener`, `onPolygonClickListener`, `onPolylineClickListener`, `onMultiPolygonClickListener`, `onPoiClickListener`, `onCircleClickListener`, `onMapClickListener` |
| Marker/overlay management | `addMarker`, `addCarMarker`, `addPuckCircle`, `addViewMarker`, `updateViewMarker(s)`, `addViewWithPriority` + `handleViewMarkerZIndexUpdate`, `addPolyline`, `addPolylineV2`, `addPatternPolyline`, `addPolygon`, `addCircle`, `addAnimationCallback` |
| Style and feature override at runtime | `addStyleClass`, `hasStyleClass`, `getStyleClasses`, `clearFeatureOverrides`, `clearHighlighting`, `clearTileOverlayCache`, `createDynamicStringParameterChangedEvent` |
| Indoor and 3-D | `isIndoorEnabled`, `setIndoor…` listeners, `is3DBuildingsEnabled`, `mapdisplay_flipr_enable_gltf_rendering`, `zoom_level_threshold_to_enable_3d_map_control` = 15.0 |
| Marker views | resource layouts `base_map_marker_content_{icon,title,subtitle,leading_custom_view}`, `callout_map_marker_view{,_v2}`, `fixed_map_marker_view`, `floating_label_map_marker_view`, `bike_safety_tooltip`, `av_trip_status_tracker_view` |

## 7. Imagery, 3-D and satellite

`com.ubercab.android.map.spatialimagery` implements **cube-face imagery**: `UberCubeFaceUrls{front, back, left, right, top, bottom}` with `UberMetadataRequest`/`MetadataBody` and `UberMetadataDownloader`, backed by the generated service `SpatialImageryGrpcApi`. The renderer holds a `cubeMap` and a `vPMatrix` and has `updateCubeFaces()` / `invalidateCubeMap()` — the cube is refreshed as the camera moves. Reading: **satellite/oblique imagery is fetched as a cube of face textures** rather than as flat tiles, and composited by the same GL renderer.

## 8. Regional geometry shipped in the package

`assets/geojson/` holds country outlines used for map-camera and region behaviour: **9 regions** — `usa`, `california`, `china`, `india`, `japan`, `south_korea`, `spain`, `taiwan`, `vietnam` — each as a full outline and an `_approximate` simplification (18 files, 207–2,832 bytes each). Reading: coarse polygons are enough for "which country/region am I showing", so the app ships them rather than requesting boundaries.

## 9. Configuration surface of the map (exact defaults from the shipped registry)

| Parameter | Default | What it controls |
| --- | --- | --- |
| `map_display_mobile.mapdisplay_flipr_stylesheet_path` | `https://tc2.uber.com/style/default/native?o=DEFAULT` | base style document |
| `…mapdisplay_flipr_auto_stylesheet` | `https://tc2.uber.com/style/auto/native?o=DEFAULT` | automatic (light/dark) style |
| `…mapdisplay_flipr_satellite_stylesheet` | (empty default) | satellite style document |
| `…mapdisplay_flipr_frame_rate` | `0` | render frame rate (0 = follow display) |
| `…mapdisplay_flipr_tile_overlay_cache_size` | `24` | overlay tile cache entries |
| `…mapdisplay_flipr_tile_query_cache_size` | `131072` | tile-query cache entries |
| `…mapdisplay_flipr_max_tile_query_polygon_area_m2` | `25000000.0` | largest polygon area still queried per tile (25 km²) |
| `…mapdisplay_flipr_render_frame_allocator_capacity` | `10485760` | per-frame allocator (10 MiB) |
| `…mapdisplay_flipr_enable_gltf_rendering` | flag | 3-D model rendering for map objects |
| `…mapdisplay_flipr_enable_xray_polyline` | flag | x-ray polyline rendering |
| `…mapdisplay_flipr_use_overscale_cache` | flag | overscaled tile cache reuse |
| `…mmdf_enable_cluster_id`, `mmdf_debug_hit_box_with_cluster_padding` | flag / config | marker clustering (map-marker display framework) |
| `…zoom_level_threshold_to_enable_3d_map_control` | `15.0` | zoom at which 3-D controls appear |
| `emobility_mobile.mimo_default_map_zoom_level_pre_trip` | `17` | pre-trip zoom for bikes/scooters |
| `emobility_mobile.mimo_map_zoom_{inner,maximum,minimum}_radius_in_meter` | `40` / `3000` | zoom-to-assets radius bounds |
| `autonomous_mobile.av_geofence_exclusion_zones_zoom_threshold` | `13.0` | zoom at which AV exclusion zones draw |
| `autonomous_mobile.offer_card_map_zoom_threshold` | `5` | offer-card map zoom |
| `map_display_mobile.mapdisplay_flipr_available_map_providers` | `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}` | **renderer selection** (see §2.1) |
| `map_display_mobile.mapdisplay_flipr_map_provider` | (empty) | direct provider override |
| `map_display_mobile.mapdisplay_flipr_streetview_provider` | `google` | street-view backend |

Namespaces for the map surface: `maps_experience_mobile` (420 parameters), `maps_navigation_mobile` (416), `map_display_mobile`, `map_marker_display_mobile`. In total **1,722 parameters** across the package relate to map/location/geography.

## 10. What this study did not establish

- **Why** the observed session resolved to Google while the shipped default names the own engine — an override, a fallback activation or a Google provider supplied to the Compose map path would each explain it (§2.2); telling them apart needs runtime inspection, which the study's boundary excludes.
- **The exact tile protocol and request shape** (URL pattern, headers, compression, version negotiation) — the network client is behind `NetworkClientBridge`; the style/tile endpoints are parameterised, and no traffic was captured.
- **Vector-tile schema details** — `VectorTileData` exists natively; field names are not in the Java layer.
- **The internal contents of the style documents** — they are fetched at runtime from the style host; the package carries no bundled style.
- **The precise camera animation curves** — `DEFAULT_ANIMATION_DURATION_MS` and `pendingMove` exist, but easing constants were not read out.

## 11. Evidence (archive: the current-study evidence folder under `research_notes/`)

| Claim group | Evidence file |
| --- | --- |
| Map class inventory (1,746), member lists, package split | `map-stack.json` |
| Native bridge classes (60) | `map-native-bridge.json` |
| Engine exports and namespace/component census | `exp-libubermaps-gl.json`, `exp-libvendor-mapdisplay.json`, `native-component-census.json`, `native-symbol-families.json` |
| Library section tables and sizes | `elf-sections-summary.json`, `extract-arm64.json` |
| Map parameters and exact defaults | `parameters-registry-summary.json` |
| Map-layer counts (488 definitions / 254 in inventory), marker/map queries, Maps-client counts (86 definitions / 70 in inventory) | `map3-MapLayer.json`, `map-maps.json`, `sdk-com.google.android.gms.json`, `dex-classes.txt.gz` |
| GeoJSON assets and asset listing | ZIP entry listing recorded with `dex-inventory-summary.json`; asset inventory from the package's `assets/` tree |
| Camera/projection method text | `01-projection-mpp.json`, `method-projection-mpp.json` (method records) |
| **Runtime renderer observation** (§2.2) | `runtime-map-renderer-observation.json`, `runtime-map-screen.png`, `runtime-map-search-screen.png`, `runtime-map-threads.txt` |
| **Renderer selection** (enum, switch map, factory wiring, fallback rule) | `map-provider-selection.txt` (bytecode extracts of `MapProvider`, `MapFactory$WhenMappings`, `MapFactory.create`, `MapProviderState.setCompliantMapProvider`/`onMapProvidersChanged`), produced with `dexdump-extract.py`; shipped default value in `parameters-registry-summary.json` |
| Map API routes used by the surfaces | `dex-api-paths.json` (`rt/map-feed`, `rt/pudo-presentation-helix`, `rt/routing`, `rt/navigation`, `rt/locations`, `rt/v1/maps/report-provenance`) |

## 12. Appendix: routines read out one method at a time

Four routines were read in their source form (records archived as `method-*.json`). They are summarised here as behaviour, with the identifiers and constants as shipped.

| Routine | Verified behaviour |
| --- | --- |
| `com.ubercab.android.map.ProjectionUtils.metersPerPixelAtCoordinate(UberLatLng, double zoom, double density)` | Returns `(cos(radians(clamp(latitude, −85.05112878, +85.05112878))) × 2 × π × 6,378,137) ÷ (2^zoom × 512 × density)`. Confirms: spherical Web Mercator, 512-pixel tiles, latitude clamp at ±85.05112878°, density applied last. |
| `com.ubercab.android.map.UberMapView.addPuckCircle(CircleOptions)` | Builds an `UberCircle` from the options, marks it `radiusType = 1` and `trackUserLocation = true`, registers it with the native map (`nativeMapView.addCircle`) to obtain its id, and adds it to the view's annotation list. Confirms: the user-location "puck" is a native circle annotation that tracks location rather than a view overlay. |
| `com.ubercab.android.map.UberMapView.findNativeMarkerAtTapPoint(PointF)` | Collects all markers under the tap (`findMarkers`), sorts them with a comparator, and returns the first — i.e. hit-testing is a candidate set plus an ordering rule, not a single lookup. |
| `com.ubercab.android.map.MapGestureDetector.create(Context, UiSettings, Listener)` | Constructs the detector from context, the map's UI settings and a listener — the gesture configuration lives in `UiSettings`, not in per-screen code. |
| `com.ubercab.android.map.CameraUpdate.bounds()` | Accessor with no shipped body (recorded as such) — the visible intents are the constants and the factory surface, not a client-side geometry formula. |
| `com.ubercab.android.map.UberMapView.getProjection()` | Returns `new UberProjection(nativeMapView, (double) screenDensity)` — the projection is a density-aware wrapper over the native projection, mirroring what the Play services wrapper does with its own `densityFactor` (`GoogleMap.getProjection()`); the reader that hung on this routine was replaced by the platform's own instruction listing, which returns it in seconds. |
| `com.ubercab.android.map.UberGLRenderer.updateCubeFaces(Map<UberCubeMapFace, Bitmap>)` | If a cube map exists, forwards the face bitmaps to `updateCubeFaceTextures(map)`; otherwise stores them as a `PendingMove`, recycling any previously pending bitmaps first — i.e. face updates arriving before surface creation are queued and old frames freed. |
| `com.ubercab.android.map.compose.internal.MapFactory.create(MapProvider, MapDependencies)` | The renderer decision itself (§2.1): `UBER` → `UberMapFactory`, `GOOGLE` → `GoogleMapFactory`, `UNKNOWN` → assertion, otherwise an error log. |
| `com.ubercab.android.map.compose.internal.MapProviderState.setCompliantMapProvider(MapProvider)` | Substitutes the missing-provider default for `UNKNOWN`, returns when the provider already equals the current one, and adopts a new provider only if it is in `configuration.getFallbackMapProviders()`, then records `didFallback` and reports usage. |
| `com.ubercab.android.map.MapViewAdapter.onCreate(Bundle)` | Declared on the **abstract** base class `MapViewAdapter` (extends `FrameLayout`), so no body exists there — the bodies live in the two concrete adapters, `UberMapView` and `GoogleMapView`, both subclasses of it in the same code file. Recorded as such; the lifecycle contract is established from the member inventory and the subclass set, not from a base body. |
| `com.ubercab.android.map.spatialimagery.UberMetadataDownloader.download(UberMetadataRequest, Continuation)` | A Kotlin suspending call: takes the request's own `NetworkRequest`, executes it through the shared `Network` (coroutine network helper), and returns an `UberMetadataResource` — imagery metadata is fetched on demand as a normal suspending network call, with no cache layer inside that routine. |

