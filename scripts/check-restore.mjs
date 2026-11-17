// T46: prove a restored SQLite backup works, in isolation: integrity first, then a synthetic customer books and
// cancels a parcel against a throwaway copy. The copy loses every push target and outbox row, and this process
// loses every provider credential, so a restore check can never reach a real customer, driver or provider.
//   node scripts/check-restore.mjs <restored.db>
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const source = process.argv[2];
if (!source) { console.error('Usage: check-restore.mjs <restored.db>'); process.exit(2); }
const keep = new Set(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']);
for (const key of Object.keys(process.env)) if (!keep.has(key)) delete process.env[key];

const dir = mkdtempSync(join(tmpdir(), 'wind-restore-check-'));
const file = join(dir, 'restore-check.db');
const count = (db, table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
let shutdown;
try {
  copyFileSync(source, file);
  const copy = new DatabaseSync(file);
  let before, quarantined = 0;
  try {
    assert.deepEqual(copy.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok'], 'restored copy fails integrity_check');
    assert.equal(copy.prepare('PRAGMA foreign_key_check').all().length, 0, 'restored copy has foreign-key errors');
    before = { users: count(copy, 'users'), orders: count(copy, 'orders') };
    for (const { name } of copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%push%' OR name LIKE '%outbox%')").all())
      quarantined += Number(copy.prepare(`DELETE FROM "${name}"`).run().changes);
  } finally { copy.close(); }

  Object.assign(process.env, { DB_PATH: file, WIND_ENABLED_SERVICES: 'parcel' });
  const main = await import('../server/main.ts');
  const { quote } = await import('../src/model.ts');
  shutdown = main.shutdown;
  await new Promise(resolve => main.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${main.server.address().port}/api`;
  const call = async (path, token, body) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) } });
    const value = await response.json();
    assert.ok(response.ok, `${path}: ${response.status} ${value?.error ?? ''}`);
    return value;
  };
  let phone;
  do phone = `0599${String(randomInt(1_000_000)).padStart(6, '0')}`;
  while (main.db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone));
  const customer = await call('/auth/register', null, { phone, name: 'Restore check', password: `Restore-${randomUUID()}` });
  const { settings } = await call('/me', customer.token);
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', loadingHelp: false, shared: false };
  const order = await call('/orders', customer.token, { ...input, requestId: randomUUID(), contact: phone, detail: 'Restore check box',
    pickupNote: 'Restore check pickup', dropoffNote: 'Restore check dropoff', quotedPrice: quote(settings, input) });
  assert.equal((await call(`/orders/${order.id}/cancel`, customer.token, {})).status, 'cancelled');
  assert.ok((await call('/orders', customer.token)).some(o => o.id === order.id), 'the journey reads back its own order');
  await shutdown(); shutdown = undefined;

  const after = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual(after.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok']);
    assert.deepEqual({ users: count(after, 'users'), orders: count(after, 'orders') }, { users: before.users + 1, orders: before.orders + 1 });
  } finally { after.close(); }
  console.log(JSON.stringify({ restoreVerified: true, integrity: 'ok', foreignKeys: 0, ...before, quarantined, journey: 'register, book, cancel, read back' }));
} finally {
  if (shutdown) await shutdown().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
