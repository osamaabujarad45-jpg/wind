import type { User } from '../../src/model.ts';
import type { Persistence } from '../db/persistence.ts';
type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[] }) => Promise<unknown>) => unknown;
type Deps = { db: Persistence; need: (user: User, role: 'driver') => void; needActive: (user: User) => void;
  fail: (status: number, message: string) => never };

/** A receipt contains a decision, never a proof/PIN or an old private order snapshot. */
export function registerDriverReceiptRoutes(route: Register, deps: Deps) {
  route('GET', '/api/orders/:id/actions/([^/]+)', async ({ user, params }) => {
    deps.need(user, 'driver'); deps.needActive(user);
    const id = Number(params[0]), requestId = params[1];
    if (!Number.isSafeInteger(id) || id < 1 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)) deps.fail(400, 'invalid_request_id');
    const order = await deps.db.one('SELECT driver_id FROM orders WHERE id=?', id);
    if (!order || order.driver_id !== user.id) deps.fail(404, 'not_found');
    const saved = await deps.db.one('SELECT http_status,error FROM order_actions WHERE user_id=? AND order_id=? AND request_id=?', user.id, id, requestId);
    return { schemaVersion: 1, orderId: id, requestId, state: !saved ? 'unknown' : saved.error ? 'rejected' : 'applied',
      ...(saved?.error ? { error: saved.error, httpStatus: saved.http_status } : {}) };
  });
}
