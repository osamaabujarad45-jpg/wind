import { createHash } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import { SESSION_DAY_MS, SESSION_DAYS, SESSION_IDLE_DAYS } from './session-policy.ts';
type Failure = Error & { status: number };
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export async function versionedCommand(db: Persistence, user: { id: number } | null, body: Row, path: string, method: string,
  invoke: () => unknown, fail: (status: number, message: string) => never, isFailure: (error: unknown) => boolean, authorizeOrder: (id: number) => Promise<unknown>,
  policy: { requirePermanentDriverApproval?: boolean; sessionHash?: string } = {}) {
  if (body.commandId === undefined) return await invoke();
  if (db.backend !== 'postgres') fail(409, 'durable_protocol_unavailable');
  if (!user) fail(401, 'unauthorized');
  if (typeof body.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.commandId)) fail(400, 'invalid_command_id');
  if (!/^\/api\/(orders(?:\/|$)|jobs\/|admin\/orders\/|admin\/cash(?:\/|$)|driver\/cash(?:\/|$))/.test(path)) fail(400, 'unsupported_command');
  const { commandId, clientRecordedAt: _recorded, payload: nested, ...fields } = body;
  if (nested !== undefined && (!nested || typeof nested !== 'object' || Array.isArray(nested))) fail(400, 'invalid_input');
  const input = nested === undefined ? fields : { ...nested, ...fields };
  const hash = createHash('sha256').update(JSON.stringify(canonical({ path, method, input }))).digest('hex');
  await db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', `${user.id}:${commandId}`);
  const saved = await db.one('SELECT * FROM command_results WHERE actor_id=? AND command_id=?', user.id, commandId);
  if (saved) {
    // Idempotency preserves a completed decision, never a revoked permission to its private result.
    // Read after the advisory-lock wait so a role change during that wait is observed too.
    const actor = await db.one('SELECT role,status,approved_at FROM users WHERE id=?',user.id) ?? fail(401,'unauthorized');
    // The caller's session was validated before the lock wait; a revocation or
    // idle/absolute expiry during that wait must not receive the stored result.
    if (policy.sessionHash && !await db.one('SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND created_at>? AND COALESCE(last_seen_at,created_at)>?',
      policy.sessionHash, user.id, Date.now() - SESSION_DAYS * SESSION_DAY_MS, Date.now() - SESSION_IDLE_DAYS * SESSION_DAY_MS)) fail(401,'unauthorized');
    const driverAction = /^\/api\/jobs\//.test(path) || /^\/api\/orders\/\d+\/(?:advance|release|exception)$/.test(path);
    const customerAction = path === '/api/orders' || /^\/api\/orders\/\d+\/offers\/\d+\/accept$/.test(path);
    if ((path.startsWith('/api/admin/') && actor.role !== 'admin')
      || ((driverAction || path.startsWith('/api/driver/cash')) && actor.role !== 'driver')
      || (customerAction && actor.role !== 'customer')) fail(403,'forbidden');
    if ((driverAction || customerAction) && actor.status !== 'active')
      fail(403,actor.status === 'pending' ? 'pending_approval' : 'blocked');
    if (driverAction && policy.requirePermanentDriverApproval && !actor.approved_at) fail(403,'pending_approval');
    if (saved.payload_hash !== hash) fail(409, 'idempotency_conflict');
    const response = JSON.parse(saved.response);
    const target = /^\/api\/(?:orders|jobs|admin\/orders)\/(\d+)(?:\/|$)/.exec(path);
    if (saved.http_status !== 200) {
      if (target) await authorizeOrder(Number(target[1]));
      fail(saved.http_status, response.error);
    }
    if (target) {
      const order = await db.one('SELECT customer_id,driver_id FROM orders WHERE id=?',Number(target[1])) ?? fail(404,'not_found');
      const releasedReceipt = /^\/api\/orders\/\d+\/release$/.test(path) && response?.ok === true
        && await db.one('SELECT 1 FROM order_releases WHERE order_id=? AND driver_id=?',Number(target[1]),user.id);
      if (!releasedReceipt && actor.role !== 'admin' && order.customer_id !== user.id && order.driver_id !== user.id) {
        // A negotiated offer contains only the actor's own price; its marketplace access still applies.
        if (/^\/api\/jobs\/\d+\/offer$/.test(path)) await authorizeOrder(Number(target[1]));
        else fail(404,'not_found');
      }
    }
    return response;
  }
  let response: unknown, error: Failure | undefined;
  try {
    const target = /^\/api\/(?:orders|jobs|admin\/orders)\/(\d+)(?:\/|$)/.exec(path);
    if (target) {
      await authorizeOrder(Number(target[1]));
      const row = await db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', Number(target[1])) ?? fail(404, 'not_found');
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) fail(400, 'invalid_version');
      if (row.version !== input.expectedVersion) fail(409, 'VERSION_CONFLICT');
      if (input.expectedStatus === undefined) input.expectedStatus = row.status;
    }
    const cashDecision = /^\/api\/driver\/cash\/(\d+)\/confirm$/.exec(path);
    if (/^\/api\/(?:admin|driver)\/cash/.test(path) && input.currency !== 'ILS') fail(400, 'invalid_currency');
    if (cashDecision) {
      const entry = await db.one('SELECT * FROM cash_entries WHERE id=? AND driver_id=? FOR UPDATE', Number(cashDecision[1]), user.id) ?? fail(404, 'not_found');
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) fail(400, 'invalid_version');
      if (input.expectedVersion !== entry.version) fail(409, 'VERSION_CONFLICT');
      if (input.amountCents !== entry.amount_cents) fail(409, 'cash_amount_changed');
    }
    if (input.currency !== undefined && input.currency !== 'ILS') fail(400, 'invalid_currency');
    Object.keys(body).forEach(key => delete body[key]); Object.assign(body, input);
    // Shared installed handlers retain every custody, price and proof rule.
    if (body.requestId === undefined) body.requestId = commandId;
    response = await invoke();
  } catch (failure) {
    if (!isFailure(failure)) throw failure;
    error = failure as Failure; response = { error: error.message };
  }
  await db.run('INSERT INTO command_results(actor_id,command_id,payload_hash,http_status,response,created_at) VALUES(?,?,?,?,?,?)',
    user.id, commandId, hash, error?.status ?? 200, JSON.stringify(response), Date.now());
  if (error) throw error;
  return response;
}
