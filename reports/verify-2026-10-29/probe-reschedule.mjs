// Is the reschedule claim ("never re-checks searching") right, or is it a TOCTOU?
// The read+check happens outside a transaction and the UPDATE has no status predicate.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-v9-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const rows = (sql, ...p) => db.prepare(sql).all(...p);
const out = (id, v, m) => console.log(`${v.padEnd(12)} ${id}\n             -> ${m}`);

async function call(path, { token, body } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { status: res.status, data: d };
}

try {
  await call('/auth/register', { body: { phone: '0599330001', name: 'A', password: 'secret1' } });
  await promote('0599330001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599330001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599330002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599330003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599330003', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599330002', pickupNote: 'A', dropoffNote: 'B' };
  const q = (await call('/price', { token: cust.token, body: input })).data.price;

  // scheduledFor must be > now+RELEASE_BEFORE and <= now+7d; a scheduled order is hidden until near pickup,
  // so accept it by rewinding scheduled_for first.
  const soon = Date.now() + 60 * 60_000; // 1h out
  const far = Date.now() + 5 * 24 * 60 * 60_000;
  const o = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q, scheduledFor: soon } });
  out('R0 created', 'INFO', `order=${o.data.id} status=${o.data.status} scheduledFor=${o.data.scheduledFor}`);

  // make it visible to drivers, then race accept vs reschedule
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() - 60_000, o.data.id);
  const [acc, resched] = await Promise.all([
    call(`/jobs/${o.data.id}/accept`, { token: drvTok, body: {} }),
    call(`/orders/${o.data.id}/schedule`, { token: cust.token, body: { scheduledFor: far } }),
  ]);
  const after = rows('SELECT status, driver_id, scheduled_for FROM orders WHERE id=?', o.data.id)[0];
  const raced = after.driver_id != null && after.scheduled_for === far;
  out('R1 accept-vs-reschedule', raced ? 'VERIFIED' : 'NOT-REPRODUCED',
    `accept=${acc.status} reschedule=${resched.status}; final status=${after.status} driver=${after.driver_id} scheduledFor_far=${after.scheduled_for === far}`);

  // Retry many times to see if the window opens
  let hits = 0;
  for (let i = 0; i < 40; i++) {
    const oo = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q, scheduledFor: soon } });
    if (oo.status !== 200) break;
    db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() - 60_000, oo.data.id);
    const [a, r] = await Promise.all([
      call(`/jobs/${oo.data.id}/accept`, { token: drvTok, body: {} }),
      call(`/orders/${oo.data.id}/schedule`, { token: cust.token, body: { scheduledFor: far } }),
    ]);
    const row = rows('SELECT status, driver_id, scheduled_for FROM orders WHERE id=?', oo.data.id)[0];
    if (a.status === 200 && r.status === 200 && row.scheduled_for === far) hits++;
  }
  out('R2 race-40-trials', hits > 0 ? 'VERIFIED' : 'NOT-REPRODUCED',
    `${hits}/40 rounds had both accept and reschedule succeed on the same order`);

  // The simpler, deterministic version of the same defect: reschedule an ALREADY accepted order
  const o2 = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q, scheduledFor: soon } });
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() - 60_000, o2.data.id);
  await call(`/jobs/${o2.data.id}/accept`, { token: drvTok, body: {} });
  const before = rows('SELECT status,scheduled_for FROM orders WHERE id=?', o2.data.id)[0];
  const late = await call(`/orders/${o2.data.id}/schedule`, { token: cust.token, body: { scheduledFor: far } });
  const afterLate = rows('SELECT status,scheduled_for FROM orders WHERE id=?', o2.data.id)[0];
  out('R3 reschedule-after-accept', late.status === 200 ? 'VERIFIED' : 'REFUTED',
    `order accepted (status=${before.status}); then POST /schedule -> ${late.status} ${JSON.stringify(late.data).slice(0, 60)}; scheduledFor changed=${before.scheduled_for !== afterLate.scheduled_for}`);
} finally {
  console.log('temp:', dir);
  server.close();
}
