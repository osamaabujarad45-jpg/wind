import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(initialState = 'active') {
  const slots = [], listeners = new Set(), calls = [], held = [];
  let cursor = 0, effects = [], dirty, order, result, mode = 'google', hold = false;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }];
    },
    useCallback(fn, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, fn }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++, old = slots[index];
      if (!equal(old?.deps, deps)) effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
  };
  const appState = { currentState: initialState, addEventListener(_event, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const modules = { react, 'react-native': { AppState: appState, Platform: { OS: 'android' }, View: 'View' },
    'react/jsx-runtime': { jsx() {}, jsxs() {} }, '@expo/vector-icons': {},
    'expo-router': { useFocusEffect: fn => react.useEffect(fn, [fn]) },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { googleMaps: { android: true } } } } },
    './api-client': { apiSessionRevision: () => 0, errorCode: error => error.message,
      request: async url => { calls.push(new URL(url)); if (hold && url.includes('/route/google?')) await new Promise(resolve => held.push(resolve));
        return { provider: url.includes('/route/google?') ? 'google' : 'osrm', minutes: 2, km: 1, line: [] }; } },
    './offline-recovery': { cacheOrderSummaries() {} }, './wire-contracts': {}, './storage': {},
    './map-provider': require('../src/map-provider.ts'), './map-math': require('../src/map-math.ts'), './model': require('../src/model.ts'),
    './location-state': { publicFixAgeMs: () => 0, publicFixClock: () => ({}) }, './api-clock': { deadlineSeconds: () => 60 },
    './map-mode': { useMapMode: () => [mode] }, './ui': {},
  };
  function load(file) {
    const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; },
      process: { env: {} }, Date, performance, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} };
    const source = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'),
      { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, context, { filename: file }); return context.exports;
  }
  modules['./api'] = load('api.ts');
  const { useRoad } = load('road.tsx');
  const render = (next = order) => {
    order = next; let attempts = 0;
    do { assert.ok(++attempts < 20, 'render converges'); cursor = 0; effects = []; dirty = false; result = useRoad(order); } while (dirty);
    for (const effect of effects) effect();
    return result;
  };
  return { render, calls, held, setHold: value => { hold = value; }, setMode: value => { mode = value; },
    google: () => calls.filter(url => url.pathname === '/api/route/google'),
    async settle() { await flush(); render(); await flush(); return render(); },
    state(value) { appState.currentState = value; for (const listener of [...listeners]) listener(value); render(); },
    close() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const first = { latitude: 31.9, longitude: 35.2, updatedAt: Date.now() };
const order = { id: 1, status: 'assigned', pickupCity: 'ramallah', dropoffCity: 'nablus', driverId: 3, driverLocation: first };
{
  const h = harness(); h.render(order); await h.settle();
  assert.equal(h.google().length, 1);
  for (let i = 0; i < 3; i++) { h.state('background'); await h.settle(); h.state('active'); await h.settle(); }
  assert.equal(h.google().length, 1, 'background/foreground bounces do not repeat a Google request');
  h.state('background');
  h.render({ ...order, driverLocation: { ...first, latitude: first.latitude + 0.003 } }); await h.settle();
  h.render({ ...order, driverLocation: { ...first, latitude: first.latitude + 0.004 } }); await h.settle();
  assert.equal(h.google().length, 1, 'background movement makes no request');
  h.state('active'); await h.settle();
  assert.equal(h.google().length, 2);
  assert.equal(h.google().at(-1).searchParams.get('from'), '31.90400,35.20000', 'resume requests the current fix');
  assert.equal(h.google().at(-1).searchParams.get('metres'), '442', 'movement is measured from the last foreground request');
  h.state('background'); h.render({ ...order, id: 2 }); await h.settle();
  assert.equal(h.google().length, 2, 'a new order while backgrounded waits for foreground');
  h.state('active'); await h.settle(); assert.equal(h.google().length, 3);
  h.close();
}
{
  const h = harness(); h.setHold(true); h.render(order); await h.settle();
  h.state('background'); await h.settle(); h.state('active'); await h.settle();
  assert.equal(h.google().length, 1, 'foreground return does not duplicate an in-flight Google request');
  h.held.forEach(resolve => resolve()); await h.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.render().eta)), [2, 5], 'the pending response is retained across a background bounce');
  h.close();
}
{
  const h = harness('background'); h.render(order); await h.settle(); assert.equal(h.google().length, 0);
  h.state('active'); await h.settle(); assert.equal(h.google().length, 1, 'background mounts wait until visible');
  h.close();
}
{
  const h = harness(); h.setMode('baseline'); h.render(order); await h.settle();
  const before = h.calls.length;
  h.state('background'); h.state('active'); await h.settle();
  assert.ok(h.calls.length > before, 'free route endpoints keep their foreground refresh');
  assert.equal(h.google().length, 0, 'baseline mode never requests Google geometry');
  h.close();
}
console.log('Road focus: stable Google URLs, foreground movement baselines, pending responses and background mounts passed');
