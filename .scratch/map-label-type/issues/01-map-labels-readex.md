# Map stop labels use the system font

Status: needs-triage

`public/map.html` draws the pickup, dropoff and ETA labels in `system-ui` at 12px/18px. The app's screens use Readex Pro
with line height at least 1.7x (`.agents/skills/wind-design/SKILL.md`). `origin/master` has the same label styles, so
the redesign (PR #125) did not change them. `tests/type-face.test.mjs` reads `src/` only.

## To do

- Serve the two Readex Pro faces the labels need to the map page (same origin; the CSP already allows `font-src 'self'`),
  for the web build and the Android WebView, and check the offline and cold-load budgets in `scripts/check-scenarios.mjs`.
- Set the labels to Readex Pro with line height 1.7x and check the label offsets against the markers in Arabic and English.
- Extend `tests/type-face.test.mjs` to read the map page's styles.
