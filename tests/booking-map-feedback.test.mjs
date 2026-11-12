import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = read('../public/map.html'), book = read('../src/app/book.tsx'), copy = read('../src/copy.ts');
const segment = (from, to) => {
  const start = page.indexOf(from), end = page.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${from} must be present`);
  return page.slice(start, end);
};
const state = { labels: {}, insets: { top: 60, bottom: 100, left: 340, right: 0 } };
const styles = new Map();
const context = { state, padding: 40, document: { documentElement: { style: { setProperty: (key, value) => styles.set(key, value) } } } };
runInNewContext(`${segment('const fitPadding =', 'insetCss();')} globalThis.fit = fitPadding; globalThis.free = freePadding; globalThis.insetCss = insetCss;`, context);
assert.equal(context.fit().left, 420, 'Arabic landscape framing reserves the left sheet');
assert.equal(context.fit().right, 80);
assert.equal(context.free().left, 340, 'pin camera and the visible pin reserve the same side');
context.insetCss();
assert.equal(styles.get('--inset-left'), '340px');
runInNewContext(`${segment('const followOffset =', 'let drawnLines')} globalThis.follow = followOffset;`, context);
assert.equal(context.follow()[0], 170, 'follow camera shifts away from a left sheet');
state.insets = { top: 0, bottom: 0, left: 0, right: 340 };
assert.equal(context.fit().right, 420);
assert.equal(context.free().right, 340);
assert.equal(context.follow()[0], -170);
for (const selector of ['#pin {', '#pin-base {']) {
  const css = segment(selector, '\n');
  assert.ok(css.includes('var(--inset-left) - var(--inset-right)'), 'the pin uses both horizontal insets');
}
assert.ok(page.includes("recenter.style.left = 'calc(var(--inset-left) + 10px)'"));
assert.ok(page.includes("map.on('click',"), 'a map tap is a non-drag way to move the pin');
const movestart = segment("  map.on('movestart',", "  map.on('dragstart',");
{
  const moved = [], lifted = [];
  let onMoveStart;
  runInNewContext(movestart, {
    map: { on: (_, handler) => { onMoveStart = handler; } },
    pinning: () => true,
    pinEl: { classList: { add: cls => lifted.push(cls) } },
    send: event => moved.push(event.type),
  });
  onMoveStart({}); // programmatic search/locate jump: must not lift the pin or disable Confirm
  assert.deepEqual(moved, [], 'programmatic camera positioning must not emit moving or disable Confirm');
  assert.deepEqual(lifted, []);
  onMoveStart({ originalEvent: { type: 'touchmove' } });
  assert.deepEqual(moved, ['moving'], 'a user drag/pinch emits moving until moveend settles');
  assert.deepEqual(lifted, ['lift']);
}
const centerPinFn = segment('function centerPin(', '// Faded while');
{
  const jumps = [], eases = [];
  const ctx = {
    validPoint: p => !!p,
    still: () => false,
    announcedReady: true,
    map: { getCenter: () => ({ lat: 31.9, lng: 35.2 }), getZoom: () => 15, jumpTo: c => jumps.push(c), easeTo: c => eases.push(c) },
  };
  runInNewContext(`${centerPinFn} globalThis.centerPin = centerPin;`, ctx);
  assert.equal(ctx.centerPin({ latitude: 32.2211, longitude: 35.2544 }, 15), true);
  assert.equal(jumps.length, 1, 'place pick / locate jumps directly without a 350 ms ease window');
  assert.equal(eases.length, 0);
  assert.equal(ctx.centerPin({ latitude: 32.2211, longitude: 35.2544 }, 15, true), true);
  assert.equal(eases.length, 1, 'explicit map tap still eases smoothly after reporting the tapped point');
}
const click = segment("  map.on('click',", "  map.on('moveend',");
const events = [], centres = [];
runInNewContext(`let pinDragged = false;\n${click}`, { map: { on: (_, handler) => handler({ lngLat: { lat: 31.9, lng: 35.2 } }) }, pinning: () => true,
  send: event => events.push(event), centerPin: (point, _zoom, animate) => { centres.push({ point, animate }); return true; } });
assert.deepEqual(events.map(e => e.type), ['gesture', 'center'], 'a manual tap cancels GPS and immediately reports the tapped coordinate');
assert.equal(events[1].latitude, 31.9);
assert.equal(centres[0].point.latitude, 31.9);
assert.equal(centres[0].animate, true);
// A tap on the pin's own spot moves nothing and fires no moveend: the tap itself already reported the centre.
const still = [];
runInNewContext(`let pinDragged = false;\n${click}`, { map: { on: (_, handler) => handler({ lngLat: { lat: 31.9, lng: 35.2 } }) },
  pinning: () => true, send: event => still.push(event), centerPin: () => false });
assert.deepEqual(still.map(event => event.type), ['gesture', 'center']);
assert.equal(still[1].latitude, 31.9);
assert.match(book, /if \(step === 'pin'\) \{ setPinCenter\(result\.point\); setPinPoint\(result\.point\); setPinMoving\(false\); \}/,
  'locating on the pin step updates pinPoint immediately');
assert.match(book, /side && \(rtl \? \{ left: SIDE_SHEET \} : \{ right: SIDE_SHEET \}\)/);
assert.match(book, /side && \(rtl \? \{ left: SIDE_SHEET, right: 0 \} : \{ right: SIDE_SHEET \}\)/);
assert.match(book, /<Button title=\{c.searchLabel\}[^\n]*setField\(pinFor\)[^\n]*setStep\('search'\)/, 'search stays reachable from pin placement, including a failed map');
assert.match(book, /setSwapNotice\(fill\(c.swapDone/);
assert.match(book, /<View accessibilityLiveRegion="polite"[^\n]*<Txt[^\n]*swapNotice/, 'swap feedback uses a native live-region host, not an unsupported Txt prop');
assert.match(book, /!pending && routeChosen && !scopeInvalid && <Card style=\{\{ paddingVertical: 10, minHeight: 112 \}\}/, 'quote space survives loading, failure and success');
// The failure sentence lives once, under the Request button; the card keeps its space with a dash.
assert.match(book, /quoting \? c.quote_calculating : quoteFailed \? '—' : smart \? money\(smart.price\)/, 'loading cannot display an old price');
const ar = copy.slice(copy.indexOf('const ar = {'), copy.indexOf('const en: Copy = {'));
assert.match(ar, /swapDone: '[^']*[\u0600-\u06ff]/);
for (const file of ['../src/app/(customer)/index.tsx', '../src/app/order/[id].tsx', '../src/driver-map.tsx']) {
  assert.match(read(file), /side && \(rtl \? \{ left: SIDE_SHEET \} : \{ right: SIDE_SHEET \}\)/, `${file} reserves the sheet's actual side`);
}
for (const file of ['../src/app/(customer)/index.tsx', '../src/app/order/[id].tsx', '../src/app/driver/index.tsx']) {
  assert.match(read(file), /side && \(rtl \? \{ left: SIDE_SHEET, right: 0 \} : \{ right: SIDE_SHEET \}\)/, `${file} keeps top controls outside the sheet`);
}
assert.match(read('../src/app/(customer)/index.tsx'), /rtl \? \{ left: 12 \+ \(side \? SIDE_SHEET : 0\) \}/, 'the Arabic Home locate control clears its left sheet');
console.log('Booking map padding, tap/search alternatives, swap feedback and quote stability passed');
