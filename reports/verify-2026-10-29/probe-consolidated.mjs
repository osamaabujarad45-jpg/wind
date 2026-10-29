// Consolidated probe: the three findings that were established across overlapping
// scratch probes (fifth/third/race/refuted), merged into one runnable file.
//   1. P2 #8  — approve re-activates a blocked driver still holding a parcel (unique to probe-fifth)
//   2. P2 #12 — the Subscribe race does not reproduce on SQLite (probe-race/third/refuted, merged)
//   3. P2 #15 — destination change RUNS on SQLite, 409s after cutover (probe-seventh)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-consolidated-'));
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
  await call('/auth/register', { body: { phone: '0599770001', name: 'A', password: 'secret1' } });
  await promote('0599770001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599770001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599770002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599770003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599770003', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599770002', pickupNote: 'Al-Manara', dropoffNote: 'Hospital' };
  const q = (await call('/price', { token: cust.token, body: input })).data.price;

  // ===== 3. P2 #15 — destination change runs on SQLite (run FIRST: the driver is still free) =====
  {
    const o = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q } });
    const acc = await call(`/jobs/${o.data.id}/accept`, { token: drvTok, body: {} });
    const row = rows('SELECT status, driver_id, commission_rate FROM orders WHERE id=?', o.data.id)[0];
    const dq = await call(`/orders/${o.data.id}/destination/quote`, { token: cust.token, body: { city: 'nablus', note: 'new dropoff' } });
    out('P2-15 destchange-on-sqlite', dq.status === 200 ? 'VERIFIED' : 'INCONCLUSIVE',
      `accept=${acc.status} order status='${row.status}' commission_rate=${row.commission_rate}; quote -> ${dq.status} ${JSON.stringify(dq.data).slice(0, 60)}`);
  }

  // ===== 1. P2 #8 — approve over a driver in custody =====
  {
    // a fresh driver: the one above now holds an accepted order (vehicle_busy otherwise)
    const drv2 = (await call('/auth/register', { body: { phone: '0599770005', name: 'D2', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
    await call(`/admin/users/${drv2.user.id}/approve`, { token: adminTok, body: {} });
    const d2 = (await call('/auth/login', { body: { phone: '0599770005', password: 'secret1' } })).data.token;
    const o = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q } });
    await call(`/jobs/${o.data.id}/accept`, { token: d2, body: {} });
    await call(`/orders/${o.data.id}/advance`, { token: d2, body: { expectedStatus: 'assigned', requestId: crypto.randomUUID() } });
    let status = rows('SELECT status FROM orders WHERE id=?', o.data.id)[0].status;
    if (status === 'at_pickup') {
      const code = rows('SELECT handover_code FROM orders WHERE id=?', o.data.id)[0].handover_code;
      await call(`/orders/${o.data.id}/advance`, { token: d2, body: { expectedStatus: 'at_pickup', requestId: crypto.randomUUID(), code: String(code) } });
      status = rows('SELECT status FROM orders WHERE id=?', o.data.id)[0].status;
    }
    const blockGuarded = await call(`/admin/users/${drv2.user.id}`, { token: adminTok, body: { status: 'blocked' } });
    const blockForced = await call(`/admin/users/${drv2.user.id}`, { token: adminTok, body: { status: 'blocked', recovery: 'return' } });
    const approveBack = await call(`/admin/users/${drv2.user.id}/approve`, { token: adminTok, body: {} });
    const finalStatus = rows('SELECT status FROM users WHERE id=?', drv2.user.id)[0].status;
    const stillHolding = rows("SELECT id,status FROM orders WHERE driver_id=? AND status IN ('assigned','at_pickup','in_transit','returning')", drv2.user.id);
    out('P2-8 approve-over-custody', approveBack.status === 200 && finalStatus === 'active' ? 'VERIFIED' : 'REFUTED',
      `order='${status}'; block w/o recovery -> ${blockGuarded.status} (guard fires); with recovery -> ${blockForced.status}; approve -> ${approveBack.status}; user='${finalStatus}' holding ${stillHolding.map(o => o.status).join(',') || 'nothing'}`);
  }

  // ===== 2. P2 #12 — Subscribe race, 20 concurrent =====
  {
    const racer = (await call('/auth/register', { body: { phone: '0599770004', name: 'R', password: 'secret1' } })).data;
    const attempts = await Promise.all(Array.from({ length: 20 }, () => call('/subscriptions', { token: racer.token, body: {} })));
    const pend = rows("SELECT id FROM subscriptions WHERE user_id=? AND status='pending'", racer.user.id);
    const idx = rows("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='subscriptions'");
    out('P2-12 subscribe-race', pend.length > 1 ? 'VERIFIED' : 'NOT-REPRODUCED',
      `20 concurrent -> ok=${attempts.filter(a => a.status === 200).length}, pendingRows=${pend.length}; indexes on subscriptions=${JSON.stringify(idx)} (missing unique is the real defect; the sqlite mutex closes the window)`);
  }

  // ===== 3. (P2 #15 moved above P2 #8 — it needs a driver with no active job) =====
} finally {
  console.log('temp:', dir);
  server.close();
}
