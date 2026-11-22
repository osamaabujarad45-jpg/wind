// T46: a missed backup reaches an admin, and a backup copy restores to a working service.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
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
delete process.env.OSRM_URL; delete process.env.WIND_DATABASE_URL; delete process.env.WIND_BACKUP_MAX_AGE_HOURS; // the 26 hour default
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
  // With no admin yet nobody can hear it, so the day's alert is not spent.
  assert.equal(await alertMissedBackup(), false, 'no admin, no alert');
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
  // A second outage the same day alerts again: the success in between ended the first one (Haiku PR #103 M1).
  assert.equal(await alertMissedBackup(), true, 'a new outage after a success is told at once');
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(await alertMissedBackup(), false, 'and still once per outage');

  // A success and the next failure can both happen between maintenance sweeps. The marker is newer than the last alert,
  // so that allowance must be cleared even though no sweep observed the marker while it was fresh.
  const allowance = db.prepare("SELECT until FROM request_limits WHERE key LIKE 'backup-alert:%'").get();
  db.prepare("UPDATE request_limits SET until = ? WHERE key LIKE 'backup-alert:%'")
    .run(Date.now() - 3 * 3_600_000 + 24 * 3_600_000);
  age(2);
  sent.length = 0;
  const secondOutage = Date.now() + 27 * 3_600_000;
  const alerts = await Promise.all([alertMissedBackup(secondOutage), alertMissedBackup(secondOutage)]);
  assert.equal(alerts.filter(Boolean).length, 1, `a second outage alerts once, even with overlapping sweeps (last alert ${allowance.until})`);
  await settle();
  assert.equal(sent.length, 1);

  // The customer never sees this.
  await call('/admin/stats', { token: customer.token, expect: 403 });

  const mainSource = readFileSync(new URL('../server/main.ts', import.meta.url), 'utf8');
  assert.match(mainSource, /setTimeout\(maintenance, 5 \* 60_000\)/, 'the first backup check runs five minutes after start');

  // The script moves the marker only after its upload, so a failed off-VM copy also goes stale.
  const script = readFileSync(new URL('../infra/vm/wind-backup.sh', import.meta.url), 'utf8');
  assert.ok(script.indexOf('blob.core.windows.net') > 0 && script.indexOf('blob.core.windows.net') < script.indexOf('touch "$dir/last-ok"'), 'marker after upload');
  assert.match(script, /^set -eu/m, 'and a failed upload stops the script before it');
  assert.ok(script.indexOf('chmod 600') > script.indexOf('gzip -9') && script.indexOf('chmod 600') < script.indexOf('azure-token.sh'), 'copies are private before anything else runs');
  assert.ok(script.indexOf('trap ') > 0 && script.indexOf('trap ') < script.indexOf('VACUUM INTO'), 'a failed run leaves no uncompressed copy');

  // Restore: the backup copy, unzipped into place, runs the service with its accounts and orders.
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
  // An interrupt between stop and swap must not leave the service down with the old database parked aside.
  { const restore = readFileSync(new URL('../infra/vm/wind-restore.sh', import.meta.url), 'utf8');
    const trap = restore.indexOf(`trap 'docker stop "$name" >/dev/null 2>&1 || true; put_back' INT TERM HUP`);
    assert.ok(trap >= 0 && trap < restore.indexOf('docker stop "$name" >/dev/null\nswap'), 'signals put back the old database');
    assert.ok(restore.indexOf('swap || put_back\ntrap - INT TERM HUP') > trap, 'and the trap is disarmed once the restored copy is live');
  }
  // The same statement as infra/vm/wind-restore.sh: nobody's session from before the copy survives it.
  const wipe = readFileSync(new URL('../infra/vm/wind-restore.sh', import.meta.url), 'utf8').match(/db\.exec\('(BEGIN;[^']*)'\)/)[1];
  const cleaning = new DatabaseSync(restored);
  assert.equal(cleaning.prepare('SELECT COUNT(*) AS n FROM native_push_tokens').get().n, 1, 'the copy holds the admin device');
  cleaning.exec(wipe);
  assert.equal(cleaning.prepare('SELECT COUNT(*) AS n FROM native_push_tokens').get().n, 0, 'native push tokens go with their sessions');
  cleaning.close();
  const api = await startApiProcess({ DB_PATH: restored });
  try {
    const remote = apiCaller(() => api.base, realFetch);
    await remote('/me', { token: customer.token, expect: 401 });
    const signedIn = await remote('/auth/login', { body: { phone: '0599170002', password: 'secret1' } });
    assert.equal((await remote(`/orders/${order.id}`, { token: signedIn.token })).id, order.id, 'the order is there');
    const added = await remote('/orders', { token: signedIn.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    assert.ok(added.id > order.id, 'and the restored service takes new work');
  } finally { await api.stop(); }

  // An hourly host sets WIND_BACKUP_MAX_AGE_HOURS: 3 hours late is an alarm there, though not for a nightly job.
  const hourlyMarker = join(dir, 'hourly-last-ok');
  writeFileSync(hourlyMarker, '');
  const hourly = await startApiProcess({ DB_PATH: restored, WIND_BACKUP_MARKER: hourlyMarker, WIND_BACKUP_MAX_AGE_HOURS: '3' });
  try {
    const remote = apiCaller(() => hourly.base, realFetch);
    const admin = await remote('/auth/login', { body: { phone: '0599170001', password: 'secret1' } });
    const hourlyAge = hours => { const t = (Date.now() - hours * 3_600_000) / 1000; utimesSync(hourlyMarker, t, t); };
    hourlyAge(3 - 1 / 60); assert.equal((await remote('/admin/stats', { token: admin.token })).backupStale, false, 'inside the hourly limit');
    hourlyAge(3 + 1 / 60); assert.equal((await remote('/admin/stats', { token: admin.token })).backupStale, true, 'past it');
  } finally { await hourly.stop(); }
  for (const [i, bad] of ['', '0', '0.001', '0.5', '-1', 'soon', '337'].entries()) {
    let started;
    try { started = await startApiProcess({ DB_PATH: join(dir, `bad-${i}.db`), WIND_BACKUP_MAX_AGE_HOURS: bad }); }
    catch (error) { assert.match(error.message, /WIND_BACKUP_MAX_AGE_HOURS/, `'${bad}' stops startup with the reason`); continue; }
    await started.stop(); // a regression must fail here, not leave a child running
    assert.fail(`'${bad}' should stop startup`);
  }
  // The Israel host backs up hourly and alerts after 3 hours.
  const provision = readFileSync(new URL('../infra/vm-israel/provision.sh', import.meta.url), 'utf8');
  assert.match(provision, /^OnCalendar=\*-\*-\* \*:00:00 UTC$/m, 'the backup timer is hourly');
  assert.match(provision, /^  echo 'WIND_BACKUP_MAX_AGE_HOURS=3' >> \/etc\/wind-api\.env$/m, 'and its alert limit is set even on a host provisioned before');
  // The env-file step itself, run on scratch files: added on its own line, a bad value replaced, a valid choice kept.
  const step = provision.slice(provision.indexOf("if ! grep '^WIND_BACKUP_MAX_AGE_HOURS='"), provision.indexOf('\nfi\n', provision.indexOf("if ! grep '^WIND_BACKUP_MAX_AGE_HOURS='")) + 3);
  for (const [before, after] of [['A=1\n', 'A=1\nWIND_BACKUP_MAX_AGE_HOURS=3\n'], ['A=1', 'A=1\nWIND_BACKUP_MAX_AGE_HOURS=3\n'], ['', 'WIND_BACKUP_MAX_AGE_HOURS=3\n'],
    ['A=1\nWIND_BACKUP_MAX_AGE_HOURS=\n', 'A=1\nWIND_BACKUP_MAX_AGE_HOURS=3\n'], ['WIND_BACKUP_MAX_AGE_HOURS=0.5\nA=1\n', 'A=1\nWIND_BACKUP_MAX_AGE_HOURS=3\n'],
    ['WIND_BACKUP_MAX_AGE_HOURS=soon\n', 'WIND_BACKUP_MAX_AGE_HOURS=3\n'], ['WIND_BACKUP_MAX_AGE_HOURS=337\n', 'WIND_BACKUP_MAX_AGE_HOURS=3\n'],
    ['A=1\nWIND_BACKUP_MAX_AGE_HOURS=6\n', 'A=1\nWIND_BACKUP_MAX_AGE_HOURS=6\n'], ['WIND_BACKUP_MAX_AGE_HOURS=336\n', 'WIND_BACKUP_MAX_AGE_HOURS=336\n']]) {
    const file = join(dir, 'wind-api.env');
    writeFileSync(file, before);
    const r = spawnSync('bash', ['-c', step.replaceAll('/etc/wind-api.env', file)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(file, 'utf8'), after, JSON.stringify(before));
  }
  const reload = provision.indexOf('systemctl daemon-reload');
  assert.ok(provision.indexOf("echo 'WIND_BACKUP_MAX_AGE_HOURS=3'") < provision.indexOf('caddy validate'), 'before anything that can stop the script');
  assert.ok(reload > provision.indexOf('OnCalendar=') && reload < provision.indexOf('caddy validate'), 'and the hourly timer is loaded before then too');
  const backupScript = readFileSync(new URL('../infra/vm-israel/backup.sh', import.meta.url), 'utf8');
  assert.ok(backupScript.indexOf('exec 8<&-') > backupScript.indexOf('mv -f "$TMP"') && backupScript.indexOf('exec 8<&-') < backupScript.indexOf('blob.core.windows.net'),
    'the database lock is released after the snapshot and before the upload');

  console.log('Backup: missed backup alerts admins once a day, dashboard holds until a success, restore runs the service');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
