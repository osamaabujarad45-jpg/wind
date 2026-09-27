// End-to-end check of the API: roles, order lifecycle, tracking, profits, subscriptions.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';

const dir = mkdtempSync(join(tmpdir(), 'wind-'));
process.env.DB_PATH = join(dir, 'test.db');
const { server, db, promote } = await import('../server/main.ts');
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
  // Registering can't make an admin; only the server-side promote command can.
  const admin = await call('/auth/register', { body: { phone: '0599000001', name: 'Admin', password: 'secret1', role: 'admin' } });
  assert.equal(admin.user.role, 'customer');
  promote('0599000001');
  assert.equal((await call('/me', { token: admin.token })).user.role, 'admin');
  assert.throws(() => promote('0599999999'));
  const customer = await call('/auth/register', { body: { phone: '+970 59 900 0002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0569000003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  assert.equal(customer.user.phone, '0599000002');
  assert.equal(driver.user.status, 'pending');
  await call('/auth/register', { body: { phone: '0599000002', name: 'Dup', password: 'secret1' }, expect: 409 });
  await call('/auth/login', { body: { phone: '٠٥٩٩٠٠٠٠٠٢', password: 'secret1' } }); // Arabic-Indic digits
  await call('/auth/login', { body: { phone: '0599000002', password: 'nope' }, expect: 401 });

  // Driver needs approval before seeing jobs
  await call('/jobs', { token: driver.token, expect: 403 });
  await call(`/admin/users/${driver.user.id}`, { token: admin.token, body: { status: 'active' } });
  await call('/admin/stats', { token: customer.token, expect: 403 });

  // Customer books a shared parcel; price is computed server-side
  const orderInput = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: true,
    pickupNote: 'Al-Manara', dropoffNote: 'Hospital', contact: '0599000002', detail: 'Box', price: 1 };
  const order = await call('/orders', { token: customer.token, body: { ...orderInput, quotedPrice: quote(defaultSettings, orderInput) } });
  assert.equal(order.price, quote(defaultSettings, orderInput));
  assert.equal(order.status, 'searching');
  assert.match(order.handoverCode, /^\d{4}$/);
  await call('/orders', { token: customer.token, body: { ...orderInput, quotedPrice: order.price + 1 }, expect: 409 }); // stale quote
  await call('/orders', { token: customer.token, body: { ...orderInput, contact: '123' }, expect: 400 });
  await call('/orders', { token: driver.token, body: orderInput, expect: 403 });

  // Driver sees the job without private details, accepts, shares location
  const jobs = await call('/jobs', { token: driver.token });
  const job = jobs.find(j => j.id === order.id);
  assert.equal(job.contact, null);
  assert.equal(job.handoverCode, null);
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {}, expect: 409 });
  await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21 } });
  const tracked = await call(`/orders/${order.id}`, { token: customer.token });
  assert.equal(tracked.status, 'assigned');
  assert.equal(tracked.driverName, 'Sami');
  assert.equal(tracked.driverLocation.latitude, 31.95);

  // Private job can't be pooled with the active shared one
  const privateOrder = await call('/orders', { token: customer.token, body: { ...orderInput, shared: false } });
  await call(`/jobs/${privateOrder.id}/accept`, { token: driver.token, body: {}, expect: 409 });
  await call(`/orders/${privateOrder.id}/cancel`, { token: customer.token, body: {} });

  // Delivery needs the customer's handover code
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: {} });
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: {} });
  await call(`/orders/${order.id}/advance`, { token: driver.token, body: { code: '0000' }, expect: 400 });
  const done = await call(`/orders/${order.id}/advance`, { token: driver.token, body: { code: order.handoverCode } });
  assert.equal(done.status, 'completed');
  assert.equal(done.commission, Math.round(order.price * defaultSettings.commission * 100) / 100);
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
  assert.equal((await call('/admin/settings', { token: admin.token, body: { commission: 0.2 } })).commission, 0.2);

  // Freight also needs a handover code; rides don't
  const freight = await call('/orders', { token: customer.token, body: { ...orderInput, service: 'freight', option: 'large', loadingHelp: true } });
  assert.match(freight.handoverCode, /^\d{4}$/);
  const ride = await call('/orders', { token: customer.token, body: { ...orderInput, service: 'ride', option: '2', detail: '' } });
  assert.equal(ride.handoverCode, null);

  // Passwords: change, forgotten → support reset
  await call('/me/password', { token: customer.token, body: { current: 'wrong1', password: 'newpass1' }, expect: 401 });
  await call('/me/password', { token: customer.token, body: { current: 'secret1', password: 'newpass1' } });
  await call('/auth/login', { body: { phone: '0599000002', password: 'newpass1' } });
  await call(`/admin/users/${customer.user.id}/password`, { token: customer.token, body: {}, expect: 403 });
  const { password: temp } = await call(`/admin/users/${customer.user.id}/password`, { token: admin.token, body: {} });
  await call('/me', { token: customer.token, expect: 401 }); // reset signs out everywhere
  const relogged = await call('/auth/login', { body: { phone: '0599000002', password: temp } });

  // Blocking revokes access
  await call(`/admin/users/${customer.user.id}`, { token: admin.token, body: { status: 'blocked' } });
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
  assert.match(await privacy.text(), /Delete your account/);

  console.log('API checks passed');
} finally {
  server.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
