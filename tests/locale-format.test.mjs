import assert from 'node:assert/strict';
import { copy, fill } from '../src/copy.ts';
import { formatMoney } from '../src/format-money.ts';

const amounts = [
  [0, '₪\u00a00'],
  [1, '₪\u00a01'],
  [12.5, '₪\u00a012.50'],
  [1250, '₪\u00a01,250'],
  [1234567.89, '₪\u00a01,234,567.89'],
  [-1250.5, '−\u2060₪\u00a01,250.50'], // the word joiner keeps the minus on the amount’s line
  [-0.004, '₪\u00a00.00'],
  [NaN, '—'],
  [Infinity, '—'],
];
for (const language of ['ar', 'en']) {
  for (const [amount, expected] of amounts) {
    assert.equal(formatMoney(amount, language, copy[language].nis), expected);
  }
}

for (const n of [0, 1, 2, 3, 11, 100, 101, 102]) {
  assert.equal(fill(copy.ar.tripsCount, { n }), `الرحلات: ${n}`);
  assert.equal(fill(copy.en.tripsCount, { n }), `Trips: ${n}`);
  assert.equal(fill(copy.ar.merchantNewOrders, { n }), `طلبات جديدة بانتظار القبول: ${n}`);
}
console.log('Money preserves grouped Latin digits and Arabic count labels work across plural categories');
