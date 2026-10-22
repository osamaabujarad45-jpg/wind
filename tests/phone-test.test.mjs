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
  for (const api of ['https://wind-production-72aa.up.railway.app', 'http://localhost:4191', 'http://127.0.0.1:4190',
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
assert.ok(!ordinary.plugins.includes('./plugins/with-phone-test'));
const names = new Set(), androidIds = new Set(), iosIds = new Set(), schemes = new Set();
for (const role of roles) {
  const config = evaluate(localEnv(role));
  assert.equal(config.extra.phoneTest.role, role);
  assert.equal(config.extra.phoneTest.identifier, credentials.identifier);
  assert.equal(config.extra.phoneTest.password, credentials.password);
  assert.equal(config.android.package, `ps.wind.app.test${role}`);
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
  ]) assert.throws(() => evaluate({ ...localEnv(role), ...unsafe }), 'unsafe test build configuration fails closed');
}
for (const values of [names, androidIds, iosIds, schemes]) assert.equal(values.size, roles.length, 'every role installs separately');
assert.throws(() => evaluate(localEnv('merchant')));

const productionApi = 'https://wind-production-72aa.up.railway.app';
for (const release of [{ NODE_ENV: 'production' }, { EAS_BUILD: 'true' }, { WIND_RELEASE: '1' }]) {
  const config = evaluate({ ...release, EXPO_PUBLIC_API_URL: productionApi });
  assert.equal(config.extra.phoneTest, undefined);
  assert.equal(config.android.package, base.android.package);
  for (const api of [undefined, localApi, 'http://wind-production-72aa.up.railway.app', `${productionApi}/?x=1`, 'https://example.com'])
    assert.throws(() => evaluate({ ...release, EXPO_PUBLIC_API_URL: api }), 'release requires a real HTTPS API');
}
console.log('Phone test guards passed: isolated API, synthetic credentials, distinct role apps and production/EAS rejection');
