// Parcel cancellation races on the installed SQLite API, including both serial orderings.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, PARCEL_LOAD, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-cancel-race-'));
Object.assign(process.env, { NODE_ENV: 'test', DB_PATH: join(dir, 'test.db'), WIND_ENABLED_SERVICES: 'parcel',
  WIND_EXPO_PUSH_ENABLED: '1',
  WIND_PUSH_SUBJECT: 'mailto:wind-cancel-race@example.invalid' });
for (const key of ['WIND_DATABASE_URL', 'DATABASE_URL', 'WIND_POSTGRES_STAGING', 'OSRM_URL', 'EXPO_ACCESS_TOKEN']) delete process.env[key];
const realFetch = globalThis.fetch, sent = [], inFlight = new Set();
let runtime, detached;
const settle = async () => { while (inFlight.size) await Promise.allSettled([...inFlight]); };
const modes = ['action-first', 'cancel-first', ...Array.from({ length: 20 }, (_, i) => i % 2 ? 'race-action-first' : 'race-cancel-first')];

async function pair(cancel, action, mode) {
  if (mode === 'cancel-first') return [await cancel(), await action()];
  if (mode === 'action-first') { const result = await action(); return [await cancel(), result]; }
  if (mode === 'race-action-first') {
    const [acted, cancelled] = await Promise.all([action(), cancel()]);
    return [cancelled, acted];
  }
  return Promise.all([cancel(), action()]);
}
const ok = (result, label) => {
  assert.equal(result.status, 200, `${label}: ${JSON.stringify(result)}`);
  return result.data;
};
const no5xx = (results, label) => {
  for (const result of results) assert.ok(result.status < 500, `${label}: ${JSON.stringify(result)}`);
};

try {
  // SQLite has no durable outbox: observe its post-commit native delivery without contacting Expo.
  globalThis.fetch = (url, init) => {
    if (!String(url).startsWith('https://exp.host/')) return realFetch(url, init);
    sent.push(...JSON.parse(init.body));
    return Promise.resolve(Response.json({ data: [{ status: 'ok', id: 'synthetic-ticket' }] }));
  };
  runtime = await import('../server/main.ts');
  const { server, db, persistence, promote } = runtime;
  assert.equal(persistence.backend, 'sqlite');
  detached = persistence.detached;
  persistence.detached = work => {
    const running = detached.call(persistence, work);
    inFlight.add(running);
    void running.then(() => inFlight.delete(running), () => inFlight.delete(running));
    return running;
  };
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`, call = apiCaller(() => base, realFetch);
  // Keep status even if an error response is not JSON; non-2xx must reach the race assertions.
  const raw = async (path, token, body = {}) => {
    const response = await realFetch(base + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  };
  const admin = await call('/auth/register', { body: { phone: '0599970001', name: 'Synthetic admin', password: 'secret1' } });
  await promote('0599970001');
  const customer = await call('/auth/register', { body: { phone: '0599970002', name: 'Synthetic sender', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599970003', name: 'Synthetic courier', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  const expoToken = `ExponentPushToken[cancel-race-${randomUUID()}]`;
  await call('/push/native/register', { token: driver.token,
    body: { expoPushToken: expoToken, deviceId: randomUUID(), platform: 'android', lang: 'en' } });
  // Legacy parcel assignment is orders.driver_id, not the PG dispatch-history table.
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'assignment_history'").get(), undefined);
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Synthetic gate', dropoffNote: 'Synthetic door', contact: '0599970002', detail: 'Synthetic box' };
  const book = extra => call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input), ...extra } });
  const view = id => call(`/orders/${id}`, { token: customer.token });
  const earnings = async () => (await call('/driver/earnings', { token: driver.token })).all;
  const cancel = id => raw(`/orders/${id}/cancel`, customer.token);
  const accept = id => raw(`/jobs/${id}/accept`, driver.token);
  const advance = (id, expectedStatus, extra = {}) => raw(`/orders/${id}/advance`, driver.token,
    { requestId: randomUUID(), expectedStatus, ...extra });

  async function cancelledAssignment(order, accepted, label) {
    const final = await view(order.id);
    assert.equal(final.status, 'cancelled', label);
    assert.equal(final.driverId, accepted ? driver.user.id : null, `${label}: assignment matches accept outcome`);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM order_actions WHERE order_id = ?').get(order.id).n, 0,
      `${label}: accept/cancel writes no legacy advance history`);
    await settle();
    const notifications = sent.filter(m => m.to === expoToken && m.data.kind === 'cancelled' && m.data.order === order.id);
    assert.equal(notifications.length, accepted ? 1 : 0, `${label}: accepted courier receives cancellation`);
    assert.ok(!(await call('/jobs', { token: driver.token })).some(job => job.id === order.id), `${label}: absent from jobs`);
  }
  async function freshAcceptance(label) {
    const order = await book();
    assert.equal(ok(await accept(order.id), `${label}: new parcel accepted`).status, 'assigned');
    assert.equal(ok(await cancel(order.id), `${label}: new parcel cancelled`).status, 'cancelled');
    await cancelledAssignment(order, true, label);
  }

  // A: cancellation succeeds both before and after an accept; every race is followed by a new acceptance.
  let replacements = 0;
  for (const [round, mode] of modes.entries()) {
    const order = await book(), label = `A ${mode} ${round} order=${order.id}`;
    assert.equal(order.status, 'searching');
    const [cancelled, accepted] = await pair(() => cancel(order.id), () => accept(order.id), mode);
    no5xx([cancelled, accepted], label);
    assert.equal(ok(cancelled, label).status, 'cancelled');
    if (mode === 'action-first') assert.equal(accepted.status, 200, label);
    if (mode === 'cancel-first') assert.ok(accepted.status >= 400 && accepted.status < 500, label);
    if (accepted.status === 200) assert.equal(accepted.data.status, 'assigned', label);
    else assert.ok(accepted.status >= 400 && accepted.status < 500, `${label}: accept loses with 4xx`);
    await cancelledAssignment(order, accepted.status === 200, label);
    await freshAcceptance(`${label}: load released`);
    replacements++;
  }
  // Do not lower PARCEL_LOAD for the test: stale cancelled load must fail a real new HTTP acceptance.
  while (replacements <= PARCEL_LOAD) await freshAcceptance(`A load cycle ${++replacements}`);
  assert.ok(replacements > PARCEL_LOAD);
  assert.deepEqual(await earnings(), { jobs: 0, gross: 0, commission: 0, net: 0 });

  // B: real assigned -> at_pickup flow. Parcel pickup needs no PIN; delivery needs the sender's handover code.
  for (const [round, mode] of modes.entries()) {
    const order = await book(), label = `B ${mode} ${round} order=${order.id}`;
    ok(await accept(order.id), label);
    assert.equal(ok(await advance(order.id, 'assigned'), label).status, 'at_pickup');
    const before = await earnings();
    const [cancelled, advanced] = await pair(() => cancel(order.id), () => advance(order.id, 'at_pickup'), mode);
    no5xx([cancelled, advanced], label);
    assert.equal([cancelled, advanced].filter(r => r.status === 200).length, 1, `${label}: exactly one success`);
    const final = await view(order.id);
    if (final.status === 'cancelled') {
      assert.equal(ok(cancelled, label).status, 'cancelled');
      assert.equal(advanced.status, 409, label);
      assert.equal(advanced.data.error, 'cannot_advance', label);
      assert.deepEqual(await earnings(), before, `${label}: no earnings or counted commission`);
    } else {
      assert.equal(final.status, 'in_transit', label);
      assert.equal(ok(advanced, label).status, 'in_transit');
      assert.equal(cancelled.status, 409, label);
      assert.equal(cancelled.data.error, 'cannot_cancel', label);
      assert.deepEqual(await earnings(), before, `${label}: pickup is not a paid completion`);
      assert.ok(final.handoverCode, `${label}: sender has delivery proof`);
      // Complete through the real proof flow to free custody before the next round and validate the money API.
      const completed = ok(await advance(order.id, 'in_transit', { code: final.handoverCode }), label);
      assert.equal(completed.status, 'completed');
      const after = await earnings();
      assert.equal(after.jobs, before.jobs + 1);
      assert.equal(after.gross, before.gross + completed.price);
      assert.equal(after.commission, before.commission + completed.commission);
      assert.equal(after.net, Math.round((after.gross - after.commission) * 100) / 100);
    }
    if (mode === 'cancel-first') assert.equal(final.status, 'cancelled', label);
    if (mode === 'action-first') assert.equal(final.status, 'in_transit', label);
  }

  // C: rescheduling may win before cancellation, but cannot resurrect a cancelled scheduled parcel.
  const DAY = 86_400_000;
  for (const [round, mode] of modes.entries()) {
    const order = await book({ scheduledFor: Date.now() + DAY }), label = `C ${mode} ${round} order=${order.id}`;
    assert.equal(order.status, 'searching', label);
    assert.ok(order.scheduledFor > Date.now() + 3_600_000, `${label}: scheduled outside the release window`);
    const moved = Date.now() + 2 * DAY;
    const [cancelled, scheduled] = await pair(() => cancel(order.id),
      () => raw(`/orders/${order.id}/schedule`, customer.token, { scheduledFor: moved }), mode);
    no5xx([cancelled, scheduled], label);
    assert.equal(ok(cancelled, label).status, 'cancelled');
    assert.ok(scheduled.status === 200 || (scheduled.status === 409 && scheduled.data.error === 'cannot_reschedule'), label);
    if (mode === 'action-first') assert.equal(scheduled.status, 200, label);
    if (mode === 'cancel-first') assert.equal(scheduled.status, 409, label);
    assert.equal((await view(order.id)).status, 'cancelled', label);
    const retry = await raw(`/orders/${order.id}/schedule`, customer.token, { scheduledFor: Date.now() + 3 * DAY });
    assert.equal(retry.status, 409, label);
    assert.equal(retry.data.error, 'cannot_reschedule', label);
    assert.equal((await view(order.id)).status, 'cancelled', `${label}: remains cancelled after reschedule retry`);
  }
} finally {
  try { await settle(); if (runtime) await runtime.shutdown(); }
  finally {
    globalThis.fetch = realFetch;
    if (runtime && detached) runtime.persistence.detached = detached;
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log('cancel-race: ok');
