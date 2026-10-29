import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { acceptOffer, addDriver, assessRide, bookRide, dispatchFixture, myOffer } from './dispatch-support.mjs';
import { leaseNonceFor, leaseNonceHash } from '../server/domain/dispatch.ts';
import { DurableWorker } from '../server/worker.ts';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid'; // T37: the worker refuses an unconfigured VAPID subject

const raw = (base, path, token, body = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, data: await r.json() }));

/** A rival driver with a direct DB session (login throttles would cap the 100-way race). */
let rivalSeq = 0;
async function rivalDriver(f) {
  const token = randomBytes(32).toString('hex');
  const id = Number((await f.db.run("INSERT INTO users(phone,name,password,role,status,vehicle,created_at,approved_at) VALUES(?,?,'x','driver','active','car',?,?)",
    `0599${String(200000 + rivalSeq++).padStart(6, '0')}`, 'Synthetic rival', Date.now(), Date.now())).lastInsertRowid);
  await f.db.run('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)', createHash('sha256').update(token).digest('hex'), id, Date.now());
  return { token, user: { id } };
}

/** Insert a structurally valid open offer directly, to set up accept-level races the issuer cannot create. */
async function craftOffer(f, order, who) {
  const db = f.db, now = Date.now();
  const d = await db.one('SELECT * FROM driver_eligibility WHERE driver_id=?', who.driver.user.id);
  const v = await db.one('SELECT * FROM vehicles WHERE id=?', d.vehicle_id);
  const policy = await db.one('SELECT revision FROM eligibility_policy WHERE id=1');
  const req = await db.one('SELECT revision FROM order_requirements WHERE order_id=?', order.id);
  const run = await db.one('SELECT revision FROM vehicle_runs WHERE vehicle_id=?', v.id);
  const session = await db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=?', who.driver.user.id);
  const current = await db.one('SELECT version,assignment_epoch FROM orders WHERE id=?', order.id);
  const last = await db.one('SELECT COALESCE(MAX(round_number),0) n FROM dispatch_rounds WHERE order_id=?', order.id);
  const roundId = randomUUID(), offerId = randomUUID();
  await db.run("INSERT INTO dispatch_rounds(id,order_id,round_number,state,started_at,deadline_at,offers_issued) VALUES(?::uuid,?,?, 'open',?,?,1)", roundId, order.id, Number(last.n) + 1, now, now + 90_000);
  const nonce = leaseNonceFor(offerId, session.auth_session_hash);
  await db.run(`INSERT INTO dispatch_offers(id,round_id,order_id,driver_id,state,nonce_hash,issued_at,expires_at,order_revision,assignment_epoch,presence_session_id,vehicle_id,driver_revision,vehicle_revision,policy_revision,requirements_revision,run_revision,pickup_eta_seconds,idle_seconds,idle_credit_seconds,rank_score,eta_estimated)
    VALUES(?::uuid,?::uuid,?,?,'open',?,?,?,?,?,?::uuid,?,?,?,?,?,?,?,?,?,?,1)`, offerId, roundId, order.id, who.driver.user.id, leaseNonceHash(nonce), now, now + 15_000,
    current.version, current.assignment_epoch, session.id, v.id, d.revision, v.revision, policy.revision, req.revision, run.revision, 60, 0, 0, 60);
  return { id: offerId, leaseNonce: nonce };
}

// --- 100-way race, command replay, vehicle edit during lease -----------------
const f = await dispatchFixture('dispatchrace');
const { db, call } = f;
try {
  await f.setupCoverage();
  const winner = await addDriver(f, { latitude: 31.9005, longitude: 35.195 });
  const order = await bookRide(f);
  await assessRide(f, order, [winner.vehicle]);
  // Rivals are created before the offer exists: offers live 15 s, and inserting
  // 99 drivers between issuance and the race can outlive that window on a slow host.
  const rivals = [];
  for (let i = 0; i < 99; i++) rivals.push(await rivalDriver(f));
  await call(`/orders/${order.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  const offer = await myOffer(f, order.id, winner.driver);
  assert.ok(offer?.leaseNonce);
  const attempts = await Promise.all([
    ...rivals.map((rival, i) => raw(i % 2 ? f.b.base : f.a.base, `/jobs/${order.id}/accept`, rival.token, { offerId: offer.id, leaseNonce: offer.leaseNonce })),
    raw(f.b.base, `/jobs/${order.id}/accept`, winner.driver.token, { offerId: offer.id, leaseNonce: offer.leaseNonce }),
    ...rivals.slice(0, 20).map((rival, i) => raw(i % 2 ? f.a.base : f.b.base, `/jobs/${order.id}/accept`, rival.token, {})),
  ]);
  // A 503 is the API's retryable database-unavailable response, not a race outcome:
  // if the designated winner was shed before processing, retry it once after the
  // burst drains. The single-assignment assertions below still decide the race.
  if (attempts[rivals.length].status === 503)
    attempts[rivals.length] = await raw(f.b.base, `/jobs/${order.id}/accept`, winner.driver.token, { offerId: offer.id, leaseNonce: offer.leaseNonce });
  const winners = attempts.filter(a => a.status === 200);
  assert.equal(winners.length, 1, `exactly one of ${attempts.length} concurrent attempts wins`);
  assert.equal(winners[0].data.driverId, winner.driver.user.id);
  assert.equal((await db.one('SELECT status FROM orders WHERE id=?', order.id)).status, 'assigned');
  assert.equal(Number((await db.one("SELECT count(*) n FROM assignment_history WHERE order_id=? AND action='assigned'", order.id)).n), 1, 'one assignment history row');

  // App retry replay returns the stored result before any version/expiry check.
  const ride2 = await bookRide(f);
  const driver2 = await addDriver(f, { latitude: 31.9005, longitude: 35.195 });
  await assessRide(f, ride2, [driver2.vehicle]);
  await call(`/orders/${ride2.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  const offer2 = await myOffer(f, ride2.id, driver2.driver);
  const command = { offerId: offer2.id, leaseNonce: offer2.leaseNonce, commandId: randomUUID(), expectedVersion: Number((await db.one('SELECT order_revision FROM dispatch_offers WHERE id=?::uuid', offer2.id)).order_revision) };
  const first = await call(`/jobs/${ride2.id}/accept`, { token: driver2.driver.token, body: command });
  const replay = await f.other(`/jobs/${ride2.id}/accept`, { token: driver2.driver.token, body: command });
  assert.equal(replay.status, 'assigned');
  assert.equal(replay.driverId, first.driverId);
  assert.equal(Number((await db.one("SELECT count(*) n FROM assignment_history WHERE order_id=? AND action='assigned'", ride2.id)).n), 1, 'replay does not assign twice');

  // A vehicle edit during the lease fences the offer at acceptance.
  const ride3 = await bookRide(f);
  const driver3 = await addDriver(f, { latitude: 31.9005, longitude: 35.195 });
  await assessRide(f, ride3, [driver3.vehicle]);
  await call(`/orders/${ride3.id}/dispatch/retry`, { token: f.customer.token, body: {} });
  const offer3 = await myOffer(f, ride3.id, driver3.driver);
  const vehicleNow = await db.one('SELECT revision FROM vehicles WHERE id=?', driver3.vehicle.id);
  await call(`/admin/eligibility/vehicles/${driver3.vehicle.id}`, { token: f.admin.token, method: 'PATCH', body: { ...f.vehicleBody, plate: `SYN-DISP-${driver3.driver.user.id}`, ...f.evidence, expectedRevision: Number(vehicleNow.revision), seats: 3 } });
  assert.equal((await acceptOffer(f, ride3.id, driver3.driver, offer3, {}, 409)).error, 'eligibility_changed');
  assert.equal((await db.one('SELECT status FROM orders WHERE id=?', ride3.id)).status, 'searching');
  console.log('WP10 dispatch-races: 100-driver single winner, command replay, vehicle-edit fence passed');
} finally { await f.close(); }

// --- Cross-mode locks and one vehicle shared by two drivers ------------------
const g = await dispatchFixture('dispatchmode');
try {
  await g.setupCoverage();
  const courier = await addDriver(g, { latitude: 31.9005, longitude: 35.195 });
  // Active parcel custody blocks a ride acceptance, even with a crafted valid offer.
  const parcel = await g.book();
  await g.assess(parcel, {});
  await g.approach(parcel, { vehicleId: courier.vehicle.id });
  await g.call(`/jobs/${parcel.id}/accept`, { token: courier.driver.token, body: {} });
  const ride = await bookRide(g);
  await assessRide(g, ride, [courier.vehicle]);
  const crafted = await craftOffer(g, ride, courier);
  assert.equal((await acceptOffer(g, ride.id, courier.driver, crafted, {}, 409)).error, 'vehicle_busy');
  assert.equal((await g.db.one('SELECT status FROM orders WHERE id=?', ride.id)).status, 'searching');
  assert.equal((await g.db.one('SELECT status FROM orders WHERE id=?', parcel.id)).status, 'assigned', 'parcel custody is preserved');

  // Two drivers on one vehicle cannot both win concurrent ride acceptances.
  const shared1 = await addDriver(g, { latitude: 31.9005, longitude: 35.195 });
  const partnerDriver = await g.account('driver');
  await g.verify(partnerDriver, shared1.vehicle.id);
  const deviceId = randomUUID();
  const online = await g.call('/driver/presence/online', { token: partnerDriver.token, body: { commandId: randomUUID(), deviceId, consentVersion: 1 } });
  await g.call('/driver/presence/location', { token: partnerDriver.token, body: { deviceId, sessionId: online.sessionId, seq: 1, ageMs: 0, latitude: 31.92, longitude: 35.21, accuracy: 20 } });
  const partner = { driver: partnerDriver, vehicle: shared1.vehicle };
  const rideA = await bookRide(g), rideB = await bookRide(g);
  await assessRide(g, rideA, [shared1.vehicle]);
  await assessRide(g, rideB, [shared1.vehicle]);
  await g.call(`/orders/${rideA.id}/dispatch/retry`, { token: g.customer.token, body: {} });
  await g.call(`/orders/${rideB.id}/dispatch/retry`, { token: g.customer.token, body: {} });
  const offerA = await myOffer(g, rideA.id, shared1.driver);
  const offerB = await myOffer(g, rideB.id, partner.driver);
  assert.ok(offerA && offerB, 'both drivers hold offers on the shared vehicle for different rides');
  const tries = [
    () => raw(g.a.base, `/jobs/${rideA.id}/accept`, shared1.driver.token, { offerId: offerA.id, leaseNonce: offerA.leaseNonce }),
    () => raw(g.b.base, `/jobs/${rideB.id}/accept`, partner.driver.token, { offerId: offerB.id, leaseNonce: offerB.leaseNonce }),
  ];
  const results = await Promise.all(tries.map(run => run()));
  // As above, a retryable 503 shed is retried once after the burst, not scored.
  for (let i = 0; i < results.length; i++) if (results[i].status === 503) results[i] = await tries[i]();
  assert.equal(results.filter(r => r.status === 200).length, 1, 'one vehicle yields exactly one winner');
  console.log('WP10 dispatch-races: parcel custody blocks ride, shared vehicle single winner passed');
} finally { await g.close(); }

// --- Expiry vs accept, cancel vs accept, worker restart, deadline ------------
const h = await dispatchFixture('dispatchexp');
try {
  await h.setupCoverage();
  const driver = await addDriver(h, { latitude: 31.9005, longitude: 35.195 });
  const ride = await bookRide(h);
  await assessRide(h, ride, [driver.vehicle]);
  await h.call(`/orders/${ride.id}/dispatch/retry`, { token: h.customer.token, body: {} });
  const offer = await myOffer(h, ride.id, driver.driver);
  await h.db.run('UPDATE dispatch_offers SET expires_at=? WHERE id=?::uuid', Date.now() - 1, offer.id);
  const worker = new DurableWorker(h.db);
  const [acceptResult] = await Promise.allSettled([
    raw(h.a.base, `/jobs/${ride.id}/accept`, driver.driver.token, { offerId: offer.id, leaseNonce: offer.leaseNonce }),
    worker.processDispatchExpiries(),
  ]);
  const finalOrder = await h.db.one('SELECT status,driver_id FROM orders WHERE id=?', ride.id);
  const finalOffer = await h.db.one('SELECT state FROM dispatch_offers WHERE id=?::uuid', offer.id);
  assert.ok(
    (finalOrder.status === 'assigned' && finalOffer.state === 'accepted' && acceptResult.status === 'fulfilled' && acceptResult.value.status === 200)
    || (finalOrder.status !== 'assigned' && finalOffer.state === 'expired'),
    `expiry vs accept has exactly one winner (order=${finalOrder.status}, offer=${finalOffer.state})`);
  // A restarted worker reprocesses safely: nothing changes twice.
  assert.equal(await new DurableWorker(h.db).processDispatchExpiries(), 0, 'worker restart expiry is idempotent');

  // Cancel vs accept also has exactly one winner.
  const driver2 = await addDriver(h, { latitude: 31.9005, longitude: 35.195 });
  const ride2 = await bookRide(h);
  await assessRide(h, ride2, [driver2.vehicle]);
  await h.call(`/orders/${ride2.id}/dispatch/retry`, { token: h.customer.token, body: {} });
  const offer2 = await myOffer(h, ride2.id, driver2.driver);
  if (offer2) {
    await Promise.allSettled([
      raw(h.a.base, `/jobs/${ride2.id}/accept`, driver2.driver.token, { offerId: offer2.id, leaseNonce: offer2.leaseNonce }),
      raw(h.b.base, `/orders/${ride2.id}/cancel`, h.customer.token, {}),
    ]);
    const after = await h.db.one('SELECT status,driver_id FROM orders WHERE id=?', ride2.id);
    assert.ok(after.status === 'cancelled' || (after.status === 'assigned' && Number(after.driver_id) === driver2.driver.user.id),
      `cancel vs accept resolves to one state (${after.status})`);
    if (after.status === 'cancelled') assert.ok(!(await h.db.one("SELECT 1 FROM dispatch_offers WHERE order_id=? AND state='open'", ride2.id)), 'a cancelled order keeps no open offer');
  }

  // The absolute 90-second deadline exhausts even with an unanswered offer.
  const driver3 = await addDriver(h, { latitude: 31.9005, longitude: 35.195 });
  const ride3 = await bookRide(h);
  await assessRide(h, ride3, [driver3.vehicle]);
  await h.call(`/orders/${ride3.id}/dispatch/retry`, { token: h.customer.token, body: {} });
  await h.db.run("UPDATE dispatch_rounds SET deadline_at=? WHERE order_id=? AND state='open'", Date.now() - 1, ride3.id);
  await h.db.run("UPDATE dispatch_offers SET expires_at=? WHERE order_id=? AND state='open'", Date.now() - 1, ride3.id);
  await new DurableWorker(h.db).processDispatchExpiries();
  const round3 = await h.db.one('SELECT state,close_reason FROM dispatch_rounds WHERE order_id=? ORDER BY round_number DESC LIMIT 1', ride3.id);
  assert.equal(round3.state, 'exhausted');
  assert.equal(round3.close_reason, 'deadline');
  console.log('WP10 dispatch-races: expiry/cancel vs accept single winner, worker restart, deadline exhaustion passed');
} finally { await h.close(); }
