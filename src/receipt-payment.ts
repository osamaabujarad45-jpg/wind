import type { Role, VarianceReason } from './model.ts';

type Words = { paymentUnconfirmed: string; paymentNotRecorded: string; cashRecordedByDriver: string } & Record<`variance_${VarianceReason}`, string>;
type Collected = { cents: number; reason: VarianceReason | null } | undefined;

/**
 * The fare receipt's payment line (money truth): an expected or selected payment is never proof of payment.
 * - The driver and admins see what the driver recorded at the door (evidence only, not confirmed by Wind), or that
 *   nothing is recorded yet.
 * - Everyone else sees that the cash goes to the driver at delivery and is not confirmed by Wind.
 * ponytail: cash only; when card payments ship, a captured card intent must say so here before any cash text.
 */
export function paymentLine(c: Words, role: Role | undefined, collected: Collected, money: (shekels: number) => string, fill: (text: string, values: Record<string, string>) => string): string {
  if (collected) {
    const amount = fill(c.cashRecordedByDriver, { a: money(collected.cents / 100) });
    return collected.reason ? `${amount} · ${c[`variance_${collected.reason}`]}` : amount;
  }
  return role === 'driver' || role === 'admin' ? c.paymentNotRecorded : c.paymentUnconfirmed;
}

/** What the customer pays at the door: shop orders carry goods plus fees; other orders the fare less any Wind-funded promo. */
export const receiptTotal = (order: { price: number; discount: number; shop?: { cashAgorot: number } }) =>
  order.shop ? order.shop.cashAgorot / 100 : order.price - order.discount;

type FareWords = { roadDistance: string; km: string; recommendedPrice: string; agreedFare: string; fare: string; promoDiscount: string };
type Fare = { price: number; discount: number; routeKm?: number | null; recommendedPrice?: number | null };

/**
 * How the fare was set, from what the order stored when it was booked (never re-priced from today's tariff):
 * the road distance the suggested price used, Wind's suggested fare when the agreed fare differs from it, and any Wind-funded promo.
 */
export function fareLines(c: FareWords, order: Fare, money: (shekels: number) => string): [string, string][] {
  const lines: [string, string][] = [];
  if (order.routeKm != null) lines.push([c.roadDistance, `${order.routeKm} ${c.km}`]);
  const negotiated = order.recommendedPrice != null && order.recommendedPrice !== order.price;
  if (negotiated) lines.push([c.recommendedPrice, money(order.recommendedPrice!)]);
  if (negotiated || order.discount > 0) lines.push([negotiated ? c.agreedFare : c.fare, money(order.price)]);
  if (order.discount > 0) lines.push([c.promoDiscount, money(-order.discount)]);
  return lines;
}
