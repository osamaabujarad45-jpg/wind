// Persistent, isolated USB sandbox. No production data or authentication bypass routes.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { restorePhoneTestIdentity } from './phone-test-state.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('Phone sandbox refuses production mode');
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = join(root, '.expo', 'phone-qa');
mkdirSync(dir, { recursive: true });
process.env.DB_PATH = join(dir, 'sandbox.db');
if (existsSync(join(dir, 'web', 'index.html'))) process.env.WEB_ROOT = join(dir, 'web');
process.env.WIND_IDENTITY_MODE = 'self-service';
// Synthetic testing covers all services; production remains parcel-only.
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
process.env.WIND_CONTACT_VERIFICATION_REQUIRED = 'false';
// Public demonstration routing is sufficient for low-volume synthetic QA, never a production fallback.
process.env.OSRM_URL ??= 'https://router.project-osrm.org';
for (const key of ['WIND_EMAIL_FROM', 'CLOUDFLARE_EMAIL_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SOUQ_PARTNER_KEY']) delete process.env[key];
const { db, server, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(4191, '127.0.0.1', resolve));
const apiUrl = 'http://127.0.0.1:4191';
async function call(path, token, body) {
  const res = await fetch(`${apiUrl}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await res.json();
  assert.equal(res.status, 200, `${path}: ${JSON.stringify(value)}`);
  return value;
}
const provisionPath = join(dir, 'provision.json');
const provision = existsSync(provisionPath) ? JSON.parse(readFileSync(provisionPath, 'utf8')) : { apiUrl, roles: {} };
const labels = { customer: ['0599000101', 'عميل تجريبي'], driver: ['0599000102', 'سائق تجريبي'], admin: ['0599000109', 'إدارة تجريبية'] };
for (const [role, [identifier, name]] of Object.entries(labels)) {
  const saved = provision.roles[role];
  const password = saved?.password ?? randomBytes(24).toString('base64url');
  restorePhoneTestIdentity(db, saved, role, identifier);
  const existing = db.prepare('SELECT id FROM users WHERE phone=?').get(identifier);
  let result;
  if (!existing) result = await call('/auth/register', null, {
    phone: identifier, name, email: `phone-${role}@example.test`, consent: true, password,
    ...(role === 'driver' && { role, vehicle: 'van' }),
  });
  else result = await call('/auth/login', null, { identifier, password });
  if (role === 'admin') {
    promote(identifier);
    result = await call('/auth/login', null, { identifier, password });
  }
  provision.roles[role] = { identifier, password, token: result.token, userId: result.user.id, ...(saved?.baseline && { baseline: saved.baseline }) };
}
const { customer, driver, admin } = provision.roles;
await call(`/admin/users/${driver.userId}/approve`, admin.token, {});
// Capture only after final promotion/approval so restarting restores immediately usable roles.
for (const role of Object.keys(labels)) {
  const saved = provision.roles[role];
  saved.baseline ??= db.prepare('SELECT * FROM users WHERE id=?').get(saved.userId);
}
// Keep current test work on restart. Seed useful history only once.
if (!db.prepare('SELECT id FROM orders LIMIT 1').get()) {
  const base = { service: 'parcel', shared: false, option: 'small', contact: customer.identifier,
    pickupCity: 'ramallah', dropoffCity: 'bireh', pickupNote: 'استلام تجريبي — لا يوجد طرد حقيقي',
    dropoffNote: 'تسليم تجريبي', detail: 'بيانات اختبار فقط', loadingHelp: false };
  async function book(extra = {}) {
    const body = { ...base, ...extra };
    body.quotedPrice = (await call('/price', customer.token, body)).price;
    return call('/orders', customer.token, body);
  }
  const completed = await book();
  await call(`/jobs/${completed.id}/accept`, driver.token, {});
  let current = completed;
  for (const status of ['assigned', 'at_pickup', 'in_transit']) {
    current = await call(`/orders/${completed.id}/advance`, driver.token,
      { expectedStatus: status, requestId: randomUUID(), ...(status === 'in_transit' && { code: completed.handoverCode }) });
  }
  assert.equal(current.status, 'completed');
  await call(`/orders/${completed.id}/rate`, customer.token, { rating: 5 });
  await book();
  await book({ scheduledFor: Math.ceil((Date.now() + 24 * 3_600_000) / 900_000) * 900_000 });
}
provision.startedAt = new Date().toISOString();
writeFileSync(provisionPath, JSON.stringify(provision, null, 2), { mode: 0o600 });
console.log(`Phone sandbox ready on ${apiUrl}; customer, driver and admin provisioned. Credentials remain in ignored .expo/phone-qa/.`);
console.log('Restarting this sandbox restores the three test identities after destructive account tests; delivery history remains. QA routing uses OSRM:', process.env.OSRM_URL);
let ending = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (ending) return;
  ending = true;
  await shutdown();
  process.exit(0);
});
