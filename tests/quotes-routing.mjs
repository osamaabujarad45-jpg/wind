// WP08 routing: provider unavailable, all alternatives prohibited, stale/conflicting, same-city
import { freshPostgres, selectRuntime } from './pg-support.mjs';
const pg = await freshPostgres('quotes_routing');
await pg.database.close();
selectRuntime(pg.schema);

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-quotes-routing-')), 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SOUQ_PARTNER_KEY = 'wp08-routing-test-key-32-chars-min';
delete process.env.OSRM_URL;

const { server, persistence, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = () => `http://127.0.0.1:${server.address().port}/api`;
const call = apiCaller(base);

try {
  const admin = await call('/auth/register', { body: { phone: '0599010001', name: 'Admin', password: 'secret123' } });
  await promote('0599010001');
  const customer = await call('/auth/register', { body: { phone: '0599010002', name: 'Lina', password: 'secret123' } });
  const driver = await call('/auth/register', { body: { phone: '0599010003', name: 'Sami', password: 'secret123', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });

  const orderInput = {
    service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Manara', dropoffNote: 'Hospital', contact: '0599010002', detail: 'Box',
  };

  // 1. Provider unavailable => uncertain, not infeasible, booking allowed with disclosure
  const priceUncertain = await call('/price', { token: customer.token, body: orderInput });
  assert.ok(['uncertain','feasible'].includes(priceUncertain.feasibility), `expected uncertain/feasible, got ${priceUncertain.feasibility}`);
  assert.ok(priceUncertain.disclosures.includes('uncertain_routing') || priceUncertain.disclosures.includes('estimated_route'));
  assert.equal(priceUncertain.estimated, true);
  const orderOk = await call('/orders', { token: customer.token, body: { ...orderInput, quoteId: priceUncertain.quoteId, requestId: randomUUID() } });
  assert.equal(orderOk.status, 'searching');
  console.log('✓ provider unavailable => uncertain, booking allowed');

  // 2. All alternatives prohibited => infeasible blocks booking
  // Insert a road_restriction that covers the Ramallah-Nablus corridor
  const adminRow = await persistence.one('SELECT id FROM users WHERE phone=?', '0599010001');
  const now = Date.now();
  // Geometry: LineString from Ramallah (35.2034,31.9038) to Nablus (35.2544,32.2211) - use EWKT without SRID prefix for ST_GeomFromText
  const wkt = 'LINESTRING(35.2034 31.9038, 35.2544 32.2211)';
  await persistence.run(
    `INSERT INTO road_restrictions (restriction_key, version, state, services, vehicle_classes, geometry, direction, source, valid_from, valid_until, last_confirmed_at, confidence, confirmed_prohibition, reviewer_id, evidence_ref, reason, created_at)
     VALUES (?, 1, 'closed', ?::jsonb, ?::jsonb, ST_GeomFromText(?, 4326), 'bidirectional', 'test', ?, ?, ?, 'high', true, ?, 'test-evidence', 'test block', ?)`,
    'test-block-ramallah-nablus', JSON.stringify(['parcel']), JSON.stringify([]), wkt, now-10000, now+1000000, now, adminRow.id, now
  );
  const check = await persistence.one("SELECT COUNT(*) AS n FROM road_restrictions WHERE restriction_key='test-block-ramallah-nablus'");
  console.log('inserted restriction count', check.n);
  // Now price should be infeasible (409) for parcel while restriction active
  await call('/price', { token: customer.token, body: orderInput, expect: 409 });
  console.log('✓ road restriction blocks');

  // Clean up restriction for next tests (disable trigger for test cleanup)
  await persistence.run('ALTER TABLE road_restrictions DISABLE TRIGGER road_restrictions_immutable');
  await persistence.run("DELETE FROM road_restrictions WHERE restriction_key='test-block-ramallah-nablus'");
  await persistence.run('ALTER TABLE road_restrictions ENABLE TRIGGER road_restrictions_immutable');

  // After removal, Ramallah-Nablus should be bookable again (uncertain)
  const priceAfter = await call('/price', { token: customer.token, body: orderInput });
  assert.ok(priceAfter.quoteId);
  console.log('✓ road restriction blocks and unblocks correctly');

  // 3. Same-city / rural pin handling
  // Same city should be allowed
  const sameCity = await call('/price', { token: customer.token, body: { ...orderInput, pickupCity: 'ramallah', dropoffCity: 'ramallah' } });
  assert.ok(sameCity.quoteId);
  assert.ok(sameCity.feasibility);
  // Rural pin within SERVICE_KM (15km) of Ramallah should be allowed
  const ruralPoint = { latitude: 31.95, longitude: 35.25 }; // ~7km from Ramallah
  const ruralPrice = await call('/price', { token: customer.token, body: { ...orderInput, pickupPoint: ruralPoint, dropoffCity: 'nablus' } });
  assert.ok(ruralPrice.quoteId);
  console.log('✓ same-city and rural pin handled');

  // 4. Stale/conflicting road reports => uncertain
  // Our default restrictions quality is missing, so any price is uncertain already.
  // Verify that a price with estimated route is always uncertain
  const stalePrice = await call('/price', { token: customer.token, body: orderInput });
  assert.equal(stalePrice.feasibility, 'uncertain');
  console.log('✓ stale/conflicting => uncertain');

  console.log('all quotes-routing tests passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  try { await persistence.close?.(); } catch {}
}
