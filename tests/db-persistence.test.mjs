// Real SQLite and PostgreSQL transaction/connection tests. Retain isolated synthetic schemas for inspection.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Persistence, postgresSql } from '../server/db/persistence.ts';

const connectionString = process.env.WIND_TEST_DATABASE_URL ?? 'postgresql://fastship_test@127.0.0.1:55473/fastship_test';
const schema = `wp02_boundary_${randomUUID().replaceAll('-', '')}`;
const bootstrap = new Persistence({ connectionString });
await bootstrap.run(`CREATE SCHEMA ${schema}`);
await bootstrap.close();
const pgOptions = { connectionString, pool: { options: `-c search_path=${schema},public` } };
const gate = () => { let release; const promise = new Promise(done => { release = done; }); return { promise, release }; };
const pause = ms => new Promise(done => setTimeout(done, ms));
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
assert.equal(postgresSql("SELECT '?', \"?\", ? -- ?\n/* ? */ , ?"), "SELECT '?', \"?\", $1 -- ?\n/* ? */ , $2");
assert.equal(postgresSql('SELECT $$?$$, $body$?$body$, ?'), 'SELECT $$?$$, $body$?$body$, $1');

for (const backend of ['sqlite', 'postgres']) {
  const storage = new Persistence(backend === 'sqlite' ? { sqlite } : pgOptions);
  try {
    await storage.run('CREATE TABLE boundary (id INTEGER PRIMARY KEY, value INTEGER NOT NULL, command_id TEXT)');
    await storage.run("INSERT INTO boundary VALUES (1, 0, NULL), (2, 0, NULL)");
    const started = gate(), resume = gate();
    const effects = [];
    const failing = storage.scope(async () => {
      await storage.exec('BEGIN');
      await storage.run('UPDATE boundary SET value=10 WHERE id=1');
      storage.defer(() => { effects.push('rolled-back'); });
      started.release();
      await resume.promise;
      throw new Error('synthetic partial mutation failure');
    });
    const rejected = assert.rejects(failing, /synthetic partial/);
    await started.promise;
    if (backend === 'postgres') assert.equal((await storage.one('SELECT value FROM boundary WHERE id=1')).value, 0, 'another connection sees committed data only');
    const successful = storage.scope(async () => {
      await storage.exec('BEGIN');
      await storage.run('UPDATE boundary SET value=20 WHERE id=2');
      storage.defer(() => { effects.push('committed-sibling'); });
      await storage.exec('COMMIT');
    });
    resume.release();
    await Promise.all([rejected, successful]);
    assert.deepEqual(effects, ['committed-sibling']);
    assert.deepEqual((await storage.all('SELECT id,value FROM boundary ORDER BY id')).map(row => ({ ...row })), [{ id: 1, value: 0 }, { id: 2, value: 20 }]);

    // A deliberate error after a successful commit keeps its proof/audit write and its own push only.
    await assert.rejects(storage.scope(async () => {
      await storage.exec('BEGIN');
      await storage.run('UPDATE boundary SET value=30 WHERE id=1');
      storage.defer(() => { effects.push('proof-error-commit'); });
      await storage.exec('COMMIT');
      throw new Error('proof refused after audit commit');
    }), /proof refused/);
    assert.deepEqual(effects, ['committed-sibling', 'proof-error-commit']);
    assert.equal((await storage.one('SELECT value FROM boundary WHERE id=1')).value, 30);

    // An accidentally detached callback cannot use a closed owner or open a transaction on its behalf.
    let late;
    await storage.scope(async () => { late = () => storage.run('UPDATE boundary SET value=999 WHERE id=1'); });
    // AsyncLocalStorage callbacks need to be created through an async resource to inherit their owner.
    const lateGate = gate();
    let pending;
    await storage.scope(async () => { pending = lateGate.promise.then(() => storage.run('UPDATE boundary SET value=999 WHERE id=1')); });
    const lateRejected = assert.rejects(pending, /scope already closed/);
    lateGate.release(); await lateRejected;
    assert.equal(typeof late, 'function');
    await storage.detached(async () => assert.equal((await storage.one('SELECT value FROM boundary WHERE id=1')).value, 30));
    console.log(`${backend}: overlapping ownership, rollback, commit/error effects, detached scope passed`);
  } finally { await storage.close(); }
}
sqlite.close();

const pg = new Persistence({ ...pgOptions, poolSize: 4, statementTimeoutMs: 3000, lockTimeoutMs: 1500 });
try {
  assert.match((await pg.one('SELECT version() version')).version, /PostgreSQL 18/);
  const point = await pg.one('SELECT ST_SRID(p) srid, ST_X(p) longitude, ST_Y(p) latitude FROM (SELECT ST_SetSRID(ST_MakePoint(35.2,31.9),4326) p) location');
  assert.deepEqual(point, { srid: 4326, longitude: 35.2, latitude: 31.9 });

  // Both requests lock opposite rows, then collide: a real PostgreSQL deadlock retries only the opted-in unit.
  let arrivals = 0;
  const collide = gate(), commands = [], attempts = [0, 0];
  await Promise.all([0, 1].map(index => pg.transaction(async commandId => {
    attempts[index]++; commands.push(commandId);
    await pg.one("SELECT set_config('deadlock_timeout','50ms',true)");
    await pg.run('UPDATE boundary SET value=value+1 WHERE id=?', index + 1);
    if (attempts[index] === 1) { if (++arrivals === 2) collide.release(); await collide.promise; }
    await pg.run('UPDATE boundary SET value=value+1,command_id=? WHERE id=?', commandId, 2 - index);
  }, { commandId: `stable-command-${index}`, replaySafe: true })));
  assert.equal(attempts[0] + attempts[1], 3, 'exactly one deadlock victim retries');
  assert.ok(commands.every(value => /^stable-command-[01]$/.test(value)));
  assert.deepEqual((await pg.all('SELECT value FROM boundary ORDER BY id')).map(row => row.value), [32, 22]);

  let unsafeAttempts = 0;
  await assert.rejects(pg.transaction(async () => {
    unsafeAttempts++;
    await pg.run("DO $$ BEGIN RAISE EXCEPTION 'serialization failure' USING ERRCODE='40001'; END $$");
  }, { commandId: 'external-io-not-replay-safe' }), error => error.code === '40001');
  assert.equal(unsafeAttempts, 1);
  let boundedAttempts = 0;
  await assert.rejects(pg.transaction(async commandId => {
    boundedAttempts++;
    assert.equal(commandId, 'always-fails-stable-command');
    await pg.run("DO $$ BEGIN RAISE EXCEPTION 'serialization failure' USING ERRCODE='40001'; END $$");
  }, { commandId: 'always-fails-stable-command', replaySafe: true, maxAttempts: 999 }), error => error.code === '40001');
  assert.equal(boundedAttempts, 3, 'replay attempts remain bounded even when the requested limit exceeds policy');
  const abortedEffects = [];
  await assert.rejects(pg.transaction(async () => {
    await pg.run('UPDATE boundary SET value=777 WHERE id=1');
    pg.defer(() => { abortedEffects.push('must-not-publish'); });
    try { await pg.one('SELECT 1/0'); } catch { /* deliberately swallowed DB error */ }
  }, { commandId: 'aborted-commit' }), error => error.code === 'DB_TRANSACTION_ABORTED');
  assert.deepEqual(abortedEffects, [], 'COMMIT reporting ROLLBACK cannot publish notifications');
  assert.equal((await pg.one('SELECT value FROM boundary WHERE id=1')).value, 32);

  // Independently pooled migration runners cannot overlap the critical section.
  const replica = new Persistence(pgOptions), entered = gate(), finish = gate(), sequence = [];
  try {
    const first = pg.migrate(5702001, async () => { sequence.push('first-start'); entered.release(); await finish.promise; sequence.push('first-end'); });
    await entered.promise;
    const second = replica.migrate(5702001, async () => { sequence.push('second-start'); });
    await pause(80); assert.deepEqual(sequence, ['first-start']); finish.release();
    await Promise.all([first, second]);
    assert.deepEqual(sequence, ['first-start', 'first-end', 'second-start']);
  } finally { await replica.close(); }

  // Terminate the transaction's actual server connection. Its partial write is rolled back; pool recovers.
  await assert.rejects(pg.transaction(async () => {
    await pg.run('UPDATE boundary SET value=999 WHERE id=1');
    const { pid } = await pg.one('SELECT pg_backend_pid() pid');
    await pg.detached(async () => pg.one('SELECT pg_terminate_backend(?)', pid));
    await pg.run('UPDATE boundary SET value=1000 WHERE id=1');
  }, { commandId: 'lost-connection', replaySafe: true }), /terminat|Connection|closed|queryable|ECONNRESET/i);
  assert.equal((await pg.one('SELECT value FROM boundary WHERE id=1')).value, 32);
  console.log('postgres: actual deadlock/stable-command retry, replay opt-in, migration lock, connection loss/recovery, PostGIS4326 passed');
} finally { await pg.close(); }

// Connection setup is host-paced, not part of the bounds under test: pg-pool applies
// connectionTimeoutMillis to new connections too, so warm each pool first, retrying
// only the connect timeout, and let the timed sections measure queue/statement/lock waits.
const warm = async (db) => {
  for (let attempt = 1; ; attempt++) {
    try { await db.one('SELECT 1'); return; }
    catch (error) { if (attempt >= 30 || !/connection timeout/i.test(error.message)) throw error; }
  }
};
// Lock timeout well under statement timeout: with a 20 ms gap a loaded Windows runner (15.6 ms timer ticks) let
// the statement timeout win the lock check. The statement check sleeps past its own limit either way.
const bounded = new Persistence({ ...pgOptions, poolSize: 1, acquireTimeoutMs: 100, statementTimeoutMs: 1000, lockTimeoutMs: 60 });
try {
  await warm(bounded);
  const entered = gate(), finish = gate();
  const held = bounded.transaction(async () => { entered.release(); await finish.promise; }, { commandId: 'pool-holder' });
  await entered.promise;
  const start = Date.now();
  await assert.rejects(bounded.one('SELECT 1'), /timeout/i);
  assert.ok(Date.now() - start < 1000, 'pool acquisition must be bounded');
  finish.release(); await held;
  await assert.rejects(bounded.one('SELECT pg_sleep(3)'), error => error.code === '57014');
  const locker = new Persistence(pgOptions), locked = gate(), unlock = gate();
  try {
    await warm(locker);
    const lock = locker.transaction(async () => { await locker.run('UPDATE boundary SET value=value WHERE id=1'); locked.release(); await unlock.promise; }, { commandId: 'row-lock' });
    await locked.promise;
    // The statement-timeout error above makes pg-pool discard bounded's only client;
    // re-establish it so this check measures the lock wait, not reconnect speed.
    await warm(bounded);
    try {
      await assert.rejects(bounded.transaction(() => bounded.run('UPDATE boundary SET value=value+1 WHERE id=1'), { commandId: 'lock-timeout' }), error => error.code === '55P03');
    } finally { unlock.release(); }
    await lock;
  } finally { await locker.close(); }
  assert.equal((await bounded.one('SELECT value FROM boundary WHERE id=1')).value, 32);
  console.log('postgres: bounded pool acquisition, statement timeout, lock timeout and recovery passed');
} finally { await bounded.close(); }
console.log(`WP02 real database boundary checks passed; synthetic schema retained: ${schema}`);
