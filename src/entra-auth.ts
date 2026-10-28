import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

// Microsoft Entra External ID sign-in (authorization code + PKCE in the system
// browser). Dormant until both public values are configured; the password form
// remains the fallback, so an unconfigured build renders exactly as before.
const tenant = process.env.EXPO_PUBLIC_ENTRA_TENANT_ID?.trim() ?? '';
const tenantName = (process.env.EXPO_PUBLIC_ENTRA_TENANT_NAME?.trim() ?? '').replace(/\.ciamlogin\.com$/i, '').toLowerCase();
const clientId = process.env.EXPO_PUBLIC_ENTRA_CLIENT_ID?.trim() ?? '';
export const entraConfigured = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)
  && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(tenantName) && !!clientId;
WebBrowser.maybeCompleteAuthSession();

export type EntraTokens = { idToken: string; nonce: string };

export async function signInWithEntra(): Promise<EntraTokens | null> {
  if (!entraConfigured) return null;
  const authority = `https://${tenantName}.ciamlogin.com/${tenant.toLowerCase()}`;
  const discovery: AuthSession.DiscoveryDocument = {
    authorizationEndpoint: `${authority}/oauth2/v2.0/authorize`,
    tokenEndpoint: `${authority}/oauth2/v2.0/token`,
    revocationEndpoint: `${authority}/oauth2/v2.0/logout`,
  };
  const nonce = Crypto.randomUUID();
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ['openid', 'profile', 'email', 'phone'],
    redirectUri: AuthSession.makeRedirectUri({ scheme: 'wind', path: 'auth' }),
    usePKCE: true,
    extraParams: { nonce },
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) return null;
  const token = await AuthSession.exchangeCodeAsync(
    // SDK 57 has no typed codeVerifier on the exchange config; extraParams is its typed body channel.
    { clientId, code: result.params.code, redirectUri: request.redirectUri ?? '', extraParams: { code_verifier: request.codeVerifier ?? '' } },
    discovery,
  );
  if (!token.idToken) throw new Error('entra_no_id_token');
  return { idToken: token.idToken, nonce };
}
