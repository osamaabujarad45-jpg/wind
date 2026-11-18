import assert from 'node:assert/strict';
import { copy } from '../src/copy.ts';
import { cashLines } from '../src/cash-lines.ts';

// Earnings truth (research priority #9): the driver sees how the cash balance with Wind is made from the server's totals.
for (const language of ['ar', 'en']) {
  const c = copy[language];
  for (const key of ['cashFromCommission', 'cashFromShop', 'promoCredits', 'cashAdjustments', 'cashHandedOver', 'cashPendingTotal', 'cashOwedHint'])
    assert.ok(c[key]?.trim(), `${language}: ${key}`);
  // Every part, signed in the "owed to Wind" direction, adds up to the balance.
  const all = { owedCents: 1500 - 300 + 200 - 1000 + 450, commissionCents: 1500, discountsCents: 300, adjustmentsCents: 200, remittedCents: 1000, shopCents: 450 };
  const lines = cashLines(c, all);
  assert.deepEqual(lines, [[c.cashFromCommission, 1500], [c.cashFromShop, 450], [c.promoCredits, -300], [c.cashAdjustments, 200], [c.cashHandedOver, -1000]]);
  assert.equal(lines.reduce((sum, [, cents]) => sum + cents, 0), all.owedCents);
  // A negative correction and a balance Wind owes the driver keep their signs.
  assert.deepEqual(cashLines(c, { owedCents: -250, commissionCents: 500, discountsCents: 0, adjustmentsCents: -250, remittedCents: 500 }),
    [[c.cashFromCommission, 500], [c.cashAdjustments, -250], [c.cashHandedOver, -500]]);
  // Zero parts are left out; commission always shows, even at zero.
  assert.deepEqual(cashLines(c, { owedCents: 0, commissionCents: 0, discountsCents: 0, adjustmentsCents: 0, remittedCents: 0 }), [[c.cashFromCommission, 0]]);
  // Parts that disagree with the balance (an older server, a pending handover counted by mistake) show no breakdown at all.
  assert.deepEqual(cashLines(c, { ...all, owedCents: all.owedCents - 500 }), []);
}
