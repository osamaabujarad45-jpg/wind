import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { copy } from '../src/copy.ts';
import * as failureModule from '../src/map-failures.ts';
import * as providerModule from '../src/map-provider.ts';
import { configureRuntime, resetRuntime } from '../src/runtime-config.ts';
import { effectiveMapProvider, canShowOnRenderer, selectRenderer } from '../src/map-provider.ts';
import { recordMapFailure, retryMapProviders } from '../src/map-failures.ts';
import { clientConfiguration } from '../server/domain/runtime-readiness.ts';
resetRuntime(); retryMapProviders();
assert.equal(effectiveMapProvider('android', { android:true }).renderer, 'maplibre', 'missing preference/configuration retains the safe baked baseline');
const config = clientConfiguration({ WIND_CLIENT_CONFIGURATION: JSON.stringify({ mapProviders: { initialMapProvider:'google',fallbackMapProviders:['baseline'],missingProviderDefault:'baseline' } }) });
configureRuntime(config);
let selected = effectiveMapProvider('android', { android:true }); assert.equal(selected.renderer, 'google');
recordMapFailure(selected.key, 'google'); selected = effectiveMapProvider('android', { android:true });
assert.equal(selected.renderer, 'maplibre'); assert.equal(selected.didFallback, true);
assert.equal(canShowOnRenderer('google', selected.renderer), false, 'provider fallback never licenses old geometry');
recordMapFailure(selected.key, 'maplibre'); assert.equal(effectiveMapProvider('android', { android:true }).renderer, null, 'exhaustion is terminal');
assert.equal(selectRenderer('android', {android:true}),null,'actual consumers preserve terminal exhaustion');
const previousGeneration=selected.generation;
retryMapProviders(selected.key); assert.equal(effectiveMapProvider('android', { android:true }).renderer, 'google');
recordMapFailure(selected.key, 'google', previousGeneration);
assert.equal(effectiveMapProvider('android', {android:true}).renderer,'google','late callback cannot poison explicit retry');
assert.equal(canShowOnRenderer('osrm',null),false);
selected = effectiveMapProvider('android', { android:true }, 'google', true); assert.equal(selected.renderer, 'maplibre');
recordMapFailure(selected.key, 'maplibre'); assert.equal(effectiveMapProvider('android', { android:true }, 'google', true).renderer, null, 'public maps never fall back to paid provider');
resetRuntime(); retryMapProviders();
// MapProviderBoundary owns the map attempt. When every renderer has failed it must recover on its own: the browser coming
// back online (web) or the app becoming active (native). It also shows Retry in a way that fits the preview's box.
// This runs the real TSX with stubbed hooks, modules, window and AppState; it does not render pixels.
function pathTo(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return [node];
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = pathTo(child, type);
    if (found) return [node, ...found];
  }
  return null;
}
function boundaryHarness() {
  const slots = [], listeners = { window: [], app: [] };
  let cursor = 0, effects = [], platform = 'web';
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!equal(old?.deps, deps)) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const detach = (list, type, listener) => { const at = list.findIndex(item => item.type === type && item.listener === listener); if (at >= 0) list.splice(at, 1); };
  const windowTarget = {
    addEventListener: (type, listener) => { listeners.window.push({ type, listener }); },
    removeEventListener: (type, listener) => detach(listeners.window, type, listener),
  };
  const all = {
    react: { ...react, __esModule: true, default: react },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', Platform: { get OS() { return platform; } },
      AppState: { currentState: 'active', addEventListener: (type, listener) => { listeners.app.push({ type, listener }); return { remove() { detach(listeners.app, type, listener); } }; } } },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: {} } } },
    './map-provider': providerModule, './map-failures': failureModule,
    './map-mode': { useMapMode: () => [undefined, () => {}] },
    './route-preview': { __esModule: true, default: 'RoutePreview' },
    './ui': { palette: {}, useCopy: () => ({ c: copy.en }) },
  };
  const context = { exports: {}, process: { env: {} }, window: windowTarget,
    addEventListener: windowTarget.addEventListener, removeEventListener: windowTarget.removeEventListener,
    require: name => { assert.ok(name in all, `missing stub ${name}`); return all[name]; } };
  const source = ts.transpileModule(readFileSync(new URL('../src/map-provider-boundary.tsx', import.meta.url), 'utf8'),
    { fileName: 'map-provider-boundary.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, context, { filename: 'map-provider-boundary.tsx' });
  return {
    listeners,
    render(props) {
      platform = props.platform; cursor = 0; effects = [];
      const tree = context.exports.MapProviderBoundary(props);
      effects.forEach(run => run());
      return tree;
    },
    fire(scope, type, value) { for (const item of [...listeners[scope]]) if (item.type === type) item.listener(value); },
  };
}
const failures = [];
async function check(name, body) {
  try { await body(); } catch (error) { failures.push(`${name}\n  ${String(error.message).split('\n')[0]}`); }
}
const adapter = () => null;
  const route = { pickup: { latitude: 31.9, longitude: 35.2 }, dropoff: { latitude: 32.2, longitude: 35.26 }, height: 150 };

await check('web map recovers when the browser comes back online', () => {
  resetRuntime(); retryMapProviders();
  // Web: the only renderer failed. The browser coming back online restores the map with no reload.
  const web = boundaryHarness();
  const webChoice = effectiveMapProvider('web');
  recordMapFailure(webChoice.key, 'maplibre', webChoice.generation);
  assert.equal(web.render({ platform: 'web', render: adapter }).type, 'View', 'with its only renderer failed, the boundary shows the exhausted state');
  assert.ok(web.listeners.window.some(item => item.type === 'online'), 'an exhausted web map listens for the browser coming back online');
  web.fire('window', 'online', {});
  assert.equal(web.render({ platform: 'web', render: adapter }).type, adapter, 'the browser coming back online restores the web map');

});
await check('native map recovers when the app becomes active', () => {
  resetRuntime(); retryMapProviders();
  // Native: leaving the app does not spend a retry; the app becoming active does.
  const native = boundaryHarness();
  const androidChoice = effectiveMapProvider('android');
  recordMapFailure(androidChoice.key, 'maplibre', androidChoice.generation);
  assert.equal(native.render({ platform: 'android', render: adapter }).type, 'View', 'with its only renderer failed, the native boundary shows the exhausted state');
  assert.ok(native.listeners.app.some(item => item.type === 'change'), 'an exhausted native map listens for the app becoming active');
  native.fire('app', 'change', 'background');
  assert.equal(native.render({ platform: 'android', render: adapter }).type, 'View', 'leaving the app does not retry the map');
  native.fire('app', 'change', 'active');
  assert.equal(native.render({ platform: 'android', render: adapter }).type, adapter, 'the app becoming active restores the native map');

});
await check('exhausted map Retry overlays the 150px preview', () => {
  resetRuntime(); retryMapProviders();
  // Exhausted in a 150px box: Retry must overlay the preview, not stack under it and overflow the container.
  const overlay = boundaryHarness();
  const exhausted = effectiveMapProvider('web');
  recordMapFailure(exhausted.key, 'maplibre', exhausted.generation);
  const tree = overlay.render({ platform: 'web', route, render: adapter });
  assert.equal(tree.props.style.height, 150, 'the exhausted state keeps the 150px box');
  const retryPath = pathTo(tree, 'Pressable');
  assert.ok(retryPath, 'the exhausted state offers Retry');
  assert.ok(retryPath.slice(1).some(node => node.props.style?.position === 'absolute'),
    'Retry is absolutely positioned over the preview instead of overflowing the 150px container');
  resetRuntime(); retryMapProviders();
});
if (failures.length) throw new Error(`${failures.length} exhausted-map regression(s) failed:\n${failures.join('\n')}`);
console.log('Effective map provider fallback/exhaustion, public scope, route provenance, attempt isolation, exhausted recovery and Retry overlay passed');
