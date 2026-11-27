import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { shopAddressForOrder } from '../src/personal-services.ts';

// Render the real route functions with deterministic hooks and inspect their controls. Navigation,
// storage and the order feed are boundaries; selecting a control runs the route's own event handler.
function harness({ enabled = ['ride', 'parcel', 'freight', 'shop'], initial = {}, orders = [] } = {}) {
  const modules = new Map(), effects = [], pushes = [], saved = new Map(Object.entries(initial));
  let state = [], cursor = 0, continued = 0;
  let writeGate;
  const element = (type, props) => ({ type, props });
  const passthrough = new Proxy({}, { get: (_, key) => key });
  const stub = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
        return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
      },
      useRef(current) { const i = cursor++; return state[i] ??= { current }; },
      useEffect(run, deps) {
        const i = cursor++;
        if (!deps || !state[i] || deps.some((d, k) => !Object.is(d, state[i][k]))) effects.push(run);
        state[i] = deps;
      },
      useCallback: f => f,
    },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { ...{ View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' }, StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) },
    'expo-router': { router: { push: arg => pushes.push(arg), navigate: arg => pushes.push(arg) }, useFocusEffect: () => {} },
    'react-native-safe-area-context': passthrough,
    '@expo/vector-icons': passthrough,
    'src/ui.tsx': { ...Object.fromEntries(['Appear', 'Button', 'Card', 'Choices', 'Empty', 'FilterChips', 'InstallLink', 'ListGroup', 'Logo', 'Press', 'Row', 'Txt'].map(name => [name, name])),
      iconSize: {}, headingFont: {}, haptic: { tap() {} }, fill: (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key]), useLines: n => n,
      useCopy: () => ({ c: load('src/copy.ts').copy.en, row: 'row', language: 'en', rtl: false }) },
    'src/theme-context.tsx': { useTheme: () => ({ palette: {} }), themedStyles: make => () => make({}, {}) },
    'src/parts.tsx': { OrderRow: 'OrderRow', useOrders: () => ({ data: orders }), tripTitle: () => 'Route' },
    'src/api.ts': { useApi: path => ({ data: path === '/orders' ? orders : undefined }) },
    'src/session.tsx': { useSession: () => ({ me: { user: { id: 1, name: 'Layla' }, settings: {}, capabilities: { enabledServices: enabled } }, language: 'en', finishOnboarding: () => { continued++; } }) },
    'src/storage.ts': { storage: {
      get: async key => saved.get(key) ?? null,
      set: async (key, value) => { if (writeGate) await writeGate; saved.set(key, value); },
      exclusive: (run, key) => load('src/serial-lock.ts').inProcess(key, run),
    } },
    'src/map-sheet.tsx': { MapSheet: 'MapSheet', useSideSheet: () => false },
    'src/pickup-location.ts': { pickupLocation: async () => { throw Error('permission'); }, rememberedHere: async () => null },
    'src/motion.tsx': { default: { View: 'Animated' }, useReducedMotion: () => true },
  };
  function load(path) {
    if (path in stub) return stub[path];
    if (modules.has(path)) return modules.get(path);
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    const mod = { exports: {} };
    const require = name => {
      if (!name.startsWith('.')) return stub[name];
      const local = new URL(name, `file:///${path}`).pathname.slice(1);
      if (/\.tsx?$/.test(local)) return load(local);
      for (const ext of ['.ts', '.tsx']) {
        try { return load(local + ext); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return passthrough;
    };
    runInNewContext(outputText, { module: mod, exports: mod.exports, require, AbortController });
    modules.set(path, mod.exports);
    return mod.exports;
  }
  return {
    async render(route) {
      const component = load(`src/app/${route}.tsx`).default;
      cursor = 0; component();
      for (const effect of effects.splice(0)) effect();
      await new Promise(resolve => setImmediate(resolve));
      cursor = 0; return component();
    },
    remount() { state = []; effects.length = 0; },
    holdWrites() { let release; writeGate = new Promise(resolve => { release = resolve; }); return release; },
    pushes, get continued() { return continued; },
  };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree?.props) return [];
  return [tree, ...nodes(tree.props.header), ...nodes(tree.props.children)];
}
const home = '(customer)/index';
const ordersTab = '(customer)/orders';
const choices = tree => nodes(tree).filter(n => n.type === 'Choices' || n.type === 'FilterChips').map(n => n.props);
const labels = tree => nodes(tree).map(n => n.props.accessibilityLabel);
const visibleOrderIds = tree => nodes(tree).filter(n => n.type === 'OrderRow').map(n => n.props.order.id);

test('Personal home remembers the chosen service across mounts and opens its booking flow', async () => {
  const h = harness();
  const [services] = choices(await h.render(home));
  assert.equal(services?.value, 'ride', 'Ride is the first available service');
  const completeWrite = h.holdWrites();
  services.onChange('send');
  assert.equal(choices(await h.render(home))[0].value, 'send', 'the tap changes the current input before storage completes');
  h.remount();
  await h.render(home); // this new mount starts its read while the last write is still pending
  completeWrite();
  const reopened = await h.render(home);
  assert.equal(choices(reopened)[0]?.value, 'send');
  nodes(reopened).find(n => n.props.accessibilityLabel === 'Where are you sending it?').props.onPress();
  assert.equal(h.pushes.at(-1).params.service, 'parcel');
});

test('Personal home only shows enabled lines and sends freight through Send', async () => {
  const h = harness({ enabled: ['freight', 'shop'], initial: { 'wind.homeService': 'ride' } });
  const tree = await h.render(home);
  assert.deepEqual(Array.from(choices(tree)[0]?.items ?? [], item => item.label), ['Send', 'Shop']);
  assert.equal(choices(tree)[0].value, 'send');
  assert.ok(!labels(tree).includes('Large load'));
  nodes(tree).find(n => n.props.accessibilityLabel === 'Where are you sending it?').props.onPress();
  assert.equal(h.pushes.at(-1).params.service, 'freight');
  const disabled = await harness({ enabled: [] }).render(home);
  assert.deepEqual(choices(disabled), []);
  assert.ok(!labels(disabled).includes('Where to?'));
  assert.ok(labels(tree).includes('Roads'), 'the Roads button has the visible label in its accessible name');
});

test('Personal home puts a live ride first, then orders that need the customer', async () => {
  const trip = { pickupCity: 'ramallah', dropoffCity: 'nablus' };
  const parcel = { ...trip, id: 3, service: 'parcel', status: 'assigned' };
  const shop = { ...trip, id: 2, service: 'shop', status: 'requested', shop: { state: 'awaiting_approval' } };
  const ride = { ...trip, id: 1, service: 'ride', status: 'in_transit' };
  const search = { ...trip, id: 4, service: 'parcel', status: 'searching' };
  const later = { ...trip, id: 5, service: 'parcel', status: 'searching', scheduledFor: Date.now() + 3_600_000 };
  assert.deepEqual(visibleOrderIds(await harness({ orders: [later, search, parcel, shop, ride] }).render(home)), [1, 2, 3, 4, 5]);
  assert.deepEqual(visibleOrderIds(await harness({ orders: [parcel, shop] }).render(home)), [2, 3]);
});

test('Orders filters current and past work by service, including old loads under Send', async () => {
  const h = harness({ orders: [
    { id: 4, service: 'shop', status: 'in_transit' }, { id: 3, service: 'ride', status: 'searching' },
    { id: 2, service: 'freight', status: 'returned' }, { id: 1, service: 'ride', status: 'completed' },
  ] });
  const initial = await h.render(ordersTab);
  assert.deepEqual(visibleOrderIds(initial), [4, 3]);
  choices(initial)[1].onChange('ride');
  const rides = await h.render(ordersTab);
  assert.deepEqual(visibleOrderIds(rides), [3]);
  choices(rides)[0].onChange('past');
  const past = await h.render(ordersTab);
  assert.deepEqual(visibleOrderIds(past), [1]);
  choices(past)[1].onChange('send');
  assert.deepEqual(visibleOrderIds(await h.render(ordersTab)), [2]);
});

test('Orders hides unavailable filters and keeps orders from disabled services reachable', async () => {
  const h = harness({ enabled: ['parcel'], orders: [
    { id: 3, service: 'parcel', status: 'assigned' }, { id: 2, service: 'ride', status: 'completed' },
  ] });
  const current = await h.render(ordersTab);
  const filters = tree => Array.from(choices(tree)[1].items, item => item.key);
  assert.deepEqual(filters(current), ['all', 'send']);
  choices(current)[0].onChange('past');
  const past = await h.render(ordersTab);
  assert.deepEqual(filters(past), ['all', 'ride', 'send']);
  choices(past)[1].onChange('ride');
  const formerRides = await h.render(ordersTab);
  assert.deepEqual(visibleOrderIds(formerRides), [2]);
  choices(formerRides)[0].onChange('current');
  const active = await h.render(ordersTab);
  assert.equal(choices(active)[1].value, 'all');
  assert.deepEqual(visibleOrderIds(active), [3]);
});

test('Welcome shows one card and Continue completes onboarding immediately', async () => {
  const h = harness({ enabled: ['parcel'] });
  const tree = await h.render('welcome');
  assert.equal(nodes(tree).filter(n => n.type === 'Card').length, 1);
  assert.ok(!nodes(tree).some(n => n.props.accessibilityRole === 'radio'));
  assert.ok(labels(tree).includes('العربية'));
  assert.ok(nodes(tree).some(n => typeof n.props.children === 'string' && n.props.children.startsWith('See available services')));
  nodes(tree).find(n => n.type === 'Button' && n.props.title === 'Continue').props.onPress();
  assert.equal(h.continued, 1);
});

test('An order-ID shortcut restores only this account’s usable Shop delivery', () => {
  const point = { latitude: 32.3102, longitude: 35.0299 };
  const order = { id: 17, customerId: 3, service: 'shop', status: 'completed', dropoffCity: 'tulkarm', dropoffNote: 'Blue door', dropoffPoint: point };
  assert.deepEqual(shopAddressForOrder(order, 3), { id: 17, city: 'tulkarm', note: 'Blue door', point });
  assert.equal(shopAddressForOrder(order, 4), null);
  assert.equal(shopAddressForOrder(undefined, 3), null);
  assert.equal(shopAddressForOrder({ ...order, status: 'cancelled' }, 3), null);
});
