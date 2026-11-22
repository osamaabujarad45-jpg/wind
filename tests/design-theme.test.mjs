// Design system v2 (src/theme.ts): every order status is one of five journey states, every badge and text pair is readable
// in Day and Night, and a service line's accent is never a state colour.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterDark, colors, journeyState, lineOf, lines, palettes, resolveTheme, sizes, stateLook, sunTimes, themeChoices } from '../src/theme.ts';

const lum = hex => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const atLeast = (fg, bg, min, what) => assert.ok(ratio(fg, bg) >= min, `${what}: ${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1, needs ${min}:1`);

// every status in the model maps to a state (a new status must pick one)
const model = readFileSync(new URL('../src/model.ts', import.meta.url), 'utf8');
const statuses = [...model.match(/export type OrderStatus = ([^;]+);/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
assert.ok(statuses.length >= 10);
assert.deepEqual(Object.keys(journeyState).sort(), [...statuses].sort());
assert.deepEqual(new Set(Object.values(journeyState)), new Set(['wait', 'live', 'attention', 'problem', 'done']));

// every service maps to one of three lines; parcel and freight are both Send
const services = [...model.match(/export type Service = ([^;]+);/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
assert.deepEqual(Object.keys(lineOf).sort(), [...services].sort());
assert.equal(lineOf.parcel, 'send');
assert.equal(lineOf.freight, 'send');

for (const theme of ['day', 'night']) {
  const c = colors[theme];
  for (const [state, look] of Object.entries(stateLook[theme])) {
    atLeast(look.fg, look.bg, 4.5, `${theme} ${state} badge`);
    atLeast(look.mark, c.surface, 3, `${theme} ${state} mark on surface`);
    if (look.edge) atLeast(look.edge, c.surface, 3, `${theme} ${state} edge`);
  }
  for (const text of ['ink', 'inkSecondary', 'inkFaint']) for (const ground of ['ground', 'surface']) atLeast(c[text], c[ground], 4.5, `${theme} ${text} on ${ground}`);
  atLeast(c.inkSecondary, c.surfaceSunken, 4.5, `${theme} inkSecondary on surfaceSunken`);
  atLeast(c.onAction, c.action, 4.5, `${theme} onAction on action`);
  atLeast(c.actionAccent, c.action, 4.5, `${theme} actionAccent on action`);
  atLeast(c.onActionSoft, c.actionSoft, 4.5, `${theme} onActionSoft on actionSoft`);
  atLeast(c.danger, c.surface, 4.5, `${theme} danger on surface`);
  for (const ground of ['ground', 'surface', 'surfaceSunken']) atLeast(c.focus, c[ground], 3, `${theme} focus on ${ground}`);
  for (const ground of ['ground', 'surface']) atLeast(c.lineStrong, c[ground], 3, `${theme} lineStrong on ${ground}`);
  for (const [line, { color, tint }] of Object.entries(lines[theme])) {
    atLeast(color, tint, 4.5, `${theme} ${line} on its tint`);
    atLeast(color, c.surface, 4.5, `${theme} ${line} on surface`);
    // a line accent is never a state colour (SRS ONE-12; design system v2)
    for (const look of Object.values(stateLook[theme])) assert.notEqual(color.toLowerCase(), look.bg.toLowerCase(), `${theme} ${line} reuses a state fill`);
  }
  // problem and live fills differ in more than hue: the problem badge carries white text, live carries lime or forest
  assert.notEqual(stateLook[theme].problem.fg, stateLook[theme].live.fg);
}

// clay is the brand pin and the destination only: no state uses it
for (const theme of ['day', 'night']) for (const look of Object.values(stateLook[theme])) for (const v of [look.bg, look.fg, look.mark]) assert.notEqual(v.toUpperCase(), '#CB6845');

// v1 palette keys (palettes in src/theme.ts; ui.tsx `palette` is the Day alias) and v2 roles must not drift apart
const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
assert.match(ui, /export const palette = palettes\.day;/, 'ui.tsx palette is the Day palette, not a second copy');
const pal = palettes.day;
const same = (a, b, what) => assert.equal(a.toUpperCase(), b.toUpperCase(), what + ' drifted between the palette and the v2 roles');
same(pal.blue, lines.day.ride.color, 'ride line'); same(pal.bluePale, lines.day.ride.tint, 'ride tint');
same(pal.olive, lines.day.send.color, 'send line'); same(pal.olivePale, lines.day.send.tint, 'send tint');
same(pal.shop, lines.day.shop.color, 'shop line'); same(pal.shopPale, lines.day.shop.tint, 'shop tint');
same(pal.warn, stateLook.day.attention.fg, 'attention'); same(pal.warnPale, stateLook.day.attention.bg, 'attention fill');
same(pal.error, stateLook.day.problem.bg, 'problem'); same(pal.muted, stateLook.day.done.bg, 'done');
same(pal.field, stateLook.day.wait.edge, 'wait edge'); same(pal.field, colors.day.lineStrong, 'control edge');
same(pal.forest, colors.day.forest, 'forest'); same(pal.lime, colors.day.lime, 'lime'); same(pal.clay, colors.day.clay, 'clay');
assert.match(ui, new RegExp(`rail: \\{ width: ${sizes.adminRail} `), 'the admin rail width is the admin-rail token');
same(pal.paper, colors.day.ground, 'ground'); same(pal.ink, colors.day.ink, 'ink'); same(pal.secondary, colors.day.inkSecondary, 'ink secondary');
// Night keeps every key, and its roles are the Night tokens: the action is lime with forest on it, the lines are the Night lines
assert.deepEqual(Object.keys(palettes.night), Object.keys(palettes.day));
const nightPal = palettes.night;
same(nightPal.forest, colors.night.action, 'Night action'); same(nightPal.lime, colors.night.actionAccent, 'Night on-action accent');
same(nightPal.onFill, colors.night.onAction, 'Night text on fills'); same(nightPal.paper, colors.night.ground, 'Night ground');
same(nightPal.card, colors.night.surface, 'Night surface'); same(nightPal.muted, colors.night.surfaceSunken, 'Night sunken');
same(nightPal.blue, lines.night.ride.color, 'Night ride'); same(nightPal.olive, lines.night.send.color, 'Night send'); same(nightPal.shop, lines.night.shop.color, 'Night shop');
same(nightPal.warn, stateLook.night.attention.mark, 'Night attention'); same(nightPal.field, colors.night.lineStrong, 'Night control edge');
same(nightPal.clay, colors.night.clay, 'clay is the brand in both themes');

// WCAG AA for every text and background pair the screens draw from the palette, in Day and in Night (design system v2)
for (const theme of ['day', 'night']) {
  const p = palettes[theme], c = colors[theme];
  const text = (fg, bg, min = 4.5) => atLeast(p[fg], p[bg], min, `${theme} palette.${fg} on palette.${bg}`);
  for (const ground of ['paper', 'card', 'muted']) for (const fg of ['ink', 'secondary']) text(fg, ground); // body text; secondary on muted is the disabled button
  for (const ground of ['paper', 'card']) text('faint', ground); // faint is never set on muted (4.1:1 by day)
  for (const ground of ['paper', 'card']) for (const fg of ['olive', 'blue', 'warn', 'error', 'shop', 'clayInk', 'forest']) text(fg, ground);
  text('error', 'muted');
  for (const [fg, bg] of [['olive', 'olivePale'], ['blue', 'bluePale'], ['warn', 'warnPale'], ['error', 'errorPale'], ['shop', 'shopPale'], ['clayInk', 'clayPale']]) text(fg, bg);
  for (const tint of ['olivePale', 'warnPale', 'errorPale', 'bluePale']) { text('ink', tint); text('secondary', tint); } // tinted cards hold body text
  for (const fill of ['forest', 'olive', 'blue', 'error', 'warn', 'clayInk', 'ink']) text('onFill', fill); // buttons, counts, selected chips
  text('lime', 'forest'); // the accent on the action: trailing price, tab glyph, send arrow
  atLeast(c.onActionSoft, p.olivePale, 4.5, `${theme} current rail item on action-soft`);
  for (const ground of ['paper', 'card', 'muted']) text('field', ground, 3); // control edges (WCAG 1.4.11)
  text('forest', 'card', 3); // focus ring and selected outline
}

// which theme: Day by default; Automatic is Night only for a captain after sunset; a saved Day or Night always wins
assert.deepEqual([...themeChoices], ['auto', 'day', 'night']);
assert.equal(resolveTheme('auto', false, true), 'day', 'customers stay Day on Automatic');
assert.equal(resolveTheme('auto', true, false), 'day', 'captains are Day before sunset');
assert.equal(resolveTheme('auto', true, true), 'night', 'captains go Night after sunset');
assert.equal(resolveTheme('day', true, true), 'day');
assert.equal(resolveTheme('night', false, false), 'night');

// Screens moved to the theme read colours from useTheme(), never the fixed Day palette from ui.tsx, and never decide Night themselves
const themed = ['app/_layout.tsx', 'app/driver/earnings.tsx', 'app/driver/index.tsx', 'app/driver/trips.tsx', 'app/help.tsx', 'app/order/[id].tsx',
  'app/profile.tsx', 'app/receipt/[id].tsx', 'app/roads.tsx', 'custody.tsx', 'driver-presence-card.tsx', 'driver-support-card.tsx', 'freight-details.tsx',
  'google-map.native.tsx', 'google-map.web.tsx', 'map-provider-boundary.tsx', 'map-sheet.tsx', 'parts.tsx', 'phone-card.tsx', 'pin-sheet.tsx', 'road.tsx',
  'route-map.native.tsx', 'route-preview.tsx', 'scene-map.tsx', 'shop-ui.tsx', 'driver-map.tsx'];
for (const rel of themed) {
  const source = readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
  const fromUi = source.match(/import \{([^}]*)\} from '(?:\.\.?\/)+ui';/s)?.[1] ?? '';
  for (const fixed of ['palette', 'tones', 'statusTone', 'shadow', 'sheetShadow']) assert.ok(!new RegExp(`\\b${fixed}\\b`).test(fromUi), `${rel} imports the fixed Day ${fixed} from ui.tsx: read useTheme()`);
  assert.doesNotMatch(source, /\bafterDark\(/, `${rel} decides Night itself: the theme context does`);
}

// map page: Night is opt-in by the exact string, and its route uses the Night action colour (lime on the dark map)
const mapPage = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
assert.match(mapPage, /const NIGHT = config\.theme === 'night';/);
const nightMap = mapPage.match(/const M = NIGHT\s*\?\s*\{([^}]+)\}/)[1];
assert.match(nightMap, new RegExp(`route: '${colors.night.route}'`, 'i'));
assert.match(nightMap, new RegExp(`routeCasing: '${colors.night.routeCasing}'`, 'i'));
assert.match(mapPage, /paint: \{ 'line-color': M\.route, 'line-width': 4\.5 \}/, 'the route reads the theme, not a fixed colour');

// captains' Night follows the real sun in Ramallah (published times, within 5 minutes)
const near = (ms, iso, what) => assert.ok(Math.abs(ms - Date.parse(iso)) <= 5 * 60_000, `${what}: ${new Date(ms).toISOString()} vs ${iso}`);
const june = sunTimes(Date.parse('2026-06-21T12:00:00Z')), december = sunTimes(Date.parse('2026-12-21T12:00:00Z'));
near(june.sunrise, '2026-06-21T02:33:00Z', 'June sunrise'); near(june.sunset, '2026-06-21T16:48:00Z', 'June sunset');
near(december.sunrise, '2026-12-21T04:35:00Z', 'December sunrise'); near(december.sunset, '2026-12-21T14:40:00Z', 'December sunset');
assert.equal(afterDark(Date.parse('2026-11-22T11:00:00Z')), false, '13:00 in November is day');
assert.equal(afterDark(Date.parse('2026-11-22T16:00:00Z')), true, '18:00 in November is night');
assert.equal(afterDark(Date.parse('2026-06-21T16:00:00Z')), false, '19:00 in June is still day');

console.log('design-theme ok');
