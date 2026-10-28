// WP03: original legacy assertions; async PG setup/fixture hooks only.
import {freshPostgres,selectRuntime} from './pg-support.mjs';
const pg=await freshPostgres('email');await pg.database.close();selectRuntime(pg.schema);
// Email codes over Cloudflare Email Service (REST): verify the address, self-service password reset, support identity check.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';

// Fake Cloudflare: records each send; 'fail' answers like a sender that is not configured, 'bounce' bounces.
const inbox = [];
let mode = 'ok';
const cloudflare = createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    const mail = JSON.parse(raw);
    inbox.push({ ...mail, path: req.url, auth: req.headers.authorization });
    if (mode === 'fail') return res.writeHead(403).end(JSON.stringify({ success: false, errors: [{ code: 10204, message: 'email.sending.error.email.sender_not_configured' }] }));
    res.end(JSON.stringify({ success: true, errors: [], result: { delivered: mode === 'bounce' ? [] : [mail.to], permanent_bounces: mode === 'bounce' ? [mail.to] : [], queued: [] } }));
  });
});
await new Promise(resolve => cloudflare.listen(0, '127.0.0.1', resolve));
const dir = mkdtempSync(join(tmpdir(), 'wind-email-'));
Object.assign(process.env, { DB_PATH: join(dir, 'test.db'), WIND_IDENTITY_MODE: 'self-service', WIND_ENABLED_SERVICES: 'parcel',
  WIND_EMAIL_FROM: 'no-reply@wind.example', CLOUDFLARE_ACCOUNT_ID: 'acct123', CLOUDFLARE_EMAIL_TOKEN: 'cf-email-token',
  CLOUDFLARE_API_BASE: `http://127.0.0.1:${cloudflare.address().port}/client/v4` });
const { server, shutdown, promote } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
const password = 'Correct-Horse-12';
const register = (n, extra = {}) => call('/auth/register', { body: { name: `User ${n}`, email: `user${n}@mail.example`, phone: `059970000${n}`, password, consent: true, ...extra } });
// The sign-up email goes out after the reply; wait for it.
async function mailTo(to, count = 1) {
  for (let i = 0; i < 100 && inbox.filter(m => m.to === to).length < count; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const mail = inbox.filter(m => m.to === to).at(-1);
  assert.ok(mail, `an email reached ${to}`);
  return { ...mail, code: /: (\d{6})/.exec(mail.text)[1] };
}
const other = code => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

try {
  assert.deepEqual(await call('/auth/options'), { registrationOpen: true, emailReset: true });

  // Sign-up sends a code at once; the reply never carries it.
  const customer = await register(1);
  assert.equal(customer.emailCode, 'requested');
  assert.equal(customer.capabilities.emailVerification, true);
  assert.equal(customer.user.emailVerifiedAt, null);
  const welcome = await mailTo('user1@mail.example');
  assert.equal(welcome.path, '/client/v4/accounts/acct123/email/sending/send');
  assert.equal(welcome.auth, 'Bearer cf-email-token');
  assert.equal(welcome.from, 'no-reply@wind.example');
  assert.match(welcome.subject, new RegExp(welcome.code));
  assert.ok(welcome.html.includes(welcome.code) && !JSON.stringify(customer).includes(welcome.code));

  // A minute between codes; a wrong code is refused; the right one verifies once and for good.
  assert.equal((await call('/me/email/code', { token: customer.token, body: {}, expect: 429 })).error, 'code_recently_sent');
  assert.equal((await call('/me/email/verify', { token: customer.token, body: { code: other(welcome.code) }, expect: 400 })).error, 'wrong_email_code');
  assert.equal((await call('/me/email/verify', { token: customer.token, body: { code: 'abc' }, expect: 400 })).error, 'wrong_email_code');
  const verified = await call('/me/email/verify', { token: customer.token, body: { code: ` ${welcome.code} ` } });
  assert.ok(verified.user.emailVerifiedAt > 0);
  assert.ok((await call('/me/email/verify', { token: customer.token, body: { code: welcome.code } })).user.emailVerifiedAt, 'a repeat is harmless');
  assert.equal((await call('/me/email/code', { token: customer.token, body: {}, expect: 409 })).error, 'already_verified');

  // Five wrong tries void a code, even for the right digits afterwards.
  const driver = await register(2, { registrationRole: 'driver', vehicle: 'car' });
  const driverMail = await mailTo('user2@mail.example');
  for (let i = 0; i < 4; i++) assert.equal((await call('/me/email/verify', { token: driver.token, body: { code: other(driverMail.code) }, expect: 400 })).error, 'wrong_email_code');
  assert.equal((await call('/me/email/verify', { token: driver.token, body: { code: other(driverMail.code) }, expect: 400 })).error, 'code_expired');
  assert.equal((await call('/me/email/verify', { token: driver.token, body: { code: driverMail.code }, expect: 400 })).error, 'code_expired');

  // Provider refusal or a bounce: a clear error, and no cooldown left behind, so a retry can go out at once.
  mode = 'fail';
  const third = await register(3);
  await mailTo('user3@mail.example');
  assert.equal((await call('/me/email/code', { token: third.token, body: {}, expect: 503 })).error, 'email_unavailable');
  mode = 'bounce';
  assert.equal((await call('/me/email/code', { token: third.token, body: {}, expect: 422 })).error, 'email_bounced');
  mode = 'ok';
  assert.deepEqual(await call('/me/email/code', { token: third.token, body: {} }), { sent: true });
  await mailTo('user3@mail.example', 4);

  // A mistyped address is not a dead end: an unverified account changes it, and a new code goes to the new one.
  assert.equal((await call('/me/email', { token: third.token, body: { email: 'broken' }, expect: 400 })).error, 'invalid_email');
  assert.equal((await call('/me/email', { token: third.token, body: { email: 'user1@mail.example' }, expect: 409 })).error, 'email_taken'); // verified elsewhere
  assert.equal((await call('/me/email', { token: third.token, body: { email: 'User3b@mail.example' } })).user.email, 'user3b@mail.example');
  await call('/me/email/code', { token: third.token, body: {} });
  const moved3 = await mailTo('user3b@mail.example');
  assert.ok((await call('/me/email/verify', { token: third.token, body: { code: moved3.code } })).user.emailVerifiedAt);
  assert.equal((await call('/me/email', { token: third.token, body: { email: 'user3c@mail.example' }, expect: 409 })).error, 'already_verified');

  // A taken address (verified or not) cannot be signed up or switched to again.
  const owner = await register(4, { email: 'owner@mail.example' });
  await call('/auth/register', { body: { name: 'Late', email: 'OWNER@mail.example', phone: '0599700006', password, consent: true }, expect: 409 });
  assert.equal((await call('/me/email', { token: third.token, body: { email: 'owner@mail.example' }, expect: 409 })).error, 'already_verified');
  assert.equal((await call('/me/email', { token: owner.token, body: { email: 'user3b@mail.example' }, expect: 409 })).error, 'email_taken');

  // Password reset: only a verified address receives a code, and the answer never says whether an account exists.
  const sent = inbox.length;
  for (const identifier of ['0599700002', 'nobody@mail.example', '0599709999', '']) assert.deepEqual(await call('/auth/reset/code', { body: { identifier } }), { ok: true });
  assert.equal(inbox.length, sent, 'unverified and unknown accounts get nothing');
  assert.deepEqual(await call('/auth/reset/code', { body: { identifier: 'USER1@mail.example' } }), { ok: true });
  const reset = await mailTo('user1@mail.example', 2);
  assert.match(reset.text, /password reset code/);
  assert.equal((await call('/auth/reset', { body: { identifier: '0599700001', code: reset.code, password: 'short' }, expect: 400 })).error, 'weak_password');
  assert.equal((await call('/auth/reset', { body: { identifier: '0599700001', code: other(reset.code), password: 'New-Password-123' }, expect: 400 })).error, 'wrong_email_code');
  assert.equal((await call('/auth/reset', { body: { identifier: '0599700002', code: reset.code, password: 'New-Password-123' }, expect: 400 })).error, 'wrong_email_code');
  assert.equal((await call('/auth/reset', { body: { identifier: '0599709999', code: reset.code, password: 'short' }, expect: 400 })).error, 'weak_password', 'checked before any lookup');
  for (let i = 0; i < 5; i++) await call('/auth/login', { body: { identifier: '0599700001', password: 'not-it-at-all' }, expect: 401 });
  await call('/auth/login', { body: { identifier: '0599700001', password }, expect: 429 }); // a forgetful owner hit the limit
  assert.deepEqual(await call('/auth/reset', { body: { identifier: '0599700001', code: reset.code, password: 'New-Password-123' } }), { ok: true });
  await call('/me', { token: customer.token, expect: 401 }); // every old session ended
  await call('/auth/login', { body: { identifier: '0599700001', password }, expect: 401 });
  const signedIn = await call('/auth/login', { body: { identifier: 'user1@mail.example', password: 'New-Password-123' } });
  assert.equal((await call('/auth/reset', { body: { identifier: '0599700001', code: reset.code, password: 'Another-Pass-123' }, expect: 400 })).error, 'wrong_email_code', 'spent');

  // Support identity check: code to the verified email, read back by the caller; admins only; verified emails only.
  await call('/auth/register', { body: { name: 'Admin', email: 'admin@mail.example', phone: '0599700009', password, consent: true } });
  await promote('0599700009');
  const admin = await call('/auth/login', { body: { identifier: '0599700009', password } });
  const id = signedIn.user.id;
  await call(`/admin/users/${id}/identity-code`, { token: signedIn.token, body: {}, expect: 403 });
  assert.equal((await call(`/admin/users/${driver.user.id}/identity-code`, { token: admin.token, body: {}, expect: 409 })).error, 'email_not_verified');
  assert.deepEqual(await call(`/admin/users/${id}/identity-code`, { token: admin.token, body: {} }), { sent: true });
  const check = await mailTo('user1@mail.example', 3);
  assert.match(check.text, /Wind support is confirming it is you/);
  assert.equal((await call(`/admin/users/${id}/identity-check`, { token: admin.token, body: { code: other(check.code) }, expect: 400 })).error, 'wrong_email_code');
  assert.equal((await call(`/admin/users/${id}/identity-check`, { token: admin.token, body: { code: check.code } })).confirmed, true);
  assert.equal((await call(`/admin/users/${id}/identity-check`, { token: admin.token, body: { code: check.code }, expect: 400 })).error, 'code_expired');

  // A changed address is unverified, and a code sent to the old one no longer works.
  await new Promise(resolve => setTimeout(resolve, 0));
  const pending = inbox.length;
  await call(`/admin/users/${owner.user.id}/identity-code`, { token: admin.token, body: {}, expect: 409 }); // never verified
  assert.equal(inbox.length, pending);
  const edited = await call(`/admin/users/${id}`, { token: admin.token, method: 'PATCH', body: { email: 'moved@mail.example' } });
  assert.equal(edited.emailVerifiedAt, null);
  assert.deepEqual(await call('/auth/reset/code', { body: { identifier: 'moved@mail.example' } }), { ok: true });
  assert.equal(inbox.length, pending, 'no reset to an address nobody has verified');
  console.log('Email checks passed: sign-up code, verify, cooldown, wrong tries, provider failure, reset without account discovery, support identity check, address change');
} finally {
  await shutdown();
  cloudflare.close();

}
