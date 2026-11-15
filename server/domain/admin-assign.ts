// WP-02: an administrator places a stuck `searching` order on a named driver, or moves an `assigned` / `at_pickup` one
// (nothing collected yet) to another. Everything the driver accept enforces is enforced here through the same
// helpers (service and vehicle, canTake, cash cap, commission snapshot, ride lifecycle, offer cleanup); the order
// row is the compare-and-set, so two admins or a racing driver accept move it exactly once.
import type { Row } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Register = (method: string, path: string, handler: (ctx: { user: any; params: string[]; body: Row }) => Promise<unknown>, flag?: boolean) => unknown;
type Deps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  one: (sql: string, ...args: any[]) => Promise<Row | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all: (sql: string, ...args: any[]) => Promise<Row[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (sql: string, ...args: any[]) => Promise<any>;
  db: { backend: string; exec: (command: 'BEGIN IMMEDIATE' | 'COMMIT' | 'ROLLBACK') => Promise<void> };
  fail: Fail;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  need: (user: any, ...roles: any[]) => void;
  text: (value: unknown, max: number, required?: boolean) => string;
  enabledServices: string[];
  servesFor: (vehicle: unknown) => string[];
  canTake: (active: { service: never }[], service: never) => boolean;
  activeLoad: (driverId: number) => Promise<{ service: string }[]>;
  driverRate: (driverId: number) => Promise<number>;
  commissionOn: (price: number, rate: number) => number;
  guardCashCap: (driverId: number, price: number, rate: number) => Promise<void>;
  safetyFree: (orderId: number) => Promise<void>;
  hasOpenOffer: (orderId: number) => Promise<boolean>;
  ensureAssignment: (orderId: number, driverId: number, source: 'legacy') => Promise<void>;
  getOrder: (id: number, viewer: never) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queuePush: (ids: any[], kind: any, order: number, path?: string) => Promise<void>;
  // production self-service accounts also need the permanent approval a driver accept demands (needActive)
  permanentApprovalRequired: boolean;
};

const ASSIGNABLE = ['searching', 'assigned', 'at_pickup'];

export function registerAdminAssignRoutes(route: Register, deps: Deps): void {
  const { one, all, run, fail } = deps;

  /** The first reason this driver may not take this order, or null. Same checks and codes as the driver accept. */
  async function refusal(order: Row, driver: Row): Promise<string | null> {
    if (driver.role !== 'driver') return 'not_found';
    if (driver.status !== 'active') return driver.status === 'pending' ? 'pending_approval' : 'blocked';
    if (deps.permanentApprovalRequired && !driver.approved_at) return 'pending_approval';
    if (!deps.enabledServices.includes(order.service as string)) return 'service_unavailable';
    if (!deps.servesFor(driver.vehicle).includes(order.service as string)) return 'wrong_vehicle';
    if (await one('SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?', order.id, driver.id)) return 'driver_released_order';
    if (!deps.canTake((await deps.activeLoad(Number(driver.id))) as never, order.service as never)) return 'vehicle_busy';
    try { await deps.guardCashCap(Number(driver.id), Number(order.price), await deps.driverRate(Number(driver.id))); }
    catch (error) { if ((error as { status?: number }).status === 409) return (error as Error).message; throw error; }
    return null;
  }

  route('GET', '/api/admin/orders/:id/assignable-drivers', async ({ user, params }) => {
    deps.need(user, 'admin');
    const order = (await one('SELECT * FROM orders WHERE id = ?', Number(params[0]))) ?? fail(404, 'not_found');
    if (!ASSIGNABLE.includes(order.status as string)) fail(409, 'cannot_assign');
    const drivers = await all(`SELECT id, name, phone, vehicle, plate, role, status, approved_at FROM users
      WHERE role = 'driver' AND status = 'active' AND id <> ? ORDER BY name, id LIMIT 100`, order.driver_id ?? 0);
    const rows = [];
    for (const driver of drivers) {
      const reason = await refusal(order, driver);
      rows.push({ id: driver.id, name: driver.name, phone: driver.phone, vehicle: driver.vehicle, plate: driver.plate ?? null, eligible: reason === null, reason });
    }
    return rows;
  });

  route('POST', '/api/admin/orders/:id/assign', async ({ user, params, body }) => {
    deps.need(user, 'admin');
    const orderId = Number(params[0]), driverId = Number(body.driverId);
    if (!Number.isSafeInteger(driverId) || driverId < 1) fail(400, 'invalid_input');
    const reason = deps.text(body.reason, 500);
    if (reason.length < 5) fail(400, 'invalid_input');
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
      const driver = await one('SELECT id, role, status, vehicle, approved_at FROM users WHERE id = ?', driverId);
      if (!driver || driver.role !== 'driver') fail(404, 'not_found');
      const order = (await one('SELECT * FROM orders WHERE id = ?', orderId)) ?? fail(404, 'not_found');
      // A double submit (or a second admin choosing the same driver) finds the work already done.
      if (order.driver_id === driverId && ['assigned', 'at_pickup'].includes(order.status as string)) { /* nothing to do */ } else {
        if (!ASSIGNABLE.includes(order.status as string)) fail(409, 'cannot_assign');
        if ((body.expectedStatus !== undefined && body.expectedStatus !== order.status)
          || (body.expectedDriverId !== undefined && (body.expectedDriverId ?? null) !== (order.driver_id ?? null))) fail(409, 'order_changed');
        const refused = await refusal(order, driver);
        if (refused) fail(409, refused);
        if (await deps.hasOpenOffer(orderId)) fail(409, 'dispatch_offer_open'); // a live dispatch offer settles first, as for a driver accept
        if (order.status !== 'searching') await deps.safetyFree(orderId); // as a release: an open safety report holds the order
        const carrying = await deps.activeLoad(driverId); // empty (the refusal check passed): their idle position is not this job's fix
        const rate = await deps.driverRate(driverId), now = Date.now();
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
        await deps.queuePush([order.customer_id], 'assigned', orderId);
        await deps.queuePush([driverId], 'admin_assigned', orderId);
        // Order 0 + path: the old driver is no longer a party to the order, and the durable worker only delivers order pushes to its parties.
        if (order.driver_id) await deps.queuePush([order.driver_id], 'admin_unassigned', 0, '/driver');
      }
      await deps.db.exec('COMMIT');
    } catch (error) { await deps.db.exec('ROLLBACK'); throw error; }
    return deps.getOrder(orderId, user as never);
  });
}
