import assert from 'node:assert/strict';
import { defaultSettings as s, distanceKm, city, nearestCity, nextStatus, normalizePhone, quote, statusFlow, vehicleServices, vehicles } from '../src/model.ts';

for (const ok of ['0599123456', '056-912-3456', '+970599123456', '00970569123456', '٠٥٩٩١٢٣٤٥٦']) assert.equal(normalizePhone(ok)?.length, 10, ok);
for (const bad of ['', '0521234567', '059912345', '+9705991234567']) assert.equal(normalizePhone(bad), null, bad);

const km = distanceKm(city('ramallah'), city('nablus'));
assert.ok(km > 40 && km < 50, `ramallah-nablus ${km}km`);
const trip = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false };
assert.equal(quote(s, trip), Math.round(s.parcelBase + s.parcelPerKm * km));
assert.ok(quote(s, { ...trip, shared: true }) < quote(s, trip));
assert.ok(quote(s, { ...trip, shared: true, plus: true }) < quote(s, { ...trip, shared: true }));
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
