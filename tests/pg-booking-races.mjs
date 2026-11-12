// Real HTTP requests held at PostgreSQL/OSRM barriers, after the handler's initial authorization.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { freshPostgres, selectRuntime } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';

const pg = await freshPostgres('bookingraces');
selectRuntime(pg.schema);
const dir = mkdtempSync(join(tmpdir(), 'wind-pg-booking-races-'));
let routeGate;
const osrm = createServer(async (_req, res) => {
  const gate = routeGate;
  gate?.arrived.resolve();
  if (gate) await gate.release.promise;
  res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 20000, duration: 1800,
    geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] }));
});
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
Object.assign(process.env, { DB_PATH: join(dir, 'unused.db'), OSRM_URL: `http://127.0.0.1:${osrm.address().port}`,
  WIND_ENABLED_SERVICES: 'parcel', WIND_SEARCHING_LIMIT: '1', WIND_IDENTITY_MODE: '', NODE_ENV: 'test', WIND_CONTACT_VERIFICATION_REQUIRED: 'false',
  SOUQ_PARTNER_KEY: 'synthetic-booking-partner-key-32-chars' });
const { server, persistence, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Intentional barriers need a longer wait budget than production's fast retry policy.
persistence.pool.options.lock_timeout = 5000;
await persistence.pool.query("SET lock_timeout='5s'");
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(() => base);
const post = async (body, token) => {
  const response = await fetch(`${base}/orders`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};
const bounded = async (promise, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Barrier timeout: ${label}`)), 4000);
  })]); } finally { clearTimeout(timer); }
};
const waiters = async count => {
  const deadline = Date.now() + 4000;
  while (Number((await pg.database.one("SELECT count(*) n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).n) < count) {
    assert.ok(Date.now() < deadline, `Barrier timeout: ${count} blocked booking requests`);
    await delay(10);
  }
};
let index = 0;
const customer = async () => {
  const phone = `059976${String(++index).padStart(4, '0')}`, token = randomBytes(32).toString('hex'), now = Date.now();
  const { lastInsertRowid: id } = await pg.database.run("INSERT INTO users(phone,name,password,role,status,created_at) VALUES(?, 'Race fixture', '', 'customer', 'active', ?)", phone, now);
  await pg.database.run('INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at) VALUES(?,?,?,?)', createHash('sha256').update(token).digest('hex'), id, now, now);
  return { token, user: { id, phone } };
};
const input = user => ({ service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
  pickupNote: 'Synthetic gate', dropoffNote: 'Synthetic door', contact: user.phone, detail: 'Synthetic box' });
const lock = await pg.database.pool.connect();
const hold = id => lock.query("SELECT pg_advisory_lock(hashtextextended('wind_searching_cap', $1))", [id]);
const release = () => lock.query('SELECT pg_advisory_unlock_all()');
const failures = [];
const check = async (label, work) => {
  try { await work(); console.log(`PASS ${label}`); }
  catch (error) { failures.push(error); console.error(`FAIL ${label}: ${error.message}`); }
  finally { routeGate?.release.resolve(); routeGate = undefined; await release(); }
};
try {
  const admin = await customer();
  await promote(admin.user.phone);
  for (const quoted of [false, true]) await check(`same key replays winner (${quoted ? 'quote' : 'legacy'})`, async () => {
    const owner = await customer();
    const terms = { ...input(owner.user), ...(quoted && { scheduledFor: Date.now() + 86_400_000 }) };
    const price = await call('/price', { token: owner.token, body: terms });
    const body = { ...terms, ...(quoted ? { quoteId: price.quoteId } : { quotedPrice: price.price }), requestId: randomUUID() };
    await hold(owner.user.id);
    const first = post(body, owner.token), second = post(body, owner.token);
    await waiters(2);
    await release();
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map(r => r.status), [200, 200], JSON.stringify(results));
    assert.equal(results[0].data.id, results[1].data.id);
    assert.equal(Number((await pg.database.one('SELECT count(*) n FROM orders WHERE customer_id=?', owner.user.id)).n), 1);
    assert.equal(Number((await pg.database.one('SELECT count(*) n FROM order_commands WHERE user_id=?', owner.user.id)).n), 1);
    const conflict = await post({ ...body, detail: 'Different payload' }, owner.token);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.data.error, 'idempotency_conflict');
    const refused = await post({ ...body, requestId: randomUUID() }, owner.token);
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error, quoted ? 'quote_consumed' : 'too_many_searching');
  });
  for (const quoted of [false, true]) for (const command of [false, true]) for (const change of ['logout', 'block', 'role', 'delete'])
    await check(`revoked ${change} during ${quoted ? 'quote route' : 'customer lock'} (${command ? 'command' : 'no key'})`, async () => {
      const owner = await customer(), terms = input(owner.user);
      const price = await call('/price', { token: owner.token, body: terms });
      const body = { ...terms, ...(command && { requestId: randomUUID() }), ...(quoted
        ? { quoteId: price.quoteId, pickupPoint: { latitude: 31.9 + index / 10000, longitude: 35.2 } }
        : { quotedPrice: price.price }) };
      if (quoted) routeGate = { arrived: Promise.withResolvers(), release: Promise.withResolvers() };
      else await hold(owner.user.id);
      const booking = post(body, owner.token);
      if (quoted) await bounded(routeGate.arrived.promise, 'quote booking routing');
      else await waiters(1);
      if (change === 'logout') await call('/auth/logout', { token: owner.token, body: {} });
      else if (change === 'delete') await call(`/admin/users/${owner.user.id}`, { token: admin.token, method: 'DELETE' });
      else await call(`/admin/users/${owner.user.id}`, { token: admin.token, body: change === 'block' ? { status: 'blocked' } : { role: 'driver' } });
      routeGate?.release.resolve();
      await release();
      const result = await booking;
      assert.equal(result.status, 401, JSON.stringify(result));
      assert.equal(Number((await pg.database.one('SELECT count(*) n FROM orders WHERE customer_id=?', owner.user.id)).n), 0);
      assert.equal(Number((await pg.database.one('SELECT count(*) n FROM order_commands WHERE user_id=?', owner.user.id)).n), 0);
    });
  await check('partner same reference replays winner at searching cap', async () => {
    const headers = { 'Content-Type': 'application/json', 'X-Partner-Key': process.env.SOUQ_PARTNER_KEY };
    const partnerPost = async body => {
      const response = await fetch(`${base}/partner/orders`, { method: 'POST', headers, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };
    const body = { ...input({ phone: '0599769999' }), quotedPrice: 20, externalRef: randomUUID(), scheduledFor: Date.now() + 86_400_000 };
    const seed = await partnerPost(body);
    assert.equal(seed.status, 200, JSON.stringify(seed));
    const owner = await pg.database.one("SELECT id FROM users WHERE phone='partner:souq'");
    const current = { ...body, scheduledFor: null, externalRef: randomUUID() };
    await hold(owner.id);
    const first = partnerPost(current), second = partnerPost(current);
    await waiters(2);
    await release();
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map(r => r.status), [200, 200], JSON.stringify(results));
    assert.equal(results[0].data.id, results[1].data.id);
    assert.equal(Number((await pg.database.one('SELECT count(*) n FROM partner_orders WHERE external_ref=?', current.externalRef)).n), 1);
    assert.equal((await partnerPost({ ...current, detail: 'Different payload' })).data.error, 'idempotency_conflict');
    const cancelled = await fetch(`${base}/partner/orders/${results[0].data.id}/cancel`, { method: 'POST', headers, body: '{}' });
    assert.equal(cancelled.status, 200);
    const atomic = persistence.atomic;
    persistence.atomic = async (...args) => {
      const result = await atomic.apply(persistence, args);
      throw new Error('synthetic post-commit outcome failure');
    };
    const uncertainRef = randomUUID(), uncertainBody = { ...current, externalRef: uncertainRef, scheduledFor: Date.now() + 86_400_000 };
    try {
      const failure = await partnerPost(uncertainBody);
      assert.equal(failure.status, 500, JSON.stringify(failure));
      assert.equal(failure.data.error, 'server_error');
      assert.match(failure.data.reference, /^[0-9a-f-]{36}$/);
    } finally { persistence.atomic = atomic; }
    const receiptResponse = await fetch(`${base}/partner/orders/by-reference?externalRef=${encodeURIComponent(uncertainRef)}`, { headers });
    assert.equal(receiptResponse.status, 200, 'the durable partner receipt remains readable after the uncertain reply');
    const receipt = await receiptResponse.json();
    assert.equal((await partnerPost(uncertainBody)).data.id, receipt.id, 'a same-payload retry replays that committed order');
  });
  await check('customer outer PostgreSQL commit failure keeps 500 and durable receipt', async () => {
    const owner = await customer(), body = { ...input(owner.user), quotedPrice: 20, requestId: randomUUID() };
    const atomic = persistence.atomic;
    persistence.atomic = async (...args) => {
      const result = await atomic.apply(persistence, args);
      throw new Error('synthetic outer post-commit outcome failure');
    };
    let failure;
    try { failure = await post(body, owner.token); } finally { persistence.atomic = atomic; }
    assert.equal(failure.status, 500, JSON.stringify(failure));
    assert.equal(failure.data.error, 'server_error');
    assert.match(failure.data.reference, /^[0-9a-f-]{36}$/);
    const receipt = await call(`/orders/commands/${body.requestId}`, { token: owner.token });
    assert.ok(Number.isSafeInteger(receipt.orderId) && receipt.orderId > 0, JSON.stringify(receipt));
    assert.equal((await post(body, owner.token)).data.id, receipt.orderId, 'a same-payload retry replays the committed order');
  });
  for (const revocation of ['logout', 'support-reset']) for (const conflict of [false, true]) await check(`${revocation} while committed receipt is being replayed (${conflict ? 'changed payload' : 'same payload'})`, async () => {
    const owner = await customer();
    const body = { ...input(owner.user), quotedPrice: 20, requestId: randomUUID() };
    assert.equal((await post(body, owner.token)).status, 200);
    await lock.query('BEGIN');
    try {
      await lock.query(`LOCK TABLE "${pg.schema}".order_commands IN ACCESS EXCLUSIVE MODE`);
      const replay = post(conflict ? { ...body, detail: 'Changed after commit' } : body, owner.token);
      const deadline = Date.now() + 4000;
      while (!Number((await pg.database.one("SELECT count(*) n FROM pg_locks WHERE relation=?::regclass AND NOT granted", `${pg.schema}.order_commands`)).n)) {
        assert.ok(Date.now() < deadline, 'Replay must reach the blocked receipt read');
        await delay(10);
      }
      if (revocation === 'logout') await call('/auth/logout', { token: owner.token, body: {} });
      else await call(`/admin/users/${owner.user.id}/password`, { token: admin.token, body: { attestation: 'Verified the caller through the support recovery procedure' } });
      await lock.query('COMMIT');
      assert.equal((await replay).status, 401);
      assert.equal(Number((await pg.database.one('SELECT count(*) n FROM orders WHERE customer_id=?', owner.user.id)).n), 1);
    } finally { await lock.query('ROLLBACK'); }
  });
  await check('an admin edit read before another admin blocked the user fails instead of unblocking them', async () => {
    const target = await customer();
    await lock.query('BEGIN');
    try {
      await lock.query(`SELECT id FROM "${pg.schema}".users WHERE id=$1 FOR UPDATE`, [target.user.id]);
      const stale = call(`/admin/users/${target.user.id}`, { token: admin.token, body: { name: 'Renamed from a stale form' }, expect: 409 });
      const deadline = Date.now() + 4000;
      while (!Number((await pg.database.one("SELECT count(*) n FROM pg_locks WHERE locktype='transactionid' AND NOT granted")).n)) {
        assert.ok(Date.now() < deadline, 'The edit must reach the user row lock');
        await delay(10);
      }
      await lock.query(`UPDATE "${pg.schema}".users SET status='blocked' WHERE id=$1`, [target.user.id]);
      await lock.query('COMMIT');
      assert.equal((await bounded(stale, 'stale admin edit')).error, 'user_changed');
      const after = await pg.database.one('SELECT status, name FROM users WHERE id=?', target.user.id);
      assert.deepEqual([after.status, after.name], ['blocked', 'Race fixture'], 'the block stands and the stale rename is not applied');
    } finally { await lock.query('ROLLBACK'); }
  });
  assert.equal(failures.length, 0, `${failures.length} booking race regressions failed`);
} finally {
  routeGate?.release.resolve();
  await release();
  lock.release();
  await shutdown();
  await new Promise(resolve => osrm.close(resolve));
  await pg.database.run(`DROP SCHEMA "${pg.schema}" CASCADE`);
  await pg.database.close();
  rmSync(dir, { recursive: true, force: true });
}
