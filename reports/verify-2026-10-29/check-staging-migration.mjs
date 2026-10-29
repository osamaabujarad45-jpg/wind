// Proves the staging migration's post-commit version read works with the pool search_path.
// Uses the disposable loopback test cluster; the owner-run CLI itself refuses loopback/SSL-less URLs.
import assert from 'node:assert/strict';
import { Persistence } from '../../server/db/persistence.ts';
import { initializePostgres } from '../../server/db/postgres-schema.ts';

const database = new Persistence({
  connectionString: 'postgresql://fastship_test@127.0.0.1:55473/fastship_test',
  pool: { options: '-c search_path=wp16_staging,public' },
  statementTimeoutMs: 30_000,
  lockTimeoutMs: 30_000,
});
try {
  await initializePostgres(database, 'wp16_staging');
  const row = await database.one('SELECT MAX(version) AS version FROM schema_migrations');
  assert.equal(Number(row?.version), 21);
  console.log('staging migration: wp16_staging reached schema 21 and the post-commit read works');
} finally {
  await database.close();
}
