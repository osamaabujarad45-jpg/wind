import assert from 'node:assert/strict';
import { deliverDriverFix } from '../src/location-delivery.ts';
const now = Date.now();
const fix = { timestamp: now, coords: { latitude: 32, longitude: 35, heading: -1, accuracy: 8000 } };
const original = { id: 'delivery', token: 'driver-token', actor: 2, orderId: 1 };
function harness() {
  let context = { ...original }, token = original.token, receipt = null;
  const posts = [], stops = [];
  const io = { context: async () => context, token: async () => token, receipt: async () => receipt,
    post: async (key, body) => { posts.push({ key, body }); return 200; },
    acknowledge: async value => { receipt = value; }, stop: async id => { stops.push(id); context = null; } };
  return { io, posts, stops, setContext: value => { context = value; }, setToken: value => { token = value; }, receipt: () => receipt };
}
{
  const h = harness(); await deliverDriverFix(fix, h.io, now);
  assert.deepEqual(h.posts, [{ key: original.token, body: { latitude: 32, longitude: 35, age: 0 } }]);
  assert.equal(h.receipt().lastSentAt, now);
  await deliverDriverFix(fix, h.io, now + 1); assert.equal(h.posts.length, 1, 'duplicate cached fix cannot refresh freshness');
  await deliverDriverFix({ ...fix, timestamp: now + 20_000 }, h.io, now + 20_000);
  assert.equal(h.posts.length, 2, 'stationary but newly measured coordinates do refresh freshness');
}
{
  // Overlapping task callbacks: one upload per measurement, and an older fix never follows a newer one.
  const h = harness(); const late = { ...fix, timestamp: now + 1_000 };
  await Promise.all([deliverDriverFix(late, h.io, now + 1_000), deliverDriverFix(late, h.io, now + 1_000), deliverDriverFix(fix, h.io, now + 1_000)]);
  assert.equal(h.posts.length, 1); assert.equal(h.receipt().fixAt, now + 1_000);
}
for (const invalid of [{ ...fix, timestamp: now - 60_001 }, { ...fix, timestamp: now + 6_000 },
  { ...fix, coords: { latitude: NaN, longitude: 35 } }, { ...fix, coords: { latitude: 32, longitude: 181 } }]) {
  const h = harness(); await deliverDriverFix(invalid, h.io, now); assert.equal(h.posts.length, 0);
}
{
  const h = harness(); h.setContext(null); await deliverDriverFix(fix, h.io, now); assert.equal(h.posts.length, 0);
}
{
  const h = harness(); h.setToken('new-session'); await deliverDriverFix(fix, h.io, now);
  assert.equal(h.posts.length, 0); assert.deepEqual(h.stops, ['delivery']);
}
for (const status of [401, 403, 409]) {
  const h = harness(); h.io.post = async () => status; await deliverDriverFix(fix, h.io, now);
  assert.deepEqual(h.stops, ['delivery']); assert.equal(h.receipt(), null);
}
{
  const h = harness(); h.io.post = async () => { throw new Error('offline'); };
  await deliverDriverFix(fix, h.io, now); assert.equal(h.receipt().failed, true); assert.equal(h.receipt().lastSentAt, 0);
  h.io.post = async () => 200; await deliverDriverFix({ ...fix, timestamp: now + 20_000 }, h.io, now + 20_000);
  assert.equal(h.receipt().failed, undefined);
}
{
  const h = harness(); h.io.post = async () => { h.setContext({ ...original, id: 'next-delivery' }); return 200; };
  await deliverDriverFix(fix, h.io, now); assert.equal(h.receipt(), null, 'late ACK cannot update a replacement delivery');
}
{
  const h = harness(); let reads = 0;
  h.io.context = async () => ++reads === 1 ? original : null;
  await deliverDriverFix(fix, h.io, now); assert.equal(h.posts.length, 0, 'logout during secure-storage reads prevents upload');
}
console.log('PASS background location authority, freshness, stationary updates, expiry, retry and late callbacks');
