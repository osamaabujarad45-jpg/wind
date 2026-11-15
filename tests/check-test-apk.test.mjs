// Ordinary-sign-in APK credential scan, tested on synthetic zips only: CI needs no Android SDK or real provisioning.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { checkOrdinaryApk, provisionedSecrets, zipEntries } from '../scripts/check-test-apk.mjs';

// Minimal zip writer (local headers, central directory, end record) for stored or deflated entries.
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data, deflate = false } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const body = deflate ? deflateRawSync(data) : data;
    const method = deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, body);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.reduce((sum, part) => sum + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

// Synthetic values only; none is a real account.
const provision = {
  apiUrl: 'http://127.0.0.1:4191',
  roles: {
    customer: { identifier: '0599000101', password: 'Synthetic-customer-pass-1111', token: 'synthetic-token-customer-1' },
    driver: { identifier: '0599000102', password: 'Synthetic-driver-pass-222222', token: 'synthetic-token-driver-22' },
    admin: { identifier: '0599000109', password: 'Synthetic-admin-pass-3333333', token: 'synthetic-token-admin-333' },
  },
};
const secrets = provisionedSecrets(provision);
const { customer, driver, admin } = provision.roles;

const cleanConfig = { name: 'Wind Ordinary Test', android: { package: 'ps.wind.app.testordinary' }, extra: {} };
const apk = ({ extra = [], appConfig = cleanConfig } = {}) => zip([
  { name: 'assets/app.config', data: Buffer.from(JSON.stringify(appConfig)), deflate: true },
  { name: 'assets/index.android.bundle', data: Buffer.from('console.log("wind");\n'.repeat(4000)), deflate: true },
  { name: 'AndroidManifest.xml', data: Buffer.from('<manifest package="ps.wind.app.testordinary"/>') },
  ...extra,
]);
const planted = (name, data, deflate = false) => apk({ extra: [{ name, data: Buffer.from(data), deflate }] });

// Zip reader round trip: stored and deflated entries come back byte-exact.
const entries = zipEntries(zip([
  { name: 'stored.txt', data: Buffer.from('plain bytes') },
  { name: 'lib/deflated.bin', data: Buffer.from('compressed bytes '.repeat(50)), deflate: true },
]));
assert.deepEqual(entries.map(entry => entry.name), ['stored.txt', 'lib/deflated.bin']);
assert.equal(entries[0].data.toString(), 'plain bytes');
assert.equal(entries[1].data.toString(), 'compressed bytes '.repeat(50));
assert.throws(() => zipEntries(Buffer.from('not a zip, just plain text padding')), /Not a zip file/);

// Every identifier, password and token; empty and missing values are skipped.
assert.equal(secrets.length, 9);
for (const account of Object.values(provision.roles)) {
  assert.ok(secrets.includes(account.identifier) && secrets.includes(account.password) && secrets.includes(account.token));
}
assert.deepEqual(provisionedSecrets({ roles: { customer: { identifier: '', password: '', token: '' }, driver: {}, admin: null } }), []);
assert.deepEqual(provisionedSecrets({}), []);

// A clean ordinary APK passes; an empty value never matches everything (an empty needle is contained in any entry).
checkOrdinaryApk(apk(), secrets);
assert.doesNotThrow(() => checkOrdinaryApk(apk(), ['', ...secrets]));
assert.throws(() => checkOrdinaryApk(apk(), ['']), /No provisioned credentials/);
assert.throws(() => checkOrdinaryApk(apk(), []), /No provisioned credentials/, 'an empty scan fails closed');

// Planted credentials are found in any entry (compressed or stored), in every role's identifier, password and token.
assert.throws(() => checkOrdinaryApk(planted('assets/index.android.bundle.map', `{"p":"${driver.password}"}`, true), secrets),
  /credential in assets\/index\.android\.bundle\.map/, 'a deflated non-config entry is scanned');
assert.throws(() => checkOrdinaryApk(planted('res/values/strings.xml', `<s>${customer.identifier}</s>`), secrets),
  /credential in res\/values\/strings\.xml/, 'an identifier in a stored resource is found');
assert.throws(() => checkOrdinaryApk(planted('lib/arm64-v8a/libnative.so', admin.token, true), secrets),
  /credential in lib\/arm64-v8a\/libnative\.so/, 'a token is found');
assert.throws(() => checkOrdinaryApk(planted('resources/strings.bin', Buffer.from(admin.password, 'utf16le')), secrets),
  /credential in resources\/strings\.bin/, 'a UTF-16LE password is found');
assert.throws(() => checkOrdinaryApk(apk({ appConfig: { ...cleanConfig, note: driver.password } }), secrets),
  /credential in assets\/app\.config/, 'a credential inside the embedded configuration is found');

// Configuration refusals: wrong application ID, embedded test role, missing configuration.
assert.throws(() => checkOrdinaryApk(apk({ appConfig: { ...cleanConfig, android: { package: 'ps.wind.app' } } }), secrets),
  /its own application ID/);
assert.throws(() => checkOrdinaryApk(apk({ appConfig: { ...cleanConfig, extra: { phoneTest: { role: 'customer' } } } }), secrets),
  /its own application ID/);
assert.throws(() => checkOrdinaryApk(zip([{ name: 'AndroidManifest.xml', data: Buffer.from('<manifest/>') }]), secrets),
  /no embedded Expo configuration/);

// Command line used by build-phone-tests.ps1: exit 0 when clean, 1 with the entry named but no secret printed.
const dir = mkdtempSync(join(tmpdir(), 'wind-apk-check-'));
try {
  const provisionPath = join(dir, 'provision.json');
  writeFileSync(provisionPath, JSON.stringify(provision));
  const cleanPath = join(dir, 'clean.apk'), leakyPath = join(dir, 'leaky.apk');
  writeFileSync(cleanPath, apk());
  writeFileSync(leakyPath, planted('assets/leak.txt', admin.password, true));
  const script = fileURLToPath(new URL('../scripts/check-test-apk.mjs', import.meta.url));
  const run = apkPath => spawnSync(process.execPath, [script, apkPath, provisionPath], { encoding: 'utf8' });
  const clean = run(cleanPath);
  assert.equal(clean.status, 0, clean.stderr);
  const leaky = run(leakyPath);
  assert.equal(leaky.status, 1);
  assert.match(leaky.stderr, /credential in assets\/leak\.txt/);
  assert.ok(!`${leaky.stdout}${leaky.stderr}`.includes(admin.password), 'the failure names the entry, never the secret');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('Ordinary-sign-in APK scan passed: every entry, UTF-8 and UTF-16 needles, empty values ignored, fail-closed without secrets');
