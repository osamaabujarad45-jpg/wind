import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Local-fallback hook harness: real useApi, controlled network, no renderer or device.
const state = { slots: [], cursor: 0, calls: 0, pending: [], focus: null };
globalThis.__apiReloadTest = state;
const modules = {
  react: `const s=globalThis.__apiReloadTest;
    export const useRef=value=>{const i=s.cursor++;return s.slots[i]??={current:value};};
    export const useState=value=>{const i=s.cursor++;const slot=s.slots[i]??={value:typeof value==='function'?value():value};
      return [slot.value,next=>{slot.value=typeof next==='function'?next(slot.value):next;}];};
    export const useEffect=fn=>fn(); export const useCallback=fn=>fn;`,
  'react-native': `export const Platform={OS:'web'};
    export const AppState={addEventListener:()=>({remove(){}})};`,
  'expo-constants': `export default {expoConfig:{}};`,
  'expo-secure-store': `export const getItemAsync=async()=>null; export const deleteItemAsync=async()=>{};
    export const setItemAsync=async()=>{};export const AFTER_FIRST_UNLOCK=0;`,
  'expo-router': `export const useFocusEffect=fn=>{globalThis.__apiReloadTest.focus=fn;};`,
  './api-client': `const s=globalThis.__apiReloadTest;
    export const request=url=>{s.calls++;return new Promise((resolve,reject)=>s.pending.push({resolve,reject}));};
    export const errorCode=error=>error.message;export class ApiError extends Error{};
    export const apiSessionRevision=()=>0;export const configureApi=()=>{};export const invalidateApiSessionActions=()=>{};`,
  './web-storage': `export const webGet=()=>null;export const webSet=()=>{};`,
  './offline-recovery': `export const cacheOrderSummaries=()=>Promise.resolve();`,
  './storage': `export const storage={get:async()=>null,set:async()=>{}};`,
  './wire-contracts': `export const readOrder=value=>value;`,
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/api.ts') && specifier in modules)
      return { url: 'api-reload:' + specifier, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('api-reload:')) return { format: 'module', source: modules[url.slice(11)], shortCircuit: true };
    return next(url, context);
  },
});
const flush = () => new Promise(resolve => setImmediate(resolve));
try {
  const { useApi } = await import('../src/api.ts');
  const render = (path = '/orders') => { state.cursor = 0; return useApi(path); };
  let result = render();
  const cleanupOrders = state.focus();
  await flush();
  assert.equal(state.calls, 1, 'initial focus starts one request');
  const joinedPollA = result.retry();
  const joinedPollB = result.retry();
  result = render();
  assert.equal(result.retrying, true, 'joined manual retries expose pending state');
  assert.equal(state.calls, 1, 'manual retries join an in-flight poll instead of superseding it');
  state.pending[0].resolve([]);
  await Promise.all([joinedPollA, joinedPollB]);
  await flush();
  result = render();
  assert.equal(result.retrying, false, 'successful joined retry clears pending state');

  const joinedManualA = result.retry();
  const joinedManualB = result.retry();
  await flush();
  assert.equal(state.calls, 2, 'a later deliberate retry starts one new request');
  assert.equal(render().retrying, true);
  state.pending[1].reject(new Error('offline'));
  assert.equal(await joinedManualA, 'offline');
  assert.equal(await joinedManualB, 'offline');
  await flush();
  assert.equal(render().retrying, false, 'failed joined retry also clears pending state');
  assert.equal(state.calls, 2, 'failed retry never creates hidden duplicate requests');
  cleanupOrders();

  // An acknowledged mutation must not be satisfied by a request that began before it.
  result = render('/mutation');
  const cleanupMutation = state.focus();
  await flush();
  assert.equal(state.calls, 3);
  result.setData({ version: 'acknowledged' });
  const forced = result.reload();
  await flush();
  assert.equal(state.calls, 4, 'post-mutation reload forces a request instead of joining the old poll');
  state.pending[3].resolve({ version: 'post-mutation' });
  await forced;
  state.pending[2].resolve({ version: 'pre-mutation' });
  await flush();
  assert.equal(render('/mutation').data.version, 'post-mutation', 'late pre-mutation data cannot replace the acknowledged refresh');
  cleanupMutation();

  // A state update can make a second retry distinct; its predecessor must not clear the newer pending state.
  result = render('/retry-race');
  const cleanupRace = state.focus();
  await flush();
  assert.equal(state.calls, 5);
  const retryA = result.retry();
  result.setData({ version: 'acknowledged' });
  const retryB = result.retry();
  await flush();
  assert.equal(state.calls, 6, 'a generation change permits a distinct retry request');
  state.pending[4].resolve({ version: 'stale' });
  await retryA;
  await flush();
  assert.equal(render('/retry-race').retrying, true, 'older retry completion preserves the newer pending presentation');
  state.pending[5].resolve({ version: 'fresh' });
  await retryB;
  await flush();
  result = render('/retry-race');
  assert.equal(result.retrying, false, 'latest retry clears pending state');
  assert.equal(result.data.version, 'fresh');
  cleanupRace();
  console.log('API retry/reload: joining, forced post-mutation freshness, and overlapping-generation pending state passed');
} finally {
  for (const pending of state.pending) pending.resolve([]);
  hooks.deregister();
  delete globalThis.__apiReloadTest;
}
