# Narrow driver/admin UI audit — 7 November 2026

## Scope and evidence limits

- Baseline verified: `f8d58c14d43cc31475411899ebfa29c23b04f79c`. This packet is limited to the seven requested Arabic/English pairs: `driver-jobs`, `driver-idle`, `driver-earnings`, `admin-dashboard`, `admin-orders`, `admin-users`, and `admin-settings`, plus their six corresponding route files.
- The screenshot index says captures use a 390×844 CSS viewport at 2× and long pages use full scroll height ([README.md:3-4](../../../docs/screens/README.md#L3-L4)). All 14 requested PNGs exist.
- **Visual-evidence limitation:** every `read_image` call failed because `kimi-k3.1-pro` does not declare image input. Consequently, no hierarchy, clipping, contrast, spacing, RTL rendering, or other pixel-level statement below is screenshot-confirmed. Those checks remain in the hypothesis/retest queue. Source-confirmed findings are still defects, but their exact rendered appearance is unverified.
- No emulator, phone, product edit, commit, lint, typecheck, or heavy test was used. Pre-existing staged `vendor/` additions were left untouched.

Severity: **High** blocks/crashes a core workflow; **Medium** causes silent failure, misleading financial/control state, or destructive/accessibility friction with a plausible workaround; **Low** is localized consistency or recovery polish.

## Per-screen matrix

All screenshot cells mean “AR and EN files present; both reads attempted; visual content unverified.”

| Requested pair / route | Source-confirmed findings | Important state captures absent from this pair |
|---|---|---|
| `driver-jobs` — [driver/index.tsx](../../../src/app/driver/index.tsx) | D1: starting-location accessible name contradicts visible state. | Loading/error/retry; online but matching-ineligible; assigned/starting/denied/background-permission states; one vs multiple active jobs; expired dispatch offer and decline busy; heading busy/expiry; pagination first/middle/last/unavailable; acceptance/offer failure and offline recovery. The separate `driver-offer-range` capture exists but was outside this narrow packet. |
| `driver-idle` — same route | D1 applies when assigned tracking is starting; no additional idle-only source defect confirmed. | Offline-to-online pending/success/failure; consent declined; permission permanently denied/open Settings; empty list after a destination filter; refresh with stale data; largest text and narrow/landscape layouts. |
| `driver-earnings` — [driver/earnings.tsx](../../../src/app/driver/earnings.tsx) | D2: initial cash loading/failure disappears; D3: nullable reference renders as `null`. | Main earnings loading/error/empty/zero and negative values; cash initial loading/error; empty ledger; pending/confirmed/disputed entries; Wind-owes-driver and promo-credit variants; confirm/dispute busy/failure; >10 entries/show more; long notes and large money values. |
| `admin-dashboard` — [admin/index.tsx](../../../src/app/admin/index.tsx) | D4: empty/shortened chart data can crash; D5: 14 chart targets cannot meet Android width on the documented phone viewport. | Stats loading/error/stale data; all-zero/empty statuses and empty chart; safety/pending shortcuts; zero/one/many chart days; selected-bar update after polling; large currency/counts; reduced motion; keyboard/screen-reader chart operation. |
| `admin-orders` — [admin/orders.tsx](../../../src/app/admin/orders.tsx) | D6: Maps-open rejection is silently discarded. | Every filter’s selected/empty/error/loading state, especially terminal chips in AR; paginated orders; open/resolved safety incident; call/order/map failures; short/invalid resolution; resolve busy/failure; open/resolved dispute; blank/valid/invalid credit and confirmation; dynamic text. |
| `admin-users` — [admin/users.tsx](../../../src/app/admin/users.tsx) | D7: block is one-tap until a server recovery error; D8: Arabic-Indic identity codes are stripped; D9: delete lacks danger styling. | Search loading/no-result/error and role filters; long names/contact data; identity send/invalid/expired/confirmed; approval confirmation/busy; edit customer/driver/vehicle/plate; block/unblock/carrying recovery; reset-password result; delete confirmation/failure; concurrent-action disabled reasons. |
| `admin-settings` — [admin/settings.tsx](../../../src/app/admin/settings.tsx) | D10: editable-during-save values can diverge from saved values; D11: invalid percentage displays `0%`; D12: field error is detached from its field; D13: promo edits during create are discarded. | Every invalid field, especially at largest text; save pending/success/server/offline failure and edit-during-save; promo list loading/empty/error; expired/stopped/live states; deactivate busy/failure; invalid creation values; long codes/usage copy; logout/password/language branches. |

## Confirmed source defects

### D1 — Low — Driver location control announces the wrong state

- **Evidence:** the pressable label is only “sharing” or `locationOff` ([driver/index.tsx:157-165](../../../src/app/driver/index.tsx#L157-L165)), while its visible text has a third `locating` branch using `locationStarting`. Arabic and English have distinct starting copy ([copy.ts:662-664](../../../src/copy.ts#L662-L664), [copy.ts:1675-1677](../../../src/copy.ts#L1675-L1677)).
- **Exact scenario:** with an assigned job, tap to enable tracking. While `tracking === 'starting'`, sighted users read “Starting location service (GPS)” but TalkBack/VoiceOver receives the off/permission instruction.
- **Smallest fix:** use the same three-way string selection for `accessibilityLabel`; expose busy state if supported without repeatedly announcing the once-per-second job timer.
- **Regression/device:** mock `starting`, `sharing`, and off states; assert names in AR/EN. On Android TalkBack, confirm one complete contextual announcement and that activation remains possible.

### D2 — Medium — Cash ledger silently vanishes on initial load/error

- **Evidence:** `CashCard` returns `null` whenever data is absent ([driver/earnings.tsx:41-49](../../../src/app/driver/earnings.tsx#L41-L49)); its error/retry-related rendering occurs only after that early return ([driver/earnings.tsx:54-62](../../../src/app/driver/earnings.tsx#L54-L62)). The independent earnings request does have loading/error UI ([driver/earnings.tsx:15-20](../../../src/app/driver/earnings.tsx#L15-L20)).
- **Exact scenario:** `/driver/earnings` succeeds but `/driver/cash` is slow or offline. The summary and plan render, while the entire owed balance/handover ledger disappears with no loading, error, stale-data label, or retry.
- **Smallest fix:** render a cash-card skeleton while loading and a localized inline error with retry on initial failure; preserve the existing stale-balance warning behavior for poll failures.
- **Regression/device:** independently delay/fail each endpoint; verify no blank region, retry reloads only cash, and a later poll failure never hides last-known money. Test offline/reconnect in AR/EN.

### D3 — Medium — Pending cash handover can literally display `null`

- **Evidence:** `CashEntry.reference` is explicitly nullable ([driver/earnings.tsx:8-10](../../../src/app/driver/earnings.tsx#L8-L10)), but the pending title interpolates it unconditionally ([driver/earnings.tsx:62-64](../../../src/app/driver/earnings.tsx#L62-L64)). The later ledger row handles null correctly ([driver/earnings.tsx:69-72](../../../src/app/driver/earnings.tsx#L69-L72)).
- **Exact scenario:** a pending remittance has `reference: null`; the driver sees “Handover waiting for your confirmation: ₪… · null” (or Arabic equivalent), undermining receipt/money clarity.
- **Smallest fix:** omit the separator/reference when null, using the localized entry kind as the fallback already used below.
- **Regression/device:** snapshot pending entries with null, empty, long Latin, and mixed Arabic/Latin references in both languages; confirm no `null`/`undefined` and no truncation of amount or status.

### D4 — High — Empty or shortened dashboard chart data crashes rendering

- **Evidence:** selection initializes to `daily.length - 1`, then `pick.date` is read unconditionally ([admin/index.tsx:87-103](../../../src/app/admin/index.tsx#L87-L103)); axis labels also dereference first/last entries unconditionally ([admin/index.tsx:120-124](../../../src/app/admin/index.tsx#L120-L124)). Selection is not clamped when polling returns a shorter array.
- **Exact scenario:** a new/empty deployment returns `daily: []`, or a refresh returns fewer days while a high index is selected. The dashboard throws instead of showing stats/empty state.
- **Smallest fix:** render a localized no-chart-data state for an empty array and clamp/reset selection whenever `daily.length` changes before reading `pick`.
- **Regression/device:** test `[]`, one day, 14 days, all-zero days, and shrink 14→1 after selecting day 14. Verify navigation and other stats remain operable in AR/EN with reduced motion on/off.

### D5 — Medium — Chart day targets are too narrow on the reference phone

- **Evidence:** all days share one flex row with 4dp gaps ([admin/index.tsx:104-118](../../../src/app/admin/index.tsx#L104-L118), [admin/index.tsx:134-138](../../../src/app/admin/index.tsx#L134-L138)). Each target only adds 4dp hit slop ([admin/index.tsx:109-110](../../../src/app/admin/index.tsx#L109-L110)). With 14 days at the documented 390px viewport, even an impossible edge-to-edge plot gives `(390 − 13×4)/14 ≈ 24px` per target, or ≈32px including hit slop—below 48dp Android guidance before card gutters.
- **Exact scenario:** an admin tries to select a specific day among 14 adjacent bars; neighboring targets are easy to hit despite correct button roles/names.
- **Smallest fix:** provide 48dp targets in a horizontally scrollable plot, or a separate previous/next/day-picker control with exact values; do not merely increase overlapping hit slop.
- **Regression/device:** measure target bounds and overlap at 390px and 320px, largest text, AR/EN. Exercise touch, keyboard, and TalkBack selection of first/middle/last days.

### D6 — Medium — Safety “Open location” can fail with no feedback

- **Evidence:** phone-call failures set a visible error, but Maps `Linking.openURL` rejection is swallowed with `catch(() => undefined)` ([admin/orders.tsx:51-66](../../../src/app/admin/orders.tsx#L51-L66)).
- **Exact scenario:** during an open safety incident, no handler/browser is available or Maps opening rejects. The admin taps “Open location” and nothing happens; unlike the adjacent call actions, there is no recovery message.
- **Smallest fix:** set a localized map-open failure in `failure`, include coordinates in selectable text/copy fallback, and keep retry available.
- **Regression/device:** mock resolved/rejected `openURL`; verify failure is announced/visible near the incident and recovery works on the physical Android browser/Maps configuration.

### D7 — Medium — Blocking a user lacks the destructive confirmation used nearby

- **Evidence:** approve, password reset, and delete use `confirm` ([admin/users.tsx:111-114](../../../src/app/admin/users.tsx#L111-L114), [admin/users.tsx:131-135](../../../src/app/admin/users.tsx#L131-L135)); Block directly calls the PATCH action ([admin/users.tsx:115-119](../../../src/app/admin/users.tsx#L115-L119)). Confirmation appears only after a `carrying_parcels` server failure ([admin/users.tsx:27-40](../../../src/app/admin/users.tsx#L27-L40)).
- **Exact scenario:** an admin accidentally taps the danger-colored Block button for an ordinary active driver/customer; the account is blocked immediately. Only the courier-with-parcels case gets a second chance.
- **Smallest fix:** confirm ordinary blocking with the user’s name and consequence; retain the specialized carrying-parcels confirmation. Unblock need not be destructive.
- **Regression/device:** cancel sends no request; confirm sends exactly one; carrying recovery still shows its specific copy; busy prevents repeat taps in AR/EN.

### D8 — Medium — Arabic-Indic identity codes cannot be entered

- **Evidence:** identity input removes every character not matching ASCII `\d` ([admin/users.tsx:99-108](../../../src/app/admin/users.tsx#L99-L108)). Other audited code explicitly normalizes localized digits, but this path does not. The Arabic UI asks for a six-digit code ([copy.ts:121-127](../../../src/copy.ts#L121-L127)).
- **Exact scenario:** paste `١٢٣٤٥٦` into the Arabic identity-check field. It becomes empty, the button stays disabled, and the caller-verification workflow cannot proceed.
- **Smallest fix:** apply `latinDigits(code)` before stripping non-digits and limiting to six, matching the admin credit and driver-offer patterns.
- **Regression/device:** test ASCII `123456`, Arabic-Indic `١٢٣٤٥٦`, Eastern Arabic `۱۲۳۴۵۶` if supported by `latinDigits`, mixed paste, and over-length input in AR/EN.

### D9 — Low — Delete is visually inconsistent with its destructive semantics

- **Evidence:** Delete account uses `variant="ghost"`, while Block uses `variant="danger"` ([admin/users.tsx:115-119](../../../src/app/admin/users.tsx#L115-L119), [admin/users.tsx:134-135](../../../src/app/admin/users.tsx#L134-L135)). Delete does correctly require confirmation.
- **Exact scenario:** scanning a dense user card, permanent deletion is styled like a low-emphasis utility rather than the most destructive action.
- **Smallest fix:** use the shared danger treatment and preserve spatial separation/confirmation; do not add a second competing primary CTA.
- **Regression/device:** check danger contrast, pressed/focus/disabled states, long Arabic labels, and cancel/confirm behavior.

### D10 — Medium — Settings can say “Saved” while visible values were not saved

- **Evidence:** `numbers` snapshots values before the await and success sets `Saved` ([admin/settings.tsx:25-48](../../../src/app/admin/settings.tsx#L25-L48)); pricing fields remain editable while busy ([admin/settings.tsx:51-65](../../../src/app/admin/settings.tsx#L51-L65)).
- **Exact scenario:** tap Save on a slow connection, then edit commission before the response. The server stores the snapshot; the field shows the newer unsaved edit beside a global “Saved” success message.
- **Smallest fix:** disable all affected fields during save, or track a revision/dirty state and make success explicitly refer to the submitted snapshot. Never clear that newer edit silently.
- **Regression/device:** hold the API promise, edit during save, then resolve/fail; verify field value, server payload, dirty state, and message agree. Repeat with rapid language switching.

### D11 — Low — Invalid rate text is presented as a real `0%`

- **Evidence:** fraction labels calculate `Math.round(typedNumber(values[key]) * 100) || 0` ([admin/settings.tsx:53-58](../../../src/app/admin/settings.tsx#L53-L58)); validation only happens on Save ([admin/settings.tsx:29-37](../../../src/app/admin/settings.tsx#L29-L37)). Helper copy says rates are decimals ([copy.ts:1734-1737](../../../src/copy.ts#L1734-L1737)).
- **Exact scenario:** clear commission or type invalid text. Its label displays `(0%)`, falsely suggesting an intentional zero rate until Save rejects it.
- **Smallest fix:** show the computed percentage only for a valid finite value; otherwise show localized invalid/incomplete helper text, not zero.
- **Regression/device:** cover empty, letters, malformed decimal, zero, valid decimal, Arabic digits, and largest text in AR/EN.

### D12 — Medium — Settings validation does not mark or focus the bad field

- **Evidence:** Save identifies one bad key but stores only a global string ([admin/settings.tsx:29-37](../../../src/app/admin/settings.tsx#L29-L37)); no pricing `Field` receives an `error` prop ([admin/settings.tsx:53-59](../../../src/app/admin/settings.tsx#L53-L59)); the error renders after the entire Promos card ([admin/settings.tsx:60-64](../../../src/app/admin/settings.tsx#L60-L64)).
- **Exact scenario:** an early pricing value is invalid while the admin is at the bottom Save button. The message names a field but no field is marked/focused, forcing a long visual search and making screen-reader recovery inefficient.
- **Smallest fix:** store the bad key, attach localized inline error text to that field, and scroll/focus it while retaining an alert summary near Save.
- **Regression/device:** submit invalid first/middle/last fields with keyboard and TalkBack; confirm focus lands on the field, the error is associated, and valid inputs are retained.

### D13 — Low — Promo creation can erase edits made while waiting

- **Evidence:** create captures the current form in the request and resets to `blank` on success ([admin/settings.tsx:76-90](../../../src/app/admin/settings.tsx#L76-L90)); inputs and choices have no busy disabling ([admin/settings.tsx:107-117](../../../src/app/admin/settings.tsx#L107-L117)).
- **Exact scenario:** tap Create, then begin entering the next promo on a slow connection. When the first request succeeds, the in-progress second entry is replaced by blanks.
- **Smallest fix:** disable the form while creating, or reset only if the form revision still equals the submitted revision.
- **Regression/device:** delay create, attempt edits, resolve success/failure; ensure no silent data loss and busy/disabled reasons remain clear.

## Visual/RTL/overflow hypotheses — not confirmed defects

These require an image-capable reviewer and device verification; none should be closed from source alone.

1. **Driver job hierarchy/dynamic text:** the service title, customer metadata, and earnings amount share a row ([driver/index.tsx:204-217](../../../src/app/driver/index.tsx#L204-L217)). Check long Arabic service/customer strings, large shekel values, route notes, and 200% text for collision or earnings demotion.
2. **Dashboard hierarchy:** seven wrapping stats precede operational shortcuts and chart ([admin/index.tsx:35-68](../../../src/app/admin/index.tsx#L35-L68)). Verify whether pending safety/drivers remain sufficiently prominent at full scroll height; this is a hierarchy question, not a proven defect.
3. **Admin order filter overflow/discovery:** 12 filters share the chip rail ([admin/orders.tsx:9-23](../../../src/app/admin/orders.tsx#L9-L23)). Verify AR initial position, terminal-chip reachability, selected-chip visibility, focus scrolling, and whether Safety/Disputes are discoverable without unexplained hidden options.
4. **Users card overflow:** long name/contact content and status share a row; role/vehicle/plate badges wrap separately ([admin/users.tsx:81-98](../../../src/app/admin/users.tsx#L81-L98)). Check long Arabic names, unbroken emails/plates, mixed-direction phone/plate rendering, largest text, and badge truncation.
5. **Settings label/copy fit:** computed percentage and currency are appended to already-long labels ([admin/settings.tsx:53-58](../../../src/app/admin/settings.tsx#L53-L58)). Check AR/EN wrapping, decimal-pad alignment, and whether the global error/success is visible without losing field context.
6. **Cross-cutting visual states:** the PNG set cannot establish contrast, focus visibility, 48dp targets outside the chart, safe-area behavior, reduced motion, keyboard focus order, or largest-text reflow. No claim of RTL correctness or visual perfection is made.

## Required visual follow-up

Use an image-capable model to inspect exactly `docs/screens/{ar,en}/{driver-jobs,driver-idle,driver-earnings,admin-dashboard,admin-orders,admin-users,admin-settings}.png`. Record actual crop/overflow/RTL observations separately from the source defects above. Add state captures listed in the matrix, then test critical fixes on the owner-approved physical Android device (no emulator), including 320/390px web widths where applicable, Arabic and English, largest supported text, TalkBack/keyboard, offline/reconnect, and reduced motion.

## Exact read scope

- Source routes: `src/app/driver/index.tsx`, `src/app/driver/earnings.tsx`, `src/app/admin/index.tsx`, `src/app/admin/orders.tsx`, `src/app/admin/users.tsx`, `src/app/admin/settings.tsx` (full files).
- Supporting copy: `src/copy.ts` lines 100-279, 560-769, 1120-1299, and 1575-1779; `package.json` lines 1-93; `docs/screens/README.md` lines 1-71. `src/app/**/*` was enumerated only to identify the corresponding routes; unassigned routes were not audited in this narrow retry.
- Images: all 14 requested AR/EN PNG paths resolved; all 14 `read_image` attempts failed for model capability, so their pixels were not reviewed.
- Model: **kimi-k3.1-pro**. Report only: `reports/ui-ux-pro-max-2026-11-07/driver-admin-public-audit.md`.
