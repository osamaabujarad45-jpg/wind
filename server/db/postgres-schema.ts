import { readFileSync } from 'node:fs';
import type { Persistence } from './persistence.ts';

export const MIGRATION_LOCK = 5703001;
export const isolatedSchema = (schema: string) => {
  if (!/^(?:wp0[0-9]_[a-z0-9_]{1,48}|wp16_staging)$/.test(schema)) throw new Error('WP03/04 requires a named isolated test schema');
  return schema;
};

/** Explicit runner only; API startup never creates/upgrades a PostgreSQL schema. */
export async function initializePostgres(database: Persistence, schema: string) {
  isolatedSchema(schema);
  if (database.backend !== 'postgres') throw new Error('PostgreSQL migration requires PostgreSQL');
  await database.migrate(MIGRATION_LOCK, async () => {
    await database.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await database.run('CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public');
    await database.run(`SET LOCAL search_path TO ${schema}, public`);
    await database.run('CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT PRIMARY KEY, applied_at BIGINT NOT NULL)');
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 3'))) {
      await database.run(readFileSync(new URL('./postgres-schema.sql', import.meta.url), 'utf8'));
      await database.run(readFileSync(new URL('./postgres-guards.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(3,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 4'))) {
      await database.run(readFileSync(new URL('./postgres-events.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(4,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 5'))) {
      await database.run(readFileSync(new URL('./postgres-eligibility.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(5,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 6'))) {
      await database.run(readFileSync(new URL('./postgres-phone.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(6,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 7'))) {
      await database.run(readFileSync(new URL('./postgres-eligibility-repairs.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(7,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 8'))) {
      await database.run(readFileSync(new URL('./postgres-review-security.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(8,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 9'))) {
      await database.run(readFileSync(new URL('./postgres-presence.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(9,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 10'))) {
      await database.run(readFileSync(new URL('./postgres-active-gps.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(10,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 11'))) {
      await database.run(readFileSync(new URL('./postgres-quotes.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(11,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 12'))) {
      await database.run(readFileSync(new URL('./postgres-native-push.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(12,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 13'))) {
      await database.run(readFileSync(new URL('./postgres-dispatch.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(13,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 14'))) {
      await database.run(readFileSync(new URL('./postgres-ride-lifecycle.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(14,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 15'))) {
      await database.run(readFileSync(new URL('./postgres-resource-scope.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(15,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 16'))) {
      await database.run(readFileSync(new URL('./postgres-ledger.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(16,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 17'))) {
      await database.run(readFileSync(new URL('./postgres-payments.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(17,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 18'))) {
      await database.run(readFileSync(new URL('./postgres-ops.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(18,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 19'))) {
      await database.run(readFileSync(new URL('./postgres-entra.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(19,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 20'))) {
      await database.run(readFileSync(new URL('./postgres-sessions.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(20,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 21'))) {
      await database.run(readFileSync(new URL('./postgres-audit.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(21,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 22'))) {
      await database.run(readFileSync(new URL('./postgres-subscriptions.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(22,?)', Date.now());
    }
    if (!(await database.one('SELECT version FROM schema_migrations WHERE version = 23'))) {
      await database.run(readFileSync(new URL('./postgres-ops-repairs.sql', import.meta.url), 'utf8'));
      await database.run('INSERT INTO schema_migrations(version,applied_at) VALUES(23,?)', Date.now());
    }
  });
}

