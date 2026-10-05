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
const admin = await reg('0599000009', 'Admin'); promote('0599000009');
const customer = await reg('0599000001', 'Layla');
const driver = await reg('0599000002', 'Ahmad', { role: 'driver', vehicle: 'car' });
await call(`/admin/users/${driver.user.id}/approve`, admin.token, {});
const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'bireh', option: 'small', shared: false, pickupNote: 'Al-Manara square', dropoffNote: 'City hall', contact: '0599000001', detail: 'Docs',
  pickupPoint: { latitude: 31.9022, longitude: 35.2063 }, dropoffPoint: { latitude: 31.9106, longitude: 35.2167 } };
const order = await call('/orders', customer.token, { ...input, quotedPrice: quote(defaultSettings, input), requestId: randomUUID() });
await call(`/jobs/${order.id}/accept`, driver.token, {});
// A closed checkpoint on the route turns the ETA into "N+ min" (SPEC-road-aware-eta.md); DEMO_ROADS=0 skips it.
if (process.env.DEMO_ROADS !== '0') {
  const [road] = await call('/admin/roads', admin.token, { name: 'Surda', cities: ['ramallah', 'bireh'] });
  await call(`/roads/${road.id}/report`, driver.token, { status: 'closed' });
}
// Driver drives from Al-Tireh toward the pickup, one fix every 3 s.
let lat = 31.9135, lng = 35.1955;
setInterval(() => {
  lat += (31.9022 - lat) * 0.15; lng += (35.2063 - lng) * 0.15;
  call('/location', driver.token, { latitude: lat, longitude: lng, accuracy: 25 }).catch(e => console.error(e.message));
}, 3000);
console.log(`ready http://localhost:${process.env.PORT ?? 4000}/order/${order.id} (customer 0599000001)`);
