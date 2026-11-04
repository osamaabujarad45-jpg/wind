// Daily revenue follows local calendar days even when the clock crosses DST.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-stats-days-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.TZ = 'America/New_York';
const RealDate = Date;
const fixedNow = RealDate.parse('2026-11-04T17:00:00Z');
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
};
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
try {
  const admin = await call('/auth/register', { body: { phone: '0599700201', name: 'Admin', password: 'secret1' } });
  await promote('0599700201');
  const customer = await call('/auth/register', { body: { phone: '0599700202', name: 'Customer', password: 'secret1' } });
  const gone = await call('/auth/register', { body: { phone: '0599700203', name: 'Gone', password: 'secret1' } });
  await call('/me/delete', { token: gone.token, body: {} });
  assert.equal(db.prepare('SELECT phone FROM users WHERE id = ?').get(gone.user.id).phone, `deleted-${gone.user.id}`);
  await call('/auth/register', { body: { phone: '0599700204', name: 'Partner', password: 'secret1' } });
  db.prepare("UPDATE users SET phone = 'partner:souq' WHERE phone = '0599700204'").run();
  const order = db.prepare(`INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,commission,status,created_at,updated_at,completed_at)
    VALUES(?,'parcel',0,'ramallah','nablus','Shop','Home','0599700202','Box','small',0,20,?,'completed',?,?,?)`);
  const addOrder = (time, commission) => order.run(customer.user.id, commission, fixedNow, fixedNow, RealDate.parse(time));
  addOrder('2026-11-01T04:30:00Z', 5); // 00:30 before the clock change
  addOrder('2026-11-01T05:30:00Z', 7); // 01:30 before the clock change
  addOrder('2026-11-01T06:30:00Z', 11); // 01:30 after the clock change
  addOrder('2026-11-02T05:00:00Z', 13); // next local midnight
  addOrder('2026-10-22T03:59:59Z', 17); // before the first local day
  addOrder('2026-11-05T05:00:00Z', 19); // after the last local day
  const subscription = db.prepare("INSERT INTO subscriptions(user_id,plan,status,price,activated_at,created_at) VALUES(?,'plus','active',?,?,?)");
  subscription.run(customer.user.id, 2, RealDate.parse('2026-11-01T05:30:00Z'), fixedNow);
  subscription.run(customer.user.id, 3, RealDate.parse('2026-11-01T06:30:00Z'), fixedNow);
  subscription.run(customer.user.id, 7, RealDate.parse('2026-11-02T05:00:00Z'), fixedNow);
  subscription.run(customer.user.id, 9, RealDate.parse('2026-11-05T05:00:00Z'), fixedNow);

  await call('/admin/stats', { token: customer.token, expect: 403 });
  const stats = await call('/admin/stats', { token: admin.token });
  assert.deepEqual(stats.users, { admin: 1, customer: 1 }, 'deleted and partner accounts are not users');
  assert.equal(stats.daily.length, 14);
  const dateLabel = time => new RealDate(time).toLocaleDateString('en-CA');
  const find = time => stats.daily.find(day => day.date === dateLabel(time));
  assert.deepEqual(find('2026-11-01T17:00:00Z'), { date: dateLabel('2026-11-01T17:00:00Z'), commission: 23, subscriptions: 5 });
  assert.deepEqual(find('2026-11-02T17:00:00Z'), { date: dateLabel('2026-11-02T17:00:00Z'), commission: 13, subscriptions: 7 });
  assert.equal(stats.daily.reduce((sum, day) => sum + day.commission, 0), 36);
  assert.equal(stats.daily.reduce((sum, day) => sum + day.subscriptions, 0), 12);
  assert.equal(stats.commission, 72, 'all-time totals still include rows outside the daily chart');
  assert.equal(stats.subscriptions, 21);
  console.log('Admin statistics: local-day boundaries, DST, empty days, totals and access passed');
} finally {
  await shutdown();
  globalThis.Date = RealDate;
  rmSync(dir, { recursive: true, force: true });
}
