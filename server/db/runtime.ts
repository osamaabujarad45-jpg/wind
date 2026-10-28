import type { DatabaseSync } from 'node:sqlite';
import { Persistence } from './persistence.ts';

/** PostgreSQL is an isolated test target until WP03 schema/import acceptance. Never auto-fail over writes. */
export function runtimePersistence(sqlite?: DatabaseSync) {
  const connectionString = process.env.WIND_DATABASE_URL;
  if (!connectionString) {
    if (process.env.WIND_POSTGRES_STAGING === '1') throw new Error('WP16 staging requires WIND_DATABASE_URL');
    return new Persistence({ sqlite });
  }
  if (process.env.WIND_POSTGRES_STAGING === '1') {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !host || host === 'localhost' || host.endsWith('.localhost') || host.startsWith('127.') || host === '::1' || host === '0:0:0:0:0:0:0:1' || host.startsWith('::ffff:7f') || host.startsWith('::ffff:127.'))
      throw new Error('WP16 staging requires a non-loopback PostgreSQL URL');
    if ([...url.searchParams.keys()].some(key => key !== 'sslmode') || url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.get('sslmode') !== 'verify-full')
      throw new Error('WP16 staging requires sslmode=verify-full with no other URL options');
    return new Persistence({ connectionString, pool: { options: '-c search_path=wp16_staging,public', ssl: { rejectUnauthorized: true } } });
  }
  if (process.env.NODE_ENV !== 'test' || process.env.WIND_POSTGRES_TEST_ONLY !== '1')
    throw new Error('PostgreSQL API cutover is gated on WP03 schema/import parity; isolated tests require NODE_ENV=test and WIND_POSTGRES_TEST_ONLY=1');
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('WP02 PostgreSQL API tests require loopback');
  const schema = process.env.WIND_POSTGRES_TEST_SCHEMA;
  if (!schema || !/^wp0[0-9]_[a-z0-9_]{1,48}$/.test(schema)) throw new Error('Invalid isolated PostgreSQL test schema');
  return new Persistence({ connectionString, pool: schema ? { options: `-c search_path=${schema},public` } : undefined });
}
