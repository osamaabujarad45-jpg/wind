import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {fixture} from './phone-identity-support.mjs';
const f=await fixture('sec_admit');
try {
  const bucket=createHmac('sha256',Buffer.from(f.secret,'base64')).update(JSON.stringify(['public_challenge_global'])).digest('hex');
  const now=Date.now(),hour=3600000,day=86400000;
  for(const [period,count] of [[hour,999],[day,999]])await f.db.run('INSERT INTO phone_rate_windows(bucket_hash,period_ms,window_start,count) VALUES(?,?,?,?)',bucket,period,Math.floor(now/period)*period,count);
  const issue=(client,i)=>client('/auth/phone/recovery/challenges',{body:{commandId:randomUUID(),deviceId:randomUUID(),phone:`059${String(2000000+i).padStart(7,'0')}`,countryContext:'PS'}});
  const before=(await f.db.one('SELECT count(*) n FROM phone_challenges')).n;
  const first=await Promise.all([issue(f.call,1),issue(f.other,2)]);
  for(const response of first)assert.deepEqual(Object.keys(response).sort(),['accountStateConcealed','challengeId','expiresAt','resendAfterSeconds','state'].sort());
  assert.equal((await f.db.one('SELECT count(*) n FROM phone_challenges')).n-before,1,'two processes admit at most one final global slot');
  const receiptCount=(await f.db.one('SELECT count(*) n FROM phone_command_results')).n;
  for(let i=3;i<103;i++)await issue(f.call,i);
  assert.equal((await f.db.one('SELECT count(*) n FROM phone_challenges')).n-before,1);
  assert.equal((await f.db.one('SELECT count(*) n FROM phone_command_results')).n,receiptCount,'over-cap requests create no receipts');
  assert.equal(f.state.messages.length,0,'unknown/over-cap requests never spend provider budget');
  console.log('Review security: atomic global public admission and bounded over-cap writes passed');
}finally{await f.close();}

