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
| `push-offers` | Push job offers / status to closed app | Web Push shipped for the web/home-screen app (SPEC-web-push.md); native still polls | Native: Expo push (needs EAS project + device tokens) | — |
| `promo-referral` | Promo codes, referral credit | Shipped: SPEC-promo-codes.md, SPEC-referral.md | No | `cash-settlement` (discount accounting) |
| `trip-issues` | Uber "Help with a trip": report an issue on a finished order, support reply, goodwill credit | Help page and support link only | No | `promo-referral` (credit codes) |
| `sms-otp` | Verified phone via OTP | Unverified self-service | **Yes** — SMS gateway (Jawwal/Ooredoo bulk SMS) | — |
| `digital-payments` | Card/wallet in app | Cash only | **Yes** — PMA-licensed provider (PalPay, Jawwal Pay…) + contract | `cash-settlement` |
| `live-map` | Real map, pin drop, moving car | **Shipped 2026-10-05** (SPEC-live-map.md): MapLibre + OpenFreeMap on web/home-screen app, pickup/dropoff pins, live driver with heading/accuracy, turn-by-turn to exact points | No | — |
| `routing-eta` | Road-snapped route line + ETA ranges ("driver 6–9 min away") | Dashed straight line; ETA straight-line × 1.3 | Infra only — self-host OSRM with the Geofabrik Israel-and-Palestine extract as a second Railway service (~1 GB RAM for preprocessing, ~300 MB serving). No third-party API; coordinates never leave our infra | `live-map`, `road-status` |
| `android-map` | Map inside the Android app | Diagram (no Google key) | No — render the same MapLibre page in a WebView (`react-native-webview`), needs a new APK build | `live-map` |

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
