import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { crowKm } from '../../src/model.ts';

export async function checkCompletedReattempt({ call, persistence, input, driver, customer, admin }) {
  const order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: 49 } });
  const path = `/orders/${order.id}`;
  const advance = (expectedStatus, extra = {}) => call(`${path}/advance`, { token: driver.token, body: { expectedStatus, requestId: randomUUID(), ...extra } });
  const pay = () => persistence.all("SELECT amount_cents FROM cash_entries WHERE order_id = ? AND source = 'trip_pay'", order.id);
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await advance('assigned');
  await advance('at_pickup');
  await call(`${path}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  await call(`/admin/orders/${order.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Recipient is ready now' } });
  assert.deepEqual(await pay(), []);
  const { handoverCode } = await call(path, { token: customer.token });
  const proof = { requestId: randomUUID(), code: handoverCode };
  assert.ok((await advance('in_transit', proof)).commission > 0, 'successful delivery earns the fare as usual');
  assert.equal((await advance('in_transit', proof)).status, 'completed');
  assert.deepEqual((await pay()).map(row => row.amount_cents), [-Math.round(order.price * 100)]);
}

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
  const review = async (order, reason, granted, distance = 0, cents = 0, evidence) => {
    const before = (await call(`/orders/${order.id}`, { token: admin.token })).pickupPayReview;
    assert.equal(before.reason, reason);
    assert.equal(before.decision, null);
    if (evidence) assert.deepEqual(Object.fromEntries(Object.keys(evidence).map(key => [key, before[key]])), evidence);
    await checkEntry(order, 0);
    assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).pickupPayReview, undefined);
    const path = `/admin/orders/${order.id}/pickup-pay-review`;
    const body = { granted, km: distance, reason: 'Reviewed pickup evidence' };
    await call(path, { token: customer.token, body, expect: 403 });
    await call(path, { token: admin.token, body: { ...body, km: 200.01 }, expect: 400 });
    const first = await call(path, { token: admin.token, body });
    assert.equal(first.paidCents, cents);
    assert.deepEqual(await call(path, { token: admin.token, body }), first, 'a lost reply replays the same decision');
    await call(path, { token: admin.token, body: { ...body, granted: !granted }, expect: 409 });
    await checkEntry(order, cents, admin);
  };
  // The server clock moves with this test, so a later fix stays inside the 70 m/s gate.
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  const jump = ms => { shift += ms; };
  const park = async offset => { jump(60_000); assert.equal((await upload(offset)).accepted, true); };
  try {
    // A leftover fix from an earlier job would still be an origin. Idle cases start with none.
    await persistence.run('DELETE FROM driver_locations WHERE driver_id = ?', driver.user.id);
    let order;
    // Idle captain, no validated fix: a client position is corroboration only, so every one of these is a review and pays nothing.
    for (const initial of [undefined, position(0.05), position(0.05, 121_000), position(0.05, 0, 201)]) {
      order = await accept(await book(), initial);
      assert.equal(await from(order), undefined, 'an idle accept has no server origin');
      await cancel(order);
      await review(order, 'customer_cancelled', false, 0, 0, { originKm: null, currentKm: null, suggestedCents: null });
    }
    order = await accept(await book(null), position(0.05));
    assert.equal(await from(order), undefined);
    await cancel(order);
    await review(order, 'customer_cancelled', false);

    // POST /location needs a job already in hand. That fix is the origin of the next accept.
    const carrier = await accept(await book());
    assert.equal(await from(carrier), undefined);
    assert.equal((await upload(0.05)).accepted, true);

    const fixAt = async () => (await persistence.one('SELECT good_at FROM driver_locations WHERE driver_id = ?', driver.user.id)).good_at;
    const originFixAt = await fixAt();
    jump(1000);
    order = await arrive(await accept(await book(), position(0.05)));
    const scope = await call(`/orders/${order.id}?liveProtocol=1`, { token: customer.token });
    assert.deepEqual(JSON.parse((await from(order)).detail), { km: km(0.05), fixAt: originFixAt, driverId: driver.user.id, assignmentEpoch: scope.assignmentEpoch });
    assert.ok(originFixAt < order.assignedAt);
    // The origin is the pre-accept fix. Pay compares a fix taken after assignment, so the same place is reported again.
    jump(60_000);
    assert.equal((await upload(0.05)).accepted, true);
    const currentFixAt = await fixAt();
    assert.equal((await report(order)).status, 'cancelled');
    await checkEntry(order, 0);
    await review(order, 'absent', false, 0, 0, { originKm: km(0.05), currentKm: km(0.05), suggestedCents: 0, originFixAt, currentFixAt });

    const driven = km(0.05) - km(0.02);
    const distancePay = Math.round(driven * 125);
    order = await arrive(await accept(await book(), position(0.05)));
    jump(60_000);
    assert.equal((await upload(0.02)).accepted, true);
    await report(order, { reason: 'captain_refused_pickup', detail: 'damaged_parcel' });
    await checkEntry(order, 0);
    await review(order, 'captain_refused_pickup', true, driven, distancePay);

    await park(0.05);
    order = await arrive(await accept(await book(), position(0.05)));
    jump(60_000);
    assert.equal((await upload(0.02)).accepted, true);
    const requestId = randomUUID();
    assert.equal((await report(order, {}, requestId)).status, 'cancelled');
    assert.equal((await report(order, {}, requestId)).status, 'cancelled');
    await review(order, 'absent', true, driven, distancePay, { originKm: km(0.05), currentKm: km(0.02), suggestedCents: distancePay });

    // Far client position, validated fix left where it was: no origin, review, no pay.
    order = await accept(await book(), position(0));
    assert.equal(await from(order), undefined, 'a far client position does not become the origin');
    await cancel(order);
    await review(order, 'customer_cancelled', false);
    await checkEntry(order, 0);

    // A client position that disagrees with the validated fix is not an origin either.
    order = await accept(await book(), position(0.05));
    assert.equal(await from(order), undefined, 'a position that disagrees with the validated fix records no origin');
    await cancel(order);
    await review(order, 'customer_cancelled', false);

    await park(0.05);
    order = await accept(await book(), position(0.05));
    assert.ok(await from(order));
    jump(121_000);
    await cancel(order);
    await review(order, 'customer_cancelled', false, 0, 0, { originKm: km(0.05), currentKm: null, suggestedCents: null });

    // Dispatch reads the same validated fix while the captain is already carrying the seed parcel.
    await park(0.05);
    order = await book();
    await call(`/admin/orders/${order.id}/assign`, { token: admin.token, body: { driverId: driver.user.id, reason: 'Dispatch test' } });
    assert.ok(await from(order));
    jump(60_000);
    assert.equal((await upload(0.02)).accepted, true);
    assert.equal((await cancel(order)).status, 'cancelled');
    assert.equal((await cancel(order)).status, 'cancelled');
    await review(order, 'customer_cancelled', true, driven, distancePay, { originKm: km(0.05), currentKm: km(0.02), suggestedCents: distancePay });
    await cancel(carrier);
    await review(carrier, 'customer_cancelled', false);

    // A legacy negotiable parcel caps approved pickup pay at the accepted offer price.
    await setRate(10);
    order = await book();
    await persistence.run('UPDATE orders SET recommended_price = price WHERE id = ?', order.id);
    await call(`/jobs/${order.id}/offer`, { token: driver.token, body: { price: 45 } });
    order = await call(`/orders/${order.id}/offers/${driver.user.id}/accept`, { token: customer.token, body: {} });
    await arrive(order);
    assert.equal((await cancel(order, admin)).status, 'cancelled');
    const cappedPay = 4500;
    await review(order, 'support_cancelled', true, 200, cappedPay);

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
    await review(order, 'customer_cancelled', false); // The first assignment's accept position cannot price the third one.

    const total = 3 * distancePay + cappedPay;
    assert.equal((await cash()).owedCents, before.owedCents - total);
    const summary = await earnings();
    for (const [period, bucket] of Object.entries(summary)) {
      assert.equal(bucket.tripPayCents, beforeEarnings[period].tripPayCents + total);
      assert.equal(bucket.net, Math.round((bucket.gross - bucket.commission) * 100) / 100);
      assert.equal(bucket.earnedNet, (Math.round((bucket.gross - bucket.commission) * 100) + bucket.tripPayCents) / 100);
    }
  } finally { Date.now = realNow; }
}
