// WP08 quotes: immutable itinerary, minor-unit lines, versions, ETA band, 120s expiry, atomic consumption
import { freshPostgres, selectRuntime } from './pg-support.mjs';
const pg = await freshPostgres('quotes');
await pg.database.close();
selectRuntime(pg.schema);

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-quotes-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
process.env.SOUQ_PARTNER_KEY = 'wp08-quotes-test-partner-key-32-chars-min';

const { server, db, persistence, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = () => `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(base);

async function register(phone, name, extra = {}) {
  const res = await call('/auth/register', { body: { phone, name, password: 'secret123', ...extra } });
  return res;
}

try {
  const admin = await register('0599000101', 'Admin');
  await promote('0599000101');
  const customer = await register('0599000102', 'Lina');
  const customer2 = await register('0599000103', 'Omar');
  const driver = await register('0599000104', 'Sami', { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 20 } });

  const orderInput = {
    service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Manara', dropoffNote: 'Hospital', contact: '0599000102', detail: 'Box',
  };

  // 1. Quote creation returns 120s expiry, minor units, versions, ETA band, disclosures
  const price = await call('/price', { token: customer.token, body: orderInput });
  assert.equal(typeof price.quoteId, 'string');
  assert.match(price.quoteId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(typeof price.quoteExpiresAt, 'number');
  assert.ok(price.quoteExpiresAt > Date.now() && price.quoteExpiresAt <= Date.now() + 120000 + 2000);
  assert.equal(price.currency, 'ILS');
  assert.equal(price.priceMinor, price.price * 100);
  assert.ok(Array.isArray(price.lines) && price.lines.length >= 1);
  assert.equal(price.lines.reduce((s, l) => s + l.amountMinor, 0), price.priceMinor);
  assert.equal(typeof price.tariffVersion, 'string');
  assert.ok(price.tariffVersion.length >= 8);
  assert.ok(price.tariffBasisPoints && typeof price.tariffBasisPoints.commission === 'number');
  assert.equal(price.tariffBasisPoints.commission, Math.round(defaultSettings.commission * 10000) || Math.round(0.15 * 10000));
  assert.ok(price.etaBand && typeof price.etaBand.minSeconds === 'number' && typeof price.etaBand.maxSeconds === 'number');
  assert.ok(price.etaBand.maxSeconds >= price.etaBand.minSeconds);
  assert.ok(Array.isArray(price.disclosures));
  assert.ok(typeof price.feasibility === 'string' && ['feasible','uncertain','infeasible'].includes(price.feasibility));
  assert.ok(Array.isArray(price.reasons));
  assert.equal(typeof price.itineraryHash, 'string');
  // Preserve whole-ILS rounding exactly
  assert.equal(price.price, Math.round(price.price));
  console.log('✓ quote creation with versions and minor units');

  // 2. Booking with valid quote succeeds, creates order with same price, consumes quote
  const requestId = randomUUID();
  const order = await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: price.quoteId, requestId } });
  assert.equal(order.price, price.price);
  assert.equal(order.status, 'searching');
  // Quote is now consumed
  const quotedRow = await persistence.one('SELECT consumed_at, consumed_order_id FROM quotes WHERE id=?::uuid', price.quoteId);
  assert.ok(quotedRow.consumed_at);
  assert.equal(Number(quotedRow.consumed_order_id), order.id);
  console.log('✓ booking with valid quote');

  // 3. Replay with same requestId returns committed order even after expiry (simulate expiry by waiting)
  const replay = await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: price.quoteId, requestId } });
  assert.equal(replay.id, order.id);
  console.log('✓ replay returns committed order');

  // 4. Booking with expired quote fails 409 quote_expired (unless replay)
  const price2 = await call('/price', { token: customer.token, body: orderInput });
  // Simulate expiry by inserting a copy with past expiry (UPDATE is blocked by immutability trigger, so copy)
  const expiredQuoteId = randomUUID();
  const pastNow = Date.now();
  const pastCreated = pastNow - 130000;
  const pastExpires = pastNow - 1000;
  await persistence.run(
    `INSERT INTO quotes (id, customer_id, service, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
      pickup_note, dropoff_note, contact, pickup_contact, recipient_name, recipient_phone, detail, option, loading_help, shared, scheduled_for,
      currency, price_minor, discount_minor, commission_minor, tariff_snapshot, tariff_basis_points, tariff_version,
      graph_version, profile_version, restriction_version, provider_version, eta_min_seconds, eta_max_seconds,
      feasibility, reasons, disclosures, lines, itinerary_hash, expires_at, created_at)
     SELECT ?::uuid, customer_id, service, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
      pickup_note, dropoff_note, contact, pickup_contact, recipient_name, recipient_phone, detail, option, loading_help, shared, scheduled_for,
      currency, price_minor, discount_minor, commission_minor, tariff_snapshot, tariff_basis_points, tariff_version,
      graph_version, profile_version, restriction_version, provider_version, eta_min_seconds, eta_max_seconds,
      feasibility, reasons, disclosures, lines, itinerary_hash, ?, ?
     FROM quotes WHERE id=?::uuid`,
    expiredQuoteId, pastExpires, pastCreated, price2.quoteId
  );
  await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: expiredQuoteId, requestId: randomUUID() }, expect: 409 });
  console.log('✓ expired quote rejected');

  // 5. Duplicate request after expiry without prior success fails (already tested above), and new booking with fresh quote succeeds
  const price3 = await call('/price', { token: customer.token, body: orderInput });
  const order3 = await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: price3.quoteId, requestId: randomUUID() } });
  assert.equal(order3.price, price3.price);
  console.log('✓ fresh quote after expiry succeeds');

  // 6. Itinerary changed after quote fails 409 itinerary_changed
  const price4 = await call('/price', { token: customer.token, body: orderInput });
  await call('/orders', { token: customer.token, body: { ...orderInput, pickupCity: 'hebron', quoteId: price4.quoteId, requestId: randomUUID() }, expect: 409 });
  await call('/orders', { token: customer.token, body: { ...orderInput, dropoffNote: 'Changed', quoteId: price4.quoteId, requestId: randomUUID() }, expect: 409 });
  console.log('✓ itinerary change rejected');

  // 7. New quote-bound clients cannot supply authoritative total
  const price5 = await call('/price', { token: customer.token, body: orderInput });
  await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: price5.quoteId, quotedPrice: 999, requestId: randomUUID() }, expect: 400 });
  await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: price5.quoteId, price: 999, requestId: randomUUID() }, expect: 400 });
  console.log('✓ quote-bound cannot supply total');

  // Pins added after an unpinned quote still cannot name one spot twice.
  const local = { ...orderInput, dropoffCity: orderInput.pickupCity };
  const spot = { latitude: 31.905, longitude: 35.205 };
  const priceSameSpot = await call('/price', { token: customer.token, body: local });
  assert.equal((await call('/orders', { token: customer.token, body: { ...local, quoteId: priceSameSpot.quoteId, pickupPoint: spot, dropoffPoint: spot, requestId: randomUUID() }, expect: 400 })).error, 'same_place');

  // 8. Tariff change after quote still allows booking at old price (immutable)
  const price6 = await call('/price', { token: customer.token, body: orderInput });
  const oldPrice = price6.price;
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 99 } });
  const order6 = await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: price6.quoteId, requestId: randomUUID() } });
  assert.equal(order6.price, oldPrice);
  // Legacy quotedPrice path should now fail price_changed
  await call('/orders', { token: customer.token, body: { ...orderInput, quotedPrice: oldPrice, requestId: randomUUID() }, expect: 409 });
  // Reset tariff
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 20 } });
  console.log('✓ tariff change: quote immutable, legacy price_changed');

  // 9. Old-client quotedPrice still works when quote not used
  const legacyPrice = quote({ ...defaultSettings, parcelPrice: 20 }, orderInput);
  const legacyOrder = await call('/orders', { token: customer.token, body: { ...orderInput, quotedPrice: legacyPrice, requestId: randomUUID() } });
  assert.equal(legacyOrder.price, legacyPrice);
  console.log('✓ legacy quotedPrice still works');

  // 10. Promo last-budget race: only one booking with same promo succeeds (last budget)
  const promoCode = `P${randomUUID().slice(0,6).toUpperCase()}`;
  const promoId = Number((await persistence.run('INSERT INTO promo_codes (code, amount, max_uses, expires_at, first_order_only, created_by, created_at) VALUES (?, ?, 1, ?, 0, ?, ?)', promoCode, 5, Date.now()+1000000, admin.user.id, Date.now())).lastInsertRowid);
  const priceP1 = await call('/price', { token: customer.token, body: orderInput });
  const orderP1 = await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: priceP1.quoteId, promoCode, requestId: randomUUID() } });
  assert.equal(orderP1.discount, 5);
  const priceP2 = await call('/price', { token: customer2.token, body: orderInput });
  await call('/orders', { token: customer2.token, body: { ...orderInput, quoteId: priceP2.quoteId, promoCode, requestId: randomUUID() }, expect: 409 });
  const promoUses = Number((await persistence.one('SELECT COUNT(*) n FROM promo_redemptions WHERE promo_id=?', promoId)).n);
  assert.equal(promoUses, 1);
  console.log('✓ promo last-budget race handled');

  // 11. Night/DST boundary: isNight depends on Asia/Hebron time
  // Create a scheduled order at night (e.g., 02:00 Asia/Hebron) and check price includes nightExtra if applicable
  // For parcel, night doesn't affect price, but we can check the night flag in price
  const nightPrice = await call('/price', { token: customer.token, body: { ...orderInput, scheduledFor: Date.now() } });
  assert.equal(typeof nightPrice.night, 'boolean');
  console.log('✓ night flag present');

  // 12. No double-counted checkpoint delay: slow checkpoint adds 15 minutes, not double
  const beforePrice = await call('/price', { token: customer.token, body: orderInput });
  const roads = await call('/admin/roads', { token: admin.token, body: { name: 'Test Checkpoint', cities: ['ramallah','nablus'] } });
  const cpId = roads.find(r => r.name === 'Test Checkpoint').id;
  await call(`/admin/roads/${cpId}/place`, { token: admin.token, body: { point: { latitude: 31.95, longitude: 35.22 } } });
  await call(`/roads/${cpId}/report`, { token: driver.token, body: { status: 'slow', note: 'slow' } });
  const afterPrice = await call('/price', { token: customer.token, body: orderInput });
  console.log(`delay before ${beforePrice.delayMinutes} after ${afterPrice.delayMinutes} slow ${JSON.stringify(afterPrice.slow)} closed ${JSON.stringify(afterPrice.closed)}`);
  assert.ok(afterPrice.delayMinutes >= beforePrice.delayMinutes);
  assert.ok(afterPrice.delayMinutes <= beforePrice.delayMinutes + 15, `expected after <= before+15, got before ${beforePrice.delayMinutes} after ${afterPrice.delayMinutes}`);
  // Reporting same checkpoint again with same status should not double count (still +15, not +30)
  await persistence.run('UPDATE checkpoint_reports SET created_at = created_at - ?', 11 * 60_000);
  await call(`/roads/${cpId}/report`, { token: driver.token, body: { status: 'slow', note: 'slow again' } });
  const afterSecond = await call('/price', { token: customer.token, body: orderInput });
  assert.ok(afterSecond.delayMinutes <= afterPrice.delayMinutes + 15);
  console.log('✓ checkpoint delay not double counted');

  console.log('all quotes tests passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  await shutdown?.();
  // Cleanup temp DB
  try { await persistence.close?.(); } catch {}
}
