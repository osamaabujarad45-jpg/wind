# Design direction, 27 November 2026

Status: **type, primitives and the first round of text cuts delivered (28 November)**; layout redesign of the remaining screens is open (see *Where it stands*). The owner has the four-screen proof and can change the direction at any point. Rules for daily work: [`.agents/skills/wind-design/SKILL.md`](../../.agents/skills/wind-design/SKILL.md).

The owner's brief: too much text on screen; the app reads as generated; use the design system and design-taste skills; make it look like professional human design; keep it matched to the new profile flows; no conflicting or wasted work.

## Which design system

**Keep the Wind design system (22 Nov, claude.ai/artifact/RStqwTQ9eqkKgo5k5i7Y6u) as the base.** It is the product's own, its tokens and Night theme are already in `src/theme.ts`, and its five journey states and map rules fit the one-app flows. The v1 kit is superseded by it.

**Change the rules that produce the current look:**

| System rule or habit | Now |
| --- | --- |
| "Say why": every waiting control has a sentence under it | Offer the action that unblocks it; a reason is the exception |
| Components shown as cards, pills and tinted tiles | Rows on the ground; a card only for the live or decision object; shape carries meaning; tiles only for service lines |
| Several equal sizes on one screen | One hero per screen |
| Status as a sentence in a badge | A dot or icon and the fixed word |

`taste-skill` (github.com/Leonxlnx/taste-skill, MIT) targets marketing websites. We took only what carries over: short text, at most two nested boxes, one button and card style, no gray panel on gray, render and look at narrow widths. It is not installed. `design-director` (installed) supplies the review method.

## What the evidence shows

1. **Fonts.** At the F5 base (`4ecb7e15`) only Readex Pro SemiBold and Bold were loaded (`app.json`, `src/app/_layout.tsx`). Body, caption, label and title text used the system font, so Arabic fell back to a Naskh book face beside Readex headings (seen in the captures; Android's own Arabic font is Noto Naskh). The system asks for Readex everywhere; the 17 November review asked too. Regular and Medium (OFL, Arabic covered, internal names checked) are now in `assets/fonts`; Android embeds fonts at build time, so this needs a new APK. Two things the new face changed, both fixed: it draws the dots under a final ي half an em below the baseline, so at the system's 1.4–1.55 line heights "حسابي" rendered as "حسابى" (reproduced with the real files; line heights are now about 1.75); and it is wider, so eight admin tabs split words (a phone now has five).
2. **Text.** At the start of this work, screen code made 440 references to explanatory sentences (counted when either language is long) and had 98 reason lines under buttons (every state, not all visible at once). The heaviest: `order/[id].tsx` (93 sentences), `book.tsx` (42), `driver/index.tsx` (27), `admin/cash.tsx` (21). `scripts/design-check.mjs` now holds this budget and only lets it go down.
3. **Sameness.** Cards, pills and tinted icon tiles on every screen leave no hierarchy.

The budget was re-based once, on 27 November, when the checker began counting a string that is long in either language and the web worker's notification words. The old and new source counted the same under the new checker (440 references, 9555 words, 98 reason lines; catalogue 15684, push 566, web worker 406), so no text was added.

## Order of work

Each slice is one reviewable change, based on the committed F5. Each ends with the text budget lowered, new Arabic and English captures opened, and phone checks.

| # | Slice | Notes |
| --- | --- | --- |
| 0 | Land the waiting fixes: map pin direction (with its CSP hash), header and order badge, money minus, web switch, duplicate consent text, button gaps, profile email wrap | `fix/design-review-1127`; still correct under the new direction |
| 1 | Type: add Readex Regular and Medium; every `Text` resolves weight to a Readex file | New native build |
| 2 | Primitives in `src/ui.tsx`: status, row without tile, view tabs, blocked-action pattern | Everything after builds on these |
| 3 | Home, booking | |
| 4 | Captain: Jobs, active job, earnings | |
| 5 | Live trip and order detail (largest text cut) | |
| 6 | Shop: consent and cart, then the merchant tabs | |
| 7 | Profile switcher, account, orders | Builds on `feat/profile-switcher-1127` |
| 8 | Admin, then update the design-system artifact to match | |

## Where it stands (28 November)

- Done: slices 0–2; admin five tabs with More; profile switcher entry points and states; captions that repeated a title, card or button cut across the live order, captain, shop, profile and earnings screens; state-correct wording for shop returns, support takeovers and safety pauses; a captain can accept a waiting order without opening the sheet.
- Measured: screen text went from 9,555 to 9,412 words (Arabic and English together). Most of what is left on the screens checked is required text (codes, cash, safety, consent), so the next visible gain is layout, not more cuts.
- Open: the layout work in slices 3–8 (for example, the shop cart's main button should set the missing delivery pin), the design-system artifact update, and a phone check on a new APK (the fonts are embedded at build time).
- Server follow-ups found by review, in `.scratch/`: profile-updates, takeover-public-track; app follow-up: order-announcements.

## Who owns what

Agreed with the lead session on 27 November: it keeps server, session, device acceptance, rollback and the signed update. This work owns visual design, shared primitives, on-screen copy and the design skill. It asks before editing a screen for a failing acceptance flow. Nothing here is merged over uncommitted work.

## Open for the owner

- Approve the direction in the proof, or say what to change.
- The proof's maps are drawn stand-ins; the app keeps real tiles. Its screens show the main state only; every other state is designed in its slice using the skill's inventory step.
