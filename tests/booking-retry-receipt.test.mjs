import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newBooking, orderRequest, pendingOutcome } from '../src/booking.ts';

const dir = mkdtempSync(join(tmpdir(), 'wind-booking-retry-'));
let arrived, release;
const osrm = createServer((_req, res) => {
  release = () => res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 20000, duration: 1800,
    geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] }));
  arrived();
});
const bounded = async (promise, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 15_000); })]); }
  finally { clearTimeout(timer); }
};
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function call(path, body, token, expected = 200, method = 'POST') {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(body !== undefined && { body: JSON.stringify(body) }) });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
try {
  console.log('Booking retry: starting isolated server scenarios');
  const admin = await call('/auth/register', { phone: '0599222000', name: 'Admin', password: 'secret1' });
  await promote('0599222000');
  const owner = await call('/auth/register', { phone: '0599222001', name: 'Customer', password: 'secret1' });
  const payload = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', detail: 'Box', contact: owner.user.phone,
    pickupPoint: { latitude: 31.906, longitude: 35.2 }, loadingHelp: false, quotedPrice: 20, pricing: 'smart' };
  const command = newBooking(payload), body = orderRequest(command);
  const started = new Promise(resolve => { arrived = resolve; });
  const original = call('/orders', body, owner.token, 401);
  // Observe failures immediately even if the routing-arrival wait fails first.
  void original.catch(() => {});
  await bounded(started, 'original POST reaches uncached routing');
  console.log('Booking retry: original POST held at routing');
  await call(`/admin/users/${owner.user.id}`, { status: 'pending' }, admin.token);
  assert.equal((await call('/orders', body, owner.token, 401)).error, 'unauthorized');
  const receipt = `/orders/commands/${command.requestId}`;
  await call(`/admin/users/${owner.user.id}`, { status: 'active' }, admin.token);
  release();
  assert.equal((await bounded(original, 'original POST rechecks revoked authority')).error, 'unauthorized');
  const active = await call('/auth/login', { identifier: owner.user.phone, password: 'secret1' });
  assert.deepEqual(await call(receipt, undefined, active.token, 200, 'GET'), { orderId: null });
  console.log('PASS: administrator status changes revoke both attempts; the held original cannot commit');

  const committedCommand = newBooking({ ...payload, pricing: undefined }), committedBody = orderRequest(committedCommand);
  const committed = await call('/orders', committedBody, active.token);
  const committedReceipt = `/orders/commands/${committedCommand.requestId}`;
  await call(`/orders/${committed.id}/cancel`, {}, active.token);

  await call(`/admin/users/${owner.user.id}`, { status: 'pending' }, admin.token);
  const pending = await call('/auth/login', { identifier: owner.user.phone, password: 'secret1' });
  assert.equal((await call('/orders', committedBody, pending.token, 403)).error, 'pending_approval');
  assert.deepEqual(await call(committedReceipt, undefined, pending.token, 200, 'GET'), { orderId: committed.id });
  assert.deepEqual(pendingOutcome({ orderId: committed.id }, committedCommand), { state: 'present', orderId: committed.id });
  console.log('PASS: a committed command can receive 403 while its read-only receipt remains authoritative');
  await call(`/admin/users/${owner.user.id}`, { status: 'active' }, admin.token);
  const restored = await call('/auth/login', { identifier: owner.user.phone, password: 'secret1' });
  assert.equal((await call('/orders', { ...committedBody, commandExpiresAt: Date.now() - 1_000 }, restored.token)).id, committed.id);
  console.log('PASS: expired committed commands still replay without a new order');

  let searching;
  for (let n = 0; n < 5; n++) searching = await call('/orders', { ...committedBody, requestId: newBooking(payload).requestId }, restored.token);
  const refused = newBooking({ ...payload, pricing: undefined });
  assert.equal((await call('/orders', orderRequest(refused), restored.token, 409)).error, 'too_many_searching');
  assert.deepEqual(await call(`/orders/commands/${refused.requestId}`, undefined, restored.token, 200, 'GET'), { orderId: null });
  assert.equal(pendingOutcome({ orderId: null }, refused).state, 'unknown');
  await call(`/orders/${searching.id}/cancel`, {}, restored.token);
  const retried = await call('/orders', orderRequest(refused), restored.token);
  assert.deepEqual(await call(`/orders/commands/${refused.requestId}`, undefined, restored.token, 200, 'GET'), { orderId: retried.id });
  console.log('PASS: searching-cap refusal is recoverable using the same command once capacity frees');
} finally {
  release?.();
  await shutdown();
  osrm.closeAllConnections();
  await new Promise(resolve => osrm.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
