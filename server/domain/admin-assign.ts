// WP-02: an administrator places a stuck `searching` order on a named driver, or moves an `assigned` / `at_pickup` one
// (nothing collected yet) to another. Every refusal the driver accept enforces is enforced here: the same driver checks
// (driver-refusal.ts), the measured eligibility guard, the commission snapshot, ride lifecycle and offer cleanup. The
// order row is the compare-and-set, so two admins or a racing driver accept move it exactly once.
import type { Row } from '../db/persistence.ts';
import { driverRefusal, type RefusalDeps, type RefusalOrder } from './driver-refusal.ts';

type Fail = (status: number, message: string) => never;
type Register = (method: string, path: string, handler: (ctx: { user: any; params: string[]; body: Row }) => Promise<unknown>, flag?: boolean) => unknown;
type Deps = RefusalDeps & {
  all: (sql: string, ...args: any[]) => Promise<Row[]>;
  run: (sql: string, ...args: any[]) => Promise<any>;
  db: { backend: string; exec: (command: 'BEGIN IMMEDIATE' | 'COMMIT' | 'ROLLBACK') => Promise<void> };
  fail: Fail;
  need: (user: any, ...roles: any[]) => void;
  text: (value: unknown, max: number, required?: boolean) => string;
  driverRate: (driverId: number) => Promise<number>;
  commissionOn: (price: number, rate: number) => number;
  safetyFree: (orderId: number) => Promise<void>;
  hasOpenOffer: (orderId: number) => Promise<boolean>;
  guardRideAssignment: (orderId: number) => Promise<void>;
  ensureAssignment: (orderId: number, driverId: number, source: 'legacy') => Promise<void>;
  getOrder: (id: number, viewer: never) => Promise<unknown>;
  queuePush: (ids: any[], kind: any, order: number, path?: string) => Promise<void>;
  // The measured eligibility guard (server/domain/eligibility.ts), which the driver accept runs before its handler.
  eligibility: { guard: (driverId: number, orderId: number, kind: 'accept', requested: unknown) => Promise<void> };
  // true on PostgreSQL once the measured schema is installed (measuredCapability)
  measured: () => Promise<boolean>;
};

const ASSIGNABLE = ['searching', 'assigned', 'at_pickup'];
const refusalOrder = (order: Row): RefusalOrder => ({ id: Number(order.id), service: String(order.service), price: Number(order.price), scheduled_for: order.scheduled_for ?? null });

export function registerAdminAssignRoutes(route: Register, deps: Deps): void {
  const { one, all, run, fail } = deps;

  route('GET', '/api/admin/orders/:id/assignable-drivers', async ({ user, params }) => {
    deps.need(user, 'admin');
    const order = (await one('SELECT * FROM orders WHERE id = ?', Number(params[0]))) ?? fail(404, 'not_found');
    if (!ASSIGNABLE.includes(order.status as string)) fail(409, 'cannot_assign');
    // ponytail: LIMIT 100 is the pilot fleet; page it and filter service and vehicle in SQL once the active fleet passes it.
    const drivers = await all(`SELECT id, name, phone, vehicle, plate, role, status, approved_at FROM users
      WHERE role = 'driver' AND status = 'active' AND id <> ? ORDER BY name, id LIMIT 100`, order.driver_id ?? 0);
    const rows = [];
    for (const driver of drivers) {
      // Advisory: the legacy checks only. The measured guard writes reservations, so it runs on assign, not in this read.
      const reason = await driverRefusal(deps, refusalOrder(order), driver, await deps.driverRate(Number(driver.id)));
      rows.push({ id: driver.id, name: driver.name, phone: driver.phone, vehicle: driver.vehicle, plate: driver.plate ?? null, eligible: reason === null, reason, advisory: true });
    }
    return rows;
  });

  route('POST', '/api/admin/orders/:id/assign', async ({ user, params, body }) => {
    deps.need(user, 'admin');
    const orderId = Number(params[0]), driverId = Number(body.driverId);
    if (!Number.isSafeInteger(driverId) || driverId < 1) fail(400, 'invalid_input');
    const reason = deps.text(body.reason, 500);
    if (reason.length < 5) fail(400, 'invalid_input');
    // Audit only: a replay is caught by the state checks below (the order is already on this driver), not by this id.
    const requestId = body.requestId === undefined ? null : deps.text(body.requestId, 64);
    if (body.expectedStatus !== undefined && !ASSIGNABLE.includes(body.expectedStatus as string)) fail(400, 'invalid_input');
    if (body.expectedDriverId !== undefined && body.expectedDriverId !== null && !Number.isSafeInteger(body.expectedDriverId)) fail(400, 'invalid_input');

    await deps.db.exec('BEGIN IMMEDIATE');
    try {
      // Same lock order as the driver accept (driver, then order) so the two cannot deadlock on PostgreSQL.
      if (deps.db.backend === 'postgres') {
        await one('SELECT id FROM users WHERE id = ? FOR UPDATE', driverId);
        await one('SELECT id FROM orders WHERE id = ? FOR UPDATE', orderId);
      }
      const driver = (await one('SELECT id, role, status, vehicle, approved_at FROM users WHERE id = ?', driverId)) ?? fail(404, 'not_found');
      if (driver.role !== 'driver') fail(404, 'not_found');
      const order = (await one('SELECT * FROM orders WHERE id = ?', orderId)) ?? fail(404, 'not_found');
      // A double submit (or a second admin choosing the same driver) finds the work already done.
      if (order.driver_id === driverId && ['assigned', 'at_pickup'].includes(order.status as string)) { /* nothing to do */ } else {
        if (!ASSIGNABLE.includes(order.status as string)) fail(409, 'cannot_assign');
        if ((body.expectedStatus !== undefined && body.expectedStatus !== order.status)
          || (body.expectedDriverId !== undefined && (body.expectedDriverId ?? null) !== (order.driver_id ?? null))) fail(409, 'order_changed');
        const rate = await deps.driverRate(driverId);
        const refused = await driverRefusal(deps, refusalOrder(order), driver, rate);
        // Every driver refusal is a 409 here: the admin is the authorized caller and the named driver is the ineligible one.
        // The driver's own accept answers 403 for its account state (blocked, pending), its own state rather than the order's.
        if (refused) fail(409, refused);
        await deps.guardRideAssignment(orderId);
        // A reassign of a measured order would strand its reservation, which moves only through the release flow.
        if (order.status !== 'searching' && await deps.measured()
          && await one('SELECT 1 FROM capacity_reservations WHERE order_id = ?', orderId)) fail(409, 'measured_reassign_unsupported');
        // The measured guard, as the driver accept runs it: it reserves capacity on success and throws on refusal, and the
        // rollback below then leaves nothing behind. It also refuses an order that is no longer searching, so for a
        // reassign that refusal means the order is measured, which this route does not move yet.
        try { await deps.eligibility.guard(driverId, orderId, 'accept', undefined); }
        catch (error) {
          if (order.status !== 'searching' && (error as Error).message === 'already_taken') fail(409, 'measured_reassign_unsupported');
          throw error;
        }
        if (await deps.hasOpenOffer(orderId)) fail(409, 'dispatch_offer_open'); // a live dispatch offer settles first, as for a driver accept
        if (order.status !== 'searching') await deps.safetyFree(orderId); // as a release: an open safety report holds the order
        // Their other parcels (if any) keep the live position; an empty load clears the stale one below.
        const carrying = await deps.activeLoad(driverId);
        const now = Date.now();
        const changed = (await run(`UPDATE orders SET driver_id = ?, commission = ?, status = 'assigned', updated_at = ?, assigned_at = ?
          WHERE id = ? AND status = ? AND COALESCE(driver_id, 0) = ? AND NOT EXISTS(SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?)`,
        driverId, deps.commissionOn(Number(order.price), rate), now, now, orderId, order.status, order.driver_id ?? 0, orderId, driverId)).changes;
        if (!changed) fail(409, 'order_changed');
        await run('UPDATE orders SET commission_rate = ? WHERE id = ?', rate, orderId); // both backends bind the rate snapshot
        await deps.ensureAssignment(orderId, driverId, 'legacy');
        await run('DELETE FROM order_offers WHERE order_id = ? OR driver_id = ?', orderId, driverId);
        if (!carrying.length) await run('DELETE FROM driver_locations WHERE driver_id = ?', driverId);
        await run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)`,
          user.id, orderId, order.status === 'searching' ? 'ORDER_ASSIGNED_BY_ADMIN' : 'ORDER_REASSIGNED_BY_ADMIN',
          JSON.stringify({ driverId, previousDriverId: order.driver_id ?? null, from: order.status, reason, requestId }), now);
        // The customer gets dispatch's own copy, not the driver-accepted `assigned` copy.
        await deps.queuePush([order.customer_id], 'dispatch_assigned', orderId);
        await deps.queuePush([driverId], 'admin_assigned', orderId);
        // Order 0 + path: the old driver is no longer a party to the order, and the durable worker only delivers order pushes to its parties.
        if (order.driver_id) await deps.queuePush([order.driver_id], 'admin_unassigned', 0, '/driver');
      }
      await deps.db.exec('COMMIT');
    } catch (error) { await deps.db.exec('ROLLBACK'); throw error; }
    return deps.getOrder(orderId, user as never);
  });
}
