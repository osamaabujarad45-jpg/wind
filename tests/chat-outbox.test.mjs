import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { delivered, MAX_UNSENT, outboxKey, outboxStore, queue, readOutbox, sendText, undeliverable, UNSENT_TTL_MS, without } from '../src/chat-outbox.ts';
import { copy } from '../src/copy.ts';

// Unsent chat texts survive a lost reply and a restart with the id they were first sent with, so a resend is replayed
// by the server, never posted twice; nothing is dropped silently.
const order = 7;
let { list, entry: a } = queue([], order, 'On my way', 1_000, 40);
({ list } = queue(list, order, 'Gate 2', 2_000, 41));
assert.equal(queue(list, order, 'On my way', 3_000, 41).entry.requestId, a.requestId, 'an unsent text sent again retries the same entry');
assert.notEqual(queue(list, 8, 'On my way', 3_000, 41).entry.requestId, a.requestId, 'the same words in another order are another message');
assert.deepEqual(readOutbox(JSON.parse(JSON.stringify(list)), 5_000), list, 'what is saved reads back the same');
assert.deepEqual(readOutbox(list, 1_000 + UNSENT_TTL_MS), [{ ...list[1] }].filter(u => 1_000 + UNSENT_TTL_MS - u.at < UNSENT_TTL_MS), 'a day-old text is pruned');
assert.deepEqual(readOutbox('nope', 0), []);
assert.deepEqual(readOutbox([{ requestId: 'x', orderId: 7, body: 'a', at: 1, afterId: null }, null], 2), [], 'damaged entries never block the chat');
// A full outbox refuses the new text instead of evicting an old one.
let many = [];
for (let i = 0; i < MAX_UNSENT; i++) many = queue(many, order, `m${i}`, i, null).list;
assert.equal(queue(many, order, 'one more', 9, null), null);
assert.equal(outboxKey(4), 'chatOutbox.4');

// Delivery is inferred only from a message newer than everything on screen when the text was queued.
const sentEarlier = { id: 40, mine: true, body: 'On my way' };
assert.deepEqual(delivered(list, order, [sentEarlier]), [], 'the same words sent and delivered earlier never clear a new unsent copy');
assert.deepEqual(delivered(list, order, [sentEarlier, { id: 42, mine: true, body: 'On my way' }]).map(u => u.body), ['On my way']);
assert.deepEqual(delivered(list, order, [{ id: 99, mine: false, body: 'Gate 2' }]), [], 'the other side typing the same words is not mine');
assert.deepEqual(delivered([{ ...a, afterId: null }], order, [{ id: 99, mine: true, body: 'On my way' }]), [], 'no history on screen: left for a resend');

// Only a refusal of the message itself drops it; a lost reply, a timeout or a session problem keeps it.
for (const status of [400, 403, 404, 409]) assert.equal(undeliverable({ status }), true, String(status));
for (const status of [undefined, 0, 401, 408, 429, 500, 503]) assert.equal(undeliverable({ status }), false, String(status));

// sendText: saved before the request, cleared on success, kept on a lost reply, dropped (and reported) on a refusal.
const failing = status => async () => { throw Object.assign(new Error('x'), { status }); };
const run = async (post, { durable = true, start = [] } = {}) => {
  const saves = [];
  const outcome = await sendText({ list: start, orderId: order, body: 'Hello', now: 10, afterId: 5,
    save: async l => { saves.push(l.map(u => u.body)); return durable; }, post });
  return { outcome, saves };
};
{ let seen; const { outcome, saves } = await run(async entry => { seen = entry; return ['reply']; });
  assert.equal(outcome.state, 'sent'); assert.deepEqual(outcome.reply, ['reply']);
  assert.deepEqual(saves, [['Hello'], []], 'saved before the request, cleared after it');
  assert.equal(seen.body, 'Hello'); }
{ const { outcome, saves } = await run(failing(undefined));
  assert.equal(outcome.state, 'unsent'); assert.equal(outcome.durable, true); assert.deepEqual(outcome.list.map(u => u.body), ['Hello']);
  assert.deepEqual(saves, [['Hello']], 'a lost reply keeps the saved text'); }
{ const { outcome } = await run(failing(503), { durable: false });
  assert.equal(outcome.durable, false, 'the screen keeps the draft when the text is only in memory'); }
{ const { outcome, saves } = await run(failing(409));
  assert.equal(outcome.state, 'refused'); assert.deepEqual(outcome.list, []); assert.deepEqual(saves, [['Hello'], []]); }
{ const { outcome } = await run(async () => [], { start: many });
  assert.equal(outcome.state, 'full'); }

// The store never writes over a record it could not read, and writes in order.
{ const writes = [];
  const broken = outboxStore({ read: async () => { throw new Error('locked'); }, write: async v => { writes.push(v); } }, () => 0);
  await broken.load();
  assert.equal(await broken.save([a]), false, 'unread record: memory only');
  assert.deepEqual(writes, []);
  const store = outboxStore({ read: async () => JSON.stringify([a]), write: async v => { await new Promise(r => setTimeout(r, v ? 5 : 0)); writes.push(v); } }, () => 2_000);
  assert.deepEqual((await store.load()).map(u => u.body), ['On my way']);
  const first = store.save([a, list[1]]), second = store.save([]);
  assert.deepEqual([await first, await second], [true, true]);
  assert.deepEqual(writes.map(w => w && JSON.parse(w).length), [2, null], 'the later write lands last');
  assert.deepEqual(without(list, a.requestId).map(u => u.body), ['Gate 2']); }

for (const language of ['ar', 'en']) for (const key of ['chatNotSent', 'chatResend', 'chatDiscard', 'chatDiscardConfirm', 'chatOutboxFull'])
  assert.ok(copy[language][key]?.trim(), `${language} ${key}`);
// The screen wires the module: one slot per account (cleared on chosen sign-out), confirmed discard, no grouped bubble.
const screen = readFileSync(new URL('../src/app/order/[id].tsx', import.meta.url), 'utf8');
assert.match(screen, /sendText\(\{ list: outbox\.current/);
assert.match(screen, /<Chat key=\{me\?\.user\.id \?\? 0\}/);
assert.match(screen, /confirm\(c\.chatDiscardConfirm/);
assert.doesNotMatch(screen, /styles\.unsent[^>]*accessible/, 'Resend and Discard stay reachable by screen readers');
assert.match(readFileSync(new URL('../src/session.tsx', import.meta.url), 'utf8'), /if \(revoke && signedInUser\.current\) await storage\.set\(outboxKey/);
console.log('PASS: unsent chat texts survive a restart, resend with their first id, and are never dropped silently');
