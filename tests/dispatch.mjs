import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { acceptOffer, addDriver, assessRide, bookRide, dispatchFixture, myOffer } from './dispatch-support.mjs';

const f = await dispatchFixture('dispatch');
const { db, call } = f;
try {
  await f.setupCoverage();
  const near = await addDriver(f, { latitude: 31.9005, longitude: 35.195 });
  const far = await addDriver(f, { latitude: 31.99, longitude: 35.19 });
  const third = await addDriver(f, { latitude: 31.95, longitude: 35.20 });
  assert.equal((await call('/driver/presence', { token: near.driver.token })).eligibleForMatching, true, 'test-only dispatch makes a fully eligible idle driver matchable');

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
  assert.equal(await myOffer(f, booked.id, far.driver), null);
  assert.ok(!JSON.stringify(await call(`/orders/${booked.id}`, { token: f.customer.token })).includes(nearOffer.leaseNonce), 'the customer never sees the lease nonce');
  const stored = await db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid', nearOffer.id);
  assert.match(stored.nonce_hash, /^[a-f0-9]{64}$/);
  assert.ok(!Object.values(stored).includes(nearOffer.leaseNonce), 'only the nonce hash is stored');
  assert.equal(stored.eta_estimated, 1, 'no OSRM in tests: the straight-line estimate is marked, never faked as road ETA');
  assert.ok(Number(stored.expires_at) <= Number((await db.one('SELECT deadline_at FROM dispatch_rounds WHERE id=?::uuid', stored.round_id)).deadline_at));

  // Decline is idempotent and issues exactly the next ranked driver.
  const declined = await call(`/offers/${nearOffer.id}/decline`, { token: near.driver.token, body: {} });
  assert.equal(declined.state, 'declined');
  assert.equal((await call(`/offers/${nearOffer.id}/decline`, { token: near.driver.token, body: {} })).state, 'declined', 'a repeated decline replays');
  assert.equal((await call(`/offers/${nearOffer.id}/decline`, { token: far.driver.token, body: {}, expect: 404 })).error, 'not_found', 'only the owning driver may decline');
  const farOffer = await myOffer(f, booked.id, far.driver);
  assert.ok(farOffer && farOffer.id !== nearOffer.id, 'decline issued the next driver');

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
  const second = await bookRide(f);
  await assessRide(f, second, [near.vehicle, far.vehicle, third.vehicle]);
  await call(`/orders/${second.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  for (const candidate of [near, third, far]) {
    const offer = await myOffer(f, second.id, candidate.driver);
    if (offer) await call(`/offers/${offer.id}/decline`, { token: candidate.driver.token, body: {} });
  }
  let round = await db.one('SELECT * FROM dispatch_rounds WHERE order_id=? ORDER BY round_number DESC LIMIT 1', second.id);
  assert.equal(round.state, 'exhausted', 'all reachable drivers declining exhausts the round');
  assert.equal(Number(round.offers_issued), 2, 'the busy winner of the first trip is never offered the second');

  const lonely = await bookRide(f);
  await assessRide(f, lonely, []);
  await db.run("UPDATE driver_presence_sessions SET state='offline' WHERE state='online'");
  const noSupply = await call(`/orders/${lonely.id}/dispatch/retry`, { token: f.customer.token, body: {} });
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
