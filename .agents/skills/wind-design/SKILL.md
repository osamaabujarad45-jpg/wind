---
name: wind-design
description: Wind UI. Use before adding or changing any screen, flow, component, on-screen string, status, notification text or map overlay in this repo, and when reviewing such a change.
---

# Wind design

A Wind screen reads like a **road sign**: glanced at in sunlight, by a captain at a checkpoint or a shopper with one hand free. One message, one way forward. When in doubt, remove words and make the one thing bigger.

Behaviour comes from the SRS (`docs/requirements/`) and `docs/design/FLOWS-2026-11-26-one-app-profiles.md`. Colour, type scale, journey states and map style come from `src/theme.ts` and the Wind design system (claude.ai/artifact/RStqwTQ9eqkKgo5k5i7Y6u). Components come from `src/ui.tsx`. Where the older design system asks for more text or more boxes than this skill, this skill wins. The reasons are in `docs/design/DIRECTION-2026-11-27.md`.

Check for another active session or worktree editing the same UI files before you start; one writer per file.

## 1. Frame

Write three things into your task notes before touching code:

1. **The job**, in one sentence: who is looking, and what they decide or learn.
2. **The one primary action**, or none.
3. **The inventory**: every control, link, state and warning on the screen today (read the source, not just a screenshot; include loading, empty, offline, error, permission and time-expired states).

Done when every inventory line has a destination: kept, moved (name where) or removed (name the requirement that no longer needs it). A redesign that loses a function is rejected.

## 2. Cut the words

### Never cut

Visible text that carries any of these stays visible, in full, even over budget. Shorten it only if every fact survives.

| Keep on screen | Source |
| --- | --- |
| In booking, what is missing, in words next to the control | SRS BOOK-01 |
| "Cash only" and "the captain may not carry change", before confirm | SRS BOOK-03, PAY-02 |
| Who pays, when, how much and the breakdown, before confirm | FLOWS S12 |
| A shop's rejection reason, shown to the customer | SRS DLV-07 |
| The window for reporting a problem, which can end in account credit | SRS TRK-09 |
| Who acts and what comes next ("Ask for the delivery code"), unless a button, a code card or a field on the same screen already says to do it in those words | FLOWS §6 rule 4 |
| The exact-cash rule above the captain's job board, said once | design review, 17 November |
| A switched-off capability inside a live service reads "not available in this stage"; a switched-off service line is not shown at all, never as a dead tile | SRS ONE-13 |
| A running countdown, what happens when it ends, and the way to extend it | SRS A11Y-08 |
| Why something cannot be done, when money, custody, proof, access or safety is at stake | FLOWS §6 rule 3 |
| Money-safety warnings such as "Do not send it again from here" (`err_cash_storage_failed`), seal and handover requirements, locked verification and who unlocks it | SRS PAY-04, SHIP-05, SHIP-17, DLV-13 |
| Anything required for legal or privacy consent | SRS |

If a requirement and a rule below disagree, the requirement wins.

### Cut everything else

- **Explanation: none by default.** One sentence is allowed when the person must act now and the consequence is not obvious.
- **Say it once.** The header, a badge, a card title and a caption never repeat the same fact.
- **Labels are one to three words.** A status is the fixed journey word, not a sentence. A required fact is not a label and is not cut to fit this.
- **Icons and layout carry what labels used to.** The route rail's ring and pin mean pickup and destination; those words also go to the accessibility label.
- **A blocked action offers the way through.** Prefer making the unblocking action the primary button, with a label that says what is missing (offline captain: "Go online"). If the person cannot clear the block with a button here, or the table above applies, the reason stays visible next to the control.
- **Fields explain themselves** with a label and a placeholder example. Rules appear when the input breaks them.
- **Help lives where help is asked for**: Help, first-time moments, or an expandable row. Diagnostics and support detail stay off working screens.
- **Errors**: what happened and the next step. One sentence; two when the second prevents a double payment, a lost parcel or an unsafe act.

`accessibilityLabel` **adds to** visible text; it never replaces information a sighted person needs. Move text there only when the layout already shows the same fact.

Done when you can name the reason for every sentence left on screen, in Arabic and English, and every row of the table that applies to this screen is still visible.

## 3. Compose

- **One hero per screen**: the ETA, the fare or share, the decision, or the question ("Where to?"). It is visibly larger than everything else.
- **One primary button**, pinned at the bottom. Second choices are outline or text.
- **Map screens**: the map is the screen, with one sheet over it.
- **Lists are rows on the ground** separated by hairlines. A **card** marks the single live or decision object. Never a card inside a card, or a gray panel on a gray ground.
- **Shape means something.** Pill: the primary button and controls floating on the map. Underline tabs: switching a view. Rounded 12: fields and selectable values. A state is a dot or icon plus its word; a filled badge is reserved for live and problem.
- **Icons stand alone.** A tinted tile behind an icon marks a service line (Ride, Send, Shop) and nothing else.
- **Colour is information.** Service hues only on service glyphs; clay only on the logo pin and destination; amber waits on a person; solid red is a real problem.
- **Spacing does the grouping** on the 4px scale: 8 within a group, 16 to 24 between groups. Touch targets are 44px with 8px between them.
- **Motion** explains a change of state; nothing animates on arrival just to be seen. Respect reduced motion.

## 4. Arabic first

Compose in Arabic, then check English. Mirror layout and directional icons. Keep numbers, codes, plates and phones left to right. Wrap user-written text (names, landmarks) with `isolate()` from `src/model.ts`; give it `dir="auto"` in web-only HTML.

Judge word order and truncation only from a render with the two strings in different colours. Reading Arabic order from a screenshot by eye gives false results.

## 5. Type

Readex Pro for both scripts, using the roles in `src/ui.tsx` (`Txt variant=…`). One hero size per screen. Pick a weight with `fontFamily: face.*` (`src/theme.ts`), never `fontWeight`: a Text without a Readex family falls back to the system font, which in Arabic reads as a different product. Money and times use tabular figures. Nothing below 12, except the drawn route diagram (11px). A phone tab bar holds at most five tabs; further pages go under More.

**Line height is at least 1.7× the size.** Readex draws the dots under a final ي half an em below the baseline; a tighter line cuts them off in any line-limited label, and "حسابي" reads "حسابى". This replaces the design system's 1.4–1.55×. Set `lineHeight` with `fontSize` on any style used with `numberOfLines` (`tests/type-face.test.mjs`).

## 6. Reject these

Each one reads as generated rather than designed:

- a sentence under every control, or a subtitle under every title;
- everything in its own rounded, shadowed card;
- a pill for actions, filters, statuses and tabs on the same screen;
- tinted icon squares on every row;
- several soft pale buttons of equal weight;
- label-over-value pairs where the value is obvious on its own;
- emoji, gradients added for decoration, invented figures or placeholder content;
- the same device repeated until it reads as a tic.

## 7. Verify

Done when every line is true, with evidence:

1. `node scripts/design-check.mjs` passes. After cutting text, run it with `--update` to lower the budget. It only ratchets down. Required text (§2 table) that needs more room gets a hand edit of `docs/design/text-budget.json`, with the requirement named in the commit. The script cannot see a hand edit, so any raised number in that file is a review item.
2. `npx tsc --noEmit`, `npx expo lint` and the affected tests pass, and `npm run screens` passes in the Docker sandbox. You **opened** the new Arabic and English captures and read the Arabic, looking for lost dots and cut letters.
3. Checked at 390 and 320 wide, at 200% text, and Night where the screen has it. New controls have accessibility names and states.
4. Your inventory from step 1 is walked again against the result.
5. Edited `public/map.html`? Its CSP `sha256` matches the inline script (`tests/booking-map-feedback.test.mjs`). A stale hash blanks every map.
6. The independent reviewer's brief includes this file and your inventory, and asks them to check: every applicable row of the §2 "never cut" table, any raised number in `text-budget.json`, and text built from computed keys.

## Other kinds of change

- **A new or changed string only** (no layout change): §2, §4, §7.1 and the Arabic read.
- **Notification text** (`server/push.ts`, `public/sw.js`): one short line, no names, places or message text, and the next action. §2 and §4 apply; the checker counts `server/push.ts`.
- **Map overlay** (`public/map.html`): the maps section of the design system, §4, and §7.5.
- **Review of someone's UI change:** walk §1's inventory against the diff, then §2, §3, §6 and §7.
