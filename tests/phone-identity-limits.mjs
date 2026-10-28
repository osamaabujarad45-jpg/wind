import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './phone-identity-support.mjs';
const f=await fixture('phone_limits');
const {db,call,other,customer}=f;
try {
  await f.map(customer);const first=await f.issue();await f.delivered(first);
  await call('/me/phone/challenges',{token:customer.token,body:{commandId:randomUUID(),deviceId:customer.deviceId,phone:customer.phone,countryContext:'PS',purpose:'verify',expectedRevision:1},expect:429});
  assert.equal((await db.one('SELECT count(*) n FROM phone_challenges WHERE delivery_state<>?', 'suppressed')).n,1,'cooldown checked before provider reservation');
  for(let i=0;i<2;i++) {
    await db.run('UPDATE phone_challenges SET resend_at=? WHERE canonical_group=?',Date.now()-1,'+970'+customer.phone.slice(1));
    // Suppressed requests also consume the shared rolling request allowance.
    const response=await fetch(f.a.base+'/me/phone/challenges',{method:'POST',headers:{Authorization:`Bearer ${customer.token}`,'Content-Type':'application/json'},body:JSON.stringify({commandId:randomUUID(),deviceId:customer.deviceId,phone:customer.phone,countryContext:'PS',purpose:'verify',expectedRevision:1})});
    if(i===0)assert.equal(response.status,200);else assert.equal(response.status,429);
  }
  const daily=await f.account();await f.map(daily);
  for(let i=0;i<10;i++) {
    const c=await f.issue(daily);await f.delivered(c);
    await db.run('UPDATE phone_challenges SET created_at=created_at-900001,resend_at=0 WHERE canonical_group=?','+970'+daily.phone.slice(1));
  }
  await call('/me/phone/challenges',{token:daily.token,body:{commandId:randomUUID(),deviceId:daily.deviceId,phone:daily.phone,countryContext:'PS',purpose:'verify',expectedRevision:1},expect:429});
  const sharedDevice=randomUUID();
  for(let i=0;i<4;i++) {
    const user=await f.account();await f.map(user);
    const response=await fetch(f.a.base+'/me/phone/challenges',{method:'POST',headers:{Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'},body:JSON.stringify({commandId:randomUUID(),deviceId:sharedDevice,phone:user.phone,countryContext:'PS',purpose:'verify',expectedRevision:1})});
    assert.equal(response.status,i<3?200:429,'device rolling cap spans different phones');
  }
  const publicIssue=phone=>call('/auth/phone/recovery/challenges',{body:{commandId:randomUUID(),deviceId:randomUUID(),phone,countryContext:'PS'}});
  // Same generic request response for unknown, known, cooldown and failed provider states.
  const verified=await f.account();await f.verify(verified);await f.age('+970'+verified.phone.slice(1));
  const known=await publicIssue(verified.phone),missing=await publicIssue('0598888999'),cooldown=await publicIssue(verified.phone);
  for(const r of [known,missing,cooldown])assert.deepEqual(Object.keys(r).sort(),['accountStateConcealed','challengeId','expiresAt','resendAfterSeconds','state'].sort());
  assert.equal(known.state,'request_recorded');assert.equal(missing.state,known.state);assert.equal(cooldown.state,known.state);
  await f.delivered(known);
  // More than30 requests behind one address cause review, never an address-only hard denial.
  for(let i=0;i<31;i++)await publicIssue('0598888000');
  assert.ok((await db.one("SELECT count(*) n FROM phone_audit WHERE action='ip_review_signal'")).n>=1);
  const nat=await f.account();await f.map(nat);const natChallenge=await f.issue(nat);assert.ok(await f.delivered(natChallenge),'new legitimate phone/device behind same NAT remains eligible');
  // Reserve final provider-wide unit under one lock, across two actual API processes.
  const racers=await Promise.all([f.account(),f.account()]);for(const user of racers)await f.map(user);
  await f.waitFor(async()=>!(await db.one("SELECT 1 FROM phone_challenges WHERE delivery_state IN('prepared','requested') LIMIT 1")),'prior sends finish');
  await db.run('UPDATE phone_provider_budget SET reserved_messages=999,reserved_minor=9990');
  const responses=await Promise.all([f.a,f.b].map((server,i)=>fetch(server.base+'/me/phone/challenges',{method:'POST',headers:{Authorization:`Bearer ${racers[i].token}`,'Content-Type':'application/json'},
    body:JSON.stringify({commandId:randomUUID(),deviceId:racers[i].deviceId,phone:racers[i].phone,countryContext:'PS',purpose:'verify',expectedRevision:1})})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,503]);
  const budget=await db.one('SELECT * FROM phone_provider_budget');assert.equal(budget.reserved_messages,1000);assert.equal(budget.reserved_minor,10000);
  const capped=await publicIssue('0598888998');assert.deepEqual(Object.keys(capped).sort(),Object.keys(missing).sort());assert.equal(capped.state,'request_recorded');
  console.log('WP06 limits:45s cooldown, rolling phone/device3per15m and10/day, generic public existence/cooldown/budget states, IP review without NATblock, two-API final provider budget race passed');
}finally{await f.close();}
