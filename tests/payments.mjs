import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
import { Payments, FakePaymentsProvider } from '../server/domain/payments.ts';
import { NON_LEGACY_TABLES } from '../server/migrate.ts';
const f = await fixture('payments');
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const provider = new FakePaymentsProvider('timeout', 'captured');
const refundTransactions = [];
provider.refund = async function(id, amount) { refundTransactions.push(f.db.inTransaction); return { outcome: this.outcome, providerRef: `fake:${id}` }; };
const pay = new Payments(f.db, fail, provider, (_event, signature) => signature === 'test-signature');
try {
  assert.equal((await f.db.one('SELECT version FROM schema_migrations WHERE version=17')).version, 17);
  for (const table of ['payment_intents','payment_attempts','payment_events','refunds','merchant_cod','merchant_cod_events']) assert.ok(NON_LEGACY_TABLES.has(table));
  const order = await f.book(); const customer = {...f.customer.user, status:'active'}, admin = {...f.admin.user, status:'active'}, driver = {...f.d1.user,status:'active'};
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", driver.id, order.id);
  const original = await f.db.one('SELECT price_minor,commission_minor FROM orders WHERE id=?', order.id);
  assert.ok(original.price_minor > 1, 'fixture price must exercise partial refunds');
  const ledger = await f.db.one('SELECT count(*) AS n FROM ledger_journals');
  const intent = await pay.createIntent(customer, order.id, {amountMinor:original.price_minor});
  assert.equal(intent.status, 'pending'); assert.equal((await pay.createIntent(customer, order.id, {amountMinor:original.price_minor})).id, intent.id); assert.equal(provider.calls, 1);
  const event = {provider:'fake',providerEventId:randomUUID(),intentId:intent.id,eventType:'captured'};
  await assert.rejects(pay.applyProviderEvent(event, 'forged'), e => e.status === 401);
  assert.equal((await pay.query(customer, order.id)).status, 'captured'); assert.equal(provider.calls, 1);
  assert.equal((await pay.applyProviderEvent(event, 'test-signature')).applied, false);
  const dup = await pay.applyProviderEvent(event, 'test-signature'); assert.equal(dup.applied, false);
  assert.equal((await f.db.one('SELECT count(*) AS n FROM payment_events')).n, 1);
  assert.equal((await pay.applyProviderEvent({...event,providerEventId:randomUUID(),eventType:'pending'}, 'test-signature')).applied, false);
  const hook = async (sig, evt) => { const res = await fetch(`${f.a.base}/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-payment-signature': sig }, body: JSON.stringify(evt) }); return { status: res.status, data: await res.json() }; };
  assert.equal((await hook('forged', { ...event, providerEventId: randomUUID() })).status, 401);
  const hookOk = await hook('test-signature', { ...event, providerEventId: randomUUID(), eventType: 'failed' });
  assert.equal(hookOk.status, 401, 'API process registers no test verifier: every webhook signature is rejected there');
  assert.equal((await pay.getIntent(customer, order.id)).status, 'captured');
  await assert.rejects(pay.refund(admin, intent.id, original.price_minor + 1, 'test reason'), e => e.status === 400 && e.message === 'refund_exceeds_capture');
  provider.outcome = 'captured'; const partial = Math.max(1, Math.floor(original.price_minor / 2));
  assert.equal((await pay.refund(admin, intent.id, partial, 'test reason')).status, 'completed');
  assert.deepEqual(refundTransactions, [false], 'provider refund must run outside a transaction');
  assert.equal((await pay.getIntent(customer, order.id)).status, partial === original.price_minor ? 'refunded' : 'partially_refunded');
  if (partial < original.price_minor) await assert.rejects(pay.refund(admin, intent.id, original.price_minor - partial + 1, 'test reason'), e => e.status === 400 && e.message === 'refund_exceeds_capture');
  // Review regressions: stale replay conflicts, refund requestId replays without a second provider refund, pending reconciles on read.
  await f.db.run('UPDATE orders SET price=?,price_minor=? WHERE id=?', (original.price_minor + 100) / 100, original.price_minor + 100, order.id);
  await assert.rejects(pay.createIntent(customer, order.id, {amountMinor:original.price_minor + 100}), e => e.status === 409 && e.message === 'idempotency_conflict');
  await f.db.run('UPDATE orders SET price=?,price_minor=? WHERE id=?', original.price_minor / 100, original.price_minor, order.id);
  if (partial < original.price_minor) { const rid = randomUUID(); const r1 = await pay.refund(admin, intent.id, 1, 'test reason', rid); const rows = await f.db.one('SELECT count(*) AS n FROM refunds'); const r2 = await pay.refund(admin, intent.id, 1, 'test reason', rid); assert.equal(r2.id, r1.id); assert.deepEqual(await f.db.one('SELECT count(*) AS n FROM refunds'), rows); }
  const order2 = await f.book(); await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", driver.id, order2.id);
  const price2 = (await f.db.one('SELECT price_minor FROM orders WHERE id=?', order2.id)).price_minor; provider.outcome = 'timeout';
  assert.equal((await pay.createIntent(customer, order2.id, {amountMinor:price2})).status, 'pending');
  assert.equal((await pay.getIntent(customer, order2.id)).status, 'captured');
  const intent2 = await pay.getIntent(customer, order2.id);
  provider.refund = async () => { throw new Error('provider unavailable'); };
  assert.equal((await pay.refund(admin, intent2.id, price2, 'test reason')).status, 'rejected');
  let release; const waiting = new Promise(resolve => { release = resolve; });
  let called; const started = new Promise(resolve => { called = resolve; });
  let refundCalls = 0;
  provider.refund = async () => { refundCalls++; assert.equal(f.db.inTransaction, false); called(); await waiting; return {outcome:'captured', providerRef:'fake'}; };
  const rid2 = randomUUID(); const pending = pay.refund(admin, intent2.id, price2, 'test reason', rid2);
  await started;
  assert.equal((await pay.refund(admin, intent2.id, price2, 'test reason', rid2)).status, 'requested');
  await assert.rejects(pay.refund(admin, intent2.id, 1, 'test reason'), e => e.status === 400 && e.message === 'refund_exceeds_capture');
  release(); assert.equal((await pending).status, 'completed'); assert.equal(refundCalls, 1);
  await assert.rejects(f.db.scope(async () => { await f.db.exec('BEGIN'); return pay.refund(admin, intent2.id, 1, 'test reason'); }), e => e.status === 409 && e.message === 'refund_in_transaction');
  assert.equal(refundCalls, 1, 'in-transaction refund must not reach the provider');
  // Concurrent same-requestId refunds racing inside reservation: one provider call, one row.
  const order3 = await f.book(); await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", driver.id, order3.id);
  const price3 = (await f.db.one('SELECT price_minor FROM orders WHERE id=?', order3.id)).price_minor; provider.outcome = 'timeout';
  assert.equal((await pay.createIntent(customer, order3.id, {amountMinor:price3})).status, 'pending');
  const intent3 = await pay.getIntent(customer, order3.id); assert.equal(intent3.status, 'captured');
  let release3; const waiting3 = new Promise(resolve => { release3 = resolve; });
  let calls3 = 0; provider.refund = async () => { calls3++; assert.equal(f.db.inTransaction, false); await waiting3; return { outcome: 'captured', providerRef: 'fake' }; };
  const rid3 = randomUUID(); const both = Promise.all([pay.refund(admin, intent3.id, price3, 'test reason', rid3), pay.refund(admin, intent3.id, price3, 'test reason', rid3)]);
  release3(); const [ra, rb] = await both; assert.equal(ra.id, rb.id); assert.equal(calls3, 1);
  assert.equal((await f.db.one('SELECT status FROM refunds WHERE id=?::uuid', ra.id)).status, 'completed');
  // Real HTTP envelope: provider routes own short transactions, so the route reaches the provider
  // instead of failing refund_in_transaction inside the request-long atomic wrapper.
  const h = await fixture('paymentshttp', { WIND_PAYMENTS_TEST_ONLY: '1' });
  try {
    const hOrder = await h.book();
    await h.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", h.d1.user.id, hOrder.id);
    const hPrice = (await h.db.one('SELECT price_minor FROM orders WHERE id=?', hOrder.id)).price_minor;
    assert.equal((await h.call(`/orders/${hOrder.id}/payments`, { token: h.customer.token, body: { amountMinor: hPrice } })).status, 'pending');
    assert.equal((await h.call(`/orders/${hOrder.id}/payments`, { token: h.customer.token })).status, 'captured');
    assert.equal((await h.call(`/orders/${hOrder.id}/payments/refund`, { token: h.admin.token, body: { amountMinor: hPrice, reason: 'test reason', requestId: randomUUID() } })).status, 'rejected');
  } finally { await h.close(); }
  await pay.createCod(customer, order.id, {beneficiary:'merchant',goodsMinor:1000,remittanceDueAt:Date.now()+10000});
  assert.equal((await pay.collectCod(driver,order.id,{amountMinor:400})).status,'partial');
  await assert.rejects(pay.collectCod(driver,order.id,{amountMinor:601}), e => e.status === 400);
  assert.equal((await pay.collectCod(driver,order.id,{amountMinor:600})).status,'collected');
  assert.equal((await pay.remitCod(admin,order.id,{payoutRef:'synthetic'})).status,'remitted');
  assert.deepEqual(await f.db.one('SELECT price_minor,commission_minor FROM orders WHERE id=?', order.id), original);
  assert.deepEqual(await f.db.one('SELECT count(*) AS n FROM ledger_journals'), ledger);
  await assert.rejects(f.db.run('DELETE FROM payment_events WHERE id=?::uuid', dup.event.id));
  console.log('WP14 payments: migration, replay, signatures, inbox ordering, timeout reconciliation, refunds and COD passed');
} finally { await f.close(); }

