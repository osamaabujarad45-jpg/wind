import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixture } from './eligibility-support.mjs';
import { acceptOffer, addDriver, assessRide, bookRide, myOffer } from './dispatch-support.mjs';
import { RideLifecycle } from '../server/domain/ride-lifecycle.ts';
const f=await fixture('journey',{WIND_DISPATCH_TEST_ONLY:'1',WIND_BOARDING_TEST_ONLY:'1'});
try {
  await f.setupCoverage();
  const who=await addDriver(f,{latitude:31.9,longitude:35.19}), order=await bookRide(f);
  await assessRide(f,order,[who.vehicle]);
  await f.call(`/orders/${order.id}/dispatch/retry`,{token:f.customer.token,body:{}});
  const offer=await myOffer(f,order.id,who.driver);
  const offered=await f.call(`/orders/${order.id}?journeyProtocol=1`,{token:who.driver.token});
  assert.equal(offered.journey.offer.acceptWindowSeconds,(offer.expiresAt-offer.issuedAt)/1000);
  assert.equal(offered.journey.offer.eta.accuracy,offer.etaEstimated?'low':'unknown');
  assert.equal('leaseNonce' in offered.journey.offer,false);
  const jobs=await f.call('/jobs?page=1&capacityProtocol=1&journeyProtocol=1',{token:who.driver.token});
  assert.equal(jobs.jobs.find(card=>card.id===order.id).journey.offer.offerId,offer.offerId,'paginated cards consume the same negotiated journey contract');
  await acceptOffer(f,order.id,who.driver,offer);
  const get=token=>f.call(`/orders/${order.id}?journeyProtocol=1&recoveryProtocol=1`,{token});
  const customer=await get(f.customer.token), challenge=customer.journey.boarding;
  assert.equal(challenge.shouldShow,true); assert.match(challenge.pin,/^\d{4}$/);
  assert.ok(challenge.pinIssuedAt); assert.ok(challenge.pinRevision>0);
  assert.equal((await get(who.driver.token)).journey.boarding.pin,undefined);
  assert.equal((await get(f.admin.token)).journey.boarding.pin,undefined);
  assert.equal('journey' in await f.call(`/orders/${order.id}`,{token:f.customer.token}),false);
  await f.call(`/orders/${order.id}/arrive`,{token:who.driver.token,body:{}});
  const arrived=await get(f.customer.token);
  assert.equal(arrived.journey.waiting.waitingEndsAt,arrived.ride.graceUntil);
  const advance=(code,revision,expect=200)=>f.call(`/orders/${order.id}/advance?journeyProtocol=1`,{token:who.driver.token,expect,
    body:{requestId:randomUUID(),expectedStatus:'at_pickup',code,expectedPinRevision:revision}});
  await f.call(`/orders/${order.id}/advance`,{token:who.driver.token,body:{requestId:randomUUID(),expectedStatus:'assigned'}});
  await advance(challenge.pin==='0000'?'0001':'0000',challenge.pinRevision,400);
  const service=new RideLifecycle(f.db,(status,message)=>{throw Object.assign(new Error(message),{status});});
  await f.db.atomic({purpose:'synthetic_same_assignment'},()=>service.ensureAssignment(order.id,who.driver.user.id,'dispatch'));
  assert.equal((await f.db.one('SELECT failures FROM ride_boarding_attempts WHERE order_id=?',order.id)).failures,1);
  const reset={reason:'Synthetic verified operator rotation',rotate:true,expectedAssignmentEpoch:customer.recovery.assignmentEpoch,expectedPinRevision:challenge.pinRevision};
  await f.call(`/admin/orders/${order.id}/boarding-reset`,{token:f.admin.token,body:reset,expect:409});
  await f.call(`/admin/orders/${order.id}/boarding-reset?journeyProtocol=1`,{token:f.admin.token,body:reset});
  const rotated=(await get(f.customer.token)).journey.boarding;
  assert.notEqual(rotated.pin,challenge.pin); assert.equal(rotated.pinRevision,challenge.pinRevision+1);
  await advance(challenge.pin,challenge.pinRevision,409);
  assert.equal((await f.db.one('SELECT failures FROM ride_boarding_attempts WHERE order_id=?',order.id)).failures,0,'old challenge cannot spend new attempts');
  const started=await advance(rotated.pin,rotated.pinRevision);
  assert.equal(started.status,'in_transit'); assert.equal(started.journey.boarding.isVerified,true);
  assert.equal(started.journey.boarding.pin,undefined); assert.equal(started.journey.waiting.state,'ended');
  await f.call(`/admin/orders/${order.id}/boarding-reset?journeyProtocol=1`,{token:f.admin.token,body:{...reset,expectedPinRevision:rotated.pinRevision},expect:409});
  const audit=await f.db.all("SELECT detail FROM security_events WHERE order_id=? AND action='BOARDING_RESET'",order.id);
  assert.ok(!JSON.stringify(audit).includes(rotated.pin));
  // Existing destination consent owns fare changes on PostgreSQL too.
  await f.call('/admin/settings',{token:f.admin.token,body:{rideBase:50}});
  const proposal=await f.call(`/orders/${order.id}/destination/quote`,{token:f.customer.token,body:{city:'hebron',note:'Synthetic accepted destination'}});
  await f.call(`/orders/${order.id}/destination/propose`,{token:f.customer.token,body:{id:proposal.id}});
  const decision={id:proposal.id,decision:'accept'};
  const changed=await f.call(`/orders/${order.id}/destination/decision?journeyProtocol=1`,{token:who.driver.token,body:decision});
  const fare=changed.journey.lastFareChange;
  assert.ok(fare); assert.equal(fare.changeId,proposal.id);
  await f.call(`/orders/${order.id}/destination/decision`,{token:who.driver.token,body:decision});
  const events=await f.db.all("SELECT * FROM domain_events WHERE order_id=? AND type='fare.changed'",order.id);
  assert.equal(events.length,1,'duplicate consent cannot append a second fare event');
  const oldFeed=await f.call(`/orders/${order.id}?protocol=1`,{token:f.customer.token});
  assert.equal(oldFeed.protocol.events.some(e=>e.type==='fare.changed'),false,'installed event family stays unchanged');
  const newFeed=await f.call(`/orders/${order.id}?protocol=1&journeyProtocol=1`,{token:f.customer.token});
  assert.equal(newFeed.protocol.events.filter(e=>e.type==='fare.changed').length,1);
  assert.equal(oldFeed.protocol.nextCursor,newFeed.protocol.nextCursor,'filtered events still advance the installed cursor');
  // A reassigned order must not leak the previous assignment's private fare history to the next driver.
  {
    const g=await fixture('reassign',{WIND_DISPATCH_TEST_ONLY:'1',WIND_BOARDING_TEST_ONLY:'1'});
    try {
      await g.setupCoverage();
      const first=await addDriver(g,{latitude:31.9005,longitude:35.195}), second=await addDriver(g,{latitude:31.91,longitude:35.20});
      const moved=await bookRide(g);
      await assessRide(g,moved,[first.vehicle,second.vehicle]);
      await g.call(`/orders/${moved.id}/dispatch/retry`,{token:g.customer.token,body:{}});
      // Whichever candidate the ranking offered first holds the first assignment; the other is the replacement.
      const candidates=[first,second], offers=await Promise.all(candidates.map(c=>myOffer(g,moved.id,c.driver)));
      const holder=offers.findIndex(Boolean);
      assert.ok(holder>=0,'dispatch offered the ride to one of the two candidate drivers');
      const [firstDriver,nextDriverAccount]=[candidates[holder],candidates[1-holder]];
      await acceptOffer(g,moved.id,firstDriver.driver,offers[holder]);
      await g.call('/admin/settings',{token:g.admin.token,body:{rideBase:80}});
      const quote=await g.call(`/orders/${moved.id}/destination/quote`,{token:g.customer.token,body:{city:'nablus',note:'Synthetic changed destination',point:{latitude:32.22,longitude:35.26}}});
      await g.call(`/orders/${moved.id}/destination/propose`,{token:g.customer.token,body:{id:quote.id}});
      await g.call(`/orders/${moved.id}/destination/decision`,{token:firstDriver.driver.token,body:{id:quote.id,decision:'accept'}});
      assert.equal((await g.db.all("SELECT 1 FROM domain_events WHERE order_id=? AND type='fare.changed'",moved.id)).length,1,'the first assignment recorded one fare change');
      await g.call(`/orders/${moved.id}/release`,{token:firstDriver.driver.token,body:{}});
      // Use the measured negotiated path to isolate event visibility from dispatch ranking.
      const replacementPrice=Number((await g.db.one('SELECT price FROM orders WHERE id=?',moved.id)).price);
      await g.assess(moved,{items:[],seats:1,route:{type:'LineString',coordinates:[[35.19,31.9],[35.26,32.22]]},approach:false});
      await g.approach(moved,{vehicleId:nextDriverAccount.vehicle.id});
      const requirementsRevision=Number((await g.db.one('SELECT revision FROM order_requirements WHERE order_id=?',moved.id)).revision);
      await g.call(`/jobs/${moved.id}/offer`,{token:nextDriverAccount.driver.token,body:{price:replacementPrice,capacityProtocol:1,expectedRequirementsRevision:requirementsRevision}});
      await g.call(`/orders/${moved.id}/offers/${nextDriverAccount.driver.user.id}/accept`,{token:g.customer.token,body:{capacityProtocol:1,expectedRequirementsRevision:requirementsRevision}});
      const feed=token=>g.call(`/orders/${moved.id}?protocol=1&journeyProtocol=1`,{token});
      const nextDriver=await feed(nextDriverAccount.driver.token), passenger=await feed(g.customer.token);
      assert.equal(nextDriver.driverId,nextDriverAccount.driver.user.id,'the replacement driver now holds the order');
      assert.equal(nextDriver.protocol.events.some(e=>e.type==='fare.changed'),false,'the new driver must not receive the previous assignment fare.changed event');
      assert.ok(nextDriver.protocol.events.length>0,'the new driver still receives the shared journal');
      assert.equal(nextDriver.protocol.nextCursor,passenger.protocol.nextCursor,'filtering the event still advances the cursor');
      assert.equal(passenger.protocol.events.filter(e=>e.type==='fare.changed').length,1,'the customer keeps the fare history of their own order');
    } finally {await g.close();}
  }
  await f.db.run(readFileSync(new URL('../server/db/postgres-boarding-metadata.sql',import.meta.url),'utf8'));
  assert.equal((await get(f.customer.token)).journey.boarding.pinRevision,rotated.pinRevision);
  await f.db.run('DELETE FROM schema_migrations WHERE version=29');
  assert.equal((await get(f.customer.token)).journey.boarding,undefined,'partial migration omits unsupported metadata');
  console.log('PG journey offer, PIN privacy/rotation/revision, verification, waiting and rolling migration passed');
} finally {await f.close();}
