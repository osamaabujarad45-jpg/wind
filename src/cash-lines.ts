type Words = { cashFromCommission: string; cashFromShop: string; promoCredits: string; cashAdjustments: string; cashHandedOver: string };
/** The driver's cash balance as `GET /api/driver/cash` returns it, in agorot. */
export type CashBalance = { owedCents: number; commissionCents: number; discountsCents: number; adjustmentsCents: number; remittedCents: number; shopCents?: number };

/**
 * How the driver's balance with Wind is made (research priority #9: earnings derived from their real records), in the
 * direction of "owed to Wind": a plus adds to what the driver owes, a minus takes it off. Each line is a server total;
 * pending and disputed handovers are not in any of them (only confirmed handovers count).
 * Returns no lines when the parts do not add up to the balance, so the screen never shows arithmetic that disagrees with it.
 */
export function cashLines(c: Words, cash: CashBalance): [string, number][] {
  const shop = cash.shopCents ?? 0;
  if (cash.commissionCents - cash.discountsCents + cash.adjustmentsCents - cash.remittedCents + shop !== cash.owedCents) return [];
  const lines: [string, number][] = [[c.cashFromCommission, cash.commissionCents]];
  if (shop) lines.push([c.cashFromShop, shop]);
  if (cash.discountsCents) lines.push([c.promoCredits, -cash.discountsCents]);
  if (cash.adjustmentsCents) lines.push([c.cashAdjustments, cash.adjustmentsCents]);
  if (cash.remittedCents) lines.push([c.cashHandedOver, -cash.remittedCents]);
  return lines;
}
