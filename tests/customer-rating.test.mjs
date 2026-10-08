// SPEC-customer-rating.md: the assigned driver rates the customer once; drivers see the customer's record, customers never do.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-customer-rating-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
delete process.env.OSRM_URL;
const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const advance = (token, order, extra = {}) => call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599500001', name: 'Admin', password: 'secret1' } });
  promote('0599500001');
  const customer = await call('/auth/register', { body: { phone: '0599500002', name: 'Huda', password: 'secret1' } });
  const driver = async phone => {
    const d = await call('/auth/register', { body: { phone, name: `Driver ${phone}`, password: 'secret1', role: 'driver', vehicle: 'car' } });
    await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
    return d;
  };
  const sami = await driver('0599500003'), rami = await driver('0599500004');
  const trip = { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'nablus', option: '1',
    pickupPoint: { latitude: 31.9022, longitude: 35.2063 }, dropoffPoint: { latitude: 32.2211, longitude: 35.2544 } };
  const book = async () => {
    const { price } = await call('/price', { token: customer.token, body: trip });
    return call('/orders', { token: customer.token, body: { ...trip, shared: false, pickupNote: 'Manara', dropoffNote: 'Hospital',
      contact: '0599500002', detail: '', pricing: 'smart', quotedPrice: price, requestId: randomUUID() } });
  };
  const jobStats = async id => (await call('/jobs', { token: rami.token })).find(j => j.id === id).customerStats;
  const finish = async order => {
    order = await call(`/jobs/${order.id}/accept`, { token: sami.token, body: {} });
    assert.equal((await call(`/orders/${order.id}/rate`, { token: sami.token, body: { customerRating: 5 }, expect: 409 })).error, 'cannot_rate', 'not before completion');
    order = await advance(sami.token, order);
    order = await advance(sami.token, order);
    const code = (await call(`/orders/${order.id}`, { token: customer.token })).handoverCode;
    order = await advance(sami.token, order, { code });
    assert.equal(order.status, 'completed');
    return order;
  };

  // ---- a new customer: drivers see "new", the customer sees nothing ----
  let order = await book();
  assert.deepEqual(await jobStats(order.id), { rating: null, trips: 0 });
  assert.equal(order.customerStats, undefined);
  assert.equal(order.customerRating, null);

  // ---- only the assigned driver rates, 1-5, once, after completion ----
  order = await finish(order);
  assert.deepEqual(order.customerStats, { rating: null, trips: 1 }, 'the assigned driver sees the record too');
  for (const bad of [{}, { customerRating: 0 }, { customerRating: 6 }, { customerRating: 'x' }, { rating: 5 }])
    await call(`/orders/${order.id}/rate`, { token: sami.token, body: bad, expect: 409 });
  await call(`/orders/${order.id}/rate`, { token: customer.token, body: { customerRating: 1 }, expect: 409 });
  await call(`/orders/${order.id}/rate`, { token: rami.token, body: { customerRating: 1 }, expect: 404 });
  assert.equal((await call(`/orders/${order.id}/rate`, { token: sami.token, body: { customerRating: 5 } })).customerRating, 5);
  await call(`/orders/${order.id}/rate`, { token: sami.token, body: { customerRating: 2 }, expect: 409 });
  const own = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(own.customerRating, null, 'customers never see the stars');
  assert.equal(own.customerStats, undefined);
  assert.equal((await call(`/orders/${order.id}`, { token: admin.token })).customerRating, 5);
  // The customer's own driver rating still works beside it.
  assert.equal((await call(`/orders/${order.id}/rate`, { token: customer.token, body: { rating: 4 } })).rating, 4);

  // ---- the average shows from 3 ratings ----
  order = await finish(await book());
  await call(`/orders/${order.id}/rate`, { token: sami.token, body: { customerRating: 4 } });
  order = await book();
  assert.deepEqual(await jobStats(order.id), { rating: null, trips: 2 }, 'two ratings stay hidden');
  order = await finish(order);
  await call(`/orders/${order.id}/rate`, { token: sami.token, body: { customerRating: 2 } });
  order = await book();
  assert.deepEqual(await jobStats(order.id), { rating: 3.7, trips: 3 });
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).customerStats, undefined);
  console.log('Customer rating checks passed: drivers rate once, see the record from 3 ratings, customers never see it.');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
