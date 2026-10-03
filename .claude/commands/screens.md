---
description: Re-shoot every Wind screen (Arabic + English) and review them against the code
argument-hint: "[screen ids or a question, e.g. receipt,profile or 'check RTL on booking']"
---

1. Run `npm run screens` (add `-- --only=<ids>` if the argument lists screen ids; ids are in `docs/screens/manifest.json`).
   First time on this machine, run `npx playwright install chromium` first.
2. Read `docs/screens/README.md` for the map of screen → route → source file.
3. Open the PNGs that matter for this request with the Read tool (both `docs/screens/ar/` and `docs/screens/en/`), and the source file listed next to each.
4. Request: $ARGUMENTS
   - If it names screens, review those. If it is empty, review every screen.
   - Look for: clipped or overlapping text, wrong reading direction in Arabic, touch targets under 44pt, missing empty/error states, anything that disagrees with docs/PRODUCT.md.
5. Report findings as a short list (screen id, what's wrong, file:line). Fix only what the request asks for, then run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run screens` again so the screenshots match the code.
