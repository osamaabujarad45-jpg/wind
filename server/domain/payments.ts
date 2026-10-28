import { needStaff, staffActor } from './ops.ts';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Persistence, Row } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; params: string[]; req: IncomingMessage };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>, isPublic?: boolean) => unknown;
type Outcome = 'pending' | 'captured' | 'failed' | 'voided' | 'timeout';
type Result = { outcome: Outcome; providerRef: string };
export interface PaymentsProvider {
  create(id: string, amountMinor: number): Promise<Result>;
  query(id: string): Promise<Result>;
  capture(id: string): Promise<Result>;
  void(id: string): Promise<Result>;
  refund(id: string, amountMinor: number): Promise<Result>;
}
export class FakePaymentsProvider implements PaymentsProvider {
  outcome: Outcome; queryOutcome: Outcome; calls = 0;
  constructor(outcome: Outcome = 'pending', queryOutcome: Outcome = 'captured') { this.outcome = outcome; this.queryOutcome = queryOutcome; }
  async create(id: string, _amountMinor: number) { this.calls++; return { outcome: this.outcome, providerRef: `fake:${id}` }; }
  async query(id: string) { return { outcome: this.queryOutcome, providerRef: `fake:${id}` }; }
  async capture(id: string) { return { outcome: this.outcome, providerRef: `fake:${id}` }; }
  async void(id: string) { return { outcome: 'voided' as const, providerRef: `fake:${id}` }; }
  async refund(id: string, _amountMinor: number) { return { outcome: this.outcome, providerRef: `fake:${id}` }; }
}
export const COD_LIMIT_MINOR = 1000000;
export function paymentsConfig(env: NodeJS.ProcessEnv = process.env) {
  return { configured: env.WIND_BOP_ENABLED === '1' && !!env.WIND_BOP_MERCHANT_ID && !!env.WIND_BOP_SECRET, testFake: env.NODE_ENV === 'test' && env.WIND_PAYMENTS_TEST_ONLY === '1' };
}
export async function paymentsAvailable(db: Persistence) {
  if (db.backend !== 'postgres') return false;
  const tables = await db.one("SELECT to_regclass('payment_intents') AS intents, to_regclass('schema_migrations') AS migrations");
  return !!(tables?.intents && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=17'));
}
type Verifier = (event: Row, signature: string | undefined) => boolean | Promise<boolean>;
export class Payments {
  private db: Persistence;
  private fail: Fail;
  private provider: PaymentsProvider | null;
  private verify: Verifier;
  constructor(db: Persistence, fail: Fail, provider: PaymentsProvider | null = null, verify: Verifier = () => false) { this.db = db; this.fail = fail; this.provider = provider; this.verify = verify; }
  private async gate() { if (!(await paymentsAvailable(this.db))) this.fail(409, 'payments_unavailable'); }
  private async providerGate() { await this.gate(); if (!this.provider) this.fail(409, 'payments_unavailable'); return this.provider!; }
  private async tx<T>(work: () => Promise<T>): Promise<T> { return this.db.scope(async () => { if (this.db.inTransaction) return work(); await this.db.exec('BEGIN'); try { const value = await work(); await this.db.exec('COMMIT'); return value; } catch (e) { if (this.db.inTransaction) await this.db.exec('ROLLBACK'); throw e; } }); }
  private async order(actor: Actor, id: number) { const row = await this.db.one('SELECT * FROM orders WHERE id=?', id) ?? this.fail(404, 'not_found'); if (actor.role !== 'admin' && actor.id !== Number(row.customer_id) && actor.id !== Number(row.driver_id)) this.fail(403, 'forbidden'); return row; }
  private owner(actor: Actor, order: Row) { if (actor.role !== 'admin' && !(actor.role === 'customer' && actor.id === Number(order.customer_id))) this.fail(403, 'forbidden'); }
  private driver(actor: Actor, order: Row) { if (actor.role !== 'admin' && !(actor.role === 'driver' && actor.id === Number(order.driver_id))) this.fail(403, 'forbidden'); }
  async createIntent(actor: Actor, orderId: number, body: Row) {
    const provider = await this.providerGate(); const order = await this.order(actor, orderId); this.owner(actor, order);
    if (!Number.isSafeInteger(body.amountMinor) || body.amountMinor <= 0) this.fail(400, 'invalid_amount');
    if (Number(order.price_minor) !== body.amountMinor) this.fail(409, 'amount_mismatch');
    const id = randomUUID(), now = Date.now(), ref = `order:${orderId}:payment`;
    const created = await this.db.one("INSERT INTO payment_intents(id,business_ref,order_id,quote_id,amount_minor,currency,status,provider,actor_id,created_at,updated_at) VALUES(?::uuid,?,?,?::uuid,?,'ILS','pending','fake',?,?,?) ON CONFLICT(business_ref) DO NOTHING RETURNING *", id, ref, orderId, order.quote_id ?? null, body.amountMinor, actor.id, now, now);
    if (!created) { const prior = (await this.db.one('SELECT * FROM payment_intents WHERE business_ref=?', ref))!; if (Number(prior.amount_minor) !== body.amountMinor) this.fail(409, 'idempotency_conflict'); return prior; }
    let result: Result; try { result = await provider.create(id, body.amountMinor); } catch { result = { outcome: 'timeout', providerRef: '' }; }
    await this.db.run('INSERT INTO payment_attempts(id,intent_id,provider_ref,outcome,created_at) VALUES(?::uuid,?::uuid,?,?,?)', randomUUID(), id, result.providerRef || null, result.outcome, Date.now());
    await this.db.run("UPDATE payment_intents SET provider_ref=?,status=CASE WHEN status='pending' AND ? IN ('captured','failed','voided') THEN ? ELSE status END,updated_at=? WHERE id=?::uuid", result.providerRef || null, result.outcome, result.outcome, Date.now(), id);
    return (await this.db.one('SELECT * FROM payment_intents WHERE id=?::uuid', id))!;
  }
  async getIntent(actor: Actor, orderId: number) { const provider = await this.providerGate(); const order = await this.order(actor, orderId); this.owner(actor, order); const intent = await this.db.one('SELECT * FROM payment_intents WHERE order_id=?', orderId) ?? null; if (!intent || intent.status !== 'pending') return intent; const result = await provider.query(String(intent.id)); if (['captured','failed','voided'].includes(result.outcome)) await this.db.run("UPDATE payment_intents SET status=?,provider_ref=?,updated_at=? WHERE id=?::uuid AND status='pending'", result.outcome, result.providerRef, Date.now(), intent.id); return await this.db.one('SELECT * FROM payment_intents WHERE id=?::uuid', intent.id); }
  async query(actor: Actor, orderId: number) { const provider = await this.providerGate(); const intent = await this.getIntent(actor, orderId) ?? this.fail(404, 'not_found'); const result = await provider.query(String(intent.id)); if (['captured','failed','voided'].includes(result.outcome)) await this.db.run("UPDATE payment_intents SET status=?,provider_ref=?,updated_at=? WHERE id=?::uuid AND status='pending'", result.outcome, result.providerRef, Date.now(), intent.id); return (await this.db.one('SELECT * FROM payment_intents WHERE id=?::uuid', intent.id))!; }
  async applyProviderEvent(event: Row, signature?: string) {
    if (!(await this.verify(event, signature))) this.fail(401, 'invalid_signature');
    await this.providerGate();
    if (typeof event.provider !== 'string' || event.provider !== 'fake' || typeof event.providerEventId !== 'string' || !event.providerEventId || typeof event.intentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(event.intentId) || typeof event.eventType !== 'string') this.fail(400, 'invalid_event');
    return this.tx(async () => {
      const intent = await this.db.one('SELECT * FROM payment_intents WHERE id=?::uuid FOR UPDATE', event.intentId) ?? this.fail(404, 'not_found');
      const inserted = await this.db.one('INSERT INTO payment_events(id,provider,provider_event_id,intent_id,event_type,payload_sha256,received_at) VALUES(?::uuid,?,?,?::uuid,?,?,?) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING *', randomUUID(), event.provider, event.providerEventId, event.intentId, event.eventType, createHash('sha256').update(JSON.stringify(event)).digest('hex'), Date.now());
      if (!inserted) return { event: await this.db.one('SELECT * FROM payment_events WHERE provider=? AND provider_event_id=?', event.provider, event.providerEventId), applied: false };
      // Refund states are set only by refund(), which keeps cumulative refund rows authoritative; webhook events never move them.
      const transitions: Record<string, string[]> = { created: ['pending'], pending: ['captured','failed','voided'], captured: [], partially_refunded: [] };
      const applied = (transitions[intent.status] ?? []).includes(event.eventType);
      if (applied) await this.db.run('UPDATE payment_intents SET status=?,updated_at=? WHERE id=?::uuid', event.eventType, Date.now(), intent.id);
      return { event: inserted, applied };
    });
  }
  async refund(actor: Actor, intentId: string, amount: number, reason: string, requestId?: string) {
    const provider = await this.providerGate(); needStaff(await staffActor(this.db, actor), this.fail, 'finance');
    if (!Number.isSafeInteger(amount) || amount <= 0 || typeof reason !== 'string' || reason.trim().length < 5) this.fail(400, 'invalid_input');
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId))) this.fail(400, 'invalid_input');
    if (this.db.inTransaction) this.fail(409, 'refund_in_transaction');
    const reservation = await this.tx(async () => {
      if (requestId) { const prior = await this.db.one('SELECT * FROM refunds WHERE business_ref=?', `refund:${requestId}`); if (prior) { if (String(prior.intent_id) !== intentId || Number(prior.amount_minor) !== amount) this.fail(409, 'idempotency_conflict'); return { prior }; } }
      const intent = await this.db.one('SELECT * FROM payment_intents WHERE id=?::uuid FOR UPDATE', intentId) ?? this.fail(404, 'not_found');
      if (requestId) { const prior = await this.db.one('SELECT * FROM refunds WHERE business_ref=?', `refund:${requestId}`); if (prior) { if (String(prior.intent_id) !== intentId || Number(prior.amount_minor) !== amount) this.fail(409, 'idempotency_conflict'); return { prior }; } }
      if (!['captured','partially_refunded'].includes(intent.status)) this.fail(409, 'payment_not_captured');
      const total = Number((await this.db.one("SELECT COALESCE(sum(amount_minor),0) AS total FROM refunds WHERE intent_id=?::uuid AND status IN ('requested','approved','completed')", intentId))!.total);
      if (total + amount > Number(intent.amount_minor)) this.fail(400, 'refund_exceeds_capture');
      const id = randomUUID(); const inserted = await this.db.one("INSERT INTO refunds(id,intent_id,business_ref,amount_minor,reason,status,actor_id,created_at) VALUES(?::uuid,?::uuid,?,?,?,'requested',?,?) ON CONFLICT(business_ref) DO NOTHING RETURNING *", id, intentId, `refund:${requestId ?? id}`, amount, reason.trim(), actor.id, Date.now());
      if (!inserted) { const prior = (await this.db.one('SELECT * FROM refunds WHERE business_ref=?', `refund:${requestId}`))!; if (String(prior.intent_id) !== intentId || Number(prior.amount_minor) !== amount) this.fail(409, 'idempotency_conflict'); return { prior }; }
      return { id };
    });
    if (reservation.prior) return reservation.prior;
    const id = reservation.id!;
    let result: Result; try { result = await provider.refund(intentId, amount); } catch { result = { outcome: 'timeout', providerRef: '' }; }
    return this.tx(async () => {
      const intent = (await this.db.one('SELECT * FROM payment_intents WHERE id=?::uuid FOR UPDATE', intentId))!;
      if (result.outcome === 'captured') { await this.db.run("UPDATE refunds SET status='completed' WHERE id=?::uuid", id); const total = Number((await this.db.one("SELECT COALESCE(sum(amount_minor),0) AS total FROM refunds WHERE intent_id=?::uuid AND status='completed'", intentId))!.total); await this.db.run('UPDATE payment_intents SET status=?,updated_at=? WHERE id=?::uuid', total === Number(intent.amount_minor) ? 'refunded' : 'partially_refunded', Date.now(), intentId); }
      else await this.db.run("UPDATE refunds SET status='rejected' WHERE id=?::uuid", id);
      return (await this.db.one('SELECT * FROM refunds WHERE id=?::uuid', id))!;
    });
  }
  async refundOrder(actor: Actor, orderId: number, body: Row) { await this.providerGate(); needStaff(await staffActor(this.db, actor), this.fail, 'finance'); const intent = await this.db.one('SELECT id FROM payment_intents WHERE order_id=?', orderId) ?? this.fail(404, 'not_found'); return this.refund(actor, String(intent.id), body.amountMinor, body.reason, body.requestId); }
  async createCod(actor: Actor, orderId: number, body: Row) {
    await this.gate(); const order = await this.order(actor, orderId); this.owner(actor, order); if (['searching', 'cancelled'].includes(order.status)) this.fail(409, 'cod_unavailable');
    if (typeof body.beneficiary !== 'string' || !body.beneficiary.trim() || !Number.isSafeInteger(body.goodsMinor) || body.goodsMinor < 0 || body.goodsMinor > COD_LIMIT_MINOR || !Number.isSafeInteger(body.remittanceDueAt) || body.remittanceDueAt <= 0) this.fail(400, 'invalid_input');
    return this.tx(async () => { const id = randomUUID(); const row = await this.db.one("INSERT INTO merchant_cod(id,order_id,beneficiary,goods_minor,status,remittance_due_at,created_at) VALUES(?::uuid,?,?,?,'expected',?,?) ON CONFLICT(order_id) DO NOTHING RETURNING *", id, orderId, body.beneficiary.trim(), body.goodsMinor, body.remittanceDueAt, Date.now()); if (!row) this.fail(409, 'cod_exists'); await this.codEvent(id, 'expected', actor.id, null); return row; });
  }
  private async codEvent(id: string, action: string, actor: number, amount: number | null) { await this.db.run('INSERT INTO merchant_cod_events(id,cod_id,action,actor_id,amount_minor,created_at) VALUES(?::uuid,?::uuid,?,?,?,?)', randomUUID(), id, action, actor, amount, Date.now()); }
  async getCod(actor: Actor, orderId: number) { await this.gate(); await this.order(actor, orderId); return await this.db.one('SELECT * FROM merchant_cod WHERE order_id=?', orderId) ?? null; }
  async collectCod(actor: Actor, orderId: number, body: Row) { await this.gate(); return this.tx(async () => { const order = await this.order(actor, orderId); this.driver(actor, order); if (['searching', 'cancelled'].includes(order.status)) this.fail(409, 'cod_unavailable'); if (!Number.isSafeInteger(body.amountMinor) || body.amountMinor <= 0) this.fail(400, 'invalid_amount'); const row = await this.db.one('SELECT * FROM merchant_cod WHERE order_id=? FOR UPDATE', orderId) ?? this.fail(404, 'not_found'); const total = Number(row.collected_minor) + body.amountMinor; if (total > Number(row.goods_minor) || total > COD_LIMIT_MINOR) this.fail(400, 'invalid_amount'); if (!['expected','partial'].includes(row.status)) this.fail(409, 'cod_unavailable'); const status = total === Number(row.goods_minor) ? 'collected' : 'partial'; await this.db.run('UPDATE merchant_cod SET collected_minor=?,collector_id=?,status=? WHERE id=?::uuid', total, actor.id, status, row.id); await this.codEvent(row.id, status, actor.id, body.amountMinor); return (await this.db.one('SELECT * FROM merchant_cod WHERE id=?::uuid', row.id))!; }); }
  async remitCod(actor: Actor, orderId: number, body: Row) { await this.gate(); needStaff(await staffActor(this.db, actor), this.fail, 'finance'); if (typeof body.payoutRef !== 'string' || !body.payoutRef.trim()) this.fail(400, 'invalid_input'); return this.tx(async () => { const row = await this.db.one('SELECT * FROM merchant_cod WHERE order_id=? FOR UPDATE', orderId) ?? this.fail(404, 'not_found'); if (row.status !== 'collected') this.fail(409, 'cod_unavailable'); await this.db.run("UPDATE merchant_cod SET status='remitted',payout_ref=? WHERE id=?::uuid", body.payoutRef.trim(), row.id); await this.codEvent(row.id, 'remitted', actor.id, Number(row.collected_minor)); return (await this.db.one('SELECT * FROM merchant_cod WHERE id=?::uuid', row.id))!; }); }
}
export function createPayments(db: Persistence, fail: Fail, env: NodeJS.ProcessEnv = process.env) { const config = paymentsConfig(env); return config.testFake ? new Payments(db, fail, new FakePaymentsProvider(), (_event, signature) => signature === 'test-signature') : new Payments(db, fail); }
export function registerPaymentsRoutes(route: Register, service: Payments) {
  route('POST', '/api/orders/:id/payments', ctx => service.createIntent(ctx.user, Number(ctx.params[0]), ctx.body));
  route('GET', '/api/orders/:id/payments', ctx => service.getIntent(ctx.user, Number(ctx.params[0])));
  route('POST', '/api/orders/:id/payments/refund', ctx => service.refundOrder(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/payments/webhook', ctx => service.applyProviderEvent(ctx.body, typeof ctx.req.headers['x-payment-signature'] === 'string' ? ctx.req.headers['x-payment-signature'] : undefined), true);
  route('POST', '/api/orders/:id/cod', ctx => service.createCod(ctx.user, Number(ctx.params[0]), ctx.body));
  route('GET', '/api/orders/:id/cod', ctx => service.getCod(ctx.user, Number(ctx.params[0])));
  route('POST', '/api/orders/:id/cod/collect', ctx => service.collectCod(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/orders/:id/cod/remit', ctx => service.remitCod(ctx.user, Number(ctx.params[0]), ctx.body));
}
