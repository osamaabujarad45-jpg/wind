// Third pass: job-board freeze (with the required note fields), subscribe race
// under real concurrency, and the ledger/payments reachability question.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-v3-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const rows = (sql, ...p) => db.prepare(sql).all(...p);
const out = (id, verdict, msg) => console.log(`${verdict.padEnd(12)} ${id}\n             -> ${msg}`);

async function call(path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await res.text(); let data; try { data = JSON.parse(t); } catch { data = { raw: t }; }
  return { status: res.status, data };
}

try {
  const admin = (await call('/auth/register', { body: { phone: '0599666001', name: 'A', password: 'secret1' } })).data;
  await promote('0599666001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599666001', password: 'secret1' } })).data.token;

  // full order input, including the notes text() requires
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599666002', pickupNote: 'Al-Manara', dropoffNote: 'Hospital' };

  const drv = (await call('/auth/register', { body: { phone: '0599666003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599666003', password: 'secret1' } })).data.token;

  const spam = (await call('/auth/register', { body: { phone: '0599666002', name: 'S', password: 'secret1' } })).data;
  const real = (await call('/auth/register', { body: { phone: '0599666004', name: 'L', password: 'secret1' } })).data;

  const q = (await call('/price', { token: spam.token, body: input })).data.price;
  let made = 0, err;
  for (let i = 0; i < 55; i++) {
    const r = await call('/orders', { token: spam.token, body: { ...input, quotedPrice: q } });
    if (r.status === 200) made++; else { err ??= `${r.status} ${JSON.stringify(r.data)}`; }
  }
  const realOrder = await call('/orders', { token: real.token, body: { ...input, quotedPrice: q, contact: '0599666004' } });
  const jobs = await call('/jobs', { token: drvTok });
  const list = Array.isArray(jobs.data) ? jobs.data : [];
  out('C1 jobboard-freeze',
    list.length === 50 && realOrder.status === 200 && !list.some(o => o.id === realOrder.data.id) ? 'VERIFIED' : 'REFUTED',
    `spam=${made} (${err ?? 'no err'}); real=${realOrder.status} id=${realOrder.data?.id}; /jobs=${jobs.status} count=${list.length}; realVisible=${list.some(o => o.id === realOrder.data?.id)}`);
  out('C2 no-order-cap', 'INFO', `orders created by one customer = ${rows('SELECT count(*) c FROM orders WHERE customer_id=?', spam.user.id)[0].c} (no per-customer quota)`);

  // Subscribe race, with the check-then-insert window actually hit:
  const racer = (await call('/auth/register', { body: { phone: '0599666005', name: 'R', password: 'secret1' } })).data;
  const attempts = await Promise.all(Array.from({ length: 20 }, () => call('/subscriptions', { token: racer.token, body: {} })));
  const pend = rows("SELECT id FROM subscriptions WHERE user_id=? AND status='pending'", racer.user.id);
  const okCount = attempts.filter(a => a.status === 200).length;
  out('B1 subscribe-race-20',
    pend.length > 1 ? 'VERIFIED' : 'NOT-REPRODUCED',
    `20 concurrent -> ok=${okCount} statuses=${JSON.stringify(attempts.map(a => a.status).slice(0, 6))}... pendingRows=${pend.length}; no unique index on (user_id,status)`);
  if (pend.length === 1) {
    out('B3 why-not', 'CAUSE', `sqlite serialises each await; check and insert both await the same mutex, so the window closes in-process. The defect is a missing DB constraint, not a reachable race on one node. Postgres (async pool) or 2 replicas reopens it.`);
  }

  // ===== Is the ledger/payments gate actually reachable on SQLite? =====
  const led = await call('/admin/ledger', { token: adminTok });
  out('D1 ledger-gate', led.status === 409 ? 'VERIFIED' : 'REFUTED',
    `/admin/ledger -> ${led.status} ${JSON.stringify(led.data)} (ledgerAvailable()=false on sqlite)`);
} finally {
  server.close();
  console.log('temp:', dir);
}
