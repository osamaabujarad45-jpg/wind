// A database exception may contain a whole private row; the HTTP boundary must log safe metadata only.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, freshPostgres, connectionString, schemaName } from './pg-support.mjs';
import { startApiProcess } from './support/api-process.mjs';
import { MIGRATION_LOCK } from '../server/db/postgres-schema.ts';

// Independently named fixture schemas still serialize extension/schema migrations on one advisory lock.
// Another local suite may hold that lock longer than the normal production request lock timeout.
const blocker = connect(schemaName('lock'));
let acquired;
const locked = new Promise(resolve => { acquired = resolve; });
const holding = blocker.migrate(MIGRATION_LOCK, async () => {
  acquired();
  await new Promise(resolve => setTimeout(resolve, 800));
});
try {
  await Promise.race([locked, holding]);
  const waitingFixture = await freshPostgres('wait');
  await waitingFixture.database.close();
  await holding;
} finally { await holding.catch(() => {}); await blocker.close(); }

const { schema, database } = await freshPostgres('log');
const token = randomBytes(32).toString('hex');
const marker = `private-${randomUUID()}`;
const phone = '0599890012';
let api;
try {
  const actor = await database.run(`INSERT INTO users(phone,name,password,role,status,created_at,phone_verified_at)
    VALUES(?,'Synthetic log customer','','customer','active',?,?)`, phone, Date.now(), Date.now());
  await database.run('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)',
    createHash('sha256').update(token).digest('hex'), actor.lastInsertRowid, Date.now());
  // Values are synthetic and confined to this test schema. Never expose them through error diagnostics.
  await database.run(`CREATE FUNCTION private_fixture_error() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${marker}' USING DETAIL='phone=${phone}; handover=3841; password_hash=private-hash'; END $$;
    CREATE TRIGGER private_fixture_error BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION private_fixture_error();`);
  api = await startApiProcess({ DB_PATH: join(mkdtempSync(join(tmpdir(), 'wind-log-boundary-')), 'unused.db'),
    WIND_DATABASE_URL: connectionString, WIND_POSTGRES_TEST_ONLY: '1', WIND_POSTGRES_TEST_SCHEMA: schema });
  const response = await fetch(`${api.base}/me`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'Synthetic changed name' }) });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'server_error' });
  await new Promise(resolve => setTimeout(resolve, 30));
  const diagnostics = api.diagnostics();
  assert.ok(diagnostics.includes('P0001'), 'the internal failure retains a useful safe SQLSTATE');
  for (const privateValue of [marker, phone, 'handover=3841', 'private-hash', token])
    assert.ok(!diagnostics.includes(privateValue), 'database diagnostics must not disclose private row/message values');
  console.log('Database error logging retains SQLSTATE and excludes message, detail, phone, PIN, password hash and bearer token');
} finally { await api?.stop(); await database.close(); }
