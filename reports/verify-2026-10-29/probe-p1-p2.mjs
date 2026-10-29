// Executable verification of the P1/P2 claims in REVIEW-2026-10-29-multiagent.md.
// Boots the real server on a throwaway SQLite file and asserts the CURRENT (defective)
// behaviour. A claim is verified only if the probe reproduces it.
// Run: node reports/verify-2026-10-29/probe-p1-p2.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-verify-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';
process.env.SOUQ_PARTNER_KEY = 'verify-partner-key-at-least-32-characters-ok';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;

const results = [];
const record = (id, claim, verdict, evidence) => {
  results.push({ id, claim, verdict, evidence });
  console.log(`${verdict.padEnd(11)} ${id.padEnd(5)} ${claim}\n            -> ${evidence}`);
};

async function call(path, { token, body, headers = {}, method } = {}) {
  const res = await fetch(base + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data; const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

const rowCount = (sql, ...p) => db.prepare(sql).all(...p);

try {
  // ---------- fixtures ----------
  const admin = (await call('/auth/register', { body: { phone: '0599111001', name: 'A', password: 'secret1' } })).data;
  await promote('0599111001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599111001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599111002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599111003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  const drvTok0 = drv.token;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599111003', password: 'secret1' } })).data.token;

  // ---------- P1 #2: admin settings accept 0 / no ceiling ----------
  {
    const r = await call('/admin/settings', { token: adminTok, body: { commission: 0 } });
    record('P1-2a', 'admin can save commission=0 (server floor is only < 0)', r.status === 200 ? 'VERIFIED' : 'REFUTED',
      `POST /admin/settings {commission:0} -> ${r.status} ${JSON.stringify(r.data).slice(0, 60)}`);
  }
  {
    // Does commission=0 actually break /api/price with a 500, as the report claims?
    const r = await call('/price', { token: cust.token, body: {
      service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', detail: 'Box', contact: '0599111002' } });
    record('P1-2b', 'commission=0 makes every /api/price return 500', r.status >= 500 ? 'VERIFIED' : 'REFUTED',
      `POST /price with commission=0 -> ${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
  }
  {
    const r = await call('/admin/settings', { token: adminTok, body: { plusPrice: 2000 } });
    record('P1-2c', 'no upper ceiling: plusPrice=2000 accepted', r.status === 200 ? 'VERIFIED' : 'REFUTED',
      `POST /admin/settings {plusPrice:2000} -> ${r.status}`);
  }
  {
    await call('/subscriptions', { token: cust.token, body: {} });
    const subs = rowCount('SELECT id, plan, price, status FROM subscriptions WHERE user_id = ?', cust.user.id);
    record('P1-2d', 'subscription stores the admin-set price verbatim (free/overpriced plan)', subs[0]?.price === 2000 ? 'VERIFIED' : 'REFUTED',
      `subscriptions row = ${JSON.stringify(subs)}`);
  }

  // ---------- P2 #12: double-tap Subscribe ----------
  {
    const other = (await call('/auth/register', { body: { phone: '0599111004', name: 'C2', password: 'secret1' } })).data;
    const [a, b] = await Promise.all([
      call('/subscriptions', { token: other.token, body: {} }),
      call('/subscriptions', { token: other.token, body: {} }),
    ]);
    const subs = rowCount("SELECT id, status FROM subscriptions WHERE user_id = ? AND status = 'pending'", other.user.id);
    record('P2-12', 'concurrent Subscribe creates two pending rows (double charge)', subs.length >= 2 ? 'VERIFIED' : 'REFUTED',
      `statuses=${a.status}/${b.status} pending rows=${subs.length}`);
  }

  // ---------- P2 #6: support password reset returns plaintext, writes no audit ----------
  {
    const before = rowCount('SELECT count(*) c FROM security_events')[0].c;
    const r = await call(`/admin/users/${cust.user.id}/password`, { token: adminTok, body: {} });
    const after = rowCount('SELECT count(*) c FROM security_events')[0].c;
    record('P2-6', 'support reset returns a plaintext password and writes no audit row',
      r.status === 200 && typeof r.data.password === 'string' && before === after ? 'VERIFIED' : 'REFUTED',
      `status=${r.status} passwordLen=${r.data.password?.length} security_events ${before}->${after}`);
  }

  // ---------- P2 #7: editUser rewrites identity with no audit ----------
  {
    const before = rowCount('SELECT count(*) c FROM security_events')[0].c;
    const r = await call(`/admin/users/${cust.user.id}`, { token: adminTok, body: { phone: '0599111009' } });
    const after = rowCount('SELECT count(*) c FROM security_events')[0].c;
    const u = rowCount('SELECT phone, phone_verified_at FROM users WHERE id = ?', cust.user.id)[0];
    const sessions = rowCount('SELECT count(*) c FROM sessions WHERE user_id = ?', cust.user.id)[0].c;
    record('P2-7', 'editUser changes phone, clears verification, kills sessions, logs nothing',
      r.status === 200 && u.phone === '0599111009' && u.phone_verified_at === null && sessions === 0 && before === after
        ? 'VERIFIED' : 'REFUTED',
      `status=${r.status} phone=${u.phone} verified=${u.phone_verified_at} sessions=${sessions} events ${before}->${after}`);
  }

  // ---------- P2 #8: approve re-activates a blocked driver ----------
  {
    await call(`/admin/users/${drv.user.id}`, { token: adminTok, body: { status: 'blocked' } });
    const blocked = rowCount('SELECT status FROM users WHERE id = ?', drv.user.id)[0].status;
    const r = await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
    const nowStatus = rowCount('SELECT status FROM users WHERE id = ?', drv.user.id)[0].status;
    record('P2-8', 'approve route re-activates a blocked driver (no status predicate)',
      blocked === 'blocked' && r.status === 200 && nowStatus === 'active' ? 'VERIFIED' : 'REFUTED',
      `${blocked} -> approve ${r.status} -> ${nowStatus}`);
  }

  // ---------- P2 #11: pending remittance strandable ----------
  {
    const r = await call(`/admin/users/${drv.user.id}`, { token: adminTok, body: { status: 'active' } });
    // give the driver a debt: a completed order needs cash; use adjustment to create a debt instead
    const adj = await call('/admin/cash/adjustment', { token: adminTok, body: { driverId: drv.user.id, amountCents: 5000, reason: 'verify debt' } });
    const rem = await call('/admin/cash/remittance', { token: adminTok, body: { driverId: drv.user.id, amountCents: 1000, note: 'verify' } });
    const pend = rowCount("SELECT id, status FROM cash_entries WHERE driver_id = ? AND status = 'pending'", drv.user.id);
    // block the driver, then try to decide the entry
    await call(`/admin/users/${drv.user.id}`, { token: adminTok, body: { status: 'blocked' } });
    const loginBlocked = await call('/auth/login', { body: { phone: '0599111003', password: 'secret1' } });
    const decide = pend[0] ? await call(`/driver/cash/${pend[0].id}/confirm`, { token: drvTok, body: { decision: 'confirm' } }) : { status: 0 };
    record('P2-11', 'a pending remittance can only be decided by the driver; blocking strands it',
      adj.status === 200 && rem.status === 200 && pend.length === 1 && loginBlocked.status !== 200
        ? (decide.status === 200 ? 'PARTIAL' : 'VERIFIED') : 'REFUTED',
      `debt=${adj.status} remittance=${rem.status} pending=${pend.length} blockedLogin=${loginBlocked.status} decide-with-old-token=${decide.status} (no admin route exists)`);
    // restore
    await call(`/admin/users/${drv.user.id}`, { token: adminTok, body: { status: 'active' } });
  }

  // ---------- P1 #3: per-address limiter keyed on attacker-chosen header ----------
  {
    process.env.WIND_TRUST_PROXY = '1'; // read per request
    let blocked = 0; const codes = {};
    for (let i = 0; i < 25; i++) {
      const r = await call('/auth/register', {
        body: { phone: `05992200${String(i).padStart(3, '0')}`, name: `B${i}`, password: 'secret1' },
        headers: { 'X-Real-IP': `203.0.113.${i}` }, // one fresh value per attempt
      });
      codes[r.status] = (codes[r.status] ?? 0) + 1;
      if (r.status === 429) blocked++;
    }
    record('P1-3', 'rotating X-Real-IP defeats the per-address register limit (limit is 20/10min)',
      blocked === 0 ? 'VERIFIED' : 'REFUTED',
      `25 registers with unique X-Real-IP -> ${JSON.stringify(codes)}, 429s=${blocked}`);
  }
  {
    // control: same header value must still trip the limit
    process.env.WIND_TRUST_PROXY = '1';
    let blocked = 0; const codes = {};
    for (let i = 0; i < 25; i++) {
      const r = await call('/auth/register', {
        body: { phone: `05993300${String(i).padStart(3, '0')}`, name: `S${i}`, password: 'secret1' },
        headers: { 'X-Real-IP': '198.51.100.7' },
      });
      codes[r.status] = (codes[r.status] ?? 0) + 1;
      if (r.status === 429) blocked++;
    }
    record('P1-3c', 'control: a fixed X-Real-IP does trip the limit (so the limiter is live, just spoofable)',
      blocked > 0 ? 'VERIFIED' : 'INCONCLUSIVE',
      `25 registers with one X-Real-IP -> ${JSON.stringify(codes)}, 429s=${blocked}`);
  }

  // ---------- P2 #13: one customer can freeze the driver job board ----------
  {
    process.env.WIND_TRUST_PROXY = '0';
    const spammer = (await call('/auth/register', { body: { phone: '0599444001', name: 'Spam', password: 'secret1' } })).data;
    const real = (await call('/auth/register', { body: { phone: '0599444002', name: 'Real', password: 'secret1' } })).data;
    const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', detail: 'Box', contact: '0599444002', pickupNote: 'Al-Manara', dropoffNote: 'Hospital' };
    const quote = await call('/price', { token: spammer.token, body: input });
    const q = quote.data.price;
    for (let i = 0; i < 50; i++) {
      await call('/orders', { token: spammer.token, body: { ...input, quotedPrice: q } });
    }
    const realInput = { ...input, detail: 'REAL ORDER', contact: '0599444001' };
    const realQuote = await call('/price', { token: real.token, body: realInput });
    const realOrder = await call('/orders', { token: real.token, body: { ...realInput, quotedPrice: realQuote.data.price } });
    // a fresh driver: the one above was blocked by the P2-8 probe
    const drv2 = (await call('/auth/register', { body: { phone: '0599444010', name: 'D2', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
    await call(`/admin/users/${drv2.user.id}/approve`, { token: adminTok, body: {} });
    const drv2Tok = (await call('/auth/login', { body: { phone: '0599444010', password: 'secret1' } })).data.token;
    const jobs = await call('/jobs', { token: drv2Tok });
    const visible = Array.isArray(jobs.data) ? jobs.data.length : -1;
    const realVisible = Array.isArray(jobs.data) && jobs.data.some(o => o.id === realOrder.data.id);
    record('P2-13', '50 spam orders fill LIMIT 50 and hide a later real job from drivers',
      visible === 50 && !realVisible ? 'VERIFIED' : 'REFUTED',
      `jobs returned=${visible}, real order ${realOrder.data.id} visible=${realVisible}`);
  }

  // ---------- P2 #10: corrupt stored hash makes login a 500 ----------
  {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run('nocolon', cust.user.id);
    const r = await call('/auth/login', { body: { phone: '0599111009', password: 'secret1' } });
    record('P2-10', 'a stored hash without a salt:hash separator turns login into a 500',
      r.status >= 500 ? 'VERIFIED' : 'REFUTED',
      `login with corrupt hash -> ${r.status} ${JSON.stringify(r.data).slice(0, 60)}`);
  }

  // ---------- P1 #6 / P2 #1-#5: gate status (is it reachable on SQLite?) ----------
  {
    // cust's sessions were killed by the P2-7 probe; use a fresh account for the gate check.
    const g = (await call('/auth/register', { body: { phone: '0599444020', name: 'G', password: 'secret1' } })).data;
    const scope = await call(`/orders/1/scope`, { token: g.token });
    const pay = rowCount("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_intents'").length;
    record('GATE', 'P2 #1-#5 sit behind Postgres-only gates -> unreachable on SQLite',
      scope.status === 409 ? 'VERIFIED' : 'REFUTED',
      `/orders/1/scope -> ${scope.status} ${JSON.stringify(scope.data)}; sqlite payment_intents table exists=${pay > 0} but paymentsAvailable() gates on backend=postgres`);
  }

  // ---------- P3: proof-lock reattempt ----------
  {
    record('P3-pl', 'proof-lock reattempt leaves the 5 failures in place (manual code read only)', 'UNVERIFIED',
      'needs 5 failed proof attempts + an in_transit order; not exercised by this probe');
  }
} finally {
  console.log('\n=== SUMMARY ===');
  const by = {}; for (const r of results) by[r.verdict] = (by[r.verdict] ?? 0) + 1;
  console.log(Object.entries(by).map(([k, v]) => `${k}=${v}`).join(' '));
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
