// Shop delivery tables (SRS §7, server/domain/shop.ts), additive: user_version stays 3, so an older build still opens
// the database and simply never reads them. Money is integer agorot. Snapshots, checks, seals, faults and the shop
// ledger are append-only, like cash_entries. PostgreSQL creates the same tables in postgres-shop.sql (migration 33).
export const sqliteShopSchema = `
CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY, owner_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('grocery','bakery','goods')), city TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, phone TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','active','paused')), paused_new INTEGER NOT NULL DEFAULT 0 CHECK (paused_new IN (0,1)),
  min_order_agorot INTEGER NOT NULL CHECK (min_order_agorot >= 0), delivery_fee_agorot INTEGER NOT NULL CHECK (delivery_fee_agorot >= 0),
  service_fee_agorot INTEGER NOT NULL CHECK (service_fee_agorot >= 0), commission_bps INTEGER NOT NULL CHECK (commission_bps BETWEEN 0 AND 5000),
  prep_minutes INTEGER NOT NULL CHECK (prep_minutes BETWEEN 1 AND 180), licence_no TEXT NOT NULL, licence_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS merchant_hours (
  merchant_id INTEGER NOT NULL REFERENCES merchants(id), weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_min INTEGER NOT NULL CHECK (open_min BETWEEN 0 AND 1439), close_min INTEGER NOT NULL CHECK (close_min BETWEEN 0 AND 1440),
  PRIMARY KEY (merchant_id, weekday, open_min));
CREATE TABLE IF NOT EXISTS merchant_items (
  id INTEGER PRIMARY KEY, merchant_id INTEGER NOT NULL REFERENCES merchants(id), section TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  price_agorot INTEGER NOT NULL CHECK (price_agorot >= 1), by_weight INTEGER NOT NULL DEFAULT 0 CHECK (by_weight IN (0,1)),
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)), sort INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS merchant_items_merchant ON merchant_items(merchant_id, section, sort);
CREATE TABLE IF NOT EXISTS shop_orders (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id), merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  merchant_state TEXT CHECK (merchant_state IN ('accepted','preparing','awaiting_approval','ready','handed_over')),
  accept_deadline INTEGER NOT NULL, accept_extended INTEGER NOT NULL DEFAULT 0, accepted_at INTEGER, preparing_at INTEGER, ready_at INTEGER,
  handed_over_at INTEGER, prep_minutes INTEGER, dispatch_at INTEGER, paused_at INTEGER, paused_ms INTEGER NOT NULL DEFAULT 0, no_captain_alerted_at INTEGER,
  goods_estimate_agorot INTEGER NOT NULL CHECK (goods_estimate_agorot >= 0), goods_cap_agorot INTEGER NOT NULL CHECK (goods_cap_agorot >= 0),
  goods_agorot INTEGER, delivery_fee_agorot INTEGER NOT NULL CHECK (delivery_fee_agorot >= 0), service_fee_agorot INTEGER NOT NULL CHECK (service_fee_agorot >= 0),
  agree_limit REAL NOT NULL, pickup_code TEXT NOT NULL, pickup_failures INTEGER NOT NULL DEFAULT 0, packing TEXT,
  handover_exception TEXT CHECK (handover_exception IN ('missing_item','wrong_item','damaged','package_count')), cancel_reason TEXT,
  merchant_rating INTEGER CHECK (merchant_rating BETWEEN 1 AND 5), customer_rating_by_merchant INTEGER CHECK (customer_rating_by_merchant BETWEEN 1 AND 5));
CREATE INDEX IF NOT EXISTS shop_orders_merchant ON shop_orders(merchant_id, merchant_state);
CREATE TABLE IF NOT EXISTS shop_lines (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), item_id INTEGER REFERENCES merchant_items(id),
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL, policy TEXT NOT NULL CHECK (policy IN ('remove','ask_first','similar')),
  by_weight INTEGER NOT NULL CHECK (by_weight IN (0,1)), qty_milli INTEGER NOT NULL CHECK (qty_milli > 0),
  unit_agorot INTEGER NOT NULL CHECK (unit_agorot >= 0), estimate_agorot INTEGER NOT NULL CHECK (estimate_agorot >= 0),
  final_agorot INTEGER CHECK (final_agorot >= 0), removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0,1)), substitute_for INTEGER);
CREATE INDEX IF NOT EXISTS shop_lines_order ON shop_lines(order_id);
CREATE TABLE IF NOT EXISTS shop_snapshots (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  reason TEXT NOT NULL CHECK (reason IN ('placement','edit','consent','merchant_change','ready')),
  goods_agorot INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS shop_snapshots_order ON shop_snapshots(order_id, id);
CREATE TABLE IF NOT EXISTS shop_changes (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), line_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('weight','substitution')), payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined','expired')), expires_at INTEGER NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, decided_at INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS shop_changes_pending ON shop_changes(order_id) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS shop_handover_checks (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), actor_id INTEGER NOT NULL REFERENCES users(id),
  result TEXT NOT NULL CHECK (result IN ('ok','exception')),
  exception TEXT CHECK (exception IN ('missing_item','wrong_item','damaged','package_count')), note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_seals (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), package_no INTEGER NOT NULL,
  intact INTEGER NOT NULL CHECK (intact IN (0,1)), attempt TEXT NOT NULL CHECK (attempt IN ('deliver','fail')),
  actor_id INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_faults (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id), result TEXT NOT NULL CHECK (result IN ('merchant','wind','none')),
  actor_id INTEGER NOT NULL REFERENCES users(id), note TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_ledger (
  id INTEGER PRIMARY KEY, book TEXT NOT NULL CHECK (book IN ('merchant','captain','wind')),
  merchant_id INTEGER REFERENCES merchants(id), driver_id INTEGER REFERENCES users(id), order_id INTEGER REFERENCES orders(id),
  kind TEXT NOT NULL, amount_agorot INTEGER NOT NULL CHECK (amount_agorot <> 0), note TEXT NOT NULL, reference TEXT,
  actor_id INTEGER NOT NULL REFERENCES users(id), business_ref TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS shop_ledger_merchant ON shop_ledger(book, merchant_id, id);
CREATE INDEX IF NOT EXISTS shop_ledger_driver ON shop_ledger(book, driver_id);
CREATE TRIGGER IF NOT EXISTS shop_snapshots_append_only_u BEFORE UPDATE ON shop_snapshots BEGIN SELECT RAISE(ABORT, 'shop snapshots are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_snapshots_append_only_d BEFORE DELETE ON shop_snapshots BEGIN SELECT RAISE(ABORT, 'shop snapshots are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_checks_append_only_u BEFORE UPDATE ON shop_handover_checks BEGIN SELECT RAISE(ABORT, 'handover checks are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_checks_append_only_d BEFORE DELETE ON shop_handover_checks BEGIN SELECT RAISE(ABORT, 'handover checks are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_seals_append_only_u BEFORE UPDATE ON shop_seals BEGIN SELECT RAISE(ABORT, 'seal records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_seals_append_only_d BEFORE DELETE ON shop_seals BEGIN SELECT RAISE(ABORT, 'seal records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_faults_append_only_u BEFORE UPDATE ON shop_faults BEGIN SELECT RAISE(ABORT, 'fault results are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_faults_append_only_d BEFORE DELETE ON shop_faults BEGIN SELECT RAISE(ABORT, 'fault results are append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_ledger_append_only_u BEFORE UPDATE ON shop_ledger BEGIN SELECT RAISE(ABORT, 'shop ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS shop_ledger_append_only_d BEFORE DELETE ON shop_ledger BEGIN SELECT RAISE(ABORT, 'shop ledger is append-only'); END;
`;
