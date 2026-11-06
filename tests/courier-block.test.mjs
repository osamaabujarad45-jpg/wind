// Blocking a courier mid-job: support confirms the recovery, and no parcel is left with nobody responsible.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-block-'));
process.env.DB_PATH = join(dir, 'test.db');
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID() } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599300001', name: 'Admin', password: 'secret1' } });
  await promote('0599300001');
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
  const events = db.prepare("SELECT order_id, detail FROM security_events WHERE action = 'COURIER_BLOCKED' ORDER BY order_id").all();
  assert.deepEqual(events.map(e => JSON.parse(e.detail).from), ['assigned', 'at_pickup', 'in_transit']);

  // A courier with nothing in hand is blocked as before.
  await call(`/admin/users/${spare.user.id}`, { token: admin.token, method: 'PATCH', body: { status: 'blocked' }, expect: 409 }); // spare now holds a job
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

  console.log('courier-block: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
