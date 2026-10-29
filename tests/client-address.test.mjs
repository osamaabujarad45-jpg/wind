// A per-address limit must key on an address the caller cannot choose.
// REVIEW-2026-10-29 P1 #3: the leftmost X-Forwarded-For entry and X-Real-IP are both
// caller-written, so a fresh value per attempt never filled the bucket.
import assert from 'node:assert/strict';
import { clientAddress } from '../server/domain/client-address.ts';

const request = (headers, remoteAddress = '10.0.0.9') => ({ headers, socket: { remoteAddress } });

// No proxy trust: the socket is the only address.
assert.equal(clientAddress(request({ 'x-forwarded-for': '1.2.3.4' }), false), '10.0.0.9');
assert.equal(clientAddress(request({ 'x-real-ip': '1.2.3.4' }), false), '10.0.0.9');

// Behind the ingress: the nearest hop wins, not the caller's entry.
assert.equal(clientAddress(request({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }), true), '203.0.113.7',
  'a spoofed leftmost entry must not become the limit key');
assert.equal(clientAddress(request({ 'x-forwarded-for': '203.0.113.7' }), true), '203.0.113.7');
assert.equal(clientAddress(request({ 'x-forwarded-for': '9.9.9.9' }), true), '9.9.9.9',
  'a replacing ingress leaves one entry, which is the client');
assert.equal(clientAddress(request({ 'x-forwarded-for': ' 9.9.9.9 , 203.0.113.7 , ' }), true), '203.0.113.7');
assert.equal(clientAddress(request({}), true), '10.0.0.9', 'no header falls back to the socket');
assert.equal(clientAddress(request({ 'x-real-ip': '1.2.3.4' }), true), '10.0.0.9', 'x-real-ip is never trusted alone');

// Rotating the caller-written prefix no longer yields a fresh bucket.
const keys = new Set([1, 2, 3, 4, 5].map(n =>
  clientAddress(request({ 'x-forwarded-for': `10.0.0.${n}, 203.0.113.7` }), true)));
assert.equal(keys.size, 1, 'rotating the spoofed prefix keeps one address');

console.log('client address: the nearest trusted hop keys the limit, not the caller header');
