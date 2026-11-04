// A paid Google approach is an overlay on the free route: it shows only while its own ETA is valid, and the free route
// carries the line and minutes otherwise. Runs the real useRoad with its real renderer, clock and ETA rules; only React,
// the network and native modules are controlled. Whether a request really repeats is api-focus.test.mjs's job.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const realNow = Date.now, realMonotonic = performance.now;

function harness(mode) {
  const world = { now: 1_800_000_000_000, monotonic: 1_000_000, app: 'active', seen: [], reloads: [], answer: () => undefined };
  Date.now = () => world.now;
  performance.now = () => world.monotonic;
  const slots = [], pending = [], appListeners = new Set(), intervals = new Set();
  let cursor = 0, dirty = false;
  const react = {
    useState(value) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof value === 'function' ? value() : value };
      return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index])))
        pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  // Like the real hook, the same answer keeps its identity between renders.
  const held = new Map();
  const stable = (path, answer) => {
    const key = JSON.stringify(answer ?? null), old = held.get(path);
    if (old?.key === key) return old.answer;
    held.set(path, { key, answer });
    return answer;
  };
  const useApi = (path, pollMs, options) => {
    if (path) world.seen.push({ path, pollMs, options });
    return { ...(path ? stable(path, world.answer(path)) : {}), reload: async () => { world.reloads.push(path); } };
  };
  const modules = {
    react,
    'react/jsx-runtime': {},
    'react-native': { Platform: { OS: 'android' }, View: 'View',
      AppState: { get currentState() { return world.app; }, addEventListener: (_event, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } } },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { googleMaps: { android: true } } } } },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    './api': { useApi },
    './map-mode': { useMapMode: () => [mode] },
    './ui': {},
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/road.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', compiled)(
    name => modules[name] ?? require(`../src/${name.slice(2)}.ts`), module, module.exports,
    fn => { intervals.add(fn); return fn; }, fn => intervals.delete(fn));
  const render = (order, language) => {
    for (let pass = 0; pass < 25; pass++) {
      cursor = 0; dirty = false;
      const result = module.exports.useRoad(order, language);
      const effects = pending.splice(0);
      if (!dirty) for (const effect of effects) effect();
      if (!dirty) return result;
    }
    throw new Error('useRoad never settled');
  };
  const advance = ms => { world.now += ms; world.monotonic += ms; for (const fn of intervals) fn(); };
  const setApp = state => { world.app = state; for (const fn of appListeners) fn(state); };
  return { world, render, advance, setApp };
}

const pickup = { latitude: 31.9, longitude: 35.2 }, dropoff = { latitude: 32.2, longitude: 35.26 };
const freeEnd = [35.2001, 31.9001], paidEnd = [35.2002, 31.9002];
const start = { latitude: 31.85, longitude: 35.15 };
const eta = (seconds, issuedAt) => ({ schemaVersion: 1, rawSeconds: seconds, minSeconds: seconds, maxSeconds: seconds, basis: 'heuristic', accuracy: 'unknown',
  serverTime: issuedAt, validity: { issuedAt, expiresAt: issuedAt + 30_000, expiresInSeconds: 30 } });
const free = (seconds, issuedAt, extra = {}) => ({ data: { km: 9, minutes: 5, line: [[35.15, 31.85], [35.17, 31.87], freeEnd], provider: 'osrm', eta: eta(seconds, issuedAt), ...extra } });
const paid = (seconds, issuedAt) => ({ data: { km: 8, minutes: 3, line: [[35.15, 31.85], [35.18, 31.88], paidEnd],
  provider: { provider: 'google-routes', upstream: true }, eta: eta(seconds, issuedAt) } });
const order = (world, position = start, extra = {}) => ({ id: 7, status: 'assigned', driverId: 3, assignedAt: 1, pickupPoint: pickup, dropoffPoint: dropoff,
  pickupCity: 'ramallah', dropoffCity: 'nablus', driverLocation: { ...position, heading: 0, updatedAt: world.now }, ...extra });
const paidPaths = world => [...new Set(world.seen.map(item => item.path).filter(path => path.includes('/route/google')))];
const shows = (result, end) => result.approach?.at(-1)?.[0] === end[0] && result.approach?.at(-1)?.[1] === end[1];
const minutes = seconds => [Math.ceil(seconds / 60), Math.ceil(seconds / 60)];

try {
  // Google map: the paid line is an overlay on the free baseline.
  {
    const { world, render, advance, setApp } = harness('google');
    let paidAnswer, freeIssued = world.now;
    world.answer = path => path.includes('/route/google') ? paidAnswer : path.includes('heading=') ? free(600, freeIssued) : undefined;
    let road = render(order(world));
    assert.ok(shows(road, freeEnd), 'while the paid answer is on its way the free route shows');
    assert.deepEqual(road.eta, minutes(600), 'and so do its minutes');
    assert.equal(paidPaths(world).length, 1, 'the first approach for a stop buys one route');
    assert.match(paidPaths(world)[0], /trigger=preview&shown=1/);
    assert.ok(world.seen.filter(item => item.path.includes('/route/google')).every(item => item.options?.refetchOnFocus === false), 'a paid route never refetches on focus');
    assert.ok(world.seen.filter(item => item.path.includes('/route/google')).every(item => !item.pollMs), 'a paid route is never polled');

    paidAnswer = paid(180, world.now);
    road = render(order(world));
    assert.ok(shows(road, paidEnd), 'the paid line shows once it arrives');
    assert.deepEqual(road.eta, minutes(180), 'with its own minutes');

    advance(29_000); freeIssued = world.now;
    road = render(order(world));
    assert.ok(shows(road, paidEnd), 'the paid line still shows while its ETA is valid');
    assert.deepEqual(road.eta, minutes(180));

    // The owner-visible gap: a stationary driver used to lose the line and minutes here until a 250 m move.
    advance(2_000); freeIssued = world.now;
    road = render(order(world));
    assert.ok(shows(road, freeEnd), 'once the paid ETA lapses the free line takes over');
    assert.deepEqual(road.eta, minutes(600), 'and its minutes');

    for (let i = 0; i < 20; i++) { advance(30_000); freeIssued = world.now; road = render(order(world)); }
    assert.ok(shows(road, freeEnd), 'a driver waiting ten minutes keeps a line');
    assert.deepEqual(road.eta, minutes(600), 'and minutes');
    assert.equal(paidPaths(world).length, 1, 'waiting never buys another route');
    assert.ok(!world.reloads.some(path => path?.includes('/route/google')), 'and never reloads the paid one');

    road = render(order(world, { latitude: 31.8508, longitude: 35.15 }));
    assert.equal(paidPaths(world).length, 1, 'a move under 250 m buys nothing');
    const moved = { latitude: 31.853, longitude: 35.15 };
    road = render(order(world, moved));
    assert.equal(paidPaths(world).length, 2, 'a significant move buys one new route');
    assert.match(paidPaths(world)[1], /trigger=movement&foreground=1&metres=\d{3}/);

    // A failed paid call leaves the free route showing, with no error hiding it. useApi keeps the last data on a failure.
    paidAnswer = { ...paid(180, world.now), error: 'maps_unavailable' };
    road = render(order(world, moved));
    assert.ok(shows(road, freeEnd), 'a failed paid route falls back to the free line');
    assert.deepEqual(road.eta, minutes(600), 'and its minutes');
    assert.equal(paidPaths(world).length, 2, 'and does not retry the paid call');

    // Backgrounded: the paid path is gone, and coming back asks for the same route.
    const before = paidPaths(world).length;
    world.seen.length = 0;
    setApp('background');
    road = render(order(world, moved));
    assert.equal(paidPaths(world).length, 0, 'nothing paid is asked for in the background');
    setApp('active');
    render(order(world, moved));
    assert.equal(new Set(paidPaths(world)).size, 1, 'coming back names one route');
    assert.ok(before >= 1);
  }
  // A lapsed free ETA reloads the free route, on a Google map too, and never the paid one.
  {
    const { world, render, advance } = harness('google');
    const issued = world.now;
    world.answer = path => path.includes('/route/google') ? paid(180, issued) : path.includes('heading=') ? free(600, issued) : undefined;
    render(order(world));
    advance(31_000);
    const road = render(order(world));
    assert.equal(road.eta, null, 'an expired free ETA is not shown');
    assert.ok(world.reloads.length >= 1, 'it refreshes itself');
    assert.ok(world.reloads.every(path => !path.includes('/route/google')), 'only the free route reloads');
  }
  // Old fixes hide everything, paid or free.
  {
    const { world, render, advance } = harness('google');
    const issued = world.now, moving = order(world);
    world.answer = path => path.includes('/route/google') ? paid(180, issued) : path.includes('heading=') ? free(600, issued) : undefined;
    assert.ok(shows(render(moving), paidEnd));
    advance(31_000);
    const road = render(moving);
    assert.equal(road.approach, null, 'a driver with no recent fix has no approach line');
    assert.equal(road.eta, null, 'and no minutes');
  }
  // A navigating driver's turns come from the free route, which has them, even while a paid line shows.
  {
    const { world, render } = harness('google');
    const steps = [{ distance: 100 }], issued = world.now;
    world.answer = path => path.includes('/route/google') ? paid(180, issued) : path.includes('steps=1') ? free(600, issued, { steps }) : undefined;
    const road = render(order(world), 'en');
    assert.ok(shows(road, paidEnd), 'the paid line draws');
    assert.equal(road.steps, steps, 'and the turn banner keeps its steps');
    assert.equal(road.navLine.at(-1), freeEnd, 'measured along the line those steps belong to');
  }
  // The baseline map never asks for anything paid, and Google content never reaches it.
  {
    const { world, render } = harness('maplibre');
    const issued = world.now;
    world.answer = path => path.includes('/route/google') ? paid(180, issued) : path.includes('heading=') ? free(600, issued) : undefined;
    const road = render(order(world));
    assert.equal(paidPaths(world).length, 0, 'the baseline map buys nothing');
    assert.ok(shows(road, freeEnd));
    assert.deepEqual(road.eta, minutes(600));
  }
  // A courier with other stops first has no direct approach, free or paid (SPEC-courier-run-eta.md).
  {
    const { world, render } = harness('google');
    world.answer = () => undefined;
    const road = render(order(world, start, { sharedRun: true }));
    assert.equal(paidPaths(world).length, 0, 'a shared run buys nothing');
    assert.equal(road.approach, null);
    assert.equal(road.eta, null);
  }
  console.log('Road approach: paid Google line overlays the free route, lapses and failures fall back with no paid call');
} finally { Date.now = realNow; performance.now = realMonotonic; }
