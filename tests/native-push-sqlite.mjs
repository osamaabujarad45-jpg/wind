// Native push on the SQLite runtime production runs on: registration, delivery through a mocked Expo, muting, stale tokens and revocation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, quote } from '../src/model.ts';
import { apiCaller } from './support/api.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wind-native-push-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.WIND_ENABLED_SERVICES = 'parcel';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-native-push-suite@example.invalid';
process.env.WIND_EXPO_PUSH_ENABLED = '1';
delete process.env.OSRM_URL; delete process.env.EXPO_ACCESS_TOKEN; delete process.env.WIND_DATABASE_URL;
const { shutdown, server, promote, db, persistence } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const realFetch = globalThis.fetch;
const sent = [];
let ticket = { status: 'ok', id: 'ticket' };
let deliveryGate;
globalThis.fetch = (url, init) => {
  if (!String(url).startsWith('https://exp.host/')) return realFetch(url, init);
  sent.push(JSON.parse(init.body)[0]);
   return (deliveryGate ?? Promise.resolve()).then(() => Response.json({ data: [ticket] }));
};
const inFlight = new Set();
const detached = persistence.detached.bind(persistence);
persistence.detached = work => {
  const running = detached(work);
  inFlight.add(running);
  void running.then(() => inFlight.delete(running), () => inFlight.delete(running));
  return running;
};
const settle = async () => { while (inFlight.size) await Promise.allSettled([...inFlight]); };
const call = apiCaller(() => base, realFetch);
const expoToken = label => `ExponentPushToken[native-${label}-${randomUUID().slice(0, 8)}]`;
const tokensOf = id => db.prepare('SELECT * FROM native_push_tokens WHERE user_id = ?').all(id);
const input = { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false,
  pickupNote: 'Secret gate', dropoffNote: 'Secret door', contact: '0599160002', detail: 'Box' };

try {
  const admin = await call('/auth/register', { body: { phone: '0599160001', name: 'Admin', password: 'secret1' } });
  await promote('0599160001');
  const customer = await call('/auth/register', { body: { phone: '0599160002', name: 'Rana', password: 'secret1' } });
  const driver = await call('/auth/register', { body: { phone: '0599160003', name: 'Omar', password: 'secret1', role: 'driver', vehicle: 'car' } });
  const other = await call('/auth/register', { body: { phone: '0599160004', name: 'Sami', password: 'secret1', role: 'driver', vehicle: 'car' } });
  for (const d of [driver, other]) await call(`/admin/users/${d.user.id}/approve`, { token: admin.token, body: {} });

  // Validation and session binding.
  const driverDevice = randomUUID(), driverToken = expoToken('driver');
  await call('/push/native/register', { body: { expoPushToken: driverToken, deviceId: driverDevice, platform: 'android' }, expect: 401 });
  await call('/push/native/register', { token: driver.token, body: { expoPushToken: 'not-a-token', deviceId: driverDevice, platform: 'android' }, expect: 400 });
  await call('/push/native/register', { token: driver.token, body: { expoPushToken: driverToken, deviceId: driverDevice, platform: 'web' }, expect: 400 });
  const created = await call('/push/native/register', { token: driver.token, body: { expoPushToken: driverToken, deviceId: driverDevice, platform: 'android', lang: 'en' } });
  assert.equal(created.registered, true);
  await call('/push/native/register', { token: driver.token, body: { expoPushToken: driverToken, deviceId: driverDevice, platform: 'android', lang: 'en' } });
  assert.equal(tokensOf(driver.user.id).length, 1, 'registering twice keeps one row');

  const customerDevice = randomUUID(), customerToken = expoToken('customer');
  await call('/push/native/register', { token: customer.token, body: { expoPushToken: customerToken, deviceId: customerDevice, platform: 'android' } });

  // A new job reaches the driver's closed app, urgently, on the heads-up channel, saying nothing about the order.
  let order = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await settle();
  assert.deepEqual(sent.map(m => m.to), [driverToken], 'only the driver with a token hears of the job');
  assert.equal(sent[0].priority, 'high');
  assert.equal(sent[0].channelId, 'default', 'the channel src/native-push.ts creates');
  assert.equal(sent[0].ttl, 300, 'a job alert is stale after five minutes');
  assert.equal(sent[0].data.url, '/driver');
  assert.equal(sent[0].data.kind, 'job');
  assert.equal(sent[0].body, 'You have a new update. Open Wind to view it.', 'in the language the device registered');
  assert.ok(!JSON.stringify(sent[0]).includes('Secret'), 'no order detail leaves the server');

  // A muted kind is not sent. Muting is per device and reversible.
  sent.length = 0;
  await call('/push/native/preferences', { token: driver.token, body: { deviceId: driverDevice, prefs: { mutedKinds: ['job'] } } });
  const quiet = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await settle();
  assert.deepEqual(sent, [], 'a muted job alert stays quiet');
  await call('/push/native/preferences', { token: driver.token, body: { deviceId: driverDevice, prefs: { mutedKinds: [] } } });
  await call(`/orders/${quiet.id}/cancel`, { token: customer.token, body: { reason: 'changed_mind', requestId: randomUUID() } }).catch(() => {});
  await settle();

  // A status change reaches the customer in Arabic, their registered language, and opens their order.
  sent.length = 0;
  order = await call(`/jobs/${order.id}/accept`, { token: driver.token, body: {} });
  await settle();
  assert.deepEqual(sent.map(m => m.to), [customerToken]);
  assert.equal(sent[0].data.url, `/order/${order.id}`);
  assert.equal(sent[0].body, 'لديك تحديث جديد. افتح ويند لعرضه.');
  assert.ok(sent[0].ttl <= 3600);

  // A second token for the same device replaces the first, and a phone passed to another account leaves the old one.
  const rotated = expoToken('rotated');
  await call('/push/native/register', { token: driver.token, body: { expoPushToken: rotated, deviceId: driverDevice, platform: 'android', lang: 'en' } });
  assert.deepEqual(tokensOf(driver.user.id).map(t => t.expo_push_token), [rotated]);
  await call('/push/native/register', { token: other.token, body: { expoPushToken: rotated, deviceId: driverDevice, platform: 'android' } });
  assert.equal(tokensOf(driver.user.id).length, 0);
  assert.equal(tokensOf(other.user.id).length, 1);

  // Expo says the app is gone: the token is dropped and never tried again.
  sent.length = 0;
  ticket = { status: 'error', details: { error: 'DeviceNotRegistered' } };
  const gone = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await settle();
  assert.equal(sent.length, 1, 'tried once');
  assert.equal(tokensOf(other.user.id).length, 0, 'the dead token is removed');
  ticket = { status: 'ok', id: 'ticket' };
  await call(`/orders/${gone.id}/cancel`, { token: customer.token, body: { reason: 'changed_mind', requestId: randomUUID() } }).catch(() => {});
  await settle();

  // Any other provider failure is best effort and keeps the token.
  const keptDevice = randomUUID(), keptToken = expoToken('kept');
  await call('/push/native/register', { token: other.token, body: { expoPushToken: keptToken, deviceId: keptDevice, platform: 'android' } });
  ticket = { status: 'error', details: { error: 'MessageRateExceeded' } };
  const busy = await call('/orders', { token: customer.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await settle();
  assert.equal(tokensOf(other.user.id).length, 1);
  ticket = { status: 'ok', id: 'ticket' };
  await call(`/orders/${busy.id}/cancel`, { token: customer.token, body: { reason: 'changed_mind', requestId: randomUUID() } }).catch(() => {});
  await settle();

  // One customer may ring drivers only five times per ten minutes, so the last checks book from a new account.
  const second = await call('/auth/register', { body: { phone: '0599160006', name: 'Huda', password: 'secret1' } });

  // Until the owner turns it on nothing leaves the server.
  sent.length = 0;
  delete process.env.WIND_EXPO_PUSH_ENABLED;
  const gated = await call('/orders', { token: second.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
  await settle();
  assert.deepEqual(sent, [], 'no network without the gate');
  assert.equal(tokensOf(other.user.id).length, 1, 'and the token survives');
  process.env.WIND_EXPO_PUSH_ENABLED = '1';
  await call(`/orders/${gated.id}/cancel`, { token: second.token, body: { reason: 'changed_mind', requestId: randomUUID() } }).catch(() => {});
  await settle();

  // Blocking an account ends its sessions, so its alerts stop at the source.
  const blockedDriver = await call('/auth/register', { body: { phone: '0599160007', name: 'Yousef', password: 'secret1', role: 'driver', vehicle: 'car' } });
  await call(`/admin/users/${blockedDriver.user.id}/approve`, { token: admin.token, body: {} });
  const fresh = await call('/auth/login', { body: { identifier: '0599160007', password: 'secret1' } });
  await call('/push/native/register', { token: fresh.token, body: { expoPushToken: expoToken('blocked'), deviceId: randomUUID(), platform: 'android' } });
  assert.equal(tokensOf(blockedDriver.user.id).length, 1);
  await call(`/admin/users/${blockedDriver.user.id}`, { method: 'PATCH', token: admin.token, body: { status: 'blocked' } });
  assert.equal(tokensOf(blockedDriver.user.id).length, 0, 'a blocked account holds no token');

  // Ending the session ends its token, on every path that deletes sessions.
  // Fill the actual delivery queue, then revoke while the ninth delivery waits for a slot.
  for (let i = 0; i < 8; i++) await call('/push/native/register', { token: other.token,
    body: { expoPushToken: expoToken(`queued-${i}`), deviceId: randomUUID(), platform: 'android' } });
  let releaseDelivery;
  deliveryGate = new Promise(resolve => { releaseDelivery = resolve; });
  sent.length = 0;
  try {
    await call('/orders', { token: second.token, body: { ...input, quotedPrice: quote(defaultSettings, input) } });
    for (let i = 0; sent.length < 8 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(sent.length, 8, 'eight sends occupy every delivery slot');
    await call('/auth/logout', { token: other.token, body: {} });
  } finally { releaseDelivery(); deliveryGate = undefined; await settle(); }
  assert.equal(sent.length, 8, 'a queued delivery cannot use a revoked session token');
  assert.equal(tokensOf(other.user.id).length, 0, 'signing out removes the token');
  const leaving = await call('/auth/register', { body: { phone: '0599160005', name: 'Lina', password: 'secret1' } });
  const leavingDevice = randomUUID();
  await call('/push/native/register', { token: leaving.token, body: { expoPushToken: expoToken('leaving'), deviceId: leavingDevice, platform: 'android' } });
  assert.equal(tokensOf(leaving.user.id).length, 1);
  await call('/push/native/unregister', { token: leaving.token, body: { deviceId: leavingDevice } });
  assert.equal(tokensOf(leaving.user.id).length, 0, 'unregistering removes it');
  await call('/push/native/register', { token: leaving.token, body: { expoPushToken: expoToken('leaving2'), deviceId: leavingDevice, platform: 'android' } });
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(leaving.user.id);
  assert.equal(tokensOf(leaving.user.id).length, 0, 'any session deletion cascades');

  // Realtime credentials stay honestly gated on this backend.
  const realtime = await call('/orders/1/realtime', { token: customer.token, expect: 409 });
  assert.equal(realtime.error, 'durable_protocol_unavailable');

  // A store build reads the Firebase file from the EAS variable; a side-by-side test app, whose package it does not name, never does.
  const require = createRequire(import.meta.url), config = require('../app.config.js');
  const base_ = { android: { package: 'ps.wind.app' }, ios: {}, plugins: [] };
  assert.equal(config({ config: base_ }).android.googleServicesFile, undefined, 'no file, no setting');
  const reload = () => { delete require.cache[require.resolve('../app.config.js')]; return require('../app.config.js'); };
  process.env.GOOGLE_SERVICES_JSON = '/tmp/google-services.json';
  assert.equal(reload()({ config: base_ }).android.googleServicesFile, '/tmp/google-services.json');
  assert.equal(reload()({ config: base_ }).android.package, 'ps.wind.app', 'and the package is kept');
  delete process.env.GOOGLE_SERVICES_JSON;

  console.log('Native push on SQLite: registration, delivery, muting, dead tokens, the owner gate, blocked accounts and revocation');
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
}
