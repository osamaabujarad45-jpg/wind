import assert from 'node:assert/strict';
import { freshPostgres } from './pg-support.mjs';
import { NON_LEGACY_TABLES } from '../server/migrate.ts';

const { database: db } = await freshPostgres('dispatchmig');
try {
  assert.equal((await db.one('SELECT version FROM schema_migrations WHERE version=13'))?.version, 13, 'migration 13 is the WP10 dispatch migration');
  const tables = (await db.all("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('dispatch_rounds','dispatch_offers','assignment_history') ORDER BY table_name")).map(r => r.table_name);
  assert.deepEqual(tables, ['assignment_history', 'dispatch_offers', 'dispatch_rounds']);
  const indexes = (await db.all("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename IN ('dispatch_rounds','dispatch_offers')")).map(r => `${r.indexname}:${r.indexdef}`);
  assert.ok(indexes.some(i => i.startsWith('dispatch_rounds_one_open:') && i.includes("state = 'open'")), 'one open round per order');
  assert.ok(indexes.some(i => i.startsWith('dispatch_offers_one_open_round:') && i.includes("state = 'open'")), 'one open offer per round');
  assert.ok(indexes.some(i => i.startsWith('dispatch_offers_one_open_driver:') && i.includes("state = 'open'")), 'one open offer per driver');
  const offerColumns = (await db.all("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='dispatch_offers'")).map(r => r.column_name);
  for (const column of ['nonce_hash', 'order_revision', 'assignment_epoch', 'presence_session_id', 'vehicle_id', 'driver_revision', 'vehicle_revision', 'policy_revision', 'requirements_revision', 'pickup_eta_seconds', 'idle_seconds', 'idle_credit_seconds', 'rank_score', 'eta_estimated', 'expires_at'])
    assert.ok(offerColumns.includes(column), `dispatch_offers.${column} persisted for audit`);
  assert.ok(!offerColumns.includes('nonce') && !offerColumns.includes('lease_nonce'), 'the raw lease nonce is never a column');
  for (const table of ['dispatch_rounds', 'dispatch_offers', 'assignment_history']) assert.ok(NON_LEGACY_TABLES.has(table), `${table} is PG-only in legacy import`);
  assert.ok(await db.one("SELECT 1 FROM pg_trigger WHERE tgname='assignment_history_append_only' AND NOT tgisinternal"), 'assignment_history is append-only');
  console.log('WP10 dispatch-migration: version 13, tables, partial unique indexes, nonce-hash-only and import allowlist passed');
} finally { await db.close(); }
