// The shop cart (DLV-02): one shop at a time, kept on the device so a failed place or a closed app keeps it (A11Y-14).
// The server prices the basket again at placing; this copy only shows the estimate and remembers the choices.
import { useSyncExternalStore } from 'react';
import { storage } from './storage';
import { isCity, lineAgorot, shopPolicies, type Merchant, type MerchantItem, type ShopPolicy } from './model';

export type CartLine = { itemId: number; nameAr: string; nameEn: string; unitAgorot: number; byWeight: boolean; qtyMilli: number; policy: ShopPolicy };
export type Cart = { merchantId: number; merchantName: string; city: string; minOrderAgorot: number; deliveryFeeAgorot: number; serviceFeeAgorot: number;
  lines: CartLine[] };

const KEY = 'wind.shopCart.v1';
let cart: Cart | null = null;
let loadPromise: Promise<void> | undefined;
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

const text = (s: unknown) => typeof s === 'string';
const agorot = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
/** Every field the cart screen reads, or the saved copy is dropped: a missing fee would show as NaN and a missing policy
 *  would place an order the server refuses, and an unknown city id makes city() undefined, so the screen's `[language]` read throws. save() never writes an empty cart.
 *  Adding a field? Backfill it here (`saved.x ?? default`) or move to a new KEY. */
export function readCart(raw: unknown): Cart | null {
  const c = raw as Cart;
  return !!c && Number.isSafeInteger(c.merchantId) && text(c.merchantName) && isCity(c.city)
    && [c.minOrderAgorot, c.deliveryFeeAgorot, c.serviceFeeAgorot].every(agorot) && Array.isArray(c.lines) && c.lines.length > 0
    && c.lines.every(l => !!l && Number.isSafeInteger(l.itemId) && text(l.nameAr) && text(l.nameEn) && agorot(l.unitAgorot)
      && typeof l.byWeight === 'boolean' && Number.isSafeInteger(l.qtyMilli) && l.qtyMilli > 0 && shopPolicies.includes(l.policy)) ? c : null;
}
function load() {
  return loadPromise ??= (async () => {
    try { const saved = readCart(JSON.parse((await storage.get(KEY)) ?? 'null')); if (saved) { cart = saved; emit(); } } catch { /* a damaged copy starts empty */ }
  })();
}
function save(next: Cart | null, required = false) {
  const previous = cart;
  const value = next?.lines.length ? next : null;
  if (!required) { cart = value; emit(); }
  const write = writes.then(() => storage.set(KEY, value ? JSON.stringify(value) : null, required));
  writes = write.catch(() => {});
  if (!required) return writes;
  return write.then(() => { if (cart === previous) { cart = value; emit(); } });
}

export function useCart() {
  void load();
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => cart, () => cart);
}
export const cartGoods = (c: Cart | null) => (c?.lines ?? []).reduce((sum, l) => sum + lineAgorot(l.unitAgorot, l.qtyMilli), 0);
/** Another shop's item: the caller asks before clearing (DLV-02). */
export const otherShop = (merchantId: number) => !!cart && cart.merchantId !== merchantId;
export async function currentCart(): Promise<Cart | null> { await load(); return cart; }
/** What storage holds now, after this tab's queued writes: another tab may have changed the basket since this one loaded it.
 *  ponytail: no cross-tab lock, so a write landing between this read and the clear can still be lost; add a revision if that shows up. */
export async function storedCart(required = false): Promise<Cart | null> {
  await load(); await writes;
  let stored: Cart | null = null;
  const raw = await storage.get(KEY, required).catch(error => {
    if (required) throw error;
    return null;
  });
  try { stored = readCart(JSON.parse(raw ?? 'null')); } catch { /* damaged: treat as empty */ }
  if (JSON.stringify(stored) !== JSON.stringify(cart)) { cart = stored; emit(); }
  return stored;
}
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
export const clearCart = (required = false) => save(null, required);
/** "Order again" (DLV-18): the server's rebuilt lines replace the cart. */
export const replaceCart = (next: Cart) => save(next);
export const qtyOf = (c: Cart | null, itemId: number) => c?.lines.find(l => l.itemId === itemId)?.qtyMilli ?? 0;

export async function refreshCart(merchant: Merchant, items: MerchantItem[], current: () => boolean) {
  await load();
  if (!current() || !cart || cart.merchantId !== merchant.id || cart.city !== merchant.city) return false;
  const catalogue = new Map(items.filter(item => item.available).map(item => [item.id, item]));
  const lines = cart.lines.flatMap(line => {
    const item = catalogue.get(line.itemId);
    if (!item || item.byWeight !== line.byWeight) return [];
    return [{ ...line, nameAr: item.nameAr, nameEn: item.nameEn, unitAgorot: item.priceAgorot }];
  });
  await save({ ...cart, merchantName: merchant.name, minOrderAgorot: merchant.minOrderAgorot,
    deliveryFeeAgorot: merchant.deliveryFeeAgorot, serviceFeeAgorot: merchant.serviceFeeAgorot, lines }, true);
  return true;
}
