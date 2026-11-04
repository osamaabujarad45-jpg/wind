import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the real hook's focus/AppState callbacks without a renderer or device.
const state = { refs: [], cursor: 0, calls: [], sets: [], hook: null, listener: null, focus: null };
globalThis.__apiFocusTest = state;
const modules = {
  react: `const s=globalThis.__apiFocusTest;
    export const useRef=value=>s.refs[s.cursor++]??=( {current:value} );
    export const useState=value=>[typeof value==='function'?value():value,next=>{s.sets.push(next);}];
    export const useEffect=fn=>fn(); export const useCallback=fn=>fn;`,
  'react-native': `const s=globalThis.__apiFocusTest;export const Platform={OS:'web'};
    export const AppState={addEventListener:(_event,fn)=>{s.listener=fn;return {remove:()=>{s.listener=null;}};}};`,
  'expo-constants': `export default {expoConfig:{}};`,
  'expo-secure-store': `export const getItemAsync=async()=>null; export const deleteItemAsync=async()=>{};
    export const setItemAsync=async()=>{};export const AFTER_FIRST_UNLOCK=0;`,
  'expo-router': `export const useFocusEffect=fn=>{globalThis.__apiFocusTest.focus=fn;};`,
  './api-client': `const s=globalThis.__apiFocusTest;export const request=async url=>{s.calls.push(url);if(s.gate)await s.gate;return {};};
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
  const { useApi } = await import('../src/api.ts');
  const render = (path, options) => { state.cursor = 0; state.hook = useApi(path, undefined, options); return state.focus(); };
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
  // An admin saves, then searches before the save's reload runs: that reload comes from the old search's render.
  cleanup = render('/admin/users?q=spare');
  await flush();
  const staleReload = state.hook.reload;
  cleanup();
  cleanup = render('/admin/users?q=managed');
  await staleReload();
  await flush();
  assert.ok(state.calls.at(-1).includes('q=managed'), 'a stale reload refreshes what the screen shows now');
  assert.equal(state.sets.filter(set => set?.path).at(-1)?.path, '/admin/users?q=managed', 'the current search must show a result, not spin forever');
  cleanup();
  // Backgrounding nulls a Google approach's path (src/road.tsx); returning to the same URL is not a new route.
  const approach = '/route/google?from=one&to=four';
  cleanup = render(approach, { refetchOnFocus: false });
  await flush();
  const billed = state.calls.length;
  cleanup();
  cleanup = render(null, { refetchOnFocus: false });
  await flush();
  cleanup();
  cleanup = render(approach, { refetchOnFocus: false });
  await flush();
  assert.equal(state.calls.length, billed, 'a background bounce must not bill the same approach again');
  cleanup();
  cleanup = render('/route/google?from=one&to=five', { refetchOnFocus: false });
  await flush();
  assert.equal(state.calls.length, billed + 1, 'a new approach after a bounce still loads');
  cleanup();
  // The same bounce with the paid answer still on its way: the answer must not be lost, and must not be paid for twice.
  const hold = () => { let open, shut; state.gate = new Promise((resolve, reject) => { open = resolve; shut = reject; }); return { open, shut }; };
  const options = { refetchOnFocus: false };
  const answers = url => state.sets.filter(set => set?.path === url && typeof set.value !== 'string').length;
  const bounce = async url => { cleanup(); cleanup = render(null, options); await flush(); if (url) { cleanup(); cleanup = render(url, options); await flush(); } };
  const pending = async (url, landed) => {
    const gate = hold();
    cleanup = render(url, options);
    await flush();
    const paid = state.calls.length;
    await bounce(landed === 'after return' ? url : null);
    gate.open(); state.gate = null;
    await flush();
    if (landed !== 'after return') { cleanup(); cleanup = render(url, options); await flush(); }
    assert.equal(state.calls.length, paid, `an answer landing ${landed} is not paid for twice`);
    assert.equal(answers(url), 1, `an answer landing ${landed} is kept`);
    cleanup();
  };
  await pending('/route/google?from=one&to=six', 'in the background');
  await pending('/route/google?from=one&to=seven', 'after return');
  const failing = '/route/google?from=one&to=eight';
  const gate = hold();
  cleanup = render(failing, options);
  await flush();
  const asked = state.calls.length;
  await bounce(null);
  gate.shut(new Error('network')); state.gate = null;
  await flush();
  cleanup(); cleanup = render(failing, options);
  await flush();
  assert.equal(state.calls.length, asked + 1, 'a request that failed in the background left nothing kept, so returning asks again');
  assert.equal(answers(failing), 1, 'the second try is shown');
  cleanup();
  // A newer route must never be replaced by an older answer.
  const older = hold();
  cleanup = render('/route/google?from=one&to=nine', options);
  await flush();
  cleanup(); state.gate = null; cleanup = render('/route/google?from=one&to=ten', options);
  await flush();
  older.open();
  await flush();
  assert.equal(answers('/route/google?from=one&to=nine'), 0, 'an answer for a route no longer shown is dropped');
  assert.equal(answers('/route/google?from=one&to=ten'), 1);
  cleanup();
  console.log('API focus: billable routes load only on path changes; ordinary endpoints refresh on foreground');
} finally { hooks.deregister(); delete globalThis.__apiFocusTest; }
