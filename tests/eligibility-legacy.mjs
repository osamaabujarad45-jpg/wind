import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
const f=await fixture('legacy');
const {db,call,d1,d2}=f;
try {
  await f.setupCoverage();
  // Installed acceptance with no enrollment/requirements remains explicit compatibility mode.
  const legacy=await f.book();await call(`/jobs/${legacy.id}/accept`,{token:d1.token,body:{}});
  for(const expectedStatus of ['assigned','at_pickup'])await call(`/orders/${legacy.id}/advance`,{token:d1.token,body:{requestId:randomUUID(),expectedStatus}});
  await call(`/orders/${legacy.id}/advance`,{token:d1.token,body:{requestId:randomUUID(),expectedStatus:'in_transit',code:'invalid'},expect:400});
  const before=await db.one('SELECT * FROM orders WHERE id=?',legacy.id),proof=await db.one('SELECT * FROM proof_attempts WHERE order_id=?',legacy.id),cash=await db.all('SELECT * FROM cash_entries');
  await f.reviewDriver();await f.check('driver_license',{driverId:d1.user.id});
  for(const kind of ['vehicle_registration','vehicle_inspection'])await f.check(kind,{vehicleId:f.vehicle.id});
  assert.equal((await db.one('SELECT inspection_required FROM vehicles WHERE id=?',f.vehicle.id)).inspection_required,1,'document approval cannot fabricate unknown physical load');
  let d=await db.one('SELECT revision FROM driver_eligibility WHERE driver_id=?',d1.user.id);
  assert.equal((await call('/driver/eligibility/activate',{token:d1.token,body:{vehicleId:f.vehicle.id,expectedRevision:d.revision},expect:409})).error,'legacy_load_inspection_required');
  const candidate=await f.book();await f.assess(candidate);
  assert.equal((await call(`/jobs/${candidate.id}/accept`,{token:d1.token,body:{capacityProtocol:1,expectedRequirementsRevision:1},expect:409})).error,'measured_cohort_required');
  assert.deepEqual(await db.one('SELECT * FROM orders WHERE id=?',legacy.id),before,'enrollment failure preserves custody and all order fields');
  assert.deepEqual(await db.one('SELECT * FROM proof_attempts WHERE order_id=?',legacy.id),proof);assert.deepEqual(await db.all('SELECT * FROM cash_entries'),cash);
  // Inspect retained over-capacity custody in place. Never shrink/drop it to make a constraint pass.
  await f.assess(legacy,{items:[{count:1,gramsEach:11000,lengthMm:100,widthMm:100,heightMm:100}]});
  assert.equal((await db.one('SELECT grams,evidence_kind FROM capacity_reservations WHERE order_id=?',legacy.id)).grams,11000);
  assert.equal((await db.one('SELECT evidence_kind FROM capacity_reservations WHERE order_id=?',legacy.id)).evidence_kind,'legacy_inspection');
  await f.check('vehicle_inspection',{vehicleId:f.vehicle.id});await f.enroll();
  assert.equal((await call(`/jobs/${candidate.id}/accept`,{token:d1.token,body:{},expect:409})).error,'measured_capacity_exceeded','known retained overload blocks insertion');
  // The same physical overload is visible to the other driver, not just the original custodian.
  await f.verify(d2);
  assert.equal((await call(`/jobs/${candidate.id}/accept`,{token:d2.token,body:{},expect:409})).error,'measured_capacity_exceeded');
  assert.deepEqual(await db.one('SELECT * FROM orders WHERE id=?',legacy.id),before);
  assert.deepEqual(await db.one('SELECT * FROM proof_attempts WHERE order_id=?',legacy.id),proof);
  // Explicit expiry blocks new work without ending current proof/return authority.
  d=await db.one('SELECT revision FROM driver_eligibility WHERE driver_id=?',d1.user.id);
  await f.post(`/drivers/${d1.user.id}`,{vehicleId:f.vehicle.id,state:'expired',validUntil:f.now-1,expectedRevision:d.revision});
  assert.equal((await call(`/jobs/${candidate.id}/accept`,{token:d1.token,body:{},expect:409})).error,'driver_ineligible');
  const recover=async(action)=>f.post(`/orders/${legacy.id}/recovery`,{action,expectedVersion:(await db.one('SELECT version FROM orders WHERE id=?',legacy.id)).version});
  await recover('return');await recover('confirm_return');
  const after=await db.one('SELECT * FROM orders WHERE id=?',legacy.id);
  assert.equal(after.id,before.id);assert.equal(after.driver_id,before.driver_id);assert.equal(after.status,'returned');assert.equal(after.handover_code,before.handover_code);assert.equal(after.commission,before.commission);assert.equal(after.price,before.price);assert.ok(after.completed_at);
  assert.deepEqual(await db.all('SELECT * FROM cash_entries'),cash);
  assert.equal((await db.one('SELECT count(*) n FROM capacity_reservations WHERE order_id=?',legacy.id)).n,1);
  console.log('WP05 legacy: unknown load inspection gate, custody/proof/cash preserved, in-place measured overload, shared vehicle accounting, expiry and audited same-order return passed');
}finally{await f.close();}

