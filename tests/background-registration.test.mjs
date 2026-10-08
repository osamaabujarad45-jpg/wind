import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const native = { store:new Map(), registered:true, foreground:false, starts:[], stops:0, fail:false };
globalThis.__windNative = native;
const modules = {
  'react-native': `export const Platform={OS:'android'};`,
  'expo-location': `const n=globalThis.__windNative;export const Accuracy={High:6};
    export const hasStartedLocationUpdatesAsync=async()=>n.registered;
    export async function startLocationUpdatesAsync(task,options){n.starts.push({task,options});if(n.fail)throw Error('Native start failed');n.registered=true;n.foreground=true;}
    export async function stopLocationUpdatesAsync(){n.stops++;n.registered=false;n.foreground=false;}`,
  'expo-task-manager': `export const isTaskDefined=()=>false;export function defineTask(name,task){globalThis.__windNative.task=task;}`,
  'expo-secure-store': `const n=globalThis.__windNative;export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY=7;
    export const getItemAsync=async key=>n.store.get(key)??null;
    export const setItemAsync=async(key,value)=>{n.store.set(key,value)};
    export const deleteItemAsync=async key=>{n.store.delete(key)};`,
  './api': `export const API_URL='https://example.test';`,
};
const hooks=registerHooks({
  resolve(specifier,context,next){
    if(context.parentURL?.endsWith('/src/background-location.ts')) {
      if(specifier in modules)return {url:'wind-test:'+specifier,shortCircuit:true};
      if(specifier==='./location-delivery')return {url:new URL('../src/location-delivery.ts',import.meta.url).href,shortCircuit:true};
    }
    return next(specifier,context);
  },
  load(url,context,next){if(url.startsWith('wind-test:'))return {format:'module',source:modules[url.slice(10)],shortCircuit:true};return next(url,context);},
});
try {
  const location=await import('../src/background-location.ts');
  native.store.set('token','current-driver');
  // Expo restores task registration before its foreground service can be started after process replacement.
  await location.startBackgroundLocation(2,3);
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
  console.log('PASS restored native task restarts its foreground service; authority, logout and start failure remain safe');
} finally {hooks.deregister();delete globalThis.__windNative;}
