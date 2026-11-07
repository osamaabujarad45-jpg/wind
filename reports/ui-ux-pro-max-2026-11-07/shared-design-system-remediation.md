# Shared design-system and navigation remediation

- **Date:** 2026-11-07
- **Baseline:** `f8d58c14d43cc31475411899ebfa29c23b04f79c`
- **Audit:** `shared-design-system-audit.md` (DS-01 through DS-08)
- **Implementation:** leader-reviewed changes in `src/ui.tsx`, `src/copy.ts`, admin tabs/More route, and shared/browser regressions. The existing light Wind palette, typography hierarchy, and route-spine identity are preserved.

## Resolved findings

| Finding | Implemented correction | Verification |
|---|---|---|
| DS-01 target geometry | Regular/small buttons, icon buttons, stepper keys, inputs, chips, Choices, and Section actions now have real 48dp minimum geometry. | Shared VM tests inspect actual component props/styles, including both Button sizes and every stepper key. |
| DS-02 scaling/truncation | Removed `Txt`'s 1.35 scale cap; shared Header, Stat, ListRow, and tab labels may wrap. Raw React Native `Text` remains uncapped rather than receiving a new cap. | Tests assert no multiplier cap and no shared one-line limit. Route-owned truncations remain in their route packets. |
| DS-03 input boundary | Added `palette.inputBorder = #7F8781`, retaining existing focus/error colors. | Calculated 3.2934:1 on paper and 3.6939:1 on white; regression requires at least 3:1 against both. |
| DS-04 admin navigation | Five persistent destinations: dashboard, orders, users, cash, More. Subscriptions/settings retain deep links and are discoverable in More. | Browser checks count five tabs, open both More destinations, revisit More, and load settings directly in Arabic and English. |
| DS-05 control states | Immediate pressed opacity across shared raw controls; semantic and visible disabled states; selected Choices have an olivePale fill plus olive border. Disabled Buttons/steppers use a readable muted surface instead of a second opacity wash. | Tests cover pressed/disabled props and presentation. Disabled Button label contrast is at least 4.5:1; disabled stepper icon/surface contrast is at least 3:1. |
| DS-06 reduced motion | Press feedback becomes immediate opacity without scaling; ErrorText has no vertical entrance under reduced motion. | Focused tests assert scale 1 and no entering animation. Browser capture also runs with reduced motion. |
| DS-07 refresh/loading | Refresh always clears in `finally`, consumes the rejection so the owning screen can retain its visible error/stale data, and does not create an unhandled rejection. Loading exposes a localized name, React Native's supported `progressbar` role, busy state, and polite live region. | Resolved and rejected refresh tests; localized busy semantics test. |
| DS-08 RTL badge geometry | Removed the constrained physical-edge badge pill. Pending count now joins the wrapping tab label (`Users · 1`), while the icon keeps its normal pill. Visual counts cap at `99+`; accessible names retain the full localized count. | Tests cover label count, wrapping, accessible name, and absence of the overlapping badge. Independent final visual review found no overlap or crowding. |

## Navigation defects caught during verification

Expo Router implements `href: null` through `tabBarItemStyle`/`tabBarButton`; a custom tab bar must honor them. `TabBar` now filters those routes. When a hidden route is current, More is visually selected but is not treated as actually focused by the press handler. The latter was a real browser-discovered defect: the first implementation looked selected but could not navigate back to More. A focused component regression and the bilingual browser journey now cover it.

## Independent visual evidence

Reviewer: external Claude **Haiku 5.5** (`claude-haiku-5-5`), read-only, image-capable. No source changes or permission denials. These are visual observations, not WCAG, keyboard, screen-reader, or runtime-semantics certification.

1. **Shared review:** all 16 requested current PNGs opened; none unreadable. No blocker/high issue in the eight Arabic/English pairs. It identified weak selected/disabled presentation and badge/icon overlap for correction.
2. **Correction follow-up:** all 16 requested PNGs reopened; none unreadable. Selected Choice and disabled control checks passed in both languages; badge/icon overlap was gone. No blocker/high issue remained. A medium cramped-pill observation prompted the final count-in-label design.
3. **Admin finish gate:** all eight admin dashboard/users/More/settings PNGs reopened; none unreadable. Verdict: the count-in-label design resolves crowding; **no blocker, high, or medium issue remains in these eight images**. One low note says the Arabic Users label extends slightly beyond the decorative active icon pill; it is not clipped, has no overlap, and the label need not fit inside that separate pill.

Route-owned observations are deliberately not marked resolved here: map label/pin occlusion belongs to booking/map work; profile primary-action hierarchy belongs to account work; mixed-language seeded names/content are not evidence of a shared RTL failure.

## Automated and browser gates (local fallback)

- `node scripts/run-tests.mjs --filter=shared-ui`: **17 checks passed**.
- `presentation`, `phone-ui`, and `driver-presence-card` suites: passed.
- `npm run lint`: passed with no warnings.
- `npm run typecheck`: both app and server TypeScript projects passed.
- Final admin-focused browser run: export passed; eight screenshots saved; five-tab, More destination, hidden deep-link, and direct-settings assertions passed in Arabic and English.
- Final full browser run from the exact shared bundle: admin proof recovery, five-tab/More/deep-link checks in both languages, driver tracking/permission recovery, and 360px 100%/130% text checks with reduced motion passed; **98 screenshots saved**. The immediately preceding full export also passed; this final run intentionally reused that exact bundle with `--no-build`.

## Remaining acceptance limits

- Physical Samsung `SM-A5360` / TalkBack / external-keyboard / actual-hit-rectangle acceptance has **not** been performed in this slice and remains required before whole-app completion.
- K5 SSH keys remain refused; all commands above are explicitly **local fallback**, not remote evidence.
- Static PNGs cannot establish pressed behavior, reduced motion, loading announcements, focus, or TalkBack output. Those claims come only from the separately listed component/browser checks, not from the visual reviewer.
- Generated `docs/screens/**` changes remain outside this atomic source commit until the final whole-app recapture.
