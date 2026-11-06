import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { SESSION_DAY_MS, SESSION_DAYS, SESSION_IDLE_DAYS } from './session-policy.ts';
import { clientAddress } from './client-address.ts';
import { firebaseReset } from './firebase-reset.ts';
import type { Persistence, Row } from '../db/persistence.ts';
import { parsePhoneNumber, type PhoneNumber } from './phone-number.ts';
import { AcsCommunication, OoredooCommunication, phoneConfig, type PhoneConfig } from './phone-provider.ts';

type Actor={id:number;role:string;status:string};
type Context={user:Actor|null;body:Row;req:IncomingMessage;query:URLSearchParams};
type Register=(method:string,path:string,handler:(ctx:Context)=>Promise<unknown>,isPublic?:boolean)=>unknown;
type Result={status:number;body:Row;persist?:boolean};
type Fail=(status:number,message:string)=>never;
// A prepared KDF result is attached before the command transaction; `checked` is a replay
// fingerprint already verified outside it. Neither field ever leaves this object.
type Password={value:string;prepare?:()=>Promise<string|undefined>;prepared?:string;checked?:string};
class PasswordRecheck extends Error {
  fingerprint:string;
  constructor(fingerprint:string) { super('password_recheck'); this.fingerprint=fingerprint; }
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ordered=(x:any):any=>Array.isArray(x)?x.map(ordered):x && typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const ok=(body:Row):Result=>({status:200,body});
const bad=(message='phone_proof_invalid',status=400):Result=>({status,body:{error:message}});
// The provider may spend 3s on OAuth and 5s on sending twice; leave room for
// scheduling and transaction overhead, and fence callbacks after lease expiry.
const sendLeaseMs=30000;
export const phonePolicy=Object.freeze({version:1,codeSeconds:300,maxAttempts:5,resendSeconds:45,phoneDevicePer15Minutes:3,phoneDevicePerDay:10,ipPerHourReview:30,
  serverGeneratedCode:true,proofMeansPhoneControlOnly:true,providerAcceptanceMeansDelivery:false});

/** Seven digits or more, in any script, whatever sits between them short of a letter (pasted numbers carry bidi marks). Errs towards refusing: a full date also trips it, and the admin rewords. */
export const holdsPhoneNumber=(text:string)=>/(?:[\d٠-٩۰-۹][^\p{L}\d٠-٩۰-۹]{0,3}){7,}/u.test(text);

export async function phoneSchemaAvailable(db:Persistence) {
  if (db.backend!=='postgres') return false;
  const tables=await db.one("SELECT to_regclass('schema_migrations') m,to_regclass('phone_challenges') p");
  return !!(tables?.m && tables.p && await db.one('SELECT version FROM schema_migrations WHERE version=8'));
}

export class PhoneIdentity {
  db:Persistence;fail:Fail;config:PhoneConfig;provider:OoredooCommunication|AcsCommunication;
  private jobs=new Set<Promise<unknown>>();
  private passwordHash:(password:unknown)=>Promise<string>;
  private passwordCheck:(password:string,stored:string)=>Promise<boolean>;
  constructor(db:Persistence,fail:Fail,passwordHash:(password:unknown)=>string|Promise<string>,passwordCheck:(password:string,stored:string)=>boolean|Promise<boolean>) {
    this.db=db;this.fail=fail;this.config=phoneConfig();this.provider=this.config.provider==='acs'?new AcsCommunication(this.config):new OoredooCommunication(this.config);
    // Sync fixtures stay valid; production callbacks are the bounded async pool.
    this.passwordHash=async value=>passwordHash(value);this.passwordCheck=async(password,stored)=>passwordCheck(password,stored);
  }
  fields(body:Row,allowed:string[]) {if (!body || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k)))this.fail(400,'invalid_input');}
  id(value:unknown) {if(typeof value!=='string' || !uuid.test(value))this.fail(400,'invalid_command_id');return (value as string).toLowerCase();}
  int(value:unknown,min=0) {if(!Number.isSafeInteger(value) || (value as number)<min)this.fail(400,'invalid_input');return value as number;}
  phone(value:unknown,context:unknown) {return parsePhoneNumber(value,context)??this.fail(400,'invalid_phone');}
  private hmac(value:unknown) {if(!this.config.hmacKey)throw new Error('Phone secret unavailable');return createHmac('sha256',this.config.hmacKey).update(JSON.stringify(ordered(value))).digest('hex');}
  private session(req:IncomingMessage) {const raw=/^Bearer (\w+)$/.exec(req.headers.authorization??'')?.[1];return raw?digest(raw):null;}
  // These UUID/token-derived lookup keys remain stable across HMAC-key rotation. Old command
  // fingerprints then fail closed on a missing old key instead of creating another paid send.
  private device(value:unknown) {return digest(`wp06-device:${this.id(value)}`);}
  private ip(req:IncomingMessage) {return this.hmac(['ip',clientAddress(req)]);}
  async capabilities() {const available=await phoneSchemaAvailable(this.db);return {available,enabled:available && this.config.enabled,
    provider:available && this.config.enabled?this.config.provider:null,sendAcceptance:available && this.config.enabled,deliveryReceipts:false,deliveryQuery:false,providerTransactionIdempotency:false,
    policy:phonePolicy,supportedContext:'PS',supportedMobilePrefixes:['56','59'],legacyLoginPreserved:true};}
  async available(requireProvider=true) {
    if(!await phoneSchemaAvailable(this.db))this.fail(409,'phone_protocol_unavailable');
    if(requireProvider && !this.config.enabled)this.fail(503,'phone_verification_unavailable');
  }
  private async actor(ctx:Context) {
    if(!ctx.user)this.fail(401,'unauthorized');
    const sessionHash=this.session(ctx.req);
    const user=await this.db.one(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND s.token_hash=? AND s.created_at>? AND COALESCE(s.last_seen_at,s.created_at)>? FOR UPDATE OF u`,ctx.user!.id,sessionHash,Date.now()-SESSION_DAYS*SESSION_DAY_MS,Date.now()-SESSION_IDLE_DAYS*SESSION_DAY_MS);
    if(!user || user.status==='blocked')this.fail(401,'unauthorized');
    return {user:user!,sessionHash:sessionHash!};
  }
  private async lock(key:string) {await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',`wp06:${key}`);}
  private async audit(action:string,challenge:Row|null,userId:number|null,actorId:number|null,reason:string,evidence:string|null=null) {
    await this.db.run('INSERT INTO phone_audit(user_id,actor_id,challenge_id,action,reason,evidence_ref,created_at) VALUES(?,?,?::uuid,?,?,?,?)',userId,actorId,challenge?.id??null,action,reason,evidence,Date.now());
    await this.db.one("SELECT append_domain_event(NULL,'phone.identity',?::jsonb) id",JSON.stringify({action,challengeId:challenge?.id??null,userId}));
  }
  private async command(ctx:Context,scope:string,commandId:string,input:unknown,authorize:()=>Promise<void>,work:()=>Promise<Result>,password?:Password) {
    const hash=this.hmac(input);
    // Stored receipts are immutable: verify a replay's password fingerprint before taking any
    // transaction or command lock, so no KDF ever runs while one is held. A receipt inserted
    // concurrently is detected inside and rechecked by one retry.
    const prior=await this.db.one('SELECT * FROM phone_command_results WHERE scope_hash=? AND command_id=?::uuid',scope,commandId);
    if(prior) {
      if(prior.payload_hash!==hash)this.fail(409,'idempotency_conflict');
      if(prior.password_fingerprint) {
        if(!password || !await this.passwordCheck(password.value,prior.password_fingerprint))this.fail(409,'idempotency_conflict');
        password.checked=prior.password_fingerprint;
      }
    } else if(password?.prepare)password.prepared=await password.prepare();
    let result:Result;
    for(let attempt=0;;attempt++) {
      try {
        result=await this.db.atomic({id:ctx.user?.id,purpose:ctx.user?undefined:'phone_public',correlationId:randomUUID()},async()=>{
          // Short phone-only command serialization fixes lock order across authenticated and public
          // recovery commands. OAuth/SMS/KDF never runs inside this transaction or lock.
          await this.lock('identity_commands');
          await this.lock(`command:${scope}:${commandId}`);await authorize();
          const old=await this.db.one('SELECT * FROM phone_command_results WHERE scope_hash=? AND command_id=?::uuid',scope,commandId);
          if(old) {
            if(old.payload_hash!==hash)return bad('idempotency_conflict',409);
            if(old.password_fingerprint) {
              if(!password)return bad('idempotency_conflict',409);
              if(password.checked!==old.password_fingerprint)throw new PasswordRecheck(old.password_fingerprint);
            }
            return {status:old.http_status,body:old.response};
          }
          const response=await work();
          if(response.persist!==false)await this.db.run('INSERT INTO phone_command_results(scope_hash,command_id,payload_hash,http_status,response,created_at,password_fingerprint) VALUES(?,?::uuid,?,?,?::jsonb,?,?)',scope,commandId,hash,response.status,JSON.stringify(response.body),Date.now(),response.status===200 ? password?.prepared??null : null);
          return response;
        });
        break;
      } catch(error) {
        if(!(error instanceof PasswordRecheck) || attempt>=1)throw error;
        if(!password)this.fail(409,'idempotency_conflict');
        if(!await this.passwordCheck(password.value,error.fingerprint))this.fail(409,'idempotency_conflict');
        password.checked=error.fingerprint;
      }
    }
    if(result.status!==200)this.fail(result.status,result.body.error);return result.body;
  }
  private async mapping(phone:PhoneNumber,userId?:number) {
    const m=await this.db.one('SELECT * FROM phone_mappings WHERE canonical_group=?',phone.canonicalGroup);
    if(!m || !['reviewed','verified'].includes(m.state) || (userId!==undefined && m.user_id!==userId))return null;
    const collisions=await this.db.one('SELECT count(*) n FROM users WHERE phone_identity_group(phone)=? AND id<>?',phone.canonicalGroup,m.user_id);
    if(collisions!.n)return null;
    return m;
  }
  async loginAccount(identifier:string) {
    if(!await phoneSchemaAvailable(this.db))return undefined;
    const phone=parsePhoneNumber(identifier,'PS');if(!phone)return undefined;
    const m=await this.mapping(phone);if(m?.state!=='verified')return undefined;
    return await this.db.one('SELECT u.* FROM users u JOIN phone_aliases a ON a.canonical_group=? WHERE a.alias_e164=? AND u.id=? AND u.phone=?',m.canonical_group,phone.e164,m.user_id,m.legacy_phone);
  }
  loginThrottleKey(identifier:string) {return parsePhoneNumber(identifier,'PS')?.national;}
  private proofDigest(c:Row,code:string) {return this.hmac(['proof',c.id,c.purpose,c.canonical_group,c.target_e164,c.user_id,c.actor_id,c.actor_role,c.identity_revision,c.mapping_version,c.device_hash,c.session_hash,code]);}
  private async authority(c:Row,checkSession=true) {
    if(!c.user_id || c.consumed_at || c.superseded_at || c.expires_at<=Date.now() || c.attempts>=5 || c.secret_version!==this.config.secretVersion)return false;
    const user=await this.db.one('SELECT * FROM users WHERE id=?',c.user_id);
    if(!user || user.status==='blocked' || user.phone_revision!==c.identity_revision || user.role!==c.actor_role)return false;
    const m=await this.db.one('SELECT * FROM phone_mappings WHERE canonical_group=?',c.canonical_group);
    if(!m || m.user_id!==user.id || m.version!==c.mapping_version || !['reviewed','verified'].includes(m.state) || m.legacy_phone!==user.phone)return false;
    if(c.purpose==='recovery')return user.role!=='admin' && !!user.phone_verified_at && m.state==='verified';
    if(checkSession && !await this.db.one('SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND created_at>? AND COALESCE(last_seen_at,created_at)>?',c.session_hash,c.actor_id,Date.now()-SESSION_DAYS*SESSION_DAY_MS,Date.now()-SESSION_IDLE_DAYS*SESSION_DAY_MS))return false;
    return true;
  }
  private async rate(phone:PhoneNumber,deviceHash:string,ipHash:string) {
    const now=Date.now();
    for(const key of [`device:${deviceHash}`,`phone:${phone.canonicalGroup}`].sort())await this.lock(key);
    const counts=await this.db.one(`SELECT count(*) FILTER(WHERE created_at>?) recent,count(*) daily,
      COALESCE(max(resend_at) FILTER(WHERE delivery_state<>'suppressed'),0) resend FROM phone_challenges
      WHERE canonical_group=? AND created_at>?`,now-900000,phone.canonicalGroup,now-86400000);
    const devices=await this.db.one('SELECT count(*) FILTER(WHERE created_at>?) recent,count(*) daily FROM phone_challenges WHERE device_hash=? AND created_at>?',now-900000,deviceHash,now-86400000);
    const hour=3600000,start=Math.floor(now/hour)*hour;
    const review=await this.db.one(`INSERT INTO phone_rate_windows(bucket_hash,period_ms,window_start,count) VALUES(?,?,?,1)
      ON CONFLICT(bucket_hash,period_ms,window_start) DO UPDATE SET count=phone_rate_windows.count+1 RETURNING count`,ipHash,hour,start);
    if(review!.count===31)await this.audit('ip_review_signal',null,null,null,'Shared address exceeded30 requests/hour; review signal only');
    if(counts!.resend>now)return 'phone_resend_cooldown';
    if(counts!.recent>=3 || counts!.daily>=10 || devices!.recent>=3 || devices!.daily>=10)return 'phone_rate_limited';
    return null;
  }
  // These global fixed windows bound all public-challenge storage, including
  // unknown numbers and suppressed attempts, independently of a shared IP.
  // identity_commands serializes the read/increment across API processes.
  private async admitPublicChallenge() {
    const now=Date.now(),bucket=this.hmac(['public_challenge_global']);
    const windows=[{period:3600000,max:1000},{period:86400000,max:10000}];
    for(const {period,max} of windows) {
      const start=Math.floor(now/period)*period;
      const row=await this.db.one('SELECT count FROM phone_rate_windows WHERE bucket_hash=? AND period_ms=? AND window_start=?',bucket,period,start);
      if((row?.count??0)>=max)return false;
    }
    for(const {period} of windows)await this.db.run(`INSERT INTO phone_rate_windows(bucket_hash,period_ms,window_start,count) VALUES(?,?,?,1)
      ON CONFLICT(bucket_hash,period_ms,window_start) DO UPDATE SET count=phone_rate_windows.count+1`,bucket,period,Math.floor(now/period)*period);
    return true;
  }
  private async reserveBudget() {
    const day=Math.floor(Date.now()/86400000);
    await this.db.run('INSERT INTO phone_provider_budget(day,reserved_messages,reserved_minor) VALUES(?,0,0) ON CONFLICT DO NOTHING',day);
    const budget=(await this.db.one('SELECT * FROM phone_provider_budget WHERE day=? FOR UPDATE',day))!;
    if(budget.reserved_messages>=this.config.dailyMessages || budget.reserved_minor+this.config.maxCostMinor>this.config.dailyBudgetMinor)return null;
    await this.db.run('UPDATE phone_provider_budget SET reserved_messages=reserved_messages+1,reserved_minor=reserved_minor+? WHERE day=?',this.config.maxCostMinor,day);
    return day;
  }
  async issue(ctx:Context,recovery=false) {
    this.fields(ctx.body,['commandId','deviceId','phone','countryContext',...(recovery?[]:['purpose','expectedRevision','currentPassword'])]);
    if(['commandId','deviceId','phone','countryContext'].some(k=>ctx.body[k]===undefined))this.fail(400,'invalid_input');
    const commandId=this.id(ctx.body.commandId),deviceId=this.id(ctx.body.deviceId),phone=this.phone(ctx.body.phone,ctx.body.countryContext);
    const purpose=recovery?'recovery':ctx.body.purpose;
    if(!['verify','change','recovery'].includes(purpose) || (!recovery && purpose==='recovery'))this.fail(400,'invalid_purpose');
    await this.available();
    const deviceHash=this.device(deviceId);
    const sessionHash=this.session(ctx.req),scope=digest(`wp06-${recovery?'public':'actor'}:${recovery?deviceHash:sessionHash}`);
    let dispatch:{id:string;code:string}|undefined;
    const currentPassword=purpose==='change'?String(ctx.body.currentPassword??''):undefined;
    // The current-password KDF and its admission window run before the command transaction;
    // `prepared` is the exact stored credential the work transaction revalidates.
    const password:Password|undefined=currentPassword===undefined?undefined:{value:currentPassword,prepare:async()=>{
      const current=await this.actor(ctx);
      if(current.user.role==='admin')return this.fail(403,'phone_change_not_authorized');
      const interval=600000,window=Math.floor(Date.now()/interval)*interval,bucket=this.hmac(['change_password_admission',current.user.id]);
      const admission=await this.db.one(`INSERT INTO phone_rate_windows(bucket_hash,period_ms,window_start,count) VALUES(?,?,?,1)
        ON CONFLICT(bucket_hash,period_ms,window_start) DO UPDATE SET count=phone_rate_windows.count+1 RETURNING count`,bucket,interval,window);
      if(admission!.count>5 || !await this.passwordCheck(currentPassword,current.user.password))return this.fail(403,'phone_change_not_authorized');
      return current.user.password;
    }};
    const response=await this.command(ctx,scope,commandId,{kind:'issue',purpose,phone:phone.e164,deviceHash,expectedRevision:ctx.body.expectedRevision},
      async()=>{if(!recovery)await this.actor(ctx);},async()=>{
        if(recovery && !await this.admitPublicChallenge())return {status:200,persist:false,body:{challengeId:randomUUID(),state:'request_recorded',expiresAt:Date.now()+300000,resendAfterSeconds:45,accountStateConcealed:true}};
        const current=recovery?null:await this.actor(ctx);
        let user=current?.user??null;
        if(!recovery && user!.phone_revision!==this.int(ctx.body.expectedRevision,1))return bad('phone_revision_changed',409);
        if(!recovery && purpose==='verify' && parsePhoneNumber(user!.phone,'PS')?.canonicalGroup!==phone.canonicalGroup)return bad('phone_change_required',409);
        if(!recovery && purpose==='change') {
          // The KDF approved this exact snapshot; a concurrent password change fails closed.
          if(user!.role==='admin' || user!.password!==password!.prepared)return bad('phone_change_not_authorized',403);
        }
        const mapping=await this.mapping(phone,user?.id);
        if(recovery && mapping?.state==='verified')user=await this.db.one("SELECT * FROM users WHERE id=? AND phone=? AND status<>'blocked' AND role<>'admin' AND phone_verified_at IS NOT NULL",mapping.user_id,mapping.legacy_phone)??null;
        if(!recovery && (!mapping || mapping.legacy_phone!==user!.phone))return bad('phone_mapping_review_required',409);
        const limit=await this.rate(phone,deviceHash,this.ip(ctx.req));
        const supported=mapping && this.config.approvedPrefixes.some(x=>mapping.routing_e164.startsWith(x));
        const eligible=!!user && !!mapping && supported;
        const budgetDay=!limit && eligible?await this.reserveBudget():null;
        const now=Date.now(),id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
        const c:Row={id,purpose,user_id:user?.id??null,actor_id:recovery?null:user!.id,actor_role:user?.role??null,
          identity_revision:user?.phone_revision??null,mapping_version:mapping?.version??null,canonical_group:phone.canonicalGroup,target_e164:mapping?.routing_e164??phone.e164,
          device_hash:deviceHash,session_hash:recovery?null:sessionHash};
        const state=budgetDay!==null?'prepared':'suppressed';
        await this.db.run(`INSERT INTO phone_challenges(id,purpose,user_id,actor_id,actor_role,identity_revision,mapping_version,canonical_group,target_e164,display_phone,country_context,device_hash,session_hash,scope_hash,
          code_digest,secret_version,created_at,expires_at,resend_at,delivery_state,provider_transaction_id,send_lease_until,budget_day,budget_cost_minor)
          VALUES(?::uuid,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::uuid,?,?,?)`,id,purpose,c.user_id,c.actor_id,c.actor_role,c.identity_revision,c.mapping_version,phone.canonicalGroup,c.target_e164,phone.display,'PS',deviceHash,c.session_hash,scope,
          this.proofDigest(c,code),this.config.secretVersion,now,now+300000,now+45000,state,id,now+sendLeaseMs,budgetDay,budgetDay===null?0:this.config.maxCostMinor);
        if(state==='prepared') {
          await this.db.run('UPDATE phone_challenges SET superseded_at=? WHERE canonical_group=? AND purpose=? AND id<>?::uuid AND consumed_at IS NULL AND superseded_at IS NULL',now,phone.canonicalGroup,purpose,id);
          dispatch={id,code};
        }
        await this.audit(state==='prepared'?'challenge_prepared':'challenge_suppressed',c,user?.id??null,current?.user.id??null,limit??(!eligible?'No approved account/routing authority':budgetDay===null?'Provider hard budget exhausted':'Provider budget reserved'));
        if(!recovery && state==='suppressed')return bad(limit??(!supported?'phone_route_unavailable':'phone_provider_budget_exhausted'),limit?429:503);
        return ok({challengeId:id,state:recovery?'request_recorded':'requested',expiresAt:now+300000,resendAfterSeconds:45,...(recovery?{accountStateConcealed:true}:{})});
      },password);
    if(dispatch)this.launch(dispatch.id,dispatch.code);
    if(!recovery && response.challengeId) {
      const current=await this.db.one('SELECT delivery_state FROM phone_challenges WHERE id=?::uuid',response.challengeId);
      return {...response,deliveryState:current?.delivery_state??'unknown'};
    }
    return response;
  }
  private launch(id:string,code:string) {
    const job=this.db.detached(()=>this.dispatch(id,code)).catch(()=>{});
    this.jobs.add(job);void job.finally(()=>this.jobs.delete(job));
  }
  async drain() {await Promise.allSettled([...this.jobs]);}
  /** Restart/lease recovery is accounting only: a plaintext code is never stored or re-sent. */
  async reconcileStale() {
    if(!await phoneSchemaAvailable(this.db))return;
    await this.db.atomic({purpose:'phone_stale_reconciliation',correlationId:randomUUID()},async()=>{
      await this.lock('identity_commands');
      const stale=await this.db.all("SELECT * FROM phone_challenges WHERE delivery_state IN('prepared','requested') AND send_lease_until<? ORDER BY created_at LIMIT 100 FOR UPDATE",Date.now());
      for(const c of stale) {
        await this.db.run("UPDATE phone_challenges SET delivery_state='unknown',completed_at=?,send_lease_until=NULL WHERE id=?::uuid",Date.now(),c.id);
        await this.audit('send_unknown',c,c.user_id,null,'Expired send lease; outcome unknown, budget retained, no automatic resend');
      }
    });
  }
  private async dispatch(id:string,code:string) {
    const owner=randomUUID();
    const c=await this.db.atomic({purpose:'phone_send_claim',correlationId:randomUUID()},async()=>{
      await this.lock('identity_commands');
      const current=await this.db.one('SELECT * FROM phone_challenges WHERE id=?::uuid FOR UPDATE',id);
      if(!current || current.delivery_state!=='prepared' || current.send_owner || current.send_lease_until<=Date.now())return null;
      await this.db.run('UPDATE phone_challenges SET send_owner=?::uuid WHERE id=?::uuid',owner,id);
      return current;
    });
    if(!c)return;
    let lease=c.send_lease_until;
    const result=await this.provider.send(c.target_e164,code,c.provider_transaction_id,async()=>this.db.atomic({id:c.actor_id??undefined,purpose:'phone_send_authority',correlationId:randomUUID()},async()=>{
      await this.lock('identity_commands');
      const current=await this.db.one('SELECT * FROM phone_challenges WHERE id=?::uuid FOR UPDATE',id);
      const now=Date.now();
      if(!current || current.send_owner!==owner || !['prepared','requested'].includes(current.delivery_state) || current.send_lease_until!==lease || lease<=now || !await this.authority(current))return false;
      lease=now+sendLeaseMs;
      await this.db.run("UPDATE phone_challenges SET delivery_state='requested',send_started_at=COALESCE(send_started_at,?),send_lease_until=? WHERE id=?::uuid",now,lease,id);
      return true;
    }));
    await this.db.atomic({id:c.actor_id??undefined,purpose:'phone_send_result',correlationId:randomUUID()},async()=>{
      await this.lock('identity_commands');
      const current=await this.db.one('SELECT * FROM phone_challenges WHERE id=?::uuid FOR UPDATE',id);
      // A reconciler or replacement owner has the last word; a late callback
      // must not overwrite its outcome or release its reserved budget.
      if(!current || current.send_owner!==owner || !['prepared','requested'].includes(current.delivery_state) || current.send_lease_until!==lease || lease<=Date.now())return;
      const valid=await this.authority(current),state=valid?result.state:'obsolete';
      await this.db.run('UPDATE phone_challenges SET delivery_state=?,provider_status=?,completed_at=?,send_lease_until=NULL WHERE id=?::uuid',state,result.httpStatus??null,Date.now(),id);
      if(!result.attempted && current.budget_day!==null && !current.budget_released) {
        await this.db.run('UPDATE phone_provider_budget SET reserved_messages=reserved_messages-1,reserved_minor=reserved_minor-? WHERE day=?',current.budget_cost_minor,current.budget_day);
        await this.db.run('UPDATE phone_challenges SET budget_released=1 WHERE id=?::uuid',id);
      }
      await this.audit(`send_${state}`,current,current.user_id,current.actor_id,'Provider outcome recorded; accepted is not delivered');
    });
  }
  async prove(ctx:Context,recovery=false) {
    this.fields(ctx.body,['commandId','deviceId','challengeId','purpose','code',...(recovery?['password']:[])]);
    if(['commandId','deviceId','challengeId','purpose','code',...(recovery?['password']:[])].some(k=>ctx.body[k]===undefined))this.fail(400,'invalid_input');
    const commandId=this.id(ctx.body.commandId),challengeId=this.id(ctx.body.challengeId),deviceId=this.id(ctx.body.deviceId),purpose=ctx.body.purpose;
    if(recovery?purpose!=='recovery':!['verify','change'].includes(purpose))this.fail(400,'invalid_purpose');
    if(typeof ctx.body.code!=='string' || !/^\d{6}$/.test(ctx.body.code))this.fail(400,'phone_proof_invalid');
    await this.available();
    const deviceHash=this.device(deviceId);
    // Cheap format checks are uniform. Unauthenticated guesses must never trigger a password KDF;
    // only a valid, current, bound and one-use recovery proof may reach that operation below.
    if(recovery && (typeof ctx.body.password!=='string' || ctx.body.password.length<12 || ctx.body.password.length>100))this.fail(400,'weak_password');
    const sessionHash=this.session(ctx.req),scope=digest(`wp06-${recovery?'public':'actor'}:${recovery?deviceHash:sessionHash}`);
    const password:Password|undefined=recovery?{value:ctx.body.password as string,prepare:async()=>{
      // Admission only: an invalid, spent, superseded, expired or unmatched proof must reach
      // the transaction below without paying for a KDF. Every condition checked here is
      // monotonic, so the work transaction can only re-confirm it.
      const c=await this.db.one('SELECT * FROM phone_challenges WHERE id=?::uuid',challengeId);
      if(!c || c.device_hash!==deviceHash || c.scope_hash!==scope || c.consumed_at || c.superseded_at || c.attempts>=5
        || c.expires_at<=Date.now() || ['failed','obsolete','suppressed'].includes(c.delivery_state) || c.purpose!==purpose)return undefined;
      if(!await this.authority(c))return undefined;
      const expected=this.proofDigest(c,ctx.body.code);
      if(!timingSafeEqual(Buffer.from(c.code_digest,'hex'),Buffer.from(expected,'hex')))return undefined;
      return this.passwordHash(ctx.body.password);
    }}:undefined;
    return this.command(ctx,scope,commandId,{kind:'proof',challengeId,purpose,deviceHash,code:ctx.body.code},
      async()=>{if(!recovery)await this.actor(ctx);},async()=>{
        const c=await this.db.one('SELECT * FROM phone_challenges WHERE id=?::uuid FOR UPDATE',challengeId);
        if(!c || c.device_hash!==deviceHash || c.scope_hash!==scope || (!recovery && c.actor_id!==ctx.user!.id))return bad();
        if(c.consumed_at || c.superseded_at || c.attempts>=5 || c.expires_at<=Date.now() || ['failed','obsolete','suppressed'].includes(c.delivery_state) || !await this.authority(c))return bad();
        const expected=this.proofDigest(c,ctx.body.code),equal=timingSafeEqual(Buffer.from(c.code_digest,'hex'),Buffer.from(expected,'hex'));
        if(c.purpose!==purpose || !equal) {
          await this.db.run('UPDATE phone_challenges SET attempts=attempts+1 WHERE id=?::uuid',challengeId);
          await this.audit('proof_rejected',c,c.user_id,ctx.user?.id??null,'Invalid phone proof');return bad();
        }
        await this.lock(`phone:${c.canonical_group}`);
        const user=(await this.db.one('SELECT * FROM users WHERE id=? FOR UPDATE',c.user_id))!;
        if(!await this.authority(c))return bad();
        const collisions=await this.db.one('SELECT count(*) n FROM users WHERE phone_identity_group(phone)=? AND id<>?',c.canonical_group,c.user_id);
        if(collisions!.n)return bad();
        if(recovery) {
          // The KDF ran before this transaction; revalidate that the admitted proof is still
          // the one being consumed, so a raced consume/expiry can never apply a late reset.
          const hashedPassword=password!.prepared;
          if(!hashedPassword)return bad();
          await this.db.run('UPDATE users SET password=? WHERE id=?',hashedPassword,user.id);
          const pending = await this.db.run('DELETE FROM firebase_resets WHERE user_id=?',user.id);
          const reset=firebaseReset;if(pending.changes && reset)this.db.defer(()=>reset.deleteUser(user.id).catch(()=>{}));
          await this.db.run('DELETE FROM sessions WHERE user_id=?',user.id);
          await this.db.run('DELETE FROM push_subscriptions WHERE user_id=?',user.id);
          for(const identifier of [user.phone,user.email?.toLowerCase(),c.target_e164,...(parsePhoneNumber(c.target_e164,'PS')?.aliases??[])].filter(Boolean))
            await this.db.run('DELETE FROM request_limits WHERE key=?',`login:${digest(identifier)}`);
        } else {
          const number=parsePhoneNumber(c.display_phone,c.country_context)!;
          if(c.purpose==='change') {
            if(user.role==='admin')return bad();
            await this.db.run("UPDATE phone_mappings SET state='retired',version=version+1 WHERE user_id=? AND canonical_group<>? AND state='verified'",user.id,c.canonical_group);
            await this.db.run('UPDATE users SET phone=?,phone_verified_at=? WHERE id=?',number.national,Date.now(),user.id);
            await this.db.run('DELETE FROM sessions WHERE user_id=?',user.id);await this.db.run('DELETE FROM push_subscriptions WHERE user_id=?',user.id);
          } else await this.db.run('UPDATE users SET phone_verified_at=? WHERE id=?',Date.now(),user.id);
          const current=(await this.db.one('SELECT phone FROM users WHERE id=?',user.id))!;
          await this.db.run("UPDATE phone_mappings SET state='verified',legacy_phone=?,version=version+1 WHERE canonical_group=? AND user_id=?",current.phone,c.canonical_group,user.id);
          await this.db.run(`INSERT INTO phone_profiles(user_id,display_phone,candidate_e164,canonical_group,country_context,calling_code,verification_state,verified_at,updated_at)
            VALUES(?,?,?,?,?,?,'verified',?,?) ON CONFLICT(user_id) DO UPDATE SET display_phone=excluded.display_phone,candidate_e164=excluded.candidate_e164,canonical_group=excluded.canonical_group,
            country_context=excluded.country_context,calling_code=excluded.calling_code,verification_state='verified',verified_at=excluded.verified_at,updated_at=excluded.updated_at`,
            user.id,number.display,number.e164,number.canonicalGroup,'PS',number.callingCode,Date.now(),Date.now());
        }
        await this.db.run('UPDATE phone_challenges SET consumed_at=? WHERE id=?::uuid',Date.now(),challengeId);
        await this.db.run('UPDATE phone_challenges SET superseded_at=? WHERE user_id=? AND id<>?::uuid AND consumed_at IS NULL AND superseded_at IS NULL',Date.now(),user.id,challengeId);
        await this.audit(recovery?'password_recovered':c.purpose==='change'?'phone_changed':'phone_verified',c,user.id,ctx.user?.id??null,'One-use phone control proof accepted');
        return ok({ok:true,...(!recovery?{phoneVerified:true,sessionsRevoked:c.purpose==='change'}:{})});
      },password);
  }
  async self(ctx:Context) {
    await this.available(false);
    return this.db.atomic({id:ctx.user?.id,correlationId:randomUUID()},async()=>{
      const {user}=await this.actor(ctx);
      const challenges=await this.db.all('SELECT id,purpose,delivery_state,expires_at,attempts,resend_at,send_lease_until FROM phone_challenges WHERE actor_id=? AND session_hash=? ORDER BY created_at DESC LIMIT 10',user.id,this.session(ctx.req));
      return {identityRevision:user.phone_revision,legacyPhone:user.phone,profile:await this.db.one('SELECT * FROM phone_profiles WHERE user_id=?',user.id)??null,
        mappings:await this.db.all('SELECT canonical_group,routing_e164,state,version,country_context FROM phone_mappings WHERE user_id=?',user.id),
        challenges:challenges.map(c=>({...c,effectiveDeliveryState:['prepared','requested'].includes(c.delivery_state) && c.send_lease_until<Date.now()?'unknown':c.delivery_state})),capabilities:await this.capabilities()};
    });
  }
  async review(ctx:Context) {
    if(ctx.user?.role!=='admin')this.fail(403,'forbidden');await this.available(false);
    await this.reconcileStale();
    return {collisions:await this.db.all(`SELECT phone_identity_group(phone) canonical_group,array_agg(id ORDER BY id) user_ids FROM users
      WHERE phone_identity_group(phone) IS NOT NULL GROUP BY phone_identity_group(phone) HAVING count(*)>1 LIMIT 100`),
      mappings:await this.db.all('SELECT * FROM phone_mappings ORDER BY reviewed_at DESC LIMIT 100'),
      providerReview:await this.db.all("SELECT id,purpose,delivery_state,send_lease_until,provider_status,budget_day,budget_released FROM phone_challenges WHERE delivery_state IN('failed','unknown','prepared','requested') ORDER BY created_at DESC LIMIT 100"),
      budgets:await this.db.all('SELECT * FROM phone_provider_budget ORDER BY day DESC LIMIT 7')};
  }
  async map(ctx:Context) {
    if(ctx.user?.role!=='admin')this.fail(403,'forbidden');
    this.fields(ctx.body,['userId','phone','countryContext','routingPhone','expectedVersion','state','reason','evidenceRef']);
    const userId=this.int(ctx.body.userId,1),phone=this.phone(ctx.body.phone,ctx.body.countryContext),routing=this.phone(ctx.body.routingPhone,ctx.body.countryContext),expected=this.int(ctx.body.expectedVersion);
    // Both land in the append-only audit, which outlives the account: a phone number typed here could never be erased.
    if(phone.canonicalGroup!==routing.canonicalGroup || !['reviewed','suspended'].includes(ctx.body.state) || typeof ctx.body.reason!=='string' || ctx.body.reason.trim().length<5 || ctx.body.reason.length>500
      || typeof ctx.body.evidenceRef!=='string' || !/^[A-Za-z0-9_.:/-]{3,160}$/.test(ctx.body.evidenceRef) || holdsPhoneNumber(ctx.body.reason) || holdsPhoneNumber(ctx.body.evidenceRef))this.fail(400,'invalid_input');
    await this.available(false);
    const response=await this.db.atomic({id:ctx.user!.id,correlationId:randomUUID()},async()=>{
      await this.lock('identity_commands');
      if((await this.actor(ctx)).user.role!=='admin')return bad('forbidden',403);
      await this.lock(`phone:${phone.canonicalGroup}`);
      const user=await this.db.one('SELECT id,phone FROM users WHERE id=? FOR UPDATE',userId);if(!user)return bad('not_found',404);
      const old=await this.db.one('SELECT * FROM phone_mappings WHERE canonical_group=? FOR UPDATE',phone.canonicalGroup);
      const conflicting=await this.db.one('SELECT count(*) n FROM users WHERE phone_identity_group(phone)=? AND id<>?',phone.canonicalGroup,userId);
      if(conflicting!.n || (old && old.user_id!==userId))return bad('phone_mapping_conflict',409);
      if((old?.version??0)!==expected)return bad('phone_mapping_changed',409);
      const row=await this.db.one(`INSERT INTO phone_mappings(canonical_group,user_id,legacy_phone,routing_e164,country_context,state,reviewer_id,evidence_ref,reason,reviewed_at)
        VALUES(?,?,?,?,'PS',?,?,?,?,?) ON CONFLICT(canonical_group) DO UPDATE SET legacy_phone=excluded.legacy_phone,routing_e164=excluded.routing_e164,state=excluded.state,
        reviewer_id=excluded.reviewer_id,evidence_ref=excluded.evidence_ref,reason=excluded.reason,reviewed_at=excluded.reviewed_at,version=phone_mappings.version+1 RETURNING canonical_group,user_id,state,version`,
        phone.canonicalGroup,userId,user.phone,routing.e164,ctx.body.state,ctx.user!.id,ctx.body.evidenceRef,ctx.body.reason.trim(),Date.now());
      for(const alias of phone.aliases)await this.db.run('INSERT INTO phone_aliases(alias_e164,canonical_group) VALUES(?,?) ON CONFLICT DO NOTHING',alias,phone.canonicalGroup);
      await this.audit('mapping_reviewed',null,userId,ctx.user!.id,ctx.body.reason.trim(),ctx.body.evidenceRef);return ok(row!);
    });
    if(response.status!==200)this.fail(response.status,response.body.error);return response.body;
  }
  /** Same lock order as every phone command: deleting takes this before the account row. */
  async serialize() {if(await phoneSchemaAvailable(this.db))await this.lock('identity_commands');}
  /**
   * Account deletion, inside its transaction: the number stops identifying anyone and can be enrolled again.
   * Challenges stay as rows because the append-only audit references them; the audit keeps ids, not numbers.
   */
  async forget(userId:number,phone:unknown,actorId:number|null) {
    if(!await phoneSchemaAvailable(this.db))return;
    const mapped=(await this.db.all('SELECT canonical_group FROM phone_mappings WHERE user_id=?',userId)).map(r=>r.canonical_group as string);
    const profile=await this.db.one('SELECT canonical_group FROM phone_profiles WHERE user_id=?',userId);
    const groups=new Set<string>(mapped);
    if(profile)groups.add(profile.canonical_group);
    const legacy=parsePhoneNumber(phone,'PS')?.canonicalGroup;if(legacy)groups.add(legacy);
    const now=Date.now(),tombstone=`deleted-${userId}`;
    // A prepared code never reached the provider and now never will, and the dispatcher returns without releasing it.
    // A requested one may have been paid for, so it stays counted.
    for(const c of await this.db.all("SELECT id,budget_day,budget_cost_minor FROM phone_challenges WHERE (user_id=? OR actor_id=?) AND delivery_state='prepared' AND budget_day IS NOT NULL AND budget_released=0",userId,userId)) {
      await this.db.run('UPDATE phone_provider_budget SET reserved_messages=reserved_messages-1,reserved_minor=reserved_minor-? WHERE day=?',c.budget_cost_minor,c.budget_day);
      await this.db.run('UPDATE phone_challenges SET budget_released=1 WHERE id=?::uuid',c.id);
    }
    // An unsent code goes with the account: a send claimed after this finds nothing to do, and the row keeps no destination.
    const scrub=`canonical_group=?,target_e164='',display_phone='',code_digest='',provider_reference=NULL,superseded_at=COALESCE(superseded_at,?),
      delivery_state=CASE WHEN delivery_state IN('prepared','requested') THEN 'obsolete' ELSE delivery_state END,send_lease_until=NULL`;
    await this.db.run(`UPDATE phone_challenges SET ${scrub} WHERE user_id=? OR actor_id=?`,tombstone,now,userId,userId);
    // Requests naming the number with no account attached still name it. A row bound to another account is that account's.
    for(const group of groups)await this.db.run(`UPDATE phone_challenges SET ${scrub} WHERE canonical_group=? AND user_id IS NULL`,tombstone,now,group);
    for(const group of mapped)await this.db.run('DELETE FROM phone_aliases WHERE canonical_group=?',group);
    await this.db.run('DELETE FROM phone_mappings WHERE user_id=?',userId);
    await this.db.run('DELETE FROM phone_profiles WHERE user_id=?',userId);
    await this.audit('account_deleted',null,userId,actorId,'Phone identity removed with the account');
  }
}

export function registerPhoneRoutes(route:Register,phone:PhoneIdentity) {
  route('GET','/api/phone/capabilities',async()=>phone.capabilities(),true);
  route('GET','/api/me/phone',async ctx=>phone.self(ctx));
  route('POST','/api/me/phone/challenges',async ctx=>phone.issue(ctx));
  route('POST','/api/me/phone/verify',async ctx=>phone.prove(ctx));
  route('POST','/api/auth/phone/recovery/challenges',async ctx=>phone.issue(ctx,true),true);
  route('POST','/api/auth/phone/recovery/verify',async ctx=>phone.prove(ctx,true),true);
  route('GET','/api/admin/phone/review',async ctx=>phone.review(ctx));
  route('POST','/api/admin/phone/mappings',async ctx=>phone.map(ctx));
}
