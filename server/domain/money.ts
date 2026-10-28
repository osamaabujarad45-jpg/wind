/** Legacy API cash values are integer minor units; never serialize a rounded/overflowed balance. */
export function cashOwed(commission: number, discounts: number, adjustments: number, remitted: number) {
  const amounts = [commission, discounts, adjustments, remitted];
  if (!amounts.every(Number.isSafeInteger)) throw new RangeError('Cash aggregate exceeds the API safe-integer range');
  const result = BigInt(commission) - BigInt(discounts) + BigInt(adjustments) - BigInt(remitted);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError('Cash balance exceeds the API safe-integer range');
  return Number(result);
}
