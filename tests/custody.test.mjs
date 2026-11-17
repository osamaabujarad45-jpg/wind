// SHIP-10: the sender and support read who held a parcel and when; the courier and other customers do not.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-custody-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
const { shutdown, server, promote, db, persistence } = await import('../server/main.ts');
const { remindOffice } = await import('../server/domain/office.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599210001', name: 'Admin', password: 'secret1' } });
  await promote('0599210001');
  const customer = await call('/auth/register', { body: { phone: '0599210002', name: 'Lina', password: 'secret1' } });
  const other = await call('/auth/register', { body: { phone: '0599210004', name: 'Omar', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599210003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Al-Manara', dropoffNote: 'Hospital', contact: '0599210002', detail: 'Box' };

  // Booked, accepted, collected, held at the door, sent back by support, returned with the sender's code.
  let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  order = await advance(driver.token, await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} })); // at_pickup
  order = await advance(driver.token, order); // in_transit
  await call(`/orders/${order.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent', note: 'Call 0599000000' } });
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Nobody home twice' } });
  const back = await call(`/orders/${order.id}`, { token: customer.token });
  await advance(driver.token, back, { code: back.returnCode });

  const chain = await call(`/orders/${order.id}/custody`, { token: customer.token });
  assert.deepEqual(chain.steps.map(s => s.kind), ['booked', 'assigned', 'picked_up', 'held', 'decided', 'returned']);
  assert.equal(chain.steps.find(s => s.kind === 'assigned').driver, 'Sami');
  assert.equal(chain.steps.find(s => s.kind === 'held').reason, 'absent');
  assert.equal(chain.steps.find(s => s.kind === 'held').by, 'driver');
  assert.equal(chain.steps.find(s => s.kind === 'decided').reason, 'return');
  assert.equal(chain.steps.find(s => s.kind === 'decided').by, 'support');
  assert.ok(!JSON.stringify(chain).includes('0599000000'), 'free-text notes never reach the chain');
  assert.ok(chain.steps.every((s, i, all) => i === 0 || all[i - 1].at <= s.at), 'oldest first');
  assert.deepEqual((await call(`/orders/${order.id}/custody`, { token: admin.token })).steps.length, chain.steps.length); // support sees the same

  await call(`/orders/${order.id}/custody`, { token: driver.token, expect: 404 }); // the courier has the job card, not the chain
  await call(`/orders/${order.id}/custody`, { token: other.token, expect: 404 });
  await call(`/orders/${order.id}/custody`, { expect: 401 });
  await call('/orders/999999/custody', { token: admin.token, expect: 404 });

  // SHIP-19: nobody took the return, support received it at the office (perishable: 24 h), the sender is reminded daily, and the
  // order ends once: collected, or after the hold, donated/destroyed with a reason and an actor.
  async function backAtOffice() {
    let o = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    o = await advance(driver.token, await call(`/jobs/${o.id}/accept`, { token: driver.token, body: {} }));
    o = await advance(driver.token, o);
    await call(`/orders/${o.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'refused' } });
    await call(`/admin/orders/${o.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient refused it' } });
    return call(`/admin/orders/${o.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Received at office' } });
  }
  let kept = await backAtOffice();
  assert.equal(kept.status, 'returned');
  await call(`/admin/orders/${kept.id}/office`, { token: customer.token, body: { action: 'received', note: 'Shelf A' }, expect: 403 });
  await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'collected' }, expect: 409 }); // not received yet
  await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'received', note: 'x' }, expect: 400 }); // a reason is needed
  const received = await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'received', perishable: true, note: 'Shelf A, cold box' } });
  assert.equal(received.office.perishable, true);
  assert.equal(received.office.until - received.office.receivedAt, 24 * 3_600_000);
  await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'received', note: 'Shelf A again' }, expect: 409 }); // once
  await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'destroyed', note: 'Spoiled food' }, expect: 409 }); // hold still running
  const shelf = await call('/admin/office', { token: admin.token });
  assert.deepEqual(shelf.items.map(i => i.orderId), [kept.id]);
  const seen = await call(`/orders/${kept.id}/custody`, { token: customer.token });
  const arrived = seen.steps.find(s => s.kind === 'office_received');
  assert.equal(arrived.until, received.office.until);
  assert.ok(!JSON.stringify(seen).includes('cold box'), 'office notes stay with support');
  // Daily reminder: not within the day, then once a day later.
  const push = [];
  assert.equal(await remindOffice(persistence, async (ids, kind, order) => { push.push({ ids, kind, order }); }), 0);
  assert.equal(await remindOffice(persistence, async (ids, kind, order) => { push.push({ ids, kind, order }); }, Date.now() + 24 * 3_600_000), 1);
  assert.deepEqual(push, [{ ids: [customer.user.id], kind: 'office', order: kept.id }]);
  assert.equal(await remindOffice(persistence, async () => { push.push('again'); }, Date.now() + 24 * 3_600_000 + 60_000), 0); // not twice the same day
  const collected = await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'collected' } });
  assert.equal(collected.office.closed.action, 'collected');
  await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'donated', note: 'Gave it away' }, expect: 409 }); // already ended
  assert.equal((await call('/admin/office', { token: admin.token })).items.length, 0);

  // Past the hold (non-perishable, 7 days) it may be donated, with the actor recorded.
  kept = await backAtOffice();
  await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'received', note: 'Shelf B' } });
  db.prepare("UPDATE security_events SET created_at = created_at - ? WHERE order_id = ? AND action = 'OFFICE_RECEIVED'").run(8 * 24 * 3_600_000, kept.id);
  await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'donated', note: 'no' }, expect: 400 }); // donating says why
  const donated = await call(`/admin/orders/${kept.id}/office`, { token: admin.token, body: { action: 'donated', note: 'Clothes, to the charity shop' } });
  assert.equal(donated.office.closed.action, 'donated');
  assert.equal(db.prepare("SELECT actor_id FROM security_events WHERE order_id = ? AND action = 'OFFICE_DONATED'").get(kept.id).actor_id, admin.user.id);
  // The office is only for a returned parcel.
  const live = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await call(`/admin/orders/${live.id}/office`, { token: admin.token, body: { action: 'received', note: 'Too early' }, expect: 409 });
  await call(`/orders/${live.id}/cancel`, { token: customer.token, body: {} });

  // A ride has no parcel to hold.
  const ride = { ...input, service: 'ride', option: '1', detail: '' };
  const r = await call('/orders', { token: customer.token, body: { ...ride, quotedPrice: quote(defaultSettings, ride) } });
  await call(`/orders/${r.id}/custody`, { token: customer.token, expect: 404 });
  console.log('Custody chain and office checks passed: chain for sender and support only; office receipt, daily reminder, one ending after the hold.');
} finally {
  await shutdown();
}
