// The shop cart (DLV-02): one shop at a time, kept on the device so a failed place or a closed app keeps it (A11Y-14).
// The server prices the basket again at placing; this copy only shows the estimate and remembers the choices.
import { useSyncExternalStore } from 'react';
import { storage } from './storage';
import { lineAgorot, type MerchantItem, type ShopPolicy } from './model';

export type CartLine = { itemId: number; nameAr: string; nameEn: string; unitAgorot: number; byWeight: boolean; qtyMilli: number; policy: ShopPolicy };
export type Cart = { merchantId: number; merchantName: string; city: string; minOrderAgorot: number; deliveryFeeAgorot: number; serviceFeeAgorot: number;
  lines: CartLine[] };

const KEY = 'wind.shopCart.v1';
let cart: Cart | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function valid(raw: unknown): raw is Cart {
  const c = raw as Cart;
  return !!c && Number.isSafeInteger(c.merchantId) && typeof c.merchantName === 'string' && Array.isArray(c.lines)
    && c.lines.every(l => Number.isSafeInteger(l.itemId) && Number.isSafeInteger(l.qtyMilli) && l.qtyMilli > 0 && Number.isSafeInteger(l.unitAgorot));
}
async function load() {
  if (loaded) return;
  loaded = true;
  try { const saved = JSON.parse((await storage.get(KEY)) ?? 'null'); if (valid(saved)) { cart = saved; emit(); } } catch { /* a damaged copy starts empty */ }
}
function save(next: Cart | null) {
  cart = next && next.lines.length ? next : null;
  emit();
  void storage.set(KEY, cart ? JSON.stringify(cart) : null).catch(() => {});
}

export function useCart() {
  void load();
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => cart, () => cart);
}
export const cartGoods = (c: Cart | null) => (c?.lines ?? []).reduce((sum, l) => sum + lineAgorot(l.unitAgorot, l.qtyMilli), 0);
/** Another shop's item: the caller asks before clearing (DLV-02). */
export const otherShop = (merchantId: number) => !!cart && cart.merchantId !== merchantId;
/** Sets an item's quantity (0 removes it). A weighed item steps by 250 g, a counted one by one. */
export function setQuantity(shop: Omit<Cart, 'lines'>, item: MerchantItem, qtyMilli: number) {
  const base: Cart = cart && cart.merchantId === shop.merchantId ? { ...cart, ...shop } : { ...shop, lines: [] };
  const lines = base.lines.filter(l => l.itemId !== item.id);
  if (qtyMilli > 0) {
    const old = base.lines.find(l => l.itemId === item.id);
    lines.push({ itemId: item.id, nameAr: item.nameAr, nameEn: item.nameEn, unitAgorot: item.priceAgorot, byWeight: item.byWeight, qtyMilli,
      policy: old?.policy ?? 'ask_first' });
    lines.sort((a, b) => a.itemId - b.itemId);
  }
  save({ ...base, lines });
}
export function setPolicy(itemId: number, policy: ShopPolicy) {
  if (cart) save({ ...cart, lines: cart.lines.map(l => l.itemId === itemId ? { ...l, policy } : l) });
}
export const clearCart = () => save(null);
/** "Order again" (DLV-18): the server's rebuilt lines replace the cart. */
export const replaceCart = (next: Cart) => save(next);
export const qtyOf = (c: Cart | null, itemId: number) => c?.lines.find(l => l.itemId === itemId)?.qtyMilli ?? 0;
