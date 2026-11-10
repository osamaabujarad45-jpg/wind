@AGENTS.md

Finishing the app: the lead's master plan is `docs/PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md` (rules, sub-agent routing, gates, roadmap, owner decisions). Maps work: start at `docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md` (how the maps work at `1cd0de8`, what is unproven, ranked work queue). Latest handoffs: `docs/HANDOFF-2026-10-31-maps-real-data.md` (real map data, OSM place search, pilot readiness) and `docs/HANDOFF-2026-10-30-phone-acceptance.md` (A53 acceptance, CI repairs, decoder advisory, k5 isolation). Earlier: `docs/HANDOFF-2026-10-21-deploy.md`, `docs/HANDOFF-2026-09-29-uber-careem-redesign.md`, `docs/HANDOFF-2026-09-28-brand-and-screens.md`.

## Seeing the app

Every screen is screenshotted in Arabic and English under `docs/screens/` (`README.md` maps each PNG to its route and source file; open PNGs with the Read tool).
After changing UI, run `npm run screens` (or `/screens`) so the screenshots match the code. The script seeds a temporary API; it never touches `wind.db`.

## Brand

- Logo geometry lives in two places that must stay identical: `logoMark` in `src/ui.tsx` and `scripts/make_icon.py` (run `python scripts/make_icon.py` to regenerate `assets/`).
- The native splash (`app.json`, imageWidth 120) hands over to the animated intro in `src/intro.tsx` (`TILE = 120`). Change both together.
- Animations respect reduced motion (`useReducedMotion`): nothing moves, the state still reads.
