# Functional and non-functional requirements, reconstructed — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Edition:** deep pass · **Nature:** shareable reference. **These are not the vendor's requirement documents.** They are requirements *reconstructed from the shipped product*: every statement is inferable from a route, screen, store, parameter or permission that exists in the package, and each row cites where. Where the package cannot answer a requirement, the row says so instead of guessing. Evidence index: §6.

How each requirement was derived: a *capability* is claimed only when at least two independent traces agree (for example a route literal plus a screen or a store), and a *default value* is claimed only when it appears in the shipped parameter registry (`assets/parameters.json`, 14,516 entries; the registry is documented in the architecture document §6).

## 1. Product scope, as the package defines it

The build is not "a ride-hailing app with extras". Its own route dictionary, parameter namespaces and screens describe: ride hailing (with 8 vehicle families), scheduled/reserved trips, hourly rentals, intercity/travel and air, Eats delivery, groceries-style shopping, transit ticketing, shared bikes/scooters, group ride with fare split, family accounts with teen supervision, business/employee travel (U4B), a membership pass, gifting, autonomous-vehicle service, high-capacity vehicles (HCV/van), and a driver-side surface embedded for onboarding and earning. That is the scope a requirement set has to cover.

## 2. Functional requirements (reconstructed), by area

| # | Requirement (the app must…) | Client evidence | Defaults / parameters |
| --- | --- | --- | --- |
| F1 | Sign a user in and keep the session alive across launches, devices and SSO providers | `/rt/session/launch`, `/rt/identity/oauth2/{token,sso-exchange-token,revoke-session,user-id-token}`, `/rt/silent-authentication/*`, `/rt/webauthn-api/*`, `IdTokenStore`, `SessionCookieStore`, providers `…provider.ds`, `…provider.sso` | silent-authentication namespace present |
| F2 | Establish identity strength appropriate to the action (phone, password, passkey, document, selfie) | `/rt/users/v2/add-password`, `/v3/verify-password`, `/rt/identity-verification/*`, `/rt/onboarding/documents`, `/rt/riskchallenges/*`, identity-capture screens and Lottie guides | — |
| F3 | Discover a place and a pickup point, including venue/airport access points | `/rt/locations/v2/autocomplete`, `/v3/labeled`, `/v4/…-geocode`, `/rt/pudo-presentation-helix/{maps-search,text-search}`, `/rt/pickups-dropoffs/wayfinding-instructions`, accessibility labels in `com.uber.maps.presentation.AccessPoint*` | — |
| F4 | Price a trip before ordering, and explain the price afterwards | `/rt/riders/{riderUUID}/fare-estimate`, `/rt/fares/{metered-fare-estimate,get-fare-breakdown}`, `/rt/surge/batch`, `/rt/transparent-fare-breakdown/*` | surge models generated client-side (`AffineSurge`) |
| F5 | Place, modify and cancel a request, with dispatch feedback | `/rt/riders/{riderUUID}/create-draft-order`, `/rt/riders/v2/get-offers`, `/rt/riders/offer/{accept,ack,reject,expire}`, `/rt/riders/{riderUUID}/dispatch-view`, `/rt/trips/{tripUUID}/rider-cancel` | — |
| F6 | Run the trip: start, wait, waypoints, stops, end, re-dispatch | `/rt/trips/{tripUUID}/begin`, `/rt/trips/v2/{start-waiting,complete-stops,end,generate-pickup-verification-pin}`, `/rt/trips/update-waypoint-order`, `/rt/trips/{tripUUID}/rider-redispatch-*` | — |
| F7 | Show a live map of driver and trip with traffic, route and ETA, on both the pre-trip and in-trip screens | map deep dive: `UberMapView`, camera/tile/label stack; `/rt/riders/pre-trip-map`, `/rt/riders/map-change`, `/rt/map-feed/get-map-feed`, `/rt/routing/{fetch-routelines,predict-bulk}`, `/rt/riders/notify-driver-spotlight` | map tunables: frame rate, tile caches, style URLs |
| F8 | Navigate and share the trip | `/rt/navigation/{create-route-plan,navigate,route-preview,inject-route-id}`, navigation package `com.ubercab.android.nav` with `NavigationParameters` (229) and `XplorerGeneratedParameters` (117); `/rt/trips/{tripUUID}/share`, `/rt/sharetrip/fetch` | — |
| F9 | Pay: wallets, cards, cash, 2FA, tips, receipts, refunds, expense codes | `/rt/payment/v3/payment-profiles*`, `/rt/payment/{initialize2fa,finalize2fa,update2fa}`, `/rt/feedback/get-tip-options`, `/rt/receipts/v1/*`, `/rt/expensecodes/v2/*`, `/rt/payment/cash/qr/generate` | payment-method presentation services |
| F10 | Keep the user safe: contacts, SOS, ride check, audio/video recording, live stream, safety hub, women-preference, service animals | `/rt/safety/*` (37 routes), `/rt/safety-media-platform/*` (24), `/rt/users/safety/usos/create-emergency`, `/rt/safety-ride-check/*`, `safety_hub` canvas routes | `audio_recording_mobile` 494 params |
| F11 | Report, rate and get support | `/rt/feedback/*`, `/rt/incidents/*`, `/rt/support/*` (24), `/rt/customer-obsession/*`, bug report routes, `BugReporterActivity` | `ReporterParameters` 269 total |
| F12 | Receive notifications and messages in-app, by push and by SMS/WhatsApp handoff | FCM receiver, `POST_NOTIFICATIONS`, `/rt/notifier/device-tokens`, `/rt/communications/*` (15) incl. thread messaging, `com.whatsapp.otp.OTP_RETRIEVED` receivers | geofence arrivals (`GeofenceBroadcastReceiver` V3/V4) |
| F13 | Handle scheduled, reserved, hourly and intercity travel | `/rt/reservation/*` (21), `/rt/hourly-rentals/*`, `/rt/intercity-*` (5 route groups), `/rt/scheduled-rides` parameter namespace (307) | — |
| F14 | Deliver food and shop: cart, draft order, checkout, tips, issues, receipts | `/rt/eats/*` (77): `eater/cart`, `eaters/create-draft-order`, `checkout-mobile-presentation`, `orders/{uuid}/receipt`, `fulfillment-issues/ack`; `/rt/shopping-service/*` | — |
| F15 | Sell and validate transit tickets and show arrivals | `/rt/transit/*` (15), Masabi JustRide screens, `assets/*.justrideconfig` (production and UAT configs for two US deployments) | — |
| F16 | Offer shared bikes/scooters and their zones | `/rt/emobility/*` (20) incl. `map_search_v2/search_zones`, `booking/reserve_and_unlock` | emobility zoom/radius defaults (17, 40 m, 3000 m) |
| F17 | Support group accounts: family, teens, group ride with fare split, business profiles | `/rt/family/*` (22), `/rt/group-ride/*` (15), `/rt/riders/{riderUUID}/*fare-split*`, `/rt/business/*`, `/rt/u4b/*` | `teens_mobile` 234 params |
| F18 | Run a membership and rewards program | `/rt/membership/*` (14), `/rt/plus/pass/*`, `/rt/subscriptions/*`, `/rt/gifting/*` (21), `/rt/riderReferral/*`, `/rt/promotion` namespace | `membership_mobile` 328 params |
| F19 | Operate an autonomous-vehicle experience | `/rt/amd-experience/*` (22), `AvServiceAreaGeofenceStore`, AV map layers | `autonomous_mobile` 259 params |
| F20 | Support high-capacity vehicles (van/HCV) with routes and departures | `/rt/hcv/*` (8), `/rt/shifts/*` | — |
| F21 | Respect consent and privacy choices, and let the user manage them | `/rt/consent/get-consent-screens`, `/rt/consent/set-consent`, `/rt/privacypresentation/*`, `/rt/conversion-value-management/is-data-sharing-allowed-v2`, privacy center screens | consent state stored in the analytics transport schema (`consent_settings`) |
| F22 | Keep the device and account trustworthy | `/rt/riders/verify-device-integrity`, `/rt/devices/*`, `/rt/risk/*`, `/rt/riskchallenges/*`, integrity probes, security engine (`libse`), screenshot blocker | — |
| F23 | Work offline or degraded: cached home, cached trip, queued diagnostics | `HomeScreenDataStore`, `UComponentDataStore`, `TripNotificationPermissionModalDataStore`, `SqliteUberMessageStore`, map tile cache, `#/rt/health` route | location cache-serve interval 1000 ms |
| F24 | Personalise: home layout, quick access, saved places, favourite drivers, profiles | `/rt/cx/homescreen/get-homescreen-layout`, `/rt/cx/homescreen/get-accelerators-v2`, `/rt/riders/{riderUUID}/favorite-drivers`, `/rt/mapssdk.places` saved places, `SavedPlacesGrpcApi` | `cx_mobile` 501 params |
| F25 | Show ads and sponsored placements where the product does | `/rt/ads/v1/track-event`, `/rt/ads-platform/process-rider-ads-events`, `com.uber.ads.*` config/dedup stores, `WaypointAdsServiceGrpcApi` | — |
| F26 | Run on-device ML where needed (document/selfie quality, scanning) | `libtensorflowlite_jni.so` (280 exports), `libml-imageproc.so` (301), ML Kit in the barcode split, 20 TensorFlow classes | `uberai_mobile` 265 params |
| F27 | Provide an in-app voice/video call path | VoIP feature module (170 classes, `RECORD_AUDIO`), `VoipV2CallActivity`, `VideoCallActivity`, `microphone|location|dataSync` foreground service | Twilio confined to the module |
| F28 | Let internal users inspect and alter behaviour for debugging | `uber_performance_debug` scheme, GraphQL debugger store, `server-driven-previewer-service` routes, parameter-override screen (see full reference §12 — no impact established) | — |

## 3. Non-functional requirements (reconstructed)

| # | Area | Requirement as the package states it | Evidence |
| --- | --- | --- | --- |
| N1 | Startup time | Cold start must stay interactive while the home surface is assembled server-side — hence a "lazy main" path and warm-launch identity | `com.ubercab.lazy_main.data.NavGridDataStore`, `WarmLaunchIdStore`, `/__cnhealth?t=prewarm` literal |
| N2 | Rendering performance | Map rendering is frame-budgeted and tunable per device | `mapdisplay_flipr_frame_rate` (0 = follow display), `setTargetDisplayRefreshRate`, `setHandlerBasedRenderingEnabled`, `render_frame_allocator_capacity` 10,485,760 B |
| N3 | Memory discipline | Map tile/glyph/sprite memory is capped and caches bounded | overlay cache 24, tile-query cache 131,072, `reduce_collision_tile_allocations` flag, `onLowMemory` handling in map/adapter views |
| N4 | Network efficiency | Map data is cached on disk; styles are fetched once per variant; place search is server-side rather than on-device | `DiskCacheClient*`, style URLs (`…stylesheets`), `/rt/locations/*` |
| N5 | Battery and location cost | No background-location permission; location work only in foreground services; cadence is tunable | manifest (foreground-only), `FOREGROUND_SERVICE_LOCATION`, `location_optimization_*_cache_serve_interval_ms`, `critical_pool_location_thread_count` |
| N6 | Privacy by default | No third-party analytics/attribution SDK in base; consent gates data-sharing features; backup disabled | class census (0 vendor analytics), consent routes, `allowBackup="false"` |
| N7 | Security posture | Device integrity is checked before high-value actions; crypto is first-party over an open-source library; IPC surface validates callers | integrity routes, `libse`/`libse_loader`, exported providers validating callers, screenshot blocker |
| N8 | Configuration without release | 14,516 parameters (7,258 boolean, 3,372 plugin switches) let behaviour change per launch | parameter registry; `FEATURE_FLAG` 5,467, `BUG_FIX` 1,517 |
| N9 | Localisation | All user-visible text is resource-based; locales ship as separate splits; localisation can be updated dynamically | 15,380 base strings, language split present, `/rt/v1/i18n/rosettadynamic/getLocalizationUpdates` |
| N10 | Accessibility | Accessibility settings are server-presented and stored per user; map has semantic labels for access points | `/rt/safety/presentation/shared/accessibilitySettings/{get,update}AccessibilitySettings`, `AccessPointLabels.SemanticLabels`, `values-ldrtl` |
| N11 | Reliability of the reviewable surface | Critical flows have dedicated error/failure routes (offer expiry, waypoint failure, device error handling) rather than a single generic error path | `/rt/riders/offer/expire`, `/rt/trip/v2/fail-waypoint`, `/rt/devices/error-handling`, `/rt/apps/ack`+`nack` |
| N12 | Observability | Diagnostics are first-party, queued locally and parameterised | `ReporterParameters`/`ReporterConfigurationParameters` (269), `SqliteUberMessageStore`, `libndk-crash`/`libndk-anr` |
| N13 | Install and update discipline | Feature code ships as separate modules; forced-upgrade gate exists; app links are verified | 10-APK delivery, `ForceUpgradeActivity`, 38 `autoVerify` filters |
| N14 | Compatibility | Android 10+ (minSdk 29) to Android 16 (targetSdk 36), arm64 plus density/language splits | manifest, split set |
| N15 | Moderation and abuse handling | Report/block flows and risk challenges exist as product surfaces | `/rt/incidents/ugcreport`, `/rt/social-profiles/submit-report`, `/rt/riskchallenges/checkchallengeconditions` |

## 4. Traceability: requirement → implementation → evidence

| Requirement | Implementation anchor | Evidence file |
| --- | --- | --- |
| F7 (live map) | `UberMapView` / `UberGLRenderer` / tile+glyph+label buckets | `map-stack.json`, `exp-libubermaps-gl.json`, maps deep dive §2–§7 |
| F9 (pay) | payment profile routes + Braintree/Adyen client classes (219/57) | `dex-api-paths.json`, `sdk-braintree.json`, `sdk-adyen.json` |
| F10 (safety media) | recording + live-stream routes, media signing | `dex-api-paths.json` (`rt/safety-media-platform/*`) |
| F13 (reservations) | reservation routes + `ReserveParametersV2` (115) | `dex-api-paths.json`, `parameters-registry-summary.json` |
| F23 (offline) | stores + caches | `persistence.json`, `map-stack.json` |
| N5 (battery) | foreground-only location + cache-serve interval | `evidence-deepseek/manifest.json`, `parameters-registry-summary.json` |
| N8 (config) | 14,516-parameter registry | `parameters-registry-summary.json` |
| N12 (observability) | reporter parameters + native crash/ANR libraries | `parameters-registry-summary.json`, `exp2-libndk-crash.json` |

## 5. What a real specification would still need

- Business rules per requirement (pricing formulas beyond the client's own fare model, eligibility checks, cancellation windows): server-side, not in the package.
- Numeric service levels for N1–N4: the package gives the knobs, not the targets.
- Role/permission matrices for F17/F18 (family organizer, business admin): partially visible in routes, not in defaults.

## 6. Evidence (archive: the current-study evidence folder under `research_notes/`)

| Claim group | Evidence file |
| --- | --- |
| Route literals per area | `dex-api-paths.json` |
| Screen and store anchors | `screens.json`, `persistence.json` |
| Parameter counts, namespaces, named defaults | `parameters-registry-summary.json` |
| Library/vendor class counts | `dex-classes.txt.gz` |
| Manifest permissions, components, backup flag | `evidence-deepseek/manifest.json` |
| Native library identities used by F26/N7/N12 | `exp-*.json`, `exp2-*.json`, `elf-sections-summary.json` |


