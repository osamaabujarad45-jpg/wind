// Promo codes (SPEC-promo-codes.md): customer pays less cash, Wind funds the discount through the driver's ledger.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings as standard, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
// Discount maths were written for a ₪49 parcel; the admin tariff is set to match (SPEC-parcel-standard.md).
const defaultSettings = { ...standard, parcelPrice: 49 };

const dir = mkdtempSync(join(tmpdir(), 'wind-promo-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599120001', name: 'Admin', password: 'secret1' } });
  await promote('0599120001');
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 49 } });
  const customer = await call('/auth/register', { body: { phone: '0599120002', name: 'Salma', password: 'secret1' } });
  const second = await call('/auth/register', { body: { phone: '0599120004', name: 'Second', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599120003', name: 'Driver', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599120002', detail: 'Box' };
  const price = quote(defaultSettings, input);
  const book = (token, extra = {}, expect) => call('/orders', { token, body: { ...input, quotedPrice: price, ...extra }, expect });

  // Admin creates codes; validation.
  await call('/admin/promos', { token: customer.token, body: { code: 'WELCOME10', amount: 10, maxUses: 5, days: 30 }, expect: 403 });
  for (const body of [{ code: 'ab', amount: 10, maxUses: 5, days: 30 }, { code: 'HELLO!', amount: 10, maxUses: 5, days: 30 },
    { code: 'WELCOME10', amount: 0, maxUses: 5, days: 30 }, { code: 'WELCOME10', amount: 101, maxUses: 5, days: 30 },
    { code: 'WELCOME10', amount: 10, maxUses: 0, days: 30 }, { code: 'WELCOME10', amount: 10, maxUses: 5, days: 91 }])
    await call('/admin/promos', { token: admin.token, body, expect: 400 });
  await call('/admin/promos', { token: admin.token, body: { code: 'welcome10', amount: 10, maxUses: 2, days: 30 } });
  await call('/admin/promos', { token: admin.token, body: { code: 'WELCOME10', amount: 5, maxUses: 2, days: 30 }, expect: 409 });
  await call('/admin/promos', { token: admin.token, body: { code: 'FIRST20', amount: 20, maxUses: 100, days: 7, firstOrderOnly: true } });
  await call('/admin/promos', { token: admin.token, body: { code: 'HUGE99', amount: 99, maxUses: 10, days: 7 } });

  // Partner (Souq) orders never take a Wind promo.
  const partner = await fetch(`${base}/partner/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partner-Key': process.env.SOUQ_PARTNER_KEY },
    body: JSON.stringify({ ...input, externalRef: 'souq:promo', quotedPrice: price, promoCode: 'HUGE99', expectedDiscount: price - 1 }) }).then(r => r.json());
  assert.equal(partner.discount, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM promo_redemptions').get().n, 0);

  // Check and apply.
  assert.deepEqual(await call('/promos/check', { token: customer.token, body: { code: ' welcome10 ', price } }), { code: 'WELCOME10', discount: 10 });
  assert.equal((await call('/promos/check', { token: customer.token, body: { code: 'NOPE', price }, expect: 400 })).error, 'invalid_promo');
  assert.equal((await call('/promos/check', { token: customer.token, body: { code: 'HUGE99', price } })).discount, price - 1); // never below ₪1
  assert.equal((await book(customer.token, { promoCode: 'WELCOME10', expectedDiscount: 7 }, 409)).error, 'promo_changed');
  const requestId = randomUUID();
  let order = await book(customer.token, { promoCode: 'WELCOME10', expectedDiscount: 10, requestId });
  assert.equal((await book(customer.token, { promoCode: 'WELCOME10', expectedDiscount: 10, requestId })).id, order.id); // replay
  assert.equal((await book(customer.token, { requestId }, 409)).error, 'idempotency_conflict');
  assert.equal(order.price, price);
  assert.equal(order.discount, 10);
  assert.equal((await call('/promos/check', { token: customer.token, body: { code: 'WELCOME10', price }, expect: 409 })).error, 'promo_used');
  assert.equal((await call('/promos/check', { token: customer.token, body: { code: 'FIRST20', price }, expect: 409 })).error, 'promo_used'); // not a first order any more

  // Cancelling frees the use; the total cap counts live uses only.
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} });
  order = await book(customer.token, { promoCode: 'WELCOME10', expectedDiscount: 10 });
  await book(second.token, { promoCode: 'WELCOME10', expectedDiscount: 10, contact: '0599120004' });
  const third = await call('/auth/register', { body: { phone: '0599120005', name: 'Third', password: 'secret1' } });
  assert.equal((await call('/promos/check', { token: third.token, body: { code: 'WELCOME10', price }, expect: 409 })).error, 'promo_used');
  assert.equal((await call('/promos/check', { token: third.token, body: { code: 'FIRST20', price } })).discount, 20);

  // Expired and deactivated codes.
  db.prepare("UPDATE promo_codes SET expires_at = ? WHERE code = 'HUGE99'").run(Date.now() - 1000);
  assert.equal((await call('/promos/check', { token: third.token, body: { code: 'HUGE99', price }, expect: 400 })).error, 'invalid_promo');
  const promos = await call('/admin/promos', { token: admin.token });
  const first20 = promos.find(p => p.code === 'FIRST20');
  assert.equal(promos.find(p => p.code === 'WELCOME10').uses, 2);
  assert.deepEqual([promos.find(p => p.code === 'WELCOME10').live, promos.find(p => p.code === 'HUGE99').live], [true, false]);
  await call(`/admin/promos/${first20.id}/deactivate`, { token: customer.token, body: {}, expect: 403 });
  await call(`/admin/promos/${first20.id}/deactivate`, { token: admin.token, body: {} });
  await call(`/admin/promos/${first20.id}/deactivate`, { token: admin.token, body: {}, expect: 404 });
  await call('/admin/promos', { token: customer.token, expect: 403 });
  assert.equal((await call('/promos/check', { token: third.token, body: { code: 'FIRST20', price }, expect: 400 })).error, 'invalid_promo');

  // The driver collects the discounted amount; the ledger credits the discount.
  order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.equal(order.discount, 10);
  order = await advance(driver.token, await advance(driver.token, order));
  const { handoverCode } = await call(`/orders/${order.id}`, { token: customer.token });
  await advance(driver.token, order, { code: handoverCode });
  const cash = await call('/driver/cash', { token: driver.token });
  assert.equal(cash.owedCents, Math.round(order.commission * 100) - 1000);
  assert.equal(cash.discountsCents, 1000);
  // The promo outweighs the commission: Wind owes the driver, and an admin settles it with a payout adjustment.
  assert.ok(cash.owedCents < 0);
  await call('/admin/cash/adjustment', { token: admin.token, body: { driverId: driver.user.id, amountCents: -cash.owedCents, reason: 'Promo credits paid in cash' } });
  assert.equal((await call('/driver/cash', { token: driver.token })).owedCents, 0);
  // Wind's profit counts the promo it funded.
  const stats = await call('/admin/stats', { token: admin.token });
  assert.equal(stats.discounts, 10);
  assert.equal(stats.profit, stats.commission - 10 + stats.subscriptions);

  console.log('promo: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
