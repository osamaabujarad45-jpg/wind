import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
import { Ledger } from '../server/domain/ledger.ts';
import { NON_LEGACY_TABLES } from '../server/migrate.ts';

const f = await fixture('ledger');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const ledger = new Ledger(f.db, fail);
try {
  assert.equal((await f.db.one('SELECT version FROM schema_migrations WHERE version=16')).version, 16);
  for (const table of ['ledger_accounts','ledger_journals','ledger_entries','cash_receipts','cash_receipt_events']) assert.ok(NON_LEGACY_TABLES.has(table));
  const revenue = await ledger.ensureAccount('platform:revenue', 'platform_revenue', null);
  const recv = await ledger.ensureAccount(`driver:${f.d1.user.id}:receivable`, 'driver_receivable', f.d1.user.id);
  const input = { businessRef: 'test:balanced', kind: 'commission_accrual', entries: [{ accountId: recv.id, debitMinor: 100 }, { accountId: revenue.id, creditMinor: 100 }] };
  await assert.rejects(ledger.postJournal({ ...input, currency: 'USD' }), e => e.status === 400);
  await assert.rejects(ledger.postJournal({ ...input, entries: [{ accountId: recv.id, debitMinor: 1 }] }), e => e.status === 400);
  await assert.rejects(ledger.postJournal({ ...input, entries: [{ accountId: recv.id, debitMinor: 1, creditMinor: 1 }, { accountId: revenue.id, creditMinor: 1 }] }), e => e.status === 400);
  const journal = await ledger.postJournal(input);
  assert.equal((await ledger.postJournal(input)).id, journal.id);
  await assert.rejects(ledger.postJournal({ ...input, kind: 'cash_remittance' }), e => e.status === 409);
  await assert.rejects(ledger.postJournal({ ...input, entries: [{ accountId: recv.id, debitMinor: 200 }, { accountId: revenue.id, creditMinor: 200 }] }), e => e.status === 409);
  await assert.rejects(f.db.transaction(async () => {
    const id = randomUUID(); await f.db.run("INSERT INTO ledger_journals(id,business_ref,kind,created_at) VALUES(?::uuid,?,'commission_accrual',?)", id, `bad:${id}`, Date.now());
    await f.db.run('INSERT INTO ledger_entries(journal_id,account_id,debit_minor) VALUES(?::uuid,?,?)', id, recv.id, 12);
  }, { commandId: 'invalid' }), e => e.code === '23514');
  await assert.rejects(f.db.transaction(async () => {
    const id = randomUUID(); await f.db.run("INSERT INTO ledger_journals(id,business_ref,kind,created_at) VALUES(?::uuid,?,'commission_accrual',?)", id, `empty:${id}`, Date.now());
  }, { commandId: 'empty' }), e => e.code === '23514');
  const line = await f.db.one('SELECT id FROM ledger_entries WHERE journal_id=?::uuid LIMIT 1', journal.id);
  await assert.rejects(f.db.run('DELETE FROM ledger_entries WHERE id=?', line.id));
  await assert.rejects(f.db.run('UPDATE ledger_accounts SET code=? WHERE id=?', 'changed', recv.id));
  await assert.rejects(f.db.run('UPDATE ledger_journals SET reason=? WHERE id=?::uuid', 'x', journal.id));
  await assert.rejects(f.db.run('DELETE FROM ledger_journals WHERE id=?::uuid', journal.id));
  const order = await f.book();
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at,commission=10,discount=2 WHERE id=?", f.d1.user.id, order.id);
  const now = Date.now();
  await f.db.run("INSERT INTO cash_entries(driver_id,kind,amount_cents,note,status,recorded_by,created_at) VALUES(?,'remittance',300,'synthetic','confirmed',?,?)", f.d1.user.id, f.admin.user.id, now);
  await f.db.run("INSERT INTO cash_entries(driver_id,kind,amount_cents,note,status,recorded_by,created_at) VALUES(?,'adjustment',-50,'synthetic','confirmed',?,?)", f.d1.user.id, f.admin.user.id, now);
  await f.db.run("INSERT INTO cash_entries(driver_id,kind,amount_cents,note,status,recorded_by,created_at) VALUES(?,'remittance',40,'synthetic','pending',?,?)", f.d1.user.id, f.admin.user.id, now);
  const first = await ledger.importLegacy({ ...f.admin.user, status: 'active' }); assert.equal(first.journals, 4);
  assert.equal((await ledger.importLegacy({ ...f.admin.user, status: 'active' })).journals, 0);
  assert.equal(await ledger.driverBalance(f.d1.user.id) - 100, 1000 - 200 - 300 - 50);
  const linesOf = async ref => (await f.db.all("SELECT a.code,e.debit_minor,e.credit_minor FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id JOIN ledger_journals j ON j.id=e.journal_id WHERE j.business_ref=? ORDER BY a.code", ref)).map(l => [l.code, Number(l.debit_minor), Number(l.credit_minor)]);
  const recvCode = `driver:${f.d1.user.id}:receivable`;
  assert.deepEqual(await linesOf(`order:${order.id}:commission`), [[recvCode, 1000, 0], ['platform:revenue', 0, 1000]]);
  assert.deepEqual(await linesOf(`order:${order.id}:discount`), [[recvCode, 0, 200], ['platform:promo_expense', 200, 0]]);
  const remId = (await f.db.one("SELECT id FROM cash_entries WHERE driver_id=? AND kind='remittance' AND amount_cents=300", f.d1.user.id)).id;
  assert.deepEqual(await linesOf(`cash-entry:${remId}`), [[recvCode, 0, 300], ['platform:provider_clearing', 300, 0]]);
  const adjId = (await f.db.one("SELECT id FROM cash_entries WHERE driver_id=? AND kind='adjustment' AND amount_cents=-50", f.d1.user.id)).id;
  assert.deepEqual(await linesOf(`cash-entry:${adjId}`), [[recvCode, 0, 50], ['platform:revenue', 50, 0]]);
  await f.call(`/orders/${order.id}/cash-receipt`, { token: f.d2.token, expect: 403 });
  const created = await f.call(`/orders/${order.id}/cash-receipt`, { token: f.d1.token, body: {} });
  assert.ok(created.dueMinor > 1);
  assert.equal((await f.call(`/orders/${order.id}/cash-receipt/collect`, { token: f.d1.token, body: { amountMinor: 1 } })).status, 'partial');
  assert.equal((await f.call(`/orders/${order.id}/cash-receipt/collect`, { token: f.d1.token, body: { amountMinor: created.dueMinor }, expect: 400 })).error, 'invalid_amount');
  assert.equal((await f.call(`/orders/${order.id}/cash-receipt/collect`, { token: f.d1.token, body: { amountMinor: created.dueMinor - 1 } })).status, 'collected');
  assert.equal((await f.call(`/orders/${order.id}/cash-receipt/collect`, { token: f.d1.token, body: { action: 'return' } })).status, 'returned');
  assert.equal((await f.call(`/orders/${order.id}/cash-receipt`, { token: f.customer.token })).status, 'returned');
  assert.equal((await f.call('/driver/ledger', { token: f.d1.token })).balanceMinor, await ledger.driverBalance(f.d1.user.id));
  assert.ok(Array.isArray(await f.call('/admin/ledger', { token: f.admin.token })));
  assert.equal((await f.call('/admin/ledger/import', { token: f.admin.token, body: {} })).journals, 0);
  assert.equal(await ledger.guardAcceptance(f.d1.user.id, 200000), await ledger.driverBalance(f.d1.user.id) + 200000);
  const enabled = new Ledger(f.db, fail, { cashCapActivated: true, projectedCashCapMinor: 100000 });
  await assert.rejects(f.db.transaction(() => enabled.guardAcceptance(f.d1.user.id, 200000), { commandId: 'cap' }), e => e.status === 409);
  // Review regressions: reordered replay is the same journal; a negative confirmed remittance reverses direction; a zero-price order has no receipt.
  assert.equal((await ledger.postJournal({ ...input, entries: [...input.entries].reverse() })).id, journal.id);
  const beforeNeg = await ledger.driverBalance(f.d1.user.id);
  await f.db.run("INSERT INTO cash_entries(driver_id,kind,amount_cents,note,status,recorded_by,created_at) VALUES(?,'remittance',-40,'synthetic reversal','confirmed',?,?)", f.d1.user.id, f.admin.user.id, now);
  assert.equal((await ledger.importLegacy({ ...f.admin.user, status: 'active' })).journals, 1);
  assert.equal(await ledger.driverBalance(f.d1.user.id), beforeNeg + 40);
  const negEntry = await f.db.one("SELECT id FROM cash_entries WHERE driver_id=? AND amount_cents=-40 ORDER BY id DESC LIMIT 1", f.d1.user.id);
  const negLines = await f.db.all("SELECT a.code,a.kind,e.debit_minor,e.credit_minor FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id JOIN ledger_journals j ON j.id=e.journal_id WHERE j.business_ref=? ORDER BY a.code", `cash-entry:${negEntry.id}`);
  assert.deepEqual(negLines.map(l => [l.code, Number(l.debit_minor), Number(l.credit_minor)]), [[`driver:${f.d1.user.id}:receivable`, 40, 0], ['platform:provider_clearing', 0, 40]]);
  const free = await f.book();
  await f.db.run("UPDATE orders SET driver_id=?,status='completed',completed_at=created_at,price=0,commission=0,discount=0 WHERE id=?", f.d1.user.id, free.id);
  await assert.rejects(ledger.createReceipt({ ...f.d1.user, status: 'active' }, free.id), e => e.status === 409);
  console.log('WP13 ledger: migration, balance constraints, replay, import reconciliation, receipts and cap passed');
} finally { await f.close(); }


