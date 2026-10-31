# Data, storage and persistence — rider app `com.ubercab` 4.654.10002

**Compiled:** 31 October 2026 · **Edition:** deep pass · **Nature:** factual reference, shareable. Everything is read from the package: class inventories, SQL literals present in the code, and the storage-related classes named below. No database was opened; nothing here describes another user's data. Evidence: §8.

## 1. The shape of persistence in one line

The app persists almost everything through **typed key-value stores** (about 45 first-party `*Store`/`*DataStore` classes plus 148 classes of the Jetpack DataStore library), and leans on **SQLite only where a library supplies it** (WorkManager, the Google analytics transport, the reporting queue) plus a small SQLDelight usage. There is no single application database; storage is a distributed set of small, feature-owned stores.

## 2. Storage mechanisms actually present

| Mechanism | Evidence in the package | Scale |
| --- | --- | --- |
| First-party key-value store | `com.uber.keyvaluestore.core.KeyValueStore`, `SimpleKeyValueStore`; `com.uber.simplestore.{SimpleStore, PrimitiveSimpleStore, SimpleProtoStore, RxSimpleStore}` with `Version`/`RefCounted` support | 11 `com.uber.simplestore.*` classes + key-value store core |
| TTL key-value store | `com.uber.nv_utils.keyvaluettlstore.KeyValueTTLStore` | — |
| Jetpack DataStore | `androidx.datastore.*` | 148 classes |
| SQLDelight | `app.cash.sqldelight.*` (drivers, `Query`, `QueryResult`, transactions) | 12 classes |
| Room | `androidx.room`/support SQLite helper types | 7 classes |
| SQLite (library-owned) | WorkManager `WorkDatabase` with 7 DAOs and 7 tables; Google datatransport `SQLiteEventStore`; `SqliteUberMessageStore` for the reporter | 482 SQL literals in the string set |
| Android SharedPreferences | `androidx.preference` usage only (table `Preference(key, long_value)`) | 2 classes |
| Files | 12 unexported `FileProvider` authorities for feature-local files (help, documents, chat composer, statements, tax documents, APK download, web views) | — |
| Map tile/glyph disk cache | `DiskCacheClient`, `DiskCacheClientSyncStorageImpl`, `DiskCacheDelegate`; `SparseIndexedQuadTreeStore` indexes collision/polygon data | 7 cache classes |

## 3. Who owns which store (selection, all first-party)

| Store | Serialized content it names |
| --- | --- |
| `com.uber.keyvaluestore.core.KeyValueStore` / `SimpleKeyValueStore` | generic typed key-value base |
| `com.uber.simplestore.proto.SimpleProtoStore` | protobuf values in a key-value store |
| `com.uber.identity.oauth.id_token.store.IdTokenStore` | the identity token |
| `com.uber.app.session.cookie.core.SessionCookieStore` | session cookies |
| `com.uber.prelude.kv_store.HubItemImpressionStore` | home-hub impression counters |
| `com.uber.ftux.core.store.HelixFTUXImpressionStore` | first-run tour impressions |
| `com.uber.new_user_tour.restart.store.NewUserTourRestartStore` | onboarding restart state |
| `com.uber.homescreencontainer.core.cache.HomeScreenDataStore` | cached home layout |
| `com.uber.core.data.UComponentDataStore` | server-driven UI components |
| `com.uber.helios.graphql_debugger.store.GQLRequestRecordStore` | recorded GraphQL requests (debug surface) |
| `com.uber.ml.core.michelangelo.MichelangeloSimpleStore` | ML model metadata/handles |
| `com.uber.ads.foundation.config.ConfigStore`, `…processor.dedup.DedupStore` | ad config and de-duplication state |
| `com.uber.uflurry.v2.protos.model.KeyValue` | generic U-Flurry KV model |
| `com.uber.travel.itinerary_store.ItineraryInfoStore` | itinerary cache |
| `com.uber.ringcomponent.carousel_state.RingTripStateStore` | in-trip carousel state |
| `com.uber.messagingshared.tripcache.warmlaunchid.store.WarmLaunchIdStore` | warm-launch identifier |
| `com.ubercab.learning_data_store.unskippable.LearningHubTopicStore` | learning-centre progress |
| `com.ubercab.hub_navigation.grid.…NavItemTooltipImpressionStore` | tooltip impressions |
| `com.ubercab.messagingshared…`, `com.ubercab.presidio.premium.preferences.PremiumPreferences` | messaging cache, premium prefs |
| `com.uber.reporter.sdk.disk.sqlite.SqliteUberMessageStore` | queued diagnostic messages (SQLite) |
| `com.ubercab.android.map.collision.source.indexedquadtree.SparseIndexedQuadTreeStore` | spatial index for map label/feature collision |

Reading: stores are **scoped to the feature that owns them** (identity token, session cookie, hub impressions, tour state, home layout, ads, ML, map collision index), each with its own key space and lifetime — consistent with the RIB scope model in the architecture document.

## 4. The SQL that ships, and what it belongs to

The 482 SQL literals in the package resolve to library schemas, not to a product database:

| Owner | Tables |
| --- | --- |
| WorkManager | `WorkSpec`, `WorkTag`, `Dependency`, `WorkName`, `WorkProgress`, `SystemIdInfo`, `Preference` (with a migration creating `_new_SystemIdInfo`) |
| Google analytics transport | `events`, `events_snapshot`, `apps`, `app2`, `raw_events`, `blobs`, `queue`, `audience_filter_values`, `conditional_properties`, `consent_settings`, `default_event_params`, `event_filters`, `main_event_params`, `property_filters` |
| ExoPlayer | `ExoPlayerVersions` |
| AndroidX preference | `Preference` |

Two readings follow. First, **no Uber-owned relational schema is visible in the string set** — the product's own data lives in the typed stores of §3, not in SQL. Second, the only SQL that exists is library infrastructure that arrives with the libraries, with the single exception of the reporter's message queue (`SqliteUberMessageStore`).

## 5. Caching behaviour and tunables

| Concern | Mechanism / parameter |
| --- | --- |
| Map tiles and overlays | on-disk tile cache with a tunable namespace (`mapdisplay_flipr_ubm2_disk_cache_namespace`), overlay cache 24 entries, tile-query cache 131,072 entries, per-frame allocator 10,485,760 bytes |
| Map styles | remote stylesheet URL (`mapdisplay_flipr_stylesheet_path`, `…satellite_stylesheet`, `…auto_stylesheet`), so style changes do not need a release |
| Location serving | `driving_mobile.location_optimization_courier_mobile_cache_serve_interval_ms` = 1000 — a cache-serve interval, not a polling interval |
| Server-driven UI | `HomeScreenDataStore`, `UComponentDataStore`, `ConfigStore` cache the last delivered layout/config |
| Images | Coil (115 classes) and Glide (206 classes) in-process/disk caches |
| Network | Retrofit/OkHttp cache layer; 63 OkHttp classes |

## 6. Privacy and lifecycle properties

- `allowBackup="false"` — the app's data is excluded from Android auto-backup, so stores do not leave the device through backup.
- 12 `FileProvider` authorities are **unexported**; the three exported content providers are the IPC surfaces (device sessions, SSO, SSO eligibility) and validate callers in code (full reference §8).
- Tokens and cookies are stored by their own dedicated stores (`IdTokenStore`, `SessionCookieStore`) rather than in a general preferences blob.
- Nothing in the SQL or class inventory indicates an app-level encrypted database; whether individual stores encrypt their values is not determinable from names alone (**not determined**).

## 7. Not determined

- Schema and key formats of the first-party stores (they are typed APIs; the serialized field names would need per-class inspection).
- Retention/eviction policy for most stores beyond the map caches, which are parameterised.
- Whether any store value is encrypted at rest in this build.

## 8. Evidence (archive: the current-study evidence folder under `research_notes/`)

| Claim group | Evidence file |
| --- | --- |
| Store/DAO/entity inventory (188 name matches, first-party list) | `persistence.json` |
| SQL literals (482) and their owners | `dex-sql-strings.json` |
| Library presence counts (DataStore 148, SQLDelight 12, Room 7, SQLite 14, SimpleStore 11) | `dex-classes.txt.gz` + `dex-mine.py` |
| Provider/authority and `allowBackup` facts | `evidence-deepseek/manifest.json` |
| Map cache classes and cache parameters | `map-stack.json`, `parameters-registry-summary.json` |

