import assert from 'node:assert/strict';
import { copy, fill } from '../src/copy.ts';
import { varianceReasons } from '../src/model.ts';
import { fareLines, paymentLine, receiptTotal } from '../src/receipt-payment.ts';

// Money truth (research priority #2): a completed order with cash expected at the door is not proof the customer paid.
const money = n => `₪${n}`;
for (const language of ['ar', 'en']) {
  const c = copy[language];
  const unpaid = language === 'ar' ? /مدفوع|دُفع|دفع|مسدّد/ : /\bpaid\b/i;
  // The customer: cash to the driver, not confirmed by Wind; never "paid".
  assert.equal(paymentLine(c, 'customer', undefined, money, fill), c.paymentUnconfirmed);
  assert.doesNotMatch(c.paymentUnconfirmed, unpaid, `${language}: unconfirmed cash is not called paid`);
  // The driver and admins: what the driver recorded, as their own evidence, or that nothing is recorded yet.
  for (const role of ['driver', 'admin']) assert.equal(paymentLine(c, role, undefined, money, fill), c.paymentNotRecorded, `${language} ${role}`);
  assert.doesNotMatch(c.paymentNotRecorded, unpaid);
  assert.equal(paymentLine(c, 'driver', { cents: 4500, reason: null }, money, fill), fill(c.cashRecordedByDriver, { a: '₪45' }));
  assert.equal(paymentLine(c, 'admin', { cents: 0, reason: 'CUSTOMER_DID_NOT_PAY' }, money, fill),
    `${fill(c.cashRecordedByDriver, { a: '₪0' })} · ${c.variance_CUSTOMER_DID_NOT_PAY}`, `${language}: a refusal shows ₪0 and its reason`);
  assert.doesNotMatch(c.cashRecordedByDriver, unpaid);
  for (const reason of varianceReasons) assert.ok(c[`variance_${reason}`]?.trim(), `${language}: ${reason} has a label`);
}
// The total is what the customer owes at the door: goods plus fees for a shop order, the fare less a Wind-funded promo otherwise.
assert.equal(receiptTotal({ price: 50, discount: 5 }), 45);
assert.equal(receiptTotal({ price: 12, discount: 0, shop: { cashAgorot: 8650 } }), 86.5);
// Quote/receipt explanation (research priority #3): the fare basis comes only from what the order stored at booking.
for (const language of ['ar', 'en']) {
  const c = copy[language];
  for (const key of ['distance', 'km', 'recommendedPrice', 'fare', 'promoDiscount']) assert.ok(c[key]?.trim(), `${language}: ${key}`);
  // Accepted at Wind's suggested fare: the distance it used, no fare line repeating the total.
  assert.deepEqual(fareLines(c, { price: 40, discount: 0, routeKm: 34.2, recommendedPrice: 40 }, money), [[c.distance, `34.2 ${c.km}`]]);
  // A driver's offer (or a cash-ceiling cut) changed the fare: the suggestion, then the fare charged.
  assert.deepEqual(fareLines(c, { price: 45, discount: 0, routeKm: 34, recommendedPrice: 40 }, money),
    [[c.distance, `34 ${c.km}`], [c.recommendedPrice, '₪40'], [c.fare, '₪45']]);
  // Both: suggestion, fare, then the Wind-funded promo; the total below is the fare less the promo.
  assert.deepEqual(fareLines(c, { price: 45, discount: 5, routeKm: 34, recommendedPrice: 40 }, money),
    [[c.distance, `34 ${c.km}`], [c.recommendedPrice, '₪40'], [c.fare, '₪45'], [c.promoDiscount, '₪-5']]);
  // A flat parcel fare stores no suggestion: the distance did not set it, so none is shown.
  assert.deepEqual(fareLines(c, { price: 20, discount: 0, routeKm: 34.2, recommendedPrice: null }, money), []);
  assert.deepEqual(fareLines(c, { price: 50, discount: 5, routeKm: null, recommendedPrice: null }, money),
    [[c.fare, '₪50'], [c.promoDiscount, '₪-5']]);
  // Same-city centre to centre stores 0 km: no "0 km" line. Shop orders store nothing: nothing invented.
  assert.deepEqual(fareLines(c, { price: 15, discount: 0, routeKm: 0, recommendedPrice: 15 }, money), []);
  assert.deepEqual(fareLines(c, { price: 12, discount: 0 }, money), []);
}
console.log('PASS: receipts never claim unconfirmed cash was paid; recorded collection, refusal reason and shop totals shown; fare basis from stored booking facts only');
