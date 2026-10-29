// Unblocking a courier must not bypass what blocking enforces.
// REVIEW-2026-10-29 P2 #8: approve had no status predicate, so it re-activated a blocked
// driver still holding a parcel, skipping editUser's carrying_parcels/recovery guard.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-unblock-'));
process.env.DB_PATH = join(dir, 'unblock.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'Synthetic <support> & "contact"';

const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}

try {
  const admin = await call('/auth/register', { body: { phone: '0599600001', name: 'Admin', password: 'secret1' } });
  await promote('0599600001');
  const adminTok = (await call('/auth/login', { body: { phone: '0599600001', password: 'secret1' } })).token;
  const customer = await call('/auth/register', { body: { phone: '0599600002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599600003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: adminTok, body: {} });
  const driverTok = (await call('/auth/login', { body: { phone: '0599600003', password: 'secret1' } })).token;

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599600002', pickupNote: 'Al-Manara', dropoffNote: 'Hospital' };
  const quoted = await call('/price', { token: customer.token, body: input });
  const order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quoted.price } });
  await call(`/jobs/${order.id}/accept`, { token: driverTok, body: {} });

  // Put the parcel in custody: assigned -> at_pickup -> in_transit.
  await call(`/orders/${order.id}/advance`, { token: driverTok, body: { expectedStatus: 'assigned', requestId: crypto.randomUUID() } });
  const atPickup = await call(`/orders/${order.id}`, { token: driverTok });
  assert.equal(atPickup.status, 'at_pickup');
  await call(`/orders/${order.id}/advance`, { token: driverTok, body: { expectedStatus: 'at_pickup', requestId: crypto.randomUUID(), code: atPickup.handoverCode } });
  assert.equal((await call(`/orders/${order.id}`, { token: driverTok })).status, 'in_transit');

  // Block without acknowledging custody is refused (the existing guard).
  assert.equal((await call(`/admin/users/${driver.user.id}`, { token: adminTok, body: { status: 'blocked' }, expect: 409 })).error, 'carrying_parcels');
  // Support acknowledges: the driver is blocked and the parcel goes to 'returning'.
  await call(`/admin/users/${driver.user.id}`, { token: adminTok, body: { status: 'blocked', recovery: 'return' } });

  // THE REGRESSION: unblocking must not silently re-activate a driver still holding the parcel.
  const unblock = await call(`/admin/users/${driver.user.id}/approve`, { token: adminTok, body: {}, expect: 409 });
  assert.equal(unblock.error, 'carrying_parcels', 'unblock must refuse while custody is open');
  assert.equal((await call('/admin/users?status=blocked', { token: adminTok })).find(u => u.id === driver.user.id).status, 'blocked');

  // With the acknowledgement the unblock goes through.
  const cleared = await call(`/admin/users/${driver.user.id}/approve`, { token: adminTok, body: { recovery: 'return' } });
  assert.equal(cleared.status, 'active');

  // A pending driver (no custody) still approves with no body, as before.
  const pending = await call('/auth/register', { body: { phone: '0599600004', name: 'Mona', password: 'secret1', role: 'driver', vehicle: 'car' } });
  assert.equal(pending.user.status, 'pending');
  assert.equal((await call(`/admin/users/${pending.user.id}/approve`, { token: adminTok, body: {} })).status, 'active');

  console.log('unblock: refuses while a parcel is in custody, accepts with recovery, pending still approves');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
