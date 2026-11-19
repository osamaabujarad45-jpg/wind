import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { crowKm } from '../../src/model.ts';

export async function checkPickupPay({ call, persistence, input, driver, other, customer, admin, liveWatcherCount }) {
  const pickupPoint = { latitude: 31.9038, longitude: 35.2034 };
  const book = (point = pickupPoint) => call('/orders', { token: customer.token, body: { ...input, pickupPoint: point, quotedPrice: 49 } });
  const fix = offset => ({ latitude: pickupPoint.latitude - offset, longitude: pickupPoint.longitude, accuracy: 5 });
  const km = offset => crowKm(fix(offset), pickupPoint);
  const position = (offset, age = 0, accuracy = 5) => ({ ...fix(offset), accuracy, at: Date.now() - age });
  const upload = (offset, accuracy = 5) => call('/location', { token: driver.token, body: { ...fix(offset), accuracy } });
  const accept = (order, position) => call(`/jobs/${order.id}/accept`, { token: driver.token, body: { position } });
  const arrive = order => call(`/orders/${order.id}/advance`, { token: driver.token, body: { expectedStatus: 'assigned', requestId: randomUUID() } });
  const cash = () => call('/driver/cash', { token: driver.token });
  const earnings = () => call('/driver/earnings', { token: driver.token });
  const before = await cash();
  const beforeEarnings = await earnings();
  const setRate = pickupPayPerKm => call('/admin/settings?payroll=1', { token: admin.token, body: { pickupPayPerKm } });
  await setRate(1.25);
  const checkEntry = async (order, cents, actor) => {
    const entries = await persistence.all("SELECT kind, amount_cents, status, recorded_by FROM cash_entries WHERE source = 'pickup_pay' AND order_id = ?", order.id);
    assert.deepEqual(entries.map(row => ({ ...row })), cents ? [{ kind: 'adjustment', amount_cents: -cents, status: 'confirmed', recorded_by: actor.user.id }] : []);
  };
  const report = (order, body = {}, requestId = randomUUID()) => call(`/orders/${order.id}/exception`, { token: driver.token,
    body: { expectedStatus: 'at_pickup', requestId, reason: 'absent', ...body } });
  const from = order => persistence.one("SELECT detail FROM security_events WHERE order_id = ? AND action = 'ASSIGNED_FROM'", order.id);
  const cancel = (order, actor = customer) => call(`/orders/${order.id}/cancel`, { token: actor.token, body: {} });
  const review = async (order, reason, granted, distance = 0, cents = 0) => {
    const before = (await call(`/orders/${order.id}`, { token: admin.token })).pickupPayReview;
    assert.equal(before.reason, reason);
    assert.equal(before.decision, null);
    assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).pickupPayReview, undefined);
    const path = `/admin/orders/${order.id}/pickup-pay-review`;
    const body = { granted, km: distance, reason: 'Reviewed pickup evidence' };
    await call(path, { token: customer.token, body, expect: 403 });
    const first = await call(path, { token: admin.token, body });
    assert.equal(first.paidCents, cents);
    assert.deepEqual(await call(path, { token: admin.token, body }), first, 'a lost reply replays the same decision');
    await call(path, { token: admin.token, body: { ...body, granted: !granted }, expect: 409 });
    await checkEntry(order, cents, admin);
  };

  let order = await arrive(await accept(await book(), position(0.05)));
  const scope = await call(`/orders/${order.id}?liveProtocol=1`, { token: customer.token });
  assert.deepEqual(JSON.parse((await from(order)).detail), { km: km(0.05), driverId: driver.user.id, assignmentEpoch: scope.assignmentEpoch });
  assert.equal((await upload(0.05)).accepted, true);
  assert.equal((await report(order)).status, 'cancelled');
  await checkEntry(order, 0);
  assert.equal((await call(`/orders/${order.id}`, { token: admin.token })).pickupPayReview, undefined, 'zero movement is measured evidence');

  const driven = km(0.05) - km(0.02);
  const distancePay = Math.round(driven * 125);
  order = await arrive(await accept(await book(), position(0.05)));
  assert.equal((await upload(0.02)).accepted, true);
  await report(order, { reason: 'captain_refused_pickup', detail: 'damaged_parcel' });
  await checkEntry(order, 0);
  await review(order, 'captain_refused_pickup', true, driven, distancePay);

  order = await arrive(await accept(await book(), position(0.05)));
  assert.equal((await upload(0.02)).accepted, true);
  const requestId = randomUUID();
  assert.equal((await report(order, {}, requestId)).status, 'cancelled');
  assert.equal((await report(order, {}, requestId)).status, 'cancelled');
  await checkEntry(order, distancePay, driver);

  for (const initial of [undefined, position(0.05, 121_000), position(0.05, 0, 201)]) {
    order = await accept(await book(), initial);
    assert.equal(await from(order), undefined);
    assert.equal((await upload(0.02)).accepted, true);
    await cancel(order);
    await review(order, 'missing_position', false);
  }
  order = await accept(await book(null), position(0.05));
  await cancel(order);
  await review(order, 'missing_position', false);

  order = await accept(await book(), position(0.05));
  assert.equal((await upload(0.02)).accepted, true);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 121_000;
    await cancel(order);
  } finally { Date.now = realNow; }
  await review(order, 'missing_position', false);

  // Dispatch can capture a current fix when the captain is already delivering another parcel.
  const active = await accept(await book());
  assert.equal((await upload(0.05)).accepted, true);
  order = await book();
  await call(`/admin/orders/${order.id}/assign`, { token: admin.token, body: { driverId: driver.user.id, reason: 'Dispatch test' } });
  assert.ok(await from(order));
  // Advance the reported capture time enough to make both positions physically plausible.
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 60_000;
    assert.equal((await upload(0.02)).accepted, true);
    assert.equal((await cancel(order)).status, 'cancelled');
    assert.equal((await cancel(order)).status, 'cancelled');
  } finally { Date.now = originalNow; }
  await checkEntry(order, distancePay, customer);
  await cancel(active);

  // A legacy negotiable parcel caps approved pickup pay at the accepted offer price.
  await setRate(10);
  order = await book();
  await persistence.run('UPDATE orders SET recommended_price = price WHERE id = ?', order.id);
  await call(`/jobs/${order.id}/offer`, { token: driver.token, body: { price: 45 } });
  order = await call(`/orders/${order.id}/offers/${driver.user.id}/accept`, { token: customer.token, body: {} });
  await arrive(order);
  assert.equal((await cancel(order, admin)).status, 'cancelled');
  const cappedPay = 4500;
  await review(order, 'support_cancelled', true, 10, cappedPay);

  order = await accept(await book(), position(0.05));
  const first = await call(`/orders/${order.id}?liveProtocol=1`, { token: customer.token });
  const live = `/orders/${order.id}/live?driver=${driver.user.id}`;
  const held = call(`${live}&assignment=${first.assignmentEpoch}`, { token: customer.token });
  for (let retry = 0; retry < 100 && !liveWatcherCount(order.id); retry++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(liveWatcherCount(order.id), 1);
  for (const driverId of [other.user.id, driver.user.id]) {
    await call(`/admin/orders/${order.id}/assign`, { token: admin.token, body: { driverId, reason: 'Reassign live tracking fixture' } });
  }
  assert.equal((await upload(0.02)).accepted, true);
  assert.deepEqual(await held, { driverLocation: null, driverKey: String(driver.user.id), driverChanged: true });
  assert.ok((await call(live, { token: customer.token })).driverLocation, 'driver-only live requests still read the current fix');
  await cancel(order);
  await review(order, 'missing_position', false); // The first assignment's accept position cannot price the third one.

  const total = 3 * distancePay + cappedPay;
  assert.equal((await cash()).owedCents, before.owedCents - total);
  const summary = await earnings();
  for (const [period, bucket] of Object.entries(summary)) {
    assert.equal(bucket.tripPayCents, beforeEarnings[period].tripPayCents + total);
    assert.equal(bucket.net, (Math.round((bucket.gross - bucket.commission) * 100) + bucket.tripPayCents) / 100);
  }
}
