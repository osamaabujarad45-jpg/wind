import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// Exercise the actual registration queue with a Secure Store read that outlives its API session.
const readStarted = Promise.withResolvers();
const releaseRead = Promise.withResolvers();
const fake = { revision: 1, prompts: 0, writes: [], calls: [], readStarted, releaseRead };
globalThis.__nativePushSessionTest = fake;
const modules = {
  'expo-notifications': `const fake = globalThis.__nativePushSessionTest;
    export const AndroidImportance = { HIGH: 4 };
    export const setNotificationHandler = () => {};
    export const addNotificationResponseReceivedListener = () => {};
    export const getLastNotificationResponseAsync = async () => null;
    export const setNotificationChannelAsync = async () => {};
    export const getPermissionsAsync = async () => ({ status: 'undetermined', canAskAgain: true });
    export const requestPermissionsAsync = async () => { fake.prompts++; return { status: 'granted' }; };
    export const getExpoPushTokenAsync = async () => ({ data: 'test-token' });`,
  'expo-crypto': `export const randomUUID = () => 'test-device';`,
  'expo-constants': `export default {};`,
  'expo-router': `export const router = {};`,
  'react-native': `export const Platform = { OS: 'android' };`,
  './api-client': `export const apiSessionCredential = () => null;`,
  './api': `const fake = globalThis.__nativePushSessionTest;
    export const apiSessionRevision = () => fake.revision;
    export const api = async path => { fake.calls.push([fake.revision, path]); };
    export const storage = {
      get: async key => {
        if (key !== 'pushAsked') return null;
        fake.readStarted.resolve();
        await fake.releaseRead.promise;
        return fake.writes.some(([key]) => key === 'pushAsked') ? '1' : null;
      },
      set: async (key, value) => { fake.writes.push([key, value]); },
    };`,
};
const sourceUrl = new URL('../src/native-push.ts', import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === sourceUrl.href && Object.hasOwn(modules, specifier))
      return { url: 'native-push-test:' + specifier, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('native-push-test:'))
      return { format: 'module', source: modules[url.slice('native-push-test:'.length)], shortCircuit: true };
    return next(url, context);
  },
});
try {
  const { registerNativePush } = await import(sourceUrl.href);
  const old = registerNativePush('en', 'once');
  await readStarted.promise;
  fake.revision++;
  releaseRead.resolve();
  assert.equal(await old, false);
  assert.equal(fake.prompts, 0, 'sign-out during the read prevents the old system dialog');
  assert.deepEqual(fake.writes, [], 'the old session cannot spend the device-wide prompt');
  assert.equal(await registerNativePush('en', 'once'), true, 'the new session can still request permission');
  assert.equal(await registerNativePush('en', 'once'), false, 'the automatic prompt is used once');
  assert.equal(fake.prompts, 1);
  assert.deepEqual(fake.calls, [[2, '/push/native/register']]);
} finally {
  hooks.deregister();
  delete globalThis.__nativePushSessionTest;
}
const order = readFileSync(new URL('../src/app/order/[id].tsx', import.meta.url), 'utf8');
assert.match(order, /const customerLive = me\?\.user\.role === 'customer' && !!order\?\.driverId && activeStatuses\.includes\(order\.status\)/,
  'the order screen asks only after a captain is assigned');
console.log('Native notification requests stay with the API session that started them');
