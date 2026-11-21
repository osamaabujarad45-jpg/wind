import { BOOKING_COMMAND_TTL_MS, newRequestId } from './booking.ts';
import { serverOffset } from './api-clock.ts';

type Basket = { merchantId: number; lines: { itemId: number; qtyMilli: number; policy: string }[] };
export type ShopCheckout = { basket: string; requestId: string; commandExpiresAt: number };
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
