// Driver cash settlement (SPEC-cash-settlement.md): commission owed, confirmed handovers, adjustments.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings as standard, quote } from '../src/model.ts';
import { cashLines } from '../src/cash-lines.ts';
import { copy } from '../src/copy.ts';
import { apiCaller } from './support/api.mjs';
import { checkCompletedReattempt, checkPickupPay } from './support/shipping-pay.mjs';
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
  const secondCashier = await call('/auth/register', { body: { phone: '0599300005', name: 'Second cashier', password: 'secret1' } });
  await promote('0599300005');
  secondCashier.token = (await call('/auth/login', { body: { phone: '0599300005', password: 'secret1' } })).token;
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
  // Haiku r7 N-7: a remittance resent under its id with another note is a different request too.
  assert.equal((await call('/admin/cash/remittance', { token: admin.token, body: { ...retry, note: 'Changed note' }, expect: 409 })).error, 'idempotency_conflict');
  await call('/admin/cash/adjustment', { token: admin.token, body: { ...retry, reason: 'Same id, other form' }, expect: 409 });
  await call('/admin/cash/remittance', { token: admin.token, body: { ...retry, requestId: 'not-a-uuid' }, expect: 400 });
  // A-01: a lost reply is recovered from the recording admin's command receipt, never by recording again.
  assert.deepEqual((await call(`/admin/cash/commands/${retry.requestId}`, { token: admin.token, method: 'GET' })).entry?.id, wrong.id);
  assert.deepEqual(await call(`/admin/cash/commands/${randomUUID()}`, { token: admin.token, method: 'GET' }), { entry: null }); // unknown, not refused
  await call('/admin/cash/commands/not-a-uuid', { token: admin.token, method: 'GET', expect: 400 });
  await call(`/admin/cash/commands/${retry.requestId}`, { token: driver.token, method: 'GET', expect: 403 });
  const auditor = await call('/auth/register', { body: { phone: '0599300009', name: 'Second cashier', password: 'secret1' } });
  await promote('0599300009');
  const auditorToken = (await call('/auth/login', { body: { identifier: '0599300009', password: 'secret1' } })).token;
  assert.deepEqual(await call(`/admin/cash/commands/${retry.requestId}`, { token: auditorToken, method: 'GET' }), { entry: null }); // another admin's receipt stays unread
  await call('/admin/cash/remittance', { token: auditorToken, body: retry, expect: 409 }); // and cannot be replayed by them
  // A double tap sends both at once: one entry, and both replies name it.
  const tapped = { driverId: driver.user.id, amountCents: 1, requestId: randomUUID() };
  const taps = await Promise.all([1, 2, 3].map(() => call('/admin/cash/remittance', { token: admin.token, body: tapped })));
  assert.equal(new Set(taps.map(entry => entry.id)).size, 1);
  await call(`/driver/cash/${taps[0].id}/confirm`, { token: driver.token, body: { decision: 'dispute' } });
  await call(`/driver/cash/${wrong.id}/confirm`, { token: driver.token, body: { decision: 'dispute' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.owedCents, commissionCents - 500); // disputed never counts
  assert.equal(cash.pendingCents, 0);

  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 200, intent: 'charge', reason: 'x' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 0, reason: 'Nothing at all' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1_000_001, reason: 'Too much money' }, expect: 400 });
  await call('/admin/approvals', { token: admin.token, body: { subjectType: 'cash_adjustment', subjectId: String(driver.user.id), amountMinor: 200, reason: 'Forgive test debt' }, expect: 409 }); // SQLite cannot host the protocol
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -200, reason: 'Customer paid by mistake to office' }, expect: 409 }); // no approval: refused, not forgiven
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -200, approvalId: 999, reason: 'Customer paid by mistake to office' }, expect: 503 }); // SQLite has no approval table: capability refusal
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.adjustmentsCents, 0);
  assert.equal(cash.owedCents, commissionCents - 500);
  assert.deepEqual(cash.entries.map(e => [e.kind, e.status]), [['remittance', 'disputed'], ['remittance', 'disputed'], ['remittance', 'confirmed']]);
  // The driver's breakdown (research #9) is built from these server totals and adds up to the balance the server computed.
  const breakdown = cashLines(copy.en, cash);
  assert.ok(breakdown.length >= 2, 'commission and the confirmed handover are listed');
  assert.equal(breakdown.reduce((sum, [, cents]) => sum + cents, 0), cash.owedCents);

  const list = await call('/admin/cash', { token: admin.token });
  assert.deepEqual(list.map(r => r.driverId), [driver.user.id, other.user.id]); // highest debt first
  assert.equal(list[0].owedCents, commissionCents - 500);
  assert.ok(list[0].lastRemittanceAt > 0);
  assert.equal(list[1].owedCents, 0);

  // An older handover stays confirmable however many newer entries follow it.
  const handover = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1 } });
  for (let i = 0; i < 50; i++) await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1, intent: 'charge', reason: 'Fuel card top-up' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.entries.filter(e => e.status !== 'pending').length, 50); // the history stays one page
  assert.deepEqual(cash.entries.filter(e => e.status === 'pending').map(e => e.id), [handover.id]);
  await call(`/driver/cash/${handover.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -49, reason: 'Undo the fuel top-ups' }, expect: 409 }); // forgiveness stays approval-bound on every backend

  // Exact rounding, no manual payouts, no leaving with debt, append-only.
  assert.equal(Math.round(a.commission * 100), 735); // ₪49 × 15%, independent of the server formula
  let open = cash.owedCents;
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -(open + 1), reason: 'Would become a payout' }, expect: 400 });
  await call('/me/delete', { token: driver.token, body: { password: 'secret1' }, expect: 409 });
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { role: 'customer' }, expect: 409 });
  const { db, persistence } = await import('../server/main.ts');
  assert.throws(() => db.prepare('DELETE FROM cash_entries').run(), /append-only/);
  assert.throws(() => db.prepare("UPDATE cash_entries SET amount_cents = 1 WHERE kind = 'adjustment'").run(), /append-only/);
  // T25: a handover its driver can never confirm (blocked, gone) is resolved by an administrator with a
  // recorded reason and evidence reference; the CAS shares the driver's own predicate, so exactly one move.
  const stuck = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: 120, note: 'Blocked driver handover' } });
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { status: 'blocked' } });
  // Blocking revokes the driver's sessions: the driver cannot even reach the decision route.
  await call(`/driver/cash/${stuck.id}/confirm`, { token: driver.token, body: { decision: 'confirm' }, expect: 401 });
  await call(`/admin/cash/${stuck.id}/resolve`, { token: driver.token, body: { decision: 'confirm', reason: 'Driver cannot act' }, expect: 401 });
  await call(`/admin/cash/${stuck.id}/resolve`, { token: admin.token, body: { decision: 'confirm', reason: 'no' }, expect: 400 });
  await call(`/admin/cash/${stuck.id}/resolve`, { token: admin.token, body: { decision: 'reinstate', reason: 'Not a decision' }, expect: 400 });
  const resolved = await call(`/admin/cash/${stuck.id}/resolve`, { token: admin.token, body: { decision: 'confirm', reason: 'Driver blocked; office counted the envelope', evidenceRef: 'SAFE-2026-114' } });
  assert.equal(resolved.status, 'confirmed');
  await call(`/admin/cash/${stuck.id}/resolve`, { token: admin.token, body: { decision: 'dispute', reason: 'Double tap must not repeat' }, expect: 409 });
  // (The driver-side double-move guard shares this CAS predicate; the blocked driver cannot call at all.)
  const row = db.prepare('SELECT resolved_by, resolution_note FROM cash_entries WHERE id = ?').get(stuck.id);
  assert.equal(row.resolved_by, admin.user.id, 'the resolution records its actor');
  assert.ok(row.resolution_note.includes('Driver blocked; office counted the envelope') && row.resolution_note.includes('SAFE-2026-114'), 'the resolution records its reason and evidence');
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { status: 'active' } });
  driver.token = (await call('/auth/login', { body: { phone: '0599300003', password: 'secret1' } })).token; // the block killed the session
  open = (await call('/driver/cash', { token: driver.token })).owedCents; // the resolved handover already settled its share

  const settle = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: open } });
  await call(`/driver/cash/${settle.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  const charge = await call('/admin/cash/adjustment', { token: admin.token, body: {
    driverId: driver.user.id, amountCents: 100, intent: 'charge', reason: 'Office fuel charge', requestId: randomUUID(),
  } });
  assert.equal(charge.source, undefined, 'the explicit charge is recorded as a charge');
  const handovers = [];
  for (let i = 0; i < 2; i++) handovers.push(await call('/admin/cash/remittance', {
    token: admin.token, body: { driverId: driver.user.id, amountCents: 50 },
  }));
  // DRV-17: Wind pays two legs for a captain's return, including an office handback.
  let returned = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  returned = await call(`/jobs/${returned.id}/accept`, { token: driver.token, body: {} });
  returned = await advance(driver.token, await advance(driver.token, returned));
  await call(`/orders/${returned.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' } });
  await call(`/admin/orders/${returned.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient not home' } });
  const { returnCode } = await call(`/orders/${returned.id}`, { token: customer.token });
  const returnProof = { expectedStatus: 'returning', requestId: randomUUID(), code: returnCode };
  const returnPath = `/orders/${returned.id}/advance`;
  assert.equal((await call(returnPath, { token: driver.token, body: returnProof })).status, 'returned');
  assert.equal((await call(returnPath, { token: driver.token, body: returnProof })).status, 'returned');
  await call(returnPath, { token: driver.token, body: { ...returnProof, requestId: randomUUID() }, expect: 409 });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, 735 * 2, 'a return collected no fare, so it adds no commission (SRS DRV-17)');
  const returnPay = 2 * Math.round(returned.price * 100);
  assert.equal(cash.owedCents, 100 - returnPay);
  assert.equal(cash.pendingCents, 100);
  const blockedPayout = { driverId: driver.user.id, amountCents: 100 - cash.owedCents, intent: 'payout', reason: 'Office paid driver', requestId: randomUUID() };
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: blockedPayout, expect: 409 })).error, 'remittance_pending');
  await call(`/driver/cash/${handovers[0].id}/confirm`, { token: driver.token, body: { decision: 'dispute' } });
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: { ...blockedPayout, amountCents: 1 }, expect: 409 })).error, 'remittance_pending');
  await call(`/driver/cash/${handovers[1].id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.deepEqual([cash.owedCents, cash.pendingCents], [50 - returnPay, 0]);
  const tripEntries = (balance, order) => balance.entries.filter(e => e.note === `Trip pay · أجر الرحلة · order ${order.id}`);
  const codePay = tripEntries(cash, returned);
  assert.deepEqual(codePay.map(e => [e.kind, e.amountCents, e.status]), [['adjustment', -returnPay, 'confirmed']]);
  let supportReturn = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  supportReturn = await call(`/jobs/${supportReturn.id}/accept`, { token: driver.token, body: {} });
  supportReturn = await advance(driver.token, await advance(driver.token, supportReturn));
  // An unknown failure type is refused; the new typed ones are accepted (PROD-06).
  await call(`/orders/${supportReturn.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'lost_in_space' }, expect: 400 });
  await call(`/orders/${supportReturn.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'access_blocked' } });
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Recipient asked to try again' } });
  await call(`/orders/${supportReturn.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'access_blocked' } });
  assert.equal((await call(`/orders/${supportReturn.id}`, { token: driver.token })).exceptionReason, 'access_blocked');
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient absent again' } });
  // The office leg follows who carried the goods: a missing carrier is refused before anything changes.
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'confirm_office_return', reason: 'Received at office' }, expect: 400 });
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'confirm_sender_return', carrier: 'captain', reason: 'Sender has it' }, expect: 400 });
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: { action: 'confirm_office_return', carrier: 'driver', reason: 'Received at office' }, expect: 400 });
  assert.equal((await call(`/orders/${supportReturn.id}`, { token: admin.token })).status, 'returning', 'a refused confirmation changes nothing');
  const officeReturn = { action: 'confirm_office_return', carrier: 'captain', reason: 'Received at office' };
  const confirmedReturn = await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: officeReturn });
  assert.equal(Number(confirmedReturn.commission), 0, 'support-confirmed returns owe no commission, as code-confirmed returns (SRS DRV-17)');
  await call(`/admin/orders/${supportReturn.id}/resolve`, { token: admin.token, body: officeReturn, expect: 409 });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, 735 * 2);
  const officePay = 4 * Math.round(supportReturn.price * 100); // two attempts, return endpoint, then office
  assert.equal(cash.owedCents, 50 - returnPay - officePay);
  assert.deepEqual(tripEntries(cash, supportReturn).map(e => e.amountCents), [-officePay]);
  const earnings = await call('/driver/earnings', { token: driver.token });
  assert.equal(earnings.all.jobs, 4);
  assert.equal(earnings.all.tripPayCents, returnPay + officePay);
  // Staff, not the captain, brought an ordinary return to the office: the captain is paid the trip and the return leg only.
  let staffReturn = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  staffReturn = await call(`/jobs/${staffReturn.id}/accept`, { token: driver.token, body: {} });
  staffReturn = await advance(driver.token, await advance(driver.token, staffReturn));
  await call(`/orders/${staffReturn.id}/exception`, { token: driver.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'access_blocked' } });
  await call(`/admin/orders/${staffReturn.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Recipient unreachable' } });
  await call(`/admin/orders/${staffReturn.id}/resolve`, { token: admin.token, body: { action: 'confirm_office_return', carrier: 'staff', reason: 'Staff brought it to the office' } });
  const staffPay = 2 * Math.round(staffReturn.price * 100); // one attempt and the return leg, no office leg
  const carriers = await persistence.all("SELECT order_id, detail FROM security_events WHERE action = 'EXCEPTION_RESOLVED' AND order_id IN (?, ?) ORDER BY id", supportReturn.id, staffReturn.id);
  assert.deepEqual(carriers.map(r => JSON.parse(r.detail)).filter(d => d.handoff === 'office').map(d => d.carrier), ['captain', 'staff'], 'the audit records who carried the goods');
  assert.deepEqual(tripEntries(await call('/driver/cash', { token: driver.token }), staffReturn).map(e => e.amountCents), [-staffPay]);

  await checkCompletedReattempt({ call, persistence, input, driver, customer, admin });
  await checkPickupPay({ call, persistence, input, driver, other, customer, admin, liveWatcherCount });
  const creditBeforeCharge = (await call('/driver/cash', { token: driver.token })).owedCents;
  assert.ok(creditBeforeCharge < -100);
  const chargeInCredit = { driverId: driver.user.id, amountCents: 100, reason: 'Office fuel charge', intent: 'charge', requestId: randomUUID() };
  const charged = await call('/admin/cash/adjustment', { token: admin.token, body: chargeInCredit });
  assert.equal(charged.source, undefined);
  assert.deepEqual(await call('/admin/cash/adjustment', { token: admin.token, body: chargeInCredit }), charged);
  // Haiku r6 F3: the same request id with another reason is a conflict, not a replay of the old note.
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: { ...chargeInCredit, reason: 'Office fuel charge, corrected' }, expect: 409 })).error, 'idempotency_conflict');
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, creditBeforeCharge + 100);
  // Sol R10-H2: a cashier bundle older than the cash protocol (build 10105) cannot see this build's pending request ids,
  // so its fresh writes get the update screen; the current build writes; same-id replay still answers the old bundle.
  const withBuild = (build, body) => fetch(`${base}/admin/cash/adjustment`, { method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json', 'X-Wind-Client': build }, body: JSON.stringify(body) });
  const oldBundle = await withBuild('10104', { ...chargeInCredit, requestId: randomUUID() });
  assert.deepEqual([oldBundle.status, (await oldBundle.json()).error], [426, 'client_update_required']);
  assert.equal((await withBuild('10104', chargeInCredit)).status, 200, 'same-id replay answers an old bundle');
  const current = await withBuild('10105', { ...chargeInCredit, amountCents: 1, requestId: randomUUID() });
  assert.equal(current.status, 200);
  const remitOld = await fetch(`${base}/admin/cash/remittance`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}`,
    'Content-Type': 'application/json', 'X-Wind-Client': '10104' }, body: JSON.stringify({ driverId: driver.user.id, amountCents: 1, requestId: randomUUID() }) });
  assert.equal(remitOld.status, 426, 'remittances too: an old bundle cannot re-enter a pending handover under a new id');
  // Sol R25-M4: a current build cannot write a fresh handover or charge without a request id (a retry would write it twice).
  const unkeyedRemit = await fetch(`${base}/admin/cash/remittance`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}`,
    'Content-Type': 'application/json', 'X-Wind-Client': '10105' }, body: JSON.stringify({ driverId: driver.user.id, amountCents: 1 }) });
  assert.deepEqual([unkeyedRemit.status, (await unkeyedRemit.json()).error], [400, 'invalid_request_id']);
  const { requestId: _chargeId, ...unkeyedCharge } = chargeInCredit;
  const unkeyedChargeReply = await withBuild('10105', unkeyedCharge);
  assert.deepEqual([unkeyedChargeReply.status, (await unkeyedChargeReply.json()).error], [400, 'invalid_request_id']);
  assert.equal((await withBuild('10105', chargeInCredit)).status, 200, 'a keyed replay still answers the current build');
  // Haiku r6 F2: a payout names its reason like every adjustment.
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 50, intent: 'payout', reason: '', requestId: randomUUID() }, expect: 400 })).error, 'invalid_input');
  const oldForm = { driverId: driver.user.id, amountCents: 100, reason: 'Payout for receipt 12', requestId: randomUUID() };
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: oldForm, expect: 426 })).error, 'client_update_required');
  const { requestId: _id, ...noRequestId } = oldForm;
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: { ...noRequestId, intent: 'payout' }, expect: 400 })).error, 'payout_request_id_required');
  for (const language of ['ar', 'en']) {
    assert.ok(copy[language].err_payout_request_id_required);
    assert.ok(copy[language].err_client_update_required);
  }
  // A receipt saved without a source can still replay after the admin app update.
  const retained = { ...oldForm, amountCents: 1, requestId: randomUUID() };
  const retainedId = Number((await persistence.run(`INSERT INTO cash_entries
    (driver_id, kind, amount_cents, note, status, recorded_by, created_at, request_id)
    VALUES (?, 'adjustment', ?, ?, 'confirmed', ?, ?, ?)`, retained.driverId, retained.amountCents, retained.reason,
    admin.user.id, Date.now(), retained.requestId)).lastInsertRowid);
  const replay = await call('/admin/cash/adjustment', { token: admin.token, body: retained });
  assert.equal(replay.id, retainedId);
  assert.equal(replay.source, undefined);
  assert.deepEqual(await call(`/admin/cash/commands/${retained.requestId}`, { token: admin.token }), { entry: replay });

  const credit = (await call('/driver/cash', { token: driver.token })).owedCents;
  const payoutBody = { driverId: driver.user.id, intent: 'payout', amountCents: -credit, reason: 'Office paid trip earnings' };
  await call('/admin/cash/adjustment', { token: admin.token, body: { ...payoutBody, amountCents: -credit + 1, requestId: randomUUID() }, expect: 400 });
  const bodies = [admin, secondCashier].map(actor => ({ actor, body: { ...payoutBody, requestId: randomUUID() } }));
  const results = await Promise.all(bodies.map(({ actor, body }) => fetch(`${base}/admin/cash/adjustment`, {
    method: 'POST', headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  const winner = results.findIndex(result => result.status === 200);
  const payout = await results[winner].json();
  assert.equal(payout.source, 'payout');
  assert.equal(payout.note, payoutBody.reason);
  assert.match(payout.reference, /^P-/);
  assert.deepEqual(await call('/admin/cash/adjustment', { token: bodies[winner].actor.token, body: bodies[winner].body }), payout);
  // Haiku r8 N7: a payout resent under its id with another reason is a different request too.
  assert.equal((await call('/admin/cash/adjustment', { token: bodies[winner].actor.token, body: { ...bodies[winner].body, reason: 'Office paid trip earnings, corrected' }, expect: 409 })).error, 'idempotency_conflict');
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  const stale = { ...payoutBody, requestId: randomUUID() };
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: stale, expect: 400 })).error, 'invalid_amount');
  assert.equal((await call('/admin/cash/adjustment', { token: admin.token, body: { ...oldForm, requestId: randomUUID() }, expect: 426 })).error, 'client_update_required');
  const { intent: _intent, ...withAlias } = bodies[winner].body;
  assert.deepEqual(await call('/admin/cash/adjustment', { token: bodies[winner].actor.token, body: { ...withAlias, source: 'payout' } }), payout);
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
  const door = db.prepare('SELECT door_expected_cents, door_collected_by, door_request_id FROM orders WHERE id = ?').get(promoted.id);
  assert.equal(door.door_expected_cents, 4400, 'the record names the expected amount after the discount');
  assert.equal(door.door_collected_by, other.user.id, 'the record names the collecting driver');
  assert.equal(door.door_request_id, doneRequest, 'the record names the replay identity of the advance');
  // A11 write-once: after collection none of the five door columns can change, on any path.
  for (const [column, value] of [['collected_cents', 1], ['variance_reason', 'INCORRECT_CASH'], ['door_expected_cents', 1],
    ['door_collected_by', customer.user.id], ['door_request_id', randomUUID()]])
    assert.throws(() => db.prepare(`UPDATE orders SET ${column} = ? WHERE id = ?`).run(value, promoted.id), /door cash is write-once/, column);
  db.prepare('UPDATE orders SET updated_at = updated_at WHERE id = ?').run(promoted.id); // other columns stay writable

  // An adjustment has no reference; its receipt still names the entry for the admin who recorded it.
  const fresh = await call('/auth/register', { body: { phone: '0599300019', name: 'Nour', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${fresh.user.id}/approve`, { token: admin.token, body: {} });
  const adjusted = { driverId: fresh.user.id, amountCents: 200, intent: 'charge', reason: 'Fuel advance correction', requestId: randomUUID() };
  const adjustment = await call('/admin/cash/adjustment', { token: admin.token, body: adjusted });
  const adjustmentReceipt = (await call(`/admin/cash/commands/${adjusted.requestId}`, { token: admin.token, method: 'GET' })).entry;
  assert.deepEqual([adjustmentReceipt.id, adjustmentReceipt.kind, adjustmentReceipt.reference], [adjustment.id, 'adjustment', null]);
  console.log('cash: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
