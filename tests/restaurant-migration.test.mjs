// Restaurants (owner, 23 Nov 2026): an existing SQLite database whose merchants table predates the 'restaurant' category is
// rebuilt once at startup. Rows, ids and the rows that point at them survive; the foreign keys still hold; a second start is a no-op.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';
import { merchantsTable } from '../server/db/sqlite-shop.ts';

const path = join(await mkdtemp(join(tmpdir(), 'wind-restaurant-')), 'synthetic.sqlite');
const merchantsSql = db => String(db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'merchants'").get().sql);

// 1. A current schema, then the merchants table put back the way migration 33 created it, with a shop and an item in it.
let api = await startApiProcess({ DB_PATH: path });
await api.stop();
let db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys = OFF; BEGIN');
db.exec(merchantsTable('merchants_old').replace("'goods','restaurant'", "'goods'"));
db.exec('DROP TABLE merchants; ALTER TABLE merchants_old RENAME TO merchants; COMMIT; PRAGMA foreign_keys = ON');
assert.ok(!merchantsSql(db).includes("'restaurant'"), 'the old check is in place');
const now = Date.now();
const owner = Number(db.prepare("INSERT INTO users(phone,name,password,role,status,created_at) VALUES('0599310001','Synthetic owner','x','customer','active',?)").run(now).lastInsertRowid);
const shop = Number(db.prepare(`INSERT INTO merchants (owner_user_id, name, category, city, lat, lng, phone, status, paused_new, min_order_agorot, delivery_fee_agorot,
  service_fee_agorot, commission_bps, prep_minutes, licence_no, licence_expires_at, created_at, updated_at)
  VALUES (?, 'Synthetic bakery', 'bakery', 'tulkarm', 32.31, 35.03, '0599310001', 'active', 0, 3000, 1000, 200, 1000, 20, 'SYN', ?, ?, ?)`).run(owner, now + 1e10, now, now).lastInsertRowid);
db.prepare("INSERT INTO merchant_items (merchant_id, section, name_ar, name_en, price_agorot, updated_at) VALUES (?, 'خبز', 'كعك', 'Kaak', 500, ?)").run(shop, now);
assert.throws(() => db.prepare("UPDATE merchants SET category = 'restaurant' WHERE id = ?").run(shop), /CHECK/, 'the old table refuses a restaurant');
db.close();

// 2. Start: the table is rebuilt with the new check; the shop, its id and its item are kept.
api = await startApiProcess({ DB_PATH: path });
await api.stop();
db = new DatabaseSync(path);
assert.ok(merchantsSql(db).includes("'restaurant'"), 'the new check is in place');
assert.equal(db.prepare('SELECT name FROM merchants WHERE id = ?').get(shop).name, 'Synthetic bakery');
assert.equal(db.prepare('SELECT COUNT(*) n FROM merchant_items WHERE merchant_id = ?').get(shop).n, 1);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name = 'merchants_next'").get().n, 0, 'no work table is left behind');
db.prepare("UPDATE merchants SET category = 'restaurant' WHERE id = ?").run(shop);
assert.match(String(db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'merchant_items'").get().sql), /REFERENCES merchants\(id\)/, 'items still point at merchants');
db.close();

// 3. A second start changes nothing.
api = await startApiProcess({ DB_PATH: path });
await api.stop();
db = new DatabaseSync(path);
assert.equal(db.prepare('SELECT category FROM merchants WHERE id = ?').get(shop).category, 'restaurant');
db.close();
console.log('Restaurant migration: old merchants table rebuilt once with rows, ids and references kept; second start is a no-op');
