// PostgreSQL partner retry: replay the external reference under the customer lock before cap validation.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databaseUrl = process.env.WIND_TEST_DATABASE_URL;
if (!databaseUrl) {
  console.log('SKIP partner retry race: WIND_TEST_DATABASE_URL is unset');
} else {
  const { freshPostgres, selectRuntime } = await import('./pg-support.mjs');
  const { default: pg } = await import('pg');
  const pgClient = new pg.Client({ connectionString: databaseUrl });
  await pgClient.connect();
  const fresh = await freshPostgres('partner_race');
  await fresh.database.close();
  selectRuntime(fresh.schema);
  process.env.WIND_TEST_POSTGRES_LOCK_TIMEOUT_MS = '10000';
  const dir = mkdtempSync(join(tmpdir(), 'wind-partner-race-'));
  process.env.DB_PATH = join(dir, 'test.db');
  process.env.WIND_ENABLED_SERVICES = 'parcel';
  process.env.SOUQ_PARTNER_KEY = 'test-partner-key-that-is-at-least-32-characters';
  const { server, persistence, shutdown } = await import('../server/main.ts');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async body => {
    const response = await fetch(`${base}/partner/orders`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partner-Key': process.env.SOUQ_PARTNER_KEY }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const booking = { externalRef: 'partner:race:cap', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small',
    shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599300002', detail: 'Box', quotedPrice: 20 };
  try {
    for (let index = 0; index < 4; index += 1) {
      const seeded = await call({ ...booking, externalRef: `partner:seed:${index}` });
      assert.equal(seeded.status, 200, JSON.stringify(seeded.data));
    }
    await persistence.run(`CREATE FUNCTION pause_partner_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.5); RETURN NEW; END $$`);
    await persistence.run('CREATE TRIGGER pause_partner_order BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION pause_partner_insert()');
    const first = call(booking);
    await new Promise(resolve => setTimeout(resolve, 30));
    const second = call(booking);
    let waiters = 0;
    for (let attempt = 0; attempt < 400 && waiters === 0; attempt += 1) {
      waiters = (await pgClient.query(`SELECT count(*)::int n FROM pg_stat_activity a
        WHERE a.state = 'active' AND a.wait_event_type = 'Lock' AND a.pid <> pg_backend_pid()
          AND a.query LIKE '%pg_advisory_xact_lock%wind_searching_cap%'`)).rows[0].n;
      if (waiters === 0) await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.ok(waiters >= 1, 'the concurrent partner retry did not reach the customer-lock wait');
    const [winner, replay] = await Promise.all([first, second]);
    assert.equal(winner.status, 200, JSON.stringify(winner.data));
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.id, winner.data.id, 'both partner calls return the same committed order');
    const counts = await persistence.one(`SELECT
      (SELECT count(*) FROM orders) AS orders,
      (SELECT count(*) FROM partner_orders) AS refs,
      (SELECT count(DISTINCT external_ref) FROM partner_orders) AS distinct_refs`);
    assert.deepEqual({ orders: Number(counts.orders), refs: Number(counts.refs), distinctRefs: Number(counts.distinct_refs) },
      { orders: 5, refs: 5, distinctRefs: 5 });
    await persistence.run('DROP TRIGGER pause_partner_order ON orders');
    const changed = await call({ ...booking, detail: 'Changed payload' });
    assert.equal(changed.status, 409);
    assert.equal(changed.data.error, 'idempotency_conflict');
    console.log('PostgreSQL partner retry: one fifth order/reference replays under the customer lock; changed payload conflicts');
  } finally {
    await persistence.run('DROP TRIGGER IF EXISTS pause_partner_order ON orders').catch(() => {});
    await new Promise(resolve => server.close(resolve));
    await shutdown?.();
    try { await persistence.close?.(); } catch {}
    await pgClient.end().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}
