import { needStaff, staffActor } from './ops.ts';
import { randomUUID } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; params: string[] };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>) => unknown;
type Entry = { accountId: number; debitMinor?: number; creditMinor?: number };
type Journal = { businessRef: string; kind: string; entries: Entry[]; currency?: string; orderId?: number | null; cashEntryId?: number | null; actorId?: number | null; reason?: string | null; rateBps?: number | null; reversesJournalId?: string | null };

export const PROJECTED_CASH_CAP_MINOR = 100000;
export function ledgerConfig() { return { projectedCashCapMinor: PROJECTED_CASH_CAP_MINOR, cashCapActivated: false }; }
export async function ledgerAvailable(db: Persistence) {
  if (db.backend !== 'postgres') return false;
  const tables = await db.one("SELECT to_regclass('ledger_accounts') AS accounts, to_regclass('schema_migrations') AS migrations");
  return !!(tables?.accounts && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=16'));
}

export class Ledger {
  private db: Persistence;
  private fail: Fail;
  private config: { projectedCashCapMinor: number; cashCapActivated: boolean };
  constructor(db: Persistence, fail: Fail, config = ledgerConfig()) { this.db = db; this.fail = fail; this.config = config; }
  private async gate() { if (!(await ledgerAvailable(this.db))) this.fail(409, 'ledger_unavailable'); }
  private async tx<T>(work: () => Promise<T>): Promise<T> {
    return this.db.scope(async () => {
      if (this.db.inTransaction) return work();
      await this.db.exec('BEGIN');
      try { const result = await work(); await this.db.exec('COMMIT'); return result; }
      catch (error) { if (this.db.inTransaction) await this.db.exec('ROLLBACK'); throw error; }
    });
  }
  async ensureAccount(code: string, kind: string, ownerId: number | null) {
    await this.db.run('INSERT INTO ledger_accounts(code,kind,owner_id,created_at) VALUES(?,?,?,?) ON CONFLICT(code) DO NOTHING', code, kind, ownerId, Date.now());
    const row = (await this.db.one('SELECT * FROM ledger_accounts WHERE code=?', code))!;
    if (row.kind !== kind || row.owner_id !== ownerId) this.fail(409, 'account_conflict');
    return row;
  }
  async postJournal(input: Journal): Promise<Row> {
    await this.gate();
    if (!input.businessRef || !input.kind || (input.currency ?? 'ILS') !== 'ILS' || !Array.isArray(input.entries) || input.entries.length < 2) this.fail(400, 'invalid_journal');
    let debits = 0, credits = 0;
    for (const e of input.entries) {
      const d = e.debitMinor ?? 0, c = e.creditMinor ?? 0;
      if (!Number.isSafeInteger(e.accountId) || e.accountId < 1 || !Number.isSafeInteger(d) || !Number.isSafeInteger(c) || d < 0 || c < 0 || (d > 0) === (c > 0)) this.fail(400, 'invalid_journal');
      debits += d; credits += c;
    }
    if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits) || debits === 0 || debits !== credits) this.fail(400, 'invalid_journal');
    return this.tx(async () => {
      const id = randomUUID();
      const created = await this.db.one(`INSERT INTO ledger_journals(id,business_ref,kind,currency,order_id,cash_entry_id,actor_id,reason,rate_bps,reverses_journal_id,created_at)
        VALUES(?::uuid,?,?,?,?,?,?,?,?,?::uuid,?) ON CONFLICT(business_ref) DO NOTHING RETURNING *`, id, input.businessRef, input.kind, input.currency ?? 'ILS', input.orderId ?? null, input.cashEntryId ?? null, input.actorId ?? null, input.reason ?? null, input.rateBps ?? null, input.reversesJournalId ?? null, Date.now());
      if (!created) {
        const prior = (await this.db.one('SELECT * FROM ledger_journals WHERE business_ref=?', input.businessRef))!;
        const lines = await this.db.all('SELECT account_id,debit_minor,credit_minor FROM ledger_entries WHERE journal_id=?::uuid ORDER BY id', prior.id);
        const norm = (list: number[][]) => JSON.stringify(list.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!));
        const same = prior.kind === input.kind && prior.currency === (input.currency ?? 'ILS') && prior.order_id === (input.orderId ?? null) && prior.cash_entry_id === (input.cashEntryId ?? null) && prior.actor_id === (input.actorId ?? null) && prior.reason === (input.reason ?? null) && prior.rate_bps === (input.rateBps ?? null) && prior.reverses_journal_id === (input.reversesJournalId ?? null) && norm(lines.map(e => [Number(e.account_id), Number(e.debit_minor), Number(e.credit_minor)])) === norm(input.entries.map(e => [e.accountId, e.debitMinor ?? 0, e.creditMinor ?? 0]));
        if (!same) this.fail(409, 'idempotency_conflict');
        return prior;
      }
      for (const e of input.entries) await this.db.run('INSERT INTO ledger_entries(journal_id,account_id,debit_minor,credit_minor) VALUES(?::uuid,?,?,?)', id, e.accountId, e.debitMinor ?? 0, e.creditMinor ?? 0);
      return created;
    });
  }
  async importLegacy(actor: Actor) {
    await this.gate(); needStaff(await staffActor(this.db, actor), this.fail, 'finance');
    return this.tx(async () => {
      const revenue = await this.ensureAccount('platform:revenue', 'platform_revenue', null);
      const promo = await this.ensureAccount('platform:promo_expense', 'promo_expense', null);
      const clearing = await this.ensureAccount('platform:provider_clearing', 'provider_clearing', null);
      let journals = 0;
      const post = async (input: Journal) => { const exists = await this.db.one('SELECT id FROM ledger_journals WHERE business_ref=?', input.businessRef); await this.postJournal(input); if (!exists) journals++; };
      const orders = await this.db.all("SELECT * FROM orders WHERE driver_id IS NOT NULL AND status IN ('completed','returned') ORDER BY id");
      for (const order of orders) {
        const receivable = await this.ensureAccount(`driver:${order.driver_id}:receivable`, 'driver_receivable', Number(order.driver_id));
        const commission = Number(order.commission_minor ?? 0), discount = Number(order.discount_minor ?? 0);
        if (commission > 0) await post({ businessRef: `order:${order.id}:commission`, kind: 'commission_accrual', orderId: Number(order.id), entries: [{ accountId: receivable.id, debitMinor: commission }, { accountId: revenue.id, creditMinor: commission }] });
        if (discount > 0) await post({ businessRef: `order:${order.id}:discount`, kind: 'discount_funding', orderId: Number(order.id), entries: [{ accountId: promo.id, debitMinor: discount }, { accountId: receivable.id, creditMinor: discount }] });
      }
      const cash = await this.db.all("SELECT * FROM cash_entries WHERE kind='adjustment' OR (kind='remittance' AND status='confirmed') ORDER BY id");
      for (const entry of cash) {
        const amount = Number(entry.amount_cents); if (!amount) continue;
        const receivable = await this.ensureAccount(`driver:${entry.driver_id}:receivable`, 'driver_receivable', Number(entry.driver_id));
        const other = entry.kind === 'remittance' ? clearing : revenue;
        // Sign-aware: a negative remittance reverses a confirmed handover (Dr receivable), a negative adjustment relieves it (Cr receivable).
        const debitReceivable = entry.kind === 'adjustment' ? amount > 0 : amount < 0;
        const n = Math.abs(amount);
        await post({ businessRef: `cash-entry:${entry.id}`, kind: entry.kind === 'remittance' ? 'cash_remittance' : 'cash_adjustment', cashEntryId: Number(entry.id), entries: debitReceivable ? [{ accountId: receivable.id, debitMinor: n }, { accountId: other.id, creditMinor: n }] : [{ accountId: other.id, debitMinor: n }, { accountId: receivable.id, creditMinor: n }] });
      }
      return { journals, orders: orders.length, cashEntries: cash.length };
    });
  }
  async driverBalance(driverId: number) {
    await this.gate();
    const row = await this.db.one("SELECT COALESCE(sum(e.debit_minor-e.credit_minor),0) AS balance FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id WHERE a.kind='driver_receivable' AND a.owner_id=?", driverId);
    return Number(row!.balance);
  }
  async adminBalances(actor: Actor) {
    await this.gate(); needStaff(await staffActor(this.db, actor), this.fail, 'finance');
    const rows = await this.db.all('SELECT a.id,a.code,a.kind,a.owner_id,COALESCE(sum(e.debit_minor-e.credit_minor),0) AS balance_minor FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id=a.id GROUP BY a.id ORDER BY a.code');
    return rows;
  }
  async projectedExposure(driverId: number, proposedCommissionMinor = 0) {
    if (!Number.isSafeInteger(proposedCommissionMinor) || proposedCommissionMinor < 0) this.fail(400, 'invalid_amount');
    const active = await this.db.one("SELECT COALESCE(sum(commission_minor),0) AS amount FROM orders WHERE driver_id=? AND status IN ('assigned','at_pickup','in_transit','on_hold','returning')", driverId);
    const total = await this.driverBalance(driverId) + Number(active!.amount) + proposedCommissionMinor;
    if (!Number.isSafeInteger(total)) this.fail(400, 'invalid_amount');
    return total;
  }
  async guardAcceptance(driverId: number, proposedCommissionMinor = 0) {
    await this.gate();
    if (this.config.cashCapActivated && !this.db.inTransaction) throw new Error('Cash cap requires the acceptance transaction');
    if (this.config.cashCapActivated) await this.db.one('SELECT id FROM users WHERE id=? FOR UPDATE', driverId);
    const exposure = await this.projectedExposure(driverId, proposedCommissionMinor);
    if (this.config.cashCapActivated && exposure > this.config.projectedCashCapMinor) this.fail(409, 'cash_cap_exceeded');
    return exposure;
  }
  private async order(actor: Actor, orderId: number, lock = false) {
    const order = (await this.db.one(`SELECT * FROM orders WHERE id=?${lock ? ' FOR UPDATE' : ''}`, orderId)) ?? this.fail(404, 'not_found');
    if (actor.role !== 'admin' && actor.id !== Number(order.customer_id) && actor.id !== Number(order.driver_id)) this.fail(403, 'forbidden');
    return order;
  }
  private receipt(row: Row) { return { id: Number(row.id), orderId: Number(row.order_id), driverId: Number(row.driver_id), customerId: Number(row.customer_id), dueMinor: Number(row.due_minor), collectedMinor: row.collected_minor === null ? null : Number(row.collected_minor), collectorId: row.collector_id === null ? null : Number(row.collector_id), receiptRef: row.receipt_ref, currency: row.currency, status: row.status }; }
  async createReceipt(actor: Actor, orderId: number) {
    await this.gate(); return this.tx(async () => {
      const order = await this.order(actor, orderId, true);
      if (actor.role !== 'admin' && (actor.role !== 'driver' || actor.id !== Number(order.driver_id))) this.fail(403, 'forbidden');
      if (order.driver_id == null || !Number.isSafeInteger(order.price_minor) || order.price_minor <= 0) this.fail(409, 'receipt_unavailable');
      if (['searching', 'cancelled'].includes(order.status)) this.fail(409, 'receipt_unavailable');
      const dueMinor = order.price_minor - Number(order.discount_minor ?? 0);
      if (!Number.isSafeInteger(dueMinor) || dueMinor <= 0) this.fail(409, 'receipt_unavailable');
      const created = await this.db.one("INSERT INTO cash_receipts(order_id,driver_id,customer_id,due_minor,receipt_ref,status,created_at) VALUES(?,?,?,?,?,'due',?) ON CONFLICT(order_id) DO NOTHING RETURNING *", orderId, order.driver_id, order.customer_id, dueMinor, `CR-${orderId}`, Date.now());
      if (created) await this.db.run("INSERT INTO cash_receipt_events(receipt_id,action,actor_id,created_at) VALUES(?,'recorded',?,?)", created.id, actor.id, Date.now());
      if (created) return this.receipt(created);
      const existing = (await this.db.one('SELECT * FROM cash_receipts WHERE order_id=?', orderId))!;
      if (Number(existing.driver_id) === Number(order.driver_id) && Number(existing.due_minor) === dueMinor) return this.receipt(existing);
      // Reassigned before anything was collected: the receipt follows the current driver and fare.
      if (existing.status !== 'due' || Number(existing.collected_minor ?? 0) !== 0) this.fail(409, 'receipt_unavailable');
      await this.db.run('UPDATE cash_receipts SET driver_id=?,customer_id=?,due_minor=? WHERE id=?', order.driver_id, order.customer_id, dueMinor, existing.id);
      return this.receipt((await this.db.one('SELECT * FROM cash_receipts WHERE id=?', existing.id))!);
    });
  }
  async getReceipt(actor: Actor, orderId: number) { await this.gate(); await this.order(actor, orderId); const row = await this.db.one('SELECT * FROM cash_receipts WHERE order_id=?', orderId); return row ? this.receipt(row) : null; }
  async collect(actor: Actor, orderId: number, body: Row) {
    await this.gate(); return this.tx(async () => {
      const order = await this.order(actor, orderId, true);
      if (actor.role !== 'admin' && (actor.role !== 'driver' || actor.id !== Number(order.driver_id))) this.fail(403, 'forbidden');
      if (body?.action === 'return') {
        if (Object.keys(body).some(k => k !== 'action')) this.fail(400, 'invalid_input');
        const receipt = (await this.db.one('SELECT * FROM cash_receipts WHERE order_id=? FOR UPDATE', orderId)) ?? this.fail(404, 'not_found');
        if (!['partial', 'collected'].includes(receipt.status)) this.fail(409, 'receipt_unavailable');
        await this.db.run("UPDATE cash_receipts SET status='returned' WHERE id=?", receipt.id);
        await this.db.run("INSERT INTO cash_receipt_events(receipt_id,action,actor_id,amount_minor,created_at) VALUES(?,'returned',?,?,?)", receipt.id, actor.id, receipt.collected_minor, Date.now());
        return this.receipt((await this.db.one('SELECT * FROM cash_receipts WHERE id=?', receipt.id))!);
      }
      if (!body || Object.keys(body).some(k => !['amountMinor', 'collectorId'].includes(k)) || (body.collectorId !== undefined && body.collectorId !== actor.id) || !Number.isSafeInteger(body.amountMinor) || body.amountMinor <= 0) this.fail(400, 'invalid_amount');
      const row = (await this.db.one('SELECT * FROM cash_receipts WHERE order_id=? FOR UPDATE', orderId)) ?? this.fail(404, 'not_found');
      if (!['due','partial'].includes(row.status)) this.fail(409, 'receipt_unavailable');
      const total = Number(row.collected_minor ?? 0) + body.amountMinor;
      if (!Number.isSafeInteger(total) || total > Number(row.due_minor)) this.fail(400, 'invalid_amount');
      const status = total === Number(row.due_minor) ? 'collected' : 'partial';
      await this.db.run('UPDATE cash_receipts SET collected_minor=?,collector_id=?,collected_at=?,status=? WHERE id=?', total, actor.id, Date.now(), status, row.id);
      await this.db.run('INSERT INTO cash_receipt_events(receipt_id,action,actor_id,amount_minor,created_at) VALUES(?,?,?,?,?)', row.id, status, actor.id, body.amountMinor, Date.now());
      return this.receipt((await this.db.one('SELECT * FROM cash_receipts WHERE id=?', row.id))!);
    });
  }
  async driverLedger(actor: Actor) { await this.gate(); if (actor.role !== 'driver') this.fail(403, 'forbidden'); return { balanceMinor: await this.driverBalance(actor.id) }; }
}
export function registerLedgerRoutes(route: Register, service: Ledger) {
  route('POST', '/api/orders/:id/cash-receipt', ctx => service.createReceipt(ctx.user, Number(ctx.params[0])));
  route('GET', '/api/orders/:id/cash-receipt', ctx => service.getReceipt(ctx.user, Number(ctx.params[0])));
  route('POST', '/api/orders/:id/cash-receipt/collect', ctx => service.collect(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/admin/ledger/import', ctx => service.importLegacy(ctx.user));
  route('GET', '/api/admin/ledger', ctx => service.adminBalances(ctx.user));
  route('GET', '/api/driver/ledger', ctx => service.driverLedger(ctx.user));
}
