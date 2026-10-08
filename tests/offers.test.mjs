// Driver offers (SPEC-driver-offers.md): smart recommended price, driver-named prices, customer choice, price rating.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOSED_MINUTES, commissionOn, defaultSettings as s, distanceKm, quote, SLOW_MINUTES, smartPrice } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-offers-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride'; // offers are for rides and freight; Souq partner orders are parcels
process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
delete process.env.OSRM_URL; // no routing here: the straight-line estimate path
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}) => call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599200001', name: 'Admin', password: 'secret1' } });
  promote('0599200001');
  const customer = await call('/auth/register', { body: { phone: '0599200002', name: 'Lina', password: 'secret1' } });
  const driver = async (phone, name) => {
    const d = await call('/auth/register', { body: { phone, name, password: 'secret1', role: 'driver', vehicle: 'car' } });
    await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
    return d;
  };
  const sami = await driver('0599200003', 'Sami'), rami = await driver('0599200004', 'Rami'), omar = await driver('0599200005', 'Omar');

  const pickupPoint = { latitude: 31.9022, longitude: 35.2063 }, dropoffPoint = { latitude: 32.2211, longitude: 35.2544 };
  const trip = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1', pickupPoint, dropoffPoint };
  const km = distanceKm(pickupPoint, dropoffPoint);
  const expected = delayMinutes => smartPrice(s, { service: 'ride', option: '1', km, minutes: Math.round(km * 1.2), delayMinutes, at: Date.now() });

  // ---- recommended price and its reasons ----
  let rec = await call('/price', { token: customer.token, body: trip });
  assert.equal(rec.estimated, true); // no OSRM in tests: straight km × 1.3 between the pins
  assert.equal(rec.km, km);
  assert.equal(rec.price, expected(0));
  await call('/price', { token: sami.token, body: trip, expect: 403 });
  await call('/price', { token: customer.token, body: { ...trip, option: 'huge' }, expect: 400 });
  // Road state from Wind's own reports: a slow checkpoint and a closed one without a position, both tied to Ramallah.
  const [surda] = await call('/admin/roads', { token: admin.token, body: { name: 'Surda', cities: ['ramallah', 'bireh'] } });
  const atara = (await call('/admin/roads', { token: admin.token, body: { name: 'Atara', cities: ['ramallah'] } })).find(r => r.name === 'Atara');
  await call(`/roads/${surda.id}/report`, { token: sami.token, body: { status: 'slow' } });
  rec = await call('/price', { token: customer.token, body: trip });
  assert.deepEqual(rec.slow, ['Surda']);
  assert.equal(rec.price, expected(SLOW_MINUTES));
  await call(`/roads/${atara.id}/report`, { token: rami.token, body: { status: 'closed' } });
  rec = await call('/price', { token: customer.token, body: trip });
  assert.deepEqual(rec.closed, ['Atara']);
  assert.equal(rec.price, expected(SLOW_MINUTES + CLOSED_MINUTES));
  assert.ok(rec.price > expected(0));

  // ---- booking at the recommendation; a moved price asks again ----
  const input = { ...trip, shared: false, pickupNote: 'Al-Manara', dropoffNote: 'Hospital', contact: '0599200002', detail: 'Box', pricing: 'smart' };
  const book = (extra = {}) => call('/orders', { token: customer.token, body: { ...input, quotedPrice: rec.price, requestId: randomUUID(), ...extra } });
  await call('/orders', { token: customer.token, body: { ...input, quotedPrice: rec.price + 1, requestId: randomUUID() }, expect: 409 });
  let order = await book();
  assert.equal(order.recommendedPrice, rec.price);
  assert.equal(order.price, rec.price);
  assert.deepEqual(order.offers, []);
  // The job card shows the km the price used (pins), not the city-centre estimate.
  assert.equal((await call('/jobs', { token: sami.token })).find(j => j.id === order.id).routeKm, rec.km);
  // ---- old apps and Souq keep the fixed tariff and cannot be offered on ----
  const legacyBody = { ...input, pricing: undefined, pickupPoint: undefined, dropoffPoint: undefined };
  const legacy = await call('/orders', { token: customer.token, body: { ...legacyBody, quotedPrice: quote(s, { ...trip, shared: false }), requestId: randomUUID() } });
  assert.equal(legacy.recommendedPrice, null);
  assert.equal(legacy.routeKm, null);
  assert.equal(legacy.offers, undefined);
  await call(`/jobs/${legacy.id}/offer`, { token: sami.token, body: { price: legacy.price }, expect: 409 });
  const partnerKey = process.env.SOUQ_PARTNER_KEY;
  const souqInput = { pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false };
  const souq = await call('/partner/orders', { partnerKey, body: { ...souqInput, pickupNote: 'Shop', dropoffNote: 'Home', contact: '0599200002', detail: 'Lamp',
    externalRef: 'l:b:r', quotedPrice: (await call('/partner/quotes', { partnerKey, body: souqInput })).price } });
  assert.equal(souq.recommendedPrice, null);
  await call(`/jobs/${souq.id}/offer`, { token: sami.token, body: { price: souq.price }, expect: 409 });
  await call(`/orders/${legacy.id}/cancel`, { token: customer.token, body: {} });
  await call(`/partner/orders/${souq.id}/cancel`, { partnerKey, body: {} });

  // ---- drivers name prices inside the band; the customer sees them cheapest first, with stats ----
  const low = Math.ceil(rec.price * 0.5), high = Math.floor(rec.price * 2);
  for (const bad of [low - 1, high + 1, 30.5, '40', null]) await call(`/jobs/${order.id}/offer`, { token: sami.token, body: { price: bad }, expect: 400 });
  await call(`/jobs/${order.id}/offer`, { token: customer.token, body: { price: rec.price }, expect: 403 });
  let mine = await call(`/jobs/${order.id}/offer`, { token: sami.token, body: { price: rec.price + 5 } });
  assert.deepEqual(mine.myOffer.price, rec.price + 5);
  mine = await call(`/jobs/${order.id}/offer`, { token: sami.token, body: { price: rec.price + 3 } }); // replaces, not adds
  await call(`/jobs/${order.id}/offer`, { token: rami.token, body: { price: rec.price - 2 } });
  assert.equal((await call('/jobs', { token: rami.token })).find(j => j.id === order.id).myOffer.price, rec.price - 2);
  order = await call(`/orders/${order.id}`, { token: customer.token });
  assert.deepEqual(order.offers.map(o => [o.name, o.price]), [['Rami', rec.price - 2], ['Sami', rec.price + 3]]);
  assert.deepEqual(Object.keys(order.offers[0]).sort(), ['createdAt', 'driverId', 'name', 'price', 'priceRating', 'rating', 'trips', 'vehicle']);
  assert.equal(order.offers[0].trips, 0);
  assert.equal((await call(`/orders/${order.id}`, { token: sami.token })).offers, undefined); // offers are the customer's

  // ---- an expired offer disappears and cannot be accepted ----
  db.prepare('UPDATE order_offers SET created_at = created_at - 11 * 60000 WHERE driver_id = ?').run(sami.user.id);
  assert.deepEqual((await call(`/orders/${order.id}`, { token: customer.token })).offers.map(o => o.name), ['Rami']);
  await call(`/orders/${order.id}/offers/${sami.user.id}/accept`, { token: customer.token, body: {}, expect: 409 });
  await call(`/orders/${order.id}/offers/${rami.user.id}/accept`, { token: sami.token, body: {}, expect: 403 });

  // ---- accepting assigns at the driver's price; a second accept loses the race ----
  await call(`/jobs/${order.id}/offer`, { token: sami.token, body: { price: rec.price } });
  const [a, b] = await Promise.all([rami, sami].map(d => fetch(`${base}/orders/${order.id}/offers/${d.user.id}/accept`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` }, body: '{}' })));
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  order = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(order.status, 'assigned');
  const [winner, paid] = order.driverId === rami.user.id ? [rami, rec.price - 2] : [sami, rec.price]; // whichever accept committed first
  assert.equal(order.price, paid);
  assert.equal(order.commission, commissionOn(paid, s.commission));
  assert.equal(order.offers, undefined);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_offers WHERE order_id = ?').get(order.id).n, 0);

  // ---- release puts the order back at the recommendation ----
  await call(`/orders/${order.id}/release`, { token: winner.token, body: {} });
  order = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(order.status, 'searching');
  assert.equal(order.price, rec.price);
  await call(`/jobs/${order.id}/offer`, { token: winner.token, body: { price: rec.price }, expect: 404 }); // released it

  // ---- a busy driver's offer is hidden and refused ----
  await call(`/jobs/${order.id}/offer`, { token: omar.token, body: { price: rec.price + 1 } });
  const other = await book();
  await call(`/jobs/${other.id}/accept`, { token: omar.token, body: {} }); // takes another job at the recommendation
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_offers WHERE driver_id = ?').get(omar.user.id).n, 0); // taking a job drops his offers
  // Backstop for any other way a driver becomes busy: a fresh offer row from a busy driver stays hidden and refused.
  db.prepare('INSERT INTO order_offers (order_id, driver_id, price, created_at) VALUES (?, ?, ?, ?)').run(order.id, omar.user.id, rec.price + 1, Date.now());
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).offers.some(o => o.name === 'Omar'), false);
  await call(`/orders/${order.id}/offers/${omar.user.id}/accept`, { token: customer.token, body: {}, expect: 409 });
  await call(`/jobs/${order.id}/offer`, { token: omar.token, body: { price: rec.price }, expect: 409 }); // busy
  await call(`/orders/${other.id}/cancel`, { token: customer.token, body: {} });
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} });

  // ---- a promo discount never exceeds a cheaper accepted price minus ₪1 ----
  await call('/admin/promos', { token: admin.token, body: { code: 'OFFER50', amount: 50, maxUses: 5, days: 30 } });
  const near = { ...input, dropoffCity: 'bireh', dropoffPoint: { latitude: 31.9106, longitude: 35.2167 } };
  const nearRec = await call('/price', { token: customer.token, body: near });
  let promo = await call('/orders', { token: customer.token, body: { ...near, quotedPrice: nearRec.price, promoCode: 'OFFER50',
    expectedDiscount: Math.min(50, nearRec.price - 1), requestId: randomUUID() } });
  const cheapest = Math.ceil(nearRec.price * 0.5);
  assert.ok(cheapest - 1 < Math.min(50, nearRec.price - 1), 'the test needs an offer below the promo');
  await call(`/jobs/${promo.id}/offer`, { token: sami.token, body: { price: cheapest } });
  promo = await call(`/orders/${promo.id}/offers/${sami.user.id}/accept`, { token: customer.token, body: {} });
  assert.equal(promo.price, cheapest);
  assert.equal(promo.discount, cheapest - 1);

  // ---- the customer rates the driver and the price separately, once each ----
  promo = await advance(sami.token, promo);
  promo = await advance(sami.token, promo);
  const code = (await call(`/orders/${promo.id}`, { token: customer.token })).handoverCode;
  promo = await advance(sami.token, promo, { code });
  assert.equal(promo.status, 'completed');
  for (const bad of [{}, { priceRating: 6 }, { rating: 0 }, { priceRating: 'x' }]) await call(`/orders/${promo.id}/rate`, { token: customer.token, body: bad, expect: 409 });
  promo = await call(`/orders/${promo.id}/rate`, { token: customer.token, body: { rating: 5 } });
  assert.deepEqual([promo.rating, promo.priceRating], [5, null]);
  promo = await call(`/orders/${promo.id}/rate`, { token: customer.token, body: { priceRating: 3 } });
  assert.deepEqual([promo.rating, promo.priceRating], [5, 3]);
  await call(`/orders/${promo.id}/rate`, { token: customer.token, body: { priceRating: 4 }, expect: 409 });
  await call(`/orders/${promo.id}/rate`, { token: customer.token, body: { rating: 4 }, expect: 409 });
  const me = await call('/me', { token: sami.token });
  assert.deepEqual([me.user.rating, me.user.priceRating, me.user.trips], [5, 3, 1]);

  console.log('Driver offers checks passed');
} finally {
  server.close();
}
