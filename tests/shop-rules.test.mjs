// Shop delivery rules (SRS §7, D-2): the timers (accept, consent, no captain), who may cancel and when, the merchant's
// typed rejection, failed delivery → return to the shop with the shop's return code, the fault result and unsellable
// credit, captain pay for a failed trip, the PAY-09 pause, the stale-demand sweep, and the cash cap with goods cash.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateChange, openAt } from '../server/domain/shop.ts';
import { apiCaller } from './support/api.mjs';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid';

// ---- pure rules first ----
const base = { goodsAfter: 4000, fees: 1200, ceiling: 50000, askFirst: false, minimum: 3000, cap: 4500 };
assert.equal(evaluateChange({ ...base, goodsAfter: 49000 }), 'refuse_ceiling', 'step 1 wins over everything');
assert.equal(evaluateChange({ ...base, askFirst: true, goodsAfter: 100 }), 'pause', 'ask-first pauses even below the minimum');
assert.equal(evaluateChange({ ...base, goodsAfter: 2999 }), 'below_minimum');
assert.equal(evaluateChange({ ...base, goodsAfter: 4501 }), 'pause', 'past the goods cap asks');
assert.equal(evaluateChange(base), 'apply');
// Opening hours in Palestine time; a night shift runs past midnight.
const at = Date.UTC(2026, 10, 16, 10, 0); // Monday 12:00 in Hebron (UTC+2)
assert.equal(openAt([], at), true, 'no hours recorded: open while active');
assert.equal(openAt([{ weekday: 1, open_min: 8 * 60, close_min: 14 * 60 }], at), true);
assert.equal(openAt([{ weekday: 1, open_min: 13 * 60, close_min: 20 * 60 }], at), false);
assert.equal(openAt([{ weekday: 0, open_min: 20 * 60, close_min: 13 * 60 }], at), true, 'Sunday night into Monday noon');

const dir = mkdtempSync(join(tmpdir(), 'wind-shop-rules-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,shop';
delete process.env.WIND_SHOP_TOWN;
delete process.env.OSRM_URL;
const { db, shutdown, server, promote, shopSweep, expireStaleDemand } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => String(url).startsWith('https://fcm.googleapis.com/') ? Promise.resolve(new Response(null, { status: 201 })) : realFetch(url, init);
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, realFetch);
const err = async (path, options, status, code) => assert.equal((await call(path, { ...options, expect: status })).error, code, `${path} → ${code}`);
const MIN = 60_000;

try {
  const admin = await call('/auth/register', { body: { phone: '0599520001', name: 'Admin', password: 'secret1' } });
  await promote('0599520001');
  const owner = await call('/auth/register', { body: { phone: '0599520002', name: 'Grocer', password: 'secret1' } });
  const customer = await call('/auth/register', { body: { phone: '0599520003', name: 'Rana', password: 'secret1' } });
  const captain = await call('/auth/register', { body: { phone: '0599520004', name: 'Omar', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${captain.user.id}/approve`, { token: admin.token, body: {} });
  const shopPoint = { latitude: 32.3120, longitude: 35.0290 }, home = { latitude: 32.3150, longitude: 35.0250 };
  const { merchant } = await call('/merchant/apply', { token: owner.token, body: { name: 'Corner Grocery', category: 'grocery', city: 'tulkarm', point: shopPoint,
    phone: '0599520002', licenceNo: 'TL-9', licenceExpiresAt: Date.now() + 365 * 86_400_000 } });
  await call(`/admin/merchants/${merchant.id}`, { token: admin.token, body: { status: 'active', minOrderAgorot: 2000, deliveryFeeAgorot: 1000, serviceFeeAgorot: 0, commissionBps: 500 } });
  const rice = await call('/merchant/items', { token: owner.token, body: { section: 'Pantry', nameAr: 'أرز', nameEn: 'Rice', priceAgorot: 1500 } });
  const milk = await call('/merchant/items', { token: owner.token, body: { section: 'Dairy', nameAr: 'حليب', nameEn: 'Milk', priceAgorot: 800 } });
  const milk2 = await call('/merchant/items', { token: owner.token, body: { section: 'Dairy', nameAr: 'حليب آخر', nameEn: 'Other milk', priceAgorot: 900 } });
  const place = (lines = [{ itemId: rice.id, qtyMilli: 1000, policy: 'remove' }, { itemId: milk.id, qtyMilli: 1000, policy: 'ask_first' }]) =>
    call('/orders', { token: customer.token, body: { service: 'shop', merchantId: merchant.id, lines, dropoffCity: 'tulkarm', dropoffPoint: home,
      dropoffNote: 'Gate', contact: '0599520003', requestId: randomUUID() } });
  const row = id => db.prepare('SELECT o.status, s.* FROM orders o JOIN shop_orders s ON s.order_id = o.id WHERE o.id = ?').get(id);

  // ---- the merchant declines with a typed reason (DLV-07) ----
  let o = await place();
  await err(`/merchant/orders/${o.id}/reject`, { token: owner.token, body: { reason: 'bored' } }, 400, 'invalid_input');
  o = await call(`/merchant/orders/${o.id}/reject`, { token: owner.token, body: { reason: 'out_of_stock' } });
  assert.equal(o.status, 'cancelled');
  assert.equal(o.shop.cancelReason, 'out_of_stock');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_ledger WHERE order_id = ?').get(o.id).n, 0, 'a rejection moves no money');

  // ---- no answer: the accept timer cancels at no charge, once; one extension is allowed (DLV-07, A11Y-08) ----
  o = await place();
  await call(`/merchant/orders/${o.id}/extend`, { token: owner.token, body: {} });
  await err(`/merchant/orders/${o.id}/extend`, { token: owner.token, body: {} }, 409, 'already_extended');
  await shopSweep(Date.now() + 6 * MIN);
  assert.equal(row(o.id).status, 'requested', 'the extension holds');
  await shopSweep(Date.now() + 11 * MIN);
  assert.equal(row(o.id).status, 'cancelled');
  assert.equal(row(o.id).cancel_reason, 'accept_expired');
  assert.equal(await shopSweep(Date.now() + 12 * MIN), 0, 'a second pass changes nothing');

  // ---- the customer cancels free before acceptance (D-2) ----
  o = await place();
  o = await call(`/orders/${o.id}/cancel`, { token: customer.token, body: {} });
  assert.equal(o.shop.cancelReason, 'customer_before_accept');
  await err(`/orders/${o.id}/cancel`, { token: admin.token, body: {} }, 409, 'use_shop_cancel');

  // ---- consent timeout declines; a decline below the minimum cancels below_minimum (DLV-06) ----
  o = await place();
  await call(`/merchant/orders/${o.id}/accept`, { token: owner.token, body: { prepMinutes: 40 } });
  // support may cancel at the customer's request only while the shop has merely accepted
  await err(`/admin/orders/${o.id}/shop/cancel`, { token: admin.token, body: { reason: 'below_minimum', note: 'Trying a reserved reason' } }, 409, 'reason_reserved');
  await call(`/merchant/orders/${o.id}/preparing`, { token: owner.token, body: {} });
  await err(`/admin/orders/${o.id}/shop/cancel`, { token: admin.token, body: { reason: 'customer_via_support_accepted', note: 'Customer called support' } }, 409, 'cancel_refused');
  const milkLine = (await call(`/orders/${o.id}`, { token: owner.token })).shop.lines.find(l => l.itemId === milk.id);
  await call(`/merchant/orders/${o.id}/lines/${milkLine.id}`, { token: owner.token, body: { substituteItemId: milk2.id } });
  assert.equal(row(o.id).merchant_state, 'awaiting_approval');
  const dispatchBefore = row(o.id).dispatch_at;
  await shopSweep(Date.now() + 6 * MIN);
  assert.equal(row(o.id).status, 'cancelled', 'rice alone (₪15) is below the ₪20 minimum, so the expired consent cancels');
  assert.equal(row(o.id).cancel_reason, 'below_minimum');
  assert.ok(dispatchBefore > 0);

  // ---- no captain is called while the customer is still deciding on the basket (DLV-06 pause holds DLV-12 dispatch) ----
  o = await place([{ itemId: rice.id, qtyMilli: 1000, policy: 'remove' }, { itemId: milk.id, qtyMilli: 1000, policy: 'ask_first' }]);
  await call(`/merchant/orders/${o.id}/accept`, { token: owner.token, body: { prepMinutes: 16 } }); // dispatch due in one minute
  await call(`/merchant/orders/${o.id}/preparing`, { token: owner.token, body: {} });
  const askLine = (await call(`/orders/${o.id}`, { token: owner.token })).shop.lines.find(l => l.itemId === milk.id);
  await call(`/merchant/orders/${o.id}/lines/${askLine.id}`, { token: owner.token, body: { substituteItemId: milk2.id } });
  await shopSweep(Date.now() + 2 * MIN);
  assert.equal(row(o.id).status, 'requested', 'no captain while consent is open');
  const askChange = (await call(`/orders/${o.id}`, { token: customer.token })).shop.change;
  await call(`/orders/${o.id}/shop/consent`, { token: customer.token, body: { changeId: askChange.id, decision: 'approve' } });
  await shopSweep(Date.now() + 3 * MIN);
  assert.equal(row(o.id).status, 'searching', 'after the answer, the paused time moved dispatch and it went out');
  await call(`/admin/orders/${o.id}/shop/cancel`, { token: admin.token, body: { reason: 'no_captain', note: 'Clearing the board for the next case' } });

  // ---- no captain by ready + 10 minutes: flagged once, never cancelled; T21 never expires a shop order (DLV-12) ----
  o = await place([{ itemId: rice.id, qtyMilli: 2000, policy: 'remove' }]);
  await call(`/merchant/orders/${o.id}/accept`, { token: owner.token, body: { prepMinutes: 10 } });
  await call(`/merchant/orders/${o.id}/preparing`, { token: owner.token, body: {} });
  o = await call(`/merchant/orders/${o.id}/ready`, { token: owner.token, body: { packages: [{ sealed: true }] } });
  assert.equal(o.status, 'searching');
  await shopSweep(Date.now() + 11 * MIN);
  assert.ok(row(o.id).no_captain_alerted_at, 'flagged');
  assert.equal(row(o.id).status, 'searching');
  await expireStaleDemand(Date.now() + 25 * 3_600_000);
  assert.equal(row(o.id).status, 'searching', 'the 24-hour sweep leaves a shop order to support');
  const attention = await call('/admin/shop/attention', { token: admin.token });
  assert.ok(attention.orders.some(a => a.id === o.id), 'the stuck list shows it');
  await err(`/admin/orders/${o.id}/shop/cancel`, { token: admin.token, body: { reason: 'no_captain', note: 'x' } }, 400, 'invalid_input');
  o = await call(`/admin/orders/${o.id}/shop/cancel`, { token: admin.token, body: { reason: 'no_captain', note: 'No captain after an hour' } });
  assert.equal(o.shop.cancelReason, 'no_captain');

  // ---- the cash cap counts the goods a captain will collect (CON-05, ONE-10) ----
  o = await place([{ itemId: rice.id, qtyMilli: 2000, policy: 'remove' }]);
  await call(`/merchant/orders/${o.id}/accept`, { token: owner.token, body: { prepMinutes: 5 } });
  await call(`/merchant/orders/${o.id}/preparing`, { token: owner.token, body: {} });
  await call(`/merchant/orders/${o.id}/ready`, { token: owner.token, body: { packages: [{ sealed: true }] } });
  await call('/admin/settings', { token: admin.token, body: { orderCashCeiling: 25, driverCashCap: 25 } });
  await err(`/jobs/${o.id}/accept`, { token: captain.token, body: {} }, 409, 'cash_cap_exceeded');
  await call('/admin/settings', { token: admin.token, body: { driverCashCap: 1000, orderCashCeiling: 500 } });
  o = await call(`/jobs/${o.id}/accept`, { token: captain.token, body: {} });

  // ---- a captain cannot cancel at the shop; after collection a failure is a hold (§2.1) ----
  const adv = (expectedStatus, extra = {}) => call(`/orders/${o.id}/advance`, { token: captain.token, body: { expectedStatus, requestId: randomUUID(), ...extra } });
  o = await adv('assigned');
  await err(`/orders/${o.id}/exception`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), reason: 'absent' } }, 409, 'shop_captain_cannot_cancel');
  const pickupCode = (await call(`/orders/${o.id}`, { token: owner.token })).shop.pickupCode;
  o = await call(`/orders/${o.id}/shop/handover`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(), code: pickupCode, check: { result: 'ok' } } });
  await err(`/orders/${o.id}/exception`, { token: captain.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'refused' } }, 400, 'invalid_input'); // the sealed bag's state is required
  o = await call(`/orders/${o.id}/exception`, { token: captain.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'refused', seals: [{ no: 1, intact: true }] } });
  assert.equal(o.status, 'on_hold');
  await err(`/admin/orders/${o.id}/resolve`, { token: admin.token, body: { action: 'reattempt', reason: 'Try once more' } }, 409, 'cannot_resolve'); // only `rescheduled` may be reattempted (DLV-25)
  o = await call(`/admin/orders/${o.id}/resolve`, { token: admin.token, body: { action: 'return', reason: 'Customer refused at the door' } });
  assert.equal(o.status, 'returning');
  assert.equal((await call(`/orders/${o.id}`, { token: customer.token })).returnCode, null, 'the customer does not hold a shop return code');
  const returnCode = (await call(`/orders/${o.id}`, { token: owner.token })).shop.returnCode;
  assert.match(returnCode, /^\d{4}$/, 'the shop holds it (DLV-21)');
  o = await adv('returning', { code: returnCode });
  assert.equal(o.status, 'returned');
  const returnedId = o.id;
  assert.equal(db.prepare('SELECT commission FROM orders WHERE id = ?').get(o.id).commission, 0, 'no commission on a failed delivery');
  assert.equal(db.prepare("SELECT SUM(amount_agorot) n FROM shop_ledger WHERE book = 'captain' AND order_id = ?").get(o.id).n, 2000, 'the trip and the return leg (DRV-17)');
  assert.equal(db.prepare("SELECT SUM(amount_agorot) n FROM shop_ledger WHERE book = 'wind' AND order_id = ?").get(o.id).n, -2000, 'paid from operating expenses');
  const cash = await call('/driver/cash', { token: captain.token });
  assert.equal(cash.owedCents, -2000, 'Wind owes the captain the failed trip');

  // ---- fault result once; unsellable credit only after it, and only when the fault is not the shop's (DLV-22/25) ----
  const riceLine = (await call(`/orders/${o.id}`, { token: admin.token })).shop.lines[0].id;
  await err(`/admin/orders/${o.id}/shop/unsellable`, { token: admin.token, body: { lineId: riceLine, note: 'Bag torn on the way back' } }, 409, 'fault_required');
  await call(`/admin/orders/${o.id}/shop/fault`, { token: admin.token, body: { result: 'none', note: 'Customer refused, goods as packed' } });
  await err(`/admin/orders/${o.id}/shop/fault`, { token: admin.token, body: { result: 'wind', note: 'Second try' } }, 409, 'fault_exists');
  await call(`/admin/orders/${o.id}/shop/unsellable`, { token: admin.token, body: { lineId: riceLine, note: 'Bag torn on the way back' } });
  assert.equal(db.prepare("SELECT SUM(amount_agorot) n FROM shop_ledger WHERE book = 'merchant' AND order_id = ?").get(o.id).n, 3000 - 150, 'goods value less commission');

  // ---- a delivery must record the door cash; a short door is Wind's loss, and the captain owes what he collected (DLV-15, DLV-22) ----
  o = await place([{ itemId: rice.id, qtyMilli: 2000, policy: 'remove' }]);
  await call(`/merchant/orders/${o.id}/accept`, { token: owner.token, body: { prepMinutes: 5 } });
  await call(`/merchant/orders/${o.id}/preparing`, { token: owner.token, body: {} });
  await call(`/merchant/orders/${o.id}/ready`, { token: owner.token, body: { packages: [{ sealed: false, lineIds: [(await call(`/orders/${o.id}`, { token: owner.token })).shop.lines[0].id] }] } });
  o = await call(`/jobs/${o.id}/accept`, { token: captain.token, body: {} });
  o = await adv('assigned');
  o = await call(`/orders/${o.id}/shop/handover`, { token: captain.token, body: { expectedStatus: 'at_pickup', requestId: randomUUID(),
    code: (await call(`/orders/${o.id}`, { token: owner.token })).shop.pickupCode, check: { result: 'ok' } } });
  const code = (await call(`/orders/${o.id}`, { token: customer.token })).handoverCode;
  await err(`/orders/${o.id}/advance`, { token: captain.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), code } }, 400, 'invalid_input');
  const owedBefore = (await call('/driver/cash', { token: captain.token })).owedCents;
  o = await adv('in_transit', { code, collectedCents: 3000 + 1000 - 500, varianceReason: 'PARTIAL_PAYMENT' });
  assert.equal(db.prepare("SELECT SUM(amount_agorot) n FROM shop_ledger WHERE book = 'wind' AND kind = 'door_short' AND order_id = ?").get(o.id).n, -500);
  assert.equal(db.prepare("SELECT SUM(amount_agorot) n FROM shop_ledger WHERE book = 'merchant' AND kind = 'goods' AND order_id = ?").get(o.id).n, 3000, 'the shop is owed its goods in full');
  const owedAfter = (await call('/driver/cash', { token: captain.token })).owedCents;
  assert.equal(owedAfter - owedBefore, 3000 - 500 + Math.round(10 * 0.15 * 100), 'the captain owes the goods he collected plus his commission');
  // a shop-fault refund gives back the commission taken on the refunded goods (MER-09)
  await call(`/admin/orders/${o.id}/shop/fault`, { token: admin.token, body: { result: 'merchant', note: 'Rice bag was out of date' } });
  await call(`/admin/merchants/${merchant.id}`, { token: admin.token, body: { commissionBps: 2000 } }); // a later rate change does not change what this order paid
  await call(`/admin/orders/${o.id}/shop/refund`, { token: admin.token, body: { amountAgorot: 1000, reason: 'Out-of-date rice bag' } });
  assert.equal(db.prepare("SELECT SUM(amount_agorot) n FROM shop_ledger WHERE book = 'merchant' AND order_id = ?").get(o.id).n, 3000 - 150 - 1000 + 50);

  // ---- PAY-09: a second refused order with fault none pauses cash shop orders until support reviews ----
  db.prepare("UPDATE orders SET status = 'returned', exception_reason = 'refused', updated_at = ? WHERE id = (SELECT MAX(id) FROM orders WHERE customer_id = ? AND status = 'cancelled')").run(Date.now(), customer.user.id);
  db.prepare("INSERT INTO shop_faults (order_id, result, actor_id, note, created_at) SELECT MAX(id), 'none', ?, 'Refused twice', ? FROM orders WHERE customer_id = ? AND status = 'returned' AND id <> ?")
    .run(admin.user.id, Date.now(), customer.user.id, returnedId);
  await err('/orders', { token: customer.token, body: { service: 'shop', merchantId: merchant.id, lines: [{ itemId: rice.id, qtyMilli: 2000, policy: 'remove' }],
    dropoffCity: 'tulkarm', dropoffPoint: home, dropoffNote: 'Gate', contact: '0599520003' } }, 409, 'shop_cash_paused');
  await call(`/admin/users/${customer.user.id}/shop-review`, { token: admin.token, body: { note: 'Called the customer, both were misunderstandings' } });
  await place([{ itemId: rice.id, qtyMilli: 2000, policy: 'remove' }]);

  // ---- an expired licence pauses the shop at the next sweep; new orders are refused (MER-08) ----
  db.prepare('UPDATE merchants SET licence_expires_at = ? WHERE id = ?').run(Date.now() - 1, merchant.id);
  await shopSweep(Date.now());
  assert.equal(db.prepare('SELECT status FROM merchants WHERE id = ?').get(merchant.id).status, 'paused');
  await err('/orders', { token: customer.token, body: { service: 'shop', merchantId: merchant.id, lines: [{ itemId: rice.id, qtyMilli: 2000, policy: 'remove' }],
    dropoffCity: 'tulkarm', dropoffPoint: home, dropoffNote: 'Gate', contact: '0599520003' } }, 409, 'shop_paused');

  console.log('Shop rules: change evaluator, hours, typed reject, accept timer and extension, free cancel window, consent timeout below minimum, no-captain flag and T21 exclusion, cash cap with goods, captain cannot cancel, hold and return to the shop, captain trip pay, fault and unsellable credit, PAY-09 pause and review, licence pause passed');
} finally {
  globalThis.fetch = realFetch;
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
