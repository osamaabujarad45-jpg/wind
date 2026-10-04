import assert from 'node:assert/strict';
import { newBooking, readBooking } from '../src/booking.ts';
import { locationState } from '../src/location-state.ts';

const payload = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null,
  pickupNote: 'محل', dropoffNote: 'الدوار', contact: '0599123456', detail: 'كتب', option: 'small', loadingHelp: false, shared: false, quotedPrice: 48 };
const pending = newBooking(payload);
assert.deepEqual(readBooking(JSON.stringify(pending)), pending); // restart keeps the same command and terms
assert.notEqual(newBooking(payload).requestId, pending.requestId);
assert.equal(readBooking(null), null);
const promo = newBooking({ ...payload, promoCode: 'WELCOME10', expectedDiscount: 10 });
assert.deepEqual(readBooking(JSON.stringify(promo)), promo);
for (const saved of ['{', 'null', JSON.stringify({ ...pending, payload: { ...payload, pickupCity: 'outside' } }),
  JSON.stringify({ ...pending, payload: { ...payload, quotedPrice: null } }), JSON.stringify({ ...pending, requestId: 'bad' }), JSON.stringify({ ...pending, payload: { ...payload, promoCode: 'WELCOME10' } })]) {
  assert.throws(() => readBooking(saved));
}
assert.equal(locationState(null, 180000), null);
const location = { latitude: 31.9, longitude: 35.2, updatedAt: 60000, ageSeconds: 0 };
assert.deepEqual(locationState(location, 179000), { ageSeconds: 119, stale: false });
assert.deepEqual(locationState(location, 180000), { ageSeconds: 120, stale: true });
assert.deepEqual(locationState(location, 1000), { ageSeconds: 0, stale: false });
assert.deepEqual(locationState({ ...location, ageSeconds: 130 }, 1000), { ageSeconds: 130, stale: true }); // server age survives a slow device clock
console.log('Booking recovery and location freshness checks passed');
