import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initializeSqlite } from '../server/db/sqlite-schema.ts';
import { snapshotSqlite, importSnapshot, reconcile, NON_LEGACY_TABLES } from '../server/migrate.ts';
import { Persistence } from '../server/db/persistence.ts';
import { initializePostgres, MIGRATION_LOCK } from '../server/db/postgres-schema.ts';
import { connectionString, connect, freshPostgres, schemaName } from './pg-support.mjs';
import { startApiProcess } from './support/api-process.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-wp03-import-'));
const walPath=join(dir,'wal-source.sqlite');
const wal=new DatabaseSync(walPath);initializeSqlite(wal);
wal.prepare("INSERT INTO users(phone,name,password,role,status,created_at) VALUES('0599000001','Committed','synthetic','customer','active',1)").run();
wal.exec('BEGIN IMMEDIATE');
wal.prepare("INSERT INTO users(phone,name,password,role,status,created_at) VALUES('0599000002','Uncommitted','synthetic','customer','active',2)").run();
const online=await snapshotSqlite(walPath,join(dir,'online.sqlite'));
assert.equal(online.rows.users.length,1,'WAL snapshot excludes an uncommitted concurrent writer');
wal.exec('COMMIT');wal.close();
const frozen=await snapshotSqlite(walPath,join(dir,'frozen.sqlite'),true);
assert.equal(frozen.rows.users.length,2,'write-freeze snapshot includes the completed WAL commit');
const source = join(dir, 'legacy.sqlite');
execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--disable-warning=ExperimentalWarning','tests/pg-contracts.mjs'],
  { cwd: resolve(import.meta.dirname, '..'), env: { ...process.env, WP03_SNAPSHOT_FILE: source }, stdio:'pipe', timeout:30_000 });
const sqlite = new DatabaseSync(source);
sqlite.exec('PRAGMA foreign_keys=ON');
const user = sqlite.prepare("SELECT id FROM users WHERE role='customer' ORDER BY id LIMIT 1").get().id;
const admin = sqlite.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get().id;
const driver = sqlite.prepare("SELECT id FROM users WHERE role='driver' ORDER BY id LIMIT 1").get().id;
const order = sqlite.prepare('SELECT id FROM orders ORDER BY id LIMIT 1').get().id;
const now = Date.now();
const token = randomBytes(32).toString('hex');
sqlite.prepare('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), driver, now);
// Replay entries must survive a cutover too; otherwise an already exchanged ID token could be reused.
sqlite.prepare('INSERT INTO entra_replay(token_hash,expires_at) VALUES(?,?)').run(createHash('sha256').update('synthetic-entra-replay').digest('hex'), now + 300_000);
// Synthetic Arabic, timezone and REAL rounding data. Existing installed tariff/settings stay unchanged.
sqlite.prepare("UPDATE users SET name=?,status='active',approved_at=? WHERE id=?").run('سائق تجريبي — القدس', now, driver);
sqlite.prepare("INSERT INTO subscriptions(user_id,plan,status,price,activated_at,ends_at,created_at) VALUES(?,'pro','active',10,?,?,?)").run(driver, now, Date.parse('2026-10-30T23:30:00+02:00'), now);
sqlite.prepare("INSERT INTO email_codes(user_id,purpose,code_hash,sent_at,expires_at) VALUES(?,'support',?,?,?)").run(user,'synthetic-hash',now,now+300000);
sqlite.prepare("INSERT INTO driver_locations(driver_id,lat,lng,updated_at) VALUES(?,31.9038,35.2034,?) ON CONFLICT(driver_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,updated_at=excluded.updated_at").run(driver,now);
sqlite.prepare("INSERT INTO checkpoints(name,cities,created_by,created_at,lat,lng) VALUES('حاجز تجريبي','[\"ramallah\"]',?,?,31.9,35.2)").run(admin,now);
const checkpoint=sqlite.prepare('SELECT max(id) id FROM checkpoints').get().id;
sqlite.prepare("INSERT INTO checkpoint_reports(checkpoint_id,reporter_id,status,note,created_at) VALUES(?,?,'slow','تجربة',?)").run(checkpoint,driver,now);
sqlite.prepare("INSERT INTO saved_places(user_id,label,city,note,created_at) VALUES(?,'other','ramallah','العنوان التجريبي',?)").run(user,now);
sqlite.prepare("INSERT INTO promo_codes(code,amount,max_uses,expires_at,created_by,created_at) VALUES('WP03X',1,10,?,?,?)").run(now+86400000,admin,now);
const promo=sqlite.prepare("SELECT id FROM promo_codes WHERE code='WP03X'").get().id;
sqlite.prepare('INSERT INTO promo_owners(promo_id,user_id) VALUES(?,?)').run(promo,user);
sqlite.prepare('INSERT INTO promo_redemptions(promo_id,customer_id,order_id,created_at) VALUES(?,?,?,?)').run(promo,user,order,now);
const secondOrder=sqlite.prepare('SELECT id FROM orders WHERE id<>? ORDER BY id LIMIT 1').get(order).id;
sqlite.prepare('INSERT INTO promo_redemptions(promo_id,customer_id,order_id,created_at) VALUES(?,?,?,?)').run(promo,user,secondOrder,now);
sqlite.prepare("INSERT INTO order_messages(order_id,sender_id,driver_id,sender_role,body,created_at) VALUES(?,?,?,'customer','رسالة تجريبية محفوظة',?)").run(order,user,driver,now);
sqlite.prepare('INSERT OR IGNORE INTO referral_codes(user_id,code) VALUES(?,?)').run(user,'WTEST3');
sqlite.prepare('INSERT OR IGNORE INTO referrals(referee_id,referrer_id,order_id,reward_promo_id,created_at) VALUES(?,?,?,?,?)').run(driver,user,order,promo,now);
sqlite.prepare("INSERT INTO push_keys(id,private_jwk) VALUES(1,'{\"synthetic\":true}') ON CONFLICT(id) DO NOTHING").run();
sqlite.prepare("INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created_at) VALUES('https://push.invalid/wp03',?,'synthetic','synthetic',?)").run(user,now);
sqlite.prepare('INSERT OR IGNORE INTO order_offers(order_id,driver_id,price,created_at) VALUES(?,?,20,?)').run(order,driver,now);
// Ensure a non-cent REAL exception is retained/reported rather than silently overwritten.
sqlite.prepare('UPDATE orders SET price=20.005,commission=1.005 WHERE id=?').run(order);
const nullableCommission=sqlite.prepare("SELECT id FROM orders WHERE status IN ('completed','returned') AND id<>? ORDER BY id LIMIT 1").get(order).id;
sqlite.prepare('UPDATE orders SET commission=NULL,discount=1 WHERE id=?').run(nullableCommission);
sqlite.close();
const snapshot = await snapshotSqlite(source,join(dir,'snapshot.sqlite'),true);
const {schema,database}=await freshPostgres('import');
let restored, sqliteApi, pgApi, restoredApi;
try {
  const report=await importSnapshot(snapshot,database,schema,join(dir,'report.json'));
  assert.equal(report.ok,true,JSON.stringify(report.errors));
  assert.ok(report.rounding.some(r=>r.column==='price'));
  assert.equal(report.reconciliation.mismatches.length,0);
  assert.ok(report.reconciliation.tables.every(t=>t.sourceRows>0),'every legacy table has nonempty import evidence');
  const redemptions=report.reconciliation.tables.find(t=>t.table==='promo_redemptions');
  assert.deepEqual(redemptions.keyColumns,['order_id'],'PK-less table uses its non-null unique natural key');
  assert.equal(redemptions.sourceRows,2);assert.equal(redemptions.targetRows,2);
  assert.ok(report.reconciliation.openCustodyCount>0,'open custody is rehearsed');
  const geometry=await database.one('SELECT ST_X(point) longitude,ST_Y(point) latitude,ST_SRID(point) srid FROM driver_locations WHERE driver_id=?',driver);
  assert.deepEqual(geometry,{longitude:35.2034,latitude:31.9038,srid:4326});
  assert.ok((await database.all("SELECT indexdef FROM pg_indexes WHERE schemaname=? AND indexdef LIKE '%USING gist%'",schema)).length>=2);
  assert.equal((await database.one('SELECT capacity_state,usable_kg,usable_m3 FROM driver_run_resources WHERE driver_id=?',driver)).capacity_state,'unknown_legacy');
  for(const table of snapshot.tables.filter(t=>!NON_LEGACY_TABLES.has(t.name))) if(table.columns.some(c=>c.name==='id'&&c.pk)){
    // UUID (quotes) and singleton (road_restriction_policy) keys have no serial sequence to repair.
    if(!(await database.one("SELECT pg_get_serial_sequence(?, 'id') sequence",`${schema}.${table.name}`)).sequence) continue;
    const max=Math.max(0,...snapshot.rows[table.name].map(r=>r.id));
    const sequence=await database.one("SELECT nextval(pg_get_serial_sequence(?, 'id')) id",`${schema}.${table.name}`);
    assert.ok(sequence.id>max,`${table.name} identity sequence repaired`);
  }
  // Idempotent schema initialization under the actual same migration lock from independent pools.
  const second=connect(schema);
  const orderOf=[];let release,entered;
  const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);
  const first=database.migrate(MIGRATION_LOCK,async()=>{orderOf.push('first');entered();await gate;orderOf.push('end');});
  await start;
  const other=second.migrate(MIGRATION_LOCK,async()=>{orderOf.push('second');});
  await new Promise(r=>setTimeout(r,50));assert.deepEqual(orderOf,['first']);release();
  await Promise.all([first,other]);assert.deepEqual(orderOf,['first','end','second']);
  await initializePostgres(second,schema);await second.close();
  // Immutable cash: every forbidden mutation rolls back, including truncate and changes to audit identity.
  const entry=await database.one('SELECT id FROM cash_entries ORDER BY id LIMIT 1');
  for(const sql of ['DELETE FROM cash_entries','TRUNCATE cash_entries',`UPDATE cash_entries SET note='rewrite' WHERE id=${entry.id}`])
    await assert.rejects(database.run(sql),/append-only/);
  await assert.rejects(database.run("UPDATE orders SET price=9007199254740991 WHERE id=?",order),/unsafe legacy money/);
  await assert.rejects(database.one('SELECT 9007199254740992::bigint'),/safe-integer/);
  await assert.rejects(database.one('SELECT 9007199254740992::numeric'),/safe-number/);
  for(const amount of [0,1.005,2.005,20.005,90071992547409.9]){
    const row=await database.one('SELECT legacy_money_minor(?::float8) minor',amount);
    assert.equal(row.minor,Math.round(amount*100),'checked SQL rounding matches legacy JS at the safe-integer boundary');
  }
  // Actual pg_dump archive + pg_restore into a separate fresh database, not a table copy.
  const executable=name=>`${name}${process.platform==='win32'?'.exe':''}`;
  const bundled=resolve(import.meta.dirname,'../.expo/implementation/postgresql18/bin');
  const bin=process.env.WIND_TEST_PG_BIN??(existsSync(join(bundled,executable('pg_dump')))?bundled:execFileSync(executable('pg_config'),['--bindir'],{encoding:'utf8',windowsHide:true}).trim());
  const archive=join(dir,'import.dump');
  execFileSync(join(bin,executable('pg_dump')),['--dbname',connectionString,'--schema',schema,'--format=custom','--no-owner','--no-acl','--file',archive],{windowsHide:true,timeout:120_000});
  const freshDatabase=schemaName('restore');
  await database.run(`CREATE DATABASE ${freshDatabase}`);
  const restoreUrl=new URL(connectionString);restoreUrl.pathname=`/${freshDatabase}`;
  restored=new Persistence({connectionString:restoreUrl.href,pool:{options:`-c search_path=${schema},public`},statementTimeoutMs:30_000});
  await restored.run('CREATE EXTENSION postgis');
  execFileSync(join(bin,executable('pg_restore')),['--dbname',restoreUrl.href,'--exit-on-error','--no-owner','--no-acl',archive],{windowsHide:true,timeout:30_000,stdio:'pipe'});
  const afterRestore=await reconcile(snapshot,restored);
  assert.equal(afterRestore.ok,true,JSON.stringify(afterRestore.mismatches));
  assert.deepEqual(afterRestore.financial,report.reconciliation.financial);
  assert.equal(afterRestore.tables.find(t=>t.table==='promo_redemptions').targetRows,2,'restore retains distinct PK-less redemptions');
  writeFileSync(join(dir,'restore-report.json'),JSON.stringify({schema,database:freshDatabase,...afterRestore},null,2));
  await assert.rejects(restored.run('DELETE FROM cash_entries'),/append-only/);
  for(const table of snapshot.tables.filter(t=>!NON_LEGACY_TABLES.has(t.name)))if(table.columns.some(c=>c.name==='id'&&c.pk)){
    if(!(await restored.one("SELECT pg_get_serial_sequence(?, 'id') sequence",`${schema}.${table.name}`)).sequence) continue;
    assert.ok((await restored.one("SELECT nextval(pg_get_serial_sequence(?, 'id')) id",`${schema}.${table.name}`)).id>Math.max(0,...snapshot.rows[table.name].map(r=>r.id)));
  }
  const restoredGeometry=await restored.one('SELECT ST_AsEWKT(point) point FROM driver_locations WHERE driver_id=?',driver);
  assert.equal(restoredGeometry.point,'SRID=4326;POINT(35.2034 31.9038)');
  // Real role serialization on original SQLite, imported PG, and freshly restored PG.
  sqliteApi=await startApiProcess({DB_PATH:source});
  const env={DB_PATH:join(dir,'unused.sqlite'),WIND_DATABASE_URL:connectionString,WIND_POSTGRES_TEST_ONLY:'1',WIND_POSTGRES_TEST_SCHEMA:schema};
  pgApi=await startApiProcess(env);restoredApi=await startApiProcess({...env,WIND_DATABASE_URL:restoreUrl.href});
  const compareResponse=value=>{
    if(Array.isArray(value))return value.map(compareResponse);
    if(!value||typeof value!=='object')return value;
    const copy=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,compareResponse(item)]));
    if(copy.driverLocation){
      const location=copy.driverLocation;
      assert.equal(typeof location.ageSeconds,'number');
      assert.ok(Math.abs(location.ageSeconds-Math.max(0,Math.round((Date.now()-location.updatedAt)/1000)))<=2,'live age agrees with server elapsed time');
      // Requests run at different real instants; validate this derived field before normalizing it.
      location.ageSeconds='<validated server elapsed seconds>';
    }
    return copy;
  };
  for(const path of ['/me','/orders','/driver/cash','/driver/earnings','/roads','/subscriptions']){
    const responses=[];
    for(const api of [sqliteApi,pgApi,restoredApi]){
      const response=await fetch(`${api.base}${path}`,{headers:{Authorization:`Bearer ${token}`}});
      assert.equal(response.status,path==='/subscriptions'?404:200,`${path}: ${await response.clone().text()}`);
      responses.push(compareResponse(await response.json()));
    }
    assert.deepEqual(responses[1],responses[0],`${path}: imported role serialization`);
    assert.deepEqual(responses[2],responses[0],`${path}: restored role serialization`);
  }
  // A corrupted legacy cross-mode state produces a complete error report and zero imported rows.
  const bad=structuredClone(snapshot);const template=bad.rows.orders.find(o=>o.driver_id===driver)??bad.rows.orders[0];
  bad.rows.orders.push({...template,id:999001,driver_id:driver,service:'ride',status:'assigned',commission:2,completed_at:null});
  bad.rows.orders.push({...template,id:999002,driver_id:driver,service:'parcel',status:'returning',commission:2,completed_at:null});
  const invalid=await freshPostgres('invalid');
  try{
    const rejected=await importSnapshot(bad,invalid.database,invalid.schema,join(dir,'invalid.json'));
    assert.equal(rejected.ok,false);assert.ok(rejected.errors.length>=2);
    assert.equal((await invalid.database.one('SELECT count(*) count FROM users')).count,0);
    assert.equal((await invalid.database.one('SELECT count(*) count FROM orders')).count,0);
  }finally{await invalid.database.close();}
  const malformed=structuredClone(snapshot);
  malformed.rows.users[0].email='Case@wp03.example';malformed.rows.users[1].email='CASE@wp03.example';
  malformed.rows.orders[0].status='invented';malformed.rows.orders[1].price=-1;
  const invalidRows=await freshPostgres('bad_rows');
  try{
    const rejected=await importSnapshot(malformed,invalidRows.database,invalidRows.schema,join(dir,'invalid-rows.json'));
    assert.equal(rejected.ok,false);assert.ok(rejected.errors.length>=3,JSON.stringify(rejected.errors));
    assert.ok(rejected.errors.some(e=>e.constraint==='users_email_unique'),'casefold collision is rejected, never rewritten');
    assert.equal((await invalidRows.database.one('SELECT count(*) count FROM users')).count,0);
  }finally{await invalidRows.database.close();}
  const nonempty=await importSnapshot(snapshot,database,schema);
  assert.equal(nonempty.ok,false);assert.ok(nonempty.errors.some(e=>e.reason.includes('not empty')));
  // Generic fallback comparison remains a multiset when a future reviewed table has no total unique key.
  await database.run('CREATE TABLE keyless_rows(value TEXT)');
  await database.run("INSERT INTO keyless_rows(value) VALUES('same'),('same')");
  const keyless=structuredClone(snapshot);
  keyless.tables.push({name:'keyless_rows',columns:[{name:'value',type:'TEXT',pk:0,notnull:0}],keyColumns:[],foreignKeys:[]});
  keyless.rows.keyless_rows=[{value:'same'},{value:'same'}];
  assert.equal((await reconcile(keyless,database)).ok,true);
  await database.run('DELETE FROM keyless_rows WHERE ctid IN (SELECT ctid FROM keyless_rows LIMIT 1)');
  const multiplicity=await reconcile(keyless,database);
  assert.equal(multiplicity.ok,false);assert.ok(multiplicity.mismatches.some(m=>m.table==='keyless_rows'));
  console.log(JSON.stringify({suite:'pg-import',schema,restoredDatabase:freshDatabase,tables:report.reconciliation.tables.length,
    rows:report.reconciliation.tables.reduce((n,t)=>n+t.sourceRows,0),roundingExceptions:report.rounding.length,openCustody:report.reconciliation.openCustodyCount,
    snapshot: snapshot.path,report:join(dir,'report.json'),restore:'pg_dump/custom + pg_restore + exact reconciliation + HTTP parity',ok:true}));
}finally{await Promise.all([sqliteApi?.stop(),pgApi?.stop(),restoredApi?.stop()]);await restored?.close();await database.close();}
