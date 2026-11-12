import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { Pool, types, type PoolClient, type PoolConfig } from 'pg';
import { logServerError } from '../domain/diagnostics.ts';

export type Row = Record<string, any>;
export type WriteResult = { changes: number | bigint; lastInsertRowid: number | bigint };
type Effect = () => void | Promise<void>;
type Owner = { envelope?: boolean; savepoints?: string[]; client?: PoolClient; clientFailure?: Error; clientError?: (error: Error) => void; release?: () => void; active: boolean; closed: boolean; pending: Effect[]; committed: Effect[]; memo: Map<string, Promise<unknown>> };
export type PersistenceOptions = {
  sqlite?: DatabaseSync; connectionString?: string; pool?: PoolConfig;
  poolSize?: number; acquireTimeoutMs?: number; statementTimeoutMs?: number; lockTimeoutMs?: number;
};

// Preserve the installed API's numeric IDs/timestamps, and reject unsafe integer conversion.
const integer = (value: string) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError('Database integer exceeds the API safe-integer range');
  return number;
};
const numeric = (value: string) => {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER ||
    (/^[+-]?\d+$/.test(value) && BigInt(value) !== BigInt(number)))
    throw new RangeError('Database numeric exceeds the API safe-number range');
  return number;
};
const pgTypes = { getTypeParser: (oid: number, format?: 'text' | 'binary') =>
  oid === 20 && format !== 'binary' ? integer : oid === 1700 && format !== 'binary' ? numeric : types.getTypeParser(oid, format) };

/** Convert positional SQLite placeholders; quoted text, identifiers and comments stay literal. */
export function postgresSql(sql: string) {
  let index = 0;
  sql = sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$|'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g,
    token => token === '?' ? `$${++index}` : token);
  // Deliberately bounded adaptations for the inventoried legacy statements, not a general SQL parser.
  return sql.replace(/([\w.]+)\s*=\s*(\$\d+)\s+COLLATE NOCASE\b/gi, 'lower($1) = lower($2)')
    .replace(/\bIS\s+NOT\s+(\$\d+)/gi, 'IS DISTINCT FROM $1')
    .replace(/\bIS\s+(\$\d+)/gi, 'IS NOT DISTINCT FROM $1')
    .replace(/(\$\d+)\s+IS NULL/gi, '$1::text IS NULL')
    .replace(/\bMIN\((discount|ends_at),/gi, 'LEAST($1,')
    .replace(/\bAS\s+([a-z_]+[A-Z]\w*)\b/g, 'AS "$1"')
    .replace(/([\w.]|\))\s+([a-z_]+[A-Z]\w*)\b(?=\s*(?:,|FROM\b))/g, '$1 "$2"');
}

export class Persistence {
  readonly backend: 'sqlite' | 'postgres';
  readonly pool?: Pool;
  private readonly sqlite?: DatabaseSync;
  private readonly owners = new AsyncLocalStorage<Owner | undefined>();
  private sqliteTail: Promise<void> = Promise.resolve();
  private readonly acquireTimeout: number;

  constructor(options: PersistenceOptions) {
    for (const value of [options.poolSize, options.acquireTimeoutMs, options.statementTimeoutMs, options.lockTimeoutMs])
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error('Database bounds must be positive safe integers');
    // ponytail: a slow Windows test host (each PG connection is a new process, scanned by Defender) can need more than
    // the 1 s connect budget. Only the test-PC gate runner sets this; production ignores it and keeps 1 s.
    const testBudget = process.env.NODE_ENV === 'production' ? NaN : Number(process.env.WIND_TEST_DB_ACQUIRE_MS ?? '');
    this.acquireTimeout = options.acquireTimeoutMs ?? (Number.isSafeInteger(testBudget) && testBudget >= 1 ? Math.min(testBudget, 60_000) : 1_000);
    this.sqlite = options.sqlite;
    this.backend = options.connectionString ? 'postgres' : 'sqlite';
    if (this.backend === 'sqlite' && !this.sqlite) throw new Error('SQLite connection required');
    if (options.connectionString) {
      this.pool = new Pool({ ...options.pool, connectionString: options.connectionString,
        max: options.poolSize ?? 8, connectionTimeoutMillis: this.acquireTimeout,
        idleTimeoutMillis: 30_000, statement_timeout: options.statementTimeoutMs ?? 5_000,
        lock_timeout: options.lockTimeoutMs ?? 500, idle_in_transaction_session_timeout: 10_000,
        types: pgTypes });
      // Idle connection failures are reported without crashing the process; pg removes the client.
      this.pool.on('error', error => logServerError('postgres_idle_connection_failed', error));
    }
  }

  get inTransaction() { return this.owner()?.active ?? false; }
  detached<T>(work: () => Promise<T>) { return this.owners.run(undefined, () => this.scope(work)); }
  private owner() {
    const owner = this.owners.getStore();
    if (owner?.closed) throw new Error('Database request scope already closed');
    return owner;
  }

  /** A request/cron/CLI unit owns its connection, transaction and notifications through every await. */
  async scope<T>(work: () => Promise<T>): Promise<T> {
    if (this.owner()) return work();
    const owner: Owner = { active: false, closed: false, pending: [], committed: [], memo: new Map() };
    return this.owners.run(owner, async () => {
      try { return await work(); }
      finally {
        try { if (owner.active) await this.exec('ROLLBACK'); }
        finally {
          try { await this.flushEffects(); }
          finally { owner.closed = true; }
        }
      }
    });
  }

  /** Read reuse belongs only to this request. Writes and every transaction boundary invalidate it. */
  memo<T>(key: string, read: () => Promise<T>): Promise<T> {
    const owner = this.owner();
    if (!owner) return read();
    let value = owner.memo.get(key) as Promise<T> | undefined;
    if (!value) {
      value = read(); owner.memo.set(key, value);
      const pending = value;
      void value.catch(() => { if (owner.memo.get(key) === pending) owner.memo.delete(key); });
    }
    return value;
  }

  defer(effect: Effect) {
    const owner = this.owner();
    if (!owner) throw new Error('Effects require an owned request scope');
    (owner.active ? owner.pending : owner.committed).push(effect);
  }
  async flushEffects() {
    const owner = this.owner();
    if (!owner) return;
    for (const effect of owner.committed.splice(0)) {
      try { await effect(); } catch (error) { logServerError('committed_effect_failed', error); }
    }
  }

  private async sqliteLock() {
    let release!: () => void;
    const next = new Promise<void>(done => { release = done; });
    const previous = this.sqliteTail;
    this.sqliteTail = previous.then(() => next);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([previous, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('SQLite acquisition timeout'), { code: 'DB_ACQUIRE_TIMEOUT' })), this.acquireTimeout);
      })]);
      return release;
    } catch (error) { release(); throw error; }
    finally { clearTimeout(timer); }
  }

  private async query(sql: string, params: SQLInputValue[] = []) {
    const owner = this.owner();
    if (this.pool) {
      if (owner?.clientFailure) throw owner.clientFailure;
      const result = await (owner?.client ?? this.pool).query(postgresSql(sql), params);
      return { rows: (result.rows ?? []) as Row[], changes: result.rowCount ?? 0 };
    }
    const release = owner?.active ? undefined : await this.sqliteLock();
    try {
      const statement = this.sqlite!.prepare(sql);
      return { rows: statement.all(...params) as Row[], changes: 0 };
    } finally { release?.(); }
  }
  async all(sql: string, ...params: SQLInputValue[]): Promise<Row[]> { return (await this.query(sql, params)).rows; }
  async one(sql: string, ...params: SQLInputValue[]): Promise<Row | undefined> { return (await this.all(sql, ...params))[0]; }
  async run(sql: string, ...params: SQLInputValue[]): Promise<WriteResult> {
    this.owner()?.memo.clear();
    if (this.pool) {
      const ignore = /\bINSERT OR IGNORE\b/i.test(sql);
      sql = sql.replace(/\bINSERT OR IGNORE\b/i, 'INSERT');
      if (ignore) sql += ' ON CONFLICT DO NOTHING';
      if (/^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) sql += ' RETURNING *';
      const result = await this.query(sql, params);
      return { changes: result.changes, lastInsertRowid: result.rows[0]?.id ?? 0 };
    }
    const owner = this.owner();
    const release = owner?.active ? undefined : await this.sqliteLock();
    try { return this.sqlite!.prepare(sql).run(...params); }
    finally { release?.(); }
  }

  /** Legacy boundaries retain their deliberate commit-before-error semantics. No implicit nesting. */
  async exec(command: 'BEGIN' | 'BEGIN IMMEDIATE' | 'COMMIT' | 'ROLLBACK') {
    const owner = this.owner();
    if (!owner) throw new Error('Transactions require an owned request scope');
    owner.memo.clear();
    if (owner.envelope) {
      const stack = owner.savepoints!;
      if (command.startsWith('BEGIN')) {
        const name = `legacy_${stack.length}`;
        await owner.client!.query(`SAVEPOINT ${name}`); stack.push(name); return;
      }
      const name = stack.pop();
      if (!name) { if (command === 'ROLLBACK') return; throw new Error('Missing legacy transaction'); }
      if (command === 'ROLLBACK') await owner.client!.query(`ROLLBACK TO SAVEPOINT ${name}`);
      await owner.client!.query(`RELEASE SAVEPOINT ${name}`); return;
    }
    if (command.startsWith('BEGIN')) {
      if (owner.active) throw new Error('Nested transaction requires an explicit savepoint');
      if (this.pool) {
        owner.client = await this.pool.connect();
        owner.clientFailure = undefined;
        owner.clientError = error => { owner.clientFailure = error; };
        owner.client.on('error', owner.clientError);
        try { await owner.client.query('BEGIN'); }
        catch (error) { this.releaseClient(owner, true); throw error; }
      } else {
        owner.release = await this.sqliteLock();
        try { this.sqlite!.exec('BEGIN IMMEDIATE'); }
        catch (error) { owner.release(); owner.release = undefined; throw error; }
      }
      owner.active = true;
      return;
    }
    if (!owner.active) { if (command === 'ROLLBACK') return; throw new Error('No owned transaction'); }
    try {
      if (owner.clientFailure) throw owner.clientFailure;
      if (owner.client) {
        const result = await owner.client.query(command);
        if (command === 'COMMIT' && result.command !== 'COMMIT')
          throw Object.assign(new Error('PostgreSQL rolled back an aborted transaction'), { code: 'DB_TRANSACTION_ABORTED' });
      }
      else this.sqlite!.exec(command);
      if (command === 'COMMIT') owner.committed.push(...owner.pending);
    } catch (error) {
      // COMMIT failure has an unknown outcome on connection loss: never replay or publish.
      if (owner.client) this.releaseClient(owner, true);
      else if (this.sqlite!.isTransaction) this.sqlite!.exec('ROLLBACK');
      throw error;
    } finally {
      owner.pending.length = 0;
      owner.active = false;
      this.releaseClient(owner);
      owner.release?.(); owner.release = undefined;
    }
  }

  /** PG request envelope keeps legacy commit boundaries as savepoints until durable intents exist. */
  async atomic<T>(actor: { id?: number; purpose?: string; correlationId?: string }, work: () => Promise<T>): Promise<T> {
    if (this.backend !== 'postgres') return this.scope(work);
    return this.scope(async () => {
      if (this.inTransaction) return work();
      await this.exec('BEGIN');
      const owner = this.owner()!;
      try {
        await this.one("SELECT set_config('wind.actor_id', ?, true), set_config('wind.system_purpose', ?, true), set_config('wind.correlation_id', ?, true)",
          actor.id === undefined ? '' : String(actor.id), actor.purpose ?? 'http_public', actor.correlationId ?? '');
        owner.envelope = true; owner.savepoints = [];
        const value = await work();
        if (owner.savepoints.length) throw new Error('Unclosed legacy transaction');
        owner.envelope = false;
        await this.exec('COMMIT');
        return value;
      } catch (error) {
        owner.envelope = false;
        if (this.inTransaction) await this.exec('ROLLBACK');
        throw error;
      } finally { owner.envelope = false; owner.savepoints = undefined; }
    });
  }

  private releaseClient(owner: Owner, destroy = false) {
    const client = owner.client;
    if (!client) return;
    client.release(destroy);
    if (owner.clientError) client.off('error', owner.clientError);
    owner.client = undefined; owner.clientError = undefined; owner.clientFailure = undefined;
  }

  /** Retry only a caller-certified replay-safe DB-only unit, with an unchanged command ID. */
  async transaction<T>(work: (commandId: string) => Promise<T>, options: { commandId: string; replaySafe?: boolean; maxAttempts?: number }) {
    if (!options.commandId || (options.maxAttempts !== undefined && (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1)))
      throw new Error('Replay-safe transactions require a stable command ID and a positive integer attempt bound');
    const attempts = options.replaySafe ? Math.min(3, Math.max(1, options.maxAttempts ?? 3)) : 1;
    return this.scope(async () => {
      if (this.inTransaction) throw new Error('Cannot retry a nested transaction');
      for (let attempt = 1; ; attempt++) {
        try {
          await this.exec('BEGIN');
          const value = await work(options.commandId);
          await this.exec('COMMIT');
          return value;
        } catch (error) {
          if (this.inTransaction) await this.exec('ROLLBACK');
          if (attempt >= attempts || !['40001', '40P01'].includes((error as { code?: string }).code ?? '')) throw error;
          await new Promise(done => setTimeout(done, 10 * attempt));
        }
      }
    });
  }

  /** Transaction-scoped advisory lock: migration work and its lock commit or roll back together. */
  async migrate(key: number, work: () => Promise<void>) {
    return this.transaction(async () => {
      if (this.pool) await this.one('SELECT pg_advisory_xact_lock(?)', key);
      await work();
    }, { commandId: `migration:${key}` });
  }
  async close() { await this.pool?.end(); }
}
