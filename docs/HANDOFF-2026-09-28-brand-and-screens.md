# Handoff: logo, animation, missing screens, screenshots (28 Sep 2026)

Read this first, then `docs/screens/README.md`. It lists every screen as a screenshot (Arabic and English) next to its source file.

## What changed

### Logo
- New Wind mark: three wind lines moving toward a terracotta destination dot, on the olive tile. It replaces the Ionicons "navigate" placeholder and the chart-like app icon.
- One geometry, two renderers: `logoMark` in `src/ui.tsx` (the `<Logo />` component, built from Views, no SVG dependency) and `scripts/make_icon.py` (writes `assets/icon.png`, the adaptive icon layers, `splash-icon.png` and `favicon.png`).
- Android adaptive icon: the background layer is now solid olive and the lines sit inside the safe zone. `app.json` adaptive `backgroundColor` is `#34765A`.

### Animation
- `src/intro.tsx` is the animated intro. It starts on the exact native splash frame (tile 120pt; `app.json` splash `imageWidth` changed 200 → 120). A gust blows through the three lines, the dot lands, the tile rises, and the name and tagline appear. It lasts 1.6s, then fades over whichever screen the session resolved to (`IntroOverlay` in `src/app/_layout.tsx`). The native splash now hides when the intro mounts, not when the session is ready.
- The order screen shows a "finding a driver" radar while an order is `searching` (`Radar` in `src/ui.tsx`, used in `src/app/order/[id].tsx`). It replaces the status-steps card in that state only.
- With reduced motion on, nothing moves and each state still reads.

### New screens
| Screen | File | Why |
|---|---|---|
| Welcome (3 slides) | `src/app/welcome.tsx` | First launch only. `session.onboarded` is stored under the key `onboarded`, and any device that has signed in counts as onboarded. |
| Help & support | `src/app/help.tsx` | FAQ (8 answers), WhatsApp support, privacy. Reachable signed out. `?topic=password` opens that answer, and "Forgot password?" on sign-in links there. |
| Edit profile | `src/app/profile.tsx` | Uses the existing `POST /api/me` (name). The phone number is read-only. Opened by tapping the account card. |
| Receipt | `src/app/receipt/[id].tsx` | Product requirement U7. Shows the route, service, driver, payment, proof and total, plus commission and net for drivers. Opened with "View receipt" on a completed order. Share sheet on native. |

Copy for all of these is in `src/copy.ts` (Arabic and English). The routes are registered in `src/app/_layout.tsx`: `welcome` is shown when signed out and not onboarded, `auth` when signed out and onboarded, `profile` and `receipt/[id]` when signed in, and `help` always.

### Seeing the app (for Claude Code)
- `npm run screens` (`scripts/screens.mjs`) builds the web app, starts the API on a temporary database, seeds realistic data, and screenshots 30 screens in both languages (68 PNGs, including 5 intro frames). It writes `docs/screens/README.md` (screen → route → code), `manifest.json`, and `index.html`.
- `/screens` in Claude Code (`.claude/commands/screens.md`) re-shoots the screens and reviews them against the code.
- `CLAUDE.md` now points here and records the brand rules.
- `playwright` was added as a dev dependency. Run `npm install` and then `npx playwright install chromium` once.

## Checks run
`npm run typecheck`, `npm run lint` and `npm test` all pass. `npm run screens` captured all 68 shots, and they were reviewed visually in both languages.

## Not done / worth knowing
- **Unmerged branch:** `.claude/worktrees/wind-app-end-to-end-a6a468` (branch `claude/wind-app-end-to-end-a6a468`) has a live map, tracking and an admin `live` screen that are not on `master`. This work was done on the `master` working tree. Merging that branch will conflict in `src/ui.tsx`, `src/app/_layout.tsx`, `src/app/order/[id].tsx`, `src/copy.ts`, `src/session.tsx` and `src/parts.tsx`.
- Nothing is committed. The working tree already had line-ending-only changes on most files before this work.
- Android 12+ masks the splash icon to a circle. Check the handoff from the native splash to the intro on a real Android device.
- The welcome slides change with buttons and dots, not swipes.
- Receipt sharing is hidden on web (there is no reliable share sheet there).
