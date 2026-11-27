import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { Dispatch } from '../server/domain/dispatch.ts';
import { Eligibility } from '../server/domain/eligibility.ts';
import { DurableWorker } from '../server/worker.ts';
import { acceptOffer, addDriver, assessRide, bookRide, dispatchFixture, myOffer } from './dispatch-support.mjs';
import { apiCaller } from './support/api.mjs';

const boundedCall = fixture => apiCaller(() => fixture.a.base, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(3000) }));
const dispatchService = (db, eta) => {
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  return new Dispatch(db, new Eligibility(db, fail), fail, eta);
};

const f = await dispatchFixture('dispatch');
const { db, call } = f;
try {
  await f.setupCoverage();
  const near = await addDriver(f, { latitude: 31.9005, longitude: 35.195 });
  const far = await addDriver(f, { latitude: 31.99, longitude: 35.19 });
  const third = await addDriver(f, { latitude: 31.95, longitude: 35.20 });
  assert.equal((await call('/driver/presence', { token: near.driver.token })).eligibleForMatching, true, 'test-only dispatch makes a fully eligible idle driver matchable');
  assert.equal((await call('/me', { token: near.driver.token })).rideOfferSeconds, 20);
  assert.equal((await call('/driver/ride-offer-settings', { token: f.customer.token, body: { seconds: 40 }, expect: 403 })).error, 'forbidden');
  assert.equal((await call('/driver/ride-offer-settings', { token: far.driver.token, body: { seconds: 41 }, expect: 400 })).error, 'invalid_input');
  await call('/driver/ride-offer-settings', { token: far.driver.token, body: { seconds: 40 } });
  assert.equal((await call('/me', { token: far.driver.token })).rideOfferSeconds, 40);

  // Creation starts a round, but an unmeasured ride fails closed (prep A8) instead of broadcasting.
  const booked = await bookRide(f);
  assert.equal(booked.dispatch.state, 'exhausted');
  assert.equal(booked.dispatch.closeReason, 'no_driver');
  assert.equal(booked.dispatch.offersIssued, 0);
  await assessRide(f, booked, [near.vehicle, far.vehicle]);

  // Retry creates a fresh round at the same price and offers the nearest driver first.
  const retried = await call(`/orders/${booked.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  assert.equal(retried.dispatch.state, 'open');
  assert.equal(retried.dispatch.offersIssued, 1);
  assert.equal((await db.one('SELECT price FROM orders WHERE id=?', booked.id)).price, booked.price, 'retry never changes the price');
  const nearOffer = await myOffer(f, booked.id, near.driver);
  assert.ok(nearOffer?.leaseNonce, 'the offered driver sees the lease nonce; nobody else does');
  assert.equal(nearOffer.expiresAt - nearOffer.issuedAt, 20_000);
  assert.equal(await myOffer(f, booked.id, far.driver), null);
  assert.ok(!JSON.stringify(await call(`/orders/${booked.id}`, { token: f.customer.token })).includes(nearOffer.leaseNonce), 'the customer never sees the lease nonce');
  const stored = await db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid', nearOffer.id);
  assert.match(stored.nonce_hash, /^[a-f0-9]{64}$/);
  assert.ok(!Object.values(stored).includes(nearOffer.leaseNonce), 'only the nonce hash is stored');
  assert.equal(stored.eta_estimated, 1, 'no OSRM in tests: the straight-line estimate is marked, never faked as road ETA');
  assert.ok(Number(stored.expires_at) <= Number((await db.one('SELECT deadline_at FROM dispatch_rounds WHERE id=?::uuid', stored.round_id)).deadline_at));

  // A measured command on another order may hold the replacement captain while waiting for policy.
  const otherRider = await f.account();
  const otherRide = await bookRide(f, {}, otherRider);
  const declined = await db.atomic({ purpose: 'dispatch_test_contention' }, async () => {
    await db.one('SELECT id FROM orders WHERE id=? FOR UPDATE', otherRide.id);
    await db.one('SELECT id FROM users WHERE id=? FOR UPDATE', near.driver.user.id);
    await db.one('SELECT id FROM users WHERE id=? FOR UPDATE', far.driver.user.id);
    const response = await boundedCall(f)(`/offers/${nearOffer.id}/decline`, { token: near.driver.token, body: {} });
    assert.equal(response.dispatch.state, 'open');
    assert.equal(response.dispatch.offersIssued, 1, 'a locked replacement does not exhaust the round or skip to a lower rank');
    return response;
  });
  assert.equal(declined.state, 'declined');
  assert.equal(await new DurableWorker(db).processDispatchExpiries(), 1, 'worker fills the empty round when the replacement lock clears');
  const alerts = await db.one("SELECT COUNT(*) AS n FROM domain_events WHERE order_id=? AND type='notification.requested' AND payload->>'kind'='offer'", booked.id);
  assert.equal(Number(alerts.n), 2, 'both the original lease and the worker-issued replacement queue an alert');
  await call(`/orders/${otherRide.id}/cancel`, { token: otherRider.token, body: {} });
  assert.equal((await call(`/offers/${nearOffer.id}/decline`, { token: near.driver.token, body: {} })).state, 'declined', 'a repeated decline replays');
  assert.equal((await call(`/offers/${nearOffer.id}/decline`, { token: far.driver.token, body: {}, expect: 404 })).error, 'not_found', 'only the owning driver may decline');
  const farOffer = await myOffer(f, booked.id, far.driver);
  assert.ok(farOffer && farOffer.id !== nearOffer.id, 'decline issued the next driver');
  assert.equal(farOffer.expiresAt - farOffer.issuedAt, 40_000, 'captain preference applies to new offers');

  for (const expiresDuring of ['assignment', 'history']) {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const run = db.run.bind(db);
    const write = mock.method(db, 'run', async (sql, ...args) => {
      const result = await run(sql, ...args);
      if (expiresDuring === 'history' && sql.startsWith('INSERT INTO assignment_history')) mock.timers.setTime(farOffer.expiresAt);
      return result;
    });
    try {
      const dispatch = dispatchService(db);
      await assert.rejects(db.atomic({ purpose: 'dispatch_test_expiry' }, () => dispatch.acceptOffer({
        driverId: far.driver.user.id, orderId: booked.id, offerId: farOffer.id, leaseNonce: farOffer.leaseNonce,
      }, async () => {}, async () => {
        await db.run("UPDATE orders SET driver_id=?,status='assigned' WHERE id=?", far.driver.user.id, booked.id);
        assert.ok(await db.one('SELECT 1 FROM capacity_reservations WHERE order_id=?', booked.id));
        if (expiresDuring === 'assignment') mock.timers.setTime(farOffer.expiresAt);
        return {};
      })), { status: 409, message: 'offer_expired' });
      assert.equal((await db.one('SELECT status FROM orders WHERE id=?', booked.id)).status, 'searching');
      assert.equal(await db.one('SELECT 1 FROM capacity_reservations WHERE order_id=?', booked.id), undefined);
      assert.equal((await db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', farOffer.id)).state, 'open');
      assert.equal(await db.one('SELECT 1 FROM assignment_history WHERE order_id=?', booked.id), undefined);
    } finally { write.mock.restore(); mock.timers.reset(); }
  }

  // Atomic acceptance closes the round, revokes competitors and writes history + event.
  const accepted = await acceptOffer(f, booked.id, far.driver, farOffer);
  assert.equal(accepted.status, 'assigned');
  assert.equal(accepted.driverId, far.driver.user.id);
  assert.equal(accepted.dispatch.state, 'matched');
  assert.equal((await db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', farOffer.id)).state, 'accepted');
  assert.equal((await db.one('SELECT state,close_reason FROM dispatch_rounds WHERE order_id=? ORDER BY round_number DESC LIMIT 1', booked.id)).state, 'matched');
  const history = await db.one("SELECT * FROM assignment_history WHERE order_id=? AND action='assigned'", booked.id);
  assert.equal(Number(history.driver_id), far.driver.user.id);
  assert.ok(await db.one("SELECT 1 FROM domain_events WHERE order_id=? AND type='dispatch.matched'", booked.id), 'the match is a durable domain event');

  // Three declines exhaust; a fresh order with no supply exhausts as no_driver.
  const secondRider = await f.account();
  const second = await bookRide(f, {}, secondRider);
  await assessRide(f, second, [near.vehicle, far.vehicle, third.vehicle]);
  await call(`/orders/${second.id}/dispatch/retry`, { token: secondRider.token, body: {} });
  for (const candidate of [near, third, far]) {
    const offer = await myOffer(f, second.id, candidate.driver);
    if (offer) await call(`/offers/${offer.id}/decline`, { token: candidate.driver.token, body: {} });
  }
  let round = await db.one('SELECT * FROM dispatch_rounds WHERE order_id=? ORDER BY round_number DESC LIMIT 1', second.id);
  assert.equal(round.state, 'exhausted', 'all reachable drivers declining exhausts the round');
  assert.equal(Number(round.offers_issued), 2, 'the busy winner of the first trip is never offered the second');

  await call('/driver/ride-offer-settings', { token: third.driver.token, body: { seconds: 40 } });
  const lateOfferRider = await f.account();
  const lateOrder = await bookRide(f, {}, lateOfferRider);
  await assessRide(f, lateOrder, [near.vehicle, third.vehicle]);
  await call(`/orders/${lateOrder.id}/dispatch/retry`, { token: lateOfferRider.token, body: {} });
  const firstOffer = await myOffer(f, lateOrder.id, near.driver);
  await db.run("UPDATE dispatch_rounds SET deadline_at=? WHERE order_id=? AND state='open'", Date.now() + 30_000, lateOrder.id);
  const lateDecline = await call(`/offers/${firstOffer.id}/decline`, { token: near.driver.token, body: {} });
  assert.equal(lateDecline.dispatch.closeReason, 'deadline', 'the round never shortens a captain’s chosen window');
  assert.equal(Number(lateDecline.dispatch.offersIssued), 1);

  // Rollout order: the API never migrates PostgreSQL, so a new API can run on a schema-36 database without
  // users.ride_offer_seconds. Dispatch must keep the fixed 20 s window there, not fail every round.
  await db.run('DELETE FROM schema_migrations WHERE version=37');
  await db.run('ALTER TABLE users DROP COLUMN ride_offer_seconds');
  try {
    assert.equal((await call('/me', { token: third.driver.token })).rideOfferSeconds, undefined, 'no setting is offered before migration 37');
    assert.equal((await call('/driver/ride-offer-settings', { token: third.driver.token, body: { seconds: 30 }, expect: 409 })).error, 'dispatch_unavailable');
    const oldSchemaRider = await f.account();
    const oldSchemaOrder = await bookRide(f, {}, oldSchemaRider);
    await assessRide(f, oldSchemaOrder, [third.vehicle]);
    const oldSchemaRound = await call(`/orders/${oldSchemaOrder.id}/dispatch/retry`, { token: oldSchemaRider.token, body: {} });
    assert.equal(oldSchemaRound.dispatch.offersIssued, 1);
    const oldSchemaOffer = await myOffer(f, oldSchemaOrder.id, third.driver);
    assert.equal(oldSchemaOffer.expiresAt - oldSchemaOffer.issuedAt, 20_000, 'schema 36 keeps the default window');
    await call(`/offers/${oldSchemaOffer.id}/decline`, { token: third.driver.token, body: {} });
  } finally {
    await db.run('ALTER TABLE users ADD COLUMN ride_offer_seconds INTEGER NOT NULL DEFAULT 20 CHECK(ride_offer_seconds IN (20,30,40))');
    await db.run('INSERT INTO schema_migrations(version,applied_at) VALUES(37,?)', Date.now());
  }

  const lonelyRider = await f.account();
  const lonely = await bookRide(f, {}, lonelyRider);
  await assessRide(f, lonely, []);
  await db.run("UPDATE driver_presence_sessions SET state='offline' WHERE state='online'");
  const noSupply = await call(`/orders/${lonely.id}/dispatch/retry`, { token: lonelyRider.token, body: {} });
  assert.equal(noSupply.dispatch.state, 'exhausted');
  assert.equal(noSupply.dispatch.closeReason, 'no_driver');
  console.log('WP10 dispatch: creation fail-closed, retry, ranked sequential offers, decline->next, atomic accept, exhaustion and no-supply passed');
} finally { await f.close(); }

// Release before pickup re-dispatches to a new round and never re-offers the releaser.
const g = await dispatchFixture('dispatchrel');
try {
  await g.setupCoverage();
  const first = await addDriver(g, { latitude: 31.9005, longitude: 35.195 });
  const secondDriver = await addDriver(g, { latitude: 31.91, longitude: 35.20 });
  const order = await bookRide(g);
  await assessRide(g, order, [first.vehicle, secondDriver.vehicle]);
  await g.call(`/orders/${order.id}/dispatch/retry`, { token: g.customer.token, body: {} });
  const offer = await myOffer(g, order.id, first.driver);
  await acceptOffer(g, order.id, first.driver, offer);
  await g.call(`/orders/${order.id}/release`, { token: first.driver.token, body: {} });
  const after = await g.call(`/orders/${order.id}`, { token: g.customer.token });
  assert.equal(after.status, 'searching');
  assert.equal(after.dispatch.state, 'open', 'release opened a new round');
  assert.equal(await g.db.one('SELECT 1 FROM dispatch_offers WHERE order_id=? AND driver_id=? AND state=?', order.id, first.driver.user.id, 'open'), undefined, 'the releasing driver is excluded from the new round');
  await g.call(`/orders/${order.id}`, { token: first.driver.token, expect: 404 });
  assert.ok(await myOffer(g, order.id, secondDriver.driver), 'the next driver is offered the released ride');
  assert.ok(await g.db.one("SELECT 1 FROM assignment_history WHERE order_id=? AND action='released'", order.id));

  // Customer cancel revokes the open offer in the same transaction.
  await g.call(`/orders/${order.id}/cancel`, { token: g.customer.token, body: {} });
  const offers = await g.db.all('SELECT state FROM dispatch_offers WHERE order_id=? ORDER BY issued_at', order.id);
  assert.ok(offers.every(o => o.state !== 'open'), 'cancel left no open offer');
  assert.equal((await g.db.one('SELECT state,close_reason FROM dispatch_rounds WHERE order_id=? ORDER BY round_number DESC LIMIT 1', order.id)).state, 'cancelled');

  // Blocking the driver of a dispatched ride is a release: a new round, or nobody can accept it.
  const blockedRide = await bookRide(g);
  const nearest = await addDriver(g, { latitude: 31.90001, longitude: 35.195 });
  await assessRide(g, blockedRide, [nearest.vehicle, secondDriver.vehicle]);
  await g.call(`/orders/${blockedRide.id}/dispatch/retry`, { token: g.customer.token, body: {} });
  await acceptOffer(g, blockedRide.id, nearest.driver, await myOffer(g, blockedRide.id, nearest.driver));
  await g.call(`/admin/users/${nearest.driver.user.id}`, { token: g.admin.token, method: 'PATCH', body: { status: 'blocked', recovery: 'return' } });
  const reopened = await g.call(`/orders/${blockedRide.id}`, { token: g.customer.token });
  assert.equal(reopened.status, 'searching');
  assert.equal(reopened.dispatch.state, 'open', 'the block opened a new round');
  assert.ok(await g.db.one("SELECT 1 FROM assignment_history WHERE order_id=? AND driver_id=? AND action='released'", blockedRide.id, nearest.driver.user.id));
  await g.call(`/orders/${blockedRide.id}/cancel`, { token: g.customer.token, body: {} });
  await g.call(`/orders/${order.id}/dispatch/retry`, { token: g.customer.token, body: {}, expect: 409 });
  console.log('WP10 dispatch: release re-dispatch excluding the releaser and cancel revocation passed');
} finally { await g.close(); }

const h = await dispatchFixture('dispatchseats');
try {
  await h.setupCoverage([], ['car', 'motorcycle']);
  const motorcycle = await addDriver(h, { vehicleClass: 'motorcycle', seats: 2, latitude: 31.9, longitude: 35.19 });
  const car = await addDriver(h, { latitude: 31.91, longitude: 35.20 });
  const order = await bookRide(h, { option: '2' });
  await h.assess(order, { items: [], seats: 2 });
  for (const candidate of [motorcycle, car]) await h.approach(order, { vehicleId: candidate.vehicle.id });
  await h.call(`/orders/${order.id}/dispatch/retry`, { token: h.customer.token, body: {} });
  assert.ok((await myOffer(h, order.id, motorcycle.driver)) === null, 'dispatch applies the installed ride-class limit before issuing a lease');
  const offer = await myOffer(h, order.id, car.driver);
  assert.ok(offer, 'the eligible car gets the first offer');
  assert.equal((await acceptOffer(h, order.id, car.driver, offer)).driverId, car.driver.user.id, 'the offered car can accept');
  console.log('Dispatch private-party shortlist and assignment agree on passenger capacity');

  const spareCar = await addDriver(h, { latitude: 31.91, longitude: 35.20 });
  const measuredRider = await h.account();
  const measured = await bookRide(h, {}, measuredRider);
  await h.assess(measured, { items: [], seats: 2 });
  for (const candidate of [motorcycle, spareCar]) await h.approach(measured, { vehicleId: candidate.vehicle.id });
  assert.equal((await h.call(`/jobs/${measured.id}/accept`, { token: motorcycle.driver.token, body: {}, expect: 409 })).error, 'seats_unavailable');
  await h.call(`/orders/${measured.id}/dispatch/retry`, { token: measuredRider.token, body: {} });
  assert.equal(await myOffer(h, measured.id, motorcycle.driver), null, 'the assessment can raise demand beyond the booked seats');
  assert.ok(await myOffer(h, measured.id, spareCar.driver), 'the compatible car fits the measured demand');
  await h.call(`/orders/${measured.id}/cancel`, { token: measuredRider.token, body: {} });
  const oneSeatCar = await addDriver(h, { seats: 1, latitude: 31.9, longitude: 35.19 });
  for (const [holder, repair] of [[motorcycle, 'retry'], [motorcycle, 'worker'], [oneSeatCar, 'retry'], [oneSeatCar, 'worker']]) {
    const rider = await h.account();
    const legacy = await bookRide(h, {}, rider);
    await assessRide(h, legacy, [holder.vehicle, spareCar.vehicle]);
    await h.call(`/orders/${legacy.id}/dispatch/retry`, { token: rider.token, body: {} });
    const oldOffer = await myOffer(h, legacy.id, holder.driver);
    assert.ok(oldOffer && oldOffer.expiresAt > Date.now(), 'fixture holds an unexpired one-passenger lease');
    // Model the previous matcher's open lease against booked demand or a higher measured demand.
    if (repair === 'retry') {
      await h.db.run("UPDATE orders SET option='2' WHERE id=?", legacy.id);
      await h.call(`/orders/${legacy.id}/share`, { token: rider.token, body: {} });
      const snapshot = await h.db.one('SELECT o.version, f.order_revision FROM orders o JOIN dispatch_offers f ON f.order_id=o.id WHERE f.id=?::uuid', oldOffer.id);
      assert.notEqual(snapshot.version, snapshot.order_revision, 'repair must advance despite an old order revision');
    }
    await h.db.run('UPDATE order_requirements SET seats=2 WHERE order_id=?', legacy.id);
    assert.equal(await myOffer(h, legacy.id, holder.driver), null, 'the invalid lease is hidden immediately');
    if (repair === 'retry') await h.call(`/orders/${legacy.id}/dispatch/retry`, { token: rider.token, body: {} });
    else assert.equal(await new DurableWorker(h.db).processDispatchExpiries(), 1, 'worker retires an invalid lease before expiry');
    assert.equal((await h.db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', oldOffer.id)).state, 'revoked');
    assert.ok(await myOffer(h, legacy.id, spareCar.driver), 'the same round advances to the compatible car');
    await h.call(`/orders/${legacy.id}/cancel`, { token: rider.token, body: {} });
  }
  console.log('Dispatch retry and worker revoke stale incompatible offers and advance the open round');

  const edited = await addDriver(h, { latitude: 31.9, longitude: 35.19 });
  const rider = await h.account();
  const ride = await bookRide(h, { option: '2' }, rider);
  await h.assess(ride, { items: [], seats: 2 });
  for (const candidate of [edited, spareCar]) await h.approach(ride, { vehicleId: candidate.vehicle.id });
  await h.call(`/orders/${ride.id}/dispatch/retry`, { token: rider.token, body: {} });
  const oldOffer = await myOffer(h, ride.id, edited.driver);
  assert.ok(oldOffer, 'the approved four-seat car starts with the lease');
  const current = await h.db.one('SELECT revision FROM vehicles WHERE id=?', edited.vehicle.id);
  await h.call(`/admin/eligibility/vehicles/${edited.vehicle.id}`, { token: h.admin.token, method: 'PATCH',
    body: { ...h.vehicleBody, ...h.evidence, plate: `SYN-DISP-${edited.driver.user.id}`, class: 'motorcycle', expectedRevision: Number(current.revision) } });
  assert.equal(await myOffer(h, ride.id, edited.driver), null, 'vehicle reclassification hides the lease before the stored driver profile changes');

  const boundedRetry = boundedCall(h);
  const contestedLocks = [
    ['SELECT id FROM eligibility_policy WHERE id=1 FOR UPDATE', []],
    ['SELECT id FROM users WHERE id=? FOR UPDATE', [edited.driver.user.id]],
    ['SELECT id FROM vehicles WHERE id=? FOR UPDATE', [spareCar.vehicle.id]],
  ];
  for (const [sql, args] of contestedLocks) {
    await h.db.atomic({ purpose: 'dispatch_test_contention' }, async () => {
      await h.db.one(sql, ...args);
      const attempt = await boundedRetry(`/orders/${ride.id}/dispatch/retry`, { token: rider.token, body: {} });
      assert.equal(attempt.dispatch.state, 'open');
      assert.equal((await h.db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', oldOffer.id)).state, 'open', 'contended repair must leave the offer available for the worker to retry');
    });
  }
  assert.equal(await new DurableWorker(h.db).processDispatchExpiries(), 1);
  assert.equal((await h.db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', oldOffer.id)).state, 'revoked');
  assert.ok(await myOffer(h, ride.id, spareCar.driver), 'after reclassification the live round advances to the spare car');
  await h.call(`/orders/${ride.id}/cancel`, { token: rider.token, body: {} });

  const relinked = await addDriver(h, { latitude: 31.9, longitude: 35.19 });
  const relinkedRide = await bookRide(h, { option: '2' }, rider);
  await h.assess(relinkedRide, { items: [], seats: 2 });
  for (const candidate of [relinked, spareCar]) await h.approach(relinkedRide, { vehicleId: candidate.vehicle.id });
  await h.call(`/orders/${relinkedRide.id}/dispatch/retry`, { token: rider.token, body: {} });
  const relinkedOffer = await myOffer(h, relinkedRide.id, relinked.driver);
  assert.ok(relinkedOffer, 'the original four-seat vehicle qualified');
  await h.reviewDriver(relinked.driver, 'approved', oneSeatCar.vehicle.id);
  assert.equal(await myOffer(h, relinkedRide.id, relinked.driver), null, 'the offer no longer belongs to the selected vehicle');
  assert.equal(await new DurableWorker(h.db).processDispatchExpiries(), 1);
  assert.equal((await h.db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', relinkedOffer.id)).state, 'revoked');
  assert.ok(await myOffer(h, relinkedRide.id, spareCar.driver), 'the round advances after the captain is relinked');
  await h.call(`/orders/${relinkedRide.id}/cancel`, { token: rider.token, body: {} });

  const stalePresence = await addDriver(h, { latitude: 31.9, longitude: 35.19 });
  const staleApproach = await addDriver(h, { latitude: 31.901, longitude: 35.19 });
  const staleFix = await addDriver(h, { latitude: 31.902, longitude: 35.19 });
  const staleObservation = await addDriver(h, { latitude: 31.903, longitude: 35.19 });
  for (const repair of ['retry', 'worker']) {
    const shared = await bookRide(h, { option: '2' }, rider);
    await h.assess(shared, { items: [], seats: 2 });
    for (const candidate of [stalePresence, spareCar]) await h.approach(shared, { vehicleId: candidate.vehicle.id });
    await h.call(`/orders/${shared.id}/dispatch/retry`, { token: rider.token, body: {} });
    const lease = await myOffer(h, shared.id, stalePresence.driver);
    assert.ok(lease);
    await h.call(`/orders/${shared.id}/share`, { token: rider.token, body: {} });
    assert.equal(await myOffer(h, shared.id, stalePresence.driver), null, 'a share-only version change hides the old lease');
    if (repair === 'retry') await h.call(`/orders/${shared.id}/dispatch/retry`, { token: rider.token, body: {} });
    else assert.equal(await new DurableWorker(h.db).processDispatchExpiries(), 1);
    assert.equal((await h.db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', lease.id)).state, 'revoked');
    assert.ok(await myOffer(h, shared.id, spareCar.driver), 'the replacement matches the current order revision');
    await h.call(`/orders/${shared.id}/cancel`, { token: rider.token, body: {} });
  }

  const delayedRide = await bookRide(h, { option: '2' }, rider);
  await h.assess(delayedRide, { items: [], seats: 2 });
  for (const candidate of [stalePresence, staleFix, spareCar]) await h.approach(delayedRide, { vehicleId: candidate.vehicle.id });
  const start = Date.now();
  const expired = start + 2500;
  await h.db.run('UPDATE driver_presence_sessions SET lease_until=? WHERE driver_id=?', expired, stalePresence.driver.user.id);
  await h.db.run('UPDATE driver_latest_locations SET effective_at=? WHERE driver_id=?', start - 29_500, staleFix.driver.user.id);
  await h.approach(delayedRide, { vehicleId: staleApproach.vehicle.id, seconds: 2, validUntil: expired + 750 });
  await h.approach(delayedRide, { vehicleId: staleObservation.vehicle.id, observedAt: start - 298_000 });
  const priorTestEnvironment = process.env.NODE_ENV;
  const priorDispatchFlag = process.env.WIND_DISPATCH_TEST_ONLY;
  process.env.NODE_ENV = 'test';
  process.env.WIND_DISPATCH_TEST_ONLY = '1';
  mock.timers.enable({ apis: ['Date'], now: start });
  try {
    const dispatch = dispatchService(h.db, async from => {
      mock.timers.setTime(expired);
      if (from.latitude === 31.902) await h.db.run('UPDATE driver_latest_locations SET effective_at=?,lat=? WHERE driver_id=?', expired, 31.92, staleFix.driver.user.id);
      return { seconds: Math.round(Math.abs(from.latitude - 31.9) * 5000) + 1, estimated: true };
    });
    await h.db.atomic({ purpose: 'dispatch_test_freshness' }, () => dispatch.startRound(delayedRide.id, start));
    assert.equal(await myOffer(h, delayedRide.id, stalePresence.driver), null);
    assert.equal(await myOffer(h, delayedRide.id, staleApproach.driver), null);
    assert.equal(await myOffer(h, delayedRide.id, staleFix.driver), null);
    assert.equal(await myOffer(h, delayedRide.id, staleObservation.driver), null);
    assert.ok(await myOffer(h, delayedRide.id, spareCar.driver), 'only current presence and approach evidence can hold the next lease');
  } finally {
    mock.timers.reset();
    if (priorTestEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorTestEnvironment;
    if (priorDispatchFlag === undefined) delete process.env.WIND_DISPATCH_TEST_ONLY;
    else process.env.WIND_DISPATCH_TEST_ONLY = priorDispatchFlag;
  }
} finally { await h.close(); }
