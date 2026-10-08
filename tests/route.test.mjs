// Road routing (SPEC-routing-eta.md): OSRM proxy with cache, public ETA, and graceful absence.
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

// Fake OSRM: answers like /route/v1/driving, counts calls, can be told to fail.
let calls = 0, mode = 'ok', lastUrl = '';
const osrm = createServer((req, res) => {
  calls++; lastUrl = req.url;
  const url = new URL(req.url, 'http://x'), pts = decodeURIComponent(url.pathname.split('/').pop()).split(';').map(p => p.split(',').map(Number));
  const [a, b] = [pts[0], pts.at(-1)], route = (coordinates, duration = 3300) => ({ distance: 61234, duration, geometry: { type: 'LineString', coordinates } });
  if (mode === 'down') return res.destroy();
  if (mode === 'none') return res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
  // Every fastest route passes X = [35.23, 32.0]. 'alt' adds a slower alternative; via-point requests (3 points) detour
  // through the via point unless 'stuck', where even detours pass X.
  const detour = mode === 'stuck' ? [a, [35.23, 32.0], b] : mode === 'spur' ? [a, pts[1], a, b] : pts; // 'spur': out to the via point and back
  const routes = pts.length === 3 ? [route(detour, 3700)]
    : [route([a, [35.23, 32.0], b]), ...(mode === 'alt' && url.searchParams.get('alternatives') ? [route([a, [35.3, 32.05], b], 4000)] : [])];
  res.end(JSON.stringify({ code: 'Ok', routes }));
});
await new Promise(r => osrm.listen(0, '127.0.0.1', r));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}/`;
const dir = mkdtempSync(join(tmpdir(), 'wind-route-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);

try {
  const admin = await call('/auth/register', { body: { phone: '0599800001', name: 'Admin', password: 'secret1' } });
  promote('0599800001');
  const customer = await call('/auth/register', { body: { phone: '0599800002', name: 'Lina', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599800003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });

  // AC1: session required, coordinates validated, OSRM answer reshaped, repeats cached (~10 m rounding).
  await call('/route?from=31.9,35.2&to=32.22,35.26', { expect: 401 });
  for (const bad of ['from=91,35&to=32,35', 'from=abc&to=32,35', 'to=32,35'])
    await call(`/route?${bad}`, { token: customer.token, expect: 400 });
  const road = await call('/route?from=31.90381,35.20341&to=32.2211,35.2544', { token: customer.token });
  assert.deepEqual(road, { km: 61.2, minutes: 55, line: [[35.2034, 31.9038], [35.23, 32], [35.2544, 32.2211]], avoids: [], through: [], closed: [] });
  await call('/route?from=31.90383,35.20344&to=32.2211,35.2544', { token: customer.token });
  assert.equal(calls, 1, 'a fix a few metres away reuses the cached route');
  assert.match(lastUrl, /overview=full&geometries=geojson&alternatives=3$/, 'full geometry (simplified lines cut corners) and alternatives');
  // A driver heading becomes an OSRM bearing hint (rounded to 15 degrees) and its own cache entry.
  await call('/route?from=31.90381,35.20341&to=32.2211,35.2544&heading=93', { token: customer.token });
  assert.equal(calls, 2); assert.match(lastUrl, /&alternatives=3&bearings=90,60;$/);
  for (const bad of ['360', '-1', 'x']) await call(`/route?from=31.9,35.2&to=32.22,35.26&heading=${bad}`, { token: customer.token, expect: 400 });
  mode = 'none';
  await call('/route?from=31.5,35.1&to=31.7,35.2', { token: customer.token, expect: 404 });
  mode = 'down';
  await call('/route?from=31.51,35.1&to=31.7,35.2', { token: customer.token, expect: 503 });
  mode = 'ok';
  await call('/route?from=31.51,35.1&to=31.7,35.2', { token: customer.token }); // failures are not cached

  // Public ETA: null until a fresh driver fix, then minutes only (no geometry, no exact pins).
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599800002', detail: 'Box', dropoffPoint: { latitude: 32.2299, longitude: 35.2611 } };
  const order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), requestId: randomUUID() } });
  const { token } = await call(`/orders/${order.id}/share`, { token: customer.token, body: {} });
  assert.deepEqual(await call(`/track/${token}/eta`), { minutes: null });
  await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await call('/location', { token: driver.token, body: { latitude: 31.95, longitude: 35.21 } });
  calls = 0;
  const eta = await call(`/track/${token}/eta`);
  assert.deepEqual({ ...eta, approach: undefined, road: undefined }, { minutes: 55, delayed: false, approach: undefined, road: undefined });
  assert.equal(eta.approach.length, 3, 'driver leg follows the road geometry'); assert.equal(eta.road.length, 3, 'city-to-city road line');
  assert.equal(calls, 1, 'Ramallah-Nablus centres were cached by the first /route call');
  // A closed checkpoint touching either city flags the public ETA (SPEC-road-aware-eta.md); an open one does not.
  const [far] = await call('/admin/roads', { token: admin.token, body: { name: 'Far', cities: ['hebron'] } });
  await call(`/roads/${far.id}/report`, { token: driver.token, body: { status: 'closed' } });
  assert.equal((await call(`/track/${token}/eta`)).delayed, false);
  const [near] = (await call('/admin/roads', { token: admin.token, body: { name: 'Huwwara', cities: ['nablus'] } })).filter(r => r.name === 'Huwwara');
  await call(`/roads/${near.id}/report`, { token: admin.token, body: { status: 'open' } });
  assert.equal((await call(`/track/${token}/eta`)).delayed, false);
  await call(`/roads/${near.id}/report`, { token: driver.token, body: { status: 'closed' } });
  assert.equal((await call(`/track/${token}/eta`)).delayed, true);
  assert.equal(calls, 1);
  await call(`/track/${'0'.repeat(64)}/eta`, { expect: 404 });

  // Checkpoint-aware routing (SPEC-checkpoint-routing.md). Closed checkpoints without a position ('Far', 'Huwwara' above)
  // cannot steer routing: the fastest route stands.
  const trip = (lat) => `/route?from=${lat},35.2034&to=32.2211,35.2544`;
  assert.deepEqual((await call(trip(31.9038), { token: customer.token })).through, []);
  const [zatara] = (await call('/admin/roads', { token: admin.token, body: { name: 'Zatara', cities: ['ramallah'], point: { latitude: 32.0, longitude: 35.23 } } }))
    .filter(r => r.name === 'Zatara');
  let r = await call(trip(31.9038), { token: customer.token }); // slow/unknown does not re-route
  assert.deepEqual([r.avoids, r.through, r.minutes], [[], [], 55]);
  await call(`/roads/${zatara.id}/report`, { token: admin.token, body: { status: 'closed' } });
  calls = 0;
  r = await call(trip(31.9038), { token: customer.token }); // same trip, new closed set: not served from cache
  assert.deepEqual([r.avoids, r.through], [['Zatara'], []]);
  assert.equal(r.line.length, 3); assert.notDeepEqual(r.line[1], [35.23, 32], 'forced detour via a point beside the checkpoint');
  assert.deepEqual(r.closed, [{ latitude: 32.0, longitude: 35.23 }], 'position for the map marker');
  assert.equal(r.minutes, 62); assert.equal(calls, 11, 'one fastest request + ten via-point detours');
  // Moving the closed checkpoint off the route (admin "Move on map") must not serve the cached detour.
  await call(`/admin/roads/${zatara.id}/place`, { token: admin.token, body: { point: { latitude: 31.95, longitude: 35.3 } } });
  r = await call(trip(31.9038), { token: customer.token });
  assert.deepEqual([r.avoids, r.through, r.minutes], [[], [], 55], 'moved off the route: fastest again');
  await call(`/admin/roads/${zatara.id}/place`, { token: admin.token, body: { point: { latitude: 32.0, longitude: 35.23 } } });
  mode = 'alt';
  r = await call(trip(31.9039), { token: customer.token });
  assert.deepEqual([r.avoids, r.through, r.minutes, r.line[1]], [['Zatara'], [], 67, [35.3, 32.05]], 'a clear OSRM alternative wins without detours');
  mode = 'stuck';
  r = await call(trip(31.904), { token: customer.token });
  assert.deepEqual([r.avoids, r.through, r.minutes, r.line[1]], [[], ['Zatara'], 55, [35.23, 32]], 'no way around: fastest, flagged');
  // A driver heading also steers forced detours (bearing on the first of three points).
  mode = 'ok'; calls = 0;
  r = await call(`${trip(31.9042)}&heading=0`, { token: customer.token });
  assert.deepEqual(r.avoids, ['Zatara']); assert.equal(calls, 11); assert.match(lastUrl, /&bearings=0,60;;$/);
  mode = 'spur';
  r = await call(trip(31.9041), { token: customer.token });
  assert.deepEqual([r.avoids, r.through], [[], ['Zatara']], 'out-and-back detours are never offered');
  mode = 'ok';
  await call(`/roads/${zatara.id}/report`, { token: driver.token, body: { status: 'open' } });
  r = await call(trip(31.9038), { token: customer.token });
  assert.deepEqual([r.avoids, r.through, r.minutes], [[], [], 55], 'reported open again: fastest route back');

  console.log('route: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
  osrm.close();
}
