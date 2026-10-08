// In-trip chat (SPEC-in-app-chat.md): parties only, open while active, readable 24 h after, admins read-only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-chat-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra } });

try {
  const admin = await call('/auth/register', { body: { phone: '0599110001', name: 'Admin', password: 'secret1' } });
  promote('0599110001');
  const customer = await call('/auth/register', { body: { phone: '0599110002', name: 'Nour', password: 'secret1' } });
  const stranger = await call('/auth/register', { body: { phone: '0599110005', name: 'Other', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599110003', name: 'Yousef', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const driver2 = await call('/auth/register', { body: { phone: '0599110004', name: 'Second', password: 'secret1', role: 'driver', vehicle: 'car' } });
  for (const d of [driver, driver2]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599110002', detail: 'Box' };
  let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  const say = (token, body, expect) => call(`/orders/${order.id}/messages`, { token, body: { body }, expect });

  assert.equal((await say(customer.token, 'Hello?', 409)).error, 'chat_closed'); // nobody to talk to yet
  order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });

  await say(stranger.token, 'hi', 404);
  await say(driver2.token, 'hi', 404);
  await say(admin.token, 'hi', 403);
  for (const body of ['', '   ', 'x'.repeat(501)]) await say(customer.token, body, 400);

  await say(customer.token, ' I am at the blue gate ');
  let thread = await say(driver.token, 'On my way, 5 minutes');
  assert.deepEqual(thread.map(m => [m.role, m.body, m.mine]), [['customer', 'I am at the blue gate', false], ['driver', 'On my way, 5 minutes', true]]);
  assert.deepEqual((await call(`/orders/${order.id}/messages`, { token: customer.token })).map(m => m.mine), [true, false]);
  assert.equal((await call(`/orders/${order.id}/messages`, { token: admin.token })).length, 2);
  await call(`/orders/${order.id}/messages`, { token: stranger.token, expect: 404 });

  // A released job's thread stays with that assignment.
  const other = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  const second = await call(`/jobs/${other.id}/accept`, { token: driver2.token, body: {} });
  await call(`/orders/${other.id}/messages`, { token: driver2.token, body: { body: 'Gate code 4411' } });
  await call(`/orders/${other.id}/release`, { token: driver2.token, body: {} });
  await call(`/orders/${other.id}/messages`, { token: driver2.token, expect: 404 });
  assert.deepEqual(await call(`/orders/${other.id}/messages`, { token: customer.token }), []); // unassigned: nothing shown
  assert.equal((await call(`/orders/${other.id}/messages`, { token: admin.token })).length, 1); // support still sees it
  void second;
  await call(`/orders/${other.id}/cancel`, { token: customer.token, body: {} });

  // Not on the public tracking view.
  const share = await call(`/orders/${order.id}/share`, { token: customer.token, body: {} });
  assert.ok(!JSON.stringify(await call(`/track/${share.token}`)).includes('blue gate'));

  // 30 per 10 minutes per person.
  for (let i = 0; i < 29; i++) await say(driver.token, `update ${i}`);
  assert.equal((await say(driver.token, 'one too many', 429)).error, 'too_many_attempts');

  // Closed when finished; readable for a day, then only to admins.
  order = await advance(driver.token, await advance(driver.token, order));
  const { handoverCode } = await call(`/orders/${order.id}`, { token: customer.token });
  await advance(driver.token, order, { code: handoverCode });
  assert.equal((await say(customer.token, 'Thanks!', 409)).error, 'chat_closed');
  assert.equal((await call(`/orders/${order.id}/messages`, { token: customer.token })).length, 31);
  db.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(Date.now() - 25 * 3_600_000, order.id);
  await call(`/orders/${order.id}/messages`, { token: customer.token, expect: 409 });
  assert.equal((await call(`/orders/${order.id}/messages`, { token: admin.token })).length, 31);

  // Deleting an account replaces that person's words.
  await call('/me/delete', { token: customer.token, body: {} });
  assert.equal((await call(`/orders/${order.id}/messages`, { token: admin.token }))[0].body, '—');

  console.log('chat: ok');
} finally {
  server.close();
}
