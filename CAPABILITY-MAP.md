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
| `push-offers` | Push job offers / status to closed app | Web Push shipped for the web/home-screen app (SPEC-web-push.md), incl. driver offers and accepted offers (SPEC-offer-alerts.md), and delivery holds and returns (SPEC-exception-push.md, loop 49); native still polls. **Native approved by the owner but blocked (6 Oct): needs the owner's Expo account/EAS project and a Firebase project's FCM v1 key** | Native: Expo push (needs EAS project + FCM credentials) | — |
| `promo-referral` | Promo codes, referral credit | Shipped: SPEC-promo-codes.md, SPEC-referral.md | No | `cash-settlement` (discount accounting) |
| `trip-issues` | Uber "Help with a trip": report an issue on a finished order, support reply, goodwill credit | **Shipped 2026-10-04** as `delivery-exceptions` disputes + `dispute-credit` (SPEC-dispute-credit.md) | No | `promo-referral` (credit codes) |
| `sms-otp` | Verified phone via OTP | Unverified self-service | **Yes** — SMS gateway (Jawwal/Ooredoo bulk SMS) | — |
| `digital-payments` | Card/wallet in app | Cash only | **Yes** — PMA-licensed provider (PalPay, Jawwal Pay…) + contract | `cash-settlement` |
| `live-map` | Real map, pin drop, moving car | **Shipped 2026-10-05** (SPEC-live-map.md): MapLibre + OpenFreeMap on web/home-screen app, pickup/dropoff pins, live driver with heading/accuracy, turn-by-turn to exact points | No | — |
| `routing-eta` | Road-snapped route line + ETA ranges | **Shipped 2026-10-05** (SPEC-routing-eta.md): private self-hosted OSRM service, solid road line, "driver arrives in 3–6 min" on the order and public tracking pages | Infra only (Railway `osrm`) | — |
| `android-map` | Map inside the Android app | **Shipped 2026-10-05** (SPEC-android-map.md): MapLibre page `public/map.html` in a WebView, APK 1.0.5 | No | `live-map` |
| `order-again` | Uber "Rebook", Careem "Book again" | **Shipped 2026-10-06** (SPEC-order-again.md): ended orders and home recent routes refill the whole booking form; price re-quoted; APK 1.0.7 | No | — |
| `driver-offers` | inDrive driver counter-offers; Careem/Uber distance+time fare, night rate, post-trip rating | **Shipped 2026-10-06** (SPEC-driver-offers.md): smart recommended price from road km, extra minutes, slow/closed checkpoints, night and Plus; drivers accept it or offer 50–200 %; customer picks an offer; price rated apart from the driver; job card shows the road km the price used; APK 1.0.8 | No | `routing-eta`, `road-status` |
| `parcel-standard` | Parcel companies' flat rate; courier routes with many parcels | **Shipped 2026-10-06** (SPEC-parcel-standard.md): ₪20 a parcel to any city (₪30 large, admin-set), no offers on parcels; a courier carries up to 200 parcels, rides/freight stay exclusive; APK 1.0.9 | No | — |
| `courier-run-eta` | Uber/Careem never show a direct ETA while serving other stops first | **Shipped 2026-10-06** (SPEC-courier-run-eta.md, loop 19): a courier carrying other parcels gives no straight-to-you minutes or approach line, the run line instead; normal ETA on the last stop | No | `parcel-standard` |
| `customer-rating` | Uber/Careem drivers rate riders and see the rider's rating on the request | **Shipped 2026-10-08** (SPEC-customer-rating.md, loop 10): assigned driver rates the customer once; job cards show «★ 3.7 · 12 رحلة» (average from 3 ratings) or «عميل جديد»; customers never see it | No | — |
| `tipping` | Tip the driver after the trip | **Not built (owner, 6 Oct)**: cash only, the tip is handed over in person | Needs `digital-payments` | `digital-payments` |
| `delivery-photo` | Uber Connect photo at drop-off | **Not built (owner, 6 Oct)**: the handover code is stronger proof | — | — |
| `driver-documents` | Licence/ID upload during driver sign-up | **Deferred (owner, 6 Oct)**: ID scans are a privacy liability; admins approve after an in-person check | — | — |
| `cancellation-fee` | Fee for late cancellation | **Not built (owner, 6 Oct)**: a cash fee cannot be collected after a cancel | — | — |

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
