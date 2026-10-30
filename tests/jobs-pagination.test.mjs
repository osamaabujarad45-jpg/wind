// Drivers must be able to reach eligible jobs beyond the first 50 without losing filters.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
import { defaultSettings, quote } from '../src/model.ts';

const dir = mkdtempSync(join(tmpdir(), 'wind-jobs-pages-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, db, promote, persistence } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
try {
  const admin = await call('/auth/register', { body: { phone: '0599700101', name: 'Admin', password: 'secret1' } });
  await promote('0599700101');
  const customer = await call('/auth/register', { body: { phone: '0599700102', name: 'Customer', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599700103', name: 'Driver', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const otherCustomer = await call('/auth/register', { body: { phone: '0599700104', name: 'Other customer', password: 'secret1' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const insert = db.prepare(`INSERT INTO orders(customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,status,created_at,updated_at,scheduled_for)
    VALUES(?,'parcel',0,'ramallah',?,'Shop','Home','0599700102','Box','small',0,20,'searching',?,?,?)`);
  const created = Date.now() - 120_000;
  const ids = [];
  // The last item on page one is an eligible scheduled order with the same sort time.
  for (let i = 0; i < 120; i++) ids.push(Number(insert.run(customer.user.id, 'nablus', created, created, i === 19 ? created : null).lastInsertRowid));
  const otherCity = Number(insert.run(otherCustomer.user.id, 'hebron', created, created, null).lastInsertRowid);
  const future = Number(insert.run(customer.user.id, 'nablus', created, created, Date.now() + 86_400_000).lastInsertRowid);
  db.prepare('INSERT INTO order_releases(order_id,driver_id,released_at) VALUES(?,?,?)').run(ids[53], driver.user.id, Date.now());
  for (const rating of [3, 4, 5]) {
    const done = Number(insert.run(customer.user.id, 'nablus', created, created, null).lastInsertRowid);
    db.prepare("UPDATE orders SET status='completed', customer_rating=?, completed_at=? WHERE id=?").run(rating, created, done);
  }
  const offer = db.prepare('INSERT INTO order_offers(order_id,driver_id,price,created_at) VALUES(?,?,?,?)');
  offer.run(ids[0], driver.user.id, 23, Date.now());
  offer.run(ids[1], driver.user.id, 24, Date.now() - 11 * 60_000);
  offer.run(ids[2], admin.user.id, 25, Date.now());

  const eligible = [...ids.filter((_, index) => index !== 53), otherCity];
  const legacy = await call('/jobs', { token: driver.token });
  assert.deepEqual(legacy.map(job => job.id), eligible.slice(0, 50), 'legacy callers still receive the original array');
  const originalAll = persistence.all.bind(persistence);
  let cardQueries = 0;
  persistence.all = (sql, ...params) => {
    if (/AVG\(customer_rating\)|\bFROM order_offers\b/i.test(sql)) cardQueries++;
    return originalAll(sql, ...params);
  };
  const first = await call('/jobs?page=1', { token: driver.token });
  persistence.all = originalAll;
  assert.ok(cardQueries <= 2, `a job page should batch customer statistics and driver offers; got ${cardQueries} queries`);
  assert.equal(first.version, 1);
  assert.deepEqual(first.jobs.map(job => job.id), eligible.slice(0, 20), 'ties are ordered by ID');
  assert.equal(first.jobs.at(-1).scheduledFor, created);
  assert.equal(first.nextCursor, `${created}:${ids[19]}`, 'scheduled boundary uses server ordering');
  const detail = await call(`/orders/${ids[0]}`, { token: driver.token });
  assert.deepEqual(first.jobs[0].customerStats, detail.customerStats, 'batched statistics match the individual order');
  assert.deepEqual(first.jobs[0].myOffer, detail.myOffer, 'batched current offer matches the individual order');
  assert.equal(first.jobs[0].customerStats.rating, 4);
  assert.equal(first.jobs[1].myOffer, null, 'expired offers stay hidden');
  assert.equal(first.jobs[2].myOffer, null, 'another driver’s offer stays private');
  const second = await call(`/jobs?page=1&after=${encodeURIComponent(first.nextCursor)}`, { token: driver.token });
  assert.deepEqual(second.jobs.map(job => job.id), eligible.slice(20, 40));
  const pages = [first, second];
  while (pages.at(-1).nextCursor && pages.length < 10)
    pages.push(await call(`/jobs?page=1&after=${encodeURIComponent(pages.at(-1).nextCursor)}`, { token: driver.token }));
  assert.equal(pages.length, 6);
  const last = pages.at(-1);
  assert.equal(last.nextCursor, null);
  assert.deepEqual(last.jobs.at(-1).customerStats, { rating: null, trips: 0 }, 'statistics remain scoped to each customer');
  assert.ok(!pages.flatMap(page => page.jobs).some(job => job.id === future), 'future scheduled jobs stay hidden on later pages');
  assert.deepEqual(pages.flatMap(page => page.jobs).map(job => job.id), eligible, 'all eligible jobs appear exactly once');
  await call('/driver/heading', { token: driver.token, body: { city: 'nablus' } });
  const filtered = await call(`/jobs?page=1&after=${encodeURIComponent(pages.at(-2).nextCursor)}`, { token: driver.token });
  assert.deepEqual(filtered.jobs.map(job => job.id), eligible.slice(100).filter(id => id !== otherCity), 'destination filter applies to later pages');
  for (const invalid of ['bad', '-1:3', '1:0', '99999999999999999:1'])
    await call(`/jobs?after=${encodeURIComponent(invalid)}`, { token: driver.token, expect: 400 });
  await call(`/jobs?page=1&after=${encodeURIComponent(first.nextCursor)}`, { token: customer.token, expect: 403 });
  // T21: a customer's unscheduled searching demand is capped inside the write transaction, so spam cannot
  // bury the board; scheduled demand and other customers are untouched, and stale unclaimed demand expires.
  const capped = await call('/auth/register', { body: { phone: '0599700105', name: 'Capped', password: 'secret1' } });
  const capInput = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599700105', detail: 'Box' };
  const capPrice = quote(defaultSettings, capInput);
  const book = () => call('/orders', { token: capped.token, body: { ...capInput, quotedPrice: capPrice } });
  const made = [];
  for (let i = 0; i < 5; i++) made.push((await book()).id);
  for (const token of [capped.token, admin.token]) {
    const refusal = await call('/orders', { token, body: { ...capInput, requestId: undefined, quotedPrice: capPrice }, expect: 409 });
    assert.equal(refusal.error, 'too_many_searching');
    break; // admins book through their own account; the cap is per customer, not per role
  }
  await call(`/orders/${made[0]}/cancel`, { token: capped.token, body: {} });
  const afterCancel = await book();
  assert.notEqual(afterCancel.id, made[0]);
  await call(`/orders/${afterCancel.id}/cancel`, { token: capped.token, body: {} });
  // A not-yet-due scheduled order is future work, not board demand: it does not consume the cap.
  const scheduled = await call('/orders', { token: capped.token, body: { ...capInput, quotedPrice: capPrice, scheduledFor: Date.now() + 2 * 86_400_000 } });
  assert.equal((await call(`/orders/${scheduled.id}`, { token: capped.token })).scheduledFor != null, true);
  // Stale demand (default 24 h) leaves the board by system cancellation; assigned or future scheduled work never does.
  const hour = 3_600_000;
  const stale = made[1];
  db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(Date.now() - 25 * hour, stale);
  const recent = made[3];
  db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(Date.now() - 23 * hour, recent);
  const missed = await call('/orders', { token: capped.token, body: { ...capInput, quotedPrice: capPrice, scheduledFor: Date.now() + 2 * 86_400_000 } });
  db.prepare('UPDATE orders SET scheduled_for = ?, created_at = ? WHERE id = ?').run(Date.now() - 25 * hour, Date.now() - 30 * hour, missed.id);
  const kept = made[2];
  await call(`/jobs/${kept}/accept`, { token: driver.token, body: {} });
  db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(Date.now() - 25 * hour, kept);
  const { expireStaleDemand } = await import('../server/main.ts');
  assert.equal(await expireStaleDemand(), 2, 'exactly the stale order and the long-missed scheduled slot expired');
  assert.equal((await call(`/orders/${stale}`, { token: capped.token })).status, 'cancelled');
  assert.equal((await call(`/orders/${missed.id}`, { token: capped.token })).status, 'cancelled', 'a scheduled slot missed by a day leaves the board');
  assert.equal((await call(`/orders/${recent}`, { token: capped.token })).status, 'searching', 'demand younger than 24 h stays');
  assert.equal((await call(`/orders/${kept}`, { token: capped.token })).status, 'assigned', 'assigned custody is never auto-expired');
  assert.equal((await call(`/orders/${scheduled.id}`, { token: capped.token })).status, 'searching', 'not-yet-due scheduled work is never auto-expired');
  const again = await book(); // the expired demand freed a slot
  await call(`/orders/${again.id}/cancel`, { token: capped.token, body: {} });

  console.log('Driver job pages: six pages, scheduled boundary, filters, legacy shape and invalid cursors passed');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
