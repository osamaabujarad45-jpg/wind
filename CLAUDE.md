@AGENTS.md

**Start here (26 Nov 2026):** Read `docs/CURRENT-WORK.md`, then `docs/PLAN-2026-11-26-CONTINUE.md`. The plan identifies the single active feature branch, current review evidence, retained worktrees and the next acceptance tasks. Compare historical claims with current code before selecting work.

**Historical research:** For a Fable feature comparison, use `docs/REA/2026-11-15-PLAN-VS-FABLE-PATH.md` and preserved branch `backup/fable-candidate6-20261115`. Earlier lead/map/phone handoffs remain evidence for their named revisions; the current continuation plan determines the work order and gates.

## Seeing the app

Every screen is screenshotted in Arabic and English under `docs/screens/` (`README.md` maps each PNG to its route and source file; open PNGs with the Read tool).
After changing UI, run `npm run screens` (or `/screens`) so the screenshots match the code. The script seeds a temporary API; it never touches `wind.db`.

## Brand

- Logo geometry lives in two places that must stay identical: `logoMark` in `src/ui.tsx` and `MARK` in `scripts/brand-mark.mjs` (`tests/brand-mark.test.mjs` checks). Run `node scripts/make_icon.mjs` to regenerate `assets/` and `node scripts/make_promo.mjs` for the posters in `docs/brand/` (both need Playwright's Chromium, so run them in the Docker sandbox).
- The native splash (`app.json`, imageWidth 120) hands over to the animated intro in `src/intro.tsx` (`TILE = 120`). Change both together.
- Animations respect reduced motion (`useReducedMotion`): nothing moves, the state still reads.

## Agent skills

### Issue tracker

Local markdown: specs and tickets live as files under `.scratch/<feature>/` (no GitHub issues). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each ticket file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
