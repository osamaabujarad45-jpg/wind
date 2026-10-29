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
export function selectRuntime(schema) {
  Object.assign(process.env, { NODE_ENV:'test', WIND_DATABASE_URL:connectionString, WIND_POSTGRES_TEST_ONLY:'1', WIND_POSTGRES_TEST_SCHEMA:schema });
}
