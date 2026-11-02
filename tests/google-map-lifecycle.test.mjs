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
function harness(file = 'google-map.web.tsx', deniedStorage = false) {
  const slots = [], pending = [], timers = new Map(), maps = [], lines = [], hostRefs = new Set();
  let cursor = 0, serial = 0, component, props, tree, loadResolve;
  const loading = new Promise(resolve => { loadResolve = resolve; });
  const element = () => ({ style: {}, children: [], addEventListener() {}, removeEventListener() {}, appendChild(child) { child.parent = this; this.children.push(child); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); } });
  const host = element();
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
    constructor(options) { this.options = options; this.map = options.map; this.path = options.path; if ('path' in options) lines.push(this); }
    setMap(map) { this.map = map; }
    setPath(path) { this.path = path; }
    setVisible() {}
    setOpacity() {}
    setCenter() {}
    setRadius() {}
    setPosition() {}
    setIcon() {}
    set() {}
  }
  const sdk = { Map: MapStub, Polyline: Overlay, Circle: Overlay, Marker: Overlay,
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    LatLngBounds: class { constructor() { this.points = []; } extend(point) { this.points.push(point); } },
    event: { clearInstanceListeners(map) { map.cleared = true; map.listeners.forEach(listener => listener.remove()); } },
  };
  const modules = { react, 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable',
    Platform: { OS: 'web' }, StyleSheet: { create: value => value, absoluteFill: {} } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, './map-math': math, './route-preview': { __esModule: true, default: 'RoutePreview' },
    './ui': { palette: {}, shadow: {}, useCopy: () => ({ c: { retry: 'Retry' } }) },
    './google-maps-loader': { loadGoogleMaps: () => loading }, './web-storage': storage,
    'expo-secure-store': {},
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { googleMaps: { web: true } } } } },
    './map-mode': { useMapMode: () => ['google', () => {}], currentMapMode: () => 'google' },
    './map-provider': require('../src/map-provider.ts'),
    './runtime-config': { effectiveRuntime: () => ({ mapProviders: { initialMapProvider: 'baseline' } }), subscribeRuntime: () => () => {} },
    './map-failures': require('../src/map-failures.ts'),
  };
  const context = { exports: {}, require: name => modules[name] ?? require(name), process: { env: {} },
    document: { createElement: element }, setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: () => ++serial, cancelAnimationFrame() {}, performance };
  if (deniedStorage) Object.defineProperty(context, 'localStorage', { get() { throw new Error('Storage denied'); } });
  const source = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, context, { filename: file });
  function attach(node) { if (!node || typeof node !== 'object') return;
    if (node.props?.ref) { node.props.ref.current = host; hostRefs.add(node.props.ref); }
    const children = node.props?.children; for (const child of Array.isArray(children) ? children : [children]) attach(child); }
  const render = (nextComponent = component, nextProps = props) => {
    component = nextComponent; props = nextProps; cursor = 0; tree = component(props); attach(tree);
    while (pending.length) pending.shift()();
    return tree;
  };
  return { exports: context.exports, host, maps, lines, sdk, render,
    resolveSdk: () => loadResolve(sdk),
    deadline() { for (const [id, timer] of [...timers]) if (timer.delay === 25_000) { timers.delete(id); timer.fn(); } },
    get tree() { return tree; },
    unmount() { for (const ref of hostRefs) ref.current = null;
      for (const slot of slots) slot?.cleanup?.(); },
  };
}
function retry(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Pressable') return node.props.onPress;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) { const found = retry(child); if (found) return found; }
}

const first = { latitude: 31.9, longitude: 35.2 }, latest = { latitude: 32.2, longitude: 35.3 };
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
