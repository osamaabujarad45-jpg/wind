import { activeStatuses, isCity, services, type CityId, type Order, type OrderStatus, type Role, type Service } from './model.ts';
export type OfflineSummary = { schemaVersion: 1; actorId: number; role: Role; savedAt: number;
  orders: { id: number; service: Service; status: OrderStatus; pickupCity: CityId; dropoffCity: CityId; scheduledFor?: number | null }[] };

/** Read-only navigation context, deliberately excluding proofs, contacts, notes, precise fixes and prices. */
export function offlineSummary(actorId: number, role: Role, orders: Order[], now: number): OfflineSummary {
  return { schemaVersion: 1, actorId, role, savedAt: now, orders: orders.filter(order => (order.status === 'searching' || activeStatuses.includes(order.status))
    && (role === 'customer' ? order.customerId === actorId : role === 'driver' && order.driverId === actorId)).slice(0, 3)
    .map(({ id, service, status, pickupCity, dropoffCity, scheduledFor }) => ({ id, service, status, pickupCity, dropoffCity, scheduledFor: scheduledFor ?? null })) };
}
export function readOfflineSummary(input: unknown, now: number, maxAge: number): OfflineSummary | null {
  if (input === null) return null;
  const summary = input as OfflineSummary;
  if (!summary || summary.schemaVersion !== 1 || !Number.isSafeInteger(summary.actorId) || summary.actorId < 1 || !['customer', 'driver'].includes(summary.role)
    || !Number.isSafeInteger(summary.savedAt) || summary.savedAt > now + 5_000 || now - summary.savedAt >= maxAge
    || !Array.isArray(summary.orders) || summary.orders.length > 3 || summary.orders.some(order => !order || !Number.isSafeInteger(order.id) || order.id < 1
      || !services.includes(order.service) || ![...activeStatuses, 'searching'].includes(order.status) || !isCity(order.pickupCity) || !isCity(order.dropoffCity)
      || (order.scheduledFor != null && !Number.isSafeInteger(order.scheduledFor)))) return null;
  // Rebuild the allowlisted representation even if a stored object's writer included extra fields.
  return { schemaVersion: 1, actorId: summary.actorId, role: summary.role, savedAt: summary.savedAt,
    orders: summary.orders.map(({ id, service, status, pickupCity, dropoffCity, scheduledFor }) => ({ id, service, status, pickupCity, dropoffCity, scheduledFor: scheduledFor ?? null })) };
}
