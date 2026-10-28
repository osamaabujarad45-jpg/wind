import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
const state={store:new Map(),calls:[],id:0};globalThis.__presenceRuntimeTest=state;
const originalFetch=globalThis.fetch;
const modules={
  './api':`const n=globalThis.__presenceRuntimeTest;export const API_URL='https://example.test';export class ApiError extends Error{};
    export const storage={get:async(key)=>n.store.get(key)??null,set:async(key,value)=>{if(value===null)n.store.delete(key);else n.store.set(key,value);}};`,
  './phone/client':`import { createHash } from 'node:crypto';const n=globalThis.__presenceRuntimeTest;
    export const keyValue={};export const digest=async(value)=>createHash('sha256').update(value).digest('hex');
    export const newUuid=()=>\`00000000-0000-4000-8000-\${String(++n.id).padStart(12,'0')}\`;`,
  './phone/command':`export const stableDeviceId=async()=> '00000000-0000-4000-8000-000000000099';`,
};
const hooks=registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.endsWith('/src/driver-presence-runtime.ts')) {
    if(specifier in modules)return {url:'presence-runtime:'+specifier,shortCircuit:true};
    if(specifier==='./driver-presence')return {url:new URL('../src/driver-presence.ts',import.meta.url).href,shortCircuit:true};
  }
  return next(specifier,context);
},load(url,context,next){if(url.startsWith('presence-runtime:'))return {format:'module',source:modules[url.slice(17)],shortCircuit:true};return next(url,context);}});
try {
  globalThis.fetch=async(url,options)=>{state.calls.push({url,options});
    const body=url.endsWith('/online')?{sessionId:'00000000-0000-4000-8000-000000000088',leaseUntil:Date.now()+60000}:
      url.endsWith('/location')?{accepted:true}:{state:'offline',ok:true};
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});};
  const runtime=await import('../src/driver-presence-runtime.ts');
  state.store.set('token','synthetic-account');state.store.set('wind.presence.context','{broken');
  await runtime.validatePresenceContextOnLaunch();assert.equal(state.store.has('wind.presence.context'),false);assert.equal(state.calls.length,0,'launch never resumes or sends a request');
  const scope=createHash('sha256').update('another-account').digest('hex');
  state.store.set('wind.presence.context',JSON.stringify({version:1,scope,deviceId:'00000000-0000-4000-8000-000000000099',consentVersion:1,heartbeatSeq:0,locationSeq:0}));
  await runtime.validatePresenceContextOnLaunch();assert.equal(state.store.has('wind.presence.context'),false,'another account cannot retain the old envelope');
  assert.equal(await runtime.startPresence(true),true);assert.equal(state.calls.filter(x=>x.url.endsWith('/online')).length,1);
  const stored=state.store.get('wind.presence.context');assert.ok(stored&&!stored.includes('synthetic-account'),'stored envelope contains no bearer token');
  assert.equal(await runtime.deliverPresenceFix({timestamp:Date.now(),coords:{latitude:31.9,longitude:35.2,accuracy:10}}),true);
  state.store.delete('token');assert.equal(await runtime.stopPresence(),false);assert.equal(state.store.has('wind.presence.context'),false);
  console.log('WP07 presence runtime: cold-launch cleanup, account binding, secure envelope and logout passed');
} finally {globalThis.fetch=originalFetch;hooks.deregister();delete globalThis.__presenceRuntimeTest;}
