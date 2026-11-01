import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createProtectedRecovery } from '../src/protected-recovery.ts';
import { offlineSummary, readOfflineSummary } from '../src/offline-summary.ts';
const data = new Map(); let token = 'session-one', revision = 1, now = 1000, pauseSeal;
const key = (token, slot) => createHash('sha256').update(token + slot).digest();
const io = { read: async k => data.get(k) ?? null, write: async (k, v) => { if (v === null) data.delete(k); else data.set(k, v); },
  credential: async () => token, revision: () => revision, now: () => now,
  namespace: async token => createHash('sha256').update(token).digest('hex'),
  seal: async (text, token, slot) => { if (pauseSeal) await pauseSeal; const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(token, slot), iv);
    return Buffer.concat([iv, c.update(text), c.final(), c.getAuthTag()]).toString('base64'); },
  open: async (text, token, slot) => { const bytes = Buffer.from(text, 'base64'), d = createDecipheriv('aes-256-gcm', key(token, slot), bytes.subarray(0,12));
    d.setAuthTag(bytes.subarray(-16)); return Buffer.concat([d.update(bytes.subarray(12,-16)), d.final()]).toString(); } };
let store = createProtectedRecovery(io);
await store.write('command', { requestId: 'same', code: '1234' }, 1000);
assert.equal([...data.values()].some(v => v.includes('1234')), false);
store = createProtectedRecovery(io);
assert.deepEqual(await store.read('command'), { requestId: 'same', code: '1234' }, 'process replacement reopens exact encrypted pending payload');
token = 'session-two'; revision++;
assert.equal(await store.read('command'), null, 'another login cannot read or overwrite an earlier session');
token = 'session-one'; revision++; await store.clear(); token = 'session-two'; revision++;
await store.write('summary', { safe: true }, 1000); now = 2000;
await assert.rejects(store.read('summary'), /recovery_record_unavailable/);
now = 1000; let finish; pauseSeal = new Promise(r => { finish = r; });
const pending = store.write('command', { code: '9999' }, 1000);
await new Promise(r => setImmediate(r)); revision++;
const logout = store.clear(); pauseSeal = null; finish();
await assert.rejects(pending, /session_changed/); await logout; assert.equal([...data.keys()].filter(key => !key.endsWith('.index')).length, 0, 'logout cannot race an old writer');
await assert.rejects(store.write('command', { oversized: 'x'.repeat(3000) }, 1000), /too_large/);
const summary = offlineSummary(7, 'driver', [{ id: 4, driverId: 7, service: 'parcel', status: 'assigned', pickupCity: 'ramallah', dropoffCity: 'nablus',
  handoverCode: 'secret-proof', driverPhone: 'private-phone', pickupNote: 'private-address', price: 999 }], 1000);
assert.equal(JSON.stringify(summary).includes('private'), false); assert.equal(JSON.stringify(summary).includes('secret'), false);
assert.deepEqual(readOfflineSummary(summary, 1001, 60000), summary);
assert.equal(readOfflineSummary(summary, 61000, 60000), null);
assert.equal(offlineSummary(8, 'driver', [{ ...summary.orders[0], driverId: 7 }], 1000).orders.length, 0);
console.log('Protected recovery encryption, process replacement, session isolation, TTL, logout races, size bounds and minimal offline fields passed');
