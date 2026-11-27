import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const sourceUrl = new URL('../src/native-push.ts', import.meta.url);
const modules = {
  'expo-notifications': `export const AndroidImportance = { HIGH: 4 };
    export const setNotificationHandler = () => {};
    export const addNotificationResponseReceivedListener = listener => { globalThis.__nativePushNavigationTest.listener = listener; };
    export const getLastNotificationResponseAsync = async () => globalThis.__nativePushNavigationTest.initial?.promise ?? globalThis.__nativePushNavigationTest.initial ?? null;
    export const getLastNotificationResponse = () => globalThis.__nativePushNavigationTest.systemTap;
    export const clearLastNotificationResponse = () => { globalThis.__nativePushNavigationTest.systemTap = null; };
    export const setNotificationChannelAsync = async () => {};
    export const getPermissionsAsync = async () => ({ status: 'granted', canAskAgain: true });
    export const getExpoPushTokenAsync = async () => ({ data: 'test-token' });`,
  'expo-crypto': `export const randomUUID = () => 'test-device';`,
  'expo-constants': `export default {};`,
  'expo-router': `export const router = {
      push: url => globalThis.__nativePushNavigationTest.nav.push(['push', url]),
      replace: url => globalThis.__nativePushNavigationTest.nav.push(['replace', url]) };`,
  'react-native': `export const Platform = { OS: 'android' };`,
  './api': `export const apiSessionRevision = () => 1;
    export const api = async path => globalThis.__nativePushNavigationTest.api(path);
    export const storage = { get: async key => key === 'token' ? globalThis.__nativePushNavigationTest.storedToken : null, set: async () => {} };`,
  './api-client': `export const apiSessionCredential = () => globalThis.__nativePushNavigationTest.token;
    export const errorCode = error => error?.message ?? 'server_error';`,
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(sourceUrl.href) && Object.hasOwn(modules, specifier))
      return { url: 'native-push-navigation-test:' + specifier, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('native-push-navigation-test:'))
      return { format: 'module', source: modules[url.slice('native-push-navigation-test:'.length)], shortCircuit: true };
    return next(url, context);
  },
});
const response = (identifier, url, recipient, kind) => ({ notification: { request: { identifier, content: { data: { url, recipient, kind } } } } });
const account = (role = 'customer', status = 'active') => ({ user: { id: 1, role, status } });
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
let sequence = 0;
async function setup(initial = null) {
  const fake = { token: 'account-a', storedToken: 'account-a', initial, systemTap: initial, nav: [], listener: null,
    api: async () => { throw new Error('not used'); } };
  globalThis.__nativePushNavigationTest = fake;
  const navigation = await import(`${sourceUrl.href}?navigation=${++sequence}`);
  return { fake, navigation };
}
try {
  { // Cold start logged out: never send the target through auth/home.
    const { fake, navigation } = await setup(response('cold-out', '/order/41'));
    fake.token = null;
    fake.storedToken = null;
    navigation.syncNativePushNavigation(true, null);
    await settle();
    assert.deepEqual(fake.nav, [], 'cold start logged out');
  }
  { // Cold start logged in: wait for readiness, then replace exactly once.
    const { fake, navigation } = await setup(response('cold-in', '/order/42'));
    navigation.syncNativePushNavigation(false, account());
    await settle();
    assert.deepEqual(fake.nav, [], 'navigation waited for session restoration');
    navigation.syncNativePushNavigation(true, account());
    await settle();
    assert.deepEqual(fake.nav, [['replace', '/order/42']], 'cold start logged in');
    assert.equal(fake.systemTap, null, 'the consumed launch response cannot reopen on restart');
  }
  { // A restored target belongs to the credential that received it, not the next account.
    const { fake, navigation } = await setup(response('switch', '/order/43'));
    fake.token = 'account-b';
    navigation.syncNativePushNavigation(true, account());
    await settle();
    assert.deepEqual(fake.nav, [], 'account switch invalidated the old target');
  }
  { // Role, account status and route authorization are checked before dispatch.
    for (const [url, me] of [['/admin/orders', account('customer')], ['/driver/earnings', account('customer')], ['/order/44', account('customer', 'blocked')]]) {
      const { fake, navigation } = await setup(response(`denied-${url}`, url));
      navigation.syncNativePushNavigation(true, me);
      await settle();
      assert.deepEqual(fake.nav, [], `unauthorized target ${url}`);
    }
  }
  { // Initial and listener delivery of one response opens only one route.
    const initial = Promise.withResolvers();
    const tapped = response('duplicate', '/order/45');
    const { fake, navigation } = await setup(initial);
    navigation.syncNativePushNavigation(true, account());
    fake.listener(tapped);
    initial.resolve(tapped);
    await settle();
    assert.deepEqual(fake.nav, [['replace', '/order/45']], 'duplicate initial/listener delivery');
  }
  { // The listener can receive the same response while the stored session is still restoring.
    const initial = Promise.withResolvers();
    const tapped = response('early-duplicate', '/order/48', 1);
    const { fake, navigation } = await setup(initial);
    fake.token = null;
    fake.listener(tapped);
    await settle();
    assert.deepEqual(fake.nav, [], 'a cold listener never opens before readiness');
    fake.token = 'account-a';
    navigation.syncNativePushNavigation(true, account());
    initial.resolve(tapped);
    await settle();
    assert.deepEqual(fake.nav, [['replace', '/order/48']], 'a tap during restoration uses the restored session');
  }
  { // A delayed cold-start response cannot replace a newer tap.
    const initial = Promise.withResolvers();
    const { fake, navigation } = await setup(initial);
    navigation.syncNativePushNavigation(true, account());
    fake.listener(response('newer', '/order/46'));
    initial.resolve(response('older-cold', '/order/47'));
    await settle();
    assert.deepEqual(fake.nav, [['replace', '/order/46']], 'newest tap wins');
  }
  { // The store can change before an older native response completes.
    const initial = Promise.withResolvers();
    const { fake, navigation } = await setup(initial);
    fake.storedToken = fake.token = 'account-b';
    navigation.syncNativePushNavigation(true, account());
    initial.resolve(response('previous-session', '/support'));
    await settle();
    assert.deepEqual(fake.nav, [], 'the cold tap belongs to the session captured before the asynchronous response');
  }
  {
    const { fake, navigation } = await setup();
    const me = { user: { ...account().user, accountMode: 'personal', modeRevision: 0 } };
    const oldest = Promise.withResolvers(), newest = Promise.withResolvers(), loading = Promise.withResolvers();
    const reads = [oldest, newest, loading];
    let started = 0;
    fake.api = path => path === '/me' ? reads[started++].promise : Promise.resolve({});
    navigation.syncNativePushNavigation(true, me);
    fake.listener(response('profile-first', '/order/81'));
    fake.listener(response('profile-next', '/order/82'));
    fake.listener(response('profile-next', '/order/82'));
    assert.equal(started, 2, 'duplicate taps share the same in-flight validation');
    newest.resolve(me); await settle();
    oldest.resolve(me); await settle();
    assert.deepEqual(fake.nav, [['replace', '/order/82']], 'a slower older tap cannot replace the newer destination');
    fake.listener(response('profile-loading', '/order/83'));
    navigation.syncNativePushNavigation(false, me);
    loading.resolve(me); await settle();
    assert.deepEqual(fake.nav, [['replace', '/order/82']], 'the navigator must still be ready after validation');
  }
  { // A tap can arrive after the same phone was signed in to a different account.
    const { fake, navigation } = await setup(response('different-account', '/support', 2));
    navigation.syncNativePushNavigation(true, account());
    await settle();
    assert.deepEqual(fake.nav, [], 'recipient binding survives a cold launch with a different saved token');
    assert.equal(fake.systemTap, null, 'a rejected stale response is consumed');
    fake.listener(response('same-account', '/support', 1));
    assert.deepEqual(fake.nav, [['replace', '/support']]);
  }
  { // Only known local notification routes are accepted.
    const { fake, navigation } = await setup();
    navigation.syncNativePushNavigation(true, account());
    for (const [index, url] of ['https://evil.example', '//evil.example', '/\\evil.example', '/unknown', '/order/abc', '/order/1?x=1', '/order/-1'].entries())
      fake.listener(response(`invalid-${index}`, url));
    await settle();
    assert.deepEqual(fake.nav, [], 'notification URL validation');
    fake.listener(response('invalid-driver', '/driver/earnings'));
    await settle();
    assert.deepEqual(fake.nav, [], 'a customer cannot open a driver target');
  }
  { // A role-appropriate target still dispatches once ready.
    const { fake, navigation } = await setup(response('valid-driver', '/driver/earnings'));
    navigation.syncNativePushNavigation(true, account('driver'));
    await settle();
    assert.deepEqual(fake.nav, [['replace', '/driver/earnings']], 'role-appropriate target');
  }
  { // A captain awaiting approval can still read their own support reply.
    const { fake, navigation } = await setup();
    navigation.syncNativePushNavigation(true, account('driver', 'pending'));
    fake.listener(response('pending-jobs', '/driver', 1));
    fake.listener(response('someone-elses-reply', '/support', 2, 'support_reply'));
    fake.listener(response('unbound-reply', '/support', undefined, 'support_reply'));
    fake.listener(response('non-reply', '/support', 1, 'attention'));
    navigation.syncNativePushNavigation(true, account('customer', 'pending'));
    fake.listener(response('other-role-reply', '/support', 1, 'support_reply'));
    assert.deepEqual(fake.nav, []);
    navigation.syncNativePushNavigation(true, account('driver', 'pending'));
    fake.listener(response('own-reply', '/support', 1, 'support_reply'));
    fake.listener(response('own-approval-before-refresh', '/driver', 1, 'approved'));
    assert.deepEqual(fake.nav, [['replace', '/support'], ['replace', '/driver']], 'pending captains can open their own support reply and approval');
    navigation.syncNativePushNavigation(true, account('driver', 'blocked'));
    fake.listener(response('blocked-reply', '/support', 1, 'support_reply'));
    assert.deepEqual(fake.nav, [['replace', '/support'], ['replace', '/driver']], 'a blocked account cannot open the inbox');
  }
  const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /const rootKey = useRootNavigationState\(\)\?\.key/);
  assert.match(layout, /const canOpenNotification = ready && !offline && !locationCleanupRequired && !mustUpdate && !!rootKey/);
  assert.match(layout, /syncNativePushNavigation\(canOpenNotification, me\)/, 'the root flushes only when the signed-in navigator is ready');
  console.log('Native notification navigation waits for an authorized session and opens each valid tap once');
} finally {
  hooks.deregister();
  delete globalThis.__nativePushNavigationTest;
}
