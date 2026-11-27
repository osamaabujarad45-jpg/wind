import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID, sign, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { apiCaller } from './support/api.mjs';

const cloudflare = process.argv.includes('--cloudflare');
const off = process.argv.includes('--off');
const verifyOnly = process.argv.includes('--verify-only');
const selectedCase = process.argv.find(value => value.startsWith('--case='))?.slice('--case='.length);
const pg = process.argv.includes('--postgres') ? await import('./pg-support.mjs') : null;
const directory = mkdtempSync(join(tmpdir(), 'wind-firebase-email-'));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const recipientSecret = Buffer.alloc(32, 42);
const entraTenant = '11111111-2222-3333-4444-555555555555';
const entraAuthority = `https://windemailtest.ciamlogin.com/${entraTenant}`;
const entraIssuer = `https://${entraTenant}.ciamlogin.com/${entraTenant}/v2.0`;
const entraClient = 'wind-email-test-client';
for (const key of ['WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN', 'WIND_DATABASE_URL',
  'WIND_POSTGRES_STAGING', 'WIND_POSTGRES_TEST_ONLY', 'WIND_CONTACT_VERIFICATION_REQUIRED', 'WIND_FIREBASE_EMAIL_LINKS', 'WIND_FIREBASE_RESET_LINKS']) delete process.env[key];
Object.assign(process.env, {
  NODE_ENV: 'test', DB_PATH: join(directory, 'test.db'), WIND_IDENTITY_MODE: 'self-service', WIND_TRUST_PROXY: '1',
  WIND_FIREBASE_API_KEY: 'test-web-key', WIND_FIREBASE_EMAIL_CONTINUE_URL: 'https://wind.example.test/recovery-email',
  WIND_FIREBASE_RECIPIENT_KEY: recipientSecret.toString('base64url'),
  WIND_ENTRA_TENANT_ID: entraTenant, WIND_ENTRA_TENANT_NAME: 'windemailtest', WIND_ENTRA_CLIENT_ID: entraClient,
  WIND_FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify({
    project_id: 'wind-test', client_email: 'service@wind-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  })).toString('base64'),
});
if (!off) process.env.WIND_FIREBASE_EMAIL_LINKS = '1';
if (!off && !verifyOnly) process.env.WIND_FIREBASE_RESET_LINKS = '1';
if (cloudflare) Object.assign(process.env, { WIND_EMAIL_FROM: 'sender@example.test', CLOUDFLARE_ACCOUNT_ID: 'test', CLOUDFLARE_EMAIL_TOKEN: 'test' });
const postgres = pg && await pg.freshPostgres('firebase_email');
if (postgres) pg.selectRuntime(postgres.schema);

const realFetch = globalThis.fetch;
const calls = [], users = new Map(), inbox = [];
let project = 'wind-test', failDelete = false, failMail = false, collisionEmail, loseCreateReply, hideCreateReply, hiddenUser;
let beforeProvider = async () => {};
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.href === `${entraAuthority}/v2.0/.well-known/openid-configuration`)
    return Response.json({ issuer: entraIssuer, jwks_uri: `${entraAuthority}/discovery/v2.0/keys` });
  if (url.href === `${entraAuthority}/discovery/v2.0/keys`)
    return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'entra-key', alg: 'RS256', use: 'sig' }] });
  if (url.hostname === 'api.cloudflare.com') {
    calls.push({ action: 'cloudflare', body: JSON.parse(options.body) });
    return Response.json({ success: true, result: {} });
  }
  if (!['identitytoolkit.googleapis.com', 'oauth2.googleapis.com'].includes(url.hostname)) return realFetch(input, options);
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal, 'provider requests time out');
  if (url.hostname === 'oauth2.googleapis.com') {
    const form = new URLSearchParams(options.body), parts = form.get('assertion').split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/cloud-platform');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    assert.ok(verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url')));
    return Response.json({ access_token: 'synthetic-token', expires_in: 3600 });
  }
  const body = JSON.parse(options.body);
  const action = url.pathname.split('/').at(-1);
  const admin = url.pathname.startsWith('/v1/projects/wind-test/');
  if (admin) assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
  else assert.equal(url.searchParams.get('key'), 'test-web-key');
  calls.push({ action, body, admin });
  await beforeProvider(action, body);
  if (action === 'accounts:lookup') return Response.json({
    users: [...users.values()].filter(user => body.localId?.includes(user.localId) || body.email?.includes(user.email)),
  });
  if (action === 'accounts:delete') {
    if (failDelete) return Response.json({}, { status: 503 });
    users.delete(body.localId);
    return Response.json({});
  }
  if (action === 'accounts:batchCreate') {
    assert.equal(body.allowOverwrite, false);
    assert.equal(body.sanityCheck, true);
    assert.equal(body.users.length, 1);
    const user = body.users[0];
    assert.match(JSON.parse(user.customAttributes).windRecoveryOwner, /^[A-Za-z0-9_-]{32}$/);
    if (user.email === collisionEmail && !users.has(user.localId)) {
      users.set(user.localId, { localId: user.localId, email: user.email, displayName: 'foreign' });
    }
    if (users.has(user.localId) || [...users.values()].some(existing => existing.email === user.email))
      return Response.json({ error: [{ index: 0, message: 'DUPLICATE' }] });
    if (user.email === hideCreateReply) {
      hiddenUser = { ...user, emailVerified: false };
      return Response.json({}, { status: 503 });
    }
    users.set(user.localId, { ...user, emailVerified: false });
    return Response.json({}, { status: user.email === loseCreateReply ? 503 : 200 });
  }
  if (action === 'accounts:update') {
    const user = users.get(body.localId);
    assert.ok(user);
    assert.equal(body.returnSecureToken, false);
    user.password = body.password;
    return Response.json({ localId: user.localId });
  }
  if (action === 'accounts:signInWithPassword') {
    const user = [...users.values()].find(item => item.email === body.email && item.password === body.password);
    if (!user) return Response.json({}, { status: 400 });
    const claims = { aud: project, iss: `https://securetoken.google.com/${project}`, sub: user.localId, ...JSON.parse(user.customAttributes ?? '{}') };
    return Response.json({ localId: user.localId, email: user.email, idToken: `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature` });
  }
  if (action === 'accounts:sendOobCode') {
    if (failMail) return Response.json({}, { status: 503 });
    const sub = body.idToken && JSON.parse(Buffer.from(body.idToken.split('.')[1], 'base64url')).sub;
    const user = sub ? users.get(sub) : [...users.values()].find(item => item.email === body.email);
    assert.ok(user);
    inbox.push({ uid: user.localId, to: user.email, kind: body.requestType, continueUrl: body.continueUrl, locale: options.headers['X-Firebase-Locale'], actionCode: randomBytes(16).toString('hex'), admin });
    return Response.json({});
  }
  throw new Error(`Unexpected provider endpoint ${url.pathname}`);
};

const { server, persistence, sweepFirebaseResets, shutdown } = await import('../server/main.ts');
const { createFirebaseReset, firebaseReset } = await import('../server/domain/firebase-reset.ts');
const { firebaseEmailService } = await import('../server/domain/firebase-email.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let address = '192.0.2.1', nextAddress = 1;
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, (url, options) =>
  realFetch(url, { ...options, headers: { ...options.headers, 'X-Forwarded-For': address } }));
const password = 'Old-Password-123', replacement = 'New-Password-123';
const phone = n => `05997000${String(n).padStart(2, '0')}`;
const email = n => `user${n}@example.test`;
function entraToken(oid, email, nonce) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'RS256', kid: 'entra-key' })}.${encode({ oid, sub: oid, email, email_verified: true, nonce,
    iss: entraIssuer, aud: entraClient, iat: now, exp: now + 600, jti: randomUUID() })}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
}
const register = (n, extra = {}, expect = 200) => call('/auth/register', { body: { name: `User ${n}`, phone: phone(n), email: email(n), password, consent: true, ...extra }, expect });
function verifyAction(mail, nextPassword) {
  assert.ok(mail.actionCode, 'a Firebase action code is used once');
  const user = users.get(mail.uid);
  assert.ok(user && user.email === mail.to, 'action codes apply to their exact Firebase UID and email');
  mail.actionCode = null;
  if (mail.kind === 'PASSWORD_RESET') user.password = nextPassword;
  else user.emailVerified = true;
  const url = new URL(mail.continueUrl);
  assert.equal(url.origin + url.pathname, 'https://wind.example.test/recovery-email');
  assert.match(url.hash, /^#(?:en|ar)\.[A-Za-z0-9_-]{32}$/);
  return url.hash.slice(4);
}
async function waitFor(check) {
  for (let i = 0; i < 200; i++) { const result = await check(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('Detached Firebase action did not finish');
}
function pauseAt(match) {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  beforeProvider = async (action, body) => {
    if (!match(action, body)) return;
    enter();
    await paused;
  };
  return { entered, release() { beforeProvider = async () => {}; release(); } };
}
const login = (n, suppliedPassword = password, expect = 200) =>
  call('/auth/login', { body: { identifier: phone(n), password: suppliedPassword }, expect });
const edit = (account, address, current = password, expect = 200) =>
  call('/me/email', { token: account.token, body: { email: address, current }, expect });
const start = (account, current = password, expect = 200) =>
  call('/me/email/link', { token: account.token, body: { current, lang: 'en' }, expect });
const confirm = (account, mailboxProof, expect = 200, current = password) =>
  call('/me/email/link/confirm', { token: account.token, body: { current, mailboxProof }, expect });
const reset = identifier => call(cloudflare ? '/auth/reset/code' : '/auth/reset/link/code', { body: { identifier, lang: 'en' } });
const adopt = (n, mailboxProof, expect = 200) =>
  call('/auth/reset/link', { body: { identifier: phone(n), mailboxProof, password: replacement }, expect });
const verifyProfile = account => call('/me', { token: account.token });
const journal = (uid) => persistence.one('SELECT * FROM firebase_email_attempts WHERE uid = ?', uid);
const recipientKey = value => createHmac('sha256', recipientSecret).update(value.toLowerCase()).digest('hex');
async function withDeadline(promise, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 4_000); })]);
  } finally { clearTimeout(timer); }
}
function observeClaim(email) {
  const original = persistence.run;
  const key = recipientKey(email);
  let found;
  const observed = new Promise(resolve => { found = resolve; });
  persistence.run = async function(sql, ...args) {
    const result = await original.call(this, sql, ...args);
    if (sql.includes("SET state = 'sending', cleanup_at = ?") && args[4] === key) found(result.changes);
    return result;
  };
  return { first: () => withDeadline(observed, 'Replacement did not try to claim the recipient'), restore() { persistence.run = original; } };
}
const mailFor = (to, kind = 'VERIFY_EMAIL') => waitFor(async () => {
  const mail = inbox.findLast(message => message.to === to && message.kind === kind);
  return mail && (await journal(mail.uid))?.state === 'ready' ? mail : undefined;
});
const clearLimits = prefix => persistence.run('DELETE FROM request_limits WHERE key LIKE ?', prefix + '%');
const verifyLimitKey = (bucket, value) => `recovery-verify-${bucket}:${createHash('sha256').update(value).digest('hex')}`;
async function verifyAccount(n) {
  const account = await register(n);
  await start(account);
  const mail = await mailFor(account.user.email);
  await confirm(account, verifyAction(mail));
  return account;
}
async function run(t, name, work) {
  if (selectedCase && !name.includes(selectedCase)) return;
  await t.test(name, { timeout: 12_000 }, async () => { address = `192.0.2.${++nextAddress}`; await work(); });
}

async function firebaseContracts(t) {
  await run(t, 'continuation page keeps the mailbox code outside network requests', async () => {
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/recovery-email#en.${'x'.repeat(32)}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-security-policy'), /script-src 'sha256-[A-Za-z0-9+/]+=*'/);
    assert.ok(!html.includes('x'.repeat(32)));
    assert.match(html, /history\.replaceState\(null, '', location\.pathname\)/);
  });
  await run(t, 'optional email and fresh credentials for recovery enrollment', async () => {
    assert.equal((await register(10, { email: 'invalid' }, 400)).error, 'invalid_email');
    const account = await register(10, { email: undefined });
    assert.equal(account.user.email, null);
    assert.equal((await edit(account, email(10), '', 401)).error, 'wrong_password');
    assert.equal((await edit(account, email(10))).user.email, email(10));
    assert.equal((await start(account, 'wrong-password', 401)).error, 'wrong_password');
    assert.equal((await confirm(account, 'x'.repeat(32), 401, 'wrong-password')).error, 'wrong_password');
  });
  await run(t, 'completed-order nudge is optional and excludes customers who already added email', async () => {
    const account = await register(9, { email: undefined });
    const driver = await register(11, { registrationRole: 'driver' });
    const now = Date.now();
    const order = await persistence.run(`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_note, dropoff_note,
      contact, detail, option, loading_help, price, status, created_at, updated_at)
      VALUES (?, 'parcel', 0, 'ramallah', 'nablus', '', '', '', '', 'small', 0, 20, 'searching', ?, ?)`, account.user.id, now, now);
    assert.equal((await verifyProfile(account)).capabilities.offerRecoveryEmail, undefined);
    await persistence.run("UPDATE orders SET status = 'completed', driver_id = ?, completed_at = ? WHERE id = ?", driver.user.id, now, order.lastInsertRowid);
    assert.equal((await verifyProfile(account)).capabilities.offerRecoveryEmail, true);
    await edit(account, email(9));
    assert.equal((await verifyProfile(account)).capabilities.offerRecoveryEmail, undefined);
  });
  await run(t, 'legacy verification timestamps and reset rows grant no recovery authority', async () => {
    const account = await register(1), uid = `wind-${account.user.id}`;
    users.set(uid, { localId: uid, email: email(1), password: replacement });
    await persistence.run('UPDATE users SET email_verified_at = ? WHERE id = ?', Date.now(), account.user.id);
    await persistence.run('INSERT INTO firebase_resets(user_id, requested_at) VALUES (?, ?)', account.user.id, Date.now());
    const from = calls.length;
    assert.equal((await verifyProfile(account)).user.emailVerifiedAt, null);
    assert.deepEqual(await reset(phone(1)), await reset('missing@example.test'));
    assert.equal((await login(1, replacement, 401)).error, 'wrong_credentials');
    await adopt(1, 'z'.repeat(32), 400);
    assert.equal(calls.length, from, 'legacy evidence never reaches the provider');
  });
  await run(t, 'mailbox code, Firebase action, and initiating session are each required', async () => {
    const account = await register(2), otherSession = await login(2);
    assert.equal(account.capabilities.emailVerificationLink, true);
    assert.deepEqual(await start(account), { sent: true });
    const mail = await mailFor(email(2));
    assert.equal(await persistence.one('SELECT 1 FROM email_codes WHERE user_id = ?', account.user.id), undefined, 'legacy numeric slot never holds a Firebase marker');
    assert.equal(mail.locale, 'en');
    assert.equal(mail.admin, false, 'VERIFY_EMAIL uses the password sign-in ID token');
    const code = new URL(mail.continueUrl).hash.slice(4);
    await confirm(account, code, 400); // mailbox code without the Firebase action
    assert.equal(verifyAction(mail), code);
    await confirm(account, 'x'.repeat(32), 400); // Firebase emailVerified alone
    await confirm(otherSession, code, 400);
    const providerUser = users.get(mail.uid);
    providerUser.email = 'different@example.test';
    await confirm(account, code, 400);
    providerUser.email = email(2);
    assert.ok((await confirm(account, code)).user.emailVerifiedAt);
    await confirm(account, code, 400);
    await clearLimits('firebase-email-send-gap');
    const budgets = () => persistence.all('SELECT key, count FROM request_limits WHERE key IN (?, ?) ORDER BY key',
      verifyLimitKey('recipient', email(2)), verifyLimitKey('address', address));
    const before = await budgets();
    assert.equal(before.length, 2);
    assert.equal((await start(account, password, 409)).error, 'already_verified');
    assert.deepEqual(await budgets(), before);
  });
  await run(t, 'session revoked during provider lookup cannot commit verification', async () => {
    const account = await register(3);
    await start(account);
    const mail = await mailFor(email(3)), code = verifyAction(mail);
    const gate = pauseAt((action, body) => action === 'accounts:lookup' && body.localId[0] === mail.uid);
    const confirmation = confirm(account, code, 401);
    try {
      await Promise.race([gate.entered, confirmation]);
      await call('/auth/logout', { token: account.token, body: {} });
    } finally { gate.release(); }
    await confirmation;
    assert.equal((await login(3)).user.emailVerifiedAt, null);
  });
  await run(t, 'changing away and back needs a fresh attempt and action code', async () => {
    const account = await register(4);
    await start(account);
    const first = await mailFor(email(4));
    const oldProof = verifyAction(first);
    await edit(account, 'moved@example.test');
    await edit(account, email(4));
    await clearLimits('firebase-email-send-gap');
    await start(account);
    const second = await mailFor(email(4));
    assert.notEqual(second.uid, first.uid);
    const freshProof = verifyAction(second);
    await confirm(account, oldProof, 400);
    assert.ok((await confirm(account, freshProof)).user.emailVerifiedAt);
  });
  await run(t, 'provider membership and exact UID collision have the same accepted response', async () => {
    const normal = await register(5), occupied = await register(6), uidCollision = await register(7);
    const foreign = { localId: 'foreign', email: email(6), displayName: 'unrelated', emailVerified: true };
    users.set(foreign.localId, foreign);
    assert.deepEqual(await start(occupied), await start(normal));
    await mailFor(email(5));
    collisionEmail = email(7);
    try {
      const from = calls.length;
      assert.deepEqual(await start(uidCollision), { sent: true });
      const attempted = await waitFor(() => calls.slice(from).find(call => call.action === 'accounts:batchCreate' && call.body.users[0].email === email(7)));
      const { localId } = attempted.body.users[0];
      await waitFor(async () => (await journal(localId))?.state === 'reconcile');
      assert.equal(users.get(localId).displayName, 'foreign', 'the colliding user is never deleted');
      assert.equal(users.get(foreign.localId), foreign, 'the existing recipient user is never replaced');
    } finally { collisionEmail = undefined; }
  });
  await run(t, 'a lost provider create reply preserves enough ownership to clean up', async () => {
    const account = await register(22);
    const from = calls.length;
    loseCreateReply = email(22);
    try {
      await start(account);
      const created = await waitFor(() => calls.slice(from).find(call => call.action === 'accounts:batchCreate'));
      const { localId } = created.body.users[0];
      await waitFor(async () => !await journal(localId));
      assert.equal(users.has(localId), false);
      assert.equal(calls.slice(from).some(call => call.action === 'accounts:sendOobCode'), false);
    } finally { loseCreateReply = undefined; }
  });
  await run(t, 'a replacement waits when a provider create is missing from the first lookup', async () => {
    const account = await register(23);
    const recipient = email(23);
    let observer;
    const cleanup = firebaseReset.cleanup;
    let inspected;
    const cleanupResult = new Promise(resolve => { inspected = resolve; });
    firebaseReset.cleanup = async attempt => {
      const result = await cleanup(attempt);
      if (attempt.uid === hiddenUser?.localId) inspected(result);
      return result;
    };
    hideCreateReply = recipient;
    try {
      await start(account);
      await waitFor(() => hiddenUser);
      const oldUid = hiddenUser.localId;
      assert.equal(await withDeadline(cleanupResult, 'Cleanup did not check the ambiguous UID'), 'absent');
      assert.equal((await journal(oldUid)).state, 'retired');
      assert.equal(users.has(oldUid), false, 'the first cleanup lookup cannot see the imported UID');
      const from = calls.length;
      await clearLimits('firebase-email-send-gap');
      observer = observeClaim(recipient);
      await start(account);
      assert.equal(await observer.first(), 0);
      assert.equal(calls.slice(from).some(call => call.action === 'accounts:batchCreate'), false);
      users.set(oldUid, hiddenUser);
      hideCreateReply = undefined;
      await persistence.run('UPDATE firebase_email_attempts SET cleanup_at = 0 WHERE uid = ?', oldUid);
      const replacementMail = await mailFor(recipient);
      assert.notEqual(replacementMail.uid, oldUid);
      assert.equal(users.has(oldUid), false, 'cleanup ran before the replacement import');
    } finally {
      observer?.restore();
      firebaseReset.cleanup = cleanup;
      hideCreateReply = undefined;
      hiddenUser = undefined;
    }
  });
  await run(t, 'fresh Entra proof frees the pending verification address for reset', async () => {
    const account = await register(24);
    await start(account);
    const verifyMail = await mailFor(email(24));
    const oid = 'entra-mailbox-proof', nonce = 'entra-test-nonce';
    await persistence.run('UPDATE users SET entra_oid = ? WHERE id = ?', oid, account.user.id);
    const exchanged = await call('/auth/entra', { body: { idToken: entraToken(oid, email(24), nonce), nonce } });
    assert.equal(exchanged.user.id, account.user.id);
    assert.ok(exchanged.user.emailVerifiedAt);
    assert.equal((await journal(verifyMail.uid)).state, 'retired');
    await reset(phone(24));
    const resetMail = await mailFor(email(24), 'PASSWORD_RESET');
    assert.notEqual(resetMail.uid, verifyMail.uid);
    assert.equal(users.has(verifyMail.uid), false);
  });
  await run(t, 'account deletion leaves only a keyed recipient for provider cleanup', async () => {
    const account = await register(25);
    await start(account);
    const oldMail = await mailFor(email(25));
    await call('/me/delete', { token: account.token, body: { password } });
    const retired = await journal(oldMail.uid);
    assert.equal(retired.state, 'retired');
    assert.equal(retired.recipient_key, recipientKey(email(25)));
    assert.equal(JSON.stringify(retired).includes(email(25)), false);
    const next = await register(26, { email: email(25) });
    await start(next);
    const nextMail = await mailFor(email(25));
    assert.notEqual(nextMail.uid, oldMail.uid);
    assert.equal(users.has(oldMail.uid), false);
  });
  await run(t, 'recipient and trusted client budgets survive moving an address between accounts', async () => {
    const accounts = [];
    for (let n = 12; n <= 17; n++) accounts.push(await register(n));
    const shared = 'normalized@example.test';
    for (const account of accounts.slice(0, 5)) {
      await edit(account, shared.toUpperCase());
      await start(account);
      await edit(account, email(account.user.id + 35));
    }
    await edit(accounts[5], shared);
    assert.equal((await start(accounts[5], password, 429)).error, 'too_many_attempts');
    for (let index = 0; index < 15; index++) {
      const account = accounts[index % 5];
      await clearLimits('firebase-email-send-gap');
      await start(account);
    }
    await edit(accounts[5], 'different-budget@example.test');
    await start(accounts[5], password, 429);
  });
  await run(t, 'project mismatch cannot send password-reset mail', async () => {
    const account = await verifyAccount(18);
    project = 'other-project';
    try {
      const from = calls.length;
      assert.deepEqual(await reset(phone(18)), { ok: true });
      const created = await waitFor(() => calls.slice(from).find(call => call.action === 'accounts:batchCreate' && call.body.users[0].email === email(18)));
      await waitFor(async () => (await journal(created.body.users[0].localId))?.state !== 'sending');
      assert.equal(calls.slice(from).filter(call => call.action === 'accounts:sendOobCode'
        && call.body.requestType === 'PASSWORD_RESET').length, 0);
      assert.equal((await verifyProfile(account)).user.email, email(18));
    } finally { project = 'wind-test'; }
  });
  await run(t, 'a failed send during an address edit leaves a durable cleanup journal', async () => {
    const account = await register(19);
    failMail = true; failDelete = true;
    const gate = pauseAt((action, body) => action === 'accounts:sendOobCode' && body.requestType === 'VERIFY_EMAIL');
    try {
      await start(account);
      await gate.entered;
      await edit(account, 'replacement@example.test');
    } finally { gate.release(); }
    const uid = [...users.values()].find(user => user.email === email(19)).localId;
    try {
      await waitFor(() => calls.some(call => call.action === 'accounts:delete' && call.body.localId === uid));
      assert.equal((await journal(uid)).state, 'retired');
      assert.ok(users.has(uid));
    } finally { failMail = false; failDelete = false; }
    Object.assign(users.get(uid), { displayName: 'Updated in Firebase', email: 'changed-in-firebase@example.test' });
    await persistence.run('UPDATE firebase_email_attempts SET cleanup_at = 0 WHERE uid = ?', uid);
    const restarted = firebaseEmailService(persistence, createFirebaseReset(), process.env.WIND_FIREBASE_EMAIL_CONTINUE_URL);
    await restarted.sweep(); // a new service instance recovers solely from persisted state
    assert.equal(await journal(uid), undefined);
    assert.equal(users.has(uid), false);
  });
  await run(t, 'a replacement reset queues while another sweep still owns the old address', async () => {
    await verifyAccount(20);
    await reset(phone(20));
    const old = await mailFor(email(20), 'PASSWORD_RESET');
    await persistence.run('UPDATE firebase_email_attempts SET cleanup_at = 0, expires_at = 0 WHERE uid = ?', old.uid);
    await clearLimits('firebase-reset-send-gap');
    const gate = pauseAt((action, body) => action === 'accounts:delete' && body.localId === old.uid);
    const sweep = sweepFirebaseResets();
    const observer = observeClaim(email(20));
    try {
      await withDeadline(gate.entered, 'The old provider deletion never started');
      const from = calls.length;
      await reset(phone(20));
      assert.equal(await observer.first(), 0);
      assert.ok(users.has(old.uid), 'the provider has not released the address yet');
      assert.equal(calls.slice(from).some(call => call.action === 'accounts:batchCreate'), false);
    } finally { observer.restore(); gate.release(); }
    await sweep;
    const fresh = await mailFor(email(20), 'PASSWORD_RESET');
    assert.notEqual(fresh.uid, old.uid);
    assert.equal(fresh.admin, true, 'mail is restricted to the service-account project');
    const request = calls.findLast(call => call.action === 'accounts:sendOobCode');
    assert.equal(request.body.userIp, address, 'project reset uses the trusted client address');
    assert.ok(users.has(fresh.uid));
    assert.equal(await journal(old.uid), undefined);
  });
  await run(t, 'an expired sender cannot overwrite a cleanup claim', async () => {
    const account = await register(27);
    const sending = pauseAt((action, body) => action === 'accounts:sendOobCode' && body.email === email(27));
    await start(account);
    await sending.entered;
    const uid = [...users.values()].find(user => user.email === email(27)).localId;
    await persistence.run('UPDATE firebase_email_attempts SET cleanup_at = 0 WHERE uid = ?', uid);
    const deleting = pauseAt((action, body) => action === 'accounts:delete' && body.localId === uid);
    const sweeping = sweepFirebaseResets();
    const originalRun = persistence.run;
    try {
      await deleting.entered;
      const cleanupClaim = (await journal(uid)).cleanup_at;
      let finish;
      const finalized = new Promise(resolve => { finish = resolve; });
      persistence.run = async function(sql, ...args) {
        const result = await originalRun.call(this, sql, ...args);
        if (sql.includes('retry_until = CASE') && args[2] === uid) finish(result);
        return result;
      };
      sending.release();
      assert.equal((await withDeadline(finalized, 'The expired sender never attempted finalization')).changes, 0);
      assert.equal((await journal(uid)).cleanup_at, cleanupClaim);
    } finally {
      persistence.run = originalRun;
      sending.release();
      deleting.release();
      await sweeping;
    }
    assert.equal(await journal(uid), undefined);
    assert.equal(users.has(uid), false);
  });
  await run(t, 'only explicit reset adoption with the mailbox code changes the password and revokes sessions', async () => {
    const account = await verifyAccount(21);
    await reset(phone(21));
    const mail = await mailFor(email(21), 'PASSWORD_RESET'), code = verifyAction(mail, replacement);
    const from = calls.length;
    await login(21, replacement, 401);
    await adopt(21, 'x'.repeat(32), 400);
    assert.equal(calls.length, from, 'login and invalid adoption do no provider work');
    await persistence.run('INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      'https://push.example.test/reset', account.user.id, 'key', 'auth', 'en', Date.now());
    const lookup = persistence.one;
    let gotSnapshot, release;
    const snapshotReady = new Promise(resolve => { gotSnapshot = resolve; });
    const paused = new Promise(resolve => { release = resolve; });
    persistence.one = async function (sql, ...args) {
      const row = await lookup.call(this, sql, ...args);
      if (sql === 'SELECT * FROM users WHERE phone = ?' && args[0] === phone(21)) {
        persistence.one = lookup;
        gotSnapshot();
        await paused;
      }
      return row;
    };
    const staleLogin = login(21, password, 401);
    try {
      await Promise.race([snapshotReady, staleLogin]);
      assert.deepEqual(await adopt(21, code), { ok: true });
    } finally {
      persistence.one = lookup;
      release();
    }
    await staleLogin;
    await call('/me', { token: account.token, expect: 401 });
    await adopt(21, code, 400);
    assert.equal((await login(21, replacement)).user.id, account.user.id);
    assert.equal(await persistence.one('SELECT 1 FROM push_subscriptions WHERE user_id = ?', account.user.id), undefined);
    await waitFor(async () => !await journal(mail.uid));
    assert.equal(users.has(mail.uid), false);
    assert.equal((await persistence.one("SELECT detail FROM security_events WHERE actor_id = ? AND action = 'FIREBASE_PASSWORD_RESET'", account.user.id)).detail, '{}');
    if (persistence.backend === 'postgres') {
      const event = await persistence.one(`SELECT actor_id, payload->>'systemPurpose' AS system_purpose FROM domain_events
        WHERE type = 'security.recorded' AND payload->>'action' = 'FIREBASE_PASSWORD_RESET' ORDER BY occurred_at DESC LIMIT 1`);
      assert.equal(event.actor_id, account.user.id);
      assert.equal(event.system_purpose, null);
    }
  });
}
async function cloudflareContracts() {
  assert.deepEqual(await call('/auth/options'), { registrationOpen: true, emailReset: true });
  const user = await register(1);
  const code = mail => /: (\d{6})/.exec(mail.body.text)[1];
  const welcome = await waitFor(() => calls.find(call => call.action === 'cloudflare'));
  assert.equal((await call('/me/email/code', { token: user.token, body: {}, expect: 426 })).error, 'client_update_required');
  assert.equal((await call('/me/email/verify', { token: user.token, body: { code: code(welcome) }, expect: 426 })).error, 'client_update_required');
  assert.equal((await call('/me/email', { token: user.token, body: { email: email(23) }, expect: 426 })).error, 'client_update_required');
  const otherSession = await login(1);
  await call('/me/email/verify', { token: otherSession.token, body: { current: password, code: code(welcome) }, expect: 400 });
  await call('/me/email/verify', { token: user.token, body: { current: password, code: code(welcome) } });
  assert.deepEqual(await reset(phone(1)), { ok: true });
  const recovery = await waitFor(() => calls.length === 2 && calls[1]);
  assert.deepEqual(await call('/auth/reset', { body: { identifier: phone(1), code: code(recovery), password: replacement } }), { ok: true });
  const recovered = await login(1, replacement);
  assert.equal(recovered.user.id, user.user.id);
  assert.ok(calls.every(call => call.action === 'cloudflare'));

  const addressKey = verifyLimitKey('address', address);
  const recipientKey = verifyLimitKey('recipient', email(3));
  await persistence.run('UPDATE request_limits SET count = 20 WHERE key = ?', addressKey);
  assert.equal((await call('/me/email/code', { token: recovered.token, body: { current: replacement }, expect: 409 })).error, 'already_verified');
  assert.equal((await persistence.one('SELECT count FROM request_limits WHERE key = ?', addressKey)).count, 20);
  const deniedByAddress = await register(2);
  await waitFor(async () => (await persistence.one('SELECT count FROM request_limits WHERE key = ?', addressKey))?.count === 21);
  assert.equal(deniedByAddress.user.email, email(2), 'a mail budget never rolls back registration');
  await persistence.run('INSERT INTO request_limits (key, count, until) VALUES (?, 5, ?)', recipientKey, Date.now() + 60_000);
  await register(3);
  await waitFor(async () => (await persistence.one('SELECT count FROM request_limits WHERE key = ?', recipientKey))?.count === 6);
  assert.equal(calls.filter(call => call.action === 'cloudflare').length, 2, 'both verification budgets apply to automatic mail');

  address = '192.0.2.2';
  const editing = await register(4, { email: undefined });
  await edit(editing, email(4));
  const originalOne = persistence.one;
  let arrive, release;
  const reserved = new Promise(resolve => { arrive = resolve; });
  const holdSend = new Promise(resolve => { release = resolve; });
  persistence.one = async function(sql, ...args) {
    if (sql.includes('SELECT 1 FROM email_codes') && args[0] === editing.user.id) {
      arrive();
      await holdSend;
    }
    return originalOne.call(this, sql, ...args);
  };
  const sending = call('/me/email/code', { token: editing.token, body: { current: password }, expect: 409 });
  try {
    await Promise.race([reserved, sending]);
    assert.ok(await persistence.one('SELECT code_hash FROM email_codes WHERE user_id = ?', editing.user.id));
    await edit(editing, email(28));
  } finally { persistence.one = originalOne; release(); }
  assert.equal((await sending).error, 'user_changed');
  assert.equal(await persistence.one('SELECT code_hash FROM email_codes WHERE user_id = ?', editing.user.id), undefined);
  assert.equal(calls.some(call => call.action === 'cloudflare' && call.body.to === email(4)), false);
}
try {
  if (cloudflare) await test('Cloudflare takes precedence', cloudflareContracts);
  else if (off) await test('Firebase credentials alone cannot enable reset', async () => {
    assert.deepEqual(await call('/auth/options'), { registrationOpen: true, emailReset: false });
    const account = await register(1);
    assert.equal(account.capabilities.emailVerificationLink, undefined);
    await start(account, password, 503);
    await call('/auth/reset/link/code', { body: { identifier: phone(1) }, expect: 503 });
    await adopt(1, 'x'.repeat(32), 503);
    assert.equal(calls.length, 0);
  });
  else if (verifyOnly) await test('Firebase verification and reset activate independently', async () => {
    assert.deepEqual(await call('/auth/options'), { registrationOpen: true, emailReset: false });
    await verifyAccount(1);
    const account = await register(9, { email: undefined });
    const driver = await register(11, { registrationRole: 'driver' });
    const now = Date.now();
    await persistence.run(`INSERT INTO orders (customer_id, driver_id, service, shared, pickup_city, dropoff_city, pickup_note,
      dropoff_note, contact, detail, option, loading_help, price, status, created_at, updated_at, completed_at)
      VALUES (?, ?, 'parcel', 0, 'ramallah', 'nablus', '', '', '', '', 'small', 0, 20, 'completed', ?, ?, ?)`, account.user.id, driver.user.id, now, now, now);
    const { capabilities } = await verifyProfile(account);
    assert.equal(capabilities.emailVerificationLink, true);
    assert.equal(capabilities.emailResetLinkProof, undefined);
    assert.equal(capabilities.offerRecoveryEmail, undefined);
    await call('/auth/reset/code', { body: { identifier: phone(1) }, expect: 503 });
    await call('/auth/reset/link/code', { body: { identifier: phone(1) }, expect: 503 });
    await adopt(1, 'x'.repeat(32), 503);
    assert.ok(inbox.every(mail => mail.kind === 'VERIFY_EMAIL'));
  });
  else await test('Firebase recovery email on ' + persistence.backend, firebaseContracts);
} finally {
  await shutdown();
  if (postgres) {
    try { await postgres.database.run(`DROP SCHEMA "${postgres.schema}" CASCADE`); }
    finally { await postgres.database.close(); }
  }
  globalThis.fetch = realFetch;
  rmSync(directory, { recursive: true, force: true });
}
if (!cloudflare && !off && !verifyOnly && !pg && !selectedCase) {
  for (const flag of ['--off', '--verify-only', '--cloudflare']) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), flag], { stdio: 'inherit' });
    assert.equal(child.status, 0, flag);
  }
}
