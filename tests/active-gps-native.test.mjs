import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
globalThis.__DEV__=true; process.env.EXPO_PUBLIC_TEST_ACTIVE_GPS='1';
const state={store:new Map([['token','t']]), task:null, requests:[], session:null, generation:0, seq:0, now:Date.now()};
globalThis.__activeNative=state;
const modules={
  'react-native':`export const Platform={OS:'android'};`,
  'expo-location':`export const Accuracy={High:1},ActivityType={AutomotiveNavigation:1};export async function startLocationUpdatesAsync(){};export async function stopLocationUpdatesAsync(){};export async function hasStartedLocationUpdatesAsync(){return true}`,
  'expo-task-manager':`export const isTaskDefined=()=>false;export function defineTask(_name,task){globalThis.__activeNative.task=task}`,
  'expo-crypto':`let n=0;export const randomUUID=()=> 'uuid-'+(++n);`,
  'expo-secure-store':`const s=globalThis.__activeNative.store;export const AFTER_FIRST_UNLOCK=8;export async function getItemAsync(k){return s.get(k)??null};export async function setItemAsync(k,v){s.set(k,v)};export async function deleteItemAsync(k){s.delete(k)}`,
  './api':`export const API_URL='https://example.test';`,
};
const hooks=registerHooks({resolve(specifier,context,next){if(context.parentURL?.endsWith('/src/background-location.ts')){
  if(specifier in modules)return {url:'test:'+specifier,shortCircuit:true};
  if(specifier==='./location-delivery'||specifier==='./active-gps-session')return {url:new URL('../src/'+specifier.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
}return next(specifier,context);},load(url,context,next){if(url.startsWith('test:'))return {format:'module',source:modules[url.slice(5)],shortCircuit:true};return next(url,context);}});
const previousFetch=globalThis.fetch, previousNow=Date.now;
const performanceDescriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>state.now}});
Date.now=()=>state.now;
globalThis.fetch=async (url,options)=>{
  const body=JSON.parse(options.body);state.requests.push({url,body});
  if(url.endsWith('/session')) {
    if(!body.sessionId)return Response.json({sessionId:state.session,generation:state.generation});
    if(body.sessionId!==state.session){state.session=body.sessionId;state.generation++;}
    return Response.json({sessionId:state.session,generation:state.generation,seq:state.seq,assignments:[{orderId:3,assignmentEpoch:1},{orderId:4,assignmentEpoch:2}]});
  }
  state.seq=body.activeGps.seq;
  return Response.json({accepted:true});
};
try {
  const location=await import('../src/background-location.ts');
  await location.startBackgroundLocation(2,3,[3,4]);
  const fix=()=>({timestamp:state.now,coords:{latitude:32,longitude:35}});
  await state.task({data:{locations:[fix()]}});
  assert.equal(state.seq,1);
  const device=state.requests[0].body.deviceId;
  await location.stopBackgroundLocation();
  await location.startBackgroundLocation(2,3,[3,4]);
  state.now+=15_000;
  await state.task({data:{locations:[fix()]}});
  assert.equal(state.seq,2,'reacquisition opens a new session and uploads continue from its server sequence');
  assert.equal(state.requests.at(-1).body.activeGps.deviceId,device,'device identity remains stable');
  assert.equal(state.requests.at(-1).body.activeGps.assignments.length,2,'all parcel assignments are sent');
  const serverFetch=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{if(url.endsWith('/location'))throw Error('offline before server');return serverFetch(url,options);};
  state.now+=15_000;await state.task({data:{locations:[fix()]}});
  globalThis.fetch=serverFetch;
  await location.stopBackgroundLocation();await location.startBackgroundLocation(2,3,[3,4]);
  state.now+=15_000;await state.task({data:{locations:[fix()]}});
  assert.equal(state.seq,3,'a fresh session restarts its sequence; the failed delivery gap stays in the previous session');
  state.store.set('token','other');state.now+=15_000;
  const count=state.requests.length;await state.task({data:{locations:[fix()]}});
  assert.equal(state.requests.length,count,'account change prevents a background upload');
  console.log('PASS native active GPS persistence, assignments and logout');
} finally {hooks.deregister();Date.now=previousNow;globalThis.fetch=previousFetch;if(performanceDescriptor)Object.defineProperty(globalThis,'performance',performanceDescriptor);else delete globalThis.performance;delete globalThis.__activeNative;delete globalThis.__DEV__;delete process.env.EXPO_PUBLIC_TEST_ACTIVE_GPS;}
