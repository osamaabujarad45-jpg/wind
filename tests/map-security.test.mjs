import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the public page's actual fragment parser and SVG/CSS builders. No
// browser/device or network is needed to prove untrusted markup never reaches
// innerHTML. This does not claim a browser exploit or CSP execution test.
const page = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
const start = page.indexOf('<script type="module">') + '<script type="module">'.length;
const parser = page.slice(start, page.indexOf('// The live camera:', start));
const dot = page.slice(page.indexOf('function dot('), page.indexOf('function noEntry('));
const driver = page.slice(page.indexOf('function driverIcon('), page.indexOf('const halo ='));
assert.ok(parser.includes('JSON.parse') && driver.includes('innerHTML'), 'test exercises the real fragment-to-markup boundary');
function checkFragment(fragment) {
  const sent = [];
  const context = { window: { ReactNativeWebView: { postMessage: message => sent.push(JSON.parse(message)) } },
    location: { hash: '#' + encodeURIComponent(JSON.stringify(fragment)) } };
  try { runInNewContext(parser + ';globalThis.result = C', context); return { ok: true, sent, colors: context.result }; }
  catch (error) { return { ok: false, sent, error: error.message }; }
}
assert.deepEqual(checkFragment({ mode: 'route', pickup: { latitude: 31.9, longitude: 35.2 }, dropoff: { latitude: 32.2, longitude: 35.26 } }).ok, true);
for (const bad of [{ mode: 'route', pickup: { latitude: 31.9, longitude: 35.2 } }, { mode: 'pin' },
  { mode: 'route', pickup: { latitude: NaN, longitude: 35.2 }, dropoff: { latitude: 32.2, longitude: 35.26 } },
  { mode: 'route', pickup: { latitude: 91, longitude: 35.2 }, dropoff: { latitude: 32.2, longitude: 35.26 } },
  { mode: 'pin', center: { latitude: 32, longitude: Number.POSITIVE_INFINITY } }]) {
  const check = checkFragment(bad);
  assert.equal(check.ok, false);
  assert.match(check.error, /bad config/);
  assert.deepEqual(check.sent, [{ type: 'failed' }]);
}
function render(colors) {
  const context = { window: {}, location: { hash: '#' + encodeURIComponent(JSON.stringify({ colors, mode: 'route',
    pickup: { latitude: 31.9, longitude: 35.2 }, dropoff: { latitude: 32.2, longitude: 35.26 } })) },
    document: { createElement: () => ({ style: {}, classList: { add() {} } }) } };
  runInNewContext(parser + dot + driver + `
    globalThis.result = { colors: C, icon: driverIcon(true).innerHTML,
      marker: dot(C.olive, false).style.cssText };`, context);
  return JSON.parse(JSON.stringify(context.result));
}
const defaults = { forest: '#12342A', olive: '#34765A', clay: '#CB6845', blue: '#2F5E8C' };
assert.deepEqual(render(undefined).colors, defaults);
const valid = { forest: '#112233', olive: '#aAbBcC', clay: '#ABCDEF', blue: '#123abc', ignored: 'not a palette key' };
const accepted = render(valid);
assert.deepEqual(accepted.colors, { forest: valid.forest, olive: valid.olive, clay: valid.clay, blue: valid.blue });
assert.ok(accepted.icon.includes('fill="#123abc"'));
assert.ok(accepted.marker.includes('background:#aAbBcC;'));
const injection = '"><image href="x" onerror="globalThis.compromised=true"/><circle fill="';
const poisoned = render({ blue: injection, olive: 'red;position:fixed;inset:0;background:url(https://attacker.invalid/x)',
  clay: { toString: 'untrusted' }, forest: ['#000000'], extra: injection });
assert.deepEqual(poisoned.colors, defaults, 'markup, CSS declarations, objects and arrays cannot become colors');
assert.ok(poisoned.icon.includes('fill="#2F5E8C"'));
assert.doesNotMatch(poisoned.icon, /onerror|<image|compromised/);
assert.doesNotMatch(poisoned.marker, /position:fixed|attacker|url\(/);
for (const invalid of [null, [], 'blue', 7, { blue: '#123' }, { blue: '#12345678' }, { blue: '#123456\n' },
  { blue: ' #123456' }, { blue: 'url(javascript:alert(1))' }]) assert.deepEqual(render(invalid).colors, defaults);
const deadline = page.slice(page.indexOf('const readyTimeout ='), page.indexOf('let timer ='));
for (const input of [undefined, null, '7000', 4999, 30001, NaN, Infinity, {}, []]) {
  const context = { config: { readyTimeout: input } };
  runInNewContext(deadline + ';globalThis.result = readyTimeout;', context);
  assert.equal(context.result, 20000, 'invalid page deadlines use the safe default');
}
for (const input of [5000, 7000, 30000]) {
  const context = { config: { readyTimeout: input } };
  runInNewContext(deadline + ';globalThis.result = readyTimeout;', context);
  assert.equal(context.result, input, 'page deadline preserves a valid runtime value');
}
console.log('Map fragment security: real parser/SVG/CSS reject color injection and preserve valid palette colors');
