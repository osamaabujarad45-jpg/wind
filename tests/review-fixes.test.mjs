// Regression guards for the multi-model review fixes: an offer-capped discount is restored when the
// driver releases, and party phone numbers leave the API once the contact window (live + 24h) closes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offerRange } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-review-fixes-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
delete process.env.OSRM_URL;
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const advance = (token, order, extra = {}) => call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599300001', name: 'Admin', password: 'secret1' } });
  await promote('0599300001');
  const customer = await call('/auth/register', { body: { phone: '0599300002', name: 'Lina', password: 'secret1' } });
  const driverReg = await call('/auth/register', { body: { phone: '0599300003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driverReg.user.id}/approve`, { token: admin.token, body: {} });
  const driver = driverReg;
  await call('/admin/promos', { token: admin.token, body: { code: 'FIX40', amount: 40, maxUses: 5, days: 30 } });

  // Ride at the smart price with a ₪15 code; a cheaper accepted offer caps the discount at fare-1.
  const trip = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1',
    pickupPoint: { latitude: 31.9022, longitude: 35.2063 }, dropoffPoint: { latitude: 32.2211, longitude: 35.2544 } };
  const rec = await call('/price', { token: customer.token, body: trip });
  assert.ok(rec.price > 20, `need headroom for the discount math, got ${rec.price}`);
  let order = await call('/orders', { token: customer.token, body: { ...trip, shared: false, pickupNote: 'Gate', dropoffNote: 'Door',
    contact: '0599300002', pricing: 'smart', quotedPrice: rec.price, promoCode: 'FIX40', expectedDiscount: Math.min(40, rec.price - 1), requestId: randomUUID() } });
  assert.equal(order.discount, Math.min(40, rec.price - 1));
  const cheap = offerRange(rec.price)[0]; // the cheapest offer the band allows: its fare-1 cap bites
  await call(`/jobs/${order.id}/offer`, { token: driver.token, body: { price: cheap } });
  order = await call(`/orders/${order.id}/offers/${driver.user.id}/accept`, { token: customer.token, body: {} });
  assert.equal(order.price, cheap);
  assert.equal(order.discount, cheap - 1, 'the cheaper fare caps the discount');
  await call(`/orders/${order.id}/release`, { token: driver.token, body: {} });
  order = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(order.status, 'searching');
  assert.equal(order.price, rec.price, 'release restores the recommended fare');
  assert.equal(order.discount, Math.min(40, rec.price - 1), 'release restores the discount the restored fare carries');

  // Phones are visible to the parties during the trip and gone 24h after it ends.
  const parcel = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599300002', detail: 'Box' };
  let job = await call('/orders', { token: customer.token, body: { ...parcel, requestId: randomUUID() } });
  await call(`/jobs/${job.id}/accept`, { token: driver.token, body: {} });
  job = await call(`/orders/${job.id}`, { token: driver.token });
  assert.equal(job.contact, '0599300002', 'the assigned driver sees the contact during the job');
  job = await advance(driver.token, job);
  job = await advance(driver.token, job);
  const code = (await call(`/orders/${job.id}`, { token: customer.token })).handoverCode;
  job = await advance(driver.token, job, { code });
  assert.equal(job.status, 'completed');
  const doneCustomer = await call(`/orders/${job.id}`, { token: customer.token });
  assert.ok(doneCustomer.driverPhone, 'parties keep the number right after completion');
  db.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(Date.now() - 25 * 3_600_000, job.id);
  const agedCustomer = await call(`/orders/${job.id}`, { token: customer.token });
  assert.equal(agedCustomer.driverPhone, undefined, 'the driver number leaves the API after the contact window');
  const agedDriver = await call(`/orders/${job.id}`, { token: driver.token });
  assert.equal(agedDriver.contact, null, 'the customer number leaves the API after the contact window');
  console.log('review fixes: discount restored on release; party phones expire with the contact window');
} finally { await shutdown(); }
