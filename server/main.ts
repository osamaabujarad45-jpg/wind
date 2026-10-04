/// <reference types="node" />
// Wind API: zero-dependency Node 24 server (node:http + node:sqlite).
// Run: node server/main.ts · Make an admin: node server/main.ts promote 0599XXXXXX
import { createServer, type IncomingMessage } from 'node:http';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { accessSync, constants, createReadStream, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { createBrotliCompress } from 'node:zlib';
import {
  activeStatuses, cities, commissionOn, exceptionReasons, finishedStatuses, defaultSettings, fractionSettings, isCity, nextStatus, normalizeEmail, normalizePhone,
  optionsFor, orderCode, planForRole, quote, services, vehicleServices, vehicles,
  type Order, type Plan, type Role, type Service, type Settings, type Subscription, type User, type Vehicle,
} from '../src/model.ts';
import { b64url, encrypt, pushEndpoint, vapid } from './push.ts';

const DAY = 86_400_000;
const RELEASE_BEFORE = 30 * 60_000; // scheduled orders reach drivers this long before pickup
const SESSION_DAYS = 90;
const production = process.env.NODE_ENV === 'production';
const selfService = process.env.WIND_IDENTITY_MODE === 'self-service';
const contactVerificationRequired = selfService && process.env.WIND_CONTACT_VERIFICATION_REQUIRED === 'true';
const contactAllowed = (r: Row) => !contactVerificationRequired || r.role === 'admin' || r.phone_verified_at || r.approved_at;
const registrationOpen = selfService || (!production && process.env.WIND_IDENTITY_MODE !== 'operator-verified');
if (production) {
  if (!process.env.DB_PATH || !isAbsolute(process.env.DB_PATH)) throw new Error('Production requires an absolute DB_PATH on a persistent local volume');
  if (!process.env.SUPPORT_CONTACT?.trim()) throw new Error('Production requires a real SUPPORT_CONTACT');
  if (!['operator-verified', 'self-service'].includes(process.env.WIND_IDENTITY_MODE ?? '')) throw new Error('Production requires WIND_IDENTITY_MODE=operator-verified or self-service');
  if (process.platform !== 'win32') process.umask(0o077);
}
const enabledServices = services.filter(service => (process.env.WIND_ENABLED_SERVICES ?? 'parcel').split(',').map(s => s.trim()).includes(service));
const supportContact = (process.env.SUPPORT_CONTACT ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const publicPages = new Map(['/privacy', '/terms', '/account-deletion'].map(path => [path,
  readFileSync(new URL(`${path.slice(1)}.html`, import.meta.url), 'utf8').replaceAll('{{contact}}', supportContact)]));
const webRoot = process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : null;
const webContentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// The same HTTPS origin hosts the optional iPhone web app. API paths and legal pages stay authoritative here;
// every other extension-free path falls back to Expo Router's single-page entry point.
function serveWeb(pathname: string, req: IncomingMessage, res: import('node:http').ServerResponse) {
  if (!webRoot || pathname.startsWith('/api/')) return false;
  let requested: string;
  try { requested = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); }
  catch { return false; }
  if (requested.includes('\0')) return false;
  const candidate = resolve(webRoot, `.${requested}`);
  const outside = relative(webRoot, candidate);
  if (outside.startsWith('..') || isAbsolute(outside)) return false;
  const file = (() => {
    try { return statSync(candidate).isFile() ? candidate : undefined; } catch { return undefined; }
  })() ?? (!extname(requested) ? (() => {
    const entry = resolve(webRoot, 'index.html');
    try { return statSync(entry).isFile() ? entry : undefined; } catch { return undefined; }
  })() : undefined);
  if (!file) return false;
  const extension = extname(file).toLowerCase();
  const contentType = webContentTypes[extension] ?? 'application/octet-stream';
  const useBrotli = /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg\+xml)/.test(contentType)
    && /(?:^|,)\s*br(?:;|,|$)/.test(String(req.headers['accept-encoding'] ?? ''));
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': extension === '.html' || extension === '.webmanifest' || file === resolve(webRoot, 'sw.js') ? 'no-cache' : 'public, max-age=604800, immutable',
    ...(useBrotli ? { 'Content-Encoding': 'br', Vary: 'Accept-Encoding' } : {}),
  });
  const stream = createReadStream(file).on('error', () => res.destroy());
  (useBrotli ? stream.pipe(createBrotliCompress()) : stream).pipe(res);
  return true;
}

export const db = new DatabaseSync(process.env.DB_PATH ?? 'wind.db');
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
if (Number(db.prepare('PRAGMA user_version').get()!.user_version) > 3) throw new Error('Database schema is newer than this API');
if (db.prepare('PRAGMA quick_check').get()!.quick_check !== 'ok') throw new Error('Database integrity check failed');
db.exec('BEGIN IMMEDIATE');
try { db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','driver','admin')),
  status TEXT NOT NULL CHECK (status IN ('active','pending','blocked')),
  vehicle TEXT CHECK (vehicle IN ('motorcycle','bicycle','car','van','truck')), created_at INTEGER NOT NULL);
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
CREATE TABLE IF NOT EXISTS partner_orders (
  external_ref TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id));
CREATE TABLE IF NOT EXISTS order_commands (
  user_id INTEGER NOT NULL REFERENCES users(id), request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id), PRIMARY KEY(user_id, request_id));
CREATE TABLE IF NOT EXISTS order_actions (
  user_id INTEGER NOT NULL REFERENCES users(id), request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id), http_status INTEGER NOT NULL, error TEXT,
  PRIMARY KEY(user_id, request_id));
CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS proof_attempts (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id), failures INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER NOT NULL REFERENCES orders(id),
  action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS order_disputes (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), customer_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')), resolution TEXT,
  resolved_by INTEGER REFERENCES users(id), created_at INTEGER NOT NULL, resolved_at INTEGER);
CREATE TABLE IF NOT EXISTS cash_entries (
  id INTEGER PRIMARY KEY, driver_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('remittance','adjustment')), amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK (status IN ('pending','confirmed','disputed')),
  recorded_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, decided_at INTEGER);
CREATE INDEX IF NOT EXISTS cash_entries_driver ON cash_entries(driver_id, id);
CREATE TABLE IF NOT EXISTS safety_incidents (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), reporter_id INTEGER NOT NULL REFERENCES users(id),
  reporter_role TEXT NOT NULL CHECK (reporter_role IN ('customer','driver')),
  kind TEXT NOT NULL CHECK (kind IN ('unsafe_driving','harassment','accident','threat','other')), note TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')), resolution TEXT,
  resolved_by INTEGER REFERENCES users(id), created_at INTEGER NOT NULL, resolved_at INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS safety_incidents_open ON safety_incidents(order_id, reporter_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS safety_incidents_order ON safety_incidents(order_id, status);
CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 100),
  max_uses INTEGER NOT NULL, expires_at INTEGER NOT NULL, first_order_only INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS promo_redemptions (
  promo_id INTEGER NOT NULL REFERENCES promo_codes(id), customer_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS promo_redemptions_promo ON promo_redemptions(promo_id, customer_id);
CREATE TABLE IF NOT EXISTS push_keys (id INTEGER PRIMARY KEY CHECK (id = 1), private_jwk TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'ar', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id, created_at);
CREATE TABLE IF NOT EXISTS promo_owners (promo_id INTEGER PRIMARY KEY REFERENCES promo_codes(id), user_id INTEGER NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS referral_codes (user_id INTEGER PRIMARY KEY REFERENCES users(id), code TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS referrals (
  referee_id INTEGER PRIMARY KEY REFERENCES users(id), referrer_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER NOT NULL REFERENCES orders(id), reward_promo_id INTEGER REFERENCES promo_codes(id), created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_order ON referrals(order_id);
CREATE TABLE IF NOT EXISTS order_messages (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), sender_id INTEGER NOT NULL REFERENCES users(id),
  driver_id INTEGER NOT NULL REFERENCES users(id), -- the assignment this thread belongs to
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer','driver')), body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS order_messages_order ON order_messages(order_id, id);
CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, cities TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS checkpoint_reports (
  id INTEGER PRIMARY KEY, checkpoint_id INTEGER NOT NULL REFERENCES checkpoints(id), reporter_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('open','slow','closed')), note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS checkpoint_reports_recent ON checkpoint_reports(checkpoint_id, created_at);
CREATE TABLE IF NOT EXISTS saved_places (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), label TEXT NOT NULL CHECK (label IN ('home','work','other')),
  city TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id, city, note));
CREATE TRIGGER IF NOT EXISTS cash_entries_no_delete BEFORE DELETE ON cash_entries
  BEGIN SELECT RAISE(ABORT, 'cash ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS cash_entries_no_edit BEFORE UPDATE ON cash_entries
  WHEN OLD.status <> 'pending' OR NEW.amount_cents <> OLD.amount_cents OR NEW.driver_id <> OLD.driver_id OR NEW.kind <> OLD.kind
  BEGIN SELECT RAISE(ABORT, 'cash ledger is append-only'); END;
`);
// Additive columns only, without a user_version bump, so the previous build can still open this database.
for (const [column, type] of [['pickup_contact', 'TEXT'], ['return_code', 'TEXT'], ['exception_reason', 'TEXT'], ['share_token_hash', 'TEXT'], ['share_created_at', 'INTEGER'], ['scheduled_for', 'INTEGER'], ['discount', 'REAL']]) {
  if (!(db.prepare('PRAGMA table_info(orders)').all() as Row[]).some(r => r.name === column))
    db.exec(`ALTER TABLE orders ADD COLUMN ${column} ${type}`);
}
if (!(db.prepare('PRAGMA table_info(order_disputes)').all() as Row[]).some(r => r.name === 'credit_promo_id'))
  db.exec('ALTER TABLE order_disputes ADD COLUMN credit_promo_id INTEGER REFERENCES promo_codes(id)');
if (!(db.prepare('PRAGMA table_info(users)').all() as Row[]).some(r => r.name === 'phone_verified_at'))
  db.exec('ALTER TABLE users ADD COLUMN phone_verified_at INTEGER');
for (const [column, type] of [['email', 'TEXT'], ['email_verified_at', 'INTEGER'], ['approved_at', 'INTEGER'], ['consent_at', 'INTEGER'], ['consent_version', 'TEXT']]) {
  if (!(db.prepare('PRAGMA table_info(users)').all() as Row[]).some(r => r.name === column))
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS orders_share_token ON orders(share_token_hash) WHERE share_token_hash IS NOT NULL');
db.exec('PRAGMA user_version = 2; COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }

// SQLite cannot alter a CHECK constraint. Rebuild only the users table, preserving every id so child
// rows (sessions, orders, locations, subscriptions and audit events) remain valid.
function migrateVehicleChoices() {
  const sql = String((db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'users'").get() as { sql?: string } | undefined)?.sql ?? '');
  if (sql.includes("'motorcycle'") && sql.includes("'bicycle'")) return;
  const columns = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(column => column.name));
  const existing = (name: string) => columns.has(name) ? name : 'NULL';
  const vehicle = columns.has('vehicle') ? "CASE WHEN vehicle IN ('motorcycle','bicycle','car','van','truck') THEN vehicle ELSE NULL END" : 'NULL';
  // A legacy driver with no recognized vehicle must be reviewed again instead of falling back to a car.
  const status = `CASE WHEN role = 'driver' AND (${vehicle}) IS NULL THEN 'pending' ELSE status END`;
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
  try {
    db.exec(`
      DROP TABLE IF EXISTS users_vehicle_upgrade;
      CREATE TABLE users_vehicle_upgrade (
        id INTEGER PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('customer','driver','admin')),
        status TEXT NOT NULL CHECK (status IN ('active','pending','blocked')),
        vehicle TEXT CHECK (vehicle IN ('motorcycle','bicycle','car','van','truck')), created_at INTEGER NOT NULL,
        phone_verified_at INTEGER, email TEXT, email_verified_at INTEGER, approved_at INTEGER,
        consent_at INTEGER, consent_version TEXT);
      INSERT INTO users_vehicle_upgrade (id, phone, name, password, role, status, vehicle, created_at, phone_verified_at, email, email_verified_at, approved_at, consent_at, consent_version)
        SELECT id, phone, name, password, role, ${status}, ${vehicle}, created_at, ${existing('phone_verified_at')}, ${existing('email')}, ${existing('email_verified_at')}, ${existing('approved_at')}, ${existing('consent_at')}, ${existing('consent_version')}
        FROM users;
      DROP TABLE users;
      ALTER TABLE users_vehicle_upgrade RENAME TO users;
      COMMIT;
    `);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { db.exec('PRAGMA foreign_keys = ON;'); }
}
migrateVehicleChoices();
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL');
db.exec('BEGIN IMMEDIATE; PRAGMA user_version = 3; COMMIT');
if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database foreign-key check failed');

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

function newPassword(value: unknown, minimum = production || selfService ? 12 : 6) {
  const password = typeof value === 'string' ? value : '';
  if (password.length < minimum || password.length > 100) fail(400, 'weak_password');
  return password;
}

const sha = (token: string) => createHash('sha256').update(token).digest('hex');
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const payloadHash = (body: Row) => sha(JSON.stringify(canonical(body)));

function toUser(r: Row): User {
  const rating = r.role === 'driver' ? one('SELECT AVG(rating) avg FROM orders WHERE driver_id = ? AND rating IS NOT NULL', r.id)?.avg : null;
  return { id: r.id, phone: r.phone, name: r.name, role: r.role, status: r.status, vehicle: r.vehicle ?? null,
    rating: rating == null ? null : Math.round(rating * 10) / 10, createdAt: r.created_at,
    email: r.email ?? null, permanentlyApprovedAt: r.approved_at ?? null,
    phoneVerifiedAt: r.phone_verified_at ?? null, emailVerifiedAt: r.email_verified_at ?? null };
}

function activePlan(userId: number): Plan | null {
  return (one(`SELECT s.plan FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
    AND s.status = 'active' AND s.ends_at > ? AND s.plan = CASE u.role WHEN 'customer' THEN 'plus' WHEN 'driver' THEN 'pro' END`, userId, Date.now())?.plan as Plan) ?? null;
}

function latestSubscription(userId: number): Subscription | null {
  const r = one(`SELECT s.* FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
    AND (s.status = 'pending' OR (s.status = 'active' AND s.ends_at > ?))
    AND s.plan = CASE u.role WHEN 'customer' THEN 'plus' WHEN 'driver' THEN 'pro' END ORDER BY s.id DESC LIMIT 1`, userId, Date.now());
  return r ? toSubscription(r) : null;
}

function toSubscription(r: Row): Subscription {
  const expired = r.status === 'active' && r.ends_at <= Date.now();
  return { id: r.id, userId: r.user_id, plan: r.plan, status: expired ? 'expired' : r.status, price: r.price, endsAt: r.ends_at ?? null,
    createdAt: r.created_at, userName: r.user_name, userPhone: r.user_phone };
}

const inList = (statuses: string[]) => statuses.map(s => `'${s}'`).join(',');
const activeSql = inList(activeStatuses), finishedSql = inList(finishedStatuses);

const orderSelect = `SELECT o.*, c.name customer_name, d.name driver_name, d.phone driver_phone, d.vehicle driver_vehicle,
  l.lat loc_lat, l.lng loc_lng, l.updated_at loc_at, od.status dispute_status, od.reason dispute_reason, od.resolution dispute_resolution,
  (SELECT p.code FROM promo_codes p WHERE p.id = od.credit_promo_id) dispute_credit_code, (SELECT p.amount FROM promo_codes p WHERE p.id = od.credit_promo_id) dispute_credit_amount,
  (SELECT COUNT(*) FROM safety_incidents si WHERE si.order_id = o.id) safety_count,
  (SELECT COUNT(*) FROM safety_incidents si WHERE si.order_id = o.id AND si.status = 'open') safety_open
  FROM orders o JOIN users c ON c.id = o.customer_id LEFT JOIN users d ON d.id = o.driver_id
  LEFT JOIN driver_locations l ON l.driver_id = o.driver_id LEFT JOIN order_disputes od ON od.order_id = o.id`;

function toOrder(r: Row, viewer: User): Order {
  const owner = viewer.role === 'admin' || viewer.id === r.customer_id;
  const assigned = viewer.id === r.driver_id;
  const live = activeStatuses.includes(r.status) && r.loc_lat != null && Date.now() - r.loc_at <= 120_000;
  return {
    id: r.id, customerId: r.customer_id, driverId: r.driver_id ?? null, service: r.service, shared: !!r.shared,
    pickupCity: r.pickup_city, dropoffCity: r.dropoff_city,
    pickupPoint: (owner || assigned) && r.pickup_lat != null ? { latitude: r.pickup_lat, longitude: r.pickup_lng } : null,
    pickupNote: owner || assigned ? r.pickup_note : '', dropoffNote: owner || assigned ? r.dropoff_note : '',
    detail: owner || assigned ? r.detail : '', option: r.option, loadingHelp: !!r.loading_help,
    contact: owner || assigned ? r.contact : null, // drivers see phones only after accepting
    pickupContact: owner || assigned ? r.pickup_contact ?? r.contact : null,
    price: r.price, commission: r.commission ?? null, status: r.status,
    handoverCode: owner ? r.handover_code ?? null : null, // the customer gives it to the driver at delivery
    rating: r.rating ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
    sharing: viewer.id === r.customer_id && !!r.share_token_hash, scheduledFor: r.scheduled_for ?? null, discount: r.discount ?? 0,
    returnCode: viewer.id === r.customer_id && r.status === 'returning' ? r.return_code ?? null : null, // the sender gives it back to the driver
    exceptionReason: owner || assigned ? r.exception_reason ?? null : null,
    // Both parties learn the order is paused; only the reporter sees their own report.
    safetyHold: (owner || assigned) && r.safety_open > 0,
    safetyReport: r.safety_count > 0 && viewer.role !== 'admin' && (owner || assigned)
      ? one('SELECT status, kind, resolution FROM safety_incidents WHERE order_id = ? AND reporter_id = ? ORDER BY id DESC LIMIT 1', r.id, viewer.id) as Order['safetyReport'] ?? null
      : null,
    dispute: owner && r.dispute_status ? { status: r.dispute_status, reason: r.dispute_reason, resolution: r.dispute_resolution ?? null,
      credit: r.dispute_credit_code ? { code: r.dispute_credit_code as string, amount: r.dispute_credit_amount as number } : null } : null,
    customerName: owner || assigned ? r.customer_name : '', driverName: r.driver_name ?? undefined,
    driverPhone: owner || assigned ? r.driver_phone ?? undefined : undefined, driverVehicle: r.driver_vehicle ?? null,
    driverLocation: live && (owner || assigned) ? { latitude: r.loc_lat, longitude: r.loc_lng, updatedAt: r.loc_at, ageSeconds: Math.max(0, Math.round((Date.now() - r.loc_at) / 1000)) } : null,
  };
}

function getOrder(id: number, viewer: User): Order {
  const r = one(`${orderSelect} WHERE o.id = ?`, id) ?? fail(404, 'not_found');
  const canSee = viewer.role === 'admin' || r.customer_id === viewer.id || r.driver_id === viewer.id ||
    (viewer.role === 'driver' && viewer.status === 'active' && r.status === 'searching' && vehicleServices[viewer.vehicle ?? 'car'].includes(r.service)
      && (r.scheduled_for == null || r.scheduled_for <= Date.now() + RELEASE_BEFORE));
  if (!canSee) fail(404, 'not_found');
  return toOrder(r, viewer);
}

const text = (v: unknown, max: number, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if ((required && !s) || s.length > max) fail(400, 'invalid_input');
  return s;
};
const need = (user: User, ...roles: Role[]) => { if (!roles.includes(user.role)) fail(403, 'forbidden'); };
const needActive = (user: User) => {
  if (user.status !== 'active') fail(403, user.status === 'pending' ? 'pending_approval' : 'blocked');
  if (production && selfService && user.role === 'driver' && !user.permanentlyApprovedAt) fail(403, 'pending_approval');
};

// Durable fixed windows; the reverse proxy also limits traffic before expensive password work.
function limit(key: string, maximum: number, windowMs: number, consume = true) {
  const now = Date.now();
  const row = consume ? one(`INSERT INTO request_limits (key, count, until) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN until > ? THEN count + 1 ELSE 1 END,
    until = CASE WHEN until > ? THEN until ELSE excluded.until END RETURNING count, until`, key, now + windowMs, now, now)
    : one('SELECT count, until FROM request_limits WHERE key = ? AND until > ?', key, now);
  if (row && row.count >= maximum + (consume ? 1 : 0)) fail(429, 'too_many_attempts');
}
const identityKey = (kind: string, value: string | number) => `${kind}:${sha(String(value))}`;

// ---------- routes ----------

type Ctx = { user: User | null; body: Row; params: string[]; query: URLSearchParams; req: IncomingMessage };
type Handler = (ctx: Ctx & { user: User }) => unknown;
const routes: [string, RegExp, Handler, boolean?][] = [];
const route = (method: string, path: string, handler: Handler, isPublic = false) =>
  routes.push([method, new RegExp(`^${path.replace(/:\w+/g, '(\\d+)')}$`), handler, isPublic]);

route('GET', '/api/health', () => ({ ok: true }), true);
route('GET', '/api/auth/options', () => ({ registrationOpen }), true);
route('GET', '/api/ready', () => {
  try {
    accessSync(dirname(process.env.DB_PATH ?? 'wind.db'), constants.W_OK);
    accessSync(process.env.DB_PATH ?? 'wind.db', constants.W_OK);
    one('SELECT COUNT(*) n FROM sqlite_schema');
    db.exec('PRAGMA busy_timeout = 50; BEGIN IMMEDIATE; ROLLBACK;');
  } catch { fail(503, 'unavailable'); }
  finally { db.exec('PRAGMA busy_timeout = 5000'); }
  return { ok: true, schema: 3 };
}, true);

route('POST', '/api/auth/register', ({ body }) => {
  if (!registrationOpen) fail(403, 'registration_closed');
  if (contactVerificationRequired) fail(403, 'verification_required'); // attach actual proof before opening this future gate
  const phone = normalizePhone(String(body.phone ?? '')) ?? fail(400, 'invalid_phone');
  const name = text(body.name, 60);
  const password = newPassword(body.password);
  const email = selfService ? normalizeEmail(body.email) ?? fail(400, 'invalid_email') : null;
  if (selfService && body.consent !== true) fail(400, 'consent_required');
  const requestedRole = body.registrationRole ?? body.role;
  if (selfService && requestedRole !== undefined && !['customer', 'driver'].includes(requestedRole)) fail(400, 'invalid_role');
  const role: Role = requestedRole === 'driver' ? 'driver' : 'customer'; // admins only through operator enrollment
  const vehicle = role === 'driver' ? (vehicles.includes(body.vehicle ?? 'car') ? (body.vehicle ?? 'car') as Vehicle : fail(400, 'invalid_vehicle')) : null;
  if (one('SELECT id FROM users WHERE phone = ?', phone)) fail(409, 'phone_taken');
  if (email && one('SELECT id FROM users WHERE email = ? COLLATE NOCASE', email)) fail(409, 'email_taken');
  const id = Number(run('INSERT INTO users (phone, name, password, role, status, vehicle, created_at, email, consent_at, consent_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    phone, name, hashPassword(password), role, role === 'driver' ? 'pending' : 'active', vehicle, Date.now(), email,
    selfService ? Date.now() : null, selfService ? '2026-10-03' : null).lastInsertRowid);
  return startSession(id);
}, true);

route('POST', '/api/auth/login', ({ body }) => {
  const identifier = String(body.identifier ?? body.phone ?? '').trim();
  const phone = normalizePhone(identifier), email = normalizeEmail(identifier);
  const key = identityKey('login', phone ?? email ?? identifier.toLowerCase());
  limit(key, 5, 10 * 60_000, false);
  const r = phone ? one('SELECT * FROM users WHERE phone = ?', phone)
    : email ? one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email) : undefined;
  if (!r || !checkPassword(String(body.password ?? ''), r.password)) {
    limit(key, 5, 10 * 60_000);
    fail(401, 'wrong_credentials');
  }
  run('DELETE FROM request_limits WHERE key = ?', key);
  if (r!.status === 'blocked') fail(403, 'blocked');
  if (!contactAllowed(r!)) fail(403, 'verification_required');
  if (production && !selfService && !r!.phone_verified_at) fail(403, 'phone_not_verified');
  if (production && selfService && r!.role === 'admin' && !r!.phone_verified_at && !r!.approved_at) fail(403, 'pending_approval');
  return startSession(r!.id);
}, true);

function startSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)', sha(token), userId, Date.now());
  return { token, ...me(toUser(one('SELECT * FROM users WHERE id = ?', userId)!)) };
}

function me(user: User) {
  return { user, subscription: latestSubscription(user.id), plan: activePlan(user.id), settings: settings(), capabilities: { enabledServices, pooling: false } };
}

route('POST', '/api/auth/logout', ({ user }) => {
  run('DELETE FROM sessions WHERE user_id = ?', user.id);
  run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id); // every session ended, so every browser stops alerting
  return { ok: true };
});
route('GET', '/api/me', ({ user }) => me(user));

route('POST', '/api/me', ({ user, body }) => {
  run('UPDATE users SET name = ? WHERE id = ?', text(body.name, 60), user.id);
  return me(toUser(one('SELECT * FROM users WHERE id = ?', user.id)!));
});

route('POST', '/api/me/password', ({ user, body, req }) => {
  const key = identityKey('password', user.id);
  limit(key, 5, 10 * 60_000, false);
  const stored = one('SELECT password FROM users WHERE id = ?', user.id)!.password;
  if (!checkPassword(String(body.current ?? ''), stored)) { limit(key, 5, 10 * 60_000); fail(401, 'wrong_password'); }
  const password = hashPassword(newPassword(body.password));
  const currentToken = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')![1];
  db.exec('BEGIN IMMEDIATE');
  try {
    run('UPDATE users SET password = ? WHERE id = ?', password, user.id);
    run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, sha(currentToken));
    run('DELETE FROM request_limits WHERE key = ?', key);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { ok: true };
});

// Store rules require in-app account deletion. Orders stay for accounting, stripped of personal data.
function deleteAccount(user: User) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (one('SELECT role FROM users WHERE id = ?', user.id)?.role === 'admin') fail(409, 'cannot_change_self');
    cashSettled(user.id);
    if (one(`SELECT id FROM orders WHERE (customer_id = ? OR driver_id = ?) AND status IN ('searching',${activeSql})`, user.id, user.id))
      fail(409, 'active_orders');
    run(`UPDATE users SET name = '—', phone = ?, email = NULL, phone_verified_at = NULL, email_verified_at = NULL,
      approved_at = NULL, consent_at = NULL, consent_version = NULL, password = '', status = 'blocked', vehicle = NULL WHERE id = ?`, `deleted-${user.id}`, user.id);
    run(`UPDATE orders SET contact = '', pickup_contact = '', handover_code = NULL, pickup_note = '', dropoff_note = '', detail = '', pickup_lat = NULL, pickup_lng = NULL, share_token_hash = NULL
      WHERE customer_id = ?`, user.id);
    run('DELETE FROM driver_locations WHERE driver_id = ?', user.id);
    run('DELETE FROM saved_places WHERE user_id = ?', user.id);
    run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id);
    run('UPDATE referral_codes SET active = 0 WHERE user_id = ?', user.id); // the code stops working and is never reissued
    run("UPDATE checkpoint_reports SET note = '' WHERE reporter_id = ?", user.id);
    run("UPDATE order_messages SET body = '—' WHERE sender_id = ?", user.id);
    run("DELETE FROM subscriptions WHERE user_id = ? AND status = 'pending'", user.id);
    run('DELETE FROM sessions WHERE user_id = ?', user.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { ok: true };
}
route('POST', '/api/me/delete', ({ user }) => deleteAccount(user));

// Saved and recent places (SPEC-saved-places.md): landmarks are the address here, so a repeat booking reuses them.
const MAX_PLACES = 10;
function places(user: User) {
  const saved = all("SELECT id, label, city, note FROM saved_places WHERE user_id = ? ORDER BY CASE label WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END, id", user.id);
  const seen = new Set(saved.map(p => `${p.city}
${p.note}`));
  const recent: { city: string; note: string }[] = [];
  for (const o of all('SELECT pickup_city, pickup_note, dropoff_city, dropoff_note FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 30', user.id))
    for (const [city, note] of [[o.pickup_city, o.pickup_note], [o.dropoff_city, o.dropoff_note]]) {
      const key = `${city}
${note}`;
      if (note && !seen.has(key) && recent.length < 5) { seen.add(key); recent.push({ city, note }); }
    }
  return { saved, recent };
}
route('GET', '/api/me/places', ({ user }) => { need(user, 'customer'); return places(user); });
route('POST', '/api/me/places', ({ user, body }) => {
  need(user, 'customer');
  if (!['home', 'work', 'other'].includes(body.label) || !isCity(body.city)) fail(400, 'invalid_input');
  const note = text(body.note, 200);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = one('SELECT id FROM saved_places WHERE user_id = ? AND city = ? AND note = ?', user.id, body.city, note);
    if (body.label !== 'other') run('DELETE FROM saved_places WHERE user_id = ? AND label = ? AND id IS NOT ?', user.id, body.label, existing?.id ?? null); // one Home, one Work
    if (existing) run('UPDATE saved_places SET label = ? WHERE id = ?', body.label, existing.id);
    else {
      if (one('SELECT COUNT(*) n FROM saved_places WHERE user_id = ?', user.id)!.n >= MAX_PLACES) fail(409, 'places_full');
      run('INSERT INTO saved_places (user_id, label, city, note, created_at) VALUES (?, ?, ?, ?, ?)', user.id, body.label, body.city, note, Date.now());
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return places(user);
});
route('DELETE', '/api/me/places/:id', ({ user, params }) => {
  need(user, 'customer');
  if (!run('DELETE FROM saved_places WHERE id = ? AND user_id = ?', Number(params[0]), user.id).changes) fail(404, 'not_found');
  return places(user);
});

// Promo codes (SPEC-promo-codes.md): fixed shekel discounts the customer does not pay in cash; Wind funds them
// through the driver's cash ledger. A cancelled order frees its use.
const promoUses = `SELECT COUNT(*) n FROM promo_redemptions pr JOIN orders o ON o.id = pr.order_id WHERE o.status <> 'cancelled' AND pr.promo_id = ?`;
function promoFor(user: User, input: unknown, price: number) {
  const code = String(input ?? '').trim().toUpperCase();
  const valid = /^[A-Z0-9]{4,16}$/.test(code);
  const p = valid ? one('SELECT * FROM promo_codes WHERE code = ? AND active = 1 AND expires_at > ?', code, Date.now()) : undefined;
  if (!p) {
    // A friend's invite code (SPEC-referral.md): first order only, never your own.
    const ref = (valid ? one("SELECT r.user_id FROM referral_codes r JOIN users u ON u.id = r.user_id WHERE r.code = ? AND r.active = 1 AND u.status = 'active'", code) : undefined)
      ?? fail(400, 'invalid_promo');
    if (ref.user_id === user.id) fail(400, 'invalid_promo');
    if (one("SELECT id FROM orders WHERE customer_id = ? AND status <> 'cancelled'", user.id)) fail(409, 'invite_first_order_only');
    if (price < 2) fail(409, 'promo_not_applicable');
    return { id: null, referrerId: ref.user_id as number, code, discount: Math.min(REFERRAL_REWARD, price - 1) };
  }
  if ((one('SELECT user_id FROM promo_owners WHERE promo_id = ?', p.id)?.user_id ?? user.id) !== user.id) fail(400, 'invalid_promo'); // someone's reward
  if (one(`${promoUses} AND pr.customer_id = ?`, p.id, user.id)!.n > 0 || one(promoUses, p.id)!.n >= p.max_uses
    || (p.first_order_only && one("SELECT id FROM orders WHERE customer_id = ? AND status <> 'cancelled'", user.id))) fail(409, 'promo_used');
  if (price < 2) fail(409, 'promo_not_applicable'); // the fare never drops below ₪1, so nothing would be discounted
  return { id: p.id as number, referrerId: null, code, discount: Math.min(p.amount, price - 1) };
}
route('POST', '/api/promos/check', ({ user, body }) => {
  need(user, 'customer');
  needActive(user);
  limit(identityKey('promo', user.id), 20, 60 * 60_000); // codes are short words; no guessing at scale
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 1) fail(400, 'invalid_input');
  const { code, discount } = promoFor(user, body.code, price);
  return { code, discount };
});
// Personal codes: invite codes (W…) and inviter rewards (R…) share the promo namespace.
const REFERRAL_REWARD = 10;
// ponytail: flat cap against farming with throwaway accounts; per-phone verification is the real fix once SMS exists.
const REFERRAL_REWARDS_PER_30_DAYS = 5;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codeTaken = (code: string) => !!(one('SELECT id FROM promo_codes WHERE code = ?', code) ?? one('SELECT user_id FROM referral_codes WHERE code = ?', code));
function freshCode(prefix: string, length: number) {
  for (;;) {
    const code = prefix + Array.from({ length }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    if (!codeTaken(code)) return code;
  }
}
/** A one-use code only `ownerId` can apply, valid 90 days: invite rewards (R…) and goodwill credits (C…). */
function ownedCode(prefix: string, ownerId: number, amount: number, createdBy: number, now: number) {
  const promoId = Number(run('INSERT INTO promo_codes (code, amount, max_uses, expires_at, first_order_only, created_by, created_at) VALUES (?, ?, 1, ?, 0, ?, ?)',
    freshCode(prefix, 7), amount, now + 90 * DAY, createdBy, now).lastInsertRowid);
  run('INSERT INTO promo_owners (promo_id, user_id) VALUES (?, ?)', promoId, ownerId);
  return promoId;
}
/** The inviter's reward, once, when the friend's first order is delivered. */
export function rewardReferral(orderId: number, now: number) {
  const ref = one("SELECT r.referee_id, r.referrer_id FROM referrals r JOIN users u ON u.id = r.referrer_id WHERE r.order_id = ? AND r.reward_promo_id IS NULL AND u.status = 'active'", orderId);
  if (!ref || one('SELECT COUNT(*) n FROM referrals r JOIN promo_codes p ON p.id = r.reward_promo_id WHERE r.referrer_id = ? AND p.created_at > ?',
    ref.referrer_id, now - 30 * DAY)!.n >= REFERRAL_REWARDS_PER_30_DAYS) return;
  const promoId = ownedCode('R', ref.referrer_id, REFERRAL_REWARD, ref.referrer_id, now);
  run('UPDATE referrals SET reward_promo_id = ? WHERE referee_id = ?', promoId, ref.referee_id);
}
route('GET', '/api/me/referral', ({ user }) => {
  need(user, 'customer');
  if (!one('SELECT code FROM referral_codes WHERE user_id = ?', user.id)) run('INSERT INTO referral_codes (user_id, code) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING', user.id, freshCode('W', 5));
  return {
    code: one('SELECT code FROM referral_codes WHERE user_id = ?', user.id)!.code, reward: REFERRAL_REWARD,
    joined: one("SELECT COUNT(*) n FROM referrals r JOIN orders o ON o.id = r.order_id WHERE r.referrer_id = ? AND o.status <> 'cancelled'", user.id)!.n,
    earned: one('SELECT COUNT(*) n FROM referrals WHERE referrer_id = ? AND reward_promo_id IS NOT NULL', user.id)!.n,
    credits: all(`SELECT p.code, p.amount, p.expires_at AS expiresAt FROM promo_owners w JOIN promo_codes p ON p.id = w.promo_id
      WHERE w.user_id = ? AND p.active = 1 AND p.expires_at > ? AND NOT EXISTS(SELECT 1 FROM promo_redemptions pr JOIN orders o ON o.id = pr.order_id
        WHERE pr.promo_id = p.id AND o.status <> 'cancelled') ORDER BY p.expires_at`, user.id, Date.now()),
  };
});
const adminPromos = 'SELECT * FROM promo_codes WHERE id NOT IN (SELECT promo_id FROM promo_owners) ORDER BY active DESC, id DESC LIMIT 100';
const promoRow = (p: Row) => ({ id: p.id, code: p.code, amount: p.amount, maxUses: p.max_uses, uses: one(promoUses, p.id)!.n,
  expiresAt: p.expires_at, firstOrderOnly: !!p.first_order_only, active: !!p.active,
  live: !!p.active && p.expires_at > Date.now() });
route('GET', '/api/admin/promos', ({ user }) => { need(user, 'admin'); return all(adminPromos).map(promoRow); });
route('POST', '/api/admin/promos', ({ user, body }) => {
  need(user, 'admin');
  const code = String(body.code ?? '').trim().toUpperCase();
  const whole = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (!/^[A-Z0-9]{4,16}$/.test(code) || !whole(body.amount, 1, 100) || !whole(body.maxUses, 1, 10_000) || !whole(body.days, 1, 90)) fail(400, 'invalid_input');
  if (codeTaken(code)) fail(409, 'promo_exists');
  run('INSERT INTO promo_codes (code, amount, max_uses, expires_at, first_order_only, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    code, body.amount, body.maxUses, Date.now() + body.days * DAY, body.firstOrderOnly ? 1 : 0, user.id, Date.now());
  return all(adminPromos).map(promoRow);
});
route('POST', '/api/admin/promos/:id/deactivate', ({ user, params }) => {
  need(user, 'admin');
  if (!run('UPDATE promo_codes SET active = 0 WHERE id = ? AND active = 1', Number(params[0])).changes) fail(404, 'not_found');
  return all(adminPromos).map(promoRow);
});

// Web Push (SPEC-web-push.md): opt-in per browser, no provider account. The payload carries a kind and an order id,
// never names or addresses; the service worker words it in the subscriber's language.
type PushKind = 'assigned' | 'at_pickup' | 'in_transit' | 'completed' | 'returned' | 'message' | 'job';
// ponytail: a fixed subject; set WIND_PUSH_SUBJECT to the operator's mailto: or site when it changes.
const PUSH_SUBJECT = process.env.WIND_PUSH_SUBJECT ?? 'https://wind-production-72aa.up.railway.app';
let pushKeyCache: { privateKey: ReturnType<typeof createPrivateKey>; publicRaw: Buffer } | undefined;
function pushKeys() {
  if (pushKeyCache) return pushKeyCache;
  if (!one('SELECT id FROM push_keys WHERE id = 1')) run('INSERT OR IGNORE INTO push_keys (id, private_jwk) VALUES (1, ?)',
    JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' })));
  const jwk = JSON.parse(one('SELECT private_jwk FROM push_keys WHERE id = 1')!.private_jwk as string);
  pushKeyCache = { privateKey: createPrivateKey({ key: jwk, format: 'jwk' }),
    publicRaw: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]) };
  return pushKeyCache;
}
const outbox: { userIds: number[]; kind: PushKind; order: number }[] = [];
const queuePush = (userIds: (number | null)[], kind: PushKind, order: number) => {
  const ids = userIds.filter((id): id is number => id != null);
  if (ids.length) outbox.push({ userIds: ids, kind, order });
};
function flushPush() {
  for (const { userIds, kind, order } of outbox.splice(0)) {
    const url = kind === 'job' ? '/driver' : `/order/${order}`;
    for (const s of all(`SELECT * FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(',')})`, ...userIds))
      void deliver(s, JSON.stringify({ kind, order, url, lang: s.lang }), kind === 'job' || kind === 'message' ? 'high' : 'normal', kind === 'job' ? 300 : 3600);
  }
}
async function deliver(s: Row, message: string, urgency: string, ttl: number) {
  try {
    const { privateKey, publicRaw } = pushKeys();
    const res = await fetch(s.endpoint as string, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), body: encrypt(Buffer.from(message), Buffer.from(s.p256dh as string, 'base64url'), Buffer.from(s.auth as string, 'base64url')),
      headers: { TTL: String(ttl), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapid(s.endpoint as string, publicRaw, privateKey, PUSH_SUBJECT) } });
    await res.body?.cancel();
    if (res.status === 404 || res.status === 410) run('DELETE FROM push_subscriptions WHERE endpoint = ?', s.endpoint); // the browser dropped it
  } catch { /* best effort: the app still shows everything on next open */ }
}
/** A new job reaches free, approved drivers whose vehicle can take it (at most 100 per order). */
function newJobPush(service: Service, orderId: number, customerId: number) {
  // Booking is never refused for this, but one account cannot keep 100 drivers' phones ringing: 5 job alerts per 10 minutes.
  try { limit(identityKey('job-push', customerId), 5, 10 * 60_000); } catch { return; }
  const fits = vehicles.filter(v => vehicleServices[v].includes(service));
  const drivers = all(`SELECT u.id FROM users u WHERE u.role = 'driver' AND u.status = 'active' ${production && selfService ? 'AND u.approved_at IS NOT NULL' : ''}
    AND u.vehicle IN (${fits.map(() => '?').join(',')}) AND EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
    AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.driver_id = u.id AND o.status IN (${activeSql})) ORDER BY random() LIMIT 100`, ...fits); // ponytail: random fairness; nearest-first when driver positions are kept between jobs
  queuePush(drivers.map(d => d.id as number), 'job', orderId);
}
route('GET', '/api/push/key', () => ({ key: b64url(pushKeys().publicRaw) }), true);
route('POST', '/api/push/subscribe', ({ user, body }) => {
  const endpoint = pushEndpoint(body.endpoint) ?? fail(400, 'invalid_input');
  const key = Buffer.from(String(body.p256dh ?? ''), 'base64url'), auth = Buffer.from(String(body.auth ?? ''), 'base64url');
  if (key.length !== 65 || key[0] !== 4 || auth.length !== 16) fail(400, 'invalid_input');
  try { createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(key.subarray(1, 33)), y: b64url(key.subarray(33)) }, format: 'jwk' }); }
  catch { fail(400, 'invalid_input'); } // a point off the curve would fail on every send
  // A shared browser follows whoever signed in last (knowing the endpoint is the browser's own secret); five browsers per person.
  run(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, created_at = excluded.created_at`,
  endpoint, user.id, b64url(key), b64url(auth), body.lang === 'en' ? 'en' : 'ar', Date.now());
  run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5)', user.id, user.id);
  return { ok: true };
});
route('POST', '/api/push/unsubscribe', ({ user, body }) => {
  run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', String(body.endpoint ?? ''), user.id);
  return { ok: true };
});

// Customers
function createOrder(user: User, body: Row) {
  const service = services.includes(body.service) ? body.service as Service : fail(400, 'invalid_service');
  if (!enabledServices.includes(service)) fail(409, 'service_unavailable');
  if (body.shared !== false && body.shared != null) fail(409, 'pooling_unavailable');
  if (!isCity(body.pickupCity) || !isCity(body.dropoffCity)) fail(400, 'invalid_city');
  const option = optionsFor(service).includes(String(body.option)) ? String(body.option) : fail(400, 'invalid_option');
  const contact = normalizePhone(String(body.contact ?? '')) ?? fail(400, 'invalid_phone');
  const point = body.pickupPoint;
  const validPoint = point && typeof point.latitude === 'number' && typeof point.longitude === 'number' && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
  if (point != null && !validPoint) fail(400, 'invalid_location');
  const shared = !!body.shared, loadingHelp = service === 'freight' && !!body.loadingHelp;
  const price = quote(settings(), { service, pickupCity: body.pickupCity, dropoffCity: body.dropoffCity, option, loadingHelp, shared,
    plus: activePlan(user.id) === 'plus' });
  // The app shows a price before commitment; if tariffs or the plan changed since, make the customer re-confirm.
  if (body.quotedPrice != null && Number(body.quotedPrice) !== price) fail(409, 'price_changed');
  const now = Date.now();
  const promo = body.promoCode == null ? null : promoFor(user, body.promoCode, price);
  if (promo && Number(body.expectedDiscount) !== promo.discount) fail(409, 'promo_changed');
  const scheduledFor = body.scheduledFor ?? null;
  if (scheduledFor !== null && !(Number.isInteger(scheduledFor) && scheduledFor >= now + RELEASE_BEFORE && scheduledFor <= now + 7 * DAY)) fail(400, 'invalid_schedule');
  const id = Number(run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_lat, pickup_lng,
    pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, handover_code, created_at, updated_at, scheduled_for, discount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?)`,
    user.id, service, shared ? 1 : 0, body.pickupCity, body.dropoffCity,
    validPoint ? Number(point.latitude) : null, validPoint ? Number(point.longitude) : null,
    text(body.pickupNote, 200), text(body.dropoffNote, 200), contact,
    body.pickupContact == null ? contact : normalizePhone(String(body.pickupContact)) ?? fail(400, 'invalid_phone'),
    text(body.detail, 500, service !== 'ride'),
    option, loadingHelp ? 1 : 0, price, service === 'ride' ? null : String(randomInt(1000, 10000)), now, now, scheduledFor, promo?.discount ?? null).lastInsertRowid);
  if (promo?.id) run('INSERT INTO promo_redemptions (promo_id, customer_id, order_id, created_at) VALUES (?, ?, ?, ?)', promo.id, user.id, id, now);
  // Only reachable again after the earlier first order was cancelled (promoFor refuses otherwise).
  else if (promo) run(`INSERT INTO referrals (referee_id, referrer_id, order_id, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(referee_id) DO UPDATE SET referrer_id = excluded.referrer_id, order_id = excluded.order_id, created_at = excluded.created_at`, user.id, promo.referrerId, id, now);
  if (scheduledFor == null) newJobPush(service, id, user.id);
  return getOrder(id, user);
}

route('POST', '/api/orders', ({ user, body }) => {
  need(user, 'customer');
  needActive(user);
  if (body.promoCode != null) limit(identityKey('promo', user.id), 20, 60 * 60_000); // no unlimited code guessing through booking
  const { requestId, ...input } = body;
  if (requestId == null) {
    db.exec('BEGIN IMMEDIATE');
    try { const order = createOrder(user, input); db.exec('COMMIT'); return order; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) fail(400, 'invalid_request_id');
  const hash = payloadHash(input);
  const existing = one('SELECT * FROM order_commands WHERE user_id = ? AND request_id = ?', user.id, requestId);
  if (existing) {
    if (existing.payload_hash !== hash) fail(409, 'idempotency_conflict');
    return getOrder(existing.order_id, user);
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = createOrder(user, input);
    run('INSERT INTO order_commands (user_id, request_id, payload_hash, order_id) VALUES (?, ?, ?, ?)', user.id, requestId, hash, order.id);
    db.exec('COMMIT');
    return order;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
});

// A partner key stays on the two API servers; never ship it in a mobile bundle.
function partner(req: IncomingMessage) {
  const configured = process.env.SOUQ_PARTNER_KEY;
  if (!configured || configured.length < 32) fail(503, 'partner_unavailable');
  const supplied = req.headers['x-partner-key'];
  if (typeof supplied !== 'string' || !timingSafeEqual(Buffer.from(sha(supplied), 'hex'), Buffer.from(sha(configured!), 'hex')))
    fail(401, 'unauthorized');
}

function partnerUser(): User {
  const phone = 'partner:souq'; // cannot log in through phone authentication
  let row = one('SELECT * FROM users WHERE phone = ?', phone);
  if (!row) {
    const id = Number(run("INSERT INTO users (phone, name, password, role, status, vehicle, created_at) VALUES (?, 'سوقنا', ?, 'customer', 'active', NULL, ?)",
      phone, hashPassword(randomBytes(32).toString('hex')), Date.now()).lastInsertRowid);
    row = one('SELECT * FROM users WHERE id = ?', id);
  }
  return toUser(row!);
}

route('GET', '/api/partner/config', ({ req }) => {
  partner(req);
  return { currency: 'ILS', cities: cities.map(({ id, ar }) => ({ id, ar })), enabledServices, pooling: false };
}, true);

route('POST', '/api/partner/quotes', ({ req, body }) => {
  partner(req);
  if (!enabledServices.includes('parcel')) fail(409, 'service_unavailable');
  if (body.shared !== false && body.shared != null) fail(409, 'pooling_unavailable');
  if (!isCity(body.pickupCity) || !isCity(body.dropoffCity) || !['small', 'medium', 'large'].includes(String(body.option))) fail(400, 'invalid_input');
  return { currency: 'ILS', price: quote(settings(), { service: 'parcel', pickupCity: body.pickupCity, dropoffCity: body.dropoffCity,
    option: body.option, shared: body.shared === true }) };
}, true);

route('POST', '/api/partner/orders', ({ req, body }) => {
  partner(req);
  const ref = text(body.externalRef, 150);
  if (!Number.isSafeInteger(body.quotedPrice) || body.quotedPrice < 1) fail(400, 'invalid_input');
  const hash = payloadHash(body);
  const existing = one('SELECT * FROM partner_orders WHERE external_ref = ?', ref);
  if (existing) {
    if (existing.payload_hash !== hash) {
      if (existing.payload_hash !== sha(JSON.stringify(body))) fail(409, 'idempotency_conflict');
      run('UPDATE partner_orders SET payload_hash = ? WHERE external_ref = ?', hash, ref);
    }
    return getOrder(existing.order_id, partnerUser());
  }
  db.exec('BEGIN');
  try {
    const { promoCode: _code, expectedDiscount: _discount, ...input } = body; // Wind promos are for Wind customers only
    const order = createOrder(partnerUser(), { ...input, service: 'parcel' });
    run('INSERT INTO partner_orders (external_ref, payload_hash, order_id) VALUES (?, ?, ?)', ref, hash, order.id);
    db.exec('COMMIT');
    return order;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}, true);

function partnerOrder(req: IncomingMessage, id: number) {
  partner(req);
  if (!one('SELECT 1 FROM partner_orders WHERE order_id = ?', id)) fail(404, 'not_found');
  return getOrder(id, partnerUser());
}
route('GET', '/api/partner/orders/by-reference', ({ req, query }) => {
  partner(req);
  const ref = text(query.get('externalRef'), 150);
  const mapping = one('SELECT order_id FROM partner_orders WHERE external_ref = ?', ref) ?? fail(404, 'not_found');
  return getOrder(mapping.order_id, partnerUser());
}, true);
route('GET', '/api/partner/orders/:id', ({ req, params }) => partnerOrder(req, Number(params[0])), true);
route('POST', '/api/partner/orders/:id/cancel', ({ req, params }) => {
  const order = partnerOrder(req, Number(params[0]));
  if (order.status === 'cancelled') return order;
  if (!['searching', 'assigned'].includes(order.status)) fail(409, 'cannot_cancel');
  run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", Date.now(), order.id);
  return partnerOrder(req, order.id);
}, true);

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
  if (order.status === 'cancelled' && (user.role === 'admin' || user.id === order.customerId)) return order;
  const allowed = (user.role === 'admin' || user.id === order.customerId) && ['searching', 'assigned'].includes(order.status);
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

// Trip sharing: the customer hands a rotating link to a recipient who has no account. Only the token's hash is
// stored, and the public view is an explicit allowlist — no phones, notes, codes, price or customer identity.
const SHARE_GRACE = DAY; // a finished trip's final status stays readable for a day
route('POST', '/api/orders/:id/share', ({ user, params }) => {
  const r = one('SELECT id, status FROM orders WHERE id = ? AND customer_id = ?', Number(params[0]), user.id) ?? fail(404, 'not_found');
  if (!['searching', ...activeStatuses].includes(r.status)) fail(409, 'cannot_share');
  const token = randomBytes(32).toString('hex');
  run('UPDATE orders SET share_token_hash = ?, share_created_at = ? WHERE id = ?', sha(token), Date.now(), r.id);
  return { token, path: `/track/${token}` };
});
route('POST', '/api/orders/:id/share/revoke', ({ user, params }) => {
  if (!run('UPDATE orders SET share_token_hash = NULL, share_created_at = NULL WHERE id = ? AND customer_id = ?', Number(params[0]), user.id).changes)
    fail(404, 'not_found');
  return { ok: true };
});
route('GET', '/api/track/([a-f0-9]{64})', ({ params }) => {
  const r = one(`${orderSelect} WHERE o.share_token_hash = ?`, sha(params[0]!)) ?? fail(404, 'not_found');
  const open = r.status === 'searching' || activeStatuses.includes(r.status);
  if (!open && Date.now() - r.updated_at > SHARE_GRACE) fail(404, 'not_found');
  const fresh = activeStatuses.includes(r.status) && r.loc_lat != null && Date.now() - r.loc_at <= 120_000;
  return {
    orderCode: orderCode(r.id), status: r.status, service: r.service, pickupCity: r.pickup_city, dropoffCity: r.dropoff_city,
    updatedAt: r.updated_at,
    driver: r.driver_id && open ? { firstName: String(r.driver_name ?? '').trim().split(/\s+/)[0], vehicle: r.driver_vehicle ?? null } : null,
    driverLocation: fresh ? { latitude: r.loc_lat, longitude: r.loc_lng, updatedAt: r.loc_at } : null,
  };
}, true);

// One dispute per finished order, opened by its customer within a week. Resolution is a recorded
// decision only; refunds and cash corrections belong to cash settlement.
route('POST', '/api/orders/:id/dispute', ({ user, params, body }) => {
  const r = one('SELECT * FROM orders WHERE id = ? AND customer_id = ?', Number(params[0]), user.id) ?? fail(404, 'not_found');
  const reason = text(body.reason, 1000);
  if (reason.length < 10) fail(400, 'invalid_input');
  if (!finishedStatuses.includes(r.status) || Date.now() - (r.completed_at ?? r.updated_at) > 7 * DAY) fail(409, 'cannot_dispute');
  if (one('SELECT id FROM order_disputes WHERE order_id = ?', r.id)) fail(409, 'dispute_exists');
  run('INSERT INTO order_disputes (order_id, customer_id, reason, created_at) VALUES (?, ?, ?, ?)', r.id, user.id, reason, Date.now());
  return getOrder(r.id, user);
});

route('GET', '/api/admin/disputes', ({ user }) => {
  need(user, 'admin');
  return all(`SELECT od.id, od.order_id orderId, od.reason, od.status, od.resolution, od.created_at createdAt, od.resolved_at resolvedAt,
    o.status orderStatus, c.name customerName, (SELECT p.amount FROM promo_codes p WHERE p.id = od.credit_promo_id) creditAmount FROM order_disputes od JOIN orders o ON o.id = od.order_id JOIN users c ON c.id = od.customer_id
    ORDER BY od.status = 'open' DESC, od.id DESC LIMIT 200`);
});

route('POST', '/api/admin/disputes/:id/resolve', ({ user, params, body }) => {
  need(user, 'admin');
  const resolution = text(body.resolution, 1000);
  if (resolution.length < 5) fail(400, 'invalid_input');
  // Optional goodwill credit for the next order (SPEC-dispute-credit.md), funded like every promo.
  const credit = body.creditShekels == null ? null : Number.isInteger(body.creditShekels) && body.creditShekels >= 1 && body.creditShekels <= 50
    ? body.creditShekels as number : fail(400, 'invalid_input');
  const dispute = one('SELECT * FROM order_disputes WHERE id = ?', Number(params[0])) ?? fail(404, 'not_found');
  // A blocked or deleted customer could never redeem it; resolve without a credit instead.
  if (credit && one('SELECT status FROM users WHERE id = ?', dispute.customer_id)?.status !== 'active') fail(409, 'customer_inactive');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!run("UPDATE order_disputes SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
      resolution, user.id, Date.now(), dispute.id).changes) fail(409, 'cannot_resolve');
    if (credit) run('UPDATE order_disputes SET credit_promo_id = ? WHERE id = ?', ownedCode('C', dispute.customer_id, credit, user.id, Date.now()), dispute.id);
    run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'DISPUTE_RESOLVED', ?, ?)`,
      user.id, dispute.order_id, JSON.stringify({ resolution, credit }), Date.now());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { ok: true };
});

// Safety (SPEC-safety-sos.md): either party of a live trip can alert Wind's safety team. An open report
// freezes the driver's steps until an administrator resolves it; the reporter stays anonymous to the other party.
const safetyKinds = ['unsafe_driving', 'harassment', 'accident', 'threat', 'other'];
const safetyFree = (orderId: number) => {
  if (one("SELECT id FROM safety_incidents WHERE order_id = ? AND status = 'open'", orderId)) fail(409, 'safety_hold');
};
route('POST', '/api/orders/:id/sos', ({ user, params, body }) => {
  if (!safetyKinds.includes(body.kind)) fail(400, 'invalid_input');
  const note = text(body.note, 300, false);
  const r = one('SELECT o.id, o.status, o.customer_id, o.driver_id, l.lat, l.lng, l.updated_at loc_at FROM orders o LEFT JOIN driver_locations l ON l.driver_id = o.driver_id WHERE o.id = ?',
    Number(params[0])) ?? fail(404, 'not_found');
  const role = r.customer_id === user.id ? 'customer' : r.driver_id === user.id ? 'driver' : user.role === 'admin' ? null : fail(404, 'not_found');
  if (!role || !activeStatuses.includes(r.status)) fail(409, 'cannot_report');
  if (!one("SELECT id FROM safety_incidents WHERE order_id = ? AND reporter_id = ? AND status = 'open'", r.id, user.id)) {
    limit(identityKey('sos', user.id), 10, DAY); // each report pauses a trip and pages an administrator
    const fresh = r.lat != null && Date.now() - r.loc_at <= 10 * 60_000;
    const id = Number(run(`INSERT INTO safety_incidents (order_id, reporter_id, reporter_role, kind, note, lat, lng, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, r.id, user.id, role, body.kind, note, fresh ? r.lat : null, fresh ? r.lng : null, Date.now()).lastInsertRowid);
    run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'SAFETY_REPORTED', ?, ?)`,
      user.id, r.id, JSON.stringify({ incident: id, kind: body.kind }), Date.now());
  }
  return getOrder(r.id, user);
});

route('GET', '/api/admin/incidents', ({ user }) => {
  need(user, 'admin');
  return all(`SELECT si.id, si.order_id orderId, si.kind, si.note, si.status, si.resolution, si.reporter_role reporterRole,
    si.lat latitude, si.lng longitude, si.created_at createdAt, si.resolved_at resolvedAt, o.status orderStatus,
    rp.name reporterName, rp.phone reporterPhone, c.name customerName, c.phone customerPhone, o.contact orderContact, d.name driverName, d.phone driverPhone
    FROM safety_incidents si JOIN orders o ON o.id = si.order_id JOIN users rp ON rp.id = si.reporter_id
    JOIN users c ON c.id = o.customer_id LEFT JOIN users d ON d.id = o.driver_id
    ORDER BY si.status = 'open' DESC, si.id DESC LIMIT 200`);
});

route('POST', '/api/admin/incidents/:id/resolve', ({ user, params, body }) => {
  need(user, 'admin');
  const resolution = text(body.resolution, 1000);
  if (resolution.length < 5) fail(400, 'invalid_input');
  const incident = one('SELECT * FROM safety_incidents WHERE id = ?', Number(params[0])) ?? fail(404, 'not_found');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!run("UPDATE safety_incidents SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
      resolution, user.id, Date.now(), incident.id).changes) fail(409, 'cannot_resolve');
    run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'SAFETY_RESOLVED', ?, ?)`,
      user.id, incident.order_id, JSON.stringify({ incident: incident.id, resolution }), Date.now());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { ok: true };
});

// In-trip chat (SPEC-in-app-chat.md): the two parties write while the order is active and read for a day after;
// administrators read for support. Never part of the public tracking view.
function chatAccess(user: User, id: number) {
  const r = one('SELECT id, status, customer_id, driver_id, updated_at FROM orders WHERE id = ?', id) ?? fail(404, 'not_found');
  const role = r.customer_id === user.id ? 'customer' : r.driver_id === user.id ? 'driver' : user.role === 'admin' ? 'admin' : fail(404, 'not_found');
  return { r, role, active: activeStatuses.includes(r.status) };
}
// A released job's conversation stays with that assignment: the next driver starts a fresh thread.
const chat = (user: User, id: number, driverId: number | null) => (user.role === 'admin' && user.id !== driverId
  ? all('SELECT id, sender_id, sender_role, body, created_at FROM order_messages WHERE order_id = ? ORDER BY id DESC LIMIT 50', id)
  : all('SELECT id, sender_id, sender_role, body, created_at FROM order_messages WHERE order_id = ? AND driver_id IS ? ORDER BY id DESC LIMIT 50', id, driverId))
  .reverse().map(m => ({ id: m.id, mine: m.sender_id === user.id, role: m.sender_role, body: m.body, createdAt: m.created_at }));
route('GET', '/api/orders/:id/messages', ({ user, params }) => {
  const { r, role, active } = chatAccess(user, Number(params[0]));
  if (role !== 'admin' && !active && Date.now() - r.updated_at > DAY) fail(409, 'chat_closed');
  return chat(user, r.id, r.driver_id);
});
route('POST', '/api/orders/:id/messages', ({ user, params, body }) => {
  const { r, role, active } = chatAccess(user, Number(params[0]));
  if (role === 'admin') fail(403, 'forbidden');
  const message = text(body.body, 500);
  if (!active) fail(409, 'chat_closed');
  limit(identityKey('chat', user.id), 30, 10 * 60_000);
  run('INSERT INTO order_messages (order_id, sender_id, driver_id, sender_role, body, created_at) VALUES (?, ?, ?, ?, ?, ?)', r.id, user.id, r.driver_id, role, message, Date.now());
  queuePush([role === 'customer' ? r.driver_id : r.customer_id], 'message', r.id);
  return chat(user, r.id, r.driver_id);
});

// Road status (SPEC-road-status.md): admin-managed checkpoints, crowd reports from drivers, fresh for two hours.
const ROAD_FRESH = 2 * 3_600_000;
function roads() {
  const since = Date.now() - ROAD_FRESH;
  return all('SELECT id, name, cities FROM checkpoints WHERE active = 1 ORDER BY name, id').map(c => {
    // Blocked (and deleted) accounts stop counting; each person counts once however often they report.
    const recent = `FROM checkpoint_reports r JOIN users u ON u.id = r.reporter_id WHERE r.checkpoint_id = ? AND r.created_at > ? AND u.status <> 'blocked'`;
    const latest = one(`SELECT r.status, r.note, r.created_at ${recent} ORDER BY r.created_at DESC, r.id DESC LIMIT 1`, c.id, since);
    const agreeing = latest ? one(`SELECT COUNT(DISTINCT r.reporter_id) n ${recent} AND r.status = ?`, c.id, since, latest.status)!.n : 0;
    return { id: c.id, name: c.name, cities: JSON.parse(c.cities), status: latest?.status ?? null, note: latest?.note ?? '', reportedAt: latest?.created_at ?? null, agreeing };
  });
}
route('GET', '/api/roads', () => roads());
route('POST', '/api/roads/:id/report', ({ user, params, body }) => {
  if (user.role === 'customer') fail(403, 'forbidden');
  needActive(user);
  if (!['open', 'slow', 'closed'].includes(body.status)) fail(400, 'invalid_input');
  const note = text(body.note, 120, false);
  const id = Number(params[0]);
  if (!one('SELECT id FROM checkpoints WHERE id = ? AND active = 1', id)) fail(404, 'not_found');
  if (one('SELECT id FROM checkpoint_reports WHERE checkpoint_id = ? AND reporter_id = ? AND created_at > ?', id, user.id, Date.now() - 10 * 60_000)) fail(429, 'already_reported');
  limit(identityKey('road', user.id), 30, 60 * 60_000); // across all checkpoints
  run('INSERT INTO checkpoint_reports (checkpoint_id, reporter_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)', id, user.id, body.status, note, Date.now());
  return roads();
});
route('POST', '/api/admin/roads', ({ user, body }) => {
  need(user, 'admin');
  const name = text(body.name, 80);
  const list = Array.isArray(body.cities) ? [...new Set(body.cities)] : [];
  if (name.length < 3 || !list.length || list.length > 3 || !list.every(isCity)) fail(400, 'invalid_input');
  run('INSERT INTO checkpoints (name, cities, created_by, created_at) VALUES (?, ?, ?, ?)', name, JSON.stringify(list), user.id, Date.now());
  return roads();
});
route('POST', '/api/admin/roads/:id/remove', ({ user, params }) => {
  need(user, 'admin');
  if (!run('UPDATE checkpoints SET active = 0 WHERE id = ? AND active = 1', Number(params[0])).changes) fail(404, 'not_found');
  return roads();
});

// Drivers
route('GET', '/api/jobs', ({ user }) => {
  need(user, 'driver');
  needActive(user);
  const allowed = vehicleServices[user.vehicle ?? 'car'].filter(service => enabledServices.includes(service));
  if (!allowed.length) return [];
  // Scheduled orders wait until shortly before pickup, then queue by pickup time like any other.
  return all(`${orderSelect} WHERE o.status = 'searching' AND o.service IN (${allowed.map(() => '?').join(',')})
    AND (o.scheduled_for IS NULL OR o.scheduled_for <= ?) ORDER BY COALESCE(o.scheduled_for, o.created_at), o.id LIMIT 50`, ...allowed, Date.now() + RELEASE_BEFORE)
    .map(r => toOrder(r, user));
});

route('POST', '/api/jobs/:id/accept', ({ user, params }) => {
  need(user, 'driver');
  needActive(user);
  db.exec('BEGIN IMMEDIATE');
  try {
  const order = getOrder(Number(params[0]), user);
  if (!enabledServices.includes(order.service)) fail(409, 'service_unavailable');
  if (!vehicleServices[user.vehicle ?? 'car'].includes(order.service)) fail(409, 'wrong_vehicle');
  // ponytail: one active job until inspected aggregate load/route policy supports batching.
  if (one(`SELECT id FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, user.id)) fail(409, 'vehicle_busy');
  const rate = activePlan(user.id) === 'pro' ? settings().proCommission : settings().commission;
  const changed = run("UPDATE orders SET driver_id = ?, commission = ?, status = 'assigned', updated_at = ? WHERE id = ? AND status = 'searching'",
    user.id, commissionOn(order.price, rate), Date.now(), order.id).changes;
  if (!changed) fail(409, 'already_taken');
  run('DELETE FROM driver_locations WHERE driver_id = ?', user.id); // an older job's location is not this assignment's fix
  queuePush([order.customerId], 'assigned', order.id);
  const result = getOrder(order.id, user);
  db.exec('COMMIT');
  return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
});

route('POST', '/api/orders/:id/release', ({ user, params }) => {
  need(user, 'driver'); needActive(user);
  const order = getOrder(Number(params[0]), user);
  if (order.driverId !== user.id || order.status !== 'assigned') fail(409, 'cannot_release');
  safetyFree(order.id);
  run("UPDATE orders SET driver_id = NULL, commission = NULL, status = 'searching', updated_at = ? WHERE id = ?", Date.now(), order.id);
  return { ok: true };
});

function advanceOrder(user: User, id: number, body: Row) {
  const r = one('SELECT * FROM orders WHERE id = ?', id) ?? fail(404, 'not_found');
  if (r.driver_id !== user.id || !activeStatuses.includes(r.status)) fail(409, 'cannot_advance');
  if (body.expectedStatus !== r.status) fail(409, 'order_changed');
  const next = nextStatus(r.status);
  if (next === r.status) fail(409, 'cannot_advance'); // on_hold waits for an administrator decision
  safetyFree(r.id);
  const now = Date.now();
  if (next === 'completed' || next === 'returned') {
    // Delivery needs the recipient's handover code; a return needs the sender's return code.
    const expected = next === 'completed' ? r.handover_code : r.return_code;
    if ((one('SELECT failures FROM proof_attempts WHERE order_id = ?', r.id)?.failures ?? 0) >= 5) fail(409, 'proof_locked');
    if (expected && String(body.code ?? '').trim() !== expected) {
      run(`INSERT INTO proof_attempts (order_id, failures) VALUES (?, 1) ON CONFLICT(order_id) DO UPDATE SET failures = failures + 1`, r.id);
      run(`INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, 'PROOF_FAILED', ?)`, user.id, r.id, now);
      fail(400, 'wrong_code');
    }
    const rate = activePlan(user.id) === 'pro' ? settings().proCommission : settings().commission;
    run('UPDATE orders SET status = ?, commission = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      next, r.commission ?? commissionOn(r.price, rate), now, now, r.id);
    if (next === 'returned') run(`INSERT INTO security_events (actor_id, order_id, action, created_at) VALUES (?, ?, 'RETURN_COMPLETED', ?)`, user.id, r.id, now);
    else rewardReferral(r.id, now);
  } else run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', next, now, r.id);
  if (next === 'at_pickup' || next === 'in_transit' || next === 'completed' || next === 'returned') queuePush([r.customer_id], next, r.id);
  return getOrder(r.id, user);
}

function reportException(user: User, id: number, body: Row) {
  const r = one('SELECT * FROM orders WHERE id = ?', id) ?? fail(404, 'not_found');
  if (r.driver_id !== user.id || r.status !== 'in_transit' || r.service === 'ride') fail(409, 'cannot_report');
  safetyFree(r.id);
  if (body.expectedStatus !== r.status) fail(409, 'order_changed');
  const now = Date.now();
  run("UPDATE orders SET status = 'on_hold', exception_reason = ?, updated_at = ? WHERE id = ?", body.reason, now, r.id);
  run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'DELIVERY_EXCEPTION', ?, ?)`,
    user.id, r.id, JSON.stringify({ reason: body.reason, note: text(body.note, 200, false) }), now);
  return getOrder(r.id, user);
}

route('POST', '/api/orders/:id/exception', ({ user, params, body }) => {
  need(user, 'driver'); needActive(user);
  if (!exceptionReasons.includes(body.reason)) fail(400, 'invalid_input');
  text(body.note, 200, false);
  return driverCommand(user, Number(params[0]), body, reportException);
});

route('POST', '/api/admin/orders/:id/resolve', ({ user, params, body }) => {
  need(user, 'admin');
  const reason = text(body.reason, 500);
  // confirm_return is the way out when the sender cannot give the code: support verifies the handback and records why.
  const from = { reattempt: 'on_hold', return: 'on_hold', confirm_return: 'returning' }[String(body.action)];
  if (reason.length < 5 || !from) fail(400, 'invalid_input');
  const id = Number(params[0]);
  db.exec('BEGIN IMMEDIATE');
  try {
    if ((one('SELECT status FROM orders WHERE id = ?', id) ?? fail(404, 'not_found')).status !== from) fail(409, 'cannot_resolve');
    if (body.action === 'reattempt') run("UPDATE orders SET status = 'in_transit', updated_at = ? WHERE id = ?", Date.now(), id);
    else if (body.action === 'confirm_return') run("UPDATE orders SET status = 'returned', completed_at = ?, updated_at = ? WHERE id = ?", Date.now(), Date.now(), id);
    else {
      run("UPDATE orders SET status = 'returning', return_code = ?, updated_at = ? WHERE id = ?", String(randomInt(1000, 10000)), Date.now(), id);
      run('DELETE FROM proof_attempts WHERE order_id = ?', id); // the return gets its own five attempts
    }
    run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'EXCEPTION_RESOLVED', ?, ?)`,
      user.id, id, JSON.stringify({ action: body.action, reason }), Date.now());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getOrder(id, user);
});

route('POST', '/api/orders/:id/advance', ({ user, params, body }) => {
  need(user, 'driver'); needActive(user);
  return driverCommand(user, Number(params[0]), body, advanceOrder);
});

// Lost acknowledgements replay the stored outcome instead of applying a driver command twice.
function driverCommand(user: User, id: number, body: Row, apply: (user: User, id: number, input: Row) => Order) {
  const { requestId, ...input } = body;
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) fail(400, 'invalid_request_id');
  if (!activeStatuses.includes(input.expectedStatus)) fail(400, 'invalid_status');
  getOrder(id, user); // reject nonexistent/inaccessible resources before storing a foreign-keyed outcome
  const hash = payloadHash({ ...input, id }); // unchanged shape keeps pre-release advance retries replayable
  let result: Order | undefined, failure: HttpError | undefined;
  db.exec('BEGIN IMMEDIATE');
  try {
    const saved = one('SELECT * FROM order_actions WHERE user_id = ? AND request_id = ?', user.id, requestId);
    if (saved) {
      if (saved.payload_hash !== hash) fail(409, 'idempotency_conflict');
      if (saved.error) failure = new HttpError(saved.http_status, saved.error);
      else result = getOrder(id, user); // acknowledge the original action with the current authoritative state
    } else {
      try { result = apply(user, id, input); }
      catch (error) { if (!(error instanceof HttpError)) throw error; failure = error; }
      run('INSERT INTO order_actions (user_id, request_id, payload_hash, order_id, http_status, error) VALUES (?, ?, ?, ?, ?, ?)',
        user.id, requestId, hash, id, failure?.status ?? 200, failure?.message ?? null);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  if (failure) throw failure;
  return result;
}

route('POST', '/api/location', ({ user, body }) => {
  needActive(user);
  need(user, 'driver');
  if (!one(`SELECT id FROM orders WHERE driver_id = ? AND status IN (${activeSql})`, user.id)) fail(409, 'no_active_job');
  const lat = body.latitude, lng = body.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) fail(400, 'invalid_location');
  run(`INSERT INTO driver_locations (driver_id, lat, lng, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(driver_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at`, user.id, lat, lng, Date.now());
  return { ok: true };
});

route('GET', '/api/driver/earnings', ({ user }) => {
  need(user, 'driver');
  const since = (from: number) => {
    const r = one(`SELECT COUNT(*) jobs, COALESCE(SUM(price), 0) gross, COALESCE(SUM(commission), 0) commission
      FROM orders WHERE driver_id = ? AND status IN (${finishedSql}) AND completed_at >= ?`, user.id, from)!;
    return { jobs: r.jobs, gross: r.gross, commission: r.commission, net: Math.round((r.gross - r.commission) * 100) / 100 };
  };
  const midnight = new Date().setHours(0, 0, 0, 0);
  return { today: since(midnight), week: since(Date.now() - 7 * DAY), all: since(0) };
});

// Cash settlement: drivers collect every fare in cash and owe Wind the commission snapshot of each finished job.
// The ledger is append-only; a handover counts only after the driver confirms it (two-person check).
function cashBalances(where: string, ...params: SQLInputValue[]) {
  const sum = (filter: string) => `COALESCE((SELECT SUM(amount_cents) FROM cash_entries e WHERE e.driver_id = u.id AND ${filter}), 0)`;
  return all(`SELECT u.id, u.name, u.phone,
    COALESCE((SELECT SUM(CAST(ROUND(commission * 100) AS INTEGER)) FROM orders WHERE driver_id = u.id AND status IN (${finishedSql})), 0) commission,
    COALESCE((SELECT SUM(CAST(ROUND(discount * 100) AS INTEGER)) FROM orders WHERE driver_id = u.id AND status IN (${finishedSql})), 0) discounts,
    ${sum("kind = 'adjustment'")} adjustments, ${sum("kind = 'remittance' AND status = 'confirmed'")} remitted,
    ${sum("kind = 'remittance' AND status = 'pending'")} pending,
    (SELECT MAX(created_at) FROM cash_entries e WHERE e.driver_id = u.id AND kind = 'remittance') last_remittance
    FROM users u WHERE u.role = 'driver' AND u.phone NOT LIKE 'deleted-%' AND ${where}`, ...params)
    .map(r => ({ driverId: r.id as number, name: r.name as string, phone: r.phone as string,
      commissionCents: r.commission as number, discountsCents: r.discounts as number, adjustmentsCents: r.adjustments as number, remittedCents: r.remitted as number,
      // Promo discounts are Wind's cost: the driver collected that much less cash, so it comes off what they owe.
      pendingCents: r.pending as number, owedCents: r.commission - r.discounts + r.adjustments - r.remitted, lastRemittanceAt: (r.last_remittance as number) ?? null }));
}
// A driver leaves the ledger (deletion or role change) only once nothing is owed or waiting for confirmation.
function cashSettled(userId: number) {
  const balance = cashBalances('u.id = ?', userId)[0];
  if (balance && (balance.owedCents !== 0 || balance.pendingCents > 0)) fail(409, 'cash_outstanding');
}
const cashEntry = (r: Row) => ({ id: r.id, kind: r.kind, amountCents: r.amount_cents, note: r.note, status: r.status,
  reference: r.kind === 'remittance' ? `R-${String(r.id).padStart(6, '0')}` : null, createdAt: r.created_at, decidedAt: r.decided_at ?? null });

route('GET', '/api/driver/cash', ({ user }) => {
  need(user, 'driver');
  const { owedCents, pendingCents, commissionCents, discountsCents, remittedCents, adjustmentsCents } = cashBalances('u.id = ?', user.id)[0]!;
  return { owedCents, pendingCents, commissionCents, discountsCents, remittedCents, adjustmentsCents,
    entries: all('SELECT * FROM cash_entries WHERE driver_id = ? ORDER BY id DESC LIMIT 50', user.id).map(cashEntry) };
});

route('POST', '/api/driver/cash/:id/confirm', ({ user, params, body }) => {
  need(user, 'driver');
  if (!['confirm', 'dispute'].includes(body.decision)) fail(400, 'invalid_input');
  const entry = one("SELECT * FROM cash_entries WHERE id = ? AND driver_id = ? AND kind = 'remittance'", Number(params[0]), user.id) ?? fail(404, 'not_found');
  if (!run("UPDATE cash_entries SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
    body.decision === 'confirm' ? 'confirmed' : 'disputed', Date.now(), entry.id).changes) fail(409, 'already_decided');
  return cashEntry(one('SELECT * FROM cash_entries WHERE id = ?', entry.id)!);
});

route('GET', '/api/admin/cash', ({ user }) => {
  need(user, 'admin');
  return cashBalances('1 = 1').sort((a, b) => b.owedCents - a.owedCents || a.driverId - b.driverId);
});

function recordCash(user: User, body: Row, kind: 'remittance' | 'adjustment') {
  need(user, 'admin');
  const amount = body.amountCents;
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) fail(400, 'invalid_amount');
  const note = kind === 'adjustment' ? text(body.reason, 500) : text(body.note, 200, false);
  if (kind === 'adjustment' && note.length < 5) fail(400, 'invalid_input');
  db.exec('BEGIN IMMEDIATE');
  try {
    const balance = cashBalances('u.id = ?', Number(body.driverId))[0] ?? fail(404, 'not_found');
    // No overpayment, and no adjustment that turns a debt into a payout (payouts are out of scope).
    if (kind === 'remittance' && (amount < 0 || amount > balance.owedCents - balance.pendingCents)) fail(400, 'invalid_amount');
    if (kind === 'adjustment' && balance.owedCents - balance.pendingCents + amount < 0) fail(400, 'invalid_amount');
    const id = Number(run('INSERT INTO cash_entries (driver_id, kind, amount_cents, note, status, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      balance.driverId, kind, amount, note, kind === 'remittance' ? 'pending' : 'confirmed', user.id, Date.now()).lastInsertRowid);
    db.exec('COMMIT');
    return cashEntry(one('SELECT * FROM cash_entries WHERE id = ?', id)!);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
route('POST', '/api/admin/cash/remittance', ({ user, body }) => recordCash(user, body, 'remittance'));
route('POST', '/api/admin/cash/adjustment', ({ user, body }) => recordCash(user, body, 'adjustment'));

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
route('POST', '/api/admin/orders/:id/proof-reset', ({ user, params, body }) => {
  need(user, 'admin');
  const reason = text(body.reason, 500);
  if (reason.length < 5) fail(400, 'invalid_input');
  const order = getOrder(Number(params[0]), user);
  if (!['in_transit', 'returning'].includes(order.status)) fail(409, 'cannot_advance');
  db.exec('BEGIN IMMEDIATE');
  try {
    run('DELETE FROM proof_attempts WHERE order_id = ?', order.id);
    run(`INSERT INTO security_events (actor_id, order_id, action, detail, created_at) VALUES (?, ?, 'PROOF_RESET', ?, ?)`, user.id, order.id, JSON.stringify({ reason }), Date.now());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { ok: true };
});
route('GET', '/api/admin/stats', ({ user }) => {
  need(user, 'admin');
  const orders = one(`SELECT COUNT(*) completed, COALESCE(SUM(price), 0) gmv, COALESCE(SUM(commission), 0) commission
    FROM orders WHERE status IN (${finishedSql})`)!;
  const subs = one("SELECT COUNT(*) count, COALESCE(SUM(price), 0) revenue FROM subscriptions WHERE activated_at IS NOT NULL")!;
  // Calendar days in server local time (set TZ), built with setDate so DST changes don't shift the buckets.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13);
  const from = start.getTime();
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-CA'); // YYYY-MM-DD
  const byDay = new Map<string, { commission: number; subscriptions: number }>();
  for (let i = 0; i < 14; i++) byDay.set(day(new Date(start).setDate(start.getDate() + i)), { commission: 0, subscriptions: 0 });
  for (const r of all(`SELECT completed_at t, commission v FROM orders WHERE status IN (${finishedSql}) AND completed_at >= ?`, from)) {
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
    services: Object.fromEntries(all(`SELECT service, COUNT(*) n FROM orders WHERE status IN (${finishedSql}) GROUP BY service`).map(r => [r.service, r.n])),
    users: Object.fromEntries(all('SELECT role, COUNT(*) n FROM users GROUP BY role').map(r => [r.role, r.n])),
    pendingDrivers: one("SELECT COUNT(*) n FROM users WHERE role = 'driver' AND status = 'pending'")!.n,
    pendingSubscriptions: one("SELECT COUNT(*) n FROM subscriptions WHERE status = 'pending'")!.n,
    openIncidents: one("SELECT COUNT(*) n FROM safety_incidents WHERE status = 'open'")!.n,
    daily: [...byDay].map(([date, v]) => ({ date, ...v })),
  };
});

route('GET', '/api/admin/users', ({ user, query }) => {
  need(user, 'admin');
  const role = query.get('role'), q = `%${query.get('q') ?? ''}%`;
  return all(`SELECT * FROM users WHERE (? IS NULL OR role = ?) AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) AND phone NOT LIKE 'deleted-%'
    ORDER BY status = 'pending' DESC, id DESC LIMIT 200`, role, role, q, q, q).map(toUser);
});

const editUser: Handler = ({ user, params, body }) => {
  need(user, 'admin');
  const target = one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%'", Number(params[0])) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  const name = body.name === undefined ? target.name : text(body.name, 60);
  const phone = body.phone === undefined ? target.phone : normalizePhone(String(body.phone)) ?? fail(400, 'invalid_phone');
  const email = body.email === undefined ? target.email ?? null : body.email === null || body.email === '' ? null : normalizeEmail(body.email) ?? fail(400, 'invalid_email');
  let status = body.status === undefined ? target.status : ['active', 'pending', 'blocked'].includes(body.status) ? body.status : fail(400, 'invalid_status');
  const role = body.role === undefined ? target.role : ['customer', 'driver'].includes(body.role) ? body.role : fail(400, 'invalid_role');
  const vehicle = role === 'driver' ? vehicles.includes(body.vehicle ?? target.vehicle ?? 'car') ? body.vehicle ?? target.vehicle ?? 'car' : fail(400, 'invalid_vehicle') : null;
  if (one('SELECT id FROM users WHERE phone = ? AND id <> ?', phone, target.id)) fail(409, 'phone_taken');
  if (email && one('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', email, target.id)) fail(409, 'email_taken');
  const identityChanged = phone !== target.phone || email !== (target.email ?? null);
  const roleChanged = role !== target.role;
  const vehicleChanged = vehicle !== target.vehicle;
  if ((identityChanged || roleChanged || vehicleChanged || (status !== target.status && status === 'pending')) &&
    one(`SELECT id FROM orders WHERE (driver_id = ? AND status IN (${activeSql})) OR (customer_id = ? AND status IN ('searching',${activeSql}))`, target.id, target.id)) fail(409, 'active_orders');
  if (roleChanged && target.role === 'driver') cashSettled(target.id);
  if (selfService && role === 'driver' && (identityChanged || roleChanged || vehicleChanged) && status === 'active') status = 'pending';
  if (production && selfService && role === 'driver' && status === 'active' && !target.approved_at) fail(409, 'pending_approval');
  db.exec('BEGIN IMMEDIATE');
  try {
    run(`UPDATE users SET name = ?, phone = ?, email = ?, status = ?, role = ?, vehicle = ?,
      phone_verified_at = ?, email_verified_at = ?, approved_at = ? WHERE id = ?`,
      name, phone, email, status, role, vehicle, phone !== target.phone ? null : target.phone_verified_at ?? null,
      email !== (target.email ?? null) ? null : target.email_verified_at ?? null,
      identityChanged || roleChanged || vehicleChanged ? null : target.approved_at ?? null, target.id);
    if (roleChanged) {
      // Keep paid revenue history, but end benefits belonging to the previous role.
      run("UPDATE subscriptions SET ends_at = MIN(ends_at, ?) WHERE user_id = ? AND status = 'active'", Date.now(), target.id);
      run("UPDATE subscriptions SET status = 'rejected' WHERE user_id = ? AND status = 'pending'", target.id);
    }
    if (body.status !== undefined || identityChanged || roleChanged || vehicleChanged) run('DELETE FROM sessions WHERE user_id = ?', target.id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return toUser(one('SELECT * FROM users WHERE id = ?', target.id)!);
};
route('POST', '/api/admin/users/:id', editUser); // existing clients
route('PATCH', '/api/admin/users/:id', editUser);
route('POST', '/api/admin/users/:id/approve', ({ user, params }) => {
  need(user, 'admin');
  const target = one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%'", Number(params[0])) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  run("UPDATE users SET status = 'active', approved_at = COALESCE(approved_at, ?) WHERE id = ?", Date.now(), target.id);
  return toUser(one('SELECT * FROM users WHERE id = ?', target.id)!);
});
route('DELETE', '/api/admin/users/:id', ({ user, params }) => {
  need(user, 'admin');
  const target = one("SELECT * FROM users WHERE id = ? AND phone NOT LIKE 'deleted-%'", Number(params[0])) ?? fail(404, 'not_found');
  if (target.role === 'admin') fail(409, 'cannot_change_admin');
  return deleteAccount(toUser(target));
});

// No SMS provider yet: support verifies the caller, resets, and reads the temporary password out to them.
route('POST', '/api/admin/users/:id/password', ({ user, params }) => {
  need(user, 'admin');
  limit(identityKey('support-password', user.id), 20, 60 * 60_000);
  const target = one("SELECT * FROM users WHERE id = ? AND role != 'admin' AND phone NOT LIKE 'deleted-%'", Number(params[0])) ?? fail(404, 'not_found');
  const password = randomBytes(12).toString('base64url');
  const hashed = hashPassword(password);
  db.exec('BEGIN IMMEDIATE');
  try {
    run('UPDATE users SET password = ? WHERE id = ?', hashed, target.id);
    run('DELETE FROM sessions WHERE user_id = ?', target.id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
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
  if (body.action === 'activate') {
    const target = one('SELECT role FROM users WHERE id = ?', sub.user_id)!;
    if (sub.plan !== planForRole[target.role as User['role']]) fail(409, 'invalid_action');
    run("UPDATE subscriptions SET status = 'active', activated_at = ?, ends_at = ? WHERE id = ?", Date.now(), Date.now() + 30 * DAY, sub.id);
  }
  else if (body.action === 'reject') run("UPDATE subscriptions SET status = 'rejected' WHERE id = ?", sub.id);
  else fail(400, 'invalid_action');
  return { ok: true };
});

route('POST', '/api/admin/settings', ({ user, body }) => {
  need(user, 'admin');
  for (const [key, value] of Object.entries(body)) {
    const n = Number(value);
    if (!(key in defaultSettings) || !Number.isFinite(n) || n < 0 || (fractionSettings.includes(key as keyof Settings) && n >= 1)) fail(400, 'invalid_setting');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [key, value] of Object.entries(body)) run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, Number(value));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return settings();
});

// ---------- http ----------

async function readBody(req: IncomingMessage): Promise<Row> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 20_000) fail(413, 'too_large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed : fail(400, 'invalid_json'); }
  catch { return fail(400, 'invalid_json'); }
}

function authenticate(req: IncomingMessage): User | null {
  const token = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return null;
  const r = one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.created_at > ?',
    sha(token), Date.now() - SESSION_DAYS * DAY);
  return r && r.status !== 'blocked' && contactAllowed(r) && (!production || (selfService ? r.role !== 'admin' || r.phone_verified_at || r.approved_at : r.phone_verified_at)) ? toUser(r) : null;
}

let draining = false;
export const server = createServer({ maxHeaderSize: 16_384 }, async (req, res) => {
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Access-Control-Allow-Origin', '*'); // bearer tokens, no cookies: open CORS is safe
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  let status = 200, payload: unknown;
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (draining) fail(503, 'unavailable');
    const page = req.method === 'GET' ? publicPages.get(url.pathname) : undefined;
    if (page) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page); return; }
    if (req.method === 'GET' && serveWeb(url.pathname, req, res)) return;
    const match = routes.map(([method, pattern, handler, isPublic]) => ({ method, m: pattern.exec(url.pathname), handler, isPublic }))
      .find(r => r.method === req.method && r.m) ?? fail(404, 'not_found');
    if (!match.isPublic && !authenticate(req)) fail(401, 'unauthorized');
    const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {};
    const user = authenticate(req); // a slow body cannot retain authority revoked while it was uploading
    if (!match.isPublic && !user) fail(401, 'unauthorized');
    if (['/api/auth/login', '/api/auth/register'].includes(url.pathname)) {
      const forwarded = req.headers['x-real-ip'];
      const address = process.env.WIND_TRUST_PROXY === '1' && typeof forwarded === 'string' ? forwarded : req.socket.remoteAddress ?? 'unknown';
      limit(identityKey(url.pathname, address), url.pathname.endsWith('register') ? 20 : 50, 10 * 60_000);
    }
    outbox.length = 0;
    payload = match.handler({ user: user!, body, params: match.m!.slice(1), query: url.searchParams, req });
    flushPush();
  } catch (error) {
    outbox.length = 0;
    status = error instanceof HttpError ? error.status : (error as { errcode?: number }).errcode === 5 ? 503 : 500;
    payload = { error: error instanceof HttpError ? error.message : 'server_error' };
    if (status >= 500) console.error(error);
  }
  if (status === 429 || status === 503) res.setHeader('Retry-After', '60');
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;

export async function shutdown() {
  if (draining) return;
  draining = true;
  const force = setTimeout(() => server.closeAllConnections(), 10_000);
  force.unref();
  try { await new Promise<void>(resolve => server.close(() => resolve())); }
  finally { clearTimeout(force); db.close(); }
}

// Phones aren't verified by SMS, so admin rights are granted from the server shell, never over the API.
export function promote(input: string) {
  const phone = normalizePhone(input) ?? fail(400, 'invalid_phone');
  if (production && !one('SELECT phone_verified_at FROM users WHERE phone = ?', phone)?.phone_verified_at) fail(409, 'verify phone ownership through operator enrollment first');
  if (!run("UPDATE users SET role = 'admin', status = 'active', vehicle = NULL WHERE phone = ?", phone).changes)
    fail(404, 'register this number in the app first');
  return phone;
}

if (import.meta.main) {
  if (process.argv[2] === 'delete-account') {
    try {
      if (process.argv[4] !== '--phone-verified') throw new Error('Verify request ownership with the operator before passing --phone-verified');
      const phone = normalizePhone(process.argv[3] ?? '') ?? fail(400, 'invalid_phone');
      const account = one('SELECT * FROM users WHERE phone = ?', phone) ?? fail(404, 'not_found');
      deleteAccount(toUser(account));
      console.log('Verified account deletion completed');
    } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'verify-phone') {
    try {
      if (process.argv[4] !== '--phone-verified') throw new Error('Verify phone ownership with the operator before passing --phone-verified');
      const phone = normalizePhone(process.argv[3] ?? '') ?? fail(400, 'invalid_phone');
      if (!run('UPDATE users SET phone_verified_at = ? WHERE phone = ? AND status <> ?', Date.now(), phone, 'blocked').changes) fail(404, 'not_found');
      console.log('Operator phone verification recorded');
    } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'enroll') {
    try {
      if (process.argv[6] !== '--phone-verified') throw new Error('Verify phone ownership with the operator before passing --phone-verified');
      const phone = normalizePhone(process.argv[3] ?? '') ?? fail(400, 'invalid_phone');
      const role = ['customer', 'driver', 'admin'].includes(process.argv[4]) ? process.argv[4] : fail(400, 'invalid_role');
      const vehicle = role === 'driver' ? (vehicles.includes(process.argv[7] as Vehicle) ? process.argv[7] : process.argv[7] ? fail(400, 'invalid_vehicle') : 'car') : null;
      const name = text(process.argv[5], 60), password = newPassword(readFileSync(0, 'utf8').trimEnd());
      if (one('SELECT id FROM users WHERE phone = ?', phone)) fail(409, 'phone_taken');
      run('INSERT INTO users (phone, name, password, role, status, vehicle, created_at, phone_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        phone, name, hashPassword(password), role, role === 'driver' ? 'pending' : 'active', vehicle, Date.now(), Date.now());
      console.log('Verified account enrolled; drivers still require approval');
    } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
    finally { db.close(); }
  } else if (process.argv[2] === 'promote') {
    try { console.log(`${promote(process.argv[3] ?? '')} is now an admin`); }
    catch (error) { console.error((error as Error).message); process.exitCode = 1; }
    finally { db.close(); }
  } else {
    run('DELETE FROM sessions WHERE created_at < ?', Date.now() - SESSION_DAYS * DAY);
    run('DELETE FROM checkpoint_reports WHERE created_at < ?', Date.now() - 30 * DAY); // only the last two hours are ever shown
    run('DELETE FROM request_limits WHERE until < ?', Date.now());
    const port = Number(process.env.PORT ?? 4000);
    server.listen(port, process.env.HOST ?? (production ? '127.0.0.1' : '0.0.0.0'), () => console.log(`Wind API on :${port}`));
    process.once('SIGTERM', () => { shutdown().catch(error => { console.error(error); process.exitCode = 1; }); });
    process.once('SIGINT', () => { shutdown().catch(error => { console.error(error); process.exitCode = 1; }); });
  }
}
