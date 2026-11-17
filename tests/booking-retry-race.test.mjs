// Booking retry race: a lost-answer first POST that commits server-side must not have its persisted
// command cleared by the retry's refusal.
//
// Server-side regression (PostgreSQL, READ COMMITTED): the retry must take the same per-customer
// advisory lock as creation before replaying its command. Otherwise the original can commit at the
// searching cap while the retry reaches quote/cap validation first and loses the saved booking key.
// Client-side contract: post-lock 4xx outcomes, including too_many_searching, never clear that key.
//
// Part A races two identical requests at the cap and requires one fifth order plus a successful replay.
// Part B pins the real catch block, sliced from src/app/book.tsx by markers, and runs everywhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { ApiError, errorCode } = require('../src/api-client.ts');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const flush = () => new Promise(resolve => setImmediate(resolve));

// ------------------------------------------------------------------ Part B: the client contract
// The app is quote-bound: /price always answers with a quoteId, so POST /orders runs the quote branch
// of createOrder. These are the codes that branch can fail with after it has taken the quote lock —
// i.e. while the first attempt could already have committed. A refusal at that point says nothing
// about the outcome of the frozen command, so the device must keep it.
const postLockCodes = ['quote_consumed', 'quote_expired', 'route_prohibited', 'service_unavailable',
  'pooling_unavailable', 'promo_changed', 'promo_used', 'priority_cutoff', 'invalid_schedule', 'too_many_searching'];
// The server provably refused this command itself (a 400 is the payload the device still holds), and a
// transport or 5xx failure never claims a refusal. Deliberately outside this suite: idempotency_conflict
// (today's code keeps it pending, and no fix direction is pinned here), quote_not_found 404 and
// price_changed (the legacy, non-quote path the app never sends).
const clearControls = [['invalid_input', 400]];
const keepControls = [['server_error', 500], ['server_error', 503],
  ['unauthorized', 401], ['request_timeout', 408], ['rate_limited', 429]];

// Slice the real catch block out of src/app/book.tsx so this test cannot drift from the shipped code.
// The slice starts *after* the `} catch (e) {` header: a fragment that begins with a stray `}` makes
// the transpiler synthesize `try { } catch (e) {`, which rebinds `e` and executes nothing.
function catchBody(source) {
  const header = '    } catch (e) {\n      haptic.error();';
  const start = source.indexOf(header);
  assert.ok(start >= 0, 'submit() catch block not found (marker changed?)');
  const end = source.indexOf('    } finally { sending.current = false; setBusy(false); }', start);
  assert.ok(end > start, 'submit() finally marker not found');
  const body = source.slice(start + header.length, end);
  const compiled = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  assert.ok(!/^try\s*\{\s*\}/.test(compiled.trim()), 'the transpiled slice must be plain statements, not a synthesized catch');
  assert.ok(compiled.includes("storage.set(savedKey, null, true)"), 'slice is not the pending-command clear branch');
  assert.ok(!compiled.includes('return'), 'the catch block must not return');
  return compiled.replace(/^\s*["']use strict["'];?\s*\n/, '');
}

/** Run the sliced catch block with recording doubles: `error` is exactly what the api client throws. */
async function runCatch(body, error, saved = true) {
  const sets = [], pending = [], outcome = [], referral = [], reconciled = [];
  const deps = {
    ApiError, errorCode,
    haptic: { success() {}, error() {}, tap() {} },
    c: { bookingOfflineSaved: 'saved', bookingStorageError: 'storage-error' },
    err: e => errorCode(e),
    storage: {
      get: async () => null,
      set: async (key, value) => { sets.push([key, value]); },
    },
    savedKey: 'pending_key_101',
    latest: { current: { requestId: 'req' } },
    applied: null,
    setError: () => {},
    setPending: value => pending.push(value),
    setOutcome: value => outcome.push(value),
    setPromo: () => {},
    setPriceTick: () => {},
    setCredits: value => referral.push(value),
    refresh: async () => {},
    applyPromo: async () => {},
    api: async () => { referral.push('called'); return { credits: 3 }; },
    checkPending: async () => { reconciled.push('check'); },
  };
  const run = new Function('deps', `with (deps) { return async (e, saved) => {\n${body}\n} }`)(deps);
  await run(error, saved);
  await flush();
  return { cleared: sets.some(([, value]) => value === null), pendingCleared: pending.includes(null), sets, reconciled: reconciled.length };
}

try {
  const bookSource = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8');
  const catchSource = catchBody(bookSource);

  // The race this suite is about: the retry's non-booking_command_expired 4xx.
  for (const code of postLockCodes) {
    const result = await runCatch(catchSource, new ApiError(code, 409));
    assert.equal(result.cleared, false,
      `${code} 409 means "this attempt did not create an order", never "this command does not exist": ` +
      'a first POST it retries may already have committed (Part A proves 409 quote_consumed), and clearing it orphans that order');
    assert.equal(result.pendingCleared, false, `${code} must not drop the pending command from the screen`);
    assert.equal(result.reconciled, ['quote_expired', 'promo_used', 'priority_cutoff'].includes(code) ? 1 : 0,
      'only a durable terminal refusal triggers immediate foreground reconciliation');
  }
  console.log('✓ a refusal the quote-bound write can still produce keeps the persisted command for ' + postLockCodes.length + ' codes');

  // Controls: the test can actually see a clear (guards against a vacuous pass above).
  for (const [code, status] of clearControls) {
    const result = await runCatch(catchSource, new ApiError(code, status));
    assert.equal(result.cleared, true, `${code} ${status} must still clear: the server refused this payload, no order was created`);
    assert.equal(result.pendingCleared, true, `${code} ${status} must drop the pending card`);
  }
  for (const [code, status] of keepControls) {
    const result = await runCatch(catchSource, new ApiError(code, status));
    assert.equal(result.cleared, false, `${code} ${status} must not clear`);
  }
  for (const error of [new Error('network down'), { status: 409, message: 'quote_consumed' }, null]) {
    const result = await runCatch(catchSource, error);
    assert.equal(result.cleared, false, 'a non-ApiError failure is a transport failure: the outcome is still unknown');
  }
  // The user-visible mapping on the offline path is unchanged by an unknown outcome.
  const offline = await runCatch(catchSource, new Error('network down'));
  assert.ok(offline.sets.length === 0, 'a transport failure writes nothing: the saved command survives untouched');
  console.log('✓ controls: definite refusals clear, transport/5xx/401-408-429 do not');

  // ------------------------------------------------------------------ Part A: the server race
  const databaseUrl = process.env.WIND_TEST_DATABASE_URL;
  if (!databaseUrl) {
    console.log('SKIP part A (server race): WIND_TEST_DATABASE_URL is unset — quote-bound booking needs PostgreSQL; run it on k5 with the test database');
  } else {
    const { freshPostgres, selectRuntime } = await import('./pg-support.mjs');
    const { default: pg } = await import('pg');
    const pgClient = new pg.Client({ connectionString: databaseUrl });
    await pgClient.connect();
    const fresh = await freshPostgres('booking_race'); // schema name must stay <= 48 chars (see pg-support.schemaName)
    await fresh.database.close();
    selectRuntime(fresh.schema);
    let releaseGate = null, gateArmed = false;
    const osrmAnswer = { code: 'Ok', routes: [{ distance: 20000, duration: 1800, geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] };
    const osrm = (await import('node:http')).createServer((_req, res) => {
      if (gateArmed) releaseGate = () => res.end(JSON.stringify(osrmAnswer)); // hold the request until the race is set
      else res.end(JSON.stringify(osrmAnswer));
    });
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const home = mkdtempSync(join(tmpdir(), 'wind-booking-retry-'));
    process.env.DB_PATH = join(home, 'local.db');
    process.env.OSRM_URL = `http://127.0.0.1:${(await new Promise(resolve => { osrm.listen(0, '127.0.0.1', () => resolve(osrm.address())); })).port}`;
    // Only this test-owned application pool may wait longer for its deliberate blocker.
    process.env.WIND_TEST_POSTGRES_LOCK_TIMEOUT_MS = '10000';
    const { server, persistence, promote, shutdown } = await import('../server/main.ts');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (path, body, token, expect = 200) => {
      const res = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        ...(body !== undefined && { body: JSON.stringify(body) }) });
      const data = await res.json();
      assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
      return data;
    };
    try {
      const customer = (await call('/auth/register', { phone: '0599122001', name: 'Race customer', password: 'secret123' })).user;
      const token = (await call('/auth/login', { phone: '0599122001', password: 'secret123' })).token;
      // Four existing searching orders put the next successful creation exactly at the cap. A retry must
      // replay before the cap check instead of losing its saved key to 409 too_many_searching.
      for (let index = 0; index < 4; index += 1) {
        await call('/orders', { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
          shared: false, pickupNote: `Cap ${index}`, dropoffNote: 'Door', contact: '0599122001', detail: 'Box',
          quotedPrice: 20, requestId: randomUUID() }, token);
      }
      // /price routes the two city centres and fills the route cache with that key.
      const price = await call('/price', { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
        shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599122001', detail: 'Box' }, token);
      // The booking supplies pins, so it is a fresh OSRM fetch: the request we hold at the gate.
      const booking = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
        pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599122001', detail: 'Box',
        pickupPoint: { latitude: 31.9, longitude: 35.2 }, quoteId: price.quoteId, requestId: randomUUID() };
      gateArmed = true;
      const first = call('/orders', booking, token);
      // The first attempt is parked inside its transaction on the routing request (it already holds the
      // per-customer advisory lock), so the retry cannot pass the quote lock and cannot see the commit.
      for (let i = 0; i < 400 && releaseGate == null; i += 1) await sleep(5);
      assert.ok(releaseGate != null, 'the first POST never reached routing');
      gateArmed = false; // the retry must fetch its own route, not reuse the gate
      const release = releaseGate; releaseGate = null;
      // Fire the retry before releasing anything: its pre-transaction replay() finds no command, then it
      // parks on the first attempt's advisory lock — that parking is the interleaving that orphans the order.
      const retried = fetch(base + '/orders', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(booking) }).then(async r => ({ status: r.status, data: await r.json() }));
      let waiters = 0;
      for (let i = 0; i < 250 && waiters === 0; i += 1) {
        // Identify this fixture's searching-cap waiter specifically; unrelated lock waits do not arm the race.
        waiters = (await pgClient.query(`SELECT count(*)::int n FROM pg_stat_activity a
          WHERE a.state = 'active' AND a.wait_event_type = 'Lock' AND a.pid <> pg_backend_pid()
            AND a.query LIKE '%pg_advisory_xact_lock%wind_searching_cap%'`)).rows[0].n;
        if (waiters === 0) await sleep(2);
      }
      // Release only after the intended waiter exists. The test-owned application pool has a bounded 10 s
      // lock budget; production keeps its own timeout. A correct retry replays after the winner commits.
      assert.ok(waiters >= 1, 'the retry never blocked on the first attempt`s advisory lock — the interleaving this suite documents did not happen');
      release();
      const committed = await first;
      const retry = await retried;
      assert.equal(committed.status, 'searching');
      assert.equal(retry.status, 200, `the retry must replay the committed order, got ${retry.status} ${JSON.stringify(retry.data)}`);
      assert.equal(retry.data.id, committed.id, 'the retry returns the original order, including at the searching cap');
      assert.equal(retry.data.status, 'searching');
      const receipt = await call(`/orders/commands/${booking.requestId}`, undefined, token);
      assert.equal(receipt.orderId, committed.id, 'the receipt identifies the same committed order');
      const row = await persistence.one('SELECT o.id, q.consumed_order_id FROM orders o JOIN quotes q ON q.id = ?::uuid WHERE o.id = ?', price.quoteId, committed.id);
      assert.equal(Number(row.consumed_order_id), Number(committed.id), 'the quote was consumed by the first POST inside its transaction');
      const counts = await persistence.one(`SELECT
        (SELECT count(*) FROM orders WHERE customer_id = ? AND status = 'searching' AND scheduled_for IS NULL) AS orders,
        (SELECT count(*) FROM order_commands WHERE user_id = ? AND request_id = ?) AS commands`, customer.id, customer.id, booking.requestId);
      assert.deepEqual({ orders: Number(counts.orders), commands: Number(counts.commands) }, { orders: 5, commands: 1 },
        'two identical attempts create one fifth order and one replayable receipt');
      console.log('✓ server race: concurrent retry at the searching cap replays the original order and receipt');

      // A replay is an authorized read, not a bypass around session revocation. Session A changes the
      // password (preserving A, revoking B) while B waits for the customer lock behind A's committed write.
      const revokedCustomer = await call('/auth/register', { phone: '0599122002', name: 'Revoked replay', password: 'secret123' });
      const tokenA = (await call('/auth/login', { phone: '0599122002', password: 'secret123' })).token;
      const tokenB = (await call('/auth/login', { phone: '0599122002', password: 'secret123' })).token;
      const revokedQuote = await call('/price', { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
        option: 'small', shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599122002', detail: 'Box' }, tokenA);
      const revokedBooking = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
        pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599122002', detail: 'Box',
        pickupPoint: { latitude: 31.91, longitude: 35.2 }, quoteId: revokedQuote.quoteId, requestId: randomUUID() };
      gateArmed = true;
      const original = call('/orders', revokedBooking, tokenA);
      for (let i = 0; i < 400 && releaseGate == null; i += 1) await sleep(5);
      assert.ok(releaseGate != null, 'the revocation setup never reached routing');
      gateArmed = false;
      const releaseRevoked = releaseGate; releaseGate = null;
      const revokedRetry = fetch(base + '/orders', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify(revokedBooking) }).then(async r => ({ status: r.status, data: await r.json() }));
      let revokedWaiters = 0;
      for (let i = 0; i < 250 && revokedWaiters === 0; i += 1) {
        revokedWaiters = (await pgClient.query(`SELECT count(*)::int n FROM pg_stat_activity a
          WHERE a.state = 'active' AND a.wait_event_type = 'Lock' AND a.pid <> pg_backend_pid()
            AND a.query LIKE '%pg_advisory_xact_lock%wind_searching_cap%'`)).rows[0].n;
        if (revokedWaiters === 0) await sleep(2);
      }
      assert.ok(revokedWaiters >= 1, 'session B did not reach the customer-lock wait');
      await call('/me/password', { current: 'secret123', password: 'new-secret456' }, tokenA);
      releaseRevoked();
      const originalOrder = await original;
      const revokedResult = await revokedRetry;
      assert.equal(revokedResult.status, 401, `revoked session B must not receive the replayed order, got ${revokedResult.status}`);
      assert.equal(revokedResult.data.error, 'unauthorized');
      assert.equal(originalOrder.status, 'searching');
      const revokedReceipt = await call(`/orders/commands/${revokedBooking.requestId}`, undefined, tokenA);
      assert.equal(revokedReceipt.orderId, originalOrder.id, 'the valid session retains the committed receipt');
      console.log('✓ replay authority: password revocation during the lock wait prevents private order replay');

      // Promo retries can also wait before the initial replay, without reaching the customer lock.
      await pgClient.query(`SET search_path TO "${fresh.schema}",public`);
      const promoAdmin = await call('/auth/register', { phone: '0599122199', name: 'Promo admin', password: 'secret123' });
      await promote('0599122199');
      await call('/admin/promos', { code: 'REPLAYWAIT', amount: 1, maxUses: 20, days: 1 }, promoAdmin.token);
      let phoneIndex = 0;
      for (const outcome of ['applied', 'rejected']) for (const authority of ['session', 'blocked']) {
        const phone = `05991221${String(phoneIndex++).padStart(2, '0')}`;
        const account = await call('/auth/register', { phone, name: 'Limiter replay', password: 'secret123' });
        const body = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
          pickupNote: 'Gate', dropoffNote: 'Door', contact: phone, detail: 'Box', quotedPrice: 20, promoCode: 'REPLAYWAIT', requestId: randomUUID() };
        if (outcome === 'applied') await call('/orders', body, account.token);
        else {
          const { requestId, ...input } = body;
          const hash = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
          await persistence.run('INSERT INTO order_command_rejections(user_id,request_id,payload_hash,error,created_at) VALUES(?,?,?,?,?)',
            account.user.id, requestId, hash, 'quote_expired', Date.now());
        }
        const limiterKey = `promo:${createHash('sha256').update(String(account.user.id)).digest('hex')}`;
        await persistence.run('INSERT INTO request_limits(key,count,until) VALUES(?,0,?) ON CONFLICT(key) DO UPDATE SET count=0,until=excluded.until', limiterKey, Date.now() + 3600_000);
        await pgClient.query('BEGIN');
        assert.equal((await pgClient.query('SELECT key FROM request_limits WHERE key=$1 FOR UPDATE', [limiterKey])).rowCount, 1);
        const retry = fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
          body: JSON.stringify(body) }).then(async response => ({ status: response.status, data: await response.json() }));
        try {
          let waiters = 0;
          for (let attempt = 0; attempt < 250 && !waiters; attempt++) {
            // This connection holds the blocker transaction; refresh its cached activity snapshot.
            await pgClient.query('SELECT pg_stat_clear_snapshot()');
            waiters = (await pgClient.query(`SELECT count(*)::int n FROM pg_stat_activity
              WHERE state='active' AND wait_event_type='Lock' AND query LIKE '%request_limits%'`)).rows[0].n;
            if (!waiters) await sleep(10);
          }
          assert.ok(waiters, 'retry must be blocked on its promo limiter before authority changes');
          if (authority === 'session') await persistence.run('DELETE FROM sessions WHERE token_hash=?', createHash('sha256').update(account.token).digest('hex'));
          else await persistence.run("UPDATE users SET status='blocked' WHERE id=?", account.user.id);
        } finally { await pgClient.query('ROLLBACK'); }
        const result = await retry;
        // authenticate() also invalidates blocked accounts, before needActive() can return 403.
        assert.deepEqual(result, { status: 401, data: { error: 'unauthorized' } },
          `${outcome} replay after ${authority} revocation must disclose no receipt/order`);
      }
      console.log('✓ promo limiter replay: session revocation and blocking fence both successful and rejected receipts');
    } finally {
      releaseGate?.();
      await new Promise(resolve => server.close(resolve));
      await shutdown?.();
      await new Promise(resolve => osrm.close(resolve));
      await pgClient.end().catch(() => {});
      try { await persistence.close?.(); } catch {}
      (await import('node:fs')).rmSync(home, { recursive: true, force: true });
    }
  }
  console.log('booking retry race checks passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
