import { randomUUID } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import type { CityId, Order, Plan, Point, Role, Settings, User } from '../../src/model.ts';

// SPEC-change-destination.md: a proposal binds the whole agreement and assignment, not merely an order id.
type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[]; body: Row }) => Promise<unknown>) => unknown;

export type DestinationDeps = {
  need: (user: User, ...roles: Role[]) => void;
  needActive: (user: User) => void;
  fail: (status: number, message: string) => never;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  identityKey: (kind: string, value: string | number) => string;
  text: (value: unknown, max: number, required?: boolean) => string;
  isCity: (value: unknown) => value is CityId;
  bookedPoint: (value: unknown, city: CityId) => Point | null;
  uuid: RegExp;
  db: Persistence;
  settings: () => Promise<Settings>;
  tariffVersionFor: (settings: Record<string, unknown>) => string;
  activePlan: (userId: number) => Promise<Plan | null>;
  safetyFree: (orderId: number) => Promise<unknown>;
  queuePush: (userIds: number[], kind: 'destination_request' | 'destination_accepted' | 'destination_declined', order: number) => Promise<unknown>;
  getOrder: (id: number, viewer: User) => Promise<Order>;
  recommend: (user: User, body: Row) => Promise<{ price: number; km: number; minutes: number;
    slow: string[]; closed: string[]; avoids: string[]; estimated: boolean }>;
  restoredDiscount: (orderId: number, price: number, current: number | null) => Promise<number | null>;
  commissionOn: (price: number, rate: number) => number;
};

const changeable = ['assigned', 'at_pickup', 'in_transit'];

/** Old assignments store only a rounded amount, so they cannot recover the rate and stay unchanged. */
export function destinationEligible(r: Row) {
  return !!r.driver_id && changeable.includes(r.status) && typeof r.commission_rate === 'number'
    && Number.isFinite(r.commission_rate) && r.commission_rate >= 0 && r.commission_rate <= 1 && r.commission != null;
}

export function destinationOriginal(r: Row) {
  return JSON.stringify([r.customer_id, r.driver_id, r.assigned_at, r.status, r.service, r.option, r.loading_help, r.shared,
    r.pickup_city, r.pickup_lat, r.pickup_lng, r.pickup_note, r.dropoff_city, r.dropoff_lat, r.dropoff_lng,
    r.dropoff_note, r.price, r.discount, r.commission, r.commission_rate, r.updated_at]);
}

function destinationView(p: Row, r: Row) {
  return { id: p.id as string, city: p.dropoff_city,
    point: p.dropoff_lat == null ? null : { latitude: p.dropoff_lat as number, longitude: p.dropoff_lng as number },
    note: p.dropoff_note as string, oldPrice: r.price as number, oldDiscount: (r.discount ?? 0) as number,
    price: p.price as number, discount: (p.discount ?? 0) as number, commission: p.commission as number,
    expiresAt: p.expires_at as number, road: JSON.parse(p.road_info as string) };
}

/** The live proposal that still matches the order as it stands, or null. */
export async function pendingDestination(db: Persistence, r: Row) {
  if (!destinationEligible(r)) return null;
  const p = await db.one("SELECT * FROM destination_changes WHERE order_id = ? AND driver_id = ? AND state = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1", r.id, r.driver_id, Date.now());
  return p && p.original === destinationOriginal(r) ? destinationView(p, r) : null;
}

/** T33: the capability follows the storage, not the dialect — either backend that hosts the tables serves it. */
export async function destinationAvailable(db: Persistence) {
  if (db.backend === 'postgres') return !!(await db.one("SELECT to_regclass('destination_changes') AS t"))?.t;
  if (db.backend !== 'sqlite') return false;
  return !!(await db.one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'destination_changes'"));
}
export function registerDestinationRoutes(route: Register, deps: DestinationDeps) {
  const { need, needActive, fail, limit, identityKey, text, isCity, bookedPoint, uuid, db, settings, tariffVersionFor,
    activePlan, safetyFree, queuePush, getOrder, recommend, restoredDiscount, commissionOn } = deps;
  const available = async () => { if (!(await destinationAvailable(db))) fail(409, 'destination_unavailable'); };
  // The HTTP envelope already owns a transaction on PostgreSQL — join it; SQLite keeps its short write transaction.
  const inTx = async (work: () => Promise<unknown>) => {
    if (db.inTransaction) return work();
    await db.exec(db.backend === 'postgres' ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try { const value = await work(); await db.exec('COMMIT'); return value; }
    catch (error) { try { if (db.inTransaction) await db.exec('ROLLBACK'); } catch { /* the owner rolls back */ } throw error; }
  };

  route('POST', '/api/orders/:id/destination/quote', async ({ user, params, body }) => {
    need(user, 'customer'); needActive(user); await available();
    await limit(identityKey('destination-quote', user.id), 60, 10 * 60_000);
    const id = Number(params[0]);
    const before = await db.one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', id, user.id) ?? fail(404, 'not_found');
    if (!destinationEligible(before)) fail(409, 'destination_unavailable');
    if (await pendingDestination(db, before)) fail(409, 'destination_pending');
    if (!isCity(body.city)) fail(400, 'invalid_city');
    const note = text(body.note, 200);
    const point = bookedPoint(body.point, body.city);
    if (body.city === before.dropoff_city && note === before.dropoff_note &&
      (point?.latitude ?? null) === before.dropoff_lat && (point?.longitude ?? null) === before.dropoff_lng) fail(400, 'destination_unchanged');
    const tariff = tariffVersionFor(await settings() as Record<string, unknown>);
    const plan = await activePlan(user.id);
    const proposal = await recommend(user, { service: before.service, option: before.option, loadingHelp: !!before.loading_help,
      pickupCity: before.pickup_city, dropoffCity: body.city,
      pickupPoint: before.pickup_lat == null ? null : { latitude: before.pickup_lat, longitude: before.pickup_lng }, dropoffPoint: point });
    const discount = await restoredDiscount(id, proposal.price, before.discount);
    const changeId = randomUUID(), now = Date.now();
    return inTx(async () => {
      const current = await db.one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', id, user.id) ?? fail(404, 'not_found');
      if (!destinationEligible(current) || destinationOriginal(current) !== destinationOriginal(before)) fail(409, 'order_changed');
      if (await pendingDestination(db, current)) fail(409, 'destination_pending');
      if (tariffVersionFor(await settings() as Record<string, unknown>) !== tariff || await activePlan(user.id) !== plan) fail(409, 'price_changed');
      await db.run("DELETE FROM destination_changes WHERE order_id = ? AND state IN ('quote', 'pending') AND expires_at < ?", id, now - 86_400_000);
      const road = { slow: proposal.slow, closed: proposal.closed, avoids: proposal.avoids, estimated: proposal.estimated, minutes: proposal.minutes };
      await db.run(`INSERT INTO destination_changes (id, order_id, customer_id, driver_id, original, dropoff_city, dropoff_lat, dropoff_lng,
        dropoff_note, price, discount, commission, route_km, road_info, tariff_version, customer_plan, state, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quote', ?, ?)`,
      changeId, id, user.id, current.driver_id, destinationOriginal(current), body.city, point?.latitude ?? null, point?.longitude ?? null,
      note, proposal.price, discount, commissionOn(proposal.price, current.commission_rate), proposal.km, JSON.stringify(road), tariff, plan, now, now + 120_000);
      const saved = (await db.one('SELECT * FROM destination_changes WHERE id = ?', changeId))!;
      return destinationView(saved, current);
    });
  });

  route('POST', '/api/orders/:id/destination/propose', async ({ user, params, body }) => {
    need(user, 'customer'); needActive(user); await available();
    if (typeof body.id !== 'string' || !uuid.test(body.id)) fail(400, 'invalid_input');
    const id = Number(params[0]);
    return inTx(async () => {
      const r = await db.one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', id, user.id) ?? fail(404, 'not_found');
      const p = await db.one('SELECT * FROM destination_changes WHERE id = ? AND order_id = ? AND customer_id = ?', body.id, id, user.id) ?? fail(404, 'not_found');
      if (p.state === 'pending' && p.expires_at > Date.now() && p.original === destinationOriginal(r)) return getOrder(id, user);
      if (p.state !== 'quote' || p.expires_at <= Date.now()) fail(409, 'destination_expired');
      if (!destinationEligible(r) || p.original !== destinationOriginal(r)) fail(409, 'order_changed');
      if (await pendingDestination(db, r)) fail(409, 'destination_pending');
      if (tariffVersionFor(await settings() as Record<string, unknown>) !== p.tariff_version || await activePlan(user.id) !== p.customer_plan) fail(409, 'price_changed');
      await safetyFree(id);
      // Uber parity: the polled in-app pending card is the authoritative channel; push only nudges, so it never gates a proposal.
      await db.run("UPDATE destination_changes SET state = 'pending', expires_at = ? WHERE id = ? AND state = 'quote'", Date.now() + 10 * 60_000, p.id);
      await queuePush([r.driver_id], 'destination_request', id);
      return getOrder(id, user);
    });
  });

  route('POST', '/api/orders/:id/destination/decision', async ({ user, params, body }) => {
    need(user, 'driver'); needActive(user); await available();
    if (typeof body.id !== 'string' || !uuid.test(body.id) || !['accept', 'decline'].includes(body.decision)) fail(400, 'invalid_input');
    const id = Number(params[0]);
    return inTx(async () => {
      const p = await db.one('SELECT * FROM destination_changes WHERE id = ? AND order_id = ? AND driver_id = ?', body.id, id, user.id) ?? fail(404, 'not_found');
      const desired = body.decision === 'accept' ? 'accepted' : 'declined';
      if (p.state === desired) return getOrder(id, user);
      if (p.state !== 'pending' || p.expires_at <= Date.now()) fail(409, 'destination_expired');
      const r = await db.one('SELECT * FROM orders WHERE id = ?', id) ?? fail(404, 'not_found');
      if (!destinationEligible(r) || r.driver_id !== user.id || p.original !== destinationOriginal(r)) fail(409, 'order_changed');
      await safetyFree(id);
      const now = Date.now();
      if (desired === 'accepted') {
        await db.run(`UPDATE orders SET dropoff_city = ?, dropoff_lat = ?, dropoff_lng = ?, dropoff_note = ?, price = ?, discount = ?,
          commission = ?, recommended_price = ?, route_km = ?, updated_at = ? WHERE id = ?`,
        p.dropoff_city, p.dropoff_lat, p.dropoff_lng, p.dropoff_note, p.price, p.discount, p.commission, p.price, p.route_km, now, id);
      }
      await db.run('UPDATE destination_changes SET state = ?, decided_at = ? WHERE id = ? AND state = ?', desired, now, p.id, 'pending');
      await db.run('INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
        user.id, id, desired === 'accepted' ? 'DESTINATION_ACCEPTED' : 'DESTINATION_DECLINED',
        JSON.stringify({ proposalId: p.id, oldPrice: r.price, newPrice: p.price, oldDiscount: r.discount ?? 0, newDiscount: p.discount ?? 0 }), now);
      await queuePush([r.customer_id], desired === 'accepted' ? 'destination_accepted' : 'destination_declined', id);
      return getOrder(id, user);
    });
  });

  route('POST', '/api/orders/:id/destination/withdraw', async ({ user, params, body }) => {
    need(user, 'customer'); needActive(user); await available();
    if (typeof body.id !== 'string' || !uuid.test(body.id)) fail(400, 'invalid_input');
    const id = Number(params[0]);
    return inTx(async () => {
      const p = await db.one('SELECT * FROM destination_changes WHERE id = ? AND order_id = ? AND customer_id = ?', body.id, id, user.id) ?? fail(404, 'not_found');
      if (p.state === 'withdrawn') return getOrder(id, user);
      if (p.state !== 'pending' || p.expires_at <= Date.now()) fail(409, 'destination_expired');
      const r = await db.one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', id, user.id) ?? fail(404, 'not_found');
      if (!destinationEligible(r) || p.original !== destinationOriginal(r)) fail(409, 'order_changed');
      await db.run("UPDATE destination_changes SET state = 'withdrawn', decided_at = ? WHERE id = ?", Date.now(), p.id);
      return getOrder(id, user);
    });
  });
}
