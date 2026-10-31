// Disposable T02 characterization: assertions describe current defects, not desired release behavior.
import assert from 'node:assert/strict';
import { fixture } from '../../tests/eligibility-support.mjs';
import { Payments, FakePaymentsProvider } from '../../server/domain/payments.ts';
import { Ledger } from '../../server/domain/ledger.ts';

const f = await fixture('t02reproduce');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const provider = new FakePaymentsProvider('captured', 'captured');
const payments = new Payments(f.db, fail, provider);
const ledger = new Ledger(f.db, fail);
const admin = { ...f.admin.user, status: 'active' };
const driver = { ...f.d1.user, status: 'active' };
const customer = { ...f.customer.user, status: 'active' };
try {
  const searching = await f.book({ declaredScope: { itemCount: 1, lengthMm: 100, widthMm: 100, heightMm: 100,
    massGrams: 100, declaredValueMinor: 12345, sourceRef: 'synthetic:t02:private' } });
  const outsider = await f.call(`/orders/${searching.id}/scope`, { token: f.d2.token });
  assert.equal(outsider.declaredScope.declaredValueMinor, 12345);
  assert.equal(outsider.declaredScope.sourceRef, 'synthetic:t02:private');
  console.log('REPRODUCED T27: unreviewed searching driver reads declared value and source reference.');
  const order = await f.book();
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", driver.id, order.id);
  const price = (await f.db.one('SELECT price_minor FROM orders WHERE id=?', order.id)).price_minor;
  let intent = await payments.createIntent(customer, order.id, { amountMinor: price });
  if (intent.status !== 'captured') intent = await payments.getIntent(customer, order.id);
  assert.equal(intent.status, 'captured');
  let calls = 0;
  provider.refund = async () => { calls++; return { outcome: 'timeout', providerRef: 'synthetic-timeout' }; };
  const unknown = await payments.refund(admin, intent.id, price, 'Synthetic T02 characterization');
  assert.equal(unknown.status, 'rejected');
  provider.refund = async () => { calls++; return { outcome: 'captured', providerRef: 'synthetic-second' }; };
  assert.equal((await payments.refund(admin, intent.id, price, 'Synthetic second request')).status, 'completed');
  assert.equal(calls, 2);
  console.log('REPRODUCED T28: timeout releases reservation; full second refund reaches provider.');

  const cardOrder = await f.book();
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at WHERE id=?", driver.id, cardOrder.id);
  const cardPrice = (await f.db.one('SELECT price_minor FROM orders WHERE id=?', cardOrder.id)).price_minor;
  let card = await payments.createIntent(customer, cardOrder.id, { amountMinor: cardPrice });
  if (card.status !== 'captured') card = await payments.getIntent(customer, cardOrder.id);
  assert.equal(card.status, 'captured');
  const receipt = await ledger.createReceipt(driver, cardOrder.id);
  assert.equal(receipt.dueMinor, cardPrice);
  await ledger.collect(driver, cardOrder.id, { amountMinor: cardPrice });
  console.log('REPRODUCED T31: captured card order also accepts full cash collection.');

  await payments.createCod(customer, order.id, { beneficiary: 'Synthetic merchant', goodsMinor: 1000, remittanceDueAt: Date.now() + 10000 });
  assert.equal((await payments.collectCod(driver, order.id, { amountMinor: 400 })).status, 'partial');
  await assert.rejects(payments.remitCod(admin, order.id, { payoutRef: 'synthetic' }), e => e.status === 409 && e.message === 'cod_unavailable');
  console.log('REPRODUCED T32: partial COD cannot be remitted.');

  assert.equal((await f.db.one('SELECT count(*) AS n FROM ledger_journals')).n, 0);
  console.log('REPRODUCED T29/T30: order/payment/cash lifecycle generated no journals.');
} finally { await f.close(); }
