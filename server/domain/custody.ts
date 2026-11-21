import { exceptionReasons, pickupRefusal, type User } from '../../src/model.ts';
import type { Persistence } from '../db/persistence.ts';
import { OFFICE_HOLD } from './office.ts';
type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[] }) => Promise<unknown>) => unknown;
type Deps = { db: Persistence; fail: (status: number, message: string) => never };

/** One step of who held a parcel and when (SHIP-10). Reason codes only: notes are free text and can carry phone numbers. */
export type CustodyStep = { at: number; kind: CustodyKind; by: 'sender' | 'driver' | 'support'; reason?: string; driver?: string; until?: number; attempt?: number };
export type CustodyKind = 'booked' | 'released' | 'assigned' | 'picked_up' | 'pickup_failed' | 'held' | 'decided' | 'blocked'
  | 'delivered' | 'returned' | 'cancelled' | 'office_received' | 'office_collected' | 'office_donated' | 'office_destroyed';

// Only codes from these lists reach the sender: support's resolve reason and every note are free text and stay with support.
const failureCodes = new Set<string>([...exceptionReasons, 'wrong_or_missing_item', pickupRefusal]);
const decisionCodes = new Set(['reattempt', 'return', 'confirm_return']);
const fromEvent: Record<string, CustodyKind> = {
  PICKUP_FAILED: 'pickup_failed', DELIVERY_EXCEPTION: 'held', EXCEPTION_RESOLVED: 'decided', COURIER_BLOCKED: 'blocked',
  RETURN_COMPLETED: 'returned', ORDER_CANCELLED_BY_ADMIN: 'cancelled',
  OFFICE_RECEIVED: 'office_received', OFFICE_COLLECTED: 'office_collected', OFFICE_DONATED: 'office_donated', OFFICE_DESTROYED: 'office_destroyed',
};

/**
 * SHIP-10: the sender's and support's read-only custody chain for a parcel or freight order, built from what both backends already
 * keep: the stage times on the order, releases, and the append-only security events. Nothing new is written, so it cannot drift.
 */
export function registerCustodyRoutes(route: Register, deps: Deps) {
  route('GET', '/api/orders/:id/custody', async ({ user, params }) => {
    const id = Number(params[0]);
    if (!Number.isSafeInteger(id) || id < 1) deps.fail(400, 'invalid_input');
    const o = await deps.db.one(`SELECT o.id, o.customer_id, o.service, o.status, o.created_at, o.assigned_at, o.picked_up_at, o.completed_at,
      u.name AS driver_name FROM orders o LEFT JOIN users u ON u.id = o.driver_id WHERE o.id = ?`, id);
    // Not the driver's view: a courier sees their own job; the chain is for the sender and support.
    if (!o || o.service === 'ride' || o.service === 'shop' || (user.role !== 'admin' && user.id !== o.customer_id)) deps.fail(404, 'not_found');
    const steps: CustodyStep[] = [{ at: Number(o!.created_at), kind: 'booked', by: 'sender' }];
    // Releases name the courier who gave the job back, so every earlier holder is in the chain, not only the current one.
    for (const r of await deps.db.all('SELECT r.released_at, u.name FROM order_releases r JOIN users u ON u.id = r.driver_id WHERE r.order_id = ?', id))
      steps.push({ at: Number(r.released_at), kind: 'released', by: 'driver', ...(r.name && { driver: String(r.name) }) });
    if (o!.assigned_at) steps.push({ at: Number(o!.assigned_at), kind: 'assigned', by: 'driver', ...(o!.driver_name && { driver: String(o!.driver_name) }) });
    if (o!.picked_up_at) steps.push({ at: Number(o!.picked_up_at), kind: 'picked_up', by: 'driver' });
    const events = await deps.db.all(`SELECT e.action, e.detail, e.created_at, a.role FROM security_events e JOIN users a ON a.id = e.actor_id
      WHERE e.order_id = ? AND e.action IN ('PICKUP_FAILED','DELIVERY_EXCEPTION','EXCEPTION_RESOLVED','COURIER_BLOCKED','RETURN_COMPLETED','ORDER_CANCELLED_BY_ADMIN',
        'OFFICE_RECEIVED','OFFICE_COLLECTED','OFFICE_DONATED','OFFICE_DESTROYED') ORDER BY e.created_at, e.id`, id);
    for (const e of events) {
      let detail: Record<string, unknown> = {};
      try { detail = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail ?? {}; } catch { /* an unreadable row still shows its step */ }
      const action = String(e.action);
      const kind = action === 'EXCEPTION_RESOLVED' && detail.action === 'confirm_return' && detail.handoff !== 'office'
        ? 'returned' : fromEvent[action];
      const reason = (action === 'PICKUP_FAILED' || action === 'DELIVERY_EXCEPTION') && failureCodes.has(String(detail.reason)) ? String(detail.reason)
        : kind === 'decided' && decisionCodes.has(String(detail.action)) ? String(detail.action) : undefined;
      const blocked = action === 'COURIER_BLOCKED' && Number.isSafeInteger(Number(detail.driverId))
        ? (await deps.db.one('SELECT name FROM users WHERE id = ?', Number(detail.driverId)))?.name : undefined;
      const until = e.action === 'OFFICE_RECEIVED' ? Number(e.created_at) + (detail.perishable ? OFFICE_HOLD.perishable : OFFICE_HOLD.other) : undefined;
      steps.push({ at: Number(e.created_at), kind, by: e.role === 'admin' ? 'support' : 'driver', ...(reason && { reason }), ...(until && { until }), ...(blocked && { driver: String(blocked) }) });
    }
    if (o!.status === 'completed' && o!.completed_at) steps.push({ at: Number(o!.completed_at), kind: 'delivered', by: 'driver' });
    // A return can also close through custody recovery, with no RETURN_COMPLETED event.
    if (o!.status === 'returned' && o!.completed_at && !steps.some(s => s.kind === 'returned' || s.kind === 'decided' && s.reason === 'confirm_return'))
      steps.push({ at: Number(o!.completed_at), kind: 'returned', by: 'support' });
    steps.sort((a, b) => a.at - b.at);
    // A retry after a failed delivery is a new attempt, not a silent status rewrite (the first try is attempt 1). Only a
    // reattempt that follows a failed delivery counts: support can also hold and resume an order with no failed attempt.
    let attempt = 1, failed = false;
    for (const step of steps) {
      if (step.kind === 'held') failed = true;
      else if (step.kind === 'decided' && step.reason === 'reattempt' && failed) { step.attempt = ++attempt; failed = false; }
    }
    return { orderId: id, steps };
  });
}
