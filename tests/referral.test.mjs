// Referral (SPEC-referral.md): a friend's invite code discounts their first order; completion rewards the inviter.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-referral-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });
const register = (phone, name, extra = {}) => call('/auth/register', { body: { phone, name, password: 'secret1', ...extra } });

try {
  const admin = await register('0599130001', 'Admin');
  promote('0599130001');
  const inviter = await register('0599130002', 'Lina');
  const friend = await register('0599130003', 'Omar');
  const other = await register('0599130005', 'Huda');
  const driver = await register('0599130004', 'Driver', { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599130003', detail: 'Box' };
  const price = quote(defaultSettings, input);
  const book = (token, extra = {}, expect) => call('/orders', { token, body: { ...input, quotedPrice: price, ...extra }, expect });
  const deliver = async order => {
    order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
    order = await advance(driver.token, await advance(driver.token, order));
    const { handoverCode } = await call(`/orders/${order.id}`, { token: friend.token });
    return advance(driver.token, order, { code: handoverCode });
  };

  // A stable personal code; drivers and admins have none.
  const mine = await call('/me/referral', { token: inviter.token });
  assert.match(mine.code, /^W[A-Z0-9]{5}$/);
  assert.deepEqual(await call('/me/referral', { token: inviter.token }), { code: mine.code, reward: 10, joined: 0, earned: 0, credits: [] });
  await call('/me/referral', { token: driver.token, expect: 403 });

  // Own code refused; the friend's first order gets the discount.
  assert.equal((await call('/promos/check', { token: inviter.token, body: { code: mine.code, price } , expect: 400 })).error, 'invalid_promo');
  assert.deepEqual(await call('/promos/check', { token: friend.token, body: { code: mine.code.toLowerCase(), price } }), { code: mine.code, discount: 10 });
  let order = await book(friend.token, { promoCode: mine.code, expectedDiscount: 10 });
  assert.equal(order.discount, 10);
  assert.equal((await call('/me/referral', { token: inviter.token })).joined, 1);

  // Cancel frees it; a second order is not a first order.
  await call(`/orders/${order.id}/cancel`, { token: friend.token, body: {} });
  assert.equal((await call('/me/referral', { token: inviter.token })).joined, 0);
  order = await book(friend.token, { promoCode: mine.code, expectedDiscount: 10 });
  assert.equal((await call('/promos/check', { token: friend.token, body: { code: mine.code, price }, expect: 409 })).error, 'promo_used');

  // An admin cannot create a promo that shadows an invite code.
  assert.equal((await call('/admin/promos', { token: admin.token, body: { code: mine.code, amount: 5, maxUses: 5, days: 5 }, expect: 409 })).error, 'promo_exists');

  // Reward only on completion, once, usable only by the inviter, once.
  assert.deepEqual((await call('/me/referral', { token: inviter.token })).credits, []);
  await deliver(order);
  const after = await call('/me/referral', { token: inviter.token });
  assert.deepEqual([after.joined, after.earned, after.credits.length, after.credits[0].amount], [1, 1, 1, 10]);
  const credit = after.credits[0].code;
  assert.equal((await call('/promos/check', { token: other.token, body: { code: credit, price }, expect: 400 })).error, 'invalid_promo');
  const own = await book(inviter.token, { promoCode: credit, expectedDiscount: 10, contact: '0599130002' });
  assert.equal(own.discount, 10);
  assert.deepEqual((await call('/me/referral', { token: inviter.token })).credits, []);
  assert.equal((await call('/promos/check', { token: inviter.token, body: { code: credit, price }, expect: 409 })).error, 'promo_used');

  // The friend's referral order pays out once: a later completed order adds nothing.
  assert.equal((await call('/me/referral', { token: inviter.token })).earned, 1);

  // Deleting the inviter disables the code.
  await call(`/orders/${own.id}/cancel`, { token: inviter.token, body: {} });
  await call('/me/delete', { token: inviter.token, body: {} });
  assert.equal((await call('/promos/check', { token: other.token, body: { code: mine.code, price }, expect: 400 })).error, 'invalid_promo');

  console.log('referral: ok');
} finally {
  server.close();
}
