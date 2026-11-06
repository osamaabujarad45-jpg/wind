import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Persistence, Row } from '../db/persistence.ts';

type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; req: IncomingMessage };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>) => unknown;
type Fail = (status: number, message: string) => never;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const expoTokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-+/=]{8,}\]$/;
export const PUSH_KINDS = ['assigned', 'at_pickup', 'in_transit', 'completed', 'returned', 'message', 'job', 'released', 'cancelled', 'offer',
  'offer_accepted', 'on_hold', 'returning', 'decided', 'approved', 'support', 'cash', 'attention', 'safety', 'plan',
  'destination_request', 'destination_accepted', 'destination_declined'];
export const NONESSENTIAL_KINDS = ['job', 'offer', 'message', 'released', 'approved', 'support', 'cash', 'attention', 'plan'];
/** Kinds that wake the phone at high urgency; every sender reads this one list. */
export const URGENT_KINDS = ['job', 'message', 'offer', 'offer_accepted', 'on_hold', 'returning', 'decided', 'attention', 'safety',
  'destination_request', 'destination_accepted', 'destination_declined'];
export type NativePrefs = { nonessentialMuted: boolean; mutedKinds: string[]; quietHours: { startMinute: number; endMinute: number; utcOffsetMinutes: number } | null };
export const defaultPrefs = (): NativePrefs => ({ nonessentialMuted: false, mutedKinds: [], quietHours: null });
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const nativeTokenHash = (expoPushToken: string) => sha256(expoPushToken);
export const nativeDeviceHash = (deviceId: string) => sha256(`wp09-device:${deviceId.toLowerCase()}`);

export async function nativePushAvailable(db: Persistence): Promise<boolean> {
  if (db.backend !== 'postgres') return true; // server/db/sqlite-schema.ts always creates the table
  const tables = await db.one("SELECT to_regclass('native_push_tokens') AS tokens, to_regclass('schema_migrations') AS migrations");
  return !!(tables?.tokens && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=12'));
}

export function parsePrefs(raw: unknown): NativePrefs {
  let value: Row = {};
  if (typeof raw === 'string') { try { value = JSON.parse(raw) as Row; } catch { return defaultPrefs(); } }
  else if (raw && typeof raw === 'object' && !Array.isArray(raw)) value = raw as Row;
  else if (raw != null) return defaultPrefs();
  const muted = Array.isArray(value.mutedKinds) ? value.mutedKinds.filter((k: unknown) => typeof k === 'string' && PUSH_KINDS.includes(k)) : [];
  const quiet = value.quietHours && typeof value.quietHours === 'object' && !Array.isArray(value.quietHours) ? value.quietHours as Row : null;
  const quietHours = quiet && Number.isSafeInteger(quiet.startMinute) && Number.isSafeInteger(quiet.endMinute) && Number.isSafeInteger(quiet.utcOffsetMinutes)
    && quiet.startMinute >= 0 && quiet.startMinute <= 1439 && quiet.endMinute >= 0 && quiet.endMinute <= 1439
    && quiet.utcOffsetMinutes >= -720 && quiet.utcOffsetMinutes <= 840
    ? { startMinute: quiet.startMinute as number, endMinute: quiet.endMinute as number, utcOffsetMinutes: quiet.utcOffsetMinutes as number } : null;
  return { nonessentialMuted: value.nonessentialMuted === true, mutedKinds: [...new Set(muted as string[])].sort(), quietHours };
}

function quietActive(prefs: NativePrefs, now: number): boolean {
  const quiet = prefs.quietHours;
  if (!quiet || quiet.startMinute === quiet.endMinute) return false;
  const shifted = new Date(now + quiet.utcOffsetMinutes * 60_000);
  const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return quiet.startMinute < quiet.endMinute
    ? minute >= quiet.startMinute && minute < quiet.endMinute
    : minute >= quiet.startMinute || minute < quiet.endMinute;
}

/** Delivery-time suppression only; a suppressed hint is obsolete, never retried as actionable. */
export function nativeSuppression(prefsRaw: unknown, kind: string, disabledAt: unknown, now = Date.now()): string | null {
  if (disabledAt != null) return 'disabled';
  const prefs = parsePrefs(prefsRaw);
  if (prefs.mutedKinds.includes(kind)) return 'muted_kind';
  if (!NONESSENTIAL_KINDS.includes(kind)) return null;
  if (prefs.nonessentialMuted) return 'nonessential_muted';
  if (quietActive(prefs, now)) return 'quiet_hours';
  return null;
}

export class NativePush {
  private db: Persistence;
  private fail: Fail;
  constructor(db: Persistence, fail: Fail) { this.db = db; this.fail = fail; }
  private fields(body: Row, allowed: string[]) {
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) this.fail(400, 'invalid_input');
  }
  private async available() { if (!(await nativePushAvailable(this.db))) this.fail(409, 'native_push_unavailable'); }
  private get jsonParam() { return this.db.backend === 'postgres' ? '?::jsonb' : '?'; }
  private sessionHash(req: IncomingMessage) {
    const raw = /^Bearer (\w+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!raw) this.fail(401, 'unauthorized');
    return sha256(raw!);
  }
  private async actor(ctx: Context) {
    const hash = this.sessionHash(ctx.req);
    const pg = this.db.backend === 'postgres';
    const user = await this.db.one(`SELECT id, role, status FROM users WHERE id=?${pg ? ' FOR UPDATE' : ''}`, ctx.user.id);
    if (!user || user.status === 'blocked') this.fail(401, 'unauthorized');
    if (!await this.db.one(`SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND created_at>?${pg ? ' FOR KEY SHARE' : ''}`, hash, user.id, Date.now() - 90 * 86_400_000))
      this.fail(401, 'unauthorized');
    return { user: user!, sessionHash: hash };
  }
  private deviceId(value: unknown) {
    if (typeof value !== 'string' || !uuidPattern.test(value)) this.fail(400, 'invalid_input');
    return (value as string).toLowerCase();
  }
  private prefsInput(value: unknown): NativePrefs {
    if (value === undefined) return defaultPrefs();
    if (!value || typeof value !== 'object' || Array.isArray(value)) this.fail(400, 'invalid_input');
    const body = value as Row;
    if (Object.keys(body).some(k => !['nonessentialMuted', 'mutedKinds', 'quietHours'].includes(k))) this.fail(400, 'invalid_input');
    if (body.nonessentialMuted !== undefined && typeof body.nonessentialMuted !== 'boolean') this.fail(400, 'invalid_input');
    if (body.mutedKinds !== undefined && (!Array.isArray(body.mutedKinds) || body.mutedKinds.length > PUSH_KINDS.length
      || body.mutedKinds.some((k: unknown) => typeof k !== 'string' || !PUSH_KINDS.includes(k)))) this.fail(400, 'invalid_input');
    if (body.quietHours !== undefined && body.quietHours !== null) {
      const quiet = body.quietHours as Row;
      if (!quiet || typeof quiet !== 'object' || Array.isArray(quiet)
        || Object.keys(quiet).some(k => !['startMinute', 'endMinute', 'utcOffsetMinutes'].includes(k))
        || !Number.isSafeInteger(quiet.startMinute) || !Number.isSafeInteger(quiet.endMinute) || !Number.isSafeInteger(quiet.utcOffsetMinutes)
        || quiet.startMinute < 0 || quiet.startMinute > 1439 || quiet.endMinute < 0 || quiet.endMinute > 1439
        || quiet.utcOffsetMinutes < -720 || quiet.utcOffsetMinutes > 840) this.fail(400, 'invalid_input');
    }
    return parsePrefs(body);
  }
  async register(ctx: Context) {
    await this.available();
    this.fields(ctx.body, ['expoPushToken', 'deviceId', 'platform', 'lang', 'prefs']);
    const expoPushToken = typeof ctx.body.expoPushToken === 'string' ? ctx.body.expoPushToken.trim() : '';
    if (!expoTokenPattern.test(expoPushToken)) this.fail(400, 'invalid_expo_token');
    const deviceId = this.deviceId(ctx.body.deviceId);
    if (!['ios', 'android'].includes(ctx.body.platform as string)) this.fail(400, 'invalid_input');
    const lang = ctx.body.lang === undefined ? 'ar' : ctx.body.lang;
    if (!['ar', 'en'].includes(lang as string)) this.fail(400, 'invalid_input');
    const prefs = this.prefsInput(ctx.body.prefs);
    const { user, sessionHash } = await this.actor(ctx);
    const tokenHash = nativeTokenHash(expoPushToken), deviceHash = nativeDeviceHash(deviceId), now = Date.now();
    // One physical device holds one current token for one account: a new account
    // or a rotated token retires the previous binding before the insert.
    await this.db.run('DELETE FROM native_push_tokens WHERE device_hash=? AND token_hash<>?', deviceHash, tokenHash);
    await this.db.run('DELETE FROM native_push_tokens WHERE token_hash=? AND device_hash<>?', tokenHash, deviceHash);
    await this.db.run(`INSERT INTO native_push_tokens(token_hash,user_id,auth_session_hash,device_hash,platform,expo_push_token,lang,prefs_json,created_at,updated_at,disabled_at)
      VALUES(?,?,?,?,?,?,?,${this.jsonParam},?,?,NULL)
      ON CONFLICT(token_hash) DO UPDATE SET user_id=excluded.user_id,auth_session_hash=excluded.auth_session_hash,device_hash=excluded.device_hash,
      platform=excluded.platform,expo_push_token=excluded.expo_push_token,lang=excluded.lang,prefs_json=excluded.prefs_json,updated_at=excluded.updated_at,disabled_at=NULL`,
      tokenHash, user.id, sessionHash, deviceHash, ctx.body.platform, expoPushToken, lang, JSON.stringify(prefs), now, now);
    return { ok: true, registered: true, platform: ctx.body.platform as string, lang, prefs };
  }
  async unregister(ctx: Context) {
    await this.available();
    this.fields(ctx.body, ['deviceId']);
    const deviceHash = nativeDeviceHash(this.deviceId(ctx.body.deviceId));
    const { user } = await this.actor(ctx);
    const removed = await this.db.run('DELETE FROM native_push_tokens WHERE user_id=? AND device_hash=?', user.id, deviceHash);
    return { ok: true, unregistered: true, removed: Number(removed.changes) > 0 };
  }
  async preferences(ctx: Context) {
    await this.available();
    this.fields(ctx.body, ['deviceId', 'prefs', 'disabled']);
    if (ctx.body.prefs === undefined && ctx.body.disabled === undefined) this.fail(400, 'invalid_input');
    if (ctx.body.disabled !== undefined && typeof ctx.body.disabled !== 'boolean') this.fail(400, 'invalid_input');
    const deviceHash = nativeDeviceHash(this.deviceId(ctx.body.deviceId));
    const { user } = await this.actor(ctx);
    const row = await this.db.one(`SELECT * FROM native_push_tokens WHERE user_id=? AND device_hash=?${this.db.backend === 'postgres' ? ' FOR UPDATE' : ''}`, user.id, deviceHash);
    if (!row) this.fail(404, 'not_found');
    const prefs = ctx.body.prefs === undefined ? parsePrefs(row!.prefs_json) : this.prefsInput(ctx.body.prefs);
    const disabledAt = ctx.body.disabled === undefined ? row!.disabled_at : ctx.body.disabled ? Date.now() : null;
    await this.db.run(`UPDATE native_push_tokens SET prefs_json=${this.jsonParam},disabled_at=?,updated_at=? WHERE token_hash=?`,
      JSON.stringify(prefs), disabledAt, Date.now(), row!.token_hash);
    return { ok: true, prefs, disabled: disabledAt != null };
  }
}

export function registerNativePushRoutes(route: Register, service: NativePush) {
  route('POST', '/api/push/native/register', ctx => service.register(ctx));
  route('POST', '/api/push/native/unregister', ctx => service.unregister(ctx));
  route('POST', '/api/push/native/preferences', ctx => service.preferences(ctx));
}
