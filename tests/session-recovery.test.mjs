import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import ts from 'typescript';
import { createProtectedRecovery } from '../src/protected-recovery.ts';

const source = ts.transpileModule(readFileSync(new URL('../src/session.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const noop = async () => {};
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }

function session({ failKey, failure, token = 'saved-token', summary = null, platform = 'android', accounts = {} }) {
  const slots = [], timers = new Map(), values = new Map(), listeners = new Map(), calls = [];
  if (token) values.set('token', token);
  let cursor = 0, effects = [], revision = 0, credential = null, actor = null, failedRead = failKey, failedWrite = null, pauseRemoval = null, pauseRecord = null, pausePresence = null, pauseTokenRemoval = null, pauseBeforeDelete = null, unauthorized = null, lockTail = Promise.resolve();
  const storage = {
    exclusive(run) { const next = lockTail.then(run); lockTail = next.catch(() => {}); return next; },
    async get(key, required = false) { if (key === failedRead && (platform !== 'web' || required)) throw new Error('keystore'); return values.get(key) ?? null; },
    async set(key, value, required = false) {
      if (key === 'token' && value === null && pauseBeforeDelete) { const pending = pauseBeforeDelete; pauseBeforeDelete = null; pending.started(); await pending.promise; }
      if (failedWrite === key && (platform !== 'web' || required)) throw new Error('keystore');
      if (failedWrite === key) return;
      if (value === null) values.delete(key); else values.set(key, value);
      if (key === 'token' && value === null && pauseTokenRemoval) { const pending = pauseTokenRemoval; pauseTokenRemoval = null; pending.started(); await pending.promise; }
    },
  };
  const recoveryIO = {
    read: key => storage.get(key, true),
    async write(key, value) {
      if (value === null && pauseRemoval) { const pending = pauseRemoval; pauseRemoval = null; pending.started(); await pending.promise; }
      if (value !== null && key.endsWith('.command') && pauseRecord) { const pending = pauseRecord; pauseRecord = null; pending.started(); await pending.promise; }
      await storage.set(key, value, true);
    },
    credential: async () => credential, currentCredential: async token => await storage.get('token', true) === token,
    revision: () => revision, now: Date.now, namespace: async token => createHash('sha256').update(token).digest('hex'),
    async seal(text, token, slot) { const iv = randomBytes(12), key = createHash('sha256').update(token + slot).digest();
      const cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]).toString('base64'); },
    async open(text, token, slot) { const bytes = Buffer.from(text, 'base64'), key = createHash('sha256').update(token + slot).digest();
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString(); },
  };
  const recovery = createProtectedRecovery(recoveryIO);
  const externalRecovery = createProtectedRecovery(recoveryIO);
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
    'react-native': { Platform: { OS: platform }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-localization': { getLocales: () => [{ languageCode: 'en' }] }, 'expo-constants': { __esModule: true, default: { expoConfig: {} } },
    './api': { API_URL: 'http://localhost', ApiError, api: async path => { calls.push({ path, credential });
      if (path === '/me' && accounts[credential]) return accounts[credential];
      if (path === '/runtime/configuration') return {};
      throw failure; }, errorCode: e => e instanceof ApiError ? e.message : 'server_error',
      configureApi(next, onUnauthorized) { if (credential !== next) revision++; credential = next; unauthorized = onUnauthorized; }, invalidateApiSessionActions() { revision++; }, storage },
    './api-client': { apiSessionCredential: () => credential, apiSessionRevision: () => revision, serverOffset: () => 0 },
    './offline-recovery': { configureRecoveryActor(next) { if (actor && next !== actor) revision++; actor = next; }, savedOfflineSummary: async () => summary },
    './recovery-storage': { recoveryStorage: recovery }, './map-failures': { retryMapProviders() {} },
    './runtime-config': { resetRuntime() {}, configureRuntime() {}, effectiveRuntime: () => ({ values: { offlineMaxAgeMs: 60_000 } }) }, './client-diagnostics': { clientDiagnostics: { record() {}, clear() {} } },
    './diagnostic-client': { startDiagnosticDelivery: () => () => {} }, './phone-test': { phoneTestConfig: () => null },
    './push': { disablePush: noop, dropLocalPush: noop }, './native-push': { registerNativePush: noop, unregisterNativePush: noop },
    './background-location': { stopBackgroundLocation: noop }, './driver-presence-runtime': { stopPresence: async () => { if (pausePresence) { pausePresence.started(); await pausePresence.promise; } }, validatePresenceContextOnLaunch: noop },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, Date,
    window: { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) }, document: { documentElement: {} },
    setInterval: () => 1, clearInterval() {}, setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) };
  runInNewContext(source, context);
  return {
    render() { cursor = 0; effects = []; const tree = context.exports.SessionProvider({ children: null }); effects.forEach(fn => fn()); return tree.props.value; },
    expire(ms) { for (const [id, timer] of [...timers]) if (timer.delay <= ms) { timers.delete(id); timer.fn(); } },
    credential: () => credential, stored: key => values.get(key) ?? null, calls,
    recoveryRecords: () => [...values.keys()].filter(key => key.startsWith('wind.recovery.v1.') && !key.endsWith('.index')),
    failRead(key) { failedRead = key; },
    failWrite(key) { failedWrite = key; },
    pausePresence(pending) { pausePresence = pending; },
    pauseRemoval(pending) { pauseRemoval = pending; },
    pauseRecord(pending) { pauseRecord = pending; },
    pauseTokenRemoval(pending) { pauseTokenRemoval = pending; },
    pauseBeforeDelete(pending) { pauseBeforeDelete = pending; },
    expireSession() { unauthorized?.(); },
    // Another tab's sign-in takes the same cross-tab lock this tab's sign-out does.
    signInOtherTab: token => storage.exclusive(async () => { values.set('token', token); }),
    holdLock: pending => storage.exclusive(() => pending.promise),
    async replaceInOtherTab(token, deliver = true) { const oldValue = values.get('token') ?? null; values.set('token', token); if (deliver) listeners.get('storage')({ key: 'token', oldValue, newValue: token }); },
    deliverToken(token) { listeners.get('storage')({ key: 'token', newValue: token }); },
    seed: (slot, data, external = false) => (external ? externalRecovery : recovery).write(slot, data, 60_000),
    read: slot => recovery.read(slot),
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

const account = id => ({ user: { id, role: 'customer', status: 'active' }, plan: null, subscription: null, settings: {} });
const settle = async () => { for (let i = 0; i < 10; i++) await flush(); };
const gate = () => { let resolve, started; const promise = new Promise(r => { resolve = r; });
  const entered = new Promise(r => { started = r; }); return { promise, resolve, started, entered }; };

for (const platform of ['android', 'web']) {
  const h = session({ platform, token: null });
  h.render(); await settle();
  h.failWrite('token');
  await assert.rejects(h.render().signIn({ ...account(1), token: 'new-token' }), /session_save_failed/);
  assert.equal(h.credential(), null, `${platform}: a failed registration save must not authorize the API`);
  assert.equal(h.stored('token'), null);
  assert.equal(h.render().me, null);
  h.close();
}
for (const platform of ['android', 'web']) {
  const old = account(1), next = account(2);
  const h = session({ platform, accounts: { 'saved-token': old } });
  h.render(); await settle();
  await h.seed('command', { order: 'pending' });
  h.failWrite('token');
  await assert.rejects(h.render().signIn({ ...next, token: 'new-token' }), /session_save_failed/);
  assert.equal(h.credential(), 'saved-token', `${platform}: failed token write must preserve API authority`);
  assert.equal(h.stored('token'), 'saved-token');
  assert.equal(h.render().me.user.id, old.user.id);
  assert.equal((await h.read('command')).order, 'pending', 'failed sign-in must not erase the existing recovery record');
  h.close();
}
{
  const h = session({ platform: 'web', accounts: { 'saved-token': account(1) } });
  h.render(); await settle(); h.failRead('token');
  await assert.rejects(h.render().signOut(), /session_remove_failed/);
  assert.equal(h.credential(), 'saved-token');
  assert.equal(h.stored('token'), 'saved-token');
  assert.equal(h.render().me.user.id, 1);
  h.close();
}
{
  const h = session({ token: null, accounts: {} });
  h.render(); await settle();
  h.failWrite('onboarded');
  await h.render().signIn({ ...account(1), token: 'new-token' });
  assert.equal(h.credential(), 'new-token');
  assert.equal(h.stored('token'), 'new-token');
  assert.equal(h.render().me.user.id, 1, 'nonessential onboarding write must not report a successful sign-in as failed');
  h.close();
}
for (const platform of ['android', 'web']) {
  const old = account(1), h = session({ platform, accounts: { 'saved-token': old } });
  h.render(); await settle();
  h.failWrite('token');
  await assert.rejects(h.render().signOut(), /session_remove_failed/);
  assert.equal(h.stored('token'), 'saved-token', `${platform}: failed removal leaves a restorable credential`);
  assert.equal(h.credential(), 'saved-token');
  assert.equal(h.render().me.user.id, old.user.id, 'failed removal must not show a successful logout');
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false, 'do not revoke a session when its credential could not be removed');
  h.close();
}
{
  const h = session({ accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  await h.seed('command', { order: 'pending' });
  await h.seed('summary', { order: 'shown' });
  await h.render().signOut();
  assert.equal(h.stored('token'), null);
  assert.equal(h.credential(), null);
  assert.equal(h.render().me, null);
  assert.equal(h.recoveryRecords().length, 0, 'successful logout removes the old encrypted cache');
  assert.ok(h.calls.some(call => call.path === '/auth/logout' && call.credential === 'saved-token'));
  h.close();
}
{
  const old = account(1), next = account(2), h = session({ platform: 'web', accounts: { 'saved-token': old, 'new-token': next } });
  h.render(); await settle();
  const pending = gate(); h.pausePresence(pending);
  const logout = h.render().signOut();
  await pending.entered;
  await h.replaceInOtherTab('new-token'); await settle();
  await h.seed('command', { order: 'replacement' }, true);
  pending.resolve(); await logout; await settle();
  assert.equal(h.credential(), 'new-token');
  assert.equal(h.stored('token'), 'new-token');
  assert.equal(h.render().me.user.id, next.user.id);
  assert.equal((await h.read('command')).order, 'replacement');
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false, 'stale logout must not revoke the replacement');
  h.close();
}
{
  const h = session({ platform: 'web', accounts: { 'saved-token': account(1) }, failure: new ApiError('network') });
  h.render(); await settle(); h.render();
  await h.replaceInOtherTab('new-token'); await settle();
  assert.equal(h.render().offline, true, 'a replacement account that cannot load still gets the offline retry screen');
  h.close();
}
{
  const old = account(1), next = account(2), h = session({ platform: 'web', accounts: { 'saved-token': old, 'new-token': next } });
  h.render(); await settle();
  const pending = gate(); h.pauseTokenRemoval(pending);
  const logout = h.render().signOut(); await pending.entered;
  await h.replaceInOtherTab('new-token', false);
  pending.resolve(); await logout;
  assert.equal(h.stored('token'), 'new-token');
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false);
  h.deliverToken('new-token'); await settle();
  assert.equal(h.credential(), 'new-token');
  assert.equal(h.render().me.user.id, next.user.id);
  h.close();
}
{
  const old = account(1), next = account(2), h = session({ platform: 'web', accounts: { 'saved-token': old, 'new-token': next } });
  h.render(); await settle();
  const pending = gate(); h.pausePresence(pending);
  const logout = h.render().signOut(); await pending.entered;
  await h.replaceInOtherTab('new-token', false);
  pending.resolve(); await logout;
  assert.equal(h.stored('token'), 'new-token', 'a replacement is protected even before its storage event arrives');
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false);
  h.deliverToken('new-token'); await settle();
  assert.equal(h.render().me.user.id, next.user.id);
  h.close();
}
{
  const old = account(1), next = account(2), h = session({ platform: 'web', accounts: { 'saved-token': old, 'new-token': next } });
  h.render(); await settle();
  const pending = gate(); h.pauseRecord(pending);
  const oldWrite = h.seed('command', { order: 'old' }).then(() => null, error => error);
  await pending.entered;
  const logout = h.render().signOut();
  await settle();
  await h.replaceInOtherTab('new-token'); await settle();
  await h.seed('command', { order: 'replacement' }, true);
  pending.resolve();
  assert.match((await oldWrite).message, /session_changed/);
  await logout; await settle();
  assert.equal(h.credential(), 'new-token');
  assert.equal(h.stored('token'), 'new-token');
  assert.equal(h.render().me.user.id, next.user.id);
  assert.equal((await h.read('command')).order, 'replacement', 'a cleanup queued behind an old write must not clear the replacement cache');
  h.close();
}
{
  const old = account(1), next = account(2), h = session({ platform: 'web', accounts: { 'saved-token': old, 'new-token': next } });
  h.render(); await settle();
  await h.seed('command', { order: 'old' });
  const pending = gate(); h.pauseRemoval(pending);
  const logout = h.render().signOut();
  await pending.entered;
  await h.replaceInOtherTab('new-token'); await settle();
  await h.seed('command', { order: 'replacement' }, true);
  pending.resolve(); await logout; await settle();
  assert.equal(h.credential(), 'new-token');
  assert.equal(h.stored('token'), 'new-token');
  assert.equal(h.render().me.user.id, next.user.id);
  assert.equal((await h.read('command')).order, 'replacement', 'a delayed old cache deletion cannot delete the replacement cache');
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false);
  h.close();
}
for (const platform of ['android', 'web']) {
  const h = session({ platform, accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  await h.seed('command', { order: 'pending' });
  h.failWrite('token');
  await assert.rejects(h.render().signOut(), /session_remove_failed/);
  assert.equal((await h.read('command')).order, 'pending', `${platform}: a sign-out that could not remove the token keeps the recovery record of the session still open`);
  h.close();
}
for (const platform of ['android', 'web']) {
  const h = session({ platform, accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  await h.seed('command', { order: 'pending' });
  h.expireSession(); await settle();
  assert.equal(h.render().me, null, `${platform}: a 401 ends the session on screen`);
  assert.equal(h.credential(), null);
  assert.equal(h.stored('token'), null);
  assert.equal(h.recoveryRecords().length, 0, 'the ended session leaves no cache');
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false, 'a session the server already refused is not revoked again');
  h.close();
}
for (const platform of ['android', 'web']) {
  const h = session({ platform, accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  h.failWrite('token');
  h.expireSession(); await settle();
  assert.equal(h.render().me, null, `${platform}: a 401 must not leave a dead session on screen because storage refused the removal`);
  assert.equal(h.credential(), null, 'the refused credential stops being sent');
  assert.equal(h.stored('token'), 'saved-token', 'still stored: the server already refuses it, and the next launch retries the removal');
  h.close();
}
{
  // The window between reading the old token and deleting it: another tab's sign-in cannot land inside it.
  const next = account(2), h = session({ platform: 'web', accounts: { 'saved-token': account(1), 'new-token': next } });
  h.render(); await settle();
  const pending = gate(); h.pauseBeforeDelete(pending);
  const logout = h.render().signOut(); await pending.entered;
  const other = h.signInOtherTab('new-token');
  await settle();
  pending.resolve(); await logout; await other;
  assert.equal(h.stored('token'), 'new-token', 'a stale sign-out must not delete the token another tab just saved');
  h.deliverToken('new-token'); await settle();
  assert.equal(h.credential(), 'new-token');
  assert.equal(h.render().me.user.id, next.user.id);
  h.close();
}
{
  const h = session({ platform: 'web', token: null });
  h.render(); await settle();
  const pending = gate(); const held = h.holdLock(pending);
  const signedIn = h.render().signIn({ ...account(1), token: 'new-token' });
  await settle();
  assert.equal(h.stored('token'), null, 'sign-in waits for a sign-out running in another tab');
  pending.resolve(); await held; await signedIn;
  assert.equal(h.stored('token'), 'new-token');
  h.close();
}
{
  // Native sign-in racing sign-out on one device: the new session wins and is not revoked.
  const next = account(2), h = session({ accounts: { 'saved-token': account(1), 'new-token': next } });
  h.render(); await settle();
  const pending = gate(); h.pausePresence(pending);
  const logout = h.render().signOut(); await pending.entered;
  await h.render().signIn({ ...next, token: 'new-token' });
  pending.resolve(); await logout; await settle();
  assert.equal(h.stored('token'), 'new-token');
  assert.equal(h.credential(), 'new-token');
  assert.equal(h.render().me.user.id, next.user.id);
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false);
  h.close();
}
for (const platform of ['android', 'web']) {
  // The app calls forget after the server revoked the session: account deleted, phone changed. Storage refusing the delete cannot keep that account on screen.
  const h = session({ platform, accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  h.failWrite('token');
  await h.render().forget();
  assert.equal(h.render().me, null, `${platform}: a deleted account leaves the screen`);
  assert.equal(h.credential(), null);
  h.close();
}
{
  // Passed as an event handler, forget must not read the press event as a request to revoke.
  const h = session({ accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  await h.render().forget({ nativeEvent: {} });
  assert.equal(h.calls.some(call => call.path === '/auth/logout'), false);
  h.close();
}
console.log('Session recovery: failed removal keeps the recovery record, 401 always ends the session on screen, sign-out and sign-in serialize across tabs');
