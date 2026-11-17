// Booking retry race: a lost-answer first POST that commits server-side must not have its persisted
// command cleared by the retry's refusal.
//
// Server-side root cause (PostgreSQL, READ COMMITTED): the handler calls replay() twice, both times
// before the concurrent writer commits — once before BEGIN, once inside the caller's transaction.
// When the retry then blocks on pg_advisory_xact_lock (server/main.ts createOrder) the original
// commits; the retry re-reads the quote FOR UPDATE, sees consumed_at set, and answers
// 409 quote_consumed (main.ts:1345). It never reaches the order_commands replay (main.ts:1559 only
// handles 23505, which this path cannot raise).
// Client-side root cause (src/app/book.tsx catch): every 4xx except 401/408/429/
// idempotency_conflict clears the persisted command without consulting the receipt route — so a
// committed order loses its only on-device pointer and becomes an orphan in 'searching'.
//
// Part A reproduces it end-to-end (gated on WIND_TEST_DATABASE_URL). Part B pins the client contract
// against the real catch block, sliced from src/app/book.tsx by markers, and runs everywhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

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
  'pooling_unavailable', 'promo_changed', 'promo_used', 'invalid_schedule'];
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
  const sets = [], pending = [], outcome = [], referral = [];
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
  };
  const run = new Function('deps', `with (deps) { return async (e, saved) => {\n${body}\n} }`)(deps);
  await run(error, saved);
  await flush();
  return { cleared: sets.some(([, value]) => value === null), pendingCleared: pending.includes(null), sets };
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
        // Any of our own sessions blocked on a lock is the retry: the first attempt is parked on the
        // OSRM HTTP response, so its DB session is idle, not waiting. The lock it takes is whichever
        // the quote branch needs first, so this does not assume which one.
        waiters = (await pgClient.query(`SELECT count(*)::int n FROM pg_stat_activity a
          WHERE a.state = 'active' AND a.wait_event_type = 'Lock' AND a.pid <> pg_backend_pid()`)).rows[0].n;
        if (waiters === 0) await sleep(2);
      }
      // It is behind the app's 500 ms lock_timeout, so let the first attempt commit now rather than
      // timing the retry out: the retry then re-reads the quote FOR UPDATE, sees it consumed, and answers.
      assert.ok(waiters >= 1, 'the retry never blocked on the first attempt`s advisory lock — the interleaving this suite documents did not happen');
      release();
      const retry = await retried;
      assert.equal(retry.status, 409, `the retry of a committed command must be refused, got ${retry.status} ${JSON.stringify(retry.data)}`);
      assert.equal(retry.data.error, 'quote_consumed', `the retry of a committed command must be told its quote is consumed, got ${JSON.stringify(retry.data)}`);
      const committed = await first;
      assert.equal(committed.status, 'searching');
      // The command is committed and its replay-able receipt exists, yet the client has just been told to drop it.
      const receipt = await call(`/orders/commands/${booking.requestId}`, undefined, token);
      assert.equal(receipt.orderId, committed.id, 'the receipt proves the order the retry was told to forget');
      const row = await persistence.one('SELECT o.id, q.consumed_order_id FROM orders o JOIN quotes q ON q.id = ?::uuid WHERE o.id = ?', price.quoteId, committed.id);
      assert.equal(Number(row.consumed_order_id), Number(committed.id), 'the quote was consumed by the first POST inside its transaction');
      console.log('✓ server race: concurrent retry of a committed command answers 409 quote_consumed while its receipt exists');
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
