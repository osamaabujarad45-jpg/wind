// Same parcel race contract across two PostgreSQL API processes. Requires loopback WIND_TEST_DATABASE_URL.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PARCEL_LOAD } from '../src/model.ts';
import { expoDestination } from '../server/domain/events.ts';
import { fixture } from './eligibility-support.mjs';

const modes = ['action-first', 'cancel-first', ...Array.from({ length: 20 }, (_, i) => i % 2 ? 'race-action-first' : 'race-cancel-first')];
async function pair(cancel, action, mode) {
  if (mode === 'cancel-first') return [await cancel(), await action()];
  if (mode === 'action-first') { const result = await action(); return [await cancel(), result]; }
  if (mode === 'race-action-first') {
    const [acted, cancelled] = await Promise.all([action(), cancel()]);
    return [cancelled, acted];
  }
  return Promise.all([cancel(), action()]);
}
const post = async (base, path, headers, body) => {
  // A 503 is the API's retryable answer to a lock wait past lock_timeout, not a race outcome, and nothing was applied: send it again.
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await response.text();
    if (response.status === 503 && attempt < 5) { await new Promise(resolve => setTimeout(resolve, 200)); continue; }
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  }
};
const raw = (base, path, token, body = {}) => post(base, path, { Authorization: `Bearer ${token}` }, body);
const partnerKey = 'synthetic-cancel-race-partner-key';
const ok = (result, label) => {
  assert.equal(result.status, 200, `${label}: ${JSON.stringify(result)}`);
  return result.data;
};
const no5xx = (results, label) => {
  for (const result of results) assert.ok(result.status < 500, `${label}: ${JSON.stringify(result)}`);
};

const f = await fixture('cancelrace', { WIND_DISPATCH_TEST_ONLY: '1', SOUQ_PARTNER_KEY: partnerKey });
try {
  assert.notEqual(f.a.child.pid, f.b.child.pid, 'race requests must use independent API processes');
  // The shared fixture starts with 0598 numbers; give this test's synthetic actors the requested 0599 range before enrollment.
  for (const [i, account] of [f.admin, f.customer, f.d1, f.d2].entries())
    await f.db.run('UPDATE users SET phone=? WHERE id=?', `059997${String(i + 11).padStart(4, '0')}`, account.user.id);
  await f.setupCoverage();
  await f.verify();
  const driver = f.d1, customer = f.customer;
  const expoToken = `ExponentPushToken[pg-cancel-race-${randomUUID()}]`;
  await f.call('/push/native/register', { token: driver.token,
    body: { expoPushToken: expoToken, deviceId: randomUUID(), platform: 'android', lang: 'en' } });
  const token = await f.db.one('SELECT token_hash FROM native_push_tokens WHERE user_id=?', driver.user.id);
  assert.ok(token, 'driver has a registered notification destination');
  const destination = expoDestination(driver.user.id, token.token_hash);
  const view = id => f.call(`/orders/${id}`, { token: customer.token });
  const earnings = async () => (await f.call('/driver/earnings', { token: driver.token })).all;
  const cancel = (id, base = f.a.base) => raw(base, `/orders/${id}/cancel`, customer.token);
  const accept = (id, base = f.b.base) => raw(base, `/jobs/${id}/accept`, driver.token);
  const advance = (id, expectedStatus, extra = {}, base = f.b.base) => raw(base, `/orders/${id}/advance`, driver.token,
    { requestId: randomUUID(), expectedStatus, ...extra });
  async function book(extra = {}, prepare = true) {
    const order = await f.book({ contact: '0599970012', ...extra });
    if (prepare) { await f.assess(order, { approach: false }); await f.approach(order); }
    return order;
  }
  async function cancelledAssignment(order, accepted, label) {
    const final = await view(order.id);
    assert.equal(final.status, 'cancelled', label);
    assert.equal(final.driverId, accepted ? driver.user.id : null, `${label}: assignment matches accept outcome`);
    assert.equal((await f.other(`/orders/${order.id}`, { token: customer.token })).status, 'cancelled', `${label}: other process agrees`);
    // assignment_history is written by dispatch accepts, not this legacy parcel accept path.
    assert.equal((await f.db.one('SELECT COUNT(*) n FROM assignment_history WHERE order_id=?', order.id)).n, 0,
      `${label}: no invented dispatch assignment history`);
    const reservation = await f.db.one('SELECT driver_id,vehicle_id FROM capacity_reservations WHERE order_id=?', order.id);
    if (accepted) {
      assert.ok(reservation, `${label}: measured acceptance was recorded`);
      assert.equal(reservation.driver_id, driver.user.id, label);
      assert.equal(reservation.vehicle_id, f.vehicle.id, label);
    } else assert.equal(reservation, undefined, `${label}: losing accept records no reservation`);
    // queuePush writes notification.requested to domain_events and the driver's destination to outbox.
    const queued = await f.db.all(`SELECT e.payload,q.status FROM domain_events e JOIN outbox q ON q.event_id=e.id
      WHERE e.order_id=? AND e.type='notification.requested' AND e.payload->>'kind'='cancelled' AND q.destination=?`, order.id, destination);
    assert.equal(queued.length, accepted ? 1 : 0, `${label}: cancellation is queued for the accepted courier`);
    if (accepted) {
      assert.equal(queued[0].status, 'pending', label);
      assert.equal(queued[0].payload.status, 'cancelled', label);
    }
    assert.ok(!(await f.call('/jobs', { token: driver.token })).some(job => job.id === order.id), `${label}: absent from jobs`);
    assert.ok(!(await f.other('/jobs', { token: driver.token })).some(job => job.id === order.id), `${label}: absent on other process`);
  }
  async function freshAcceptance(label) {
    const order = await book();
    assert.equal(ok(await accept(order.id), `${label}: new parcel accepted`).status, 'assigned');
    assert.equal(ok(await cancel(order.id), `${label}: new parcel cancelled`).status, 'cancelled');
    await cancelledAssignment(order, true, label);
  }

  // A: alternate which process cancels; no retries or 503 exceptions are scored as valid outcomes.
  let replacements = 0;
  for (const [round, mode] of modes.entries()) {
    const order = await book(), label = `A ${mode} ${round} order=${order.id}`;
    assert.equal(order.status, 'searching');
    const cancelBase = round % 2 ? f.b.base : f.a.base, acceptBase = round % 2 ? f.a.base : f.b.base;
    const [cancelled, accepted] = await pair(() => cancel(order.id, cancelBase), () => accept(order.id, acceptBase), mode);
    no5xx([cancelled, accepted], label);
    assert.equal(ok(cancelled, label).status, 'cancelled');
    if (mode === 'action-first') assert.equal(accepted.status, 200, label);
    if (mode === 'cancel-first') assert.ok(accepted.status >= 400 && accepted.status < 500, label);
    if (accepted.status === 200) assert.equal(accepted.data.status, 'assigned', label);
    else assert.ok(accepted.status >= 400 && accepted.status < 500, `${label}: accept loses with 4xx`);
    await cancelledAssignment(order, accepted.status === 200, label);
    await freshAcceptance(`${label}: load released`);
    replacements++;
  }
  while (replacements <= PARCEL_LOAD) await freshAcceptance(`A load cycle ${++replacements}`);
  assert.ok(replacements > PARCEL_LOAD, 'new successful accept/cancel cycles exceed the actual parcel-load limit');
  assert.deepEqual(await earnings(), { jobs: 0, gross: 0, commission: 0, net: 0 });

  // B: establish pickup via HTTP, not private status writes. Parcel pickup has no boarding PIN.
  for (const [round, mode] of modes.entries()) {
    const order = await book(), label = `B ${mode} ${round} order=${order.id}`;
    ok(await accept(order.id), label);
    assert.equal(ok(await advance(order.id, 'assigned'), label).status, 'at_pickup');
    const before = await earnings();
    const cancelBase = round % 2 ? f.b.base : f.a.base, advanceBase = round % 2 ? f.a.base : f.b.base;
    const [cancelled, advanced] = await pair(() => cancel(order.id, cancelBase),
      () => advance(order.id, 'at_pickup', {}, advanceBase), mode);
    no5xx([cancelled, advanced], label);
    assert.equal([cancelled, advanced].filter(r => r.status === 200).length, 1, `${label}: exactly one success`);
    const final = await view(order.id);
    assert.equal((await f.other(`/orders/${order.id}`, { token: customer.token })).status, final.status, `${label}: processes agree`);
    if (final.status === 'cancelled') {
      assert.equal(ok(cancelled, label).status, 'cancelled');
      assert.equal(advanced.status, 409, label);
      assert.equal(advanced.data.error, 'cannot_advance', label);
      assert.deepEqual(await earnings(), before, `${label}: no earnings or counted commission`);
    } else {
      assert.equal(final.status, 'in_transit', label);
      assert.equal(ok(advanced, label).status, 'in_transit');
      assert.equal(cancelled.status, 409, label);
      assert.equal(cancelled.data.error, 'cannot_cancel', label);
      assert.deepEqual(await earnings(), before, `${label}: pickup is not a paid completion`);
      assert.ok(final.handoverCode, `${label}: sender has delivery proof`);
      const completed = ok(await advance(order.id, 'in_transit', { code: final.handoverCode }), label);
      assert.equal(completed.status, 'completed');
      const after = await earnings();
      assert.equal(after.jobs, before.jobs + 1);
      assert.equal(after.gross, before.gross + completed.price);
      assert.equal(after.commission, before.commission + completed.commission);
      assert.equal(after.net, Math.round((after.gross - after.commission) * 100) / 100);
    }
    if (mode === 'cancel-first') assert.equal(final.status, 'cancelled', label);
    if (mode === 'action-first') assert.equal(final.status, 'in_transit', label);
  }

  // C: future parcels use the fixture's booking path but need no measured acceptance assessment.
  const DAY = 86_400_000;
  for (const [round, mode] of modes.entries()) {
    const order = await book({ scheduledFor: Date.now() + DAY }, false), label = `C ${mode} ${round} order=${order.id}`;
    assert.equal(order.status, 'searching', label);
    assert.ok(order.scheduledFor > Date.now() + 3_600_000, `${label}: scheduled outside the release window`);
    const moved = Date.now() + 2 * DAY;
    const cancelBase = round % 2 ? f.b.base : f.a.base, scheduleBase = round % 2 ? f.a.base : f.b.base;
    const [cancelled, scheduled] = await pair(() => cancel(order.id, cancelBase),
      () => raw(scheduleBase, `/orders/${order.id}/schedule`, customer.token, { scheduledFor: moved }), mode);
    no5xx([cancelled, scheduled], label);
    assert.equal(ok(cancelled, label).status, 'cancelled');
    assert.ok(scheduled.status === 200 || (scheduled.status === 409 && scheduled.data.error === 'cannot_reschedule'), label);
    if (mode === 'action-first') assert.equal(scheduled.status, 200, label);
    if (mode === 'cancel-first') assert.equal(scheduled.status, 409, label);
    assert.equal((await view(order.id)).status, 'cancelled', label);
    const retry = await raw(scheduleBase, `/orders/${order.id}/schedule`, customer.token, { scheduledFor: Date.now() + 3 * DAY });
    assert.equal(retry.status, 409, label);
    assert.equal(retry.data.error, 'cannot_reschedule', label);
    assert.equal((await view(order.id)).status, 'cancelled', `${label}: remains cancelled after reschedule retry`);
    assert.equal((await f.other(`/orders/${order.id}`, { token: customer.token })).status, 'cancelled', `${label}: other process agrees`);
  }

  // D: partner cancel runs outside the HTTP envelope, so it holds no row lock while it reads: a driver can accept before its update.
  const sample = await book({}, false);
  ok(await cancel(sample.id), 'D sample');
  const delivery = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: '0599970013', pickupContact: '0599970014',
    detail: 'Synthetic sealed item', pickupNote: 'Synthetic pickup', dropoffNote: 'Synthetic dropoff', pickupPoint: sample.pickupPoint, dropoffPoint: sample.dropoffPoint };
  const partner = (base, path, body = {}) => post(base, path, { 'X-Partner-Key': partnerKey }, body);
  const quoted = ok(await partner(f.a.base, '/partner/quotes', delivery), 'D quote').price;
  let accepts = 0;
  for (let round = 0; round < 40; round++) {
    const label = `D ${round}`;
    const order = ok(await partner(f.a.base, '/partner/orders', { ...delivery, externalRef: `cancel-race:${round}:${randomUUID()}`, quotedPrice: quoted }), label);
    await f.assess(order, { approach: false });
    await f.approach(order);
    const cancelBase = round % 2 ? f.b.base : f.a.base, acceptBase = round % 2 ? f.a.base : f.b.base;
    const lag = round % 20; // staggered so the accept lands anywhere around the cancel's read
    const [accepted, cancelled] = await Promise.all([accept(order.id, acceptBase),
      new Promise(resolve => setTimeout(resolve, lag)).then(() => partner(cancelBase, `/partner/orders/${order.id}/cancel`))]);
    no5xx([accepted, cancelled], label);
    assert.equal(ok(cancelled, label).status, 'cancelled', label);
    if (accepted.status !== 200) continue;
    accepts++;
    const queued = await f.db.all(`SELECT e.id FROM domain_events e JOIN outbox q ON q.event_id=e.id
      WHERE e.order_id=? AND e.type='notification.requested' AND e.payload->>'kind'='cancelled' AND q.destination=?`, order.id, destination);
    assert.equal(queued.length, 1, `${label} lag=${lag}: a courier whose accept succeeded must hear about the partner's cancel`);
  }
  assert.ok(accepts > 0, 'D: at least one accept must win, or the race proved nothing');
} finally {
  try {
    await Promise.all([f.a.stop(), f.b.stop()]);
    // The fixture's temporary PostgreSQL database is this isolated schema; stop both writers before removing it.
    await f.db.run(`DROP SCHEMA "${f.schema}" CASCADE`);
  } finally { await f.close(); }
}
console.log('pg-cancel-race: ok');
