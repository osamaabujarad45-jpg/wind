# Provider failures and degraded behavior

Providers are independent dependencies, not domain authorities. Use bounded timeouts, idempotent request IDs where supported, exponential backoff with jitter, retry budgets, circuit breakers and a durable reconciliation queue. Do not retry a payment or OTP request when its acceptance outcome is unknown without querying by provider reference. No real provider adapters or calls are configured by this infrastructure packet.

| Dependency | Failure behavior | Never do |
|---|---|---|
| OSRM | Stop new route-dependent quotes/assignments or use a separately approved, versioned fallback | Accept straight-line ETA as road feasibility |
| OpenFreeMap vector tiles (`tiles.openfreemap.org`) | `public/map.html` withholds `ready` until a real basemap vector tile loads and signals `failed` at `mapReadyTimeoutMs` (default 20 s; host ceiling +5 s); `SceneMap` renders `RoutePreview` diagram + Retry on routes, and booking pin step hides Confirm with `pinUnavailable` while keeping text place search (`TripSearch`) reachable | Enable pin confirmation on an unpainted map, draw straight-line routes, or switch to a paid/unapproved tile provider automatically |
| Web PubSub | Reconnect clients from authenticated API snapshot/event cursor; queue eligible notifications | Treat a socket message as assignment authority |
| SMS/OTP | Pause new challenges, enforce budgets, reconcile uncertain sends | Mock delivery or expose secrets in logs |
| Expo push/APNs/FCM/Web Push | Keep outbox intent, retry transient errors, expire stale notifications; clients refetch state | Let delayed push accept or mutate work |
| Payment gateway | Keep ledger state pending/unknown, reconcile signed webhook/provider report | Mark paid from redirect or client assertion |
| Blob scanner | Quarantine and deny download until scan decision | Publish unscanned uploaded object |
| PostgreSQL | Pause mutations on uncertain commit; recover through idempotency and fresh restore process | Fall back to SQLite after PostgreSQL writes |

Operator contracts, supported Palestinian routes/carriers, gateway onboarding/fees, webhook signatures, settlement semantics and provider budgets remain external evidence gates. Keep cash/realtime fallback policies approved by operations; infrastructure alone does not authorize them.

Routing observation is separate from essential database readiness. Authenticated administrators can read `GET /api/admin/routing`: `configured` reports whether OSRM_URL is set, `healthy` is null until the first upstream request, and checkedAt/reason describe the last observed upstream result. A valid NoRoute response means the provider responded correctly, not that the trip is feasible. Reading this endpoint does not probe the provider or expose its internal URL. Observations are process-local and may be old; check checkedAt before relying on them. OSRM_TIMEOUT_MS is bounded to 1–10 seconds (default 3 seconds). No public demo router is selected automatically. Quotes keep their existing explicit estimate behavior when road routing fails; maps show pins without invented road geometry.

Before activation, verify the internal OSRM hostname from the actual API network, populate the osrm-graph share with the intended region.osrm companion files, record image/graph version and checksums, and exercise representative corpus cases. Template bindings and local fixture health do not establish populated graph, regional feasibility or staging readiness.

Google web renderer (T12): when `EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is configured, the web app may draw with Google Maps JS after the user selects the Google mode. The bootstrap script loads once per page; a blocked SDK, revoked key or exhausted quota never draws tiles, and after a bounded deadline the map shows the diagram with Retry while MapLibre stays the default and the fallback. The server widens its CSP for Google origins only when the same variable is configured there — a baseline deployment keeps the exact installed policy. Route lines carry provider provenance and are guarded per renderer, so Google geometry never reaches a MapLibre overlay, and switching modes clears the other provider's content with the map instance. The browser key is referrer-restricted and public by design; the server route key never reaches the browser. Activation still requires restricted-key setup, covered-geography confirmation, quota/cost acceptance and physical browser checks (D06).

## Vector basemap hosting options and slow-data budget (Maps Items 2, 3, 5 — 2026-11-11)

**Measured slow-data baseline (`SM-A5360`, 11 November 2026):** first-party cold assets (`/map/v1/map.html` + vendored MapLibre 6.12.0 CSS/JS/worker) transfer **276,316 B** over the wire (100% Brotli `br`; 1,269,759 B uncompressed; 1,403,023 B including lazy `mapbox-gl-rtl-text.js`). Warm opens hit HTTP cache across all assets (**0 B** wire; `drawing` 178–256 ms, `ready` 866–1,486 ms). Cold opens across Nablus, Ramallah and Jenin:

| Profile | City | Cold `drawing` (ms) | Cold `ready` (ms) | Cold total wire (B) | Warm `drawing` (ms) | Warm `ready` (ms) | Warm wire (B) |
|---|---|---:|---:|---:|---:|---:|---:|
| `400 kbit/s` (400 ms RTT) | Nablus | 9,466 | 18,814 | 707,453 | 232 | 866 | 0 |
| `400 kbit/s` (400 ms RTT) | Ramallah | 7,012 | 18,015 | 771,580 | 245 | 1,094 | 0 |
| `400 kbit/s` (400 ms RTT) | Jenin | 7,012 | 17,165 | 683,454 | 256 | 884 | 0 |
| `Slow 3G` (400 kbit/s, 2,000 ms RTT) | Nablus | 11,858 | 22,773 | 707,392 | 253 | 1,486 | 0 |
| `Slow 3G` (400 kbit/s, 2,000 ms RTT) | Ramallah | 11,882 | 24,223 | 771,612 | 178 | 982 | 0 |
| `Slow 3G` (400 kbit/s, 2,000 ms RTT) | Jenin | 11,851 | 22,279 | 683,421 | 242 | 894 | 0 |

**Enforced budget:** first-party cold Brotli wire weight **≤ 330,000 B** and warm reload **0 B** in `scripts/check-scenarios.mjs`; raw uncompressed map + vendor + RTL plugin weight **≤ 1,450,000 B** in `tests/map.test.mjs`.

**Tile-host options for the owner (Maps Item 3):**
- **(a) Selected initial posture [decided, master plan §2.6]:** keep `tiles.openfreemap.org` (`USD 0` direct tile bill), monitor style + TileJSON health externally (`.github/workflows/uptime.yml`), and rely on text search (`TripSearch`, backed by local 24k `place-index` + Nominatim) and `RoutePreview` fallback during tile outages. Note: GitHub Actions jobs on `osamaabujarad45-jpg/wind` are currently blocked by account billing (`CURRENT-WORK.md`), so active external alerting still needs GitHub billing restored or an approved paid Route 53 / outside check (`USD 0.75/month` basic external health check).
- **(b) Self-host Palestine/Israel PMTiles + glyphs/sprites on Azure:** VM read-only inspection on 11 November showed **21 GiB available disk** (`7.7G / 29G` used), enough for a regional PMTiles extract + fonts (~300–500 MB), but only **537 MiB available RAM** (`886 MiB` total on `B2ts_v2`, shared with `wind-api`, `wind-osrm` and Caddy). Static range-served PMTiles via Caddy avoids a tile-renderer daemon, or upgrading to `B2ms` adds ~USD 61/month compute plus Azure egress; requires owner authorization and CSP update before enabling.
- **(c) Secondary style URL fallback:** single retry onto a second style/PMTiles origin after primary style/source failure; requires an approved, licence-verified second host and CSP entry.

**Empirical pilot ETA check (Maps Item 5 — 11 November 2026):** read-only inspection of production `/data/wind.db` found **`0` completed orders** (`2` cancelled parcel orders). With `n = 0` completed real trips, no empirical ETA calibration is justified; retain `etaProjection` (`ceil` minutes to `round(× 1.3) + 2`, `accuracy: 'unknown'`) until real trip completions accumulate.

## Identity and recovery capability disposition (T35/T36, 2026-10-29)

Four distinct capabilities exist in code; configuration advertises availability, while actual provider proof is a separate gate.

- **Entra sign-in** (`server/domain/entra.ts`): implemented — PKCE in the system browser, server-verified signature/issuer/audience, nonce binding, replay table, placeholder credentials for linked accounts. Activation requires `WIND_ENTRA_*` tenant configuration from the operator; until then the password path is the authority.
- **Verified phone** (`server/domain/phone-identity.ts`, `phone-provider.ts`): the proof-required flows (challenges, budgets, device binding, two-API finalization, replay/expiry/lockout) are implemented and HTTP-tested against the local provider double. Real proof requires an approved SMS provider account and sending identity — an operator gate. Verified flags always follow actual proof, never configuration alone.
- **Cloudflare email verification and code reset** (`emailReady`): code verification, self-service reset and support flows are implemented with one-use commands, replay refusal, cooldowns, wrong-try lockouts and provider error handling. In `server/main.ts`, `emailReady` checks only that `WIND_EMAIL_FROM`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_EMAIL_TOKEN` are nonempty; it does not verify sending-domain status or mailbox delivery. `/api/auth/options.emailReset` and session `capabilities.emailVerification` follow that configuration boolean. Before public use, prove the sending domain/sender and actual approved-mailbox delivery. Historical Railway email configuration is superseded.
- **Firebase reset-link fallback** (`server/domain/firebase-reset.ts`): when Cloudflare is unavailable, a valid-shaped `WIND_FIREBASE_API_KEY` and base64 `WIND_FIREBASE_SERVICE_ACCOUNT` enable `emailResetLink` in `/api/auth/options`. Initialization parses the service account and RSA key; it does not prove permissions, provider availability or delivery. This reset-link path is distinct from Cloudflare code verification and does not enable `emailVerification`. Verify an actual reset, subsequent sign-in and session revocation before claiming recovery works.

When neither reset provider is configured, sign-in offers support recovery. Support password reset retains operator-verified recovery (an administrator reads a one-time generated password to the caller after identity checks, audited as `SUPPORT_PASSWORD_RESET`); this is an interim control requiring reachable staff. The T47 readiness gate refuses placeholder contacts, but a valid-looking contact is not proof that support is staffed. The Help page now follows `/api/auth/options` (ledger row 48, shipped in a new APK).

Recovery on outage: provider failure never creates identities, never marks anything verified, and leaves budgets recorded so a retried send cannot double-bill (covered by the WP06 crash/authority suites). Rate limits on reset issuance are the WP06 limits suite's rolling windows; they are configuration, not evidence.
