import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
import { acceptOffer, addDriver, assessRide, bookRide, myOffer } from './dispatch-support.mjs';
import { NON_LEGACY_TABLES } from '../server/migrate.ts';

const rideFixture = label => fixture(label, { WIND_DISPATCH_TEST_ONLY: '1', WIND_BOARDING_TEST_ONLY: '1' });
const advance = (f, token, id, expectedStatus, extra = {}, expect = 200) =>
  f.call(`/orders/${id}/advance`, { token, body: { requestId: randomUUID(), expectedStatus, ...extra }, expect });
const wrongFor = code => (code === '0000' ? '0001' : '0000');

async function dispatchAssigned(f, who, order, vehicles = [who.vehicle]) {
  await assessRide(f, order, vehicles);
  await f.call(`/orders/${order.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  const offer = await myOffer(f, order.id, who.driver);
  assert.ok(offer?.leaseNonce, 'dispatch offer issued');
  const accepted = await acceptOffer(f, order.id, who.driver, offer);
  assert.equal(accepted.status, 'assigned');
  return accepted;
}

// --- Migration 14, arrival evidence, grace clock, boarding success path -----
const f = await rideFixture('ridelife');
try {
  assert.equal((await f.db.one('SELECT version FROM schema_migrations WHERE version=14'))?.version, 14, 'migration 14 is the WP11 ride migration');
  const tables = (await f.db.all("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('ride_lifecycle','ride_boarding_attempts') ORDER BY table_name")).map(r => r.table_name);
  assert.deepEqual(tables, ['ride_boarding_attempts', 'ride_lifecycle']);
  for (const table of tables) assert.ok(NON_LEGACY_TABLES.has(table), `${table} is PG-only in legacy import`);
  const lifecycleColumns = (await f.db.all("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ride_lifecycle'")).map(r => r.column_name);
  for (const column of ['arrived_at', 'arrival_source', 'boarding_code', 'boarding_required', 'assignment_epoch']) assert.ok(lifecycleColumns.includes(column), `ride_lifecycle.${column}`);

  await f.setupCoverage();
  const who = await addDriver(f, { latitude: 31.9, longitude: 35.19 });
  const booked = await bookRide(f);
  await assessRide(f, booked, [who.vehicle]);
  await f.call(`/orders/${booked.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  const offer = await myOffer(f, booked.id, who.driver);
  assert.ok(offer?.leaseNonce);
  const preDriver = await f.call(`/orders/${booked.id}`, { token: who.driver.token });
  assert.equal(preDriver.ride, undefined, 'no boarding state exists before assignment');
  assert.ok(!JSON.stringify(preDriver).includes('boardingCode'), 'pre-assignment drivers never see a boarding code');
  assert.equal((await f.call(`/orders/${booked.id}`, { token: f.customer.token })).ride, undefined);

  const accepted = await acceptOffer(f, booked.id, who.driver, offer);
  assert.equal(accepted.ride.boardingRequired, true);
  assert.equal(accepted.ride.arrivedAt, null);
  assert.equal(accepted.ride.graceUntil, null, 'the grace clock has not started before arrival');
  assert.equal(accepted.ride.boardingCode, undefined, 'the assigned driver must obtain the code from the passenger');
  const customerView = await f.call(`/orders/${booked.id}`, { token: f.customer.token });
  const code = customerView.ride.boardingCode;
  assert.match(code, /^\d{4}$/, 'only the customer holds the boarding code');
  const adminView = await f.call(`/orders/${booked.id}`, { token: f.admin.token });
  assert.equal(adminView.ride.boardingCode, undefined, 'the code is serialized only to the customer');
  const foreign = await f.account();
  await f.call(`/orders/${booked.id}`, { token: foreign.token, expect: 404 });

  assert.equal((await advance(f, who.driver.token, booked.id, 'assigned', {}, 409)).error, 'arrival_required', 'a cohort ride cannot reach pickup without arrival evidence');
  await f.call(`/orders/${booked.id}/arrive`, { token: f.customer.token, body: {}, expect: 403 });
  const arrived = await f.call(`/orders/${booked.id}/arrive`, { token: who.driver.token, body: {} });
  assert.equal(arrived.ride.arrivalSource, 'gps');
  assert.ok(Number.isSafeInteger(arrived.ride.arrivedAt));
  assert.equal(arrived.ride.graceUntil, arrived.ride.arrivedAt + 300_000, 'arrival starts the five-minute grace clock');
  assert.equal((await f.call(`/orders/${booked.id}`, { token: f.customer.token })).status, 'assigned', 'arrival does not change the legacy status');
  const arrivedAgain = await f.call(`/orders/${booked.id}/arrive`, { token: who.driver.token, body: {} });
  assert.equal(arrivedAgain.ride.arrivedAt, arrived.ride.arrivedAt, 'a repeated arrival keeps the original grace clock');

  const pickupRequest = { requestId: randomUUID(), expectedStatus: 'assigned' };
  const atPickup = await f.call(`/orders/${booked.id}/advance`, { token: who.driver.token, body: pickupRequest });
  assert.equal(atPickup.status, 'at_pickup');
  assert.equal((await f.call(`/orders/${booked.id}/advance`, { token: who.driver.token, body: pickupRequest })).status, 'at_pickup', 'a duplicate advance replays');

  for (let attempt = 1; attempt <= 4; attempt++)
    assert.equal((await advance(f, who.driver.token, booked.id, 'at_pickup', { boardingCode: wrongFor(code) }, 400)).error, 'wrong_boarding_code');
  assert.equal(Number((await f.db.one('SELECT failures FROM ride_boarding_attempts WHERE order_id=?', booked.id)).failures), 4);
  assert.equal(await f.db.one('SELECT failures FROM proof_attempts WHERE order_id=?', booked.id), undefined, 'boarding attempts never touch the parcel proof counter');
  const started = await advance(f, who.driver.token, booked.id, 'at_pickup', { boardingCode: code });
  assert.equal(started.status, 'in_transit', 'the correct code after four misses still starts the ride');
  assert.equal((await f.call(`/orders/${booked.id}`, { token: f.customer.token })).ride.boardingCode, undefined,
    'the customer no longer receives the PIN once boarding is complete');

  const completionRequest = { requestId: randomUUID(), expectedStatus: 'in_transit' };
  const completed = await f.call(`/orders/${booked.id}/advance`, { token: who.driver.token, body: completionRequest });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.ride.arrivedAt, arrived.ride.arrivedAt);
  assert.equal((await f.call(`/orders/${booked.id}/advance`, { token: who.driver.token, body: completionRequest })).status, 'completed', 'a duplicate completion replays');
  assert.equal((await advance(f, who.driver.token, booked.id, 'in_transit', {}, 409)).error, 'cannot_advance');
  console.log('WP11 ride-lifecycle: migration 14, GPS arrival, grace clock, boarding attempts and duplicate advance/completion passed');
} finally { await f.close(); }

// --- Far / stale / missing fixes, wrong driver, audited operator override ---
const g = await rideFixture('ridenogps');
try {
  await g.setupCoverage();
  const who = await addDriver(g, { latitude: 31.99, longitude: 35.19 });
  const order = await dispatchAssigned(g, who, await bookRide(g));
  assert.equal((await g.call(`/orders/${order.id}/arrive`, { token: who.driver.token, body: {}, expect: 409 })).error, 'arrival_too_far');
  assert.equal((await g.call(`/orders/${order.id}/arrive`, { token: g.d2.token, body: {}, expect: 409 })).error, 'cannot_arrive', 'a non-matched driver cannot arrive the ride');
  await g.db.run('UPDATE driver_latest_locations SET good_at=?,effective_at=? WHERE driver_id=?', Date.now() - 121_000, Date.now() - 121_000, who.driver.user.id);
  await g.db.run('DELETE FROM driver_locations WHERE driver_id=?', who.driver.user.id);
  assert.equal((await g.call(`/orders/${order.id}/arrive`, { token: who.driver.token, body: {}, expect: 409 })).error, 'arrival_fix_stale');
  await g.db.run('DELETE FROM driver_latest_locations WHERE driver_id=?', who.driver.user.id);
  assert.equal((await g.call(`/orders/${order.id}/arrive`, { token: who.driver.token, body: {}, expect: 409 })).error, 'arrival_fix_missing');
  assert.equal((await g.call(`/orders/${order.id}/arrive`, { token: who.driver.token, body: { override: true }, expect: 400 })).error, 'invalid_input', 'a client flag alone never authorizes arrival');
  assert.equal((await g.db.one('SELECT arrived_at FROM ride_lifecycle WHERE order_id=?', order.id)).arrived_at, null);
  assert.equal((await g.call(`/admin/orders/${order.id}/arrival/override`, { token: who.driver.token, body: { reason: 'Synthetic poor GPS at pickup' }, expect: 403 })).error, 'forbidden');
  assert.equal((await g.call(`/admin/orders/${order.id}/arrival/override`, { token: g.admin.token, body: { reason: 'no' }, expect: 400 })).error, 'reason_required');
  const overridden = await g.call(`/admin/orders/${order.id}/arrival/override`, { token: g.admin.token, body: { reason: 'Synthetic poor GPS at pickup' } });
  assert.equal(overridden.ride.arrivalSource, 'operator_override');
  assert.equal(overridden.ride.graceUntil, overridden.ride.arrivedAt + 300_000);
  const event = await g.db.one("SELECT * FROM security_events WHERE order_id=? AND action='RIDE_ARRIVAL_OVERRIDE'", order.id);
  assert.equal(Number(event.actor_id), g.admin.user.id);
  assert.match(event.detail, /Synthetic poor GPS at pickup/);
  const view = await g.call(`/orders/${order.id}`, { token: g.customer.token });
  assert.equal((await advance(g, who.driver.token, order.id, 'assigned')).status, 'at_pickup');
  assert.equal((await advance(g, who.driver.token, order.id, 'at_pickup', { boardingCode: view.ride.boardingCode })).status, 'in_transit');
  console.log('WP11 ride-lifecycle: far/stale/missing fix rejection and audited operator override passed');
} finally { await g.close(); }

// --- Five boarding misses lock; an audited admin reset recovers --------------
const h = await rideFixture('ridelock');
try {
  await h.setupCoverage();
  const who = await addDriver(h, { latitude: 31.9, longitude: 35.19 });
  const order = await dispatchAssigned(h, who, await bookRide(h));
  await h.call(`/orders/${order.id}/arrive`, { token: who.driver.token, body: {} });
  await advance(h, who.driver.token, order.id, 'assigned');
  const code = (await h.call(`/orders/${order.id}`, { token: h.customer.token })).ride.boardingCode;
  assert.equal((await advance(h, h.d2.token, order.id, 'at_pickup', { boardingCode: code }, 404)).error, 'not_found', 'a wrong driver cannot start the ride even with the code');
  for (let attempt = 1; attempt <= 5; attempt++)
    assert.equal((await advance(h, who.driver.token, order.id, 'at_pickup', { boardingCode: wrongFor(code) }, 400)).error, 'wrong_boarding_code');
  assert.equal(Number((await h.db.one('SELECT failures FROM ride_boarding_attempts WHERE order_id=?', order.id)).failures), 5);
  assert.equal((await h.call(`/orders/${order.id}`, { token: h.customer.token })).ride.boardingLocked, true);
  assert.equal((await advance(h, who.driver.token, order.id, 'at_pickup', { boardingCode: code }, 409)).error, 'boarding_locked', 'the correct code cannot bypass the lock');
  assert.ok(await h.db.one("SELECT 1 FROM security_events WHERE order_id=? AND action='BOARDING_LOCKED'", order.id));
  assert.equal((await h.call(`/admin/orders/${order.id}/boarding-reset`, { token: who.driver.token, body: { reason: 'Synthetic support recovery' }, expect: 403 })).error, 'forbidden');
  await h.call(`/admin/orders/${order.id}/boarding-reset`, { token: h.admin.token, body: { reason: 'Synthetic support verified the passenger' } });
  assert.equal(Number((await h.db.one('SELECT failures FROM ride_boarding_attempts WHERE order_id=?', order.id)).failures), 0);
  assert.equal((await advance(h, who.driver.token, order.id, 'at_pickup', { boardingCode: code })).status, 'in_transit', 'an audited reset recovers boarding');
  assert.equal(await h.db.one('SELECT failures FROM proof_attempts WHERE order_id=?', order.id), undefined);
  console.log('WP11 ride-lifecycle: five-miss boarding lock and audited recovery passed');
} finally { await h.close(); }

// --- Release clears custody of the challenge; a stale epoch cannot start ----
const k = await rideFixture('rideepoch');
try {
  await k.setupCoverage();
  const first = await addDriver(k, { latitude: 31.9, longitude: 35.19 });
  const second = await addDriver(k, { latitude: 31.9, longitude: 35.19 });
  const order = await dispatchAssigned(k, first, await bookRide(k), [first.vehicle, second.vehicle]);
  const epochBefore = Number((await k.db.one('SELECT assignment_epoch FROM orders WHERE id=?', order.id)).assignment_epoch);
  await k.call(`/orders/${order.id}/arrive`, { token: first.driver.token, body: {} });
  await k.call(`/orders/${order.id}/release`, { token: first.driver.token, body: {} });
  const released = await k.call(`/orders/${order.id}`, { token: k.customer.token });
  assert.equal(released.status, 'searching');
  assert.equal(released.ride, undefined, 'release leaves no arrival or boarding state behind');
  assert.equal(await k.db.one('SELECT order_id FROM ride_lifecycle WHERE order_id=?', order.id), undefined);
  const secondOffer = await myOffer(k, order.id, second.driver);
  assert.ok(secondOffer?.leaseNonce, 'release re-dispatches to the next driver, excluding the releaser');
  const reassigned = await acceptOffer(k, order.id, second.driver, secondOffer);
  assert.equal(reassigned.driverId, second.driver.user.id);
  const epochAfter = Number((await k.db.one('SELECT assignment_epoch FROM orders WHERE id=?', order.id)).assignment_epoch);
  assert.ok(epochAfter > epochBefore, 'reassignment advances the assignment epoch');
  assert.equal((await advance(k, first.driver.token, order.id, 'assigned', {}, 404)).error, 'not_found', 'the previous driver cannot move the reassigned ride');
  // 10 s old, not Date.now(): arrive rejects future fixes (a Windows clock step made an exactly-now fix "future" on k5); the window is 120 s.
  await k.db.run('UPDATE driver_latest_locations SET good_at=?,effective_at=? WHERE driver_id=?', Date.now() - 10_000, Date.now() - 10_000, second.driver.user.id);
  await k.call(`/orders/${order.id}/arrive`, { token: second.driver.token, body: {} });
  await advance(k, second.driver.token, order.id, 'assigned');
  const code = (await k.call(`/orders/${order.id}`, { token: k.customer.token })).ride.boardingCode;
  await k.db.run('UPDATE ride_lifecycle SET assignment_epoch=? WHERE order_id=?', epochBefore, order.id);
  assert.equal((await advance(k, second.driver.token, order.id, 'at_pickup', { boardingCode: code }, 409)).error, 'assignment_changed', 'a stale assignment epoch cannot start the ride');
  await k.db.run('UPDATE ride_lifecycle SET assignment_epoch=? WHERE order_id=?', epochAfter, order.id);
  assert.equal((await advance(k, second.driver.token, order.id, 'at_pickup', { boardingCode: code })).status, 'in_transit');
  console.log('WP11 ride-lifecycle: release/reassignment custody and stale-epoch start rejection passed');
} finally { await k.close(); }

// --- Legacy PG rides without the boarding gate keep the legacy flow ---------
const legacy = await fixture('ridelegacy');
try {
  await legacy.setupCoverage();
  await legacy.verify();
  const ride = await legacy.book({ service: 'ride', option: '1' });
  await legacy.assess(ride, { items: [], seats: 1 });
  const assigned = await legacy.call(`/jobs/${ride.id}/accept`, { token: legacy.d1.token, body: {} });
  assert.equal(assigned.status, 'assigned');
  assert.equal(assigned.ride, undefined, 'a legacy assignment gains no boarding state');
  assert.equal((await advance(legacy, legacy.d1.token, ride.id, 'assigned')).status, 'at_pickup');
  assert.equal((await advance(legacy, legacy.d1.token, ride.id, 'at_pickup')).status, 'in_transit', 'legacy rides start without arrival or boarding outside the gate');
  assert.equal((await advance(legacy, legacy.d1.token, ride.id, 'in_transit')).status, 'completed');
  console.log('WP11 ride-lifecycle: legacy PG advance/release flow unchanged without the test gate passed');
} finally { await legacy.close(); }


