// Shop delivery (SRS §7 DLV, §7.1 MER; owner decisions D-1, D-2): a customer orders goods from one local shop, the shop
// accepts and prepares them, a captain collects them with the shop's pickup code and delivers them for cash at the door.
// Behaviour studied from HAAT (actor-named states, a labelled service fee, weighed lines as estimates) and Souq (per-line
// substitution consent, a minimum that a decline can fall through, a customer-held delivery code, append-only money).
// No competitor code, strings or art are used.
//
// It lives on the one `orders` row (service = 'shop') with a `shop_orders` child, so history, chat, receipts, ratings,
// disputes and admin tools keep working. Every statement uses `?` placeholders and runs on SQLite and PostgreSQL.
// The line is hidden unless WIND_ENABLED_SERVICES lists `shop` (ONE-13), and D-2 keeps it off in production until
// PostgreSQL, off-host backup and a restore drill are in place.
import { randomInt } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import { needStaff, staffActor } from './ops.ts';
import { officeState, returnCustody } from './office.ts';
import {
  adminShopCancels, goodsCapFor, handoverExceptions, isCity, lineAgorot, merchantRejects, shopCategories, shopExceptionReasons, shopPolicies,
  varianceAllowed, doorCashMaxCents, latinDigits,
  type CityId, type HandoverException, type Merchant, type MerchantItem, type MerchantState, type Order, type Point, type Role,
  type Settings, type ShopCancelReason, type ShopChange, type ShopFault, type ShopLine, type ShopPolicy, type ShopView, type User, type VarianceReason,
} from '../../src/model.ts';

type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[]; body: Row; query: URLSearchParams }) => Promise<unknown>) => unknown;
export type ShopPushKind = 'merchant_order' | 'shop_consent' | 'shop_update' | 'cancelled' | 'in_transit' | 'attention' | 'cash' | 'approved';

export type ShopDeps = {
  db: Persistence;
  need: (user: User, ...roles: Role[]) => void;
  needActive: (user: User) => void;
  fail: (status: number, message: string) => never;
  text: (value: unknown, max: number, required?: boolean) => string;
  bookedPoint: (value: unknown, city: CityId) => Point | null;
  normalizePhone: (value: string) => string | null;
  settings: () => Promise<Settings>;
  enabled: () => boolean;
  queuePush: (userIds: (number | null)[], kind: never, order: number, path?: string) => Promise<unknown>;
  getOrder: (id: number, viewer: User) => Promise<Order>;
  adminIds: () => Promise<number[]>;
  /** Releases a shop order to captains: the same broadcast a parcel uses. */
  dispatch: (orderId: number, customerId: number) => Promise<unknown>;
  limit: (key: string, maximum: number, windowMs: number) => Promise<unknown>;
  identityKey: (kind: string, value: string | number) => string;
  /** What a captain owes Wind in cash now (main.ts cash balances), in agorot. */
  owedCents: (driverId: number) => Promise<number>;
  flushPush: () => Promise<unknown>;
  /** PostgreSQL ledger: door cash owed to the shop and to Wind (goods, service fee), and failed-trip pay. No-op on SQLite. */
  journal: (orderId: number, driverId: number, kind: 'collection' | 'trip', amounts: { goods?: number; service?: number; over?: number; trip?: number }) => Promise<unknown>;
  /** main.ts's replayable driver command envelope: a lost acknowledgement replays the stored outcome. */
  driverCommand: (user: User, id: number, body: Row, apply: (user: User, id: number, input: Row) => Promise<Order>) => Promise<unknown>;
};

const MINUTE = 60_000, DAY = 86_400_000;
const lockedTries = 5; // SHIP-05: the same five misses as the delivery code
const code4 = () => String(randomInt(1000, 10000));
const town = () => process.env.WIND_SHOP_TOWN?.trim() || null;
/** Minutes past midnight and weekday in Palestine time, where every shop is: Intl follows daylight saving. */
const shopClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hebron', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function localClock(at: number) {
  const parts = Object.fromEntries(shopClock.formatToParts(at).map(p => [p.type, p.value]));
  return { weekday: weekdays.indexOf(parts.weekday), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
/** Open now: no hours recorded means open whenever the shop is active; a closing minute before the opening one runs past midnight. */
export function openAt(hours: { weekday: number; open_min: number; close_min: number }[], at: number) {
  if (!hours.length) return true;
  const { weekday, minute } = localClock(at);
  return hours.some(h => {
    if (h.open_min <= h.close_min) return h.weekday === weekday && minute >= h.open_min && minute < h.close_min;
    return (h.weekday === weekday && minute >= h.open_min) || (h.weekday === (weekday + 6) % 7 && minute < h.close_min);
  });
}

/** DLV-06, in the SRS order. `askFirst` is an "ask me first" substitution; `T` the goods after the change; fees in agorot. */
export function evaluateChange(o: { goodsAfter: number; fees: number; ceiling: number; askFirst: boolean; minimum: number; cap: number }):
  'refuse_ceiling' | 'pause' | 'below_minimum' | 'apply' {
  if (o.goodsAfter + o.fees > o.ceiling) return 'refuse_ceiling';
  if (o.askFirst) return 'pause';
  if (o.goodsAfter < o.minimum) return 'below_minimum';
  if (o.goodsAfter > o.cap) return 'pause';
  return 'apply';
}

/** The tables exist on this database (SQLite creates them at start; PostgreSQL after migration 33). */
export async function shopTables(db: Persistence) {
  return db.memo('shopTables', async () => db.backend === 'postgres'
    ? !!(await db.one("SELECT to_regclass('shop_orders') AS t"))?.t
    : !!(await db.one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shop_orders'")));
}

const lineView = (l: Row): ShopLine => ({ id: Number(l.id), itemId: l.item_id == null ? null : Number(l.item_id), nameAr: l.name_ar, nameEn: l.name_en,
  policy: l.policy, byWeight: !!l.by_weight, qtyMilli: Number(l.qty_milli), unitAgorot: Number(l.unit_agorot), estimateAgorot: Number(l.estimate_agorot),
  finalAgorot: l.final_agorot == null ? null : Number(l.final_agorot), removed: !!l.removed, substituteFor: l.substitute_for == null ? null : Number(l.substitute_for) });
/** Goods now: the merchant's final price where recorded, the estimate otherwise, removed lines excluded. */
export const goodsOf = (lines: Pick<ShopLine, 'removed' | 'finalAgorot' | 'estimateAgorot'>[]) =>
  lines.filter(l => !l.removed).reduce((sum, l) => sum + (l.finalAgorot ?? l.estimateAgorot), 0);

export function registerShop(route: Register, deps: ShopDeps) {
  const { db, need, needActive, fail, text, bookedPoint, normalizePhone, settings, queuePush, getOrder, adminIds } = deps;
  const push = (ids: (number | null)[], kind: ShopPushKind, order: number, path?: string) => queuePush(ids, kind as never, order, path);
  const available = async () => { if (!deps.enabled() || !(await shopTables(db))) fail(409, 'service_unavailable'); };
  const inTx = async <T>(work: () => Promise<T>): Promise<T> => {
    if (db.inTransaction) return work();
    await db.exec('BEGIN IMMEDIATE');
    try { const value = await work(); await db.exec('COMMIT'); return value; }
    catch (error) { try { if (db.inTransaction) await db.exec('ROLLBACK'); } catch { /* the owner rolls back */ } throw error; }
  };
  const forUpdate = db.backend === 'postgres' ? ' FOR UPDATE' : '';
  const audit = (actor: number, order: number | null, action: string, detail: unknown = {}) =>
    db.run('INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)', actor, order, action, JSON.stringify(detail), Date.now());
  const ceilingAgorot = async () => Math.round((await settings()).orderCashCeiling * 100);
  /** DLV-13: when the open handover exception was raised (its newest exception check). */
  const exceptionSince = `(SELECT MAX(c.created_at) FROM shop_handover_checks c WHERE c.order_id = o.id AND c.result = 'exception')`;
  /** DLV-13: an open handover exception older than the owner-set minutes is the operator's to decide. */
  /** The open exception's identity: when its newest exception check was recorded (null when none is open). */
  async function openExceptionAt(orderId: number) {
    const row = await db.one(`SELECT ${exceptionSince} AS since FROM orders o JOIN shop_orders s ON s.order_id = o.id
      WHERE o.id = ? AND o.status = 'at_pickup' AND s.handover_exception IS NOT NULL`, orderId);
    return row?.since == null ? null : Number(row.since);
  }
  async function handoverOverdue(orderId: number, now = Date.now()) {
    const since = await openExceptionAt(orderId);
    return since != null && since <= now - (await settings()).shopHandoverMinutes * MINUTE;
  }

  // ---------- merchants ----------
  const merchantOf = async (userId: number) => db.one('SELECT * FROM merchants WHERE owner_user_id = ?', userId);
  const needMerchant = async (user: User) => {
    need(user, 'customer'); needActive(user); await available();
    const m = await merchantOf(user.id);
    if (!m || m.status === 'pending') fail(403, 'not_merchant');
    return m!;
  };
  const hoursOf = (merchantId: number) => db.all('SELECT weekday, open_min, close_min FROM merchant_hours WHERE merchant_id = ? ORDER BY weekday, open_min', merchantId);
  const licenceValid = (m: Row, now = Date.now()) => Number(m.licence_expires_at) > now;
  async function merchantView(m: Row, operator = false, owner = false): Promise<Merchant> {
    const hours = await hoursOf(m.id);
    return { id: Number(m.id), name: m.name, category: m.category, city: m.city, point: { latitude: m.lat, longitude: m.lng }, phone: m.phone ?? null,
      status: m.status, pausedNew: !!m.paused_new, open: m.status === 'active' && !m.paused_new && licenceValid(m) && openAt(hours as never, Date.now()),
      minOrderAgorot: Number(m.min_order_agorot), deliveryFeeAgorot: Number(m.delivery_fee_agorot), serviceFeeAgorot: Number(m.service_fee_agorot),
      prepMinutes: Number(m.prep_minutes),
      hours: hours.map(h => ({ weekday: Number(h.weekday), openMinute: Number(h.open_min), closeMinute: Number(h.close_min) })),
      ...((operator || owner) && { commissionBps: Number(m.commission_bps), licenceNo: m.licence_no, licenceExpiresAt: Number(m.licence_expires_at) }),
      ...(operator && { ownerPhone: (await db.one('SELECT phone FROM users WHERE id = ?', m.owner_user_id))?.phone }) };
  }
  const itemView = (i: Row): MerchantItem => ({ id: Number(i.id), section: i.section, nameAr: i.name_ar, nameEn: i.name_en,
    priceAgorot: Number(i.price_agorot), byWeight: !!i.by_weight, available: !!i.available });
  const agorot = (v: unknown, max = 10_000_000) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max ? v as number : fail(400, 'invalid_input');
  const hoursInput = (v: unknown) => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length > 14) fail(400, 'invalid_input');
    return (v as Row[]).map(h => {
      if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) fail(400, 'invalid_input');
      return { weekday: h.weekday as number, open: agorot(h.openMinute, 1439), close: agorot(h.closeMinute, 1440) };
    });
  };
  const saveHours = async (merchantId: number, hours: { weekday: number; open: number; close: number }[]) => {
    await db.run('DELETE FROM merchant_hours WHERE merchant_id = ?', merchantId);
    const seen = new Set<string>();
    for (const h of hours) {
      if (h.open === h.close || seen.has(`${h.weekday}:${h.open}`)) fail(400, 'invalid_input');
      seen.add(`${h.weekday}:${h.open}`);
      await db.run('INSERT INTO merchant_hours (merchant_id, weekday, open_min, close_min) VALUES (?, ?, ?, ?)', merchantId, h.weekday, h.open, h.close);
    }
  };

  // ACC-06 / MER-08: a customer applies; an admin approves. Merchant mode is this same account (MER-05), never a role switch.
  route('POST', '/api/merchant/apply', async ({ user, body }) => {
    need(user, 'customer'); needActive(user); await available();
    await deps.limit(deps.identityKey('merchant-apply', user.id), 5, DAY);
    if (await merchantOf(user.id)) fail(409, 'merchant_exists');
    const category = shopCategories.includes(body.category) ? body.category : fail(409, 'category_closed');
    if (!isCity(body.city)) fail(400, 'invalid_city');
    const point = bookedPoint(body.point, body.city) ?? fail(400, 'invalid_input');
    const phone = normalizePhone(String(body.phone ?? '')) ?? fail(400, 'invalid_phone');
    const licenceNo = text(body.licenceNo, 60);
    const expires = Number.isSafeInteger(body.licenceExpiresAt) && body.licenceExpiresAt > Date.now() ? body.licenceExpiresAt as number : fail(400, 'invalid_input');
    const now = Date.now();
    return inTx(async () => {
      const id = Number((await db.run(`INSERT INTO merchants (owner_user_id, name, category, city, lat, lng, phone, status, paused_new, min_order_agorot,
        delivery_fee_agorot, service_fee_agorot, commission_bps, prep_minutes, licence_no, licence_expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, user.id, text(body.name, 80), category, body.city, point.latitude, point.longitude,
        phone, 3000, 1000, 200, 1000, 20, licenceNo, expires, now, now)).lastInsertRowid);
      const hours = hoursInput(body.hours);
      if (hours) await saveHours(id, hours);
      await push(await adminIds(), 'attention', 0, '/admin/merchants');
      return { merchant: await merchantView((await db.one('SELECT * FROM merchants WHERE id = ?', id))!, false, true) };
    });
  });
  route('GET', '/api/merchant', async ({ user }) => {
    need(user, 'customer');
    if (!(await shopTables(db))) return { merchant: null };
    const m = await merchantOf(user.id);
    return { merchant: m ? await merchantView(m, false, true) : null };
  });
  // MER-02: the shop edits its catalogue, hours and the pause; prices are integer agorot (PAY-01).
  route('GET', '/api/merchant/catalogue', async ({ user }) => {
    const m = await needMerchant(user);
    return { items: (await db.all('SELECT * FROM merchant_items WHERE merchant_id = ? ORDER BY section, sort, id', m.id)).map(itemView) };
  });
  const itemInput = (body: Row) => ({ section: text(body.section, 40), nameAr: text(body.nameAr, 80), nameEn: text(body.nameEn, 80),
    price: agorot(body.priceAgorot, 1_000_000), byWeight: !!body.byWeight, available: body.available !== false });
  route('POST', '/api/merchant/items', async ({ user, body }) => {
    const m = await needMerchant(user);
    const i = itemInput(body);
    if (i.price < 1) fail(400, 'invalid_input');
    if (Number((await db.one('SELECT COUNT(*) AS n FROM merchant_items WHERE merchant_id = ?', m.id))!.n) >= 500) fail(409, 'too_many_items');
    const id = Number((await db.run(`INSERT INTO merchant_items (merchant_id, section, name_ar, name_en, price_agorot, by_weight, available, sort, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`, m.id, i.section, i.nameAr, i.nameEn, i.price, i.byWeight ? 1 : 0, i.available ? 1 : 0, Date.now())).lastInsertRowid);
    return itemView((await db.one('SELECT * FROM merchant_items WHERE id = ?', id))!);
  });
  route('POST', '/api/merchant/items/:id', async ({ user, params, body }) => {
    const m = await needMerchant(user);
    const item = await db.one('SELECT * FROM merchant_items WHERE id = ? AND merchant_id = ?', Number(params[0]), m.id) ?? fail(404, 'not_found');
    // Availability alone is the common edit (the HAAT/Souq "out of stock" toggle); a full edit sends every field.
    if (Object.keys(body).length === 1 && typeof body.available === 'boolean') {
      await db.run('UPDATE merchant_items SET available = ?, updated_at = ? WHERE id = ?', body.available ? 1 : 0, Date.now(), item.id);
    } else {
      const i = itemInput(body);
      if (i.price < 1) fail(400, 'invalid_input');
      await db.run(`UPDATE merchant_items SET section = ?, name_ar = ?, name_en = ?, price_agorot = ?, by_weight = ?, available = ?, updated_at = ? WHERE id = ?`,
        i.section, i.nameAr, i.nameEn, i.price, i.byWeight ? 1 : 0, i.available ? 1 : 0, Date.now(), item.id);
    }
    return itemView((await db.one('SELECT * FROM merchant_items WHERE id = ?', item.id))!);
  });
  route('POST', '/api/merchant/settings', async ({ user, body }) => {
    const m = await needMerchant(user);
    return inTx(async () => {
      // Pausing never cancels accepted orders (MER-02): it only stops new ones.
      if (body.paused !== undefined) await db.run('UPDATE merchants SET paused_new = ?, updated_at = ? WHERE id = ?', body.paused ? 1 : 0, Date.now(), m.id);
      if (body.prepMinutes !== undefined) {
        if (!Number.isInteger(body.prepMinutes) || body.prepMinutes < 1 || body.prepMinutes > 180) fail(400, 'invalid_input');
        await db.run('UPDATE merchants SET prep_minutes = ?, updated_at = ? WHERE id = ?', body.prepMinutes, Date.now(), m.id);
      }
      const hours = hoursInput(body.hours);
      if (hours) await saveHours(Number(m.id), hours);
      return { merchant: await merchantView((await db.one('SELECT * FROM merchants WHERE id = ?', m.id))!, false, true) };
    });
  });

  // ---------- browse (customer) ----------
  route('GET', '/api/shop/merchants', async ({ user, query }) => {
    need(user, 'customer', 'admin'); await available();
    const city = query.get('city');
    if (city !== null && !isCity(city)) fail(400, 'invalid_city');
    const rows = await db.all(`SELECT * FROM merchants WHERE status IN ('active','paused') ${city ? 'AND city = ?' : ''} ORDER BY name LIMIT 200`, ...(city ? [city] : []));
    const pilot = town();
    return { town: pilot, merchants: await Promise.all(rows.filter(m => !pilot || m.city === pilot).map(m => merchantView(m))) };
  });
  route('GET', '/api/shop/merchants/:id', async ({ user, params }) => {
    need(user, 'customer', 'admin'); await available();
    const m = await db.one("SELECT * FROM merchants WHERE id = ? AND status IN ('active','paused')", Number(params[0])) ?? fail(404, 'not_found');
    const items = await db.all('SELECT * FROM merchant_items WHERE merchant_id = ? AND available = 1 ORDER BY section, sort, id', m.id);
    return { merchant: await merchantView(m), items: items.map(itemView) };
  });

  // ---------- order reads ----------
  const shopRow = (orderId: number) => db.one('SELECT * FROM shop_orders WHERE order_id = ?', orderId);
  const linesOf = async (orderId: number) => (await db.all('SELECT * FROM shop_lines WHERE order_id = ? ORDER BY id', orderId)).map(lineView);
  const snapshot = async (orderId: number, reason: string, s?: Row) => {
    const lines = await linesOf(orderId);
    await db.run('INSERT INTO shop_snapshots (order_id, reason, goods_agorot, body, created_at) VALUES (?, ?, ?, ?, ?)',
      orderId, reason, goodsOf(lines), JSON.stringify({ lines, packages: s?.packing ? JSON.parse(s.packing) : null }), Date.now());
  };
  /** Who this viewer is on the order; null when they may not see it. */
  async function roleOn(r: Row, viewer: User): Promise<ShopView['role'] | null> {
    if (viewer.role === 'admin') return 'admin';
    if (viewer.id === r.customer_id) return 'customer';
    if (viewer.id === r.driver_id) return 'driver';
    if (viewer.role === 'driver' && r.status === 'searching') return 'driver'; // a job card: getOrder already decided they may see it
    const s = await shopRow(r.id);
    if (s && (await db.one('SELECT 1 FROM merchants WHERE id = ? AND owner_user_id = ?', s.merchant_id, viewer.id))) return 'merchant';
    return null;
  }
  /** The shop part of an order for this viewer: codes only for who may hold them (§2.1a), never for the captain. */
  async function view(r: Row, viewer: User): Promise<ShopView | null> {
    if (r.service !== 'shop' || !(await shopTables(db))) return null;
    const s = await shopRow(r.id);
    if (!s) return null;
    const role = await roleOn(r, viewer);
    if (!role) return null;
    const m = (await db.one('SELECT name, lat, lng FROM merchants WHERE id = ?', s.merchant_id))!;
    const lines = await linesOf(r.id);
    const c = s.merchant_state === 'awaiting_approval' ? await db.one("SELECT * FROM shop_changes WHERE order_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", r.id) : null;
    let change: ShopChange | null = null;
    if (c) {
      const p = JSON.parse(c.payload);
      change = { id: Number(c.id), lineId: Number(c.line_id), kind: c.kind, nameAr: p.nameAr, nameEn: p.nameEn, fromAgorot: p.fromAgorot, toAgorot: p.toAgorot,
        goodsAfterAgorot: p.goodsAfter, expiresAt: Number(c.expires_at), extended: !!c.extended };
    }
    const goods = goodsOf(lines);
    const fault = await db.one('SELECT result FROM shop_faults WHERE order_id = ?', r.id);
    return {
      merchantId: Number(s.merchant_id), merchantName: m.name,
      merchantPoint: (role === 'customer' && s.merchant_state) || (role === 'driver' && viewer.id === r.driver_id) || role === 'merchant' || role === 'admin'
        ? { latitude: m.lat, longitude: m.lng } : null,
      state: s.merchant_state ?? null, acceptDeadline: Number(s.accept_deadline), acceptExtended: !!s.accept_extended,
      prepMinutes: s.prep_minutes == null ? null : Number(s.prep_minutes), acceptedAt: s.accepted_at ?? null, readyAt: s.ready_at ?? null, handedOverAt: s.handed_over_at ?? null,
      goodsEstimateAgorot: Number(s.goods_estimate_agorot), goodsCapAgorot: Number(s.goods_cap_agorot), goodsAgorot: goods,
      deliveryFeeAgorot: Number(s.delivery_fee_agorot), serviceFeeAgorot: Number(s.service_fee_agorot),
      cashAgorot: goods + Number(s.delivery_fee_agorot) + Number(s.service_fee_agorot),
      // The captain sees what to collect and how many packages, not the basket's names until they hold it.
      lines: role === 'driver' && viewer.id !== r.driver_id ? [] : lines,
      change: role === 'driver' ? null : change, cancelReason: s.cancel_reason ?? null, handoverException: s.handover_exception ?? null,
      handoverOverdue: role === 'admin' && !!s.handover_exception && await handoverOverdue(r.id), // DLV-13: support decides now
      ...(role === 'admin' && s.handover_exception ? { handoverExceptionAt: await openExceptionAt(r.id) } : {}), // the episode a decision binds to
      ...(role === 'merchant' && r.status === 'returned' ? { office: await officeState(db, r.id) } : {}),
      packages: s.packing ? JSON.parse(s.packing) : null,
      pickupCode: role === 'merchant' || role === 'admin' ? s.pickup_code : null,
      returnCode: (role === 'merchant' || role === 'admin') && r.status === 'returning' ? r.return_code ?? null : null,
      merchantRating: s.merchant_rating ?? null,
      customerRatingByMerchant: role === 'merchant' || role === 'admin' ? s.customer_rating_by_merchant ?? null : null, fault: (fault?.result as ShopFault) ?? null,
      canCancel: role === 'customer' && r.status === 'requested' && !s.merchant_state,
      canEditLines: role === 'customer' && r.status === 'requested' && !s.merchant_state,
      role,
    };
  }
  /** getOrder's visibility rule: the shop that owns the order sees it too. */
  async function merchantSees(r: Row, viewer: User) {
    if (r.service !== 'shop' || viewer.role !== 'customer' || !(await shopTables(db))) return false;
    return (await roleOn(r, viewer)) === 'merchant';
  }

  // ---------- place (called by createOrder inside the booking transaction) ----------
  type LineInput = { itemId: number; qtyMilli: number; policy: ShopPolicy };
  const lineInputs = (v: unknown): LineInput[] => {
    if (!Array.isArray(v) || v.length < 1 || v.length > 50) fail(400, 'invalid_input');
    return (v as Row[]).map(l => {
      if (!Number.isSafeInteger(l.itemId) || !Number.isSafeInteger(l.qtyMilli) || !shopPolicies.includes(l.policy)) fail(400, 'invalid_input');
      return { itemId: l.itemId as number, qtyMilli: l.qtyMilli as number, policy: l.policy as ShopPolicy };
    });
  };
  /** Prices the basket from the shop's current items. Weighed: 50 g to 50 kg; counted: whole units up to 99. */
  const pricedLines = async (merchantId: number, inputs: LineInput[]) => {
    const out = [];
    for (const l of inputs) {
      const item = await db.one('SELECT * FROM merchant_items WHERE id = ? AND merchant_id = ?', l.itemId, merchantId);
      if (!item) fail(409, 'unavailable_item');
      if (!item!.available) fail(409, 'unavailable_item');
      const byWeight = !!item!.by_weight;
      if (byWeight ? l.qtyMilli < 50 || l.qtyMilli > 50_000 : l.qtyMilli < 1000 || l.qtyMilli > 99_000 || l.qtyMilli % 1000 !== 0) fail(400, 'invalid_input');
      out.push({ ...l, item: item!, byWeight, unit: Number(item!.price_agorot), estimate: lineAgorot(Number(item!.price_agorot), l.qtyMilli) });
    }
    return out;
  };
  /** PAY-09: two refused-or-absent shop orders in 30 days with fault `none` pause cash shop orders until support reviews them. */
  const cashPaused = async (customerId: number, now: number) => Number((await db.one(`SELECT COUNT(*) AS n FROM orders o JOIN shop_faults f ON f.order_id = o.id
    WHERE o.customer_id = ? AND o.service = 'shop' AND o.exception_reason IN ('refused','absent') AND f.result = 'none' AND o.updated_at > ?
    AND NOT EXISTS (SELECT 1 FROM security_events e WHERE e.order_id IS NULL AND e.action = 'SHOP_CASH_REVIEWED' AND e.detail = ? AND e.created_at > o.updated_at)`,
    customerId, now - 30 * DAY, JSON.stringify({ customerId })))!.n) >= 2;

  async function place(user: User, body: Row): Promise<number> {
    await available();
    if (body.promoCode != null) fail(409, 'promo_wrong_service'); // CON-06: promo codes carry no service list yet
    const m = await db.one(`SELECT * FROM merchants WHERE id = ?${forUpdate}`, Number(body.merchantId)) ?? fail(404, 'not_found');
    const now = Date.now();
    if (m.status !== 'active' && m.status !== 'paused') fail(404, 'not_found');
    if (town() && m.city !== town()) fail(409, 'shop_town_closed'); // ONE-14 for the pilot: one town (D-2)
    if (m.status === 'paused' || m.paused_new || !licenceValid(m, now)) fail(409, 'shop_paused');
    if (!openAt(await hoursOf(m.id) as never, now)) fail(409, 'shop_closed');
    // One town per order: the captain drives inside it, which also keeps bicycles in their town (§2.3).
    if (body.dropoffCity !== m.city) fail(409, 'shop_town_closed');
    const dropoff = bookedPoint(body.dropoffPoint, m.city) ?? fail(400, 'invalid_input');
    if (Math.abs(dropoff.latitude - m.lat) < 0.0004 && Math.abs(dropoff.longitude - m.lng) < 0.0004) fail(400, 'same_place');
    const contact = normalizePhone(String(body.contact ?? '')) ?? fail(400, 'invalid_phone');
    if (await cashPaused(user.id, now)) fail(409, 'shop_cash_paused');
    const lines = await pricedLines(m.id, lineInputs(body.lines));
    const estimate = lines.reduce((sum, l) => sum + l.estimate, 0);
    if (body.expectedGoodsAgorot != null && body.expectedGoodsAgorot !== estimate) fail(409, 'price_changed'); // prices moved since the cart
    if (estimate < Number(m.min_order_agorot)) fail(409, 'below_minimum');
    const s = await settings();
    const agree = body.agreeLimit == null ? s.shopAgreeLimit : Number(body.agreeLimit);
    if (!Number.isFinite(agree) || agree < 0 || agree > 0.5) fail(400, 'invalid_input');
    const fees = Number(m.delivery_fee_agorot) + Number(m.service_fee_agorot);
    // ADM-12: the highest cash this order can reach is the goods cap plus both fees.
    const cap = Math.min(goodsCapFor(estimate, agree), await ceilingAgorot() - fees);
    if (estimate + fees > await ceilingAgorot()) fail(409, 'over_cash_ceiling');
    const id = Number((await db.run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
      pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, handover_code, created_at, updated_at, recipient_name, recipient_phone, priority)
      VALUES (?, 'shop', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'shop', 0, ?, 'requested', ?, ?, ?, '', NULL, 'standard')`,
      user.id, m.city, m.city, m.lat, m.lng, dropoff.latitude, dropoff.longitude, m.name, text(body.dropoffNote, 200), contact, m.phone ?? contact,
      text(body.detail ?? '', 300, false), Number(m.delivery_fee_agorot) / 100, code4(), now, now)).lastInsertRowid);
    const acceptMs = s.shopAcceptMinutes * MINUTE;
    await db.run(`INSERT INTO shop_orders (order_id, merchant_id, accept_deadline, accept_extended, goods_estimate_agorot, goods_cap_agorot,
      delivery_fee_agorot, service_fee_agorot, agree_limit, pickup_code, pickup_failures, paused_ms)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 0)`, id, m.id, now + acceptMs, estimate, cap, Number(m.delivery_fee_agorot), Number(m.service_fee_agorot), agree, code4());
    for (const l of lines) await db.run(`INSERT INTO shop_lines (order_id, item_id, name_ar, name_en, policy, by_weight, qty_milli, unit_agorot, estimate_agorot, removed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, id, l.itemId, l.item.name_ar, l.item.name_en, l.policy, l.byWeight ? 1 : 0, l.qtyMilli, l.unit, l.estimate);
    await snapshot(id, 'placement');
    await push([Number(m.owner_user_id)], 'merchant_order', id, `/merchant/order/${id}`); // MER-01: its own loud alert
    return id;
  }

  // ---------- customer: edit, cancel, consent, again, rate ----------
  const customerOrder = async (user: User, id: number) => {
    need(user, 'customer'); await available();
    const r = await db.one(`SELECT * FROM orders WHERE id = ? AND customer_id = ? AND service = 'shop'${forUpdate}`, id, user.id) ?? fail(404, 'not_found');
    return { r, s: (await shopRow(r.id))! };
  };
  // DLV-11 / §4.3a: lines and destination change freely until the shop accepts; the drop-off note until the captain collects.
  route('POST', '/api/orders/:id/shop/edit', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await customerOrder(user, Number(params[0]));
    const now = Date.now();
    if (body.lines !== undefined) {
      if (r.status !== 'requested' || s.merchant_state) fail(409, 'edit_closed');
      const m = (await db.one('SELECT * FROM merchants WHERE id = ?', s.merchant_id))!;
      const lines = await pricedLines(m.id, lineInputs(body.lines));
      const estimate = lines.reduce((sum, l) => sum + l.estimate, 0);
      if (body.expectedGoodsAgorot != null && body.expectedGoodsAgorot !== estimate) fail(409, 'price_changed');
      if (estimate < Number(m.min_order_agorot)) fail(409, 'below_minimum');
      const fees = Number(s.delivery_fee_agorot) + Number(s.service_fee_agorot);
      if (estimate + fees > await ceilingAgorot()) fail(409, 'over_cash_ceiling');
      await db.run('DELETE FROM shop_lines WHERE order_id = ?', r.id);
      for (const l of lines) await db.run(`INSERT INTO shop_lines (order_id, item_id, name_ar, name_en, policy, by_weight, qty_milli, unit_agorot, estimate_agorot, removed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, r.id, l.itemId, l.item.name_ar, l.item.name_en, l.policy, l.byWeight ? 1 : 0, l.qtyMilli, l.unit, l.estimate);
      const cap = Math.min(goodsCapFor(estimate, Number(s.agree_limit)), await ceilingAgorot() - fees);
      await db.run('UPDATE shop_orders SET goods_estimate_agorot = ?, goods_cap_agorot = ? WHERE order_id = ?', estimate, cap, r.id);
      await snapshot(r.id, 'edit');
    }
    if (body.dropoffNote !== undefined) {
      if (!['requested', 'searching', 'assigned', 'at_pickup'].includes(r.status) || s.merchant_state === 'handed_over') fail(409, 'edit_closed');
      await db.run('UPDATE orders SET dropoff_note = ? WHERE id = ?', text(body.dropoffNote, 200), r.id);
    }
    if (body.lines === undefined && body.dropoffNote === undefined) fail(400, 'invalid_input');
    await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, r.id);
    if (body.lines !== undefined) await push([(await db.one('SELECT owner_user_id FROM merchants WHERE id = ?', s.merchant_id))!.owner_user_id], 'shop_update', r.id, `/merchant/order/${r.id}`);
    return getOrder(r.id, user);
  }));

  /** Cancels with one typed reason (§2.1) and tells everyone on the order. Ledger effects follow DLV-23 in `postCancel`. */
  async function cancelWith(r: Row, s: Row, reason: ShopCancelReason, actor: number, note = '', exceptionAt?: number) {
    const now = Date.now();
    if (!(await db.run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = ?", now, r.id, r.status)).changes) fail(409, 'order_changed');
    await db.run('UPDATE shop_orders SET cancel_reason = ? WHERE order_id = ?', reason, r.id);
    await db.run("UPDATE shop_changes SET status = 'expired', decided_at = ? WHERE order_id = ? AND status = 'pending'", now, r.id);
    await audit(actor, r.id, 'SHOP_CANCELLED', { reason, note, exceptionAt });
    await postCancel(r, s, reason, actor);
    const owner = (await db.one('SELECT owner_user_id FROM merchants WHERE id = ?', s.merchant_id))!.owner_user_id;
    await push([r.customer_id, r.driver_id ?? null], 'cancelled', r.id);
    await push([owner], 'shop_update', r.id, `/merchant/order/${r.id}`);
  }
  // Customer cancel (DLV-11, D-2): free until the shop accepts, then support only while `accepted`, never from `preparing` on.
  async function customerCancel(user: User, orderId: number) {
    return inTx(async () => {
      const { r, s } = await customerOrder(user, orderId);
      if (r.status === 'cancelled') return getOrder(r.id, user);
      if (r.status !== 'requested' || s.merchant_state) fail(409, 'cancel_refused');
      await cancelWith(r, s, 'customer_before_accept', user.id);
      return getOrder(r.id, user);
    });
  }

  /** Applies a consented or in-cap change to its line; returns nothing, the caller snapshots. */
  async function applyChange(orderId: number, lineId: number, p: Row) {
    if (p.kind === 'weight') await db.run('UPDATE shop_lines SET final_agorot = ? WHERE id = ? AND order_id = ?', p.toAgorot, lineId, orderId);
    else if (p.kind === 'substitution') {
      await db.run('UPDATE shop_lines SET removed = 1 WHERE id = ? AND order_id = ?', lineId, orderId);
      await db.run(`INSERT INTO shop_lines (order_id, item_id, name_ar, name_en, policy, by_weight, qty_milli, unit_agorot, estimate_agorot, final_agorot, removed, substitute_for)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`, orderId, p.itemId, p.nameAr, p.nameEn, p.policy, p.byWeight ? 1 : 0, p.qtyMilli, p.unitAgorot, p.toAgorot, p.byWeight ? p.toAgorot : null, lineId);
    } else await db.run('UPDATE shop_lines SET removed = 1 WHERE id = ? AND order_id = ?', lineId, orderId);
  }
  /** Decline or timeout: the line comes off, then steps 1, 3 and 4 run again (DLV-06). Removal only lowers the total. */
  async function declineChange(r: Row, s: Row, c: Row, status: 'declined' | 'expired', actor: number) {
    const now = Date.now();
    if (!(await db.run("UPDATE shop_changes SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'", status, now, c.id)).changes) fail(409, 'consent_closed');
    await db.run('UPDATE shop_lines SET removed = 1 WHERE id = ? AND order_id = ?', c.line_id, r.id);
    const goods = goodsOf(await linesOf(r.id));
    const m = (await db.one('SELECT min_order_agorot FROM merchants WHERE id = ?', s.merchant_id))!;
    const paused = Math.max(0, now - Number(s.paused_at ?? now));
    if (goods < Number(m.min_order_agorot) || goods === 0) {
      await snapshot(r.id, 'consent');
      await cancelWith(r, s, 'below_minimum', actor);
      return;
    }
    // Waiting time is not preparation time: dispatch moves on by the pause.
    await db.run(`UPDATE shop_orders SET merchant_state = 'preparing', paused_at = NULL, paused_ms = paused_ms + ?,
      dispatch_at = CASE WHEN dispatch_at IS NULL THEN NULL ELSE dispatch_at + ? END WHERE order_id = ?`, paused, paused, r.id);
    await snapshot(r.id, 'consent');
    await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, r.id);
    await audit(actor, r.id, 'SHOP_CHANGE_DECLINED', { changeId: c.id, status });
    await push([(await db.one('SELECT owner_user_id FROM merchants WHERE id = ?', s.merchant_id))!.owner_user_id], 'shop_update', r.id, `/merchant/order/${r.id}`);
  }
  route('POST', '/api/orders/:id/shop/consent', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await customerOrder(user, Number(params[0]));
    const c = await db.one("SELECT * FROM shop_changes WHERE id = ? AND order_id = ?", Number(body.changeId), r.id) ?? fail(404, 'not_found');
    if (c.status !== 'pending' || s.merchant_state !== 'awaiting_approval' || Number(c.expires_at) <= Date.now()) fail(409, 'consent_closed');
    if (body.extend === true) { // A11Y-08: one extension, announced on screen
      if (c.extended) fail(409, 'already_extended');
      await db.run('UPDATE shop_changes SET extended = 1, expires_at = expires_at + ? WHERE id = ?', (await settings()).shopConsentMinutes * MINUTE, c.id);
      return getOrder(r.id, user);
    }
    if (body.decision === 'decline') { await declineChange(r, s, c, 'declined', user.id); return getOrder(r.id, user); }
    if (body.decision !== 'approve') fail(400, 'invalid_input');
    const p = JSON.parse(c.payload);
    const fees = Number(s.delivery_fee_agorot) + Number(s.service_fee_agorot);
    const ceiling = await ceilingAgorot();
    if (p.goodsAfter + fees > ceiling) fail(409, 'over_cash_ceiling'); // the ceiling may have been lowered while it waited
    const now = Date.now();
    if (!(await db.run("UPDATE shop_changes SET status = 'approved', decided_at = ? WHERE id = ? AND status = 'pending'", now, c.id)).changes) fail(409, 'consent_closed');
    await applyChange(r.id, Number(c.line_id), p);
    const paused = Math.max(0, now - Number(s.paused_at ?? now));
    // Approval raises the cap to the approved total, never lowers it, and never past the ceiling less the fees.
    const cap = Math.min(Math.max(Number(s.goods_cap_agorot), p.goodsAfter), ceiling - fees);
    await db.run(`UPDATE shop_orders SET merchant_state = 'preparing', goods_cap_agorot = ?, paused_at = NULL, paused_ms = paused_ms + ?,
      dispatch_at = CASE WHEN dispatch_at IS NULL THEN NULL ELSE dispatch_at + ? END WHERE order_id = ?`, cap, paused, paused, r.id);
    await snapshot(r.id, 'consent');
    await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, r.id);
    await audit(user.id, r.id, 'SHOP_CHANGE_APPROVED', { changeId: c.id, goods: p.goodsAfter });
    await push([(await db.one('SELECT owner_user_id FROM merchants WHERE id = ?', s.merchant_id))!.owner_user_id], 'shop_update', r.id, `/merchant/order/${r.id}`);
    return getOrder(r.id, user);
  }));
  // DLV-18: order again rebuilds the cart from today's prices and stock and says what changed; it never places by itself.
  route('POST', '/api/orders/:id/shop/again', async ({ user, params }) => {
    const { r, s } = await customerOrder(user, Number(params[0]));
    const m = await db.one('SELECT * FROM merchants WHERE id = ?', s.merchant_id);
    if (!m || (m.status !== 'active' && m.status !== 'paused')) fail(404, 'not_found');
    const placed = JSON.parse((await db.one("SELECT body FROM shop_snapshots WHERE order_id = ? AND reason = 'placement' ORDER BY id LIMIT 1", r.id))!.body).lines as ShopLine[];
    const lines: LineInput[] = [], changes: { itemId: number; nameAr: string; nameEn: string; kind: 'price' | 'unavailable'; fromAgorot: number; toAgorot: number | null }[] = [];
    for (const l of placed) {
      if (l.itemId == null) continue;
      const item = await db.one('SELECT * FROM merchant_items WHERE id = ? AND merchant_id = ?', l.itemId, m!.id);
      if (!item || !item.available) { changes.push({ itemId: l.itemId, nameAr: l.nameAr, nameEn: l.nameEn, kind: 'unavailable', fromAgorot: l.unitAgorot, toAgorot: null }); continue; }
      if (Number(item.price_agorot) !== l.unitAgorot) changes.push({ itemId: l.itemId, nameAr: item.name_ar, nameEn: item.name_en, kind: 'price', fromAgorot: l.unitAgorot, toAgorot: Number(item.price_agorot) });
      lines.push({ itemId: l.itemId, qtyMilli: l.qtyMilli, policy: l.policy });
    }
    return { merchant: await merchantView(m!), lines, changes, dropoffCity: r.dropoff_city,
      dropoffPoint: r.dropoff_lat == null ? null : { latitude: r.dropoff_lat, longitude: r.dropoff_lng }, dropoffNote: r.dropoff_note };
  });
  // CON-08: the customer rates the shop and the shop rates the customer, separately from the captain, once each.
  route('POST', '/api/orders/:id/shop/rate', async ({ user, params, body }) => inTx(async () => {
    await available();
    const r = await db.one("SELECT * FROM orders WHERE id = ? AND service = 'shop'", Number(params[0])) ?? fail(404, 'not_found');
    const role = await roleOn(r, user);
    const stars = Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5 ? body.rating as number : fail(400, 'invalid_input');
    if (role !== 'customer' && role !== 'merchant') fail(404, 'not_found');
    if (r.status !== 'completed' && !(role === 'merchant' && r.status === 'returned')) fail(409, 'cannot_rate');
    const column = role === 'customer' ? 'merchant_rating' : 'customer_rating_by_merchant';
    if (!(await db.run(`UPDATE shop_orders SET ${column} = ? WHERE order_id = ? AND (${column} IS NULL OR ${column} = ?)`, stars, r.id, stars)).changes) fail(409, 'cannot_rate');
    return getOrder(r.id, user);
  }));

  // ---------- merchant: inbox, accept, prepare, change, ready ----------
  const merchantOrder = async (user: User, id: number) => {
    const m = await needMerchant(user);
    const r = await db.one(`SELECT * FROM orders WHERE id = ? AND service = 'shop'${forUpdate}`, id) ?? fail(404, 'not_found');
    const s = await shopRow(r.id);
    if (!s || Number(s.merchant_id) !== Number(m.id)) fail(404, 'not_found');
    return { m, r, s: s! };
  };
  route('GET', '/api/merchant/orders', async ({ user }) => {
    const m = await needMerchant(user);
    const rows = await db.all(`SELECT o.id FROM orders o JOIN shop_orders s ON s.order_id = o.id WHERE s.merchant_id = ?
      AND (o.status IN ('requested','searching','assigned','at_pickup','in_transit','on_hold','returning') OR o.updated_at > ?) ORDER BY o.id DESC LIMIT 100`, m.id, Date.now() - 2 * DAY);
    const orders = [];
    for (const row of rows) orders.push(await getOrder(Number(row.id), user));
    return { merchant: await merchantView(m, false, true), orders };
  });
  route('POST', '/api/merchant/orders/:id/accept', async ({ user, params, body }) => inTx(async () => {
    const { m, r, s } = await merchantOrder(user, Number(params[0]));
    if (s.merchant_state === 'accepted' && r.status === 'requested') return getOrder(r.id, user); // a lost reply
    const now = Date.now();
    if (r.status !== 'requested' || s.merchant_state) fail(409, 'shop_state');
    if (Number(s.accept_deadline) <= now) fail(409, 'accept_expired');
    const prep = body.prepMinutes == null ? Number(m.prep_minutes) : body.prepMinutes;
    if (!Number.isInteger(prep) || prep < 1 || prep > 180) fail(400, 'invalid_input');
    const lead = (await settings()).shopDispatchLeadMinutes;
    // DLV-12: captains are sought so that arrival meets ready, not at placement.
    await db.run(`UPDATE shop_orders SET merchant_state = 'accepted', accepted_at = ?, prep_minutes = ?, dispatch_at = ? WHERE order_id = ? AND merchant_state IS NULL`,
      now, prep, now + Math.max(0, prep - lead) * MINUTE, r.id);
    await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, r.id);
    await audit(user.id, r.id, 'SHOP_ACCEPTED', { prepMinutes: prep });
    await push([r.customer_id], 'shop_update', r.id);
    return getOrder(r.id, user);
  }));
  route('POST', '/api/merchant/orders/:id/extend', async ({ user, params }) => inTx(async () => {
    const { r, s } = await merchantOrder(user, Number(params[0]));
    if (r.status !== 'requested' || s.merchant_state || Number(s.accept_deadline) <= Date.now()) fail(409, 'accept_expired');
    if (s.accept_extended) fail(409, 'already_extended');
    await db.run('UPDATE shop_orders SET accept_extended = 1, accept_deadline = accept_deadline + ? WHERE order_id = ?', (await settings()).shopAcceptMinutes * MINUTE, r.id);
    return getOrder(r.id, user);
  }));
  route('POST', '/api/merchant/orders/:id/reject', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await merchantOrder(user, Number(params[0]));
    if (!merchantRejects.includes(body.reason)) fail(400, 'invalid_input');
    if (r.status === 'cancelled' && s.cancel_reason === body.reason) return getOrder(r.id, user);
    if (r.status !== 'requested' || s.merchant_state) fail(409, 'cannot_reject');
    if (Number(s.accept_deadline) <= Date.now()) fail(409, 'accept_expired'); // past the window the sweep records the timeout (Sol R3-L4)
    await cancelWith(r, s, body.reason, user.id);
    return getOrder(r.id, user);
  }));
  route('POST', '/api/merchant/orders/:id/preparing', async ({ user, params }) => inTx(async () => {
    const { r, s } = await merchantOrder(user, Number(params[0]));
    if (s.merchant_state === 'preparing') return getOrder(r.id, user);
    if (s.merchant_state !== 'accepted' || r.status === 'cancelled') fail(409, 'shop_state');
    await db.run("UPDATE shop_orders SET merchant_state = 'preparing', preparing_at = ? WHERE order_id = ? AND merchant_state = 'accepted'", Date.now(), r.id);
    await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', Date.now(), r.id);
    await push([r.customer_id], 'shop_update', r.id);
    return getOrder(r.id, user);
  }));
  // MER-03 + DLV-04/05/06: a weight, a substitution or a removal, evaluated in the SRS order.
  route('POST', '/api/merchant/orders/:id/lines/:line', async ({ user, params, body }) => inTx(async () => {
    const { m, r, s } = await merchantOrder(user, Number(params[0]));
    return changeLine(user, m, r, s, Number(params[1]), body);
  }));
  // DLV-13: a handover exception left unresolved past the owner-set minutes: the operator removes the line, and DLV-06
  // evaluates the removal like any merchant change (a drop below the minimum cancels with below_minimum).
  // The decision binds to the exception episode the operator saw (exceptionAt) and keeps their reason (Sol R2-M3); support or
  // dispatch duty decides it on duty-scoped PostgreSQL (Sol R2-H7, ADM-10).
  route('POST', '/api/admin/orders/:id/shop/lines/:line/remove', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await adminOrder(user, Number(params[0]));
    needStaff(await staffActor(db, user as never), fail, 'support', 'dispatcher');
    const lineId = Number(params[1]);
    const episode = Number.isSafeInteger(body.exceptionAt) ? body.exceptionAt as number : null;
    // A retry of a removal that already happened for this episode and line replays the current order.
    if (episode != null && await db.one("SELECT 1 FROM security_events WHERE order_id = ? AND action = 'SHOP_LINE_REMOVED_BY_SUPPORT' AND detail LIKE ?",
      r.id, `{"exceptionAt":${episode},"lineId":${lineId},%`)) return getOrder(r.id, user);
    if (!(await handoverOverdue(r.id))) fail(409, 'handover_not_overdue');
    if (episode == null || typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.length > 500) fail(400, 'invalid_input');
    if (await openExceptionAt(r.id) !== episode) fail(409, 'exception_changed');
    const m = (await db.one('SELECT * FROM merchants WHERE id = ?', s.merchant_id))!;
    const order = await changeLine(user, m, r, s, lineId, { remove: true });
    await audit(user.id, r.id, 'SHOP_LINE_REMOVED_BY_SUPPORT', { exceptionAt: episode, lineId, note: (body.note as string).trim() });
    await push([m.owner_user_id], 'shop_update', r.id, `/merchant/order/${r.id}`);
    await push([r.customer_id], 'shop_update', r.id);
    return order;
  }));
  async function changeLine(user: User, m: Row, r: Row, s: Row, lineId: number, body: Row) {
    if (s.merchant_state !== 'preparing' || !['requested', 'searching', 'assigned', 'at_pickup'].includes(r.status)) fail(409, 'shop_state');
    if (await db.one("SELECT 1 FROM shop_changes WHERE order_id = ? AND status = 'pending'", r.id)) fail(409, 'change_pending');
    const lines = await linesOf(r.id);
    const line = lines.find(l => l.id === lineId && !l.removed) ?? fail(404, 'not_found');
    let p: Row;
    if (body.remove === true) p = { kind: 'removal', nameAr: line.nameAr, nameEn: line.nameEn, fromAgorot: line.finalAgorot ?? line.estimateAgorot, toAgorot: 0 };
    else if (body.weightGrams !== undefined) {
      if (!line.byWeight || !Number.isSafeInteger(body.weightGrams) || body.weightGrams < 1 || body.weightGrams > 50_000) fail(400, 'invalid_input');
      p = { kind: 'weight', nameAr: line.nameAr, nameEn: line.nameEn, fromAgorot: line.finalAgorot ?? line.estimateAgorot, toAgorot: lineAgorot(line.unitAgorot, body.weightGrams) };
    } else if (body.substituteItemId !== undefined) {
      if (line.policy === 'remove') fail(409, 'substitution_refused'); // the customer chose "remove if out of stock"
      const item = await db.one('SELECT * FROM merchant_items WHERE id = ? AND merchant_id = ? AND available = 1', Number(body.substituteItemId), m.id) ?? fail(409, 'unavailable_item');
      const qty = body.qtyMilli ?? line.qtyMilli;
      const byWeight = !!item.by_weight;
      if (!Number.isSafeInteger(qty) || (byWeight ? qty < 50 || qty > 50_000 : qty < 1000 || qty > 99_000 || qty % 1000 !== 0)) fail(400, 'invalid_input');
      p = { kind: 'substitution', policy: line.policy, itemId: Number(item.id), nameAr: item.name_ar, nameEn: item.name_en, byWeight, qtyMilli: qty, unitAgorot: Number(item.price_agorot),
        fromAgorot: line.finalAgorot ?? line.estimateAgorot, toAgorot: lineAgorot(Number(item.price_agorot), qty), fromNameAr: line.nameAr, fromNameEn: line.nameEn };
    } else fail(400, 'invalid_input');
    const goodsAfter = goodsOf(lines) - p!.fromAgorot + p!.toAgorot;
    p!.goodsAfter = goodsAfter;
    const fees = Number(s.delivery_fee_agorot) + Number(s.service_fee_agorot);
    const outcome = evaluateChange({ goodsAfter, fees, ceiling: await ceilingAgorot(), askFirst: p!.kind === 'substitution' && line.policy === 'ask_first',
      minimum: Number(m.min_order_agorot), cap: Number(s.goods_cap_agorot) });
    const now = Date.now();
    if (outcome === 'refuse_ceiling') fail(409, 'over_cash_ceiling'); // the order does not pause: remove or substitute within the ceiling
    if (outcome === 'pause') {
      const consentMs = (await settings()).shopConsentMinutes * MINUTE;
      await db.run(`INSERT INTO shop_changes (order_id, line_id, kind, payload, status, expires_at, extended, created_at) VALUES (?, ?, ?, ?, 'pending', ?, 0, ?)`,
        r.id, line.id, p!.kind === 'removal' ? 'substitution' : p!.kind, JSON.stringify(p!), now + consentMs, now);
      await db.run("UPDATE shop_orders SET merchant_state = 'awaiting_approval', paused_at = ? WHERE order_id = ?", now, r.id);
      await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, r.id);
      await push([r.customer_id], 'shop_consent', r.id);
      return getOrder(r.id, user);
    }
    await applyChange(r.id, line.id, p!);
    if (outcome === 'below_minimum') { await snapshot(r.id, 'merchant_change'); await cancelWith(r, s, 'below_minimum', user.id); return getOrder(r.id, user); }
    await snapshot(r.id, 'merchant_change');
    await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, r.id);
    await audit(user.id, r.id, 'SHOP_LINE_CHANGED', { lineId: line.id, kind: p!.kind, goods: goodsAfter });
    return getOrder(r.id, user);
  }
  // MER-03: ready needs every weighed line's final price and the packing record (packages, sealed or open, items in open bags).
  route('POST', '/api/merchant/orders/:id/ready', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await merchantOrder(user, Number(params[0]));
    if (s.merchant_state === 'ready') return getOrder(r.id, user);
    if (await db.one("SELECT 1 FROM shop_changes WHERE order_id = ? AND status = 'pending'", r.id)) fail(409, 'change_pending');
    if (s.merchant_state !== 'preparing' || !['requested', 'searching', 'assigned', 'at_pickup'].includes(r.status)) fail(409, 'shop_state');
    const lines = (await linesOf(r.id)).filter(l => !l.removed);
    if (lines.some(l => l.byWeight && l.finalAgorot == null)) fail(409, 'weight_required');
    if (!Array.isArray(body.packages) || body.packages.length < 1 || body.packages.length > 30) fail(409, 'packing_required');
    const ids = new Set(lines.map(l => l.id));
    const packages = (body.packages as Row[]).map((p, i) => {
      const lineIds = p.sealed ? [] : Array.isArray(p.lineIds) ? p.lineIds.map(Number) : fail(400, 'invalid_input');
      if (lineIds.some((id: number) => !ids.has(id))) fail(400, 'invalid_input');
      return { no: i + 1, sealed: !!p.sealed, lineIds };
    });
    // An item not in an open bag must be in a sealed package; with no sealed package, every item must be in a bag (DLV-13).
    if (!packages.some(p => p.sealed) && lines.some(l => !packages.some(p => p.lineIds.includes(l.id)))) fail(409, 'packing_required');
    const now = Date.now();
    await db.run(`UPDATE shop_orders SET merchant_state = 'ready', ready_at = ?, packing = ?, handover_exception = NULL WHERE order_id = ?`, now, JSON.stringify(packages), r.id);
    await snapshot(r.id, 'ready', { packing: JSON.stringify(packages) });
    await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, r.id);
    await audit(user.id, r.id, 'SHOP_READY', { packages: packages.length });
    if (r.status === 'requested') await release(r.id, Number(r.customer_id), now); // ready early: look for a captain now
    else if (r.driver_id) await push([r.driver_id], 'shop_update', r.id); // a captain waiting at the shop hears it
    await push([r.customer_id], 'shop_update', r.id);
    return getOrder(r.id, user);
  }));
  // MER-04: the statement is the shop's ledger rows and their sum, never a stored balance.
  route('GET', '/api/merchant/statement', async ({ user }) => {
    const m = await needMerchant(user);
    return statement(Number(m.id));
  });
  async function statement(merchantId: number) {
    const entries = await db.all("SELECT * FROM shop_ledger WHERE book = 'merchant' AND merchant_id = ? ORDER BY id DESC LIMIT 200", merchantId);
    const balance = Number((await db.one("SELECT COALESCE(SUM(amount_agorot), 0) AS n FROM shop_ledger WHERE book = 'merchant' AND merchant_id = ?", merchantId))!.n);
    return { balanceAgorot: balance, payableAgorot: Math.max(0, balance - await unsettledGoods(merchantId)),
      entries: entries.map(e => ({ id: Number(e.id), orderId: e.order_id == null ? null : Number(e.order_id), kind: e.kind, amountAgorot: Number(e.amount_agorot),
        note: e.note, reference: e.reference ?? null, createdAt: Number(e.created_at) })) };
  }
  /** Goods of completed orders whose captain still owes Wind cash: Wind may not pay the shop money it has not received. */
  // ponytail: per captain, not per order. A captain owing anything holds back all their goods for this shop until cleared; FIFO matching of
  // handovers to orders would release some earlier, if payouts wait too long in the pilot. Failed-trip pay (DRV-17) is Wind's own debt to
  // the captain and is settled by netting against the cash he holds, so a captain at zero has handed over every agora he owes, goods included.
  async function unsettledGoods(merchantId: number) {
    let held = 0;
    for (const row of await db.all(`SELECT o.driver_id, SUM(s.goods_agorot) AS goods FROM shop_orders s JOIN orders o ON o.id = s.order_id
      WHERE s.merchant_id = ? AND o.status = 'completed' AND o.driver_id IS NOT NULL GROUP BY o.driver_id`, merchantId))
      if (await deps.owedCents(Number(row.driver_id)) > 0) held += Number(row.goods);
    return held;
  }

  // ---------- dispatch and sweeps ----------
  async function release(orderId: number, customerId: number, now: number) {
    // The shop state is re-checked in the same statement: a consent pause committed after the sweep's read keeps the order off the board.
    if (!(await db.run(`UPDATE orders SET status = 'searching', job_alerted_at = ?, updated_at = ? WHERE id = ? AND status = 'requested'
      AND EXISTS (SELECT 1 FROM shop_orders s WHERE s.order_id = orders.id AND s.merchant_state IN ('accepted','preparing','ready') AND s.paused_at IS NULL)`, now, now, orderId)).changes) return false;
    await db.run('UPDATE shop_orders SET dispatch_at = ? WHERE order_id = ?', now, orderId);
    await deps.dispatch(orderId, customerId);
    return true;
  }
  /** One pass of every shop timer (run each minute, and by tests with a chosen `now`). The timers only expire an unanswered
   * accept or consent and raise flags; no clock ever prepares, delivers or pays anything. */
  async function sweep(now = Date.now()) {
    if (!deps.enabled()) return 0;
    if (!(await db.atomic({ purpose: 'shop_timers' }, () => shopTables(db)))) return 0;
    // Each timer runs in its own short transaction with a compare-and-set, so one bad row never blocks the rest.
    const timer = (work: () => Promise<number>) => db.atomic({ purpose: 'shop_timers' }, () => inTx(work));
    let changed = 0;
    for (const row of await db.all("SELECT o.id FROM orders o JOIN shop_orders s ON s.order_id = o.id WHERE o.status = 'requested' AND s.merchant_state IS NULL AND s.accept_deadline <= ? LIMIT 50", now))
      changed += await timer(async () => {
        const r = await db.one(`SELECT * FROM orders WHERE id = ?${forUpdate}`, row.id), s = await shopRow(Number(row.id));
        if (!r || r.status !== 'requested' || !s || s.merchant_state || Number(s.accept_deadline) > now) return 0;
        // Claim the expiry first: an accept that committed in between leaves merchant_state set, and this changes nothing.
        if (!(await db.run("UPDATE shop_orders SET cancel_reason = 'accept_expired' WHERE order_id = ? AND merchant_state IS NULL AND cancel_reason IS NULL", r.id)).changes) return 0;
        await cancelWith(r, s, 'accept_expired', Number(r.customer_id));
        return 1;
      });
    for (const row of await db.all("SELECT c.id, c.order_id FROM shop_changes c WHERE c.status = 'pending' AND c.expires_at <= ? LIMIT 50", now))
      changed += await timer(async () => {
        const r = await db.one(`SELECT * FROM orders WHERE id = ?${forUpdate}`, row.order_id), s = await shopRow(Number(row.order_id));
        const c = await db.one('SELECT * FROM shop_changes WHERE id = ?', row.id);
        if (!r || !s || !c || c.status !== 'pending' || Number(c.expires_at) > now) return 0;
        await declineChange(r, s, c, 'expired', Number(r.customer_id));
        return 1;
      });
    for (const row of await db.all(`SELECT o.id, o.customer_id FROM orders o JOIN shop_orders s ON s.order_id = o.id WHERE o.status = 'requested'
      AND s.merchant_state IN ('accepted','preparing','ready') AND s.paused_at IS NULL AND s.dispatch_at <= ? LIMIT 50`, now))
      changed += await timer(async () => (await release(Number(row.id), Number(row.customer_id), now)) ? 1 : 0);
    // DLV-12: no captain by ready + X: tell the customer, the shop and support once. Never an automatic cancel.
    const waitMs = (await settings()).shopNoCaptainMinutes * MINUTE;
    for (const row of await db.all(`SELECT o.id, o.customer_id, m.owner_user_id FROM orders o JOIN shop_orders s ON s.order_id = o.id JOIN merchants m ON m.id = s.merchant_id
      WHERE o.status = 'searching' AND s.ready_at IS NOT NULL AND s.ready_at <= ? AND s.no_captain_alerted_at IS NULL LIMIT 50`, now - waitMs))
      changed += await timer(async () => {
        if (!(await db.run('UPDATE shop_orders SET no_captain_alerted_at = ? WHERE order_id = ? AND no_captain_alerted_at IS NULL', now, row.id)).changes) return 0;
        await push([row.customer_id], 'shop_update', Number(row.id));
        await push([row.owner_user_id], 'shop_update', Number(row.id), `/merchant/order/${row.id}`);
        await push(await adminIds(), 'attention', Number(row.id), '/admin/orders');
        return 1;
      });
    // DLV-13: a handover exception unresolved past the owner-set minutes goes to support once per exception. Never an automatic cancel.
    const handoverMs = (await settings()).shopHandoverMinutes * MINUTE;
    const escalated = `EXISTS (SELECT 1 FROM security_events e WHERE e.order_id = o.id AND e.action = 'SHOP_HANDOVER_ESCALATED' AND e.created_at >= ${exceptionSince})`;
    for (const row of await db.all(`SELECT o.id FROM orders o JOIN shop_orders s ON s.order_id = o.id WHERE o.status = 'at_pickup'
      AND s.handover_exception IS NOT NULL AND ${exceptionSince} <= ? AND NOT ${escalated} LIMIT 50`, now - handoverMs))
      changed += await timer(async () => {
        const r = await db.one(`SELECT id, driver_id FROM orders WHERE id = ?${forUpdate}`, row.id);
        if (!r || r.driver_id == null || !(await handoverOverdue(Number(row.id), now)) || await db.one(`SELECT 1 FROM orders o WHERE o.id = ? AND ${escalated}`, row.id)) return 0;
        await audit(Number(r.driver_id), Number(row.id), 'SHOP_HANDOVER_ESCALATED'); // the captain raised the exception the sweep escalates
        await push(await adminIds(), 'attention', Number(row.id), '/admin/orders');
        return 1;
      });
    // MER-08: an expired trade licence pauses the shop. Accepted orders continue.
    for (const row of await db.all("SELECT id, owner_user_id FROM merchants WHERE status = 'active' AND licence_expires_at <= ? LIMIT 50", now))
      changed += await timer(async () => {
        if (!(await db.run("UPDATE merchants SET status = 'paused', updated_at = ? WHERE id = ? AND status = 'active'", now, row.id)).changes) return 0;
        await push([row.owner_user_id], 'attention', 0, '/merchant');
        return 1;
      });
    if (changed) await deps.flushPush();
    return changed;
  }

  // ---------- captain ----------
  /** What a shop job will add to what the captain owes Wind at most: the goods cap and the service fee (CON-05, ONE-10). The delivery
   * fee is the captain's own; its commission is already in the exposure. */
  async function holdCents(orderId: number) {
    if (!(await shopTables(db))) return 0;
    const s = await shopRow(orderId);
    return s ? Number(s.goods_cap_agorot) + Number(s.service_fee_agorot) : 0;
  }
  /** DLV-13: the merchant pickup code (5-miss lockout, separate from the delivery code) and the captain's check. */
  async function handover(user: User, id: number, body: Row) {
    const r = await db.one(`SELECT * FROM orders WHERE id = ?${forUpdate}`, id) ?? fail(404, 'not_found');
    const s = await shopRow(id);
    if (r.service !== 'shop' || !s || r.driver_id !== user.id) fail(409, 'cannot_advance');
    if (body.expectedStatus !== r.status || r.status !== 'at_pickup') fail(409, 'order_changed');
    if (s!.handover_exception && s!.merchant_state !== 'ready') fail(409, 'exception_open');
    if (s!.merchant_state !== 'ready') fail(409, 'not_ready');
    const check = body.check ?? {};
    const now = Date.now();
    if (check.result === 'exception') {
      const kind = handoverExceptions.includes(check.exception) ? check.exception as HandoverException : fail(400, 'invalid_input');
      // An exception reopens preparing: the shop fixes it, and every change runs through DLV-06 again.
      await db.run("UPDATE shop_orders SET merchant_state = 'preparing', handover_exception = ? WHERE order_id = ? AND merchant_state = 'ready'", kind, id);
      await db.run('INSERT INTO shop_handover_checks (order_id, actor_id, result, exception, note, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, user.id, 'exception', kind, text(check.note ?? '', 200, false), now);
      await db.run('UPDATE orders SET updated_at = ? WHERE id = ?', now, id);
      await push([(await db.one('SELECT owner_user_id FROM merchants WHERE id = ?', s!.merchant_id))!.owner_user_id], 'shop_update', id, `/merchant/order/${id}`);
      return;
    }
    if (check.result !== 'ok') fail(400, 'invalid_input');
    if (Number(s!.pickup_failures) >= lockedTries) fail(409, 'proof_locked');
    if (latinDigits(String(body.code ?? '').trim()) !== s!.pickup_code) {
      await db.run('UPDATE shop_orders SET pickup_failures = pickup_failures + 1 WHERE order_id = ?', id);
      await audit(user.id, id, 'SHOP_PICKUP_FAILED');
      if (Number(s!.pickup_failures) + 1 === lockedTries) await push(await adminIds(), 'attention', id, '/admin/orders');
      fail(400, 'wrong_code');
    }
    await db.run('INSERT INTO shop_handover_checks (order_id, actor_id, result, exception, note, created_at) VALUES (?, ?, ?, NULL, ?, ?)', id, user.id, 'ok', text(check.note ?? '', 200, false), now);
    await db.run("UPDATE shop_orders SET merchant_state = 'handed_over', handed_over_at = ?, handover_exception = NULL WHERE order_id = ? AND merchant_state = 'ready'", now, id);
    if (!(await db.run("UPDATE orders SET status = 'in_transit', picked_up_at = COALESCE(picked_up_at, ?), updated_at = ? WHERE id = ? AND status = 'at_pickup'", now, now, id)).changes) fail(409, 'order_changed');
    await push([r.customer_id], 'in_transit', id);
    await push([(await db.one('SELECT owner_user_id FROM merchants WHERE id = ?', s!.merchant_id))!.owner_user_id], 'shop_update', id, `/merchant/order/${id}`);
  }
  /** DLV-14: every sealed package is recorded intact or broken at each delivery attempt, append-only, before the code. */
  // A refused driver command still commits (driverCommand stores its outcome), so the seals are checked before any write and
  // written only once nothing after them can refuse.
  async function checkSeals(r: Row, body: Row) {
    const s = await shopRow(r.id);
    const sealed = (s?.packing ? JSON.parse(s.packing) as { no: number; sealed: boolean }[] : []).filter(p => p.sealed);
    if (!sealed.length) return [];
    const seals = Array.isArray(body.seals) ? body.seals as Row[] : fail(400, 'invalid_input');
    if (seals.length !== sealed.length || sealed.some(p => !seals.some(x => x.no === p.no && typeof x.intact === 'boolean'))) fail(400, 'invalid_input');
    return sealed.map(p => ({ no: p.no, intact: !!seals.find(x => x.no === p.no)!.intact }));
  }
  async function recordSeals(r: Row, body: Row, attempt: 'deliver' | 'fail', actor: number) {
    for (const p of await checkSeals(r, body)) await db.run('INSERT INTO shop_seals (order_id, package_no, intact, attempt, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      r.id, p.no, p.intact ? 1 : 0, attempt, actor, Date.now());
  }
  /** The completing advance's door cash for a shop order: goods + delivery fee + service fee (DLV-15), with the A11 variance rule. */
  async function doorCash(r: Row, body: Row) {
    const s = (await shopRow(r.id))!;
    const expectedCents = goodsOf(await linesOf(r.id)) + Number(s.delivery_fee_agorot) + Number(s.service_fee_agorot);
    const { collectedCents, varianceReason } = body;
    if (collectedCents === undefined && varianceReason === undefined) return null;
    if (typeof collectedCents !== 'number' || !Number.isSafeInteger(collectedCents) || collectedCents < 0 || collectedCents > doorCashMaxCents) fail(400, 'invalid_input');
    const reason = (varianceReason ?? null) as VarianceReason | null;
    if (!varianceAllowed(collectedCents as number, expectedCents, reason)) fail(400, 'invalid_input');
    return { expectedCents, collectedCents: collectedCents as number, varianceReason: reason };
  }
  /** Before the shared advance: shop orders leave the shop only through `handover`, and delivery records the seals first. */
  async function beforeAdvance(r: Row, next: string, body: Row, actor: number) {
    if (r.service !== 'shop') return;
    if (next === 'in_transit') fail(409, 'use_shop_handover');
    if (next === 'completed') {
      if (body.collectedCents === undefined) fail(400, 'invalid_input'); // a shop door always records what was taken (DLV-15)
      await checkSeals(r, body);
    }
    void actor;
  }
  /** After a completed or returned shop order commits its status: the money rows (DLV-15, DLV-25, DRV-17). */
  async function afterFinish(r: Row, next: 'completed' | 'returned', actor: number, body: Row = {}, deliveredToOffice = false) {
    if (r.service !== 'shop') return;
    if (next === 'completed') await recordSeals(r, body, 'deliver', actor);
    const s = (await shopRow(r.id))!;
    const goods = goodsOf(await linesOf(r.id));
    if (next === 'completed') {
      await db.run('UPDATE shop_orders SET goods_agorot = ? WHERE order_id = ?', goods, r.id);
      const m = (await db.one('SELECT id, commission_bps FROM merchants WHERE id = ?', s.merchant_id))!;
      const commission = Math.round(goods * Number(m.commission_bps) / 10_000);
      await ledger('merchant', { merchant: Number(m.id), order: r.id }, 'goods', goods, 'Goods of a delivered order', actor, `shop-goods-${r.id}`);
      if (commission) {
        await ledger('merchant', { merchant: Number(m.id), order: r.id }, 'commission', -commission, `Commission ${Number(m.commission_bps) / 100}%`, actor, `shop-commission-m-${r.id}`);
        await ledger('wind', { merchant: Number(m.id), order: r.id }, 'commission', commission, 'Merchant commission', actor, `shop-commission-w-${r.id}`);
      }
      if (Number(s.service_fee_agorot)) await ledger('wind', { order: r.id, driver: r.driver_id }, 'service_fee', Number(s.service_fee_agorot), 'Service fee', actor, `shop-service-${r.id}`);
      // A short door (a typed variance) is Wind's loss, not the shop's or the captain's (DLV-22: Wind pays for everything else).
      const collected = Number((await db.one('SELECT collected_cents FROM orders WHERE id = ?', r.id))?.collected_cents ?? 0);
      const due = goods + Number(s.service_fee_agorot), atDoor = Math.max(0, collected - Number(s.delivery_fee_agorot)), held = Math.min(due, atDoor);
      if (held < due) await ledger('wind', { order: r.id, driver: r.driver_id }, 'door_short', held - due, 'Collected less than due at the door', actor, `shop-short-${r.id}`);
      // An over-collection is the customer's money: the captain owes all of it, and Wind holds the excess to give back.
      if (atDoor > due) await ledger('wind', { order: r.id, driver: r.driver_id }, 'door_over', atDoor - due, 'Collected more than due at the door, owed back to the customer', actor, `shop-over-${r.id}`);
      await deps.journal(r.id, Number(r.driver_id), 'collection', { goods: Math.min(goods, held), service: held - Math.min(goods, held), over: atDoor - held });
      return;
    }
    // A returned shop order earns no commission; the captain is paid the trip and the return leg from operating expenses.
    await db.run('UPDATE orders SET commission = 0 WHERE id = ?', r.id);
    // Pay follows how custody entered the return, whichever route closes it (Sol R2-H3), from the order's own audit:
    // DRV-17: the captain holding it was blocked: the trip so far is paid only by a cleared block review (none on a schema without one).
    const { supportHasGoods, custodyBlocked } = await returnCustody(db, r);
    if (custodyBlocked) return;
    // Support recovered the goods from the captain: the trip so far (one fee), no return leg.
    const pay = (supportHasGoods ? 1 : deliveredToOffice ? 3 : 2) * Number(s.delivery_fee_agorot);
    if (pay && r.driver_id) {
      await ledger('captain', { driver: Number(r.driver_id), order: r.id }, 'trip_pay', pay,
        supportHasGoods ? 'Trip so far, support recovered the goods' : deliveredToOffice ? 'Trip, return and office delivery' : 'Trip and return leg of a failed delivery', actor, `shop-trip-${r.id}`);
      await ledger('wind', { driver: Number(r.driver_id), order: r.id }, 'opex_trip', -pay, 'Captain pay for a failed delivery', actor, `shop-trip-opex-${r.id}`);
      await deps.journal(r.id, Number(r.driver_id), 'trip', { trip: pay });
    }
  }
  /** DRV-17: a cleared block review pays the trip so far from operating expenses, once. */
  async function blockTripPay(orderId: number, driverId: number, pay: number, actor: number) {
    await ledger('captain', { driver: driverId, order: orderId }, 'trip_pay', pay, 'Trip so far, courier block review cleared', actor, `shop-block-trip-${orderId}`);
    await ledger('wind', { driver: driverId, order: orderId }, 'opex_trip', -pay, 'Captain pay, courier block review cleared', actor, `shop-block-opex-${orderId}`);
    await deps.journal(orderId, driverId, 'trip', { trip: pay });
  }
  /** DLV-23 money: an assigned captain is paid the trip so far from operating expenses when the order stops before collection. */
  async function postCancel(r: Row, s: Row, reason: ShopCancelReason, actor: number) {
    if (!r.driver_id) return;
    // ponytail: trip so far = half the fee on the way, the whole fee at the shop; measured distance comes with live tracking on PostgreSQL.
    const fee = Number(s.delivery_fee_agorot), pay = r.status === 'at_pickup' ? fee : r.status === 'assigned' ? Math.round(fee / 2) : 0;
    await db.run('UPDATE orders SET commission = 0 WHERE id = ?', r.id);
    if (pay) {
      await ledger('captain', { driver: Number(r.driver_id), order: r.id }, 'trip_pay', pay, `Trip to the shop (${reason})`, actor, `shop-cancel-trip-${r.id}`);
      await ledger('wind', { driver: Number(r.driver_id), order: r.id }, 'opex_trip', -pay, `Captain pay, cancelled at the shop (${reason})`, actor, `shop-cancel-opex-${r.id}`);
      await deps.journal(r.id, Number(r.driver_id), 'trip', { trip: pay });
    }
  }
  async function ledger(book: 'merchant' | 'captain' | 'wind', who: { merchant?: number; driver?: number | null; order?: number | null }, kind: string, amount: number,
    note: string, actor: number, ref: string, reference: string | null = null) {
    if (!amount) return;
    if (await db.one('SELECT 1 FROM shop_ledger WHERE business_ref = ?', ref)) return; // posted once per business event
    await db.run(`INSERT INTO shop_ledger (book, merchant_id, driver_id, order_id, kind, amount_agorot, note, reference, actor_id, business_ref, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, book, who.merchant ?? null, who.driver ?? null, who.order ?? null, kind, amount, note, reference, actor, ref, Date.now());
  }
  route('POST', '/api/orders/:id/shop/handover', async ({ user, params, body }) => {
    need(user, 'driver'); needActive(user);
    return deps.driverCommand(user, Number(params[0]), body, async (driver, id, input) => { await handover(driver, id, input); return getOrder(id, driver); });
  });
  /** Driver release and the captain's own exception path never move goods already handed over (§2.1, DRV-13, DRV-17). */
  async function guardCaptainExit(r: Row, kind: 'release' | 'exception') {
    if (r.service !== 'shop') return;
    const s = await shopRow(r.id);
    if (kind === 'release' && s?.merchant_state === 'handed_over') fail(409, 'cannot_release');
    if (kind === 'exception' && r.status === 'at_pickup') fail(409, 'shop_captain_cannot_cancel');
  }
  /** Admin resolve for a held shop order: return for every reason except `rescheduled`, which may get one more attempt (DLV-25). */
  async function guardResolve(id: number, action: string) {
    const r = await db.one('SELECT service, exception_reason FROM orders WHERE id = ?', id);
    if (r?.service !== 'shop' || action !== 'reattempt') return;
    if (r.exception_reason !== 'rescheduled') fail(409, 'cannot_resolve');
    const done = await db.all("SELECT detail FROM security_events WHERE order_id = ? AND action = 'EXCEPTION_RESOLVED'", id);
    if (done.some(e => { try { return JSON.parse(e.detail).action === 'reattempt'; } catch { return false; } })) fail(409, 'cannot_resolve');
  }

  // ---------- admin ----------
  route('GET', '/api/admin/merchants', async ({ user }) => {
    need(user, 'admin'); await available();
    const rows = await db.all('SELECT * FROM merchants ORDER BY CASE status WHEN \'pending\' THEN 0 ELSE 1 END, id DESC LIMIT 500');
    const out = [];
    for (const m of rows) out.push({ ...(await merchantView(m, true)), ...(await statement(Number(m.id))) });
    return { merchants: out };
  });
  route('POST', '/api/admin/merchants/:id', async ({ user, params, body }) => inTx(async () => {
    need(user, 'admin'); await available();
    const m = await db.one(`SELECT * FROM merchants WHERE id = ?${forUpdate}`, Number(params[0])) ?? fail(404, 'not_found');
    if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== Number(m.updated_at)) fail(409, 'settings_changed');
    const now = Date.now();
    const status = body.status === undefined ? m.status : ['active', 'paused'].includes(body.status) ? body.status : fail(400, 'invalid_input');
    if (status === 'active' && !licenceValid(m, now) && body.licenceExpiresAt === undefined) fail(409, 'licence_expired');
    const fee = (k: string, max: number) => body[k] === undefined ? undefined : agorot(body[k], max);
    const updates: [string, unknown][] = [['status', status]];
    for (const [key, column, max] of [['minOrderAgorot', 'min_order_agorot', 100_000], ['deliveryFeeAgorot', 'delivery_fee_agorot', 20_000],
      ['serviceFeeAgorot', 'service_fee_agorot', 10_000], ['commissionBps', 'commission_bps', 5000]] as const) {
      const v = fee(key, max);
      if (v !== undefined) updates.push([column, v]);
    }
    if (body.licenceExpiresAt !== undefined) updates.push(['licence_expires_at', Number.isSafeInteger(body.licenceExpiresAt) && body.licenceExpiresAt > now ? body.licenceExpiresAt : fail(400, 'invalid_input')]);
    if (body.licenceNo !== undefined) updates.push(['licence_no', text(body.licenceNo, 60)]);
    for (const [column, value] of updates) await db.run(`UPDATE merchants SET ${column} = ? WHERE id = ?`, value as string | number, m.id);
    await db.run('UPDATE merchants SET updated_at = ? WHERE id = ?', now, m.id);
    await audit(user.id, null, m.status === 'pending' && status === 'active' ? 'MERCHANT_APPROVED' : 'MERCHANT_UPDATED', { merchantId: Number(m.id), changes: Object.fromEntries(updates) });
    if (m.status === 'pending' && status === 'active') await push([m.owner_user_id], 'approved', 0, '/merchant');
    return { ...(await merchantView((await db.one('SELECT * FROM merchants WHERE id = ?', m.id))!, true)), ...(await statement(Number(m.id))) };
  }));
  // MER-07: a payout is a debit with a reference, never more than the shop is owed for cash Wind already holds.
  route('POST', '/api/admin/merchants/:id/payout', async ({ user, params, body }) => inTx(async () => {
    need(user, 'admin'); await available();
    const m = await db.one(`SELECT * FROM merchants WHERE id = ?${forUpdate}`, Number(params[0])) ?? fail(404, 'not_found');
    const amount = agorot(body.amountAgorot, 10_000_000);
    const reference = text(body.reference, 80);
    if (amount < 1) fail(400, 'invalid_amount');
    const requestId = typeof body.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : fail(400, 'invalid_request_id');
    const ref = `shop-payout-${requestId}`;
    const done = await db.one('SELECT * FROM shop_ledger WHERE business_ref = ?', ref);
    if (done) { if (Number(done.merchant_id) !== Number(m.id) || -Number(done.amount_agorot) !== amount) fail(409, 'idempotency_conflict'); return statement(Number(m.id)); }
    if (amount > (await statement(Number(m.id))).payableAgorot) fail(409, 'insufficient_balance');
    await ledger('merchant', { merchant: Number(m.id) }, 'payout', -amount, 'Payout', user.id, ref, reference);
    await audit(user.id, null, 'MERCHANT_PAYOUT', { merchantId: Number(m.id), amount, reference });
    await push([m.owner_user_id], 'cash', 0, '/merchant');
    return statement(Number(m.id));
  }));
  const adminOrder = async (user: User, id: number) => {
    need(user, 'admin'); await available();
    const r = await db.one(`SELECT * FROM orders WHERE id = ? AND service = 'shop'${forUpdate}`, id) ?? fail(404, 'not_found');
    return { r, s: (await shopRow(r.id))! };
  };
  // DLV-23: an operator cancels only with one of the allowed reasons, at the allowed stage, with a note.
  route('POST', '/api/admin/orders/:id/shop/cancel', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await adminOrder(user, Number(params[0]));
    // Old servers reject this command because a generic cancellation requires an explicit reason.
    const handover = body.action === 'cancel_handover_exception';
    if (body.action !== undefined && (!handover || body.reason !== undefined)) fail(400, 'invalid_input');
    const reason = handover ? 'handover_exception_unresolved' : body.reason as ShopCancelReason;
    if (reason === 'below_minimum' || reason === 'accept_expired') fail(409, 'reason_reserved');
    if (!adminShopCancels.includes(reason)) fail(400, 'invalid_input');
    if (reason === 'handover_exception_unresolved' && !handover) fail(400, 'invalid_input');
    const note = text(body.note, 500);
    if (note.length < 5) fail(400, 'invalid_input');
    if (handover) needStaff(await staffActor(db, user as never), fail, 'support', 'dispatcher');
    if (r.status === 'cancelled') return getOrder(r.id, user);
    if (s.merchant_state === 'handed_over' || !['requested', 'searching', 'assigned', 'at_pickup'].includes(r.status)) fail(409, 'use_hold'); // after collection it is a hold, never a cancel
    const state = s.merchant_state as MerchantState | null;
    const allowed = reason === 'customer_via_support_accepted' ? state === 'accepted'
      : reason === 'no_captain' ? ['accepted', 'preparing', 'ready', 'awaiting_approval'].includes(state ?? '') && ['requested', 'searching'].includes(r.status)
      : handover ? await handoverOverdue(r.id)
      : reason === 'merchant_request' ? ['preparing', 'awaiting_approval', 'ready'].includes(state ?? '')
      : true; // operational: safety, legal hold or platform outage, before collection
    if (!allowed) fail(409, 'cancel_refused');
    if (handover) {
      if (!Number.isSafeInteger(body.exceptionAt)) fail(400, 'invalid_input');
      if (await openExceptionAt(r.id) !== body.exceptionAt) fail(409, 'exception_changed');
    }
    await cancelWith(r, s, reason, user.id, note, handover ? body.exceptionAt : undefined);
    return getOrder(r.id, user);
  }));
  // DLV-22: support records who answers for a failed or disputed order once; credits and PAY-09 wait for it.
  route('POST', '/api/admin/orders/:id/shop/fault', async ({ user, params, body }) => inTx(async () => {
    const { r } = await adminOrder(user, Number(params[0]));
    const result = ['merchant', 'wind', 'none'].includes(body.result) ? body.result as ShopFault : fail(400, 'invalid_input');
    const note = text(body.note, 500);
    if (note.length < 5) fail(400, 'invalid_input');
    if (r.exception_reason === 'operational' && result !== 'wind') fail(400, 'invalid_input'); // an operational stop is always Wind's
    if (await db.one('SELECT 1 FROM shop_faults WHERE order_id = ?', r.id)) fail(409, 'fault_exists');
    await db.run('INSERT INTO shop_faults (order_id, result, actor_id, note, created_at) VALUES (?, ?, ?, ?, ?)', r.id, result, user.id, note, Date.now());
    await audit(user.id, r.id, 'SHOP_FAULT', { result });
    return getOrder(r.id, user);
  }));
  // DLV-25: unsellable returned lines are credited to the shop from operating expenses when the fault is Wind's or nobody's.
  route('POST', '/api/admin/orders/:id/shop/unsellable', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await adminOrder(user, Number(params[0]));
    const fault = await db.one('SELECT result FROM shop_faults WHERE order_id = ?', r.id) ?? fail(409, 'fault_required');
    if (!(r.status === 'returned' || (r.status === 'cancelled' && ['no_captain', 'operational'].includes(s.cancel_reason) && s.preparing_at != null))) fail(409, 'shop_state');
    const line = (await linesOf(r.id)).find(l => l.id === Number(body.lineId) && !l.removed) ?? fail(404, 'not_found');
    const note = text(body.note, 500);
    if (note.length < 5) fail(400, 'invalid_input');
    if (fault!.result === 'merchant') fail(409, 'fault_required'); // the shop's own fault earns no credit
    const value = line.finalAgorot ?? line.estimateAgorot;
    const m = (await db.one('SELECT commission_bps FROM merchants WHERE id = ?', s.merchant_id))!;
    const commission = Math.round(value * Number(m.commission_bps) / 10_000);
    await ledger('wind', { merchant: Number(s.merchant_id), order: r.id }, 'opex_unsellable', -value, `Unsellable: ${line.nameEn}`, user.id, `shop-unsellable-w-${r.id}-${line.id}`);
    await ledger('merchant', { merchant: Number(s.merchant_id), order: r.id }, 'unsellable', value, `Unsellable: ${line.nameEn}`, user.id, `shop-unsellable-m-${r.id}-${line.id}`);
    if (commission) {
      await ledger('merchant', { merchant: Number(s.merchant_id), order: r.id }, 'commission', -commission, 'Commission on unsellable credit', user.id, `shop-unsellable-cm-${r.id}-${line.id}`);
      await ledger('wind', { merchant: Number(s.merchant_id), order: r.id }, 'commission', commission, 'Commission on unsellable credit', user.id, `shop-unsellable-cw-${r.id}-${line.id}`);
    }
    return getOrder(r.id, user);
  }));
  // DLV-22: a refund of goods found wrong, missing or damaged, paid by whoever the fault result names.
  route('POST', '/api/admin/orders/:id/shop/refund', async ({ user, params, body }) => inTx(async () => {
    const { r, s } = await adminOrder(user, Number(params[0]));
    const fault = await db.one('SELECT result FROM shop_faults WHERE order_id = ?', r.id) ?? fail(409, 'fault_required');
    if (r.status !== 'completed') fail(409, 'shop_state');
    // A refund is one business event per requestId, as a payout is: a retried request after a lost response pays once.
    if (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)) fail(400, 'invalid_input');
    const key = `${r.id}-${String(body.requestId).toLowerCase()}`;
    const amount = agorot(body.amountAgorot, 10_000_000);
    const reason = text(body.reason, 500);
    const prior = await db.one('SELECT amount_agorot, note FROM shop_ledger WHERE business_ref = ?', `shop-refund-${key}`);
    if (prior) { // a replay must be the same refund, as a payout replay is
      if (-Number(prior.amount_agorot) !== amount || prior.note !== reason) fail(409, 'idempotency_conflict');
      return getOrder(r.id, user);
    }
    const refunded = -Number((await db.one("SELECT COALESCE(SUM(amount_agorot), 0) AS n FROM shop_ledger WHERE order_id = ? AND kind = 'refund'", r.id))!.n);
    if (amount < 1 || reason.length < 5 || amount + refunded > Number(s.goods_agorot)) fail(400, 'invalid_input');
    if (fault!.result === 'none') fail(409, 'fault_required');
    await ledger(fault!.result === 'merchant' ? 'merchant' : 'wind', { merchant: Number(s.merchant_id), order: r.id }, 'refund', -amount, reason, user.id, `shop-refund-${key}`);
    if (fault!.result === 'merchant') { // the commission this order paid on the refunded goods comes back to the shop, pro rata
      const charged = -Number((await db.one('SELECT COALESCE(SUM(amount_agorot), 0) AS n FROM shop_ledger WHERE business_ref = ?', `shop-commission-m-${r.id}`))!.n);
      const returned = Number((await db.one("SELECT COALESCE(SUM(amount_agorot), 0) AS n FROM shop_ledger WHERE book = 'merchant' AND order_id = ? AND business_ref LIKE 'shop-refund-cm-%'", r.id))!.n);
      const back = Math.min(charged - returned, Number(s.goods_agorot) ? Math.round(amount * charged / Number(s.goods_agorot)) : 0);
      await ledger('merchant', { merchant: Number(s.merchant_id), order: r.id }, 'commission', back, 'Commission on refunded goods', user.id, `shop-refund-cm-${key}`);
      await ledger('wind', { merchant: Number(s.merchant_id), order: r.id }, 'commission', -back, 'Commission on refunded goods', user.id, `shop-refund-cw-${key}`);
    }
    // The office pays the customer; the captain still owes the cash he collected at the door.
    await audit(user.id, r.id, 'SHOP_REFUND', { amount, payer: fault!.result, reason });
    await push([r.customer_id], 'shop_update', r.id);
    return getOrder(r.id, user);
  }));
  route('POST', '/api/admin/orders/:id/shop/reset-pickup', async ({ user, params, body }) => inTx(async () => {
    const { r } = await adminOrder(user, Number(params[0]));
    const reason = text(body.reason, 500);
    if (reason.length < 5) fail(400, 'invalid_input');
    await db.run('UPDATE shop_orders SET pickup_failures = 0 WHERE order_id = ?', r.id);
    await audit(user.id, r.id, 'SHOP_PICKUP_RESET', { reason });
    if (r.driver_id) await push([r.driver_id], 'shop_update', r.id);
    return getOrder(r.id, user);
  }));
  // PAY-09: support's review lifts the pause on a customer's cash shop orders.
  route('POST', '/api/admin/users/:id/shop-review', async ({ user, params, body }) => {
    need(user, 'admin'); await available();
    const note = text(body.note, 500);
    if (note.length < 5) fail(400, 'invalid_input');
    const id = Number(params[0]);
    if (!(await db.one("SELECT 1 FROM users WHERE id = ? AND role = 'customer'", id))) fail(404, 'not_found');
    await db.run("INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, NULL, 'SHOP_CASH_REVIEWED', ?, ?)", user.id, JSON.stringify({ customerId: id }), Date.now());
    return { ok: true };
  });
  // The stuck list (DLV-12, DLV-13, DLV-22): orders an operator should look at now.
  route('GET', '/api/admin/shop/attention', async ({ user }) => {
    need(user, 'admin'); await available();
    const now = Date.now();
    const rows = await db.all(`SELECT o.id FROM orders o JOIN shop_orders s ON s.order_id = o.id WHERE
      (o.status = 'searching' AND s.no_captain_alerted_at IS NOT NULL)
      OR (s.handover_exception IS NOT NULL AND o.status = 'at_pickup' AND ${exceptionSince} <= ?)
      OR (s.pickup_failures >= ?)
      OR (o.status IN ('returned','on_hold') AND NOT EXISTS (SELECT 1 FROM shop_faults f WHERE f.order_id = o.id) AND o.updated_at < ?)
      ORDER BY o.id DESC LIMIT 100`, now - (await settings()).shopHandoverMinutes * MINUTE, lockedTries, now - 2 * DAY);
    const orders = [];
    for (const row of rows) orders.push(await getOrder(Number(row.id), user));
    return { orders };
  });

  return { place, view, merchantSees, customerCancel, sweep, holdCents, handover, beforeAdvance, doorCash, afterFinish, guardCaptainExit, guardResolve, blockTripPay,
    recordSeals, exceptionReasons: shopExceptionReasons as readonly string[] };
}
