// Scheduled bookings (SPEC-scheduled-booking.md): bounded times, hidden from drivers until 30 minutes before pickup.
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { dayKey, scheduleSlots } from '../src/booking.ts';
import { apiCaller } from './support/api.mjs';

// Slots follow Palestine time even on a phone set elsewhere.
process.env.TZ = 'Europe/London';
{
  const now = Date.UTC(2026, 9, 4, 17, 10); // 20:10 in Hebron (UTC+3)
  const slots = scheduleSlots(now);
  const hebron = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Hebron', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  assert.equal(hebron(slots[0]), '21:30'); // at least an hour ahead, on the half hour
  assert.ok(slots.every(ms => hebron(ms) >= '06:00' && hebron(ms) <= '22:00'));
  assert.equal(dayKey(slots[0]), '2026-10-04');
  assert.equal(hebron(slots.find(ms => dayKey(ms) === '2026-10-05')), '06:00');
  assert.ok(slots.at(-1) <= now + 6.9 * 86_400_000);
}

const dir = mkdtempSync(join(tmpdir(), 'wind-schedule-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const MIN = 60_000, DAY = 86_400_000;

const call = apiCaller(() => base);

try {
  const admin = await call('/auth/register', { body: { phone: '0599800001', name: 'Admin', password: 'secret1' } });
  promote('0599800001');
  const customer = await call('/auth/register', { body: { phone: '0599800002', name: 'Maha', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599800003', name: 'Driver', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599800002', detail: 'Box' };
  const book = (extra, expect) => call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), ...extra }, expect });

  for (const scheduledFor of [Date.now() + 10 * MIN, Date.now() + 8 * DAY, 'tomorrow', Date.now() + 2 * 3_600_000 + 0.5])
    assert.equal((await book({ scheduledFor }, 400)).error, 'invalid_schedule');

  const now = await book({});
  assert.equal(now.scheduledFor, null);
  const at = Date.now() + 3 * 3_600_000;
  const later = await book({ scheduledFor: at });
  assert.equal(later.scheduledFor, at);
  assert.equal(later.status, 'searching');

  // Drivers only see it 30 minutes before pickup.
  let jobs = await call('/jobs', { token: driver.token });
  assert.deepEqual(jobs.map(j => j.id), [now.id]);
  await call(`/orders/${later.id}`, { token: driver.token, expect: 404 });
  await call(`/jobs/${later.id}/accept`, { token: driver.token, body: {}, expect: 404 });
  db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() + 20 * MIN, later.id);
  jobs = await call('/jobs', { token: driver.token });
  assert.deepEqual(jobs.map(j => j.id).sort(), [now.id, later.id].sort());
  assert.ok(jobs.find(j => j.id === later.id).scheduledFor > Date.now());
  const accepted = await call(`/jobs/${later.id}/accept`, { token: driver.token, body: {} });
  assert.equal(accepted.status, 'assigned');

  // A saved retry whose slot has come too close is refused, never silently booked for now.
  const stale = { ...input, quotedPrice: quote(defaultSettings, input), scheduledFor: Date.now() + 10 * MIN, requestId: '0b8c5e1e-4a7b-4d2a-9c3e-2f1a6b7c8d9e' };
  assert.equal((await call('/orders', { token: customer.token, body: stale, expect: 400 })).error, 'invalid_schedule');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_commands WHERE request_id = ?').get(stale.requestId).n, 0);

  // The customer can still cancel a scheduled order before a driver takes it.
  const another = await book({ scheduledFor: Date.now() + DAY });
  assert.equal((await call(`/orders/${another.id}/cancel`, { token: customer.token, body: {} })).status, 'cancelled');

  console.log('schedule: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
