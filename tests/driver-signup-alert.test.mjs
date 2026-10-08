// SPEC-driver-signup-alert.md: a driver who signs up waits for approval, so active admins get an "attention" push.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-signup-alert-'));
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

try {
  const admin = await call('/auth/register', { body: { phone: '0599800001', name: 'Admin', password: 'secret1' } });
  promote('0599800001');
  const adminPush = 'https://fcm.googleapis.com/fcm/send/admin';
  await call('/push/subscribe', { token: admin.token, body: { endpoint: adminPush, ...browserKeys() } });
  const watcher = await call('/auth/register', { body: { phone: '0599800002', name: 'Customer', password: 'secret1' } });
  await call('/push/subscribe', { token: watcher.token, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/customer', ...browserKeys() } });

  sent.length = 0;
  await call('/auth/register', { body: { phone: '0599800003', name: 'Another customer', password: 'secret1' } });
  await settle();
  assert.deepEqual(sent, [], 'a customer signing up alerts nobody');

  const driver = await call('/auth/register', { body: { phone: '0599800004', name: 'New driver', password: 'secret1', role: 'driver', vehicle: 'van' } });
  await settle();
  assert.equal(driver.user.status, 'pending');
  assert.deepEqual(sent, [adminPush], 'only the admin hears about a driver waiting for approval');
  console.log('Driver signup alert checks passed: admins (only) hear about drivers waiting for approval.');
} finally {
  globalThis.fetch = realFetch;
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
