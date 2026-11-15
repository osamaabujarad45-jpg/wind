// WP03: original legacy assertions; async PG setup/fixture hooks only.
import {freshPostgres,selectRuntime,connect,schemaName} from './pg-support.mjs';
import {initializePostgres} from '../server/db/postgres-schema.ts';
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
  // Resolution metadata is allowed only on a pending decision; amount and all other fields stay immutable.
  const adminConfirmed = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: 1, note: 'PG admin resolution' } });
  const confirmed = await call(`/admin/cash/${adminConfirmed.id}/resolve`, { token: admin.token,
    body: { decision: 'confirm', reason: 'Office counted the isolated envelope', evidenceRef: 'PG-SAFE-001' } });
  assert.equal(confirmed.status, 'confirmed');
  const confirmedRow = await persistence.one('SELECT resolved_by,resolution_note FROM cash_entries WHERE id=?', adminConfirmed.id);
  assert.equal(confirmedRow.resolved_by, admin.user.id);
  assert.ok(confirmedRow.resolution_note.includes('Office counted') && confirmedRow.resolution_note.includes('PG-SAFE-001'));
  await call(`/admin/cash/${adminConfirmed.id}/resolve`, { token: admin.token,
    body: { decision: 'dispute', reason: 'Double tap must not repeat' }, expect: 409 });
  const adminDisputed = await persistence.one('INSERT INTO cash_entries(driver_id,kind,amount_cents,note,status,recorded_by,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id',
    driver.user.id, 'remittance', 1, 'PG admin dispute', 'pending', admin.user.id, Date.now());
  const disputed = await call(`/admin/cash/${adminDisputed.id}/resolve`, { token: admin.token,
    body: { decision: 'dispute', reason: 'Driver evidence conflicts with office count', evidenceRef: 'PG-SAFE-002' } });
  assert.equal(disputed.status, 'disputed');
  const disputedRow = await persistence.one('SELECT resolved_by,resolution_note FROM cash_entries WHERE id=?', adminDisputed.id);
  assert.equal(disputedRow.resolved_by, admin.user.id);
  assert.ok(disputedRow.resolution_note.includes('conflicts') && disputedRow.resolution_note.includes('PG-SAFE-002'));
  await assert.rejects(persistence.run('UPDATE cash_entries SET amount_cents = 999 WHERE id = ?', adminConfirmed.id), /append-only/);
  const settleAmount = (await call('/driver/cash', { token: driver.token })).owedCents;
  const settle = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: driver.user.id, amountCents: settleAmount } });
  await call(`/driver/cash/${settle.id}/confirm`, { token: driver.token, body: { decision: 'confirm' } });
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  await call('/me/delete', { token: driver.token, body: { password: 'secret1' } }); // settled drivers may leave

  // Existing schemas keep migration markers 3–29: a fresh-schema-only guard fix would never reach them.
  const upgradeSchema = schemaName('cash_up');
  const upgrade = connect(upgradeSchema);
  try {
    await upgrade.run(`CREATE SCHEMA ${upgradeSchema}`);
    await upgrade.run(`SET search_path TO ${upgradeSchema},public`);
    await upgrade.run('CREATE TABLE schema_migrations(version BIGINT PRIMARY KEY, applied_at BIGINT NOT NULL)');
    await upgrade.run('CREATE TABLE users(id BIGINT PRIMARY KEY)');
    // Migrated schemas also carry the shared append-only guard from migration 6; migration 32 references it.
    await upgrade.run("CREATE FUNCTION wp05_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'record is append-only' USING ERRCODE='23514'; END $$");
    await upgrade.run(`CREATE TABLE orders(
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, driver_id BIGINT, service TEXT NOT NULL,
      status TEXT NOT NULL, price_minor BIGINT NOT NULL DEFAULT 0, discount_minor BIGINT DEFAULT 0)`);
    await upgrade.run('CREATE TABLE quotes(service TEXT NOT NULL)');
    await upgrade.run(`CREATE TABLE cash_entries(
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, driver_id BIGINT NOT NULL,
      kind TEXT NOT NULL, amount_cents BIGINT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
      recorded_by BIGINT NOT NULL, created_at BIGINT NOT NULL, decided_at BIGINT,
      resolved_by BIGINT, resolution_note TEXT)`);
    await upgrade.run(`CREATE FUNCTION immutable_cash() RETURNS trigger LANGUAGE plpgsql AS $old$
    BEGIN
      IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514'; END IF;
      IF OLD.status <> 'pending' OR OLD.kind <> 'remittance' OR NEW.status NOT IN ('confirmed','disputed')
        OR NEW.decided_at IS NULL OR (to_jsonb(NEW) - 'status' - 'decided_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at') THEN
        RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $old$`);
    await upgrade.run('CREATE TRIGGER cash_entries_immutable BEFORE UPDATE OR DELETE ON cash_entries FOR EACH ROW EXECUTE FUNCTION immutable_cash()');
    for (const version of [...Array.from({ length: 21 }, (_, i) => i + 3), ...Array.from({ length: 5 }, (_, i) => i + 25)])
      await upgrade.run('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)', version, Date.now());
    await upgrade.run("INSERT INTO cash_entries(driver_id,kind,amount_cents,note,status,recorded_by,created_at) VALUES(1,'remittance',1,'legacy','pending',7,1)");
    await initializePostgres(upgrade, upgradeSchema);
    assert.ok(await upgrade.one('SELECT version FROM schema_migrations WHERE version = 30'), 'the forward guard repair migration is recorded');
    assert.ok(await upgrade.one('SELECT version FROM schema_migrations WHERE version = 31'), 'the additive parcel-priority migration follows the guard repair');
    await upgrade.run("UPDATE cash_entries SET status='confirmed', decided_at=?, resolved_by=?, resolution_note=? WHERE id=1",
      Date.now(), 7, 'Office counted');
    const resolved = await upgrade.one('SELECT status,resolved_by,resolution_note FROM cash_entries WHERE id=1');
    assert.equal(resolved.status, 'confirmed');
    assert.equal(Number(resolved.resolved_by), 7);
    assert.equal(resolved.resolution_note, 'Office counted');
    await assert.rejects(upgrade.run("UPDATE cash_entries SET status='disputed', decided_at=? WHERE id=1", Date.now()), /append-only/);
    await assert.rejects(upgrade.run('UPDATE cash_entries SET amount_cents=999 WHERE id=1'), /append-only/);
    console.log('cash guard upgrade: old marked schema resolves once; amounts and repeat decisions stay immutable');
  } finally {
    await upgrade.run(`DROP SCHEMA IF EXISTS ${upgradeSchema} CASCADE`).catch(() => {});
    await upgrade.close();
  }

  console.log('cash: ok');
} finally {
  await shutdown();

}
