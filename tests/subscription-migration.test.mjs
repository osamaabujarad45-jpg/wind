// T22: one pending subscription per user and plan. A legacy database that opens with duplicate pending
// rows collapses them to the newest while paid history stays untouched, and the fresh PostgreSQL schema
// carries the same unique constraint. Each stage runs in its own process because the schema module
// migrates once per process at import.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-submigration-'));
const legacy = join(dir, 'legacy.db');
const node = (script, env = {}) => spawnSync(process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', '--input-type=module', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '-e', script],
  { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 90_000 });
try {
  // Stage 1: a current-schema database, regressed to a pre-constraint state with duplicate pendings.
  const build = node(`
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(legacy)});
    const { initializeSqlite } = await import(${JSON.stringify(new URL('../server/db/sqlite-schema.ts', import.meta.url).href)});
    initializeSqlite(db);
    db.exec('DROP INDEX subscriptions_pending');
    const now = Date.now();
    db.prepare("INSERT INTO users (phone, name, password, role, status, created_at) VALUES ('0599600011','Dup','x','customer','active',?),('0599600012','Paid','x','driver','active',?)").run(now, now);
    const ids = db.prepare("INSERT INTO subscriptions (user_id, plan, status, price, created_at) VALUES (1,'plus','pending',10,?),(1,'plus','pending',10,?),(1,'plus','active',10,?) RETURNING id").all(now, now - 1000, now - 2000).map(r => r.id);
    db.prepare("UPDATE subscriptions SET activated_at=?, ends_at=? WHERE id=?").run(now - 2000, now + 30 * 86400000, ids[2]);
    db.prepare("INSERT INTO subscriptions (user_id, plan, status, price, created_at) VALUES (2,'pro','pending',10,?)").run(now);
    db.close();
    console.log('built');`);
  assert.equal(build.status, 0, `legacy build failed: ${build.stderr}`);

  // Stage 2: reopening the same database runs the additive migration: the older duplicate pending is
  // rejected, the newest survives, the paid active row is untouched, and the index is back in place.
  const verify = node(`
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(legacy)});
    const { initializeSqlite } = await import(${JSON.stringify(new URL('../server/db/sqlite-schema.ts', import.meta.url).href)});
    initializeSqlite(db);
    const rows = db.prepare('SELECT id, user_id, plan, status FROM subscriptions ORDER BY id').all();
    const pendings = rows.filter(r => r.status === 'pending');
    console.log(JSON.stringify({ rows: rows.map(r => [r.id, r.user_id, r.status]), pendings: pendings.length,
      newestSurvives: pendings.some(r => r.id === rows[1].id),
      activeIntact: rows[2].status === 'active',
      index: db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='subscriptions_pending'").get() !== undefined }));
    db.close();`);
  assert.equal(verify.status, 0, `verify failed: ${verify.stderr}`);
  const state = JSON.parse(verify.stdout.trim().split('\n').at(-1));
  assert.equal(state.pendings, 2, `one pending per user: ${JSON.stringify(state)}`);
  assert.equal(state.newestSurvives, true, 'the newest pending survives the collapse');
  assert.equal(state.activeIntact, true, 'paid history is preserved');
  assert.equal(state.index, true, 'the unique pending index is rebuilt');

  // PostgreSQL: the same constraint ships with the schema; a duplicate pending insert is refused.
  const { freshPostgres } = await import('./pg-support.mjs');
  const { database } = await freshPostgres('subscriptions');
  try {
    const now = Date.now();
    await database.run(`INSERT INTO users(phone,name,password,role,status,created_at,phone_verified_at)
      VALUES('0599600021','Pg customer','','customer','active',?,?)`, now, now);
    await database.run("INSERT INTO subscriptions (user_id, plan, status, price, created_at) VALUES (1,'plus','pending',10,?)", now);
    await assert.rejects(
      () => database.run("INSERT INTO subscriptions (user_id, plan, status, price, created_at) VALUES (1,'plus','pending',10,?)", now + 1),
      /subscriptions_pending/, 'the second pending for the same user and plan is refused');
  } finally { await database.close(); }

  console.log('Subscription migration: legacy duplicates collapse to the newest with paid history intact, and PostgreSQL enforces one pending row');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
