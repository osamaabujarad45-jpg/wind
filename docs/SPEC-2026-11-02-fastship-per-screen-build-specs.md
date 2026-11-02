# SPEC — Fastship Per-Screen Build Specs (2026-11-02)

> **Framing.** Authorized competitive-architecture study. Goal: per-screen
> **build specs** (region / spacing / composition / states / motion) for
> Fastship's core journey, extracted as **structure and geometry** from a local
> Uber decompile — not code or artwork to reuse. Every claim tagged
> **[O]**bservation / **[I]**nference / **[U]**nknown. Source layouts cited by
> path under `%LOCALAPPDATA%\Temp\opencode\uber\rea-full\resources\res\layout`.
> Companion to `docs/KNOWLEDGE-2026-11-02-uber-rider-ui-layer-architecture-study.md`
> (tokens, sheet system, motion catalog). Fastship route mapping is original.

**Token recap (from KNOWLEDGE doc, all [O])**: 8 dp linear grid
`ui__spacing_unit_Nx = N×8 dp`; `ui__corner_radius`=2 dp;
`ui__elevation_high`=16 dp; `ui__header_height`=96 dp; `ui__avatar_size_large`=64 dp;
`bottom_sheet_corner_radius`=16 dp; `ui__modal_bottom_sheet_elevation`=16 dp;
sheet background `?attr/backgroundPrimary`; semantic colours via `?attr/*`.

---

## (a) HOME / map shell

### 1. REGION MAP  [O] `layout\main_page.xml`, `layout\ub__home_screen_container.xml`, `layout\ub__product_options_bar.xml`, `layout\ub__destination_search_prompt.xml`

Root `MainView` (FrameLayout, `bg=?attr/backgroundPrimary`) → `DrawerLayout` holding three full-viewport slots:

| # | Region | Container view | Layout behaviour |
|---|---|---|---|
| 1 | **Content slot** | `MainContentView #content_frame` (match_parent) | The single slot every ride-mode RIB inflates into. **[I]** Not a layout — a mount point. |
| 2 | **Post-trip ad slot** | `UFrameLayout #post_trip_waypoint_ad_frame` (`visibility=gone`, `fitsSystemWindows`) | Hidden until a trip ends; overlay. |
| 3 | **Modal/sheet slot** | `UFrameLayout #modal_frame` (`fitsSystemWindows`) | Always-present overlay for all bottom sheets and modals. |

Inside `#content_frame` the home-mode RIB mounts `ub__home_screen_container.xml` — a `<merge>` into a ConstraintLayout with **3 vertical slots chained `spread_inside`** [O]:

- `#header` (URecyclerView, wrap_content) — top: greeting / where-to bar / product options
- `#body` (URecyclerView, 0 dp fill) — middle: map or feed
- `#footer` (URecyclerView, wrap_content) — bottom: service tiles / promotions

The "Where to?" row is `ub__destination_search_prompt.xml` [O]: horizontal `ULinearLayout` height `ui__spacing_unit_7x` (56 dp), `bg=?android:selectableItemBackground` (ripple), TextView `Platform.TextStyle.H3.Book.Secondary`, padding 2× (16 dp) left/right, `drawablePadding` 2×, plus a wrap-content right plugin container. The product-options bar (`ub__product_options_bar.xml`) is a 2-slot horizontal row: `#start` (weight 1, gravity left) + `#end` (wrap, gravity right).

### 2. SPACING GEOMETRY  [O]

- Where-to row height: **56 dp** (`ui__spacing_unit_7x`).
- Horizontal padding on where-to text: **16 dp** each side.
- Content insets: `?attr/contentInset` token (used everywhere for screen-edge gutters).
- No fixed map height — `#body` fills between header and footer recyclerviews.

### 3. COMPONENT COMPOSITION  [O]

- **Header region**: greeting + `DestinationSearchPromptView` (the "Where to?" tap target) + `ProductOptionsBarView` (start/end horizontal slots).
- **Body region**: a `URecyclerView` — [I] a vertically scrolling card feed (service tiles, saved places, recent trips) OR a map, swapped per mode.
- **Footer region**: a `URecyclerView` — [I] promotional / secondary cards.
- **Modal slot (overlay)**: sheets, dialogs, the post-trip ad.

### 4. STATES  [O]

- `#post_trip_waypoint_ad_frame` is `gone` — only inflated post-trip.
- `#content_frame` and `#modal_frame` are always present; the active RIB swaps the content.
- **[I]** The "home screen" is **not one layout** — it is `#content_frame` filled by the active ride-mode RIB. A lite variant (`lite_main_page.xml`) drops the `DrawerLayout` but keeps the same slot contract.

### 5. MOTION  [O] / [I]

- Sheets enter `#modal_frame` via Material `design_bottom_sheet_slide_in/out` (200 ms) or `mtrl_bottom_sheet_slide_*`.
- Content swaps in `#content_frame` are programmatic (RIB attach/detach), no XML `<transition>` (only one exists app-wide).
- `?android:selectableItemBackground` ripple on the where-to row.

### Fastship implementation note  [I]

Fastship's current home is **list-first**, not map-shell: `src/app/(customer)/index.tsx` renders greeting → "Where to?" search row (56 dp, rounded 26, muted bg) → service tiles → active order → recent routes → promo cards, inside a single `<Screen>` scroll. **Adopt the slot contract, not the map-shell**: keep the existing list home but expose `header` / `body` / `footer` semantic regions inside `<Screen>` so a future map-mode can swap `body`. The "Where to?" row already matches Uber's 56 dp height and ripple-on-tap pattern — keep it. Do **not** adopt the `DrawerLayout`; Fastship uses Expo Router stacks/tabs. Use `@gorhom/bottom-sheet` mounted once at the root `_layout.tsx` as the equivalent of `#modal_frame` so any screen can present a sheet without re-mounting.

---

## (b) SEARCH / destination entry

### 1. REGION MAP  [O] `layout\ub__text_search_v2_layout.xml`, `layout\fullscreen_map_search_view.xml`

Root `TextSearchV2View` → vertical `ULinearLayout` (`bg=?attr/backgroundPrimary`):

| # | Region | Container | Behaviour |
|---|---|---|---|
| 1 | **Section title** | `PlatformListHeadingView #ub__text_search_v2_select_location_text` (`gone`) | Optional heading above results. |
| 2 | **Results scroll** | `LockableScrollView #ub__text_search_v2_scroll_view` (match_parent) | Lockable: scroll disabled while the parent sheet is at peek. |
| 3 | **Results list** | `ULinearLayout #ub__text_search_v2_results` (vertical, wrap) | The result rows. |
| 4 | **Web/SDUI fallback** | `UFrameLayout #ub__text_search_v2_web_container` (`gone`) | Server-rendered HTML results slot. |

`fullscreen_map_search_view.xml` [O]: `FullscreenMapSearchView`, `bg=?attr/backgroundPrimary`, `paddingBottom=ui__spacing_unit_7x` (56 dp), `focusable`/`clickable`, `wrap_content` height. **[I]** The full-screen map search sits **above** a bottom sheet; the 56 dp bottom padding reserves the peek height.

### 2. SPACING GEOMETRY  [O]

- Sheet peek height: **120 dp** (`text_search_v2_bottom_sheet_peek_height = ui__spacing_unit_15x`, `dimens.xml:1657`).
- Full-screen map search bottom padding: **56 dp** (leaves room for the peek).
- Main-view vertical shift when the sheet expands: **56 dp** (`ub__bottom_sheet_main_view_offset`, `dimens.xml:1840`).

### 3. COMPONENT COMPOSITION  [O]

- Heading (optional, `gone` by default).
- Lockable scroll of result rows (the `list_item_platform_content_v4.xml` slot row from the KNOWLEDGE doc — ~20 stub slots, all `gone`).
- Web container for SDUI HTML results.

### 4. STATES  [O]

- `#ub__text_search_v2_select_location_text` `gone` — shown only when a section title is needed.
- `#ub__text_search_v2_web_container` `gone` — the web fallback is opt-in.
- **[I]** LockableScrollView exists specifically so the results list does not steal scroll from the sheet while collapsed.

### 5. MOTION  [O] / [I]

- Sheet slides via `design_bottom_sheet_slide_in.xml` / `_slide_out.xml` (Material default ~200 ms).
- Content entering the sheet uses `ub__fade_push_up_in.xml` — `<set duration=400>` translate `fromYDelta=30%p→0` + `alpha 0→1`. **[I]** The canonical "sheet content enters" animation: 400 ms, 30% slide-up + fade.

### Fastship implementation note  [I]

Fastship's search is the **`CityPicker` modal inside `src/app/book.tsx`** (lines 629–709): a React Native `<Modal animationType="slide">` with a `<KeyboardAvoidingView>`, a scrim `Pressable`, a `SafeAreaView` sheet, a grip bar, title, a scroll of saved/recent places, and a `<PlaceSearch>` panel. It is not a separate route. **Adopt**: keep it as an in-place modal (Expo Router `<Modal>` or `@gorhom/bottom-sheet` presented from `book.tsx`); set peek ≈ 120 dp to match the muscle memory of the peek-then-expand pattern; gate scroll on sheet position (the `LockableScrollView` lesson — in RN, `BottomSheet`'s `enableContentPanningGesture` + `dynamic` snap points give the same effect). Skip the web/SDUI fallback slot — Fastship results are native. Reuse the `ub__fade_push_up_in` *pattern* (slide-up + fade) as one Reanimated `enterFromBottom` preset with **Fastship's own duration/easing** — do NOT copy the exact 400 ms / 30% / bezier values.

---

## (c) LOCATION-PIN EDITOR

### 1. REGION MAP  [O] `layout\ub__generic_location_editor_v2.xml`, `layout\ub__pickup_refinement_pin_v2.xml`, `layout\ub__pin_move_view.xml`

Root `GenericLocationEditorView` (`fitsSystemWindows`). Three stacked layers:

| # | Region | Container | Behaviour |
|---|---|---|---|
| 1 | **Map** (back) | (hosted behind this view by the parent RIB) | Full-bleed; not declared in this layout. |
| 2 | **Pin** (centre) | `PinViewV2` (`ub__pickup_refinement_pin_v2.xml`, match_parent, `importantForAccessibility=noHideDescendants`) | Single custom view; [I] draws the pin in code, centred on screen. |
| 3a | **Chrome card** (top) | `GenericLocationEditorChromeView #ub__generic_custom_card_view` (wrap_content, `cardCornerRadius=ui__corner_radius`=2 dp, `cardElevation=ui__spacing_unit_1x`=8 dp) | Floating top search bar. |
| 3b | **Confirm row** (bottom) | `ub__pin_move_view.xml` (`<merge>`) | Slides up from the bottom: title + subtitle + tags + circle action button. |
| 3c | **Top-bar overlay** | `UFrameLayout #ub__generic_location_editor_top_bar_container` (wrap_content) | Extra overlay slot. |

The chrome card holds **two interchangeable search-box variants** [O]:
- `#ub__generic_search_box_v2_with_title` (`gone`) — `BaseHeader` (`header_state=collapse`, elevation 0) + entry container (`bg=?attr/brandGrey40`, marginStart/End 2× = 16 dp) with `UTextView` + `ClearableEditText` (gone).
- `#ub__generic_search_box` (visible) — horizontal, padding 2× left/right (16 dp), 1× top/bottom (8 dp), back-arrow `UImageView` (minWidth/Height 3× = 24 dp, `srcCompat=ub_ic_arrow_left`), entry container (`bg=brandGrey40`, marginStart 1× = 8 dp).

A `#loading_container` (`UFrameLayout`, `invisible`, `layout_gravity=bottom`, height `?attr/lineIndicatorHeight`) holds `BitLoadingIndicator` for geocoding.

### 2. SPACING GEOMETRY  [O]

- Card corner radius: **2 dp** (`ui__corner_radius`); card elevation: **8 dp** (`ui__spacing_unit_1x`).
- Plain search-box padding: **16 dp** horizontal, **8 dp** vertical.
- "With title" variant entry container side margin: **16 dp**; plain variant entry container start margin: **8 dp**.
- Back-arrow min tap target: **24 dp**.
- Pin-move confirm row tag spacing: `ub__pin_move_tag_vertical_margin` = **4 dp** (`dimens.xml:2666`).
- Loading indicator height: `?attr/lineIndicatorHeight` (thin top-of-card bar).

### 3. COMPONENT COMPOSITION  [O]

- **Chrome card**: two-variant search box (TextView label vs `ClearableEditText`), back arrow, loading bar.
- **Confirm row** (`ub__pin_move_view.xml`):
  - `#pin_move_content` (vertical, weight 1): title `LabelDefault` / subtitle `ParagraphSmall` (`gone`) / tags row `#pin_move_tags` (`gone`).
  - `#pin_move_action_button` `BaseMaterialButton{secondary, circle, small}` (`gone`).
- **Pin**: `PinViewV2` — [I] assembled from circle + stem + outline + text-pill pieces (KNOWLEDGE doc §4).

### 4. STATES  [O]

- "With title" search-box variant `gone` (only when a title context is needed); plain variant visible.
- `ClearableEditText` `gone` until the user taps to edit (the `UTextView` placeholder is shown first).
- `#loading_container` `invisible` — `BitLoadingIndicator` only while geocoding.
- subtitle / tags / action_button all `gone` — opt-in per content.

### 5. MOTION  [O] / [I]

- `BaseHeader` carries `header_state=collapse` — collapses on scroll.
- The confirm row slides up from the bottom — **[I]** uses the canonical `ub__fade_push_up_in.xml` (400 ms, 30% slide + fade).
- Back arrow is a tap target; no explicit anim ref (uses `?selectableItemBackground`).

### Fastship implementation note  [I]

Fastship's pin editor is **`PinSheet` in `src/app/book.tsx`** (lines 610–627): a modal that takes a `start` point, an optional `autoLocate`, an `onLocate`, an `onClose`, and an `onConfirm(point)`. It is rendered conditionally when `pinFor` is set, and the parent `book.tsx` re-validates via `servedCity(point)` on confirm. **Adopt the 3-layer model explicitly inside `PinSheet`**: render `react-native-maps` `MapView` full-bleed (layer 1), a centred `<Pin>` absolutely positioned (layer 2 — use react-native-svg, not a layered drawable set), and a top chrome card + bottom confirm sheet as `@gorhom/bottom-sheet` `BottomSheetView` (layer 3). Map the chrome card to a 2 dp radius / 8 dp elevation card holding a back arrow + a read-only `Txt` that becomes a `TextInput` on tap; map the confirm row to a `LabelDefault` title + optional `ParagraphSmall` subtitle + a single circular `IconButton` (secondary/small). Wire `onConfirm` to the existing `servedCity` guard. Skip the "with title" variant unless a future flow needs a header. Reuse the `enterFromBottom` Reanimated preset for the confirm row.

---

## (d) BOOKING CONFIRM

### 1. REGION MAP  [O] `layout\ub__arrive_by_confirm_trip_view.xml` (+ `_header`, `_body`, `_actions`), `layout\ub__confirmation_screen_view.xml`, `layout\ub__confirmation_modal.xml`

Root `ArriveByConfirmView` (`bg=backgroundPrimary`, `fitsSystemWindows`), a ConstraintLayout with a 2-row vertical split:

| # | Region | Container | Behaviour |
|---|---|---|---|
| 1 | **Scroll area** | `UScrollView #ub__arrive_by_confirm_trip_scrollview` (wrap, `fillViewport=true`, constrained top→parent, bottom→top of #bottom) | Holds header + body. |
| 2 | **Sticky actions** | `ULinearLayout #ub__arrive_by_confirm_trip_bottom` (wrap, constrained bottom→parent) | Holds the confirm button; pinned below the scroll. |

Three separate `<include>`s make header / body / actions independently animatable and reusable [I].

**Header** (`_header`): vertical `ULinearLayout`:
- Title `DisplayXSmall` (`?attr/contentPrimary`), marginTop 2.5× (20 dp), marginBottom 0.5× (4 dp), marginStart 3× (24 dp), marginEnd 1× (8 dp), maxLines 2, ellipsize end.
- Inner `ULinearLayout` marginBottom 6× (48 dp): "From" label `ParagraphSmall` (marginStart 3×, marginEnd 0.5×) + pickup location `Paragraph.Medium` (marginEnd 3×, ellipsize end).

**Body** (`_body`): `UConstraintLayout`, padding 2× (16 dp), weight 1, with two vertical **Guidelines**: `#guideline_left` begin 5× (40 dp), `#guideline_right` end 1× (8 dp). Children:
- `UberItemToItemView` — the vertical pickup→dropoff connector, width 2× (16 dp), stretched top→pickup_title, bottom→dropoff_time.
- pickup_title `ParagraphSmall`, dropoff_title `ParagraphSmall`, pickup_time `LabelLarge`, dropoff_time `LabelLarge`, dropoff_description `ParagraphSmall` — all constrained to the guidelines.
- change_button `BaseMaterialButton{secondary, pill, small}` end→guideline_right, top→parent.
- divider `UPlainView` (`bg=?attr/ruleColor`, height `ub__arrive_by_confirm_trip_divider_size`=1 dp, `dimens.xml:1723`), marginTop 3× (24 dp), between guidelines.

**Actions** (`_actions`): `UConstraintLayout` marginBottom 2× (16 dp). Confirm button `BaseMaterialButton{primary, rect, medium}`, match_parent, marginStart/End 2.5× (20 dp).

**Success confirmation** (`ub__confirmation_screen_view.xml`): vertical `ConfirmationView` centred, `bg=backgroundPrimary`. `ULinearLayout` padding `ui__spacing_unit_7x` (56 dp): `UImageView` (`gone`, padding 3×=24 dp) **or** `LottieAnimationView` (`gone`, autoPlay) + title `LabelLarge` + subtitle `LabelDefault`, both centred `?attr/contentPrimary`.

**Modal confirmation** (`ub__confirmation_modal.xml`): sheet-style. Header `LabelLarge` centred, minHeight 7× (56 dp); border divider; body `bg=backgroundPrimary`: message `ParagraphLarge` (paddingTop 2× / Bottom 2.5×, minHeight 8× = 64 dp, margins 2×/1.5×); avatar + username `H4.Medium` + phone/email `H5.News.Secondary`; primary button height 8× (64 dp), margin 1.5×; tertiary button height 8×.

### 2. SPACING GEOMETRY  [O]

- Body horizontal gutters via Guidelines: left **40 dp**, right **8 dp** (asymmetric — the connector line sits in the left 40 dp gutter).
- Body padding: **16 dp**. Action row marginBottom: **16 dp**. Action button side margin: **20 dp**.
- Title margins: top 20 dp, bottom 4 dp, start 24 dp, end 8 dp.
- "From" label: start 24 dp, end 4 dp; pickup location: end 24 dp.
- Divider: 1 dp tall, marginTop 24 dp.
- Modal: header 56 dp, message minHeight 64 dp, buttons 64 dp tall.

### 3. COMPONENT COMPOSITION  [O]

- Header: trip title + "From <pickup>" line.
- Body: pickup/dropoff **label + time** pairs with a vertical connector line, a Change pill button, a 1 dp rule between the two legs.
- Actions: single primary confirm button (rect/medium).
- Success: image **or** Lottie + title + subtitle (one of the two icons shown).
- Modal: header + message + identity row + primary/tertiary button pair.

### 4. STATES  [O]

- Image icon `gone`, Lottie icon `gone` — exactly one shown on success.
- Modal always provides a primary (confirm) + tertiary (dismiss) pair — the two-button confirm pattern.
- No explicit loading indicator in the confirm view itself — [I] loading is handled by the parent RIB / `BitLoadingIndicator` in the sheet that hosts this view.

### 5. MOTION  [O] / [I]

- header / body / actions are separate includes **so they can be animated independently** [I].
- Buttons use `active_raise.xml` StateList animator on press.
- Success state: Lottie `autoPlay=true` — [I] the success animation plays once on mount.
- Header has no `header_state` (no collapsing here — it's a scroll, not a Coordinator).

### Fastship implementation note  [I]

Fastship has **no separate confirm step**: `src/app/book.tsx` is one long `KeyboardAvoidingView` + `<Screen>` scroll whose `<Screen footer=>` holds the Request `<Button>` (lines 411–417). The whole form IS the confirm. **Adopt the structure, not the split**: keep the single screen, but lift the footer button to a true sticky footer (it already is, via `<Screen footer>`). Borrow the asymmetric body gutter (40 dp left for the connector / 8 dp right) for a future compact "trip summary" card if Fastship ever adds a review step between route-pick and request; the `<RouteLine>` + `<RouteCheckpoints>` already in `book.tsx` are the Fastship equivalent of Uber's pickup/dropoff label+time pairs. For the success state, Fastship already navigates to `/order/${id}` on `haptic.success()` (line 368–369) — keep that; do not add a Lottie interstitial unless a future milestone wants it. If a confirmation modal is ever needed, Fastship already has a `confirm()` helper (`src/ui`) — use it rather than building a custom sheet.

---

## (e) TRIP TRACKING

### 1. REGION MAP  [O] `layout\ub__track_status_view.xml`, `layout\ub__trip_bottom_sheet_v2.xml`, `layout\ub__trip_header.xml`, `layout\ub__trip_buttons.xml`, `layout\ub__trip_header_step_bottom_sheet.xml`, `layout\ub__trip_driver_info_pill.xml`

Root `TrackStatusFlowView` → `UCoordinatorLayout`:

| # | Region | Container | Behaviour |
|---|---|---|---|
| 1 | **Collapsing header** | `BaseHeader #app_bar` (theme `Theme.Platform.Header`, height `?attr/actionBarSize`, `header_state=collapse`) | Collapses on scroll. |
| 2 | **Map** (full-bleed) | `UFrameLayout #ub__track_status_map_container` (`fitsSystemWindows=true`, match_parent) | Map renders behind everything. |
| 3 | **Bottom sheet** | `ULinearLayout #ub__track_status_bottomsheet_container` (wrap, `layout_behavior=bottom_sheet_behavior`, `behavior_peekHeight=ui__spacing_unit_8x`=64 dp, `behavior_hideable=false`, elevation `ui__elevation_high`=16 dp) | Floats over the lower map. |
| 3a | └ Grabber bar | `UPlainView #ub__track_status_grabber_bar` (width 48 dp, height 4 dp, marginTop 1×=8 dp, `layout_gravity=center_horizontal`, `bg=@drawable/ub__track_status_grabber_bar`) | Drag handle. |
| 3b | └ Content | `UScrollView` → `ULinearLayout` (`bg=backgroundPrimary`) → `ULinearLayout #ub__track_status_content_container` (vertical, `animateLayoutChanges=false`, analyticsId `79fd5a8f-1015`) | Dynamically filled with trip cards. |

Sheet wrapper `ub__trip_bottom_sheet_v2.xml` [O]: `TripBottomSheetView` → `DefaultBottomSheetView` (vertical, `focusableInTouchMode`, `clickable`, `clipChildren=false`).

Sub-components mounted into the sheet content:
- `ub__trip_header.xml` [O]: `TripHeaderView` wrap, margin 2× (16 dp); centred `BaseTextView` `LabelLarge` (analyticsId `c6a76511-f113`). **[I]** The status step title.
- `ub__trip_buttons.xml` [O]: `TripButtonsView` horizontal, match_parent, wrap. **[I]** The action row (cancel / share / safety).
- `ub__trip_header_step_bottom_sheet.xml` [O]: `<merge>` centred vertical `ULinearLayout` paddingBottom 2× (16 dp): `BaseAvatarView #ub__driver_avatar` + `UFrameLayout #ub__driver_photo_container` (`gone`) holding placeholder + photo `BaseImageView` at `ui__avatar_size_large`=64 dp.
- `ub__trip_driver_info_pill.xml` [O]: `<merge>` horizontal pill of `gone` slots: rating + star icon, 1× space, favorites count + icon + text, all `ParagraphSmall`.

### 2. SPACING GEOMETRY  [O]

- Sheet peek: **64 dp** (`ui__spacing_unit_8x`).
- Sheet elevation: **16 dp** (`ui__elevation_high`).
- Grabber bar: **48 × 4 dp**, corner radius 100 dp (`ub__track_status_grabber_bar_corner_radius`), marginTop **8 dp**.
- Trip header margin: **16 dp** all sides.
- Driver avatar/photo: **64 dp** (`ui__avatar_size_large`).
- Step sheet paddingBottom: **16 dp**.
- `behavior_hideable=false` — the sheet **cannot** be dismissed by swiping down during a trip.

### 3. COMPONENT COMPOSITION  [O]

- Header: collapsing `BaseHeader`.
- Map: full-bleed `UFrameLayout` (hosted map RIB).
- Sheet (peek 64 dp = grabber + 1 row): grabber + scroll of cards — trip header (status title), driver avatar/photo, driver info pill, trip buttons.
- **[I]** Each card in the content_container is itself a RIB mounted into a `UCardView`.

### 4. STATES  [O]

- Grabber bar always visible.
- `#ub__track_status_content_container` filled dynamically; `animateLayoutChanges=false` is **deliberate** — [I] avoids janky layout transitions as cards attach/detach.
- `#ub__driver_photo_container` `gone` — avatar shown by default; photo container opt-in.
- Every driver-info-pill slot `gone` — opt-in per available data.
- `behavior_hideable=false` — the sheet stays for the whole trip.

### 5. MOTION  [O] / [I]

- `BaseHeader` `header_state=collapse` collapses the header on scroll.
- Sheet slide: `design_bottom_sheet_slide_in/out`.
- `animateLayoutChanges=false` on the content container — content swaps are managed by the RIB, not layout transitions.
- FAB↔sheet morph uses `mtrl_fab_transformation_sheet_collapse/expand_spec.xml`.
- **[I]** No scrim on this sheet — it is non-modal (the map stays interactive).

### Fastship implementation note  [I]

Fastship has **two** tracking screens: `src/app/order/[id].tsx` (full authenticated trip — driver/customer/admin) and `src/app/track/[token].tsx` (public anonymous tracker, no account). Both are **scroll pages**, not map+sheet Coordinators: a `<Header>` + error banner + `<RouteMap>` (in a rounded `<View>`) + a `<Card>` with status / route line / driver / ETA / navigate button. **Adopt the Coordinator geometry on `order/[id].tsx`**: render `<RouteMap>` full-bleed behind a `@gorhom/bottom-sheet` whose peek is **64 dp** (grabber + 1 row) and `enableDismissOnClose={false}` (the `behavior_hideable=false` lesson — a trip sheet must not swipe away). Put the existing status `<Card>` (lines 320–349 — pulse + h2 + progress bar + stage times) as the sheet's first content; the driver `<Card>` (lines 353–359) and handover code `<Card>` (lines 373–385) as further sheet content. Keep the public `track/[token].tsx` as-is (it is intentionally minimal — anonymous, no sheet). Map the grabber to a 48×4 dp rounded bar, `bg` = `palette.hair`. Do **not** drive content swaps with `animateLayoutChanges` — in RN use Reanimated `Layout` transitions only where a card genuinely appears mid-trip (e.g. the `DestinationChangeCard`).

---

## (f) TRIP RECEIPT

### 1. REGION MAP  [O] `layout\ub__receipt_overview.xml`, `layout\ub__default_fare_breakdown.xml`, `layout\ub__fare_breakdown_item.xml`

Root `<merge>` → Coordinator semantics:

| # | Region | Container | Behaviour |
|---|---|---|---|
| 1 | **Collapsing app bar** | `HeaderAppBarLayout #ub__receipt_overview_header_appbar` (height `ui__header_height`=96 dp, `stateListAnimator=@animator/header_elevation`, `contentInsetStartWithNavigation=0dp`) | 96 dp header that collapses. |
| 2 | **Collapsing toolbar** | `HeaderLayout #collapsing_toolbar` (`bg=?attr/colorPrimary`, `collapsedTitleTextAppearance=LabelLarge`, `expandedTitleTextAppearance=DisplayXSmall`, `expandedTitleMarginBottom=2x`=16 dp, `expandedTitleMarginStart/End=?attr/contentInset`, `expandedTitleMarginTop=0dp`, `layout_scrollFlags=snap\|exitUntilCollapsed\|scroll`, `fontPath=?attr/mediumFontPath`) | Title morphs large→small on collapse. |
| 2a | └ Pinned toolbar | `UToolbar #toolbar` (`Platform.Toolbar`, height `?attr/actionBarSize`, `layout_collapseMode=pin`) | Stays pinned while the title collapses. |
| 2b | └ Receipt selector | `UFrameLayout #ub__receipt_overview_receipt_selector_button_container` (`layout_gravity=bottom`, padding `?attr/contentInset`, **`gone`**, height `ub__receipt_overview_header_selector_height`=60 dp) holding `ReceiptSelectorButton` | Only when multiple receipts exist. |
| 3 | **Scroll body** | `UScrollView #ub__receipt_overview_scrollview_container` (`fillViewport=true`, `appbar_scrolling_view_behavior`) → `ULinearLayout` vertical (`divider=?attr/dividerHorizontal`, `showDividers=middle`) | Dividers between each row. |
| 3a | └ Receipt HTML | `WebView #ub__receipt_overview_receipt_content_webview` (wrap) | Server-rendered receipt body. |
| 3b | └ Action list | `ULinearLayout #ub__receipt_overview_action_list` (vertical) | Native actions below the HTML. |
| 4 | **Loading** | `BitLoadingIndicator` (height `?attr/lineIndicatorHeight`, `appbar_scrolling_view_behavior`) | Thin top bar. |
| 5 | **Error slot** | `UFrameLayout #ub__receipt_overview_error_rib_container` (match_parent, marginTop 96 dp) | Full-screen error below the header. |
| 6 | **Picker sheet** | `UFrameLayout #ub__receipt_overview_receipt_picker_bottomsheet_container` (match_parent, marginTop 96 dp) | Trip-picker bottom sheet. |

`ub__default_fare_breakdown.xml` [O] (the detailed fare breakdown): `DefaultFareBreakdownView` `bg=backgroundPrimary` `fitsSystemWindows`. `BaseHeader #appbar` height 96 dp. `BitLoadingIndicator` (`bli_bitColor=?attr/colorAccent`). `UScrollView` (appbar_scrolling_view_behavior) → vertical `ULinearLayout`:
disclaimer `PlatformListItemView` → `line_items_container` `URecyclerView` (visible) → optional_details `PlatformListItemView` → links container → auxiliary_title `PlatformListHeadingView` → auxiliary_disclaimer → `auxiliary_line_items_container` `URecyclerView` (visible) → auxiliary_optional_details (visible) → `auxiliary_home_currency_disclaimers` (`gone`, paddingHorizontal 2×) → `auxiliary_home_currency_buttons` (`gone`, padding 2×).

`ub__fare_breakdown_item.xml` [O]: horizontal `ULinearLayout`: title `H6.News` (wrap) + value `H6.News` (gravity end, weight 1). The atomic fare line.

### 2. SPACING GEOMETRY  [O]

- Header height: **96 dp** (`ui__header_height`).
- Receipt selector height: **60 dp** (`ub__receipt_overview_header_selector_height`, `dimens.xml:2712`).
- Expanded title margins: bottom 16 dp, start/end `?attr/contentInset`, top 0 dp.
- Error/picker containers offset `marginTop = 96 dp` — they sit **below** the pinned header.
- Fare breakdown padding: **16 dp** where present.

### 3. COMPONENT COMPOSITION  [O]

- Header: collapsing `HeaderLayout` with pinned `UToolbar` + optional bottom selector button.
- Body: a **WebView** (server-rendered receipt HTML) on top, then a native action-list `ULinearLayout`, with `?attr/dividerHorizontal` drawn between every child.
- Loading: `BitLoadingIndicator` at the top of the scroll region.
- Error and picker are sibling full-screen containers offset below the header.

### 4. STATES  [O]

- `#ub__receipt_overview_receipt_selector_button_container` `gone` — shown only when multiple receipts are selectable.
- `BitLoadingIndicator` present (the body is server-rendered, so loading is the norm).
- `#ub__receipt_overview_error_rib_container` — error RIB mounts here on failure.
- `#ub__receipt_overview_receipt_picker_bottomsheet_container` — picker sheet host.
- In fare breakdown: `auxiliary_home_currency_disclaimers` and `auxiliary_home_currency_buttons` `gone` — only for foreign-currency receipts.

### 5. MOTION  [O] / [I]

- Collapsing toolbar: `layout_scrollFlags=snap|exitUntilCollapsed|scroll` — the toolbar collapses on scroll, snaps, and the title remains visible.
- `layout_collapseMode=pin` on the toolbar — it pins while the title morphs `DisplayXSmall`→`LabelLarge`.
- `@animator/header_elevation` StateList animator — elevation changes with collapse state.
- `appbar_scrolling_view_behavior` ties the `UScrollView` to the app bar.

### Fastship implementation note  [I]

Fastship's receipt is `src/app/receipt/[id].tsx` — **fully native**, not a WebView: a `<Screen>` with `<Header back>` + an `<Appear>` paper card (rounded 22, padding 20, dashed tear lines) holding a logo + brand + status badge + a `lines.map` of `<Row>` label/value pairs + a total `<Txt variant="h1">` + role-specific commission/earnings rows + a Share `<Button>`. It already redirects non-completed orders to `/order/${id}` (line 21). **Adopt the collapsing-header geometry only if Fastship ever needs a long receipts list**; for the current single-card receipt it is overkill — keep the native card. Borrow two specifics: (1) the 96 dp header / 60 dp selector pattern if multi-trip receipts are added (e.g. a "past receipts" picker); (2) the `divider=?attr/dividerHorizontal` / `showDividers=middle` discipline — Fastship's `styles.line` (paddingVertical 9) already approximates it, but a single `palette.hair` divider token between rows would match the `?attr/dividerHorizontal` role. Do **not** adopt the WebView body — Fastship's receipts are short and native is cheaper. The existing `share()` text-blob export (lines 43–46) is the Fastship equivalent of Uber's action-list; keep it.

---

## Cross-screen Fastship adoption summary  [I]

| Uber pattern | Fastship adoption |
|---|---|
| `#content_frame` / `#modal_frame` slot contract | Mount `@gorhom/bottom-sheet` once at root `_layout.tsx`; each screen presents into it. |
| 8 dp linear spacing grid | **Proposed change** — Fastship's `size` tokens exist but there is no uniform 8 dp scale yet (styles mix values). Add one `spacing.Nx` token in `src/ui.tsx`, migrate ad-hoc dp gradually. |
| 56 dp "Where to?" row | `(customer)/index.tsx` already matches (56 dp, rounded, ripple-on-tap). |
| Sheet peek 64–120 dp | Use 120 dp for search (`CityPicker`), 64 dp for trip tracking (`order/[id].tsx`). |
| `behavior_hideable=false` on trip sheet | `enableDismissOnClose={false}` on the trip bottom sheet. |
| `ub__fade_push_up_in` (slide-up + fade *pattern*) | One Reanimated `enterFromBottom` preset (slide-up + fade) with **Fastship's own duration/easing** — adopt the pattern, do NOT copy the exact 400 ms / 30% / specific bezier (those are parameter values). Reused for sheet content and the pin confirm row. |
| Collapsing header Coordinator (receipt) | Skip for current native card; revisit only if a receipts list is added. |
| WebView receipt body | Skip — Fastship receipts are native and short. |
| Lottie success on confirm | Skip — Fastship navigates straight to `/order/${id}` with `haptic.success()`. |
| `U*View` + `analyticsId` per node | Adopt the analytics-id discipline via a `useAnalyticsId` hook, not the view wrappers. |

---

*Skipped / not checked (ponytail): the obfuscated RIB Java that programmatically
attaches each card into `#ub__track_status_content_container` (which card in
which order is **[U]** from layouts alone); the exact `?attr/contentInset` dp
value (referenced as a theme attr, not resolved); `values-night` colour
overrides; the Lottie `.json` assets referenced by the success confirmation;
which `home_map` layout the `HomeMapContainerView` actually inflates (**[U]** —
constructor inflates nothing; children attached programmatically). One risk
to know: Uber's bottom-sheet scrim starts at `alpha=0` and is faded in by code
— if you port the sheet layout to `@gorhom/bottom-sheet` you must wire the
backdrop opacity to the sheet open fraction yourself or sheets will appear
without a backdrop.*
