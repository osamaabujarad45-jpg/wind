// Goodwill credit on a resolved dispute (SPEC-dispute-credit.md).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings as standard, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
// Discount maths were written for a ₪49 parcel; the admin tariff is set to match (SPEC-parcel-standard.md).
const defaultSettings = { ...standard, parcelPrice: 49 };

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-credit-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, promote, db } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });
const register = (phone, name, extra = {}) => call('/auth/register', { body: { phone, name, password: 'secret1', ...extra } });

try {
  const admin = await register('0599140001', 'Admin');
  promote('0599140001');
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 49 } });
  const customer = await register('0599140002', 'Rana');
  const other = await register('0599140005', 'Huda');
  const driver = await register('0599140004', 'Driver', { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599140002', detail: 'Box' };
  const price = quote(defaultSettings, input);
  const finished = async token => {
    let order = await call('/orders', { token, body: { ...input, quotedPrice: price } });
    order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
    order = await advance(driver.token, await advance(driver.token, order));
    const { handoverCode } = await call(`/orders/${order.id}`, { token });
    return advance(driver.token, order, { code: handoverCode });
  };

  const order = await finished(customer.token);
  await call(`/orders/${order.id}/dispute`, { token: customer.token, body: { reason: 'The box arrived wet and torn.' } });
  const [row] = await call('/admin/disputes', { token: admin.token });
  for (const creditShekels of [0, 51, 2.5, '10'])
    await call(`/admin/disputes/${row.id}/resolve`, { token: admin.token, body: { resolution: 'Sorry about that', creditShekels }, expect: 400 });
  await call(`/admin/disputes/${row.id}/resolve`, { token: customer.token, body: { resolution: 'Sorry about that', creditShekels: 15 }, expect: 403 });
  await call(`/admin/disputes/${row.id}/resolve`, { token: admin.token, body: { resolution: 'Sorry about that', creditShekels: 15 } });
  assert.equal((await call('/admin/disputes', { token: admin.token }))[0].creditAmount, 15);
  await call(`/admin/disputes/${row.id}/resolve`, { token: admin.token, body: { resolution: 'Again', creditShekels: 15 }, expect: 409 });
  assert.equal((await call('/me/referral', { token: customer.token })).credits.length, 1); // issued once
  assert.equal((await call(`/orders/${order.id}`, { token: driver.token })).dispute, null); // the driver never sees it

  const { dispute } = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(dispute.credit.amount, 15);
  assert.match(dispute.credit.code, /^C[A-Z0-9]{7}$/);
  assert.deepEqual((await call('/me/referral', { token: customer.token })).credits.map(c => [c.code, c.amount]), [[dispute.credit.code, 15]]);
  assert.equal((await call('/promos/check', { token: other.token, body: { code: dispute.credit.code, price }, expect: 400 })).error, 'invalid_promo');
  assert.equal((await call('/promos/check', { token: customer.token, body: { code: dispute.credit.code, price } })).discount, 15);
  assert.equal((await call('/admin/promos', { token: admin.token })).length, 0); // personal codes stay out of the admin list

  // Without a credit nothing is issued.
  const second = await finished(other.token);
  await call(`/orders/${second.id}/dispute`, { token: other.token, body: { reason: 'Driver was late by an hour.' } });
  const open = (await call('/admin/disputes', { token: admin.token })).find(d => d.status === 'open');
  await call(`/admin/disputes/${open.id}/resolve`, { token: admin.token, body: { resolution: 'Explained the checkpoint delay' } });
  assert.equal((await call(`/orders/${second.id}`, { token: other.token })).dispute.credit, null);
  assert.deepEqual((await call('/me/referral', { token: other.token })).credits, []);

  // Booking with the credit applies it once.
  const booked = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: price, promoCode: dispute.credit.code, expectedDiscount: 15 } });
  assert.equal(booked.discount, 15);
  assert.deepEqual((await call('/me/referral', { token: customer.token })).credits, []);

  // No credit for an account that can no longer use it.
  const gone = await finished(other.token);
  await call(`/orders/${gone.id}/dispute`, { token: other.token, body: { reason: 'Parcel arrived opened.' } });
  const last = (await call('/admin/disputes', { token: admin.token })).find(d => d.status === 'open');
  db.prepare("UPDATE users SET status = 'blocked' WHERE id = ?").run(other.user.id);
  assert.equal((await call(`/admin/disputes/${last.id}/resolve`, { token: admin.token, body: { resolution: 'Checked', creditShekels: 5 }, expect: 409 })).error, 'customer_inactive');
  await call(`/admin/disputes/${last.id}/resolve`, { token: admin.token, body: { resolution: 'Checked' } });

  console.log('credit: ok');
} finally {
  server.close();
}
