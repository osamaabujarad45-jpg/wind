// WP11 ride lifecycle (SQLite): every WP11 path fails closed; legacy lifecycle is unchanged.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';

const dir = await mkdtemp(join(tmpdir(), 'wp11-sqlite-')), path = join(dir, 'synthetic.sqlite');
const api = await startApiProcess({ DB_PATH: path, WIND_BOARDING_TEST_ONLY: '1', WIND_DISPATCH_TEST_ONLY: '1' });
const db = new DatabaseSync(path);
const call = apiCaller(() => api.base);
const seed = (phone, role, vehicle = null) => {
  const salt = randomBytes(16).toString('hex');
  const id = Number(db.prepare('INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(phone, 'Synthetic WP11', `${salt}:${scryptSync('Synthetic-password', salt, 32).toString('hex')}`, role, 'active', vehicle, Date.now()).lastInsertRowid);
  return id;
};
const advance = (token, order, extra = {}, expect = 200) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra }, expect });
try {
  seed('0599800001', 'customer'); const driverId = seed('0599800002', 'driver', 'car'); seed('0599800003', 'admin');
  const customer = await call('/auth/login', { body: { phone: '0599800001', password: 'Synthetic-password' } });
  const driver = await call('/auth/login', { body: { phone: '0599800002', password: 'Synthetic-password' } });
  const admin = await call('/auth/login', { body: { phone: '0599800003', password: 'Synthetic-password' } });
  const order = await call('/orders', { token: customer.token, body: { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1', shared: false, contact: '0599800001', detail: '', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff' } });
  assert.equal(order.ride, undefined, 'SQLite order serialization gains no ride object');

  assert.equal((await call(`/orders/${order.id}/arrive`, { token: driver.token, body: {}, expect: 409 })).error, 'ride_lifecycle_unavailable');
  assert.equal((await call(`/admin/orders/${order.id}/arrival/override`, { token: admin.token, body: { reason: 'Synthetic poor GPS at pickup' }, expect: 409 })).error, 'ride_lifecycle_unavailable');
  assert.equal((await call(`/admin/orders/${order.id}/boarding-reset`, { token: admin.token, body: { reason: 'Synthetic support recovery' }, expect: 409 })).error, 'ride_lifecycle_unavailable');

  // The legacy accept and advance flow is byte-for-byte the old behaviour.
  let current = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.equal(current.status, 'assigned');
  assert.equal(current.driverId, driverId);
  assert.equal(current.ride, undefined);
  current = await advance(driver.token, current);
  assert.equal(current.status, 'at_pickup');
  current = await advance(driver.token, current);
  assert.equal(current.status, 'in_transit', 'SQLite rides start without arrival or boarding');
  current = await advance(driver.token, current);
  assert.equal(current.status, 'completed');
  assert.equal(current.ride, undefined);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('ride_lifecycle','ride_boarding_attempts')").get().n, 0, 'no ride lifecycle tables are invented on SQLite');
  console.log('WP11 ride-lifecycle-sqlite: 409 WP11 gates and legacy advance flow unchanged passed');
} finally { db.close(); await api.stop(); }
