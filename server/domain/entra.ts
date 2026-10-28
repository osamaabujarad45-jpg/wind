import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

// Microsoft Entra External ID (CIAM) ID-token verification for the BFF exchange.
// Builtins only: the API core ships without npm dependencies. The issuer and JWKS
// endpoints are derived exclusively from operator env (never from client input),
// so a caller cannot point verification at an attacker-controlled key set.
export type EntraConfig = {
  tenantId: string;
  clientId: string;
  issuer: string;
  metadataUrl: string;
  jwksUrl: string;
};

export type EntraClaims = {
  oid: string;
  tokenId: string;
  expiresAt: number;
  subject: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
};

type FetchImpl = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<any> }>;

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function entraConfig(env: NodeJS.ProcessEnv = process.env): EntraConfig | null {
  const tenantId = env.WIND_ENTRA_TENANT_ID?.trim() ?? '';
  const tenantName = (env.WIND_ENTRA_TENANT_NAME?.trim() ?? '').replace(/\.ciamlogin\.com$/i, '').toLowerCase();
  const clientId = env.WIND_ENTRA_CLIENT_ID?.trim() ?? '';
  if (!tenantId && !tenantName && !clientId) return null;
  if (!TENANT_ID.test(tenantId) || !TENANT_NAME.test(tenantName) || !clientId)
    throw new Error('Entra requires a tenant directory ID, tenant name and client ID');
  const id = tenantId.toLowerCase();
  const authority = `https://${tenantName}.ciamlogin.com/${id}`;
  return {
    tenantId: id, clientId,
    // CIAM's discovery host uses the tenant name; its issuer uses the directory ID.
    issuer: `https://${id}.ciamlogin.com/${id}/v2.0`,
    metadataUrl: `${authority}/v2.0/.well-known/openid-configuration`,
    jwksUrl: `${authority}/discovery/v2.0/keys`,
  };
}

const b64urlJson = (part: string): Record<string, any> => {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); }
  catch { throw new Error('invalid_token'); }
};

let jwksCache: { url: string; keys: Map<string, any>; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60_000;

async function fetchJwks(config: EntraConfig, fetchImpl: FetchImpl) {
  const metadataResponse = await fetchImpl(config.metadataUrl, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const metadata = metadataResponse?.ok ? await metadataResponse.json().catch(() => null) : null;
  // Pin both values to this tenant before fetching keys; never follow metadata to
  // another tenant or accept a token issuer derived from untrusted input.
  if (metadata?.issuer !== config.issuer || metadata?.jwks_uri !== config.jwksUrl) throw new Error('entra_unavailable');
  const res = await fetchImpl(config.jwksUrl, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) throw new Error('entra_unavailable');
  const body = await res.json().catch(() => null);
  const keys = new Map<string, any>();
  for (const key of Array.isArray(body?.keys) ? body.keys : []) if (key?.kid) keys.set(String(key.kid), key);
  if (!keys.size) throw new Error('entra_unavailable');
  jwksCache = { url: config.jwksUrl, keys, fetchedAt: Date.now() };
}

async function jwkFor(config: EntraConfig, kid: string, fetchImpl: FetchImpl) {
  const stale = !jwksCache || jwksCache.url !== config.jwksUrl || Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS;
  if (stale) await fetchJwks(config, fetchImpl);
  let jwk = jwksCache!.keys.get(kid);
  if (!jwk) {
    // Key rotation: an unknown kid refetches once instead of failing until the TTL.
    await fetchJwks(config, fetchImpl);
    jwk = jwksCache!.keys.get(kid);
  }
  if (!jwk) throw new Error('invalid_token');
  return jwk;
}

// Test seam: reset the module JWKS cache between cases.
export function resetEntraJwksCache() { jwksCache = null; }

export async function verifyEntraIdToken(
  token: string,
  config: EntraConfig,
  options: { nonce?: string; fetchImpl?: FetchImpl; now?: number } = {},
): Promise<EntraClaims> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (typeof token !== 'string' || token.length > 8192) throw new Error('invalid_token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_token');
  const header = b64urlJson(parts[0]);
  const claims = b64urlJson(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) throw new Error('invalid_token');
  const jwk = await jwkFor(config, header.kid, fetchImpl);
  let publicKey;
  try { publicKey = createPublicKey({ key: jwk, format: 'jwk' }); } catch { throw new Error('invalid_token'); }
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii');
  const signature = Buffer.from(parts[2], 'base64url');
  let valid = false;
  try { valid = cryptoVerify('RSA-SHA256', signed, publicKey, signature); } catch { valid = false; }
  if (!valid) throw new Error('invalid_token');
  if (claims.iss !== config.issuer) throw new Error('invalid_token');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.clientId)) throw new Error('invalid_token');
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) throw new Error('invalid_token');
  if (typeof claims.iat !== 'number' || claims.iat > nowSeconds + 300) throw new Error('invalid_token');
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > nowSeconds + 300)) throw new Error('invalid_token');
  if (options.nonce !== undefined && claims.nonce !== options.nonce) throw new Error('invalid_token');
  const oid = typeof claims.oid === 'string' && claims.oid ? claims.oid
    : typeof claims.sub === 'string' ? claims.sub : '';
  if (!oid) throw new Error('invalid_token');
  const email = typeof claims.email === 'string' && claims.email.includes('@') ? claims.email.toLowerCase() : null;
  const phone = typeof claims.phone_number === 'string' && claims.phone_number.trim() ? claims.phone_number.trim() : null;
  return {
    oid,
    tokenId: typeof claims.jti === 'string' && claims.jti ? claims.jti : '',
    expiresAt: claims.exp * 1000,
    subject: String(claims.sub ?? oid),
    name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 60) : null,
    email,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    phone,
    phoneVerified: claims.phone_number_verified === true || claims.phone_number_verified === 'true',
  };
}

type Row = Record<string, any>;
type Register = (method: string, path: string, handler: (ctx: { body: Row }) => Promise<unknown>, isPublic?: boolean) => unknown;

// Public boundary: the ID token itself is the credential; account linking and
// session minting stay in the API composition root (server/main.ts).
export function registerEntraRoutes(route: Register, exchange: (ctx: { body: Row }) => Promise<unknown>) {
  route('POST', '/api/auth/entra', exchange, true);
}
