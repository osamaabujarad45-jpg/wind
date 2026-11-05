import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/session.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const noop = async () => {};
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }

function session({ failKey, failure, token = 'saved-token', summary = null }) {
  const slots = [], timers = new Map(); let cursor = 0, effects = [], revision = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) { const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!same(old?.deps, deps)) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const modules = {
    react: { ...react, __esModule: true, default: react }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-localization': { getLocales: () => [{ languageCode: 'en' }] }, 'expo-constants': { __esModule: true, default: { expoConfig: {} } },
    './api': { API_URL: 'http://localhost', ApiError, api: async () => { throw failure; }, errorCode: e => e instanceof ApiError ? e.message : 'server_error',
      configureApi() {}, invalidateApiSessionActions() { revision++; }, storage: { get: async key => { if (key === failKey) throw new Error('keystore'); return key === 'token' ? token : null; }, set: noop } },
    './api-client': { apiSessionCredential: () => token, apiSessionRevision: () => revision, serverOffset: () => 0 },
    './offline-recovery': { configureRecoveryActor() {}, savedOfflineSummary: async () => summary },
    './recovery-storage': { recoveryStorage: { clear: noop } }, './map-failures': { retryMapProviders() {} },
    './runtime-config': { resetRuntime() {}, configureRuntime() {}, effectiveRuntime: () => ({ values: { offlineMaxAgeMs: 60_000 } }) }, './client-diagnostics': { clientDiagnostics: { record() {}, clear() {} } },
    './diagnostic-client': { startDiagnosticDelivery: () => () => {} }, './phone-test': { phoneTestConfig: () => null },
    './push': { disablePush: noop, dropLocalPush: noop }, './native-push': { registerNativePush: noop, unregisterNativePush: noop },
    './background-location': { stopBackgroundLocation: noop }, './driver-presence-runtime': { stopPresence: noop, validatePresenceContextOnLaunch: noop },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, Date,
    setInterval: () => 1, clearInterval() {}, setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) };
  runInNewContext(source, context);
  return {
    render() { cursor = 0; effects = []; const tree = context.exports.SessionProvider({ children: null }); effects.forEach(fn => fn()); return tree.props.value; },
    expire(ms) { for (const [id, timer] of [...timers]) if (timer.delay <= ms) { timers.delete(id); timer.fn(); } },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

for (const key of ['token', 'language', 'onboarded']) {
  const h = session({ failKey: key, token: null });
  h.render(); for (let i = 0; i < 5; i++) await flush();
  const state = h.render();
  assert.equal(state.ready, true, `${key} read failure must not leave the intro forever`);
  assert.equal(state.me, null, 'unreadable credentials never authorize an account');
  h.close();
}
{
  const h = session({ failure: new ApiError('server_error', 503) });
  h.render(); for (let i = 0; i < 5; i++) await flush();
  const state = h.render();
  assert.equal(state.ready, true);
  assert.equal(state.offline, true, 'server outage at restore must offer retry instead of sign-in');
  assert.equal(state.me, null);
  h.close();
}
console.log('Session recovery: storage failures complete startup and a 503 retains the retry path');
{
  const summary = { actorId: 7, role: 'driver', savedAt: Date.now(), orders: [] };
  const h = session({ failure: new ApiError('server_error', 503), summary });
  h.render(); for (let i = 0; i < 5; i++) await flush();
  assert.equal(h.render().offlineSummary, summary);
  h.expire(60_000);
  assert.equal(h.render().offlineSummary, null, 'an open offline screen must expire its cached snapshot');
  h.close();
}
