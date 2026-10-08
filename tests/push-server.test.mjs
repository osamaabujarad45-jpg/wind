// Web Push server (SPEC-web-push.md): subscriptions and events, against a mocked push service.
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-push-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
delete process.env.OSRM_URL; // smart prices from the straight-line estimate
const { server, promote, db, alertReleasedJobs } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const realFetch = globalThis.fetch;
const sent = [];
let reply = 201;
globalThis.fetch = (url, init) => String(url).startsWith('https://fcm.googleapis.com/')
  ? (sent.push({ url: String(url), headers: init.headers, body: init.body }), Promise.resolve(new Response(null, { status: reply })))
  : realFetch(url, init);
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
const b = s => Buffer.from(s, 'base64url');
const fcm = name => `https://fcm.googleapis.com/fcm/send/${name}`;

const call = apiCaller(() => base, realFetch);
const advance = (token, order, extra = {}) => call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });
const browserKeys = () => {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  return { p256dh: Buffer.concat([Buffer.from([4]), b(jwk.x), b(jwk.y)]).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };
};
// A browser whose private key the test keeps, so it can read the kind of each push it was sent (RFC 8291 §3.4).
const AUTH = Buffer.alloc(16, 7);
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
function ownBrowser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: AUTH.toString('base64url') },
    read(body) {
      const asPublic = body.subarray(21, 21 + body[20]), sealed = body.subarray(21 + body[20]);
      const ikm = hmac(hmac(AUTH, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
      const prk = hmac(body.subarray(0, 16), ikm);
      const decipher = createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16),
        hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
      decipher.setAuthTag(sealed.subarray(-16));
      const plain = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
      return JSON.parse(plain.subarray(0, -1).toString()).kind; // the last byte is the record delimiter
    },
  };
}

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

  // A courier carrying a parcel still hears about new parcels (SPEC-parcel-standard.md); scheduled orders wait for their release.
  sent.length = 0;
  const another = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('d')]);
  await call(`/orders/${another.id}/cancel`, { token: customer.token, body: {} });

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
  // Scheduled orders alert drivers once, at release; a driver dropping out tells the customer; a cancel tells the driver.
  const second = await call('/auth/register', { body: { phone: '0599150005', name: 'Eid', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${second.user.id}/approve`, { token: admin.token, body: {} });
  await call('/push/subscribe', { token: second.token, body: { endpoint: fcm('e'), ...browserKeys() } });
  await call('/push/subscribe', { token: customer.token, body: { endpoint: fcm('c'), ...browserKeys() } }); // dropped by the 410 above
  sent.length = 0;
  const later = Date.now() + 2 * 3_600_000;
  await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), scheduledFor: later } });
  await settle();
  assert.deepEqual(sent, []);
  const past = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), scheduledFor: later + 60_000 } });
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(later - 20 * 60_000, past.id); // pickup already passed by the check below
  alertReleasedJobs(later - 10 * 60_000); // 10 minutes before pickup: released
  alertReleasedJobs(later - 10 * 60_000); // once only
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('e')]);
  let mine = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  mine = await call(`/jobs/${mine.id}/accept`, { token: second.token, body: {} });
  sent.length = 0;
  await call(`/orders/${mine.id}/release`, { token: second.token, body: {} });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('c')]); // the driver who dropped it is not offered it again
  assert.equal((await call('/jobs', { token: second.token })).some(job => job.id === mine.id), false);
  await call(`/jobs/${mine.id}/accept`, { token: second.token, body: {}, expect: 404 });
  const replacement = await call('/auth/register', { body: { phone: '0599150006', name: 'Nour', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${replacement.user.id}/approve`, { token: admin.token, body: {} });
  assert.equal((await call('/jobs', { token: replacement.token })).some(job => job.id === mine.id), true);
  await call('/push/subscribe', { token: replacement.token, body: { endpoint: fcm('f'), ...browserKeys() } });
  await call(`/jobs/${mine.id}/accept`, { token: replacement.token, body: {} });
  db.prepare('DELETE FROM request_limits').run(); // exercise the second release's job-alert fan-out, not its per-customer throttle
  sent.length = 0;
  await call(`/orders/${mine.id}/release`, { token: replacement.token, body: {} });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('c')]); // every previous dropper stays excluded from push alerts too
  assert.equal((await call('/jobs', { token: second.token })).some(job => job.id === mine.id), false);
  assert.equal((await call('/jobs', { token: replacement.token })).some(job => job.id === mine.id), false);
  const finalDriver = await call('/auth/register', { body: { phone: '0599150007', name: 'Rami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${finalDriver.user.id}/approve`, { token: admin.token, body: {} });
  await call('/push/subscribe', { token: finalDriver.token, body: { endpoint: fcm('g'), ...browserKeys() } });
  await call(`/jobs/${mine.id}/accept`, { token: finalDriver.token, body: {} });
  sent.length = 0;
  await call(`/orders/${mine.id}/cancel`, { token: customer.token, body: {} });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('g')]);

  // Driver offers (SPEC-offer-alerts.md): a first offer rings the customer, a changed price does not; the chosen driver hears.
  // Offers exist for rides and freight; parcels have one standard price (SPEC-parcel-standard.md).
  const smart = await call('/orders', { token: customer.token, body: { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599150002', pricing: 'smart', requestId: randomUUID() } });
  await settle();
  sent.length = 0;
  await call(`/jobs/${smart.id}/offer`, { token: replacement.token, body: { price: smart.recommendedPrice } });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('c')]);
  assert.equal(sent[0].headers.Urgency, 'high');
  assert.equal(sent[0].headers.TTL, '600'); // offers expire after 10 minutes
  sent.length = 0;
  await call(`/jobs/${smart.id}/offer`, { token: replacement.token, body: { price: smart.recommendedPrice + 1 } });
  await settle();
  assert.deepEqual(sent, []);
  await call(`/orders/${smart.id}/offers/${replacement.user.id}/accept`, { token: customer.token, body: {} });
  await settle();
  assert.deepEqual(sent.map(s => s.url), [fcm('f')]);

  // Delivery problems (SPEC-exception-push.md): the sender hears the hold and each new state, the driver hears every decision.
  db.prepare('DELETE FROM request_limits').run(); // a fresh per-customer job-alert budget for this block
  const courier = await call('/auth/register', { body: { phone: '0599150008', name: 'Hani', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${courier.user.id}/approve`, { token: admin.token, body: {} });
  const courierBrowser = ownBrowser(), senderBrowser = ownBrowser(), adminBrowser = ownBrowser();
  const browsers = new Map([[fcm('h'), courierBrowser], [fcm('c'), senderBrowser], [fcm('a'), adminBrowser]]);
  await call('/push/subscribe', { token: courier.token, body: { endpoint: fcm('h'), ...courierBrowser.keys } });
  await call('/push/subscribe', { token: customer.token, body: { endpoint: fcm('c'), ...senderBrowser.keys } });
  await call('/push/subscribe', { token: admin.token, body: { endpoint: fcm('a'), ...adminBrowser.keys } });
  // What each push said, read with the key of the browser it went to. The recipient order inside one fan-out is not part of the contract.
  const heard = () => sent.map(s => [s.url, browsers.get(s.url).read(s.body)]);
  const sortedPairs = pairs => pairs.slice().sort((x, y) => (x[0] < y[0] ? -1 : 1));
  let parcel = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  parcel = await call(`/jobs/${parcel.id}/accept`, { token: courier.token, body: {} });
  parcel = await advance(courier.token, parcel);
  parcel = await advance(courier.token, parcel);
  assert.equal(parcel.status, 'in_transit');
  sent.length = 0;
  const report = { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent' };
  const resolve = (action, reason) => call(`/admin/orders/${parcel.id}/resolve`, { token: admin.token, body: { action, reason } });
  await call(`/orders/${parcel.id}/exception`, { token: courier.token, body: report });
  await settle();
  assert.deepEqual(heard(), [[fcm('c'), 'on_hold'], [fcm('a'), 'attention']]);
  sent.length = 0;
  await call(`/orders/${parcel.id}/exception`, { token: courier.token, body: report }); // a replayed report queues nothing
  await settle();
  assert.deepEqual(sent, []);
  await resolve('reattempt', 'Recipient called back');
  await settle();
  assert.deepEqual(heard(), [[fcm('h'), 'decided'], [fcm('c'), 'in_transit']]);
  sent.length = 0;
  await call(`/orders/${parcel.id}/exception`, { token: courier.token, body: { ...report, requestId: randomUUID(), reason: 'refused' } });
  sent.length = 0;
  await resolve('return', 'Recipient refused the parcel');
  await settle();
  assert.deepEqual(heard(), [[fcm('h'), 'decided'], [fcm('c'), 'returning']]);
  sent.length = 0;
  await resolve('confirm_return', 'Sender handed it back at the shop');
  await settle();
  assert.deepEqual(heard(), [[fcm('h'), 'decided'], [fcm('c'), 'returned']]);
  // Support, money, safety and plans (SPEC-notification-audit.md): each change someone waits on reaches that person.
  const newcomer = await call('/auth/register', { body: { phone: '0599150009', name: 'Yara', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const newcomerBrowser = ownBrowser();
  browsers.set(fcm('y'), newcomerBrowser);
  await call('/push/subscribe', { token: newcomer.token, body: { endpoint: fcm('y'), ...newcomerBrowser.keys } });
  sent.length = 0;
  await call(`/admin/users/${newcomer.user.id}/approve`, { token: admin.token, body: {} });
  await settle();
  assert.deepEqual(heard(), [[fcm('y'), 'approved']]);
  sent.length = 0;
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: newcomer.user.id, amountCents: 500, reason: 'Fuel receipt not logged' } });
  await settle();
  assert.deepEqual(heard(), [[fcm('y'), 'cash']]);
  sent.length = 0;
  const remittance = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: newcomer.user.id, amountCents: 200 } });
  await settle();
  assert.deepEqual(heard(), [[fcm('y'), 'cash']]);
  sent.length = 0;
  await call(`/driver/cash/${remittance.id}/confirm`, { token: newcomer.token, body: { decision: 'dispute' } });
  await settle();
  assert.deepEqual(heard(), [[fcm('a'), 'attention']]); // the admin who recorded the remittance decides
  sent.length = 0;
  await call(`/orders/${parcel.id}/dispute`, { token: customer.token, body: { reason: 'The parcel arrived damaged' } });
  await settle();
  assert.deepEqual(heard(), [[fcm('a'), 'attention']]);
  const dispute = (await call('/admin/disputes', { token: admin.token })).find(d => d.orderId === parcel.id);
  sent.length = 0;
  await call(`/admin/disputes/${dispute.id}/resolve`, { token: admin.token, body: { resolution: 'Refunded in full by the sender' } });
  await settle();
  assert.deepEqual(heard(), [[fcm('c'), 'support']]);
  let safe = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  safe = await call(`/jobs/${safe.id}/accept`, { token: courier.token, body: {} });
  safe = await advance(courier.token, safe);
  safe = await advance(courier.token, safe);
  sent.length = 0;
  await call(`/orders/${safe.id}/sos`, { token: customer.token, body: { kind: 'threat', note: 'Someone is following' } });
  await settle();
  assert.deepEqual(heard(), [[fcm('a'), 'safety']]);
  const incident = (await call('/admin/incidents', { token: admin.token })).find(i => i.orderId === safe.id);
  sent.length = 0;
  await call(`/admin/incidents/${incident.id}/resolve`, { token: admin.token, body: { resolution: 'Checked with both parties' } });
  await settle();
  assert.deepEqual(sortedPairs(heard()), sortedPairs([[fcm('c'), 'support'], [fcm('h'), 'support']])); // the freeze lifts for the driver too
  let locked = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  locked = await call(`/jobs/${locked.id}/accept`, { token: courier.token, body: {} });
  locked = await advance(courier.token, locked);
  locked = await advance(courier.token, locked);
  sent.length = 0;
  for (let miss = 0; miss < 5; miss += 1)
    await call(`/orders/${locked.id}/advance`, { token: courier.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), code: '0000' }, expect: 400 });
  await settle();
  assert.deepEqual(heard(), [[fcm('a'), 'attention']]); // only the fifth wrong code reaches support
  sent.length = 0;
  await call(`/admin/orders/${locked.id}/proof-reset`, { token: admin.token, body: { reason: 'Driver read the code wrongly' } });
  await settle();
  assert.deepEqual(heard(), [[fcm('h'), 'support']]);
  const waiting = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } }); // before the plan changes the price
  sent.length = 0;
  await call('/subscriptions', { token: customer.token, body: {} });
  await settle();
  assert.deepEqual(heard(), [[fcm('a'), 'attention']]);
  const request = db.prepare("SELECT id FROM subscriptions WHERE user_id = ? AND status = 'pending'").get(customer.user.id);
  sent.length = 0;
  await call(`/admin/subscriptions/${request.id}`, { token: admin.token, body: { action: 'activate' } });
  await settle();
  assert.deepEqual(heard(), [[fcm('c'), 'plan']]);
  sent.length = 0;
  await call(`/orders/${waiting.id}/cancel`, { token: admin.token, body: {} });
  await settle();
  assert.deepEqual(heard(), [[fcm('c'), 'cancelled']]); // support cancelled it for the sender

  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  for (const kind of ['on_hold', 'returning', 'decided', 'approved', 'support', 'cash', 'attention', 'safety', 'plan'])
    assert.equal(sw.split(`${kind}:`).length - 1, 2, `${kind} needs Arabic and English words`);

  // Logging out ends every session, so every browser of that account stops alerting.
  await call('/auth/logout', { token: customer.token, body: {} });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?').get(customer.user.id).n, 0);
  console.log('push server: ok');
} finally {
  server.close();
  globalThis.fetch = realFetch;
}
