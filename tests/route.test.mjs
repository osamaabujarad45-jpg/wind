// Road routing (SPEC-routing-eta.md): OSRM proxy with cache, public ETA, and graceful absence.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultSettings, quote } from '../src/model.ts';

// Fake OSRM: answers like /route/v1/driving, counts calls, can be told to fail.
let calls = 0, mode = 'ok', lastUrl = '';
const osrm = createServer((req, res) => {
  calls++; lastUrl = req.url;
  const [a, b] = decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop()).split(';').map(p => p.split(',').map(Number));
  if (mode === 'down') return res.destroy();
  if (mode === 'none') return res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
  res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 61234, duration: 3300, geometry: { type: 'LineString', coordinates: [a, [35.23, 32.0], b] } }] }));
});
await new Promise(r => osrm.listen(0, '127.0.0.1', r));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}/`;
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-route-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { server, promote } = await import('../server/main.ts');
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
  assert.deepEqual(road, { km: 61.2, minutes: 55, line: [[35.2034, 31.9038], [35.23, 32], [35.2544, 32.2211]] });
  await call('/route?from=31.90383,35.20344&to=32.2211,35.2544', { token: customer.token });
  assert.equal(calls, 1, 'a fix a few metres away reuses the cached route');
  assert.match(lastUrl, /overview=full&geometries=geojson$/, 'full geometry: simplified lines cut corners');
  // A driver heading becomes an OSRM bearing hint (rounded to 15 degrees) and its own cache entry.
  await call('/route?from=31.90381,35.20341&to=32.2211,35.2544&heading=93', { token: customer.token });
  assert.equal(calls, 2); assert.match(lastUrl, /&bearings=90,60;$/);
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

  console.log('route: ok');
} finally {
  server.close(); osrm.close();
}
