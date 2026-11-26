// Admin review regressions: the admin's five-tab bar, no self-delete offer the server always refuses, the profit chart
// revealing its newest day, and an expired phone challenge keeping its resend and reload errors visible.
// Each case runs the real screen source through the TypeScript transpiler with stubbed hooks and modules, the same
// harness quality-recovery.test.mjs uses. Every case reports its own failure, so one run shows each defect.
// The phone case lives here because this file is the one assigned to the review batch; it belongs beside
// phone-ui.test.mjs once that file may be edited.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as copyModule from '../src/copy.ts';
import * as model from '../src/model.ts';
import * as command from '../src/phone/command.ts';
import * as flow from '../src/phone/flow.ts';
import * as requests from '../src/phone/requests.ts';

const { copy, fill } = copyModule;
const copyEn = copy.en;
const flush = () => new Promise(resolve => setImmediate(resolve));
const failures = [];
async function check(name, body) {
  try { await body(); } catch (error) { failures.push(`${name}\n  ${String(error.message).split('\n').slice(0, 6).join('\n  ')}`); }
}

// Hooks run in call order and effects run after each render, so each render sees the state the previous one left.
function harness(file, modules, expose = '') {
  const slots = [], timers = new Map();
  let cursor = 0, effects = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const slot = slots[cursor++] ??= { value: typeof value === 'function' ? value() : value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useCallback(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useMemo(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!equal(old?.deps, deps)) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    createContext: () => ({ Provider: 'Provider' }),
  };
  const all = { react: { ...react, __esModule: true, default: react },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, ...modules };
  const context = { exports: {}, process: { env: {} }, Date, AbortController,
    require: name => {
      assert.ok(name in all, `missing stub ${name}`);
      const target = all[name];
      return typeof target === 'function' && target.__withReact ? target(react) : target;
    },
    setTimeout(fn, delay) { const key = {}; timers.set(key, { fn, delay }); return key; }, clearTimeout: key => timers.delete(key),
    setInterval: () => 1, clearInterval() {} };
  const source = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'),
    { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source + expose, context, { filename: file });
  return {
    exports: context.exports,
    render(component, props = { children: null }) { cursor = 0; effects = []; const tree = component(props); effects.forEach(run => run()); return tree; },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

// Every element of one type in a rendered tree, in document order.
function nodes(node, type, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.type === type) found.push(node);
  for (const child of [node.props?.children].flat(Infinity)) nodes(child, type, found);
  return found;
}

// 1. The admin account route is reached from Settings, not a sixth tab. TabBar hides a route by its name, so the admin
//    layout must hide the account route (or give it href: null); the route file itself must stay so it still opens.
await check('admin account route is not a sixth tab', () => {
  function Tabs(props) { return { type: Tabs, props }; }
  Tabs.Screen = 'Screen';
  const h = harness('app/admin/_layout.tsx', {
    'expo-router/js-tabs': { Tabs },
    '../../api': { useApi: () => ({ data: { pendingDrivers: 0, pendingSubscriptions: 0 } }) },
    '../../ui': { TabBar: 'TabBar', tabIcon: () => 'icon', useCopy: () => ({ c: copyEn }) },
  });
  const bar = h.render(h.exports.default);
  const hidden = bar.props.tabBar({}).props.hidden ?? [];
  const screens = new Map([bar.props.children].flat(Infinity).map(screen => [screen.props.name, screen.props.options ?? {}]));
  const routes = readdirSync(new URL('../src/app/admin/', import.meta.url))
    .filter(file => file.endsWith('.tsx') && !file.startsWith('_')).map(file => file.slice(0, -'.tsx'.length));
  const visible = routes.filter(name => !hidden.includes(name) && screens.get(name)?.href !== null);
  h.close();
  assert.ok(routes.includes('account'), 'the account route exists and must be hidden, not deleted');
  assert.equal(visible.length, 5, `the admin bar shows five tabs, not: ${visible.join(', ')}`);
  assert.ok(!visible.includes('account'), 'the account route is reached from Settings, never a sixth tab');
});

// 2. An admin is never offered self-delete. The server answers every admin attempt with cannot_change_self, so a delete row
//    for an admin is a control that always fails. Customers keep theirs.
await check('admins are not offered a self-delete the server refuses', () => {
  let role = 'admin';
  const noop = async () => {};
  const ui = Object.fromEntries(['Appear', 'Avatar', 'Badge', 'Button', 'Card', 'ErrorText', 'Field', 'FilterChips', 'Header', 'ListGroup',
    'ListRow', 'Press', 'Row', 'Screen', 'Txt'].map(name => [name, name]));
  const h = harness('parts.tsx', {
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: value => value }, View: 'View', Share: {} },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-router': { router: {} },
    './api': { api: async () => {}, apiSessionRevision: () => 1, errorCode: error => error.message },
    './push': { pushSupported: () => false }, './model': model, './booking': {}, './map-math': {},
    './session': { useSession: () => ({ me: { user: { id: 1, role, name: 'Fixture', phone: '0599000000' } }, forget: noop, signOut: noop,
      language: 'en', setLanguage() {} }) },
    './entra-auth': { entraConfigured: false }, './copy': copyModule,
    './ui': { ...ui, palette: {}, tones: {}, confirm: (_text, yes) => yes(), useCopy: () => ({ c: copyEn, err: () => '' }), haptic: { error() {} } },
  });
  const deleteOffers = () => nodes(h.render(h.exports.AccountScreen), 'ListRow').filter(row => row.props.label === copyEn.deleteAccount).length;
  const adminOffers = deleteOffers();
  role = 'customer';
  const customerOffers = deleteOffers();
  h.close();
  assert.equal(adminOffers, 0, 'an admin is not offered a delete the server always refuses');
  assert.equal(customerOffers, 1, 'customers keep the self-delete row');
});

// 3. The profit chart opens on the newest day, the fourteenth bar, which sits off-screen at the end of the rail. The rail
//    reveals a selected bar the way FilterChips does: the bar reports its layout and the Rail receives it as `reveal`.
await check('profit chart reveals the selected newest day', () => {
  const daily = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, commission: 10 + i, subscriptions: i }));
  const h = harness('app/admin/index.tsx', {
    'react-native': { Pressable: 'Pressable', StyleSheet: { create: value => value }, View: 'View' },
    '../../motion': { __esModule: true, default: { View: 'AnimatedView' }, cubicBezier: () => 'bezier', useReducedMotion: () => true },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-router': { router: {} },
    '../../api': { useApi: () => ({ data: null, error: null, reload() {} }) },
    '../../parts': { PushRow: 'PushRow' }, '../../push': { pushSupported: () => false },
    '../../session': { useSession: () => ({ me: null }) },
    '../../ui': { Appear: 'Appear', Badge: 'Badge', Card: 'Card', ErrorText: 'ErrorText', fill, Header: 'Header', ListGroup: 'ListGroup',
      Loading: 'Loading', palette: {}, Press: 'Press', Rail: 'Rail', Row: 'Row', Screen: 'Screen', Stat: 'Stat', Txt: 'Txt',
      useCopy: () => ({ c: copyEn, money: value => `SAR ${value}`, row: 'row', language: 'en', rtl: false, err: () => '' }) },
  }, '\nexports.TestProfitChart = ProfitChart;');
  let tree = h.render(h.exports.TestProfitChart, { daily });
  const days = nodes(tree, 'Pressable').filter(day => day.props.accessibilityRole === 'button');
  assert.equal(days.length, 14, 'one tap target per day');
  const newest = days.at(-1);
  assert.equal(typeof newest.props.onLayout, 'function', 'the newest day reports its position so the rail can reveal the selected bar');
  newest.props.onLayout({ nativeEvent: { layout: { x: 624, y: 0, width: 48, height: 166 } } });
  tree = h.render(h.exports.TestProfitChart, { daily });
  const rail = nodes(tree, 'Rail')[0]?.props;
  h.close();
  assert.ok(rail, 'the chart keeps its rail');
  assert.equal(rail.reveal?.x, 624, 'the rail reveals the selected newest day');
  assert.equal(rail.reveal?.width, 48, 'the revealed rectangle is the selected day');
});

// 4. An expired phone challenge keeps its resend and reload errors on screen. PhoneCard rendered ErrorText only while the
//    code was live, so a failed resend or a failed reload after an expired code gave the user no feedback at all.
await check('expired phone challenge keeps resend and reload errors visible', async () => {
  let counter = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
  class ApiError extends Error { constructor(code) { super(code); this.code = code; } }
  const stored = new Map();
  const keyValue = { get: async key => stored.get(key) ?? null, set: async (key, value) => { if (value === null) stored.delete(key); else stored.set(key, value); } };
  const state = { expiresAt: Date.now() + 600_000, issueError: null, selfError: null };
  const phoneApi = {
    capabilities: async () => ({ available: true, enabled: true }),
    self: async () => {
      if (state.selfError) throw state.selfError;
      return { identityRevision: 1, mappings: [{ state: 'reviewed' }], challenges: [] };
    },
    issueSelf: async () => {
      if (state.issueError) throw state.issueError;
      return { challengeId: `challenge-${++counter}`, state: 'prepared', expiresAt: state.expiresAt, resendAfterSeconds: 0, deliveryState: 'accepted' };
    },
    proveSelf: async () => ({ ok: true }),
  };
  const h = harness('phone-card.tsx', {
    'react-native': { StyleSheet: { create: value => value }, View: 'View' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    './api': { errorCode: error => error.code ?? error.message },
    './phone/notice': { setAuthNotice() {} },
    './phone/client': { digest: async value => value, keyValue, newUuid: newId, phoneApi },
    './phone/command': command, './phone/flow': flow, './phone/requests': requests,
    './session': { useSession: () => ({ me: { user: { id: 1, role: 'customer', name: 'Fixture', phone: '0599000000', phoneVerifiedAt: null } },
      refresh: async () => {}, forget: async () => {} }) },
    './ui': { Badge: 'Badge', Button: 'Button', Card: 'Card', ErrorText: 'ErrorText', Field: 'Field', fill, haptic: { success() {}, error() {} },
      palette: {}, Row: 'Row', Txt: 'Txt', tones: {}, useCopy: () => ({ c: copyEn, err: value => `ERR:${typeof value === 'string' ? value : value.code}` }) },
  });
  const settle = async () => { await flush(); return h.render(h.exports.PhoneCard); };
  const button = (tree, title) => {
    const found = nodes(tree, 'Button').find(node => node.props.title === title);
    assert.ok(found, `the "${title}" control is on screen`);
    return found.props;
  };
  const errorsOf = tree => nodes(tree, 'ErrorText').map(node => node.props.children).filter(text => typeof text === 'string' && text.length > 0);

  h.render(h.exports.PhoneCard); // mount: its effect starts the capabilities and self load
  let tree = await settle();
  await button(tree, copyEn.phone_verify_send).onPress(); tree = await settle();

  // Control: while the code is live, a failed resend is shown beside the code.
  state.issueError = new ApiError('phone_rate_limited');
  await button(tree, copyEn.phone_resend).onPress(); tree = await settle();
  assert.deepEqual(errorsOf(tree), ['ERR:phone_rate_limited'], 'a live code shows a failed resend');

  // The code expires. Resend is still offered, and a failed resend must still be shown.
  state.issueError = null; state.expiresAt = 1;
  await button(tree, copyEn.phone_resend).onPress(); tree = await settle();
  assert.equal(nodes(tree, 'Field').find(field => field.props.label === copyEn.phone_code_label), undefined, 'the expired code can no longer be entered');
  state.issueError = new ApiError('phone_rate_limited');
  await button(tree, copyEn.phone_resend).onPress(); tree = await settle();
  assert.ok(errorsOf(tree).includes('ERR:phone_rate_limited'), 'an expired code still shows a failed resend');

  // A resend that succeeds but whose follow-up reload fails must also be shown on the expired code.
  state.issueError = null; state.selfError = new ApiError('network');
  await button(tree, copyEn.phone_resend).onPress(); tree = await settle();
  h.close();
  assert.ok(errorsOf(tree).includes('ERR:network'), 'an expired code still shows a failed reload');
});

// 5. Polling away the last dispatch offer while accept() is in flight must not bump focusRevision and abort error handling.
await check('driver jobs focus revision ignores dispatch-list changes', async () => {
  class ApiError extends Error { constructor(message, status = 409) { super(message); this.status = status; } }
  let jobs = [{
    id: 1, customerId: 2, driverId: null, service: 'parcel', shared: false, pickupCity: 'ramallah', dropoffCity: 'nablus',
    pickupPoint: null, dropoffPoint: null, pickupNote: 'Gate', dropoffNote: 'Door', contact: null, pickupContact: null,
    detail: 'Box', price: 20, recommendedPrice: 20, commission: 3, discount: 0, status: 'searching', createdAt: 1000,
    dispatch: { roundId: 'r1', state: 'open', closeReason: null, offersIssued: 1, deadlineAt: Date.now() + 60_000, startedAt: 1000,
      myOffer: { id: 'o1', offerId: 'offer-1', expiresAt: Date.now() + 30_000, issuedAt: 1000, leaseNonce: 'nonce-1',
        pickupEtaSeconds: 120, idleSeconds: 0, idleCreditSeconds: 0, rankScore: 1, etaEstimated: false } },
  }];
  let apiError = new ApiError('dispatch_expired', 410), releaseTracking, reloads = 0, focusEffect, blurFocus;
  const h = harness('app/driver/index.tsx', {
    'react-native': { AccessibilityInfo: { announceForAccessibility() {} }, KeyboardAvoidingView: 'KeyboardAvoidingView',
      Linking: { openSettings: async () => {} }, Platform: { OS: 'android' }, StyleSheet: { create: value => value }, View: 'View' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-router': { router: { push() {} }, useFocusEffect(cb) { if (cb !== focusEffect) { blurFocus?.(); focusEffect = cb; blurFocus = cb(); } } },
    '../../api': { ApiError, apiSessionRevision: () => 1, useApi: () => ({ data: { version: 1, jobs, nextCursor: null }, error: null, reload: async () => { reloads++; } }),
      api: async () => { throw apiError; } },
    '../../model': model,
    '../../driver-work': { useDriverWork: () => ({ known: true, presenceState: 'online', permission: { granted: true, canAskAgain: true },
      tracking: 'sharing', orders: [], prepareTracking: () => new Promise(resolve => { releaseTracking = resolve; }), update() {}, reload: async () => {} }) },
    '../../freight-details': { FreightDetails: 'FreightDetails' },
    '../../ride-flow': { capacityCommand: () => ({}), secondsUntil: () => 10,
      dispatchAcceptance: (order, now) => order.dispatch?.myOffer && order.dispatch.myOffer.expiresAt > now ? { offerId: order.dispatch.myOffer.offerId, leaseNonce: order.dispatch.myOffer.leaseNonce } : null },
    '../../driver-presence-card': { BackgroundLocationAction: 'BackgroundLocationAction', DriverPresenceCard: 'DriverPresenceCard' },
    '../../parts': Object.assign(react => {
      const useSecondTick = active => { const [now, setNow] = react.useState(Date.now); react.useEffect(() => () => {}, [active]); return now; };
      return { PendingDriverNotice: 'PendingDriverNotice', RouteLine: 'RouteLine', ServiceIcon: 'ServiceIcon', useFormat: () => ({ time: () => '' }), useSecondTick, VerifyEmailNudge: 'VerifyEmailNudge' };
    }, { __withReact: true }),
    '../../session': { useSession: () => ({ me: { user: { id: 7, role: 'driver', status: 'active', phone: '0599000001' }, plan: 'free', settings: { commission: 15, proCommission: 10 } }, refresh: async () => {} }) },
    '../../ui': { Button: 'Button', Card: 'Card', Empty: 'Empty', ErrorText: 'ErrorText', Field: 'Field', FilterChips: 'FilterChips', fill,
      haptic: { success() {}, error() {} }, IconButton: 'IconButton', Header: 'Header', Loading: 'Loading', palette: {}, Press: 'Press', Row: 'Row',
      Screen: 'Screen', Txt: 'Txt', useCopy: () => ({ c: copyEn, money: value => `₪${value}`, err: e => e.message, language: 'en', rtl: false }) },
  });
  let tree = h.render(h.exports.default);
  const acceptBtn = nodes(tree, 'Button').find(b => b.props.title === fill(copyEn.acceptAt, { p: '₪20' }));
  assert.ok(acceptBtn, 'accept button renders');
  const pendingAccept = acceptBtn.props.onPress();
  jobs = []; // polling drops the last dispatch offer while prepareTracking() is suspended
  tree = h.render(h.exports.default);
  releaseTracking(true);
  await pendingAccept;
  tree = h.render(h.exports.default);
  const errors = nodes(tree, 'ErrorText').map(node => node.props.children).filter(Boolean);
  assert.ok(errors.includes('dispatch_expired'), `acceptance error must surface after hasDispatch flips: ${JSON.stringify(errors)}`);
  assert.ok(reloads >= 1, 'jobs list reloads after failed acceptance');
  h.close();
});

if (failures.length) throw new Error(`${failures.length} admin review regression(s) failed:\n${failures.join('\n')}`);
console.log('Admin review: five admin tabs, no admin self-delete, newest profit day revealed, expired phone errors kept visible, and driver accept errors survive a dispatch list change');
