import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real history route; a bounded database double rejects an overfilled acquisition queue.
const source = readFileSync(new URL('../server/main.ts', import.meta.url), 'utf8');
const start = source.indexOf("route('GET', '/api/orders',"), end = source.indexOf('\nasync function withMeasuredScopes', start);
assert.ok(start >= 0 && end > start);
const helperStart = source.indexOf('async function toOrders(');
const helperEnd = source.indexOf('\n// Driver offers', helperStart);
assert.ok(helperStart < 0 || helperEnd > helperStart);
const helper = helperStart < 0 ? '' : source.slice(helperStart, helperEnd);
let handler, active = 0, maximum = 0, failId;
let rows = Array.from({ length: 251 }, (_, index) => ({ id: 251 - index }));
const context = {
  route: (_method, _path, callback) => { handler = callback; }, HISTORY_PAGE: 200, activeSql: "'assigned'", orderSelect: 'SELECT orders',
  all: async () => rows,
  toOrder: async row => {
    active++; maximum = Math.max(maximum, active);
    try {
      assert.ok(active <= 4, 'Order history serialises four orders at a time, leaving half the eight-connection pool for other readers');
      for (let turn = 0; turn <= row.id % 3; turn++) await new Promise(resolve => setImmediate(resolve));
      if (row.id === failId) throw new Error('serialization_failed');
      return { id: row.id };
    } finally { active--; }
  },
  fail: () => { throw new Error('invalid_input'); },
};
runInNewContext(ts.transpileModule(helper + '\n' + source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const user = { id: 3, role: 'driver' };
for (const query of [new URLSearchParams(), new URLSearchParams('before=252')]) {
  assert.deepEqual(Array.from(await handler({ user, query }), order => order.id), rows.map(row => row.id), 'Every order stays in its original order');
}
assert.ok(maximum <= 4 && maximum > 1, "batches of four, still in parallel");
for (const query of [new URLSearchParams(), new URLSearchParams('before=252')]) {
  rows = [];
  assert.equal((await handler({ user, query })).length, 0);
  rows = [{ id: 1 }]; failId = 1;
  await assert.rejects(handler({ user, query }), /serialization_failed/);
}
for (const before of ['abc', '0', '-1', '1.5', '1e3']) {
  await assert.rejects(handler({ user, query: new URLSearchParams({ before }) }), /invalid_input/);
}
console.log('order-history-serialization: ok');
