> Committed by the 18 Nov Opus session for traceability. Written by the "Design system extraction" session (Haiku 5.5) on the old local-master lineage `b6092295`, which lacks #78–#92: its "fixed" statements and code references describe that base, not master. Status on master: `docs/HANDOFF-2026-11-18-CLAUDE-RESTORE-SEAMS.md` §7.

# Wind design review — 18 Nov 2026

For the session that will fix and enhance the design. Every finding has an ID, a severity, evidence, and the exact fix. Work them in the order below.

## 1. Scope and method

- **Screens covered:** 52 screen pairs (Arabic and English), from `docs/screens/README.md` plus four screens added in this review: welcome slides 4 and 5, admin cash, and road status. Every PNG was reviewed as an AR/EN contact sheet.
- **Frameworks:** the design critique framework (usability, hierarchy, consistency, accessibility) and the WCAG 2.1 AA quick reference, as loaded from the `design:design-critique` and `design:accessibility-review` skills.
- **Code evidence:** each claim that depends on source was checked in source before it was written here. Findings that did not survive that check are listed in section 7.
- **Not covered (so this is not a 100% sign-off):** the public tracking page (`/track/[token]`, see D-02), real-device rendering (Android A53 and iOS), dynamic type at 200%, screen-reader passes (VoiceOver and TalkBack), and live data states. Section 8 lists what a complete sign-off still needs.

**Verdict:** the app's foundation is sound. RTL mirroring is correct throughout, the palette is disciplined, the honest copy about verification and recovery is strong, and the brand lockup works. The gaps are concentrated in four places: developer content in onboarding (critical), disabled and enabled controls that look alike, booking and sign-up state rules, and a few screens that tell the driver or customer less than they need. Counts: 1 critical, 9 high, 16 moderate, 14 minor (IDs D-01 to D-40).

## 2. Critical

### D-01 Welcome slides 4 and 5 ship developer copy
- **Where:** `src/app/welcome.tsx:21-22` (model and provider read from `EXPO_PUBLIC_T3_*`, `ZRO_*` env vars), `:26` (titles "T3 model", "OpenCode model"), `:51` (`OpenCodeArt`), `:121`, `:132`. Seen in `docs/screens/*/welcome-4.png` and `welcome-5.png`.
- **Evidence:** every new user sees "T3 model", "OpenCode model", "deepseek-v4.1-flash", "provider: moonmath" in Arabic and English. This is internal tooling copy in a delivery app's onboarding.
- **Fix:** delete slides 4 and 5 and the `OpenCodeArt` and T3 blocks. Set `SLIDES` to 3, matching `docs/implementation/design.md`. Remove the env-driven model names from client code. Add a check that fails the build if these strings appear in `src/app/welcome.tsx` or `src/copy.ts`.
- **After the fix:** slide 3's Next button should read "Get started" (part of the D-01 acceptance check in section 9).

## 3. High

### D-02 Public tracking page not verified; share endpoint drops the connection
- **Where:** `POST /api/orders/:id/share` (`server/main.ts:1704`). The capture script (`scripts/screens.mjs`, the share call near line 151) gets `fetch failed` with `ECONNRESET`.
- **Why it matters:** the share feature is a customer promise ("it never shows your number, notes or handover code"). If the endpoint drops connections, that promise is untested. If the harness is wrong, the page is still unreviewed.
- **Fix:** reproduce with `curl` against a seeded server. Fix the endpoint or the harness. Then capture `/track/[token]` in AR and EN and review it. The capture step is now optional in the script, so it skips with a note until this is fixed.

### D-03 Disabled controls read as enabled (systemic)
- **Where:** the `Button` component in `src/ui.tsx` (disabled look at `off`, around lines 250-251). Affected: profile "Save" and "Nothing has changed to save" (`profile.tsx`), "Send code to the new number", "Confirm number", "Request a new code" (`phone-card.tsx`, `profile.tsx`), promo "Create code" (`src/app/admin/settings.tsx:116`), driver "Accept at ₪71" and "Offer your price" (`src/app/driver/index.tsx`).
- **Evidence:** disabled soft and outline buttons use a paper fill (`#F3F2EC`) on a white card, with a secondary label. The only cue is a line of reason text underneath. On the cash screen, disabled buttons use a muted fill (`#EAE8DF`) and are clearly distinct, so the app already has two disabled looks (D-03b, moderate).
- **Fix:** one disabled treatment in `Button`: muted fill, secondary label (5.13:1 on card), no border, kept shape. Keep the reason line. Re-check the cash screen after the change so it still reads as disabled.

### D-04 Booking CTA enabled while the route is missing
- **Where:** `src/app/book.tsx:380`: `disabled={!ready || locating || quoting || quoteFailed || (!available && !pending)}`. The reason line (`requestReason`, line 373) says "choose pickup and drop-off". `submit()` at line 295 opens the place picker instead of sending.
- **Evidence:** freight, ride, parcel, and send-another screens all show a forest "Request" or "اطلب" button with the reason underneath. Screens: `book-freight`, `book-parcel`, `book-ride`, `book-send-another`.
- **Fix:** add `!routeChosen` to the `disabled` expression. Keep the picker behaviour as the reason's action, so tapping the reason opens the picker. Visual result: disabled look plus explanation (design section 10).

### D-05 Sign-up CTA enabled while required fields and consent are empty
- **Where:** `src/app/auth.tsx:116` (consent check on submit), `:134` (field checks on submit).
- **Evidence:** "Create account" (driver and customer) is forest and enabled with the consent box empty. The error appears only after a tap.
- **Fix:** disable with a reason line ("Accept the terms to continue", or the first missing field). Keep the on-tap errors as a safety net. Apply the same rule as booking.

### D-06 Map labels in Hebrew and English inside the Arabic UI
- **Where:** driver order and live order maps (`src/app/order/[id].tsx` via `route-map.native.tsx` / `google-map.native.tsx` / `route-map.tsx`). Labels such as "Shlomo HaMelech", "HaMarpe", "KIRYAT SANZ" appear in both languages on `driver-order` and `order-live`.
- **Evidence:** the order-searching map is localized correctly (AR "تل أبيب", "نابلس"), and the order-done map is partly localized. The leak is limited to some map views, not the map component.
- **Fix:** use one label source for every map view, with a language-matched name (MapLibre `name:ar` / `name:en`) and a fallback. Check every map screen in both languages after the change.

### D-07 Driver job card shows two money figures with no labels
- **Where:** driver job card in `src/app/driver/index.tsx` (share at top right, "Accept at ₪71" button).
- **Evidence:** "Your share ₪60.35" and "Accept at ₪71" appear on the same card. A driver can misread which figure is what they earn.
- **Fix:** label the button by outcome ("Accept · you earn ₪60.35") or show "Customer pays ₪71" beside the route. Test with a driver in Arabic and in English.

### D-08 Touch targets under 44 pt
- **Where:** footer links on sign-in and recovery (`src/app/auth.tsx` and `src/phone-recovery.tsx`: "المساعدة والدعم", "تواصل مع الدعم", "سياسة الخصوصية", "Help & support", "Contact support", "Privacy policy"). Admin dashboard chart bars (`src/app/admin/index.tsx:108`, bars about 20 px wide).
- **Evidence:** the footer links are small underlined text with no padding (visible in the screenshots). The chart bars use `hitSlop={4}`. WCAG 2.5.5 needs 44 by 44.
- **Fix:** wrap footer links in a `Pressable` with `hitSlop` of at least 10 so the target reaches 44. For chart bars, widen the hit area to 44 px while keeping the visual bar narrow.

### D-09 Run sheet has no per-stop status
- **Where:** `src/app/driver/trips.tsx` ("Deliver in Nablus · 3" and the stops under it).
- **Evidence:** stops are grouped by city, but the driver cannot tell which are delivered, pending, or next.
- **Fix:** add a status chip per stop (delivered, pending, next) and mark the next stop. Use the existing status tones from `Badge`.

### D-10 Design packet features not built
- **Where:** `docs/implementation/design.md` (marked "design only").
- **Missing in the app:** section 5 "Price held for {t}" countdown and refresh (booking). Section 6 offer-lease bar and "Try n of 3" with "Searching for up to…" (driver offers and the searching screen, `src/app/order/[id].tsx`). Section 7 boarding code and start-trip gating (order and driver screens).
- **Evidence:** the copy keys are absent: no "held for" string, no boarding code string, no attempt counter. The searching screen shows the radar and "Driver offers" only.
- **Fix:** decide per feature: build it, or move it to a "later" list with an owner. Do not present the packet as shipped.

## 4. Moderate

- **D-11 Destructive actions are not styled as destructive.** "Delete account" is a neutral row on Account (`src/parts.tsx`, `AccountScreen`), on the admin users list (`src/app/admin/users.tsx`), and on the driver account. "Sign out" is red. Fix: give delete the danger tone, and put destructive rows in their own group at the end (`ListGroup` rule).
- **D-12 Customer-facing jargon.** `src/copy.ts:973` "The route is estimated because routing is unavailable." Fix: "Route is an estimate right now." Check the Arabic equivalent for the same tone.
- **D-13 Percent rates take decimals.** Admin settings fields labelled "(15%)" or "(20%)" accept "0.15" and "0.2" in both languages (`src/app/admin/settings.tsx`). The hint "Rates are decimals: 0.15 = 15%" appears in one section only. Fix: percent inputs with conversion, or a live "= 15%" hint on each rate field.
- **D-14 Verification badge too small.** "Unverified" / "غير موثّق" and "Unavailable" / "غير متاح" on the profile use the shared `Badge`, whose text is 11 px (`src/ui.tsx` `badgeText`). Used in `src/phone-card.tsx:199` and `src/app/profile.tsx:105`. Fix: 12 px minimum, with an icon. This is the most important trust signal on the profile.
- **D-15 Empty states that do not say what happens next.** Road status (`src/app/roads.tsx`): "No checkpoints added yet" with no explanation or action. Fix: one sentence, plus an "Add checkpoint" action for admins. Pending driver (`src/app/driver/index.tsx`): one message and one WhatsApp button. Fix: a checklist of what is still needed, a typical review time, and reduced tabs (Account and Help only).
- **D-16 Rating rows unlabelled.** `order-done`: two 5-star rows, "Thanks for rating" (driver) and "How fair was the price?" (price). Fix: label each row ("Rate your driver", "Was the price fair?"). Stars use `clay` (the warning colour). Use `ink` or `olive`.
- **D-17 Welcome visual is abstract.** Slides show a generic box or receipt icon on a card. Fix: a real product frame per slide (an order card, or a map with pickup and drop-off).
- **D-18 Chip rails clip and crowd.** Admin order chips and admin orders filters clip the first or last chip with no fade (`src/app/admin/orders.tsx`). Date and time chips on scheduled orders clip (`src/app/order/[id].tsx`). Vehicle chips on driver sign-up wrap "دراجة هوائية" and touch the edges of "Motorcycle" (`src/app/auth.tsx`). Fix: an edge fade or peek, a 14 px side padding, and a wrapping grid for vehicles.
- **D-19 Empty chart range.** Admin dashboard chart spans 14 days with one day of data (`src/app/admin/index.tsx`). Fix: show only days with data, or the empty-state copy.
- **D-20 Map pin covers a label.** Scheduled order map: the clay pin sits on "Palestinian Territories". Map labels clip at the card edge ("el Aviv", "Amma"). Fix: offset labels or the pin per zoom, and keep labels inside the frame.
- **D-21 Live order: safety has no emphasis.** "Safety" and "Change destination" share the same outline weight on `order-live`. Fix: give Safety a stronger treatment or a fixed top position.
- **D-22 Consent row layout.** On sign-up, the checkbox line and the links ("Privacy policy", "Terms") are split across two lines. Fix: keep the links with the checkbox label.
- **D-23 Typography scale not enforced (systemic).** 13 distinct literal font sizes appear across `src/` outside the seven-step scale in `src/ui.tsx` (10, 11, 12, 13, 14, 15, 16, 17, 21, 22, 26, 28, 34). Size 10 (`src/ui.tsx:581`, tab-bar count badge) is below the 11 px floor. Fix: map every size to a named role, and drop 10 px.
- **D-24 Mismatched copy: search label and placeholder.** Admin users search: the label is "Search name or number" (`src/copy.ts:1588`) but the placeholder is "Name, email or mobile number" (`:999`). Arabic: "ابحث بالاسم أو الرقم" (`:650`) vs "اسم، بريد أو رقم جوال" (`:48`). Fix: make label and placeholder agree.
- **D-25 Truncated search prompt on home (EN).** "Where would you like to deliver?" (`src/copy.ts:1693`) is cut off by the "Later" pill, so the main call to action reads "Where would you like to…". Fix: a shorter EN string ("Where to?"), or let the prompt wrap.
- **D-26 Admin greeting uses the account name, and the seeded admin name is Arabic only.** The greeting "أهلاً {name}" (`src/copy.ts:229`) shows "Hi إدارة ويند" on the English admin dashboard. Fix: a role-specific greeting key for admins ("Wind admin" / "أهلاً بك في إدارة ويند"), so the admin view never depends on the account name.

## 5. Minor and notes

- **D-27** Admin users cards repeat the phone number on two lines and use small tags (Driver, Van, Approved). Merge the phone lines; check the tag size against the 12 px minimum.
- **D-28** Stepper mirrors "+" to the left in Arabic (valid mirror). Decide once and document it.
- **D-29** Offer screen states the allowed range twice (error and helper). Keep one: the error states the problem, the helper gives the suggestion.
- **D-30** "Last known location" in clay (the warning colour). Use secondary; reserve clay for warnings.
- **D-31** Pending title in EN may use a different typeface than AR (verify on device; check font fallback).
- **D-32** Receipt labels are small grey text. Confirm the label style is not `faint` on any background.
- **D-33** Stepper and segmented and map text: long CTA "Send the tracking link to the recipient on WhatsApp" wraps. Shorten to "Send to recipient on WhatsApp".
- **D-34** EN "Keep time" sits above the centre of its "Save new time" button row (scheduled order). Align both languages the same way.
- **D-35** "Calculating price..." uses three dots in EN and an ellipsis in AR. Use one ellipsis character.
- **D-36** Install footer ("Install on iPhone for free") appears on desktop browsers. `src/install-link.tsx` already hides it on Android user agents. Hide it on desktop too, or show a neutral line.
- **D-37** Arabic wordmark "ويند" reads smaller than "Wind" at the same size (`intro-4`, `intro-5`). Scale the Arabic up about 10 to 15%.
- **D-38** Welcome slide transition: check that reduced motion shows the final mark immediately (`src/motion.tsx`, `useReducedMotion`).
- **D-39** Pressable without an accessibility label: the sweep found 14 untagged lines, but most have multi-line labels or text children. Only `src/ui.tsx:370` (Android field touch layer, `accessible={false}`) is intentional. Verify the rest in a screen-reader pass.
- **D-40** Chart bars and date chips need labels and role (checked: bars have labels; confirm on device).

## 6. What works (keep it)

- RTL mirroring: back arrows, route arrows, segmented controls, stepper order (except D-28), tab order, route dots, money and codes kept LTR.
- Verification copy: "We haven't proven yet that you control this number", "The provider accepted the message. That does not confirm it reached your phone.", "We don't say whether the number is registered." Keep this tone.
- Disabled-with-reason pattern on booking calculating, promo, recovery, and profile (the pattern is right; the look needs D-03).
- Handover code treatment (clay card, digit boxes, "give only at delivery") matches the design packet.
- Brand: the mark is never mirrored, the lockup is consistent across both languages, and the palette is applied almost everywhere (358 palette uses across 32 files).
- Honest status and error copy across the app.

## 7. Corrections made during the review (do not action these)

- **Retracted (review note 08):** "وند" misspelling on subscriptions. The source has "ويند بلس" and "ويند برو" (`src/copy.ts:234`, `:236`). The earlier reading came from a low-resolution sheet.
- **Retracted (F-39):** "كيف يعرف المستلم بطرده؟" is grammatical ("knows about his parcel").
- **Corrected (F-01, F-02):** the admin greeting is data-driven ("أهلاً {name}"). The Arabic-only name is seeded admin data. The fix is D-26, not a copy string change.
- **Downgraded to verify (F-69):** the Arabic password hint order looked reversed in the screenshot. The source is correct (`src/copy.ts:41`). Check on device; fix only if the device shows the same order.
- **Downgraded to verify (F-24):** the minus-sign format looked inconsistent in one screenshot. The receipt shows "−₪ 2.55" in both languages.
- **Corrected (F-40):** the install footer is hidden on Android user agents (`src/install-link.tsx`). The issue is desktop only (D-36).

## 8. What a complete sign-off still needs

1. Real-device pass on the Android A53 (AR and EN): D-01 removal, D-03 disabled look, D-08 target sizes, D-31 typeface, and the Arabic password-hint order (section 7).
2. Screen-reader pass (TalkBack and VoiceOver) on onboarding, booking, orders, and driver jobs.
3. Dynamic type at 200% and 360×800 on the five busiest screens (home, book, order-live, driver jobs, admin users).
4. Public tracking page capture and review (D-02).
5. Data-state pass: empty, loading, error, and long-name states on lists and cards.
6. Dark-mode decision: the app is light-only (`app.json` `userInterfaceStyle: light`). Record that decision in the design system.

## 9. Acceptance checklist for the fixing session

- [ ] D-01: welcome has 3 slides; no model or provider string in `src/` outside tests; screenshots show "Get started" on slide 3.
- [ ] D-03: one disabled treatment in `Button`; `book-*`, profile, phone, promo and driver screens re-captured and visibly disabled.
- [ ] D-04 and D-05: disabled look plus reason on booking and sign-up.
- [ ] D-06: map labels in the app language on every map screen (driver order, live order, searching, done).
- [ ] D-07: driver job money labelled.
- [ ] D-08: all footer links reach 44 pt; chart bars hit area 44 px.
- [ ] D-02: tracking page captured, reviewed, and the share endpoint reproduces cleanly.
- [ ] Re-run `npm run screens` and `npm run lint`, `npm run typecheck`, `npm test`. Attach results to the PR.
- [ ] Re-run the review sheets and tick each ID above with a screenshot.

## 10. Full screen coverage

| Screen (AR/EN) | Verdict | Findings |
|---|---|---|
| Intro frames 1–5 | OK (final lockup correct) | D-37 |
| Welcome 1–3 | Issues | D-17, D-36 (install footer) |
| Welcome 4–5 | **Critical** | D-01 |
| Sign in | Issues | D-08, D-22 |
| Create account (customer) | Issues | D-05, D-22 |
| Create account (driver) | Issues | D-05, D-18 |
| Sign in · phone recovery | Issues | D-08, D-31 |
| Help & support | OK (parity) | D-36 |
| Home | Issues | D-25 |
| Book · parcel / ride | Issues | D-04, D-28 |
| Book · calculating | OK state, look needs fix | D-03 |
| Book · freight | Issues | D-04 |
| Book · again / send another | Issues | D-04 |
| My orders | OK | (D-18 note on chips) |
| Order · finding a driver | Issues | D-10 (spec gap). Map is localized correctly. |
| Order · scheduled | Issues | D-20, D-34, D-18 |
| Order · on the way | Issues | D-21, D-06 |
| Order · parcel awaiting handover | OK | D-20 |
| Order · delivered | Issues | D-16 |
| Receipt | OK | D-32 |
| Account (customer) | Issues | D-11 |
| Edit profile (3 states) | Issues | D-03, D-14 |
| Driver awaiting approval | Issues | D-15 |
| Driver jobs | Issues | D-07, D-29, D-03 |
| Driver jobs · idle | OK | — |
| Driver jobs · offer out of band | Issues | D-29 |
| Driver run sheet | Issues | D-09 |
| Driver active trip | Issues | D-06 |
| Driver trips | OK | — |
| Driver earnings | OK | — |
| Driver receipt | OK | D-32 |
| Driver account | Issues | D-11 |
| Admin dashboard | Issues | D-19, D-26 |
| Admin orders | Issues | D-18 |
| Admin order (code recovery) | Issues | D-18 (chips), D-20 (labels) |
| Admin users | Issues | D-11, D-24, D-27 |
| Admin subscriptions | OK (plan names correct) | — |
| Admin tariffs & settings | Issues | D-13, D-03 |
| Admin cash | OK | D-03 note |
| Road status | Issues | D-15 |
| Public tracking link | **Not verified** | D-02 |

## 11. Changes made in this session

- `scripts/screens.mjs`: added welcome slides 4 and 5, `admin-cash`, `roads`, and an optional public tracking capture (share call, skipped with a note if it fails). Checked with `node --check`. The full capture ran on the test PC: 104 screenshots, exit 0. The tracking page was skipped (D-02).
- `docs/screens/`: regenerated by the run above.
- Application source changed in the fix pass (section 12). Nothing committed.

## 12. Fix pass: status after the changes

Validation on the test PC after the changes: `npm run typecheck` exit 0; `npm run lint` 0 errors, 1 pre-existing warning (`src/app/book.tsx:88`); `npm test` 88 suites passed (with the private Postgres and pinned Bicep 0.48.1); `npm run screens` 102 screenshots, exit 0. The screenshot set in `docs/screens/` is from that run.

Verified by rendering (screenshot checked): D-01, D-02 (tracking page captured and reviewed), D-03, D-04, D-05, D-14, D-15 (customer explanation), D-36 (no install footer on desktop).

Fixed in code and checked by the gate, screenshot not yet re-reviewed: D-07 (button copy "Accept · customer pays"), D-08 (44 pt footer links, chart-bar hit area), D-09 (next stop carries its status), D-11 (Delete account uses danger style, customer and admin), D-12 (customer copy), D-16 (rating headings), D-21 (Safety uses soft style), D-24 (admin search label), D-26 (admin greeting), D-37 (Arabic wordmark size), D-42 (EN search prompt), D-65 (duplicate reason line), D-23 in part (tab badge text 10 to 11 px; badge text 11 to 12 px).

Corrected in this pass:
- D-02 root cause: not a server crash. The capture harness reused a keep-alive socket that the API had closed (reset after 11 to 17 ms; the same route succeeds on a fresh connection). The harness now closes each connection. Product note: a mobile client that reuses an idle keep-alive socket for a POST could hit the same reset. Check in the app before calling it resolved.
- D-06 downgraded: the English-street-name labels on Arabic maps are a data gap (no Arabic street names in the tile data), not a Hebrew leak. Place names are already localized (`src/map-math.ts` `labelField`). The screenshots show Latin transliterations, not Hebrew script.
- D-35 retracted: the copy already uses the proper ellipsis in both languages.
- D-16 wording: the "rated" heading now says "Thanks for rating your driver". A first attempt renamed the unrated heading and would have shown the wrong label on rated orders; that was caught and reverted before the gate.

New finding from the public tracking page: D-41 (minor). It has no Wind mark or brand footer, which a recipient who has never used the app will notice.

Still open, with reasons:
- D-10 design-packet features (quote hold, boarding code, offer lease, attempt counter, start-trip gating): these need backend contracts. The packet itself says implementation waits for them (section 9 of `docs/implementation/design.md`). Decision needed: which to build first.
- D-06 Arabic street names: needs an Arabic name source for street labels (data work) or a decision to hide street labels in Arabic. Decision needed.
- D-13 percent rate fields: not changed (needs a conversion design for the admin settings).
- D-17 welcome visuals: needs real product frames (design asset work).
- D-18 chip rails: edge fades not added.
- D-19 admin chart: empty range not changed.
- D-20 map pin over label: pin part fixed in the third pass (section 13). Label clipping at the card edge is still open.
- D-22 consent row layout: not changed.
- D-23 typography scale: most of the 13 literal sizes still need mapping to named roles.
- D-27, D-29, D-31, D-33, D-34, D-38, D-40: minor, not changed.
- D-41 brand footer on the tracking page: not changed.
- Device checks (A53, TalkBack and VoiceOver, 200% text, data-state pass): not done here.

Honest status: this pass fixed the critical item, most high items, and several moderate and minor items. It did not reach zero issues. A complete sign-off needs the open items above and the device passes in section 8.

- Changes in this pass: `src/app/welcome.tsx`, `src/app/book.tsx`, `src/ui.tsx`, `src/app/auth.tsx`, `src/copy.ts`, `src/parts.tsx`, `src/app/admin/index.tsx`, `src/app/admin/users.tsx`, `src/app/driver/index.tsx` (copy only), `src/app/driver/trips.tsx`, `src/app/order/[id].tsx`, `src/app/roads.tsx`, `src/install-link.tsx`, `src/phone-card.tsx`, `src/intro.tsx`, `scripts/screens.mjs` (port overrides, share diagnostics and keep-alive fix), `docs/screens/` (regenerated).

## 13. Second fix pass: verified status (supersedes section 12 where they differ)

Gate on the test PC, run on the final source: `npm run typecheck` exit 0; `npm run lint` 0 errors, 1 pre-existing warning (`src/app/book.tsx:88`); `npm test` 88 suites passed (with the private Postgres and pinned Bicep 0.48.1); `npm run screens` 102 screenshots, exit 0. Freshness of the export was checked against new copy strings before the screenshots were trusted. A stale-build problem was found and fixed during this pass: the earlier extraction had not overwritten the source, so the gate runs before this one tested old code. The bracketed `[id]` and `[token]` files were copied directly and verified.

Fourth pass (D-23 type scale, open items re-checked, 18 Nov). Still uncommitted, on the same old base.

- D-23: every literal `fontSize` in `src/` now uses a named role from `typeScale` in `src/ui.tsx` (micro 11, caption 12, label 13, body 14, title 15, cta 16, h2 17, h1 21, digit 22, display 26, code 28, hero 34, heroRtl 38). Values are unchanged, so screens should not move. A grep for `fontSize: <number>` in `src/` returns nothing.
- Verified on the earlier regenerated screenshots (unchanged values): D-11 (account and admin users show red "Delete account"), D-24 ("Find a user" on admin users), D-42 (home EN "Where to?"), D-37 (larger AR intro wordmark). D-08 (sign-in footer links) is visible, but the 44 pt target is checked in code only.
- Arabic admin tab bar: whole labels in the screenshot, no mid-word break in this set.
- Gate on the current source, test PC: typecheck exit 0; lint 0 errors, 1 pre-existing warning (`src/app/book.tsx:88`); `npm test` 88 suites passed (after the 30-file hash match); `npm run screens` finished with "Saved 102 screenshots", exit 0.
- Final gate, run on this PC at the owner's request (the test PC was offline): typecheck exit 0; lint 0 errors, 1 pre-existing warning; `npm test` 88 suites passed, against a private PostgreSQL 18 + PostGIS on port 55479 (from the bundled `.expo/implementation/postgresql18`); `npm run screens` 102 saved, exit 0. `docs/screens/manifest.json` lists 102 files, none missing, and no welcome-4/5 files.
- D-06 (Arabic street names) decided: street-name labels are hidden in Arabic (`src/route-map.tsx`, `transportation_name` layer). Arabic place names stay, with the Latin fallback. Checked on `docs/screens/ar/order-scheduled.png`: the Arabic map shows place names only.
- D-17 (welcome visuals) decided: the welcome screens stay text-only until product frames exist. Nothing in the app shows placeholder art.
- D-10 (design-packet features: quote hold, boarding code, offer lease, attempt counter, start-trip gating) decided: deferred to the backend milestone that owns the contracts. Owner not yet named.
- Device pass (Android A53, serial R5CTB0FJP9Z): partly done, see the fifth pass below. Not handed to another session yet.

Fifth pass (device pass on the A53, 18 Nov). Built QA APKs locally (`scripts/build-phone-tests.ps1`, roles customer and driver; the provisioning came from the local sandbox, `scripts/phone-test-server.mjs`, which creates synthetic accounts on loopback). Installed them, forwarded the sandbox port with `adb reverse`, took screenshots, and removed the test apps afterwards.

- Customer home, Arabic: services, active orders and tab bar lay out cleanly, mirrored.
- Customer account, Arabic: Wind Plus card, invite block, language row and list chevrons correct.
- Customer orders, Arabic: list clean.
- Driver home, Arabic: offline card, background-location card, destination chips (edge peek intended), offer card: all clean.
- 200% system font, customer home: found two truncations and fixed them. The order subtitle cut the booking time ("2:…"); it now wraps (`src/parts.tsx`). The search placeholder "Where to?" was cut to one line; it now wraps to two (`src/app/(customer)/index.tsx`). Re-checked on the device after rebuilding the customer APK: the full time shows, and nothing overflows horizontally.
- Not covered: the English walk on the device, the admin role (not built), deeper driver flows, TalkBack, and live data states. The admin role also has no device check yet.

Gate after these changes, run on this PC: typecheck exit 0; lint 0 errors, 1 pre-existing warning; `npm test` 88 suites passed against PostgreSQL (port 55479); `npm run screens` 102 saved, exit 0; the manifest lists 102 files with none missing.
- D-20 part 2 (label clipping at the card edge): decision recorded, no code change. A map frame cuts labels at its edge, as any map does. Fixing it cleanly needs per-symbol feature-state, which is a bigger change for little gain. Reverse this call if the owner wants edge labels hidden.
- Still open: the device pass only. D-06, D-10 and D-17 are decided above, and D-10 needs an owner for the backend work.

Third pass (D-20 pin over label, gate re-run, 18 Nov).

Base warning: this worktree is on `claude/design-system-extraction-85980f` at `b6092295`. That commit does not contain `origin/master` (`9e7e63f8`, with PRs #78–#92). Every source edit in this pass is uncommitted and was made on the older base, so each one must be re-checked and re-applied on master before merge. Nothing was committed or pushed.

- D-20 pin: pickup and drop-off are now a MapLibre symbol layer (`stops`) in `LiveMap` in `src/route-map.tsx`, not HTML markers. Symbols take part in label collision, so labels move aside. Drop-off is a rounded square (corner radius 4 on a 44 px canvas, 22 px on screen) and pickup a circle, so the two differ by shape as well as colour. The driver marker stays an HTML marker. Checked on a zoomed crop of `docs/screens/en/order-scheduled.png`: no label sits under either pin, and the label that was under the old pin is not drawn in that frame.
- Gate on the test PC (`C:\wq-dsgate`, private Postgres): `npm run typecheck` exit 0. `npm run lint` 0 errors, 1 pre-existing warning (`src/app/book.tsx:88`). The `dot` warning from this pass was removed. `npm test` 88 suites passed; it ran before the final corner-radius change, which only touches canvas drawing. `npm run screens` 102 screenshots, exit 0; the copied `manifest.json` lists 102 files and all are present. One earlier screenshot run overlapped another and wrote only 81 files. That set was discarded and the run repeated alone.
- Not verified: label clipping at the card edge (D-20, second part) and any device pass.

Verified on screenshots (re-reviewed in this pass):
- D-07 driver accept button "Accept · customer pays ₪17" and "Your share" label.
- D-09 run sheet: the next stop carries its status ("Heading to pickup"); later stops stay plain.
- D-13 admin settings: rates shown as percentages (15, 15, 5, night extra 20) with "(%)" labels and the new hint. Saved values are still decimals (the screen converts before validation).
- D-16 delivered order: "Thanks for rating your driver" and "Was the price fair?".
- D-18 chip rails: the next chip peeks past the screen edge (driver heading chips).
- D-19 admin chart: starts at the first active day, keeps two days.
- D-21 live order: Safety uses the soft style, distinct from the outline "Change destination".
- D-22 sign-up: consent links sit under the checkbox label, aligned to its start edge.
- D-26 admin dashboard greeting "Wind admin".
- D-29 offer screen: the allowed range appears once (in the error).
- D-41 tracking page: Wind mark and wordmark footer.
- D-65 profile: no duplicate "not available" line under Change number.
- Earlier verified: D-01, D-02, D-03, D-04, D-05, D-14, D-15, D-36.

Code-checked and gate-passed, screenshot not re-checked: D-08 (tap targets), D-11 (danger style), D-12 (copy), D-24 (search label), D-37 (Arabic wordmark size), D-42 (English search prompt), D-23 (tab badge 10 to 11 px, badge text 11 to 12 px).

Retracted in this pass:
- D-31 (last-known location colour): the clay colour marks a stale driver location, which is a real warning. The colour is correct.

Still open (not done here, with reasons):
- D-10 design-packet features (quote hold, boarding code, offer lease, attempt counter, start-trip gating): need backend contracts; the packet says so. Decision needed on what to build first.
- D-06 Arabic street names: the tile data has no Arabic street names; place names are already localized. Needs a name source or a decision to hide street labels in Arabic.
- D-17 welcome visuals: needs real product frames (design asset).
- D-20 label clipping at the card edge ("el Aviv", "Amma"): not re-checked. The pin part is fixed (see the third pass above).
- D-23 remaining literal font sizes (13 in total; only the two badge sizes changed).
- D-27, D-28 (kept on purpose), D-33, D-34, D-38, D-40, D-50 (stars use clay): minor, not changed.
- Device checks (Android A53, TalkBack and VoiceOver, 200% text, data states): not done. The installed app on the attached phone is an older build, so a check needs a new build.

Honest status: the critical item and every high item that could be fixed in code are fixed and verified on screenshots, except D-08, D-11, D-12, D-24, D-37 and D-42, which are fixed in code and gate-passed but not re-viewed. The goal of no remaining issues is not met. The open items above need your decisions (D-06, D-10, D-17) or a device pass.
