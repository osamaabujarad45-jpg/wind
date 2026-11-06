// Restarting the USB sandbox recovers the exact identities embedded in the role APKs.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restorePhoneTestIdentity } from '../scripts/phone-test-state.mjs';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-phone-state-'));
Object.assign(process.env, { DB_PATH: join(dir, 'sandbox.db'), WIND_IDENTITY_MODE: 'self-service', WIND_ENABLED_SERVICES: 'parcel' });
for (const key of ['WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN']) delete process.env[key];
const { db, server, shutdown, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const password = 'Synthetic-phone-test-password-123';
const phone = { customer: '0599000121', driver: '0599000122', admin: '0599000129' };
const accounts = {};
const login = role => call('/auth/login', { body: { identifier: phone[role], password } });
const restore = role => restorePhoneTestIdentity(db, accounts[role], role, phone[role]);

try {
  for (const role of ['customer', 'driver', 'admin']) {
    const account = await call('/auth/register', { body: { name: `Synthetic ${role}`, phone: phone[role],
      email: `synthetic-${role}@example.test`, password, consent: true,
      ...(role === 'driver' && { role, vehicle: 'van' }) } });
    accounts[role] = { userId: account.user.id, token: account.token };
  }
  await promote(phone.admin);
  await call(`/admin/users/${accounts.driver.userId}/approve`, { token: accounts.admin.token, body: {} });
  for (const account of Object.values(accounts)) account.baseline = db.prepare('SELECT * FROM users WHERE id=?').get(account.userId);
  assert.equal(restorePhoneTestIdentity(db, {}, 'customer', phone.customer), false, 'first startup has no baseline to restore');
  assert.throws(() => restorePhoneTestIdentity(db, accounts.customer, 'driver', phone.customer), 'wrong role cannot restore another identity');

  // Password changes and the administrator's reset both recover the original APK password.
  await call('/me/password', { token: accounts.customer.token, body: { current: password, password: 'Changed-synthetic-password-123' } });
  await call('/auth/login', { body: { identifier: phone.customer, password }, expect: 401 });
  assert.equal(restore('customer'), true);
  let customer = await login('customer');
  await call('/me', { token: accounts.customer.token, expect: 401 });
  await call(`/admin/users/${accounts.customer.userId}/password`, { token: accounts.admin.token, body: { attestation: 'Called the registered number back; caller named last order' } });
  restore('customer');
  customer = await login('customer');
  assert.equal(customer.user.id, accounts.customer.userId);

  // Role changes, blocking and edited contact values must not strand the driver icon.
  await call(`/admin/users/${accounts.driver.userId}`, { token: accounts.admin.token,
    body: { role: 'customer', phone: '0599000132', email: 'changed-driver@example.test', status: 'blocked', name: 'Changed driver' } });
  restore('driver');
  const driver = await login('driver');
  assert.equal(driver.user.id, accounts.driver.userId);
  assert.equal(driver.user.role, 'driver');
  assert.equal(driver.user.status, 'active');
  assert.equal(driver.user.vehicle, 'van');
  assert.ok(driver.user.permanentlyApprovedAt);
  await call('/me', { token: accounts.driver.token, expect: 401 });

  // Deletion and signing up again with the same number retain the original account and its delivery history.
  const body = { service: 'parcel', option: 'small', shared: false, contact: phone.customer,
    pickupCity: 'ramallah', dropoffCity: 'bireh', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff', detail: 'Synthetic parcel' };
  const order = await call('/orders', { token: customer.token, body });
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} });
  await call('/me/delete', { token: customer.token, body: { password } });
  const replacement = await call('/auth/register', { body: { name: 'Replacement synthetic account', phone: phone.customer,
    email: 'synthetic-customer@example.test', password: 'Replacement-synthetic-password-123', consent: true } });
  restore('customer');
  customer = await login('customer');
  assert.equal(customer.user.id, accounts.customer.userId);
  assert.equal(customer.user.email, 'synthetic-customer@example.test');
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).status, 'cancelled');
  await call('/me', { token: replacement.token, expect: 401 });
  assert.equal(db.prepare('SELECT status FROM users WHERE id=?').get(replacement.user.id).status, 'blocked');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  await call('/me/password', { token: accounts.admin.token, body: { current: password, password: 'Changed-admin-password-123' } });
  restore('admin');
  const admin = await login('admin');
  assert.equal(admin.user.role, 'admin');
  assert.equal(admin.user.id, accounts.admin.userId);
  console.log('Phone sandbox restoration passed: password/reset, role/block/contact edits, deletion/re-registration, stable IDs, history and session revocation');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
