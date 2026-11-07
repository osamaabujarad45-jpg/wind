import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), model = require('../src/model.ts'), copy = require('../src/copy.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const summaryModule = require('../src/offline-summary.ts');
function harness(file, modules, expose = '') {
  const slots = [], timers = new Map(); let cursor = 0, effects = [], tree;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) { const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useCallback(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!equal(old?.deps, deps)) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    createContext: () => ({ Provider: 'SessionProvider' }),
  };
  const all = { react: { ...react, __esModule: true, default: react },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, ...modules };
  const context = { exports: {}, process: { env: {} }, Date, AbortController,
    require: name => { assert.ok(name in all, `missing stub ${name}`); return all[name]; },
    setTimeout(fn, delay) { const key = {}; timers.set(key, { fn, delay }); return key; }, clearTimeout: key => timers.delete(key),
    setInterval: () => 1, clearInterval() {} };
  const source = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'),
    { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source + expose, context, { filename: file });
  return { exports: context.exports, render(component = context.exports.default) { cursor = 0; effects = []; tree = component({ children: null }); effects.forEach(fn => fn()); return tree; },
    expire(delay) { for (const [key, timer] of [...timers]) if (timer.delay <= delay) { timers.delete(key); timer.fn(); } },
    close() { slots.forEach(slot => slot?.cleanup?.()); } };
}
function find(node, type, title) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type && (!title || node.props.title === title)) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type, title); if (found) return found; }
}
const now = Date.now(), order = { id: 11, customerId: 2, driverId: 7, service: 'parcel', status: 'assigned', pickupCity: 'ramallah', dropoffCity: 'nablus' };
{
  let saved = null, revision = 0;
  const h = harness('offline-recovery.ts', {
    './api-client': { apiSessionRevision: () => revision, invalidateApiSessionActions: () => revision++, serverOffset: () => 0 },
    './offline-summary': summaryModule,
    './recovery-storage': { recoveryStorage: { read: async () => saved, write: async (_key, value) => { saved = value; } } },
    './runtime-config': { effectiveRuntime: () => ({ values: { offlineMaxAgeMs: 60_000 } }) },
  });
  const { configureRecoveryActor, cacheOrderSummaries } = h.exports;
  configureRecoveryActor({ id: 7, role: 'driver', status: 'active' });
  await cacheOrderSummaries([order, { ...order, id: 12 }], true);
  await cacheOrderSummaries([{ ...order, status: 'in_transit' }]);
  assert.deepEqual(plain(saved.orders).map(o => o.id), [11, 12], 'detail refresh preserves other current work');
  await cacheOrderSummaries([{ ...order, id: 12 }], true);
  assert.deepEqual(plain(saved.orders).map(o => o.id), [12], 'complete snapshots remove omitted assignments');
  await cacheOrderSummaries([], true); assert.equal(saved.orders.length, 0, 'empty complete list clears stale work');
  await cacheOrderSummaries([order]); await cacheOrderSummaries([{ ...order, status: 'completed' }]);
  assert.equal(saved.orders.length, 0, 'terminal detail removes the cached assignment');
  const pending = cacheOrderSummaries([order]); configureRecoveryActor(null); await pending;
  assert.equal(saved.orders.length, 0, 'logout fences queued writes');
}
for (const language of ['en', 'ar']) {
  let session = { ready: true, offline: true, offlineSummary: summaryModule.offlineSummary(7, 'driver', [order], now), me: null, refresh() {} };
  const c = copy.copy[language];
  const h = harness('app/_layout.tsx', {
    'react-native': { View: 'View', StyleSheet: { create: x => x, absoluteFill: {} } },
    'expo-router': { Stack: { Protected: 'Protected', Screen: 'Route' } }, 'expo-status-bar': {},
    'expo-splash-screen': { preventAutoHideAsync() {} }, '../motion': {}, '../intro': {}, '../driver-work': {},
    '../session': { useSession: () => session }, '../model': model,
    '../parts': { statusText: copy.statusText, useFormat: () => ({ time: () => 'saved-time' }) },
    '../ui': { Button: 'Button', Card: 'Card', Empty: 'Empty', Screen: 'Screen', Txt: 'Txt', palette: {}, fill: copy.fill,
      useCopy: () => ({ c, language, rtl: language === 'ar' }) },
  }, '\nexports.TestRoutes = Routes;');
  let tree = h.render(h.exports.TestRoutes), text = JSON.stringify(tree);
  assert.ok(text.includes(c.offlineSavedTitle) && text.includes(c.offlineSavedWarning));
  assert.equal(find(tree, 'Button'), undefined, 'summary offers no authenticated actions'); // Retry is passed to Empty's action slot.
  assert.ok(text.includes(language === 'ar' ? '←' : '→'));
  assert.doesNotMatch(text, /handoverCode|driverPhone|pickupNote/);
  session = { ...session, me: { user: { id: 99, role: 'driver', status: 'active' } } };
  assert.equal(find(h.render(h.exports.TestRoutes), 'Card'), undefined, 'another actor cannot see the summary');
  session = { ...session, me: { user: { id: 7, role: 'driver', status: 'blocked' } } };
  assert.equal(find(h.render(h.exports.TestRoutes), 'Card'), undefined, 'a blocked actor cannot see the summary');
  h.close();
}
{
  const summary = summaryModule.offlineSummary(7, 'driver', [order], now), noop = async () => {};
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  let offline = true, revision = 0, rejectRefresh;
  const modules = {
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-localization': { getLocales: () => [{ languageCode: 'en' }] }, 'expo-constants': { __esModule: true, default: { expoConfig: {} } },
    './api': { API_URL: 'http://localhost', api: async path => {
      if (offline === 'pending') return new Promise((_resolve, reject) => { rejectRefresh = reject; });
      if (offline === 'server') throw new ApiError('server_error', 503);
      if (offline) throw new Error('network');
      return path === '/me' ? { user: { id: 7, role: 'driver', status: 'active' } } : {};
    }, ApiError, errorCode: e => e.message, configureApi() {}, invalidateApiSessionActions() { revision++; },
      storage: { get: async key => key === 'token' ? 'token' : null, set: noop } },
    './api-client': { apiSessionCredential: () => 'token', apiSessionRevision: () => revision, serverOffset: () => 0 },
    './offline-recovery': { configureRecoveryActor() {}, savedOfflineSummary: async () => summary },
    './recovery-storage': { recoveryStorage: { clear: noop } }, './map-failures': { retryMapProviders() {} },
    './runtime-config': { resetRuntime() {}, configureRuntime() {}, effectiveRuntime: () => ({ values: { offlineMaxAgeMs: 60_000 } }) },
    './client-diagnostics': { clientDiagnostics: { record() {}, clear() {} } }, './diagnostic-client': { startDiagnosticDelivery: () => () => {} },
    './phone-test': { phoneTestConfig: () => null }, './push': { disablePush: noop, dropLocalPush: noop },
    './native-push': { registerNativePush: noop }, './background-location': { stopBackgroundLocation: noop },
    './driver-presence-runtime': { stopPresence: noop, validatePresenceContextOnLaunch: noop },
  };
  const h = harness('session.tsx', modules);
  h.render(h.exports.SessionProvider); for (let i = 0; i < 5; i++) { await flush(); h.render(h.exports.SessionProvider); }
  assert.equal(h.render(h.exports.SessionProvider).props.value.offlineSummary.actorId, 7);
  h.expire(60_000);
  assert.equal(h.render(h.exports.SessionProvider).props.value.offlineSummary, null, 'an open offline screen expires its snapshot');
  offline = false; await h.render(h.exports.SessionProvider).props.value.refresh();
  assert.equal(h.render(h.exports.SessionProvider).props.value.offlineSummary, null, 'online refresh clears the saved view');
  offline = true; await h.render(h.exports.SessionProvider).props.value.refresh();
  assert.equal(h.render(h.exports.SessionProvider).props.value.offlineSummary.actorId, 7, 'mid-session network failure restores saved context');
  offline = 'pending';
  const session = h.render(h.exports.SessionProvider).props.value, refresh = session.refresh();
  await session.forget(); rejectRefresh(new Error('network')); await refresh;
  assert.equal(h.render(h.exports.SessionProvider).props.value.offline, false, 'a late failure cannot reopen the offline view after sign-out');
  assert.equal(h.render(h.exports.SessionProvider).props.value.offlineSummary, null);
  h.close();
  for (const failedKey of ['token', 'language', 'onboarded']) {
    const startup = harness('session.tsx', { ...modules, './api': { ...modules['./api'], storage: {
      get: async key => { if (key === failedKey) throw new Error('Keystore read failed'); return null; }, set: noop,
    } } });
    startup.render(startup.exports.SessionProvider);
    for (let i = 0; i < 5; i++) await flush();
    const state = startup.render(startup.exports.SessionProvider).props.value;
    assert.equal(state.ready, true, `${failedKey} read failure cannot leave the app behind its intro forever`);
    assert.equal(state.me, null, 'unreadable credentials never authorize an account');
    startup.close();
  }
  offline = 'server';
  const failedServer = harness('session.tsx', { ...modules, './offline-recovery': { configureRecoveryActor() {}, savedOfflineSummary: async () => null } });
  failedServer.render(failedServer.exports.SessionProvider);
  for (let i = 0; i < 5; i++) await flush();
  const state = failedServer.render(failedServer.exports.SessionProvider).props.value;
  assert.equal(state.ready, true);
  assert.equal(state.offline, true, 'a transient server failure retains the signed-in retry path');
  failedServer.close();
}
{
  let revision = 1, calls = 0;
  const c = copy.copy.en, noop = async () => {};
  const ui = Object.fromEntries(['Appear','Avatar','Badge','Button','Card','ErrorText','Field','FilterChips','Header','ListGroup','ListRow','Press','Row','Screen','Txt'].map(name => [name, name]));
  const h = harness('parts.tsx', {
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: value => value }, View: 'View', Share: {} },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-router': { router: {} },
    './api': { api: async () => { calls++; }, apiSessionRevision: () => revision, errorCode: e => e.message },
    './push': { pushSupported: () => false }, './model': model, './booking': {}, './map-math': {},
    './session': { useSession: () => ({ me: { user: { id: 1, role: 'customer', name: 'Fixture', phone: '0599000000' } }, forget: noop, signOut: noop, language: 'en', setLanguage() {} }) },
    './entra-auth': { entraConfigured: false }, './copy': copy,
    './ui': { ...ui, palette: {}, tones: {}, confirm: (_text, yes) => yes(), useCopy: () => ({ c, err: () => '' }), haptic: { error() {} } },
  });
  const visit = (node, type, prop, value) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === type && node.props[prop] === value) return node.props;
    for (const child of [node.props?.children].flat(Infinity)) { const found = visit(child, type, prop, value); if (found) return found; }
  };
  visit(h.render(h.exports.AccountScreen), 'ListRow', 'label', c.deleteAccount).onPress();
  visit(h.render(h.exports.AccountScreen), 'Field', 'label', c.currentPassword).onChangeText('fixture-password');
  const stale = visit(h.render(h.exports.AccountScreen), 'Button', 'title', c.deleteAccount);
  revision++;
  stale.onPress(); await flush();
  assert.equal(calls, 0, 'a stale delete callback must not act under a replacement session');
  h.close();
}
{
  class ApiError extends Error {}
  let calls = [], prompts = 0, complete, failures = 0;
  const user = { id: 7, role: 'driver', status: 'active', name: 'Driver', vehicle: 'car', permanentlyApprovedAt: now };
  const ui = Object.fromEntries(['Appear','Badge','Button','Card','Choices','Empty','ErrorText','Field','FilterChips','Header','Loading','Row','Screen','Txt'].map(name => [name, name]));
  const h = harness('app/admin/users.tsx', {
    '../../session': { useSession: () => ({ me: { user: { id: 1 } } }) }, 'react-native': { View: 'View' }, '../../model': model,
    '../../parts': { useFormat: () => ({ date: () => '', time: () => '' }) },
    '../../api': { ApiError, useApi: () => ({ data: [user], reload: async () => {} }), api: async (_path, body) => {
      calls.push(body); if (++failures === 1) throw new ApiError('carrying_parcels'); await new Promise(resolve => { complete = resolve; });
    } },
    '../../ui': { ...ui, fill: copy.fill, useCopy: () => ({ c: copy.copy.en, err: e => e.message }), palette: {}, tones: { active: {} },
      haptic: { success() {}, error() {} }, confirm: (_message, yes) => { prompts++; yes(); } },
  });
  let tree = h.render(), block = find(tree, 'Button', copy.copy.en.block);
  await block.onPress(); await flush(); tree = h.render();
  assert.equal(prompts, 1); assert.equal(calls.length, 2); assert.equal(calls[1].recovery, 'return');
  assert.equal(find(tree, 'Button', copy.copy.en.block).disabled, true, 'recovery request retains its busy state');
  await block.onPress(); assert.equal(calls.length, 2, 'stale button callbacks cannot submit again');
  complete(); await flush();
  assert.equal(find(h.render(), 'Button', copy.copy.en.block).disabled, false);
  h.close();
}
console.log('Quality review: complete-list cache replacement, readonly offline AR/EN, expiry, actor isolation and admin recovery serialization passed');
