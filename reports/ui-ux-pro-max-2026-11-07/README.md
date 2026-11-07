# Wind / Fastship whole-app UI/UX audit — 7 November 2026

## Scope and evidence

Baseline: `f8d58c14d43cc31475411899ebfa29c23b04f79c`. Work is isolated on `claude/ui-ux-pro-max-20261107`; the main dirty workspace was not edited.

This index covers every current customer, driver, admin, launch, shared, order, receipt, and public-tracking route, plus the shared widgets used by those routes. Six narrowed source packets contain **97 reported findings before cross-packet deduplication**. Findings are source-evidenced by the named worker, then verified by the leader during implementation. A report entry is not by itself a visual or physical-device certification.

| Packet | Scope | Reported findings |
|---|---|---:|
| [Shared design system](shared-design-system-audit.md) | Shared primitives and all four navigators | 8 |
| [Launch and customer](launch-customer-audit.md) | Welcome, auth, customer home, orders list | 17 |
| [Booking](booking-audit.md) | Parcel/ride/freight booking, pins, place search, freight and recovery | 15 |
| [Order, receipt and tracking](order-receipt-tracking-audit.md) | Role-specific order detail, receipt, destination changes and public tracking | 18 |
| [Driver and admin](driver-admin-public-audit.md) | Driver jobs/earnings and admin dashboard/orders/users/settings | 13 |
| [Account, support and cash](account-support-cash-audit.md) | Customer/driver account, profile, help, roads, trips, cash and subscriptions | 26 |

## Independent visual evidence

External Claude `claude-haiku-5-5`, medium requested effort, opened **all 44 catalogue screen IDs and 96 images** in the frozen baseline. No image was unreadable and no source was modified.

- [Launch and customer visual review](visual-launch-customer.md): 28 screen IDs, 64 images.
- [Driver and admin visual review](visual-driver-admin.md): 16 screen IDs, 32 images.

Pixel reviews establish visible findings only. They do not establish touch size, screen-reader behavior, contrast ratios, async behavior, or physical-device acceptance. Worker-reported items that can be fixtures or intentional scroll/map behavior remain hypotheses until verified.

## Remediation logs

- [Shared design system and navigation](shared-design-system-remediation.md): DS-01 through DS-08 implemented and checked with 17 shared regressions, bilingual browser navigation, and three independent visual rounds. Physical-device acceptance remains open.

## Route-to-packet map

- Launch: `welcome`, `auth`, intro and phone recovery → Launch/customer; Account/support for shared phone widgets.
- Customer: home, orders, account → Launch/customer and Account/support.
- Booking: `book`, pin sheet, place search, freight details, pending recovery → Booking.
- Fulfilment: order detail, receipt, destination change, public `track/[token]` → Order/receipt/tracking.
- Driver: jobs, trips, earnings, account, presence, run sheet and driver receipt → Driver/admin; Account/support; Order/receipt/tracking.
- Admin: dashboard, orders, users, cash, subscriptions, settings → Driver/admin and Account/support.
- Shared: `ui.tsx`, root/customer/driver/admin layouts, copy, motion and shared parts → Shared plus the route packet that exercises each state.

## Baseline gates and limitations

- Isolated `npm ci` succeeded after restoring lockfile-required local `vendor/` fixtures. Those fixtures remain untracked and are not UI changes.
- Baseline lint and both TypeScript checks passed locally (K5 SSH remains unavailable; this is explicitly local fallback evidence).
- The broad test gate passed the suites before `subscription-migration.test.mjs`, then stopped because local PostgreSQL at `127.0.0.1:55473` refused connection. This is not a full-suite pass.
- The screenshot harness initially missed `/api/orders?journeyProtocol=1`. After correcting its URL matching, the full browser recovery flow passed and saved 96 screenshots.
- No emulator was used. Physical Android, TalkBack, keyboard, largest-font, safe-area and final reduced-motion acceptance remain explicit finish-gate items.

## Completion protocol

For each packet: reproduce with a focused failing test where behavior changes; make the smallest brand-preserving fix; run focused tests, lint and both typechecks; regenerate Arabic and English evidence; obtain independent visual/source review; and record remaining physical-device limits honestly. Do not interpret “100%” as permission to claim unperformed iOS, accessibility, or device certification.
