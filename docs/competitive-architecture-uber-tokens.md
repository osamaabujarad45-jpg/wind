# Fastship Design-Token Build Spec — Extracted from Uber Rider-Android (REA) Resources

**Scope:** READ-ONLY static analysis of decompiled Android resources at
`C:\Users\osama\AppData\Local\Temp\opencode\uber\rea-full\resources\res`.
**Goal:** a BUILD SPEC of design/engineering patterns for an independent courier app
(Fastship). This document records *roles, geometry, and numeric scales* — facts that are
not copyrightable artwork. **Uber brand hex values are not copied verbatim**; they are mapped
to Fastship palette roles. No decompiled code logic is pasted for reuse.

Tags: **OBSERVATION** = directly read from a cited file. **INFERENCE** = reasoned from
observations. **UNKNOWN** = could not be confirmed from the extracted files.

Source files cited (all under `…\rea-full\resources\res\`):
- `values\styles.xml` (1.6 MB) — `Platform.TextStyle.*`, `Platform.Button.*`, theme color-role blocks
- `values\dimens.xml` (244 KB) — `ui__spacing_unit_*`, `ui__elevation_*`, `foundation_ui__text_size_*`, `foundation_ui__line_height_*`, `ui__list_item_*`, corner radii
- `values\attrs.xml` (262 KB) — color-role attribute declarations
- `values\colors.xml` + `values-night\colors.xml` — concrete color resources + dark overrides
- `layout\list_item_platform_content_v4.xml` — list-row slot geometry
- `font\` — Uber Move family (regular/medium/bold + mono + British Rail numerics)

---

## 1. COLOR ROLES — light + dark

**OBSERVATION** — color roles are declared as theme **attributes** in `values\attrs.xml`
(e.g. `attrs.xml:602 backgroundPrimary`, `attrs.xml:1860 contentPrimary`,
`attrs.xml:1108-1114 brandGrey20/40/60/80`, `attrs.xml:2074 dividerHorizontal`,
`attrs.xml:3020 iconColor`, `attrs.xml:548-552 backgroundButton{Primary,Secondary,Tertiary}Pressed`).
Their **values are assigned in two parallel theme styles**: `Theme.Base2Color.Light`
(`styles.xml:9375-9462`) and a dark block (`styles.xml:9290-9372`). The day/night entry
point `Theme.Base2Color.DayNight` (`styles.xml:9373`) **parents the Light block**
(`parent="@style/Theme.Base2Color.Light"`) — corrected after independent verification
(the dark block is the sibling `values-night` counterpart, not the parent). A second
**semantic layer**, `Theme.Base2SemanticColorMapping.DayNight` (`styles.xml:9463-9519`),
maps semantic names
(positive/negative/warning/neutral/brand) onto the primitive roles — the standard
"semantic-on-primitive" two-tier system.

### 1.1 Primitive role inventory (OBSERVATION — `styles.xml:9296-9325` dark, `9386-9415` light)

Backgrounds:
`backgroundBase`, `backgroundPrimary`, `backgroundSecondary`, `backgroundTertiary`,
`backgroundDisabled`, `backgroundTrack`, `backgroundScrim`, `backgroundOverlayArt`,
`backgroundInversePrimary`, `backgroundInverseSecondary`,
`backgroundStateLayerHover`, `backgroundStateLayerPressed`,
`backgroundInverseStateLayerHover`, `backgroundInverseStateLayerPressed`.

Content (text/icon foregrounds):
`contentPrimary`, `contentSecondary`, `contentTertiary`, `contentDisabled`, `contentLegal`,
`contentInversePrimary`, `contentInverseSecondary`, `contentInverseTertiary`,
`contentAlwaysDark`, `contentAlwaysLight`, `contentOnColor`.

Borders:
`borderSubtle`, `borderBold`, `borderAccessible`,
`borderInverseSubtle`, `borderInverseBold`, `borderInverseAccessible`.

Icon/divider: `iconColor`, `iconColorInverse` (`attrs.xml:3020-3022`), `dividerHorizontal` (`attrs.xml:2074`).

Greyscale ramp: `brandGrey20`, `brandGrey40`, `brandGrey60`, `brandGrey80` (`attrs.xml:1108-1114`).

Brand/accent family: `accentBackgroundPrimaryBold/Subtle/Disabled`, `accentBorderPrimaryAccessible/Bold/Subtle`,
`accentContentPrimary`, `accentContentPrimaryDisabled`, `accentContentPrimaryOnBold`, `accentContentPrimaryOnSubtle`.

Button press (ripple targets): `backgroundButtonPrimaryPressed`, `backgroundButtonSecondaryPressed`,
`backgroundButtonTertiaryPressed` (`attrs.xml:548-552`).

Semantic families — each has `BackgroundBold/Subtle`, `BorderAccessible/Bold/Subtle`,
`ContentPrimary/OnBold/OnSubtle/OnInverse/Disabled`: `error*`, `warning*`, `info*`, `success*`
(`styles.xml:9326-9371` dark / `9416-9461` light).

### 1.2 Dark-mode inversion pattern (OBSERVATION + INFERENCE)

**OBSERVATION** — the same role name resolves to a different resource in each theme:
- Light: `backgroundPrimary = @color/ub__base2_background_primary` (`styles.xml:9393`);
  `contentPrimary = @color/ub__base2_content_primary` (`styles.xml:9413`).
- Dark:  `backgroundPrimary = @color/ub__base2_dark_background_primary` (`styles.xml:9303`);
  `contentPrimary = @color/ub__base2_dark_content_primary` (`styles.xml:9323`).

The `_dark_` resources live in `values-night\colors.xml` (e.g.
`values-night\colors.xml:3-40` re-point named colors at `ub__ui_core_v3_dark_*` primitives).

**INFERENCE** — the inversion rules are:
1. `background*` ↔ `backgroundInverse*` swap lightness (light bg becomes dark; the "inverse"
   surface becomes the light card-on-dark).
2. `content*` ↔ `contentInverse*` swap lightness (dark text → light text).
3. `contentAlwaysDark` and `contentAlwaysLight` are **fixed** across modes — they exist
   precisely so a colored surface (e.g. a brand fill) always gets the right-contrast glyph
   regardless of theme. `contentOnColor = contentAlwaysLight` in light (`styles.xml:9511`),
   `= contentAlwaysDark` in dark (`styles.xml:9512`).
4. `brandGrey*` ramp inverts as a set (20↔80, 40↔60).
5. The `error/warning/info/success` families keep their **hue** but swap bold↔subtle
   lightness (a "subtle" tint in light becomes a translucent overlay on dark).
6. State-layer roles (`backgroundStateLayerHover/Pressed`) become lighter overlays in dark.

**OBSERVATION** — `iconColor` is **not** a fixed color; it is a role that resolves per-context:
`styles.xml:852 iconColor = ?attr/iconInverse` (on colored surfaces),
`styles.xml:890 iconColor = ?attr/contentPrimary` (default), with hard overrides at
`styles.xml:4179/4208/4386/5944/9649`. INFERENCE: `iconColor` is "follow contentPrimary,
follow inverse on filled surfaces" — a derived role, not a primitive.

### 1.3 Fastship color roles to create (mapped, NOT Uber hex)

Fastship keeps its own palette (`src/ui.tsx:18-39`: `paper #F3F2EC`, `card #FFF`,
`ink #0E1F19`, `secondary #56635C`, `faint #66716B`, `olive`, `olivePale`, `forest #12342A`,
`lime` (only on forest), `clay`, `clayInk`, `clayPale`, `blue`, `bluePale`, `line #E2E1D8`,
`hair #ECEBE4`, `muted #EAE8DF`, `error #A3392A`, `errorPale`, `onFill #FFF`). The new roles
**reuse these**; no new hex is introduced. Lightness relationships mirror §1.2:

| Fastship role (new)            | Light ← palette             | Dark ← palette (inverted)        | Uber role mapped          |
|--------------------------------|------------------------------|----------------------------------|---------------------------|
| `surface.primary`             | `paper`                      | `ink`                            | backgroundPrimary         |
| `surface.secondary`           | `card`                       | `forest`                         | backgroundSecondary       |
| `surface.tertiary`            | `muted`                      | `#0A1812`* (ink darkened)        | backgroundTertiary        |
| `surface.inverse`             | `ink`                        | `paper`                          | backgroundInversePrimary  |
| `surface.disabled`            | `muted`                      | `ink`+overlay                    | backgroundDisabled        |
| `surface.scrim`               | `rgba(ink,.5)`               | `rgba(ink,.6)`                    | backgroundScrim           |
| `content.primary`             | `ink`                        | `paper`                          | contentPrimary            |
| `content.secondary`           | `secondary`                  | `faint`                          | contentSecondary          |
| `content.tertiary`            | `faint`                      | `#8A958F`*                       | contentTertiary           |
| `content.onColor`             | `onFill` (on forest)         | `lime` (on forest, fixed)         | contentOnColor/AlwaysLight|
| `content.disabled`             | `faint`                      | `#6A7570`*                       | contentDisabled           |
| `border.subtle`               | `hair`                       | `rgba(paper,.08)`                | borderSubtle              |
| `border.bold`                 | `line`                       | `rgba(paper,.16)`                | borderBold                |
| `border.accessible`           | `olive`                      | `lime` (3:1 on forest)           | borderAccessible          |
| `divider.horizontal`          | `hair`                       | `rgba(paper,.08)`                | dividerHorizontal         |
| `icon.default`                | `secondary`/`ink`            | `faint`/`paper`                  | iconColor (derived)       |
| `icon.onColor`                | `lime` (on forest)           | `lime` (fixed)                   | iconInverse               |
| `brand.background.bold`        | `forest`                     | `forest`                         | accentBackgroundPrimaryBold|
| `brand.background.subtle`     | `olivePale`                  | `rgba(olive,.18)`                | accentBackgroundPrimarySubtle|
| `brand.content.onBold`        | `lime`                       | `lime`                           | accentContentPrimaryOnBold|
| `brand.content.primary`       | `olive`                      | `lime`                           | accentContentPrimary      |
| `state.hover`                 | `rgba(ink,.04)`              | `rgba(paper,.08)`                | backgroundStateLayerHover |
| `state.pressed`               | `rgba(ink,.08)`              | `rgba(paper,.12)`                | backgroundStateLayerPressed|
| `button.primary.pressed`      | `#0D2A20` (forest darkened) | `#0A1F17`                        | backgroundButtonPrimaryPressed|
| `button.secondary.pressed`    | `rgba(ink,.08)`              | `rgba(paper,.12)`                | backgroundButtonSecondaryPressed|
| `button.tertiary.pressed`     | `rgba(ink,.08)`              | `rgba(paper,.12)`                | backgroundButtonTertiaryPressed|
| `intent.error.bg.subtle`      | `errorPale`                  | `rgba(error,.20)`                | errorBackgroundSubtle     |
| `intent.error.content`        | `error`                      | `#D86A55`*                       | errorContentPrimary       |
| `intent.success.bg.subtle`    | `olivePale`                  | `rgba(olive,.20)`                | successBackgroundSubtle   |
| `intent.success.content`      | `olive`                      | `#6FB893`*                       | successContentPrimary     |
| `intent.warning.bg.subtle`    | `clayPale`                   | `rgba(clay,.20)`                 | warningBackgroundSubtle   |
| `intent.warning.content`      | `clayInk`                    | `#E09A7E`*                       | warningContentPrimary     |

`*` = a derived shade not in `palette` today; defined as a CSS color-mix / rgba in the
token object so no new literal hex enters the codebase. The hue family is preserved
(forest/olive/clay/error) — only lightness shifts, mirroring Uber's `_dark_` resource swap.

---

## 2. TYPE SCALE — `Platform.TextStyle.*`

**OBSERVATION** — every style block lives in `styles.xml:6381-7315`. Two patterns:
- **Concrete** styles hard-code `android:textSize` (sp) and `lineHeightHint` (sp) and
  `android:letterSpacing`.
- **Attr-resolved** styles use `?attr/textSizeX` / `?attr/lineHeightX`, which resolve via
  the typography theme (`styles.xml:12061-12128`) to `@dimen/foundation_ui__text_size_*`
  (`dimens.xml:357-388`) and `@dimen/foundation_ui__line_height_*` (`dimens.xml:325-356`)
  or inline sp (`styles.xml:12067-12128`).

**Font-weight convention** (OBSERVATION) — Uber carries weight in the **font file**, not
`android:textFontWeight`. The `Book`/`News`/`Medium`/`Bold` suffixes select the file:
- `Book` → `fontPath=lightFontPath` → `fonts/UberMoveText-Light.otf` (**≈300 Light**, used for large display) — via `android:fontFamily` it points at `uber_move_text_regular`, but Uber's own text views consume the `fontPath` channel, which loads the **Light** file (`strings.xml:11361`). Corrected after independent verification.
- `News` → `uber_move_text_regular` (`fontPath=normalFontPath`) — regular weight 400, body default
- `Medium` → `uber_move_text_medium` — weight 500
- `Bold` → `uber_move_bold` — weight 700
**INFERENCE (corrected):** `Book` and `News` do **not** render at the same weight on the channel Uber's text views use — Book is **Light (~300)**, News is **Regular (400)**; the split is both an intent label and a real weight difference. Fastship maps: News/body → 400, Medium → 600, Bold → 800 to match Fastship's existing `textVariants` weights (`src/ui.tsx:168-174`); treat Book (large display) as a lighter display cut if Fastship adds a light font, otherwise 400 is acceptable.

Letter spacing is **negative** and grows in magnitude as size shrinks (tightening), and
**positive** and grows as size grows (loosening for display). OBSERVATION across Headline
family: 12sp→0.0317, 14sp→0.0271, 16sp→0.0219, 18sp→0.0194, 20sp→0.0175, 24sp→0.0146,
28sp→0.0125. Body family: 12sp→-0.0042, 14sp→-0.0036, 16sp→-0.0031 (negative, tightening).

### 2.1 Type scale table (size / line-height / weight / letter-spacing)

| Style (Platform.TextStyle.*)       | textSize | lineHeight | weight | letterSpacing | Source |
|-----------------------------------|----------|-----------|--------|---------------|--------|
| BodyLRegular / BodyLMedium        | 16sp     | 20sp      | 400/500 | -0.0031     | `styles.xml:6381-6394` |
| BodyMRegular / BodyMMedium        | 14sp     | 18sp      | 400/500 | -0.0036     | `styles.xml:6395-6408` |
| BodySRegular / BodySMedium        | 12sp     | 16sp      | 400/500 | -0.0042     | `styles.xml:6409-6422` |
| H1 (=DisplayLarge) Book/News      | 28sp     | 42sp      | 400    | —             | `styles.xml:6562-6577`, `dimens.xml:363,331` |
| H2 (=Display) Book/News          | 24sp     | 40sp      | 400    | —             | `styles.xml:6578-6599`, `dimens.xml:362,330` |
| H3 (=Title/Headline) Book/News   | 18sp     | 30sp      | 400    | —             | `styles.xml:6611-6629`, `dimens.xml:388,356` |
| H4 (=Subtitle) Book/Medium/News  | 16sp     | 25sp      | 400/500 | —            | `styles.xml:6636-6658`, `dimens.xml:387,355` |
| H5 (=Small) Book/Medium/News     | 14sp     | 22sp      | 400/500 | —            | `styles.xml:6659-6677`, `dimens.xml:386,354` |
| H6 (=Meta) Book/Medium/News      | 12sp     | 20sp      | 400/500 | —            | `styles.xml:6693-6717`, `dimens.xml:373,341` |
| DisplayDefault                    | 52sp     | 64sp      | varies | —             | `styles.xml:6463-6469`, `styles.xml:12067,11839` |
| DisplayLarge (base)               | 96sp     | 112sp     | varies | —             | `styles.xml:6470-6476`, `styles.xml:12069,11841` |
| DisplayLarge.Light/Medium/Normal | 28sp     | 42sp      | 400/500 | —             | `styles.xml:6477-6490` (overrides H1 base) |
| DisplaySmall                      | 44sp     | 52sp      | varies | —             | `styles.xml:6491-6497`, `styles.xml:12070,11842` |
| DisplayXSmall                     | 36sp     | 44sp      | varies | —             | `styles.xml:6498-6504`, `styles.xml:12071,11843` |
| Giga.Medium/Normal                | 58sp     | 68sp      | 500/400 | —             | `styles.xml:6520-6533`, `dimens.xml:364,332` |
| GigaLarge.Medium/Normal           | 66sp     | 72sp      | 500/400 | —             | `styles.xml:6534-6547`, `dimens.xml:365,333` |
| GigaSmall.Medium/Normal           | 52sp     | 64sp      | 500/400 | —             | `styles.xml:6548-6561`, `dimens.xml:366,334` |
| Mega.Medium/Normal                | 42sp     | 52sp      | 500/400 | —             | `styles.xml:7001-7014`, `dimens.xml:370,338` |
| MegaLarge.Medium/Normal           | 46sp     | 56sp      | 500/400 | —             | `styles.xml:7015-7028`, `dimens.xml:371,339` |
| MegaSmall.Medium/Normal           | 36sp     | 48sp      | 500/400 | —             | `styles.xml:7029-7042`, `dimens.xml:372,340` |
| HeadingXXLarge                    | 40sp     | (attr)    | 700    | (attr)         | `styles.xml:6774-6780`, `styles.xml:12080` |
| HeadingXLarge                     | 36sp     | (attr)    | 700    | (attr)         | `styles.xml:6760-6766`, `styles.xml:12078` |
| HeadingLarge                      | 32sp     | (attr)    | 700    | (attr)         | `styles.xml:6746-6752`, `styles.xml:12076` |
| HeadingDefault                    | 28sp     | (attr)    | 700    | (attr)         | `styles.xml:6739-6745`, `styles.xml:12075` |
| HeadingSmall                      | 24sp     | (attr)    | 700    | (attr)         | `styles.xml:6753-6759`, `styles.xml:12077` |
| HeadingXSmall                     | 20sp     | (attr)    | 700    | (attr)         | `styles.xml:6767-6773`, `styles.xml:12079` |
| HeadlineL Bold/Medium/Regular     | 20sp     | 24sp      | 700/500/400 | 0.0175/0.015/0.0125 | `styles.xml:6795-6815` |
| HeadlineM Bold/Medium/Regular     | 18sp     | 22sp      | 700/500/400 | 0.0194/0.0167/0.0139 | `styles.xml:6816-6836` |
| HeadlineS Bold/Medium/Regular     | 16sp     | 20sp      | 700/500/400 | 0.0219/0.0188/0.0156 | `styles.xml:6837-6857` |
| HeadlineXL Bold/Medium/Regular    | 24sp     | 28sp      | 700/500/400 | 0.0146/0.0125/0.0104 | `styles.xml:6858-6878` |
| HeadlineXS Bold/Medium/Regular    | 14sp     | 18sp      | 700/500/400 | 0.0271/0.0236/0.02   | `styles.xml:6879-6899` |
| HeadlineXXL Bold/Medium/Regular   | 28sp     | 32sp      | 700/500/400 | 0.0125/0.0107/0.0089 | `styles.xml:6900-6920` |
| HeadlineXXS Bold/Medium/Regular   | 12sp     | 16sp      | 700/500/400 | 0.0317/0.0275/0.0233 | `styles.xml:6921-6941` |
| LabelLarge                        | 18sp     | 24sp      | 500    | (attr)         | `styles.xml:6952-6958`, `styles.xml:12083,11855` |
| LabelDefault                      | 16sp     | 20sp      | 500    | (attr)         | `styles.xml:6942-6948`, `styles.xml:12082,9561` |
| LabelSmall                        | 14sp     | 16sp      | 500    | (attr)         | `styles.xml:6959-6965`, `styles.xml:12084,11856` |
| LabelXSmall                       | 12sp     | 16sp      | 500    | (attr)         | `styles.xml:6966-6972`, `styles.xml:12085,9564` |
| ParagraphDefault                  | 16sp     | 24sp      | 400    | (attr)         | `styles.xml:7274-7280`, `styles.xml:12104,11876` |
| ParagraphLarge                    | 18sp     | 20sp†     | 400    | (attr)         | `styles.xml:7281-7287`, `styles.xml:12105,9566` |
| ParagraphSmall                    | 14sp     | 18sp      | 400    | (attr)         | `styles.xml:7291-7297`, `styles.xml:12106,9567` |
| ParagraphXSmall                   | 12sp     | (attr)    | 400    | (attr)         | `styles.xml:7298-7304`, `styles.xml:12107` |
| Paragraph (legacy P.Book)         | 14sp     | 22sp      | 400/500/700 | —        | `styles.xml:7256-7273`, `dimens.xml:385,353` |
| ListHeader                        | 14sp     | 22sp      | 500    | —             | `styles.xml:6981-6991` (H5.News.Tertiary + 48dp min + 2x top pad) |
| Button.Bold (=H4.Medium)          | 16sp     | 25sp      | 500    | —             | `styles.xml:6441-6444`, `dimens.xml:360,328` |
| ButtonSmall.Bold (=H5.Medium)     | 14sp     | 22sp      | 500    | —             | `styles.xml:6445-6448`, `dimens.xml:361,354` |
| BrandButton.Bold                  | 22sp     | 22sp      | 700    | —             | `styles.xml:6423-6428`, `dimens.xml:357,325` |
| BrandButtonLarge.Bold             | 24sp     | 24sp      | 700    | —             | `styles.xml:6429-6434`, `dimens.xml:358,326` |
| BrandButtonSmall.Bold             | 20sp     | 20sp      | 700    | —             | `styles.xml:6435-6440`, `dimens.xml:359,327` |
| Link.Bold                         | 16sp     | 25sp      | 500    | —             | `styles.xml:6973-6976`, `dimens.xml:368,336` |
| LinkSmall.Bold                    | 14sp     | 22sp      | 500    | —             | `styles.xml:6977-6980`, `dimens.xml:369,337` |
| MonoDisplayDefault                | 52sp     | 64sp      | 500(mono) | —         | `styles.xml:7053-7058` (uber_move_mono_medium) |
| Meta.Bold / Meta.Normal           | 12sp     | 20sp      | 500/400 | —            | `styles.xml:7043-7052` |

`†` ParagraphLarge lineHeight is ambiguous across the two typography themes
(`styles.xml:9566` = 20sp vs a `@dimen` form). **UNKNOWN** which ships; 20sp is the
safest reading. Mono family uses `uber_move_mono_*` for numerics (fares, ETAs).

### 2.2 Numeric scale summary (OBSERVATION — `dimens.xml:357-388`)

`foundation_ui__text_size_*`: brand_button 22, brand_button_large 24, brand_button_small 20,
button 16, buttonsmall 14, display 24, displaylarge 28, giga 58, gigalarge 66, gigasmall 52,
headline 21, link 16, linksmall 14, mega 42, megalarge 46, megasmall 36, meta 12, paragraph 14,
small 14, subtitle 16, title 18. Move-H ramp h1..h11: 66/58/52/46/41/36/32/28/26/22/20.

`foundation_ui__line_height_*`: brand_button 22, brand_button_large 24, brand_button_small 20,
button 25, buttonsmall 22, display 40, displaylarge 42, giga 68, gigalarge 72, gigasmall 64,
headline 30, link 25, linksmall 22, mega 52, megalarge 56, megasmall 48, meta 20, paragraph 22,
small 22, subtitle 25, title 30.

`ui__text_size_*` legacy (`dimens.xml:3342-3349`): extra_large 28, large 24, medium 18,
mega 36, micro 10, small 14, smallmedium 16, tiny 12 (sp). Used by EditText etc.

---

## 3. SPACING / ELEVATION / CORNER

### 3.1 `ui__spacing_unit_*` — 8 dp base grid (OBSERVATION — `dimens.xml:3297-3332`)

| Multiplier | dp   | | Multiplier | dp   | | Multiplier | dp   |
|------------|------|-|------------|------|-|------------|------|
| 0x         | 0    | | 1.25x      | 10   | | 6x         | 48   |
| 0.125x     | 1    | | 1.5x       | 12   | | 6.5x       | 52   |
| 0.25x      | 2    | | 1.75x      | 14   | | 7x         | 56   |
| 0.375x     | 3    | | 2x         | 16   | | 8x         | 64   |
| 0.5x       | 4    | | 2.25x      | 18   | | 8.5x       | 68   |
| 0.75x      | 6    | | 2.5x       | 20   | | 9x         | 72   |
| 1x         | 8    | | 2.75x      | 22   | | 10x        | 80   |
|            |      | | 3x         | 24   | | 11x        | 88   |
|            |      | | 3.5x       | 28   | | 11.25x     | 90   |
|            |      | | 4x         | 32   | | 12x        | 96   |
|            |      | | 4.5x       | 36   | | 13x        | 104  |
|            |      | | 5x         | 40   | | 14x        | 112  |
|            |      | | 5.5x       | 44   | | 15x / 16x  | 120 / 128 |

**OBSERVATION** — `ui__spacing_unit_1 = 2dp` and `ui__spacing_unit_5 = 10dp` (no `x`)
are legacy off-grid tokens; the canonical scale is the `…x` series. **INFERENCE:** the
design system is an **8 dp base grid** with quarter/half steps for fine-tuning (0.125x=1,
0.25x=2, 0.375x=3, 0.5x=4). Fastship's existing `size.gutter = 16` (`src/ui.tsx:45`) = `2x`.

### 3.2 Elevation (OBSERVATION — `dimens.xml:3153-3156, 3144, 3340-3341, 3155`)

| Token | dp | Source |
|-------|----|--------|
| `ui__elevation_low`        | 4  | `dimens.xml:3155` |
| `ui__elevation_medium`    | 8  | `dimens.xml:3156` |
| `ui__elevation_high` / `_v2` | 16 | `dimens.xml:3153-3154` |
| `ui__button_elevation_raised` | 8 | `dimens.xml:3144` |
| `ui__toolbar_elevation`    | 3  | `dimens.xml:3355` |
| `ui__switch_elevation`     | 1  | `dimens.xml:3341` |
| `ui__sub_menu_elevation`   | 9  | `dimens.xml:3340` |
| `bottom_sheet_normal_elevation` | 24 (=3x) | `dimens.xml:144` |
| `bottom_sheet_high_elevation`    | 32 (=4x) | `dimens.xml:143` |
| `design_bottom_sheet_elevation` (Material) | 8 | `dimens.xml:222` |
| `design_bottom_sheet_modal_elevation` (Material) | 16 | `dimens.xml:223` |

**OBSERVATION** — the Uber bottom-sheet uses the **spacing scale** (24/32 dp), not the
`ui__elevation_*` ladder (4/8/16). INFERENCE: the platform sheet sits higher off the
content than Material default; the Material 8/16 values are present but unused by the
platform sheet.

### 3.3 Corner radii (OBSERVATION)

| Token | dp | Source |
|-------|----|--------|
| `ui__corner_radius` (base/sharp)  | 2  | `dimens.xml:3148` |
| `style_guide_corner_radius_small` | 2  | `dimens.xml:1641` |
| `style_guide_corner_radius_large` | 16 | `dimens.xml:1640` |
| `bottom_sheet_corner_radius`     | 16 (=2x) | `dimens.xml:140` |
| `banner_background_corner_radius`| 12 | `dimens.xml:132` |
| `reserve_disclosure_card_corner_radius` | 12 | `dimens.xml:1601` |
| `ooa_button_corner_radius`       | 8  | `dimens.xml:1518` |
| `ui__timer_corner_radius`        | 4  | `dimens.xml:3351` |
| `mtrl_btn_corner_radius` (Material) | 4 | `dimens.xml:1309` |
| `mtrl_card_corner_radius` (Material) | 4 | `dimens.xml:1376` |
| Platform.Button.Base `cornerRadius` | 0 (=0x) | `styles.xml:6138` |

**INFERENCE** — Uber's radius ladder is **2 / 4 / 8 / 12 / 16** with pill = height/2
(computed, not a constant). Cards use 12-16; buttons are sharp (0) by default and become
pills via a `shape` enum (see §4). Fastship's existing `size.radius = 16` (`src/ui.tsx:45`)
maps to `2x`/large; the spec adds 2/4/8/12 below it.

### 3.4 Component heights (OBSERVATION — `dimens.xml:3187, 3223-3233, 3240-3241`)

| Token | dp | Source |
|-------|----|--------|
| `ui__header_height`                       | 96 | `dimens.xml:3187` |
| `ui__min_button_height` / `_helix`        | 64 | `dimens.xml:3240-3241` |
| `ui__list_item_min_height_standard_v2`    | 64 | `dimens.xml:3226` |
| `ui__list_item_min_height_single_line`    | 64 | `dimens.xml:3224` |
| `ui__list_item_min_height_two_line`       | 84 | `dimens.xml:3227` |
| `ui__list_item_min_height_compact_v2`     | 48 | `dimens.xml:3223` |
| `ui__list_item_min_height_single_line_compact` | 44 | `dimens.xml:3225` |
| `ui__list_item_min_height_two_line_compact`   | 50 | `dimens.xml:3228` |
| `ui__list_item_vertical_padding_standard`     | 12 | `dimens.xml:3233` |
| `ui__list_item_vertical_padding_compact`      | 8  | `dimens.xml:3232` |
| `ui__list_item_image_bounds_v2`           | 48 | `dimens.xml:3219` |
| `ui__list_item_image_bounds` (legacy)     | 64 | `dimens.xml:3218` |
| `ui__list_item_circular_image_bounds`     | 36 | `dimens.xml:3216` |
| `ui__list_item_base_image_margin_v2`      | 8  | `dimens.xml:3209` |
| `ui__list_item_secondary_button_padding`  | 14 | `dimens.xml:3231` |
| `design_bottom_sheet_peek_height_min`     | 64 | `dimens.xml:224` |
| `m3_bottom_sheet_drag_handle_bottom_padding` | 20 | `dimens.xml:495` |
| FAB size                                 | UNKNOWN — no `ui__fab*` token found in `values\dimens.xml`. Material default 56 dp is the likely fallback. | |

Fastship today uses `control 46, small 36, row 52, radius 16, gutter 16` (`src/ui.tsx:45`).
The spec **keeps** these (they are calibrated for Fastship's A53 testing per `src/ui.tsx:44`)
and adds the platform values as an *optional* `tokens.control` map for new components.

---

## 4. BUTTON MATRIX — `Platform.Button.Base.*`

**OBSERVATION** — `Platform.Button` parent (`styles.xml:6120-6132`) sets
`android:minHeight = ui__min_button_height_helix = 64dp`, `singleLine`, `textAllCaps`,
`padding = 2x = 16`. `Platform.Button.Base` (`styles.xml:6133-6141`) overrides:
`paddingStart/End = 2x = 16`, `cornerRadius = 0x = 0`, `fontFamily = uber_move_text_medium`,
`textAllCaps = false`. Variants add color; sizes add text/padding; **shape is driven by an
`app:shape` enum** (`pill`/`circle`/`square`) on `BaseMaterialButton`
(`layout\list_item_platform_content_v4.xml:287 app:shape="pill"`) — cornerRadius is
computed (pill = height/2 = 32dp, circle = square + height/2), not stored.

### 4.1 Variant → colors (OBSERVATION — `styles.xml:6169-6239`)

| Variant | backgroundTint | textColor / iconTint | rippleColor |
|---------|----------------|----------------------|-------------|
| Primary   | `ub__base_button_primary_background_color`   | `ub__base_button_primary_content_color`   | (default) |
| Secondary | `ub__base_button_secondary_background_color` | `ub__base_button_secondary_content_color` | `?attr/backgroundButtonSecondaryPressed` |
| Tertiary  | `?attr/backgroundPrimary` (surface)         | `ub__base_button_tertiary_content_color`  | `?attr/backgroundButtonTertiaryPressed` |

Color resources are **state-lists**, not raw hex (OBSERVATION). Fastship maps them to
roles (§1.3): Primary = `brand.background.bold` (forest) + `content.onColor` (lime);
Secondary = `surface.secondary` (card) + `content.primary` + `button.secondary.pressed`;
Tertiary = `surface.primary` (transparent-ish) + `content.primary` + `button.tertiary.pressed`.

### 4.2 Size → text + padding (OBSERVATION — `styles.xml:6174-6239`)

| Size | textSize | lineHeight | paddingTop/Bottom | paddingStart/End | minHeight |
|------|-----------|-----------|--------------------|------------------|-----------|
| Large   | `textSizeLabelLarge` = 18sp  | `lineHeightLabelLarge` = 24sp | 2x = 16dp | 2x = 16dp | 64dp |
| Medium  | `textSizeLabelDefault` = 16sp | `lineHeightLabelDefault` = 20sp | 2x = 16dp | 2x = 16dp | 64dp |
| Small   | `textSizeLabelSmall` = 14sp  | `lineHeightLabelSmall` = 16sp  | 1x = 8dp  | 2x = 16dp | 64dp |

**INFERENCE** — all three sizes share the 64 dp minHeight (inherited); the size variant
changes **text size and vertical padding**, not height. So a Large button shows 18sp text in
a 64dp shell; a Small button shows 14sp text with 8dp vertical pad in the same 64dp shell.

### 4.3 Shape → cornerRadius (OBSERVATION + INFERENCE)

| Shape | cornerRadius | Notes |
|-------|-------------|-------|
| square | 0dp | `Platform.Button.Base` default (`styles.xml:6138`) |
| pill   | height/2 = 32dp | computed from `app:shape="pill"` |
| circle | height/2 = 32dp + square aspect | `Platform.Button.Base.Circle` (`styles.xml:6142-6150`): pad 12/14dp, borderWidth 0, elevation 0 |

### 4.4 Full matrix (Fastship-mapped values)

| variant × size × shape | height | padV | padH | radius | text | bg role | text role |
|------------------------|--------|------|------|--------|------|---------|-----------|
| primary / large / pill   | 64 | 16 | 16 | 32 | 18/24 | brand.background.bold | content.onColor |
| primary / medium / pill  | 64 | 16 | 16 | 32 | 16/20 | brand.background.bold | content.onColor |
| primary / small / pill   | 64 | 8  | 16 | 32 | 14/16 | brand.background.bold | content.onColor |
| secondary / large / pill | 64 | 16 | 16 | 32 | 18/24 | surface.secondary | content.primary |
| secondary / medium / pill| 64 | 16 | 16 | 32 | 16/20 | surface.secondary | content.primary |
| secondary / small / pill | 64 | 8  | 16 | 32 | 14/16 | surface.secondary | content.primary |
| tertiary / large / pill  | 64 | 16 | 16 | 32 | 18/24 | surface.primary | content.primary |
| tertiary / medium / pill | 64 | 16 | 16 | 32 | 16/20 | surface.primary | content.primary |
| tertiary / small / pill  | 64 | 8  | 16 | 32 | 14/16 | surface.primary | content.primary |
| any / any / square       | 64 | as above | 16 | 0  | as above | as above | as above |
| any / any / circle       | 64 | 12 | 14 | 32 | as above | as above | as above |

Fastship's current `Button` (`src/ui.tsx:237-264`) uses `minHeight: size.control (46)` /
`buttonSmall 44`, `borderRadius: control/2`, `fontSize 15` (small 13), `fontWeight 700`.
The spec **does not change** the live `Button`; it adds `tokens.button` for new
platform-parity components (e.g. a future 64dp primary CTA) without touching the compact
existing one.

---

## 5. LIST-ROW ANATOMY — `list_item_platform_content_v4.xml`

**OBSERVATION** — root is a `merge` of ConstraintLayout children
(`layout\list_item_platform_content_v4.xml:1-389`).

### 5.1 Geometry

- Row min height: `min_height_spacer.minHeight = ui__list_item_min_height_standard_v2 = 64dp`
  (`list_item…:19`).
- Row horizontal inset (start/end): `list_start_margin` / `list_end_margin` =
  `ui__spacing_unit_1x = 8dp` (`list_item…:7, 25`).
- Vertical text padding: `text_margin_top` / `text_margin_bottom` guidelines offset by
  `ui__list_item_vertical_padding_standard = 12dp` (`list_item…:129, 135`).
- Leading image container: `minWidth = ui__list_item_image_bounds_v2 = 48dp`,
  `paddingHorizontal = ui__list_item_base_image_margin_v2 = 8dp` (`list_item…:160-162`).
  Inside: circular image `= ui__list_item_circular_image_bounds = 36dp` (`list_item…:171-172`)
  or a free-size square image (`scaleType=centerInside`).
- Gap between leading object and text: `start_objects_space = ui__spacing_unit_1x = 8dp`
  (`list_item…:12`).
- Trailing image container: same 48dp minWidth + 8dp padH (`list_item…:200, 229`).

### 5.2 Text slots

| Slot | style | textColor | layout | notes |
|------|-------|-----------|--------|------|
| `start_text` (leading label) | `Platform.TextStyle.LabelSmall` (14/16, 500) | `?attr/contentSecondary` | wrap, padStart/End 1x | `list_item…:290-304` |
| `title_text` | `Platform.TextStyle.LabelDefault` (16/20, 500) | `?attr/contentPrimary` | 0dp×wrap, marginEnd 1x, chain packed | `list_item…:305-320` |
| `subtitle_text` | `Platform.TextStyle.ParagraphSmall` (14/18, 400) | `?attr/contentSecondary` | 0dp×wrap, marginEnd 1x, goneMarginTop 0 | `list_item…:321-337` |
| `third_label_text` | `Platform.TextStyle.ParagraphSmall` (14/18) | `?attr/contentSecondary` | marginTop `0.25x = 2dp` | `list_item…:338-355` |
| `primary_end_text` | `Platform.TextStyle.LabelDefault` (16/20) | `?attr/contentPrimary` | singleLine, padStart 1x | `list_item…:356-371` |
| `secondary_end_text` | `Platform.TextStyle.ParagraphSmall` (14/18) | `?attr/contentSecondary` | singleLine, padStart 1x | `list_item…:372-387` |

### 5.3 Action slots

- `action_button`: `BaseMaterialButton`, `buttonType="secondary"`, `shape="pill"`,
  `size="small"`, `style=Platform.Button.BaseDynamic`, marginStart/End `1x = 8dp`
  (`list_item…:274-289`).
- `action_check` / `action_radio` / `leading_radio` / `leading_checkbox`: `scaleX/Y = 1.25`,
  marginStart/End `1x = 8dp` (`list_item…:79-80, 144-145, 147-148`).
- `two_icon_button`: marginStart `1.5x = 12dp`, marginEnd `ui__list_item_secondary_button_padding = 14dp`
  (`list_item…:67-68`).
- `progress_step_view` included (`list_item…:388`).

### 5.4 Divider usage

**OBSERVATION** — **no divider element** exists inside `list_item_platform_content_v4.xml`.
**INFERENCE** — dividers are external: the parent container (e.g. a list group) draws
`dividerHorizontal` between rows. This matches Fastship's `ListGroup`
(`src/ui.tsx:418-423`), which already adds `groupDivider` between children — the same
pattern. Fastship's `listRow` (`src/ui.tsx:570`) uses `minHeight: size.row (52)`, gap 12,
padH 14, padV 6, with a 32dp icon tile; the platform row is taller (64dp) with a 48dp image
tile — both are valid; the spec records the platform geometry as an option.

---

## 6. BOTTOM-SHEET GEOMETRY

**OBSERVATION** — `dimens.xml:140-144, 222-224, 495`:

| Property | Value | Source |
|----------|-------|--------|
| Top corner radius | `bottom_sheet_corner_radius = ui__spacing_unit_2x = 16dp` | `dimens.xml:140` |
| Normal elevation | `bottom_sheet_normal_elevation = ui__spacing_unit_3x = 24dp` | `dimens.xml:144` |
| High elevation | `bottom_sheet_high_elevation = ui__spacing_unit_4x = 32dp` | `dimens.xml:143` |
| Material default elevation | `design_bottom_sheet_elevation = 8dp` | `dimens.xml:222` |
| Material modal elevation | `design_bottom_sheet_modal_elevation = 16dp` | `dimens.xml:223` |
| Min peek height | `design_bottom_sheet_peek_height_min = 64dp` | `dimens.xml:224` |
| Drag-handle bottom padding (M3) | `m3_bottom_sheet_drag_handle_bottom_padding = 20dp` | `dimens.xml:495` |
| Header divider height | `bottom_sheet_header_divider_height = 2dp` | `dimens.xml:142` |
| Footer divider height | `bottom_sheet_footer_divider_height = ui__divider_width = 1dp` | `dimens.xml:141, 3151` |

**Grabber bar** — **OBSERVED** (corrected after independent verification; the earlier
"UNKNOWN" searched the wrong name pattern): the generic family `ub__grabber_bar_*` exists in
`values\dimens.xml:2139-2143` — `ub__grabber_bar_width = 52dp`, `ub__grabber_bar_width_v2 = 48dp`,
`ub__grabber_bar_height = 4dp`, `ub__grabber_bar_corner_radius = 2dp`,
`ub__grabber_bar_spacing = 10dp`. The trip-tracking sheet uses the dedicated
`ub__track_status_grabber_bar_*` family (`dimens.xml:2984-2986`) = **48 × 4dp** @ 100dp
(fully-rounded) radius. So the grabber is **48–52 dp wide × 4 dp tall**, NOT the M3-default
32dp. Fastship should pin **48 × 4 dp** (matching the trip sheet) with the 20dp bottom padding.

**Scrim** — `backgroundScrim` role exists (`attrs.xml`, `styles.xml:9304/9394`).
**UNKNOWN** exact opacity (per scope, brand hex not extracted). INFERENCE from typical
`_scrim` resources: a dark overlay in the 50-70% alpha range. Fastship records an explicit
target (`rgba(ink, 0.5)` light / `0.6` dark) in §1.3 / §7.

---

## 7. Fastship theme-token spec (drop-in, extends `palette` / `size`)

Concrete values for the Fastship token object. It **imports** the existing `palette` and
`size` from `src/ui.tsx` and **adds** a `theme` namespace — the existing exports
(`palette`, `size`, `shadow`, `textVariants`, `Button`, `ListRow`, …) are untouched, so
nothing breaks. Two new files: `src/design-tokens.ts` (the object) consumed optionally.

The object mirrors Uber's two-tier structure (§1): **primitive roles** (`theme.light` /
`theme.dark` color-role maps) + **scales** (`space`, `radius`, `elevation`, `type`,
`control`, `button`, `listRow`, `bottomSheet`). All numbers come from §2-§6; all colors
reference Fastship's `palette` (or rgba mixes of it) — no Uber hex is copied.

See `src/design-tokens.ts` for the ready-to-import implementation. Summary of what it
exposes:

- `theme.light` / `theme.dark` — color-role maps keyed by Fastship role names from §1.3
  (`surface.*`, `content.*`, `border.*`, `divider.*`, `icon.*`, `brand.*`, `state.*`,
  `button.*.pressed`, `intent.*`). A `resolveTheme(mode)` helper returns the active map.
- `space` — the 8dp-grid scale (`space['2x'] = 16`, etc.) from §3.1, with the existing
  `size.gutter` aliased to `space['2x']`.
- `radius` — `{ sharp: 0, small: 2, default: 4, medium: 8, large: 12, xlarge: 16, pill: (h)=>h/2 }`
  from §3.3; `size.radius` stays = `radius.xlarge`.
- `elevation` — `{ low: 4, medium: 8, high: 16, toolbar: 3, switch: 1, subMenu: 9, bottomSheet: { normal: 24, high: 32 } }`
  from §3.2.
- `type` — the full scale from §2.1 as `{ family, size, lineHeight, weight, letterSpacing }`
  per role, with Fastship's existing `textVariants` (`src/ui.tsx:167-175`) re-expressed as
  the `body`/`title`/`label`/`caption` subset so the live `Txt` component can opt in without
  changing call sites.
- `control` — `{ header: 96, button: 64, buttonSmall: 64, rowStandard: 64, rowSingleLine: 64,
  rowTwoLine: 84, rowCompact: 48, rowSingleLineCompact: 44, imageTile: 48, imageCircular: 36,
  listHeader: 48, peekMin: 64 }` from §3.4 / §5. Live `size.control/small/row` are preserved.
- `button` — the §4.4 matrix as `button[variant][size] = { minHeight, padV, padH, radius, text }`
  with colors resolved through `theme.*` roles.
- `listRow` — the §5 anatomy: `{ minHeight: 64, inset: 8, padV: 12, imageTile: 48, imageCircular: 36, imagePad: 8, slotGap: 8, title: 'LabelDefault', subtitle: 'ParagraphSmall', divider: 'external' }`.
- `bottomSheet` — `{ radius: 16, elevation: { normal: 24, high: 32 }, peekMin: 64, dragHandleBottomPad: 20, grabber: { width: 48, height: 4, radius: 2 }, headerDivider: 2, footerDivider: 1, scrim: 'theme.surface.scrim' }` from §6 (grabber corrected to the observed trip-sheet family in §6; Fastship adoption remains a design choice).
