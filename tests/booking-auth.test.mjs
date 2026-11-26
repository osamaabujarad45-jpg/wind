import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newBooking, orderRequest, pendingKey, pendingOutcome, pendingReleasable, readBooking } from '../src/booking.ts';

// PostgreSQL leg. server/main.ts is a singleton bound to one database for the life of the process, so the
// PostgreSQL scenario runs in a child that re-executes this file with WIND_BOOKING_AUTH_PG=1 and the PostgreSQL
// runtime selected, before main.ts is imported. The SQLite flow below never runs in that child.
//
// A booking that has passed its last authority check and is parked on routing (inside its own transaction, on
// PostgreSQL's READ COMMITTED) must not write the customer's personal data once the account has been deleted:
// deleteAccount scrubs the order rows that exist at that moment, so an order inserted afterwards would survive
// erasure with its contact, notes and pins in clear text.
async function postgresBookingPausedAfterAuthorize() {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const { freshPostgres, selectRuntime } = await import('./pg-support.mjs');
  const fresh = await freshPostgres('booking_auth');
  await fresh.database.close();
  selectRuntime(fresh.schema);
  const home = mkdtempSync(join(tmpdir(), 'wind-booking-auth-pg-'));
  const answer = { code: 'Ok', routes: [{ distance: 20000, duration: 1800, geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] };
  let hold = false;
  const parked = [];
  const router = createServer((_req, res) => { if (hold) parked.push(() => res.end(JSON.stringify(answer))); else res.end(JSON.stringify(answer)); });
  await new Promise(resolve => router.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { OSRM_URL: `http://127.0.0.1:${router.address().port}`, DB_PATH: join(home, 'local.db'), WIND_ENABLED_SERVICES: 'parcel' });
  const { server, persistence, shutdown } = await import('../server/main.ts');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const send = async (path, body, token) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const ok = async (...args) => { const result = await send(...args); assert.equal(result.status, 200, `${args[0]}: ${JSON.stringify(result.data)}`); return result.data; };
  try {
    let index = 0;
    for (const withCommand of [false, true]) {
      index += 1;
      const password = 'secret123', phone = `059912210${index}`;
      const customer = await ok('/auth/register', { phone, name: 'Deleted mid-booking', password });
      const id = customer.user.id;
      const trip = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
        pickupNote: 'Private gate note', dropoffNote: 'Private door note', contact: phone, detail: 'Private parcel detail' };
      const quote = await ok('/price', trip, customer.token); // routes the city centres ungated, so the pinned booking below is a fresh route fetch
      const booking = { ...trip, quoteId: quote.quoteId, pickupPoint: { latitude: 31.9 + index / 1000, longitude: 35.2 }, ...(withCommand && { requestId: randomUUID() }) };
      hold = true;
      const booked = send('/orders', booking, customer.token); // parks inside its transaction, after authorize, on the route request
      for (let i = 0; i < 400 && parked.length === 0; i += 1) await sleep(5);
      assert.ok(parked.length > 0, 'the booking never reached routing, so it was not paused after its final authorize');
      hold = false;
      // The customer erases their account while the booking is parked. A defence that holds the account until the
      // booking finishes may make this wait or be refused: it must settle either way, so do not wait for it forever.
      const erasing = send('/me/delete', { password }, customer.token);
      await Promise.race([erasing, sleep(3_000)]);
      parked.splice(0).forEach(release => release());
      const bookResult = await booked, eraseResult = await erasing;
      const account = await persistence.one('SELECT status, phone FROM users WHERE id = ?', id);
      const erased = account.status === 'blocked' && account.phone === `deleted-${id}`;
      const orders = await persistence.all('SELECT id, contact, pickup_note, dropoff_note, detail FROM orders WHERE customer_id = ?', id);
      const commands = await persistence.one('SELECT COUNT(*) AS n FROM order_commands WHERE user_id = ?', id);
      const label = `${withCommand ? 'with' : 'without'} a command id`;
      if (erased) {
        assert.equal(eraseResult.status, 200, `${label}: ${JSON.stringify(eraseResult.data)}`);
        assert.deepEqual(orders, [], `${label}: a booking paused after its final authorize inserted an order for an erased account (personal data after erasure): ${JSON.stringify(orders)}`);
        assert.equal(Number(commands.n), 0, `${label}: no booking command may remain for an erased account`);
        assert.ok(bookResult.status >= 400 && bookResult.status < 500, `${label}: the booking must be refused as a client error, got ${bookResult.status} ${JSON.stringify(bookResult.data)}`);
      } else {
        // The only other safe outcome: the booking won and the erasure was refused; the account is intact then.
        assert.equal(bookResult.status, 200, `${label}: the account was not erased, so the booking must have completed: ${JSON.stringify(bookResult.data)}`);
        assert.notEqual(eraseResult.status, 200, `${label}: an erasure answered 200 but the account is not erased`);
      }
    }
    console.log('Booking authority checks passed on PostgreSQL: account deletion while a booking is paused after its final authorize, with and without command IDs');
  } finally {
    parked.splice(0).forEach(release => release());
    await shutdown();
    await new Promise(resolve => router.close(resolve));
    rmSync(home, { recursive: true, force: true });
  }
}
if (process.env.WIND_BOOKING_AUTH_PG === '1') {
  try { await postgresBookingPausedAfterAuthorize(); process.exit(0); }
  catch (error) { console.error(error); process.exit(1); }
}

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
const { server, db, promote, shutdown, persistence } = await import('../server/main.ts');
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
  assert.ok(bookSource.includes('/orders/commands/${encodeURIComponent(command.requestId)}'), 'recovery queries the exact command receipt');
  console.log('Pending booking recovery checks passed: account isolation, replay identity and authoritative receipt');

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

  // SQLite has no advisory lock: both retries pass the first receipt read before either write begins.
  {
    const retryBody = { ...payload, quotedPrice: 20, contact: owner.user.phone, requestId: randomUUID() };
    const originalOne = persistence.one.bind(persistence);
    let reads = 0, release;
    const bothRead = new Promise(resolve => { release = resolve; });
    persistence.one = async function(sql, ...params) {
      const row = await originalOne(sql, ...params);
      if (sql.startsWith('SELECT * FROM order_commands WHERE user_id = ? AND request_id = ?')) {
        if (++reads === 2) release();
        await bothRead;
      }
      return row;
    };
    const attempt = () => fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: JSON.stringify(retryBody) })
      .then(async response => ({ status: response.status, data: await response.json() }));
    let a, b;
    try {
      const first = attempt(), second = attempt();
      await bothRead;
      [a, b] = await Promise.all([first, second]);
    } finally { persistence.one = originalOne; }
    assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(b.status, 200, JSON.stringify(b.data));
    assert.equal(a.data.id, b.data.id, 'a committed SQLite retry replays the same order rather than failing its receipt insert');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id = ? AND id = ?').get(owner.user.id, a.data.id).n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM order_commands WHERE user_id = ? AND request_id = ?').get(owner.user.id, retryBody.requestId).n, 1);
  }
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

  // The same authority guarantee on PostgreSQL, where the booking runs in one READ COMMITTED envelope.
  if (!process.env.WIND_TEST_DATABASE_URL) {
    console.log('SKIP PostgreSQL booking authority: WIND_TEST_DATABASE_URL is unset');
  } else {
    const child = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url)],
      { env: { ...process.env, WIND_BOOKING_AUTH_PG: '1' }, encoding: 'utf8', timeout: 120_000 });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    assert.equal(child.status, 0, `the PostgreSQL booking authority scenario failed (exit ${child.status}, signal ${child.signal})`);
  }
} finally {
  finishRoute?.();
  await shutdown();
  await new Promise(resolve => osrm.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
