import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import ts from 'typescript';
import * as notice from '../src/phone/notice.ts'; // pure, so the real one runs
import { createProtectedRecovery } from '../src/protected-recovery.ts';
import * as chatOutbox from '../src/chat-outbox.ts'; // pure, so the real one runs

const source = ts.transpileModule(readFileSync(new URL('../src/session.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const noop = async () => {};
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }

function session({ failKey, failure, token = 'saved-token', summary = null, platform = 'android', accounts = {} }) {
  const slots = [], timers = new Map(), values = new Map(), listeners = new Map(), calls = [];
  if (token) values.set('token', token);
  let cursor = 0, effects = [], revision = 0, modeRevision, credential = null, actor = null, failedRead = failKey, failedWrite = null, pauseRemoval = null, pauseRecord = null, pausePresence = null, pauseTokenRemoval = null, pauseBeforeDelete = null, pauseMe = null, meFailure = null, unauthorized = null, lockTail = Promise.resolve();
  let pauseTracking = null, trackingError = null, switchResponse = null, localPushDrops = 0, pausePushDrop = null;
  const pushBindings = [], retiredPush = [];
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
      const profileRead = path === '/me' || path === '/me?launch=1';
      if (profileRead && pauseMe) { const held = pauseMe, requested = credential; pauseMe = null; held.started(); await held.promise; return accounts[requested]; }
      if (profileRead && meFailure) throw meFailure;
      if (profileRead && accounts[credential]) return accounts[credential];
      if (path === '/session/mode' && switchResponse) return switchResponse();
      if (path === '/runtime/configuration') return {};
      throw failure; }, errorCode: e => e instanceof ApiError ? e.message : 'server_error',
      configureApi(next, onUnauthorized) { if (credential !== next) { modeRevision = undefined; revision++; } credential = next; unauthorized = onUnauthorized; }, invalidateApiSessionActions() { revision++; }, storage },
    './api-client': { apiSessionCredential: () => credential, apiSessionRevision: () => revision,
      configureApiModeRevision(next) { if (modeRevision !== next) revision++; modeRevision = next; }, serverOffset: () => 0 },
    './offline-recovery': { configureRecoveryActor(next) { if (actor && next !== actor) revision++; actor = next; }, savedOfflineSummary: async () => summary },
    './recovery-storage': { recoveryStorage: recovery, pendingRecoveryWake: async () => null, acknowledgeRecoveryWake: async () => {} },
    './chat-outbox': chatOutbox,
    // A14 wake handling has its own suite (deadline-recovery); here no native wake is ever pending.
    './deadline-wake': { deadlineWake: { clear: async () => {}, subscribe: () => ({ remove() {} }) } },
    './deadline-recovery': { createDeadlineReconciler: () => async () => {} }, './map-failures': { retryMapProviders() {} },
    './runtime-config': { resetRuntime() {}, configureRuntime() {}, effectiveRuntime: () => ({ values: { offlineMaxAgeMs: 60_000 } }) }, './client-diagnostics': { clientDiagnostics: { record() {}, clear() {} } },
    './diagnostic-client': { startDiagnosticDelivery: () => () => {} }, './phone-test': { phoneTestConfig: () => null },
    './push': {
      async dropLocalPush() {
        if (pausePushDrop) { pausePushDrop.started(); await pausePushDrop.promise; }
        localPushDrops++;
        retiredPush.push(credential);
      },
      refreshPush: async () => { pushBindings.push(credential); },
    },
    './native-push': { registerNativePush: noop, unregisterNativePush: noop },
    './copy': { copy: { ar: { sessionEndedNotice: 'ended' }, en: { sessionEndedNotice: 'ended' } } }, './phone/notice': notice,
    './background-location': { stopBackgroundLocation: async () => {
      if (pauseTracking) { const held = pauseTracking; pauseTracking = null; held.started(); await held.promise; }
      if (trackingError) throw trackingError;
    } }, './driver-presence-runtime': { suspendPresence() {}, stopPresence: async () => { if (pausePresence) { pausePresence.started(); await pausePresence.promise; } }, validatePresenceContextOnLaunch: noop },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, Date,
    window: { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) }, document: { documentElement: {} },
    setInterval: () => 1, clearInterval() {}, setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) };
  runInNewContext(source, context);
  return {
    render() { cursor = 0; effects = []; const tree = context.exports.SessionProvider({ children: null }); effects.forEach(fn => fn()); return tree.props.value; },
    expire(ms) { for (const [id, timer] of [...timers]) if (timer.delay <= ms) { timers.delete(id); timer.fn(); } },
    credential: () => credential, stored: key => values.get(key) ?? null, localPushDrops: () => localPushDrops, calls, pushBindings, retiredPush,
    recoveryRecords: () => [...values.keys()].filter(key => key.startsWith('wind.recovery.v1.') && !key.endsWith('.index')),
    failRead(key) { failedRead = key; },
    failWrite(key) { failedWrite = key; },
    failMe(error) { meFailure = error; },
    pauseMe(pending) { pauseMe = pending; },
    pauseTracking(pending) { pauseTracking = pending; },
    failTracking(error) { trackingError = error; },
    onSwitch(fn) { switchResponse = fn; },
    pausePresence(pending) { pausePresence = pending; },
    pausePushDrop(pending) { pausePushDrop = pending; },
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

{
  const personal = { ...account(1), accountProfile: { mode: 'personal', revision: 2 } };
  const h = session({ platform: 'android', accounts: { 'saved-token': personal } });
  const stopping = gate();
  h.pauseTracking(stopping);
  h.failTracking(new Error('native stop still failing after process restart'));
  h.render(); await stopping.entered;
  assert.ok(h.calls.some(call => call.path === '/me?launch=1'), 'server availability is cleared independently of native cleanup');
  assert.equal(h.render().me, null);
  stopping.resolve();
  await settle();
  assert.equal(h.render().ready, true);
  assert.equal(h.render().locationCleanupRequired, true);
  assert.equal(h.render().me, null, 'startup waits for native location cleanup');
  h.failTracking(null);
  await h.render().refresh(true);
  assert.equal(h.render().locationCleanupRequired, false);
  assert.equal(h.render().me, personal);
  h.close();
}

{
  const h = session({ platform: 'android', failure: new ApiError('unauthorized', 401) });
  const stopping = gate();
  h.pauseTracking(stopping);
  h.failTracking(new Error('native stop failed after a 401'));
  h.render(); await stopping.entered;
  h.expireSession(); await settle();
  assert.equal(h.render().ready, false, 'a revoked session cannot render sign-in while native cleanup is pending');
  stopping.resolve(); await settle();
  assert.equal(h.render().ready, true);
  assert.equal(h.render().locationCleanupRequired, true);
  assert.equal(h.render().me, null);
  h.failTracking(null);
  await h.render().refresh(true);
  assert.equal(h.render().locationCleanupRequired, false, 'retry also works after the revoked token has been removed');
  assert.equal(notice.takeAuthNotice(), 'ended');
  h.close();
}

{
  const captain = { ...account(1), user: { ...account(1).user, role: 'driver' }, accountProfile: { mode: 'captain', revision: 1 } };
  const h = session({ platform: 'android', accounts: { 'saved-token': captain } });
  h.render(); await settle();
  assert.equal(h.render().me, captain);
  const stopping = gate(), deleting = gate();
  h.pauseTracking(stopping);
  h.pauseBeforeDelete(deleting);
  h.expireSession();
  await Promise.all([stopping.entered, deleting.entered]);
  stopping.resolve(); await settle();
  assert.equal(h.stored('token'), 'saved-token', 'SecureStore deletion is still pending after location cleanup');
  assert.equal(h.render().me, null, 'a revoked Captain cannot resume tracking while its token is still stored');
  assert.equal(h.render().ready, false, 'sign-in stays gated while the API still holds the revoked token');
  const requests = h.calls.length;
  await h.render().refresh(true);
  assert.equal(h.render().me, null, 'a refresh cannot restore the revoked account during teardown');
  assert.equal(h.calls.length, requests, 'a refresh skips the revoked credential');
  deleting.resolve(); await settle();
  assert.equal(h.credential(), null);
  assert.equal(h.stored('token'), null);
  assert.equal(h.render().ready, true, 'sign-in opens after the revoked API credential is detached');
  assert.equal(h.render().locationCleanupRequired, false);
  assert.equal(notice.takeAuthNotice(), 'ended');
  h.close();
}

{
  const other = account(2), h = session({ platform: 'web', accounts: { 'saved-token': account(1), 'new-token': other } });
  h.render(); await settle(); h.render();
  const otherTab = gate(), held = h.holdLock(otherTab);
  h.expireSession();
  await h.replaceInOtherTab('new-token', false);
  otherTab.resolve(); await held; await settle();
  assert.equal(h.stored('token'), 'new-token');
  assert.equal(h.localPushDrops(), 0, 'revocation must preserve a replacement tab’s browser subscription before its storage event arrives');
  h.deliverToken('new-token'); await settle();
  assert.equal(h.render().me, other);
  assert.equal(h.render().ready, true);
  assert.equal(h.pushBindings.at(-1), 'new-token', 'a replacement binds its notifications without visiting settings');
  assert.equal(notice.takeAuthNotice(), 'ended');
  h.close();
}

{
  const profile = (mode, revision) => ({ ...account(1), accountProfile: { mode, revision },
    user: { ...account(1).user, role: mode === 'captain' ? 'driver' : 'customer' } });
  const accounts = { 'saved-token': profile('captain', 1) };
  const h = session({ accounts });
  h.render(); await settle(); h.render(); await settle();
  const stopping = gate(); h.pauseTracking(stopping);
  accounts['saved-token'] = profile('personal', 2);
  const refreshing = h.render().refresh(true);
  await stopping.entered;
  assert.equal(h.render().me.accountProfile.mode, 'captain', 'a refresh waits until native tracking stops');
  accounts['saved-token'] = profile('captain', 3);
  await h.render().refresh(true);
  stopping.resolve(); await refreshing;
  assert.equal(h.render().me.accountProfile.revision, 3, 'cleanup cannot let an older response replace a newer mode');
  h.onSwitch(() => {
    accounts['saved-token'] = profile('personal', 4);
    throw new ApiError('server_error', 502);
  });
  h.failTracking(new Error('native stop failed'));
  await assert.rejects(h.render().switchMode('personal'), /profile_location_cleanup/);
  assert.equal(h.render().locationCleanupRequired, true);
  assert.equal(h.render().me.accountProfile.mode, 'captain');
  h.failTracking(null);
  await h.render().refresh(true);
  assert.equal(h.render().locationCleanupRequired, false);
  assert.equal(h.render().me.accountProfile.mode, 'personal', 'a truncated switch response reconciles from the server');
  h.close();
}

{
  const captain = { ...account(1), user: { ...account(1).user, role: 'driver' }, accountProfile: { mode: 'captain', revision: 1 } };
  const h = session({ platform: 'android', accounts: { 'saved-token': captain } });
  h.render(); await settle();
  assert.equal(h.render().me, captain);
  const stopping = gate();
  h.pauseTracking(stopping);
  h.failTracking(new Error('native stop failed after Captain session was revoked'));
  h.expireSession();
  await stopping.entered; await settle();
  assert.equal(h.credential(), null, 'native stop must not delay clearing a revoked credential');
  assert.equal(h.render().me, null);
  assert.equal(h.render().locationCleanupRequired, true);
  stopping.resolve(); await settle();
  assert.equal(h.render().locationCleanupRequired, true, 'revocation retains the failed cleanup gate');
  h.failTracking(null);
  await h.render().refresh(true);
  assert.equal(h.render().locationCleanupRequired, false);
  assert.equal(notice.takeAuthNotice(), 'ended');
  h.close();
}

{
  const h = session({ accounts: { 'saved-token': account(1) } });
  h.render(); await settle(); await h.seed('command', { order: 'pending' });
  assert.equal(h.calls.filter(call => call.path === '/me?launch=1').length, 1, 'only the restored launch clears Captain availability');
  h.failMe(new ApiError('network'));
  await h.render().refresh();
  assert.equal(h.render().offline, false, 'background refresh must stay quiet under a loaded form');
  await assert.rejects(h.render().refresh(true), /network/, 'explicit availability Retry must report failure');
  assert.equal(notice.takeAuthNotice(), null, 'a network failure is not a session end');
  assert.equal(h.render().me.user.id, 1);
  assert.equal((await h.read('command')).order, 'pending');
  h.close();
}
{
  const h = session({ accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  const pending = gate(); h.pauseMe(pending);
  const refreshing = h.render().refresh(true); await pending.entered;
  await h.render().signIn({ ...account(2), token: 'new-token' });
  pending.resolve(); await refreshing;
  assert.equal(h.render().me.user.id, 2, 'late explicit refresh cannot restore the previous account');
  h.close();
}

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
  notice.setAuthNotice('stale');
  await h.render().signOut();
  assert.equal(notice.takeAuthNotice(), null, 'a normal sign-out drops a pending notice');
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
{
  const h = session({ platform: 'web', accounts: { 'saved-token': account(1) } });
  h.render(); await settle(); h.render();
  h.failRead('token');
  h.expireSession(); await settle();
  assert.equal(h.credential(), null);
  assert.equal(h.render().me, null);
  assert.equal(h.render().ready, true);
  assert.equal(h.localPushDrops(), 0, 'a failed storage read cannot prove ownership of the shared endpoint');
  assert.equal(notice.takeAuthNotice(), 'ended');
  h.close();
}
for (const platform of ['android', 'web']) {
  const h = session({ platform, accounts: { 'saved-token': account(1) } });
  h.render(); await settle();
  await h.seed('command', { order: 'pending' });
  h.expireSession(); await settle();
  assert.equal(notice.takeAuthNotice(), 'ended', `${platform}: a 401 leaves the sign-in notice, once`);
  assert.equal(notice.takeAuthNotice(), null);
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
  const other = account(2), h = session({ platform: 'web', accounts: { 'saved-token': account(1), 'new-token': other } });
  h.render(); await settle(); h.render();
  const push = gate(); h.pausePushDrop(push);
  const logout = h.render().signOut();
  await push.entered;
  const signIn = h.signInOtherTab('new-token');
  await settle();
  assert.equal(h.stored('token'), 'saved-token', 'replacement sign-in waits for the old browser unsubscribe');
  push.resolve(); await logout; await signIn;
  assert.deepEqual(h.retiredPush, ['saved-token'], 'unlinking push uses the old account only');
  h.deliverToken('new-token'); await settle();
  assert.equal(h.render().me, other);
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

{
  const pushSource = ts.transpileModule(readFileSync(new URL('../src/push.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let token = 'first', tail = Promise.resolve(), bindError = null, unsubscribeError = null, afterPermission = null, beforeUnsubscribe = null;
  const saved = new Map();
  const requests = [], bindAttempts = [], unsubscribed = [];
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
    options: {},
    toJSON() { return { endpoint: this.endpoint, keys: {} }; },
    async unsubscribe() {
      if (unsubscribeError) throw unsubscribeError;
      unsubscribed.push(token);
      return true;
    },
  };
  const registration = { pushManager: { getSubscription: async () => subscription } };
  const storage = {
    exclusive(work) { const next = tail.then(work); tail = next.catch(() => {}); return next; },
    get: async key => key === 'token' ? token : saved.get(key) ?? null,
    set: async (key, value) => { if (value === null) saved.delete(key); else saved.set(key, value); },
  };
  const modules = {
    'react-native': { Platform: { OS: 'web' } },
    './api-client': { apiSessionCredential: () => token },
    './api': { ApiError, storage, api: async (path, body) => {
      requests.push([path, token]);
      if (path === '/push/unsubscribe' && beforeUnsubscribe) { beforeUnsubscribe.started(); await beforeUnsubscribe.promise; }
      if (path === '/push/subscribe') {
        bindAttempts.push([body.bindSession, saved.has('wind.webPushBinding')]);
        if (bindError) throw bindError;
      }
      return { key: 'AA' };
    } },
  };
  const context = { exports: {}, require: name => modules[name], atob, btoa, crypto, TextEncoder,
    window: { PushManager: {}, Notification: {} },
    Notification: { requestPermission: async () => { afterPermission.started(); await afterPermission.promise; return 'granted'; } },
    navigator: { serviceWorker: { getRegistration: async () => registration, register: noop, ready: Promise.resolve(registration) } },
  };
  runInNewContext(pushSource, context);
  const { enablePush, disablePush, dropLocalPush, refreshPush } = context.exports;
  afterPermission = gate();
  const enabling = enablePush('en');
  await afterPermission.entered;
  await storage.exclusive(async () => { token = 'second'; });
  afterPermission.resolve();
  await assert.rejects(enabling, /session_changed/);
  assert.deepEqual(requests, [], 'a permission reply cannot enable push for the account that replaced it');

  bindError = new ApiError('network');
  await assert.rejects(refreshPush('en'), /network/);
  assert.deepEqual(unsubscribed, [], 'an existing legacy subscription survives its first renewal failure');
  assert.deepEqual(bindAttempts, [[true, true]], 'the browser records its fingerprint before asking for a session-specific bind');

  bindError = Object.assign(new ApiError('session_changed', 401), { servedStatus: 200 });
  await refreshPush('en');
  assert.deepEqual(unsubscribed, [], 'a profile revision change preserves a successful same-token bind');
  bindError = new ApiError('network');
  await assert.rejects(refreshPush('en'), /network/);
  assert.deepEqual(unsubscribed, [], 'temporary failure preserves a binding already confirmed for this token');

  unsubscribeError = new Error('browser refused unsubscribe');
  await assert.rejects(storage.exclusive(dropLocalPush), /browser refused unsubscribe/);
  assert.equal(saved.has('wind.webPushBinding'), true, 'a failed unsubscribe leaves the previous binding on record');
  unsubscribeError = null;

  await storage.exclusive(async () => { token = 'third'; });
  await assert.rejects(refreshPush('en'), /network/);
  assert.deepEqual(unsubscribed, ['third'], 'a failed rebind retires the endpoint when ownership changed');

  beforeUnsubscribe = gate();
  const disabling = disablePush();
  await beforeUnsubscribe.entered;
  const replacement = storage.exclusive(async () => { token = 'fourth'; });
  await settle();
  assert.equal(token, 'third', 'settings unsubscribe and token replacement share the lock');
  beforeUnsubscribe.resolve();
  await disabling; await replacement;
  assert.deepEqual(requests, [['/push/subscribe', 'second'], ['/push/subscribe', 'second'], ['/push/subscribe', 'second'], ['/push/subscribe', 'third'], ['/push/unsubscribe', 'third']]);
  assert.deepEqual(unsubscribed, ['third', 'third']);
}
