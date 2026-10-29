// Live map (SPEC-live-map.md): exact dropoff points with pickup-point visibility, driver heading/accuracy.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultSettings, quote } from '../src/model.ts';
import { backtracks, bearing, ease, etaRange, fitBounds, kmLabel, fromDriver, glideMs, glider, labelField, nearLine, roadPath, routeFramePoints, shownApproach, turn } from '../src/map-math.ts';
import { SIGNIFICANT_MOVEMENT_METRES, approachKey, canShowOnRenderer, googleApproachPath, googlePreviewPath, routeProvider, selectRenderer } from '../src/map-provider.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-map-'));
process.env.DB_PATH = join(dir, 'test.db');
// A database from before this module: driver_locations without heading/accuracy, orders without dropoff points.
const legacy = new DatabaseSync(process.env.DB_PATH);
legacy.exec('CREATE TABLE driver_locations (driver_id INTEGER PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL, updated_at INTEGER NOT NULL)');
legacy.close();
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, db, promote, liveWatcherCount, webCspFor } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);

try {
  const columns = table => db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  assert.ok(['heading', 'accuracy'].every(c => columns('driver_locations').includes(c)), 'legacy driver_locations upgraded');
  assert.ok(['dropoff_lat', 'dropoff_lng'].every(c => columns('orders').includes(c)));

  const admin = await call('/auth/register', { body: { phone: '0599700001', name: 'Admin', password: 'secret1' } });
  await promote('0599700001');
  const customer = await call('/auth/register', { body: { phone: '0599700002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599700003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599700002', detail: 'Box' };
  const book = extra => call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), ...extra } });

  // AC5: malformed points are refused, absent ones are fine.
  for (const bad of [{ latitude: 91, longitude: 35 }, { latitude: '32', longitude: 35 }, { latitude: 32 }, 'nablus'])
    await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), dropoffPoint: bad }, expect: 400 });
  // A pin must sit within its city's service bound: 0,0 or another city's centre is refused, for the price and the order.
  for (const pickupPoint of [{ latitude: 0, longitude: 0 }, { latitude: 32.2211, longitude: 35.2544 }]) {
    assert.equal((await call('/price', { token: customer.token, body: { ...input, pickupPoint }, expect: 400 })).error, 'outside_area');
    assert.equal((await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), pickupPoint }, expect: 400 })).error, 'outside_area');
  }
  assert.equal((await book({ pickupPoint: { latitude: 31.9107, longitude: 35.2164 } })).pickupCity, 'ramallah'); // Al-Bireh's centre, 1.5 km away
  await call('/price', { token: customer.token, body: { ...input, pickupPoint: { latitude: 31.9038, longitude: 35.0234 } } }); // ~17 km out: inside the 20 km bound, outside the old 15
  const plain = await book({});
  assert.equal(plain.dropoffPoint, null);
  await call(`/orders/${plain.id}/cancel`, { token: customer.token, body: {} });

  // AC2: both points stored and returned to the customer.
  const order = await book({ pickupPoint: { latitude: 31.9041, longitude: 35.2042 }, dropoffPoint: { latitude: 32.2215, longitude: 35.2601 } });
  assert.deepEqual(order.dropoffPoint, { latitude: 32.2215, longitude: 35.2601 });
  // Unassigned drivers browsing jobs see cities only, like pickupPoint.
  const job = (await call('/jobs', { token: driver.token })).find(j => j.id === order.id);
  assert.equal(job.dropoffPoint, null);
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  assert.deepEqual((await call(`/orders/${order.id}`, { token: driver.token })).dropoffPoint, order.dropoffPoint);
  // A fix captured 14 s before the accept is inside the grace window and must be stored; the
  // inline SQLite guard used to require assigned_at <= fixAt and silently dropped it.
  const assignedAt = Number(db.prepare('SELECT assigned_at FROM orders WHERE id = ?').get(order.id).assigned_at);
  const grace = await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21, accuracy: 5, age: Date.now() - assignedAt + 14_000 } });
  assert.equal(grace.accepted, true, 'a fix 14 s before assignment is accepted');

  // Heading/accuracy: optional, validated, -1 means unknown.
  for (const bad of [{ heading: 361 }, { heading: 'n' }, { accuracy: -2 }, { accuracy: 9000 }])
    await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21, ...bad }, expect: 400 });
  await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21, heading: -1 } });
  let seen = (await call(`/orders/${order.id}`, { token: customer.token })).driverLocation;
  assert.equal(seen.heading, null);
  await call('/location', { token: driver.token, body: { latitude: 31.96, longitude: 35.22, heading: 12.5, accuracy: 8 } });
  seen = (await call(`/orders/${order.id}`, { token: customer.token })).driverLocation;
  assert.equal(seen.heading, 12.5);
  assert.equal(seen.accuracy, 8);
  // -1 accuracy means unknown; 0,0 and negative ages are refused; a fix over a minute old is ignored (still 2xx, so a
  // background task keeps running); an older fix uploaded late never wins.
  for (const bad of [{ latitude: 0, longitude: 0 }, { age: -1 }])
    await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21, ...bad }, expect: 400 });
  assert.equal((await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21, age: 60_001 } })).accepted, false);
  await call('/location', { token: driver.token, body: { latitude: 31.9601, longitude: 35.2201, accuracy: -1, age: 0 } });
  await call('/location', { token: driver.token, body: { latitude: 31.5, longitude: 35.5, age: 30_000 } });
  seen = (await call(`/orders/${order.id}`, { token: customer.token })).driverLocation;
  assert.deepEqual([seen.latitude, seen.accuracy], [31.9601, null]);
  // GPS outlier: a 5 km jump in a moment from a fix no more precise is ignored; a more precise one always wins.
  assert.equal((await call('/location', { token: driver.token, body: { latitude: 32.0051, longitude: 35.2201, accuracy: 60 } })).accepted, false);
  assert.equal((await call('/location', { token: driver.token, body: { latitude: 32.0051, longitude: 35.2201, accuracy: 10 } })).accepted, true);
  await call('/location', { token: driver.token, body: { latitude: 31.9601, longitude: 35.2201, accuracy: 5, age: 0 } });
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).driverLocation.latitude, 31.9601);
  seen = (await call(`/orders/${order.id}`, { token: customer.token })).driverLocation;

  // Live long-poll: a fix newer than `since` answers at once; otherwise the request holds until the driver's next
  // stored fix (a late, older upload does not wake it), and shutdown releases held requests instead of waiting.
  const live = `/orders/${order.id}/live`;
  const stranger = await call('/auth/register', { body: { phone: '0599700009', name: 'Omar', password: 'secret1' } });
  await call(live, { token: stranger.token, expect: 404 });
  assert.equal((await call(`${live}?since=0`, { token: customer.token })).driverLocation.updatedAt, seen.updatedAt);
  const pending = (since, ms = 300) => Promise.race([call(`${live}?since=${since}`, { token: customer.token }),
    new Promise(resolve => setTimeout(() => resolve('held'), ms))]);
  const held = call(`${live}?since=${seen.updatedAt}`, { token: customer.token });
  // If a later assertion fails, shutdown can close this request before it is awaited.
  // Mark its rejection handled now while still awaiting the original promise below.
  void held.catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 100));
  await call('/location', { token: driver.token, body: { latitude: 31.4, longitude: 35.4, age: 50_000 } }); // older: ignored
  assert.equal(await pending(seen.updatedAt), 'held');
  let at = Date.now();
  await call('/location', { token: driver.token, body: { latitude: 31.9602, longitude: 35.2202, accuracy: 5 } });
  const woke = (await held).driverLocation;
  assert.ok(Date.now() - at < 1_000, 'a new fix answers the held request within network latency');
  assert.equal(woke.latitude, 31.9602);

  // A live request authorized before logout cannot receive a new exact fix after its session is revoked.
  const revoked = call(`${live}?since=${woke.updatedAt}`, { token: customer.token, expect: 401 });
  await new Promise(resolve => setTimeout(resolve, 100));
  await call('/auth/logout', { token: customer.token, body: {} });
  await call(`/orders/${order.id}`, { token: customer.token, expect: 401 });
  await call('/location', { token: driver.token, body: { latitude: 31.9602, longitude: 35.2202, accuracy: 5 } });
  assert.equal((await revoked).error, 'unauthorized', 'held live request rechecks session authority before returning coordinates');
  customer.token = (await call('/auth/login', { body: { phone: '0599700002', password: 'secret1' } })).token;

  // Without OSRM_URL the road route is unavailable and clients keep straight lines (SPEC-routing-eta.md).
  await call('/route?from=31.9,35.2&to=32.2,35.26', { token: customer.token, expect: 503 });

  // The yardstick for the next fix is the last *plausible* fix: a wild fix that won on accuracy may be shown, but it
  // must not freeze the marker kilometres away when the real driver comes back.
  const driver2 = await call('/auth/register', { body: { phone: '0599700010', name: 'Nabil', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver2.user.id}/approve`, { token: admin.token, body: {} });
  const order2 = await book({});
  await call(`/jobs/${order2.id}/accept`, { token: driver2.token, body: {} });
  const here = { latitude: 31.9801, longitude: 35.2301, accuracy: 30 };
  assert.equal((await call('/location', { token: driver2.token, body: here })).accepted, true);
  assert.equal((await call('/location', { token: driver2.token, body: { latitude: 32.9, longitude: 35.9, accuracy: 3 } })).accepted, true,
    'a more precise fix always wins');
  assert.equal((await call('/location', { token: driver2.token, body: { ...here, accuracy: 60 } })).accepted, true,
    'the next real fix is measured against the plausible one, not the wild one');
  const back = (await call(`/orders/${order2.id}`, { token: customer.token })).driverLocation;
  assert.equal(Math.round(back.latitude * 1000), 31980, 'the marker is back where the driver is');

  // The live answer names the driver it belongs to: a fix from another car is never returned, so a reassignment
  // cannot show the previous driver's position under the new driver's name.
  const mine = (await call(`${live}?since=0&driver=${driver.user.id}`, { token: customer.token }));
  assert.equal(mine.driverKey, String(driver.user.id));
  assert.ok(mine.driverLocation);
  const other = (await call(`${live}?since=0&driver=999999`, { token: customer.token }));
  assert.equal(other.driverLocation, null, 'a fix for another driver is not sent');
  assert.equal(other.driverChanged, true);

  // A reassignment while a request is held: the new driver's position never reaches the watcher that asked
  // for the old one, and the watcher is woken instead of sleeping out its hold.
  const driver3 = await call('/auth/register', { body: { phone: '0599700011', name: 'Ameer', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver3.user.id}/approve`, { token: admin.token, body: {} });
  const swapOrder = await book({});
  await call(`/jobs/${swapOrder.id}/accept`, { token: driver2.token, body: {} });
  await call('/location', { token: driver2.token, body: { latitude: 31.7, longitude: 35.3, accuracy: 10 } });
  const current = (await call(`/orders/${swapOrder.id}`, { token: customer.token })).driverLocation;
  const heldSwap = call(`/orders/${swapOrder.id}/live?since=${current.updatedAt}&driver=${driver2.user.id}`, { token: customer.token });
  void heldSwap.catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 100));
  await call(`/orders/${swapOrder.id}/release`, { token: driver2.token, body: {} });
  const unassigned = await call(`/orders/${swapOrder.id}/live?driver=${driver2.user.id}`, { token: customer.token });
  assert.equal(unassigned.driverChanged, true, 'a released driver is cleared even before the next assignment');
  assert.equal(unassigned.driverKey, null);
  await call(`/jobs/${swapOrder.id}/accept`, { token: driver3.token, body: {} });
  await call('/location', { token: driver3.token, body: { latitude: 31.5, longitude: 35.5, accuracy: 10 } });
  const swapped = await heldSwap;
  assert.equal(swapped.driverLocation, null, 'the new driver position never reaches the old watcher');
  assert.equal(swapped.driverChanged, true);
  assert.equal(swapped.driverKey, String(driver3.user.id));

  // Pure helpers used by the map.
  assert.equal(Math.round(bearing({ latitude: 31.9, longitude: 35.2 }, { latitude: 32.9, longitude: 35.2 })), 0);
  assert.equal(Math.round(bearing({ latitude: 31.9, longitude: 35.2 }, { latitude: 31.9, longitude: 35.3 })), 90);
  assert.deepEqual(ease({ latitude: 0, longitude: 0 }, { latitude: 10, longitude: 20 }, 0.5), { latitude: 5, longitude: 10 });
  assert.deepEqual(ease({ latitude: 0, longitude: 0 }, { latitude: 10, longitude: 20 }, 2), { latitude: 10, longitude: 20 });
  assert.deepEqual(fitBounds([{ latitude: 32, longitude: 35 }, { latitude: 31, longitude: 35.5 }]), [[35, 31], [35.5, 32]]);
  // A single point still produces a usable box instead of a zero-size one.
  const [[w, s], [e, n]] = fitBounds([{ latitude: 32, longitude: 35 }]);
  assert.ok(e - w > 0.005 && n - s > 0.005);
  assert.deepEqual(labelField('ar'), ['coalesce', ['get', 'name:ar'], ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]);
  assert.deepEqual(etaRange(10), [10, 15]);
  assert.equal(kmLabel(0.84), '0.8'); assert.equal(kmLabel(9.96), '10'); assert.equal(kmLabel(12.6), '13');
  // Live marker: glides for the fix gap (continuous motion), catches up quickly after a long gap, turns the short way.
  assert.equal(glideMs(3_000), 3_000); assert.equal(glideMs(200), 600); assert.equal(glideMs(30_000), 1_200); assert.equal(glideMs(0), 1_200);
  assert.equal(turn(350, 10, 0.5), 0); assert.equal(turn(10, 350, 0.5), 0); assert.equal(turn(90, 180, 1), 180); assert.equal(turn(90, 180, 0), 90);
  // Interruptible glide (iOS drops a native glide request mid-flight; this never does): A→B, C lands halfway on a turn.
  const A = { latitude: 32, longitude: 35, rotation: 90 }, B = { latitude: 32, longitude: 35.01 }, C = { latitude: 32.01, longitude: 35.01 };
  const g = glider(A); g.fix(A, 1_000); g.fix(B, 4_000);
  const mid = g.frame(5_500).now; // 1500 of a 3000 ms glide: fractional seconds count
  assert.ok(Math.abs(mid.longitude - 35.005) < 1e-9 && mid.latitude === 32, 'halfway A→B at half the gap');
  g.fix(C, 5_500);
  assert.deepEqual(g.frame(5_500).now, mid, 'the new glide starts where the marker is drawn, not at A or B');
  let last = mid, worst = 0;
  for (let t = 5_516; t <= 7_100; t += 16) { const { now } = g.frame(t); worst = Math.max(worst, Math.hypot(now.latitude - last.latitude, now.longitude - last.longitude)); last = now; }
  const steady = Math.hypot(C.latitude - mid.latitude, C.longitude - mid.longitude) * 16 / 1_500; // 1500 ms: the C−B gap
  assert.ok(worst <= steady * 1.01, 'constant speed, no frame jumps'); assert.deepEqual([last.latitude, last.longitude], [C.latitude, C.longitude]);
  assert.equal(g.frame(7_100).done, true); assert.equal(glider(A).frame(0).done, true);
  const far = glider(A); far.fix(A, 1_000); far.fix({ latitude: 32.2, longitude: 35.2 }, 4_000);
  assert.deepEqual([far.frame(4_000).now.latitude, far.frame(4_000).now.longitude], [32.2, 35.2], 'a km-scale jump (new driver) snaps, never glides across the city');
  const still = glider(A); still.fix(A, 1_000, true); still.fix({ ...C, heading: 0 }, 4_000, true);
  assert.deepEqual(still.frame(4_000), { now: { ...C, rotation: 0 }, done: true }, 'reduced motion lands at once');
  // Approach line starts under the car: points behind the driver are dropped.
  const way = [[35.2, 32], [35.21, 32], [35.22, 32], [35.23, 32]];
  assert.deepEqual(fromDriver(way, { latitude: 32.0001, longitude: 35.215 }), [[35.215, 32.0001], [35.22, 32], [35.23, 32]]);
  assert.deepEqual(fromDriver(way, { latitude: 32, longitude: 35.199 }), [[35.199, 32], ...way], 'before the start: nothing dropped');
  // Approach ETA: fresh wins; the kept one only for the same stop; a failed refresh shows none, even with cached data.
  const kept = { stop: 'o1:32,35', route: 'kept' };
  assert.equal(shownApproach('fresh', false, kept, 'o1:32,35'), 'fresh');
  assert.equal(shownApproach(undefined, false, kept, 'o1:32,35'), 'kept');
  assert.equal(shownApproach(undefined, false, kept, 'o1:31,35'), undefined);
  assert.equal(shownApproach('stale', true, kept, 'o1:32,35'), undefined);
// Checkpoint-on-route test (SPEC-checkpoint-routing.md): a west-east segment along latitude 32.
const seg = [[35.20, 32.0], [35.22, 32.0]];
assert.ok(nearLine({ latitude: 32.001, longitude: 35.21 }, seg, 150), '~110 m north of the middle');
assert.ok(!nearLine({ latitude: 32.002, longitude: 35.21 }, seg, 150), '~220 m north');
assert.ok(!nearLine({ latitude: 32.0, longitude: 35.2225 }, seg, 150), '~236 m past the end (clamped to the end point)');
assert.ok(nearLine({ latitude: 32.0, longitude: 35.2214 }, [[35.2214, 32.0]], 10), 'single-point line');
assert.ok(nearLine({ latitude: 32.0005, longitude: 35.2 }, [[35.2, 32.0], [35.2, 32.0], [35.2, 32.01]], 100), 'repeated point then a segment');
// Out-and-back detours (via point on a dead end) are rejected; a straight drive or a short U-turn is not.
assert.ok(!backtracks([[35.2, 32.0], [35.21, 32.0], [35.22, 32.0]]), 'straight ~1.9 km');
assert.ok(backtracks([[35.2, 32.0], [35.21, 32.0], [35.22, 32.0], [35.21, 32.0], [35.23, 32.01]]), '~950 m out and back');
assert.ok(!backtracks([[35.2, 32.0], [35.201, 32.0], [35.2, 32.0001], [35.19, 32.0]]), '~190 m loop: a U-turn, not a spur');
assert.ok(!backtracks([[35.2, 32.0], [35.2, 32.0]]), 'too short to judge');
  assert.equal(roadPath({ latitude: 31.90381, longitude: 35.20341 }, { latitude: 32.2211, longitude: 35.2544 }), '/route?from=31.904,35.203&to=32.22110,35.25440');
  assert.deepEqual(labelField('en'), ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]);

  // T06: renderer capability and route provenance (tasks/maps-contract.md).
  // Each platform selects the renderer family actually baked into its binary; an unknown platform still
  // gets the safe baseline, never a renderer that may be absent from the build.
  assert.equal(selectRenderer('ios'), 'apple');
  assert.equal(selectRenderer('android'), 'maplibre');
  assert.equal(selectRenderer('web'), 'maplibre');
  assert.equal(selectRenderer('windows'), 'maplibre', 'an unknown platform chooses the safe baseline');
  assert.equal(selectRenderer(''), 'maplibre');
  // T10: a Google family is selectable only when the build actually baked it in for that platform.
  assert.equal(selectRenderer('android', { android: true }, 'google'), 'google');
  assert.equal(selectRenderer('android', { android: false }, 'google'), 'maplibre', 'a kill switch cannot enable a renderer absent from the binary');
  assert.equal(selectRenderer('android', undefined, 'google'), 'maplibre');
  assert.equal(selectRenderer('ios', { ios: true }, 'google'), 'google');
  assert.equal(selectRenderer('ios', { android: true }, 'google'), 'apple', 'another platform capability does not select Google');
  assert.equal(selectRenderer('web', { web: true }, 'google'), 'google');
  assert.equal(selectRenderer('android', { android: true }, 'baseline'), 'maplibre');
  assert.equal(selectRenderer('android', { android: true }), 'maplibre', 'no preference keeps the baseline');
  // Baseline OSRM geometry renders everywhere; Google content only on a Google renderer; unknown provenance nowhere.
  for (const renderer of ['maplibre', 'apple', 'google']) assert.equal(canShowOnRenderer('osrm', renderer), true);
  assert.equal(canShowOnRenderer('google', 'google'), true);
  assert.equal(canShowOnRenderer('google', 'maplibre'), false, 'Google content cannot reach a MapLibre overlay');
  assert.equal(canShowOnRenderer('google', 'apple'), false, 'Google content cannot reach an Apple overlay');
  assert.equal(canShowOnRenderer('future-provider', 'google'), false, 'unknown provenance fails closed');
  // Provenance normalization: absent names baseline (legacy responses), Google proxy metadata maps to 'google'.
  assert.equal(routeProvider(undefined), 'osrm');
  assert.equal(routeProvider(null), 'osrm');
  assert.equal(routeProvider('osrm'), 'osrm');
  assert.equal(routeProvider('google-routes'), 'google');
  assert.deepEqual(routeProvider({ provider: 'google-routes' }), 'google');
  assert.equal(routeProvider(7), 'unknown');
  assert.equal(routeProvider({}), 'unknown');
  // A kept route/ETA is bound to order, driver, stop and provider: any change drops it.
  const target = { latitude: 32, longitude: 35 };
  const key = order => approachKey(order, target, 'osrm');
  assert.equal(key({ id: 7, driverId: 3 }), key({ id: 7, driverId: 3 }));
  assert.notEqual(key({ id: 7, driverId: 3 }), key({ id: 7, driverId: 4 }), 'a driver change drops the kept ETA');
  assert.notEqual(key({ id: 7, driverId: 3 }), key({ id: 8, driverId: 3 }), 'an order change drops the kept ETA');
  assert.notEqual(key({ id: 7, driverId: 3 }), approachKey({ id: 7, driverId: 3 }, { latitude: 32, longitude: 35.001 }, 'osrm'), 'a stop change drops the kept ETA');
  assert.notEqual(key({ id: 7, driverId: 3 }), approachKey({ id: 7, driverId: 3 }, target, 'google'), 'a provider change drops the kept ETA');
  assert.equal(approachKey({ id: 7, driverId: null }, target, 'osrm'), approachKey({ id: 7 }, target, 'osrm'), 'no driver means no driver, however it is spelled');
  // T13: the booking screen's only Google call, billed as a first shown preview or a changed pin pair — never
  // a rerender, refocus or poll; the server 400s anything else (T08's policy table).
  assert.equal(googlePreviewPath({ latitude: 31.90411, longitude: 35.20421 }, { latitude: 32.2215, longitude: 35.2601 }, false),
    '/route/google?from=31.90411,35.20421&to=32.22150,35.26010&trigger=preview&shown=1');
  assert.equal(googlePreviewPath({ latitude: 31.90411, longitude: 35.20421 }, { latitude: 32.2215, longitude: 35.2601 }, true),
    '/route/google?from=31.90411,35.20421&to=32.22150,35.26010&trigger=destination&changed=1');
  // T14: tracking's approach bills as a first shown preview, then only for a significant foreground movement;
  // the client threshold mirrors the server's policy constant (kept in step by this source read).
  assert.equal(googleApproachPath({ latitude: 31.9, longitude: 35.2 }, { latitude: 32.2, longitude: 35.26 }, 0),
    '/route/google?from=31.90000,35.20000&to=32.20000,35.26000&trigger=preview&shown=1');
  assert.equal(googleApproachPath({ latitude: 31.9, longitude: 35.2 }, { latitude: 32.2, longitude: 35.26 }, 312.4),
    '/route/google?from=31.90000,35.20000&to=32.20000,35.26000&trigger=movement&foreground=1&metres=312');
  const serverRouting = readFileSync(new URL('../server/domain/google-routing.ts', import.meta.url), 'utf8');
  assert.match(serverRouting, /SIGNIFICANT_MOVEMENT_METRES = 250;/);
  assert.match(readFileSync(new URL('../src/map-provider.ts', import.meta.url), 'utf8'), /SIGNIFICANT_MOVEMENT_METRES = 250;/);
  const bookSource = readFileSync(new URL('../src/app/book.tsx', import.meta.url), 'utf8');
  assert.ok(bookSource.includes('refetchOnFocus: false'), 'a Google preview must not re-bill on remount or foreground bounce');
  assert.ok(bookSource.includes('canShowOnRenderer'), 'the booking preview is provenance-guarded like every other line');
  // T14/T15: the road hook gates billable approach calls on foreground and movement, and the anonymous
  // tracking page forces the free baseline regardless of a Google-capable build.
  assert.ok(SIGNIFICANT_MOVEMENT_METRES === 250, 'the client keeps the server movement threshold');
  const trackSource = readFileSync(new URL('../src/app/track/[token].tsx', import.meta.url), 'utf8');
  assert.ok(trackSource.includes('<RouteMap forceBaseline'), 'public tracking draws the free baseline only');
  // The hook that fetches routes must pass provenance through the renderer guard (same style as the vendoring asserts).
  const roadSource = readFileSync(new URL('../src/road.tsx', import.meta.url), 'utf8');
  assert.ok(roadSource.includes('canShowOnRenderer'), 'useRoad must guard route lines by renderer capability');
  assert.ok(roadSource.includes('routeProvider'), 'useRoad must read provenance off the route data');
  assert.ok(roadSource.includes('approachKey'), 'useRoad must bind kept route state to order, driver, stop and provider');
  assert.ok(roadSource.includes("refetchOnFocus: renderer !== 'google'"), 'a Google approach never re-bills on refocus');
  assert.ok(roadSource.includes('googleApproachPath(billed.fix'), 'the approach URL is built from the last billed fix, so stationary fixes cannot refetch');
  // The Android entry must choose the renderer from the baked capability plus the stored mode — never
  // unconditionally — and the Google renderer's readiness must come from loaded tiles, not initialization.
  const androidSource = readFileSync(new URL('../src/route-map.android.tsx', import.meta.url), 'utf8');
  assert.ok(androidSource.includes("selectRenderer('android', Constants.expoConfig?.extra?.googleMaps, mode)"), 'Android must resolve the renderer from baked capability and mode');
  const iosSource = readFileSync(new URL('../src/route-map.native.tsx', import.meta.url), 'utf8');
  assert.ok(iosSource.includes("selectRenderer('ios', Constants.expoConfig?.extra?.googleMaps, mode)"), 'iOS must resolve the renderer from baked capability and mode');
  assert.ok(iosSource.includes('AppleRouteMap'), 'the Apple baseline stays the iOS default');
  const googleSource = readFileSync(new URL('../src/google-map.native.tsx', import.meta.url), 'utf8');
  assert.ok(googleSource.includes('onMapLoaded'), 'Google readiness waits for loaded tiles');
  assert.ok(!googleSource.includes('onMapReady'), 'map initialization alone is not a readiness signal');
  assert.ok(googleSource.includes('provider={PROVIDER_GOOGLE}'), 'the Google renderer must actually select the Google provider');
  const modeSource = readFileSync(new URL('../src/map-mode.ts', import.meta.url), 'utf8');
  assert.ok(modeSource.includes("?? 'baseline'"), 'an unreadable preference must fall back to the baseline');
  // T12: the web entry resolves the renderer the same way, and the CSP opens Google origins only for a
  // deployment that configured the restricted browser key — a baseline deployment stays byte-identical.
  const webEntry = readFileSync(new URL('../src/route-map.tsx', import.meta.url), 'utf8');
  assert.ok(webEntry.includes("selectRenderer('web', Constants.expoConfig?.extra?.googleMaps, mode)"), 'web must resolve the renderer from baked capability and mode');
  const googleWeb = readFileSync(new URL('../src/google-map.web.tsx', import.meta.url), 'utf8');
  assert.ok(googleWeb.includes("getElementById('wind-google-maps')"), 'the Maps JS script is guarded against duplicate tags');
  assert.ok(googleWeb.includes('l.remove()'), 'map listeners are removed on unmount');
  assert.ok(googleWeb.includes('setMap(null)'), 'overlays are detached from the map on unmount');
  assert.ok(!googleWeb.includes('GOOGLE_MAPS_SERVER_KEY'), 'the server route key never reaches the web renderer');
  const baselineCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self' data:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
  assert.equal(webCspFor(false), baselineCsp, 'a baseline deployment keeps the exact installed CSP');
  const googleCsp = webCspFor(true);
  assert.match(googleCsp, /script-src 'self' https:\/\/maps\.googleapis\.com/);
  assert.match(googleCsp, /connect-src 'self' https:\/\/tiles\.openfreemap\.org https:\/\/maps\.googleapis\.com/);
  assert.match(googleCsp, /img-src [^;]*https:\/\/\*\.googleapis\.com https:\/\/\*\.gstatic\.com/);
  assert.match(googleCsp, /font-src 'self' data: https:\/\/fonts\.gstatic\.com/);
  assert.ok(googleCsp.includes("frame-ancestors 'none'"), 'Google never weakens the framing guard');

  // The web map loads vendored copies of the installed library (versioned folder, immutable caching).
  const { version } = JSON.parse(readFileSync(new URL('../node_modules/maplibre-gl/package.json', import.meta.url), 'utf8'));
  const route = readFileSync(new URL('../src/route-map.tsx', import.meta.url), 'utf8');
  assert.ok(route.includes(`'/vendor/maplibre-${version}'`), `route-map.tsx must point at /vendor/maplibre-${version}`);
  // Our loader lives beside the copy (route-map.tsx adds it as a module script: the web CSP allows no eval).
  assert.match(readFileSync(new URL(`../public/vendor/maplibre-${version}/load.mjs`, import.meta.url), 'utf8'), /from '\.\/maplibre-gl\.mjs'/, 're-vendoring must keep load.mjs');
  assert.ok(!route.includes('new Function') && route.includes('/load.mjs'), 'route-map.tsx must load MapLibre through load.mjs, not eval');
  for (const file of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css'])
    assert.equal(readFileSync(new URL(`../public/vendor/maplibre-${version}/${file}`, import.meta.url), 'utf8'),
      readFileSync(new URL(`../node_modules/maplibre-gl/dist/${file}`, import.meta.url), 'utf8'), `re-vendor ${file} after upgrading maplibre-gl`);

  // Android map page (SPEC-android-map.md): same vendored library, and its copy of the helpers behaves like map-math.ts.
  const page = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  assert.equal(page.match(/\/vendor\/maplibre-[\d.]+\//g).filter(p => p !== `/vendor/maplibre-${version}/`).length, 0, `map.html must point at /vendor/maplibre-${version}`);
  const helpers = page.slice(page.indexOf('// Same helpers'), page.indexOf('// End of helpers.'));
  const copy = new Function(`${helpers}; return { bearing, ease, fitBounds, glideMs, labelField, routeFramePoints, turn };`)();
  const a = { latitude: 31.9, longitude: 35.2 }, b = { latitude: 32.22, longitude: 35.26 };
  assert.equal(copy.bearing(a, b), bearing(a, b));
  assert.deepEqual(copy.ease(a, b, 0.3), ease(a, b, 0.3));
  assert.deepEqual(copy.ease(a, b, 3), ease(a, b, 3));
  for (const points of [[a, b], [a]]) assert.deepEqual(copy.fitBounds(points), fitBounds(points));
  for (const language of ['ar', 'en']) assert.deepEqual(copy.labelField(language), labelField(language));
  for (const gap of [0, 200, 3_000, 9_000]) assert.equal(copy.glideMs(gap), glideMs(gap));
  for (const [x, y, t] of [[350, 10, 0.5], [10, 350, 0.25], [90, 270, 1]]) assert.equal(copy.turn(x, y, t), turn(x, y, t));
  // Camera frame: live = driver, next stop and the road to it; otherwise both pins and the whole road.
  const d = { latitude: 31.95, longitude: 35.21 }, line = [[35.3, 32.3]], bend = { latitude: 32.3, longitude: 35.3 };
  const frames = [{ pickup: a, dropoff: b, road: line }, { pickup: a, dropoff: b, driver: d, focus: 'pickup', road: line, approach: line },
    { pickup: a, dropoff: b, driver: d, focus: 'dropoff', approach: null }, { pickup: a, dropoff: b, driver: d }];
  assert.deepEqual(frames.map(routeFramePoints), [[a, b, bend], [d, a, bend], [d, b], [d, a, b]]);
  for (const f of frames) assert.deepEqual(copy.routeFramePoints(f), routeFramePoints(f));
  // Served from the web root like the rest of the app (the APK loads it from the API origin).
  const web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(join(web, 'map.html'), page);
  const child = await promisify(execFile)(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e',
    `const { server, shutdown } = await import(${JSON.stringify(new URL('../server/main.ts', import.meta.url).href)}); server.listen(0, async () => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/map.html'); console.log(r.status, r.headers.get('content-type'), r.headers.get('cache-control'), (await r.text()).includes('maplibre')); await shutdown(); });`],
    { env: { ...process.env, WEB_ROOT: web, DB_PATH: join(web, 'w.db') }, encoding: 'utf8' });
  assert.equal(child.stdout.trim(), '200 text/html; charset=utf-8 no-cache true', child.stderr);

  // The production web build is tree-shaken (SPEC-web-bundle.md); losing the flags silently re-adds ~190 kB gzip.
  const docker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(docker, /EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1 EXPO_UNSTABLE_TREE_SHAKING=1/);

  // Web bundle part 2: only motion.native.ts may import Reanimated (web gets the CSS stand-in, motion.tsx), and both
  // files export the same names so a screen never works on one platform only.
  const { readdirSync } = await import('node:fs');
  const sources = readdirSync(new URL('../src', import.meta.url), { recursive: true }).filter(f => /\.tsx?$/.test(f));
  const importers = sources.filter(f => readFileSync(new URL(`../src/${f.replaceAll('\\', '/')}`, import.meta.url), 'utf8').includes("from 'react-native-reanimated'"));
  assert.deepEqual(importers, ['motion.native.ts'], 'import motion from ./motion instead of react-native-reanimated');
  const names = file => {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const reexport = text.match(/export \{([^}]+)\} from 'react-native-reanimated'/);
    return (reexport ? reexport[1].split(',').map(n => n.trim()) : [...text.matchAll(/^export (?:const|function|class) (\w+)/gm)].map(m => m[1])
      .concat(/^export default/m.test(text) ? ['default'] : [])).sort();
  };
  assert.deepEqual(names('motion.tsx'), names('motion.native.ts'));

  // At most 20 held watchers per driver (a public link must not pin sockets); the next one is answered at once.
  const future = `${live}?since=${Date.now() + 60_000}`;
  const previousDeadline = Date.now() + 13_000;
  while (liveWatcherCount(order.id) && Date.now() < previousDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(liveWatcherCount(order.id), 0, 'prior live requests finish before testing the cap');
  const holds = Array.from({ length: 20 }, () => call(future, { token: customer.token }));
  const early = [];
  for (const [index, hold] of holds.entries()) void hold.then(() => early.push(`resolved:${index}`), error => early.push(`rejected:${index}:${error.message}`));
  const watcherDeadline = Date.now() + 5_000;
  while (liveWatcherCount(order.id) < 20 && Date.now() < watcherDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(liveWatcherCount(order.id), 20, `all 20 watchers registered before testing the cap; early outcomes: ${early.join(',')}`);
  assert.notEqual(await pending(Date.now() + 60_000), 'held', 'the 21st watcher is answered, not held');
  const draining = Promise.all(holds).then(all => all[0]);
  at = Date.now();
  await shutdown();
  assert.equal((await draining).driverLocation.latitude, 31.9602);
  assert.ok(Date.now() - at < 5_000, 'shutdown answers held live requests instead of waiting out the hold');
  console.log('map: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
