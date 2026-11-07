# Launch, authentication, home, and orders remediation

- **Date:** 2026-11-07
- **Baseline:** `f8d58c14d43cc31475411899ebfa29c23b04f79c`
- **Branch/worktree:** `claude/ui-ux-pro-max-20261107-final` / `ui-ux-pro-max-20261107-final`
- **Audit:** `launch-customer-audit.md`
- **Scope:** Welcome, sign-in/sign-up/reset entry points, customer Home, Orders, their shared order rows and external-link/loading/retry behavior. Booking, order detail, receipts, driver, admin, account, and public tracking remain separate slices.

## Resolved audit findings

| Finding | Implemented correction | Evidence |
|---|---|---|
| W-D1 slide context | Pagination uses real 48dp radios, checked state, RTL-aware arrows, vertical arrows, Home/End, roving tab index, and focus preservation. A persistent polite live region contains the changing slide copy; only its animated child is replaced. | Bilingual direct-selection/keyboard/arrow/Home/End browser checks, live-region node persistence, and focus-preservation assertions. |
| A-D1 pending mode change | Sign-in/sign-up choices are disabled while authentication is pending. | Held login response; forced mode-click attempt; checked mode, fields, and enabled state before and after rejection. |
| A-D2 field validation | Pure validation selects the first invalid field; fields have refs, attached error descriptions, and first-invalid focus. Consent has checkbox state, hint, described error, and correction clearing. | Pure validation suite plus blank sign-in and sign-up consent browser checks. |
| A-D3/A-D4 reset transitions | Revealed OTP receives focus; reset instructions have a live region; changing a sent identifier clears OTP, new password, and old errors; reset completion uses alert semantics. | Two-identifier browser journey checks focus and empty secrets, submits a successful intercepted reset with failed automatic login, and observes the reset-complete alert. |
| A-D5 target sizes | Welcome controls, Home entries, legal links, and shared HelpLinks have real 48dp/48px minimum geometry rather than hit-slop-only compensation. | Component style tests and browser bounding-box checks for shared footer links; narrow reflow matrix. |
| A-D6 external-link failure | A small async adapter reports `Linking.openURL` resolution/rejection. Auth and HelpLinks clear old failures and expose localized assertive recovery text on rejected handoff. | Executed adapter success/rejection tests; browser overrides `window.open` to throw and observes the visible alert. |
| H-D1 service intent | Multi-service Home opens an explicit chooser; a single enabled service navigates directly with the correct service and destination/schedule intent. | Bilingual multi-/single-service URL and parameter assertions. |
| H-D2 Home target | Both Home entries have real minimum 48dp geometry and grow with content. | Static geometry checks and 360px 100%/130% browser matrix. |
| H-D3 active-order copy | Home uses singular/plural active-order headings. | Normal multi-active fixture checks the plural heading in both languages. |
| H-D4 zero services | Empty capabilities produce an explanatory Help recovery state; both entries and recent booking rows are disabled; a stale empty chooser cannot remain exposed. | Zero-service browser journey, including disabled recent parcel/ride history and no empty chooser. |
| H-D5 recent names | “Request again” accessible names include service, origin, localized direction word, and destination. | Same-city parcel/ride fixtures assert distinct localized accessible names. |
| O-D1 empty Orders CTA | Enabled services have direct booking CTAs; zero services offers Help instead. | Empty-list browser journey activates Freight and verifies `/book?service=freight`. |
| X-D1 loading feedback | Shared Loading has a localized visible label, accessible name, progressbar role, busy state, and polite region. | Shared component semantics/visible-text test. |
| X-D2 reduced motion | Shared errors omit vertical entrance when reduced motion is requested. | Shared component test; browser matrix runs with reduced motion. |
| X-D3 retry duplication | Visible Home/Orders Retry uses `retry()`/`retrying`, joining an active request and exposing disabled/busy feedback. Forced `reload()` remains available for post-mutation freshness. | Real-hook success/failure/request-count tests and held-response browser double-click checks. |
| X-D4 stale-data recovery | Stale Home/Orders data remains visible with a named Retry action and visible busy state. | Bilingual failed-poll/stale-row/retry-recovery journeys and stale-state screenshots. |
| H-H1/H-H2 layout hypotheses | Home/order text is uncapped; scheduled metadata wraps and shrinks safely; service tiles stretch to equal heights. | 360px Arabic/English 100%/130% top-and-bottom browser checks, overflow/clipping assertions, and separate visual review. |
| X-H1 shared text cap | Shared `Txt` no longer caps OS text scaling; route-owned caps in this slice were removed. | Shared source/component test and browser 130% approximation. Physical 200% OS text remains open. |
| V-D1 doubled OTP focus ring | Chromium painted its `outline-style:auto` native ring even with zero width. The web input now uses a zero-width `solid` outline (the RN 0.86 type-safe replacement for `auto`), while the shaped wrapper's forest border and 2px solid outline meet at zero offset as one continuous focus indicator. | Shared component style test, live computed outline/border/shadow assertions, bilingual fresh screenshots, pixel checks that the former long near-black runs are absent, and focused independent re-review. |
| V-D2 unequal choice heights | The animated choice surface fills its radio so siblings stretch to equal height at enlarged text. | Shared flex-fill assertion and live equal-height measurements in both languages at 100% and 130%. |
| V-D3 invalid state/bottom captures | Every state capture grows to current inner-scroll content and asserts residual overflow is gone; bottom captures target the real vertical scroller and assert movement to its end. | Rebuilt state screenshots, browser scroll assertions, and differing top/bottom hashes in both languages at 130%. |
| V-D4 stale-data wording | Home and Orders consistently state that updates are paused and the last loaded results remain, without a pull-only instruction beside the visible Retry action. | Bilingual stale-state screenshots and independent visual review. |

## Verification-discovered shared retry races

The first retry redesign incorrectly made every `reload()` join an existing poll. Independent read-only review identified two concrete races: post-mutation callers could accept a pre-mutation snapshot, and an older retry could clear a newer pending boolean.

The final API deliberately separates them:

- `reload()` remains forced through `load(true)` for acknowledged actions and pull-to-refresh. Generation/path guards discard delayed pre-mutation responses.
- `retry()` joins through `load(false)` only for visible retry controls. A monotonically increasing token allows only the latest retry generation to clear `retrying`.
- The real-hook suite covers joined success/failure, delayed pre-mutation response ordering, and overlapping retry generations. Independent re-review found both findings resolved and no remaining scoped call-site/type race.

Other routes retain their previous forced-retry behavior for their own later audits; this slice does not claim to have reworked every screen's retry control.

## Automated and real-browser evidence — local fallback

Final focused static gates:

- `node scripts/run-tests.mjs --filter=launch-customer-ui`: **7 checks passed**.
- `node scripts/run-tests.mjs --filter=shared-ui`: **19 checks passed**.
- `node scripts/run-tests.mjs --filter=api-focus`: passed.
- `node scripts/run-tests.mjs --filter=api-reload`: joining, forced post-mutation freshness, and overlapping-generation pending state passed.
- `npm run lint`: passed.
- `npm run typecheck`: app and server TypeScript projects passed.
- `node --check scripts/screens.mjs` and `git diff --check`: passed.

Final rebuilt focused browser job `pwsh-cdf5e5ae0af74947` exited 0:

- Arabic and English Welcome target/radio/keyboard/roving-focus/live-region persistence checks passed.
- Arabic and English auth attached-error, pending lockout, OTP focus, stale-secret clearing, reset-success alert, consent association, and blocked-link recovery checks passed. Computed styles prove the inner input has no native auto ring/border/shadow and the wrapper has one zero-offset 2px solid focus outline; service choices measure equal heights.
- Home/Orders stale retries retained rows, exposed busy/disabled state, ignored a forced second click as a duplicate request (exactly one network request), and recovered.
- Multi-/single-service navigation, zero-service guards, plural/recent names, and direct empty-order Freight booking passed in both languages.
- Welcome, sign-up, Home, service chooser, and Orders passed 360px 100%/130% browser-text overflow/clipping checks with reduced motion. Home/Orders include top and bottom captures.
- **26 normal/state screenshots** were regenerated from the exact final focused bundle.

## Independent review evidence

- Code reviewer: focused read-only agent. It found the two shared API races above, then confirmed both resolved after the forced/joining separation and regression coverage. No source edits or jobs were delegated to it.
- Visual reviewer: external Claude **Haiku 5.5** (`claude-haiku-5-5`), Read tool only. Jobs covered Arabic states, English states, 360px/130% reflow images, and focused final OTP re-reviews; every requested file was reported opened/readable.
- The first pass found the native OTP focus ring, unequal choice heights, and invalid narrow-bottom captures. The next pass cleared reflow, equal heights, state/footer clipping, stale copy, and genuine bottom content, while isolating the remaining Chromium `outline-style:auto` ring and then the wrapper's white outline gap.
- **Final visual verdict: clean for the scoped captures at BLOCKER/HIGH/MEDIUM severity.** The six 130% chooser/bottom images have no medium-or-higher findings. The final Arabic and English OTP captures have one continuous unclipped green indicator, no native inner ring, no white-gap concentric ring, and no medium-or-higher findings. Minor fallback-font and low-priority copy observations are not represented as certification or behavior evidence.

## Remaining acceptance limits

- This is not whole-app completion, WCAG/platform certification, or a claim of a “perfect” app.
- Physical Samsung `SM-A5360` acceptance with TalkBack, Switch Access, external keyboard, actual 48dp hit rectangles, 200% OS font scale, landscape, safe areas, and reduced-motion playback has **not** been performed. Browser 130% text scaling is only an approximation.
- iOS/VoiceOver acceptance has not been performed.
- Static screenshots do not prove focus, announcements, motion, or async behavior; those claims above come only from their separately listed tests/browser assertions.
- Loading, initial-error, registration-policy, pagination, every order status, and every optional-provider fixture are not exhaustively captured in this focused state set. They remain part of broader state/device acceptance rather than silently accepted branches.
- The full `npm test` suite is not green because `subscription-migration.test.mjs` requires unavailable local PostgreSQL (`ECONNREFUSED 127.0.0.1:55473`). The focused suites listed above are the green evidence for this slice.
- K5 SSH keys remain refused; all executions here are explicitly **local fallback**, not remote evidence.
- `npm ci` reported 19 dependency vulnerabilities (1 low, 15 moderate, 3 high); no unreviewed force fix was applied.
- Generated `docs/screens/**`, `.screens/**`, `.artifacts/**`, and untracked `vendor/` fixtures are excluded from the atomic source commit. Final whole-app screenshot reconciliation remains a separate deliverable.
