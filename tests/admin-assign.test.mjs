// WP-02: an administrator assigns a searching order to a chosen driver and moves an assigned one, through the same
// guards as a driver accept, with an audit row and a single winner when requests race.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings as standard, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
const defaultSettings = { ...standard, parcelPrice: 49 };

const dir = mkdtempSync(join(tmpdir(), 'wind-admin-assign-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, promote, db, eligibility } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });
const rows = orderId => db.prepare('SELECT * FROM security_events WHERE order_id = ? AND action LIKE ? ORDER BY id').all(orderId, 'ORDER_%ASSIGNED_BY_ADMIN');
const raw = (path, token, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

try {
  const admin = await call('/auth/register', { body: { phone: '0599400001', name: 'Dispatcher', password: 'secret1' } });
  await promote('0599400001');
  const customer = await call('/auth/register', { body: { phone: '0599400002', name: 'Lina', password: 'secret1' } });
  const driver = (phone, name, vehicle) => call('/auth/register', { body: { phone, name, password: 'secret1', role: 'driver', vehicle } });
  const d1 = await driver('0599400003', 'Sami', 'car'), d2 = await driver('0599400004', 'Omar', 'car'), d3 = await driver('0599400005', 'Rana', 'car');
  const truck = await driver('0599400006', 'Truck', 'truck'), pending = await driver('0599400007', 'Pending', 'car'), blocked = await driver('0599400008', 'Blocked', 'car');
  for (const d of [d1, d2, d3, truck, blocked]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
  await call(`/admin/users/${blocked.user.id}`, { token: admin.token, body: { status: 'blocked' } });
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 49 } });

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'A', dropoffNote: 'B', contact: '0599400002', detail: 'Box' };
  const book = () => call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  const assign = (order, driverId, extra = {}, expect = 200, token = admin.token) =>
    call(`/admin/orders/${order.id}/assign`, { token, body: { driverId, reason: 'Stuck searching for 20 minutes', ...extra }, expect });

  // ---- roles and input ----
  const a = await book();
  for (const who of [customer, d1]) {
    await call(`/admin/orders/${a.id}/assign`, { token: who.token, body: { driverId: d1.user.id, reason: 'Not allowed here' }, expect: 403 });
    await call(`/admin/orders/${a.id}/assignable-drivers`, { token: who.token, expect: 403 });
  }
  await assign(a, d1.user.id, { reason: 'abcd' }, 400);
  await assign(a, 'x', {}, 400);
  assert.equal((await assign(a, customer.user.id, {}, 404)).error, 'not_found', 'only a driver can be named');
  assert.equal((await call(`/orders/${a.id}`, { token: customer.token })).status, 'searching');
  assert.equal(rows(a.id).length, 0, 'refusals write no audit row');

  // ---- the list says who may take it, and why not ----
  const list = await call(`/admin/orders/${a.id}/assignable-drivers`, { token: admin.token });
  const byId = Object.fromEntries(list.map(d => [d.id, d]));
  assert.ok(list.every(d => d.advisory === true), 'the list is advisory: the measured guard runs on assign, not on this read');
  assert.ok(byId[d1.user.id].eligible && byId[d2.user.id].eligible);
  assert.equal(byId[truck.user.id].reason, 'wrong_vehicle');
  assert.ok(!byId[blocked.user.id] && !byId[pending.user.id], 'blocked and unapproved accounts are not offered');

  // ---- ineligible drivers are refused with the accept path codes ----
  assert.equal((await assign(a, truck.user.id, {}, 409)).error, 'wrong_vehicle');
  assert.equal((await assign(a, pending.user.id, {}, 409)).error, 'pending_approval');
  assert.equal((await assign(a, blocked.user.id, {}, 409)).error, 'blocked');
  await call('/admin/settings', { token: admin.token, body: { driverCashCap: 1 } });
  assert.equal((await assign(a, d2.user.id, {}, 409)).error, 'cash_cap_exceeded');
  await call('/admin/settings', { token: admin.token, body: { driverCashCap: 150 } });
  assert.equal((await call(`/orders/${a.id}`, { token: customer.token })).status, 'searching', 'a refusal leaves the order searching');
  assert.equal(rows(a.id).length, 0);

  // ---- the measured eligibility guard is consulted on every assign; its refusal rolls the whole assign back ----
  // SQLite has no measured schema, so the guard here is a seam: it records each call and can refuse with a chosen code.
  const guarded = await book();
  const guardCalls = [];
  const measuredGuard = eligibility.guard.bind(eligibility);
  let refuseWith = null;
  eligibility.guard = async (...args) => { guardCalls.push(args); if (refuseWith) eligibility.fail(409, refuseWith); return measuredGuard(...args); };
  try {
    refuseWith = 'route_not_permitted';
    assert.equal((await assign(guarded, d2.user.id, {}, 409)).error, 'route_not_permitted');
    assert.deepEqual(guardCalls.at(-1).slice(0, 3), [d2.user.id, guarded.id, 'accept'], 'the guard is asked for the accept check of this driver and order');
    assert.equal((await call(`/orders/${guarded.id}`, { token: customer.token })).status, 'searching', 'a guard refusal leaves the order searching');
    assert.equal(rows(guarded.id).length, 0, 'a guard refusal writes no audit row');
    refuseWith = null;
    await assign(guarded, d2.user.id);
    assert.equal(rows(guarded.id).length, 1);
    // A reassign reaches the guard's "already taken" refusal only for a measured order; it is reported as unsupported, not as taken.
    refuseWith = 'already_taken';
    assert.equal((await assign(guarded, d1.user.id, { expectedStatus: 'assigned', expectedDriverId: d2.user.id }, 409)).error, 'measured_reassign_unsupported');
    assert.equal((await call(`/orders/${guarded.id}`, { token: customer.token })).driverId, d2.user.id, 'a refused reassign keeps the driver');
    refuseWith = null;
    // A driver who released the order cannot take it back from the admin list either.
    await call(`/orders/${guarded.id}/release`, { token: d2.token, body: {} });
    assert.equal((await assign(guarded, d2.user.id, {}, 409)).error, 'driver_released_order');
  } finally {
    eligibility.guard = measuredGuard;
  }

  // ---- a scheduled parcel reaches drivers only inside the release window (30 minutes before pickup) ----
  const later = await call('/orders', { token: customer.token, body: { ...input, scheduledFor: Date.now() + 2 * 3_600_000, quotedPrice: quote(defaultSettings, input) } });
  assert.equal((await assign(later, d1.user.id, {}, 409)).error, 'not_released_yet');
  assert.equal((await call(`/admin/orders/${later.id}/assignable-drivers`, { token: admin.token })).find(d => d.id === d1.user.id).reason, 'not_released_yet');
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() + 10 * 60_000, later.id);
  assert.equal((await assign(later, d1.user.id)).driverId, d1.user.id, 'inside the window the order can be assigned');

  // ---- assign from searching ----
  const assigned = await assign(a, d1.user.id, { requestId: randomUUID(), expectedStatus: 'searching' });
  assert.equal(assigned.status, 'assigned');
  assert.equal(assigned.driverId, d1.user.id);
  const stored = db.prepare('SELECT commission, commission_rate FROM orders WHERE id = ?').get(a.id);
  assert.equal(stored.commission, Math.round(49 * stored.commission_rate * 100) / 100, 'the commission is snapshotted at the new driver rate');
  let audit = rows(a.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'ORDER_ASSIGNED_BY_ADMIN');
  assert.equal(audit[0].actor_id, admin.user.id);
  assert.equal(JSON.parse(audit[0].detail).reason, 'Stuck searching for 20 minutes');
  assert.equal(JSON.parse(audit[0].detail).driverId, d1.user.id);
  await assign(a, d1.user.id); // a double submit finds the work done
  assert.equal(rows(a.id).length, 1, 'a replay writes no second audit row');
  assert.equal((await call(`/jobs/${a.id}/accept`, { token: d2.token, body: {}, expect: 404 })).error, 'not_found'); // taken orders leave other drivers' view

  // ---- stale view and reassign before pickup ----
  assert.equal((await assign(a, d2.user.id, { expectedStatus: 'searching' }, 409)).error, 'order_changed');
  assert.equal((await assign(a, d2.user.id, { expectedDriverId: d2.user.id }, 409)).error, 'order_changed');
  const moved = await assign(a, d2.user.id, { expectedStatus: 'assigned', expectedDriverId: d1.user.id, reason: 'Driver one is unreachable' });
  assert.equal(moved.driverId, d2.user.id);
  audit = rows(a.id);
  assert.equal(audit.at(-1).action, 'ORDER_REASSIGNED_BY_ADMIN');
  assert.equal(JSON.parse(audit.at(-1).detail).previousDriverId, d1.user.id);
  await call(`/orders/${a.id}`, { token: d1.token, expect: 404 }); // the old driver no longer sees it
  const atPickup = await advance(d2.token, moved);
  assert.equal(atPickup.status, 'at_pickup');
  const back = await assign(a, d1.user.id, { expectedStatus: 'at_pickup', reason: 'Driver two broke down' });
  assert.equal(back.status, 'assigned', 'the new driver starts from assigned');
  assert.equal(back.driverId, d1.user.id);

  // ---- not after the parcel is collected ----
  const inTransit = await advance(d1.token, await advance(d1.token, back));
  assert.equal(inTransit.status, 'in_transit');
  assert.equal((await assign(a, d2.user.id, {}, 409)).error, 'cannot_assign');
  const after = await call(`/orders/${a.id}`, { token: customer.token });
  assert.equal(after.status, 'in_transit');
  assert.equal(after.driverId, d1.user.id);
  const total = rows(a.id).length;

  // ---- a racing driver accept and two admins leave exactly one driver ----
  const race = await book();
  const results = await Promise.all([
    raw(`/admin/orders/${race.id}/assign`, admin.token, { driverId: d2.user.id, reason: 'Race: admin one', expectedStatus: 'searching' }),
    raw(`/admin/orders/${race.id}/assign`, admin.token, { driverId: d3.user.id, reason: 'Race: admin two', expectedStatus: 'searching' }),
    raw(`/jobs/${race.id}/accept`, d1.token, {}),
  ]);
  const wins = results.filter(r => r.status === 200).length;
  assert.equal(wins, 1, `exactly one request wins, saw ${results.map(r => r.status)}`);
  for (const r of results.filter(r => r.status !== 200)) assert.ok([404, 409].includes(r.status), `a loser is refused, saw ${r.status}`); // a driver accept finds the order gone (404)
  const final = await call(`/orders/${race.id}`, { token: customer.token });
  assert.equal(final.status, 'assigned');
  assert.ok([d1, d2, d3].some(d => d.user.id === final.driverId));
  const adminWins = results.slice(0, 2).filter(r => r.status === 200).length;
  assert.equal(rows(race.id).length, adminWins, 'only a winning admin request is audited');
  assert.equal(rows(a.id).length, total);

  console.log('admin-assign: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
