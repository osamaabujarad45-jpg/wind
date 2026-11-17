# Design review, 17 Nov 2026

The owner said the app "looks bad" and asked for a powerful design that covers every design aspect. Four Claude Haiku 5.5 reviewers (extra effort) each loaded the design skills: design-critique, accessibility-review, ui-ux-pro-max, expo-design-system and expo-native-ui. Each reviewed part of the 57 screens in `docs/screens/` in Arabic and English. This file merges their findings into one plan. Claude Opus implements it. Grok is not used for design.

## What to keep

- Brand: a forest primary, lime used only on forest, a clay accent and Readex Pro headings, on warm paper. One icon family and no emoji. The logo system runs from the intro to sign-in.
- The map-first home and trip screens. The driver trip hierarchy is the best screen in the set.
- The handover-code card (clay, large digits) and the consent card.
- Each disabled button carries a reason line. Keep the pattern and change only the style.
- RTL: arrows, chevrons, route rails, tab order and receipt columns all mirror correctly.
- Honest state copy, and the full money working on receipts and earnings.

## System changes, in `src/ui.tsx` (the one design source)

1. **Type ramp.** The floor is too low and there is no hero size.
   - micro 11 → 12, caption 12 → 13, body 14 → 15, with row text in ink.
   - title 15 → 16 so it separates from h2 17; h1 21 → 22.
   - Add `display`: Readex bold 28, tabular figures, for ETA, amounts, shares and earnings.
   - Badge and tab labels go to 12. Prices become 15/700 ink with tabular-nums.
   - Arabic body: bundle Readex Regular and Medium, so Arabic does not split between two families.
2. **Field visibility (WCAG 1.4.11).**
   - Today the `line` border is #E2E1D8 (1.17–1.31:1) and the input fill is paper on white (1.12:1).
   - New `palette.field` #7D867F border (≥3.3:1), fill white, and placeholder `secondary`, not `faint`.
   - The focus state is a 2px forest border.
3. **Selected vs unselected.**
   - `Choices` selected today is a white fill with a hairline, while unselected is grey and reads as disabled.
   - Selected becomes a forest fill with an onFill label and a check, as `chipOn` already does. Unselected becomes a card fill with a field border.
4. **Disabled buttons.**
   - Today a disabled button is a dashed outline on paper (1.9:1) and reads as an empty drop zone.
   - It becomes a solid `muted` fill with a `secondary` label, and keeps the reason line.
5. **Action hierarchy.**
   - One forest primary per screen or card, `soft` for secondary, ghost for tertiary.
   - New `danger` variant (an error outline) for Delete account, Reject, Cancel order and Destroy, each with a confirm.
   - Sign out stays neutral.
6. **Semantic colours.**
   - Add `warn` (ochre), distinct from `error` (cool red) and from brand clay. `clayPale` and `errorPale` measure 1.02:1 today.
   - Add `info` (blue).
   - One `statusTone` drives Badge, the order sheet dot, the route and the ETA. Today in_transit is olive in one place and blue in another.
   - Chart series use palette tokens.
7. **Overflow.**
   - `money()` puts a no-break space between ₪ and the amount; today ₪ stacks above the number.
   - A price Txt gets `flexShrink: 0`, and titles get `flex: 1` with one line.
   - Badge text gets `maxWidth: 100%` with `flexShrink: 1` and may wrap to two lines.
8. **Spacing.** Screen content uses `gap: 12`. `Stat` tiles stretch to equal height. Buttons never touch: the gap is 12.
9. **"Everything's a card."**
   - Lists (jobs, users, shops, orders) become divided rows on paper using a `DataRow` primitive: title, one caption line, a status badge and a chevron.
   - A card is kept only for the active or offered job and for decision cards.
   - Banners become full-width strips with no nested white pill.
10. **Tab bar.**
    - The active pill is lime on paper (1.12:1) and washes out in sun. It gets a filled icon, a forest bold 12pt label and a 1.5px forest edge on the pill.
    - Labels may wrap to two lines.
    - Admin goes from 7 tabs to 5, with Shops, Plans and Settings under "More".
11. **Primary dock.** A screen's main action (Go online, Accept, End trip, Request) pins above the tab bar at 56pt, using the `Screen` `footer` slot.
12. **Countdown chip.** A time-boxed decision shows a 15/700 clay chip with explicit copy when it expires. Today it is a 12px caption that reads "0:00".

## Screen findings (by area)

**Customer**
- Home: the service chips truncate ("Items & …"). Use a stacked icon with a two-line label.
- Booking: one picker serves every service and names none. Title the picker with the service name. "From" is paper and "To" is muted, so the fills don't match. The recent list has no "Recent" header.
- Order live: the ETA is shown at h2. Make it `display`.
- Order done: three equal pills. Make "Order again" the primary and the other two soft or ghost.
- Orders: split into Active and Past sections.
- Scheduled: the English times have no AM/PM.

**Driver**
- Accept stays enabled while Offline. Disable it with the reason "Go online".
- The Arabic go-online label "اتصل" reads as "call". Use "ابدأ استقبال الطلبات".
- Job cards are about 380pt tall and carry three CTAs. Make compact rows with one primary.
- "Your share ₪85.85" and "Accept at ₪101" are unlinked. Write "You get ₪85.85 · customer pays ₪101".
- The allowed price range is shown in error red. Use info tone.
- The trip sheet has no destination or fare.
- The cash-limit headroom should be a progress bar.
- The tab labels "طلبات" and "طلباتي" differ by one letter.
- A pending driver should see the Account tab only.

**Shop and merchant**
- The first Add on a weighed item adds 1 kg; the stepper is 250 g. This is a bug.
- Store rows: name 15 ink, price 15/700, a 40pt round "+", and the basket bar shows count and total.
- A closed shop card at opacity 0.7 drops to about 3:1. Use full opacity with "Opens 04:30".
- Consent: the decision card goes first, with the countdown chip.
- Catalogue: "Out of stock" is shown as a pill on items that are in stock. Use a native Switch labelled "In stock".
- Inbox: sort needs-action first and make the banner tappable. The hours editor moves to settings.
- Preparing: "Add package" sits 0px above "Order ready".
- Decline is 1:1 on its card. Make it an error outline.

**Account and profile**
- Sign out is red while Delete account is neutral. Swap them.
- The invite code needs a Copy button.
- Use six OTP cells for the phone code.
- Placeholders are missing, and the password field needs a reveal toggle.

**Admin and onboarding**
- Fields are invisible (system 2), and selected states read as disabled (system 3).
- User cards are about 300px with three actions and a delete. Use `DataRow` with a detail sheet.
- Settings show percentages as decimals (0.15 means 15%). Show % and ₪ suffixes.
- In Subscriptions, Activate and Reject are the same size. Make Reject an error outline with a confirm.
- The driver sign-up form is about 1,800px with no sections. The vehicle tiles are ragged.
- Phone recovery: the steps are out of order.
- welcome-1 is an abstract cube. Show a mini map card from pin to pin.
- welcome-2's "Clear pricing" tag looks like a CTA.
- The dashboard chart is one bar. Use KPI deltas or a sparkline.
