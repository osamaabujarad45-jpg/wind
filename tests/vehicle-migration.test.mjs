import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'wind-vehicle-migration-'));
const path = join(dir, 'wind.db');
const now = Date.now();
const legacy = new DatabaseSync(path);
legacy.exec(`PRAGMA foreign_keys = ON; PRAGMA user_version = 2;
  CREATE TABLE users (
    id INTEGER PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer','driver','admin')),
    status TEXT NOT NULL CHECK (status IN ('active','pending','blocked')),
    vehicle TEXT CHECK (vehicle IN ('car','van','truck')), created_at INTEGER NOT NULL,
    phone_verified_at INTEGER, email TEXT, email_verified_at INTEGER, approved_at INTEGER, consent_at INTEGER, consent_version TEXT);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
  CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES users(id), driver_id INTEGER REFERENCES users(id), status TEXT NOT NULL);
  CREATE TABLE driver_locations (driver_id INTEGER PRIMARY KEY REFERENCES users(id), lat REAL NOT NULL, lng REAL NOT NULL, updated_at INTEGER NOT NULL);`);
legacy.prepare("INSERT INTO users VALUES (1, '0599000111', 'Existing customer', 'hash', 'customer', 'active', NULL, ?, ?, 'customer@example.test', NULL, NULL, NULL, NULL)").run(now, now);
legacy.prepare("INSERT INTO users VALUES (2, '0599000112', 'Existing driver', 'hash', 'driver', 'active', 'car', ?, ?, 'driver@example.test', NULL, ?, NULL, NULL)").run(now, now, now);
legacy.prepare("INSERT INTO sessions VALUES ('legacy-session', 1, ?)").run(now);
legacy.prepare("INSERT INTO orders VALUES (10, 1, 2, 'completed')").run();
legacy.prepare('INSERT INTO driver_locations VALUES (2, 31.9, 35.2, ?)').run(now);
legacy.close();

process.env.DB_PATH = path;
process.env.SUPPORT_CONTACT = 'Synthetic support';
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, db, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

try {
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'users'").get().sql;
  assert.match(sql, /'motorcycle'/); assert.match(sql, /'bicycle'/);
  assert.deepEqual(db.prepare('SELECT id, phone, vehicle, approved_at FROM users ORDER BY id').all().map(row => ({ ...row })), [
    { id: 1, phone: '0599000111', vehicle: null, approved_at: null },
    { id: 2, phone: '0599000112', vehicle: 'car', approved_at: now },
  ]);
  assert.equal(db.prepare('SELECT user_id FROM sessions').get().user_id, 1);
  assert.equal(db.prepare('SELECT customer_id, driver_id FROM orders').get().driver_id, 2);
  assert.equal(db.prepare('SELECT driver_id FROM driver_locations').get().driver_id, 2);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.doesNotThrow(() => db.prepare("INSERT INTO users (phone, name, password, role, status, vehicle, created_at) VALUES ('0599000113', 'Bike driver', 'hash', 'driver', 'pending', 'bicycle', ?)").run(now));
  assert.throws(() => db.prepare("INSERT INTO users (phone, name, password, role, status, vehicle, created_at) VALUES ('0599000114', 'Invalid vehicle', 'hash', 'driver', 'pending', 'scooter', ?)").run(now));
  console.log('Vehicle migration checks passed: v2 constraint upgrade preserves user, session, order and GPS references.');
} finally {
  await shutdown();
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  rmSync(dir, { recursive: true, force: true });
}
