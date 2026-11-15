// WP03: original legacy assertions; async PG setup/fixture hooks only.
import {freshPostgres,selectRuntime} from './pg-support.mjs';
const pg=await freshPostgres('cash');await pg.database.close();selectRuntime(pg.schema);
// Driver cash settlement (SPEC-cash-settlement.md): commission owed, confirmed handovers, adjustments.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings as standard, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
// The ledger maths below were written for a ₪49 parcel; the admin tariff is set to match (SPEC-parcel-standard.md).
const defaultSettings = { ...standard, parcelPrice: 49 };

const dir = mkdtempSync(join(tmpdir(), 'wind-cash-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599300001', name: 'Cashier', password: 'secret1' } });
  await promote('0599300001');
  // T23.1: forgiving debt needs a request approved by a different finance approver, so the suite needs a second admin.
  const approver = await call('/auth/register', { body: { phone: '0599300005', name: 'Approver', password: 'secret1' } });
  await promote('0599300005');
  const forgive = async amountMinor => {
    const request = await call('/admin/approvals', { token: admin.token, body: { subjectType: 'cash_adjustment',
      subjectId: String(driver.user.id), amountMinor, reason: 'Synthetic cash forgiveness request' } });
    const decided = await call(`/admin/approvals/${request.id}/decide`, { token: approver.token, body: { decision: 'approved', purpose: 'Synthetic second approval' } });
    return decided.id;
  };
  const customer = await call('/auth/register', { body: { phone: '0599300002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599300003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const other = await call('/auth/register', { body: { phone: '0599300004', name: 'Omar', password: 'secret1', role: 'driver', vehicle: 'car' } });
  for (const d of [driver, other]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 49 } });

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'A', dropoffNote: 'B', contact: '0599300002', detail: 'Box' };
  async function deliver() {
    let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
    order = await advance(driver.token, await advance(driver.token, order));
    const { handoverCode } = await call(`/orders/${order.id}`, { token: customer.token });
    return advance(driver.token, order, { code: handoverCode });
  }

  // ---- C1: balance = commission on finished jobs ----
  assert.deepEqual((await call('/driver/cash', { token: driver.token })), { owedCents: 0, pendingCents: 0, commissionCents: 0, discountsCents: 0, remittedCents: 0, adjustmentsCents: 0, capCents: 15000, exposureCents: 0, entries: [] });
  const a = await deliver(), b = await deliver();
  const commissionCents = Math.round(a.commission * 100) + Math.round(b.commission * 100);
  let cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, commissionCents);
  assert.equal(cash.owedCents, commissionCents);
  await call('/driver/cash', { token: customer.token, expect: 403 });
  await call('/driver/cash', { token: admin.token, expect: 403 });

  // ---- C2: admin records handovers and adjustments; driver confirms ----
  await call('/admin/cash', { token: driver.token, expect: 403 });
  await call('/admin/cash/remittance', { token: driver.token, body: { driverId: driver.user.id, amountCents: 100 }, expect: 403 });
  for (const amountCents of [0, -5, 1.5, commissionCents + 1, '100'])
    await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents }, expect: 400 });
  await call('/admin/cash/remittance', { token: admin.token, body: { driverId: customer.user.id, amountCents: 100 }, expect: 404 });
  const first = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: 500, note: 'Office handover' } });
  assert.match(first.reference, /^R-\d{6}$/);
  assert.equal(first.status, 'pending');
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.owedCents, commissionCents); // pending does not count yet
  assert.equal(cash.pendingCents, 500);
  await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: commissionCents - 499 }, expect: 400 }); // pending + new > owed
  await call(`/driver/cash/${first.id}/confirm`, { token: other.token, body: { decision: 'confirm' }, expect: 404 });
  await call(`/driver/cash/${first.id}/confirm`, { token: driver.token, body: { decision: 'maybe' }, expect: 400 });
  await call(`/driver/cash/${first.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  await call(`/driver/cash/${first.id}/confirm`, { token: driver.token, body: { decision: 'dispute' }, expect: 409 });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.owedCents, commissionCents - 500);
  assert.equal(cash.remittedCents, 500);

  // A retried handover replays the first entry; the same id for a different handover is refused.
  const retry = { driverId: driver.user.id, amountCents: 300, requestId: randomUUID() };
  const wrong = await call('/admin/cash/remittance', { token: admin.token, body: retry });
  assert.equal((await call('/admin/cash/remittance', { token: admin.token, body: retry })).id, wrong.id);
  await call('/admin/cash/remittance', { token: admin.token, body: { ...retry, amountCents: 301 }, expect: 409 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { ...retry, reason: 'Same id, other form' }, expect: 409 });
  await call('/admin/cash/remittance', { token: admin.token, body: { ...retry, requestId: 'not-a-uuid' }, expect: 400 });
  await call(`/driver/cash/${wrong.id}/confirm`, { token: driver.token, body: { decision: 'dispute' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.owedCents, commissionCents - 500); // disputed never counts
  assert.equal(cash.pendingCents, 0);

  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 200, reason: 'x' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 0, reason: 'Nothing at all' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1_000_001, reason: 'Too much money' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -200, reason: 'Customer paid by mistake to office' }, expect: 409 }); // no approval: refused, not forgiven
  const forgiveness = await forgive(200);
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -201, approvalId: forgiveness, reason: 'Customer paid by mistake to office' }, expect: 409 }); // approval amount is bound
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -200, approvalId: forgiveness, reason: 'Customer paid by mistake to office' } });
  // T24: the decision was spent exactly once — a second entry cannot reuse it, on any request identity.
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -200, approvalId: forgiveness, requestId: randomUUID(), reason: 'Customer paid by mistake to office' }, expect: 409 });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.adjustmentsCents, -200);
  assert.equal(cash.owedCents, commissionCents - 700);
  assert.deepEqual(cash.entries.map(e => [e.kind, e.status]), [['adjustment', 'confirmed'], ['remittance', 'disputed'], ['remittance', 'confirmed']]);

  const list = await call('/admin/cash', { token: admin.token });
  assert.deepEqual(list.map(r => r.driverId), [driver.user.id, other.user.id]); // highest debt first
  assert.equal(list[0].owedCents, commissionCents - 700);
  assert.ok(list[0].lastRemittanceAt > 0);
  assert.equal(list[1].owedCents, 0);

  // An older handover stays confirmable however many newer entries follow it.
  const handover = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1 } });
  for (let i = 0; i < 50; i++) await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1, reason: 'Fuel card top-up' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.entries.filter(e => e.status !== 'pending').length, 50); // the history stays one page
  assert.deepEqual(cash.entries.filter(e => e.status === 'pending').map(e => e.id), [handover.id]);
  await call(`/driver/cash/${handover.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -49, approvalId: await forgive(49), reason: 'Undo the fuel top-ups' } }); // owed as before

  // ---- Ship review: exact rounding, returned jobs, no payouts, no leaving with debt, append-only ----
  assert.equal(Math.round(a.commission * 100), 735); // ₪49 × 15%, asserted independently of the server formula
  let returned = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  returned = await call(`/jobs/${returned.id}/accept`, { token: driver.token, body: {} });
  returned = await advance(driver.token, await advance(driver.token, returned));
  await call(`/orders/${returned.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  await call(`/admin/orders/${returned.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient not home' } });
  const { returnCode } = await call(`/orders/${returned.id}`, { token: customer.token });
  await advance(driver.token, { ...returned, status: 'returning' }, { code: returnCode });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, 735 * 3);
  let supportReturn = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  supportReturn = await call(`/jobs/${supportReturn.id}/accept`, { token: driver.token, body: {} });
  supportReturn = await advance(driver.token, await advance(driver.token, supportReturn));
  await call(`/orders/${supportReturn.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient absent again' } });
  const confirmedReturn = await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Sender confirmed receipt by phone' } });
  assert.equal(confirmedReturn.commission, 7.35, 'support-confirmed returns record the same commission as code-confirmed returns');
  const { persistence: ledgerDb } = await import('../server/main.ts');
  assert.ok(await ledgerDb.one('SELECT 1 FROM ledger_journals WHERE business_ref = ?', `order:${supportReturn.id}:commission`), 'and post the same journal');
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, 735 * 4);
  assert.equal((await call('/driver/earnings', { token: driver.token })).all.jobs, 4);
  const open = cash.owedCents;
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -(open + 1), reason: 'Would become a payout' }, expect: 400 });
  await call('/me/delete', { token: driver.token, body: { password: 'secret1' }, expect: 409 });
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { role: 'customer' }, expect: 409 });
  const { persistence } = await import('../server/main.ts');
  await assert.rejects(persistence.run('DELETE FROM cash_entries'), /append-only/);
  await assert.rejects(persistence.run("UPDATE cash_entries SET amount_cents = 1 WHERE kind = 'adjustment'"), /append-only/);
  const settle = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: open } });
  await call(`/driver/cash/${settle.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  await call('/me/delete', { token: driver.token, body: { password: 'secret1' } }); // settled drivers may leave

  // ---- Cash cap: a driver who would owe Wind more than driverCashCap (₪) cannot take another job until a handover ----
  // Counts what is owed plus the commission on jobs in hand (Wolt, Careem and Cedar GO cap courier cash the same way).
  let otherCash = await call('/driver/cash', { token: other.token });
  assert.equal(otherCash.capCents, Math.round(standard.driverCashCap * 100), 'the default cap is reported');
  const startExposure = otherCash.exposureCents;
  await call('/admin/settings', { token: admin.token, body: { driverCashCap: (startExposure + 735 + 100) / 100 } }); // room for exactly one job
  await call('/admin/settings', { token: other.token, body: { driverCashCap: 5000 }, expect: 403 });
  await call('/admin/settings', { token: admin.token, body: { driverCashCap: 5001 }, expect: 400 });
  const newOrder = () => call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  let held = await call(`/jobs/${(await newOrder()).id}/accept`, { token: other.token, body: {} });
  otherCash = await call('/driver/cash', { token: other.token });
  assert.equal(otherCash.exposureCents, startExposure + 735, 'a job in hand counts before it is finished');
  const waiting = await newOrder();
  const refused = await call(`/jobs/${waiting.id}/accept`, { token: other.token, body: {}, expect: 409 });
  assert.equal(refused.error, 'cash_cap_exceeded');
  assert.equal((await call(`/orders/${waiting.id}`, { token: customer.token })).status, 'searching', 'a refused accept leaves the job for others');
  held = await advance(other.token, await advance(other.token, held));
  held = await advance(other.token, held, { code: (await call(`/orders/${held.id}`, { token: customer.token })).handoverCode });
  otherCash = await call('/driver/cash', { token: other.token });
  assert.equal(otherCash.exposureCents, startExposure + 735, 'finishing moves the commission from in hand to owed, not away');
  assert.equal((await call(`/jobs/${waiting.id}/accept`, { token: other.token, body: {}, expect: 409 })).error, 'cash_cap_exceeded');
  const capHandover = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: other.user.id, amountCents: otherCash.owedCents } });
  assert.equal((await call(`/jobs/${waiting.id}/accept`, { token: other.token, body: {}, expect: 409 })).error, 'cash_cap_exceeded'); // pending: only a confirmed handover counts
  await call(`/driver/cash/${capHandover.id}/confirm`, { token: other.token, body: { decision: 'confirm' } });
  assert.equal((await call(`/jobs/${waiting.id}/accept`, { token: other.token, body: {} })).status, 'assigned', 'after the handover the driver works again');

  // ---- WP-01: door cash and typed variance are evidence only; commission and the owed maths do not move ----
  await call('/admin/settings', { token: admin.token, body: { driverCashCap: 5000 } });
  const dueCents = 4900; // the ₪49 parcel, no discount
  const toTransit = async () => {
    const o = await call(`/jobs/${(await newOrder()).id}/accept`, { token: other.token, body: {} });
    return advance(other.token, await advance(other.token, o));
  };
  const finish = async (extra, expect) => {
    const o = await toTransit();
    const { handoverCode } = await call(`/orders/${o.id}`, { token: customer.token });
    const done = await call(`/orders/${o.id}/advance`, { token: other.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), code: handoverCode, ...extra }, expect });
    return { o, handoverCode, done };
  };
  const adminView = id => call(`/orders/${id}`, { token: admin.token });
  const owedNow = async () => (await call('/driver/cash', { token: other.token })).owedCents;
  let owed = await owedNow();
  const exact = await finish({ collectedCents: dueCents });
  assert.equal(exact.done.status, 'completed');
  assert.deepEqual((await adminView(exact.o.id)).collected, { cents: dueCents, reason: null });
  const owedExact = await owedNow() - owed;
  assert.equal(owedExact, Math.round(exact.done.commission * 100), 'owed rises by the commission only');
  owed = await owedNow();
  const short = await finish({ collectedCents: 4000, varianceReason: 'customer_short' });
  assert.deepEqual((await adminView(short.o.id)).collected, { cents: 4000, reason: 'customer_short' });
  assert.deepEqual(short.done.collected, { cents: 4000, reason: 'customer_short' }, 'the driver sees what they recorded');
  assert.equal(await owedNow() - owed, owedExact, 'a short payment changes neither commission nor owed');
  assert.equal(short.done.commission, exact.done.commission);
  owed = await owedNow();
  const over = await finish({ collectedCents: 5200, varianceReason: 'tip' });
  assert.deepEqual((await adminView(over.o.id)).collected, { cents: 5200, reason: 'tip' });
  assert.equal(await owedNow() - owed, owedExact, 'an overpayment changes neither commission nor owed');
  assert.equal(over.done.commission, exact.done.commission);
  assert.equal('collected' in await call(`/orders/${over.o.id}`, { token: customer.token }), false, 'the customer never receives the door-cash record');
  // Refusals: a difference needs a listed reason; amounts are non-negative integers; the order stays in transit.
  const blocked = await toTransit();
  const blockedCode = (await call(`/orders/${blocked.id}`, { token: customer.token })).handoverCode;
  for (const extra of [{ collectedCents: 4000 }, { collectedCents: 4000, varianceReason: 'nope' }, { collectedCents: dueCents, varianceReason: 'tip' },
    { collectedCents: -1, varianceReason: 'tip' }, { collectedCents: 40.5, varianceReason: 'tip' }, { collectedCents: '4000', varianceReason: 'tip' },
    { varianceReason: 'tip' }, { collectedCents: 100_000_001, varianceReason: 'tip' }])
    assert.equal((await call(`/orders/${blocked.id}/advance`, { token: other.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), code: blockedCode, ...extra }, expect: 400 })).error, 'invalid_input', JSON.stringify(extra));
  assert.equal((await call(`/orders/${blocked.id}`, { token: other.token })).status, 'in_transit');
  // The fields mean nothing before delivery.
  const early = await call(`/jobs/${(await newOrder()).id}/accept`, { token: other.token, body: {} });
  assert.equal((await call(`/orders/${early.id}/advance`, { token: other.token, body: { expectedStatus: 'assigned', requestId: randomUUID(), collectedCents: dueCents }, expect: 400 })).error, 'invalid_input');
  // Replay: the same request id returns the stored outcome and never applies twice.
  const replayId = randomUUID(), replayBody = { expectedStatus: 'in_transit', requestId: replayId, code: blockedCode, collectedCents: 4500, varianceReason: 'no_change' };
  const replayFirst = await call(`/orders/${blocked.id}/advance`, { token: other.token, body: replayBody });
  const again = await call(`/orders/${blocked.id}/advance`, { token: other.token, body: replayBody });
  assert.equal(again.completedAt, replayFirst.completedAt);
  assert.deepEqual(again.collected, { cents: 4500, reason: 'no_change' });
  await call(`/orders/${blocked.id}/advance`, { token: other.token, body: { ...replayBody, collectedCents: 4600 }, expect: 409 }); // same id, other payload
  // Only the assigned driver may record it.
  const roleOrder = await toTransit();
  const roleBody = { expectedStatus: 'in_transit', requestId: randomUUID(), collectedCents: dueCents };
  await call(`/orders/${roleOrder.id}/advance`, { token: customer.token, body: roleBody, expect: 403 });
  await call(`/orders/${roleOrder.id}/advance`, { token: admin.token, body: roleBody, expect: 403 });
  const third = await call('/auth/register', { body: { phone: '0599300006', name: 'Rami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${third.user.id}/approve`, { token: admin.token, body: {} });
  await call(`/orders/${roleOrder.id}/advance`, { token: third.token, body: { ...roleBody, requestId: randomUUID() }, expect: 409 }); // another driver's order
  // Orders completed without the fields (older apps) stay valid and carry no record.
  const legacy = await finish({});
  assert.equal('collected' in await adminView(legacy.o.id), false);

  console.log('cash: ok');
} finally {
  await shutdown();

}
