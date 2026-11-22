// Wind design system v2 — the tokens of the published "Wind" design system, as code.
// One app, three service lines (ride, send, shop), one journey with five states, Day and Night themes.
// Screens read the active theme through useTheme() (./theme-context); `palette` in ./ui is the Day palette, kept for code
// outside React (the logo, icons) and as the Day alias while screens move over.
// Values are exact copies of the design system's tokens.json; change both together.

import type { OrderStatus, Service } from './model';

export type ThemeName = 'day' | 'night';

const brand = { forest: '#12342A', lime: '#D3F27A', clay: '#CB6845' } as const;

export const colors = {
  day: {
    ...brand,
    ground: '#F3F2EC', surface: '#FFFFFF', surfaceSunken: '#EAE8DF', surfaceHover: '#F6F5F0',
    inverse: '#0E1F19', onInverse: '#F3F2EC',
    ink: '#0E1F19', inkSecondary: '#56635C', inkFaint: '#66716B',
    line: '#E2E1D8', hairline: '#ECEBE4', lineStrong: '#7D867F', cardEdge: 'rgba(14,31,25,0)', focus: '#1D5FA8',
    action: brand.forest, onAction: '#FFFFFF', actionAccent: brand.lime, actionPressed: '#0B2A20',
    actionSoft: '#E2EEE5', onActionSoft: '#24543F', accent: brand.lime, onAccent: brand.forest,
    danger: '#C2412D', dangerTint: '#F8E6E2', // error text, 3:1 apart from ink in lightness; palette.error stays for v1 screens
    route: brand.forest, routeCasing: '#FFFFFF', routeAlt: '#78827C', markerMe: '#1D5FA8',
  },
  night: {
    ...brand,
    ground: '#0C1713', surface: '#121F1A', surfaceSunken: '#1B2B25', surfaceHover: '#18271F',
    inverse: '#EEF1EA', onInverse: '#0E1F19',
    ink: '#EEF1EA', inkSecondary: '#AAB6AF', inkFaint: '#8D9A93',
    line: '#2A3B35', hairline: '#22332D', lineStrong: '#6E7C75', cardEdge: '#22332D', focus: '#8EC1FF',
    action: brand.lime, onAction: '#0E1F19', actionAccent: brand.forest, actionPressed: '#BFE05F',
    actionSoft: '#1D3A2E', onActionSoft: '#CFE9A0', accent: brand.lime, onAccent: brand.forest,
    danger: '#DC6450', dangerTint: '#2E1814',
    route: brand.lime, routeCasing: '#0C1713', routeAlt: '#6A7A73', markerMe: '#8EC1FF',
  },
} as const;
export type Colors = { [K in keyof typeof colors.day]: string };

// ---------- service lines (SRS ONE-12: an accent on the icon and badge only, never on primary actions) ----------
export type Line = 'ride' | 'send' | 'shop';
export const lineOf: Record<Service, Line> = { ride: 'ride', parcel: 'send', freight: 'send', shop: 'shop' };
export const lines: Record<ThemeName, Record<Line, { color: string; tint: string }>> = {
  day: { ride: { color: '#2F5E8C', tint: '#E6EDF6' }, send: { color: '#34765A', tint: '#E2EEE5' }, shop: { color: '#8A3D6A', tint: '#F5E6EE' } },
  night: { ride: { color: '#8DB8E6', tint: '#19283A' }, send: { color: '#7FC79F', tint: '#16302A' }, shop: { color: '#E3A3CB', tint: '#331E2B' } },
};

// ---------- journey states: every order status is one of five, told apart by a word and an icon, never colour alone ----------
export type JourneyState = 'wait' | 'live' | 'attention' | 'problem' | 'done';
export const journeyState: Record<OrderStatus, JourneyState> = {
  requested: 'wait', searching: 'wait',
  assigned: 'live', at_pickup: 'live', in_transit: 'live',
  on_hold: 'attention', returning: 'attention',
  cancelled: 'problem',
  completed: 'done', returned: 'done',
};
/** bg/fg: the badge. edge: an outline when the fill is the surface. mark: the state's colour on a plain surface (dots, the ETA figure). */
export interface StateLook { bg: string; fg: string; edge?: string; mark: string }
export const stateLook: Record<ThemeName, Record<JourneyState, StateLook>> = {
  day: {
    wait: { bg: '#FFFFFF', fg: '#56635C', edge: '#7D867F', mark: '#56635C' },
    live: { bg: brand.forest, fg: brand.lime, mark: brand.forest },
    attention: { bg: '#FBF0D9', fg: '#8A5A00', mark: '#8A5A00' },
    problem: { bg: '#A3392A', fg: '#FFFFFF', mark: '#A3392A' },
    done: { bg: '#EAE8DF', fg: '#56635C', mark: '#56635C' },
  },
  night: {
    wait: { bg: '#121F1A', fg: '#AAB6AF', edge: '#6E7C75', mark: '#AAB6AF' },
    live: { bg: brand.lime, fg: brand.forest, mark: brand.lime },
    attention: { bg: '#3A2E0E', fg: '#F5CF6B', mark: '#F5CF6B' },
    problem: { bg: '#9E2F21', fg: '#FFFFFF', mark: '#DC6450' },
    done: { bg: '#1B2B25', fg: '#AAB6AF', mark: '#AAB6AF' },
  },
};

// ---------- the v1 palette, in Day and Night ----------
// Screens name colours by these v1 keys (`palette.olive`); useTheme() hands them the active theme's values. Night keeps every
// key's job: `forest` is the action (lime at night, like `colors.night.action`), `lime` is what sits on it, the accents
// (olive, blue, warn, error, shop, clayInk) turn light so they read as text on the dark surfaces, and `onFill`, the text on
// those accents used as fills, turns dark. Every text pair here is checked for WCAG AA in tests/design-theme.test.mjs.
export const palettes = {
  day: {
    paper: '#F3F2EC',
    card: '#FFFFFF',
    ink: '#0E1F19',
    secondary: '#56635C',
    faint: '#66716B', // 4.5:1 on paper and white: the lightest grey allowed for text (same as Souq's ink-faint)
    olive: '#34765A',
    olivePale: '#E2EEE5',
    forest: '#12342A', // lead surfaces: primary button, search pill, selected chip
    lime: '#D3F27A', // only ever on forest
    clay: '#CB6845', // logo pin and markers; too light for text
    clayInk: '#A94A28',
    clayPale: '#F9E9E1',
    blue: '#2F5E8C',
    bluePale: '#E6EDF6',
    shop: '#8A3D6A', // Shop line accent (design system v2): icon and badge only, never a state or an action
    shopPale: '#F5E6EE',
    line: '#E2E1D8', // dividers only: 1.2:1, too faint to mark a control's edge
    field: '#7D867F', // control edges (inputs, outline buttons, chips, unselected choices): 3.3:1 on paper, 3.8:1 on white (WCAG 1.4.11)
    hair: '#ECEBE4',
    mapWash: '#E6ECE3', // map placeholder and failure ground, before tiles draw
    dash: '#B4B3A8', // non-text marks on paper, muted or white (1.7–2.1:1): disabled button edge, sheet grip
    muted: '#EAE8DF',
    error: '#A3392A',
    onFill: '#FFFFFF', // text and icons on forest, olive, blue, warn and clayInk fills
    errorPale: '#F8E6E2',
    warn: '#8A5A00', // waiting/pending text: ochre, apart from brand clay and from error red (5.3:1 on paper)
    warnPale: '#FBF0D9',
    shade: '#0E1F1966', // modal scrim over full-screen sheets
  },
  night: {
    paper: colors.night.ground,
    card: colors.night.surface,
    ink: colors.night.ink,
    secondary: colors.night.inkSecondary,
    faint: colors.night.inkFaint,
    olive: lines.night.send.color,
    olivePale: lines.night.send.tint,
    forest: colors.night.action, // lime: the Night action colour
    lime: colors.night.actionAccent, // forest, on the lime action
    clay: brand.clay,
    clayInk: '#EBA07F',
    clayPale: '#33201A',
    blue: lines.night.ride.color,
    bluePale: lines.night.ride.tint,
    shop: lines.night.shop.color,
    shopPale: lines.night.shop.tint,
    line: colors.night.line,
    field: colors.night.lineStrong,
    hair: colors.night.hairline,
    mapWash: '#16231E',
    dash: '#3E4F48',
    muted: colors.night.surfaceSunken,
    error: '#E67A66', // 5:1 on the sunken surface too; colors.night.danger is for error text on the plain surface
    onFill: colors.night.onAction,
    errorPale: colors.night.dangerTint,
    warn: stateLook.night.attention.mark,
    warnPale: stateLook.night.attention.bg,
    shade: '#000000A6',
  },
} as const;
export type Palette = { [K in keyof typeof palettes.day]: string };

// Cards lift with a soft shadow by day; a shadow is invisible on the Night ground, so there a 1 px edge (a spread shadow, which
// takes no layout room) carries the card instead.
export const shadows = {
  day: { card: '0px 1px 2px rgba(14,31,25,0.06), 0px 4px 14px rgba(14,31,25,0.06)', sheet: '0px -2px 16px rgba(14,31,25,0.16)' },
  night: { card: `0px 0px 0px 1px ${colors.night.cardEdge}`, sheet: `0px -1px 0px 0px ${colors.night.line}, 0px -2px 16px rgba(0,0,0,0.5)` },
} as const;

// ---------- scales ----------
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 12: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const sizes = { touchMin: 44, control: 48, controlSm: 40, row: 56, tabbar: 64, sheetPeek: 176, adminRail: 248, contentMax: 640 } as const;

// ---------- Night for captains: after sunset, before sunrise (design system v2) ----------
// The standard sunrise equation; Ramallah by default. Accurate to a few minutes, which is all a map colour needs.
const J2000 = 2451545, DAY_MS = 86_400_000, UNIX_JD = 2440587.5;
/** Sunrise and sunset for the solar day whose noon is nearest `ms` (not always the local calendar day near midnight;
 *  afterDark() is right either way, since both sides of midnight are night). */
export function sunTimes(ms: number, latitude = 31.9, longitude = 35.2): { sunrise: number; sunset: number } {
  const rad = Math.PI / 180;
  const n = Math.round(ms / DAY_MS + UNIX_JD - J2000 - 0.0009 + longitude / 360); // the solar day containing ms (east longitude positive)
  const jStar = n + 0.0009 - longitude / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = J2000 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const sinDecl = Math.sin(lambda * rad) * Math.sin(23.4397 * rad), cosDecl = Math.cos(Math.asin(sinDecl));
  const cosHour = (Math.sin(-0.833 * rad) - Math.sin(latitude * rad) * sinDecl) / (Math.cos(latitude * rad) * cosDecl);
  const half = Math.acos(Math.max(-1, Math.min(1, cosHour))) / rad / 360;
  const toMs = (jd: number) => Math.round((jd - UNIX_JD) * DAY_MS);
  return { sunrise: toMs(transit - half), sunset: toMs(transit + half) };
}
export const afterDark = (ms: number, latitude?: number, longitude?: number) => {
  const { sunrise, sunset } = sunTimes(ms, latitude, longitude);
  return ms < sunrise || ms > sunset;
};

// ---------- which theme: Day by default, a saved choice per device, Night after sunset for captains on Automatic ----------
export type ThemeChoice = 'auto' | 'day' | 'night';
export const themeChoices: readonly ThemeChoice[] = ['auto', 'day', 'night'];
/** The theme a choice resolves to: Automatic is Night only for a captain after sunset. */
export const resolveTheme = (choice: ThemeChoice, captain: boolean, dark: boolean): ThemeName =>
  choice === 'auto' ? (captain && dark ? 'night' : 'day') : choice;
