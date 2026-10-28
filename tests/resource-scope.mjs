// WP12 resource scope (PG): declared scope, custody, reservation precedence,
// multi-pickup planned load, pickup-mismatch pauses and freight validation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, polygon } from './eligibility-support.mjs';
import { NON_LEGACY_TABLES } from '../server/migrate.ts';

const parcelScope = (f, over = {}) => ({ itemCount: 2, lengthMm: 100, widthMm: 100, heightMm: 100, massGrams: 2000,
  declaredValueMinor: 5000, pickupPromisedAfter: f.now - 1000, pickupPromisedBefore: f.until - 10000,
  dropoffPromisedBefore: f.until - 1000, ...over });
async function approachDeclared(f, order, vehicleId = f.vehicle.id) {
  const scope = await f.db.one('SELECT revision FROM order_declared_scope WHERE order_id=?', order.id);
  const measured = scope ? null : await f.db.one('SELECT revision FROM order_requirements WHERE order_id=?', order.id);
  const revision = scope?.revision ?? measured?.revision;
  assert.ok(revision, 'a scope revision exists to attest against');
  const v = await f.db.one('SELECT revision FROM vehicles WHERE id=?', vehicleId);
  const run = await f.db.one('SELECT revision FROM vehicle_runs WHERE vehicle_id=?', vehicleId);
  const last = await f.db.one(`SELECT o.dropoff_lng,o.dropoff_lat FROM capacity_reservations r JOIN orders o ON o.id=r.order_id
    WHERE r.vehicle_id=? AND o.status IN('assigned','at_pickup','in_transit','on_hold','returning') ORDER BY r.planned_end DESC,r.order_id DESC LIMIT 1`, vehicleId);
  const current = await f.db.one('SELECT pickup_lng,pickup_lat FROM orders WHERE id=?', order.id);
  return f.post(`/orders/${order.id}`, { expectedRevision: revision, approach: { vehicleId, expectedVehicleRevision: v.revision,
    expectedRunRevision: run.revision, from: { longitude: last?.dropoff_lng ?? 35.18, latitude: last?.dropoff_lat ?? 31.89 },
    to: { longitude: current.pickup_lng, latitude: current.pickup_lat }, seconds: 30,
    observedAt: Date.now() - 100, validUntil: Date.now() + 3600000, method: 'operator_attested' } });
}
const accept = (f, token, order, revision, expect = 200) =>
  f.call(`/jobs/${order.id}/accept`, { token, body: { capacityProtocol: 1, expectedRequirementsRevision: revision }, expect });
const advance = (f, token, id, expectedStatus, extra = {}, expect = 200) =>
  f.call(`/orders/${id}/advance`, { token, body: { requestId: randomUUID(), expectedStatus, ...extra }, expect });

// --- Migration 15, declared CRUD/validation, idempotent source, quote path ---
const f = await fixture('resscope');
try {
  assert.equal((await f.db.one('SELECT version FROM schema_migrations WHERE version=15'))?.version, 15, 'migration 15 is the WP12 migration');
  const tables = (await f.db.all("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('order_declared_scope','custody_records','order_scope_checks','private_objects','private_object_reads') ORDER BY table_name")).map(r => r.table_name);
  assert.deepEqual(tables, ['custody_records', 'order_declared_scope', 'order_scope_checks', 'private_object_reads', 'private_objects']);
  for (const table of tables) assert.ok(NON_LEGACY_TABLES.has(table), `${table} allowlisted for legacy import`);
  await f.setupCoverage(); await f.verify();
  const plain = await f.book();
  assert.equal(plain.declaredScope, undefined, 'orders without a declaration gain no scope object');
  const invalidBodies = [
    parcelScope(f, { massGrams: -5 }), parcelScope(f, { lengthMm: 0 }), parcelScope(f, { widthMm: 100001 }),
    parcelScope(f, { massGrams: 1000000001 }), parcelScope(f, { declaredValueMinor: -1 }),
    parcelScope(f, { volumeCm3: 999 }), parcelScope(f, { itemCount: 201 }), parcelScope(f, { crewCount: 2 }),
    parcelScope(f, { unknownField: 1 }), parcelScope(f, { dropoffPromisedBefore: f.now - 5000 }),
  ];
  for (const body of invalidBodies)
    assert.equal((await f.call(`/orders/${plain.id}/scope`, { token: f.customer.token, body, expect: 400 })).error, 'invalid_input');
  assert.equal((await f.call(`/orders/${plain.id}/scope`, { token: f.d1.token, body: parcelScope(f), expect: 403 })).error, 'forbidden', 'a driver cannot declare scope');
  const declared = await f.call(`/orders/${plain.id}/scope`, { token: f.customer.token, body: parcelScope(f) });
  assert.equal(declared.declaredScope.revision, 1);
  assert.equal(declared.declaredScope.volumeCm3, 2000, 'volume is the summed bounding volume');
  assert.equal(declared.declaredScope.itemCount, 2);
  const revised = await f.call(`/orders/${plain.id}/scope`, { token: f.customer.token, body: parcelScope(f, { sourceRef: 'merchant:scope-1' }) });
  assert.equal(revised.declaredScope.revision, 2);
  const replay = await f.call(`/orders/${plain.id}/scope`, { token: f.customer.token, body: parcelScope(f, { sourceRef: 'merchant:scope-1' }) });
  assert.equal(replay.declaredScope.revision, 2, 'same merchant reference + payload replays without a new revision');
  assert.equal((await f.call(`/orders/${plain.id}/scope`, { token: f.customer.token, body: parcelScope(f, { sourceRef: 'merchant:scope-1', massGrams: 3000 }), expect: 409 })).error,
    'idempotency_conflict', 'same merchant reference with a different payload fails loudly');
  const customerView = await f.call(`/orders/${plain.id}`, { token: f.customer.token });
  assert.equal(customerView.declaredScope.massGrams, 2000, 'the order serializes its declared scope');
  assert.equal(customerView.declaredScope.dropoffPromisedBefore, f.until - 1000, 'the promised window is recorded as data');
  const scopeRead = await f.call(`/orders/${plain.id}/scope`, { token: f.customer.token });
  assert.deepEqual(scopeRead.custody, []);
  const foreign = await f.account();
  await f.call(`/orders/${plain.id}/scope`, { token: foreign.token, expect: 404 });
  // Quote carries the scope; a booking that changes it is refused.
  const priceBody = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    contact: '0598700999', detail: 'Synthetic sealed item', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff',
    pickupPoint: { longitude: 35.19, latitude: 31.9 }, dropoffPoint: { longitude: 35.26, latitude: 32.22 }, declaredScope: parcelScope(f) };
  const priced = await f.call('/price', { token: f.customer.token, body: priceBody });
  assert.ok(priced.quoteId); assert.equal(priced.declaredScope.massGrams, 2000);
  assert.equal((await f.call('/orders', { token: f.customer.token, body: { ...priceBody, quoteId: priced.quoteId, declaredScope: parcelScope(f, { massGrams: 3000 }) }, expect: 409 })).error,
    'itinerary_changed', 'a booking cannot silently change the quoted scope');
  const quotedOrder = await f.call('/orders', { token: f.customer.token, body: { ...priceBody, quoteId: priced.quoteId, requestId: randomUUID() } });
  assert.equal(quotedOrder.declaredScope.massGrams, 2000, 'the quoted scope commits with the order');
  const bookedScoped = await f.book({ declaredScope: parcelScope(f, { sourceRef: 'merchant:booking-1' }) });
  assert.equal(bookedScoped.declaredScope.sourceRef, 'merchant:booking-1');
  console.log('WP12 resource-scope: migration 15, validation, merchant replay, quote/booking scope passed');
} finally { await f.close(); }

// --- Multi-pickup planned load, measured-over-declared, custody append-only ---
const g = await fixture('resmulti');
try {
  await g.setupCoverage(); await g.verify();
  const first = await g.book({ declaredScope: parcelScope(g, { itemCount: 1, massGrams: 6000 }) });
  await approachDeclared(g, first);
  assert.equal((await accept(g, g.d1.token, first, 1)).status, 'assigned');
  const stops = await g.db.all('SELECT * FROM capacity_stops WHERE order_id=? ORDER BY position', first.id);
  assert.equal(stops.length, 2); assert.equal(Number(stops[0].grams_delta), 6000); assert.equal(Number(stops[1].grams_delta), -6000, 'reserved capacity deltas are recorded per stop');
  const second = await g.book({ declaredScope: parcelScope(g, { itemCount: 1, massGrams: 6000 }) });
  await approachDeclared(g, second);
  assert.equal((await accept(g, g.d1.token, second, 1, 409)).error, 'measured_capacity_exceeded',
    'the full planned load (accepted, not yet picked up) is already reserved');
  assert.equal(Number((await g.db.one("SELECT COALESCE(sum(grams),0) total FROM capacity_reservations WHERE order_id=?", first.id)).total), 6000);
  const both = await g.book({ declaredScope: parcelScope(g, { itemCount: 1, massGrams: 9500 }) });
  await g.assess(both, { items: [{ count: 1, gramsEach: 100, lengthMm: 100, widthMm: 100, heightMm: 100 }] });
  const bothAccepted = await accept(g, g.d1.token, both, 1);
  assert.equal(bothAccepted.status, 'assigned');
  assert.equal(Number((await g.db.one('SELECT grams FROM capacity_reservations WHERE order_id=?', both.id)).grams), 100,
    'measured scope wins over declared when both exist');
  assert.equal((await g.call(`/orders/${first.id}/custody`, { token: g.d1.token, body: { kind: 'collected' } })).custody.length, 1);
  assert.equal((await g.call(`/orders/${first.id}/custody`, { token: g.customer.token, body: { kind: 'handed' } })).custody.length, 2);
  const foreign = await g.account();
  await g.call(`/orders/${first.id}/custody`, { token: foreign.token, body: { kind: 'collected' }, expect: 404 });
  await assert.rejects(() => g.db.run("UPDATE custody_records SET kind='handed' WHERE order_id=?", first.id), 'custody rows are append-only');
  await assert.rejects(() => g.db.run('DELETE FROM custody_records WHERE order_id=?', first.id), 'custody rows cannot be deleted');
  await advance(g, g.d1.token, both.id, 'assigned');
  const precedenceCheck = await g.call(`/orders/${both.id}/pickup-check`, { token: g.d1.token, body: { actual: { itemCount: 1, massGrams: 5000, lengthMm: 100, widthMm: 100, heightMm: 100 } } });
  assert.equal(precedenceCheck.scopeSource, 'measured', 'pickup comparison also uses the measured scope first');
  assert.equal(precedenceCheck.outcome, 'mismatch', 'an actual load inside the declaration but beyond the measurement still pauses');
  console.log('WP12 resource-scope: planned-load reservation, precedence, append-only custody passed');
} finally { await g.close(); }

// --- Pickup mismatch: pause, no driver fee, three resolution paths -----------
const h = await fixture('resmismatch');
const completeOrder = async (f2, order) => {
  const view = await f2.call(`/orders/${order.id}`, { token: f2.customer.token });
  await advance(f2, f2.d1.token, order.id, 'at_pickup');
  await advance(f2, f2.d1.token, order.id, 'in_transit', { code: view.handoverCode });
};
try {
  await h.setupCoverage(); await h.verify();
  const moneyOf = async id => { const o = await h.db.one('SELECT price,commission FROM orders WHERE id=?', id);
    return { price: o.price, commission: o.commission, cash: Number((await h.db.one('SELECT count(*) n FROM cash_entries')).n) }; };
  const first = await h.book({ declaredScope: parcelScope(h, { itemCount: 1, massGrams: 1000 }) });
  await approachDeclared(h, first); await accept(h, h.d1.token, first, 1);
  await advance(h, h.d1.token, first.id, 'assigned');
  assert.equal((await h.call(`/orders/${first.id}/pickup-check`, { token: h.d1.token, body: { actual: { itemCount: 1, massGrams: 1000, lengthMm: 100, widthMm: 100, heightMm: 100 } } })).outcome, 'matched');
  const beforeMoney = await moneyOf(first.id);
  const paused = await h.call(`/orders/${first.id}/pickup-check`, { token: h.d1.token, body: { actual: { itemCount: 1, massGrams: 5000, lengthMm: 100, widthMm: 100, heightMm: 100 } } });
  assert.equal(paused.outcome, 'mismatch'); assert.equal(paused.status, 'on_hold');
  const held = await h.call(`/orders/${first.id}`, { token: h.customer.token });
  assert.equal(held.status, 'on_hold'); assert.equal(held.exceptionReason, 'scope_mismatch');
  assert.equal((await h.call(`/orders/${first.id}/scope`, { token: h.d1.token, body: parcelScope(h), expect: 403 })).error, 'forbidden');
  assert.equal((await h.call(`/jobs/${first.id}/offer`, { token: h.d1.token, body: { price: 999 }, expect: 409 })).error, 'already_taken', 'a paused job accepts no driver-priced offer');
  assert.deepEqual(await moneyOf(first.id), beforeMoney, 'a mismatch never mutates price, commission or cash');
  const approved = await h.call(`/orders/${first.id}/scope`, { token: h.customer.token, body: parcelScope(h, { itemCount: 1, massGrams: 5000 }) });
  assert.equal(approved.resumed, true, 'a customer-approved scope change resumes the job');
  assert.equal((await h.call(`/orders/${first.id}`, { token: h.customer.token })).status, 'at_pickup');
  assert.deepEqual(await moneyOf(first.id), beforeMoney, 'an approved scope change still never mutates money');
  await completeOrder(h, first);
  const second = await h.book({ declaredScope: parcelScope(h, { itemCount: 1, massGrams: 1000 }) });
  await approachDeclared(h, second); await accept(h, h.d1.token, second, 1); await advance(h, h.d1.token, second.id, 'assigned');
  await h.call(`/orders/${second.id}/pickup-check`, { token: h.d1.token, body: { actual: { itemCount: 1, massGrams: 5000, lengthMm: 100, widthMm: 100, heightMm: 100 } } });
  assert.equal((await h.call(`/orders/${second.id}/scope/resolve`, { token: h.d1.token, body: { action: 'support', reason: 'Synthetic support exception' }, expect: 403 })).error, 'forbidden');
  assert.equal((await h.call(`/orders/${second.id}/scope/resolve`, { token: h.admin.token, body: { action: 'support', reason: 'Synthetic support exception' } })).resolution, 'support_exception');
  assert.equal((await h.call(`/orders/${second.id}`, { token: h.customer.token })).status, 'at_pickup');
  await completeOrder(h, second);
  const third = await h.book({ declaredScope: parcelScope(h, { itemCount: 1, massGrams: 1000 }) });
  await approachDeclared(h, third); await accept(h, h.d1.token, third, 1); await advance(h, h.d1.token, third.id, 'assigned');
  await h.call(`/orders/${third.id}/pickup-check`, { token: h.d1.token, body: { actual: { itemCount: 1, massGrams: 9500, lengthMm: 100, widthMm: 100, heightMm: 100 } } });
  assert.equal((await h.call(`/orders/${third.id}/scope/resolve`, { token: h.admin.token, body: { action: 'inspect' } })).resolution, 'inspected_capacity',
    'support inspection against the assigned vehicle resumes the job');
  const fourth = await h.book({ declaredScope: parcelScope(h, { itemCount: 1, massGrams: 1000 }) });
  await approachDeclared(h, fourth);
  await accept(h, h.d1.token, fourth, 1); await advance(h, h.d1.token, fourth.id, 'assigned');
  await h.call(`/orders/${fourth.id}/pickup-check`, { token: h.d1.token, body: { actual: { itemCount: 1, massGrams: 20000, lengthMm: 100, widthMm: 100, heightMm: 100 } } });
  assert.equal((await h.call(`/orders/${fourth.id}/scope/resolve`, { token: h.admin.token, body: { action: 'inspect' }, expect: 409 })).error,
    'measured_capacity_exceeded', 'inspection cannot certify an overload');
  const unscoped = await h.book();
  await h.call(`/jobs/${unscoped.id}/accept`, { token: h.d2.token, body: {} });
  await advance(h, h.d2.token, unscoped.id, 'assigned');
  assert.equal((await h.call(`/orders/${unscoped.id}/pickup-check`, { token: h.d2.token, body: { actual: { itemCount: 1, massGrams: 1000, lengthMm: 100, widthMm: 100, heightMm: 100 } }, expect: 409 })).error,
    'measured_requirements_missing', 'legacy unknown size keeps the inspection gate and invents no dimensions');
  console.log('WP12 resource-scope: mismatch pause, no-fee invariant, approve/support/inspect resolutions passed');
} finally { await h.close(); }

// --- Freight: equipment/crew validation at accept, negotiated flow ----------
const q = await fixture('resfreight');
try {
  const common = { ...q.common, vehicleClasses: ['car', 'van'] };
  const from = await q.post('/areas', { ...common, key: 'synthetic_from', geometry: polygon(35.19, 31.89, 35.21, 31.91) });
  const to = await q.post('/areas', { ...common, key: 'synthetic_to', geometry: polygon(35.25, 32.21, 35.27, 32.23) });
  await q.post('/routes', { ...common, key: 'synthetic_forward', fromAreaId: from.id, toAreaId: to.id, corridor: polygon(35.18, 31.88, 35.28, 32.24) });
  await q.activatePolicy();
  const freightDriver = async () => {
    const driver = await q.account('driver', 'van');
    const vehicle = await q.post('/vehicles', { ...q.vehicleBody, plate: `SYN-FR-${driver.user.id}`, class: 'van' });
    await q.verify(driver, vehicle.id);
    return { driver, vehicle };
  };
  const freightScope = (over = {}) => ({ equipment: ['straps'], crewCount: 2, loadingAfter: q.now - 1000, loadingBefore: q.until - 10000,
    accessConstraints: [], itemCount: 1, lengthMm: 100, widthMm: 100, heightMm: 100, massGrams: 500,
    declaredValueMinor: 1000, dropoffPromisedBefore: q.until - 1000, ...over });
  const bad = await freightDriver();
  const badOrder = await q.book({ service: 'freight', option: 'small', declaredScope: freightScope({ equipment: ['refrigeration'], accessConstraints: ['refrigeration'] }) });
  await approachDeclared(q, badOrder, bad.vehicle.id);
  assert.equal((await accept(q, bad.driver.token, badOrder, 1, 409)).error, 'equipment_unavailable', 'freight equipment mismatch is rejected at accept');
  const crew = await freightDriver();
  const crewOrder = await q.book({ service: 'freight', option: 'small', declaredScope: freightScope({ crewCount: 10 }) });
  await approachDeclared(q, crewOrder, crew.vehicle.id);
  assert.equal((await accept(q, crew.driver.token, crewOrder, 1, 409)).error, 'seats_unavailable', 'freight crew beyond the cab is rejected at accept');
  const good = await freightDriver();
  const negotiated = await q.book({ service: 'freight', option: 'small', pricing: 'smart', declaredScope: freightScope() });
  assert.ok(negotiated.recommendedPrice, 'freight keeps its negotiated recommended price');
  await approachDeclared(q, negotiated, good.vehicle.id);
  await q.call(`/jobs/${negotiated.id}/offer`, { token: good.driver.token, body: { price: negotiated.recommendedPrice, capacityProtocol: 1, expectedRequirementsRevision: 1 } });
  const accepted = await q.call(`/orders/${negotiated.id}/offers/${good.driver.user.id}/accept`, { token: q.customer.token, body: { capacityProtocol: 1, expectedRequirementsRevision: 1 } });
  assert.equal(accepted.status, 'assigned');
  assert.equal(accepted.declaredScope.loadingAfter, q.now - 1000);
  assert.equal(accepted.declaredScope.loadingBefore, q.until - 10000);
  assert.equal(accepted.declaredScope.dropoffPromisedBefore, q.until - 1000, 'freight promised windows are recorded and serialized');
  assert.ok(await q.db.one('SELECT order_id FROM capacity_reservations WHERE order_id=?', negotiated.id), 'the negotiated acceptance reserves the declared load');
  console.log('WP12 resource-scope: freight equipment/crew mismatch and negotiated acceptance passed');
} finally { await q.close(); }
