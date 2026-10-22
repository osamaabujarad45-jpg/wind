import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/with-phone-test.js');
const releasePlugin = require('../plugins/with-release-guard.js');
const variables = ['WIND_TEST_ROLE', 'WIND_LOCAL_TEST', 'EAS_BUILD', 'WIND_RELEASE', 'EXPO_PUBLIC_API_URL'];
const saved = Object.fromEntries(variables.map(key => [key, process.env[key]]));
const setEnv = overrides => {
  for (const key of variables) delete process.env[key];
  Object.assign(process.env, { WIND_TEST_ROLE: 'customer', WIND_LOCAL_TEST: '1', EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4191', ...overrides });
};
const config = () => ({ name: 'Wind Customer Test', slug: 'wind', android: { package: 'ps.wind.app.testcustomer' } });
const dir = mkdtempSync(join(tmpdir(), 'wind-phone-build-'));
try {
  for (const overrides of [
    { WIND_LOCAL_TEST: '' }, { EAS_BUILD: '1' }, { WIND_RELEASE: '1' }, { WIND_TEST_ROLE: 'owner' },
    { EXPO_PUBLIC_API_URL: 'https://wind-production-72aa.up.railway.app' },
    { EXPO_PUBLIC_API_URL: 'http://192.168.1.2:4191' },
    { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4191@evil.example' },
    { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4191?token=private' },
  ]) {
    setEnv(overrides);
    assert.throws(() => plugin(config()), undefined, JSON.stringify(overrides));
  }
  setEnv({});
  assert.throws(() => plugin({ ...config(), android: { package: 'ps.wind.app' } }), /separate/);
  delete process.env.WIND_TEST_ROLE;
  const normal = config();
  assert.equal(plugin(normal), normal);
  assert.equal(normal.mods, undefined, 'Ordinary app configuration does not gain test mods');

  setEnv({});
  const mods = plugin(releasePlugin(config())).mods.android;
  const gradle = await mods.appBuildGradle({ modResults: { language: 'groovy', contents: 'apply plugin: "com.android.application"\n' }, modRequest: {} });
  assert.match(gradle.modResults.contents, /debuggableVariants = \[\]/);
  assert.match(gradle.modResults.contents, /Phone test apps cannot be built as Release/);
  assert.match(gradle.modResults.contents, /Wind release requires a public HTTPS/);
  assert.match(gradle.modResults.contents, /Wind release needs a real upload signing key/);
  const main = await mods.mainApplication({
    modResults: { language: 'kt', contents: 'ExpoReactHostFactory.getDefaultReactHost(\n      context = applicationContext,\n      packageList = PackageList(this).packages\n    )' }, modRequest: {},
  });
  assert.match(main.modResults.contents, /useDevSupport = false,/);
  const repeated = await mods.mainApplication({ modResults: main.modResults, modRequest: {} });
  assert.equal([...repeated.modResults.contents.matchAll(/useDevSupport = false/g)].length, 1);

  const android = join(dir, 'android'), debug = join(android, 'app', 'src', 'debug');
  mkdirSync(debug, { recursive: true });
  writeFileSync(join(debug, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:usesCleartextTraffic="true" /></manifest>');
  await mods.dangerous({ modRequest: { platformProjectRoot: android }, modResults: {} });
  const manifest = readFileSync(join(debug, 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:networkSecurityConfig="@xml\/wind_phone_test_network_security"/);
  const network = readFileSync(join(debug, 'res', 'xml', 'wind_phone_test_network_security.xml'), 'utf8');
  assert.match(network, /base-config cleartextTrafficPermitted="false"/);
  assert.match(network, /domain-config cleartextTrafficPermitted="true"/);
  assert.deepEqual([...network.matchAll(/<domain includeSubdomains="false">([^<]+)<\/domain>/g)].map(match => match[1]), ['127.0.0.1', 'localhost', '::1']);
  console.log('Phone build boundaries passed: isolated role IDs, loopback-only Debug policy, embedded bundle and intact Release guards');
} finally {
  for (const key of variables) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep + 'wind-phone-build-'));
  rmSync(dir, { recursive: true, force: true });
}
