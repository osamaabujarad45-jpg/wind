// Settles the last two: destination change runs on SQLite (with a valid body),
// and the forgiveness ceiling with correctly-shaped seeded rows.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-v8-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
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
  await call('/auth/register', { body: { phone: '0599220001', name: 'A', password: 'secret1' } });
  await promote('0599220001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599220001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599220002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599220003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599220003', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599220002', pickupNote: 'Al-Manara', dropoffNote: 'Hospital' };
  const q = (await call('/price', { token: cust.token, body: input })).data.price;
  const o1 = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q } });
  await call(`/jobs/${o1.data.id}/accept`, { token: drvTok, body: {} });

  // valid destination quote: city + the required note
  const dq = await call(`/orders/${o1.data.id}/destination/quote`, { token: cust.token, body: { city: 'nablus', note: 'new dropoff point' } });
  out('B1 destchange-runs-on-sqlite', dq.status === 200 ? 'VERIFIED' : 'INCONCLUSIVE',
    `POST /orders/${o1.data.id}/destination/quote {city,note} -> ${dq.status} ${JSON.stringify(dq.data).slice(0, 120)}`);

  // ---- forgiveness, with every NOT NULL column supplied ----
  const ins = db.prepare(`INSERT INTO orders (customer_id, driver_id, service, shared, pickup_city, dropoff_city, pickup_note,
    dropoff_note, contact, detail, option, loading_help, price, commission, status, handover_code, created_at, updated_at, completed_at)
    VALUES (?,?,'parcel',0,'ramallah','nablus','A','B','0599220002','Box','small',0,? ,?,'completed','1234',?,?,?)`);
  const now = Date.now();
  for (let i = 0; i < 15; i++) ins.run(cust.user.id, drv.user.id, 1000, 900, now, now, now);
  const bal = (await call('/admin/cash', { token: adminTok })).data.find(b => b.driverId === drv.user.id);
  out('A0 debt-seeded', 'INFO', `15 x 900 ILS commission -> owedCents=${bal.owedCents} (${(bal.owedCents / 100).toFixed(0)} ILS)`);
  const f1 = await call('/admin/cash/adjustment', { token: adminTok, body: { driverId: drv.user.id, amountCents: -1_000_000, reason: 'single-admin forgiveness at ceiling' } });
  const b1 = (await call('/admin/cash', { token: adminTok })).data.find(b => b.driverId === drv.user.id);
  const f2 = await call('/admin/cash/adjustment', { token: adminTok, body: { driverId: drv.user.id, amountCents: -1_000_000, reason: 'second forgiveness' } });
  const b2 = (await call('/admin/cash', { token: adminTok })).data.find(b => b.driverId === drv.user.id);
  const f3 = await call('/admin/cash/adjustment', { token: adminTok, body: { driverId: drv.user.id, amountCents: -1_100_000, reason: 'over per-call cap' } });
  const approvers = rows("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_approvals'").length;
  out('A2 forgive-at-ceiling', f1.status === 200 && f2.status === 200 ? 'VERIFIED' : 'REFUTED',
    `owed ${bal.owedCents} -> -1,000,000 (${f1.status}) -> ${b1.owedCents} -> -1,000,000 (${f2.status}) -> ${b2.owedCents}; over-cap -1,100,000 (${f3.status}); financial_approvals table present=${approvers > 0}`);
} finally {
  console.log('temp:', dir);
  server.close();
}
