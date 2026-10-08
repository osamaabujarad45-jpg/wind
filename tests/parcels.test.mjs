// SPEC-parcel-standard.md: ₪20 standard parcels, couriers carry many, rides and freight stay exclusive.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-parcels-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
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
const fcm = name => `https://fcm.googleapis.com/fcm/send/${name}`;
const browserKeys = () => {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  return { p256dh: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };
};

const call = apiCaller(() => base, realFetch);

try {
  const admin = await call('/auth/register', { body: { phone: '0599300001', name: 'Admin', password: 'secret1' } });
  promote('0599300001');
  const customer = await call('/auth/register', { body: { phone: '0599300002', name: 'Huda', password: 'secret1' } });
  const driver = async (phone, name) => {
    const d = await call('/auth/register', { body: { phone, name, password: 'secret1', role: 'driver', vehicle: 'car' } });
    await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
    return d;
  };
  const courier = await driver('0599300003', 'Courier'), taxi = await driver('0599300004', 'Taxi');
  for (const [d, name] of [[courier, 'courier'], [taxi, 'taxi']]) await call('/push/subscribe', { token: d.token, body: { endpoint: fcm(name), ...browserKeys() } });

  // ---- one standard price for every parcel, wherever it goes ----
  const parcel = { service: 'parcel', option: 'small', shared: false, pickupNote: 'Shop', dropoffNote: 'Home', contact: '0599300002', detail: 'Box' };
  const far = { ...parcel, pickupCity: 'hebron', dropoffCity: 'jenin' }, near = { ...parcel, pickupCity: 'ramallah', dropoffCity: 'bireh' };
  const quoteFar = await call('/price', { token: customer.token, body: far });
  assert.equal(quoteFar.price, 20);
  assert.equal(quoteFar.standard, true);
  assert.equal((await call('/price', { token: customer.token, body: { ...near, option: 'large' } })).price, 30);
  const partnerKey = process.env.SOUQ_PARTNER_KEY;
  assert.equal((await call('/partner/quotes', { partnerKey, body: { pickupCity: 'hebron', dropoffCity: 'jenin', option: 'small', shared: false } })).price, 20);
  const book = input => call('/orders', { token: customer.token, body: { ...input, pricing: 'smart', quotedPrice: 20, requestId: randomUUID() } });
  const orders = [await book(far), await book(near), await book(near)];
  for (const o of orders) { assert.equal(o.price, 20); assert.equal(o.recommendedPrice, null); }
  await call(`/jobs/${orders[0].id}/offer`, { token: courier.token, body: { price: 25 }, expect: 409 }); // fixed price: Accept only

  // ---- a courier stacks parcels and keeps sharing one location ----
  await call(`/jobs/${orders[0].id}/accept`, { token: courier.token, body: {} });
  await call('/location', { token: courier.token, body: { latitude: 31.53, longitude: 35.1, accuracy: 20 } });
  await call(`/jobs/${orders[1].id}/accept`, { token: courier.token, body: {} });
  assert.ok((await call(`/orders/${orders[0].id}`, { token: customer.token })).driverLocation, 'the first parcel keeps the live location');
  await call(`/jobs/${orders[2].id}/accept`, { token: courier.token, body: {} });
  const carried = (await call('/orders', { token: courier.token })).filter(o => o.driverId === courier.user.id && o.status === 'assigned');
  assert.equal(carried.length, 3);

  // ---- a multi-parcel run gives no straight-to-you ETA (SPEC-courier-run-eta.md) ----
  for (const o of orders) assert.equal((await call(`/orders/${o.id}`, { token: customer.token })).sharedRun, true);
  const { token: shareToken } = await call(`/orders/${orders[0].id}/share`, { token: customer.token, body: {} });
  const runEta = await call(`/track/${shareToken}/eta`);
  assert.equal(runEta.minutes, null);
  assert.equal(runEta.sharedRun, true);
  assert.equal(runEta.approach, undefined); // no straight line to this stop
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id IN (?, ?)").run(orders[1].id, orders[2].id);
  assert.equal((await call(`/orders/${orders[0].id}`, { token: customer.token })).sharedRun, false); // last stop: normal ETA again
  const lastEta = await (await realFetch(`${base}/track/${shareToken}/eta`)).json();
  assert.equal(lastEta.sharedRun, undefined); // routed like a single job (no OSRM in this test, so no minutes either)
  assert.equal((await call(`/orders/${orders[1].id}`, { token: customer.token })).sharedRun, false); // finished orders never say it
  db.prepare("UPDATE orders SET status = 'assigned' WHERE id IN (?, ?)").run(orders[1].id, orders[2].id);

  // ---- rides are exclusive both ways ----
  const ride = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1', shared: false, pickupNote: 'Gate', dropoffNote: 'Square', contact: '0599300002' };
  const rideOrder = await call('/orders', { token: customer.token, body: { ...ride, requestId: randomUUID() } });
  await call(`/jobs/${rideOrder.id}/accept`, { token: courier.token, body: {}, expect: 409 }); // carrying parcels
  await call(`/jobs/${rideOrder.id}/accept`, { token: taxi.token, body: {} });
  assert.equal((await call(`/orders/${rideOrder.id}`, { token: customer.token })).sharedRun, false); // one job: unchanged
  db.prepare('DELETE FROM request_limits').run();
  sent.length = 0;
  const fourth = await book(near);
  await settle();
  assert.deepEqual(sent, [fcm('courier')]); // a new parcel reaches the courier, not the busy taxi
  await call(`/jobs/${fourth.id}/accept`, { token: taxi.token, body: {}, expect: 409 }); // carrying a passenger
  await call(`/jobs/${fourth.id}/accept`, { token: courier.token, body: {} });

  // ---- the load limit ----
  const { PARCEL_LOAD } = await import('../src/model.ts');
  const filler = db.prepare(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, driver_id, created_at, updated_at)
    VALUES (?, 'parcel', 0, 'ramallah', 'bireh', 'a', 'b', '0599300002', '0599300002', 'x', 'small', 0, 20, 'assigned', ?, 1, 1)`);
  for (let i = 4; i < PARCEL_LOAD; i++) filler.run(customer.user.id, courier.user.id);
  const over = await book(near);
  await call(`/jobs/${over.id}/accept`, { token: courier.token, body: {}, expect: 409 });
  console.log('parcels: ok');
} finally {
  server.close();
  globalThis.fetch = realFetch;
}
