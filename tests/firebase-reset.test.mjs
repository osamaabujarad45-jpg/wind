import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { apiCaller } from './support/api.mjs';

const cloudflareMode = process.argv.includes('--cloudflare');
const dir = mkdtempSync(join(tmpdir(), 'wind-firebase-reset-'));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, { NODE_ENV: 'test', DB_PATH: join(dir, 'test.db'), WIND_IDENTITY_MODE: 'self-service',
  WIND_FIREBASE_API_KEY: 'test-web-key', WIND_FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify({
    project_id: 'wind-test', client_email: 'service@wind-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  })).toString('base64') });
for (const key of ['WIND_EMAIL_FROM', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN', 'WIND_DATABASE_URL',
  'WIND_POSTGRES_STAGING', 'WIND_POSTGRES_TEST_ONLY', 'WIND_CONTACT_VERIFICATION_REQUIRED']) delete process.env[key];
if (cloudflareMode) Object.assign(process.env, { WIND_EMAIL_FROM: 'sender@example.test', CLOUDFLARE_ACCOUNT_ID: 'test', CLOUDFLARE_EMAIL_TOKEN: 'test' });

const realFetch = globalThis.fetch;
const calls = [], users = new Map();
let wrongLocalId = false, failSignIn = false, failDelete = false;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'api.cloudflare.com') {
    calls.push({ action: 'cloudflare', body: JSON.parse(options.body) });
    return Response.json({ success: true, result: {} });
  }
  if (!['identitytoolkit.googleapis.com', 'oauth2.googleapis.com'].includes(url.hostname)) return realFetch(input, options);
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal, 'provider call has a timeout');
  if (url.hostname === 'oauth2.googleapis.com') {
    const form = new URLSearchParams(options.body), parts = form.get('assertion').split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/identitytoolkit');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    assert.ok(verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url')));
    calls.push({ action: 'token' });
    return Response.json({ access_token: 'synthetic-token', expires_in: 3600 });
  }
  const body = JSON.parse(options.body);
  const action = url.pathname.split('/').at(-1);
  if (url.pathname.includes('/projects/')) assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
  else assert.equal(url.searchParams.get('key'), 'test-web-key');
  calls.push({ action, body, headers: options.headers });
  if (action === 'accounts:lookup') return Response.json({ users: [...users.values()].filter(user => body.email?.includes(user.email) || body.localId?.includes(user.localId)) });
  if (action === 'accounts:delete') {
    if (failDelete) return Response.json({ error: {} }, { status: 503 });
    users.delete(body.localId); return Response.json({});
  }
  if (action === 'accounts') { users.set(body.localId, { localId: body.localId, email: body.email, password: body.password }); return Response.json({ localId: body.localId }); }
  if (action === 'accounts:sendOobCode') return Response.json({});
  if (action === 'accounts:signInWithPassword') {
    if (failSignIn) throw new Error('synthetic provider outage');
    const user = [...users.values()].find(item => item.email === body.email && item.password === body.password);
    return user ? Response.json({ localId: wrongLocalId ? 'wind-other' : user.localId }) : Response.json({ error: {} }, { status: 400 });
  }
  throw new Error(`Unexpected provider endpoint ${url.pathname}`);
};

const { server, persistence, sweepFirebaseResets, shutdown } = await import('../server/main.ts');
const { createFirebaseReset } = await import('../server/domain/firebase-reset.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, realFetch);
const password = 'Old-Password-123', replacement = 'New-Password-123';
const register = n => call('/auth/register', { body: { name: `User ${n}`, phone: `059970000${n}`, email: `user${n}@example.test`, password, consent: true } });
async function waitFor(check) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('Detached reset did not finish');
}
const pending = id => persistence.one('SELECT * FROM firebase_resets WHERE user_id = ?', id);
const reset = (identifier, lang = 'en') => call('/auth/reset/code', { body: { identifier, lang } });
const login = (identifier, password, expect = 200) => call('/auth/login', { body: { identifier, password }, expect });

try {
  const serviceAccount = process.env.WIND_FIREBASE_SERVICE_ACCOUNT;
  process.env.WIND_FIREBASE_SERVICE_ACCOUNT = Buffer.from('not-json').toString('base64');
  assert.equal(createFirebaseReset(), null);
  process.env.WIND_FIREBASE_SERVICE_ACCOUNT = serviceAccount;
  delete process.env.WIND_FIREBASE_API_KEY;
  assert.equal(createFirebaseReset(), null);
  process.env.WIND_FIREBASE_API_KEY = 'test-web-key';
  const user = await register(1), id = user.user.id, uid = `wind-${id}`;
  // Firebase mode stays unverified on purpose: without a sending domain no pilot account can have a verified email, and the link proves it.
  if (cloudflareMode) await persistence.run('UPDATE users SET email_verified_at = ? WHERE id = ?', Date.now(), id);
  else assert.equal((await persistence.one('SELECT email_verified_at v FROM users WHERE id = ?', id)).v, null);
  if (cloudflareMode) {
    assert.deepEqual(await call('/auth/options'), { registrationOpen: true, emailReset: true });
    await waitFor(() => calls.some(c => c.action === 'cloudflare'));
    calls.length = 0;
    assert.deepEqual(await reset('0599700001'), { ok: true });
    await waitFor(() => calls.some(c => c.action === 'cloudflare'));
    assert.ok(calls.every(c => c.action === 'cloudflare'), 'Cloudflare takes precedence');
    const code = /: (\d{6})/.exec(calls[0].body.text)?.[1];
    assert.ok(code, 'Cloudflare still sends a six-digit code');
    assert.deepEqual(await call('/auth/reset', { body: { identifier: '0599700001', code, password: replacement } }), { ok: true });
    assert.equal((await login('0599700001', replacement)).user.id, id);
    await call('/me', { token: user.token, expect: 401 });
    assert.ok(calls.every(c => c.action === 'cloudflare'));
    assert.equal(await pending(id), undefined);
  } else {
    assert.deepEqual(await call('/auth/options'), { registrationOpen: true, emailReset: false, emailResetLink: true });
    assert.deepEqual(await reset('unknown@example.test'), { ok: true });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(calls.length, 0, 'unknown account contacts no provider');
    users.set(uid, { localId: uid, email: 'user1@example.test', password: 'discarded' });
    users.set('foreign-1', { localId: 'foreign-1', email: 'user1@example.test', password: 'theirs' }); // not ours: a reset must never delete it (strict review 8 Nov)
    assert.deepEqual(await reset('0599700001'), { ok: true });
    await waitFor(() => pending(id));
    assert.ok(users.has('foreign-1') && !calls.some(c => c.action === 'accounts:delete' && c.body.localId === 'foreign-1'), 'only wind- accounts are deleted');
    users.delete('foreign-1');
    assert.deepEqual(calls.filter(c => c.action !== 'token').map(c => c.action), ['accounts:lookup', 'accounts:delete', 'accounts', 'accounts:sendOobCode']);
    assert.equal(calls.find(c => c.action === 'accounts').body.localId, uid);
    assert.ok(calls.find(c => c.action === 'accounts').body.password.length >= 32);
    assert.equal(calls.find(c => c.action === 'accounts:sendOobCode').headers['X-Firebase-Locale'], 'en');
    assert.equal(calls.filter(c => c.action === 'token').length, 1, 'admin OAuth token is cached');
    users.get(uid).password = replacement;
    failSignIn = true;
    assert.equal((await login('0599700001', replacement, 401)).error, 'wrong_credentials');
    assert.ok(await pending(id), 'provider failure does not spend the reset');
    failSignIn = false;
    wrongLocalId = true;
    assert.equal((await login('0599700001', replacement, 401)).error, 'wrong_credentials');
    assert.ok(await pending(id));
    wrongLocalId = false;
    await persistence.run('INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'https://push.example.test/1', id, 'key', 'auth', 'en', Date.now());
    const signedIn = await login('0599700001', replacement);
    assert.equal(signedIn.user.id, id);
    await call('/me', { token: user.token, expect: 401 });
    assert.equal(await pending(id), undefined);
    assert.equal(await persistence.one('SELECT endpoint FROM push_subscriptions WHERE user_id = ?', id), undefined);
    assert.ok((await persistence.one('SELECT email_verified_at v FROM users WHERE id = ?', id)).v, 'the emailed link verified the address');
    await waitFor(() => !users.has(uid));
    assert.ok(calls.some(c => c.action === 'accounts:delete' && c.body.localId === uid));
    const audit = await persistence.one("SELECT detail FROM security_events WHERE actor_id = ? AND action = 'FIREBASE_PASSWORD_RESET'", id);
    assert.equal(audit?.detail, '{}', 'audit contains no personal data');
    calls.length = 0;
    assert.equal((await login('0599700001', password, 401)).error, 'wrong_credentials');
    assert.equal(calls.length, 0, 'no pending reset means no provider call');
    await persistence.run('INSERT INTO firebase_resets(user_id, requested_at) VALUES (?, ?)', id, Date.now() - 3_600_001);
    assert.equal((await login('user1@example.test', 'Wrong-Password-123', 401)).error, 'wrong_credentials');
    assert.equal(calls.length, 0, 'expired reset means no provider call');
    users.set(uid, { localId: uid, email: 'user1@example.test', password: replacement });
    await sweepFirebaseResets();
    assert.equal(await pending(id), undefined, 'sweep removes expired reset');
    assert.ok(!users.has(uid), 'sweep removes the Firebase user');

    const second = await register(2), secondId = second.user.id, secondUid = `wind-${secondId}`;
    await persistence.run('UPDATE users SET email_verified_at = ? WHERE id = ?', Date.now(), secondId);
    await reset('0599700002');
    await waitFor(() => pending(secondId));
    await call('/me/password', { token: second.token, body: { current: password, password: replacement } });
    assert.equal(await pending(secondId), undefined, 'password change clears pending authority');
    await waitFor(() => !users.has(secondUid));

    const third = await register(3), thirdId = third.user.id, thirdUid = `wind-${thirdId}`;
    await persistence.run('UPDATE users SET email_verified_at = ? WHERE id = ?', Date.now(), thirdId);
    await call('/auth/reset/code', { body: { identifier: '0599700003' } });
    await waitFor(() => pending(thirdId));
    assert.equal(calls.filter(c => c.action === 'accounts:sendOobCode').at(-1).headers['X-Firebase-Locale'], 'ar');
    await call('/me/delete', { token: third.token, body: { password } });
    assert.equal(await pending(thirdId), undefined, 'account deletion clears pending authority');
    await waitFor(() => !users.has(thirdUid));

    const fourth = await register(4), fourthId = fourth.user.id, fourthUid = `wind-${fourthId}`;
    await persistence.run('UPDATE users SET email_verified_at = ? WHERE id = ?', Date.now(), fourthId);
    await reset('0599700004');
    await waitFor(() => pending(fourthId));
    users.get(fourthUid).password = replacement;
    failDelete = true;
    assert.equal((await login('0599700004', replacement)).user.id, fourthId, 'cleanup failure does not undo adoption');
    assert.equal(await pending(fourthId), undefined);
    assert.ok(users.has(fourthUid), 'provider outage can leave a Firebase account behind');
    failDelete = false;
  }
} finally {
  await shutdown();
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
}
if (!cloudflareMode) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--cloudflare'], { stdio: 'inherit' });
  assert.equal(child.status, 0, 'Cloudflare precedence scenario');
}
