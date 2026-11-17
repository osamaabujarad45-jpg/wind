import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the public page's actual fragment parser and SVG/CSS builders. No
// browser/device or network is needed to prove untrusted markup never reaches
// innerHTML. This does not claim a browser exploit or CSP execution test.
const page = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
const start = page.indexOf('<script type="module">') + '<script type="module">'.length;
const parser = page.slice(start, page.indexOf('// The live camera:', start));
const stop = page.slice(page.indexOf('function stopMarker('), page.indexOf('function noEntry('));
const driver = page.slice(page.indexOf('function driverIcon('), page.indexOf('const halo ='));
assert.ok(parser.includes('JSON.parse') && driver.includes('innerHTML'), 'test exercises the real fragment-to-markup boundary');
function render(colors) {
  const context = { window: {}, location: { hash: '#' + encodeURIComponent(JSON.stringify({ colors })) },
    document: { documentElement: {}, createElement: () => ({ style: {}, classList: { add() {} } }) } };
  runInNewContext(parser + stop + driver + `
    globalThis.result = { colors: C, icon: driverIcon(true).innerHTML,
      marker: stopMarker(C.forest, false).innerHTML };`, context);
  return JSON.parse(JSON.stringify(context.result));
}
const defaults = { forest: '#12342A', olive: '#34765A', clay: '#CB6845', blue: '#2F5E8C' };
assert.deepEqual(render(undefined).colors, defaults);
const valid = { forest: '#112233', olive: '#aAbBcC', clay: '#ABCDEF', blue: '#123abc', ignored: 'not a palette key' };
const accepted = render(valid);
assert.deepEqual(accepted.colors, { forest: valid.forest, olive: valid.olive, clay: valid.clay, blue: valid.blue });
assert.ok(accepted.icon.includes('fill="#112233"'));
assert.ok(accepted.marker.includes('solid #112233'));
const injection = '"><image href="x" onerror="globalThis.compromised=true"/><circle fill="';
const poisoned = render({ blue: injection, olive: 'red;position:fixed;inset:0;background:url(https://attacker.invalid/x)',
  clay: { toString: 'untrusted' }, forest: injection, extra: injection });
assert.deepEqual(poisoned.colors, defaults, 'markup, CSS declarations, objects and arrays cannot become colors');
assert.ok(poisoned.icon.includes('fill="#12342A"'));
assert.doesNotMatch(poisoned.icon, /onerror|<image|compromised/);
assert.doesNotMatch(poisoned.marker, /position:fixed|attacker|url\(/);
for (const invalid of [null, [], 'blue', 7, { blue: '#123' }, { blue: '#12345678' }, { blue: '#123456\n' },
  { blue: ' #123456' }, { blue: 'url(javascript:alert(1))' }]) assert.deepEqual(render(invalid).colors, defaults);
const deadline = page.slice(page.indexOf('const readyTimeout ='), page.indexOf('let timer ='));
for (const input of [undefined, null, '7000', 4999, 30001, NaN, Infinity, {}, []]) {
  const context = { config: { readyMs: input } };
  runInNewContext(deadline + ';globalThis.result = readyTimeout;', context);
  assert.equal(context.result, 20000, 'invalid map deadlines use the safe default');
}
for (const input of [5000, 7000, 30000]) {
  const context = { config: { readyMs: input } };
  runInNewContext(deadline + ';globalThis.result = readyTimeout;', context);
  assert.equal(context.result, input, 'valid runtime deadlines are preserved');
}
console.log('Map fragment security: real parser/SVG/CSS reject color injection and preserve valid palette colors');
{ // Strict review 8 Nov: the canvas must describe the actual mode, not assume a keyboard or pin placement everywhere.
  assert.doesNotMatch(page, /arrow keys|مفاتيح الأسهم/, 'map canvas label assumes a keyboard');
  assert.match(page, /const canvasLabel = \(\) =>[\s\S]*?!pinning\(\)/, 'canvas label is mode-aware');
  assert.match(page, /drawnMode = state\.mode;[\s\S]{0,80}canvasLabel\(\);/, 'canvas label follows mode changes');
  assert.match(page, /baseTileLoaded = window\.windBaseTile = true/, 'capture readiness requires a real basemap tile');
  assert.match(page, /e\.tile\?\.state === 'errored'\) window\.windTileFailed = true/, 'a later tile error invalidates earlier success');
}
{ // Execute the real readiness listeners: old success must not hide a failed camera generation.
  const start = page.indexOf('let mapLoaded ='), end = page.indexOf("map.once('load'", start);
  const handlers = {}, context = { window: {}, failed: false, timer: null, clearTimeout() {}, send() {},
    document: { querySelector: () => null }, map: { on: (name, fn) => { handlers[name] = fn; } } };
  runInNewContext(page.slice(start, end), context);
  const tile = state => ({ source: { type: 'vector' }, coord: {}, tile: { state } });
  handlers.sourcedata(tile('loaded'));
  assert.equal(context.window.windBaseTile, true);
  handlers.sourcedata(tile('errored'));
  assert.equal(context.window.windTileFailed, true, 'an error after an earlier success fails capture readiness');
  handlers.movestart();
  assert.equal(context.window.windBaseTile, false, 'a new camera cannot reuse the old tile success');
  assert.equal(context.window.windTileFailed, false, 'a new camera generation gets a fresh verdict');
  handlers.sourcedata(tile('errored'));
  handlers.resize();
  assert.equal(context.window.windTileFailed, false, 'resize also starts a new tile verdict');
}
{ // Blank maps and unquoted forms are failed captures, never release evidence.
  const screens = readFileSync(new URL('../scripts/screens.mjs', import.meta.url), 'utf8');
  assert.match(screens, /async function mapsReady\(page, where\)/, 'captures wait for map frames');
  assert.match(screens, /window\.windBaseTile === true && window\.windTileFailed === false && window\.windMap\?\.loaded\(\) && window\.windMap\.areTilesLoaded\(\)/, 'and for actual loaded tiles without later errors');
  assert.ok((screens.match(/await mapsReady\(page,/g) ?? []).length >= 3, 'ordinary, interactive and narrow captures all use the guard');
  assert.match(screens, /getByText\(t\.quote_calculating, \{ exact: true \}\)\.first\(\)\.waitFor\(\{ state: 'hidden'/, 'narrow booking captures wait for a settled quote');
  assert.match(screens, /getByText\(t\.quote_failed, \{ exact: true \}\)\.count\(\), 0/, 'and reject a failed quote');
  assert.match(screens, /view\.id\.startsWith\('book-'\)\) assert\.notEqual\(await target\.getAttribute\('aria-disabled'\), 'true'/, 'specific quote errors cannot leave a disabled Request button in evidence');
}
