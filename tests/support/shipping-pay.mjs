import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function checkPickupPay({ call, persistence, input, driver, customer, admin }) {
  const pickupPoint = { latitude: 31.9038, longitude: 35.2034 };
  const book = () => call('/orders', { token: customer.token, body: { ...input, pickupPoint, quotedPrice: 49 } });
  const seedFix = () => persistence.run('INSERT INTO driver_locations (driver_id, lat, lng, updated_at) VALUES (?, ?, ?, ?)',
    driver.user.id, pickupPoint.latitude - 0.05, pickupPoint.longitude, Date.now());
  const accept = order => call('/jobs/' + order.id + '/accept', { token: driver.token, body: {} });
  const arrive = order => call('/orders/' + order.id + '/advance', { token: driver.token, body: { expectedStatus: 'assigned', requestId: randomUUID() } });
  const cash = () => call('/driver/cash', { token: driver.token });
  const earnings = () => call('/driver/earnings', { token: driver.token });
  const before = await cash();
  const beforeEarnings = (await earnings()).all.tripPayCents;
  await call('/admin/settings', { token: admin.token, body: { pickupPayPerKm: 1.25 } });
  const checkEntry = async (order, cents, actor) => {
    const entries = await persistence.all('SELECT kind, amount_cents, status, recorded_by FROM cash_entries WHERE note = ?',
      'DRV-18 pickup pay order ' + order.id);
    assert.deepEqual(entries.map(row => ({ ...row })), cents ? [{ kind: 'adjustment', amount_cents: -cents, status: 'confirmed', recorded_by: actor.user.id }] : []);
  };

  let order = await book();
  await seedFix();
  order = await arrive(await accept(order));
  const from = await persistence.one("SELECT detail FROM security_events WHERE order_id = ? AND action = 'ASSIGNED_FROM'", order.id);
  assert.deepEqual(JSON.parse(from.detail), { km: 5.6 });
  const exceptionPath = '/orders/' + order.id + '/exception';
  const report = { token: driver.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), reason: 'absent' } };
  assert.equal((await call(exceptionPath, report)).status, 'cancelled');
  assert.equal((await call(exceptionPath, report)).status, 'cancelled');
  const distancePay = 700; // 5.6 km × ₪1.25
  await checkEntry(order, distancePay, driver);

  order = await book();
  await seedFix();
  order = await arrive(await accept(order));
  await call('/orders/' + order.id + '/exception', { token: driver.token, body: {
    expectedStatus: 'at_pickup', requestId: randomUUID(), reason: 'captain_refused_pickup', detail: 'damaged_parcel',
  } });
  await checkEntry(order, 0);

  // A sender who cancels after dispatch assigns the captain pays nothing; Wind records the trip.
  order = await book();
  await seedFix();
  await call('/admin/orders/' + order.id + '/assign', { token: admin.token, body: { driverId: driver.user.id, reason: 'Dispatch test' } });
  const cancel = order => call('/orders/' + order.id + '/cancel', { token: customer.token, body: {} });
  assert.equal((await cancel(order)).status, 'cancelled');
  assert.equal((await cancel(order)).status, 'cancelled');
  await checkEntry(order, distancePay, customer);

  // A legacy negotiable parcel caps pickup pay at the accepted offer price.
  await call('/admin/settings', { token: admin.token, body: { pickupPayPerKm: 10 } });
  order = await book();
  await persistence.run('UPDATE orders SET recommended_price = price WHERE id = ?', order.id);
  await seedFix();
  await call('/jobs/' + order.id + '/offer', { token: driver.token, body: { price: 45 } });
  order = await call('/orders/' + order.id + '/offers/' + driver.user.id + '/accept', { token: customer.token, body: {} });
  await cancel(await arrive(order));
  const cappedPay = 4500;
  await checkEntry(order, cappedPay, customer);

  const total = 2 * distancePay + cappedPay;
  assert.equal((await cash()).owedCents, before.owedCents - total);
  const summary = await earnings();
  assert.equal(summary.all.tripPayCents, beforeEarnings + total);
  assert.equal(summary.week.tripPayCents, summary.all.tripPayCents);
  assert.ok(summary.today.tripPayCents > 0);
}
