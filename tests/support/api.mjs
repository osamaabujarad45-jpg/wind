// Shared JSON client for the server tests: sends one request, asserts the status, returns the parsed body.
import assert from 'node:assert/strict';

/**
 * `call(path, { token, partnerKey, body, method, expect })` against the server whose origin `base()` returns.
 * `base` is a getter so a test can create its server after this helper is made. Pass `fetchImpl` when the test
 * replaces the global fetch and still needs the real one.
 */
export function apiCaller(base, fetchImpl = (...args) => fetch(...args)) {
  return async function call(path, { token, partnerKey, body, method, expect = 200 } = {}) {
    const res = await fetchImpl(base() + path, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(partnerKey && { 'X-Partner-Key': partnerKey }) },
      body: body && JSON.stringify(body),
    });
    const data = await res.json();
    assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
    return data;
  };
}
