import type { Row } from '../db/persistence.ts';

// The review handler stays beside the courier block it reviews. The additive route inventory lists this boundary.
type Register = (method: string, path: string, handler: (ctx: { user: any; params: string[]; body: any }) => Promise<unknown>) => unknown;
export function registerBlockReviewRoutes(route: Register, decide: (ctx: { user: any; params: string[]; body: any }) => Promise<unknown>) {
  route('POST', '/api/admin/orders/:id/block-review', decide);
}
/** Return the blocked custody state only when the audit belongs to this assignment. */
export function custodyBlockFrom(order: Row, event: Row): string | null {
  let detail: Row;
  try { detail = JSON.parse(String(event.detail)) ?? {}; } catch { return null; }
  const from = detail.from;
  const inCustody = ['in_transit', 'on_hold', 'returning'].includes(from)
    || (order.service === 'shop' && from === 'at_pickup' && detail.custody === true);
  const sameAssignment = detail.assignmentEpoch == null
    ? event.created_at >= (order.assigned_at ?? 0)
    : detail.assignmentEpoch === order.assignment_epoch;
  return inCustody && sameAssignment && detail.custody !== false && Number(detail.driverId) === order.driver_id ? from : null;
}
