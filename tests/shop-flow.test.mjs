// Shop delivery, end to end (SRS §18 Delivery acceptance): browse → place (minimum, ceiling) → merchant accepts →
// substitution asks → approve / decline → weighed final → ready with packing → captain → merchant pickup code (lockout,
// audited reset) → handover exception reopens preparing → delivery with seals, code and door cash → money rows →
// captain cash → payout only after the captain's handover.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commissionOn, defaultSettings, goodsCapFor } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid';

const dir = mkdtempSync(join(tmpdir(), 'wind-shop-flow-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,shop';
delete process.env.WIND_SHOP_TOWN;
delete process.env.OSRM_URL;
const { persistence, shutdown, server, promote, shopSweep } = await import('../server/main.ts');
// One reader for both backends: tests/pg-shop.mjs runs this same file on PostgreSQL.
const one = (sql, ...args) => persistence.atomic({ purpose: 'test' }, () => persistence.one(sql, ...args));
await new Promise(resolve => server.listen(0, resolve));
const realFetch = globalThis.fetch;
const sends = [];
globalThis.fetch = (url, init) => String(url).startsWith('https://fcm.googleapis.com/')
  ? (sends.push(String(url)), Promise.resolve(new Response(null, { status: 201 }))) : realFetch(url, init);
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, realFetch);
const err = async (path, options, status, code) => assert.equal((await call(path, { ...options, expect: status })).error, code, `${path} → ${code}`);

try {
  const admin = await call('/auth/register', { body: { phone: '0599510001', name: 'Admin', password: 'secret1' } });
  await promote('0599510001');
  const owner = await call('/auth/register', { body: { phone: '0599510002', name: 'Baker', password: 'secret1' } });
  const customer = await call('/auth/register', { body: { phone: '0599510003', name: 'Maha', password: 'secret1' } });
  const captain = await call('/auth/register', { body: { phone: '0599510004', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'motorcycle' } });
  await call(`/admin/users/${captain.user.id}/approve`, { token: admin.token, body: {} });

  // ---- the line shows itself only because it is enabled; with shop on, the cash cap defaults to ₪1000 (ADM-12) ----
  const me = await call('/me', { token: customer.token });
  assert.ok(me.capabilities.enabledServices.includes('shop'));
  assert.equal(me.settings.driverCashCap, 1000);
  await err('/admin/settings', { token: admin.token, body: { orderCashCeiling: 1001 } }, 409, 'ceiling_above_cap');

  // ---- merchant application (ACC-06) and approval (MER-08) ----
  const shopPoint = { latitude: 32.3120, longitude: 35.0290 }, home = { latitude: 32.3150, longitude: 35.0250 };
  await err('/merchant/apply', { token: owner.token, body: { name: 'Pharmacy', category: 'pharmacy', city: 'tulkarm', point: shopPoint, phone: '0599510002',
    licenceNo: 'TL-1', licenceExpiresAt: Date.now() + 365 * 86_400_000 } }, 409, 'category_closed'); // DLV-19
  const applied = await call('/merchant/apply', { token: owner.token, body: { name: 'Fresh Bakery', category: 'bakery', city: 'tulkarm', point: shopPoint,
    phone: '0599510002', licenceNo: 'TL-2', licenceExpiresAt: Date.now() + 365 * 86_400_000 } });
  assert.equal(applied.merchant.status, 'pending');
  await err('/merchant/apply', { token: owner.token, body: { name: 'Again', category: 'bakery', city: 'tulkarm', point: shopPoint, phone: '0599510002',
    licenceNo: 'TL-3', licenceExpiresAt: Date.now() + 365 * 86_400_000 } }, 409, 'merchant_exists');
  await err('/merchant/catalogue', { token: owner.token }, 403, 'not_merchant');
  assert.equal((await call('/shop/merchants?city=tulkarm', { token: customer.token })).merchants.length, 0, 'a pending shop is not listed');
  const merchantId = applied.merchant.id;
  const approved = await call(`/admin/merchants/${merchantId}`, { token: admin.token, body: { status: 'active', minOrderAgorot: 3000, deliveryFeeAgorot: 1000,
    serviceFeeAgorot: 200, commissionBps: 1000 } });
  assert.equal(approved.status, 'active');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM security_events WHERE action = 'MERCHANT_APPROVED'")).n), 1);

  // ---- catalogue (DLV-01, MER-02) ----
  const item = body => call('/merchant/items', { token: owner.token, body });
  const bread = await item({ section: 'Bread', nameAr: 'خبز', nameEn: 'Bread', priceAgorot: 500 });
  const tomatoes = await item({ section: 'Vegetables', nameAr: 'بندورة', nameEn: 'Tomatoes', priceAgorot: 800, byWeight: true });
  const cheese = await item({ section: 'Dairy', nameAr: 'جبنة', nameEn: 'Cheese', priceAgorot: 2500 });
  const labneh = await item({ section: 'Dairy', nameAr: 'لبنة', nameEn: 'Labneh', priceAgorot: 2000 });
  const oil = await item({ section: 'Pantry', nameAr: 'زيت', nameEn: 'Olive oil', priceAgorot: 4000 });
  const hidden = await item({ section: 'Pantry', nameAr: 'سكر', nameEn: 'Sugar', priceAgorot: 300 });
  await call(`/merchant/items/${hidden.id}`, { token: owner.token, body: { available: false } });
  const listed = await call(`/shop/merchants/${merchantId}`, { token: customer.token });
  assert.equal(listed.merchant.open, true);
  assert.ok(!listed.items.some(i => i.id === hidden.id), 'an unavailable item is not offered');
  assert.equal(listed.merchant.commissionBps, undefined, 'customers do not see the commission');

  // ---- place: server-priced basket, minimum, promo refusal, idempotent ----
  const basket = [{ itemId: bread.id, qtyMilli: 2000, policy: 'remove' }, { itemId: tomatoes.id, qtyMilli: 1500, policy: 'similar' },
    { itemId: cheese.id, qtyMilli: 1000, policy: 'ask_first' }];
  const estimate = 1000 + 1200 + 2500;
  const placeBody = { service: 'shop', merchantId, lines: basket, dropoffCity: 'tulkarm', dropoffPoint: home, dropoffNote: 'Second floor',
    contact: '0599510003', expectedGoodsAgorot: estimate };
  await err('/orders', { token: customer.token, body: { ...placeBody, expectedGoodsAgorot: estimate + 1 } }, 409, 'price_changed');
  await err('/orders', { token: customer.token, body: { ...placeBody, lines: [basket[0]], expectedGoodsAgorot: 1000 } }, 409, 'below_minimum');
  await err('/orders', { token: customer.token, body: { ...placeBody, promoCode: 'WELCOME' } }, 409, 'promo_wrong_service');
  await err('/orders', { token: customer.token, body: { ...placeBody, lines: [{ itemId: hidden.id, qtyMilli: 1000, policy: 'remove' }] } }, 409, 'unavailable_item');
  await err('/orders', { token: customer.token, body: { ...placeBody, dropoffCity: 'nablus' } }, 409, 'shop_town_closed');
  const requestId = randomUUID();
  sends.length = 0;
  const commandExpiresAt = Date.now() + 60_000;
  const placement = { ...placeBody, requestId, commandExpiresAt };
  let order = await call('/orders', { token: customer.token, body: placement });
  assert.deepEqual(await call(`/orders/commands/${requestId}`, { token: customer.token }), { orderId: order.id }, 'a restarted cart recovers the committed order without posting again');
  assert.equal((await call('/orders', { token: customer.token, body: placement })).id, order.id, 'a retried place returns the same order');
  await err('/orders', { token: customer.token, body: { ...placement, requestId: randomUUID(), commandExpiresAt: Date.now() - 1 } }, 409, 'booking_command_expired');
  assert.equal(order.status, 'requested');
  assert.equal(order.shop.state, null);
  assert.equal(order.shop.goodsEstimateAgorot, estimate);
  assert.equal(order.shop.goodsCapAgorot, goodsCapFor(estimate, defaultSettings.shopAgreeLimit));
  assert.equal(order.shop.cashAgorot, estimate + 1200);
  assert.equal(order.shop.pickupCode, null, 'the customer never sees the shop pickup code');
  assert.match(order.handoverCode, /^\d{4}$/, 'the customer holds the delivery code');
  assert.equal(order.price, 10, 'the order fee is the delivery fee in shekels');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM shop_snapshots WHERE order_id = ?", order.id)).n), 1);
  assert.equal((await call('/jobs', { token: captain.token })).length, 0, 'captains do not see a requested order');

  // ---- the customer may still change the basket before the shop accepts (DLV-11) ----
  order = await call(`/orders/${order.id}/shop/edit`, { token: customer.token, body: { lines: basket, expectedGoodsAgorot: estimate } });
  assert.equal(Number((await one("SELECT COUNT(*) n FROM shop_snapshots WHERE order_id = ?", order.id)).n), 2, 'an edit appends a snapshot');

  // ---- merchant inbox: the pickup code is the shop's to show ----
  const inbox = await call('/merchant/orders', { token: owner.token });
  const mine = inbox.orders.find(o => o.id === order.id);
  assert.match(mine.shop.pickupCode, /^\d{4}$/);
  assert.equal(mine.handoverCode, null, 'the shop never sees the delivery code');
  assert.equal(mine.dropoffPoint, null, "the shop does not get the customer's address");
  const pickupCode = mine.shop.pickupCode;

  // ---- accept and prepare (DLV-07, DLV-08); free cancel ends at acceptance (D-2) ----
  order = await call(`/merchant/orders/${order.id}/accept`, { token: owner.token, body: { prepMinutes: 30 } });
  assert.equal(order.shop.state, 'accepted');
  await err(`/orders/${order.id}/cancel`, { token: customer.token, body: {} }, 409, 'cancel_refused');
  await err(`/orders/${order.id}/shop/edit`, { token: customer.token, body: { lines: basket } }, 409, 'edit_closed');
  order = await call(`/merchant/orders/${order.id}/preparing`, { token: owner.token, body: {} });
  assert.equal(order.shop.state, 'preparing');
  const lineOf = id => order.shop.lines.find(l => l.itemId === id && !l.removed);

  // ---- weighed final inside the cap applies at once (DLV-04) ----
  order = await call(`/merchant/orders/${order.id}/lines/${lineOf(tomatoes.id).id}`, { token: owner.token, body: { weightGrams: 1600 } });
  assert.equal(order.shop.state, 'preparing');
  assert.equal(lineOf(tomatoes.id).finalAgorot, 1280);

  // ---- "ask me first" always asks, even when cheaper (DLV-05/06) ----
  order = await call(`/merchant/orders/${order.id}/lines/${lineOf(cheese.id).id}`, { token: owner.token, body: { substituteItemId: labneh.id } });
  assert.equal(order.shop.state, 'awaiting_approval');
  const customerView = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(customerView.shop.change.nameEn, 'Labneh');
  assert.equal(customerView.shop.change.goodsAfterAgorot, 1000 + 1280 + 2000);
  await err(`/merchant/orders/${order.id}/ready`, { token: owner.token, body: { packages: [{ sealed: true }] } }, 409, 'change_pending');
  await err(`/merchant/orders/${order.id}/lines/${lineOf(bread.id).id}`, { token: owner.token, body: { remove: true } }, 409, 'shop_state');
  order = await call(`/orders/${order.id}/shop/consent`, { token: customer.token, body: { changeId: customerView.shop.change.id, extend: true } });
  await err(`/orders/${order.id}/shop/consent`, { token: customer.token, body: { changeId: customerView.shop.change.id, extend: true } }, 409, 'already_extended');
  order = await call(`/orders/${order.id}/shop/consent`, { token: customer.token, body: { changeId: customerView.shop.change.id, decision: 'approve' } });
  assert.equal(order.shop.state, 'preparing');
  assert.equal(order.shop.goodsCapAgorot, goodsCapFor(estimate, defaultSettings.shopAgreeLimit), 'approving a lower total never lowers the cap');
  order = await call(`/orders/${order.id}`, { token: owner.token });
  assert.ok(lineOf(labneh.id), 'the substitute is in the basket');

  // ---- a weight past the cap pauses; a decline removes the line and stays above the minimum ----
  order = await call(`/merchant/orders/${order.id}/lines/${lineOf(tomatoes.id).id}`, { token: owner.token, body: { weightGrams: 5000 } });
  assert.equal(order.shop.state, 'awaiting_approval');
  const pending = (await call(`/orders/${order.id}`, { token: customer.token })).shop.change;
  order = await call(`/orders/${order.id}/shop/consent`, { token: customer.token, body: { changeId: pending.id, decision: 'decline' } });
  assert.equal(order.shop.state, 'preparing');
  assert.equal(order.shop.goodsAgorot, 1000 + 2000, 'the declined line came off');

  // ---- a change past the per-order cash ceiling is refused and does not pause (DLV-06 step 1, ADM-12) ----
  await call('/admin/settings', { token: admin.token, body: { orderCashCeiling: 50 } });
  order = await call(`/orders/${order.id}`, { token: owner.token });
  await err(`/merchant/orders/${order.id}/lines/${lineOf(bread.id).id}`, { token: owner.token, body: { substituteItemId: oil.id } }, 409, 'substitution_refused');
  await err(`/merchant/orders/${order.id}/lines/${lineOf(labneh.id).id}`, { token: owner.token, body: { substituteItemId: oil.id, qtyMilli: 2000 } }, 409, 'over_cash_ceiling');
  assert.equal((await call(`/orders/${order.id}`, { token: owner.token })).shop.state, 'preparing');
  await call('/admin/settings', { token: admin.token, body: { orderCashCeiling: 500 } });

  // ---- ready needs the packing record; marking ready early releases the job to captains (DLV-12, MER-03) ----
  await err(`/merchant/orders/${order.id}/ready`, { token: owner.token, body: {} }, 409, 'packing_required');
  const labnehLine = lineOf(labneh.id).id, breadLine = lineOf(bread.id).id;
  await err(`/merchant/orders/${order.id}/ready`, { token: owner.token, body: { packages: [{ sealed: false, lineIds: [labnehLine] }] } }, 409, 'packing_required');
  order = await call(`/merchant/orders/${order.id}/ready`, { token: owner.token, body: { packages: [{ sealed: true }, { sealed: false, lineIds: [labnehLine, breadLine] }] } });
  assert.equal(order.shop.state, 'ready');
  assert.equal(order.status, 'searching');
  const [job] = await call('/jobs', { token: captain.token });
  assert.equal(job.id, order.id);
  assert.equal(job.shop.pickupCode, null);
  assert.equal(job.handoverCode, null);

  // ---- the captain accepts; codes stay hidden from them (§2.1a) ----
  order = await call(`/jobs/${order.id}/accept`, { token: captain.token, body: {} });
  assert.equal(order.status, 'assigned');
  assert.equal(order.commission, commissionOn(10, defaultSettings.commission), 'commission is on the delivery fee only');
  assert.equal(order.shop.pickupCode, null);
  const advance = (expectedStatus, extra = {}) => call(`/orders/${order.id}/advance`, { token: captain.token, body: { expectedStatus, requestId: randomUUID(), ...extra } });
  order = await advance('assigned');
  assert.equal(order.status, 'at_pickup');
  await err(`/orders/${order.id}/advance`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID() } }, 409, 'use_shop_handover');

  // ---- pickup code: five misses lock it, on its own counter; the reset is audited ----
  for (let i = 0; i < 5; i++) await err(`/orders/${order.id}/shop/handover`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), code: '0000', check: { result: 'ok' } } }, 400, 'wrong_code');
  await err(`/orders/${order.id}/shop/handover`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), code: pickupCode, check: { result: 'ok' } } }, 409, 'proof_locked');
  assert.equal(Number((await one('SELECT COUNT(*) n FROM proof_attempts WHERE order_id = ?', order.id)).n), 0, 'the delivery code counter is untouched');
  await call(`/admin/orders/${order.id}/shop/reset-pickup`, { token: admin.token, body: { reason: 'Shop confirmed the captain at the counter' } });
  assert.equal(Number((await one("SELECT COUNT(*) n FROM security_events WHERE order_id = ? AND action = 'SHOP_PICKUP_RESET'", order.id)).n), 1);

  // ---- a handover exception reopens preparing; the shop fixes it and marks ready again (DLV-13) ----
  order = await call(`/orders/${order.id}/shop/handover`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), check: { result: 'exception', exception: 'missing_item' } } });
  assert.equal(order.shop.state, 'preparing');
  assert.equal(order.shop.handoverException, 'missing_item');
  assert.equal(order.status, 'at_pickup');
  await err(`/orders/${order.id}/shop/handover`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), code: pickupCode, check: { result: 'ok' } } }, 409, 'exception_open');
  // Inside the owner-set 10 minutes the shop fixes it: support can neither cancel for it nor remove a line, and it is not on the stuck list.
  await err(`/admin/orders/${order.id}/shop/cancel`, { token: admin.token, body: { reason: 'handover_exception_unresolved', note: 'Synthetic early decision' } }, 409, 'cancel_refused');
  await err(`/admin/orders/${order.id}/shop/lines/${breadLine}/remove`, { token: admin.token, body: {} }, 409, 'handover_not_overdue');
  assert.ok(!(await call('/admin/shop/attention', { token: admin.token })).orders.some(o => o.id === order.id));
  await shopSweep(Date.now() + 9 * 60_000);
  assert.equal(Number((await one("SELECT COUNT(*) n FROM security_events WHERE order_id = ? AND action = 'SHOP_HANDOVER_ESCALATED'", order.id)).n), 0, 'nothing escalates before the minutes pass');
  // Past them, the sweep tells support once per exception and the order joins the stuck list; it never cancels by itself.
  // Handover checks are append-only, so the clock moves instead of the row (the API runs in this process).
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60_000;
  await shopSweep();
  await shopSweep();
  assert.equal(Number((await one("SELECT COUNT(*) n FROM security_events WHERE order_id = ? AND action = 'SHOP_HANDOVER_ESCALATED'", order.id)).n), 1, 'one escalation per exception');
  const stuck = (await call('/admin/shop/attention', { token: admin.token })).orders.find(o => o.id === order.id);
  assert.equal(stuck?.shop.handoverOverdue, true, 'an overdue exception is on the stuck list, marked for support to decide');
  assert.equal((await call(`/orders/${order.id}`, { token: owner.token })).shop.handoverOverdue, false, 'only support sees the overdue flag');
  Date.now = realNow;
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).status, 'at_pickup');
  await call(`/merchant/orders/${order.id}/ready`, { token: owner.token, body: { packages: [{ sealed: true }, { sealed: false, lineIds: [labnehLine, breadLine] }] } });
  order = await call(`/orders/${order.id}/shop/handover`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), code: pickupCode, check: { result: 'ok' } } });
  assert.equal(order.status, 'in_transit');
  assert.equal(order.shop.state, 'handed_over');
  await err(`/orders/${order.id}/release`, { token: captain.token, body: {} }, 409, 'cannot_release');

  // ---- delivery: seals first, then the code and the door cash: goods + delivery fee + service fee (DLV-14/15) ----
  const goods = 1000 + 2000, due = goods + 1000 + 200;
  const deliveryCode = (await call(`/orders/${order.id}`, { token: customer.token })).handoverCode;
  await err(`/orders/${order.id}/advance`, { token: captain.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), code: deliveryCode, collectedCents: due } }, 400, 'invalid_input');
  await err(`/orders/${order.id}/advance`, { token: captain.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), code: deliveryCode,
    seals: [{ no: 1, intact: true }], collectedCents: due - 100 } }, 400, 'invalid_input');
  order = await advance('in_transit', { code: deliveryCode, seals: [{ no: 1, intact: true }], collectedCents: due });
  assert.equal(order.status, 'completed');
  assert.equal(Number((await one('SELECT COUNT(*) n FROM shop_seals WHERE order_id = ?', order.id)).n), 1);
  assert.equal(Number((await one('SELECT door_expected_cents d FROM orders WHERE id = ?', order.id)).d), due);

  // ---- money: goods to the shop less its commission, the service fee to Wind, commission only on the delivery fee ----
  const book = async (b, kind) => Number((await one('SELECT COALESCE(SUM(amount_agorot), 0) n FROM shop_ledger WHERE book = ? AND kind = ? AND order_id = ?', b, kind, order.id)).n);
  assert.equal(await book('merchant', 'goods'), goods);
  assert.equal(await book('merchant', 'commission'), -300);
  assert.equal(await book('wind', 'commission'), 300);
  assert.equal(await book('wind', 'service_fee'), 200);
  await assert.rejects(one('UPDATE shop_ledger SET amount_agorot = 1'), /append-only/);
  const cash = await call('/driver/cash', { token: captain.token });
  assert.equal(cash.shopCents, goods + 200, 'the captain owes the goods and the service fee they collected');
  assert.equal(cash.owedCents, Math.round(commissionOn(10, defaultSettings.commission) * 100) + goods + 200);

  // ---- payout waits for the captain's handover (MER-07) ----
  let statement = await call('/merchant/statement', { token: owner.token });
  assert.equal(statement.balanceAgorot, goods - 300);
  assert.equal(statement.payableAgorot, 0, 'nothing is payable while the captain still holds the cash');
  await err(`/admin/merchants/${merchantId}/payout`, { token: admin.token, body: { amountAgorot: 100, reference: 'BANK-1', requestId: randomUUID() } }, 409, 'insufficient_balance');
  const remit = await call('/admin/cash/remittance', { token: admin.token, body: { driverId: captain.user.id, amountCents: cash.owedCents, requestId: randomUUID() } });
  await call(`/driver/cash/${remit.id}/confirm`, { token: captain.token, body: { decision: 'confirm' } });
  statement = await call('/merchant/statement', { token: owner.token });
  assert.equal(statement.payableAgorot, goods - 300);
  const payoutId = randomUUID();
  statement = await call(`/admin/merchants/${merchantId}/payout`, { token: admin.token, body: { amountAgorot: goods - 300, reference: 'BANK-2', requestId: payoutId } });
  assert.equal(statement.balanceAgorot, 0);
  assert.equal((await call(`/admin/merchants/${merchantId}/payout`, { token: admin.token, body: { amountAgorot: goods - 300, reference: 'BANK-2', requestId: payoutId } })).balanceAgorot, 0, 'a retried payout is not paid twice');

  // ---- ratings, each party once (CON-08) ----
  await call(`/orders/${order.id}/shop/rate`, { token: customer.token, body: { rating: 5 } });
  await err(`/orders/${order.id}/shop/rate`, { token: customer.token, body: { rating: 3 } }, 409, 'cannot_rate');
  await call(`/orders/${order.id}/shop/rate`, { token: owner.token, body: { rating: 4 } });
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).shop.merchantRating, 5);

  // ---- order again: today's prices and stock, with what changed (DLV-18) ----
  await call(`/merchant/items/${bread.id}`, { token: owner.token, body: { section: 'Bread', nameAr: 'خبز', nameEn: 'Bread', priceAgorot: 600 } });
  await call(`/merchant/items/${tomatoes.id}`, { token: owner.token, body: { available: false } });
  const again = await call(`/orders/${order.id}/shop/again`, { token: customer.token, body: {} });
  assert.deepEqual(again.changes.map(c => c.kind).sort(), ['price', 'unavailable']);
  assert.equal(again.lines.length, 2);

  console.log('Shop flow: place, edit, accept, weighed and substituted lines with consent, ceiling, packing, pickup code lockout and reset, handover exception, sealed delivery with door cash, money rows, captain cash, payout after handover, ratings and order-again passed');
} finally {
  globalThis.fetch = realFetch;
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
