import type { CityId, Order, Point, Service } from './model';

export const personalServices = ['ride', 'send', 'shop'] as const;
export type PersonalService = (typeof personalServices)[number];
type HomeDestination = { city: CityId; note: string; point: Point | null };
let selected: { accountId: number; key: string; place: HomeDestination } | undefined;

// Keep the exact place from the tap in memory. Routes carry only IDs, and another account cannot reuse it.
export function rememberHomeDestination(accountId: number, key: string, place: HomeDestination) {
  selected = { accountId, key, place };
}

export function readHomeDestination(accountId: number, key: string) {
  return selected?.accountId === accountId && selected.key === key ? selected.place : null;
}

export function bookingService(line: PersonalService, enabled: readonly string[]): Service | undefined {
  if (line === 'send') return enabled.includes('parcel') ? 'parcel' : enabled.includes('freight') ? 'freight' : undefined;
  return enabled.includes(line) ? line : undefined;
}

export function lastShopAddress(orders: readonly Order[], town?: CityId) {
  const order = orders.find(o => o.service === 'shop' && o.status !== 'cancelled' && o.dropoffPoint && o.dropoffNote && (!town || o.dropoffCity === town));
  return order?.dropoffPoint && order.dropoffNote ? { id: order.id, note: order.dropoffNote, city: order.dropoffCity, point: order.dropoffPoint } : null;
}

export function shopAddressForOrder(order: Order | undefined, accountId: number | null) {
  return accountId !== null && order?.customerId === accountId ? lastShopAddress([order]) : null;
}
