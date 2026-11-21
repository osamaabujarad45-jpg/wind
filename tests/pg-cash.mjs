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
import { checkCompletedReattempt, checkPickupPay } from './support/shipping-pay.mjs';
import { cashLines } from '../src/cash-lines.ts';
import { copy } from '../src/copy.ts';
// The ledger maths below were written for a ₪49 parcel; the admin tariff is set to match (SPEC-parcel-standard.md).
const defaultSettings = { ...standard, parcelPrice: 49 };

const dir = mkdtempSync(join(tmpdir(), 'wind-cash-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, promote, liveWatcherCount } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599300001', name: 'Cashier', password: 'secret1' } });
  await promote('0599300001');
  admin.token = (await call('/auth/login', { body: { phone: '0599300001', password: 'secret1' } })).token;
  // T23.1: forgiving debt needs a request approved by a different finance approver, so the suite needs a second admin.
  const approver = await call('/auth/register', { body: { phone: '0599300005', name: 'Approver', password: 'secret1' } });
  await promote('0599300005');
  approver.token = (await call('/auth/login', { body: { phone: '0599300005', password: 'secret1' } })).token;
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
  async function deliver(complete = true) {
    let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
    order = await advance(driver.token, await advance(driver.token, order));
    if (!complete) return order;
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

  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 200, intent: 'charge', reason: 'x' }, expect: 400 });
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
  // The driver's breakdown (research #9), with an approved negative adjustment, adds up to PostgreSQL's balance.
  const breakdown = cashLines(copy.en, cash);
  assert.ok(breakdown.some(([label, cents]) => label === copy.en.cashAdjustments && cents === -200));
  assert.equal(breakdown.reduce((sum, [, cents]) => sum + cents, 0), cash.owedCents);

  const list = await call('/admin/cash', { token: admin.token });
  assert.deepEqual(list.map(r => r.driverId), [driver.user.id, other.user.id]); // highest debt first
  assert.equal(list[0].owedCents, commissionCents - 700);
  assert.ok(list[0].lastRemittanceAt > 0);
  assert.equal(list[1].owedCents, 0);

  // An older handover stays confirmable however many newer entries follow it.
  const handover = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1 } });
  for (let i = 0; i < 50; i++) await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1, intent: 'charge', reason: 'Fuel card top-up' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.entries.filter(e => e.status !== 'pending').length, 50); // the history stays one page
  assert.deepEqual(cash.entries.filter(e => e.status === 'pending').map(e => e.id), [handover.id]);
  await call(`/driver/cash/${handover.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -49, approvalId: await forgive(49), reason: 'Undo the fuel top-ups' } }); // owed as before

  // Exact rounding, no manual payouts, no leaving with debt, append-only.
  assert.equal(Math.round(a.commission * 100), 735); // ₪49 × 15%, independent of the server formula
  const open = (await call('/driver/cash', { token: driver.token })).owedCents;
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -(open + 1), reason: 'Would become a payout' }, expect: 400 });
  await call('/me/delete', { token: driver.token, body: { password: 'secret1' }, expect: 409 });
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { role: 'customer' }, expect: 409 });
  const { persistence } = await import('../server/main.ts');
  await assert.rejects(persistence.run('DELETE FROM cash_entries'), /append-only/);
  await assert.rejects(persistence.run("UPDATE cash_entries SET amount_cents = 1 WHERE kind = 'adjustment'"), /append-only/);
  const settle = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: open } });
  await call(`/driver/cash/${settle.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  await call('/admin/cash/adjustment', { token: admin.token, body: {
    driverId: driver.user.id, amountCents: 50, intent: 'charge', reason: 'Office fuel charge', requestId: randomUUID(),
  } });
  const officeHandover = { driverId: driver.user.id, amountCents: 50, requestId: randomUUID() };
  await persistence.run("UPDATE users SET staff_role='support' WHERE id=?", approver.user.id);
  await call('/admin/cash/remittance', { token: approver.token, body: officeHandover, expect: 403 });
  await persistence.run("UPDATE users SET staff_role='finance' WHERE id=?", approver.user.id);
  const handoverCommand = { ...officeHandover, currency: 'ILS', commandId: randomUUID() };
  const pendingHandover = await call('/admin/cash/remittance', { token: approver.token, body: handoverCommand });
  const handoverPath = `/admin/cash/${pendingHandover.id}/resolve`;
  const resolution = { decision: 'confirm', reason: 'Office verified the handover', evidenceRef: 'Receipt 123' };
  await persistence.run("UPDATE users SET staff_role='support' WHERE id=?", approver.user.id);
  await call('/admin/cash/remittance', { token: approver.token, body: officeHandover, expect: 403 });
  await call('/admin/cash/remittance', { token: approver.token, body: handoverCommand, expect: 403 });
  await call(handoverPath, { token: approver.token, body: resolution, expect: 403 });
  assert.deepEqual(await call(`/admin/cash/commands/${officeHandover.requestId}`, { token: approver.token }), { entry: pendingHandover });
  // DRV-17: Wind pays two legs for a captain's return, including an office handback.
  await call('/admin/promos', { token: admin.token, body: { code: 'RETURN5', amount: 5, maxUses: 5, days: 7 } });
  let returned = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), promoCode: 'RETURN5', expectedDiscount: 5 } });
  assert.equal(returned.discount, 5);
  returned = await call(`/jobs/${returned.id}/accept`, { token: driver.token, body: {} });
  returned = await advance(driver.token, await advance(driver.token, returned));
  await call(`/orders/${returned.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  await call(`/admin/orders/${returned.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient not home' } });
  const { returnCode } = await call(`/orders/${returned.id}`, { token: customer.token });
  const returnProof = { expectedStatus: 'returning', requestId: randomUUID(), code: returnCode };
  const returnPath = `/orders/${returned.id}/advance`;
  await call(returnPath, { token: driver.token, body: { ...returnProof, code: 'incorrect', requestId: randomUUID() }, expect: 400 });
  await persistence.run("INSERT INTO ledger_accounts(code,kind,created_at) VALUES('platform:operating_expense','platform_revenue',?)", Date.now());
  assert.equal((await call(returnPath, { token: driver.token, body: { ...returnProof, requestId: randomUUID() }, expect: 409 })).error, 'account_conflict');
  assert.equal((await persistence.one('SELECT status FROM orders WHERE id = ?', returned.id)).status, 'returning');
  assert.equal(await persistence.one("SELECT 1 FROM security_events WHERE order_id = ? AND action IN ('RETURN_NO_FARE','RETURN_COMPLETED')", returned.id), undefined);
  assert.equal(await persistence.one("SELECT 1 FROM cash_entries WHERE order_id = ? AND source = 'trip_pay'", returned.id), undefined);
  assert.equal((await persistence.one('SELECT failures FROM proof_attempts WHERE order_id = ?', returned.id)).failures, 1);
  // Repair the synthetic account metadata before testing a fresh successful request.
  await persistence.scope(async () => {
    await persistence.exec('BEGIN');
    try {
      await persistence.run('ALTER TABLE ledger_accounts DISABLE TRIGGER ledger_accounts_immutable');
      await persistence.run("UPDATE ledger_accounts SET kind = 'operating_expense' WHERE code = 'platform:operating_expense'");
      await persistence.run('ALTER TABLE ledger_accounts ENABLE TRIGGER ledger_accounts_immutable');
      await persistence.exec('COMMIT');
    } catch (error) { await persistence.exec('ROLLBACK'); throw error; }
  });
  assert.equal((await call(returnPath, { token: driver.token, body: returnProof })).status, 'returned');
  assert.equal((await call(returnPath, { token: driver.token, body: returnProof })).status, 'returned');
  await call(returnPath, { token: driver.token, body: { ...returnProof, requestId: randomUUID() }, expect: 409 });
  assert.equal(await persistence.one('SELECT 1 FROM ledger_journals WHERE business_ref = ?', `order:${returned.id}:discount`), undefined, 'a no-fare return has no discount journal');
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, 735 * 2, 'a return collected no fare, so it adds no commission (SRS DRV-17)');
  const returnPay = 2 * Math.round(returned.price * 100);
  assert.deepEqual([cash.owedCents, cash.pendingCents], [50 - returnPay, 50], 'the return uses the undiscounted fare');
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: {
    driverId: driver.user.id, amountCents: 1, intent: 'payout', reason: 'Office paid the captain', requestId: randomUUID(),
  }, expect: 409 })).error, 'remittance_pending');
  const resolveCommand = { ...resolution, currency: 'ILS', commandId: randomUUID() };
  await persistence.run("UPDATE users SET staff_role='finance' WHERE id=?", approver.user.id);
  const resolvedHandover = await call(handoverPath, { token: approver.token, body: resolveCommand });
  assert.equal(resolvedHandover.status, 'confirmed');
  assert.deepEqual(await call(handoverPath, { token: approver.token, body: resolveCommand }), resolvedHandover);
  const audit = await persistence.one('SELECT resolved_by, resolution_note FROM cash_entries WHERE id = ?', pendingHandover.id);
  assert.deepEqual(audit, { resolved_by: approver.user.id, resolution_note: 'Office verified the handover | evidence: Receipt 123' });
  await assert.rejects(() => persistence.run('UPDATE cash_entries SET resolution_note = ? WHERE id = ?', 'Altered audit', pendingHandover.id), { code: '23514' });
  await persistence.run("UPDATE users SET staff_role='support' WHERE id=?", approver.user.id);
  await call(handoverPath, { token: approver.token, body: resolveCommand, expect: 403 });
  await persistence.run('UPDATE users SET staff_role=NULL WHERE id=?', approver.user.id);
  cash = await call('/driver/cash', { token: driver.token });
  assert.deepEqual([cash.owedCents, cash.pendingCents], [-returnPay, 0]);
  const tripEntries = (balance, order) => balance.entries.filter(e => e.note === `Trip pay · أجر الرحلة · order ${order.id}`);
  const codePay = tripEntries(cash, returned);
  assert.deepEqual(codePay.map(e => [e.kind, e.amountCents, e.status]), [['adjustment', -returnPay, 'confirmed']]);
  let supportReturn = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  supportReturn = await call(`/jobs/${supportReturn.id}/accept`, { token: driver.token, body: {} });
  supportReturn = await advance(driver.token, await advance(driver.token, supportReturn));
  await call(`/orders/${supportReturn.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Recipient asked to try again' } });
  await call(`/orders/${supportReturn.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient absent again' } });
  const confirmReturn = { action: 'confirm_office_return', reason: 'Received at office' };
  await persistence.run("UPDATE users SET staff_role='finance' WHERE id=?", approver.user.id);
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: approver.token, body: confirmReturn, expect: 403 });
  await persistence.run("UPDATE users SET staff_role='support' WHERE id=?", approver.user.id);
  const confirmedReturn = await call(`/admin/orders/${supportReturn.id}/resolve`, { token: approver.token, body: confirmReturn });
  await persistence.run('UPDATE users SET staff_role=NULL WHERE id=?', approver.user.id);
  assert.equal(Number(confirmedReturn.commission), 0, 'support-confirmed returns owe no commission, as code-confirmed returns (SRS DRV-17)');
  const { persistence: ledgerDb } = await import('../server/main.ts');
  assert.equal(await ledgerDb.one('SELECT 1 FROM ledger_journals WHERE business_ref = ?', `order:${supportReturn.id}:commission`), undefined, 'and post no commission journal');
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, 735 * 2);
  const officePay = 4 * Math.round(supportReturn.price * 100);
  assert.equal(cash.owedCents, -returnPay - officePay);
  assert.deepEqual(tripEntries(cash, supportReturn).map(e => e.amountCents), [-officePay]);
  const earnings = await call('/driver/earnings', { token: driver.token });
  assert.equal(earnings.all.jobs, 4);
  assert.equal(earnings.all.tripPayCents, returnPay + officePay);

  const journalFor = entryId => ledgerDb.all(`SELECT j.kind, a.code, a.kind AS account_kind, e.debit_minor, e.credit_minor
    FROM ledger_journals j JOIN ledger_entries e ON e.journal_id = j.id JOIN ledger_accounts a ON a.id = e.account_id
    WHERE j.business_ref = ? ORDER BY e.debit_minor DESC`, `cash-entry:${entryId}`);
  assert.deepEqual(await journalFor(codePay[0].id), [
    { kind: 'cash_adjustment', code: 'platform:operating_expense', account_kind: 'operating_expense', debit_minor: returnPay, credit_minor: 0 },
    { kind: 'cash_adjustment', code: `driver:${driver.user.id}:receivable`, account_kind: 'driver_receivable', debit_minor: 0, credit_minor: returnPay },
  ]);
  assert.equal((await call('/admin/ledger/import', { token: admin.token, body: {} })).journals, 0, 'import agrees with live journals');

  // The office resolve route recognizes support's eligibility recovery and pays one leg.
  const recovered = await deliver(false);
  const { version } = await ledgerDb.one('SELECT version FROM orders WHERE id = ?', recovered.id);
  await call(`/admin/eligibility/orders/${recovered.id}/recovery`, { token: admin.token,
    body: { action: 'return', expectedVersion: version, reason: 'Support collected the parcel', evidenceRef: 'synthetic:return' } });
  await call(`/admin/orders/${recovered.id}/resolve`, { token: admin.token, body: { action: 'confirm_office_return', reason: 'Received from support' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.deepEqual(tripEntries(cash, recovered).map(e => e.amountCents), [-Math.round(recovered.price * 100)]);

  const codeAfterRecovery = await deliver(false);
  const recoveryVersion = (await ledgerDb.one('SELECT version FROM orders WHERE id = ?', codeAfterRecovery.id)).version;
  await call(`/admin/eligibility/orders/${codeAfterRecovery.id}/recovery`, { token: admin.token,
    body: { action: 'return', expectedVersion: recoveryVersion, reason: 'Support collected the parcel', evidenceRef: 'synthetic:return' } });
  const recoveryCode = (await call(`/orders/${codeAfterRecovery.id}`, { token: customer.token })).returnCode;
  await advance(driver.token, { ...codeAfterRecovery, status: 'returning' }, { code: recoveryCode });
  assert.equal((await ledgerDb.one("SELECT amount_cents FROM cash_entries WHERE order_id = ? AND source = 'trip_pay'", codeAfterRecovery.id)).amount_cents,
    -Math.round(codeAfterRecovery.price * 100), 'a code closure uses the same custody transfer evidence');

  // A courier block also uses one leg, and only a clearing second-admin review posts the pay.
  const blockedParcel = await deliver(false);
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { status: 'blocked', recovery: 'return' } });
  await call(`/admin/orders/${blockedParcel.id}/resolve`, { token: admin.token, body: { action: 'confirm_return', reason: 'Received from support' } });
  const blockPayNote = `DRV-17 trip pay order ${blockedParcel.id}`;
  assert.equal(await ledgerDb.one('SELECT 1 FROM cash_entries WHERE note = ?', blockPayNote), undefined);
  const decision = { token: approver.token, body: { cleared: true, note: 'Synthetic review cleared the captain' } };
  const reviewPath = `/admin/orders/${blockedParcel.id}/block-review`;
  const review = await call(reviewPath, decision);
  assert.equal(review.paidCents, Math.round(blockedParcel.price * 100));
  assert.equal(review.paidCents, review.tripPayCents);
  assert.deepEqual(await call(reviewPath, decision), review);
  assert.equal((await ledgerDb.all('SELECT amount_cents FROM cash_entries WHERE note = ?', blockPayNote)).length, 1);
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { status: 'active' } });
  driver.token = (await call('/auth/login', { body: { phone: '0599300003', password: 'secret1' } })).token;

  await checkCompletedReattempt({ call, persistence, input, driver, customer, admin });
  await checkPickupPay({ call, persistence, input, driver, other, customer, admin, liveWatcherCount });
  const cancelled = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await call(`/jobs/${cancelled.id}/accept`, { token: driver.token, body: {} });
  await call(`/orders/${cancelled.id}/cancel`, { token: customer.token, body: {} });
  const pickupPath = `/admin/orders/${cancelled.id}/pickup-pay-review`;
  const submitReview = async (actor, granted) => {
    const response = await fetch(base + pickupPath, { method: 'POST',
      headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ granted, km: granted ? 1 : 0, reason: 'Concurrent staff decision' }),
    });
    return { status: response.status, body: await response.json() };
  };
  // The grant pauses on the driver row while it holds the order lock. The denial must wait behind it.
  const blocker = await persistence.pool.connect();
  const waitForReviewLocks = async count => {
    const deadline = Date.now() + 5000; // a wait loop, not a sleep: generous for a loaded gate run (Haiku r7 N-6)
    for (;;) {
      const { n } = await persistence.one(`WITH waiting AS (
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      ) SELECT COUNT(*) AS n FROM waiting w WHERE ? = ANY(w.blockers)
        OR EXISTS (SELECT 1 FROM waiting ahead WHERE ahead.pid = ANY(w.blockers) AND ? = ANY(ahead.blockers))`,
      blocker.processID, blocker.processID);
      if (n >= count) return;
      assert.ok(Date.now() < deadline, 'pickup decisions reached their row locks');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  let grant, denial;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [driver.user.id]);
    grant = submitReview(admin, true);
    await waitForReviewLocks(1);
    denial = submitReview(approver, false);
    await waitForReviewLocks(2);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
  const replies = await Promise.all([grant, denial]);
  assert.deepEqual(replies.map(reply => reply.status), [200, 409]);
  assert.equal(replies.find(reply => reply.status === 409).body.error, 'review_decided');
  const grantedReview = replies[0].body;
  assert.ok(grantedReview.paidCents > 0);
  assert.deepEqual((await call(`/orders/${cancelled.id}`, { token: admin.token })).pickupPayReview.decision, grantedReview);
  assert.equal((await persistence.one("SELECT COUNT(*) AS n FROM security_events WHERE order_id = ? AND action = 'PICKUP_PAY_DECIDED'", cancelled.id)).n, 1);
  assert.deepEqual((await persistence.all("SELECT amount_cents FROM cash_entries WHERE order_id = ? AND source = 'pickup_pay'", cancelled.id))
    .map(row => row.amount_cents), [-grantedReview.paidCents]);
  const credit = (await call('/driver/cash', { token: driver.token })).owedCents;
  const payoutBody = { driverId: driver.user.id, amountCents: -credit, reason: 'Office paid trip earnings', source: 'payout', requestId: randomUUID() };
  await persistence.run("UPDATE users SET staff_role='support' WHERE id=?", approver.user.id);
  await call('/admin/settings?payroll=1', { token: approver.token, body: { pickupPayPerKm: 1 }, expect: 403 });
  await call('/admin/cash/adjustment', { token: approver.token, body: payoutBody, expect: 403 });
  const envelope = { commandId: randomUUID(), payload: { driverId: driver.user.id, amountCents: 1, intent: 'charge', reason: 'Cashier adjustment', currency: 'ILS' } };
  await call('/admin/cash/adjustment', { token: approver.token, body: envelope, expect: 403 });
  await call('/admin/cash/adjustment', { token: approver.token, body: { driverId: other.user.id, amountCents: 1, intent: 'charge', reason: 'Office fuel charge' }, expect: 403 });
  await persistence.run("UPDATE users SET staff_role='finance' WHERE id=?", approver.user.id);
  const replayEnvelope = { ...envelope, commandId: randomUUID() };
  const replayEntry = await call('/admin/cash/adjustment', { token: approver.token, body: replayEnvelope });
  assert.equal(replayEntry.source, undefined, 'a charge in credit still posts to revenue');
  assert.deepEqual(await call('/admin/cash/adjustment', { token: approver.token, body: replayEnvelope }), replayEntry);
  assert.ok((await journalFor(replayEntry.id)).some(row => row.code === 'platform:revenue' && row.credit_minor === 1));
  assert.equal((await call('/admin/cash/adjustment', { token: approver.token, body: {
    driverId: driver.user.id, amountCents: 1, reason: 'Older admin form', requestId: randomUUID(),
  }, expect: 426 })).error, 'client_update_required');
  assert.equal((await call('/admin/cash/adjustment', { token: approver.token, body: {
    ...payoutBody, requestId: randomUUID(),
  }, expect: 400 })).error, 'invalid_amount');
  await persistence.run("UPDATE users SET staff_role='support' WHERE id=?", approver.user.id);
  await call('/admin/cash/adjustment', { token: approver.token, body: replayEnvelope, expect: 403 });
  assert.deepEqual(await call(`/admin/cash/commands/${replayEnvelope.commandId}`, { token: approver.token }), { entry: replayEntry });
  await persistence.run("UPDATE users SET staff_role='finance' WHERE id=?", approver.user.id);
  payoutBody.amountCents -= 1;
  const payout = await call('/admin/cash/adjustment', { token: approver.token, body: payoutBody });
  assert.deepEqual(await call('/admin/cash/adjustment', { token: approver.token, body: payoutBody }), payout);
  await call('/admin/cash/adjustment', { token: admin.token, body: { ...payoutBody, requestId: randomUUID() }, expect: 400 });
  assert.equal(payout.note, payoutBody.reason);
  assert.equal(payout.source, 'payout');
  assert.match(payout.reference, /^P-/);
  assert.deepEqual(await journalFor(payout.id), [
    { kind: 'cash_adjustment', code: `driver:${driver.user.id}:receivable`, account_kind: 'driver_receivable', debit_minor: payoutBody.amountCents, credit_minor: 0 },
    { kind: 'cash_adjustment', code: 'platform:provider_clearing', account_kind: 'provider_clearing', debit_minor: 0, credit_minor: payoutBody.amountCents },
  ]);
  assert.equal((await call('/admin/ledger/import', { token: admin.token, body: {} })).journals, 0, 'import agrees with the live payout journal');
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  assert.equal((await call('/admin/cash/adjustment', { token: approver.token, body: {
    driverId: driver.user.id, amountCents: 1, reason: 'Edited old payout form', requestId: randomUUID(),
  }, expect: 426 })).error, 'client_update_required');
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
  const short = await finish({ collectedCents: 4000, varianceReason: 'PARTIAL_PAYMENT' });
  assert.deepEqual((await adminView(short.o.id)).collected, { cents: 4000, reason: 'PARTIAL_PAYMENT' });
  assert.deepEqual(short.done.collected, { cents: 4000, reason: 'PARTIAL_PAYMENT' }, 'the driver sees what they recorded');
  assert.equal(await owedNow() - owed, owedExact, 'a short payment changes neither commission nor owed');
  assert.equal(short.done.commission, exact.done.commission);
  owed = await owedNow();
  const over = await finish({ collectedCents: 5200, varianceReason: 'INCORRECT_CASH' });
  assert.deepEqual((await adminView(over.o.id)).collected, { cents: 5200, reason: 'INCORRECT_CASH' });
  assert.equal(await owedNow() - owed, owedExact, 'an overpayment changes neither commission nor owed');
  assert.equal(over.done.commission, exact.done.commission);
  assert.equal('collected' in await call(`/orders/${over.o.id}`, { token: customer.token }), false, 'the customer never receives the door-cash record');
  // Refusals: a difference needs a listed reason; amounts are non-negative integers; the order stays in transit.
  const blocked = await toTransit();
  const blockedCode = (await call(`/orders/${blocked.id}`, { token: customer.token })).handoverCode;
  for (const extra of [{ collectedCents: 4000 }, { collectedCents: 4000, varianceReason: 'nope' }, { collectedCents: dueCents, varianceReason: 'OTHER_ADMIN_REVIEW' },
    { collectedCents: -1, varianceReason: 'OTHER_ADMIN_REVIEW' }, { collectedCents: 40.5, varianceReason: 'OTHER_ADMIN_REVIEW' }, { collectedCents: '4000', varianceReason: 'OTHER_ADMIN_REVIEW' },
    { varianceReason: 'OTHER_ADMIN_REVIEW' }, { collectedCents: 100_000_001, varianceReason: 'OTHER_ADMIN_REVIEW' },
    // A11 direction rule: over-collection takes only INCORRECT_CASH/OTHER_ADMIN_REVIEW; did-not-pay means 0; partial means > 0.
    { collectedCents: 5200, varianceReason: 'PARTIAL_PAYMENT' }, { collectedCents: 5200, varianceReason: 'APPROVED_DISCOUNT' },
    { collectedCents: 4000, varianceReason: 'CUSTOMER_DID_NOT_PAY' }, { collectedCents: 0, varianceReason: 'PARTIAL_PAYMENT' },
    { collectedCents: 4000, varianceReason: 'customer_short' }])
    assert.equal((await call(`/orders/${blocked.id}/advance`, { token: other.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), code: blockedCode, ...extra }, expect: 400 })).error, 'invalid_input', JSON.stringify(extra));
  assert.equal((await call(`/orders/${blocked.id}`, { token: other.token })).status, 'in_transit');
  const unpaid = await finish({ collectedCents: 0, varianceReason: 'CUSTOMER_DID_NOT_PAY' });
  assert.deepEqual((await adminView(unpaid.o.id)).collected, { cents: 0, reason: 'CUSTOMER_DID_NOT_PAY' }, 'nothing taken is recorded, not refused');
  // The fields mean nothing before delivery.
  const early = await call(`/jobs/${(await newOrder()).id}/accept`, { token: other.token, body: {} });
  assert.equal((await call(`/orders/${early.id}/advance`, { token: other.token, body: { expectedStatus: 'assigned', requestId: randomUUID(), collectedCents: dueCents }, expect: 400 })).error, 'invalid_input');
  // Replay: the same request id returns the stored outcome and never applies twice.
  const replayId = randomUUID(), replayBody = { expectedStatus: 'in_transit', requestId: replayId, code: blockedCode, collectedCents: 4500, varianceReason: 'PARTIAL_PAYMENT' };
  const replayFirst = await call(`/orders/${blocked.id}/advance`, { token: other.token, body: replayBody });
  const again = await call(`/orders/${blocked.id}/advance`, { token: other.token, body: replayBody });
  assert.equal(again.completedAt, replayFirst.completedAt);
  assert.deepEqual(again.collected, { cents: 4500, reason: 'PARTIAL_PAYMENT' });
  await call(`/orders/${blocked.id}/advance`, { token: other.token, body: { ...replayBody, collectedCents: 4600 }, expect: 409 }); // same id, other payload
  // Only the assigned driver may record it.
  const roleOrder = await toTransit();
  const roleBody = { expectedStatus: 'in_transit', requestId: randomUUID(), collectedCents: dueCents };
  await call(`/orders/${roleOrder.id}/advance`, { token: customer.token, body: roleBody, expect: 403 });
  await call(`/orders/${roleOrder.id}/advance`, { token: admin.token, body: roleBody, expect: 403 });
  const third = await call('/auth/register', { body: { phone: '0599300006', name: 'Rami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${third.user.id}/approve`, { token: admin.token, body: {} });
  await call(`/orders/${roleOrder.id}/advance`, { token: third.token, body: { ...roleBody, requestId: randomUUID() }, expect: 404 }); // another driver cannot even see the order
  // Orders completed without the fields (older apps) stay valid and carry no record.
  const legacy = await finish({});
  assert.equal('collected' in await adminView(legacy.o.id), false);
  // A11 boundaries: the largest amount is accepted with a reason, and an exact amount may state no reason (null is absent).
  const ceiling = await finish({ collectedCents: 100_000_000, varianceReason: 'INCORRECT_CASH' });
  assert.deepEqual((await adminView(ceiling.o.id)).collected, { cents: 100_000_000, reason: 'INCORRECT_CASH' });
  const nullReason = await finish({ collectedCents: dueCents, varianceReason: null });
  assert.deepEqual((await adminView(nullReason.o.id)).collected, { cents: dueCents, reason: null });
  // M2: two completions race with different request ids at the same expected status. One applies; the other is refused
  // (order_changed, or cannot_advance if it ran second) and writes nothing, so the record is the winner's alone.
  const raced = await toTransit();
  const raceCode = (await call(`/orders/${raced.id}`, { token: customer.token })).handoverCode;
  const racers = [{ collectedCents: dueCents }, { collectedCents: 4000, varianceReason: 'PARTIAL_PAYMENT' }].map(extra => ({ requestId: randomUUID(), extra }));
  const outcomes = await Promise.all(racers.map(({ requestId, extra }) => fetch(`${base}/orders/${raced.id}/advance`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.token}` },
    body: JSON.stringify({ expectedStatus: 'in_transit', requestId, code: raceCode, ...extra }) })
    .then(async res => ({ status: res.status, body: await res.json() }))));
  assert.deepEqual(outcomes.map(o => o.status).sort(), [200, 409], JSON.stringify(outcomes));
  const winner = racers[outcomes.findIndex(o => o.status === 200)];
  assert.ok(['order_changed', 'cannot_advance'].includes(outcomes.find(o => o.status === 409).body.error));
  assert.deepEqual((await adminView(raced.id)).collected, { cents: winner.extra.collectedCents, reason: winner.extra.varianceReason ?? null },
    'the record comes from the first advance only');
  assert.equal((await adminView(raced.id)).status, 'completed');
  // A11 discounted parcel: the expected amount is the fare minus the recorded promo, so the exact payment is ₪44, not ₪49.
  await call('/admin/promos', { token: admin.token, body: { code: 'DOOR5', amount: 5, maxUses: 5, days: 7 } });
  let promoted = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), promoCode: 'DOOR5', expectedDiscount: 5 } });
  promoted = await call(`/jobs/${promoted.id}/accept`, { token: other.token, body: {} });
  promoted = await advance(other.token, await advance(other.token, promoted));
  const promotedCode = (await call(`/orders/${promoted.id}`, { token: customer.token })).handoverCode;
  const promotedAdvance = (extra, expect, requestId = randomUUID()) => call(`/orders/${promoted.id}/advance`, { token: other.token,
    body: { expectedStatus: 'in_transit', requestId, code: promotedCode, ...extra }, expect });
  await promotedAdvance({ collectedCents: dueCents }, 400); // the undiscounted ₪49 is not what is due
  await promotedAdvance({ collectedCents: 4900, varianceReason: 'PARTIAL_PAYMENT' }, 400); // over the due amount is never a partial payment
  await promotedAdvance({ collectedCents: 4400, varianceReason: 'tip' }, 400); // exact takes no reason, and 'tip' is not on the list
  assert.equal((await call(`/orders/${promoted.id}`, { token: other.token })).status, 'in_transit');
  const doneRequest = randomUUID();
  const promotedDone = await promotedAdvance({ collectedCents: 4400 }, 200, doneRequest);
  assert.equal(promotedDone.status, 'completed');
  assert.deepEqual((await adminView(promoted.id)).collected, { cents: 4400, reason: null });
  const door = await persistence.one('SELECT door_expected_cents, door_collected_by, door_request_id FROM orders WHERE id = ?', promoted.id);
  assert.equal(Number(door.door_expected_cents), 4400, 'the record names the expected amount after the discount');
  assert.equal(Number(door.door_collected_by), other.user.id, 'the record names the collecting driver');
  assert.equal(door.door_request_id, doneRequest, 'the record names the replay identity of the advance');
  // A11 write-once: after collection none of the five door columns can change, on any path.
  for (const [column, value] of [['collected_cents', 1], ['variance_reason', 'INCORRECT_CASH'], ['door_expected_cents', 1],
    ['door_collected_by', customer.user.id], ['door_request_id', randomUUID()]])
    await assert.rejects(persistence.run(`UPDATE orders SET ${column} = ? WHERE id = ?`, value, promoted.id), /door cash is write-once/, column);
  await persistence.run('UPDATE orders SET updated_at = updated_at WHERE id = ?', promoted.id); // other columns stay writable

  console.log('cash: ok');
} finally {
  await shutdown();

}
