# Backend services, routes and the client–server contract — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Edition:** deep pass · **Nature:** factual reference, shareable. Everything below is read from the installed package: route literals, host names, protocol classes and generated service types. No request was made to any service; nothing here is a capture of live traffic. Evidence files are listed in §11.

## 1. Transport stack, by the numbers

| Component | Classes in the package | Role |
| --- | --- | --- |
| Gson + generated adapters | 13,415 (of which 13,178 `*_GsonTypeAdapter`) | JSON serialization for the model layer |
| Thrift-generated types | 1,592 | IDL models (chiefly analytics/telemetry types, e.g. `com.uber.model.core.analytics.generated.…thrift.analytics.*`) |
| protobuf | 696 | Binary models and descriptors |
| gRPC | 369 (`io.grpc.*`) | 36 generated `*GrpcApi` service stubs |
| Retrofit | 162 | HTTP interface definitions |
| OkHttp | 63 | HTTP transport, interceptors |
| Moshi | 100 | secondary JSON binding |

Reading: **two transports coexist** — a JSON-over-HTTP call dictionary (the `rt` surface, §2) and a smaller gRPC surface (§5), with Thrift/protobuf types used where binary bodies or shared IDL models are needed. Retrofit + OkHttp are present but only 225 classes between them: most request construction is generated from the model layer rather than hand-declared interfaces.

## 2. The route surface: 1,406 path literals

The package contains **1,406 distinct path-like literals**. Of those, **1,032 are `/rt/…` product calls** (the call dictionary) and **50 are device filesystem locations** used by environment checks (`/system/xbin/su`, `/data/local/su`, `/proc/self/maps`, …) — listed separately in §8 so they are not counted as service surface. The remaining **324** are auxiliary paths (OAuth and web endpoints, CDN and static paths such as `/_static/manifests/manifest.json`) mixed with non-route artefacts (regex fragments, array indices, relative paths) — which is exactly why only the `/rt/` subset is treated as product surface here.

Route naming is uniform: `/rt/<service>/<verb-or-resource>`, kebab-case, with versions where the service numbers its interface (`v1`…`v4`) and UUID placeholders in braces (`/rt/trips/{tripUUID}/begin`). **72 literals carry placeholders** (67 with one, 5 with two or more).

### 2.1 Families (route count per first two segments)

| Family | Routes | Representative literals |
| --- | --- | --- |
| `rt/eats` | 77 | `eater/cart`, `eaters/create-draft-order`, `eaters/orders/{uuid}/receipt`, `search`, `order-estimates` |
| `rt/unused` | 68 | web-view bridge names and non-production endpoints, prefixed `rt/unused/non-production-endpoint/…` (retained literals) |
| `rt/payment` | 63 | `v3/payment-profiles`, `payment-profiles/{uuid}/deposit`, `ubercashv2/purchase`, `initialize2fa`, `finalize2fa` |
| `rt/riders` | 56 | `{riderUUID}/fare-estimate`, `{riderUUID}/create-draft-order`, `{riderUUID}/status`, `offer/accept`, `verify-device-integrity` |
| `rt/drivers` | 44 | `v2/go-online`, `v2/go-offline`, `accept-offers`, `finalize-offers`, `learning/fetch-quiz` |
| `rt/safety` | 37 | `safe-mode/activate`, `presentation/shared/canvas/get-safety-hub-data`, `womenpreference/*` |
| `rt/trips` | 27 | `{tripUUID}/begin`, `{tripUUID}/rider-cancel`, `{tripUUID}/share`, `v2/end`, `v2/generate-pickup-verification-pin` |
| `rt/users` | 25 | `get-user-info`, `v2/add-password`, `v3/verify-password`, `contacts`, `safety/usos/create-emergency` |
| `rt/payments` | 24 | wallet (`wallet/home`, `wallet/transaction-details`), onboarding flows, compliance (`payments-compliance/v2/uc/submit`) |
| `rt/safety-media-platform` | 24 | recording enrolment, live-stream sessions, public-key exchange, `sign-media-fingerprint` |
| `rt/support` | 24 | `initiate-chat`, `get-support-nodes`, `schedule-appointment`, `get-trip-receipt` |
| `rt/family` | 22 | `create-family-group`, `invite-family-members`, `get-family-policies` |
| `rt/amd-experience` | 22 | autonomous-vehicle experience: `get-av-screen`, `edit-av-pickup-location`, `provision-vehicle-device` |
| `rt/reservation` | 21 | `plan`, `predict-reservation-time`, `query-flights-list`, `{reservationUUID}/update-reservation` |
| `rt/gifting` | 21 | `get-gift-card-hub`, `purchase-gift-card`, `redeem` |
| `rt/emobility` | 20 | bikes/scooters: `booking/reserve_and_unlock`, `map_search_v2/search_zones`, `steps/get_steps` |
| `rt/transit`, `rt/business`, `rt/communications`, `rt/group-ride`, `rt/v1`, `rt/membership`, `rt/customer-obsession`, `rt/identity`, `rt/profiles`, `rt/social-profiles`, `rt/locations`, `rt/feedback`, `rt/earnerdebit`, `rt/hcv`, `rt/commute-*`, `rt/contacts`, `rt/external-rewards`, `rt/navigation`, `rt/plus`, `rt/receipts`, `rt/consumer`, `rt/devices` | 7–15 each | transit ticketing and line arrivals, business profiles, in-app messaging threads, group ride, identity/OAuth, social profiles, geocoding and place search, ratings, earner payouts, high-capacity vehicles, commute, contact sync, rewards linking, navigation route plans, membership pass, receipts, device registration |

### 2.2 The rider's own call chain (as the literals order it)

| Step | Route |
| --- | --- |
| App start / session | `/rt/session/launch`, `/rt/riders/{riderUUID}/app-launch`, `/rt/riders/me/app-launch` |
| Market and product state | `/rt/riders/evaluate-market-status`, `/rt/riders/product-configuration`, `/rt/riders/dispatchconfig` |
| Place search and pickup | `/rt/locations/v2/autocomplete`, `/rt/locations/v3/labeled`, `/rt/locations/v4/…-geocode`, `/rt/pudo-presentation-helix/maps-search`, `/rt/riders/{riderUUID}/resolve-location`, `/rt/riders/{riderUUID}/v2/pickup` |
| Price | `/rt/riders/{riderUUID}/fare-estimate`, `/rt/fares/metered-fare-estimate`, `/rt/fares/get-fare-breakdown`, `/rt/surge/batch` |
| Request | `/rt/riders/{riderUUID}/create-draft-order`, `/rt/riders/v2/get-offers`, `/rt/riders/offer/accept`, `/rt/riders/offer/ack` |
| Trip | `/rt/trips/{tripUUID}/begin`, `/rt/trips/{tripUUID}/share`, `/rt/trips/v2/start-waiting`, `/rt/trips/v2/complete-stops`, `/rt/trips/v2/end`, `/rt/trips/{tripUUID}/rider-cancel` |
| Tracking display | `/rt/riders/{riderUUID}/dispatch-view`, `/rt/riders/pre-trip-map`, `/rt/riders/map-change`, `/rt/map-feed/get-map-feed`, `/rt/riders/notify-driver-spotlight` |
| After the trip | `/rt/feedback/submit`, `/rt/receipts/v1/getreceipt`, `/rt/riders/send-trip-receipt`, `/rt/feedback/get-tip-options` |

That ordering is the app's own vocabulary for the ride lifecycle — price → request → trip → receipt — and each step is a named server call, not a REST resource tree.

## 3. Route literal shapes

| Shape | Count | Example |
| --- | --- | --- |
| Plain path, no placeholder | 1,334 | `/rt/riders/evaluate-market-status` |
| One placeholder | 67 | `/rt/trips/{tripUUID}/begin` |
| Two or more placeholders | 5 | `/rt/communications/messages/{threadId}/{fromSequenceNumber}` |
| Trailing-slash form (overlaps the rows above) | 69 | `/rt/external-rewards/get-programs/` |

## 4. The generated model contract

`com.uber.model.core.generated.*` holds 64,364 type definitions grouped by originating service domain:

| Domain | Types | Domain | Types |
| --- | --- | --- | --- |
| `edge` | 19,199 | `uid`/`rds` | 1,104 |
| `rtapi` | 15,508 | `safety` | 975 |
| `go` | 6,941 | `uconditional` | 972 |
| `rider` | 2,312 | `bindings` | 878 |
| `money` | 2,161 | `u4b` | 752 |
| `types` | 1,788 | `growth` | 650 |
| `finprod` | 1,573 | `learning` | 568 |
| `ue` | 1,289 | `ucontent`, `amd`, `mobile` | 540, 530, 436 |

The model layer is the real contract: each route is served by request/response types generated from the same IDL as the server, which is why the client carries 13,178 JSON adapters and a Thrift/protobuf subset.

## 5. The gRPC surface (36 services)

Generated stubs named `…GrpcApi`, grouped by domain: **maps 9** (`SpatialImageryGrpcApi`, `SavedPlacesGrpcApi`, `MapsUDLGrpcApi`, `WaypointAdsServiceGrpcApi`, …), **identity 6** (`DomeApiGrpcApi`, `DeviceIntelligenceGrpcApi`, `BiometricsVerificationEngineGrpcApi`, `SilentNetworkAuthenticationApi`, …), **money 2**, **marketplace 2**, **safety 2**, **u4b 2**, and one each for `consumer` (main menu presentation), `eventmapping` (scene mapping), `growth`, `mobile` (release/metro console), `platforms` (mirror service), `presentation`, `u4f`, `uflurry`, plus `edge.services.dynamite.QuerySurfaceBuilderApi` and `go.botdefenseruleenginehttp.BotdefenseRuleEngineHttpApi`.

Reading: gRPC carries **surface-specific presentation services** (maps imagery and labels, identity/device intelligence, safety, menu presentation) while the bulk of product actions ride the `rt` dictionary.

## 6. Hosts named in the package

| Host | Literals | What it is used for |
| --- | --- | --- |
| `cn-geo1.uber.com` | 126 | the primary API host in this build's geography |
| `www.uber.com` | 53 | web links, legal, help redirects |
| `tb-static.uber.com` | 33 | static assets |
| `mobile-content.uber.com` | 32 | server-driven content bundles |
| `privacy.uber.com`, `help.uber.com`, `auth.uber.com`, `payments.uber.com`, `accounts.uber.com`, `business.uber.com`, `m.uber.com`, `trip.uber.com`, `wallet.uber.com`, `partners.uber.com`, `gifts.uber.com` | 3–19 each | per-surface web properties |
| `tc2.uber.com` | 2 | **map stylesheets** (`/style/default/native`, `/style/auto/native`) — see the maps deep dive |
| `d1goeicueq33a8.cloudfront.net` and 4 other CloudFront distributions | 2–6 each | CDN-delivered assets |
| `c.paypal.com`, `accounts.google.com`, `play.google.com` | 2–7 each | payment and account integrations |

## 7. Identity and session surface

| Concern | Routes / types |
| --- | --- |
| OAuth token lifecycle | `/rt/identity/oauth2/token`, `/token`, `/sso-exchange-token`, `/invalidate-token`, `/revokesession`, `/user-id-token`, `/group-device-sessions`, `/add-sso-id`; classes in `com.ubercab.core.oauth_token_manager` |
| Silent authentication | `/rt/silent-authentication/initiate`, `/submit`; `SilentNetworkAuthenticationApi` |
| Passkeys | `/rt/webauthn-api/get-registration-options`, `/register-public-key-credential`, `/get-auth-options` |
| Device binding | `/rt/devices/upsert`, `/upsert-v2`, `/task`, `/results`, `/exemption`, `/error-handling`; exported IPC provider `com.ubercab.provider.ds` |
| Third-party SSO | exported providers `…provider.sso` and `…provider.sso.eligibility`; schemes `https` (SSO redirect), `line.1486487802`, `fb277064115737714` |
| Sign-in token artifact | `/rt/users/arch-signin-token` |

## 8. Filesystem locations found in the string set (not routes)

50 literals are device paths, used by device-integrity and runtime probes: `/system/xbin/su`, `/system/bin/su`, `/system/sd/xbin/su`, `/data/local/xbin/su`, `/system/bin/failsafe/su`, `/system/app/Superuser.apk`, `/system/etc/.installed_su_daemon/`, `/system/xbin/daemonsu/`, `/system/bin/qemu-props`, `/system/lib/libc_malloc_debug_qemu.so`, `/proc/self/maps`, `/proc/cpuinfo`, `/proc/meminfo`, `/proc/stat`, `/proc/vmstat`, `/proc/loadavg`. They are listed here so they are not mistaken for service surface — the client checks for their presence as an environment signal.

## 9. What this means for the client–server relationship

1. **The contract is a named-call dictionary, not REST.** 1,032 `/rt/…` operations, one per product action, versioned in the path where the service versions its interface.
2. **Presentation is server-driven.** Many routes end in `-presentation`, `get-…-screen`, `get-…-page`, `sdui` ("server-driven UI") — the client renders layouts described by the server: `/rt/cx-presentation/get-ucomponents`, `/rt/businesshub/get-business-hub-sdui-content`, `/rt/payments/wallet/sdui-feature`.
3. **One GraphQL endpoint** exists (`/rt/edge/graphql`) alongside the dictionary; the `edge` domain also carries 19,199 generated types.
4. **The client can name dead surface**: 68 literals are prefixed `/rt/unused/` — retained but not live product calls.

## 10. Not determined

- HTTP verb, header set, and authentication requirement per route: requires per-route code inspection; the string table gives names, not bindings. Only the identity subset (§7) is unambiguous by name.
- Rate limits, retry/timeout values and caching policy per service: not in the string set.
- Which routes the shipped build actually calls at runtime for a given screen: would require observing a live session, which this study does not do.

## 11. Evidence (archive: the current-study evidence folder under `research_notes/`)

| Claim group | Evidence file |
| --- | --- |
| 1,406 path literals, family counts, templates | `dex-api-paths.json`, `route-and-module-census.json` (produced by `dex-inventory.py` + `dex-mine.py`/`deep_summary.py`) |
| 67 templates with placeholders | `dex-path-templates.json` |
| Hosts and URL literals | `dex-urls.json` |
| Transport/library class counts, gRPC stubs, model domains | `dex-classes.txt.gz`, `route-and-module-census.json` (`grpc_api_classes`) |
| SQL and filesystem literals | `dex-sql-strings.json`, `dex-api-paths.json` |
| Identity/permission surface cross-check | `evidence-deepseek/manifest.json` |


