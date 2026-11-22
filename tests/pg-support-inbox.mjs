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

  // A staff reply racing the person's next message: the waiting flag always matches whoever wrote last.
  for (let round = 0; round < 8; round++) {
    const person = await f.account();
    const opened = await say(f.call, person, `question ${round}`);
    await Promise.all([
      (round % 2 ? f.call : f.other)(`/admin/support/${opened.thread.id}/reply`, { token: support.token, body: { body: `answer ${round}`, requestId: randomUUID() } }),
      say(round % 2 ? f.other : f.call, person, `more ${round}`)]);
    const last = await f.db.one('SELECT from_staff FROM support_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1', opened.thread.id);
    const thread = await f.db.one('SELECT last_from, waiting_since FROM support_threads WHERE id = ?', opened.thread.id);
    assert.equal(thread.last_from, last.from_staff ? 'staff' : 'user', `round ${round}: waiting flag disagrees with the last message`);
    assert.equal(thread.waiting_since == null, !!last.from_staff, `round ${round}: waiting_since disagrees with the last message`);
  }
  // A send racing the account's deletion: the deletion holds the user row; the send parks on holdPerson's FOR KEY SHARE (seen in
  // pg_stat_activity, so the test fails if the lock is not taken), then sees the account is gone and writes nothing. The
  // deletion commits as soon as the wait shows, well inside the API's 500 ms lock timeout (which runs only while it waits).
  const leaving = await f.account();
  await f.call('/support/thread', { token: leaving.token }); // warm the session so the send arrives promptly
  await f.db.scope(async () => {
    await f.db.exec('BEGIN');
    try {
      await f.db.one('SELECT id FROM users WHERE id = ? FOR UPDATE', leaving.user.id);
      const send = f.call('/support/messages', { token: leaving.token, body: { body: 'are you there', requestId: randomUUID() }, expect: 401 })
        .then(value => ({ value }), error => ({ error }));
      let parked = false;
      for (const started = Date.now(); !parked && Date.now() - started < 3000; await new Promise(done => setTimeout(done, 10))) {
        await f.db.one('SELECT pg_stat_clear_snapshot()'); // activity stats are cached per transaction: read them fresh each time
        parked = (await f.db.one(`SELECT COUNT(*) n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FOR KEY SHARE%'
          AND query LIKE '%deleted-%'`)).n > 0;
      }
      await f.db.run('UPDATE users SET phone = ? WHERE id = ?', `deleted-${leaving.user.id}`, leaving.user.id);
      await f.db.exec('COMMIT');
      const outcome = await send;
      if (outcome.error) throw outcome.error;
      assert.ok(parked, 'the send waited on the user row lock');
    } catch (error) { if (f.db.inTransaction) await f.db.exec('ROLLBACK'); throw error; }
  });
  assert.equal((await f.db.one('SELECT COUNT(*) n FROM support_messages WHERE sender_id = ?', leaving.user.id)).n, 0);
  assert.equal((await f.db.one('SELECT COUNT(*) n FROM support_threads WHERE user_id = ?', leaving.user.id)).n, 0);

  console.log(`pg-support-inbox: scopes, racing first messages and replies, close vs message (${refused} refused, ${reopened} new), reply vs message ok`);
} finally {
  await f.close();
}
