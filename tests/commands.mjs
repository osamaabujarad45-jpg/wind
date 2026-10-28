import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { freshPostgres,connectionString } from './pg-support.mjs';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
import { versionedCommand } from '../server/domain/commands.ts';
const {schema,database:db}=await freshPostgres('commands');
const dir=await mkdtemp(join(tmpdir(),'wind-wp04-command-'));
const storage={DB_PATH:join(dir,'compat.sqlite'),WIND_DATABASE_URL:connectionString,WIND_POSTGRES_TEST_ONLY:'1',WIND_POSTGRES_TEST_SCHEMA:schema,WIND_IDENTITY_MODE:'self-service'};
const a=await startApiProcess(storage),b=await startApiProcess(storage);
const call=apiCaller(()=>a.base),other=apiCaller(()=>b.base);
const input={service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',shared:false,contact:'0599800002',detail:'Synthetic private box',pickupNote:'PRIVATE_ADDRESS_SENTINEL',dropoffNote:'Synthetic destination',quotedPrice:20};
try {
  const register=async(phone,extra={})=>{
    const salt=randomBytes(16).toString('hex');
    const password=`${salt}:${scryptSync('PRIVATE_PASSWORD_SENTINEL',salt,32).toString('hex')}`;
    await db.run('INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?)',phone,'Synthetic',password,extra.role??'customer',extra.role==='driver'?'pending':'active',extra.vehicle??null,Date.now());
    return call('/auth/login',{body:{phone,password:'PRIVATE_PASSWORD_SENTINEL'}});
  };
  // Harness intentionally chooses operator-verified mode; provision synthetic accounts through authenticated HTTP.
  const customer=await register('0599800002');
  const driver=await register('0599800003',{role:'driver',vehicle:'car'});
  const admin=await register('0599800001');
  await db.run("UPDATE users SET role='admin' WHERE id=?",admin.user.id);
  await call(`/admin/users/${driver.user.id}/approve`,{token:admin.token,body:{}});
  const capabilities=(await call('/health?protocol=1',{token:customer.token})).protocol;assert.equal(capabilities.durableEvents,true);
  const commandId=randomUUID();
  const booked=await call('/orders',{token:customer.token,body:{commandId,payload:input}});
  assert.equal(booked.status,'searching');
  await db.run("UPDATE settings SET value=90 WHERE key='parcelSmall'");
  assert.deepEqual(await other('/orders',{token:customer.token,body:{commandId,payload:input}}),booked,'replay before current price');
  await call('/orders',{token:customer.token,body:{commandId,payload:{...input,detail:'changed'}},expect:409});
  const version=async id=>(await db.one('SELECT version FROM orders WHERE id=?',id)).version;
  const accept={commandId:randomUUID(),expectedVersion:await version(booked.id)};
  const assigned=await call(`/jobs/${booked.id}/accept`,{token:driver.token,body:accept});
  assert.deepEqual(await other(`/jobs/${booked.id}/accept`,{token:driver.token,body:accept}),assigned,'replay before old version and changed lease');
  await call(`/orders/${booked.id}/advance`,{token:driver.token,body:{commandId:randomUUID(),expectedVersion:1},expect:409});
  for(let i=0;i<2;i++) await call(`/orders/${booked.id}/advance`,{token:driver.token,body:{commandId:randomUUID(),expectedVersion:await version(booked.id)}});
  const failed={commandId:randomUUID(),expectedVersion:await version(booked.id),payload:{code:'not-the-code'}};
  assert.equal((await call(`/orders/${booked.id}/advance`,{token:driver.token,body:failed,expect:400})).error,'wrong_code');
  await other(`/orders/${booked.id}/advance`,{token:driver.token,body:failed,expect:400});
  assert.equal((await db.one('SELECT failures FROM proof_attempts WHERE order_id=?',booked.id)).failures,1);
  assert.equal((await db.one("SELECT count(*) n FROM domain_events WHERE order_id=? AND type='proof.attempted'",booked.id)).n,1);
  const done=await call(`/orders/${booked.id}/advance`,{token:driver.token,body:{commandId:randomUUID(),expectedVersion:await version(booked.id),payload:{code:booked.handoverCode}}});assert.equal(done.status,'completed');
  const replayUnderApprovalPolicy=()=>db.atomic({id:driver.user.id},()=>versionedCommand(db,{id:driver.user.id},{...accept},`/api/jobs/${booked.id}/accept`,'POST',
    ()=>{throw new Error('a saved command must not execute again');},(status,message)=>{throw Object.assign(new Error(message),{status});},()=>false,
    async()=>{throw new Error('saved participant access uses the current row');},{requirePermanentDriverApproval:true}));
  await db.run('UPDATE users SET approved_at=NULL WHERE id=?',driver.user.id);
  await assert.rejects(replayUnderApprovalPolicy,error=>error.status===403 && error.message==='pending_approval');
  await db.run('UPDATE users SET approved_at=? WHERE id=?',Date.now(),driver.user.id);
  assert.deepEqual(await replayUnderApprovalPolicy(),assigned,'approved driver replays before changed version/status');
  const remittance=await call('/admin/cash/remittance',{token:admin.token,body:{commandId:randomUUID(),payload:{driverId:driver.user.id,amountCents:100,currency:'ILS'}}});
  const cashState=await call('/driver/cash?protocol=1',{token:driver.token});
  const cashVersion=cashState.protocol.entries.find(e=>e.id===remittance.id).version;
  const confirm={commandId:randomUUID(),expectedVersion:cashVersion,payload:{decision:'confirm',amountCents:100,currency:'ILS'}};
  await call(`/driver/cash/${remittance.id}/confirm`,{token:driver.token,body:{...confirm,commandId:randomUUID(),payload:{...confirm.payload,amountCents:101}},expect:409});
  const receipt=await call(`/driver/cash/${remittance.id}/confirm`,{token:driver.token,body:confirm});
  assert.deepEqual(await other(`/driver/cash/${remittance.id}/confirm`,{token:driver.token,body:confirm}),receipt);
  assert.equal((await db.one('SELECT version FROM cash_entries WHERE id=?',remittance.id)).version,cashVersion+1);
  // Saved private results cannot retain a role that the authenticated account has lost.
  const adminCommand={commandId:randomUUID(),payload:{driverId:driver.user.id,amountCents:1,currency:'ILS'}};
  await call('/admin/cash/remittance',{token:admin.token,body:adminCommand});
  await db.run("UPDATE users SET role='customer' WHERE id=?",admin.user.id);
  await other('/admin/cash/remittance',{token:admin.token,body:adminCommand,expect:403});
  await db.run("UPDATE users SET role='admin' WHERE id=?",admin.user.id);
  // Different money commands cannot reserve the same remaining driver cash balance twice.
  const cashRaces=await Promise.all([a,b].map(server=>fetch(server.base+'/admin/cash/remittance',{method:'POST',
    headers:{Authorization:`Bearer ${admin.token}`,'Content-Type':'application/json'},
    body:JSON.stringify({commandId:randomUUID(),payload:{driverId:driver.user.id,amountCents:150,currency:'ILS'}})})));
  assert.deepEqual(cashRaces.map(r=>r.status).sort(),[200,400]);
  const releasable=await call('/orders',{token:customer.token,body:{commandId:randomUUID(),payload:input}});
  const previousAccept={commandId:randomUUID(),expectedVersion:await version(releasable.id)};
  await call(`/jobs/${releasable.id}/accept`,{token:driver.token,body:previousAccept});
  const previousConflict={commandId:randomUUID(),expectedVersion:1};
  assert.equal((await call(`/orders/${releasable.id}/advance`,{token:driver.token,body:previousConflict,expect:409})).error,'VERSION_CONFLICT');
  const releaseCommand={commandId:randomUUID(),expectedVersion:await version(releasable.id)};
  await call(`/orders/${releasable.id}/release`,{token:driver.token,body:releaseCommand});
  assert.deepEqual(await other(`/orders/${releasable.id}/release`,{token:driver.token,body:releaseCommand}),{ok:true},
    'safe release receipt remains replayable after ownership ends');
  await other(`/jobs/${releasable.id}/accept`,{token:driver.token,body:previousAccept,expect:404});
  await other(`/orders/${releasable.id}/advance`,{token:driver.token,body:previousConflict,expect:404});
  await db.run("UPDATE users SET role='driver' WHERE id=?",customer.user.id);
  await other('/orders',{token:customer.token,body:{commandId,payload:input},expect:403});
  await db.run("UPDATE users SET role='customer' WHERE id=?",customer.user.id);
  const events=(await call(`/orders/${booked.id}?protocol=1`,{token:customer.token})).protocol;
  assert.ok(events.events.length>10);assert.equal(events.version,await version(booked.id));
  assert.deepEqual(events.events.map(e=>e.sequence),events.events.map((_,i)=>i+1));
  assert.equal((await call(`/orders/${booked.id}?protocol=1&after=${events.nextCursor}`,{token:driver.token})).protocol.events.length,0);
  await call(`/orders/${booked.id}?protocol=1`,{token:admin.token});
  const outsider=await register('0599800004');await call(`/orders/${booked.id}?protocol=1`,{token:outsider.token,expect:404});
  const encoded=JSON.stringify(await db.all('SELECT payload FROM domain_events'));
  for(const secret of ['PRIVATE_ADDRESS_SENTINEL','PRIVATE_PASSWORD_SENTINEL',input.contact,customer.token,booked.handoverCode])assert.equal(encoded.includes(secret),false,`no private value in journal`);
  assert.ok((await db.one("SELECT count(*) n FROM domain_events WHERE order_id=? AND actor_id=?",booked.id,driver.user.id)).n>0);
  assert.equal((await db.one('SELECT count(*) n FROM domain_events e LEFT JOIN outbox o ON o.event_id=e.id WHERE o.event_id IS NULL')).n,0,'every event has atomic intent');
  // Two actual API processes serialize same ID before payload comparison.
  const race=randomUUID();
  const replies=await Promise.all([a,b].map((server,i)=>fetch(server.base+'/orders',{method:'POST',headers:{Authorization:`Bearer ${customer.token}`,'Content-Type':'application/json'},body:JSON.stringify({commandId:race,payload:{...input,detail:`race ${i}`}})})));
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  assert.equal((await db.one('SELECT count(*) n FROM command_results WHERE command_id=?',race)).n,1);
  // Atomic trigger failure rolls back state, events and command result together.
  const before=await db.one('SELECT count(*) n FROM orders');
  await db.run(`CREATE FUNCTION fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_ERROR_SENTINEL'; END $$; CREATE TRIGGER fail_event BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION fail_event()`);
  const rollbackId=randomUUID();await call('/orders',{token:customer.token,body:{commandId:rollbackId,payload:input},expect:500});
  assert.deepEqual(await db.one('SELECT count(*) n FROM orders'),before);
  assert.equal((await db.one('SELECT count(*) n FROM command_results WHERE command_id=?',rollbackId)).n,0);
  await db.run('DROP TRIGGER fail_event ON outbox');
  assert.equal(a.diagnostics().includes('PRIVATE_ERROR_SENTINEL'),false);
  // Discard the real HTTP acknowledgment at response headers, after the server's durable commit.
  const lostAck=randomUUID();
  await new Promise((resolve,reject)=>{
    const req=request(a.base+'/orders',{method:'POST',headers:{Authorization:`Bearer ${customer.token}`,'Content-Type':'application/json'}},response=>{
      assert.equal(response.statusCode,200);response.destroy();req.destroy();resolve();
    });req.on('error',error=>error.code==='ECONNRESET'?resolve():reject(error));
    req.end(JSON.stringify({commandId:lostAck,payload:input}));
  });
  const savedLost=JSON.parse((await db.one('SELECT response FROM command_results WHERE command_id=?',lostAck)).response);
  assert.ok((await db.one('SELECT count(*) n FROM domain_events WHERE order_id=?',savedLost.id)).n>0);
  assert.deepEqual(await other('/orders',{token:customer.token,body:{commandId:lostAck,payload:input}}),savedLost);
  // An aborted upload never creates a command; an abort after DB commit cannot lose its event.
  const aborted=randomUUID();
  const url=new URL(a.base+'/orders');
  await new Promise(resolve=>{const req=request(url,{method:'POST',headers:{Authorization:`Bearer ${customer.token}`,'Content-Type':'application/json','Content-Length':'20000'}});req.on('error',resolve);req.write(JSON.stringify({commandId:aborted}).slice(0,-1));setTimeout(()=>req.destroy(),30);});
  assert.equal((await db.one('SELECT count(*) n FROM command_results WHERE command_id=?',aborted)).n,0);
  // A configured PostgreSQL backend cannot advertise or accept durable writes without migration 4.
  await db.run('UPDATE schema_migrations SET version=400 WHERE version=4');
  assert.equal((await call('/health?protocol=1')).protocol.durableEvents,false);
  await call('/orders',{token:customer.token,body:input,expect:503});
  await db.run('UPDATE schema_migrations SET version=4 WHERE version=400');
  assert.equal((await call('/health?protocol=1')).protocol.durableEvents,true);
  console.log('WP04 commands: real two-process conflict, replay/version/proof-once, ACL/cursor/privacy, atomic failure, aborted upload passed');
} finally {await a.stop();await b.stop();await db.close();}


