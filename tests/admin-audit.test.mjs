// Admin revocation and attribution over HTTP, using an isolated SQLite database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

// Only the email provider is fake; codes are issued and consumed by the real API.
const inbox = [];
const mailServer = createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    const mail = JSON.parse(raw);
    inbox.push(mail);
    res.end(JSON.stringify({ success: true, errors: [], result: { delivered: [mail.to], permanent_bounces: [], queued: [] } }));
  });
});
await new Promise(resolve => mailServer.listen(0, '127.0.0.1', resolve));
const dir = mkdtempSync(join(tmpdir(), 'wind-admin-audit-'));
Object.assign(process.env, { NODE_ENV: 'test', DB_PATH: join(dir, 'test.db'), WIND_ENABLED_SERVICES: 'parcel',
  WIND_EMAIL_FROM: 'no-reply@wind.example', CLOUDFLARE_ACCOUNT_ID: 'synthetic-admin-audit',
  CLOUDFLARE_EMAIL_TOKEN: 'synthetic-email-token',
  CLOUDFLARE_API_BASE: `http://127.0.0.1:${mailServer.address().port}/client/v4` });
for (const key of ['WIND_DATABASE_URL', 'DATABASE_URL', 'WIND_POSTGRES_STAGING']) delete process.env[key];
const { server, shutdown, db, promote, pruneExpired } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const phones = [], names = [], email = 'recovery@wind.example', password = 'Synthetic-Audit-123';
let phone = 599860001;
async function register(role = 'customer') {
  const number = `0${phone++}`, name = `Synthetic audit ${phone}`;
  phones.push(number); names.push(name);
  return call('/auth/register', { body: { phone: number, name, password, role, vehicle: 'car' } });
}
const subscribe = account => db.prepare('INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,lang,created_at) VALUES(?,?,?,?,?,?)')
  .run(`https://push.example/synthetic/${account.user.id}`, account.user.id, 'synthetic-key', 'synthetic-auth', 'en', Date.now());
const subscriptions = account => db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?').get(account.user.id).n;
const events = action => db.prepare('SELECT * FROM security_events WHERE action=? ORDER BY id').all(action);
function audit(action, actor, detail, orderId = null) {
  const row = events(action).at(-1);
  assert.ok(row, `${action} was audited`);
  assert.equal(row.actor_id, actor.user.id, action);
  assert.equal(row.order_id, orderId, action);
  assert.deepEqual(JSON.parse(row.detail), detail, action);
  assert.ok(row.created_at > 0, action);
  for (const personal of [...phones, ...names, email]) assert.ok(!row.detail.includes(personal), `${action} detail contains no personal data`);
}
async function mailCode(count) {
  for (let i = 0; i < 100 && inbox.length < count; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(inbox.length, count, 'the API sent a code');
  return /: (\d{6})/.exec(inbox.at(-1).text)[1];
}

try {
  const admin = await register();
  await promote(phones[0]);
  const customer = await register(), driver = await register('driver'), victim = await register(), removed = await register();
  const forbidden = (path, body = {}, method) => call(path, { token: customer.token, body: method === 'DELETE' ? undefined : body, method, expect: 403 });

  // Both edit aliases preserve push/session state for ordinary edits and revoke it for a block.
  subscribe(victim);
  await forbidden(`/admin/users/${victim.user.id}`, { name: 'Edited synthetic' });
  await forbidden(`/admin/users/${victim.user.id}`, { name: 'Edited synthetic' }, 'PATCH');
  await call(`/admin/users/${victim.user.id}`, { token: admin.token, body: { name: 'Edited synthetic' } });
  assert.equal(subscriptions(victim), 1, 'non-revoking edit keeps browser alerts');
  await call('/me', { token: victim.token });
  audit('USER_UPDATED', admin, { targetId: victim.user.id, fields: ['name'], identityChanged: false, roleChanged: false });
  const otherSession = await call('/auth/login', { body: { phone: victim.user.phone, password } });
  await call('/me/password', { token: victim.token, body: { current: password, password: 'Changed-Audit-123' } });
  assert.equal(subscriptions(victim), 0, "a self password change stops every browser's alerts: a stolen session's browser cannot be told apart");
  await call('/me', { token: victim.token });
  await call('/me', { token: otherSession.token, expect: 401 });
  subscribe(victim);
  await call(`/admin/users/${victim.user.id}`, { token: admin.token, method: 'PATCH', body: { status: 'blocked' } });
  assert.equal(subscriptions(victim), 0, 'admin block removes browser alerts');
  await call('/me', { token: victim.token, expect: 401 });
  audit('USER_UPDATED', admin, { targetId: victim.user.id, fields: ['status'], identityChanged: false, roleChanged: false });

  // Self-service recovery uses a verified email and a real one-use reset code.
  const recovered = await register();
  await call('/me/email', { token: recovered.token, body: { email } });
  await call('/me/email/code', { token: recovered.token, body: {} });
  await call('/me/email/verify', { token: recovered.token, body: { code: await mailCode(1) } });
  subscribe(recovered);
  await call('/auth/reset/code', { body: { identifier: email } });
  await call('/auth/reset', { body: { identifier: email, code: await mailCode(2), password: 'Recovered-Audit-123' } });
  assert.equal(subscriptions(recovered), 0, 'password reset by code removes browser alerts');
  await call('/me', { token: recovered.token, expect: 401 });

  // Support can attest only when there is no verified email path.
  subscribe(driver);
  const attestation = 'Checked the synthetic recovery evidence';
  await forbidden(`/admin/users/${driver.user.id}/password`, { attestation });
  const reset = await call(`/admin/users/${driver.user.id}/password`, { token: admin.token, body: { attestation } });
  assert.equal(subscriptions(driver), 0, 'support reset removes browser alerts');
  await call('/me', { token: driver.token, expect: 401 });
  audit('SUPPORT_PASSWORD_RESET', admin, { targetId: driver.user.id, sessionsRevoked: true, verification: { method: 'attested', note: attestation } });
  await call('/auth/login', { body: { phone: driver.user.phone, password: reset.password } });

  await forbidden(`/admin/users/${driver.user.id}/approve`);
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  audit('USER_APPROVED', admin, { targetId: driver.user.id, role: 'driver', from: driver.user.status });

  // A session that simply expired ends the same way as a revoked one, but only once it is the user's last.
  const idle = await register(), lively = await register();
  subscribe(idle); subscribe(lively);
  db.prepare('UPDATE sessions SET created_at = 1, last_seen_at = 1 WHERE user_id = ?').run(idle.user.id);
  await pruneExpired();
  assert.equal(subscriptions(idle), 0, 'the browser of an expired last session stops alerting');
  assert.equal(subscriptions(lively), 1, 'a live session keeps its browser');

  // Activation and rejection are both attributed to the deciding admin.
  for (const [holder, decision] of [[customer, 'activate'], [removed, 'reject']]) {
    const requested = await call('/subscriptions', { token: holder.token, body: {} });
    const id = requested.subscription.id;
    await forbidden(`/admin/subscriptions/${id}`, { action: decision });
    await call(`/admin/subscriptions/${id}`, { token: admin.token, body: { action: decision } });
    audit('SUBSCRIPTION_DECIDED', admin, { subscriptionId: id, decision });
  }

  await forbidden('/admin/settings', { parcelPrice: 25 });
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 25, plusPrice: defaultSettings.plusPrice } });
  audit('SETTINGS_UPDATED', admin, { changes: { parcelPrice: { old: defaultSettings.parcelPrice, new: 25 } } });
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 27 } });
  audit('SETTINGS_UPDATED', admin, { changes: { parcelPrice: { old: 25, new: 27 } } });
  const beforeInvalid = events('SETTINGS_UPDATED').length;
  await call('/admin/settings', { token: admin.token, body: { parcelPrice: 0 }, expect: 400 });
  assert.equal(events('SETTINGS_UPDATED').length, beforeInvalid, 'failed settings save writes no success audit');

  const promoBody = { code: 'AUDITTEST', amount: 5, maxUses: 1, days: 1 };
  await forbidden('/admin/promos', promoBody);
  const promos = await call('/admin/promos', { token: admin.token, body: promoBody });
  const promo = promos.find(p => p.code === promoBody.code);
  await forbidden(`/admin/promos/${promo.id}/deactivate`);
  await call(`/admin/promos/${promo.id}/deactivate`, { token: admin.token, body: {} });
  audit('PROMO_DEACTIVATED', admin, { promoId: promo.id });
  await call(`/admin/promos/${promo.id}/deactivate`, { token: admin.token, body: {}, expect: 404 });
  assert.equal(events('PROMO_DEACTIVATED').length, 1, 'a refused repeated deactivation writes no audit');

  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: customer.user.phone, detail: 'Synthetic box' };
  // From the server: this customer's Plus plan, decided above, changes what the tariff alone would give.
  const book = async () => call('/orders', { token: customer.token, body: { ...input, quotedPrice: (await call('/price', { token: customer.token, body: input })).price } });
  const own = await book();
  await call(`/orders/${own.id}/cancel`, { token: customer.token, body: {} });
  assert.equal(events('ORDER_CANCELLED_BY_ADMIN').length, 0, 'customer cancellation writes no admin audit');
  const cancelled = await book();
  await call(`/orders/${cancelled.id}/cancel`, { token: admin.token, body: {} });
  audit('ORDER_CANCELLED_BY_ADMIN', admin, {}, cancelled.id);
  await call(`/orders/${cancelled.id}/cancel`, { token: admin.token, body: {} });
  assert.equal(events('ORDER_CANCELLED_BY_ADMIN').length, 1, 'cancel replay writes no new admin audit');

  await forbidden(`/admin/users/${removed.user.id}`, {}, 'DELETE');
  await call(`/admin/users/${removed.user.id}`, { token: admin.token, method: 'DELETE' });
  assert.equal(db.prepare('SELECT phone FROM users WHERE id=?').get(removed.user.id).phone, `deleted-${removed.user.id}`);
  audit('ACCOUNT_DELETED_BY_ADMIN', admin, { targetId: removed.user.id });
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'scrubbed target and audit actor retain valid references');
  for (const row of db.prepare('SELECT detail FROM security_events').all())
    for (const personal of [...phones, ...names, email]) assert.ok(!row.detail.includes(personal), 'audit details contain no personal data');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM security_events WHERE actor_id=?').get(customer.user.id).n, 0, 'forbidden admin requests wrote no audits');
  console.log('admin-audit: ok');
} finally {
  await shutdown();
  await new Promise(resolve => mailServer.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
