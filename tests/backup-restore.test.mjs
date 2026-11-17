// T46: a missed backup alerts once per lapse, the sealed copy opens with only the offline key, and a restored
// database proves itself in an isolated book-and-cancel journey without touching the original file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keygen, open, seal } from '../scripts/backup-seal.mjs';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-backup-'));
const marker = join(dir, 'backup-verified.json');
Object.assign(process.env, { DB_PATH: join(dir, 'live.db'), WIND_ENABLED_SERVICES: 'parcel', WIND_BACKUP_MAX_AGE_HOURS: '8', WIND_BACKUP_MARKER: marker });
const { shutdown, server, db, checkBackupFreshness } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const hour = 3_600_000, now = Date.now();
try {
  // Missed-backup alert: missing and stale markers alert once per lapse; a fresh marker re-arms it.
  assert.equal(await checkBackupFreshness(now), 'alerted', 'no marker at all is a missed backup');
  assert.equal(await checkBackupFreshness(now + hour), 'stale', 'one alert per lapse, not one per hour');
  writeFileSync(marker, JSON.stringify({ verifiedAt: new Date(now).toISOString() }));
  assert.equal(await checkBackupFreshness(now + 7 * hour), 'fresh');
  assert.equal(await checkBackupFreshness(now + 9 * hour), 'alerted', 'a marker older than the limit alerts again');
  writeFileSync(marker, '{not json');
  assert.equal(await checkBackupFreshness(now + 10 * hour), 'stale', 'an unreadable marker counts as missed');
  delete process.env.WIND_BACKUP_MAX_AGE_HOURS;
  assert.equal(await checkBackupFreshness(now), 'disabled', 'off unless configured');

  // A database with a push target, so the restore check's quarantine has something to remove.
  const customer = await call('/auth/register', { body: { phone: '0599130001', name: 'Backup fixture', password: 'secret1' } });
  db.prepare('INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created_at) VALUES(?,?,?,?,?)').run('https://push.example.test/fixture', customer.user.id, 'BOr8y6tqpg', 'c2VjcmV0', now);
} finally { await shutdown(); }

try {
  // Sealed copy: opens with the private key and passphrase only; a wrong passphrase or a flipped byte fails.
  const { publicKey, privateKey } = keygen('correct horse battery');
  const plaintext = Buffer.from(JSON.stringify({ sha256: 'x', data: 'ZGF0YQ==' }));
  const sealed = seal(plaintext, publicKey);
  assert.deepEqual(open(sealed, privateKey, 'correct horse battery'), plaintext);
  assert.throws(() => open(sealed, privateKey, 'wrong horse battery'));
  const box = JSON.parse(sealed), data = Buffer.from(box.data, 'base64'); data[0] ^= 1;
  assert.throws(() => open(JSON.stringify({ ...box, data: data.toString('base64') }), privateKey, 'correct horse battery'), /auth/i);
  assert.throws(() => keygen('short'), /12 characters/);

  // Restore check: a synthetic journey on a throwaway copy; the restored file itself is never written.
  const script = fileURLToPath(new URL('../scripts/check-restore.mjs', import.meta.url));
  const sha = () => createHash('sha256').update(readFileSync(process.env.DB_PATH)).digest('hex'), original = sha();
  const ok = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', script, process.env.DB_PATH],
    { encoding: 'utf8', windowsHide: true, env: { ...process.env, WIND_EMAIL_FROM: 'leak@example.test', CLOUDFLARE_EMAIL_TOKEN: 'leak' } });
  assert.equal(ok.status, 0, ok.stderr);
  const result = JSON.parse(ok.stdout.trim().split('\n').at(-1));
  assert.equal(result.restoreVerified, true);
  assert.ok(result.quarantined >= 1, 'the copy loses its push targets before the API starts');
  assert.equal(sha(), original, 'the restored file is only ever read');
  const corrupt = join(dir, 'corrupt.db');
  writeFileSync(corrupt, Buffer.alloc(8192, 7));
  const bad = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', script, corrupt], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(bad.status, 0, 'a corrupt restore cannot pass');
  console.log('PASS missed-backup alert once per lapse, sealed copy opens only with the offline key, isolated restore journey');
} finally { rmSync(dir, { recursive: true, force: true }); }
