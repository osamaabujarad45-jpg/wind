/// <reference types="node" />
// Wind API: zero-dependency Node 24 server (node:http + node:sqlite).
// Run: node server/main.ts · Make an admin: node server/main.ts promote 0599XXXXXX
import { createServer, type IncomingMessage } from 'node:http';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  activeStatuses, commissionOn, defaultSettings, fractionSettings, isCity, nextStatus, normalizePhone,
  optionsFor, planForRole, quote, services, sharedCapacity, vehicleServices, vehicles,
  type Order, type Plan, type Role, type Service, type Settings, type Subscription, type User, type Vehicle,
} from '../src/model.ts';

const DAY = 86_400_000;
const SESSION_DAYS = 90;
const privacyPage = readFileSync(new URL('privacy.html', import.meta.url), 'utf8')
  .replaceAll('{{contact}}', process.env.SUPPORT_CONTACT ?? '');

export const db = new DatabaseSync(process.env.DB_PATH ?? 'wind.db');
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','driver','admin')),
  status TEXT NOT NULL CHECK (status IN ('active','pending','blocked')),
  vehicle TEXT CHECK (vehicle IN ('car','van','truck')), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES users(id), driver_id INTEGER REFERENCES users(id),
  service TEXT NOT NULL, shared INTEGER NOT NULL, pickup_city TEXT NOT NULL, dropoff_city TEXT NOT NULL,
  pickup_lat REAL, pickup_lng REAL, pickup_note TEXT NOT NULL, dropoff_note TEXT NOT NULL, contact TEXT NOT NULL,
  detail TEXT NOT NULL, option TEXT NOT NULL, loading_help INTEGER NOT NULL, price REAL NOT NULL, commission REAL,
  status TEXT NOT NULL, handover_code TEXT, rating INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  completed_at INTEGER);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_driver ON orders(driver_id);
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id INTEGER PRIMARY KEY REFERENCES users(id), lat REAL NOT NULL, lng REAL NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), plan TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','rejected')), price REAL NOT NULL,
  activated_at INTEGER, ends_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value REAL NOT NULL);
`);

type Row = Record<string, any>;
const one = (sql: string, ...p: SQLInputValue[]) => db.prepare(sql).get(...p) as Row | undefined;
const all = (sql: string, ...p: SQLInputValue[]) => db.prepare(sql).all(...p) as Row[];
const run = (sql: string, ...p: SQLInputValue[]) => db.prepare(sql).run(...p);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

// ---------- helpers ----------

function settings(): Settings {
  const stored = Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value]));
  return { ...defaultSettings, ...stored };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 32));
}

function newPassword(value: unknown) {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 6 || password.length > 100) fail(400, 'weak_password');
  return password;
}

const sha = (token: string) => createHash('sha256').update(token).digest('hex');

function toUser(r: Row): User {
  const rating = r.role === 'driver' ? one('SELECT AVG(rating) avg FROM orders WHERE driver_id = ? AND rating IS NOT NULL', r.id)?.avg : null;
  return { id: r.id, phone: r.phone, name: r.name, role: r.role, status: r.status, vehicle: r.vehicle ?? null,
    rating: rating == null ? null : Math.round(rating * 10) / 10, createdAt: r.created_at };
}

function activePlan(userId: number): Plan | null {
  return (one("SELECT plan FROM subscriptions WHERE user_id = ? AND status = 'active' AND ends_at > ?", userId, Date.now())?.plan as Plan) ?? null;
}

function latestSubscription(userId: number): Subscription | null {
  const r = one(`SELECT * FROM subscriptions WHERE user_id = ? AND (status = 'pending' OR (status = 'active' AND ends_at > ?))
    ORDER BY id DESC LIMIT 1`, userId, Date.now());
  return r ? toSubscription(r) : null;
}

function toSubscription(r: Row): Subscription {
  const expired = r.status === 'active' && r.ends_at <= Date.now();
  return { id: r.id, userId: r.user_id, plan: r.plan, status: expired ? 'expired' : r.status, price: r.price, endsAt: r.ends_at ?? null,
    createdAt: r.created_at, userName: r.user_name, userPhone: r.user_phone };
}

const orderSelect = `SELECT o.*, c.name customer_name, d.name driver_name, d.phone driver_phone, d.vehicle driver_vehicle,
  l.lat loc_lat, l.lng loc_lng, l.updated_at loc_at
  FROM orders o JOIN users c ON c.id = o.customer_id LEFT JOIN users d ON d.id = o.driver_id
  LEFT JOIN driver_locations l ON l.driver_id = o.driver_id`;

function toOrder(r: Row, viewer: User): Order {
  const owner = viewer.role === 'admin' || viewer.id === r.customer_id;
  const assigned = viewer.id === r.driver_id;
  const live = activeStatuses.includes(r.status) && r.loc_lat != null;
  return {
    id: r.id, customerId: r.customer_id, driverId: r.driver_id ?? null, service: r.service, shared: !!r.shared,
    pickupCity: r.pickup_city, dropoffCity: r.dropoff_city,
    pickupPoint: r.pickup_lat == null ? null : { latitude: r.pickup_lat, longitude: r.pickup_lng },
    pickupNote: r.pickup_note, dropoffNote: r.dropoff_note, detail: r.detail, option: r.option, loadingHelp: !!r.loading_help,
    contact: owner || assigned ? r.contact : null, // drivers see the phone only after accepting
    price: r.price, commission: r.commission ?? null, status: r.status,
    handoverCode: owner ? r.handover_code ?? null : null, // the customer gives it to the driver at delivery
    rating: r.rating ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
    customerName: r.customer_name, driverName: r.driver_name ?? undefined,
    driverPhone: owner || assigned ? r.driver_phone ?? undefined : undefined, driverVehicle: r.driver_vehicle ?? null,
    driverLocation: live && (owner || assigned) ? { latitude: r.loc_lat, longitude: r.loc_lng, updatedAt: r.loc_at, ageSeconds: Math.max(0, Math.round((Date.now() - r.loc_at) / 1000)) } : null,
  };
}

function getOrder(id: number, viewer: User): Order {
  const r = one(`${orderSelect} WHERE o.id = ?`, id) ?? fail(404, 'not_found');
  const canSee = viewer.role === 'admin' || r.customer_id === viewer.id || r.driver_id === viewer.id ||
    (viewer.role === 'driver' && r.status === 'searching');
  if (!canSee) fail(404, 'not_found');
  return toOrder(r, viewer);
}

const text = (v: unknown, max: number, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if ((required && !s) || s.length > max) fail(400, 'invalid_input');
  return s;
};
const need = (user: User, ...roles: Role[]) => { if (!roles.includes(user.role)) fail(403, 'forbidden'); };
const needActive = (user: User) => { if (user.status !== 'active') fail(403, user.status === 'pending' ? 'pending_approval' : 'blocked'); };

// ponytail: in-memory login throttle, per process; move to the DB if the API runs on several instances.
const attempts = new Map<string, { count: number; until: number }>();

// ---------- routes ----------

type Ctx = { user: User | null; body: Row; params: string[]; query: URLSearchParams };
type Handler = (ctx: Ctx & { user: User }) => unknown;
const routes: [string, RegExp, Handler, boolean?][] = [];
const route = (method: string, path: string, handler: Handler, isPublic = false) =>
  routes.push([method, new RegExp(`^${path.replace(/:\w+/g, '(\\d+)')}$`), handler, isPublic]);

route('GET', '/api/health', () => ({ ok: true }), true);

route('POST', '/api/auth/register', ({ body }) => {
  const phone = normalizePhone(String(body.phone ?? '')) ?? fail(400, 'invalid_phone');
  const name = text(body.name, 60);
  const password = newPassword(body.password);
  const role: Role = body.role === 'driver' ? 'driver' : 'customer'; // admins only via the promote command
  const vehicle = role === 'driver' ? (vehicles.includes(body.vehicle) ? body.vehicle as Vehicle : fail(400, 'invalid_vehicle')) : null;
  if (one('SELECT id FROM users WHERE phone = ?', phone)) fail(409, 'phone_taken');
  const id = Number(run('INSERT INTO users (phone, name, password, role, status, vehicle, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    phone, name, hashPassword(password), role, role === 'driver' ? 'pending' : 'active', vehicle, Date.now()).lastInsertRowid);
  return startSession(id);
}, true);

route('POST', '/api/auth/login', ({ body }) => {
  const phone = normalizePhone(String(body.phone ?? '')) ?? fail(400, 'invalid_phone');
  const throttle = attempts.get(phone);
  if (throttle && throttle.count >= 5 && throttle.until > Date.now()) fail(429, 'too_many_attempts');
  const r = one('SELECT * FROM users WHERE phone = ?', phone);
  if (!r || !checkPassword(String(body.password ?? ''), r.password)) {
    const count = throttle && throttle.until > Date.now() ? throttle.count + 1 : 1;
    attempts.set(phone, { count, until: Date.now() + 10 * 60_000 });
    fail(401, 'wrong_credentials');
  }
  attempts.delete(phone);
  if (r!.status === 'blocked') fail(403, 'blocked');
  return startSession(r!.id);
}, true);

function startSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)', sha(token), userId, Date.now());
  return { token, ...me(toUser(one('SELECT * FROM users WHERE id = ?', userId)!)) };
}

function me(user: User) {
  return { user, subscription: latestSubscription(user.id), plan: activePlan(user.id), settings: settings() };
}

route('POST', '/api/auth/logout', ({ user }) => { run('DELETE FROM sessions WHERE user_id = ?', user.id); return { ok: true }; });
route('GET', '/api/me', ({ user }) => me(user));

route('POST', '/api/me', ({ user, body }) => {
  run('UPDATE users SET name = ? WHERE id = ?', text(body.name, 60), user.id);
  return me(toUser(one('SELECT * FROM users WHERE id = ?', user.id)!));
});

route('POST', '/api/me/password', ({ user, body }) => {
  const stored = one('SELECT password FROM users WHERE id = ?', user.id)!.password;
  if (!checkPassword(String(body.current ?? ''), stored)) fail(401, 'wrong_password');
  run('UPDATE users SET password = ? WHERE id = ?', hashPassword(newPassword(body.password)), user.id);
  return { ok: true };
});

// Store rules require in-app account deletion. Orders stay for accounting, stripped of personal data.
route('POST', '/api/me/delete', ({ user }) => {
  if (user.role === 'admin') fail(409, 'cannot_change_self');
  if (one(`SELECT id FROM orders WHERE (customer_id = ? OR driver_id = ?) AND status IN ('searching','assigned','at_pickup','in_transit')`, user.id, user.id))
    fail(409, 'active_orders');
  db.exec('BEGIN');
  try {
    run(`UPDATE users SET name = '—', phone = ?, password = '', status = 'blocked', vehicle = NULL WHERE id = ?`, `deleted-${user.id}`, user.id);
    run(`UPDATE orders SET contact = '', pickup_note = '', dropoff_note = '', detail = '', pickup_lat = NULL, pickup_lng = NULL
      WHERE customer_id = ?`, user.id);
    run('DELETE FROM driver_locations WHERE driver_id = ?', user.id);
    run("DELETE FROM subscriptions WHERE user_id = ? AND status = 'pending'", user.id);
    run('DELETE FROM sessions WHERE user_id = ?', user.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { ok: true };
});

// Customers
route('POST', '/api/orders', ({ user, body }) => {
  need(user, 'customer');
  needActive(user);
  const service = services.includes(body.service) ? body.service as Service : fail(400, 'invalid_service');
  if (!isCity(body.pickupCity) || !isCity(body.dropoffCity)) fail(400, 'invalid_city');
  const option = optionsFor(service).includes(String(body.option)) ? String(body.option) : fail(400, 'invalid_option');
  const contact = normalizePhone(String(body.contact ?? '')) ?? fail(400, 'invalid_phone');
  const point = body.pickupPoint;
  const validPoint = point && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
  const shared = !!body.shared, loadingHelp = service === 'freight' && !!body.loadingHelp;
  const price = quote(settings(), { service, pickupCity: body.pickupCity, dropoffCity: body.dropoffCity, option, loadingHelp, shared,
    plus: activePlan(user.id) === 'plus' });
  // The app shows a price before commitment; if tariffs or the plan changed since, make the customer re-confirm.
  if (body.quotedPrice != null && Number(body.quotedPrice) !== price) fail(409, 'price_changed');
  const now = Date.now();
  const id = Number(run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_lat, pickup_lng,
    pickup_note, dropoff_note, contact, detail, option, loading_help, price, status, handover_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching', ?, ?, ?)`,
    user.id, service, shared ? 1 : 0, body.pickupCity, body.dropoffCity,
    validPoint ? Number(point.latitude) : null, validPoint ? Number(point.longitude) : null,
    text(body.pickupNote, 200), text(body.dropoffNote, 200), contact, text(body.detail, 500, service !== 'ride'),
    option, loadingHelp ? 1 : 0, price, service === 'ride' ? null : String(randomInt(1000, 10000)), now, now).lastInsertRowid);
  return getOrder(id, user);
});

route('GET', '/api/orders', ({ user, query }) => {
  const status = query.get('status');
  const where = user.role === 'admin' ? '1 = 1' : user.role === 'driver' ? 'o.driver_id = ?' : 'o.customer_id = ?';
  const args: SQLInputValue[] = user.role === 'admin' ? [] : [user.id];
  const filter = status ? (args.push(status), ' AND o.status = ?') : '';
  return all(`${orderSelect} WHERE ${where}${filter} ORDER BY o.id DESC LIMIT 200`, ...args).map(r => toOrder(r, user));
});

route('GET', '/api/orders/:id', ({ user, params }) => getOrder(Number(params[0]), user));

route('POST', '/api/orders/:id/cancel', ({ user, params }) => {
  const order = getOrder(Number(params[0]), user);
  const allowed = user.role === 'admin' ? !['completed', 'cancelled'].includes(order.status)
    : user.id === order.customerId && ['searching', 'assigned'].includes(order.status);
  if (!allowed) fail(409, 'cannot_cancel');
  run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", Date.now(), order.id);
  return getOrder(order.id, user);
});

route('POST', '/api/orders/:id/rate', ({ user, params, body }) => {
  const order = getOrder(Number(params[0]), user);
  const rating = Number(body.rating);
  if (order.customerId !== user.id || order.status !== 'completed' || order.rating || !(rating >= 1 && rating <= 5)) fail(409, 'cannot_rate');
  run('UPDATE orders SET rating = ? WHERE id = ?', Math.round(rating), order.id);
  return getOrder(order.id, user);
});

// Drivers
route('GET', '/api/jobs', ({ user }) => {
  need(user, 'driver');
  needActive(user);
  const allowed = vehicleServices[user.vehicle ?? 'car'];
  return all(`${orderSelect} WHERE o.status = 'searching' AND o.service IN (${allowed.map(() => '?').join(',')}) ORDER BY o.id LIMIT 50`, ...allowed)
    .map(r => toOrder(r, user));
});

route('POST', '/api/jobs/:id/accept', ({ user, params }) => {
  need(user, 'driver');
  needActive(user);
  const order = getOrder(Number(params[0]), user);
  if (!vehicleServices[user.vehicle ?? 'car'].includes(order.service)) fail(409, 'wrong_vehicle');
  const active = all(`SELECT shared FROM orders WHERE driver_id = ? AND status IN ('assigned','at_pickup','in_transit')`, user.id);
  // Shared jobs can be pooled up to capacity; a private job needs the vehicle to itself.
  if (active.length && (!order.shared || active.some(a => !a.shared) || active.length >= sharedCapacity)) fail(409, 'vehicle_busy');
  const changed = run("UPDATE orders SET driver_id = ?, status = 'assigned', updated_at = ? WHERE id = ? AND status = 'searching'",
    user.id, Date.now(), order.id).changes;
  if (!changed) fail(409, 'already_taken');
  return getOrder(order.id, user);
});

route('POST', '/api/orders/:id/release', ({ user, params }) => {
  const order = getOrder(Number(params[0]), user);
  if (order.driverId !== user.id || order.status !== 'assigned') fail(409, 'cannot_release');
  run("UPDATE orders SET driver_id = NULL, status = 'searching', updated_at = ? WHERE id = ?", Date.now(), order.id);
  return { ok: true };
});

route('POST', '/api/orders/:id/advance', ({ user, params, body }) => {
  const r = one('SELECT * FROM orders WHERE id = ?', Number(params[0])) ?? fail(404, 'not_found');
  if (r.driver_id !== user.id || !activeStatuses.includes(r.status)) fail(409, 'cannot_advance');
  const next = nextStatus(r.status);
  const now = Date.now();
  if (next === 'completed') {
    if (r.handover_code && String(body.code ?? '').trim() !== r.handover_code) fail(400, 'wrong_code');
    const rate = activePlan(user.id) === 'pro' ? settings().proCommission : settings().commission;
    run("UPDATE orders SET status = 'completed', commission = ?, completed_at = ?, updated_at = ? WHERE id = ?",
      commissionOn(r.price, rate), now, now, r.id);
  } else run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', next, now, r.id);
  return getOrder(r.id, user);
});

route('POST', '/api/location', ({ user, body }) => {
  need(user, 'driver');
  const lat = Number(body.latitude), lng = Number(body.longitude);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) fail(400, 'invalid_location');
  run(`INSERT INTO driver_locations (driver_id, lat, lng, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(driver_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at`, user.id, lat, lng, Date.now());
  return { ok: true };
});

route('GET', '/api/driver/earnings', ({ user }) => {
  need(user, 'driver');
  const since = (from: number) => {
    const r = one(`SELECT COUNT(*) jobs, COALESCE(SUM(price), 0) gross, COALESCE(SUM(commission), 0) commission
      FROM orders WHERE driver_id = ? AND status = 'completed' AND completed_at >= ?`, user.id, from)!;
    return { jobs: r.jobs, gross: r.gross, commission: r.commission, net: Math.round((r.gross - r.commission) * 100) / 100 };
  };
  const midnight = new Date().setHours(0, 0, 0, 0);
  return { today: since(midnight), week: since(Date.now() - 7 * DAY), all: since(0) };
});

// Subscriptions: requested in-app, paid in cash / bank transfer, activated by an admin.
route('POST', '/api/subscriptions', ({ user }) => {
  const plan = planForRole[user.role] ?? fail(403, 'forbidden');
  if (latestSubscription(user.id)) fail(409, 'already_subscribed');
  const s = settings();
  run("INSERT INTO subscriptions (user_id, plan, status, price, created_at) VALUES (?, ?, 'pending', ?, ?)",
    user.id, plan, plan === 'plus' ? s.plusPrice : s.proPrice, Date.now());
  return me(user);
});

// Admin
route('GET', '/api/admin/stats', ({ user }) => {
  need(user, 'admin');
  const orders = one(`SELECT COUNT(*) completed, COALESCE(SUM(price), 0) gmv, COALESCE(SUM(commission), 0) commission
    FROM orders WHERE status = 'completed'`)!;
  const subs = one("SELECT COUNT(*) count, COALESCE(SUM(price), 0) revenue FROM subscriptions WHERE activated_at IS NOT NULL")!;
  // Calendar days in server local time (set TZ), built with setDate so DST changes don't shift the buckets.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13);
  const from = start.getTime();
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-CA'); // YYYY-MM-DD
  const byDay = new Map<string, { commission: number; subscriptions: number }>();
  for (let i = 0; i < 14; i++) byDay.set(day(new Date(start).setDate(start.getDate() + i)), { commission: 0, subscriptions: 0 });
  for (const r of all("SELECT completed_at t, commission v FROM orders WHERE status = 'completed' AND completed_at >= ?", from)) {
    const bucket = byDay.get(day(r.t));
    if (bucket) bucket.commission += r.v;
  }
  for (const r of all('SELECT activated_at t, price v FROM subscriptions WHERE activated_at >= ?', from)) {
    const bucket = byDay.get(day(r.t));
    if (bucket) bucket.subscriptions += r.v;
  }
  return {
    gmv: orders.gmv, commission: orders.commission, subscriptions: subs.revenue, profit: orders.commission + subs.revenue,
    completed: orders.completed, activeSubscriptions: one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'active' AND ends_at > ?", Date.now())!.n,
    statuses: Object.fromEntries(all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map(r => [r.status, r.n])),
    services: Object.fromEntries(all("SELECT service, COUNT(*) n FROM orders WHERE status = 'completed' GROUP BY service").map(r => [r.service, r.n])),
    users: Object.fromEntries(all('SELECT role, COUNT(*) n FROM users GROUP BY role').map(r => [r.role, r.n])),
    pendingDrivers: one("SELECT COUNT(*) n FROM users WHERE role = 'driver' AND status = 'pending'")!.n,
    pendingSubscriptions: one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'pending'")!.n,
    daily: [...byDay].map(([date, v]) => ({ date, ...v })),
  };
});

route('GET', '/api/admin/users', ({ user, query }) => {
  need(user, 'admin');
  const role = query.get('role'), q = `%${query.get('q') ?? ''}%`;
  return all(`SELECT * FROM users WHERE (? IS NULL OR role = ?) AND (name LIKE ? OR phone LIKE ?) AND phone NOT LIKE 'deleted-%'
    ORDER BY status = 'pending' DESC, id DESC LIMIT 200`, role, role, q, q).map(toUser);
});

route('POST', '/api/admin/users/:id', ({ user, params, body }) => {
  need(user, 'admin');
  const target = one('SELECT * FROM users WHERE id = ?', Number(params[0])) ?? fail(404, 'not_found');
  if (target.id === user.id) fail(409, 'cannot_change_self');
  const status = ['active', 'blocked'].includes(body.status) ? body.status : fail(400, 'invalid_status');
  run('UPDATE users SET status = ? WHERE id = ?', status, target.id);
  if (status === 'blocked') run('DELETE FROM sessions WHERE user_id = ?', target.id);
  return toUser(one('SELECT * FROM users WHERE id = ?', target.id)!);
});

// No SMS provider yet: support verifies the caller, resets, and reads the temporary password out to them.
route('POST', '/api/admin/users/:id/password', ({ user, params }) => {
  need(user, 'admin');
  const target = one("SELECT * FROM users WHERE id = ? AND role != 'admin' AND phone NOT LIKE 'deleted-%'", Number(params[0])) ?? fail(404, 'not_found');
  const password = String(randomInt(10_000_000, 100_000_000));
  run('UPDATE users SET password = ? WHERE id = ?', hashPassword(password), target.id);
  run('DELETE FROM sessions WHERE user_id = ?', target.id);
  return { password };
});

route('GET', '/api/admin/subscriptions', ({ user }) => {
  need(user, 'admin');
  return all(`SELECT s.*, u.name user_name, u.phone user_phone FROM subscriptions s JOIN users u ON u.id = s.user_id
    ORDER BY s.status = 'pending' DESC, s.id DESC LIMIT 200`).map(toSubscription);
});

route('POST', '/api/admin/subscriptions/:id', ({ user, params, body }) => {
  need(user, 'admin');
  const sub = one("SELECT * FROM subscriptions WHERE id = ? AND status = 'pending'", Number(params[0])) ?? fail(404, 'not_found');
  if (body.action === 'activate') run("UPDATE subscriptions SET status = 'active', activated_at = ?, ends_at = ? WHERE id = ?", Date.now(), Date.now() + 30 * DAY, sub.id);
  else if (body.action === 'reject') run("UPDATE subscriptions SET status = 'rejected' WHERE id = ?", sub.id);
  else fail(400, 'invalid_action');
  return { ok: true };
});

route('POST', '/api/admin/settings', ({ user, body }) => {
  need(user, 'admin');
  for (const [key, value] of Object.entries(body)) {
    const n = Number(value);
    if (!(key in defaultSettings) || !Number.isFinite(n) || n < 0 || (fractionSettings.includes(key as keyof Settings) && n >= 1)) fail(400, 'invalid_setting');
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, n);
  }
  return settings();
});

// ---------- http ----------

async function readBody(req: IncomingMessage): Promise<Row> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) fail(413, 'too_large');
  }
  if (!raw) return {};
  try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed : fail(400, 'invalid_json'); }
  catch { return fail(400, 'invalid_json'); }
}

function authenticate(req: IncomingMessage): User | null {
  const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return null;
  const r = one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.created_at > ?',
    sha(token), Date.now() - SESSION_DAYS * DAY);
  return r && r.status !== 'blocked' ? toUser(r) : null;
}

export const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // bearer tokens, no cookies: open CORS is safe
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/privacy') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(privacyPage); return; }
  let status = 200, payload: unknown;
  try {
    const match = routes.map(([method, pattern, handler, isPublic]) => ({ method, m: pattern.exec(url.pathname), handler, isPublic }))
      .find(r => r.method === req.method && r.m) ?? fail(404, 'not_found');
    const user = authenticate(req);
    if (!match.isPublic && !user) fail(401, 'unauthorized');
    const body = req.method === 'POST' ? await readBody(req) : {};
    payload = match.handler({ user: user!, body, params: match.m!.slice(1), query: url.searchParams });
  } catch (error) {
    status = error instanceof HttpError ? error.status : 500;
    payload = { error: error instanceof HttpError ? error.message : 'server_error' };
    if (status === 500) console.error(error);
  }
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
});

// Phones aren't verified by SMS, so admin rights are granted from the server shell, never over the API.
export function promote(input: string) {
  const phone = normalizePhone(input) ?? fail(400, 'invalid_phone');
  if (!run("UPDATE users SET role = 'admin', status = 'active', vehicle = NULL WHERE phone = ?", phone).changes)
    fail(404, 'register this number in the app first');
  return phone;
}

if (import.meta.main) {
  if (process.argv[2] === 'promote') {
    try { console.log(`${promote(process.argv[3] ?? '')} is now an admin`); }
    catch (error) { console.error((error as Error).message); process.exitCode = 1; }
  } else {
    run('DELETE FROM sessions WHERE created_at < ?', Date.now() - SESSION_DAYS * DAY);
    const port = Number(process.env.PORT ?? 4000);
    server.listen(port, () => console.log(`Wind API on :${port}`));
  }
}
