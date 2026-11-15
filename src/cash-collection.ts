import { parseMinorUnits } from './model.ts';

export const cashVarianceReasons = ['PARTIAL_PAYMENT', 'CUSTOMER_DID_NOT_PAY', 'APPROVED_DISCOUNT', 'RETURNED_ITEMS', 'INCORRECT_CASH', 'OTHER_ADMIN_REVIEW'] as const;
export type CashVarianceReason = typeof cashVarianceReasons[number];
export type CashCollectionInput = { collectedMinor: number; varianceReason?: CashVarianceReason | null };
export type CashCollection = { expectedMinor: number; collectedMinor: number; varianceReason: CashVarianceReason | null;
  actorId: number; requestId: string; collectedAt: number };
const minor = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function isCashCollectionInput(value: unknown): value is CashCollectionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as CashCollectionInput;
  return Object.keys(c).every(key => ['collectedMinor', 'varianceReason'].includes(key)) && minor(c.collectedMinor)
    && (c.varianceReason == null || cashVarianceReasons.includes(c.varianceReason));
}

/** A driver's reason records a claim; it never approves a discount or forgives a balance. */
export function validCashVariance(expectedMinor: number, collectedMinor: number, reason: unknown): boolean {
  if (!minor(expectedMinor) || !minor(collectedMinor)) return false;
  if (expectedMinor === collectedMinor) return reason == null;
  if (reason === 'INCORRECT_CASH' || reason === 'OTHER_ADMIN_REVIEW') return true;
  if (collectedMinor >= expectedMinor) return false;
  if (reason === 'PARTIAL_PAYMENT') return collectedMinor > 0;
  if (reason === 'CUSTOMER_DID_NOT_PAY') return collectedMinor === 0;
  return reason === 'APPROVED_DISCOUNT' || reason === 'RETURNED_ITEMS';
}

export function expectedCashMinor(price: number, discount: number): number | null {
  const fare = parseMinorUnits(String(price)), reduction = parseMinorUnits(String(discount));
  return fare !== null && reduction !== null && fare >= 0 && reduction >= 0 && reduction <= fare ? fare - reduction : null;
}
