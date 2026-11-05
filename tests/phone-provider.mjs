import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID,randomBytes,scryptSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { OoredooCommunication,phoneConfig } from '../server/domain/phone-provider.ts';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
const env={NODE_ENV:'test',WIND_POSTGRES_TEST_ONLY:'1',WIND_POSTGRES_TEST_SCHEMA:'wp03_phone_provider',WIND_DATABASE_URL:process.env.WIND_TEST_DATABASE_URL??'postgresql://fastship_test@127.0.0.1:55473/fastship_test',
  WIND_PHONE_ENABLED:'1',WIND_PHONE_PROVIDER:'ooredoo_communication',WIND_PHONE_HMAC_KEY:Buffer.alloc(32,17).toString('base64'),WIND_OOREDOO_CLIENT_ID:'SYNTHETIC_CLIENT',WIND_OOREDOO_CLIENT_SECRET:'SYNTHETIC_SECRET',
  WIND_OOREDOO_SENDER:'Synthetic',WIND_OOREDOO_COUNTRY_CODE:'TEST',WIND_PHONE_APPROVED_PREFIXES:'+97056,+97059,+97256,+97259',WIND_PHONE_PROVIDER_EVIDENCE:'synthetic:case',
  WIND_PHONE_DAILY_MESSAGE_LIMIT:'100',WIND_PHONE_DAILY_BUDGET_MINOR:'1000',WIND_PHONE_SMS_MAX_COST_MINOR:'10'};
Object.assign(process.env,{NODE_ENV:'test',WIND_POSTGRES_TEST_SCHEMA:'wp03_phone_provider',WIND_POSTGRES_TEST_ONLY:'1',WIND_DATABASE_URL:env.WIND_DATABASE_URL});
assert.equal(phoneConfig({}).enabled,false);
const config=phoneConfig(env);assert.equal(config.enabled,true);
for(const key of ['WIND_PHONE_TEST_PROVIDER_URL','WIND_OTP_BYPASS','WIND_PHONE_TEST_CODE'])assert.throws(()=>phoneConfig({...env,NODE_ENV:'production',[key]:key.endsWith('URL')?'http://127.0.0.1:1/':'1'}),/rejects test/);
assert.throws(()=>phoneConfig({...env,NODE_ENV:'development',WIND_PHONE_TEST_PROVIDER_URL:'http://127.0.0.1:1/'}),/isolated/);
assert.throws(()=>phoneConfig({...env,WIND_PHONE_TEST_PROVIDER_URL:'https://example.invalid/'}),/isolated/);
let tokenCalls=0,sendCalls=0;
const transport=async(url,options)=>{
  assert.equal(options.redirect,'error');assert.ok(options.signal);
  if(url.endsWith('/token')) {
    tokenCalls++;assert.equal(options.headers.client_id,'SYNTHETIC_CLIENT');assert.equal(options.headers.client_secret,'SYNTHETIC_SECRET');assert.equal(options.body,'grant_type=client_credentials');
    await new Promise(resolve=>setTimeout(resolve,10));return Response.json({access_token:`synthetic-${tokenCalls}`,token_type:'Bearer',expires_in:600});
  }
  sendCalls++;assert.equal(url,'https://api.ooredoo.com/tmf-api/communicationManagement/v4/communicationMessage');
  assert.equal(options.headers.countryCode,'TEST');assert.match(options.headers.transactionId,/^synthetic-/);
  const body=JSON.parse(options.body);assert.equal(body.messageType,'sms');assert.deepEqual(body.receiver,[{phoneNumber:'+970599000000'}]);assert.deepEqual(body.sender,{name:'Synthetic'});assert.match(body.content,/123456/);
  return Response.json({messageType:'sms',content:body.content,state:'completed'},{status:201});
};
const provider=new OoredooCommunication(config,transport);
const results=await Promise.all(Array.from({length:10},(_,i)=>provider.send('+970599000000','123456',`synthetic-${i}`,async()=>true)));
assert.equal(tokenCalls,1,'concurrent refresh coalesced');assert.equal(sendCalls,10);assert.ok(results.every(r=>r.state==='accepted'),'completed provider record is accepted, never delivered');
let oauth=0,sends=0;
const refreshing=new OoredooCommunication(config,async(url,options)=>{
  if(url.endsWith('/token'))return Response.json({access_token:`token-${++oauth}`,token_type:'Bearer',expires_in:600});
  sends++;return sends===1?new Response(null,{status:401}):Response.json({messageType:'sms',content:'Synthetic'},{status:201});
});
assert.equal((await refreshing.send('+970599000000','123456','synthetic-401',async()=>true)).state,'accepted');assert.equal(oauth,2);assert.equal(sends,2);
for(const mode of ['network','503','invalid201']) {
  let sent=0;
  const p=new OoredooCommunication(config,async(url)=>{
    if(url.endsWith('/token'))return Response.json({access_token:'token',token_type:'Bearer',expires_in:600});
    sent++;if(mode==='network')throw new Error('SECRET_PROVIDER_ERROR');
    return mode==='503'?new Response('SECRET_PROVIDER_ERROR',{status:503}):Response.json({unexpected:'SECRET_PROVIDER_ERROR'},{status:201});
  });
  assert.equal((await p.send('+970599000000','123456','synthetic-unknown',async()=>true)).state,'unknown');assert.equal(sent,1,'uncertain send is never retried');
}
let transmitted=false;
const revoked=new OoredooCommunication(config,async(url)=>{if(!url.endsWith('/token'))transmitted=true;return Response.json({access_token:'token',token_type:'Bearer',expires_in:600});});
assert.deepEqual(await revoked.send('+970599000000','123456','synthetic-revoked',async()=>false),{state:'obsolete',attempted:false});assert.equal(transmitted,false);
const badToken=new OoredooCommunication(config,async()=>Response.json({access_token:'untrusted\nheader',token_type:'Bearer',expires_in:600}));
assert.deepEqual(await badToken.send('+970599000000','123456','synthetic-token',async()=>true),{state:'failed',attempted:false});
let stallToken=false,timeoutSends=0;
const stalled=createServer((req,res)=>{
  if(req.url.endsWith('/token')) {if(!stallToken)res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({access_token:'synthetic',token_type:'Bearer',expires_in:600}));}
  else timeoutSends++;
});
await new Promise(resolve=>stalled.listen(0,'127.0.0.1',resolve));
try {
  const bounded={...config,baseUrl:`http://127.0.0.1:${stalled.address().port}`,tokenTimeoutMs:100,sendTimeoutMs:30};
  const timedOut=await new OoredooCommunication(bounded).send('+970599000000','123456','synthetic-timeout',async()=>true);
  assert.equal(timedOut.state,'unknown');assert.equal(timeoutSends,1,'real local HTTP timeout does not replay an uncertain send');
  stallToken=true;
  assert.deepEqual(await new OoredooCommunication(bounded).send('+970599000000','123456','synthetic-token-timeout',async()=>true),{state:'failed',attempted:false});assert.equal(timeoutSends,1);
}finally{stalled.closeAllConnections();await new Promise(resolve=>stalled.close(resolve));}
const dir=await mkdtemp(join(tmpdir(),'fastship-wp06-sqlite-')),sqlite=await startApiProcess({DB_PATH:join(dir,'legacy.sqlite')});
try {
  const call=apiCaller(()=>sqlite.base),cap=await call('/phone/capabilities');assert.equal(cap.available,false);assert.equal(cap.enabled,false);assert.equal(cap.sendAcceptance,false);
  const store=new DatabaseSync(join(dir,'legacy.sqlite')),salt=randomBytes(16).toString('hex');
  store.prepare('INSERT INTO users(phone,name,password,role,status,created_at) VALUES(?,?,?,?,?,?)').run('0598800123','Synthetic',`${salt}:${scryptSync('Synthetic-password',salt,32).toString('hex')}`,'customer','active',Date.now());store.close();
  const user=await call('/auth/login',{body:{phone:'0598800123',password:'Synthetic-password'}});
  await call('/me/phone',{token:user.token,expect:409});
  const request={commandId:randomUUID(),deviceId:randomUUID(),phone:'0598800123',countryContext:'PS'};
  await call('/me/phone/challenges',{token:user.token,body:{...request,purpose:'verify',expectedRevision:1},expect:409});
  await call('/auth/phone/recovery/challenges',{body:request,expect:409});
}finally{await sqlite.stop();}
const productionEnv={...process.env,NODE_ENV:'production',DB_PATH:join(dir,'production-rejection.sqlite'),SUPPORT_CONTACT:'https://support.invalid',WIND_IDENTITY_MODE:'operator-verified',WIND_PUSH_SUBJECT:'mailto:wind-suite@example.invalid',WIND_TRUST_PROXY:'1'};
for(const key of Object.keys(productionEnv))if(/^(?:WIND_PHONE|WIND_OOREDOO|WIND_OTP)/.test(key) || ['WIND_DATABASE_URL','DATABASE_URL'].includes(key))delete productionEnv[key];
productionEnv.WIND_PHONE_TEST_PROVIDER_URL='http://127.0.0.1:1/';
const rejected=spawnSync(process.execPath,['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--disable-warning=ExperimentalWarning','server/main.ts'],{env:productionEnv,encoding:'utf8',windowsHide:true,timeout:15000});
assert.equal(rejected.status,1);assert.match(rejected.stderr,/Production phone verification rejects test providers/);
console.log('WP06 provider: published OAuth/send contract, token reuse/concurrent refresh, one safe401 refresh, accepted-not-delivered, unknown/no-retry, post-OAuth authority, malformed response and production fake gates passed');
