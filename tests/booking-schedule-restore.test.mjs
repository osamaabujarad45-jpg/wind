import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { newBooking, readBooking, scheduleSlots } from '../src/booking.ts';

// Regression tests for the scheduled-booking screen (src/app/book.tsx):
//
//   1. A slot that went stale (the form sat open past it) must be refused AND the schedule must be
//      regenerated from the current clock. Clearing the slot alone reselects the very slot the server
//      just refused, so the customer cannot book until the next half-hour tick.
//   2. A restored immediate pending command on a ?when=later route must show "Now" and must not derive
//      a schedule of its own.
//
// The callbacks and derivations under test are sliced out of src/app/book.tsx and transpiled with the
// installed TypeScript (the pattern of booking-submit-guards.test.mjs): the app's slot logic is never
// reimplemented here, only driven.
//
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/booking-schedule-restore.test.mjs

const source = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const slice = (from, to) => {
  const a = source.indexOf(from);
  assert.ok(a >= 0, `src/app/book.tsx must contain ${JSON.stringify(from)}`);
  const b = source.indexOf(to, a + from.length);
  assert.ok(b > a, `src/app/book.tsx must contain ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return source.slice(a, b);
};

// The real screen logic, verbatim.
const deriveSrc = slice('  const slots = useMemo(', '  const wantsScope =');                        // slots, chosen, scheduledFor
const submitSrc = slice('  async function submit() {', '  /** Drop a command');                      // the stale-slot refusal
const submitGuardSrc = source.match(/^  const submitBlocked = [^\n]+;/m)?.[0];
assert.ok(submitGuardSrc, 'the screen shares its callback submission guard');
const restoreSrc = slice('  useEffect(() => {\n    let mounted = true;', 'storageAttempt]);');   // restoring a stored command
const choiceValueSrc = source.match(/<Choices label=\{c.whenTitle\} items=\{\[\{ key: 'now'[^\n]*\}\]\} value=\{([^}]*)\}/)?.[1];
const whenInitSrc = source.match(/const \[when, setWhen\] = useState<'now' \| 'later'>\((.*)\);/)?.[1];
assert.ok(choiceValueSrc, 'the Now/Later choice must read its selected value from the screen state');
assert.ok(whenInitSrc, 'the screen must pick its Now/Later choice from the route');

const transpile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;

// One clock for the whole file: everything under test reads the time through Date.now().
const CLOCK = { now: 0 };
const realNow = Date.now;
Date.now = () => CLOCK.now;
class ScreenDate extends Date { static now() { return CLOCK.now; } }

// A minimal React. Only the useMemo dependency check matters here: the screen derives its slots in a
// memo, so a memo that never recomputes is exactly the stale-list behaviour under test.
function createHooks() {
  const cells = [];
  let index = 0;
  const hooks = {
    useMemo(fn, deps) {
      const i = index++;
      const cell = cells[i] || (cells[i] = { deps: undefined, value: undefined, ready: false });
      const unchanged = cell.ready && cell.deps && deps && cell.deps.length === deps.length
        && cell.deps.every((d, j) => Object.is(d, deps[j]));
      if (!unchanged) { cell.value = fn(); cell.deps = deps; cell.ready = true; }
      return cell.value;
    },
    useEffect(fn) { index++; fn(); },   // mount only: the restore effect runs once
  };
  return { hooks, begin: () => { index = 0; } };
}

const POINT_A = { latitude: 31.9522, longitude: 35.2332 }, POINT_B = { latitude: 32.2211, longitude: 35.3684 };

// The screen's own opening choice, decided by the real initialiser.
const whenInit = params => new Function('params', `return (${whenInitSrc});`)(params);

/** A screen with the real derivations, the real submit callback and the real restore effect in it. */
function createScreen({ slotBucketAt, saved = null, params = {} } = {}) {
  const screen = {
    when: whenInit(params),           // the Now/Later choice
    slot: null,                       // the picked slot
    slotBucket: { bucket: Math.floor(slotBucketAt / (30 * 60_000)), at: slotBucketAt },
    pending: null,                    // the restored command
  };
  const calls = { error: [], sheet: [], haptic: [], slot: [], bucket: [], when: [], pending: [] };
  const setSlot = v => { calls.slot.push(v); screen.slot = v; };
  const setSlotBucket = v => { calls.bucket.push(v); screen.slotBucket = typeof v === 'function' ? v(screen.slotBucket) : v; };
  const setWhen = v => { calls.when.push(v); screen.when = v; };
  const setPending = v => { calls.pending.push(v); screen.pending = v; };
  const { hooks, begin } = createHooks();
  let derived = { slots: [], chosen: null, scheduledFor: null };

  const context = {
    Date: ScreenDate, scheduleSlots, readBooking,
    useMemo: hooks.useMemo, useEffect: hooks.useEffect,
    // the screen state the real derivations read
    get when() { return screen.when; },
    get slot() { return screen.slot; },
    get slotBucket() { return screen.slotBucket; },
    get pending() { return screen.pending; },
    get scheduledFor() { return derived.scheduledFor; },
    setSlot, setSlotBucket, setWhen, setPending,
    // the flags the real guards read
    ready: true, available: true, scopeInvalid: false, routeChosen: true, pickupChosen: true,
    locating: false, resolving: false, quoting: false, quoteFailed: false, checking: false,
    get submitBlocked() { return context.blocked(); },
    sending: { current: false }, settled: { current: false }, latest: { current: null }, scrollRef: { current: null },
    alive: { current: true }, apiSessionRevision: () => 0,
    pickupTouched: { current: false }, copied: { current: null }, invalid: {},
    service: 'parcel', option: 'small', pickupNote: 'Gate 3', dropoffNote: 'Door B', detail: 'Box',
    contact: '0599123456', recipientName: '', recipientPhone: '', loadingHelp: false, declaredScope: undefined,
    pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: POINT_A, dropoffPoint: POINT_B,
    haptic: { error() { calls.haptic.push('error'); }, success() {}, tap() {} },
    c: new Proxy({}, { get: (_t, key) => String(key) }),
    setError: v => calls.error.push(v), setSheetOpen: v => calls.sheet.push(v),
    setField: () => {}, setStep: () => {}, setInvalid: () => {}, setBusy: () => {}, setReady: () => {}, setCopyFailed: () => {},
    setService: () => {}, setPickupCity: () => {}, setDropoffCity: () => {}, setPickupChosen: () => {}, setDropoffChosen: () => {},
    setPickupPoint: () => {}, setDropoffPoint: () => {}, setPickupNote: () => {}, setDropoffNote: () => {},
    setContact: () => {}, setDetail: () => {}, setOption: () => {}, setLoadingHelp: () => {}, setFreight: () => {},
    setLoadingHours: () => {}, setRecipientName: () => {}, setRecipientPhone: () => {}, freightDraftFromScope: () => ({}),
    Platform: { OS: 'web' }, AccessibilityInfo: { announceForAccessibility() {} },
    isValidPhone: () => true, err: e => String(e), fill: t => t, money: v => `${v}`,
    api: async () => ({}), router: { replace() {}, push() {} },
    storage: { get: async () => saved, set: async () => {} },
    savedKey: 'booking.1', checkPending: async () => {}, params,
  };

  runInNewContext(transpile(
    'globalThis.render = () => {\n' + deriveSrc + '\nreturn { slots, chosen, scheduledFor };\n};\n'
    + 'globalThis.whenInit = (params) => (' + whenInitSrc + ');\n'
     + 'globalThis.choiceValue = () => (' + choiceValueSrc + ');\n'
     + 'globalThis.blocked = () => {\n' + submitGuardSrc + '\nreturn submitBlocked;\n};\n'
    + submitSrc + '\nglobalThis.submit = submit;\n'
    + restoreSrc + '\n',
  ), context);

  const render = () => { begin(); derived = context.render(); return derived; };
  return { screen, calls, context, render };
}

const failures = [];
async function check(name, fn) {
  try { await fn(); console.log('ok    ' + name); }
  catch (e) { failures.push(name); console.log('FAIL  ' + name + ' :: ' + (e && e.message ? e.message : e)); }
}

// --- 1. the stale-slot refusal must regenerate the schedule from the current clock ------------------
// 12:00 in Hebron on 2026-11-08. Slots are half-hourly and always at least an hour ahead.
const BASE = Date.UTC(2026, 10, 8, 9, 0);
const STALE_CASES = [
  { name: 'the list was not refreshed while the form sat open', listAt: BASE, now: BASE + 65 * 60_000 },
  { name: 'the list was refreshed at the half hour, but its first slot is now under an hour away', listAt: BASE + 60 * 60_000, now: BASE + 65 * 60_000 },
];

/** Open the screen, let the customer pick the first slot, then let the form sit open past it. */
async function staleScenario(c) {
  CLOCK.now = c.listAt;
  const harness = createScreen({ slotBucketAt: c.listAt, params: { when: 'later' } });
  const opened = harness.render();
  const picked = opened.slots[0];
  harness.context.setSlot(picked);
  harness.render();
  CLOCK.now = c.now;                                   // the form sits open past that slot
  const before = harness.render();
  await harness.context.submit();
  const after = harness.render();
  return { ...harness, picked, before, after };
}

for (const c of STALE_CASES) {
  await check(`stale slot: the refusal is still reported (${c.name})`, async () => {
    const h = await staleScenario(c);
    assert.equal(h.before.scheduledFor, h.picked, 'the picked slot is the scheduled time');
    assert.ok(h.calls.error.includes('err_invalid_schedule'), 'the stale slot must be refused');
    assert.ok(h.calls.sheet.includes(true), 'the sheet must open on the refusal');
    assert.ok(h.calls.haptic.includes('error'), 'the refusal must be felt');
  });

  await check(`stale slot: the screen then offers a slot the server still accepts (${c.name})`, async () => {
    const h = await staleScenario(c);
    assert.ok(h.after.chosen !== null, 'a slot must be offered after the refusal');
    assert.ok(h.after.chosen >= CLOCK.now + 60 * 60_000,
      `the offered slot ${new Date(h.after.chosen).toISOString()} is under an hour ahead at ${new Date(CLOCK.now).toISOString()}: the customer is stuck on the slot that was just refused`);
  });

  await check(`stale slot: the schedule is regenerated from the current clock (${c.name})`, async () => {
    const h = await staleScenario(c);
    assert.deepEqual(h.after.slots, scheduleSlots(CLOCK.now),
      'the offered slots must be recomputed from the current clock, not left on the list that was already stale');
    assert.ok(h.after.slots.every(s => s > CLOCK.now), 'no offered slot may already have passed');
  });
}

// --- 2. a restored immediate command on a ?when=later route must show "Now" --------------------------
CLOCK.now = BASE;
const immediate = newBooking({ service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
  pickupPoint: POINT_A, dropoffPoint: POINT_B, pickupNote: 'Gate 3', dropoffNote: 'Door B',
  contact: '0599123456', detail: 'Fragile box', option: 'small', loadingHelp: false, shared: false, quotedPrice: 48 });
assert.equal(immediate.payload.scheduledFor, undefined, 'the stored command is an immediate one');
const saved = JSON.stringify(immediate);
assert.ok(readBooking(saved), 'the stored command must be readable');

async function restoredScenario(command = immediate, routeWhen = 'later') {
  CLOCK.now = BASE;
  const harness = createScreen({ slotBucketAt: BASE, saved: JSON.stringify(command), params: { when: routeWhen } });
  await new Promise(resolve => setTimeout(resolve, 0));    // the restore effect reads storage
  await new Promise(resolve => setTimeout(resolve, 0));
  const derived = harness.render();
  return { ...harness, derived };
}

await check('a restored immediate command is restored at all', async () => {
  const h = await restoredScenario();
  assert.equal(h.screen.pending?.requestId, immediate.requestId, 'the stored command must be restored');
});

await check('a restored immediate command on a ?when=later route shows Now', async () => {
  const h = await restoredScenario();
  assert.equal(h.context.choiceValue(), 'now',
    'the Now/Later choice must show Now for a command that was sent for now, whatever the route asked for');
});

await check('a restored immediate command derives no schedule of its own', async () => {
  const h = await restoredScenario();
  assert.equal(h.derived.scheduledFor, null,
    'an immediate command must not carry a derived schedule: the screen would show a pickup time the command never had');
});

const scheduled = newBooking({ ...immediate.payload, scheduledFor: BASE - 30 * 60_000 });
await check('a restored scheduled command on a ?when=now route shows Later', async () => {
  const h = await restoredScenario(scheduled, 'now');
  assert.equal(h.context.choiceValue(), 'later');
});
await check('a restored scheduled command displays its frozen time even outside the current slot list', async () => {
  const h = await restoredScenario(scheduled, 'now');
  assert.ok(!h.derived.slots.includes(scheduled.payload.scheduledFor));
  assert.equal(h.derived.scheduledFor, scheduled.payload.scheduledFor);
  assert.equal(h.screen.pending.requestId, scheduled.requestId);
});

Date.now = realNow;

if (failures.length) {
  console.error(`\n${failures.length} schedule check(s) FAIL on this checkout:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nBooking schedule and restore checks all passed');
