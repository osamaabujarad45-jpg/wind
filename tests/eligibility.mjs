import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './eligibility-support.mjs';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
const f=await fixture('eligibility');
const {db,call,d1,admin}=f;
try {
  await f.setupCoverage();await f.reviewDriver();
  const order=await f.book();await f.assess(order);
  const activate=()=>call('/driver/eligibility/activate',{token:d1.token,body:{vehicleId:f.vehicle.id,expectedRevision:999},expect:409});
  await activate();
  let d=await db.one('SELECT revision FROM driver_eligibility WHERE driver_id=?',d1.user.id);
  assert.equal((await call('/driver/eligibility/activate',{token:d1.token,body:{vehicleId:f.vehicle.id,expectedRevision:d.revision},expect:409})).error,'driver_document_invalid');
  await f.check('driver_license',{driverId:d1.user.id},{outcome:'invalid'});
  assert.equal((await call(`/jobs/${order.id}/accept`,{token:d1.token,body:{capacityProtocol:1,expectedRequirementsRevision:1},expect:409})).error,'measured_cohort_required');
  await f.check('driver_license',{driverId:d1.user.id},{validFrom:f.now-10000,validUntil:f.now-1});
  d=await db.one('SELECT revision FROM driver_eligibility WHERE driver_id=?',d1.user.id);
  assert.equal((await call('/driver/eligibility/activate',{token:d1.token,body:{vehicleId:f.vehicle.id,expectedRevision:d.revision},expect:409})).error,'driver_document_invalid');
  await f.verify();
  await call('/admin/eligibility/checks',{token:admin.token,body:{...f.evidence,driverId:d1.user.id,kind:'driver_license',outcome:'approved',validFrom:f.now,validUntil:f.until,method:'manual_in_person',issuer:'Synthetic',identityScan:'should never be accepted'},expect:400});
  const noLoad=await f.book();assert.equal((await call(`/jobs/${noLoad.id}/accept`,{token:d1.token,body:{},expect:409})).error,'measured_requirements_missing');
  // A newer failed review overrides an older approved license without touching custody.
  await f.check('driver_license',{driverId:d1.user.id},{outcome:'rejected'});
  assert.equal((await call(`/jobs/${order.id}/accept`,{token:d1.token,body:{},expect:409})).error,'driver_document_invalid');
  await f.check('driver_license',{driverId:d1.user.id});
  // Existing negotiated offer TTL remains ten minutes, while new measured evidence revisions fence acceptance.
  const freight=await f.book({service:'ride',option:'1',pricing:'smart'});await f.assess(freight,{items:[],seats:1});
  const price=(await db.one('SELECT price FROM orders WHERE id=?',freight.id)).price;
  await call(`/jobs/${freight.id}/offer`,{token:d1.token,body:{price}});
  const offer=await db.one('SELECT * FROM eligibility_offers WHERE order_id=?',freight.id);
  const edited=await call(`/admin/eligibility/vehicles/${f.vehicle.id}`,{token:admin.token,method:'PATCH',body:{...f.vehicleBody,...f.evidence,expectedRevision:f.vehicle.revision,seats:3}});
  for(const kind of ['vehicle_registration','vehicle_inspection'])await f.check(kind,{vehicleId:f.vehicle.id});
  await call(`/jobs/${freight.id}/offer`,{token:d1.token,body:{price:0},expect:400});
  assert.deepEqual(await db.one('SELECT * FROM eligibility_offers WHERE order_id=?',freight.id),offer,'invalid offer must not refresh a stale evidence snapshot');
  assert.equal((await call(`/orders/${freight.id}/offers/${d1.user.id}/accept`,{token:f.customer.token,body:{},expect:409})).error,'eligibility_changed');
  assert.equal(offer.vehicle_revision+1,edited.revision);
  await f.approach(freight);
  await call(`/jobs/${freight.id}/offer`,{token:d1.token,body:{price}});
  await db.run('UPDATE order_offers SET created_at=? WHERE order_id=?',Date.now()-9*60000,freight.id);
  assert.equal((await call(`/orders/${freight.id}/offers/${d1.user.id}/accept`,{token:f.customer.token,body:{}})).status,'assigned','ten-minute negotiated window preserved');
  // Read-only self view does not advertise SQLite implementation of measured eligibility.
  const dir=await mkdtemp(join(tmpdir(),'fastship-wp05-sqlite-')),sqlite=await startApiProcess({DB_PATH:join(dir,'legacy.sqlite')});
  try {
    const sc=apiCaller(()=>sqlite.base),sqliteDb=new DatabaseSync(join(dir,'legacy.sqlite')),salt=randomBytes(16).toString('hex');
    sqliteDb.prepare('INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,?,?,?,?,?,?)').run('0598800101','Synthetic',`${salt}:${scryptSync('Synthetic-password',salt,32).toString('hex')}`,'driver','active','car',Date.now());sqliteDb.close();
    const driver=await sc('/auth/login',{body:{phone:'0598800101',password:'Synthetic-password'}});
    const view=await sc('/driver/eligibility',{token:driver.token});assert.equal(view.available,false);assert.equal(view.defaults.legacyCapacityMeasured,false);
    await sc('/driver/eligibility/activate',{token:driver.token,body:{vehicleId:1,expectedRevision:1},expect:409});
  }finally{await sqlite.stop();}
  console.log('WP05 eligibility: separate approval/documents, latest invalid/expired evidence, no scan ingestion, missing measurements, vehicle edit fences and legacy ten-minute offers, SQLite fail-closed passed');
} finally {await f.close();}

