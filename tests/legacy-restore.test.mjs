// An app update keeps what the old version saved (`adb install -r`; a fresh install never has an old copy). Each blob below
// is written as an earlier version wrote it, without the fields added since. It must be dropped at the load boundary,
// restored with a default there, or restored as-is where every reader treats the missing field as optional.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readOfflineSummary } from '../src/offline-summary.ts';
import { readDriverCommand } from '../src/driver-command.ts';
import { readBooking } from '../src/booking.ts';

const uuid = '0f8b2c1e-6a4d-4c3b-9e2f-1a2b3c4d5e6f';

// Offline summary before 12 Nov (14ecf776): orders had no scheduledFor. Restored as "not scheduled", not undefined.
const oldSummary = { schemaVersion: 1, actorId: 4, role: 'customer', savedAt: 1000,
  orders: [{ id: 9, service: 'parcel', status: 'assigned', pickupCity: 'ramallah', dropoffCity: 'nablus' }] };
assert.equal(readOfflineSummary(oldSummary, 2000, 60_000).orders[0].scheduledFor, null);

// Driver command before 15 Nov (wp01 cash, SHIP-17 refusal, seals): no collectedCents, detail or seals. All optional to
// every reader; a shop door advance without collectedCents is refused by the server (server/domain/shop.ts).
const oldCommand = { schemaVersion: 1, actorId: 9, orderId: 5, action: 'advance', requestId: uuid, createdAt: 1000, expiresAt: 61_000,
  expectedStatus: 'in_transit', expectedAssignedAt: 100, payload: { code: '1234' } };
assert.deepEqual(readDriverCommand(oldCommand), oldCommand);

// Pending booking before 15 Nov (A12 priority) and the recipient/pricing fields: restored as-is; book.tsx defaults them.
const oldBooking = { requestId: uuid, payload: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null,
  pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599123456', detail: 'Box', option: 'small', loadingHelp: false, shared: false, quotedPrice: 48 } };
assert.equal(readBooking(JSON.stringify(oldBooking)).payload.priority, undefined);

// Shop cart: the real load path, from the saved string to what useCart hands the cart screen.
const saved = new Map();
const modules = {
  react: 'export const useSyncExternalStore = (_subscribe, get) => get();',
  './storage': 'export const storage = { get: async key => globalThis.__legacyCart.get(key) ?? null, set: async () => {} };',
};
globalThis.__legacyCart = saved;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes('/src/shop-cart.ts')) {
      if (specifier in modules) return { url: `legacy-cart:${specifier}`, shortCircuit: true };
      if (specifier === './model') return next('./model.ts', context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    return url.startsWith('legacy-cart:') ? { format: 'module', source: modules[url.slice(12)], shortCircuit: true } : next(url, context);
  },
});
try {
  const line = { itemId: 3, nameAr: 'بندورة', nameEn: 'Tomatoes', unitAgorot: 800, byWeight: true, qtyMilli: 1000, policy: 'ask_first' };
  const cart = { merchantId: 1, merchantName: 'Market', city: 'tulkarm', minOrderAgorot: 3000, deliveryFeeAgorot: 1200, serviceFeeAgorot: 300, lines: [line] };
  const { readCart } = await import('../src/shop-cart.ts');
  assert.deepEqual(readCart(cart), cart);
  const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));
  for (const key of ['city', 'minOrderAgorot', 'deliveryFeeAgorot', 'serviceFeeAgorot'])
    assert.equal(readCart(without(cart, key)), null, `a cart without ${key} is dropped, not shown as NaN`);
  for (const key of ['nameAr', 'nameEn', 'byWeight', 'policy'])
    assert.equal(readCart({ ...cart, lines: [without(line, key)] }), null, `a line without ${key} is dropped`);
  assert.equal(readCart({ ...cart, lines: [{ ...line, policy: 'keep' }] }), null, 'an unknown policy is dropped');
  assert.equal(readCart({ ...cart, lines: [null] }), null);
  assert.equal(readCart({ ...cart, city: 'nowhere' }), null, 'an unknown city id is dropped: city() would throw on screen');
  assert.equal(readCart({ ...cart, lines: [] }), null, 'save() never writes an empty cart');

  saved.set('wind.shopCart.v1', JSON.stringify(without(cart, 'deliveryFeeAgorot')));
  const { useCart } = await import('../src/shop-cart.ts?old');
  useCart(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(useCart(), null, 'an older saved cart opens empty');
  saved.set('wind.shopCart.v1', JSON.stringify(cart));
  const fresh = await import('../src/shop-cart.ts?current');
  fresh.useCart(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fresh.useCart(), cart, 'a complete saved cart comes back');
} finally { hooks.deregister(); delete globalThis.__legacyCart; }
console.log('PASS: blobs saved by earlier versions are dropped, defaulted or read as optional at the load boundary');
