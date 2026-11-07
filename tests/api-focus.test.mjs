import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the real hook's focus/AppState callbacks without a renderer or device.
const state = { refs: [], cursor: 0, calls: [], listener: null, focus: null, summaries: [] };
globalThis.__apiFocusTest = state;
const modules = {
  react: `const s=globalThis.__apiFocusTest;
    export const useRef=value=>s.refs[s.cursor++]??=( {current:value} );
    export const useState=value=>[typeof value==='function'?value():value,()=>{}];
    export const useEffect=fn=>fn(); export const useCallback=fn=>fn;`,
  'react-native': `const s=globalThis.__apiFocusTest;export const Platform={OS:'web'};
    export const AppState={addEventListener:(_event,fn)=>{s.listener=fn;return {remove:()=>{s.listener=null;}};}};`,
  'expo-constants': `export default {expoConfig:{}};`,
  'expo-secure-store': `export const getItemAsync=async()=>null; export const deleteItemAsync=async()=>{};
    export const setItemAsync=async()=>{};export const AFTER_FIRST_UNLOCK=0;`,
  'expo-router': `export const useFocusEffect=fn=>{globalThis.__apiFocusTest.focus=fn;};`,
  './api-client': `const s=globalThis.__apiFocusTest;export const request=async url=>{s.calls.push(url);return new URL(url).pathname==='/api/orders'?[]:{};};
    export const errorCode=error=>error.message;export class ApiError extends Error{};
    export const apiSessionRevision=()=>0;export const configureApi=()=>{};export const invalidateApiSessionActions=()=>{};`,
  './web-storage': `export const webGet=()=>null;export const webSet=()=>{};`,
  './offline-recovery': `export const cacheOrderSummaries=(orders,replace)=>{globalThis.__apiFocusTest.summaries.push({orders,replace});return Promise.resolve();};`,
  './storage': `export const storage={get:async()=>null,set:async()=>{}};`,
  './wire-contracts': `export const readOrder=value=>value;`,
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/api.ts') && specifier in modules)
      return { url: 'api-focus:' + specifier, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('api-focus:')) return { format: 'module', source: modules[url.slice(10)], shortCircuit: true };
    return next(url, context);
  },
});
const flush = () => new Promise(resolve => setImmediate(resolve));
try {
  const { api, useApi } = await import('../src/api.ts');
  const render = (path, options) => { state.cursor = 0; useApi(path, undefined, options); return state.focus(); };
  let cleanup = render('/route/google?from=one&to=two', { refetchOnFocus: false });
  await flush();
  assert.equal(state.calls.length, 1, 'a newly shown pin pair loads once');
  for (let i = 0; i < 3; i++) {
    state.listener('background'); state.listener('active'); await flush();
  }
  assert.equal(state.calls.length, 1, 'foreground bounces must not repeat a billable route during its first focus');
  cleanup();
  cleanup = render('/route/google?from=one&to=two', { refetchOnFocus: false });
  await flush();
  assert.equal(state.calls.length, 1, 'refocus of the same route must not bill again');
  cleanup();
  cleanup = render('/route/google?from=one&to=three', { refetchOnFocus: false });
  await flush();
  assert.equal(state.calls.length, 2, 'a changed pin pair still loads');
  cleanup();
  cleanup = render('/orders');
  await flush();
  state.listener('background'); state.listener('active'); await flush();
  assert.equal(state.calls.length, 4, 'ordinary endpoints still refresh when the app returns');
  cleanup();
  assert.equal(state.summaries.at(-1).replace, true, 'first order-list page replaces stale assignments');
  await api('/orders?before=200');
  assert.equal(state.summaries.at(-1).replace, false, 'older history pages preserve active cached work');
  console.log('API focus: billable routes load only on path changes; ordinary endpoints refresh on foreground');
} finally { hooks.deregister(); delete globalThis.__apiFocusTest; }
