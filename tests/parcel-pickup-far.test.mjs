import assert from 'node:assert/strict';
import { copy } from '../src/copy.ts';
import { crowKm } from '../src/model.ts';
import { PARCEL_PICKUP_FAR_KM, RIDE_ARRIVAL_FIX_MAX_AGE_MS, parcelPickupFarKm } from '../src/ride-flow.ts';

const now = 1_000_000;
const pickupPoint = { latitude: 32, longitude: 35 };
const driverLocation = { latitude: 32.1, longitude: 35, updatedAt: now, ageSeconds: 0 };
const order = { service: 'parcel', status: 'assigned', pickupPoint, driverLocation };
const distance = crowKm(pickupPoint, driverLocation);

assert.equal(PARCEL_PICKUP_FAR_KM, 1);
assert.ok(distance > PARCEL_PICKUP_FAR_KM);
assert.equal(parcelPickupFarKm(order, now), distance, 'far assigned parcel reports distance');
assert.equal(parcelPickupFarKm({ ...order, status: 'at_pickup' }, now), distance, 'far pickup reports distance');
assert.equal(parcelPickupFarKm({ ...order, driverLocation: { ...driverLocation, latitude: 32.001 } }, now), null, 'near pickup');
assert.equal(parcelPickupFarKm({ ...order, driverLocation: { ...driverLocation, latitude: 32.0089 } }, now), null, 'just under 1 km');
assert.ok(parcelPickupFarKm({ ...order, driverLocation: { ...driverLocation, latitude: 32.0091 } }, now) > 1, 'just over 1 km');
assert.equal(parcelPickupFarKm({ ...order, pickupPoint: null }, now), null, 'missing pickup point: never claim a distance it does not know');
assert.equal(parcelPickupFarKm({ ...order, driverLocation: { ...driverLocation, updatedAt: now - RIDE_ARRIVAL_FIX_MAX_AGE_MS - 1_000 } }, now), null, 'stale fix');
assert.equal(parcelPickupFarKm({ ...order, driverLocation: { ...driverLocation, ageSeconds: RIDE_ARRIVAL_FIX_MAX_AGE_MS / 1000 + 1 } }, now), null, 'server-reported stale fix');
assert.equal(parcelPickupFarKm({ ...order, driverLocation: null }, now), null, 'missing fix');
assert.equal(parcelPickupFarKm({ ...order, driverLocation: undefined }, now), null, 'absent fix');
assert.equal(parcelPickupFarKm({ ...order, service: 'ride' }, now), null, 'rides have their own arrival fence');
assert.equal(parcelPickupFarKm({ ...order, service: 'freight' }, now), distance, 'non-ride orders included');
for (const status of ['searching', 'in_transit', 'completed', 'cancelled'])
  assert.equal(parcelPickupFarKm({ ...order, status }, now), null, `${status} excluded`);
for (const language of ['ar', 'en']) for (const key of ['parcelPickupFar', 'parcelPickupFarConfirm']) {
  assert.ok(copy[language][key]?.trim(), `${language} ${key} exists`);
  assert.ok(copy[language][key].includes('{km}'), `${language} ${key} includes distance`);
}
console.log('parcel-pickup-far: ok');
