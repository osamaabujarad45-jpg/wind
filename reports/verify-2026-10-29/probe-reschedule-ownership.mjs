// Prove the reschedule ownership guard (main.ts:1495) is untested, and that
// the *other* users who reach it are also uncovered. Runs the real server.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-owned-'));
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

const DAY = 86_400_000;
try {
  await call('/auth/register', { body: { phone: '0599550001', name: 'A', password: 'secret1' } });
  await promote('0599550001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599550001', password: 'secret1' } })).data.token;
  const owner = (await call('/auth/register', { body: { phone: '0599550002', name: 'O', password: 'secret1' } })).data;
  const other = (await call('/auth/register', { body: { phone: '0599550003', name: 'X', password: 'secret1' } })).data;
  const drv = (await call('/auth/register', { body: { phone: '0599550004', name: 'D', password: 'secret1', role: 'driver', vehicle: 'car' } })).data;
  await call(`/admin/users/${drv.user.id}/approve`, { token: adminTok, body: {} });
  const drvTok = (await call('/auth/login', { body: { phone: '0599550004', password: 'secret1' } })).data.token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599550002', pickupNote: 'A', dropoffNote: 'B' };
  const soon = Date.now() + 60 * 60_000, far = Date.now() + 5 * DAY;
  const q = (await call('/price', { token: owner.token, body: input })).data.price;

  // A scheduled parcel; make it visible to the driver so getOrder() lets them in.
  const o = await call('/orders', { token: owner.token, body: { ...input, quotedPrice: q, scheduledFor: soon } });
  const id = o.data.id;
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() - 60_000, id);

  // 1. the assigned driver tries to reschedule someone else's order
  await call(`/jobs/${id}/accept`, { token: drvTok, body: {} });
  const drvTry = await call(`/orders/${id}/schedule`, { token: drvTok, body: { scheduledFor: far } });
  const guardHeld = drvTry.status === 409 && drvTry.data.error === 'cannot_reschedule';
  console.log(`${guardHeld ? 'VERIFIED' : 'FAILED'}     J. reschedule ownership guard is reachable and holds`);
  console.log(`             -> assigned driver POST /orders/${id}/schedule -> ${drvTry.status} ${JSON.stringify(drvTry.data)}`);

  // 2. a different customer
  db.prepare('UPDATE orders SET driver_id = NULL, status = ? WHERE id = ?').run('searching', id);
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() - 60_000, id);
  const otherTry = await call(`/orders/${id}/schedule`, { token: other.token, body: { scheduledFor: far } });
  console.log(`other customer -> ${otherTry.status} ${JSON.stringify(otherTry.data)} (getOrder 404s first)`);

  console.log(`\nconclusion: the only route into line 1495 is an assigned driver, and`);
  console.log(`schedule.test.mjs:78 sends a driver who cannot see the job (expect 404), so the`);
  console.log(`ownership guard itself is never asserted.`);
} finally { server.close(); }
