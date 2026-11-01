import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import { logServerError } from './diagnostics.ts';

type Ctx = { user: { id?: number; role?: string }; body: Row; params: string[]; query: URLSearchParams; req: unknown };

type Fail = (status: number, message: string) => never;

export class OpencodeService {
  private db: Persistence;
  private fail: Fail;
  private env: NodeJS.ProcessEnv;
  constructor(db: Persistence, fail: Fail, env: NodeJS.ProcessEnv = process.env) {
    this.db = db; this.fail = fail; this.env = env;
  }

  private admin(actor: { id?: number; role?: string }) {
    if (!actor || actor.role !== 'admin') this.fail(403, 'forbidden');
  }

  private async available() {
    // An autonomous CLI has the API process's filesystem/credential privileges.
    // Production needs an isolated job runner before this can be enabled safely.
    if (this.env.NODE_ENV === 'production' || this.env.WIND_OPENCODE_ENABLED !== '1' || !this.env.ZRO_CLI_PATH?.trim())
      this.fail(409, 'opencode_unavailable');
    // PostgreSQL startup never migrates schemas. Keep this optional feature closed
    // on schemas which have not been provisioned for it.
    if (this.db.backend === 'postgres' && !(await this.db.one("SELECT to_regclass('opencode_jobs') AS jobs"))?.jobs)
      this.fail(409, 'opencode_unavailable');
  }

  async runJob(actor: { id?: number; role?: string }, model: unknown, provider: unknown, prompt: unknown) {
    this.admin(actor);
    await this.available();
    if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)
      || typeof provider !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(provider)
      || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8_000) this.fail(400, 'invalid_input');
    const id = randomUUID();
    const now = Date.now();
    await this.db.run('INSERT INTO opencode_jobs (id, provider, model, input, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?)', id, provider, model, prompt, 'queued', now, now);
    // Run detached so the HTTP request returns immediately.
    // Start only after the request's transaction commits. Otherwise a detached
    // PostgreSQL connection cannot see the job and a rollback could still launch it.
    this.db.defer(() => { void this.db.detached(async () => {
      try {
        await this.db.run('UPDATE opencode_jobs SET status=?, updated_at=? WHERE id=?', 'running', Date.now(), id);
        // Run the operator-installed version; never download executable @latest
        // packages in response to an HTTP request.
        const cp = spawn(this.env.ZRO_CLI_PATH!.trim(), ['launch', 'opencode', '--model', model, '--auto', '--prompt', prompt],
          { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let out = '';
        let stopped = false;
        const capture = (data: Buffer) => {
          out = (out + String(data)).slice(0, 65_536);
          if (out.length >= 65_536) { stopped = true; cp.kill('SIGKILL'); }
        };
        cp.stdout.on('data', capture);
        cp.stderr.on('data', capture);
        const timer = setTimeout(() => { stopped = true; cp.kill('SIGKILL'); }, 120_000);
        let code: number | null;
        try {
          code = await new Promise<number | null>((resolve, reject) => {
            cp.once('error', reject);
            cp.once('close', resolve);
          });
        } finally { clearTimeout(timer); }
        const status = code === 0 && !stopped ? 'completed' : 'failed';
        await this.db.run('UPDATE opencode_jobs SET status=?, result=?, updated_at=? WHERE id=?', status, out, Date.now(), id);
      } catch (error) {
        logServerError('maintenance_failed', error);
        await this.db.run('UPDATE opencode_jobs SET status=?, result=?, updated_at=? WHERE id=?', 'failed', 'opencode_failed', Date.now(), id);
      }
    }).catch(error => logServerError('maintenance_failed', error)); });
    return await this.db.one('SELECT * FROM opencode_jobs WHERE id=?', id);
  }

  async getJob(actor: { id?: number; role?: string }, id: string) {
    this.admin(actor);
    await this.available();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) this.fail(400, 'invalid_input');
    return await this.db.one('SELECT * FROM opencode_jobs WHERE id=?', id) ?? this.fail(404, 'not_found');
  }

  async listJobs(actor: { id?: number; role?: string }) {
    this.admin(actor);
    await this.available();
    return await this.db.all('SELECT * FROM opencode_jobs ORDER BY created_at DESC LIMIT ?', 100);
  }
}

export function createOpencode(db: Persistence, fail: Fail, env: NodeJS.ProcessEnv = process.env) { return new OpencodeService(db, fail, env); }

export function registerOpencodeRoutes(route: (method: string, path: string, handler: (ctx: Ctx) => Promise<unknown>, isPublic?: boolean) => void, service: OpencodeService) {
  route('POST', '/api/opencode/run', async (ctx: Ctx) => service.runJob(ctx.user, ctx.body.model, ctx.body.provider ?? process.env.ZRO_PROVIDER_NAME ?? 'moonmath', ctx.body.prompt ?? ctx.body.input), false);
  route('GET', '/api/opencode/([^/]+)', async (ctx: Ctx) => service.getJob(ctx.user, ctx.params[0]));
  route('GET', '/api/opencode', async (ctx: Ctx) => service.listJobs(ctx.user));
}
