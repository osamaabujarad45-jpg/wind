// Live map (SPEC-live-map.md): exact dropoff points with pickup-point visibility, driver heading/accuracy.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultSettings, quote } from '../src/model.ts';
import { bearing, ease, fitBounds, labelField } from '../src/map-math.ts';

const dir = mkdtempSync(join(tmpdir(), 'wind-map-'));
process.env.DB_PATH = join(dir, 'test.db');
// A database from before this module: driver_locations without heading/accuracy, orders without dropoff points.
const legacy = new DatabaseSync(process.env.DB_PATH);
legacy.exec('CREATE TABLE driver_locations (driver_id INTEGER PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL, updated_at INTEGER NOT NULL)');
legacy.close();
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(path, { token, body, expect = 200 } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expect, `${path}: ${JSON.stringify(data)}`);
  return data;
}

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
  assert.deepEqual(labelField('en'), ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]);

  // The web map loads vendored copies of the installed library (versioned folder, immutable caching).
  const { version } = JSON.parse(readFileSync(new URL('../node_modules/maplibre-gl/package.json', import.meta.url), 'utf8'));
  const route = readFileSync(new URL('../src/route-map.tsx', import.meta.url), 'utf8');
  assert.ok(route.includes(`'/vendor/maplibre-${version}'`), `route-map.tsx must point at /vendor/maplibre-${version}`);
  for (const file of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css'])
    assert.equal(readFileSync(new URL(`../public/vendor/maplibre-${version}/${file}`, import.meta.url), 'utf8'),
      readFileSync(new URL(`../node_modules/maplibre-gl/dist/${file}`, import.meta.url), 'utf8'), `re-vendor ${file} after upgrading maplibre-gl`);

  console.log('map: ok');
} finally {
  server.close();
}
