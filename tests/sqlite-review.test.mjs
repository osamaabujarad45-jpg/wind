// Deterministic authorization races and disabled-service visibility on the production-default backend.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-sqlite-review-'));
Object.assign(process.env, { DB_PATH: join(dir, 'test.db'), WIND_ENABLED_SERVICES: 'parcel' });
delete process.env.WIND_DATABASE_URL;
delete process.env.WIND_IDENTITY_MODE;
const { server, db, shutdown, promote, persistence } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const originalRun = persistence.run.bind(persistence);
async function beforeLocationWrite(change, action) {
  let changed = false;
  persistence.run = async (sql, ...args) => {
    if (sql.includes('INSERT INTO driver_locations')) { persistence.run = originalRun; change(); changed = true; }
    return originalRun(sql, ...args);
  };
  try { const result = await action(); assert.equal(changed, true, 'the test reached the location write'); return result; }
  finally { persistence.run = originalRun; }
}
try {
  const register = (phone, name, role, vehicle) => call('/auth/register', { body: { phone, name, password: 'secret1', role, vehicle } });
  const admin = await register('0599310001', 'Admin');
  await promote('0599310001');
  const customer = await register('0599310002', 'Customer');
  const car = await register('0599310003', 'Car', 'driver', 'car');
  const truck = await register('0599310004', 'Truck', 'driver', 'truck');
  for (const driver of [car, truck]) await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const order = await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
    option: 'small', shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599310002', detail: 'Box', quotedPrice: 20 } });

  db.prepare("UPDATE orders SET service = 'freight' WHERE id = ?").run(order.id);
  assert.deepEqual(await call('/jobs', { token: truck.token }), []);
  await call(`/orders/${order.id}`, { token: truck.token, expect: 404 });
  db.prepare("UPDATE orders SET driver_id = ?, status = 'assigned' WHERE id = ?").run(truck.user.id, order.id);
  assert.equal((await call(`/orders/${order.id}`, { token: truck.token })).id, order.id, 'assigned drivers retain access');
  db.prepare("UPDATE orders SET service = 'parcel', driver_id = NULL, status = 'searching' WHERE id = ?").run(order.id);
  await call(`/jobs/${order.id}/accept`, { token: car.token, body: {} });

  await beforeLocationWrite(() => db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    .run(createHash('sha256').update(car.token).digest('hex')),
  () => call('/location', { token: car.token, body: { latitude: 31.91, longitude: 35.21 }, expect: 401 }));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_locations WHERE driver_id = ?').get(car.user.id).n, 0,
    'a revoked session cannot store a queued location');
  const login = await call('/auth/login', { body: { identifier: '0599310003', password: 'secret1' } });
  await beforeLocationWrite(() => db.prepare("UPDATE users SET status = 'blocked' WHERE id = ?").run(car.user.id),
    () => call('/location', { token: login.token, body: { latitude: 31.91, longitude: 35.21 }, expect: 401 }));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_locations WHERE driver_id = ?').get(car.user.id).n, 0,
    'a blocked driver cannot store a queued location');
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(car.user.id);
  const afterRelease = await beforeLocationWrite(() => db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id),
    () => call('/location', { token: login.token, body: { latitude: 31.91, longitude: 35.21 } }));
  assert.equal(afterRelease.accepted, false, 'a fix queued before the last assignment ended is discarded');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_locations WHERE driver_id = ?').get(car.user.id).n, 0);
  console.log('PASS SQLite disabled-service visibility and location revocation/assignment races');
} finally {
  persistence.run = originalRun;
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
