import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sameDayBookingOpen, validParcelPriority } from '../src/model.ts';
import { againForm, pickupForm, readBooking, orderRequest } from '../src/booking.ts';
import { readOrder, readPriceQuote } from '../src/wire-contracts.ts';
import { itineraryHash } from '../server/domain/quotes.ts';
import { initializeSqlite } from '../server/db/sqlite-schema.ts';
import { apiCaller } from './support/api.mjs';

// Noon follows Jerusalem's clock, including DST, rather than UTC/the machine's zone/Hebron.
for (const cutoff of ['2026-01-15T10:00:00Z', '2026-07-15T09:00:00Z', '2026-03-27T09:00:00Z', '2026-10-25T10:00:00Z']) {
  const at = Date.parse(cutoff);
  assert.equal(sameDayBookingOpen(at - 1), true, cutoff);
  assert.equal(sameDayBookingOpen(at), false, cutoff);
  assert.equal(sameDayBookingOpen(at + 1), false, cutoff);
}
for (const invalid of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, '2026-01-15T09:00:00Z', null])
  assert.equal(sameDayBookingOpen(invalid), false);
for (const priority of [undefined, 'standard', 'same_day']) assert.equal(validParcelPriority('parcel', priority), true);
for (const priority of [null, '', 'rush', 'SAME_DAY', 1, {}, []]) assert.equal(validParcelPriority('parcel', priority), false);
for (const service of ['ride', 'freight']) {
  assert.equal(validParcelPriority(service, undefined), true);
  for (const priority of ['standard', 'same_day']) assert.equal(validParcelPriority(service, priority), false);
}

const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
  loadingHelp: false, pickupPoint: null, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599822001', detail: 'Box' };
const pending = { requestId: randomUUID(), payload: { ...input, quotedPrice: 20 } };
assert.equal(readBooking(JSON.stringify(pending)).payload.priority, undefined, 'old frozen command keeps its original wire body');
for (const priority of ['standard', 'same_day']) {
  const command = readBooking(JSON.stringify({ ...pending, payload: { ...pending.payload, priority } }));
  assert.equal(orderRequest(command).priority, priority);
  assert.equal(orderRequest({ ...command, payload: { ...command.payload, quoteId: randomUUID() } }).quotedPrice, undefined);
  assert.equal(againForm({ ...input, priority }).priority, priority);
  assert.equal(pickupForm({ ...input, priority }).priority, undefined, 'send another copies pickup only');
}
for (const changes of [{ priority: null }, { priority: 'rush' }, { service: 'freight', priority: 'same_day' }, { service: 'ride', option: '1', priority: 'standard' }])
  assert.throws(() => readBooking(JSON.stringify({ ...pending, payload: { ...pending.payload, ...changes } })), /invalid_pending_booking/);
assert.equal(itineraryHash(input), itineraryHash({ ...input, priority: 'standard' }));
assert.notEqual(itineraryHash(input), itineraryHash({ ...input, priority: 'same_day' }));
const wireOrder = { ...input, id: 1, customerId: 1, driverId: null, status: 'searching', price: 20, createdAt: 1, updatedAt: 1 };
assert.equal(readOrder(wireOrder).id, 1, 'older response is accepted');
assert.equal(readOrder({ ...wireOrder, priority: 'same_day' }).priority, 'same_day');
for (const changes of [{ priority: null }, { priority: 'rush' }, { service: 'ride', priority: 'standard' }])
  assert.throws(() => readOrder({ ...wireOrder, ...changes }), /invalid_response/);
const wireQuote = { price: 20, km: 1, minutes: 1, delayMinutes: 0, estimated: true, slow: [], closed: [], avoids: [] };
assert.equal(readPriceQuote({ ...wireQuote, priority: 'same_day' }).priority, 'same_day');
assert.throws(() => readPriceQuote({ ...wireQuote, priority: 'rush' }), /invalid_response/);

const dir = mkdtempSync(join(tmpdir(), 'wind-parcel-priority-'));
// Recreate the reviewed pre-priority SQLite schema; migration must retain real orders and refusals.
const legacy = new DatabaseSync(join(dir, 'legacy.db'));
const frozen = JSON.parse(readFileSync(new URL('../docs/implementation/contracts/schema.json', import.meta.url), 'utf8'));
for (const object of frozen.objects.filter(object => object.type === 'table')) legacy.exec(object.sql
  .replace(", priority TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard','same_day') AND (service = 'parcel' OR priority = 'standard'))", '')
  .replace("'quote_expired','promo_used','priority_cutoff'", "'quote_expired','promo_used'"));
legacy.exec(`PRAGMA user_version=3;
  INSERT INTO users(id,phone,name,password,role,status,created_at) VALUES(1,'0599822999','Legacy','synthetic','customer','active',1);
  INSERT INTO orders(id,customer_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,status,created_at,updated_at)
    VALUES(1,1,'parcel',0,'ramallah','nablus','Gate','Door','0599822999','Box','small',0,20,'searching',1,1);
  INSERT INTO order_command_rejections VALUES(1,'00000000-0000-4000-8000-000000000001','legacy','quote_expired',1);`);
initializeSqlite(legacy);
initializeSqlite(legacy);
assert.equal(legacy.prepare('SELECT priority FROM orders WHERE id=1').get().priority, 'standard');
assert.equal(legacy.prepare('SELECT error FROM order_command_rejections').get().error, 'quote_expired');
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
Object.assign(process.env, { NODE_ENV: 'test', DB_PATH: join(dir, 'api.db'), WIND_ENABLED_SERVICES: 'parcel', WIND_SEARCHING_LIMIT: '2',
  SOUQ_PARTNER_KEY: 'parcel-priority-isolated-partner-key-32-chars' });
for (const key of ['WIND_IDENTITY_MODE', 'WIND_CONTACT_VERIFICATION_REQUIRED', 'WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN']) delete process.env[key];
let onRoute = null;
const answer = JSON.stringify({ code: 'Ok', routes: [{ distance: 20000, duration: 1800, geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] });
const osrm = createServer((_req, res) => { if (onRoute) { const receive = onRoute; onRoute = null; receive(res); } else res.end(answer); });
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
const realNow = Date.now;
const noon = Date.parse('2026-11-15T10:00:00Z');
let now = noon - 1;
Date.now = () => now;
const { server, persistence, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
let userIndex = 0;
const register = () => call('/auth/register', { body: { phone: `0599822${String(++userIndex).padStart(3, '0')}`, name: 'Priority test', password: 'synthetic123' } });
const book = (token, changes = {}, expect = 200) => call('/orders', { token, body: { ...input, quotedPrice: 20, ...changes }, expect });
const partner = (body, expect = 200) => call('/partner/orders', { partnerKey: process.env.SOUQ_PARTNER_KEY, body: { ...input, quotedPrice: 20, ...body }, expect });
const waitRoute = async reached => {
  let timer;
  try { await Promise.race([reached, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('booking never reached its route wait')), 10_000); })]); }
  finally { clearTimeout(timer); }
};
try {
  const customer = await register();
  const standardKey = randomUUID(), sameDayKey = randomUUID();
  const standard = await book(customer.token, { requestId: standardKey });
  const sameDay = await book(customer.token, { requestId: sameDayKey, priority: 'same_day' });
  assert.equal(standard.priority, 'standard');
  assert.equal(sameDay.priority, 'same_day');
  assert.equal(sameDay.price, standard.price, 'zero priority surcharge');
  assert.equal((await persistence.one('SELECT priority FROM orders WHERE id=?', sameDay.id)).priority, 'same_day');
  now = noon;
  for (const [key, priority, id] of [[standardKey, 'standard', standard.id], [sameDayKey, 'same_day', sameDay.id]])
    assert.equal((await book(customer.token, { requestId: key, priority })).id, id, 'successful replay wins over cutoff and the full shared cap');
  assert.equal((await book(customer.token, { requestId: sameDayKey, priority: 'standard' }, 409)).error, 'idempotency_conflict');
  assert.equal((await book(customer.token, { priority: 'standard' }, 409)).error, 'too_many_searching');
  now = noon - 1;
  assert.equal((await book(customer.token, { priority: 'same_day' }, 409)).error, 'too_many_searching', 'priority has no reserved capacity');
  assert.equal((await call('/orders', { token: customer.token }))[0].priority, 'same_day');

  const cutoffUser = await register();
  now = noon;
  const cutoffKey = randomUUID();
  assert.equal((await book(cutoffUser.token, { priority: 'same_day', requestId: cutoffKey }, 409)).error, 'priority_cutoff');
  assert.deepEqual(await call(`/orders/commands/${cutoffKey}`, { token: cutoffUser.token }), { orderId: null, state: 'absent', error: 'priority_cutoff' });
  assert.equal((await book(cutoffUser.token, { priority: 'standard', requestId: cutoffKey }, 409)).error, 'idempotency_conflict');
  const malformedKey = randomUUID();
  assert.equal((await book(cutoffUser.token, { priority: 'same_day', pickupNote: '', requestId: malformedKey }, 400)).error, 'invalid_input');
  assert.equal((await call(`/orders/commands/${malformedKey}`, { token: cutoffUser.token })).state, 'unknown', 'invalid payload cannot poison a terminal key');
  const unauthorizedKey = randomUUID();
  await book('invalid-session', { priority: 'same_day', requestId: unauthorizedKey }, 401);
  assert.equal(Number((await persistence.one('SELECT count(*) n FROM order_command_rejections WHERE request_id=?', unauthorizedKey)).n), 0);
  assert.equal((await call('/price', { token: cutoffUser.token, body: { ...input, priority: 'same_day' }, expect: 409 })).error, 'priority_cutoff');
  assert.equal((await call('/partner/quotes', { partnerKey: process.env.SOUQ_PARTNER_KEY, body: { ...input, priority: 'same_day' }, expect: 409 })).error, 'priority_cutoff');
  assert.equal((await partner({ externalRef: 'after-noon', priority: 'same_day' }, 409)).error, 'priority_cutoff');
  now = noon + 1;
  assert.equal((await book(cutoffUser.token, { priority: 'same_day' }, 409)).error, 'priority_cutoff');
  // Booking cutoff is independent of a valid future pickup slot; no extra scheduling policy is invented.
  const future = now + 86_400_000;
  assert.equal((await book(cutoffUser.token, { priority: 'same_day', scheduledFor: future }, 409)).error, 'priority_cutoff');
  now = noon - 1;
  assert.equal((await book(cutoffUser.token, { priority: 'same_day', scheduledFor: future })).priority, 'same_day');
  assert.equal((await book(cutoffUser.token, { priority: 'same_day', requestId: cutoffKey }, 409)).error, 'priority_cutoff', 'terminal outcome survives a clock/date change');
  for (const priority of [null, 'rush', 'STANDARD', 7]) {
    assert.equal((await book(cutoffUser.token, { priority }, 400)).error, 'invalid_priority');
    assert.equal((await call('/price', { token: cutoffUser.token, body: { ...input, priority }, expect: 400 })).error, 'invalid_priority');
    assert.equal((await partner({ externalRef: `invalid-${String(priority)}`, priority }, 400)).error, 'invalid_priority');
  }
  for (const service of ['ride', 'freight']) {
    assert.equal((await book(cutoffUser.token, { service, priority: 'same_day' }, 400)).error, 'invalid_priority');
    assert.equal((await call('/price', { token: cutoffUser.token, body: { ...input, service, priority: 'standard' }, expect: 400 })).error, 'invalid_priority');
    assert.equal((await partner({ externalRef: `wrong-${service}`, service, priority: 'same_day' }, 400)).error, 'invalid_service');
  }
  const partnerStandard = await partner({ externalRef: 'standard' });
  const partnerSameDay = await partner({ externalRef: 'same-day', priority: 'same_day' });
  now = noon;
  const historicalPartnerHash = createHash('sha256').update(JSON.stringify({ ...input, quotedPrice: 20, externalRef: 'standard' })).digest('hex');
  await persistence.run('UPDATE partner_orders SET payload_hash=? WHERE external_ref=?', historicalPartnerHash, 'standard');
  assert.equal((await partner({ externalRef: 'standard' })).id, partnerStandard.id, 'historical raw hash replays the original omitted wire');
  await persistence.run('UPDATE partner_orders SET payload_hash=? WHERE external_ref=?', historicalPartnerHash, 'standard');
  assert.equal((await partner({ externalRef: 'standard', priority: 'standard' })).id, partnerStandard.id);
  assert.equal((await partner({ externalRef: 'standard', priority: 'same_day' }, 409)).error, 'idempotency_conflict',
    'historical omitted priority cannot become same-day at cutoff/full capacity');
  assert.equal((await partner({ externalRef: 'same-day', priority: 'same_day' })).id, partnerSameDay.id);
  assert.equal((await partner({ externalRef: 'same-day', priority: 'standard' }, 409)).error, 'idempotency_conflict');
  assert.equal((await call(`/partner/orders/${partnerSameDay.id}`, { partnerKey: process.env.SOUQ_PARTNER_KEY })).priority, 'same_day');

  // A route wait can cross noon. Revalidate the policy at the new order write.
  const crossing = await register();
  now = noon - 1;
  let release;
  const reached = new Promise(resolve => { onRoute = res => { release = () => res.end(answer); resolve(); }; });
  const crossingKey = randomUUID();
  const booking = book(crossing.token, { priority: 'same_day', pricing: 'smart', requestId: crossingKey,
    pickupPoint: { latitude: 31.90123, longitude: 35.20123 } }, 409);
  await waitRoute(reached);
  now = noon;
  release();
  assert.equal((await booking).error, 'priority_cutoff');
  assert.equal((await call(`/orders/commands/${crossingKey}`, { token: crossing.token })).state, 'absent');

  if (postgres) {
    now = noon - 1;
    const quotedUser = await register();
    const price = await call('/price', { token: quotedUser.token, body: { ...input, priority: 'same_day' } });
    const standardPrice = await call('/price', { token: quotedUser.token, body: input });
    assert.equal(price.priority, 'same_day');
    assert.equal(price.priceMinor, standardPrice.priceMinor);
    assert.notEqual(price.itineraryHash, standardPrice.itineraryHash);
    assert.equal((await persistence.one('SELECT priority FROM quotes WHERE id=?::uuid', price.quoteId)).priority, 'same_day');
    await assert.rejects(persistence.run("UPDATE quotes SET priority='standard' WHERE id=?::uuid", price.quoteId), /quotes are immutable/);
    for (const priority of [undefined, 'standard']) {
      const response = await call('/orders', { token: quotedUser.token, body: { ...input, quoteId: price.quoteId, ...(priority && { priority }), requestId: randomUUID() }, expect: 409 });
      assert.equal(response.error, 'itinerary_changed');
    }
    assert.equal((await call('/orders', { token: quotedUser.token, body: { ...input, priority: 'same_day', quoteId: standardPrice.quoteId, requestId: randomUUID() }, expect: 409 })).error, 'itinerary_changed');
    const quotedKey = randomUUID();
    const quoted = await call('/orders', { token: quotedUser.token, body: { ...input, priority: 'same_day', quoteId: price.quoteId, requestId: quotedKey } });
    assert.equal(quoted.priority, 'same_day');
    now = noon;
    assert.equal((await call('/orders', { token: quotedUser.token, body: { ...input, priority: 'same_day', quoteId: price.quoteId, requestId: quotedKey } })).id, quoted.id);
    assert.equal((await call('/orders', { token: quotedUser.token, body: { ...input, priority: 'standard', quoteId: standardPrice.quoteId } })).priority, 'standard');
    now = noon - 1;
    const quotedCrossing = await register();
    const crossingQuote = await call('/price', { token: quotedCrossing.token, body: { ...input, priority: 'same_day' } });
    const reachedQuoted = new Promise(resolve => { onRoute = res => { release = () => res.end(answer); resolve(); }; });
    const quotedCrossingKey = randomUUID();
    const write = call('/orders', { token: quotedCrossing.token, body: { ...input, priority: 'same_day', quoteId: crossingQuote.quoteId,
      pickupPoint: { latitude: 31.90234, longitude: 35.20234 }, requestId: quotedCrossingKey }, expect: 409 });
    await waitRoute(reachedQuoted);
    now = noon;
    release();
    assert.equal((await write).error, 'priority_cutoff');
    assert.equal((await call(`/orders/commands/${quotedCrossingKey}`, { token: quotedCrossing.token })).state, 'absent');
    assert.equal((await persistence.one('SELECT consumed_at FROM quotes WHERE id=?::uuid', crossingQuote.quoteId)).consumed_at, null);
    await assert.rejects(persistence.run("UPDATE orders SET priority='rush' WHERE id=?", quoted.id));
    await assert.rejects(persistence.run("UPDATE orders SET service='ride' WHERE id=?", quoted.id));
    const envelopeUser = await register();
    const standardCommand = randomUUID();
    const envelopeInput = { ...input, quotedPrice: 20 };
    const standardEnvelope = await call('/orders', { token: envelopeUser.token, body: { commandId: standardCommand, payload: envelopeInput } });
    assert.equal((await call('/orders', { token: envelopeUser.token,
      body: { commandId: standardCommand, payload: { ...envelopeInput, priority: 'standard' } } })).id, standardEnvelope.id,
    'durable envelope replays omitted/explicit standard with its historical hash');
    assert.equal((await call('/orders', { token: envelopeUser.token,
      body: { commandId: standardCommand, payload: { ...envelopeInput, priority: 'same_day' } }, expect: 409 })).error, 'idempotency_conflict');
    now = noon - 1;
    const sameDayCommand = randomUUID();
    const sameDayEnvelope = await call('/orders', { token: envelopeUser.token,
      body: { commandId: sameDayCommand, payload: { ...envelopeInput, priority: 'same_day' } } });
    now = noon;
    assert.equal((await call('/orders', { token: envelopeUser.token,
      body: { commandId: sameDayCommand, payload: { ...envelopeInput, priority: 'same_day' } } })).id, sameDayEnvelope.id,
    'same-day durable envelope replays after noon at the shared cap');
    assert.equal((await call('/orders', { token: envelopeUser.token,
      body: { commandId: sameDayCommand, payload: envelopeInput }, expect: 409 })).error, 'idempotency_conflict');
    assert.equal((await call('/ready')).schema, 32);
  }
  // Historical pre-priority canonical hashes are still the identity for omitted/explicit standard.
  const canonical = value => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const oldHash = createHash('sha256').update(JSON.stringify(canonical({ ...input, quotedPrice: 20 }))).digest('hex');
  assert.equal((await persistence.one('SELECT payload_hash FROM order_commands WHERE request_id=?', standardKey)).payload_hash, oldHash);
  console.log(`${postgres ? 'PostgreSQL' : 'SQLite'} parcel priority: cutoff/DST, zero surcharge/shared capacity, validated terminal receipts, replay identity, quotes and defaults passed`);
} finally {
  Date.now = realNow;
  onRoute = null;
  await shutdown();
  await new Promise(resolve => osrm.close(resolve));
}
