import { API_URL, ApiError, storage } from './api';
import { digest, keyValue, newUuid } from './phone/client';
import { stableDeviceId } from './phone/command';
import { createPresenceController, type PresenceRecord, type PresenceState } from './driver-presence';

const CONTEXT='wind.presence.context';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const listeners=new Set<(state:PresenceState)=>void>();
const errorListeners=new Set<(error:string|null)=>void>();
let current:PresenceState='offline';
let currentError:string|null=null;
const emit=(state:PresenceState)=>{current=state;for(const listener of listeners)listener(state);};
const emitError=(error:string|null)=>{currentError=error;for(const listener of errorListeners)listener(error);};
const get=async(key:string)=>{try{return await storage.get(key,true);}catch{throw new ApiError('storage_unavailable');}};
const put=async(key:string,value:string|null)=>{try{await storage.set(key,value,true);}catch{throw new ApiError('storage_unavailable');}};
async function read():Promise<PresenceRecord|null> {
  const raw=await get(CONTEXT);if(!raw)return null;
  try {
    const value=JSON.parse(raw) as PresenceRecord;
    if(value && value.version===1 && typeof value.scope==='string' && /^[a-f0-9]{64}$/i.test(value.scope) &&
      typeof value.deviceId==='string' && uuid.test(value.deviceId) && value.consentVersion===1 &&
      Number.isSafeInteger(value.heartbeatSeq) && value.heartbeatSeq>=0 && Number.isSafeInteger(value.locationSeq) && value.locationSeq>=0 &&
      (value.sessionId===undefined || (typeof value.sessionId==='string' && uuid.test(value.sessionId))) &&
      (value.pending===undefined || (['online','offline'].includes(value.pending.kind) && uuid.test(value.pending.commandId))) &&
      (value.leaseUntil===undefined || Number.isSafeInteger(value.leaseUntil)) && (value.lastTriedAt===undefined || Number.isSafeInteger(value.lastTriedAt)) &&
      (value.lastFixAt===undefined || Number.isSafeInteger(value.lastFixAt)))return value;
  } catch { /* Clear an invalid envelope before checking the server on an explicit start. */ }
  await put(CONTEXT,null);return null;
}
const controller=createPresenceController({
  read,write:record=>put(CONTEXT,record?JSON.stringify(record):null),
  token:()=>get('token'),scope:digest,deviceId:()=>stableDeviceId(keyValue,newUuid),uuid:newUuid,
  now:Date.now,monotonic:()=>globalThis.performance?.now?.()??Date.now(),every:(fn,ms)=>setInterval(fn,ms),cancel:timer=>clearInterval(timer as ReturnType<typeof setInterval>),state:emit,error:emitError,
  request:async(path,token,body)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch(`${API_URL}/api${path}`,{method:body?'POST':'GET',signal:controller.signal,
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body&&{body:JSON.stringify(body)})});
      const result=await response.json().catch(()=>null);
      return {status:response.status,body:result && typeof result==='object' && !Array.isArray(result)?result:undefined};
    } finally {clearTimeout(timer);}
  },
});

export const startPresence=(consented:boolean)=>controller.startPresence(consented);
export const stopPresence=()=>controller.stopPresence();
export const heartbeatPresence=()=>controller.heartbeatPresence();
export const deliverPresenceFix=controller.deliverPresenceFix;
export const suspendPresence=controller.suspend;
export const markPresenceReconnecting=controller.markReconnecting;
export const presenceState=()=>current;
export function subscribePresence(listener:(state:PresenceState)=>void) {listeners.add(listener);listener(current);return ()=>{listeners.delete(listener);};}
export function subscribePresenceError(listener:(error:string|null)=>void) {errorListeners.add(listener);listener(currentError);return ()=>{errorListeners.delete(listener);};}

/** No old session is resumed on launch; discard records belonging to another account. */
export async function validatePresenceContextOnLaunch() {
  controller.suspend();
  const record=await read();if(!record)return;
  const token=await get('token');
  if(!token||record.scope!==await digest(token))await put(CONTEXT,null);
}
