import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-driver-recovery-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, shutdown, promote, db, persistence } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
try {
  const register = (phone, role = 'customer') => call('/auth/register', { body: { phone, role, name: 'Recovery fixture', password: 'secret1', ...(role === 'driver' ? { vehicle: 'car' } : {}) } });
  const admin = await register('0599788101'); await promote('0599788101');
  admin.token = (await call('/auth/login', { body: { phone: '0599788101', password: 'secret1' } })).token;
  const customer = await register('0599788102'), driver = await register('0599788103', 'driver');
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const booked = await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Fixture origin', dropoffNote: 'Fixture destination', contact: '0599788102', detail: 'Box', quotedPrice: 20 } });
  const assigned = await call(`/jobs/${booked.id}/accept`, { token: driver.token, body: {} });
  let snapshot = await call(`/orders/${booked.id}?recoveryProtocol=1`, { token: driver.token });
  assert.equal(snapshot.recovery.schemaVersion, 1);
  assert.equal('recovery' in await call(`/orders/${booked.id}`, { token: driver.token }), false, 'installed response unchanged');
  const originalOne = persistence.one;
  let captured;
  persistence.one = async function(sql, ...params) {
    const row = await originalOne.call(this, sql, ...params);
    if (!captured && sql.includes('FROM orders o JOIN users') && params[0] === booked.id) {
      captured = row;
      db.prepare('UPDATE orders SET pickup_note=? WHERE id=?').run('Instructions edited during snapshot serialization', booked.id);
    }
    return row;
  };
  try { snapshot = await call(`/orders/${booked.id}?recoveryProtocol=1`, { token: driver.token }); }
  finally { persistence.one = originalOne; }
  assert.ok(captured, 'the race must occur after the base order read');
  assert.equal(snapshot.pickupNote, captured.pickup_note);
  assert.equal(snapshot.recovery.version, captured.version, 'instructions and recovery revision come from the same row');
  const staleTime = Date.now();
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, expect: 409, body: {
    recoveryProtocol: 1, requestId: randomUUID(), expectedStatus: snapshot.status, expectedAssignedAt: snapshot.assignedAt,
    expectedVersion: snapshot.recovery.version, attemptCreatedAt: staleTime, attemptExpiresAt: staleTime + 60_000,
  } })).error, 'order_changed', 'unseen instructions require a fresh snapshot before advancing');
  const previousVersion = snapshot.recovery.version;
  db.prepare('UPDATE orders SET pickup_note=?,updated_at=? WHERE id=?').run('Changed pickup instructions', Date.now(), booked.id);
  snapshot = await call(`/orders/${booked.id}?recoveryProtocol=1`, { token: driver.token });
  assert.ok(snapshot.recovery.version > previousVersion, 'same-status order edits invalidate an older recovery snapshot');
  const requestId = randomUUID(), path = `/orders/${booked.id}/actions/${requestId}`;
  assert.equal((await call(path, { token: driver.token })).state, 'unknown');
  await call(path, { token: customer.token, expect: 403 }); await call(path, { expect: 401 });
  const now = Date.now(), body = { recoveryProtocol: 1, requestId, expectedStatus: assigned.status, expectedAssignedAt: assigned.assignedAt,
    expectedVersion: snapshot.recovery.version, attemptCreatedAt: now, attemptExpiresAt: now + 60_000 };
  const originalExec = persistence.exec;
  let editedAfterCommit = false;
  persistence.exec = async function(command) {
    const result = await originalExec.call(this, command);
    if (command === 'COMMIT' && !editedAfterCommit) {
      editedAfterCommit = true;
      db.prepare('UPDATE orders SET pickup_note=? WHERE id=?').run('Instructions edited after command commit', booked.id);
    }
    return result;
  };
  let advanced;
  try { advanced = await call(`/orders/${booked.id}/advance`, { token: driver.token, body }); }
  finally { persistence.exec = originalExec; }
  assert.ok(editedAfterCommit, 'the second edit must occur after the command commit');
  assert.equal(advanced.status, 'at_pickup');
  assert.ok(advanced.recovery.version > snapshot.recovery.version, 'mutation reply retains current opt-in recovery metadata');
  assert.equal(advanced.pickupNote, snapshot.pickupNote);
  assert.ok(advanced.recovery.version < db.prepare('SELECT version FROM orders WHERE id=?').get(booked.id).version,
    'the mutation reply retains its snapshot revision when instructions change after commit');
  assert.equal((await call(path, { token: driver.token })).state, 'applied');
  const replayed = await call(`/orders/${booked.id}/advance`, { token: driver.token, body });
  assert.equal(replayed.status, 'at_pickup', 'same receipt replays before stale status');
  assert.equal(replayed.pickupNote, 'Instructions edited after command commit');
  assert.equal(replayed.recovery.version, db.prepare('SELECT version FROM orders WHERE id=?').get(booked.id).version,
    'replay returns a coherent current snapshot');
  const expired = { ...body, requestId: randomUUID(), expectedStatus: advanced.status, attemptCreatedAt: now - 60_000, attemptExpiresAt: now - 1 };
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body: expired, expect: 409 })).error, 'command_expired');
  const staleAssignment = { ...body, requestId: randomUUID(), expectedStatus: advanced.status, expectedAssignedAt: 0 };
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body: staleAssignment, expect: 409 })).error, 'order_changed');
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(booked.id).status, 'at_pickup');
  assert.equal((await call('/runtime/capabilities', { token: driver.token })).capabilities.freightCrew.state, 'unavailable');
  await call('/admin/runtime', { token: driver.token, expect: 403 });
  assert.equal((await call('/admin/runtime', { token: admin.token })).backend, 'sqlite');
  const attempt = async code => {
    const current = await call(`/orders/${booked.id}?recoveryProtocol=1`, { token: driver.token });
    const stamp = Date.now();
    return { ...body, requestId: randomUUID(), expectedStatus: current.status, expectedAssignedAt: current.assignedAt,
      expectedVersion: current.recovery.version, expectedProofVersion: current.proofVersion ?? null,
      attemptCreatedAt: stamp, attemptExpiresAt: stamp + 60_000, ...(code ? { code } : {}) };
  };
  await call(`/orders/${booked.id}/advance`, { token: driver.token, body: await attempt() });
  const proof = db.prepare('SELECT handover_code FROM orders WHERE id=?').get(booked.id).handover_code;
  const wrong = await attempt(proof === '0000' ? '0001' : '0000');
  await call(`/orders/${booked.id}/advance`, { token: driver.token, body: wrong, expect: 400 });
  await call(`/orders/${booked.id}/advance`, { token: driver.token, body: wrong, expect: 400 });
  assert.equal(db.prepare('SELECT failures FROM proof_attempts WHERE order_id=?').get(booked.id).failures, 1, 'replayed rejection counts once');

  const report = () => call(`/orders/${booked.id}/sos`, { token: customer.token, body: { kind: 'other' } });
  const resolve = async () => {
    const [incident] = await call('/admin/incidents', { token: admin.token });
    assert.equal(incident.status, 'open');
    return call(`/admin/incidents/${incident.id}/resolve`, { token: admin.token, body: { resolution: 'Synthetic safety check closed' } });
  };
  await report();
  await resolve();
  assert.equal((await call(`/orders/${booked.id}/advance`, { token: driver.token, body })).status, 'in_transit', 'a legacy committed receipt survives a hold');
  let reportedBetweenReads = false;
  persistence.one = async function(sql, ...params) {
    const row = await originalOne.call(this, sql, ...params);
    if (!reportedBetweenReads && sql.includes('FROM orders o JOIN users') && params[0] === booked.id) {
      reportedBetweenReads = true;
      assert.equal(row.safety_open, 0);
      assert.ok(row.safety_latest > 0);
      await report();
    }
    return row;
  };
  let decorated;
  try { decorated = await call(`/orders/${booked.id}?recoveryProtocol=1&journeyProtocol=1`, { token: driver.token }); }
  finally { persistence.one = originalOne; }
  assert.ok(reportedBetweenReads);
  assert.equal(decorated.safetyHold, true);
  assert.equal('proofVersion' in decorated, false, 'the journey response drops the previous proof when authorization sees an open hold');
  await resolve();
  const corrected = await call(`/orders/${booked.id}/advance`, { token: driver.token, body: await attempt(proof) });
  assert.equal(corrected.status, 'completed', 'fresh corrected proof completes immediately without a polling interval');
  console.log('Driver receipt privacy, legacy compatibility, exact replay, expiry and reassignment API fences passed');
} finally { await shutdown(); }
