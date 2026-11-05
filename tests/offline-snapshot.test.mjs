import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
let saved = null, revision = 0;
const modules = {
  './api-client': { apiSessionRevision: () => revision, invalidateApiSessionActions: () => revision++, serverOffset: () => 0 },
  './offline-summary': require('../src/offline-summary.ts'),
  './recovery-storage': { recoveryStorage: { read: async () => saved, write: async (_key, value) => { saved = value; } } },
  './runtime-config': { effectiveRuntime: () => ({ values: { offlineMaxAgeMs: 60_000 } }) },
};
const code = ts.transpileModule(readFileSync(new URL('../src/offline-recovery.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, Date };
runInNewContext(code, context);
const { configureRecoveryActor, cacheOrderSummaries } = context.exports;
const order = { id: 11, driverId: 7, service: 'parcel', status: 'assigned', pickupCity: 'ramallah', dropoffCity: 'nablus' };
const ids = () => Array.from(saved.orders, value => value.id);
configureRecoveryActor({ id: 7, role: 'driver', status: 'active' });
await cacheOrderSummaries([order, { ...order, id: 12 }], true);
await cacheOrderSummaries([{ ...order, status: 'in_transit' }]);
assert.deepEqual(ids(), [11, 12], 'a detail update preserves other active work');
await cacheOrderSummaries([{ ...order, id: 12 }], true);
assert.deepEqual(ids(), [12], 'a complete list removes assignments no longer returned');
await cacheOrderSummaries([], true);
assert.deepEqual(ids(), [], 'an empty complete list clears obsolete work');
await cacheOrderSummaries([order]);
await cacheOrderSummaries([{ ...order, status: 'completed' }]);
assert.deepEqual(ids(), [], 'a terminal detail removes the assignment');
const pending = cacheOrderSummaries([order]); configureRecoveryActor(null); await pending;
assert.deepEqual(ids(), [], 'sign-out fences queued writes');
console.log('Offline summary follows complete snapshots without losing unrelated detail updates');
