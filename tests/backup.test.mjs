// T46: a missed backup reaches an admin, and a nightly copy restores to a working service.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
import { startApiProcess } from './support/api-process.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-backup-'));
const marker = join(dir, 'last-ok');
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_BACKUP_MARKER = marker;
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-backup-suite@example.invalid';
process.env.WIND_EXPO_PUSH_ENABLED = '1';
delete process.env.OSRM_URL; delete process.env.WIND_DATABASE_URL;
const { alertMissedBackup, db, persistence, promote, server, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const realFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = (url, init) => String(url).startsWith('https://exp.host/')
  ? (sent.push(JSON.parse(init.body)[0]), Promise.resolve(Response.json({ data: [{ status: 'ok', id: 't' }] })))
  : realFetch(url, init);
const inFlight = new Set();
const detached = persistence.detached.bind(persistence);
persistence.detached = work => { const running = detached(work); inFlight.add(running); void running.finally(() => inFlight.delete(running)).catch(() => {}); return running; };
const settle = async () => { while (inFlight.size) await Promise.allSettled([...inFlight]); };
const call = apiCaller(() => base, realFetch);

try {
  await call("/auth/register", { body: { phone: "0599170001", name: "Admin", password: "secret1" } });
  await promote('0599170001');
  const staff = await call('/auth/login', { body: { phone: '0599170001', password: 'secret1' } });
  await call('/push/native/register', { token: staff.token, body: { expoPushToken: 'ExponentPushToken[backup-admin-device]', deviceId: '4c7d1a7e-2f6b-4d1a-9a3e-6f0a1b2c3d4e', platform: 'android', lang: 'en' } });
  const customer = await call('/auth/register', { body: { phone: '0599170002', name: 'Rana', password: 'secret1' } });
  const stats = () => call('/admin/stats', { token: staff.token });

  // No marker yet: the job never succeeded, so the dashboard says so and one admin alert goes out.
  assert.equal((await stats()).backupStale, true, 'no marker counts as stale');
  assert.equal(await alertMissedBackup(), true);
  await settle();
  assert.equal(sent.length, 1, 'the admin hears of it');
  assert.equal(sent[0].data.kind, 'attention');
  assert.equal(sent[0].data.url, '/admin', 'and the alert opens the dashboard, which explains it');
  assert.equal(sent[0].priority, 'high');
  // The dashboard keeps saying it, but the phone is told once a day.
  assert.equal(await alertMissedBackup(), false, 'at most one alert a day');
  await settle();
  assert.equal(sent.length, 1);

  // A fresh marker clears both.
  sent.length = 0;
  writeFileSync(marker, '');
  assert.equal((await stats()).backupStale, false);
  assert.equal(await alertMissedBackup(), false, 'a fresh backup alerts nobody');
  // Just inside and just past the 26 hour limit, with a second of margin either way.
  const now = Date.now();
  const age = hours => { const t = (now - hours * 3_600_000) / 1000; utimesSync(marker, t, t); };
  age(26 - 1 / 3600); assert.equal((await stats()).backupStale, false, 'a job that ran late is not an alarm');
  age(26 + 1 / 3600); assert.equal((await stats()).backupStale, true, 'over a day and its slack is');

  // The customer never sees this.
  await call('/admin/stats', { token: customer.token, expect: 403 });

  // The script moves the marker only after its upload, so a failed off-VM copy also goes stale.
  const script = readFileSync(new URL('../infra/vm/wind-backup.sh', import.meta.url), 'utf8');
  assert.ok(script.indexOf('curl -fsS') > 0 && script.indexOf('curl -fsS') < script.indexOf('touch "$dir/last-ok"'), 'marker after upload');
  assert.match(script, /^set -eu/m, 'and a failed upload stops the script before it');

  // Restore: the nightly copy, unzipped into place, runs the service with its accounts and orders.
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599170002', detail: 'Box' };
  const order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  const copy = join(dir, 'copy.db');
  db.exec(`VACUUM INTO '${copy.replaceAll("'", "''")}'`); // the same statement as infra/vm/wind-backup.sh
  const check = new DatabaseSync(copy, { readOnly: true });
  assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  check.close();
  const restored = join(dir, 'restored.db');
  writeFileSync(restored, gunzipSync(gzipSync(readFileSync(copy))));
  assert.ok(!existsSync(`${restored}-wal`), 'no journal to replay');
  const api = await startApiProcess({ DB_PATH: restored });
  try {
    const remote = apiCaller(() => api.base, realFetch);
    const signedIn = await remote('/auth/login', { body: { phone: '0599170002', password: 'secret1' } });
    assert.equal((await remote(`/orders/${order.id}`, { token: signedIn.token })).id, order.id, 'the order is there');
    const added = await remote('/orders', { token: signedIn.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    assert.ok(added.id > order.id, 'and the restored service takes new work');
  } finally { await api.stop(); }

  console.log('Backup: missed backup alerts admins once a day, dashboard holds until a success, restore runs the service');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
