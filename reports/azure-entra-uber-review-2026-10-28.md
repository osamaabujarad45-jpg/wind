# Wind — Azure Entra auth + Uber-quality review (28 Oct 2026)

Evidence base: 10-agent workflow audit + 5 DeepSeek Flash (`deepseek-flash-latest`, high) read-only reviewers, every material claim re-checked by the leader against source. Tags: **[V]** verified by leader, **[R]** reported by reviewer (not re-run), **[U]** unverified.

## What shipped this session (flag-gated, password auth untouched)

| Piece | Where | Notes |
|---|---|---|
| Entra ID-token verification (RS256/JWKS, iss/aud/exp/iat/nbf/nonce, kid-rotation refetch) | [server/domain/entra.ts](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/domain/entra.ts) | Builtins only; issuer/JWKS derived solely from `WIND_ENTRA_*` env, host allowlist `*.ciamlogin.com` / `login.microsoftonline.com` |
| BFF exchange `POST /api/auth/entra` | [server/main.ts](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/main.ts:341) via `registerEntraRoutes` | Links by verified phone/email, creates customer/driver (pending) accounts, mints existing Wind session. **Admins never auto-link** (`entra_link_required`). One exchange per ID token (`entra_replay`). Nonce required; failed verifications consume rate-limit budget |
| Schema (additive only) | [sqlite-schema.ts](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/sqlite-schema.ts:150), [postgres-entra.sql](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/db/postgres-entra.sql) (migration 19) | `users.entra_oid` + unique partial index, `entra_replay` table. Old code runs against new schema; contract fixtures re-recorded deliberately and reviewed |
| Client PKCE sign-in | [src/entra-auth.ts](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/entra-auth.ts), button in [auth.tsx](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/app/auth.tsx:118) | `expo-auth-session ~57.0.16` + `expo-web-browser`; renders only when `EXPO_PUBLIC_ENTRA_*` set. SDK 57 has no typed `codeVerifier` on exchange — `extraParams` is its typed body channel (TokenRequest.types.d.ts:50) |
| Native push client | [src/native-push.ts](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/native-push.ts), wired in [session.tsx](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/session.tsx:111) | Registers Expo token on sign-in, unregisters on sign-out; foreground handler + tap deep-link added; server now sends `title`/`body` ([worker.ts](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/server/worker.ts:194)) |
| Driver background-permission warning | [driver-work.tsx](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/driver-work.tsx:44), [driver/index.tsx](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/src/app/driver/index.tsx:113) | Active-job card now warns when background ("Always") location is missing instead of silently going stale |
| ACS infra (gated off) | [infra/main.bicep](/C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/infra/main.bicep:342) | `enableAcs=false` default: Communication + Email services for the SMS bake-off. Entra tenant is portal-created, never Bicep |

Verification **[V]**: `tests/entra.test.mjs` (signature/tamper/audience/expiry/nonce/rotation), full gate **68 suites passed** (`node scripts/run-tests.mjs`, exit 0), `npx tsc --noEmit` 0, `npx expo lint` 0, live smoke: unconfigured → `503 entra_unavailable`, configured → garbage token `401 invalid_token`, `/auth/options` shape unchanged.

## Operator runbook (go-live, in order)

1. Create an **Entra External ID tenant** and a supported customer sign-up/sign-in user flow. Configure the native public-client redirect `wind://auth` and, for each approved web origin, the SPA redirect `https://<web-origin>/auth`. Phone OTP is not assumed to be a supported primary sign-in method: Microsoft's customer-tenant documentation describes SMS as a second factor. Verify the tenant's actual identity claims before using any contact for account linking.
2. Server env: `WIND_ENTRA_TENANT_NAME`, `WIND_ENTRA_TENANT_ID`, `WIND_ENTRA_CLIENT_ID`. App env (EAS/export): `EXPO_PUBLIC_ENTRA_TENANT_NAME`, `EXPO_PUBLIC_ENTRA_TENANT_ID`, `EXPO_PUBLIC_ENTRA_CLIENT_ID`. Rebuild the client after setting public values. Use a development build for native testing.
3. Run the ACS-vs-Ooredoo bake-off on real Jawwal/Ooredoo numbers before trusting `phone_number_verified` for linking (+970 delivery is **[U]**).
4. Only then: pilot behind the button, link-by-verified-phone, cut over, deprecate passwords (passkeys last).

## Review verdicts (leader re-graded)

- **Auth**: YES to Entra via BFF, phased. Session hardening (90-day bearer, web localStorage) remains the top pre-existing risk — Phase 0 backlog, not silently fixed here. [V]
- **Maps**: keep MapLibre + self-hosted OSRM (checkpoint detours are local moat). **Do not adopt Azure Maps** as the RN renderer (no first-party RN SDK). Buy only server-proxied autocomplete/geocoding. [V]
- **Driver tracking**: background upload exists; background *presence* dies on AppState inactive (latent until dispatch enables), offline breadcrumb absent by design, battery cadence blunt. [V/R]
- **Rider**: pin-optional city-centre pricing is the launch blocker; app never sends `quoteId` (server supports locked quotes at main.ts:1069) **[V]**; no traffic model. [V/R]
- **Realtime/push**: Web PubSub already provisioned but unbound (HMAC credential is not a PubSub token) **[R]**; long-poll caps at 200 watchers; Notification Hubs rejected for Expo. Azure worker/API still need DB-URL + Key Vault binding (owner gate, bicep:280). [V/R]
- **Payments/dispatch**: real PSP never constructed (Fake only) and dispatch is gated off in production — both pre-date this session. [V]

## Completion addendum (same day)

- Rider quote lock wired end-to-end: `/price` now returns `quoteId` into the booking payload and `POST /orders` sends the id alone (sending `quotedPrice` beside it is a server 400). Regression coverage in `tests/presentation.test.mjs` (quote round-trip, bad-id rejection, wire shape). Full gate: **69 suites passed**, tsc/lint clean.
- Everything in this report is committed and pushed to `origin/master`. Remaining P0s (session lifetime, real PSP, dispatch enablement, background presence) require operator/provider decisions and are intentionally not half-built.

## Unverified — do not contract on these

2026 Azure dollar prices (JS-rendered), +970 SMS deliverability via Entra/ACS, Azure Maps Palestine coverage, iOS background/Doze device behavior, Web PubSub RN client on a dev build, Entra happy-path exchange against a real tenant (no tenant exists yet — route replay/admin-guard code is unit- and contract-tested, not tenant-tested).
