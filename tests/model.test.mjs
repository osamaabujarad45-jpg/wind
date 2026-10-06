import assert from 'node:assert/strict';
import { defaultSettings as s, distanceKm, canTake, city, isNight, PARCEL_LOAD, nearestCity, nextStatus, normalizePhone, offerRange, quote, roadAlerts, smartPrice, statusFlow, vehicleServices, vehicles } from '../src/model.ts';

for (const ok of ['0599123456', '056-912-3456', '+970599123456', '00970569123456', '٠٥٩٩١٢٣٤٥٦']) assert.equal(normalizePhone(ok)?.length, 10, ok);
for (const bad of ['', '0521234567', '059912345', '+9705991234567']) assert.equal(normalizePhone(bad), null, bad);

const km = distanceKm(city('ramallah'), city('nablus'));
assert.ok(km > 40 && km < 50, `ramallah-nablus ${km}km`);
const trip = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false };
// SPEC-parcel-standard.md: ₪20 a parcel to any city, ₪30 large, Plus 15 % off.
assert.equal(quote(s, trip), 20);
assert.equal(quote(s, { ...trip, pickupCity: 'hebron', dropoffCity: 'jenin' }), 20);
assert.equal(quote(s, { ...trip, option: 'large' }), 30);
assert.equal(quote(s, { ...trip, plus: true }), 17);
const rideTrip = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1', shared: false };
assert.equal(quote(s, rideTrip), Math.round(s.rideBase + s.ridePerKm * km));
assert.ok(quote(s, { ...rideTrip, plus: true }) < quote(s, rideTrip));
const ride = { service: 'ride', pickupCity: 'hebron', dropoffCity: 'hebron', shared: true };
assert.equal(quote(s, { ...ride, option: '3' }), Math.round(s.rideBase * (1 - s.sharedDiscount) * 3)); // shared rides are per seat
assert.equal(quote(s, { ...ride, option: '3', shared: false }), s.rideBase);

assert.equal(nextStatus('completed'), 'completed');
assert.equal(nextStatus('cancelled'), 'cancelled');
assert.equal(nextStatus('assigned'), 'at_pickup');
assert.equal(new Set(statusFlow).size, statusFlow.length);
assert.equal(nearestCity({ latitude: 31.9038, longitude: 35.2034 }), 'ramallah');
assert.deepEqual(vehicles, ['motorcycle', 'bicycle', 'car', 'van', 'truck']);
assert.deepEqual(vehicleServices.motorcycle, ['parcel', 'ride']);
assert.deepEqual(vehicleServices.bicycle, ['parcel']);
console.log('Model checks passed');

// Delivery exceptions: a held order waits for an admin; a return ends in `returned`; no state is both active and finished.
{
  const { activeStatuses, finishedStatuses, nextStatus } = await import('../src/model.ts');
  assert.equal(nextStatus('on_hold'), 'on_hold');
  assert.equal(nextStatus('returning'), 'returned');
  assert.ok(activeStatuses.every(s => !finishedStatuses.includes(s)));
}

// Road-aware ETA (SPEC-road-aware-eta.md): only slow/closed checkpoints touching either trip city.
const road = (id, status, cities) => ({ id, name: `c${id}`, cities, status, note: '', reportedAt: 1, agreeing: 1 });
const roads = [road(1, 'closed', ['nablus']), road(2, 'slow', ['ramallah', 'bireh']), road(3, 'open', ['nablus']), road(4, null, ['ramallah']), road(5, 'closed', ['hebron'])];
assert.deepEqual(roadAlerts(roads, 'ramallah', 'nablus').map(r => r.id), [1, 2]);
assert.deepEqual(roadAlerts(roads, 'jenin', 'jenin'), []);

// Smart recommended price (SPEC-driver-offers.md). Noon and 23:30 Palestine time (UTC+3 in October).
const noon = Date.UTC(2026, 9, 6, 9, 0), night = Date.UTC(2026, 9, 6, 20, 30);
assert.ok(!isNight(noon) && isNight(night) && isNight(Date.UTC(2026, 9, 6, 2, 59)) && !isNight(Date.UTC(2026, 9, 6, 3, 0)));
const trip60 = { service: 'ride', option: '1', km: 53.3, minutes: 61, delayMinutes: 0, at: noon };
const ride60 = s.rideBase + s.ridePerKm * 53.3;
assert.equal(smartPrice(s, trip60), Math.round(ride60)); // intercity at 50+ km/h: distance only
assert.equal(smartPrice(s, { ...trip60, minutes: 80 }), Math.round(ride60 + s.perMinute * (80 - 53.3 * 1.2))); // slow traffic
assert.equal(smartPrice(s, { ...trip60, delayMinutes: 15 }), Math.round(ride60 + s.perMinute * 15)); // slow checkpoint
assert.ok(smartPrice(s, { ...trip60, km: 60 }) > smartPrice(s, trip60)); // a detour costs its km
assert.equal(smartPrice(s, { ...trip60, at: night }), Math.round(ride60 * (1 + s.nightExtra)));
assert.equal(smartPrice(s, { ...trip60, plus: true }), Math.round(ride60 * (1 - s.plusDiscount)));
// Parcels ignore distance, time, checkpoints and night: the standard price.
const parcel60 = { ...trip60, service: 'parcel', option: 'small' };
for (const extra of [{}, { km: 97 }, { minutes: 200 }, { delayMinutes: 45 }, { at: night }]) assert.equal(smartPrice(s, { ...parcel60, ...extra }), 20);
assert.equal(smartPrice(s, { ...parcel60, option: 'large' }) - smartPrice(s, parcel60), s.parcelLarge);
assert.equal(smartPrice(s, { service: 'freight', option: 'small', loadingHelp: true, km: 10, minutes: 12, delayMinutes: 0, at: noon }),
  Math.round(s.freightBase + s.freightPerKm * 10 + s.loadingHelp));
assert.equal(smartPrice({ ...s, rideBase: 0, ridePerKm: 0 }, { ...trip60, km: 0, minutes: 0 }), 1); // never below ₪1
assert.equal(smartPrice({ ...s, parcelPrice: 0 }, parcel60), 1);

// A courier carries many parcels; a ride or freight load is exclusive and never mixed with parcels.
const p = { service: 'parcel' }, r = { service: 'ride' };
assert.ok(canTake([], 'ride') && canTake([], 'parcel') && canTake([p, p, p], 'parcel'));
assert.ok(!canTake([p], 'ride') && !canTake([r], 'parcel') && !canTake([r], 'freight'));
assert.ok(!canTake(Array(PARCEL_LOAD).fill(p), 'parcel') && canTake(Array(PARCEL_LOAD - 1).fill(p), 'parcel'));
assert.ok(PARCEL_LOAD >= 100);
assert.deepEqual(offerRange(55), [28, 110]);
assert.deepEqual(offerRange(1), [1, 2]);