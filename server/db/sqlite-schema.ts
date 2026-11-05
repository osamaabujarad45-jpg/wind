import type { DatabaseSync } from 'node:sqlite';
type Row = Record<string, any>;

export function initializeSqlite(db: DatabaseSync) {
// A write that cannot take the lock waits a quarter of a second, then fails with a retryable 503. A long wait would
// block the event loop (one connection, synchronous SQLite) and freeze every other request behind it.
const networkJournal = process.env.SQLITE_JOURNAL === 'DELETE'; if (networkJournal) db.exec('PRAGMA journal_mode = DELETE;'); else try { db.exec('PRAGMA journal_mode = WAL;'); } catch { db.exec('PRAGMA journal_mode = DELETE;'); } db.exec(`PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = ${networkJournal ? 5_000 : 250};`);
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
-- A driver who returns a job must never be offered that same job again. Keep every
-- release, not only the latest one, because multiple drivers can decline in turn.
CREATE TABLE IF NOT EXISTS order_releases (
  order_id INTEGER NOT NULL REFERENCES orders(id), driver_id INTEGER NOT NULL REFERENCES users(id), released_at INTEGER NOT NULL,
  PRIMARY KEY(order_id, driver_id));
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
  id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER REFERENCES orders(id),
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
-- Driver offers (SPEC-driver-offers.md): one pending price per driver per order; accepted or expired offers are deleted.
-- One-time email codes (verify the address, reset a password, support identity check); the hash binds the address.
CREATE TABLE IF NOT EXISTS email_codes (
  user_id INTEGER NOT NULL REFERENCES users(id), purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset','support')),
  code_hash TEXT NOT NULL, sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, purpose));
CREATE TABLE IF NOT EXISTS order_offers (
  order_id INTEGER NOT NULL REFERENCES orders(id), driver_id INTEGER NOT NULL REFERENCES users(id), price INTEGER NOT NULL CHECK (price >= 1),
  created_at INTEGER NOT NULL, PRIMARY KEY (order_id, driver_id));
-- The amount alone cannot recover the original commission rate after rounding.
CREATE TABLE IF NOT EXISTS destination_changes (
  id TEXT PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), customer_id INTEGER NOT NULL REFERENCES users(id),
  driver_id INTEGER NOT NULL REFERENCES users(id), original TEXT NOT NULL, dropoff_city TEXT NOT NULL,
  dropoff_lat REAL, dropoff_lng REAL, dropoff_note TEXT NOT NULL, price REAL NOT NULL, discount REAL, commission REAL NOT NULL, route_km REAL NOT NULL,
  road_info TEXT NOT NULL, tariff_version TEXT NOT NULL, customer_plan TEXT,
  state TEXT NOT NULL CHECK (state IN ('quote','pending','accepted','declined','withdrawn')),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, decided_at INTEGER);
CREATE INDEX IF NOT EXISTS destination_changes_order ON destination_changes(order_id, state, created_at);
CREATE TRIGGER IF NOT EXISTS cash_entries_no_delete BEFORE DELETE ON cash_entries
  BEGIN SELECT RAISE(ABORT, 'cash ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS cash_entries_no_edit BEFORE UPDATE ON cash_entries
  WHEN OLD.status <> 'pending' OR NEW.amount_cents <> OLD.amount_cents OR NEW.driver_id <> OLD.driver_id OR NEW.kind <> OLD.kind
  BEGIN SELECT RAISE(ABORT, 'cash ledger is append-only'); END;
`);
// Additive columns only, without a user_version bump, so the previous build can still open this database.
for (const [column, type] of [['pickup_contact', 'TEXT'], ['return_code', 'TEXT'], ['exception_reason', 'TEXT'], ['share_token_hash', 'TEXT'], ['share_created_at', 'INTEGER'], ['scheduled_for', 'INTEGER'], ['discount', 'REAL'], ['job_alerted_at', 'INTEGER'], ['dropoff_lat', 'REAL'], ['dropoff_lng', 'REAL'], ['recommended_price', 'REAL'], ['price_rating', 'INTEGER'], ['route_km', 'REAL'], ['customer_rating', 'INTEGER'], ['recipient_name', 'TEXT'], ['recipient_phone', 'TEXT'], ['assigned_at', 'INTEGER'], ['picked_up_at', 'INTEGER'], ['commission_rate', 'REAL']]) {
  if (!(db.prepare('PRAGMA table_info(orders)').all() as Row[]).some(r => r.name === column)) {
    db.exec(`ALTER TABLE orders ADD COLUMN ${column} ${type}`);
    // Scheduled orders already visible to drivers before release alerts existed must not all alert at once on upgrade.
    if (column === 'job_alerted_at') db.prepare('UPDATE orders SET job_alerted_at = ? WHERE scheduled_for IS NOT NULL AND scheduled_for <= ?').run(Date.now(), Date.now() + 30 * 60_000);
  }
}
// Covering indexes: driver and customer stats run on every driver request, so they read the index, never the rows.
// A table older than the rating column (it only ever lived in development) keeps the plain indexes.
if ((db.prepare('PRAGMA table_info(orders)').all() as Row[]).some(r => r.name === 'rating'))
  db.exec(`CREATE INDEX IF NOT EXISTS orders_driver_stats ON orders(driver_id, status, rating, price_rating);
    CREATE INDEX IF NOT EXISTS orders_customer_stats ON orders(customer_id, status, customer_rating);`);
// good_lat/good_lng/good_at/good_acc keep the last *plausible* fix: the yardstick a new fix is measured against.
// A wild fix may be shown once, but it must not become the reference (that froze the marker kilometres away).
for (const [column, type] of [['heading', 'REAL'], ['accuracy', 'REAL'], ['good_lat', 'REAL'], ['good_lng', 'REAL'], ['good_at', 'INTEGER'], ['good_acc', 'REAL']]) {
  if (!(db.prepare('PRAGMA table_info(driver_locations)').all() as Row[]).some(r => r.name === column))
    db.exec(`ALTER TABLE driver_locations ADD COLUMN ${column} ${type}`);
}
for (const column of ['lat', 'lng']) { // checkpoint position for routing (SPEC-checkpoint-routing.md)
  if (!(db.prepare('PRAGMA table_info(checkpoints)').all() as Row[]).some(r => r.name === column))
    db.exec(`ALTER TABLE checkpoints ADD COLUMN ${column} REAL`);
}
if (!(db.prepare('PRAGMA table_info(order_disputes)').all() as Row[]).some(r => r.name === 'credit_promo_id'))
  db.exec('ALTER TABLE order_disputes ADD COLUMN credit_promo_id INTEGER REFERENCES promo_codes(id)');
if (!(db.prepare('PRAGMA table_info(users)').all() as Row[]).some(r => r.name === 'phone_verified_at'))
  db.exec('ALTER TABLE users ADD COLUMN phone_verified_at INTEGER');
for (const [column, type] of [['email', 'TEXT'], ['email_verified_at', 'INTEGER'], ['approved_at', 'INTEGER'], ['consent_at', 'INTEGER'], ['consent_version', 'TEXT'], ['entra_oid', 'TEXT'], ['plate', 'TEXT']]) {
  if (!(db.prepare('PRAGMA table_info(users)').all() as Row[]).some(r => r.name === column))
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL');
 db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_entra_oid_unique ON users(entra_oid) WHERE entra_oid IS NOT NULL');
if (!(db.prepare('PRAGMA table_info(sessions)').all() as Row[]).some(r => r.name === 'last_seen_at'))
  db.exec('ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER');
db.exec('CREATE TABLE IF NOT EXISTS entra_replay (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
if (!(db.prepare('PRAGMA table_info(cash_entries)').all() as Row[]).some(r => r.name === 'request_id'))
  db.exec('ALTER TABLE cash_entries ADD COLUMN request_id TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS cash_entries_request ON cash_entries(request_id) WHERE request_id IS NOT NULL');
if (!(db.prepare('PRAGMA table_info(order_messages)').all() as Row[]).some(r => r.name === 'request_id'))
  db.exec('ALTER TABLE order_messages ADD COLUMN request_id TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS order_messages_request ON order_messages(sender_id, request_id) WHERE request_id IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS orders_share_token ON orders(share_token_hash) WHERE share_token_hash IS NOT NULL');
db.exec(`
CREATE TABLE IF NOT EXISTS road_restriction_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL DEFAULT 1, activated INTEGER NOT NULL DEFAULT 0,
  evidence_ref TEXT, reviewer_id INTEGER REFERENCES users(id), reason TEXT, reviewed_at INTEGER);
INSERT OR IGNORE INTO road_restriction_policy(id) VALUES(1);
CREATE TABLE IF NOT EXISTS road_restrictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, restriction_key TEXT NOT NULL, version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open','closed','restricted','unknown','suspended')),
  services TEXT NOT NULL, vehicle_classes TEXT NOT NULL, geometry TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('bidirectional','forward','backward')),
  source TEXT NOT NULL, valid_from INTEGER NOT NULL, valid_until INTEGER NOT NULL,
  last_confirmed_at INTEGER NOT NULL, confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low','unknown')),
  confirmed_prohibition INTEGER NOT NULL, reviewer_id INTEGER NOT NULL REFERENCES users(id),
  evidence_ref TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(restriction_key, version));
  CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES users(id), service TEXT NOT NULL CHECK (service IN ('ride','parcel','freight')),
  pickup_city TEXT NOT NULL, dropoff_city TEXT NOT NULL, pickup_lat REAL, pickup_lng REAL, dropoff_lat REAL, dropoff_lng REAL,
  pickup_note TEXT NOT NULL, dropoff_note TEXT NOT NULL, contact TEXT NOT NULL, pickup_contact TEXT, recipient_name TEXT, recipient_phone TEXT,
  detail TEXT NOT NULL, option TEXT NOT NULL, loading_help INTEGER NOT NULL, shared INTEGER NOT NULL, scheduled_for INTEGER,
  currency TEXT NOT NULL DEFAULT 'ILS' CHECK (currency = 'ILS'), price_minor INTEGER NOT NULL, discount_minor INTEGER, commission_minor INTEGER,
  tariff_snapshot TEXT NOT NULL, tariff_basis_points TEXT NOT NULL, tariff_version TEXT NOT NULL,
  graph_version TEXT, profile_version TEXT, restriction_version TEXT, provider_version TEXT,
  eta_min_seconds INTEGER NOT NULL, eta_max_seconds INTEGER NOT NULL,
  feasibility TEXT NOT NULL CHECK (feasibility IN ('feasible','infeasible','uncertain')), reasons TEXT NOT NULL, disclosures TEXT NOT NULL, lines TEXT NOT NULL,
  itinerary_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, consumed_at INTEGER, consumed_order_id INTEGER REFERENCES orders(id));
`);
  // Optional local operator history must not change the installed delivery schema.
  if (process.env.WIND_OPENCODE_ENABLED === '1' && process.env.NODE_ENV !== 'production') db.exec(`CREATE TABLE IF NOT EXISTS opencode_jobs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
    provider_job_id TEXT,
    result TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`);
db.exec('PRAGMA user_version = 2; COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }

// Account-level audit rows (support reset, admin identity edit) have no order. SQLite cannot drop
// NOT NULL in place, so rebuild once; existing rows keep their order reference. user_version stays
// 3 so a build from before this change can still open the database.
if ((db.prepare('PRAGMA table_info(security_events)').all() as Row[]).find(column => column.name === 'order_id')?.notnull) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      DROP TABLE IF EXISTS security_events_audit_upgrade;
      CREATE TABLE security_events_audit_upgrade (
        id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER REFERENCES orders(id),
        action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
      INSERT INTO security_events_audit_upgrade (id, actor_id, order_id, action, detail, created_at)
        SELECT id, actor_id, order_id, action, detail, created_at FROM security_events;
      DROP TABLE security_events;
      ALTER TABLE security_events_audit_upgrade RENAME TO security_events;
      COMMIT;
    `);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

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
        vehicle TEXT CHECK (vehicle IN ('motorcycle','bicycle','car','van','truck')), plate TEXT, created_at INTEGER NOT NULL,
        phone_verified_at INTEGER, email TEXT, email_verified_at INTEGER, approved_at INTEGER,
        consent_at INTEGER, consent_version TEXT, entra_oid TEXT);
      INSERT INTO users_vehicle_upgrade (id, phone, name, password, role, status, vehicle, plate, created_at, phone_verified_at, email, email_verified_at, approved_at, consent_at, consent_version, entra_oid)
        SELECT id, phone, name, password, role, ${status}, ${vehicle}, ${existing('plate')}, created_at, ${existing('phone_verified_at')}, ${existing('email')}, ${existing('email_verified_at')}, ${existing('approved_at')}, ${existing('consent_at')}, ${existing('consent_version')}, ${existing('entra_oid')}
        FROM users;
      DROP TABLE users;
      ALTER TABLE users_vehicle_upgrade RENAME TO users;
      COMMIT;
    `);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { db.exec('PRAGMA foreign_keys = ON;'); }
}
migrateVehicleChoices();
// After the rebuild above, which keeps only the columns it lists (SPEC-driver-destination.md).
for (const column of ['heading_city TEXT', 'heading_until INTEGER', 'entra_oid TEXT'])
  if (!(db.prepare('PRAGMA table_info(users)').all() as Row[]).some(r => r.name === column.split(' ')[0])) db.exec(`ALTER TABLE users ADD COLUMN ${column}`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL');
 db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_entra_oid_unique ON users(entra_oid) WHERE entra_oid IS NOT NULL');
db.exec('BEGIN IMMEDIATE; PRAGMA user_version = 3; COMMIT');
// T22, additive and idempotent (user_version stays 3 so an older build can still open the database):
// pending subscriptions that predate the constraint collapse to the newest per user and plan — paid
// history (active and rejected rows) is untouched — before the unique index is built.
db.exec('BEGIN IMMEDIATE');
try {
  db.exec(`UPDATE subscriptions SET status = 'rejected'
    WHERE status = 'pending' AND id NOT IN (SELECT MAX(id) FROM subscriptions WHERE status = 'pending' GROUP BY user_id, plan)`);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_pending ON subscriptions(user_id, plan) WHERE status = 'pending'");
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
// T25, additive: an administrator who resolves a pending handover leaves an actor and a reason on the row.
for (const column of ['resolved_by INTEGER', "resolution_note TEXT"])
  if (!(db.prepare('PRAGMA table_info(cash_entries)').all() as Row[]).some(r => r.name === column.split(' ')[0])) db.exec(`ALTER TABLE cash_entries ADD COLUMN ${column}`);
// Native push on this runtime, additive (user_version stays 3). As on PostgreSQL, ending a session drops its token.
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_user ON sessions(token_hash, user_id);
CREATE TABLE IF NOT EXISTS native_push_tokens (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), auth_session_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL UNIQUE, platform TEXT NOT NULL CHECK(platform IN ('ios','android')), expo_push_token TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'ar' CHECK(lang IN ('ar','en')), prefs_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, disabled_at INTEGER,
  FOREIGN KEY(auth_session_hash, user_id) REFERENCES sessions(token_hash, user_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS native_push_tokens_user ON native_push_tokens(user_id, created_at);`);
if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database foreign-key check failed');

}
