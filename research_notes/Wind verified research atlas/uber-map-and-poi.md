# Uber rider 4.655.10001 — the map POI and saved-places contract

**How this was obtained.** Not by the pooled research stream, which failed twice on this topic, and not by
JADX. The DEX string tables and class descriptors were read directly from the APK with Python
(`zipfile` plus regex over the 23 `classes*.dex` members, 186,163,396 bytes of DEX). That method yields class
names, nested types and proto field-name strings, but **not method bodies, field types or enum values**. Read
every claim below with that boundary.

**Artifact.** `com.ubercab` 4.655.10001, base APK `uber-rider__base.apk`, 207,018,879 bytes, 23 DEX.

---

## 1. The finding in one sentence

Uber's map points of interest and its saved places are **one server-driven protobuf contract**, requested per
map anchor and grouped by POI type — so "nearby pickup points", "saved addresses" and "suggested addresses"
are the same mechanism, not three.

That matters for Wind because its address workstream is currently three separate ideas (a place index, saved
places, and learning a delivery point). Uber ships them as one.

## 2. The contract, class by class

35 top-level classes plus 53 nested builders and `*OrBuilder` interfaces, in two packages:
`com.uber.maps.mapsexperiencepresentation` (the contract) and `com.uber.mapssdk.poi` (the client side).

### Requests and responses

| Class | Role |
|---|---|
| `GetMapPoisForAnchorRequest` | the query: give me POIs around this anchor |
| `GetMapPoisForAnchorResponse` | the answer |
| `PoiRequest` / `PoiRequestOrBuilder` | the per-request POI selector |
| `GetSavedPlacesRequest` / `GetSavedPlacesResponse` | the saved-place list |
| `UpsertSavedPlaceRequest` / `UpsertSavedPlaceResponse` / `UpsertSavedPlaceResponseSuccess` | create or update a saved place |
| `DeleteSavedPlaceRequest` / `DeleteSavedPlaceResponse` | remove one |

### The anchor — what the map is centred on

| Class | Role |
|---|---|
| `MobileAnchor` | the anchor sent from the phone |
| `TripDestinationAnchor` | an anchor derived from a trip destination |

Two anchor kinds is the interesting part: the same call serves "what is near me now" and "what is near where
this trip is going", which is exactly the difference between finding a pickup point and finding a drop-off.

### The POI itself

| Class | Role |
|---|---|
| `PoiGroup` / `PoiGroupOrBuilder` / `PoiGroupSuccess` | POIs are returned **grouped**, and a group can succeed independently |
| `PoiMarker` / `PoiMarkerOrBuilder` | an individual marker |
| `PoiType` | the type discriminator |
| `MarkerMetadata` | presentation data for a marker |
| `AddressFieldKey` | a key into structured address fields |
| `FulfillmentType` | how the place can be served |
| `EatsFilters` | vertical-specific filters |

`PoiGroupSuccess` existing as a separate type from `PoiGroup` is a partial-success model: some groups can
return while others fail. That is worth copying — Wind's place search is all-or-nothing today.

### Saved and suggested places, in the same contract

| Class | Role |
|---|---|
| `SavedPlace` / `SavedPlaceOrBuilder` | a place the customer kept |
| `SuggestedPlace` / `SuggestedPlaceOrBuilder` | a place the system proposes — the "learn the address" path |
| `ResidenceType` | a residence classifier, i.e. home vs other |

`SuggestedPlace` beside `SavedPlace` is the pattern Wind's "learn delivery points" idea needs: the system
proposes, the customer keeps, and both live in the same list.

### Client side

`com.uber.mapssdk.poi.POICache` and `POIService`, plus five anonymous implementation classes (`a`–`e`). So
there is a dedicated cache in front of the POI service — markers are cached, not re-fetched per frame.

## 3. What the proto field-name strings show

These lowercase identifiers appear in the DEX string tables near these types, with occurrence counts. They are
**consistent with** proto field names; they are not proof of a specific field on a specific message.

| string | count |
|---|---|
| `anchor` | 202 |
| `latitude` | 171 |
| `zoom` | 89 |
| `longitude` | 81 |
| `radius` | 67 |
| `viewport` | 40 |
| `polygon` | 22 |
| `cluster` | 13 |
| `saved_places` | 9 |
| `request_id` | 7 |
| `bbox` | 1 |

Read honestly: a POI query carries an **anchor**, a **radius** and a **viewport**, and there is a
**cluster** concept and a **request_id** for correlation. Whether radius, viewport and polygon are alternatives
or compose is **not determinable** from strings alone.

## 4. The renderer, for context

The earlier study records the selection path as `MapProvider{UBER, GOOGLE, UNKNOWN}` →
`MapFactory.create` → `UberMapFactory` / `GoogleMapFactory`, with the shipped default
`{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}`. So the POI
layer is drawn by Uber's own engine by default, with a Google fallback — and the POI contract is engine-neutral,
which is why it can be reused across both.

## 5. What Wind should take

1. **One contract, three ideas.** A POI query, the saved list and the suggested list should be one message
   family keyed by an anchor, not three features. This is the strongest structural lesson in the artifact.
2. **Two anchor kinds.** "Near me" and "near the destination" are different queries in Wind today (pickup
   search versus drop-off search) and should share one call shape.
3. **Partial success.** Model a group-level success so one failing POI category does not blank the map.
4. **`SuggestedPlace` beside `SavedPlace`.** The system proposes a learned delivery point; the customer
   promotes it. That is the shape for Wind's "learn where the handover really happened" idea, and it keeps
   consent explicit.
5. **A cache in front of the service.** `POICache` exists for a reason on a 3G network.

## 6. Boundaries — what this does not establish

- **No method bodies, signatures beyond class names, field types or enum values.** The five `PoiType` values
  and the four `EtaAccuracy` values are not recoverable by this method.
- **No runtime behaviour.** Whether the POI layer is enabled for a given city, account or experiment is
  unknown, and `[inf]` it is likely server-gated.
- **No server contract.** These are client-side generated stubs; the service behind them is unobserved.
- **Nothing about Palestine.** Uber does not operate in the West Bank; this is a structural reference only.
