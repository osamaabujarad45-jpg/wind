// A pickup that cannot happen: the courier reports it, releases it, or the sender cancels, until the parcel is collected.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-pickup-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}, expect) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra }, expect });

try {
  const admin = await call('/auth/register', { body: { phone: '0599200001', name: 'Admin', password: 'secret1' } });
  promote('0599200001');
  const customer = await call('/auth/register', { body: { phone: '0599200002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599200003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Al-Manara', dropoffNote: 'Hospital', contact: '0599200002', detail: 'Box' };
  async function atPickup(service = 'parcel') {
    const body = service === 'ride' ? { ...input, service, option: '1', detail: '' } : input;
    const order = await call('/orders', { token: customer.token, body: { ...body, quotedPrice: quote(defaultSettings, body) } });
    const arrived = await advance(driver.token, await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} }));
    assert.equal(arrived.status, 'at_pickup');
    return arrived;
  }

  // The sender is not there: nothing was collected, so the order ends cancelled with the reason, not on hold.
  let order = await atPickup();
  const report = { expectedStatus: 'at_pickup', requestId: randomUUID(), reason: 'absent', note: 'No answer at the shop' };
  await call(`/orders/${order.id}/exception`, { token: customer.token, body: report, expect: 403 });
  const failed = await call(`/orders/${order.id}/exception`, { token: driver.token, body: report });
  assert.equal(failed.status, 'cancelled');
  assert.equal(failed.exceptionReason, 'absent');
  assert.equal((await call(`/orders/${order.id}/exception`, { token: driver.token, body: report })).status, 'cancelled'); // replay
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).exceptionReason, 'absent'); // the sender sees why
  const event = db.prepare("SELECT detail FROM security_events WHERE order_id = ? AND action = 'PICKUP_FAILED'").get(order.id);
  assert.deepEqual(JSON.parse(event.detail), { reason: 'absent', note: 'No answer at the shop' });
  await call('/location', { token: driver.token, body: { latitude: 31.9, longitude: 35.2 }, expect: 409 }); // the courier is free again

  // The courier gives the job back before collecting it; it returns to the pool.
  order = await atPickup();
  await call(`/orders/${order.id}/release`, { token: driver.token, body: {} });
  const released = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(released.status, 'searching');
  assert.equal(released.driverId, null);
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} });

  // The sender or support cancels while the courier waits at pickup; the courier cannot cancel for them.
  order = await atPickup();
  await call(`/orders/${order.id}/cancel`, { token: driver.token, body: {}, expect: 409 });
  assert.equal((await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} })).status, 'cancelled');
  order = await atPickup();
  assert.equal((await call(`/orders/${order.id}/cancel`, { token: admin.token, body: {} })).status, 'cancelled');

  // Once collected, cancelling and releasing stay closed: the parcel is in custody.
  order = await advance(driver.token, await atPickup());
  assert.equal(order.status, 'in_transit');
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {}, expect: 409 });
  await call(`/orders/${order.id}/release`, { token: driver.token, body: {}, expect: 409 });
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID() }, expect: 409 }); // stale at_pickup
  assert.equal((await call(`/orders/${order.id}/exception`, { token: driver.token,
    body: { ...report, requestId: randomUUID(), expectedStatus: 'in_transit' } })).status, 'on_hold');
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient was away' } });
  const back = await call(`/orders/${order.id}`, { token: customer.token });
  await advance(driver.token, back, { code: back.returnCode });

  // A rider who does not show is a ride matter, not a parcel pickup failure.
  order = await atPickup('ride');
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID() }, expect: 409 });
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} });

  // Souq's partner cancel follows the same rule.
  const partnerKey = process.env.SOUQ_PARTNER_KEY;
  const partnerInput = { externalRef: 'souq:test-pickup', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Seller door', dropoffNote: 'Buyer door', contact: '0599200002', detail: 'Listing' };
  const { price } = await call('/partner/quotes', { partnerKey, body: { pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false } });
  const partnerOrder = await call('/partner/orders', { partnerKey, body: { ...partnerInput, quotedPrice: price } });
  await advance(driver.token, await call(`/jobs/${partnerOrder.id}/accept`, { token: driver.token, body: {} }));
  assert.equal((await call(`/partner/orders/${partnerOrder.id}/cancel`, { partnerKey, body: {} })).status, 'cancelled');

  console.log('pickup: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
