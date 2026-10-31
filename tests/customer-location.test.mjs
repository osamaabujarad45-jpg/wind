import assert from 'node:assert/strict';
import { browserPickupWatch, cachedPickup, findPickup, pickupFromFix, withPickupPermission } from '../src/customer-location.ts';

const now = Date.now();
const fix = (extra = {}) => ({ timestamp: now, coords: { latitude: 32.312773, longitude: 35.048039, accuracy: 52.4 }, ...extra });
assert.equal(pickupFromFix(fix(), now).city, 'tulkarm', 'a Tulkarm fix selects Tulkarm, independently of the previous pickup city');
assert.equal(pickupFromFix(fix({ timestamp: now - 31_000 }), now).error, 'inaccurate');
for (const accuracy of [null, -1, 101, NaN]) {
  assert.equal(pickupFromFix(fix({ coords: { ...fix().coords, accuracy } }), now).error, 'inaccurate');
}
assert.equal(pickupFromFix(fix({ coords: { latitude: 0, longitude: 0, accuracy: 5 } }), now).error, 'outside');

let stopped = 0;
const result = await findPickup(async receive => {
  receive(fix({ timestamp: now - 60_000 })); // an old first callback must not become the pickup
  receive(fix());
  return { remove() { stopped++; } };
});
assert.equal(result.city, 'tulkarm');
await new Promise(resolve => setImmediate(resolve));
assert.equal(stopped, 1, 'stop GPS even if a fix arrives before subscription registration resolves');

let finishRegistration;
await assert.rejects(findPickup(() => new Promise(resolve => { finishRegistration = resolve; }), undefined, 5), /timeout/);
finishRegistration({ remove() { stopped++; } });
await new Promise(resolve => setImmediate(resolve));
assert.equal(stopped, 2, 'a subscription arriving after timeout is immediately removed');

const abort = new AbortController();
const cancelled = findPickup(async () => ({ remove() { stopped++; } }), abort.signal);
await new Promise(resolve => setImmediate(resolve));
abort.abort();
await assert.rejects(cancelled, /cancelled/);
assert.equal(stopped, 3, 'leaving the screen cancels location collection');
await assert.rejects(findPickup(async (_receive, fail) => { fail('provider unavailable'); return { remove() { stopped++; } }; }), /^Error: unavailable$/); // native free-text reason
// Browser watch: high accuracy and no cached fix, provider errors reach the caller, cleanup clears the browser's own ID.
const cleared = [];
let browserFail;
const browser = { watchPosition(receive, fail, options) {
  assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
  browserFail = fail; setImmediate(() => receive(fix())); return 41;
}, clearWatch(id) { cleared.push(id); } };
assert.equal((await findPickup(browserPickupWatch(browser))).city, 'tulkarm');
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(cleared, [41]);
const denied = findPickup(browserPickupWatch({ ...browser, watchPosition(_receive, fail) { browserFail = fail; return 42; } }));
await new Promise(resolve => setImmediate(resolve));
browserFail({ code: 1 });
await assert.rejects(denied, /permission/);
assert.deepEqual(cleared, [41, 42]);
await assert.rejects(findPickup(browserPickupWatch(undefined)), /unavailable/);
let grant, nativeStarts = 0;
const nativeWatch = async receive => { nativeStarts++; receive(fix()); return { remove() {} }; };
await assert.rejects(findPickup(withPickupPermission(() => new Promise(resolve => { grant = resolve; }), nativeWatch), undefined, 5), /timeout/);
grant({ granted: true });
await new Promise(resolve => setImmediate(resolve));
assert.equal(nativeStarts, 0, 'late permission cannot start GPS after the form timed out');
await assert.rejects(findPickup(withPickupPermission(async () => ({ granted: false }), nativeWatch)), /permission/);
assert.equal(nativeStarts, 0, 'denied permission cannot start GPS');
assert.equal((await findPickup(withPickupPermission(async () => ({ granted: true }), nativeWatch))).city, 'tulkarm');
assert.equal(nativeStarts, 1);
const cacheSignal = new AbortController();
assert.deepEqual(await cachedPickup(async () => fix(), cacheSignal.signal), { latitude: 32.312773, longitude: 35.048039 });
assert.equal(await cachedPickup(async () => fix({ timestamp: Date.now() - 31_000 }), cacheSignal.signal), null);
assert.equal(await cachedPickup(async () => fix({ coords: { ...fix().coords, accuracy: 101 } }), cacheSignal.signal), null);
assert.equal(await cachedPickup(async () => { throw new Error('permission'); }, cacheSignal.signal), null);
let lateCache;
assert.equal(await cachedPickup(() => new Promise(resolve => { lateCache = resolve; }), cacheSignal.signal, 5), null);
lateCache(fix()); // Late native completion cannot change the already chosen fallback.
const closedPicker = new AbortController();
const cancelledCache = cachedPickup(() => new Promise(() => {}), closedPicker.signal);
closedPicker.abort();
assert.equal(await cancelledCache, null);
console.log('Customer pickup location: Tulkarm selection, freshness, accuracy, bounds, timeout and cancellation passed');
