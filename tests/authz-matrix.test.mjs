// Phase 2 authorization matrix (route × role, demotion, blocked session, cross-party isolation) and design-token guard.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';
import { checkRouteInventory } from './support/route-inventory.mjs';

const root = new URL('../', import.meta.url);
const installed = JSON.parse(readFileSync(new URL('docs/implementation/contracts/endpoints.json', root), 'utf8'));
const additions = JSON.parse(readFileSync(new URL('docs/implementation/contracts/additive-endpoints.json', root), 'utf8'));

const dir = mkdtempSync(join(tmpdir(), 'wind-authz-matrix-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = join(dir, 'authz.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
for (const key of ['WIND_DATABASE_URL', 'WIND_POSTGRES_TEST_ONLY', 'WIND_POSTGRES_TEST_SCHEMA', 'DATABASE_URL',
  'WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN', 'WIND_FIREBASE_API_KEY', 'WIND_FIREBASE_SERVICE_ACCOUNT']) {
  delete process.env[key];
}

const { server, db, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);

const fillPath = (rawPath, ids) => rawPath
  .replace(/^\/api/, '')
  .replace(':id', String(ids.orderId))
  .replace(/:\w+/g, '999999')
  .replaceAll('([^/]+)', '00000000-0000-4000-8000-000000000001');

try {
  // 1. Verify full route inventory parity so no route escapes the matrix.
  await checkRouteInventory(installed, call);

  const register = (phone, name, extra = {}) =>
    call('/auth/register', { body: { phone, name, password: 'Matrix_Password_2026', ...extra } });

  const admin = await register('0599810001', 'Matrix Admin');
  await promote('0599810001');
  const customer = await register('0599810002', 'Matrix Customer');
  const foreignCustomer = await register('0599810003', 'Foreign Customer');
  const driver = await register('0599810004', 'Matrix Driver', { role: 'driver', vehicle: 'car' });
  const spareDriver = await register('0599810005', 'Spare Driver', { role: 'driver', vehicle: 'car' });
  const pendingDriver = await register('0599810006', 'Pending Driver', { role: 'driver', vehicle: 'van' });
  const blockedUser = await register('0599810007', 'Blocked User');
  const demotedAdmin = await register('0599810008', 'Demoted Admin');
  await promote('0599810008');
  assert.equal((await call('/admin/routing', { token: demotedAdmin.token })).provider, 'osrm');
  // Demote staff role directly and verify bearer session loses admin authority on the very next request.
  db.prepare("UPDATE users SET role = 'customer' WHERE id = ?").run(demotedAdmin.user.id);

  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  await call(`/admin/users/${spareDriver.user.id}/approve`, { token: admin.token, body: {} });
  await call(`/admin/users/${blockedUser.user.id}`, { method: 'PATCH', token: admin.token, body: { status: 'blocked' } });

  const orderInput = {
    service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Pickup gate', dropoffNote: 'Dropoff door', contact: '0599810002', detail: 'Box',
  };
  const order = await call('/orders', {
    token: customer.token,
    body: { ...orderInput, quotedPrice: quote(defaultSettings, orderInput) },
  });
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });

  const ids = { orderId: order.id };
  const bodyFor = method => (['POST', 'PATCH', 'PUT'].includes(method) ? { body: {} } : {});

  // 2. Every admin/opencode route across installed + additive inventories refuses customer, driver, pending-driver, demoted-admin, and blocked tokens.
  const installedAdmin = installed.endpoints.filter(e => e.roles === 'admin' || e.path.startsWith('/api/admin/')).map(e => ({ ...e, additive: false }));
  const additiveAdmin = additions.modules.flatMap(m => m.endpoints)
    .filter(e => e.path.startsWith('/api/admin/') || e.path.startsWith('/api/opencode'))
    .map(e => ({ ...e, additive: true }));
  const adminEndpoints = [...installedAdmin, ...additiveAdmin];
  assert.ok(adminEndpoints.length >= 25, `Expected admin route surface, saw ${adminEndpoints.length}`);
  const assertRefused = async (res, additive, detail) => {
    if (res.status === 403) return;
    if (additive && res.status === 409) {
      const payload = await res.json();
      assert.match(String(payload?.error ?? ''), /_unavailable$/, `${detail}: 409 on SQLite must be a capability gate, got ${JSON.stringify(payload)}`);
      return;
    }
    assert.fail(`${detail}, got ${res.status}`);
  };
  for (const ep of adminEndpoints) {
    const path = fillPath(ep.path, ids);
    for (const [label, actor] of [
      ['customer', customer],
      ['driver', driver],
      ['pending-driver', pendingDriver],
      ['demoted-admin', demotedAdmin],
    ]) {
      const res = await fetch(`${base}${path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` },
        ...(bodyFor(ep.method).body ? { body: '{}' } : {}),
      });
      await assertRefused(res, ep.additive, `${label} must be refused on ${ep.method} ${ep.path}`);
    }
    const blockedRes = await fetch(`${base}${path}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${blockedUser.token}` },
      ...(bodyFor(ep.method).body ? { body: '{}' } : {}),
    });
    assert.ok([401, 403].includes(blockedRes.status), `blocked token refused on ${ep.method} ${ep.path}, got ${blockedRes.status}`);
  }

  // 3. Every driver-only route refuses customers; active-driver work routes refuse unapproved pending drivers.
  const driverOnly = [
    ...installed.endpoints.filter(e => e.roles === 'driver').map(e => ({ ...e, additive: false })),
    ...additions.modules.flatMap(m => m.endpoints).filter(e => e.path.startsWith('/api/driver/')).map(e => ({ ...e, additive: true })),
  ];
  for (const ep of driverOnly) {
    const path = fillPath(ep.path, ids);
    const custRes = await fetch(`${base}${path}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
      ...(bodyFor(ep.method).body ? { body: '{}' } : {}),
    });
    await assertRefused(custRes, ep.additive, `customer must be refused on driver route ${ep.method} ${ep.path}`);
  }
  for (const [method, path] of [['GET', '/jobs'], ['POST', `/jobs/${order.id}/accept`], ['POST', '/location']]) {
    await call(path, { method, token: pendingDriver.token, ...(method === 'POST' ? { body: { latitude: 31.9, longitude: 35.2 } } : {}), expect: 403 });
  }

  // 4. Customer-only routes refuse drivers, and order-scoped routes isolate foreign customers and unassigned drivers.
  for (const ep of installed.endpoints.filter(e => e.roles === 'customer')) {
    const path = fillPath(ep.path, ids);
    const drvRes = await fetch(`${base}${path}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driver.token}` },
      ...(bodyFor(ep.method).body ? { body: '{}' } : {}),
    });
    assert.equal(drvRes.status, 403, `driver must receive 403 on customer route ${ep.method} ${ep.path}, got ${drvRes.status}`);
  }
  for (const [actorLabel, actor] of [['foreign-customer', foreignCustomer], ['unassigned-driver', spareDriver]]) {
    for (const [method, path] of [
      ['GET', `/orders/${order.id}`],
      ['GET', `/orders/${order.id}/live`],
      ['GET', `/orders/${order.id}/messages`],
      ['POST', `/orders/${order.id}/messages`],
    ]) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` },
        ...(method === 'POST' ? { body: JSON.stringify({ body: 'probe' }) } : {}),
      });
      assert.ok([403, 404].includes(res.status), `${actorLabel} must not read/mutate foreign order via ${method} ${path}, got ${res.status}`);
    }
  }

  // 5. Phase 2 design-token guard: no raw hex literals in src/ outside src/ui.tsx and documented chart/map-ground constants.
  const allowedHexFiles = new Set(['ui.tsx', 'map-page.tsx', 'map-page.native.tsx', 'app/admin/index.tsx', 'background-location.ts']);
  const srcFiles = readdirSync(new URL('src/', root), { recursive: true })
    .map(f => String(f).replaceAll('\\', '/'))
    .filter(f => /\.(ts|tsx)$/.test(f));
  const drifted = [];
  for (const rel of srcFiles) {
    if (allowedHexFiles.has(rel)) continue;
    const content = readFileSync(new URL(`src/${rel}`, root), 'utf8');
    const hits = content.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hits) drifted.push(`${rel}: ${hits.join(', ')}`);
  }
  assert.deepEqual(drifted, [], `Design-token colour drift found outside src/ui.tsx: ${drifted.join('; ')}`);

  console.log(`Authorization matrix (${adminEndpoints.length} admin, ${driverOnly.length} driver, cross-party order isolation, demotion) and token-drift checks passed`);
} finally {
  await shutdown();
}
