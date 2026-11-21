// Blocking a courier mid-job: support confirms the recovery, and no parcel is left with nobody responsible.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, orderCode, quote } from '../src/model.ts';
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
  admin.token = (await call('/auth/login', { body: { phone: '0599300001', password: 'secret1' } })).token;
  const reviewer = await call('/auth/register', { body: { phone: '0599300007', name: 'Reviewer', password: 'secret1' } });
  await promote('0599300007');
  reviewer.token = (await call('/auth/login', { body: { phone: '0599300007', password: 'secret1' } })).token;
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
  // Undecided block reviews fence deletion and a role change. The balance is still zero, so this is not the cash fence.
  assert.equal((await call(path, { token: admin.token, method: 'PATCH', body: { role: 'customer' }, expect: 409 })).error, 'review_pending');
  assert.equal((await call('/me/delete', { token: blocked.token, body: { password: 'secret1' }, expect: 401 })).error, 'unauthorized'); // a block already ended the session
  assert.equal((await call(path, { token: admin.token, method: 'DELETE', expect: 409 })).error, 'review_pending');
  await assert.rejects(() => promote('0599300003'), { message: 'review_pending' });

  // A retained audit without its row is recovered when another API process opens this database.
  db.prepare('DELETE FROM courier_block_reviews WHERE order_id = ?').run(carried.id);
  const sqlite = !process.env.WIND_DATABASE_URL;
  if (sqlite) {
    db.prepare('DELETE FROM courier_block_reviews WHERE order_id = ?').run(denied.id);
    db.prepare(`UPDATE security_events SET id = (SELECT MAX(id) + 1 FROM security_events)
      WHERE action = 'COURIER_BLOCKED' AND order_id = ?`).run(denied.id);
    db.exec(`CREATE TRIGGER recovery_audit_failure BEFORE INSERT ON security_events
      WHEN NEW.order_id = ${denied.id} AND NEW.action = 'BLOCK_REVIEW_RECOVERED'
      BEGIN SELECT RAISE(ABORT, 'synthetic recovery audit failure'); END;`);
  }
  const restart = () => startApiProcess({ DB_PATH: process.env.DB_PATH, ...(process.env.WIND_DATABASE_URL && { WIND_DATABASE_URL: process.env.WIND_DATABASE_URL,
    WIND_POSTGRES_TEST_ONLY: process.env.WIND_POSTGRES_TEST_ONLY, WIND_POSTGRES_TEST_SCHEMA: process.env.WIND_POSTGRES_TEST_SCHEMA }) });
  let recoveredReview;
  for (let start = 0; start < 2; start++) {
    // Under the PostgreSQL legacy harness the second process must open the same schema (the helper strips database env).
    const api = await restart();
    try {
      const recovered = await apiCaller(() => api.base)(`/orders/${carried.id}`, { token: admin.token });
      recoveredReview = recovered.blockReview;
      assert.equal(recoveredReview.tripPayCents, returned.blockReview.tripPayCents);
      assert.equal(recoveredReview.decidedAt, null);
      assert.equal(recoveredReview.cleared, null);
      assert.equal(recoveredReview.blockedBy, returned.blockReview.blockedBy);
      assert.ok(recoveredReview.dueAt > returned.blockReview.dueAt, 'recovery is due two working days after the recovery, not the block');
      if (sqlite && start === 0) {
        assert.ok(api.diagnostics().includes('"category":"maintenance_failed"'));
        assert.ok(api.diagnostics().includes(`"orderId":${denied.id}`));
      }
    } finally { await api.stop(); }
    if (sqlite && start === 0) {
      assert.equal(db.prepare('SELECT order_id FROM courier_block_reviews WHERE order_id = ?').get(denied.id), undefined,
        'a failed audit rolls back its review while a separate row recovers');
      db.exec('DROP TRIGGER recovery_audit_failure');
    }
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM courier_block_reviews WHERE order_id = ?').get(carried.id).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM security_events WHERE order_id = ? AND action = 'BLOCK_REVIEW_RECOVERED'").get(carried.id).n, 1);
  const realNow = Date.now;
  try {
    // Each review recovered by a later start is due two working days after its own recovery: move past the latest one.
    const latestDue = Number(db.prepare('SELECT MAX(due_at) d FROM courier_block_reviews WHERE order_id IN (?, ?)').get(carried.id, denied.id).d);
    Date.now = () => Math.max(recoveredReview.dueAt, latestDue) + 1;
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

  // An undecided pickup-pay review fences the same way. A credit left by a granted review fences as cash, in that direction.
  const departing = await call('/auth/register', { body: { phone: '0599300011', name: 'Hadi', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${departing.user.id}/approve`, { token: admin.token, body: {} });
  const departPath = `/admin/users/${departing.user.id}`;
  let departOrder = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  departOrder = await call(`/jobs/${departOrder.id}/accept`, { token: departing.token, body: {} });
  await call(`/orders/${departOrder.id}/cancel`, { token: customer.token, body: {} });
  const stats = () => call('/admin/stats', { token: admin.token });
  const { pickupPayReviewsOpen: openBefore, pickupPayReviews } = await stats();
  assert.ok(openBefore >= 1);
  assert.deepEqual(pickupPayReviews.find(row => row.orderId === departOrder.id), {
    orderId: departOrder.id, orderCode: orderCode(departOrder.id), driverName: 'Hadi', suggestedCents: null, reason: 'customer_cancelled',
  });
  assert.equal((await call(departPath, { token: admin.token, method: 'PATCH', body: { role: 'customer' }, expect: 409 })).error, 'review_pending');
  assert.equal((await call('/me/delete', { token: departing.token, body: { password: 'secret1' }, expect: 409 })).error, 'review_pending');
  assert.equal((await call(departPath, { token: admin.token, method: 'DELETE', expect: 409 })).error, 'review_pending');
  await assert.rejects(() => promote('0599300011'), { message: 'review_pending' });
  const pickupPath = `/admin/orders/${departOrder.id}/pickup-pay-review`;
  const denial = { granted: false, km: 0, reason: 'No validated origin' };
  await call(pickupPath, { token: reviewer.token, body: denial });
  assert.equal((await stats()).pickupPayReviewsOpen, openBefore - 1);
  assert.ok(!(await stats()).pickupPayReviews.some(row => row.orderId === departOrder.id));
  const savedEvidence = JSON.parse(db.prepare("SELECT detail FROM security_events WHERE order_id = ? AND action = 'PICKUP_PAY_REVIEW'").get(departOrder.id).detail);
  const recordReview = async evidence => db.prepare(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at)
    VALUES (?, ?, 'PICKUP_PAY_REVIEW', ?, ?)`).run(customer.user.id, departOrder.id, JSON.stringify(evidence), Date.now());
  await recordReview({ ...savedEvidence, assignmentEpoch: savedEvidence.assignmentEpoch - 1 });
  assert.equal((await stats()).pickupPayReviewsOpen, openBefore - 1);
  await recordReview(savedEvidence);
  assert.equal((await stats()).pickupPayReviewsOpen, openBefore);
  await assert.rejects(() => promote('0599300011'), { message: 'review_pending' });
  await call(pickupPath, { token: reviewer.token, body: denial });
  await call(departPath, { token: admin.token, method: 'PATCH', body: { role: 'customer' } });
  await call(departPath, { token: admin.token, method: 'PATCH', body: { role: 'driver', vehicle: 'car' } });
  await call(departPath, { token: admin.token, method: 'DELETE' });
  await recordReview(savedEvidence); // a pre-fence receipt retained after the captain left
  assert.equal((await stats()).pickupPayReviewsOpen, openBefore);
  assert.equal((await call(pickupPath, { token: reviewer.token, body: { ...denial, km: 1, granted: true }, expect: 409 })).error, 'driver_departed');
  const closedPickup = await call(pickupPath, { token: reviewer.token, body: denial });
  assert.equal(closedPickup.paidCents, 0);
  assert.deepEqual(await call(pickupPath, { token: reviewer.token, body: denial }), closedPickup);
  assert.equal((await stats()).pickupPayReviewsOpen, openBefore - 1);
  assert.equal(db.prepare("SELECT id FROM cash_entries WHERE order_id = ? AND source = 'pickup_pay'").get(departOrder.id), undefined);

  const credited = await call('/auth/register', { body: { phone: '0599300012', name: 'Nada', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${credited.user.id}/approve`, { token: admin.token, body: {} });
  let creditOrder = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  creditOrder = await call(`/jobs/${creditOrder.id}/accept`, { token: credited.token, body: {} });
  await call(`/orders/${creditOrder.id}/cancel`, { token: customer.token, body: {} });
  const granted = await call(`/admin/orders/${creditOrder.id}/pickup-pay-review`, { token: reviewer.token, body: { granted: true, km: 1, reason: 'Grant one kilometre' } });
  assert.ok(granted.paidCents > 0);
  assert.ok((await call('/driver/cash', { token: credited.token })).owedCents < 0);
  const creditPath = `/admin/users/${credited.user.id}`;
  assert.equal((await call(creditPath, { token: admin.token, method: 'PATCH', body: { role: 'customer' }, expect: 409 })).error, 'cash_outstanding');
  assert.equal((await call(creditPath, { token: admin.token, method: 'DELETE', expect: 409 })).error, 'cash_outstanding');
  await assert.rejects(() => promote('0599300012'), { message: 'cash_outstanding' });
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
  // A retained rollback audit points at a driver who left before recovery.
  const departed = await call('/auth/register', { body: { phone: '0599300013', name: 'Former driver', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const departedPath = `/admin/users/${departed.user.id}`;
  await call(`${departedPath}/approve`, { token: admin.token, body: {} });
  const retainedOrders = [];
  for (let i = 0; i < 2; i++) {
    const order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    const accepted = await call(`/jobs/${order.id}/accept`, { token: departed.token, body: {} });
    retainedOrders.push(await advance(departed.token, await advance(departed.token, accepted)));
  }
  await call(departedPath, { token: admin.token, body: { status: 'blocked', recovery: 'return' } });
  for (const order of retainedOrders) await call(`/admin/orders/${order.id}/resolve`, {
    token: admin.token, body: { action: 'confirm_return', reason: 'Office received retained parcel' },
  });
  const [missingReview, existingReview] = retainedOrders;
  db.prepare('DELETE FROM courier_block_reviews WHERE order_id = ?').run(missingReview.id);
  db.prepare("UPDATE users SET role = 'customer', vehicle = NULL WHERE id = ?").run(departed.user.id);
  const restarted = await restart();
  try {
    const recovered = await apiCaller(() => restarted.base)(`/orders/${missingReview.id}`, { token: admin.token });
    assert.equal(recovered.blockReview, undefined);
    assert.ok(restarted.diagnostics().includes('"category":"block_review_driver_departed"'));
    assert.ok(restarted.diagnostics().includes(`"driverId":${departed.user.id}`));
  } finally { await restarted.stop(); }
  const retainedReviewPath = `/admin/orders/${existingReview.id}/block-review`;
  db.prepare('UPDATE courier_block_reviews SET due_at = ? WHERE order_id = ?').run(Date.now() - 1, existingReview.id);
  const overdue = (await stats()).blockReviewsOverdue;
  assert.equal((await call(retainedReviewPath, { token: reviewer.token, body: decision, expect: 409 })).error, 'driver_departed');
  const close = { cleared: false, note: 'Former captain review reconciled' };
  const closed = await call(retainedReviewPath, { token: reviewer.token, body: close });
  assert.equal(closed.paidCents, 0);
  assert.deepEqual(await call(retainedReviewPath, { token: reviewer.token, body: close }), closed);
  assert.equal((await stats()).blockReviewsOverdue, overdue - 1);
  assert.equal(db.prepare("SELECT id FROM cash_entries WHERE driver_id = ? AND source = 'trip_pay'").get(departed.user.id), undefined);
  // Sol second recheck of PR #101: support took the goods from this captain mid-return, then the captain is blocked. The captain
  // no longer carries them: no custody block review, no status change, and office intake pays the trip so far as usual.
  const held = await call('/auth/register', { body: { phone: '0599300011', name: 'Held', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${held.user.id}/approve`, { token: admin.token, body: {} });
  let supportHeld = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  supportHeld = await call(`/jobs/${supportHeld.id}/accept`, { token: held.token, body: {} });
  supportHeld = await advance(held.token, await advance(held.token, supportHeld));
  await call(`/orders/${supportHeld.id}/exception`, { token: held.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'access_blocked' } });
  await call(`/admin/orders/${supportHeld.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient unreachable' } });
  await call(`/admin/orders/${supportHeld.id}/resolve`, { token: admin.token, body: { action: 'support_takeover', reason: 'Support met the captain' } });
  await call(`/admin/users/${held.user.id}`, { token: admin.token, method: 'PATCH', body: { status: 'blocked', recovery: 'return' } });
  assert.equal(db.prepare('SELECT order_id FROM courier_block_reviews WHERE order_id = ?').get(supportHeld.id), undefined, 'support held the goods: no custody block review');
  assert.equal(JSON.parse(db.prepare("SELECT detail FROM security_events WHERE order_id = ? AND action = 'COURIER_BLOCKED'").get(supportHeld.id).detail).custody, false);
  const intake = await call(`/admin/orders/${supportHeld.id}/resolve`, { token: admin.token, body: { action: 'confirm_office_return', carrier: 'support', reason: 'Support brought it to the office' } });
  assert.equal(intake.status, 'returned');
  assert.equal(db.prepare("SELECT amount_cents FROM cash_entries WHERE source = 'trip_pay' AND order_id = ?").get(supportHeld.id)?.amount_cents, -2000, 'the trip so far');
  console.log('courier-block: parcels recover through custody and boarded rides end unpaid');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
