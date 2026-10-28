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
  const parcelScope = { itemCount: 1, lengthMm: 100, widthMm: 100, heightMm: 100, massGrams: 1000, declaredValueMinor: 5000,
    pickupPromisedAfter: Date.now() - 1000, pickupPromisedBefore: Date.now() + 3600000, dropoffPromisedBefore: Date.now() + 7200000 };
  const order = await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: '0599700011', detail: 'Synthetic box', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff' } });
  assert.equal(order.declaredScope, undefined, 'SQLite order serialization gains no declared scope');
  assert.equal((await call(`/orders/${order.id}/scope`, { token: customer.token, body: parcelScope, expect: 409 })).error, 'scope_unavailable');
  assert.equal((await call(`/orders/${order.id}/scope`, { token: customer.token, expect: 409 })).error, 'scope_unavailable');
  assert.equal((await call(`/orders/${order.id}/custody`, { token: driver.token, body: { kind: 'collected' }, expect: 409 })).error, 'scope_unavailable');
  assert.equal((await call(`/orders/${order.id}/pickup-check`, { token: driver.token, body: { actual: { itemCount: 1, massGrams: 1000, lengthMm: 100, widthMm: 100, heightMm: 100 } }, expect: 409 })).error, 'scope_unavailable');
  assert.equal((await call(`/orders/${order.id}/scope/resolve`, { token: admin.token, body: { action: 'support', reason: 'Synthetic support' }, expect: 409 })).error, 'scope_unavailable');
  const objectBytes = Buffer.from('synthetic');
  const digest = await import('node:crypto').then(m => m.createHash('sha256').update(objectBytes).digest('hex'));
  assert.equal((await call(`/orders/${order.id}/objects`, { token: customer.token, body: { purpose: 'document', contentType: 'application/pdf', sizeBytes: objectBytes.length, sha256: digest, contentBase64: objectBytes.toString('base64') }, expect: 409 })).error, 'objects_unavailable');
  assert.equal((await call(`/orders/${order.id}/objects`, { token: customer.token, expect: 409 })).error, 'objects_unavailable');
  assert.equal((await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: '0599700011', detail: 'Synthetic box', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff', declaredScope: parcelScope }, expect: 409 })).error,
    'scope_unavailable', 'a scoped booking is gated, never silently dropped, on SQLite');
  // Legacy parcel flow is byte-for-byte the old behaviour.
  let current = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.equal(current.status, 'assigned'); assert.equal(current.driverId, driverId); assert.equal(current.declaredScope, undefined);
  current = await advance(driver.token, current); assert.equal(current.status, 'at_pickup');
  current = await advance(driver.token, current); assert.equal(current.status, 'in_transit');
  const customerView = await call(`/orders/${order.id}`, { token: customer.token });
  current = await advance(driver.token, current, { code: customerView.handoverCode });
  assert.equal(current.status, 'completed'); assert.equal(current.declaredScope, undefined);
  // Legacy freight flow is unchanged too.
  const freight = await call('/orders', { token: customer.token, body: { service: 'freight', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: '0599700011', detail: 'Synthetic load', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff' } });
  const freightAccepted = await call(`/jobs/${freight.id}/accept`, { token: vanDriver.token, body: {} });
  assert.equal(freightAccepted.status, 'assigned'); assert.equal(freightAccepted.declaredScope, undefined);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('order_declared_scope','custody_records','order_scope_checks','private_objects','private_object_reads')").get().n, 0,
    'no WP12 tables are invented on SQLite');
  console.log('WP12 resource-scope-sqlite: 409 scope/object gates, legacy parcel and freight flows unchanged passed');
} finally { db.close(); await api.stop(); }
