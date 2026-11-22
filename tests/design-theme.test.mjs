// Design system v2 (src/theme.ts): every order status is one of five journey states, every badge and text pair is readable
// in Day and Night, and a service line's accent is never a state colour.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterDark, colors, journeyState, lineOf, lines, sizes, stateLook, sunTimes } from '../src/theme.ts';

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

// v1 palette (src/ui.tsx) and v2 roles (src/theme.ts) must not drift apart while screens move over
const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
const pal = Object.fromEntries([...ui.slice(ui.indexOf('export const palette'), ui.indexOf('};', ui.indexOf('export const palette'))).matchAll(/^\s*(\w+): '(#[0-9A-Fa-f]{6})'/gm)].map(m => [m[1], m[2].toUpperCase()]));
const same = (a, b, what) => assert.equal(a.toUpperCase(), b.toUpperCase(), what + ' drifted between ui.tsx and theme.ts');
same(pal.blue, lines.day.ride.color, 'ride line'); same(pal.bluePale, lines.day.ride.tint, 'ride tint');
same(pal.olive, lines.day.send.color, 'send line'); same(pal.olivePale, lines.day.send.tint, 'send tint');
same(pal.shop, lines.day.shop.color, 'shop line'); same(pal.shopPale, lines.day.shop.tint, 'shop tint');
same(pal.warn, stateLook.day.attention.fg, 'attention'); same(pal.warnPale, stateLook.day.attention.bg, 'attention fill');
same(pal.error, stateLook.day.problem.bg, 'problem'); same(pal.muted, stateLook.day.done.bg, 'done');
same(pal.field, stateLook.day.wait.edge, 'wait edge'); same(pal.field, colors.day.lineStrong, 'control edge');
same(pal.forest, colors.day.forest, 'forest'); same(pal.lime, colors.day.lime, 'lime'); same(pal.clay, colors.day.clay, 'clay');
assert.match(ui, new RegExp(`rail: \\{ width: ${sizes.adminRail} `), 'the admin rail width is the admin-rail token');
same(pal.paper, colors.day.ground, 'ground'); same(pal.ink, colors.day.ink, 'ink'); same(pal.secondary, colors.day.inkSecondary, 'ink secondary');

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
