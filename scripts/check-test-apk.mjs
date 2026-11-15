// Credential check for the ordinary-sign-in test APK, called by build-phone-tests.ps1 and unit-tested in CI.
// Usage: node scripts/check-test-apk.mjs <apk> <provision.json>
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';

// Minimal zip reader (stored and deflate entries) so CI needs neither PowerShell nor a zip dependency.
export function zipEntries(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28), extraLength = buf.readUInt16LE(p + 30), commentLength = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported zip method ${method} for ${name}`);
    entries.push({ name, data: method === 0 ? raw : inflateRawSync(raw) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// Every provisioned identifier, password and token, skipping empty values (an empty needle matches everything).
export function provisionedSecrets(provision) {
  return Object.values(provision.roles ?? {})
    .flatMap(account => [account?.identifier, account?.password, account?.token])
    .map(value => (value == null ? '' : String(value))).filter(Boolean);
}

export function checkOrdinaryApk(apk, secrets, packageName = 'ps.wind.app.testordinary') {
  // Fail closed: with nothing to search for, a clean scan would prove nothing.
  const values = secrets.filter(Boolean);
  if (!values.length) throw new Error('No provisioned credentials to check the APK against.');
  const entries = zipEntries(apk);
  const config = entries.find(entry => entry.name === 'assets/app.config');
  if (!config) throw new Error('The test APK has no embedded Expo configuration.');
  const value = JSON.parse(config.data.toString('utf8'));
  if (value.android?.package !== packageName || value.extra?.phoneTest) {
    throw new Error('The ordinary-sign-in APK must carry no credentials and its own application ID.');
  }
  // Every entry's bytes, in UTF-8 and UTF-16LE (resource tables may store strings either way).
  const needles = values.flatMap(secret => [Buffer.from(secret, 'utf8'), Buffer.from(secret, 'utf16le')]);
  for (const entry of entries) {
    if (needles.some(needle => entry.data.includes(needle))) {
      throw new Error(`The ordinary-sign-in APK carries a provisioned credential in ${entry.name}.`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [apk, provision] = process.argv.slice(2);
  checkOrdinaryApk(readFileSync(apk), provisionedSecrets(JSON.parse(readFileSync(provision, 'utf8'))));
  console.log('Ordinary-sign-in APK holds no provisioned credential.');
}
