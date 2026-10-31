// SPEC-driver-destination.md: a driver heading to a city sees and is alerted only for jobs dropping off there, for 3 hours.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid'; // T37: web push requires a configured operator subject

const dir = mkdtempSync(join(tmpdir(), 'wind-driver-destination-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
delete process.env.OSRM_URL;
const { shutdown, server, db, promote } = await import('../server/main.ts');
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
  const admin = await call('/auth/register', { body: { phone: '0599600001', name: 'Admin', password: 'secret1' } });
  await promote('0599600001');
  const customer = await call('/auth/register', { body: { phone: '0599600002', name: 'Lina', password: 'secret1' } });
  const driver = async phone => {
    const d = await call('/auth/register', { body: { phone, name: `Driver ${phone}`, password: 'secret1', role: 'driver', vehicle: 'car' } });
    await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
    await call('/push/subscribe', { token: d.token, body: { endpoint: `https://fcm.googleapis.com/fcm/send/${phone}`, ...browserKeys() } });
    return d;
  };
  const homebound = await driver('0599600003'), free = await driver('0599600004');
  const points = { ramallah: { latitude: 31.9022, longitude: 35.2063 }, nablus: { latitude: 32.2211, longitude: 35.2544 }, hebron: { latitude: 31.5326, longitude: 35.0998 } };
  const book = async to => {
    const trip = { service: 'ride', pickupCity: 'ramallah', dropoffCity: to, option: '1', pickupPoint: points.ramallah, dropoffPoint: points[to] };
    const { price } = await call('/price', { token: customer.token, body: trip });
    return call('/orders', { token: customer.token, body: { ...trip, shared: false, pickupNote: 'Manara', dropoffNote: 'Centre',
      contact: '0599600002', detail: '', pricing: 'smart', quotedPrice: price, requestId: randomUUID() } });
  };
  const jobs = async who => (await call('/jobs', { token: who.token })).map(j => j.dropoffCity).sort();

  // ---- set, validate, clear ----
  assert.equal((await call('/me', { token: homebound.token })).user.heading, null);
  await call('/driver/heading', { token: homebound.token, body: { city: 'atlantis' }, expect: 400 });
  await call('/driver/heading', { token: customer.token, body: { city: 'nablus' }, expect: 403 });
  const set = await call('/driver/heading', { token: homebound.token, body: { city: 'nablus' } });
  assert.equal(set.user.heading.city, 'nablus');
  assert.ok(Math.abs(set.user.heading.until - (Date.now() + 3 * 3_600_000)) < 60_000, 'three hours');
  assert.equal((await call('/me', { token: customer.token })).user.heading, undefined, 'customers have no heading');

  // ---- jobs and alerts follow the destination; other drivers are unaffected ----
  sent.length = 0;
  await book('hebron');
  await settle();
  assert.ok(!sent.some(u => u.endsWith('0599600003')), 'no alert for a job going the other way');
  assert.ok(sent.some(u => u.endsWith('0599600004')));
  sent.length = 0;
  await book('nablus');
  await settle();
  assert.ok(sent.some(u => u.endsWith('0599600003')), 'alerted for a job going home');
  assert.deepEqual(await jobs(homebound), ['nablus']);
  assert.deepEqual(await jobs(free), ['hebron', 'nablus']);

  // ---- expiry and clearing restore everything ----
  db.prepare('UPDATE users SET heading_until = ? WHERE id = ?').run(Date.now() - 1000, homebound.user.id);
  assert.equal((await call('/me', { token: homebound.token })).user.heading, null);
  assert.deepEqual(await jobs(homebound), ['hebron', 'nablus']);
  sent.length = 0;
  await book('hebron');
  await settle();
  assert.ok(sent.some(u => u.endsWith('0599600003')), 'an expired heading no longer filters alerts');
  await call('/driver/heading', { token: homebound.token, body: { city: 'hebron' } });
  assert.deepEqual(await jobs(homebound), ['hebron', 'hebron']);
  assert.equal((await call('/driver/heading', { token: homebound.token, body: { city: null } })).user.heading, null);
  assert.equal((await jobs(homebound)).length, 3);
  console.log('Driver destination checks passed: jobs and alerts follow the heading for 3 hours; clearing and expiry restore all jobs.');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
