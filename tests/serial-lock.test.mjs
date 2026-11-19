import assert from 'node:assert/strict';
import { inProcess } from '../src/serial-lock.ts';

// One holder of a lock at a time in one process; a holder that rejects or throws never blocks the next (Sol R17-M2).
const order = [];
let release;
const first = inProcess('cash', () => new Promise(resolve => { release = resolve; order.push('first-start'); }));
const second = inProcess('cash', async () => { order.push('second'); });
await Promise.resolve(); await Promise.resolve();
assert.deepEqual(order, ['first-start'], 'the second waits for the first');
release(); await first; await second;
assert.deepEqual(order, ['first-start', 'second']);
await assert.rejects(inProcess('cash', async () => { throw new Error('boom'); }), /boom/);
assert.equal(await inProcess('cash', async () => 'after-reject'), 'after-reject');
await assert.rejects(inProcess('cash', () => { throw new Error('sync'); }), /sync/);
assert.equal(await inProcess('cash', async () => 'after-throw'), 'after-throw');
let other = false;
await inProcess('other', async () => { other = true; });
assert.ok(other, 'another lock name does not wait');
console.log('PASS: in-process lock serializes holders and survives rejecting and throwing ones');
