// Driver cash settlement (SPEC-cash-settlement.md): commission owed, confirmed handovers, adjustments.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings as standard, quote } from '../src/model.ts';
// The ledger maths below were written for a ₪49 parcel; the admin tariff is set to match (SPEC-parcel-standard.md).
const defaultSettings = { ...standard, parcelPrice: 49 };

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-cash-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599300001', name: 'Cashier', password: 'secret1' } });
  promote('0599300001');
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
  assert.deepEqual((await call('/driver/cash', { token: driver.token })), { owedCents: 0, pendingCents: 0, commissionCents: 0, discountsCents: 0, remittedCents: 0, adjustmentsCents: 0, entries: [] });
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

  const wrong = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: 300 } });
  await call(`/driver/cash/${wrong.id}/confirm`, { token: driver.token, body: { decision: 'dispute' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.owedCents, commissionCents - 500); // disputed never counts
  assert.equal(cash.pendingCents, 0);

  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 200, reason: 'x' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 0, reason: 'Nothing at all' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1_000_001, reason: 'Too much money' }, expect: 400 });
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -200, reason: 'Customer paid by mistake to office' } });
  cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.adjustmentsCents, -200);
  assert.equal(cash.owedCents, commissionCents - 700);
  assert.deepEqual(cash.entries.map(e => [e.kind, e.status]), [['adjustment', 'confirmed'], ['remittance', 'disputed'], ['remittance', 'confirmed']]);

  const list = await call('/admin/cash', { token: admin.token });
  assert.deepEqual(list.map(r => r.driverId), [driver.user.id, other.user.id]); // highest debt first
  assert.equal(list[0].owedCents, commissionCents - 700);
  assert.ok(list[0].lastRemittanceAt > 0);
  assert.equal(list[1].owedCents, 0);

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
  const open = cash.owedCents;
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -(open + 1), reason: 'Would become a payout' }, expect: 400 });
  await call('/me/delete', { token: driver.token, body: {}, expect: 409 });
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { role: 'customer' }, expect: 409 });
  const { db } = await import('../server/main.ts');
  assert.throws(() => db.prepare('DELETE FROM cash_entries').run(), /append-only/);
  assert.throws(() => db.prepare("UPDATE cash_entries SET amount_cents = 1 WHERE kind = 'adjustment'").run(), /append-only/);
  const settle = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: open } });
  await call(`/driver/cash/${settle.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  await call('/me/delete', { token: driver.token, body: {} }); // settled drivers may leave

  console.log('cash: ok');
} finally {
  server.close();
}
