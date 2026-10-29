# Provider failures and degraded behavior

Providers are independent dependencies, not domain authorities. Use bounded timeouts, idempotent request IDs where supported, exponential backoff with jitter, retry budgets, circuit breakers and a durable reconciliation queue. Do not retry a payment or OTP request when its acceptance outcome is unknown without querying by provider reference. No real provider adapters or calls are configured by this infrastructure packet.

| Dependency | Failure behavior | Never do |
|---|---|---|
| OSRM | Stop new route-dependent quotes/assignments or use a separately approved, versioned fallback | Accept straight-line ETA as road feasibility |
| Web PubSub | Reconnect clients from authenticated API snapshot/event cursor; queue eligible notifications | Treat a socket message as assignment authority |
| SMS/OTP | Pause new challenges, enforce budgets, reconcile uncertain sends | Mock delivery or expose secrets in logs |
| Expo push/APNs/FCM/Web Push | Keep outbox intent, retry transient errors, expire stale notifications; clients refetch state | Let delayed push accept or mutate work |
| Payment gateway | Keep ledger state pending/unknown, reconcile signed webhook/provider report | Mark paid from redirect or client assertion |
| Blob scanner | Quarantine and deny download until scan decision | Publish unscanned uploaded object |
| PostgreSQL | Pause mutations on uncertain commit; recover through idempotency and fresh restore process | Fall back to SQLite after PostgreSQL writes |

Operator contracts, supported Palestinian routes/carriers, gateway onboarding/fees, webhook signatures, settlement semantics and provider budgets remain external evidence gates. Keep cash/realtime fallback policies approved by operations; infrastructure alone does not authorize them.

Routing observation is separate from essential database readiness. Authenticated administrators can read `GET /api/admin/routing`: `configured` reports whether OSRM_URL is set, `healthy` is null until the first upstream request, and checkedAt/reason describe the last observed upstream result. A valid NoRoute response means the provider responded correctly, not that the trip is feasible. Reading this endpoint does not probe the provider or expose its internal URL. Observations are process-local and may be old; check checkedAt before relying on them. OSRM_TIMEOUT_MS is bounded to 1–10 seconds (default 3 seconds). No public demo router is selected automatically. Quotes keep their existing explicit estimate behavior when road routing fails; maps show pins without invented road geometry.

Before activation, verify the internal OSRM hostname from the actual API network, populate the osrm-graph share with the intended region.osrm companion files, record image/graph version and checksums, and exercise representative corpus cases. Template bindings and local fixture health do not establish populated graph, regional feasibility or staging readiness.
