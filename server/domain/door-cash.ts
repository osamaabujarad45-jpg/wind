// WP-01: the cash the driver says the customer handed over at the door, with a typed reason when it differs from
// what was due. Evidence only: it never feeds commission, journals, the cash cap or the owed maths.
import { varianceReasons } from '../../src/model.ts';

type Fail = (status: number, message: string) => never;
const MAX_CENTS = 100_000_000; // 1,000,000 shekels: far above any fare, below any float or overflow edge

/** Validates the optional door-cash fields of a completing advance. Null when the client sent none (older apps). */
export function doorCash(price: number, discount: number | null, body: Record<string, unknown>, fail: Fail) {
  const { collectedCents, varianceReason } = body;
  if (collectedCents === undefined && varianceReason === undefined) return null;
  if (typeof collectedCents !== 'number' || !Number.isSafeInteger(collectedCents) || collectedCents < 0 || collectedCents > MAX_CENTS) fail(400, 'invalid_input');
  const dueCents = Math.round((price - (discount ?? 0)) * 100);
  const reason = (varianceReason ?? null) as string | null;
  if (collectedCents === dueCents ? reason !== null : !varianceReasons.includes(reason as 'other')) fail(400, 'invalid_input');
  return { collectedCents: collectedCents as number, varianceReason: reason };
}
