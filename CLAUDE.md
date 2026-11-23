@AGENTS.md

**Start here (15 Nov 2026):** `docs/HANDOFF-2026-11-15-OPUS-LEAD.md` (what is live, what merged, open work, K5/phone recipes) and `docs/REA/2026-11-15-PLAN-VS-FABLE-PATH.md` (the work order; it follows the Fable 5.2 path in `docs/fable/`). Fable's unmerged implementation is preserved on branch `backup/fable-candidate6-20261115`: port from it, don't re-invent.

Finishing the app: the lead's master plan is `docs/PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md` (rules, sub-agent routing, gates, roadmap, owner decisions). Maps work: start at `docs/HANDOFF-2026-11-10-MAPS-FOR-ASTRA-6.md` (how the maps work at `1cd0de8`, what is unproven, ranked work queue). Latest handoffs: `docs/HANDOFF-2026-10-31-maps-real-data.md` (real map data, OSM place search, pilot readiness) and `docs/HANDOFF-2026-10-30-phone-acceptance.md` (A53 acceptance, CI repairs, decoder advisory, k5 isolation). Earlier: `docs/HANDOFF-2026-10-21-deploy.md`, `docs/HANDOFF-2026-09-29-uber-careem-redesign.md`, `docs/HANDOFF-2026-09-28-brand-and-screens.md`.

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
