import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copy } from '../src/copy.ts';
import { varianceReasons } from '../src/model.ts';

// Money truth (research priority #2): a completed order with cash expected at the door is not proof the customer paid.
// The receipt never says "paid" for unconfirmed cash, and shows the driver's recorded collection to whoever may see it.
for (const language of ['ar', 'en']) {
  const c = copy[language];
  assert.doesNotMatch(c.paymentUnconfirmed, language === 'ar' ? /مدفوع|دُفع/ : /\bpaid\b/i, `${language}: unconfirmed cash is not called paid`);
  assert.match(c.cashCollected, /\{a\}/, `${language}: the collected amount is shown`);
  for (const reason of varianceReasons) assert.ok(c[`variance_${reason}`]?.trim(), `${language}: ${reason} has a label`);
}
const receipt = readFileSync(new URL('../src/app/receipt/[id].tsx', import.meta.url), 'utf8');
assert.match(receipt, /\[c\.payWith, order\.collected\s*\?/, 'the payment line comes from the recorded collection when the viewer may see it');
assert.match(receipt, /: c\.paymentUnconfirmed\]/, 'and otherwise says the cash is not confirmed');
console.log('PASS: receipts never claim unconfirmed cash was paid; recorded collection and variance shown');
