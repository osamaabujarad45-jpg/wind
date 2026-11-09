import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const math = require('../src/map-math.ts');
const storage = require('../src/web-storage.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

// Execute the real TSX with controllable hooks, SDK loading, DOM and clock.
// This checks lifecycle behavior, not browser rendering or real Google tiles.
function harness(file = 'google-map.web.tsx', deniedStorage = false, preferences = {}) {
  const slots = [], pending = [], timers = new Map(), frames = new Map(), maps = [], lines = [], overlays = [], hostRefs = new Set();
  let cursor = 0, serial = 0, now = 0, component, props, tree, loadResolve;
  const loading = new Promise(resolve => { loadResolve = resolve; });
  const element = () => ({ style: {}, children: [], addEventListener() {}, removeEventListener() {}, appendChild(child) { child.parent = this; this.children.push(child); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); } });
  const host = element();
  host.injected = []; host.injectJavaScript = value => host.injected.push(value);
  host.regions = []; host.animateToRegion = value => host.regions.push(value);
  host.fits = []; host.fitToCoordinates = (points, options) => host.fits.push({ points, options });
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof value === 'function' ? value() : value };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index])))
        pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  class MapStub {
    constructor(el, options) { this.el = el; this.options = options; this.center = options.center; this.listeners = []; maps.push(this); }
    addListener(name, fn) { const listener = { name, fn, removed: false, remove() { this.removed = true; } }; this.listeners.push(listener); return listener; }
    emit(name) { for (const listener of this.listeners) if (!listener.removed && listener.name === name) listener.fn(); }
    getCenter() { return { lat: () => this.center.lat, lng: () => this.center.lng }; }
    setCenter(center) { this.center = center; }
    fitBounds(bounds) { this.bounds = bounds; }
    getDiv() { return this.el; }
    setZoom() {}
    panTo(center) { this.center = center; }
  }
  class Overlay {
    constructor(options) { this.options = options; this.map = options.map; this.path = options.path; overlays.push(this); if ('path' in options) lines.push(this); }
    setMap(map) { this.map = map; }
    setPath(path) { this.path = path; }
    setVisible() {}
    setOpacity() {}
    setCenter() {}
    setRadius() {}
    setPosition() {}
    setIcon(value) { this.icon = value; }
    set() {}
  }
  const sdk = { Map: MapStub, Polyline: Overlay, Circle: Overlay, Marker: Overlay,
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    LatLngBounds: class { constructor() { this.points = []; } extend(point) { this.points.push(point); } },
    event: { clearInstanceListeners(map) { map.cleared = true; map.listeners.forEach(listener => listener.remove()); } },
  };
  const modules = { react, 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', useWindowDimensions: () => ({ height: 844 }),
    AppState: { addEventListener: () => ({ remove() {} }) },
    Platform: { OS: 'web' }, StyleSheet: { create: value => value, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, './map-math': math, './route-preview': { __esModule: true, default: 'RoutePreview' },
    './ui': { Button: 'Button', Txt: 'Txt', palette: { mapWash: '#E6ECE3' }, shadow: {}, useCopy: () => ({ rtl: !!preferences.rtl, c: { retry: 'Retry', routeOnMap: 'Route map', pinHint: 'Move the map to select the pin', pinPositionFailed: 'Positioning failed', confirmPin: 'Confirm pin', useLocation: 'Use location', locating: 'Locating', locationManual: 'Choose manually', locationInaccurate: 'Inaccurate', pinOutsideArea: 'Outside' } }) },
    './route-map': { PinMap: 'PinMap' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    './customer-location': require('../src/customer-location.ts'),
    'react-native-webview': { WebView: 'WebView' }, './api': { API_URL: 'https://api.example.test' },
    './google-map.native': { __esModule: true, default: 'GoogleRouteMap', PinMap: 'GooglePinMap' },
    './map-provider-boundary': { MapProviderBoundary: 'MapProviderBoundary' },
    'react-native-maps': { __esModule: true, default: 'MapView' }, './motion': { useReducedMotion: () => !!preferences.still },
    './route-map.native': { Car: 'Car' },
    './google-maps-loader': { loadGoogleMaps: () => loading }, './web-storage': storage,
    'expo-secure-store': {},
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { googleMaps: { web: true } } } } },
    './map-mode': { useMapMode: () => ['google', () => {}], currentMapMode: () => 'google' },
    './map-provider': require('../src/map-provider.ts'),
    './runtime-config': { mapReadyMs: () => 20_000, effectiveRuntime: () => ({ values: { mapReadyTimeoutMs: 20_000 }, mapProviders: { initialMapProvider: 'baseline' } }), subscribeRuntime: () => () => {} },
    './map-failures': require('../src/map-failures.ts'),
  };
  const context = { exports: {}, require: name => modules[name] ?? require(name), process: { env: {} }, AbortController, Error,
    document: { createElement: element }, setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id), performance: { now: () => now } };
  if (deniedStorage) Object.defineProperty(context, 'localStorage', { get() { throw new Error('Storage denied'); } });
  const compile = name => ts.transpileModule(readFileSync(new URL('../src/' + name, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  // The WebView page runs on the real bridge, with this harness's hooks and clock.
  const bridge = { exports: {} };
  runInNewContext(compile('map-bridge.ts'), { ...context, exports: bridge.exports }, { filename: 'map-bridge.ts' });
  modules['./map-bridge'] = bridge.exports;
  const source = compile(file);
  const internal = file === 'route-map.native.tsx' ? '\nexports.TestPin = ApplePin; exports.TestRoute = AppleRouteMap;' : '';
  runInNewContext(source + internal, context, { filename: file });
  function attach(node) { if (!node || typeof node !== 'object') return;
    if (node.props?.ref) { node.props.ref.current = host; hostRefs.add(node.props.ref); }
    const children = node.props?.children; for (const child of Array.isArray(children) ? children : [children]) attach(child); }
  const render = (nextComponent = component, nextProps = props) => {
    component = nextComponent; props = nextProps; cursor = 0; tree = component(props); attach(tree);
    while (pending.length) pending.shift()();
    return tree;
  };
  return { exports: context.exports, host, maps, lines, overlays, sdk, render,
    frame(time) { now = time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); },
    resolveSdk: () => loadResolve(sdk),
    deadline(delay = 25_000) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } },
    get tree() { return tree; },
    unmount() { for (const ref of hostRefs) ref.current = null;
      for (const slot of slots) slot?.cleanup?.(); },
  };
}
const first = { latitude: 31.9, longitude: 35.2 }, latest = { latitude: 32.2, longitude: 35.3 };
function find(node, type, title) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type && (!title || node.props.title === title)) return node.props;
  for (const child of [node.props?.children].flat()) { const found = find(child, type, title); if (found) return found; }
}
{
  const h = harness(); let failed = 0;
  h.render(h.exports.PinMap, { center: first, onChange() {}, onFail: () => failed++ });
  h.deadline(); h.render(); h.resolveSdk(); await flush();
  assert.equal(failed, 1);
  assert.equal(h.maps.length, 0, 'a late Google SDK must not construct a map after the deadline');
  h.unmount();
}
for (const file of ['google-map.native.tsx', 'route-map.native.tsx']) {
  const h = harness(file), seen = [];
  const props = { center: first, onChange: point => seen.push(point) };
  h.render(file === 'google-map.native.tsx' ? h.exports.PinMap : h.exports.TestPin, props);
  h.render(undefined, { ...props, center: latest });
  find(h.tree, 'MapView').onRegionChangeComplete(first);
  assert.equal(seen.length, 0, file + ': an old native center cannot replace a target received before readiness');
  const map = find(h.tree, 'MapView'); (map.onMapLoaded ?? map.onMapReady)(); h.render();
  assert.deepEqual(plain(h.host.regions.at(-1)), { ...latest, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  h.unmount();
}
for (const file of ['google-map.native.tsx', 'route-map.native.tsx']) for (const completion of ['missing', 'completed', 'gesture']) {
  const h = harness(file); let failures = 0;
  const props = { center: first, onChange() {}, onFail: () => failures++ };
  h.render(file === 'google-map.native.tsx' ? h.exports.PinMap : h.exports.TestPin, props);
  const map = find(h.tree, 'MapView'); (map.onMapLoaded ?? map.onMapReady)(); h.render();
  assert.equal(map.accessibilityLabel, 'Move the map to select the pin');
  h.render(undefined, { ...props, center: latest });
  if (completion === 'completed') find(h.tree, 'MapView').onRegionChangeComplete(latest);
  if (completion === 'gesture') find(h.tree, 'MapView').onPanDrag();
  h.deadline(20_000);
  assert.equal(failures, completion === 'missing' ? 1 : 0, file + ': positioning deadline respects completion and gestures');
  h.unmount();
}
for (const rtl of [false, true]) for (const file of ['google-map.native.tsx', 'route-map.native.tsx']) {
  const h = harness(file, false, { rtl });
  h.render(file === 'google-map.native.tsx' ? h.exports.default : h.exports.TestRoute, { pickup: first, dropoff: latest, pickupTitle: 'A', dropoffTitle: 'B' });
  const label = find(h.tree, 'MapView').accessibilityLabel;
  assert.ok(label?.includes('Route map: A') && label.includes(rtl ? '←' : '→'), file + ': native route is described in the chosen direction');
  h.unmount();
}

// Pickup sheets must acquire a real fix, then wait for the visible camera to agree before confirming.
{
  const h = harness('pin-sheet.tsx'); let resolveFix, signal, confirmed;
  h.render(h.exports.default, { start: first, autoLocate: true, onLocate: next => { signal = next; return new Promise(resolve => { resolveFix = resolve; }); }, onConfirm: point => { confirmed = point; } });
  find(h.tree, 'PinMap').onReady(); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, true);
  resolveFix(latest); await flush(); h.render();
  assert.deepEqual(plain(find(h.tree, 'PinMap').center), latest);
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, true, 'GPS completion alone is not camera completion');
  find(h.tree, 'PinMap').onChange(first); h.render();
  assert.deepEqual(plain(find(h.tree, 'PinMap').center), latest, 'old initial camera event cannot overwrite GPS');
  find(h.tree, 'PinMap').onChange(latest); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, false);
  find(h.tree, 'Button', 'Confirm pin').onPress();
  assert.deepEqual(plain(confirmed), latest);
  h.unmount(); assert.equal(signal.aborted, true);
}
{
  const h = harness('pin-sheet.tsx'); let resolveFix, signal;
  h.render(h.exports.default, { start: first, autoLocate: true, onLocate: next => { signal = next; return new Promise(resolve => { resolveFix = resolve; }); }, onConfirm() {} });
  const pin = find(h.tree, 'PinMap'); pin.onReady(); pin.onGesture(); pin.onChange({ latitude: 31.91, longitude: 35.21 }); h.render();
  assert.equal(signal.aborted, true, 'a user gesture cancels collection immediately');
  resolveFix(latest); await flush(); h.render();
  assert.deepEqual(plain(find(h.tree, 'PinMap').center), { latitude: 31.91, longitude: 35.21 }, 'late GPS cannot overwrite the manual pin');
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, false);
  h.unmount();
}
{
  const h = harness('pin-sheet.tsx'); let starts = 0;
  h.render(h.exports.default, { start: first, autoLocate: true, onLocate: async () => { if (++starts === 1) throw new Error('unavailable'); return latest; }, onConfirm() {} });
  find(h.tree, 'PinMap').onReady(); await flush(); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, true, 'a failed fix never silently confirms the fallback city');
  assert.ok(JSON.stringify(h.tree).includes('Choose manually'));
  find(h.tree, 'Button', 'Use location').onPress(); await flush(); h.render();
  find(h.tree, 'PinMap').onChange(latest); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, false, 'retry recovers');
  h.unmount();
}
{
  const h = harness('pin-sheet.tsx'); let starts = 0;
  h.render(h.exports.default, { start: latest, onLocate: async () => { starts++; return first; }, onConfirm() {} });
  find(h.tree, 'PinMap').onReady(); h.render();
  assert.equal(starts, 0, 'an existing manual or saved pin does not start GPS');
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, false);
  h.unmount();
}
{
  const h = harness('pin-sheet.tsx'); let resolveFix, signal;
  h.render(h.exports.default, { start: first, autoLocate: true, onLocate: next => { signal = next; return new Promise(resolve => { resolveFix = resolve; }); }, onConfirm() {} });
  h.unmount(); resolveFix(latest); await flush();
  assert.equal(signal.aborted, true, 'closing cancels a pending native/browser fix');
}
{
  const h = harness('pin-sheet.tsx');
  h.render(h.exports.default, { start: latest, onLocate: async () => { throw new Error('unavailable'); }, onConfirm() {} });
  find(h.tree, 'PinMap').onReady(); h.render();
  find(h.tree, 'Button', 'Use location').onPress(); await flush(); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, false, 'a failed retry keeps the visible saved or manual pin confirmable');
  h.unmount();
}
console.log('Pickup sheet: fresh fix, visible camera agreement, gesture/close cancellation, failure/retry and saved-pin preservation passed');
{
  const h = harness('pin-sheet.tsx'); let rejectOld, resolveNew, starts = 0;
  h.render(h.exports.default, { start: first, autoLocate: true, onConfirm() {}, onLocate: () => ++starts === 1
    ? new Promise((_resolve, reject) => { rejectOld = reject; }) : new Promise(resolve => { resolveNew = resolve; }) });
  find(h.tree, 'PinMap').onGesture(); h.render();
  find(h.tree, 'Button', 'Use location').onPress(); h.render();
  rejectOld(new Error('unavailable')); await flush(); h.render();
  assert.equal(find(h.tree, 'Button', 'Locating')?.loading, true, 'an aborted request cannot clear a newer location attempt');
  resolveNew(latest); await flush(); h.render();
  find(h.tree, 'PinMap').onReady(); find(h.tree, 'PinMap').onChange(latest); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, false);
  h.unmount();
}
{
  const h = harness('pin-sheet.tsx');
  h.render(h.exports.default, { start: first, autoLocate: true, onLocate: async () => latest, onConfirm() {} });
  find(h.tree, 'PinMap').onReady(); await flush(); h.render();
  h.deadline(20_000); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, true, 'a camera timeout cannot confirm an unseen GPS target');
  assert.ok(JSON.stringify(h.tree).includes('Positioning failed'));
  find(h.tree, 'PinMap').onGesture(); find(h.tree, 'PinMap').onChange(first); h.render();
  assert.equal(find(h.tree, 'Button', 'Confirm pin').disabled, false, 'manual selection recovers after timeout');
  h.unmount();
}
{
  const h = harness('pin-sheet.tsx', false, { still: true });
  h.render(h.exports.default, { start: first, onConfirm() {} });
  assert.equal(h.tree.props.animationType, 'none', 'reduced motion disables the picker slide');
  h.unmount();
}
{
  const h = harness('pin-sheet.tsx'); const requests = [];
  h.render(h.exports.default, { start: first, autoLocate: true, onLocate: async (_signal, canRequest) => {
    requests.push(canRequest); throw new Error('prompt');
  }, onConfirm() {} });
  await flush(); h.render();
  assert.deepEqual(requests, [false], 'automatic opening only checks existing permission');
  find(h.tree, 'Button', 'Use location').onPress(); await flush(); h.render();
  assert.deepEqual(requests, [false, true], 'system permission is requested only by the location button');
  h.unmount();
}
{
  const h = harness('map-page.native.tsx'); const changed = [];
  const props = { config: { mode: 'pin', center: first }, height: 320, update: { center: first }, onFail() {}, onCenter: point => changed.push(point) };
  h.render(h.exports.MapPage, props);
  assert.equal(find(h.tree, 'WebView').source.uri.split('#')[0], 'https://api.example.test/map/v1/map.html');
  h.render(undefined, { ...props, update: { center: latest } });
  const message = value => find(h.tree, 'WebView').onMessage({ nativeEvent: { data: JSON.stringify(value) } });
  message({ type: 'drawing' });
  message({ type: 'center', ...first });
  assert.equal(changed.length, 0, 'initial city camera cannot overwrite GPS arriving before style load');
  h.render();
  assert.ok(h.host.injected.at(-1).includes(JSON.stringify(latest)));
  message({ type: 'center', ...latest });
  assert.deepEqual(plain(changed), [latest]);
  h.unmount();
}
{
  const h = harness('map-page.native.tsx'); let gestures = 0;
  const props = { config: { mode: 'pin', center: first }, height: 320, update: { center: first }, onFail() {}, onGesture() { gestures++; } };
  h.render(h.exports.MapPage, props);
  const message = value => find(h.tree, 'WebView').onMessage({ nativeEvent: { data: JSON.stringify(value) } });
  message({ type: 'drawing' }); h.render();
  h.render(undefined, { ...props, update: { center: latest } });
  assert.ok(h.host.injected.at(-1).includes(JSON.stringify(latest)), 'a late GPS fix crosses the Android bridge');
  const count = h.host.injected.length;
  message({ type: 'gesture' }); assert.equal(gestures, 1);
  message({ type: 'center', ...first });
  h.render(undefined, { ...props, update: { center: first } });
  assert.equal(h.host.injected.length, count, 'a reported gesture center is never echoed as a camera command');
  h.unmount();
}
{
  const h = harness('map-page.native.tsx'); const changed = [];
  const props = { config: { mode: 'pin', center: first }, height: 320, update: { center: first }, onFail() {}, onGesture() {}, onCenter: point => changed.push(point) };
  h.render(h.exports.MapPage, props);
  const message = value => find(h.tree, 'WebView').onMessage({ nativeEvent: { data: JSON.stringify(value) } });
  message({ type: 'drawing' }); h.render();
  const count = h.host.injected.length;
  message({ type: 'gesture' });
  message({ type: 'ready' }); h.render();
  assert.equal(h.host.injected.length, count, 'readiness alone never re-sends the old camera over a drag');
  const dragged = { latitude: 31.91, longitude: 35.21 };
  message({ type: 'center', ...dragged });
  assert.deepEqual(plain(changed), [dragged], 'a drag that outlives tile loading still reports its centre');
  // The sheet growing or a new GPS dot changes the update, not the camera: the centre already sent must not pull the map back.
  const sent = h.host.injected.length;
  h.render(undefined, { ...props, update: { center: first, insets: { bottom: 120 } } });
  assert.equal(h.host.injected.length, sent + 1, 'the other fields still cross');
  assert.ok(!h.host.injected.at(-1).includes('"center"') && h.host.injected.at(-1).includes('"insets"'), 'a centre already sent is not a camera command');
  message({ type: 'gesture' });
  const moved = { latitude: 31.92, longitude: 35.22 };
  h.render(undefined, { ...props, update: { center: first, insets: { bottom: 130 } } });
  message({ type: 'center', ...moved });
  assert.deepEqual(plain(changed.at(-1)), moved, 'another field changing never re-arms the guard over a gesture');
  // Back to the trip and into the pin again at the spot just reported: the page must still be told, or it returns to an older
  // centre, the guard refuses what it then reports, and Confirm waits forever.
  h.render(undefined, { ...props, update: { mode: 'route', center: moved } });
  h.render(undefined, { ...props, update: { mode: 'pin', center: moved } });
  assert.ok(h.host.injected.at(-1).includes(JSON.stringify(moved)), 'entering a mode carries the centre even when it matches the last report');
  h.unmount();
}
for (const file of ['google-map.native.tsx', 'route-map.native.tsx']) {
  const h = harness(file); const changed = [];
  const props = { center: first, onChange: point => changed.push(point) };
  h.render(file === 'google-map.native.tsx' ? h.exports.PinMap : h.exports.TestPin, props);
  const initial = find(h.tree, 'MapView'); (initial.onMapLoaded ?? initial.onMapReady)(); h.render();
  h.render(undefined, { ...props, center: latest });
  assert.deepEqual(plain(h.host.regions.at(-1)), { ...latest, latitudeDelta: 0.01, longitudeDelta: 0.01 }, file + ' camera follows a changed center');
  find(h.tree, 'MapView').onRegionChangeComplete(first);
  assert.equal(changed.length, 0, 'old native region completion cannot replace the target');
  find(h.tree, 'MapView').onRegionChangeComplete(latest);
  assert.deepEqual(plain(changed.at(-1)), latest);
  const count = h.host.regions.length;
  h.render(undefined, { ...props, center: latest });
  assert.equal(h.host.regions.length, count, 'native camera completion does not cause feedback');
  const manual = { latitude: 31.95, longitude: 35.25 };
  h.render(undefined, { ...props, center: first });
  find(h.tree, 'MapView').onPanDrag();
  find(h.tree, 'MapView').onRegionChangeComplete(manual);
  assert.deepEqual(plain(changed.at(-1)), manual, file + ' drag during a pending camera move reports the dragged centre');
  if (file === 'google-map.native.tsx') { // Google: a pinch reaches React only as a gesture-driven camera start
    let gestures = 0; const pinched = { latitude: 31.97, longitude: 35.27 };
    h.render(undefined, { ...props, center: latest, onGesture: () => gestures++ });
    find(h.tree, 'MapView').onRegionChangeStart(pinched, { isGesture: false });
    assert.equal(gestures, 0, 'a programmatic camera start is not a gesture');
    find(h.tree, 'MapView').onRegionChangeStart(pinched, { isGesture: true });
    find(h.tree, 'MapView').onRegionChangeComplete(pinched);
    assert.equal(gestures, 1, 'a Google pinch counts as a gesture');
    assert.deepEqual(plain(changed.at(-1)), pinched, 'a Google pinch during a pending GPS camera reports the pinched centre');
  }
  if (file === 'route-map.native.tsx') { // Apple: a pinch reaches React only as a touch
    let gestures = 0; const pinched = { latitude: 31.97, longitude: 35.27 };
    h.render(undefined, { ...props, center: latest, onGesture: () => gestures++ });
    find(h.tree, 'MapView').onTouchStart();
    find(h.tree, 'MapView').onRegionChangeComplete(pinched);
    assert.equal(gestures, 1, 'an Apple pinch counts as a gesture');
    assert.deepEqual(plain(changed.at(-1)), pinched, 'an Apple pinch during a pending GPS camera reports the pinched centre');
  }
  h.unmount();
}
{
  const page = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  const source = page.slice(page.indexOf('function centerPin('), page.indexOf('// Faded while the fix is old'));
  let current = { lat: first.latitude, lng: first.longitude }, jumps = 0;
  const context = { announcedReady: false, still: () => false, validPoint: p => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180,
    map: { getCenter: () => current, jumpTo({ center }) { jumps++; current = { lng: center[0], lat: center[1] }; } } };
  runInNewContext(source + ';globalThis.centerPin = centerPin;', context);
  context.centerPin(latest); context.centerPin(latest);
  assert.equal(jumps, 1, 'Android pin page applies a new center exactly once');
  context.centerPin({ latitude: NaN, longitude: 200 }); assert.equal(jumps, 1, 'invalid bridge center cannot move the map');
}
console.log('Native pin cameras: Android bridge updates without echo, Apple/Google late centers and old-event guards passed');
function retry(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Pressable') return node.props.onPress;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) { const found = retry(child); if (found) return found; }
}

{
  const h = harness();
  h.render(h.exports.PinMap, { center: first, onChange() {} });
  h.unmount(); h.resolveSdk(); await flush();
  assert.equal(h.maps.length, 0, 'SDK resolution after unmount cannot attach a new map');
  assert.equal(h.host.children.length, 0);
}
{
  const h = harness(); let failed = 0, ready = 0, changed = 0;
  const props = { center: first, onFail: () => failed++, onReady: () => ready++, onChange: () => changed++ };
  h.render(h.exports.PinMap, props);
  h.render(undefined, { ...props, center: latest }); // GPS changes while the SDK is still loading.
  h.resolveSdk(); await flush();
  assert.deepEqual(plain(h.maps[0].options.center), { lat: latest.latitude, lng: latest.longitude });
  assert.equal(h.host.children.length, 1);
  h.deadline(); h.render();
  assert.equal(failed, 1, 'constructed map without tiles must fail after the deadline');
  h.maps[0].emit('tilesloaded'); h.maps[0].emit('idle'); h.render();
  assert.equal(ready, 0, 'late tiles cannot revive a failed attempt');
  assert.equal(changed, 0, 'a failed attempt cannot keep reporting map centers');
  const press = retry(h.tree); assert.equal(typeof press, 'function'); press(); h.render(); await flush();
  assert.equal(h.maps.length, 2);
  assert.ok(h.maps[0].cleared, 'retry removes old SDK listeners');
  assert.equal(h.host.children.length, 1, 'retry removes the old map DOM instead of stacking maps');
  h.maps[1].emit('tilesloaded'); h.render();
  assert.equal(ready, 1, 'new tiles restore readiness');
  h.deadline(); h.render(); assert.equal(failed, 1, 'ready maps cancel the tile deadline');
  h.unmount(); assert.equal(h.host.children.length, 0, 'cleanup works even after the host ref is detached');
}
{
  const h = harness();
  const initial = { pickup: first, dropoff: latest, pickupTitle: 'A', dropoffTitle: 'B', road: [] };
  h.render(h.exports.default, initial);
  const road = [[35.2, 31.9], [35.25, 32.0], [35.3, 32.2]];
  h.render(undefined, { ...initial, road }); // Geometry arrives before the delayed SDK resolves.
  h.resolveSdk(); await flush();
  assert.deepEqual(plain(h.lines[0].path), road.map(([lng, lat]) => ({ lat, lng })),
    'the initialized route uses geometry received during SDK loading');
  h.unmount(); assert.equal(h.host.children.length, 0);
  assert.equal(h.lines[0].map, null, 'route overlays are detached on unmount');
}
{
  // A route map that never draws tiles reports one terminal failure to its provider boundary, through the latest callback.
  const h = harness(); let reported = 0;
  const route = { pickup: first, dropoff: latest, pickupTitle: 'A', dropoffTitle: 'B', road: [], onFail: () => reported++ };
  h.render(h.exports.default, route);
  h.resolveSdk(); await flush();
  h.deadline(); h.render(); h.render(undefined, { ...route });
  assert.equal(reported, 1, 'the route map reports its tile deadline to the boundary exactly once');
  h.unmount();
}
{
  const h = harness('map-mode.ts', true);
  let choice = h.render(h.exports.useMapMode); await flush(); choice = h.render();
  assert.equal(choice[0], 'baseline', 'blocked storage keeps the safe default');
  await choice[1]('google'); choice = h.render();
  assert.equal(choice[0], 'google', 'a denied storage write still preserves the session choice');
  h.unmount();
}
console.log('Google web lifecycle: tile deadline/retry, detached DOM cleanup, latest center/geometry and denied map-mode storage passed');
for (const times of [[10, 100, 600], [400, 600]]) {
  const h = harness();
  const props = { pickup: first, dropoff: latest, driver: { ...first, heading: 350 } };
  h.render(h.exports.default, props); h.resolveSdk(); await flush(); h.frame(0);
  const driver = h.overlays.find(overlay => overlay.options.icon?.path.includes('M 0 -12'));
  h.render(undefined, { ...props, driver: { ...first, heading: 10 } });
  for (const time of times) h.frame(time);
  assert.equal(driver.icon.rotation, 10, 'heading reaches its target regardless of frame count');
  h.unmount();
}

{
  const failures = require('../src/map-failures.ts');
  failures.retryMapProviders();
  const h = harness('map-provider-boundary.tsx'); let ready = 0, pinFailed = 0;
  let moved = 0;
  h.render(h.exports.MapProviderBoundary, { platform:'web', pin:{center:first,onChange(){moved++;},onReady(){ready++;},onFail(){pinFailed++;}}, google:'Google', baseline:'Baseline' });
  const primary=h.tree.props; assert.equal(h.tree.type,'Google');
  primary.onFail(); h.render();
  const fallback=h.tree.props; assert.equal(h.tree.type,'Baseline');
  primary.onChange(first); assert.equal(moved,0,'a retired attempt cannot move the pin');
  fallback.onChange(first); assert.equal(moved,1);
  assert.equal(pinFailed,0,'a failure with a fallback left does not flash the pin as unavailable');
  primary.onReady(); assert.equal(ready,0,'failed provider cannot enable a fallback pin');
  fallback.onReady(); assert.equal(ready,1);
  fallback.onFail(); h.render();
  assert.equal(pinFailed,1,'only the exhausted policy fails the pin');
  const press=retry(h.tree); assert.equal(typeof press,'function','exhaustion shows explicit Retry');
  press(); h.render();
  assert.equal(h.tree.type,'Google');
  primary.onFail(); h.render();
  assert.equal(h.tree.type,'Google','old attempt cannot poison the retry');
  const latest=h.tree.props; h.unmount(); latest.onFail();
  failures.retryMapProviders();
}

{
  const h = harness('route-map.native.tsx', false, { still: true });
  const props = { pickup: first, dropoff: latest, driver: first, focus: 'dropoff', insets: { top: 80, bottom: 220, right: 340 } };
  h.render(h.exports.TestRoute, props);
  assert.deepEqual(plain(h.host.fits.at(-1)), { points: [first, latest], options: {
    animated: false, edgePadding: { top: 152, bottom: 292, right: 412, left: 72 },
  } });
  h.render(undefined, { ...props, insets: { top: 80, bottom: 0, left: 340 } });
  assert.deepEqual(plain(h.host.fits.at(-1).options.edgePadding), { top: 152, bottom: 72, right: 72, left: 412 },
    'Apple route framing must reapply a left sheet inset without waiting for a new driver fix');
  let current = { ...props, insets: { top: 80, bottom: 0, left: 340 } };
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const count = h.host.fits.length;
    current = { ...current, insets: { ...current.insets, [side]: (current.insets[side] ?? 0) + 10 } };
    h.render(undefined, current);
    assert.equal(h.host.fits.length, count + 1, `Apple framing responds to ${side} inset alone`);
    assert.equal(h.host.fits.at(-1).options.edgePadding[side], 72 + current.insets[side]);
  }
  find(h.tree, 'MapView').onPanDrag(); h.render();
  const count = h.host.fits.length;
  h.render(undefined, { ...current, insets: {} });
  assert.equal(h.host.fits.length, count, 'inset changes cannot undo the user camera gesture');
  h.unmount();
}

for (const kind of ['route', 'pin']) for (const insets of [{ top: 80, bottom: 220 }, { top: 80, left: 340 }, { top: 80, right: 340 }, {}]) for (const fill of [false, true]) {
  const failures = require('../src/map-failures.ts');
  failures.retryMapProviders();
  const h = harness('map-provider-boundary.tsx');
  const map = kind === 'route' ? { pickup: first, dropoff: latest, pickupTitle: 'A', dropoffTitle: 'B' }
    : { center: first, onChange() {} };
  h.render(h.exports.MapProviderBoundary, { platform: 'web', [kind]: { ...map, height: 280, fill, insets }, google: 'Google', baseline: 'Baseline' });
  h.tree.props.onFail(); h.render(); h.tree.props.onFail(); h.render();
  const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const frame = flatten(h.tree.props.style);
  if (fill) assert.deepEqual(plain(frame), { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#E6ECE3' }, 'exhausted maps must still fill the screen');
  else { assert.equal(frame.height, 280); assert.equal(frame.width, '100%'); }
  const retry = find(h.tree, 'Pressable');
  const look = flatten(retry.style);
  assert.ok(look.minHeight >= 48 && look.minWidth >= 48, 'provider Retry must carry a 48dp box');
  assert.deepEqual(plain(look.transform), [{ translateX: ((insets.left ?? 0) - (insets.right ?? 0)) / 2 }, { translateY: ((insets.top ?? 0) - (insets.bottom ?? 0)) / 2 }],
    'provider Retry must stay in the inset-visible region for route and pin maps');
  retry.onPress(); h.render(); assert.equal(h.tree.type, 'Google');
  h.unmount(); failures.retryMapProviders();
}
