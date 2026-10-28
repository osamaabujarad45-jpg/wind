// Safety reports during a live trip (SPEC-safety-sos.md): parties only, freeze the order, admin resolves, reporter stays anonymous.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-safety-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
const { shutdown, server, db, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const call = apiCaller(() => base);
const advance = (token, order, extra = {}, expect = 200) =>
  call(`/orders/${order.id}/advance`, { token, body: { expectedStatus: order.status, requestId: randomUUID(), ...extra }, expect });

try {
  const admin = await call('/auth/register', { body: { phone: '0599500001', name: 'Admin', password: 'secret1' } });
  await promote('0599500001');
  const customer = await call('/auth/register', { body: { phone: '0599500002', name: 'Rana Saleh', password: 'secret1' } });
  const stranger = await call('/auth/register', { body: { phone: '0599500005', name: 'Other', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599500003', name: 'Omar Nasser', password: 'secret1', role: 'driver', vehicle: 'van' } });
  const driver2 = await call('/auth/register', { body: { phone: '0599500004', name: 'Second', password: 'secret1', role: 'driver', vehicle: 'van' } });
  for (const d of [driver, driver2]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });
  const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
    pickupNote: 'Gate', dropoffNote: 'Door', contact: '0599500002', detail: 'Box' };
  let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });

  // Searching orders have no trip to be unsafe on yet.
  await call(`/orders/${order.id}/sos`, { token: customer.token, body: { kind: 'threat' }, expect: 409 });
  order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await call('/location', { token: driver.token, body: { latitude: 32.01, longitude: 35.22 } });

  for (const [token, expect] of [[stranger.token, 404], [driver2.token, 404], [admin.token, 409]])
    await call(`/orders/${order.id}/sos`, { token, body: { kind: 'threat' }, expect });
  for (const body of [{ kind: 'nope' }, { kind: 'other', note: 'x'.repeat(301) }, {}])
    await call(`/orders/${order.id}/sos`, { token: customer.token, body, expect: 400 });

  const reported = await call(`/orders/${order.id}/sos`, { token: customer.token, body: { kind: 'harassment', note: ' Rude messages ' } });
  assert.equal(reported.safetyHold, true);
  assert.deepEqual(reported.safetyReport, { status: 'open', kind: 'harassment', resolution: null });
  const again = await call(`/orders/${order.id}/sos`, { token: customer.token, body: { kind: 'threat' } });
  assert.equal(again.safetyReport.kind, 'harassment'); // repeat returns the open report
  assert.equal(db.prepare('SELECT COUNT(*) n FROM safety_incidents').get().n, 1);

  // The other party sees a neutral hold, never the report.
  const driverView = await call(`/orders/${order.id}`, { token: driver.token });
  assert.equal(driverView.safetyHold, true);
  assert.equal(driverView.safetyReport, null);
  assert.ok(!JSON.stringify(driverView).includes('Rude'));
  const held = await advance(driver.token, order, {}, 409);
  assert.equal(held.error, 'safety_hold');
  assert.equal((await call(`/orders/${order.id}/release`, { token: driver.token, body: {}, expect: 409 })).error, 'safety_hold');

  // Admin sees who, how to reach both sides, and where.
  await call('/admin/incidents', { token: customer.token, expect: 403 });
  const [incident] = await call('/admin/incidents', { token: admin.token });
  assert.equal(incident.orderId, order.id);
  assert.equal(incident.kind, 'harassment');
  assert.equal(incident.note, 'Rude messages');
  assert.equal(incident.reporterRole, 'customer');
  assert.equal(incident.reporterPhone, '0599500002');
  assert.equal(incident.driverPhone, '0599500003');
  assert.equal(incident.customerPhone, '0599500002'); // the account phone, not the editable order contact
  assert.equal(incident.latitude, 32.01);
  assert.equal(incident.status, 'open');
  assert.equal((await call('/admin/stats', { token: admin.token })).openIncidents, 1);

  // The driver can report too, separately.
  const byDriver = await call(`/orders/${order.id}/sos`, { token: driver.token, body: { kind: 'threat' } });
  assert.equal(byDriver.safetyReport.kind, 'threat');
  assert.equal((await call(`/orders/${order.id}`, { token: customer.token })).safetyReport.kind, 'harassment');

  await call(`/admin/incidents/${incident.id}/resolve`, { token: admin.token, body: { resolution: 'no' }, expect: 400 });
  await call(`/admin/incidents/${incident.id}/resolve`, { token: driver.token, body: { resolution: 'Called both' }, expect: 403 });
  await call(`/admin/incidents/${incident.id}/resolve`, { token: admin.token, body: { resolution: 'Called both sides' } });
  await call(`/admin/incidents/${incident.id}/resolve`, { token: admin.token, body: { resolution: 'Called both sides' }, expect: 409 });
  const after = await call(`/orders/${order.id}`, { token: customer.token });
  assert.deepEqual(after.safetyReport, { status: 'resolved', kind: 'harassment', resolution: 'Called both sides' });
  assert.equal(after.safetyHold, true); // the driver's report is still open
  const list = await call('/admin/incidents', { token: admin.token });
  assert.equal(list[0].status, 'open'); // open first
  await call(`/admin/incidents/${list[0].id}/resolve`, { token: admin.token, body: { resolution: 'Driver safe' } });
  assert.equal((await call(`/orders/${order.id}`, { token: driver.token })).safetyHold, false);
  order = await advance(driver.token, order); // unfrozen
  assert.equal(order.status, 'at_pickup');

  const audit = db.prepare("SELECT action FROM security_events WHERE order_id = ? AND action LIKE 'SAFETY_%' ORDER BY id").all(order.id).map(r => r.action);
  assert.deepEqual(audit, ['SAFETY_REPORTED', 'SAFETY_REPORTED', 'SAFETY_RESOLVED', 'SAFETY_RESOLVED']);
  assert.equal((await call('/admin/stats', { token: admin.token })).openIncidents, 0);

  // A frozen in-transit order cannot be put on hold either; resolving lifts it.
  order = await advance(driver.token, order);
  await call(`/orders/${order.id}/sos`, { token: driver.token, body: { kind: 'accident' } });
  const exception = await call(`/orders/${order.id}/exception`, { token: driver.token, body: { reason: 'absent', expectedStatus: 'in_transit', requestId: randomUUID() }, expect: 409 });
  assert.equal(exception.error, 'safety_hold');
  const [open] = (await call('/admin/incidents', { token: admin.token })).filter(i => i.status === 'open');
  await call(`/admin/incidents/${open.id}/resolve`, { token: admin.token, body: { resolution: 'Minor, all fine' } });

  // Finished orders cannot be reported on; the dispute flow covers them.
  const { handoverCode } = await call(`/orders/${order.id}`, { token: customer.token });
  await advance(driver.token, order, { code: handoverCode });
  await call(`/orders/${order.id}/sos`, { token: customer.token, body: { kind: 'other' }, expect: 409 });

  console.log('safety: ok');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
