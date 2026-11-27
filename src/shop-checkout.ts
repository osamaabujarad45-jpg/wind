import { BOOKING_COMMAND_TTL_MS, newRequestId } from './booking.ts';
import { serverOffset } from './api-clock.ts';
import { isCity, normalizePhone, type CityId, type Point } from './model.ts';

type Basket = { merchantId: number; lines: { itemId: number; qtyMilli: number; policy: string }[] };
export type ShopCheckout = { basket: string; requestId: string; commandExpiresAt: number };
export const shopCheckoutLimits = [0, 0.1, 0.2] as const;
export type ShopDelivery = { requestId: string; expectedGoodsAgorot: number; agreeLimit: (typeof shopCheckoutLimits)[number];
  expectedDeliveryFeeAgorot?: number; expectedServiceFeeAgorot?: number;
  dropoffCity: CityId; dropoffPoint: Point; dropoffNote: string; contact: string };
export const shopCheckoutKey = (userId: number) => 'shop.checkout.' + userId;
// Identity and basket contents only. The checkout address and phone never enter this record.
export const basketIdentity = (cart: Basket) => JSON.stringify([cart.merchantId, cart.lines.map(l => [l.itemId, l.qtyMilli, l.policy])]);

export function newShopCheckout(cart: Basket, now = Date.now() + serverOffset()): ShopCheckout {
  return { basket: basketIdentity(cart), requestId: newRequestId(), commandExpiresAt: now + BOOKING_COMMAND_TTL_MS };
}

export function readShopCheckout(raw: string | null): ShopCheckout | null {
  if (raw === null) return null;
  const saved = JSON.parse(raw) as ShopCheckout | null;
  if (!saved || typeof saved.basket !== 'string' || typeof saved.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.requestId)
    || !Number.isSafeInteger(saved.commandExpiresAt)) throw new Error('invalid_shop_checkout');
  return saved;
}

export function readShopDelivery(raw: unknown, requestId: string): ShopDelivery | null {
  if (!raw || typeof raw !== 'object') return null;
  const delivery = raw as Partial<ShopDelivery>;
  const point = delivery.dropoffPoint;
  if (delivery.requestId !== requestId || !Number.isSafeInteger(delivery.expectedGoodsAgorot)
    || [delivery.expectedDeliveryFeeAgorot, delivery.expectedServiceFeeAgorot].some(fee => fee !== undefined && (!Number.isSafeInteger(fee) || fee < 0))
    || delivery.agreeLimit === undefined || !shopCheckoutLimits.includes(delivery.agreeLimit)
    || !isCity(delivery.dropoffCity) || !point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || typeof delivery.dropoffNote !== 'string' || delivery.dropoffNote.length < 3 || delivery.dropoffNote.length > 200
    || typeof delivery.contact !== 'string' || normalizePhone(delivery.contact) !== delivery.contact) return null;
  return delivery as ShopDelivery;
}

export function shopCheckoutBody(command: ShopCheckout, delivery: ShopDelivery) {
  const [merchantId, entries] = JSON.parse(command.basket) as [number, [number, number, string][]];
  return {
    ...delivery, service: 'shop', merchantId, commandExpiresAt: command.commandExpiresAt,
    lines: entries.map(([itemId, qtyMilli, policy]) => ({ itemId, qtyMilli, policy })),
  };
}
