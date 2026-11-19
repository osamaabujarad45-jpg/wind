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
const { shutdown, server, promote, db, remindOfficeJobs } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599210001', name: 'Admin', password: 'secret1' } });
  await promote('0599210001');
  admin.token = (await call('/auth/login', { body: { phone: '0599210001', password: 'secret1' } })).token;
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

  // A retried delivery appends attempts instead of rewriting the status silently: two reattempts read as attempts 2 and 3.
  let retried = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  retried = await advance(driver.token, await call(`/jobs/${retried.id}/accept`, { token: driver.token, body: {} }));
  retried = await advance(driver.token, retried); // in_transit
  for (let i = 0; i < 2; i++) {
    await call(`/orders/${retried.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
    if (i === 0) {
      const both = await Promise.all([1, 2].map(() => fetch(`${base}/admin/orders/${retried.id}/resolve`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ action: 'reattempt', reason: 'Call before coming' }) })));
      assert.deepEqual(both.map(r => r.status).sort(), [200, 409]);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM security_events WHERE order_id=? AND action='EXCEPTION_RESOLVED'").get(retried.id).n, 1,
        'concurrent reattempts append one decision');
    } else await call(`/admin/orders/${retried.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Call before coming' } });
  }
  const attempts = (await call(`/orders/${retried.id}/custody`, { token: customer.token })).steps.filter(s => s.kind === 'decided');
  assert.deepEqual(attempts.map(s => [s.reason, s.attempt]), [['reattempt', 2], ['reattempt', 3]]);
  // Resuming a support hold does not use a delivery attempt.
  db.prepare("UPDATE orders SET status = 'on_hold', exception_reason = 'support' WHERE id = ?").run(retried.id);
  await call(`/admin/orders/${retried.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Support hold released' } });
  await call(`/orders/${retried.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  assert.equal((await call(`/orders/${retried.id}`, { token: admin.token })).reattemptAllowed, false, 'the admin sees the limit before submitting (SHIP-08)');
  assert.equal((await call(`/orders/${retried.id}`, { token: customer.token })).reattemptAllowed, undefined);
  // The limit is the order's: a parcel now held by another captain (a new assignment) still has no attempt left.
  const held = db.prepare('SELECT driver_id, assignment_epoch FROM orders WHERE id = ?').get(retried.id);
  db.prepare('UPDATE orders SET driver_id = ?, assignment_epoch = assignment_epoch + 1 WHERE id = ?').run(admin.user.id, retried.id);
  assert.equal((await call(`/admin/orders/${retried.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'New captain tries' }, expect: 409 })).error, 'reattempt_limit');
  db.prepare('UPDATE orders SET driver_id = ?, assignment_epoch = ? WHERE id = ?').run(held.driver_id, held.assignment_epoch, retried.id);
  const refused = await call(`/admin/orders/${retried.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Call before coming' }, expect: 409 });
  assert.equal(refused.error, 'reattempt_limit');
  const decided = (await call(`/orders/${retried.id}/custody`, { token: customer.token })).steps.filter(s => s.kind === 'decided');
  assert.deepEqual(decided.map(s => s.attempt ?? null), [2, 3, null]);
  const startReturn = await call(`/admin/orders/${retried.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Three delivery attempts completed' } });
  assert.equal(startReturn.status, 'returning');
  await call(`/admin/orders/${retried.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Support verified receipt' } });
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
    await call(`/admin/orders/${o.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'fraud' } }); // one word, still support's own text
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
  assert.ok(!JSON.stringify(seen).includes('fraud'), "support's resolve reason stays with support, even one word");
  assert.equal(seen.steps.find(s => s.kind === 'decided').reason, 'return');
  // Daily reminder through the real sweep (queuePush inside its transaction): not within the day, then once a day later.
  const reminded = () => db.prepare("SELECT COUNT(*) n FROM security_events WHERE order_id = ? AND action = 'OFFICE_REMINDED'").get(kept.id).n;
  assert.equal(await remindOfficeJobs(), 0);
  assert.equal(await remindOfficeJobs(Date.now() + 24 * 3_600_000), 1);
  assert.equal(reminded(), 1);
  assert.equal(await remindOfficeJobs(Date.now() + 24 * 3_600_000 + 60_000), 0); // not twice the same day
  assert.equal(reminded(), 1);
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

  // A return the driver closed with the sender's code went to the sender: it never reaches the office.
  await call(`/admin/orders/${order.id}/office`, { token: admin.token, body: { action: 'received', note: 'Shelf C' }, expect: 409 });
  await call(`/admin/orders/${order.id}/office`, { token: admin.token, body: { action: ['received'], note: 'Shelf C' }, expect: 400 });

  // Every earlier holder is named: a courier who gave the job back appears with the release.
  const handed = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await call(`/jobs/${handed.id}/accept`, { token: driver.token, body: {} });
  await call(`/orders/${handed.id}/release`, { token: driver.token, body: {} });
  const afterRelease = await call(`/orders/${handed.id}/custody`, { token: customer.token });
  assert.equal(afterRelease.steps.find(s => s.kind === 'released').driver, 'Sami');
  await call(`/orders/${handed.id}/cancel`, { token: customer.token, body: {} });

  // A ride has no parcel to hold.
  const ride = { ...input, service: 'ride', option: '1', detail: '' };
  const r = await call('/orders', { token: customer.token, body: { ...ride, quotedPrice: quote(defaultSettings, ride) } });
  await call(`/orders/${r.id}/custody`, { token: customer.token, expect: 404 });
  console.log('Custody chain and office checks passed: chain for sender and support only; office receipt, daily reminder, one ending after the hold.');
} finally {
  await shutdown();
}
