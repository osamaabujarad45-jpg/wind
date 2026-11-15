// The driver-side reasons a driver may not take an order. The driver accept and the admin assign both call this, so the
// two cannot drift. It returns the first reason code, or null, and writes nothing: the measured eligibility guard
// (which reserves capacity) is a separate call that each route makes inside its own transaction.
import type { Row } from '../db/persistence.ts';

export type RefusalDeps = {
  one: (sql: string, ...args: any[]) => Promise<Row | undefined>;
  enabledServices: string[];
  servesFor: (vehicle: unknown) => string[];
  canTake: (active: { service: never }[], service: never) => boolean;
  activeLoad: (driverId: number) => Promise<{ service: string }[]>;
  guardCashCap: (driverId: number, price: number, rate: number) => Promise<void>;
  // production self-service accounts also need the permanent approval a driver accept demands
  permanentApprovalRequired: boolean;
  // scheduled orders reach drivers this long before pickup (server/main.ts RELEASE_BEFORE)
  releaseBefore: number;
};

/** The order fields the checks read. The admin passes its row; the driver accept passes its model with the same names. */
export type RefusalOrder = { id: number; service: string; price: number; scheduled_for?: number | null };

/** The first reason this driver may not take this order (same codes everywhere), or null. */
export async function driverRefusal(deps: RefusalDeps, order: RefusalOrder, driver: Row, rate: number): Promise<string | null> {
  if (driver.role !== 'driver') return 'not_found';
  if (driver.status !== 'active') return driver.status === 'pending' ? 'pending_approval' : 'blocked';
  if (deps.permanentApprovalRequired && !driver.approved_at) return 'pending_approval';
  if (!deps.enabledServices.includes(order.service)) return 'service_unavailable';
  if (!deps.servesFor(driver.vehicle).includes(order.service)) return 'wrong_vehicle';
  if (order.scheduled_for != null && order.scheduled_for > Date.now() + deps.releaseBefore) return 'not_released_yet';
  if (await deps.one('SELECT 1 FROM order_releases WHERE order_id = ? AND driver_id = ?', order.id, driver.id)) return 'driver_released_order';
  if (!deps.canTake((await deps.activeLoad(Number(driver.id))) as never, order.service as never)) return 'vehicle_busy';
  try { await deps.guardCashCap(Number(driver.id), Number(order.price), rate); }
  catch (error) { if ((error as { status?: number }).status === 409) return (error as Error).message; throw error; }
  return null;
}
