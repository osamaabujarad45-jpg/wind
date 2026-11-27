import assert from 'node:assert/strict';
import { randomUUID, createECDH, createHash } from 'node:crypto';
import { constants, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeSqlite } from '../server/db/sqlite-schema.ts';
import { initializeSqliteModeSwitching } from '../server/db/account-profiles.ts';
import { captainIdleMs, expireCaptainAvailability } from '../server/domain/session-mode.ts';

const directory = mkdtempSync(join(tmpdir(), 'wind-profile-switching-'));
Object.assign(process.env, { NODE_ENV: 'production', DB_PATH: join(directory, 'qa.db'), WIND_IDENTITY_MODE: 'self-service',
  WIND_ENABLED_SERVICES: 'ride,parcel,shop', WIND_PROFILE_SWITCHING: '1', WIND_SHOP_TOWN: 'tulkarm', WIND_EXPO_PUSH_ENABLED: '1',
  WIND_MIN_CLIENT_BUILD: '10107', WIND_CONTACT_VERIFICATION_REQUIRED: 'false', WIND_TRUST_PROXY: '0',
  SUPPORT_CONTACT: 'help@wind-qa.invalid', WIND_PUSH_SUBJECT: 'mailto:help@wind-qa.invalid' });
delete process.env.WIND_DATABASE_URL;
delete process.env.EXPO_ACCESS_TOKEN;
const legacy = new DatabaseSync(process.env.DB_PATH);
initializeSqlite(legacy);
const insertLegacy = legacy.prepare(`INSERT INTO users(id,phone,name,password,role,status,vehicle,plate,created_at)
  VALUES (?,?,?,'unused','driver','pending','car','QA-7',?)`);
const hash = value => createHash('sha256').update(value).digest('hex');
const now = Date.now();
insertLegacy.run(71, '0599691071', 'Legacy applicant', now);
insertLegacy.run(72, '0599691072', 'Legacy recheck', now);
legacy.prepare(`INSERT INTO security_events(actor_id,action,detail,created_at) VALUES (71,'USER_APPROVED',?,?)`)
  .run(JSON.stringify({ targetId: 72, role: 'driver' }), now - 1);
for (const [id, key] of [[71, 'legacy_applicant'], [72, 'legacy_recheck']])
  legacy.prepare('INSERT INTO sessions (token_hash,user_id,created_at,last_seen_at) VALUES (?,?,?,?)').run(hash(key), id, now, now);
initializeSqliteModeSwitching(legacy, true);
legacy.exec(`ALTER TABLE sessions DROP COLUMN captain_offline_reason;
  ALTER TABLE sessions ADD COLUMN captain_offline_reason TEXT CHECK (captain_offline_reason IN ('idle','ride_due'));
  UPDATE sessions SET captain_offline_reason = 'idle' WHERE user_id = 72;`);
legacy.close();
const { server, persistence, promote, shopSweep, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const realFetch = globalThis.fetch;
const notifications = [];
const browserEndpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-rollback';
const browserPushes = [];
globalThis.fetch = (url, init) => {
  if (String(url) === browserEndpoint) {
    assert.equal(persistence.inTransaction, true, 'profile-scoped web push holds authority through handoff');
    browserPushes.push(init.body);
    return Promise.resolve(new Response(null, { status: 201 }));
  }
  if (String(url) !== 'https://exp.host/--/api/v2/push/send') return realFetch(url, init);
  notifications.push(...JSON.parse(init.body));
  return Promise.resolve(Response.json({ data: [{ status: 'ok' }] }));
};
const pendingPushes = new Set();
const detach = persistence.detached.bind(persistence);
persistence.detached = work => {
  const delivery = detach(work);
  pendingPushes.add(delivery);
  void delivery.then(() => pendingPushes.delete(delivery), () => pendingPushes.delete(delivery));
  return delivery;
};
const settlePushes = async () => { while (pendingPushes.size) await Promise.allSettled([...pendingPushes]); };

async function request(path, token, body, revision) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Wind-Client': '10107', ...(token && { Authorization: `Bearer ${token}` }),
      ...(revision !== undefined && { 'X-Wind-Mode-Revision': String(revision) }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, body: await response.json() };
}

async function call(path, token, input, revision, expected = 200, code) {
  const response = await request(path, token, input, revision);
  assert.equal(response.status, expected, `${path} ${response.body.error ?? ''}`);
  if (code) assert.equal(response.body.error, code, path);
  return response.body;
}

const password = 'Synthetic-profile-pass-123';
const register = (suffix, extra) => call('/auth/register', null, { phone: '059969103' + suffix,
  name: 'Synthetic Profile ' + suffix, password, consent: true, ...extra });
const login = suffix => call('/auth/login', null, { phone: '059969103' + suffix, password });
const switchTo = async (token, mode, revision) => (await call('/session/mode', token, { mode, expectedRevision: revision })).accountProfile;
const availability = (token, online, revision) => call('/session/captain/availability', token, { online, expectedRevision: revision });
const requestOrder = (service, changes = {}) => ({ service, pickupCity: 'tulkarm', dropoffCity: 'nablus',
  pickupNote: 'West door', dropoffNote: 'East door', detail: service === 'ride' ? '' : 'Small box', option: '1', shared: service === 'ride',
  contact: '0599691033', requestId: randomUUID(), ...changes });

try {
  const applicant = await call('/me', 'legacy_applicant');
  assert.equal(applicant.user.role, 'customer');
  assert.equal(applicant.user.status, 'active');
  assert.equal(applicant.accountProfile.captain.state, 'under_review');
  assert.equal((await persistence.one('SELECT legacy_role FROM captain_profiles WHERE user_id=71')).legacy_role, 'driver');
  const recheck = await call('/me', 'legacy_recheck');
  assert.equal(recheck.user.role, 'driver');
  assert.equal(recheck.user.status, 'active');
  assert.equal(recheck.accountProfile.captain.state, 'review');
  assert.equal(recheck.accountProfile.captainOfflineReason, 'idle', 'initialization preserves the earlier offline reason constraint data');
  await call('/session/captain/availability', 'legacy_recheck', { online: true, expectedRevision: recheck.user.modeRevision }, undefined, 403, 'pending_approval');

  const staff = await register(1);
  await persistence.run('UPDATE users SET phone_verified_at = ? WHERE id = ?', Date.now(), staff.user.id);
  await promote('0599691031');
  const admin = (await login(1)).token;
  await call('/admin/users/72', admin, { status: 'blocked' });
  await call('/admin/users/72', admin, { status: 'active' });
  assert.deepEqual({ ...await persistence.one('SELECT status, captain_state, approved_at FROM users WHERE id = 72') },
    { status: 'active', captain_state: 'review', approved_at: null }, 'unblocking restores Personal without approving the Captain recheck');
  const application = await register(2, { role: 'driver', vehicle: 'car' });
  const buyer = (await register(3)).token;
  assert.equal(application.accountProfile.mode, 'personal');
  assert.equal(application.user.role, 'customer');
  assert.deepEqual(application.accountProfile.captain, { state: 'under_review', available: false });
  const draftCaptain = await register(4);
  await call('/captain/application', draftCaptain.token, { vehicle: 'car', plate: '1212' }, 0);
  assert.equal((await call('/me', draftCaptain.token)).accountProfile.captain.state, 'under_review');
  assert.ok((await call('/admin/users?role=driver', admin)).some(user => user.id === draftCaptain.user.id && user.status === 'pending'));
  await call('/session/mode', application.token, { mode: 'captain', expectedRevision: 0 }, undefined, 403, 'profile_not_active');
  const confirmation = async id => {
    const review = (await call('/admin/users?role=driver', admin)).find(user => user.id === id).captainApproval;
    return { expectedApplicationId: review.applicationId, expectedRevision: review.revision, expectedState: review.state };
  };
  const staleApproval = await confirmation(draftCaptain.user.id);
  await call(`/admin/users/${draftCaptain.user.id}`, admin, { status: 'blocked' });
  await call(`/admin/users/${draftCaptain.user.id}/approve`, admin, staleApproval, undefined, 409, 'user_changed');
  assert.equal((await persistence.one('SELECT status FROM users WHERE id = ?', draftCaptain.user.id)).status, 'blocked');
  await call(`/admin/users/${draftCaptain.user.id}`, admin, { status: 'active' });
  await call(`/admin/users/${draftCaptain.user.id}/approve`, admin, staleApproval, undefined, 409, 'user_changed');
  await call(`/admin/users/${draftCaptain.user.id}/approve`, admin, await confirmation(draftCaptain.user.id));
  await call(`/admin/users/${draftCaptain.user.id}`, admin, { role: 'customer' });
  const replacementSession = await login(4);
  await call('/captain/application', replacementSession.token, { vehicle: 'motorcycle', plate: '8431' }, replacementSession.accountProfile.revision);
  const replacement = await confirmation(draftCaptain.user.id);
  assert.equal(replacement.expectedRevision, staleApproval.expectedRevision);
  assert.notEqual(replacement.expectedApplicationId, staleApproval.expectedApplicationId);
  await call(`/admin/users/${draftCaptain.user.id}/approve`, admin, staleApproval, undefined, 409, 'user_changed');
  await call(`/admin/users/${application.user.id}/approve`, admin, await confirmation(application.user.id));
  const captain = await login(2);
  assert.equal(captain.accountProfile.mode, 'captain');
  const second = await login(2);
  assert.equal(second.accountProfile.mode, 'personal');
  const phone = second.token;
  const rev = captain.accountProfile.revision;
  await call('/session/mode', phone, { mode: 'captain', expectedRevision: 0 }, undefined, 409, 'captain_elsewhere');

  // The same person owns a shop and drives one car, with an independent Personal view on the second phone.
  const shopPoint = { latitude: 32.312, longitude: 35.029 };
  const { merchant } = await call('/merchant/apply', phone, { name: 'QA Bakery', category: 'bakery', city: 'tulkarm', point: shopPoint,
    phone: '0599691032', licenceNo: 'QA-42', licenceExpiresAt: Date.now() + 7 * 86_400_000 }, 0);
  const shopProfile = await switchTo(phone, 'shop', 0);
  assert.equal(shopProfile.shop.id, merchant.id);
  await call('/orders', phone, undefined, undefined, 403, 'forbidden');
  const itemDraft = { section: 'Pantry', nameAr: 'خبز', nameEn: 'Bread', priceAgorot: 3500, requestId: randomUUID() };
  const item = await call('/merchant/items', phone, itemDraft, 1);
  assert.equal((await call('/merchant/items', phone, itemDraft, 1)).id, item.id);
  await call('/merchant/settings', phone, { paused: false }, 1, 409, 'shop_approval_required');
  await call(`/admin/merchants/${merchant.id}`, admin, { status: 'active' });
  assert.deepEqual((await call('/shop/merchants', buyer)).merchants, []);
  await call('/merchant/settings', phone, { paused: false }, 1, 409, 'shop_hours_required');
  const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, openMinute: 0, closeMinute: 1440 }));
  await call('/merchant/settings', phone, { paused: false, hours }, 1);
  await call('/merchant/settings', phone, { hours: [] }, 1, 409, 'shop_hours_required');
  assert.equal((await call(`/shop/merchants/${merchant.id}`, buyer)).items[0].id, item.id);
  const basket = { service: 'shop', merchantId: merchant.id,
    lines: [{ itemId: item.id, qtyMilli: 1000, policy: 'remove' }], dropoffCity: 'tulkarm',
    dropoffPoint: { latitude: 32.315, longitude: 35.025 }, dropoffNote: 'Door', contact: '0599691033', requestId: randomUUID(),
    expectedGoodsAgorot: 3500, expectedDeliveryFeeAgorot: 1000, expectedServiceFeeAgorot: 200 };
  const shopOrder = await call('/orders', buyer, basket, 0);
  const ownBasket = await call('/orders', application.token, { ...basket, requestId: randomUUID(),
    lines: [{ itemId: item.id, qtyMilli: 1000, policy: 'ask_first' }] }, 0);
  assert.equal((await call('/me', phone)).accountProfile.shopOrdersOpen, 2);
  await call(`/orders/${ownBasket.id}/share`, application.token, {}, 0);
  const shopView = await call(`/orders/${ownBasket.id}`, phone);
  assert.equal(shopView.sharing, false);
  assert.equal(shopView.handoverCode, null);
  await call(`/orders/${ownBasket.id}/share`, phone, {}, 1, 403, 'forbidden');
  await call(`/orders/${ownBasket.id}/share/revoke`, phone, {}, 1, 403, 'forbidden');
  await call(`/orders/${ownBasket.id}/dispute`, phone, { reason: 'Please review this order' }, 1, 403, 'forbidden');
  await call(`/admin/users/${application.user.id}/shop-review`, admin, { note: 'Reviewed buyer cash outcomes' });
  await call(`/merchant/orders/${shopOrder.id}/accept`, phone, { prepMinutes: 20 }, 1);
  await call('/merchant/settings', phone, { paused: true }, 1);
  await call(`/merchant/orders/${ownBasket.id}/accept`, phone, { prepMinutes: 20 }, 1, 409, 'shop_paused');
  await call(`/merchant/orders/${shopOrder.id}/preparing`, phone, {}, 1);
  await call(`/merchant/orders/${shopOrder.id}/ready`, phone, { packages: [{ no: 1, sealed: true, lineIds: [] }] }, 1);
  await call('/merchant/settings', phone, { paused: false }, 1);
  await call(`/merchant/orders/${ownBasket.id}/accept`, phone, { prepMinutes: 20 }, 1);
  await call(`/merchant/orders/${ownBasket.id}/preparing`, phone, {}, 1);
  const consentToken = 'ExponentPushToken[qa-shop-consent-notices]';
  await call('/push/native/register', phone, { expoPushToken: consentToken, deviceId: randomUUID(), platform: 'android', lang: 'en' });
  const consentPath = `/orders/${ownBasket.id}/shop/consent`;
  const requestConsent = async () => {
    const { shop: currentShop } = await call(`/orders/${ownBasket.id}`, phone);
    const line = currentShop.lines.find(value => !value.removed);
    await call(`/merchant/orders/${ownBasket.id}/lines/${line.id}`, phone, { substituteItemId: item.id }, 1);
    await settlePushes();
    const push = notifications.findLast(message => message.to === consentToken && message.data.kind === 'profile_update');
    const ref = new URL(push.data.url, 'http://localhost').searchParams.get('notice');
    const { shop } = await call(`/orders/${ownBasket.id}`, application.token);
    return { ref, changeId: shop.change.id, path: `/session/notifications?ref=${ref}` };
  };
  const firstConsent = await requestConsent();
  assert.deepEqual(await call(firstConsent.path, phone), { mode: 'personal', path: null });
  await call(consentPath, application.token, { changeId: firstConsent.changeId, decision: 'approve' }, 0);
  const nextConsent = await requestConsent();
  assert.notEqual(nextConsent.changeId, firstConsent.changeId);
  assert.deepEqual((await call('/me', phone)).accountProfile.updates, { count: 0, ref: null });
  await call(firstConsent.path, phone, undefined, undefined, 404, 'not_found');
  assert.deepEqual(await call(nextConsent.path, phone), { mode: 'personal', path: null });
  await call(consentPath, application.token, { changeId: nextConsent.changeId, decision: 'approve' }, 0);
  assert.equal((await switchTo(phone, 'personal', 1)).revision, 2);
  await call(`/orders/${shopOrder.id}`, phone, undefined, undefined, 404, 'not_found');

  const pushTokens = ['ExponentPushToken[qa-captain-mode-00001]', 'ExponentPushToken[qa-personal-mode-00002]'];
  for (const [index, token] of [captain.token, phone].entries()) {
    await call('/push/native/register', token, { expoPushToken: pushTokens[index], deviceId: randomUUID(), platform: 'android', lang: 'en' });
  }
  const parcel = await call('/orders', buyer, requestOrder('parcel', { option: 'small' }), 0);
  assert.deepEqual(await call('/jobs', captain.token), []);
  await availability(captain.token, true, rev);
  const olderJob = await call('/orders', buyer, requestOrder('parcel', { option: 'small' }), 0);
  await settlePushes();
  const olderPush = notifications.find(message => message.to === pushTokens[1] && message.data.kind === 'captain_profile_update');
  const olderRef = new URL(olderPush.data.url, 'http://localhost').searchParams.get('notice');
  const olderNotice = `/session/notifications?ref=${olderRef}`;
  assert.deepEqual(await call(olderNotice, phone), { mode: 'captain', path: null });
  const nextJob = await call('/orders', buyer, requestOrder('parcel', { option: 'small' }), 0);
  await settlePushes();
  const captainPush = notifications.find(message => message.to === pushTokens[0] && message.data.kind === 'job' && message.data.order === nextJob.id);
  const neutralPush = notifications.findLast(message => message.to === pushTokens[1] && message.data.kind === 'captain_profile_update');
  assert.ok(captainPush && neutralPush, 'the Captain receives a job and the other phone receives a neutral prompt');
  assert.equal(neutralPush.data.order, 0);
  const ref = new URL(neutralPush.data.url, 'http://localhost').searchParams.get('notice');
  assert.match(ref, /^[A-Za-z0-9_-]{24}$/);
  const notice = `/session/notifications?ref=${ref}`;
  assert.deepEqual(await call(notice, phone), { mode: 'captain', path: null });
  assert.deepEqual((await call('/me', phone)).accountProfile.updates, { count: 2, ref });
  assert.deepEqual(await call(notice, captain.token), { mode: 'captain', path: `/order/${nextJob.id}` });
  await availability(captain.token, false, rev);
  assert.deepEqual(await call(notice, captain.token), { mode: 'captain', path: '/driver' });
  await availability(captain.token, true, rev);
  await call(notice, buyer, undefined, undefined, 404, 'not_found');
  await call(notice, phone);
  await call(`/orders/${nextJob.id}/cancel`, buyer, {}, 0);
  assert.deepEqual((await call('/me', phone)).accountProfile.updates, { count: 1, ref: olderRef });
  await call(notice, phone, undefined, undefined, 404, 'not_found');
  await call(`/jobs/${olderJob.id}/accept`, captain.token, {}, rev);
  await call(`/orders/${olderJob.id}/release`, captain.token, {}, rev);
  assert.deepEqual((await call('/me', phone)).accountProfile.updates, { count: 0, ref: null });
  await call(olderNotice, phone, undefined, undefined, 404, 'not_found');
  assert.ok((await call('/jobs', captain.token)).some(job => job.id === parcel.id));
  assert.ok(!(await call('/jobs', captain.token)).some(job => job.id === shopOrder.id));
  await call(`/jobs/${shopOrder.id}/accept`, captain.token, {}, rev, 404, 'not_found');
  await call(`/jobs/${parcel.id}/accept`, captain.token, {}, undefined, 409, 'mode_changed');
  const outcome = await Promise.all([
    request(`/jobs/${parcel.id}/accept`, captain.token, {}, rev),
    request('/session/mode', captain.token, { mode: 'personal', expectedRevision: rev }),
  ]);
  assert.deepEqual(outcome.map(result => result.status).sort(), [200, 409]);
  if (outcome[0].status === 200) {
    assert.equal(outcome[1].body.error, 'work_in_hand');
  } else {
    assert.equal(outcome[0].body.error, 'mode_changed');
    const back = await switchTo(captain.token, 'captain', rev + 1);
    await availability(captain.token, true, back.revision);
    await call(`/jobs/${parcel.id}/accept`, captain.token, {}, rev, 409, 'mode_changed');
    await call(`/jobs/${parcel.id}/accept`, captain.token, {}, back.revision);
  }
  await call(`/orders/${parcel.id}`, phone, undefined, undefined, 404, 'not_found');
  await call('/orders', phone, requestOrder('ride'), 2, 409, 'work_in_hand');
  await call('/session/other-phones', phone, { password: 'wrong' }, undefined, 401, 'wrong_credentials');
  let snapshotRead, continueChange;
  const holding = new Promise(resolve => { snapshotRead = resolve; });
  const pause = new Promise(resolve => { continueChange = resolve; });
  const query = persistence.one;
  persistence.one = async function(sql, ...params) {
    const account = await query.call(this, sql, ...params);
    if (sql === 'SELECT password, entra_oid FROM users WHERE id = ?') { snapshotRead(); await pause; }
    return account;
  };
  const oldChange = request('/me/password', captain.token, { current: password, password: 'Synthetic-revoked-pass-123' });
  let deadline;
  try {
    await Promise.race([holding, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Password check did not reach account read')), 3000); })]);
    await call('/session/other-phones', phone, { password });
  } finally { clearTimeout(deadline); persistence.one = query; continueChange(); }
  assert.deepEqual(await oldChange, { status: 401, body: { error: 'unauthorized' } });
  await call('/me', captain.token, undefined, undefined, 401, 'unauthorized');
  const resumed = await switchTo(phone, 'captain', 2);
  assert.equal(resumed.workInHand, true);
  assert.equal(resumed.captainOnline, false);
  const advance = (status, extra) => call(`/orders/${parcel.id}/advance`, phone, { expectedStatus: status, requestId: randomUUID(), ...extra }, resumed.revision);
  assert.equal((await advance('assigned')).status, 'at_pickup');
  assert.equal((await advance('at_pickup')).status, 'in_transit');
  assert.equal((await advance('in_transit', { code: parcel.handoverCode })).status, 'completed');

  const personal = await login(2);
  await availability(phone, true, resumed.revision);
  const ride = await call('/orders', buyer, requestOrder('ride'), 0);
  await call(`/jobs/${ride.id}/accept`, phone, {}, resumed.revision);
  const advanceRide = (expectedStatus, extra) => call(`/orders/${ride.id}/advance`, phone,
    { expectedStatus, requestId: randomUUID(), ...extra }, resumed.revision);
  assert.equal((await advanceRide('assigned')).status, 'at_pickup');
  assert.equal((await advanceRide('at_pickup')).status, 'in_transit');
  assert.equal((await advanceRide('in_transit', { code: ride.handoverCode })).status, 'completed');

  const restaurant = (await register(6)).token;
  const opened = await call('/merchant/apply', restaurant, { name: 'QA Restaurant', category: 'restaurant', city: 'tulkarm',
    point: shopPoint, phone: '0599691036', licenceNo: 'QA-R6', licenceExpiresAt: Date.now() + 7 * 86_400_000 }, 0);
  const restaurantMode = await switchTo(restaurant, 'shop', 0);
  const meal = await call('/merchant/items', restaurant, { ...itemDraft, nameAr: 'وجبة', nameEn: 'Lunch', requestId: randomUUID() }, restaurantMode.revision);
  await call(`/admin/merchants/${opened.merchant.id}`, admin, { status: 'active' });
  await call('/merchant/settings', restaurant, { paused: false, hours }, restaurantMode.revision);
  const food = await call('/orders', buyer, { ...basket, merchantId: opened.merchant.id, requestId: randomUUID(),
    lines: [{ itemId: meal.id, qtyMilli: 1000, policy: 'remove' }] }, 0);
  await call(`/merchant/orders/${food.id}/accept`, restaurant, { prepMinutes: 5 }, restaurantMode.revision);
  await call(`/merchant/orders/${food.id}/preparing`, restaurant, {}, restaurantMode.revision);
  const packed = await call(`/merchant/orders/${food.id}/ready`, restaurant, { packages: [{ no: 1, sealed: true, lineIds: [] }] }, restaurantMode.revision);
  await shopSweep();
  assert.ok((await call('/jobs', phone)).some(job => job.id === food.id), 'the same car sees a restaurant delivery after its parcel and ride');
  await call(`/jobs/${food.id}/accept`, phone, {}, resumed.revision);
  const atShop = await call(`/orders/${food.id}/advance`, phone, { expectedStatus: 'assigned', requestId: randomUUID() }, resumed.revision);
  const endpoint = browserEndpoint;
  const browser = createECDH('prime256v1');
  browser.generateKeys();
  const browserSubscription = { endpoint, p256dh: browser.getPublicKey().toString('base64url'), auth: Buffer.alloc(16).toString('base64url') };
  await call('/push/subscribe', buyer, browserSubscription);
  const message = () => call(`/orders/${food.id}/messages`, phone, { body: 'Restaurant delivery update' }, resumed.revision);
  await message();
  await settlePushes();
  assert.equal(browserPushes.length, 1);
  const all = persistence.all;
  const listed = Promise.withResolvers(), resume = Promise.withResolvers();
  persistence.all = async function(sql, ...args) {
    const rows = await all.call(this, sql, ...args);
    if (sql.startsWith('SELECT * FROM push_subscriptions WHERE user_id IN') && rows.some(row => row.endpoint === endpoint)) {
      listed.resolve();
      await resume.promise;
    }
    return rows;
  };
  const notifying = message();
  try {
    await listed.promise;
    await call('/push/subscribe', restaurant, browserSubscription);
  } finally {
    persistence.all = all;
    resume.resolve();
    await notifying;
    await settlePushes();
  }
  assert.equal(browserPushes.length, 1, 'a queued Personal alert cannot follow a subscription that rebound to Shop');
  await call('/push/subscribe', buyer, browserSubscription);
  await call(`/orders/${food.id}/shop/handover`, phone, { expectedStatus: 'at_pickup', requestId: randomUUID(),
    expectedReadySnapshotId: atShop.shop.readySnapshotId, expectedAssignedAt: atShop.assignedAt,
    code: packed.shop.pickupCode, check: { result: 'ok' } }, resumed.revision);
  const delivered = await call(`/orders/${food.id}/advance`, phone, { expectedStatus: 'in_transit', requestId: randomUUID(),
    code: food.handoverCode, seals: [{ no: 1, intact: true }], collectedCents: food.shop.cashAgorot }, resumed.revision);
  assert.equal(delivered.status, 'completed');
  await persistence.atomic({ purpose: 'test' }, async () => {
    await persistence.run('UPDATE sessions SET last_activity_at = ? WHERE token_hash = ?', Date.now() - captainIdleMs - 1000, hash(phone));
    let offlineNotice;
    await expireCaptainAvailability(persistence, async (id, reason) => { offlineNotice = { id, reason }; });
    assert.deepEqual(offlineNotice, { id: application.user.id, reason: 'idle' });
  });
  const idle = (await call('/me', phone)).accountProfile;
  assert.equal(idle.captainOnline, false);
  assert.equal(idle.captainOfflineReason, 'idle');
  assert.equal((await availability(phone, true, resumed.revision)).accountProfile.captainOfflineReason, null);
  await persistence.run('UPDATE sessions SET last_activity_at = ? WHERE token_hash = ?', Date.now() - captainIdleMs - 1000, hash(phone));
  const launched = (await call('/me?launch=1', phone)).accountProfile;
  assert.equal(launched.captainOnline, false);
  assert.equal(launched.captainOfflineReason, 'idle', 'cold launch preserves an idle deadline before the sweep');
  assert.equal((await call('/me', phone)).accountProfile.captainOfflineReason, 'idle');
  await availability(phone, true, resumed.revision);
  const restarted = (await call('/me?launch=1', phone)).accountProfile;
  assert.equal(restarted.captainOnline, false);
  assert.equal(restarted.captainOfflineReason, 'launch');
  await availability(phone, true, resumed.revision);

  const ownParcel = await call('/orders', personal.token, requestOrder('parcel', { option: 'small' }), 0);
  assert.ok(!(await call('/jobs', phone)).some(job => job.id === ownParcel.id));
  await call(`/orders/${ownParcel.id}`, phone, undefined, undefined, 404, 'not_found');
  await call('/orders', personal.token, requestOrder('ride'), 0, 409, 'captain_confirm_offline');
  const ownRide = await call('/orders', personal.token, requestOrder('ride', { confirmCaptainOffline: true }), 0);
  assert.equal(ownRide.service, 'ride');
  assert.equal((await call('/me', phone)).accountProfile.captainOnline, false);
  await call('/session/captain/availability', phone, { online: true, expectedRevision: resumed.revision }, undefined, 409, 'captain_ride_due');
  assert.ok(await persistence.one("SELECT id FROM security_events WHERE actor_id = ? AND action = 'OTHER_SESSIONS_ENDED'", application.user.id));
  assert.ok(await persistence.one("SELECT id FROM security_events WHERE actor_id = ? AND action = 'CAPTAIN_SESSION_ENDED'", application.user.id));
  assert.equal((await call('/me', phone)).user.id, personal.user.id);
  assert.ok(await persistence.one('SELECT 1 FROM sessions WHERE token_hash = ?', hash(phone)));
  const exiting = await register(5);
  await call(`/admin/users/${exiting.user.id}`, admin, { role: 'driver', vehicle: 'car', plate: 'QA-5' });
  const lastCaptain = await login(5);
  const currentRevision = lastCaptain.accountProfile.revision;
  assert.equal(lastCaptain.accountProfile.captain.state, 'approved');
  await availability(lastCaptain.token, true, currentRevision);
  const releaseParcel = await call('/orders', buyer, requestOrder('parcel', { option: 'small' }), 0);
  await call(`/jobs/${releaseParcel.id}/accept`, lastCaptain.token, {}, currentRevision);
  const releasePath = `/orders/${releaseParcel.id}/release`;
  assert.deepEqual(await call(releasePath, lastCaptain.token, {}, currentRevision), { ok: true });
  assert.deepEqual(await call(releasePath, lastCaptain.token, {}, currentRevision), { ok: true });
  const finalParcel = await call('/orders', buyer, requestOrder('parcel', { option: 'small' }), 0);
  await call(`/jobs/${finalParcel.id}/accept`, lastCaptain.token, {}, currentRevision);
  await call(`/admin/users/${exiting.user.id}`, admin, { role: 'customer' });
  const closing = (await call('/me', lastCaptain.token)).accountProfile;
  assert.equal(closing.captain.state, 'closing');
  assert.equal(closing.captainOnline, false);
  assert.equal(closing.workInHand, true);
  await call(`/admin/users/${exiting.user.id}/approve`, admin, {}, undefined, 409, 'user_changed');
  await call('/session/captain/availability', lastCaptain.token, { online: true, expectedRevision: currentRevision }, undefined, 403, 'pending_approval');
  for (const [expectedStatus, extra] of [['assigned', {}], ['at_pickup', {}], ['in_transit', { code: finalParcel.handoverCode }]])
    await call(`/orders/${finalParcel.id}/advance`, lastCaptain.token, { expectedStatus, ...extra, requestId: randomUUID() }, currentRevision);
  const cash = await call('/driver/cash', lastCaptain.token);
  assert.ok(cash.owedCents > 0);
  const handover = await call('/admin/cash/remittance', admin, { driverId: exiting.user.id, amountCents: cash.owedCents, requestId: randomUUID() });
  await call(`/driver/cash/${handover.id}/confirm`, lastCaptain.token, { decision: 'confirm' }, currentRevision);
  const closed = (await call('/me', lastCaptain.token)).accountProfile;
  assert.equal(closed.mode, 'personal');
  assert.equal(closed.revision, currentRevision + 1);
  assert.equal(closed.captain, null);

  const dbCopyPath = join(directory, 'rollback.db');
  await persistence.run('VACUUM INTO ?', dbCopyPath);
  const runLegacy = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('../server/main.ts', import.meta.url)), ...args],
    { env: { ...process.env, DB_PATH: dbCopyPath, WIND_PROFILE_SWITCHING: '0' }, encoding: 'utf8', timeout: 5000 });
  const originalCopy = hash(readFileSync(dbCopyPath));
  assert.equal(runLegacy('rollback-profiles').status, 1);
  assert.equal(hash(readFileSync(dbCopyPath)), originalCopy, 'a command without confirmation leaves the database untouched');
  const disabled = runLegacy();
  assert.match(disabled.stderr, /Account profiles are active/);
  assert.equal(disabled.status, 1);
  const busy = runLegacy('rollback-profiles', '--confirm');
  assert.equal(busy.status, 1, busy.stderr);
  const copy = new DatabaseSync(dbCopyPath);
  assert.equal(copy.prepare('SELECT role FROM users WHERE id = 71').get().role, 'customer', 'the refused rollback is atomic');
  assert.equal(copy.prepare('SELECT auth_session_hash FROM push_subscriptions WHERE endpoint = ?').get(endpoint).auth_session_hash, hash(buyer));
  // Simulate staff resolving the synthetic open orders on this copy before the legacy API can take over.
  copy.exec("UPDATE orders SET status = 'cancelled' WHERE status IN ('requested','searching','assigned','at_pickup','in_transit','on_hold','returning')");
  copy.prepare('UPDATE merchants SET paused_new = 0 WHERE id = ?').run(merchant.id);
  const foodCash = await call('/driver/cash', phone);
  assert.ok(foodCash.owedCents > 0);
  // A later unpaid balance must keep a legacy fallback from re-holding goods already cleared.
  copy.prepare(`INSERT INTO security_events(actor_id, order_id, action, detail, created_at)
    VALUES (?, ?, 'SHOP_GOODS_CASH_CLEARED', '{}', ?)`).run(application.user.id, food.id, Date.now());
  copy.close();
  assert.equal(runLegacy('rollback-profiles', '--confirm').status, 1);
  const repairedCopy = new DatabaseSync(dbCopyPath);
  repairedCopy.prepare("DELETE FROM security_events WHERE order_id = ? AND action = 'SHOP_GOODS_CASH_CLEARED'").run(food.id);
  repairedCopy.close();
  const restored = runLegacy('rollback-profiles', '--confirm');
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(runLegacy('rollback-profiles', '--confirm').status, 0, 'the rollback is repeatable');
  const downgraded = new DatabaseSync(dbCopyPath);
  try {
    assert.deepEqual(downgraded.prepare("SELECT COUNT(*) AS n FROM users WHERE id IN (71,72) AND role = 'driver' AND status = 'pending'").get().n, 2);
    assert.equal(downgraded.prepare('SELECT status FROM orders WHERE id = ?').get(finalParcel.id).status, 'completed');
    assert.equal(downgraded.prepare('SELECT status FROM cash_entries WHERE id = ?').get(handover.id).status, 'confirmed');
    assert.equal(downgraded.prepare('SELECT paused_new FROM merchants WHERE id = ?').get(merchant.id).paused_new, 1);
    assert.equal(downgraded.prepare('SELECT auth_session_hash FROM push_subscriptions WHERE endpoint = ?').get(endpoint).auth_session_hash, null);
    assert.equal(downgraded.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { downgraded.close(); }
  const rehearsalCopy = process.argv.find(arg => arg.startsWith('--rollback-copy='))?.slice('--rollback-copy='.length);
  if (rehearsalCopy) copyFileSync(dbCopyPath, rehearsalCopy, constants.COPYFILE_EXCL);
  console.log('One account: all three profiles, parcel, ride and restaurant delivery, closing and settlement, rollback, and scoped notifications passed');
} finally {
  await settlePushes();
  globalThis.fetch = realFetch;
  await shutdown();
  rmSync(directory, { recursive: true, force: true });
}
