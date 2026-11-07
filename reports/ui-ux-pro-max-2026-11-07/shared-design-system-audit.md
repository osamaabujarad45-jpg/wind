# Shared design-system and navigation audit

**Date:** 2026-11-07  
**Baseline:** `f8d58c14d43cc31475411899ebfa29c23b04f79c` (verified with `git rev-parse HEAD`)  
**Model:** `kimi-k3.1-pro`  
**Mode:** read-only; no product edits, emulator, device, commits, or tests.  
**Scope:** `src/ui.tsx` and the four `src/app/**/_layout.tsx` files only. The parent requested six screenshot pairs: home, sign-in, book-parcel, driver-jobs, admin-dashboard, and account.

## Executive summary

The shared UI has a coherent light palette, compact type hierarchy, good semantic text contrast, explicit RTL row/chevron handling, named icon buttons, native tab roles, safe-area wrappers, and several correct reduced-motion branches. The principal risks are systemic rather than brand-direction problems:

| ID | Severity | Confirmed finding |
|---|---|---|
| DS-01 | **High** | Several shared controls miss the requested **48dp Android** target: 46/44dp buttons, 44dp stepper keys and inputs, and a computed 44dp Section action. |
| DS-02 | **High** | Text scaling is split: `Txt` caps user scaling at 1.35, while many raw `Text` controls do not; one-line headings, stats, rows, and tab labels can truncate instead of reflow. |
| DS-03 | **Medium** | Resting input boundaries are only **1.1705:1 on paper** and **1.3129:1 on white**, below 3:1 non-text contrast; focused and error boundaries pass. |
| DS-04 | **Medium** | Admin uses six top-level tabs with 11pt single-line labels; badge counts are omitted from accessible tab names. |
| DS-05 | **Medium** | Pressed/disabled presentation is inconsistent across shared raw `Pressable` controls. |
| DS-06 | **Medium** | Shared press scaling and error entrances move even when reduced motion is requested. |
| DS-07 | **Medium** | A rejected pull-to-refresh promise leaves the spinner active indefinitely; standalone loading has no app-supplied accessible status. |
| DS-08 | **Low** | The notification badge stays at physical `right: 6` in RTL instead of following the reading-end edge. |

No Critical finding was established. Normal text pairs calculated below pass WCAG AA at their authored colors; some pass narrowly and must not be lightened.

## Method and limitations

- Read all 583 lines of `src/ui.tsx` and every line of the root, customer, driver, and admin layouts.
- Calculated contrast using WCAG sRGB relative luminance: channels `c/12.92` when `c <= 0.04045`, otherwise `((c+0.055)/1.055)^2.4`; `L = 0.2126R + 0.7152G + 0.0722B`; ratio `(Llight + 0.05)/(Ldark + 0.05)`. Values below are not rounded before pass/fail decisions.
- Target calculations use authored style dimensions plus explicit `hitSlop`; these are source geometry checks, not physical hit-testing evidence.
- **Screenshot limitation:** `read_image` was invoked for all 12 permitted PNGs, but every call failed because this model does not declare image input. No screenshot was visually decoded, so this report makes **no claim of visual screenshot verification**. An image-capable reviewer must inspect the catalogue separately.
- No heavy or other tests were run. Runtime TalkBack, keyboard, gesture, and physical-target behavior remain acceptance items.

## Token and scale inventory

### Color tokens

`src/ui.tsx:18-39` defines 20 colors: `paper #F3F2EC`, `card #FFFFFF`, `ink #0E1F19`, `secondary #56635C`, `faint #66716B`, `olive #34765A`, `olivePale #E2EEE5`, `forest #12342A`, `lime #D3F27A`, `clay #CB6845`, `clayInk #A94A28`, `clayPale #F9E9E1`, `blue #2F5E8C`, `bluePale #E6EDF6`, `line #E2E1D8`, `hair #ECEBE4`, `muted #EAE8DF`, `error #A3392A`, `onFill #FFFFFF`, and `errorPale #F8E6E2`. Status mappings at `src/ui.tsx:388-415` consistently reuse these semantic pairs.

### Type

`src/ui.tsx:167-175` defines seven variants:

| Variant | Size/line-height | Weight | Color |
|---|---:|---:|---|
| h1 | 21/28 | 800 | ink |
| h2 | 17/24 | 800 | ink |
| title | 15/21 | 700 | ink |
| body | 14/21 | 400 | secondary |
| label | 13/18 | 700 | ink |
| caption | 12/17 | 400 | secondary |
| micro | 11/15 | 600 | faint |

Additional raw-text styles at `src/ui.tsx:550-582` include 15pt buttons/list rows, 13pt choices/chips/errors/values, 11pt badges/tab labels, and a 10pt numeric badge. These bypass the `Txt` scaling policy.

### Dimensions, spacing, and radii

- Core tokens (`src/ui.tsx:44-46`): control 46, small 36, row 52, radius 16, gutter 16; icon hit slop 6 per side.
- Content (`src/ui.tsx:539-542`): horizontal 16, top 8, bottom 28; footer horizontal 16, top 10, bottom 8.
- Cards: radius 16, padding 14, bottom margin 12 (`:546`). Inputs/chips: radius 12/22 (`:556`, `:560`).
- Icon buttons 44×44/r22, regular buttons minimum 46/r23, small buttons minimum 44/r22, stepper keys 44×44, list rows minimum 52, tab items minimum 50, selected pill 54×28/r14 (`:545-580`).
- Spacing is mostly based on 4/8dp with compact exceptions (3, 5, 6, 7, 10, 14, 18). This is a consistency observation, not a defect by itself.

## Confirmed findings and smallest systemic fixes

### DS-01 — High: shared Android targets fall below 48dp

The file comment promises every target is at least 44pt (`src/ui.tsx:44`), but the audit criterion here is 48dp on Android. Actual authored geometry is:

| Control | Evidence | Effective default target | Result |
|---|---|---:|---|
| Medium Button | `size.control=46` at `:45`; `styles.button` at `:547`; no default hit slop in `Press` at `:224-234` | 46dp high | **2dp short** |
| Small Button | `styles.buttonSmall` at `:548` | 44dp high | **4dp short** |
| Section action | label line-height 18 at `:173`; `hitSlop={13}` at `:190-192` | 18 + 13 + 13 = **44dp** | **4dp short** |
| Stepper keys | 44×44 at `:554`; no hit slop at `:291-296` | 44×44dp | **4dp short each axis** |
| Text input | input minimum 44 at `:564`; wrapper only adds 1dp borders at `:560` | 44dp input / about 46dp wrapper | **below 48dp** |

Passing comparisons: `IconButton` is 44 + 6 + 6 = **56dp** (`:46`, `:156`, `:545`); Choices are 44 + 4 + 4 = **52dp vertically** (`:277`, `:532`); FilterChips are 44 + 5 + 5 = **54dp vertically** (`:331`, `:556`); ListRows are 52dp (`:570`); tab items are at least 50dp (`:578`).

**Smallest fix:** raise shared control/input/stepper minima to 48 and give Section actions a real minimum 48dp box rather than relying on slop. Recheck neighboring hit rectangles after changing stepper geometry; do not solve overlap by adding larger slop indiscriminately.

### DS-02 — High: scaling is capped inconsistently and truncation is structural

`Txt` forces `maxFontSizeMultiplier={1.35}` (`src/ui.tsx:177-184`). At an OS setting of 200%, these texts receive only 135%, contrary to the user's accessibility preference. Meanwhile Button, Choices, Stepper, FilterChips, field errors, Badge, ListRow, TabBar, and numeric tab badges use raw `Text` (`:259-261`, `:279`, `:294`, `:332`, `:374`, `:407`, `:432-433`, `:515`, `:582`) without that shared policy.

One-line limits compound the issue: Header title/subtitle (`:145-146`), Stat label/detail (`:479-481`), ListRow label (`:432`), and tab label (`:515`). These are confirmed truncation-capable code paths; actual clipping at each device/font scale needs physical verification.

**Smallest fix:** remove the blanket 1.35 cap rather than copying it to raw text. Route raw text through a common scaling-aware primitive, allow important headings/values to wrap, and redesign dense tab/header layouts for large Arabic and English text. Retain full accessible labels, but do not treat them as a remedy for sighted low-vision users.

### DS-03 — Medium: resting input boundaries fail 3:1

The resting input uses `palette.line` on paper or white (`src/ui.tsx:33`, `:359-365`, `:560`):

- `#E2E1D8` / `#F3F2EC` = **1.1705:1**.
- `#E2E1D8` / `#FFFFFF` = **1.3129:1**.

Both are below the 3:1 non-text threshold for identifying a control boundary. Focus correctly changes to forest (`:561`): forest/paper = **12.0766:1** and forest/white = **13.5453:1**. Error on errorPale = **5.4812:1** (`:562`). The failure is therefore limited to the resting boundary, not all states.

**Smallest fix:** introduce a semantic `inputBorder` token whose resting contrast is at least 3:1 against both adjacent surfaces; retain the existing focused/error tokens. Check outline buttons separately before globally darkening `line`, since that token also serves other boundaries.

### DS-04 — Medium: admin tab density and accessible badge context

Admin declares six tabs—dashboard, orders, users, cash, subscriptions, settings (`src/app/admin/_layout.tsx:8-15`)—versus three customer and four driver tabs. Six exceeds the usual five-item bottom-navigation limit. The shared label is 11pt and `numberOfLines={1}` (`src/ui.tsx:515`, `:580`). At 390dp width, the bar's 16dp horizontal padding leaves 374dp, or **62.33dp per tab**; at 320dp it leaves 304dp, or **50.67dp per tab**. Width barely clears 48dp at 320dp, while localized labels and large text have no reflow path.

Admin badge values come from pending-driver/subscription counts (`src/app/admin/_layout.tsx:7`, `:11`, `:13`). The visual number renders at `src/ui.tsx:513`, but the parent tab's accessible name is only `label` at `:505`; the count is therefore not part of the tab's explicit accessible name.

**Smallest fix:** keep at most five visible destinations and move the least frequent destination behind a clearly labeled More destination while preserving deep links. Add a localized pending-count phrase to the tab accessible label/value. Avoid a live-region announcement on every 10-second poll; updated context can be read when the tab receives focus.

### DS-05 — Medium: state feedback is inconsistent

- `IconButton` sets `disabled` semantically but has no disabled visual style (`src/ui.tsx:152-159`).
- Choices expose disabled semantics but no disabled treatment (`:271-283`).
- A fully disabled Stepper can still show active ink icons when the value is between min/max because icon color ignores the outer `disabled` value (`:287-297`).
- Field disables editing without changing its visual treatment (`:338-376`).
- Section actions, Stepper keys, FilterChips, and tab items have no immediate pressed style (`:190`, `:291-296`, `:329-333`, `:505-516`). Choices likewise change selection rather than showing an on-press state (`:276-280`).
- By contrast, shared `Press` supplies scaling and Button supplies explicit disabled colors (`:223-263`), and FilterChips at least dim when disabled (`:331`).

**Smallest fix:** centralize a subtle opacity/state-layer pressed treatment with no layout shift, plus explicit disabled tokens for icon buttons, choices, steppers, and fields. Preserve native disabled semantics and do not communicate disabled state by opacity alone where a reason can be shown.

### DS-06 — Medium: some shared motion ignores reduced-motion preference

Correct implementations exist in Appear, Pulse, and Radar (`src/ui.tsx:205-209`, `:439-461`). However, `Press` always transitions scale to 0.97 over 120ms (`:223-234`, `:527-530`) and `ErrorText` always uses `FadeInDown` (`:379-383`). Neither consults `useReducedMotion`.

**Smallest fix:** use the existing reduced-motion hook in these two shared paths; use immediate state or non-moving opacity feedback instead of scale/vertical entrance. Test rapid error replacement as well as the static reduced-motion result.

### DS-07 — Medium: refresh can become permanently busy; loading lacks explicit status

`Screen` sets `refreshing=true`, awaits `onRefresh`, and only then clears it (`src/ui.tsx:122-131`). Any rejection skips `setRefreshing(false)`, leaving a persistent spinner and a rejected promise. The standalone Loading component is only an `ActivityIndicator` with padding (`:486-491`), with no app-localized loading label, busy container, or status announcement. Button loading is better: it disables the action and sets `aria-busy` (`:253-255`).

**Smallest fix:** clear refresh state in `finally` and let the existing screen error path present failure/retry. Give Loading a localized accessible status and busy semantics without moving focus or repeatedly announcing polling updates.

### DS-08 — Low: badge edge is not RTL-aware

Tab order correctly uses the locale row direction (`src/ui.tsx:497-500`), but the numeric badge is always `right: 6` (`:581`). In Arabic this does not follow the mirrored reading-end geometry used elsewhere.

**Smallest fix:** consume `rtl` in TabBar and swap physical left/right badge placement. Do not mirror the numeral itself or the brand mark.

## Contrast results

All listed normal-text pairs meet 4.5:1 at their authored, fully opaque colors:

| Foreground/background | Ratio | AA result |
|---|---:|---|
| ink/paper | 15.2380:1 | Pass |
| ink/card | 17.0912:1 | Pass |
| secondary/paper | 5.6142:1 | Pass |
| secondary/card | 6.2969:1 | Pass |
| secondary/muted | 5.1295:1 | Pass |
| faint/paper | **4.5232:1** | Pass, very narrow margin |
| faint/card | 5.0733:1 | Pass |
| olive/olivePale | **4.5289:1** | Pass, very narrow margin |
| olive/paper | 4.8193:1 | Pass |
| olive/card | 5.4054:1 | Pass |
| onFill/forest | 13.5453:1 | Pass |
| lime/forest | 10.8051:1 | Pass |
| clayInk/clayPale | 4.8066:1 | Pass |
| onFill/clayInk | 5.6800:1 | Pass, including 10pt numeric badge |
| blue/bluePale | 5.7437:1 | Pass |
| error/errorPale | 5.4812:1 | Pass |
| onFill/olive | 5.4054:1 | Pass |
| onFill/blue | 6.7728:1 | Pass |

`clay` is not used as normal text in the audited source. Its logo/marker contrast is 3.6155:1 on forest and 3.3402:1 on paper, above 3:1 for meaningful non-text graphics but below 4.5:1 for normal text. `hair/card` is 1.1952:1 and `muted/card` 1.2276:1; decorative grouping/dividers need not all meet 3:1, but they must not become the sole indicator of essential state.

## Existing strengths to preserve

- `Logo` has an image role and localized brand name (`src/ui.tsx:107-113`).
- Header back and ListRow chevrons are direction-aware (`:139-149`, `:425-435`); Button directional icons mirror (`:256-258`).
- IconButton has an explicit name and pressed opacity (`:152-159`).
- `Txt` can expose header semantics (`:177-184`).
- Fields have visible labels, accessible names, keyboard types, inline errors, Android polite live regions, and a strong focused border (`:338-376`). ErrorText has alert semantics (`:379-383`).
- Tab items expose tab role, full destination label, selected state, and at least 50dp height (`:497-518`). Customer and driver sets stay within five items.
- Safe-area and keyboard wrappers are shared (`:118-136`); the footer is outside the ScrollView rather than painted over its content.
- Appear/Pulse/Radar already honor reduced motion (`:205-209`, `:439-461`).

## Suggestions requiring runtime confirmation (not confirmed defects)

1. **TalkBack icon verbosity:** decorative Ionicons beside visible labels are not consistently hidden explicitly. Verify whether Button, Field, Badge, Empty, and tab icons produce duplicate/private-use announcements; hide decorative glyphs only where duplication actually occurs.
2. **Route and keyboard focus:** layouts set roles but no explicit route-focus or external-keyboard focus treatment. Verify first focus after tab/stack transitions, visible focus, focus order in reversed Arabic rows, and that the intro overlay cannot expose obscured underlying routes to TalkBack.
3. **Stack direction:** shared components mirror correctly, but root Stack transition direction needs Arabic physical verification; do not infer it from row reversal alone.
4. **Keyboard/fixed footer:** the shared structure is sound, but verify focused inputs and footer actions with the Android keyboard open, especially at large text.

## Required regression tests and physical acceptance

### Automated tests to add

1. Shared geometry test asserting Android-effective targets are at least 48dp for Button sizes, Section action, Stepper, and Field; retain passing IconButton/Choices/FilterChips/TabBar cases.
2. Font-scale coverage at 1.0, 1.35, and 2.0 in Arabic and English for Header, Button, ListRow, Stat, and every tab set; assert no forced global cap and inspect wrapping/truncation.
3. Tab semantics tests for each role, selected state, full localized name, and localized pending-count context; verify admin remains within its chosen navigation limit.
4. Pressed/disabled/reduced-motion tests for each shared control family, including rejection-safe Press behavior and immediate ErrorText under reduced motion.
5. Refresh test with both resolved and rejected promises; `refreshing` must return false in both cases. Loading must expose a localized busy/status name.
6. Contrast unit checks for semantic text pairs and resting/focus/error input borders so near-threshold `faint/paper` and `olive/olivePale` cannot silently regress.
7. RTL tests for tab order and badge edge; retain directional back/chevron cases.

### Physical acceptance (not performed)

Use the attached physical Android device, never an emulator, in both Arabic and English:

- At default and largest system font, traverse home, sign-in, book parcel, driver jobs, admin, and account. Require readable labels without clipped primary actions, obscured content, or inaccessible values.
- With TalkBack, verify route-change focus, logical tab order, selected state, pending counts, error/loading announcements, no duplicate decorative icon speech, and no focus behind intro/overlays.
- Measure actual hit rectangles including slop for all shared control sizes and adjacent stepper keys; require 48×48dp without overlapping taps.
- Verify resting/focused/error field visibility, immediate pressed feedback, non-interactive and visibly distinct disabled controls, and keyboard-visible focused inputs/footer actions.
- Enable reduced motion and confirm no press scaling or vertical error entrance; status must remain understandable statically.
- Force a failed refresh and require spinner removal plus an accessible retry path.
- An image-capable reviewer must compare all six requested PNG pairs; current source evidence cannot certify their rendered Arabic/English appearance.

## Exact source/context files read

Audited in full:
- `src/ui.tsx`
- `src/app/_layout.tsx`
- `src/app/(customer)/_layout.tsx`
- `src/app/driver/_layout.tsx`
- `src/app/admin/_layout.tsx`

Context read before the parent narrowed scope (not audited here): `package.json`, `app.json`, `docs/screens/README.md`, `docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md`.

## Exact screenshots attempted — none visually read

Each path below returned the same unsupported-image-input error:

- `docs/screens/en/home.png`; `docs/screens/ar/home.png`
- `docs/screens/en/sign-in.png`; `docs/screens/ar/sign-in.png`
- `docs/screens/en/book-parcel.png`; `docs/screens/ar/book-parcel.png`
- `docs/screens/en/driver-jobs.png`; `docs/screens/ar/driver-jobs.png`
- `docs/screens/en/admin-dashboard.png`; `docs/screens/ar/admin-dashboard.png`
- `docs/screens/en/account.png`; `docs/screens/ar/account.png`

**Conclusion:** keep the existing visual language and passing semantic text pairs. Fix shared geometry, text scaling/reflow, resting input boundaries, and admin navigation first; then centralize interaction states and close reduced-motion/async gaps. Do not claim screenshot or physical accessibility acceptance until the explicitly blocked checks are completed.
