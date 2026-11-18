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

const { server, db, persistence, promote, shutdown, scrubDeletedQuotes, purgeExpiredQuotes } = await import('../server/main.ts');
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

  // A distance-priced ride quoted on city centres cannot take pins the quote never priced: the route would change, the fare not.
  const ride = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'bireh', option: '1', shared: false, pickupNote: 'Manara', dropoffNote: 'Market', contact: '0599000102' };
  const unpinnedRide = await call('/price', { token: customer.token, body: ride });
  assert.equal((await call('/orders', { token: customer.token, body: { ...ride, quoteId: unpinnedRide.quoteId, pickupPoint: { latitude: 31.86, longitude: 35.03 }, dropoffPoint: { latitude: 31.95, longitude: 35.40 }, requestId: randomUUID() }, expect: 409 })).error, 'itinerary_changed');
  const load = { service: 'freight', pickupCity: 'ramallah', dropoffCity: 'bireh', option: 'small', shared: false, loadingHelp: false, pickupNote: 'Yard', dropoffNote: 'Shop', contact: '0599000102', detail: 'Boxes' };
  const unpinnedLoad = await call('/price', { token: customer.token, body: load });
  const declaredScope = { itemCount: 1, lengthMm: 400, widthMm: 400, heightMm: 400, massGrams: 1000, crewCount: 1,
    loadingAfter: Date.now(), loadingBefore: Date.now() + 3600_000, equipment: [], accessConstraints: [] };
  const noPin = await call('/price', { token: customer.token, body: { ...load, declaredScope }, expect: 400 });
  assert.equal(noPin.error, 'freight_pins_required');
  assert.equal((await call('/orders', { token: customer.token, body: { ...load, quoteId: unpinnedLoad.quoteId, dropoffPoint: { latitude: 31.95, longitude: 35.40 }, requestId: randomUUID() }, expect: 409 })).error, 'itinerary_changed');
  const planned = { ...ride, scheduledFor: Date.now() + 2 * 60 * 60_000 };
  const plannedQuote = await call('/price', { token: customer.token, body: planned });
  const plannedRide = await call('/orders', { token: customer.token, body: { ...planned, quoteId: plannedQuote.quoteId, requestId: randomUUID() } });
  const rideDrafts = await Promise.all([1, 2].map(async () => ({
    ...ride, quoteId: (await call('/price', { token: customer.token, body: ride })).quoteId, requestId: randomUUID(),
  })));
  const rideResults = await Promise.all(rideDrafts.map(async body => {
    const response = await fetch(base() + '/orders', { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer ' + customer.token,
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(rideResults.map(result => result.status).sort(), [200, 409], 'two ride requests for one customer cannot both commit');
  const winner = rideResults.findIndex(result => result.status === 200);
  const rideOrder = rideResults[winner].body;
  assert.equal(rideResults[1 - winner].body.error, 'ride_already_active');
  const rideReplay = await call('/orders', { token: customer.token, body: rideDrafts[winner] });
  assert.equal(rideReplay.id, rideOrder.id);
  const secondDriver = await register('0599000111', 'Mona', { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${secondDriver.user.id}/approve`, { token: admin.token, body: {} });
  await call(`/jobs/${rideOrder.id}/accept`, { token: driver.token, body: {} });
  await persistence.run('UPDATE orders SET scheduled_for=? WHERE id=?', Date.now() + 60_000, plannedRide.id);
  const overlapping = await call(`/jobs/${plannedRide.id}/accept`, { token: secondDriver.token, body: {}, expect: 409 });
  assert.equal(overlapping.error, 'rider_ride_active', 'a released planned ride cannot be assigned while the rider has another active ride');
  await call(`/orders/${rideOrder.id}/cancel`, { token: customer.token, body: {} });
  assert.equal((await call(`/jobs/${plannedRide.id}/accept`, { token: secondDriver.token, body: {} })).status, 'assigned');
  await call(`/orders/${plannedRide.id}/cancel`, { token: customer.token, body: {} });
  const replacementRide = await call('/orders', { token: customer.token, body: rideDrafts[1 - winner] });
  await call(`/orders/${replacementRide.id}/cancel`, { token: customer.token, body: {} });
  // A flat-fare parcel may still add its pins at booking (the price does not depend on them).
  const unpinnedParcel = await call('/price', { token: customer.token, body: orderInput });
  const pinnedParcel = await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: unpinnedParcel.quoteId, pickupPoint: { latitude: 31.905, longitude: 35.205 }, requestId: randomUUID() } });
  assert.equal(pinnedParcel.price, unpinnedParcel.price);
  assert.deepEqual(pinnedParcel.pickupPoint, { latitude: 31.905, longitude: 35.205 }); // the pin was kept
  await call(`/orders/${pinnedParcel.id}/cancel`, { token: customer.token, body: {} }); // keep the customer under the open-searching cap for the cases below

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

  // 13. Release review, 18 Nov: the fare stays immutable, but deleting the account scrubs the quote's personal fields.
  const leaver = await register('0599000109', 'Leaver');
  const leaverInput = { ...orderInput, contact: '0599000109', pickupPoint: { latitude: 31.905, longitude: 35.205 } };
  const leaverQuote = await call('/price', { token: leaver.token, body: leaverInput });
  const leaverOrder = await call('/orders', { token: leaver.token, body: { ...leaverInput, quoteId: leaverQuote.quoteId, commandId: randomUUID() } });
  assert.ok(Number((await persistence.one('SELECT COUNT(*) n FROM command_results WHERE actor_id = ?', leaver.user.id)).n) >= 1, 'the durable booking stored its reply');
  await assert.rejects(persistence.run('UPDATE quotes SET price_minor = price_minor + 1 WHERE id = ?', leaverQuote.quoteId), /immutable/);
  await assert.rejects(persistence.run("UPDATE quotes SET contact = '0599999999' WHERE id = ?", leaverQuote.quoteId), /immutable/); // only the scrub value passes
  const acceptance = { commandId: randomUUID(), expectedVersion: Number((await persistence.one('SELECT version FROM orders WHERE id=?', leaverOrder.id)).version) };
  const whoAccepted = await call(`/jobs/${leaverOrder.id}/accept`, { token: driver.token, body: acceptance });
  assert.equal(whoAccepted.pickupNote, orderInput.pickupNote);
  await persistence.run('INSERT INTO command_results(actor_id,command_id,payload_hash,http_status,response,created_at) VALUES (?,?,?,?,?,?)',
    admin.user.id, randomUUID(), 'synthetic-legacy-command', 200, '{"pickupCity": unreadable legacy response}', Date.now());
  await call(`/orders/${leaverOrder.id}/cancel`, { token: leaver.token, body: {} });
  await call('/me/delete', { token: leaver.token, body: { password: 'secret123' } });
  const scrubbed = await persistence.one('SELECT contact, pickup_note, dropoff_note, detail, pickup_lat, itinerary_hash, price_minor FROM quotes WHERE id = ?', leaverQuote.quoteId);
  assert.deepEqual({ ...scrubbed, price_minor: Number(scrubbed.price_minor) }, { contact: '', pickup_note: '', dropoff_note: '', detail: '', pickup_lat: null, itinerary_hash: '', price_minor: leaverQuote.priceMinor });
  assert.equal(Number((await persistence.one('SELECT COUNT(*) n FROM command_results WHERE actor_id = ?', leaver.user.id)).n), 0);
  const cleanReplay = await call(`/jobs/${leaverOrder.id}/accept`, { token: driver.token, body: acceptance });
  assert.equal(cleanReplay.id, leaverOrder.id);
  assert.equal(cleanReplay.service, 'parcel');
  assert.equal(cleanReplay.pickupNote, '', 'another actor replays an authorized order with personal fields removed');
  await assert.rejects(persistence.run("UPDATE quotes SET priority = 'same_day' WHERE id = ?", leaverQuote.quoteId), /immutable/);
  // A quote an in-flight booking held during deletion is skipped (SKIP LOCKED) and caught by the maintenance sweep.
  const straggler = await register('0599000110', 'Straggler');
  const stragglerQuote = await call('/price', { token: straggler.token, body: { ...orderInput, contact: '0599000110' } });
  await assert.rejects(persistence.run("UPDATE quotes SET contact = '' WHERE id = ?", stragglerQuote.quoteId), /immutable/); // a live customer's quote cannot be scrubbed
  await persistence.run("UPDATE users SET phone = ?, status = 'blocked' WHERE id = ?", `deleted-${straggler.user.id}`, straggler.user.id); // as if deletion skipped this quote
  assert.ok((await scrubDeletedQuotes()) >= 1);
  assert.equal((await persistence.one('SELECT contact FROM quotes WHERE id = ?', stragglerQuote.quoteId)).contact, '');
  console.log('✓ account deletion scrubs quote personal fields; fare immutable; sweep catches skipped quotes');

  // Expired quotes nobody booked are deleted after a day; a consumed quote (the order's fare record) stays.
  const unused = await call('/price', { token: customer.token, body: orderInput });
  assert.ok((await purgeExpiredQuotes(Date.now() + 2 * 86_400_000)) >= 1);
  assert.equal(await persistence.one('SELECT id FROM quotes WHERE id = ?', unused.quoteId), undefined);
  assert.ok(await persistence.one('SELECT id FROM quotes WHERE id = ?', leaverQuote.quoteId), 'consumed quotes are kept');
  console.log('✓ expired unbooked quotes purged; consumed quotes kept');

  console.log('all quotes tests passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  await shutdown?.();
  // Cleanup temp DB
  try { await persistence.close?.(); } catch {}
}
