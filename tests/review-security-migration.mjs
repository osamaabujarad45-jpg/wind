import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, schemaName } from './pg-support.mjs';
import { initializePostgres, MIGRATION_LOCK } from '../server/db/postgres-schema.ts';
import { phoneSchemaAvailable } from '../server/domain/phone-identity.ts';
import { measuredCapability } from '../server/domain/eligibility.ts';

// Build an actual version-7 database, then use the ordinary forward runner.
const schema=schemaName('review_upgrade'),db=connect(schema);
try {
  await db.migrate(MIGRATION_LOCK,async()=>{
    await db.run(`CREATE SCHEMA ${schema}`);
    await db.run(`SET LOCAL search_path TO ${schema}, public`);
    await db.run('CREATE TABLE schema_migrations (version BIGINT PRIMARY KEY, applied_at BIGINT NOT NULL)');
    for(const [version,files] of [[3,['postgres-schema.sql','postgres-guards.sql']],[4,['postgres-events.sql']],
      [5,['postgres-eligibility.sql']],[6,['postgres-phone.sql']],[7,['postgres-eligibility-repairs.sql']]]) {
      for(const file of files)await db.run(readFileSync(new URL(`../server/db/${file}`,import.meta.url),'utf8'));
      await db.run('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)',version,Date.now());
    }
  });
  assert.equal(await phoneSchemaAvailable(db),false);assert.equal(await measuredCapability(db),false);
  const id=randomUUID(),old='synthetic-old-password-dependent-fast-hash';
  await db.run('INSERT INTO phone_command_results(scope_hash,command_id,payload_hash,http_status,response,created_at) VALUES(?,?::uuid,?,?,?::jsonb,?)',
    'synthetic-scope',id,old,200,JSON.stringify({ok:true}),Date.now());
  await initializePostgres(db,schema);
  const row=await db.one('SELECT payload_hash,password_fingerprint,http_status,response FROM phone_command_results WHERE command_id=?::uuid',id);
  assert.notEqual(row.payload_hash,old);assert.equal(row.password_fingerprint,null);assert.equal(row.http_status,200);assert.deepEqual(row.response,{ok:true});
  assert.equal(await phoneSchemaAvailable(db),true);assert.equal(await measuredCapability(db),true);
  await initializePostgres(db,schema);
  assert.equal((await db.one('SELECT payload_hash FROM phone_command_results WHERE command_id=?::uuid',id)).payload_hash,row.payload_hash,'re-running migrations preserves existing receipts');
  console.log('WP08 upgrade: real migration 7->8 scrubs old fast hashes, retains receipts, gates capabilities, and remains idempotent');
} finally {await db.close();}
