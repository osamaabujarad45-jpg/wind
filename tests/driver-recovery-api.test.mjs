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
  assert.ok(advanced.recovery.version > snapshot.recovery.version, 'mutation reply retains current opt-in recovery metadata');
  assert.equal((await call(path, { token: driver.token })).state, 'applied');
  // The recovery version is the order's mutation counter: a client compares it to decide whether its command
  // is stale. It must move exactly when an accepted command changes the order, never because a command was refused.
  const versionOf = async token => (await call(`/orders/${booked.id}?recoveryProtocol=1`, { token })).recovery.version;
  const afterAdvance = await versionOf(driver.token);
  assert.equal(afterAdvance, advanced.recovery.version, 'the mutation reply and a fresh read agree on the version');
  assert.equal(await versionOf(customer.token), afterAdvance, 'both parties read the same version');
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body })).status, 'at_pickup', 'same receipt replays before stale status');
  assert.equal(await versionOf(driver.token), afterAdvance, 'a replayed receipt applies nothing, so the version holds');
  const expired = { ...body, requestId: randomUUID(), expectedStatus: advanced.status, attemptCreatedAt: now - 60_000, attemptExpiresAt: now - 1 };
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body: expired, expect: 409 })).error, 'command_expired');
  assert.equal(await versionOf(driver.token), afterAdvance, 'an expired command changed nothing, so the version must not advance');
  const staleAssignment = { ...body, requestId: randomUUID(), expectedStatus: advanced.status, expectedAssignedAt: 0 };
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body: staleAssignment, expect: 409 })).error, 'order_changed');
  assert.equal(await versionOf(driver.token), afterAdvance, 'a command for a reassigned order changed nothing, so the version must not advance');
  const staleVersion = { ...body, requestId: randomUUID(), expectedStatus: advanced.status, expectedAssignedAt: assigned.assignedAt, expectedVersion: afterAdvance - 1 };
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body: staleVersion, expect: 409 })).error, 'order_changed');
  assert.equal(await versionOf(driver.token), afterAdvance, 'a command built on an old version changed nothing, so the version must not advance');
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(booked.id).status, 'at_pickup');
  assert.equal((await call('/runtime/capabilities', { token: driver.token })).capabilities.freightCrew.state, 'unavailable');
  await call('/admin/runtime', { token: driver.token, expect: 403 });
  assert.equal((await call('/admin/runtime', { token: admin.token })).backend, 'sqlite');
  const attempt = async code => {
    const current = await call(`/orders/${booked.id}?recoveryProtocol=1`, { token: driver.token });
    const stamp = Date.now();
    return { ...body, requestId: randomUUID(), expectedStatus: current.status, expectedAssignedAt: current.assignedAt,
      expectedVersion: current.recovery.version, attemptCreatedAt: stamp, attemptExpiresAt: stamp + 60_000, ...(code ? { code } : {}) };
  };
  await call(`/orders/${booked.id}/advance`, { token: driver.token, body: await attempt() });
  const inTransit = await versionOf(driver.token);
  assert.ok(inTransit > afterAdvance, 'an accepted advance moves the version forward');
  const proof = db.prepare('SELECT handover_code FROM orders WHERE id=?').get(booked.id).handover_code;
  const wrong = await attempt(proof === '0000' ? '0001' : '0000');
  await call(`/orders/${booked.id}/advance`, { token: driver.token, body: wrong, expect: 400 });
  await call(`/orders/${booked.id}/advance`, { token: driver.token, body: wrong, expect: 400 });
  assert.equal(db.prepare('SELECT failures FROM proof_attempts WHERE order_id=?').get(booked.id).failures, 1, 'replayed rejection counts once');
  assert.equal(await versionOf(driver.token), inTransit, 'a refused proof (and its replay) changed no order state, so the version must not advance');
  const corrected = await call(`/orders/${booked.id}/advance`, { token: driver.token, body: await attempt(proof) });
  assert.equal(corrected.status, 'completed', 'fresh corrected proof completes immediately without a polling interval');
  assert.ok(await versionOf(driver.token) > inTransit, 'the accepted corrected proof moves the version forward');
  console.log('Driver receipt privacy, legacy compatibility, exact replay, expiry and reassignment API fences passed');
} finally { await shutdown(); }
