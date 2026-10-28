import assert from 'node:assert/strict';
import { fixture,polygon,pickup,dropoff } from './eligibility-support.mjs';
const f=await fixture('coverage');
const {db,call,admin,d1,customer,post}=f;
try {
  assert.equal((await db.one('SELECT count(*) n FROM service_areas')).n,0,'no fabricated legal seed');
  await post('',{expectedRevision:1,activated:true},409);
  await call('/admin/eligibility',{token:customer.token,expect:403});
  await call('/admin/eligibility/areas',{token:customer.token,body:{},expect:403});
  await call('/admin/eligibility',{expect:401});
  const before=(await db.one('SELECT revision FROM eligibility_policy')).revision;
  await post('/areas',{...f.common,key:'invalid',geometry:{type:'Polygon',coordinates:[[[35.19,31.89],[35.21,31.91],[35.19,31.91],[35.21,31.89],[35.19,31.89]]]}},400);
  assert.equal((await db.one('SELECT revision FROM eligibility_policy')).revision,before,'invalid geometry rolls back full configuration action');
  const matrix=await f.setupCoverage(['synthetic_permit']);
  await f.verify();
  const order=await f.book();await f.assess(order);
  assert.equal((await call(`/jobs/${order.id}/accept`,{token:d1.token,body:{capacityProtocol:1,expectedRequirementsRevision:1},expect:409})).error,'permit_missing');
  await f.check('permit',{driverId:d1.user.id},{permitKey:'synthetic_permit'});
  const accepted=await call(`/jobs/${order.id}/accept`,{token:d1.token,body:{capacityProtocol:1,expectedRequirementsRevision:1}});
  assert.equal(accepted.status,'assigned','point on polygon boundary uses ST_Covers');
  // Reverse geometry is covered by the same corridor, but the direction is NOT authorized.
  const reverse=await f.book({pickupCity:'nablus',dropoffCity:'ramallah',pickupPoint:{longitude:dropoff[0],latitude:dropoff[1]},dropoffPoint:{longitude:pickup[0],latitude:pickup[1]}});
  await f.assess(reverse,{items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}],route:{type:'LineString',coordinates:[dropoff,pickup]}});
  assert.equal((await call(`/jobs/${reverse.id}/accept`,{token:d1.token,body:{},expect:409})).error,'route_not_permitted');
  const outside=await f.book({pickupPoint:{longitude:35.1899,latitude:31.9}});
  await f.assess(outside,{items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}],route:{type:'LineString',coordinates:[[35.1899,31.9],dropoff]}});
  assert.equal((await call(`/jobs/${outside.id}/accept`,{token:d1.token,body:{},expect:409})).error,'route_not_permitted');
  // Whole line must fit; matching endpoints do not authorize a route exiting its corridor.
  const detour=await f.book();await f.assess(detour,{items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}],route:{type:'LineString',coordinates:[pickup,[35.3,32],dropoff]}});
  assert.equal((await call(`/jobs/${detour.id}/accept`,{token:d1.token,body:{},expect:409})).error,'route_not_permitted');
  const revised=await post('/areas',{...f.common,key:'synthetic_from',state:'suspended',geometry:polygon(35.19,31.89,35.21,31.91)});
  assert.equal(revised.version,2);
  assert.equal((await db.one('SELECT activated FROM eligibility_policy')).activated,0,'coverage edit closes measured activation');
  // Even after explicit policy review, superseded area IDs cannot grant authorization.
  await f.activatePolicy();
  const blocked=await f.book();await f.assess(blocked,{items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}]});
  assert.equal((await call(`/jobs/${blocked.id}/accept`,{token:d1.token,body:{},expect:409})).error,'route_not_permitted');
  assert.ok(matrix.from.id);
  assert.equal((await db.one("SELECT count(*) n FROM eligibility_audit WHERE action='area_version_created'")).n,3);
  console.log('WP05 coverage: empty legal seeds, guards, invalid polygons, exact boundary, directed route, full corridor, permit and revision gates passed');
} finally {await f.close();}

