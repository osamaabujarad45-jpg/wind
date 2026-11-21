import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
const f=await fixture('capacity');
const {db,call,other,d1,d2,admin}=f;
const tiny={items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1,heightMm:1}]};
try {
  await f.setupCoverage();await f.verify();await f.verify(d2);
  const orders=await Promise.all([f.book(),f.book()]);for(const order of orders)await f.assess(order);
  const results=await Promise.all([f.a,f.b].map((server,i)=>fetch(server.base+`/jobs/${orders[i].id}/accept`,{method:'POST',headers:{Authorization:`Bearer ${[d1,d2][i].token}`,'Content-Type':'application/json'},body:JSON.stringify({capacityProtocol:1,expectedRequirementsRevision:1})})));
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409],'one final-capacity winner across two actual API processes');
  assert.equal((await results.find(x=>x.status===409).json()).error,'measured_capacity_exceeded');
  const assigned=await db.all("SELECT id,driver_id FROM orders WHERE status='assigned'");assert.equal(assigned.length,1);
  const winner=assigned[0],loser=orders.find(x=>x.id!==winner.id),loserDriver=winner.driver_id===d1.user.id?d2:d1;
  assert.equal((await call(`/jobs/${loser.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'measured_capacity_exceeded');
  assert.equal((await db.one(`SELECT sum(r.grams) total FROM capacity_reservations r JOIN orders o ON o.id=r.order_id WHERE o.status='assigned'`)).total,6000,'planned pickup already reserves full load');
  assert.equal((await db.one('SELECT count(*) n FROM capacity_stops WHERE order_id=?',winner.id)).n,2);
  const ride=await f.book({service:'ride',option:'1'});await f.assess(ride,{items:[],seats:1});
  assert.equal((await call(`/jobs/${ride.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'shared_vehicle_busy','two drivers cannot cross modes on one physical vehicle');
  const oversized=await f.book();await f.assess(oversized,{items:[{count:1,gramsEach:1,lengthMm:1,widthMm:1001,heightMm:1}]});
  assert.equal((await call(`/jobs/${oversized.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'dimensions_unavailable','rotation is not inferred');
  const slices=await f.book();await f.assess(slices,{items:[{count:2,gramsEach:1,lengthMm:1000,widthMm:1,heightMm:1}]});
  assert.equal((await call(`/jobs/${slices.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'dimensions_unavailable','low volume cannot prove multi-piece packing');
  const equipment=await f.book();await f.assess(equipment,{...tiny,equipment:['refrigeration']});
  assert.equal((await call(`/jobs/${equipment.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'equipment_unavailable');
  const volume=await f.book();await f.assess(volume,{items:[{count:1,gramsEach:1,lengthMm:1100,widthMm:1000,heightMm:1000}]});
  assert.equal((await call(`/jobs/${volume.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'measured_capacity_exceeded');
  const late=await f.book();await f.assess(late,{...tiny,pickupAfter:f.now-1000,pickupBefore:f.now+100,dropoffBefore:f.until-1000});
  assert.equal((await call(`/jobs/${late.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'stop_window_infeasible');
  // Suspended approval blocks future work but preserves live custody, proof attempts and cash.
  const driver=winner.driver_id===d1.user.id?d1:d2;
  await call(`/orders/${winner.id}/advance`,{token:driver.token,body:{requestId:randomUUID(),expectedStatus:'assigned'}});await call(`/orders/${winner.id}/advance`,{token:driver.token,body:{requestId:randomUUID(),expectedStatus:'at_pickup'}});
  const snapshot=await db.one('SELECT * FROM orders WHERE id=?',winner.id);
  await db.run('INSERT INTO proof_attempts(order_id,failures) VALUES(?,?)',winner.id,2);
  await f.reviewDriver(driver,'suspended');
  const newWork=await f.book();await f.assess(newWork,tiny);
  assert.equal((await call(`/jobs/${newWork.id}/accept`,{token:driver.token,body:{},expect:409})).error,'driver_ineligible');
  assert.equal((await db.one('SELECT status FROM orders WHERE id=?',winner.id)).status,'in_transit');
  const recover=async(action,carrier='support')=>{const version=(await db.one('SELECT version FROM orders WHERE id=?',winner.id)).version;return await f.post(`/orders/${winner.id}/recovery`,{action,...(action==='confirm_return'&&{carrier}),expectedVersion:version});};
  await recover('hold');assert.equal((await db.one('SELECT failures FROM proof_attempts WHERE order_id=?',winner.id)).failures,2);
  await recover('return');const returning=await db.one('SELECT * FROM orders WHERE id=?',winner.id);
  assert.equal(returning.driver_id,snapshot.driver_id);assert.equal(returning.price,snapshot.price);assert.ok(returning.return_code);
  assert.equal((await call(`/orders/${winner.id}`,{token:f.customer.token})).returnCode,returning.return_code);
  // Support took the goods in this recovery's return: neither the captain nor staff can be named as the office carrier (G-PG).
  for(const wrong of ['captain','staff']){const version=(await db.one('SELECT version FROM orders WHERE id=?',winner.id)).version;await f.post(`/orders/${winner.id}/recovery`,{action:'confirm_return',carrier:wrong,expectedVersion:version},409);}
  await recover('confirm_return');const returned=await db.one('SELECT * FROM orders WHERE id=?',winner.id);
  assert.equal(returned.status,'returned');assert.ok(returned.completed_at);assert.equal(Number(returned.commission),0,'a recovered return owes no commission (SRS DRV-17)');
  assert.equal(await db.one('SELECT 1 FROM ledger_journals WHERE business_ref=?',`order:${winner.id}:commission`),undefined,'the cash screen and the ledger agree on this return');
  assert.deepEqual(await db.all('SELECT amount_cents, recorded_by FROM cash_entries WHERE note=?', `DRV-17 trip pay order ${winner.id}`),
    [{amount_cents:-Math.round(Number(snapshot.price)*100),recorded_by:admin.user.id}], 'eligibility close pays only the trip so far');
  // Old eligibility closures only wrote ELIGIBILITY_CUSTODY_RECOVERY, never EXCEPTION_RESOLVED.
  await db.run("DELETE FROM security_events WHERE order_id = ? AND action = 'EXCEPTION_RESOLVED'", winner.id);
  const received = await call(`/admin/orders/${winner.id}/office`, { token: admin.token, body: { action: 'received', note: 'Received at Wind office' } });
  assert.equal(received.orderId, winner.id);
  assert.ok(received.office.until > received.office.receivedAt, 'eligibility confirmation opens SHIP-19 intake');
  for (const kind of ['decided','returned']) assert.ok(await db.one("SELECT 1 FROM domain_events WHERE order_id=? AND type='notification.requested' AND payload->>'kind'=?",winner.id,kind),kind+' reaches its party');
  assert.equal((await db.one('SELECT count(*) n FROM capacity_reservations WHERE order_id=?',winner.id)).n,1,'reservation history remains');
  assert.equal((await db.one("SELECT count(*) n FROM security_events WHERE order_id=? AND action='ELIGIBILITY_CUSTODY_RECOVERY'",winner.id)).n,3);

  // Using the eligibility close route does not make a captain-carried return a custody recovery.
  const officeReturn=await f.book();await f.assess(officeReturn,tiny);
  await call(`/jobs/${officeReturn.id}/accept`,{token:loserDriver.token,body:{}});
  for(const expectedStatus of ['assigned','at_pickup'])
    await call(`/orders/${officeReturn.id}/advance`,{token:loserDriver.token,body:{requestId:randomUUID(),expectedStatus}});
  await call(`/orders/${officeReturn.id}/exception`,{token:loserDriver.token,body:{requestId:randomUUID(),expectedStatus:'in_transit',reason:'absent'}});
  const returningToOffice=await call(`/admin/orders/${officeReturn.id}/resolve`,{token:admin.token,body:{action:'return',reason:'Captain carrying return to office'}});
  const {version}=await db.one('SELECT version FROM orders WHERE id=?',officeReturn.id);
  await f.post(`/orders/${officeReturn.id}/recovery`,{action:'confirm_return',expectedVersion:version},400); // the carrier is named
  await f.post(`/orders/${officeReturn.id}/recovery`,{action:'confirm_return',carrier:'captain',expectedVersion:version});
  assert.deepEqual(await db.all('SELECT amount_cents, recorded_by FROM cash_entries WHERE note=?',`DRV-17 trip pay order ${officeReturn.id}`),
    [{amount_cents:-3*Math.round(returningToOffice.price*100),recorded_by:admin.user.id}], 'office receipt pays the delivery, return and office legs');

  // Vacated shared vehicle no longer blocks a different eligible driver.
  await call(`/orders/${ride.id}/cancel`, {token:f.customer.token,body:{}});
  const seats=await f.book({service:'ride',option:'1'});await f.assess(seats,{items:[],seats:5});
  assert.equal((await call(`/jobs/${seats.id}/accept`,{token:loserDriver.token,body:{},expect:409})).error,'seats_unavailable');
  await f.assess(seats,{items:[],seats:1});
  assert.equal((await call(`/jobs/${seats.id}/accept`,{token:loserDriver.token,body:{}})).status,'assigned');
  console.log('WP05 capacity: two-process final-weight race, all planned stops, shared vehicle crossmode, fixed-axis packing/volume/equipment/windows/seats, suspension and audited custody return passed');
} finally {await f.close();}

