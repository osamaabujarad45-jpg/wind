// Owner-run migration for the only non-loopback PostgreSQL gate the runtime accepts.
// Never called by CI, the API or the worker: enabling workloads with an empty/old schema
// would make every query fail. Creates wp16_staging and applies migrations 3..30 under
// the same advisory lock as the tests.
import { Persistence } from '../server/db/persistence.ts';
import { initializePostgres } from '../server/db/postgres-schema.ts';

if (process.env.WIND_POSTGRES_STAGING !== '1') throw new Error('Set WIND_POSTGRES_STAGING=1 for the staging cutover');
if (!process.argv.includes('--confirm')) throw new Error('Refusing to migrate without --confirm');
const value = process.env.WIND_DATABASE_URL?.trim();
if (!value) throw new Error('WIND_DATABASE_URL is required');
const url = new URL(value);
const host = url.hostname.toLowerCase().replace(/\.$/, '');
const loopback = !host || host === 'localhost' || host.endsWith('.localhost') || host.startsWith('127.')
  || host === '::1' || host === '0:0:0:0:0:0:0:1' || host.startsWith('::ffff:7f') || host.startsWith('::ffff:127.');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || loopback) throw new Error('Staging migration requires a non-loopback PostgreSQL URL');
if ([...url.searchParams.keys()].some(key => key !== 'sslmode') || url.searchParams.getAll('sslmode').length !== 1
  || url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Staging migration requires sslmode=verify-full with no other URL options');

const database = new Persistence({
  connectionString: url.href,
  // initializePostgres sets search_path only inside its migration transaction; the final
  // version read below runs after COMMIT, so the pool must carry the schema too.
  pool: { options: '-c search_path=wp16_staging,public', ssl: { rejectUnauthorized: true } },
  statementTimeoutMs: 30_000,
  lockTimeoutMs: 30_000,
});
try {
  await initializePostgres(database, 'wp16_staging');
  const row = await database.one('SELECT MAX(version) AS version FROM schema_migrations');
  console.log(`wp16_staging migrated; schema version ${row?.version ?? 0}; runtimeActivated=false`);
} finally {
  await database.close();
}
