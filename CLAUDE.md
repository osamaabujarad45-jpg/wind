@AGENTS.md

Latest implementation handoff: `docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md`.

Start there before selecting work. The workspace has user-owned changes, so inspect `git status` and preserve unrelated files.

## Seeing the app

Every screen is screenshotted in Arabic and English under `docs/screens/` (`README.md` maps each PNG to its route and source file; open PNGs with the Read tool).
After changing UI, run `npm run screens` (or `/screens`) so the screenshots match the code. The script seeds a temporary API; it never touches `wind.db`.

## Brand

- Logo geometry lives in two places that must stay identical: `logoMark` in `src/ui.tsx` and `scripts/make_icon.py` (run `python scripts/make_icon.py` to regenerate `assets/`).
- The native splash (`app.json`, imageWidth 120) hands over to the animated intro in `src/intro.tsx` (`TILE = 120`). Change both together.
- Animations respect reduced motion (`useReducedMotion`): nothing moves, the state still reads.
