import type { User } from '../../src/model.ts';
import type { Persistence } from '../db/persistence.ts';
import { needStaff, staffActor, staffRoleOf } from './ops.ts';
type Row = Record<string, any>;
type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[]; body: Row }) => Promise<unknown>) => unknown;
type Deps = {
  db: Persistence; fail: (status: number, message: string) => never; need: (user: User, role: 'admin') => void;
  text: (value: unknown, max: number, required?: boolean) => string;
  push: (userIds: number[], kind: 'office', orderId: number, url?: string) => Promise<void>;
};

const HOUR = 3_600_000, DAY = 24 * HOUR;
export const OFFICE_HOLD = { perishable: DAY, other: 7 * DAY };
export type OfficeAction = 'received' | 'collected' | 'donated' | 'destroyed';
const ACTIONS: Record<OfficeAction, string> = { received: 'OFFICE_RECEIVED', collected: 'OFFICE_COLLECTED', donated: 'OFFICE_DONATED', destroyed: 'OFFICE_DESTROYED' };
const CLOSING = ['OFFICE_COLLECTED', 'OFFICE_DONATED', 'OFFICE_DESTROYED'];
export type OfficeState = { receivedAt: number; perishable: boolean; until: number; closed: null | { action: Exclude<OfficeAction, 'received'>; at: number } };

const parse = (detail: unknown): Row => { try { return (typeof detail === 'string' ? JSON.parse(detail) : detail as Row) ?? {}; } catch { return {}; } };

/** The office record of one returned order, or null when it never reached the office. Read from the append-only events. */
export async function officeState(db: Persistence, orderId: number): Promise<OfficeState | null> {
  const rows = await db.all(`SELECT action, detail, created_at FROM security_events WHERE order_id = ? AND action IN
    ('OFFICE_RECEIVED','OFFICE_COLLECTED','OFFICE_DONATED','OFFICE_DESTROYED') ORDER BY created_at, id`, orderId);
  const received = rows.find(r => r.action === 'OFFICE_RECEIVED');
  if (!received) return null;
  const perishable = !!parse(received.detail).perishable, at = Number(received.created_at);
  const close = rows.find(r => CLOSING.includes(String(r.action)));
  return { receivedAt: at, perishable, until: at + (perishable ? OFFICE_HOLD.perishable : OFFICE_HOLD.other),
    closed: close ? { action: String(close.action).slice('OFFICE_'.length).toLowerCase() as 'collected' | 'donated' | 'destroyed', at: Number(close.created_at) } : null };
}

/**
 * SHIP-19 (D-5): returned goods nobody received are kept at the Wind office. Support records the receipt (after the existing
 * confirm_return), then exactly one ending: the sender collected them, or, once the hold has passed (24 h perishable, 7 days
 * otherwise), they were donated (safe and sellable) or destroyed. Every step is an append-only event with its actor; the sender is
 * reminded daily while the goods wait. No money moves here beyond DLV-25.
 */
export function registerOfficeRoutes(route: Register, deps: Deps) {
  route('POST', '/api/admin/orders/:id/office', async ({ user, params, body }) => {
    deps.need(user, 'admin');
    const id = Number(params[0]), action = body.action as OfficeAction;
    if (!Number.isSafeInteger(id) || id < 1 || typeof action !== 'string' || !Object.hasOwn(ACTIONS, action)) deps.fail(400, 'invalid_input');
    if (body.perishable !== undefined && typeof body.perishable !== 'boolean') deps.fail(400, 'invalid_input');
    const note = deps.text(body.note, 300, action !== 'collected'); // donating or destroying someone's goods always says why
    if (action !== 'collected' && note.trim().length < 5) deps.fail(400, 'invalid_input');
    await deps.db.exec('BEGIN IMMEDIATE');
    try {
      needStaff(await staffActor(deps.db, user), deps.fail, 'support');
      const order = await deps.db.one(`SELECT id, customer_id, service, status FROM orders WHERE id = ?${deps.db.backend === 'postgres' ? ' FOR UPDATE' : ''}`, id); // one ending per order
      if (!order) deps.fail(404, 'not_found');
      if (order!.status !== 'returned' || !['parcel', 'freight', 'shop'].includes(String(order!.service))) deps.fail(409, 'office_unavailable');
      // A code-confirmed or explicit sender handback can never enter the office shelf.
      if (action === 'received' && !(await viaOffice(deps.db, id))) deps.fail(409, 'office_unavailable');
      const state = await officeState(deps.db, id), now = Date.now();
      if (action === 'received' ? state : !state || state.closed) deps.fail(409, 'office_conflict');
      if ((action === 'donated' || action === 'destroyed') && now < state!.until) deps.fail(409, 'office_hold_running');
      const detail = action === 'received' ? { perishable: body.perishable === true, note } : { note };
      await deps.db.run('INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
        user.id, id, ACTIONS[action], JSON.stringify(detail), now);
      if (action === 'received') await notifyOffice(deps.db, deps.push, order!);
      await deps.db.exec('COMMIT');
    } catch (error) { await deps.db.exec('ROLLBACK'); throw error; }
    return { orderId: id, office: await officeState(deps.db, id) };
  });

  route('GET', '/api/admin/orders/:id/office', async ({ user, params }) => {
    deps.need(user, 'admin');
    const id = Number(params[0]);
    if (!Number.isSafeInteger(id) || id < 1) deps.fail(400, 'invalid_input');
    const order = await deps.db.one('SELECT status, service FROM orders WHERE id = ?', id);
    const canReceive = order?.status === 'returned' && ['parcel', 'freight', 'shop'].includes(order.service) && await viaOffice(deps.db, id);
    const actor = await staffActor(deps.db, user);
    const canManage = ['platform_admin', 'support'].includes(staffRoleOf(actor) ?? '');
    return { orderId: id, office: await officeState(deps.db, id), canReceive, canManage };
  });

  // The office shelf: everything received and not yet ended, the ones past their hold first.
  route('GET', '/api/admin/office', async ({ user }) => {
    deps.need(user, 'admin');
    const open = await deps.db.all(`SELECT e.order_id FROM security_events e WHERE e.action = 'OFFICE_RECEIVED' AND NOT EXISTS (
      SELECT 1 FROM security_events c WHERE c.order_id = e.order_id AND c.action IN ('OFFICE_COLLECTED','OFFICE_DONATED','OFFICE_DESTROYED'))
      ORDER BY e.created_at LIMIT 200`);
    const items = [];
    for (const r of open) items.push({ orderId: Number(r.order_id), ...(await officeState(deps.db, Number(r.order_id)))! });
    return { items: items.sort((a, b) => a.until - b.until) };
  });
}

/** Explicit office or legacy support confirmation. Older clients used the same command for both handbacks. */
async function viaOffice(db: Persistence, orderId: number) {
  const rows = await db.all(`SELECT action, detail FROM security_events WHERE order_id = ?
    AND action IN ('EXCEPTION_RESOLVED','ELIGIBILITY_CUSTODY_RECOVERY','RETURN_COMPLETED')`, orderId);
  return !rows.some(r => r.action === 'RETURN_COMPLETED') && rows.some(r => {
    const detail = parse(r.detail);
    return detail.action === 'confirm_return' && (r.action === 'ELIGIBILITY_CUSTODY_RECOVERY'
      || r.action === 'EXCEPTION_RESOLVED' && (detail.handoff === 'office' || detail.handoff === undefined));
  });
}

/** Shipped eligibility builds recorded the return without a separate CUSTODY_TAKEN event. */
export async function legacySupportCollected(db: Persistence, order: Row) {
  if (db.backend !== 'postgres') return false;
  const events = await db.all(`SELECT detail FROM security_events WHERE order_id = ? AND action = 'ELIGIBILITY_CUSTODY_RECOVERY'
    AND created_at >= ?`, order.id, order.assigned_at ?? 0);
  return events.some(event => parse(event.detail).action === 'return');
}

async function notifyOffice(db: Persistence, push: Deps['push'], order: Row) {
  const id = Number(order.id);
  if (order.service === 'shop') {
    const merchant = await db.one('SELECT m.owner_user_id FROM shop_orders s JOIN merchants m ON m.id = s.merchant_id WHERE s.order_id = ?', id);
    if (merchant) await push([Number(merchant.owner_user_id)], 'office', id, `/merchant/order/${id}`);
  } else await push([Number(order.customer_id)], 'office', id);
}

/** Daily reminder to the sender or shop while goods wait at the office, deduplicated by OFFICE_REMINDED events.
 *  Call it inside persistence.atomic: queuePush defers to the transaction, so the reminder and its record commit together. */
export async function remindOffice(db: Persistence, push: Deps['push'], now = Date.now()) {
  // ponytail: hourly sweep, so "daily" lands within the same hour each day. The due filter is in SQL, so the LIMIT only caps a burst.
  const due = await db.all(`SELECT o.id, e.actor_id, o.customer_id, o.service
    FROM security_events e JOIN orders o ON o.id = e.order_id
    WHERE e.action = 'OFFICE_RECEIVED' AND NOT EXISTS (SELECT 1 FROM security_events c WHERE c.order_id = e.order_id
      AND c.action IN ('OFFICE_COLLECTED','OFFICE_DONATED','OFFICE_DESTROYED'))
      AND (SELECT MAX(r.created_at) FROM security_events r WHERE r.order_id = e.order_id AND r.action IN ('OFFICE_RECEIVED','OFFICE_REMINDED')) <= ?
    ORDER BY e.order_id LIMIT 100`, now - (DAY - HOUR));
  let sent = 0;
  for (const r of due) {
    await db.run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'OFFICE_REMINDED', '{"auto":true}', ?)`,
      r.actor_id, r.id, now);
    await notifyOffice(db, push, r);
    sent++;
  }
  return sent;
}
