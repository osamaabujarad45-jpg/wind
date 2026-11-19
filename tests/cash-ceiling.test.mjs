// ADM-12 / owner decision D-1: no order may collect more cash at the door than the per-order ceiling (default ₪500).
// Every path that sets the customer's price checks it: the price screen, booking, a driver's own offer, accepting that
// offer, the partner quote, and a destination change.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, offerRange, overCashCeiling, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid'; // T37: web push requires a configured operator subject

const dir = mkdtempSync(join(tmpdir(), 'wind-cash-ceiling-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
process.env.SOUQ_PARTNER_KEY = 'k'.repeat(40);
delete process.env.OSRM_URL;
const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const refused = async (path, options) => assert.equal((await call(path, { ...options, expect: 409 })).error, 'over_cash_ceiling', path);

try {
  // ---- the rule itself ----
  assert.equal(defaultSettings.orderCashCeiling, 500, 'D-1 default');
  assert.equal(overCashCeiling({ orderCashCeiling: 500 }, 500), false, 'the ceiling itself is allowed');
  assert.equal(overCashCeiling({ orderCashCeiling: 500 }, 501), true);

  const admin = await call('/auth/register', { body: { phone: '0599410001', name: 'Admin', password: 'secret1' } });
  await promote('0599410001');
  admin.token = (await call('/auth/login', { body: { phone: '0599410001', password: 'secret1' } })).token;
  const customer = await call('/auth/register', { body: { phone: '0599410002', name: 'Maha', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599410003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const ceiling = value => call('/admin/settings', { token: admin.token, body: { orderCashCeiling: value } });

  // ---- the setting: shown to the app, stored, bounded like every other setting ----
  assert.equal((await call('/me', { token: customer.token })).settings.orderCashCeiling, 500);
  assert.equal((await call('/admin/settings', { token: admin.token, body: { orderCashCeiling: 0 }, expect: 400 })).error, 'invalid_setting:orderCashCeiling');
  assert.equal((await call('/admin/settings', { token: admin.token, body: { orderCashCeiling: 10001 }, expect: 400 })).error, 'invalid_setting:orderCashCeiling');
  await call('/admin/settings', { token: customer.token, body: { orderCashCeiling: 100 }, expect: 403 });

  // ---- a parcel at the fixed tariff: booking is refused above the ceiling, allowed at it ----
  const parcel = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599410002', detail: 'Box' };
  const parcelPrice = quote(defaultSettings, parcel);
  await ceiling(parcelPrice - 1);
  await refused('/orders', { token: customer.token, body: { ...parcel, quotedPrice: parcelPrice } });
  await refused('/partner/quotes', { partnerKey: process.env.SOUQ_PARTNER_KEY, body: { pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small' } });
  assert.equal((await call('/orders', { token: customer.token })).length, 0, 'a refused booking leaves no order');
  await ceiling(parcelPrice);
  const booked = await call('/orders', { token: customer.token, body: { ...parcel, quotedPrice: parcelPrice } });
  assert.equal(booked.price, parcelPrice);
  await call(`/orders/${booked.id}/cancel`, { token: customer.token, body: {} });

  // ---- a smart-priced ride: the price screen says so before anyone commits ----
  const trip = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1',
    pickupPoint: { latitude: 31.9022, longitude: 35.2063 }, dropoffPoint: { latitude: 32.2211, longitude: 35.2544 } };
  await ceiling(500);
  const { price } = await call('/price', { token: customer.token, body: trip });
  const ride = { ...trip, shared: false, pickupNote: 'Manara', dropoffNote: 'Hospital', contact: '0599410002', detail: '', pricing: 'smart', quotedPrice: price };
  await ceiling(price - 1);
  await refused('/price', { token: customer.token, body: trip });
  await refused('/orders', { token: customer.token, body: { ...ride, requestId: randomUUID() } });
  await ceiling(price);
  const order = await call('/orders', { token: customer.token, body: { ...ride, requestId: randomUUID() } });

  // ---- a driver's own price may not pass the ceiling, and a ceiling lowered after the offer stops its acceptance ----
  const [, max] = offerRange(price);
  assert.ok(max > price, 'the offer band reaches above the ceiling');
  await refused(`/jobs/${order.id}/offer`, { token: driver.token, body: { price: max } });
  await call(`/jobs/${order.id}/offer`, { token: driver.token, body: { price } });
  await ceiling(price - 1);
  await refused(`/orders/${order.id}/offers/${driver.user.id}/accept`, { token: customer.token, body: {} });
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).status, 'searching', 'a refused accept assigns nobody');
  await ceiling(price);
  const assigned = await call(`/orders/${order.id}/offers/${driver.user.id}/accept`, { token: customer.token, body: {} });
  assert.equal(assigned.status, 'assigned');

  // ---- a destination change: refused at the quote above the ceiling, and at the driver's accept if lowered meanwhile ----
  const post = (action, token, body, expect) => call(`/orders/${order.id}/destination/${action}`, { token, body, expect });
  await ceiling(500);
  const further = { city: 'jenin', note: 'Further away' };
  const proposal = await post('quote', customer.token, further);
  assert.ok(proposal.price > price, 'the new destination costs more');
  await ceiling(proposal.price - 1);
  await refused(`/orders/${order.id}/destination/quote`, { token: customer.token, body: further });
  await ceiling(500);
  const requoted = await post('quote', customer.token, further);
  await post('propose', customer.token, { id: requoted.id });
  await ceiling(requoted.price - 1);
  await refused(`/orders/${order.id}/destination/decision`, { token: driver.token, body: { id: requoted.id, decision: 'accept' } });
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).dropoffCity, 'nablus', 'the refused change left the agreed destination');
  await post('decision', driver.token, { id: requoted.id, decision: 'decline' }); // a decline is always allowed
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).price, price, 'the agreed fare stands');

  console.log('Per-order cash ceiling (ADM-12): setting bounds, booking, price screen, partner quote, driver offer and its accept, destination quote and accept passed');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
