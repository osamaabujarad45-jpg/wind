import assert from 'node:assert/strict';
import { Ledger } from '../server/domain/ledger.ts';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
import { Payments, FakePaymentsProvider } from '../server/domain/payments.ts';
import { DurableWorker } from '../server/worker.ts';
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
  const unresolved = await pay.refund(admin, intent2.id, price2, 'test reason');
  assert.equal(unresolved.status, 'requested', 'a thrown provider call leaves the refund reserved, never terminal');
  await assert.rejects(pay.refund(admin, intent2.id, price2, 'test reason'), e => e.status === 400 && e.message === 'refund_exceeds_capture');
  provider.refund = async () => ({ outcome: 'failed', providerRef: 'fake' });
  assert.equal(await pay.reconcileRefunds(10, 0), 1, 'a definitive provider failure releases the reservation');
  assert.equal((await f.db.one('SELECT status FROM refunds WHERE id=?::uuid', unresolved.id)).status, 'rejected');
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
  // T28 unknown refund: a pending/timeout outcome keeps the amount reserved and blocked, and every
  // provider attempt carries the stored business ref so a retry cannot double-spend.
  const order4 = await f.book(); await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", driver.id, order4.id);
  const price4 = (await f.db.one('SELECT price_minor FROM orders WHERE id=?', order4.id)).price_minor; provider.outcome = 'pending';
  assert.equal((await pay.createIntent(customer, order4.id, { amountMinor: price4 })).status, 'pending');
  const intent4 = await pay.getIntent(customer, order4.id); assert.equal(intent4.status, 'captured');
  const keys = []; provider.refund = async (id, _amount, key) => { keys.push(key); return { outcome: 'pending', providerRef: `fake:${id}` }; };
  const unknown = await pay.refund(admin, intent4.id, price4, 'synthetic unknown refund');
  assert.equal(unknown.status, 'requested', 'an uncertain provider outcome stays reserved, never rejected');
  const stored = await f.db.one('SELECT business_ref FROM refunds WHERE id=?::uuid', unknown.id);
  assert.equal(keys[0], stored.business_ref, 'provider refund carries the stored business ref as its idempotency key');
  await assert.rejects(pay.refund(admin, intent4.id, price4, 'synthetic retry refund'), e => e.status === 400 && e.message === 'refund_exceeds_capture');
  assert.equal(keys.length, 1, 'the blocked retry never reaches the provider');
  // Bounded sweep: CAS-claims only stale reserved rows, retries with the same key, never regresses a terminal state.
  const worker = new DurableWorker(f.db, { payments: pay, refundStaleMs: 0 });
  assert.equal(await worker.processRefundReconciliation(), 0, 'an unresolved sweep keeps the row reserved');
  assert.equal((await f.db.one('SELECT status FROM refunds WHERE id=?::uuid', unknown.id)).status, 'requested');
  assert.equal(keys[1], keys[0], 'the sweep retry reuses the same idempotency key');
  provider.refund = async (id, _amount, key) => { keys.push(key); return { outcome: 'captured', providerRef: `fake:${id}` }; };
  assert.equal(await worker.processRefundReconciliation(), 1);
  assert.equal(keys[2], keys[0], 'the definitive retry reuses the same idempotency key');
  assert.equal((await f.db.one('SELECT status FROM refunds WHERE id=?::uuid', unknown.id)).status, 'completed');
  assert.equal((await pay.getIntent(customer, order4.id)).status, 'refunded');
  provider.refund = async () => { throw new Error('a terminal refund must never be re-sent'); };
  assert.equal(await worker.processRefundReconciliation(), 0);
  const late = await pay.applyProviderEvent({ provider: 'fake', providerEventId: randomUUID(), intentId: intent4.id, eventType: 'failed' }, 'test-signature');
  assert.equal(late.applied, false, 'a late provider event cannot regress a refunded intent');
  assert.equal((await pay.getIntent(customer, order4.id)).status, 'refunded');
  for (const n of [1, 2, 3]) await f.db.run("INSERT INTO refunds(id,intent_id,business_ref,amount_minor,reason,status,actor_id,created_at) VALUES(?::uuid,?::uuid,?,1,'synthetic sweep bound','requested',?,?)", randomUUID(), intent4.id, `refund:sweep-${n}`, admin.id, Date.now() - 1);
  let boundedCalls = 0; provider.refund = async () => { boundedCalls++; return { outcome: 'failed', providerRef: 'fake' }; };
  const limited = new DurableWorker(f.db, { payments: pay, refundStaleMs: 0, refundSweepLimit: 2 });
  assert.equal(await limited.processRefundReconciliation(), 2); assert.equal(boundedCalls, 2, 'one sweep settles at most refundSweepLimit rows');
  assert.equal(await limited.processRefundReconciliation(), 1); assert.equal(boundedCalls, 3);
  assert.equal(await limited.processRefundReconciliation(), 0);
  // Real HTTP envelope: provider routes own short transactions, so the route reaches the provider
  // instead of failing refund_in_transaction inside the request-long atomic wrapper.
  const h = await fixture('paymentshttp', { WIND_PAYMENTS_TEST_ONLY: '1' });
  try {
    const hOrder = await h.book();
    await h.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", h.d1.user.id, hOrder.id);
    const hPrice = (await h.db.one('SELECT price_minor FROM orders WHERE id=?', hOrder.id)).price_minor;
    assert.equal((await h.call(`/orders/${hOrder.id}/payments`, { token: h.customer.token, body: { amountMinor: hPrice } })).status, 'pending');
    assert.equal((await h.call(`/orders/${hOrder.id}/payments`, { token: h.customer.token })).status, 'captured');
    assert.equal((await h.call(`/orders/${hOrder.id}/payments/refund`, { token: h.admin.token, body: { amountMinor: hPrice, reason: 'test reason', requestId: randomUUID() } })).status, 'requested');
  } finally { await h.close(); }
  await pay.createCod(customer, order.id, {beneficiary:'merchant',goodsMinor:1000,remittanceDueAt:Date.now()+10000});
  assert.equal((await pay.collectCod(driver,order.id,{amountMinor:400})).status,'partial');
  await assert.rejects(pay.collectCod(driver,order.id,{amountMinor:601}), e => e.status === 400);
  const finalCollect = randomUUID(), finalRemit = randomUUID();
  assert.equal((await pay.collectCod(driver,order.id,{amountMinor:600,requestId:finalCollect})).status,'collected');
  assert.equal((await pay.collectCod(driver,order.id,{amountMinor:600,requestId:finalCollect})).status,'collected', 'a lost final collection response replays once');
  await assert.rejects(pay.collectCod(driver,order.id,{amountMinor:500,requestId:finalCollect}), e => e.status === 409 && e.message === 'idempotency_conflict');
  assert.equal((await pay.remitCod(admin,order.id,{payoutRef:'synthetic',requestId:finalRemit})).status,'remitted');
  assert.equal((await pay.remitCod(admin,order.id,{payoutRef:'synthetic',requestId:finalRemit})).status,'remitted', 'a lost final remittance response replays once');
  assert.deepEqual(await f.db.one('SELECT price_minor,commission_minor FROM orders WHERE id=?', order.id), original);
  assert.deepEqual(await f.db.one('SELECT count(*) AS n FROM ledger_journals'), ledger);
  await assert.rejects(f.db.run('DELETE FROM payment_events WHERE id=?::uuid', dup.event.id));
  // T31: one settlement authority per order — a standing card capture and a cash collection exclude each
  // other, a full refund releases the order back to cash, and the loser of a race is refused.
  const cashLedger = new Ledger(f.db, fail);
  const asDriver = { id: f.d1.user.id, role: 'driver', status: 'active' };
  const settleByCard = async () => {
    const o = await f.book();
    await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=?,commission=1 WHERE id=?", f.d1.user.id, Date.now(), o.id);
    const priceMinor = Number((await f.db.one('SELECT price_minor FROM orders WHERE id=?', o.id)).price_minor);
    const intent = await pay.createIntent(customer, o.id, { amountMinor: priceMinor });
    await pay.applyProviderEvent({ provider: 'fake', providerEventId: randomUUID(), intentId: intent.id, eventType: 'captured' }, 'test-signature');
    return { id: o.id, priceMinor };
  };
  const cardOnly = await settleByCard();
  const r1 = await cashLedger.createReceipt(asDriver, cardOnly.id);
  await assert.rejects(cashLedger.collect(asDriver, cardOnly.id, { amountMinor: r1.dueMinor }), e => e.status === 409 && e.message === 'settlement_conflict');
  const cashFirst = await f.book();
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=?,commission=1 WHERE id=?", f.d1.user.id, Date.now(), cashFirst.id);
  const cashPrice = Number((await f.db.one('SELECT price_minor FROM orders WHERE id=?', cashFirst.id)).price_minor);
  const receipt = await cashLedger.createReceipt(asDriver, cashFirst.id);
  await cashLedger.collect(asDriver, cashFirst.id, { amountMinor: receipt.dueMinor });
  const cashIntent = await pay.createIntent(customer, cashFirst.id, { amountMinor: cashPrice });
  await assert.rejects(pay.applyProviderEvent({ provider: 'fake', providerEventId: randomUUID(), intentId: cashIntent.id, eventType: 'captured' }, 'test-signature'), e => e.status === 409 && e.message === 'settlement_conflict');
  // A full card refund releases the order back to cash.
  const refunded = await settleByCard();
  const refundIntent = (await f.db.one('SELECT id FROM payment_intents WHERE order_id=?', refunded.id));
  provider.refund = async (id, _amount, key) => ({ outcome: 'captured', providerRef: `fake:${id}` }); // the release succeeds
  await pay.refund(admin, String(refundIntent.id), refunded.priceMinor, 'Full refund releases the order');
  const refundStatus = (await f.db.one('SELECT status FROM payment_intents WHERE order_id=?', refunded.id)).status;
  assert.equal(refundStatus, 'refunded', `the card release must complete before cash: ${refundStatus}`);
  const r2 = await cashLedger.createReceipt(asDriver, refunded.id);
  assert.equal((await cashLedger.collect(asDriver, refunded.id, { amountMinor: r2.dueMinor })).status, 'collected');

  // T32: partial goods collection remits what was collected, the outstanding stays explicit, repeated
  // commands never double-move, and finance's exception authority closes a disputed COD terminally.
  const codOrder = await f.book();
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=?,commission=1 WHERE id=?", f.d1.user.id, Date.now(), codOrder.id);
  const goodsMinor = 900;
  const cod = await pay.createCod(admin, codOrder.id, { beneficiary: 'Synthetic merchant', goodsMinor, remittanceDueAt: Date.now() + 86_400_000 });
  const collect = (amountMinor, requestId) => pay.collectCod(driver, codOrder.id, { amountMinor, ...(requestId && { requestId }) });
  await collect(300);
  assert.equal((await collect(200, randomUUID())).status, 'partial'); // 500 of 900 collected
  const remit = (requestId) => pay.remitCod(admin, codOrder.id, { payoutRef: 'PO-32', ...(requestId && { requestId }) });
  const remitCommand = '0f0f0f0f-0000-4000-8000-000000000001';
  const partialRemit = await remit(remitCommand);
  assert.equal(partialRemit.status, 'partial', 'a partial collection remits as partial');
  assert.equal(Number(partialRemit.remitted_minor), 500, 'everything collected moved once');
  await assert.rejects(remit(randomUUID()), e => e.status === 409 && e.message === 'cod_unavailable', 'nothing is left to remit');
  const replayedRemit = await remit(remitCommand);
  assert.equal(Number(replayedRemit.remitted_minor), 500, 'a replayed remit command returns the same row without moving again');
  await collect(400, randomUUID()); // the remaining 400 are collected in the field
  const final = await remit(randomUUID());
  assert.equal(final.status, 'remitted');
  assert.equal(Number(final.remitted_minor), goodsMinor, 'collected and remitted totals reconcile with the goods');
  await assert.rejects(pay.resolveCod(admin, codOrder.id, { decision: 'returned', reason: 'Already remitted in full' }), e => e.status === 409 && e.message === 'cod_unavailable');
  // The exception authority closes an unremittable COD with a recorded reason.
  const disputeOrder = await f.book();
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=?,commission=1 WHERE id=?", f.d1.user.id, Date.now(), disputeOrder.id);
  await pay.createCod(admin, disputeOrder.id, { beneficiary: 'Synthetic merchant', goodsMinor: 500, remittanceDueAt: Date.now() + 86_400_000 });
  await pay.collectCod(driver, disputeOrder.id, { amountMinor: 200 }); // collected, then disputed by the merchant
  await assert.rejects(pay.resolveCod(admin, disputeOrder.id, { decision: 'returned', reason: 'nope' }), e => e.status === 400);
  await assert.rejects(pay.resolveCod(admin, disputeOrder.id, { decision: 'returned', reason: 'Goods returned but cash still outstanding' }), e => e.status === 409 && e.message === 'cod_outstanding');
  assert.equal(Number((await pay.remitCod(admin, disputeOrder.id, { payoutRef: 'PO-dispute' })).remitted_minor), 200);
  const closed = await pay.resolveCod(admin, disputeOrder.id, { decision: 'returned', reason: 'Merchant took the goods back at the office' });
  assert.equal(closed.status, 'returned');
  const resolutionAudit = await f.db.one("SELECT detail FROM security_events WHERE order_id=? AND action='COD_RETURNED'", disputeOrder.id);
  assert.equal(JSON.parse(resolutionAudit.detail).reason, 'Merchant took the goods back at the office', 'the required finance reason survives the decision');
  await assert.rejects(pay.collectCod(driver, disputeOrder.id, { amountMinor: 100 }), e => e.status === 409 && e.message === 'cod_unavailable');

  console.log('WP14 payments: migration, replay, signatures, inbox ordering, timeout reconciliation, refunds and COD passed');
} finally { await f.close(); }
