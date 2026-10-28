import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './eligibility-support.mjs';
import { acceptOffer, addDriver, assessRide, bookRide, myOffer } from './dispatch-support.mjs';

const rideFixture = label => fixture(label, { WIND_DISPATCH_TEST_ONLY: '1', WIND_BOARDING_TEST_ONLY: '1' });
const raw = (base, path, token, body = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, data: await r.json() }));
const advance = (f, token, id, expectedStatus, extra = {}, expect = 200) =>
  f.call(`/orders/${id}/advance`, { token, body: { requestId: randomUUID(), expectedStatus, ...extra }, expect });

async function startedRide(f) {
  await f.setupCoverage();
  const who = await addDriver(f, { latitude: 31.9, longitude: 35.19 });
  const order = await bookRide(f);
  await assessRide(f, order, [who.vehicle]);
  await f.call(`/orders/${order.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  const offer = await myOffer(f, order.id, who.driver);
  await acceptOffer(f, order.id, who.driver, offer);
  await f.call(`/orders/${order.id}/arrive`, { token: who.driver.token, body: {} });
  await advance(f, who.driver.token, order.id, 'assigned');
  const code = (await f.call(`/orders/${order.id}`, { token: f.customer.token })).ride.boardingCode;
  return { who, order, code };
}

// --- Start vs release: exactly one custody outcome ---------------------------
const f = await rideFixture('riderace1');
try {
  const { who, order, code } = await startedRide(f);
  const results = await Promise.all([
    raw(f.a.base, `/orders/${order.id}/advance`, who.driver.token, { requestId: randomUUID(), expectedStatus: 'at_pickup', boardingCode: code }),
    raw(f.b.base, `/orders/${order.id}/release`, who.driver.token, {}),
  ]);
  assert.equal(results.filter(r => r.status === 200).length, 1, `start vs release has one winner (${results.map(r => r.status)})`);
  const final = await f.db.one('SELECT status,driver_id FROM orders WHERE id=?', order.id);
  const lifecycle = await f.db.one('SELECT order_id FROM ride_lifecycle WHERE order_id=?', order.id);
  if (final.status === 'in_transit') {
    assert.equal(Number(final.driver_id), who.driver.user.id);
    assert.ok(lifecycle, 'the started ride keeps its lifecycle custody');
  } else {
    assert.equal(final.status, 'searching', 'a released ride returns to searching, never a started ride');
    assert.equal(final.driver_id, null);
    assert.equal(lifecycle, undefined, 'the released ride keeps no boarding custody');
  }
  console.log('WP11 ride-lifecycle-races: start vs release single winner passed');
} finally { await f.close(); }

// --- Complete vs safety hold: exactly one outcome ----------------------------
const g = await rideFixture('riderace2');
try {
  const { who, order, code } = await startedRide(g);
  await advance(g, who.driver.token, order.id, 'at_pickup', { boardingCode: code });
  const results = await Promise.all([
    raw(g.a.base, `/orders/${order.id}/advance`, who.driver.token, { requestId: randomUUID(), expectedStatus: 'in_transit' }),
    raw(g.b.base, `/orders/${order.id}/sos`, g.customer.token, { kind: 'other', note: 'Synthetic race drill' }),
  ]);
  assert.equal(results.filter(r => r.status === 200).length, 1, `complete vs safety hold has one winner (${results.map(r => r.status)})`);
  const final = await g.db.one('SELECT status,driver_id FROM orders WHERE id=?', order.id);
  const open = Number((await g.db.one("SELECT count(*) n FROM safety_incidents WHERE order_id=? AND status='open'", order.id)).n);
  if (final.status === 'completed') assert.equal(open, 0, 'a completed ride has no new safety hold');
  else {
    assert.equal(final.status, 'in_transit');
    assert.equal(open, 1, 'the held ride stays in transit under its driver');
    assert.equal(Number(final.driver_id), who.driver.user.id);
  }
  console.log('WP11 ride-lifecycle-races: complete vs safety-hold single winner passed');
} finally { await g.close(); }

// --- Duplicate return confirmation cannot double-count -----------------------
const h = await fixture('ridereturn');
try {
  await h.setupCoverage();
  await h.verify();
  const parcel = await h.book();
  await h.assess(parcel, {});
  await h.call(`/jobs/${parcel.id}/accept`, { token: h.d1.token, body: {} });
  await advance(h, h.d1.token, parcel.id, 'assigned');
  await advance(h, h.d1.token, parcel.id, 'at_pickup');
  const current = await h.call(`/orders/${parcel.id}`, { token: h.customer.token });
  assert.equal(current.status, 'in_transit', `parcel custody is in transit (${current.status})`);
  assert.equal((await h.call(`/orders/${parcel.id}/cancel`, { token: h.customer.token, body: {}, expect: 409 })).error, 'cannot_cancel', 'cancellation cannot orphan custody in transit');
  const held = await h.call(`/orders/${parcel.id}/exception`, { token: h.d1.token, body: { expectedStatus: 'in_transit', requestId: randomUUID(), reason: 'absent', note: 'Synthetic recipient absent' } });
  assert.equal(held.status, 'on_hold');
  await h.call(`/admin/orders/${parcel.id}/resolve`, { token: h.admin.token, body: { action: 'return', reason: 'Synthetic support return decision' } });
  const returning = await h.call(`/orders/${parcel.id}`, { token: h.customer.token });
  assert.equal(returning.status, 'returning');
  const returnRequest = { requestId: randomUUID(), expectedStatus: 'returning', code: returning.returnCode };
  const returned = await h.call(`/orders/${parcel.id}/advance`, { token: h.d1.token, body: returnRequest });
  assert.equal(returned.status, 'returned');
  const moneyOf = async () => ({
    order: await h.db.one('SELECT price,commission,discount,status,driver_id FROM orders WHERE id=?', parcel.id),
    cash: await h.db.all('SELECT kind,amount_cents,status FROM cash_entries ORDER BY id'),
  });
  const before = await moneyOf();
  assert.equal((await h.call(`/orders/${parcel.id}/advance`, { token: h.d1.token, body: returnRequest })).status, 'returned', 'a duplicate return advance replays');
  assert.equal((await h.call(`/admin/orders/${parcel.id}/resolve`, { token: h.admin.token, body: { action: 'confirm_return', reason: 'Synthetic duplicate confirmation' }, expect: 409 })).error, 'cannot_resolve');
  await advance(h, h.d1.token, parcel.id, 'returning', { code: returning.returnCode }, 409);
  assert.deepEqual(await moneyOf(), before, 'duplicate return confirmation changes no order or cash totals');
  console.log('WP11 ride-lifecycle-races: duplicate return confirmation and custody cancellation passed');
} finally { await h.close(); }
