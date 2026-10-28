import assert from 'node:assert/strict';
import { cancelledEntraResult, ENTRA_SCOPES } from '../src/entra-result.ts';

assert.equal(cancelledEntraResult({ type: 'cancel' }), true);
assert.equal(cancelledEntraResult({ type: 'dismiss' }), true);
assert.equal(cancelledEntraResult({ type: 'error', error: { params: { error: 'access_denied' } } }), true);
assert.equal(cancelledEntraResult({ type: 'error', error: { params: { error: 'state_mismatch' } } }), false);
assert.equal(cancelledEntraResult({ type: 'locked' }), false);
assert.equal(cancelledEntraResult({ type: 'success' }), false);
assert.deepEqual(ENTRA_SCOPES, ['openid', 'profile', 'email']);
console.log('PASS Entra cancellation and state mismatch handling');
