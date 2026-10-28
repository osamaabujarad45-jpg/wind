import { createHash } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; params: string[] };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>) => unknown;

export const DECLARED_ITEM_MAX = 200;
export const DECLARED_DIM_MAX_MM = 100_000;
export const DECLARED_MASS_MAX_GRAMS = 1_000_000_000;
const MAX_TIME = 9_007_199_254_740_991;
const SCOPE_FIELDS = ['itemCount', 'lengthMm', 'widthMm', 'heightMm', 'massGrams', 'volumeCm3', 'declaredValueMinor',
  'equipment', 'crewCount', 'loadingAfter', 'loadingBefore', 'accessConstraints',
  'pickupPromisedAfter', 'pickupPromisedBefore', 'dropoffPromisedBefore', 'sourceRef'];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value as Row).sort().map(k => [k, canonical((value as Row)[k])])) : value;

export type DeclaredScopeInput = {
  itemCount: number | null; lengthMm: number | null; widthMm: number | null; heightMm: number | null;
  massGrams: number | null; volumeCm3: number | null; declaredValueMinor: number | null;
  equipment: string[]; crewCount: number | null; loadingAfter: number | null; loadingBefore: number | null;
  accessConstraints: string[]; pickupPromisedAfter: number | null; pickupPromisedBefore: number | null;
  dropoffPromisedBefore: number | null; sourceRef: string | null;
};

export async function scopeAvailable(db: Persistence): Promise<boolean> {
  if (db.backend !== 'postgres') return false;
  const tables = await db.one("SELECT to_regclass('order_declared_scope') AS scope, to_regclass('custody_records') AS custody, to_regclass('schema_migrations') AS migrations");
  return !!(tables?.scope && tables.custody && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=15'));
}

/** The declared row for an order, or null when migration 15 has not run. */
export async function declaredScopeRow(db: Persistence, orderId: number): Promise<Row | null> {
  if (db.backend !== 'postgres') return null;
  if (!(await db.one("SELECT to_regclass('order_declared_scope') AS t"))?.t) return null;
  return (await db.one('SELECT * FROM order_declared_scope WHERE order_id=?', orderId)) ?? null;
}

function intField(fail: Fail, value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(400, 'invalid_input');
  return value as number;
}
function optInt(fail: Fail, value: unknown, min: number, max: number): number | null {
  return value === undefined || value === null ? null : intField(fail, value, min, max);
}
function tokenList(fail: Fail, value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 30 || value.some(x => typeof x !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(x))) fail(400, 'invalid_input');
  return [...new Set(value as string[])].sort();
}

/**
 * Validate a customer-declared scope. Declared data is a contract, never a
 * measurement: nothing here invents dimensions for an order that has none.
 * Volume is the summed per-piece bounding volume, exactly as WP05 computes
 * measured cm3; a supplied volume that disagrees is rejected, not trusted.
 */
export function validateDeclaredScope(service: string, raw: unknown, fail: Fail): DeclaredScopeInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'invalid_input');
  const body = raw as Row;
  if (Object.keys(body).some(k => !SCOPE_FIELDS.includes(k))) fail(400, 'invalid_input');
  if (service !== 'parcel' && service !== 'freight') fail(400, 'invalid_input');
  const itemCount = optInt(fail, body.itemCount, 1, DECLARED_ITEM_MAX);
  const dims = [body.lengthMm, body.widthMm, body.heightMm];
  const dimsGiven = dims.filter(v => v !== undefined && v !== null).length;
  if (dimsGiven !== 0 && dimsGiven !== 3) fail(400, 'invalid_input');
  const lengthMm = optInt(fail, body.lengthMm, 1, DECLARED_DIM_MAX_MM);
  const widthMm = optInt(fail, body.widthMm, 1, DECLARED_DIM_MAX_MM);
  const heightMm = optInt(fail, body.heightMm, 1, DECLARED_DIM_MAX_MM);
  const massGrams = optInt(fail, body.massGrams, 1, DECLARED_MASS_MAX_GRAMS);
  const declaredValueMinor = optInt(fail, body.declaredValueMinor, 0, MAX_TIME);
  const equipment = tokenList(fail, body.equipment);
  const accessConstraints = tokenList(fail, body.accessConstraints);
  const crewCount = optInt(fail, body.crewCount, 1, 20);
  const loadingAfter = optInt(fail, body.loadingAfter, 0, MAX_TIME);
  const loadingBefore = optInt(fail, body.loadingBefore, 0, MAX_TIME);
  const pickupPromisedAfter = optInt(fail, body.pickupPromisedAfter, 0, MAX_TIME);
  const pickupPromisedBefore = optInt(fail, body.pickupPromisedBefore, 0, MAX_TIME);
  const dropoffPromisedBefore = optInt(fail, body.dropoffPromisedBefore, 0, MAX_TIME);
  if (loadingAfter !== null && loadingBefore !== null && loadingBefore < loadingAfter) fail(400, 'invalid_input');
  if (pickupPromisedAfter !== null && pickupPromisedBefore !== null && pickupPromisedBefore < pickupPromisedAfter) fail(400, 'invalid_input');
  if (pickupPromisedBefore !== null && dropoffPromisedBefore !== null && dropoffPromisedBefore < pickupPromisedBefore) fail(400, 'invalid_input');
  let volumeCm3: number | null = null;
  if (lengthMm !== null && widthMm !== null && heightMm !== null) {
    const perPiece = Math.ceil(lengthMm * widthMm * heightMm / 1000);
    volumeCm3 = perPiece * (itemCount ?? 1);
    if (!Number.isSafeInteger(volumeCm3) || volumeCm3 < 1 || volumeCm3 > DECLARED_MASS_MAX_GRAMS) fail(400, 'invalid_input');
    if (body.volumeCm3 !== undefined && body.volumeCm3 !== null && body.volumeCm3 !== volumeCm3) fail(400, 'invalid_input');
  } else if (body.volumeCm3 !== undefined && body.volumeCm3 !== null) {
    volumeCm3 = intField(fail, body.volumeCm3, 1, DECLARED_MASS_MAX_GRAMS);
  }
  let sourceRef: string | null = null;
  if (body.sourceRef !== undefined && body.sourceRef !== null) {
    if (typeof body.sourceRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,159}$/.test(body.sourceRef)) fail(400, 'invalid_input');
    sourceRef = body.sourceRef;
  }
  if (service === 'parcel') {
    if (itemCount === null || lengthMm === null || massGrams === null || declaredValueMinor === null) fail(400, 'invalid_input');
    if (crewCount !== null || loadingAfter !== null || loadingBefore !== null || accessConstraints.length) fail(400, 'invalid_input');
  } else {
    if (crewCount === null || loadingAfter === null || loadingBefore === null) fail(400, 'invalid_input');
  }
  return { itemCount, lengthMm, widthMm, heightMm, massGrams, volumeCm3, declaredValueMinor, equipment,
    crewCount, loadingAfter, loadingBefore, accessConstraints, pickupPromisedAfter, pickupPromisedBefore, dropoffPromisedBefore, sourceRef };
}

export const scopePayloadHash = (input: DeclaredScopeInput) => sha256(JSON.stringify(canonical({ ...input, sourceRef: undefined })));

export function serializeScope(row: Row): Row {
  const list = (value: unknown): string[] => Array.isArray(value) ? value as string[]
    : typeof value === 'string' ? JSON.parse(value) as string[] : [];
  const num = (value: unknown) => value === null || value === undefined ? null : Number(value);
  return { orderId: Number(row.order_id), service: row.service, revision: Number(row.revision),
    itemCount: num(row.item_count), lengthMm: num(row.length_mm), widthMm: num(row.width_mm), heightMm: num(row.height_mm),
    massGrams: num(row.mass_grams), volumeCm3: num(row.volume_cm3), declaredValueMinor: num(row.declared_value_minor),
    equipment: list(row.equipment), crewCount: num(row.crew_count), loadingAfter: num(row.loading_after), loadingBefore: num(row.loading_before),
    accessConstraints: list(row.access_constraints), pickupPromisedAfter: num(row.pickup_promised_after),
    pickupPromisedBefore: num(row.pickup_promised_before), dropoffPromisedBefore: num(row.dropoff_promised_before),
    sourceRef: row.source_ref ?? null, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) };
}

/** Insert or revise the declared scope inside the caller's transaction. The
 * source_ref unique index is the atomic claim: a concurrent replay that loses
 * the insert race re-reads the winner instead of duplicating the scope. */
export async function saveDeclaredScope(db: Persistence, fail: Fail, orderId: number, service: string, input: DeclaredScopeInput): Promise<Row> {
  const hash = scopePayloadHash(input);
  if (input.sourceRef) {
    const prior = await db.one('SELECT * FROM order_declared_scope WHERE source_ref=?', input.sourceRef);
    if (prior) {
      if (Number(prior.order_id) !== orderId || prior.payload_hash !== hash) fail(409, 'idempotency_conflict');
      return prior;
    }
  }
  const now = Date.now();
  try {
    return await insertDeclaredScope(db, orderId, service, input, hash, now);
  } catch (error) {
    if (input.sourceRef && (error as { code?: string }).code === '23505') {
      const winner = await db.one('SELECT * FROM order_declared_scope WHERE source_ref=?', input.sourceRef);
      if (winner && Number(winner.order_id) === orderId && winner.payload_hash === hash) return winner;
      fail(409, 'idempotency_conflict');
    }
    throw error;
  }
}

async function insertDeclaredScope(db: Persistence, orderId: number, service: string, input: DeclaredScopeInput, hash: string, now: number): Promise<Row> {
  const row = await db.one(`INSERT INTO order_declared_scope(order_id,service,item_count,length_mm,width_mm,height_mm,mass_grams,volume_cm3,
      declared_value_minor,equipment,crew_count,loading_after,loading_before,access_constraints,
      pickup_promised_after,pickup_promised_before,dropoff_promised_before,source_ref,payload_hash,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?,?::jsonb,?,?,?,?,?,?,?)
    ON CONFLICT(order_id) DO UPDATE SET service=excluded.service,item_count=excluded.item_count,length_mm=excluded.length_mm,
      width_mm=excluded.width_mm,height_mm=excluded.height_mm,mass_grams=excluded.mass_grams,volume_cm3=excluded.volume_cm3,
      declared_value_minor=excluded.declared_value_minor,equipment=excluded.equipment,crew_count=excluded.crew_count,
      loading_after=excluded.loading_after,loading_before=excluded.loading_before,access_constraints=excluded.access_constraints,
      pickup_promised_after=excluded.pickup_promised_after,pickup_promised_before=excluded.pickup_promised_before,
      dropoff_promised_before=excluded.dropoff_promised_before,source_ref=excluded.source_ref,payload_hash=excluded.payload_hash,
      updated_at=excluded.updated_at,revision=order_declared_scope.revision+1 RETURNING *`,
    orderId, service, input.itemCount, input.lengthMm, input.widthMm, input.heightMm, input.massGrams, input.volumeCm3,
    input.declaredValueMinor, JSON.stringify(input.equipment), input.crewCount, input.loadingAfter, input.loadingBefore,
    JSON.stringify(input.accessConstraints), input.pickupPromisedAfter, input.pickupPromisedBefore, input.dropoffPromisedBefore,
    input.sourceRef, hash, now, now);
  return row!;
}

export async function custodyFor(db: Persistence, orderId: number): Promise<Row[]> {
  if (!(await scopeAvailable(db))) return [];
  const rows = await db.all('SELECT * FROM custody_records WHERE order_id=? ORDER BY id', orderId);
  return rows.map(r => ({ id: Number(r.id), orderId: Number(r.order_id), kind: r.kind, actorId: Number(r.actor_id), actorRole: r.actor_role, createdAt: Number(r.created_at) }));
}

type ActualLoad = { itemCount: number; massGrams: number; lengthMm: number; widthMm: number; heightMm: number };

export class ResourceScope {
  private db: Persistence;
  private fail: Fail;
  constructor(db: Persistence, fail: Fail) { this.db = db; this.fail = fail; }
  private async requireAvailable() { if (!(await scopeAvailable(this.db))) this.fail(409, 'scope_unavailable'); }
  async summary(orderId: number, viewer: { id: number; role: string }, order: Row): Promise<Row | null> {
    const row = await declaredScopeRow(this.db, orderId);
    if (!row) return null;
    const visible = viewer.role === 'admin' || viewer.id === Number(order.customer_id) || viewer.id === Number(order.driver_id)
      || (viewer.role === 'driver' && order.status === 'searching');
    return visible ? serializeScope(row) : null;
  }
  private async orderFor(orderId: number): Promise<Row> {
    return (await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', orderId)) ?? this.fail(404, 'not_found');
  }
  private participant(order: Row, actor: Actor) {
    if (actor.role !== 'admin' && actor.id !== Number(order.customer_id) && actor.id !== Number(order.driver_id)) this.fail(404, 'not_found');
  }
  private async effective(orderId: number): Promise<{ source: 'measured' | 'declared'; itemCount: number; massGrams: number; lengthMm: number; widthMm: number; heightMm: number } | null> {
    // Precedence: an operator-measured order_requirements row always wins over
    // customer-declared scope; declared data never overwrites a measurement.
    const measured = await this.db.one('SELECT * FROM order_requirements WHERE order_id=?', orderId);
    if (measured) {
      const items = (Array.isArray(measured.items) ? measured.items : []) as Row[];
      return { source: 'measured', itemCount: Number(measured.pieces), massGrams: Number(measured.grams),
        lengthMm: Math.max(0, ...items.map(i => Number(i.lengthMm) || 0)), widthMm: Math.max(0, ...items.map(i => Number(i.widthMm) || 0)),
        heightMm: Math.max(0, ...items.map(i => Number(i.heightMm) || 0)) };
    }
    const declared = await declaredScopeRow(this.db, orderId);
    if (!declared) return null;
    return { source: 'declared', itemCount: Number(declared.item_count ?? 1), massGrams: Number(declared.mass_grams ?? 0),
      lengthMm: Number(declared.length_mm ?? 0), widthMm: Number(declared.width_mm ?? 0), heightMm: Number(declared.height_mm ?? 0) };
  }
  private covers(effective: { itemCount: number; massGrams: number; lengthMm: number; widthMm: number; heightMm: number }, actual: ActualLoad) {
    return actual.itemCount <= effective.itemCount && actual.massGrams <= effective.massGrams
      && actual.lengthMm <= effective.lengthMm && actual.widthMm <= effective.widthMm && actual.heightMm <= effective.heightMm;
  }
  private async resume(order: Row, actor: Actor, action: string) {
    const now = Date.now();
    await this.db.run("UPDATE orders SET status='at_pickup',exception_reason=NULL,updated_at=? WHERE id=?", now, order.id);
    await this.db.run("INSERT INTO security_events(actor_id,order_id,action,detail,created_at) VALUES(?,?,'SCOPE_RESOLVED',?,?)",
      actor.id, order.id, JSON.stringify({ action }), now);
    return { ok: true, orderId: Number(order.id), status: 'at_pickup', resolution: action };
  }

  async putScope(actor: Actor, orderId: number, body: Row) {
    await this.requireAvailable();
    if (actor.role === 'driver') this.fail(403, 'forbidden');
    const order = await this.orderFor(orderId);
    if (actor.role !== 'admin' && actor.id !== Number(order.customer_id)) this.fail(404, 'not_found');
    const pausedMismatch = order.status === 'on_hold' && order.exception_reason === 'scope_mismatch';
    if (order.status !== 'searching' && !pausedMismatch) this.fail(409, 'order_changed');
    const input = validateDeclaredScope(String(order.service), body?.declaredScope ?? body, this.fail);
    if (body?.declaredScope !== undefined && Object.keys(body).some(k => k !== 'declaredScope')) this.fail(400, 'invalid_input');
    const row = await saveDeclaredScope(this.db, this.fail, orderId, String(order.service), input);
    if (pausedMismatch) {
      const latest = await this.db.one("SELECT * FROM order_scope_checks WHERE order_id=? AND outcome='mismatch' ORDER BY id DESC LIMIT 1", orderId);
      const measured = await this.db.one('SELECT order_id FROM order_requirements WHERE order_id=?', orderId);
      const actual: ActualLoad | null = latest ? { itemCount: Number(latest.actual_item_count), massGrams: Number(latest.actual_mass_grams),
        lengthMm: Number(latest.actual_length_mm), widthMm: Number(latest.actual_width_mm), heightMm: Number(latest.actual_height_mm) } : null;
      // Customer-approved scope change: the revised declaration itself becomes
      // the contract. Price and cash rows are never touched by a scope change.
      if (actual && !measured && this.covers({ itemCount: input.itemCount ?? 1, massGrams: input.massGrams ?? 0,
        lengthMm: input.lengthMm ?? 0, widthMm: input.widthMm ?? 0, heightMm: input.heightMm ?? 0 }, actual)) {
        await this.resume(order, actor, 'customer_scope_change');
        return { declaredScope: serializeScope((await declaredScopeRow(this.db, orderId))!), resumed: true };
      }
    }
    return { declaredScope: serializeScope(row) };
  }

  async getScope(actor: Actor, orderId: number) {
    await this.requireAvailable();
    const order = (await this.db.one('SELECT * FROM orders WHERE id=?', orderId)) ?? this.fail(404, 'not_found');
    const searchingDriver = actor.role === 'driver' && order!.status === 'searching';
    if (!searchingDriver) this.participant(order!, actor);
    const row = await declaredScopeRow(this.db, orderId);
    return { declaredScope: row ? serializeScope(row) : null, custody: await custodyFor(this.db, orderId) };
  }

  async appendCustody(actor: Actor, orderId: number, body: Row) {
    await this.requireAvailable();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'kind')) this.fail(400, 'invalid_input');
    if (!['collected', 'handed', 'returned'].includes(body.kind as string)) this.fail(400, 'invalid_input');
    const order = await this.orderFor(orderId);
    this.participant(order, actor);
    if (order.driver_id === null || !['assigned', 'at_pickup', 'in_transit', 'on_hold', 'returning', 'completed', 'returned'].includes(order.status as string))
      this.fail(409, 'custody_unavailable');
    await this.db.run('INSERT INTO custody_records(order_id,kind,actor_id,actor_role,created_at) VALUES(?,?,?,?,?)',
      orderId, body.kind, actor.id, actor.role, Date.now());
    return { custody: await custodyFor(this.db, orderId) };
  }

  async pickupCheck(actor: Actor, orderId: number, body: Row) {
    await this.requireAvailable();
    if (actor.role !== 'driver') this.fail(403, 'forbidden');
    const raw = body?.actual;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || Object.keys(raw).some(k => !['itemCount', 'massGrams', 'lengthMm', 'widthMm', 'heightMm'].includes(k))) this.fail(400, 'invalid_input');
    const actual: ActualLoad = { itemCount: intField(this.fail, raw.itemCount, 1, 100_000), massGrams: intField(this.fail, raw.massGrams, 1, DECLARED_MASS_MAX_GRAMS),
      lengthMm: intField(this.fail, raw.lengthMm, 1, DECLARED_DIM_MAX_MM), widthMm: intField(this.fail, raw.widthMm, 1, DECLARED_DIM_MAX_MM),
      heightMm: intField(this.fail, raw.heightMm, 1, DECLARED_DIM_MAX_MM) };
    if (Object.keys(body).some(k => k !== 'actual')) this.fail(400, 'invalid_input');
    const order = await this.orderFor(orderId);
    if (Number(order.driver_id) !== actor.id) this.fail(404, 'not_found');
    if (order.status !== 'at_pickup') this.fail(409, 'cannot_check_pickup');
    if (await this.db.one("SELECT id FROM safety_incidents WHERE order_id=? AND status='open' LIMIT 1", orderId)) this.fail(409, 'safety_hold');
    const effective = await this.effective(orderId);
    // Legacy unknown size keeps the inspection gate: with no measured or
    // declared scope there is nothing to compare against, and no dimensions
    // are invented to fill the gap.
    if (!effective) this.fail(409, 'measured_requirements_missing');
    const matched = this.covers(effective!, actual);
    const now = Date.now();
    await this.db.run(`INSERT INTO order_scope_checks(order_id,reporter_id,actual_item_count,actual_mass_grams,actual_length_mm,actual_width_mm,actual_height_mm,outcome,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`, orderId, actor.id, actual.itemCount, actual.massGrams, actual.lengthMm, actual.widthMm, actual.heightMm, matched ? 'matched' : 'mismatch', now);
    if (matched) return { ok: true, orderId, outcome: 'matched' as const, scopeSource: effective!.source };
    // A pickup mismatch pauses the job on the existing on_hold machinery. The
    // driver cannot add a fee: this path never writes price or cash rows.
    await this.db.run("UPDATE orders SET status='on_hold',exception_reason='scope_mismatch',updated_at=? WHERE id=?", now, orderId);
    await this.db.run("INSERT INTO security_events(actor_id,order_id,action,detail,created_at) VALUES(?,?,'PICKUP_SCOPE_MISMATCH',?,?)",
      actor.id, orderId, JSON.stringify({ scopeSource: effective!.source, actual }), now);
    return { ok: true, orderId, outcome: 'mismatch' as const, scopeSource: effective!.source, status: 'on_hold' };
  }

  async resolveScope(actor: Actor, orderId: number, body: Row) {
    await this.requireAvailable();
    if (actor.role !== 'admin') this.fail(403, 'forbidden');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['action', 'reason'].includes(k))) this.fail(400, 'invalid_input');
    if (!['inspect', 'support'].includes(body.action as string)) this.fail(400, 'invalid_input');
    const order = await this.orderFor(orderId);
    if (order.status !== 'on_hold' || order.exception_reason !== 'scope_mismatch') this.fail(409, 'cannot_resolve');
    if (body.action === 'support') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 5 || reason.length > 500) this.fail(400, 'reason_required');
    } else {
      // Inspected capacity: support confirms the reported actual load still
      // fits the assigned vehicle alongside its other reserved load.
      const latest = await this.db.one("SELECT * FROM order_scope_checks WHERE order_id=? AND outcome='mismatch' ORDER BY id DESC LIMIT 1", orderId);
      if (!latest) this.fail(409, 'measured_requirements_missing');
      const actual: ActualLoad = { itemCount: Number(latest!.actual_item_count), massGrams: Number(latest!.actual_mass_grams),
        lengthMm: Number(latest!.actual_length_mm), widthMm: Number(latest!.actual_width_mm), heightMm: Number(latest!.actual_height_mm) };
      const link = await this.db.one('SELECT vehicle_id FROM driver_eligibility WHERE driver_id=?', Number(order.driver_id));
      const vehicle = link && await this.db.one('SELECT * FROM vehicles WHERE id=?', link.vehicle_id);
      if (!vehicle) this.fail(409, 'vehicle_evidence_missing');
      const others = await this.db.all(`SELECT r.* FROM capacity_reservations r JOIN orders o ON o.id=r.order_id
        WHERE r.vehicle_id=? AND o.status IN ('assigned','at_pickup','in_transit','on_hold','returning') AND o.id<>?`, vehicle!.id, orderId);
      const volumeCm3 = actual.itemCount * Math.ceil(actual.lengthMm * actual.widthMm * actual.heightMm / 1000);
      if (actual.lengthMm > Number(vehicle!.length_mm) || actual.widthMm > Number(vehicle!.width_mm) || actual.heightMm > Number(vehicle!.height_mm)
        || others.reduce((s, r) => s + Number(r.grams), actual.massGrams) > Number(vehicle!.usable_grams)
        || others.reduce((s, r) => s + Number(r.cm3), volumeCm3) > Number(vehicle!.usable_cm3)
        || others.reduce((s, r) => s + Number(r.pieces), actual.itemCount) > Math.min(200, Number(vehicle!.max_pieces)))
        this.fail(409, 'measured_capacity_exceeded');
    }
    return this.resume(order, actor, body.action === 'inspect' ? 'inspected_capacity' : 'support_exception');
  }
}

export function registerResourceScopeRoutes(route: Register, service: ResourceScope) {
  route('POST', '/api/orders/:id/scope', ctx => service.putScope(ctx.user, Number(ctx.params[0]), ctx.body));
  route('GET', '/api/orders/:id/scope', ctx => service.getScope(ctx.user, Number(ctx.params[0])));
  route('POST', '/api/orders/:id/custody', ctx => service.appendCustody(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/orders/:id/pickup-check', ctx => service.pickupCheck(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/orders/:id/scope/resolve', ctx => service.resolveScope(ctx.user, Number(ctx.params[0]), ctx.body));
}
