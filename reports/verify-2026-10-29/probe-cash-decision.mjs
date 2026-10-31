// Closes the one route the review left untraced: POST /api/driver/cash/:id/confirm.
// Claim under test: a concurrent double-tap cannot record two decisions.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-cashdecide-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const rows = (s, ...p) => db.prepare(s).all(...p);
const out = (id, v, m) => console.log(`${v.padEnd(12)} ${id}\n             -> ${m}`);

async function call(path, { token, body } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { status: res.status, data: d };
}

try {
  await call('/auth/register', { body: { phone: '0599123001', name: 'A', password: 'secret1' } });
  await promote('0599123001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599123001', password: 'secret1' } })).data.token;
  const drv = (await call('/auth/register', { body: { phone: '0599123002', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599123002', password: 'secret1' } })).data.token;

  // Build debt, then a pending remittance the driver must decide.
  await call('/admin/cash/adjustment', { token: adminTok, body: { driverId: drv.user.id, amountCents: 50000, reason: 'seed debt' } });
  await call('/admin/cash/remittance', { token: adminTok, body: { driverId: drv.user.id, amountCents: 1000, note: 'office' } });
  const pending = rows("SELECT id FROM cash_entries WHERE driver_id=? AND status='pending'", drv.user.id);
  const id = pending[0].id;

  // 1. concurrent confirm + confirm
  const both = await Promise.all([
    call(`/driver/cash/${id}/confirm`, { token: drvTok, body: { decision: 'confirm' } }),
    call(`/driver/cash/${id}/confirm`, { token: drvTok, body: { decision: 'confirm' } }),
  ]);
  const after = rows('SELECT status, decided_at FROM cash_entries WHERE id=?', id)[0];
  const okCount = both.filter(r => r.status === 200).length;
  out('CASH1 concurrent-confirm', okCount === 1 && after.status === 'confirmed' ? 'VERIFIED' : 'REFUTED',
    `statuses=${JSON.stringify(both.map(r => r.status))} ok=${okCount}, row status='${after.status}', decided_at=${after.decided_at != null}`);

  // 2. confirm then dispute — the second must not overwrite a settled decision
  const flip = await call(`/driver/cash/${id}/confirm`, { token: drvTok, body: { decision: 'dispute' } });
  const afterFlip = rows('SELECT status FROM cash_entries WHERE id=?', id)[0];
  out('CASH2 confirm-then-dispute', flip.status === 409 && afterFlip.status === 'confirmed' ? 'VERIFIED' : 'REFUTED',
    `second decision -> ${flip.status} ${JSON.stringify(flip.data)}; row still '${afterFlip.status}'`);

  // 3. a second driver cannot decide this entry
  const other = (await call('/auth/register', { body: { phone: '0599123003', name: 'O', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${other.user.id}/approve`, { token: adminTok, body: {} });
  const otherTok = (await call('/auth/login', { body: { phone: '0599123003', password: 'secret1' } })).data.token;
  const foreign = await call(`/driver/cash/${id}/confirm`, { token: otherTok, body: { decision: 'confirm' } });
  out('CASH3 foreign-driver', foreign.status === 404 ? 'VERIFIED' : 'REFUTED',
    `another driver -> ${foreign.status} ${JSON.stringify(foreign.data)}`);
} finally { server.close(); }
