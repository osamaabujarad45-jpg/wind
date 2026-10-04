# Capability Map: Wind → Uber/Careem parity for the Palestinian market

Phase 0 of spec-driven development (agent-skills). Status: **awaiting approval**. Date: 2026-10-04.

## What Wind already has

Customer/driver/admin roles in one Expo app; parcel (default), ride and freight
behind `WIND_ENABLED_SERVICES`; server quotes from admin tariffs; one active job
per driver; vehicle matching (motorcycle/bicycle/car/van/truck); foreground GPS
during active job with stale handling; 4-digit handover code with lockout; cancel
before pickup; ratings; earnings + commission snapshots; Plus/Pro plans activated
by admin; Souq partner bridge; account deletion; Arabic/English RTL.

## Gap vs Uber / Careem, adjusted for Palestine

Local realities used: cash-dominant payments, PMA-licensed wallets only (no
Stripe/Apple Pay), checkpoints and road closures make ETAs unreliable, addresses
are landmark-based, WhatsApp/phone are the default contact channels.

| Module id | Uber/Careem feature | Wind today | Provider needed? | Depends on |
|---|---|---|---|---|
| `delivery-exceptions` | Failed delivery, recipient absent, return-to-sender, dispute | Order stranded in `in_transit`; SYSTEM.md §10 says this **blocks unsupervised parcel launch** | No | — |
| `cash-settlement` | Careem cash collection + driver remittance/balance | Earnings are calculations only; no remittance ledger | No | `delivery-exceptions` (return/fee states affect cash) |
| `trip-share-link` | Share trip / recipient tracking without app | Recipient must be told code out-of-band; no link | No | — |
| `scheduled-booking` | Reserve / book for later | Now only | No | — |
| `saved-places` | Home / Work / recent places | Retype city + landmark each time | No | — |
| `road-status` | (Local) crowd-reported checkpoint/closure status per city pair, like Azmeh-style apps | None; ETA is straight-line × 1.3 | No | — |
| `safety-sos` | Emergency button, incident report freezes completion | Support phone only | No | `trip-share-link` |
| `in-app-chat` | Driver↔customer chat about the job | Phone only | No | — |
| `push-offers` | Push job offers / status to closed app | Polling; drivers must keep app open | Expo push (free, needs EAS project + device tokens) | — |
| `promo-referral` | Promo codes (SPEC-promo-codes.md) and referral credit (SPEC-referral.md), both shipped | None | Yes | `cash-settlement` (discount accounting) |
| `sms-otp` | Verified phone via OTP | Unverified self-service | **Yes** — SMS gateway (Jawwal/Ooredoo bulk SMS) | — |
| `digital-payments` | Card/wallet in app | Cash only | **Yes** — PMA-licensed provider (PalPay, Jawwal Pay…) + contract | `cash-settlement` |
| `routing-eta` | Real routing + ETA ranges | Straight-line × 1.3 | **Yes** — OSRM self-host or Mapbox | `road-status` |

Skipped on purpose: surge pricing (PRODUCT.md forbids unexplained surge), pooling,
multi-stop, background GPS (Play policy), food delivery (Yummy owns it).

## Proposed build order

1. `delivery-exceptions` — launch blocker, provider-free.
2. `cash-settlement`
3. `trip-share-link` → `safety-sos`
4. `scheduled-booking`, `saved-places`, `road-status`, `in-app-chat` (parallel, independent)
5. `push-offers`, `promo-referral`
6. Provider-gated: `sms-otp`, `digital-payments`, `routing-eta` — only after you pick and contract a provider.

**This session's proposal:** spec + build + review + ship `delivery-exceptions` only.
Each later module gets its own `SPEC-<id>.md` and its own lifecycle pass.
