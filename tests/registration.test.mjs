// Production self-service registration and owner controls, using a synthetic schema-1 database.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, scryptSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultSettings, quote } from '../src/model.ts';

const dir = mkdtempSync(join(tmpdir(), 'wind-registration-'));
const path = join(dir, 'test.db');
Object.assign(process.env, { NODE_ENV: 'production', WIND_IDENTITY_MODE: 'self-service', DB_PATH: path,
  SUPPORT_CONTACT: 'Synthetic support', WIND_ENABLED_SERVICES: 'parcel' });
const password = 'Synthetic_Password123';
const salt = 'synthetic-migration-salt';
const stored = `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
const seed = new DatabaseSync(path);
seed.exec(`PRAGMA user_version = 1;
  CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('customer','driver','admin')), status TEXT NOT NULL CHECK(status IN ('active','pending','blocked')),
    vehicle TEXT, created_at INTEGER NOT NULL, phone_verified_at INTEGER);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL);`);
seed.prepare('INSERT INTO users VALUES (1,?,?,?,\'admin\',\'active\',NULL,?,?)').run('0599000090', 'Existing admin', stored, Date.now(), Date.now());
seed.prepare('INSERT INTO users VALUES (2,?,?,?,\'customer\',\'active\',NULL,?,NULL)').run('0599000091', 'Legacy customer', stored, Date.now());
const legacyToken = 'synthetic_legacy_session';
seed.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(legacyToken).digest('hex'), 2, Date.now());
seed.close();
const { server, db, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
async function call(path, token, body, expected = 200, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + '/api' + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`); return data;
}
const input = { name: 'Synthetic customer', email: ' CUSTOMER@Example.Test ', phone: '٠٥٩٩٠٠٠٠٠١', password, consent: true };
try {
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(db.prepare('SELECT name FROM users WHERE id=1').get().name, 'Existing admin');
  assert.equal((await call('/me', legacyToken)).user.email, null);
  const admin = await call('/auth/login', null, { phone: '0599000090', password });
  assert.deepEqual(await call('/auth/options'), { registrationOpen: true });
  await call('/auth/register', null, { ...input, password: 'short' }, 400);
  await call('/auth/register', null, { ...input, password: 'a'.repeat(101) }, 400);
  await call('/auth/register', null, { ...input, email: 'broken' }, 400);
  await call('/auth/register', null, { ...input, consent: false }, 400);
  await call('/auth/register', null, { ...input, registrationRole: 'admin' }, 400);
  const customer = await call('/auth/register', null, { ...input, status: 'blocked', approvedAt: Date.now(), emailVerifiedAt: Date.now() });
  assert.equal(customer.user.email, 'customer@example.test');
  assert.equal(customer.user.phone, '0599000001');
  assert.equal(customer.user.role, 'customer'); assert.equal(customer.user.status, 'active');
  for (const key of ['phoneVerifiedAt', 'emailVerifiedAt', 'permanentlyApprovedAt']) assert.equal(customer.user[key], null);
  assert.equal('password' in customer.user, false);
  assert.ok(db.prepare('SELECT consent_at FROM users WHERE id=?').get(customer.user.id).consent_at);
  assert.equal((await call('/me', customer.token)).user.id, customer.user.id);
  await call('/auth/register', null, { ...input, phone: '0599000002' }, 409);
  await call('/auth/register', null, { ...input, email: 'another@example.test' }, 409);
  await call('/auth/login', null, { identifier: 'CUSTOMER@EXAMPLE.TEST', password });
  await call('/auth/login', null, { identifier: '+970599000001', password });
  const driver = await call('/auth/register', null, { ...input, name: 'Synthetic driver', phone: '0599000003', email: 'driver@example.test', registrationRole: 'driver', status: 'active', vehicle: 'motorcycle', permanentlyApprovedAt: Date.now() });
  assert.equal(driver.user.status, 'pending'); assert.equal(driver.user.role, 'driver');
  assert.equal(driver.user.vehicle, 'motorcycle');
  assert.equal(driver.user.permanentlyApprovedAt, null);
  await call('/auth/login', null, { identifier: 'driver@example.test', password });
  await call('/me', driver.token);
  for (const [path, body] of [['/jobs', undefined], ['/jobs/999/accept', {}], ['/location', { latitude: 32, longitude: 35 }], ['/orders/999/release', {}]]) await call(path, driver.token, body, 403);
  await call(`/admin/users/${driver.user.id}/approve`, customer.token, {}, 403);
  await call('/admin/users', customer.token, undefined, 403);
  assert.equal((await call('/admin/users?q=customer%40example.test', admin.token)).length, 1);
  const approved = await call(`/admin/users/${driver.user.id}/approve`, admin.token, {});
  assert.equal(approved.status, 'active'); assert.ok(approved.permanentlyApprovedAt);
  assert.equal(approved.phoneVerifiedAt, null); assert.equal(approved.emailVerifiedAt, null);
  assert.equal((await call(`/admin/users/${driver.user.id}/approve`, admin.token, {})).permanentlyApprovedAt, approved.permanentlyApprovedAt);
  await call('/jobs', driver.token);
  const orderInput = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Synthetic A', dropoffNote: 'Synthetic B', contact: input.phone, detail: 'Synthetic parcel' };
  const order = await call('/orders', customer.token, { ...orderInput, quotedPrice: quote(defaultSettings, orderInput) });
  await call(`/jobs/${order.id}/accept`, driver.token, {});
  for (const body of [{ role: 'customer' }, { vehicle: 'truck' }, { status: 'pending' }, { phone: '0599000008' }]) await call(`/admin/users/${driver.user.id}`, admin.token, body, 409, 'PATCH');
  // Blocking a courier who holds a job needs support to confirm its recovery (courier-block.test.mjs); the job returns to the pool.
  await call(`/admin/users/${driver.user.id}`, admin.token, { status: 'blocked' }, 409, 'PATCH');
  await call(`/admin/users/${driver.user.id}`, admin.token, { status: 'blocked', recovery: 'return' }, 200, 'PATCH');
  await call('/me', driver.token, undefined, 401);
  await call(`/admin/users/${driver.user.id}`, admin.token, { status: 'active' }, 200, 'PATCH');
  driver.token = (await call('/auth/login', null, { identifier: 'driver@example.test', password })).token;
  await call(`/jobs/${order.id}/accept`, driver.token, {});
  await call(`/admin/users/${customer.user.id}`, admin.token, undefined, 409, 'DELETE');
  await call(`/orders/${order.id}/release`, driver.token, {});
  await call(`/orders/${order.id}/cancel`, customer.token, {});
  await call(`/admin/users/${customer.user.id}/approve`, admin.token, {});
  const changed = await call(`/admin/users/${customer.user.id}`, admin.token, { name: 'Edited', email: 'EDITED@example.test', phone: '0599000004' }, 200, 'PATCH');
  assert.equal(changed.email, 'edited@example.test'); assert.equal(changed.permanentlyApprovedAt, null);
  await call('/me', customer.token, undefined, 401);
  const editedSession = await call('/auth/login', null, { identifier: 'edited@example.test', password });
  await call(`/admin/users/${customer.user.id}`, admin.token, { status: 'blocked' }, 200, 'PATCH');
  await call('/me', editedSession.token, undefined, 401);
  await call('/auth/login', null, { identifier: 'edited@example.test', password }, 403);
  await call(`/admin/users/${customer.user.id}`, admin.token, { status: 'active' }, 200, 'PATCH');
  const beforeDelete = await call('/auth/login', null, { identifier: 'edited@example.test', password });
  const switching = await call('/auth/register', null, { ...input, email: 'switching@example.test', phone: '0599000015' });
  const plus = (await call('/subscriptions', switching.token, {})).subscription;
  await call(`/admin/subscriptions/${plus.id}`, admin.token, { action: 'activate' });
  const revenue = db.prepare('SELECT SUM(price) value FROM subscriptions WHERE activated_at IS NOT NULL').get().value;
  await call(`/admin/users/${switching.user.id}`, admin.token, { role: 'driver', vehicle: 'car' });
  let switched = await call('/auth/login', null, { identifier: 'switching@example.test', password });
  assert.equal((await call('/me', switched.token)).subscription, null);
  // Already-converted legacy accounts can still have an unexpired subscription for the wrong role.
  db.prepare('UPDATE subscriptions SET ends_at=? WHERE id=?').run(Date.now() + 86400000, plus.id);
  assert.equal((await call('/me', switched.token)).plan, null);
  assert.equal((await call('/me', switched.token)).subscription, null);
  assert.equal((await call('/subscriptions', switched.token, {})).subscription.plan, 'pro');
  assert.equal(db.prepare('SELECT SUM(price) value FROM subscriptions WHERE activated_at IS NOT NULL').get().value, revenue);
  await call(`/admin/users/${switching.user.id}`, admin.token, { role: 'customer', status: 'active' });
  switched = await call('/auth/login', null, { identifier: 'switching@example.test', password });
  assert.equal((await call('/subscriptions', switched.token, {})).subscription.plan, 'plus');
  assert.equal(db.prepare("SELECT status FROM subscriptions WHERE user_id=? AND plan='pro'").get(switching.user.id).status, 'rejected');
  for (const [suffix, body, method] of [['', { status: 'blocked' }, 'PATCH'], ['', undefined, 'DELETE'], ['/approve', {}, 'POST']]) await call('/admin/users/1' + suffix, admin.token, body, 409, method);
  await call(`/admin/users/${customer.user.id}`, admin.token, undefined, 200, 'DELETE');
  await call('/me', beforeDelete.token, undefined, 401);
  const deleted = db.prepare('SELECT * FROM users WHERE id=?').get(customer.user.id);
  assert.equal(deleted.email, null); assert.equal(deleted.password, ''); assert.equal(deleted.phone_verified_at, null);
  assert.equal(deleted.approved_at, null); assert.equal(deleted.phone, `deleted-${customer.user.id}`);
  const retainedOrder = db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
  assert.equal(retainedOrder.contact, ''); assert.equal(retainedOrder.detail, '');
  // Anonymization frees both identifiers for a new independent account.
  await call('/auth/register', null, { ...input, email: 'edited@example.test', phone: '0599000004' });
  assert.equal(await (await fetch(base + '/terms')).text().then(s => s.includes('Synthetic support')), true);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  console.log('Self-service checks passed: schema-1 upgrade, immediate email/phone login, truthfully unverified identities, pending-driver safety, admin edit/approve/block/delete, session revocation and order integrity');
} finally {
  await shutdown();
  const verificationSource = `import assert from 'node:assert/strict';
    const {server,db,shutdown}=await import(${JSON.stringify(new URL('../server/main.ts', import.meta.url).href)});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api';
    const post=async(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    try {
      const before=db.prepare('SELECT COUNT(*) n FROM users').get().n;
      assert.equal((await post('/auth/register',{name:'Future signup',email:'future@example.test',phone:'0599000007',password:${JSON.stringify(password)},consent:true})).status,403);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,before);
      assert.equal((await post('/auth/login',{phone:'0599000004',password:${JSON.stringify(password)}})).status,403);
      db.prepare('UPDATE users SET approved_at=? WHERE id=2').run(Date.now());
      assert.equal((await post('/auth/login',{phone:'0599000091',password:${JSON.stringify(password)}})).status,200);
      assert.equal(db.prepare('SELECT phone_verified_at FROM users WHERE id=2').get().phone_verified_at,null);
      db.prepare('UPDATE users SET phone_verified_at=? WHERE phone=?').run(Date.now(),'0599000004');
      assert.equal((await post('/auth/login',{phone:'0599000004',password:${JSON.stringify(password)}})).status,200);
      assert.equal((await post('/auth/login',{phone:'0599000090',password:${JSON.stringify(password)}})).status,200);
      console.log('Future verification gate passed: closed unproven signup, unverified login blocked, real phone proof or permanent approval allowed, legacy admin preserved');
    }finally{await shutdown();}`;
  const verification = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e', verificationSource],
    { env: { ...process.env, WIND_CONTACT_VERIFICATION_REQUIRED: 'true' }, encoding: 'utf8', timeout: 15000 });
  assert.equal(verification.status, 0, verification.stderr);
  console.log(verification.stdout.trim());
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep + 'wind-registration-'));
  rmSync(dir, { recursive: true, force: true });
}
