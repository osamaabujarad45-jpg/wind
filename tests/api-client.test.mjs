import assert from 'node:assert/strict';
import { ApiError, apiSessionRevision, configureApi, invalidateApiSessionActions, noteServerDate, request, serverOffset } from '../src/api-client.ts';

const originalFetch = globalThis.fetch, originalTimer = globalThis.setTimeout;
let finish, oldExpired = 0, currentExpired = 0;
try {
  configureApi('old', () => oldExpired++);
  globalThis.fetch = (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer old');
    return new Promise(resolve => { finish = resolve; });
  };
  const late401 = request('https://test.invalid/api/me');
  configureApi('current', () => currentExpired++);
  finish(new Response(JSON.stringify({ error: 'expired' }), { status: 401 }));
  await assert.rejects(late401, e => e instanceof ApiError && e.message === 'session_changed');
  assert.equal(oldExpired + currentExpired, 0); // an old response cannot log out the new account

  globalThis.fetch = () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  await assert.rejects(request('https://test.invalid/api/me'), e => e.status === 401);
  assert.equal(currentExpired, 1);

  globalThis.fetch = () => new Response(JSON.stringify({ error: 'wrong_password' }), { status: 401 });
  await assert.rejects(request('https://test.invalid/api/me/password', { current: 'wrong', password: 'new' }), /wrong_password/);
  assert.equal(currentExpired, 1); // a rejected password confirmation does not expire the authenticated session

  for (const body of [null, { error: { internal: 'unexpected shape' } }]) {
    globalThis.fetch = () => new Response(JSON.stringify(body), { status: 502 });
    await assert.rejects(request('https://test.invalid/api/me'), e => e instanceof ApiError && e.status === 502 && e.message === 'server_error');
  }

  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const lateData = request('https://test.invalid/api/orders');
  noteServerDate(new Date().toUTCString());
  const originalOffset = serverOffset();
  configureApi('another', () => {});
  finish(new Response(JSON.stringify([{ id: 42 }]), { headers: { Date: new Date(Date.now() - 60_000).toUTCString() } }));
  await assert.rejects(lateData, /session_changed/); // data from the prior account is discarded too
  assert.equal(serverOffset(), originalOffset, 'a discarded response cannot change location freshness');
  noteServerDate(new Date(Date.now() - 60_000).toUTCString(), Date.now(), 10_000);
  assert.equal(serverOffset(), originalOffset, 'a long-held response cannot masquerade as clock skew');

  const beforeLogout = apiSessionRevision();
  const pendingLogout = request('https://test.invalid/api/orders');
  invalidateApiSessionActions();
  assert.notEqual(apiSessionRevision(), beforeLogout, 'sign-out invalidates pending UI actions immediately');
  finish(new Response(JSON.stringify([])));
  await assert.rejects(pendingLogout, /session_changed/);

  globalThis.setTimeout = (fn, delay) => originalTimer(fn, delay === 20_000 ? 1 : delay);
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(request('https://test.invalid/api/orders', { requestId: 'same-on-retry' }), /network/);
  console.log('API session race and timeout checks passed');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimer;
  configureApi(null, () => {});
}
