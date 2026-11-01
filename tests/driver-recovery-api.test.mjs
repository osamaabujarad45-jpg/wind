import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-driver-recovery-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, shutdown, promote, db } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
try {
  const register = (phone, role = 'customer') => call('/auth/register', { body: { phone, role, name: 'Recovery fixture', password: 'secret1', ...(role === 'driver' ? { vehicle: 'car' } : {}) } });
  const admin = await register('0599788101'); await promote('0599788101');
  const customer = await register('0599788102'), driver = await register('0599788103', 'driver');
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const booked = await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Fixture origin', dropoffNote: 'Fixture destination', contact: '0599788102', detail: 'Box', quotedPrice: 20 } });
  const assigned = await call(`/jobs/${booked.id}/accept`, { token: driver.token, body: {} });
  const snapshot = await call(`/orders/${booked.id}?recoveryProtocol=1`, { token: driver.token });
  assert.equal(snapshot.recovery.schemaVersion, 1);
  assert.equal('recovery' in await call(`/orders/${booked.id}`, { token: driver.token }), false, 'installed response unchanged');
  const requestId = randomUUID(), path = `/orders/${booked.id}/actions/${requestId}`;
  assert.equal((await call(path, { token: driver.token })).state, 'unknown');
  await call(path, { token: customer.token, expect: 403 }); await call(path, { expect: 401 });
  const now = Date.now(), body = { recoveryProtocol: 1, requestId, expectedStatus: assigned.status, expectedAssignedAt: assigned.assignedAt,
    expectedVersion: snapshot.recovery.version, attemptCreatedAt: now, attemptExpiresAt: now + 60_000 };
  const advanced = await call(`/orders/${booked.id}/advance`, { token: driver.token, body });
  assert.equal(advanced.status, 'at_pickup');
  assert.equal((await call(path, { token: driver.token })).state, 'applied');
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body })).status, 'at_pickup', 'same receipt replays before stale status');
  const expired = { ...body, requestId: randomUUID(), expectedStatus: advanced.status, attemptCreatedAt: now - 60_000, attemptExpiresAt: now - 1 };
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body: expired, expect: 409 })).error, 'command_expired');
  const staleAssignment = { ...body, requestId: randomUUID(), expectedStatus: advanced.status, expectedAssignedAt: 0 };
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body: staleAssignment, expect: 409 })).error, 'order_changed');
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(booked.id).status, 'at_pickup');
  assert.equal((await call('/runtime/capabilities', { token: driver.token })).capabilities.freightCrew.state, 'unavailable');
  await call('/admin/runtime', { token: driver.token, expect: 403 });
  assert.equal((await call('/admin/runtime', { token: admin.token })).backend, 'sqlite');
  console.log('Driver receipt privacy, legacy compatibility, exact replay, expiry and reassignment API fences passed');
} finally { await shutdown(); }
