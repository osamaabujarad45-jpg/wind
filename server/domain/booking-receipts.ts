import type { User } from '../../src/model.ts';
import type { Row } from '../db/persistence.ts';

type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[] }) => Promise<unknown>) => unknown;
type Deps = {
  need: (user: User, role: 'customer') => void;
  fail: (status: number, message: string) => never;
  uuid: RegExp;
  one: (sql: string, userId: number, requestId: string) => Promise<Row | undefined>;
};

/** Exact, account-owned receipts recover lost replies without matching mutable order details. */
export function registerBookingReceiptRoutes(route: Register, deps: Deps) {
  route('GET', '/api/orders/commands/([^/]+)', async ({ user, params }) => {
    deps.need(user, 'customer');
    if (!deps.uuid.test(params[0])) deps.fail(400, 'invalid_request_id');
    const receipt = await deps.one('SELECT order_id FROM order_commands WHERE user_id = ? AND request_id = ?', user.id, params[0]);
    // A null receipt is a point-in-time read, never proof a delayed POST cannot commit.
    return { orderId: receipt ? Number(receipt.order_id) : null };
  });
}
