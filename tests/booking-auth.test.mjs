import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newBooking, orderRequest, pendingKey, pendingOutcome, pendingReleasable, readBooking } from '../src/booking.ts';

const dir = mkdtempSync(join(tmpdir(), 'wind-booking-auth-'));
let routeStarted, finishRoute;
const osrm = createServer((_req, res) => {
  finishRoute = () => res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 20000, duration: 1800,
    geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] }));
  routeStarted();
});
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, db, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function call(path, body, token, expected = 200, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
try {
  const bookSource = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8');
  assert.ok(bookSource.includes('storage.get(savedKey, true)'),
    'pending-booking restoration must require storage access: a blocked read is not an empty receipt slot');
  // T19: a pending command is account-scoped, replayable with its first identity, and releasable only on a
  // server-confirmed absence.
  const payload = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599123456', detail: 'Box', option: 'small',
    loadingHelp: false, shared: false, quotedPrice: 48 };
  const command = newBooking(payload);
  // Another account on the same device has its own slot and sees nothing of this payload.
  assert.notEqual(pendingKey(101), pendingKey(102));
  const device = new Map([[pendingKey(101), JSON.stringify(command)]]);
  const reloaded = readBooking(device.get(pendingKey(101)) ?? null);
  assert.deepEqual(reloaded, command); // restart keeps the same command and terms
  assert.equal(device.get(pendingKey(102)) ?? null, null);
  // Retry reuses the stored identity even after a restart and another attempt; it never mints a second one.
  assert.equal(orderRequest(reloaded).requestId, command.requestId);
  assert.deepEqual(orderRequest({ ...reloaded, attemptedAt: Date.now() }), orderRequest(command));
  // The server receipt is authoritative even when the order's price/destination has changed.
  const found = pendingOutcome({ orderId: 701 });
  assert.deepEqual(found, { state: 'present', orderId: 701 });
  assert.equal(pendingReleasable(found), false); // an existing order is never discarded or edited away
  // A missing receipt cannot prove absence: a delayed original POST could still commit.
  for (const receipt of [{ orderId: null }, null, {}, { orderId: '701' }, { orderId: 0 }, { orderId: -1 }, { orderId: 1.5 }, []]) {
    assert.deepEqual(pendingOutcome(receipt), { state: 'unknown' });
    assert.equal(pendingReleasable(pendingOutcome(receipt)), false);
  }
  assert.equal(pendingReleasable(null), false);
  // Past the command's own deadline the server refuses it, so a missing receipt is a real absence and the form unlocks.
  const deadline = command.commandExpiresAt;
  assert.ok(Number.isSafeInteger(deadline) && orderRequest(command).commandExpiresAt === deadline, 'every attempt carries the same deadline');
  assert.deepEqual(pendingOutcome({ orderId: null }, command, deadline + 29_000), { state: 'unknown' }, 'a POST may still be in flight just after the deadline');
  assert.deepEqual(pendingOutcome({ orderId: null }, command, deadline + 31_000), { state: 'absent' });
  assert.equal(pendingReleasable(pendingOutcome(null, command, deadline + 31_000)), true);
  assert.deepEqual(pendingOutcome({ orderId: 701 }, command, deadline + 31_000), { state: 'present', orderId: 701 }, 'a receipt always wins');
  assert.deepEqual(pendingOutcome({ orderId: null }, {}, Number.MAX_SAFE_INTEGER), { state: 'unknown' }, 'records saved before deadlines existed stay unknown');
  assert.ok(bookSource.includes('/orders/commands/${encodeURIComponent(command.requestId)}'), 'recovery queries the exact command receipt');
  console.log('Pending booking recovery checks passed: account isolation, replay identity, authoritative receipt and command deadline');

  const admin = await call('/auth/register', { phone: '0599111000', name: 'Admin', password: 'secret1' });
  await promote('0599111000');
  const owner = await call('/auth/register', { phone: '0599111090', name: 'Receipt owner', password: 'secret1' });
  const other = await call('/auth/register', { phone: '0599111091', name: 'Other customer', password: 'secret1' });
  const driver = await call('/auth/register', { phone: '0599111092', name: 'Driver', password: 'secret1', registrationRole: 'driver', vehicle: 'bicycle' });
  const requestId = randomUUID();
  const created = await call('/orders', { ...payload, quotedPrice: 20, contact: owner.user.phone, requestId }, owner.token);
  // Matching details on a separate order, and changed details on this order, do not affect identity.
  await call('/orders', { ...payload, quotedPrice: 20, contact: owner.user.phone, requestId: randomUUID() }, owner.token);
  db.prepare('UPDATE orders SET price = ?, dropoff_note = ? WHERE id = ?').run(35, 'Changed landmark', created.id);
  const receiptPath = `/orders/commands/${requestId}`;
  assert.deepEqual(await call(receiptPath, undefined, owner.token, 200, 'GET'), { orderId: created.id });
  assert.deepEqual(await call(receiptPath, undefined, other.token, 200, 'GET'), { orderId: null });
  await call(receiptPath, undefined, driver.token, 403, 'GET');
  await call('/orders/commands/not-a-uuid', undefined, owner.token, 400, 'GET');
  await call(receiptPath, undefined, undefined, 401, 'GET');
  // The server enforces the deadline for new commits only: an expired new command is refused and leaves no receipt,
  // a committed command still replays after its deadline, and a deadline beyond the allowed lifetime is invalid.
  const booking = { ...payload, quotedPrice: 20, contact: owner.user.phone };
  const late = randomUUID();
  assert.equal((await call('/orders', { ...booking, requestId: late, commandExpiresAt: Date.now() - 1_000 }, owner.token, 409)).error, 'booking_command_expired');
  assert.deepEqual(await call(`/orders/commands/${late}`, undefined, owner.token, 200, 'GET'), { orderId: null });
  const kept = { ...booking, requestId: randomUUID(), commandExpiresAt: Date.now() + 60_000 };
  const committed = await call('/orders', kept, owner.token);
  assert.equal((await call('/orders', { ...kept, commandExpiresAt: Date.now() - 1_000 }, owner.token)).id, committed.id);
  assert.equal((await call('/orders', { ...booking, requestId: randomUUID(), commandExpiresAt: Date.now() + 11 * 60_000 }, owner.token, 400)).error, 'invalid_command_deadline');
  let index = 0;
  for (const command of [false, true]) for (const change of ['logout', 'block', 'role', 'delete']) {
    const customer = await call('/auth/register', { phone: `059911100${++index}`, name: 'Customer', password: 'secret1' });
    const started = new Promise(resolve => { routeStarted = resolve; });
    const body = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
      pickupNote: 'Gate', dropoffNote: 'Door', contact: customer.user.phone, detail: 'Box', pricing: 'smart',
      pickupPoint: { latitude: 31.9 + index / 1000, longitude: 35.2 }, ...(command && { requestId: randomUUID() }) };
    const booking = call('/orders', body, customer.token, 401);
    await started;
    if (change === 'logout') await call('/auth/logout', {}, customer.token);
    else if (change === 'delete') await call(`/admin/users/${customer.user.id}`, undefined, admin.token, 200, 'DELETE');
    else await call(`/admin/users/${customer.user.id}`, change === 'block' ? { status: 'blocked' } : { role: 'driver' }, admin.token);
    finishRoute();
    await booking;
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?').get(customer.user.id).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_commands WHERE user_id = ?').get(customer.user.id).n, 0);
  }
  console.log('Booking authority checks passed: logout, block, role change and deletion during routing, with and without command IDs');
} finally {
  finishRoute?.();
  await shutdown();
  await new Promise(resolve => osrm.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
