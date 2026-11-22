// In-app support inbox on PostgreSQL with two API processes (SPEC-support-inbox.md): staff scopes, racing first messages,
// racing duplicate replies, and a close racing the person's message. The SQLite suite (support-inbox.test.mjs) covers the rules.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';

const f = await fixture('supportinbox');
const grant = (target, staffRole) => f.call(`/admin/staff/${target.user.id}/role`, { token: f.admin.token, body: { staffRole, purpose: 'Synthetic support inbox scope test' } });
const say = (call, person, body) => call('/support/messages', { token: person.token, body: { body, requestId: randomUUID() } });
// A close may succeed or be refused (409 new_message) in the race below: return the status rather than assert one.
const closeOn = async (base, token, id, seen) => {
  const res = await fetch(`${base}/admin/support/${id}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ seen }) });
  const data = await res.json();
  assert.ok(res.status === 200 || (res.status === 409 && data.error === 'new_message'), JSON.stringify(data));
  return res.status;
};
try {
  // Scopes: finance staff neither see the inbox nor its count; support staff do; the platform admin does.
  const finance = await f.account('admin'), support = await f.account('admin');
  await grant(finance, 'finance');
  await grant(support, 'support');
  assert.equal((await f.call('/admin/stats', { token: finance.token })).openSupport, null);
  await f.call('/admin/support', { token: finance.token, expect: 403 });
  assert.equal(typeof (await f.call('/admin/stats', { token: support.token })).openSupport, 'number');
  assert.equal(typeof (await f.call('/admin/stats', { token: f.admin.token })).openSupport, 'number');

  // Two first messages at once, one on each process: one open thread holds both.
  const laila = await f.account();
  const both = await Promise.all([say(f.call, laila, 'first A'), say(f.other, laila, 'first B')]);
  assert.equal(both[0].thread.id, both[1].thread.id);
  assert.equal((await f.db.one("SELECT COUNT(*) n FROM support_threads WHERE user_id = ? AND status = 'open'", laila.user.id)).n, 1);
  assert.equal((await f.db.one('SELECT COUNT(*) n FROM support_messages WHERE thread_id = ?', both[0].thread.id)).n, 2);

  // The same staff reply sent twice at once (a retry racing the original): one message, both answers succeed.
  const threadId = both[0].thread.id;
  const reply = { body: 'We are on it.', requestId: randomUUID() };
  const replies = await Promise.all([f.call(`/admin/support/${threadId}/reply`, { token: support.token, body: reply }),
    f.other(`/admin/support/${threadId}/reply`, { token: support.token, body: reply })]);
  assert.deepEqual(replies.map(r => r.messages.filter(m => m.fromStaff).length), [1, 1]);
  assert.equal((await f.db.one('SELECT COUNT(*) n FROM support_messages WHERE thread_id = ? AND from_staff = 1', threadId)).n, 1);

  // A close racing the person's next message: the message never ends up unseen in a closed conversation. Either the close
  // is refused (new_message), or the message opens a fresh conversation after the close.
  let refused = 0, reopened = 0;
  for (let round = 0; round < 12; round++) {
    const person = await f.account();
    const opened = await say(f.call, person, `round ${round}`);
    const seen = opened.messages.at(-1).id;
    const [close, sent] = await Promise.allSettled([
      closeOn(round % 2 ? f.a.base : f.b.base, support.token, opened.thread.id, seen),
      say(round % 2 ? f.other : f.call, person, `follow-up ${round}`)]);
    assert.equal(sent.status, 'fulfilled', String(sent.reason));
    assert.equal(close.status, 'fulfilled', String(close.reason));
    const buried = await f.db.one(`SELECT COUNT(*) n FROM support_messages m JOIN support_threads t ON t.id = m.thread_id
      WHERE t.status = 'closed' AND m.from_staff = 0 AND m.id > ? AND t.id = ?`, seen, opened.thread.id);
    assert.equal(buried.n, 0, `round ${round}: a message after the close's view sits in a closed conversation`);
    if (sent.value.thread.id !== opened.thread.id) reopened++;
    else if ((await f.db.one('SELECT status FROM support_threads WHERE id = ?', opened.thread.id)).status === 'open') refused++;
    assert.equal((await f.db.one("SELECT COUNT(*) n FROM support_threads WHERE user_id = ? AND status = 'open'", person.user.id)).n, 1);
  }
  assert.equal(refused + reopened, 12, 'every round ends with the follow-up in an open conversation');
  console.log(`pg-support-inbox: scopes, racing first messages and replies, close vs message (${refused} refused, ${reopened} new) ok`);
} finally {
  await f.close();
}
