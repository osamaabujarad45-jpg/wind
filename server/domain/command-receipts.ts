import type { User } from '../../src/model.ts';
import type { Persistence } from '../db/persistence.ts';
import { durableProtocolAvailable } from './events.ts';

type Register = (method: string, path: string, handler: (ctx: { user: User; params: string[] }) => Promise<unknown>) => unknown;
type Deps = { db: Persistence; fail: (status: number, message: string) => never };
const commandId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The sender's command receipt for any write sent with a `commandId` (the durable protocol).
 * - Decision only, never the stored response: an applied command's result is read again through the normal,
 *   access-checked routes, so no role or ownership re-check is needed here (unlike the replay path, which returns the body).
 * - `unknown` means not committed for this actor yet: never received, still in flight, or someone else's id. The client
 *   must resend the SAME commandId (the server replays or records it once), never mint a new one.
 * - Ids compare case-insensitively, as the protocol accepts either case.
 */
export function registerCommandReceiptRoutes(route: Register, deps: Deps) {
  route('GET', '/api/commands/([^/]+)', async ({ user, params }) => {
    if (!(await durableProtocolAvailable(deps.db))) deps.fail(409, 'durable_protocol_unavailable');
    if (!commandId.test(params[0])) deps.fail(400, 'invalid_command_id');
    const saved = await deps.db.one('SELECT http_status, response FROM command_results WHERE actor_id = ? AND lower(command_id) = lower(?)', user.id, params[0]);
    if (!saved) return { schemaVersion: 1, commandId: params[0], state: 'unknown' };
    if (saved.http_status === 200) return { schemaVersion: 1, commandId: params[0], state: 'applied' };
    let error = 'server_error';
    try { error = String(JSON.parse(saved.response)?.error ?? error); } catch { /* a malformed stored body still reads as rejected */ }
    return { schemaVersion: 1, commandId: params[0], state: 'rejected', httpStatus: saved.http_status, error };
  });
}
