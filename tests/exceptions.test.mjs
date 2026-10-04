// Delivery exceptions: hold, admin resolve, return to sender, disputes (SPEC-delivery-exceptions.md).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-exc-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}
const advance = (token, order, extra = {}, expect) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra }, expect });

try {
  const admin = await call('/auth/register', { body: { phone: '0599100001', name: 'Admin', password: 'secret1' } });
  promote('0599100001');
  const customer = await call('/auth/register', { body: { phone: '0599100002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599100003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Al-Manara', dropoffNote: 'Hospital', contact: '0599100002', detail: 'Box' };
  async function inTransit(service = 'parcel') {
    const body = service === 'ride' ? { ...input, service, option: '1', detail: '' } : input;
    let order = await call('/orders', { token: customer.token, body: { ...body, quotedPrice: quote(defaultSettings, body) } });
    order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
    order = await advance(driver.token, order);
    return advance(driver.token, order);
  }

  // ---- T1/T2: report a problem → on hold → admin reattempt ----
  let order = await inTransit();
  assert.equal(order.status, 'in_transit');
  const report = { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent', note: 'No answer at door' };
  await call(`/orders/${order.id}/exception`, { token: customer.token, body: report, expect: 403 });
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID(), reason: 'bored' }, expect: 400 });
  const held = await call(`/orders/${order.id}/exception`, { token: driver.token, body: report });
  assert.equal(held.status, 'on_hold');
  assert.equal(held.exceptionReason, 'absent');
  assert.equal((await call(`/orders/${order.id}/exception`, { token: driver.token, body: report })).status, 'on_hold'); // replay
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, note: 'changed' }, expect: 409 }); // same id, new body
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {}, expect: 409 });
  await advance(driver.token, held, {}, 409); // on hold cannot be advanced by the driver
  await call('/location', { token: driver.token, body: { latitude: 32.2, longitude: 35.2 } }); // still an active job
  const other = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await call(`/jobs/${other.id}/accept`, { token: driver.token, body: {}, expect: 409 }); // driver still busy
  await call('/me/delete', { token: driver.token, body: {}, expect: 409 });
  await call(`/admin/orders/${order.id}/resolve`, { token: driver.token, body: { action: 'reattempt', reason: 'Called recipient' }, expect: 403 });
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'x' }, expect: 400 });
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'refund', reason: 'Called recipient' }, expect: 400 });
  const retry = await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Recipient home after 6pm' } });
  assert.equal(retry.status, 'in_transit');
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Again please' }, expect: 409 });
  const handover = (await call(`/orders/${order.id}`, { token: customer.token })).handoverCode;
  assert.equal((await advance(driver.token, retry, { code: handover })).status, 'completed');
  assert.deepEqual(db.prepare("SELECT action FROM security_events WHERE order_id = ? ORDER BY id").all(order.id).map(r => r.action),
    ['DELIVERY_EXCEPTION', 'EXCEPTION_RESOLVED']);

  // Rides have no handover, so they cannot be put on hold.
  await call(`/orders/${other.id}/cancel`, { token: customer.token, body: {} });
  const ride = await inTransit('ride');
  await call(`/orders/${ride.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID() }, expect: 409 });
  await advance(driver.token, ride);

  console.log('exceptions: ok');
} finally {
  server.close();
}
