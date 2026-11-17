import assert from 'node:assert/strict';
import { copy, fill } from '../src/copy.ts';
import { varianceReasons } from '../src/model.ts';
import { paymentLine, receiptTotal } from '../src/receipt-payment.ts';

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
console.log('PASS: receipts never claim unconfirmed cash was paid; recorded collection, refusal reason and shop totals shown');
