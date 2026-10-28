// WP10 dispatch (SQLite): every dispatch path fails closed; the legacy accept is unchanged.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';

const dir = await mkdtemp(join(tmpdir(), 'wp10-sqlite-')), path = join(dir, 'synthetic.sqlite');
const api = await startApiProcess({ DB_PATH: path, WIND_DISPATCH_TEST_ONLY: '1' });
const db = new DatabaseSync(path);
const call = apiCaller(() => api.base);
const seed = (phone, role, vehicle = null) => {
  const salt = randomBytes(16).toString('hex');
  const id = Number(db.prepare('INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(phone, 'Synthetic WP10', `${salt}:${scryptSync('Synthetic-password', salt, 32).toString('hex')}`, role, 'active', vehicle, Date.now()).lastInsertRowid);
  return id;
};
try {
  const customerId = seed('0599700001', 'customer'), driverId = seed('0599700002', 'driver', 'car');
  const customer = await call('/auth/login', { body: { phone: '0599700001', password: 'Synthetic-password' } });
  const driver = await call('/auth/login', { body: { phone: '0599700002', password: 'Synthetic-password' } });
  const order = await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: '0599700001', detail: 'Synthetic box', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff', quotedPrice: 20 } });
  assert.equal(order.dispatch, undefined, 'SQLite order serialization gains no dispatch object');

  const offerId = randomUUID();
  const gated = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: { offerId, leaseNonce: 'synthetic-nonce' }, expect: 409 });
  assert.equal(gated.error, 'dispatch_unavailable');
  assert.equal((await call(`/offers/${offerId}/decline`, { token: driver.token, body: {}, expect: 409 })).error, 'dispatch_unavailable');
  assert.equal((await call(`/orders/${order.id}/dispatch/retry`, { token: customer.token, body: {}, expect: 409 })).error, 'dispatch_unavailable');
  assert.equal((await call('/driver/presence', { token: driver.token, expect: 409 })).error, 'presence_protocol_unavailable', 'presence never claims matching on SQLite');

  // The legacy no-offer accept is byte-for-byte the old behaviour.
  const accepted = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.equal(accepted.status, 'assigned');
  assert.equal(accepted.driverId, driverId);
  assert.equal(accepted.dispatch, undefined);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('dispatch_rounds','dispatch_offers','assignment_history')").get().n, 0, 'no dispatch tables are invented on SQLite');
  console.log('WP10 dispatch-sqlite: 409 dispatch_unavailable gates, presence off, legacy accept unchanged passed');
} finally { db.close(); await api.stop(); }
