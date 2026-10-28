import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, schemaName } from './pg-support.mjs';
import { initializePostgres, MIGRATION_LOCK } from '../server/db/postgres-schema.ts';

// A real v8 upgrade, not a fresh-schema-only test. All data is synthetic.
const schema = schemaName('presence'), db = connect(schema);
try {
  await db.migrate(MIGRATION_LOCK, async () => {
    await db.run(`CREATE SCHEMA ${schema}`);
    await db.run(`SET LOCAL search_path TO ${schema}, public`);
    await db.run('CREATE TABLE schema_migrations(version BIGINT PRIMARY KEY, applied_at BIGINT NOT NULL)');
    for (const [version, files] of [[3,['postgres-schema.sql','postgres-guards.sql']], [4,['postgres-events.sql']],
      [5,['postgres-eligibility.sql']], [6,['postgres-phone.sql']], [7,['postgres-eligibility-repairs.sql']], [8,['postgres-review-security.sql']]]) {
      for (const file of files) await db.run(readFileSync(new URL(`../server/db/${file}`, import.meta.url), 'utf8'));
      await db.run('INSERT INTO schema_migrations VALUES(?,?)', version, Date.now());
    }
  });
  await initializePostgres(db, schema);
  await initializePostgres(db, schema);
  assert.equal((await db.one('SELECT COUNT(*) n FROM schema_migrations WHERE version=9')).n, 1);
  for (const table of ['driver_presence_sessions','driver_latest_locations','driver_presence_audit'])
    assert.equal((await db.one(`SELECT COUNT(*) n FROM ${table}`)).n, 0, 'migration must not seed private presence');
  for (const id of [1,2]) {
    await db.run('INSERT INTO users(id,phone,name,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?,?)', id, `synthetic${id}`, 'Synthetic', 'test', 'driver', 'active', 'car', 1);
    await db.run('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)', `token${id}`, id, 1);
  }
  await db.run(`INSERT INTO vehicles(id,plate,class,state,seats,usable_grams,usable_cm3,length_mm,width_mm,height_mm,max_pieces,equipment,valid_until,reviewer_id,evidence_ref,reason,updated_at)
    VALUES(1,'synthetic','car','approved',4,1,1,1,1,1,1,'[]'::jsonb,999999,1,'synthetic','synthetic',1)`);
  const id = randomUUID();
  const insert = (sid, driver, token) => db.run(`INSERT INTO driver_presence_sessions(id,driver_id,auth_session_hash,device_hash,vehicle_id,driver_revision,vehicle_revision,policy_revision,consent_version,consented_at,started_at,heartbeat_at,lease_until,state)
    VALUES(?::uuid,?,?,?,1,1,1,1,1,1,1,1,60001,'online')`, sid, driver, token, 'synthetic-device');
  await assert.rejects(insert(randomUUID(), 1, 'token2'), /foreign key/i, 'auth session must belong to the driver');
  await insert(id, 1, 'token1');
  const fix = (driver, sid) => db.run(`INSERT INTO driver_latest_locations(driver_id,session_id,lat,lng,effective_at,received_at,seq,good_lat,good_lng,good_at,good_accuracy)
    VALUES(?,?::uuid,31,35,1,1,1,31,35,1,10)`, driver, sid);
  await assert.rejects(fix(2,id), /foreign key/i, 'fix owner must match presence owner');
  await fix(1,id);
  await db.run('DELETE FROM sessions WHERE token_hash=?', 'token1');
  assert.equal((await db.one('SELECT COUNT(*) n FROM driver_presence_sessions')).n,0);
  assert.equal((await db.one('SELECT COUNT(*) n FROM driver_latest_locations')).n,0, 'revocation removes latest fix');
  await insert(randomUUID(),2,'token2');
  await db.run("UPDATE users SET status='blocked' WHERE id=2");
  assert.equal((await db.one('SELECT COUNT(*) n FROM driver_presence_sessions')).n,0, 'suspension removes presence');
  console.log('WP07 migration: v8 upgrade, idempotence, empty defaults, owner binding and revocation cascades passed');
} finally { await db.close(); }
