import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Persistence } from '../server/db/persistence.ts';

const postgres = process.argv.includes('--postgres');
const sqlite = postgres ? undefined : new DatabaseSync(':memory:');
const freshPostgres = postgres && (await import('./pg-support.mjs')).freshPostgres;
const fixture = freshPostgres && await freshPostgres('cleanup');
const db = fixture ? fixture.database : new Persistence({ sqlite });
const envelope = work => postgres ? db.atomic({ purpose: 'test' }, work) : db.sqliteModeWrite(work);

try {
  await db.run('CREATE TABLE cleanup_probe (id INTEGER PRIMARY KEY)');
  const failures = [];
  for (const statement of ['ROLLBACK TO SAVEPOINT business_mutation', 'RELEASE SAVEPOINT business_mutation',
    'ROLLBACK TO SAVEPOINT legacy_0', 'RELEASE SAVEPOINT legacy_0']) {
    const refusal = Object.assign(new Error('Synthetic handled refusal'), { status: 409 });
    const cleanup = new Error('Synthetic savepoint cleanup failure');
    const effects = [];
    const run = db.run;
    db.run = async function(sql, ...args) {
      if (sql === statement) throw cleanup; // the actual connection stays usable
      return run.call(this, sql, ...args);
    };
    const legacy = statement.endsWith('legacy_0');
    let received;
    try {
      await envelope(async () => {
        await db.run('INSERT INTO cleanup_probe VALUES (1)');
        db.defer(() => effects.push('before'));
        const write = async () => {
          await db.run('INSERT INTO cleanup_probe VALUES (2)');
          db.defer(() => effects.push('inside'));
          throw refusal;
        };
        // Mirror a request envelope that catches a handled refusal before deciding whether to commit.
        try {
          if (legacy) {
            await db.exec('BEGIN');
            try { await write(); }
            catch (error) { await db.rollbackAfterError(error); }
          } else await db.savepoint(write);
        } catch (error) {
          assert.equal(error, refusal);
          await db.run('INSERT INTO cleanup_probe VALUES (3)');
        }
      });
    } catch (error) { received = error; }
    finally { db.run = run; }
    try {
      assert.deepEqual(await db.all('SELECT id FROM cleanup_probe'), []);
      assert.deepEqual(effects, []);
      assert.equal(received, refusal);
    } catch (error) {
      failures.push(new Error(statement, { cause: error }));
      await db.run('DELETE FROM cleanup_probe');
    }
  }
  if (sqlite) {
    const fault = new Error('Synthetic full rollback failure');
    const refusal = new Error('Synthetic work failure');
    const rawExec = sqlite.exec;
    sqlite.exec = function(sql) {
      if (sql === 'ROLLBACK') throw fault;
      return rawExec.call(this, sql);
    };
    try {
      await assert.rejects(db.scope(async () => {
        await db.exec('BEGIN');
        await db.run('INSERT INTO cleanup_probe VALUES (4)');
        throw refusal;
      }), error => error === refusal);
      await assert.rejects(db.one('SELECT id FROM cleanup_probe'), error => error.code === 'DB_TRANSACTION_ABORTED');
    } catch (error) {
      failures.push(new Error('SQLite full rollback failure', { cause: error }));
    } finally { sqlite.exec = rawExec; }
  } else {
    const fault = new Error('Synthetic full rollback failure');
    const refusal = new Error('Synthetic work failure');
    let discarded;
    const interceptRollback = client => {
      discarded = client;
      const query = client.query;
      client.query = function(sql, ...args) {
        if (sql === 'ROLLBACK') throw fault;
        return query.call(this, sql, ...args);
      };
    };
    db.pool.once('acquire', interceptRollback);
    try {
      await assert.rejects(db.scope(async () => {
        await db.exec('BEGIN');
        await db.run('INSERT INTO cleanup_probe VALUES (4)');
        throw refusal;
      }), error => error === refusal);
      const next = await db.pool.connect();
      try {
        assert.ok(discarded);
        assert.notEqual(next, discarded, 'a connection that failed rollback must leave the pool');
        assert.deepEqual((await next.query('SELECT id FROM cleanup_probe')).rows, []);
      } finally { next.release(); }
    } finally { db.pool.off('acquire', interceptRollback); }
  }
  if (failures.length) throw new AggregateError(failures, 'Transaction cleanup regressions');
  console.log(`${postgres ? 'PostgreSQL' : 'SQLite'} transaction cleanup preserves failures, rolls back writes and drops effects`);
} finally {
  if (fixture) await db.run(`DROP SCHEMA "${fixture.schema}" CASCADE`);
  await db.close();
  sqlite?.close();
}
