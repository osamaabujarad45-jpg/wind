import { randomInt } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import { eligibilityDefaults } from './eligibility.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; params: string[] };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>, isPublic?: boolean) => unknown;

/** Arrival must be within walking distance of the pickup pin. Stored fixes carry
 * an effective accuracy of 50m when unreported (see /api/location and presence),
 * so 300m leaves room for pin + fix error without accepting a city-block away. */
export const RIDE_ARRIVAL_RADIUS_METERS = 300;
/** The freshness already used to show a live driver fix in order serialization. */
export const RIDE_ARRIVAL_FIX_MAX_AGE_MS = 120_000;
/** Operational grace after a valid arrival; no waiting fee is attached (WP11). */
export const RIDE_GRACE_MS = 5 * 60_000;

export const boardingEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  eligibilityDefaults.futureBoardingChallengeActivated || (env.NODE_ENV === 'test' && env.WIND_BOARDING_TEST_ONLY === '1');

export async function rideLifecycleAvailable(db: Persistence): Promise<boolean> {
  if (db.backend !== 'postgres') return false;
  // Request-scoped: list endpoints call this once per row, and the answer cannot change mid-request.
  return db.memo('rideLifecycleAvailable', async () => {
    const tables = await db.one("SELECT to_regclass('ride_lifecycle') AS lifecycle, to_regclass('ride_boarding_attempts') AS attempts, to_regclass('schema_migrations') AS migrations");
    return !!(tables?.lifecycle && tables.attempts && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=14'));
  });
}

const haversineMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const rad = (n: number) => n * Math.PI / 180;
  const p = rad(b.latitude - a.latitude), q = rad(b.longitude - a.longitude);
  const v = Math.sin(p / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(q / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(v)));
};
const newBoardingCode = () => String(randomInt(1000, 10000));

export class RideLifecycle {
  private db: Persistence;
  private fail: Fail;
  onBoardingLocked?: (orderId: number) => Promise<void>;
  constructor(db: Persistence, fail: Fail) { this.db = db; this.fail = fail; }
  enabled() { return boardingEnabled(); }
  async available() { return rideLifecycleAvailable(this.db); }
  private async requireAvailable() { if (!(await this.available())) this.fail(409, 'ride_lifecycle_unavailable'); }

  private async dispatchAssigned(orderId: number, driverId: number): Promise<boolean> {
    if (!(await this.db.one("SELECT to_regclass('assignment_history') AS t"))?.t) return false;
    return !!(await this.db.one("SELECT 1 FROM assignment_history WHERE order_id=? AND driver_id=? AND action='assigned' LIMIT 1", orderId, driverId));
  }

  /** Create or reset the cohort row for the order's current assignment. */
  async ensureAssignment(orderId: number, driverId: number, source: 'dispatch' | 'legacy') {
    if (!(await this.available())) return;
    const order = await this.db.one('SELECT * FROM orders WHERE id=?', orderId);
    if (!order || order.service !== 'ride' || Number(order.driver_id) !== driverId) return;
    const required = source === 'dispatch' || this.enabled();
    if (!required) return;
    const now = Date.now(), epoch = Number(order.assignment_epoch);
    await this.db.run(`INSERT INTO ride_lifecycle(order_id,driver_id,assignment_epoch,boarding_code,boarding_required,created_at,updated_at)
      VALUES(?,?,?,?,1,?,?) ON CONFLICT(order_id) DO UPDATE SET driver_id=excluded.driver_id,assignment_epoch=excluded.assignment_epoch,
      arrived_at=NULL,arrival_source=NULL,arrival_actor_id=NULL,boarding_code=excluded.boarding_code,boarding_required=1,updated_at=excluded.updated_at`,
      orderId, driverId, epoch, newBoardingCode(), now, now);
    await this.db.run(`INSERT INTO ride_boarding_attempts(order_id,assignment_epoch,failures) VALUES(?,?,0)
      ON CONFLICT(order_id) DO UPDATE SET assignment_epoch=excluded.assignment_epoch,failures=0`, orderId, epoch);
  }

  /** A released assignment leaves no arrival, code or attempts for the next driver. */
  async clearAssignment(orderId: number) {
    if (!(await this.available())) return;
    await this.db.run('DELETE FROM ride_boarding_attempts WHERE order_id=?', orderId);
    await this.db.run('DELETE FROM ride_lifecycle WHERE order_id=?', orderId);
  }

  private async ensureRow(order: Row): Promise<Row> {
    const existing = await this.db.one('SELECT * FROM ride_lifecycle WHERE order_id=? FOR UPDATE', order.id);
    const epoch = Number(order.assignment_epoch), driverId = Number(order.driver_id);
    if (existing && Number(existing.assignment_epoch) === epoch && Number(existing.driver_id) === driverId) return existing;
    const required = this.enabled() || (await this.dispatchAssigned(Number(order.id), driverId)) || !!existing?.boarding_required;
    const now = Date.now();
    const row = await this.db.one(`INSERT INTO ride_lifecycle(order_id,driver_id,assignment_epoch,boarding_code,boarding_required,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET driver_id=excluded.driver_id,assignment_epoch=excluded.assignment_epoch,
      arrived_at=NULL,arrival_source=NULL,arrival_actor_id=NULL,boarding_code=excluded.boarding_code,boarding_required=excluded.boarding_required,updated_at=excluded.updated_at RETURNING *`,
      order.id, driverId, epoch, required ? newBoardingCode() : null, required ? 1 : 0, now, now);
    await this.db.run(`INSERT INTO ride_boarding_attempts(order_id,assignment_epoch,failures) VALUES(?,?,0)
      ON CONFLICT(order_id) DO UPDATE SET assignment_epoch=excluded.assignment_epoch,failures=0`, order.id, epoch);
    return row!;
  }

  async summary(orderId: number, viewer: { id: number; role: string }, order: Row) {
    if (!(await this.available())) return null;
    const row = await this.db.one('SELECT * FROM ride_lifecycle WHERE order_id=?', orderId);
    if (!row) return null;
    const attempts = await this.db.one('SELECT failures FROM ride_boarding_attempts WHERE order_id=?', orderId);
    const failures = Number(attempts?.failures ?? 0);
    const arrivedAt = row.arrived_at == null ? null : Number(row.arrived_at);
    const canSeeCode = !!row.boarding_code && Number(row.assignment_epoch) === Number(order.assignment_epoch)
      && (viewer.id === Number(order.customer_id) || (viewer.id === Number(order.driver_id) && Number(row.driver_id) === viewer.id));
    return { arrivedAt, graceUntil: arrivedAt == null ? null : arrivedAt + RIDE_GRACE_MS,
      arrivalSource: row.arrival_source ?? null, boardingRequired: !!Number(row.boarding_required),
      boardingLocked: failures >= eligibilityDefaults.newBoardingChallengeAttempts,
      ...(canSeeCode ? { boardingCode: row.boarding_code as string } : {}) };
  }

  private async latestFix(driverId: number) {
    // Stored fixes already passed the 70 m/s plausibility rejection at ingestion
    // (presence location and the legacy /api/location good-fix reference); the
    // good_* reference is the plausible position, never a bypassed wild fix.
    const fixes: { latitude: number; longitude: number; at: number }[] = [];
    if ((await this.db.one("SELECT to_regclass('driver_locations') AS t"))?.t) {
      const legacy = await this.db.one('SELECT lat,lng,updated_at,good_lat,good_lng,good_at FROM driver_locations WHERE driver_id=?', driverId);
      if (legacy) fixes.push(legacy.good_at != null
        ? { latitude: Number(legacy.good_lat), longitude: Number(legacy.good_lng), at: Number(legacy.good_at) }
        : { latitude: Number(legacy.lat), longitude: Number(legacy.lng), at: Number(legacy.updated_at) });
    }
    if ((await this.db.one("SELECT to_regclass('driver_latest_locations') AS t"))?.t) {
      const presence = await this.db.one('SELECT lat,lng,effective_at,good_lat,good_lng,good_at FROM driver_latest_locations WHERE driver_id=?', driverId);
      if (presence) fixes.push({ latitude: Number(presence.good_lat), longitude: Number(presence.good_lng), at: Number(presence.good_at) });
    }
    return fixes.sort((a, b) => b.at - a.at)[0] ?? null;
  }

  private async loadRideForArrival(orderId: number) {
    const order = await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', orderId) ?? this.fail(404, 'not_found');
    if (order!.service !== 'ride') this.fail(409, 'not_a_ride');
    if (!['assigned', 'at_pickup'].includes(order!.status as string) || order!.driver_id == null) this.fail(409, 'cannot_arrive');
    if (await this.db.one("SELECT id FROM safety_incidents WHERE order_id=? AND status='open' LIMIT 1", orderId)) this.fail(409, 'safety_hold');
    return order!;
  }

  async arrive(user: Actor, orderId: number, body: Row) {
    if (user.role !== 'driver') this.fail(403, 'forbidden');
    if (user.status !== 'active') this.fail(403, 'blocked');
    const driverId = user.id;
    await this.requireAvailable();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) this.fail(400, 'invalid_input');
    const order = await this.loadRideForArrival(orderId);
    if (Number(order.driver_id) !== driverId) this.fail(409, 'cannot_arrive');
    const row = await this.ensureRow(order);
    if (row.arrived_at != null) return { ok: true, orderId, ride: await this.summary(orderId, { id: driverId, role: 'driver' }, order) };
    if (order.pickup_lat == null || order.pickup_lng == null) this.fail(409, 'arrival_fix_missing');
    const fix = await this.latestFix(driverId);
    if (!fix) this.fail(409, 'arrival_fix_missing');
    const now = Date.now();
    if (fix.at > now || now - fix.at > RIDE_ARRIVAL_FIX_MAX_AGE_MS) this.fail(409, 'arrival_fix_stale');
    const distance = haversineMeters(fix, { latitude: Number(order.pickup_lat), longitude: Number(order.pickup_lng) });
    if (distance > RIDE_ARRIVAL_RADIUS_METERS) this.fail(409, 'arrival_too_far');
    await this.db.run("UPDATE ride_lifecycle SET arrived_at=?,arrival_source='gps',arrival_actor_id=?,updated_at=? WHERE order_id=?", now, driverId, now, orderId);
    await this.db.run("INSERT INTO security_events(actor_id,order_id,action,detail,created_at) VALUES(?,?,'RIDE_ARRIVED',?,?)",
      driverId, orderId, JSON.stringify({ source: 'gps', distanceMeters: Math.round(distance), fixAgeMs: now - fix.at }), now);
    return { ok: true, orderId, ride: await this.summary(orderId, { id: driverId, role: 'driver' }, order) };
  }

  private reason(body: Row) {
    const value = body?.reason;
    if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) this.fail(400, 'reason_required');
    return (value as string).trim();
  }
  private fields(body: Row, allowed: string[]) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) this.fail(400, 'invalid_input');
  }

  async overrideArrival(admin: Actor, orderId: number, body: Row) {
    if (admin.role !== 'admin') this.fail(403, 'forbidden');
    await this.requireAvailable();
    this.fields(body, ['reason']);
    const reason = this.reason(body);
    const order = await this.loadRideForArrival(orderId);
    const row = await this.ensureRow(order);
    if (row.arrived_at != null) return { ok: true, orderId, ride: await this.summary(orderId, admin, order) };
    const now = Date.now();
    await this.db.run("UPDATE ride_lifecycle SET arrived_at=?,arrival_source='operator_override',arrival_actor_id=?,updated_at=? WHERE order_id=?", now, admin.id, now, orderId);
    await this.db.run("INSERT INTO security_events(actor_id,order_id,action,detail,created_at) VALUES(?,?,'RIDE_ARRIVAL_OVERRIDE',?,?)",
      admin.id, orderId, JSON.stringify({ reason, driverId: Number(order.driver_id), assignmentEpoch: Number(order.assignment_epoch) }), now);
    return { ok: true, orderId, ride: await this.summary(orderId, admin, order) };
  }

  async resetBoarding(admin: Actor, orderId: number, body: Row) {
    if (admin.role !== 'admin') this.fail(403, 'forbidden');
    await this.requireAvailable();
    this.fields(body, ['reason']);
    const reason = this.reason(body);
    const order = await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', orderId) ?? this.fail(404, 'not_found');
    if (order!.service !== 'ride' || !(await this.db.one('SELECT order_id FROM ride_lifecycle WHERE order_id=?', orderId))) this.fail(409, 'boarding_not_required');
    await this.db.run(`INSERT INTO ride_boarding_attempts(order_id,assignment_epoch,failures) VALUES(?,?,0)
      ON CONFLICT(order_id) DO UPDATE SET assignment_epoch=excluded.assignment_epoch,failures=0`, orderId, Number(order!.assignment_epoch));
    await this.db.run("INSERT INTO security_events(actor_id,order_id,action,detail,created_at) VALUES(?,?,'BOARDING_RESET',?,?)",
      admin.id, orderId, JSON.stringify({ reason }), Date.now());
    return { ok: true, orderId };
  }

  /** Advance guard for cohort rides; legacy orders have no row and pass through. */
  async guardAdvance(order: Row, driverId: number, next: string, boardingCode: unknown) {
    if (order.service !== 'ride' || !(await this.available())) return;
    const row = await this.db.one('SELECT * FROM ride_lifecycle WHERE order_id=? FOR UPDATE', order.id);
    if (!row) return;
    const current = Number(row.assignment_epoch) === Number(order.assignment_epoch) && Number(row.driver_id) === Number(order.driver_id);
    if (next === 'completed' || next === 'returned') {
      if (!current) this.fail(409, 'assignment_changed');
      return;
    }
    if (next !== 'at_pickup' && next !== 'in_transit') return;
    if (!current) this.fail(409, 'assignment_changed');
    if (row.arrived_at == null) this.fail(409, 'arrival_required');
    if (next !== 'in_transit' || !Number(row.boarding_required)) return;
    const attempts = await this.db.one('SELECT failures FROM ride_boarding_attempts WHERE order_id=? FOR UPDATE', order.id);
    const failures = Number(attempts?.failures ?? 0);
    if (failures >= eligibilityDefaults.newBoardingChallengeAttempts) this.fail(409, 'boarding_locked');
    const supplied = typeof boardingCode === 'string' ? boardingCode.trim()
      : Number.isSafeInteger(boardingCode) ? String(boardingCode) : '';
    if (!row.boarding_code || supplied !== row.boarding_code) {
      const now = Date.now(), nextFailures = failures + 1;
      await this.db.run(`INSERT INTO ride_boarding_attempts(order_id,assignment_epoch,failures) VALUES(?,?,?)
        ON CONFLICT(order_id) DO UPDATE SET assignment_epoch=excluded.assignment_epoch,failures=ride_boarding_attempts.failures+1`, order.id, Number(order.assignment_epoch), 1);
      await this.db.run("INSERT INTO security_events(actor_id,order_id,action,created_at) VALUES(?,?,'BOARDING_FAILED',?)", driverId, order.id, now);
      if (nextFailures >= eligibilityDefaults.newBoardingChallengeAttempts) {
        await this.db.run("INSERT INTO security_events(actor_id,order_id,action,created_at) VALUES(?,?,'BOARDING_LOCKED',?)", driverId, order.id, now);
        if (this.onBoardingLocked) await this.onBoardingLocked(Number(order.id));
      }
      this.fail(400, 'wrong_boarding_code');
    }
  }
}

export function registerRideLifecycleRoutes(route: Register, service: RideLifecycle) {
  route('POST', '/api/orders/:id/arrive', ctx => service.arrive(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/admin/orders/:id/arrival/override', ctx => service.overrideArrival(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/admin/orders/:id/boarding-reset', ctx => service.resetBoarding(ctx.user, Number(ctx.params[0]), ctx.body));
}

