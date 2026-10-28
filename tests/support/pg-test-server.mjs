// PostgreSQL fixture for executing existing HTTP assertions, without emulating SQLite internals.
import { randomUUID } from 'node:crypto';
import { Persistence } from '../../server/db/persistence.ts';
import { initializePostgres } from '../../server/db/postgres-schema.ts';
import { DurableWorker } from '../../server/worker.ts';

let opened;
export async function openLegacyPgServer() {
  if (opened) return opened;
  opened = open();
  return opened;
}
async function open() {
  const connectionString = process.env.WIND_TEST_DATABASE_URL ?? 'postgresql://fastship_test@127.0.0.1:55473/fastship_test';
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/fastship_test')
    throw new Error('Legacy parity requires the dedicated loopback fastship_test database');
  const schema = `wp03_legacy_${randomUUID().replaceAll('-', '')}`;
  const fixture = new Persistence({ connectionString, pool: { options: `-c search_path=${schema},public` } });
  await initializePostgres(fixture, schema);
  Object.assign(process.env, { NODE_ENV: 'test', WIND_DATABASE_URL: connectionString,
    WIND_POSTGRES_TEST_ONLY: '1', WIND_POSTGRES_TEST_SCHEMA: schema });
  const main = await import('../../server/main.ts');
  const worker = new DurableWorker(fixture);
  const drainOutbox = async () => {
    // Use the actual encryption/transport path and the fixture's fetch double. No timer races.
    for (let count = 0; count < 10_000; count++) {
      if (!(await worker.runOnce())) {
        const failed = await fixture.one("SELECT COUNT(*) AS count FROM outbox WHERE status IN ('pending','processing','review')");
        if (failed.count) throw new Error(`Legacy push fixture left ${failed.count} undelivered outbox rows`);
        return;
      }
    }
    throw new Error('Legacy push fixture exceeded bounded outbox drain');
  };
  let closed = false;
  const shutdown = async () => {
    if (closed) return;
    closed = true;
    try { await main.shutdown(); } finally { await fixture.close(); }
  };
  const prepare = sql => {
    if (/\b(?:PRAGMA|sqlite_schema|sqlite_master)\b/i.test(sql)) throw new Error('SQLite-specific inspection requires separate PostgreSQL evidence');
    return { get: (...params) => fixture.one(sql, ...params), all: (...params) => fixture.all(sql, ...params),
      run: (...params) => fixture.run(sql, ...params) };
  };
  const db = { prepare, exec: sql => {
    if (/\b(?:PRAGMA|RAISE\s*\(|BEGIN IMMEDIATE)\b/i.test(sql)) throw new Error('SQLite-specific fixture SQL requires an explicit PostgreSQL adaptation');
    return fixture.run(sql);
  }, close: shutdown };
  console.log(`Legacy HTTP parity uses real PostgreSQL schema ${schema}`);
  return { ...main, db, shutdown, drainOutbox, fixtureSchema: schema };
}
