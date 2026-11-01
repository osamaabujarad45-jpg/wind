import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import { startApiProcess } from './support/api-process.mjs';
import { apiCaller } from './support/api.mjs';
import { OpencodeService } from '../server/domain/opencode.ts';

// Even explicitly enabled production settings cannot launch a process under
// the API's filesystem/credential identity.
const production = new OpencodeService({}, (status, message) => { throw Object.assign(new Error(message), { status }); },
  { NODE_ENV: 'production', WIND_OPENCODE_ENABLED: '1', ZRO_CLI_PATH: process.execPath });
await assert.rejects(() => production.runJob({ id: 1, role: 'admin' }, 'test', 'test', 'synthetic'),
  error => error.status === 409 && error.message === 'opencode_unavailable');

// Starting the actual strip-only Node API catches unsupported TypeScript
// constructor syntax; the real SQLite adapter catches PostgreSQL-only casts.
const dir = await mkdtemp(join(tmpdir(), 'wind-opencode-'));
const database = join(dir, 'synthetic.sqlite');
const api = await startApiProcess({ DB_PATH: database, WIND_OPENCODE_ENABLED: '1',
  ZRO_CLI_PATH: join(dir, 'missing-provider-executable') });
const db = new DatabaseSync(database);
const call = apiCaller(() => api.base);
try {
  for (const [phone, role] of [['0599700081', 'customer'], ['0599700082', 'admin'], ['0599700083', 'driver']]) {
    const salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO users(phone,name,password,role,status,created_at) VALUES(?,?,?,?,?,?)')
      .run(phone, 'Synthetic', `${salt}:${scryptSync('Synthetic-password', salt, 32).toString('hex')}`, role, 'active', Date.now());
  }
  const login = phone => call('/auth/login', { body: { phone, password: 'Synthetic-password' } });
  const customer = await login('0599700081'), admin = await login('0599700082'), driver = await login('0599700083');
  const input = { model: 'test/model', provider: 'test', prompt: 'Synthetic private prompt' };
  for (const token of [customer.token, driver.token]) {
    for (const path of ['/opencode', '/opencode/00000000-0000-4000-8000-000000000001'])
      assert.equal((await call(path, { token, expect: 403 })).error, 'forbidden');
    assert.equal((await call('/opencode/run', { token, body: input, expect: 403 })).error, 'forbidden');
  }
  for (const body of [{ ...input, model: '--help' }, { ...input, prompt: '' }, { ...input, prompt: { text: 'invalid' } }, { ...input, provider: '../invalid' }])
    assert.equal((await call('/opencode/run', { token: admin.token, body, expect: 400 })).error, 'invalid_input');
  const job = await call('/opencode/run', { token: admin.token, body: input });
  assert.ok(job.id);
  // A missing provider must fail the job, never emit an uncaught child 'error'
  // event which terminates the API process.
  let result;
  for (let attempt = 0; attempt < 100; attempt++) {
    result = await call(`/opencode/${job.id}`, { token: admin.token });
    if (result.status === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(result.status, 'failed');
  assert.equal(result.result, 'opencode_failed');
  assert.equal((await call('/opencode', { token: admin.token })).length, 1);
  assert.equal((await call('/opencode/not-a-uuid', { token: admin.token, expect: 400 })).error, 'invalid_input');
  console.log('OpenCode: Node startup, SQLite SQL, admin-only access, input validation and child-spawn failure passed');
} finally { db.close(); await api.stop(); }

// Default configuration never starts a provider or downloads a CLI.
const disabled = await startApiProcess({ DB_PATH: join(dir, 'disabled.sqlite'), WIND_OPENCODE_ENABLED: '0' });
const disabledDb = new DatabaseSync(join(dir, 'disabled.sqlite'));
try {
  const salt = randomBytes(16).toString('hex');
  disabledDb.prepare('INSERT INTO users(phone,name,password,role,status,created_at) VALUES(?,?,?,?,?,?)')
    .run('0599700082', 'Synthetic', `${salt}:${scryptSync('Synthetic-password', salt, 32).toString('hex')}`, 'admin', 'active', Date.now());
  const disabledCall = apiCaller(() => disabled.base);
  const admin = await disabledCall('/auth/login', { body: { phone: '0599700082', password: 'Synthetic-password' } });
  assert.equal((await disabledCall('/opencode/run', { token: admin.token,
    body: { model: 'test', provider: 'test', prompt: 'synthetic' }, expect: 409 })).error, 'opencode_unavailable');
  assert.equal(disabledDb.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='opencode_jobs'").get().n, 0);
} finally { disabledDb.close(); await disabled.stop(); }
