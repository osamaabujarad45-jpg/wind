import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-booking-auth-'));
let routeStarted, finishRoute;
const osrm = createServer((_req, res) => {
  finishRoute = () => res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 20000, duration: 1800,
    geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] }));
  routeStarted();
});
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, db, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function call(path, body, token, expected = 200, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
try {
  const admin = await call('/auth/register', { phone: '0599111000', name: 'Admin', password: 'secret1' });
  await promote('0599111000');
  let index = 0;
  for (const command of [false, true]) for (const change of ['logout', 'block', 'role', 'delete']) {
    const customer = await call('/auth/register', { phone: `059911100${++index}`, name: 'Customer', password: 'secret1' });
    const started = new Promise(resolve => { routeStarted = resolve; });
    const body = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
      pickupNote: 'Gate', dropoffNote: 'Door', contact: customer.user.phone, detail: 'Box', pricing: 'smart',
      pickupPoint: { latitude: 31.9 + index / 1000, longitude: 35.2 }, ...(command && { requestId: randomUUID() }) };
    const booking = call('/orders', body, customer.token, 401);
    await started;
    if (change === 'logout') await call('/auth/logout', {}, customer.token);
    else if (change === 'delete') await call(`/admin/users/${customer.user.id}`, undefined, admin.token, 200, 'DELETE');
    else await call(`/admin/users/${customer.user.id}`, change === 'block' ? { status: 'blocked' } : { role: 'driver' }, admin.token);
    finishRoute();
    await booking;
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?').get(customer.user.id).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_commands WHERE user_id = ?').get(customer.user.id).n, 0);
  }
  console.log('Booking authority checks passed: logout, block, role change and deletion during routing, with and without command IDs');
} finally {
  finishRoute?.();
  await shutdown();
  await new Promise(resolve => osrm.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
