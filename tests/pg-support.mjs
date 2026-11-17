import { randomUUID } from 'node:crypto';
import { Persistence } from '../server/db/persistence.ts';
import { initializePostgres } from '../server/db/postgres-schema.ts';
export const connectionString = process.env.WIND_TEST_DATABASE_URL ?? 'postgresql://fastship_test@127.0.0.1:55473/fastship_test';
if (!['127.0.0.1','localhost','[::1]'].includes(new URL(connectionString).hostname)) throw new Error('PG tests require loopback');
export const schemaName = (label = 'test') => `wp03_${label}_${randomUUID().replaceAll('-','')}`;
// Concurrent isolated suites share the migration advisory lock. Allow a migration to finish
// without changing the shorter lock timeout used by application requests.
export const connect = schema => new Persistence({ connectionString, pool: { options: `-c search_path=${schema},public` }, statementTimeoutMs: 30_000, lockTimeoutMs: 30_000 });
export async function freshPostgres(label = 'test') {
  const schema = schemaName(label);
  const database = connect(schema);
  try {
    await initializePostgres(database, schema);
    return { schema, database };
  } catch (error) {
    await database.close();
    throw error;
  }
}
// Every suite leaves its synthetic schema for inspection. Unbounded, they slow every catalog-wide tool: at 2,195 schemas
// pg_dump spent over 120 s scanning 8.5M pg_depend rows. The persistence runner keeps the newest `keep` and drops the rest.
export async function pruneSyntheticSchemas(keep = 100) {
  // DROP ... CASCADE walks the whole catalog, so a bloated one needs longer than a request's statement timeout.
  const db = new Persistence({ connectionString, statementTimeoutMs: 300_000, lockTimeoutMs: 300_000 });
  try {
    const stale = (await db.all(`SELECT nspname FROM pg_namespace WHERE nspname ~ '^wp[0-9]{2}_[a-z0-9_]+_[0-9a-f]{32}$'
      ORDER BY oid DESC OFFSET ?`, keep)).map(row => row.nspname);
    const workers = Array.from({ length: 4 }, async (_, worker) => {
      for (let i = worker; i < stale.length; i += 4) await db.run(`DROP SCHEMA "${stale[i]}" CASCADE`);
    });
    await Promise.all(workers);
    return stale.length;
  } finally { await db.close(); }
}
export function selectRuntime(schema) {
  Object.assign(process.env, { NODE_ENV:'test', WIND_DATABASE_URL:connectionString, WIND_POSTGRES_TEST_ONLY:'1', WIND_POSTGRES_TEST_SCHEMA:schema });
}
