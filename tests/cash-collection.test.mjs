import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
import { readOrder } from '../src/wire-contracts.ts';

if (process.argv.includes('--postgres')) {
  const { freshPostgres, selectRuntime } = await import('./pg-support.mjs');
  const fixture = await freshPostgres('door_cash');
  await fixture.database.close();
  selectRuntime(fixture.schema);
}
const dir = mkdtempSync(join(tmpdir(), 'wind-door-cash-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
const { server, persistence, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
try {
  const admin = await call('/auth/register', { body: { phone: '0599340001', name: 'Cash admin', password: 'secret123' } });
  await promote('0599340001');
  const customer = await call('/auth/register', { body: { phone: '0599340002', name: 'Customer', password: 'secret123' } });
  const driver = await call('/auth/register', { body: { phone: '0599340003', name: 'Driver', password: 'secret123', role: 'driver', vehicle: 'van' } });
  const other = await call('/auth/register', { body: { phone: '0599340004', name: 'Other', password: 'secret123', role: 'driver', vehicle: 'van' } });
  for (const account of [driver, other]) await call(`/admin/users/${account.user.id}/approve`, { token: admin.token, body: {} });
  await call('/admin/promos', { token: admin.token, body: { code: 'DOORCASH', amount: 2, maxUses: 10, days: 1 } });
  const advance = (order, extra = {}, expect = 200, token = driver.token) => call(`/orders/${order.id}/advance`,
    { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra }, expect });
  async function transit(discounted = false, courier = driver) {
    const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
      pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599340002', detail: 'Test parcel' };
    const price = await call('/price', { token: customer.token, body: input });
    let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: price.price, ...(discounted && { promoCode: 'DOORCASH' }) } });
    order = await call(`/jobs/${order.id}/accept`, { token: courier.token, body: {} });
    assert.equal((await advance(order, { cashCollection: { collectedMinor: 2000 } }, 400, courier.token)).error, 'invalid_cash_collection');
    order = await advance(await advance(order, {}, 200, courier.token), {}, 200, courier.token);
    assert.equal(order.cashCollectionAllowed, true);
    const { handoverCode } = await call(`/orders/${order.id}`, { token: customer.token });
    return { order, handoverCode };
  }
  const cases = [
    [2000, null], [1000, 'PARTIAL_PAYMENT'], [0, 'CUSTOMER_DID_NOT_PAY'], [2100, 'INCORRECT_CASH'],
    [1000, 'APPROVED_DISCOUNT'], [0, 'RETURNED_ITEMS'], [2100, 'OTHER_ADMIN_REVIEW'],
  ];
  for (const [collectedMinor, varianceReason] of cases) {
    const { order, handoverCode } = await transit();
    const expectedMinor = Math.round((order.price - order.discount) * 100);
    assert.equal(expectedMinor, 2000);
    const cashCollection = { collectedMinor, varianceReason };
    const body = { expectedStatus: order.status, requestId: randomUUID(), code: handoverCode, cashCollection };
    if (collectedMinor === 2000) {
      for (const invalid of [null, {}, { collectedMinor: '0' }, { collectedMinor: -1 }, { collectedMinor: 0.1 },
        { collectedMinor: Number.MAX_SAFE_INTEGER + 1 }, { collectedMinor: 0, varianceReason: null },
        { collectedMinor: 0, varianceReason: 'PARTIAL_PAYMENT' }, { collectedMinor: 2000, varianceReason: 'INCORRECT_CASH' },
        { collectedMinor: 2100, varianceReason: 'APPROVED_DISCOUNT' }, { collectedMinor: 2000, expectedMinor: 2000 }])
        assert.equal((await advance(order, { code: handoverCode, cashCollection: invalid }, 400)).error, 'invalid_cash_collection');
      await advance(order, { code: handoverCode, cashCollection }, 403, customer.token);
      await advance(order, { code: handoverCode, cashCollection }, 404, other.token);
      assert.equal((await advance(order, { code: handoverCode === '0000' ? '0001' : '0000', cashCollection }, 400)).error, 'wrong_code');
      assert.equal(Number((await persistence.one('SELECT count(*) AS n FROM order_cash_collections WHERE order_id=?', order.id)).n), 0);
      assert.equal((await call(`/orders/${order.id}`, { token: driver.token })).status, 'in_transit');
    }
    const before = await call('/driver/cash', { token: driver.token });
    const completed = await call(`/orders/${order.id}/advance`, { token: driver.token, body });
    const fact = completed.cashCollection;
    assert.deepEqual(fact, { expectedMinor, collectedMinor, varianceReason, actorId: driver.user.id,
      requestId: body.requestId, collectedAt: completed.completedAt });
    assert.deepEqual(readOrder(completed).cashCollection, fact);
    const replay = await call(`/orders/${order.id}/advance`, { token: driver.token, body });
    assert.deepEqual(replay.cashCollection, fact, 'lost acknowledgement replays the immutable fact');
    assert.equal((await call(`/orders/${order.id}/advance`, { token: driver.token,
      body: { ...body, cashCollection: { collectedMinor: collectedMinor + 1, varianceReason: 'OTHER_ADMIN_REVIEW' } }, expect: 409 })).error, 'idempotency_conflict');
    assert.deepEqual((await call(`/orders/${order.id}`, { token: customer.token })).cashCollection, fact);
    assert.deepEqual((await call(`/orders/${order.id}`, { token: admin.token })).cashCollection, fact);
    const after = await call('/driver/cash', { token: driver.token });
    assert.equal(after.owedCents - before.owedCents, Math.round(completed.commission * 100), 'variance never forgives commission');
    assert.equal(after.adjustmentsCents, before.adjustmentsCents);
    assert.equal(Number((await persistence.one('SELECT count(*) AS n FROM order_cash_collections WHERE order_id=?', order.id)).n), 1);
    assert.equal(Number((await persistence.one("SELECT count(*) AS n FROM security_events WHERE order_id=? AND action='CASH_VARIANCE_REPORTED'", order.id)).n), collectedMinor === expectedMinor ? 0 : 1);
    await assert.rejects(persistence.run('UPDATE order_cash_collections SET collected_minor=0 WHERE order_id=?', order.id));
    await assert.rejects(persistence.run('DELETE FROM order_cash_collections WHERE order_id=?', order.id));
  }
  const { order, handoverCode } = await transit();
  const legacy = await advance(order, { code: handoverCode });
  assert.equal(legacy.status, 'completed');
  assert.equal(legacy.cashCollection, undefined, 'old clients retain unknown collection history');
  await assert.rejects(persistence.run(`INSERT INTO order_cash_collections
    (order_id,expected_minor,collected_minor,variance_reason,actor_id,request_id,collected_at) VALUES(?,2000,1000,NULL,?,?,?)`,
  order.id, driver.user.id, randomUUID(), Date.now()), 'SQL also refuses missing variance reasons');
  await assert.rejects(persistence.run(`INSERT INTO order_cash_collections
    (order_id,expected_minor,collected_minor,variance_reason,actor_id,request_id,collected_at) VALUES(?,2000,2000,NULL,?,?,?)`,
  order.id, other.user.id, randomUUID(), Date.now()), 'SQL also fences the assigned actor');
  const proofless = await transit();
  await persistence.run('UPDATE orders SET handover_code=NULL WHERE id=?', proofless.order.id);
  const legacyActive = await call(`/orders/${proofless.order.id}`, { token: driver.token });
  assert.equal(legacyActive.cashCollectionAllowed, false);
  const legacyCompleted = await advance(legacyActive);
  assert.equal(legacyCompleted.status, 'completed', 'legacy proofless parcels remain completable without a collection claim');
  assert.equal(legacyCompleted.cashCollection, undefined);
  const discounted = await transit(true);
  const paid = await advance(discounted.order, { code: discounted.handoverCode, cashCollection: { collectedMinor: 1800 } });
  assert.equal(paid.discount, 2);
  assert.equal(paid.cashCollection.expectedMinor, 1800, 'the expected collection subtracts the recorded fare discount');
  if (persistence.backend === 'postgres') {
    const refused = await transit(false, other);
    await persistence.run("INSERT INTO ledger_accounts(code,kind,owner_id,created_at) VALUES(?,'platform_revenue',NULL,?)",
      `driver:${other.user.id}:receivable`, Date.now());
    const before = await persistence.one('SELECT status,commission,completed_at FROM orders WHERE id=?', refused.order.id);
    const notifications = async () => Number((await persistence.one("SELECT count(*) AS n FROM domain_events WHERE order_id=? AND type='notification.requested'", refused.order.id)).n);
    const notified = await notifications();
    const body = { expectedStatus: 'in_transit', requestId: randomUUID(), code: refused.handoverCode,
      cashCollection: { collectedMinor: 0, varianceReason: 'CUSTOMER_DID_NOT_PAY' } };
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await call(`/orders/${refused.order.id}/advance`, { token: other.token, body, expect: 409 })).error, 'account_conflict');
      assert.deepEqual(await persistence.one('SELECT status,commission,completed_at FROM orders WHERE id=?', refused.order.id), before);
      assert.equal(Number((await persistence.one('SELECT count(*) AS n FROM order_cash_collections WHERE order_id=?', refused.order.id)).n), 0);
      assert.equal(Number((await persistence.one("SELECT count(*) AS n FROM security_events WHERE order_id=? AND action='CASH_VARIANCE_REPORTED'", refused.order.id)).n), 0);
      assert.equal(Number((await persistence.one('SELECT count(*) AS n FROM ledger_journals WHERE order_id=?', refused.order.id)).n), 0);
      assert.equal(await notifications(), notified, 'a rejected completion sends no variance/completion notifications');
    }
    await assert.rejects(persistence.run('TRUNCATE order_cash_collections'));
  }
  console.log(`${persistence.backend} door cash: proof, roles, strict money/reasons, immutable replay, unchanged debt and old clients passed`);
} finally {
  await new Promise(resolve => server.close(resolve));
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
