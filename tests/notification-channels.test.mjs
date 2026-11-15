import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { notificationChannelFor, notificationChannels, PUSH_KINDS, versionedNotificationChannel } from '../src/notification-channels.ts';

assert.ok(PUSH_KINDS.length >= 20);
const ids = new Set();
for (const kind of PUSH_KINDS) {
  const channel = notificationChannelFor(kind);
  assert.equal(channel.kind, kind);
  assert.equal(channel.version, 1);
  assert.match(channel.id, /^wind\.[a-z_]+\.v1$/);
  assert.ok(channel.name.length > 0);
  assert.ok(!ids.has(channel.id), `duplicate channel ${channel.id}`);
  ids.add(channel.id);
}
assert.equal(notificationChannels().length, PUSH_KINDS.length);
assert.notEqual(versionedNotificationChannel('job', 1).id, versionedNotificationChannel('job', 2).id, 'a definition change creates a new channel');
assert.throws(() => notificationChannelFor('invented'), /unknown_notification_kind/);
assert.match(readFileSync(new URL('../server/worker.ts', import.meta.url), 'utf8'), /channelId:\s*notificationChannelFor\(data\.kind\)\.id/, 'Expo sends name the current event channel');

async function registrationHarness(capabilityState) {
  const calls = [];
  const notifications = {
    AndroidImportance: { HIGH: 4, DEFAULT: 3 },
    setNotificationHandler() {}, addNotificationResponseReceivedListener() {},
    getLastNotificationResponseAsync: async () => null,
    setNotificationChannelAsync: async (id, definition) => { calls.push(['channel', id, definition]); },
    getPermissionsAsync: async () => { calls.push(['getPermission']); return { status: 'granted' }; },
    requestPermissionsAsync: async () => { calls.push(['requestPermission']); return { status: 'granted' }; },
    getExpoPushTokenAsync: async () => { calls.push(['token']); return { data: 'ExponentPushToken[synthetic]' }; },
  };
  const context = {
    exports: {}, console,
    require(name) {
      const modules = {
        'expo-notifications': notifications,
        'expo-crypto': { randomUUID: () => 'synthetic-device' },
        'expo-constants': { expoConfig: { extra: { eas: { projectId: 'synthetic-project' } } } },
        'react-native': { Platform: { OS: 'android' } },
        'expo-router': { router: { push() {} } },
        './api': { api: async path => {
          calls.push(['api', path]);
          if (path === '/runtime/capabilities') return { capabilities: { nativePush: { state: capabilityState, operationalEvidence: 'not_checked' } } };
          if (path === '/push/native/register') return { registered: true };
          throw new Error(`unexpected API ${path}`);
        }, storage: { get: async () => null, set: async () => {} } },
        './notification-channels': { notificationChannels },
      };
      if (!(name in modules)) throw new Error(`missing stub ${name}`);
      return modules[name];
    },
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/native-push.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source + '\nexports.registerForTest = registerNativePush;', context, { filename: 'native-push.ts' });
  await context.exports.registerForTest('en');
  return calls;
}

const unavailable = await registrationHarness('unavailable');
assert.deepEqual(unavailable.map(call => call[0]), ['api'], 'an unavailable backend never creates channels or asks for OS permission');
assert.deepEqual(unavailable[0], ['api', '/runtime/capabilities']);

const configured = await registrationHarness('configured');
const firstPermission = configured.findIndex(call => call[0] === 'getPermission');
const firstChannel = configured.findIndex(call => call[0] === 'channel');
const lastChannel = configured.map(call => call[0]).lastIndexOf('channel');
assert.ok(firstChannel > 0 && lastChannel > firstChannel, 'channels are created');
assert.ok(firstPermission > lastChannel, 'all channels precede permission/token registration');
assert.equal(configured.filter(call => call[0] === 'channel').length, PUSH_KINDS.length);
assert.ok(configured.some(call => call[0] === 'token'));
assert.ok(configured.some(call => call[0] === 'api' && call[1] === '/push/native/register'));
console.log('Versioned notification channels, sender mapping and capability-before-permission checks passed');
