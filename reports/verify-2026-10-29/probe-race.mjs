// Is the Subscribe check-then-insert window actually reachable?
// The mutex serialises each SQL statement, but /subscriptions awaits `latestSubscription`
// and then awaits an INSERT with no transaction between them. If the event loop can
// interleave two requests inside that gap, two rows are possible. Widen the gap with a
// slow concurrent write and many parallel callers to see if it opens.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-v4-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const rows = (sql, ...p) => db.prepare(sql).all(...p);

async function post(path, token, body = {}) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return res.status;
}

// promote comes from the module import at the top
await post('/auth/register', '', { phone: '0599777001', name: 'A', password: 'secret1' });
await promote('0599777001');
const adminTok = (await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '0599777001', password: 'secret1' }) })).json()).token;

let doubles = 0, trials = 0;
for (let round = 0; round < 25; round++) {
  const phone = `05991${String(round).padStart(5, '0')}`;
  const u = await (await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, name: 'R' + round, password: 'secret1' }) })).json();
  if (!u.token) { console.log(`round ${round}: register failed`, JSON.stringify(u)); continue; }
  trials++;
  // Saturate: 40 concurrent subscribe calls while a slow unrelated write occupies the mutex.
  const blocker = (async () => {
    for (let i = 0; i < 40; i++) await post('/admin/settings', adminTok, { parcelPrice: 20 + (i % 3) });
  })();
  const statuses = await Promise.all(Array.from({ length: 40 }, () => post('/subscriptions', u.token)));
  await blocker;
  const n = rows("SELECT count(*) c FROM subscriptions WHERE user_id=? AND status='pending'", u.user.id)[0].c;
  if (!u.token) { console.log(`round ${round}: register failed`, u); continue; }
  if (n > 1) { doubles++; console.log(`round ${round}: ${n} pending rows, statuses ok=${statuses.filter(s => s === 200).length}`); }
}
console.log(`\nresult: ${doubles}/${trials} rounds produced duplicate pending subscriptions`);
const idx = rows("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='subscriptions'");
console.log('indexes on subscriptions:', JSON.stringify(idx));
console.log('temp:', dir);
server.close();
