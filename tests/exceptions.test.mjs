// Delivery exceptions: hold, admin resolve, return to sender, disputes (SPEC-delivery-exceptions.md).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-exc-'));
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
  const admin = await call('/auth/register', { body: { phone: '0599100001', name: 'Admin', password: 'secret1' } });
  await promote('0599100001');
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
  await call(`/jobs/${other.id}/accept`, { token: driver.token, body: {} }); // a courier holding one parcel still takes more (SPEC-parcel-standard.md)
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

  // ---- T3: return to sender with the sender's code ----
  order = await inTransit();
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID(), reason: 'refused' } });
  const returning = await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient refused parcel' } });
  assert.equal(returning.status, 'returning');
  assert.equal(returning.returnCode, null); // admins see state, the sender holds the code
  assert.equal((await call(`/orders/${order.id}`, { token: driver.token })).returnCode, null);
  const { returnCode, handoverCode } = await call(`/orders/${order.id}`, { token: customer.token });
  assert.match(returnCode, /^\d{4}$/);
  const wrong = String((Number(returnCode) + 1) % 10000).padStart(4, '0');
  for (let i = 0; i < 5; i++) await advance(driver.token, returning, { code: i === 0 ? handoverCode : wrong }, 400);
  await advance(driver.token, returning, { code: returnCode }, 409); // locked
  await call(`/admin/orders/${order.id}/proof-reset`, { token: admin.token, body: { reason: 'Sender verified by phone' } });
  const returned = await advance(driver.token, returning, { code: returnCode });
  assert.equal(returned.status, 'returned');
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).returnCode, null);
  const other2 = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await call(`/jobs/${other2.id}/accept`, { token: driver.token, body: {} }); // driver is free again
  await call(`/orders/${other2.id}/release`, { token: driver.token, body: {} });
  await call(`/orders/${other2.id}/release`, { token: driver.token, body: {} }); // acknowledge a lost response without another release/notification
  assert.equal((await call(`/orders/${other2.id}`, { token: customer.token })).status, 'searching');
  const replacement = await call('/auth/register', { body: { phone: '0599100004', name: 'Replacement', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${replacement.user.id}/approve`, { token: admin.token, body: {} });
  await call(`/jobs/${other2.id}/accept`, { token: replacement.token, body: {} });
  await call(`/orders/${other2.id}/release`, { token: driver.token, body: {} });
  assert.equal((await call(`/orders/${other2.id}`, { token: customer.token })).driverId, replacement.user.id, 'retrying the old release cannot unassign a new driver');
  await call(`/orders/${other2.id}/release`, { token: replacement.token, body: {} });
  await call(`/orders/${other2.id}/cancel`, { token: customer.token, body: {} });
  const earnings = await call('/driver/earnings', { token: driver.token });
  assert.equal(earnings.all.jobs, 3); // delivered parcel, finished ride, returned parcel
  const stats = await call('/admin/stats', { token: admin.token });
  assert.equal(stats.completed, 3);
  assert.equal(stats.statuses.returned, 1);

  // ---- T4: disputes after completion or return ----
  const reason = 'Box arrived with a broken corner';
  await call(`/orders/${other2.id}/dispute`, { token: customer.token, body: { reason }, expect: 409 }); // cancelled
  await call(`/orders/${order.id}/dispute`, { token: driver.token, body: { reason }, expect: 404 });
  await call(`/orders/${order.id}/dispute`, { token: customer.token, body: { reason: 'short' }, expect: 400 });
  const disputed = await call(`/orders/${order.id}/dispute`, { token: customer.token, body: { reason } });
  assert.deepEqual(disputed.dispute, { status: 'open', reason, resolution: null, credit: null });
  await call(`/orders/${order.id}/dispute`, { token: customer.token, body: { reason }, expect: 409 }); // one per order
  db.prepare('UPDATE orders SET completed_at = ? WHERE id = ?').run(Date.now() - 8 * 86_400_000, retry.id);
  await call(`/orders/${retry.id}/dispute`, { token: customer.token, body: { reason }, expect: 409 }); // window closed
  await call('/admin/disputes', { token: customer.token, expect: 403 });
  const open = await call('/admin/disputes', { token: admin.token });
  assert.equal(open.length, 1);
  assert.equal(open[0].orderId, order.id);
  assert.equal(open[0].status, 'open');
  await call(`/admin/disputes/${open[0].id}/resolve`, { token: admin.token, body: { resolution: 'no' }, expect: 400 });
  await call(`/admin/disputes/${open[0].id}/resolve`, { token: admin.token, body: { resolution: 'Driver photo shows intact box; explained' } });
  await call(`/admin/disputes/${open[0].id}/resolve`, { token: admin.token, body: { resolution: 'Second time' }, expect: 409 });
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).dispute.status, 'resolved');
  assert.equal((await call(`/orders/${order.id}`, { token: driver.token })).dispute, null);

  // ---- Ship review: a return the sender cannot confirm has an audited admin exit ----
  order = await inTransit();
  const stuckReport = { ...report, requestId: randomUUID() };
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: stuckReport });
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Sender verified' }, expect: 409 }); // not returning yet
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Recipient back home' } });
  assert.equal((await call(`/orders/${order.id}/exception`, { token: driver.token, body: stuckReport })).status, 'in_transit'); // replay after resolve: no new hold
  assert.equal(db.prepare("SELECT COUNT(*) n FROM security_events WHERE order_id = ? AND action = 'DELIVERY_EXCEPTION'").get(order.id).n, 1);
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID(), expectedStatus: 'on_hold' }, expect: 409 });
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID(), note: 'x'.repeat(201) }, expect: 400 });
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID() } });
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient refused twice' } });
  const confirmed = await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Sender confirmed by phone they have it' } });
  assert.equal(confirmed.status, 'returned');
  await call('/location', { token: driver.token, body: { latitude: 32.2, longitude: 35.2 }, expect: 409 }); // driver released

  // ---- Ship review: Souq partner contract ----
  const partnerKey = process.env.SOUQ_PARTNER_KEY;
  const partnerCall = (path, body, expect = 200) => fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Partner-Key': partnerKey }, body: body && JSON.stringify(body) })
    .then(async res => { const data = await res.json(); assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`); return data; });
  const partnerInput = { externalRef: 'souq:test-return', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Seller door', dropoffNote: 'Buyer door', contact: '0599100002', detail: 'Listing' };
  const { price } = await partnerCall('/partner/quotes', { pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false });
  let partnerOrder = await partnerCall('/partner/orders', { ...partnerInput, quotedPrice: price });
  partnerOrder = await call(`/jobs/${partnerOrder.id}/accept`, { token: driver.token, body: {} });
  partnerOrder = await advance(driver.token, await advance(driver.token, partnerOrder));
  await call(`/orders/${partnerOrder.id}/exception`, { token: driver.token, body: { ...report, requestId: randomUUID() } });
  assert.equal((await partnerCall(`/partner/orders/${partnerOrder.id}`)).status, 'on_hold');
  await partnerCall(`/partner/orders/${partnerOrder.id}/cancel`, {}, 409);
  await call(`/admin/orders/${partnerOrder.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Buyer refused parcel' } });
  const partnerView = await partnerCall(`/partner/orders/${partnerOrder.id}`);
  assert.equal(partnerView.status, 'returning');
  assert.match(partnerView.returnCode, /^\d{4}$/); // Souq routes it to its seller
  assert.equal((await advance(driver.token, partnerView, { code: partnerView.returnCode })).status, 'returned');
  assert.equal((await partnerCall(`/partner/orders/${partnerOrder.id}`)).returnCode, null);

  console.log('exceptions: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
