// WP09 native push (SQLite): durable native attempts stay honestly unavailable; Web Push best-effort is unchanged.
import assert from 'node:assert/strict';
import { createECDH, createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';

const dir = await mkdtemp(join(tmpdir(), 'wp09-sqlite-')), path = join(dir, 'synthetic.sqlite');
const api = await startApiProcess({ DB_PATH: path });
const db = new DatabaseSync(path);
const call = apiCaller(() => api.base);
try {
  const id = Number(db.prepare("INSERT INTO users(phone,name,password,role,status,created_at) VALUES('0599600001','Synthetic','','customer','active',?)").run(Date.now()).lastInsertRowid);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), id, Date.now());
  const deviceId = randomUUID();
  for (const [suffix, body] of [
    ['register', { expoPushToken: 'ExponentPushToken[wp09-sqlite-fixture]', deviceId, platform: 'android' }],
    ['unregister', { deviceId }],
    ['preferences', { deviceId, prefs: { nonessentialMuted: true } }],
  ]) {
    const result = await call(`/push/native/${suffix}`, { token, body, expect: 409 });
    assert.equal(result.error, 'native_push_unavailable', `${suffix} is gated on SQLite`);
  }
  const realtime = await call('/orders/1/realtime', { token, expect: 409 });
  assert.equal(realtime.error, 'durable_protocol_unavailable', 'realtime credentials require the durable protocol');
  // Legacy Web Push keeps its best-effort SQLite contract.
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  await call('/push/subscribe', { token, body: { endpoint: 'https://fcm.googleapis.com/wp09-sqlite', p256dh: ecdh.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url'), lang: 'en' } });
  assert.equal(db.prepare('SELECT count(*) n FROM push_subscriptions WHERE user_id=?').get(id).n, 1, 'web subscription still stored');
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='native_push_tokens'").get().n, 0, 'no false SQLite native durability claim');
  console.log('WP09 native-push-sqlite: native register/unregister/preferences and realtime gated 409, Web Push best-effort unchanged, no fabricated native table passed');
} finally {
  db.close();
  await api.stop();
}
