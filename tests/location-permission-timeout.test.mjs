import assert from 'node:assert/strict';
import { boundedPermission } from '../src/location-permission-timeout.ts';

assert.deepEqual(await boundedPermission(async () => ({ granted: true }), 100), { granted: true });
assert.equal(await boundedPermission(() => new Promise(() => {}), 10), null, 'an unresponsive location provider cannot block an action forever');
await assert.rejects(boundedPermission(async () => { throw new Error('permission failure'); }, 100), /permission failure/);
console.log('PASS bounded web location permission, timeout and failure');
