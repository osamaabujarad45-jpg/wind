import type { User } from '../../src/model.ts';
import type { Persistence } from '../db/persistence.ts';

type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[] }) => Promise<unknown>) => unknown;
type Deps = { db: Persistence; fail: (status: number, message: string) => never };
const commandId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The sender's command receipt for any write sent with a `commandId` (the durable protocol, PostgreSQL only).
 *  It holds the decision only, never the stored response: an applied command's result is read again through the
 *  normal, access-checked routes. Another actor's id, or one never received, reads as unknown. */
export function registerCommandReceiptRoutes(route: Register, deps: Deps) {
  route('GET', '/api/commands/([^/]+)', async ({ user, params }) => {
    if (deps.db.backend !== 'postgres') deps.fail(409, 'durable_protocol_unavailable');
    if (!commandId.test(params[0])) deps.fail(400, 'invalid_command_id');
    const saved = await deps.db.one('SELECT http_status, response FROM command_results WHERE actor_id = ? AND command_id = ?', user.id, params[0]);
    if (!saved) return { schemaVersion: 1, commandId: params[0], state: 'unknown' };
    if (saved.http_status === 200) return { schemaVersion: 1, commandId: params[0], state: 'applied' };
    let error = 'server_error';
    try { error = String(JSON.parse(saved.response)?.error ?? error); } catch { /* a malformed stored body still reads as rejected */ }
    return { schemaVersion: 1, commandId: params[0], state: 'rejected', httpStatus: saved.http_status, error };
  });
}
