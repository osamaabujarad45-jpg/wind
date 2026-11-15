// WP-03: approval pushes the driver; a blocked account gets the specific 'blocked' code (and no session) only after the
// correct password, so an unauthenticated caller learns nothing the wrong-credentials policy did not already allow.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid';

const dir = mkdtempSync(join(tmpdir(), 'wind-account-status-'));
process.env.DB_PATH = join(dir, 'test.db');
delete process.env.OSRM_URL;
const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const realFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = (url, init) => String(url).startsWith('https://fcm.googleapis.com/')
  ? (sent.push(String(url)), Promise.resolve(new Response(null, { status: 201 })))
  : realFetch(url, init);
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
const browserKeys = () => {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  return { p256dh: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };
};
const call = apiCaller(() => base, realFetch);
const login = (phone, password, expect) => call('/auth/login', { body: { phone, password }, expect });

try {
  const admin = await call('/auth/register', { body: { phone: '0599810001', name: 'Admin', password: 'secret1' } });
  await promote('0599810001');
  const driver = await call('/auth/register', { body: { phone: '0599810002', name: 'Driver', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const customer = await call('/auth/register', { body: { phone: '0599810003', name: 'Customer', password: 'secret1' } });
  const driverPush = 'https://fcm.googleapis.com/fcm/send/driver';
  await call('/push/subscribe', { token: driver.token, body: { endpoint: driverPush, ...browserKeys() } });

  // Approval queues exactly one push to that driver; an approve of an already-active driver queues none.
  sent.length = 0;
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  await settle();
  assert.deepEqual(sent, [driverPush], 'approval pushes the driver once');
  sent.length = 0;
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  await settle();
  assert.deepEqual(sent, [], 'a no-op approval pushes nothing');

  // Block: sessions end; the correct password now says 'blocked' and issues no session.
  await call(`/admin/users/${customer.user.id}`, { token: admin.token, body: { status: 'blocked' } });
  await call('/me', { token: customer.token, expect: 401 });
  const refused = await login('0599810003', 'secret1', 403);
  assert.equal(refused.error, 'blocked');
  assert.equal(refused.token, undefined, 'a blocked login issues no session');

  // Enumeration policy: wrong password and unknown account are indistinguishable, blocked or not.
  const wrongBlocked = await login('0599810003', 'wrong-pass', 401);
  const unknown = await login('0599810099', 'wrong-pass', 401);
  assert.deepEqual(wrongBlocked, unknown, 'a blocked account is not revealed without its password');
  assert.equal(wrongBlocked.error, 'wrong_credentials');

  // Unblock: the same person signs in again.
  await call(`/admin/users/${customer.user.id}/approve`, { token: admin.token, body: {} });
  const back = await login('0599810003', 'secret1', 200);
  assert.ok(back.token, 'an unblocked user gets a session');
  await call('/me', { token: back.token });
  console.log('Account status checks passed: approval push, blocked code, enumeration policy, unblock.');
} finally {
  globalThis.fetch = realFetch;
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
