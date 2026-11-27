import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initializeSqlite } from '../server/db/sqlite-schema.ts';
import { initializePostgres } from '../server/db/postgres-schema.ts';
import { importSnapshot, readSnapshot } from '../server/migrate.ts';
import { SESSION_DAY_MS } from '../server/domain/session-policy.ts';
import { apiCaller } from './support/api.mjs';

const directory = mkdtempSync(join(tmpdir(), 'wind-account-profiles-'));
const path = join(directory, 'legacy.db');
const postgres = process.argv.includes('--postgres') ? await import('./pg-support.mjs') : null;
const target = postgres && await postgres.freshPostgres('profiles');
const source = new DatabaseSync(path);
const now = Date.now();
const tokenHash = token => createHash('sha256').update(token).digest('hex');
let runtime, imported;
try {
  initializeSqlite(source);
  const preProfiles = `
    DROP INDEX sessions_one_captain;
    DROP TABLE captain_profiles;
    ALTER TABLE sessions DROP COLUMN mode_revision;
    ALTER TABLE sessions DROP COLUMN active_mode;
    ALTER TABLE users DROP COLUMN captain_state;`;
  source.exec('DROP TRIGGER scrub_deleted_captain');
  source.exec(preProfiles);
  const seed = async db => {
    for (const [id, role, status, approval] of [
      [1, 'driver', 'active', now - 5_000], [2, 'driver', 'pending', null], [3, 'driver', 'pending', null],
      [4, 'customer', 'active', now - 5_000], [5, 'admin', 'active', now - 5_000],
    ]) {
      await db.run('INSERT INTO users (id,phone,name,password,role,status,vehicle,plate,created_at,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id, '059969010' + id, 'Synthetic profile ' + id, 'unused', role, status, role === 'driver' ? 'car' : null,
        role === 'driver' ? '42' : null, now - SESSION_DAY_MS, approval);
    }
    const audit = (action, detail, at) => db.run(
      'INSERT INTO security_events (actor_id,action,detail,created_at) VALUES (5,?,?,?)', action, JSON.stringify(detail), at);
    await audit('DRIVER_APPROVED', { targetId: 2 }, now - 5_000);
    await audit('USER_UPDATED', { targetId: 2, roleChanged: true }, now - 4_000);
    await audit('DRIVER_APPROVED', { targetId: 2 }, now - 3_800);
    await audit('USER_APPROVED', { targetId: 2, role: 'customer' }, now - 3_500);
    await audit('DRIVER_APPROVED', { targetId: 3 }, now - 3_000);
    await audit('USER_UPDATED', { targetId: 3, roleChanged: false }, now - 2_000);
    for (const [token, id, created, lastSeen] of [
      ['first', 1, now - 8_000, now - 800], ['second', 1, now - 7_000, now - 800],
      ['expired', 1, now - 100 * SESSION_DAY_MS, now - 200], ['applicant', 2, now - 1_000, now - 900],
      ['review', 3, now - 1_000, null], ['buyer', 4, now - 1_000, null], ['admin', 5, now - 1_000, null],
    ]) await db.run('INSERT INTO sessions (token_hash,user_id,created_at,last_seen_at) VALUES (?,?,?,?)', tokenHash(token), id, created, lastSeen);
  };
  await seed({ run: (sql, ...args) => source.prepare(sql).run(...args) });
  if (target) {
    await target.database.migrate(5703001, async () => {
      await target.database.run('DROP TRIGGER scrub_deleted_captain ON users; DROP FUNCTION scrub_deleted_captain()');
      await target.database.run(preProfiles);
      await target.database.run('DELETE FROM schema_migrations WHERE version = 45');
      await seed(target.database);
      await target.database.one("SELECT setval(pg_get_serial_sequence('users', 'id'), 5)");
    });
    await initializePostgres(target.database, target.schema);
    await initializePostgres(target.database, target.schema);
    imported = await postgres.freshPostgres('profileimp');
    const report = await importSnapshot(readSnapshot(path), imported.database, imported.schema);
    assert.equal(report.ok, true, JSON.stringify(report.errors ?? report.reconciliation?.mismatches ?? []));
    const importedSessions = await imported.database.all('SELECT user_id,active_mode FROM sessions WHERE active_mode = ? ORDER BY user_id', 'captain');
    assert.deepEqual(importedSessions.map(row => row.user_id), [1, 3]);
    postgres.selectRuntime(target.schema);
  } else {
    initializeSqlite(source);
    initializeSqlite(source);
    assert.equal(source.prepare('PRAGMA user_version').get().user_version, 3);
  }
  process.env.DB_PATH = path;
  process.env.WIND_IDENTITY_MODE = 'self-service';
  process.env.WIND_ENABLED_SERVICES = 'ride,parcel,shop';
  process.env.WIND_PROFILE_SHADOW = '1';
  runtime = await import('../server/main.ts');
  const { server, persistence } = runtime;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
  const me = token => call('/me', { token });
  assert.equal((await me('first')).profilePreview.mode, 'personal');
  assert.deepEqual((await me('second')).profilePreview, { mode: 'captain', revision: 1, role: 'driver',
    captain: { state: 'approved', available: true }, shop: null });
  assert.equal((await me('applicant')).user.status, 'pending');
  assert.deepEqual((await me('applicant')).profilePreview.captain, { state: 'under_review', available: false });
  assert.deepEqual((await me('review')).profilePreview.captain, { state: 'review', available: true });
  assert.equal((await me('buyer')).profilePreview.mode, 'personal');
  assert.equal((await me('admin')).profilePreview, undefined);
  await call('/me', { token: 'expired', expect: 401 });
  await assert.rejects(persistence.run("UPDATE sessions SET active_mode='captain' WHERE token_hash=?", tokenHash('first')));
  const legacy = await call('/auth/register', { body: { phone: '0599690106', name: 'New legacy driver',
    password: 'Synthetic-pass-123', role: 'driver', vehicle: 'car', consent: true } });
  assert.equal(legacy.user.role, 'driver');
  const oldPreview = await call('/me', { token: legacy.token });
  assert.equal(oldPreview.profilePreview.mode, 'personal');
  assert.equal(oldPreview.user.role, 'driver', 'preview leaves authorization and routing to the installed role');
  const adminOptions = { token: 'admin' };
  await call(`/admin/users/${legacy.user.id}/approve`, { ...adminOptions, body: {} });
  await call(`/admin/users/${legacy.user.id}`, { ...adminOptions, body: { vehicle: 'van' } });
  const recheck = await call('/auth/login', { body: { phone: '0599690106', password: 'Synthetic-pass-123' } });
  assert.equal(recheck.user.status, 'pending');
  assert.deepEqual(recheck.profilePreview.captain, { state: 'review', available: true });
  await call('/admin/users/1', { ...adminOptions, body: { role: 'customer' } });
  await call('/admin/users/1', { ...adminOptions, body: { role: 'driver' } });
  await persistence.run('INSERT INTO sessions (token_hash,user_id,created_at) VALUES (?,1,?)', tokenHash('returning'), now);
  const returning = await me('returning');
  assert.equal(returning.user.status, 'pending');
  assert.deepEqual(returning.profilePreview.captain, { state: 'under_review', available: false });
  assert.ok(await persistence.one('SELECT user_id FROM captain_profiles WHERE user_id=1'));
  await call('/admin/users/1', { ...adminOptions, method: 'DELETE' });
  assert.equal(await persistence.one('SELECT user_id FROM captain_profiles WHERE user_id=1'), undefined);
  assert.equal((await persistence.one('SELECT captain_state FROM users WHERE id=1')).captain_state, null);
  process.env.WIND_PROFILE_SHADOW = '0';
  assert.equal((await me('review')).profilePreview, undefined);
  // A release from before the profile migration tombstones the user without touching profile data.
  await persistence.run("UPDATE users SET phone = 'deleted-3', status = 'blocked', vehicle = NULL, plate = NULL WHERE id = 3");
  assert.equal(await persistence.one('SELECT user_id FROM captain_profiles WHERE user_id=3'), undefined);
  assert.equal((await persistence.one('SELECT captain_state FROM users WHERE id=3')).captain_state, null);
  console.log(`Profile preview and legacy migration passed on ${persistence.backend}`);
} finally {
  await runtime?.shutdown();
  for (const item of [target, imported].filter(Boolean)) {
    await item.database.run(`DROP SCHEMA ${item.schema} CASCADE`);
    await item.database.close();
  }
  source.close();
  rmSync(directory, { recursive: true, force: true });
}
