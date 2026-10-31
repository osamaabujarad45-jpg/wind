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

Google web renderer (T12): when `EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is configured, the web app may draw with Google Maps JS after the user selects the Google mode. The bootstrap script loads once per page; a blocked SDK, revoked key or exhausted quota never draws tiles, and after a bounded deadline the map shows the diagram with Retry while MapLibre stays the default and the fallback. The server widens its CSP for Google origins only when the same variable is configured there — a baseline deployment keeps the exact installed policy. Route lines carry provider provenance and are guarded per renderer, so Google geometry never reaches a MapLibre overlay, and switching modes clears the other provider's content with the map instance. The browser key is referrer-restricted and public by design; the server route key never reaches the browser. Activation still requires restricted-key setup, covered-geography confirmation, quota/cost acceptance and physical browser checks (D06).

## Identity and recovery capability disposition (T35/T36, 2026-10-29)

Three distinct capabilities exist in code, each honest about its gate; none may be described as "verified" without its provider evidence.

- **Entra sign-in** (`server/domain/entra.ts`): implemented — PKCE in the system browser, server-verified signature/issuer/audience, nonce binding, replay table, placeholder credentials for linked accounts. Activation requires `WIND_ENTRA_*` tenant configuration from the operator; until then the password path is the authority.
- **Verified phone** (`server/domain/phone-identity.ts`, `phone-provider.ts`): the proof-required flows (challenges, budgets, device binding, two-API finalization, replay/expiry/lockout) are implemented and HTTP-tested against the local provider double. Real proof requires an approved SMS provider account and sending identity — an operator gate. Verified flags always follow actual proof, never configuration alone.
- **Email recovery** (`emailReady`): code verification, self-service reset and support flows are implemented; reset commands are one-use with replay refusal, cooldowns, wrong-try lockouts and provider-failure honesty (all HTTP-tested). Activation requires a **verified sending domain and sender identity** on Cloudflare Email Sending (the current path; the historical Railway e-mail setup in old runbooks is superseded and kept only as history), `WIND_EMAIL_FROM` set to an address on that domain, and one approved test-mailbox delivery recorded as evidence. `emailReset` stays false — the API never promises delivery it cannot perform — until all three exist.

Until a verified channel exists, the support password reset keeps its operator-verified recovery (an administrator reads a one-time generated password to the caller after identity checks, audited as `SUPPORT_PASSWORD_RESET`); this is a documented interim control, not a defect silently accepted. The T47 readiness gate refuses placeholder contacts and requires the real channel before public operation.

Recovery on outage: provider failure never creates identities, never marks anything verified, and leaves budgets recorded so a retried send cannot double-bill (covered by the WP06 crash/authority suites). Rate limits on reset issuance are the WP06 limits suite's rolling windows; they are configuration, not evidence.
