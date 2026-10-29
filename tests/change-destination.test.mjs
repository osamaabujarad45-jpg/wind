import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid'; // T37: web push requires a configured operator subject

const dir = mkdtempSync(join(tmpdir(), 'wind-destination-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { db, shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const realFetch = globalThis.fetch;
const sends = [];
globalThis.fetch = (url, init) => String(url).startsWith('https://fcm.googleapis.com/')
  ? (sends.push({ url: String(url), body: init.body, headers: init.headers }), Promise.resolve(new Response(null, { status: 201 })))
  : realFetch(url, init);
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, realFetch);
const auth = Buffer.alloc(16, 7), ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
function readPush(body) {
  const publicKey = body.subarray(21, 21 + body[20]), sealed = body.subarray(21 + body[20]);
  const ikm = hmac(hmac(auth, ecdh.computeSecret(publicKey)), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), publicKey, Buffer.from([1])]));
  const prk = hmac(body.subarray(0, 16), ikm);
  const decipher = createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(-16));
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  return JSON.parse(plain.subarray(0, -1).toString());
}
const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
  pickupNote: 'Pickup', dropoffNote: 'Old address', contact: '0599300012', detail: 'Box' };

try {
  const admin = await call('/auth/register', { body: { phone: '0599300011', name: 'Admin', password: 'secret1' } });
  await promote('0599300011');
  const customer = await call('/auth/register', { body: { phone: '0599300012', name: 'Customer', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599300013', name: 'Driver', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const other = await call('/auth/register', { body: { phone: '0599300014', name: 'Other', password: 'secret1', role: 'driver', vehicle: 'car' } });
  for (const d of [driver, other]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
  const book = () => call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  const post = (id, action, token, body, expect) => call(`/orders/${id}/destination/${action}`, { token, body, ...(expect && { expect }) });
  let order = await book();
  order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.equal(order.price, 20);
  assert.equal(order.commission, 3);
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 34, commission: 0.3 } });
  const request = { city: 'hebron', note: 'New address', point: { latitude: 31.5326, longitude: 35.0998 } };
  const roads = await call('/admin/roads', { token: admin.token, body: { name: 'Hebron checkpoint', cities: ['hebron'] } });
  await call(`/roads/${roads.find(road => road.name === 'Hebron checkpoint').id}/report`, { token: driver.token, body: { status: 'slow' } });
  await post(order.id, 'quote', other.token, request, 403);
  const proposal = await post(order.id, 'quote', customer.token, request);
  assert.equal(proposal.price, 34);
  assert.equal(proposal.commission, 5.1); // 15% at assignment, not today's 30%
  assert.equal(proposal.oldPrice, 20);
  assert.deepEqual(proposal.road.slow, ['Hebron checkpoint']);
  const before = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(before.dropoffCity, 'nablus');
  // Uber parity: no subscription gates the request; the polled in-app card delivers it and push stays best-effort.
  sends.length = 0;
  const unpushed = await post(order.id, 'propose', customer.token, { id: proposal.id });
  assert.equal(sends.length, 0);
  assert.equal(unpushed.destinationChange.price, 34);
  await post(order.id, 'withdraw', customer.token, { id: proposal.id });
  await call('/push/subscribe', { token: driver.token, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/destination-test',
    p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url'), lang: 'en' } });
  sends.length = 0;
  const requoted = await post(order.id, 'quote', customer.token, request);
  const pending = await post(order.id, 'propose', customer.token, { id: requoted.id });
  assert.equal(sends.length, 1);
  assert.equal(readPush(sends[0].body).kind, 'destination_request');
  assert.equal(sends[0].headers.Urgency, 'high');
  assert.equal(pending.price, 20);
  assert.equal(pending.destinationChange.price, 34);
  assert.equal((await post(order.id, 'propose', customer.token, { id: requoted.id })).destinationChange.id, requoted.id);
  await post(order.id, 'decision', other.token, { id: requoted.id, decision: 'accept' }, 404);
  const accepted = await post(order.id, 'decision', driver.token, { id: requoted.id, decision: 'accept' });
  assert.equal(accepted.dropoffCity, 'hebron');
  assert.deepEqual(accepted.dropoffPoint, request.point);
  assert.equal(accepted.price, 34);
  assert.equal(accepted.commission, 5.1);
  assert.equal((await post(order.id, 'decision', driver.token, { id: requoted.id, decision: 'accept' })).price, 34);
  await post(order.id, 'decision', driver.token, { id: requoted.id, decision: 'decline' }, 409);
  for (const status of ['assigned', 'at_pickup', 'in_transit']) {
    const customerOrder = await call(`/orders/${order.id}`, { token: customer.token });
    order = await call(`/orders/${order.id}/advance`, { token: driver.token, body: { expectedStatus: status, requestId: randomUUID(),
      ...(status === 'in_transit' && { code: customerOrder.handoverCode }) } });
  }
  const cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.commissionCents, 510);
  assert.equal(cash.owedCents, 510);

  // A decline leaves the original agreement, and a progress race invalidates consent.
  const nextInput = { ...input, quotedPrice: 34 };
  let next = await call('/orders', { token: customer.token, body: nextInput });
  next = await call(`/jobs/${next.id}/accept`, { token: driver.token, body: {} });
  const declinedQuote = await post(next.id, 'quote', customer.token, { city: 'hebron', note: 'Second address' });
  await post(next.id, 'propose', customer.token, { id: declinedQuote.id });
  await post(next.id, 'decision', driver.token, { id: declinedQuote.id, decision: 'decline' });
  await post(next.id, 'decision', driver.token, { id: declinedQuote.id, decision: 'decline' });
  assert.equal((await call(`/orders/${next.id}`, { token: customer.token })).dropoffCity, 'nablus');
  const withdrawn = await post(next.id, 'quote', customer.token, { city: 'hebron', note: 'Withdraw this' });
  await post(next.id, 'propose', customer.token, { id: withdrawn.id });
  await post(next.id, 'withdraw', customer.token, { id: withdrawn.id });
  await post(next.id, 'decision', driver.token, { id: withdrawn.id, decision: 'accept' }, 409);
  const expired = await post(next.id, 'quote', customer.token, { city: 'hebron', note: 'Expired proposal' });
  await post(next.id, 'propose', customer.token, { id: expired.id });
  db.prepare('UPDATE destination_changes SET expires_at = ? WHERE id = ?').run(Date.now() - 1, expired.id);
  await post(next.id, 'decision', driver.token, { id: expired.id, decision: 'accept' }, 409);
  const staleQuote = await post(next.id, 'quote', customer.token, { city: 'hebron', note: 'Third address' });
  await post(next.id, 'propose', customer.token, { id: staleQuote.id });
  await call(`/orders/${next.id}/advance`, { token: driver.token, body: { expectedStatus: 'assigned', requestId: randomUUID() } });
  await post(next.id, 'decision', driver.token, { id: staleQuote.id, decision: 'accept' }, 409);
  assert.equal((await call(`/orders/${next.id}`, { token: customer.token })).dropoffCity, 'nablus');

  // Existing assignments with no historical rate fail closed rather than invent one.
  db.prepare('UPDATE orders SET commission_rate = NULL WHERE id = ?').run(next.id);
  await post(next.id, 'quote', customer.token, { city: 'hebron', note: 'Legacy' }, 409);

  // A lower fare clips the redeemed discount, and the completed cash balance uses both new snapshots.
  await call('/admin/promos', { token: admin.token, body: { code: 'LESS33', amount: 33, maxUses: 3, days: 7 } });
  let discounted = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: 34, promoCode: 'LESS33', expectedDiscount: 33 } });
  discounted = await call(`/jobs/${discounted.id}/accept`, { token: driver.token, body: {} });
  // The public link is what family and the ETA page read: it must follow the accepted destination and never the old one.
  const share = await call(`/orders/${discounted.id}/share`, { token: customer.token, body: {} });
  assert.equal((await call(share.path)).dropoffCity, 'nablus');
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 20 } });
  const cheaper = await post(discounted.id, 'quote', customer.token, { city: 'hebron', note: 'Cheaper destination' });
  assert.equal(cheaper.discount, 19);
  assert.equal(cheaper.price - cheaper.discount, 1);
  assert.equal(cheaper.commission, 6);
  await post(discounted.id, 'propose', customer.token, { id: cheaper.id });
  discounted = await post(discounted.id, 'decision', driver.token, { id: cheaper.id, decision: 'accept' });
  assert.equal((await call(share.path)).dropoffCity, 'hebron');
  assert.equal((await call(`${share.path}/eta`)).minutes, null); // no fresh fix, so no minutes: never the old route
  for (const status of ['assigned', 'at_pickup', 'in_transit']) {
    const customerOrder = await call(`/orders/${discounted.id}`, { token: customer.token });
    discounted = await call(`/orders/${discounted.id}/advance`, { token: driver.token, body: { expectedStatus: status, requestId: randomUUID(),
      ...(status === 'in_transit' && { code: customerOrder.handoverCode }) } });
  }
  const afterDiscount = await call('/driver/cash', { token: driver.token });
  assert.equal(afterDiscount.commissionCents, 1110);
  assert.equal(afterDiscount.discountsCents, 1900);
  assert.equal(afterDiscount.owedCents, -790);

  // Erasing the customer removes proposal addresses and the original snapshots too.
  await call(`/orders/${next.id}/cancel`, { token: customer.token, body: {} });
  await call('/me/delete', { token: customer.token, body: {} });
  for (const row of db.prepare('SELECT original, dropoff_note, dropoff_lat, dropoff_lng FROM destination_changes WHERE customer_id = ?').all(customer.user.id)) {
    assert.deepEqual([row.original, row.dropoff_note, row.dropoff_lat, row.dropoff_lng], ['[]', '', null, null]);
  }
  console.log('Destination changes: consent, assignment rate, atomic cash, retries and stale orders passed');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
  globalThis.fetch = realFetch;
}
