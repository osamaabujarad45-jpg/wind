import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Persistence, Row } from '../db/persistence.ts';
import { durableProtocolAvailable } from './events.ts';
import { activeStatuses } from '../../src/model.ts';
import { SESSION_DAY_MS, SESSION_DAYS, SESSION_IDLE_DAYS } from './session-policy.ts';

type Actor = { id: number; role: string; status: string };
type Context = { user: Actor | null; params: string[]; req: IncomingMessage };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>, isPublic?: boolean) => unknown;
type Fail = (status: number, message: string) => never;

export const REALTIME_TTL_MS = 5 * 60_000;
const SHARE_GRACE_MS = 86_400_000;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
let processSecret: Buffer | undefined;
function signingKey(): Buffer {
  const configured = process.env.WIND_REALTIME_SECRET?.trim();
  if (configured) return createHash('sha256').update(configured).digest();
  processSecret ??= randomBytes(32);
  return processSecret;
}
const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

type CredentialPayload = {
  v: 1; orderId: number; subjectType: 'user' | 'share'; subjectId: number;
  sessionHash?: string; shareHash?: string; group: string; exp: number; cursor: number;
};

export class Realtime {
  private db: Persistence;
  private fail: Fail;
  constructor(db: Persistence, fail: Fail) { this.db = db; this.fail = fail; }
  private async available() { if (!(await durableProtocolAvailable(this.db))) this.fail(409, 'durable_protocol_unavailable'); }
  private sessionHash(req: IncomingMessage) {
    const raw = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!raw) this.fail(401, 'unauthorized');
    return sha256(raw!);
  }
  private async cursor(orderId: number) {
    const row = await this.db.one('SELECT sequence FROM event_sequences WHERE order_id=?', orderId);
    if (row) return Number(row.sequence);
    const max = await this.db.one('SELECT COALESCE(MAX(sequence),0) AS seq FROM domain_events WHERE order_id=?', orderId);
    return Number(max?.seq ?? 0);
  }
  private mint(payload: CredentialPayload) {
    const body = encode(JSON.stringify(payload));
    const signature = createHmac('sha256', signingKey()).update(body).digest('base64url');
    return `${body}.${signature}`;
  }
  private transport() {
    const endpoint = process.env.WIND_PUBSUB_ENDPOINT?.trim();
    // PubSub needs a stable shared signing secret: with the per-process fallback
    // key, a restart or second instance would invalidate every credential.
    if (endpoint && process.env.WIND_PUBSUB_ENABLED === '1' && process.env.WIND_REALTIME_SECRET?.trim()) return { url: endpoint, transport: 'web_pubsub' as const };
    // No PubSub connection string is configured: realtime stays on the existing
    // authenticated long-poll and snapshot, and this is reported, never faked.
    return { url: null, transport: 'long_poll' as const };
  }
  private async issue(order: Row, payload: Omit<CredentialPayload, 'v' | 'orderId' | 'group' | 'exp' | 'cursor'>, cursor: number, now: number) {
    const orderId = Number(order.id ?? order.order_id);
    const full: CredentialPayload = { v: 1, orderId, group: `order-${orderId}`, exp: now + REALTIME_TTL_MS, cursor, ...payload };
    return {
      ...this.transport(), token: this.mint(full), group: full.group, expiresAt: full.exp,
      serverTime: now, eventCursor: cursor, assignmentEpoch: Number(order.assignment_epoch ?? 0),
      version: Number(order.version ?? 1),
      snapshotPath: `/api/orders/${orderId}?protocol=1&after=${cursor}`,
      livePath: `/api/orders/${orderId}/live`,
    };
  }
  async forUser(ctx: Context) {
    if (!ctx.user) this.fail(401, 'unauthorized');
    await this.available();
    const orderId = Number(ctx.params[0]);
    if (!Number.isSafeInteger(orderId) || orderId < 1) this.fail(404, 'not_found');
    const order = await this.db.one('SELECT id,customer_id,driver_id,version,assignment_epoch,status FROM orders WHERE id=?', orderId);
    if (!order) this.fail(404, 'not_found');
    if (ctx.user!.role !== 'admin' && ctx.user!.id !== Number(order!.customer_id) && ctx.user!.id !== Number(order!.driver_id)) this.fail(404, 'not_found');
    const sessionHash = this.sessionHash(ctx.req);
    if (!await this.db.one('SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND created_at>? AND COALESCE(last_seen_at,created_at)>?', sessionHash, ctx.user!.id, Date.now() - SESSION_DAYS * SESSION_DAY_MS, Date.now() - SESSION_IDLE_DAYS * SESSION_DAY_MS))
      this.fail(401, 'unauthorized');
    const now = Date.now();
    return this.issue(order!, { subjectType: 'user', subjectId: ctx.user!.id, sessionHash }, await this.cursor(orderId), now);
  }
  async forShare(ctx: Context) {
    await this.available();
    const shareToken = ctx.params[0] ?? '';
    if (!/^[a-f0-9]{64}$/.test(shareToken)) this.fail(404, 'not_found');
    const shareHash = sha256(shareToken);
    const order = await this.db.one('SELECT id,customer_id,driver_id,version,assignment_epoch,status,updated_at FROM orders WHERE share_token_hash=?', shareHash);
    if (!order) this.fail(404, 'not_found');
    const open = order!.status === 'searching' || activeStatuses.includes(order!.status as never);
    if (!open && Date.now() - Number(order!.updated_at) > SHARE_GRACE_MS) this.fail(404, 'not_found');
    const now = Date.now();
    // Scoped to the public tracking allowlist: the credential names only the
    // order group and cursor, never a participant identity.
    return this.issue(order!, { subjectType: 'share', subjectId: Number(order!.id), shareHash }, await this.cursor(Number(order!.id)), now);
  }
  /** Fake-hub gate: every check re-reads current authority, so revocation wins over a held credential. */
  async verify(token: string, now = Date.now()) {
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 2 || !parts[0] || !parts[1]) this.fail(401, 'realtime_invalid');
    const expected = createHmac('sha256', signingKey()).update(parts[0]).digest();
    let supplied: Buffer;
    try { supplied = Buffer.from(parts[1], 'base64url'); } catch { this.fail(401, 'realtime_invalid'); }
    if (supplied!.length !== expected.length || !timingSafeEqual(supplied!, expected)) this.fail(401, 'realtime_invalid');
    let payload: CredentialPayload;
    try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as CredentialPayload; }
    catch { this.fail(401, 'realtime_invalid'); }
    if (payload!.v !== 1 || !Number.isSafeInteger(payload!.orderId) || payload!.group !== `order-${payload!.orderId}`) this.fail(401, 'realtime_invalid');
    if (!Number.isSafeInteger(payload!.exp)) this.fail(401, 'realtime_invalid');
    if (payload!.exp <= now) this.fail(401, 'realtime_expired');
    const order = await this.db.one('SELECT id,customer_id,driver_id,version,assignment_epoch,status,updated_at,share_token_hash FROM orders WHERE id=?', payload!.orderId);
    if (!order) this.fail(401, 'realtime_revoked');
    if (payload!.subjectType === 'user') {
      if (!payload!.sessionHash || !Number.isSafeInteger(payload!.subjectId)) this.fail(401, 'realtime_invalid');
      const user = await this.db.one('SELECT id,role,status FROM users WHERE id=?', payload!.subjectId);
      if (!user || user.status === 'blocked') this.fail(401, 'realtime_revoked');
      if (!await this.db.one('SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND created_at>? AND COALESCE(last_seen_at,created_at)>?', payload!.sessionHash, payload!.subjectId, now - SESSION_DAYS * SESSION_DAY_MS, now - SESSION_IDLE_DAYS * SESSION_DAY_MS))
        this.fail(401, 'realtime_revoked');
      if (user.role !== 'admin' && payload!.subjectId !== Number(order!.customer_id) && payload!.subjectId !== Number(order!.driver_id))
        this.fail(401, 'realtime_revoked');
    } else if (payload!.subjectType === 'share') {
      if (!payload!.shareHash || order!.share_token_hash !== payload!.shareHash) this.fail(401, 'realtime_revoked');
      const open = order!.status === 'searching' || activeStatuses.includes(order!.status as never);
      if (!open && now - Number(order!.updated_at) > SHARE_GRACE_MS) this.fail(401, 'realtime_revoked');
    } else this.fail(401, 'realtime_invalid');
    return {
      orderId: payload!.orderId, group: payload!.group, subjectType: payload!.subjectType, subjectId: payload!.subjectId,
      assignmentEpoch: Number(order!.assignment_epoch ?? 0), version: Number(order!.version ?? 1),
      eventCursor: await this.cursor(payload!.orderId), expiresAt: payload!.exp, serverTime: now,
    };
  }
}

export function registerRealtimeRoutes(route: Register, service: Realtime) {
  route('GET', '/api/orders/:id/realtime', ctx => service.forUser(ctx));
  route('GET', '/api/track/([a-f0-9]{64})/realtime', ctx => service.forShare(ctx), true);
}
