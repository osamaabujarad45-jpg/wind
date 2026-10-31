// T25: administrator resolution for pending cash handovers (additive module: the frozen main.ts route
// inventory requires new routes to own their declarations). A handover its driver cannot confirm — blocked,
// gone, dispute deadlock — stays resolvable; every resolution names its actor, reason and optional evidence
// reference, and the CAS shares the driver's own predicate so a double tap or a racing driver decision moves
// the entry exactly once. Callers run under the HTTP envelope's transaction, which queuePush requires.
import type { Row } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Register = (method: string, path: string, handler: (ctx: { user: any; params: string[]; body: Row }) => Promise<unknown>, flag?: boolean) => unknown;
type Deps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  one: (sql: string, ...args: any[]) => Promise<Row | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all: (sql: string, ...args: any[]) => Promise<Row[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (sql: string, ...args: any[]) => Promise<any>;
  fail: Fail;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  need: (user: any, ...roles: any[]) => void;
  text: (value: unknown, max: number, required?: boolean) => string;
  cashEntry: (r: Row) => Row;
  // T30: a resolution that confirms the handover settles it in the same envelope transaction.
  postCashJournal: (entryId: number) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queuePush: (ids: any[], kind: any, order: number, path?: string) => Promise<void>;
};

export function registerCashOpsRoutes(route: Register, deps: Deps): void {
  route('GET', '/api/admin/cash/pending', async ({ user }) => {
    deps.need(user, 'admin');
    return (await deps.all(`SELECT c.*, u.name user_name, u.phone user_phone, u.status user_status FROM cash_entries c JOIN users u ON u.id = c.driver_id
      WHERE c.kind = 'remittance' AND c.status = 'pending' ORDER BY c.id DESC LIMIT 100`))
      .map(r => ({ ...deps.cashEntry(r), userName: r.user_name, userPhone: r.user_phone, userStatus: r.user_status }));
  });

  route('POST', '/api/admin/cash/:id/resolve', async ({ user, params, body }) => {
    deps.need(user, 'admin');
    if (!['confirm', 'dispute'].includes(body.decision)) deps.fail(400, 'invalid_input');
    const reason = deps.text(body.reason, 500);
    if (reason.length < 5) deps.fail(400, 'invalid_input');
    const evidenceRef = body.evidenceRef == null ? null : deps.text(body.evidenceRef, 200);
    const entry = (await deps.one("SELECT * FROM cash_entries WHERE id = ? AND kind = 'remittance'", Number(params[0]))) ?? deps.fail(404, 'not_found');
    if (!(await deps.run("UPDATE cash_entries SET status = ?, decided_at = ?, resolved_by = ?, resolution_note = ? WHERE id = ? AND status = 'pending'",
      body.decision === 'confirm' ? 'confirmed' : 'disputed', Date.now(), user.id,
      evidenceRef ? `${reason} | evidence: ${evidenceRef}` : reason, entry.id)).changes)
      deps.fail(409, 'already_decided');
    await deps.queuePush([entry.driver_id as number], 'cash', 0, '/driver/earnings');
    if (body.decision === 'confirm') await deps.postCashJournal(entry.id as number);
    return deps.cashEntry((await deps.one('SELECT * FROM cash_entries WHERE id = ?', entry.id))!);
  });
}
