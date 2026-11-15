// Quoted booking authority: logout/block/role/delete during the route wait must prevent every commit.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databaseUrl = process.env.WIND_TEST_DATABASE_URL;
if (!databaseUrl) {
  console.log('SKIP quoted authority: WIND_TEST_DATABASE_URL is unset');
} else {
  const { freshPostgres, selectRuntime } = await import('./pg-support.mjs');
  const fresh = await freshPostgres('quote_auth');
  await fresh.database.close();
  selectRuntime(fresh.schema);
  process.env.WIND_TEST_POSTGRES_LOCK_TIMEOUT_MS = '10000';
  const answer = JSON.stringify({ code: 'Ok', routes: [{ distance: 20000, duration: 1800,
    geometry: { coordinates: [[35.2, 31.9], [35.3, 32.2]] } }] });
  let armed = false, releaseGate = null;
  const osrm = createServer((_req, res) => {
    if (armed) releaseGate = () => res.end(answer);
    else res.end(answer);
  });
  const home = mkdtempSync(join(tmpdir(), 'wind-quoted-authority-'));
  process.env.DB_PATH = join(home, 'local.db');
  process.env.WIND_ENABLED_SERVICES = 'parcel';
  await new Promise(resolve => osrm.listen(0, '127.0.0.1', resolve));
  process.env.OSRM_URL = `http://127.0.0.1:${osrm.address().port}`;
  const { server, persistence, promote, shutdown } = await import('../server/main.ts');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, body, token, expect = 200, method) => {
    const response = await fetch(base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }) });
    const data = await response.json();
    assert.equal(response.status, expect, `${path}: ${JSON.stringify(data)}`);
    return data;
  };
  let index = 0;
  try {
    const admin = await call('/auth/register', { phone: '0599123000', name: 'Authority admin', password: 'secret123' });
    await promote('0599123000');
    for (const withCommand of [false, true]) {
      for (const change of ['logout', 'block', 'role', 'delete']) {
        index += 1;
        const phone = `0599123${String(index).padStart(3, '0')}`;
        const customer = await call('/auth/register', { phone, name: 'Quoted customer', password: 'secret123' });
        const quote = await call('/price', { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
          option: 'small', shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: phone, detail: 'Box' }, customer.token);
        armed = true;
        const booking = call('/orders', { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
          option: 'small', shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: phone, detail: 'Box',
          pickupPoint: { latitude: 31.9 + index / 1000, longitude: 35.2 }, quoteId: quote.quoteId,
          ...(withCommand && { requestId: randomUUID() }) }, customer.token, 401);
        for (let attempt = 0; attempt < 400 && releaseGate == null; attempt += 1) await new Promise(resolve => setTimeout(resolve, 5));
        assert.ok(releaseGate, `${change} withCommand=${withCommand}: booking did not reach its route wait`);
        if (change === 'logout') await call('/auth/logout', {}, customer.token);
        else if (change === 'delete') await call(`/admin/users/${customer.user.id}`, undefined, admin.token, 200, 'DELETE');
        else await call(`/admin/users/${customer.user.id}`, change === 'block' ? { status: 'blocked' } : { role: 'driver' }, admin.token);
        const release = releaseGate;
        releaseGate = null;
        armed = false;
        release();
        await booking;
        const counts = await persistence.one(`SELECT
          (SELECT count(*) FROM orders WHERE customer_id = ?) AS orders,
          (SELECT count(*) FROM order_commands WHERE user_id = ?) AS commands`, customer.user.id, customer.user.id);
        assert.deepEqual({ orders: Number(counts.orders), commands: Number(counts.commands) }, { orders: 0, commands: 0 },
          `${change} withCommand=${withCommand} must not commit after authority is revoked`);
      }
    }
    console.log('Quoted booking authority: logout, block, role change and deletion during routing prevent all commits');

    const expiryCustomer = await call('/auth/register', { phone: '0599123999', name: 'Expired quote', password: 'secret123' });
    const expired = await call('/price', { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
      option: 'small', shared: false, pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599123999', detail: 'Box' }, expiryCustomer.token);
    // Quotes are immutable after insertion: create a separate expired quote instead of rewriting one.
    const quotedRow = await persistence.one('SELECT * FROM quotes WHERE id=?::uuid', expired.quoteId);
    const retainedColumns = Object.keys(quotedRow).filter(column => !['id', 'created_at', 'expires_at'].includes(column));
    const expiredQuoteId = randomUUID();
    await persistence.run(`INSERT INTO quotes (id,created_at,expires_at,${retainedColumns.join(',')})
      SELECT ?,?,?,${retainedColumns.join(',')} FROM quotes WHERE id=?::uuid`,
      expiredQuoteId, Date.now() - 2000, Date.now() - 1000, expired.quoteId);
    const rejectedRequestId = randomUUID();
    const expiredBody = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
      pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599123999', detail: 'Box', quoteId: expiredQuoteId, requestId: rejectedRequestId };
    await call('/orders', expiredBody, expiryCustomer.token, 409);
    const rejectedReceipt = await call(`/orders/commands/${rejectedRequestId}`, undefined, expiryCustomer.token);
    assert.equal(rejectedReceipt.state, 'absent');
    assert.equal(rejectedReceipt.error, 'quote_expired');
    await call('/orders', expiredBody, expiryCustomer.token, 409);
    assert.equal(Number((await persistence.one('SELECT count(*) AS n FROM orders WHERE customer_id = ?', expiryCustomer.user.id)).n), 0,
      'an expired quote never creates an order or second attempt');
    console.log('Quoted terminal rejection: PostgreSQL absent receipt replays quote_expired without creation');
  } finally {
    releaseGate?.();
    await new Promise(resolve => server.close(resolve));
    await shutdown?.();
    await new Promise(resolve => osrm.close(resolve));
    try { await persistence.close?.(); } catch {}
    rmSync(home, { recursive: true, force: true });
  }
}
