import type { Persistence, Row } from '../db/persistence.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string; staff_role?: string | null };
type Context = { user: Actor; body: Row; params: string[] };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>) => unknown;
const roles = ['dispatcher', 'driver_reviewer', 'support', 'safety', 'finance', 'platform_admin'];
export const staffRoleOf = (actor: Actor) => actor.staff_role ?? (actor.role === 'admin' ? 'platform_admin' : null);
export function needStaff(actor: Actor, fail: Fail, ...scopes: string[]) {
  const role = staffRoleOf(actor);
  if (actor.role !== 'admin' || (role !== 'platform_admin' && !scopes.includes(role ?? ''))) fail(403, 'forbidden');
}
export async function opsAvailable(db: Persistence) {
  if (db.backend !== 'postgres') return false;
  const tables = await db.one("SELECT to_regclass('support_cases') AS cases, to_regclass('schema_migrations') AS migrations");
  return !!(tables?.cases && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=18'));
}
// The public user projection deliberately does not expose staff roles. Read current authority on each action.
export async function staffActor(db: Persistence, actor: Actor): Promise<Actor> {
  if (!(await opsAvailable(db))) return actor;
  const row = await db.one('SELECT role,staff_role FROM users WHERE id=?', actor.id);
  return row ? { ...actor, role: row.role, staff_role: row.staff_role } : { ...actor, role: '', staff_role: null };
}
export class Ops {
  private db: Persistence;
  private fail: Fail;
  constructor(db: Persistence, fail: Fail) { this.db = db; this.fail = fail; }
  private async gate() { if (!(await opsAvailable(this.db))) this.fail(409, 'ops_unavailable'); }
  private async tx<T>(work: () => Promise<T>): Promise<T> { return this.db.scope(async () => { if (this.db.inTransaction) return work(); await this.db.exec('BEGIN'); try { const value = await work(); await this.db.exec('COMMIT'); return value; } catch (e) { if (this.db.inTransaction) await this.db.exec('ROLLBACK'); throw e; } }); }
  private purpose(value: unknown) { if (typeof value !== 'string' || value.trim().length < 3) this.fail(400, 'purpose_required'); return (value as string).trim(); }
  private id(value: unknown) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) this.fail(400, 'invalid_input'); return id; }
  private async audit(actor: Actor, action: string, type: string, id: number, purpose: string) { await this.db.run('INSERT INTO staff_actions(actor_id,action,target_type,target_id,purpose,created_at) VALUES(?,?,?,?,?,?)', actor.id, action, type, String(id), purpose, Date.now()); }
  private async event(id: number, action: string, actor: Actor, note: string | null) { await this.db.run('INSERT INTO support_case_events(case_id,action,actor_id,note,created_at) VALUES(?,?,?,?,?)', id, action, actor.id, note, Date.now()); }
  async createCase(actor: Actor, body: Row) {
    await this.gate();
    if (typeof body.category !== 'string' || !body.category.trim() || !['normal','urgent','safety'].includes(body.severity)) this.fail(400, 'invalid_input');
    return this.tx(async () => {
      let orderId = null;
      if (body.orderId != null) { orderId = this.id(body.orderId); const order = await this.db.one('SELECT customer_id,driver_id FROM orders WHERE id=?', orderId) ?? this.fail(404, 'not_found'); if (actor.role !== 'admin' && actor.id !== order.customer_id && actor.id !== order.driver_id) this.fail(403, 'forbidden'); }
      const now = Date.now(); const row = (await this.db.one("INSERT INTO support_cases(order_id,reporter_id,category,severity,status,created_at,updated_at) VALUES(?,?,?,?,'open',?,?) RETURNING *", orderId, actor.id, body.category.trim(), body.severity, now, now))!;
      await this.event(row.id, 'created', actor, null); return row;
    });
  }
  async listCases(actor: Actor) {
    await this.gate(); actor = await staffActor(this.db, actor); const role = staffRoleOf(actor);
    if (actor.role !== 'admin') return this.db.all('SELECT * FROM support_cases WHERE reporter_id=? ORDER BY id DESC', actor.id);
    if (role === 'platform_admin' || role === 'support') return this.db.all('SELECT * FROM support_cases ORDER BY id DESC');
    if (role === 'safety') return this.db.all("SELECT * FROM support_cases WHERE severity='safety' ORDER BY id DESC");
    return this.fail(403, 'forbidden');
  }
  private async mutate(actor: Actor, caseId: number, body: Row, action: 'assign' | 'escalate' | 'resolve') {
    await this.gate(); actor = await staffActor(this.db, actor); needStaff(actor, this.fail, 'support', 'safety'); const purpose = this.purpose(body.purpose); caseId = this.id(caseId);
    return this.tx(async () => {
      const row = await this.db.one('SELECT * FROM support_cases WHERE id=? FOR UPDATE', caseId) ?? this.fail(404, 'not_found');
      if (row.severity === 'safety' && !['safety','platform_admin'].includes(staffRoleOf(actor) ?? '')) this.fail(403, 'forbidden');
      if (staffRoleOf(actor) === 'safety' && row.severity !== 'safety') this.fail(403, 'forbidden');
      if (['resolved','closed'].includes(row.status)) this.fail(409, 'case_closed');
      const now = Date.now(); let note: string | null = null;
      if (action === 'assign') { const owner = this.id(body.ownerId); const target = await this.db.one('SELECT role,staff_role FROM users WHERE id=?', owner) ?? this.fail(404, 'not_found'); if (target.role !== 'admin' || !['support','safety','platform_admin'].includes(staffRoleOf(target as Actor) ?? '') || (row.severity === 'safety' && !['safety','platform_admin'].includes(staffRoleOf(target as Actor) ?? ''))) this.fail(400, 'invalid_owner'); await this.db.run("UPDATE support_cases SET owner_id=?,status='assigned',updated_at=? WHERE id=?", owner, now, caseId); }
      if (action === 'escalate') { if (typeof body.reason !== 'string' || body.reason.trim().length < 5) this.fail(400, 'invalid_reason'); note = body.reason.trim(); await this.db.run("UPDATE support_cases SET escalation_reason=?,status='escalated',updated_at=? WHERE id=?", note, now, caseId); }
      if (action === 'resolve') await this.db.run("UPDATE support_cases SET status='resolved',resolved_at=?,updated_at=? WHERE id=?", now, now, caseId);
      await this.event(caseId, action, actor, note); await this.audit(actor, action, 'support_case', caseId, purpose); return (await this.db.one('SELECT * FROM support_cases WHERE id=?', caseId))!;
    });
  }
  assign(actor: Actor, id: number, body: Row) { return this.mutate(actor, id, body, 'assign'); }
  escalate(actor: Actor, id: number, body: Row) { return this.mutate(actor, id, body, 'escalate'); }
  resolve(actor: Actor, id: number, body: Row) { return this.mutate(actor, id, body, 'resolve'); }
  async grantRole(actor: Actor, targetId: number, body: Row) {
    await this.gate(); actor = await staffActor(this.db, actor); needStaff(actor, this.fail); const purpose = this.purpose(body.purpose); targetId = this.id(targetId);
    if (body.staffRole !== null && !roles.includes(body.staffRole)) this.fail(400, 'invalid_input');
    return this.tx(async () => {
      // Lock the shared set first, in one order: target-first locks deadlock on mutual demotions.
      const admins = await this.db.all("SELECT id FROM users WHERE role='admin' AND COALESCE(staff_role,'platform_admin')='platform_admin' ORDER BY id FOR UPDATE");
      actor = await staffActor(this.db, actor); needStaff(actor, this.fail);
      const target = await this.db.one('SELECT id,role,staff_role FROM users WHERE id=? FOR UPDATE', targetId) ?? this.fail(404, 'not_found');
      if (target.role !== 'admin') this.fail(400, 'invalid_target');
      if (staffRoleOf(target as Actor) === 'platform_admin' && body.staffRole !== null && body.staffRole !== 'platform_admin'
        && !admins.some(admin => admin.id !== targetId)) this.fail(409, 'last_platform_admin');
      await this.db.run('UPDATE users SET staff_role=? WHERE id=?', body.staffRole, targetId); await this.audit(actor, 'grant_role', 'user', targetId, purpose); return { id: targetId, staffRole: body.staffRole };
    });
  }
  async requestApproval(actor: Actor, body: Row) {
    await this.gate(); actor = await staffActor(this.db, actor); needStaff(actor, this.fail, 'finance');
    if (typeof body.subjectType !== 'string' || !body.subjectType.trim() || typeof body.subjectId !== 'string' || !body.subjectId.trim() || !Number.isSafeInteger(body.amountMinor) || body.amountMinor <= 0 || typeof body.reason !== 'string' || body.reason.trim().length < 3) this.fail(400, 'invalid_input');
    return this.tx(async () => { const row = (await this.db.one("INSERT INTO financial_approvals(subject_type,subject_id,amount_minor,requested_by,status,reason,created_at) VALUES(?,?,?,?,'pending',?,?) RETURNING *", body.subjectType.trim(), body.subjectId.trim(), body.amountMinor, actor.id, body.reason.trim(), Date.now()))!; await this.audit(actor, 'request_approval', 'financial_approval', row.id, body.reason.trim()); return row; });
  }
  async decideApproval(actor: Actor, id: number, body: Row) {
    await this.gate(); actor = await staffActor(this.db, actor); needStaff(actor, this.fail, 'finance'); const purpose = this.purpose(body.purpose); id = this.id(id);
    if (!['approved','rejected'].includes(body.decision)) this.fail(400, 'invalid_input');
    return this.tx(async () => { const row = await this.db.one('SELECT * FROM financial_approvals WHERE id=? FOR UPDATE', id) ?? this.fail(404, 'not_found'); if (row.requested_by === actor.id) this.fail(409, 'second_approver_required'); if (row.status !== 'pending') this.fail(409, 'approval_decided'); const updated = (await this.db.one('UPDATE financial_approvals SET status=?,decided_by=?,decided_at=? WHERE id=? RETURNING *', body.decision, actor.id, Date.now(), id))!; await this.audit(actor, 'decide_approval', 'financial_approval', id, purpose); return updated; });
  }
  async listStaffActions(actor: Actor) { await this.gate(); actor = await staffActor(this.db, actor); needStaff(actor, this.fail); return this.db.all('SELECT * FROM staff_actions ORDER BY id DESC'); }
}
export function registerOpsRoutes(route: Register, service: Ops) {
  route('POST', '/api/support/cases', ctx => service.createCase(ctx.user, ctx.body));
  route('GET', '/api/support/cases', ctx => service.listCases(ctx.user));
  route('POST', '/api/support/cases/:id/assign', ctx => service.assign(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/support/cases/:id/escalate', ctx => service.escalate(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/support/cases/:id/resolve', ctx => service.resolve(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/admin/staff/:id/role', ctx => service.grantRole(ctx.user, Number(ctx.params[0]), ctx.body));
  route('POST', '/api/admin/approvals', ctx => service.requestApproval(ctx.user, ctx.body));
  route('POST', '/api/admin/approvals/:id/decide', ctx => service.decideApproval(ctx.user, Number(ctx.params[0]), ctx.body));
  route('GET', '/api/admin/staff-actions', ctx => service.listStaffActions(ctx.user));
}
