# BUILD SPEC — Fastship Map (Uber polish patterns)

**Date:** 2026-11-02 · **Source:** read-only static analysis of `rea-full` (authorized competitive-architecture study) · **Goal:** pattern specs for Fastship's own react-native-maps build, not Uber's code.

**Legend:** `[OBS]` observed in a file · `[INF]` inference from structure · `[UNK]` unknown / could not confirm · `SKIP` requires Uber's proprietary map engine.

Prior inventories (`KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md`, `REVIEW-2026-11-02-map-ux-vs-uber.md`) list *what* exists; this doc goes deeper on *geometry + behavior* — the dp values, the layering model, the camera-intent shape.

---

## 1. CAMERA MODEL

**Pattern: camera as an intent object, not absolute setState.** Uber does not scatter `setZoom`/`setCenter`; it builds an immutable `CameraPosition` and hands it to a pluggable updater.

`[OBS]` `sources/com/ubercab/android/map/camera/CameraPosition.java` — the position is a value type:
- fields: `coordinate`, `zoom` (double), `tilt` (`CameraAngle`), `heading` (`CameraHeading`), `verticalOffsetRatio` (double, **default 0.0**).
- Note the **`verticalOffsetRatio`**: the camera target can be pushed off-centre by a *fraction of the viewport*, which is exactly how you keep a driver/car centred above a bottom sheet *without* changing zoom.

`[OBS]` `sources/com/ubercab/android/map/camera/updates/CameraPositionUpdater.java` — a single-method interface `apply(current, environment) → next`. Camera moves are *functions*, composed (see `ConcatenatedCameraPositionUpdater.java`, `CameraPositionUpdater_AutoPositionKt.java`, `_ZoomKt`, `_OrientationKt`, `_CameraUpdateKt`). `[INF]` This is the "intent-based" model: the app declares *"make these bounds visible"* or *"follow this point"*, and the updater resolves it against the current `CameraEnvironment` (viewport size, padding).

`[OBS]` `sources/com/ubercab/android/map/camera/updates/MakeVisibleCameraPositionUpdater(.java/Kt)` — a dedicated "fit this geometry" intent.

**Padding-from-chrome.** `[OBS]` `AutoValue_CameraUpdate` / `C$AutoValue_CameraUpdate` carry an explicit `padding` (int) plus `width`/`height` and `xPixels`/`yPixels`. `[INF]` Fit-bounds takes a pixel padding so the fitted region clears the bottom sheet and header. The dp *value* of that padding is **not** a compile-time constant — it is computed at runtime from the visible sheet height. `[UNK]` exact dp.

**Animation duration / easing for camera moves.** `[UNK]` No camera-move duration constant appears in the decompiled resources; camera animation timing lives inside the proprietary map renderer. `SKIP` (engine-internal). What *is* visible: `EasingFunction` enum exists and defaults to **`Linear`** (`PolylineV2AnimationOptions.builder()` … `easingFunction(EasingFunction.Linear)`).

### Fastship spec — camera
```ts
// One intent type, not scattered setState. Single source of truth.
type CameraIntent =
  | { kind: 'follow'; target: LatLng; zoom: number; offsetRatio?: number } // offsetRatio pushes target up off-centre
  | { kind: 'fitBounds'; bounds: LatLngBounds; paddingPx: EdgePadding }      // paddingPx computed from live sheet height
  | { kind: 'free' };                                                        // user is dragging

// Bottom-sheet aware viewport:
// paddingPx.bottom = sheetSnapHeight + RECENTER_CLEARANCE
// Recompute on every sheet snap change, then re-issue the active intent.
```
- Keep `offsetRatio` (default `0`) so "follow driver" keeps the car ~⅓ up from the bottom-sheet top edge instead of dead-centre.
- **Never** hardcode fit padding; derive from measured sheet + header height each render.
- react-native-maps: `fitToCoordinates(coords, { edgePadding, animated: true })`; `animateToRegion` for follow. Easing is engine-controlled → accept default (do not fake it). `SKIP` custom camera easing.

---

## 2. MARKER / PIN COMPOSITION SPEC

**Anatomy: a pin = callout (pill) + content row + anchor (stem/circle/square).** Composed, layered, and reused across pickup/dropoff/driver.

`[OBS]` `layout/callout_map_marker_view.xml` — root `UConstraintLayout` with `padding=@dimen/map_marker_drop_shadow_padding`, `clipToPadding=false`; two children, both `elevation=@dimen/map_marker_elevation`:
1. `CalloutView` (`map_marker_callout`) — the pill background.
2. `BaseMapMarkerContentView` (`map_marker_pin_head`) — the content, `margin=@dimen/map_marker_callout_size`.

`[OBS]` `layout/base_map_marker_content_view.xml` — the content row is **5 lazily-inflated `ViewStub`s** in a horizontal chain:
`leading_custom_view → leading_icon → text_container(title stub + subtitle stub) → trailing_icon`. `[INF]` Only the slots a marker needs are inflated — a pickup pin inflates icon+title, an ETA pin inflates title+subtitle, etc. This is the "text-pill" anatomy.

`[OBS]` Anchor drawables (`drawable/map_marker_anchor_circle.xml`, `_square.xml`): a `layer-list` of two ovals/rects — a full-size background + a small fill. Sizes:
- `map_marker_anchor_height/width = ui__spacing_unit_2x = 16dp` (full pin anchor)
- `map_marker_small_anchor_height/width = ui__spacing_unit_1x = 8dp` (compact/waypoint)
- inner fill `ui__spacing_unit_0.5x = 4dp`, transparent stroke ring `ui__spacing_unit_1.5x = 12dp`.
`[INF]` Circle anchor = pickup/round waypoint, square anchor = dropoff (matches the pickup-dot / dropoff-square language already in Fastship). **Refinement from independent verification:** this is a **server-driven convention, not a hard rule** — `AnchorStyle` is a server-chosen enum (`map_marker_ui/AnchorStyle.java`), and `AnchorView.java:84-99` loads all four shapes (circle/square/small/waypoint). The observed usages (`destination_offer`→SQUARE, `driver_callout`→CIRCLE) are *consistent* with the mapping but the server picks per case. Fastship should treat circle=pickup / square=dropoff as a sensible default, not an invariant.

`[OBS]` Callout shape (`drawable/callout_marker_background_bottom_left.xml`): rectangle, corner radius `ui__spacing_unit_1x = 8dp` on three corners, **one sharp corner carrying the pointer tip** (`left_top_tip`). `[INF]` The tail points at the anchored coordinate; corner radius 8dp.

**ETA tooltip pill** (`layout/ub__eta_tooltip_marker.xml` → `EtaTooltipView`):
- horizontal row, `padding=ui__spacing_unit_1x (8dp)`, `minHeight=ub__tooltip_min_height=36dp`.
- ETA value: `ub__tooltip_eta_title_text_size=26sp`, style `H2.Book`, `paddingLeft/Right=ub__tooltip_padding_extra=4dp`, `includeFontPadding=false`.
- stacked unit block ("MIN"/"ETA"): `ub__tooltip_eta_label_text_size=@dimen/ui__text_size_micro`, all-caps, `H6.News.Secondary`, `paddingEnd=4dp`.
`[INF]` Big number + small uppercase unit label, 36dp-tall pill. The waypoint variant (`ub__waypoint_tooltip_marker.xml`) uses an ETA block of fixed width `ub__tooltip_eta_width=36dp` + a 2-line address + a 16dp caret (`ic_caret_right_16`).

**Z-order / layering** `[INF]` (from separate marker classes + elevation): driver/car marker above route polyline above waypoint ETA pills above base pins; selected access-point marker raised above unselected. Elevation token `map_marker_elevation = ui__elevation_low = 4dp`.

**Hit-slop / touch targets.** `[INF]` `map_marker_drop_shadow_padding` on the root (with `clipToPadding=false`) widens the touch bounds beyond the visible pin; map FABs are `ub__map_fab_size=44dp` (≥ 44dp touch target). `[UNK]` exact hit-slop dp on markers.

### Fastship spec — markers
```ts
// Compose every pin from 3 pieces, never a flat image:
<MapPin>              // anchor: circle 16dp (pickup) | square 16dp (dropoff) | small 8dp (waypoint)
  <Callout radius={8} tail="bottom-left" shadowPadding>   // pill, 8dp corners, pointer tail
    <ContentRow>      // optional leadingIcon | title | subtitle | trailingIcon — render only what exists
```

ETA pill (original to Fastship):
```ts
<EtaPill>             // minHeight 36, padH 8, radius 8, shadow
  <EtaValue size={26} weight="book" noFontPadding />   // "4"
  <EtaUnit  size={10} caps secondary />                 // "MIN\nETA" stacked, 4dp end-pad
</EtaPill>
```
- Z-index: `driver(4) > route(3) > etaPill(2) > basePin(1)`; selected access point bumps +2.
- Touch target ≥ 44dp on every tappable marker (wrap in an expanded hit-area, not the 16dp visual).

---

## 3. ROUTE POLYLINE STYLING

`[OBS]` The polyline is a **two-color model: fill + stroke (casing)**.
- `PolylineV2ColorPalette.java`: `fillColors: List<Int>` (≥1 enforced — `"at least one fill color must be specified"`) + `strokeColor: Int`. `[INF]` fill = the route body, stroke = an outline/casing drawn under/around it for contrast against the basemap.
- `PolylineV2Colors.java`: `palette` + `indexedColorSpans: List<PolylineV2IndexedColorSpan>`. `[INF]` **indexed color spans** let the line change color along its length — this is the mechanism for traveled-vs-remaining segments.
- `PolylineV2IndexedColorSpan.java` exists as a typed span → a color applied from a vertex index onward.

**Traveled-vs-remaining + split at driver.** `[INF]` The line is re-colored (or re-based) at the driver's current position via an `indexedColorSpan` boundary. **Correction from independent verification:** the only indexed-span usage observed in the decompile is a full-coverage span (`UMDFPolylineNativeAdapter.java:12`, `create(0, 1.0f)`), so the driver-split *usage* is inference, not observed — the *mechanism* (`indexedColorSpans`) is real. **Also:** there IS an alpha-divider channel — `PolylineV2Options.java:7,37-39,52,64,66` exposes `alphaDividerPosition` + `preDividerAlpha`/`postDividerAlpha` (defaults 0.0/1.0) — an alternative to color-split for the same traveled/remaining effect; the earlier "no evidence of an alpha-fade divider" was wrong. The animation options (`PolylineV2AnimationOptions`) carry `animationDuration`, `startDelay`, `repeatDelay`, `shouldRepeat`, `easingFunction` (default `Linear`, all delays `0`). `[INF]` the "pulse/draw-on" route animation is a polyline trim animation, not a marker.

**Width / dp.** `[UNK]` No polyline width dimen in resources (widths are set in renderer code / server-driven view models — see `SolidPolylineViewModel`, `PulsePolylineViewModel`, `DottedPolylineViewModel` in `model/core/generated/types/maps/map_view`). `SKIP` exact width values are server-config-driven.

### Fastship spec — polyline
```ts
// Two-layer line: casing under fill. Both react-native <Polyline>.
<Polyline coordinates={route} strokeWidth={FILL_W + 2} strokeColor={theme.routeCasing} zIndex={2} lineCap="round" />
<Polyline coordinates={route} strokeWidth={FILL_W}     strokeColor={theme.routeFill}   zIndex={3} lineCap="round" />

// Traveled vs remaining = two fills split at driver index (no alpha trick):
const split = nearestVertexIndex(route, driverPos);
<Polyline coordinates={route.slice(0, split + 1)} strokeColor={theme.routeTraveled} ... />
<Polyline coordinates={route.slice(split)}       strokeColor={theme.routeFill}     ... />
```
- Tokens: `routeFill` (brand/route), `routeCasing` (high-contrast outline, ~+2dp), `routeTraveled` (muted/grey).
- Recommend `FILL_W = 5dp`, casing `+2dp` → total 7dp outline. Round caps/joins.
- Split recomputed per driver fix; keep it cheap (nearest-vertex, not re-projection).

---

## 4. VEHICLE GLIDE

`[OBS]` `sources/com/ubercab/android/map/CarMarker.java` — interface, single method `update(CarMarkerModel)`.
`[OBS]` `UberCarMarker.java` — holds a native `handle` + `mapView`; `update(model)` just stores the model and calls `mapView.updateCarMarker(this)`. `[INF]` **The interpolation/glide is done inside the proprietary `UberMapView` native renderer, fed a new `CarMarkerModel` — the app layer does not run its own interpolator loop.** `SKIP` the actual glide math is engine-internal.

`[OBS]` `CarMarkerModel.java` / `CarMarkerType.java` / `CarMarkerScaleMode.java` — the model carries position + presentation (type, scale mode); heading is part of the model. `[INF]` heading rotation is applied by the renderer from the model's bearing field.

**Interpolation duration, staleness, epoch.** `[UNK]` — not present as constants in decompiled resources; the glide duration and timestamp-staleness policy live in the native engine / server stream, not in inspectable XML/Kotlin. `SKIP`.

### Fastship spec — glide
Fastship owns its own interpolator (already has one in `map-math.ts`). Keep it, tuned to Uber's *feel*:
```ts
// Interpolate between fixes over the fix period, ease linear; snap if teleport.
glideDurationMs = fixPeriodMs            // ride the same span as the GPS period → no rubber-banding
if (haversine(prev, next) > SNAP_METERS) snapToMarker(next)   // too far for one drive → jump, don't glide
heading = fix.heading ?? bearingBetween(prev, next)            // device heading first, else path bearing
```
- Staleness: if `now - fix.epoch > STALE_MS`, drop marker opacity (~0.45) and **stop gliding** (an old car must not animate as if live). `[INF]` mirrors Fastship's existing stale rule and matches Uber's "don't show a stale car as live" intent.
- On Android prefer `Marker.animateMarkerToCoordinate` (native, smooth); iOS drive via JS loop with the same duration. Keep one `GLIDE_MS` constant for both.

---

## 5. ACCESS-POINT PICKER + PER-STAGE LAYER RECIPES

**Access-point selection UI geometry** `[OBS]`:
- `layout/ub__access_point_selection_view.xml` — full-screen container; a **top-centre "Set custom pickup" pill button** (`buttonType=tertiary`, `shape=pill`, `marginTop=ui__spacing_unit_0.5x=4dp`, `backgroundTint=backgroundPrimary`); bottom sheet container at `layout_gravity=bottom` with `background=@drawable/ub__aps_bottom_sheet_background`.
- `layout/ub__access_point_selection_bottom_sheet_view.xml` — vertical sheet: header, a tertiary search button, a `URecyclerView` picker list with **top + bottom drop-shadow strips** (`ub__aps_bottom_sheet_drop_shadow_height`), an error banner + "set pin" fallback row, 3-item loading placeholder (`list_item_min_height_standard_v2`, corner radius `ub__aps_bottom_sheet_picker_item_corner_radius`, spacing `ub__aps_bottom_sheet_picker_item_margin_vertical`), and a bottom primary confirm button (`marginTop=8dp`, `marginBottom/Horizontal=contentInset`).
- `layout/ub__access_point_picker_item_view.xml` — each row: a `PlatformListItemView` + a tag row (`marginBottom=ub__aps_tag_row_margin_bottom=6dp`) with a **walking-ETA tag** (`xSmall`, leading `ub_ic_person_walk` icon) and a blue justification tag.

`[INF]` The geometry recipe: map fills the screen, a "choose on map" pill floats top-centre, the bottom sheet lists candidate access points as rows each annotated with walking-ETA + a reason tag, with scroll shadows, and a confirm CTA pinned to the bottom.

**Per-stage layer recipes** `[OBS]` the map is assembled from independent layers under `sources/com/ubercab/map_hub/map_layer/`:
- `waypoints/` (`WaypointsPresenter`, `WaypointsMapLayer*`) — pickup/dropoff/waypoint markers.
- `route_line/` (`RouteLineMapLayer*`, `simple/PolylinePresenterPluginFactory`, `simple/ArcPresenterPluginFactory`) — route polylines (and an "arc" variant for e.g. flights).
- `tooltip/` (`ScheduledRidesTooltipPluginFactoryV2`, `HourlyTooltipPluginFactoryV2`, `ConnectTooltipPluginFactoryV2`, `GuestRequestTooltipPluginFactoryV2`, `local_cab/…`) — ETA/waypoint tooltips per product.
- `hint/` (`ConfirmationHintMapLayer*`) — confirmation hints.
- `base_map_layer/device_location/` (`DeviceLocationMapLayerBuilderPluginFactory`) — the "you are here" dot.
`[INF]` Layers are plugins switched on/off per screen state (each `PluginFactory` exposes a `PluginSwitch` via `mo2649a()`). Stage recipe is a *set of active layers*, not a monolith.

**Stage → layers recipe** `[INF]` (from layer names + product tooltips):
| Stage | Active layers |
|---|---|
| **Pre-trip / set pickup** | device_location + waypoints(pickup pin) + access_point picker + confirmation hint |
| **Dispatch / en-route to pickup** | device_location + waypoints + route_line(driver→pickup) + ETA tooltip + car marker |
| **In-trip** | waypoints(pickup+dropoff) + route_line(traveled/remaining) + car marker + ETA tooltip; access-point picker off |
| **Post-trip** | route collapsed; rating/receipt layers (out of map scope) |

### Fastship spec — access point + stages
```ts
// AccessPointSheet: map + floating top pill + bottom list
<MapView />                                   // full-bleed
<PillButton position="top-center" label="Set custom pickup" variant="tertiary" />
<BottomSheet>
  {items.map(ap => <AccessPointRow
      title={ap.name}
      tags={[<Tag size="xs" icon="walk" label={`${ap.walkMin} min`} />,
             ap.reason && <Tag size="xs" color="blue" label={ap.reason} />]} />)}
  <ConfirmButton block primary />
</BottomSheet>

// Stage layer map — drive everything from one state, not per-screen flags:
const LAYERS: Record<Stage, Layer[]> = {
  pretrip:  ['deviceLocation', 'pickupPin', 'accessPoints', 'hint'],
  dispatch: ['deviceLocation', 'waypoints', 'route', 'car', 'eta'],
  intrip:   ['waypoints', 'route', 'car', 'eta'],
  posttrip: [],
};
```

---

## 6. RECENTER FAB + COMPASS

`[OBS]` `layout/ub__map_compass_button.xml` → `MapCompassView`:
- `layout_gravity=end|bottom`, starts `visibility=gone` and `scaleX/scaleY=0` (animates in when bearing ≠ 0).
- inner `UFloatingActionButton` `perspective_toggle`, `fabCustomSize=ub__map_fab_size=44dp`, `backgroundTint=?android:attr/colorBackground`, `borderWidth=0dp`, `rippleColor=textColorTertiary`, icon `@drawable/ub__ic_map_compass`.
- margins: `marginLeft/Right/Bottom = ui__spacing_unit_2x = 16dp`.
- a11y label `@string/map_compass_accessibility_description`, `analyticsId` present.

`[INF]` Compass is **bottom-end, 44dp, 16dp margins, hidden until the map is rotated**, and doubles as a perspective/tilt toggle. The recenter ("center me") control is a sibling FAB of the same 44dp size (see `ub__location_sharing_fab_size = @dimen/ub__map_fab_size`, and `ub__emobi_map_button_center_me.xml` / `ub_walking_navigation_recenter_button.xml`). `ub__map_ui_controls.xml` is an empty `MapControlsContainerView` (`clipChildren=false`) — controls are overlaid, not part of the map view.

### Fastship spec — FABs
```ts
// One overlay container, clipChildren=false; controls are siblings of <MapView>, not children.
<RecenterFab            // bottom-end; show only when !following
  size={44} margin={16} bg={theme.bg} borderWidth={0} ripple={theme.textTertiary}
  onPress={reFollow} accessibilityLabel="Re-center map" />
<CompassFab             // bottom-end above recenter; show only when bearing !== 0
  size={44} margin={16} rotation={-bearing} onPress={resetNorth} accessibilityLabel="Reset north" />
```
- Appear/disappear with a scale animation (compass starts at scale 0). Stack vertically with 16dp gaps, anchored bottom-end, lifted above the bottom sheet by the same padding used for camera fit.

---

## Consolidated token table (Fastship originals, derived from observed patterns)

| Token | Value | Source pattern |
|---|---|---|
| `mapFabSize` | 44dp | `ub__map_fab_size` `[OBS]` |
| `mapFabMargin` | 16dp | `ui__spacing_unit_2x` `[OBS]` |
| `pinAnchor` | 16dp | `map_marker_anchor_*` `[OBS]` |
| `pinAnchorSmall` | 8dp | `map_marker_small_anchor_*` `[OBS]` |
| `calloutRadius` | 8dp | callout bg corners `[OBS]` |
| `etaPillMinHeight` | 36dp | `ub__tooltip_min_height` `[OBS]` |
| `etaValueSize` | 26sp | `ub__tooltip_eta_title_text_size` `[OBS]` |
| `etaUnitSize` | ~10sp caps | `ub__tooltip_eta_label_text_size` `[OBS]` |
| `etaBlockWidth` | 36dp | `ub__tooltip_eta_width` `[OBS]` |
| `routeFillWidth` | 5dp | `[INF]` (Uber width is server-driven `[UNK]`) |
| `routeCasingExtra` | +2dp | `[INF]` from fill+stroke palette `[OBS]` |
| `markerElevation` | 4dp | `ui__elevation_low` `[OBS]` |
| `tagRowGap` | 6dp | `ub__aps_tag_row_margin_bottom` `[OBS]` |

## SKIP list (requires Uber's proprietary engine / not extractable)
- Camera-move duration & easing curves — engine-internal. `[UNK]`
- Vehicle glide interpolation math & staleness constants — native `UberMapView`. `[UNK]`
- Exact route polyline width/alpha values — server-driven view models (`SolidPolylineViewModel`/`PulsePolylineViewModel`). `[UNK]`
- Native `MapController` / `UnifiedMapLayerManager` rendering pipeline. `SKIP`

## Evidence index (paths cited)
- `sources/com/ubercab/android/map/camera/CameraPosition.java`, `camera/updates/{CameraPositionUpdater,MakeVisibleCameraPositionUpdater,ConcatenatedCameraPositionUpdater}.java`
- `sources/com/ubercab/android/map/{CarMarker,UberCarMarker,CarMarkerModel,CarMarkerType,PolylineV2Colors,PolylineV2ColorPalette,PolylineV2IndexedColorSpan,PolylineV2AnimationOptions}.java`
- `sources/com/ubercab/map_hub/map_layer/{waypoints,route_line,tooltip,hint,base_map_layer/device_location}/…`
- `resources/res/layout/{ub__eta_tooltip_marker,ub__waypoint_tooltip_marker,callout_map_marker_view,base_map_marker_content_view,ub__map_compass_button,ub__map_ui_controls,ub__access_point_selection_view,ub__access_point_selection_bottom_sheet_view,ub__access_point_picker_item_view}.xml`
- `resources/res/drawable/{map_marker_anchor_circle,map_marker_anchor_square,callout_marker_background_bottom_left}.xml`
- `resources/res/values/dimens.xml` (lines 1162-3319)
