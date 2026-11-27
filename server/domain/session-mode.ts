import type { Persistence, Row } from '../db/persistence.ts';
import type { IncomingMessage } from 'node:http';
import { activeStatuses, type AccountMode, type User } from '../../src/model.ts';
import { SESSION_DAYS, SESSION_DAY_MS, SESSION_IDLE_DAYS } from './session-policy.ts';

type Fail = (status: number, code: string) => never;
const workStatuses = activeStatuses.map(status => "'" + status + "'").join(',');
const liveSession = 'created_at > ? AND COALESCE(last_seen_at, created_at) > ?';
const modeValues: readonly string[] = ['personal', 'captain', 'shop'];
export const captainIdleMs = 30 * 60_000;
const expiry = (now: number): [number, number] => [now - SESSION_DAYS * SESSION_DAY_MS, now - SESSION_IDLE_DAYS * SESSION_DAY_MS];

export function supportedMode(value: unknown): value is AccountMode {
  return typeof value === 'string' && modeValues.includes(value);
}

export const hasCaptainProfile = (account: Row) => account.role === 'driver'
  && ['active', 'review', 'paused', 'closing'].includes(account.captain_state);
export const captainGrant = (account: Row) => account.status !== 'blocked' && hasCaptainProfile(account);

export async function rideDue(db: Persistence, userId: number, now = Date.now()) {
  return !!await db.one(`SELECT 1 FROM orders WHERE customer_id = ? AND service = 'ride'
    AND (status IN (${workStatuses}) OR (status = 'searching' AND (scheduled_for IS NULL OR scheduled_for <= ?))) LIMIT 1`,
  userId, now + 2 * 60 * 60_000);
}

export const captainHasWork = async (db: Persistence, id: number) => !!await db.one(
  `SELECT 1 FROM orders WHERE driver_id = ? AND status IN (${workStatuses}) LIMIT 1`, id);

async function clearExpiredCaptain(db: Persistence, userId: number, now: number) {
  await db.run(`UPDATE sessions SET active_mode = 'personal', mode_revision = mode_revision + 1, captain_online_at = NULL, captain_offline_reason = NULL
    WHERE user_id = ? AND active_mode = 'captain' AND NOT (${liveSession})`, userId, ...expiry(now));
}

export async function defaultMode(db: Persistence, account: Row, now: number): Promise<AccountMode | null> {
  if (account.role === 'admin') return null;
  if (!captainGrant(account)) return 'personal';
  await clearExpiredCaptain(db, Number(account.id), now);
  return await db.one("SELECT 1 FROM sessions WHERE user_id = ? AND active_mode = 'captain'", account.id)
    ? 'personal' : 'captain';
}

export async function captainOnline(db: Persistence, userId: number, now = Date.now(), sessionHash?: string) {
  const session = await db.one(`SELECT 1 FROM sessions WHERE user_id = ? AND active_mode = 'captain' AND captain_online_at IS NOT NULL
    AND last_activity_at > ? AND ${liveSession} ${sessionHash ? 'AND token_hash = ?' : ''}
    AND EXISTS (SELECT 1 FROM users WHERE id = sessions.user_id AND role = 'driver' AND status = 'active' AND captain_state = 'active' AND approved_at IS NOT NULL)`,
  userId, now - captainIdleMs, ...expiry(now), ...(sessionHash ? [sessionHash] : []));
  return !!session && !await rideDue(db, userId, now);
}

type OfflineReason = 'ride_due' | 'idle' | 'launch';

export async function setCaptainOffline(db: Persistence, userId: number, reason: OfflineReason | null = null) {
  await db.run('UPDATE sessions SET captain_online_at = NULL, captain_offline_reason = ? WHERE user_id = ? AND captain_online_at IS NOT NULL', reason, userId);
  await db.run('DELETE FROM order_offers WHERE driver_id = ?', userId);
}

export async function captainActivity(db: Persistence, userId: number, sessionHash: string, now = Date.now()) {
  await db.run(`UPDATE sessions SET last_activity_at = ? WHERE token_hash = ? AND user_id = ? AND active_mode = 'captain'
    AND captain_online_at IS NOT NULL AND last_activity_at > ? AND last_activity_at <= ? AND ${liveSession}`,
  now, sessionHash, userId, now - captainIdleMs, now - 5_000, ...expiry(now));
}

export async function captainOfflineReason(db: Persistence, userId: number, sessionHash: string, now = Date.now(), onLaunch = false): Promise<OfflineReason | null> {
  const session = await db.one("SELECT captain_offline_reason, captain_online_at, last_activity_at FROM sessions WHERE token_hash = ?", sessionHash);
  if (!session) return null;
  if (session.captain_online_at != null) {
    if (await rideDue(db, userId, now)) return 'ride_due';
    if (Number(session.last_activity_at) <= now - captainIdleMs) return 'idle';
    return onLaunch ? 'launch' : null;
  }
  const saved = session.captain_offline_reason;
  return saved === 'idle' || saved === 'ride_due' || saved === 'launch' ? saved : null;
}

export async function expireCaptainAvailability(db: Persistence, notice: (userId: number, reason: OfflineReason) => Promise<unknown>, now = Date.now()) {
  const online = await db.all("SELECT user_id, token_hash FROM sessions WHERE active_mode = 'captain' AND captain_online_at IS NOT NULL");
  for (const { user_id, token_hash } of online) {
    const userId = Number(user_id);
    if (!await captainOnline(db, userId, now)) {
      const reason = await captainOfflineReason(db, userId, token_hash, now);
      await setCaptainOffline(db, userId, reason);
      if (reason) await notice(userId, reason);
    }
  }
}

/** The caller owns the same write transaction as booking and assignment. Recheck the exact session under that lock. */
export async function modeAuthority(db: Persistence, sessionHash: string, actorId: number, now: number, fail: Fail) {
  const account = await db.one(`SELECT * FROM users WHERE id = ?${db.backend === 'postgres' ? ' FOR UPDATE' : ''}`, actorId);
  const session = account && await db.one(`SELECT * FROM sessions WHERE user_id = ? AND token_hash = ? AND ${liveSession}
    ${db.backend === 'postgres' ? 'FOR UPDATE' : ''}`, actorId, sessionHash, ...expiry(now));
  if (!account || !session || account.status === 'blocked') fail(401, 'unauthorized');
  if (account.role === 'admin') fail(403, 'forbidden');
  return { account, session };
}

export async function switchSessionMode(db: Persistence, sessionHash: string, actorId: number,
  mode: AccountMode, revision: number, shopEnabled: boolean, fail: Fail) {
  const now = Date.now();
  const { account, session } = await modeAuthority(db, sessionHash, actorId, now, fail);
  if (session.mode_revision !== revision) fail(409, 'mode_changed');
  if (session.active_mode === mode) return;
  if (session.active_mode === 'captain') {
    if (await captainHasWork(db, actorId)) fail(409, 'work_in_hand');
    await setCaptainOffline(db, actorId);
  }
  if (mode === 'captain') {
    if (!captainGrant(account)) fail(403, 'profile_not_active');
    await clearExpiredCaptain(db, actorId, now);
    if (await db.one("SELECT 1 FROM sessions WHERE user_id = ? AND active_mode = 'captain'", actorId)) fail(409, 'captain_elsewhere');
  }
  if (mode === 'shop' && (!shopEnabled || !await db.one('SELECT 1 FROM merchants WHERE owner_user_id = ?', actorId)))
    fail(403, 'profile_not_active');
  await db.run(`UPDATE sessions SET active_mode = ?, mode_revision = mode_revision + 1, captain_online_at = NULL, captain_offline_reason = NULL,
    last_activity_at = ? WHERE token_hash = ?`, mode, now, sessionHash);
  await db.run("INSERT INTO security_events(actor_id,action,detail,created_at) VALUES (?,'PROFILE_MODE_CHANGED',?,?)",
    actorId, JSON.stringify({ from: session.active_mode, to: mode }), now);
}

export async function setCaptainAvailability(db: Persistence, sessionHash: string, actorId: number, revision: number,
  online: boolean, fail: Fail) {
  const now = Date.now();
  const { account, session } = await modeAuthority(db, sessionHash, actorId, now, fail);
  if (session.mode_revision !== revision) fail(409, 'mode_changed');
  if (session.active_mode !== 'captain' || !captainGrant(account)) fail(403, 'profile_not_active');
  if (!online) {
    await setCaptainOffline(db, actorId);
    await db.run('UPDATE sessions SET captain_offline_reason = NULL WHERE token_hash = ?', sessionHash);
    return;
  }
  if (account.status !== 'active' || account.captain_state !== 'active' || account.approved_at == null) fail(403, 'pending_approval');
  if (await rideDue(db, actorId, now)) fail(409, 'captain_ride_due');
  if (session.captain_online_at != null && Number(session.last_activity_at) <= now - captainIdleMs) await setCaptainOffline(db, actorId);
  await db.run('UPDATE sessions SET captain_online_at = ?, last_activity_at = ?, captain_offline_reason = NULL WHERE token_hash = ?', now, now, sessionHash);
}

type ModeContext = { user: User; body: Row; req: IncomingMessage; query: URLSearchParams };
type Register = (method: 'GET' | 'POST', path: string, handler: (ctx: ModeContext) => Promise<unknown>) => void;

export function registerModeRoutes(route: Register, handlers: {
  switchMode: (ctx: ModeContext) => Promise<unknown>;
  availability: (ctx: ModeContext) => Promise<unknown>;
  endOtherSessions: (ctx: ModeContext) => Promise<unknown>;
  apply: (ctx: ModeContext) => Promise<unknown>;
  notification: (ctx: ModeContext) => Promise<unknown>;
}) {
  route('POST', '/api/session/mode', handlers.switchMode);
  route('POST', '/api/session/captain/availability', handlers.availability);
  route('POST', '/api/session/other-phones', handlers.endOtherSessions);
  route('POST', '/api/captain/application', handlers.apply);
  route('GET', '/api/session/notifications', handlers.notification);
}
