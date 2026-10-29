// Do any tests pass for the WRONG REASON? A test that asserts an error code passes
// whether the guard fires for the right cause or for an unrelated one (bad input,
// missing auth, a 404 first). Re-run the key assertions with the *cause* checked.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-why-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'verify@example.test';

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const rows = (s, ...p) => db.prepare(s).all(...p);

async function call(path, { token, body } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { status: res.status, data: d };
}

const out = (id, v, m) => console.log(`${v.padEnd(12)} ${id}\n             -> ${m}`);

try {
  await call('/auth/register', { body: { phone: '0599660001', name: 'A', password: 'secret1' } });
  await promote('0599660001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599660001', password: 'secret1' } })).data.token;
  const cust = (await call('/auth/register', { body: { phone: '0599660002', name: 'C', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599660003', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599660003', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599660002', pickupNote: 'A', dropoffNote: 'B' };
  const q = (await call('/price', { token: cust.token, body: input })).data.price;
  const o = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q } });

  // 1. "a customer cannot accept a job" — is it 403, or 404/400 for another reason?
  const custAccept = await call(`/jobs/${o.data.id}/accept`, { token: cust.token, body: {} });
  out('W1 customer-accepts', custAccept.data.error === 'forbidden' ? 'CORRECT-CAUSE' : 'WRONG-CAUSE',
    `/jobs accept as customer -> ${custAccept.status} ${JSON.stringify(custAccept.data)}`);

  // 2. "a driver cannot book" — 403 forbidden, or 400 for a missing field?
  const drvBook = await call('/orders', { token: drvTok, body: input });
  out('W2 driver-books', drvBook.data.error === 'forbidden' ? 'CORRECT-CAUSE' : 'WRONG-CAUSE',
    `POST /orders as driver -> ${drvBook.status} ${JSON.stringify(drvBook.data)}`);

  // 3. "a customer cannot read another's order" — 404 not_found, or 200 with nulls?
  const other = (await call('/auth/register', { body: { phone: '0599660004', name: 'O', password: 'secret1' } })).data;
  const peek = await call(`/orders/${o.data.id}`, { token: other.token });
  out('W3 cross-customer-read', peek.status === 404 ? 'CORRECT-CAUSE' : 'LEAK',
    `GET /orders/${o.data.id} as another customer -> ${peek.status} ${JSON.stringify(peek.data).slice(0, 70)}`);

  // 4. "a stale quote is rejected" — 409 itinerary_changed vs a price mismatch
  const stale = await call('/orders', { token: cust.token, body: { ...input, quotedPrice: q + 1 } });
  out('W4 stale-quote', stale.status === 409 ? 'CORRECT-CAUSE' : 'WRONG-CAUSE',
    `quotedPrice+1 -> ${stale.status} ${JSON.stringify(stale.data)}`);

  // 5. "an unauthenticated call is refused" — 401, not 500
  const anon = await call('/orders');
  out('W5 unauthenticated', anon.status === 401 ? 'CORRECT-CAUSE' : 'WRONG-CAUSE',
    `GET /orders with no token -> ${anon.status} ${JSON.stringify(anon.data)}`);
} finally { server.close(); }
