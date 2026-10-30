// Email codes over Amazon SES v2 (WIND_EMAIL_PROVIDER=ses): signed request shape, delivery, provider-failure honesty.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
import { sesConfig, signedHeaders } from '../server/ses.ts';

// The signer against botocore's SigV4Auth for the same request (fixed time; generated offline, 30 Oct 2026).
const vectorBody = JSON.stringify({ FromEmailAddress: 'no-reply@wind.example', Destination: { ToAddresses: ['user@mail.example'] },
  Content: { Simple: { Subject: { Data: 'رمز 123456', Charset: 'UTF-8' } } } });
const vectorUrl = new URL('https://email.eu-north-1.amazonaws.com/v2/email/outbound-emails');
const keys = { region: 'eu-north-1', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
const at = new Date(Date.UTC(2026, 9, 30, 11, 56, 5));
assert.deepEqual(signedHeaders(keys, vectorUrl, vectorBody, 'ses', at), { 'content-type': 'application/json', 'x-amz-date': '20261030T115605Z',
  authorization: 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261030/eu-north-1/ses/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=07fea6c8e3a55211c7ee79d58a7650e02ef80522018a277d60d33e301826a5a9' });
assert.equal(signedHeaders({ ...keys, sessionToken: 'session-token-example' }, vectorUrl, vectorBody, 'ses', at).authorization,
  'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261030/eu-north-1/ses/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-security-token, Signature=848db6a729da4e4e4d7296d3d10517168c628f71964e5d525e40fa6b13f884e3');
// Off until a Region and both key halves exist.
assert.equal(sesConfig({ AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' }), null);
assert.equal(sesConfig({ AWS_REGION: 'eu-north-1', AWS_ACCESS_KEY_ID: 'a' }), null);
assert.equal(sesConfig({ AWS_REGION: 'email.evil.example/', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' }), null);
assert.equal(sesConfig({ AWS_REGION: 'eu-north-1', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' }).endpoint, 'https://email.eu-north-1.amazonaws.com');

// Fake SES: records each send; 'reject' answers like the sandbox refusing an unverified recipient.
const inbox = [];
let mode = 'ok';
const ses = createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    const body = JSON.parse(raw);
    inbox.push({ path: req.url, method: req.method, headers: req.headers, body, to: body.Destination.ToAddresses[0] });
    if (mode === 'reject') return res.writeHead(400, { 'x-amzn-ErrorType': 'MessageRejected' }).end(JSON.stringify({ message: 'Email address is not verified.' }));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ MessageId: `m-${inbox.length}` }));
  });
});
await new Promise(resolve => ses.listen(0, '127.0.0.1', resolve));
const dir = mkdtempSync(join(tmpdir(), 'wind-email-ses-'));
for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_TOKEN', 'AWS_SESSION_TOKEN']) delete process.env[key];
Object.assign(process.env, { DB_PATH: join(dir, 'test.db'), WIND_IDENTITY_MODE: 'self-service', WIND_ENABLED_SERVICES: 'parcel',
  WIND_EMAIL_PROVIDER: 'ses', WIND_EMAIL_FROM: 'no-reply@wind.example', AWS_REGION: 'eu-north-1', AWS_ACCESS_KEY_ID: 'AKIDTEST',
  AWS_SECRET_ACCESS_KEY: 'ses-test-secret', WIND_SES_ENDPOINT: `http://127.0.0.1:${ses.address().port}` });
const { server, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`);
async function mailTo(to, count = 1) {
  for (let i = 0; i < 100 && inbox.filter(m => m.to === to).length < count; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const mail = inbox.filter(m => m.to === to).at(-1);
  assert.ok(mail, `an email reached ${to}`);
  return { ...mail, code: /: (\d{6})/.exec(mail.body.Content.Simple.Body.Text.Data)[1] };
}

try {
  assert.deepEqual(await call('/auth/options'), { registrationOpen: true, emailReset: true });
  const user = await call('/auth/register', { body: { name: 'Ses User', email: 'ses1@mail.example', phone: '0599710001', password: 'Correct-Horse-12', consent: true } });
  assert.equal(user.emailCode, 'requested');
  const mail = await mailTo('ses1@mail.example');
  assert.equal(mail.method, 'POST');
  assert.equal(mail.path, '/v2/email/outbound-emails');
  assert.match(mail.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/eu-north-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.match(mail.headers['x-amz-date'], /^\d{8}T\d{6}Z$/);
  assert.equal(mail.body.FromEmailAddress, 'no-reply@wind.example');
  assert.deepEqual(mail.body.Destination, { ToAddresses: ['ses1@mail.example'] });
  const { Subject, Body } = mail.body.Content.Simple;
  assert.ok([Subject, Body.Text, Body.Html].every(part => part.Charset === 'UTF-8'));
  assert.ok(Subject.Data.startsWith('رمز ويند') && Subject.Data.includes(mail.code), 'Arabic subject is real Arabic, not mojibake');
  assert.ok(Body.Html.Data.includes(mail.code) && !JSON.stringify(user).includes(mail.code));
  assert.ok((await call('/me/email/verify', { token: user.token, body: { code: mail.code } })).user.emailVerifiedAt > 0);

  // Refusal (sandbox recipient, unverified sender, paused account): a clear error and no cooldown left behind.
  mode = 'reject';
  const second = await call('/auth/register', { body: { name: 'Ses Two', email: 'ses2@mail.example', phone: '0599710002', password: 'Correct-Horse-12', consent: true } });
  assert.equal(second.emailCode, 'requested', 'the asynchronous send is not reported as delivered');
  await mailTo('ses2@mail.example');
  assert.equal((await call('/me/email/code', { token: second.token, body: {}, expect: 503 })).error, 'email_unavailable');
  mode = 'ok';
  assert.deepEqual(await call('/me/email/code', { token: second.token, body: {} }), { sent: true });
  const retry = await mailTo('ses2@mail.example', 3);
  assert.ok((await call('/me/email/verify', { token: second.token, body: { code: retry.code } })).user.emailVerifiedAt > 0);
  console.log('SES email checks passed: SigV4 matches botocore vectors, signed SendEmail shape, UTF-8 Arabic copy, verify, refusal without cooldown');
} finally {
  await shutdown();
  ses.close();
  rmSync(dir, { recursive: true, force: true });
}
