import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
import { createPresenceController } from '../src/driver-presence.ts';

const f=await fixture('client_pres');
try {
  await f.setupCoverage();await f.verify();
  let token=f.d1.token,record=null,loseOnline=true;const deviceId=randomUUID(),calls=[],states=[],timers=[];
  const io={read:async()=>record&&structuredClone(record),write:async value=>{record=value&&structuredClone(value);},
    token:async()=>token,scope:async value=>createHash('sha256').update(value).digest('hex'),deviceId:async()=>deviceId,uuid:randomUUID,now:Date.now,
    every:(fn,ms)=>{const timer={fn,ms,active:true};timers.push(timer);return timer;},cancel:timer=>{timer.active=false;},state:value=>states.push(value),
    request:async(path,auth,body)=>{
      calls.push({path,body});
      const response=await fetch(f.a.base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},...(body&&{body:JSON.stringify(body)})});
      const result={status:response.status,body:await response.json()};
      if(path.endsWith('/online')&&loseOnline){loseOnline=false;throw new Error('Synthetic lost acknowledgment');}
      return result;
    }};
  const controller=createPresenceController(io);
  assert.equal(await controller.startPresence(true),false);
  const pending=record.pending.commandId;
  assert.equal(await controller.startPresence(true),true,'lost online acknowledgment is recovered from the server receipt');
  assert.deepEqual(calls.filter(x=>x.path.endsWith('/online')).map(x=>x.body.commandId),[pending,pending]);
  assert.equal((await f.db.one('SELECT count(*) n FROM driver_presence_audit')).n,1);
  assert.equal(await controller.deliverPresenceFix({timestamp:Date.now(),coords:{latitude:31.9,longitude:35.2,accuracy:15,speed:0}}),true);
  assert.equal(states.at(-1),'online');assert.equal((await f.call('/driver/presence',{token})).state,'online');
  assert.equal((await f.db.one('SELECT count(*) n FROM driver_locations WHERE driver_id=?',f.d1.user.id)).n,0,'preassignment fix never enters the customer live-map table');
  assert.equal(await controller.heartbeatPresence(),true);
  const oldSession=record.sessionId;controller.suspend();
  const restarted=createPresenceController(io);assert.equal(await restarted.startPresence(true),true);
  assert.notEqual(record.sessionId,oldSession,'an explicit start after a new launch revokes the old server session first');
  assert.equal((await f.db.one('SELECT count(*) n FROM driver_latest_locations')).n,0);
  assert.equal(await restarted.stopPresence(),true);assert.equal(timers[0].active,false);
  assert.equal((await f.db.one('SELECT count(*) n FROM driver_latest_locations')).n,0);
  assert.equal(await restarted.startPresence(true),true);
  await f.call('/auth/logout',{token,body:{}});token=null;
  assert.equal(await restarted.deliverPresenceFix({timestamp:Date.now(),coords:{latitude:31.9,longitude:35.2}}),false);
  assert.equal(record,null);assert.equal(timers.at(-1).active,false);
  assert.equal((await f.db.one('SELECT count(*) n FROM driver_presence_sessions')).n,0);
  console.log('WP07 presence client/API: real lost-ack replay, separate location storage, heartbeat, offline and logout fencing passed');
} finally {await f.close();}
