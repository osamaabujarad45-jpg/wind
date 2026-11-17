import assert from 'node:assert/strict';
import { createDiagnosticBuffer, readDiagnostics } from '../src/client-diagnostics.ts';
let now = 1000; const queue = createDiagnosticBuffer(() => now);
for (let i = 0; i < 9; i++) queue.record('api_result', { durationMs: i });
assert.equal(queue.snapshot().length, 6); assert.equal(queue.dropped(), 3);
const saved = queue.snapshot(); const restarted = createDiagnosticBuffer(() => now); restarted.hydrate(saved);
restarted.record('map_ready', { provider: 'google', durationMs: 123 });
restarted.acknowledge(saved.map(event => event.id)); assert.equal(restarted.snapshot().length, 1, 'an acknowledgement cannot drop newer events');
for (const extra of [{ token:'private' },{ code:'1234' },{ latitude:31.9 },{ url:'https://private.invalid' },{ durationMs:-1 }])
  assert.throws(() => readDiagnostics([{ ...saved[0], ...extra }], now));
now += 30 * 60_000; assert.equal(queue.snapshot().length, 0);
restarted.clear(); assert.equal(restarted.snapshot().length, 0);
console.log('Diagnostic queue TTL/size bounds, restart hydration, safe acknowledgements and sensitive-field rejection passed');
