// In-app support inbox (SPEC-support-inbox.md): one open thread per person, own orders only, idempotent sends,
// staff-only admin routes, replies reopen, close/reopen guards, stale-close refusal, fixed tag set, order links (customer, captain,
// shop; one per message), paging, deletion blanks the person's words and closes their conversation.
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
  assert.deepEqual(await call('/support/thread', { token: customer.token }), { thread: null, messages: [], more: false });
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
  assert.equal('tags' in mine.thread, false); // tags are staff triage, never shown to the person
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

  await call(`/admin/support/${threadId}/close`, { token: admin.token, body: {}, expect: 400 }); // seen is required
  // waiting since the first unanswered message: cleared by a staff reply, set again by the next message, kept by follow-ups
  assert.equal(db.prepare('SELECT waiting_since FROM support_threads WHERE id = ?').get(threadId).waiting_since, null);
  // close with a stale screen: a message that arrived after the last one seen keeps the conversation open
  const seen = staff.messages.at(-1).id;
  await say(customer.token, 'Wait, one more question');
  const waitStart = db.prepare('SELECT waiting_since FROM support_threads WHERE id = ?').get(threadId).waiting_since;
  assert.ok(waitStart > 0);
  await say(customer.token, 'Still there?');
  assert.equal(db.prepare('SELECT waiting_since FROM support_threads WHERE id = ?').get(threadId).waiting_since, waitStart);
  await call(`/admin/support/${threadId}/close`, { token: admin.token, body: { seen }, expect: 409 });
  staff = await call(`/admin/support/${threadId}`, { token: admin.token });
  assert.equal(staff.status, 'open');
  const queuedAt = db.prepare('SELECT updated_at FROM support_threads WHERE id = ?').get(threadId).updated_at;
  // close: leaves the open list; the person's next message opens a new thread
  staff = await call(`/admin/support/${threadId}/close`, { token: admin.token, body: { seen: staff.messages.at(-1).id } });
  assert.equal(staff.status, 'closed');
  assert.equal((await call('/admin/support', { token: admin.token })).length, 0);
  assert.equal((await call('/admin/support?status=closed', { token: admin.token })).length, 1);
  assert.equal((await call('/support/thread', { token: customer.token })).thread.status, 'closed'); // the latest, read-only
  const second = await say(customer.token, 'One more thing about my account');
  assert.notEqual(second.thread.id, threadId);
  // reopening the old thread would split the conversation: refused while the new one is open
  await call(`/admin/support/${threadId}/reopen`, { token: admin.token, body: {}, expect: 409 });
  // answering the old closed thread would do the same: refused, and nothing is written there
  const before = db.prepare('SELECT COUNT(*) n FROM support_messages WHERE thread_id = ?').get(threadId).n;
  await call(`/admin/support/${threadId}/reply`, { token: admin.token, body: { body: 'Late answer', requestId: randomUUID() }, expect: 409 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM support_messages WHERE thread_id = ?').get(threadId).n, before);
  assert.equal((await call(`/admin/support/${threadId}`, { token: admin.token })).status, 'closed');
  await call(`/admin/support/${second.thread.id}/close`, { token: admin.token, body: { seen: Number.MAX_SAFE_INTEGER } });
  assert.equal((await call(`/admin/support/${threadId}/reopen`, { token: admin.token, body: {} })).status, 'open');
  // close and reopen never move the queue position (updated_at is the person's last message while they wait)
  assert.equal(db.prepare('SELECT updated_at FROM support_threads WHERE id = ?').get(threadId).updated_at, queuedAt);
  // answering a closed thread reopens it
  await call(`/admin/support/${threadId}/close`, { token: admin.token, body: { seen: Number.MAX_SAFE_INTEGER } });
  assert.equal((await call(`/admin/support/${threadId}/reply`, { token: admin.token, body: { body: 'Following up', requestId: randomUUID() } })).status, 'open');

  // a second order raised in the same conversation stays on its message; the thread keeps the first
  const order2 = await call('/orders', { token: customer.token, body: { ...input, detail: 'Envelope', quotedPrice: quote(defaultSettings, input) } });
  mine = await say(customer.token, 'Also this one', { orderId: order2.id });
  assert.equal(mine.thread.orderId, order.id);
  assert.equal(mine.messages.at(-1).orderId, order2.id);
  assert.equal(mine.messages[0].orderId, order.id);
  // the shop that prepared an order may link it too (as owner of the merchant on shop_orders)
  const order3 = await call('/orders', { token: customer.token, body: { ...input, detail: 'Basket', quotedPrice: quote(defaultSettings, input) } });
  const now = Date.now();
  db.prepare(`INSERT INTO merchants (owner_user_id, name, category, city, lat, lng, status, min_order_agorot, delivery_fee_agorot, service_fee_agorot,
    commission_bps, prep_minutes, licence_no, licence_expires_at, created_at, updated_at) VALUES (?, 'Shop', 'goods', 'ramallah', 31.9, 35.2, 'active', 0, 0, 0, 0, 10, 'L-1', ?, ?, ?)`)
    .run(stranger.user.id, now + 86_400_000, now, now);
  const merchantId = db.prepare('SELECT id FROM merchants WHERE owner_user_id = ?').get(stranger.user.id).id;
  db.prepare(`INSERT INTO shop_orders (order_id, merchant_id, accept_deadline, goods_estimate_agorot, goods_cap_agorot, delivery_fee_agorot, service_fee_agorot,
    agree_limit, pickup_code) VALUES (?, ?, ?, 0, 0, 0, 0, 0, '0000')`).run(order3.id, merchantId, now);
  const shopSays = await say(stranger.token, 'About the basket order', { orderId: order3.id });
  assert.equal(shopSays.thread.orderId, order3.id);
  await say(stranger.token, 'and the other one', { orderId: order.id }, 404); // not theirs: no shop link to it
  // paging: the latest 50, then "Earlier messages" by cursor
  const stamp = Date.now();
  for (let i = 0; i < 55; i++) db.prepare('INSERT INTO support_messages (thread_id, sender_id, from_staff, body, created_at) VALUES (?, ?, 0, ?, ?)').run(shopSays.thread.id, stranger.user.id, `old ${i}`, stamp);
  const latestPage = await call('/support/thread', { token: stranger.token });
  assert.equal(latestPage.messages.length, 50);
  assert.equal(latestPage.more, true);
  const olderPage = await call(`/support/thread?before=${latestPage.messages[0].id}`, { token: stranger.token });
  assert.equal(olderPage.messages.length, 6);
  assert.equal(olderPage.more, false);
  assert.equal(olderPage.messages[0].body, 'About the basket order');
  await call('/support/thread?before=abc', { token: stranger.token, expect: 400 });
  // one open thread per person, enforced by the database too
  assert.throws(() => db.prepare("INSERT INTO support_threads (user_id, status, tags, last_from, created_at, updated_at) VALUES (?, 'open', '', 'user', 1, 1)").run(customer.user.id));

  // deleting the account blanks what the person wrote to support (no active orders may remain)
  await call(`/orders/${order.id}/cancel`, { token: customer.token, body: {} });
  await call(`/orders/${order2.id}/cancel`, { token: customer.token, body: {} });
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order3.id); // the hand-made shop link has no shop flow to cancel through
  await call('/me/delete', { token: customer.token, body: { password: 'secret1' } });
  const bodies = db.prepare('SELECT body FROM support_messages WHERE sender_id = ?').all(customer.user.id).map(r => r.body);
  assert.ok(bodies.length >= 3 && bodies.every(b => b === '—'), JSON.stringify(bodies));
  // and closes their open conversation, so the inbox does not wait on someone who is gone
  assert.equal(db.prepare("SELECT COUNT(*) n FROM support_threads WHERE user_id = ? AND status = 'open'").get(customer.user.id).n, 0);
  console.log('Support inbox: one open thread, own orders only, idempotent sends, staff-only admin, replies, tags, close/reopen and deletion passed');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
