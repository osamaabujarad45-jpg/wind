import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { newBooking, orderRequest, pendingKey, readBooking } from '../src/booking.ts';
import { isValidPhone } from '../src/model.ts';

// Reproduction for the booking submit/promo guards (pilot 22526cc, src/app/book.tsx). The contact
// field's keyboard "go" key calls submit directly and the promo field's "go" key calls applyPromo,
// so both bypass the Request/Apply buttons' disabled guards. These checks run the REAL callbacks
// sliced out of book.tsx and transpiled with the installed TypeScript — no guard logic is
// reimplemented here. On the pilot baseline the guard cases FAIL (that is the reproduction); the
// happy-path cases pass, proving the harness drives the real code.
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/booking-submit-guards.test.mjs
const source = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
assert.ok(source.includes('onSubmitEditing={submit}'), 'the contact keyboard go-key wires straight to submit (the bypass under test)');
assert.ok(source.includes('onSubmitEditing={() => applyPromo(promoInput)}'), 'the promo keyboard go-key wires straight to applyPromo');
assert.ok(source.includes('disabled={submitBlocked || scopeInvalid}'), 'the Request button uses the callback submission guard');
const guards = [...source.matchAll(/^  const (?:submitBlocked|promoBlocked) = [^\n]+;/gm)].map(match => match[0]).join('\n');
assert.ok(guards.includes('submitBlocked') && guards.includes('promoBlocked'), 'callbacks and controls share their guards');

const applyPromoSrc = source.slice(source.indexOf('  async function applyPromo(code: string) {'), source.indexOf('  function switchService'));
const submitSrc = source.slice(source.indexOf('  async function submit() {'), source.indexOf('  /** Drop a command'));
assert.ok(applyPromoSrc.includes('/promos/check') && submitSrc.includes("'/orders'") && submitSrc.includes('storage.set') && submitSrc.includes('newBooking'),
  'the real applyPromo and submit callbacks must be extracted from book.tsx');
const extracted = ts.transpileModule(guards + '\n' + applyPromoSrc + '\n' + submitSrc + '\nglobalThis.applyPromo = applyPromo;\nglobalThis.submit = submit;',
  { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;

const POINT_A = { latitude: 31.9522, longitude: 35.2332 }, POINT_B = { latitude: 32.2211, longitude: 35.3684 };
// A slot the form sat past: a fresh submit rejects slots under an hour ahead (book.tsx line 403).
const pastSlot = Date.now() - 60 * 60_000;

function pendingCommand() {
  return newBooking({ service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: POINT_A, dropoffPoint: POINT_B,
    pickupNote: 'Gate 3', dropoffNote: 'Door B', contact: '0599123456', detail: 'Fragile box', option: 'small',
    loadingHelp: false, shared: false, quotedPrice: 48, scheduledFor: pastSlot, promoCode: 'SAVE5', expectedDiscount: 5 });
}

// Minimal closure for the sliced callbacks: real command helpers from src/booking.ts, recording
// mocks for storage/api/navigation, and every state flag the screen derives (locked mirrors
// book.tsx line 124) so a guard added to the callbacks finds its variables.
function harness(overrides = {}) {
  const state = {
    ready: true, available: true, pending: null, busy: false, locating: false, quoting: false, quoteFailed: false,
    checking: false, resolving: false, scopeInvalid: false, routeChosen: true, pickupChosen: true, scheduledFor: null,
    service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: POINT_A, dropoffPoint: POINT_B,
    pickupNote: 'Gate 3', dropoffNote: 'Door B', detail: 'Fragile box', contact: '0599123456', recipientPhone: '', recipientName: '',
    option: 'small', loadingHelp: false, declaredScope: undefined, price: 48, applied: null, smart: null, error: '',
    ...overrides,
  };
  const calls = { writes: [], posts: [], setChecking: [], setPromo: [], navigations: [] };
  const context = {
    sending: { current: false }, settled: { current: false }, latest: { current: null }, scrollRef: { current: null },
    alive: { current: true }, apiSessionRevision: () => 0,
    savedKey: pendingKey(101),
    storage: { set: async (key, value, secure) => { calls.writes.push({ key, value, secure }); } },
    // structuredClone pulls VM-realm arguments into this realm so deepStrictEqual prototypes match.
    api: async (path, body) => { calls.posts.push({ path, body: body === undefined ? undefined : structuredClone(body) });
      if (path === '/orders') return { id: 555 };
      if (path === '/promos/check') return { code: body.code, discount: 5 };
      throw new Error('unexpected api call ' + path); },
    ApiError: class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } },
    errorCode: e => (e && typeof e === 'object' && 'code' in e) ? e.code : undefined,
    isValidPhone, newBooking, orderRequest,
    router: { replace: url => { calls.navigations.push(url); } },
    refresh: async () => {}, requote: () => {},
    haptic: { error() {}, success() {}, tap() {} },
    Platform: { OS: 'web' }, AccessibilityInfo: { announceForAccessibility() {} },
    fill: template => template, money: value => `${value}NIS`, err: e => (typeof e === 'string' ? e : e?.message ?? String(e)),
    c: new Proxy({}, { get: (_t, key) => String(key) }),
    setError: () => {}, setField: () => {}, setStep: () => {}, setSlot: () => {}, setSheetOpen: () => {}, setInvalid: () => {},
    setBusy: () => {}, setOutcome: () => {}, setPromoInput: () => {}, setPromoError: () => {}, setCredits: () => {},
    setPending: value => { state.pending = value; }, setPromo: v => { calls.setPromo.push(structuredClone(v)); },
    setChecking: v => { calls.setChecking.push(v); state.checking = v; },
  };
  for (const key of Object.keys(state)) Object.defineProperty(context, key, { get: () => state[key], set: v => { state[key] = v; }, configurable: true });
  Object.defineProperty(context, 'locked', { get: () => state.busy || !!state.pending || !state.ready || state.locating || !state.available, configurable: true });
  runInNewContext(extracted, context);
  return { context, calls, state, submit: context.submit, applyPromo: context.applyPromo };
}

const failures = [];
async function check(name, fn) {
  try { await fn(); console.log('ok    ' + name); }
  catch (e) { failures.push(name); console.log('FAIL  ' + name + ' :: ' + (e && e.message ? e.message : e)); }
}
const noWrites = h => {
  assert.equal(h.calls.writes.length, 0, 'no storage write may happen');
  assert.equal(h.calls.posts.length, 0, 'no order POST / api call may happen');
};

// Keyboard bypass: the go-key path must not write or POST while the button would be disabled.
await check('submit while a fresh quote is calculating: zero storage writes, zero POSTs', async () => { const h = harness({ quoting: true }); await h.submit(); noWrites(h); });
await check('submit after a failed quote: zero storage writes, zero POSTs', async () => { const h = harness({ quoteFailed: true }); await h.submit(); noWrites(h); });
await check('submit while a promo check runs: zero storage writes, zero POSTs', async () => { const h = harness({ checking: true }); await h.submit(); noWrites(h); });
await check('submit while locating: zero storage writes, zero POSTs', async () => { const h = harness({ locating: true }); await h.submit(); noWrites(h); });
await check('pending replay while locating: zero storage writes, zero POSTs (retry button is disabled then)', async () => {
  const cmd = pendingCommand(), h = harness({ pending: cmd, scheduledFor: pastSlot, locating: true }); await h.submit(); noWrites(h);
});
// Existing guards must keep holding.
await check('submit while a send is in flight does nothing', async () => { const h = harness(); h.context.sending.current = true; await h.submit(); noWrites(h); });
await check('submit before the form is ready does nothing', async () => { const h = harness({ ready: false }); await h.submit(); noWrites(h); });
await check('submit for an unavailable service without pending does nothing', async () => { const h = harness({ available: false }); await h.submit(); noWrites(h); });

// Legitimate valid submission.
await check('valid submission: command stored, POST /orders with its exact wire body, slot cleared, navigates', async () => {
  const h = harness();
  await h.submit();
  assert.equal(h.calls.writes[0].key, pendingKey(101));
  assert.equal(h.calls.writes[0].secure, true);
  const stored = readBooking(h.calls.writes[0].value);
  assert.equal(stored.payload.service, 'parcel');
  assert.equal(stored.payload.quotedPrice, 48);
  assert.equal(stored.payload.contact, '0599123456');
  assert.deepEqual(h.calls.posts, [{ path: '/orders', body: orderRequest(stored) }]);
  assert.deepEqual(h.calls.writes[1], { key: pendingKey(101), value: null, secure: true });
  assert.deepEqual(h.calls.navigations, ['/order/555']);
  assert.equal(h.context.sending.current, false);
});

// Frozen pending replay: expired schedule is allowed and fresh quote/promo guards must not block it.
await check('pending replay with an expired slot keeps exact command identity/payload and ignores fresh quote/promo guards', async () => {
  const cmd = pendingCommand(), h = harness({ pending: cmd, scheduledFor: pastSlot, quoting: true, checking: true });
  await h.submit();
  assert.ok(pastSlot < Date.now() + 60 * 60_000, 'precondition: the slot is expired for a fresh submit');
  assert.equal(h.calls.posts.length, 1);
  assert.equal(h.calls.posts[0].path, '/orders');
  assert.deepEqual(h.calls.posts[0].body, orderRequest(cmd), 'the POST replays the frozen command, not the edited form');
  assert.equal(h.calls.posts[0].body.requestId, cmd.requestId);
  assert.equal(h.calls.posts[0].body.scheduledFor, pastSlot);
  const stored = readBooking(h.calls.writes[0].value);
  assert.equal(stored.requestId, cmd.requestId, 'same command identity');
  assert.deepEqual(stored.payload, cmd.payload, 'same frozen payload');
});

for (const [status, code] of [[409, 'too_many_searching'], [403, 'pending_approval'], [409, 'quote_expired'], [409, 'booking_command_expired']]) {
  await check(`pending retry ${status} ${code} keeps recovery and checks its receipt`, async () => {
    const cmd = pendingCommand(), h = harness({ pending: cmd, scheduledFor: pastSlot });
    const checks = [];
    h.context.checkPending = async command => { checks.push(command.requestId); };
    h.context.api = async () => { const error = new h.context.ApiError(code, status); error.code = code; throw error; };
    await h.submit();
    assert.equal(h.calls.writes.some(write => write.value === null), false, 'a retry refusal cannot prove an earlier POST did not commit');
    assert.equal(h.state.pending.requestId, cmd.requestId);
    assert.deepEqual(checks, [cmd.requestId]);
  });
}
await check('a fresh definitive refusal can clear its never-retried command', async () => {
  const h = harness();
  h.context.api = async () => { const error = new h.context.ApiError('too_many_searching', 409); error.code = 'too_many_searching'; throw error; };
  await h.submit();
  assert.equal(h.calls.writes.at(-1).value, null);
  assert.equal(h.state.pending, null);
});

// applyPromo must not start while the form is locked or a quote/promo check state is live.
for (const [label, overrides] of [
  ['locked: busy', { busy: true }], ['locked: pending', { pending: pendingCommand() }], ['locked: not ready', { ready: false }],
  ['locked: locating', { locating: true }], ['locked: service unavailable', { available: false }],
  ['route not chosen', { routeChosen: false }], ['invalid freight scope', { scopeInvalid: true }],
  ['quoting', { quoting: true }], ['quoteFailed', { quoteFailed: true }], ['checking (shared by the request footer controls)', { checking: true }],
]) {
  await check(`applyPromo cannot start while ${label}: no /promos/check, checking never set`, async () => {
    const h = harness(overrides);
    await h.applyPromo('SAVE5');
    assert.equal(h.calls.posts.some(p => p.path === '/promos/check'), false, 'no promo check may start');
    assert.equal(h.calls.setChecking.includes(true), false, 'checking must not be set');
  });
}
await check('applyPromo checks the typed code against the current price', async () => {
  const h = harness();
  await h.applyPromo('SAVE5');
  assert.deepEqual(h.calls.posts, [{ path: '/promos/check', body: { code: 'SAVE5', price: 48 } }]);
  assert.deepEqual(h.calls.setPromo, [{ code: 'SAVE5', discount: 5, price: 48 }]);
  assert.deepEqual(h.calls.setChecking, [true, false]);
});

if (failures.length) {
  console.error(`\n${failures.length} guard check(s) FAIL on this checkout:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nBooking submit/promo guard checks all passed');
