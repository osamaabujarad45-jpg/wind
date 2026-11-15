// C-01: the real recovery-storage module (seal/open through expo-crypto's AES API) against a stub that behaves like the
// Android native module: strings given to AES inputs are base64, and SealedData.fromCombined REJECTS a string, as the
// device did ("Value is a string, expected an Object"). Every other suite stubs recovery-storage away, which is how a
// record that could be written but never opened shipped.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import ts from 'typescript';

const load = (path, modules) => {
  const context = { exports: {}, require: name => { assert.ok(name in modules, `unexpected import ${name}`); return modules[name]; },
    atob, btoa, Uint8Array, TextEncoder, JSON, Date, Number, Error, Promise, String, Array, Math, Object, encodeURIComponent, decodeURIComponent };
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
};

const toBytes = input => {
  if (typeof input === 'string') return Buffer.from(input, 'base64');
  if (input instanceof Uint8Array) return Buffer.from(input);
  throw new Error('unsupported input');
};
class SealedData {
  constructor(bytes) { this.bytes = bytes; }
  static fromCombined(combined) {
    if (typeof combined === 'string') throw new Error('Value is a string, expected an Object'); // the Android native module
    return new SealedData(Buffer.from(combined));
  }
  async combined(encoding) { return encoding === 'base64' ? this.bytes.toString('base64') : new Uint8Array(this.bytes); }
}
const crypto = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm, text) => createHash('sha256').update(text).digest('hex'),
  AESEncryptionKey: { import: async (hex, encoding) => { assert.equal(encoding, 'hex'); return { key: Buffer.from(hex, 'hex') }; } },
  AESSealedData: SealedData,
  aesEncryptAsync: async (plaintext, { key }) => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(toBytes(plaintext)), cipher.final()]);
    return new SealedData(Buffer.concat([iv, body, cipher.getAuthTag()]));
  },
  aesDecryptAsync: async (sealed, { key }, options) => {
    const iv = sealed.bytes.subarray(0, 12), tag = sealed.bytes.subarray(-16), body = sealed.bytes.subarray(12, -16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    return options?.output === 'base64' ? plain.toString('base64') : new Uint8Array(plain);
  },
};

const store = new Map();
const token = 'session-token-for-recovery-test-0123456789';
const protectedRecovery = load('protected-recovery.ts', {});
const { recoveryStorage } = load('recovery-storage.ts', {
  'expo-crypto': crypto,
  './storage': { storage: { get: async key => store.get(key) ?? null, set: async (key, value) => { value === null ? store.delete(key) : store.set(key, value); } } },
  './api-client': { apiSessionCredential: () => token, apiSessionRevision: () => 1, serverOffset: () => 0 },
  './protected-recovery': protectedRecovery,
  './deadline-wake': { deadlineWake: { update: async () => {}, clear: async () => {}, pending: async () => null, acknowledge: async () => {} } },
});
store.set('token', token);

const summary = { schemaVersion: 1, actorId: 7, role: 'customer', savedAt: Date.now(),
  orders: [{ id: 2, service: 'parcel', status: 'searching', pickupCity: 'ramallah', dropoffCity: 'albireh', scheduledFor: null }] };
await recoveryStorage.write('summary', summary, 6 * 60 * 60_000);
assert.ok([...store.keys()].some(key => key.endsWith('.summary')), 'the summary is stored');
assert.deepEqual(await recoveryStorage.read('summary'), summary, 'a saved summary opens again with the Android fromCombined behaviour');
// Arabic text survives the base64/UTF-8 round trip.
await recoveryStorage.write('command', { note: 'السائق عند الباب' }, 15 * 60_000);
assert.deepEqual(await recoveryStorage.read('command'), { note: 'السائق عند الباب' });
console.log('Recovery storage: sealed records reopen with the Android AES binding (C-01)');
