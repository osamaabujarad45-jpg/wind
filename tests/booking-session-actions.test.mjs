import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { newBooking, orderRequest, pendingKey, pendingOutcome } from '../src/booking.ts';
import { ApiError, apiSessionRevision, configureApi, errorCode, invalidateApiSessionActions, request } from '../src/api-client.ts';
import { isValidPhone } from '../src/model.ts';

// Real Booking callbacks and API credential fencing; only storage/transport are paused.
const source = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const slice = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${from} must precede ${to}`);
  return source.slice(start, end);
};
const callbacks = slice('  const checkPending = useCallback(', '  useEffect(() => {\n    let mounted = true;')
  + slice('  async function applyPromo(', '  function switchService(')
  + slice('  async function submit() {', '  const located =');
const compiled = ts.transpileModule(`${callbacks}\nglobalThis.actions = { submit, checkPending, release };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const command = () => newBooking({ service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null,
  pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599123456', detail: 'Box', option: 'small', loadingHelp: false, shared: false, quotedPrice: 20 });
let active;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const response = active.responses[new URL(url).searchParams.get('path')];
  active.sent.push({ bearer: options.headers.Authorization, body: options.body && JSON.parse(options.body) });
  active.arrived.resolve();
  response?.arrived?.resolve();
  if (response?.transport ?? active.transport) await (response?.transport ?? active.transport).promise;
  return new Response(JSON.stringify(response?.answer ?? active.answer), { status: response?.status ?? 200, headers: { 'Content-Type': 'application/json' } });
};

function screen(pending = null) {
  configureApi('booking-account-a', () => {});
  const state = { pending, sent: [], writes: [], ui: [], flags: {}, navigation: [], answer: { id: 555 }, transport: null, storageGate: null,
    writeAt: 0, arrived: gate(), storageArrived: gate(), refreshArrived: gate(), refreshGate: null, responses: {}, requests: [], sheetOpen: false };
  active = state;
  const context = {
    useRef: value => ({ current: value }), useCallback: fn => fn, apiSessionRevision,
    alive: { current: true }, reading: { current: false }, sending: { current: false }, settled: { current: false }, latest: { current: pending }, scrollRef: { current: null }, fixMarked: { current: false },
    savedKey: pendingKey(101), pendingOutcome, newBooking, orderRequest, isValidPhone, ApiError, errorCode,
    api: (path, body) => {
      const running = request('https://booking-race.invalid/callback?path=' + encodeURIComponent(path), body);
      state.requests.push(running); return running;
    },
    storage: { set: async (key, value, secure) => {
      const at = ++state.writeAt;
      state.writes.push({ key, value, secure });
      if (state.storageGate?.at === at) { state.storageArrived.resolve(); await state.storageGate.promise; }
    } },
    get pending() { return state.pending; },
    submitBlocked: false, scopeInvalid: false, routeChosen: true, scheduledFor: null, service: 'parcel',
    pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null, dropoffPoint: null, pickupNote: 'Gate', dropoffNote: 'Door',
    contact: '0599123456', detail: 'Box', option: 'small', loadingHelp: false, price: 20, declaredScope: null,
    recipientPhone: '', recipientName: '', applied: null, smart: null, busy: false, releasable: true,
    promoBlocked: false, checking: false, fill: value => value, money: String,
    AccessibilityInfo: { announceForAccessibility: () => state.ui.push('announce') },
    err: error => error.message, c: new Proxy({}, { get: (_, key) => String(key) }),
    haptic: { tap: () => state.ui.push('tap'), error: () => state.ui.push('error'), success: () => state.ui.push('success') },
    router: { replace: value => state.navigation.push(value) }, refresh: async () => {
      state.refreshArrived.resolve(); if (state.refreshGate) await state.refreshGate.promise;
    }, requote: () => state.ui.push('requote'),
    setPending: value => { state.pending = value; state.ui.push('pending'); },
  };
  for (const name of ['Invalid', 'Error', 'Outcome', 'SheetOpen', 'Promo', 'PromoError', 'PromoInput', 'Credits']) context[`set${name}`] = () => state.ui.push(name);
  // Busy flags are not data: they must clear while the form is mounted, even after the session revision moved.
  for (const name of ['Busy', 'Resolving', 'Checking']) context[`set${name}`] = value => { state.flags[name] = value; };
  context.setSheetOpen = value => { state.sheetOpen = value; state.ui.push('SheetOpen'); };
  runInNewContext(compiled, context);
  return { state, context, ...context.actions };
}
const failures = [];
async function check(name, run) {
  try { await run(); console.log('ok ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
}

try {
  for (const pending of [null, command()]) {
    for (const change of ['switch-account', 'sign-out-starts', 'unmount']) {
      await check(`${pending ? 'retry' : 'fresh'} storage-paused submit stops on ${change}`, async () => {
        const h = screen(pending), wait = gate();
        h.state.storageGate = { at: 1, ...wait };
        const submitting = h.submit();
        assert.equal(h.state.writes.length, 1, 'the callback is paused inside storage');
        if (change === 'switch-account') configureApi('booking-account-b', () => {});
        else if (change === 'sign-out-starts') invalidateApiSessionActions();
        else h.context.alive.current = false;
        const before = h.state.ui.length;
        wait.resolve(); await submitting;
        assert.equal(h.state.sent.length, 0, 'old booking must not POST under the resumed session');
        assert.equal(h.state.writes.length, 1, 'retain the original account recovery record');
        assert.equal(h.state.ui.length, before, 'late storage must not update the abandoned form');
        assert.deepEqual(h.state.navigation, []);
      });
    }
  }
  for (const change of ['switch-account', 'sign-out-starts', 'unmount']) {
    const invalidate = h => {
      if (change === 'switch-account') configureApi('booking-account-b', () => {});
      else if (change === 'sign-out-starts') invalidateApiSessionActions();
      else h.context.alive.current = false;
    };
    await check(`POST paused at response cannot complete UI after ${change}`, async () => {
      const h = screen(), wait = gate(); h.state.transport = wait;
      const submitting = h.submit();
      await h.state.arrived.promise;
      assert.equal(h.state.sent.length, 1);
      assert.equal(h.state.sent[0].bearer, 'Bearer booking-account-a');
      invalidate(h);
      const before = h.state.ui.length;
      wait.resolve(); await submitting;
      assert.equal(h.state.ui.length, before, 'late response cannot report success/error to another form');
      if (change !== 'unmount') assert.equal(h.state.flags.Busy, false, 'a mounted form never stays busy after the revision moved');
      assert.equal(h.state.writes.length, 1, 'uncertain completion keeps the recovery record');
      assert.deepEqual(h.state.navigation, []);
    });
    await check(`POST refusal cannot reopen the abandoned sheet after ${change}`, async () => {
      const h = screen(), wait = gate();
      h.state.responses['/orders'] = { transport: wait, answer: { error: 'invalid_order' }, status: 400 };
      const submitting = h.submit(); await h.state.arrived.promise;
      invalidate(h); const before = h.state.ui.length;
      wait.resolve(); await submitting;
      assert.equal(h.state.ui.length, before);
      assert.equal(h.state.sheetOpen, false);
      assert.equal(h.state.writes.length, 1, 'retain the original account recovery record');
      assert.deepEqual(h.state.navigation, []);
    });
    for (const action of ['submit', 'receipt', 'discard', 'edit', 'refusal']) {
      await check(`${action} paused at cleanup cannot navigate/update UI after ${change}`, async () => {
        const h = screen(['submit', 'refusal'].includes(action) ? null : command()), wait = gate();
        h.state.answer = action === 'receipt' ? { orderId: 555 } : { id: 555 };
        if (action === 'refusal') h.state.responses['/orders'] = { answer: { error: 'invalid_order' }, status: 400 };
        h.state.storageGate = { at: ['submit', 'refusal'].includes(action) ? 2 : 1, ...wait };
        const running = ['submit', 'refusal'].includes(action) ? h.submit() : action === 'receipt' ? h.checkPending(h.state.pending) : h.release(action === 'edit');
        await h.state.storageArrived.promise;
        assert.equal(h.state.writeAt, h.state.storageGate.at, 'paused at successful storage cleanup');
        invalidate(h);
        const before = h.state.ui.length;
        wait.resolve(); await running;
        assert.equal(h.state.ui.length, before, 'cleanup must not mutate the abandoned form');
        assert.deepEqual(h.state.navigation, [], 'cleanup must not redirect the next screen');
      });
    }
    for (const action of ['receipt', 'storage-failure', 'release-failure', 'refresh', 'referral', 'promo']) {
      await check(`${action} late continuation stops after ${change}`, async () => {
        const h = screen(['receipt', 'release-failure'].includes(action) ? command() : null), wait = gate();
        let running, continuation;
        if (action === 'receipt') {
          h.state.transport = wait; h.state.answer = { orderId: 555 };
          running = h.checkPending(h.state.pending); await h.state.arrived.promise;
        } else if (['storage-failure', 'release-failure'].includes(action)) {
          h.state.storageGate = { at: 1, ...wait };
          running = action === 'storage-failure' ? h.submit() : h.release(false);
          await h.state.storageArrived.promise;
        } else {
          const error = action === 'refresh' ? 'price_changed' : action === 'referral' ? 'invalid_promo' : 'promo_changed';
          h.state.responses['/orders'] = { answer: { error }, status: 409 };
          if (action === 'refresh') {
            h.state.refreshGate = wait; running = h.submit(); await h.state.refreshArrived.promise;
          } else {
            h.context.applied = { code: 'SYNTHETIC', discount: 1 };
            const response = { arrived: gate(), transport: wait, answer: action === 'referral' ? { credits: [] } : { code: 'SYNTHETIC', discount: 2 } };
            h.state.responses[action === 'referral' ? '/me/referral' : '/promos/check'] = response;
            running = h.submit(); await response.arrived.promise;
            await running; continuation = h.state.requests.at(-1);
          }
        }
        invalidate(h); const before = h.state.ui.length;
        if (['storage-failure', 'release-failure'].includes(action)) wait.reject(new Error('Synthetic storage failure')); else wait.resolve();
        await running; await continuation?.catch(() => {}); await Promise.resolve();
        assert.equal(h.state.ui.length, before, 'late nested completion cannot mutate the abandoned form');
        assert.deepEqual(h.state.navigation, []);
        if (['receipt', 'storage-failure'].includes(action)) assert.ok(h.state.writes.every(write => write.value !== null), 'unsettled recovery must not be cleared');
      });
    }
  }
  for (const status of [400, 503]) {
    await check(`current account ${status} refusal opens the failure sheet`, async () => {
      const h = screen(); h.state.responses['/orders'] = { answer: { error: 'invalid_order' }, status };
      await h.submit();
      assert.equal(h.state.sheetOpen, true);
      assert.ok(h.state.ui.includes('error'), 'failure haptic remains');
      assert.ok(h.state.ui.includes('Error'), 'failure feedback remains');
      assert.deepEqual(h.state.navigation, []);
      assert.equal(h.state.writes.length, status === 400 ? 2 : 1);
      if (status === 400) assert.equal(h.state.writes[1].value, null, 'fresh definitive refusal clears recovery');
      else assert.ok(h.state.pending, 'uncertain refusal retains recovery');
    });
  }
  // A lost POST is ApiError('network'), not a plain Error: it must say "saved on this device" and arm the receipt check,
  // or the card reads "can't reach Wind" and Edit/Discard stay locked past the deadline (review 8 Nov).
  for (const failure of ['network', '503']) {
    await check(`fresh ${failure} failure keeps the saved booking and asks for its receipt`, async () => {
      const h = screen(), errors = [], outcomes = [];
      h.context.setError = value => { errors.push(value); h.state.ui.push('Error'); };
      h.context.setOutcome = value => { outcomes.push(value); h.state.ui.push('Outcome'); };
      if (failure === 'network') { const down = gate(); down.reject(new Error('offline')); down.promise.catch(() => {}); h.state.transport = down; }
      else h.state.responses['/orders'] = { answer: { error: 'server_error' }, status: 503 };
      await h.submit();
      await Promise.all(h.state.requests.map(r => r.catch(() => {})));
      await new Promise(resolve => setTimeout(resolve, failure === 'network' ? 1_000 : 0)); // a failed read retries once after 800 ms
      if (failure === 'network') assert.equal(errors.at(-1), 'bookingOfflineSaved', 'a saved command says so');
      assert.equal(h.state.writes.length, 1, 'the command stays saved');
      assert.ok(h.state.sent.some(s => s.body === undefined), 'the receipt is read');
      assert.equal(outcomes.at(-1)?.state, 'unknown', 'an unknown answer arms the deadline re-check');
    });
  }
  await check('current account still submits, clears recovery and navigates', async () => {
    const h = screen(); await h.submit();
    assert.equal(h.state.sent[0].bearer, 'Bearer booking-account-a');
    assert.equal(h.state.writes[0].key, pendingKey(101));
    assert.equal(h.state.writes[1].value, null);
    assert.deepEqual(h.state.navigation, ['/order/555']);
  });
} finally { globalThis.fetch = originalFetch; configureApi(null, () => {}); }
assert.deepEqual(failures, [], 'Booking session/lifetime checks failed');
console.log('Booking session and lifetime fencing passed');
