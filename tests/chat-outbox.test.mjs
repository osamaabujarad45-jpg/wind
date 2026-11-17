import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { delivered, MAX_UNSENT, outboxKey, queue, readOutbox, undeliverable, without } from '../src/chat-outbox.ts';
import { copy } from '../src/copy.ts';

// Unsent chat texts survive a restart with the id they were first sent with, so a resend is replayed, never posted twice.
let { list, entry: a } = queue([], 'On my way', 1_000);
({ list } = queue(list, 'Gate 2', 2_000));
assert.equal(queue(list, 'On my way', 3_000).entry.requestId, a.requestId, 'the same unsent text keeps its first id');
assert.equal(queue(list, 'On my way', 3_000).list, list, 'and is not queued twice');
assert.deepEqual(readOutbox(JSON.parse(JSON.stringify(list))), list, 'what is saved reads back the same');
assert.deepEqual(without(list, a.requestId).map(u => u.body), ['Gate 2']);
assert.notEqual(queue(without(list, a.requestId), 'On my way', 4_000).entry.requestId, a.requestId, 'sent text again is a new message');
// Damaged records never block the chat; the list stays small for SecureStore.
assert.deepEqual(readOutbox('nope'), []);
assert.deepEqual(readOutbox([{ requestId: 'x', body: 'a', at: 1 }, null, { ...a, body: ' ' }]), []);
let many = [];
for (let i = 0; i < 9; i++) many = queue(many, `m${i}`, i).list;
assert.equal(many.length, MAX_UNSENT);
assert.equal(outboxKey(4, 12), 'chatOutbox.4.12');
// Only a refusal of the message itself drops it; a lost reply, a timeout or a session problem keeps it for a resend.
for (const status of [400, 403, 404, 409]) assert.equal(undeliverable({ status }), true, String(status));
for (const status of [undefined, 0, 401, 408, 429, 500, 503]) assert.equal(undeliverable({ status }), false, String(status));
// A text the server already lists as mine (sent after it was queued) was delivered although its reply was lost.
assert.deepEqual(delivered(list, [{ mine: true, body: 'Gate 2', createdAt: 2_500 }]).map(u => u.body), ['Gate 2']);
assert.deepEqual(delivered(list, [{ mine: false, body: 'Gate 2', createdAt: 2_500 }]), [], 'the other side typing the same words is not mine');
assert.deepEqual(delivered(list, [{ mine: true, body: 'Gate 2', createdAt: 2_000 - 6 * 60_000 }]), [], 'an older identical message is not this one');
for (const language of ['ar', 'en']) for (const key of ['chatNotSent', 'chatResend', 'chatDiscard']) assert.ok(copy[language][key]?.trim(), `${language} ${key}`);
// The screen sends the saved entry's own id and keeps unsent texts in the account's slot.
const screen = readFileSync(new URL('../src/app/order/[id].tsx', import.meta.url), 'utf8');
assert.match(screen, /requestId: entry\.requestId/);
assert.match(screen, /storage\.set\(key, list\.length \? JSON\.stringify\(list\) : null\)/);
console.log('PASS: unsent chat texts survive a restart and resend with their first id');
