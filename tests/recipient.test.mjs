// SPEC-parcel-recipient.md: a parcel's recipient name and phone reach the customer, assigned driver and admin only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-recipient-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
delete process.env.OSRM_URL;
const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);

try {
  const admin = await call('/auth/register', { body: { phone: '0599700001', name: 'Admin', password: 'secret1' } });
  await promote('0599700001');
  const shop = await call('/auth/register', { body: { phone: '0599700002', name: 'Shop', password: 'secret1' } });
  const driver = async phone => {
    const d = await call('/auth/register', { body: { phone, name: `Driver ${phone}`, password: 'secret1', role: 'driver', vehicle: 'car' } });
    await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
    return d;
  };
  const sami = await driver('0599700003'), rami = await driver('0599700004');
  const parcel = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupPoint: { latitude: 31.9022, longitude: 35.2063 }, pickupNote: 'Shop', dropoffNote: 'Square', contact: '0599700002', detail: 'Shoes' };
  const book = async (extra, expect = 200) => {
    const { price } = await call('/price', { token: shop.token, body: { ...parcel, ...extra } });
    return call('/orders', { token: shop.token, expect, body: { ...parcel, quotedPrice: price, requestId: randomUUID(), ...extra } });
  };

  // ---- validation: optional, normalized, never on a ride ----
  assert.equal((await book({ recipientPhone: '0512345678' }, 400)).error, 'invalid_phone');
  assert.equal((await book({ recipientName: 'x'.repeat(61), recipientPhone: '0599700009' }, 400)).error, 'invalid_input');
  const ride = { service: 'ride', option: '1', dropoffPoint: { latitude: 32.2211, longitude: 35.2544 } };
  const { price: ridePrice } = await call('/price', { token: shop.token, body: { ...parcel, ...ride } });
  assert.equal((await call('/orders', { token: shop.token, expect: 400, body: { ...parcel, ...ride, pricing: 'smart', quotedPrice: ridePrice,
    requestId: randomUUID(), recipientPhone: '0599700009' } })).error, 'invalid_input');
  const plain = await book({});
  assert.deepEqual([plain.recipientName, plain.recipientPhone], ['', null]);
  const order = await book({ recipientName: ' Huda ', recipientPhone: '+970 59 970 0009' });
  assert.deepEqual([order.recipientName, order.recipientPhone], ['Huda', '0599700009'], 'customer sees it, normalized');

  // ---- drivers: hidden on job cards, visible once assigned; other drivers and the public page never ----
  const card = (await call('/jobs', { token: sami.token })).find(j => j.id === order.id);
  assert.deepEqual([card.recipientName, card.recipientPhone], ['', null]);
  const taken = await call(`/jobs/${order.id}/accept`, { token: sami.token, body: {} });
  assert.equal(taken.recipientPhone, '0599700009');
  await call(`/orders/${order.id}`, { token: rami.token, expect: 404 });
  assert.equal((await call(`/orders/${order.id}`, { token: admin.token })).recipientPhone, '0599700009');
  const { path } = await call(`/orders/${order.id}/share`, { token: shop.token, body: {} });
  const publicView = JSON.stringify(await call(path));
  assert.ok(!publicView.includes('0599700009') && !publicView.includes('Huda'), 'public tracking never shows the recipient');

  // ---- account deletion blanks it (open orders finish first) ----
  const advance = o => call(`/orders/${o.id}/advance`, { token: sami.token, body: { expectedStatus: o.status, requestId: randomUUID(),
    ...(o.status === 'in_transit' && { code: order.handoverCode }) } });
  let done = taken;
  while (done.status !== 'completed') done = await advance(done);
  await call(`/orders/${plain.id}/cancel`, { token: shop.token, body: {} });
  await call('/me/delete', { token: shop.token, body: { password: 'secret1' } });
  assert.deepEqual(((await call(`/orders/${order.id}`, { token: admin.token })) ?? {}).recipientPhone, null);
  console.log('Recipient checks passed: optional normalized recipient, parties only, hidden on cards and tracking, cleared on deletion.');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
