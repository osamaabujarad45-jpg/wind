import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), { copy } = require('../src/copy.ts');
const first = { latitude: 31.9, longitude: 35.2 }, target = { latitude: 32.2, longitude: 35.3 };
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const deadline = 7_000;

// Same controllable hook/clock pattern as quality-recovery and google-map-lifecycle.
function harness(file = 'pin-sheet.tsx', language = 'en') {
  const slots = [], timers = new Map(), maps = [], commands = [];
  let cursor = 0, effects = [], component, props, tree;
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) { const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index])))
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const element = () => ({ style: {}, classList: { add() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, querySelector() {} });
  const host = { ...element(), animateToRegion: region => commands.push(region), injectJavaScript: code => commands.push(code) };
  class MapStub {
    constructor(el, options = el) { this.center = options.center ?? { lat: first.latitude, lng: first.longitude }; this.zoom = options.zoom ?? 16; this.listeners = []; this.touchZoomRotate = { disableRotation() {} }; maps.push(this); }
    addListener(name, fn) { const listener = { name, fn, removed: false, remove() { this.removed = true; } }; this.listeners.push(listener); return listener; }
    on(name, fn) { this.addListener(name, fn); }
    once(name, fn) { this.addListener(name, fn); }
    emit(name, event = {}) { for (const listener of this.listeners) if (!listener.removed && listener.name === name) listener.fn(event); }
    getCenter() { return file === 'route-map.tsx' ? this.center : { lat: () => this.center.lat, lng: () => this.center.lng }; }
    getZoom() { return this.zoom; }
    jumpTo(change) { if (change.center) this.center = { lng: change.center[0], lat: change.center[1] }; if (change.zoom !== undefined) this.zoom = change.zoom; commands.push(change); this.emit('moveend'); }
    setCenter(center) { this.center = center; commands.push({ center }); }
    setZoom(zoom) { this.zoom = zoom; commands.push({ zoom }); }
    getStyle() { return { layers: [] }; }
    resize() {}
    remove() {}
  }
  const sdk = { Map: MapStub, setRTLTextPlugin: async () => {}, event: { clearInstanceListeners() {} } };
  const modules = { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', Linking: {}, Platform: { OS: 'android' },
      StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ height: 844 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'react-native-webview': { WebView: 'WebView' },
    'react-native-maps': { __esModule: true, default: 'MapView' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    './ui': { Button: 'Button', Field: 'Field', Txt: 'Txt', palette: {}, useCopy: () => ({ c: copy[language], language }) },
    './runtime-config': { effectiveRuntime: () => ({ values: { mapReadyTimeoutMs: deadline } }) }, './motion': { useReducedMotion: () => true },
    './route-map': { PinMap: 'PinMap' }, './customer-location': require('../src/customer-location.ts'), './model': require('../src/model.ts'),
    './route-map.native': { Car: 'Car' }, './map-provider-boundary': { MapProviderBoundary: 'MapProviderBoundary' },
    './google-map.native': { PinMap: 'GooglePinMap' }, './google-map.web': { PinMap: 'GooglePinMap' },
    './route-preview': {}, './map-math': require('../src/map-math.ts'), './api': { API_URL: 'https://example.invalid' },
    './google-maps-loader': { loadGoogleMaps: async () => sdk },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, `Missing stub ${name}`); return modules[name]; }, AbortController, Error, process: { env: {} },
    testMapLibre: sdk, document: { createElement: element, querySelector: () => ({}), head: element() }, ResizeObserver: class { observe() {} disconnect() {} },
    setTimeout(fn, delay) { const key = {}; timers.set(key, { fn, delay }); return key; }, clearTimeout: key => timers.delete(key) };
  const source = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const expose = file === 'route-map.android.tsx' ? '\nexports.TestPin = MapLibrePin; exports.TestPage = MapPage; exports.TestAdapter = PinAdapter;'
    : file === 'route-map.native.tsx' ? '\nexports.TestPin = ApplePin; exports.TestAdapter = PinAdapter;'
    : file === 'route-map.tsx' ? '\nexports.TestPin = MapLibrePin; exports.TestAdapter = PinAdapter; lib = Promise.resolve(testMapLibre);' : '';
  runInNewContext(source + expose, context, { filename: file });
  function attach(node) { if (!node || typeof node !== 'object') return; if (node.props?.ref) node.props.ref.current = host;
    for (const child of [node.props?.children].flat(Infinity)) attach(child); }
  return { exports: context.exports, maps, commands, get tree() { return tree; },
    render(nextComponent = component ?? context.exports.default, nextProps = props) {
      component = nextComponent; props = nextProps; cursor = 0; effects = []; tree = component(props); attach(tree); effects.forEach(fn => fn()); return tree;
    },
    expire() { for (const [key, timer] of [...timers]) if (timer.delay === deadline) { timers.delete(key); timer.fn(); } },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function find(node, type, title) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type && (!title || node.props.title === title || node.props.label === title)) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type, title); if (found) return found; }
}
function edit(h, latitude, longitude, c = copy.en) {
  find(h.tree, 'Field', c.pinLatitude).onChangeText(latitude);
  find(h.tree, 'Field', c.pinLongitude).onChangeText(longitude);
  h.render();
}

{
  const h = harness(), parse = h.exports.parsePinCoordinates;
  for (const [lat, lng, expected] of [['٣٢٫٢', '٣٥٫٣', target], ['۳۲٫۲', '۳۵٫۳', target], [' +32.2 ', '35.3', target], ['32,2', '35,3', target], ['-85.05112878', '-180', { latitude: -85.05112878, longitude: -180 }]])
    assert.deepEqual(plain(parse(lat, lng)), expected);
  for (const bad of ['', ' ', '32x', '32 2', '1e2', '0x20', 'NaN', 'Infinity', '32..2', '٣٢٫٫٢', '32,2.1', '--32', '90', '85.051128781', '-86', '9'.repeat(350)])
    assert.equal(parse(bad, '35'), null, `reject malformed, nonfinite or unprojectable latitude: ${bad}`);
  for (const bad of ['181', '-180.1', 'Infinity', '35x']) assert.equal(parse('32', bad), null);
}
for (const language of ['ar', 'en']) {
  const c = copy[language], h = harness('pin-sheet.tsx', language), confirmed = [];
  h.render(undefined, { title: 'Pin', start: first, onClose() {}, onConfirm: point => confirmed.push(point) });
  const staleConfirm = find(h.tree, 'Button', c.confirmPin).onPress;
  find(h.tree, 'PinMap').onReady(); h.render();
  const enabledConfirm = find(h.tree, 'Button', c.confirmPin).onPress;
  find(h.tree, 'Field', c.pinLatitude).onChangeText('۳۲٫۲');
  enabledConfirm(); assert.equal(confirmed.length, 0, 'editing immediately fences a previously enabled handler');
  find(h.tree, 'Field', c.pinLongitude).onChangeText('٣٥٫٣'); h.render();
  assert.equal(find(h.tree, 'Button', c.confirmPin).disabled, true);
  find(h.tree, 'Button', c.pinPreview).onPress(); h.render();
  assert.deepEqual(plain(find(h.tree, 'PinMap').center), target);
  assert.equal(find(h.tree, 'Button', c.confirmPin).disabled, true, 'preview waits for camera acknowledgement');
  staleConfirm(); enabledConfirm(); assert.equal(confirmed.length, 0);
  find(h.tree, 'PinMap').onChange(first); h.render();
  assert.deepEqual(plain(find(h.tree, 'PinMap').center), target, 'stale camera cannot replace the typed target');
  find(h.tree, 'PinMap').onChange(target); h.render();
  assert.equal(find(h.tree, 'Button', c.confirmPin).disabled, false);
  enabledConfirm(); assert.deepEqual(plain(confirmed), [target], 'even old handlers confirm only the visible point');
  find(h.tree, 'PinMap').onZoomChange(12.5); h.render();
  find(h.tree, 'Button', c.pinZoomIn).onPress(); h.render(); assert.equal(find(h.tree, 'PinMap').zoom, 13.5);
  find(h.tree, 'Button', c.pinZoomOut).onPress(); h.render(); assert.equal(find(h.tree, 'PinMap').zoom, 12.5);
  find(h.tree, 'PinMap').onZoomChange(18); h.render(); assert.equal(find(h.tree, 'Button', c.pinZoomIn).disabled, true);
  find(h.tree, 'PinMap').onZoomChange(2); h.render(); assert.equal(find(h.tree, 'Button', c.pinZoomOut).disabled, true);
  edit(h, '32x', '35.3', c); find(h.tree, 'Button', c.pinPreview).onPress(); h.render();
  assert.equal(find(h.tree, 'Field', c.pinLatitude).error, c.pinCoordinateInvalid);
  find(h.tree, 'PinMap').onGesture(); find(h.tree, 'PinMap').onChange(first); h.render();
  assert.equal(find(h.tree, 'Field', c.pinLatitude).value, '32x', 'map gestures preserve the invalid draft');
  enabledConfirm(); assert.equal(confirmed.length, 1, 'a gesture cannot confirm the previous point under an invalid draft');
  edit(h, '32.2', '35.3', c); find(h.tree, 'Button', c.pinPreview).onPress(); h.render();
  h.expire(); h.render(); assert.equal(find(h.tree, 'Button', c.confirmPin).disabled, true);
  enabledConfirm(); assert.equal(confirmed.length, 1, 'camera timeout cannot confirm unseen coordinates');
  find(h.tree, 'PinMap').onChange(target); h.render();
  assert.equal(find(h.tree, 'Button', c.confirmPin).disabled, true, 'a late camera acknowledgement cannot undo the timeout');
  find(h.tree, 'PinMap').onGesture(); find(h.tree, 'PinMap').onChange(target); h.render();
  find(h.tree, 'PinMap').onFail(); enabledConfirm(); assert.equal(confirmed.length, 1, 'failure immediately fences old handlers');
  h.close();
}
{
  const h = harness(); let confirmed = 0;
  h.render(undefined, { title: 'Pin', start: first, onClose() {}, onConfirm() { confirmed++; }, autoLocate: true, onLocate: async () => { throw new Error('denied'); } });
  await flush(); h.render(); find(h.tree, 'PinMap').onReady(); h.render();
  assert.equal(find(h.tree, 'Button', copy.en.confirmPin).disabled, true, 'denied GPS cannot choose the fallback city');
  edit(h, '32.2', '35.3'); find(h.tree, 'Field', copy.en.pinLongitude).onSubmitEditing(); h.render();
  find(h.tree, 'PinMap').onChange(target); h.render();
  find(h.tree, 'Button', copy.en.confirmPin).onPress(); assert.equal(confirmed, 1, 'coordinate entry works after GPS denial');
  h.close();
}
{
  const h = harness(); let finish, signal;
  h.render(undefined, { title: 'Pin', start: first, onClose() {}, onConfirm() {}, autoLocate: true,
    onLocate: next => { signal = next; return new Promise(resolve => { finish = resolve; }); } });
  edit(h, '32.2', '35.3'); assert.equal(signal.aborted, true);
  finish({ latitude: 33, longitude: 36 }); await flush(); h.render();
  assert.equal(find(h.tree, 'Field', copy.en.pinLatitude).value, '32.2', 'late GPS cannot replace manual input');
  find(h.tree, 'Button', copy.en.pinPreview).onPress(); h.render();
  find(h.tree, 'PinMap').onChange(target); h.render();
  assert.equal(find(h.tree, 'Button', copy.en.confirmPin).disabled, true, 'matching coordinates still require map readiness');
  find(h.tree, 'PinMap').onReady(); h.render(); assert.equal(find(h.tree, 'Button', copy.en.confirmPin).disabled, false);
  h.close();
}

for (const file of ['route-map.native.tsx', 'google-map.native.tsx']) {
  const h = harness(file), zooms = [], props = { center: first, zoom: 16, onChange() {}, onZoomChange: zoom => zooms.push(zoom) };
  h.render(file.startsWith('google') ? h.exports.PinMap : h.exports.TestPin, props);
  const map = find(h.tree, 'MapView'); (map.onMapReady ?? map.onMapLoaded)(); h.render();
  find(h.tree, 'MapView').onRegionChangeComplete({ ...first, latitudeDelta: 0.04, longitudeDelta: 0.02 });
  assert.equal(zooms.at(-1), 15, file + ' reports pinch zoom relative to the actual viewport');
  h.render(undefined, { ...props, zoom: 16 });
  // React sees no change from the original prop until the reported zoom is returned by the controller.
  h.render(undefined, { ...props, zoom: 15 }); h.render(undefined, { ...props, zoom: 16 });
  assert.deepEqual(plain(h.commands.at(-1)), { ...first, latitudeDelta: 0.02, longitudeDelta: 0.01 }, file + ' zooms current spans without losing aspect ratio');
  h.close();
}
for (const file of ['route-map.tsx', 'google-map.web.tsx']) {
  const h = harness(file), zooms = [], props = { center: first, zoom: 16, onChange() {}, onZoomChange: zoom => zooms.push(zoom) };
  h.render(file === 'route-map.tsx' ? h.exports.TestPin : h.exports.PinMap, props); await flush();
  const map = h.maps[0]; assert.ok(map, file + ' map initializes');
  if (file === 'route-map.tsx') { map.emit('style.load'); map.emit('sourcedata', { source: { type: 'vector' }, coord: {}, tile: { state: 'loaded' } }); map.emit('load'); }
  else map.emit('tilesloaded');
  h.render(); map.zoom = 11.5; map.emit(file === 'route-map.tsx' ? 'moveend' : 'idle');
  assert.equal(zooms.at(-1), 11.5, file + ' reports actual gesture zoom');
  h.render(undefined, { ...props, zoom: 11.5 }); h.render(undefined, { ...props, zoom: 12.5 });
  assert.equal(map.zoom, 12.5, file + ' applies the controller zoom');
  h.close();
}
{
  const h = harness('route-map.android.tsx'), zooms = [], changed = [];
  const props = { config: { mode: 'pin', center: first, zoom: 16 }, update: { center: first, zoom: 16 }, height: 320,
    onFail() {}, onCenter: point => changed.push(point), onZoomChange: zoom => zooms.push(zoom) };
  h.render(h.exports.TestPage, props);
  const message = value => find(h.tree, 'WebView').onMessage({ nativeEvent: { data: JSON.stringify(value) } });
  message({ type: 'drawing' }); h.render(); message({ type: 'center', ...first, zoom: 12 });
  h.render(undefined, { ...props, update: { center: first, zoom: 13 } });
  assert.ok(h.commands.at(-1).includes('"zoom":13'), 'zoom-only updates cross the Android bridge');
  assert.equal(zooms.at(-1), 12, 'Android reports viewport zoom');
  h.render(undefined, { ...props, update: { center: target, zoom: 13 } });
  message({ type: 'center', ...first, zoom: 10 }); assert.equal(zooms.at(-1), 12, 'stale center cannot reset zoom during a camera request');
  message({ type: 'center', ...target, zoom: 13 }); assert.deepEqual(plain(changed.at(-1)), target);
  h.close();
}
for (const file of ['route-map.tsx', 'route-map.android.tsx', 'route-map.native.tsx']) {
  const h = harness(file); let active = true, reported;
  const tree = h.render(h.exports.TestAdapter, { pin: { center: first, onChange() {}, onZoomChange: zoom => { reported = zoom; } },
    attempt: { key: 'test', renderer: 'google', current: () => active } });
  tree.props.onZoomChange(12); assert.equal(reported, 12); active = false;
  tree.props.onZoomChange(8); assert.equal(reported, 12, file + ' retired provider cannot overwrite zoom');
  h.close();
}
{
  const page = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  const source = page.slice(page.indexOf('window.wind = update =>'), page.indexOf('// Faded while the fix is old'));
  const moves = [], context = { window: {}, failed: false, state: {}, ready: true, pin: true, fade() {},
    map: { getCenter: () => ({ lat: first.latitude, lng: first.longitude }), getZoom: () => 12, jumpTo: change => moves.push(change) } };
  runInNewContext(source, context);
  context.window.wind({ zoom: 13 }); assert.deepEqual(plain(moves), [{ zoom: 13 }]);
  context.window.wind({ zoom: NaN }); context.window.wind({ zoom: 19 }); context.window.wind({ center: { latitude: 86, longitude: 35 } });
  assert.equal(moves.length, 1, 'Android page rejects invalid zoom and out-of-projection bridge coordinates');
  assert.match(page, /zoom: map\.getZoom\(\)/, 'Android page reports the real zoom with camera completion');
}
console.log('Accessible pin: AR/EN coordinate entry, validation, camera acknowledgement, GPS races, zoom control and provider fences passed');
