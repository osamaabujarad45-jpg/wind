// End-to-end check of the API: roles, order lifecycle, tracking, profits, subscriptions.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { defaultSettings, quote } from '../src/model.ts';

const dir = mkdtempSync(join(tmpdir(), 'wind-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SUPPORT_CONTACT = 'Synthetic <support> & "contact"';
process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, partnerKey, body, expect = 200 } = {}) {
  if (path.endsWith('/advance') && body && !body.expectedStatus) {
    const order = await call(path.slice(0, -'/advance'.length), { token });
    body = { ...body, expectedStatus: order.status, requestId: randomUUID() };
  }
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(partnerKey && { 'X-Partner-Key': partnerKey }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}

try {
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal((await call('/ready')).ok, true);
  // Registering can't make an admin; only the server-side promote command can.
  const admin = await call('/auth/register', { body: { phone: '0599000001', name: 'Admin', password: 'secret1', role: 'admin' } });
  assert.equal(admin.user.role, 'customer');
  promote('0599000001');
  assert.equal((await call('/me', { token: admin.token })).user.role, 'admin');
  assert.deepEqual((await call('/me', { token: admin.token })).capabilities, { enabledServices: ['parcel'], pooling: false });
  assert.throws(() => promote('0599999999'));
  const customer = await call('/auth/register', { body: { phone: '+970 59 900 0002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0569000003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const motorcycle = await call('/auth/register', { body: { phone: '0599000006', name: 'Mona', password: 'secret1', role: 'driver', vehicle: 'motorcycle' } });
  const bicycle = await call('/auth/register', { body: { phone: '0599000007', name: 'Basil', password: 'secret1', role: 'driver', vehicle: 'bicycle' } });
  assert.equal(customer.user.phone, '0599000002');
  assert.equal(driver.user.status, 'pending');
  assert.equal(motorcycle.user.vehicle, 'motorcycle');
  assert.equal(bicycle.user.vehicle, 'bicycle');
  await call('/auth/register', { body: { phone: '0599000008', name: 'Invalid', password: 'secret1', role: 'driver', vehicle: 'scooter' }, expect: 400 });
  await call('/auth/register', { body: { phone: '0599000002', name: 'Dup', password: 'secret1' }, expect: 409 });
  await call('/auth/login', { body: { phone: '٠٥٩٩٠٠٠٠٠٢', password: 'secret1' } }); // Arabic-Indic digits
  await call('/auth/login', { body: { phone: '0599000002', password: 'nope' }, expect: 401 });

  // Driver needs approval before seeing jobs
  await call('/jobs', { token: driver.token, expect: 403 });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  await call('/admin/stats', { token: customer.token, expect: 403 });

  // Customer books a shared parcel; price is computed server-side
  const orderInput = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Al-Manara', dropoffNote: 'Hospital', contact: '0599000002', detail: 'Box', price: 1 };
  const order = await call('/orders', { token: customer.token, body: { ...orderInput, quotedPrice: quote(defaultSettings, orderInput) } });
  assert.equal(order.price, quote(defaultSettings, orderInput));
  assert.equal(order.status, 'searching');
  assert.match(order.handoverCode, /^\d{4}$/);
  await call('/orders', { token: customer.token, body: { ...orderInput, quotedPrice: order.price + 1 }, expect: 409 }); // stale quote
  await call('/orders', { token: customer.token, body: { ...orderInput, contact: '123' }, expect: 400 });
  await call('/orders', { token: driver.token, body: orderInput, expect: 403 });
  await call('/orders', { token: customer.token, body: { ...orderInput, shared: true }, expect: 409 });
  const requestId = '12345678-1234-1234-1234-123456789abc';
  const retryInput = { ...orderInput, requestId };
  const duplicate = await Promise.all([call('/orders', { token: customer.token, body: retryInput }), call('/orders', { token: customer.token, body: retryInput })]);
  assert.equal(duplicate[0].id, duplicate[1].id);
  assert.equal((await call('/orders', { token: customer.token, body: Object.fromEntries(Object.entries(retryInput).reverse()) })).id, duplicate[0].id);
  await call('/orders', { token: customer.token, body: { ...retryInput, detail: 'Other parcel' }, expect: 409 });
  await call(`/orders/${duplicate[0].id}/cancel`, { token: customer.token, body: {} });

  // Souqna's server can book once and safely retry; the partner key never grants access to ordinary orders.
  const partnerKey = process.env.SOUQ_PARTNER_KEY;
  await call('/partner/config', { expect: 401 });
  assert.equal((await call('/partner/config', { partnerKey })).cities.find(c => c.id === 'tulkarm').ar, 'طولكرم');
  const delivery = { ...orderInput, externalRef: 'listing:buyer:request', pickupContact: '0599000001',
    quotedPrice: (await call('/partner/quotes', { partnerKey, body: orderInput })).price };
  const partnerOrder = await call('/partner/orders', { partnerKey, body: delivery });
  db.prepare('UPDATE partner_orders SET payload_hash = ? WHERE external_ref = ?').run(createHash('sha256').update(JSON.stringify(delivery)).digest('hex'), delivery.externalRef);
  assert.equal((await call('/partner/orders', { partnerKey, body: delivery })).id, partnerOrder.id); // exact pre-upgrade replay migrates safely
  assert.equal(partnerOrder.pickupContact, '0599000001');
  assert.equal((await call('/partner/orders', { partnerKey, body: delivery })).id, partnerOrder.id);
  assert.equal((await call('/partner/orders', { partnerKey, body: Object.fromEntries(Object.entries(delivery).reverse()) })).id, partnerOrder.id);
  await call('/partner/orders', { partnerKey, body: { ...delivery, pickupNote: 'changed' }, expect: 409 });
  await call(`/partner/orders/${order.id}`, { partnerKey, expect: 404 });
  assert.equal((await call(`/partner/orders/${partnerOrder.id}`, { partnerKey })).status, 'searching');
  assert.equal((await call(`/partner/orders/by-reference?externalRef=${encodeURIComponent(delivery.externalRef)}`, { partnerKey })).id, partnerOrder.id);
  await call('/partner/orders/by-reference?externalRef=not-owned', { partnerKey, expect: 404 });
  // Souq's buyer and seller follow the delivery on Wind's public live map (PII-free page).
  await call(`/partner/orders/${partnerOrder.id}/share`, { body: {}, expect: 401 });
  await call(`/partner/orders/${order.id}/share`, { partnerKey, body: {}, expect: 404 }); // not a partner order
  const link = await call(`/partner/orders/${partnerOrder.id}/share`, { partnerKey, body: {} });
  assert.match(link.path, /^\/track\/[a-f0-9]{64}$/);
  assert.equal((await call(link.path)).status, 'searching');
  await call(`/partner/orders/${partnerOrder.id}/cancel`, { partnerKey, body: {} });
  assert.equal((await call(`/partner/orders/${partnerOrder.id}/cancel`, { partnerKey, body: {} })).status, 'cancelled');
  // Souq pins are optional; given, the courier gets the real points like a Wind booking. A pin outside its city fails at quote time.
  const pinned = { ...orderInput, pickupPoint: { latitude: 31.905, longitude: 35.205 }, dropoffPoint: { latitude: 32.222, longitude: 35.255 } };
  await call('/partner/quotes', { partnerKey, body: { ...pinned, dropoffPoint: pinned.pickupPoint }, expect: 400 });
  await call('/partner/quotes', { partnerKey, body: { ...pinned, pickupPoint: { latitude: '31.9', longitude: 35.2 } }, expect: 400 });
  const pinnedOrder = await call('/partner/orders', { partnerKey, body: { ...pinned, externalRef: 'listing:buyer:pinned',
    quotedPrice: (await call('/partner/quotes', { partnerKey, body: pinned })).price } });
  await call(`/jobs/${pinnedOrder.id}/accept`, { token: driver.token, body: {} });
  const pinnedJob = await call(`/orders/${pinnedOrder.id}`, { token: driver.token });
  assert.deepEqual([pinnedJob.pickupPoint, pinnedJob.dropoffPoint], [pinned.pickupPoint, pinned.dropoffPoint]);
  await call(`/partner/orders/${pinnedOrder.id}/cancel`, { partnerKey, body: {} });
  // The partner account owns every Souq delivery: no admin route lists, edits, resets or deletes it.
  const souq = db.prepare("SELECT id FROM users WHERE phone = 'partner:souq'").get();
  assert.ok(!(await call('/admin/users?q=partner', { token: admin.token })).some(u => u.id === souq.id));
  await call(`/admin/users/${souq.id}`, { token: admin.token, body: { phone: '0599000777' }, expect: 404 });
  await call(`/admin/users/${souq.id}/approve`, { token: admin.token, body: {}, expect: 404 });
  await call(`/admin/users/${souq.id}/password`, { token: admin.token, body: {}, expect: 404 });
  assert.equal((await fetch(`${base}/admin/users/${souq.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin.token}` } })).status, 404);

  // Driver sees the job without private details, accepts, shares location
  const jobs = await call('/jobs', { token: driver.token });
  const job = jobs.find(j => j.id === order.id);
  assert.equal(job.contact, null);
  assert.equal(job.handoverCode, null);
  assert.equal(job.pickupPoint, null);
  assert.equal(job.pickupNote, '');
  assert.equal(job.dropoffNote, '');
  assert.equal(job.customerName, '');
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {}, expect: 409 });
  // A late upload of a fix taken before this assignment never shows on this job.
  assert.equal((await call('/location', { token: driver.token, body: { latitude: 31.9, longitude: 35.2, age: 5000 } })).accepted, false);
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).driverLocation, null);
  assert.equal((await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21 } })).accepted, true);
  await call('/location', { token: driver.token, body: { latitude: null, longitude: 35.21 }, expect: 400 });
  await call('/location', { token: driver.token, body: { latitude: 31.9, longitude: 35.2, age: -1 }, expect: 400 });
  // An older fix arriving late never moves the driver backward; a stale one is dropped, not refused.
  db.prepare('UPDATE orders SET assigned_at = ? WHERE id = ?').run(Date.now() - 90_000, order.id);
  assert.equal((await call('/location', { token: driver.token, body: { latitude: 31.9, longitude: 35.2, age: 10_000 } })).accepted, false);
  assert.equal((await call('/location', { token: driver.token, body: { latitude: 31.9, longitude: 35.2, age: 61_000 } })).accepted, false);
  const tracked = await call(`/orders/${order.id}`, { token: customer.token });
  assert.ok(tracked.driverLocation.ageSeconds <= 1);
  assert.equal(tracked.status, 'assigned');
  assert.equal(tracked.driverName, 'Sami');
  assert.equal(tracked.driverLocation.latitude, 31.95);
  db.prepare('UPDATE driver_locations SET updated_at = ? WHERE driver_id = ?').run(Date.now() - 121000, driver.user.id);
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).driverLocation, null);

  // A parcel courier carries more than one parcel at once (SPEC-parcel-standard.md)
  const privateOrder = await call('/orders', { token: customer.token, body: { ...orderInput, shared: false } });
  await call(`/jobs/${privateOrder.id}/accept`, { token: driver.token, body: {} });
  const secondDriver = await call('/auth/register', { body: { phone: '0599000005', name: 'Rami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/orders/${privateOrder.id}`, { token: secondDriver.token, expect: 404 });
  await call(`/orders/${privateOrder.id}/cancel`, { token: customer.token, body: {} });

  // Delivery needs the customer's handover code
  const arrival = { requestId: randomUUID(), expectedStatus: 'assigned', code: '' };
  assert.equal((await call(`/orders/${order.id}/advance`, { token: driver.token, body: arrival })).status, 'at_pickup');
  assert.equal((await call(`/orders/${order.id}/advance`, { token: driver.token, body: arrival })).status, 'at_pickup'); // lost acknowledgement retries once
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: { ...arrival, code: 'changed' }, expect: 409 });
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: { ...arrival, requestId: randomUUID() }, expect: 409 }); // another stale command cannot skip pickup
  await call(`/orders/9999999/advance`, { token: driver.token, body: { ...arrival, requestId: randomUUID() }, expect: 404 });
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: { expectedStatus: 'at_pickup' }, expect: 400 });
  await call(`/orders/${order.id}/cancel`, { token: driver.token, body: {}, expect: 409 }); // the courier releases instead; sender and support may cancel until pickup (tests/pickup.test.mjs)
  await call('/admin/settings', { token: admin.token, body: { commission: 0.3 } });
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: {} });
  const failedProof = { requestId: randomUUID(), expectedStatus: 'in_transit', code: '0000' };
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: failedProof, expect: 400 });
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: failedProof, expect: 400 });
  assert.equal(db.prepare('SELECT failures FROM proof_attempts WHERE order_id = ?').get(order.id).failures, 1);
  for (let attempt = 1; attempt < 5; attempt++) await call(`/orders/${order.id}/advance`, { token: driver.token, body: { code: '0000' }, expect: 400 });
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: { code: order.handoverCode }, expect: 409 });
  assert.equal(db.prepare('SELECT failures FROM proof_attempts WHERE order_id = ?').get(order.id).failures, 5);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM security_events WHERE order_id = ? AND action = 'PROOF_FAILED'").get(order.id).n, 5);
  await call(`/admin/orders/${order.id}/proof-reset`, { token: driver.token, body: { reason: 'Recipient confirmed by support' }, expect: 403 });
  await call(`/admin/orders/${order.id}/proof-reset`, { token: admin.token, body: { reason: 'Recipient confirmed by support' } });
  const done = await call(`/orders/${order.id}/advance`, { token: driver.token, body: { code: order.handoverCode } });
  assert.equal((await call(`/orders/${order.id}/advance`, { token: driver.token, body: arrival })).status, 'completed'); // replay never regresses current state
  assert.equal(done.status, 'completed');
  assert.equal(done.commission, Math.round(order.price * defaultSettings.commission * 100) / 100);
  await call('/admin/settings', { token: admin.token, body: { commission: defaultSettings.commission } });
  await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21 }, expect: 409 });
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {}, expect: 409 });
  await call(`/orders/${order.id}/rate`, { token: customer.token, body: { rating: 5 } });
  assert.equal((await call('/me', { token: driver.token })).user.rating, 5);

  const earnings = await call('/driver/earnings', { token: driver.token });
  assert.equal(earnings.all.jobs, 1);
  assert.equal(earnings.all.net, Math.round((order.price - done.commission) * 100) / 100);

  // Subscriptions: request, admin activates, plan applies
  const pending = await call('/subscriptions', { token: driver.token, body: {} });
  assert.equal(pending.subscription.status, 'pending');
  await call('/subscriptions', { token: driver.token, body: {}, expect: 409 });
  const subs = await call('/admin/subscriptions', { token: admin.token });
  await call(`/admin/subscriptions/${subs[0].id}`, { token: admin.token, body: { action: 'activate' } });
  assert.equal((await call('/me', { token: driver.token })).plan, 'pro');

  const plusSub = await call('/subscriptions', { token: customer.token, body: {} });
  await call(`/admin/subscriptions/${plusSub.subscription.id}`, { token: admin.token, body: { action: 'activate' } });
  const plusOrder = await call('/orders', { token: customer.token, body: orderInput });
  assert.equal(plusOrder.price, quote(defaultSettings, { ...orderInput, plus: true }));
  assert.ok(plusOrder.price < order.price);

  // Profits
  const stats = await call('/admin/stats', { token: admin.token });
  assert.equal(stats.commission, done.commission);
  assert.equal(stats.subscriptions, defaultSettings.proPrice + defaultSettings.plusPrice);
  assert.equal(stats.profit, stats.commission + stats.subscriptions);
  assert.equal(stats.daily.length, 14);
  assert.equal(stats.daily.at(-1).subscriptions, stats.subscriptions);

  // Settings validation
  await call('/admin/settings', { token: admin.token, body: { commission: 1.5 }, expect: 400 });
  await call('/admin/settings', { token: admin.token, body: { hack: 1 }, expect: 400 });
  await call('/admin/settings', { token: admin.token, body: { commission: 0.4, hack: 1 }, expect: 400 });
  assert.equal((await call('/me', { token: admin.token })).settings.commission, defaultSettings.commission);
  assert.equal((await call('/admin/settings', { token: admin.token, body: { commission: 0.2 } })).commission, 0.2);

  // Independent services need explicit operational enablement.
  await call('/orders', { token: customer.token, body: { ...orderInput, service: 'freight', option: 'large', loadingHelp: true }, expect: 409 });
  await call('/orders', { token: customer.token, body: { ...orderInput, service: 'ride', option: '2', detail: '' }, expect: 409 });

  // Passwords: change, forgotten → support reset
  const oldSession = await call('/auth/login', { body: { phone: '0599000002', password: 'secret1' } });
  await call('/me/password', { token: customer.token, body: { current: 'wrong1', password: 'newpass1' }, expect: 401 });
  await call('/me/password', { token: customer.token, body: { current: 'secret1', password: 'newpass1' } });
  await call('/me', { token: oldSession.token, expect: 401 });
  await call('/me', { token: customer.token });
  await call('/auth/login', { body: { phone: '0599000002', password: 'newpass1' } });
  await call(`/admin/users/${customer.user.id}/password`, { token: customer.token, body: {}, expect: 403 });
  const passwordBeforeReset = db.prepare('SELECT password FROM users WHERE id=?').get(customer.user.id).password;
  db.exec(`CREATE TRIGGER fail_reset_revoke BEFORE DELETE ON sessions WHEN OLD.user_id=${customer.user.id}
    BEGIN SELECT RAISE(ABORT, 'synthetic session write failure'); END`);
  await call(`/admin/users/${customer.user.id}/password`, { token: admin.token, body: {}, expect: 500 });
  assert.ok(db.prepare('SELECT password FROM users WHERE id=?').get(customer.user.id).password === passwordBeforeReset, 'failed reset changed credential state');
  await call('/me', { token: customer.token }); // failed reset must preserve the complete previous credential state
  db.exec('DROP TRIGGER fail_reset_revoke');
  const { password: temp } = await call(`/admin/users/${customer.user.id}/password`, { token: admin.token, body: {} });
  await call('/me', { token: customer.token, expect: 401 }); // reset signs out everywhere
  const relogged = await call('/auth/login', { body: { phone: '0599000002', password: temp } });

  // Blocking revokes access
  let finishSlowBody;
  const slowMutation = new Promise((resolve, reject) => {
    const pending = httpRequest(base + '/me', { method: 'POST', headers: { Authorization: `Bearer ${relogged.token}`, 'Content-Type': 'application/json' } }, response => {
      let raw = ''; response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, data: JSON.parse(raw) }));
    });
    pending.on('error', reject); pending.write('{"name":');
    finishSlowBody = () => pending.end('"Revoked mutation"}');
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  await call(`/admin/users/${customer.user.id}`, { token: admin.token, body: { status: 'blocked' } });
  finishSlowBody();
  assert.equal((await slowMutation).status, 401);
  assert.notEqual(db.prepare('SELECT name FROM users WHERE id = ?').get(customer.user.id).name, 'Revoked mutation');
  await call('/me', { token: relogged.token, expect: 401 });
  await call('/auth/login', { body: { phone: '0599000002', password: temp }, expect: 403 });
  await call(`/admin/users/${admin.user.id}`, { token: admin.token, body: { status: 'blocked' }, expect: 409 });

  // Account deletion: refused with a live order, then erases personal data
  const leaver = await call('/auth/register', { body: { phone: '0599000004', name: 'Maya', password: 'secret1' } });
  const open = await call('/orders', { token: leaver.token, body: orderInput });
  await call('/me/delete', { token: leaver.token, body: {}, expect: 409 });
  await call(`/orders/${open.id}/cancel`, { token: leaver.token, body: {} });
  await call('/me/delete', { token: leaver.token, body: {} });
  await call('/me', { token: leaver.token, expect: 401 });
  await call('/auth/login', { body: { phone: '0599000004', password: 'secret1' }, expect: 401 });
  const erased = await call(`/orders/${open.id}`, { token: admin.token });
  assert.equal(erased.contact, '');
  assert.equal(erased.customerName, '—');
  await call('/auth/register', { body: { phone: '0599000004', name: 'Maya again', password: 'secret1' } }); // number is free again
  await call('/me/delete', { token: admin.token, body: {}, expect: 409 });

  const privacy = await fetch(base.replace('/api', '/privacy'));
  assert.equal(privacy.status, 200);
  const privacyHtml = await privacy.text();
  assert.match(privacyHtml, /Delete your account/);
  assert.match(privacyHtml, /Synthetic &lt;support&gt; &amp; &quot;contact&quot;/);
  const deletion = await fetch(base.replace('/api', '/account-deletion'));
  assert.equal(deletion.status, 200);
  const deletionHtml = await deletion.text();
  assert.match(deletionHtml, /Delete your Wind account/);
  assert.match(deletionHtml, /حذف حسابك في ويند/);
  assert.match(deletionHtml, /Synthetic &lt;support&gt; &amp; &quot;contact&quot;/);
  assert.doesNotMatch(deletionHtml, /Synthetic <support>/);
  assert.equal((await fetch(base.replace('/api', '/account-deletion'), { method: 'POST', body: '{}' })).status, 404);

  // Failure budgets are persisted rather than reset by restarting the process.
  const blockedPhone = '0599999987';
  for (let attempt = 0; attempt < 5; attempt++) await call('/auth/login', { body: { phone: blockedPhone, password: 'bad' }, expect: 401 });
  await call('/auth/login', { body: { phone: blockedPhone, password: 'bad' }, expect: 429 });
  const reopened = new DatabaseSync(process.env.DB_PATH);
  const key = `login:${createHash('sha256').update(blockedPhone).digest('hex')}`;
  assert.equal(reopened.prepare('SELECT count FROM request_limits WHERE key = ?').get(key).count, 5);
  reopened.exec('BEGIN IMMEDIATE');
  db.exec('PRAGMA busy_timeout = 20');
  await call('/me', { token: admin.token, body: { name: 'Locked write' }, expect: 503 });
  await call('/ready', { expect: 503 });
  await call('/health'); // liveness is separate from write readiness
  reopened.exec('ROLLBACK'); reopened.close();
  assert.equal((await call('/ready')).ok, true);
  const snapshot = join(dir, 'snapshot.db').replaceAll("'", "''");
  db.exec(`VACUUM INTO '${snapshot}'`);
  const restored = new DatabaseSync(snapshot, { readOnly: true });
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(restored.prepare('SELECT COUNT(*) count FROM orders').get().count, db.prepare('SELECT COUNT(*) count FROM orders').get().count);
  assert.equal(restored.prepare('SELECT count FROM request_limits WHERE key = ?').get(key).count, 5);
  restored.close();

  console.log('API checks passed');
} finally {
  server.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
