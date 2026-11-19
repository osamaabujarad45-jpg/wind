import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { crowKm } from '../../src/model.ts';

export async function checkPickupPay({ call, persistence, input, driver, customer, admin }) {
  const pickupPoint = { latitude: 31.9038, longitude: 35.2034 };
  const book = () => call('/orders', { token: customer.token, body: { ...input, pickupPoint, quotedPrice: 49 } });
  const fix = offset => ({ latitude: pickupPoint.latitude - offset, longitude: pickupPoint.longitude });
  const km = offset => crowKm(fix(offset), pickupPoint);
  const seedFix = (offset, age = 0, displayed = offset) => persistence.run(`INSERT INTO driver_locations
    (driver_id, lat, lng, updated_at, good_lat, good_lng, good_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(driver_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at,
      good_lat = excluded.good_lat, good_lng = excluded.good_lng, good_at = excluded.good_at`,
    driver.user.id, fix(displayed).latitude, pickupPoint.longitude, Date.now(), fix(offset).latitude, pickupPoint.longitude, Date.now() - age);
  const accept = order => call('/jobs/' + order.id + '/accept', { token: driver.token, body: {} });
  const arrive = order => call('/orders/' + order.id + '/advance', { token: driver.token, body: { expectedStatus: 'assigned', requestId: randomUUID() } });
  const cash = () => call('/driver/cash', { token: driver.token });
  const earnings = () => call('/driver/earnings', { token: driver.token });
  const before = await cash();
  const beforeEarnings = await earnings();
  await call('/admin/settings', { token: admin.token, body: { pickupPayPerKm: 1.25 } });
  const checkEntry = async (order, cents, actor) => {
    const entries = await persistence.all('SELECT kind, amount_cents, status, recorded_by FROM cash_entries WHERE note = ?',
      'DRV-18 pickup pay order ' + order.id);
    assert.deepEqual(entries.map(row => ({ ...row })), cents ? [{ kind: 'adjustment', amount_cents: -cents, status: 'confirmed', recorded_by: actor.user.id }] : []);
  };

  const report = (order, body = {}, requestId = randomUUID()) => call(`/orders/${order.id}/exception`, { token: driver.token,
    body: { expectedStatus: 'at_pickup', requestId, reason: 'absent', ...body } });
  const from = order => persistence.one("SELECT detail FROM security_events WHERE order_id = ? AND action = 'ASSIGNED_FROM'", order.id);
  const cancel = (order, actor = customer) => call(`/orders/${order.id}/cancel`, { token: actor.token, body: {} });

  let order = await book();
  await seedFix(0.05, 0, 0.08);
  order = await arrive(await accept(order));
  assert.deepEqual(JSON.parse((await from(order)).detail), { km: km(0.05) });
  await seedFix(0.05, 0, 0); // The displayed marker moved to pickup, but the validated fix did not.
  assert.equal((await report(order)).status, 'cancelled');
  await checkEntry(order, 0);

  order = await book();
  await seedFix(0.05);
  order = await arrive(await accept(order));
  await seedFix(0.02);
  await report(order, { reason: 'captain_refused_pickup', detail: 'damaged_parcel' });
  await checkEntry(order, 0);

  const distancePay = Math.round((km(0.05) - km(0.02)) * 125);
  order = await book();
  await seedFix(0.05);
  order = await arrive(await accept(order));
  await seedFix(0.02);
  const requestId = randomUUID();
  assert.equal((await report(order, {}, requestId)).status, 'cancelled');
  assert.equal((await report(order, {}, requestId)).status, 'cancelled');
  await checkEntry(order, distancePay, driver);

  for (const [acceptAge, currentAge] of [[121_000, 0], [0, 121_000]]) {
    order = await book();
    await seedFix(0.05, acceptAge);
    order = await accept(order);
    assert.equal(Boolean(await from(order)), acceptAge === 0);
    await seedFix(0.02, currentAge);
    assert.equal((await cancel(order)).status, 'cancelled');
    await checkEntry(order, 0);
  }

  // Wind pays for the distance driven when the sender cancels after a dispatch assignment.
  order = await book();
  await seedFix(0.05);
  await call('/admin/orders/' + order.id + '/assign', { token: admin.token, body: { driverId: driver.user.id, reason: 'Dispatch test' } });
  await seedFix(0.02);
  assert.equal((await cancel(order)).status, 'cancelled');
  assert.equal((await cancel(order)).status, 'cancelled');
  await checkEntry(order, distancePay, customer);

  // A legacy negotiable parcel caps pickup pay at the accepted offer price.
  await call('/admin/settings', { token: admin.token, body: { pickupPayPerKm: 10 } });
  order = await book();
  await persistence.run('UPDATE orders SET recommended_price = price WHERE id = ?', order.id);
  await seedFix(0.06);
  await call('/jobs/' + order.id + '/offer', { token: driver.token, body: { price: 45 } });
  order = await call('/orders/' + order.id + '/offers/' + driver.user.id + '/accept', { token: customer.token, body: {} });
  order = await arrive(order);
  await seedFix(0.01);
  assert.equal((await cancel(order, admin)).status, 'cancelled');
  const cappedPay = 4500;
  await checkEntry(order, cappedPay, admin);

  const total = 2 * distancePay + cappedPay;
  assert.equal((await cash()).owedCents, before.owedCents - total);
  const summary = await earnings();
  for (const [period, bucket] of Object.entries(summary)) {
    assert.equal(bucket.tripPayCents, beforeEarnings[period].tripPayCents + total);
    assert.equal(bucket.net, (Math.round((bucket.gross - bucket.commission) * 100) + bucket.tripPayCents) / 100);
  }
}
