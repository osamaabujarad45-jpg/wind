// SQLite partner creation: order and external reference commit or roll back together.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-partner-atomic-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
delete process.env.WIND_DATABASE_URL;
delete process.env.WIND_POSTGRES_TEST_SCHEMA;
delete process.env.WIND_POSTGRES_TEST_ONLY;
delete process.env.OSRM_URL;
const { server, db, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = async body => {
  const response = await fetch(`${base}/partner/orders`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Partner-Key': process.env.SOUQ_PARTNER_KEY }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};
const counts = () => ({
  orders: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
  references: db.prepare('SELECT COUNT(*) AS n FROM partner_orders').get().n,
});
const booking = { externalRef: 'partner:atomic:1', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
  shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599300002', detail: 'Box', quotedPrice: 20 };
try {
  const rejectedScope = await call({ ...booking, declaredScope: {} });
  assert.equal(rejectedScope.status, 409);
  assert.equal(rejectedScope.data.error, 'scope_unavailable');
  assert.deepEqual(counts(), { orders: 0, references: 0 }, 'scope refusal leaves no unmapped order');

  db.prepare(`CREATE TRIGGER partner_reference_failure BEFORE INSERT ON partner_orders
    BEGIN SELECT RAISE(ABORT, 'injected_partner_reference_failure'); END`).run();
  const rejectedReference = await call(booking);
  assert.equal(rejectedReference.status, 500, JSON.stringify(rejectedReference.data));
  assert.deepEqual(counts(), { orders: 0, references: 0 }, 'reference failure rolls back the order too');
  db.prepare('DROP TRIGGER partner_reference_failure').run();

  const first = await call(booking);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const replay = await call(booking);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.id, first.data.id);
  assert.deepEqual(counts(), { orders: 1, references: 1 }, 'one valid retry maps exactly one order');
  console.log('SQLite partner atomicity: rejected scope/reference writes roll back; valid replay maps one order');
} finally {
  db.prepare('DROP TRIGGER IF EXISTS partner_reference_failure').run();
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
