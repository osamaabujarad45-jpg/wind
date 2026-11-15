// A12 same-day parcel priority: cutoff in Jerusalem time, zero surcharge, shared capacity, replay identity, legacy upgrade.
// tests/parcel-priority.mjs runs this same file against PostgreSQL (WIND_PRIORITY_TEST_POSTGRES=1).
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { sameDayBookingOpen, validParcelPriority } from '../src/model.ts';
import { itineraryHash } from '../server/domain/quotes.ts';
import { priorityIdentity } from '../server/domain/priority.ts';
import { initializeSqlite } from '../server/db/sqlite-schema.ts';
import { apiCaller } from './support/api.mjs';

// Noon follows Jerusalem's clock, through daylight saving: 2026-03-27 and 2026-10-25 are the switch days.
for (const cutoff of ['2026-01-15T10:00:00Z', '2026-07-15T09:00:00Z', '2026-03-27T09:00:00Z', '2026-10-25T10:00:00Z']) {
  const at = Date.parse(cutoff);
  assert.equal(sameDayBookingOpen(at - 1), true, `11:59:59 open ${cutoff}`);
  assert.equal(sameDayBookingOpen(at), false, `12:00:00 closed ${cutoff}`);
  assert.equal(sameDayBookingOpen(at + 1), false, `after noon closed ${cutoff}`);
}
for (const invalid of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, null]) assert.equal(sameDayBookingOpen(invalid), false);

// Attribute rules: parcels take either value or none; rides and loads take no priority at all.
for (const priority of [undefined, 'standard', 'same_day']) assert.equal(validParcelPriority('parcel', priority), true);
for (const priority of [null, '', 'rush', 'SAME_DAY', 1, {}]) assert.equal(validParcelPriority('parcel', priority), false);
for (const service of ['ride', 'freight']) {
  assert.equal(validParcelPriority(service, undefined), true);
  for (const priority of ['standard', 'same_day']) assert.equal(validParcelPriority(service, priority), false);
}

// Replay identity: an omitted priority and an explicit standard are one command; same_day is a different one.
assert.deepEqual(priorityIdentity({ a: 1, priority: 'standard' }), { a: 1 });
assert.deepEqual(priorityIdentity({ a: 1 }), { a: 1 });
assert.deepEqual(priorityIdentity({ a: 1, priority: 'same_day' }), { a: 1, priority: 'same_day' });
const itinerary = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', pickupPoint: null, dropoffPoint: null, pickupNote: 'Gate', dropoffNote: 'Door',
  option: 'small', loadingHelp: false, shared: false, scheduledFor: null, detail: 'Box', contact: '0599822001', pickupContact: null, recipientName: '', recipientPhone: null };
assert.equal(itineraryHash({ ...itinerary, priority: 'standard' }), itineraryHash(itinerary), 'standard keeps every pre-A12 quote hash');
assert.notEqual(itineraryHash({ ...itinerary, priority: 'same_day' }), itineraryHash(itinerary), 'same_day is part of quote identity');

// A pre-A12 SQLite database (no priority column, no rejection table) upgrades in place; orders read as standard.
const dir = mkdtempSync(join(tmpdir(), 'wind-parcel-priority-'));
const legacy = new DatabaseSync(join(dir, 'legacy.db'));
const frozen = JSON.parse(readFileSync(new URL('../docs/implementation/contracts/schema.json', import.meta.url), 'utf8'));
const priorityClause = ", priority TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard','same_day') AND (service = 'parcel' OR priority = 'standard'))";
for (const object of frozen.objects.filter(object => object.type === 'table' && object.name !== 'order_command_rejections'))
  legacy.exec(object.sql.replace(priorityClause, ''));
legacy.exec(`PRAGMA user_version=3;
  INSERT INTO users(id,phone,name,password,role,status,created_at) VALUES(1,'0599822999','Legacy','synthetic','customer','active',1);
  INSERT INTO orders(id,customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,status,created_at,updated_at)
    VALUES(1,1,'parcel',0,'ramallah','nablus','Gate','Door','0599822999','Box','small',0,20,'searching',1,1);`);
initializeSqlite(legacy);
initializeSqlite(legacy);
assert.equal(legacy.prepare('SELECT priority FROM orders WHERE id=1').get().priority, 'standard');
legacy.prepare("INSERT INTO order_command_rejections VALUES(1,?,'new','priority_cutoff',2)").run(randomUUID());
assert.deepEqual(legacy.prepare('PRAGMA foreign_key_check').all(), []);
legacy.close();

const postgres = process.env.WIND_PRIORITY_TEST_POSTGRES === '1';
if (postgres) {
  const { freshPostgres, selectRuntime } = await import('./pg-support.mjs');
  const fresh = await freshPostgres('priority');
  await fresh.database.close();
  selectRuntime(fresh.schema);
} else {
  delete process.env.WIND_DATABASE_URL;
  delete process.env.WIND_POSTGRES_TEST_ONLY;
  delete process.env.WIND_POSTGRES_TEST_SCHEMA;
}
// The API under test runs on the real route and cap; the route stub holds one call when a test asks it to.
Object.assign(process.env, { NODE_ENV: 'test', DB_PATH: join(dir, 'api.db'), WIND_ENABLED_SERVICES: 'parcel,ride,freight', WIND_SEARCHING_LIMIT: '2',
  WIND_IDENTITY_MODE: '', WIND_CONTACT_VERIFICATION_REQUIRED: 'false', SOUQ_PARTNER_KEY: 'parcel-priority-isolated-partner-key-32-chars' });
let onRoute = null;
const answer = JSON.stringify({ code: 'Ok', routes: [{ distance: 20000, duration: 1800, geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] });
const osrm = createServer((_req, res) => { if (onRoute) { const receive = onRoute; onRoute = null; receive(res); } else res.end(answer); });
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
const realNow = Date.now;
const noon = Date.parse('2026-11-15T10:00:00Z'); // 12:00 in Jerusalem (winter time)
let now = noon - 1;
Date.now = () => now;
const { server, persistence, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const book = (token, body, expect = 200) => call('/orders', { token, body, expect });
const input = user => ({ service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, loadingHelp: false,
  pickupNote: 'Gate', dropoffNote: 'Door', contact: user.phone, detail: 'Box' });
let index = 0;
const customer = async () => {
  const phone = `059977${String(++index).padStart(4, '0')}`, token = randomBytes(32).toString('hex');
  const { lastInsertRowid: id } = await persistence.run("INSERT INTO users(phone,name,password,role,status,created_at) VALUES(?, 'Priority test', '', 'customer', 'active', ?)", phone, now);
  await persistence.run('INSERT INTO sessions(token_hash,user_id,created_at,last_seen_at) VALUES(?,?,?,?)', createHash('sha256').update(token).digest('hex'), id, now, now);
  return { token, user: { id, phone } };
};
const bounded = async (promise, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10_000); })]); }
  finally { clearTimeout(timer); }
};
try {
  // A customer who sends no priority at all is a standard booking, as before A12.
  const owner = await customer();
  const standardKey = randomUUID(), sameDayKey = randomUUID();
  const standard = await book(owner.token, { ...input(owner.user), requestId: standardKey });
  assert.equal(standard.priority, 'standard');
  const sameDay = await book(owner.token, { ...input(owner.user), priority: 'same_day', requestId: sameDayKey });
  assert.equal(sameDay.priority, 'same_day');
  assert.equal(sameDay.price, standard.price, 'zero priority surcharge');
  assert.equal((await call(`/orders/${sameDay.id}`, { token: owner.token })).priority, 'same_day', 'details show the attribute');

  // Priority uses the searching cap already in force: a same-day order is not an extra slot.
  assert.equal((await book(owner.token, { ...input(owner.user), priority: 'same_day' }, 409)).error, 'too_many_searching');
  assert.equal((await book(owner.token, { ...input(owner.user) }, 409)).error, 'too_many_searching');

  // Replays win over later cutoff and cap, and identity is the attribute: a different priority conflicts.
  now = noon;
  assert.equal((await book(owner.token, { ...input(owner.user), requestId: standardKey })).id, standard.id);
  assert.equal((await book(owner.token, { ...input(owner.user), priority: 'same_day', requestId: sameDayKey })).id, sameDay.id);
  assert.equal((await book(owner.token, { ...input(owner.user), requestId: sameDayKey }, 409)).error, 'idempotency_conflict', 'omitted (standard) is not same_day');
  assert.equal((await book(owner.token, { ...input(owner.user), priority: 'standard', requestId: standardKey })).id, standard.id,
    'explicit standard is the omitted command');
  now = noon - 1;

  // Boundary at the booking itself: 11:59:59 books, 12:00:00 refuses same_day and still books standard.
  const late = await customer();
  now = noon;
  const cutoffKey = randomUUID();
  assert.equal((await book(late.token, { ...input(late.user), priority: 'same_day', requestId: cutoffKey }, 409)).error, 'priority_cutoff');
  assert.equal((await call('/price', { token: late.token, body: { ...input(late.user), priority: 'same_day' }, expect: 409 })).error, 'priority_cutoff');
  assert.equal((await book(late.token, { ...input(late.user), requestId: randomUUID() })).priority, 'standard');
  now = noon - 1;
  // A refusal is terminal for its key: the same command cannot succeed once the clock moves back.
  assert.equal((await book(late.token, { ...input(late.user), priority: 'same_day', requestId: cutoffKey }, 409)).error, 'priority_cutoff');
  assert.equal((await call('/price', { token: late.token, body: { ...input(late.user), priority: 'same_day' } })).priority, 'same_day');

  // Invalid values: unknown or null is 400, and a ride or load cannot carry a priority at all.
  for (const priority of [null, 'rush', 'STANDARD', 7])
    assert.equal((await book(late.token, { ...input(late.user), priority }, 400)).error, 'invalid_priority');
  assert.equal((await book(late.token, { ...input(late.user), service: 'ride', option: '1', priority: 'same_day' }, 400)).error, 'invalid_priority');
  assert.equal((await book(late.token, { ...input(late.user), service: 'freight', option: 'small', priority: 'standard' }, 400)).error, 'invalid_priority');
  assert.equal((await call('/price', { token: late.token, body: { ...input(late.user), service: 'ride', option: '1', priority: 'standard' }, expect: 400 })).error, 'invalid_priority');

  // A route wait can cross noon: the policy is judged again at the order write, and the refusal is recorded.
  const crossing = await customer();
  now = noon - 1;
  let release;
  const reached = new Promise(resolve => { onRoute = res => { release = () => res.end(answer); resolve(); }; });
  const crossingKey = randomUUID();
  const booking = book(crossing.token, { ...input(crossing.user), priority: 'same_day', pricing: 'smart', requestId: crossingKey,
    pickupPoint: { latitude: 31.90123, longitude: 35.20123 } }, 409);
  await bounded(reached, 'smart booking reached its route wait');
  now = noon;
  release();
  assert.equal((await booking).error, 'priority_cutoff');
  assert.equal((await persistence.one('SELECT error FROM order_command_rejections WHERE request_id=?', crossingKey)).error, 'priority_cutoff');
  now = noon - 1;

  if (postgres) {
    // Quote identity: the attribute is part of the locked quote, and a changed one is a changed itinerary.
    const quoted = await customer();
    const quote = await call('/price', { token: quoted.token, body: { ...input(quoted.user), priority: 'same_day' } });
    const standardQuote = await call('/price', { token: quoted.token, body: input(quoted.user) });
    assert.equal(quote.priority, 'same_day');
    assert.equal(quote.priceMinor, standardQuote.priceMinor, 'quoted same_day costs the standard fare');
    assert.notEqual(quote.itineraryHash, standardQuote.itineraryHash);
    assert.equal((await persistence.one('SELECT priority FROM quotes WHERE id=?::uuid', quote.quoteId)).priority, 'same_day');
    await assert.rejects(persistence.run("UPDATE quotes SET priority='standard' WHERE id=?::uuid", quote.quoteId), /quotes are immutable/);
    for (const priority of [undefined, 'standard'])
      assert.equal((await book(quoted.token, { ...input(quoted.user), quoteId: quote.quoteId, ...(priority && { priority }), requestId: randomUUID() }, 409)).error, 'itinerary_changed');
    const quotedKey = randomUUID();
    const order = await book(quoted.token, { ...input(quoted.user), priority: 'same_day', quoteId: quote.quoteId, requestId: quotedKey });
    assert.equal(order.priority, 'same_day');
    now = noon;
    assert.equal((await book(quoted.token, { ...input(quoted.user), priority: 'same_day', quoteId: quote.quoteId, requestId: quotedKey })).id, order.id,
      'a committed quoted same_day command replays after noon');
    // A quote made before noon cannot commit same_day after it: the write refuses and the quote stays unspent.
    now = noon - 1;
    const before = await call('/price', { token: quoted.token, body: { ...input(quoted.user), priority: 'same_day' } });
    now = noon;
    assert.equal((await book(quoted.token, { ...input(quoted.user), priority: 'same_day', quoteId: before.quoteId, requestId: randomUUID() }, 409)).error, 'priority_cutoff');
    assert.equal((await persistence.one('SELECT consumed_at FROM quotes WHERE id=?::uuid', before.quoteId)).consumed_at, null);
  }
  console.log(`${postgres ? 'PostgreSQL' : 'SQLite'} parcel priority: cutoff/DST, zero surcharge, shared capacity, replay identity, invalid values and legacy upgrade passed`);
} finally {
  Date.now = realNow;
  onRoute = null;
  await shutdown();
  await new Promise(resolve => osrm.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
