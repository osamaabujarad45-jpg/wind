import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './eligibility-support.mjs';
import { Persistence } from '../server/db/persistence.ts';
import { Eligibility } from '../server/domain/eligibility.ts';
import { Presence } from '../server/domain/presence.ts';
import { connect } from './pg-support.mjs';

const sqlite=new DatabaseSync(':memory:'),sqliteDb=new Persistence({sqlite});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const unavailable=new Presence(sqliteDb,new Eligibility(sqliteDb,fail),fail);
await assert.rejects(()=>unavailable.online({user:{id:1,role:'driver',status:'active'},req:{headers:{}},body:{commandId:randomUUID(),deviceId:randomUUID(),consentVersion:1}}),error=>error.status===409&&error.message==='presence_protocol_unavailable');
await sqliteDb.close();sqlite.close();

const f=await fixture('presence_api');
const {db,call,other,d1,customer}=f;
const service=new Presence(db,new Eligibility(db,fail),fail),strict=new Presence(db,new Eligibility(db,fail),fail,true);
try {
  const deviceId=randomUUID(),commandId=randomUUID();
  const open={commandId,deviceId,consentVersion:1};
  await call('/driver/presence/online',{body:open,expect:401});
  await call('/driver/presence/online',{token:customer.token,body:open,expect:403});
  await call('/driver/presence/online',{token:d1.token,body:{...open,consentVersion:0},expect:400});
  await call('/driver/presence/online',{token:d1.token,body:open,expect:409});
  await f.setupCoverage();await f.verify();
  const [first,replay]=await Promise.all([call,other].map(client=>client('/driver/presence/online',{token:d1.token,body:open})));
  assert.deepEqual(first,replay,'concurrent command replay cannot create another presence session');
  assert.equal((await call('/driver/presence',{token:d1.token})).state,'location_stale');
  assert.equal((await db.one('SELECT count(*) n FROM driver_presence_audit')).n,1);
  await call('/driver/presence/online',{token:d1.token,body:{...open,deviceId:randomUUID()},expect:409});
  const otherDevice={commandId:randomUUID(),deviceId:randomUUID(),consentVersion:1};
  assert.equal((await call('/driver/presence/online',{token:d1.token,body:otherDevice,expect:409})).error,'presence_device_in_use');
  const envelope={deviceId,sessionId:first.sessionId};
  const beat=await call('/driver/presence/heartbeat',{token:d1.token,body:{...envelope,seq:1}});
  assert.ok(beat.leaseUntil>Date.now()+59000);
  assert.deepEqual(await call('/driver/presence/heartbeat',{token:d1.token,body:{...envelope,seq:1}}),{leaseUntil:beat.leaseUntil,deduplicated:true});
  await db.atomic({purpose:'presence_shared_policy_test'},async()=>{
    await db.one('SELECT id FROM eligibility_policy WHERE id=1 FOR SHARE');
    assert.equal((await call('/driver/presence/heartbeat',{token:d1.token,body:{...envelope,seq:2}})).deduplicated,false,'another shared policy reader does not block a heartbeat');
  });
  await call('/driver/presence/heartbeat',{token:d1.token,body:{...envelope,seq:0},expect:400});
  const sample={...envelope,seq:1,ageMs:0,latitude:31.9,longitude:35.2,accuracy:20};
  const accepted=await call('/driver/presence/location',{token:d1.token,body:sample});assert.equal(accepted.accepted,true);
  const status=await call('/driver/presence',{token:d1.token});assert.equal(status.state,'online');assert.equal(status.eligibleForMatching,false);assert.ok(!Object.hasOwn(status,'latitude'));
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:sample})).reason,'sequence_old');
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:2,ageMs:30001}})).reason,'stale');
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:3}})).reason,'rate_or_age');
  await db.run('UPDATE driver_latest_locations SET received_at=? WHERE driver_id=?',Date.now()-3000,d1.user.id);
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:4,latitude:32.9,accuracy:100}})).reason,'outlier');
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:5,latitude:32.9,accuracy:0}})).reason,'outlier','self-reported precision cannot authorize an impossible jump');
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:6,latitude:31.90001,accuracy:-1,heading:-1}})).accepted,true,'a rejected outlier does not prevent the real fix from recovering');
  const sentinel=await db.one('SELECT accuracy,heading FROM driver_latest_locations WHERE driver_id=?',d1.user.id);assert.equal(sentinel.accuracy,null);assert.equal(sentinel.heading,null);
  const historical=Date.now();
  await db.run('UPDATE driver_presence_sessions SET started_at=? WHERE driver_id=?',historical-31000,d1.user.id);
  await db.run('UPDATE driver_latest_locations SET effective_at=?,good_at=?,received_at=? WHERE driver_id=?',historical-30000,historical-30000,historical-2100,d1.user.id);
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:7,latitude:31.92}})).reason,'outlier','client-reported age cannot inflate the server receipt interval');
  assert.equal(await service.sweep(),1,'stale coordinates are removed while the online session remains live');
  assert.equal((await call('/driver/presence',{token:d1.token})).state,'location_stale');
  assert.equal((await call('/driver/presence/heartbeat',{token:d1.token,body:{...envelope,seq:3}})).deduplicated,false);
  await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:8,deviceId:randomUUID()},expect:409});
  const job=await f.book();await f.assess(job);await call(`/jobs/${job.id}/accept`,{token:d1.token,body:{}});
  assert.equal((await call('/driver/presence',{token:d1.token})).state,'busy');
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:8},expect:409})).error,'presence_active_job');
  await call(`/orders/${job.id}/release`,{token:d1.token,body:{}});
  const off={...envelope,commandId:randomUUID()};
  await db.run('UPDATE users SET approved_at=NULL WHERE id=?',d1.user.id);
  const offlineContext={user:{id:d1.user.id,role:'driver',status:'active'},req:{headers:{authorization:`Bearer ${d1.token}`}},body:off};
  assert.deepEqual(await db.atomic({id:d1.user.id},()=>strict.offline(offlineContext)),{ok:true},'driver can stop collection after permanent approval is revoked');
  assert.deepEqual(await db.atomic({id:d1.user.id},()=>strict.offline(offlineContext)),{ok:true},'offline replay also remains available');
  await db.run('UPDATE users SET approved_at=? WHERE id=?',Date.now(),d1.user.id);
  assert.deepEqual(await call('/driver/presence/offline',{token:d1.token,body:off}),{ok:true});
  assert.deepEqual(await other('/driver/presence/offline',{token:d1.token,body:off}),{ok:true});
  assert.equal((await db.one('SELECT count(*) n FROM driver_latest_locations')).n,0);
  assert.equal((await call('/driver/presence',{token:d1.token})).state,'offline');
  await call('/driver/presence/location',{token:d1.token,body:{...sample,seq:8},expect:409});
  const second=await call('/driver/presence/online',{token:d1.token,body:otherDevice});
  await call('/driver/presence/heartbeat',{token:d1.token,body:{...envelope,seq:2},expect:409});
  await call('/driver/presence/location',{token:d1.token,body:{...sample,deviceId:otherDevice.deviceId,sessionId:second.sessionId,seq:1}});
  await db.run('UPDATE driver_presence_sessions SET lease_until=? WHERE driver_id=?',Date.now()-1,d1.user.id);
  assert.equal((await call('/driver/presence/heartbeat',{token:d1.token,body:{deviceId:otherDevice.deviceId,sessionId:second.sessionId,seq:1},expect:409})).error,'presence_expired');
  const competing=connect(f.schema);
  try {
    await competing.atomic({purpose:'presence_lock_order_test'},async()=>{
      await competing.one('SELECT id FROM users WHERE id=? FOR UPDATE',d1.user.id);
      assert.equal(await service.sweep(),0,'cleanup skips a locked user rather than locking presence first');
    });
  } finally {await competing.close();}
  const sweepDeadline=Date.now()+18000;
  while((await db.one('SELECT state FROM driver_presence_sessions WHERE driver_id=?',d1.user.id)).state!=='offline' && Date.now()<sweepDeadline)
    await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal((await db.one('SELECT count(*) n FROM driver_latest_locations WHERE driver_id=?',d1.user.id)).n,0,'listening API automatically removes an expired fix');
  assert.equal((await db.one('SELECT state FROM driver_presence_sessions WHERE driver_id=?',d1.user.id)).state,'offline');
  const candidates=[{...otherDevice,commandId:randomUUID()},{...otherDevice,commandId:randomUUID(),deviceId:randomUUID()}];
  const raced=await Promise.all(candidates.map((body,index)=>fetch((index?f.b:f.a).base+'/driver/presence/online',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${d1.token}`},body:JSON.stringify(body)})));
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409],'one device owns an expired presence lease');
  const winner=raced.findIndex(r=>r.status===200),third=await raced[winner].json(),winningDevice=candidates[winner].deviceId;
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,deviceId:winningDevice,sessionId:third.sessionId,seq:1,ageMs:1000}})).reason,'stale','a fix predating the new session cannot be replayed');
  assert.equal((await call('/driver/presence/location',{token:d1.token,body:{...sample,deviceId:winningDevice,sessionId:third.sessionId,seq:2}})).accepted,true);
  await db.run('UPDATE users SET approved_at=NULL WHERE id=?',d1.user.id);
  const context={user:{id:d1.user.id,role:'driver',status:'active'},req:{headers:{authorization:`Bearer ${d1.token}`}},body:{deviceId:winningDevice,sessionId:third.sessionId,seq:1}};
  await assert.rejects(()=>db.atomic({id:d1.user.id},()=>strict.heartbeat(context)),error=>error.status===403&&error.message==='pending_approval');
  await db.run('UPDATE users SET approved_at=? WHERE id=?',Date.now(),d1.user.id);
  await db.run('UPDATE vehicles SET revision=revision+1 WHERE id=?',f.vehicle.id);
  assert.equal((await call('/driver/presence',{token:d1.token})).state,'not_eligible');
  assert.equal((await call('/driver/presence/heartbeat',{token:d1.token,body:{deviceId:winningDevice,sessionId:third.sessionId,seq:1},expect:409})).error,'vehicle_document_invalid');
  assert.equal(await service.sweep(),1);assert.equal((await db.one('SELECT count(*) n FROM driver_latest_locations WHERE driver_id=?',d1.user.id)).n,0,'ineligible presence is removed by privacy maintenance');
  await call('/auth/logout',{token:d1.token,body:{}});
  assert.equal((await db.one('SELECT count(*) n FROM driver_presence_sessions WHERE driver_id=?',d1.user.id)).n,0);
  assert.equal((await db.one('SELECT count(*) n FROM driver_latest_locations WHERE driver_id=?',d1.user.id)).n,0);
  console.log('WP07 presence: consent, two-API idempotence, device fencing, heartbeat lease/sequence, freshness, rate/outlier recovery, offline and logout revocation passed');
} finally {await f.close();}

// Simulate legacy custody linked after acceptance, then a missing inspection flag.
// The rejected online request must commit the new inspection flag and audit.
const legacy=await fixture('pres_insp');
try {
  await legacy.setupCoverage();await legacy.verify();
  const order=await legacy.book();await legacy.call(`/jobs/${order.id}/accept`,{token:legacy.d2.token,body:{}});
  await legacy.reviewDriver(legacy.d2);
  assert.equal((await legacy.db.one('SELECT inspection_required FROM vehicles WHERE id=?',legacy.vehicle.id)).inspection_required,1);
  await legacy.db.run('UPDATE vehicles SET inspection_required=0 WHERE id=?',legacy.vehicle.id);
  const result=await legacy.call('/driver/presence/online',{token:legacy.d1.token,body:{commandId:randomUUID(),deviceId:randomUUID(),consentVersion:1},expect:409});
  assert.equal(result.error,'legacy_load_inspection_required');
  assert.equal((await legacy.db.one('SELECT inspection_required FROM vehicles WHERE id=?',legacy.vehicle.id)).inspection_required,1);
  assert.ok((await legacy.db.one("SELECT count(*) n FROM eligibility_audit WHERE action='unknown_legacy_load'")).n>=2);
  assert.equal((await legacy.db.one('SELECT status FROM orders WHERE id=?',order.id)).status,'assigned');
  console.log('WP07 presence: rejected legacy-custody request commits inspection flag and audit without changing custody');
} finally {await legacy.close();}
