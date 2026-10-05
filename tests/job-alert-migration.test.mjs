import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'wind-job-alert-migration-'));
const path = join(dir, 'wind.db');
const now = Date.now(), scheduledFor = now + 15 * 60_000;
const legacy = new DatabaseSync(path);
legacy.exec(`PRAGMA foreign_keys = ON; PRAGMA user_version = 3;
  CREATE TABLE users (
    id INTEGER PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer','driver','admin')),
    status TEXT NOT NULL CHECK (status IN ('active','pending','blocked')),
    vehicle TEXT CHECK (vehicle IN ('motorcycle','bicycle','car','van','truck')), created_at INTEGER NOT NULL,
    phone_verified_at INTEGER, email TEXT, email_verified_at INTEGER, approved_at INTEGER, consent_at INTEGER, consent_version TEXT);
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES users(id), driver_id INTEGER REFERENCES users(id),
    service TEXT NOT NULL, shared INTEGER NOT NULL, pickup_city TEXT NOT NULL, dropoff_city TEXT NOT NULL,
    pickup_lat REAL, pickup_lng REAL, pickup_note TEXT NOT NULL, dropoff_note TEXT NOT NULL, contact TEXT NOT NULL,
    detail TEXT NOT NULL, option TEXT NOT NULL, loading_help INTEGER NOT NULL, price REAL NOT NULL, commission REAL,
    status TEXT NOT NULL, handover_code TEXT, rating INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    completed_at INTEGER, pickup_contact TEXT, return_code TEXT, exception_reason TEXT, share_token_hash TEXT,
    share_created_at INTEGER, scheduled_for INTEGER, discount REAL);`);
legacy.prepare("INSERT INTO users (id, phone, name, password, role, status, vehicle, created_at) VALUES (1, '0599000211', 'Customer', 'hash', 'customer', 'active', NULL, ?)").run(now);
legacy.prepare(`INSERT INTO orders (id, customer_id, service, shared, pickup_city, dropoff_city, pickup_note, dropoff_note,
  contact, detail, option, loading_help, price, status, created_at, updated_at, scheduled_for, discount)
  VALUES (1, 1, 'parcel', 0, 'ramallah', 'nablus', 'Gate', 'Door', '0599000211', 'Box', 'small', 0, 20, 'searching', ?, ?, ?, 0)`)
  .run(now, now, scheduledFor);
legacy.close();

process.env.DB_PATH = path;
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { alertReleasedJobs, db } = await import('../server/main.ts');

try {
  const marked = db.prepare('SELECT job_alerted_at FROM orders WHERE id = 1').get().job_alerted_at;
  assert.ok(marked, 'startup marks a legacy order already inside the alert window');
  alertReleasedJobs(marked + 1);
  assert.equal(db.prepare('SELECT job_alerted_at FROM orders WHERE id = 1').get().job_alerted_at, marked,
    'the post-upgrade alert loop does not re-offer that existing job');
  console.log('job alert migration: ok');
} finally {
  db.close();
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  rmSync(dir, { recursive: true, force: true });
}
