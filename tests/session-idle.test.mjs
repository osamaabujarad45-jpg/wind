// Session lifetime: 30-day sliding idle expiry under the 90-day absolute cap.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-session-idle-'));
Object.assign(process.env, { NODE_ENV: 'production', WIND_PUSH_SUBJECT: 'mailto:wind-suite@example.invalid', WIND_TRUST_PROXY: '1', WIND_IDENTITY_MODE: 'self-service',
  DB_PATH: join(dir, 'test.db'), SUPPORT_CONTACT: 'Synthetic support', WIND_ENABLED_SERVICES: 'parcel' });
const password = 'Synthetic_Password123';
const { server, db, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function call(path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
const DAY = 86_400_000;
try {
  const registered = await call('/auth/register', null,
    { name: 'Idle tester', email: 'idle@example.test', phone: '0599000021', password, consent: true });
  assert.equal(registered.status, 200, JSON.stringify(registered.data));
  const token = registered.data.token;
  assert.equal((await call('/me', token)).status, 200);

  // Idle for 31 days: rejected even though the absolute age is fine.
  db.prepare('UPDATE sessions SET last_seen_at = ?').run(Date.now() - 31 * DAY);
  assert.equal((await call('/me', token)).status, 401);

  // Seen recently but created 91 days ago: the absolute cap still wins.
  db.prepare('UPDATE sessions SET created_at = ?, last_seen_at = ?').run(Date.now() - 91 * DAY, Date.now());
  assert.equal((await call('/me', token)).status, 401);

  // A fresh login works and stamps last_seen_at.
  const login = await call('/auth/login', null, { identifier: 'idle@example.test', password });
  assert.equal(login.status, 200);
  assert.equal((await call('/me', login.data.token)).status, 200);
  const seen = db.prepare('SELECT last_seen_at FROM sessions ORDER BY created_at DESC LIMIT 1').get().last_seen_at;
  assert.ok(Math.abs(Date.now() - seen) < 60_000, 'last_seen_at stamped at login');
  console.log('session-idle.test.mjs passed');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
