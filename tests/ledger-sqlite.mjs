// WP12 resource scope (SQLite): every WP12 path fails closed; legacy flows unchanged.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';

const dir = await mkdtemp(join(tmpdir(), 'wp12-sqlite-')), path = join(dir, 'synthetic.sqlite');
const api = await startApiProcess({ DB_PATH: path });
const db = new DatabaseSync(path);
const call = apiCaller(() => api.base);
const seed = (phone, role, vehicle = null) => {
  const salt = randomBytes(16).toString('hex');
  return Number(db.prepare('INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(phone, 'Synthetic WP12', `${salt}:${scryptSync('Synthetic-password', salt, 32).toString('hex')}`, role, 'active', vehicle, Date.now()).lastInsertRowid);
};
const advance = (token, order, extra = {}, expect = 200) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra }, expect });
try {
  seed('0599700011', 'customer'); const driverId = seed('0599700012', 'driver', 'car');
  seed('0599700013', 'driver', 'van'); seed('0599700014', 'admin');
  const customer = await call('/auth/login', { body: { phone: '0599700011', password: 'Synthetic-password' } });
  const driver = await call('/auth/login', { body: { phone: '0599700012', password: 'Synthetic-password' } });
  const vanDriver = await call('/auth/login', { body: { phone: '0599700013', password: 'Synthetic-password' } });
  const admin = await call('/auth/login', { body: { phone: '0599700014', password: 'Synthetic-password' } });
  const order = await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: '0599700011', detail: 'Synthetic box', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff' } });
  for (const [path, token, body] of [
    [`/orders/${order.id}/cash-receipt`, driver.token, {}], [`/orders/${order.id}/cash-receipt`, customer.token, null],
    [`/orders/${order.id}/cash-receipt/collect`, driver.token, { amountMinor: 100 }],
    ['/admin/ledger/import', admin.token, {}], ['/admin/ledger', admin.token, null], ['/driver/ledger', driver.token, null],
  ]) assert.equal((await call(path, { token, ...(body === null ? {} : { body }), expect: 409 })).error, 'ledger_unavailable');
  const before = await call('/driver/cash', { token: driver.token });
  // Legacy parcel flow is byte-for-byte the old behaviour.
  let current = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.equal(current.status, 'assigned'); assert.equal(current.driverId, driverId); assert.equal(current.declaredScope, undefined);
  current = await advance(driver.token, current); assert.equal(current.status, 'at_pickup');
  current = await advance(driver.token, current); assert.equal(current.status, 'in_transit');
  const customerView = await call(`/orders/${order.id}`, { token: customer.token });
  current = await advance(driver.token, current, { code: customerView.handoverCode });
  assert.equal(current.status, 'completed'); assert.equal(current.declaredScope, undefined);
  const after = await call('/driver/cash', { token: driver.token });
  assert.ok(after.owedCents >= before.owedCents);
  // Legacy freight flow is unchanged too.
  const freight = await call('/orders', { token: customer.token, body: { service: 'freight', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: '0599700011', detail: 'Synthetic load', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff' } });
  const freightAccepted = await call(`/jobs/${freight.id}/accept`, { token: vanDriver.token, body: {} });
  assert.equal(freightAccepted.status, 'assigned'); assert.equal(freightAccepted.declaredScope, undefined);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('ledger_accounts','ledger_journals','ledger_entries','cash_receipts','cash_receipt_events')").get().n, 0,
    'no WP13 tables are invented on SQLite');
  console.log('WP13 ledger-sqlite: six 409 ledger gates, legacy cash flow and absent tables passed');
} finally { db.close(); await api.stop(); }
