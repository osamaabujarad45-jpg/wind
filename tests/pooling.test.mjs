// RIDE-13/14 (owner decisions, 23 Nov 2026), on the production backend (SQLite):
// - shared seats: a ride priced per seat that may share the car; a driver carries shared riders and parcels together while
//   the vehicle has seats, and a private ride, a load or a shop order stays alone;
// - the trip code: a ride ends only with the rider's code, given after payment;
// - along the way: a driver heading Tulkarm → Ramallah sees jobs on the way, never one going backwards;
// - nearby cars: customers see unnamed cars of drivers with their board open, at a rounded spot, for three minutes;
// - restaurants: a merchant may open as a restaurant.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alongTheWay, canTake, defaultSettings as s, freeSeats, onTheWay, seatsFor, smartPrice } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

// ---- the pure rules ----
const shared = n => ({ service: 'ride', shared: true, option: String(n) });
const parcel = { service: 'parcel' }, privateRide = { service: 'ride', shared: false, option: '1' };
assert.equal(seatsFor('car'), 4); assert.equal(seatsFor('motorcycle'), 1); assert.equal(seatsFor('van'), 0); assert.equal(seatsFor(null), 0);
assert.ok(canTake([], 'ride', shared(4), 'car'), 'an empty car takes four shared seats');
assert.ok(!canTake([], 'ride', shared(2), 'motorcycle'), 'a motorcycle has one seat');
assert.ok(canTake([], 'ride', privateRide, 'motorcycle'), 'a single private rider fits a motorcycle');
assert.ok(!canTake([], 'ride', { ...privateRide, option: '2' }, 'motorcycle'), 'two private riders cannot take a motorcycle');
assert.ok(canTake([shared(2), parcel], 'ride', shared(2), 'car'), 'shared riders and parcels fill a car together');
assert.ok(!canTake([shared(3)], 'ride', shared(2), 'car'), 'never more riders than seats');
assert.ok(canTake([shared(3)], 'parcel', undefined, 'car'), 'a parcel fits beside shared riders');
assert.ok(!canTake([privateRide], 'parcel', undefined, 'car'), 'a private ride stays alone');
assert.ok(!canTake([parcel], 'ride', privateRide, 'car'), 'a private ride needs an empty car');
assert.ok(!canTake([parcel], 'ride', undefined, 'car'), 'a caller that does not say shared stays as strict as before');
assert.ok(!canTake([shared(1)], 'freight', undefined, 'van'), 'a load stays alone');
assert.ok(!canTake([{ service: 'shop' }], 'parcel', undefined, 'car'), 'a shop order stays alone (DLV-24)');
assert.equal(freeSeats([shared(1), parcel], 'car'), 3); assert.equal(freeSeats([privateRide], 'car'), 0);
// Tulkarm → Ramallah passes Nablus and Salfit; Jerusalem and Jenin are not on the way; nobody is carried backwards.
const way = onTheWay('tulkarm', 'ramallah');
for (const town of ['tulkarm', 'nablus', 'salfit', 'ramallah', 'bireh']) assert.ok(way.includes(town), `${town} is on the way`);
for (const town of ['jerusalem', 'jenin', 'hebron', 'gaza']) assert.ok(!way.includes(town), `${town} is not on the way`);
assert.ok(alongTheWay('tulkarm', 'ramallah', { pickupCity: 'tulkarm', dropoffCity: 'nablus' }));
assert.ok(alongTheWay('tulkarm', 'ramallah', { pickupCity: 'nablus', dropoffCity: 'ramallah' }));
assert.ok(!alongTheWay('tulkarm', 'ramallah', { pickupCity: 'nablus', dropoffCity: 'tulkarm' }), 'backwards');
assert.ok(alongTheWay('tulkarm', 'tulkarm', { pickupCity: 'tulkarm', dropoffCity: 'tulkarm' }), 'in town');
// A shared seat costs (1 − sharedDiscount) of the private fare, per seat.
const trip = { service: 'ride', option: '2', km: 76.5, minutes: 82, delayMinutes: 0, at: Date.UTC(2026, 10, 23, 10) };
assert.equal(smartPrice(s, { ...trip, shared: true }), Math.round((s.rideBase + s.ridePerKm * 76.5 + s.perMinute * Math.max(0, 82 - 76.5 * 1.2)) * (1 - s.sharedDiscount) * 2));
assert.ok(smartPrice(s, { ...trip, option: '1', shared: true }) <= 35, 'a Tulkarm → Ramallah seat stays near what a service taxi asks');

// ---- the API, on SQLite ----
const dir = mkdtempSync(join(tmpdir(), 'wind-pooling-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,shop';
process.env.WIND_SHOP_TOWN = 'tulkarm';
delete process.env.OSRM_URL;
const { shutdown, server, promote, db } = await import('../server/main.ts');
const { clearNearby } = await import('../server/domain/nearby.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const advance = (token, order, extra = {}, expect = 200) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra }, expect });

try {
  await call('/auth/register', { body: { phone: '0599300001', name: 'Admin', password: 'secret1' } });
  await promote('0599300001');
  const admin = await call('/auth/login', { body: { phone: '0599300001', password: 'secret1' } });
  const customer = async (phone, name) => call('/auth/register', { body: { phone, name, password: 'secret1' } });
  const driver = async (phone, name, vehicle) => {
    const d = await call('/auth/register', { body: { phone, name, password: 'secret1', role: 'driver', vehicle } });
    await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
    return d;
  };
  const lina = await customer('0599300002', 'Lina'), omar = await customer('0599300003', 'Omar'), huda = await customer('0599300004', 'Huda'), sara = await customer('0599300005', 'Sara');
  const ahmad = await driver('0599300010', 'Ahmad', 'car'), moto = await driver('0599300011', 'Moto', 'motorcycle');
  assert.equal((await call('/me', { token: lina.token })).capabilities.pooling, true, 'rides on: shared seats are offered');

  const tulkarm = { latitude: 32.3116, longitude: 35.0279 }, anabta = { latitude: 32.3083, longitude: 35.1168 }, nablus = { latitude: 32.2211, longitude: 35.2544 };
  const ride = (from, to, extra) => ({ service: 'ride', pickupCity: from.city, dropoffCity: to.city, pickupPoint: from.point, dropoffPoint: to.point, option: '1',
    shared: true, pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic drop-off', contact: '', detail: '', pricing: 'smart', ...extra });
  const T = { city: 'tulkarm', point: tulkarm }, A = { city: 'tulkarm', point: anabta }, N = { city: 'nablus', point: nablus }, R = { city: 'ramallah', point: null };

  // A shared quote is per seat and cheaper than the private one; freight cannot be shared.
  const privateQuote = await call('/price', { token: lina.token, body: { ...ride(T, R), shared: false, option: '2' } });
  const sharedQuote = await call('/price', { token: lina.token, body: { ...ride(T, R), option: '2' } });
  assert.equal(sharedQuote.shared, true);
  assert.equal(sharedQuote.price, smartPrice(s, { service: 'ride', option: '2', km: sharedQuote.km, minutes: sharedQuote.minutes, delayMinutes: sharedQuote.delayMinutes, at: Date.now(), shared: true }));
  assert.ok(sharedQuote.price < privateQuote.price * 2, 'two shared seats cost less than the car');
  assert.equal((await call('/price', { token: lina.token, body: { ...ride(T, R), service: 'parcel', option: 'small' }, expect: 409 })).error, 'pooling_unavailable', 'only a ride is shared');

  const book = (who, body) => call('/orders', { token: who.token, body: { ...body, contact: who.user.phone } });
  const tooMany = { ...ride(T, R), shared: false, option: '5', contact: sara.user.phone };
  for (const path of ['/price', '/orders']) {
    assert.equal((await call(path, { token: sara.token, body: tooMany, expect: 400 })).error, 'invalid_option');
  }
  const first = await book(lina, ride(T, R, { option: '2' }));
  assert.equal(first.shared, true); assert.equal(first.option, '2');
  assert.match(first.handoverCode, /^\d{4}$/, 'a ride carries the trip code for its rider');
  const second = await book(omar, ride(A, N));
  const third = await book(huda, ride(T, R, { option: '2' }));
  const lone = await book(sara, { ...ride(T, R), shared: false, option: '4' });

  assert.ok(!(await call('/jobs', { token: moto.token })).some(job => job.id === lone.id), 'oversized rides stay off the motorcycle board');
  db.prepare("INSERT INTO settings (key, value) VALUES ('driverCashCap', 1)").run();
  assert.equal((await call(`/jobs/${lone.id}/accept`, { token: moto.token, body: {}, expect: 409 })).error, 'wrong_vehicle', 'an incompatible vehicle gets the capacity refusal before the cash-cap check');
  db.prepare("DELETE FROM settings WHERE key = 'driverCashCap'").run();
  for (const action of ['accept', 'offer']) {
    const body = action === 'offer' ? { price: lone.recommendedPrice } : {};
    assert.equal((await call(`/jobs/${lone.id}/${action}`, { token: moto.token, body, expect: 409 })).error, 'wrong_vehicle');
  }
  const assignable = await call(`/admin/orders/${lone.id}/assignable-drivers`, { token: admin.token });
  assert.equal(assignable.find(driver => driver.id === moto.user.id).reason, 'wrong_vehicle');
  assert.equal((await call(`/admin/orders/${lone.id}/assign`, { token: admin.token, body: { driverId: moto.user.id, reason: 'Test capacity' }, expect: 409 })).error, 'wrong_vehicle');
  db.prepare('INSERT INTO order_offers (order_id, driver_id, price, created_at) VALUES (?, ?, ?, ?)').run(lone.id, moto.user.id, lone.recommendedPrice, Date.now());
  assert.ok(!(await call(`/orders/${lone.id}`, { token: sara.token })).offers.some(offer => offer.driverId === moto.user.id));
  assert.equal((await call(`/orders/${lone.id}/offers/${moto.user.id}/accept`, { token: sara.token, body: {}, expect: 409 })).error, 'offer_expired');
  const oldMotorcycle = db.prepare(`INSERT INTO users (phone, name, password, role, status, vehicle, created_at, approved_at)
    SELECT ?, name, password, role, status, vehicle, created_at, approved_at FROM users WHERE id = ?`);
  const oldOffer = db.prepare('INSERT INTO order_offers (order_id, driver_id, price, created_at) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < 19; i++) {
    const result = oldMotorcycle.run(`05993100${String(i).padStart(2, '0')}`, moto.user.id);
    oldOffer.run(lone.id, result.lastInsertRowid, lone.recommendedPrice - 2, Date.now());
  }
  await call(`/jobs/${lone.id}/offer`, { token: ahmad.token, body: { price: lone.recommendedPrice + 1 } });
  assert.deepEqual((await call(`/orders/${lone.id}`, { token: sara.token })).offers.map(offer => offer.driverId), [ahmad.user.id], 'old incompatible offers cannot fill the quote-list limit');

  // Along the way: heading to Ramallah from Tulkarm shows the Anabta → Nablus rider; a Nablus → Tulkarm job is backwards.
  const back = await call('/orders', { token: (await customer('0599300006', 'Back')).token, body: { ...ride(N, T), contact: '0599300006' } });
  await call('/driver/heading', { token: ahmad.token, body: { city: 'ramallah' } });
  const board = await call(`/jobs?near=${tulkarm.latitude},${tulkarm.longitude}`, { token: ahmad.token });
  const ids = board.map(j => j.id);
  for (const o of [first, second, third, lone]) assert.ok(ids.includes(o.id), `job ${o.id} is on the way`);
  assert.ok(!ids.includes(back.id), 'a job going backwards stays off the board');
  assert.ok(board.find(j => j.id === first.id).shared, 'the card says shared');
  // Without the device's position the board keeps the old rule: drop-off in the heading town only.
  assert.ok(!(await call('/jobs', { token: ahmad.token })).some(j => j.id === second.id));

  // Nearby cars: the board poll put Ahmad on the map, rounded, unnamed; a motorcycle with its board open shows too.
  clearNearby();
  await call(`/jobs?near=${tulkarm.latitude},${tulkarm.longitude}`, { token: ahmad.token });
  await call('/jobs?near=32.3150,35.0600', { token: moto.token }); // 3 km east of Tulkarm
  let nearby = await call(`/drivers/nearby?service=ride&near=${tulkarm.latitude},${tulkarm.longitude}`, { token: lina.token });
  assert.equal(nearby.count, 2);
  assert.ok(nearby.cars.every(car => Object.keys(car).sort().join() === 'latitude,longitude,vehicle'), 'no name, id or plate leaves the server');
  assert.ok(Math.abs(nearby.cars[0].latitude - tulkarm.latitude) <= 0.0011 && nearby.cars[0].latitude !== tulkarm.latitude, 'a rounded spot');
  assert.equal(nearby.nearestKm, 1);
  await call(`/drivers/nearby?service=ride&near=${tulkarm.latitude},${tulkarm.longitude}`, { token: ahmad.token, expect: 403 });
  await call(`/drivers/nearby?service=ride&near=${tulkarm.latitude},${tulkarm.longitude}`, { expect: 401 });
  assert.equal((await call(`/drivers/nearby?service=ride&near=31.53,35.10`, { token: lina.token })).count, 0, 'Hebron is too far');
  await call('/drivers/nearby?service=ride&near=abc', { token: lina.token, expect: 400 });

  // Ahmad takes two shared seats, then one more rider and a parcel; the third pair of seats would overfill the car.
  let job1 = await call(`/jobs/${first.id}/accept`, { token: ahmad.token, body: {} });
  assert.equal(job1.status, 'assigned');
  // A driver offer on another shared ride survives the first accept and can still be chosen while seats are free.
  await call(`/jobs/${second.id}/offer`, { token: ahmad.token, body: { price: second.recommendedPrice } });
  const parcelOrder = await call('/orders', { token: sara.token, body: { service: 'parcel', pickupCity: 'tulkarm', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Synthetic shop', dropoffNote: 'Synthetic door', contact: '0599300005', detail: 'Box' } });
  assert.ok((await call(`/orders/${second.id}`, { token: omar.token })).offers.some(o => o.driverId === ahmad.user.id), 'the rider sees the offer of a driver already carrying shared riders');
  const offered = await call(`/orders/${second.id}/offers/${ahmad.user.id}/accept`, { token: omar.token, body: {} });
  assert.equal(offered.status, 'assigned'); assert.equal(offered.driverId, ahmad.user.id);
  await call(`/jobs/${parcelOrder.id}/accept`, { token: ahmad.token, body: {} });
  assert.equal((await call(`/jobs/${third.id}/accept`, { token: ahmad.token, body: {}, expect: 409 })).error, 'vehicle_busy', 'three seats taken, two asked');
  assert.equal((await call(`/jobs/${lone.id}/accept`, { token: ahmad.token, body: {}, expect: 409 })).error, 'vehicle_busy', 'a private ride needs an empty car');
  const spare = await driver('0599300012', 'Spare', 'car');
  assert.equal((await call(`/jobs/${lone.id}/accept`, { token: spare.token, body: {} })).status, 'assigned', 'an empty car can take the whole party');
  // The shared riders see that the car carries others.
  assert.equal((await call(`/orders/${first.id}`, { token: lina.token })).sharedRun, true);
  // With one seat left the car still shows to riders; full, it would not.
  clearNearby();
  await call(`/jobs?near=${tulkarm.latitude},${tulkarm.longitude}`, { token: ahmad.token });
  nearby = await call(`/drivers/nearby?service=ride&near=${tulkarm.latitude},${tulkarm.longitude}`, { token: lina.token });
  assert.equal(nearby.count, 1, 'one free seat: still a car on the map');

  // The motorcycle cannot take two shared seats.
  assert.equal((await call(`/jobs/${third.id}/accept`, { token: moto.token, body: {}, expect: 409 })).error, 'vehicle_busy');

  // The trip code: the first rider's ride ends only with their code, after the driver reached pickup and drove them.
  job1 = await advance(ahmad.token, job1); // at_pickup
  job1 = await advance(ahmad.token, job1); // in_transit
  assert.equal((await advance(ahmad.token, job1, {}, 400)).error, 'wrong_code');
  // A captain app from before 1.1.6 cannot ask for the code: it is told to update, and no wrong try is counted.
  const old = await fetch(`http://127.0.0.1:${server.address().port}/api/orders/${job1.id}/advance`, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ahmad.token}`, 'x-wind-client': '10105' },
    body: JSON.stringify({ expectedStatus: 'in_transit', requestId: randomUUID(), code: '' }) });
  assert.equal(old.status, 426);
  job1 = await advance(ahmad.token, job1, { code: first.handoverCode });
  assert.equal(job1.status, 'completed');
  assert.ok(job1.commission > 0, 'the shared ride earns its commission like any trip');
  // A rider who left without giving the code does not strand the driver: the ride ends on the driver's word, recorded.
  let job2 = await call(`/orders/${second.id}`, { token: ahmad.token });
  job2 = await advance(ahmad.token, await advance(ahmad.token, job2));
  assert.equal(job2.status, 'in_transit');
  assert.equal((await call(`/orders/${parcelOrder.id}/advance`, { token: ahmad.token, body: { expectedStatus: 'assigned', requestId: randomUUID(), noCode: true }, expect: 400 })).error,
    'invalid_input', 'only a ride ends without its code');
  const confirmation = { noCode: true, expectedProofVersion: job2.proofVersion ?? null };
  await call(`/orders/${job2.id}/sos`, { token: omar.token, body: { kind: 'other' } });
  const [incident] = await call('/admin/incidents', { token: admin.token });
  await call(`/admin/incidents/${incident.id}/resolve`, { token: admin.token, body: { resolution: 'Checked both sides' } });
  assert.equal((await advance(ahmad.token, job2, confirmation, 409)).error, 'order_changed', 'the confirmation opened before the pause cannot end the ride');
  job2 = await call(`/orders/${job2.id}`, { token: ahmad.token });
  job2 = await advance(ahmad.token, job2, { noCode: true, expectedProofVersion: job2.proofVersion });
  assert.equal(job2.status, 'completed');

  // Restaurants open: a customer applies as a restaurant in the shop town.
  const kitchen = await customer('0599300020', 'Kitchen');
  const applied = await call('/merchant/apply', { token: kitchen.token, body: { name: 'Synthetic Falafel', category: 'restaurant', city: 'tulkarm',
    point: { latitude: 32.3105, longitude: 35.0285 }, phone: '0599300020', licenceNo: 'SYN-1', licenceExpiresAt: Date.now() + 86_400_000 * 300 } });
  assert.equal(applied.merchant.category, 'restaurant');
  console.log('Pooling: shared seats, seats per vehicle, parcels beside riders, offers that outlive a shared accept, trip code, along-the-way board, nearby cars and restaurants passed');
} finally {
  await shutdown();
}
