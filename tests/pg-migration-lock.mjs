// The actual rehearsal CLI should wait for another isolated migration, not fail after 500 ms.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initializeSqlite } from '../server/db/sqlite-schema.ts';
import { MIGRATION_LOCK } from '../server/db/postgres-schema.ts';
import { connect, connectionString, schemaName } from './pg-support.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-migration-lock-'));
const source = join(dir, 'source.db'), snapshot = join(dir, 'snapshot.db'), report = join(dir, 'report.json');
const sqlite = new DatabaseSync(source);
initializeSqlite(sqlite);
sqlite.close();
const blocker = connect(schemaName('blocker'));
let release, entered, child;
const acquired = new Promise(resolveAcquired => { entered = resolveAcquired; });
const hold = blocker.migrate(MIGRATION_LOCK, async () => {
  entered();
  await new Promise(resolveRelease => { release = resolveRelease; });
});
try {
  await Promise.race([acquired, hold]);
  const schema = schemaName('cli_lock');
  const appName = `wind_cli_lock_${Date.now()}`;
  const url = new URL(connectionString);
  url.searchParams.set('application_name', appName);
  child = spawn(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning',
    resolve('server/migrate.ts'), source, snapshot, schema, report], {
    cwd: resolve('.'), env: { ...process.env, NODE_ENV: 'test', WIND_DATABASE_URL: url.href }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '', exited = false;
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const done = new Promise((resolveDone, reject) => {
    child.once('error', reject);
    child.once('close', code => { exited = true; resolveDone(code); });
  });
  const deadline = Date.now() + 15_000;
  let waiting = false;
  while (!waiting && !exited && Date.now() < deadline) {
    const row = await blocker.one(`SELECT COUNT(*) AS count FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
      WHERE a.application_name=? AND l.locktype='advisory' AND NOT l.granted`, appName);
    waiting = Number(row.count) > 0;
    if (!waiting) await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
  }
  assert.ok(waiting, `CLI did not reach the held migration lock: ${output}`);
  await new Promise(resolveDelay => setTimeout(resolveDelay, 800));
  release();
  await hold;
  const status = await done;
  assert.equal(status, 0, `CLI should wait for the migration lock: ${output}`);
  assert.equal(JSON.parse(readFileSync(report, 'utf8')).ok, true);
  console.log('PostgreSQL migration rehearsal CLI waits through a concurrent 800 ms advisory lock');
} finally {
  release?.();
  await hold.catch(() => {});
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
  await blocker.close();
}
