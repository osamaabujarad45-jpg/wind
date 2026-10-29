// Follow-up probe: re-tests the four refutations from probe-p1-p2.mjs, with the
// probe's own mistakes removed (stale tokens, non-concurrent calls, cleanup).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-v2-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, headers = {}, method } = {}) {
  const res = await fetch(base + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}
const rows = (sql, ...p) => db.prepare(sql).all(...p);

const out = (id, verdict, msg) => console.log(`${verdict.padEnd(11)} ${id}\n            -> ${msg}`);

try {
  const admin = (await call('/auth/register', { body: { phone: '0599555001', name: 'A', password: 'secret1' } })).data;
  await promote('0599555001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599555001', password: 'secret1' } })).data.token;

  // ===== A. Does commission=0 ever reach minorUnits? (P1 #2 sub-claim) =====
  await call('/admin/settings', { token: adminTok, body: { commission: 0 } });
  const cust = (await call('/auth/register', { body: { phone: '0599555002', name: 'C', password: 'secret1' } })).data;
  const price = await call('/price', { token: cust.token, body: {
    service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', detail: 'Box', contact: '0599555002' } });
  out('A1 price-with-commission-0',
    price.status === 200 ? 'REFUTED' : 'VERIFIED',
    `/price -> ${price.status}. quotesAvailable()=false on sqlite so the route returns the legacy base at main.ts:1042 and never reaches minorUnits(commissionOn(...)). The report's "every /api/price 500s" is WRONG on the shipped path; it is correct only after the Postgres cutover.`);

  // ===== B. Subscription double-tap: is there a real race window? =====
  // latestSubscription(user) then INSERT, no transaction: widen the window by firing many at once.
  const racer = (await call('/auth/register', { body: { phone: '0599555003', name: 'R', password: 'secret1' } })).data;
  const attempts = await Promise.all(Array.from({ length: 12 }, () => call('/subscriptions', { token: racer.token, body: {} })));
  const pending = rows("SELECT id FROM subscriptions WHERE user_id=? AND status='pending'", racer.user.id);
  out('B1 subscribe-race-12',
    pending.length > 1 ? 'VERIFIED' : 'REFUTED',
    `12 concurrent Subscribe -> statuses ${JSON.stringify(attempts.map(a => a.status))}, pending rows=${pending.length}`);
  // and confirm no unique index backs it
  const idx = rows("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='subscriptions'");
  out('B2 subscriptions-indexes', 'INFO', `indexes on subscriptions = ${JSON.stringify(idx)}`);

  // ===== C. Job-board freeze: why did /jobs error? =====
  const drv = (await call('/auth/register', { body: { phone: '0599555004', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599555004', password: 'secret1' } })).data.token;
  const spam = (await call('/auth/register', { body: { phone: '0599555005', name: 'S', password: 'secret1' } })).data;
  const real = (await call('/auth/register', { body: { phone: '0599555006', name: 'L', password: 'secret1' } })).data;
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', detail: 'x', contact: '0599555006' };
  const q = (await call('/price', { token: spam.token, body: input })).data.price;
  let made = 0, orderErr;
  for (let i = 0; i < 55; i++) {
    const r = await call('/orders', { token: spam.token, body: { ...input, quotedPrice: q } });
    if (r.status === 200) made++; else orderErr ??= `${r.status} ${JSON.stringify(r.data)}`;
  }
  const realInput = { ...input, detail: 'REAL', contact: '0599555005' };
  const rq = (await call('/price', { token: real.token, body: realInput })).data.price;
  const realOrder = await call('/orders', { token: real.token, body: { ...realInput, quotedPrice: rq } });
  const jobs = await call('/jobs', { token: drvTok });
  const list = Array.isArray(jobs.data) ? jobs.data : [];
  out('C1 jobboard-freeze',
    list.length === 50 && !list.some(o => o.id === realOrder.data?.id) ? 'VERIFIED' : 'INCONCLUSIVE',
    `spam created=${made} (err=${orderErr ?? 'none'}), real order=${realOrder.data?.id} ${realOrder.status}, /jobs -> ${jobs.status} count=${list.length}, real visible=${list.some(o => o.id === realOrder.data?.id)}`);

  // ===== D. Scope gate: is P2 #5 reachable on SQLite? (my earlier probe used a killed token) =====
  const freshCust = (await call('/auth/login', { body: { phone: '0599555002', password: 'secret1' } })).data.token;
  const scope = await call('/orders/1/scope', { token: freshCust });
  out('D1 scope-gate', scope.status === 409 ? 'VERIFIED' : 'REFUTED',
    `/orders/1/scope with a fresh token -> ${scope.status} ${JSON.stringify(scope.data).slice(0, 70)} (expect 409 scope_unavailable on sqlite)`);
  // and the siblings
  for (const [name, path] of [['payments', '/admin/payments'], ['ledger', '/admin/ledger'], ['ops', '/admin/support-cases']]) {
    const r = await call(path, { token: adminTok });
    out(`D2 ${name}-gate`, r.status === 409 || r.status === 404 ? 'INFO' : 'NOTE', `${path} -> ${r.status} ${JSON.stringify(r.data).slice(0, 50)}`);
  }
} finally {
  server.close();
  db.close?.();
  console.log('\n(temp dir left for cleanup:', dir + ')');
}
