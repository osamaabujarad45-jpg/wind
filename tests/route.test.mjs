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
  if (mode === 'legs') return res.end(JSON.stringify({ code: 'Ok', routes: [{ ...route([a, b]), legs: [ // as real OSRM answers through a via point
    { steps: [{ maneuver: { type: 'depart', location: a } }, { maneuver: { type: 'arrive', location: [35.23, 32] } }] },
    { steps: [{ maneuver: { type: 'depart', location: [35.23, 32] } }, { name: 'Main', maneuver: { type: 'turn', modifier: 'left', location: [35.24, 32.1] } }, { maneuver: { type: 'arrive', location: b } }] },
  ] }] }));
  if (mode === 'none') return res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
  if (mode === 'bad-distance') return res.end(JSON.stringify({ code: 'Ok', routes: [{ ...route([a, b]), distance: 'unknown' }] }));
  if (mode === 'bad-line') return res.end(JSON.stringify({ code: 'Ok', routes: [route([a, [null, 91], b])] }));
  if (mode === 'empty-line') return res.end(JSON.stringify({ code: 'Ok', routes: [route([])] }));
  if (mode === 'http-error') return res.writeHead(503).end(JSON.stringify({ code: 'Ok', routes: [route([a, b])] }));
  // Every fastest route passes X = [35.23, 32.0]. 'alt' adds a slower alternative; via-point requests (3 points) detour
  // through the via point unless 'stuck', where even detours pass X.
  const detour = mode === 'stuck' ? [a, [35.23, 32.0], b] : mode === 'spur' ? [a, pts[1], a, b] : pts; // 'spur': out to the via point and back
  const routes = pts.length === 3 ? [route(detour, 3700)]
    : [route([a, [35.23, 32.0], b]), ...(mode === 'alt' && url.searchParams.get('alternatives') ? [route([a, [35.3, 32.05], b], 4000)] : [])];
  res.end(JSON.stringify({ code: 'Ok', routes }));
});
await new Promise(r => osrm.listen(0, '127.0.0.1', r));
// Fake Nominatim for map search: one served place, one outside the area, one malformed row; 'down' drops the socket.
let geoCalls = 0, geoMode = 'ok', geoUrl = '';
const geocoder = createServer((req, res) => {
  geoCalls++; geoUrl = req.url;
  if (geoMode === 'down') return res.destroy();
  const q = new URL(req.url, 'http://x').searchParams.get('q');
  if (geoMode === 'bare-down' && q === 'المنارة') return res.destroy();
  if (q === 'fourpart') return res.end(JSON.stringify([{ lat: '31.9038', lon: '35.2034', name: 'Bakery', address: { road: 'شارع الإرسال', suburb: 'الماصيون', village: 'بيتونيا', city: 'مجلس ماتي بنيامين الإقليمي' } }]));
  if (q === 'notalist') return res.end(JSON.stringify({ error: 'Nominatim is busy' }));
  if (q === 'دوار المنارة') return res.end(JSON.stringify([{ lat: '31.5296', lon: '35.0973', name: 'دوار المنارة', display_name: 'دوار المنارة' }]));
  if (q === 'المنارة') return res.end(JSON.stringify([
    { lat: '31.9039', lon: '35.2042', name: 'ميدان المنارة', display_name: 'ميدان المنارة' },
    { lat: '31.6600', lon: '35.1700', name: 'خربة المنارة', display_name: 'خربة المنارة' },
  ]));
  if (q === 'manara') return res.end(JSON.stringify([
    { lat: '31.5296', lon: '35.0973', name: 'دوار المنارة', display_name: 'دوار المنارة, الخليل' },
    { lat: '31.9039', lon: '35.2042', name: 'دوار المنارة', display_name: 'دوار المنارة, رام الله' },
  ]));
  res.end(JSON.stringify([
    { lat: '31.9605', lon: '35.1830', name: 'جامعة بيرزيت', display_name: 'جامعة بيرزيت, بيرزيت', address: { road: '4566', village: 'بيرزيت', city: 'مجلس ماتي بنيامين الإقليمي', county: 'منطقة أ' } },
    { lat: '32.0853', lon: '34.7818', name: 'Tel Aviv', display_name: 'Tel Aviv, Israel' },
    { lat: 'x', lon: '35.2', name: 'Broken', display_name: 'Broken' },
  ]));
});
await new Promise(r => geocoder.listen(0, '127.0.0.1', r));
process.env.GEOCODER_URL = `http://127.0.0.1:${geocoder.address().port}/`;
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}/`;
process.env.OSRM_TIMEOUT_MS = '3000'; // The fixture's health contract must not inherit operator timeout settings.
const dir = mkdtempSync(join(tmpdir(), 'wind-route-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);

try {
  const admin = await call('/auth/register', { body: { phone: '0599800001', name: 'Admin', password: 'secret1' } });
  await promote('0599800001');
  const customer = await call('/auth/register', { body: { phone: '0599800002', name: 'Lina', password: 'secret1' } });
  await call('/admin/routing', { expect: 401 });
  await call('/admin/routing', { token: customer.token, expect: 403 });
  const unmeasured = await call('/admin/routing', { token: admin.token });
  assert.deepEqual(unmeasured, { provider: 'osrm', configured: true, healthy: null, checkedAt: null, reason: 'not_checked', timeoutMs: 3000 });
  const driver = await call('/auth/register', { body: { phone: '0599800003', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });

  // AC1: session required, coordinates validated, OSRM answer reshaped, repeats cached (~10 m rounding).
  await call('/route?from=31.9,35.2&to=32.22,35.26', { expect: 401 });
  for (const bad of ['from=91,35&to=32,35', 'from=abc&to=32,35', 'to=32,35'])
    await call(`/route?${bad}`, { token: customer.token, expect: 400 });
  const road = await call('/route?from=31.90381,35.20341&to=32.2211,35.2544', { token: customer.token });
  assert.deepEqual(road, { km: 61.2, minutes: 55, line: [[35.2034, 31.9038], [35.23, 32], [35.2544, 32.2211]], avoids: [], through: [], closed: [], provider: 'osrm' });
  assert.equal((await call('/admin/routing', { token: admin.token })).healthy, true);
  await call('/route?from=31.90383,35.20344&to=32.2211,35.2544', { token: customer.token });
  assert.equal(calls, 1, 'a fix a few metres away reuses the cached route');
  assert.match(lastUrl, /overview=full&geometries=geojson&steps=true&alternatives=3$/, 'full geometry (simplified lines cut corners) and alternatives');
  // A via point is passed through: the driver's banner must not say "arrive" there.
  mode = 'legs';
  const viaSteps = (await call('/route?from=31.71,35.21&to=32.21,35.25&steps=1', { token: customer.token })).steps;
  assert.deepEqual(viaSteps.map(step => step.type), ['depart', 'turn', 'arrive'], 'one depart, one arrive, across legs');
  mode = 'ok'; calls--;
  // A driver heading becomes an OSRM bearing hint (rounded to 15 degrees) and its own cache entry.
  await call('/route?from=31.90381,35.20341&to=32.2211,35.2544&heading=93', { token: customer.token });
  assert.equal(calls, 2); assert.match(lastUrl, /&alternatives=3&bearings=90,60;$/);
  for (const bad of ['360', '-1', 'x']) await call(`/route?from=31.9,35.2&to=32.22,35.26&heading=${bad}`, { token: customer.token, expect: 400 });
  mode = 'none';
  await call('/route?from=31.5,35.1&to=31.7,35.2', { token: customer.token, expect: 404 });
  mode = 'down';
  await call('/route?from=31.51,35.1&to=31.7,35.2', { token: customer.token, expect: 503 });
  const unavailable = await call('/admin/routing', { token: admin.token });
  assert.equal(unavailable.healthy, false); assert.equal(unavailable.reason, 'route_unavailable');
  assert.ok(unavailable.checkedAt > 0);
  await call('/ready'); // Essential DB readiness is independent of optional routing health.
  mode = 'ok';
  await call('/route?from=31.51,35.1&to=31.7,35.2', { token: customer.token }); // failures are not cached
  assert.equal((await call('/admin/routing', { token: admin.token })).healthy, true);

  // A malformed upstream route must never reach the map as null metrics or invalid coordinates, or be cached.
  for (const invalid of ['bad-distance', 'bad-line', 'empty-line', 'http-error']) {
    mode = invalid;
    const path = `/route?from=31.52,35.1&to=31.7,35.2&heading=${['bad-distance', 'bad-line', 'empty-line', 'http-error'].indexOf(invalid) * 15}`;
    assert.equal((await call(path, { token: customer.token, expect: 503 })).error, 'route_unavailable', invalid);
    mode = 'ok';
    assert.equal((await call(path, { token: customer.token })).minutes, 55, `${invalid}: retry recovers`);
  }

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
  assert.deepEqual({ ...eta, approach: undefined, road: undefined, fixUpdatedAt: undefined }, { minutes: 55, delayed: false, approach: undefined, road: undefined, fixAgeSeconds: 0, fixUpdatedAt: undefined });
  assert.ok(Number.isFinite(eta.fixUpdatedAt), 'the client can age the ETA after it was received');
  const currentRef = (await call(`/track/${token}`)).driver.ref;
  assert.deepEqual(await call(`/track/${token}/eta?driver=000000000000`), { minutes: null }, 'a route for another driver is never returned');
  assert.deepEqual(await call(`/track/${token}/eta?driver=${currentRef}&status=in_transit`), { minutes: null }, 'a route for an old trip stage is never returned');
  assert.equal((await call(`/track/${token}/eta?driver=${currentRef}`)).minutes, 55);
  assert.ok(eta.fixAgeSeconds >= 0 && eta.fixAgeSeconds < 5, 'the estimate says how old the fix it starts from is');
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
  // A driver fix no road reaches (or OSRM down) gives no minutes, not an error; the cached trip line still shows.
  await call('/location', { token: driver.token, body: { latitude: 31.9502, longitude: 35.2102, accuracy: 5 } });
  for (const failing of ['none', 'down']) {
    mode = failing;
    const lost = await call(`/track/${token}/eta`);
    assert.deepEqual([lost.minutes, lost.approach, lost.road?.length], [null, undefined, 3], failing);
  }
  mode = 'ok';

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

  // Map search: session required, bounded input, only served-area places, cached repeats, failures not cached.
  await call('/places/search?q=birzeit', { expect: 401 });
  for (const bad of ['q=a', `q=${'x'.repeat(101)}`, 'lang=en']) await call(`/places/search?${bad}`, { token: customer.token, expect: 400 });
  const found = await call(`/places/search?q=${encodeURIComponent('جامعة بيرزيت')}&lang=ar`, { token: customer.token });
  // The detail is street/village + our served town: never a settlement council or an Oslo area label.
  assert.deepEqual(found, { hits: [{ name: 'جامعة بيرزيت', detail: '4566، بيرزيت، البيرة', latitude: 31.9605, longitude: 35.183 }] });
  const sent = new URL(geoUrl, 'http://x').searchParams;
  assert.deepEqual([sent.get('format'), sent.get('accept-language'), sent.get('countrycodes'), sent.get('viewbox'), sent.get('bounded'), sent.get('addressdetails')], ['jsonv2', 'ar', 'ps', '34.2,32.6,35.6,31.2', '1', '1']);
  await call(`/places/search?q=${encodeURIComponent('جامعة بيرزيت')}&lang=ar`, { token: customer.token });
  assert.equal(geoCalls, 1, 'a repeated search is answered from the cache');
  geoMode = 'down';
  await call('/places/search?q=nablus', { token: customer.token, expect: 503 });
  geoMode = 'ok';
  assert.equal((await call('/places/search?q=nablus', { token: customer.token })).hits.length, 1, 'a failure is not cached');
  assert.equal(geoCalls, 3);
  // Same name in two towns: upstream order without `near`, closest first with it, one cached upstream call for both.
  const manara = async near => (await call(`/places/search?q=manara${near}`, { token: customer.token })).hits.map(h => h.detail);
  assert.deepEqual(await manara(''), ['الخليل', 'رام الله']);
  assert.deepEqual(await manara('&near=31.9038,35.2034'), ['رام الله', 'الخليل']);
  assert.equal(geoCalls, 4);
  // Up to two of street/neighbourhood/village, then always our served town (never the council in `city`); English joins with commas.
  assert.equal((await call('/places/search?q=fourpart', { token: customer.token })).hits[0].detail, 'شارع الإرسال، الماصيون، رام الله');
  assert.equal((await call('/places/search?q=fourpart&lang=en', { token: customer.token })).hits[0].detail, 'شارع الإرسال, الماصيون, Ramallah');
  assert.equal(geoCalls, 6);
  // An upstream error body is a failure, not "no places": nothing is cached and the next search asks again.
  await call('/places/search?q=notalist', { token: customer.token, expect: 503 });
  await call('/places/search?q=notalist', { token: customer.token, expect: 503 });
  assert.equal(geoCalls, 8);
  // A square query also asks for the bare name and keeps only squares carrying it: Ramallah's ميدان first, the ruin dropped.
  const squares = await call(`/places/search?q=${encodeURIComponent('دوار المنارة')}&near=31.9038,35.2034`, { token: customer.token });
  assert.deepEqual(squares.hits.map(h => h.name), ['ميدان المنارة', 'دوار المنارة']);
  assert.equal(geoCalls, 10);
  // Identical searches in flight share one upstream lookup.
  await Promise.all([1, 2].map(() => call('/places/search?q=dedupe', { token: customer.token })));
  assert.equal(geoCalls, 11, 'two concurrent misses, one upstream call');
  // A failed second lookup returns the first answer uncached; a stop-word bare name ("ساحة ال") makes no second lookup.
  geoMode = 'bare-down';
  await call(`/places/search?q=${encodeURIComponent('ميدان المنارة')}`, { token: customer.token });
  geoMode = 'ok';
  await call(`/places/search?q=${encodeURIComponent('ميدان المنارة')}`, { token: customer.token });
  assert.equal(geoCalls, 15, 'the partial answer was not cached: both lookups ran again');
  await call(`/places/search?q=${encodeURIComponent('ساحة ال')}`, { token: customer.token });
  assert.equal(geoCalls, 16);

  console.log('route: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
  osrm.close();
  geocoder.close();
}
