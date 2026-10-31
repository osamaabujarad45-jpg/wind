import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newBooking, orderRequest, pendingKey, pendingOutcome, pendingReleasable, readBooking, SETTLE_MS } from '../src/booking.ts';

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
  // The order this command created: the fields the server echoes, created after the command was stored.
  const booked = (overrides = {}) => ({ id: 701, service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
    pickupPoint: null, dropoffPoint: null, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599123456', detail: 'Box',
    option: 'small', loadingHelp: false, price: 48, scheduledFor: null, recipientPhone: null,
    createdAt: command.sentAt + 4_000, ...overrides });
  const found = pendingOutcome(command, [booked()]);
  assert.deepEqual(found, { state: 'present', orderId: 701 });
  assert.equal(pendingReleasable(found), false); // an existing order is never discarded or edited away
  // A lost answer is never an absence: the server may still be routing the command it received.
  const fresh = pendingOutcome(command, [], command.sentAt + 1_000);
  assert.deepEqual(fresh, { state: 'unknown' });
  assert.equal(pendingReleasable(fresh), false);
  assert.equal(pendingReleasable(null), false);
  // A retry restarts the wait: the last attempt, not the first save, decides when absence is trustworthy.
  assert.equal(pendingOutcome({ ...command, attemptedAt: command.sentAt + SETTLE_MS }, [], command.sentAt + SETTLE_MS + 1).state, 'unknown');
  // Only the customer's own list, read after the create can no longer be committing, confirms the absence.
  const absent = pendingOutcome(command, [], command.sentAt + SETTLE_MS + 1);
  assert.deepEqual(absent, { state: 'absent' });
  assert.equal(pendingReleasable(absent), true);
  // A similar older order is not this command's order.
  assert.equal(pendingOutcome(command, [booked({ id: 700, createdAt: command.sentAt - 60 * 60_000 })], command.sentAt + SETTLE_MS + 1).state, 'absent');
  // Neither is a same-day order whose terms differ.
  assert.equal(pendingOutcome(command, [booked({ price: 49 })], command.sentAt + SETTLE_MS + 1).state, 'absent');
  // No trap: every confirmed absence unlocks editing, whatever the payload.
  for (const variant of [command, newBooking({ ...payload, promoCode: 'WELCOME10', expectedDiscount: 10 }),
    newBooking({ ...payload, scheduledFor: command.sentAt + 3_600_000 })]) {
    const answer = pendingOutcome(variant, [], variant.sentAt + SETTLE_MS + 1);
    assert.equal(answer.state, 'absent');
    assert.equal(pendingReleasable(answer), true);
  }
  console.log('Pending booking recovery checks passed: account isolation, replay identity and confirmed-absence release');

  const admin = await call('/auth/register', { phone: '0599111000', name: 'Admin', password: 'secret1' });
  await promote('0599111000');
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
