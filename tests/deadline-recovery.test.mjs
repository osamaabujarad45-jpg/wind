import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createDeadlineReconciler } from '../src/deadline-recovery.ts';
import { createProtectedRecovery } from '../src/protected-recovery.ts';

let revision = 1, active = true, reads = 0, reconciles = 0, acknowledgements = 0, release;
// As in pendingRecoveryWake: a wake is only visible to the session (revision) whose scope it carries.
let wake = { scope: 'a'.repeat(64), id: 'wake-1' }, wakeOwner = 1;
let pause;
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
const check = createDeadlineReconciler({ revision: () => revision, active: () => active,
  read: async () => { reads++; return wakeOwner === revision ? wake : null; },
  reconcile: async () => { reconciles++; if (pause) await pause; },
  acknowledge: async snapshot => { if (snapshot === wake) { acknowledgements++; wake = null; } },
});
pause = new Promise(resolve => { release = resolve; });
const first = check();
assert.equal(check(), first, 'duplicate broadcasts share the same foreground reconciliation');
await new Promise(resolve => setImmediate(resolve));
assert.equal(reconciles, 1);
revision++; release(); await first; await settle(); // the duplicate trigger's extra pass runs under the new session
assert.equal(acknowledgements, 0, 'logout/session change cannot acknowledge another actor wake');
assert.equal(reconciles, 1, 'the new session does not reconcile the old session wake');
assert.ok(wake, 'pending wake survives a cancelled foreground attempt');
const readsBefore = reads;
wakeOwner = revision; // the new session gets its own pending wake
active = false; await check();
assert.equal(reads, readsBefore, 'background delivery never performs foreground recovery');
active = true; pause = null; await check();
assert.equal(acknowledgements, 1);
await check(); assert.equal(reconciles, 2, 'acknowledged duplicate does not reconcile again');

{
  let passes = 0, hold, go, session = 1;
  const scopeOf = () => (session === 1 ? 'a' : 'b').repeat(64);
  const seen = [];
  const run = createDeadlineReconciler({ revision: () => session, active: () => true,
    read: async () => ({ scope: scopeOf(), id: `wake-${session}` }),
    reconcile: async () => { passes++; if (hold) await hold; },
    acknowledge: async w => { seen.push(w.id); },
  });
  hold = new Promise(resolve => { go = resolve; });
  const firstRun = run();
  await new Promise(resolve => setImmediate(resolve));
  session = 2; hold = null; run(); // sign-in to another session while the first pass is still reconciling
  go(); await firstRun;
  for (let i = 0; i < 5 && passes < 2; i++) await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(passes, 2, 'a trigger during a run gets its own pass afterwards');
  assert.deepEqual(seen, ['wake-2'], 'the old pass never acknowledges for the new session; the new pass does');
}

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
clockRevision++; const logout = store.clear(token); pauseSeal = null; finishSeal();
await assert.rejects(pendingWrite, /session_changed/); await logout;
assert.equal(deadlines.size, 0, 'logout serializes after old writes and cancels all alarms');
assert.equal(clears, 1);
await store.clear('another-session'); assert.equal(clears, 1, 'a session that took over keeps its own native deadlines');

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
  ['BOOT_COMPLETED', 'TIME_SET', 'TIMEZONE_CHANGED', 'MY_PACKAGE_REPLACED']);
assert.equal(twice.manifest['uses-permission'].length, 1);
assert.equal(twice.manifest['uses-permission'][0].$['android:name'], 'android.permission.RECEIVE_BOOT_COMPLETED');
assert.ok(readFileSync(new URL('../app.config.js', import.meta.url), 'utf8').includes('./plugins/with-deadline-wake'));
// EAS uploads what .gitignore keeps. An unanchored "android"/"ios" also matches modules/*/android and would
// drop this module's native source from the EAS bundle (Expo Doctor reports the same).
const ignores = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split(/\r?\n/).map(line => line.trim());
assert.ok(ignores.includes('/android') && ignores.includes('/ios'), 'the top-level generated native folders stay excluded');
assert.ok(!['android', 'ios', 'android/', 'ios/'].some(entry => ignores.includes(entry)), 'local module native source is uploaded');
let easIgnore = null; try { easIgnore = readFileSync(new URL('../.easignore', import.meta.url), 'utf8'); } catch { /* none: .gitignore governs */ }
assert.equal(easIgnore, null, 'no .easignore overrides .gitignore');
// The phone QA build copies an allow-list of inputs; without modules/ the receiver is declared but its class is missing.
assert.match(readFileSync(new URL('../scripts/build-phone-tests.ps1', import.meta.url), 'utf8'), /foreach \(\$phoneFolder in @\([^)]*'modules'/,
  'phone QA builds include the local native module');
console.log('Deadline recovery: real persisted expiry, duplicate/cancel/logout fences, foreground authority and CNG broadcast registration passed');
