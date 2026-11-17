import assert from 'node:assert/strict';
import { deliverDriverFix, MIN_GAP } from '../src/location-delivery.ts';

// The rare exits of the driver GPS upload (src/location-delivery.ts): every one must stay silent, never post a
// stale or foreign fix, and never wedge the queue for the next background callback.
const now = 1_800_000_000_000;
const fix = { timestamp: now - 1_000, coords: { latitude: 32.3125, longitude: 35.048, accuracy: 6 } };
const ctx = { id: 'track-1', token: 'token-1', actor: 2, orderId: 5 };
function harness({ contexts = [], receipt = null, reserve, context = ctx } = {}) {
  const posts = [], stops = [], acks = [];
  let calls = 0;
  const io = {
    context: async () => contexts[calls++] ?? context,
    token: async () => context.token,
    receipt: async () => receipt,
    post: async (_token, body) => { posts.push(body); return { status: 200, accepted: true }; },
    acknowledge: async r => { acks.push(r); receipt = r; },
    stop: async id => { stops.push(id); },
    monotonic: () => now,
    ...(reserve && { reserve }),
  };
  return { io, posts, stops, acks };
}

// A receipt written before lastTriedAt existed: its lastSentAt still spaces uploads after an app restart.
let h = harness({ receipt: { id: ctx.id, lastSentAt: now - MIN_GAP / 2, fixAt: now - 5_000 } });
await deliverDriverFix(fix, h.io, now);
assert.equal(h.posts.length, 0, 'a legacy receipt sent a moment ago holds the next upload');
h = harness({ receipt: { id: ctx.id, lastSentAt: now - 20_000, fixAt: now - 20_000 } });
await deliverDriverFix(fix, h.io, now);
assert.equal(h.posts.length, 1, 'a legacy receipt past the cadence lets the fresh fix through');
assert.equal(h.posts[0].age, 1_000, 'the upload carries the fix age, not a phone clock time');

// The account or job changed while the attempt was being recorded: nothing is posted for the old one.
const other = { ...ctx, id: 'track-2' };
h = harness({ contexts: [ctx, ctx, other] });
await deliverDriverFix(fix, h.io, now);
assert.deepEqual([h.posts.length, h.stops.length], [0, 0], 'a context switch after the attempt receipt posts nothing');

// Active-job GPS: no session reservation means no upload; a switch after reserving is fenced too.
const active = { ...ctx, activeGps: { deviceId: 'd', sessionId: 's', seq: 1, assignments: [{ orderId: 5, assignmentEpoch: 1 }] } };
h = harness({ context: active, reserve: async () => null });
await deliverDriverFix(fix, h.io, now);
assert.equal(h.posts.length, 0, 'a refused active-GPS reservation never uploads');
h = harness({ context: active, contexts: [active, active, active, { ...active, id: 'track-3' }], reserve: async () => active.activeGps });
await deliverDriverFix(fix, h.io, now);
assert.equal(h.posts.length, 0, 'a switch after reserving is fenced before the upload');
h = harness({ context: active, reserve: async () => active.activeGps });
await deliverDriverFix(fix, h.io, now);
assert.deepEqual(h.posts[0].activeGps, active.activeGps, 'a reserved session rides with the fix');

// A callback that throws must not wedge the queue: the next background fix still runs.
await assert.rejects(deliverDriverFix(fix, { ...harness().io, context: async () => { throw new Error('storage gone'); } }, now), /storage gone/);
h = harness();
await deliverDriverFix(fix, h.io, now);
assert.equal(h.posts.length, 1, 'the queue recovers after a failed callback');
console.log('PASS driver GPS delivery: legacy receipt cadence, context fences, active-GPS reservation, queue recovery');
