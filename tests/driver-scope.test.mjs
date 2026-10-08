// A driver with no vehicle on file sees and takes no jobs; the customer's internal id stays with the order's parties.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-driver-scope-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
delete process.env.OSRM_URL;
const { server, db, promote } = await import('../server/main.ts');
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

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await realFetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}

try {
  const admin = await call('/auth/register', { body: { phone: '0599400001', name: 'Admin', password: 'secret1' } });
  promote('0599400001');
  const customer = await call('/auth/register', { body: { phone: '0599400002', name: 'Maha', password: 'secret1' } });
  const customerPush = 'https://fcm.googleapis.com/fcm/send/maha';
  await call('/push/subscribe', { token: customer.token, body: { endpoint: customerPush, ...browserKeys() } });
  const driver = async phone => {
    const d = await call('/auth/register', { body: { phone, name: `Driver ${phone}`, password: 'secret1', role: 'driver', vehicle: 'car' } });
    await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
    return d;
  };
  const sami = await driver('0599400003'), legacy = await driver('0599400004');
  db.prepare('UPDATE users SET vehicle = NULL WHERE id = ?').run(legacy.user.id); // what the v3 migration leaves for unknown vehicles

  const pickupPoint = { latitude: 31.9022, longitude: 35.2063 }, dropoffPoint = { latitude: 32.2211, longitude: 35.2544 };
  const trip = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1', pickupPoint, dropoffPoint };
  const { price } = await call('/price', { token: customer.token, body: trip });
  const order = await call('/orders', { token: customer.token, body: { ...trip, shared: false, pickupNote: 'Manara', dropoffNote: 'Hospital',
    contact: '0599400002', detail: 'Bag', pricing: 'smart', quotedPrice: price, requestId: randomUUID() } });
  assert.equal(order.customerId, customer.user.id, 'the customer sees their own id');

  // ---- no vehicle: an honest refusal, never car jobs ----
  assert.equal((await call('/jobs', { token: legacy.token, expect: 409 })).error, 'no_vehicle');
  await call(`/orders/${order.id}`, { token: legacy.token, expect: 404 });
  await call(`/jobs/${order.id}/accept`, { token: legacy.token, body: {}, expect: 404 });
  await call(`/jobs/${order.id}/offer`, { token: legacy.token, body: { price }, expect: 404 });

  // ---- an eligible driver sees the job without the customer's id ----
  const [job] = await call('/jobs', { token: sami.token });
  assert.equal(job.id, order.id);
  assert.equal(job.customerId, null);
  assert.equal((await call(`/orders/${order.id}`, { token: sami.token })).customerId, null);

  // ---- the customer is still alerted for an offer and for the assignment ----
  sent.length = 0;
  await call(`/jobs/${order.id}/offer`, { token: sami.token, body: { price } });
  await settle();
  assert.ok(sent.includes(customerPush), 'offer alert reaches the customer');
  sent.length = 0;
  const taken = await call(`/jobs/${order.id}/accept`, { token: sami.token, body: {} });
  await settle();
  assert.ok(sent.includes(customerPush), 'assignment alert reaches the customer');
  assert.equal(taken.customerId, customer.user.id, 'the assigned driver may see it');
  console.log('Driver scope checks passed: no-vehicle drivers get no jobs; customer id stays with the order parties.');
} finally {
  server.close();
}
