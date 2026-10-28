import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Persistence, Row } from '../db/persistence.ts';
import { Eligibility, dispatchEnabled } from './eligibility.ts';

type Actor = { id:number; role:string; status:string };
type Context = { user:Actor; body:Row; req:IncomingMessage };
type Register = (method:string,path:string,handler:(ctx:Context)=>Promise<unknown>)=>unknown;
type Fail = (status:number,message:string)=>never;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const radians=(n:number)=>n*Math.PI/180;
const distance=(a:number,b:number,c:number,d:number)=>{
  const p=radians(c-a),q=radians(d-b),v=Math.sin(p/2)**2+Math.cos(radians(a))*Math.cos(radians(c))*Math.sin(q/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(v)));
};

export class Presence {
  private db:Persistence; private eligibility:Eligibility; private fail:Fail; private requirePermanentApproval:boolean;
  constructor(db:Persistence,eligibility:Eligibility,fail:Fail,requirePermanentApproval=false) { this.db=db;this.eligibility=eligibility;this.fail=fail;this.requirePermanentApproval=requirePermanentApproval; }
  private fields(body:Row,allowed:string[]) { if (!body || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k))) this.fail(400,'invalid_input'); }
  private id(value:unknown) { if(typeof value!=='string'||!uuid.test(value))this.fail(400,'invalid_input');return (value as string).toLowerCase(); }
  private integer(value:unknown,min:number,max:number) { if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)this.fail(400,'invalid_input');return value as number; }
  private number(value:unknown,min:number,max:number) { if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)this.fail(400,'invalid_location');return value as number; }
  private token(req:IncomingMessage) { const value=/^Bearer (\w+)$/.exec(req.headers.authorization??'')?.[1];if(!value)this.fail(401,'unauthorized');return hash(value!); }
  private async available() {
    if(this.db.backend!=='postgres'||!await this.db.one('SELECT version FROM schema_migrations WHERE version=9'))this.fail(409,'presence_protocol_unavailable');
  }
  /** Bounded privacy maintenance. Transactions skip rows owned by a live writer. */
  async sweep() {
    if(this.db.backend!=='postgres')return 0;
    const schema=await this.db.one("SELECT to_regclass('schema_migrations') m,to_regclass('driver_presence_sessions') p");
    if(!schema?.m||!schema.p||!await this.db.one('SELECT version FROM schema_migrations WHERE version=9'))return 0;
    return this.db.atomic({purpose:'presence_expiry'},async()=>{
      const now=Date.now();
      const candidates=`SELECT s.id,s.driver_id FROM driver_presence_sessions s
        LEFT JOIN users u ON u.id=s.driver_id LEFT JOIN sessions auth ON auth.token_hash=s.auth_session_hash AND auth.user_id=s.driver_id
        LEFT JOIN driver_eligibility d ON d.driver_id=s.driver_id LEFT JOIN vehicles v ON v.id=s.vehicle_id
        LEFT JOIN eligibility_policy p ON p.id=1
        WHERE s.state='online' AND (s.lease_until<=? OR auth.created_at<=? OR u.role IS DISTINCT FROM 'driver' OR u.status IS DISTINCT FROM 'active' OR (?=1 AND u.approved_at IS NULL)
          OR p.activated IS DISTINCT FROM 1 OR p.revision IS DISTINCT FROM s.policy_revision
          OR d.enrolled IS DISTINCT FROM 1 OR d.state IS DISTINCT FROM 'approved' OR d.valid_until<=? OR d.revision IS DISTINCT FROM s.driver_revision OR d.vehicle_id IS DISTINCT FROM s.vehicle_id
          OR v.state IS DISTINCT FROM 'approved' OR v.valid_until<=? OR v.inspection_required IS DISTINCT FROM 0 OR v.revision IS DISTINCT FROM s.vehicle_revision OR u.vehicle IS DISTINCT FROM v.class
          OR NOT COALESCE((SELECT c.outcome='approved' AND c.valid_from<=? AND c.expires_at>? FROM verification_checks c WHERE c.driver_id=s.driver_id AND c.kind='driver_license' AND c.permit_key='' ORDER BY c.id DESC LIMIT 1),false)
          OR NOT COALESCE((SELECT c.outcome='approved' AND c.valid_from<=? AND c.expires_at>? AND c.vehicle_revision=v.revision FROM verification_checks c WHERE c.vehicle_id=v.id AND c.kind='vehicle_registration' AND c.permit_key='' ORDER BY c.id DESC LIMIT 1),false)
          OR NOT COALESCE((SELECT c.outcome='approved' AND c.valid_from<=? AND c.expires_at>? AND c.vehicle_revision=v.revision FROM verification_checks c WHERE c.vehicle_id=v.id AND c.kind='vehicle_inspection' AND c.permit_key='' ORDER BY c.id DESC LIMIT 1),false)
          OR EXISTS(SELECT 1 FROM orders o JOIN driver_vehicles dv ON dv.driver_id=o.driver_id JOIN driver_eligibility selected ON selected.driver_id=dv.driver_id AND selected.vehicle_id=dv.vehicle_id
            LEFT JOIN capacity_reservations r ON r.order_id=o.id AND r.vehicle_id=dv.vehicle_id AND r.driver_id=o.driver_id
            WHERE dv.vehicle_id=v.id AND o.status IN ('assigned','at_pickup','in_transit','on_hold','returning') AND r.order_id IS NULL))`;
      const args=[now,now-90*86400000,this.requirePermanentApproval?1:0,now,now,now,now,now,now,now,now];
      const rows=await this.db.all(`${candidates} ORDER BY s.lease_until,s.driver_id LIMIT 100`,...args);
      let removed=0;
      for(const s of rows) {
        // Request paths take the user lock before the presence lock. Acquire in the
        // same order, then re-evaluate because the lease may have been renewed.
        if(!await this.db.one('SELECT id FROM users WHERE id=? FOR UPDATE SKIP LOCKED',s.driver_id))continue;
        const current=await this.db.one(`${candidates} AND s.driver_id=? FOR UPDATE OF s SKIP LOCKED`,...args,s.driver_id);
        if(!current)continue;
        await this.db.run("UPDATE driver_presence_sessions SET state='offline',lease_until=? WHERE id=?::uuid",now,current.id);
        await this.db.run('DELETE FROM driver_latest_locations WHERE driver_id=?',current.driver_id);
        await this.db.run("INSERT INTO driver_presence_audit(driver_id,session_id,action,consent_version,occurred_at) VALUES(?,?::uuid,'offline',1,?)",current.driver_id,current.id,now);
        removed++;
      }
      // A live heartbeat must not retain an old precise pin indefinitely.
      const stale=await this.db.run(`WITH old_fixes AS (SELECT driver_id FROM driver_latest_locations WHERE effective_at<? ORDER BY effective_at LIMIT 100 FOR UPDATE SKIP LOCKED)
        DELETE FROM driver_latest_locations USING old_fixes WHERE driver_latest_locations.driver_id=old_fixes.driver_id`,now-30000);
      return removed+Number(stale.changes);
    });
  }
  private driver(ctx:Context) { if(ctx.user.role!=='driver')this.fail(403,'forbidden'); }
  private async actor(ctx:Context,allowUnapproved=false) {
    const token=this.token(ctx.req),user=await this.db.one('SELECT id,role,status,approved_at FROM users WHERE id=? FOR UPDATE',ctx.user.id);
    if(!user||user.role!=='driver'||user.status!=='active')this.fail(403,'driver_ineligible');
    if(this.requirePermanentApproval&&!allowUnapproved&&user!.approved_at==null)this.fail(403,'pending_approval');
    if(!await this.db.one('SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND created_at>? FOR KEY SHARE',token,user.id,Date.now()-90*86400000))this.fail(401,'unauthorized');
    return token;
  }
  private async valid(ctx:Context,sessionId:string,deviceId:string) {
    const policy=await this.eligibility.lockPolicy('share'),{d,v}=await this.eligibility.base(ctx.user.id,policy),token=await this.actor(ctx);
    const s=await this.db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=? FOR UPDATE',ctx.user.id);
    if(!s||s.id!==sessionId||s.device_hash!==hash(`wp07-device:${deviceId}`)||s.auth_session_hash!==token)this.fail(409,'presence_session_changed');
    if(s.state!=='online'||s.lease_until<=Date.now())this.fail(409,'presence_expired');
    if(s.driver_revision!==d.revision||s.vehicle_revision!==v.revision||s.policy_revision!==policy.revision)this.fail(409,'presence_eligibility_changed');
    return s;
  }
  private async command(ctx:Context,commandId:string,kind:string,input:unknown,work:()=>Promise<Row>) {
    await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',`${ctx.user.id}:${commandId}`);
    const fingerprint=hash(JSON.stringify({kind,input,session:this.token(ctx.req)}));
    const saved=await this.db.one('SELECT payload_hash,response FROM command_results WHERE actor_id=? AND command_id=?',ctx.user.id,commandId);
    if(saved) {
      if(saved.payload_hash!==fingerprint)this.fail(409,'idempotency_conflict');
      const result=JSON.parse(saved.response);
      if(kind==='online') {
        const device=(input as {deviceId:string}).deviceId;
        await this.valid(ctx,result.sessionId,device);
      } else await this.actor(ctx,true);
      return result;
    }
    const result=await work();
    await this.db.run('INSERT INTO command_results(actor_id,command_id,payload_hash,http_status,response,created_at) VALUES(?,?,?,?,?,?)',ctx.user.id,commandId,fingerprint,200,JSON.stringify(result),Date.now());
    return result;
  }
  async status(ctx:Context) {
    this.driver(ctx);await this.available();
    const token=await this.actor(ctx),s=await this.db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=?',ctx.user.id),now=Date.now();
    if(!s||s.auth_session_hash!==token||s.state!=='online'||s.lease_until<=now)return {state:'offline',eligibleForMatching:false};
    const policy=await this.db.one('SELECT * FROM eligibility_policy WHERE id=1'),d=await this.db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',ctx.user.id);
    const v=d && await this.db.one('SELECT * FROM vehicles WHERE id=?',d.vehicle_id);
    const user=await this.db.one('SELECT role,status,vehicle FROM users WHERE id=?',ctx.user.id);
    const eligible=!!(user?.role==='driver'&&user.status==='active'&&policy?.activated&&d?.enrolled&&d.state==='approved'&&d.valid_until>now&&v?.state==='approved'&&v.valid_until>now&&!v.inspection_required&&user.vehicle===v.class&&
      s.driver_revision===d.revision&&s.vehicle_revision===v.revision&&s.policy_revision===policy.revision&&
      await this.eligibility.checked('driver_license',ctx.user.id,v)&&await this.eligibility.checked('vehicle_registration',ctx.user.id,v)&&await this.eligibility.checked('vehicle_inspection',ctx.user.id,v)&&!await this.eligibility.unknown(v.id));
    if(!eligible)return {state:'not_eligible',eligibleForMatching:false};
    if(await this.db.one("SELECT 1 FROM orders WHERE driver_id=? AND status IN ('assigned','at_pickup','in_transit','on_hold','returning') LIMIT 1",ctx.user.id))
      return {state:'busy',sessionId:s.id,leaseUntil:s.lease_until,eligibleForMatching:false,reason:'dispatch_not_enabled'};
    const fix=await this.db.one('SELECT effective_at FROM driver_latest_locations WHERE driver_id=? AND session_id=?::uuid',ctx.user.id,s.id);
    const fresh=!!(fix&&fix.effective_at>=now-30000);
    if(dispatchEnabled()&&fresh)return {state:'online',sessionId:s.id,leaseUntil:s.lease_until,eligibleForMatching:true};
    return {state:fresh?'online':'location_stale',sessionId:s.id,leaseUntil:s.lease_until,eligibleForMatching:false,reason:'dispatch_not_enabled'};
  }
  async online(ctx:Context) {
    this.fields(ctx.body,['commandId','deviceId','consentVersion']);const commandId=this.id(ctx.body.commandId),deviceId=this.id(ctx.body.deviceId);
    if(ctx.body.consentVersion!==1)this.fail(400,'consent_required');this.driver(ctx);await this.available();
    return this.command(ctx,commandId,'online',{deviceId,consentVersion:1},async()=>{
      const policy=await this.eligibility.lockPolicy('share'),{d,v}=await this.eligibility.base(ctx.user.id,policy),token=await this.actor(ctx);
      const prior=await this.db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=? FOR UPDATE',ctx.user.id),now=Date.now(),device=hash(`wp07-device:${deviceId}`);
      if(prior?.state==='online' && prior.lease_until>now) {
        if(prior.auth_session_hash!==token||prior.device_hash!==device)this.fail(409,'presence_device_in_use');
        if(prior.driver_revision!==d.revision||prior.vehicle_revision!==v.revision||prior.policy_revision!==policy.revision)this.fail(409,'presence_eligibility_changed');
        return {sessionId:prior.id,leaseUntil:prior.lease_until};
      }
      if(prior)await this.db.run('DELETE FROM driver_presence_sessions WHERE driver_id=?',ctx.user.id);
      const sessionId=randomUUID();
      await this.db.run(`INSERT INTO driver_presence_sessions(id,driver_id,auth_session_hash,device_hash,vehicle_id,driver_revision,vehicle_revision,policy_revision,consent_version,consented_at,started_at,heartbeat_at,lease_until,state)
        VALUES(?::uuid,?,?,?,?,?,?,?,?,?,?,?,?,?)`,sessionId,ctx.user.id,token,device,v.id,d.revision,v.revision,policy.revision,1,now,now,now,now+60000,'online');
      await this.db.run("INSERT INTO driver_presence_audit(driver_id,session_id,action,consent_version,occurred_at) VALUES(?,?::uuid,'online',1,?)",ctx.user.id,sessionId,now);
      return {sessionId,leaseUntil:now+60000};
    });
  }
  async offline(ctx:Context) {
    this.fields(ctx.body,['commandId','deviceId','sessionId']);const commandId=this.id(ctx.body.commandId),deviceId=this.id(ctx.body.deviceId),sessionId=this.id(ctx.body.sessionId);this.driver(ctx);await this.available();
    return this.command(ctx,commandId,'offline',{deviceId,sessionId},async()=>{
      const token=await this.actor(ctx,true),s=await this.db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=? FOR UPDATE',ctx.user.id);
      if(!s||s.id!==sessionId||s.device_hash!==hash(`wp07-device:${deviceId}`)||s.auth_session_hash!==token)this.fail(409,'presence_session_changed');
      if(s.state==='online') {
        await this.db.run("UPDATE driver_presence_sessions SET state='offline',lease_until=? WHERE id=?::uuid",Date.now(),sessionId);
        await this.db.run('DELETE FROM driver_latest_locations WHERE driver_id=?',ctx.user.id);
        await this.db.run("INSERT INTO driver_presence_audit(driver_id,session_id,action,consent_version,occurred_at) VALUES(?,?::uuid,'offline',1,?)",ctx.user.id,sessionId,Date.now());
      }
      return {ok:true};
    });
  }
  async heartbeat(ctx:Context) {
    this.fields(ctx.body,['deviceId','sessionId','seq']);const deviceId=this.id(ctx.body.deviceId),sessionId=this.id(ctx.body.sessionId),seq=this.integer(ctx.body.seq,1,Number.MAX_SAFE_INTEGER);this.driver(ctx);await this.available();
    const s=await this.valid(ctx,sessionId,deviceId);
    if(seq<s.heartbeat_seq)this.fail(409,'presence_sequence_old');
    if(seq===s.heartbeat_seq)return {leaseUntil:s.lease_until,deduplicated:true};
    const now=Date.now();await this.db.run('UPDATE driver_presence_sessions SET heartbeat_seq=?,heartbeat_at=?,lease_until=? WHERE id=?::uuid',seq,now,now+60000,sessionId);
    return {leaseUntil:now+60000,deduplicated:false};
  }
  async location(ctx:Context) {
    this.fields(ctx.body,['deviceId','sessionId','seq','ageMs','latitude','longitude','accuracy','heading']);
    const deviceId=this.id(ctx.body.deviceId),sessionId=this.id(ctx.body.sessionId),seq=this.integer(ctx.body.seq,1,Number.MAX_SAFE_INTEGER),age=this.integer(ctx.body.ageMs,0,86400000);
    const lat=this.number(ctx.body.latitude,-90,90),lng=this.number(ctx.body.longitude,-180,180);
    if(lat===0&&lng===0)this.fail(400,'invalid_location');
    const accuracy=ctx.body.accuracy==null||ctx.body.accuracy===-1?null:this.number(ctx.body.accuracy,0,5000),heading=ctx.body.heading==null||ctx.body.heading===-1?null:this.number(ctx.body.heading,0,360);
    this.driver(ctx);await this.available();const s=await this.valid(ctx,sessionId,deviceId),now=Date.now(),at=now-age;
    if(await this.db.one("SELECT 1 FROM orders WHERE driver_id=? AND status IN ('assigned','at_pickup','in_transit','on_hold','returning') LIMIT 1",ctx.user.id))this.fail(409,'presence_active_job');
    if(seq<=s.location_seq)return {accepted:false,reason:'sequence_old'};
    await this.db.run('UPDATE driver_presence_sessions SET location_seq=? WHERE id=?::uuid',seq,sessionId);
    const last=await this.db.one('SELECT * FROM driver_latest_locations WHERE driver_id=?',ctx.user.id);
    if(age>30000||at<s.started_at)return {accepted:false,reason:'stale'};
    if(last && (now-last.received_at<2000||at<=last.effective_at))return {accepted:false,reason:'rate_or_age'};
    // Accuracy is client-supplied and cannot authorize an otherwise impossible jump.
    // A rejected fix never advances the reference, so the next real fix can recover.
    if(last && distance(last.good_lat,last.good_lng,lat,lng)/Math.max(1,Math.min(at-last.good_at,now-last.received_at)/1000)>70)return {accepted:false,reason:'outlier'};
    await this.db.run(`INSERT INTO driver_latest_locations(driver_id,session_id,lat,lng,accuracy,heading,effective_at,received_at,seq,good_lat,good_lng,good_at,good_accuracy)
      VALUES(?,?::uuid,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(driver_id) DO UPDATE SET session_id=excluded.session_id,lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,heading=excluded.heading,
      effective_at=excluded.effective_at,received_at=excluded.received_at,seq=excluded.seq,good_lat=excluded.good_lat,good_lng=excluded.good_lng,good_at=excluded.good_at,good_accuracy=excluded.good_accuracy`,
      ctx.user.id,sessionId,lat,lng,accuracy,heading,at,now,seq,lat,lng,at,accuracy??50);
    return {accepted:true,effectiveAt:at};
  }
}

export function registerPresenceRoutes(route:Register,p:Presence) {
  route('GET','/api/driver/presence',ctx=>p.status(ctx));
  route('POST','/api/driver/presence/online',ctx=>p.online(ctx));
  route('POST','/api/driver/presence/offline',ctx=>p.offline(ctx));
  route('POST','/api/driver/presence/heartbeat',ctx=>p.heartbeat(ctx));
  route('POST','/api/driver/presence/location',ctx=>p.location(ctx));
}
