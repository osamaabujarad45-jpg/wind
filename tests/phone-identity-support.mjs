import { createServer } from 'node:http';
import { randomUUID,randomBytes,scryptSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshPostgres,connectionString } from './pg-support.mjs';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';

export async function fixture(label='phone') {
  const state={messages:[],tokenCalls:0,modes:new Map(),tokensPaused:null};
  const stub=createServer(async(req,res)=>{
    let input='';for await(const chunk of req)input+=chunk;
    if(req.url.endsWith('/token')) {
      state.tokenCalls++;if(state.tokensPaused)await state.tokensPaused;
      res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({access_token:'synthetic-token',token_type:'Bearer',expires_in:600}));return;
    }
    if(req.url!=='/tmf-api/communicationManagement/v4/communicationMessage'){res.writeHead(404).end();return;}
    const body=JSON.parse(input),phone=body.receiver[0].phoneNumber,mode=state.modes.get(phone),message={phone,code:/\b(\d{6})\b/.exec(body.content)[1],transactionId:req.headers.transactionid,body};
    state.messages.push(message);
    if(mode?.wait)await mode.wait;
    if(mode?.unknown){res.destroy();return;}
    const status=mode?.status??201;res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(status===201?{messageType:'sms',content:body.content,state:'completed'}:{error:'SYNTHETIC_PRIVATE_PROVIDER_ERROR'}));
  });
  await new Promise(resolve=>stub.listen(0,'127.0.0.1',resolve));
  const {schema,database:db}=await freshPostgres(label),dir=await mkdtemp(join(tmpdir(),'fastship-wp06-'));
  const secret=randomBytes(32).toString('base64');
  const storage={DB_PATH:join(dir,'legacy.sqlite'),WIND_DATABASE_URL:connectionString,WIND_POSTGRES_TEST_ONLY:'1',WIND_POSTGRES_TEST_SCHEMA:schema,
    WIND_PHONE_ENABLED:'1',WIND_PHONE_PROVIDER:'ooredoo_communication',WIND_PHONE_HMAC_KEY:secret,WIND_PHONE_HMAC_VERSION:'synthetic1',
    WIND_OOREDOO_CLIENT_ID:'SYNTHETIC_CLIENT',WIND_OOREDOO_CLIENT_SECRET:'SYNTHETIC_OAUTH_SECRET',WIND_OOREDOO_SENDER:'Synthetic',WIND_OOREDOO_COUNTRY_CODE:'TEST',
    WIND_PHONE_APPROVED_PREFIXES:'+97056,+97059,+97256,+97259',WIND_PHONE_PROVIDER_EVIDENCE:'synthetic:wp06:carrier',WIND_PHONE_DAILY_MESSAGE_LIMIT:'1000',WIND_PHONE_DAILY_BUDGET_MINOR:'10000',WIND_PHONE_SMS_MAX_COST_MINOR:'10',
    WIND_PHONE_TEST_PROVIDER_URL:`http://127.0.0.1:${stub.address().port}/`};
  const a=await startApiProcess(storage),b=await startApiProcess(storage),call=apiCaller(()=>a.base),other=apiCaller(()=>b.base);
  let next=598600000;
  const account=async({role='customer',phone=`0${next++}`,verified=false}={})=>{
    const salt=randomBytes(16).toString('hex'),password=`${salt}:${scryptSync('Synthetic-password',salt,32).toString('hex')}`;
    const row=await db.one('INSERT INTO users(phone,name,password,role,status,created_at,phone_verified_at) VALUES(?,?,?,?,?,?,?) RETURNING id',phone,'Synthetic',password,role,'active',Date.now(),verified?Date.now():null);
    const session=await call('/auth/login',{body:{phone,password:'Synthetic-password'}});return {...session,phone,id:row.id,deviceId:randomUUID()};
  };
  const admin=await account({role:'admin'}),customer=await account();
  const map=async(user,phone=user.phone,routingPhone=phone)=>{
    const national=phone.replace(/^0/,'').replace(/^\+(970|972)/,''),group='+970'+national;
    const old=await db.one('SELECT version FROM phone_mappings WHERE canonical_group=?',group);
    return call('/admin/phone/mappings',{token:admin.token,body:{userId:user.user.id,phone,countryContext:'PS',routingPhone,state:'reviewed',expectedVersion:old?.version??0,reason:'Synthetic collision review and explicit route evidence',evidenceRef:'synthetic:wp06:mapping'}});
  };
  const issue=async(user=customer,{phone=user.phone,purpose='verify',deviceId=user.deviceId,commandId=randomUUID(),client=call,...extra}={})=>{
    const revision=(await db.one('SELECT phone_revision FROM users WHERE id=?',user.user.id)).phone_revision;
    return client('/me/phone/challenges',{token:user.token,body:{commandId,deviceId,phone,countryContext:'PS',purpose,expectedRevision:revision,...extra}});
  };
  const waitFor=async(fn,label='condition')=>{for(let i=0;i<300;i++){const r=await fn();if(r)return r;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(`Timed out waiting for ${label}`);};
  const delivered=async challenge=>{await waitFor(async()=>{const c=await db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',challenge.challengeId);return !['prepared','requested'].includes(c.delivery_state);},'provider outcome');return state.messages.find(m=>m.transactionId===challenge.challengeId);};
  const prove=async(user,challenge,{code,commandId=randomUUID(),purpose='verify',deviceId=user.deviceId,expect=200,client=call}={})=>client('/me/phone/verify',{token:user.token,body:{commandId,deviceId,challengeId:challenge.challengeId,purpose,code:code??(await delivered(challenge))?.code},expect});
  const verify=async(user=customer)=>{await map(user);const challenge=await issue(user);await prove(user,challenge);return challenge;};
  const age=async(group)=>db.run('UPDATE phone_challenges SET created_at=created_at-900001,resend_at=resend_at-900001 WHERE canonical_group=?',group);
  const close=async()=>{await Promise.all([a.stop(),b.stop()]);await db.close();stub.closeAllConnections();await new Promise(resolve=>stub.close(resolve));};
  return {db,schema,storage,a,b,call,other,admin,customer,account,map,issue,prove,verify,delivered,waitFor,state,secret,age,close};
}
