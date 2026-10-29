// Final targeted set: debt forgiveness at the real ceiling, destination-change
// reachability on SQLite with the correct paths, and the approve/parcels guard.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-v6-'));
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
  await call('/auth/register', { body: { phone: '0599999001', name: 'A', password: 'secret1' } });
  await promote('0599999001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599999001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599999002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599999003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599999003', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599999002', pickupNote: 'Al-Manara', dropoffNote: 'Hospital' };

  // ----- A. Forgiveness: debt of exactly 10000 ILS, one admin, one call -----
  // Build real debt through completed orders (commission 15%), then forgive it all.
  await call('/admin/settings', { token: adminTok, body: { commission: 0.5 } }); // fat debt per trip
  const q = (await call('/price', { token: cust.token, body: input })).data.price;
  let completed = 0;
  for (let i = 0; i < 4 && completed === 0; i++) {
    const o = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q } });
    await call(`/jobs/${o.data.id}/accept`, { token: drvTok, body: {} });
    await call(`/orders/${o.data.id}/advance`, { token: drvTok, body: { expectedStatus: 'assigned', requestId: crypto.randomUUID() } });
    const at = await call(`/orders/${o.data.id}`, { token: drvTok });
    if (at.data.status === 'at_pickup') {
      const code = at.data.handoverCode ?? rows('SELECT handover_code FROM orders WHERE id=?', o.data.id)[0]?.handover_code;
      const up = await call(`/orders/${o.data.id}/advance`, { token: drvTok, body: { expectedStatus: 'at_pickup', requestId: crypto.randomUUID(), code: String(code) } });
      if (up.status !== 200) out('A0 advance', 'INFO', `pickedUp -> ${up.status} ${JSON.stringify(up.data).slice(0, 80)}`);
      const c2 = rows('SELECT handover_code, status FROM orders WHERE id=?', o.data.id)[0];
      if (c2.status === 'in_transit') {
        const done = await call(`/orders/${o.data.id}/advance`, { token: drvTok, body: { expectedStatus: 'in_transit', requestId: crypto.randomUUID(), code: String(code) } });
        if (done.status === 200) completed++;
        else out('A0b deliver', 'INFO', `${done.status} ${JSON.stringify(done.data).slice(0, 80)}`);
      }
    }
  }
  await call('/admin/settings', { token: adminTok, body: { commission: 0.15 } });
  const bal = (await call('/admin/cash', { token: adminTok })).data.find(b => b.driverId === drv.user.id);
  const owed = bal?.owedCents ?? 0;
  out('A1 debt-built', 'INFO', `completed=${completed}, owedCents=${owed} (${(owed / 100).toFixed(2)} ILS)`);
  if (owed >= 1_000_000) {
    const f = await call('/admin/cash/adjustment', { token: adminTok, body: { driverId: drv.user.id, amountCents: -1_000_000, reason: 'single-admin forgiveness at ceiling' } });
    const after = (await call('/admin/cash', { token: adminTok })).data.find(b => b.driverId === drv.user.id);
    out('A2 forgive-10000', f.status === 200 ? 'VERIFIED' : 'REFUTED',
      `-1000000 adjustment -> ${f.status}; owed ${owed} -> ${after?.owedCents}; one admin, one call, no approver (financial_approvals exists only in Postgres)`);
  } else {
    out('A2 forgive-10000', 'NOT-REACHED', `could not build 10000 ILS of debt in this probe (owed=${owed}); the ceiling itself is confirmed by the 1_000_000 guard at main.ts:2446`);
  }

  // ----- B. Destination change on SQLite: reachable, or gated? -----
  {
    const o = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q } });
    const dq = await call(`/orders/${o.data.id}/destination/quote`, { token: cust.token, body: { city: 'nablus' } });
    out('B1 destchange-sqlite', dq.status === 200 ? 'VERIFIED' : 'GATED',
      `POST /orders/${o.data.id}/destination/quote -> ${dq.status} ${JSON.stringify(dq.data).slice(0, 90)}`);
    out('B2 what-the-report-claimed', 'NOTE',
      'report P2 #15 says "SQLite-only ... the target backend cannot run it". sqliteOnly() fails when backend!=="sqlite", so it RUNS here and would 409 after cutover. Correct claim, inverse direction.');
  }

  // ----- C. Approve over a blocked driver who is carrying a parcel -----
  {
    const o = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q } });
    await call(`/jobs/${o.data.id}/accept`, { token: drvTok, body: {} });
    // put it in custody
    const at = await call(`/orders/${o.data.id}/advance`, { token: drvTok, body: { expectedStatus: 'assigned', requestId: crypto.randomUUID() } });
    let status = rows('SELECT status FROM orders WHERE id=?', o.data.id)[0].status;
    if (status === 'at_pickup') {
      const code = rows('SELECT handover_code FROM orders WHERE id=?', o.data.id)[0].handover_code;
      await call(`/orders/${o.data.id}/advance`, { token: drvTok, body: { expectedStatus: 'at_pickup', requestId: crypto.randomUUID(), code: String(code) } });
      status = rows('SELECT status FROM orders WHERE id=?', o.data.id)[0].status;
    }
    // block with the guard, then approve back
    const blockGuarded = await call(`/admin/users/${drv.user.id}`, { token: adminTok, body: { status: 'blocked' } });
    const blockForced = await call(`/admin/users/${drv.user.id}`, { token: adminTok, body: { status: 'blocked', recovery: 'return' } });
    const carryingNow = rows("SELECT id,status FROM orders WHERE driver_id=? AND status IN ('assigned','at_pickup','in_transit','returning')", drv.user.id);
    const approveBack = await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
    const finalStatus = rows('SELECT status FROM users WHERE id=?', drv.user.id)[0].status;
    const stillCarrying = rows("SELECT id,status FROM orders WHERE driver_id=? AND status IN ('assigned','at_pickup','in_transit','returning')", drv.user.id);
    out('C1 approve-over-custody', approveBack.status === 200 && finalStatus === 'active' ? 'VERIFIED' : 'REFUTED',
      `order was '${status}'; block-without-recovery -> ${blockGuarded.status} (guard fires); block-with-recovery -> ${blockForced.status}; carrying=${stillCarrying.length}; approve -> ${approveBack.status}; user now '${finalStatus}' while still holding ${stillCarrying.map(o => o.status).join(',') || 'nothing'}`);
  }
} finally {
  console.log('temp:', dir);
  server.close();
}
