# KNOWLEDGE — Uber Rider API/Backend Contract Study (2026-11-02)

> **Framing.** Authorized competitive-architecture study of an app the owner is
> authorized to examine. Goal: design/engineering **patterns** for an independent
> courier app (Fastship) — **not** cloning, infringing, or attacking. Static,
> read-only analysis of a local decompile. No proprietary code or artwork is
> reproduced here; paths are cited as evidence only. Each claim is marked
> **[O]**bservation (seen in the decompile), **[I]**nference (reasoned from
> observations), or **[U]**nknown (not determinable from static analysis).
>
> **Evidence root:** `%LOCALAPPDATA%\Temp\opencode\uber\rea-full\sources\`
> (below written as `…`). Extracted by Kimi K3 (AWS Bedrock) after both Claude
> pools rate-limited; route census independently verified by direct grep:
> **1,030 unique `/rt/` literals** (matches the prior ~1,032 census).

---

## 1. Route table **[O]** — literal paths + method + interface file

All interfaces use Retrofit annotations `@retrofit2.http.{GET,POST,PUT,DELETE}("<path>")`;
every call carries `@Header("x-uber-call-uuid")`. Return type is `io.reactivex.Single<T>` (RxJava).

### Maps / location — `…\com\uber\model\core\generated\rtapi\services\location\LocationApi.java`

| Method | Path | Response model |
|---|---|---|
| GET | `/rt/locations/v2/autocomplete` *(referenced in `yua\C139748a.java`)* | — |
| GET | `/rt/locations/v2/reversegeocode` | Object |
| POST | `/rt/locations/v4/reversegeocode` | GeolocationResultsResponse |
| GET | `/rt/locations/v2/details` | GeolocationResult |
| GET/POST/DELETE | `/rt/locations/v3/labeled` (+`/all`) | GeolocationResult(s)Response |
| POST | `/rt/riders/{riderUUID}/resolve-location` | ResolveLocationResponse — `rtapi\services\marketplacerider\MarketplaceRiderApi.java` |
| POST | `/rt/riders/{riderUUID}/upload-locations` (`Accept: application/octet-stream`) | Object — same file |

### Routing / ETA / fare

| Method | Path | File |
|---|---|---|
| POST | `/rt/routing/fetch-routelines` → RoutelineResponse | `rtapi\services\routing\RoutingApi.java` |
| POST | `/rt/routing/predict-bulk` → PredictBulkResponse | same |
| POST | `/rt/riders/{riderUUID}/fare-estimate` → RidersFareEstimateResponse | `rtapi\services\pricing\PricingApi.java` |
| POST | `/rt/trips/{tripUUID}/mid-trip-fare-estimate` → MidTripFareEstimateResponse | same |
| POST | `/rt/riders/pre-trip-map` → RidersPreTripMapData | `rtapi\services\helium\HeliumApi.java` |
| POST | `/rt/map-feed/get-map-feed` | `edge\services\eats\presentation\feed\getmapfeed\MapFeedApi.java` |

### Dispatch / offers — `rtapi\services\marketplacerider\MarketplaceRiderApi.java`

| Method | Path |
|---|---|
| POST | `/rt/riders/offer/accept` · `/offer/ack` · `/offer/expire` · `/offer/reject` |
| GET | `/rt/riders/{riderUUID}/dispatch-view` (query: `region-id`, lat, lng) → Rider |
| POST | `/rt/riders/{riderUUID}/pickup` and `/v2/pickup` → PickupResponse |
| POST | `/rt/riders/{riderUUID}/create-draft-order`, `/edit-pickup-location` |
| GET | `/rt/riders/dispatchconfig` — `edge\services\dispatchconfig\DispatchConfigApi.java` |

### Trip lifecycle / rider status — `MarketplaceRiderApi.java` + `rtapi\services\trips\TripsApi.java`

| Method | Path |
|---|---|
| POST | `/rt/riders/{riderUUID}/client-status` → ClientStatusResponse |
| POST | `/rt/riders/{riderUUID}/status` → StatusResponse |
| POST | `/rt/riders/{riderUUID}/app-launch` → AppLaunchResponse |
| POST | `/rt/trips/{tripUUID}/rider-cancel` → RiderCancelResponse |
| POST | `/rt/trips/{tripUUID}/rider-set-info`, `/rider-set-interaction-types` |
| POST | `/rt/trips/{tripUUID}/rider-redispatch-sdu`, `/rider-redispatch-new-driver` |
| GET | `/rt/trips/{tripUUID}/sdu-redispatch-info` — `rtapi\services\atg\AtgApi.java` |
| POST | `/rt/trips/{tripUUID}/cancellation-info` — `rtapi\services\pool\RiderPoolApi.java` |

**[I]** Almost everything is POST — even pure reads (`status`, `fare-estimate`,
`resolve-location`). The body carries the query context; the URL only names the
resource/action. This is **RPC-over-HTTP**, not REST.

## 2. Request/response model shapes **[O]**

All models: `class X extends o30.AbstractC92830f`, annotated
`@GsonSerializable(X_GsonTypeAdapter.class)`, with a static `ADAPTER`
(protobuf-style wire adapter, field **numbers** not names), a `Builder` with
null-checks (`klc.C75130d.m240723a("requestLocation is null!")`), and a trailing
`src.C113356m unknownItems` field (forward-compat unknown-field capture).

**fare-estimate** — `rtapi\services\pricing\RidersFareEstimateResponse.java`
Fields: `uuid: FareEstimateResponseUuid` (tag 1, value-class wrapping String),
`packageVariants: ImmutableList<PackageVariant>` (14),
`vehicleViewIds`/`remainingVvids: ImmutableList<VehicleViewId>` (16/21, int32
value-classes), `productsDisplayOptions` (18), `pricingProductsListType` (19,
enum), `fareExpType` (22), `userExperiments: Map<String,FaresExperimentData>`
(23), `trace: Tracing` (24),
`shouldRefetchFaresOnClientPaymentOptionChanges: Boolean` (25),
`paymentProfileToggleSnackbarMessageString` (26),
`fareCacheTTLSettings: FareCacheSettings` (27), `homeCurrencyDisplayables` (28).

**resolve-location** — `rtapi\services\marketplacerider\ResolveLocationRequest.java`
Fields: `requestLocation: ClientRequestLocation` (**required**, enforced in
Builder), `context: ResolveLocationContext` (**required**, enum with `UNKNOWN`
default), `productsToOptimize: ImmutableList<Integer>`,
`optimizeLocation: ClientRequestLocation`, `telemetry`,
`requestNearbyLocations: Boolean`, `timestamp: TimestampInMs`,
`experimentationParams`, `faresType: String`, `productContext`.

**trip/rider status** — `rtapi\services\marketplacerider\StatusResponse.java`
Fields (tags): `clientStatus` (1, **required** —
`p30.C97279a.m249727a(clientStatus…, "clientStatus")` throws on missing),
`eyeball` (2), `city` (4), `dispatchStatus` (6), `metadata` (7), `provider` (8),
`fulfillmentStateData` (9), `scaledOffers` (10), riderAppOrders (11/12),
booleans (13/14), `riderAppOrdersFetchResult` (15). `DispatchStatus.java`
carries `eta: Integer`, `etr: Integer`,
`message/title/icon/titleIcon/waitTimeDescription: String`,
`topDriverCandidates: List<DispatchCandidate>`, `isScheduleStatus: Boolean`.

**map-feed** — request is untyped (`Map<String,Object>`) in `MapFeedApi.java`;
no generated model (edge/Eats service).

**Error-union / code-discriminator:** base error class
`…\w46\AbstractC128229d.java` — `UNKNOWN_CODE = "synthetic.unknown"`,
`isUnauthorized` flag, `mo26194a()` returns the code string. **[I]** Errors are
a sealed/union family keyed by a string code with a synthetic fallback. The
**required-field + UNKNOWN-enum-default + `unknownItems`** triple is their
forward/backward-compat pattern: *never fail on fields you don't know; always
fail on fields you require.*

## 3. Realtime **[O]**

**PushModel twin pattern:** every pushable model has a twin singleton extending
`v46.AbstractC123724r<T>`, binding model class → **string topic**. E.g.
`rtapi\services\marketplacerider\TripDriverLocationUpdateV2PushModel.java`:
`super(TripDriverLocationUpdateV2.class, "trip_driver_location_update_v2")`.
Siblings in the same dir: `DispatchStatusPushModel`, `TripEventsDataPushModel`,
`StatusResponsePushModel`, `RiderOfferPushModel`, `EyeballPushModel`,
`CityPushModel`. Listener contract:
`com\uber\presidio\realtime_push\core\PushModelListener.java`.

**Ramen gRPC envelope** — `com\ubercab\ramen\proto\RamenRequest.java` /
`RamenResponse.java` (protobuf `GeneratedMessageLite`):
- Request: `lastseen_seq_id` (1), `message_acks[]` (2: uuid +
  processingTimestamp), `feature_acks[]` (3: uuid, consumeTimestamp, background,
  consumerPlugins list), `control_msg` (4).
- Response: protobuf `oneof data { msgs=1, control_msg=2, heartbeat=3 }` with
  `DataCase` enum — the code-discriminator union pattern on the wire.
- Newer mirror in `com\uber\streaming\ramen\*` adds `Priority`,
  `ContextHeaders`, GraphQL-subscription frames.

**[I]** One long-lived stream; server pushes typed msgs by UUID+seq; client
acks per-message; `lastseen_seq_id` gives replay/resume — at-least-once with
client-side dedup, heartbeat for liveness.

## 4. Contract style **[O]**

- **Dual serializers per model:** Gson `X_GsonTypeAdapter` (JSON; string
  value-classes via `TypeSafeStringTypeAdapter`, e.g.
  `rtapi\services\riders\UUID_GsonTypeAdapter.java`) **and** a protobuf-style
  `ADAPTER` with numbered fields. The `Accept: application/octet-stream`
  endpoints (`resolve-location`, `upload-locations`) take/return binary wire
  format; the rest JSON.
- **In-path versioning, per-endpoint, side-by-side:** `/v2/reversegeocode`
  (GET) + `/v4/reversegeocode` (POST), `/v3/labeled`, `/pickup` + `/v2/pickup`,
  `/rt/trips/...` + `/rt/trips/v2/...` (driver API), and
  `/rt/riders/v2/{id}/select-payment-profile` (v2 *before* the id segment).
  Old versions stay live.
- **`x-uber-call-uuid`** on every call — client-generated idempotency/tracing key.
- **Base error** `w46.AbstractC128229d` with string code + `synthetic.unknown`
  fallback.

## 5. Offline/caching hints **[O]**

- `rtapi\services\pricing\FareCacheSettings.java`: `serverTime: TimestampInSec`,
  `validUntilEpoch: TimestampInSec`, `pickupHexResolution`,
  `dropoffHexResolution` — server-pushed **TTL + H3-hex-bucketed cache keys**
  for fares (cache a fare per pickup/dropoff hex, reuse until `validUntilEpoch`).
- `RidersFareEstimateResponse.shouldRefetchFaresOnClientPaymentOptionChanges` —
  server dictates client cache-invalidation triggers.
- Ramen `lastseen_seq_id` resume = last-known-good stream state; `unknownItems`
  on every model = safe to persist old blobs.
- **[U]** No explicit "last-known-good" UI flag observed; FareCacheSettings is
  the concrete offline primitive.

## 6. Adopt vs skip for Fastship

Fastship today: hand-rolled `route('GET'|'POST', '/api/...')` in
`server\main.ts`; domain modules
`server\domain\{dispatch,quotes,ride-lifecycle,routing-status,realtime,google-routing}.ts`;
client `src\api.ts` (`api()` + `useApi` polling + `useLiveFix` long-poll with
`since=` cursor and terminal-code stop).

| Pattern from Uber | Verdict | Where / why |
|---|---|---|
| String error-code union with `synthetic.unknown` fallback (`w46.d`) | **ADOPT** | Matches Fastship's existing `errorCode()`/terminal codes in `src\api.ts` — formalize as one server-side `ApiError` base with a code + unknown fallback. Already ~80% there. |
| Client-generated request UUID on every mutating call (`x-uber-call-uuid`) | **ADOPT** | Cheap idempotency for `POST /api/orders`, `/api/jobs`, `/api/location` retries on cellular. One header + unique index. |
| Ramen envelope: `oneof {msgs, control, heartbeat}` + `lastseen_seq_id` + per-message ack | **ADOPT (shape only, over long-poll)** | `useLiveFix` already does `?since=` — extend the answer to `{msgs[], heartbeat, control}` instead of a bare fix, and let `server\domain\realtime.ts` hold the cursor. Skip gRPC; keep fetch. |
| PushModel = `(model class, "topic_string")` singleton | **ADOPT (as TS record)** | One `const topics = { driver_fix: DriverFix, dispatch_status: DispatchStatus }` map in `server\domain\realtime.ts`; same decoupling, no codegen. |
| Server-pushed TTL cache (`FareCacheSettings`: validUntil + hex-bucket keys) | **ADOPT** | Directly applicable to `/api/price` + `server\domain\quotes.ts` — return `validUntil` and key quotes by pickup/dropoff cell so the app stops re-quoting on remount. Aligns with the existing "billable endpoints load once" comment in `src\api.ts`. |
| Required-field Builder checks + tolerate unknown fields | **ADOPT** | Validate required fields at the trust boundary in `server\domain\*` (already partially done); ignore unknown JSON keys on ingest. |
| In-path versioning, old versions left live (`/v2/pickup`) | **ADOPT when needed** | Keep `/api/price`, add `/api/v2/price` only at a breaking change. Don't pre-version. |
| Dual wire format (protobuf + JSON) | **SKIP** | JSON is fine at Fastship scale. |
| RxJava `Single` + Retrofit interface codegen | **SKIP** | Java-only artifact; Fastship's `api()` fetch wrapper already does the job. |
| Everything-is-POST RPC style | **SKIP (mostly)** | Fastship's GET-with-query reads (`/api/route`, `/api/orders`) are cacheable and simpler. POST-for-reads only if a body gets big (e.g. bulk quote). |
| `offer/accept\|ack\|expire\|reject` verb set for dispatch | **ADOPT (as endpoints)** | Map to `server\domain\dispatch.ts`: `POST /api/offers/{id}/accept\|ack\|expire\|reject` — explicit offer lifecycle beats implicit state flips. |
| `resolve-location` single endpoint (location + context + productsToOptimize in, canonical place out) | **ADOPT (concept)** | One `/api/location/resolve` that takes lat/lng + context and returns the canonical pickup point — instead of geocode logic spread across client screens. |
| Fare-split family of 4 endpoints | **SKIP** | Not in Fastship's scope. |
| UnknownItems forward-compat blob | **SKIP** | TypeScript can just ignore extra JSON keys; no need for a dedicated container. |

---

*Skipped checks: response shapes of `Autocomplete` and `MapFeed` (edge services,
untyped `Map<String,Object>` bodies — nothing generated to cite); whether
`accept/ack/expire/reject` are idempotent server-side (unknowable from client
code). Risk to know: paths/models are from one app version — treat versioning
and header conventions as the durable patterns, not any single literal path.*
