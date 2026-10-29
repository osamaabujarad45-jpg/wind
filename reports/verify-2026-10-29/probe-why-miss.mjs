// Why does the new schedule.test.mjs assertion survive the mutation?
// Replays the exact test sequence and prints the error at each step.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-why2-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const MIN = 60_000, DAY = 86_400_000;

async function call(path, { token, body, expect } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { status: res.status, data: d };
}

try {
  await call('/auth/register', { body: { phone: '0599880001', name: 'A', password: 'secret1' } });
  await promote('0599880001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599880001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599880002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599880003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599880003', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599880002', pickupNote: 'A', dropoffNote: 'B' };
  const q = (await call('/price', { token: cust.token, body: input })).data.price;

  const later = (await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q, scheduledFor: Date.now() + 3 * 3_600_000 } })).data;
  console.log(`later id=${later.id} status=${later.status} scheduledFor=+${Math.round((later.scheduledFor - Date.now()) / MIN)}min`);

  // move it inside the 30-minute window, as the test does
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() + 20 * MIN, later.id);
  const visible = await call(`/orders/${later.id}`, { token: drvTok });
  console.log(`driver GET /orders/${later.id} -> ${visible.status} (200 = can see it)`);

  const r = await call(`/orders/${later.id}/schedule`, { token: drvTok, body: { scheduledFor: Date.now() + 2 * DAY } });
  console.log(`driver POST /schedule -> ${r.status} ${JSON.stringify(r.data)}`);
  console.log('  NOTE: for a driver the status/visibility guard at :1497 fires first and returns');
  console.log('  the SAME error, so a driver request cannot isolate the ownership guard at :1495.');

  // The only account that reaches :1495 with :1497 silent is an ADMIN on a far-future parcel:
  // admin can see any order, status is 'searching', and scheduledFor > now+30min.
  const far = (await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q, scheduledFor: Date.now() + 3 * DAY } })).data;
  console.log(`\nfar order id=${far.id} status=${far.status} scheduledFor=+${Math.round((far.scheduledFor - Date.now()) / DAY)}d`);
  const adminSees = await call(`/orders/${far.id}`, { token: adminTok });
  const adminTry = await call(`/orders/${far.id}/schedule`, { token: adminTok, body: { scheduledFor: Date.now() + 4 * DAY } });
  const after = db.prepare('SELECT scheduled_for FROM orders WHERE id = ?').get(far.id);
  console.log(`admin GET /orders/${far.id} -> ${adminSees.status}; POST /schedule -> ${adminTry.status} ${JSON.stringify(adminTry.data)}`);
  console.log(`scheduled_for changed: ${after.scheduled_for !== far.scheduledFor}`);
  console.log('');
  console.log(adminTry.status === 409
    ? 'ADMIN CASE isolates :1495 — with the guard removed this returns 200 and rewrites the schedule.'
    : 'admin request was allowed — :1495 is absent or bypassed.');
} finally { server.close(); }
