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
