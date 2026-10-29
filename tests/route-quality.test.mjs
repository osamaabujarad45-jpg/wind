import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SLOW_MINUTES } from '../src/model.ts';
import { bestRoute, checkpointDelaySeconds, expectedMinutes, expectedSeconds } from '../server/domain/route-quality.ts';

// Pure arithmetic: the ETA and the fare use the same slow-checkpoint delay.
assert.equal(checkpointDelaySeconds(0), 0);
assert.equal(checkpointDelaySeconds(1), SLOW_MINUTES * 60);
assert.equal(checkpointDelaySeconds(-2), 0, 'negative counts never reduce a delay');
assert.equal(expectedSeconds(1000, 0), 1000);
assert.equal(expectedSeconds(1000, 1), 1000 + SLOW_MINUTES * 60);
assert.equal(expectedMinutes(1000, 0), 17);
assert.equal(expectedMinutes(1000, 1), 17 + SLOW_MINUTES);
assert.equal(expectedMinutes(0, 0), 1, 'a completed leg never shows zero minutes');

const fastButSlow = { id: 'fast', duration: 1800 };
const slowerButClear = { id: 'clear', duration: 2100 };
assert.equal(bestRoute([fastButSlow, slowerButClear], route => route.id === 'fast' ? SLOW_MINUTES * 60 : 0), slowerButClear,
  'a reported slow checkpoint makes the clear alternative the better ETA');
assert.equal(bestRoute([fastButSlow, slowerButClear], () => 0), fastButSlow, 'with no reports OSRM fastest still wins');

// Integration: fake OSRM returns a faster route through a slow checkpoint and a
// slightly slower one around it; /route must pick the clear one and add the
// delay only when the chosen route still crosses a report.
const dir = mkdtempSync(join(tmpdir(), 'wind-route-quality-'));
const osrm = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!req.url?.includes('alternatives=3')) {
    res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 22000, duration: 2100,
      geometry: { coordinates: [[35.2, 31.9], [35.24, 32.06], [35.3, 32.2]] } }] }));
    return;
  }
  res.end(JSON.stringify({ code: 'Ok', routes: [
    { distance: 20000, duration: 1800, geometry: { coordinates: [[35.2, 31.9], [35.25, 32.0], [35.3, 32.2]] } },
    { distance: 22000, duration: 2100, geometry: { coordinates: [[35.2, 31.9], [35.24, 32.06], [35.3, 32.2]] } },
  ] }));
});
await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
process.env.DB_PATH = join(dir, 'test.db');
delete process.env.WIND_ENABLED_SERVICES;
const { server, promote, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function call(path, { body, token, method = 'POST', expect = 200 } = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, expect, `${path}: ${JSON.stringify(result)}`);
  return result;
}
try {
  const admin = await call('/auth/register', { body: { phone: '0599700001', name: 'Route Admin', password: 'secret1' } });
  await promote('0599700001');
  const customer = await call('/auth/register', { body: { phone: '0599700002', name: 'Route Customer', password: 'secret1' } });
  const road = (await call('/admin/roads', { token: admin.token, body: { name: 'Qalandia slow', cities: ['ramallah', 'nablus'],
    point: { latitude: 32.0, longitude: 35.25 } } })).find(r => r.name === 'Qalandia slow');
  await call(`/roads/${road.id}/report`, { token: admin.token, body: { status: 'slow' } });
  const route = await call('/route?from=31.9,35.2&to=32.2,35.3', { token: customer.token, method: 'GET' });
  assert.equal(route.km, 22, 'the clear alternative is chosen');
  assert.equal(route.minutes, 35, 'the clear alternative ETA is used');
  console.log('route quality tests passed: slow checkpoint changes route choice and ETA');
} finally {
  await shutdown();
  await new Promise(resolve => osrm.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
