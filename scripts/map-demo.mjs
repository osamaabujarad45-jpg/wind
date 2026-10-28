// Local live-map demo: throwaway DB, serves a web export, seeds an order and moves the driver.
//   npx expo export -p web --output-dir .map-demo && node scripts/map-demo.mjs
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-map-demo-')), 'demo.db');
process.env.WEB_ROOT ??= resolve('.map-demo');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.WIND_IDENTITY_MODE = 'self-service';
const { server, promote } = await import('../server/main.ts');
const { quote, defaultSettings } = await import('../src/model.ts');
await new Promise(r => server.listen(Number(process.env.PORT ?? 4000), r));
const call = async (path, token, body) => {
  const res = await fetch(`http://localhost:${process.env.PORT ?? 4000}/api${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const data = await res.json(); if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`); return data;
};
const reg = (phone, name, extra = {}) => call('/auth/register', null, { phone, name, email: `${phone}@example.test`, consent: true, password: 'Demo_Secret1', ...extra });
const admin = await reg('0599000009', 'Admin'); await promote('0599000009');
const customer = await reg('0599000001', 'Layla');
const driver = await reg('0599000002', 'Ahmad', { role: 'driver', vehicle: 'car' });
await call(`/admin/users/${driver.user.id}/approve`, admin.token, {});
const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'bireh', option: 'small', shared: false, pickupNote: 'Al-Manara square', dropoffNote: 'City hall', contact: '0599000001', detail: 'Docs',
  pickupPoint: { latitude: 31.9022, longitude: 35.2063 }, dropoffPoint: { latitude: 31.9106, longitude: 35.2167 } };
const order = await call('/orders', customer.token, { ...input, quotedPrice: quote(defaultSettings, input), requestId: randomUUID() });
await call(`/jobs/${order.id}/accept`, driver.token, {});
// DEMO_RUN=1: the courier also carries a second parcel, so the order shows the run line instead of an ETA (SPEC-courier-run-eta.md).
if (process.env.DEMO_RUN === '1') {
  const second = await call('/orders', customer.token, { ...input, dropoffNote: 'Bus station', quotedPrice: quote(defaultSettings, input), requestId: randomUUID() });
  await call(`/jobs/${second.id}/accept`, driver.token, {});
  console.log(`track http://localhost:${process.env.PORT ?? 4000}${(await call(`/orders/${order.id}/share`, customer.token, {})).path}`);
}
// A closed checkpoint on the route turns the ETA into "N+ min" (SPEC-road-aware-eta.md); DEMO_ROADS=0 skips it.
if (process.env.DEMO_ROADS !== '0') {
  const [road] = await call('/admin/roads', admin.token, { name: 'Surda', cities: ['ramallah', 'bireh'] });
  await call(`/roads/${road.id}/report`, driver.token, { status: 'closed' });
}
// Driver drives from Al-Tireh to the pickup along the road route when OSRM_URL is set (straight slide otherwise),
// one fix every 3 s, ~80 m apart.
const start = { latitude: 31.9135, longitude: 35.1955 }, pickup = input.pickupPoint;
const roadLine = await call(`/route?from=${start.latitude},${start.longitude}&to=${pickup.latitude},${pickup.longitude}`, driver.token)
  .then(r => r.line.map(([lng, lat]) => ({ latitude: lat, longitude: lng })), () => [start, pickup]);
const path = [];
for (let i = 1; i < roadLine.length; i++) {
  const a = roadLine[i - 1], b = roadLine[i], steps = Math.max(1, Math.round(Math.hypot((b.latitude - a.latitude) * 111e3, (b.longitude - a.longitude) * 94e3) / 80));
  for (let k = 0; k < steps; k++) path.push({ latitude: a.latitude + (b.latitude - a.latitude) * k / steps, longitude: a.longitude + (b.longitude - a.longitude) * k / steps });
}
path.push(pickup);
let step = 0;
setInterval(() => {
  const at = path[Math.min(step++, path.length - 1)];
  call('/location', driver.token, { ...at, accuracy: 25 }).catch(e => console.error(e.message));
}, 3000);
console.log(`ready http://localhost:${process.env.PORT ?? 4000}/order/${order.id} (customer 0599000001)`);
