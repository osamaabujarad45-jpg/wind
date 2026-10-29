# Capability Map: Wind → Uber/Careem parity for the Palestinian market

Historical capability plan, started 2026-10-04 and updated through later modules.
For current verification and remaining work, see [QA — 21 October 2026](docs/QA-2026-10-21.md).
The original build order below is retained as history, not a list of unimplemented features.

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
| `delivery-exceptions` | Failed delivery, recipient absent, return-to-sender, dispute | **Shipped** (SPEC-delivery-exceptions.md): `on_hold` with the driver's reason, an admin reattempt/return decision, the sender's return code closes the return, one dispute per finished order (SPEC-dispute-credit.md) | No | — |
| `cash-settlement` | Careem cash collection + driver remittance/balance | **Shipped** (SPEC-cash-settlement.md): commission owed per driver, numbered handovers that count only after the driver confirms, reasoned adjustments | No | `delivery-exceptions` (return/fee states affect cash) |
| `trip-share-link` | Share trip / recipient tracking without app | **Shipped** (SPEC-trip-share-link.md): rotating no-account link, status, cities, driver first name and vehicle, a fresh position only, revocable | No | — |
| `scheduled-booking` | Reserve / book for later | **Shipped** (SPEC-scheduled-booking.md): up to 7 days ahead, released to drivers 30 minutes before pickup, customer can reschedule or cancel | No | — |
| `saved-places` | Home / Work / recent places | **Shipped** (SPEC-saved-places.md): Home/Work/other places plus recent landmarks, reusable in the booking sheet | No | — |
| `road-status` | (Local) crowd-reported checkpoint/closure status per city pair, like Azmeh-style apps | **Shipped** (SPEC-road-status.md, SPEC-checkpoint-routing.md): admin checkpoints, driver reports fresh for two hours, routing avoids a reported closure | No | — |
| `safety-sos` | Emergency button, incident report freezes completion | **Shipped** (SPEC-safety-sos.md): emergency call buttons, a report that pauses the order until an administrator resolves it | No | `trip-share-link` |
| `in-app-chat` | Driver↔customer chat about the job | **Shipped** (SPEC-in-app-chat.md): in-trip messages with quick replies, readable 24 hours after, admins read-only | No | — |
| `push-offers` | Push job offers / status to closed app | Web Push shipped for the web/home-screen app (SPEC-web-push.md), incl. driver offers and accepted offers (SPEC-offer-alerts.md), and delivery holds and returns (SPEC-exception-push.md, loop 49); native still polls. **Native approved by the owner but blocked (6 Oct): needs the owner's Expo account/EAS project and a Firebase project's FCM v1 key** | Native: Expo push (needs EAS project + FCM credentials) | — |
| `promo-referral` | Promo codes, referral credit | Shipped: SPEC-promo-codes.md, SPEC-referral.md | No | `cash-settlement` (discount accounting) |
| `trip-issues` | Uber "Help with a trip": report an issue on a finished order, support reply, goodwill credit | **Shipped 2026-10-04** as `delivery-exceptions` disputes + `dispute-credit` (SPEC-dispute-credit.md) | No | `promo-referral` (credit codes) |
| `sms-otp` | Verified phone via OTP | Unverified self-service | **Yes** — SMS gateway (Jawwal/Ooredoo bulk SMS) | — |
| `email-verification` | Verified email, password reset by code, support identity check | **Built 2026-10-21**: 6-digit codes through Cloudflare Email Service (REST); verify at sign-up/Profile, self-service reset to a verified email only, admin emails a check code and the caller reads it back. **Live once the owner onboards a sending domain** and sets `WIND_EMAIL_FROM`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN` on the API | **Yes** — a domain on Cloudflare DNS, onboarded under Email Service → Email Sending | — |
| `digital-payments` | Card/wallet in app | Cash only | **Yes** — PMA-licensed provider (PalPay, Jawwal Pay…) + contract | `cash-settlement` |
| `live-map` | Real map, pin drop, moving car | **Shipped 2026-10-05** (SPEC-live-map.md): MapLibre + OpenFreeMap on web/home-screen app, pickup/dropoff pins, live driver with heading/accuracy, turn-by-turn to exact points | No | — |
| `routing-eta` | Road-snapped route line + ETA ranges | **Shipped 2026-10-05** (SPEC-routing-eta.md): private self-hosted OSRM service, solid road line, "driver arrives in 3–6 min" on the order and public tracking pages | Infra only (Railway `osrm`) | — |
| `android-map` | Map inside the Android app | **Shipped 2026-10-05** (SPEC-android-map.md): MapLibre page `public/map.html` in a WebView, APK 1.0.5 | No | `live-map` |
| `order-again` | Uber "Rebook", Careem "Book again" | **Shipped 2026-10-06** (SPEC-order-again.md): ended orders and home recent routes refill the whole booking form; price re-quoted; APK 1.0.7 | No | — |
| `driver-offers` | inDrive driver counter-offers; Careem/Uber distance+time fare, night rate, post-trip rating | **Shipped 2026-10-06** (SPEC-driver-offers.md): smart recommended price from road km, extra minutes, slow/closed checkpoints, night and Plus; drivers accept it or offer 50–200 %; customer picks an offer; price rated apart from the driver; job card shows the road km the price used; APK 1.0.8 | No | `routing-eta`, `road-status` |
| `parcel-standard` | Parcel companies' flat rate; courier routes with many parcels | **Shipped 2026-10-06** (SPEC-parcel-standard.md): ₪20 a parcel to any city (₪30 large, admin-set), no offers on parcels; a courier carries up to 200 parcels, rides/freight stay exclusive; APK 1.0.9 | No | — |
| `courier-run-eta` | Uber/Careem never show a direct ETA while serving other stops first | **Shipped 2026-10-06** (SPEC-courier-run-eta.md, loop 19): a courier carrying other parcels gives no straight-to-you minutes or approach line, the run line instead; normal ETA on the last stop | No | `parcel-standard` |
| `customer-rating` | Uber/Careem drivers rate riders and see the rider's rating on the request | **Shipped 2026-10-08** (SPEC-customer-rating.md, loop 10): assigned driver rates the customer once; job cards show «★ 3.7 · 12 رحلة» (average from 3 ratings) or «عميل جديد»; customers never see it | No | — |
| `driver-destination` | Uber Driver destination filter | **Shipped 2026-10-08** (SPEC-driver-destination.md, loop 12): «متجه إلى» city chips on the jobs screen; for 3 hours only jobs dropping off there are listed and alerted | No | — |
| `change-destination` | Uber lets the rider edit the destination mid-trip for a new fare | **Built 2026-10-29 (SQLite runtime; deliberately 409 after the PostgreSQL cutover until WP12 is reviewed)** (SPEC-change-destination.md): the customer re-quotes in cash and the assigned driver must accept before city, landmark, fare, discount and commission change; the original assignment's commission rate is kept, the proposal is pushed and expires in ten minutes | No | `road-status`, `routing-eta` |
| `send-another` | Courier "new shipment from the same sender" | **Shipped 2026-10-08** (SPEC-send-another.md, loop 14): «أرسل طرداً آخر من نفس المكان» on a customer's parcel order copies only the pickup | No | `order-again` |
| `cash-on-delivery` | Courier collects the goods price for the sender (تحصيل) | **Not built: owner decision** — needs a sender payout ledger; SPEC-cash-settlement.md marks payouts "ask first" | No (cash) | `cash-settlement` |
| `parcel-recipient` | Courier/Uber Connect recipient name and phone | **Shipped 2026-10-08** (SPEC-parcel-recipient.md, loop 16): optional recipient on parcels/loads; assigned driver can call them; sender sends the tracking link to the recipient on WhatsApp (`wa.me`, no SMS provider); hidden on job cards and public tracking | No | `trip-share-link` |
| `run-sheet` | Courier route sheet | **Shipped 2026-10-08** (SPEC-run-sheet.md, loop 18): driver Trips groups active parcels into pickups, deliveries by city (biggest first) and returns, «تسليم في نابلس · 3» | No | `parcel-standard` |
| `tipping` | Tip the driver after the trip | **Not built (owner, 6 Oct)**: cash only, the tip is handed over in person | Needs `digital-payments` | `digital-payments` |
| `delivery-photo` | Uber Connect photo at drop-off | **Not built (owner, 6 Oct)**: the handover code is stronger proof | — | — |
| `driver-documents` | Licence/ID upload during driver sign-up | **Deferred (owner, 6 Oct)**: ID scans are a privacy liability; admins approve after an in-person check | — | — |
| `cancellation-fee` | Fee for late cancellation | **Not built (owner, 6 Oct)**: a cash fee cannot be collected after a cancel | — | — |

Skipped on purpose: surge pricing (PRODUCT.md forbids unexplained surge), pooling,
customer-defined multi-stop routes, food delivery (Yummy owns it).
Native background GPS is now implemented; current build/device validation is tracked in the QA report.

## Proposed build order

1. `delivery-exceptions` — launch blocker, provider-free.
2. `cash-settlement`
3. `trip-share-link` → `safety-sos`
4. `scheduled-booking`, `saved-places`, `road-status`, `in-app-chat` (parallel, independent)
5. `push-offers`, `promo-referral`
6. Provider-gated: `sms-otp`, `digital-payments`, `routing-eta` — only after you pick and contract a provider.

**This session's proposal:** spec + build + review + ship `delivery-exceptions` only.
Each later module gets its own `SPEC-<id>.md` and its own lifecycle pass.
