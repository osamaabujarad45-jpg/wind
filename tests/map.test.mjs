// Live map (SPEC-live-map.md): exact dropoff points with pickup-point visibility, driver heading/accuracy.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultSettings, quote } from '../src/model.ts';
import { backtracks, bearing, ease, etaRange, fitBounds, labelField, nearLine, roadPath, shownApproach } from '../src/map-math.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-map-'));
process.env.DB_PATH = join(dir, 'test.db');
// A database from before this module: driver_locations without heading/accuracy, orders without dropoff points.
const legacy = new DatabaseSync(process.env.DB_PATH);
legacy.exec('CREATE TABLE driver_locations (driver_id INTEGER PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL, updated_at INTEGER NOT NULL)');
legacy.close();
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);

try {
  const columns = table => db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  assert.ok(['heading', 'accuracy'].every(c => columns('driver_locations').includes(c)), 'legacy driver_locations upgraded');
  assert.ok(['dropoff_lat', 'dropoff_lng'].every(c => columns('orders').includes(c)));

  const admin = await call('/auth/register', { body: { phone: '0599700001', name: 'Admin', password: 'secret1' } });
  promote('0599700001');
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
  await call('/price', { token: customer.token, body: { ...input, pickupPoint: { latitude: 31.9038, longitude: 35.0734 } } }); // 12 km out: inside the 15 km bound
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

  // Without OSRM_URL the road route is unavailable and clients keep straight lines (SPEC-routing-eta.md).
  await call('/route?from=31.9,35.2&to=32.2,35.26', { token: customer.token, expect: 503 });

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

  // The web map loads vendored copies of the installed library (versioned folder, immutable caching).
  const { version } = JSON.parse(readFileSync(new URL('../node_modules/maplibre-gl/package.json', import.meta.url), 'utf8'));
  const route = readFileSync(new URL('../src/route-map.tsx', import.meta.url), 'utf8');
  assert.ok(route.includes(`'/vendor/maplibre-${version}'`), `route-map.tsx must point at /vendor/maplibre-${version}`);
  for (const file of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css'])
    assert.equal(readFileSync(new URL(`../public/vendor/maplibre-${version}/${file}`, import.meta.url), 'utf8'),
      readFileSync(new URL(`../node_modules/maplibre-gl/dist/${file}`, import.meta.url), 'utf8'), `re-vendor ${file} after upgrading maplibre-gl`);

  // Android map page (SPEC-android-map.md): same vendored library, and its copy of the helpers behaves like map-math.ts.
  const page = readFileSync(new URL('../public/map.html', import.meta.url), 'utf8');
  assert.equal(page.match(/\/vendor\/maplibre-[\d.]+\//g).filter(p => p !== `/vendor/maplibre-${version}/`).length, 0, `map.html must point at /vendor/maplibre-${version}`);
  const helpers = page.slice(page.indexOf('// Same helpers'), page.indexOf('// End of helpers.'));
  const copy = new Function(`${helpers}; return { bearing, ease, fitBounds, labelField };`)();
  const a = { latitude: 31.9, longitude: 35.2 }, b = { latitude: 32.22, longitude: 35.26 };
  assert.equal(copy.bearing(a, b), bearing(a, b));
  assert.deepEqual(copy.ease(a, b, 0.3), ease(a, b, 0.3));
  assert.deepEqual(copy.ease(a, b, 3), ease(a, b, 3));
  for (const points of [[a, b], [a]]) assert.deepEqual(copy.fitBounds(points), fitBounds(points));
  for (const language of ['ar', 'en']) assert.deepEqual(copy.labelField(language), labelField(language));
  // Served from the web root like the rest of the app (the APK loads it from the API origin).
  const web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(join(web, 'map.html'), page);
  const child = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e',
    `const { server } = await import(${JSON.stringify(new URL('../server/main.ts', import.meta.url).href)}); server.listen(0, async () => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/map.html'); console.log(r.status, r.headers.get('content-type'), r.headers.get('cache-control'), (await r.text()).includes('maplibre')); server.close(); });`],
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

  console.log('map: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
