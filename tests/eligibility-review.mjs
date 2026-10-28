import assert from 'node:assert/strict';
import { fixture } from './eligibility-support.mjs';
import { measuredCapability } from '../server/domain/eligibility.ts';
import { phoneSchemaAvailable } from '../server/domain/phone-identity.ts';
const tiny={items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}]};
const failures=[];let scenarios=0;
async function scenario(name,run) {
  scenarios++;
  const f=await fixture('review');
  try {await f.setupCoverage(['synthetic_permit']);await f.verify();await f.verify(f.d2);await f.check('permit',{driverId:f.d1.user.id},{permitKey:'synthetic_permit'});await f.check('permit',{driverId:f.d2.user.id},{permitKey:'synthetic_permit'});await run(f);console.log('PASS',name);}
  catch(error){failures.push(error);console.error('FAIL',name,error.message);}
  finally{await f.close();}
}
await scenario('unfinished overdue load blocks insertion and retains custody',async f=>{
  const first=await f.book();await f.assess(first,{...tiny,routeSeconds:1,serviceSeconds:0,approach:false});await f.approach(first,{seconds:1});await f.call(`/jobs/${first.id}/accept`,{token:f.d1.token,body:{}});
  const end=(await f.db.one('SELECT planned_end FROM capacity_reservations WHERE order_id=?',first.id)).planned_end;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,end-Date.now()+50)));
  const before=await f.db.one('SELECT * FROM orders WHERE id=?',first.id);
  const next=await f.book();await f.assess(next,{...tiny,approach:false});
  const result=await f.call(`/jobs/${next.id}/accept`,{token:f.d2.token,body:{},expect:409});assert.equal(result.error,'prior_run_overdue');
  assert.deepEqual(await f.db.one('SELECT * FROM orders WHERE id=?',first.id),before);assert.equal((await f.db.one('SELECT count(*) n FROM capacity_reservations')).n,1);
});
await scenario('missing approach travel cannot satisfy a pickup window',async f=>{
  const order=await f.book();await f.assess(order,{...tiny,approach:false,pickupBefore:Date.now()+60000});
  assert.equal((await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{},expect:409})).error,'approach_evidence_missing');
});
for(const driverNegative of [true,false]) await scenario(`permit negative blocks other subject approval (${driverNegative})`,async f=>{
  await f.check('permit',{vehicleId:f.vehicle.id},{permitKey:'synthetic_permit',outcome:driverNegative?'approved':'rejected'});
  if(driverNegative)await f.check('permit',{driverId:f.d1.user.id},{permitKey:'synthetic_permit',outcome:'rejected'});
  const order=await f.book();await f.assess(order,tiny);
  assert.equal((await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{},expect:409})).error,'permit_missing');
});
await scenario('SQL fabricated zero load cannot authorize measured assignment',async f=>{
  const order=await f.book();await f.assess(order,tiny);
  await reserve(f,order,{grams:0,cm3:0,pieces:0});
  await assert.rejects(f.db.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?",f.d1.user.id,order.id),{code:'23514'});
  assert.equal((await f.db.one('SELECT status FROM orders WHERE id=?',order.id)).status,'searching');
});
await scenario('active physical certificate rejects direct mutation and deletion',async f=>{
  const order=await f.book();await f.assess(order,tiny);await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{}});
  for(const sql of ['UPDATE capacity_reservations SET grams=0 WHERE order_id=?','DELETE FROM capacity_reservations WHERE order_id=?',
    'UPDATE order_requirements SET grams=0 WHERE order_id=?','DELETE FROM order_requirements WHERE order_id=?'])
    await assert.rejects(f.db.run(sql,order.id),{code:'23514'});
  assert.equal((await f.db.one('SELECT grams FROM capacity_reservations WHERE order_id=?',order.id)).grams,1);
});
await scenario('security migration gates measured and phone capabilities',async f=>{
  assert.equal(await measuredCapability(f.db),true);assert.equal(await phoneSchemaAvailable(f.db),true);
  const order=await f.book();await f.assess(order,tiny);
  await f.db.run('UPDATE schema_migrations SET version=800 WHERE version=8');
  try {
    assert.equal(await measuredCapability(f.db),false);assert.equal(await phoneSchemaAvailable(f.db),false);
    assert.equal((await f.call('/phone/capabilities')).available,false);
    assert.equal((await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{capacityProtocol:1},expect:409})).error,'measured_protocol_unavailable');
    assert.equal((await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{},expect:409})).error,'measured_protocol_unavailable');
    assert.equal((await f.db.one('SELECT status FROM orders WHERE id=?',order.id)).status,'searching');
  } finally { await f.db.run('UPDATE schema_migrations SET version=8 WHERE version=800'); }
});


const guardError=async(f,order,body,error)=>assert.equal((await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body,expect:409})).error,error);
await scenario('opt-in immutable scope reads, privacy, required and stale consent',async f=>{
  const order=await f.book();await f.assess(order,tiny);
  const installed=await f.call('/jobs',{token:f.d1.token});assert.ok(installed.every(o=>!Object.hasOwn(o,'measuredScope')));
  const jobs=await f.call('/jobs?capacityProtocol=1',{token:f.d1.token});
  const detail=await f.call(`/orders/${order.id}?capacityProtocol=1`,{token:f.customer.token});
  const snapshot=jobs.find(o=>o.id===order.id).measuredScope;assert.deepEqual(snapshot,detail.measuredScope);assert.equal(snapshot.requirementsRevision,1);assert.equal(snapshot.grams,1);
  assert.deepEqual(Object.keys(snapshot).sort(),['requirementsRevision','grams','cm3','pieces','seats','items','equipment','rotationPolicy','routeSeconds','serviceSeconds','pickupAfter','pickupBefore','dropoffBefore'].sort());
  const stranger=await f.account();await f.call(`/orders/${order.id}?capacityProtocol=1`,{token:stranger.token,expect:404});
  await f.call(`/orders/${order.id}?capacityProtocol=1`,{expect:401});
  await guardError(f,order,{capacityProtocol:1},'requirements_revision_required');
  await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{capacityProtocol:1,expectedRequirementsRevision:'1'},expect:400});
  await f.assess(order,{...tiny,items:[{count:2,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}]});
  await guardError(f,order,{capacityProtocol:1,expectedRequirementsRevision:snapshot.requirementsRevision},'requirements_changed');
  await guardError(f,order,{expectedRequirementsRevision:snapshot.requirementsRevision},'requirements_changed');
  assert.equal((await f.db.one('SELECT count(*) n FROM capacity_reservations')).n,0);
  assert.equal((await f.db.one('SELECT status FROM orders WHERE id=?',order.id)).status,'searching');
  const newScope=(await f.call(`/orders/${order.id}?capacityProtocol=1`,{token:f.customer.token})).measuredScope;
  assert.equal(newScope.requirementsRevision,2);assert.equal(snapshot.pieces,1);assert.equal(newScope.pieces,2);
  await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{capacityProtocol:1,expectedRequirementsRevision:2}});
});
await scenario('negotiated offers require current measured consent without refreshing on mismatch',async f=>{
  const order=await f.book({service:'ride',option:'1',pricing:'smart'});await f.assess(order,{items:[],seats:1});
  const price=(await f.db.one('SELECT price FROM orders WHERE id=?',order.id)).price;
  assert.equal((await f.call(`/jobs/${order.id}/offer`,{token:f.d1.token,body:{capacityProtocol:1,price},expect:409})).error,'requirements_revision_required');
  await f.call(`/jobs/${order.id}/offer`,{token:f.d1.token,body:{capacityProtocol:1,expectedRequirementsRevision:1,price}});
  const snapshot=await f.db.one('SELECT * FROM eligibility_offers WHERE order_id=?',order.id);
  await f.assess(order,{items:[],seats:2});
  assert.equal((await f.call(`/jobs/${order.id}/offer`,{token:f.d1.token,body:{expectedRequirementsRevision:1,price},expect:409})).error,'requirements_changed');
  assert.deepEqual(await f.db.one('SELECT * FROM eligibility_offers WHERE order_id=?',order.id),snapshot);
  assert.equal((await f.call(`/orders/${order.id}/offers/${f.d1.user.id}/accept`,{token:f.customer.token,body:{expectedRequirementsRevision:1},expect:409})).error,'requirements_changed');
  assert.equal((await f.db.one('SELECT count(*) n FROM capacity_reservations')).n,0);
});
await scenario('approach duration, append-only refresh, freshness and revision binding',async f=>{
  const order=await f.book();await f.assess(order,{...tiny,pickupBefore:Date.now()+60000,approach:false});
  const long=await f.approach(order,{seconds:120});await guardError(f,order,{},'stop_window_infeasible');
  await assert.rejects(f.db.run('UPDATE order_approaches SET seconds=1 WHERE id=?',long.approachId),{code:'23514'});
  const short=await f.approach(order,{seconds:1});assert.ok(short.approachId>long.approachId);
  await f.approach(order,{observedAt:Date.now()+60000},400);await f.approach(order,{observedAt:Date.now()-300001},400);
  await f.approach(order,{validUntil:Date.now()+86400001},400);await f.approach(order,{from:{longitude:181,latitude:0}},400);
  await f.approach(order,{to:{longitude:35,latitude:31}},409);
  await f.db.run('UPDATE vehicle_runs SET revision=revision+1 WHERE vehicle_id=?',f.vehicle.id);
  await guardError(f,order,{},'approach_evidence_changed');await f.approach(order,{seconds:1});
  // Legitimate historical append whose validity expired; no mutation of its audit row.
  await f.db.run(`INSERT INTO order_approaches(order_id,requirements_revision,vehicle_id,vehicle_revision,run_revision,from_lng,from_lat,to_lng,to_lat,seconds,observed_at,valid_until,method,reviewer_id,evidence_ref,reason,created_at)
    SELECT order_id,requirements_revision,vehicle_id,vehicle_revision,run_revision,from_lng,from_lat,to_lng,to_lat,seconds,?,?,method,reviewer_id,evidence_ref,reason,? FROM order_approaches WHERE id=?`,Date.now()-10000,Date.now()-1,Date.now()-1000,short.approachId);
  // Latest historical row also has stale run revision, so refresh it first to test expiry specifically.
  await f.approach(order,{seconds:1});
  const latest=await f.db.one('SELECT id FROM order_approaches ORDER BY id DESC LIMIT 1');
  await f.db.run(`INSERT INTO order_approaches(order_id,requirements_revision,vehicle_id,vehicle_revision,run_revision,from_lng,from_lat,to_lng,to_lat,seconds,observed_at,valid_until,method,reviewer_id,evidence_ref,reason,created_at)
    SELECT order_id,requirements_revision,vehicle_id,vehicle_revision,run_revision,from_lng,from_lat,to_lng,to_lat,seconds,?,?,method,reviewer_id,evidence_ref,reason,? FROM order_approaches WHERE id=?`,Date.now()-10000,Date.now()-1,Date.now()-1000,latest.id);
  await guardError(f,order,{},'approach_evidence_expired');
  await f.approach(order,{seconds:1});await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{}});
});
await scenario('active-run approach starts at last dropoff and spans prior work plus all service',async f=>{
  const first=await f.book();await f.assess(first,tiny);await f.call(`/jobs/${first.id}/accept`,{token:f.d1.token,body:{}});
  const prior=await f.db.one('SELECT planned_end FROM capacity_reservations WHERE order_id=?',first.id);
  const order=await f.book();await f.assess(order,{...tiny,approach:false,pickupBefore:prior.planned_end+60000});
  await f.approach(order,{from:{longitude:35.18,latitude:31.89}},409);
  await f.approach(order,{seconds:120});await guardError(f,order,{},'stop_window_infeasible');
  await f.approach(order,{seconds:10});
  await f.check('driver_license',{driverId:f.d1.user.id},{validUntil:prior.planned_end+80000});
  await guardError(f,order,{},'driver_document_invalid');
  await f.check('driver_license',{driverId:f.d1.user.id});
  await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{}});
  const end=await f.db.one('SELECT planned_end FROM capacity_reservations WHERE order_id=?',order.id);
  assert.equal(end.planned_end,prior.planned_end+90000,'10s approach + 60s route + two 10s services');
});
await scenario('wrong physical vehicle evidence and expired/superseded vehicle permit cannot approve',async f=>{
  const second=await f.post('/vehicles',{...f.vehicleBody,plate:'SYNTHETIC-SECOND'});
  const order=await f.book();await f.assess(order,{...tiny,approach:false});await f.approach(order,{vehicleId:second.id});
  await guardError(f,order,{},'approach_evidence_missing');await f.approach(order);
  await f.check('permit',{driverId:f.d1.user.id},{permitKey:'synthetic_permit',validUntil:f.now-1,validFrom:f.now-10000});
  await f.check('permit',{vehicleId:f.vehicle.id},{permitKey:'synthetic_permit',validUntil:f.now-1,validFrom:f.now-10000});
  await f.approach(order);await guardError(f,order,{},'permit_missing');
  await f.check('permit',{vehicleId:f.vehicle.id},{permitKey:'synthetic_permit'});
  await f.call(`/admin/eligibility/vehicles/${f.vehicle.id}`,{token:f.admin.token,method:'PATCH',body:{...f.vehicleBody,...f.evidence,expectedRevision:1}});
  for(const kind of ['vehicle_registration','vehicle_inspection'])await f.check(kind,{vehicleId:f.vehicle.id});
  await f.approach(order);await guardError(f,order,{},'permit_missing');
  await f.check('permit',{vehicleId:f.vehicle.id},{permitKey:'synthetic_permit'});await f.approach(order);
  await f.call(`/jobs/${order.id}/accept`,{token:f.d1.token,body:{}});
});
// A direct writer supplies a superficially current reservation; no HTTP eligibility assertion is involved.
async function reserve(f,order,overrides={},driver=f.d1) {
  const q=await f.db.one('SELECT * FROM order_requirements WHERE order_id=?',order.id),d=await f.db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',driver.user.id),v=await f.db.one('SELECT * FROM vehicles WHERE id=?',f.vehicle.id),p=await f.db.one('SELECT revision FROM eligibility_policy'),run=await f.db.one('SELECT revision FROM vehicle_runs WHERE vehicle_id=?',v.id);
  const r={grams:q.grams,cm3:q.cm3,pieces:q.pieces,seats:q.seats,service:order.service,...overrides};
  await f.db.run(`INSERT INTO capacity_reservations(order_id,vehicle_id,driver_id,vehicle_revision,driver_revision,policy_revision,requirements_revision,run_revision,grams,cm3,pieces,seats,service,planned_end,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,order.id,v.id,d.driver_id,v.revision,d.revision,p.revision,q.revision,run.revision,r.grams,r.cm3,r.pieces,r.seats,r.service,Date.now()+600000,Date.now());
}
for(const [label,extra,corrupt] of [
  ['weight',{items:[{count:1,gramsEach:10001,lengthMm:1,widthMm:1,heightMm:1}]}],
  ['volume',{items:[{count:1,gramsEach:1,lengthMm:1100,widthMm:1000,heightMm:1000}]}],
  ['fixed width',{items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1001,heightMm:1}]}],
  ['longitudinal slices',{items:[{count:2,gramsEach:1,lengthMm:1001,widthMm:1,heightMm:1}]}],
  ['equipment',{...tiny,equipment:['refrigeration']}],
  ['seats',{items:[],seats:5},'ride'],
  ['piece limit',{items:[{count:200,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}]},'pieces'],
  ['numeric overflow',tiny,'overflow'],
  ['canonical item totals',tiny,'totals'],
])await scenario(`direct SQL rejects ${label}`,async f=>{
  const order=await f.book(corrupt==='ride'?{service:'ride',option:'1'}:{});await f.assess(order,extra);
  if(corrupt==='pieces')await f.db.run('UPDATE vehicles SET max_pieces=199 WHERE id=?',f.vehicle.id);
  if(corrupt==='overflow')await f.db.run('UPDATE order_requirements SET items=?::jsonb WHERE order_id=?',JSON.stringify([{count:200,gramsEach:1000000000,lengthMm:10000000000000000000,widthMm:10000000000000000000,heightMm:10000000000000000000}]),order.id);
  if(corrupt==='totals')await f.db.run('UPDATE order_requirements SET grams=0,cm3=0,pieces=0 WHERE order_id=?',order.id);
  await reserve(f,order);
  await assert.rejects(f.db.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?",f.d1.user.id,order.id),{code:'23514'});
});
await scenario('direct SQL aggregate shared resources and cross-mode cannot bypass guards',async f=>{
  const first=await f.book();await f.assess(first);await f.call(`/jobs/${first.id}/accept`,{token:f.d1.token,body:{}});
  const next=await f.book();await f.assess(next);await reserve(f,next,{},f.d2);
  await assert.rejects(f.db.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?",f.d2.user.id,next.id),{code:'23514'});
  const ride=await f.book({service:'ride',option:'1'});await f.assess(ride,{items:[],seats:1});
  const d=await f.db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',f.d2.user.id);await f.db.run('UPDATE driver_eligibility SET enrolled=0 WHERE driver_id=?',d.driver_id);
  await assert.rejects(f.db.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?",f.d2.user.id,ride.id),{code:'23514'});
});









await scenario('direct SQL canonical control succeeds while concurrent shared final-capacity claim has one winner',async f=>{
  const orders=[await f.book(),await f.book()];for(const order of orders)await f.assess(order);
  await reserve(f,orders[0]);await reserve(f,orders[1],{},f.d2);
  const results=await Promise.allSettled(orders.map((o,i)=>f.db.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?",[f.d1,f.d2][i].user.id,o.id)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'valid canonical direct assignment succeeds');
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'23514');
  assert.equal((await f.db.one("SELECT count(*) n FROM orders WHERE status='assigned'")).n,1);
});
if(failures.length)throw new AggregateError(failures,'WP05 review regression failures');
console.log(`WP05 review regressions: ${scenarios} scenarios passed`);
