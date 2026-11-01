# Screens, navigation and design system — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Edition:** deep pass · **Nature:** factual reference, shareable. Counts come from the package's class tables and resource table; screen names are class names as shipped. No screen was operated during this pass. Evidence: §9.

## 1. How a screen is built here

Four layers are visible in the names:

| Layer | Kind | Count (class definitions) |
| --- | --- | --- |
| Screen containers (activities) | `*Activity` classes | 49 |
| Screen fragments/views | `*Fragment` classes | 65 |
| RIB triples per screen scope | `*Router` / `*Interactor` / `*Builder` | 2,947 classes contain `Router`; 839 `*Interactor`; 15,001 `*Builder` |
| Design-system widgets | `com.ubercab.ui.*` | 1,472 classes (1,274 in `ui.core`) |

The root chain is explicit: the launcher activity `com.ubercab.presidio.app.core.root.RootActivity` (manifest-declared, App Link host set) hosts `com.ubercab.presidio.core.PresidioActivity`, and RIB screens are hosted by `com.uber.rib.core.RibActivity` / `CoreAppCompatActivity`. Feature screens are RIB scopes under `com.ubercab.presidio.app.optional.root.main.*` — for example the trip details scope `…optional.root.main.ride.trip.trip_details.driver_reassurance.snackbar…` appears down to the snackbar's own store, which shows how deep the per-screen ownership goes.

## 2. The activity inventory (49)

| Group | Activities |
| --- | --- |
| App shell | `RootActivity`, `PresidioActivity`, `RibActivity`, `CoreAppCompatActivity` |
| Web content | `WebViewActivity`, `AlternateLaunchWebActivity`, `UberPayWebAuthorizationActivity`, `Healthline` web actions |
| Identity and session | `USLActivity`, `AppLinkActivity`, `AccountSecurityActivity`, `silent-authentication` flows via the identity module |
| Payments | `PaypalConnectActivity`, `VenmoConnectActivity`, `CustomTabSwitchManagerActivity`, `CustomTabSwitchListenerActivity`, Adyen `ChallengeActivity` (3-D Secure), `atd.bb.ChallengeActivity` |
| Voice and video | `VoipV2CallActivity`, `VideoCallActivity`, `ProjectedNarrationActivity` (glasses narration) |
| Safety and identity capture | document/selfie capture flows (`identity_verification` module), `rg_uploader_*` animation set |
| Transit | Masabi JustRide: `TicketActivity`, `TicketInfoActivity`, `UniversalTicketActivity`, `BaseContainerActivity` |
| Diagnostics | `BugReporterActivity`, `DragonCrawlActivity`, `AutoBugReporterActivity`, `MuberEmbeddedActivity` |
| Upgrade gates | `ForceUpgradeActivity`, `EmployeeUpgradeActivity` |
| Platform-special | `RiderOrderIOSLiveActivity`, `RiderTripIOSLiveActivity` (live-activity presentation models), embedded/tablet surfaces |

## 3. Navigation surface

| Mechanism | Count / content |
| --- | --- |
| Intent filters | 89 in total; 72 on the 26 exported components; 38 with `autoVerify=true` (App Links) |
| Deep-link hosts | 35 distinct host values (31 literal — `m.uber.com`, `trip.uber.com`, `auth.uber.com`, `wallet.uber.com`, `partners.uber.com`, `rides.sng.link`, `ocie.app.link`, … — plus 4 string-resource references) |
| Deep-link schemes | 23 distinct scheme values (17 literal — `uber`, `com.ubercab`, `geo`, `tel`, `sms`, `https`, `uber_performance_debug`, `uber-wisdom-bugreport`, `adyen3ds2`, `braintree-paypal-connect.com.ubercab`, … — plus 6 string-resource references) |
| Share targets | share-to-ride and Eats-fallback aliases; `com.whatsapp.otp.OTP_RETRIEVED` receivers for OTP autofill |
| Root activity filters | the launcher activity carries the majority of the 89 filters |

Navigation inside the app is RIB router work (each scope attaches children as views), so the "screens" are not a global navigation graph but a tree of independently attachable scopes.

## 4. Design system

| Element | What ships |
| --- | --- |
| Theme family | `AmberBaseTheme`, `AmberThemeLight`, `AmberThemeDark`, plus `AITheme*`, `AppTheme` (2,468 `style` resources in total) |
| Widget library | `com.ubercab.ui.core` 1,274 classes; `ui.commons` 127; `ui.bottomsheet` 14; `ui.card` 12; `ui.collection` 6 — including `Button`, `CircleImageView`, `FloatingLabelEditText`, `FloatingLabelElement`, `AutoCompleteEditText`, base modal view |
| Map design language | `com.uber.maps.mapsudl` 99 classes ("UDL" = the design-language layer for map elements) |
| Waypoint/ad presentation | `com.uber.maps.wasp` 51 classes |
| Layouts | 2,823 `layout` resources — screen skeletons and reusable parts (e.g. `fragment_trip`, `hourly_on_trip_details_v2`, `intercity_home_view`, `fullscreen_map_search_view`) |
| Map-specific layouts | marker content variants: `base_map_marker_content_{icon,title,subtitle,leading_custom_view}`, `callout_map_marker_view`, `callout_map_marker_view_v2`, `fixed_map_marker_view`, `floating_label_map_marker_view`, `bike_safety_tooltip`, `av_trip_status_tracker_view` |
| Drawables | 6,659 — the largest visual asset pool (icons, marker shapes, illustrations) |
| Motion | Lottie 149 classes + ~111 animation documents in `assets/` (e.g. `safety-shield-animation.json`, `celebration-animation-lottie.json`, `trip_tracker_map_loop.json`, document-scan and selfie-verification sequences); 82 `anim` + 50 `animator` + 19 `interpolator` resources for property animation |
| Type and spacing | 3,432 `dimen`, 11 `font`, 2,779 `color`, 3,132 `attr` resources — the design tokens are resource-level, not a separate token file |
| Density and locale | 35 base `values-*` qualifier tables (density, night, orientation, API level) and no locale tables in base; locales arrive in language splits |

Reading: the design system is **resource-first** (themes, dimens, styles, drawables) with a large Kotlin/Java widget library on top (`com.ubercab.ui.core`), and the map has its own design-language layer (`mapsudl`) rather than reusing the app's widget vocabulary.

## 5. Screen-level composition patterns visible in the code names

| Pattern | Example evidence |
| --- | --- |
| Server-driven sections | `get-ucomponents`, `UComponentDataStore`, `ViewComponentStore`, `WidgetStore`, `HomeScreenDataStore` — the home screen is assembled from server-described components |
| Bottom sheets as first-class screens | `ui.bottomsheet` module, `BaseModalView` |
| Screen-scoped state stores | one `*Store` or `*DataStore` per screen concern (tooltip impressions, carousel state, notification-permission modal) |
| Presentation "canvas" screens | safety hub canvas (`get-safety-canvas-list-view`, `get-safety-hub-data`), main-menu presentation (`MainMenuPresentationGrpcApi`) |
| Map-first screens | `fullscreen_map_search_view`, `carrental_map_view`, `pre-trip-map`, `map-feed` |

## 6. Accessibility, localisation and layout adaptation

- Accessibility affordances are present as content-description resources and TalkBack-compatible widget types; a count of accessible labels is **not determined** (would need per-layout attribute reads).
- Localisation: all user-visible strings are resources (15,380 in base default locale), localised through language splits; the Arabic split is present in the studied delivery, and the string set includes right-to-left layout qualifier tables (`values-ldrtl`).
- Layout adaptation: 35 qualifier tables cover night mode, orientation, size class (`sw300dp`…`sw720dp`), density, watch, and API levels 30–35.

## 7. Not determined

- The runtime navigation graph (which screen leads to which) — needs interaction; the RIB tree is statically visible but attachment order is runtime behaviour.
- Which of the 2,823 layouts belong to live screens versus web-view helpers and library components.
- Visual design tokens as values (spacing scale, type ramp) — they are resource values, not summarised here.

## 8. Reading in one line

89 intent filters and 35 link hosts make the **deep-link surface** the app's real external entry point; internally, screens are RIB scopes with their own stores, drawn from a 1,400-class widget library and a 47,601-entry resource pool, with motion (Lottie) and map-specific layouts as first-class design elements.

## 9. Evidence (archive: the current-study evidence folder under `research_notes/`)

| Claim group | Evidence file |
| --- | --- |
| Activity/fragment/screen inventories | `screens.json`, `dex-classes.txt.gz` |
| RIB counts and scope names | `ribs.json`, `dex-classes.txt.gz` |
| Design-system class counts and module split | `design-system.json`, `route-and-module-census.json` |
| Resource counts by type (22 types, 47,601 entries) and name samples | `res-type-census.json` (produced from the package's resource table; the census keeps the first 400 names per type) |
| Intent filters, hosts, schemes, exported components | `evidence-deepseek/manifest.json` |
| Lottie/asset animation documents | ZIP entry listing captured in `dex-inventory-summary.json` run notes and the `assets` inventory |


