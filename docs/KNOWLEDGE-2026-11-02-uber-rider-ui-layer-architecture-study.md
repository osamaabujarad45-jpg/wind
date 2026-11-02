# KNOWLEDGE — Uber Rider UI Layer Architecture Study (2026-11-02)

> **Framing.** Authorized competitive-architecture study of an app the owner is
> authorized to examine. Goal: design/engineering **patterns** for an independent
> courier app (Fastship) — **not** cloning, infringing, or attacking. Static,
> read-only analysis of a local decompile. No proprietary code or artwork is
> reproduced here; paths are cited as evidence only. Each claim is marked
> **[O]**bservation / **[I]**nference / **[U]**nknown.
>
> **Source root:** `%LOCALAPPDATA%\Temp\opencode\uber\rea-full`
> - Resources: `resources\res\{layout,values,drawable,anim,animator,interpolator,transition}\`
> - Java: `sources\com\ubercab\...` and `sources\com\uber\...`
>
> Extracted by GLM 5.2 (Baseten) after Baseten DeepSeek 1017 rate-limited.

---

## 0. Foundational design-token layer

| Token | Value | Source |
|---|---|---|
| `ui__spacing_unit_0x..16x` | 0, 8, 16, 24 … 128 dp (linear 8 dp grid) | `values\dimens.xml:3302-3332` |
| `ui__corner_radius` | 2 dp | `dimens.xml:3148` |
| `ui__elevation_high` | 16 dp | `dimens.xml:3153` |
| `ui__header_height` | 96 dp | `dimens.xml:3187` |
| `ui__avatar_size_large` | 64 dp | `dimens.xml:3119` |
| `ui__list_item_image_bounds_v2` | 48 dp | `dimens.xml:3219` |
| `ui__list_item_min_height_standard_v2` | 64 dp | `dimens.xml:3226` |
| `ui__min_button_height_helix` | 64 dp | `dimens.xml:3241` |
| `bottom_sheet_corner_radius` | = `ui__spacing_unit_2x` (16 dp) | `dimens.xml:140` |
| `ub__aps_bottom_sheet_corner_radius` / `_glowup` | 16 dp / 32 dp | `dimens.xml:1704-1705` |
| `ui__modal_bottom_sheet_elevation` | 16 dp | `dimens.xml:3247` |
| `design_bottom_sheet_elevation` | 8 dp (Material default) | `dimens.xml:222` |
| `text_search_v2_bottom_sheet_peek_height` | = `ui__spacing_unit_15x` (120 dp) | `dimens.xml:1657` |
| `ub__bottom_sheet_main_view_offset` | 56 dp (main view shift on expand) | `dimens.xml:1840` |

Theme attributes used everywhere **[O]**: `?attr/backgroundPrimary`,
`?attr/contentPrimary`, `?attr/contentSecondary`, `?attr/brandGrey40`,
`?attr/iconColor`, `?attr/dividerHorizontal`, `?attr/contentInset`,
`?attr/textSizeLabel*`, `?attr/lineHeightLabel*`. **[I]** These are the
"Backpack / Helix" semantic tokens; concrete colors live in `values\colors.xml`
+ `values-night`.

## 1. Screen Inventory — grouped by journey stage

Layout vocabulary: `ub__*` = Uber-owned, `ub_optional__*` = feature-flagged,
`legacy_` = being phased out. All paths **[O]** from `resources\res\layout\`.

### A. Pre-trip / Home
`main_page.xml` (MainView, DrawerLayout + `MainContentView` + `modal_frame`),
`lite_main_page.xml`, `ub__home_screen_container.xml`, `ub__product_options_bar.xml`,
`ub__reserve_home_view.xml`, `ub__optional__scheduled_rides_trip_list.xml`.

### B. Search / destination entry
`ub__text_search_v2_layout.xml`, `fullscreen_map_search_view.xml`,
`ub__destination_prompt_view.xml`, `ub__destination_search_prompt.xml`,
`ub__transit_where_to_bar_layout.xml`, `intercity_where_to_planner.xml`.

### C. Location editor / pin refinement
`ub__location_editor.xml` (LegacyLocationEditorView),
`ub__generic_location_editor_v2.xml` (+ `…_accessible_edit_text.xml`),
`capture_intent_address_entry_view.xml`, `ub__capture_intent_address_entry_editor.xml`,
`ub__location_editor_capture_intent.xml`, `ub__pickup_refinement_pin_v2.xml`,
`ub__pickup_refinement_pin.xml`, `ub__pickup_tooltip.xml`, `ub__pin_move_view.xml`,
`ub__access_point_selection_view.xml`, `ub__access_point_selection_bottom_sheet_view.xml`,
`ub__access_point_picker_item_view.xml`, `ub_optional__multiple_destination_address_entry_v2.xml`,
`ub__udl_pin_refinement.xml`, `ub__udl_pin_refinement_bottom_sheet.xml`,
`ub__udl_location_details*.xml`, `ub__hourly_location_editor*.xml`,
`ub__intercity_location_editor*.xml`, `ub__hcv_location_editor*.xml`.

### D. Booking / confirm
`ub__arrive_by_confirm_trip_view.xml` (+ `_header`, `_body`, `_actions`,
`_pickup_time`), `ub__confirmation_modal.xml`, `ub__confirmation_screen_view.xml`,
`ub__reserve_pickup_details_v2.xml`, `ub__optional__reserve_disclosure_card.xml`,
`ub__reservation_plan_details.xml`, `ub_optional__plus_one_*.xml` (~15 files),
`ub__trip_dispatch_direct.xml`, `ub__trip_dispatch_message.xml`,
`ub__trip_match_pool.xml`.

### E. Trip tracking (in-trip)
`ub__track_status_view.xml` (Coordinator + map + bottom sheet),
`ub__trip_header_step_bottom_sheet.xml`, `ub__trip_header_step.xml`,
`ub__trip_header.xml`, `ub__trip_bottom_sheet_v2.xml`, `ub__trip_driver_focus.xml`,
`ub__trip_vehicle_focus.xml`, `ub__trip_driver_info_pill.xml`,
`ub__trip_fare_breakdown.xml`, `ub__trip_fare_v2.xml`,
`ub__transparent_fare_breakdown*.xml`, `ub__trip_buttons.xml`,
`ub__trip_buttons_vertical.xml`, `ub__trip_safety_actions_row*.xml`,
`ub__bouncing_marker.xml` (RipplingCircleView + BouncingDotView),
`ub_optional__trip_self_driving_match_modal.xml`.

### F. Ratings / receipts / post-trip
`ub__rating_bottom_sheet.xml`, `ub__rating_detail_v4_bottom_sheet_container.xml`,
`ub__rating_detail_v4*.xml`, `ub__star_rating_step_v2.xml`,
`ub__star_rating_step_bottom_sheet_v2.xml`, `ub__tip_step.xml`,
`ub__tip_step_bottom_sheet.xml`, `ub__supplemental_tip_step.xml`,
`ub__receipt_overview.xml` (collapsing toolbar + WebView + action list),
`ub__default_fare_breakdown.xml`, `ub__fare_breakdown_item.xml`,
`ub__trip_fare_breakdown_header_item.xml`, `ub__post_dropoff_bottom_sheet_view.xml`,
`ub__post_dropoff_header_view.xml`, `ub__driver_stories.xml`, `ub__driver_story.xml`,
`ub__driver_end_story.xml`.

### G. Profile / payment / wallet
`ub__account_settings.xml`, `ub_optional__account_edit*.xml`,
`ub_profile_settings_view.xml`, `ub_profile_settings_list_view.xml`,
`ub_profile_settings_row_view.xml`, `ub__payment_add_payment*.xml`,
`ub__payment_bank_card_form_v2.xml`, `ub__payment_select_payment.xml`,
`ub__payment_wallet_home_v2.xml`, `ub__wallet_transaction_history_detail.xml`,
`ub__wallet_transaction_history_feed.xml`, `ub__promotion_*.xml`,
`ub__gifting_*.xml` (~40), `ub_voucher_*.xml`, `ub__pass_manage_flow_*.xml`,
`ub__membership_*.xml` (~30).

### H. Safety
`ub__safety_toolkit_v2_full_screen.xml`, `ub__safety_toolkit_v2_tools.xml`,
`ub__safety_hotpocket_v2.xml`, `ub__audio_recording_command_sheet.xml`,
`ub__audio_recording_onboarding_screen_template.xml`,
`ub__safety_audio_recording_*.xml`, `ub__safety_trusted_contacts_*.xml`,
`ub__trusted_contact_card.xml`, `ub__safety_verify_my_ride_pin_info_v2.xml`,
`ub__safety_pin_verified_confirmation.xml`, `ub__safety_ridecheck_modal_alert.xml`,
`ridecheck_anomaly.xml`, `ub__safety_safety_line_sheet.xml`,
`ub__record_my_ride_onboarding_*.xml`, `ub__record_my_ride_preview.xml`.

### I. Help / comms
`ub__help_home_v1.xml`, `ub__help_chat.xml`, `ub__help_conversation_list_v2.xml`,
`ub__help_phone_call_*.xml`, `ub__help_inperson_*.xml`,
`ub__optional_help_workflow_*.xml` (~30), `ub__contact_details_view.xml`,
`ub__optional__trip_contact_driver_bottom_sheet.xml`.

### J. Onboarding / identity
`ub__onboarding.xml`, `ub__step_*.xml` (~20 login steps),
`ub__view_identity_verification.xml`, `ub__view_face*.xml`, `ub__ekyc*.xml`,
`ub__usnap_*.xml` (document scanning).

### K. Hub / learning / settings
`hub_app_bar.xml`, `hub_body.xml`, `hub_medium_item.xml`, `learning_hub_*.xml`,
`learning_quiz_*.xml`, `ub__language_selector_*.xml`, `advanced_settings_*.xml`.

### L. Other verticals (referenced for completeness, NOT rider-core)
Transit (`ub__transit_*` ~60), HCV/transit-ticket (`ub__hcv_*` ~40),
emobility/scooters (`ub__emobi_*` ~40), car rentals (`ub__rental_*` /
`ub__rental_step_*` ~40), bike-share (`ub__bike_*`), hourly (`hourly_*`),
intercity (`intercity_*`), group ride / guest rides (`ub__guest_*`, `group_ride_*`).

**RIB router naming** **[O]** from `sources\com\uber\rib\core\`:
`BasicRouter<I>` (no view), `BasicViewRouter<V,I>`, `ViewRouter<V,I>`,
`BasicComposeRouter<I>` (Jetpack Compose), obfuscated base `AbstractC25482b<I>`.
Concrete routers: `HomeMapContainerRouter`, `LiteHomeRouter`, `NavGridRouter`,
`AccountSwitcherRouter`, `ReserveLandingRouter`, `HourlyErrorRouter`,
`OrderSelectionAbstractRouter<Effect>`, `CardRouter<InnerView,CardContainer,Interactor>`,
`TripModalRouterBase`, `LocationEditorPluginRouter<I,C>`, `FlowRouter<I>`.
**[I]** Each RIB = Builder → Router → Interactor → Presenter/View; the View
inflates a layout, the Router attaches child RIBs into the layout's containers.

## 2. Layout Structure — 6 representative screens

### (a) Home / app shell — `layout\main_page.xml`
Root `MainView` (FrameLayout), `background=?attr/backgroundPrimary`.
`DrawerLayout` (#drawer) holds `MainContentView` (#content_frame) — the single
slot every mode RIB renders into — plus `#post_trip_waypoint_ad_frame` (gone)
and `#modal_frame` (fitsSystemWindows) — the modal/sheet overlay slot.
**[I]** The "home screen" is *not* a single layout — it's `content_frame`
filled by the active ride-mode RIB (map + product options + bottom sheet). The
lite variant drops the DrawerLayout but keeps the same slot contract.

### (b) Booking confirm — `ub__arrive_by_confirm_trip_view.xml` (family)
Three-part composition: `_header` + `_body` + `_actions` → `_view`.
**[I]** header / body / actions vertical stack, each a separate include so they
can be reused and individually animated. `ub__confirmation_screen_view.xml`
**[O]**: `ULinearLayout` padding `ui__spacing_unit_7x` with `UImageView` (or
`LottieAnimationView`) + title `Platform.TextStyle.LabelLarge` + subtitle
`Platform.TextStyle.LabelDefault`, centered, `textColor=?attr/contentPrimary`.

### (c) Trip tracking — `layout\ub__track_status_view.xml`
Root `TrackStatusFlowView` → `UCoordinatorLayout`:
- `BaseHeader` (#app_bar, `Theme.Platform.Header`, `header_state="collapse"`).
- `UFrameLayout` (#ub__track_status_map_container, `fitsSystemWindows=true`,
  match_parent) — the full-screen map.
- `ULinearLayout` (#ub__track_status_bottomsheet_container,
  `layout_behavior=@string/bottom_sheet_behavior`,
  `behavior_peekHeight=ui__spacing_unit_8x` (64 dp), `behavior_hideable=false`,
  `elevation=ui__elevation_high` (16 dp)) → `UScrollView` → `ULinearLayout`
  (`background=?attr/backgroundPrimary`) → grabber bar `UPlainView`
  (#ub__track_status_grabber_bar, `background=@drawable/ub__track_status_grabber_bar`,
  marginTop 1x) → `ULinearLayout` (#ub__track_status_content_container,
  analyticsId `79fd5a8f-1015`).

**[I]** Map-vs-content split: map is full-bleed behind; the sheet floats over
its lower portion; the header collapses on scroll. No scrim on the sheet itself.

### (d) Location-pin editor — `layout\ub__generic_location_editor_v2.xml`
Root `GenericLocationEditorView` (fitsSystemWindows) →
`GenericLocationEditorChromeView` (#ub__generic_custom_card_view,
`cardCornerRadius=ui__corner_radius` (2 dp), `cardElevation=ui__spacing_unit_1x`
(8 dp)) containing two interchangeable search-box variants ("with title" /
plain), plus `#loading_container` with `BitLoadingIndicator`, and
`#ub__generic_location_editor_top_bar_container` overlay.
**[I]** The map + central pin (`PinViewV2`) live *behind* this chrome card; the
card is a floating top search bar, the pin is centered on screen, a confirm row
(`ub__pin_move_view.xml`) slides up from the bottom. Classic 3-layer:
map / pin / chrome-card + confirm-sheet.

### (e) Search sheet — `layout\ub__text_search_v2_layout.xml`
Root `TextSearchV2View` → `ULinearLayout` vertical,
`background=?attr/backgroundPrimary`: `PlatformListHeadingView` (section title,
gone) → `LockableScrollView` → `ULinearLayout` (#ub__text_search_v2_results) →
`UFrameLayout` (#ub__text_search_v2_web_container, gone).
**[I]** Text search is a deliberately minimal vertical list — no map, no sheet
mechanics here. When used, it sits inside a bottom sheet whose peek height is
`text_search_v2_bottom_sheet_peek_height` (120 dp).

### (f) Trip receipt — `layout\ub__receipt_overview.xml`
`<merge>` root → CoordinatorLayout semantics: `HeaderAppBarLayout`
(#ub__receipt_overview_header_appbar, height `ui__header_height` (96 dp),
`stateListAnimator=@animator/header_elevation`) → `HeaderLayout`
(#collapsing_toolbar, `layout_scrollFlags=snap|exitUntilCollapsed|scroll`) →
`UToolbar` (`Platform.Toolbar`, `layout_collapseMode=pin`) +
`ReceiptSelectorButton` container. `UScrollView`
(`appbar_scrolling_view_behavior`) → `ULinearLayout`
(`divider=?attr/dividerHorizontal`, `showDividers=middle`) → `WebView`
(#ub__receipt_overview_receipt_content_webview) + action-list `ULinearLayout`.
`BitLoadingIndicator` + two error/picker bottom-sheet containers.
**[I]** Receipts are a **WebView inside a collapsing-header Coordinator** — the
receipt body is server-rendered HTML, native chrome only provides the toolbar +
action list + divider lines. Recurring "webbuffet / webtoolkit" pattern.

## 3. Bottom-Sheet system

**Container** — `layout\bottomsheet_container_layout.xml` **[O]**:
```
UFrameLayout (fitsSystemWindows)
├─ UPlainView #scrim  (background=ub__ui_core_black, alpha=0)
└─ com.ubercab.p284ui.core.widget.BottomSheet #bottomsheet
```
Scrim starts at alpha 0 and is faded in by code **[I]**. The sheet itself is
Uber's own `BottomSheet` widget, not Material's.

**Trip bottom sheet wrapper** — `layout\ub__trip_bottom_sheet_v2.xml`:
`TripBottomSheetView` → `DefaultBottomSheetView`
(`com.ubercab.p284ui.bottomsheet.p285ui.DefaultBottomSheetView`,
`clipChildren=false`).

**Styling & dimensions** **[O]**:
- Background shape `drawable\ub__bottom_sheet_background_top_rounded.xml`:
  `<shape rectangle>` with `topLeftRadius/topRightRadius =
  @dimen/bottom_sheet_corner_radius` (16 dp), `solid = ?attr/backgroundPrimary`.
- Peek heights: `text_search_v2_bottom_sheet_peek_height` = 120 dp;
  track-status peek = `ui__spacing_unit_8x` (64 dp).
- Elevation: `ui__modal_bottom_sheet_elevation` = 16 dp;
  `design_bottom_sheet_elevation` = 8 dp.
- Main-view shift on expand: `ub__bottom_sheet_main_view_offset` = 56 dp.
- Dismiss scrim a11y label: `ub__bottom_sheet_dismiss_scrim` = "Dismiss".
- Grabber bar drawable `drawable\ub__track_status_grabber_bar.xml`: rounded
  rectangle, `solid = ?attr/bgToggleOff`.
- Sheet animations: `anim\design_bottom_sheet_slide_in.xml` / `_slide_out.xml`,
  `m3_bottom_sheet_slide_in.xml` / `_slide_out.xml`,
  `mtrl_bottom_sheet_slide_in.xml` / `_slide_out.xml`.
- **[I]** peek = small fixed height (64–120 dp) showing grabber + 1 row;
  expanded = full content scroll; scrim is opt-in (only the modal container
  layout has one; the trip sheet does not).

## 4. Drawable / Shape vocabulary

**Buttons** — `drawable\button_primary.xml` **[O]**: `inset` → `ripple
color=?colorControlHighlight` → `selector` (enabled/disabled) → `shape
rectangle` with `corners radius=?attr/buttonCornerRadius` + `solid
?android:colorAccent` (enabled) / `colorButtonNormal` (disabled).
`button_secondary.xml` follows the same inset→ripple→selector→shape pattern
**[I]**. `button_base_*` layouts are the *layout* counterparts composing icon +
text.

**Bottom-sheet backgrounds** — top-only rounded rectangles,
`solid=?attr/backgroundPrimary` (§3).

**Pins** — a layered vocabulary **[O]**: `ub__pin_background`,
`ub__pin_fill_background`, `ub__pin_circle`, `ub__pin_circle_outline`,
`ub__pin_stem`, `ub__pin_stem_outline`, `ub__pin_square` / `_v2`,
`ub__pin_rounded_corner`, `ub__pin_text_rounded_corner` / `_outline`,
`ub__pin_redzone`, `ub__pin_animated_square`, `ub__pin_bottom_circle`. Domain
pins: `ub__generic_pin_background`, `ub__safety_pin_background`,
`ub__safety_pin_arriving_background`, `ub__emobi_map_pin_selected_background_pill`,
`ub__emobi_map_pin_selected_background_caret`, `ub__map_pin`,
`ub__ic_location_pin`, `ub__lrm_ic_pin_invalid`, `ub__nav_approaching_pin_middle/_side`,
`ub__bike_pin_number_bg`, `ub__trip_dispatch_direct_pin_number_background`.
**[I]** A pin is *assembled* from circle + stem + outline + text-pill pieces
(so colour/label/shape can vary independently), not a single baked asset.

**Grabber bar** — `ub__track_status_grabber_bar.xml` (§3).

**Recenter FAB** — `layout\ub__optional_center_me.xml` **[O]**:
`UFloatingActionButton` `backgroundTint=?attr/backgroundPrimary`,
`borderWidth=0dp`, `fabCustomSize=@dimen/ub__map_fab_size`,
`rippleColor=?attr/contentPrimary`, `srcCompat=@drawable/ub__ic_center_me`.
Icon is a 40×40 vector, `fillColor=?attr/iconColor`. **[I]** FAB is
background-coloured so it stays high-contrast against any map.

**Compass / misc map controls** — `ub__map_compass_button.xml`,
`ub__set_custom_pickup_map_control.xml`, `ub__dr_skip_button_map_control.xml`,
`ub__wayfindfing_entry_button.xml`, `ub__walking_navigation_recenter_button.xml`,
`ub__emobi_map_button_center_me.xml`, `ub__emobi_map_button_safety.xml`.

**Dividers** — `ub__horizontal_divider.xml`, `ub__grey_horizontal_line.xml`,
`ub__grey_vertical_line.xml`, `ub__divider_step.xml`, `ub__gifting_divider.xml`,
`ub__udl_divider.xml`, plus `?attr/dividerHorizontal` used as `android:divider`
+ `showDividers=middle`.

**Ripples** — every button bg uses `<ripple
color=?android:colorControlHighlight>` wrapping a selector.
Tertiary/secondary buttons add `rippleColor`
(`?attr/backgroundButtonSecondaryPressed`, `?attr/backgroundButtonTertiaryPressed`).

## 5. Component Composition

### Marker / callout slot assembly — `layout\base_map_marker_content_view.xml` **[O]**
`<merge>` into a ConstraintLayout with **4 horizontal slots**, all `ViewStub`s:
1. `#leading_custom_view` → `base_map_marker_content_leading_custom_view`
2. `#leading_icon` / `#trailing_icon` → `base_map_marker_content_icon`
3. `text_container` holding `#map_marker_title_stub` and `#map_marker_subtitle_stub`
4. `#trailing_icon`

`callout_map_marker_view_v2.xml` stacks a `CalloutView` over a
`BaseMapMarkerContentView` at `map_marker_elevation` — a marker = callout +
pin-head, each a 4-slot row.

### List-row slot assembly — `layout\list_item_platform_content_v4.xml` **[O]**
Flagship SDUI row. ConstraintLayout with `Barrier`s (`start_margin_barrier`,
`start_objects_barrier`, `end_buttons_barrier`, `end_margin_barrier`) and
`Guideline`s (`text_margin_top/bottom`). Slots (mostly `gone`, inflated on
demand):
- **Start**: `start_custom_stub`, `leading_radio_stub`, `leading_checkbox_stub`,
  `start_image_container` (FramedCircleImageView / UImageView / BaseImageView),
  `start_text` (`Platform.TextStyle.LabelSmall`).
- **Center text chain** (packed): `title_text` (`LabelDefault`,
  `?attr/contentPrimary`) → `subtitle_text` (`ParagraphSmall`,
  `?attr/contentSecondary`) → `third_label_text` (`ParagraphSmall`).
- **End**: `primary_end_text` + `secondary_end_text`,
  `primary_end_image_container` / `secondary_end_image_container`,
  `action_button` (`BaseMaterialButton` secondary/pill/small), `action_switch`,
  `action_check`, `action_radio`, `two_icon_button_stub`, `end_custom_stub`.
- Includes `progress_step_view_v2`. Every node carries `app:analyticsId="<uuid>"`.

### Button styles — `values\styles.xml:6121-6290` **[O]**
```
Platform.Button (Widget.MaterialComponents.Button, UberMove font, textAllCaps, stateListAnimator=active_raise)
├─ Platform.Button.Base (UberMove Text Medium, textAllCaps=false, cornerRadius=ui__spacing_unit_0x)
│  ├─ .Base.Primary / .Primary.Large/Medium/Small
│  ├─ .Base.Secondary / .Secondary.Large/Medium/Small
│  ├─ .Base.Tertiary / .Tertiary.Large/Medium/Small
│  ├─ .Base.Circle / .Circle.Secondary / .Circle.Tertiary
│  └─ .Base.CircleSquareDynamic / .BaseDynamic
├─ Platform.Button.Primary (background=@drawable/button_primary, tint=?attr/buttonPrimaryTint)
├─ Platform.Button.Secondary (background=@drawable/button_secondary)
└─ Platform.Button.Borderless
```
**SDUI button** — `com.ubercab.p284ui.core.button.BaseMaterialButton` with
attrs `app:buttonType={primary,secondary,tertiary}`,
`app:shape={pill,circle,square,...}`, `app:size={small,medium,large}`.

### Text appearances — `values\styles.xml:6371+` **[O]**
```
Platform.TextStyle (TextAppearance.AppCompat)
├─ H1/H2/H3/H4/H5/H6 × Book/News/Medium × Primary/Secondary/Tertiary/Inverse
├─ Display / DisplayLarge / DisplaySmall / DisplayXSmall
├─ LabelLarge / LabelDefault / LabelSmall
├─ ParagraphSmall / ParagraphDefault
├─ BodyL/M/S × Medium/Regular
├─ Giga / GigaLarge / GigaSmall × Medium/Normal
├─ Button.Bold / ButtonSmall.Bold
└─ BrandButton*.Bold
```
Fonts: `@font/uber_move_text_medium`, `?attr/mediumFontPath` (Uber Move).

### Card component
`com.ubercab.p284ui.core.UCardView` +
`CardRouter<InnerView, CardContainer extends UCardView, Interactor>`.
**[I]** Every "card" in the trip-details feed is itself a RIB mounted into a
`UCardView` container.

## 6. Map-Specific UI

| Element | Layout **[O]** | Notes |
|---|---|---|
| Recenter FAB | `ub__optional_center_me.xml` | `UFloatingActionButton`, `bg=?attr/backgroundPrimary`, `srcCompat=ub__ic_center_me`. |
| Compass | `ub__map_compass_button.xml` | — |
| Pickup pin | `ub__pickup_refinement_pin_v2.xml`, `ub__pickup_refinement_pin.xml` | Root `com.ubercab.map_ui.pin.PinViewV2` (single custom view — drawing in code). |
| Pin-move confirm | `ub__pin_move_view.xml` | Title + subtitle + tags + `BaseMaterialButton` circle/secondary/small. |
| ETA tooltip | `ub__eta_tooltip_marker.xml` | `EtaTooltipView` → horizontal pill: ETA value (`H2.Book`) + stacked label ("MIN", "ETA"). |
| Pickup tooltip | `ub__pickup_tooltip.xml`, `ub__pickup_refinement_pin_tooltip.xml` | — |
| Info tooltip | `ub__info_tooltip_marker.xml`, `ub__caret_tooltip_marker.xml`, `ub__inline_waypoint_tooltip_marker.xml`, `ub__forward_dispatch_tooltip_marker.xml` | — |
| Waypoint / scheduled-ride tooltip | `ub__waypoint_tooltip_marker.xml`, `ub__waypoint_eta_range_tooltip_marker.xml`, `ub__scheduled_rides_waypoint_tooltip_marker.xml`, `ub__transit_tooltip_marker.xml`, `ub__hcv_route_tooltip.xml`, `ub__hcv_walking_tooltip_marker.xml`, `ub__pass_route_tooltip_marker.xml`, `ub__walking_tooltip_marker.xml`, `ub__rider_location_tooltip_marker.xml` | Same `<…TooltipMarkerView>` custom-view root pattern. |
| Access-point picker | `ub__access_point_selection_view.xml`, `ub__access_point_selection_bottom_sheet_view.xml`, `ub__access_point_picker_item_view.xml` | Owned by `com.uber.accesspointselection`. |
| Wayfinding | `ub__wayfinding_steps.xml`, `ub__wayfinding_directions_sdui.xml`, `ub__wayfinding_walking_eta.xml`, `ub__wayfinding_image_list_item.xml`, `ub__wayfindfing_entry_button.xml` | SDUI-driven. |
| Walking navigation | `ub__walking_navigation_*`, `ub__venue_home_screen_widget_walking_*` | — |
| Map UI controls overlay | `ub__map_ui_controls.xml`, `ub__map_preview.xml`, `nearby_map_view.xml`, `carrental_map_view.xml`, `rxmap.xml` | — |
| Bouncing dispatch marker | `ub__bouncing_marker.xml` | `RipplingCircleView` + `BouncingDotView`. |
| Hybrid label marker | `ub__hybrid_map_label_marker.xml` | — |
| Point / area / test markers | `point_marker.xml`, `area_marker.xml`, `test_point_marker.xml`, `test_area_marker.xml`, `fixed_map_marker_view.xml`, `floating_label_map_marker_view.xml` | — |

## 7. Motion / Animation

**`anim/`** (view animations) **[O]**: standard `abc_*`,
`design_bottom_sheet_slide_*`, `m3_bottom_sheet_slide_*`,
`mtrl_bottom_sheet_slide_*`, `mtrl_*_motion_*` + Uber custom:
`ub__fade_in.xml`, `ub__fade_and_push_up_in.xml` / `_out.xml`,
`ub__fade_push_up_in.xml` / `_out.xml`, `ub__push_up_in.xml` / `_out.xml`,
`ub__slide_down.xml`, `ub__gifting_scale.xml`, `ub__gifting_shake.xml`,
`ub__carbon_facecamera_scale_center.xml` / `_scale_up.xml`,
`ub__rider_selfie_overlay_scale_*`, `ub__nav_anim_direction_item_appearance.xml`,
`ub__nav_anim_translate_from_top.xml`,
`ub__emobility_end_trip_feedback_animation_push_up.xml`,
`shortcuts_slide_in_bottom.xml` / `shortcuts_slide_out_top.xml`,
`contact_panel_slide_up/down`, `details_list_slide_up/down`,
`multi_checklist_slide_*`, `animate_sub_navigation_*`.

Representative: `ub__fade_push_up_in.xml` = `<set duration=400>` → `translate
fromYDelta=30%p toYDelta=0` + `alpha fromAlpha=0 toAlpha=1`. **[I]** The
canonical "sheet content enters" animation — 30% slide-up + fade, 400 ms.

**`animator/`** (object/StateList animators) **[O]**: Material `m3_*`, `mtrl_*`
+ Uber custom: `active_raise.xml` (button-press raise), `header_elevation.xml`,
`header_fixed_elevation.xml`, `design_appbar_state_list_animator.xml`,
`m3_appbar_state_list_animator.xml`, `style_guide_shrug.xml`,
`tp_progress_animation.xml`, `ub__location_sharing_fill_active_inactive.xml` /
`_inactive_active.xml` / `ub__location_sharing_stroke_active_inactive.xml` /
`_inactive_active.xml`, `ub__safety_agents_update_address_anim.xml`. FAB motion
specs: `design_fab_show/hide_motion_spec.xml`,
`m3_fab_state_list_animator.xml`, `mtrl_fab_transformation_sheet_collapse/expand_spec.xml`.

**`interpolator/`** **[O]**: `fast_out_slow_in.xml`,
`mtrl_fast_out_slow_in.xml`, `mtrl_fast_out_linear_in.xml`,
`mtrl_linear_out_slow_in.xml`, `mtrl_linear.xml`,
`bottom_bar_scroll_motion_easing.xml`, plus Material 3 system motion
`m3_sys_motion_easing_{emphasized,emphasized_accelerate,emphasized_decelerate,standard,standard_accelerate,standard_decelerate,linear}.xml`.
**[I]** Uber does not define custom interpolators — it rides Material 3 motion.

**`transition/`** **[O]**: only **one** file —
`ub__learning_feedback_banner_transition_slide_up.xml`. **[I]** Window/scene
transitions are mostly programmatic; XML `<transition>` is barely used.

**Layout-driven motion**: `android:animateLayoutChanges` appears on dynamic
containers. `stateListAnimator` is the primary press/elevation motion vehicle.

---

## UI-Architecture Summary

1. **One shell, many modes.** `main_page.xml` / `lite_main_page.xml` are just
   `MainContentView` (#content_frame) + `modal_frame`. Every feature is a RIB
   attached into `content_frame`; modals/sheets go into `modal_frame`.
2. **Token-first styling.** 8 dp linear spacing grid is the only size primitive;
   semantic theme attrs carry colour/typography; `Platform.Button.*` /
   `Platform.TextStyle.*` are composed widget+typography styles. Dark/light
   flips via `?attr/` indirection + `values-night\`. Brand font is **Uber Move**.
3. **`U*` view wrappers everywhere.** `UFrameLayout`, `ULinearLayout`,
   `UConstraintLayout`, `URecyclerView`, `UScrollView`, `UTextView`, `UImageView`,
   `UToolbar`, `UCheckBox`, `USwitchCompat`, `UFloatingActionButton`, `UPlainView`
   inject `app:analyticsId="<uuid>"` on every node.
4. **Bottom sheets are the dominant secondary-surface primitive.** Pattern =
   `UFrameLayout` root + `UPlainView` scrim (alpha 0, faded in) + Uber
   `BottomSheet` child, OR `CoordinatorLayout` with `bottom_sheet_behavior` +
   `behavior_peekHeight`. Peek heights fixed small (64–120 dp), background
   `?attr/backgroundPrimary` with **top-only 16 dp corner radius**, elevation
   16 dp, rounded `bgToggleOff` grabber bar at top.
5. **Map screens = full-bleed map + floating chrome.** Map is `match_parent`
   behind; chrome (search card, pin, confirm row, bottom sheet, FABs) floats on
   top with `fitsSystemWindows`. Pins are *composed* from circle + stem +
   outline + text-pill pieces; markers are 4-slot `ViewStub` rows; callouts
   stack a `CalloutView` over a `BaseMapMarkerContentView`.
6. **SDUI is pervasive.** `BaseMaterialButton{buttonType, shape, size}` and the
   `list_item_platform_content_v4.xml` Barrier/Guideline/ViewStub row show a
   server-driven slot machine: ~20 optional slots, all `gone`, inflated on
   demand, each carrying an `analyticsId`. Receipts push this furthest — the
   receipt body is a **WebView** inside a collapsing toolbar.
7. **Motion is restrained and Material-based.** Custom anims are mostly
   `fade+push_up` 400 ms variants; no custom interpolators (Material 3
   `m3_sys_motion_easing_*`); StateList animators (`active_raise`,
   `header_elevation`) drive press and app-bar elevation; FAB→sheet
   transformations reuse Material specs.

---

## Adopt-vs-Skip table — for Fastship (Expo/React Native, `src/ui.tsx` + `src/app/*`)

| Uber pattern | Adopt in Fastship? | How (RN/Expo) |
|---|---|---|
| 8 dp linear spacing scale (`ui__spacing_unit_0x..16x`) | **Adopt** | Single `spacing = (n) => n*8` token in `src/ui.tsx`; expose `spacing.1x..16x`. Ban ad-hoc dp. |
| Semantic theme attrs (`backgroundPrimary`, `contentPrimary`, `iconColor`, `dividerHorizontal`) | **Adopt** | Theme tokens keyed by role, with a `dark` variant; never hardcode colours. |
| `Platform.Button.{Primary,Secondary,Tertiary}×{Large,Medium,Small}×{Pill,Circle,Square}` matrix | **Adopt (compressed)** | One `<Button variant size shape>` component with 3 variants × 3 sizes × 3 shapes. |
| `Platform.TextStyle.H1..H6 × Book/News × Primary/Secondary` (~80 styles) | **Compress** | Use ~12 text styles (Display/Title/Label/Body × 2 sizes × 2 weights). |
| `U*View` wrapper with `analyticsId` per node | **Adopt (the analytics-id discipline, not the wrappers)** | A `<AnalyticsView>` HOC or `useAnalyticsId` hook that tags every interactive surface. |
| Bottom-sheet system: scrim + `BottomSheet` widget, peek/expand, top-only 16 dp radius, grabber bar | **Adopt** | `@gorhom/bottom-sheet`; set `background={theme.backgroundPrimary}`, `cornerRadius=16`, `handleStyle` for grabber, peek 64–120 dp. |
| Coordinator-style map + sheet + collapsing header | **Adopt** | `react-native-maps` full-bleed + bottom-sheet overlay; collapsing header via custom animated header on scroll. |
| 4-slot marker (`base_map_marker_content_view`) with ViewStubs | **Adopt the slot model, skip ViewStub** | `<MapMarker leadingIcon title subtitle trailingIcon>`; RN doesn't need ViewStub — use conditional rendering. |
| Pins assembled from circle+stem+outline+text pieces | **Skip the piece assembly; adopt composition** | One `<Pin color label />` component using SVG; don't layer 6 drawables. |
| SDUI list-row with ~20 ViewStub slots + Barriers | **Adopt the slot idea, drastically reduce** | `<Row leadingImage title subtitle trailing Action>` (~6 slots); don't build the 20-slot machine. |
| Receipt = WebView inside collapsing header | **Adopt for receipts only** | `react-native-webview` inside a `ScrollView` with an animated header. |
| `active_raise` / `header_elevation` StateList animators | **Skip** | RN uses Reanimated `pressIn` scale 0.98 + shadow change; no StateList XML. |
| `ub__fade_push_up_in` (400 ms, 30% slide + fade) | **Adopt** | One Reanimated preset `enterFromBottom` reused for sheet content, toasts, banners. |
| Material 3 motion easing (`m3_sys_motion_easing_*`) | **Adopt** | Use Easing.bezier(0.2,0,0,1) / (0.05,0,0.66,0.66) presets. |
| XML `<transition>` (only 1 file) | **Skip** | RN has no equivalent; use Reanimated layout animations. |
| RIB architecture (Router/Interactor/Builder per screen) | **Skip the framework, adopt the separation** | Expo Router files = screens; keep a `useScreenInteractor` hook (state/effect logic) separate from the view. |
| DrawerLayout shell (`main_page.xml`) | **Skip** | A courier app doesn't need the rider drawer; use a tab bar or stack. |
| Lite vs full app shell | **Skip** | One shell; RN bundle-splitting (Hermes conditional) replaces Uber's native lite/full APK split. |

---

*Skipped / not checked (ponytail): the actual M3/Mtrl style parents,
`values-night\` color overrides, the `font\` Uber Move font files, the `raw\`
Lottie assets, or the `menu\`/`mipmap\` resources. Did not trace which specific
RIB inflates which `home_map` layout (the `HomeMapContainerView` constructor
inflates nothing — children are attached programmatically, so the exact
home-screen layout file is **[U]**). Obfuscated interactor class names were not
de-obfuscated; only their RIB base types were read.*

*One risk to know: Uber's bottom-sheet scrim is `alpha=0` by default and faded
in by code — if you copy the layout but forget the fade logic in RN, sheets will
appear without a backdrop. Wire the backdrop opacity to the sheet open fraction
explicitly.*
