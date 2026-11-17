import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeStatuses, runSheet } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

if (process.argv.includes('--postgres')) {
  const { freshPostgres, selectRuntime } = await import('./pg-support.mjs');
  const fixture = await freshPostgres('multi_recipient');
  await fixture.database.close(); selectRuntime(fixture.schema);
}
const directory = mkdtempSync(join(tmpdir(), 'wind-multi-recipient-'));
process.env.DB_PATH = join(directory, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
delete process.env.OSRM_URL;
const actualFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  assert.equal(new URL(url).hostname, '127.0.0.1', 'the fixture must never make external requests');
  return actualFetch(url, options);
};
const { server, persistence, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let offline = false, loseReply = false;
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, async (...args) => {
  if (offline) throw Error('Synthetic offline transport');
  const response = await fetch(...args);
  if (loseReply) { loseReply = false; await response.text(); throw Error('Synthetic lost reply after commit'); }
  return response;
});
try {
  const register = (phone, role = 'customer') => call('/auth/register', { body: { phone, role, name: 'Multi-recipient fixture',
    password: 'secret123', ...(role === 'driver' && { vehicle: 'van' }) } });
  const admin = await register('0599351001'); await promote('0599351001');
  const sender = await register('0599351002'), driver = await register('0599351003', 'driver');
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const advance = (order, extra = {}, expect = 200) => call(`/orders/${order.id}/advance`, { token: driver.token,
    body: { requestId: randomUUID(), expectedStatus: order.status, ...extra }, expect });
  const parcels = [];
  for (const [index, recipientName, dropoffCity, option] of [[1, 'Huda', 'nablus', 'small'], [2, 'Sami', 'hebron', 'large'], [3, 'Nour', 'jenin', 'small']]) {
    const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity, option, shared: false,
      pickupNote: 'Sender gate', dropoffNote: `${recipientName} door`, contact: '0599351002', recipientName,
      recipientPhone: `059935100${index + 3}`, detail: 'Fixture box', requestId: randomUUID() };
    const { price } = await call('/price', { token: sender.token, body: input });
    let order = await call('/orders', { token: sender.token, body: { ...input, quotedPrice: price } });
    // Distinct fixture proofs make a wrong-recipient regression deterministic.
    await persistence.run('UPDATE orders SET handover_code=? WHERE id=?', `${index}00${index}`, order.id);
    order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
    parcels.push(await advance(await advance(order)));
  }
  const [a, b, c] = parcels;
  const proof = async order => (await call(`/orders/${order.id}`, { token: sender.token })).handoverCode;
  const codes = await Promise.all(parcels.map(proof));
  const carried = async () => (await call('/orders', { token: driver.token })).filter(order => activeStatuses.includes(order.status));
  const sheet = runSheet(await carried());
  assert.deepEqual(sheet.map(group => [group.stage, group.city, group.orders[0].recipientName]),
    [['deliver', 'hebron', 'Sami'], ['deliver', 'jenin', 'Nour'], ['deliver', 'nablus', 'Huda']],
    'the current city/stage run sheet retains each recipient at their own next stop');
  assert.deepEqual(sheet.map(group => group.orders[0].price), [30, 20, 20]);
  for (const order of await carried()) { assert.equal(order.handoverCode, null); assert.equal(order.cashCollectionAllowed, true); }
  assert.equal((await advance(a, { code: codes[1], cashCollection: { collectedMinor: 2000 } }, 400)).error, 'wrong_code');
  assert.equal((await call(`/orders/${a.id}`, { token: driver.token })).status, 'in_transit');
  assert.equal((await call(`/orders/${b.id}`, { token: driver.token })).cashCollection, undefined);

  const completion = { expectedStatus: 'in_transit', requestId: randomUUID(), code: codes[0], cashCollection: { collectedMinor: 2000 } };
  loseReply = true;
  await assert.rejects(call(`/orders/${a.id}/advance`, { token: driver.token, body: completion }), /Test request failed/);
  offline = true;
  await assert.rejects(call('/orders', { token: driver.token }), /Test request failed/);
  offline = false;
  const recovered = await call(`/orders/${a.id}`, { token: driver.token });
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.recipientName, 'Huda');
  assert.equal(recovered.cashCollection.collectedMinor, 2000);
  assert.deepEqual((await call(`/orders/${a.id}/advance`, { token: driver.token, body: completion })).cashCollection, recovered.cashCollection);
  assert.equal(Number((await persistence.one('SELECT count(*) AS n FROM order_cash_collections WHERE order_id=?', a.id)).n), 1);

  const report = (order, reason) => call(`/orders/${order.id}/exception`, { token: driver.token,
    body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason, note: 'Fixture recipient unavailable' } });
  await report(b, 'absent');
  const retried = await call(`/admin/orders/${b.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Recipient confirmed available' } });
  assert.equal(retried.recipientName, 'Sami');
  const completedB = await advance(retried, { code: codes[1], cashCollection: { collectedMinor: 2500, varianceReason: 'PARTIAL_PAYMENT' } });
  assert.equal(completedB.cashCollection.expectedMinor, 3000);
  assert.equal(completedB.cashCollection.collectedMinor, 2500);
  await report(c, 'refused');
  const returning = await call(`/admin/orders/${c.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient refused fixture parcel' } });
  const returnSheet = runSheet(await carried());
  assert.deepEqual(returnSheet.map(group => [group.stage, group.city, group.orders[0].id]), [['return', 'ramallah', c.id]],
    'return next stop is the sender, without another recipient or a completed parcel');
  const senderView = await call(`/orders/${c.id}`, { token: sender.token });
  assert.equal((await call(`/orders/${c.id}`, { token: driver.token })).returnCode, null);
  const wrongReturn = senderView.returnCode === '9999' ? '9998' : '9999';
  assert.equal((await advance(returning, { code: wrongReturn }, 400)).error, 'wrong_code');
  const returned = await advance(returning, { code: senderView.returnCode });
  assert.equal(returned.status, 'returned');
  assert.equal(returned.cashCollection, undefined, 'sender return proof creates no recipient cash fact');
  assert.deepEqual(await carried(), []);
  offline = true;
  await assert.rejects(call('/driver/earnings', { token: driver.token }), /Test request failed/);
  offline = false;
  const earnings = (await call('/driver/earnings', { token: driver.token })).all;
  assert.equal(Number(earnings.jobs), 3);
  assert.equal(Number(earnings.gross), 70);
  assert.equal(Math.round(Number(earnings.commission) * 100), Math.round((recovered.commission + completedB.commission + returned.commission) * 100));
  assert.equal(Math.round(earnings.net * 100), 7000 - Math.round(earnings.commission * 100));
  console.log(`${persistence.backend} multi-recipient: current run sheet, proof/cash association, lost ACK/reconnect, reattempt, sender return and earnings passed`);
} finally {
  await shutdown(); globalThis.fetch = actualFetch; rmSync(directory, { recursive: true, force: true });
}
