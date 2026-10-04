// Web Push server (SPEC-web-push.md): subscriptions and events, against a mocked push service.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-push-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const realFetch = globalThis.fetch;
const sent = [];
let reply = 201;
globalThis.fetch = (url, init) => String(url).startsWith('https://fcm.googleapis.com/')
  ? (sent.push({ url: String(url), headers: init.headers }), Promise.resolve(new Response(null, { status: reply })))
  : realFetch(url, init);
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
const b = s => Buffer.from(s, 'base64url');
const fcm = name => `https://fcm.googleapis.com/fcm/send/${name}`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await realFetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}
const advance = (token, order, extra = {}) => call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });
const browserKeys = () => {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  return { p256dh: Buffer.concat([Buffer.from([4]), b(jwk.x), b(jwk.y)]).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };
};

try {
  const admin = await call('/auth/register', { body: { phone: '0599150001', name: 'Admin', password: 'secret1' } });
  promote('0599150001');
  const customer = await call('/auth/register', { body: { phone: '0599150002', name: 'Rana', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599150003', name: 'Omar', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const truck = await call('/auth/register', { body: { phone: '0599150004', name: 'Truck', password: 'secret1', role: 'driver', vehicle: 'truck' } });
  for (const d of [driver, truck]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });

  const { key } = await call('/push/key');
  assert.equal(b(key).length, 65);
  assert.equal((await call('/push/key')).key, key); // stable across requests
  for (const bad of [{ endpoint: 'https://evil.com/x', ...browserKeys() }, { endpoint: fcm('c'), p256dh: 'AAAA', auth: browserKeys().auth },
    { endpoint: fcm('c'), p256dh: browserKeys().p256dh, auth: 'AA' }])
    await call('/push/subscribe', { token: customer.token, body: bad, expect: 400 });
  await call('/push/subscribe', { body: { endpoint: fcm('c'), ...browserKeys() }, expect: 401 });
  for (const [who, name] of [[customer, 'c'], [driver, 'd'], [truck, 't']])
    await call('/push/subscribe', { token: who.token, body: { endpoint: fcm(name), ...browserKeys(), lang: 'en' } });

  // A new job reaches the free car driver only (trucks cannot take parcels); encrypted, signed and urgent.
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599150002', detail: 'Box' };
  let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('d')]);
  assert.equal(sent[0].headers.Urgency, 'high');
  assert.match(sent[0].headers.Authorization, /^vapid t=.+, k=/);
  assert.equal(sent[0].headers['Content-Encoding'], 'aes128gcm');

  // A refused request notifies nobody: pushes leave only after the work committed.
  sent.length = 0;
  await call('/orders', { token: customer.token, body: { ...input, quotedPrice: 1 }, expect: 409 });
  await settle();
  assert.deepEqual(sent, []);

  // Status changes and chat reach the other party.
  order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('c')]);
  sent.length = 0;
  await call(`/orders/${order.id}/messages`, { token: customer.token, body: { body: 'At the gate' } });
  order = await advance(driver.token, order);
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('d'), fcm('c')]);

  // 410 Gone removes the subscription; unsubscribe stops pushes.
  sent.length = 0; reply = 410;
  await call(`/orders/${order.id}/messages`, { token: driver.token, body: { body: 'Coming' } });
  await settle();
  reply = 201; sent.length = 0;
  await call(`/orders/${order.id}/messages`, { token: driver.token, body: { body: 'Here now' } });
  await settle();
  assert.deepEqual(sent, []);
  await call('/push/unsubscribe', { token: driver.token, body: { endpoint: fcm('d') } });
  await call(`/orders/${order.id}/messages`, { token: customer.token, body: { body: 'Ok' } });
  await settle();
  assert.deepEqual(sent, []);
  console.log('push server: ok');
} finally {
  server.close();
  globalThis.fetch = realFetch;
}
