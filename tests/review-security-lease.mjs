import assert from 'node:assert/strict';
import { PhoneIdentity } from '../server/domain/phone-identity.ts';

// Exercise the detached callback fence without a provider or database connection.
let row={id:'synthetic',delivery_state:'prepared',send_lease_until:Date.now()+30000,actor_id:null,user_id:1,budget_day:1,budget_released:0};
let resume, started;
const startedPromise=new Promise(resolve=>{started=resolve;});
const pending=new Promise(resolve=>{resume=resolve;});
const writes=[];
const db={atomic:async(_ctx,fn)=>fn(),one:async sql=>sql.includes('phone_challenges')?{...row}:{},run:async(sql,...args)=>{
  writes.push(sql);
  if(sql.includes('SET send_owner='))row={...row,send_owner:args[0]};
  if(sql.includes("delivery_state='requested'"))row={...row,delivery_state:'requested',send_lease_until:args[1]};
}};
const service=new PhoneIdentity(db,()=>{},()=>'',()=>false);
service.authority=async()=>true;
service.provider={send:async(_phone,_code,_id,authorize)=>{
  assert.equal(await authorize(),true);
  assert.ok(row.send_lease_until-Date.now()>29000,'provider send owns a lease with adequate margin');
  started();await pending;return {state:'accepted',attempted:true};
}};
const dispatch=service.dispatch('synthetic','123456');
await startedPromise;
row={...row,delivery_state:'unknown',send_lease_until:null};
resume();await dispatch;
assert.equal(row.delivery_state,'unknown');
assert.equal(writes.filter(sql=>sql.includes('provider_status=')).length,0,'late callback cannot overwrite reconciliation');
console.log('Review security: send lease margin and late callback fence passed');
