// Crowd-reported checkpoint status (SPEC-road-status.md): admin-managed list, driver reports, 2-hour freshness.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-roads-')), 'test.db');
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}

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
  assert.deepEqual(a, { id: a.id, name: 'Checkpoint A', cities: ['ramallah', 'nablus'], status: null, note: '', reportedAt: null, agreeing: 0 });

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

  await call(`/admin/roads/${a.id}/remove`, { token: driver.token, body: {}, expect: 403 });
  roads = await call(`/admin/roads/${a.id}/remove`, { token: admin.token, body: {} });
  assert.deepEqual(roads.map(r => r.name), ['Checkpoint B']);
  await call(`/roads/${a.id}/report`, { token: driver2.token, body: { status: 'open' }, expect: 404 });

  console.log('roads: ok');
} finally {
  server.close();
}
