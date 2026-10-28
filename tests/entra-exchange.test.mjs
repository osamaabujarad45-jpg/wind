import assert from 'node:assert/strict';
import { createHash, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiCaller } from './support/api.mjs';
import { resetEntraJwksCache } from '../server/domain/entra.ts';

const tenantId = '11111111-2222-3333-4444-555555555555';
const clientId = 'test-client';
const authority = `https://windtest.ciamlogin.com/${tenantId}`;
const issuer = `https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`;
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'wind-entra-')), 'test.db');
process.env.WIND_IDENTITY_MODE = 'self-service';
process.env.WIND_ENTRA_TENANT_ID = tenantId;
process.env.WIND_ENTRA_TENANT_NAME = 'windtest';
process.env.WIND_ENTRA_CLIENT_ID = clientId;

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const realFetch = globalThis.fetch;
let providerDown = false;
globalThis.fetch = async (url, init) => {
  if (url === `${authority}/v2.0/.well-known/openid-configuration`)
    return { ok: !providerDown, json: async () => ({ issuer, jwks_uri: `${authority}/discovery/v2.0/keys` }) };
  if (url === `${authority}/discovery/v2.0/keys`) return { ok: true, json: async () => ({ keys: [jwk] }) };
  return realFetch(url, init);
};
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(claims) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', kid: 'test-key' });
  const body = b64({ iss: issuer, aud: clientId, exp: now + 600, iat: now, nonce: 'test-nonce',
    jti: randomUUID(), sub: claims.oid, ...claims });
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(privateKey).toString('base64url')}`;
}
const { server, db, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, resolve));
const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, realFetch);
const register = (phone, email) => call('/auth/register', { body: { phone, email, name: 'Rider', password: 'long-password-123', consent: true } });
const exchange = (claims, extra = {}, expect = 200) => call('/auth/entra', { body: { idToken: token(claims), nonce: 'test-nonce', ...extra }, expect });

try {
  resetEntraJwksCache();
  providerDown = true;
  const outageToken = token({ oid: 'after-outage', email: 'outage@example.com', email_verified: true, name: 'Outage Rider' });
  const outageBody = { idToken: outageToken, nonce: 'test-nonce', phone: '0599300106', email: 'outage@example.com', consent: true };
  assert.equal((await call('/auth/entra', { body: outageBody, expect: 503 })).error, 'entra_unavailable');
  const attemptKey = 'entra-attempt:' + createHash('sha256').update(outageToken.slice(-24)).digest('hex');
  assert.equal(db.prepare('SELECT count FROM request_limits WHERE key = ?').get(attemptKey), undefined, 'provider outage is not a bad-token attempt');
  providerDown = false;
  assert.equal((await call('/auth/entra', { body: outageBody })).user.email, 'outage@example.com', 'the same token can be exchanged after recovery');

  const existing = await register('0599300101', 'unverified@example.com');
  await exchange({ oid: 'attacker', email: 'unverified@example.com', email_verified: true }, {}, 403);
  assert.equal(db.prepare('SELECT entra_oid FROM users WHERE id = ?').get(existing.user.id).entra_oid, null,
    'a verified external address cannot take over an account that never verified it');

  db.prepare('UPDATE users SET entra_oid = ? WHERE id = ?').run('linked-user', existing.user.id);
  await exchange({ oid: 'linked-user', email: 'different@example.com', email_verified: true,
    phone_number: '+970599300102', phone_number_verified: true });
  const unchanged = db.prepare('SELECT phone_verified_at, email_verified_at FROM users WHERE id = ?').get(existing.user.id);
  assert.equal(unchanged.phone_verified_at, null, 'a different claimed phone cannot verify the stored phone');
  assert.equal(unchanged.email_verified_at, null, 'a different claimed email cannot verify the stored email');

  const verified = await register('0599300103', 'verified@example.com');
  db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(Date.now(), verified.user.id);
  await exchange({ oid: 'first-identity', email: 'verified@example.com', email_verified: true });
  await exchange({ oid: 'second-identity', email: 'verified@example.com', email_verified: true }, {}, 403);
  assert.equal(db.prepare('SELECT entra_oid FROM users WHERE id = ?').get(verified.user.id).entra_oid, 'first-identity',
    'a second external identity cannot replace the established link');

  assert.equal((await exchange({ oid: 'wrong-email', email: 'provider@example.com', email_verified: true, name: 'Rider' },
    { phone: '0599300107', email: 'typed@example.com', consent: true }, 400)).error, 'entra_email_mismatch');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE entra_oid = ?').get('wrong-email').n, 0);
  const created = await exchange({ oid: 'new-rider', email: 'new@example.com', email_verified: true, name: 'New Rider' },
    { phone: '0599300104', email: 'new@example.com', consent: true, registrationRole: 'driver', vehicle: 'car' });
  assert.equal(created.user.status, 'pending', 'driver approval is still required');
  const row = db.prepare('SELECT phone_verified_at, email_verified_at FROM users WHERE id = ?').get(created.user.id);
  assert.equal(row.phone_verified_at, null, 'a manually entered phone is never treated as verified');
  assert.ok(row.email_verified_at, 'the attested email can satisfy contact verification');
  await exchange({ oid: 'another-rider', email: 'other@example.com', email_verified: true },
    { phone: '0599300104', consent: true }, 403);
  await exchange({ oid: 'no-proof', email: 'unknown@example.com', email_verified: false },
    { phone: '0599300105', consent: true }, 400);
  console.log('Entra exchange: account linking, contact proof, and email-based registration passed');
} finally {
  globalThis.fetch = realFetch;
  await shutdown();
}
