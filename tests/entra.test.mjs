import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { entraConfig, resetEntraJwksCache, verifyEntraIdToken } from '../server/domain/entra.ts';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', alg: 'RS256', use: 'sig' };
const config = {
  tenantId: '11111111-2222-3333-4444-555555555555',
  clientId: 'wind-client-id',
  issuer: 'https://11111111-2222-3333-4444-555555555555.ciamlogin.com/11111111-2222-3333-4444-555555555555/v2.0',
  metadataUrl: 'https://windtest.ciamlogin.com/11111111-2222-3333-4444-555555555555/v2.0/.well-known/openid-configuration',
  jwksUrl: 'https://windtest.ciamlogin.com/11111111-2222-3333-4444-555555555555/discovery/v2.0/keys',
};
const metadata = { issuer: config.issuer, jwks_uri: config.jwksUrl };
const fetchImpl = async (url) => ({ ok: true, json: async () => url === config.metadataUrl ? metadata : ({ keys: [jwk] }) });
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(claims, header = {}) {
  const head = b64({ alg: 'RS256', kid: 'test-key-1', typ: 'JWT', ...header });
  const body = b64(claims);
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(privateKey).toString('base64url')}`;
}
const now = Date.now();
const base = {
  iss: config.issuer, aud: config.clientId, exp: Math.floor(now / 1000) + 600, iat: Math.floor(now / 1000),
  oid: 'oid-123', sub: 'sub-123', name: 'Test Rider', email: 'rider@example.com', email_verified: true,
  phone_number: '+970599000000', phone_number_verified: true, nonce: 'nonce-1', jti: 'token-id-1',
};

resetEntraJwksCache();
const claims = await verifyEntraIdToken(sign(base), config, { nonce: 'nonce-1', fetchImpl, now });
assert.equal(claims.oid, 'oid-123');
assert.equal(claims.phone, '+970599000000');
assert.equal(claims.phoneVerified, true);
assert.equal(claims.emailVerified, true);
assert.equal(claims.tokenId, 'token-id-1');
assert.ok(claims.expiresAt > now);

// Key rotation: an unknown kid must refetch the JWKS once, not fail until the TTL.
resetEntraJwksCache();
let fetches = 0;
const rotatingFetch = async (url) => {
  if (url === config.metadataUrl) return { ok: true, json: async () => metadata };
  fetches += 1;
  return { ok: true, json: async () => ({ keys: fetches === 1 ? [] : [jwk] }) };
};
await assert.rejects(verifyEntraIdToken(sign(base), config, { nonce: 'nonce-1', fetchImpl: rotatingFetch, now }), /entra_unavailable/);
resetEntraJwksCache();
fetches = 0;
const staleThenFresh = async (url) => {
  if (url === config.metadataUrl) return { ok: true, json: async () => metadata };
  fetches += 1;
  return { ok: true, json: async () => ({ keys: fetches === 1 ? [{ ...jwk, kid: 'retired-key' }] : [jwk] }) };
};
const rotated = await verifyEntraIdToken(sign(base), config, { nonce: 'nonce-1', fetchImpl: staleThenFresh, now });
assert.equal(rotated.oid, 'oid-123');
assert.equal(fetches, 2);

// Unknown-kid flood: after one rotation refetch, further unknown kids must not
// each force an upstream fetch (forged-token DoS against Entra throttling).
resetEntraJwksCache();
let missFetches = 0;
const warmFetch = async (url) => {
  if (url === config.metadataUrl) return { ok: true, json: async () => metadata };
  missFetches += 1;
  return { ok: true, json: async () => ({ keys: [jwk] }) };
};
await verifyEntraIdToken(sign(base), config, { nonce: 'nonce-1', fetchImpl: warmFetch, now });
const warmCount = missFetches;
await assert.rejects(verifyEntraIdToken(sign(base, { kid: 'bogus-1' }), config, { fetchImpl: warmFetch, now }), /invalid_token/);
const afterFirstMiss = missFetches;
await assert.rejects(verifyEntraIdToken(sign(base, { kid: 'bogus-2' }), config, { fetchImpl: warmFetch, now }), /invalid_token/);
assert.equal(missFetches, afterFirstMiss, 'second unknown kid must be served from the miss cooldown, not upstream');
assert.ok(afterFirstMiss <= warmCount + 1, 'first unknown kid refetches at most once');

await assert.rejects(verifyEntraIdToken(sign({ ...base, nonce: 'other' }), config, { nonce: 'nonce-1', fetchImpl, now }), /invalid_token/);
await assert.rejects(verifyEntraIdToken(sign({ ...base, aud: 'someone-else' }), config, { fetchImpl, now }), /invalid_token/);
await assert.rejects(verifyEntraIdToken(sign({ ...base, iss: 'https://evil.example/v2.0' }), config, { fetchImpl, now }), /invalid_token/);
await assert.rejects(verifyEntraIdToken(sign({ ...base, exp: Math.floor(now / 1000) - 10 }), config, { fetchImpl, now }), /invalid_token/);
const [head, , signature] = sign(base).split('.');
await assert.rejects(verifyEntraIdToken(`${head}.${b64({ ...base, oid: 'attacker' })}.${signature}`, config, { fetchImpl, now }), /invalid_token/);
await assert.rejects(verifyEntraIdToken(sign(base, { alg: 'HS256' }), config, { fetchImpl, now }), /invalid_token/);
await assert.rejects(verifyEntraIdToken('not-a-jwt', config, { fetchImpl, now }), /invalid_token/);

// Config is env-derived only: unset stays dark, hostile authority hosts are refused.
assert.equal(entraConfig({}), null);
assert.throws(() => entraConfig({ WIND_ENTRA_TENANT_ID: 'tenant', WIND_ENTRA_CLIENT_ID: 'client' }), /tenant directory ID/);
assert.throws(() => entraConfig({ WIND_ENTRA_TENANT_ID: config.tenantId, WIND_ENTRA_TENANT_NAME: 'evil.example', WIND_ENTRA_CLIENT_ID: 'client' }), /tenant directory ID/);
const configured = entraConfig({ WIND_ENTRA_TENANT_ID: config.tenantId, WIND_ENTRA_TENANT_NAME: 'windtest.ciamlogin.com', WIND_ENTRA_CLIENT_ID: config.clientId });
assert.deepEqual(configured, config);
resetEntraJwksCache();
await assert.rejects(verifyEntraIdToken(sign(base), config, { fetchImpl: async () => ({ ok: true, json: async () => ({ ...metadata, jwks_uri: 'https://evil.example/keys' }) }), now }), /entra_unavailable/);

console.log('entra.test.mjs passed');
