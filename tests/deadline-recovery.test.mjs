import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createDeadlineReconciler } from '../src/deadline-recovery.ts';
import { createProtectedRecovery } from '../src/protected-recovery.ts';

let revision = 1, active = true, reads = 0, reconciles = 0, acknowledgements = 0, release;
let wake = { scope: 'a'.repeat(64), id: 'wake-1' };
let pause;
const check = createDeadlineReconciler({ revision: () => revision, active: () => active,
  read: async () => { reads++; return wake; },
  reconcile: async () => { reconciles++; if (pause) await pause; },
  acknowledge: async snapshot => { if (snapshot === wake) { acknowledgements++; wake = null; } },
});
pause = new Promise(resolve => { release = resolve; });
const first = check();
assert.equal(check(), first, 'duplicate broadcasts share the same foreground reconciliation');
await new Promise(resolve => setImmediate(resolve));
assert.equal(reconciles, 1);
revision++; release(); await first;
assert.equal(acknowledgements, 0, 'logout/session change cannot acknowledge another actor wake');
assert.ok(wake, 'pending wake survives a cancelled foreground attempt');
active = false; await check();
assert.equal(reads, 1, 'background delivery never performs foreground recovery');
active = true; pause = null; await check();
assert.equal(acknowledgements, 1);
await check(); assert.equal(reconciles, 2, 'acknowledged duplicate does not reconcile again');

let fail = true;
const failed = createDeadlineReconciler({ revision: () => revision, active: () => true,
  read: async () => ({ scope: 'a'.repeat(64), id: 'network-wake' }),
  reconcile: async () => { if (fail) throw new Error('network'); },
  acknowledge: async () => { acknowledgements++; },
});
await assert.rejects(failed(), /network/);
assert.equal(acknowledgements, 1, 'failed authority fetch keeps native pending wake');
fail = false; await failed(); assert.equal(acknowledgements, 2);

const data = new Map(), deadlines = new Map();
let now = 1_000, token = 'token-never-written-to-native', clockRevision = 1, pauseSeal, finishSeal, clears = 0, schedulerFails = false;
const scope = 'a'.repeat(64);
const store = createProtectedRecovery({
  read: async key => data.get(key) ?? null,
  write: async (key, value) => { if (value === null) data.delete(key); else data.set(key, value); },
  credential: async () => token, revision: () => clockRevision, now: () => now, namespace: async () => scope,
  seal: async text => { if (pauseSeal) await pauseSeal; return text; }, open: async text => text,
  deadline: async (namespace, slot, expiry, remaining) => {
    if (schedulerFails) throw new Error('os_scheduler_unavailable');
    assert.equal(namespace, scope);
    if (expiry === null) deadlines.delete(slot); else deadlines.set(slot, { expiry, remaining });
  }, clearDeadlines: async () => { clears++; deadlines.clear(); },
});
await store.write('command', { requestId: 'unchanged', pin: '1234', coordinate: [1, 2] }, 5_000);
assert.deepEqual(deadlines.get('command'), { expiry: 6_000, remaining: 5_000 });
assert.equal(JSON.stringify([...deadlines]).includes(token), false);
assert.equal(JSON.stringify([...deadlines]).includes('1234'), false, 'native metadata excludes payload/PIN/coordinates');
now = 2_000; assert.equal((await store.read('command')).requestId, 'unchanged');
assert.deepEqual(deadlines.get('command'), { expiry: 6_000, remaining: 4_000 }, 'reopen uses the original actual persisted expiry');
schedulerFails = true;
assert.equal((await store.read('command')).requestId, 'unchanged', 'an alarm failure never deletes an unknown command');
schedulerFails = false;
await store.write('command', null, 1); assert.equal(deadlines.size, 0, 'command cancel removes its alarm');
await store.write('summary', { summary: true }, 5_000);
now = 7_000; await assert.rejects(store.read('summary'), /recovery_record_unavailable/);
assert.equal(deadlines.size, 0, 'invalid/expired recovery records cancel their native deadline');
now = 1_000; pauseSeal = new Promise(resolve => { finishSeal = resolve; });
const pendingWrite = store.write('command', { requestId: 'same' }, 5_000);
await new Promise(resolve => setImmediate(resolve));
clockRevision++; const logout = store.clear(); pauseSeal = null; finishSeal();
await assert.rejects(pendingWrite, /session_changed/); await logout;
assert.equal(deadlines.size, 0, 'logout serializes after old writes and cancels all alarms');
token = null; await store.clear(); assert.equal(clears, 2, 'logout clears metadata even when credentials are already absent');

const require = createRequire(import.meta.url);
const plugin = require('../plugins/with-deadline-wake.js');
const config = { name: 'test', slug: 'test', android: { package: 'ps.wind.test' } };
// Invoke the registered manifest mod without generating native project directories.
const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };
const apply = async input => (await plugin(config).mods.android.manifest({ ...config, modResults: input,
  modRequest: { projectRoot: process.cwd(), platform: 'android', platformProjectRoot: process.cwd(), modName: 'manifest', introspect: true } })).modResults;
const once = await apply(manifest), twice = await apply(once);
assert.equal(twice.manifest.application[0].receiver.length, 1, 'CNG plugin is idempotent');
const receiver = twice.manifest.application[0].receiver[0];
assert.equal(receiver.$['android:exported'], 'false');
assert.deepEqual(receiver['intent-filter'][0].action.map(item => item.$['android:name'].split('.').at(-1)),
  ['BOOT_COMPLETED', 'USER_UNLOCKED', 'TIME_SET', 'TIMEZONE_CHANGED', 'MY_PACKAGE_REPLACED']);
assert.equal(twice.manifest['uses-permission'].length, 1);
assert.equal(twice.manifest['uses-permission'][0].$['android:name'], 'android.permission.RECEIVE_BOOT_COMPLETED');
assert.ok(readFileSync(new URL('../app.config.js', import.meta.url), 'utf8').includes('./plugins/with-deadline-wake'));
// An unanchored "android"/"ios" in .easignore also matches modules/*/android and would
// drop this module's native source from the EAS bundle (Expo Doctor reports the same).
const easIgnores = readFileSync(new URL('../.easignore', import.meta.url), 'utf8').split(/\r?\n/);
assert.ok(easIgnores.includes('/android') && easIgnores.includes('/ios'), 'EAS keeps the top-level generated native folders excluded');
assert.ok(!easIgnores.includes('android') && !easIgnores.includes('ios'), 'EAS must not exclude local module native source');
console.log('Deadline recovery: real persisted expiry, duplicate/cancel/logout fences, foreground authority and CNG broadcast registration passed');
