// In-app support inbox (SPEC-support-inbox.md): one open thread per person, own orders only, idempotent sends,
// staff-only admin routes, reply reopens and pushes, close/reopen, fixed tag set, deletion blanks the person's words.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { maskPhone } from '../server/domain/support.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-support-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);

try {
  assert.equal(maskPhone('0599712754'), '059 ••• 2754');
  assert.equal(maskPhone('+970 59 712 7547'), '970 ••• 7547');
  assert.equal(maskPhone(''), '•••');

  const admin = await call('/auth/register', { body: { phone: '0599120001', name: 'Admin', password: 'secret1' } });
  await promote('0599120001');
  admin.token = (await call('/auth/login', { body: { phone: '0599120001', password: 'secret1' } })).token;
  const customer = await call('/auth/register', { body: { phone: '0599120002', name: 'Laila', password: 'secret1' } });
  const stranger = await call('/auth/register', { body: { phone: '0599120003', name: 'Other', password: 'secret1' } });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599120002', detail: 'Box' };
  const order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  const say = (token, body, extra = {}, expect = 200) => call('/support/messages', { token, body: { body, requestId: randomUUID(), ...extra }, expect });

  // nothing yet
  assert.deepEqual(await call('/support/thread', { token: customer.token }), { thread: null, messages: [] });
  await call('/support/thread', { expect: 401 });

  // input rules
  for (const body of ['', '   ', 'x'.repeat(1001)]) await say(customer.token, body, {}, 400);
  await call('/support/messages', { token: customer.token, body: { body: 'hi' }, expect: 400 }); // a request id is required
  await say(customer.token, 'hi', { requestId: 'not-a-uuid' }, 400);
  // someone else's order reads as missing, never as forbidden
  await say(stranger.token, 'about this order', { orderId: order.id }, 404);
  await say(customer.token, 'bad id', { orderId: -1 }, 400);

  // first message opens a thread linked to the order
  const first = randomUUID();
  let mine = await say(customer.token, ' The parcel is late and the driver does not answer ', { orderId: order.id, requestId: first });
  assert.equal(mine.thread.status, 'open');
  assert.equal(mine.thread.orderId, order.id);
  assert.deepEqual(mine.messages.map(m => [m.body, m.mine, m.fromStaff]), [['The parcel is late and the driver does not answer', true, false]]);
  // a resend with the same request id replays; a different body under it conflicts
  const replay = await say(customer.token, 'The parcel is late and the driver does not answer', { requestId: first });
  assert.equal(replay.messages.length, 1);
  await say(customer.token, 'something else', { requestId: first }, 409);
  // a follow-up joins the same open thread
  mine = await say(customer.token, 'Order W-1, please');
  assert.equal(mine.messages.length, 2);
  const threadId = mine.thread.id;

  // admin routes are staff-only
  await call('/admin/support', { token: customer.token, expect: 403 });
  await call(`/admin/support/${threadId}`, { token: stranger.token, expect: 403 });
  await call(`/admin/support/${threadId}/reply`, { token: customer.token, body: { body: 'x', requestId: randomUUID() }, expect: 403 });

  // the inbox: waiting first, masked phone in the list, full phone on the thread
  let inbox = await call('/admin/support', { token: admin.token });
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].waiting, true);
  assert.equal(inbox[0].person.phone, '059 ••• 0002');
  assert.equal(inbox[0].last.body, 'Order W-1, please');
  assert.equal((await call('/admin/stats', { token: admin.token })).openSupport, 1);
  const detail = await call(`/admin/support/${threadId}`, { token: admin.token });
  assert.equal(detail.person.phone, '0599120002');
  assert.equal(detail.order.id, order.id);
  assert.equal(detail.order.from, 'ramallah');
  await call('/admin/support/999999', { token: admin.token, expect: 404 });

  // a staff reply is visible to the person, stops the thread from "waiting", and is idempotent
  const replyId = randomUUID();
  let staff = await call(`/admin/support/${threadId}/reply`, { token: admin.token, body: { body: 'The driver is at the Huwwara checkpoint, about 15 minutes.', requestId: replyId } });
  assert.equal(staff.messages.at(-1).fromStaff, true);
  staff = await call(`/admin/support/${threadId}/reply`, { token: admin.token, body: { body: 'The driver is at the Huwwara checkpoint, about 15 minutes.', requestId: replyId } });
  assert.equal(staff.messages.length, 3);
  assert.equal((await call('/admin/stats', { token: admin.token })).openSupport, 0);
  mine = await call('/support/thread', { token: customer.token });
  assert.deepEqual(mine.messages.map(m => m.fromStaff), [false, false, true]);
  assert.equal(mine.messages.at(-1).mine, false);

  // tags: only the fixed set, stored in a stable order; the improvements view counts them
  await call(`/admin/support/${threadId}/tags`, { token: admin.token, body: { tags: ['nonsense'] }, expect: 400 });
  await call(`/admin/support/${threadId}/tags`, { token: admin.token, body: { tags: 'eta' }, expect: 400 });
  staff = await call(`/admin/support/${threadId}/tags`, { token: admin.token, body: { tags: ['eta', 'checkpoints', 'eta'] } });
  assert.deepEqual(staff.tags, ['checkpoints', 'eta']);
  const counts = Object.fromEntries((await call('/admin/support/tags', { token: admin.token })).map(t => [t.tag, t.count]));
  assert.equal(counts.checkpoints, 1);
  assert.equal(counts.pricing, 0);
  assert.equal((await call('/admin/support?tag=eta', { token: admin.token })).length, 1);
  assert.equal((await call('/admin/support?tag=pricing', { token: admin.token })).length, 0);
  await call('/admin/support?tag=bogus', { token: admin.token, expect: 400 });

  // close: leaves the open list; the person's next message opens a new thread
  staff = await call(`/admin/support/${threadId}/close`, { token: admin.token, body: {} });
  assert.equal(staff.status, 'closed');
  assert.equal((await call('/admin/support', { token: admin.token })).length, 0);
  assert.equal((await call('/admin/support?status=closed', { token: admin.token })).length, 1);
  assert.equal((await call('/support/thread', { token: customer.token })).thread.status, 'closed'); // the latest, read-only
  const second = await say(customer.token, 'One more thing about my account');
  assert.notEqual(second.thread.id, threadId);
  // reopening the old thread would split the conversation: refused while the new one is open
  await call(`/admin/support/${threadId}/reopen`, { token: admin.token, body: {}, expect: 409 });
  await call(`/admin/support/${second.thread.id}/close`, { token: admin.token, body: {} });
  assert.equal((await call(`/admin/support/${threadId}/reopen`, { token: admin.token, body: {} })).status, 'open');
  // answering a closed thread reopens it
  await call(`/admin/support/${threadId}/close`, { token: admin.token, body: {} });
  assert.equal((await call(`/admin/support/${threadId}/reply`, { token: admin.token, body: { body: 'Following up', requestId: randomUUID() } })).status, 'open');

  // one open thread per person, enforced by the database too
  assert.throws(() => db.prepare("INSERT INTO support_threads (user_id, status, tags, last_from, created_at, updated_at) VALUES (?, 'open', '', 'user', 1, 1)").run(customer.user.id));

  // deleting the account blanks what the person wrote to support (no active orders may remain)
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} });
  await call('/me/delete', { token: customer.token, body: { password: 'secret1' } });
  const bodies = db.prepare('SELECT body FROM support_messages WHERE sender_id = ?').all(customer.user.id).map(r => r.body);
  assert.ok(bodies.length >= 3 && bodies.every(b => b === '—'), JSON.stringify(bodies));
  console.log('Support inbox: one open thread, own orders only, idempotent sends, staff-only admin, replies, tags, close/reopen and deletion passed');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
