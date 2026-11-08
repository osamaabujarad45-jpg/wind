import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { newBooking, pendingOutcome, pendingSettlesAt, readBooking } from '../src/booking.ts';
import { noteServerDate } from '../src/api-clock.ts';

const source = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const slice = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${from} must come before ${to}`);
  return source.slice(start, end);
};
const restore = slice('  useEffect(() => {\n    let mounted = true;', 'storageAttempt]);');
const retry = source.match(/^  const retryStorage = [^\n]+;/m)?.[0];
const availability = slice('  async function retryAvailability() {', '  // Per-field problems');

// A refused retry leaves the answer unknown until the command's deadline; the card names that time and re-checks by itself.
{
  const command = newBooking({ service: 'parcel' }, 1_000_000);
  const settles = pendingSettlesAt(command);
  assert.equal(pendingOutcome(null, command, settles - 1).state, 'unknown', 'still unknown just before the settle time');
  assert.equal(pendingOutcome(null, command, settles + 1).state, 'absent', 'a real absence just after it');
  assert.equal(pendingSettlesAt({}), null, 'a command without a deadline never claims a time');
  assert.match(source, /\}, Math\.max\(0, settlesAt - Date\.now\(\)\) \+ 1_000\)/, 'the screen re-checks at the deadline');
  assert.match(source, /again = setInterval\(\(\) => \{ void checkPending\(pending\); \}, 15_000\)/, 'and keeps re-checking while the answer stays unknown');
  assert.match(source, /clearTimeout\(timer\); clearInterval\(again\);/, 'both timers stop with the screen');
  // A skewed device clock: the deadline is server time, the timer runs on the device.
  noteServerDate(new Date(Date.now() + 60_000).toUTCString(), Date.now());
  assert.ok(Math.abs(pendingSettlesAt(command) - (settles - 60_000)) < 2_000, 'a device a minute behind the server unlocks a minute earlier on its own clock');
  noteServerDate(new Date().toUTCString(), Date.now()); // back to no skew for the checks below
  assert.match(source, /fill\(c\.bookingRecoveryUntil, \{ t: time\(settlesAt\) \}\)/, 'the card says when Edit and Discard unlock');
}
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const pending = newBooking({ service: 'parcel', option: 'small', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null,
  pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599123456', detail: 'Box', loadingHelp: false, shared: false, quotedPrice: 20 });
const settle = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

function screen(saved = null) {
  const state = { ready: false, copyFailed: false, error: '', refreshingAvailability: false, attempts: 0, copies: 0, checks: 0, quotes: 0 };
  let effect, held, heldStorage, failCopy = true, failRefresh = false;
  const context = {
    readBooking, savedKey: 'booking.1', params: { again: '42' }, copied: { current: null }, latest: { current: null }, pickupTouched: { current: false },
    useEffect: fn => { effect = fn; },
    storage: { get: async () => { if (heldStorage) await heldStorage; return saved; }, set: async () => {} },
    api: async () => { state.copies++; if (failCopy) throw new Error('network'); return { id: 42 }; },
    againForm: () => ({ contact: '' }), pickupForm: () => ({}), freightDraftFromScope: () => ({}),
    checkPending: async () => { state.checks++; },
    c: { orderAgainFailed: 'copy failed', bookingStorageError: 'storage failed' }, err: error => error.message,
    get pending() { return saved ? pending : null; },
    busy: false, sending: { current: false }, alive: { current: true },
    get refreshingAvailability() { return state.refreshingAvailability; },
    refresh: async report => { assert.equal(report, true); if (held) await held; if (failRefresh) throw new Error('offline'); },
    requote: () => { state.quotes++; },
    setReady: value => { state.ready = value; }, setCopyFailed: value => { state.copyFailed = value; }, setError: value => { state.error = value; },
    setRefreshingAvailability: value => { state.refreshingAvailability = value; }, setStorageAttempt: fn => { state.attempts = fn(state.attempts); },
  };
  for (const name of ['Pending', 'Service', 'PickupCity', 'DropoffCity', 'PickupChosen', 'DropoffChosen', 'Step', 'PickupPoint', 'DropoffPoint',
    'PickupNote', 'DropoffNote', 'Contact', 'Detail', 'Option', 'LoadingHelp', 'Freight', 'LoadingHours', 'RecipientName', 'RecipientPhone', 'When', 'Slot', 'SameFrom', 'CopiedFrom']) context[`set${name}`] = () => {};
  runInNewContext(compile(`${retry}\n${availability}\nglobalThis.retry = retryStorage; globalThis.availability = retryAvailability;\n${restore}`), context);
  return { state, context, mount: () => effect(), allowCopy: () => { failCopy = false; }, failRefresh: () => { failRefresh = true; }, hold: promise => { held = promise; }, holdStorage: promise => { heldStorage = promise; } };
}

let releaseStorage;
const abandoned = screen(); abandoned.state.copyFailed = true;
abandoned.holdStorage(new Promise(resolve => { releaseStorage = resolve; }));
const cleanup = abandoned.mount();
assert.equal(abandoned.state.copyFailed, true, 'mount does not synchronously reset copy state before storage returns');
cleanup(); releaseStorage(); await settle();
assert.equal(abandoned.state.copyFailed, true, 'late storage cannot reset an unmounted form');
assert.equal(abandoned.state.copies, 0);

const failed = screen(); failed.mount(); await settle();
assert.equal(failed.state.ready, true, 'a failed copy still allows manual entry');
assert.equal(failed.state.copyFailed, true, 'the failed copy exposes its own Retry');
failed.context.retry();
assert.equal(failed.state.ready, false, 'Retry locks editing until pending storage has been checked again');
failed.allowCopy(); failed.mount(); await settle();
assert.equal(failed.state.copyFailed, false);
assert.equal(failed.state.copies, 2);
assert.equal(failed.context.copied.current, '42:undefined');

const recovery = screen(JSON.stringify(pending)); recovery.mount(); await settle();
assert.equal(recovery.state.copies, 0, 'stored commands take precedence over order-again copying');
assert.equal(recovery.state.checks, 1);
await recovery.context.availability();
assert.equal(recovery.state.quotes, 0, 'availability Retry cannot re-quote a frozen command');

const unavailable = screen(); unavailable.failRefresh(); await unavailable.context.availability();
assert.equal(unavailable.state.error, 'offline', 'explicit Retry makes network failure visible');
assert.equal(unavailable.state.refreshingAvailability, false);
let release; const switched = screen(); switched.hold(new Promise(resolve => { release = resolve; }));
const refreshing = switched.context.availability(); switched.context.alive.current = false; release(); await refreshing;
assert.equal(switched.state.quotes, 0, 'a late refresh cannot change the unmounted account form');

assert.match(source, /onRetry=\{[^\n]*copyFailed[^\n]*retryStorage/);
assert.match(source, /copyFailed && !pending/);
assert.match(source, /onPress=\{retryAvailability\}/);
console.log('Booking copy and availability Retry preserve pending precedence and report explicit failures');
