// Public trip-share links (SPEC-trip-share-link.md): owner-issued, rotating, PII-free, expiring.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-share-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  if (path.startsWith('/track/') || path.includes('/share')) {
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  }
  return data;
}
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599400001', name: 'Admin', password: 'secret1' } });
  promote('0599400001');
  const customer = await call('/auth/register', { body: { phone: '0599400002', name: 'Lina Haddad', password: 'secret1' } });
  const stranger = await call('/auth/register', { body: { phone: '0599400005', name: 'Other', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599400003', name: 'Sami Khalil', password: 'secret1', role: 'driver', vehicle: 'van' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Secret landmark', dropoffNote: 'Private door', contact: '0599400002', detail: 'Gift',
    pickupPoint: { latitude: 31.9, longitude: 35.2 } };
  let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });

  // Only the order's customer can share it.
  await call(`/orders/${order.id}/share`, { token: stranger.token, body: {}, expect: 404 });
  await call(`/orders/${order.id}/share`, { token: driver.token, body: {}, expect: 404 });
  const first = await call(`/orders/${order.id}/share`, { token: customer.token, body: {} });
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.equal(first.path, `/track/${first.token}`); // the app prefixes its own API origin
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders WHERE share_token_hash = ?').get(first.token).n, 0); // stored hashed

  const searching = await call(`/track/${first.token}`);
  assert.deepEqual(Object.keys(searching).sort(),
    ['driver', 'driverLocation', 'dropoffCity', 'orderCode', 'pickupCity', 'service', 'status', 'updatedAt'].sort());
  assert.equal(searching.status, 'searching');
  assert.equal(searching.driver, null);

  // Rotation invalidates the previous link.
  const second = await call(`/orders/${order.id}/share`, { token: customer.token, body: {} });
  await call(`/track/${first.token}`, { expect: 404 });

  order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await call('/location', { token: driver.token, body: { latitude: 32.0, longitude: 35.25 } });
  const live = await call(`/track/${second.token}`);
  assert.equal(live.status, 'assigned');
  assert.deepEqual(live.driver, { firstName: 'Sami', vehicle: 'van' });
  assert.equal(live.driverLocation.latitude, 32);
  const body = JSON.stringify(live);
  for (const secret of ['0599400002', '0599400003', 'Secret landmark', 'Private door', 'Lina', 'Khalil', 'Gift', '31.9', String(order.price)])
    assert.ok(!body.includes(secret), `public view leaked ${secret}`);
  db.prepare('UPDATE driver_locations SET updated_at = ?').run(Date.now() - 121_000);
  assert.equal((await call(`/track/${second.token}`)).driverLocation, null); // stale positions are not shown

  // Revoke, re-share, then finish: status only, then expiry.
  await call(`/orders/${order.id}/share/revoke`, { token: stranger.token, body: {}, expect: 404 });
  await call(`/orders/${order.id}/share/revoke`, { token: customer.token, body: {} });
  await call(`/track/${second.token}`, { expect: 404 });
  const third = await call(`/orders/${order.id}/share`, { token: customer.token, body: {} });
  order = await advance(driver.token, await advance(driver.token, order));
  const { handoverCode } = await call(`/orders/${order.id}`, { token: customer.token });
  await advance(driver.token, order, { code: handoverCode });
  const done = await call(`/track/${third.token}`);
  assert.equal(done.status, 'completed');
  assert.equal(done.driverLocation, null);
  await call(`/orders/${order.id}/share`, { token: customer.token, body: {}, expect: 409 });
  db.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(Date.now() - 25 * 3_600_000, order.id);
  await call(`/track/${third.token}`, { expect: 404 });
  for (const bad of ['abc', 'g'.repeat(64), '0'.repeat(64)]) await call(`/track/${bad}`, { expect: 404 });

  console.log('share: ok');
} finally {
  server.close();
}
