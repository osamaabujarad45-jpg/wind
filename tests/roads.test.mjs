// Crowd-reported checkpoint status (SPEC-road-status.md): admin-managed list, driver reports, 2-hour freshness.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-roads-')), 'test.db');
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);

try {
  const admin = await call('/auth/register', { body: { phone: '0599900001', name: 'Admin', password: 'secret1' } });
  promote('0599900001');
  const customer = await call('/auth/register', { body: { phone: '0599900002', name: 'Customer', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599900003', name: 'Driver One', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const driver2 = await call('/auth/register', { body: { phone: '0599900004', name: 'Driver Two', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const pending = await call('/auth/register', { body: { phone: '0599900005', name: 'Pending', password: 'secret1', role: 'driver', vehicle: 'car' } });
  for (const d of [driver, driver2]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });

  assert.deepEqual(await call('/roads', { token: customer.token }), []);
  await call('/roads', { expect: 401 });
  await call('/admin/roads', { token: driver.token, body: { name: 'Checkpoint A', cities: ['ramallah'] }, expect: 403 });
  for (const body of [{ name: 'X', cities: ['ramallah'] }, { name: 'Checkpoint A', cities: [] }, { name: 'Checkpoint A', cities: ['atlantis'] },
    { name: 'Checkpoint A', cities: ['ramallah', 'nablus', 'jenin', 'hebron'] }])
    await call('/admin/roads', { token: admin.token, body, expect: 400 });
  let roads = await call('/admin/roads', { token: admin.token, body: { name: ' Checkpoint A ', cities: ['ramallah', 'nablus', 'ramallah'] } });
  roads = await call('/admin/roads', { token: admin.token, body: { name: 'Checkpoint B', cities: ['hebron'] } });
  const a = roads.find(r => r.name === 'Checkpoint A');
  assert.deepEqual(a, { id: a.id, name: 'Checkpoint A', cities: ['ramallah', 'nablus'], point: null, status: null, note: '', reportedAt: null, agreeing: 0 });

  // Position (SPEC-checkpoint-routing.md): optional, within 25 km of one of its cities, admin-only to set later.
  for (const point of [{ latitude: 95, longitude: 35 }, { latitude: '32', longitude: 35 }])
    assert.equal((await call('/admin/roads', { token: admin.token, body: { name: 'Checkpoint C', cities: ['ramallah'], point }, expect: 400 })).error, 'invalid_location');
  assert.equal((await call('/admin/roads', { token: admin.token, body: { name: 'Checkpoint C', cities: ['ramallah'], point: { latitude: 31.5326, longitude: 35.0998 } }, expect: 400 })).error, 'checkpoint_too_far');
  roads = await call('/admin/roads', { token: admin.token, body: { name: 'Checkpoint C', cities: ['ramallah'], point: { latitude: 31.95, longitude: 35.22 } } });
  assert.deepEqual(roads.find(r => r.name === 'Checkpoint C').point, { latitude: 31.95, longitude: 35.22 });
  await call(`/admin/roads/${a.id}/place`, { token: driver.token, body: { point: { latitude: 32.1, longitude: 35.25 } }, expect: 403 });
  await call(`/admin/roads/${a.id}/place`, { token: admin.token, body: {}, expect: 400 });
  assert.equal((await call(`/admin/roads/${a.id}/place`, { token: admin.token, body: { point: { latitude: 31.53, longitude: 35.1 } }, expect: 400 })).error, 'checkpoint_too_far'); // Hebron
  await call('/admin/roads/999/place', { token: admin.token, body: { point: { latitude: 32.1, longitude: 35.25 } }, expect: 404 });
  roads = await call(`/admin/roads/${a.id}/place`, { token: admin.token, body: { point: { latitude: 32.1, longitude: 35.25 } } });
  assert.deepEqual(roads.find(r => r.id === a.id).point, { latitude: 32.1, longitude: 35.25 });
  roads = await call(`/admin/roads/${roads.find(r => r.name === 'Checkpoint C').id}/remove`, { token: admin.token, body: {} });

  // Who may report.
  await call(`/roads/${a.id}/report`, { token: customer.token, body: { status: 'open' }, expect: 403 });
  await call(`/roads/${a.id}/report`, { token: pending.token, body: { status: 'open' }, expect: 403 });
  for (const body of [{ status: 'maybe' }, { status: 'slow', note: 'x'.repeat(121) }])
    await call(`/roads/${a.id}/report`, { token: driver.token, body, expect: 400 });
  await call('/roads/999/report', { token: driver.token, body: { status: 'open' }, expect: 404 });

  roads = await call(`/roads/${a.id}/report`, { token: driver.token, body: { status: 'slow', note: ' 20 min queue ' } });
  assert.deepEqual(roads.find(r => r.id === a.id).status, 'slow');
  assert.equal(roads.find(r => r.id === a.id).note, '20 min queue');
  await call(`/roads/${a.id}/report`, { token: driver.token, body: { status: 'closed' }, expect: 429 }); // one per 10 minutes
  roads = await call(`/roads/${a.id}/report`, { token: driver2.token, body: { status: 'slow' } });
  let row = roads.find(r => r.id === a.id);
  assert.equal(row.agreeing, 2);
  assert.ok(!JSON.stringify(roads).includes('Driver'));
  roads = await call(`/roads/${a.id}/report`, { token: admin.token, body: { status: 'closed' } });
  row = roads.find(r => r.id === a.id);
  assert.deepEqual([row.status, row.agreeing, row.note], ['closed', 1, '']);

  // Reports older than two hours no longer count.
  db.prepare('UPDATE checkpoint_reports SET created_at = created_at - ?').run(2 * 3_600_000 + 1000);
  row = (await call('/roads', { token: customer.token })).find(r => r.id === a.id);
  assert.deepEqual([row.status, row.reportedAt, row.agreeing], [null, null, 0]);
  await call(`/roads/${a.id}/report`, { token: driver.token, body: { status: 'open' } }); // the 10-minute window has passed too

  // One person counts once, however often they report.
  db.prepare('UPDATE checkpoint_reports SET created_at = created_at - ?').run(11 * 60_000);
  roads = await call(`/roads/${a.id}/report`, { token: driver.token, body: { status: 'open', note: 'call 0599123456' } });
  assert.equal(roads.find(r => r.id === a.id).agreeing, 1);

  // Deleted reporters stop counting and their notes are erased; blocked ones stop counting too.
  await call('/me/delete', { token: driver.token, body: {} });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM checkpoint_reports WHERE note != ''").get().n, 0);
  row = (await call('/roads', { token: customer.token })).find(r => r.id === a.id);
  assert.deepEqual([row.status, row.agreeing], [null, 0]);
  await call(`/roads/${a.id}/report`, { token: driver2.token, body: { status: 'closed' } });
  db.prepare("UPDATE users SET status = 'blocked' WHERE id = ?").run(driver2.user.id);
  assert.equal((await call('/roads', { token: customer.token })).find(r => r.id === a.id).status, null);
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(driver2.user.id);

  await call(`/admin/roads/${a.id}/remove`, { token: driver2.token, body: {}, expect: 403 });
  roads = await call(`/admin/roads/${a.id}/remove`, { token: admin.token, body: {} });
  assert.deepEqual(roads.map(r => r.name), ['Checkpoint B']);
  await call(`/roads/${a.id}/report`, { token: driver2.token, body: { status: 'open' }, expect: 404 });

  console.log('roads: ok');
} finally {
  server.close();
}
