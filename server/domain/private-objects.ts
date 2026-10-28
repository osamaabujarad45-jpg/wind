import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Persistence, Row } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; params: string[]; query: URLSearchParams; req: IncomingMessage };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>) => unknown;

export const PRIVATE_OBJECT_PURPOSES = ['condition-photo', 'signature', 'document'] as const;
export const PRIVATE_OBJECT_CONTENT_TYPES: Record<string, string[]> = {
  'condition-photo': ['image/jpeg', 'image/png', 'image/webp'],
  signature: ['image/png', 'image/jpeg'],
  document: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
};
/** The installed JSON body limit makes this adapter metadata-plus-small-payload;
 * direct-to-Blob upload replaces it when real storage is configured. */
export const PRIVATE_OBJECT_MAX_BYTES = 10_240;
export const OBJECT_READ_TTL_MS = 5 * 60_000;
export const PURPOSE_RETENTION_DAYS: Record<string, number> = { 'condition-photo': 90, signature: 365, document: 365 };
const DAY_MS = 86_400_000;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export interface ObjectStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}
export interface ObjectScanner {
  scan(bytes: Buffer, contentType: string): Promise<'clean' | 'rejected'>;
}
export class InMemoryObjectStore implements ObjectStore {
  private objects = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer) { this.objects.set(key, Buffer.from(bytes)); }
  async get(key: string) { const found = this.objects.get(key); return found ? Buffer.from(found) : null; }
}
/** Deterministic test scanner: only an explicit marker is rejected. */
export const fakeObjectScanner: ObjectScanner = {
  async scan(bytes) { return bytes.includes(Buffer.from('MALICIOUS')) || bytes.includes(Buffer.from('EICAR')) ? 'rejected' : 'clean'; },
};

export function objectsConfig(env: NodeJS.ProcessEnv = process.env) {
  const testFake = env.NODE_ENV === 'test' && env.WIND_OBJECTS_TEST_ONLY === '1';
  const blobConfigured = env.WIND_BLOB_ENABLED === '1' && !!env.WIND_BLOB_CONNECTION_STRING?.trim() && !!env.WIND_BLOB_CONTAINER?.trim();
  return { testFake, blobConfigured };
}

export async function privateObjectsAvailable(db: Persistence): Promise<boolean> {
  if (db.backend !== 'postgres') return false;
  const tables = await db.one("SELECT to_regclass('private_objects') AS objects, to_regclass('schema_migrations') AS migrations");
  return !!(tables?.objects && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=15'));
}

const serializeObject = (row: Row): Row => ({ id: row.id, orderId: Number(row.order_id), purpose: row.purpose,
  contentType: row.content_type, sizeBytes: Number(row.size_bytes), sha256: row.sha256, scanState: row.scan_state,
  retentionUntil: Number(row.retention_until), createdAt: Number(row.created_at) });

export class PrivateObjects {
  private db: Persistence;
  private fail: Fail;
  private store: ObjectStore | null;
  private scanner: ObjectScanner | null;
  constructor(db: Persistence, fail: Fail, deps: { store: ObjectStore | null; scanner: ObjectScanner | null }) {
    this.db = db; this.fail = fail; this.store = deps.store; this.scanner = deps.scanner;
  }
  /** Coded-but-off: without Blob configuration every operation is honestly
   * unavailable. No connection string exists in staging yet, and the real
   * Azure transport is not wired, so configured-but-unwired also lands here. */
  private async gate() {
    if (!(await privateObjectsAvailable(this.db)) || !this.store || !this.scanner) this.fail(409, 'objects_unavailable');
  }
  private async orderFor(orderId: number): Promise<Row> {
    return (await this.db.one('SELECT * FROM orders WHERE id=?', orderId)) ?? this.fail(404, 'not_found');
  }
  private participant(order: Row, actor: Actor) {
    if (actor.role !== 'admin' && actor.id !== Number(order.customer_id) && actor.id !== Number(order.driver_id))
      this.fail(403, 'forbidden');
  }

  async upload(actor: Actor, orderId: number, body: Row) {
    await this.gate();
    const order = await this.orderFor(orderId);
    this.participant(order, actor);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(k => !['purpose', 'contentType', 'sizeBytes', 'sha256', 'contentBase64'].includes(k))) this.fail(400, 'invalid_input');
    const purpose = String(body.purpose ?? '');
    if (!PRIVATE_OBJECT_PURPOSES.includes(purpose as never)) this.fail(400, 'invalid_input');
    const contentType = String(body.contentType ?? '');
    if (!PRIVATE_OBJECT_CONTENT_TYPES[purpose]!.includes(contentType)) this.fail(400, 'invalid_content_type');
    if (!Number.isSafeInteger(body.sizeBytes) || (body.sizeBytes as number) < 1) this.fail(400, 'invalid_input');
    if ((body.sizeBytes as number) > PRIVATE_OBJECT_MAX_BYTES) this.fail(400, 'object_too_large');
    const claimed = typeof body.sha256 === 'string' ? body.sha256.toLowerCase() : '';
    if (!/^[a-f0-9]{64}$/.test(claimed)) this.fail(400, 'invalid_checksum');
    if (typeof body.contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.contentBase64))
      this.fail(400, 'invalid_input');
    const bytes = Buffer.from(body.contentBase64, 'base64');
    if (bytes.length !== body.sizeBytes) this.fail(400, 'invalid_input');
    if (sha256(bytes) !== claimed) this.fail(400, 'checksum_mismatch');
    const id = randomUUID(), now = Date.now();
    const storageKey = `orders/${orderId}/${id}`;
    await this.store!.put(storageKey, bytes, contentType);
    await this.db.run(`INSERT INTO private_objects(id,order_id,uploader_id,purpose,content_type,size_bytes,sha256,storage_key,scan_state,retention_until,created_at,updated_at)
      VALUES(?::uuid,?,?,?,?,?,?,?,'pending',?,?,?)`,
      id, orderId, actor.id, purpose, contentType, bytes.length, claimed, storageKey,
      now + PURPOSE_RETENTION_DAYS[purpose]! * DAY_MS, now, now);
    const verdict = await this.scanner!.scan(bytes, contentType);
    await this.db.run('UPDATE private_objects SET scan_state=?,updated_at=? WHERE id=?::uuid', verdict, Date.now(), id);
    const row = (await this.db.one('SELECT * FROM private_objects WHERE id=?::uuid', id))!;
    // An upload alone never changes custody: no orders or custody row is
    // written here. Proof photos/signatures stay uncollected in the client
    // until the privacy approval in plan section 12 exists.
    return serializeObject(row);
  }

  async list(actor: Actor, orderId: number) {
    await this.gate();
    const order = await this.orderFor(orderId);
    this.participant(order, actor);
    const rows = await this.db.all('SELECT * FROM private_objects WHERE order_id=? ORDER BY created_at,id', orderId);
    return rows.map(serializeObject);
  }

  async mintRead(actor: Actor, orderId: number, objectId: string) {
    await this.gate();
    const order = await this.orderFor(orderId);
    this.participant(order, actor);
    const object = (await this.db.one('SELECT * FROM private_objects WHERE id=?::uuid AND order_id=?', objectId, orderId)) ?? this.fail(404, 'not_found');
    if (object!.scan_state === 'pending') this.fail(409, 'object_scan_pending');
    if (object!.scan_state !== 'clean') this.fail(409, 'object_rejected');
    const token = randomBytes(32).toString('hex'), now = Date.now(), expiresAt = now + OBJECT_READ_TTL_MS;
    await this.db.run('INSERT INTO private_object_reads(token_hash,object_id,order_id,subject_id,expires_at,created_at) VALUES(?,?::uuid,?,?,?,?)',
      sha256(token), objectId, orderId, actor.id, expiresAt, now);
    return { token, expiresAt, url: `/api/orders/${orderId}/objects/${objectId}/content?readToken=${token}` };
  }

  async content(actor: Actor, orderId: number, objectId: string, readToken: string | null) {
    await this.gate();
    if (!readToken) this.fail(401, 'read_invalid');
    const grant = await this.db.one('SELECT * FROM private_object_reads WHERE token_hash=?', sha256(readToken!));
    if (!grant || String(grant.object_id) !== objectId || Number(grant.order_id) !== orderId) this.fail(401, 'read_invalid');
    if (Number(grant!.expires_at) <= Date.now()) this.fail(401, 'read_expired');
    if (Number(grant!.subject_id) !== actor.id) this.fail(403, 'forbidden');
    const order = await this.orderFor(orderId);
    this.participant(order, actor);
    const object = (await this.db.one('SELECT * FROM private_objects WHERE id=?::uuid AND order_id=?', objectId, orderId)) ?? this.fail(404, 'not_found');
    if (object!.scan_state !== 'clean') this.fail(409, 'object_rejected');
    const bytes = await this.store!.get(String(object!.storage_key));
    if (!bytes) this.fail(409, 'objects_unavailable');
    return { contentBase64: bytes!.toString('base64'), contentType: object!.content_type, sizeBytes: Number(object!.size_bytes), sha256: object!.sha256 };
  }
}

export function createPrivateObjects(db: Persistence, fail: Fail, env: NodeJS.ProcessEnv = process.env): PrivateObjects {
  const config = objectsConfig(env);
  if (config.testFake) return new PrivateObjects(db, fail, { store: new InMemoryObjectStore(), scanner: fakeObjectScanner });
  // Real Azure Blob wiring stays off: no SDK transport is claimed here.
  return new PrivateObjects(db, fail, { store: null, scanner: null });
}

export function registerPrivateObjectRoutes(route: Register, service: PrivateObjects) {
  route('POST', '/api/orders/:id/objects', ctx => service.upload(ctx.user, Number(ctx.params[0]), ctx.body));
  route('GET', '/api/orders/:id/objects', ctx => service.list(ctx.user, Number(ctx.params[0])));
  route('POST', '/api/orders/:id/objects/([0-9a-f-]{36})/read', ctx => service.mintRead(ctx.user, Number(ctx.params[0]), ctx.params[1]!));
  route('GET', '/api/orders/:id/objects/([0-9a-f-]{36})/content', ctx => service.content(ctx.user, Number(ctx.params[0]), ctx.params[1]!, ctx.query.get('readToken')));
}
