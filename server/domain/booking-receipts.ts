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
    if (receipt) return { orderId: Number(receipt.order_id), state: 'present' };
    const rejection = await deps.one('SELECT error FROM order_command_rejections WHERE user_id = ? AND request_id = ?', user.id, params[0]);
    if (rejection) return { orderId: null, state: 'absent', error: rejection.error };
    // A null receipt is a point-in-time read, never proof a delayed POST cannot commit.
    return { orderId: null, state: 'unknown' };
  });
}
