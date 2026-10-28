// A live reader on another PG connection must wake only after the location becomes visible.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshPostgres,selectRuntime } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';
const {schema,database}=await freshPostgres('livecommit');
selectRuntime(schema);
process.env.DB_PATH=join(await mkdtemp(join(tmpdir(),'wind-live-commit-')),'compat.sqlite');
process.env.WIND_ENABLED_SERVICES='parcel';
delete process.env.WIND_IDENTITY_MODE;
const {server,persistence,promote,shutdown}=await import('../server/main.ts');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const call=apiCaller(()=>`http://127.0.0.1:${server.address().port}/api`);
const originalExec=persistence.exec;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let release;
try {
  const admin=await call('/auth/register',{body:{phone:'0599890001',name:'Synthetic admin',password:'secret1'}});
  await promote('0599890001');
  const customer=await call('/auth/register',{body:{phone:'0599890002',name:'Synthetic customer',password:'secret1'}});
  const driver=await call('/auth/register',{body:{phone:'0599890003',name:'Synthetic driver',password:'secret1',role:'driver',vehicle:'car'}});
  await call(`/admin/users/${driver.user.id}/approve`,{token:admin.token,body:{}});
  const order=await call('/orders',{token:customer.token,body:{service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',
    shared:false,pickupNote:'Synthetic gate',dropoffNote:'Synthetic door',contact:'0599890002',detail:'Synthetic box',quotedPrice:20}});
  await call(`/jobs/${order.id}/accept`,{token:driver.token,body:{}});
  const fix={latitude:31.9601,longitude:35.2201,accuracy:5};
  assert.equal((await call('/location',{token:driver.token,body:fix})).accepted,true);
  // A second parcel in the same run must not inherit a fix recorded before its assignment.
  await delay(10);
  const second=await call('/orders',{token:customer.token,body:{service:'parcel',pickupCity:'ramallah',dropoffCity:'nablus',option:'small',
    shared:false,pickupNote:'Synthetic gate',dropoffNote:'Synthetic door',contact:'0599890002',detail:'Synthetic box',quotedPrice:20}});
  await call(`/jobs/${second.id}/accept`,{token:driver.token,body:{}});
  assert.equal((await call(`/orders/${second.id}`,{token:customer.token})).driverLocation,null,
    'a newly assigned parcel cannot see an earlier fix from the same driver');
  const before=(await call(`/orders/${order.id}`,{token:customer.token})).driverLocation;
  const live=call(`/orders/${order.id}/live?since=${before.updatedAt}`,{token:customer.token});
  await delay(100);
  let reached;
  const entered=new Promise(resolve=>{reached=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  let paused=false;
  persistence.exec=async function(command) {
    if (command==='COMMIT' && !paused) {paused=true;reached();await gate;}
    return originalExec.call(this,command);
  };
  const upload=call('/location',{token:driver.token,body:{...fix,latitude:31.9602}});
  await Promise.race([entered,delay(2000).then(()=>{throw new Error('GPS commit hook was not reached');})]);
  assert.equal(await Promise.race([live.then(()=> 'answered'),delay(100).then(()=> 'held')]),'held',
    'an uncommitted GPS write must not wake a reader into the old snapshot');
  release();
  assert.equal((await upload).accepted,true);
  const committed=(await live).driverLocation;
  assert.equal(committed.latitude,31.9602,'the wake observes committed GPS');
  assert.equal((await call(`/orders/${second.id}`,{token:customer.token})).driverLocation.latitude,31.9602);
  const afterRollback=call(`/orders/${order.id}/live?since=${committed.updatedAt}`,{token:customer.token});
  await delay(100);
  let rejectCommit=true;
  persistence.exec=async function(command) {
    if (command==='COMMIT' && rejectCommit) {rejectCommit=false;throw new Error('Synthetic GPS commit rejection');}
    return originalExec.call(this,command);
  };
  await call('/location',{token:driver.token,body:{...fix,latitude:31.9603},expect:500});
  assert.equal(await Promise.race([afterRollback.then(()=> 'answered'),delay(100).then(()=> 'held')]),'held',
    'rollback discards the wake as well as the GPS write');
  assert.equal((await call(`/orders/${order.id}`,{token:customer.token})).driverLocation.latitude,31.9602);
  persistence.exec=originalExec;
  assert.equal((await call('/location',{token:driver.token,body:{...fix,latitude:31.9604}})).accepted,true);
  assert.equal((await afterRollback).driverLocation.latitude,31.9604);
  // Authentication may have succeeded before a concurrent logout commits. The
  // upload must recheck the session after waiting for the revoking transaction.
  let logoutDeleted, commitLogout;
  const deleted=new Promise(resolve=>{logoutDeleted=resolve;});
  const logoutGate=new Promise(resolve=>{commitLogout=resolve;});
  const logout=database.scope(async()=>{
    await database.exec('BEGIN');
    await database.run('DELETE FROM sessions WHERE token_hash=?',createHash('sha256').update(driver.token).digest('hex'));
    logoutDeleted();
    await logoutGate;
    await database.exec('COMMIT');
  });
  await deleted;
  const late=call('/location',{token:driver.token,body:fix,expect:401});
  await delay(100);
  commitLogout();
  await logout;
  assert.equal((await late).error,'unauthorized');
  console.log('PG live map: paused COMMIT keeps waiter held; rollback discards GPS/wake; committed GPS wakes with the new pin');
} finally {
  release?.();persistence.exec=originalExec;
  await shutdown();await database.close();
}
