# Uber rider app — map capability inventory (competitive architecture study)

**Compiled:** 2 November 2026 · **Edition:** exhaustive map-feature inventory for gap analysis · **Nature:** read-only study of the decompiled rider app `com.ubercab` 4.654.10002.

**Sources.** Decompiled Java at `jadx-out2/sources` (paths below are relative to `jadx-out2/`), cross-referenced with `KNOWLEDGE-2026-11-01-uber-app-maps-deep-dive.md` (cited as *deep dive §N*) and `KNOWLEDGE-2026-10-31-uber-app-maps-and-location-facts.md` (cited as *facts §N*). No Uber system was contacted; no live traffic; concepts and shapes only, no decompiled code reproduced verbatim in any deliverable.

**Method & honesty rules.** The tree was navigated by targeted glob/grep, not read whole. Where decompilation failed or names are obfuscated (`a.java`, one-letter methods), it is stated as such. Notable decompilation gaps found in this pass:

- `UberMapView` does **not** exist as a named class in this jadx output; only `GoogleMapView` survives by name (`sources/com/ubercab/android/map/GoogleMapView.java:24` — `class GoogleMapView extends MapViewAdapter`). The abstract lifecycle contract is fully readable in `MapViewAdapter`; the own-engine view's 179-method inventory in *deep dive §2* came from an earlier extraction.
- The protobuf class `AccessPointGroup` failed to decompile — only an empty `AccessPointGroupOrBuilder` survives (`sources/com/uber/maps/presentation/AccessPointGroupOrBuilder.java`, empty interface).
- The package `com.uber.map_hub.*` (e.g. `ConfirmationCameraManagerWorker`, imported by `sources/com/ubercab/map_hub/configuration/regular/ConfirmationMapConfiguration.java:4`) is **not present** in this jadx output at all.
- Several generated accessors decompile to `throw null` bodies (e.g. `NearestFeatureTypeOptions.NearestRoadOptions`, `HitTestOptions.RoadHitOptions`) — the type surface is intact, the accessor bodies are not.
- Route-line presenter internals are obfuscated single-letter classes (`sources/com/ubercab/map_hub/map_layer/route_line/a.java`, `b.java`, `c.java`) — behavior cited only where readable.

---

## 1. Map provider abstraction and fallback

The two-backend design is a first-party abstraction with an explicit, config-driven selection chain — not a runtime guess.

| Piece | Evidence (path in `jadx-out2/`) | Verified behavior |
| --- | --- | --- |
| Provider enum | `sources/com/ubercab/android/map/compose/internal/MapProvider.java` | Exactly three values: `UBER`, `GOOGLE`, `UNKNOWN`. `Companion.fromString` maps empty → `UNKNOWN`, `"google"` → `GOOGLE`, everything else → `UBER` (jadx enum-recovery warning present; values and `fromString` readable). |
| Config model | `sources/com/ubercab/android/map/compose/internal/MapProviderConfigurationModel.java` | Kotlinx-serialized JSON of `{initialMapProvider, fallbackMapProviders: List<String>, missingProviderDefault}`. |
| Provider state | `sources/com/ubercab/android/map/compose/internal/MapProviderState.java` | Holds config + a Compose `MutableState` current provider + `didFallback` flag. `setCompliantMapProvider`: `UNKNOWN` → substitute `missingProviderDefault`; adopt a new provider **only** if it is in the fallback set; sets `didFallback` once; every change emits an analytics event `providerUsed`/`context=composeMap`. |
| Factory switch | `sources/com/ubercab/android/map/compose/internal/MapFactory.java` | `create(MapProvider, MapDependencies)`: `UBER` → `UberMapFactory` built with network/parameters/receiver/assert/storage and `styleUrl = parameters.getStringParameter("mapdisplay_flipr_stylesheet_path", "https://tc2.uber.com/style/default/native?o=DEFAULT")`; `GOOGLE` → `GoogleMapFactory`; `UNKNOWN` → assertion/log `"Tried creating a map factory from an unknown provider"`. |
| Dependencies bundle | `sources/com/ubercab/android/map/compose/MapDependencies.java` | Every map is constructed with five injected handles: `Parameters` (feature-flag registry), `Network`, `Storage` (disk cache), `EventReceiver` (analytics), `Assert`. |
| Lifecycle contract | `sources/com/ubercab/android/map/MapViewAdapter.java` | Abstract `FrameLayout` with `onCreate/Start/Resume/Pause/Stop/Destroy`, `onLowMemory`, `onSaveInstanceState`, `getMap(OnMapReadyCallback)`, `addViewWithPriority`, `removeViewWithPriority`, `setHandlerBasedRenderingEnabled`, `setTargetDisplayRefreshRate`. Both backends implement it (`GoogleMapView` at `GoogleMapView.java:24`). |
| Selection/usage streams | `sources/com/ubercab/rx_map/core/map_provider/MapProviderSelectionStream.java`, `MapProviderUsageStream.java` (+ Mutable variants) | Provider choice and usage reporting are observable streams, so analytics and A/B ride on the same mechanism. |
| Leak/multi-map guard | `sources/com/ubercab/android/map/ActiveMapCounter.java` | Process-global counter **per provider** (`UBER`, `GOOGLE`); on every increment, if the total is a new peak above a configured threshold it emits an `active_map_count` analytics event with `total`, `uber_count`, `google_count`. This is a live-map leak detector. |
| Config permission gate | `sources/com/uber/map/core/map_provider/MapProviderConfigPermissionChecker.java` | Single-boolean interface gating whether a session may override provider config. |
| Shipped default | *deep dive §2.1/§9* | `mapdisplay_flipr_available_map_providers` = `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}`; live resolution on the study device was `google` (*deep dive §2.2*, cause not determined). |

**Shape to port:** one `MapFactory` interface + a provider enum + a serializable `{initial, fallbacks, missingDefault}` config + a state object that only ever *falls forward* within the allowed set and reports every change. A small app needs the shape, not two engines.

## 2. Camera model

Everything a feature wants from the camera is an **intent object**, not a method call on the view.

| Piece | Path | Behavior |
| --- | --- | --- |
| Position | `sources/com/ubercab/android/map/CameraPosition.java` (+ `AutoValue_CameraPosition.java`) | `{target, zoom, tilt, bearing, offset}` with builder; used both by the intent layer and the compose layer. |
| Intent union | `sources/com/ubercab/android/map/CameraUpdate.java` | Parcelable with type constants: `CAMERA_POSITION(0), LAT_LNG(1), LAT_LNG_BOUNDS(2), LAT_LNG_BOUNDS_DIMEN(3), LAT_LNG_ZOOM(4), SCROLL_BY(5), ZOOM_IN(6), ZOOM_OUT(7), ZOOM_TO(8), LAT_LNG_BOUNDS_MAX_ZOOM(9)`; `DEFAULT_ANIMATION_DURATION_MS = 300`. One object carries type + payload + padding + maxZoom + width/height + x/y pixels. |
| Factory | `sources/com/ubercab/android/map/CameraUpdateFactory.java` | `newCameraPosition`, `newLatLng`, `newLatLngBounds(bounds, padding)`, `newLatLngBounds(bounds, w, h, pad)`, `newLatLngBoundsWithMaxZoom`, `newLatLngZoom`, `zoomTo` — all argument-checked, all returning the single `CameraUpdate` type. Fit-to-bounds is expressed as an intent; the engine derives the camera (deep dive §5). |
| Keyframe timeline | `sources/com/ubercab/android/map/CameraUpdateTimeline.java` | Per-property keyframe tracks: `target` (LatLngEvent) + `zoom`/`tilt`/`bearing`/`offsetRatio` (ValueEvents), each `{startTime, duration, value, ControlPoints}` — i.e. a full animation timeline with per-property easing, not just "animate to". |
| Duration wrapper | `sources/com/ubercab/android/map/camera/CameraTimeline.java` | Kotlin duration-based: `DEFAULT` (= 300 ms from `CameraUpdate.DEFAULT_ANIMATION_DURATION_MS`) and `INSTANT` (0). |
| Easing | `sources/com/ubercab/android/map/EasingFunction.java`, `ControlPoints.java` | Cubic-Bézier control points; presets `Linear (0,0,1,1)` and `EaseInOut (.42,0,.58,1)` — CSS-style curves reused across camera, polylines and location animation. |
| Semantic zoom ladder | `sources/com/ubercab/android/map/camera/calculating/SemanticZoom.java` | Named zoom levels: `WORLD 0, CONTINENT 2, CITY 12, NEIGHBORHOOD 14, STREETS 15, BUILDINGS 17, BUILDING 18, ANTS 22`, plus `CUSTOM(d)`; `Comparable`. |
| Zoom clamping | `sources/com/ubercab/android/map/camera/calculating/ZoomClamp.java` | A `ClosedRange<SemanticZoom>` — clamp ranges are expressed in *semantic* zooms, not raw doubles. |
| Layout presets | `sources/com/ubercab/android/map/camera/calculating/SemanticZoomLayout.java` | `MAXIMIZED, COMFORTABLE, WIDE` — named framing presets for "how much map around the subject". |
| Auto position+zoom | `sources/com/ubercab/android/map/camera/calculating/AutoPositionAndZoom.java` | Moshi-serializable `{locations: Collection<UberLatLng>, center?, layout}` — the declarative "frame these points" request (defaults `center=null, layout=MAXIMIZED`). |
| Composable position updater | `sources/com/ubercab/android/map/camera/updates/CameraPositionUpdater.java` + impls | Pure-function updaters `apply(CameraPosition, CameraEnvironment) → CameraPosition`: `MakeVisibleCameraPositionUpdater` (project the target and recenter just enough to make it visible within a `SemanticZoomLayout`, honoring edge padding — `MakeVisibleCameraPositionUpdater.java:34-46`), `ConcatenatedCameraPositionUpdater` (compose two), `VerticalOffsetRatioCameraUpdater` (clamped-ratio vertical offset — the "put the route in the top two-thirds" move used with bottom sheets, range-asserted), plus `CameraPositionUpdater_{AutoPosition,Orientation,Zoom}Kt` extension sets. |
| Off-screen math | `sources/com/ubercab/android/map/camera/calculations/` (`OffScreenMapProjection`, `DefaultOffScreenMapProjectionFactory`, `MapBounds`, `VisibleMapElement`, `EdgePaddingDouble`, `Double2/2x2`) | Camera math runs against a projection *factory* so visibility can be computed for hypothetical cameras ("if I moved there, would X be on screen") — double-precision, density-aware. |
| Environment | `sources/com/ubercab/android/map/camera/CameraEnvironment.java` (+ `calculations/CameraEnvironmentContext.java`) | Camera state is a function of `CameraEnvironment` = size + density + insets; updaters are pure given environment, hence trivially testable and replayable. |
| Compose state | `sources/com/ubercab/android/map/compose/camera/MapCameraState.java`, `MapCamera.java`, `MapCameraPosition.java`, `ZoomLevel.java` | Compose-observable camera: `isMoving`, `moveInitiatedByGesture`, `cameraPositionTarget`, an `automaticCameraLocationsProvider` hook (auto-follow camera as a lambda of current locations), suspend `animateTo(position, duration = 300ms)`, default camera = world (0,0) at `ZoomLevel.WORLD`. |
| Street-view/3D camera | `sources/com/ubercab/android/map/UberCamera.java` | Separate GL camera (fov 100°, yaw/pitch, `cameraHeightMeters = 2.49936` ≈ eye height, view/projection matrices) used by the street-view/imagery surfaces — kept apart from the map camera. |

## 3. Camera director + padding

The feature-facing arbitration layer sits in `sources/com/uber/mapdisplay_framework/` and matches the vendor's published Layer Manager / Padding Provider / Camera Director architecture (deep dive §6).

**Camera rules.** `sources/com/uber/mapdisplay_framework/camera/CameraRule.java` is an abstract "these coordinates must stay visible" holder: a `Set<UberLatLng>` + a `Listener`; `c(set)` swaps the set and notifies. The concrete rule (`camera/a.java`) is literally `{boundedLocations, listener}` with generated equality. Features register rules; the director aggregates.

**Camera director.** Interface `camera/MapCameraDirector.java` (method names obfuscated `a/b/d/e/f` — honest) implemented readably in `camera/b.java`:

- extends a scoped registry `d<Set<UberLatLng>, CameraRule>` — every registered rule is **auto-disposed with its feature's `ScopeProvider`** (RIB scope), so camera wants die with the screen that wanted them;
- `h(set)` creates a rule and re-aggregates: `c()` unions *all active rules'* locations into one published set (`this.g.accept(union)`) — many features' visibility wants merge into one camera target;
- `f(holder, next, scope)` is **exclusive control with interruption**: the previous holder's `PublishSubject` is completed, a new one is created, and the holder completes when *either* its scope dies *or* it is superseded (`CompletableAmb`), after which control flows to a continuation holder — i.e. a token-passing camera;
- `d(CameraUpdate)` issues direct updates through a serialized subject (single-flight ordering);
- `b()` returns a `CameraDirectorLog` (active rules + a queue of `CameraUpdateLog`) — the director is debug-loggable by design.

**Per-screen camera flavors.** `sources/com/ubercab/rider_map_common/map_hub/CameraManagerWorker.java` defines a worker enum: `BASIC_LOCATION_EDITOR, CONFIRMATION, DEFAULT, EVENT_SHUTTLE, HCV, HELIUM, HUB_POOL, ROUTE_LINE, WALKING_PICKUP, NO_OP` — every map surface names its camera-manager flavor; `NO_OP` exists for non-interactive previews. (The `com.uber.map_hub.*` implementations did not survive decompilation in this output — see honesty notes.)

**Padding model.** `sources/com/ubercab/android/map/padding/`:

- `EdgePadding{left, top, right, bottom}` (ints, `EMPTY` constant);
- `CornerPadding{anchorPosition: TOP_LEFT|TOP_RIGHT|BOTTOM_LEFT|BOTTOM_RIGHT, size}` — rectangular reserved areas pinned to corners (logo, compass, buttons);
- `MapPaddingInsets{edgePadding, cornerPaddingList}` — one value object combining both, `EMPTY` constant.

**Padding plumbing.**

- `sources/com/ubercab/rx_map/core/MapPaddingSource.java`: any UI chrome can register as a source that fills a `Rect` (method name obfuscated `ra`); `MapPaddingCornersSource.java` is the corner-list sibling.
- `sources/com/ubercab/rx_map/core/MapPaddingManager.java`: a `@MapPaddingManager`-annotated `CoordinatorLayout` is the aggregator — a static helper walks up the view tree to find it and triggers re-layout, so bottom sheets/chrome push the map by *declaring* insets, not by calling `setPadding` on the map.
- `sources/com/ubercab/android/map/camera/CameraUpdaterMapIntegration.java`: the bridge — `initialize(viewGroup, density)` posts initial size and listens to layout changes, `setPadding(l,t,r,b)` and `setCornerPaddings(list)` rebuild `MapPaddingInsets` **into the `CameraEnvironment`** (`copy$default`), and `updateCamera(CameraUpdate, CameraTimeline, onDone)` forwards. Padding therefore affects camera math and hit tests uniformly, one source of truth.

## 4. Marker / callout / layer / z-order system

**Native-marker options.** `sources/com/ubercab/android/map/MarkerOptions.java`: `position, icon(BitmapDescriptor), anchorU/V (0..1), alpha, rotation, flat, visible, zIndex, minZoom, maxZoom (default 0..31!)` — every marker carries a **zoom visibility range**, the primary culling lever. `title` is `@Deprecated` — text moved out of native markers.

**View markers.** `sources/com/ubercab/android/map/ViewMarkerOptions.java`: `view, position, anchorX/Y (default 0.5), zIndex, enableCollision (default false)`. Arbitrary Android views as map annotations, optional participation in collision.

**ViewMarkerContainer** (`sources/com/ubercab/android/map/ViewMarkerContainer.java`) — the overlay that hosts all view markers *and* view polylines:

- `Map<View, Integer> priorities` — z-order is a per-view priority integer;
- enforces a **48 dp minimum touch target** by expanding the hit rect of small clickable children (`minTouchSizePx`, `handleTouchPadding`);
- tap vs. scroll arbitration via `ViewConfiguration` touch-slop + double-tap timeout, with a `mapdisplay_flipr_fix_view_marker_padded_taps` feature-flag-guarded stricter validation.

**Layer framework** (`sources/com/uber/mapdisplay_framework/`):

- `UnifiedMapLayer` = `MapLayerModelSupport + MapElementContainer + MapLayerVisibilitySupport + MapLayerLifecycle` + `getTag()` + `i()` (a `MapLayerLog`); i.e. a layer bundles element container, visibility (show/hide/clear/isVisible), lifecycle (`onCreate`/`d()`), identity tag, and its own debug log.
- `ExclusiveUnifiedMapLayer.q(tag)` — an exclusive layer hides all others of its tag (the "one modal layer at a time" rule is a type, not a convention).
- `MapManager` = `RxMapStream + MapEventsFlow + MapModelManager` and exposes `MapCameraDirector i()`, `MapSettingsManager m()`, `UnifiedMapLayerManager n()`, `UnifiedMapProjection p()` — one object per map surface: camera director + settings + layer manager + projection.
- `MapSettingsManager` (extends `UiSettings`) applies a **server-driven `MapSettingsModel`** (`e(MapSettingsModel)`), user location flow (`f(Flow<UberLocation>)`), map type, 3D buildings, closures/traffic-areas toggles, `FeatureOverrides`, highlighting clear, and map-location setters.
- `MapModelManager.a(MapModel, ScopeProvider)` + `Observable<…> e()` — a whole server map document can be attached to a scope and observed (see §11).
- Marker-level container methods on `MapElementContainer` (names partly obfuscated): add/remove single + `addAll`/`removeAll` + a **swap pair** `b(old, new)` (diff-friendly), plus polyline/polygon/circle/multipolygon add/remove/update triples.
- `binding/MapMarker{Boolean,String}BindingKey` + `MapPolyline{Boolean,String}BindingKey` — marker/polyline properties are settable through late **binding keys** (server-driven UI can address annotation properties symbolically).

**Marker display priority & collision (Compose layer).** `sources/com/ubercab/android/map/compose/element/`:

- `MarkerDisplayPriority` — inline value class: `Low=0, Default=0, Medium=2, High=1000, AlwaysDisplay=Int.MAX_VALUE`.
- `CollisionStrategy` = `Fixed | Floating(candidates: List<MarkerFloatingPlacement>)` — a marker either stays put or may float among candidate placements.
- `MarkerFloatingPlacement` — the 8 compass positions around the anchor: `TOP, TOP_END, END, BOTTOM_END, BOTTOM, BOTTOM_START, START, TOP_START`.
- `MarkerCollision`, `MarkerNode`, `MarkerKt` — Compose nodes that render markers through this system.

**Collision engine** (`sources/com/ubercab/android/map/collision/` + `compose/internal/element/marker/`):

- `CollisionEngine` (interface): `upsertSource / removeSource / querySources / prepareSolve / solve / commitSolveState / sourceViewportRect / clear` — a two-phase solve (prepare → solve → commit) with a spatial source index.
- `source/IndexedQuadTreeCollisionSourceIndex` + `indexedquadtree/SparseIndexedQuadTreeStore` (+ `MercatorProjection`, `IndexedRect`, `CellIndex`) — the hit-source index is a **sparse quadtree in Mercator space**; queries are viewport-rect based.
- `layout/CollisionLayoutSolver(Impl)`, `CollisionLayoutResolver` (grouped compare-by-descending resolution), `FloatingPlacementScorer` with `FloatingPlacementScoreWeights` defaults (readable in full): `currentPositionScore=+50` (stickiness), `onScreen=+50`, `partiallyOnScreen=−55`, `offScreen=−125`, `equalPriorityCollision=−160`, `bestPossible = current+onScreen` — i.e. "stay put if you can, be on screen, never collide with an equal-priority peer" as an integer scoring function.
- `CollisionPlacementMode {FIXED, FLOAT}`; `OccupiedCollisionPlacement`, `CollisionAvoidable` (the Google-logo avoidable is a first-class case: `compose/internal/element/avoidable/GoogleLogoCollisionAvoidable.java` — even the attribution logo is a collision constraint).
- Compose-side runtime: `ComposeMarkerController/Descriptor/GeometrySnapshot/ResolvedPlacement/SlotViews`, `MarkerSlotSizePx`, `ComposeMarkerLayoutCoordinator` with a default collision engine.

**Callouts.** Callouts are view markers + tooltip views (§8/§9), not a native marker text: `title` deprecation above, tooltip corner system in `map_ui/tooltip`, and layout resources `callout_map_marker_view{,_v2}` etc. (deep dive §6). `MarkerUtils` / `MapMarkerRectUtils` exist at `sources/com/ubercab/android/map/` for shared geometry.

**Server marker contract.** `sources/com/uber/model/core/generated/types/maps/map_view/MapMarkerModel.java`: `id, coordinate(Point), location(Geolocation), clusterResolverId, collisionOptions, displayPriority, mapMarkerViewModel, visibleZoomRange(ZoomLevelRange{lowerBound,upperBound}), zIndex` — the server speaks the same concepts (priority, collision, zoom range) as the client API.

## 5. Polyline / route rendering + alpha divider (traveled vs remaining)

**The alpha divider is a first-class primitive.** `sources/com/ubercab/android/map/PolylineV2Update.java` is a partial-update object with:

- `alphaDividerPosition: Float` — a position along the polyline;
- `preDividerAlpha` / `postDividerAlpha` — alpha on each side (the classic "traveled part dimmed, remaining part bright");
- `alphaDividerPositionAnimationOptions: PolylineV2AnimationOptions` — the divider **animates** (startDelay, animationDuration, repeatDelay, shouldRepeat, easingFunction — `sources/com/ubercab/android/map/PolylineV2AnimationOptions.java`, easing default `Linear`);
- plus `colors`, `colorAnimationOptions`, `width`, `strokeWidth`, `zIndex`, `minZoom`, `maxZoom` (polylines also carry zoom ranges).

**Per-vertex coloring.** `PolylineV2Colors` = `{palette: PolylineV2ColorPalette, indexedColorSpans: List<PolylineV2IndexedColorSpan>}` where a span is `{index, rangeEnd}` (`PolylineV2IndexedColorSpan.java`) — color segments are addressed by vertex index, which is how the divider and traffic segments are drawn along the path.

**Server contract.** `sources/com/uber/model/core/generated/types/maps/map_view/MapPolylineModel.java`: `encodedPolyline` (encoded string!) + `encodingPrecision`, `tappable`, `zIndex`, `avoidableDisplayPriority`, `mapMarkerAvoidanceEnabled` (markers avoid the polyline in collision), and `mapPolylineViewModel` which is a union of `SolidPolylineViewModel | DottedPolylineViewModel | PulsePolylineViewModel` (`MapPolylineViewModel.java`). Route geometry crosses the wire encoded (polyline algorithm), not as raw coordinate lists.

**Route abstractions (rider feature layer).**

- `sources/com/uber/map_hub_common/model/Route.java` — `{points: List<UberLatLng>, isIndeterminate}` with lazy bounds; "indeterminate" is a real state (e.g. while a route is being computed, the arc/preview line is still drawn).
- `sources/com/uber/map_hub_common/route/RouteRenderer.java` — `render(route)` + `clear(boolean): Completable` (removal is async-observable).
- `RoutePresenterPlugin` (`route/RoutePresenterPlugin.java`) + `PluginFactory` selection in `sources/com/ubercab/map_hub/map_layer/route_line/simple/PolylinePresenterPluginFactory.java` and `ArcPresenterPluginFactory.java` — the route line picks its presenter per route shape via a plugin switch with a stable UUID (`d()` returns a fixed UUID string); the plugin's applicability check is readable (`f(route)` = "not indeterminate" → polyline; the arc presenter covers the indeterminate case by complement). Presenter internals are obfuscated (`route_line/a.java,b.java,c.java` — unreadable, honestly).
- `sources/com/ubercab/rider_map_common/map_utils/RouteStyleManager.java` with model `ru9/e.java`: route style = `{primaryColor, pulseColor, width, type, …}` with builder default alpha `1.0` — pulse coloring is part of the style, matching the server `PulsePolylineViewModel`.

**View-space rendering.** When a polyline must be an Android View (view-marker overlay), `sources/com/ubercab/android/map/ViewPolylineImplV2.java` + `ViewPolylineRendererV2.java` + `ViewPolylineLineRendererV2.java` + `ViewPolylinePatternRendererV2.java` draw it on Canvas; path shapes come from pluggable generators:

- `ViewPolylineLinearPathGenerator.java` — straight segments;
- `ViewPolylineQuadraticPathGenerator.java` — smooth quadratic Bézier through points: control point offset along the segment normal by `0.4 × distance` with sign orientation — the curved-route look;
- `ViewPolylinePathGenerator.java` is the shared interface.

Pattern polylines also exist natively (`UberPatternPolyline.java`, engine `PatternPolylineDrawable` per deep dive §3) and via `UMDFPolyline`/`UMDFPolylineAdapter` in the marker display framework. `PolylineViewV2` has its own gesture detector (`PolylineViewV2$gestureDetector$2$1.java`) — view polylines are tappable even off the GL layer.

## 6. Vehicle glide (car marker movement)

The glide system is small, readable, and completely decoupled from the renderer.

**Server contract.** `sources/com/uber/model/core/generated/rtapi/services/marketplacerider/VehiclePathPoint.java`: `{latitude, longitude, course, epoch: TimestampInMs, speed}` — the vehicle moves along a **time-stamped path**, not as a stream of "current position" pings.

**Presenter ports.** `sources/com/ubercab/map_ui/vehicle/VehiclePresenter.java`: `c(List<VehiclePathPoint>)` (set path), `g(List<MapLocation>)` (fallback path without timing), `pause()/show()`, `d(visible)`, `k(id, ...)`, plus `i(): Observable<Optional<UberLatLng>>` (position stream) and `h(): PointOfInterest`. `VehicleRenderer<T>` (`vehicle/adapter/VehicleRenderer.java`): create-POI-at-PathPoint / remove / move-to-PathPoint / update-float (`d(poi, f)` — e.g. progress/alpha).

**The loop.** `sources/com/ubercab/map_ui/vehicle/adapter/c.java` (obfuscated field names, logic readable):

- constructor picks the update loop by mode: `wu9.f.STATIC` → one-shot direct updates (`adapter/b.java`), otherwise an animation loop (`adapter/a.java`) = a `ValueAnimator(0→1, REPEAT_INFINITE)` that ticks the presenter every frame and **resumes rather than restarts** if already paused;
- `c(...)` converts server points to `PathPoint{latitude, longitude, course, epoch}` (`vehicle/adapter/model/PathPoint.java`) and swaps them into a **synchronized path buffer**;
- the loop tick (`xu9/b.java`, fully readable) is the glide algorithm: pop any point whose `epoch ≤ now`; compute `t = (now − lastEpoch) / (nextEpoch − lastEpoch)` clamped to ≤ 1; position = spherical interpolation between last and next point; **course is taken from the target point, not interpolated** (heading snaps forward while position glides); result stamped at `now`.
- The interpolation `v1c.a.d(from, to, t)` (`sources/v1c/a.java`) is **great-circle slerp** with a linear-lat/lng fallback when the endpoints are ~coincident; the same utility has initial-bearing (`Location.distanceBetween`), closest-point-on-segment (`b`), and closest-point-on-polyline (`e`) — snap-to-route helpers.
- The clock is injectable (`sources/r19/a.java` = epoch-seconds provider, held by `xu9/c.java` with an interval field) — the glide is deterministic under a fake clock, i.e. testable.
- `f(vehicleId)` starts the loop and additionally subscribes to `RxMapStream` camera changes (`scan`/`distinctUntilChanged`) so the vehicle POI re-syncs when the map moves — the car is anchored to the map, not the screen.

**Car marker model.** `sources/com/ubercab/android/map/CarMarkerModel.java`: `{position, heading, scale, scaleMode: SCREEN|WORLD, minZoom, maxZoom (default 0..21), type, bodyColor, url}` with `CarMarkerType` = `uberx | uberxl | ubercomfort | uberav | custom` each mapping to a 3-D `{modelName, materialName}` pair (`CarMarkerType.java` — model "Body", material "Body") — the car is a GLTF-style 3-D asset (engine flag `mapdisplay_flipr_enable_gltf_rendering`, deep dive §9), scaled in screen or world space, zoom-ranged. `CarMarker.update(CarMarkerModel)` is the whole mutation surface (`CarMarker.java`).

**Retargetable view animation.** `sources/com/ubercab/android/map/AnchorPointAnimator.java`: a `ValueAnimator` translating a view between anchors with `AccelerateDecelerateInterpolator`; `updateTargetTranslation` re-bases the start position from the current animated value — mid-flight retargeting without jumps (used by view markers gliding between anchors, e.g. tooltips that follow pins).

## 7. Location stack + freshness

**Sample model.** `sources/com/ubercab/android/location/UberLocation.java` (Rave-validated `@Validated`): `accuracy, altitude, verticalAccuracyMeters, bearing + hasBearing + bearingAccuracyDegrees, speed + speedAccuracyMetersPerSecond, time, elapsedRealtimeNanos, isMocked, probabilityIndoors + hasProbabilityIndoors, provider, uberLatLng`. Two clock fields (`time` + `elapsedRealtimeNanos`) exist precisely so freshness is computable both wall-clock and boot-clock; there is **no "stale" token anywhere** in the rider map code (grep for `stale|freshness|isFresh` in `com/ubercab/android` and `presidio` returned only substring false-positives) — age is derived from timestamps at point of use.

**Acquisition ports.** `sources/com/ubercab/android/location/service/LocationVendor.java` (acquisition) and `LocationCache.java` (last-known + `Observable<UberLocation>`), `LocationListener.java`. The homescreen exposes a high-accuracy fetcher plugin point (`HighAccuracyLocationFetcherPluginPoint`, facts §2); no Google fused-location API is used (facts §2).

**Privacy fuzzing.** `sources/com/ubercab/android/location/FuzzedLatLng.java`: random offset `r = sqrt(rand) × 0.0071877807726864335°` (≈ 800 m) in a random bearing, longitude-corrected by `1/cos(lat)` — uniform-in-area circular fuzzing for display of approximate locations.

**Puck (user-location marker).** `sources/com/ubercab/android/map/Puck.java` (extends `Annotation`): full style surface — `position, bearing, duration, trackingMode, zIndex`, circle (`radius, color, strokeColor, strokeWidth`), arrow (`radius, height, edgeColor, topColor`). Implementations: `UberPuckBase`, `GooglePuck`, `GoogleLegacyPuck`, `GooglePuckView`, `GooglePuckStyleState`; the own-engine puck is a native circle that tracks location (`addPuckCircle`, deep dive §12).

**Animated location.** `sources/com/ubercab/android/map/UserLocation.java`: `{position, heading, duration, easing(ControlPoints)}` — even the user's own location is *animated between fixes* with a chosen curve; a raw jump never happens.

**Compose location layer.** `sources/com/ubercab/android/map/compose/internal/element/location/`: `DeviceLocationView` (container), `DeviceLocationBlueDotView` (pulsing dot: 1500 ms shrink, 1500 ms grow, 1500 ms hold, repeat; animation cancelled on detach and on visibility loss — `onDetachedFromWindow`/`onVisibilityChanged`), `DeviceLocationAccuracyView` (accuracy halo), `DeviceLocationCompassHeadingView` (heading cone), all fed by `UserAnnotationDataSource/UserAnnotationState` + `LocationWithAccuracy{location, accuracyMeters}` (`compose/internal/LocationWithAccuracy.java`).

**Attribution.** `sources/com/ubercab/android/map/compose/location/AttributedLocation.java`: every displayed location carries `provider` — `"uber_places"` when `map.supportsAdvancedApis()` else `"google_places"` — with `AttributedData` asserting the provider string is non-empty. Legal attribution of *coordinates* is part of the data model, not an afterthought.

**Settings wiring.** `MapSettingsManager.f(Flow<UberLocation>)` (§3) is the single injection point of user location into a map surface; `com/ubercab/map_ui/optional/device_location/` is a detachable base layer (`DeviceLocationMapLayerBuilderImpl/Router/ScopeImpl` + `DeviceLocationConfigurationStream`), and `MapSettingsModel.userLocation` (§11) can switch it from the server.

## 8. Pickup pin mechanics + access points

**Pin as a component pair.** `sources/com/ubercab/map_ui/pin/PinPresenter.java` (show/hide/location/set-screen-point + several obfuscated state hooks) and `PinViewV2.java` — the "pin fixed to map center while the map moves under it" editor is a dedicated presenter, not ad-hoc screen code.

**Location editor API** (`sources/com/ubercab/location_editor_api/core/`): `LocationEditorListener` (method names obfuscated — honest; surface includes location-chosen callbacks taking `RequestLocation` + optional lists), `LocationEditorModeAndContext{mode, context}`, `MapStateTransitionStream` (two `Observable`s — map state transitions are a stream), `LocationEditorLocationManager`, `LocationEditorChromeManager`, `LocationEditorConfigurationStream`, plus plugins `AddressEntryPlugin{,V2}` and `GenericReverseGeocodeListener` — the editor owns reverse-geocoding its pin position.

**Pin anchoring streams.** `sources/com/uber/pudoanchoring/`: `AnchorLocationStream` (observe), `MutableAnchorLocationStream` (set per-key + broadcast to all keys + reset), `MutableDestinationLocationResolver` — pickup *and* destination anchors are shared mutable streams, so search, map pin, and confirmation UI all observe the same truth.

**Snapping to roads.** The engine answers "what road is this near":
- `sources/com/ubercab/android/map/NearestFeatureTypeOptions.java` → `NearestRoadOptions{excludedRoadClasses, excludedRoadUsages, searchDistanceMeters, shouldExcludeClosures}` (`RoadClass`/`RoadUsage` enums at `sources/com/ubercab/android/map/RoadClass.java`, `RoadUsage.java`).
- `sources/com/ubercab/android/map/HitTestOptions.java` → `RoadHitOptions{distanceThresholdMeters, includeClosures, roadClassExclusions}`.
- Bridges: `BaseMapQueryBridge`, `TileQueryBridge`, `TileQueryJniBridgeUtils` with results `MapQueryResult{Success|Failure{errorMessage, failureReason}}`, `MapQueryFailureReason`, `NearestMapFeatureData`, `MapFeatureData/Type`. The pin drop can therefore snap to the nearest *suitable* road (excluding e.g. highways/closures) as an engine query, not a client-side road-network hack.

**Geodesic hit-testing for elements.** `sources/com/ubercab/android/map/MapElementHitTester.java`: circle containment (haversine distance), polygon containment (`PolyUtil.containsLocation`, geodesic), polyline hit with a **16 dp** screen tolerance converted to meters via the current projection — touch targets on map geometry are resolution-correct.

**Access points (the "walk to this exact spot" vocabulary).** `sources/com/uber/maps/presentation/`:

- `AccessPointIntent.java`: `INVALID, PASSENGER_PICKUP, PASSENGER_DROPOFF, DELIVERY_DROPOFF, DELIVERY_PICKUP`.
- `AccessPointUsage.java`: passenger pickup/dropoff, `ENTRANCE, EXIT, PARKING, POSTAL, PACKAGE_PICKUP, PACKAGE_DELIVERY, FOOD_PICKUP, FOOD_DELIVERY` — one taxonomy serves rides and delivery.
- `AccessPointGroupOrBuilder.java` survives but the proto class itself failed to decompile (honesty note); a simpler generated `AccessPoint{lat, lng}` exists at `sources/com/uber/model/core/generated/guidance/model/generated/AccessPoint.java`.

**Pickup-cue UI on the trip map.** `sources/com/ubercab/trip_map_layers/pickup_tooltip/` (`PickupTooltipMapLayerInteractor/Router` + `anchor/MeetupLocationView.java` — a circular layered-drawable anchor of `ub__meetup_anchor_circle_size`, accessibility-suppressed), `meet_and_greet_callout/` (its own interactor/router), `destination_tooltip/`, `add_stop{,_icon}/` — each pickup affordance is its own map layer.

**Center-on-me.** `sources/com/ubercab/map_ui/core/centerme/CenterMePlugin.java` + `optional/centerme/` (plugin factory, scope, events stream, view) — the recenter button is a map plugin with its own view-anchor behavior (`CenterMeViewAnchor`, `CenterMeViewBehavior`).

## 9. ETA contract + pickup sub-states

**Vehicle path = ETA substrate.** The `VehiclePathPoint{lat, lng, course, epoch, speed}` contract (§6) makes ETA visual: the same epoch-stamped path that drives the glide also encodes when the car will be where — the client never receives "ETA seconds" for the car animation; it receives space-time.

**Trip state machine (server contract).** `sources/com/uber/model/core/generated/rtapi/services/marketplacerider/`:

- `AutonomousTripStateType.java`: `PULLOVER, PICKUP, VIA, DROPOFF` (+ `UNKNOWN` fallback — every enum is `@EnumFallback("UNKNOWN")`, i.e. forward-compatible);
- `AutonomousTripSubstate` is a sealed wrapper (`PickupWrapper/DropoffWrapper/ViaWrapper/PulloverWrapper`) over four per-state enums:
  - Pickup (`AutonomousTripSubstatePickup.java`): `ENROUTE → ARRIVING_SOON → ARRIVED → START_RIDE_READY`;
  - Dropoff / Via (`AutonomousTripSubstateDropoff.java`, `...Via.java`): `ON_TRIP, ARRIVED`;
  - Pullover (`AutonomousTripSubstatePullover.java`): `PULLOVER_REQUESTED → PULLING_OVER → PULLED_OVER`.

**Walking ETA display contract.** String resources in `sources/com/ubercab/R.java` bucket walking ETAs: `trip_widget_walking_eta_text`, `..._one_minute`, `..._less_than_threshold_text`, `..._greater_than_threshold_text` (plus venue/wayfinding/HCV variants and `map_exp_walking_eta_in_minutes`); `sources/com/uber/waypointads/ui/models/WalkingETA.java` formats "<1 min" and "N min". The contract is *bucketed display text* (one-minute special case + below/above threshold), not raw seconds. A `WALKING_PICKUP` camera flavor exists (§3) and `WalkingEtaBindingResolverWorkerPluginFactory` binds walking-ETA into venue screens.

**ETA tooltip.** `sources/com/ubercab/map_ui/tooltip/core/EtaTooltipView.java` (extends `TooltipView`) — ETA-on-map is a tooltip annotation; `TooltipView` anchors to one of 4 corners (`TOP_LEFT, TOP_RIGHT, BOTTOM_RIGHT, BOTTOM_LEFT`) with corner-specific backgrounds; specialized variants: `CaretTooltipView`, `ForwardDispatchTooltipView`, `HcvWalkingTooltipView`, `RiderLocationTooltipView` (`tooltip/optional/`). Core tooltip companions: `PointOfInterest`, `RouteOfInterest` — tooltips attach to POIs *or routes*.

**AV pickup refinement.** `com/uber/ePUDO/core/EPUDOProvider.java` + `AutonomousPickupLocationWalkingEffort` (same generated package) — "enhanced PUDO" models pickup locations with walking-effort metadata; `AvPudoRefinementWalkingMapWorkerBuilderPlugin` wires it into walking maps.

## 10. Gesture set

`sources/com/ubercab/android/map/MapGestureDetector.java` (fully readable) composes four detectors — platform `GestureDetector`, `ScaleGestureDetector`, plus open-source `com.almeros.android.multitouch.gesturedetectors.RotateGestureDetector` and `ShoveGestureDetector`:

| Gesture | Detection detail |
| --- | --- |
| Single tap | `onSingleTapConfirmed` (waits out double-tap window) |
| Double tap | Zoom-in **only if the finger didn't move** during the second tap (`hasMoved` gate) |
| Two-finger tap | Zoom-out: tracked via `isTwoTap` when a second pointer lands; fires on quick release when no rotate/scale in progress |
| Long press | Enabled explicitly (`setIsLongpressEnabled(true)`) |
| Pan/scroll | Scroll listener, inverted deltas |
| Fling | Velocity × 0.25 damped, magnitude `/625` → a decelerating `onScroll(dx, dy, durationMs)` momentum glide |
| Pinch zoom | Quick-scale enabled; requires accumulated factor outside `0.95–1.05` to start (dead zone against jitter) |
| Rotate | Requires total angle > 5° (10° when tilt gestures are enabled) to start; both rotate and shove share the two-pointer stream with a pointer-span ratio gate (`e/f > 0.67`) |
| Shove (two-finger vertical) | Tilt: requires total vertical delta > ±5 px to start; tilt delta = −Δ × 0.1 |

**Arbitration.** Mutual exclusion by running flags (`isScaleGestureRunning`, `isRotateGestureRunning`, `isTiltGestureRunning`): scroll is suppressed while any multi-finger gesture runs; rotate yields to scale; shove yields to both; all starts additionally gated by `ViewConfiguration.getTapTimeout()`. Focal-point-center mode (`isFocalPointCenterEnabled`) transforms events to the map center and suppresses scroll during scale/rotate.

**Configuration surface.** `sources/com/ubercab/android/map/UiSettings.java`: `is/set{Scroll,Zoom,Rotate,Tilt}GesturesEnabled`, `setAllGesturesEnabled`, `is/setFocalPointCenterEnabled` — per-map gesture switches. Compose mirror: `sources/com/ubercab/android/map/compose/MapInteractionSettings.java` `{panEnabled, zoomEnabled, rotateEnabled, tiltEnabled, focalPointCenterEnabled}` (defaults: pan+zoom on, rest off) with an `ALL_DISABLED` constant. The **server can set all four** via `MapUserInteractionSettings{allowsScrollGestures, allowsZoomGestures, allowsRotateGestures, allowsTiltGestures}` (§11).

**Non-interactive maps.** `sources/com/ubercab/rx_map/core/UntouchableMapView.java` — a `MapView` subclass whose `dispatchTouchEvent` swallows everything (`return true`) while an internal channel `f()` replays events to a listener: background/mini maps render but never steal gestures. `MapMotionEventsAnalyticsManager` (`rx_map/core/`) tracks motion events for analytics; view-marker taps have their own arbitration in `ViewMarkerContainer` (§4).

## 11. Per-trip-stage map states

**Map surface = recipe.** `sources/com/uber/map_hub_common/MapConfiguration.java`: a map surface is `{List<MapLayerBuilder>, CameraManagerWorker}` — layers + a named camera flavor. Concrete recipes:

- `sources/com/ubercab/map_hub/configuration/regular/ConfirmationMapConfiguration.java`: confirmation-stage map = **waypoints layer + route-line layer + confirmation-hint layer** (`WaypointsMapLayerBuilderImpl`, `RouteLineMapLayerBuilderImpl`, `ConfirmationHintMapLayerBuilderImpl`) + `ConfirmationCameraManagerWorker` (class absent from this jadx output — honesty note);
- `sources/com/ubercab/map_hub/configuration/reserve/ReserveConfirmationMapConfiguration.java` — a second recipe for reservations;
- `sources/com/ubercab/rider_map_common/core/MapHubBuilder.java`, `MapLayerBuilder.java`, `MapViewBuilder.java` + `map_hub/MapHubRouter.java` — a persistent "map hub" the recipes attach to (one long-lived map across the flow instead of per-screen maps).

**Stage layers as separate RIBs.** `sources/com/ubercab/trip_map_layers/`: `route/`, `add_stop/`, `add_stop_icon/`, `destination_tooltip/`, `directed_dispatch/`, `meet_and_greet_callout/`, `pickup_tooltip/`, `vehicle/TripMapVehicleMapLayerScope(+Interactor)` + `model/{TripPoint, ForwardDispatchTripPoint}` + `observability/TripMapLayerObservabilityRouter` — each trip sub-state contributes its own attachable layer with its own observability. Request-stage layers live in `sources/com/ubercab/map_hub/map_layer/`: `route_line/` (+`simple/` presenters), `waypoints/` (`WaypointsPresenter`), `hint/` (confirmation hint), `tooltip/local_cab/`, plus `base_map_layer/nearby_vehicles/` (pre-request supply view, `VehicleKey` model) and `base_map_layer/device_location/`. `map_controls/route_toggle/hcv/HCVRouteToggleMapControlPluginFactory` is a map control layer for route toggling.

**Server-driven map document.** `sources/com/uber/model/core/generated/types/maps/map_view/`:

- `MapModel.java` = `{mapCamera: MapCameraModel, mapIdentifier, mapLayers: ImmutableList<MapLayerModel>, mapSettings: MapSettingsModel, targetMapsIdlVersion}` — the server may deliver **camera + layers + settings in one versioned document**;
- `MapLayerModel.java` (marked `@Deprecated` in this build) = `{id, mapIdentifier, mapMarkers, mapPolylines, mapPolygons, mapCircles, mapArcedlines, clusterResolvers, mapThemes: Map<ColorId, ColorScheme>}` — note **arced lines** and **marker cluster resolvers** as server concepts;
- `MapSettingsModel.java` = `{mapIdentifier, userInteractionSettings, userLocation}`;
- applied per scope via `MapModelManager.a(MapModel, ScopeProvider)` (§3) — a map state arrives, is diffed against the live map, and lives exactly as long as the scope.

**Map type / styles.** `sources/com/ubercab/android/map/MapType.java`, `MapStyleOptions`, `FeatureOverrides{…}` with `addStyleClass/hasStyleClass/getStyleClasses` runtime restyling (deep dive §6), `setTrafficAreasEnabled`, `setClosuresEnabled` (§3) — stage changes restyle the same map (traffic/closures/night mode) rather than rebuilding it.

## 12. Performance techniques

| Technique | Evidence |
| --- | --- |
| Frame pacing with coalescing | `sources/com/ubercab/android/map/HandlerRenderRequester.java`: handler-based render loop — `onInvalidate` posts at most one frame (`pendingFrame` flag), fps cap via `setFramesPerSecond` (`1000/fps` interval, min 1), explicit `onPause/onResume` stop/start; enabled per view via `MapViewAdapter.setHandlerBasedRenderingEnabled` + `setTargetDisplayRefreshRate`. |
| Frame-rate tiers | `sources/com/ubercab/android/map/PreferredFrameRate.java`: `DEFAULT, VERY_LOW, LOW, FIVE, FIFTEEN, THIRTY` — maps render at deliberately reduced rates in quiet states. |
| Live-map counting / leak detection | `ActiveMapCounter` (§1): peak concurrent maps per provider reported above threshold. |
| Zoom-range culling on every annotation | `MarkerOptions.minZoom/maxZoom` (§4), `CarMarkerModel.minZoom/maxZoom` (§6), `PolylineV2Update.minZoom/maxZoom` (§5), server `visibleZoomRange` (§4) — the engine skips off-range elements without per-frame checks. |
| Spatial index for collision/hit queries | `collision/source/indexedquadtree/SparseIndexedQuadTreeStore` + `IndexedQuadTreeCollisionSourceIndex` (§4) — sparse quadtree in Mercator space; the native side mirrors it (`SparseIndexedQuadTreeStore` in engine, deep dive §4). |
| Disk cache for tiles/styles | `sources/com/ubercab/android/map/DiskCacheClient{,Bridge,SyncStorageImpl}.java` (async load/save/remove/clear); engine-side caches parameterized: overlay cache 24, tile-query cache 131072, overscale cache reuse, 10 MiB frame allocator (deep dive §9). |
| Bitmap management | `sources/com/ubercab/android/map/UberBitmapManager.java` + `UberBitmap` + `BitmapDescriptor(Factory)` — descriptor-based icons allow pooling; `PendingMove` recycling frees cube-face bitmaps before surface creation (deep dive §12). |
| Animation lifecycle discipline | Blue-dot animation canceled on detach/invisibility (§7); `HandlerRenderRequester` cancels on pause; vehicle loop resumes instead of restarting (§6). |
| Stickiness as rendering policy | Collision scorer's `currentPositionScore=+50` (§4) keeps annotations in place across frames — no layout thrash while camera moves. |
| One map across screens | `MapHubBuilder`/`MapHubRouter` persistent hub (§11) — map instances are not created/destroyed per screen; `UntouchableMapView` serves non-interactive embeds. |
| Server-side geometry precomputation | Encoded polylines + arc lines + cluster resolvers over the wire (§11); offline country outlines shipped as assets (deep dive §8). |
| Threading | `MainThread` annotation + `MainThreadDelegate` (`sources/com/ubercab/android/map/MainThread{,Delegate}.java`); native engine runs its own libuv loop with TileWorkers (deep dive §3); `NetworkCoroutineKt` for suspending fetches. |
| Low-memory hooks | `MapViewAdapter.onLowMemory()` forwarded to both backends + `clearTileOverlayCache` (§3, deep dive §6). |

## 13. Native engine layer (context from the companion docs, for completeness)

The own engine (`libubermaps-gl.so`, `msd::` 4,926 symbols) implements: style documents (Mapbox-format parser), vector/raster tile pipelines with disk-cached providers, bucketed draw passes (label/line/fill/circle/marker/raster), label/marker collision solving, glyph/sprite/line atlases, pattern polylines, Clipper polygon ops, geojsonvt slicing, Earcut triangulation; `libvendor-mapdisplay.so` bridges network/disk/experiments/analytics to Java and decodes images. `libh3.so` provides hex spatial indexing (`com.uber.h3.NativeMethods`). Camera math is Web Mercator, 512-px tiles, ±85.05112878° clamp, WGS-84 sphere (deep dive §3/§5). Full symbol censuses: deep dive §3, facts §1/§8.

---

## What a small courier app should adopt vs skip

Context: Fastship already renders with MapLibre on web/Android and Apple on iOS, with Google as a gated build capability (facts §7). Port **shapes**, not scale.

### Adopt (high value / low cost at courier scale)

1. **Provider abstraction as a *type*, not two engines** — a `MapFactory` returning a view-adapter with a lifecycle contract (`MapViewAdapter` shape), one enum, one serializable `{initial, fallbacks, missingDefault}` config. Cost: a few interfaces. Lets Fastship add a second renderer without touching feature code.
2. **Camera intents** (`CameraUpdate`-style value objects + a factory incl. `newLatLngBoundsWithMaxZoom`) instead of imperative camera calls — makes camera behavior testable and server-drivable later.
3. **Camera rules + one exclusive camera controller** — features register "these coords must stay visible"; an aggregator merges them; exclusive control is a disposable token tied to screen scope. This single pattern solves "driver marker vs pickup vs destination framing" fights.
4. **The padding model** — `EdgePadding + List<CornerPadding>` aggregated from UI chrome into the camera environment (bottom sheet declares insets; map reacts). Directly fixes bottom-sheet-overlapping-marker bugs.
5. **Epoch-stamped vehicle paths + slerp glide** — server sends `[{lat,lng,course,epoch,speed}]`; client interpolates by wall-clock with heading-snap. Eliminates both stutter and overshoot; trivially testable with a fake clock.
6. **Alpha divider as a polyline primitive** — traveled-vs-remaining as `{dividerPosition, preAlpha, postAlpha}` with its own animation options. MapLibre supports gradient/line-progress equivalents; the *contract* is the port.
7. **Per-stage layer recipes** — map surface = `{layers, camera flavor}`; every trip stage (confirm, enroute-to-pickup, on-trip, arrived) contributes attachable layers with scope-bound lifetimes.
8. **Trip state/substate enums with `UNKNOWN` fallback** — `PICKUP{ENROUTE, ARRIVING_SOON, ARRIVED}`-style machine, forward-compatible wire enums.
9. **Bucketed ETA display contract** — "one minute / below threshold / above threshold" strings decided by one place.
10. **Zoom-range visibility on every annotation** — one field on markers/cars/polylines kills most "too crowded" bugs.
11. **Pin-to-road snapping via nearest-feature query** with road-class exclusions (never place a pickup on a highway/closure) + geodesic hit-testing with dp tolerance.
12. **Location sample richness** — keep `accuracy, bearing(+accuracy), speed(+accuracy), elapsedRealtimeNanos, isMocked` on every fix; derive freshness from timestamps; fuzz locations when approximate display is acceptable.
13. **Gesture set with arbitration + per-map switches** — the dead zones (±5% scale, 5–10° rotate, ±5 px shove) and running-flag mutex are directly portable; per-surface `MapInteractionSettings` and a `ALL_DISABLED` for background maps.
14. **Frame pacing + map counting** — pause rendering on background, fps tiers, and a "how many live maps" counter with a peak alert (leak detector) — cheap insurance in a courier app with embedded mini-maps.
15. **Server-driven gesture flags + settings model** — `{allowsScroll, allowsZoom, allowsRotate, allowsTilt}` per trip stage from the backend.
16. **Attribution-aware locations** — carry the data provider on displayed locations.

### Skip (Uber-scale costs without courier-scale payoff)

1. **Owning a GL tile engine** — MapLibre already provides the tile/bucket/collision pipeline; Uber's engine is a decade of platform investment (facts §1, deep dive §3).
2. **Runtime two-engine fallback** — a build-time capability table (Fastship's existing `selectRenderer`) is enough; `didFallback` telemetry matters only with two live engines.
3. **Full quadtree collision solver with floating placements + scoring weights** — at courier scale (< ~10 simultaneous annotations) fixed zIndex + `displayPriority` + a simple overlap check suffices; keep the 8-way floating-placement *concept* for pickup callouts only if they collide.
4. **3-D GLTF car models with per-product materials** — a rotated flat marker (or simple 3-D where MapLibre offers it) is fine; heading + screen/world scale *are* worth keeping.
5. **Cube-face satellite/spatial imagery + street view integration** — large subsystems with their own renderers; out of scope for courier tracking.
6. **Server style documents + `MapLayerModel` full document** — adopt the *settings/gesture* slice only; the whole server map layer feed is an SDUI platform play.
7. **AV substates (`PULLOVER`, `VIA`) and walking-effort ePUDO models** — keep the pickup/dropoff substates; pullover/via are AV-specific.
8. **Marker clustering infrastructure (`mmdf`, `MarkerClusterResolver`)** — courier maps have few supply markers; revisit if vehicle supply display ever becomes a feature.
9. **Keyframe `CameraUpdateTimeline` with per-property tracks** — a duration + easing curve covers 95% of needs; add keyframes only if route-follow choreography becomes a product requirement.
10. **Waypoint ads, UGC report layers, venues/wayfinding layers** — verticals Uber monetizes that a courier app doesn't need.

---

## Capability checklist (one line each)

- Provider enum + factory + `{initial, fallbacks, missingDefault}` config — `sources/com/ubercab/android/map/compose/internal/{MapProvider,MapFactory,MapProviderConfigurationModel,MapProviderState}.java`
- Provider switch analytics (`providerUsed`, `didFallback`) — `sources/com/ubercab/android/map/compose/internal/MapProviderState.java`
- Map constructed from injected `{parameters, network, storage, analytics, assert}` — `sources/com/ubercab/android/map/compose/MapDependencies.java`
- View lifecycle adapter contract incl. low-memory + state save — `sources/com/ubercab/android/map/MapViewAdapter.java`
- Server-delivered style URL with shipped default — `sources/com/ubercab/android/map/compose/internal/MapFactory.java:41`
- Live-map counter with peak alert per provider — `sources/com/ubercab/android/map/ActiveMapCounter.java`
- Camera position `{target, zoom, tilt, bearing, offset}` — `sources/com/ubercab/android/map/CameraPosition.java`
- Camera intents union (11 types incl. bounds-with-max-zoom) — `sources/com/ubercab/android/map/CameraUpdate.java`
- Camera intent factory with argument validation — `sources/com/ubercab/android/map/CameraUpdateFactory.java`
- Keyframe camera timeline (per-property start/duration/easing) — `sources/com/ubercab/android/map/CameraUpdateTimeline.java`
- Duration presets `DEFAULT(300ms)` / `INSTANT` — `sources/com/ubercab/android/map/camera/CameraTimeline.java`
- Cubic-Bézier easing presets (Linear, EaseInOut) — `sources/com/ubercab/android/map/EasingFunction.java`
- Semantic zoom ladder (WORLD 0 … ANTS 22) + custom — `sources/com/ubercab/android/map/camera/calculating/SemanticZoom.java`
- Zoom clamps expressed as semantic ranges — `sources/com/ubercab/android/map/camera/calculating/ZoomClamp.java`
- Framing presets `MAXIMIZED/COMFORTABLE/WIDE` — `sources/com/ubercab/android/map/camera/calculating/SemanticZoomLayout.java`
- Declarative "frame these points" (`AutoPositionAndZoom`) — `sources/com/ubercab/android/map/camera/calculating/AutoPositionAndZoom.java`
- Pure-function camera updaters (make-visible, concat, vertical-offset-ratio) — `sources/com/ubercab/android/map/camera/updates/*.java`
- Off-screen projection factory for hypothetical-camera math — `sources/com/ubercab/android/map/camera/calculations/DefaultOffScreenMapProjectionFactory.java`
- Camera rules = "coords that must stay visible" sets — `sources/com/uber/mapdisplay_framework/camera/CameraRule.java`
- Camera director: rule aggregation, exclusive disposable control, update serialization, debug log — `sources/com/uber/mapdisplay_framework/camera/{MapCameraDirector,b}.java`
- Per-screen camera flavors (CONFIRMATION, ROUTE_LINE, WALKING_PICKUP, NO_OP, …) — `sources/com/ubercab/rider_map_common/map_hub/CameraManagerWorker.java`
- Compose camera state with isMoving / gesture-origin flag / auto-follow provider — `sources/com/ubercab/android/map/compose/camera/MapCameraState.java`
- Padding model: edge + anchored corner rects — `sources/com/ubercab/android/map/padding/{EdgePadding,CornerPadding,MapPaddingInsets}.java`
- Chrome-declared padding sources + CoordinatorLayout aggregator — `sources/com/ubercab/rx_map/core/{MapPaddingSource,MapPaddingCornersSource,MapPaddingManager}.java`
- Padding flows into camera environment (single source of truth) — `sources/com/ubercab/android/map/camera/CameraUpdaterMapIntegration.java`
- Marker options with zoom range + anchor + alpha + rotation — `sources/com/ubercab/android/map/MarkerOptions.java`
- View markers with optional collision participation — `sources/com/ubercab/android/map/ViewMarkerOptions.java`
- View marker container: priority z-order + 48 dp min touch target + tap arbitration — `sources/com/ubercab/android/map/ViewMarkerContainer.java`
- Layer contract: elements + visibility + lifecycle + tag + log — `sources/com/uber/mapdisplay_framework/UnifiedMapLayer.java`
- Exclusive layer type (one modal layer per tag) — `sources/com/uber/mapdisplay_framework/ExclusiveUnifiedMapLayer.java`
- Map surface façade: director + settings + layer manager + projection — `sources/com/uber/mapdisplay_framework/MapManager.java`
- Server-driven settings application + user-location flow injection — `sources/com/uber/mapdisplay_framework/MapSettingsManager.java`
- Server map document applied per scope — `sources/com/uber/mapdisplay_framework/MapModelManager.java`
- Marker display priority ladder (Low/Medium/High/AlwaysDisplay) — `sources/com/ubercab/android/map/compose/element/MarkerDisplayPriority.java`
- Collision strategy `Fixed | Floating(8-way placements)` — `sources/com/ubercab/android/map/compose/element/{CollisionStrategy,MarkerFloatingPlacement}.java`
- Collision solve with stickiness scoring (+50 stay, −125 offscreen, −160 collide) — `sources/com/ubercab/android/map/collision/layout/FloatingPlacementScoreWeights.java`
- Sparse quadtree collision source index (Mercator space) — `sources/com/ubercab/android/map/collision/source/indexedquadtree/SparseIndexedQuadTreeStore.java`
- Attribution logo as collision constraint — `sources/com/ubercab/android/map/compose/internal/element/avoidable/GoogleLogoCollisionAvoidable.java`
- Server marker contract (priority, collision, zoom range, cluster resolver) — `sources/com/uber/model/core/generated/types/maps/map_view/MapMarkerModel.java`
- Alpha-divider polyline primitive (traveled vs remaining) with animation options — `sources/com/ubercab/android/map/PolylineV2Update.java`
- Per-vertex indexed color spans + palette — `sources/com/ubercab/android/map/PolylineV2{Colors,IndexedColorSpan}.java`
- Polyline animation options (delay/duration/repeat/easing) — `sources/com/ubercab/android/map/PolylineV2AnimationOptions.java`
- Server polyline contract (encoded, tappable, dotted/pulse/solid, marker-avoidance) — `sources/com/uber/model/core/generated/types/maps/map_view/MapPolylineModel.java`
- Route model with "indeterminate" state + async renderer — `sources/com/uber/map_hub_common/{model/Route,route/RouteRenderer}.java`
- Route presenter plugin selection (polyline vs arc) by route shape — `sources/com/ubercab/map_hub/map_layer/route_line/simple/{Polyline,Arc}PresenterPluginFactory.java`
- Route style = primary + pulse colors, width, type — `sources/com/ubercab/rider_map_common/map_utils/RouteStyleManager.java` (+ `ru9/e.java`)
- Curved route drawing (quadratic path generator, 0.4×normal offsets) — `sources/com/ubercab/android/map/ViewPolylineQuadraticPathGenerator.java`
- Tappable view-space polylines with own gesture detector — `sources/com/ubercab/android/map/PolylineViewV2.java`
- Epoch-stamped vehicle path wire contract (course + speed) — `sources/com/uber/model/core/generated/rtapi/services/marketplacerider/VehiclePathPoint.java`
- Vehicle glide: synchronized path buffer + time-fraction slerp + heading snap — `sources/xu9/b.java` (+ `sources/com/ubercab/map_ui/vehicle/adapter/c.java`)
- Great-circle position interpolation utility — `sources/v1c/a.java`
- Vehicle render loop: infinite ValueAnimator vs one-shot STATIC mode, resume-not-restart — `sources/com/ubercab/map_ui/vehicle/adapter/{a,b}.java`
- Vehicle presenter ports (path in, position stream out, pause/show) — `sources/com/ubercab/map_ui/vehicle/VehiclePresenter.java`
- Car marker as zoom-ranged 3-D model (type → model+material, screen/world scale) — `sources/com/ubercab/android/map/{CarMarkerModel,CarMarkerType,CarMarkerScaleMode}.java`
- Mid-flight retargetable view anchor animation — `sources/com/ubercab/android/map/AnchorPointAnimator.java`
- Rich location sample (accuracy/bearing/speed accuracies, elapsedRealtime, isMocked, indoor probability) — `sources/com/ubercab/android/location/UberLocation.java`
- Acquisition + last-known ports — `sources/com/ubercab/android/location/service/{LocationVendor,LocationCache}.java`
- Privacy circular fuzzing of displayed locations — `sources/com/ubercab/android/location/FuzzedLatLng.java`
- Animated user location (position + heading + duration + easing) — `sources/com/ubercab/android/map/UserLocation.java`
- Full-style puck (circle + arrow, tracking mode, bearing) — `sources/com/ubercab/android/map/Puck.java`
- Pulsing blue dot with visibility-gated animation + accuracy + compass views — `sources/com/ubercab/android/map/compose/internal/element/location/DeviceLocation{BlueDotView,AccuracyView,CompassHeadingView}.java`
- Provider-attributed locations (uber_places vs google_places) — `sources/com/ubercab/android/map/compose/location/AttributedLocation.java`
- Center-pin editor presenter pair — `sources/com/ubercab/map_ui/pin/{PinPresenter,PinViewV2}.java`
- Location-editor API with mode/context + map state transition streams — `sources/com/ubercab/location_editor_api/core/*.java`
- Mutable pickup/destination anchor streams — `sources/com/uber/pudoanchoring/{MutableAnchorLocationStream,MutableDestinationLocationResolver}.java`
- Nearest-road query with class/usage/closure exclusions — `sources/com/ubercab/android/map/NearestFeatureTypeOptions.java`
- Road hit options (threshold, closures, class exclusions) — `sources/com/ubercab/android/map/HitTestOptions.java`
- Geodesic element hit-testing with dp→meters tolerance — `sources/com/ubercab/android/map/MapElementHitTester.java`
- Access point intents (passenger/delivery pickup+dropoff) — `sources/com/uber/maps/presentation/AccessPointIntent.java`
- Access point usage taxonomy (entrance/exit/parking/postal/package/food) — `sources/com/uber/maps/presentation/AccessPointUsage.java`
- Meetup anchor ("meet me here") view — `sources/com/ubercab/trip_map_layers/pickup_tooltip/anchor/MeetupLocationView.java`
- Center-on-me plugin with view anchor/behavior — `sources/com/ubercab/map_ui/core/centerme/CenterMePlugin.java`
- Trip state types PICKUP/VIA/DROPOFF/PULLOVER with UNKNOWN fallback — `sources/com/uber/model/core/generated/rtapi/services/marketplacerider/AutonomousTripStateType.java`
- Pickup sub-states ENROUTE → ARRIVING_SOON → ARRIVED → START_RIDE_READY — `sources/com/uber/model/core/generated/rtapi/services/marketplacerider/AutonomousTripSubstatePickup.java`
- Dropoff/Via sub-states ON_TRIP/ARRIVED; Pullover chain — same package, `AutonomousTripSubstate{Dropoff,Via,Pullover}.java`
- Bucketed walking-ETA display strings (<1 min / threshold / N min) — `sources/com/ubercab/R.java` (string ids), `sources/com/uber/waypointads/ui/models/WalkingETA.java`
- ETA-on-map tooltip anchored to 4 corners (+ POI/route-of-interest targets) — `sources/com/ubercab/map_ui/tooltip/core/{TooltipView,EtaTooltipView}.java`
- Gesture set: tap/double-tap/two-finger-tap/long-press/pan/fling/pinch/rotate/shove with dead zones + mutex — `sources/com/ubercab/android/map/MapGestureDetector.java`
- Per-map gesture switches + all-off + focal-point-center mode — `sources/com/ubercab/android/map/UiSettings.java`, `sources/com/ubercab/android/map/compose/MapInteractionSettings.java`
- Non-interactive embedded map (touch-swallowing view) — `sources/com/ubercab/rx_map/core/UntouchableMapView.java`
- Server-set gesture permissions per map — `sources/com/uber/model/core/generated/types/maps/map_view/MapUserInteractionSettings.java`
- Map surface = recipe of layers + camera flavor — `sources/com/uber/map_hub_common/MapConfiguration.java`
- Stage recipes: confirmation = waypoints + route line + hint (+reserve variant) — `sources/com/ubercab/map_hub/configuration/{regular,reserve}/*.java`
- Per-stage trip layers as separate scoped RIBs (route/add-stop/tooltips/vehicle/observability) — `sources/com/ubercab/trip_map_layers/**`
- Pre-request layers: nearby vehicles, device location base layer, local-cab tooltip — `sources/com/ubercab/map_hub/{base_map_layer,map_layer}/**`
- Persistent map hub across screens — `sources/com/ubercab/rider_map_common/{core/MapHubBuilder,map_hub/MapHubRouter}.java`
- Server map document: camera + layers + settings + IDL version — `sources/com/uber/model/core/generated/types/maps/map_view/MapModel.java`
- Handler-based render loop with frame coalescing + fps cap + pause — `sources/com/ubercab/android/map/HandlerRenderRequester.java`
- Frame-rate tiers (VERY_LOW … THIRTY) — `sources/com/ubercab/android/map/PreferredFrameRate.java`
- Async disk cache port for tiles/resources — `sources/com/ubercab/android/map/DiskCacheClient.java`
- Main-thread enforcement markers — `sources/com/ubercab/android/map/MainThread{,Delegate}.java`
- Native engine context (own GL pipeline, H3 indexing, Web-Mercator camera math) — `KNOWLEDGE-2026-11-01-uber-app-maps-deep-dive.md` §3/§5, `KNOWLEDGE-2026-10-31-uber-app-maps-and-location-facts.md` §1/§3
