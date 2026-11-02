// Fastship design-token layer — extracted roles & geometry from a read-only study of
// Uber Rider-Android resources (see docs/competitive-architecture-uber-tokens.md).
//
// This module EXTENDS src/ui.tsx: it imports the existing `palette` and `size` and adds a
// `theme` namespace (color roles + scales). It does NOT modify `palette`, `size`,
// `textVariants`, `shadow`, or any component — so every existing call site is unchanged.
// Opt in by reading `theme`, `space`, `radius`, etc. New components can be built against
// these tokens; old ones keep working as before.
//
// All colors come from Fastship's `palette` (no third-party brand hex is copied). Derived
// shades are expressed as alpha overlays of palette colors via `withAlpha`, never as new
// literals — mirroring the source's primitive/dark-resource swap by lightness only.

import { palette, size } from './ui';

// alpha overlay of a #RRGGBB palette color → rgba() string. Keeps every color sourced from `palette`.
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export type ColorMode = 'light' | 'dark';

// ---------- §1 color roles (primitive) ----------
export interface ColorRoles {
  surface: { primary: string; secondary: string; tertiary: string; inverse: string; disabled: string; scrim: string };
  content: { primary: string; secondary: string; tertiary: string; disabled: string; onColor: string };
  border: { subtle: string; bold: string; accessible: string };
  divider: { horizontal: string };
  icon: { default: string; onColor: string };
  brand: { backgroundBold: string; backgroundSubtle: string; contentOnBold: string; contentPrimary: string };
  state: { hover: string; pressed: string };
  button: { primaryPressed: string; secondaryPressed: string; tertiaryPressed: string };
  intent: {
    error: { bgSubtle: string; content: string };
    success: { bgSubtle: string; content: string };
    warning: { bgSubtle: string; content: string };
  };
}

// Light: dark text on a paper ground. Dark: paper text on an ink/forest ground (lightness inversion, §1.2).
export const theme: Record<ColorMode, ColorRoles> = {
  light: {
    surface: { primary: palette.paper, secondary: palette.card, tertiary: palette.muted,
      inverse: palette.ink, disabled: palette.muted, scrim: withAlpha(palette.ink, 0.5) },
    content: { primary: palette.ink, secondary: palette.secondary, tertiary: palette.faint,
      disabled: palette.faint, onColor: palette.onFill },
    border: { subtle: palette.hair, bold: palette.line, accessible: palette.olive },
    divider: { horizontal: palette.hair },
    icon: { default: palette.secondary, onColor: palette.lime },
    brand: { backgroundBold: palette.forest, backgroundSubtle: palette.olivePale,
      contentOnBold: palette.lime, contentPrimary: palette.olive },
    state: { hover: withAlpha(palette.ink, 0.04), pressed: withAlpha(palette.ink, 0.08) },
    button: { primaryPressed: '#0D2A20', secondaryPressed: withAlpha(palette.ink, 0.08), tertiaryPressed: withAlpha(palette.ink, 0.08) },
    intent: {
      error: { bgSubtle: palette.errorPale, content: palette.error },
      success: { bgSubtle: palette.olivePale, content: palette.olive },
      warning: { bgSubtle: palette.clayPale, content: palette.clayInk },
    },
  },
  dark: {
    surface: { primary: palette.ink, secondary: palette.forest, tertiary: withAlpha(palette.paper, 0.06),
      inverse: palette.paper, disabled: withAlpha(palette.paper, 0.08), scrim: withAlpha(palette.ink, 0.6) },
    content: { primary: palette.paper, secondary: withAlpha(palette.paper, 0.7), tertiary: withAlpha(palette.paper, 0.5),
      disabled: withAlpha(palette.paper, 0.4), onColor: palette.lime }, // lime stays fixed on forest (contentAlwaysLight pattern)
    border: { subtle: withAlpha(palette.paper, 0.08), bold: withAlpha(palette.paper, 0.16), accessible: palette.lime },
    divider: { horizontal: withAlpha(palette.paper, 0.08) },
    icon: { default: withAlpha(palette.paper, 0.7), onColor: palette.lime },
    brand: { backgroundBold: palette.forest, backgroundSubtle: withAlpha(palette.olive, 0.18),
      contentOnBold: palette.lime, contentPrimary: palette.lime },
    state: { hover: withAlpha(palette.paper, 0.08), pressed: withAlpha(palette.paper, 0.12) },
    button: { primaryPressed: '#0A1F17', secondaryPressed: withAlpha(palette.paper, 0.12), tertiaryPressed: withAlpha(palette.paper, 0.12) },
    intent: {
      error: { bgSubtle: withAlpha(palette.error, 0.20), content: withAlpha(palette.error, 0.85) },
      success: { bgSubtle: withAlpha(palette.olive, 0.20), content: withAlpha(palette.olive, 0.85) },
      warning: { bgSubtle: withAlpha(palette.clay, 0.20), content: withAlpha(palette.clay, 0.85) },
    },
  },
};

export const resolveTheme = (mode: ColorMode): ColorRoles => theme[mode];

// ---------- §3.1 spacing — 8dp base grid ----------
// Canonical …x series. `size.gutter` (16) == space['2x'] by design.
export const space = {
  '0x': 0, '0.125x': 1, '0.25x': 2, '0.375x': 3, '0.5x': 4, '0.75x': 6,
  '1x': 8, '1.25x': 10, '1.5x': 12, '1.75x': 14, '2x': 16, '2.25x': 18, '2.5x': 20, '2.75x': 22,
  '3x': 24, '3.5x': 28, '4x': 32, '4.5x': 36, '5x': 40, '5.5x': 44,
  '6x': 48, '6.5x': 52, '7x': 56, '8x': 64, '8.5x': 68, '9x': 72,
  '10x': 80, '11x': 88, '11.25x': 90, '12x': 96, '13x': 104, '14x': 112, '15x': 120, '16x': 128,
} as const;
export type Space = keyof typeof space;

// ---------- §3.3 corner radii ----------
// pill is a function of height (height/2), as in the source `app:shape` enum.
export const radius = {
  sharp: 0, small: 2, default: 4, medium: 8, large: 12, xlarge: 16,
  pill: (h: number) => h / 2,
} as const;

// ---------- §3.2 elevation ----------
export const elevation = {
  low: 4, medium: 8, high: 16, toolbar: 3, switch: 1, subMenu: 9,
  bottomSheet: { normal: 24, high: 32 },
} as const;

// ---------- §2 type scale ----------
// weight: 400 (Book/News→regular), 500 (Medium), 700 (Bold). Fastship's Txt uses 800 for h1/h2;
// the platform-accurate weight is 700 for Bold and 400 for Book/News; we expose both so new
// components can match the source while the existing textVariants stay on 800.
export interface TypeRole { size: number; lineHeight: number; weight: 400 | 500 | 700; letterSpacing?: number; family?: 'text' | 'mono' }
export const type = {
  bodyL:   { size: 16, lineHeight: 20, weight: 400, letterSpacing: -0.0031, family: 'text' } satisfies TypeRole,
  bodyM:   { size: 14, lineHeight: 18, weight: 400, letterSpacing: -0.0036, family: 'text' } satisfies TypeRole,
  bodyS:   { size: 12, lineHeight: 16, weight: 400, letterSpacing: -0.0042, family: 'text' } satisfies TypeRole,
  h1:      { size: 28, lineHeight: 42, weight: 400, family: 'text' } satisfies TypeRole,
  h2:      { size: 24, lineHeight: 40, weight: 400, family: 'text' } satisfies TypeRole,
  h3:      { size: 18, lineHeight: 30, weight: 400, family: 'text' } satisfies TypeRole,
  h4:      { size: 16, lineHeight: 25, weight: 400, family: 'text' } satisfies TypeRole,
  h5:      { size: 14, lineHeight: 22, weight: 400, family: 'text' } satisfies TypeRole,
  h6:      { size: 12, lineHeight: 20, weight: 400, family: 'text' } satisfies TypeRole,
  displayDefault:  { size: 52, lineHeight: 64, weight: 400, family: 'text' } satisfies TypeRole,
  displayLarge:    { size: 28, lineHeight: 42, weight: 400, family: 'text' } satisfies TypeRole, // base 96sp reserved for hero only
  displaySmall:    { size: 44, lineHeight: 52, weight: 400, family: 'text' } satisfies TypeRole,
  displayXSmall:   { size: 36, lineHeight: 44, weight: 400, family: 'text' } satisfies TypeRole,
  giga:      { size: 58, lineHeight: 68, weight: 500, family: 'text' } satisfies TypeRole,
  gigaLarge: { size: 66, lineHeight: 72, weight: 500, family: 'text' } satisfies TypeRole,
  gigaSmall: { size: 52, lineHeight: 64, weight: 500, family: 'text' } satisfies TypeRole,
  mega:       { size: 42, lineHeight: 52, weight: 500, family: 'text' } satisfies TypeRole,
  megaLarge:  { size: 46, lineHeight: 56, weight: 500, family: 'text' } satisfies TypeRole,
  megaSmall:  { size: 36, lineHeight: 48, weight: 500, family: 'text' } satisfies TypeRole,
  headingXXLarge: { size: 40, lineHeight: 48, weight: 700, family: 'text' } satisfies TypeRole,
  headingXLarge:  { size: 36, lineHeight: 44, weight: 700, family: 'text' } satisfies TypeRole,
  headingLarge:   { size: 32, lineHeight: 40, weight: 700, family: 'text' } satisfies TypeRole,
  headingDefault: { size: 28, lineHeight: 36, weight: 700, family: 'text' } satisfies TypeRole,
  headingSmall:   { size: 24, lineHeight: 32, weight: 700, family: 'text' } satisfies TypeRole,
  headingXSmall:  { size: 20, lineHeight: 24, weight: 700, family: 'text' } satisfies TypeRole,
  headlineL: { size: 20, lineHeight: 24, weight: 700, letterSpacing: 0.0125, family: 'text' } satisfies TypeRole,
  headlineM: { size: 18, lineHeight: 22, weight: 700, letterSpacing: 0.0139, family: 'text' } satisfies TypeRole,
  headlineS: { size: 16, lineHeight: 20, weight: 700, letterSpacing: 0.0156, family: 'text' } satisfies TypeRole,
  labelLarge:   { size: 18, lineHeight: 24, weight: 500, family: 'text' } satisfies TypeRole,
  labelDefault: { size: 16, lineHeight: 20, weight: 500, family: 'text' } satisfies TypeRole,
  labelSmall:   { size: 14, lineHeight: 16, weight: 500, family: 'text' } satisfies TypeRole,
  labelXSmall:  { size: 12, lineHeight: 16, weight: 500, family: 'text' } satisfies TypeRole,
  paragraphDefault: { size: 16, lineHeight: 24, weight: 400, family: 'text' } satisfies TypeRole,
  paragraphLarge:   { size: 18, lineHeight: 20, weight: 400, family: 'text' } satisfies TypeRole,
  paragraphSmall:   { size: 14, lineHeight: 18, weight: 400, family: 'text' } satisfies TypeRole,
  paragraphXSmall:  { size: 12, lineHeight: 16, weight: 400, family: 'text' } satisfies TypeRole,
  listHeader: { size: 14, lineHeight: 22, weight: 500, family: 'text' } satisfies TypeRole,
  button:      { size: 16, lineHeight: 25, weight: 500, family: 'text' } satisfies TypeRole,
  buttonSmall: { size: 14, lineHeight: 22, weight: 500, family: 'text' } satisfies TypeRole,
  link:      { size: 16, lineHeight: 25, weight: 500, family: 'text' } satisfies TypeRole,
  linkSmall: { size: 14, lineHeight: 22, weight: 500, family: 'text' } satisfies TypeRole,
  monoDisplayDefault: { size: 52, lineHeight: 64, weight: 500, family: 'mono' } satisfies TypeRole, // fares/ETAs
} as const;
export type TypeRoleName = keyof typeof type;

// ---------- §3.4 control heights ----------
// Live `size` (control 46 / small 36 / row 52 / radius 16 / gutter 16) is preserved; these are
// the platform-parity heights for new components.
export const control = {
  header: 96, button: 64, buttonSmall: 64,
  rowStandard: 64, rowSingleLine: 64, rowTwoLine: 84, rowCompact: 48, rowSingleLineCompact: 44, rowTwoLineCompact: 50,
  imageTile: 48, imageCircular: 36, listHeader: 48, peekMin: 64,
} as const;

// ---------- §4 button matrix ----------
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';
export type ButtonSize = 'large' | 'medium' | 'small';
export type ButtonShape = 'pill' | 'circle' | 'square';
export interface ButtonSpec { minHeight: number; padV: number; padH: number; radiusFor: (h: number) => number; textSize: number; lineHeight: number; weight: 500 }

const sizeSpec: Record<ButtonSize, Omit<ButtonSpec, 'radiusFor'>> = {
  large:  { minHeight: 64, padV: 16, padH: 16, textSize: 18, lineHeight: 24, weight: 500 },
  medium: { minHeight: 64, padV: 16, padH: 16, textSize: 16, lineHeight: 20, weight: 500 },
  small:  { minHeight: 64, padV: 8,  padH: 16, textSize: 14, lineHeight: 16, weight: 500 },
};
const shapeRadius: Record<ButtonShape, (h: number) => number> = {
  pill: (h) => h / 2,
  circle: (h) => h / 2,
  square: () => 0,
};

export const button: Record<ButtonVariant, Record<ButtonSize, ButtonSpec>> = {
  primary: {
    large:  { ...sizeSpec.large,  radiusFor: shapeRadius.pill },
    medium: { ...sizeSpec.medium, radiusFor: shapeRadius.pill },
    small:  { ...sizeSpec.small,  radiusFor: shapeRadius.pill },
  },
  secondary: {
    large:  { ...sizeSpec.large,  radiusFor: shapeRadius.pill },
    medium: { ...sizeSpec.medium, radiusFor: shapeRadius.pill },
    small:  { ...sizeSpec.small,  radiusFor: shapeRadius.pill },
  },
  tertiary: {
    large:  { ...sizeSpec.large,  radiusFor: shapeRadius.pill },
    medium: { ...sizeSpec.medium, radiusFor: shapeRadius.pill },
    small:  { ...sizeSpec.small,  radiusFor: shapeRadius.pill },
  },
};
// resolve a button's colors through the active theme (§4.1 → §1.3)
export function buttonColors(variant: ButtonVariant, roles: ColorRoles): { bg: string; text: string; ripple: string } {
  switch (variant) {
    case 'primary':   return { bg: roles.brand.backgroundBold, text: roles.brand.contentOnBold, ripple: roles.button.primaryPressed };
    case 'secondary': return { bg: roles.surface.secondary, text: roles.content.primary, ripple: roles.button.secondaryPressed };
    case 'tertiary':  return { bg: roles.surface.primary, text: roles.content.primary, ripple: roles.button.tertiaryPressed };
  }
}

// ---------- §5 list-row anatomy ----------
export const listRow = {
  minHeight: 64, inset: 8, padV: 12,
  imageTile: 48, imageCircular: 36, imagePad: 8,
  slotGap: 8, secondaryButtonPadEnd: 14,
  title: 'labelDefault' as TypeRoleName,
  subtitle: 'paragraphSmall' as TypeRoleName,
  divider: 'external' as const, // drawn by the parent group, not the row (matches Fastship ListGroup)
} as const;

// ---------- §6 bottom-sheet geometry ----------
export const bottomSheet = {
  radius: 16,
  elevation: { normal: 24, high: 32 },
  peekMin: 64,
  dragHandleBottomPad: 20,
  grabber: { width: 32, height: 4, radius: 2 }, // pinned to M3 default — source grabber token UNKNOWN
  headerDivider: 2, footerDivider: 1,
  scrim: (roles: ColorRoles) => roles.surface.scrim,
} as const;

// Re-export the live scales so callers can import one module.
export { palette, size };
