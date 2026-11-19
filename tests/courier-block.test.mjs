// Blocking a courier mid-job: support confirms the recovery, and no parcel is left with nobody responsible.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
import { startApiProcess } from './support/api-process.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-block-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID() } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599300001', name: 'Admin', password: 'secret1' } });
  await promote('0599300001');
  const reviewer = await call('/auth/register', { body: { phone: '0599300007', name: 'Reviewer', password: 'secret1' } });
  await promote('0599300007');
  const customer = await call('/auth/register', { body: { phone: '0599300002', name: 'Lina', password: 'secret1' } });
  const drivers = [];
  for (const phone of ['0599300003', '0599300004']) {
    const driver = await call('/auth/register', { body: { phone, name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
    await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
    drivers.push(driver);
  }
  const [blocked, spare] = drivers;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Al-Manara', dropoffNote: 'Hospital', contact: '0599300002', detail: 'Box' };
  const book = async () => {
    const order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    return call(`/jobs/${order.id}/accept`, { token: blocked.token, body: {} });
  };
  const assigned = await book();
  const atPickup = await advance(blocked.token, await book());
  const carried = await advance(blocked.token, await advance(blocked.token, await book()));
  const denied = await advance(blocked.token, await advance(blocked.token, await book()));
  assert.deepEqual([assigned.status, atPickup.status, carried.status], ['assigned', 'at_pickup', 'in_transit']);

  // A plain block would strand three parcels, so it is refused until support confirms the recovery.
  const path = `/admin/users/${blocked.user.id}`;
  assert.equal((await call(path, { token: admin.token, method: 'PATCH', body: { status: 'blocked' }, expect: 409 })).error, 'carrying_parcels');
  assert.equal((await call(`/orders/${carried.id}`, { token: blocked.token })).status, 'in_transit'); // nothing changed
  await call(path, { token: admin.token, method: 'PATCH', body: { status: 'blocked', recovery: 'return' } });
  await call(`/orders/${carried.id}`, { token: blocked.token, expect: 401 });

  // Not collected yet: back to the pool for another courier.
  for (const order of [assigned, atPickup]) {
    const now = await call(`/orders/${order.id}`, { token: customer.token });
    assert.equal(now.status, 'searching');
    assert.equal(now.driverId, null);
  }
  assert.equal((await call(`/jobs/${assigned.id}/accept`, { token: spare.token, body: {} })).status, 'assigned');

  // In custody: it returns to the sender, and support confirms the handback.
  const back = await call(`/orders/${carried.id}`, { token: customer.token });
  assert.equal(back.status, 'returning');
  assert.match(back.returnCode, /^\d{4}$/);
  const returned = await call(`/admin/orders/${carried.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Support collected it from the courier' } });
  assert.equal(returned.status, 'returned');
  assert.equal(returned.blockReview.tripPayCents, 2000);
  assert.equal(returned.blockReview.decidedAt, null);
  assert.equal(db.prepare("SELECT id FROM cash_entries WHERE source = 'trip_pay' AND order_id = ?").get(carried.id), undefined);
  await call(`/admin/orders/${denied.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Office received denied parcel' } });

  // A retained audit without its row is recovered when another API process opens this database.
  db.prepare('DELETE FROM courier_block_reviews WHERE order_id = ?').run(carried.id);
  for (let start = 0; start < 2; start++) {
    // Under the PostgreSQL legacy harness the second process must open the same schema (the helper strips database env).
    const api = await startApiProcess({ DB_PATH: process.env.DB_PATH, ...(process.env.WIND_DATABASE_URL && { WIND_DATABASE_URL: process.env.WIND_DATABASE_URL,
      WIND_POSTGRES_TEST_ONLY: process.env.WIND_POSTGRES_TEST_ONLY, WIND_POSTGRES_TEST_SCHEMA: process.env.WIND_POSTGRES_TEST_SCHEMA }) });
    try {
      const recovered = await apiCaller(() => api.base)(`/orders/${carried.id}`, { token: admin.token });
      assert.deepEqual(recovered.blockReview, returned.blockReview);
    } finally { await api.stop(); }
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM courier_block_reviews WHERE order_id = ?').get(carried.id).n, 1);
  const realNow = Date.now;
  try {
    Date.now = () => returned.blockReview.dueAt + 1;
    assert.equal((await call('/admin/stats', { token: admin.token })).blockReviewsOverdue, 2);
  } finally { Date.now = realNow; }
  const decision = { cleared: true, note: 'Second admin cleared the captain' };
  const reviewPath = `/admin/orders/${carried.id}/block-review`;
  assert.equal((await call(reviewPath, { token: admin.token, body: decision, expect: 409 })).error, 'second_admin_required');
  const cleared = await call(reviewPath, { token: reviewer.token, body: decision });
  assert.equal(cleared.paidCents, 2000);
  assert.deepEqual(await call(reviewPath, { token: reviewer.token, body: decision }), cleared);
  const refused = await call(`/admin/orders/${denied.id}/block-review`, { token: reviewer.token, body: { ...decision, cleared: false } });
  assert.equal(refused.paidCents, 0);
  const payable = (await call('/admin/cash', { token: admin.token })).find(row => row.driverId === blocked.user.id);
  assert.equal(payable.owedCents, -2000);
  const payout = await call('/admin/cash/adjustment', { token: reviewer.token, body: {
    driverId: blocked.user.id, source: 'payout', amountCents: 2000, requestId: randomUUID(), reason: 'Office handed cash to captain',
  } });
  assert.match(payout.reference, /^P-/);
  assert.equal((await call('/admin/cash', { token: admin.token })).find(row => row.driverId === blocked.user.id).owedCents, 0);
  const events = db.prepare("SELECT order_id, detail FROM security_events WHERE action = 'COURIER_BLOCKED' ORDER BY order_id").all();
  assert.deepEqual(events.map(e => JSON.parse(e.detail).from), ['assigned', 'at_pickup', 'in_transit', 'in_transit']);

  // A pre-pickup block requeued this order. After reapproval a later trip by the same captain can earn return pay.
  await call(path, { token: admin.token, method: 'PATCH', body: { status: 'active' } });
  blocked.token = (await call('/auth/login', { body: { phone: '0599300003', password: 'secret1' } })).token;
  const acceptedAgain = await call(`/jobs/${atPickup.id}/accept`, { token: blocked.token, body: {} });
  const pickedUp = await advance(blocked.token, await advance(blocked.token, acceptedAgain));
  await call(`/orders/${pickedUp.id}/exception`, { token: blocked.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  const resolve = `/admin/orders/${pickedUp.id}/resolve`;
  await call(resolve, { token: admin.token, body: { action: 'return', reason: 'Return to sender' } });
  await call(resolve, { token: admin.token, body: { action: 'confirm_return', reason: 'Received at office' } });
  assert.equal(db.prepare('SELECT amount_cents FROM cash_entries WHERE note = ?').get(`DRV-17 trip pay order ${pickedUp.id}`).amount_cents, -4000);

  // A courier with nothing in hand is blocked as before.
  await call(`/admin/users/${spare.user.id}`, { token: admin.token, method: 'PATCH', body: { status: 'blocked' }, expect: 409 }); // spare now holds a job
  // An edit built on a role another admin has since changed is refused instead of reverting it (review on #48).
  assert.equal((await call(`/admin/users/${spare.user.id}`, { token: admin.token, method: 'PATCH', body: { name: 'Spare', expectedRole: 'customer' }, expect: 409 })).error, 'user_changed');
  await call(`/orders/${assigned.id}/cancel`, { token: customer.token, body: {} });
  await call(`/admin/users/${spare.user.id}`, { token: admin.token, method: 'PATCH', body: { status: 'blocked' } });

  // A blocked customer loses the handover code, so a block waits for their open order; the order and its session are untouched.
  const sender = await call('/auth/register', { body: { phone: '0599300005', name: 'Rana', password: 'secret1' } });
  const openOrder = await call('/orders', { token: sender.token, body: { ...input, contact: '0599300005', quotedPrice: quote(defaultSettings, input) } });
  const senderPath = `/admin/users/${sender.user.id}`;
  assert.equal((await call(senderPath, { token: admin.token, method: 'PATCH', body: { status: 'blocked' }, expect: 409 })).error, 'customer_active_order');
  assert.equal((await call(`/orders/${openOrder.id}`, { token: sender.token })).status, 'searching');
  await call(`/orders/${openOrder.id}/cancel`, { token: sender.token, body: {} });
  await call(senderPath, { token: admin.token, method: 'PATCH', body: { status: 'blocked' } });
  await call(`/orders/${openOrder.id}`, { token: sender.token, expect: 401 });

  const captain = await call('/auth/register', { body: { phone: '0599300006', name: 'Rami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${captain.user.id}/approve`, { token: admin.token, body: {} });
  const rideInput = { ...input, service: 'ride', option: '1' };
  let trip = await call('/orders', { token: customer.token, body: { ...rideInput, quotedPrice: quote(defaultSettings, rideInput) } });
  trip = await call(`/jobs/${trip.id}/accept`, { token: captain.token, body: {} });
  trip = await advance(captain.token, await advance(captain.token, trip));
  assert.equal(trip.status, 'in_transit');
  await call(`/admin/users/${captain.user.id}`, { token: admin.token, method: 'PATCH', body: { status: 'blocked', recovery: 'return' } });
  assert.equal((await call(`/orders/${trip.id}`, { token: customer.token })).status, 'cancelled');
  assert.deepEqual({ ...db.prepare('SELECT return_code, commission FROM orders WHERE id = ?').get(trip.id) }, { return_code: null, commission: null });
  console.log('courier-block: parcels recover through custody and boarded rides end unpaid');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
