# HAAT live tracking and environment bootstrap — verified static atlas

**Artifact:** `com.haat.client` v21.0.4, base APK SHA-256 `52279a92f31febafac3eaaa7b64348a762e5bb41879e8b1ea318b7debd150366`, the same artifact as `research_notes/REA-2026-11-13-reference-apps/HAAT.md`.
**Scope:** this note extends that report with the MQTT implementation and environment-selection mechanics. It deliberately does not repeat the artifact inventory, address form, Arabic copy or store-listing findings.
**Method:** static analysis only. No app, broker, API or DNS query was run for this pass. Nothing below is a claim about runtime availability or server behaviour.

## Evidence notation and commands

- **[O]** direct observation in the shipped artifact; **[I]** inference from those observations; **[U]** unknown from this evidence.
- **INVENTORY:** `rea search-android-classes <apk> "" --format json`, saved once as `%TEMP%\opencode\haat-tracking-classes.json`, followed by local filtering. **STR:** local `Select-String`/ripgrep over that inventory and the previously extracted `dex_strings.txt`.
- **CLASS(C):** `rea inspect-android-class <apk> <C> --format json`.
- **M(C.m):** `rea inspect-android-method <apk> <C> <m> --format json --filter-output normalized_result`. Where overloads exist, the reported index is stated explicitly.
- **TRACE(C.m):** `rea trace-android-references <apk> <C> --method-name <m> --format json --filter-output normalized_result`.
- **DEX(C.m):** `python` with `androguard.core.dex.DEX` over the frozen DEX files extracted by `python dexparse.py <apk> <outdir>`, printing `get_instructions()` for the named method. **FIELDS(C):** the same local API with `get_fields()` and `get_init_value().get_value()`.
- **RES:** `aapt2 dump xmltree --file <resource> <apk>` using build-tools 36.1.0, followed by local resource-ID resolution in `haat-res-all.txt`.

R8 renamed most implementation classes. `i44` is called the **current-orders fragment** below because its own MQTT log strings all carry the exact tag `[FragmentDeliveriesCurrentOrders]`; that is a semantic alias, not a recovered source symbol. Likewise `yk1` is the cluster-selection view-model identified by `ClusterSelectionViewModel.fetchApiClusters` and its activity caller. REA's Java decompile of the merged `q20.invokeSuspend` timed out at 90 seconds, so that method's claims use its actual DEX instruction stream instead of a partial decompilation.

---

# Area 1 — live tracking over MQTT

## 1.1 Credentials are fetched per order; the broker is not hardcoded

**[O — CLASS(i44), M(i44.u), STR]** The current-orders fragment owns an `org.eclipse.paho.android.service.MqttAndroidClient` field (`n0`). It fetches credentials from:

`xo1.a` + `api/orders/v2/driver-location-credentials/` + `X`

`X` is the order ID and `xo1.a` is the app-wide API base URL. The request is asynchronous and its callback is `uib` branch 15. The manifest separately declares `org.eclipse.paho.android.service.MqttService` as non-exported **[O — RES(AndroidManifest.xml)]**.

**[O — M(uib.onResponse)]** A successful HTTP 200 body is parsed as JSON with these exact keys:

| JSON key | Where it goes | Static consequence |
|---|---|---|
| `userName` | `i44.r0`, then `MqttConnectOptions.setUserName` | Broker username is server-issued. |
| `password` | `i44.p0`, then `setPassword(...toCharArray())` | Broker password is server-issued; no password value appears here. |
| `clientId` | `i44.s0`, then the `MqttAndroidClient` constructor | **The client ID is supplied whole by the service.** No local UUID/device-ID composition or prefix scheme is present in this path. |
| `topic` | `i44.o0`, then the post-connect subscribe call | **The topic is supplied whole by the service.** No first-party topic template, wildcard or order-ID interpolation is present. |
| `protocol` | First component of the broker URI | Actual scheme is **[U]**; generic Paho scheme literals elsewhere in the DEX are not evidence of the selected value. |
| `host` | Second component of the broker URI | Actual hostname is **[U]**, not a first-party literal. |
| `port` | Final component of the broker URI | Actual port is **[U]**, not a first-party literal. |

The URI construction is exactly **`protocol + "://" + host + ":" + port`** **[O — M(uib.onResponse)]**. Thus the requested broker host/port answer is precise but necessarily negative: **this APK path receives them at runtime; it does not contain their concrete values**. The same applies to the client-ID scheme and topic pattern: the evidenced “scheme” is service issuance, not local generation.

## 1.2 Connect and subscribe configuration

| Concern | Verified setting | Evidence |
|---|---|---|
| Client construction | `MqttAndroidClient(activity, brokerUri, clientId, MqttAndroidClient.Ack.AUTO_ACK)` | **[O — M(i44.p)]** |
| Callback | `rt2` is registered before connect | **[O — M(i44.p), CLASS(rt2)]** |
| Automatic Paho reconnect | **`setAutomaticReconnect(false)`** | **[O — M(i44.p)]** |
| Session | **`setCleanSession(true)`** | **[O — M(i44.p)]** |
| Authentication | Username/password from the credential JSON above | **[O — M(i44.p), M(uib.onResponse)]** |
| TLS socket configuration | `SSLSocketFactory.getDefault()` is passed to `setSocketFactory` | **[O — M(i44.p)]**; this does not reveal the runtime `protocol` value. |
| Other connect knobs | No first-party call in this method sets keep-alive, connection timeout, MQTT version, will message or max-inflight | **[O — M(i44.p)]**; numeric library defaults are not attributed to HAAT here. |
| Subscribe point | Only after connect success, using the service-provided topic | **[O — M(w05.onSuccess), M(i44.q)]** |
| Subscribe QoS | **Literal `0`** | **[O — M(i44.q)]** |
| Disconnected buffer | Enabled after connect; size **100**, `persistBuffer=false`, `deleteOldestMessages=true` | **[O — M(w05.onSuccess)]** |

## 1.3 Reconnect and outage policy

- **Custom, not Paho, retry [O — M(i44.J/K), M(i44.<init>)]:** automatic reconnect is disabled, while `K()` performs stop-then-schedule (`S()` followed by `J()`). Retry state starts at `Y=1`, multiplier `Z=2`, cap `k0=120`. `J()` updates `Y = min(Y * Z, 120)` and posts to a main-looper `Handler` after `Y * 1000` ms. The initial scheduled delay is therefore **2 seconds**, followed by exponential growth capped at **120 seconds**. The scheduling branch is gated on the fragment being added, not stopped, and either `G` or `H` being active.
- **Failure triggers [O — M(rt2.connectionLost), M(w05.onFailure, overload 1), M(uib.onFailure)]:** a non-null MQTT `connectionLost` throwable, MQTT connect failure, and credential-fetch network failure all reach `K()`. `Q()` cancels retry/polling state and resets `Y` to 1 **[O — M(i44.Q/R)]**. No maximum-attempt counter appears in `J()`; lifecycle/state gates, rather than an attempt limit in that method, bound scheduling.
- **Explicit service-outage fallback [O — M(uib.onResponse), M(i44.I/w), M(i44.<init>)]:** HTTP 500 from the credentials call is parsed for `handleSuhailOutOfServiceError`. If `getIsSuhailOutOfService()` is true, the fragment starts fallback polling; `getFetchOrderDriverLocationCallIntervalInSeconds()` can override the default **30-second** interval. The fallback request is `xo1.a` + `api/orders/v2/driver-location/` + order ID **[O — M(i44.w)]**. The exact diagnostic string is `[FragmentDeliveriesCurrentOrders] Suhail MQTT service is down, switching to fallback polling`.

**[I]** For Wind, the useful pattern is not merely “MQTT instead of polling”: it is server-issued, short-lived connection parameters **plus** an explicit polling fallback. QoS 0 and a clean session should not be treated as guaranteed delivery; a last-known location with freshness/sequence metadata remains necessary. Message loss was not tested and is not claimed.

## 1.4 Payload parsing and map update

**[O — M(rt2.messageArrived), M(i44.r)]** The callback logs the incoming topic, converts payload bytes using the platform default charset, ignores an empty string, and forwards the remaining text to `i44.r`.

The parser expects this nested JSON path:

`location` → `geometry` → `coordinates`

The coordinate array must have exactly two entries. Index **1** becomes latitude and index **0** becomes longitude; zero/invalid/missing coordinates are ignored. Valid coordinates replace the driver's `LatLng`, update an existing marker, or create an `icon_driver_map` marker and fit the map bounds between driver and the relevant endpoint **[O — M(i44.r)]**. No other payload fields are consumed by this method.

**[U]** Actual payloads, broker authentication outcomes, topic names, delivery frequency, packet loss and whether the service currently issues usable credentials were not tested.

---

# Area 2 — environment list, propagation, and the “no internet” diagnosis

## 2.1 Which class fetches `envs-list.haatcloud.com`

**[O — M(zd8.a), M(cu2.toString)]** `zd8.a()` supplies the environment-list endpoint. It reads Firebase Remote Config key **`dev_list_api_url`** as a `DevListApiConfig(url, appType)` JSON object. Empty, missing or malformed configuration falls back to exactly:

`https://envs-list.haatcloud.com/`

A non-empty configured `url` replaces that endpoint; a non-empty `appType` also replaces the static default **`user-new-app`** **[O — M(zd8.a), FIELDS(zd8.a)]**.

**[O — M(yk1.a)]** `yk1.a()` calls `zd8.a()` and launches the `q20` continuation that performs the fetch. Its result wrapper is `vk1`: success carries a list; failure carries an error message.

**[O — DEX(q20.invokeSuspend), instructions 511–600]** The relevant continuation branch builds a **GET** with OkHttp, executes it through `FirebasePerfOkHttpClient`, requires a successful response and non-empty body, then uses Gson to parse `pb3`. The same instruction range contains the exact diagnostics `Failed to parse environment list: ` and `Empty response from environment API`; non-success handling includes the `HTTP ` prefix.

## 2.2 Response shape and host construction

**[O — CLASS(pb3), M(pb3.a/toString)]** The response model is explicitly named by its own `toString` as:

`EnvListResponse(domains=...)`

`domains` is a **`List<String>`**, exposed by `getDomains()` (R8 method `a()`). It is a domain list, not a list of fully formed credential objects.

**[O — DEX(q20.invokeSuspend), instructions 553–582; M(pj1.toString)]** Each domain string is mapped into a model whose own `toString` is `Cluster(label=..., url=..., isDefault=...)`:

- `label` is the domain string unchanged.
- `url` is **`"https://" + appType + "." + domain + "/"`**.
- The `appType` is the `zd8.a` value above, defaulting to `user-new-app` unless overridden through `dev_list_api_url`.

No concrete `domains` response entries are embedded in this code path, so the live domain list is **[U]**.

A separate default cluster is created by `yk1.b` with label `Default (<build mode>)`, `isDefault=true`, and the URL from `ai4.s()` or its fallback **[O — M(yk1.b), M(ai4.s)]**. The serialized `ai4` field behind `s()` is `productionBaseUrl` **[O — local JADX annotation listing for `ai4`, corroborated by STR]**. Static fallback URLs read directly from `oy` are:

| Field | Exact value | Evidence |
|---|---|---|
| `oy.c` | `https://user-new-app.internal.haat.delivery/` | **[O — FIELDS(oy.c)]** |
| `oy.d` | `https://user-new-app-development.internal.haat.delivery/` | **[O — FIELDS(oy.d)]** |
| `oy.e` | `https://user-new-app-staging.internal.haat.delivery/` | **[O — FIELDS(oy.e)]** |

## 2.3 How a selected environment reaches tracking and the rest of the app

**[O — M(xk1.invokeSuspend), M(rc9.<init>)]** Continuing after selection does four relevant things:

1. Persists the chosen URL under the exact preference key **`selected_base_url`** (`rc9.N`).
2. Assigns the same string to the process-wide **`xo1.a`** API base.
3. Calls `xo1.p(context)` and logs out the current Intercom client.
4. Invokes the `k91` collaborator; its broader session semantics are not inferred here.

**[O — M(zd8.d)]** The normal `productionMode` configuration applier also sets `xo1.a` from `ai4.s()` (falling back to `oy.c`) and updates related endpoints. `zd8.b()` reads that configuration from Remote Config key **`haat_client`** **[O — M(zd8.b)]**.

This creates a concrete static chain from environment selection to tracking: **`selected_base_url` / Remote Config → `xo1.a` → driver-location credential and fallback endpoints in `i44.u/w`** **[O — M(xk1.invokeSuspend), M(i44.u/w)]**. It is still not evidence that any server honors the selected value at runtime.

## 2.4 Two different failure surfaces — and a necessary correction to HAAT.md

### Environment-list failure

**[O — M(yk1.a)]** `UnknownHostException`, `SocketTimeoutException` and `ConnectException` from the cluster fetch produce this exact cluster-selection error:

`Unable to reach cluster API.\nMake sure Tailscale VPN is connected.`

Other exceptions use their own message, falling back to `Failed to load clusters.` The view-model logs under `ClusterSelectionViewModel.fetchApiClusters` and returns the error in `vk1`; this is **not**, in the inspected code, a call to the splash no-internet dialog.

### Generic splash failure actually proven by the code

**[O — M(SplashActivity.I), M(tl9.run)]** Splash schedules a **10,000 ms** timeout. On expiry it logs the exact diagnostic **`RemoteConfig: Fetch timed out`** and checks whether `zd8.b()` can deserialize cached `haat_client` configuration:

- With cached configuration, it applies the cached values and proceeds.
- Without cached configuration, it calls `SplashActivity.F()`.

**[O — M(SplashActivity.F), RES(dialog_no_internet_connection.xml)]** `F()` inflates `dialog_no_internet_connection`, makes it non-cancelable and shows a Try again action. Resource resolution gives:

| Resource | English value |
|---|---|
| `no_internet_connection_title` | `No Internet Connection` |
| `no_internet_connection_desc` | `Please make sure your internet connection is stable and try again.` |
| `try_again` | `Try again` |

Thus the generic message is proven for **a Remote Config bootstrap timeout with no usable cached configuration**. The UI does not distinguish DNS failure, timeout, remote-config service failure or absent/invalid cache.

### What cannot be claimed about `envs-list` causality

**[O — TRACE(zd8.a)]** the only incoming method reference to the endpoint selector `zd8.a()` is `yk1.a`. `ClusterSelectionActivity.onCreate` drives that view-model **[O — M(ClusterSelectionActivity.onCreate)]**, and the manifest declares `com.haat.client.ui.activity.dev.ClusterSelectionActivity` with `exported=false` **[O — RES(AndroidManifest.xml)]**. No direct static path from this environment-list fetch to `SplashActivity.F()` was found. Production reachability of that dev screen by reflection or another indirect route remains **[U]**, not disproved.

**Correction [I from the observations above]:** the earlier HAAT.md juxtaposition of `envs-list.haatcloud.com` NXDOMAIN and the splash “no internet” result is **not enough to establish causation**. This pass proves two separate mechanisms and must not relabel the environment-list failure as the proven source of the splash dialog.

**Reachability context [O from the earlier owner-network pass, not this static pass]:** `envs-list.haatcloud.com` was observed **NXDOMAIN from the owner's network**. That is a local reachability fact only. It does not prove a server outage, global DNS state, an application defect, or the cause of the observed splash screen.

## Implementation lessons for Wind

1. **Name the failing bootstrap stage.** “Remote Config timed out,” “environment-list DNS failed,” and “order API unreachable” are different operator and user states. Preserve stage, hostname and exception category in diagnostics rather than collapsing all of them into “no internet” **[I from M(yk1.a), M(tl9.run)]**.
2. **Make cached fallback explicit.** HAAT proceeds with cached `haat_client` but blocks with a generic dialog when no cache exists. Wind should expose stale-cache age and the failing refresh stage so a cached start is not mistaken for proven connectivity **[I from M(tl9.run), M(zd8.b)]**.
3. **Keep environment values centralized.** The selected URL is persisted and copied into one base-URL field consumed by tracking endpoints. That is a clean propagation pattern, but changing environment also requires explicit session/tenant invalidation; only the Intercom logout and the `k91` handoff are visible here, so total invalidation is **[U]** **[I/O from M(xk1.invokeSuspend)]**.

## Explicitly unproven

- Concrete MQTT protocol, host, port, client ID, topic and credentials.
- Concrete entries returned in `EnvListResponse.domains` and the runtime-selected environment.
- Runtime delivery, reconnect success, fallback freshness or broker/API availability.
- A static causal link from `envs-list.haatcloud.com` failure to the splash no-internet dialog.
- Any runtime or server-side defect inferred solely from the owner-network NXDOMAIN observation.
