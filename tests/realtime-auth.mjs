// WP09 realtime (PG): authorized short-lived credentials, revocation, snapshot resync, long-poll fallback.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { freshPostgres, selectRuntime, connect } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';
import { Realtime } from '../server/domain/realtime.ts';

const { schema, database: setupDb } = await freshPostgres('realtime');
await setupDb.close();
selectRuntime(schema);
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
delete process.env.WIND_IDENTITY_MODE; delete process.env.WIND_EMAIL_FROM; delete process.env.OSRM_URL;
delete process.env.WIND_PUBSUB_ENDPOINT; delete process.env.WIND_PUBSUB_ENABLED;
const { server, shutdown, promote } = await import('../server/main.ts');
await new Promise(r => server.listen(0, '127.0.0.1', r));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const conn = connect(schema);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hub = new Realtime(conn, fail);
const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, detail: 'Synthetic box', pickupNote: 'Synthetic start', dropoffNote: 'Synthetic end', quotedPrice: 20 };

try {
  const reg = (n, extra = {}) => call('/auth/register', { body: { phone: `05995000${String(n).padStart(2, '0')}`, name: 'Synthetic', password: 'synthetic-secret', ...extra } });
  const admin = await reg(1); await promote(admin.user.phone);
  const customer = await reg(2), foreign = await reg(3);
  const driver = await reg(4, { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const book = (who = customer) => call('/orders', { token: who.token, body: { ...input, contact: who.user.phone, requestId: randomUUID() } });

  // Credential matrix on a searching order.
  const order = await book();
  await call(`/orders/${order.id}/realtime`, { expect: 401 });
  await call(`/orders/${order.id}/realtime`, { token: foreign.token, expect: 404 });
  await call(`/orders/999999999/realtime`, { token: customer.token, expect: 404 });
  const mintedAt = Date.now();
  const credential = await call(`/orders/${order.id}/realtime`, { token: customer.token });
  assert.equal(credential.group, `order-${order.id}`);
  assert.equal(credential.transport, 'long_poll', 'Web PubSub stays disabled without credentials');
  assert.equal(credential.url, null, 'no PubSub URL is invented without credentials');
  assert.ok(credential.expiresAt > mintedAt && credential.expiresAt <= mintedAt + 5 * 60_000 + 5000, 'five-minute credential');
  assert.ok(credential.serverTime <= credential.expiresAt);
  assert.ok(Number.isSafeInteger(credential.eventCursor) && credential.eventCursor >= 1);
  assert.equal(credential.assignmentEpoch, 0);
  assert.ok(credential.snapshotPath.includes(`after=${credential.eventCursor}`));
  assert.equal(typeof credential.token, 'string');
  assert.ok((await call(`/orders/${order.id}/realtime`, { token: admin.token })).token, 'admin may mint');
  await call(`/orders/${order.id}/realtime`, { token: driver.token, expect: 404, });

  // The fake hub verifies signature, expiry and current authority on every use.
  const verified = await hub.verify(credential.token);
  assert.equal(verified.orderId, order.id); assert.equal(verified.subjectType, 'user');
  await conn.run('UPDATE sessions SET last_seen_at=? WHERE user_id=?', Date.now() - 31 * 86_400_000, customer.user.id);
  await assert.rejects(() => hub.verify(credential.token), e => e.status === 401 && e.message === 'realtime_revoked');
  await conn.run('UPDATE sessions SET last_seen_at=? WHERE user_id=?', Date.now(), customer.user.id);
  await assert.rejects(() => hub.verify(`${credential.token.slice(0, -2)}xx`), e => e.status === 401 && e.message === 'realtime_invalid');
  await assert.rejects(() => hub.verify(credential.token, credential.expiresAt + 1), e => e.status === 401 && e.message === 'realtime_expired');
  await assert.rejects(() => hub.verify('not-a-credential'), e => e.status === 401 && e.message === 'realtime_invalid');

  // Gap detection and snapshot resync: events after the cursor carry sequence and epoch.
  const cursorBefore = credential.eventCursor;
  const accepted = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.equal(accepted.status, 'assigned');
  assert.ok((await call(`/orders/${order.id}/realtime`, { token: driver.token })).token, 'assigned driver may mint');
  const snapshot = await call(`/orders/${order.id}?protocol=1&after=${cursorBefore}`, { token: customer.token });
  assert.equal(snapshot.protocol.snapshotRequired, true);
  assert.equal(typeof snapshot.protocol.serverTime, 'number');
  assert.ok(snapshot.protocol.nextCursor > cursorBefore, 'resync advances past the gap');
  assert.ok(snapshot.protocol.events.length >= 1);
  for (const event of snapshot.protocol.events) {
    assert.ok(Number.isSafeInteger(event.sequence), 'event carries its order sequence');
    assert.ok(Number.isSafeInteger(event.assignmentEpoch), 'event carries its assignment epoch');
  }
  assert.equal(snapshot.protocol.assignmentEpoch, 1, 'assignment bumped the epoch');

  // Revoked session: a minted credential dies with its session, before its expiry.
  const leaver = await reg(5), leaverOrder = await book(leaver);
  const leaverCredential = await call(`/orders/${leaverOrder.id}/realtime`, { token: leaver.token });
  assert.equal((await hub.verify(leaverCredential.token)).orderId, leaverOrder.id);
  await call('/auth/logout', { token: leaver.token, body: {} });
  await assert.rejects(() => hub.verify(leaverCredential.token), e => e.status === 401 && e.message === 'realtime_revoked');

  // Reassignment: the released driver loses the stream; the customer keeps it.
  const driverCredential = await call(`/orders/${order.id}/realtime`, { token: driver.token });
  await call(`/orders/${order.id}/release`, { token: driver.token, body: {} });
  await assert.rejects(() => hub.verify(driverCredential.token), e => e.status === 401 && e.message === 'realtime_revoked');
  assert.equal((await hub.verify(credential.token)).orderId, order.id, 'customer credential survives reassignment');

  // Share-link variant: scoped to the tracking allowlist and killed by revocation.
  const share = await call(`/orders/${order.id}/share`, { token: customer.token, body: {} });
  const shareCredential = await call(`${share.path}/realtime`);
  assert.equal(shareCredential.group, `order-${order.id}`);
  assert.equal(shareCredential.transport, 'long_poll');
  assert.ok(!('customerId' in shareCredential) && !('driverId' in shareCredential), 'share credential names no participant');
  const shareVerified = await hub.verify(shareCredential.token);
  assert.equal(shareVerified.subjectType, 'share');
  await call('/track/' + '0'.repeat(64) + '/realtime', { expect: 404 });
  await call(`/orders/${order.id}/share/revoke`, { token: customer.token, body: {} });
  await call(`${share.path}/realtime`, { expect: 404 });
  await assert.rejects(() => hub.verify(shareCredential.token), e => e.status === 401 && e.message === 'realtime_revoked');

  // Long-poll remains the fallback transport and still answers.
  const live = await call(`/orders/${order.id}/live?since=0`, { token: customer.token });
  assert.ok('driverLocation' in live && 'driverKey' in live, 'long-poll fallback shape preserved');

  console.log('WP09 realtime-auth: participant/admin matrix, 5-minute expiry, tamper, revoked session/driver/share during held credential, gap snapshot-resync with sequence/epoch/serverTime, fake-hub gate, long-poll fallback passed');
} finally {
  await conn.close();
  await shutdown();
}
