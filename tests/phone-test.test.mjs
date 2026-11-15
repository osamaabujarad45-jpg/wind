// Side-by-side phone icons must never turn production authentication into a bypass.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { phoneTestConfig } from '../src/phone-test.ts';

const roles = ['customer', 'driver', 'admin'];
const localApi = 'http://127.0.0.1:4191';
// Synthetic test values only; no provisioned account or secret is read by this suite.
const credentials = { identifier: '0599000123', password: 'Synthetic-test-password-123456' };
const appSource = readFileSync(new URL('../app.config.js', import.meta.url), 'utf8');
const base = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const evaluate = (env = {}) => {
  const module = { exports: {} };
  runInNewContext(appSource, { process: { env }, URL, module });
  return module.exports({ config: structuredClone(base) });
};
const localEnv = role => ({
  WIND_TEST_ROLE: role, WIND_LOCAL_TEST: '1', EXPO_PUBLIC_API_URL: localApi,
  WIND_TEST_IDENTIFIER: credentials.identifier, WIND_TEST_PASSWORD: credentials.password,
});

assert.equal(phoneTestConfig(undefined, 'https://wind.public.invalid'), null, 'ordinary builds require normal sign-in');
for (const role of roles) {
  const value = { role, ...credentials };
  assert.deepEqual(phoneTestConfig(value, localApi), value);
  assert.deepEqual(phoneTestConfig(value, `${localApi}/`), value);
  assert.deepEqual(phoneTestConfig(value, 'http://127.0.0.1:4192'), value, 'an independent unprivileged loopback port is accepted');
  for (const api of ['https://wind-production-72aa.up.railway.app', 'http://localhost:4191', 'http://127.0.0.1:80',
    `${localApi}/api`, `${localApi}/?x=1`, `${localApi}/#token`, 'http://user:pass@127.0.0.1:4191', 'invalid']) {
    assert.throws(() => phoneTestConfig(value, api), `test credentials refuse ${api}`);
  }
}
for (const value of [null, false, '', {}, { ...credentials, role: 'merchant' },
  { ...credentials, role: ['customer'] }, { ...credentials, role: { toString: () => 'customer' } },
  { ...credentials, role: 'customer', identifier: '123' }, { ...credentials, role: 'customer', password: 'short' },
  { ...credentials, role: 'customer', password: [] }]) {
  assert.throws(() => phoneTestConfig(value, localApi), 'malformed test configuration refuses to authenticate');
}

const ordinary = evaluate();
assert.equal(ordinary.name, base.name);
assert.equal(ordinary.android.package, base.android.package);
assert.equal(ordinary.ios.bundleIdentifier, base.ios.bundleIdentifier);
assert.equal(ordinary.extra.phoneTest, undefined);
assert.equal(ordinary.android.versionCode, base.android.versionCode, 'ordinary builds keep their configured versionCode');
assert.throws(() => evaluate({ WIND_TEST_VERSION_CODE: '28' }), /valid local phone test role/);
assert.ok(!ordinary.plugins.includes('./plugins/with-phone-test'));
// Ordinary QA shares only the isolated debug shell; auth receives no synthetic shortcut.
const ordinaryEnv = { WIND_TEST_ROLE: 'ordinary', WIND_LOCAL_TEST: '1', EXPO_PUBLIC_API_URL: localApi };
const ordinaryQa = evaluate(ordinaryEnv);
assert.equal(ordinaryQa.android.package, 'ps.wind.app.testordinary');
assert.equal(ordinaryQa.ios.bundleIdentifier, 'ps.wind.app.testordinary');
assert.equal(ordinaryQa.scheme, 'wind-test-ordinary');
assert.notEqual(ordinaryQa.android.package, base.android.package);
assert.ok(ordinaryQa.plugins.includes('./plugins/with-phone-test'));
assert.equal(Object.hasOwn(ordinaryQa.extra, 'phoneTest'), false);
assert.equal(phoneTestConfig(ordinaryQa.extra.phoneTest, localApi), null, 'ordinary QA follows normal authentication');
assert.equal(ordinaryQa.android.versionCode, base.android.versionCode);
assert.equal(evaluate({ ...ordinaryEnv, WIND_TEST_VERSION_CODE: '28' }).android.versionCode, 28);
assert.equal(evaluate({ ...ordinaryEnv, WIND_TEST_VERSION_CODE: '2147483647' }).android.versionCode, 2147483647);
assert.equal(Object.hasOwn(evaluate({ ...ordinaryEnv, NODE_ENV: 'production' }).extra, 'phoneTest'), false,
  'production JS embedded in a local Debug APK still uses ordinary sign-in');
const ordinaryWithInheritedCredentials = evaluate({ ...ordinaryEnv,
  WIND_TEST_IDENTIFIER: credentials.identifier, WIND_TEST_PASSWORD: credentials.password });
assert.equal(JSON.stringify(ordinaryWithInheritedCredentials).includes(credentials.identifier), false);
assert.equal(JSON.stringify(ordinaryWithInheritedCredentials).includes(credentials.password), false);
base.extra.phoneTest = { role: 'customer', ...credentials };
try { assert.equal(Object.hasOwn(evaluate(ordinaryEnv).extra, 'phoneTest'), false, 'stale base config cannot enable shortcut auth'); }
finally { delete base.extra.phoneTest; }
for (const unsafe of [
  { WIND_LOCAL_TEST: undefined }, { WIND_LOCAL_TEST: '0' }, { EAS_BUILD: '1' }, { WIND_RELEASE: '1' },
  { EXPO_PUBLIC_API_URL: 'https://wind-production-72aa.up.railway.app' },
  { EXPO_PUBLIC_API_URL: 'http://192.168.1.2:4191' }, { EXPO_PUBLIC_API_URL: 'http://localhost:4191' },
  { EXPO_PUBLIC_API_URL: `${localApi}/api` }, { EXPO_PUBLIC_API_URL: `${localApi}/?x=1` },
  { EXPO_PUBLIC_API_URL: 'http://user:pass@127.0.0.1:4191' },
  { WIND_PHONE_TEST_PORT: '80' }, { WIND_TEST_VERSION_CODE: '0' }, { WIND_TEST_VERSION_CODE: '-1' },
  { WIND_TEST_VERSION_CODE: '1.5' }, { WIND_TEST_VERSION_CODE: '2147483648' }, { WIND_TEST_VERSION_CODE: '' },
]) assert.throws(() => evaluate({ ...ordinaryEnv, ...unsafe }), 'ordinary QA cannot escape local Debug boundaries');
assert.equal(evaluate({ ...ordinaryEnv, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4192', WIND_PHONE_TEST_PORT: '4192' }).android.package,
  'ps.wind.app.testordinary', 'ordinary QA supports an independent isolated sandbox port');

const names = new Set(), androidIds = new Set(), iosIds = new Set(), schemes = new Set();
for (const role of roles) {
  const config = evaluate(localEnv(role));
  assert.equal(config.extra.phoneTest.role, role);
  assert.equal(config.extra.phoneTest.identifier, credentials.identifier);
  assert.equal(config.extra.phoneTest.password, credentials.password);
  assert.equal(config.android.package, `ps.wind.app.test${role}`);
  assert.equal(config.android.versionCode, base.android.versionCode, 'test builds keep the default unless explicitly overridden');
  assert.equal(evaluate({ ...localEnv(role), WIND_TEST_VERSION_CODE: '28' }).android.versionCode, 28);
  assert.equal(config.ios.bundleIdentifier, `ps.wind.app.test${role}`);
  assert.notEqual(config.android.package, base.android.package);
  assert.ok(config.plugins.includes('./plugins/with-phone-test'));
  names.add(config.name); androidIds.add(config.android.package); iosIds.add(config.ios.bundleIdentifier); schemes.add(config.scheme);
  // Metro exports production JS for a debug APK; the explicit local flag still scopes its config.
  assert.equal(evaluate({ ...localEnv(role), NODE_ENV: 'production' }).extra.phoneTest.role, role);
  for (const unsafe of [
    { WIND_LOCAL_TEST: undefined }, { WIND_LOCAL_TEST: '0' }, { EAS_BUILD: 'true' }, { WIND_RELEASE: '1' },
    { EXPO_PUBLIC_API_URL: 'https://wind-production-72aa.up.railway.app' },
    { EXPO_PUBLIC_API_URL: 'http://localhost:4191' }, { EXPO_PUBLIC_API_URL: `${localApi}/api` },
    { EXPO_PUBLIC_API_URL: `${localApi}/?x=1` }, { EXPO_PUBLIC_API_URL: `${localApi}/#x` },
    { WIND_TEST_IDENTIFIER: '123' }, { WIND_TEST_PASSWORD: 'short' },
    { WIND_TEST_VERSION_CODE: '0' }, { WIND_TEST_VERSION_CODE: '-1' }, { WIND_TEST_VERSION_CODE: '1.5' },
    { WIND_TEST_VERSION_CODE: '2147483648' }, { WIND_TEST_VERSION_CODE: '' },
  ]) assert.throws(() => evaluate({ ...localEnv(role), ...unsafe }), 'unsafe test build configuration fails closed');
}
for (const values of [names, androidIds, iosIds, schemes]) assert.equal(values.size, roles.length, 'every role installs separately');
assert.throws(() => evaluate(localEnv('merchant')));

const alternate = evaluate({ ...localEnv('customer'), EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4192', WIND_PHONE_TEST_PORT: '4192' });
assert.equal(alternate.extra.phoneTest.role, 'customer', 'a second independent loopback sandbox can be configured');
assert.throws(() => evaluate({ ...localEnv('customer'), WIND_PHONE_TEST_PORT: '80' }), 'sandbox port must be unprivileged');

const productionApi = 'https://wind-production-72aa.up.railway.app';
for (const release of [{ NODE_ENV: 'production' }, { EAS_BUILD: 'true' }, { WIND_RELEASE: '1' }]) {
  const config = evaluate({ ...release, EXPO_PUBLIC_API_URL: productionApi });
  assert.equal(config.extra.phoneTest, undefined);
  assert.equal(config.android.package, base.android.package);
  assert.throws(() => evaluate({ ...release, EXPO_PUBLIC_API_URL: productionApi, WIND_TEST_VERSION_CODE: '28' }), /valid local phone test role/);
  for (const api of [undefined, localApi, 'http://wind-production-72aa.up.railway.app', `${productionApi}/?x=1`, 'https://example.com'])
    assert.throws(() => evaluate({ ...release, EXPO_PUBLIC_API_URL: api }), 'release requires a real HTTPS API');
}
console.log('Phone test guards passed: isolated API, synthetic credentials, distinct role apps and production/EAS rejection');
