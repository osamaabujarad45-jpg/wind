// WP09 native push (PG): session-bound registration, revocation cascades, durable expon attempts.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { freshPostgres, selectRuntime, connect } from './pg-support.mjs';
import { apiCaller } from './support/api.mjs';
import { DurableWorker } from '../server/worker.ts';
import { enqueuePush, expoDestination } from '../server/domain/events.ts';
import { nativeDeviceHash, nativeTokenHash } from '../server/domain/native-push.ts';
process.env.WIND_PUSH_SUBJECT = 'mailto:wind-push-suite@example.invalid'; // T37: the worker refuses an unconfigured VAPID subject

const { schema, database: setupDb } = await freshPostgres('native_push');
await setupDb.close();
selectRuntime(schema);
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
delete process.env.WIND_IDENTITY_MODE; delete process.env.WIND_EMAIL_FROM; delete process.env.OSRM_URL;
delete process.env.WIND_EXPO_PUSH_ENABLED; delete process.env.EXPO_ACCESS_TOKEN;
const { server, shutdown, promote } = await import('../server/main.ts');
await new Promise(r => server.listen(0, '127.0.0.1', r));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const conn = connect(schema);
const sha = v => createHash('sha256').update(v).digest('hex');
const rawToken = label => `ExponentPushToken[wp09-${label}-${randomUUID().slice(0, 8)}]`;
const tokensOf = uid => conn.all('SELECT * FROM native_push_tokens WHERE user_id=? ORDER BY created_at', uid);
const countTokens = async uid => (await conn.one('SELECT count(*) n FROM native_push_tokens WHERE user_id=?', uid)).n;

try {
  const reg = (n, extra = {}) => call('/auth/register', { body: { phone: `05994000${String(n).padStart(2, '0')}`, name: 'Synthetic', password: 'synthetic-secret', ...extra } });
  const admin = await reg(1); await promote(admin.user.phone);
  const a = await reg(2), b = await reg(3);

  // Validation and session binding.
  await call('/push/native/register', { body: { expoPushToken: rawToken('anon'), deviceId: randomUUID(), platform: 'android' }, expect: 401 });
  const deviceA = randomUUID(), firstToken = rawToken('first');
  await call('/push/native/register', { token: a.token, body: { expoPushToken: 'not-a-token', deviceId: deviceA, platform: 'android' }, expect: 400 });
  await call('/push/native/register', { token: a.token, body: { expoPushToken: firstToken, deviceId: 'nope', platform: 'android' }, expect: 400 });
  await call('/push/native/register', { token: a.token, body: { expoPushToken: firstToken, deviceId: deviceA, platform: 'web' }, expect: 400 });
  await call('/push/native/register', { token: a.token, body: { expoPushToken: firstToken, deviceId: deviceA, platform: 'android', extra: 1 }, expect: 400 });
  const created = await call('/push/native/register', { token: a.token, body: { expoPushToken: firstToken, deviceId: deviceA, platform: 'android', lang: 'en' } });
  assert.equal(created.registered, true);
  let rows = await tokensOf(a.user.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].auth_session_hash, sha(a.token), 'token bound to the registering session hash');
  assert.equal(rows[0].expo_push_token, firstToken);
  assert.equal(rows[0].device_hash, nativeDeviceHash(deviceA));

  // Refresh rotates the token on the same device; preferences and soft-disable round-trip.
  const secondToken = rawToken('second');
  await call('/push/native/register', { token: a.token, body: { expoPushToken: secondToken, deviceId: deviceA, platform: 'ios', lang: 'ar' } });
  rows = await tokensOf(a.user.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].expo_push_token, secondToken); assert.equal(rows[0].platform, 'ios');
  const prefs = await call('/push/native/preferences', { token: a.token, body: { deviceId: deviceA, prefs: { nonessentialMuted: true, mutedKinds: ['message'], quietHours: null } } });
  assert.deepEqual(prefs.prefs, { nonessentialMuted: true, mutedKinds: ['message'], quietHours: null });
  await call('/push/native/preferences', { token: a.token, body: { deviceId: deviceA, disabled: true } });
  assert.ok((await tokensOf(a.user.id))[0].disabled_at != null, 'soft-disable recorded');
  await call('/push/native/register', { token: a.token, body: { expoPushToken: secondToken, deviceId: deviceA, platform: 'android' } });
  assert.equal((await tokensOf(a.user.id))[0].disabled_at, null, 'fresh registration re-enables');
  await call('/push/native/preferences', { token: a.token, body: { deviceId: randomUUID(), prefs: { nonessentialMuted: false } }, expect: 404 });

  // Account-change reassignment: the same device and token move to B; A loses them.
  await call('/push/native/register', { token: b.token, body: { expoPushToken: secondToken, deviceId: deviceA, platform: 'android' } });
  assert.equal(await countTokens(a.user.id), 0, 'previous account binding retired');
  assert.equal(await countTokens(b.user.id), 1);
  await call('/push/native/preferences', { token: a.token, body: { deviceId: deviceA, prefs: { nonessentialMuted: false } }, expect: 404 });
  assert.equal((await call('/push/native/unregister', { token: b.token, body: { deviceId: deviceA } })).removed, true);
  assert.equal((await call('/push/native/unregister', { token: b.token, body: { deviceId: deviceA } })).removed, false, 'unregister is idempotent');
  assert.equal(await countTokens(b.user.id), 0);

  // Revocation: logout deletes the session and cascades to its tokens.
  const c = await reg(4), deviceC = randomUUID();
  await call('/push/native/register', { token: c.token, body: { expoPushToken: rawToken('logout'), deviceId: deviceC, platform: 'android' } });
  assert.equal(await countTokens(c.user.id), 1);
  await call('/auth/logout', { token: c.token, body: {} });
  assert.equal(await countTokens(c.user.id), 0, 'logout cascade');
  await call('/push/native/register', { token: c.token, body: { expoPushToken: rawToken('gone'), deviceId: deviceC, platform: 'android' }, expect: 401 });

  // Revocation: password change keeps only the current session's devices.
  const p = await reg(5), deviceP1 = randomUUID(), deviceP2 = randomUUID();
  await call('/push/native/register', { token: p.token, body: { expoPushToken: rawToken('pass-old'), deviceId: deviceP1, platform: 'android' } });
  const login = await call('/auth/login', { body: { identifier: p.user.phone, password: 'synthetic-secret' } });
  await call('/push/native/register', { token: login.token, body: { expoPushToken: rawToken('pass-current'), deviceId: deviceP2, platform: 'android' } });
  assert.equal(await countTokens(p.user.id), 2);
  await call('/me/password', { token: login.token, body: { current: 'synthetic-secret', password: 'synthetic-secret-2' } });
  rows = await tokensOf(p.user.id);
  assert.equal(rows.length, 1, 'other sessions revoked by password change');
  assert.equal(rows[0].device_hash, nativeDeviceHash(deviceP2), 'current session device survives');

  // Revocation: account deletion, admin block, admin password reset, phone-path session deletion.
  const del = await reg(6);
  await call('/push/native/register', { token: del.token, body: { expoPushToken: rawToken('delete'), deviceId: randomUUID(), platform: 'ios' } });
  await call('/me/delete', { token: del.token, body: { password: 'synthetic-secret' } });
  assert.equal(await countTokens(del.user.id), 0, 'account-delete cascade');
  const blocked = await reg(7);
  await call('/push/native/register', { token: blocked.token, body: { expoPushToken: rawToken('block'), deviceId: randomUUID(), platform: 'android' } });
  await call(`/admin/users/${blocked.user.id}`, { token: admin.token, method: 'PATCH', body: { status: 'blocked' } });
  assert.equal(await countTokens(blocked.user.id), 0, 'admin block cascade');
  const reset = await reg(8);
  await call('/push/native/register', { token: reset.token, body: { expoPushToken: rawToken('reset'), deviceId: randomUUID(), platform: 'android' } });
  await call(`/admin/users/${reset.user.id}/password`, { token: admin.token, body: {} });
  assert.equal(await countTokens(reset.user.id), 0, 'admin password-reset cascade');
  const phoneUser = await reg(9);
  await call('/push/native/register', { token: phoneUser.token, body: { expoPushToken: rawToken('phone'), deviceId: randomUUID(), platform: 'android' } });
  // phone-identity change/recovery and email reset perform this exact session deletion;
  // the foreign key carries it to native tokens (their session assertions live in phone suites).
  await conn.run('DELETE FROM sessions WHERE user_id=?', phoneUser.user.id);
  assert.equal(await countTokens(phoneUser.user.id), 0, 'phone/reset session-deletion cascade');

  // Native-only driver is reachable for a new job (no Web Push subscription).
  const customer = await reg(10);
  const driver = await reg(11, { role: 'driver', vehicle: 'car' });
  await call(`/admin/users/${driver.user.id}/approve`, { token: admin.token, body: {} });
  await call('/push/native/register', { token: driver.token, body: { expoPushToken: rawToken('driverjob'), deviceId: randomUUID(), platform: 'android' } });
  await call('/orders', { token: customer.token, body: { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus', option: 'small', shared: false, contact: customer.user.phone, detail: 'Synthetic box', pickupNote: 'Synthetic start', dropoffNote: 'Synthetic end', quotedPrice: 20, requestId: randomUUID() } });
  const driverHash = (await tokensOf(driver.user.id))[0].token_hash;
  assert.ok(await conn.one('SELECT * FROM outbox WHERE destination=? AND status=?', expoDestination(driver.user.id, driverHash), 'pending'), 'native-only driver received a durable job attempt');
  await conn.run("UPDATE outbox SET status='review',last_error='synthetic_fixture_isolation' WHERE status IN ('pending','processing')");

  // ---- Durable worker behaviour (isolated user per stage on the same schema) ----
  let phoneSeq = 200;
  const addUser = async (role = 'customer', vehicle = null) =>
    Number((await conn.run('INSERT INTO users(phone,name,password,role,status,vehicle,created_at) VALUES(?,\'Synthetic\',\'\',?,?,?,?)', `059941${String(phoneSeq++).padStart(4, '0')}`, role, 'active', vehicle, Date.now())).lastInsertRowid);
  const addSession = async uid => { const h = sha(`sess-${uid}-${randomUUID()}`); await conn.run('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)', h, uid, Date.now()); return h; };
  const addToken = async (uid, sess, raw, prefs = {}) => {
    await conn.run(`INSERT INTO native_push_tokens(token_hash,user_id,auth_session_hash,device_hash,platform,expo_push_token,lang,prefs_json,created_at,updated_at)
      VALUES(?,?,?,?,'android',?,'en',?::jsonb,?,?)`, nativeTokenHash(raw), uid, sess, nativeDeviceHash(randomUUID()), raw, JSON.stringify(prefs), Date.now(), Date.now());
    return raw;
  };
  const addOrder = async (customerId, driverId = null, status = 'searching') =>
    Number((await conn.run(`INSERT INTO orders(customer_id,driver_id,service,shared,pickup_city,dropoff_city,pickup_note,dropoff_note,contact,detail,option,loading_help,price,status,created_at,updated_at)
      VALUES(?,?, 'parcel',0,'ramallah','nablus','Synthetic start','Synthetic end','0599400099','Synthetic box','small',0,20,?,?,?)`, customerId, driverId, status, Date.now(), Date.now())).lastInsertRowid);
  const destOf = raw => uid => expoDestination(uid, nativeTokenHash(raw));
  const enqueueDest = async (uid, kind, orderId, destination) => {
    await conn.atomic({ id: uid }, () => enqueuePush(conn, [uid], kind, orderId));
    return conn.one('SELECT * FROM outbox WHERE destination=? AND status=?', destination, 'pending');
  };
  const outboxRow = (eventId, destination) => conn.one('SELECT status,last_error,attempts FROM outbox WHERE event_id=?::uuid AND destination=?', eventId, destination);
  const drain = async worker => { let n = 0; while (await worker.runOnce()) { if (++n > 100) throw new Error('unbounded drain'); } };
  const isolate = () => conn.run("UPDATE outbox SET status='review',last_error='synthetic_fixture_isolation' WHERE status IN ('pending','processing')");

  // Rollback: a failed mutation leaves neither the event nor its native attempt.
  const rbUser = await addUser(), rbOrder = await addOrder(rbUser);
  await addToken(rbUser, await addSession(rbUser), rawToken('rollback'));
  const eventsBefore = (await conn.one("SELECT count(*) n FROM domain_events WHERE type='notification.requested'")).n;
  await assert.rejects(() => conn.atomic({ id: rbUser }, async () => { await enqueuePush(conn, [rbUser], 'message', rbOrder); throw new Error('synthetic rollback'); }));
  assert.equal((await conn.one("SELECT count(*) n FROM domain_events WHERE type='notification.requested'")).n, eventsBefore, 'rolled-back enqueue leaves no event');
  await isolate();

  // Delivered: the fake transport sees only the hint fields, never private data.
  const dUser = await addUser(), dOrder = await addOrder(dUser);
  const rawDelivered = await addToken(dUser, await addSession(dUser), rawToken('delivered'));
  const deliveredRow = await enqueueDest(dUser, 'message', dOrder, destOf(rawDelivered)(dUser));
  assert.ok(deliveredRow, 'native attempt written in the mutation transaction');
  const seen = [];
  await drain(new DurableWorker(conn, { expoTransport: async (token, message, ttl) => { seen.push({ to: token.expo_push_token, message: JSON.parse(message), ttl }); } }));
  assert.equal(seen.length, 1); assert.equal(seen[0].to, rawDelivered);
  assert.deepEqual(Object.keys(seen[0].message).sort(), ['eventId', 'kind', 'lang', 'order', 'url']);
  assert.equal(seen[0].message.kind, 'message'); assert.equal(seen[0].message.order, dOrder);
  assert.equal((await outboxRow(deliveredRow.event_id, deliveredRow.destination)).status, 'delivered');
  assert.equal((await conn.one('SELECT count(*) n FROM consumer_inbox WHERE event_id=?::uuid AND destination=?', deliveredRow.event_id, deliveredRow.destination)).n, 1);

  // Preference suppression: muted kind, full-day quiet window, essential bypass, disable-after-enqueue.
  const pUser = await addUser(), pDriver = await addUser('driver', 'car'), pOrder = await addOrder(pUser);
  const rawPrefs = await addToken(pUser, await addSession(pUser), rawToken('prefs'));
  const pDest = destOf(rawPrefs)(pUser);
  const setPrefs = prefs => conn.run('UPDATE native_push_tokens SET prefs_json=?::jsonb WHERE token_hash=?', JSON.stringify(prefs), nativeTokenHash(rawPrefs));
  await setPrefs({ nonessentialMuted: false, mutedKinds: ['message'], quietHours: null });
  let row = await enqueueDest(pUser, 'message', pOrder, pDest);
  await drain(new DurableWorker(conn, { expoTransport: async () => { seen.push({ unexpected: true }); } }));
  assert.equal(seen.length, 1, 'muted kind never reaches the transport');
  assert.deepEqual(await outboxRow(row.event_id, row.destination), { status: 'obsolete', last_error: 'suppressed_muted_kind', attempts: 1 });
  await setPrefs({ nonessentialMuted: false, mutedKinds: [], quietHours: { startMinute: 0, endMinute: 1439, utcOffsetMinutes: 0 } });
  row = await enqueueDest(pUser, 'message', pOrder, pDest);
  await drain(new DurableWorker(conn, { expoTransport: async () => { seen.push({ unexpected: true }); } }));
  assert.equal((await outboxRow(row.event_id, row.destination)).last_error, 'suppressed_quiet_hours');
  const assignedOrder = await addOrder(pUser, pDriver, 'assigned');
  row = await enqueueDest(pUser, 'assigned', assignedOrder, pDest);
  const essentialSeen = [];
  await drain(new DurableWorker(conn, { expoTransport: async (t, m) => { essentialSeen.push(JSON.parse(m)); } }));
  assert.equal(essentialSeen.length, 1, 'essential kinds bypass quiet hours');
  assert.equal((await outboxRow(row.event_id, row.destination)).status, 'delivered');
  await setPrefs({ nonessentialMuted: false, mutedKinds: [], quietHours: null });
  row = await enqueueDest(pUser, 'message', pOrder, pDest);
  await conn.run('UPDATE native_push_tokens SET disabled_at=? WHERE token_hash=?', Date.now(), nativeTokenHash(rawPrefs));
  await drain(new DurableWorker(conn, { expoTransport: async () => { seen.push({ unexpected: true }); } }));
  assert.equal((await outboxRow(row.event_id, row.destination)).last_error, 'suppressed_disabled');

  // Invalid stored token and DeviceNotRegistered both delete the token and go obsolete.
  await isolate();
  const iUser = await addUser(), iOrder = await addOrder(iUser), iSession = await addSession(iUser);
  const rawValid = await addToken(iUser, iSession, rawToken('valid'));
  const badRaw = 'bogus-token-value';
  await conn.run(`INSERT INTO native_push_tokens(token_hash,user_id,auth_session_hash,device_hash,platform,expo_push_token,lang,prefs_json,created_at,updated_at)
    VALUES(?,?,?,?,'android',?,'en','{}'::jsonb,?,?)`, nativeTokenHash(badRaw), iUser, iSession, nativeDeviceHash(randomUUID()), badRaw, Date.now(), Date.now());
  await conn.atomic({ id: iUser }, () => enqueuePush(conn, [iUser], 'message', iOrder));
  await drain(new DurableWorker(conn, { expoTransport: async () => {} }));
  assert.equal((await conn.one('SELECT count(*) n FROM native_push_tokens WHERE token_hash=?', nativeTokenHash(badRaw))).n, 0, 'invalid token deleted');
  assert.equal((await conn.one('SELECT count(*) n FROM native_push_tokens WHERE token_hash=?', nativeTokenHash(rawValid))).n, 1, 'valid token kept');
  const gUser = await addUser(), gOrder = await addOrder(gUser);
  const rawGone = await addToken(gUser, await addSession(gUser), rawToken('gone'));
  row = await enqueueDest(gUser, 'message', gOrder, destOf(rawGone)(gUser));
  await drain(new DurableWorker(conn, { expoTransport: async () => { throw Object.assign(new Error('DeviceNotRegistered'), { code: 'DeviceNotRegistered' }); } }));
  assert.equal((await outboxRow(row.event_id, row.destination)).last_error, 'device_not_registered');
  assert.equal((await conn.one('SELECT count(*) n FROM native_push_tokens WHERE token_hash=?', nativeTokenHash(rawGone))).n, 0, 'DeviceNotRegistered token deleted');

  // Transient failure backs off, then exhausts to review; not-configured never fakes delivery.
  const fUser = await addUser(), fOrder = await addOrder(fUser);
  const rawFlaky = await addToken(fUser, await addSession(fUser), rawToken('flaky'));
  row = await enqueueDest(fUser, 'message', fOrder, destOf(rawFlaky)(fUser));
  const flaky = new DurableWorker(conn, { maxAttempts: 2, baseBackoffMs: 1, expoTransport: async () => { throw Object.assign(new Error('down'), { providerStatus: 503 }); } });
  await drain(flaky); await delay(20); await drain(flaky);
  assert.deepEqual(await outboxRow(row.event_id, row.destination), { status: 'review', last_error: 'provider_http_503', attempts: 2 });
  assert.equal((await conn.one('SELECT count(*) n FROM native_push_tokens WHERE token_hash=?', nativeTokenHash(rawFlaky))).n, 1, 'transient failure keeps the token');
  const nUser = await addUser(), nOrder = await addOrder(nUser);
  const rawDark = await addToken(nUser, await addSession(nUser), rawToken('dark'));
  row = await enqueueDest(nUser, 'message', nOrder, destOf(rawDark)(nUser));
  await drain(new DurableWorker(conn, { maxAttempts: 1, baseBackoffMs: 1 }));
  assert.deepEqual(await outboxRow(row.event_id, row.destination), { status: 'review', last_error: 'provider_http_503', attempts: 1 }, 'Expo disabled without credentials lands in review');

  // Expired offer and stale epoch are obsolete and never reach the transport.
  await isolate();
  const oDriver = await addUser('driver', 'car'), oCustomer = await addUser(), offerOrder = await addOrder(oCustomer);
  const rawOffer = await addToken(oDriver, await addSession(oDriver), rawToken('offer'));
  row = await enqueueDest(oDriver, 'offer', offerOrder, destOf(rawOffer)(oDriver));
  await conn.run('UPDATE domain_events SET occurred_at=? WHERE id=?::uuid', Date.now() - 700_000, row.event_id);
  let offerSent = 0;
  await drain(new DurableWorker(conn, { expoTransport: async () => { offerSent++; } }));
  assert.equal(offerSent, 0, 'expired offer suppressed');
  assert.equal((await outboxRow(row.event_id, row.destination)).status, 'obsolete');
  const eCustomer = await addUser(), eDriver1 = await addUser('driver', 'car'), eDriver2 = await addUser('driver', 'car');
  const eRaw = await addToken(eCustomer, await addSession(eCustomer), rawToken('epoch'));
  const eOrder = await addOrder(eCustomer, eDriver1, 'assigned');
  row = await enqueueDest(eCustomer, 'message', eOrder, destOf(eRaw)(eCustomer));
  await conn.run('UPDATE orders SET driver_id=? WHERE id=?', eDriver2, eOrder);
  await drain(new DurableWorker(conn, { expoTransport: async () => { offerSent++; } }));
  assert.equal(offerSent, 0, 'stale assignment epoch suppressed');
  assert.equal((await outboxRow(row.event_id, row.destination)).status, 'obsolete');

  // Crash before acknowledgement: the lease expires and the next worker delivers once.
  await isolate();
  const kUser = await addUser(), kOrder = await addOrder(kUser);
  const rawCrash = await addToken(kUser, await addSession(kUser), rawToken('crash'));
  const crashRow = await enqueueDest(kUser, 'message', kOrder, destOf(rawCrash)(kUser));
  assert.ok(crashRow);
  const slow = new DurableWorker(conn, { leaseMs: 40, baseBackoffMs: 1 });
  let claimed;
  for (let i = 0; i < 10 && !claimed?.destination?.startsWith('expon:'); i++) claimed = await slow.claim();
  assert.ok(claimed?.destination.startsWith('expon:'), 'first worker claimed the native attempt');
  await delay(60);
  let recovered = 0;
  await drain(new DurableWorker(conn, { leaseMs: 1000, baseBackoffMs: 1, expoTransport: async () => { recovered++; } }));
  assert.equal(recovered, 1, 'recovered worker published once');
  assert.equal((await conn.one('SELECT count(*) n FROM consumer_inbox WHERE event_id=?::uuid AND destination=?', claimed.event_id, claimed.destination)).n, 1);

  // Poison native destination exhausts to review without blocking healthy work.
  await isolate();
  const anyEvent = await conn.one("SELECT id FROM domain_events WHERE type='notification.requested' LIMIT 1");
  await conn.run("INSERT INTO outbox(event_id,destination) VALUES(?::uuid,'expon:bad')", anyEvent.id);
  await drain(new DurableWorker(conn, { maxAttempts: 1, baseBackoffMs: 1, expoTransport: async () => {} }));
  assert.equal((await conn.one("SELECT status FROM outbox WHERE destination='expon:bad'")).status, 'review');

  console.log('WP09 native-push: validation, session binding, refresh/reassign/unregister, logout/password/delete/admin/phone cascades, native-only job, rollback, delivery hints, prefs/quiet/disabled, invalid/DeviceNotRegistered, transient/review, not-configured, expired-offer/epoch, crash recovery, poison passed');
} finally {
  await conn.close();
  await shutdown();
}
