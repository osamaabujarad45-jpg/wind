import type { User } from '../../src/model.ts';
import type { Row } from '../db/persistence.ts';

type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[] }) => Promise<unknown>) => unknown;
type Deps = {
  need: (user: User, role: 'admin') => void;
  fail: (status: number, message: string) => never;
  uuid: RegExp;
  one: (sql: string, requestId: string, adminId: number) => Promise<Row | undefined>;
  cashEntry: (row: Row) => unknown;
};

/** A-01: the recording admin's command receipt for a remittance or adjustment whose reply was lost. */
export function registerCashReceiptRoutes(route: Register, deps: Deps) {
  route('GET', '/api/admin/cash/commands/([^/]+)', async ({ user, params }) => {
    deps.need(user, 'admin');
    if (!deps.uuid.test(params[0])) deps.fail(400, 'invalid_request_id');
    const saved = await deps.one('SELECT * FROM cash_entries WHERE request_id = ? AND recorded_by = ?', params[0], user.id);
    // Null is a point-in-time read, never proof a delayed send cannot still record; another admin's entry reads as null too.
    return { entry: saved ? deps.cashEntry(saved) : null };
  });
}
