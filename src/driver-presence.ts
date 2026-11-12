import { locationCadence, MIN_GAP, movingHeading, type DriverFix } from './location-delivery.ts';

export type PresenceState = 'offline' | 'starting' | 'online' | 'stale' | 'reconnecting' | 'busy' | 'ineligible' | 'unavailable';
type Pending = { kind:'online'|'offline'; commandId:string };
export type PresenceRecord = { version:1; scope:string; deviceId:string; consentVersion:1; sessionId?:string;
  pending?:Pending; heartbeatSeq:number; locationSeq:number; leaseUntil?:number; lastTriedAt?:number; lastFixAt?:number };
type Reply = { status:number; body?:Record<string,any> };
export type PresenceIO = {
  read:()=>Promise<PresenceRecord|null>; write:(record:PresenceRecord|null)=>Promise<void>;
  token:()=>Promise<string|null>; scope:(token:string)=>Promise<string>; deviceId:()=>Promise<string>; uuid:()=>string;
  request:(path:string,token:string,body?:Record<string,unknown>)=>Promise<Reply>; now:()=>number; monotonic?:()=>number;
  every:(fn:()=>void,ms:number)=>unknown; cancel:(timer:unknown)=>void; state:(state:PresenceState)=>void; error?:(code:string|null,reference?:unknown)=>void;
};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const transient=(status:number)=>status===0||status>=500;
const refused=(status:number)=>status===401||status===403||status===409;

/** No API call, location collection, or presence resumption occurs merely by constructing this controller. */
export function createPresenceController(io:PresenceIO) {
  let active:PresenceRecord|null=null, timer:unknown, generation=0, pendingHere:string|null=null;
  let lastAttemptMonotonic:number|undefined,lastAcceptedMonotonic:number|undefined;
  let queue:Promise<unknown>=Promise.resolve();
  const serial=<T>(work:()=>Promise<T>):Promise<T>=>{
    const next=queue.then(work,work);queue=next.catch(()=>{});return next;
  };
  const cancelTimer=()=>{if(timer!==undefined){io.cancel(timer);timer=undefined;}};
  const invalidate=(state:PresenceState='offline')=>{generation++;active=null;lastAttemptMonotonic=undefined;lastAcceptedMonotonic=undefined;cancelTimer();io.state(state);};
  const report=(reply:Reply)=>{
    const code=reply.status===0?'network':typeof reply.body?.error==='string'&&/^[a-z_]{1,80}$/.test(reply.body.error)?reply.body.error:'server_error';
    io.error?.(code,reply.body?.reference);return code;
  };
  const id=()=>{const value=io.uuid();if(!uuid.test(value))throw new Error('invalid_device_id');return value.toLowerCase();};
  const same=async(token:string,epoch:number)=>epoch===generation && await io.token()===token;
  const bound=async(record:PresenceRecord,token:string,epoch:number)=>await same(token,epoch) && record.scope===await io.scope(token) && await same(token,epoch);
  const saved=async(token:string,deviceId:string)=>{
    const scope=await io.scope(token),record=await io.read();
    if(record && (record.version!==1||record.scope!==scope||record.deviceId!==deviceId||record.consentVersion!==1)) {
      await io.write(null);return {scope,record:null};
    }
    return {scope,record};
  };
  const send=async(path:string,token:string,body?:Record<string,unknown>):Promise<Reply>=>{
    try {return await io.request(path,token,body);} catch {return {status:0};}
  };
  const offline=async(record:PresenceRecord,token:string):Promise<boolean>=>{
    if(!record.sessionId)return false;
    const commandId=record.pending?.kind==='offline'?record.pending.commandId:id();
    const pending={...record,pending:{kind:'offline' as const,commandId}};
    await io.write(pending);
    if(await io.token()!==token)return false;
    const response=await send('/driver/presence/offline',token,{commandId,deviceId:record.deviceId,sessionId:record.sessionId});
    if(await io.token()!==token)return false;
    if(response.status===200 || (response.status===409&&response.body?.error==='presence_session_changed')) {await io.write(null);return true;}
    report(response);
    if(refused(response.status))invalidate('offline');
    return false;
  };
  const finishOnline=async(record:PresenceRecord,token:string,epoch:number):Promise<PresenceRecord|null>=>{
    const commandId=record.pending!.commandId;
    if(!await same(token,epoch))return null;
    const response=await send('/driver/presence/online',token,{commandId,deviceId:record.deviceId,consentVersion:1});
    if(await io.token()!==token)return null;
    if(response.status!==200) {
      if(!transient(response.status))await io.write(null);
      if(epoch!==generation)return null;
      const code=report(response);
      if(refused(response.status))invalidate(code==='presence_protocol_unavailable'?'unavailable':response.status===403?'ineligible':'offline');
      else if(epoch===generation)io.state('reconnecting');
      return null;
    }
    const sessionId=response.body?.sessionId,leaseUntil=response.body?.leaseUntil;
    if(typeof sessionId!=='string'||!uuid.test(sessionId)||!Number.isSafeInteger(leaseUntil))throw new Error('invalid_presence_response');
    const next:PresenceRecord={...record,sessionId,leaseUntil,pending:undefined,heartbeatSeq:0,locationSeq:0};
    await io.write(next);return next;
  };
  const startPresence=(consented:boolean)=>{
    if(!consented)return Promise.reject(new Error('consent_required'));
    const epoch=++generation;cancelTimer();active=null;lastAttemptMonotonic=undefined;lastAcceptedMonotonic=undefined;io.error?.(null);io.state('starting');
    return serial(async()=>{
      const token=await io.token();if(!token){if(epoch===generation)io.state('offline');return false;}if(!await same(token,epoch))return false;
      const deviceId=await io.deviceId();if(!uuid.test(deviceId))throw new Error('invalid_device_id');
      const loaded=await saved(token,deviceId);let record=loaded.record;
      if(!await same(token,epoch))return false;
      if(record?.pending?.kind==='online') {
        const own=pendingHere===record.pending.commandId;
        const recovered=await finishOnline(record,token,epoch);
        if(!recovered)return false;
        record=recovered;
        // In-process retries may use the recovered session. A fresh launch must end it first.
        if(own && await same(token,epoch)) {active=record;io.state('stale');startTimer();return true;}
      }
      if(record?.sessionId) {
        if(!await offline(record,token)) {if(epoch===generation)io.state('reconnecting');return false;}
        record=null;
      } else if(record?.pending) {
        // An incomplete receipt without a session cannot safely authorize a new upload.
        if(epoch===generation)io.state('reconnecting');return false;
      }
      if(!await same(token,epoch))return false;
      // If local context was lost, ask the server before starting so an old same-device
      // session cannot silently become this launch's session.
      const status=await send('/driver/presence',token);
      if(!await same(token,epoch))return false;
      if(status.status!==200) {
        const code=report(status);
        if(refused(status.status))invalidate(code==='presence_protocol_unavailable'?'unavailable':status.status===403?'ineligible':'offline');
        else io.state('reconnecting');
        return false;
      }
      const serverState=status.body?.state;
      if(!['offline','online','location_stale','busy','not_eligible'].includes(serverState) ||
        (['online','location_stale','busy'].includes(serverState) && typeof status.body?.sessionId!=='string')) {
        report({status:502});io.state('reconnecting');return false;
      }
      if(status.body?.sessionId!==undefined) {
        const oldId=status.body.sessionId;
        if(typeof oldId!=='string'||!uuid.test(oldId))throw new Error('invalid_presence_response');
        const prior:PresenceRecord={version:1,scope:loaded.scope,deviceId,consentVersion:1,sessionId:oldId,heartbeatSeq:0,locationSeq:0};
        if(!await offline(prior,token)) {if(epoch===generation)io.state('reconnecting');return false;}
      }
      if(!await same(token,epoch))return false;
      const commandId=id();pendingHere=commandId;
      const pending:PresenceRecord={version:1,scope:loaded.scope,deviceId,consentVersion:1,pending:{kind:'online',commandId},heartbeatSeq:0,locationSeq:0};
      await io.write(pending);
      const next=await finishOnline(pending,token,epoch);
      if(!next)return false;
      if(!await same(token,epoch))return false;
      active=next;io.state('stale');startTimer();return true;
    });
  };
  const startTimer=()=>{cancelTimer();timer=io.every(()=>{const epoch=generation;void heartbeatPresence().catch(()=>{
    if(epoch===generation){io.error?.('storage_unavailable');invalidate('unavailable');}
  });},15000);};
  const stopPresence=()=>{
    io.error?.(null);invalidate();
    return serial(async()=>{
      const token=await io.token(),record=await io.read();
      if(!token){if(record)await io.write(null);return false;}if(!record)return false;
      if(record.scope!==await io.scope(token)){await io.write(null);return false;}
      if(!record.sessionId)return false; // uncertain online command: let its server lease expire
      return offline(record,token);
    });
  };
  const heartbeatPresence=()=>serial(async()=>{
    const record=active,epoch=generation,token=await io.token();
    if(!record)return false;
    if(!token||!await bound(record,token,epoch)){if(epoch===generation){invalidate();await io.write(null);}return false;}
    const next={...record,heartbeatSeq:record.heartbeatSeq+1};
    if(!Number.isSafeInteger(next.heartbeatSeq)){invalidate('offline');return false;}
    await io.write(next);
    if(!await same(token,epoch))return false;active=next;
    const result=await send('/driver/presence/heartbeat',token,{deviceId:next.deviceId,sessionId:next.sessionId,seq:next.heartbeatSeq});
    if(!await same(token,epoch))return false;
    if(refused(result.status)){const code=report(result);invalidate(code==='presence_active_job'?'busy':result.status===403?'ineligible':'offline');return false;}
    if(result.status!==200||!Number.isSafeInteger(result.body?.leaseUntil)){report(result);io.state('reconnecting');return false;}
    next.leaseUntil=result.body!.leaseUntil;await io.write(next);
    if(!await same(token,epoch))return false;active=next;
    if(lastAcceptedMonotonic===undefined || (io.monotonic?.()??io.now())-lastAcceptedMonotonic>=30000)io.state('stale');
    return true;
  });
  const deliverPresenceFix=(fix:DriverFix)=>{
    // Queue behind a pending command/heartbeat instead of dropping: the serial
    // cadence and freshness checks inside still discard fixes that aged out.
    return serial(async()=>{
    const record=active,epoch=generation,token=await io.token(),now=io.now(),monotonic=io.monotonic?.()??now;
    if(!record)return false;
    if(!token||!await bound(record,token,epoch)){if(epoch===generation){invalidate();await io.write(null);}return false;}
    const {latitude,longitude,accuracy,speed}=fix.coords;
    if(fix.mocked===true||!Number.isFinite(fix.timestamp)||fix.timestamp>now+5000||now-fix.timestamp>30000||
      !Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||(latitude===0&&longitude===0))return false;
    const clockRewound=record.lastTriedAt!==undefined && now<record.lastTriedAt-5000;
    if(!clockRewound && record.lastFixAt!==undefined && fix.timestamp<=record.lastFixAt)return false;
    const elapsed=lastAttemptMonotonic!==undefined ? monotonic-lastAttemptMonotonic : record.lastTriedAt===undefined?Infinity:now-record.lastTriedAt;
    if(elapsed<Math.max(MIN_GAP,locationCadence(speed,accuracy)))return false;
    const next={...record,locationSeq:record.locationSeq+1,lastTriedAt:now,...(clockRewound?{lastFixAt:undefined}:{})};
    if(!Number.isSafeInteger(next.locationSeq)){invalidate('offline');return false;}
    await io.write(next);
    if(!await same(token,epoch))return false;active=next;lastAttemptMonotonic=monotonic;
    const heading=movingHeading(fix.coords.heading,speed,accuracy);
    const result=await send('/driver/presence/location',token,{deviceId:next.deviceId,sessionId:next.sessionId,seq:next.locationSeq,
      ageMs:Math.max(0,Math.round(now-fix.timestamp)),latitude,longitude,
      ...(typeof accuracy==='number'&&Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=5000?{accuracy}:{}),...(heading!==undefined?{heading}:{})});
    if(!await same(token,epoch))return false;
    if(refused(result.status)) {const code=report(result);invalidate(code==='presence_active_job'?'busy':result.status===403?'ineligible':'offline');return false;}
    if(result.status!==200){report(result);io.state('reconnecting');return false;}
    if(result.body?.accepted!==true){io.state('stale');return false;}
    next.lastFixAt=fix.timestamp;await io.write(next);
    if(!await same(token,epoch))return false;active=next;lastAcceptedMonotonic=monotonic;io.error?.(null);
    io.state('online');return true;
    });
  };
  /** Drop in-memory authority immediately; used before logout or an account switch. */
  const suspend=()=>invalidate();
  const markReconnecting=()=>{if(active)io.state('reconnecting');};
  return {startPresence,stopPresence,heartbeatPresence,deliverPresenceFix,suspend,markReconnecting};
}
