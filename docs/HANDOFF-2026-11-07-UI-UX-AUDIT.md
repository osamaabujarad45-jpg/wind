# Handoff — UI/UX audit, 7 November 2026 (for the Opus 5.5 review)

**Branch:** `claude/ui-ux-audit-2026-11-07b` · **Worktree:** `C:\audit-review` ·
**Base:** `b609229` (the local `master`) · **Full report:** `reports/ui-ux-audit-2026-11-07.md`

## What is in the branch

Four commits, in this order:

1. `chore(app): the product baseline this UI audit sits on` — the product work that was
   already uncommitted in the workspace before the audit (presence, driver recovery, maps,
   the new screens and their tests, the docs). It is here so the audit commit can be read
   on its own; nothing in it was written by the audit.
2. `fix(ui): the full UI/UX audit — type scale, touch targets, semantics and headings on
   every screen` — the audit itself: every screen file, the shared library, the copy, the
   audit tooling, the report and the regenerated screenshots.
3. `fix(deps): vendor the upstream 0.5.1 decoder instead of the hand-written backport` —
   the vendored URL decoder was the 0.5.0 algorithm with a scanner added by hand, but its
   replacement map still scanned the whole input once per key: 32,000 distinct percent-runs
   took 8.7 s, so CVE-2026-118664 was not fixed and `tests/url-decoder.test.mjs` failed.
   Upstream 0.5.1 is the release that fixes it (118 ms for the same input) and it is what
   the repository's own decoder test expects. The file stays CommonJS for Expo Router's
   query-string 7 and the reviewed-bytes pin is updated, so the dependency gate still
   holds.
4. `fix(ui): the admin's sign-out was three scrolls down` — found on the physical phone, not
   in the web build: in `src/app/admin/settings.tsx` the account actions sat below the
   pricing cards *and* the promo-code form, and the admin bar already holds the five tabs
   the navigation limit allows. The settings now opens with a "حسابي" row that leads to a
   new `/admin/account` route — the same shared account screen the customer and the driver
   use, with a back button because it is a stack screen — so the sign-out is one tap from
   the settings. The settings keeps the work and no longer repeats the language, the
   password or the sign-out. The device screenshots and the per-screen notes are in
   `docs/screens/device-2026-11-07/`.

The workspace had CRLF line endings in the edited files while the repository stores LF.
The edited files were normalised to LF so the diff shows the real change and not every
line; the content is untouched.

## What the audit did

- Every screen under `src/app/` and every shared component in `src/ui.tsx` / `src/parts.tsx`
  was read, then measured in the running app with `scripts/ui-audit.mjs` (34 screens ×
  Arabic and English at 360×800).
- The findings went from **2170 to 14**, and the 14 are the local routing provider answering
  `503` for `/api/route` (no key in the sandbox; the app draws its straight-line fallback).
  Touch targets, text size, contrast, line height, truncation, overflow, accessible names
  and heading structure are all at zero.
- The shared library carries the fixes: an explicit line height on every variant, a 44 pt
  minimum on every control, `maxFontSizeMultiplier={1.35}`, `header` on `Txt`, a reason on
  every disabled button, radio-group and tab-list semantics, errors next to their field.
- The copy is in both languages for every new key, and the `·` separators became commas so
  the facts can wrap and a screen reader does not read a middot.

Full inventory, before/after numbers and the file-by-file list: `reports/ui-ux-audit-2026-11-07.md`.

## How to verify it yourself

```powershell
npm run screens                 # 98 screenshots (49 Arabic, 49 English) + 360 px / 130% text
node scripts/ui-audit.mjs       # 68 combinations measured; 14 findings, all external
node scripts/ui-audit-summary.mjs
npx tsc --noEmit               # clean
npx expo lint                  # clean
npm test                       # 105 suites passed
npm run check:audit            # the high-severity chain stays mitigated
```

The PostgreSQL suites need the isolated loopback database:
`node scripts/local-postgres.mjs start` (port 55473).

## What to review hardest

- `src/ui.tsx` — the type scale, the touch targets, `Txt`'s `header`, the `reason` on
  disabled buttons, and the semantics of `Choices`, `FilterChips` and the tab bar.
- `src/copy.ts` — every new key in Arabic and in English, the placeholders, and the
  wording that must not promise what the app does not do.
- The RTL mirroring: the app mirrors manually through `useCopy().row` / `rtl` / `align`.
  Check that no screen reads backwards in Arabic and that no `I18nManager.forceRTL` crept in.
- The admin chart, the driver job list and the booking sheet: the ones that carry the most
  information per row.
- `scripts/screens.mjs` and `tests/driver-presence-card.test.mjs` — two stale checks were
  corrected (the foreground-recovery route pattern and the phone-recovery link role), and
  one assertion was narrowed to the rule it was written for. The app's behaviour was not
  changed for them.

## The device pass

The automated audit measures the exported web build, so the final acceptance was done the
way the repo requires: on the owner's phone (`SM-A5360`, adb `R5CTB0FJP9Z`, 360×800 dp).
A local debug APK of this branch was built from a short-path copy (`C:\p`, `gradlew -g C:\g`)
and installed under a separate package name (`ps.wind.audit`), so the installed release app
was never touched. It ran against a throwaway seeded API over `adb reverse`.

All three roles were walked through the real app — customer, driver, admin — and every
screen was read through the on-device accessibility tree, which is what a screen reader
sees. Eleven screens are captured in `docs/screens/device-2026-11-07/` with the tree
confirmation for each. No JavaScript errors were logged during the walkthrough.

The device pass is what found the buried admin sign-out, and it is what confirmed the
rules the web build cannot show: the RTL layout, the reason on every disabled control, the
error next to every field, the chart's per-point names, the tab counts and the
reduced-motion behaviour.

To repeat it: build from a short path (`robocopy` the project to `C:\p` without
`node_modules/**/android/.cxx`, then `gradlew -g C:\g assembleDebug`), install the APK
under a scratch package name, `adb reverse tcp:8081 tcp:8081` and `tcp:4100 tcp:4100`,
and run a seeded API on 4100.

## Known limits, stated plainly

- The map is MapLibre, not Google Maps. Its attribution and its cooperative-gesture hint are
  the vendor's own overlay (2.85:1 white on grey) and are not the app's text.
- The local routing provider has no key, so `/api/route` answers 503 and the console
  finding stays until one is configured.
- The debug build on the phone was a local build with the debug keystore, so it could not
  be installed over the release build (different signature); it was installed beside it
  under a scratch package name instead. The owner's installed app was not modified.
