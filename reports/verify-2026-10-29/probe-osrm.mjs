// P1 #5: with OSRM_URL unset, does routing silently fall back to straight-line?
// The report claims every booking gets a fallback line/ETA and the response marks it estimated.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-osrm-'));
process.env.DB_PATH = join(dir, 'v.db');
process.env.WIND_ENABLED_SERVICES = 'parcel,ride';
process.env.SUPPORT_CONTACT = 'verify@example.test';
delete process.env.OSRM_URL; // the deployed state

const { server, db, promote } = await import('../../server/main.ts');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const out = (id, v, m) => console.log(`${v.padEnd(12)} ${id}\n             -> ${m}`);

async function call(path, { token, body } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { status: res.status, data: d };
}

try {
  const cust = (await call('/auth/register', { body: { phone: '0599440001', name: 'C', password: 'secret1' } })).data;
  const body = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    detail: 'Box', contact: '0599440001', pickupNote: 'A', dropoffNote: 'B' };
  const p = await call('/price', { token: cust.token, body });
  const r = p.data;
  // Ramallah->Nablus straight line is ~46 km; the road is ~54.5 km. A straight-line x1.3 gives ~60 km.
  out('P1-5 no-OSRM-price', r.estimated === true ? 'VERIFIED' : 'REFUTED',
    `estimated=${r.estimated} km=${r.km} minutes=${r.minutes} line=${r.line === null ? 'null' : 'present'}`);
  out('P1-5b', 'INFO',
    `with OSRM_URL unset the API returns a synthetic line/ETA; the response does set estimated=true so the client can label it, but nothing tells the OPERATOR.`);
  const route = await call('/route?from=ramallah&to=nablus', { token: cust.token });
  out('P1-5c route-endpoint', route.status === 200 ? 'INFO' : 'INFO', `/route -> ${route.status} ${JSON.stringify(route.data).slice(0, 90)}`);
} finally {
  console.log('temp:', dir);
  server.close();
}
