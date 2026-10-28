import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const native = { store:new Map(), writes:[], registered:true, foreground:false, starts:[], stops:0, fail:false };
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let now=originalNow();Date.now=()=>now;
const performanceDescriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
globalThis.__windNative = native;
const modules = {
  'react-native': `export const Platform={OS:'android'};`,
  'expo-location': `const n=globalThis.__windNative;export const Accuracy={High:6};export const ActivityType={AutomotiveNavigation:2};
    export const hasStartedLocationUpdatesAsync=async()=>n.registered;
    export async function startLocationUpdatesAsync(task,options){n.starts.push({task,options});if(n.blockStart)await n.blockStart;if(n.fail)throw Error('Native start failed');n.registered=true;n.foreground=true;}
    export async function stopLocationUpdatesAsync(){n.stops++;n.registered=false;n.foreground=false;}`,
  'expo-task-manager': `export const isTaskDefined=()=>false;export function defineTask(name,task){globalThis.__windNative.task=task;}`,
  'expo-crypto': `let n=0;export const randomUUID=()=>\`synthetic-\${++n}\`;`,
  'expo-secure-store': `const n=globalThis.__windNative;export const AFTER_FIRST_UNLOCK=8;
    export const getItemAsync=async key=>n.store.get(key)??null;
    export const setItemAsync=async(key,value,options)=>{n.writes.push({key,options});n.store.set(key,value)};
    export const deleteItemAsync=async key=>{n.store.delete(key)};`,
  './api': `export const API_URL='https://example.test';`,
};
const hooks=registerHooks({
  resolve(specifier,context,next){
    if(context.parentURL?.endsWith('/src/background-location.ts')) {
      if(specifier in modules)return {url:'wind-test:'+specifier,shortCircuit:true};
      if(specifier==='./location-delivery')return {url:new URL('../src/location-delivery.ts',import.meta.url).href,shortCircuit:true};
      if(specifier==='./active-gps-session')return {url:new URL('../src/active-gps-session.ts',import.meta.url).href,shortCircuit:true};
    }
    return next(specifier,context);
  },
  load(url,context,next){if(url.startsWith('wind-test:'))return {format:'module',source:modules[url.slice(10)],shortCircuit:true};return next(url,context);},
});
try {
  const location=await import('../src/background-location.ts');
  native.store.set('token','current-driver');
  native.store.set('wind.tracking',JSON.stringify({id:'restored',token:'current-driver',actor:2,orderId:3}));
  assert.equal(await location.backgroundLocationState(),'off','restored task registration is not current-launch authority');
  let coldRequests=0;
  globalThis.fetch=async()=>{coldRequests++;return new Response('{}');};
  await native.task({data:{locations:[{timestamp:now,coords:{latitude:32,longitude:35}}]}});
  assert.equal(coldRequests,0,'restored headless context cannot upload before current-launch authority');
  assert.equal(native.store.has('wind.tracking'),false,'restored context is removed');
  native.registered=true;
  // Expo restores task registration before its foreground service can be started after process replacement.
  await location.startBackgroundLocation(2,3);
  assert.ok(!native.writes.some(write=>write.key==='token'),'starting tracking never rewrites the session token');
  assert.equal(native.writes.find(write=>write.key==='wind.tracking').options.keychainAccessible,8);
  assert.equal(native.foreground,true,'A restored task must restart its missing foreground service');
  assert.equal(native.starts.length,1);
  assert.equal(native.starts[0].options.foregroundService.killServiceOnDestroy,false);
  const context=native.store.get('wind.tracking');
  native.foreground=false;
  await location.startBackgroundLocation(2,3);
  assert.equal(native.foreground,true,'Reopening must refresh native registration, even when hasStarted is true');
  assert.equal(native.store.get('wind.tracking'),context,'Reconciliation keeps the same assignment authority');
  await location.stopBackgroundLocation();
  assert.equal(native.foreground,false);assert.equal(native.store.has('wind.tracking'),false);
  native.store.delete('token');await location.startBackgroundLocation(2,3);assert.equal(native.starts.length,2,'No session cannot restart location');
  native.store.set('token','next-driver');native.fail=true;
  await assert.rejects(location.startBackgroundLocation(2,3),/Native start failed/);
  assert.equal(native.store.has('wind.tracking'),false,'Failed registration cannot retain upload authority');
  native.fail=false;
  await location.startBackgroundLocation(2,3);
  const fix={timestamp:Date.now(),coords:{latitude:32,longitude:35,accuracy:10}};
  let requests=0;
  globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({ok:true,accepted:true}));};
  await native.task({data:{locations:[{...fix,mocked:true}]}});
  assert.equal(requests,0,'Android-reported mock fixes never leave the device');
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,accepted:false}));
  await native.task({data:{locations:[fix]}});
  assert.equal(await location.backgroundLocationState(),'starting','Ignored upload cannot claim native GPS sharing');
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,accepted:true}));
  now+=15000;
  await native.task({data:{locations:[{...fix,timestamp:now}]}});
  assert.equal(await location.backgroundLocationState(),'sharing','Accepted upload confirms native GPS sharing');
  now-=60_000;
  assert.equal(await location.backgroundLocationState(),'starting','A clock rewind cannot make an old receipt look current');
  now+=90_000;
  let release; native.blockStart=new Promise(resolve=>{release=resolve;});
  const starting=location.startBackgroundLocation(2,3);
  while(native.starts.length<5) await new Promise(resolve=>setImmediate(resolve));
  const stopping=location.stopBackgroundLocation();
  requests=0; globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({accepted:true}));};
  const callback=native.task({data:{locations:[{...fix,timestamp:now}]}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,0,'stop immediately revokes upload authority while native registration is pending');
  release(); await starting; await stopping; await callback; native.blockStart=null;
  assert.equal(native.store.has('wind.tracking'),false);
  console.log('PASS restored native task restarts its foreground service; authority, logout and start failure remain safe');
} finally {Date.now=originalNow;if(performanceDescriptor)Object.defineProperty(globalThis,'performance',performanceDescriptor);else delete globalThis.performance;globalThis.fetch=originalFetch;hooks.deregister();delete globalThis.__windNative;}
