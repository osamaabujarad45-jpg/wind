# Handoff: Uber/Careem-style redesign (29 Sep 2026)

Wind now books like Uber and Careem while keeping the product rules in `docs/PRODUCT.md` (city-to-city, landmarks, cash, handover code). Screenshots: `docs/screens/` (re-shot, 68 PNGs).

## Design system (`src/ui.tsx`)
- Compact scale: body 14, item titles 15, page titles 21; controls 36 (small) / 40 (choices) / 46 (buttons) / 44 (inputs); every tap target ≥ 44pt through padding or `hitSlop`. `size` export holds the numbers.
- New pieces: `Tip` (dismissible help card, stored as `tip:<id>`), `Stepper`, `Avatar`, `IconButton`, `Section`, `Rail` (horizontal scroller that starts at the reading edge in Arabic). `Button` gained `size="sm"`, `variant="outline"` and `trailing` (price on the right of a CTA). `Screen` gained `footer` (sticky bottom bar).
- Tab bar is docked (white, lime pill on the current tab) instead of the floating forest pill.

## Logo
- New mark: three lime trails pulling a terracotta pin on a forest tile. `logoMark` in `src/ui.tsx` (`logoPinStyle`, `logoHoleStyle`) and `scripts/make_icon.py` share the geometry; assets regenerated. Android adaptive background is now `#12342A`, splash ground `#F3F2EC`.
- `src/intro.tsx`: the pin drops onto its spot instead of the dot pulsing.

## Screens
| Screen | What changed |
|---|---|
| Home | "Where to?" pill (opens booking on the drop-off picker), service tiles, live orders, recent routes (book again with the same cities), promo rail, first-visit help card. |
| Book | Service switcher, route card with swap and searchable city sheet, landmark help card, passengers stepper, shared/private option rows with prices, cash payment row, sticky "Request · Shared ₪x" footer. Accepts `from`, `to`, `pick=to` params. |
| Order | Map-style route diagram (`src/route-preview.tsx`) with the driver on it, segmented progress, driver card with call, digit boxes for the handover code, receipt-style details. |
| Driver jobs | Online strip, offer cards led by earnings, route spine. |
| Account, auth, welcome, receipt, profile | Compact sizes, `Avatar`, language row shows "Language · English". |

## After the design critique (same day)
- Caption grey `palette.faint` is now `#66716B` (4.5:1 on paper and white; was 2.8:1), also used for placeholders.
- `Field` takes `error`: red edge plus a message under the field. Booking marks each missing field ("هذا الحقل مطلوب", or the phone error under the contact field), scrolls back up to the details, and shows "أكمل الحقول المعلّمة بالأحمر." above the button.
- `Press` takes `hitSlop`; the location chip is 36pt plus padding, the service switcher 40pt.

## For the testing phase
- Booking controls changed role and name: mode is two `radio` presses named "Shared ₪34" style; passengers is an adjustable stepper; the submit button is "Request · Shared" plus the price.
- New copy keys are in `src/copy.ts` under "home, booking and trip", plus `fieldRequired` and `fixMarked`.
- Empty booking fields now show per-field messages instead of only the generic `err_invalid_input` line.
- Help cards render until dismissed; tests that count elements on home, booking, order or driver jobs should dismiss them or clear `tip:*` first.
