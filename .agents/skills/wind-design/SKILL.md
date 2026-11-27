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

Text budget per screen state:

- **Explanation: none by default.** One sentence is allowed when the person must act now and the consequence is not obvious: money, safety, custody, or something that cannot be undone.
- **Say it once.** The header, a badge, a card title and a caption never repeat the same fact.
- **Labels are one to three words.** A status is the fixed journey word, not a sentence.
- **Icons and layout carry what labels used to.** The route rail's ring and pin mean pickup and destination; those words go to the accessibility label.
- **A blocked action offers the way through.** Show the action that unblocks it as the primary button (offline captain: "Go online"). A reason line is for the rare block the person cannot clear, or appears after they try.
- **Fields explain themselves** with a label and a placeholder example. Rules appear only when the input breaks them.
- **Help lives where help is asked for**: Help, first-time moments, or an expandable row. Diagnostics and support detail stay off working screens.
- **Errors**: what happened and the next step, one sentence.

Screen readers still get the full meaning: put what you removed from the screen into `accessibilityLabel` when it is information, not decoration.

Done when you can name the reason for every sentence left on screen, in Arabic and English.

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

Readex Pro for both scripts, using the roles in `src/ui.tsx` (`Txt variant=…`). One hero size per screen. Nothing below 12. Money and times use tabular figures. A `Text` with its own `fontWeight` must also resolve to the matching Readex file; a system-font fallback in Arabic reads as a different product.

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

1. `node scripts/design-check.mjs` passes. After cutting text, run it with `--update` to lower the budget. It only ratchets down; a real exception needs the owner's agreement and a hand edit with the reason in the commit.
2. `npm run screens` passes in the Docker sandbox, and you **opened** the new Arabic and English captures.
3. Checked at 390 and 320 wide, at 200% text, and Night where the screen has it. New controls have accessibility names and states.
4. Your inventory from step 1 is walked again against the result.
5. Edited `public/map.html`? Its CSP `sha256` matches the inline script (`tests/booking-map-feedback.test.mjs`). A stale hash blanks every map.
6. The independent reviewer's brief includes this file and your inventory.
