// Targeted probes: commission=0 blast radius, scrypt stall, admin debt forgiveness,
// and the destination-change gate direction.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-v5-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const rows = (sql, ...p) => db.prepare(sql).all(...p);
const out = (id, verdict, msg) => console.log(`${verdict.padEnd(12)} ${id}\n             -> ${msg}`);

async function call(path, { token, body } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { status: res.status, data: d };
}

try {
  await call('/auth/register', { body: { phone: '0599888001', name: 'A', password: 'secret1' } });
  await promote('0599888001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599888001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599888002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599888003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599888003', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599888002', pickupNote: 'Al-Manara', dropoffNote: 'Hospital' };

  // ===== commission=0: does *assignment* throw? =====
  await call('/admin/settings', { token: adminTok, body: { commission: 0 } });
  const q0 = await call('/price', { token: cust.token, body: input });
  out('E1 price-commission-0', q0.status === 200 ? 'REFUTED' : 'VERIFIED',
    `/price -> ${q0.status} ${JSON.stringify(q0.data).slice(0, 60)} | quotesAvailable()=false on sqlite returns early at main.ts:1042`);
  const order = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q0.data.price } });
  const accept = await call(`/jobs/${order.data.id}/accept`, { token: drvTok, body: {} });
  const after = rows('SELECT id, driver_id, commission, price FROM orders WHERE id=?', order.data.id)[0];
  out('E2 accept-with-commission-0', accept.status === 200 ? 'REFUTED' : 'VERIFIED',
    `POST /jobs/${order.data.id}/accept -> ${accept.status} ${JSON.stringify(accept.data)}; order driver=${after?.driver_id} commission=${after?.commission}`);
  await call('/admin/settings', { token: adminTok, body: { commission: 0.15 } });

  // ===== P2 #9: scryptSync stalls the event loop =====
  {
    const { scryptSync, randomBytes } = await import('node:crypto');
    const salt = randomBytes(16).toString('hex');
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) scryptSync('secret1', salt, 32);
    const per = (performance.now() - t0) / 5;
    out('P2-9 scrypt-cost', per > 10 ? 'VERIFIED' : 'INCONCLUSIVE',
      `5x scryptSync = ${per.toFixed(1)} ms/hash on this host; each unauthenticated /auth/login calls it once, synchronously, on the single event loop`);
  }

} finally {
  console.log('temp:', dir);
  server.close();
}
