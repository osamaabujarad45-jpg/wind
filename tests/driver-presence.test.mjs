import assert from 'node:assert/strict';
import { createPresenceController } from '../src/driver-presence.ts';
import { createPresenceStartGuard } from '../src/presence-start-guard.ts';

let counter=0;
const uuid=()=>`00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`;
function harness() {
  let record=null,token='synthetic-token',now=1_000_000,mono=1_000_000,failWrite=false,handler;
  const deviceId=uuid(),calls=[],states=[],errors=[],timers=[];
  const io={read:async()=>record&&structuredClone(record),write:async value=>{if(failWrite)throw new Error('storage unavailable');record=value&&structuredClone(value);},
    token:async()=>token,scope:async value=>`scope:${value}`,deviceId:async()=>deviceId,uuid,now:()=>now,monotonic:()=>mono,
    every:(fn,ms)=>{const timer={fn,ms,active:true};timers.push(timer);return timer;},cancel:timer=>{timer.active=false;},state:value=>states.push(value),error:value=>errors.push(value),
    request:async(path,auth,body)=>{calls.push({path,auth,body});return handler?handler(path,body):path==='/driver/presence'?{status:200,body:{state:'offline'}}:path.endsWith('/online')?{status:200,body:{sessionId:uuid(),leaseUntil:now+60000}}:
      path.endsWith('/heartbeat')?{status:200,body:{leaseUntil:now+60000}}:{status:200,body:{ok:true,accepted:true}};}};
  return {io,calls,states,errors,timers,record:()=>record,setRecord:value=>{record=value;},setToken:value=>{token=value;},
    setNow:value=>{now=value;mono=value;},setClock:(wall,monotonic)=>{now=wall;mono=monotonic;},setFailWrite:value=>{failWrite=value;},setHandler:value=>{handler=value;}};
}
const fix=(timestamp,speed=0,accuracy=10)=>({timestamp,coords:{latitude:31.9,longitude:35.2,speed,accuracy}});
{
  const guard=createPresenceStartGuard();let release;
  const permission=new Promise(resolve=>{release=resolve;});
  const ticket=guard.snapshot();
  const start=permission.then(()=>guard.allows(ticket,{foreground:true,known:true,hasOrder:false}));
  guard.invalidate();release();assert.equal(await start,false,'returning from a permission prompt cannot revive a superseded start');
  assert.equal(guard.allows(guard.snapshot(),{foreground:false,known:true,hasOrder:false}),false);
  assert.equal(guard.allows(guard.snapshot(),{foreground:true,known:false,hasOrder:false}),false);
  assert.equal(guard.allows(guard.snapshot(),{foreground:true,known:true,hasOrder:true}),false);
  assert.equal(guard.allows(guard.snapshot(),{foreground:true,known:true,hasOrder:false}),true);
}
{
  const h=harness(),p=createPresenceController(h.io);assert.equal(await p.startPresence(true),true);
  assert.equal(await p.deliverPresenceFix(fix(1_000_000)),true);
  h.setClock(900_000,1_001_000);
  assert.equal(await p.deliverPresenceFix(fix(900_000)),false,'a wall-clock rewind cannot bypass the monotonic transport cadence');
  h.setClock(914_000,1_015_000);
  assert.equal(await p.deliverPresenceFix(fix(914_000)),true,'a new fix recovers after the phone clock moves backward');
}
{
  const h=harness(),p=createPresenceController(h.io);
  await assert.rejects(()=>p.startPresence(false),/consent_required/);assert.equal(h.calls.length,0);
  assert.equal(await p.startPresence(true),true);assert.equal(h.calls.find(x=>x.path.endsWith('/online')).body.consentVersion,1);
  assert.equal(h.timers[0].ms,15000);assert.equal(h.states.at(-1),'stale');
  assert.equal(await p.deliverPresenceFix(fix(1_000_000,3)),true);assert.equal(h.states.at(-1),'online');
  h.setNow(1_002_000);assert.equal(await p.deliverPresenceFix(fix(1_002_000,3)),false);
  h.setNow(1_005_000);assert.equal(await p.deliverPresenceFix(fix(1_005_000,3)),true);
  h.setNow(1_019_000);assert.equal(await p.deliverPresenceFix(fix(1_019_000)),false);
  h.setNow(1_020_000);assert.equal(await p.deliverPresenceFix(fix(1_020_000)),true);
  const locations=h.calls.filter(x=>x.path.endsWith('/location'));
  assert.deepEqual(locations.map(x=>x.body.seq),[1,2,3]);assert.ok(locations.every(x=>x.body.ageMs===0&&!('recordedAt' in x.body)));
  h.setNow(1_040_000);assert.equal(await p.deliverPresenceFix({...fix(1_040_000),mocked:true}),false);
  assert.equal(await p.deliverPresenceFix(fix(1_009_999)),false,'stale location is never queued');
  assert.equal(await p.deliverPresenceFix(fix(1_019_999)),false,'an older but still fresh fix never consumes a new sequence');
  assert.equal(await p.heartbeatPresence(),true);assert.equal(h.calls.at(-1).body.seq,1);
  assert.equal(await p.stopPresence(),true);assert.equal(h.timers[0].active,false);assert.equal(h.record(),null);
  assert.equal(await p.deliverPresenceFix(fix(1_040_000)),false,'offline collection stops immediately');
}
{
  const h=harness(),p=createPresenceController(h.io);assert.equal(await p.startPresence(true),true);
  assert.equal(await p.deliverPresenceFix(fix(1_000_000)),true);assert.equal(h.states.at(-1),'online');
  h.setNow(1_030_000);assert.equal(await p.heartbeatPresence(),true);
  assert.equal(h.states.at(-1),'stale','heartbeats cannot keep an old fix looking current');
}
{
  const h=harness(),old=uuid();let cleaned=false;
  h.setHandler((path)=>path==='/driver/presence'?{status:200,body:cleaned?{state:'offline'}:{state:'online',sessionId:old}}:
    path.endsWith('/offline')?(cleaned=true,{status:200,body:{ok:true}}):{status:200,body:{sessionId:uuid(),leaseUntil:1_060_000}});
  const p=createPresenceController(h.io);assert.equal(await p.startPresence(true),true);
  assert.equal(h.calls[1].path,'/driver/presence/offline');assert.equal(h.calls[1].body.sessionId,old);
  assert.notEqual(h.record().sessionId,old,'lost local context cannot reuse a previous server session');
}
{
  const h=harness(),p=createPresenceController(h.io);h.setFailWrite(true);
  await assert.rejects(()=>p.startPresence(true),/storage unavailable/);assert.equal(h.calls.filter(x=>x.path.endsWith('/online')).length,0,'no online request without durable command ID');
}
{
  const h=harness(),p=createPresenceController(h.io);let attempts=0;
  h.setHandler((path)=>path==='/driver/presence'?{status:200,body:{state:'offline'}}:path.endsWith('/online')&&++attempts===1?{status:0}:{status:200,body:{sessionId:uuid(),leaseUntil:1_060_000}});
  assert.equal(await p.startPresence(true),false);const commandId=h.record().pending.commandId;
  assert.equal(await p.startPresence(true),true);assert.equal(h.calls.filter(x=>x.path.endsWith('/online'))[1].body.commandId,commandId,'unknown outcome replays the same online command');
}
{
  const h=harness(),first=createPresenceController(h.io);assert.equal(await first.startPresence(true),true);
  const previous=h.record().sessionId;first.suspend();const restarted=createPresenceController(h.io),before=h.calls.length;
  assert.equal(h.calls.length,before,'constructing after restart does not resume collection');
  assert.equal(await restarted.startPresence(true),true);
  assert.equal(h.calls[before].path,'/driver/presence/offline');assert.equal(h.calls[before].body.sessionId,previous);
  assert.equal(h.calls[before+1].path,'/driver/presence');assert.equal(h.calls[before+2].path,'/driver/presence/online');assert.notEqual(h.record().sessionId,previous,'new consent starts a fresh server session');
}
{
  const h=harness(),sessions=new Map();let current=null,loseFirst=true;
  h.setHandler((path,body)=>{
    if(path==='/driver/presence')return {status:200,body:current?{state:'location_stale',sessionId:current}:{state:'offline'}};
    if(path.endsWith('/offline')){current=null;return {status:200,body:{ok:true}};}
    if(path.endsWith('/online')){
      if(!sessions.has(body.commandId))sessions.set(body.commandId,uuid());
      current=sessions.get(body.commandId);
      if(loseFirst){loseFirst=false;return {status:0};}
      return {status:200,body:{sessionId:current,leaseUntil:1_060_000}};
    }
    return {status:200,body:{ok:true}};
  });
  const first=createPresenceController(h.io);assert.equal(await first.startPresence(true),false);
  const pending=h.record().pending.commandId,oldSession=current;first.suspend();
  const before=h.calls.length,restarted=createPresenceController(h.io);
  assert.equal(h.calls.length,before,'a restart never replays an uncertain online command automatically');
  assert.equal(await restarted.startPresence(true),true);
  assert.equal(h.calls[before].body.commandId,pending,'explicit recovery replays the original command');
  assert.equal(h.calls[before+1].body.sessionId,oldSession,'the recovered old session is taken offline');
  assert.notEqual(h.record().sessionId,oldSession,'new consent obtains a fresh session after recovery');
}
{
  const h=harness(),p=createPresenceController(h.io);let release,entered;
  const waiting=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  h.setHandler(async path=>{if(path.endsWith('/online')){entered();await gate;return {status:200,body:{sessionId:uuid(),leaseUntil:1_060_000}};}return {status:200,body:path==='/driver/presence'?{state:'offline'}:{ok:true}};});
  const starting=p.startPresence(true);await waiting;const stopping=p.stopPresence();release();
  assert.equal(await starting,false,'late online acknowledgment cannot reactivate after stop');assert.equal(await stopping,true);
  assert.equal(h.record(),null);assert.equal(h.timers.length,0);
}
{
  const h=harness(),p=createPresenceController(h.io);assert.equal(await p.startPresence(true),true);
  h.setHandler(path=>path.endsWith('/location')?{status:409,body:{error:'presence_active_job'}}:{status:200,body:{ok:true}});
  assert.equal(await p.deliverPresenceFix(fix(1_000_000)),false);assert.equal(h.states.at(-1),'busy');assert.equal(h.timers[0].active,false);
  const count=h.calls.length;assert.equal(await p.heartbeatPresence(),false);assert.equal(h.calls.length,count,'revoked authority is never retried');
}
{
  const h=harness(),p=createPresenceController(h.io);assert.equal(await p.startPresence(true),true);
  h.setHandler(path=>path.endsWith('/heartbeat')?{status:409,body:{error:'presence_active_job'}}:{status:200,body:{ok:true}});
  assert.equal(await p.heartbeatPresence(),false);assert.equal(h.states.at(-1),'busy');assert.equal(h.timers[0].active,false);
}
{
  const h=harness(),p=createPresenceController(h.io);
  h.setHandler(path=>path==='/driver/presence'?{status:200,body:{state:'offline'}}:{status:409,body:{error:'presence_device_in_use'}});
  assert.equal(await p.startPresence(true),false);assert.equal(h.errors.at(-1),'presence_device_in_use','server refusal reaches the host');
}
{
  const h=harness(),p=createPresenceController(h.io);h.setHandler(()=>({status:200,body:{}}));
  assert.equal(await p.startPresence(true),false);assert.equal(h.states.at(-1),'reconnecting');
  assert.equal(h.calls.filter(x=>x.path.endsWith('/online')).length,0,'malformed status cannot authorize a new session');
}
{
  const h=harness(),p=createPresenceController(h.io);h.setHandler(()=>({status:401,body:{error:'unauthorized'}}));
  assert.equal(await p.startPresence(true),false);assert.equal(h.states.at(-1),'offline');assert.equal(h.timers.length,0,'revoked status cannot start heartbeat or location');
}
{
  const h=harness(),p=createPresenceController(h.io);assert.equal(await p.startPresence(true),true);
  let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  h.setHandler(async path=>{if(path.endsWith('/location')){entered();await gate;return {status:200,body:{accepted:true}};}return {status:200,body:{ok:true}};});
  const first=p.deliverPresenceFix(fix(1_000_000));await started;
  h.setNow(1_001_000);const queuedFix=p.deliverPresenceFix(fix(1_001_000));
  release();assert.equal(await first,true);assert.equal(await queuedFix,false,'a fix queued behind an in-flight upload is cadence-dropped, not replayed');
  assert.equal(h.calls.filter(x=>x.path.endsWith('/location')).length,1,'a later callback is not replayed after the network finishes');
}
{
  const h=harness(),p=createPresenceController(h.io);assert.equal(await p.startPresence(true),true);
  h.setToken('different-account');assert.equal(await p.deliverPresenceFix(fix(1_000_000)),false);
  assert.equal(h.calls.filter(x=>x.path.endsWith('/location')).length,0,'old session cannot upload after account switch');
  assert.equal(await p.stopPresence(),false);assert.equal(h.record(),null,'foreign stored context is removed');
}
console.log('WP07 presence controller: explicit consent, durable command replay, restart, cadence, stale fixes and revoke races passed');
